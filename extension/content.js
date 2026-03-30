// content.js — isolated world
// Talks to pip.js + webrtc.js (MAIN world) via postMessage bridge

(function () {
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  let session = null;
  let video = null;
  let isSyncing = false;

  // --- LOAD SESSION ---
  chrome.storage.local.get('session', (result) => {
    if (!result.session) return;
    session = result.session;
    detectVideo();
    if (session.mode === 'together') initWebRTC();
  });

  // --- INIT WEBRTC VIA MAIN WORLD ---
  function initWebRTC() {
    // Tell pip.js (MAIN world) to init overlay
    window.postMessage({ wtCmd: 'init' }, '*');

    // Tell webrtc.js (MAIN world) to start — pass session data
    window.postMessage({
      wtCmd: 'startRTC',
      isHost: session.isHost,
      peerId: session.peerId || null
    }, '*');
  }

  // --- LISTEN FOR EVENTS FROM MAIN WORLD ---
  window.addEventListener('message', (e) => {
    if (e.source !== window) return;

    // Cam/mic toggle buttons clicked in pip.js
    if (e.data?.wtEvent === 'toggleCam') {
      window.postMessage({ wtCmd: 'toggleCam' }, '*');
    }
    if (e.data?.wtEvent === 'toggleMic') {
      window.postMessage({ wtCmd: 'toggleMic' }, '*');
    }

    // webrtc.js needs to send a signal — relay via background.js
    if (e.data?.wtEvent === 'signal' && session) {
      chrome.runtime.sendMessage({
        type: 'SIGNAL',
        to: session.peerId,
        signal: e.data.signal
      });
    }
  });

  // --- INCOMING FROM BACKGROUND.JS ---
  chrome.runtime.onMessage.addListener((message) => {

    // Playback sync
    if (message.event === 'sync' && video) {
      const { action, currentTime } = message.data.payload;
      isSyncing = true;
      if (action === 'play')  { video.currentTime = currentTime; video.play(); }
      if (action === 'pause') { video.currentTime = currentTime; video.pause(); }
      if (action === 'seek')  { video.currentTime = currentTime; }
      setTimeout(() => { isSyncing = false; }, 500);
    }

    // Peer joined — save peerId, trigger offer if host
    if (message.event === 'peer-joined' && session) {
      session.peerId = message.data.peerId;
      chrome.storage.local.set({ session });
      if (session.isHost) {
        window.postMessage({ wtCmd: 'startRTC', isHost: true, peerId: session.peerId }, '*');
      }
    }

    // WebRTC signal arrived — forward to webrtc.js in MAIN world
    if (message.event === 'signal') {
      window.postMessage({ wtCmd: 'rtcSignal', signal: message.data.signal }, '*');
    }

    // Peer left
    if (message.event === 'peer-left') {
      window.postMessage({ wtCmd: 'destroy' }, '*');
    }
  });

  // --- VIDEO DETECTION + SYNC ---
  function detectVideo() {
    const interval = setInterval(() => {
      video = document.querySelector('video');
      if (video) { clearInterval(interval); attachVideoListeners(); }
    }, 1000);
  }

  function attachVideoListeners() {
    video.addEventListener('play',   () => sendSync('play',  video.currentTime));
    video.addEventListener('pause',  () => sendSync('pause', video.currentTime));
    video.addEventListener('seeked', () => sendSync('seek',  video.currentTime));
  }

  function sendSync(action, currentTime) {
    if (isSyncing || !session) return;
    const payload = { action, currentTime, timestamp: Date.now() };
    signPayload(payload, session.roomSecret).then(hmac => {
      chrome.runtime.sendMessage({ type: 'SYNC', roomId: session.roomId, payload, hmac });
    });
  }

  async function signPayload(payload, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

})();
