// content.js
// Injected into streaming sites — detects video, syncs play/pause/seek with room

(function () {
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  let session = null;
  let video = null;
  let isSyncing = false; // prevents echo loop when we apply incoming sync

  // --- LOAD SESSION ---
  chrome.storage.local.get('session', (result) => {
    if (!result.session) return;
    session = result.session;
    console.log('WatchTogether: session active', session.roomId);
    detectVideo();
  });

  // --- DETECT VIDEO ELEMENT ---
  // Streaming sites load video dynamically, so we poll until found
  function detectVideo() {
    const interval = setInterval(() => {
      // Each site may have video inside shadow DOM or iframes — query broadly
      video = document.querySelector('video');
      if (video) {
        clearInterval(interval);
        console.log('WatchTogether: video found on', window.location.hostname);
        attachListeners();
        showOverlay(); // show sync indicator badge
      }
    }, 1000);
  }

  // --- ATTACH PLAY/PAUSE/SEEK LISTENERS ---
  function attachListeners() {
    video.addEventListener('play',  () => sendSync('play',  video.currentTime));
    video.addEventListener('pause', () => sendSync('pause', video.currentTime));
    video.addEventListener('seeked',() => sendSync('seek',  video.currentTime));
  }

  // --- SEND SYNC TO BACKGROUND ---
  async function sendSync(action, currentTime) {
    if (isSyncing) return; // don't echo back incoming syncs
    if (!session) return;

    const payload = { action, currentTime, timestamp: Date.now() };
    const hmac = await signPayload(payload, session.roomSecret);

    chrome.runtime.sendMessage({
      type: 'SYNC',
      roomId: session.roomId,
      payload,
      hmac
    });
  }

  // --- HMAC SIGN using Web Crypto API ---
  async function signPayload(payload, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // --- RECEIVE SYNC FROM BACKGROUND ---
  chrome.runtime.onMessage.addListener((message) => {
    if (!video || message.event !== 'sync') return;

    const { action, currentTime } = message.data.payload;

    isSyncing = true; // block outgoing echo while we apply this

    // Clamp seek drift — only seek if > 2s apart to avoid jitter
    const drift = Math.abs(video.currentTime - currentTime);

    if (action === 'play') {
      if (drift > 2) video.currentTime = currentTime;
      video.play();
    } else if (action === 'pause') {
      if (drift > 2) video.currentTime = currentTime;
      video.pause();
    } else if (action === 'seek') {
      video.currentTime = currentTime;
    }

    setTimeout(() => { isSyncing = false; }, 500);
  });

  // --- OVERLAY BADGE ---
  // Small indicator so user knows sync is active
  function showOverlay() {
    const badge = document.createElement('div');
    badge.id = 'wt-badge';
    badge.textContent = '🎬 WatchTogether Active';
    badge.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(229,9,20,0.9);
      color: white;
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-family: sans-serif;
      z-index: 999999;
      pointer-events: none;
      transition: opacity 0.5s;
    `;
    document.body.appendChild(badge);

    // Fade out after 4 seconds
    setTimeout(() => { badge.style.opacity = '0'; }, 4000);
    setTimeout(() => { badge.remove(); }, 4500);
  }

})();
