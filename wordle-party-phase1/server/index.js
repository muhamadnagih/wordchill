const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { RoomManager } = require('./roomManager');
const { evaluateGuess } = require('./gameEngine');
const {
  getSecretWord,
  getDailyWord,
  getDailyNumber,
  createChallengePayload,
  decodeChallengePayload,
  isValidWord,
  normalizeWord,
  SUPPORTED_LENGTHS,
  SUPPORTED_LANGS
} = require('./dictionary');

const app = express();
const roomManager = new RoomManager();
const SECRET_KEY = process.env.SESSION_SECRET || 'wordchill-vercel-secret-key-2026';

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory scoreboards for daily & challenge sharing (Serverless friendly cache)
const dailyScores = new Map(); // key: "day-LANG-LEN" -> Array of { name, score, solved, time, avatar }
// Track which Discord user IDs have already submitted daily scores (prevent replay)
const dailySubmissions = new Map(); // key: "day-LANG-userId" -> true

// دوال مساعدة لجعل اللعب الفردي Stateless تماماً على Vercel
function signSoloToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySoloToken(token) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET_KEY).update(data).digest('base64url');
  if (sig !== expected) return null;
  return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
}

// ==================== DAILY & CHALLENGE INFO ENDPOINTS ====================
app.get('/api/daily/info', (req, res) => {
  const todayNum = getDailyNumber();
  const now = new Date();
  const nextUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));
  const msUntilNext = Math.max(0, nextUtcMidnight.getTime() - now.getTime());

  res.json({
    ok: true,
    dayNumber: todayNum,
    dateStr: now.toISOString().slice(0, 10),
    msUntilNext,
    supportedLengths: SUPPORTED_LENGTHS,
    supportedLangs: SUPPORTED_LANGS
  });
});

