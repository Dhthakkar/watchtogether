// app/viewer/page.js — Mobile viewer mode
// Phone joins via web app: sees screen share, can chat/react, no playback control

'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import DOMPurify from 'dompurify';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

// ICE servers — swap with real TURN creds before deploy
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
];

const REACTIONS = ['❤️', '😂', '😮', '👏', '🔥', '😭'];

export default function ViewerPage() {
  // ── state ────────────────────────────────────────────────────────────────
  const [phase, setPhase]         = useState('join');   // join | waiting | watching
  const [roomId, setRoomId]       = useState('');
  const [displayName, setName]    = useState('');
  const [error, setError]         = useState('');
  const [messages, setMessages]   = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [reactions, setReactions] = useState([]);       // floating emoji on screen
  const [peers, setPeers]         = useState([]);       // connected host names

  // ── refs ──────────────────────────────────────────────────────────────────
  const socketRef  = useRef(null);
  const pcRef      = useRef(null);       // RTCPeerConnection for screen share
  const videoRef   = useRef(null);       // <video> element for screen share
  const chatEndRef = useRef(null);
  const reactionId = useRef(0);

  // ── auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  // ── WebRTC: receive screen share from host ─────────────────────────────
  const setupPeerConnection = useCallback((socket) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;

    // when we receive the host's screen track → attach to <video>
    pc.ontrack = (e) => {
      if (videoRef.current && e.streams[0]) {
        videoRef.current.srcObject = e.streams[0];
      }
    };

    // relay ICE candidates to host via server
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('viewer-ice', { candidate: e.candidate });
      }
    };

    return pc;
  }, []);

  // ── join room ─────────────────────────────────────────────────────────────
  const joinRoom = async () => {
    if (!displayName.trim()) return setError('Enter your name');
    if (!roomId.trim())      return setError('Enter a room code');
    setError('');

    // verify room exists
    try {
      const res  = await fetch(`${SERVER_URL}/join-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: roomId.trim().toLowerCase(), displayName }),
      });
      const data = await res.json();
      if (data.error) return setError(data.error);
    } catch {
      return setError('Server unreachable');
    }

    // connect socket
    const socket = io(SERVER_URL);
    socketRef.current = socket;

    socket.on('connect', () => {
      // join as viewer (not host, cannot control playback)
      socket.emit('join', { roomId: roomId.trim().toLowerCase(), displayName, role: 'viewer' });
    });

    // host started sharing screen → create WebRTC offer/answer
    socket.on('host-offer', async ({ offer }) => {
      const pc = setupPeerConnection(socket);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('viewer-answer', { answer });
      setPhase('watching');
    });

    // ICE from host
    socket.on('host-ice', async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    });

    // chat from host/other viewers
    socket.on('chat', ({ from, text }) => {
      setMessages(prev => [...prev, { from, text, id: Date.now() }]);
    });

    // reaction from anyone
    socket.on('reaction', ({ emoji }) => {
      addFloatingReaction(emoji);
    });

    // room member list update
    socket.on('room-members', ({ members }) => {
      setPeers(members.filter(m => m !== displayName));
    });

    socket.on('connect_error', () => setError('Connection failed'));

    setPhase('waiting');
  };

  // ── send chat ─────────────────────────────────────────────────────────────
  const sendChat = () => {
    if (!chatInput.trim()) return;
    const text = DOMPurify.sanitize(chatInput.trim().slice(0, 300), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    socketRef.current?.emit('chat', { roomId: roomId.trim().toLowerCase(), text, displayName });
    setMessages(prev => [...prev, { from: 'You', text, id: Date.now() }]);
    setChatInput('');
  };

  // ── send reaction ─────────────────────────────────────────────────────────
  const sendReaction = (emoji) => {
    socketRef.current?.emit('reaction', { roomId: roomId.trim().toLowerCase(), emoji });
    addFloatingReaction(emoji);
  };

  // ── floating emoji animation ──────────────────────────────────────────────
  const addFloatingReaction = (emoji) => {
    const id   = reactionId.current++;
    const left = 10 + Math.random() * 80; // random horizontal position %
    setReactions(prev => [...prev, { id, emoji, left }]);
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== id));
    }, 2500);
  };

  // ── render: join form ─────────────────────────────────────────────────────
  if (phase === 'join') return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0f0f0f]">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-2xl font-bold text-red-600 mb-1">🎬 WatchTogether</div>
          <div className="text-sm text-gray-400">Mobile viewer</div>
        </div>

        <div className="mb-4">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Your Name</label>
          <input
            type="text" value={displayName}
            onChange={e => setName(e.target.value)}
            placeholder="Enter your name" maxLength={20}
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600"
          />
        </div>

        <div className="mb-6">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Room Code</label>
          <input
            type="text" value={roomId}
            onChange={e => setRoomId(e.target.value)}
            placeholder="6-letter code" maxLength={6}
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600"
          />
        </div>

        {error && <div className="mb-4 text-sm text-red-500 text-center">{error}</div>}

        <button
          onClick={joinRoom}
          className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm"
        >
          Join as Viewer
        </button>
      </div>
    </main>
  );

  // ── render: waiting for host to share ─────────────────────────────────────
  if (phase === 'waiting') return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-[#0f0f0f]">
      <div className="text-center">
        <div className="text-4xl mb-4 animate-pulse">⏳</div>
        <div className="text-white font-semibold mb-2">Waiting for host to share screen…</div>
        <div className="text-sm text-gray-500">Room: <span className="text-gray-300">{roomId}</span></div>
      </div>
    </main>
  );

  // ── render: watching ─────────────────────────────────────────────────────
  return (
    <main className="flex flex-col h-screen bg-black overflow-hidden">

      {/* Screen share video — takes most of the screen */}
      <div className="relative flex-1 bg-gray-950 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay playsInline
          className="w-full h-full object-contain"
        />

        {/* Floating reactions overlay */}
        {reactions.map(r => (
          <div
            key={r.id}
            className="absolute bottom-16 text-3xl pointer-events-none animate-bounce"
            style={{ left: `${r.left}%`, animation: 'floatUp 2.5s ease-out forwards' }}
          >
            {r.emoji}
          </div>
        ))}

        {/* Room info badge */}
        <div className="absolute top-2 left-2 bg-black/50 rounded-full px-3 py-1 text-xs text-gray-300">
          Room: {roomId}
        </div>

        {/* Viewer-only badge — no playback control */}
        <div className="absolute top-2 right-2 bg-black/50 rounded-full px-3 py-1 text-xs text-gray-400">
          👁 Viewer
        </div>
      </div>

      {/* Reaction bar */}
      <div className="flex justify-around items-center px-4 py-2 bg-gray-900 border-t border-gray-800">
        {REACTIONS.map(emoji => (
          <button
            key={emoji}
            onClick={() => sendReaction(emoji)}
            className="text-2xl active:scale-125 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Chat */}
      <div className="bg-gray-950 border-t border-gray-800" style={{ maxHeight: '35vh' }}>
        {/* Messages */}
        <div className="overflow-y-auto px-3 py-2" style={{ maxHeight: '25vh' }}>
          {messages.map(m => (
            <div key={m.id} className="text-sm mb-1">
              <span className="text-red-500 font-medium">{m.from}: </span>
              <span className="text-gray-200">{m.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 px-3 pb-3 pt-1">
          <input
            type="text" value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendChat()}
            placeholder="Say something…" maxLength={300}
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-full text-sm text-white placeholder-gray-600 focus:outline-none"
          />
          <button
            onClick={sendChat}
            className="bg-red-600 hover:bg-red-700 text-white rounded-full px-4 py-2 text-sm font-medium"
          >
            Send
          </button>
        </div>
      </div>

      {/* Float-up keyframe (injected inline for portability) */}
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0)   scale(1);   opacity: 1; }
          100% { transform: translateY(-80px) scale(1.4); opacity: 0; }
        }
      `}</style>
    </main>
  );
}
