const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, 'server', 'data');
const AR_JSON_PATH = path.join(DATA_DIR, 'words-ar.json');

// دالة تطبيع الكلمات العربية (توحيد الألف وإزالة التشكيل)
function normalizeArabic(word) {
    if (!word) return '';
    return word
        .trim()
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // إزالة التشكيل والمد
        .replace(/[أإآٱ]/g, 'ا') // توحيد الألف
        .replace(/ؤ/g, 'ؤ')
        .replace(/ئ/g, 'ئ');
}

// قائمة ضخمة من الكلمات العربية الشائعة والواضحة (3 إلى 7 حروف) لبناء الكلمات السرية والتخمينات
const BASE_ARABIC_WORDS = [
    // جذور وكلمات ثلاثية لتوليد كلمات بـ (ال) والضمائر (مثل: البيت، القمر، الشمس، الكتاب)
    'بيت', 'قمر', 'شمس', 'بحر', 'نهر', 'جبل', 'شجر', 'ورد', 'زهر', 'نجم', 'سهم', 'قلم', 'علم', 'عمل', 'امل',
    'وطن', 'زمن', 'وقت', 'صوت', 'ضوء', 'نور', 'نار', 'ريح', 'مطر', 'ثلج', 'برق', 'رعد', 'غيم', 'صبح', 'ليل',
    'يوم', 'شهر', 'عام', 'عمر', 'قلب', 'عقل', 'عين', 'وجه', 'راس', 'شعر', 'كتف', 'صدر', 'ظهر', 'بطن', 'قدم',
    'كلب', 'قطه', 'اسد', 'نمر', 'فيل', 'جمل', 'فرس', 'حوت', 'سمك', 'طير', 'صقر', 'نسر', 'غزل', 'ذئب', 'ثعلب',
    'خبز', 'لحم', 'سمك', 'ملح', 'سكر', 'عسل', 'لبن', 'جبن', 'زيت', 'تمور', 'عنب', 'تين', 'خوخ', 'موز', 'توت',
    'ذهب', 'فضه', 'حجر', 'رمل', 'طين', 'خشب', 'حديد', 'نحاس', 'زجاج', 'ورق', 'حبل', 'سيف', 'درع', 'قوس', 'رمح',
    'ملك', 'امير', 'وزير', 'قائد', 'جند', 'شعب', 'ناس', 'رجل', 'طفل', 'ولد', 'بنت', 'اخو', 'اخت', 'صديق', 'جار',
    'باب', 'سور', 'سطح', 'غرفه', 'مطبخ', 'قصر', 'برج', 'جسر', 'طريق', 'شارع', 'سوق', 'محل', 'مصنع', 'مزرعه',
    'كتب', 'درس', 'لعب', 'فهم', 'عرف', 'سمع', 'نظر', 'حفظ', 'نجح', 'فاز', 'ربح', 'خسر', 'بدا', 'وصل', 'رجع',

    // كلمات رباعية شائعة (4 Letters Secret Answers)
    'كتاب', 'مكتب', 'ملعب', 'مسجد', 'معبد', 'متحف', 'مسرح', 'مطار', 'قطار', 'مسار', 'جدار', 'ستار', 'حوار', 'قرار',
    'نهار', 'بحار', 'انهار', 'اشجار', 'ازهار', 'اطيار', 'امطار', 'رياح', 'صباح', 'مساء', 'سماء', 'فضاء', 'هواء', 'دواء',
    'غذاء', 'شتاء', 'ربيع', 'خريف', 'نجوم', 'غيوم', 'شموع', 'دموع', 'قلوب', 'عقول', 'عيون', 'وجوه', 'روس', 'ايام',
    'شهور', 'عصور', 'طيور', 'صقور', 'نسور', 'اسود', 'نمور', 'خيول', 'جمال', 'غزلان', 'اسماك', 'حيتان', 'ديدان',
    'تفاح', 'برتقال', 'ليمون', 'زيتون', 'بطيخ', 'شمام', 'مانجو', 'فراوله', 'رمان', 'مشمش', 'برقوق', 'اناناس',
    'جزر', 'خيار', 'طماطم', 'بطاطس', 'بصل', 'ثوم', 'فلفل', 'نعناع', 'بقدونس', 'سبانخ', 'ملفوف', 'كرنب', 'عدس',
    'قمح', 'شعير', 'ذره', 'ارز', 'فول', 'حمص', 'قهوه', 'شاي', 'عصير', 'حليب', 'زبادي', 'قشطه', 'زبد',
    'غرفه', 'صاله', 'شرفه', 'شباك', 'مفتاح', 'مصباح', 'سرير', 'وساده', 'سجاده', 'ستاره', 'خزانه', 'طاوله', 'كرسي',
    'كنبه', 'مراه', 'لوحه', 'ساعه', 'هاتف', 'تلفاز', 'مذياع', 'حاسوب', 'شاشه', 'فاره', 'لوحه', 'طابعه', 'سماعه',
    'قميص', 'بنطال', 'معطف', 'فستان', 'حذاء', 'جورب', 'قبعه', 'نظاره', 'حقيبه', 'محفظه', 'خاتم', 'سوار', 'قلاده',
    'طبيب', 'مهندس', 'معلم', 'مدرس', 'طالب', 'كاتب', 'شاعر', 'فنان', 'رسام', 'ممثل', 'مخرج', 'مصور', 'صحفي',
    'محامي', 'قاضي', 'ضابط', 'شرطي', 'جندي', 'طيار', 'بحار', 'تاجر', 'زارع', 'فلاح', 'نجار', 'حداد', 'خباز',
    'سائق', 'حارس', 'مدير', 'رئيس', 'وزير', 'سفير', 'امير', 'سلطان', 'فارس', 'بطل', 'لاعب', 'حكم', 'مدرب',
    'فريق', 'نادي', 'مباراه', 'بطوله', 'كاس', 'وسام', 'جائزه', 'هديه', 'حفله', 'رحله', 'نزهة', 'سفره', 'اجازه',
    'فكره', 'خطه', 'هدف', 'حلم', 'امنيه', 'قصه', 'روايه', 'حكايه', 'مقال', 'خبر', 'رساله', 'عنوان', 'صفحه',
    'كلمه', 'جمله', 'حرف', 'لغه', 'لهجه', 'صوت', 'نغمه', 'لحن', 'اغنيه', 'موسيقى', 'لوحه', 'صوره', 'تمثال',
    'مدينه', 'قريه', 'عاصمه', 'دوله', 'مملكه', 'اماره', 'اقليم', 'جزيره', 'صحراء', 'غابه', 'واحه', 'حديقه', 'بستان',
    'ميناء', 'مناره', 'سفينه', 'قارب', 'مركب', 'زورق', 'غواصه', 'طائره', 'مروحيه', 'صاروخ', 'مركبه', 'سياره', 'شاحنه',
    'حافله', 'دراجه', 'عجله', 'محرك', 'وقود', 'بنزين', 'كهرباء', 'طاقه', 'مصنع', 'معمل', 'مختبر', 'مرصد', 'محطه',
    'مدرسه', 'جامعه', 'كليه', 'معهد', 'مكتبه', 'عياده', 'صيدليه', 'مستشفى', 'فندق', 'مطعم', 'مقهى', 'متجر', 'سوبر',
    'شركه', 'مؤسسه', 'منظمه', 'جمعيه', 'نقابه', 'وزاره', 'اداره', 'سفاره', 'قنصليه', 'محكمه', 'شرطه', 'جيش',
    'سلام', 'امان', 'حريه', 'عداله', 'كرامه', 'شجاعه', 'قوه', 'صبر', 'امل', 'فرح', 'سعاده', 'بهجه', 'سرور',
    'محبه', 'موده', 'رحمه', 'حنان', 'وفاء', 'اخلاص', 'صدق', 'امانه', 'حكمه', 'معرفه', 'ثقافه', 'حضاره', 'تاريخ',
    'مستقبل', 'حاضر', 'ماضي', 'بدايه', 'نهايه', 'نتيجه', 'فائده', 'اهميه', 'فرصه', 'تجربه', 'مهاره', 'قدره', 'خبره',

    // كلمات إضافية متنوعة (5, 6, 7 حروف)
    'فراشه', 'نحله', 'نمله', 'عنكبوت', 'عقرب', 'ثعبان', 'تمساح', 'سلحفاه', 'ضفدع', 'ارنب', 'سنجاب', 'قنفذ', 'خفاش',
    'غزاله', 'زرافه', 'غوريلا', 'شمبانزي', 'بطريق', 'نعامه', 'طاووس', 'ببغاء', 'حمامه', 'عصفور', 'بلبل', 'غراب', 'بومه',
    'دجاجه', 'ديك', 'وزه', 'بطه', 'خروف', 'ماعز', 'بقره', 'ثور', 'حصان', 'حمار', 'بغل', 'ناقه', 'فهد', 'ضبع',
    'الماس', 'ياقوت', 'زمرد', 'فيروز', 'مرجان', 'لؤلؤ', 'عقيق', 'بلور', 'رخام', 'جرانيت', 'اسمنت', 'طوب', 'جبس',
    'تلسكوب', 'ميكروسكوب', 'بوصل', 'بوصله', 'خريطه', 'اطلس', 'قاموس', 'معجم', 'موسوعه', 'دفتر', 'كراسه', 'مسطره',
    'فرجار', 'ممحاه', 'مبراه', 'حقيبه', 'مقلمه', 'سبوره', 'طباشير', 'الوان', 'فرشاه', 'لوحه', 'برواز', 'شهاده',
    'بركان', 'زلزال', 'اعصار', 'عاصفه', 'فيضان', 'سيل', 'شلال', 'ينبوع', 'بحيره', 'محيط', 'خليج', 'مضيق', 'قناه',
    'هضبه', 'وادي', 'سهول', 'تلال', 'كهف', 'مغاره', 'صخره', 'حصى', 'تراب', 'غبار', 'دخان', 'بخار', 'ضباب', 'ندى',
    'كوكب', 'مذنب', 'نيزك', 'مجره', 'مدار', 'كسوف', 'خسوف', 'هلال', 'بدر', 'شروق', 'غروب', 'فجر', 'ضحى', 'ظهر',
    'عصر', 'مغرب', 'عشاء', 'ثانيه', 'دقيقه', 'ساعه', 'اسبوع', 'قرن', 'حقبه', 'ميلاد', 'تخرج', 'زواج', 'خطوبه',
    'عائله', 'اسره', 'قبيله', 'عشيره', 'احفاد', 'اجداد', 'ابناء', 'بنات', 'اخوه', 'اخوات', 'اعمام', 'اخوال', 'جيران',
    'ضيوف', 'زوار', 'ركاب', 'سياح', 'تجار', 'عمال', 'فلاحون', 'معلمون', 'مهندسون', 'اطباء', 'طلاب', 'علماء', 'ادباء',
    'شعراء', 'فنانون', 'لاعبون', 'ابطال', 'فرسان', 'جنود', 'ضباط', 'قضاه', 'محامون', 'صحفيون', 'مصورون', 'مخرجون',
    'طائرات', 'سيارات', 'قطارات', 'حافلات', 'شاحنات', 'دراجات', 'سفن', 'قوارب', 'مراكب', 'غواصات', 'صواريخ', 'محركات',
    'مدارس', 'جامعات', 'كليات', 'معاهد', 'مكتبات', 'مستشفيات', 'عيادات', 'صيدليات', 'فنادق', 'مطاعم', 'مقاهي', 'متاجر',
    'اسواق', 'مصانع', 'معامل', 'مختبرات', 'محطات', 'موانئ', 'مطارات', 'شوارع', 'طرقات', 'جسور', 'ابراج', 'قصور',
    'منازل', 'بيوت', 'عمارات', 'شقق', 'غرف', 'صالات', 'مطابخ', 'حدائق', 'بساتين', 'مزارع', 'غابات', 'صحاري', 'جزر',
    'مدن', 'قرى', 'عواصم', 'دول', 'ممالك', 'امارات', 'قارات', 'محيطات', 'بحار', 'انهار', 'بحيرات', 'جبال', 'وديان',
    'مفاتيح', 'مصابيح', 'شبابيك', 'ابواب', 'كراسي', 'طاولات', 'خزائن', 'سجاد', 'ستائر', 'مرايا', 'لوحات', 'ساعات',
    'هواتف', 'حواسيب', 'شاشات', 'طابعات', 'سماعات', 'كاميرات', 'عدسات', 'بطاريات', 'اسلاك', 'كابلات', 'محولات',
    'ملابس', 'قمصان', 'فساتين', 'معاطف', 'احذيه', 'حقائب', 'نظارات', 'قبعات', 'خواتم', 'اساور', 'قلائد', 'عطور',
    'ماكولات', 'مشروبات', 'حلويات', 'فواكه', 'خضروات', 'حبوب', 'توابل', 'بهارات', 'اعشاب', 'زيوت', 'البان', 'اجبان',
    'مباريات', 'بطولات', 'مسابقات', 'احتفالات', 'مهرجانات', 'مؤتمرات', 'اجتماعات', 'ندوات', 'محاضرات', 'اختبارات', 'امتحانات',
    'اتصالات', 'معلومات', 'بيانات', 'برمجيات', 'تطبيقات', 'شبكات', 'انترنت', 'كمبيوتر', 'تلفزيون', 'تليفون', 'ميكروفون',
    'استاد', 'ملعب', 'صاله', 'مسبح', 'نادي', 'معسكر', 'خيمه', 'مظله', 'حقيبه', 'بوصله', 'منظار', 'كشاف', 'بطاريه'
];

