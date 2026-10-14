const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, 'wordle-party-phase1');

const files = {
    'package.json': JSON.stringify({
        name: 'wordle-party-multiplayer',
        version: '1.0.0',
        description: 'Multiplayer & Solo Wordle-Inspired Competitive Party Game (4-7 Letters)',
        main: 'server/index.js',
        scripts: {
            start: 'node server/index.js',
            dev: 'node --watch server/index.js',
            test: 'node --test tests/game.test.js'
        },
        dependencies: {
            cors: '^2.8.5',
            express: '^4.19.2',
            'socket.io': '^4.7.5'
        }
    }, null, 2),

    'server/gameEngine.js': `/**
 * Evaluates a guess against the secret word using the official Wordle two-pass algorithm.
 * Works dynamically for any word length (4 to 7 letters).
 */
function evaluateGuess(guess, secret) {
  const normalizedGuess = guess.trim().toUpperCase();
  const normalizedSecret = secret.trim().toUpperCase();

  if (normalizedGuess.length !== normalizedSecret.length) {
    throw new Error(\`Guess length (\${normalizedGuess.length}) must match secret length (\${normalizedSecret.length}).\`);
  }

  const length = normalizedSecret.length;
  const result = new Array(length);
  const remainingCounts = {};

  // Pass 1: Exact matches ('correct' / Green)
  for (let i = 0; i < length; i++) {
    const gChar = normalizedGuess[i];
    const sChar = normalizedSecret[i];

    if (gChar === sChar) {
      result[i] = { letter: gChar, state: 'correct' };
    } else {
      remainingCounts[sChar] = (remainingCounts[sChar] || 0) + 1;
    }
  }

  // Pass 2: Misplaced ('present' / Yellow) vs Absent ('absent' / Gray)
  for (let i = 0; i < length; i++) {
    if (result[i]) continue;

    const gChar = normalizedGuess[i];
    if (remainingCounts[gChar] && remainingCounts[gChar] > 0) {
      result[i] = { letter: gChar, state: 'present' };
      remainingCounts[gChar] -= 1;
    } else {
      result[i] = { letter: gChar, state: 'absent' };
    }
  }

  return result;
}

module.exports = { evaluateGuess };
`,

    'server/dictionary.js': `const crypto = require('crypto');

const DICTIONARIES = {
  en: {
    4: {
      answers: [
        'GAME', 'PLAY', 'WORD', 'TIME', 'FIRE', 'WIND', 'STAR', 'MOON', 'CODE', 'FAST',
        'GOLD', 'HERO', 'JUMP', 'KING', 'LIFE', 'MIND', 'NOTE', 'PEAK', 'RAIN', 'SHIP',
        'WAVE', 'ZERO', 'BLUE', 'CALM', 'DARK', 'ECHO', 'GLOW', 'HOPE', 'IRON', 'LUCK',
        'MYTH', 'NOVA', 'PATH', 'RING', 'SAND', 'TIDE', 'VIBE', 'WOLF', 'ZONE', 'BOLT'
      ],
      allowed: [
        'ABLE', 'ACID', 'AGED', 'ALSO', 'AREA', 'ARMY', 'AWAY', 'BABY', 'BACK', 'BALL',
        'BAND', 'BANK', 'BASE', 'BATH', 'BEAR', 'BEAT', 'BEEN', 'BEER', 'BELL', 'BELT',
        'BEST', 'BILL', 'BIRD', 'BLOW', 'BOAT', 'BODY', 'BOMB', 'BOND', 'BONE', 'BOOK',
        'BOOM', 'BORN', 'BOSS', 'BOTH', 'BOWL', 'BULK', 'BURN', 'BUSH', 'BUSY', 'CALL',
        'CAMP', 'CARD', 'CARE', 'CASE', 'CASH', 'CAST', 'CELL', 'CHAT', 'CHIP', 'CITY',
        'CLUB', 'COAL', 'COAT', 'COOK', 'COOL', 'COPE', 'COPY', 'CORE', 'COST', 'CREW',
        'CROP', 'DATA', 'DATE', 'DAWN', 'DAYS', 'DEAD', 'DEAL', 'DEAN', 'DEAR', 'DEBT',
        'DEEP', 'DENY', 'DESK', 'DIAL', 'DIET', 'DISC', 'DISK', 'DOES', 'DONE', 'DOOR',
        'DOSE', 'DOWN', 'DRAW', 'DREW', 'DROP', 'DRUG', 'DUAL', 'DUKE', 'DUST', 'DUTY'
      ]
    },
    5: {
      answers: [
        'SPARK', 'CRANE', 'SLATE', 'AUDIO', 'FLAME', 'BRAVE', 'CLOUD', 'DREAM', 'GHOST', 'LIGHT',
        'OCEAN', 'PIANO', 'QUEST', 'RIVER', 'SMILE', 'TIGER', 'UNITY', 'VOICE', 'WORLD', 'YOUTH',
        'ZEBRA', 'PLANT', 'CROWN', 'FROST', 'GLOBE', 'HEART', 'MAGIC', 'NIGHT', 'PEARL', 'SPACE',
        'STORM', 'TRAIN', 'WATER', 'EARTH', 'POWER', 'SHARP', 'QUICK', 'PRIZE', 'MATCH', 'SCORE'
      ],
      allowed: [
        'ABOUT', 'ABOVE', 'ABUSE', 'ACTOR', 'ACUTE', 'ADMIT', 'ADOPT', 'ADULT', 'AFTER', 'AGAIN',
        'AGENT', 'AGREE', 'AHEAD', 'ALARM', 'ALBUM', 'ALERT', 'ALIKE', 'ALIVE', 'ALLOW', 'ALONE',
        'ALONG', 'ALTER', 'AMONG', 'ANGER', 'ANGLE', 'ANGRY', 'APART', 'APPLE', 'APPLY', 'ARENA',
        'ARGUE', 'ARISE', 'ARRAY', 'ASIDE', 'ASSET', 'AVOID', 'AWARD', 'AWARE', 'BADLY', 'BAKER',
        'BASES', 'BASIC', 'BASIS', 'BEACH', 'BEGAN', 'BEGIN', 'BEGUN', 'BEING', 'BELOW', 'BENCH',
        'BILLY', 'BIRTH', 'BLACK', 'BLAME', 'BLIND', 'BLOCK', 'BLOOD', 'BOARD', 'BOOST', 'BOOTH',
        'BOUND', 'BRAIN', 'BRAND', 'BREAD', 'BREAK', 'BREED', 'BRIEF', 'BRING', 'BROAD', 'BROKE',
        'BROWN', 'BUILD', 'BUILT', 'BUYER', 'CABLE', 'CALIF', 'CARRY', 'CATCH', 'CAUSE', 'CHAIN'
      ]
    },
    6: {
      answers: [
        'PLANET', 'ROCKET', 'CASTLE', 'BRIDGE', 'SILVER', 'FOREST', 'GARDEN', 'ISLAND', 'JUNGLE', 'LEGEND',
        'MASTER', 'MEMORY', 'MIRROR', 'ORANGE', 'PALACE', 'PIRATE', 'PLAYER', 'PUZZLE', 'SHIELD', 'SHADOW',
        'SPIRIT', 'STREAM', 'SUMMER', 'TEMPLE', 'THRONE', 'TRAVEL', 'TUNNEL', 'VALLEY', 'VISION', 'WINTER',
        'WONDER', 'ANCHOR', 'BEACON', 'BREEZE', 'CANYON', 'DRAGON', 'EMPIRE', 'FALCON', 'GALAXY', 'HARBOR'
      ],
      allowed: [
        'ACCEPT', 'ACCESS', 'ACROSS', 'ACTING', 'ACTION', 'ACTIVE', 'ACTUAL', 'ADVICE', 'ADVISE', 'AFFECT',
        'AFFORD', 'AFRAID', 'AGENCY', 'AGENDA', 'ALMOST', 'ALWAYS', 'AMOUNT', 'ANIMAL', 'ANNUAL', 'ANSWER',
        'ANYONE', 'ANYWAY', 'APPEAL', 'APPEAR', 'AROUND', 'ARRIVE', 'ARTIST', 'ASPECT', 'ASSESS', 'ASSIST',
        'ASSUME', 'ATTACK', 'ATTEND', 'AUGUST', 'AUTHOR', 'AVENUE', 'BACKED', 'BARELY', 'BATTLE', 'BEAUTY',
        'BECAME', 'BECOME', 'BEFORE', 'BEHALF', 'BEHIND', 'BELIEF', 'BELONG', 'BERLIN', 'BETTER', 'BEYOND'
      ]
    },
    7: {
      answers: [
        'DIAMOND', 'JOURNEY', 'KINGDOM', 'MYSTERY', 'THUNDER', 'VICTORY', 'FREEDOM', 'HARMONY', 'CAPTAIN', 'CRYSTAL',
        'DESTINY', 'ECLIPSE', 'EMERALD', 'FANTASY', 'FORTUNE', 'GLACIER', 'HORIZON', 'LANTERN', 'LIBERTY', 'MIRACLE',
        'MONSTER', 'NETWORK', 'ODYSSEY', 'PASSION', 'PHOENIX', 'PIONEER', 'PROMISE', 'RAINBOW', 'SILENCE', 'SUNRISE',
        'TRIUMPH', 'UNICORN', 'VENTURE', 'VILLAGE', 'VOLCANO', 'WARRIOR', 'WHISPER', 'COMPASS', 'COURAGE', 'ELEMENT'
      ],
      allowed: [
        'ABILITY', 'ABSENCE', 'ACADEMY', 'ACCOUNT', 'ACCUSED', 'ACHIEVE', 'ACQUIRE', 'ADDRESS', 'ADVANCE', 'ADVERSE',
        'ADVISED', 'ADVISER', 'AGAINST', 'AIRLINE', 'AIRPORT', 'ALCOHOL', 'ALLEGED', 'ALREADY', 'ANALYST', 'ANCIENT',
        'ANOTHER', 'ANXIETY', 'ANXIOUS', 'ANYBODY', 'APPLIED', 'ARRANGE', 'ARRIVAL', 'ARTICLE', 'ASSAULT', 'ASSUMED',
        'ASSURED', 'ATTEMPT', 'ATTRACT', 'AUCTION', 'AVERAGE', 'BACKING', 'BALANCE', 'BANKING', 'BARRIER', 'BATTERY'
      ]
    }
  }
};

const VALID_SETS = {};
for (const [lang, lengths] of Object.entries(DICTIONARIES)) {
  VALID_SETS[lang] = {};
  for (const [len, lists] of Object.entries(lengths)) {
    const cleanAnswers = lists.answers.map(w => w.trim().toUpperCase()).filter(w => w.length === Number(len));
    const cleanAllowed = lists.allowed.map(w => w.trim().toUpperCase()).filter(w => w.length === Number(len));
    lists.answers = cleanAnswers;
    VALID_SETS[lang][len] = new Set([...cleanAnswers, ...cleanAllowed]);
  }
}

function getSecretWord(wordLength = 5, lang = 'en', excludeWord = null) {
  const len = Number(wordLength);
  const langDict = DICTIONARIES[lang];
  if (!langDict || !langDict[len]) {
    throw new Error(\`Unsupported word length (\${len}) or language (\${lang}).\`);
  }

  const candidates = excludeWord
    ? langDict[len].answers.filter(w => w !== excludeWord)
    : langDict[len].answers;

  const pool = candidates.length > 0 ? candidates : langDict[len].answers;
  const randomIndex = crypto.randomInt(0, pool.length);
  return pool[randomIndex];
}

function isValidWord(word, wordLength, lang = 'en') {
  if (!word || typeof word !== 'string') return false;
  const normalized = word.trim().toUpperCase();
  if (normalized.length !== Number(wordLength)) return false;
  if (!/^[A-Z]+$/.test(normalized)) return false;

  const validSet = VALID_SETS[lang]?.[Number(wordLength)];
  return validSet ? validSet.has(normalized) : false;
}

module.exports = {
  getSecretWord,
  isValidWord,
  SUPPORTED_LENGTHS: [4, 5, 6, 7]
};
`,

    'server/roomManager.js': `const crypto = require('crypto');
const { evaluateGuess } = require('./gameEngine');
const { getSecretWord, isValidWord, SUPPORTED_LENGTHS } = require('./dictionary');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.soloGames = new Map();
    this.rateLimits = new Map();
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

  checkRateLimit(key, minIntervalMs = 250) {
    const now = Date.now();
    const last = this.rateLimits.get(key) || 0;
    if (now - last < minIntervalMs) {
      return false;
    }
    this.rateLimits.set(key, now);
    return true;
  }

  // ==================== SOLO MODE ====================
  createSoloGame({ wordLength = 5, maxAttempts = 6 } = {}) {
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const sessionId = crypto.randomUUID();
    const secretWord = getSecretWord(len, 'en');

    const session = {
      sessionId,
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
    if (!this.checkRateLimit(\`solo:\${sessionId}\`, 200)) {
      return { error: 'Please wait a moment before submitting again.' };
    }

    const session = this.soloGames.get(sessionId);
    if (!session) return { error: 'Solo session not found.' };
    if (session.status !== 'IN_PROGRESS') {
      return { error: 'This game has already finished.' };
    }

    const guess = (rawGuess || '').trim().toUpperCase();
    if (guess.length !== session.wordLength) {
      return { error: \`Word must be exactly \${session.wordLength} letters.\` };
    }
    if (!isValidWord(guess, session.wordLength)) {
      return { error: 'Not in word list. Try a common English word!' };
    }
    if (session.guesses.some(g => g.word === guess)) {
      return { error: 'You already tried that word!' };
    }

    const evaluations = evaluateGuess(guess, session.secretWord);
    session.guesses.push({ word: guess, evaluations });

    if (guess === session.secretWord) {
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
      wordLength: session.wordLength,
      maxAttempts: session.maxAttempts,
      guesses: session.guesses,
      status: session.status,
      secretWord: isFinished ? session.secretWord : null
    };
  }

  // ==================== MULTIPLAYER ROOMS ====================
  createRoom({ hostId, hostName, socketId, roomName, wordLength = 5, maxPlayers = 6, maxAttempts = 6, isPublic = true }) {
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const cap = Math.min(Math.max(Number(maxPlayers) || 6, 2), 10);
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const code = this.generateRoomCode();
    const secretWord = getSecretWord(len, 'en');

    const cleanHostName = (hostName || 'Player 1').trim().slice(0, 18) || 'Player 1';

    const room = {
      code,
      name: (roomName || \`\${cleanHostName}'s Arena\`).trim().slice(0, 28),
      hostId,
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
      return { error: \`Room is full (\${room.maxPlayers}/\${room.maxPlayers} players).\` };
    }

    const cleanName = (playerName || \`Player \${room.players.size + 1}\`).trim().slice(0, 18);

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
    if (!this.checkRateLimit(\`mp:\${code}:\${playerId}\`, 250)) {
      return { error: 'Submitting too fast! Please wait a moment.' };
    }

    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.status !== 'IN_PROGRESS') return { error: 'Round is not currently active.' };

    const player = room.players.get(playerId);
    if (!player) return { error: 'Unauthorized: You are not a member of this room.' };
    if (player.status !== 'PLAYING') {
      return { error: 'You have already finished all attempts for this round.' };
    }

    const guess = (rawGuess || '').trim().toUpperCase();
    if (guess.length !== room.wordLength) {
      return { error: \`Word must be exactly \${room.wordLength} letters.\` };
    }
    if (!isValidWord(guess, room.wordLength)) {
      return { error: 'Word not found in dictionary!' };
    }
    if (player.guesses.some(g => g.word === guess)) {
      return { error: 'You already guessed that word!' };
    }

    const evaluations = evaluateGuess(guess, room.secretWord);
    const now = Date.now();
    player.guesses.push({ word: guess, evaluations, submittedAt: now });

    if (guess === room.secretWord) {
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
      room.secretWord = getSecretWord(room.wordLength, 'en', room.secretWord);
      return { room };
    }

    room.secretWord = getSecretWord(room.wordLength, 'en', room.secretWord);
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
            if (nextHost) {
              room.hostId = nextHost.id;
            }
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
`,

    'server/index.js': `const path = require('path');
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
    console.log(\`Wordle Party Server running on http://localhost:\${PORT}\`);
  });
}

module.exports = { app, server, roomManager };
`,

    'public/index.html': `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LEXIRUSH — Competitive Multiplayer Word Arena</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand" id="navHomeBtn" role="button" tabindex="0">
        <span class="brand-badge">LR</span>
        <div class="brand-text">
          <h1>LEXI<span>RUSH</span></h1>
          <small>Multiplayer Word Party</small>
        </div>
      </div>

      <div class="topbar-actions">
        <div class="player-Tag">
          <span>Nickname:</span>
          <input type="text" id="globalPlayerName" maxlength="16" placeholder="Your Nickname" />
        </div>
        <button id="themeToggleBtn" class="icon-btn" title="Toggle Dark/Light Theme" aria-label="Toggle Theme">
          ☀️
        </button>
      </div>
    </header>

    <div id="toastContainer" class="toast-container" aria-live="polite"></div>

    <!-- 1. MAIN MENU SCREEN -->
    <main id="screen-menu" class="screen active">
      <section class="hero-card">
        <div class="hero-badge">4 TO 7 LETTERS • UP TO 10 PLAYERS</div>
        <h2>Outsmart Your Friends in Real-Time Word Battles</h2>
        <p>Every room generates a fresh secret word. Race on your own grid, watch live color progress from opponents, and claim the top spot!</p>

        <div class="mode-grid">
          <div class="mode-card solo-card">
            <div class="mode-icon">🎯</div>
            <h3>Solo Training</h3>
            <p>Endless rounds at your own pace. Choose 4, 5, 6, or 7 letters with zero daily limits.</p>
            <div class="solo-config-row">
              <label>Word Length:</label>
              <div class="pill-group" id="soloLengthGroup">
                <button class="pill" data-len="4">4</button>
                <button class="pill active" data-len="5">5</button>
                <button class="pill" data-len="6">6</button>
                <button class="pill" data-len="7">7</button>
              </div>
            </div>
            <button id="playSoloBtn" class="btn btn-primary btn-block">Play Solo Now</button>
          </div>

          <div class="mode-card mp-card">
            <div class="mode-icon">⚡</div>
            <h3>Multiplayer Arena</h3>
            <p>Create a custom room for 2–10 players or jump into a friend's lobby with a 6-character code.</p>
            <button id="openCreateRoomBtn" class="btn btn-accent btn-block">Create New Room</button>

            <div class="join-divider"><span>OR JOIN WITH CODE</span></div>
            <div class="join-code-row">
              <input type="text" id="joinCodeInput" maxlength="6" placeholder="E.G. K9X4P2" />
              <button id="joinRoomBtn" class="btn btn-secondary">Join</button>
            </div>
          </div>
        </div>

        <div class="public-rooms-box">
          <div class="section-header">
            <h4>Open Public Lobbies</h4>
            <button id="refreshPublicRoomsBtn" class="btn-link">Refresh ↻</button>
          </div>
          <div id="publicRoomsList" class="public-rooms-list">
            <p class="muted-text">No open lobbies right now. Create one above!</p>
          </div>
        </div>

        <div class="how-to-play">
          <h4>How Tile Colors Work</h4>
          <div class="legend-grid">
            <div class="legend-item">
              <span class="tile-demo correct">W</span>
              <div><strong>Green (Correct)</strong><p>Right letter in the exact spot.</p></div>
            </div>
            <div class="legend-item">
              <span class="tile-demo present">O</span>
              <div><strong>Yellow (Present)</strong><p>In the word, but wrong spot.</p></div>
            </div>
            <div class="legend-item">
              <span class="tile-demo absent">R</span>
              <div><strong>Gray (Absent)</strong><p>Not in the secret word.</p></div>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- 2. ROOM CREATION SCREEN -->
    <main id="screen-create" class="screen">
      <section class="panel-card">
        <div class="panel-header">
          <button class="btn-back" id="backFromCreateBtn">← Back</button>
          <h2>Configure Multiplayer Room</h2>
        </div>

        <div class="form-grid">
          <div class="form-group">
            <label for="roomNameInput">Room Name (Optional)</label>
            <input type="text" id="roomNameInput" maxlength="28" placeholder="Friday Night Word Clash" />
          </div>

          <div class="form-group">
            <label>Secret Word Length</label>
            <div class="pill-group large" id="createLengthGroup">
              <button class="pill" data-len="4">4 Letters</button>
              <button class="pill active" data-len="5">5 Letters</button>
              <button class="pill" data-len="6">6 Letters</button>
              <button class="pill" data-len="7">7 Letters</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label for="maxPlayersSelect">Max Players (2–10)</label>
              <select id="maxPlayersSelect">
                <option value="2">2 Players (1v1 Duel)</option>
                <option value="4">4 Players</option>
                <option value="6" selected>6 Players</option>
                <option value="8">8 Players</option>
                <option value="10">10 Players (Full Party)</option>
              </select>
            </div>

            <div class="form-group">
              <label for="maxAttemptsSelect">Attempts Allowed</label>
              <select id="maxAttemptsSelect">
                <option value="5">5 Attempts (Hard)</option>
                <option value="6" selected>6 Attempts (Standard)</option>
                <option value="7">7 Attempts (Relaxed)</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <label class="checkbox-label">
              <input type="checkbox" id="roomPublicCheckbox" checked />
              <span>Show room in Public Lobbies list while waiting</span>
            </label>
          </div>

          <div class="config-preview">
            <span>Summary:</span>
            <strong id="configPreviewText">5-Letter Word • Max 6 Players • 6 Attempts</strong>
          </div>

          <button id="confirmCreateRoomBtn" class="btn btn-accent btn-block btn-lg">Create Room & Open Lobby</button>
        </div>
      </section>
    </main>

    <!-- 3. WAITING LOBBY SCREEN -->
    <main id="screen-lobby" class="screen">
      <section class="panel-card">
        <div class="lobby-top">
          <div>
            <span class="status-pill waiting">WAITING FOR PLAYERS</span>
            <h2 id="lobbyRoomName">Room Lobby</h2>
          </div>
          <div class="room-code-box">
            <span>ROOM CODE</span>
            <div class="code-copy-wrap">
              <strong id="lobbyRoomCode">------</strong>
              <button id="copyCodeBtn" class="btn btn-secondary btn-sm">Copy Code</button>
            </div>
          </div>
        </div>

        <div class="lobby-meta-badges">
          <span class="meta-badge" id="lobbyWordLenBadge">5 Letters</span>
          <span class="meta-badge" id="lobbyAttemptsBadge">6 Attempts</span>
          <span class="meta-badge" id="lobbyCapacityBadge">1 / 6 Players</span>
        </div>

        <div class="lobby-players-grid" id="lobbyPlayersGrid"></div>

        <div class="lobby-footer">
          <button id="leaveLobbyBtn" class="btn btn-danger-outline">Leave Room</button>
          <div class="host-start-wrap">
            <span id="lobbyWaitHint" class="muted-text">Need at least 2 players to start</span>
            <button id="startMultiplayerBtn" class="btn btn-accent btn-lg" disabled>Start Game</button>
          </div>
        </div>
      </section>
    </main>

    <!-- 4. ACTIVE GAME SCREEN -->
    <main id="screen-game" class="screen">
      <div class="game-layout">
        <section class="board-section">
          <div class="game-HUD">
            <div class="hud-left">
              <span class="status-pill in-progress" id="gameModeBadge">SOLO</span>
              <span class="hud-info" id="gameRuleInfo">5 Letters • 6 Tries</span>
            </div>
            <div class="hud-right">
              <span id="remainingTriesText">6 attempts left</span>
              <button id="quitActiveGameBtn" class="btn btn-sm btn-danger-outline">Exit</button>
            </div>
          </div>

          <div class="board-container">
            <div id="wordGrid" class="word-grid"></div>
          </div>

          <div id="soloEndBanner" class="solo-end-banner hidden">
            <h3 id="soloEndTitle">Round Complete!</h3>
            <p id="soloEndSecret">The secret word was <strong>-----</strong></p>
            <div class="solo-end-actions">
              <button id="soloPlayAgainBtn" class="btn btn-primary">Play Another Word</button>
              <button id="soloBackMenuBtn" class="btn btn-secondary">Main Menu</button>
            </div>
          </div>

          <div id="keyboard" class="keyboard"></div>
        </section>

        <aside id="mpLiveSidebar" class="mp-sidebar hidden">
          <div class="sidebar-header">
            <h3>Live Arena Progress</h3>
            <span id="sidebarRoomCode" class="code-tag">#------</span>
          </div>
          <div id="liveOpponentsList" class="opponents-list"></div>
        </aside>
      </div>
    </main>

    <!-- 5. RESULTS SCREEN -->
    <main id="screen-results" class="screen">
      <section class="panel-card results-card">
        <span class="status-pill finished">ROUND FINISHED</span>
        <h2 id="resultsHeadline">Arena Standings</h2>

        <div class="secret-reveal-box">
          <span>THE SECRET WORD WAS</span>
          <strong id="resultsSecretWord">-----</strong>
        </div>

        <div id="resultsLeaderboard" class="leaderboard-list"></div>

        <div class="results-actions">
          <button id="resultsMainMenuBtn" class="btn btn-secondary">Return to Main Menu</button>
          <button id="resultsNewRoundBtn" class="btn btn-accent btn-lg hidden">Play Next Round (New Word)</button>
        </div>
      </section>
    </main>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="/client.js"></script>
</body>
</html>
`,

    'public/styles.css': `:root {
  --bg-main: #0f172a;
  --bg-card: #1e293b;
  --bg-elevated: #334155;
  --text-main: #f8fafc;
  --text-muted: #94a3b8;
  --border-color: #334155;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --primary: #10b981;
  --tile-empty: #0f172a;
  --tile-border: #475569;
  --tile-correct: #10b981;
  --tile-present: #f59e0b;
  --tile-absent: #374151;
  --danger: #ef4444;
  --radius: 14px;
}

html[data-theme="light"] {
  --bg-main: #f1f5f9;
  --bg-card: #ffffff;
  --bg-elevated: #e2e8f0;
  --text-main: #0f172a;
  --text-muted: #64748b;
  --border-color: #cbd5e1;
  --tile-empty: #ffffff;
  --tile-border: #94a3b8;
  --tile-absent: #64748b;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

body {
  background: var(--bg-main);
  color: var(--text-main);
  min-height: 100vh;
  transition: background 0.2s, color 0.2s;
}

.app-shell {
  max-width: 1180px;
  margin: 0 auto;
  padding: 16px;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 18px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  margin-bottom: 20px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.brand-badge {
  background: linear-gradient(135deg, var(--accent), #ec4899);
  color: #fff;
  font-weight: 900;
  padding: 8px 10px;
  border-radius: 10px;
  letter-spacing: 1px;
}

.brand-text h1 {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.brand-text h1 span { color: var(--accent); }
.brand-text small { color: var(--text-muted); font-size: 0.75rem; }

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.player-Tag {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.player-Tag input {
  background: var(--bg-main);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 6px 10px;
  width: 140px;
  font-weight: 600;
}

.icon-btn {
  background: var(--bg-elevated);
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  font-size: 1rem;
}

.screen { display: none; }
.screen.active {
  display: block;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

.hero-card, .panel-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 28px;
}

.hero-badge {
  display: inline-block;
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent);
  font-weight: 700;
  font-size: 0.75rem;
  padding: 5px 12px;
  border-radius: 999px;
  margin-bottom: 10px;
}

.hero-card h2 { font-size: 1.8rem; margin-bottom: 8px; }
.hero-card > p { color: var(--text-muted); margin-bottom: 24px; }

.mode-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 20px;
  margin-bottom: 24px;
}

.mode-card {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 22px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.mode-icon { font-size: 2rem; }

.solo-config-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: auto;
}

.pill-group { display: flex; gap: 6px; }

.pill {
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  padding: 6px 12px;
  border-radius: 8px;
  font-weight: 700;
  cursor: pointer;
}

.pill.active {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.btn {
  border: none;
  border-radius: 10px;
  padding: 11px 18px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.1s, opacity 0.2s;
}

.btn:active { transform: scale(0.98); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--primary); color: #fff; }
.btn-accent { background: var(--accent); color: #fff; }
.btn-secondary { background: var(--bg-elevated); color: var(--text-main); }
.btn-danger-outline {
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger);
}
.btn-block { width: 100%; }
.btn-lg { padding: 14px 22px; font-size: 1rem; }
.btn-sm { padding: 6px 12px; font-size: 0.8rem; }

.join-divider {
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  margin: 4px 0;
}

.join-code-row { display: flex; gap: 8px; }
.join-code-row input {
  flex: 1;
  background: var(--bg-card);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 14px;
  text-transform: uppercase;
  font-weight: 800;
  letter-spacing: 2px;
}

.public-rooms-box {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px;
  margin-bottom: 20px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.btn-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-weight: 600;
}

.public-room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--bg-card);
  border-radius: 10px;
  margin-bottom: 8px;
}

.legend-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 0.85rem;
}

.tile-demo {
  width: 38px;
  height: 38px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  border-radius: 8px;
  color: #fff;
}

.tile-demo.correct { background: var(--tile-correct); }
.tile-demo.present { background: var(--tile-present); }
.tile-demo.absent { background: var(--tile-absent); }

.panel-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 20px;
}

.btn-back {
  background: var(--bg-elevated);
  color: var(--text-main);
  border: none;
  padding: 8px 12px;
  border-radius: 8px;
  cursor: pointer;
}

.form-grid {
  display: flex;
  flex-direction: column;
  gap: 18px;
  max-width: 560px;
  margin: 0 auto;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group input[type="text"], .form-group select {
  background: var(--bg-main);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  padding: 12px;
  border-radius: 10px;
  font-size: 0.95rem;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.config-preview {
  background: rgba(99, 102, 241, 0.12);
  border: 1px dashed var(--accent);
  padding: 12px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
}

.lobby-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 18px;
}

.room-code-box {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  padding: 10px 16px;
  border-radius: 12px;
}

.room-code-box span { font-size: 0.7rem; color: var(--text-muted); }

.code-copy-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.code-copy-wrap strong {
  font-size: 1.5rem;
  letter-spacing: 3px;
  color: var(--accent);
}

.lobby-meta-badges {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.meta-badge {
  background: var(--bg-elevated);
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
}

.lobby-players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}

.lobby-player-card {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
}

.lobby-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid var(--border-color);
  padding-top: 18px;
}

.game-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 20px;
  align-items: start;
}

.game-layout.solo-only {
  grid-template-columns: 1fr;
  max-width: 680px;
  margin: 0 auto;
}

.board-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.game-HUD {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.status-pill {
  font-size: 0.75rem;
  font-weight: 800;
  padding: 4px 10px;
  border-radius: 999px;
  text-transform: uppercase;
}

.status-pill.waiting { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
.status-pill.in-progress { background: rgba(16, 185, 129, 0.2); color: #34d399; }
.status-pill.finished { background: rgba(99, 102, 241, 0.2); color: #818cf8; }

.board-container {
  margin: 10px 0 22px;
  width: 100%;
  display: flex;
  justify-content: center;
}

.word-grid { display: grid; gap: 8px; }

.grid-row {
  display: grid;
  grid-template-columns: repeat(var(--word-length, 5), 1fr);
  gap: 8px;
}

.grid-tile {
  width: clamp(42px, 10vw, 58px);
  height: clamp(42px, 10vw, 58px);
  background: var(--tile-empty);
  border: 2px solid var(--tile-border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  font-weight: 800;
  text-transform: uppercase;
  user-select: none;
  transition: transform 0.15s, background 0.25s, border-color 0.25s;
}

.grid-tile.filled {
  border-color: var(--accent);
  animation: popIn 0.12s ease;
}

.grid-tile.correct { background: var(--tile-correct); border-color: var(--tile-correct); color: #fff; }
.grid-tile.present { background: var(--tile-present); border-color: var(--tile-present); color: #fff; }
.grid-tile.absent { background: var(--tile-absent); border-color: var(--tile-absent); color: #fff; }

@keyframes popIn {
  0% { transform: scale(0.85); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

.shake { animation: shakeRow 0.35s ease; }

@keyframes shakeRow {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}

.keyboard {
  width: 100%;
  max-width: 540px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.kb-row { display: flex; justify-content: center; gap: 6px; }

.kb-key {
  flex: 1;
  min-height: 46px;
  background: var(--bg-elevated);
  color: var(--text-main);
  border: none;
  border-radius: 8px;
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  user-select: none;
}

.kb-key.wide { flex: 1.5; font-size: 0.78rem; }
.kb-key.correct { background: var(--tile-correct); color: #fff; }
.kb-key.present { background: var(--tile-present); color: #fff; }
.kb-key.absent { background: var(--tile-absent); color: #fff; opacity: 0.65; }

.mp-sidebar {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  padding: 16px;
  max-height: 80vh;
  overflow-y: auto;
}

.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.opponents-list { display: flex; flex-direction: column; gap: 10px; }

.opponent-card {
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
}

.opponent-top {
  display: flex;
  justify-content: space-between;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 6px;
}

.mini-grid { display: flex; flex-direction: column; gap: 3px; }
.mini-row { display: flex; gap: 3px; }

.mini-cell {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  background: var(--bg-elevated);
}

.mini-cell.correct { background: var(--tile-correct); }
.mini-cell.present { background: var(--tile-present); }
.mini-cell.absent { background: var(--tile-absent); }

.results-card {
  text-align: center;
  max-width: 680px;
  margin: 0 auto;
}

.secret-reveal-box {
  background: var(--bg-main);
  border: 2px solid var(--primary);
  border-radius: 12px;
  padding: 16px;
  margin: 18px 0;
}

.secret-reveal-box span { display: block; font-size: 0.75rem; color: var(--text-muted); }
.secret-reveal-box strong { font-size: 2rem; letter-spacing: 5px; color: var(--primary); }

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 22px;
  text-align: left;
}

.leader-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-main);
  border: 1px solid var(--border-color);
  padding: 12px 16px;
  border-radius: 10px;
}

.solo-end-banner {
  background: var(--bg-main);
  border: 1px solid var(--primary);
  border-radius: 12px;
  padding: 16px;
  text-align: center;
  margin-bottom: 16px;
  width: 100%;
}

.solo-end-actions {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
}

.toast-container {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.toast {
  background: #1e293b;
  color: #fff;
  border-left: 4px solid var(--accent);
  padding: 10px 18px;
  border-radius: 8px;
  font-weight: 600;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.hidden { display: none !important; }

@media (max-width: 860px) {
  .game-layout { grid-template-columns: 1fr; }
}
`,

    'public/client.js': `(() => {
  const socket = io();

  let playerId = localStorage.getItem('lexirush_player_id');
  if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('lexirush_player_id', playerId);
  }

  const nameInput = document.getElementById('globalPlayerName');
  nameInput.value = localStorage.getItem('lexirush_player_name') || \`Player_\${playerId.slice(2, 6).toUpperCase()}\`;
  nameInput.addEventListener('change', () => {
    localStorage.setItem('lexirush_player_name', nameInput.value.trim() || 'Player');
  });

  const state = {
    mode: null,
    soloWordLength: 5,
    createWordLength: 5,
    wordLength: 5,
    maxAttempts: 6,
    currentGuess: '',
    isSubmitting: false,
    soloSession: null,
    room: null
  };

  const screens = {
    menu: document.getElementById('screen-menu'),
    create: document.getElementById('screen-create'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results')
  };

  function showScreen(screenKey) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    screens[screenKey]?.classList.add('active');
    if (screenKey === 'menu') {
      fetchPublicRooms();
    }
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.getElementById('themeToggleBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  document.querySelectorAll('#soloLengthGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#soloLengthGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.soloWordLength = Number(btn.dataset.len);
    });
  });

  function updateCreatePreview() {
    const maxP = document.getElementById('maxPlayersSelect').value;
    const maxA = document.getElementById('maxAttemptsSelect').value;
    document.getElementById('configPreviewText').textContent =
      \`\${state.createWordLength}-Letter Word • Max \${maxP} Players • \${maxA} Attempts\`;
  }

  document.querySelectorAll('#createLengthGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#createLengthGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.createWordLength = Number(btn.dataset.len);
      updateCreatePreview();
    });
  });
  document.getElementById('maxPlayersSelect').addEventListener('change', updateCreatePreview);
  document.getElementById('maxAttemptsSelect').addEventListener('change', updateCreatePreview);

  async function startSoloGame() {
    try {
      const res = await fetch('/api/solo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wordLength: state.soloWordLength, maxAttempts: 6 })
      });
      const data = await res.json();
      if (!data.ok) return showToast(data.error || 'Could not start solo game.');

      state.mode = 'SOLO';
      state.soloSession = data.session;
      state.wordLength = data.session.wordLength;
      state.maxAttempts = data.session.maxAttempts;
      state.currentGuess = '';

      document.querySelector('.game-layout').classList.add('solo-only');
      document.getElementById('mpLiveSidebar').classList.add('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');
      document.getElementById('gameModeBadge').textContent = 'SOLO MODE';

      renderActiveGame();
      showScreen('game');
    } catch (err) {
      showToast('Network error starting Solo game.');
    }
  }

  document.getElementById('playSoloBtn').addEventListener('click', startSoloGame);
  document.getElementById('soloPlayAgainBtn').addEventListener('click', startSoloGame);
  document.getElementById('soloBackMenuBtn').addEventListener('click', () => showScreen('menu'));

  document.getElementById('openCreateRoomBtn').addEventListener('click', () => {
    updateCreatePreview();
    showScreen('create');
  });

  document.getElementById('backFromCreateBtn').addEventListener('click', () => showScreen('menu'));

  document.getElementById('confirmCreateRoomBtn').addEventListener('click', () => {
    const payload = {
      playerId,
      playerName: nameInput.value.trim() || 'Player',
      roomName: document.getElementById('roomNameInput').value.trim(),
      wordLength: state.createWordLength,
      maxPlayers: Number(document.getElementById('maxPlayersSelect').value),
      maxAttempts: Number(document.getElementById('maxAttemptsSelect').value),
      isPublic: document.getElementById('roomPublicCheckbox').checked
    };

    socket.emit('room:create', payload, (res) => {
      if (res?.error) return showToast(res.error);
      state.mode = 'MP';
      state.room = res.room;
      localStorage.setItem('lexirush_active_room', res.room.code);
      renderRoomState(res.room);
    });
  });

  function joinRoomByCode(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return showToast('Enter a valid 6-character room code.');

    socket.emit('room:join', {
      code: cleanCode,
      playerId,
      playerName: nameInput.value.trim() || 'Player'
    }, (res) => {
      if (res?.error) {
        localStorage.removeItem('lexirush_active_room');
        return showToast(res.error);
      }
      state.mode = 'MP';
      state.room = res.room;
      localStorage.setItem('lexirush_active_room', res.room.code);
      if (res.reconnected) showToast('Reconnected to room!');
      renderRoomState(res.room);
    });
  }

  document.getElementById('joinRoomBtn').addEventListener('click', () => {
    joinRoomByCode(document.getElementById('joinCodeInput').value);
  });

  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    if (!state.room) return;
    navigator.clipboard.writeText(state.room.code);
    showToast(\`Copied room code: \${state.room.code}\`);
  });

  document.getElementById('startMultiplayerBtn').addEventListener('click', () => {
    if (!state.room) return;
    socket.emit('room:start', { code: state.room.code, playerId }, (res) => {
      if (res?.error) showToast(res.error);
    });
  });

  function leaveCurrentRoom() {
    if (state.mode === 'MP' && state.room) {
      socket.emit('room:leave', { code: state.room.code, playerId });
    }
    localStorage.removeItem('lexirush_active_room');
    state.room = null;
    state.mode = null;
    showScreen('menu');
  }

  document.getElementById('leaveLobbyBtn').addEventListener('click', leaveCurrentRoom);
  document.getElementById('quitActiveGameBtn').addEventListener('click', leaveCurrentRoom);
  document.getElementById('resultsMainMenuBtn').addEventListener('click', leaveCurrentRoom);

  document.getElementById('resultsNewRoundBtn').addEventListener('click', () => {
    if (!state.room) return;
    socket.emit('room:new-round', { code: state.room.code, playerId }, (res) => {
      if (res?.error) showToast(res.error);
    });
  });

  socket.on('room:state', (roomState) => {
    const previousStatus = state.room?.status;
    const previousRound = state.room?.roundNumber;
    state.mode = 'MP';
    state.room = roomState;

    if (previousStatus !== 'IN_PROGRESS' && roomState.status === 'IN_PROGRESS') {
      state.currentGuess = '';
    } else if (previousRound !== roomState.roundNumber) {
      state.currentGuess = '';
    }

    renderRoomState(roomState);
  });

  socket.on('connect', () => {
    const savedRoom = localStorage.getItem('lexirush_active_room');
    if (savedRoom) {
      joinRoomByCode(savedRoom);
    }
  });

  function renderRoomState(room) {
    state.wordLength = room.wordLength;
    state.maxAttempts = room.maxAttempts;

    if (room.status === 'WAITING') {
      document.getElementById('lobbyRoomName').textContent = room.name;
      document.getElementById('lobbyRoomCode').textContent = room.code;
      document.getElementById('lobbyWordLenBadge').textContent = \`\${room.wordLength} Letters\`;
      document.getElementById('lobbyAttemptsBadge').textContent = \`\${room.maxAttempts} Attempts\`;
      document.getElementById('lobbyCapacityBadge').textContent = \`\${room.players.length} / \${room.maxPlayers} Players\`;

      const grid = document.getElementById('lobbyPlayersGrid');
      grid.innerHTML = '';
      room.players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'lobby-player-card';
        const initials = p.name.slice(0, 2).toUpperCase();
        card.innerHTML = \`
          <div class="avatar-circle">\${initials}</div>
          <div>
            <strong>\${p.name} \${p.id === playerId ? '(You)' : ''}</strong>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              \${p.isHost ? '👑 Host' : 'Ready'} \${!p.connected ? '• Offline' : ''}
            </div>
          </div>
        \`;
        grid.appendChild(card);
      });

      const isHost = room.hostId === playerId;
      const canStart = isHost && room.players.length >= 2;
      const startBtn = document.getElementById('startMultiplayerBtn');
      startBtn.style.display = isHost ? 'inline-block' : 'none';
      startBtn.disabled = !canStart;
      document.getElementById('lobbyWaitHint').textContent =
        room.players.length < 2
          ? 'Waiting for at least 2 players to start...'
          : isHost
          ? 'Ready to launch!'
          : 'Waiting for host to start the match...';

      showScreen('lobby');
    } else if (room.status === 'IN_PROGRESS') {
      document.querySelector('.game-layout').classList.remove('solo-only');
      document.getElementById('mpLiveSidebar').classList.remove('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');
      document.getElementById('gameModeBadge').textContent = \`ROOM #\${room.code} • ROUND \${room.roundNumber}\`;
      document.getElementById('sidebarRoomCode').textContent = \`#\${room.code}\`;

      renderActiveGame();
      renderLiveOpponents(room);
      showScreen('game');
    } else if (room.status === 'FINISHED') {
      renderResultsScreen(room);
      showScreen('results');
    }
  }

  function renderActiveGame() {
    const guesses = state.mode === 'SOLO'
      ? state.soloSession.guesses
      : (state.room.players.find(p => p.id === playerId)?.guesses || []);

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession.status
      : (state.room.players.find(p => p.id === playerId)?.status || 'PLAYING');

    const isStillPlaying = myStatus === 'IN_PROGRESS' || myStatus === 'PLAYING';
    const remaining = Math.max(0, state.maxAttempts - guesses.length);

    document.getElementById('gameRuleInfo').textContent = \`\${state.wordLength} Letters • \${state.maxAttempts} Tries\`;
    document.getElementById('remainingTriesText').textContent =
      isStillPlaying ? \`\${remaining} attempts remaining\` : \`Status: \${myStatus}\`;

    const gridEl = document.getElementById('wordGrid');
    gridEl.style.setProperty('--word-length', state.wordLength);
    gridEl.innerHTML = '';

    for (let r = 0; r < state.maxAttempts; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      if (r === guesses.length && isStillPlaying) {
        rowEl.id = 'activeGuessRow';
      }

      const submittedRow = guesses[r];

      for (let c = 0; c < state.wordLength; c++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';

        if (submittedRow) {
          const cell = submittedRow.evaluations[c];
          tile.textContent = cell.letter;
          tile.classList.add(cell.state);
        } else if (r === guesses.length && isStillPlaying) {
          const char = state.currentGuess[c] || '';
          tile.textContent = char;
          if (char) tile.classList.add('filled');
        }

        rowEl.appendChild(tile);
      }

      gridEl.appendChild(rowEl);
    }

    if (state.mode === 'SOLO' && !isStillPlaying) {
      const banner = document.getElementById('soloEndBanner');
      banner.classList.remove('hidden');
      document.getElementById('soloEndTitle').textContent =
        myStatus === 'WON' ? '🎉 Brilliant! You Solved It!' : 'Out of Attempts!';
      document.getElementById('soloEndSecret').innerHTML =
        \`The secret word was <strong>\${state.soloSession.secretWord}</strong>\`;
    }

    renderKeyboard(guesses);
  }

  function renderKeyboard(guesses) {
    const keyPrecedence = { correct: 3, present: 2, absent: 1 };
    const keyStates = {};

    guesses.forEach(g => {
      g.evaluations.forEach(({ letter, state: cellState }) => {
        const currentRank = keyPrecedence[keyStates[letter]] || 0;
        if (keyPrecedence[cellState] > currentRank) {
          keyStates[letter] = cellState;
        }
      });
    });

    const rows = [
      ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
      ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
      ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
    ];

    const kbEl = document.getElementById('keyboard');
    kbEl.innerHTML = '';

    rows.forEach(rowKeys => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';

      rowKeys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'kb-key';
        if (k === 'ENTER' || k === '⌫') btn.classList.add('wide');
        if (keyStates[k]) btn.classList.add(keyStates[k]);
        btn.textContent = k;
        btn.addEventListener('click', () => handleKeyInput(k));
        rowEl.appendChild(btn);
      });

      kbEl.appendChild(rowEl);
    });
  }

  function renderLiveOpponents(room) {
    const container = document.getElementById('liveOpponentsList');
    container.innerHTML = '';

    room.players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'opponent-card';

      const statusBadge =
        p.status === 'SOLVED'
          ? '✅ Solved'
          : p.status === 'FAILED'
          ? '❌ Out'
          : \`⏳ \${p.attemptsUsed}/\${room.maxAttempts}\`;

      const miniRowsHtml = p.guesses
        .map(g => {
          const cells = g.evaluations
            .map(c => \`<span class="mini-cell \${c.state}"></span>\`)
            .join('');
          return \`<div class="mini-row">\${cells}</div>\`;
        })
        .join('');

      card.innerHTML = \`
        <div class="opponent-top">
          <span>\${p.name} \${p.id === playerId ? '(You)' : ''}</span>
          <span>\${statusBadge}</span>
        </div>
        <div class="mini-grid">\${miniRowsHtml || '<small style="color:var(--text-muted)">No guesses yet</small>'}</div>
      \`;
      container.appendChild(card);
    });
  }

  function renderResultsScreen(room) {
    document.getElementById('resultsSecretWord').textContent = room.secretWord || '-----';

    const listEl = document.getElementById('resultsLeaderboard');
    listEl.innerHTML = '';

    room.leaderboard.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'leader-row';

      const medal = idx === 0 && p.status === 'SOLVED' ? '🏆' : \`#\${idx + 1}\`;
      const outcome =
        p.status === 'SOLVED'
          ? \`Solved in \${p.attemptsUsed}/\${room.maxAttempts} (\${((p.durationMs || 0) / 1000).toFixed(1)}s)\`
          : \`Failed (\${p.attemptsUsed}/\${room.maxAttempts})\`;

      row.innerHTML = \`
        <div>
          <strong>\${medal} \${p.name} \${p.id === playerId ? '(You)' : ''}</strong>
        </div>
        <div>\${outcome}</div>
      \`;
      listEl.appendChild(row);
    });

    const newRoundBtn = document.getElementById('resultsNewRoundBtn');
    if (room.hostId === playerId) {
      newRoundBtn.classList.remove('hidden');
    } else {
      newRoundBtn.classList.add('hidden');
    }
  }

  async function handleKeyInput(key) {
    if (!screens.game.classList.contains('active') || state.isSubmitting) return;

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession?.status
      : state.room?.players.find(p => p.id === playerId)?.status;

    if (myStatus !== 'IN_PROGRESS' && myStatus !== 'PLAYING') return;

    if (key === '⌫' || key === 'BACKSPACE') {
      state.currentGuess = state.currentGuess.slice(0, -1);
      renderActiveGame();
      return;
    }

    if (key === 'ENTER') {
      if (state.currentGuess.length !== state.wordLength) {
        shakeActiveRow();
        return showToast(\`Word must be \${state.wordLength} letters!\`);
      }
      await submitCurrentGuess();
      return;
    }

    if (/^[A-Z]$/.test(key) && state.currentGuess.length < state.wordLength) {
      state.currentGuess += key;
      renderActiveGame();
    }
  }

  function shakeActiveRow() {
    const row = document.getElementById('activeGuessRow');
    if (row) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
  }

  async function submitCurrentGuess() {
    state.isSubmitting = true;
    const guessToSubmit = state.currentGuess;

    try {
      if (state.mode === 'SOLO') {
        const res = await fetch('/api/solo/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: state.soloSession.sessionId,
            guess: guessToSubmit
          })
        });
        const data = await res.json();
        if (!data.ok) {
          shakeActiveRow();
          showToast(data.error);
        } else {
          state.soloSession = data.session;
          state.currentGuess = '';
          renderActiveGame();
        }
      } else if (state.mode === 'MP' && state.room) {
        socket.emit('room:guess', {
          code: state.room.code,
          playerId,
          guess: guessToSubmit
        }, (res) => {
          if (res?.error) {
            shakeActiveRow();
            showToast(res.error);
          } else {
            state.currentGuess = '';
          }
        });
      }
    } finally {
      state.isSubmitting = false;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement.tagName === 'INPUT') return;
    const key = e.key.toUpperCase();
    if (key === 'ENTER' || key === 'BACKSPACE' || /^[A-Z]$/.test(key)) {
      e.preventDefault();
      handleKeyInput(key);
    }
  });

  async function fetchPublicRooms() {
    try {
      const res = await fetch('/api/rooms/public');
      const data = await res.json();
      const container = document.getElementById('publicRoomsList');
      if (!data.rooms || data.rooms.length === 0) {
        container.innerHTML = '<p class="muted-text">No open lobbies right now. Create one above!</p>';
        return;
      }
      container.innerHTML = '';
      data.rooms.forEach(r => {
        const item = document.createElement('div');
        item.className = 'public-room-item';
        item.innerHTML = \`
          <div>
            <strong>\${r.name}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">
              \${r.wordLength} Letters • \${r.playerCount}/\${r.maxPlayers} Players
            </span>
          </div>
          <button class="btn btn-secondary btn-sm" data-code="\${r.code}">Join #\${r.code}</button>
        \`;
        item.querySelector('button').addEventListener('click', () => joinRoomByCode(r.code));
        container.appendChild(item);
      });
    } catch (e) {}
  }

  document.getElementById('refreshPublicRoomsBtn').addEventListener('click', fetchPublicRooms);
  fetchPublicRooms();
})();
`,

    'tests/game.test.js': `const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateGuess } = require('../server/gameEngine');
const { RoomManager } = require('../server/roomManager');

test('Duplicate-letter evaluation strictly matches Wordle two-pass rules', () => {
  const res1 = evaluateGuess('BABES', 'ABBEY');
  assert.deepEqual(res1.map(r => r.state), ['present', 'present', 'correct', 'correct', 'absent']);

  const res2 = evaluateGuess('LULLS', 'SKILL');
  assert.deepEqual(res2.map(r => r.state), ['present', 'absent', 'absent', 'correct', 'present']);
});

test('Supports dynamic word lengths of 4, 5, 6, and 7 letters', () => {
  const rm = new RoomManager();
  for (const len of [4, 5, 6, 7]) {
    const solo = rm.createSoloGame({ wordLength: len });
    assert.equal(solo.wordLength, len);
    assert.equal(solo.secretWord, null);
  }
});

test('Enforces 2-to-10 player room limits and prevents starting with 1 player', () => {
  const rm = new RoomManager();
  const room = rm.createRoom({
    hostId: 'p1',
    hostName: 'Host',
    socketId: 's1',
    wordLength: 5,
    maxPlayers: 10
  });

  const earlyStart = rm.startGame({ code: room.code, requesterId: 'p1' });
  assert.ok(earlyStart.error);

  for (let i = 2; i <= 10; i++) {
    const res = rm.joinRoom({ code: room.code, playerId: \`p\${i}\`, playerName: \`Player \${i}\`, socketId: \`s\${i}\` });
    assert.ok(res.room);
  }
  assert.equal(room.players.size, 10);

  const eleventh = rm.joinRoom({ code: room.code, playerId: 'p11', playerName: 'Extra', socketId: 's11' });
  assert.ok(eleventh.error);
  assert.match(eleventh.error, /full/i);
});

test('Secret word is independent per room and never leaked before round finishes', () => {
  const rm = new RoomManager();
  const roomA = rm.createRoom({ hostId: 'h1', hostName: 'H1', socketId: 's1', wordLength: 5 });
  rm.joinRoom({ code: roomA.code, playerId: 'p2', playerName: 'P2', socketId: 's2' });
  rm.startGame({ code: roomA.code, requesterId: 'h1' });

  const clientView = rm.serializeRoomForPlayer(roomA, 'h1');
  assert.equal(clientView.secretWord, null);

  const badGuess = rm.submitMultiplayerGuess({ code: roomA.code, playerId: 'h1', rawGuess: 'ZZZZZ' });
  assert.ok(badGuess.error);
  assert.equal(roomA.players.get('h1').guesses.length, 0);
});
`
};

for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = path.join(ROOT_DIR, relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content, 'utf8');
    console.log('Created:', relativePath);
}

console.log('\n✅ Project successfully generated in:', ROOT_DIR);
console.log('Next steps:\n  cd wordle-party-phase1\n  npm install\n  npm test\n  npm start');