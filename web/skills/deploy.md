---
name: deploy
description: Ship to Vercel, an Oracle Always Free VM, AWS or Docker.
---
# Deploy: Vercel, Oracle, AWS

- **Vercel** (frontends, Next.js, serverless functions): connect the GitHub repo, set the Root Directory if the app is in a subfolder, add env vars per environment, keep functions under the duration limit and stream long responses.
- **Oracle Cloud Always Free** (always-on servers): Ampere A1 ARM VM (up to 4 OCPU / 24 GB) or AMD micro. Install Docker, open ports both in the VCN Security List and in the VM's iptables, put Caddy in front for automatic HTTPS (a free `<ip-with-dashes>.sslip.io` hostname works without buying a domain). Use multi-arch images.
- **AWS**: static sites on S3 + CloudFront, APIs on Lambda + API Gateway, containers on ECS Fargate or App Runner. Least-privilege IAM roles, secrets in Secrets Manager.
- **Docker**: small base images, multi-stage builds, run as a non-root user, a healthcheck, config from env vars.
- **CI**: GitHub Actions running tests and lint on every PR; deploy on merge to main.
Always include: how to set env vars, how to check health after deploy, and how to roll back.
