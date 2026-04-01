// server/index.js
// Main signaling server — handles room creation, joining, and WebRTC signaling

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const cors = require('cors');
app.use(cors());
app.use(express.json());

// Health check — Render.com pings this to keep server alive
app.get('/', (req, res) => res.send('WatchTogether signaling server running'));

// In-memory room store
const rooms = {};

function generateRoomId() {
  return crypto.randomBytes(3).toString('hex');
}

function signMessage(payload, secret) {
  return crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
}

io.on('connection', (socket) => {
  console.log('Socket connected:', socket.id);

  socket.on('create-room', ({ mode }) => {
    const roomId = generateRoomId();
    const roomSecret = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    rooms[roomId] = {
      mode,
      host: socket.id,
      members: [socket.id],
      secret: roomSecret,
      expiresAt,
      maxMembers: mode === 'together' ? 2 : 10
    };

    socket.join(roomId);
    socket.emit('room-created', { roomId, roomSecret, expiresAt });
    console.log('Room created:', roomId, 'mode:', mode);
  });

  socket.on('join-room', ({ roomId, displayName }) => {
    const room = rooms[roomId];

    if (!room) return socket.emit('join-error', { message: 'Room not found' });
    if (Date.now() > room.expiresAt) return socket.emit('join-error', { message: 'Invite link expired' });
    if (room.members.length >= room.maxMembers) return socket.emit('join-error', { message: 'Room is full' });

    room.members.push(socket.id);
    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.displayName = displayName;

    socket.emit('room-joined', {
      roomId,
      mode: room.mode,
      roomSecret: room.secret,
      members: room.members
    });

    socket.to(roomId).emit('peer-joined', { peerId: socket.id, displayName });
    console.log(displayName, 'joined room:', roomId);
  });

  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  socket.on('sync', ({ roomId, payload, hmac }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Phase 7: Verify HMAC signature on sync messages
    // Prevents clients from injecting fake play/pause commands
    const crypto = require('crypto');
    const secret = process.env.SYNC_SECRET || 'dev-secret-change-in-prod';
    const expected = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (hmac !== expected) {
      console.warn('Invalid HMAC on sync from', socket.id, '— dropping');
      return;
    }

    // Forward verified sync to all other room members
    socket.to(roomId).emit('sync', { payload });
  });


  socket.on('chat', ({ roomId, ciphertext }) => {
    console.log('Chat event received:', { roomId, ciphertext: ciphertext ? 'present' : 'MISSING' });
    socket.to(roomId).emit('chat', { from: socket.id, ciphertext });
  });

  socket.on('reaction', ({ roomId, emoji }) => {
    socket.to(roomId).emit('reaction', { from: socket.id, emoji });
  });


  // Relay WebRTC answer from mobile viewer back to host
  socket.on('viewer-answer', ({ answer }) => {
    socket.to(socket.data.roomId).emit('viewer-answer', { answer });
  });

  // Relay ICE candidates between host and mobile viewer
  socket.on('viewer-ice', ({ candidate }) => {
    socket.to(socket.data.roomId).emit('viewer-ice', { candidate });
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    if (roomId && rooms[roomId]) {
      rooms[roomId].members = rooms[roomId].members.filter(id => id !== socket.id);
      socket.to(roomId).emit('peer-left', { peerId: socket.id });

      if (rooms[roomId].members.length === 0) {
        delete rooms[roomId];
        console.log('Room deleted:', roomId);
      }
    }
    console.log('Socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log('Signaling server running on port', PORT));

// REST endpoints for web app lobby (same logic as socket events)
app.post('/create-room', (req, res) => {
  const { mode, displayName } = req.body;
  const roomId = generateRoomId();
  const roomSecret = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;

  rooms[roomId] = {
    mode,
    host: displayName,
    members: [displayName],
    secret: roomSecret,
    expiresAt,
    maxMembers: mode === 'together' ? 2 : 10
  };

  res.json({ roomId, roomSecret, expiresAt });
});

app.post('/join-room', (req, res) => {
  const { roomId, displayName } = req.body;
  const room = rooms[roomId];

  if (!room) return res.json({ error: 'Room not found' });
  if (Date.now() > room.expiresAt) return res.json({ error: 'Invite link expired' });
  if (room.members.length >= room.maxMembers) return res.json({ error: 'Room is full' });

  room.members.push(displayName);
  res.json({ roomId, mode: room.mode });
});

// Viewer WebRTC signaling — relay between host and mobile viewer
io.on('viewer-answer', (socket, { answer }) => {
  socket.to(socket.roomId).emit('viewer-answer', { answer });
});

io.on('viewer-ice', (socket, { candidate }) => {
  socket.to(socket.roomId).emit('viewer-ice', { candidate });
});

// HMAC sync message verification
const nacl = require('tweetnacl');
const SYNC_SECRET = process.env.SYNC_SECRET || 'dev-secret-change-in-prod';

function signMessage(payload) {
  const encoder = new TextEncoder();
  const key = encoder.encode(SYNC_SECRET);
  const msg = encoder.encode(JSON.stringify(payload));
  // Use first 32 bytes of key as nacl secretbox key
  const keyHash = nacl.hash(key).slice(0, 32);
  const nonce = nacl.randomBytes(24);
  const box = nacl.secretbox(msg, nonce, keyHash);
  return {
    ...payload,
    _sig: Buffer.from(nonce).toString('hex') + '.' + Buffer.from(box).toString('hex')
  };
}

function verifyMessage(data) {
  if (!data._sig) return false;
  try {
    const [nonceHex, boxHex] = data._sig.split('.');
    const encoder = new TextEncoder();
    const key = encoder.encode(SYNC_SECRET);
    const keyHash = nacl.hash(key).slice(0, 32);
    const nonce = Buffer.from(nonceHex, 'hex');
    const box = Buffer.from(boxHex, 'hex');
    const payload = { ...data };
    delete payload._sig;
    const opened = nacl.secretbox.open(box, nonce, keyHash);
    if (!opened) return false;
    const decoded = JSON.parse(new TextDecoder().decode(opened));
    // Verify payload matches signature
    return JSON.stringify(decoded) === JSON.stringify(payload);
  } catch { return false; }
}

module.exports._verifyMessage = verifyMessage;
module.exports._signMessage = signMessage;

// Phase 7: Periodic cleanup of expired rooms every 5 minutes
// Prevents memory leak from abandoned rooms on free-tier server
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  Object.keys(rooms).forEach(roomId => {
    if (rooms[roomId].expiresAt && now > rooms[roomId].expiresAt) {
      delete rooms[roomId];
      cleaned++;
    }
  });
  if (cleaned > 0) console.log(`Cleaned ${cleaned} expired rooms`);
}, 5 * 60 * 1000);
