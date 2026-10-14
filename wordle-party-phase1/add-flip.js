const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, 'public', 'styles.css');
const clientPath = path.join(__dirname, 'public', 'client.js');

// 1. Add 3D Flip Keyframes to styles.css
const flipCss = `
/* ==================== WORDLE 3D SEQUENTIAL FLIP ANIMATION ==================== */
.grid-tile.revealing {
  background: var(--tile-empty);
  border-color: var(--accent);
  color: var(--text-main);
  animation: wordleFlip 0.52s cubic-bezier(0.45, 0.05, 0.55, 0.95) forwards;
  animation-delay: var(--flip-delay, 0ms);
}

.grid-tile.revealing.correct {
  --reveal-bg: var(--tile-correct);
  --reveal-border: var(--tile-correct);
}

.grid-tile.revealing.present {
  --reveal-bg: var(--tile-present);
  --reveal-border: var(--tile-present);
}

.grid-tile.revealing.absent {
  --reveal-bg: var(--tile-absent);
  --reveal-border: var(--tile-absent);
}

@keyframes wordleFlip {
  0% {
    transform: perspective(600px) rotateX(0deg);
    background: var(--tile-empty);
    border-color: var(--accent);
    color: var(--text-main);
  }
  49.9% {
    transform: perspective(600px) rotateX(90deg);
    background: var(--tile-empty);
    border-color: var(--accent);
    color: var(--text-main);
  }
  50% {
    transform: perspective(600px) rotateX(-90deg);
    background: var(--reveal-bg);
    border-color: var(--reveal-border);
    color: #fff;
  }
  100% {
    transform: perspective(600px) rotateX(0deg);
    background: var(--reveal-bg);
    border-color: var(--reveal-border);
    color: #fff;
  }
}

.grid-tile.win-bounce {
  animation: winBounce 0.5s ease forwards;
  animation-delay: var(--bounce-delay, 0ms);
}

@keyframes winBounce {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-14px); }
  70% { transform: translateY(4px); }
}
`;

let currentCss = fs.readFileSync(cssPath, 'utf8');
if (!currentCss.includes('wordleFlip')) {
    fs.writeFileSync(cssPath, currentCss + '\n' + flipCss, 'utf8');
}

// 2. Update client.js to trigger staggered flip on newly submitted row
const updatedClientJs = `(() => {
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

  const FLIP_STEP_MS = 180; // Delay between each letter from left to right
  const FLIP_DURATION_MS = 520; // Duration of single tile 3D flip

  const state = {
    mode: null,
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
      state.animatingRowIndex = -1;
      state.bounceRowIndex = -1;
      state.knownGuessCount = 0;
      state.isSubmitting = false;

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

    // If the player just submitted a new guess in MP, animate that row before switching to results
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

    // If round finished while we weren't mid-animation, show results
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
    const guesses = state.mode === 'SOLO'
      ? state.soloSession.guesses
      : (state.room.players.find(p => p.id === playerId)?.guesses || []);

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession.status
      : (state.room.players.find(p => p.id === playerId)?.status || 'PLAYING');

    const isStillPlaying = myStatus === 'IN_PROGRESS' || myStatus === 'PLAYING';
    const isAnimating = state.animatingRowIndex !== -1 || state.bounceRowIndex !== -1;
    const remaining = Math.max(0, state.maxAttempts - guesses.length);

    document.getElementById('gameRuleInfo').textContent = \`\${state.wordLength} Letters • \${state.maxAttempts} Tries\`;
    document.getElementById('remainingTriesText').textContent =
      isStillPlaying || isAnimating ? \`\${remaining} attempts remaining\` : \`Status: \${myStatus}\`;

    const gridEl = document.getElementById('wordGrid');
    gridEl.style.setProperty('--word-length', state.wordLength);
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

          // Apply staggered left-to-right 3D flip only on the newly submitted row
          if (r === state.animatingRowIndex) {
            tile.classList.add('revealing');
            tile.style.setProperty('--flip-delay', \`\${c * FLIP_STEP_MS}ms\`);
          } else if (r === state.bounceRowIndex) {
            tile.classList.add('win-bounce');
            tile.style.setProperty('--bounce-delay', \`\${c * 75}ms\`);
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

    // Only show Solo End Banner AFTER the flip & bounce animation completes
    if (state.mode === 'SOLO' && !isStillPlaying && !isAnimating) {
      const banner = document.getElementById('soloEndBanner');
      banner.classList.remove('hidden');
      document.getElementById('soloEndTitle').textContent =
        myStatus === 'WON' ? '🎉 Brilliant! You Solved It!' : 'Out of Attempts!';
      document.getElementById('soloEndSecret').innerHTML =
        \`The secret word was <strong>\${state.soloSession.secretWord}</strong>\`;
    }

    // Exclude currently flipping row from keyboard colors until flip completes!
    const keyboardGuesses = state.animatingRowIndex !== -1
      ? guesses.slice(0, state.animatingRowIndex)
      : guesses;
    renderKeyboard(keyboardGuesses);
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
          state.isSubmitting = false;
          shakeActiveRow();
          showToast(data.error);
        } else {
          state.soloSession = data.session;
          state.currentGuess = '';
          const newRowIdx = state.soloSession.guesses.length - 1;
          const isWon = state.soloSession.status === 'WON';
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
`;

fs.writeFileSync(clientPath, updatedClientJs, 'utf8');
console.log('✅ Added Wordle 3D Flip + Win Bounce animations successfully!');