/**
 * Evaluates a guess against the secret word using the official Wordle two-pass algorithm.
 * Works dynamically for any word length (4 to 7 letters).
 */
function evaluateGuess(guess, secret) {
  const normalizedGuess = guess.trim().toUpperCase();
  const normalizedSecret = secret.trim().toUpperCase();

  if (normalizedGuess.length !== normalizedSecret.length) {
    throw new Error(`Guess length (${normalizedGuess.length}) must match secret length (${normalizedSecret.length}).`);
  }

  const length = normalizedSecret.length;
  const result = new Array(length);
  const remainingCounts = {};

  // Pass 1: Exact matches ('correct' / Green)
  for (let i = 0; i < length; i++) {
    const gChar = normalizedGuess[i];
    const sChar = normalizedSecret[i];

    if (gChar === sChar) {
      result[i] = { letter: gChar, state: 'correct' };
    } else {
      remainingCounts[sChar] = (remainingCounts[sChar] || 0) + 1;
    }
  }

  // Pass 2: Misplaced ('present' / Yellow) vs Absent ('absent' / Gray)
  for (let i = 0; i < length; i++) {
    if (result[i]) continue;

    const gChar = normalizedGuess[i];
    if (remainingCounts[gChar] && remainingCounts[gChar] > 0) {
      result[i] = { letter: gChar, state: 'present' };
      remainingCounts[gChar] -= 1;
    } else {
      result[i] = { letter: gChar, state: 'absent' };
    }
  }

  return result;
}

module.exports = { evaluateGuess };
