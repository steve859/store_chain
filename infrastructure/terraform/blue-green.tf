# ASR-O2: Blue-Green Deployment Infrastructure
# Extends main.tf with ALB + two ECS services (blue/green) + Target Groups

# ─── Networking ──────────────────────────────────────────────────────────────

resource "aws_vpc" "main" {
  provider             = aws.primary
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name    = "store-chain-vpc"
    Project = "store-chain"
  }
}

resource "aws_subnet" "public_a" {
  provider                = aws.primary
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.1.0/24"
  availability_zone       = "${var.primary_region}a"
  map_public_ip_on_launch = true

  tags = { Name = "store-chain-public-a" }
}

resource "aws_subnet" "public_b" {
  provider                = aws.primary
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.2.0/24"
  availability_zone       = "${var.primary_region}b"
  map_public_ip_on_launch = true

  tags = { Name = "store-chain-public-b" }
}

resource "aws_subnet" "private_a" {
  provider          = aws.primary
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.10.0/24"
  availability_zone = "${var.primary_region}a"

  tags = { Name = "store-chain-private-a" }
}

resource "aws_subnet" "private_b" {
  provider          = aws.primary
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.11.0/24"
  availability_zone = "${var.primary_region}b"

  tags = { Name = "store-chain-private-b" }
}

resource "aws_internet_gateway" "igw" {
  provider = aws.primary
  vpc_id   = aws_vpc.main.id

  tags = { Name = "store-chain-igw" }
}

resource "aws_route_table" "public" {
  provider = aws.primary
  vpc_id   = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.igw.id
  }
}

resource "aws_route_table_association" "public_a" {
  provider       = aws.primary
  subnet_id      = aws_subnet.public_a.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table_association" "public_b" {
  provider       = aws.primary
  subnet_id      = aws_subnet.public_b.id
  route_table_id = aws_route_table.public.id
}

# ─── Security Groups ────────────────────────────────────────────────────────

resource "aws_security_group" "alb_sg" {
  provider    = aws.primary
  name_prefix = "store-chain-alb-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "store-chain-alb-sg" }
}

resource "aws_security_group" "ecs_sg" {
  provider    = aws.primary
  name_prefix = "store-chain-ecs-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb_sg.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = { Name = "store-chain-ecs-sg" }
}

resource "aws_security_group" "db_sg" {
  provider    = aws.primary
  name_prefix = "store-chain-db-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }

  tags = { Name = "store-chain-db-sg" }
}

resource "aws_security_group" "redis_sg" {
  provider    = aws.primary
  name_prefix = "store-chain-redis-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_sg.id]
  }

  tags = { Name = "store-chain-redis-sg" }
}

resource "aws_db_subnet_group" "db_subnet" {
  provider   = aws.primary
  name       = "store-chain-db-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

resource "aws_elasticache_subnet_group" "redis_subnet" {
  provider   = aws.primary
  name       = "store-chain-redis-subnet"
  subnet_ids = [aws_subnet.private_a.id, aws_subnet.private_b.id]
}

# ─── Application Load Balancer ──────────────────────────────────────────────

resource "aws_lb" "api_alb" {
  provider           = aws.primary
  name               = "store-chain-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb_sg.id]
  subnets            = [aws_subnet.public_a.id, aws_subnet.public_b.id]

  enable_deletion_protection = true

  tags = {
    Name    = "store-chain-alb"
    Project = "store-chain"
  }
}

# ─── Blue Target Group ──────────────────────────────────────────────────────

resource "aws_lb_target_group" "blue" {
  provider    = aws.primary
  name        = "store-chain-blue-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health/ready"
    port                = "3000"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name        = "store-chain-blue"
    Environment = "blue"
  }
}

# ─── Green Target Group ─────────────────────────────────────────────────────

resource "aws_lb_target_group" "green" {
  provider    = aws.primary
  name        = "store-chain-green-tg"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main.id
  target_type = "ip"

  health_check {
    enabled             = true
    path                = "/health/ready"
    port                = "3000"
    protocol            = "HTTP"
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 15
    matcher             = "200"
  }

  deregistration_delay = 30

  tags = {
    Name        = "store-chain-green"
    Environment = "green"
  }
}

