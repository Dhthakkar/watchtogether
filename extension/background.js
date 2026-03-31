// background.js — Phase 5 fix: direct local tab forwarding + server relay

importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3001';
let socket = null;

function connectSocket() {
  if (socket && socket.connected) return;
  socket = io(SERVER_URL, { transports: ['websocket', 'polling'], timeout: 20000 });
  socket.on('connect', () => console.log('WT: connected', socket.id));
  socket.on('disconnect', () => console.log('WT: disconnected'));
  socket.on('connect_error', (e) => console.log('WT: error', e.message));

  // Server events → forward to all tabs
  ['sync', 'chat', 'reaction', 'peer-joined', 'peer-left', 'signal'].forEach(event => {
    socket.on(event, (data) => broadcastToAllTabs(event, data, null));
  });
}

// Broadcast to ALL tabs except the sender tab
function broadcastToAllTabs(event, data, senderTabId) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id !== senderTabId) {
        chrome.tabs.sendMessage(tab.id, { event, data }).catch(() => {});
      }
    });
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  connectSocket();
  const senderTabId = sender.tab ? sender.tab.id : null;

  if (message.type === 'CREATE_ROOM') {
    socket.emit('create-room', { mode: message.mode });
    socket.once('room-created', (data) => sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret }));
    socket.once('join-error', (data) => sendResponse({ error: data.message }));
    return true;
  }

  if (message.type === 'JOIN_ROOM') {
    socket.emit('join-room', { roomId: message.roomId, displayName: message.displayName });
    socket.once('room-joined', (data) => sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret, mode: data.mode }));
    socket.once('join-error', (data) => sendResponse({ error: data.message }));
    return true;
  }

  if (message.type === 'SYNC') {
    // Forward directly to all other tabs immediately — don't rely on server round-trip
    broadcastToAllTabs('sync', { payload: message.payload }, senderTabId);
    // Also relay to server for future multi-device support
    socket.emit('sync', { roomId: message.roomId, payload: message.payload, hmac: message.hmac });
    return false;
  }

  if (message.type === 'CHAT') {
    // Forward directly to all other tabs
    broadcastToAllTabs('chat', { from: message.displayName || 'Buddy', ciphertext: message.ciphertext }, senderTabId);
    socket.emit('chat', { roomId: message.roomId, ciphertext: message.ciphertext });
    return false;
  }

  if (message.type === 'REACTION') {
    broadcastToAllTabs('reaction', { emoji: message.emoji }, senderTabId);
    socket.emit('reaction', { roomId: message.roomId, emoji: message.emoji });
    return false;
  }

  if (message.type === 'SIGNAL') {
    socket.emit('signal', { to: message.to, signal: message.signal });
    return false;
  }
});

connectSocket();
