#!/bin/bash
# Deploy HPE to AWS EC2 instance.
#
# Prerequisites:
#   - EC2 instance with Docker + Docker Compose installed
#   - SSH key configured (~/.ssh/hpe-deploy.pem)
#   - Environment variables set (or edit below)
#
# Usage:
#   ./scripts/deploy-ec2.sh [host] [key]

set -euo pipefail

HOST="${1:-${HPE_DEPLOY_HOST:-ec2-user@your-instance.amazonaws.com}}"
KEY="${2:-${HPE_DEPLOY_KEY:-~/.ssh/hpe-deploy.pem}}"
REMOTE_DIR="/home/ec2-user/higra-pump-engine"

echo "==> Deploying HPE to ${HOST}"

# 1. Build frontend locally
echo "==> Building frontend..."
cd "$(dirname "$0")/../frontend"
npm ci --silent
npm run build

# 2. Sync files to EC2
echo "==> Syncing to ${HOST}:${REMOTE_DIR}..."
rsync -avz --delete \
    -e "ssh -i ${KEY} -o StrictHostKeyChecking=no" \
    --exclude node_modules \
    --exclude .git \
    --exclude __pycache__ \
    --exclude .pytest_cache \
    --exclude venv \
    --exclude .env \
    "$(dirname "$0")/../" \
    "${HOST}:${REMOTE_DIR}/"

# 3. Run on remote
echo "==> Starting services on remote..."
ssh -i "${KEY}" "${HOST}" << 'REMOTE_SCRIPT'
cd ~/higra-pump-engine

# Copy env if needed
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "WARNING: Using .env.example — update backend/.env with production values"
fi

# Build and start
docker compose build --quiet
docker compose up -d

echo "==> Services running:"
docker compose ps
echo ""
echo "Backend:  http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):8000"
echo "Frontend: http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4):3000"
REMOTE_SCRIPT

echo "==> Deploy complete!"
