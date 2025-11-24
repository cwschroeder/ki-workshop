#!/bin/bash
# IVU Voice API - Automated Installation Script
# This script installs and configures the IVU Voice API on a Linux server

set -e  # Exit on error

echo "======================================"
echo "IVU Voice API - Installation Script"
echo "======================================"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
  echo "Warning: Running as root. It's recommended to run as regular user with sudo."
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Check Node.js version
echo "Checking Node.js version..."
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed."
  echo "Please install Node.js 20.x or higher:"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt install -y nodejs"
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
  echo "Error: Node.js version 20 or higher is required. Current: $(node -v)"
  exit 1
fi

echo "✓ Node.js $(node -v) found"
echo ""

# Install dependencies
echo "Installing dependencies..."
npm install --production
echo "✓ Dependencies installed"
echo ""

# Build TypeScript
echo "Building TypeScript..."
npm run build
echo "✓ Build completed"
echo ""

# Create workshop data directory
echo "Creating workshop data directory..."
WORKSHOP_DATA_DIR="../workshop-data"
mkdir -p "$WORKSHOP_DATA_DIR"
echo "✓ Workshop data directory created at: $WORKSHOP_DATA_DIR"
echo ""

# Setup environment file
if [ ! -f .env ]; then
  echo "Creating .env file from template..."
  cp .env.example .env
  echo "✓ .env file created"
  echo ""
  echo "IMPORTANT: Please edit .env and configure your API keys:"
  echo "  - TENIOS_API_KEY"
  echo "  - OPENAI_API_KEY (or configure local-llm)"
  echo "  - TENIOS_WEBHOOK_URL"
  echo ""
else
  echo "✓ .env file already exists"
  echo ""
fi

# Offer to install systemd service
if [ -f /etc/systemd/system/ivu-voice-api.service ]; then
  echo "Systemd service already installed."
else
  echo "Do you want to install systemd service? (requires sudo)"
  read -p "Install service? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Get current directory
    CURRENT_DIR=$(pwd)

    # Create service file
    sudo tee /etc/systemd/system/ivu-voice-api.service > /dev/null <<EOF
[Unit]
Description=IVU Voice API Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$CURRENT_DIR
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node $CURRENT_DIR/dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=ivu-voice-api

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    sudo systemctl daemon-reload
    sudo systemctl enable ivu-voice-api

    echo "✓ Systemd service installed and enabled"
    echo ""
    echo "Start the service with:"
    echo "  sudo systemctl start ivu-voice-api"
    echo ""
  fi
fi

echo "======================================"
echo "Installation completed successfully!"
echo "======================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file and configure API keys"
echo "2. Start the server:"
echo "   - With systemd: sudo systemctl start ivu-voice-api"
echo "   - Manually:     npm start"
echo "3. Check health: curl http://localhost:3001/health"
echo "4. Configure Tenios webhook to point to your server"
echo ""
echo "For more details, see DEPLOYMENT.md"
echo ""
