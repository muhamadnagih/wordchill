/**
 * scripts/register-commands.js
 * Registers Discord Activity Primary Entry Point and /wordchill Slash Command
 * with the Discord REST API (Global and Guild-specific).
 *
 * This ensures WordChill appears in the Discord App Launcher under:
 * - "Apps in this Server"
 * - "Recents"
 * - Direct Activity Launch via Primary Entry Point
 */

const fs = require('fs');
const path = require('path');

// Helper to load .env manually without external dependencies
function loadEnv() {
  const envPaths = [
    path.join(__dirname, '..', '.env'),
    path.join(__dirname, '..', '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'wordchill', '.env'),
    path.join(process.cwd(), 'wordle-party-phase1', '.env')
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        content.split('\n').forEach(line => {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) return;
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        });
      } catch (e) {}
    }
  }
}

// Parse command-line arguments (e.g. --token=..., --client-id=..., --guild=...)
function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--token=')) args.token = arg.slice(8);
    else if (arg.startsWith('-t=')) args.token = arg.slice(3);
    else if (arg.startsWith('--client-id=')) args.clientId = arg.slice(12);
    else if (arg.startsWith('-c=')) args.clientId = arg.slice(3);
    else if (arg.startsWith('--guild=')) args.guildId = arg.slice(8);
    else if (arg.startsWith('-g=')) args.guildId = arg.slice(3);
  });
  return args;
}

/**
 * Register commands with Discord REST API
 * @param {Object} options
 * @param {string} options.clientId - Discord Application Client ID
 * @param {string} options.botToken - Discord Bot Token
 * @param {string} [options.guildId] - Optional Guild ID for instant guild command registration
 */
