const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'public', 'index.html');
const CSS_PATH = path.join(__dirname, 'public', 'styles.css');

const NEW_INDEX_HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>WordChill — Multiplayer Word Party</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <!-- الخلفية العلوية المنحنية المستوحاة من التصميم -->
  <div class="curved-hero-bg"></div>

  <div id="toastContainer" class="toast-container"></div>

  <!-- الشريط العلوي -->
  <header class="topbar">
    <div class="brand" id="navHomeBtn" title="Back to Main Menu">
      <div class="tilted-logo">
        <span class="logo-tile t1">W</span>
        <span class="logo-tile t2">O</span>
        <span class="logo-tile t3">R</span>
        <span class="logo-tile t4">D</span>
        <span class="logo-tile t5">C</span>
        <span class="logo-tile t2">H</span>
        <span class="logo-tile t1">I</span>
        <span class="logo-tile t4">L</span>
        <span class="logo-tile t1">L</span>
      </div>
    </div>

    <div class="topbar-actions">
      <div class="profile-pill">
        <span class="profile-icon">😎</span>
        <input id="globalPlayerName" type="text" maxlength="16" placeholder="Your Nickname" />
      </div>
      <button id="howToPlayModalBtn" class="icon-circle-btn" title="How to Play">?</button>
      <button id="themeToggleBtn" class="icon-circle-btn" title="Toggle Dark/Light Mode">☀️</button>
    </div>
  </header>

  <main class="app-shell">
    <!-- ==================== 1. MAIN MENU SCREEN ==================== -->
    <section id="screen-menu" class="screen active">
      <div class="hero-header">
        <div class="hero-word-tiles">
          <span class="w-tile white">W</span>
          <span class="w-tile teal">O</span>
          <span class="w-tile white">R</span>
          <span class="w-tile coral">D</span>
          <span class="w-tile white">S</span>
        </div>
        <h1 class="hero-title">Play Together, Chill Together</h1>
        <p class="hero-subtitle">Real-time bilingual word puzzles in English & Arabic</p>
      </div>

      <div class="menu-cards-grid">
        <!-- كارت اللعب الفردي -->
        <div class="surface-card solo-card">
          <div class="card-pill-badge">SOLO TRAINING</div>
          <h2>Quick Solo Match</h2>
          <p class="card-desc">Warm up your brain and test your vocabulary at your own pace.</p>

          <div class="selector-stack">
            <div class="length-selector-box">
              <span class="selector-label">LANGUAGE</span>
              <div class="pill-group" id="soloLangGroup">
                <button class="pill active" data-lang="en">🇬🇧 EN</button>
                <button class="pill" data-lang="ar">🇪🇬 عربي</button>
              </div>
            </div>

            <div class="length-selector-box">
              <span class="selector-label">LETTERS</span>
              <div class="pill-group" id="soloLengthGroup">
                <button class="pill" data-len="4">4</button>
                <button class="pill active" data-len="5">5</button>
                <button class="pill" data-len="6">6</button>
                <button class="pill" data-len="7">7</button>
              </div>
            </div>
          </div>

          <div class="play-btn-wrapper">
            <button id="playSoloBtn" class="sketch-play-btn">
              <span>PLAY SOLO</span>
            </button>
          </div>
        </div>

        <!-- كارت اللعب الجماعي -->
        <div class="surface-card mp-card">
          <div class="card-pill-badge coral-badge">MULTIPLAYER PARTY</div>
          <h2>Play With Friends</h2>
          <p class="card-desc">Create a private room or jump into a live lobby with up to 10 players!</p>

          <button id="openCreateRoomBtn" class="btn-primary-wave full-width">
            ✨ Create New Room
          </button>

          <div class="divider-line"><span>OR JOIN WITH CODE</span></div>

          <div class="join-code-row">
            <input id="joinCodeInput" type="text" maxlength="6" placeholder="CODE (e.g. AB12CD)" />
            <button id="joinRoomBtn" class="btn-secondary-wave">JOIN ↗</button>
          </div>

          <div class="public-rooms-box">
            <div class="public-rooms-header">
              <span>🌐 Open Public Rooms</span>
              <button id="refreshPublicRoomsBtn" class="btn-mini-refresh">↻ Refresh</button>
            </div>
            <div id="publicRoomsList" class="public-rooms-list">
              <p class="muted-text">No public rooms waiting right now. Host one above!</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 2. CREATE ROOM SCREEN ==================== -->
    <section id="screen-create" class="screen">
      <div class="surface-card narrow-card">
        <div class="card-top-bar">
          <button id="backFromCreateBtn" class="circle-back-btn">←</button>
          <h2>Room Setup</h2>
          <div style="width:42px"></div>
        </div>

        <div class="form-stack">
          <div class="form-group">
            <label>ROOM NAME</label>
            <input id="roomNameInput" type="text" maxlength="26" placeholder="e.g. Nagih's Chill Arena" />
          </div>

          <div class="form-group">
            <label>DICTIONARY LANGUAGE</label>
            <div class="pill-group large" id="createLangGroup">
              <button class="pill active" data-lang="en">🇬🇧 English Words</button>
              <button class="pill" data-lang="ar">🇪🇬 كلمات عربية</button>
            </div>
          </div>

          <div class="form-group">
            <label>WORD LENGTH (4 TO 7 LETTERS)</label>
            <div class="pill-group large" id="createLengthGroup">
              <button class="pill" data-len="4">4 Letters</button>
              <button class="pill active" data-len="5">5 Letters</button>
              <button class="pill" data-len="6">6 Letters</button>
              <button class="pill" data-len="7">7 Letters</button>
            </div>
          </div>

          <div class="form-row-2">
            <div class="form-group">
              <label>MAX PLAYERS</label>
              <select id="maxPlayersSelect">
                <option value="2">2 Players</option>
                <option value="4">4 Players</option>
                <option value="6" selected>6 Players</option>
                <option value="8">8 Players</option>
                <option value="10">10 Players</option>
              </select>
            </div>

            <div class="form-group">
              <label>MAX TRIES</label>
              <select id="maxAttemptsSelect">
                <option value="5">5 Tries</option>
                <option value="6" selected>6 Tries (Standard)</option>
                <option value="7">7 Tries</option>
              </select>
            </div>
          </div>

          <label class="checkbox-pill">
            <input id="roomPublicCheckbox" type="checkbox" checked />
            <span>Show room in Public Lobby list</span>
          </label>

          <div class="preview-pill" id="configPreviewText">
            🇬🇧 EN • 5 Letters • Max 6 Players • 6 Tries
          </div>

          <div class="play-btn-wrapper">
            <button id="confirmCreateRoomBtn" class="sketch-play-btn">
              <span>LAUNCH ROOM</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 3. LOBBY WAITING SCREEN ==================== -->
    <section id="screen-lobby" class="screen">
      <div class="surface-card lobby-card">
        <div class="lobby-header-wave">
          <div>
            <span class="card-pill-badge">WAITING LOBBY</span>
            <h2 id="lobbyRoomName">WordChill Arena</h2>
          </div>

          <div class="room-code-capsule">
            <span class="code-label">ROOM CODE</span>
            <strong id="lobbyRoomCode">------</strong>
            <button id="copyCodeBtn" class="btn-chip">Copy</button>
          </div>
        </div>

        <div class="lobby-badges-row">
          <span id="lobbyWordLenBadge" class="soft-badge">🇬🇧 English • 5 Letters</span>
          <span id="lobbyAttemptsBadge" class="soft-badge">🎯 6 Attempts</span>
          <span id="lobbyCapacityBadge" class="soft-badge">👥 1 / 6 Players</span>
        </div>

        <div id="lobbyPlayersGrid" class="lobby-players-grid"></div>

        <p id="lobbyWaitHint" class="wait-hint-text">Need at least 2 players to start...</p>

        <div class="lobby-actions-row">
          <button id="leaveLobbyBtn" class="btn-secondary-wave">← Leave</button>
          <button id="startMultiplayerBtn" class="sketch-play-btn">
            <span>START MATCH</span>
          </button>
        </div>
      </div>
    </section>

    <!-- ==================== 4. ACTIVE GAME SCREEN ==================== -->
    <section id="screen-game" class="screen">
      <div class="game-top-bar">
        <button id="quitActiveGameBtn" class="circle-back-btn" title="Exit Game">←</button>
        <div class="game-center-pills">
          <span id="gameModeBadge" class="mode-capsule">SOLO MODE</span>
          <span id="gameRuleInfo" class="rule-capsule">5 Letters • 6 Tries</span>
        </div>
        <span id="remainingTriesText" class="timer-capsule">6 tries left</span>
      </div>

      <div class="game-layout solo-only">
        <div class="board-area surface-card">
          <div id="wordGrid" class="word-grid"></div>

          <!-- بانر نهاية الجيم الفردي -->
          <div id="soloEndBanner" class="solo-end-banner hidden">
            <div class="solo-end-header">
              <span id="soloEndIcon" class="solo-end-icon">🏆</span>
              <div>
                <h3 id="soloEndTitle">Brilliant!</h3>
                <p id="soloEndSecret">The secret word was <strong>WORLD</strong></p>
              </div>
            </div>
            <div class="solo-end-actions">
              <button id="soloPlayAgainBtn" class="btn-primary-wave">Play Again ↻</button>
              <button id="soloBackMenuBtn" class="btn-secondary-wave">Main Menu</button>
            </div>
          </div>

          <div id="keyboard" class="keyboard"></div>
        </div>

        <!-- القائمة الجانبية للاعبين في الأونلاين -->
        <aside id="mpLiveSidebar" class="mp-sidebar surface-card hidden">
          <div class="sidebar-header">
            <h3>Live Opponents</h3>
            <span id="sidebarRoomCode" class="code-pill">#------</span>
          </div>
          <div id="liveOpponentsList" class="opponents-list"></div>
        </aside>
      </div>
    </section>

    <!-- ==================== 5. RESULTS / LEADERBOARD SCREEN ==================== -->
    <section id="screen-results" class="screen">
      <div class="surface-card results-card">
        <div class="hero-word-tiles small-tiles">
          <span class="w-tile white">R</span>
          <span class="w-tile teal">A</span>
          <span class="w-tile white">N</span>
          <span class="w-tile coral">K</span>
          <span class="w-tile white">S</span>
        </div>

        <h2 class="results-title">Leaderboard</h2>

        <div class="secret-reveal-capsule">
          <span>SECRET WORD</span>
          <strong id="resultsSecretWord">CHILL</strong>
        </div>

        <div id="resultsLeaderboard" class="results-leaderboard"></div>

        <div class="results-actions">
          <button id="resultsMainMenuBtn" class="btn-secondary-wave">Main Menu</button>
          <button id="resultsNewRoundBtn" class="sketch-play-btn">
            <span>NEXT ROUND ↗</span>
          </button>
        </div>
      </div>
    </section>
  </main>

  <!-- نافذة شرح اللعبة -->
  <div id="howToModal" class="modal-backdrop hidden">
    <div class="surface-card modal-card">
      <div class="card-top-bar">
        <h3>How to Play WordChill</h3>
        <button id="closeHowToBtn" class="circle-back-btn">✕</button>
      </div>
      <div class="modal-body">
        <p>Guess the hidden word in 6 tries (English or Arabic!). After each guess, the tile colors reveal how close you are:</p>
        <div class="example-tiles-row">
          <span class="ex-tile correct">W</span>
          <span><strong>Teal Green:</strong> Letter is in the word and in the correct spot.</span>
        </div>
        <div class="example-tiles-row">
          <span class="ex-tile present">O</span>
          <span><strong>Coral Orange:</strong> Letter is in the word, but in another spot.</span>
        </div>
        <div class="example-tiles-row">
          <span class="ex-tile absent">R</span>
          <span><strong>Muted Slate:</strong> Letter is not in the word at all.</span>
        </div>
      </div>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script src="client.js"></script>
