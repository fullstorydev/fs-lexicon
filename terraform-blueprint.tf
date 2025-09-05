# ==============================================================================
# LEXICON TERRAFORM BLUEPRINT - MULTI-CLOUD DEPLOYMENT
# ==============================================================================
# Open-source infrastructure template for deploying serverless middleware
# Supports both standard webhook processing and optional MCP mode for AI agents
#
# CLOUD PROVIDER DEPLOYMENT:
# Set cloud_provider variable to deploy to your preferred platform:
# - terraform apply -var="cloud_provider=GCP"
# - terraform apply -var="cloud_provider=AWS" 
# - terraform apply -var="cloud_provider=AZURE"
# ==============================================================================

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }
}

# ==============================================================================
# SHARED VARIABLES - ALL CLOUD PROVIDERS
# ==============================================================================

# Cloud Provider Selection
variable "cloud_provider" {
  description = "Cloud provider to deploy to (GCP, AWS, or AZURE)"
  type        = string
  default     = "GCP"
  
  validation {
    condition     = contains(["GCP", "AWS", "AZURE"], var.cloud_provider)
    error_message = "Cloud provider must be GCP, AWS, or AZURE."
  }
}

# Core Configuration
variable "project_id" {
  description = "Cloud provider project/subscription ID"
  type        = string
  
  validation {
    condition     = length(var.project_id) > 0
    error_message = "Project ID cannot be empty."
  }
}

