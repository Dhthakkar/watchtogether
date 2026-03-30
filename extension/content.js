// content.js — isolated world, all-in-one
// PiP UI + WebRTC + sync all live here, no world separation issues

(function () {
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  let session = null;
  let video = null;
  let isSyncing = false;
  let pc = null;
  let localStream = null;

  chrome.storage.local.get('session', (result) => {
    if (!result.session) return;
    session = result.session;
    detectVideo();
    if (session.mode === 'together') initPiP();
  });

  function initPiP() {
    if (document.getElementById('wt-pip')) return;

    const style = document.createElement('style');
    style.textContent = `
      #wt-pip { position:fixed; bottom:24px; right:24px; z-index:2147483647; user-select:none; }
      #wt-pip-inner { display:flex; flex-direction:column; align-items:center; gap:6px;
        background:rgba(0,0,0,0.8); border-radius:12px; padding:8px;
        box-shadow:0 4px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); }
      #wt-remote,#wt-local { width:120px; height:90px; border-radius:8px; background:#111; object-fit:cover; }
      #wt-pip-controls { display:flex; gap:8px; }
      #wt-pip-controls button { background:rgba(255,255,255,0.1); border:none; border-radius:6px;
        padding:4px 8px; cursor:pointer; font-size:14px; color:white; }
      #wt-pip-controls button:hover { background:rgba(255,255,255,0.25); }
      #wt-drag-handle { color:rgba(255,255,255,0.4); cursor:grab; font-size:16px; text-align:center; width:100%; }
      #wt-pip.hidden #wt-remote, #wt-pip.hidden #wt-local, #wt-pip.hidden #wt-pip-controls { display:none; }
    `;
    document.head.appendChild(style);

    const pip = document.createElement('div');
    pip.id = 'wt-pip';
    pip.innerHTML = `
      <div id="wt-pip-inner">
        <video id="wt-remote" autoplay playsinline></video>
        <video id="wt-local"  autoplay playsinline muted></video>
        <div id="wt-pip-controls">
          <button id="wt-btn-cam">cam</button>
          <button id="wt-btn-mic">mic</button>
          <button id="wt-btn-vis">hide</button>
        </div>
        <div id="wt-drag-handle">drag</div>
      </div>
    `;
    document.body.appendChild(pip);

    const handle = pip.querySelector('#wt-drag-handle');
    let sx, sy, sr, sb;
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const r = pip.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY;
      sr = window.innerWidth - r.right;
      sb = window.innerHeight - r.bottom;
      const mv = (e) => {
        pip.style.right  = Math.max(0, sr + (sx - e.clientX)) + 'px';
        pip.style.bottom = Math.max(0, sb + (sy - e.clientY)) + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    pip.querySelector('#wt-btn-vis').addEventListener('click', () => pip.classList.toggle('hidden'));
    pip.querySelector('#wt-btn-cam').addEventListener('click', () => {
      localStream && localStream.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    });
    pip.querySelector('#wt-btn-mic').addEventListener('click', () => {
      localStream && localStream.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    });

    startWebRTC();
  }

  async function startWebRTC() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 160, height: 120, facingMode: 'user' },
        audio: true
      });
      setStream('wt-local', localStream);

      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

      pc.ontrack = (e) => { if (e.streams[0]) setStream('wt-remote', e.streams[0]); };
      pc.onicecandidate = (e) => {
        if (e.candidate) sendSignal({ type: 'ice', candidate: e.candidate });
      };

      if (session.isHost && session.peerId) {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({ type: 'offer', sdp: offer });
      }
    } catch (err) {
      console.warn('WatchTogether WebRTC error:', err);
    }
  }

  function setStream(id, stream) {
    const el = document.getElementById(id);
    if (el) el.srcObject = stream;
  }

  function sendSignal(signal) {
    if (!session || !session.peerId) return;
    chrome.runtime.sendMessage({ type: 'SIGNAL', to: session.peerId, signal });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.event === 'sync' && video) {
      const { action, currentTime } = message.data.payload;
      isSyncing = true;
      if (action === 'play')  { video.currentTime = currentTime; video.play(); }
      if (action === 'pause') { video.currentTime = currentTime; video.pause(); }
      if (action === 'seek')  { video.currentTime = currentTime; }
      setTimeout(() => { isSyncing = false; }, 500);
    }

    if (message.event === 'peer-joined' && session) {
      session.peerId = message.data.peerId;
      chrome.storage.local.set({ session });
      if (session.isHost && pc) {
        pc.createOffer().then(offer => {
          pc.setLocalDescription(offer);
          sendSignal({ type: 'offer', sdp: offer });
        });
      } else if (!session.isHost && !pc) {
        startWebRTC();
      }
    }

    if (message.event === 'signal' && pc) {
      const sig = message.data.signal;
      if (sig.type === 'offer') {
        pc.setRemoteDescription(new RTCSessionDescription(sig.sdp))
          .then(() => pc.createAnswer())
          .then(ans => { pc.setLocalDescription(ans); sendSignal({ type: 'answer', sdp: ans }); });
      }
      if (sig.type === 'answer') pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
      if (sig.type === 'ice')    pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
    }

    if (message.event === 'peer-left') {
      localStream && localStream.getTracks().forEach(t => t.stop());
      pc && pc.close(); pc = null;
      const pip = document.getElementById('wt-pip');
      if (pip) pip.remove();
    }
  });

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
