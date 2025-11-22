#!/bin/bash

# Test webhook for incoming call
echo "=== Testing Incoming Call Webhook ==="
curl -X POST http://localhost:3000/api/tenios/webhook/incoming \
  -H "Content-Type: application/json" \
  -d '{
    "callId": "test-call-123",
    "from": "+491234567890",
    "to": "+49987654321"
  }' | jq

echo ""
echo "=== Server Health Check ==="
curl -s http://localhost:3000/health | jq
