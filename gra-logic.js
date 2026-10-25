// הלוגיקה של בחירת שיר של יום לפי מנהג הגר"א, בלי React ובלי רשת.
// נטען ע"י index.html (window.GraLogic) וע"י הבדיקות ב-Node (module.exports).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GraLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const REGULAR_DAYS = {
    0: { num: 'כד', chapter: 24 },
    1: { num: 'מח', chapter: 48 },
    2: { num: 'פב', chapter: 82 },
    3: { num: 'צד', chapter: 94 },
    4: { num: 'פא', chapter: 81 },
    5: { num: 'צג', chapter: 93 },
    6: { num: 'צב', chapter: 92 },
  };

  const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

  const ROSH_CHODESH = { name: 'ראש חודש', num: 'קד', chapter: 104 };

  const PESACH_SEQ = [
    { num: 'קיד', chapter: 114 }, { num: 'עח', chapter: 78 }, { num: 'פ', chapter: 80 },
    { num: 'קה', chapter: 105 }, { num: 'קלה', chapter: 135 }, { num: 'סו', chapter: 66 },
  ];

  const SUKKOT_CHM_SEQ = [
    { num: 'כט', chapter: 29 }, { num: 'נ', chapter: 50 }, { num: 'צד (טז-כג)', chapter: '94.16-23' },
    { num: 'צד (א-טו)', chapter: '94.1-15' }, { num: 'פא', chapter: 81 }, { num: 'פב', chapter: 82 }
  ];

  const getHebrewNumber = (num) => {
    if (!num) return '';
    if (num === 15) return 'ט״ו';
    if (num === 16) return 'ט״ז';
    const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    const tens = ['', 'י', 'כ', 'ל'];
    const result = tens[Math.floor(num / 10)] + units[num % 10];
    return result.length === 1 ? result + '׳' : result.slice(0, -1) + '״' + result.slice(-1);
  };

  const getHebrewVerseNumber = (num) => {
    let str = '', n = num;
    while(n >= 400) { str += 'ת'; n -= 400; }
    if (n >= 300) { str += 'ש'; n -= 300; }
    if (n >= 200) { str += 'ר'; n -= 200; }
    if (n >= 100) { str += 'ק'; n -= 100; }
    if (n === 15) return str + 'טו';
    if (n === 16) return str + 'טז';
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    str += tens[Math.floor((n % 100) / 10)] + units[n % 10];
    return str;
  };

  const getHebrewYearString = (year) => {
    if (!year) return '';
    let y = year % 1000, str = '';
    while (y >= 400) { str += 'ת'; y -= 400; }
    if (y >= 300) { str += 'ש'; y -= 300; }
    if (y >= 200) { str += 'ר'; y -= 200; }
    if (y >= 100) { str += 'ק'; y -= 100; }
    const tens = ['', 'י', 'כ', 'ל', 'מ', 'נ', 'ס', 'ע', 'פ', 'צ'];
    const units = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט'];
    if (y % 100 === 15) str += 'טו';
    else if (y % 100 === 16) str += 'טז';
    else str += tens[Math.floor((y % 100) / 10)] + units[y % 10];
    return str.length > 1 ? 'ה׳ ' + str.slice(0, -1) + '״' + str.slice(-1) : 'ה׳ ' + str + '׳';
  };

  const isHebrewLeapYear = (year) => (7 * year + 1) % 19 < 7;

  // תאריכים נשמרים כמחרוזת YYYY-MM-DD. new Date('YYYY-MM-DD') מתפרש כחצות UTC, ולכן getDay()/getDate()
  // המקומיים נותנים את היום הקודם מערבית ל-UTC (אמריקה). כל החישובים כאן ב-UTC ואינם תלויים באזור הזמן.
  // Date.UTC מפרש שנים 0-99 כ-1900-1999, ולכן השנה נקבעת בנפרד
  const toUtcDate = (year, month, day) => {
    const d = new Date(0);
    d.setUTCFullYear(year, month - 1, day);
    return d;
  };

  const parseDateStr = (dateStr) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
    if (!match) return null;
    const [year, month, day] = match.slice(1).map(Number);
    const d = toUtcDate(year, month, day);
    // תאריך שאינו קיים (למשל 2026-02-30)
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
    return { year, month, day };
  };

  const formatDateStr = (year, month, day) =>
    `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getDayOfWeek = (dateStr) => {
    const { year, month, day } = parseDateStr(dateStr);
    return toUtcDate(year, month, day).getUTCDay();
  };

  const addDays = (dateStr, amount) => {
    const { year, month, day } = parseDateStr(dateStr);
    const d = toUtcDate(year, month, day + amount);
    return formatDateStr(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  };

  // היום לפי השעון המקומי; מ-18:00 ואילך מציגים כבר את השיר של מחר
  const getTodayDateStr = (now = new Date()) => {
    const today = formatDateStr(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return now.getHours() >= 18 ? addDays(today, 1) : today;
  };

  const getHolidayPsalm = (holidayName, dayOfWeek, isDiaspora) => {
    // מנגנון סינון קשיח נגד כל מה שהוא "ערב" חג כדי למנוע קפיצות מוקדמות (כמו Erev Rosh Hashana)
    if (holidayName.includes('Erev')) return null;

    // 'Rosh Hashana 5787' / 'Rosh Hashana II', אבל לא 'Rosh Hashana LaBehemot' (א' באלול)
    if (/^Rosh Hashana( \d+| II)$/.test(holidayName)) return { num: 'פא', chapter: 81, reason: 'ראש השנה' };
    if (holidayName === 'Yom Kippur') return { num: 'לב', chapter: 32, reason: 'יום כיפור' };
    if (holidayName === 'Purim') return { num: 'כב', chapter: 22, reason: 'פורים' };
    // שושן פורים הוא פורים רק בירושלים, ולכן הוא מוצג כאפשרות בלי כתר
    if (holidayName === 'Shushan Purim') return { num: 'כב', chapter: 22, reason: 'שושן פורים (ירושלים)', optional: true };

    if (holidayName.includes('Shavuot')) {
       if (holidayName.includes('II') && isDiaspora) return { num: 'סח', chapter: 68, reason: 'שני של שבועות (חו"ל)' };
       if (!holidayName.includes('II')) return { num: 'יט', chapter: 19, reason: 'שבועות' };
    }

    if (holidayName.includes('Chanukah')) {
      // ב-Hebcal כל יום נקרא לפי מספר הנרות שמדליקים בערבו: 'Chanukah: 2 Candles' הוא היום הראשון,
      // 'Chanukah: 1 Candle' הוא ערב חנוכה, והיום האחרון הוא 'Chanukah: 8th Day'
      const candles = holidayName.match(/(\d+) Candles?/);
      const num = candles ? parseInt(candles[1], 10) - 1 : (/8th Day/.test(holidayName) ? 8 : 0);
      if (num < 1 || num > 8) return null;
      const hebLetters = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
      return { num: 'ל', chapter: 30, reason: `${hebLetters[num]}' דחנוכה` };
    }

    const romanToArabic = { I:1, II:2, III:3, IV:4, V:5, VI:6, VII:7, VIII:8 };
    const hebLetters = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];

    if (holidayName.includes('Pesach')) {
       const match = holidayName.match(/Pesach ([IVX]+)/);
       if (match) {
          const dayNum = romanToArabic[match[1]];
          if (dayNum === 7) return { num: 'יח', chapter: 18, reason: 'שביעי של פסח' };
          if (dayNum === 8 && isDiaspora) {
              if (dayOfWeek === 0) return { num: 'יח', chapter: 18, reason: 'אחרון של פסח (חו"ל)' }; // יום א'
              return { num: 'קלו', chapter: 136, reason: 'אחרון של פסח (חו"ל)' };
          }

          if (dayNum >= 1 && dayNum <= 6) {
             // המזמורים נאמרים לפי הסדר בימים שאינם שבת; בשבת מוצג המזמור שנדחה ממנה (ולא של אתמול)
             let saidBefore = 0;
             for (let d = 1; d < dayNum; d++) {
               const dow = (dayOfWeek - (dayNum - d) + 7) % 7;
               if (dow !== 6) saidBefore++;
             }
             const psalmInfo = PESACH_SEQ[saidBefore];
             let reason = dayNum === 1 ? "א' של פסח" : (dayNum === 2 && isDiaspora) ? "ב' של פסח (חו\"ל)" : `${hebLetters[isDiaspora ? dayNum - 2 : dayNum - 1]}' דחוה"מ פסח`;
             return { num: psalmInfo.num, chapter: psalmInfo.chapter, reason: reason };
          }
       }
    }

    let isSukkot = holidayName.includes('Sukkot');
    let isHoshanaRabba = /Hoshana Rabb?a/.test(holidayName); // ב-Hebcal: 'Sukkot VII (Hoshana Raba)'

    if (isSukkot || isHoshanaRabba) {
        let dayNum = 0;
        if (isHoshanaRabba) {
            dayNum = 7;
        } else {
            const match = holidayName.match(/Sukkot ([IVX]+)/);
            if (match) dayNum = romanToArabic[match[1]];
        }

        if (dayNum === 1) return { num: 'עו', chapter: 76, reason: 'א\' של סוכות' };
        if (dayNum === 2 && isDiaspora) return { num: 'מב', chapter: 42, reason: 'ב\' של סוכות (חו"ל)' };

        if (dayNum >= 2 && dayNum <= 7) {
           let saidBefore = 0;
           for (let d = 2; d < dayNum; d++) {
             const dow = (dayOfWeek - (dayNum - d) + 7) % 7;
             if (dow !== 6) saidBefore++;
           }

           const psalmInfo = SUKKOT_CHM_SEQ[saidBefore];

           let reason = isHoshanaRabba ? 'הושענא רבה' : `${hebLetters[isDiaspora ? dayNum - 2 : dayNum - 1]}' דחוה"מ סוכות`;
           return { num: psalmInfo.num, chapter: psalmInfo.chapter, reason: reason };
        }
    }

    if (holidayName.includes('Atzeret')) return { num: 'יב', chapter: 12, reason: 'שמיני עצרת' };
    if (holidayName.includes('Simchat Torah') && isDiaspora) {
        if (dayOfWeek === 0) return { num: 'יב', chapter: 12, reason: 'שמחת תורה (חו"ל)' }; // יום א'
        return { num: 'ח', chapter: 8, reason: 'שמחת תורה (חו"ל)' };
    }

    return null;
  };

  // כל השירים האפשריים ליום (לכפתורים) והשיר שהגר"א פוסק לו (כתר).
  // items: רשימת האירועים של Hebcal (מספיק שתכיל את היום הזה).
  const getDayPsalms = (dateStr, items, isDiaspora) => {
    const dayOfWeek = getDayOfWeek(dateStr);
    const daysEvents = (items || []).filter(item => item.date === dateStr);

    const events = [{
      name: `יום ${HEBREW_DAY_NAMES[dayOfWeek]}`,
      chapter: REGULAR_DAYS[dayOfWeek].chapter,
      num: REGULAR_DAYS[dayOfWeek].num,
      isGraDefault: false
    }];

    const isShabbat = dayOfWeek === 6;
    const isRoshChodesh = daysEvents.some(e => e.title.includes('Rosh Chodesh'));

    if (isRoshChodesh) {
      events.push({ name: ROSH_CHODESH.name, chapter: ROSH_CHODESH.chapter, num: ROSH_CHODESH.num, isGraDefault: false });
    }

    let holidayPsalmResult = null;
    for (const event of daysEvents) {
      const hp = getHolidayPsalm(event.title, dayOfWeek, isDiaspora);
      if (hp) {
        if (!hp.optional) holidayPsalmResult = hp;
        events.push({ name: hp.reason, chapter: hp.chapter, num: hp.num, isGraDefault: false });
      }
    }

    // ראש חודש דוחה הכל, שבת דוחה יום טוב וחנוכה
    let winnerName;
    if (isRoshChodesh) winnerName = ROSH_CHODESH.name;
    else if (isShabbat) winnerName = `יום ${HEBREW_DAY_NAMES[6]}`;
    else if (holidayPsalmResult) winnerName = holidayPsalmResult.reason;
    else winnerName = `יום ${HEBREW_DAY_NAMES[dayOfWeek]}`;

    const defaultEvent = events.find(e => e.name === winnerName) || events[0];
    defaultEvent.isGraDefault = true;
    return { events, defaultEvent };
  };

  return {
    REGULAR_DAYS, HEBREW_DAY_NAMES, ROSH_CHODESH, PESACH_SEQ, SUKKOT_CHM_SEQ,
    getHebrewNumber, getHebrewVerseNumber, getHebrewYearString, isHebrewLeapYear,
    parseDateStr, formatDateStr, getDayOfWeek, addDays, getTodayDateStr,
    getHolidayPsalm, getDayPsalms,
  };
});
