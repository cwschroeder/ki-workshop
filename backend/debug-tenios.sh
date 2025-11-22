#!/bin/bash

echo "=== Testing Tenios Response Format ==="
echo ""
echo "Current response structure:"
cat test-response.json | jq
echo ""
echo "=== Making test call to check logs ==="
echo "Call your Tenios number now and check the logs for validation errors"
