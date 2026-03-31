// netflix-content.js - Netflix-specific content script with programmatic injection
// Handles Netflix CSP by injecting scripts dynamically

(function () {
  if (window.__watchTogetherLoaded) return;
  window.__watchTogetherLoaded = true;

  let session = null;
  let video = null;
  let isSyncing = false;
  let sodiumKey = null;
  let sodium = null;
  let DOMPurify = null;

  // --- BOOT ---
  chrome.storage.local.get('session', async (result) => {
    if (!result.session) return;
    session = result.session;
    
    // Inject dependencies for Netflix due to CSP
    await injectDependencies();
    await initEncryption();
    detectVideo();
    injectChatUI();
  });

  // --- DEPENDENCY INJECTION FOR NETFLIX CSP ---
  async function injectDependencies() {
    return new Promise((resolve) => {
      // Inject libsodium
      const sodiumScript = document.createElement('script');
      sodiumScript.src = chrome.runtime.getURL('libsodium.js');
      sodiumScript.onload = () => {
        sodium = window.sodium;
        
        // Inject DOMPurify
        const purifyScript = document.createElement('script');
        purifyScript.src = chrome.runtime.getURL('purify.min.js');
        purifyScript.onload = () => {
          DOMPurify = window.DOMPurify;
          resolve();
        };
        document.head.appendChild(purifyScript);
      };
      document.head.appendChild(sodiumScript);
    });
  }

  // ─── ENCRYPTION ────────────────────────────────────────────────────────────

  // Derive symmetric key from shared roomSecret via BLAKE2b (libsodium)
  async function initEncryption() {
    if (!sodium) {
      await new Promise(resolve => {
        const checkSodium = () => {
          if (window.sodium && window.sodium.ready) {
            sodium = window.sodium;
            resolve();
          } else {
            setTimeout(checkSodium, 100);
          }
        };
        checkSodium();
      });
    }
    
    await sodium.ready;
    sodiumKey = sodium.crypto_generichash(32, sodium.from_string(session.roomSecret));
  }

  function encryptMessage(text) {
    if (!sodium || !sodiumKey) return '';
    const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
    const cipher = sodium.crypto_secretbox_easy(sodium.from_string(text), nonce, sodiumKey);
    // Pack nonce + ciphertext together for transport
    const combined = new Uint8Array(nonce.length + cipher.length);
    combined.set(nonce);
    combined.set(cipher, nonce.length);
    return sodium.to_base64(combined);
  }

  function decryptMessage(b64) {
    if (!sodium || !sodiumKey) return null;
    try {
      const combined = sodium.from_base64(b64);
      const nonce = combined.slice(0, sodium.crypto_secretbox_NONCEBYTES);
      const cipher = combined.slice(sodium.crypto_secretbox_NONCEBYTES);
      return sodium.to_string(sodium.crypto_secretbox_open_easy(cipher, nonce, sodiumKey));
    } catch { return null; } // bad key or tampered — drop silently
  }

  // ─── CHAT UI INJECTION ─────────────────────────────────────────────────────

  function injectChatUI() {
    if (document.getElementById('wt-root')) return;

    const root = document.createElement('div');
    root.id = 'wt-root';
    root.innerHTML = `
      <style>
        #wt-root * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }

        /* Toggle button fixed bottom-right */
        #wt-toggle {
          position: fixed; bottom: 24px; right: 24px; z-index: 2147483640;
          width: 48px; height: 48px; border-radius: 50%; background: #e50914;
          border: none; cursor: pointer; font-size: 20px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(0,0,0,0.5); transition: transform 0.2s;
        }
        #wt-toggle:hover { transform: scale(1.1); }

        /* Slide-in chat panel */
        #wt-panel {
          position: fixed; bottom: 84px; right: 24px; z-index: 2147483639;
          width: 300px; height: 420px; background: rgba(12,12,12,0.96);
          border: 1px solid #2a2a2a; border-radius: 14px;
          display: flex; flex-direction: column; overflow: hidden;
          transform: translateY(20px); opacity: 0; pointer-events: none;
          transition: transform 0.25s ease, opacity 0.25s ease;
          backdrop-filter: blur(12px);
        }
        #wt-panel.open { transform: translateY(0); opacity: 1; pointer-events: all; }

        #wt-header {
          padding: 12px 16px; background: #1a1a1a;
          border-bottom: 1px solid #2a2a2a; font-size: 13px;
          color: #fff; font-weight: 600;
        }

        #wt-messages {
          flex: 1; overflow-y: auto; padding: 10px 12px;
          display: flex; flex-direction: column; gap: 7px;
          scrollbar-width: thin; scrollbar-color: #333 transparent;
        }

        .wt-msg {
          max-width: 215px; padding: 7px 10px; border-radius: 10px;
          font-size: 12px; line-height: 1.4; word-break: break-word;
        }
        .wt-msg.mine { background: #e50914; color: #fff; align-self: flex-end; border-bottom-right-radius: 3px; }
        .wt-msg.theirs { background: #252525; color: #eee; align-self: flex-start; border-bottom-left-radius: 3px; }
        .wt-sender { font-size: 10px; opacity: 0.55; margin-bottom: 2px; }

        /* Reaction bar */
        #wt-reactions {
          padding: 7px 12px; border-top: 1px solid #2a2a2a;
          display: flex; gap: 6px; justify-content: center;
        }
        .wt-rbtn {
          background: none; border: none; font-size: 20px;
          cursor: pointer; padding: 4px; border-radius: 6px; transition: transform 0.15s;
        }
        .wt-rbtn:hover { transform: scale(1.35); background: #1a1a1a; }

        /* Input row */
        #wt-input-row {
          display: flex; gap: 8px; padding: 10px 12px;
          border-top: 1px solid #2a2a2a;
        }
        #wt-input {
          flex: 1; background: #1c1c1c; border: 1px solid #333;
          border-radius: 8px; color: #fff; font-size: 12px; padding: 7px 10px; outline: none;
        }
        #wt-input:focus { border-color: #e50914; }
        #wt-send {
          background: #e50914; border: none; border-radius: 8px;
          color: #fff; font-size: 14px; padding: 7px 12px; cursor: pointer;
        }

        /* Together mode: soft floating reaction */
        .wt-float {
          position: fixed; font-size: 28px; z-index: 2147483645;
          pointer-events: none;
          animation: wt-rise 2s ease-out forwards;
        }
        @keyframes wt-rise {
          0%   { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-130px) scale(1.5); opacity: 0; }
        }

        /* Hangout mode: full-screen burst */
        #wt-burst {
          display: none; position: fixed; inset: 0; z-index: 2147483647;
          pointer-events: none; align-items: center; justify-content: center;
        }
        #wt-burst.active { display: flex; }
        .wt-burst-e {
          position: absolute; font-size: 58px; pointer-events: none;
          animation: wt-explode 1.3s ease-out forwards;
        }
        @keyframes wt-explode {
          0%   { transform: scale(0) translate(0,0); opacity: 1; }
          60%  { opacity: 1; }
          100% { transform: scale(1.6) translate(var(--tx), var(--ty)); opacity: 0; }
        }
      </style>

      <button id="wt-toggle">💬</button>

      <div id="wt-panel">
        <div id="wt-header">💬 WatchTogether</div>
        <div id="wt-messages"></div>
        <div id="wt-reactions">
          <button class="wt-rbtn" data-e="❤️">❤️</button>
          <button class="wt-rbtn" data-e="😂">😂</button>
          <button class="wt-rbtn" data-e="😮">😮</button>
          <button class="wt-rbtn" data-e="👏">👏</button>
          <button class="wt-rbtn" data-e="🔥">🔥</button>
        </div>
        <div id="wt-input-row">
          <input id="wt-input" type="text" placeholder="Message..." maxlength="200" />
          <button id="wt-send">➤</button>
        </div>
      </div>

      <div id="wt-burst"></div>
    `;

    document.body.appendChild(root);

    // Toggle panel
    let open = false;
    const panel = document.getElementById('wt-panel');
    document.getElementById('wt-toggle').addEventListener('click', () => {
      open = !open;
      panel.classList.toggle('open', open);
    });

    // Send message
    const input = document.getElementById('wt-input');
    const doSend = () => {
      const raw = input.value.trim();
      if (!raw || !DOMPurify) return;
      // DOMPurify strips all tags/attrs — plain text only
      const clean = DOMPurify.sanitize(raw, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      if (!clean) return;
      sendChat(clean);
      appendMsg(clean, session.displayName, true);
      input.value = '';
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doSend(); });
    document.getElementById('wt-send').addEventListener('click', doSend);

    // Reaction buttons
    document.querySelectorAll('.wt-rbtn').forEach(btn => {
      btn.addEventListener('click', () => {
        sendReaction(btn.dataset.e);
        showReaction(btn.dataset.e); // show locally immediately
      });
    });
  }

  // ─── CHAT HELPERS ──────────────────────────────────────────────────────────

  function sendChat(plaintext) {
    if (!sodiumKey) return;
    chrome.runtime.sendMessage({
      type: 'CHAT',
      roomId: session.roomId,
      ciphertext: encryptMessage(plaintext)
    });
  }

  function sendReaction(emoji) {
    chrome.runtime.sendMessage({ type: 'REACTION', roomId: session.roomId, emoji });
  }

  function appendMsg(text, sender, isMine) {
    const box = document.getElementById('wt-messages');
    if (!box) return;
    const wrap = document.createElement('div');
    wrap.className = 'wt-msg ' + (isMine ? 'mine' : 'theirs');
    if (!isMine) {
      const s = document.createElement('div');
      s.className = 'wt-sender';
      s.textContent = sender; // textContent — no innerHTML, XSS safe
      wrap.appendChild(s);
    }
    const b = document.createElement('div');
    b.textContent = text; // textContent always — never innerHTML for user content
    wrap.appendChild(b);
    box.appendChild(wrap);
    box.scrollTop = box.scrollHeight;
  }

  function showReaction(emoji) {
    if (session && session.mode === 'hangout') {
      showBurst(emoji);
    } else {
      showFloat(emoji);
    }
  }

  // Together: gentle float up from bottom-right corner
  function showFloat(emoji) {
    const el = document.createElement('div');
    el.className = 'wt-float';
    el.textContent = emoji;
    el.style.right = (60 + Math.random() * 80) + 'px';
    el.style.bottom = '80px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // Hangout: 12 emojis exploding outward from screen center
  function showBurst(emoji) {
    const overlay = document.getElementById('wt-burst');
    if (!overlay) return;
    overlay.innerHTML = '';
    overlay.classList.add('active');
    for (let i = 0; i < 12; i++) {
      const el = document.createElement('div');
      el.className = 'wt-burst-e';
      el.textContent = emoji;
      const angle = (i / 12) * 360 + (Math.random() * 25 - 12);
      const dist = 180 + Math.random() * 130;
      const rad = (angle * Math.PI) / 180;
      el.style.setProperty('--tx', Math.round(Math.cos(rad) * dist) + 'px');
      el.style.setProperty('--ty', Math.round(Math.sin(rad) * dist) + 'px');
      el.style.animationDelay = (Math.random() * 0.12) + 's';
      overlay.appendChild(el);
    }
    setTimeout(() => { overlay.classList.remove('active'); overlay.innerHTML = ''; }, 1500);
  }

  // ─── SYNC ENGINE (unchanged from Phase 3) ──────────────────────────────────

  function detectVideo() {
    const interval = setInterval(() => {
      video = document.querySelector('video');
      if (video) { clearInterval(interval); attachVideoListeners(); }
    }, 1000);
  }

  function attachVideoListeners() {
    video.addEventListener('play',  () => sendSync('play',  video.currentTime));
    video.addEventListener('pause', () => sendSync('pause', video.currentTime));
    video.addEventListener('seeked',() => sendSync('seek',  video.currentTime));
  }

  async function sendSync(action, currentTime) {
    if (isSyncing || !session) return;
    const payload = { action, currentTime, timestamp: Date.now() };
    const hmac = await signPayload(payload, session.roomSecret);
    console.log('Sending sync (Netflix):', { action, currentTime, hmac: hmac ? 'generated' : 'failed' });
    chrome.runtime.sendMessage({
      type: 'SYNC',
      roomId: session.roomId,
      payload,
      hmac
    });
  }

  async function signPayload(payload, secret) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(JSON.stringify(payload)));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // ─── INCOMING MESSAGES FROM BACKGROUND ────────────────────────────────────

  chrome.runtime.onMessage.addListener((message) => {
    console.log('Netflix content script received message:', message);

    // Playback sync
    if (message.event === 'sync' && video) {
      console.log('Processing sync event (Netflix):', message.data.payload);
      const { action, currentTime } = message.data.payload;
      isSyncing = true;
      if (action === 'play')  { video.currentTime = currentTime; video.play(); }
      if (action === 'pause') { video.currentTime = currentTime; video.pause(); }
      if (action === 'seek')  { video.currentTime = currentTime; }
      setTimeout(() => { isSyncing = false; }, 500);
    }

    // Chat — decrypt → sanitize → render
    if (message.event === 'chat') {
      console.log('Processing chat event (Netflix) from:', message.data.from);
      if (!sodiumKey || !DOMPurify) return;
      const plain = decryptMessage(message.data.ciphertext);
      if (!plain) return; // drop if decryption fails
      const safe = DOMPurify.sanitize(plain, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
      appendMsg(safe, message.data.from, false);
    }

    // Reaction from peer
    if (message.event === 'reaction') {
      showReaction(message.data.emoji);
    }
  });

})();
