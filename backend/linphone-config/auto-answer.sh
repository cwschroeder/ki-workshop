#!/bin/bash

# Start linphonec and automatically answer calls
echo "Starting linphonec with auto-answer..."

# Start linphonec in background with a named pipe
mkfifo /tmp/linphone-input

# Feed commands to linphonec when calls arrive
(
  while true; do
    sleep 1
    # Send 'answer' command when a call is ringing
    echo "answer"
  done
) > /tmp/linphone-input &

# Start linphonec with the pipe as input
linphonec -c /root/.linphonerc -d 6 < /tmp/linphone-input
