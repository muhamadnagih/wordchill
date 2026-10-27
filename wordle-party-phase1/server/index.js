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

app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Discord Activity Proxy middleware: strip /.proxy prefix if present
app.use((req, res, next) => {
  if (req.url.startsWith('/.proxy/')) {
    req.url = req.url.slice(8);
  } else if (req.url === '/.proxy') {
    req.url = '/';
  }
  next();
});

app.use(express.static(path.join(__dirname, '..', 'public')));

// In-memory scoreboards for daily & challenge sharing (Serverless friendly cache)
const dailyScores = new Map(); // key: "day-LANG-LEN" -> Array of { name, score, solved, time, avatar }
// Track which individual players have already submitted daily scores (prevent replay, per-player scoped)
const dailySubmissions = new Map(); // key: "day-LANG-playerIdentity" -> true

// In-memory cache for resolved avatar Base64 data URIs
const avatarDataUriCache = new Map();

// Default fallback channels/webhooks for players lacking explicit client-side config
let lastActiveWebhook = process.env.DISCORD_WEBHOOK_URL || '';
let lastActiveChannelId = process.env.DISCORD_CHANNEL_ID || '';
let lastActiveGuildId = process.env.DISCORD_GUILD_ID || '';

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
const { registerDiscordCommands } = require('../scripts/register-commands');

const handleTokenExchange = async (req, res) => {
  try {
    const { code, redirect_uri } = req.body || {};
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

    const tokenParams = {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code
    };
    const effectiveRedirectUri = redirect_uri || process.env.DISCORD_REDIRECT_URI;
    if (effectiveRedirectUri) {
      tokenParams.redirect_uri = effectiveRedirectUri;
    }

    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenParams)
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(400).json({ ok: false, error: tokenData.error_description || 'Discord OAuth failed' });
    }

    // Fetch user profile from Discord API
    let user = null;
    try {
      const userRes = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      if (userRes.ok) {
        user = await userRes.json();
      }
    } catch (e) {
      console.warn('Failed to fetch user profile:', e.message);
    }

    res.json({
      ok: true,
      access_token: tokenData.access_token,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      scope: tokenData.scope,
      user
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

app.post('/api/token', handleTokenExchange);
app.post('/api/discord/token', handleTokenExchange);

// ==================== DISCORD INTERACTIONS (SLASH COMMANDS & PING) ====================
function verifyDiscordSignature(req) {
  const publicKey = (process.env.DISCORD_PUBLIC_KEY || '').trim();
  if (!publicKey) return false; // Security requirement: Discord verification fails if public key is not configured
  const signature = req.headers['x-signature-ed25519'];
  const timestamp = req.headers['x-signature-timestamp'];
  if (!signature || !timestamp) return false;
  try {
    const rawBodyBuf = Buffer.isBuffer(req.rawBody)
      ? req.rawBody
      : Buffer.from(req.rawBody || JSON.stringify(req.body || {}), 'utf-8');
    const message = Buffer.concat([Buffer.from(timestamp, 'utf-8'), rawBodyBuf]);
    const derKey = Buffer.concat([
      Buffer.from('302a300506032b6570032100', 'hex'),
      Buffer.from(publicKey, 'hex')
    ]);
    const keyObj = crypto.createPublicKey({ key: derKey, format: 'der', type: 'spki' });
    return crypto.verify(null, message, keyObj, Buffer.from(signature, 'hex'));
  } catch (e) {
    return false;
  }
}

const handleInteraction = (req, res) => {
  if (!verifyDiscordSignature(req)) {
    return res.status(401).send('invalid request signature');
  }

  const interaction = req.body || {};

  // Type 1: PING (Discord endpoint verification handshake)
  if (interaction.type === 1) {
    return res.json({ type: 1 });
  }

  // Type 2: APPLICATION_COMMAND (Slash Commands: /wordchill, /launch)
  if (interaction.type === 2) {
    const cmdName = interaction.data?.name;
    const clientId = process.env.DISCORD_CLIENT_ID || '1562771601764651109';
    const activityLaunchUrl = `https://discord.com/activities/${clientId}`;
    const webAppUrl = 'https://wordchill.vercel.app';

    if (cmdName === 'wordchill' || cmdName === 'launch') {
      return res.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: {
          content: '🎮 **WordChill — Daily Word Challenge & Multiplayer Party**\nPlay today\'s secret word or challenge server members directly inside Discord!',
          components: [
            {
              type: 1, // ACTION_ROW
              components: [
                {
                  type: 2, // BUTTON
                  style: 5, // LINK
                  label: 'Launch WordChill 🎮',
                  url: activityLaunchUrl
                },
                {
                  type: 2, // BUTTON
                  style: 5, // LINK
                  label: 'Play in Browser 🌐',
                  url: webAppUrl
                }
              ]
            }
          ]
        }
      });
    }

    return res.json({
      type: 4,
      data: { content: '🎮 WordChill Activity is ready to play!' }
    });
  }

  return res.json({ type: 1 });
};

