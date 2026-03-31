// background.js
// Service worker — persistent socket connection + message bridge

importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3001'; // swap to Render URL in Phase 7

let socket = null;

function connectSocket() {
  if (socket && socket.connected) return;

  socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true
  });

  socket.on('connect', () => console.log('WatchTogether: socket connected', socket.id));
  socket.on('disconnect', () => console.log('WatchTogether: socket disconnected'));
  socket.on('connect_error', (err) => console.log('WatchTogether: connection error:', err.message));

  const forwardEvents = ['sync', 'chat', 'reaction', 'peer-joined', 'peer-left', 'signal'];
  forwardEvents.forEach(event => {
    socket.on(event, (data) => forwardToAllTabs(event, data));
  });
}

// --- FORWARD TO ALL STREAMING SITE TABS (not just active tab) ---
function forwardToAllTabs(event, data) {
  const streamingPatterns = [
    'https://www.netflix.com/*',
    'https://www.youtube.com/*',
    'https://www.amazon.com/*',
    'https://www.primevideo.com/*',
    'https://www.hotstar.com/*',
    'https://www.sonyliv.com/*'
  ];

  chrome.tabs.query({ url: streamingPatterns, includeIncognito: true }, (tabs) => {
    console.log(`Forwarding ${event} to ${tabs.length} tabs:`, tabs.map(t => t.url));
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, { event, data }).catch(() => {});
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  connectSocket();

  if (message.type === 'CREATE_ROOM') {
    socket.emit('create-room', { mode: message.mode });
    socket.once('room-created', (data) => sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret }));
    socket.once('join-error',   (data) => sendResponse({ error: data.message }));
    return true;
  }

  if (message.type === 'JOIN_ROOM') {
    socket.emit('join-room', { roomId: message.roomId, displayName: message.displayName });
    socket.once('room-joined', (data) => sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret, mode: data.mode }));
    socket.once('join-error',  (data) => sendResponse({ error: data.message }));
    return true;
  }

  if (message.type === 'SYNC')     { socket.emit('sync',     { roomId: message.roomId, payload: message.payload, hmac: message.hmac }); return false; }
  if (message.type === 'CHAT')     { socket.emit('chat',     { roomId: message.roomId, ciphertext: message.ciphertext }); return false; }
  if (message.type === 'REACTION') { socket.emit('reaction', { roomId: message.roomId, emoji: message.emoji }); return false; }
  if (message.type === 'SIGNAL')   { socket.emit('signal',   { to: message.to, signal: message.signal }); return false; }
});

connectSocket();
