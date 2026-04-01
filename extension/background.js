// background.js — Phase 7: HMAC-signed sync messages

importScripts('socket.io.min.js');

const SERVER_URL = 'https://watchtogether-server-f6yd.onrender.com';
let socket = null;

// Phase 7: HMAC signing using Web Crypto API (available in service workers)
// Secret must match SYNC_SECRET env var on the server
const SYNC_SECRET = '497a5b8aa82c83677a3f7456c6191accf0b6f823e7bdfa4eedde09a373f36142';

async function signPayload(payload) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(SYNC_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(payload)));
  // Convert ArrayBuffer to hex string
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

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
    // Forward directly to local tabs immediately (no round-trip needed)
    broadcastToAllTabs('sync', { payload: message.payload }, senderTabId);
    // Sign payload then relay to server for cross-device support
    signPayload(message.payload).then(hmac => {
      socket.emit('sync', { roomId: message.roomId, payload: message.payload, hmac });
    });
    return false;
  }

  if (message.type === 'CHAT') {
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
