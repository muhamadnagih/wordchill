const fs = require('fs');
const path = require('path');
const https = require('https');

// 1. Common everyday English words (no swears) -> Used for fair Secret Answers
const COMMON_WORDS_URL =
    'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';

// 2. Comprehensive English dictionary (~275k words) -> Used for Valid Player Guesses
const FULL_DICT_URL =
    'https://raw.githubusercontent.com/lorenbrichter/Words/master/Words/en.txt';

const OUTPUT_PATH = path.join(__dirname, 'server', 'data', 'words-en.json');
const SUPPORTED_LENGTHS = [4, 5, 6, 7];

function fetchText(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                return reject(new Error(`Failed to fetch ${url} (Status: ${res.statusCode})`));
            }
            let data = '';
            res.on('data', chunk => (data += chunk));
            res.on('end', () => resolve(data));
        }).on('error', reject);
    });
}

function cleanWordList(rawText) {
    return rawText
        .split(/\r?\n/)
        .map(w => w.trim().toUpperCase())
        .filter(w => /^[A-Z]+$/.test(w) && SUPPORTED_LENGTHS.includes(w.length));
}

async function buildDictionary() {
    console.log('⏳ Downloading common answers & full English dictionary...');

    const [commonRaw, fullRaw] = await Promise.all([
        fetchText(COMMON_WORDS_URL),
        fetchText(FULL_DICT_URL)
    ]);

    const commonWords = cleanWordList(commonRaw);
    const fullWords = cleanWordList(fullRaw);
    const fullSet = new Set(fullWords);

    const dictionary = {
        4: { answers: [], allowed: [] },
        5: { answers: [], allowed: [] },
        6: { answers: [], allowed: [] },
        7: { answers: [], allowed: [] }
    };

    // Populate common secret answers (only if they also exist in the real dictionary to avoid typos/abbreviations)
    const answerSets = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };

    for (const word of commonWords) {
        const len = word.length;
        if (fullSet.has(word) && !answerSets[len].has(word)) {
            answerSets[len].add(word);
            dictionary[len].answers.push(word);
        }
    }

    // Populate remaining valid dictionary words into `allowed`
    const allowedSets = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };

    for (const word of fullWords) {
        const len = word.length;
        if (!answerSets[len].has(word) && !allowedSets[len].has(word)) {
            allowedSets[len].add(word);
            dictionary[len].allowed.push(word);
        }
    }

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(dictionary), 'utf8');

    console.log('\n✅ Dictionary built successfully at:', OUTPUT_PATH);
    for (const len of SUPPORTED_LENGTHS) {
        const aCount = dictionary[len].answers.length;
        const gCount = dictionary[len].allowed.length + aCount;
        console.log(`   • ${len} Letters: ${aCount.toLocaleString()} secret answers | ${gCount.toLocaleString()} total valid guesses`);
    }
}

buildDictionary().catch(err => {
    console.error('❌ Error building dictionary:', err.message);
    process.exit(1);
});