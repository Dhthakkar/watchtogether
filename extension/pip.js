// pip.js — runs in MAIN world via manifest content_scripts
// window.WatchTogetherPiP is now directly accessible from content.js via postMessage bridge

(function () {

  function createPiP() {
    const container = document.createElement('div');
    container.id = 'wt-pip';
    container.innerHTML = `
      <div id="wt-pip-inner">
        <video id="wt-remote" autoplay playsinline></video>
        <video id="wt-local"  autoplay playsinline muted></video>
        <div id="wt-pip-controls">
          <button id="wt-toggle-cam">📷</button>
          <button id="wt-toggle-mic">🎙️</button>
          <button id="wt-toggle-pip">👁️</button>
        </div>
        <div id="wt-drag-handle">⠿</div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      #wt-pip { position:fixed; bottom:24px; right:24px; z-index:2147483647; user-select:none; }
      #wt-pip-inner { display:flex; flex-direction:column; align-items:center; gap:6px;
        background:rgba(0,0,0,0.75); border-radius:12px; padding:8px;
        box-shadow:0 4px 20px rgba(0,0,0,0.6); border:1px solid rgba(255,255,255,0.1); }
      #wt-remote, #wt-local { width:120px; height:90px; border-radius:8px; background:#111; object-fit:cover; }
      #wt-pip-controls { display:flex; gap:8px; }
      #wt-pip-controls button { background:rgba(255,255,255,0.1); border:none; border-radius:6px;
        padding:4px 8px; cursor:pointer; font-size:14px; }
      #wt-pip-controls button:hover { background:rgba(255,255,255,0.25); }
      #wt-drag-handle { color:rgba(255,255,255,0.3); cursor:grab; font-size:16px; }
      #wt-pip.hidden #wt-remote, #wt-pip.hidden #wt-local,
      #wt-pip.hidden #wt-pip-controls { display:none; }
    `;
    document.head.appendChild(style);
    document.body.appendChild(container);
    return container;
  }

  function makeDraggable(container) {
    const handle = container.querySelector('#wt-drag-handle');
    let startX, startY, startRight, startBottom;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      startRight  = window.innerWidth  - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      const onMove = (e) => {
        container.style.right  = Math.max(0, startRight  + (startX - e.clientX)) + 'px';
        container.style.bottom = Math.max(0, startBottom + (startY - e.clientY)) + 'px';
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // --- LISTEN FOR COMMANDS FROM content.js VIA postMessage ---
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.wtCmd) return;
    const pip = window.WatchTogetherPiP;

    if (e.data.wtCmd === 'init') pip.init();
    if (e.data.wtCmd === 'toggleCam') pip.toggleCam();
    if (e.data.wtCmd === 'toggleMic') pip.toggleMic();
    if (e.data.wtCmd === 'destroy')   pip.destroy();
  });

  window.WatchTogetherPiP = {
    container: null,
    camOn: true,
    micOn: true,

    init() {
      if (document.getElementById('wt-pip')) return;
      this.container = createPiP();
      makeDraggable(this.container);

      this.container.querySelector('#wt-toggle-pip').addEventListener('click', () => {
        this.container.classList.toggle('hidden');
      });

      // Cam/mic toggle buttons post back to content.js (isolated world)
      this.container.querySelector('#wt-toggle-cam').addEventListener('click', () => {
        window.postMessage({ wtEvent: 'toggleCam' }, '*');
      });
      this.container.querySelector('#wt-toggle-mic').addEventListener('click', () => {
        window.postMessage({ wtEvent: 'toggleMic' }, '*');
      });
    },

    // Called from webrtc.js (same MAIN world) directly
    attachStream(stream, who) {
      const el = this.container?.querySelector(who === 'local' ? '#wt-local' : '#wt-remote');
      if (el) el.srcObject = stream;
    },

    destroy() {
      document.getElementById('wt-pip')?.remove();
      this.container = null;
    }
  };

})();
