const crypto = require('crypto');
const { evaluateGuess } = require('./gameEngine');
const { getSecretWord, isValidWord, normalizeWord, SUPPORTED_LENGTHS, SUPPORTED_LANGS } = require('./dictionary');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.soloGames = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  // ==================== SOLO MODE ====================
  createSoloGame({ wordLength = 5, maxAttempts = 6, lang = 'en' } = {}) {
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const sessionId = crypto.randomUUID();
    const secretWord = getSecretWord(len, safeLang);

    const session = {
      sessionId,
      lang: safeLang,
      wordLength: len,
      maxAttempts: attempts,
      secretWord,
      guesses: [],
      status: 'IN_PROGRESS',
      createdAt: Date.now()
    };

    this.soloGames.set(sessionId, session);
    return this.sanitizeSoloSession(session);
  }

  submitSoloGuess(sessionId, rawGuess) {
    const session = this.soloGames.get(sessionId);
    if (!session) return { error: 'Solo session not found.' };
    if (session.status !== 'IN_PROGRESS') {
      return { error: 'This game has already finished.' };
    }

    const isAr = session.lang === 'ar';
    const guess = normalizeWord(rawGuess || '', session.lang);

    if (guess.length !== session.wordLength) {
      return { error: isAr ? `الكلمة يجب أن تكون ${session.wordLength} حروف!` : `Word must be ${session.wordLength} letters.` };
    }
    if (!isValidWord(guess, session.wordLength, session.lang)) {
      return { error: isAr ? 'الكلمة غير موجودة في القاموس! جرب كلمة شائعة.' : 'Not in word list. Try a common word!' };
    }
    if (session.guesses.some(g => g.word === guess)) {
      return { error: isAr ? 'لقد جربت هذه الكلمة من قبل!' : 'You already tried that word!' };
    }

    const evaluations = evaluateGuess(guess, session.secretWord, session.lang);
    session.guesses.push({ word: guess, evaluations });

    if (evaluations.every(c => c.state === 'correct')) {
      session.status = 'WON';
    } else if (session.guesses.length >= session.maxAttempts) {
      session.status = 'LOST';
    }

    return {
      session: this.sanitizeSoloSession(session),
      lastEvaluation: evaluations
    };
  }

  sanitizeSoloSession(session) {
    const isFinished = session.status === 'WON' || session.status === 'LOST';
    return {
      sessionId: session.sessionId,
      lang: session.lang,
      wordLength: session.wordLength,
      maxAttempts: session.maxAttempts,
      guesses: session.guesses,
      status: session.status,
      secretWord: isFinished ? session.secretWord : null
    };
  }

  // ==================== MULTIPLAYER ROOMS ====================
  createRoom({ hostId, hostName, socketId, roomName, wordLength = 5, maxPlayers = 6, maxAttempts = 6, isPublic = true, lang = 'en' }) {
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const cap = Math.min(Math.max(Number(maxPlayers) || 6, 2), 10);
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const code = this.generateRoomCode();
    const secretWord = getSecretWord(len, safeLang);

    const cleanHostName = (hostName || 'Player 1').trim().slice(0, 18) || 'Player 1';

    const room = {
      code,
      name: (roomName || `${cleanHostName}'s Arena`).trim().slice(0, 28),
      hostId,
      lang: safeLang,
      wordLength: len,
      maxPlayers: cap,
      maxAttempts: attempts,
      isPublic: Boolean(isPublic),
      status: 'WAITING',
      secretWord,
      roundNumber: 1,
      startedAt: null,
      finishedAt: null,
      players: new Map()
    };

    room.players.set(hostId, {
      id: hostId,
      name: cleanHostName,
      socketId,
      connected: true,
      guesses: [],
      status: 'PLAYING',
      solvedAt: null
    });

    this.rooms.set(code, room);
    return room;
  }

  joinRoom({ code, playerId, playerName, socketId }) {
    const normalizedCode = (code || '').trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return { error: 'Room not found. Check the 6-character room code.' };
    }

    if (room.players.has(playerId)) {
      const existingPlayer = room.players.get(playerId);
      existingPlayer.socketId = socketId;
      existingPlayer.connected = true;
      if (playerName && playerName.trim()) {
        existingPlayer.name = playerName.trim().slice(0, 18);
      }
      return { room, reconnected: true };
    }

    if (room.status !== 'WAITING') {
      return { error: 'This room has already started. Wait for the next round!' };
    }

    if (room.players.size >= room.maxPlayers) {
      return { error: `Room is full (${room.maxPlayers}/${room.maxPlayers} players).` };
    }

    const cleanName = (playerName || `Player ${room.players.size + 1}`).trim().slice(0, 18);

    room.players.set(playerId, {
      id: playerId,
      name: cleanName,
      socketId,
      connected: true,
      guesses: [],
      status: 'PLAYING',
      solvedAt: null
    });

    return { room, reconnected: false };
  }

  startGame({ code, requesterId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.hostId !== requesterId) return { error: 'Only the room host can start the game.' };
    if (room.status !== 'WAITING') return { error: 'Game is already in progress.' };
    if (room.players.size < 2) {
      return { error: 'At least 2 players are required to start a multiplayer game.' };
    }

    room.status = 'IN_PROGRESS';
    room.startedAt = Date.now();
    room.finishedAt = null;

    for (const player of room.players.values()) {
      player.guesses = [];
      player.status = 'PLAYING';
      player.solvedAt = null;
    }

    return { room };
  }

  submitMultiplayerGuess({ code, playerId, rawGuess }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.status !== 'IN_PROGRESS') return { error: 'Round is not currently active.' };

    const player = room.players.get(playerId);
    if (!player) return { error: 'Unauthorized: You are not a member of this room.' };
    if (player.status !== 'PLAYING') {
      return { error: 'You have already finished all attempts for this round.' };
    }

    const isAr = room.lang === 'ar';
    const guess = normalizeWord(rawGuess || '', room.lang);

    if (guess.length !== room.wordLength) {
      return { error: isAr ? `الكلمة يجب أن تكون ${room.wordLength} حروف!` : `Word must be ${room.wordLength} letters.` };
    }
    if (!isValidWord(guess, room.wordLength, room.lang)) {
      return { error: isAr ? 'الكلمة غير موجودة في القاموس!' : 'Word not found in dictionary!' };
    }
    if (player.guesses.some(g => g.word === guess)) {
      return { error: isAr ? 'لقد جربت هذه الكلمة من قبل!' : 'You already guessed that word!' };
    }

    const evaluations = evaluateGuess(guess, room.secretWord, room.lang);
    const now = Date.now();
    player.guesses.push({ word: guess, evaluations, submittedAt: now });

    if (evaluations.every(c => c.state === 'correct')) {
      player.status = 'SOLVED';
      player.solvedAt = now;
    } else if (player.guesses.length >= room.maxAttempts) {
      player.status = 'FAILED';
    }

    const allFinished = Array.from(room.players.values()).every(
      p => p.status === 'SOLVED' || p.status === 'FAILED' || !p.connected
    );

    if (allFinished) {
      room.status = 'FINISHED';
      room.finishedAt = now;
    }

    return { room, player };
  }

  startNewRound({ code, requesterId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.hostId !== requesterId) {
      return { error: 'Only the room host can start a new round.' };
    }
    if (room.players.size < 2) {
      room.status = 'WAITING';
      room.secretWord = getSecretWord(room.wordLength, room.lang, room.secretWord);
      return { room };
    }

    room.secretWord = getSecretWord(room.wordLength, room.lang, room.secretWord);
    room.roundNumber += 1;
    room.status = 'IN_PROGRESS';
    room.startedAt = Date.now();
    room.finishedAt = null;

    for (const player of room.players.values()) {
      player.guesses = [];
      player.status = 'PLAYING';
      player.solvedAt = null;
    }

    return { room };
  }

  handleDisconnect(socketId) {
    const affectedRooms = [];
    for (const [, room] of this.rooms.entries()) {
      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socketId) {
          player.connected = false;
          if (room.hostId === playerId) {
            const nextHost = Array.from(room.players.values()).find(p => p.connected && p.id !== playerId);
            if (nextHost) room.hostId = nextHost.id;
          }
          if (room.status === 'IN_PROGRESS') {
            const activeConnected = Array.from(room.players.values()).filter(p => p.connected);
            if (activeConnected.length > 0 && activeConnected.every(p => p.status !== 'PLAYING')) {
              room.status = 'FINISHED';
              room.finishedAt = Date.now();
            }
          }
          affectedRooms.push(room);
        }
      }
    }
    return affectedRooms;
  }

  leaveRoom({ code, playerId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return null;
    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { deleted: true, code: room.code };
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) room.hostId = nextHost.id;
    }
    if (room.status === 'IN_PROGRESS') {
      const everyoneDone = Array.from(room.players.values()).every(p => p.status !== 'PLAYING');
      if (everyoneDone) {
        room.status = 'FINISHED';
        room.finishedAt = Date.now();
      }
    }
    return { room, deleted: false };
  }

  serializeRoomForPlayer(room, viewerPlayerId) {
    const isRoundFinished = room.status === 'FINISHED';

    const playersList = Array.from(room.players.values()).map(p => {
      const isSelf = p.id === viewerPlayerId;
      return {
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        connected: p.connected,
        status: p.status,
        attemptsUsed: p.guesses.length,
        solvedAt: p.solvedAt,
        durationMs: p.solvedAt && room.startedAt ? p.solvedAt - room.startedAt : null,
        guesses: p.guesses.map(g => ({
          word: isSelf || isRoundFinished ? g.word : null,
          evaluations: g.evaluations.map(cell => ({
            letter: isSelf || isRoundFinished ? cell.letter : '',
            state: cell.state
          }))
        }))
      };
    });

    const leaderboard = [...playersList].sort((a, b) => {
      if (a.status === 'SOLVED' && b.status !== 'SOLVED') return -1;
      if (a.status !== 'SOLVED' && b.status === 'SOLVED') return 1;
      if (a.status === 'SOLVED' && b.status === 'SOLVED') {
        if (a.attemptsUsed !== b.attemptsUsed) return a.attemptsUsed - b.attemptsUsed;
        return (a.durationMs || Infinity) - (b.durationMs || Infinity);
      }
      return b.attemptsUsed - a.attemptsUsed;
    });

    return {
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      lang: room.lang,
      wordLength: room.wordLength,
      maxPlayers: room.maxPlayers,
      maxAttempts: room.maxAttempts,
      isPublic: room.isPublic,
      status: room.status,
      roundNumber: room.roundNumber,
      secretWord: isRoundFinished ? room.secretWord : null,
      players: playersList,
      leaderboard
    };
  }

  getPublicWaitingRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'WAITING' && room.players.size < room.maxPlayers) {
        list.push({
          code: room.code,
          name: room.name,
          lang: room.lang,
          wordLength: room.wordLength,
          maxAttempts: room.maxAttempts,
          playerCount: room.players.size,
          maxPlayers: room.maxPlayers
        });
      }
    }
    return list;
  }
}

module.exports = { RoomManager };
