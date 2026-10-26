const fs = require('fs');
const path = require('path');

// 1. إنشاء مجلد وملف api/index.js الخاص بـ Vercel Serverless
const apiDir = path.join(__dirname, 'api');
fs.mkdirSync(apiDir, { recursive: true });

const API_INDEX_JS = `const app = require('../server/index.js');
module.exports = app;
`;
fs.writeFileSync(path.join(apiDir, 'index.js'), API_INDEX_JS, 'utf8');

// 2. إنشاء ملف إعدادات vercel.json في المجلد الرئيسي
const VERCEL_JSON = `{
  "version": 2,
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.js" }
  ]
}
`;
fs.writeFileSync(path.join(__dirname, 'vercel.json'), VERCEL_JSON, 'utf8');

// 3. تحديث server/dictionary.js ليستخدم require() حتى يدمج Vercel ملفات القاموس تلقائياً
const dictPath = path.join(__dirname, 'server', 'dictionary.js');
let dictCode = fs.readFileSync(dictPath, 'utf8');
dictCode = dictCode.replace(
  /const enPath[\s\S]*?const DICTIONARIES = \{[\s\S]*?\};/,
  `const DICTIONARIES = {
  en: require('./data/words-en.json'),
  ar: require('./data/words-ar.json')
};`
);
fs.writeFileSync(dictPath, dictCode, 'utf8');

// 4. تحديث server/index.js ليدعم Vercel Serverless + جميع مسارات اللعب الجماعي عبر HTTP
const SERVER_INDEX_JS = `const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { RoomManager } = require('./roomManager');
const { evaluateGuess } = require('./gameEngine');
const { getSecretWord, isValidWord, normalizeWord, SUPPORTED_LENGTHS, SUPPORTED_LANGS } = require('./dictionary');

const app = express();
const roomManager = new RoomManager();
const SECRET_KEY = 'wordchill-vercel-secret-key-2026';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// دوال مساعدة لجعل اللعب الفردي Stateless تماماً على Vercel
function signSoloToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  return \`\${data}.\${sig}\`;
}

function verifySoloToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

// ==================== SOLO ENDPOINTS (STATELESS FOR VERCEL) ====================
app.post('/api/solo/start', (req, res) => {
  try {
    const { wordLength = 5, maxAttempts = 6, lang = 'en' } = req.body || {};
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const secretWord = getSecretWord(len, safeLang);

    const stateObj = {
      lang: safeLang,
      wordLength: len,
      maxAttempts: attempts,
      secretWord,
      guesses: [],
      status: 'IN_PROGRESS'
    };

    const sessionId = signSoloToken(stateObj);
    res.json({
      ok: true,
      session: {
        sessionId,
        lang: safeLang,
        wordLength: len,
        maxAttempts: attempts,
        guesses: [],
        status: 'IN_PROGRESS',
        secretWord: null
      }
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/solo/guess', (req, res) => {
  try {
    const { sessionId, guess: rawGuess } = req.body || {};
    const session = verifySoloToken(sessionId);
    if (!session) return res.status(400).json({ ok: false, error: 'Session expired. Start a new game.' });
    if (session.status !== 'IN_PROGRESS') {
      return res.status(400).json({ ok: false, error: 'Game already finished.' });
    }

    const isAr = session.lang === 'ar';
    const guess = normalizeWord(rawGuess || '', session.lang);

    if (guess.length !== session.wordLength) {
      return res.status(400).json({ ok: false, error: isAr ? \`الكلمة يجب أن تكون \${session.wordLength} حروف!\` : \`Word must be \${session.wordLength} letters.\` });
    }
    if (!isValidWord(guess, session.wordLength, session.lang)) {
      return res.status(400).json({ ok: false, error: isAr ? 'الكلمة غير موجودة في القاموس!' : 'Not in word list. Try a common word!' });
    }
    if (session.guesses.some(g => g.word === guess)) {
      return res.status(400).json({ ok: false, error: isAr ? 'لقد جربت هذه الكلمة من قبل!' : 'You already tried that word!' });
    }

    const evaluations = evaluateGuess(guess, session.secretWord, session.lang);
    session.guesses.push({ word: guess, evaluations });

    if (evaluations.every(c => c.state === 'correct')) {
      session.status = 'WON';
    } else if (session.guesses.length >= session.maxAttempts) {
      session.status = 'LOST';
    }

    const newSessionId = signSoloToken(session);
    const isFinished = session.status === 'WON' || session.status === 'LOST';

    res.json({
      ok: true,
      session: {
        sessionId: newSessionId,
        lang: session.lang,
        wordLength: session.wordLength,
        maxAttempts: session.maxAttempts,
        guesses: session.guesses,
        status: session.status,
        secretWord: isFinished ? session.secretWord : null
      },
      lastEvaluation: evaluations
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ==================== MULTIPLAYER HTTP ENDPOINTS (VERCEL COMPATIBLE) ====================
app.get('/api/rooms/public', (req, res) => {
  res.json({ ok: true, rooms: roomManager.getPublicWaitingRooms() });
});

app.post('/api/mp/create', (req, res) => {
  const { playerId, playerName, roomName, wordLength, maxPlayers, maxAttempts, isPublic, lang } = req.body || {};
  const room = roomManager.createRoom({
    hostId: playerId,
    hostName: playerName,
    socketId: 'http',
    roomName,
    wordLength,
    maxPlayers,
    maxAttempts,
    isPublic,
    lang
  });
  res.json({ ok: true, room: roomManager.serializeRoomForPlayer(room, playerId) });
});

app.post('/api/mp/join', (req, res) => {
  const { code, playerId, playerName } = req.body || {};
  const result = roomManager.joinRoom({ code, playerId, playerName, socketId: 'http' });
  if (result.error) return res.json({ error: result.error });
  res.json({
    ok: true,
    reconnected: result.reconnected,
    room: roomManager.serializeRoomForPlayer(result.room, playerId)
  });
});

app.get('/api/mp/state', (req, res) => {
  const { code, playerId } = req.query;
  const room = roomManager.rooms.get((code || '').toUpperCase());
  if (!room) return res.json({ error: 'Room not found.' });
  res.json({ ok: true, room: roomManager.serializeRoomForPlayer(room, playerId) });
});

app.post('/api/mp/start', (req, res) => {
  const { code, playerId } = req.body || {};
  const result = roomManager.startGame({ code, requesterId: playerId });
  if (result.error) return res.json({ error: result.error });
  res.json({ ok: true, room: roomManager.serializeRoomForPlayer(result.room, playerId) });
});

app.post('/api/mp/guess', (req, res) => {
  const { code, playerId, guess } = req.body || {};
  const result = roomManager.submitMultiplayerGuess({ code, playerId, rawGuess: guess });
  if (result.error) return res.json({ error: result.error });
  res.json({ ok: true, room: roomManager.serializeRoomForPlayer(result.room, playerId) });
});

app.post('/api/mp/new-round', (req, res) => {
  const { code, playerId } = req.body || {};
  const result = roomManager.startNewRound({ code, requesterId: playerId });
  if (result.error) return res.json({ error: result.error });
  res.json({ ok: true, room: roomManager.serializeRoomForPlayer(result.room, playerId) });
});

app.post('/api/mp/leave', (req, res) => {
  const { code, playerId } = req.body || {};
  roomManager.leaveRoom({ code, playerId });
  res.json({ ok: true });
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(\`🚀 WordChill Server (Vercel-Ready) running on http://localhost:\${PORT}\`);
  });
}

module.exports = app;
`;
fs.writeFileSync(path.join(__dirname, 'server', 'index.js'), SERVER_INDEX_JS, 'utf8');

