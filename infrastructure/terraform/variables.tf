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
