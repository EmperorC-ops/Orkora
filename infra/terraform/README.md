# Terraform Infrastructure

This directory holds the IaC for staging and production AWS environments.

## Layout (planned)

```
terraform/
├── modules/
│   ├── network/        # VPC, subnets, security groups
│   ├── database/       # RDS Postgres, parameter groups, backups
│   ├── cache/          # ElastiCache Redis cluster
│   ├── storage/        # S3 buckets (media, exports), CloudFront
│   ├── compute/        # ECS cluster, services, task definitions
│   ├── observability/  # CloudWatch alarms, log groups
│   └── ci/             # IAM role for GitHub OIDC deploy
└── envs/
    ├── staging/
    └── production/
```

## Bootstrap

1. Create an S3 bucket and DynamoDB table for remote state in your AWS account.
2. Update `envs/<env>/backend.tf` with the bucket and table names.
3. `cd envs/staging && terraform init && terraform plan && terraform apply`.

## What gets provisioned

- VPC across 3 AZs in eu-west-1 (default region; change per market needs).
- Application Load Balancer for the API and a second ALB tuned for WebSockets (idle timeout 3600s).
- ECS Fargate cluster with services for `api` and `worker`.
- RDS PostgreSQL 15 with multi-AZ in production, daily snapshots, point-in-time recovery.
- ElastiCache Redis cluster with at-rest and in-transit encryption.
- S3 buckets for media (public-read via CloudFront) and exports (private).
- CloudFront distributions in front of media and the Next.js admin.
- ACM certificates and Route 53 records.
- IAM role for GitHub Actions OIDC deploys (no long-lived AWS keys in CI).

## Cost guardrails

The default sizing targets a $300-500/month staging footprint and a $1500-3000/month production footprint at the seed stage. Pull the `cost_dashboard` module to wire up CloudWatch billing alarms.
