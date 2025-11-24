#!/bin/bash
# deploy-to-workshop.sh
# Deployment zur Workshop-Maschine cweb03

set -e

SERVER="root@10.243.0.8"
SSH_KEY="$HOME/Dropbox/MyData/Documents/OPENVPN_config/gitlab-nor-priv-ssh"
LOCAL_PATH="$HOME/Github/ki-phone-connect/ivu-voice-api-server"
REMOTE_PATH="/opt/ivu-voice-api"

echo "======================================"
echo "Deploying to Workshop Server cweb03"
echo "======================================"
echo ""

# Code hochladen
echo "📤 Uploading code..."
rsync -avz --progress \
  -e "ssh -i $SSH_KEY" \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '*.log' \
  --exclude '.env' \
  "$LOCAL_PATH/" \
  "$SERVER:$REMOTE_PATH/"

echo ""
echo "✓ Upload completed"
echo ""

# Auf Server bauen und starten
echo "🔨 Building on server..."
ssh -i "$SSH_KEY" "$SERVER" << 'EOF'
cd /opt/ivu-voice-api

echo "Installing dependencies..."
npm install

echo "Building TypeScript..."
npm run build

echo "Creating workshop data directory..."
mkdir -p ../workshop-data

echo ""
echo "✓ Build completed"
echo ""
echo "Server is ready! Start with:"
echo "  npm start"
echo ""
EOF

echo "======================================"
echo "Deployment completed!"
echo "======================================"
echo ""
echo "To start the server:"
echo "  ssh -i $SSH_KEY $SERVER 'cd /opt/ivu-voice-api && npm start'"
echo ""
