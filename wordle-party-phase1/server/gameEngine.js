const { normalizeWord } = require('./dictionary');

function evaluateGuess(guess, secret, lang = 'en') {
  const normalizedGuess = normalizeWord(guess, lang);
  const normalizedSecret = normalizeWord(secret, lang);

  if (normalizedGuess.length !== normalizedSecret.length) {
    throw new Error(`Guess length (${normalizedGuess.length}) must match secret length (${normalizedSecret.length}).`);
  }

  const length = normalizedSecret.length;
  const result = new Array(length);
  const remainingCounts = {};

  // مطابقة مرنة للتاء المربوطة والهاء في نهاية الكلمة العربية حتى لا يخسر اللاعب بسبب فرق (ة / ه)
  const isSameChar = (a, b) => {
    if (a === b) return true;
    if (lang === 'ar' && ((a === 'ه' && b === 'ة') || (a === 'ة' && b === 'ه'))) return true;
    return false;
  };

  const canonicalKey = (ch) => {
    if (lang === 'ar' && ch === 'ة') return 'ه';
    return ch;
  };

  for (let i = 0; i < length; i++) {
    const gChar = normalizedGuess[i];
    const sChar = normalizedSecret[i];

    if (isSameChar(gChar, sChar)) {
      result[i] = { letter: gChar, state: 'correct' };
    } else {
      const k = canonicalKey(sChar);
      remainingCounts[k] = (remainingCounts[k] || 0) + 1;
    }
  }

  for (let i = 0; i < length; i++) {
    if (result[i]) continue;
    const gChar = normalizedGuess[i];
    const k = canonicalKey(gChar);
    if (remainingCounts[k] && remainingCounts[k] > 0) {
      result[i] = { letter: gChar, state: 'present' };
      remainingCounts[k] -= 1;
    } else {
      result[i] = { letter: gChar, state: 'absent' };
    }
  }

  return result;
}

module.exports = { evaluateGuess };
