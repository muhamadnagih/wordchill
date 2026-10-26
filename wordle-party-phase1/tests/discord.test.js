const test = require('node:test');
const assert = require('node:assert/strict');
const app = require('../server/index');

test('GET /api/daily/info returns valid day seed and countdown', async () => {
  const req = new Request('http://localhost/api/daily/info');
  // Use http server simulation or supertest-like approach
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/daily/info`);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.dayNumber > 0);
    assert.ok(data.msUntilNext > 0);
    assert.deepEqual(data.supportedLengths, [4, 5, 6, 7]);
    assert.deepEqual(data.supportedLangs, ['en', 'ar']);
  } finally {
    server.close();
  }
});

test('POST /api/solo/start with isDaily=true initializes daily word match', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/solo/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isDaily: true, lang: 'en', wordLength: 5 })
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.session.modeType, 'DAILY');
    assert.ok(data.session.dayNumber > 0);
    assert.equal(data.session.wordLength, 5);
    assert.equal(data.session.status, 'IN_PROGRESS');
    assert.equal(data.session.secretWord, null); // never leaked!
  } finally {
    server.close();
  }
});

test('Challenge flow: /api/challenge/create -> /api/solo/start reproduces exact target word and challenger comparison', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Create challenge for word "CHILL"
    const createRes = await fetch(`http://localhost:${port}/api/challenge/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secretWord: 'CHILL',
        lang: 'en',
        wordLength: 5,
        maxAttempts: 6,
        challengerName: 'Nagih',
        challengerScore: 3,
        dayNumber: 660
      })
    });
    const createData = await createRes.json();
    assert.equal(createData.ok, true);
    assert.ok(createData.challengeToken);

    // 2. Start game with challenge token
    const startRes = await fetch(`http://localhost:${port}/api/solo/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge: createData.challengeToken })
    });
    const startData = await startRes.json();
    assert.equal(startData.ok, true);
    assert.equal(startData.session.modeType, 'CHALLENGE');
    assert.equal(startData.session.challenger.name, 'Nagih');
    assert.equal(startData.session.challenger.score, 3);
    assert.equal(startData.session.secretWord, null);

    // 3. Make winning guess "CHILL"
    const guessRes = await fetch(`http://localhost:${port}/api/solo/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: startData.session.sessionId,
        guess: 'CHILL'
      })
    });
    const guessData = await guessRes.json();
    assert.equal(guessData.ok, true);
    assert.equal(guessData.session.status, 'WON');
    assert.equal(guessData.session.secretWord, 'CHILL');
    assert.equal(guessData.session.challenger.name, 'Nagih');
  } finally {
    server.close();
  }
});

test('POST /api/discord/token handles dev mode and returns user profile', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/discord/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'sample_auth_code' })
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.access_token);
  } finally {
    server.close();
  }
});

test('GET /api/avatar-proxy enforces Discord CDN hostname checks', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // Missing url
    const res1 = await fetch(`http://localhost:${port}/api/avatar-proxy`);
    assert.equal(res1.status, 400);

    // Non-discord host
    const res2 = await fetch(`http://localhost:${port}/api/avatar-proxy?url=https://evil.com/avatar.png`);
    assert.equal(res2.status, 403);
    const data2 = await res2.json();
    assert.equal(data2.ok, false);
  } finally {
    server.close();
  }
});

test('POST /api/discord/share enforces single daily submission per user per day per language', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const payload = {
      webhookUrl: 'https://discord.com/api/webhooks/12345/mock-webhook-token',
      playerName: 'Nagih',
      isDaily: true,
      dayNumber: 9999,
      lang: 'en',
      discordUserId: 'discord_test_user_unique',
      attemptsUsed: 3,
      maxAttempts: 6,
      solved: true
    };

    // First attempt will pass dedup check (and fail or attempt webhook fetch)
    // Note: since webhook URL is fake, fetch will fail or return 400, but dailySubmissions gets recorded
    await fetch(`http://localhost:${port}/api/discord/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    // Second attempt should be rejected with 409 and alreadySubmitted: true
    const res2 = await fetch(`http://localhost:${port}/api/discord/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    assert.equal(res2.status, 409);
    const data2 = await res2.json();
    assert.equal(data2.alreadySubmitted, true);
  } finally {
    server.close();
  }
});

test('POST /api/discord/share allows distinct players to submit on the same day without blocking each other', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const playerA = {
      webhookUrl: 'https://discord.com/api/webhooks/12345/mock-webhook-token',
      playerName: 'PlayerA',
      isDaily: true,
      dayNumber: 8888,
      lang: 'en',
      clientId: 'uuid_client_aaa',
      attemptsUsed: 2,
      maxAttempts: 6,
      solved: true
    };

    const playerB = {
      webhookUrl: 'https://discord.com/api/webhooks/12345/mock-webhook-token',
      playerName: 'PlayerB',
      isDaily: true,
      dayNumber: 8888,
      lang: 'en',
      clientId: 'uuid_client_bbb',
      attemptsUsed: 4,
      maxAttempts: 6,
      solved: true
    };

    // Player A submits
    const resA1 = await fetch(`http://localhost:${port}/api/discord/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerA)
    });
    // Not 409
    assert.notEqual(resA1.status, 409);

    // Player B submits on SAME day and lang -> must NOT be blocked (not 409)
    const resB1 = await fetch(`http://localhost:${port}/api/discord/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerB)
    });
    assert.notEqual(resB1.status, 409);

    // Player A submits AGAIN -> rejected with 409
    const resA2 = await fetch(`http://localhost:${port}/api/discord/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(playerA)
    });
    assert.equal(resA2.status, 409);
    const dataA2 = await resA2.json();
    assert.equal(dataA2.alreadySubmitted, true);
  } finally {
    server.close();
  }
});

test('GET /api/discord-avatar returns base64 dataUri for valid avatar inputs', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Data URI returns directly
    const mockDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const res1 = await fetch(`http://localhost:${port}/api/discord-avatar?avatarUrl=${encodeURIComponent(mockDataUri)}`);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.ok, true);
    assert.equal(data1.dataUri, mockDataUri);

    // 2. Unsupported domain returns 403
    const res2 = await fetch(`http://localhost:${port}/api/discord-avatar?avatarUrl=https://unauthorized-domain.com/pic.png`);
    assert.equal(res2.status, 403);
  } finally {
    server.close();
  }
});

test('POST /api/token exchanges code successfully (matching /api/discord/token)', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://localhost:${port}/api/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'valid_test_code' })
    });
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.ok(data.access_token);
  } finally {
    server.close();
  }
});

test('POST /api/interactions handles PING (Type 1) and /wordchill (Type 2)', async () => {
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. PING handshake
    const pingRes = await fetch(`http://localhost:${port}/api/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 1 })
    });
    const pingData = await pingRes.json();
    assert.equal(pingData.type, 1);

    // 2. /wordchill command invocation
    const cmdRes = await fetch(`http://localhost:${port}/api/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 2,
        data: { name: 'wordchill' }
      })
    });
    const cmdData = await cmdRes.json();
    assert.equal(cmdData.type, 4); // CHANNEL_MESSAGE_WITH_SOURCE
    assert.ok(cmdData.data.content.includes('WordChill'));
    assert.ok(cmdData.data.components[0].components.some(btn => btn.url.includes('activities')));
  } finally {
    server.close();
  }
});



