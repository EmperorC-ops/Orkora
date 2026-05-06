# Staging environment composition.
# This is a stub showing the intended structure - module bodies live under ../../modules.

terraform {
  required_version = ">= 1.7.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags {
    tags = {
      Project     = "orkora"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}

variable "aws_region" {
  type    = string
  default = "eu-west-1"
}

variable "domain" {
  type    = string
  default = "staging.orkora.io"
}

# module "network" {
#   source = "../../modules/network"
#   name   = "orkora-staging"
#   cidr   = "10.10.0.0/16"
# }

# module "database" {
#   source              = "../../modules/database"
#   identifier          = "orkora-staging"
#   instance_class      = "db.t4g.medium"
#   allocated_storage   = 50
#   multi_az            = false
#   subnet_ids          = module.network.private_subnet_ids
#   security_group_ids  = [module.network.db_sg_id]
# }

# module "cache" {
#   source        = "../../modules/cache"
#   name          = "orkora-staging"
#   subnet_ids    = module.network.private_subnet_ids
#   node_type     = "cache.t4g.small"
# }

# module "compute" {
#   source       = "../../modules/compute"
#   cluster_name = "orkora-staging"
#   subnet_ids   = module.network.public_subnet_ids
#   domain       = var.domain
# }
