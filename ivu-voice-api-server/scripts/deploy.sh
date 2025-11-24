#!/bin/bash
# IVU Voice API - Quick Deploy Script
# Deploys to a remote Linux server via SSH

set -e

echo "======================================"
echo "IVU Voice API - Deploy Script"
echo "======================================"
echo ""

# Configuration
REMOTE_USER="${DEPLOY_USER:-root}"
REMOTE_HOST="${DEPLOY_HOST}"
REMOTE_PATH="${DEPLOY_PATH:-/opt/ivu-voice-api}"
SERVICE_NAME="ivu-voice-api"

# Check required variables
if [ -z "$REMOTE_HOST" ]; then
  echo "Error: DEPLOY_HOST environment variable is required"
  echo "Usage: DEPLOY_HOST=your-server.com ./scripts/deploy.sh"
  exit 1
fi

echo "Deploying to: $REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH"
echo ""

# Build locally
echo "Building application..."
npm run build
echo "✓ Build completed"
echo ""

# Create deployment package
echo "Creating deployment package..."
tar -czf deploy.tar.gz \
  package*.json \
  dist/ \
  .env.example \
  scripts/ \
  DEPLOYMENT.md
echo "✓ Package created"
echo ""

# Upload to server
echo "Uploading to server..."
scp deploy.tar.gz "$REMOTE_USER@$REMOTE_HOST:/tmp/"
echo "✓ Upload completed"
echo ""

# Deploy on server
echo "Deploying on server..."
ssh "$REMOTE_USER@$REMOTE_HOST" bash -s <<EOF
set -e

echo "Creating directory..."
mkdir -p $REMOTE_PATH/ivu-voice-api-server
cd $REMOTE_PATH/ivu-voice-api-server

echo "Extracting package..."
tar -xzf /tmp/deploy.tar.gz
rm /tmp/deploy.tar.gz

echo "Installing dependencies..."
npm ci --only=production

echo "Setting up environment..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Please configure .env file!"
fi

echo "Restarting service..."
if systemctl is-active --quiet $SERVICE_NAME; then
  systemctl restart $SERVICE_NAME
  echo "✓ Service restarted"
else
  echo "Service not running. Start with: systemctl start $SERVICE_NAME"
fi

echo "Deployment completed!"
EOF

# Cleanup
rm deploy.tar.gz

echo ""
echo "======================================"
echo "Deployment completed successfully!"
echo "======================================"
echo ""
echo "Check service status:"
echo "  ssh $REMOTE_USER@$REMOTE_HOST 'systemctl status $SERVICE_NAME'"
echo ""
echo "View logs:"
echo "  ssh $REMOTE_USER@$REMOTE_HOST 'journalctl -u $SERVICE_NAME -f'"
echo ""