app.post('/api/challenge/create', (req, res) => {
  try {
    const { secretWord, lang, wordLength, maxAttempts, challengerName, challengerScore, dayNumber } = req.body || {};
    if (!secretWord) return res.status(400).json({ ok: false, error: 'Secret word required.' });

    const challengeToken = createChallengePayload({
      secretWord,
      lang: lang || 'en',
      wordLength: wordLength || 5,
      maxAttempts: maxAttempts || 6,
      challengerName: challengerName || 'Challenger',
      challengerScore: challengerScore || 4,
      dayNumber: dayNumber || null
    });

    res.json({
      ok: true,
      challengeToken,
      shareUrl: `?challenge=${challengeToken}`
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ==================== SOLO ENDPOINTS (STATELESS FOR VERCEL) ====================
app.post('/api/solo/start', (req, res) => {
  try {
    const { wordLength = 5, maxAttempts = 6, lang = 'en', isDaily = false, challenge = null } = req.body || {};
    let finalLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    let finalLen = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    let finalAttempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    let secretWord = null;
    let modeType = 'SOLO';
    let dayNum = null;
    let challengerInfo = null;

    if (challenge) {
      const decoded = decodeChallengePayload(challenge);
      if (decoded && decoded.secretWord) {
        secretWord = decoded.secretWord;
        finalLang = decoded.lang;
        finalLen = decoded.wordLength;
        finalAttempts = decoded.maxAttempts;
        dayNum = decoded.dayNumber;
        modeType = 'CHALLENGE';
        challengerInfo = {
          name: decoded.challengerName,
          score: decoded.challengerScore,
          attempts: decoded.maxAttempts
        };
      }
    }

    if (!secretWord && isDaily) {
      dayNum = getDailyNumber();
      secretWord = getDailyWord(dayNum, finalLen, finalLang);
      modeType = 'DAILY';
    }

    if (!secretWord) {
      secretWord = getSecretWord(finalLen, finalLang);
    }

    const stateObj = {
      lang: finalLang,
      wordLength: finalLen,
      maxAttempts: finalAttempts,
      secretWord,
      guesses: [],
      status: 'IN_PROGRESS',
      modeType,
      dayNumber: dayNum,
      challenger: challengerInfo
    };

    const sessionId = signSoloToken(stateObj);
    res.json({
      ok: true,
      session: {
        sessionId,
        lang: finalLang,
        wordLength: finalLen,
        maxAttempts: finalAttempts,
        guesses: [],
        status: 'IN_PROGRESS',
        modeType,
        dayNumber: dayNum,
        challenger: challengerInfo,
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
      return res.status(400).json({ ok: false, error: isAr ? `الكلمة يجب أن تكون ${session.wordLength} حروف!` : `Word must be ${session.wordLength} letters.` });
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
        modeType: session.modeType || 'SOLO',
        dayNumber: session.dayNumber || null,
        challenger: session.challenger || null,
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

// ==================== DISCORD ACTIVITY & EMBEDDED SDK ENDPOINTS ====================
app.post('/api/discord/token', async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, error: 'Authorization code is required' });

    const clientId = process.env.DISCORD_CLIENT_ID || '1562771601764651109';
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      // In standalone or unconfigured dev environments, return mock profile gracefully
      return res.json({
        ok: true,
        access_token: 'mock_discord_token',
        user: {
          id: 'guest_' + Math.random().toString(36).substring(2, 8),
          username: 'DiscordUser',
          global_name: 'Discord Player'
        }
      });
    }

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).json({ ok: false, error: tokenData.error_description || 'Discord OAuth failed' });
    }

    res.json({ ok: true, access_token: tokenData.access_token });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== AVATAR PROXY (BYPASS CORS/CSP FOR CANVAS) ====================
app.get('/api/avatar-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing url parameter' });
    }
    // Only allow Discord CDN URLs for security
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith('discord.com') && !parsed.hostname.endsWith('discordapp.com')) {
      return res.status(403).json({ ok: false, error: 'Only Discord CDN URLs are allowed' });
    }

    const imgRes = await fetch(url);
    if (!imgRes.ok) {
      return res.status(404).json({ ok: false, error: 'Avatar not found' });
    }

    const contentType = imgRes.headers.get('content-type') || 'image/png';
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    res.json({
      ok: true,
      dataUri: `data:${contentType};base64,${base64}`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== DISCORD RESULT CARD & PRESENCE SHARE ENDPOINT ====================
app.post('/api/discord/share', async (req, res) => {
  try {
    const {
      webhookUrl,
      playerName,
      avatarUrl,
      lang,
      attemptsUsed,
      maxAttempts,
      solved,
      imageBase64,
      gameUrl,
      dayNumber,
      isDaily,
      challengeInfo,
      wordLength,
      discordUserId
    } = req.body || {};

    // ===== DAILY CHALLENGE DUPLICATE PROTECTION =====
    const dedupKey = (isDaily && dayNumber && discordUserId)
      ? `${dayNumber}_${lang || 'en'}_${discordUserId}`
      : null;

    if (dedupKey && dailySubmissions.has(dedupKey)) {
      return res.status(409).json({
        ok: false,
        error: 'You have already submitted your Daily Challenge result for today. Each player gets only one attempt per day per language.',
        alreadySubmitted: true
      });
    }

    const targetWebhook = (webhookUrl || process.env.DISCORD_WEBHOOK_URL || '').trim();
    if (!targetWebhook.startsWith('https://discord.com/api/webhooks/')) {
      return res.status(400).json({ ok: false, error: 'يرجى وضع رابط Discord Webhook صحيح أولاً!' });
    }

    if (dedupKey) {
      dailySubmissions.set(dedupKey, true);
    }

    const scoreText = solved ? `${attemptsUsed}/${maxAttempts}` : `X/${maxAttempts}`;
    const crown = solved && attemptsUsed <= 4 ? '👑 ' : '';
    const speed = solved && attemptsUsed <= 3 ? '⚡ ' : '';
    const langLabel = lang === 'ar' ? 'عربي 🇪🇬' : 'EN 🇬🇧';
    const dayLabel = dayNumber ? `WordChill No. ${dayNumber}` : 'WordChill Challenge';

    // Store in scoreboard cache
    const scoreKey = `${dayNumber || 'custom'}_${lang || 'en'}_${wordLength || 5}`;
    if (!dailyScores.has(scoreKey)) {
      dailyScores.set(scoreKey, []);
    }
    const list = dailyScores.get(scoreKey);
    const existingIdx = list.findIndex(e => e.name === (playerName || 'Player'));
    const entry = {
      name: playerName || 'Player',
      attempts: attemptsUsed,
      maxAttempts,
      solved: Boolean(solved),
      avatar: avatarUrl || null,
      timestamp: Date.now()
    };
    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => {
      if (a.solved && !b.solved) return -1;
      if (!a.solved && b.solved) return 1;
      if (a.solved && b.solved) return a.attempts - b.attempts;
      return b.timestamp - a.timestamp;
    });
    if (list.length > 8) list.length = 8;

    // Leaderboard summary text
    let scoreboardText = '';
    if (list.length > 1) {
      scoreboardText = `\n\n🏆 **Server Leaderboard (${dayLabel}):**\n` +
        list.slice(0, 5).map((p, i) => {
          const medal = i === 0 ? '🥇' : (i === 1 ? '🥈' : (i === 2 ? '🥉' : '•'));
          const sc = p.solved ? `${p.attempts}/${p.maxAttempts}` : `X/${p.maxAttempts}`;
          return `${medal} **${p.name}** — ${sc}`;
        }).join('\n');
    }

    let challengeComparison = '';
    if (challengeInfo && challengeInfo.name) {
      if (solved && attemptsUsed < challengeInfo.score) {
        challengeComparison = `\n⚔️ Beat **${challengeInfo.name}**'s challenge! (${attemptsUsed}/${maxAttempts} vs ${challengeInfo.score}/${challengeInfo.attempts}) 🔥`;
      } else if (solved && attemptsUsed === challengeInfo.score) {
        challengeComparison = `\n⚔️ Tied with **${challengeInfo.name}**! (${attemptsUsed}/${maxAttempts}) 🤝`;
      } else {
        challengeComparison = `\n⚔️ Challenged by **${challengeInfo.name}** (${challengeInfo.score}/${challengeInfo.attempts})`;
      }
    }

    const playUrl = gameUrl || 'https://wordchill.vercel.app';
    const content = `🔥 Result: ${crown}${speed}**${scoreText}**: **@${playerName || 'Player'}** (${langLabel})\n` +
      `**${playerName || 'Player'}** was playing **${dayLabel}** • 🎮 **[Play now!](${playUrl})**` +
      challengeComparison +
      scoreboardText;

    const payloadJson = {
      username: 'WordChill',
      avatar_url: 'https://wordchill.vercel.app/favicon.ico',
      content,
      components: [
        {
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 5, // Link button (Blurple)
              label: 'Play now!',
              url: playUrl,
              emoji: { name: '🎮' }
            }
          ]
        }
      ]
    };

    let discordRes;
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      payloadJson.attachments = [{ id: 0, filename: 'wordchill-card.png' }];

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify(payloadJson));
      formData.append('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'wordchill-card.png');

      discordRes = await fetch(targetWebhook + '?wait=true', {
        method: 'POST',
        body: formData
      });
    } else {
      discordRes = await fetch(targetWebhook + '?wait=true', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadJson)
      });
    }

    if (!discordRes.ok) {
      const errText = await discordRes.text().catch(() => '');
      return res.status(400).json({ ok: false, error: 'تعذر الإرسال إلى ديسكورد، تأكد من صحة رابط الـ Webhook', detail: errText });
    }

    res.json({ ok: true, leaderboard: list });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 WordChill Server (Vercel-Ready) running on http://localhost:${PORT}`);
  });
}

module.exports = app;
