// webrtc.js — runs in MAIN world
// Listens for commands from content.js via postMessage

const TURN_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

(function () {
  let pc = null;
  let localStream = null;

  async function startRTC(isHost, peerId) {
    // Get local cam
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 160, height: 120, facingMode: 'user' },
      audio: true
    });
    window.WatchTogetherPiP.attachStream(localStream, 'local');

    pc = new RTCPeerConnection(TURN_CONFIG);
    localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

    pc.ontrack = (e) => {
      if (e.streams[0]) window.WatchTogetherPiP.attachStream(e.streams[0], 'remote');
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        window.postMessage({ wtEvent: 'signal', signal: { type: 'ice', candidate: e.candidate } }, '*');
      }
    };

    if (isHost) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      window.postMessage({ wtEvent: 'signal', signal: { type: 'offer', sdp: offer } }, '*');
    }
  }

  window.addEventListener('message', async (e) => {
    if (e.source !== window || !e.data?.wtCmd) return;

    if (e.data.wtCmd === 'startRTC') {
      await startRTC(e.data.isHost, e.data.peerId);
    }

    if (e.data.wtCmd === 'rtcSignal' && pc) {
      const { signal } = e.data;
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        window.postMessage({ wtEvent: 'signal', signal: { type: 'answer', sdp: answer } }, '*');
      }
      if (signal.type === 'answer') await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      if (signal.type === 'ice')    await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
    }

    if (e.data.wtCmd === 'toggleCam' && localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
    }
    if (e.data.wtCmd === 'toggleMic' && localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
    }
    if (e.data.wtCmd === 'destroy') {
      localStream?.getTracks().forEach(t => t.stop());
      pc?.close(); pc = null; localStream = null;
    }
  });
})();
