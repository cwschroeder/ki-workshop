#!/bin/bash
set -e

# Start linphonec with auto-answer enabled via command

# Create named pipe for commands
PIPE=/tmp/linphone-commands
mkfifo $PIPE 2>/dev/null || true

# Start background process that enables autoanswer
{
    # Wait a moment for linphonec to start
    sleep 2

    # Enable autoanswer
    echo "autoanswer enable"

    # Send a status command to verify
    sleep 1
    echo "autoanswer status"

    # Keep the pipe open without spamming answer commands
    # autoanswer mode should handle incoming calls automatically
    while true; do
        sleep 60
    done
} > $PIPE &

FEEDER_PID=$!

# Trap to cleanup on exit
trap "kill $FEEDER_PID 2>/dev/null || true; rm $PIPE 2>/dev/null || true" EXIT

# Start linphonec with the pipe as input
linphonec -c /root/.linphonerc -d 6 < $PIPE
