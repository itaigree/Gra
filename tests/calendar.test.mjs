// Checks every day of the years the app offers (5700-5849), in Israel and abroad, against the rules
// table shown in the app ("הצג את לוח הכללים השלם"). The expected psalm is worked out from the Hebrew
// date and the weekday only; the app's answer comes from real Hebcal event data, as in production.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HDate, months, gematriya } from '@hebcal/core';
import { hebcalJson } from './hebcal-mock.mjs';
import logic from '../gra-logic.js';

const { getDayPsalms, formatDateStr, HEBREW_DAY_NAMES } = logic;
const { TISHREI, NISAN, SIVAN, KISLEV, ADAR_I, ADAR_II } = months;
const [SUN, MON, TUE, WED, THU, FRI, SAT] = [0, 1, 2, 3, 4, 5, 6];
const ALL = [SUN, MON, TUE, WED, THU, FRI, SAT];
const WEEKDAY_PSALMS = [24, 48, 82, 94, 81, 93, 92];

// The heading shown for a psalm: its number in Hebrew letters, and the verses for part of a psalm
const psalmLabel = (chapter) => {
  const letters = n => gematriya(n).replace(/[׳״]/g, '');
  const [c, from, to] = String(chapter).split(/[.-]/).map(Number);
  return from ? `${letters(c)} (${letters(from)}-${letters(to)})` : letters(c);
};

// [month, day, weekdays, psalm] — one entry per row of the table. Rows marked abroad only apply
// outside Israel and replace the Israeli rows for that date; the other rows apply in both.
const ISRAEL_ROWS = [
  [TISHREI, 1, ALL, 81], [TISHREI, 2, ALL, 81],
  [TISHREI, 10, ALL, 32],
  [TISHREI, 15, [MON, TUE, THU], 76],
  [TISHREI, 16, [SUN, TUE, WED, FRI], 29],
  [TISHREI, 17, [MON, WED, THU], 50],
  [TISHREI, 18, [TUE, THU, FRI], '94.16-23'], [TISHREI, 18, [SUN], 50],
  [TISHREI, 19, [WED, FRI], '94.1-15'], [TISHREI, 19, [MON], '94.16-23'],
  [TISHREI, 20, [THU], 81], [TISHREI, 20, [SUN, TUE], '94.1-15'],
  [TISHREI, 21, [FRI], 82], [TISHREI, 21, [SUN, MON, WED], 81],
  [TISHREI, 22, [MON, TUE, THU], 12],
  [NISAN, 15, [SUN, TUE, THU], 114],
  [NISAN, 16, [MON, WED, FRI], 78], [NISAN, 16, [SUN], 114],
  [NISAN, 17, [TUE, THU], 80], [NISAN, 17, [MON], 78],
  [NISAN, 18, [WED, FRI], 105], [NISAN, 18, [SUN, TUE], 80],
  [NISAN, 19, [THU], 135], [NISAN, 19, [MON, WED], 105],
  [NISAN, 20, [FRI], 66], [NISAN, 20, [SUN, TUE, THU], 135],
  [NISAN, 21, [MON, WED, FRI], 18],
  [SIVAN, 6, ALL, 19],
];
const ABROAD_ROWS = [
  [TISHREI, 16, ALL, 42],
  [TISHREI, 23, [TUE, WED, FRI], 8], [TISHREI, 23, [SUN], 12],
  // the table gives 78 for the second day abroad without a weekday; after a Shabbat first day the app (like the Israeli
  // row for 16 Nisan on Sunday) says the displaced 114, and 78 the next day. Left for the author to confirm.
  [NISAN, 16, [MON, WED, FRI], 78], [NISAN, 16, [SUN], 114],
  [NISAN, 22, [TUE, THU], 136], [NISAN, 22, [SUN], 18],
  [SIVAN, 7, ALL, 68],
];

const LETTERS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח'];
// Purim is kept on 15 Adar only in Jerusalem, which the table does not cover: the app offers it without the crown
const SHUSHAN_PURIM = 'שושן פורים (ירושלים)';

// The holiday chip the app should offer on this Hebrew date (whether or not it wins), or null.
function holidayLabel(hd, isDiaspora) {
  const m = hd.getMonth(), d = hd.getDate();
  const cholHamoed = (first, name) => `${LETTERS[d - first + 1]}' דחוה"מ ${name}`;
  if (m === TISHREI) {
    if (d === 1 || d === 2) return 'ראש השנה';
    if (d === 10) return 'יום כיפור';
    if (d === 15) return "א' של סוכות";
    if (d === 16 && isDiaspora) return 'ב\' של סוכות (חו"ל)';
    if (d >= 16 && d <= 20) return cholHamoed(isDiaspora ? 17 : 16, 'סוכות');
    if (d === 21) return 'הושענא רבה';
    if (d === 22) return 'שמיני עצרת';
    if (d === 23 && isDiaspora) return 'שמחת תורה (חו"ל)';
  }
  if (m === NISAN) {
    if (d === 15) return "א' של פסח";
    if (d === 16 && isDiaspora) return 'ב\' של פסח (חו"ל)';
    if (d >= 16 && d <= 20) return cholHamoed(isDiaspora ? 17 : 16, 'פסח');
    if (d === 21) return 'שביעי של פסח';
    if (d === 22 && isDiaspora) return 'אחרון של פסח (חו"ל)';
  }
  if (m === SIVAN && d === 6) return 'שבועות';
  if (m === SIVAN && d === 7 && isDiaspora) return 'שני של שבועות (חו"ל)';
  const purimMonth = HDate.isLeapYear(hd.getFullYear()) ? ADAR_II : ADAR_I;
  if (m === purimMonth && d === 14) return 'פורים';
  if (m === purimMonth && d === 15) return SHUSHAN_PURIM;
  const chanukahDay = hd.deltaDays(new HDate(25, KISLEV, hd.getFullYear())) + 1;
  if (chanukahDay >= 1 && chanukahDay <= 8) return `${LETTERS[chanukahDay]}' דחנוכה`;
  return null;
}

