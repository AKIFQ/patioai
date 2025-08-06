#!/bin/bash

echo "🔄 Restarting development server to clear memory..."

# Find and kill the Next.js dev server
echo "🔍 Finding Next.js processes..."
PIDS=$(ps aux | grep "next dev" | grep -v grep | awk '{print $2}')

if [ -z "$PIDS" ]; then
    echo "❌ No Next.js dev server found running"
else
    echo "🛑 Killing processes: $PIDS"
    echo $PIDS | xargs kill -9
    sleep 2
fi

# Also kill any node processes on port 3001
echo "🔍 Checking port 3001..."
PORT_PID=$(lsof -ti:3001)
if [ ! -z "$PORT_PID" ]; then
    echo "🛑 Killing process on port 3001: $PORT_PID"
    kill -9 $PORT_PID
    sleep 1
fi

echo "✅ Cleanup complete"
echo "🚀 Starting fresh development server..."
echo "   Run: npm run dev"
echo "   Or: yarn dev"
echo ""
echo "💡 To prevent memory leaks in the future:"
echo "   - Restart the dev server every few hours"
echo "   - Use 'npm run dev -- --turbo' for better performance"
echo "   - Monitor memory with: curl http://localhost:3001/api/memory/cleanup"