// 5. تحديث public/index.html لإزالة الحاجة لملف socket.io.js
const htmlPath = path.join(__dirname, 'public', 'index.html');
let htmlCode = fs.readFileSync(htmlPath, 'utf8');
htmlCode = htmlCode.replace('<script src="/socket.io/socket.io.js"></script>', '');
fs.writeFileSync(htmlPath, htmlCode, 'utf8');

// 6. تحديث public/client.js ليستبدل Socket.io بـ HTTP Live Sync المتوافق مع Vercel
const clientPath = path.join(__dirname, 'public', 'client.js');
let clientCode = fs.readFileSync(clientPath, 'utf8');

const VERCEL_SOCKET_SHIM = `
  // محاكي اتصال ذكي يعمل عبر HTTP ليتوافق مع Vercel Serverless بنسبة 100%
  let roomStateListener = null;
  const socket = {
    on(event, cb) {
      if (event === 'room:state') roomStateListener = cb;
      if (event === 'connect') setTimeout(cb, 100);
    },
    async emit(event, payload, cb) {
      const map = {
        'room:create': '/api/mp/create',
        'room:join': '/api/mp/join',
        'room:start': '/api/mp/start',
        'room:guess': '/api/mp/guess',
        'room:new-round': '/api/mp/new-round',
        'room:leave': '/api/mp/leave'
      };
      try {
        const res = await fetch(map[event], {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload || {})
        });
        const data = await res.json();
        cb?.(data);
        if (data.room && roomStateListener && event !== 'room:create' && event !== 'room:join') {
          roomStateListener(data.room);
        }
      } catch (err) {
        cb?.({ error: 'Network error' });
      }
    }
  };

  setInterval(async () => {
    const activeCode = localStorage.getItem('lexirush_active_room');
    if (!activeCode || !roomStateListener) return;
    try {
      const res = await fetch(\`/api/mp/state?code=\${encodeURIComponent(activeCode)}&playerId=\${encodeURIComponent(playerId)}\`);
      const data = await res.json();
      if (data.ok && data.room) {
        roomStateListener(data.room);
      }
    } catch (e) {}
  }, 1300);
`;

clientCode = clientCode.replace('const socket = io();', VERCEL_SOCKET_SHIM);
fs.writeFileSync(clientPath, clientCode, 'utf8');

console.log('✅ تم تجهيز المشروع بالكامل للعمل على Vercel مجاناً وبدون فيزا!');