function expectedDay(hd, dow, isDiaspora) {
  const m = hd.getMonth(), d = hd.getDate();
  const isRoshChodesh = d === 30 || (d === 1 && m !== TISHREI);
  const holiday = holidayLabel(hd, isDiaspora);
  const chips = [`יום ${HEBREW_DAY_NAMES[dow]}`];
  if (isRoshChodesh) chips.push('ראש חודש');
  if (holiday) chips.push(holiday);

  let psalm;
  if (isRoshChodesh) psalm = 104;
  else if (dow === SAT) psalm = 92;
  else if (holiday && holiday !== SHUSHAN_PURIM) {
    const matches = rows => rows.filter(([rm, rd, days]) => rm === m && rd === d && days.includes(dow));
    const abroad = isDiaspora ? ABROAD_ROWS.filter(([rm, rd]) => rm === m && rd === d) : [];
    const row = abroad.length ? matches(abroad)[0] : matches(ISRAEL_ROWS)[0];
    if (holiday === 'פורים' || holiday.endsWith('דחנוכה')) psalm = holiday === 'פורים' ? 22 : 30;
    else if (!row) throw new Error(`no table row for ${hd.toString()} weekday ${dow} diaspora=${isDiaspora}`);
    else psalm = row[3];
  } else psalm = WEEKDAY_PSALMS[dow];
  return { chips, psalm };
}

function sweep(isDiaspora) {
  const start = new HDate(1, TISHREI, 5700).greg();
  const end = new HDate(29, months.ELUL, 5849).greg();
  const monthCache = new Map();
  const failures = [];
  let days = 0;
  for (let t = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    t <= Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()); t += 86400000) {
    const g = new Date(t);
    const [y, mo, d] = [g.getUTCFullYear(), g.getUTCMonth() + 1, g.getUTCDate()];
    const dateStr = formatDateStr(y, mo, d);
    const key = `${y}-${mo}`;
    if (!monthCache.has(key)) {
      monthCache.clear();
      monthCache.set(key, hebcalJson(new URLSearchParams({ year: y, month: mo, i: isDiaspora ? 'off' : 'on' })).items);
    }
    const hd = new HDate(new Date(y, mo - 1, d));
    const want = expectedDay(hd, g.getUTCDay(), isDiaspora);
    const { events, defaultEvent } = getDayPsalms(dateStr, monthCache.get(key), isDiaspora);
    const got = { chips: events.map(e => e.name), psalm: defaultEvent.chapter };
    days++;
    for (const e of events) {
      if (e.num !== psalmLabel(e.chapter)) failures.push(`${dateStr}: chip ${e.name} is psalm ${e.chapter} but is headed ${e.num}`);
    }
    // On a Shabbat of Chol HaMoed the (uncrowned) festival chip offers the psalm Shabbat pushed to Sunday
    const festivalChip = events.find(e => e.name.includes('דחוה"מ') || e.name === "א' של פסח");
    if (festivalChip && g.getUTCDay() === SAT) {
      const sunday = expectedDay(hd.next(), SUN, isDiaspora);
      if (String(festivalChip.chapter) !== String(sunday.psalm)) {
        failures.push(`${dateStr} (${hd.renderGematriya(true)}, שבת): chip ${festivalChip.name} offers ${festivalChip.chapter}, Sunday's psalm is ${sunday.psalm}`);
      }
    }
    if (String(got.psalm) !== String(want.psalm) || got.chips.join('|') !== want.chips.join('|')) {
      failures.push(`${dateStr} (${hd.renderGematriya(true)}, ${HEBREW_DAY_NAMES[g.getUTCDay()]}): ` +
        `expected ${want.psalm} [${want.chips.join(', ')}] got ${got.psalm} [${got.chips.join(', ')}]`);
    }
  }
  return { days, failures };
}

for (const isDiaspora of [false, true]) {
  test(`every day 5700-5849 ${isDiaspora ? 'abroad' : 'in Israel'} follows the rules table`, () => {
    const { days, failures } = sweep(isDiaspora);
    assert.ok(days > 54000, `only ${days} days checked`);
    assert.equal(failures.length, 0, `${failures.length} wrong days, e.g.:\n${failures.slice(0, 25).join('\n')}`);
  });
}
