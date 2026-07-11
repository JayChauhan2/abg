#!/bin/bash

# Navigate to dashboard folder
cd "/Users/jaychauhan/ai-video-tools/dashboard"

echo "=== Starting AI Video Control Center Dashboard ==="
echo "Opening browser to http://127.0.0.1:3000..."

# Open browser after a small delay to let server boot
(sleep 1 && open "http://127.0.0.1:3000") &

# Start Node server
node server.js
