#!/bin/bash

echo "🎬 WatchTogether Testing Script"
echo "================================"

# Check if server is running
echo "1. Checking if signaling server is running on port 3001..."
if curl -s http://localhost:3001 > /dev/null; then
    echo "✅ Server is running"
else
    echo "❌ Server is not running. Starting it now..."
    cd /Users/dhruvthakkar/watchtogether/server
    npm start &
    sleep 3
    if curl -s http://localhost:3001 > /dev/null; then
        echo "✅ Server started successfully"
    else
        echo "❌ Failed to start server"
        exit 1
    fi
fi

echo ""
echo "2. Extension Testing Instructions:"
echo "---------------------------------"
echo "📋 Load the extension in Chrome:"
echo "   - Open chrome://extensions/"
echo "   - Enable Developer mode"
echo "   - Click 'Load unpacked' and select the extension folder"
echo ""
echo "📺 Test on YouTube:"
echo "   - Go to any YouTube video"
echo "   - Click the WatchTogether extension icon"
echo "   - Enter your name and create a room"
echo "   - Share the room code with a friend"
echo "   - The 💬 button should appear in the bottom-right"
echo "   - Open chat and send messages"
echo "   - Try reactions (❤️, 😂, 😮, 👏, 🔥)"
echo "   - Play/pause/seek the video to test sync"
echo ""
echo "🎬 Test on Netflix:"
echo "   - Go to any Netflix title"
echo "   - Click the WatchTogether extension icon"
echo "   - Enter your name and create a room"
echo "   - The 💬 button should appear (CSP-compatible)"
echo "   - Test chat, reactions, and sync"
echo ""
echo "🔍 Debugging:"
echo "   - Check Chrome console (F12) for errors"
echo "   - Check extension's service worker logs"
echo "   - Server logs show in terminal"
echo ""
echo "📝 Known Issues Fixed:"
echo "   ✅ WebSocket connection with fallback transports"
echo "   ✅ Netflix CSP compatibility with programmatic injection"
echo "   ✅ Libsodium.js UMD compatibility verified"
echo "   ✅ Proper error handling and initialization"
