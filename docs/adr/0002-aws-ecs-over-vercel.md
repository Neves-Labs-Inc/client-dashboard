---
status: superseded by ADR-0004
---

# AWS ECS Express Mode over Vercel

The stack research recommended Vercel Pro + Neon as the cheapest, lowest-ops home (about $20/mo). We run on AWS instead, because we want control over the infrastructure and no lock-in to a platform's APIs. The app is React Router v7 (framework mode) with Drizzle, packaged as a Docker image and run by ECS Express Mode on Fargate behind the HTTPS load balancer it creates. Data lives in the dashboard's own RDS Postgres instance (single-AZ `db.t4g.micro`), tagged so its cost is separate from our other apps. Everything sits in a dedicated VPC: the app in public subnets with public IPs (no NAT needed to reach GitHub), RDS in private subnets reachable only from the app's security group. Terraform (hashicorp/aws ≥ 6.23, `aws_ecs_express_gateway_service`) defines it all. The GitHub reconcile poll is a timer inside the app, guarded by a Postgres advisory lock, so it needs no AWS scheduler and moves with the container.

The price is about $55–70/mo instead of about $20, and more ops: we own the Dockerfile, the VPC and the database. Express Mode also creates the load balancer, its rules and the certificate outside Terraform state, so a custom domain is a manual listener edit that Terraform will not see.

## Considered options

- **Vercel Pro + Neon**: cheapest and lowest ops, but Cron and route handling are Vercel-shaped, and the Postgres is a second vendor.
- **Fly.io + Neon**: cheap and portable, but less control over networking and a third vendor for the database.
- **Sharing our existing RDS server**: no extra cost, but AWS bills the instance as a whole, so the dashboard's cost could only be estimated, and it would share backups and outages with other apps.
- **Lambda via SST**: near-zero idle cost, but reaching RDS from inside the VPC needs a NAT gateway (about $32/mo) and ties packaging to Lambda.