app.post('/api/interactions', handleInteraction);
app.post('/api/discord/interactions', handleInteraction);

// Trigger command registration over HTTP
app.post('/api/discord/register-commands', async (req, res) => {
  try {
    const result = await registerDiscordCommands(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// View registered commands via Bot API
app.get('/api/discord/commands', async (req, res) => {
  try {
    const clientId = process.env.DISCORD_CLIENT_ID || '1562771601764651109';
    const botToken = process.env.DISCORD_BOT_TOKEN;
    if (!botToken) {
      return res.json({ ok: false, error: 'DISCORD_BOT_TOKEN not configured in environment' });
    }
    const r = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
      headers: { Authorization: `Bot ${botToken}` }
    });
    const commands = await r.json();
    res.json({ ok: r.ok, status: r.status, commands });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== DISCORD AVATAR RESOLVER & PROXY ====================
function isAllowedAvatarDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const isDiscord = host.endsWith('discord.com') ||
                      host.endsWith('discordapp.com') ||
                      host.endsWith('discordapp.net') ||
                      host.endsWith('discord.media') ||
                      host.endsWith('discord.gg');
    return isDiscord ||
      host.endsWith('githubusercontent.com') ||
      host.endsWith('imgur.com') ||
      host.endsWith('googleusercontent.com') ||
      host.endsWith('ui-avatars.com') ||
      host.endsWith('gravatar.com');
  } catch (e) {
    return false;
  }
}

async function resolveAvatarDataUri({ avatarUrl, userId, avatarHash, playerName, guildId }) {
  const cacheKey = (avatarUrl && typeof avatarUrl === 'string')
    ? avatarUrl
    : (userId ? `user_${userId}` : (playerName ? `name_${playerName}_${guildId || ''}` : null));

  if (cacheKey && avatarDataUriCache.has(cacheKey)) {
    return { ok: true, dataUri: avatarDataUriCache.get(cacheKey) };
  }

  let targetCdnUrl = null;

  // a) Full avatarUrl provided
  if (avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim()) {
    const trimmed = avatarUrl.trim();
    if (trimmed.startsWith('data:')) {
      if (cacheKey) avatarDataUriCache.set(cacheKey, trimmed);
      return { ok: true, dataUri: trimmed };
    }
    if (!isAllowedAvatarDomain(trimmed)) {
      return { ok: false, status: 403, error: 'Unsupported avatar domain' };
    }
    targetCdnUrl = trimmed;
  }
  // a2) userId + avatarHash provided
  else if (userId && avatarHash) {
    targetCdnUrl = `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=256`;
  }
  // b) Only userId provided -> query Discord REST API using Bot Token, or fallback to snowflake default
  else if (userId && process.env.DISCORD_BOT_TOKEN) {
    try {
      const uRes = await fetch(`https://discord.com/api/v10/users/${userId}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
      });
      if (uRes.ok) {
        const uData = await uRes.json();
        if (uData.avatar) {
          targetCdnUrl = `https://cdn.discordapp.com/avatars/${uData.id}/${uData.avatar}.png?size=256`;
        } else {
          const defaultAvatarNum = (BigInt(uData.id || 0) >> 22n) % 6n;
          targetCdnUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
        }
      }
    } catch (e) {
      console.warn('Discord Bot API user lookup note:', e.message);
    }
  }

  // b2) If targetCdnUrl still not resolved, but userId is a valid numeric Discord ID, compute default Discord avatar
  if (!targetCdnUrl && userId && /^\d{15,22}$/.test(userId)) {
    try {
      const defaultAvatarNum = (BigInt(userId) >> 22n) % 6n;
      targetCdnUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
    } catch (e) {}
  }

  // c) CRITICAL FALLBACK: If userId missing/empty, but playerName is available
  if (!targetCdnUrl && playerName && process.env.DISCORD_BOT_TOKEN) {
    const targetGuildId = guildId || process.env.DISCORD_GUILD_ID || lastActiveGuildId;
    if (targetGuildId) {
      try {
        const searchUrl = `https://discord.com/api/v10/guilds/${targetGuildId}/members/search?query=${encodeURIComponent(playerName)}&limit=1`;
        const mRes = await fetch(searchUrl, {
          headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
        });
        if (mRes.ok) {
          const members = await mRes.json();
          if (Array.isArray(members) && members.length > 0) {
            const m = members[0];
            const u = m.user;
            const aHash = m.avatar || u?.avatar;
            if (u && aHash) {
              if (m.avatar) {
                targetCdnUrl = `https://cdn.discordapp.com/guilds/${targetGuildId}/users/${u.id}/avatars/${m.avatar}.png?size=256`;
              } else {
                targetCdnUrl = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`;
              }
            } else if (u) {
              const defaultAvatarNum = (BigInt(u.id || 0) >> 22n) % 6n;
              targetCdnUrl = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNum}.png`;
            }
          }
        }
      } catch (e) {
        console.warn('Discord Bot API member search note:', e.message);
      }
    }
  }

  // Convert target CDN image to Base64 Data URL
  if (targetCdnUrl) {
    try {
      const imgRes = await fetch(targetCdnUrl);
      if (!imgRes.ok) {
        return { ok: false, status: 404, error: 'Avatar not found' };
      }
      const contentType = imgRes.headers.get('content-type') || 'image/png';
      if (!contentType.startsWith('image/')) {
        return { ok: false, status: 400, error: 'URL did not return an image' };
      }
      const arrayBuffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(arrayBuffer).toString('base64');
      const dataUri = `data:${contentType};base64,${base64}`;
      if (cacheKey) avatarDataUriCache.set(cacheKey, dataUri);
      return { ok: true, dataUri };
    } catch (e) {
      return { ok: false, status: 500, error: e.message };
    }
  }

  return { ok: false, dataUri: null };
}

// REST endpoint for resolving avatars via Discord Bot API / CDN / Member search
app.get('/api/discord-avatar', async (req, res) => {
  try {
    const { avatarUrl, userId, avatarHash, playerName, guildId } = req.query;
    const result = await resolveAvatarDataUri({ avatarUrl, userId, avatarHash, playerName, guildId });
    if (result.ok) {
      return res.json({ ok: true, dataUri: result.dataUri });
    }
    return res.status(result.status || 200).json({ ok: false, dataUri: null, error: result.error });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Backward-compatible avatar proxy endpoint
app.get('/api/avatar-proxy', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ ok: false, error: 'Missing url parameter' });
    }
    const result = await resolveAvatarDataUri({ avatarUrl: url });
    if (result.ok && result.dataUri) {
      return res.json({ ok: true, dataUri: result.dataUri });
    }
    return res.status(result.status || 404).json({ ok: false, error: result.error || 'Avatar not found' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== DISCORD RESULT CARD & PRESENCE SHARE ENDPOINT ====================
app.post('/api/discord/share', async (req, res) => {
  try {
    const {
      webhookUrl,
      channelId,
      guildId,
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
      discordUserId,
      clientId
    } = req.body || {};

    // 1. Scoped, distinct player identification
    const cleanDiscordId = (discordUserId && typeof discordUserId === 'string' && discordUserId !== 'null' && discordUserId !== 'undefined' && !discordUserId.startsWith('guest'))
      ? discordUserId.replace(/^discord_/, '')
      : null;
    const cleanPlayerName = (playerName && typeof playerName === 'string' && playerName.trim())
      ? playerName.trim().toLowerCase().replace(/\s+/g, '_')
      : null;
    const cleanClientId = (clientId && typeof clientId === 'string' && clientId.trim())
      ? clientId.trim()
      : null;

    const playerIdentity = cleanDiscordId || cleanPlayerName || cleanClientId || req.ip;

    // ===== DAILY CHALLENGE DUPLICATE PROTECTION (Scoped Per-Player) =====
    const dedupKey = (isDaily && dayNumber && playerIdentity)
      ? `${dayNumber}_${lang || 'en'}_${playerIdentity}`
      : null;

    if (dedupKey && dailySubmissions.has(dedupKey)) {
      return res.status(409).json({
        ok: false,
        error: 'You have already submitted your Daily Challenge result for today. Each player gets only one attempt per day per language.',
        alreadySubmitted: true
      });
    }

    // 2. Fallback resolution for Webhook, Channel ID, and Guild ID
    if (webhookUrl && webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      lastActiveWebhook = webhookUrl;
    }
    if (channelId) lastActiveChannelId = channelId;
    if (guildId) lastActiveGuildId = guildId;

    const targetWebhook = (webhookUrl || process.env.DISCORD_WEBHOOK_URL || lastActiveWebhook || '').trim();
    const targetChannelId = (channelId || process.env.DISCORD_CHANNEL_ID || lastActiveChannelId || '').trim();
    const targetGuildId = (guildId || process.env.DISCORD_GUILD_ID || lastActiveGuildId || '').trim();

    const canSendViaWebhook = targetWebhook.startsWith('https://discord.com/api/webhooks/');
    const canSendViaBot = Boolean(!canSendViaWebhook && targetChannelId && process.env.DISCORD_BOT_TOKEN);

    if (!canSendViaWebhook && !canSendViaBot) {
      return res.status(400).json({
        ok: false,
        error: 'No valid Discord Webhook or Channel configured'
      });
    }

    const scoreText = solved ? `${attemptsUsed}/${maxAttempts}` : `X/${maxAttempts}`;
    const crown = solved && attemptsUsed <= 4 ? '👑 ' : '';
    const speed = solved && attemptsUsed <= 3 ? '⚡ ' : '';
    const langLabel = lang === 'ar' ? 'عربي 🇪🇬' : 'EN 🇬🇧';
    const dayLabel = dayNumber ? `WordChill No. ${dayNumber}` : 'WordChill Challenge';

    // Store in scoreboard cache (Leaderboard)
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

    const targetUrl = canSendViaWebhook
      ? targetWebhook + '?wait=true'
      : `https://discord.com/api/v10/channels/${targetChannelId}/messages`;

    const headers = canSendViaBot
      ? { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` }
      : {};

    let discordRes;
    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/png;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');
      payloadJson.attachments = [{ id: 0, filename: 'wordchill-card.png' }];

      const formData = new FormData();
      formData.append('payload_json', JSON.stringify(payloadJson));
      formData.append('files[0]', new Blob([imageBuffer], { type: 'image/png' }), 'wordchill-card.png');

      discordRes = await fetch(targetUrl, {
        method: 'POST',
        headers,
        body: formData
      });
    } else {
      discordRes = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(payloadJson)
      });
    }

    if (!discordRes.ok) {
      const errText = await discordRes.text().catch(() => '');
      return res.status(400).json({ ok: false, error: 'تعذر الإرسال إلى ديسكورد', detail: errText });
    }

    // Mark successful submission in dedup cache (ONLY on verified Discord success)
    if (dedupKey) {
      dailySubmissions.set(dedupKey, true);
    }

    res.json({ ok: true, leaderboard: list });
  } catch (err) {
    if (dedupKey) dailySubmissions.delete(dedupKey);
    res.status(500).json({ ok: false, error: err.message });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`🚀 WordChill Server (Vercel-Ready) running on http://localhost:${PORT}`);
    if (process.env.DISCORD_BOT_TOKEN) {
      registerDiscordCommands().catch(err => console.warn('Startup command registration note:', err.message));
    }
  });
}

module.exports = app;