# ─── ALB Listener ────────────────────────────────────────────────────────────

resource "aws_lb_listener" "https" {
  provider          = aws.primary
  load_balancer_arn = aws_lb.api_alb.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.acm_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn # Initial: blue is active
  }
}

resource "aws_lb_listener" "http_redirect" {
  provider          = aws.primary
  load_balancer_arn = aws_lb.api_alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ─── ECS Task Definition ────────────────────────────────────────────────────

resource "aws_ecs_task_definition" "backend" {
  provider                 = aws.primary
  family                   = "store-chain-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "store-chain-api"
      image     = "${var.ecr_repository_url}:latest"
      essential = true

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "TRACING_ENABLED", value = "true" },
        { name = "ELK_ENABLED", value = "true" },
      ]

      secrets = [
        { name = "DATABASE_URL", valueFrom = "${var.secrets_arn}:DATABASE_URL::" },
        { name = "REDIS_URL", valueFrom = "${var.secrets_arn}:REDIS_URL::" },
        { name = "JWT_SECRET", valueFrom = "${var.secrets_arn}:JWT_SECRET::" },
        { name = "PII_ENCRYPTION_KEY", valueFrom = "${var.secrets_arn}:PII_ENCRYPTION_KEY::" },
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/health/ready || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = "/ecs/store-chain-backend"
          "awslogs-region"        = var.primary_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])
}

# ─── ECS Blue Service ───────────────────────────────────────────────────────

resource "aws_ecs_service" "blue" {
  provider        = aws.primary
  name            = "store-chain-api-blue"
  cluster         = aws_ecs_cluster.backend_cluster.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 2
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.blue.arn
    container_name   = "store-chain-api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ─── ECS Green Service ──────────────────────────────────────────────────────

resource "aws_ecs_service" "green" {
  provider        = aws.primary
  name            = "store-chain-api-green"
  cluster         = aws_ecs_cluster.backend_cluster.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 0 # Initially inactive
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = [aws_subnet.private_a.id, aws_subnet.private_b.id]
    security_groups  = [aws_security_group.ecs_sg.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.green.arn
    container_name   = "store-chain-api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }
}

# ─── Auto Scaling ────────────────────────────────────────────────────────────

resource "aws_appautoscaling_target" "blue_scaling" {
  provider           = aws.primary
  max_capacity       = 6
  min_capacity       = 2
  resource_id        = "service/${aws_ecs_cluster.backend_cluster.name}/${aws_ecs_service.blue.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "blue_cpu" {
  provider           = aws.primary
  name               = "store-chain-blue-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.blue_scaling.resource_id
  scalable_dimension = aws_appautoscaling_target.blue_scaling.scalable_dimension
  service_namespace  = aws_appautoscaling_target.blue_scaling.service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# ─── IAM Roles ───────────────────────────────────────────────────────────────

resource "aws_iam_role" "ecs_execution" {
  provider = aws.primary
  name     = "store-chain-ecs-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_execution_policy" {
  provider   = aws.primary
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_secrets_access" {
  provider = aws.primary
  name     = "secrets-access"
  role     = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [var.secrets_arn]
      }
    ]
  })
}

resource "aws_iam_role" "ecs_task" {
  provider = aws.primary
  name     = "store-chain-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# ─── CloudWatch Log Group ───────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "backend_logs" {
  provider          = aws.primary
  name              = "/ecs/store-chain-backend"
  retention_in_days = 30

  tags = {
    Project = "store-chain"
  }
}

# ─── Outputs ─────────────────────────────────────────────────────────────────

output "alb_dns_name" {
  value       = aws_lb.api_alb.dns_name
  description = "ALB DNS name for the API"
}

output "blue_target_group_arn" {
  value       = aws_lb_target_group.blue.arn
  description = "ARN of the Blue target group"
}

output "green_target_group_arn" {
  value       = aws_lb_target_group.green.arn
  description = "ARN of the Green target group"
}

output "listener_arn" {
  value       = aws_lb_listener.https.arn
  description = "ARN of the ALB HTTPS listener"
}
