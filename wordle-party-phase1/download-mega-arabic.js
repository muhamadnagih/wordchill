const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'server', 'data');
const AR_JSON_PATH = path.join(DATA_DIR, 'words-ar.json');

// مصادر قواميس عربية عملاقة ومفتوحة المصدر
const SOURCES = {
    // 1. أشهر 50 ألف كلمة عربية مرتبة حسب نسبة الاستخدام الحقيقي (مع عدد مرات التكرار)
    frequency50k: 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/ar/ar_50k.txt',
    // 2. قاموس التدقيق الإملائي العربي الرسمي في LibreOffice (Ayaspell)
    libreOfficeDic: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master/ar/ar.dic'
};

function fetchUrl(url) {
    return new Promise((resolve) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve);
            }
            if (res.statusCode !== 200) {
                console.warn(`⚠️ Skipped ${url} (HTTP ${res.statusCode})`);
                return resolve('');
            }
            let raw = '';
            res.on('data', (chunk) => (raw += chunk));
            res.on('end', () => resolve(raw));
        }).on('error', () => resolve(''));
    });
}

function normalizeArabic(word) {
    if (!word) return '';
    return word
        .trim()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة التشكيل والمد (التطويل)
        .replace(/[أإآٱ]/g, 'ا'); // توحيد الألف
}

function isPureArabic(word) {
    return /^[\u0621-\u064A]+$/.test(word);
}

// توليد الصيغ الصرفية والضمائر والجموع للكلمات لضمان تغطية شاملة
function expandMorphology(stems) {
    const expanded = new Set();
    const prefixes = ['', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'بال', 'فال'];
    const suffixes = ['', 'ه', 'ة', 'ها', 'هم', 'كم', 'نا', 'ي', 'ك', 'ات', 'ون', 'ين', 'ان', 'وا', 'يه', 'ية'];

    for (const stem of stems) {
        expanded.add(stem);

        // معالجة الكلمات المنتهية بـ (ه / ة) عند إضافة اللواحق
        const baseVariants = [stem];
        if (stem.endsWith('ة') || stem.endsWith('ه')) {
            const withoutLast = stem.slice(0, -1);
            baseVariants.push(withoutLast + 'ه');
            baseVariants.push(withoutLast + 'ة');
            baseVariants.push(withoutLast + 'ت'); // مثل: مدرسة -> مدرستهم / مدرستنا
        }

        for (const base of baseVariants) {
            for (const pre of prefixes) {
                const withPre = pre + base;
                if (withPre.length >= 4 && withPre.length <= 7) {
                    expanded.add(withPre);
                }

                // عدم جمع (ال) التعريف مع ضمائر الملكية المتصلة
                if (!pre.includes('ال')) {
                    for (const suf of suffixes) {
                        const full = pre + base + suf;
                        if (full.length >= 4 && full.length <= 7) {
                            expanded.add(full);
                        }
                    }
                }
            }
        }
    }
    return expanded;
}

async function buildMegaArabicDictionary() {
    console.log('⏳ جاري تحميل القواميس العربية العملاقة (Frequency 50K + LibreOffice Arabic Dictionary)...');

    const [freqRaw, dicRaw] = await Promise.all([
        fetchUrl(SOURCES.frequency50k),
        fetchUrl(SOURCES.libreOfficeDic)
    ]);

    const dictionary = {
        4: { answers: [], allowed: [] },
        5: { answers: [], allowed: [] },
        6: { answers: [], allowed: [] },
        7: { answers: [], allowed: [] }
    };

    const answerSets = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };
    const allStemsForExpansion = new Set();

    // 1. تحليل ملف الترددات (مرتب من الأكثر شيوعاً إلى الأقل)
    // الصيغة في الملف: "الكلمة 145230"
    const freqLines = freqRaw.split(/\r?\n/);
    for (const line of freqLines) {
        const [rawWord] = line.trim().split(/\s+/);
        const word = normalizeArabic(rawWord);
        if (!word || !isPureArabic(word)) continue;

        if (word.length >= 3 && word.length <= 7) {
            allStemsForExpansion.add(word);
        }

        const len = word.length;
        if ([4, 5, 6, 7].includes(len)) {
            // نأخذ أول 2500 كلمة شائعة لكل طول لتكون هي الكلمات السرية (Answers)
            if (answerSets[len].size < 2500 && !answerSets[len].has(word)) {
                answerSets[len].add(word);
                dictionary[len].answers.push(word);
            }
        }
    }

    // 2. تحليل معجم LibreOffice (الصيغة: "كلمة/رموز_صرفية")
    const dicLines = dicRaw.split(/\r?\n/);
    for (const line of dicLines) {
        const rawWord = line.split('/')[0];
        const word = normalizeArabic(rawWord);
        if (!word || !isPureArabic(word)) continue;

        if (word.length >= 3 && word.length <= 7) {
            allStemsForExpansion.add(word);
        }
    }

    console.log(`🔄 جاري توليد التصريفات والجموع والضمائر من ${allStemsForExpansion.size.toLocaleString()} جذر وكلمة...`);
    const megaAllowedPool = expandMorphology(allStemsForExpansion);

    // 3. توزيع كل الكلمات المولدة على الأطوال 4 و 5 و 6 و 7
    for (const word of megaAllowedPool) {
        const len = word.length;
        if ([4, 5, 6, 7].includes(len) && !answerSets[len].has(word)) {
            dictionary[len].allowed.push(word);
        }
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AR_JSON_PATH, JSON.stringify(dictionary), 'utf8');

    console.log('\n✅ تم بناء القاموس العربي العملاق بنجاح في: server/data/words-ar.json');
    let grandTotal = 0;
    for (const len of [4, 5, 6, 7]) {
        const aCount = dictionary[len].answers.length;
        const total = aCount + dictionary[len].allowed.length;
        grandTotal += total;
        console.log(`   • ${len} حروف: ${aCount.toLocaleString()} كلمة سرية شائعة | ${total.toLocaleString()} كلمة مقبولة في التخمين`);
    }
    console.log(`📚 إجمالي الكلمات العربية المتاحة في اللعبة الآن: ${grandTotal.toLocaleString()} كلمة!`);
}

buildMegaArabicDictionary().catch((err) => {
    console.error('❌ خطأ أثناء بناء القاموس:', err);
}