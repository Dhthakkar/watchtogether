// webrtc.js
// Manages RTCPeerConnection for Together mode face cam
// Handles: getUserMedia, offer/answer, ICE candidates, stream attach

const TURN_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // TURN creds injected at runtime from Metered.ca (Phase 7)
    // { urls: 'turn:...', username: '...', credential: '...' }
  ]
};

class WatchTogetherWebRTC {
  constructor({ onRemoteStream, onSignal }) {
    this.pc = null;
    this.localStream = null;
    this.onRemoteStream = onRemoteStream; // cb: receives remote MediaStream
    this.onSignal = onSignal;             // cb: sends signal via background.js
  }

  // --- START LOCAL CAM ---
  async startLocalStream() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: { width: 160, height: 120, facingMode: 'user' },
      audio: true
    });
    return this.localStream;
  }

  // --- CREATE PEER CONNECTION ---
  createPeer() {
    this.pc = new RTCPeerConnection(TURN_CONFIG);

    // Add local tracks to the connection
    this.localStream.getTracks().forEach(track => {
      this.pc.addTrack(track, this.localStream);
    });

    // When remote track arrives, surface it via callback
    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.onRemoteStream(e.streams[0]);
    };

    // Send ICE candidates to peer via signaling server
    this.pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.onSignal({ type: 'ice', candidate: e.candidate });
      }
    };
  }

  // --- HOST: CREATE OFFER ---
  async createOffer() {
    this.createPeer();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.onSignal({ type: 'offer', sdp: offer });
  }

  // --- GUEST: HANDLE OFFER + CREATE ANSWER ---
  async handleOffer(sdp) {
    this.createPeer();
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    this.onSignal({ type: 'answer', sdp: answer });
  }

  // --- HOST: HANDLE ANSWER ---
  async handleAnswer(sdp) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
  }

  // --- BOTH: ADD ICE CANDIDATE ---
  async handleIce(candidate) {
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.warn('WatchTogether: ICE error', e);
    }
  }

  // --- TOGGLE CAM ON/OFF ---
  toggleVideo(enabled) {
    this.localStream?.getVideoTracks().forEach(t => t.enabled = enabled);
  }

  // --- TOGGLE MIC ON/OFF ---
  toggleAudio(enabled) {
    this.localStream?.getAudioTracks().forEach(t => t.enabled = enabled);
  }

  // --- CLEANUP ---
  destroy() {
    this.localStream?.getTracks().forEach(t => t.stop());
    this.pc?.close();
    this.pc = null;
    this.localStream = null;
  }
}
