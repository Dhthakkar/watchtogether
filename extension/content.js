// content.js
// Injected into streaming sites — sync engine + WebRTC PiP for Together mode

(function () {
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  let session = null;
  let video = null;
  let isSyncing = false;
  let rtc = null;       // WatchTogetherWebRTC instance
  let camOn = true;
  let micOn = true;

  // --- LOAD SESSION ---
  chrome.storage.local.get('session', (result) => {
    if (!result.session) return;
    session = result.session;
    detectVideo();

    // Only Together mode gets PiP face cam
    if (session.mode === 'together') {
      loadScripts(() => initWebRTC());
    }
  });

  // --- INJECT webrtc.js + pip.js dynamically ---
  // content scripts can't use import — inject via script tags
  function loadScripts(cb) {
    let loaded = 0;
    ['webrtc.js', 'pip.js'].forEach(file => {
      const s = document.createElement('script');
      s.src = chrome.runtime.getURL(file);
      s.onload = () => { if (++loaded === 2) cb(); };
      document.head.appendChild(s);
    });
  }

  // --- INIT WEBRTC + PIP ---
  async function initWebRTC() {
    // Init PiP overlay
    window.WatchTogetherPiP.init();

    // Init RTC with callbacks
    rtc = new window.WatchTogetherWebRTC({

      // Remote stream arrived — attach to PiP remote video
      onRemoteStream(stream) {
        window.WatchTogetherPiP.attachStream(stream, 'remote');
      },

      // Send signal through background.js → signaling server → peer
      onSignal(signal) {
        chrome.runtime.sendMessage({
          type: 'SIGNAL',
          to: session.peerId,   // set when peer joins (see peer-joined handler below)
          signal
        });
      }
    });

    // Start local cam
    const localStream = await rtc.startLocalStream();
    window.WatchTogetherPiP.attachStream(localStream, 'local');

    // Host creates offer; guest waits for offer via signal event
    if (session.isHost) rtc.createOffer();

    // Wire PiP buttons to RTC track toggles
    window.WatchTogetherPiP.onToggleCam(() => {
      camOn = !camOn;
      rtc.toggleVideo(camOn);
    });
    window.WatchTogetherPiP.onToggleMic(() => {
      micOn = !micOn;
      rtc.toggleAudio(micOn);
    });
  }

  // --- DETECT VIDEO ELEMENT ---
  function detectVideo() {
    const interval = setInterval(() => {
      video = document.querySelector('video');
      if (video) {
        clearInterval(interval);
        attachVideoListeners();
      }
    }, 1000);
  }

  // --- PLAYBACK SYNC LISTENERS ---
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

  // --- INCOMING MESSAGES FROM BACKGROUND ---
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

    // Peer joined — save their socket ID, host creates WebRTC offer
    if (message.event === 'peer-joined' && session) {
      session.peerId = message.data.peerId;
      chrome.storage.local.set({ session });
      if (session.isHost && rtc) rtc.createOffer();
    }

    // WebRTC signaling relay
    if (message.event === 'signal' && rtc) {
      const { signal } = message.data;
      if (signal.type === 'offer')  rtc.handleOffer(signal.sdp);
      if (signal.type === 'answer') rtc.handleAnswer(signal.sdp);
      if (signal.type === 'ice')    rtc.handleIce(signal.candidate);
    }

    // Peer left — destroy RTC + PiP
    if (message.event === 'peer-left') {
      rtc?.destroy();
      window.WatchTogetherPiP?.destroy();
    }
  });

})();
