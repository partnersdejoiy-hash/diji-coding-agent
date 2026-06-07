#!/usr/bin/env bash
# Run this ON the VPS as root: bash setup-vps.sh
set -euo pipefail

APP_DIR="/opt/dejoiy-codeagent"
REPO_URL="https://github.com/partnersdejoiy-hash/diji-coding-agent.git"
BRANCH="cursor/dejoiy-code-agent-6e86"
DOMAIN="${1:-}"

echo "==> DEJOIY-CodeAgent VPS Setup"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl git ca-certificates gnupg lsb-release openssl

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker..."
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

if ! command -v node >/dev/null 2>&1; then
  echo "==> Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs
fi

corepack enable
corepack prepare pnpm@9.15.0 --activate

mkdir -p "$APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git fetch origin
  git checkout "$BRANCH"
  git pull origin "$BRANCH"
else
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

if [ ! -f .env ]; then
  cp .env.example .env
  JWT_SECRET=$(openssl rand -hex 32)
  sed -i "s|change-this-to-a-secure-random-string-in-production|${JWT_SECRET}|" .env
  sed -i "s|CORS_ORIGIN=http://localhost:3000|CORS_ORIGIN=http://${DOMAIN:-178.104.228.157}|" .env
  sed -i "s|NEXT_PUBLIC_API_URL=http://localhost:4000|NEXT_PUBLIC_API_URL=http://${DOMAIN:-178.104.228.157}:4000|" .env
fi

pnpm install
docker compose up postgres chroma -d

echo "==> Waiting for PostgreSQL..."
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U dejoiy >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

export $(grep -v '^#' .env | xargs)
pnpm db:generate
pnpm db:push
pnpm build

docker compose up -d

# Firewall
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
  ufw allow 3000/tcp || true
  ufw allow 4000/tcp || true
  ufw --force enable || true
fi

echo ""
echo "============================================"
echo " DEJOIY-CodeAgent deployed successfully!"
echo "============================================"
echo " Web:  http://178.104.228.157:3000"
echo " API:  http://178.104.228.157:4000"
echo " Nginx: http://178.104.228.157"
echo ""
echo " 1. Open Settings and add OpenAI API key"
echo " 2. Register an account and create a workspace"
echo "============================================"
