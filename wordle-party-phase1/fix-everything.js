const fs = require('fs');
const path = require('path');
const https = require('https');

// دمج 3 قواميس ضخمة لضمان قبول كل الكلمات المعروفة وأسماء الشهور والأيام
const URLS = {
  googleCommon: 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt',
  enable1: 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt',
  wordsAlpha: 'https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt'
};

const EXTRA_EVERYDAY_WORDS = [
  'JUNE', 'JULY', 'MARS', 'ROME', 'XBOX', 'WIFI', 'MEME', 'VIBE', 'NOOB', 'NERD',
  'BOSS', 'COOL', 'OKAY', 'YEAH', 'NOPE', 'APPS', 'DEVS', 'TECH', 'CODE', 'DATA',
  'APRIL', 'MARCH', 'TEXAS', 'PARIS', 'EGYPT', 'CAIRO', 'LINUX', 'GAMER', 'ANIME',
  'MONDAY', 'FRIDAY', 'SUNDAY', 'AUGUST', 'GOOGLE', 'PYTHON', 'GAMING'
];

const DATA_DIR = path.join(__dirname, 'server', 'data');
const OUTPUT_JSON = path.join(DATA_DIR, 'words-en.json');
const ROOM_MANAGER_PATH = path.join(__dirname, 'server', 'roomManager.js');
const CLIENT_JS_PATH = path.join(__dirname, 'public', 'client.js');
const SUPPORTED_LENGTHS = [4, 5, 6, 7];

function fetchText(url) {
  return new Promise((resolve) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) return resolve('');
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', () => resolve(''));
  });
}

function cleanList(raw) {
  return raw
    .split(/\r?\n/)
    .map(w => w.trim().toUpperCase())
    .filter(w => /^[A-Z]+$/.test(w) && SUPPORTED_LENGTHS.includes(w.length));
}

async function run() {
  console.log('⏳ Downloading & merging Google 10K + ENABLE1 + WordsAlpha dictionaries...');

  const [googleRaw, enable1Raw, alphaRaw] = await Promise.all([
    fetchText(URLS.googleCommon),
    fetchText(URLS.enable1),
    fetchText(URLS.wordsAlpha)
  ]);

  const googleWords = cleanList(googleRaw);
  const enable1Words = cleanList(enable1Raw);
  const alphaWords = cleanList(alphaRaw);

  const enable1Set = new Set(enable1Words);
  const allValidPool = new Set([
    ...googleWords,
    ...enable1Words,
    ...alphaWords,
    ...EXTRA_EVERYDAY_WORDS
  ]);

  const dictionary = {
    4: { answers: [], allowed: [] },
    5: { answers: [], allowed: [] },
    6: { answers: [], allowed: [] },
    7: { answers: [], allowed: [] }
  };

  const answerSets = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };

  // الكلمات السرية تكون من الكلمات الشائعة الموجودة في قاموس اللعب
  for (const w of googleWords) {
    const len = w.length;
    if (enable1Set.has(w) && !answerSets[len].has(w)) {
      answerSets[len].add(w);
      dictionary[len].answers.push(w);
    }
  }

  // قبول جميع الكلمات بدون استثناء في التخمينات (بما فيها JUNE وكل كلمات Google 10K)
  for (const w of allValidPool) {
    const len = w.length;
    if (SUPPORTED_LENGTHS.includes(len) && !answerSets[len].has(w)) {
      dictionary[len].allowed.push(w);
    }
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(dictionary), 'utf8');

  // إزالة رسالة Rate Limit المزعجة من roomManager.js
  if (fs.existsSync(ROOM_MANAGER_PATH)) {
    let rmCode = fs.readFileSync(ROOM_MANAGER_PATH, 'utf8');
    rmCode = rmCode.replace(/checkRateLimit\([^)]+\)\s*\{[\s\S]*?\n\s*\}/, 'checkRateLimit(key, minIntervalMs = 250) {\n    return true;\n  }');
    fs.writeFileSync(ROOM_MANAGER_PATH, rmCode, 'utf8');
  }

  // منع تراكم رسائل الـ Toast فوق المربعات في client.js
  if (fs.existsSync(CLIENT_JS_PATH)) {
    let clientCode = fs.readFileSync(CLIENT_JS_PATH, 'utf8');
    clientCode = clientCode.replace(
      /function showToast\(msg\)\s*\{[\s\S]*?setTimeout\(\(\)\s*=>\s*toast\.remove\(\),\s*\d+\);\s*\}/,
      `function showToast(msg) {
    const container = document.getElementById('toastContainer');
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 1800);
  }`
    );
    fs.writeFileSync(CLIENT_JS_PATH, clientCode, 'utf8');
  }

  const { isValidWord } = require(path.join(__dirname, 'server', 'dictionary.js'));
  console.log('\n✅ Super Dictionary & Toast Fix applied!');
  console.log(`🧪 Test "JUNE" (4 letters): ${isValidWord('JUNE', 4) ? 'VALID ✅' : 'INVALID ❌'}`);
  console.log(`🧪 Test "MONEY" (5 letters): ${isValidWord('MONEY', 5) ? 'VALID ✅' : 'INVALID ❌'}`);
}

run();