variable "region" {
  description = "Primary deployment region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "dev"
  
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "application_name" {
  description = "Generic application name for resource naming"
  type        = string
  default     = "serverless-middleware"
}

# Container Configuration
variable "container_registry" {
  description = "Container registry URL for application images"
  type        = string
  default     = "your-registry.example.com/repo"
}

variable "image_tag" {
  description = "Container image tag"
  type        = string
  default     = "latest"
}

# Feature Flags
variable "enable_mcp_mode" {
  description = "Enable MCP (Model Context Protocol) mode for AI agent integration"
  type        = bool
  default     = false
}

variable "enable_monitoring" {
  description = "Enable comprehensive monitoring and logging"
  type        = bool
  default     = true
}

# Security Configuration
variable "enable_safe_mode" {
  description = "Enable SAFE_MODE for read-only operations (MCP mode only)"
  type        = bool
  default     = true
}

variable "enable_oauth_auth" {
  description = "Enable OAuth 2.1 authentication (disabled by default)"
  type        = bool
  default     = false
}

variable "oauth_server_url" {
  description = "OAuth authorization server URL (required if enable_oauth_auth=true)"
  type        = string
  default     = ""
}

variable "server_canonical_uri" {
  description = "Server canonical URI for OAuth audience validation"
  type        = string
  default     = ""
}

# Network Configuration (Configurable, not hardcoded)
variable "ingress_traffic" {
  description = "Ingress traffic type - configurable for security (defaults to most restrictive)"
  type        = string
  default     = "INGRESS_TRAFFIC_INTERNAL_ONLY"
  
  validation {
    condition = contains([
      "INGRESS_TRAFFIC_ALL",
      "INGRESS_TRAFFIC_INTERNAL_ONLY", 
      "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    ], var.ingress_traffic)
    error_message = "Ingress traffic must be a valid option."
  }
}

variable "allow_unauthenticated" {
  description = "Allow unauthenticated access to services"
  type        = bool
  default     = false
}

# Scaling Configuration
variable "min_instances" {
  description = "Minimum number of instances (0 for scale-to-zero)"
  type        = number
  default     = 0
  
  validation {
    condition     = var.min_instances >= 0 && var.min_instances <= 100
    error_message = "Min instances must be between 0 and 100."
  }
}

variable "max_instances" {
  description = "Maximum number of instances for auto-scaling"
  type        = number
  default     = 10
  
  validation {
    condition     = var.max_instances >= 1 && var.max_instances <= 1000
    error_message = "Max instances must be between 1 and 1000."
  }
}

variable "cpu_limit" {
  description = "CPU limit per container"
  type        = string
  default     = "1"
  
  validation {
    condition = contains(["0.25", "0.5", "1", "2", "4", "8"], var.cpu_limit)
    error_message = "CPU limit must be one of: 0.25, 0.5, 1, 2, 4, 8."
  }
}

variable "memory_limit" {
  description = "Memory limit per container"
  type        = string
  default     = "1Gi"
  
  validation {
    condition = contains(["256Mi", "512Mi", "1Gi", "2Gi", "4Gi", "8Gi"], var.memory_limit)
    error_message = "Memory limit must be one of: 256Mi, 512Mi, 1Gi, 2Gi, 4Gi, 8Gi."
  }
}

# Rate Limiting Configuration (Complete from RATE_LIMITING.md)
variable "enable_rate_limiting" {
  description = "Enable rate limiting for API protection"
  type        = bool
  default     = true
}

variable "rate_limit_window_ms" {
  description = "Rate limit window in milliseconds"
  type        = number
  default     = 60000
}

variable "rate_limit_max_requests" {
  description = "General rate limit: max requests per window"
  type        = number
  default     = 100
}

variable "rate_limit_webhook_max_requests" {
  description = "Webhook rate limit: max requests per window"
  type        = number
  default     = 200
}

variable "rate_limit_mcp_max_requests" {
  description = "MCP rate limit: max requests per window"
  type        = number
  default     = 30
}

variable "rate_limit_tool_max_requests" {
  description = "Tool execution rate limit: max requests per window"
  type        = number
  default     = 20
}

variable "rate_limit_api_max_requests" {
  description = "API rate limit: max requests per window"
  type        = number
  default     = 50
}

variable "enable_redis_rate_limiting" {
  description = "Use Redis for distributed rate limiting"
  type        = bool
  default     = false
}

variable "redis_url" {
  description = "Redis connection URL for rate limiting"
  type        = string
  default     = "redis://localhost:6379"
}

# Secret Configuration (Generic and Configurable)
variable "api_secrets" {
  description = "Map of API secret names to create - customize for your integrations"
  type        = map(string)
  default = {
    # Example secrets - uncomment and customize these for your integrations:
    # "service_1_api_key"    = "API key for Service 1"
    # "service_2_webhook"    = "Webhook URL for Service 2" 
    # "database_connection"  = "Database connection string"
    # "auth_token"          = "Authentication token"
    # "oauth_client_secret" = "OAuth client secret"
  }
}

# Cloud-Specific Variables
variable "aws_region" {
  description = "AWS deployment region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block for VPC (AWS)"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.20.0/24"]
}

variable "azure_location" {
  description = "Azure deployment location"
  type        = string
  default     = "East US"
}

variable "labels" {
  description = "Custom labels to apply to resources"
  type        = map(string)
  default = {
    application = "serverless-middleware"
    managed-by  = "terraform"
  }
}

# ==============================================================================
# COMPUTED VALUES & ENVIRONMENT VARIABLES
# ==============================================================================

locals {
  # Generic service names (no identifying information)
  main_service_name    = "${var.application_name}-${var.environment}"
  mcp_service_name     = "${var.application_name}-mcp-${var.environment}"
  service_account_name = "${var.application_name}-runner-${var.environment}"
  
  # Combined labels
  common_labels = merge(var.labels, {
    environment     = var.environment
    version        = var.image_tag
    cloud_provider = var.cloud_provider
  })
  
  # Complete environment variables for all services
  common_env_vars = {
    # Core Application
    NODE_ENV       = "production"
    CLOUD_PROVIDER = var.cloud_provider
    ENVIRONMENT    = var.environment
    PORT           = "8080"
    
    # Rate Limiting Configuration (Complete from RATE_LIMITING.md)
    RATE_LIMIT_ENABLED                = tostring(var.enable_rate_limiting)
    RATE_LIMIT_WINDOW_MS             = tostring(var.rate_limit_window_ms)
    RATE_LIMIT_MAX_REQUESTS          = tostring(var.rate_limit_max_requests)
    RATE_LIMIT_API_WINDOW_MS         = tostring(var.rate_limit_window_ms)
    RATE_LIMIT_API_MAX_REQUESTS      = tostring(var.rate_limit_api_max_requests)
    RATE_LIMIT_WEBHOOK_WINDOW_MS     = tostring(var.rate_limit_window_ms)
    RATE_LIMIT_WEBHOOK_MAX_REQUESTS  = tostring(var.rate_limit_webhook_max_requests)
    RATE_LIMIT_USE_REDIS             = tostring(var.enable_redis_rate_limiting)
    RATE_LIMIT_REDIS_URL             = var.redis_url
    RATE_LIMIT_INCLUDE_HEADERS       = "true"
    RATE_LIMIT_TRUST_PROXY           = "false"
    RATE_LIMIT_MESSAGE               = "Too many requests, please try again later."
    RATE_LIMIT_SKIP_SUCCESSFUL       = "false"
    RATE_LIMIT_SKIP_FAILED           = "false"
    
    # Logging and Monitoring
    LOG_LEVEL      = var.environment == "prod" ? "info" : "debug"
    ENABLE_METRICS = tostring(var.enable_monitoring)
    LOG_FORMAT     = "json"
  }
  
  # MCP-specific environment variables (Complete from MCP docs)
  mcp_env_vars = merge(local.common_env_vars, {
    # Core MCP Configuration
    MCP_MODE        = "true"
    MCP_PORT        = "8080"
    MCP_HOST        = "0.0.0.0"
    MCP_SERVER_NAME = local.mcp_service_name
    
    # MCP Security Configuration (Complete from MCP auth docs)
    SAFE_MODE                             = tostring(var.enable_safe_mode)
    MCP_AUTH_ENABLED                      = tostring(var.enable_oauth_auth)
    MCP_AUTH_SERVER_URL                   = var.oauth_server_url
    MCP_SERVER_CANONICAL_URI              = var.server_canonical_uri
    MCP_AUTH_ALLOW_DYNAMIC_REGISTRATION   = "false"
    MCP_AUTH_TOKEN_CACHE_TIME             = "300"
    MCP_AUTH_REQUIRE_AUDIENCE_VALIDATION  = "true"
    MCP_AUTH_MAX_TOKEN_AGE                = "3600"
    MCP_AUTH_RATE_LIMIT_BY_TOKEN          = "false"
    
    # Input Validation Configuration (Complete from validation docs)
    INPUT_VALIDATION_ENABLED              = "true"
    INPUT_VALIDATION_MAX_STRING_LENGTH    = "10000"
    INPUT_VALIDATION_MAX_SQL_LENGTH       = "50000"
    INPUT_VALIDATION_MAX_IDENTIFIER_LENGTH = "255"
    
    # MCP Rate Limiting
    RATE_LIMIT_MCP_WINDOW_MS  = tostring(var.rate_limit_window_ms)
    RATE_LIMIT_MCP_MAX_REQUESTS = tostring(var.rate_limit_mcp_max_requests)
    RATE_LIMIT_TOOL_WINDOW_MS = tostring(var.rate_limit_window_ms)
    RATE_LIMIT_TOOL_MAX_REQUESTS = tostring(var.rate_limit_tool_max_requests)
    
    # MCP Debugging
    MCP_DEBUG = var.environment == "dev" ? "true" : "false"
  })
}

# ============================================================================== 
# SECTION 1: GOOGLE CLOUD PLATFORM (GCP) DEPLOYMENT
# ==============================================================================

# GCP Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

data "google_project" "current" {
  count = var.cloud_provider == "GCP" ? 1 : 0
}

# Generic Service Account
resource "google_service_account" "service_runner" {
  count        = var.cloud_provider == "GCP" ? 1 : 0
  account_id   = local.service_account_name
  display_name = "Service Runner (${var.environment})"
  description  = "Generic service account for ${var.application_name} services"
}

# Configurable Secrets
resource "google_secret_manager_secret" "api_secrets" {
  for_each = var.cloud_provider == "GCP" ? var.api_secrets : {}
  secret_id = "${each.key}-${var.environment}"
  
  replication {
    auto {}
  }
  
  labels = local.common_labels
}

# Generic IAM for secrets
resource "google_secret_manager_secret_iam_member" "service_runner_secrets" {
  for_each  = var.cloud_provider == "GCP" ? google_secret_manager_secret.api_secrets : {}
  secret_id = each.value.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.service_runner[0].email}"
}

# Main Cloud Run Service
resource "google_cloud_run_v2_service" "main" {
  count       = var.cloud_provider == "GCP" ? 1 : 0
  name        = local.main_service_name
  location    = var.region
  description = "Serverless middleware for data transformation and routing"
  ingress     = var.ingress_traffic

  template {
    service_account = google_service_account.service_runner[0].email
    
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "main"
      image = "${var.container_registry}/${var.application_name}:${var.image_tag}"
      
      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      # Environment variables from computed locals
      dynamic "env" {
        for_each = local.common_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      # Custom secret environment variables (example pattern)
      # dynamic "env" {
      #   for_each = google_secret_manager_secret.api_secrets
      #   content {
      #     name = upper(replace(env.key, "-", "_"))
      #     value_source {
      #       secret_key_ref {
      #         secret  = env.value.secret_id
      #         version = "latest"
      #       }
      #     }
      #   }
      # }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.service_runner_secrets]
  labels = local.common_labels
}

# Optional MCP Cloud Run Service
resource "google_cloud_run_v2_service" "mcp" {
  count       = var.cloud_provider == "GCP" && var.enable_mcp_mode ? 1 : 0
  name        = local.mcp_service_name
  location    = var.region
  description = "MCP Server for AI agent integration"
  ingress     = var.ingress_traffic

  template {
    service_account = google_service_account.service_runner[0].email
    
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      name  = "mcp"
      image = "${var.container_registry}/${var.application_name}-mcp:${var.image_tag}"
      
      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.cpu_limit
          memory = var.memory_limit
        }
      }

      # MCP environment variables from computed locals
      dynamic "env" {
        for_each = local.mcp_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client
    ]
  }

  depends_on = [google_secret_manager_secret_iam_member.service_runner_secrets]
  labels = local.common_labels
}

# Generic IAM Configuration
resource "google_cloud_run_v2_service_iam_member" "main_service_invoker" {
  count    = var.cloud_provider == "GCP" ? 1 : 0
  name     = google_cloud_run_v2_service.main[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.service_runner[0].email}"
}

resource "google_cloud_run_v2_service_iam_member" "mcp_service_invoker" {
  count    = var.cloud_provider == "GCP" && var.enable_mcp_mode ? 1 : 0
  name     = google_cloud_run_v2_service.mcp[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.service_runner[0].email}"
}

# Optional public access (configurable)
resource "google_cloud_run_v2_service_iam_member" "main_public_access" {
  count    = var.cloud_provider == "GCP" && var.allow_unauthenticated ? 1 : 0
  name     = google_cloud_run_v2_service.main[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "mcp_public_access" {
  count    = var.cloud_provider == "GCP" && var.enable_mcp_mode && var.allow_unauthenticated ? 1 : 0
  name     = google_cloud_run_v2_service.mcp[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ============================================================================== 
# SECTION 2: AMAZON WEB SERVICES (AWS) DEPLOYMENT
# ==============================================================================

# AWS Provider
provider "aws" {
  region = var.aws_region
}

# Data Sources
data "aws_availability_zones" "available" {
  count = var.cloud_provider == "AWS" ? 1 : 0
  state = "available"
}

data "aws_caller_identity" "current" {
  count = var.cloud_provider == "AWS" ? 1 : 0
}

# VPC and Networking
resource "aws_vpc" "main" {
  count                = var.cloud_provider == "AWS" ? 1 : 0
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = merge(local.common_labels, {
    Name = "${var.application_name}-vpc-${var.environment}"
  })
}

resource "aws_internet_gateway" "main" {
  count  = var.cloud_provider == "AWS" ? 1 : 0
  vpc_id = aws_vpc.main[0].id
  
  tags = merge(local.common_labels, {
    Name = "${var.application_name}-igw-${var.environment}"
  })
}

resource "aws_subnet" "public" {
  count                   = var.cloud_provider == "AWS" ? 2 : 0
  vpc_id                  = aws_vpc.main[0].id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = data.aws_availability_zones.available[0].names[count.index]
  map_public_ip_on_launch = true
  
  tags = merge(local.common_labels, {
    Name = "${var.application_name}-public-${count.index + 1}-${var.environment}"
  })
}

resource "aws_subnet" "private" {
  count             = var.cloud_provider == "AWS" ? 2 : 0
  vpc_id            = aws_vpc.main[0].id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = data.aws_availability_zones.available[0].names[count.index]
  
  tags = merge(local.common_labels, {
    Name = "${var.application_name}-private-${count.index + 1}-${var.environment}"
  })
}

resource "aws_route_table" "public" {
  count  = var.cloud_provider == "AWS" ? 1 : 0
  vpc_id = aws_vpc.main[0].id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main[0].id
  }

  tags = merge(local.common_labels, {
    Name = "${var.application_name}-public-rt-${var.environment}"
  })
}

resource "aws_route_table_association" "public" {
  count          = var.cloud_provider == "AWS" ? 2 : 0
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public[0].id
}

# Security Groups
resource "aws_security_group" "alb" {
  count       = var.cloud_provider == "AWS" ? 1 : 0
  name_prefix = "${var.application_name}-alb-"
  vpc_id      = aws_vpc.main[0].id

  ingress {
    protocol    = "tcp"
    from_port   = 80
    to_port     = 80
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_labels
}

resource "aws_security_group" "ecs" {
  count       = var.cloud_provider == "AWS" ? 1 : 0
  name_prefix = "${var.application_name}-ecs-"
  vpc_id      = aws_vpc.main[0].id

  ingress {
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    security_groups = [aws_security_group.alb[0].id]
  }

  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = local.common_labels
}

# IAM Roles
resource "aws_iam_role" "ecs_execution" {
  count = var.cloud_provider == "AWS" ? 1 : 0
  name  = "${var.application_name}-ecs-execution-${var.environment}"

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

  tags = local.common_labels
}

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  count      = var.cloud_provider == "AWS" ? 1 : 0
  role       = aws_iam_role.ecs_execution[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "ecs_task" {
  count = var.cloud_provider == "AWS" ? 1 : 0
  name  = "${var.application_name}-ecs-task-${var.environment}"

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

  tags = local.common_labels
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "main" {
  count = var.cloud_provider == "AWS" ? 1 : 0
  name  = "/ecs/${var.application_name}-${var.environment}"

  tags = local.common_labels
}

resource "aws_cloudwatch_log_group" "mcp" {
  count = var.cloud_provider == "AWS" && var.enable_mcp_mode ? 1 : 0
  name  = "/ecs/${var.application_name}-mcp-${var.environment}"

  tags = local.common_labels
}

# ECS Cluster
resource "aws_ecs_cluster" "main" {
  count = var.cloud_provider == "AWS" ? 1 : 0
  name  = "${var.application_name}-${var.environment}"
  
  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = local.common_labels
}

# ECS Task Definitions
resource "aws_ecs_task_definition" "main" {
  count                    = var.cloud_provider == "AWS" ? 1 : 0
  family                   = "${var.application_name}-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = tonumber(var.cpu_limit) * 1024
  memory                  = tonumber(replace(var.memory_limit, "Gi", "")) * 1024
  execution_role_arn      = aws_iam_role.ecs_execution[0].arn
  task_role_arn          = aws_iam_role.ecs_task[0].arn

  container_definitions = jsonencode([
    {
      name  = var.application_name
      image = "${var.container_registry}/${var.application_name}:${var.image_tag}"
      
      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]
      
      environment = [
        for k, v in local.common_env_vars : {
          name  = k
          value = v
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.main[0].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      
      essential = true
    }
  ])

  tags = local.common_labels
}

resource "aws_ecs_task_definition" "mcp" {
  count                    = var.cloud_provider == "AWS" && var.enable_mcp_mode ? 1 : 0
  family                   = "${var.application_name}-mcp-${var.environment}"
  requires_compatibilities = ["FARGATE"]
  network_mode            = "awsvpc"
  cpu                     = tonumber(var.cpu_limit) * 1024
  memory                  = tonumber(replace(var.memory_limit, "Gi", "")) * 1024
  execution_role_arn      = aws_iam_role.ecs_execution[0].arn
  task_role_arn          = aws_iam_role.ecs_task[0].arn

  container_definitions = jsonencode([
    {
      name  = "${var.application_name}-mcp"
      image = "${var.container_registry}/${var.application_name}-mcp:${var.image_tag}"
      
      portMappings = [
        {
          containerPort = 8080
          protocol      = "tcp"
        }
      ]
      
      environment = [
        for k, v in local.mcp_env_vars : {
          name  = k
          value = v
        }
      ]
      
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.mcp[0].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
      
      essential = true
    }
  ])

  tags = local.common_labels
}

# Application Load Balancer
resource "aws_lb" "main" {
  count              = var.cloud_provider == "AWS" ? 1 : 0
  name               = "${var.application_name}-${var.environment}"
  internal           = var.ingress_traffic == "INGRESS_TRAFFIC_INTERNAL_ONLY"
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb[0].id]
  subnets           = aws_subnet.public[*].id

  tags = local.common_labels
}

resource "aws_lb_target_group" "main" {
  count       = var.cloud_provider == "AWS" ? 1 : 0
  name        = "${var.application_name}-${var.environment}"
  port        = 8080
  protocol    = "HTTP"
  vpc_id      = aws_vpc.main[0].id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 2
  }

  tags = local.common_labels
}

resource "aws_lb_listener" "main" {
  count             = var.cloud_provider == "AWS" ? 1 : 0
  load_balancer_arn = aws_lb.main[0].arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.main[0].arn
  }
}

# ECS Services
resource "aws_ecs_service" "main" {
  count           = var.cloud_provider == "AWS" ? 1 : 0
  name            = "${var.application_name}-${var.environment}"
  cluster         = aws_ecs_cluster.main[0].id
  task_definition = aws_ecs_task_definition.main[0].arn
  desired_count   = max(var.min_instances, 1)
  launch_type     = "FARGATE"

  network_configuration {
    subnets         = aws_subnet.private[*].id
    security_groups = [aws_security_group.ecs[0].id]
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.main[0].arn
    container_name   = var.application_name
    container_port   = 8080
  }

  depends_on = [aws_lb_listener.main]
  tags = local.common_labels
}

# ============================================================================== 
# SECTION 3: MICROSOFT AZURE DEPLOYMENT
# ==============================================================================

# Azure Provider
provider "azurerm" {
  features {}
}

data "azurerm_client_config" "current" {
  count = var.cloud_provider == "AZURE" ? 1 : 0
}

# Resource Group
resource "azurerm_resource_group" "main" {
  count    = var.cloud_provider == "AZURE" ? 1 : 0
  name     = "rg-${var.application_name}-${var.environment}"
  location = var.azure_location

  tags = local.common_labels
}

# Managed Identity
resource "azurerm_user_assigned_identity" "main" {
  count               = var.cloud_provider == "AZURE" ? 1 : 0
  name                = "${var.application_name}-identity-${var.environment}"
  resource_group_name = azurerm_resource_group.main[0].name
  location           = azurerm_resource_group.main[0].location

  tags = local.common_labels
}

# Key Vault
resource "azurerm_key_vault" "main" {
  count                      = var.cloud_provider == "AZURE" ? 1 : 0
  name                       = "${var.application_name}-kv-${var.environment}"
  location                   = azurerm_resource_group.main[0].location
  resource_group_name        = azurerm_resource_group.main[0].name
  enabled_for_disk_encryption = true
  tenant_id                  = data.azurerm_client_config.current[0].tenant_id
  soft_delete_retention_days = 7
  purge_protection_enabled   = false
  sku_name                   = "standard"

  access_policy {
    tenant_id = data.azurerm_client_config.current[0].tenant_id
    object_id = data.azurerm_client_config.current[0].object_id

    secret_permissions = [
      "Get", "Set", "List", "Delete", "Purge", "Recover"
    ]
  }

  access_policy {
    tenant_id = data.azurerm_client_config.current[0].tenant_id
    object_id = azurerm_user_assigned_identity.main[0].principal_id

    secret_permissions = [
      "Get", "List"
    ]
  }

  tags = local.common_labels
}

# Key Vault Secrets
resource "azurerm_key_vault_secret" "api_secrets" {
  for_each     = var.cloud_provider == "AZURE" ? var.api_secrets : {}
  name         = "${replace(each.key, "_", "-")}-${var.environment}"
  value        = "placeholder-value"
  key_vault_id = azurerm_key_vault.main[0].id

  tags = local.common_labels
}

# Log Analytics Workspace
resource "azurerm_log_analytics_workspace" "main" {
  count               = var.cloud_provider == "AZURE" ? 1 : 0
  name                = "${var.application_name}-logs-${var.environment}"
  location            = azurerm_resource_group.main[0].location
  resource_group_name = azurerm_resource_group.main[0].name
  sku                = "PerGB2018"
  retention_in_days   = 30

  tags = local.common_labels
}

# Container App Environment
resource "azurerm_container_app_environment" "main" {
  count                      = var.cloud_provider == "AZURE" ? 1 : 0
  name                       = "cae-${var.application_name}-${var.environment}"
  location                   = azurerm_resource_group.main[0].location
  resource_group_name        = azurerm_resource_group.main[0].name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.main[0].id

  tags = local.common_labels
}

# Main Container App
resource "azurerm_container_app" "main" {
  count                        = var.cloud_provider == "AZURE" ? 1 : 0
  name                         = "ca-${var.application_name}-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main[0].id
  resource_group_name          = azurerm_resource_group.main[0].name
  revision_mode               = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.main[0].id]
  }

  template {
    container {
      name   = var.application_name
      image  = "${var.container_registry}/${var.application_name}:${var.image_tag}"
      cpu    = tonumber(var.cpu_limit)
      memory = var.memory_limit

      dynamic "env" {
        for_each = local.common_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
    }

    min_replicas = var.min_instances
    max_replicas = var.max_instances
  }

  # Configurable ingress based on ingress_traffic variable
  dynamic "ingress" {
    for_each = var.ingress_traffic != "INGRESS_TRAFFIC_INTERNAL_ONLY" ? [1] : []
    content {
      allow_insecure_connections = false
      external_enabled          = var.ingress_traffic == "INGRESS_TRAFFIC_ALL"
      target_port               = 8080

      traffic_weight {
        percentage      = 100
        latest_revision = true
      }
    }
  }

  tags = local.common_labels
}

# MCP Container App
resource "azurerm_container_app" "mcp" {
  count                        = var.cloud_provider == "AZURE" && var.enable_mcp_mode ? 1 : 0
  name                         = "ca-${var.application_name}-mcp-${var.environment}"
  container_app_environment_id = azurerm_container_app_environment.main[0].id
  resource_group_name          = azurerm_resource_group.main[0].name
  revision_mode               = "Single"

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.main[0].id]
  }

  template {
    container {
      name   = "${var.application_name}-mcp"
      image  = "${var.container_registry}/${var.application_name}-mcp:${var.image_tag}"
      cpu    = tonumber(var.cpu_limit)
      memory = var.memory_limit

      dynamic "env" {
        for_each = local.mcp_env_vars
        content {
          name  = env.key
          value = env.value
        }
      }
    }

    min_replicas = var.min_instances
    max_replicas = var.max_instances
  }

  # Configurable ingress
  dynamic "ingress" {
    for_each = var.ingress_traffic != "INGRESS_TRAFFIC_INTERNAL_ONLY" ? [1] : []
    content {
      allow_insecure_connections = false
      external_enabled          = var.ingress_traffic == "INGRESS_TRAFFIC_ALL"
      target_port               = 8080

      traffic_weight {
        percentage      = 100
        latest_revision = true
      }
    }
  }

  tags = local.common_labels
}

# ==============================================================================
# OUTPUTS - CONDITIONAL BASED ON CLOUD PROVIDER
# ==============================================================================

output "main_service_url" {
  description = "Main service URL"
  value = var.cloud_provider == "GCP" ? (
    length(google_cloud_run_v2_service.main) > 0 ? google_cloud_run_v2_service.main[0].uri : null
  ) : var.cloud_provider == "AWS" ? (
    length(aws_lb.main) > 0 ? "http://${aws_lb.main[0].dns_name}" : null
  ) : var.cloud_provider == "AZURE" ? (
    length(azurerm_container_app.main) > 0 ? "https://${azurerm_container_app.main[0].latest_revision_fqdn}" : null
  ) : null
}

output "mcp_service_url" {
  description = "MCP service URL (if enabled)"
  value = var.enable_mcp_mode ? (
    var.cloud_provider == "GCP" ? (
      length(google_cloud_run_v2_service.mcp) > 0 ? google_cloud_run_v2_service.mcp[0].uri : null
    ) : var.cloud_provider == "AWS" ? (
      length(aws_lb.main) > 0 ? "http://${aws_lb.main[0].dns_name}/mcp" : null
    ) : var.cloud_provider == "AZURE" ? (
      length(azurerm_container_app.mcp) > 0 ? "https://${azurerm_container_app.mcp[0].latest_revision_fqdn}" : null
    ) : null
  ) : null
}

output "deployment_info" {
  description = "Deployment information"
  value = {
    cloud_provider        = var.cloud_provider
    project_id           = var.project_id
    region              = var.cloud_provider == "GCP" ? var.region : var.cloud_provider == "AWS" ? var.aws_region : var.azure_location
    environment         = var.environment
    application_name    = var.application_name
    mcp_mode_enabled    = var.enable_mcp_mode
    safe_mode_enabled   = var.enable_safe_mode
    oauth_auth_enabled  = var.enable_oauth_auth
    ingress_config      = var.ingress_traffic
    rate_limiting_enabled = var.enable_rate_limiting
  }
}

# ==============================================================================
# USAGE EXAMPLES
# ==============================================================================

# Example terraform.tfvars configurations:

# Google Cloud Platform:
# cloud_provider = "GCP"
# project_id = "my-gcp-project"
# region = "us-central1"
# application_name = "my-middleware"
# container_registry = "gcr.io/my-project"
# ingress_traffic = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
# api_secrets = {
#   "service_1_key" = "API key for Service 1"
#   "webhook_url"   = "Webhook URL"
# }

# Amazon Web Services:
# cloud_provider = "AWS"
# project_id = "123456789012"
# aws_region = "us-east-1"
# container_registry = "123456789012.dkr.ecr.us-east-1.amazonaws.com"

# Microsoft Azure:
# cloud_provider = "AZURE"
# project_id = "subscription-id"
# azure_location = "East US"
# container_registry = "myregistry.azurecr.io"