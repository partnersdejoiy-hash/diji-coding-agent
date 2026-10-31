#!/usr/bin/env bash
# One-shot setup for an Oracle Cloud Always Free Ubuntu VM (Ampere A1 or AMD micro).
# Usage on the VM:  curl -fsSL https://raw.githubusercontent.com/partnersdejoiy-hash/diji-coding-agent/main/server/deploy/oracle-setup.sh | bash
# Optional env before running: DIJI_DOMAIN=diji.example.com  DIJI_SERVER_TOKEN=secret  CORS_ORIGIN=https://your-app.vercel.app
set -euo pipefail

REPO="${DIJI_REPO:-https://github.com/partnersdejoiy-hash/diji-coding-agent.git}"
DIR="${DIJI_DIR:-$HOME/diji-coding-agent}"

if [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 4000 ] && ! swapon --show | grep -q .; then
  echo "==> Adding 3 GB swap (small VM, Chromium needs headroom)"
  sudo fallocate -l 3G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null && sudo swapon /swapfile
  grep -q swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab >/dev/null
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

echo "==> Opening ports 80 and 443 in the VM firewall"
# Oracle's Ubuntu images ship iptables rules that reject everything except SSH.
for p in 80 443; do
  sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT
done
if command -v netfilter-persistent >/dev/null; then sudo netfilter-persistent save; fi

echo "==> Fetching Diji"
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull --ff-only; else git clone --depth 1 "$REPO" "$DIR"; fi
cd "$DIR/server/deploy"

if [ -z "${DIJI_DOMAIN:-}" ]; then
  IP="$(curl -fsS https://api.ipify.org)"
  DIJI_DOMAIN="${IP//./-}.sslip.io"
  echo "    No DIJI_DOMAIN given, using free HTTPS hostname $DIJI_DOMAIN"
fi
if [ -z "${DIJI_SERVER_TOKEN:-}" ]; then
  DIJI_SERVER_TOKEN="$(openssl rand -hex 16)"
fi

cat > .env <<EOF
DIJI_DOMAIN=$DIJI_DOMAIN
DIJI_SERVER_TOKEN=$DIJI_SERVER_TOKEN
CORS_ORIGIN=${CORS_ORIGIN:-*}
DIJI_MAX_BROWSERS=${DIJI_MAX_BROWSERS:-$( [ "$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo)" -lt 4000 ] && echo 1 || echo 4)}
EOF

echo "==> Building and starting (first build takes a few minutes)"
sudo docker compose up -d --build

cat <<EOF

Diji server is starting.
  Server URL : https://$DIJI_DOMAIN
  Token      : $DIJI_SERVER_TOKEN

Paste both into Diji → Settings → Cloud.
Also open ports 80 and 443 in the Oracle console: Networking → Virtual cloud networks →
your VCN → Security Lists → Add Ingress Rules (source 0.0.0.0/0, TCP 80 and 443).
Check health:  curl https://$DIJI_DOMAIN/api/health
EOF