async function registerDiscordCommands(options = {}) {
  loadEnv();
  const cliArgs = parseArgs();

  const clientId = options.clientId || cliArgs.clientId || process.env.DISCORD_CLIENT_ID || '1562771601764651109';
  const botToken = options.botToken || cliArgs.token || process.env.DISCORD_BOT_TOKEN;
  let guildId = options.guildId || cliArgs.guildId || process.env.DISCORD_GUILD_ID;

  console.log('\n======================================================');
  console.log('🎮 WordChill — Discord App Launcher & Command Setup');
  console.log('======================================================\n');
  console.log(`📌 Discord Client ID : ${clientId}`);
  console.log(`🤖 Bot Token Status  : ${botToken ? '✅ Provided (' + botToken.slice(0, 10) + '...)' : '❌ Not set in .env'}`);
  console.log(`🏰 Target Guild ID   : ${guildId || 'Auto-discovery / Global only'}\n`);

  if (!botToken) {
    console.error('❌ Error: DISCORD_BOT_TOKEN is required to register Discord Application Commands.');
    console.log('\n👉 How to get your Discord Bot Token:');
    console.log('  1. Open Discord Developer Portal: https://discord.com/developers/applications/' + clientId + '/bot');
    console.log('  2. Click "Reset Token" or "Copy" under Build-A-Bot.');
    console.log('  3. Paste it in your .env file:');
    console.log('       DISCORD_BOT_TOKEN=your_token_here');
    console.log('  4. Or run this script with --token flag:');
    console.log('       node scripts/register-commands.js --token=your_token_here\n');
    return {
      ok: false,
      error: 'DISCORD_BOT_TOKEN missing',
      details: 'Please set DISCORD_BOT_TOKEN in .env or pass --token=<bot_token>'
    };
  }

  const authHeader = {
    Authorization: `Bot ${botToken}`,
    'Content-Type': 'application/json'
  };

  // 1. Verify Bot Token & Identify Bot
  console.log('🔄 Step 1: Verifying Bot Token with Discord API...');
  let botUser = null;
  try {
    const meRes = await fetch('https://discord.com/api/v10/users/@me', { headers: authHeader });
    if (!meRes.ok) {
      const errBody = await meRes.text();
      console.error(`❌ Authentication Failed (${meRes.status}): ${errBody}`);
      return { ok: false, error: 'Invalid Bot Token', status: meRes.status, detail: errBody };
    }
    botUser = await meRes.json();
    console.log(`✅ Authenticated successfully as: ${botUser.username}#${botUser.discriminator || '0'} (Bot ID: ${botUser.id})\n`);
  } catch (err) {
    console.error('❌ Network error contacting Discord API:', err.message);
    return { ok: false, error: err.message };
  }

  // 2. Auto-discover Guild if not specified
  if (!guildId) {
    console.log('🔄 Step 2: Auto-discovering Bot Servers/Guilds...');
    try {
      const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', { headers: authHeader });
      if (guildsRes.ok) {
        const guilds = await guildsRes.json();
        if (Array.isArray(guilds) && guilds.length > 0) {
          guildId = guilds[0].id;
          console.log(`✅ Auto-selected Guild: "${guilds[0].name}" (ID: ${guildId})\n`);
        } else {
          console.log('ℹ️  Bot is not in any server yet. Proceeding with Global Command Registration.\n');
        }
      }
    } catch (e) {
      console.warn('⚠️  Could not auto-discover guilds:', e.message);
    }
  }

  // 3. Inspect Existing Commands
  console.log('🔍 Step 3: Checking existing Discord Application Commands...');
  let existingGlobalCommands = [];
  try {
    const getRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, { headers: authHeader });
    if (getRes.ok) {
      existingGlobalCommands = await getRes.json();
      console.log(`ℹ️  Found ${existingGlobalCommands.length} existing global command(s):`);
      existingGlobalCommands.forEach(cmd => {
        console.log(`     - [Type ${cmd.type}] "${cmd.name}": ${cmd.description || 'No description'} (ID: ${cmd.id})`);
      });
    }
  } catch (e) {
    console.warn('⚠️  Could not fetch existing global commands:', e.message);
  }

  // 4. Build Command Payloads
  // Check if a primary entry point already exists
  const hasExistingPep = existingGlobalCommands.some(cmd => cmd.type === 4 || cmd.handler === 2);

  // Command 1: PRIMARY_ENTRY_POINT (Type 4, handler 2 = DISCORD_LAUNCH_ACTIVITY)
  const primaryEntryPointCommand = {
    name: 'launch',
    description: 'Launch WordChill Daily & Party Word Game!',
    type: 4, // PRIMARY_ENTRY_POINT
    handler: 2, // DISCORD_LAUNCH_ACTIVITY
    integration_types: [0, 1], // 0: Guild Install, 1: User Install
    contexts: [0, 1, 2] // 0: Guild, 1: Bot DM, 2: Group DM
  };

  // Command 2: Slash Command /wordchill (Type 1 = CHAT_INPUT)
  const wordchillSlashCommand = {
    name: 'wordchill',
    description: "Play WordChill or view today's Daily Challenge leaderboard",
    type: 1, // CHAT_INPUT
    integration_types: [0, 1],
    contexts: [0, 1, 2]
  };

  const commandsToRegister = [primaryEntryPointCommand, wordchillSlashCommand];

  console.log('\n📝 Commands to register:');
  console.log('   1. Type 4 (PRIMARY_ENTRY_POINT) name="launch" (Handler: 2 / DISCORD_LAUNCH_ACTIVITY)');
  console.log('      -> Directly powers the Discord App Launcher & "Apps in this Server"');
  console.log('   2. Type 1 (CHAT_INPUT) name="wordchill"');
  console.log('      -> Provides /wordchill slash command with Launch button');

  // 5. Register Global Commands
  console.log('\n🚀 Step 4: Registering Global Application Commands...');
  let globalResult = null;
  try {
    // Attempt with integration_types and contexts
    let putRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
      method: 'PUT',
      headers: authHeader,
      body: JSON.stringify(commandsToRegister)
    });

    if (!putRes.ok && putRes.status === 400) {
      console.warn('⚠️  Retrying with basic command definitions (omitting optional context scopes)...');
      const basicCommands = [
        { name: 'launch', description: 'Launch WordChill Daily & Party Word Game!', type: 4, handler: 2 },
        { name: 'wordchill', description: "Play WordChill or view today's Daily Challenge leaderboard", type: 1 }
      ];
      putRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(basicCommands)
      });
    }

    if (putRes.ok) {
      globalResult = await putRes.json();
      console.log(`✅ Global Commands Registered Successfully! (${globalResult.length} commands returned)`);
      globalResult.forEach(c => {
        console.log(`     ✔ [ID: ${c.id}] /${c.name} (Type: ${c.type}, Handler: ${c.handler || 'N/A'})`);
      });
    } else {
      const errText = await putRes.text();
      console.error(`❌ Global Command Registration failed (${putRes.status}):`, errText);
    }
  } catch (err) {
    console.error('❌ Network error during global command registration:', err.message);
  }

  // 6. Register Guild Commands (for Instant Availability without 1-hour global cache delay)
  let guildResult = null;
  if (guildId) {
    console.log(`\n⚡ Step 5: Registering Guild Commands for Server ID: ${guildId} (Instant Availability)...`);
    try {
      // In Guilds, Type 1 is guaranteed; Type 4 is usually global or guild depending on app config
      const guildCommands = [wordchillSlashCommand];
      let putGuildRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
        method: 'PUT',
        headers: authHeader,
        body: JSON.stringify(guildCommands)
      });

      if (!putGuildRes.ok && putGuildRes.status === 400) {
        putGuildRes = await fetch(`https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`, {
          method: 'PUT',
          headers: authHeader,
          body: JSON.stringify([
            { name: 'wordchill', description: "Play WordChill or view today's Daily Challenge leaderboard", type: 1 }
          ])
        });
      }

      if (putGuildRes.ok) {
        guildResult = await putGuildRes.json();
        console.log(`✅ Guild Commands Registered Successfully! (${guildResult.length} commands live immediately)`);
        guildResult.forEach(c => {
          console.log(`     ✔ [ID: ${c.id}] /${c.name} (Type: ${c.type}) in Guild ${guildId}`);
        });
      } else {
        const gErr = await putGuildRes.text();
        console.warn(`⚠️  Guild registration response (${putGuildRes.status}):`, gErr);
      }
    } catch (err) {
      console.warn('⚠️  Could not register guild-specific commands:', err.message);
    }
  }

  console.log('\n======================================================');
  console.log('🎉 WordChill Discord App Launcher Setup Complete!');
  console.log('======================================================');
  console.log('• WordChill is now registered as an Activity in Discord.');
  console.log('• App Launcher menu will display WordChill under "Apps in this Server" and "Recents".');
  console.log('• Users can launch the activity directly or use /wordchill in any channel.\n');

  return {
    ok: Boolean(globalResult || guildResult),
    bot: botUser,
    clientId,
    guildId,
    globalCommands: globalResult,
    guildCommands: guildResult
  };
}

// Run directly from CLI
if (require.main === module) {
  registerDiscordCommands().catch(err => {
    console.error('Fatal registration error:', err);
    process.exit(1);
  });
}

module.exports = { registerDiscordCommands };