// مصادر قواميس عربية مفتوحة المصدر لتوسيع الكلمات المسموح بتخمينها
const ARABIC_GITHUB_URLS = [
    'https://raw.githubusercontent.com/mohataher/arabic-stop-words/master/list.txt',
    'https://raw.githubusercontent.com/eymenefealtun/all-words-in-all-languages/main/Arabic/Arabic.txt'
];

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

function expandArabicMorphology(baseWords) {
    const expanded = new Set();
    const prefixes = ['', 'ال', 'و', 'ف', 'ب', 'ل', 'ك', 'وال', 'بال', 'فال', 'كال', 'لل'];
    const suffixes = ['', 'ه', 'ة', 'ها', 'هم', 'كم', 'نا', 'ي', 'ك', 'ات', 'ون', 'ين', 'ان', 'وا', 'تم', 'تن', 'يه', 'ية'];

    for (const raw of baseWords) {
        const clean = normalizeArabic(raw);
        if (!/^[\u0621-\u064A]+$/.test(clean)) continue;
        expanded.add(clean);

        // إذا كانت الكلمة تنتهي بـ (ه) أو (ة)، أضف الصيغتين
        const stemVariants = [clean];
        if (clean.endsWith('ه')) {
            stemVariants.push(clean.slice(0, -1) + 'ة');
            stemVariants.push(clean.slice(0, -1) + 'ت');
        } else if (clean.endsWith('ة')) {
            stemVariants.push(clean.slice(0, -1) + 'ه');
            stemVariants.push(clean.slice(0, -1) + 'ت');
        }

        for (const stem of stemVariants) {
            for (const pre of prefixes) {
                const withPre = pre + stem;
                if (withPre.length >= 4 && withPre.length <= 7) {
                    expanded.add(withPre);
                }
                // إضافة اللواحق للكلمات بدون (ال) أو مع السوابق البسيطة
                if (!pre.includes('ال')) {
                    for (const suf of suffixes) {
                        const full = pre + stem + suf;
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

async function buildArabicDictionary() {
    console.log('⏳ Building comprehensive Arabic dictionary (4 to 7 letters)...');

    const remoteLists = await Promise.all(ARABIC_GITHUB_URLS.map(fetchText));
    const remoteWords = remoteLists
        .join('\n')
        .split(/\r?\n/)
        .map(w => normalizeArabic(w))
        .filter(w => /^[\u0621-\u064A]+$/.test(w));

    const dictionary = {
        4: { answers: [], allowed: [] },
        5: { answers: [], allowed: [] },
        6: { answers: [], allowed: [] },
        7: { answers: [], allowed: [] }
    };

    const answerSets = { 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() };

    // 1. بناء قائمة الكلمات السرية (Answers) من الكلمات الشائعة الواضحة للأطوال 4 و 5 و 6 و 7
    for (const raw of BASE_ARABIC_WORDS) {
        const w = normalizeArabic(raw);
        if (!/^[\u0621-\u064A]+$/.test(w)) continue;

        // توحيد التاء المربوطة في نهاية الكلمات المفردة الشائعة إلى (ه) لسهولة التخمين أو قبول الاثنين
        const len = w.length;
        if ([4, 5, 6, 7].includes(len) && !answerSets[len].has(w)) {
            answerSets[len].add(w);
            dictionary[len].answers.push(w);
        }

        // إضافة الكلمات الثلاثية والرباعية الشائعة مع (ال) التعريف كإجابات مألوفة للأطوال الأكبر (مثل: القمر، الشمس، الكتاب، المفتاح)
        const withAl = 'ال' + w;
        const alLen = withAl.length;
        if ([5, 6, 7].includes(alLen) && !w.startsWith('ال') && !answerSets[alLen].has(withAl)) {
            answerSets[alLen].add(withAl);
            dictionary[alLen].answers.push(withAl);
        }
    }

    // 2. بناء قائمة الكلمات المسموح بتخمينها (Allowed) مع التصريفات والقواميس الخارجية
    const allExpanded = expandArabicMorphology([...BASE_ARABIC_WORDS, ...remoteWords.slice(0, 15000)]);
    for (const w of remoteWords) {
        if ([4, 5, 6, 7].includes(w.length)) allExpanded.add(w);
    }

    for (const w of allExpanded) {
        const len = w.length;
        if ([4, 5, 6, 7].includes(len) && !answerSets[len].has(w)) {
            dictionary[len].allowed.push(w);
        }
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(AR_JSON_PATH, JSON.stringify(dictionary), 'utf8');

    for (const len of [4, 5, 6, 7]) {
        const total = dictionary[len].answers.length + dictionary[len].allowed.length;
        console.log(`   • Arabic ${len} Letters: ${dictionary[len].answers.length} common answers | ${total.toLocaleString()} valid guesses`);
    }
}

// ==================== UPDATE SERVER FILES ====================
const DICTIONARY_JS = `const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SUPPORTED_LENGTHS = [4, 5, 6, 7];
const SUPPORTED_LANGS = ['en', 'ar'];

function normalizeWord(word, lang = 'en') {
  if (!word || typeof word !== 'string') return '';
  if (lang === 'ar') {
    return word
      .trim()
      .replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '')
      .replace(/[أإآٱ]/g, 'ا');
  }
  return word.trim().toUpperCase();
}

const enPath = path.join(__dirname, 'data', 'words-en.json');
const arPath = path.join(__dirname, 'data', 'words-ar.json');

const DICTIONARIES = {
  en: fs.existsSync(enPath) ? JSON.parse(fs.readFileSync(enPath, 'utf8')) : {},
  ar: fs.existsSync(arPath) ? JSON.parse(fs.readFileSync(arPath, 'utf8')) : {}
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
    throw new Error(\`Unsupported word length (\${len}) or language (\${safeLang})\`);
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
    if (!/^[\\u0621-\\u064A]+$/.test(normalized)) return false;
  } else {
    if (!/^[A-Z]+$/.test(normalized)) return false;
  }

  return VALID_SETS[safeLang]?.[Number(wordLength)]?.has(normalized) || false;
}

module.exports = {
  getSecretWord,
  isValidWord,
  normalizeWord,
  SUPPORTED_LENGTHS,
  SUPPORTED_LANGS
};
`;

const GAME_ENGINE_JS = `const { normalizeWord } = require('./dictionary');

function evaluateGuess(guess, secret, lang = 'en') {
  const normalizedGuess = normalizeWord(guess, lang);
  const normalizedSecret = normalizeWord(secret, lang);

  if (normalizedGuess.length !== normalizedSecret.length) {
    throw new Error(\`Guess length (\${normalizedGuess.length}) must match secret length (\${normalizedSecret.length}).\`);
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
`;

const ROOM_MANAGER_JS = `const crypto = require('crypto');
const { evaluateGuess } = require('./gameEngine');
const { getSecretWord, isValidWord, normalizeWord, SUPPORTED_LENGTHS, SUPPORTED_LANGS } = require('./dictionary');

class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.soloGames = new Map();
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    do {
      code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  // ==================== SOLO MODE ====================
  createSoloGame({ wordLength = 5, maxAttempts = 6, lang = 'en' } = {}) {
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const sessionId = crypto.randomUUID();
    const secretWord = getSecretWord(len, safeLang);

    const session = {
      sessionId,
      lang: safeLang,
      wordLength: len,
      maxAttempts: attempts,
      secretWord,
      guesses: [],
      status: 'IN_PROGRESS',
      createdAt: Date.now()
    };

    this.soloGames.set(sessionId, session);
    return this.sanitizeSoloSession(session);
  }

  submitSoloGuess(sessionId, rawGuess) {
    const session = this.soloGames.get(sessionId);
    if (!session) return { error: 'Solo session not found.' };
    if (session.status !== 'IN_PROGRESS') {
      return { error: 'This game has already finished.' };
    }

    const isAr = session.lang === 'ar';
    const guess = normalizeWord(rawGuess || '', session.lang);

    if (guess.length !== session.wordLength) {
      return { error: isAr ? \`الكلمة يجب أن تكون \${session.wordLength} حروف!\` : \`Word must be \${session.wordLength} letters.\` };
    }
    if (!isValidWord(guess, session.wordLength, session.lang)) {
      return { error: isAr ? 'الكلمة غير موجودة في القاموس! جرب كلمة شائعة.' : 'Not in word list. Try a common word!' };
    }
    if (session.guesses.some(g => g.word === guess)) {
      return { error: isAr ? 'لقد جربت هذه الكلمة من قبل!' : 'You already tried that word!' };
    }

    const evaluations = evaluateGuess(guess, session.secretWord, session.lang);
    session.guesses.push({ word: guess, evaluations });

    if (evaluations.every(c => c.state === 'correct')) {
      session.status = 'WON';
    } else if (session.guesses.length >= session.maxAttempts) {
      session.status = 'LOST';
    }

    return {
      session: this.sanitizeSoloSession(session),
      lastEvaluation: evaluations
    };
  }

  sanitizeSoloSession(session) {
    const isFinished = session.status === 'WON' || session.status === 'LOST';
    return {
      sessionId: session.sessionId,
      lang: session.lang,
      wordLength: session.wordLength,
      maxAttempts: session.maxAttempts,
      guesses: session.guesses,
      status: session.status,
      secretWord: isFinished ? session.secretWord : null
    };
  }

  // ==================== MULTIPLAYER ROOMS ====================
  createRoom({ hostId, hostName, socketId, roomName, wordLength = 5, maxPlayers = 6, maxAttempts = 6, isPublic = true, lang = 'en' }) {
    const safeLang = SUPPORTED_LANGS.includes(lang) ? lang : 'en';
    const len = SUPPORTED_LENGTHS.includes(Number(wordLength)) ? Number(wordLength) : 5;
    const cap = Math.min(Math.max(Number(maxPlayers) || 6, 2), 10);
    const attempts = Math.min(Math.max(Number(maxAttempts) || 6, 4), 8);
    const code = this.generateRoomCode();
    const secretWord = getSecretWord(len, safeLang);

    const cleanHostName = (hostName || 'Player 1').trim().slice(0, 18) || 'Player 1';

    const room = {
      code,
      name: (roomName || \`\${cleanHostName}'s Arena\`).trim().slice(0, 28),
      hostId,
      lang: safeLang,
      wordLength: len,
      maxPlayers: cap,
      maxAttempts: attempts,
      isPublic: Boolean(isPublic),
      status: 'WAITING',
      secretWord,
      roundNumber: 1,
      startedAt: null,
      finishedAt: null,
      players: new Map()
    };

    room.players.set(hostId, {
      id: hostId,
      name: cleanHostName,
      socketId,
      connected: true,
      guesses: [],
      status: 'PLAYING',
      solvedAt: null
    });

    this.rooms.set(code, room);
    return room;
  }

  joinRoom({ code, playerId, playerName, socketId }) {
    const normalizedCode = (code || '').trim().toUpperCase();
    const room = this.rooms.get(normalizedCode);

    if (!room) {
      return { error: 'Room not found. Check the 6-character room code.' };
    }

    if (room.players.has(playerId)) {
      const existingPlayer = room.players.get(playerId);
      existingPlayer.socketId = socketId;
      existingPlayer.connected = true;
      if (playerName && playerName.trim()) {
        existingPlayer.name = playerName.trim().slice(0, 18);
      }
      return { room, reconnected: true };
    }

    if (room.status !== 'WAITING') {
      return { error: 'This room has already started. Wait for the next round!' };
    }

    if (room.players.size >= room.maxPlayers) {
      return { error: \`Room is full (\${room.maxPlayers}/\${room.maxPlayers} players).\` };
    }

    const cleanName = (playerName || \`Player \${room.players.size + 1}\`).trim().slice(0, 18);

    room.players.set(playerId, {
      id: playerId,
      name: cleanName,
      socketId,
      connected: true,
      guesses: [],
      status: 'PLAYING',
      solvedAt: null
    });

    return { room, reconnected: false };
  }

  startGame({ code, requesterId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.hostId !== requesterId) return { error: 'Only the room host can start the game.' };
    if (room.status !== 'WAITING') return { error: 'Game is already in progress.' };
    if (room.players.size < 2) {
      return { error: 'At least 2 players are required to start a multiplayer game.' };
    }

    room.status = 'IN_PROGRESS';
    room.startedAt = Date.now();
    room.finishedAt = null;

    for (const player of room.players.values()) {
      player.guesses = [];
      player.status = 'PLAYING';
      player.solvedAt = null;
    }

    return { room };
  }

  submitMultiplayerGuess({ code, playerId, rawGuess }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.status !== 'IN_PROGRESS') return { error: 'Round is not currently active.' };

    const player = room.players.get(playerId);
    if (!player) return { error: 'Unauthorized: You are not a member of this room.' };
    if (player.status !== 'PLAYING') {
      return { error: 'You have already finished all attempts for this round.' };
    }

    const isAr = room.lang === 'ar';
    const guess = normalizeWord(rawGuess || '', room.lang);

    if (guess.length !== room.wordLength) {
      return { error: isAr ? \`الكلمة يجب أن تكون \${room.wordLength} حروف!\` : \`Word must be \${room.wordLength} letters.\` };
    }
    if (!isValidWord(guess, room.wordLength, room.lang)) {
      return { error: isAr ? 'الكلمة غير موجودة في القاموس!' : 'Word not found in dictionary!' };
    }
    if (player.guesses.some(g => g.word === guess)) {
      return { error: isAr ? 'لقد جربت هذه الكلمة من قبل!' : 'You already guessed that word!' };
    }

    const evaluations = evaluateGuess(guess, room.secretWord, room.lang);
    const now = Date.now();
    player.guesses.push({ word: guess, evaluations, submittedAt: now });

    if (evaluations.every(c => c.state === 'correct')) {
      player.status = 'SOLVED';
      player.solvedAt = now;
    } else if (player.guesses.length >= room.maxAttempts) {
      player.status = 'FAILED';
    }

    const allFinished = Array.from(room.players.values()).every(
      p => p.status === 'SOLVED' || p.status === 'FAILED' || !p.connected
    );

    if (allFinished) {
      room.status = 'FINISHED';
      room.finishedAt = now;
    }

    return { room, player };
  }

  startNewRound({ code, requesterId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return { error: 'Room not found.' };
    if (room.hostId !== requesterId) {
      return { error: 'Only the room host can start a new round.' };
    }
    if (room.players.size < 2) {
      room.status = 'WAITING';
      room.secretWord = getSecretWord(room.wordLength, room.lang, room.secretWord);
      return { room };
    }

    room.secretWord = getSecretWord(room.wordLength, room.lang, room.secretWord);
    room.roundNumber += 1;
    room.status = 'IN_PROGRESS';
    room.startedAt = Date.now();
    room.finishedAt = null;

    for (const player of room.players.values()) {
      player.guesses = [];
      player.status = 'PLAYING';
      player.solvedAt = null;
    }

    return { room };
  }

  handleDisconnect(socketId) {
    const affectedRooms = [];
    for (const [, room] of this.rooms.entries()) {
      for (const [playerId, player] of room.players.entries()) {
        if (player.socketId === socketId) {
          player.connected = false;
          if (room.hostId === playerId) {
            const nextHost = Array.from(room.players.values()).find(p => p.connected && p.id !== playerId);
            if (nextHost) room.hostId = nextHost.id;
          }
          if (room.status === 'IN_PROGRESS') {
            const activeConnected = Array.from(room.players.values()).filter(p => p.connected);
            if (activeConnected.length > 0 && activeConnected.every(p => p.status !== 'PLAYING')) {
              room.status = 'FINISHED';
              room.finishedAt = Date.now();
            }
          }
          affectedRooms.push(room);
        }
      }
    }
    return affectedRooms;
  }

  leaveRoom({ code, playerId }) {
    const room = this.rooms.get((code || '').toUpperCase());
    if (!room) return null;
    room.players.delete(playerId);
    if (room.players.size === 0) {
      this.rooms.delete(room.code);
      return { deleted: true, code: room.code };
    }
    if (room.hostId === playerId) {
      const nextHost = room.players.values().next().value;
      if (nextHost) room.hostId = nextHost.id;
    }
    if (room.status === 'IN_PROGRESS') {
      const everyoneDone = Array.from(room.players.values()).every(p => p.status !== 'PLAYING');
      if (everyoneDone) {
        room.status = 'FINISHED';
        room.finishedAt = Date.now();
      }
    }
    return { room, deleted: false };
  }

  serializeRoomForPlayer(room, viewerPlayerId) {
    const isRoundFinished = room.status === 'FINISHED';

    const playersList = Array.from(room.players.values()).map(p => {
      const isSelf = p.id === viewerPlayerId;
      return {
        id: p.id,
        name: p.name,
        isHost: p.id === room.hostId,
        connected: p.connected,
        status: p.status,
        attemptsUsed: p.guesses.length,
        solvedAt: p.solvedAt,
        durationMs: p.solvedAt && room.startedAt ? p.solvedAt - room.startedAt : null,
        guesses: p.guesses.map(g => ({
          word: isSelf || isRoundFinished ? g.word : null,
          evaluations: g.evaluations.map(cell => ({
            letter: isSelf || isRoundFinished ? cell.letter : '',
            state: cell.state
          }))
        }))
      };
    });

    const leaderboard = [...playersList].sort((a, b) => {
      if (a.status === 'SOLVED' && b.status !== 'SOLVED') return -1;
      if (a.status !== 'SOLVED' && b.status === 'SOLVED') return 1;
      if (a.status === 'SOLVED' && b.status === 'SOLVED') {
        if (a.attemptsUsed !== b.attemptsUsed) return a.attemptsUsed - b.attemptsUsed;
        return (a.durationMs || Infinity) - (b.durationMs || Infinity);
      }
      return b.attemptsUsed - a.attemptsUsed;
    });

    return {
      code: room.code,
      name: room.name,
      hostId: room.hostId,
      lang: room.lang,
      wordLength: room.wordLength,
      maxPlayers: room.maxPlayers,
      maxAttempts: room.maxAttempts,
      isPublic: room.isPublic,
      status: room.status,
      roundNumber: room.roundNumber,
      secretWord: isRoundFinished ? room.secretWord : null,
      players: playersList,
      leaderboard
    };
  }

  getPublicWaitingRooms() {
    const list = [];
    for (const room of this.rooms.values()) {
      if (room.isPublic && room.status === 'WAITING' && room.players.size < room.maxPlayers) {
        list.push({
          code: room.code,
          name: room.name,
          lang: room.lang,
          wordLength: room.wordLength,
          maxAttempts: room.maxAttempts,
          playerCount: room.players.size,
          maxPlayers: room.maxPlayers
        });
      }
    }
    return list;
  }
}

module.exports = { RoomManager };
`;

function updateServerIndex() {
    const indexPath = path.join(__dirname, 'server', 'index.js');
    let code = fs.readFileSync(indexPath, 'utf8');

    code = code.replace(
        'const { wordLength, maxAttempts } = req.body || {};',
        'const { wordLength, maxAttempts, lang } = req.body || {};'
    );
    code = code.replace(
        'roomManager.createSoloGame({ wordLength, maxAttempts })',
        'roomManager.createSoloGame({ wordLength, maxAttempts, lang })'
    );
    code = code.replace(
        'const { playerId, playerName, roomName, wordLength, maxPlayers, maxAttempts, isPublic } = payload || {};',
        'const { playerId, playerName, roomName, wordLength, maxPlayers, maxAttempts, isPublic, lang } = payload || {};'
    );
    code = code.replace(
        'isPublic\n    });',
        'isPublic,\n      lang\n    });'
    );
    fs.writeFileSync(indexPath, code, 'utf8');
}

function updateFrontendFiles() {
    const htmlPath = path.join(__dirname, 'public', 'index.html');
    const cssPath = path.join(__dirname, 'public', 'styles.css');
    const clientPath = path.join(__dirname, 'public', 'client.js');

    // 1. Update index.html with Cairo Arabic Font & Language Selectors
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace(
        'family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
        'family=Cairo:wght@600;700;800&family=Fredoka:wght@500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap'
    );

    if (!html.includes('soloLangGroup')) {
        html = html.replace(
            '<div class="length-selector-box">',
            `<div class="length-selector-box">
            <span class="selector-label">LANGUAGE</span>
            <div class="pill-group" id="soloLangGroup">
              <button class="pill active" data-lang="en">🇬🇧 EN</button>
              <button class="pill" data-lang="ar">🇪🇬 عربي</button>
            </div>
          </div>
          <div class="length-selector-box">`
        );
    }

    if (!html.includes('createLangGroup')) {
        html = html.replace(
            '<div class="form-group">\n            <label>WORD LENGTH (4 TO 7 LETTERS)</label>',
            `<div class="form-group">
            <label>DICTIONARY LANGUAGE</label>
            <div class="pill-group large" id="createLangGroup">
              <button class="pill active" data-lang="en">🇬🇧 English Words</button>
              <button class="pill" data-lang="ar">🇪🇬 كلمات عربية</button>
            </div>
          </div>
          <div class="form-group">
            <label>WORD LENGTH (4 TO 7 LETTERS)</label>`
        );
    }
    fs.writeFileSync(htmlPath, html, 'utf8');

    // 2. Update styles.css for Arabic Typography & Compact 12-Key Arabic Keyboard
    let css = fs.readFileSync(cssPath, 'utf8');
    if (!css.includes('.ar-keyboard')) {
        const arStyles = `
/* ==================== ARABIC RTL & KEYBOARD SUPPORT ==================== */
body, .grid-tile, .kb-key, .btn-3d, .pill {
  font-family: var(--font-display), 'Cairo', sans-serif;
}

.word-grid.rtl-grid .grid-row,
.mini-grid.rtl-grid .mini-row {
  direction: rtl;
}

.keyboard.ar-keyboard {
  max-width: 620px;
}

.keyboard.ar-keyboard .kb-key {
  font-family: 'Cairo', sans-serif;
  font-size: 1.05rem;
  font-weight: 800;
  min-height: 46px;
  padding: 0 4px;
}

.keyboard.ar-keyboard .kb-key.wide {
  flex: 1.45;
  font-size: 0.85rem;
}
`;
        fs.writeFileSync(cssPath, css + '\n' + arStyles, 'utf8');
    }

    // 3. Update client.js with full Bilingual EN + AR support
    const updatedClient = `(() => {
  const socket = io();

  let playerId = localStorage.getItem('lexirush_player_id');
  if (!playerId) {
    playerId = 'p_' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    localStorage.setItem('lexirush_player_id', playerId);
  }

  const nameInput = document.getElementById('globalPlayerName');
  nameInput.value = localStorage.getItem('lexirush_player_name') || \`Player_\${playerId.slice(2, 6).toUpperCase()}\`;
  nameInput.addEventListener('change', () => {
    localStorage.setItem('lexirush_player_name', nameInput.value.trim() || 'Player');
  });

  const FLIP_STEP_MS = 180;
  const FLIP_DURATION_MS = 520;

  const state = {
    mode: null,
    soloLang: 'en',
    createLang: 'en',
    lang: 'en',
    soloWordLength: 5,
    createWordLength: 5,
    wordLength: 5,
    maxAttempts: 6,
    currentGuess: '',
    isSubmitting: false,
    animatingRowIndex: -1,
    bounceRowIndex: -1,
    knownGuessCount: 0,
    soloSession: null,
    room: null
  };

  function normalizeInputChar(rawKey, lang) {
    if (lang === 'ar') {
      const cleaned = rawKey.replace(/[\\u064B-\\u065F\\u0670\\u0640]/g, '').replace(/[أإآٱ]/g, 'ا');
      return /^[\\u0621-\\u064A]$/.test(cleaned) ? cleaned : null;
    }
    const upper = rawKey.toUpperCase();
    return /^[A-Z]$/.test(upper) ? upper : null;
  }

  const screens = {
    menu: document.getElementById('screen-menu'),
    create: document.getElementById('screen-create'),
    lobby: document.getElementById('screen-lobby'),
    game: document.getElementById('screen-game'),
    results: document.getElementById('screen-results')
  };

  function showScreen(screenKey) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    screens[screenKey]?.classList.add('active');
    if (screenKey === 'menu') {
      fetchPublicRooms();
    }
  }

  function showToast(msg) {
    const container = document.getElementById('toastContainer');
    container.innerHTML = '';
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 1900);
  }

  document.getElementById('themeToggleBtn').addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.getElementById('themeToggleBtn').textContent = next === 'dark' ? '☀️' : '🌙';
  });

  // Solo Language & Length Selectors
  document.querySelectorAll('#soloLangGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#soloLangGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.soloLang = btn.dataset.lang;
    });
  });

  document.querySelectorAll('#soloLengthGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#soloLengthGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.soloWordLength = Number(btn.dataset.len);
    });
  });

  function updateCreatePreview() {
    const maxP = document.getElementById('maxPlayersSelect').value;
    const maxA = document.getElementById('maxAttemptsSelect').value;
    const langLabel = state.createLang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 EN';
    document.getElementById('configPreviewText').textContent =
      \`\${langLabel} • \${state.createWordLength} Letters • Max \${maxP} Players • \${maxA} Tries\`;
  }

  document.querySelectorAll('#createLangGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#createLangGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.createLang = btn.dataset.lang;
      updateCreatePreview();
    });
  });

  document.querySelectorAll('#createLengthGroup .pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#createLengthGroup .pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.createWordLength = Number(btn.dataset.len);
      updateCreatePreview();
    });
  });
  document.getElementById('maxPlayersSelect').addEventListener('change', updateCreatePreview);
  document.getElementById('maxAttemptsSelect').addEventListener('change', updateCreatePreview);

  function triggerRowFlipAnimation(rowIndex, isWinningRow, onComplete) {
    state.animatingRowIndex = rowIndex;
    state.isSubmitting = true;
    renderActiveGame();

    const totalFlipTime = ((state.wordLength - 1) * FLIP_STEP_MS) + FLIP_DURATION_MS;

    setTimeout(() => {
      state.animatingRowIndex = -1;
      if (isWinningRow) {
        state.bounceRowIndex = rowIndex;
        renderActiveGame();
        setTimeout(() => {
          state.bounceRowIndex = -1;
          state.isSubmitting = false;
          renderActiveGame();
          onComplete?.();
        }, 650);
      } else {
        state.isSubmitting = false;
        renderActiveGame();
        onComplete?.();
      }
    }, totalFlipTime);
  }

  async function startSoloGame() {
    try {
      const res = await fetch('/api/solo/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wordLength: state.soloWordLength,
          maxAttempts: 6,
          lang: state.soloLang
        })
      });
      const data = await res.json();
      if (!data.ok) return showToast(data.error || 'Could not start solo game.');

      state.mode = 'SOLO';
      state.soloSession = data.session;
      state.lang = data.session.lang || 'en';
      state.wordLength = data.session.wordLength;
      state.maxAttempts = data.session.maxAttempts;
      state.currentGuess = '';
      state.animatingRowIndex = -1;
      state.bounceRowIndex = -1;
      state.knownGuessCount = 0;
      state.isSubmitting = false;

      document.querySelector('.game-layout').classList.add('solo-only');
      document.getElementById('mpLiveSidebar').classList.add('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');
      document.getElementById('gameModeBadge').textContent =
        state.lang === 'ar' ? '🇪🇬 فردي (عربي)' : '🇬🇧 SOLO MODE';

      renderActiveGame();
      showScreen('game');
    } catch (err) {
      showToast('Network error starting Solo game.');
    }
  }

  document.getElementById('playSoloBtn').addEventListener('click', startSoloGame);
  document.getElementById('soloPlayAgainBtn').addEventListener('click', startSoloGame);
  document.getElementById('soloBackMenuBtn').addEventListener('click', () => showScreen('menu'));

  document.getElementById('openCreateRoomBtn').addEventListener('click', () => {
    updateCreatePreview();
    showScreen('create');
  });

  document.getElementById('backFromCreateBtn').addEventListener('click', () => showScreen('menu'));

  document.getElementById('confirmCreateRoomBtn').addEventListener('click', () => {
    const payload = {
      playerId,
      playerName: nameInput.value.trim() || 'Player',
      roomName: document.getElementById('roomNameInput').value.trim(),
      lang: state.createLang,
      wordLength: state.createWordLength,
      maxPlayers: Number(document.getElementById('maxPlayersSelect').value),
      maxAttempts: Number(document.getElementById('maxAttemptsSelect').value),
      isPublic: document.getElementById('roomPublicCheckbox').checked
    };

    socket.emit('room:create', payload, (res) => {
      if (res?.error) return showToast(res.error);
      state.mode = 'MP';
      state.room = res.room;
      state.lang = res.room.lang || 'en';
      state.knownGuessCount = 0;
      localStorage.setItem('lexirush_active_room', res.room.code);
      renderRoomState(res.room);
    });
  });

  function joinRoomByCode(code) {
    const cleanCode = (code || '').trim().toUpperCase();
    if (!cleanCode) return showToast('Enter a valid 6-character room code.');

    socket.emit('room:join', {
      code: cleanCode,
      playerId,
      playerName: nameInput.value.trim() || 'Player'
    }, (res) => {
      if (res?.error) {
        localStorage.removeItem('lexirush_active_room');
        return showToast(res.error);
      }
      state.mode = 'MP';
      state.room = res.room;
      state.lang = res.room.lang || 'en';
      const me = res.room.players.find(p => p.id === playerId);
      state.knownGuessCount = me ? me.guesses.length : 0;
      localStorage.setItem('lexirush_active_room', res.room.code);
      if (res.reconnected) showToast('Reconnected to room!');
      renderRoomState(res.room);
    });
  }

  document.getElementById('joinRoomBtn').addEventListener('click', () => {
    joinRoomByCode(document.getElementById('joinCodeInput').value);
  });

  document.getElementById('copyCodeBtn').addEventListener('click', () => {
    if (!state.room) return;
    navigator.clipboard.writeText(state.room.code);
    showToast(\`Copied room code: \${state.room.code}\`);
  });

  document.getElementById('startMultiplayerBtn').addEventListener('click', () => {
    if (!state.room) return;
    socket.emit('room:start', { code: state.room.code, playerId }, (res) => {
      if (res?.error) showToast(res.error);
    });
  });

  function leaveCurrentRoom() {
    if (state.mode === 'MP' && state.room) {
      socket.emit('room:leave', { code: state.room.code, playerId });
    }
    localStorage.removeItem('lexirush_active_room');
    state.room = null;
    state.mode = null;
    showScreen('menu');
  }

  document.getElementById('leaveLobbyBtn').addEventListener('click', leaveCurrentRoom);
  document.getElementById('quitActiveGameBtn').addEventListener('click', leaveCurrentRoom);
  document.getElementById('resultsMainMenuBtn').addEventListener('click', leaveCurrentRoom);

  document.getElementById('resultsNewRoundBtn').addEventListener('click', () => {
    if (!state.room) return;
    socket.emit('room:new-round', { code: state.room.code, playerId }, (res) => {
      if (res?.error) showToast(res.error);
    });
  });

  socket.on('room:state', (roomState) => {
    const previousStatus = state.room?.status;
    const previousRound = state.room?.roundNumber;
    state.mode = 'MP';
    state.room = roomState;
    state.lang = roomState.lang || 'en';

    if (
      (previousStatus !== 'IN_PROGRESS' && roomState.status === 'IN_PROGRESS') ||
      previousRound !== roomState.roundNumber
    ) {
      state.currentGuess = '';
      state.knownGuessCount = 0;
      state.animatingRowIndex = -1;
      state.bounceRowIndex = -1;
      state.isSubmitting = false;
    }

    const me = roomState.players.find(p => p.id === playerId);
    const myGuessesLen = me ? me.guesses.length : 0;

    if (myGuessesLen > state.knownGuessCount) {
      const newRowIdx = myGuessesLen - 1;
      state.knownGuessCount = myGuessesLen;
      const isSolved = me.status === 'SOLVED';

      document.querySelector('.game-layout').classList.remove('solo-only');
      document.getElementById('mpLiveSidebar').classList.remove('hidden');
      showScreen('game');
      renderLiveOpponents(roomState);

      triggerRowFlipAnimation(newRowIdx, isSolved, () => {
        if (state.room?.status === 'FINISHED') {
          renderResultsScreen(state.room);
          showScreen('results');
        }
      });
      return;
    }

    if (roomState.status === 'FINISHED' && state.animatingRowIndex === -1 && state.bounceRowIndex === -1) {
      renderResultsScreen(roomState);
      showScreen('results');
      return;
    }

    renderRoomState(roomState);
  });

  socket.on('connect', () => {
    const savedRoom = localStorage.getItem('lexirush_active_room');
    if (savedRoom) {
      joinRoomByCode(savedRoom);
    }
  });

  function renderRoomState(room) {
    state.wordLength = room.wordLength;
    state.maxAttempts = room.maxAttempts;
    state.lang = room.lang || 'en';
    const langFlag = state.lang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 English';

    if (room.status === 'WAITING') {
      document.getElementById('lobbyRoomName').textContent = room.name;
      document.getElementById('lobbyRoomCode').textContent = room.code;
      document.getElementById('lobbyWordLenBadge').textContent = \`\${langFlag} • \${room.wordLength} Letters\`;
      document.getElementById('lobbyAttemptsBadge').textContent = \`🎯 \${room.maxAttempts} Attempts\`;
      document.getElementById('lobbyCapacityBadge').textContent = \`👥 \${room.players.length} / \${room.maxPlayers} Players\`;

      const grid = document.getElementById('lobbyPlayersGrid');
      grid.innerHTML = '';
      room.players.forEach(p => {
        const card = document.createElement('div');
        card.className = 'lobby-player-card';
        const initials = p.name.slice(0, 2).toUpperCase();
        card.innerHTML = \`
          <div class="avatar-circle">\${initials}</div>
          <div>
            <strong>\${p.name} \${p.id === playerId ? '(You)' : ''}</strong>
            <div style="font-size:0.75rem;color:var(--text-muted)">
              \${p.isHost ? '👑 Host' : 'Ready'} \${!p.connected ? '• Offline' : ''}
            </div>
          </div>
        \`;
        grid.appendChild(card);
      });

      const isHost = room.hostId === playerId;
      const canStart = isHost && room.players.length >= 2;
      const startBtn = document.getElementById('startMultiplayerBtn');
      startBtn.style.display = isHost ? 'inline-block' : 'none';
      startBtn.disabled = !canStart;
      document.getElementById('lobbyWaitHint').textContent =
        room.players.length < 2
          ? 'Need at least 2 players to start...'
          : isHost
          ? 'Ready to launch!'
          : 'Waiting for host to start...';

      showScreen('lobby');
    } else if (room.status === 'IN_PROGRESS') {
      document.querySelector('.game-layout').classList.remove('solo-only');
      document.getElementById('mpLiveSidebar').classList.remove('hidden');
      document.getElementById('soloEndBanner').classList.add('hidden');
      document.getElementById('gameModeBadge').textContent = \`\${langFlag} • ROOM #\${room.code} • R\${room.roundNumber}\`;
      document.getElementById('sidebarRoomCode').textContent = \`#\${room.code}\`;

      if (state.animatingRowIndex === -1 && state.bounceRowIndex === -1) {
        renderActiveGame();
      }
      renderLiveOpponents(room);
      showScreen('game');
    } else if (room.status === 'FINISHED') {
      renderResultsScreen(room);
      showScreen('results');
    }
  }

  function renderActiveGame() {
    const isAr = state.lang === 'ar';
    const guesses = state.mode === 'SOLO'
      ? state.soloSession.guesses
      : (state.room.players.find(p => p.id === playerId)?.guesses || []);

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession.status
      : (state.room.players.find(p => p.id === playerId)?.status || 'PLAYING');

    const isStillPlaying = myStatus === 'IN_PROGRESS' || myStatus === 'PLAYING';
    const isAnimating = state.animatingRowIndex !== -1 || state.bounceRowIndex !== -1;
    const remaining = Math.max(0, state.maxAttempts - guesses.length);

    document.getElementById('gameRuleInfo').textContent = isAr
      ? \`\${state.wordLength} حروف • \${state.maxAttempts} محاولات\`
      : \`\${state.wordLength} Letters • \${state.maxAttempts} Tries\`;

    document.getElementById('remainingTriesText').textContent =
      isStillPlaying || isAnimating
        ? (isAr ? \`متبقي \${remaining} محاولات\` : \`\${remaining} tries left\`)
        : \`Status: \${myStatus}\`;

    const gridEl = document.getElementById('wordGrid');
    gridEl.style.setProperty('--word-length', state.wordLength);
    gridEl.classList.toggle('rtl-grid', isAr);
    gridEl.innerHTML = '';

    for (let r = 0; r < state.maxAttempts; r++) {
      const rowEl = document.createElement('div');
      rowEl.className = 'grid-row';
      if (r === guesses.length && isStillPlaying && !isAnimating) {
        rowEl.id = 'activeGuessRow';
      }

      const submittedRow = guesses[r];

      for (let c = 0; c < state.wordLength; c++) {
        const tile = document.createElement('div');
        tile.className = 'grid-tile';

        if (submittedRow) {
          const cell = submittedRow.evaluations[c];
          tile.textContent = cell.letter;
          tile.classList.add(cell.state);

          if (r === state.animatingRowIndex) {
            tile.classList.add('revealing');
            tile.style.setProperty('--flip-delay', \`\${c * FLIP_STEP_MS}ms\`);
          } else if (r === state.bounceRowIndex) {
            tile.classList.add('win-bounce');
            tile.style.setProperty('--bounce-delay', \`\${c * 75}ms\`);
          }
        } else if (r === guesses.length && isStillPlaying && !isAnimating) {
          const char = state.currentGuess[c] || '';
          tile.textContent = char;
          if (char) tile.classList.add('filled');
        }

        rowEl.appendChild(tile);
      }

      gridEl.appendChild(rowEl);
    }

    if (state.mode === 'SOLO' && !isStillPlaying && !isAnimating) {
      const banner = document.getElementById('soloEndBanner');
      banner.classList.remove('hidden');
      const iconEl = document.getElementById('soloEndIcon');
      if (iconEl) iconEl.textContent = myStatus === 'WON' ? '🏆' : '🧊';
      document.getElementById('soloEndTitle').textContent =
        myStatus === 'WON'
          ? (isAr ? '🎉 عبقري! حليت الكلمة!' : '🎉 Brilliant! You Solved It!')
          : (isAr ? 'انتهت المحاولات!' : 'Out of Attempts!');
      document.getElementById('soloEndSecret').innerHTML = isAr
        ? \`الكلمة السرية كانت <strong>\${state.soloSession.secretWord}</strong>\`
        : \`The secret word was <strong>\${state.soloSession.secretWord}</strong>\`;
    }

    const keyboardGuesses = state.animatingRowIndex !== -1
      ? guesses.slice(0, state.animatingRowIndex)
      : guesses;
    renderKeyboard(keyboardGuesses);
  }

  function renderKeyboard(guesses) {
    const isAr = state.lang === 'ar';
    const keyPrecedence = { correct: 3, present: 2, absent: 1 };
    const keyStates = {};

    guesses.forEach(g => {
      g.evaluations.forEach(({ letter, state: cellState }) => {
        const currentRank = keyPrecedence[keyStates[letter]] || 0;
        if (keyPrecedence[cellState] > currentRank) {
          keyStates[letter] = cellState;
        }
      });
    });

    const rows = isAr
      ? [
          ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج', 'د'],
          ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط', 'ذ'],
          ['ENTER', 'ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', '⌫']
        ]
      : [
          ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
          ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
          ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫']
        ];

    const kbEl = document.getElementById('keyboard');
    kbEl.classList.toggle('ar-keyboard', isAr);
    kbEl.innerHTML = '';

    rows.forEach(rowKeys => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';

      rowKeys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = 'kb-key';
        if (k === 'ENTER' || k === '⌫') btn.classList.add('wide');
        if (keyStates[k]) btn.classList.add(keyStates[k]);
        btn.textContent = k === 'ENTER' && isAr ? 'إدخال' : k;
        btn.addEventListener('click', () => handleKeyInput(k));
        rowEl.appendChild(btn);
      });

      kbEl.appendChild(rowEl);
    });
  }

  function renderLiveOpponents(room) {
    const isAr = room.lang === 'ar';
    const container = document.getElementById('liveOpponentsList');
    container.innerHTML = '';

    room.players.forEach(p => {
      const card = document.createElement('div');
      card.className = 'opponent-card';

      const statusBadge =
        p.status === 'SOLVED'
          ? '✅ Solved'
          : p.status === 'FAILED'
          ? '❌ Out'
          : \`⏳ \${p.attemptsUsed}/\${room.maxAttempts}\`;

      const miniRowsHtml = p.guesses
        .map(g => {
          const cells = g.evaluations
            .map(c => \`<span class="mini-cell \${c.state}"></span>\`)
            .join('');
          return \`<div class="mini-row">\${cells}</div>\`;
        })
        .join('');

      card.innerHTML = \`
        <div class="opponent-top">
          <span>\${p.name} \${p.id === playerId ? '(You)' : ''}</span>
          <span>\${statusBadge}</span>
        </div>
        <div class="mini-grid \${isAr ? 'rtl-grid' : ''}">\${miniRowsHtml || '<small style="color:var(--text-muted)">No guesses yet</small>'}</div>
      \`;
      container.appendChild(card);
    });
  }

  function renderResultsScreen(room) {
    document.getElementById('resultsSecretWord').textContent = room.secretWord || '-----';

    const listEl = document.getElementById('resultsLeaderboard');
    listEl.innerHTML = '';

    room.leaderboard.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'leader-row';

      const medal = idx === 0 && p.status === 'SOLVED' ? '🏆' : \`#\${idx + 1}\`;
      const outcome =
        p.status === 'SOLVED'
          ? \`Solved in \${p.attemptsUsed}/\${room.maxAttempts} (\${((p.durationMs || 0) / 1000).toFixed(1)}s)\`
          : \`Failed (\${p.attemptsUsed}/\${room.maxAttempts})\`;

      row.innerHTML = \`
        <div>
          <strong>\${medal} \${p.name} \${p.id === playerId ? '(You)' : ''}</strong>
        </div>
        <div>\${outcome}</div>
      \`;
      listEl.appendChild(row);
    });

    const newRoundBtn = document.getElementById('resultsNewRoundBtn');
    if (room.hostId === playerId) {
      newRoundBtn.classList.remove('hidden');
    } else {
      newRoundBtn.classList.add('hidden');
    }
  }

  async function handleKeyInput(key) {
    if (!screens.game.classList.contains('active') || state.isSubmitting) return;

    const myStatus = state.mode === 'SOLO'
      ? state.soloSession?.status
      : state.room?.players.find(p => p.id === playerId)?.status;

    if (myStatus !== 'IN_PROGRESS' && myStatus !== 'PLAYING') return;

    if (key === '⌫' || key === 'BACKSPACE') {
      state.currentGuess = state.currentGuess.slice(0, -1);
      renderActiveGame();
      return;
    }

    if (key === 'ENTER') {
      if (state.currentGuess.length !== state.wordLength) {
        shakeActiveRow();
        return showToast(
          state.lang === 'ar'
            ? \`الكلمة يجب أن تكون \${state.wordLength} حروف!\`
            : \`Word must be \${state.wordLength} letters!\`
        );
      }
      await submitCurrentGuess();
      return;
    }

    const validChar = normalizeInputChar(key, state.lang);
    if (validChar && state.currentGuess.length < state.wordLength) {
      state.currentGuess += validChar;
      renderActiveGame();
    }
  }

  function shakeActiveRow() {
    const row = document.getElementById('activeGuessRow');
    if (row) {
      row.classList.remove('shake');
      void row.offsetWidth;
      row.classList.add('shake');
    }
  }

  async function submitCurrentGuess() {
    state.isSubmitting = true;
    const guessToSubmit = state.currentGuess;

    try {
      if (state.mode === 'SOLO') {
        const res = await fetch('/api/solo/guess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: state.soloSession.sessionId,
            guess: guessToSubmit
          })
        });
        const data = await res.json();
        if (!data.ok) {
          state.isSubmitting = false;
          shakeActiveRow();
          showToast(data.error);
        } else {
          state.soloSession = data.session;
          state.currentGuess = '';
          const newRowIdx = state.soloSession.guesses.length - 1;
          const isWon = state.soloSession.status === 'WON';
          triggerRowFlipAnimation(newRowIdx, isWon);
        }
      } else if (state.mode === 'MP' && state.room) {
        socket.emit('room:guess', {
          code: state.room.code,
          playerId,
          guess: guessToSubmit
        }, (res) => {
          if (res?.error) {
            state.isSubmitting = false;
            shakeActiveRow();
            showToast(res.error);
          } else {
            state.currentGuess = '';
          }
        });
      }
    } catch (err) {
      state.isSubmitting = false;
    }
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement.tagName === 'INPUT') return;
    if (e.key === 'Enter') {
      e.preventDefault();
      handleKeyInput('ENTER');
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      handleKeyInput('BACKSPACE');
    } else if (e.key.length === 1) {
      const validChar = normalizeInputChar(e.key, state.lang);
      if (validChar) {
        e.preventDefault();
        handleKeyInput(validChar);
      }
    }
  });

  async function fetchPublicRooms() {
    try {
      const res = await fetch('/api/rooms/public');
      const data = await res.json();
      const container = document.getElementById('publicRoomsList');
      if (!data.rooms || data.rooms.length === 0) {
        container.innerHTML = '<p class="muted-text">No public rooms waiting right now. Host one above!</p>';
        return;
      }
      container.innerHTML = '';
      data.rooms.forEach(r => {
        const langBadge = r.lang === 'ar' ? '🇪🇬 عربي' : '🇬🇧 EN';
        const item = document.createElement('div');
        item.className = 'public-room-item';
        item.innerHTML = \`
          <div>
            <strong>\${r.name}</strong>
            <span style="font-size:0.8rem;color:var(--text-muted);margin-left:8px;">
              \${langBadge} • \${r.wordLength} Letters • \${r.playerCount}/\${r.maxPlayers} Players
            </span>
          </div>
          <button class="btn-chip" data-code="\${r.code}">Join #\${r.code}</button>
        \`;
        item.querySelector('button').addEventListener('click', () => joinRoomByCode(r.code));
        container.appendChild(item);
      });
    } catch (e) {}
  }

  document.getElementById('refreshPublicRoomsBtn').addEventListener('click', fetchPublicRooms);

  const howToModal = document.getElementById('howToModal');
  document.getElementById('howToPlayModalBtn')?.addEventListener('click', () => {
    howToModal?.classList.remove('hidden');
  });
  document.getElementById('closeHowToBtn')?.addEventListener('click', () => {
    howToModal?.classList.add('hidden');
  });
  howToModal?.addEventListener('click', (e) => {
    if (e.target === howToModal) howToModal.classList.add('hidden');
  });
  document.getElementById('navHomeBtn')?.addEventListener('click', () => {
    if (state.mode === 'MP' && state.room) {
      leaveCurrentRoom();
    } else {
      showScreen('menu');
    }
  });

  fetchPublicRooms();
})();
`;

    fs.writeFileSync(clientPath, updatedClient, 'utf8');
}

async function run() {
    await buildArabicDictionary();
    fs.writeFileSync(path.join(__dirname, 'server', 'dictionary.js'), DICTIONARY_JS, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'server', 'gameEngine.js'), GAME_ENGINE_JS, 'utf8');
    fs.writeFileSync(path.join(__dirname, 'server', 'roomManager.js'), ROOM_MANAGER_JS, 'utf8');
    updateServerIndex();
    updateFrontendFiles();

    const { isValidWord } = require(path.join(__dirname, 'server', 'dictionary.js'));
    console.log('\n✅ Full Arabic + English Support installed successfully!');
    console.log(`🧪 Test Arabic 4-letter "كتاب": ${isValidWord('كتاب', 4, 'ar') ? 'VALID ✅' : 'INVALID ❌'}`);
    console.log(`🧪 Test Arabic 5-letter "مدرسة" & "مدرسه": ${isValidWord('مدرسة', 5, 'ar') && isValidWord('مدرسه', 5, 'ar') ? 'VALID ✅' : 'INVALID ❌'}`);
}

run();