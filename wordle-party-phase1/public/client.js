(() => {
  
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
      const res = await fetch(`/api/mp/state?code=${encodeURIComponent(activeCode)}&playerId=${encodeURIComponent(playerId)}`);
      const data = await res.json();
      if (data.ok && data.room) {
        roomStateListener(data.room);
      }
    } catch (e) {}
  }, 1300);


  let playerId = localStorage.getItem('lexirush_player_id');
  if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('lexirush_player_id', playerId);
  }

  const nameInput = document.getElementById('globalPlayerName');
  nameInput.value = localStorage.getItem('lexirush_player_name') || `Player_${playerId.slice(2, 6).toUpperCase()}`;
  nameInput.addEventListener('change', () => {
    localStorage.setItem('lexirush_player_name', nameInput.value.trim() || 'Player');
    if (typeof updateDailyButtonState === 'function') {
      updateDailyButtonState();
    }
  });
  nameInput.addEventListener('input', () => {
    localStorage.setItem('lexirush_player_name', nameInput.value.trim() || 'Player');
    if (typeof updateDailyButtonState === 'function') {
      updateDailyButtonState();
    }
  });

  function updateAvatarDisplay(url) {
    const avatarImg = document.getElementById('globalPlayerAvatar');
    const emojiSpan = document.getElementById('globalAvatarEmoji');
    if (avatarImg && url) {
      avatarImg.src = url;
      avatarImg.classList.remove('hidden');
      if (emojiSpan) emojiSpan.classList.add('hidden');
    } else if (emojiSpan) {
      emojiSpan.classList.remove('hidden');
      if (avatarImg) avatarImg.classList.add('hidden');
    }
  }

  const FLIP_STEP_MS = 180;
  const FLIP_DURATION_MS = 520;

  const state = {
    mode: null,
    soloLang: 'en',
    dailyLang: 'en',
    createLang: 'en',
    lang: 'en',
    soloWordLength: 5,
    createWordLength: 5,
    wordLength: 5,
    maxAttempts: 6,
    currentGuess: '',
    isSubmitting: false,
    animatingRowIndex: -1,
    bounceRowIndex: -1,
    knownGuessCount: 0,
    soloSession: null,
    room: null,
    lastCardDataUrl: null,
    lastChallengeToken: null,
    cachedAvatarDataUri: null  // Cached base64 avatar from proxy
  };

  // ==================== DAILY CHALLENGE PERSISTENCE ====================
  function getClientId() {
    let cid = localStorage.getItem('wordchill_client_id');
    if (!cid) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        cid = crypto.randomUUID();
      } else {
        cid = 'client_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
      }
      localStorage.setItem('wordchill_client_id', cid);
    }
    return cid;
  }

  function getEffectiveUserId() {
    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    if (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest')) {
      return `discord_${rawDiscordId}`;
    }
    return getClientId();
  }

  function getEffectivePlayerIdentifier() {
    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    if (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest')) {
      return rawDiscordId;
    }
    const pName = (document.getElementById('globalPlayerName')?.value || localStorage.getItem('lexirush_player_name') || '').trim();
    if (pName && pName.toLowerCase() !== 'player') {
      return pName.toLowerCase().replace(/\s+/g, '_');
    }
    return getClientId();
  }

  function getDailyStateKey(dayNumber, lang) {
    const playerKey = getEffectivePlayerIdentifier();
    return `wordchill_daily_${dayNumber}_${lang}_${playerKey}`;
  }

  function saveDailyProgress(dayNumber, lang, sessionData) {
    if (!dayNumber) return;
    const key = getDailyStateKey(dayNumber, lang);
    const saved = {
      sessionId: sessionData.sessionId,
      guesses: sessionData.guesses,
      status: sessionData.status,
      lang: sessionData.lang,
      wordLength: sessionData.wordLength,
      maxAttempts: sessionData.maxAttempts,
      dayNumber: sessionData.dayNumber,
      modeType: sessionData.modeType,
      challenger: sessionData.challenger,
      secretWord: sessionData.secretWord || null,
      completed: sessionData.status === 'WON' || sessionData.status === 'LOST'
    };
    localStorage.setItem(key, JSON.stringify(saved));
  }

  function loadDailyProgress(dayNumber, lang) {
    if (!dayNumber) return null;
    const key = getDailyStateKey(dayNumber, lang);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function isDailyCompleted(dayNumber, lang) {
    const saved = loadDailyProgress(dayNumber, lang);
    return saved?.completed === true;
  }

  function markDailyCompleted(dayNumber, lang) {
    const saved = loadDailyProgress(dayNumber, lang);
    if (saved) {
      saved.completed = true;
      const key = getDailyStateKey(dayNumber, lang);
      localStorage.setItem(key, JSON.stringify(saved));
    }
  }

  function updateDailyButtonState() {
    const btn = document.getElementById('playDailyBtn');
    if (!btn || !dailyInfo) return;
    const dayNum = dailyInfo.dayNumber;
    const lang = state.dailyLang;
    const completed = isDailyCompleted(dayNum, lang);

    if (completed) {
      btn.innerHTML = '<span>✅ Completed - View Result</span>';
      btn.classList.add('daily-completed');
      btn.dataset.completed = 'true';
    } else {
      btn.innerHTML = '<span>📅 PLAY TODAY\'S WORD</span>';
      btn.classList.remove('daily-completed');
      btn.dataset.completed = 'false';
    }
  }

  function normalizeInputChar(rawKey, lang) {
    if (lang === 'ar') {
      const cleaned = rawKey.replace(/[\u064B-\u065F\u0670\u0640]/g, '').replace(/[أإآٱ]/g, 'ا');
      return /^[\u0621-\u064A]$/.test(cleaned) ? cleaned : null;
    }
    const upper = rawKey.toUpperCase();
    return /^[A-Z]$/.test(upper) ? upper : null;
  }

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
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 1900);
  }

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.getElementById('themeToggleBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // Solo Language & Length Selectors
  document.querySelectorAll('#soloLangGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#soloLangGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.soloLang = btn.dataset.lang;
    });
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
    const langLabel = state.createLang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 EN';
    document.getElementById('configPreviewText').textContent =
      `${langLabel} • ${state.createWordLength} Letters • Max ${maxP} Players • ${maxA} Tries`;
  }

  document.querySelectorAll('#createLangGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#createLangGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.createLang = btn.dataset.lang;
      updateCreatePreview();
    });
  });

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

  function triggerRowFlipAnimation(rowIndex, isWinningRow, onComplete) {
    state.animatingRowIndex = rowIndex;
    state.isSubmitting = true;
    renderActiveGame();

    const totalFlipTime = ((state.wordLength - 1) * FLIP_STEP_MS) + FLIP_DURATION_MS;

    setTimeout(() => {
      state.animatingRowIndex = -1;
      if (isWinningRow) {
        state.bounceRowIndex = rowIndex;
        renderActiveGame();
        setTimeout(() => {
          state.bounceRowIndex = -1;
          state.isSubmitting = false;
          renderActiveGame();
          onComplete?.();
        }, 650);
      } else {
        state.isSubmitting = false;
        renderActiveGame();
        onComplete?.();
      }
    }, totalFlipTime);
  }

  async function startSoloGame({ isDaily = false, challenge = null, lang = null, wordLength = null } = {}) {
    try {
      const targetLang = lang || (isDaily ? state.dailyLang : state.soloLang);
      const targetLen = wordLength || (isDaily ? 5 : state.soloWordLength);

      // ===== DAILY CHALLENGE: CHECK COMPLETION / RESUME =====
      if (isDaily && dailyInfo) {
        const dayNum = dailyInfo.dayNumber;
        const savedProgress = loadDailyProgress(dayNum, targetLang);

        if (savedProgress?.completed) {
          // Already completed: show result modal instead of starting game
          showDailyResultModal(savedProgress);
          return;
        }

        if (savedProgress && !savedProgress.completed && savedProgress.sessionId) {
          // Mid-game resume: restore board state
          state.mode = 'SOLO';
          state.soloSession = savedProgress;
          state.lang = savedProgress.lang || 'en';
          state.wordLength = savedProgress.wordLength;
          state.maxAttempts = savedProgress.maxAttempts;
          state.currentGuess = '';
          state.animatingRowIndex = -1;
          state.bounceRowIndex = -1;
          state.knownGuessCount = savedProgress.guesses?.length || 0;
          state.isSubmitting = false;
          state.lastCardDataUrl = null;
          state.lastChallengeToken = null;

          document.querySelector('.game-layout').classList.add('solo-only');
          document.getElementById('mpLiveSidebar').classList.add('hidden');
          document.getElementById('soloEndBanner').classList.add('hidden');

          const isAr = state.lang === 'ar';
          const activeBar = document.getElementById('activeChallengeBanner');
          const activeText = document.getElementById('activeChallengeText');
          activeBar?.classList.remove('hidden');
          if (activeText) {
            activeText.textContent = isAr
              ? `📅 اللغز اليومي رقم #${dayNum} — نفس الكلمة لكل اللاعبين اليوم!`
              : `📅 WordChill Daily No. ${dayNum} — The exact same secret word for all players today!`;
          }
          document.getElementById('gameModeBadge').textContent = `📅 DAILY #${dayNum}`;

          renderActiveGame();
          showScreen('game');
          showToast(isAr ? 'تم استعادة تقدمك!' : 'Resumed your progress!');
          return;
        }
      }

      const res = await fetch('/api/solo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordLength: targetLen,
          maxAttempts: 6,
          lang: targetLang,
          isDaily: Boolean(isDaily),
          challenge: challenge || null
        })
      });
      const data = await res.json();
      if (!data.ok) return showToast(data.error || 'Could not start game.');

      state.mode = 'SOLO';
      state.soloSession = data.session;
      state.lang = data.session.lang || 'en';
      state.wordLength = data.session.wordLength;
      state.maxAttempts = data.session.maxAttempts;
      state.currentGuess = '';
      state.animatingRowIndex = -1;
      state.bounceRowIndex = -1;
      state.knownGuessCount = 0;
      state.isSubmitting = false;
      state.lastCardDataUrl = null;
      state.lastChallengeToken = challenge || null;

      // Save initial daily progress for mid-game resume
      if (isDaily && data.session.dayNumber) {
        saveDailyProgress(data.session.dayNumber, data.session.lang, data.session);
      }

      document.querySelector('.game-layout').classList.add('solo-only');
      document.getElementById('mpLiveSidebar').classList.add('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');

      const isAr = state.lang === 'ar';
      const activeBar = document.getElementById('activeChallengeBanner');
      const activeText = document.getElementById('activeChallengeText');

      if (challenge && data.session.challenger) {
        activeBar?.classList.remove('hidden');
        if (activeText) {
          activeText.textContent = isAr
            ? `⚔️ تحدي من @${data.session.challenger.name} — الهدف: حل الكلمة في أقل من ${data.session.challenger.score} محاولات!`
            : `⚔️ Challenge from @${data.session.challenger.name} — Target: Beat ${data.session.challenger.score}/${data.session.challenger.attempts}!`;
        }
        document.getElementById('gameModeBadge').textContent = isAr ? '⚔️ وضع التحدي' : '⚔️ CHALLENGE';
      } else if (isDaily || data.session.dayNumber) {
        activeBar?.classList.remove('hidden');
        const dayNum = data.session.dayNumber || (dailyInfo ? dailyInfo.dayNumber : '');
        if (activeText) {
          activeText.textContent = isAr
            ? `📅 اللغز اليومي رقم #${dayNum} — نفس الكلمة لكل اللاعبين اليوم!`
            : `📅 WordChill Daily No. ${dayNum} — The exact same secret word for all players today!`;
        }
        document.getElementById('gameModeBadge').textContent = `📅 DAILY #${dayNum}`;
      } else {
        activeBar?.classList.add('hidden');
        document.getElementById('gameModeBadge').textContent =
          isAr ? '🇪🇬 فردي (عربي)' : '🇬🇧 SOLO MODE';
      }

      renderActiveGame();
      showScreen('game');
    } catch (err) {
      showToast('Network error starting game.');
    }
  }

  function showDailyResultModal(savedProgress) {
    // Show the result as a read-only view (no re-play)
    state.mode = 'SOLO';
    state.soloSession = savedProgress;
    state.lang = savedProgress.lang || 'en';
    state.wordLength = savedProgress.wordLength;
    state.maxAttempts = savedProgress.maxAttempts;
    state.currentGuess = '';
    state.animatingRowIndex = -1;
    state.bounceRowIndex = -1;
    state.knownGuessCount = savedProgress.guesses?.length || 0;
    state.isSubmitting = false;

    document.querySelector('.game-layout').classList.add('solo-only');
    document.getElementById('mpLiveSidebar').classList.add('hidden');

    const isAr = state.lang === 'ar';
    const dayNum = savedProgress.dayNumber;
    const activeBar = document.getElementById('activeChallengeBanner');
    const activeText = document.getElementById('activeChallengeText');
    activeBar?.classList.remove('hidden');
    if (activeText) {
      activeText.textContent = isAr
        ? `📅 اللغز اليومي رقم #${dayNum} — لقد لعبت اليوم بالفعل!`
        : `📅 WordChill Daily No. ${dayNum} — You already played today!`;
    }
    document.getElementById('gameModeBadge').textContent = `📅 DAILY #${dayNum}`;

    renderActiveGame();
    showScreen('game');
    showToast(isAr ? 'لقد لعبت اليوم بالفعل! هذه نتيجتك.' : 'You already played today! Viewing your result.');
  }

  document.getElementById('playSoloBtn').addEventListener('click', () => startSoloGame());
  document.getElementById('soloPlayAgainBtn').addEventListener('click', () => {
    if (state.lastChallengeToken) {
      startSoloGame({ challenge: state.lastChallengeToken });
    } else if (state.soloSession?.isDaily || state.soloSession?.dayNumber) {
      startSoloGame({ isDaily: true, lang: state.lang });
    } else {
      startSoloGame();
    }
  });
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
      lang: state.createLang,
      wordLength: state.createWordLength,
      maxPlayers: Number(document.getElementById('maxPlayersSelect').value),
      maxAttempts: Number(document.getElementById('maxAttemptsSelect').value),
      isPublic: document.getElementById('roomPublicCheckbox').checked
    };

    socket.emit('room:create', payload, (res) => {
      if (res?.error) return showToast(res.error);
      state.mode = 'MP';
      state.room = res.room;
      state.lang = res.room.lang || 'en';
      state.knownGuessCount = 0;
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
      state.lang = res.room.lang || 'en';
      const me = res.room.players.find(p => p.id === playerId);
      state.knownGuessCount = me ? me.guesses.length : 0;
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
    showToast(`Copied room code: ${state.room.code}`);
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
    state.lang = roomState.lang || 'en';

    if (
      (previousStatus !== 'IN_PROGRESS' && roomState.status === 'IN_PROGRESS') ||
      previousRound !== roomState.roundNumber
    ) {
      state.currentGuess = '';
      state.knownGuessCount = 0;
      state.animatingRowIndex = -1;
      state.bounceRowIndex = -1;
      state.isSubmitting = false;
    }

    const me = roomState.players.find(p => p.id === playerId);
    const myGuessesLen = me ? me.guesses.length : 0;

    if (myGuessesLen > state.knownGuessCount) {
      const newRowIdx = myGuessesLen - 1;
      state.knownGuessCount = myGuessesLen;
      const isSolved = me.status === 'SOLVED';

      document.querySelector('.game-layout').classList.remove('solo-only');
      document.getElementById('mpLiveSidebar').classList.remove('hidden');
      showScreen('game');
      renderLiveOpponents(roomState);

      triggerRowFlipAnimation(newRowIdx, isSolved, () => {
        if (state.room?.status === 'FINISHED') {
          renderResultsScreen(state.room);
          showScreen('results');
        }
      });
      return;
    }

    if (roomState.status === 'FINISHED' && state.animatingRowIndex === -1 && state.bounceRowIndex === -1) {
      renderResultsScreen(roomState);
      showScreen('results');
      return;
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
    state.lang = room.lang || 'en';
    const langFlag = state.lang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 English';

    if (room.status === 'WAITING') {
      document.getElementById('lobbyRoomName').textContent = room.name;
      document.getElementById('lobbyRoomCode').textContent = room.code;
      document.getElementById('lobbyWordLenBadge').textContent = `${langFlag} • ${room.wordLength} Letters`;
      document.getElementById('lobbyAttemptsBadge').textContent = `🎯 ${room.maxAttempts} Attempts`;
      document.getElementById('lobbyCapacityBadge').textContent = `👥 ${room.players.length} / ${room.maxPlayers} Players`;

      const grid = document.getElementById('lobbyPlayersGrid');
      grid.innerHTML = '';
      room.players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'lobby-player-card';
        const initials = p.name.slice(0, 2).toUpperCase();
        card.innerHTML = `
          <div class="avatar-circle">${initials}</div>
          <div>
            <strong>${p.name} ${p.id === playerId ? '(You)' : ''}</strong>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              ${p.isHost ? '👑 Host' : 'Ready'} ${!p.connected ? '• Offline' : ''}
            </div>
          </div>
        `;
        grid.appendChild(card);
      });

      const isHost = room.hostId === playerId;
      const canStart = isHost && room.players.length >= 2;
      const startBtn = document.getElementById('startMultiplayerBtn');
      startBtn.style.display = isHost ? 'inline-block' : 'none';
      startBtn.disabled = !canStart;
      document.getElementById('lobbyWaitHint').textContent =
        room.players.length < 2
          ? 'Need at least 2 players to start...'
          : isHost
          ? 'Ready to launch!'
          : 'Waiting for host to start...';

      showScreen('lobby');
    } else if (room.status === 'IN_PROGRESS') {
      document.querySelector('.game-layout').classList.remove('solo-only');
      document.getElementById('mpLiveSidebar').classList.remove('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');
      document.getElementById('gameModeBadge').textContent = `${langFlag} • ROOM #${room.code} • R${room.roundNumber}`;
      document.getElementById('sidebarRoomCode').textContent = `#${room.code}`;

      if (state.animatingRowIndex === -1 && state.bounceRowIndex === -1) {
        renderActiveGame();
      }
      renderLiveOpponents(room);
      showScreen('game');
    } else if (room.status === 'FINISHED') {
      renderResultsScreen(room);
      showScreen('results');
    }
  }

  function renderActiveGame() {
    const isAr = state.lang === 'ar';
    const guesses = state.mode === 'SOLO'
      ? state.soloSession.guesses
      : (state.room.players.find(p => p.id === playerId)?.guesses || []);

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession.status
      : (state.room.players.find(p => p.id === playerId)?.status || 'PLAYING');

    const isStillPlaying = myStatus === 'IN_PROGRESS' || myStatus === 'PLAYING';
    const isAnimating = state.animatingRowIndex !== -1 || state.bounceRowIndex !== -1;
    const remaining = Math.max(0, state.maxAttempts - guesses.length);

    document.getElementById('gameRuleInfo').textContent = isAr
      ? `${state.wordLength} حروف • ${state.maxAttempts} محاولات`
      : `${state.wordLength} Letters • ${state.maxAttempts} Tries`;

    document.getElementById('remainingTriesText').textContent =
      isStillPlaying || isAnimating
        ? (isAr ? `متبقي ${remaining} محاولات` : `${remaining} tries left`)
        : `Status: ${myStatus}`;

    const gridEl = document.getElementById('wordGrid');
    gridEl.style.setProperty('--word-length', state.wordLength);
    gridEl.classList.toggle('rtl-grid', isAr);
    gridEl.innerHTML = '';

    for (let r = 0; r < state.maxAttempts; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      if (r === guesses.length && isStillPlaying && !isAnimating) {
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

          if (r === state.animatingRowIndex) {
            tile.classList.add('revealing');
            tile.style.setProperty('--flip-delay', `${c * FLIP_STEP_MS}ms`);
          } else if (r === state.bounceRowIndex) {
            tile.classList.add('win-bounce');
            tile.style.setProperty('--bounce-delay', `${c * 75}ms`);
          }
        } else if (r === guesses.length && isStillPlaying && !isAnimating) {
          const char = state.currentGuess[c] || '';
          tile.textContent = char;
          if (char) tile.classList.add('filled');
        }

        rowEl.appendChild(tile);
      }

      gridEl.appendChild(rowEl);
    }

    if (state.mode === 'SOLO' && !isStillPlaying && !isAnimating) {
      const banner = document.getElementById('soloEndBanner');
      banner.classList.remove('hidden');
      const iconEl = document.getElementById('soloEndIcon');
      if (iconEl) iconEl.textContent = myStatus === 'WON' ? '🏆' : '🧊';
      document.getElementById('soloEndTitle').textContent =
        myStatus === 'WON'
          ? (isAr ? '🎉 عبقري! حليت الكلمة!' : '🎉 Brilliant! You Solved It!')
          : (isAr ? 'انتهت المحاولات!' : 'Out of Attempts!');
      document.getElementById('soloEndSecret').innerHTML = isAr
        ? `الكلمة السرية كانت <strong>${state.soloSession.secretWord}</strong>`
        : `The secret word was <strong>${state.soloSession.secretWord}</strong>`;

      const compEl = document.getElementById('soloChallengeComparison');
      if (compEl && state.soloSession?.challenger) {
        compEl.classList.remove('hidden');
        const ch = state.soloSession.challenger;
        const myScore = state.soloSession.guesses.length;
        if (myStatus === 'WON' && myScore < ch.score) {
          compEl.textContent = isAr
            ? `🔥 كسبت التحدي! (${myScore}/${state.maxAttempts} ضد ${ch.score}/${ch.attempts})`
            : `🔥 You beat @${ch.name}! (${myScore}/${state.maxAttempts} vs ${ch.score}/${ch.attempts})`;
          compEl.style.color = '#10B981';
        } else if (myStatus === 'WON' && myScore === ch.score) {
          compEl.textContent = isAr
            ? `🤝 تعادل مع @${ch.name}! (${myScore}/${state.maxAttempts})`
            : `🤝 Tied with @${ch.name}! (${myScore}/${state.maxAttempts})`;
          compEl.style.color = '#38BDF8';
        } else {
          compEl.textContent = isAr
            ? `💀 فاز @${ch.name} في التحدي (${ch.score}/${ch.attempts})`
            : `💀 @${ch.name} won this challenge (${ch.score}/${ch.attempts})`;
          compEl.style.color = '#F46036';
        }
      } else if (compEl) {
        compEl.classList.add('hidden');
      }

      displayDiscordCardPreview();
    }

    const keyboardGuesses = state.animatingRowIndex !== -1
      ? guesses.slice(0, state.animatingRowIndex)
      : guesses;
    renderKeyboard(keyboardGuesses);
  }

  function renderKeyboard(guesses) {
    const isAr = state.lang === 'ar';
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

    const rows = isAr
      ? [
          ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
          ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط', 'ذ'],
          ['ENTER', 'ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', '⌫']
        ]
      : [
          ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
          ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
          ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
        ];

    const kbEl = document.getElementById('keyboard');
    kbEl.classList.toggle('ar-keyboard', isAr);
    kbEl.innerHTML = '';

    rows.forEach(rowKeys => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';

      rowKeys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'kb-key';
        if (k === 'ENTER' || k === '⌫') btn.classList.add('wide');
        if (keyStates[k]) btn.classList.add(keyStates[k]);
        btn.textContent = k === 'ENTER' && isAr ? 'إدخال' : k;
        btn.addEventListener('click', () => handleKeyInput(k));
        rowEl.appendChild(btn);
      });

      kbEl.appendChild(rowEl);
    });
  }

  function renderLiveOpponents(room) {
    const isAr = room.lang === 'ar';
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
          : `⏳ ${p.attemptsUsed}/${room.maxAttempts}`;

      const miniRowsHtml = p.guesses
        .map(g => {
          const cells = g.evaluations
            .map(c => `<span class="mini-cell ${c.state}"></span>`)
            .join('');
          return `<div class="mini-row">${cells}</div>`;
        })
        .join('');

      card.innerHTML = `
        <div class="opponent-top">
          <span>${p.name} ${p.id === playerId ? '(You)' : ''}</span>
          <span>${statusBadge}</span>
        </div>
        <div class="mini-grid ${isAr ? 'rtl-grid' : ''}">${miniRowsHtml || '<small style="color:var(--text-muted)">No guesses yet</small>'}</div>
      `;
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

      const medal = idx === 0 && p.status === 'SOLVED' ? '🏆' : `#${idx + 1}`;
      const outcome =
        p.status === 'SOLVED'
          ? `Solved in ${p.attemptsUsed}/${room.maxAttempts} (${((p.durationMs || 0) / 1000).toFixed(1)}s)`
          : `Failed (${p.attemptsUsed}/${room.maxAttempts})`;

      row.innerHTML = `
        <div>
          <strong>${medal} ${p.name} ${p.id === playerId ? '(You)' : ''}</strong>
        </div>
        <div>${outcome}</div>
      `;
      listEl.appendChild(row);
    });

    const newRoundBtn = document.getElementById('resultsNewRoundBtn');
    if (room.hostId === playerId) {
      newRoundBtn.classList.remove('hidden');
    } else {
      newRoundBtn.classList.add('hidden');
    }

    displayMpDiscordCardPreview(room);
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
        return showToast(
          state.lang === 'ar'
            ? `الكلمة يجب أن تكون ${state.wordLength} حروف!`
            : `Word must be ${state.wordLength} letters!`
        );
      }
      await submitCurrentGuess();
      return;
    }

    const validChar = normalizeInputChar(key, state.lang);
    if (validChar && state.currentGuess.length < state.wordLength) {
      state.currentGuess += validChar;
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
          state.isSubmitting = false;
          shakeActiveRow();
          showToast(data.error);
        } else {
          state.soloSession = data.session;
          state.currentGuess = '';
          const newRowIdx = state.soloSession.guesses.length - 1;
          const isWon = state.soloSession.status === 'WON';
          const isLost = state.soloSession.status === 'LOST';

          // ===== DAILY PROGRESS: save on every guess =====
          if (state.soloSession.dayNumber || state.soloSession.modeType === 'DAILY') {
            saveDailyProgress(state.soloSession.dayNumber, state.soloSession.lang, state.soloSession);
            if (isWon || isLost) {
              markDailyCompleted(state.soloSession.dayNumber, state.soloSession.lang);
              updateDailyButtonState();
            }
          }

          triggerRowFlipAnimation(newRowIdx, isWon);
        }
      } else if (state.mode === 'MP' && state.room) {
        socket.emit('room:guess', {
          code: state.room.code,
          playerId,
          guess: guessToSubmit
        }, (res) => {
          if (res?.error) {
            state.isSubmitting = false;
            shakeActiveRow();
            showToast(res.error);
          } else {
            state.currentGuess = '';
          }
        });
      }
    } catch (err) {
      state.isSubmitting = false;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleKeyInput('ENTER');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleKeyInput('BACKSPACE');
    } else if (e.key.length === 1) {
      const validChar = normalizeInputChar(e.key, state.lang);
      if (validChar) {
        e.preventDefault();
        handleKeyInput(validChar);
      }
    }
  });

  async function fetchPublicRooms() {
    try {
      const res = await fetch('/api/rooms/public');
      const data = await res.json();
      const container = document.getElementById('publicRoomsList');
      if (!data.rooms || data.rooms.length === 0) {
        container.innerHTML = '<p class="muted-text">No public rooms waiting right now. Host one above!</p>';
        return;
      }
      container.innerHTML = '';
      data.rooms.forEach(r => {
        const langBadge = r.lang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 EN';
        const item = document.createElement('div');
        item.className = 'public-room-item';
        item.innerHTML = `
          <div>
            <strong>${r.name}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">
              ${langBadge} • ${r.wordLength} Letters • ${r.playerCount}/${r.maxPlayers} Players
            </span>
          </div>
          <button class="btn-chip" data-code="${r.code}">Join #${r.code}</button>
        `;
        item.querySelector('button').addEventListener('click', () => joinRoomByCode(r.code));
        container.appendChild(item);
      });
    } catch (e) {}
  }

  document.getElementById('refreshPublicRoomsBtn').addEventListener('click', fetchPublicRooms);

  const howToModal = document.getElementById('howToModal');
  document.getElementById('howToPlayModalBtn')?.addEventListener('click', () => {
    howToModal?.classList.remove('hidden');
  });
  document.getElementById('closeHowToBtn')?.addEventListener('click', () => {
    howToModal?.classList.add('hidden');
  });
  howToModal?.addEventListener('click', (e) => {
    if (e.target === howToModal) howToModal.classList.add('hidden');
  });
  document.getElementById('navHomeBtn')?.addEventListener('click', () => {
    if (state.mode === 'MP' && state.room) {
      leaveCurrentRoom();
    } else {
      showScreen('menu');
    }
  });

  // ==================== DISCORD EMBEDDED SDK & SOCIAL SYSTEM ====================
  let discordSdk = null;
  let discordAuth = null;
  let dailyInfo = null;

  async function initDiscordSdk() {
    const urlParams = new URLSearchParams(window.location.search);
    const isDiscordActivity = urlParams.has('frame_id');

    const dotEl = document.getElementById('discordStatusDot');
    const titleEl = document.getElementById('discordStatusTitle');
    const descEl = document.getElementById('discordStatusDesc');

    const savedAvatar = localStorage.getItem('wordchill_discord_avatar');
    if (savedAvatar) updateAvatarDisplay(savedAvatar);

    if (!isDiscordActivity) {
      if (dotEl) dotEl.style.background = '#38BDF8';
      if (titleEl) titleEl.textContent = 'Standalone Web Mode (Webhooks Ready)';
      if (descEl) descEl.textContent = 'Running in browser. You can link your Discord server channel via Webhook.';
      return;
    }

    try {
      if (dotEl) dotEl.style.background = '#F59E0B';
      if (titleEl) titleEl.textContent = 'Connecting to Discord Activity... ⏳';

      const sdkModule = await import('https://cdn.jsdelivr.net/npm/@discord/embedded-app-sdk@2.5.0/output/index.mjs')
        .catch(() => null);

      if (sdkModule) {
        const clientId = '1562771601764651109';
        discordSdk = new sdkModule.DiscordSDK(clientId);

        // 1. PROMPTLY signal ready() to prevent App Launcher hanging
        await discordSdk.ready();

        // 2. Persist active channel & guild IDs immediately from SDK
        if (discordSdk.channelId) {
          localStorage.setItem('wordchill_discord_channel_id', discordSdk.channelId);
        }
        if (discordSdk.guildId) {
          localStorage.setItem('wordchill_discord_guild_id', discordSdk.guildId);
        }

        // 3. OAuth2 Authorize & Authenticate flow
        const { code } = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'guilds', 'guilds.members.read']
        }).catch((err) => {
          console.warn('Discord authorize note:', err);
          return { code: null };
        });

        if (code) {
          // Supports both /api/token and /api/discord/token routes
          let tokenRes = await fetch('/api/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
          }).catch(() => null);

          if (!tokenRes || !tokenRes.ok) {
            tokenRes = await fetch('/api/discord/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ code })
            }).catch(() => null);
          }

          if (tokenRes && tokenRes.ok) {
            const tokenData = await tokenRes.json();
            if (tokenData.ok && tokenData.access_token) {
              discordAuth = await discordSdk.commands.authenticate({
                access_token: tokenData.access_token
              }).catch((err) => {
                console.warn('Discord authenticate note:', err);
                return null;
              });
            }
          }
        }

        // 4. Update player profile from authenticated user
        if (discordAuth?.user) {
          const u = discordAuth.user;
          const dName = u.global_name || u.username;
          playerId = 'discord_' + u.id;
          localStorage.setItem('lexirush_player_id', playerId);
          nameInput.value = dName;
          localStorage.setItem('lexirush_player_name', dName);

          const avatarUrl = u.avatar
            ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(u.id || 0) >> 22n) % 6n}.png`;
          localStorage.setItem('wordchill_discord_avatar', avatarUrl);
          updateAvatarDisplay(avatarUrl);
        }

        if (dotEl) dotEl.style.background = '#10B981';
        if (titleEl) titleEl.textContent = 'Discord Activity Connected! 🎮';
        if (descEl) descEl.textContent = `Player: ${nameInput.value} | Channel: ${discordSdk.channelId || 'Active'}`;
        return;
      }
    } catch (err) {
      console.warn('Discord SDK init note:', err);
      if (dotEl) dotEl.style.background = '#EF4444';
      if (titleEl) titleEl.textContent = 'Discord SDK Note';
      if (descEl) descEl.textContent = err.message || 'Standalone fallback active';
    }
  }

  // ==================== DAILY SEED & COUNTDOWN ====================
  async function fetchDailyInfo() {
    try {
      const res = await fetch('/api/daily/info');
      const data = await res.json();
      if (data.ok) {
        dailyInfo = data;
        const numEl = document.getElementById('dailyHeaderNum');
        if (numEl) numEl.textContent = data.dayNumber;
        const datePill = document.getElementById('dailyDatePill');
        if (datePill) datePill.textContent = `UTC ${data.dateStr}`;

        startDailyCountdown(data.msUntilNext);
      }
    } catch (e) {}
  }

  function startDailyCountdown(initialMs) {
    let remaining = initialMs;
    function update() {
      remaining = Math.max(0, remaining - 1000);
      const hrs = Math.floor(remaining / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((remaining % 3600000) / 60000).toString().padStart(2, '0');
      const secs = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
      const el = document.getElementById('dailyCountdownText');
      if (el) el.textContent = `${hrs}:${mins}:${secs}`;
    }
    update();
    setInterval(update, 1000);
  }

  document.querySelectorAll('#dailyLangGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#dailyLangGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.dailyLang = btn.dataset.lang;
      updateDailyButtonState();
    });
  });

  document.getElementById('playDailyBtn')?.addEventListener('click', () => {
    startSoloGame({ isDaily: true, lang: state.dailyLang });
  });

  // ==================== CANVAS RESULT CARD GENERATOR ====================
  // Resolve avatar via backend endpoint (/api/discord-avatar) supporting Bot API & CDN
  async function resolveDiscordAvatar({ avatarUrl, userId, playerName, guildId } = {}) {
    if (avatarUrl && avatarUrl.startsWith('data:')) return avatarUrl;

    const cacheKey = avatarUrl || userId || playerName;
    if (cacheKey && state.cachedAvatarDataUri) return state.cachedAvatarDataUri;

    try {
      const q = new URLSearchParams();
      if (avatarUrl) q.set('avatarUrl', avatarUrl);
      if (userId && !userId.startsWith('guest')) q.set('userId', userId);
      if (playerName) q.set('playerName', playerName);
      if (guildId) q.set('guildId', guildId);

      const res = await fetch(`/api/discord-avatar?${q.toString()}`);
      const data = await res.json();
      if (data.ok && data.dataUri) {
        state.cachedAvatarDataUri = data.dataUri;
        return data.dataUri;
      }
    } catch (e) {
      console.warn('Avatar resolution note:', e);
    }
    return state.cachedAvatarDataUri || null;
  }

  // Backward-compatible avatar proxy helper
  async function fetchAvatarViaProxy(url) {
    return resolveDiscordAvatar({ avatarUrl: url });
  }

  function loadAvatarImg(url) {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      const img = new Image();
      // No crossOrigin needed when using data URIs from our proxy
      if (!url.startsWith('data:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  async function generateDiscordResultCard({ guesses, wordLength, maxAttempts, lang, playerName, dayNumber, isDaily, solved, avatarUrl }) {
    const canvas = document.createElement('canvas');
    canvas.width = 680;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');

    roundRect(ctx, 0, 0, canvas.width, canvas.height, 24);
    ctx.fillStyle = '#141518';
    ctx.fill();

    const titleText = dayNumber
      ? `WordChill No. ${dayNumber}`
      : 'WordChill Challenge';
    ctx.fillStyle = '#E3E5E8';
    ctx.font = 'bold 22px "Plus Jakarta Sans", Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleText, canvas.width / 2, 48);

    const boxX = 115, boxY = 75, boxW = 450, boxH = 265;
    roundRect(ctx, boxX, boxY, boxW, boxH, 22);
    ctx.fillStyle = '#1B1C20';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#2B2D33';
    ctx.stroke();

    const avatarCenterX = boxX + 110;
    const avatarCenterY = boxY + boxH / 2 - 12;
    const avatarRadius = 68;
    // Use the passed avatarUrl (already proxied to data URI) instead of direct localStorage
    const resolvedAvatarUrl = avatarUrl || '';
    const avatarImg = await loadAvatarImg(resolvedAvatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCenterX, avatarCenterY, avatarRadius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, avatarCenterX - avatarRadius, avatarCenterY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    } else {
      const grad = ctx.createLinearGradient(avatarCenterX - avatarRadius, avatarCenterY - avatarRadius, avatarCenterX + avatarRadius, avatarCenterY + avatarRadius);
      grad.addColorStop(0, '#5865F2');
      grad.addColorStop(1, '#0284C7');
      ctx.fillStyle = grad;
      ctx.fillRect(avatarCenterX - avatarRadius, avatarCenterY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 44px Fredoka, Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((playerName || 'P').slice(0, 2).toUpperCase(), avatarCenterX, avatarCenterY);
    }
    ctx.restore();

    ctx.fillStyle = '#F8FAFC';
    ctx.font = 'bold 16px "Plus Jakarta Sans", Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText((playerName || 'Player').slice(0, 14), avatarCenterX, avatarCenterY + avatarRadius + 24);

    const tileGap = 4;
    const tileSize = Math.min(28, Math.floor((180 - (maxAttempts - 1) * tileGap) / maxAttempts));
    const gridW = wordLength * tileSize + (wordLength - 1) * tileGap;
    const gridH = maxAttempts * tileSize + (maxAttempts - 1) * tileGap;
    const gridStartX = boxX + 230 + Math.floor((190 - gridW) / 2);
    const gridStartY = boxY + Math.floor((boxH - gridH) / 2);

    for (let r = 0; r < maxAttempts; r++) {
      const rowGuess = guesses[r];
      for (let c = 0; c < wordLength; c++) {
        const colIndex = lang === 'ar' ? (wordLength - 1 - c) : c;
        const x = gridStartX + colIndex * (tileSize + tileGap);
        const y = gridStartY + r * (tileSize + tileGap);

        roundRect(ctx, x, y, tileSize, tileSize, 5);
        if (!rowGuess) {
          ctx.fillStyle = '#23252A';
          ctx.fill();
        } else {
          const st = rowGuess.evaluations[c]?.state;
          ctx.fillStyle = st === 'correct' ? '#538D4E' : (st === 'present' ? '#B59F3B' : '#3A3A3C');
          ctx.fill();
        }
      }
    }

    const scoreText = solved ? `${guesses.length}/${maxAttempts}` : `X/${maxAttempts}`;
    const crown = solved && guesses.length <= 4 ? '👑 ' : '';
    ctx.fillStyle = '#94A3B8';
    ctx.font = '600 14px "Plus Jakarta Sans", Cairo, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${crown}Score: ${scoreText} • ${lang === 'ar' ? 'عربي' : 'English'}`, canvas.width / 2, boxY + boxH + 28);

    return canvas.toDataURL('image/png');
  }

  async function displayDiscordCardPreview() {
    const loadingEl = document.getElementById('discordCardLoading');
    const imgEl = document.getElementById('discordCardImg');
    if (loadingEl) loadingEl.style.display = 'block';

    const guesses = state.soloSession?.guesses || [];
    const myStatus = state.soloSession?.status;
    const solved = myStatus === 'WON';
    const pName = nameInput.value.trim() || 'Player';

    // 1. Resolve avatar from backend via Discord Bot API / CDN / Member search
    const rawAvatarUrl = localStorage.getItem('wordchill_discord_avatar') || '';
    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    const cleanDiscordId = (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest'))
      ? rawDiscordId
      : null;
    const gId = discordSdk?.guildId || null;

    const proxiedAvatar = await resolveDiscordAvatar({
      avatarUrl: rawAvatarUrl,
      userId: cleanDiscordId,
      playerName: pName,
      guildId: gId
    });

    state.lastCardAvatarUrl = proxiedAvatar;

    const dataUrl = await generateDiscordResultCard({
      guesses,
      wordLength: state.wordLength,
      maxAttempts: state.maxAttempts,
      lang: state.lang,
      playerName: pName,
      dayNumber: state.soloSession?.dayNumber || (dailyInfo ? dailyInfo.dayNumber : null),
      isDaily: Boolean(state.soloSession?.isDaily || state.soloSession?.dayNumber),
      solved,
      avatarUrl: proxiedAvatar
    });

    state.lastCardDataUrl = dataUrl;
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.classList.remove('hidden');
    }
    if (loadingEl) loadingEl.style.display = 'none';

    // ALWAYS call shareResultToDiscord for every player when Daily Challenge completes
    shareResultToDiscord({ autoSend: true });
  }

  async function displayMpDiscordCardPreview(room) {
    const myPlayer = room.players.find(p => p.id === playerId);
    const guesses = myPlayer?.guesses || [];
    const solved = myPlayer?.status === 'SOLVED';
    const pName = nameInput.value.trim() || 'Player';

    const rawAvatarUrl = localStorage.getItem('wordchill_discord_avatar') || '';
    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    const cleanDiscordId = (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest'))
      ? rawDiscordId
      : null;
    const gId = discordSdk?.guildId || null;

    const proxiedAvatar = await resolveDiscordAvatar({
      avatarUrl: rawAvatarUrl,
      userId: cleanDiscordId,
      playerName: pName,
      guildId: gId
    });

    state.lastCardAvatarUrl = proxiedAvatar;

    const dataUrl = await generateDiscordResultCard({
      guesses,
      wordLength: room.wordLength,
      maxAttempts: room.maxAttempts,
      lang: room.lang,
      playerName: pName,
      dayNumber: dailyInfo ? dailyInfo.dayNumber : null,
      isDaily: false,
      solved,
      avatarUrl: proxiedAvatar
    });

    state.lastCardDataUrl = dataUrl;
    const imgEl = document.getElementById('mpDiscordCardImg');
    if (imgEl) {
      imgEl.src = dataUrl;
      imgEl.classList.remove('hidden');
    }
  }

  async function shareResultToDiscord({ autoSend = false } = {}) {
    const isSolo = state.mode === 'SOLO';
    const guesses = isSolo
      ? state.soloSession?.guesses || []
      : state.room?.players.find(p => p.id === playerId)?.guesses || [];
    const myStatus = isSolo
      ? state.soloSession?.status
      : state.room?.players.find(p => p.id === playerId)?.status;
    const solved = myStatus === 'WON' || myStatus === 'SOLVED';
    const pName = nameInput.value.trim() || 'Player';

    const webhookUrl = localStorage.getItem('wordchill_discord_webhook') || '';
    if (!webhookUrl && !autoSend) {
      document.getElementById('discordModal')?.classList.remove('hidden');
      return showToast('الرجاء وضع رابط Discord Webhook أولاً من الإعدادات!');
    }

    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    const cleanDiscordId = (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest'))
      ? rawDiscordId
      : null;
    const cid = getClientId();
    const chId = discordSdk?.channelId || null;
    const gId = discordSdk?.guildId || null;

    try {
      if (!autoSend) {
        showToast('جاري إرسال الكارت إلى ديسكورد... 🚀');
      }
      const gameUrl = state.lastChallengeToken
        ? `${window.location.origin}${window.location.pathname}?challenge=${state.lastChallengeToken}`
        : (state.soloSession?.isDaily ? `${window.location.origin}${window.location.pathname}?daily=1` : window.location.origin);

      const res = await fetch('/api/discord/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
          channelId: chId,
          guildId: gId,
          playerName: pName,
          avatarUrl: state.lastCardAvatarUrl || localStorage.getItem('wordchill_discord_avatar') || '',
          lang: state.lang,
          attemptsUsed: guesses.length,
          maxAttempts: state.maxAttempts,
          solved,
          imageBase64: state.lastCardDataUrl,
          gameUrl,
          dayNumber: state.soloSession?.dayNumber || (dailyInfo ? dailyInfo.dayNumber : null),
          isDaily: Boolean(state.soloSession?.isDaily || state.soloSession?.dayNumber),
          challengeInfo: state.soloSession?.challenger || null,
          wordLength: state.wordLength,
          discordUserId: cleanDiscordId,
          clientId: cid
        })
      });

      const data = await res.json();
      if (data.ok) {
        if (!autoSend) showToast('تم نشر النتيجة في روم ديسكورد بنجاح! 🎮🔥');
      } else {
        if (!autoSend && !data.alreadySubmitted) {
          showToast(data.error || 'تعذر الإرسال لديسكورد');
        }
      }
    } catch (err) {
      if (!autoSend) showToast('خطأ في الاتصال أثناء الإرسال');
    }
  }

  async function createAndCopyChallengeLink() {
    const isSolo = state.mode === 'SOLO';
    if (!isSolo || !state.soloSession) return;
    const pName = nameInput.value.trim() || 'Player';
    const secretWord = state.soloSession.secretWord;
    if (!secretWord) return;

    try {
      const res = await fetch('/api/challenge/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secretWord,
          lang: state.lang,
          wordLength: state.wordLength,
          maxAttempts: state.maxAttempts,
          challengerName: pName,
          challengerScore: state.soloSession.guesses.length,
          dayNumber: state.soloSession.dayNumber || null
        })
      });
      const data = await res.json();
      if (data.ok && data.shareUrl) {
        state.lastChallengeToken = data.challengeToken;
        const fullLink = `${window.location.origin}${window.location.pathname}${data.shareUrl}`;
        await navigator.clipboard.writeText(fullLink);
        showToast('تم نسخ رابط التحدي! ابعته لأصحابك في شات ديسكورد ⚔️');
      }
    } catch (e) {
      showToast('تعذر إنشاء رابط التحدي');
    }
  }

  async function copyEmojiGrid() {
    const guesses = state.mode === 'SOLO'
      ? state.soloSession?.guesses || []
      : state.room?.players.find(p => p.id === playerId)?.guesses || [];
    const myStatus = state.mode === 'SOLO'
      ? state.soloSession?.status
      : state.room?.players.find(p => p.id === playerId)?.status;
    const solved = myStatus === 'WON' || myStatus === 'SOLVED';
    const scoreText = solved ? `${guesses.length}/${state.maxAttempts}` : `X/${state.maxAttempts}`;
    const crown = solved && guesses.length <= 4 ? '👑 ' : '';
    const dayLabel = state.soloSession?.dayNumber ? `No. ${state.soloSession.dayNumber}` : 'Challenge';

    const isAr = state.lang === 'ar';
    const rows = guesses.map(g => {
      const cells = g.evaluations.map(c => {
        if (c.state === 'correct') return '🟩';
        if (c.state === 'present') return '🟨';
        return '⬛';
      });
      if (isAr) cells.reverse();
      return cells.join('');
    }).join('\n');

    const shareUrl = window.location.origin;
    const textToCopy = `WordChill ${dayLabel} ${crown}${scoreText}\n\n${rows}\n\n🎮 Play: ${shareUrl}`;

    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast('تم نسخ شبكة الإيموجي للمحادثة! 📋');
    } catch (e) {
      showToast('تعذر النسخ إلى الحافظة');
    }
  }

  // ==================== DISCORD MODAL & BUTTON LISTENERS ====================
  const discordModal = document.getElementById('discordModal');
  const webhookInput = document.getElementById('discordWebhookInput');
  const avatarInput = document.getElementById('discordAvatarInput');

  if (webhookInput) webhookInput.value = localStorage.getItem('wordchill_discord_webhook') || '';
  if (avatarInput) avatarInput.value = localStorage.getItem('wordchill_discord_avatar') || '';

  const openDiscordModal = () => discordModal?.classList.remove('hidden');
  document.getElementById('discordConfigBtn')?.addEventListener('click', openDiscordModal);
  document.getElementById('globalPlayerAvatar')?.addEventListener('click', openDiscordModal);
  document.getElementById('globalAvatarEmoji')?.addEventListener('click', openDiscordModal);
  document.getElementById('closeDiscordModalBtn')?.addEventListener('click', () => {
    discordModal?.classList.add('hidden');
  });
  document.getElementById('saveDiscordConfigBtn')?.addEventListener('click', () => {
    const wVal = webhookInput?.value.trim() || '';
    const aVal = avatarInput?.value.trim() || '';
    localStorage.setItem('wordchill_discord_webhook', wVal);
    localStorage.setItem('wordchill_discord_avatar', aVal);
    updateAvatarDisplay(aVal);
    discordModal?.classList.add('hidden');
    showToast('تم حفظ إعدادات ديسكورد بنجاح! 🎮');
  });

  document.getElementById('sendToDiscordBtn')?.addEventListener('click', () => shareResultToDiscord());
  document.getElementById('sendMpToDiscordBtn')?.addEventListener('click', () => shareResultToDiscord());
  document.getElementById('copyChallengeLinkBtn')?.addEventListener('click', createAndCopyChallengeLink);
  document.getElementById('copyEmojiGridBtn')?.addEventListener('click', copyEmojiGrid);

  // ==================== URL PARAMETER PARSER ON STARTUP ====================
  async function handleUrlParameters() {
    const params = new URLSearchParams(window.location.search);

    const challengeParam = params.get('challenge');
    if (challengeParam) {
      await startSoloGame({ challenge: challengeParam });
      return;
    }

    if (params.get('daily') === '1' || params.get('mode') === 'daily') {
      await startSoloGame({ isDaily: true });
      return;
    }

    const roomParam = params.get('room') || params.get('code');
    if (roomParam) {
      document.getElementById('joinCodeInput').value = roomParam.toUpperCase();
      joinRoomByCode(roomParam);
    }
  }

  initDiscordSdk();
  fetchDailyInfo().then(() => updateDailyButtonState());
  handleUrlParameters();
  fetchPublicRooms();
})();
