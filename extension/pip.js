// pip.js
// Injects a draggable, toggleable PiP overlay into the streaming page
// Shows: local cam (bottom-right), remote cam (above it)
// Together mode only — not shown in Hangout

(function () {

  // --- BUILD OVERLAY DOM ---
  function createPiP() {
    const container = document.createElement('div');
    container.id = 'wt-pip';
    container.innerHTML = `
      <div id="wt-pip-inner">
        <video id="wt-remote" autoplay playsinline></video>
        <video id="wt-local"  autoplay playsinline muted></video>
        <div id="wt-pip-controls">
          <button id="wt-toggle-cam"  title="Toggle cam">📷</button>
          <button id="wt-toggle-mic"  title="Toggle mic">🎙️</button>
          <button id="wt-toggle-pip"  title="Hide/show">👁️</button>
        </div>
        <div id="wt-drag-handle">⠿</div>
      </div>
    `;

    // --- STYLES ---
    const style = document.createElement('style');
    style.textContent = `
      #wt-pip {
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 2147483647;      /* always on top */
        user-select: none;
      }
      #wt-pip-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        background: rgba(0,0,0,0.75);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.6);
        border: 1px solid rgba(255,255,255,0.1);
      }
      #wt-remote, #wt-local {
        width: 120px;
        height: 90px;
        border-radius: 8px;
        background: #111;
        object-fit: cover;
      }
      #wt-local { opacity: 0.9; }
      #wt-pip-controls {
        display: flex;
        gap: 8px;
      }
      #wt-pip-controls button {
        background: rgba(255,255,255,0.1);
        border: none;
        border-radius: 6px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.2s;
      }
      #wt-pip-controls button:hover { background: rgba(255,255,255,0.25); }
      #wt-drag-handle {
        color: rgba(255,255,255,0.3);
        cursor: grab;
        font-size: 16px;
        line-height: 1;
      }
      #wt-drag-handle:active { cursor: grabbing; }
      #wt-pip.hidden #wt-remote,
      #wt-pip.hidden #wt-local,
      #wt-pip.hidden #wt-pip-controls {
        display: none;          /* collapse vids but keep drag handle */
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(container);
    return container;
  }

  // --- DRAG LOGIC ---
  function makeDraggable(container) {
    const handle = container.querySelector('#wt-drag-handle');
    let startX, startY, startRight, startBottom;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      startX      = e.clientX;
      startY      = e.clientY;
      startRight  = window.innerWidth  - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      function onMove(e) {
        const dx = startX - e.clientX;   // inverted: drag left = right increases
        const dy = startY - e.clientY;
        container.style.right  = Math.max(0, startRight  + dx) + 'px';
        container.style.bottom = Math.max(0, startBottom + dy) + 'px';
      }

      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // --- PUBLIC INIT ---
  window.WatchTogetherPiP = {
    container: null,

    init() {
      if (document.getElementById('wt-pip')) return; // already injected
      this.container = createPiP();
      makeDraggable(this.container);

      // Toggle PiP visibility
      this.container.querySelector('#wt-toggle-pip').addEventListener('click', () => {
        this.container.classList.toggle('hidden');
      });

      return this.container;
    },

    // Attach MediaStream to local or remote video element
    attachStream(stream, who) {
      const el = this.container?.querySelector(who === 'local' ? '#wt-local' : '#wt-remote');
      if (el) el.srcObject = stream;
    },

    // Called by content.js cam/mic toggle buttons
    onToggleCam(cb)  { this.container?.querySelector('#wt-toggle-cam').addEventListener('click', cb); },
    onToggleMic(cb)  { this.container?.querySelector('#wt-toggle-mic').addEventListener('click', cb); },

    destroy() {
      document.getElementById('wt-pip')?.remove();
      document.querySelector('style[data-wt]')?.remove();
      this.container = null;
    }
  };

})();
