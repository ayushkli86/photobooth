#!/bin/bash
# 🎀 Photobooth Launcher Script
# Double-click to run or execute: ./start-photobooth.sh

cd /home/ayushkli/photobooth-website

echo ""
echo "  🎀 =================================="
echo "  🎀  PHOTOBHOOH 인생네컷"
echo "  🎀  Online Photo Booth"
echo "  🎀 =================================="
echo ""

# Kill any existing instance on port 3000
if lsof -ti:3000 > /dev/null 2>&1; then
    echo "  ⏹  Stopping existing instance..."
    kill $(lsof -ti:3000) 2>/dev/null
    sleep 1
fi

echo "  🚀 Starting server..."
node server.js &
SERVER_PID=$!

sleep 2

# Check if server started
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo ""
    echo "  ✅ Server is running!"
    echo ""
    echo "  🌐 Open in browser: http://localhost:3000"
    echo "  📌 Server PID: $SERVER_PID"
    echo ""
    
    # Try to open browser
    xdg-open http://localhost:3000 2>/dev/null &
    
    echo "  Press Ctrl+C to stop the server"
    echo ""
else
    echo "  ❌ Failed to start server"
    exit 1
fi

# Keep running until Ctrl+C
trap "echo ''; echo '  ⏹  Stopping server...'; kill $SERVER_PID 2>/dev/null; echo '  ✅ Done!'; exit 0" INT TERM

wait $SERVER_PID
