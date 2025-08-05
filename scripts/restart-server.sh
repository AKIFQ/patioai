#!/bin/bash

# Simple server restart script for memory issues
# Usage: ./scripts/restart-server.sh

echo "🔄 Restarting server to clear memory..."

# Find and kill the current process
PID=$(lsof -ti:3001)
if [ ! -z "$PID" ]; then
    echo "🛑 Stopping server (PID: $PID)..."
    kill -TERM $PID
    sleep 2
    
    # Force kill if still running
    if kill -0 $PID 2>/dev/null; then
        echo "🔨 Force killing server..."
        kill -KILL $PID
    fi
fi

echo "✅ Server stopped"
echo "🚀 Starting server with memory optimization..."

# Start with garbage collection enabled
NODE_OPTIONS="--expose-gc --max-old-space-size=2048" npm run dev

echo "✅ Server restarted with memory optimization"