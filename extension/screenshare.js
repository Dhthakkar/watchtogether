// screenshare.js
// Fallback for sites not in manifest host_permissions
// Captures tab screen + shares via WebRTC as a video track

(function () {
  if (window.__wtScreenshare) return;
  window.__wtScreenshare = true;

  let stream = null;

  // Called by background.js when host starts screen share mode
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message.event === 'start-screenshare') {
      try {
        // Request screen capture — browser will show picker UI
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: 30 },
          audio: true  // capture tab audio too
        });

        // Tell background the stream is ready — WebRTC will use this track
        const track = stream.getVideoTracks()[0];
        chrome.runtime.sendMessage({ type: 'SCREENSHARE_READY', trackId: track.id });

        // Show badge
        showBadge('📺 Screen share active');

        // Auto-cleanup when user stops sharing via browser UI
        track.onended = () => {
          stream = null;
          chrome.runtime.sendMessage({ type: 'SCREENSHARE_ENDED' });
        };

      } catch (err) {
        console.error('WatchTogether: screenshare failed', err);
        chrome.runtime.sendMessage({ type: 'SCREENSHARE_ERROR', error: err.message });
      }
    }

    if (message.event === 'stop-screenshare' && stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  });

  function showBadge(text) {
    const badge = document.createElement('div');
    badge.textContent = text;
    badge.style.cssText = `
      position: fixed; bottom: 20px; right: 20px;
      background: rgba(229,9,20,0.9); color: white;
      padding: 8px 14px; border-radius: 20px;
      font-size: 13px; font-family: sans-serif;
      z-index: 999999; pointer-events: none;
    `;
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 4000);
  }

})();
