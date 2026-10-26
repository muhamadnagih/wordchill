const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_LENGTHS = [4, 5, 6, 7];
const SUPPORTED_LANGS = ['en', 'ar'];

function normalizeWord(word, lang = 'en') {
  if (!word || typeof word !== 'string') return '';
  if (lang === 'ar') {
    return word
      .trim()
      .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا');
  }
  return word.trim().toUpperCase();
}

const DICTIONARIES = {
  en: require('./data/words-en.json'),
  ar: require('./data/words-ar.json')
};

const VALID_SETS = { en: {}, ar: {} };
for (const lang of SUPPORTED_LANGS) {
  for (const len of SUPPORTED_LENGTHS) {
    const answers = (DICTIONARIES[lang]?.[len]?.answers || []).map(w => normalizeWord(w, lang));
    const allowed = (DICTIONARIES[lang]?.[len]?.allowed || []).map(w => normalizeWord(w, lang));
    if (DICTIONARIES[lang]?.[len]) {
      DICTIONARIES[lang][len].answers = answers;
    }
    const set = new Set([...answers, ...allowed]);
    // في العربي: قبول الكلمة سواء انتهت بـ (ة) أو (ه) أو (ى) أو (ي) في التخمينات
    if (lang === 'ar') {
      for (const w of [...set]) {
        if (w.endsWith('ه')) set.add(w.slice(0, -1) + 'ة');
        if (w.endsWith('ة')) set.add(w.slice(0, -1) + 'ه');
        if (w.endsWith('ى')) set.add(w.slice(0, -1) + 'ي');
        if (w.endsWith('ي')) set.add(w.slice(0, -1) + 'ى');
      }
    }
    VALID_SETS[lang][len] = set;
  }
}

function getSecretWord(wordLength = 5, lang = 'en', excludeWord = null) {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const len = Number(wordLength);
  const answers = DICTIONARIES[safeLang]?.[len]?.answers;
  if (!answers || answers.length === 0) {
    throw new Error(`Unsupported word length (${len}) or language (${safeLang})`);
  }
  const pool = excludeWord && answers.length > 1
    ? answers.filter(w => w !== excludeWord)
    : answers;
  return pool[crypto.randomInt(0, pool.length)];
}

function isValidWord(word, wordLength, lang = 'en') {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const normalized = normalizeWord(word, safeLang);
  if (normalized.length !== Number(wordLength)) return false;

  if (safeLang === 'ar') {
    if (!/^[\u0621-\u064A]+$/.test(normalized)) return false;
  } else {
    if (!/^[A-Z]+$/.test(normalized)) return false;
  }

  return VALID_SETS[safeLang]?.[Number(wordLength)]?.has(normalized) || false;
}

function getDailyNumber(date = new Date()) {
  const d = new Date(date);
  const utcToday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const anchor = Date.UTC(2025, 0, 1);
  return Math.max(1, Math.floor((utcToday - anchor) / 86400000) + 1);
}

function getDailyWord(dayNumber, wordLength = 5, lang = 'en') {
  const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
  const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
  const answers = DICTIONARIES[safeLang]?.[len]?.answers;
  if (!answers || answers.length === 0) {
    throw new Error(`Unsupported word length (${len}) or language (${safeLang})`);
  }
  const seedStr = `wordchill-daily-${dayNumber}-${safeLang}-${len}`;
  const hash = crypto.createHash('sha256').update(seedStr).digest();
  const index = hash.readUInt32BE(0) % answers.length;
  return answers[index];
}

function createChallengePayload({ secretWord, lang = 'en', wordLength = 5, maxAttempts = 6, challengerName = 'Challenger', challengerScore = 4, dayNumber = null }) {
  const payload = {
    w: Buffer.from(secretWord, 'utf8').toString('base64'),
    l: Number(wordLength),
    lg: lang,
    a: Number(maxAttempts),
    cn: String(challengerName || 'Friend').slice(0, 20),
    cs: Number(challengerScore) || 0,
    d: dayNumber ? Number(dayNumber) : null,
    t: Date.now()
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodeChallengePayload(token) {
  if (!token || typeof token !== 'string') return null;
  try {
    const raw = Buffer.from(token.trim(), 'base64url').toString('utf8');
    const p = JSON.parse(raw);
    if (!p.w || !p.l) return null;
    const word = Buffer.from(p.w, 'base64').toString('utf8');
    return {
      secretWord: word,
      wordLength: Number(p.l),
      lang: p.lg || 'en',
      maxAttempts: Number(p.a) || 6,
      challengerName: p.cn || 'Challenger',
      challengerScore: Number(p.cs) || 0,
      dayNumber: p.d || null
    };
  } catch (e) {
    return null;
  }
}

module.exports = {
  getSecretWord,
  getDailyWord,
  getDailyNumber,
  createChallengePayload,
  decodeChallengePayload,
  isValidWord,
  normalizeWord,
  SUPPORTED_LENGTHS,
  SUPPORTED_LANGS
};

