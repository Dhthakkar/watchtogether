// content.js
// Injected into streaming sites — detects video player and listens for sync events

(function () {
  // Prevent double injection
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  console.log('WatchTogether: content script loaded on', window.location.hostname);

  let session = null;  // room session from chrome.storage
  let video = null;    // the detected <video> element
  let isSyncing = false; // prevent sync echo loop

  // --- LOAD SESSION FROM STORAGE ---
  chrome.storage.local.get('session', (result) => {
    if (!result.session) return; // no active room
    session = result.session;
    console.log('WatchTogether: session loaded', session.roomId);
    detectVideo();
  });

  // --- DETECT VIDEO ELEMENT ---
  // Streaming sites load video dynamically — poll until found
  function detectVideo() {
    const interval = setInterval(() => {
      video = document.querySelector('video');
      if (video) {
        clearInterval(interval);
        console.log('WatchTogether: video element found');
        attachVideoListeners();
      }
    }, 1000);
  }

  // --- ATTACH PLAY/PAUSE/SEEK LISTENERS ---
  function attachVideoListeners() {
    video.addEventListener('play', () => sendSync('play', video.currentTime));
    video.addEventListener('pause', () => sendSync('pause', video.currentTime));
    video.addEventListener('seeked', () => sendSync('seek', video.currentTime));
  }

  // --- SEND SYNC EVENT TO BACKGROUND ---
  function sendSync(action, currentTime) {
    if (isSyncing) return; // ignore events triggered by incoming sync
    if (!session) return;

    const payload = {
      action,       // 'play' | 'pause' | 'seek'
      currentTime,
      timestamp: Date.now()
    };

    // HMAC signing happens server-side using roomSecret
    // For now send roomSecret with message — background.js will sign it
    chrome.runtime.sendMessage({
      type: 'SYNC',
      roomId: session.roomId,
      payload,
      hmac: signPayload(payload, session.roomSecret)
    });
  }

  // --- SIMPLE CLIENT-SIDE HMAC (Web Crypto) ---
  async function signPayload(payload, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // --- RECEIVE SYNC FROM BACKGROUND ---
  chrome.runtime.onMessage.addListener((message) => {
    if (!video) return;

    if (message.event === 'sync') {
      const { action, currentTime } = message.data.payload;

      isSyncing = true; // block echo

      if (action === 'play') {
        video.currentTime = currentTime;
        video.play();
      } else if (action === 'pause') {
        video.currentTime = currentTime;
        video.pause();
      } else if (action === 'seek') {
        video.currentTime = currentTime;
      }

      // Release echo block after event settles
      setTimeout(() => { isSyncing = false; }, 500);
    }
  });

})();