</body>
</html>
`;

const NEW_STYLES_CSS = `/* ==========================================================================
   WORDCHILL — SOFT TACTILE CURVED BLUE UI (LIGHT & DARK MODE)
   ========================================================================== */

:root,
html[data-theme="light"] {
  --bg-main: #EEF6FA;
  --hero-curve-bg: linear-gradient(145deg, #1D63DC 0%, #2B86F5 55%, #38BDF8 100%);
  --surface-card: #FFFFFF;
  --surface-subtle: #F3F8FC;
  --surface-pill: rgba(29, 99, 220, 0.08);
  --text-main: #0F172A;
  --text-muted: #64748B;
  --text-on-hero: #FFFFFF;
  --border-soft: #E2E8F0;
  --border-strong: #0F172A;

  /* ألوان المربعات مستوحاة من التصميم المرفق مع استبدال الأصفر بالأزرق */
  --tile-empty-bg: #F1F5F9;
  --tile-empty-border: #CBD5E1;
  --tile-filled-bg: #FFFFFF;
  --tile-filled-border: #2563EB;
  --tile-text: #0F172A;

  --color-correct: #2A9D8F;       /* أخضر تيل ناعم ومميز */
  --color-correct-shadow: #1E7268;
  --color-present: #F46036;       /* برتقالي مرجاني واضح */
  --color-present-shadow: #C8431E;
  --color-absent: #94A3B8;        /* رمادي مزرق هادئ */
  --color-absent-shadow: #64748B;

  --kb-bg: #F1F5F9;
  --kb-text: #1E293B;
  --kb-shadow: #CBD5E1;

  --primary-blue: #2563EB;
  --primary-blue-hover: #1D4ED8;
  --accent-coral: #F46036;
  --shadow-card: 0 20px 45px -15px rgba(15, 23, 42, 0.12);
  --font-display: 'Fredoka', 'Cairo', sans-serif;
  --font-body: 'Plus Jakarta Sans', 'Cairo', sans-serif;
}

html[data-theme="dark"] {
  --bg-main: #0B1325;
  --hero-curve-bg: linear-gradient(145deg, #172554 0%, #1E3A8A 55%, #0284C7 100%);
  --surface-card: #131F37;
  --surface-subtle: #1B2B4B;
  --surface-pill: rgba(56, 189, 248, 0.12);
  --text-main: #F8FAFC;
  --text-muted: #94A3B8;
  --text-on-hero: #FFFFFF;
  --border-soft: #233554;
  --border-strong: #38BDF8;

  --tile-empty-bg: #192744;
  --tile-empty-border: #2A3F66;
  --tile-filled-bg: #1E3156;
  --tile-filled-border: #38BDF8;
  --tile-text: #F8FAFC;

  --color-correct: #10B981;
  --color-correct-shadow: #059669;
  --color-present: #F97316;
  --color-present-shadow: #C2410C;
  --color-absent: #334155;
  --color-absent-shadow: #1E293B;

  --kb-bg: #1E2F50;
  --kb-text: #F8FAFC;
  --kb-shadow: #0F172A;

  --primary-blue: #0EA5E9;
  --primary-blue-hover: #38BDF8;
  --accent-coral: #F97316;
  --shadow-card: 0 24px 50px -15px rgba(2, 6, 23, 0.65);
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background-color: var(--bg-main);
  color: var(--text-main);
  font-family: var(--font-body);
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
  transition: background-color 0.3s ease, color 0.3s ease;
}

/* الخلفية الزرقاء المنحنية في النصف العلوي */
.curved-hero-bg {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 440px;
  background: var(--hero-curve-bg);
  border-bottom-left-radius: 50% 90px;
  border-bottom-right-radius: 50% 90px;
  z-index: 0;
  box-shadow: 0 12px 35px rgba(14, 165, 233, 0.2);
  pointer-events: none;
  transition: background 0.35s ease;
}

/* ==================== TOPBAR & TILTED LOGO ==================== */
.topbar {
  position: relative;
  z-index: 10;
  max-width: 1160px;
  margin: 0 auto;
  padding: 18px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.brand {
  cursor: pointer;
  user-select: none;
}

.tilted-logo {
  display: flex;
  align-items: center;
  gap: 4px;
}

.logo-tile {
  width: 34px;
  height: 38px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.05rem;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.16);
  transition: transform 0.2s ease;
}

.brand:hover .logo-tile {
  transform: translateY(-3px) rotate(0deg) !important;
}

.logo-tile.t1 { background: #FFFFFF; color: #0F172A; transform: rotate(-5deg); }
.logo-tile.t2 { background: #2A9D8F; color: #FFFFFF; transform: rotate(4deg); }
.logo-tile.t3 { background: #FFFFFF; color: #0F172A; transform: rotate(-3deg); }
.logo-tile.t4 { background: #F46036; color: #FFFFFF; transform: rotate(5deg); }
.logo-tile.t5 { background: #38BDF8; color: #0F172A; transform: rotate(-4deg); }

.topbar-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.profile-pill {
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(10px);
  border: 1.5px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  padding: 6px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-pill input {
  background: transparent;
  border: none;
  outline: none;
  color: #FFFFFF;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 0.95rem;
  width: 130px;
}

.profile-pill input::placeholder {
  color: rgba(255, 255, 255, 0.75);
}

.icon-circle-btn,
.circle-back-btn {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  border: 1.5px solid rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.16);
  color: #FFFFFF;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, background 0.2s ease;
}

.surface-card .circle-back-btn {
  background: var(--surface-subtle);
  color: var(--text-main);
  border-color: var(--border-soft);
}

.icon-circle-btn:hover,
.circle-back-btn:hover {
  transform: translateY(-2px);
}

/* ==================== APP SHELL & SCREENS ==================== */
.app-shell {
  position: relative;
  z-index: 5;
  max-width: 1120px;
  margin: 0 auto;
  padding: 10px 20px 50px;
}

.screen {
  display: none;
  animation: fadeUp 0.28s ease;
}

.screen.active {
  display: block;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ==================== HERO HEADER (W O R D S TILES) ==================== */
.hero-header {
  text-align: center;
  margin: 6px 0 26px;
  color: var(--text-on-hero);
}

.hero-word-tiles {
  display: inline-flex;
  gap: 8px;
  margin-bottom: 12px;
}

.w-tile {
  width: 48px;
  height: 54px;
  border-radius: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 700;
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.18);
}

.w-tile.white { background: #FFFFFF; color: #0F172A; transform: rotate(-4deg); }
.w-tile.teal  { background: #2A9D8F; color: #FFFFFF; transform: rotate(3deg) translateY(-3px); }
.w-tile.coral { background: #F46036; color: #FFFFFF; transform: rotate(5deg); }

.small-tiles .w-tile {
  width: 40px;
  height: 44px;
  font-size: 1.2rem;
}

.hero-title {
  font-family: var(--font-display);
  font-size: clamp(1.7rem, 3.2vw, 2.35rem);
  font-weight: 700;
  letter-spacing: -0.01em;
}

.hero-subtitle {
  opacity: 0.9;
  font-size: 0.98rem;
  margin-top: 4px;
}

/* ==================== CARDS & LAYOUT ==================== */
.menu-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 24px;
  align-items: stretch;
}

.surface-card {
  background: var(--surface-card);
  border-radius: 32px;
  padding: 28px;
  box-shadow: var(--shadow-card);
  border: 1.5px solid var(--border-soft);
  transition: background-color 0.3s ease, border-color 0.3s ease;
}

.narrow-card {
  max-width: 560px;
  margin: 12px auto;
}

.card-pill-badge {
  display: inline-block;
  padding: 5px 14px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 0.76rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: rgba(37, 99, 235, 0.12);
  color: var(--primary-blue);
  margin-bottom: 10px;
}

.card-pill-badge.coral-badge {
  background: rgba(244, 96, 54, 0.14);
  color: var(--accent-coral);
}

.surface-card h2 {
  font-family: var(--font-display);
  font-size: 1.55rem;
  margin-bottom: 6px;
}

.card-desc {
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.5;
  margin-bottom: 20px;
}

/* ==================== PILL SELECTORS ==================== */
.selector-stack {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
}

.length-selector-box {
  background: var(--surface-subtle);
  border-radius: 20px;
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.selector-label {
  font-family: var(--font-display);
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
}

.pill-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.pill {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1.5px solid var(--border-soft);
  background: var(--surface-card);
  color: var(--text-main);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.18s ease;
}

.pill.active {
  background: var(--primary-blue);
  color: #FFFFFF;
  border-color: var(--primary-blue);
  box-shadow: 0 6px 14px rgba(37, 99, 235, 0.3);
}

/* ==================== SIGNATURE SKETCH PLAY BUTTON (FROM IMAGE) ==================== */
.play-btn-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 10px;
}

.sketch-play-btn {
  position: relative;
  min-width: 170px;
  height: 64px;
  padding: 0 28px;
  border-radius: 22px;
  background: var(--surface-card);
  color: var(--text-main);
  border: 2.5px solid var(--border-strong);
  font-family: var(--font-display);
  font-size: 1.08rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 5px 5px 0px var(--primary-blue);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.sketch-play-btn:hover:not(:disabled) {
  transform: translate(-2px, -2px);
  box-shadow: 7px 7px 0px var(--primary-blue);
}

.sketch-play-btn:active:not(:disabled) {
  transform: translate(3px, 3px);
  box-shadow: 2px 2px 0px var(--primary-blue);
}

.sketch-play-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary-wave {
  padding: 14px 22px;
  border-radius: 18px;
  border: none;
  background: var(--primary-blue);
  color: #FFFFFF;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 6px 0 #1E40AF;
  transition: transform 0.15s ease;
}

.btn-primary-wave:hover {
  transform: translateY(-2px);
}

.btn-secondary-wave {
  padding: 13px 20px;
  border-radius: 18px;
  border: 2px solid var(--border-soft);
  background: var(--surface-subtle);
  color: var(--text-main);
  font-family: var(--font-display);
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.full-width {
  width: 100%;
}

/* ==================== INPUTS & PUBLIC ROOMS ==================== */
.divider-line {
  text-align: center;
  margin: 18px 0;
  position: relative;
}

.divider-line span {
  background: var(--surface-card);
  padding: 0 12px;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--text-muted);
}

.join-code-row {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
}

.join-code-row input,
.form-group input,
.form-group select {
  width: 100%;
  padding: 13px 16px;
  border-radius: 16px;
  border: 2px solid var(--border-soft);
  background: var(--surface-subtle);
  color: var(--text-main);
  font-family: var(--font-display);
  font-size: 0.98rem;
  font-weight: 600;
  outline: none;
}

.join-code-row input:focus,
.form-group input:focus {
  border-color: var(--primary-blue);
}

.public-rooms-box {
  background: var(--surface-subtle);
  border-radius: 22px;
  padding: 14px;
}

.public-rooms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-display);
  font-size: 0.88rem;
  font-weight: 700;
  margin-bottom: 10px;
}

.btn-mini-refresh,
.btn-chip {
  padding: 6px 12px;
  border-radius: 999px;
  border: none;
  background: var(--primary-blue);
  color: #FFFFFF;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
}

.public-room-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 10px 14px;
  border-radius: 999px;
  margin-bottom: 8px;
}

.muted-text {
  color: var(--text-muted);
  font-size: 0.86rem;
  text-align: center;
  padding: 8px 0;
}

/* ==================== CREATE & LOBBY ==================== */
.card-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.form-stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group label {
  display: block;
  font-family: var(--font-display);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.checkbox-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 600;
  cursor: pointer;
}

.preview-pill {
  text-align: center;
  padding: 10px;
  border-radius: 999px;
  background: var(--surface-pill);
  color: var(--primary-blue);
  font-family: var(--font-display);
  font-weight: 700;
}

.lobby-card {
  max-width: 720px;
  margin: 12px auto;
}

.lobby-header-wave {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 18px;
}

.room-code-capsule {
  background: var(--surface-subtle);
  padding: 10px 18px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 2px solid var(--border-soft);
}

.room-code-capsule strong {
  font-family: var(--font-display);
  font-size: 1.35rem;
  letter-spacing: 0.08em;
  color: var(--primary-blue);
}

.lobby-badges-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 20px;
}

.soft-badge {
  background: var(--surface-subtle);
  padding: 7px 15px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: 0.85rem;
  font-weight: 700;
}

.lobby-players-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.lobby-player-card {
  background: var(--surface-subtle);
  padding: 12px 16px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 12px;
}

.avatar-circle {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--primary-blue);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 700;
}

.wait-hint-text {
  text-align: center;
  color: var(--text-muted);
  margin-bottom: 16px;
  font-weight: 600;
}

.lobby-actions-row,
.results-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
}

/* ==================== GAME SCREEN & SQUIRCLE TILES ==================== */
.game-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 10px;
  flex-wrap: wrap;
}

.game-center-pills {
  display: flex;
  gap: 8px;
  align-items: center;
}

.mode-capsule,
.rule-capsule,
.timer-capsule {
  padding: 8px 18px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.9rem;
}

.mode-capsule {
  background: #FFFFFF;
  color: #0F172A;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.rule-capsule {
  background: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
  backdrop-filter: blur(8px);
}

.timer-capsule {
  background: #FFFFFF;
  color: #0F172A;
  border: 2px solid #0F172A;
}

.game-layout {
  display: grid;
  grid-template-columns: 1fr 310px;
  gap: 22px;
  align-items: start;
}

.game-layout.solo-only {
  grid-template-columns: 1fr;
  max-width: 680px;
  margin: 0 auto;
}

.board-area {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 20px;
}

.word-grid {
  --word-length: 5;
  display: grid;
  gap: 10px;
  margin-bottom: 24px;
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(var(--word-length), minmax(50px, 62px));
  gap: 10px;
  justify-content: center;
}

.word-grid.rtl-grid .grid-row,
.mini-grid.rtl-grid .mini-row {
  direction: rtl;
}

/* مربعات الحروف الدائرية الناعمة نفس الصورة */
.grid-tile {
  width: 100%;
  aspect-ratio: 1;
  border-radius: 18px;
  background: var(--tile-empty-bg);
  border: 2px solid var(--tile-empty-border);
  color: var(--tile-text);
  font-family: var(--font-display);
  font-size: 1.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  box-shadow: 0 4px 0 var(--tile-empty-border);
  transition: transform 0.12s ease, background-color 0.2s ease, border-color 0.2s ease;
}

.grid-tile.filled {
  background: var(--tile-filled-bg);
  border-color: var(--tile-filled-border);
  box-shadow: 0 4px 0 var(--tile-filled-border);
  animation: popTile 0.12s ease;
}

.grid-tile.correct {
  --eval-bg: var(--color-correct);
  --eval-border: var(--color-correct);
  --eval-shadow: var(--color-correct-shadow);
  background: var(--color-correct);
  border-color: var(--color-correct);
  color: #FFFFFF;
  box-shadow: 0 5px 0 var(--color-correct-shadow);
}

.grid-tile.present {
  --eval-bg: var(--color-present);
  --eval-border: var(--color-present);
  --eval-shadow: var(--color-present-shadow);
  background: var(--color-present);
  border-color: var(--color-present);
  color: #FFFFFF;
  box-shadow: 0 5px 0 var(--color-present-shadow);
}

.grid-tile.absent {
  --eval-bg: var(--color-absent);
  --eval-border: var(--color-absent);
  --eval-shadow: var(--color-absent-shadow);
  background: var(--color-absent);
  border-color: var(--color-absent);
  color: #FFFFFF;
  box-shadow: 0 5px 0 var(--color-absent-shadow);
}

.grid-tile.revealing {
  animation: flipTile 0.52s cubic-bezier(0.4, 0, 0.2, 1) both;
  animation-delay: var(--flip-delay, 0ms);
}

.grid-tile.win-bounce {
  animation: bounceWin 0.6s ease;
  animation-delay: var(--bounce-delay, 0ms);
}

@keyframes popTile {
  0% { transform: scale(0.88); }
  50% { transform: scale(1.08); }
  100% { transform: scale(1); }
}

@keyframes flipTile {
  0% {
    transform: perspective(500px) rotateX(0deg);
    background: var(--tile-filled-bg);
    border-color: var(--tile-filled-border);
    color: var(--tile-text);
    box-shadow: 0 4px 0 var(--tile-filled-border);
  }
  49.9% {
    background: var(--tile-filled-bg);
    border-color: var(--tile-filled-border);
    color: var(--tile-text);
    box-shadow: 0 4px 0 var(--tile-filled-border);
  }
  50% {
    transform: perspective(500px) rotateX(90deg);
    background: var(--eval-bg);
    border-color: var(--eval-border);
    color: #FFFFFF;
    box-shadow: 0 5px 0 var(--eval-shadow);
  }
  100% {
    transform: perspective(500px) rotateX(0deg);
    background: var(--eval-bg);
    border-color: var(--eval-border);
    color: #FFFFFF;
    box-shadow: 0 5px 0 var(--eval-shadow);
  }
}

@keyframes bounceWin {
  0%, 100% { transform: translateY(0); }
  40% { transform: translateY(-14px); }
}

.grid-row.shake {
  animation: shakeRow 0.4s ease;
}

@keyframes shakeRow {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-7px); }
  75% { transform: translateX(7px); }
}

/* ==================== KEYBOARD (SOFT SQUIRCLE KEYS) ==================== */
.keyboard {
  width: 100%;
  max-width: 580px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.keyboard.ar-keyboard {
  max-width: 630px;
}

.kb-row {
  display: flex;
  justify-content: center;
  gap: 6px;
}

.kb-key {
  flex: 1;
  min-height: 50px;
  border-radius: 15px;
  border: none;
  background: var(--kb-bg);
  color: var(--kb-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 4px 0 var(--kb-shadow);
  transition: transform 0.1s ease, background-color 0.2s ease;
}

.kb-key:active {
  transform: translateY(3px);
  box-shadow: 0 1px 0 var(--kb-shadow);
}

.kb-key.wide {
  flex: 1.5;
  font-size: 0.85rem;
}

.kb-key.correct {
  background: var(--color-correct);
  color: #FFFFFF;
  box-shadow: 0 4px 0 var(--color-correct-shadow);
}

.kb-key.present {
  background: var(--color-present);
  color: #FFFFFF;
  box-shadow: 0 4px 0 var(--color-present-shadow);
}

.kb-key.absent {
  background: var(--color-absent);
  color: #FFFFFF;
  opacity: 0.65;
  box-shadow: 0 4px 0 var(--color-absent-shadow);
}

/* ==================== LIVE OPPONENTS & PILL LEADERBOARD ==================== */
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 14px;
}

.opponent-card {
  background: var(--surface-subtle);
  padding: 12px 14px;
  border-radius: 20px;
  margin-bottom: 10px;
}

.opponent-top {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.88rem;
  margin-bottom: 8px;
}

.mini-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mini-row {
  display: flex;
  gap: 4px;
}

.mini-cell {
  width: 14px;
  height: 14px;
  border-radius: 5px;
  background: var(--tile-empty-border);
}

.mini-cell.correct { background: var(--color-correct); }
.mini-cell.present { background: var(--color-present); }
.mini-cell.absent  { background: var(--color-absent); }

/* صفحة النتائج الكبسولية مثل الصورة تماماً */
.results-card {
  max-width: 600px;
  margin: 12px auto;
  text-align: center;
}

.results-title {
  font-family: var(--font-display);
  font-size: 1.9rem;
  margin-bottom: 14px;
}

.secret-reveal-capsule {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: var(--surface-subtle);
  padding: 10px 24px;
  border-radius: 999px;
  margin-bottom: 22px;
  border: 2px solid var(--border-soft);
}

.secret-reveal-capsule strong {
  font-family: var(--font-display);
  font-size: 1.35rem;
  color: var(--primary-blue);
  letter-spacing: 0.08em;
}

.results-leaderboard {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 24px;
}

.leader-row {
  background: var(--surface-subtle);
  padding: 14px 20px;
  border-radius: 999px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: var(--font-display);
  border: 1.5px solid var(--border-soft);
}

/* ==================== SOLO END BANNER & MODAL & TOAST ==================== */
.solo-end-banner {
  width: 100%;
  background: var(--surface-subtle);
  border: 2px solid var(--primary-blue);
  border-radius: 24px;
  padding: 16px 20px;
  margin-bottom: 18px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.solo-end-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.solo-end-icon {
  font-size: 2rem;
}

.solo-end-actions {
  display: flex;
  gap: 10px;
}

.hidden {
  display: none !important;
}

.toast-container {
  position: fixed;
  top: 78px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  pointer-events: none;
}

.toast {
  background: #0F172A;
  color: #FFFFFF;
  padding: 12px 24px;
  border-radius: 999px;
  font-family: var(--font-display);
  font-weight: 700;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.28);
  border: 2px solid #38BDF8;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.modal-card {
  max-width: 480px;
  width: 100%;
}

.example-tiles-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 14px;
}

.ex-tile {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
  font-family: var(--font-display);
  font-weight: 700;
  flex-shrink: 0;
}

.ex-tile.correct { background: var(--color-correct); }
.ex-tile.present { background: var(--color-present); }
.ex-tile.absent  { background: var(--color-absent); }

@media (max-width: 860px) {
  .game-layout {
    grid-template-columns: 1fr;
  }
}
`;

fs.writeFileSync(HTML_PATH, NEW_INDEX_HTML, 'utf8');
fs.writeFileSync(CSS_PATH, NEW_STYLES_CSS, 'utf8');
console.log('✅ Blue Curved-Split WordChill UI (Light + Dark Mode) applied successfully!');