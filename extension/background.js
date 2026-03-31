// background.js
// Service worker — persistent socket connection + message bridge between popup and content script

importScripts('socket.io.min.js');

const SERVER_URL = 'http://localhost:3001'; // swap to Render URL in Phase 7

let socket = null;

// --- CONNECT TO SIGNALING SERVER ---
function connectSocket() {
  if (socket && socket.connected) return;

  socket = io(SERVER_URL, { 
    transports: ['websocket', 'polling'],
    timeout: 20000,
    forceNew: true
  });

  socket.on('connect', () => console.log('WatchTogether: socket connected', socket.id));
  socket.on('disconnect', () => console.log('WatchTogether: socket disconnected'));
  socket.on('connect_error', (error) => console.log('WatchTogether: socket connection error:', error.message));

  // Forward all server events to content script via chrome.tabs
  const forwardEvents = ['sync', 'chat', 'reaction', 'peer-joined', 'peer-left', 'signal'];
  forwardEvents.forEach(event => {
    socket.on(event, (data) => forwardToContentScript(event, data));
  });
}

// --- FORWARD TO ACTIVE TAB CONTENT SCRIPT ---
function forwardToContentScript(event, data) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { event, data }).catch(() => {
        // Content script not ready yet — ignore silently
      });
    }
  });
}

// --- HANDLE MESSAGES FROM POPUP ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  connectSocket(); // ensure socket is alive

  if (message.type === 'CREATE_ROOM') {
    socket.emit('create-room', { mode: message.mode });

    // Wait for server response
    socket.once('room-created', (data) => {
      sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret });
    });

    socket.once('join-error', (data) => {
      sendResponse({ error: data.message });
    });

    return true; // keep message channel open for async response
  }

  if (message.type === 'JOIN_ROOM') {
    socket.emit('join-room', { roomId: message.roomId, displayName: message.displayName });

    socket.once('room-joined', (data) => {
      sendResponse({ roomId: data.roomId, roomSecret: data.roomSecret, mode: data.mode });
    });

    socket.once('join-error', (data) => {
      sendResponse({ error: data.message });
    });

    return true;
  }

  if (message.type === 'SYNC') {
    // Content script sending a playback sync event
    socket.emit('sync', {
      roomId: message.roomId,
      payload: message.payload,
      hmac: message.hmac
    });
    return false;
  }

  if (message.type === 'CHAT') {
    socket.emit('chat', { roomId: message.roomId, ciphertext: message.ciphertext });
    return false;
  }

  if (message.type === 'REACTION') {
    socket.emit('reaction', { roomId: message.roomId, emoji: message.emoji });
    return false;
  }

  if (message.type === 'SIGNAL') {
    socket.emit('signal', { to: message.to, signal: message.signal });
    return false;
  }
});

// Connect immediately when service worker starts
connectSocket();
