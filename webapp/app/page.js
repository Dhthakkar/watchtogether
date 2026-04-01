// app/page.js — Lobby: create or join a room

'use client';

import { useState } from 'react';

const SERVER_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001';

export default function Home() {
  const [mode, setMode]           = useState('together');
  const [displayName, setName]    = useState('');
  const [roomId, setRoomId]       = useState('');
  const [status, setStatus]       = useState({ msg: '', type: '' });
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading]     = useState(false);

  async function createRoom() {
    if (!displayName.trim()) return setStatus({ msg: 'Enter your name', type: 'error' });
    setLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/create-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, displayName }),
      });
      const data = await res.json();
      if (data.error) return setStatus({ msg: data.error, type: 'error' });
      setInviteCode(data.roomId);
      setStatus({ msg: 'Room created! Share the code below.', type: 'success' });
    } catch {
      setStatus({ msg: 'Server unreachable', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  async function joinRoom() {
    if (!displayName.trim()) return setStatus({ msg: 'Enter your name', type: 'error' });
    if (!roomId.trim())      return setStatus({ msg: 'Enter a room code', type: 'error' });
    setLoading(true);
    try {
      const res  = await fetch(`${SERVER_URL}/join-room`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: roomId.trim().toLowerCase(), displayName }),
      });
      const data = await res.json();
      if (data.error) return setStatus({ msg: data.error, type: 'error' });
      setStatus({ msg: `Joined room ${data.roomId}! Open the extension to start watching.`, type: 'success' });
    } catch {
      setStatus({ msg: 'Server unreachable', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4 bg-[#0f0f0f]">
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="text-3xl font-bold text-red-600 mb-1">🎬 WatchTogether</div>
          <div className="text-sm text-gray-400">Watch with someone special</div>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 mb-6">
          {['together', 'hangout'].map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-all ${
                mode === m ? 'border-red-600 bg-red-950 text-white' : 'border-gray-700 bg-gray-900 text-gray-400'
              }`}>
              {m === 'together' ? '💑 Together' : '🎉 Hangout'}
            </button>
          ))}
        </div>

        {/* Name input */}
        <div className="mb-4">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Your Name</label>
          <input type="text" value={displayName} onChange={e => setName(e.target.value)}
            placeholder="Enter your name" maxLength={20}
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600" />
        </div>

        {/* Room code input */}
        <div className="mb-6">
          <label className="block text-xs text-gray-500 uppercase tracking-wider mb-2">Have a code?</label>
          <input type="text" value={roomId} onChange={e => setRoomId(e.target.value)}
            placeholder="Enter room code" maxLength={6}
            className="w-full px-3 py-2.5 bg-gray-900 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-red-600" />
        </div>

        {/* Buttons */}
        <button onClick={createRoom} disabled={loading}
          className="w-full py-3 mb-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50">
          Create Room
        </button>
        <button onClick={joinRoom} disabled={loading}
          className="w-full py-3 bg-gray-900 hover:bg-gray-800 text-gray-300 font-semibold rounded-lg text-sm border border-gray-700 disabled:opacity-50">
          Join Room
        </button>

        {/* Status */}
        {status.msg && (
          <div className={`mt-4 text-sm text-center ${status.type === 'error' ? 'text-red-500' : 'text-green-400'}`}>
            {status.msg}
          </div>
        )}

        {/* Invite code */}
        {inviteCode && (
          <div className="mt-4 p-3 bg-gray-900 border border-gray-700 rounded-lg text-center">
            <div className="text-xs text-gray-500 mb-1">Room Code</div>
            <div className="text-2xl font-bold tracking-widest text-white">{inviteCode}</div>
            <div className="text-xs text-gray-600 mt-1">Expires in 10 minutes</div>
          </div>
        )}

      </div>

      {/* Footer nav */}
      <footer className="mt-12 flex gap-6 text-xs text-gray-600">
        <a href="/viewer"  className="hover:text-gray-400">📱 Mobile viewer</a>
        <a href="/donate"  className="hover:text-gray-400">☕ Support</a>
        <a href="/privacy" className="hover:text-gray-400">Privacy</a>
      </footer>
    </main>
  );
}
