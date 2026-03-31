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
    console.log('Sync event received:', { roomId, payload: payload.action, hmac: hmac ? 'present' : 'MISSING' });
    const room = rooms[roomId];
    if (!room) {
      console.warn('Room not found:', roomId);
      return;
    }

    const expectedHmac = signMessage(payload, room.secret);
    if (hmac !== expectedHmac) {
      console.warn('Invalid HMAC from', socket.id, { received: hmac, expected: expectedHmac });
      return;
    }

    console.log('Forwarding sync to room members');
    socket.to(roomId).emit('sync', { payload });
  });

  socket.on('chat', ({ roomId, ciphertext }) => {
    console.log('Chat event received:', { roomId, ciphertext: ciphertext ? 'present' : 'MISSING' });
    socket.to(roomId).emit('chat', { from: socket.id, ciphertext });
  });

  socket.on('reaction', ({ roomId, emoji }) => {
    socket.to(roomId).emit('reaction', { from: socket.id, emoji });
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
