# ASR-R1 & R2: Infrastructure as Code (Terraform)
# Multi-region HA, Automated Backups, and Failover

provider "aws" {
  region = var.primary_region
  alias  = "primary"
}

provider "aws" {
  region = var.secondary_region
  alias  = "secondary"
}

# 1. HA Database Cluster (Aurora PostgreSQL) with Cross-Region Read Replica
resource "aws_rds_cluster" "primary_db" {
  provider                = aws.primary
  cluster_identifier      = "store-chain-primary-db"
  engine                  = "aurora-postgresql"
  engine_version          = "14.5"
  database_name           = "storechain"
  master_username         = var.db_username
  master_password         = var.db_password
  backup_retention_period = 14 # Automated Backups
  preferred_backup_window = "02:00-03:00"
  storage_encrypted       = true
  skip_final_snapshot     = false
  
  # Enable Multi-AZ for local high availability
  vpc_security_group_ids  = [aws_security_group.db_sg.id]
  db_subnet_group_name    = aws_db_subnet_group.db_subnet.name
}

resource "aws_rds_cluster_instance" "primary_instances" {
  provider             = aws.primary
  count                = 2 # Multi-AZ High Availability
  identifier           = "store-chain-primary-instance-${count.index}"
  cluster_identifier   = aws_rds_cluster.primary_db.id
  instance_class       = "db.r6g.large"
  engine               = aws_rds_cluster.primary_db.engine
  engine_version       = aws_rds_cluster.primary_db.engine_version
}

# 2. Disaster Recovery: Cross-Region Replica (ASR-R2)
resource "aws_rds_cluster" "secondary_db" {
  provider                    = aws.secondary
  cluster_identifier          = "store-chain-secondary-db"
  engine                      = "aurora-postgresql"
  engine_version              = "14.5"
  replication_source_identifier = aws_rds_cluster.primary_db.arn
  storage_encrypted           = true
  skip_final_snapshot         = true
  
  depends_on = [aws_rds_cluster_instance.primary_instances]
}

resource "aws_rds_cluster_instance" "secondary_instance" {
  provider             = aws.secondary
  identifier           = "store-chain-secondary-instance"
  cluster_identifier   = aws_rds_cluster.secondary_db.id
  instance_class       = "db.r6g.large"
  engine               = aws_rds_cluster.secondary_db.engine
  engine_version       = aws_rds_cluster.secondary_db.engine_version
}

# 3. Redis Cluster for Pub/Sub and Cache (HA Multi-AZ)
resource "aws_elasticache_replication_group" "redis_cluster" {
  provider                    = aws.primary
  replication_group_id        = "store-chain-redis"
  description                 = "Redis cluster for event bus and caching"
  node_type                   = "cache.m6g.large"
  port                        = 6379
  parameter_group_name        = "default.redis7.cluster.on"
  automatic_failover_enabled  = true # High availability failover
  
  cluster_mode {
    replicas_per_node_group = 1
    num_node_groups         = 3
  }

  subnet_group_name          = aws_elasticache_subnet_group.redis_subnet.name
  security_group_ids         = [aws_security_group.redis_sg.id]
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
}

# 4. ECS Fargate Cluster for Backend Instances (Auto-scaling)
resource "aws_ecs_cluster" "backend_cluster" {
  provider = aws.primary
  name     = "store-chain-backend-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}
