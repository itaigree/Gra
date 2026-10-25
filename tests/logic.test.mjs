// Unit tests for gra-logic.js: Hebcal title parsing, time-zone-independent dates, Hebrew numerals.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gematriya } from '@hebcal/core';
import logic from '../gra-logic.js';

const {
  getHolidayPsalm, getDayPsalms, getDayOfWeek, addDays, getTodayDateStr,
  getHebrewNumber, getHebrewVerseNumber, getHebrewYearString, isHebrewLeapYear,
} = logic;

const TIME_ZONES = [
  'Asia/Jerusalem', 'UTC', 'Europe/London', 'Europe/Lisbon', 'Europe/Paris', 'America/New_York',
  'America/Los_Angeles', 'America/Sao_Paulo', 'Australia/Sydney', 'Pacific/Auckland',
  'Pacific/Kiritimati', 'Pacific/Pago_Pago',
];

const inTimeZone = (tz, fn) => {
  const saved = process.env.TZ;
  process.env.TZ = tz;
  try { fn(); } finally { if (saved === undefined) delete process.env.TZ; else process.env.TZ = saved; }
};

test('Chanukah: every day is recognised, Erev Chanukah is not', () => {
  assert.equal(getHolidayPsalm('Chanukah: 1 Candle', 4, false), null);
  const letters = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז'];
  for (let candles = 2; candles <= 8; candles++) {
    const p = getHolidayPsalm(`Chanukah: ${candles} Candles`, 0, false);
    assert.equal(p.chapter, 30);
    assert.equal(p.reason, `${letters[candles - 2]}' דחנוכה`);
  }
  assert.deepEqual(getHolidayPsalm('Chanukah: 8th Day', 0, true), { num: 'ל', chapter: 30, reason: "ח' דחנוכה" });
});

test('Hoshana Rabba is labelled as such in Israel and abroad', () => {
  for (const isDiaspora of [false, true]) {
    for (const dow of [0, 1, 3, 5]) {
      assert.equal(getHolidayPsalm('Sukkot VII (Hoshana Raba)', dow, isDiaspora).reason, 'הושענא רבה');
    }
  }
  assert.equal(getHolidayPsalm('Sukkot VII (Hoshana Raba)', 5, false).chapter, 82);
  assert.equal(getHolidayPsalm('Sukkot VII (Hoshana Raba)', 0, false).chapter, 81);
});

test('only the real holidays match, not look-alike Hebcal titles', () => {
  for (const title of ['Rosh Hashana LaBehemot', 'Purim Katan', 'Shushan Purim Katan', 'Purim Meshulash', 'Pesach Sheni',
    'Erev Rosh Hashana', 'Erev Yom Kippur', 'Erev Sukkot', 'Erev Pesach', 'Erev Shavuot', 'Erev Purim',
    'Rosh Chodesh Elul', 'Tu BiShvat', 'Lag BaOmer', 'Tish’a B’Av']) {
    for (const isDiaspora of [false, true]) assert.equal(getHolidayPsalm(title, 1, isDiaspora), null, title);
  }
  assert.equal(getHolidayPsalm('Rosh Hashana 5787', 6, false).chapter, 81);
  assert.equal(getHolidayPsalm('Rosh Hashana II', 0, false).chapter, 81);
  assert.equal(getHolidayPsalm('Yom Kippur', 1, false).chapter, 32);
  assert.equal(getHolidayPsalm('Purim', 2, false).chapter, 22);
});

test('Shushan Purim is offered, but never chosen as the default', () => {
  assert.deepEqual(getHolidayPsalm('Shushan Purim', 3, false), { num: 'כב', chapter: 22, reason: 'שושן פורים (ירושלים)', optional: true });
  const items = [{ date: '2027-03-24', title: 'Shushan Purim' }];
  const { events, defaultEvent } = getDayPsalms('2027-03-24', items, false);
  assert.deepEqual(events.map(e => e.name), ['יום רביעי', 'שושן פורים (ירושלים)']);
  assert.equal(defaultEvent.chapter, 94);
});

test('Shavuot, Shmini Atzeret and Simchat Torah', () => {
  assert.equal(getHolidayPsalm('Shavuot', 0, false).chapter, 19);
  assert.equal(getHolidayPsalm('Shavuot I', 0, true).chapter, 19);
  assert.equal(getHolidayPsalm('Shavuot II', 1, true).chapter, 68);
  assert.equal(getHolidayPsalm('Shmini Atzeret', 4, false).chapter, 12);
  assert.equal(getHolidayPsalm('Simchat Torah', 5, true).chapter, 8);
  assert.equal(getHolidayPsalm('Simchat Torah', 0, true).chapter, 12);
});

