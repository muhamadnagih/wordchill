const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { RoomManager } = require('./roomManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const roomManager = new RoomManager();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.post('/api/solo/start', (req, res) => {
  try {
    const { wordLength, maxAttempts } = req.body || {};
    const session = roomManager.createSoloGame({ wordLength, maxAttempts });
    res.json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/solo/guess', (req, res) => {
  const { sessionId, guess } = req.body || {};
  const result = roomManager.submitSoloGuess(sessionId, guess);
  if (result.error) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true, ...result });
});

app.get('/api/rooms/public', (req, res) => {
  res.json({ ok: true, rooms: roomManager.getPublicWaitingRooms() });
});

function broadcastRoomState(room) {
  for (const player of room.players.values()) {
    if (player.connected && player.socketId) {
      const personalizedState = roomManager.serializeRoomForPlayer(room, player.id);
      io.to(player.socketId).emit('room:state', personalizedState);
    }
  }
}

io.on('connection', (socket) => {
  socket.on('room:create', (payload, callback) => {
    const { playerId, playerName, roomName, wordLength, maxPlayers, maxAttempts, isPublic } = payload || {};
    if (!playerId) return callback?.({ error: 'Missing player identity.' });

    const room = roomManager.createRoom({
      hostId: playerId,
      hostName: playerName,
      socketId: socket.id,
      roomName,
      wordLength,
      maxPlayers,
      maxAttempts,
      isPublic
    });

    socket.join(room.code);
    const state = roomManager.serializeRoomForPlayer(room, playerId);
    callback?.({ ok: true, room: state });
  });

  socket.on('room:join', (payload, callback) => {
    const { code, playerId, playerName } = payload || {};
    if (!playerId || !code) return callback?.({ error: 'Room code and player ID are required.' });

    const result = roomManager.joinRoom({
      code,
      playerId,
      playerName,
      socketId: socket.id
    });

    if (result.error) {
      return callback?.({ error: result.error });
    }

    socket.join(result.room.code);
    broadcastRoomState(result.room);
    const state = roomManager.serializeRoomForPlayer(result.room, playerId);
    callback?.({ ok: true, room: state, reconnected: result.reconnected });
  });

  socket.on('room:start', (payload, callback) => {
    const { code, playerId } = payload || {};
    const result = roomManager.startGame({ code, requesterId: playerId });
    if (result.error) return callback?.({ error: result.error });

    broadcastRoomState(result.room);
    callback?.({ ok: true });
  });

  socket.on('room:guess', (payload, callback) => {
    const { code, playerId, guess } = payload || {};
    const result = roomManager.submitMultiplayerGuess({
      code,
      playerId,
      rawGuess: guess
    });

    if (result.error) return callback?.({ error: result.error });

    broadcastRoomState(result.room);
    callback?.({ ok: true });
  });

  socket.on('room:new-round', (payload, callback) => {
    const { code, playerId } = payload || {};
    const result = roomManager.startNewRound({ code, requesterId: playerId });
    if (result.error) return callback?.({ error: result.error });

    broadcastRoomState(result.room);
    callback?.({ ok: true });
  });

  socket.on('room:leave', (payload, callback) => {
    const { code, playerId } = payload || {};
    const result = roomManager.leaveRoom({ code, playerId });
    socket.leave((code || '').toUpperCase());
    if (result && !result.deleted && result.room) {
      broadcastRoomState(result.room);
    }
    callback?.({ ok: true });
  });

  socket.on('disconnect', () => {
    const affectedRooms = roomManager.handleDisconnect(socket.id);
    for (const room of affectedRooms) {
      broadcastRoomState(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Wordle Party Server running on http://localhost:${PORT}`);
  });
}

module.exports = { app, server, roomManager };
