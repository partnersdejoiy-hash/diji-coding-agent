#!/usr/bin/env bash
set -euo pipefail

# DEJOIY-CodeAgent server deployment script
# Usage: ./scripts/deploy-server.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> DEJOIY-CodeAgent deployment"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: Docker is required. Install Docker and Docker Compose first."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm..."
  corepack enable
  corepack prepare pnpm@9.15.0 --activate
fi

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  JWT_SECRET=$(openssl rand -hex 32)
  sed -i "s|change-this-to-a-secure-random-string-in-production|${JWT_SECRET}|" .env
  echo "Generated JWT_SECRET in .env"
fi

echo "==> Installing dependencies"
pnpm install

echo "==> Starting infrastructure (PostgreSQL + ChromaDB)"
docker compose up postgres chroma -d

echo "==> Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U dejoiy >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

echo "==> Generating Prisma client and pushing schema"
pnpm db:generate
pnpm db:push

echo "==> Building application"
pnpm build

echo "==> Starting all services"
docker compose up -d

echo ""
echo "Deployment complete!"
echo "  Web UI:  http://localhost:3000"
echo "  API:     http://localhost:4000"
echo "  Nginx:   http://localhost"
echo ""
echo "Next steps:"
echo "  1. Open the web UI and register an account"
echo "  2. Go to Settings and add your OpenAI API key"
echo "  3. Create a workspace and start coding"
