#!/usr/bin/env bash
set -euo pipefail

# Deploy DEJOIY-CodeAgent to remote VPS
# Usage: REMOTE_PASSWORD='your-root-password' ./scripts/remote-deploy.sh

HOST="${REMOTE_HOST:-178.104.228.157}"
USER="${REMOTE_USER:-root}"
PORT="${REMOTE_PORT:-22}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ -z "${REMOTE_PASSWORD:-}" ]; then
  echo "Error: Set REMOTE_PASSWORD environment variable"
  echo "Usage: REMOTE_PASSWORD='your-password' ./scripts/remote-deploy.sh"
  exit 1
fi

export SSHPASS="$REMOTE_PASSWORD"

echo "==> Connecting to ${USER}@${HOST}:${PORT}..."

SSHPASS="$REMOTE_PASSWORD" sshpass -e ssh -o StrictHostKeyChecking=no -p "$PORT" "${USER}@${HOST}" 'bash -s' < "$ROOT_DIR/scripts/setup-vps.sh"

echo "==> Deployment finished!"
