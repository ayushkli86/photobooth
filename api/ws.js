/**
 * WebSocket signaling server for Vercel
 * Socket.io with path: /api/ws to match Vercel routing
 */
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer();
const io = new Server(server, {
  path: '/api/ws',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  addTrailingSlash: false,
  transports: ['websocket', 'polling'],
  pingInterval: 25000,
  pingTimeout: 6000,
  maxHttpBufferSize: 1e6,
});

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[ws] Connected: ${socket.id}`);

  socket.on('create-room', ({ code, userId, theme }, cb) => {
    rooms.set(code, {
      hostId: userId, hostSocket: socket.id,
      guestId: null, guestSocket: null,
      theme: theme || 'classic', state: 'waiting', currentPhoto: 0,
    });
    socket.join(code);
    console.log(`[ws] Room created: ${code}`);
    cb({ ok: true, code });
  });

  socket.on('join-room', ({ code, userId }, cb) => {
    const room = rooms.get(code);
    if (!room) return cb({ ok: false, error: 'Room not found. Check the code.' });
    if (room.guestId) return cb({ ok: false, error: 'Room is full.' });

    room.guestId = userId;
    room.guestSocket = socket.id;
    room.state = 'ready';
    socket.join(code);

    // Notify host
    io.to(room.hostSocket).emit('partner-joined', { userId });
    cb({ ok: true, code, theme: room.theme });

    // Send state to guest
    socket.emit('room-state', {
      state: room.state, currentPhoto: room.currentPhoto,
      theme: room.theme, isHost: false,
    });
    console.log(`[ws] ${userId} joined ${code}`);
  });

  socket.on('start-session', ({ code, theme }) => {
    const room = rooms.get(code);
    if (!room) return;
    room.state = 'shooting';
    room.theme = theme || room.theme;
    room.currentPhoto = 0;
    if (room.guestSocket) {
      io.to(room.guestSocket).emit('session-started', { theme: room.theme });
    }
  });

  socket.on('start-countdown', ({ code, photoIndex }) => {
    const room = rooms.get(code);
    if (!room) return;
    room.currentPhoto = photoIndex;
    io.to(code).emit('countdown', { photoIndex });
  });

  socket.on('retake', ({ code }) => {
    const room = rooms.get(code);
    if (!room) return;
    room.state = 'shooting';
    room.currentPhoto = 0;
    io.to(code).emit('retake');
  });

  socket.on('disconnect', () => {
    for (const [code, room] of rooms) {
      if (room.hostSocket === socket.id) {
        if (room.guestSocket) io.to(room.guestSocket).emit('partner-left');
        rooms.delete(code);
        console.log(`[ws] Room ${code} deleted (host left)`);
        break;
      }
      if (room.guestSocket === socket.id) {
        room.guestId = null;
        room.guestSocket = null;
        room.state = 'waiting';
        io.to(room.hostSocket).emit('partner-left');
        console.log(`[ws] Guest left ${code}`);
        break;
      }
    }
  });
});

module.exports = server;
