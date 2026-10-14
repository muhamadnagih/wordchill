const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_LENGTHS = [4, 5, 6, 7];

// Fallback starter dictionary in case words-en.json has not been generated yet
const FALLBACK_EN = {
  4: {
    answers: ['GAME', 'PLAY', 'WORD', 'TIME', 'FIRE', 'WIND', 'STAR', 'MOON', 'CODE', 'FAST', 'GOLD', 'HERO'],
    allowed: ['ABLE', 'ACID', 'AREA', 'ARMY', 'AWAY', 'BACK', 'BALL', 'BAND', 'BANK', 'BASE', 'BEAR', 'BEAT']
  },
  5: {
    answers: ['SPARK', 'CRANE', 'SLATE', 'AUDIO', 'FLAME', 'BRAVE', 'CLOUD', 'DREAM', 'GHOST', 'LIGHT', 'OCEAN'],
    allowed: ['ABOUT', 'ABOVE', 'ACTOR', 'ADMIT', 'ADOPT', 'AFTER', 'AGAIN', 'AGENT', 'AGREE', 'AHEAD', 'ALARM']
  },
  6: {
    answers: ['PLANET', 'ROCKET', 'CASTLE', 'BRIDGE', 'SILVER', 'FOREST', 'GARDEN', 'ISLAND', 'JUNGLE', 'LEGEND'],
    allowed: ['ACCEPT', 'ACCESS', 'ACROSS', 'ACTION', 'ACTIVE', 'ACTUAL', 'ADVICE', 'AFFECT', 'ALMOST', 'ALWAYS']
  },
  7: {
    answers: ['DIAMOND', 'JOURNEY', 'KINGDOM', 'MYSTERY', 'THUNDER', 'VICTORY', 'FREEDOM', 'HARMONY', 'CAPTAIN'],
    allowed: ['ABILITY', 'ABSENCE', 'ACADEMY', 'ACCOUNT', 'ACHIEVE', 'ACQUIRE', 'ADDRESS', 'ADVANCE', 'ALREADY']
  }
};

function loadEnglishDictionary() {
  const jsonPath = path.join(__dirname, 'data', 'words-en.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      console.log('📚 Loaded expanded English dictionary from server/data/words-en.json');
      return parsed;
    } catch (err) {
      console.warn('⚠️ Failed to parse words-en.json, using fallback dictionary:', err.message);
    }
  }
  return FALLBACK_EN;
}

const DICTIONARIES = {
  en: loadEnglishDictionary()
};

// Build O(1) lookup Sets in memory at startup
const VALID_SETS = {};
for (const [lang, lengths] of Object.entries(DICTIONARIES)) {
  VALID_SETS[lang] = {};
  for (const [len, lists] of Object.entries(lengths)) {
    const numLen = Number(len);
    const cleanAnswers = (lists.answers || [])
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length === numLen);
    const cleanAllowed = (lists.allowed || [])
      .map(w => w.trim().toUpperCase())
      .filter(w => w.length === numLen);

    lists.answers = cleanAnswers;
    VALID_SETS[lang][numLen] = new Set([...cleanAnswers, ...cleanAllowed]);
  }
}

function getSecretWord(wordLength = 5, lang = 'en', excludeWord = null) {
  const len = Number(wordLength);
  const langDict = DICTIONARIES[lang];
  if (!langDict || !langDict[len] || langDict[len].answers.length === 0) {
    throw new Error(`Unsupported word length (${len}) or language (${lang}).`);
  }

  const answers = langDict[len].answers;
  const candidates = excludeWord && answers.length > 1
    ? answers.filter(w => w !== excludeWord)
    : answers;

  const randomIndex = crypto.randomInt(0, candidates.length);
  return candidates[randomIndex];
}

function isValidWord(word, wordLength, lang = 'en') {
  if (!word || typeof word !== 'string') return false;
  const normalized = word.trim().toUpperCase();
  if (normalized.length !== Number(wordLength)) return false;
  if (!/^[A-Z]+$/.test(normalized)) return false;

  const validSet = VALID_SETS[lang]?.[Number(wordLength)];
  return validSet ? validSet.has(normalized) : false;
}

module.exports = {
  getSecretWord,
  isValidWord,
  SUPPORTED_LENGTHS
};