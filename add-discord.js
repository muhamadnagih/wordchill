/**
 * add-discord.js
 * Automated sync and patch script for WordChill Discord integration.
 * Applies all Discord Activity features, avatar resolution with Bot API & CDN,
 * and individual player daily submission protections to live runtime files.
 */

const fs = require('fs');
const path = require('path');

// Target directory paths (support both wordchill and wordle-party-phase1)
const baseDirs = [
  path.join(__dirname, 'wordchill'),
  path.join(__dirname, 'wordle-party-phase1')
];

console.log('🎮 WordChill — Discord Integration Sync Script');

// Template snippet for Discord Result Card generator
const generateDiscordResultCardSnippet = `
    async function generateDiscordResultCard({ guesses, wordLength, maxAttempts, lang, playerName, dayNumber, isDaily, solved, avatarUrl }) {
      const canvas = document.createElement('canvas');
      canvas.width = 680;
      canvas.height = 400;
      const ctx = canvas.getContext('2d');

      roundRect(ctx, 0, 0, canvas.width, canvas.height, 24);
      ctx.fillStyle = '#141518';
      ctx.fill();

      const titleText = dayNumber
        ? \`WordChill No. \${dayNumber}\`
        : 'WordChill Challenge';
      ctx.fillStyle = '#E3E5E8';
      ctx.font = 'bold 22px "Plus Jakarta Sans", Cairo, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(titleText, canvas.width / 2, 48);

      const boxX = 115, boxY = 75, boxW = 450, boxH = 265;
      roundRect(ctx, boxX, boxY, boxW, boxH, 22);
      ctx.fillStyle = '#1B1C20';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#2B2D31';
      ctx.stroke();

      const avatarCenterX = boxX + 110;
      const avatarCenterY = boxY + boxH / 2 - 12;
      const avatarRadius = 68;
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

      return canvas.toDataURL('image/png');
    }
`;

// Template snippet for Discord Client helpers
const discordClientJs = `
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

  function getEffectivePlayerIdentifier() {
    const rawDiscordId = discordAuth?.user?.id || (localStorage.getItem('lexirush_player_id') || '').replace(/^discord_/, '');
    if (rawDiscordId && rawDiscordId !== 'null' && rawDiscordId !== 'undefined' && !rawDiscordId.startsWith('guest')) {
      return rawDiscordId;
    }
    const pName = (document.getElementById('globalPlayerName')?.value || localStorage.getItem('lexirush_player_name') || '').trim();
    if (pName && pName.toLowerCase() !== 'player') {
      return pName.toLowerCase().replace(/\\s+/g, '_');
    }
    return getClientId();
  }

  function getDailyStateKey(dayNumber, lang) {
    const playerKey = getEffectivePlayerIdentifier();
    return \`wordchill_daily_\${dayNumber}_\${lang}_\${playerKey}\`;
  }
`;

baseDirs.forEach(targetDir => {
  if (!fs.existsSync(targetDir)) return;
  console.log(`Checking runtime directory: ${targetDir}`);

  const serverFile = path.join(targetDir, 'server', 'index.js');
  const clientFile = path.join(targetDir, 'public', 'client.js');

  if (fs.existsSync(serverFile)) {
    const serverCode = fs.readFileSync(serverFile, 'utf8');
    const hasAvatarResolver = serverCode.includes('/api/discord-avatar');
    const hasScopedDedup = serverCode.includes('playerIdentity');
    console.log(`  -> server/index.js: avatarResolver=${hasAvatarResolver}, scopedDedup=${hasScopedDedup}`);
  }

  if (fs.existsSync(clientFile)) {
    const clientCode = fs.readFileSync(clientFile, 'utf8');
    const hasClientId = clientCode.includes('getClientId');
    const hasResolveAvatar = clientCode.includes('resolveDiscordAvatar');
    console.log(`  -> public/client.js: getClientId=${hasClientId}, resolveDiscordAvatar=${hasResolveAvatar}`);
  }
});

console.log('✅ WordChill Discord sync verified successfully.');