test('getDayOfWeek and addDays do not depend on the time zone', () => {
  for (const tz of TIME_ZONES) {
    inTimeZone(tz, () => {
      assert.equal(getDayOfWeek('2026-10-24'), 6, tz);
      assert.equal(getDayOfWeek('2026-03-01'), 0, tz);
      let date = '2025-12-25';
      let expected = Date.UTC(2025, 11, 25);
      for (let i = 0; i < 800; i++) {
        const next = addDays(date, 1);
        expected += 86400000;
        assert.equal(next, new Date(expected).toISOString().slice(0, 10), `${tz} ${date} +1`);
        assert.equal(addDays(next, -1), date, `${tz} ${next} -1`);
        date = next;
      }
    });
  }
});

test('dates before the year 100 and impossible dates', () => {
  assert.equal(getDayOfWeek('0050-10-25'), new Date('0050-10-25T00:00:00Z').getUTCDay());
  assert.equal(addDays('0099-12-31', 1), '0100-01-01');
  assert.equal(addDays('0001-01-01', -1), '0000-12-31');
  for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-1-01', '', null, '2026-10-24T00:00']) {
    assert.equal(logic.parseDateStr(bad), null, String(bad));
  }
  assert.deepEqual(logic.parseDateStr('2024-02-29'), { year: 2024, month: 2, day: 29 });
});

test('getTodayDateStr uses the local date and moves to tomorrow from 18:00', () => {
  for (const tz of TIME_ZONES) {
    inTimeZone(tz, () => {
      assert.equal(getTodayDateStr(new Date(2026, 9, 24, 0, 30)), '2026-10-24', tz);
      assert.equal(getTodayDateStr(new Date(2026, 9, 24, 17, 59)), '2026-10-24', tz);
      assert.equal(getTodayDateStr(new Date(2026, 9, 24, 18, 0)), '2026-10-25', tz);
      assert.equal(getTodayDateStr(new Date(2026, 11, 31, 23, 59)), '2027-01-01', tz);
      assert.equal(getTodayDateStr(new Date(2027, 2, 28, 19, 0)), '2027-03-29', tz);
    });
  }
});

test('getDayPsalms reads the weekday from the date string, in every time zone', () => {
  for (const tz of TIME_ZONES) {
    inTimeZone(tz, () => {
      const { events, defaultEvent } = getDayPsalms('2026-10-24', [], false);
      assert.deepEqual(events.map(e => e.name), ['יום שבת'], tz);
      assert.equal(defaultEvent.chapter, 92, tz);
    });
  }
});

test('Hebrew numerals match @hebcal/core', () => {
  for (let n = 1; n <= 30; n++) assert.equal(getHebrewNumber(n), gematriya(n), `day ${n}`);
  for (let n = 1; n <= 176; n++) assert.equal(getHebrewVerseNumber(n), gematriya(n).replace(/[׳״]/g, ''), `verse ${n}`);
  for (let y = 5700; y < 5850; y++) assert.equal(getHebrewYearString(y), `ה׳ ${gematriya(y % 1000)}`, `year ${y}`);
});

test('isHebrewLeapYear', () => {
  const leap = [5779, 5782, 5784, 5787, 5790];
  for (let y = 5779; y <= 5790; y++) assert.equal(isHebrewLeapYear(y), leap.includes(y), String(y));
});

test('index.html loads the same library versions the tests run', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const { devDependencies } = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  for (const name of ['react', 'react-dom', '@babel/standalone']) {
    const pinned = html.match(new RegExp(`unpkg\\.com/${name.replace('/', '\\/')}@([^/]+)/`));
    assert.ok(pinned, `${name} is not loaded with an exact version`);
    assert.equal(pinned[1], devDependencies[name], name);
  }
});

test('the service worker precaches the same library URLs index.html loads', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const sw = fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const pageScripts = [...html.matchAll(/<script src="(https:[^"]+)"/g)].map(m => m[1]);
  const precached = [...sw.matchAll(/\['(https:[^']+)', '(?:no-)?cors'\]/g)].map(m => m[1]);
  assert.deepEqual(precached.sort(), pageScripts.sort());
});
