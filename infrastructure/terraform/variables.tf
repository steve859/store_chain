variable "primary_region" {
  description = "The primary AWS region for active infrastructure"
  type        = string
  default     = "ap-southeast-1" # Singapore
}

variable "secondary_region" {
  description = "The secondary AWS region for Disaster Recovery (DR)"
  type        = string
  default     = "ap-northeast-1" # Tokyo
}

variable "db_username" {
  description = "Master username for RDS Aurora"
  type        = string
  sensitive   = true
}

variable "db_password" {
  description = "Master password for RDS Aurora"
  type        = string
  sensitive   = true
}

# ASR-O2: Blue-Green Deployment variables

variable "ecr_repository_url" {
  description = "ECR repository URL for the backend Docker image"
  type        = string
  default     = "ghcr.io/steve859/store_chain/store-chain-backend"
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate for HTTPS"
  type        = string
  default     = ""
}

variable "secrets_arn" {
  description = "ARN of the Secrets Manager secret containing app secrets"
  type        = string
  default     = ""
}

variable "app_version" {
  description = "Application version tag for deployment"
  type        = string
  default     = "latest"
}
