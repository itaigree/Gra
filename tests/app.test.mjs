// End-to-end tests: the real index.html in Chromium, with Hebcal/Sefaria/CDNs answered locally (see harness.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, startServer, openApp, readScreen, waitForScreen, VERSE_COUNTS } from './harness.mjs';

let browser, server;
before(async () => { [browser, server] = await Promise.all([chromium.launch(), startServer()]); });
after(async () => { await browser?.close(); await server?.close(); });

const open = (options) => openApp(browser, server.url, options);
const crowned = (screen) => screen.chips.filter(c => c.graDefault).map(c => c.name);
const chipNames = (screen) => screen.chips.map(c => c.name);
const clickChip = (page, name) => page.locator('[data-testid=psalm-chip]', { hasText: name }).click();
const nextDay = (page) => page.locator('button[title="יום הבא"]').click();
const prevDay = (page) => page.locator('button[title="יום קודם"]').click();
const showGregorian = (page) => page.getByRole('button', { name: 'לועזי' }).click();
const hebrewSelect = (page, i) => page.locator('footer select').nth(i);
const applyButton = (page) => page.getByRole('button', { name: 'הצג את התאריך שנבחר', exact: true });
const applyDate = (page) => applyButton(page).click();
const applyEnabled = async (page) => (await applyButton(page).getAttribute('aria-disabled')) === 'false';
const dateAlert = (page) => page.locator('footer [role=alert]');
const isHebrewDate = (screen, day, year) => screen.hebrewDate.startsWith(`${day} `) && screen.hebrewDate.endsWith(` ${year}`);
// A snapshot without waiting for loading to finish
const glance = (page) => page.evaluate(() => ({
  loadingDay: document.body.innerText.includes('מחשב זמנים ומועדים'),
  loadingText: document.body.innerText.includes('טוען פסוקים'),
  error: document.querySelector('[role=alert]')?.textContent || '',
}));
const cachedUrls = (page) => page.evaluate(async () =>
  (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(r => `${name} ${r.url}`)))).flat());
async function waitForCache(page, predicate, what) {
  for (let tries = 0; ; tries++) {
    const urls = await cachedUrls(page);
    if (predicate(urls)) return urls;
    assert.ok(tries < 50, `cache never had ${what}: ${urls.join(', ')}`);
    await page.waitForTimeout(100);
  }
}

test('shows the Shabbat psalm with its full text', async () => {
  const { page, context, errors } = await open({ now: '2026-10-24T09:00:00+03:00' });
  const screen = await readScreen(page);
  assert.ok(isHebrewDate(screen, 'י״ג', 'תשפ״ז'), screen.hebrewDate);
  assert.deepEqual(chipNames(screen), ['יום שבת']);
  assert.deepEqual(crowned(screen), ['יום שבת']);
  assert.equal(screen.heading, 'פרק צב');
  assert.equal(screen.verses.length, VERSE_COUNTS[92]);
  assert.deepEqual(screen.verses[0], { num: 'א', text: 'תהלים 92 פסוק 1' });
  assert.equal(await page.locator('#root .boot').count(), 0); // the loading placeholder is gone
  assert.deepEqual(errors, []);
  await context.close();
});

// Shabbat 24 Oct 2026, 09:00 local time
for (const [timezoneId, now] of [
  ['America/New_York', '2026-10-24T09:00:00-04:00'], ['America/Los_Angeles', '2026-10-24T09:00:00-07:00'],
  ['Pacific/Pago_Pago', '2026-10-24T09:00:00-11:00'], ['Europe/London', '2026-10-24T09:00:00+01:00'],
  ['Pacific/Kiritimati', '2026-10-24T09:00:00+14:00'],
]) {
  test(`shows the right weekday in ${timezoneId}`, async () => {
    const { page, context } = await open({ timezoneId, now });
    const screen = await readScreen(page);
    assert.deepEqual(crowned(screen), ['יום שבת']);
    assert.equal(screen.heading, 'פרק צב');
    assert.ok(isHebrewDate(screen, 'י״ג', 'תשפ״ז'), screen.hebrewDate);
    await context.close();
  });
}

test('holidays on the first of a Gregorian month are found from America', async () => {
  // Mon 1 Nov 2027 = Rosh Chodesh Cheshvan 5788
  let { page, context } = await open({ timezoneId: 'America/Los_Angeles', now: '2027-11-01T09:00:00-07:00' });
  let screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום שני', 'ראש חודש']);
  assert.deepEqual(crowned(screen), ['ראש חודש']);
  await context.close();

  // Thu 1 Oct 2026 = 20 Tishrei 5787, Chol HaMoed Sukkot
  ({ page, context } = await open({ timezoneId: 'America/New_York', now: '2026-10-01T09:00:00-04:00' }));
  screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['ה\' דחוה"מ סוכות']);
  assert.equal(screen.heading, 'פרק פא');
  await context.close();
});

test('from 18:00 the next day is shown', async () => {
  const { page, context } = await open({ now: '2026-10-23T18:30:00+03:00' }); // Friday evening
  const screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['יום שבת']);
  await context.close();
});

test('Chanukah: the Chanukah psalm is chosen on every weekday of the festival', async () => {
  // 5787: 25 Kislev = Sat 5 Dec 2026, Rosh Chodesh Tevet = 10-11 Dec, 8th day = Sat 12 Dec
  const { page, context } = await open({ now: '2026-12-06T08:00:00+02:00' });
  let screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום ראשון', "ב' דחנוכה"]);
  assert.deepEqual(crowned(screen), ["ב' דחנוכה"]);
  assert.equal(screen.heading, 'פרק ל');
  assert.equal(screen.verses.length, VERSE_COUNTS[30]);

  for (const day of ["ג' דחנוכה", "ד' דחנוכה", "ה' דחנוכה"]) {
    await nextDay(page);
    screen = await waitForScreen(page, s => crowned(s)[0] === day);
    assert.equal(screen.heading, 'פרק ל');
  }
  await nextDay(page); // Thu 10 Dec: 30 Kislev
  screen = await waitForScreen(page, s => s.chips.length === 3);
  assert.deepEqual(chipNames(screen), ['יום חמישי', 'ראש חודש', "ו' דחנוכה"]);
  assert.deepEqual(crowned(screen), ['ראש חודש']);
  assert.equal(screen.heading, 'פרק קד');

  // the other options can still be opened
  await clickChip(page, "ו' דחנוכה");
  screen = await waitForScreen(page, s => s.heading === 'פרק ל');
  assert.deepEqual(screen.chips.filter(c => c.active).map(c => c.name), ["ו' דחנוכה"]);
  assert.ok(screen.verses.every(v => v.text.startsWith('תהלים 30 ')));
  await context.close();
});

test('next/previous day across daylight-saving changes', async () => {
  for (const [timezoneId, from, expected] of [
    ['America/New_York', '2026-03-07T12:00:00-05:00', ['2026-03-08', '2026-03-09', '2026-03-10']],
    ['America/New_York', '2026-10-31T12:00:00-04:00', ['2026-11-01', '2026-11-02', '2026-11-03']],
    ['Europe/London', '2026-03-28T12:00:00Z', ['2026-03-29', '2026-03-30', '2026-03-31']],
    ['Asia/Jerusalem', '2026-10-24T12:00:00+03:00', ['2026-10-25', '2026-10-26', '2026-10-27']],
  ]) {
    const { page, context } = await open({ timezoneId, now: from });
    await readScreen(page);
    await showGregorian(page);
    for (const date of expected) {
      await nextDay(page);
      await waitForScreen(page, s => s.gregorianInput === date).catch(e => assert.fail(`${timezoneId} forward to ${date}: ${e.message}`));
    }
    for (const date of [...expected].reverse().slice(1)) {
      await prevDay(page);
      await waitForScreen(page, s => s.gregorianInput === date).catch(e => assert.fail(`${timezoneId} back to ${date}: ${e.message}`));
    }
    await context.close();
  }
});

test('a slow answer for an earlier date never overwrites a later one', async () => {
  let calls = 0;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday
    delay: url => (url.includes('/hebcal?') && ++calls === 2 ? 1500 : 0), // Monday's events are slow
  });
  await readScreen(page);
  await nextDay(page); // Monday (slow)
  await nextDay(page); // Tuesday (fast)
  await page.waitForTimeout(2000);
  const screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['יום שלישי']);
  assert.equal(screen.heading, 'פרק פב');
  assert.ok(screen.verses.every(v => v.text.startsWith('תהלים 82 ')));
  await context.close();
});

test('the text shown always belongs to the chapter in the heading', async () => {
  let sefariaCalls = 0;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday (24); its text is slow
    delay: url => (url.includes('sefaria') && ++sefariaCalls === 1 ? 1500 : 0),
  });
  await page.getByText('טוען פסוקים').waitFor(); // Sunday's psalm is on its way
  const sampling = page.evaluate(() => new Promise(resolve => {
    const seen = [];
    const timer = setInterval(() => {
      const heading = document.querySelector('main h3')?.textContent;
      const verse = document.querySelector('[data-testid=verse] p')?.textContent;
      if (heading && verse) seen.push([heading, verse]);
    }, 10);
    setTimeout(() => { clearInterval(timer); resolve(seen); }, 2500);
  }));
  await nextDay(page); // Monday (48), fast, while Sunday's text is still on its way
  const seen = await sampling;
  assert.ok(seen.length > 0);
  for (const [heading, verse] of seen) {
    assert.equal(heading === 'פרק כד', verse.startsWith('תהלים 24 '), `${heading} shown with "${verse}"`);
  }
  const screen = await readScreen(page);
  assert.equal(screen.heading, 'פרק מח');
  assert.ok(screen.verses.every(v => v.text.startsWith('תהלים 48 ')));
  await context.close();
});

test('Sukkot: partial psalm 94 is numbered from its first verse', async () => {
  // 18 Tishrei 5787 = Tue 29 Sep 2026 -> 94:16-23
  const { page, context } = await open({ now: '2026-09-29T09:00:00+03:00' });
  const screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['ג\' דחוה"מ סוכות']);
  assert.equal(screen.heading, 'פרק צד (טז-כג)');
  assert.deepEqual(screen.verses.map(v => v.num), ['טז', 'יז', 'יח', 'יט', 'כ', 'כא', 'כב', 'כג']);
  assert.equal(screen.verses[0].text, 'תהלים 94 פסוק 16');
  await context.close();
});

test('Hoshana Rabba is named, abroad too', async () => {
  const { page, context } = await open({ now: '2026-10-02T09:00:00+03:00' });
  let screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['הושענא רבה']);
  assert.equal(screen.heading, 'פרק פב');
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  screen = await waitForScreen(page, s => s.chips.length > 0);
  assert.deepEqual(crowned(screen), ['הושענא רבה']);
  await context.close();
});

test('the diaspora switch adds the second day of Shavuot', async () => {
  const { page, context } = await open({ now: '2027-06-12T09:00:00+03:00' }); // Shabbat 7 Sivan 5787
  let screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום שבת']);
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  screen = await waitForScreen(page, s => s.chips.length === 2);
  assert.deepEqual(chipNames(screen), ['יום שבת', 'שני של שבועות (חו"ל)']);
  assert.deepEqual(crowned(screen), ['יום שבת']);
  await context.close();
});

test('the Hebrew date pickers show the loaded date, including Shvat and Adar', async () => {
  const { page, context, apiRequests } = await open({ now: '2027-01-20T09:00:00+02:00' }); // 12 Sh'vat 5787, a leap year
  let screen = await readScreen(page);
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['י״ב', 'שבט', 'ה׳ תשפ״ז']);
  const months = await hebrewSelect(page, 1).locator('option').allTextContents();
  assert.ok(months.includes("אדר א'") && months.includes("אדר ב'") && !months.includes('אדר'), months.join());

  await hebrewSelect(page, 0).selectOption('14');
  await hebrewSelect(page, 1).selectOption('Adar II'); // Purim of a leap year
  await applyDate(page);
  screen = await waitForScreen(page, s => crowned(s)[0] === 'פורים');
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['י״ד', "אדר ב'", 'ה׳ תשפ״ז']);

  await hebrewSelect(page, 2).selectOption('5788'); // a regular year has a single Adar
  assert.equal((await readScreen(page)).hebrewSelects[1].label, 'אדר');
  await applyDate(page);
  screen = await waitForScreen(page, s => isHebrewDate(s, 'י״ד', 'תשפ״ח') && crowned(s)[0] === 'פורים');
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['י״ד', 'אדר', 'ה׳ תשפ״ח']);
  // the app asks for "Adar" itself rather than relying on the server to understand "Adar II" in a regular year
  assert.ok(apiRequests.some(u => u.includes('hy=5788&hm=Adar&')), apiRequests.filter(u => u.includes('h2g')).join('\n'));
  await context.close();
});

test('Purim Katan is an ordinary day', async () => {
  const { page, context } = await open({ now: '2027-02-21T09:00:00+02:00' }); // 14 Adar I 5787, Sunday
  const screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום ראשון']);
  assert.equal(screen.heading, 'פרק כד');
  await context.close();
});

test('a failed text request shows an error with a working retry button', async () => {
  let failures = 1;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00',
    fail: url => (url.includes('sefaria') && failures-- > 0 ? 'abort' : false),
  });
  let screen = await waitForScreen(page, s => s.error !== '');
  assert.match(screen.error, /שגיאה/);
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.equal(screen.error, '');
  assert.equal(screen.heading, 'פרק כד');
  assert.equal(screen.verses.length, VERSE_COUNTS[24]);
  await context.close();
});

test('a calendar server error shows an error, then recovers', async () => {
  let failures = 1;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00',
    fail: url => (url.includes('/hebcal?') && failures-- > 0 ? '500' : false),
  });
  let screen = await waitForScreen(page, s => s.error !== '');
  assert.match(screen.error, /שגיאה/);
  assert.equal(screen.hebrewDate, '');
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.equal(screen.error, '');
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  await context.close();
});

test('Shushan Purim is offered without the crown', async () => {
  const { page, context } = await open({ now: '2027-03-24T09:00:00+02:00' }); // 15 Adar II 5787, Wednesday
  const screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום רביעי', 'שושן פורים (ירושלים)']);
  assert.deepEqual(crowned(screen), ['יום רביעי']);
  assert.equal(screen.heading, 'פרק צד');
  await context.close();
});

test('an app left open moves on to the next day by itself, unless another date was chosen', async () => {
  const { page, context } = await open({ now: '2026-10-23T17:50:00+03:00' }); // Friday
  assert.deepEqual(crowned(await readScreen(page)), ['יום שישי']);
  const comeBack = async (time) => {
    await page.clock.setFixedTime(new Date(time));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  };
  await comeBack('2026-10-23T18:30:00+03:00'); // from 18:00 the next day is shown
  assert.deepEqual(crowned(await waitForScreen(page, s => s.chips[0]?.name === 'יום שבת')), ['יום שבת']);
  await comeBack('2026-10-25T07:00:00+02:00'); // reopened two days later
  assert.deepEqual(crowned(await waitForScreen(page, s => s.chips[0]?.name === 'יום ראשון')), ['יום ראשון']);

  await prevDay(page); // the user chose a date: leave it alone
  await waitForScreen(page, s => s.chips[0]?.name === 'יום שבת');
  await comeBack('2026-10-26T07:00:00+02:00');
  await page.waitForTimeout(500);
  assert.equal((await readScreen(page)).chips[0].name, 'יום שבת');
  await page.getByRole('button', { name: 'הצג את היום' }).click();
  await waitForScreen(page, s => s.chips[0]?.name === 'יום שני');
  await context.close();
});

test('the location choice is remembered', async () => {
  const { page, context } = await open({ now: '2027-06-12T09:00:00+03:00' }); // 7 Sivan: Shavuot II abroad
  await readScreen(page);
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  await waitForScreen(page, s => s.chips.length === 2);
  await page.reload();
  const screen = await waitForScreen(page, s => s.chips.length > 0);
  assert.deepEqual(chipNames(screen), ['יום שבת', 'שני של שבועות (חו"ל)']);
  assert.equal(await page.getByRole('button', { name: 'בחו"ל' }).getAttribute('aria-pressed'), 'true');
  await context.close();
});

test('the rules table closes with Escape', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await page.getByRole('button', { name: /לוח הכללים/ }).click();
  await page.getByRole('heading', { name: /שיר של יום לפי מנהג/ }).waitFor();
  assert.ok(await page.evaluate(() => document.body.classList.contains('modal-open')));
  await page.keyboard.press('Escape');
  await page.getByRole('heading', { name: /שיר של יום לפי מנהג/ }).waitFor({ state: 'detached' });
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('modal-open'))));
  await context.close();
});

test('the installed app opens offline with the last psalm it showed', async () => {
  const { page, context, setOffline } = await open({ now: '2026-10-25T09:00:00+02:00', serviceWorkers: 'allow' });
  await readScreen(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now the service worker sees, and keeps, everything the page loads
  await readScreen(page);
  const needed = ['babel', 'react-dom', 'tailwind', '/hebcal?', '/converter?', 'sefaria'];
  await waitForCache(page, urls => needed.every(part => urls.some(u => u.includes(part))), needed.join());
  setOffline(true);
  await page.goto(page.url() + '?fbclid=shared-link');
  const screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  assert.equal(screen.heading, 'פרק כד');
  assert.equal(screen.verses.length, VERSE_COUNTS[24]);
  await context.close();
});

test('a calendar answer without events data is an error, not an ordinary day', async () => {
  let failures = 1;
  const { page, context } = await open({
    now: '2026-12-06T08:00:00+02:00', // Chanukah, day 2
    fail: url => (url.includes('/hebcal?') && failures-- > 0 ? 'json-error' : false),
  });
  let screen = await waitForScreen(page, s => s.error !== '' || s.chips.length > 0);
  assert.match(screen.error, /שגיאה/);
  assert.deepEqual(crowned(screen), []);
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.deepEqual(crowned(screen), ["ב' דחנוכה"]);
  await context.close();
});

test('Hebrew date picks: the last choice wins, even when an earlier conversion is slow', async () => {
  let conversions = 0;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday 14 Cheshvan 5787
    delay: url => (url.includes('h2g=1') && [1, 3].includes(++conversions) ? 1500 : 0),
  });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyDate(page); // slow
  await hebrewSelect(page, 0).selectOption('22');
  await applyDate(page);
  await page.waitForTimeout(2000);
  let screen = await readScreen(page);
  assert.equal(screen.hebrewSelects[0].label, 'כ״ב');
  assert.ok(screen.hebrewDate.startsWith('כ״ב'), screen.hebrewDate);

  await hebrewSelect(page, 0).selectOption('25');
  await applyDate(page); // slow, and then the user goes back to today
  await page.getByRole('button', { name: 'הצג את היום' }).click();
  await page.waitForTimeout(2000);
  screen = await readScreen(page);
  assert.ok(screen.hebrewDate.startsWith('י״ד'), screen.hebrewDate);
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  // and "today" still follows the clock
  await page.clock.setFixedTime(new Date('2026-10-26T07:00:00+02:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitForScreen(page, s => crowned(s)[0] === 'יום שני');
  await context.close();
});

test('a failed Hebrew date conversion keeps the choice, says so, and tries again when the connection returns', async () => {
  let offline = true;
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', fail: url => (offline && url.includes('h2g=1') ? 'abort' : false) });
  await readScreen(page);
  await hebrewSelect(page, 1).selectOption('Nisan');
  await applyDate(page);
  await dateAlert(page).waitFor();
  let screen = await readScreen(page);
  assert.equal(screen.hebrewSelects[1].label, 'ניסן'); // the choice is kept
  assert.deepEqual(crowned(screen), ['יום ראשון']); // and today is still shown
  assert.equal(await applyEnabled(page), true);
  offline = false;
  await context.setOffline(true);
  await context.setOffline(false); // 'online'
  // 14 Nisan 5787 is a Wednesday (today, 14 Cheshvan, is a Sunday)
  screen = await waitForScreen(page, s => isHebrewDate(s, 'י״ד', 'תשפ״ז') && s.chips[0]?.name === 'יום רביעי' && s.verses.length > 0);
  assert.equal(screen.hebrewSelects[1].label, 'ניסן');
  assert.equal(await dateAlert(page).count(), 0);
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

test('a late failure for a date already left does not disturb the next one', async () => {
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday
    delay: url => (url.includes('date=2026-10-26') ? 800 : url.includes('date=2026-10-27') ? 2500 : 0),
    fail: url => (url.includes('date=2026-10-26') ? 'abort' : false),
  });
  await readScreen(page);
  await nextDay(page); // Monday: fails late
  await nextDay(page); // Tuesday: slow but fine
  await page.waitForTimeout(1500);
  assert.deepEqual(await glance(page), { loadingDay: true, loadingText: false, error: '' });
  const screen = await waitForScreen(page, s => s.verses.length > 0 && s.chips[0].name === 'יום שלישי');
  assert.equal(screen.error, '');
  await context.close();
});

test('a late failure of a psalm text already left does not disturb the next one', async () => {
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday: psalm 24 fails late
    delay: url => (url.includes('Psalms.24') ? 800 : url.includes('Psalms.48') ? 2500 : 0),
    fail: url => (url.includes('Psalms.24') ? 'abort' : false),
  });
  await page.getByText('טוען פסוקים').waitFor(); // Sunday's psalm is on its way
  await nextDay(page); // Monday: psalm 48 is slow but fine
  await page.waitForTimeout(1500);
  assert.deepEqual(await glance(page), { loadingDay: false, loadingText: true, error: '' });
  const screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.equal(screen.heading, 'פרק מח');
  assert.equal(screen.error, '');
  await context.close();
});

test('the minute timer moves on to the next day at 18:00 by itself', async () => {
  const { page, context } = await open({ now: '2026-10-23T17:59:30+03:00', fakeTimers: true }); // Friday
  assert.deepEqual(crowned(await readScreen(page)), ['יום שישי']);
  await page.clock.fastForward('01:00');
  await waitForScreen(page, s => crowned(s)[0] === 'יום שבת');
  await context.close();
});

test('clearing the Gregorian date field keeps the current date', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await showGregorian(page);
  await page.locator('footer input[type=date]').fill('');
  await nextDay(page);
  const screen = await waitForScreen(page, s => s.gregorianInput === '2026-10-26' && s.verses.length > 0 && s.chips[0].name === 'יום שני');
  assert.deepEqual(crowned(screen), ['יום שני']);
  await context.close();
});

test('if the app cannot start, a message with a retry link replaces the blank page', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', fail: url => (url.endsWith('/gra-logic.js') ? '404' : false) });
  assert.match(await page.locator('#root').innerText(), /טוען/);
  assert.equal(await page.locator('#root a').getAttribute('href'), './');
  assert.equal(await page.locator('.boot-failed').isVisible(), false); // not announced while the app may still start
  await page.locator('.boot-failed').waitFor({ state: 'visible', timeout: 15000 });
  await context.close();
});

test('after losing the connection, the app retries by itself when it returns', async () => {
  const { page, context, setOffline } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  setOffline(true);
  await context.setOffline(true);
  await nextDay(page);
  await waitForScreen(page, s => s.error !== '');
  setOffline(false);
  await context.setOffline(false); // fires 'online'
  const screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.deepEqual(crowned(screen), ['יום שני']);
  await context.close();
});

test('service worker: server errors and other files of the site do not replace the saved app', async () => {
  let hebcalFails = false;
  const { page, context, setOffline } = await open({
    now: '2026-10-25T09:00:00+02:00', serviceWorkers: 'allow',
    fail: url => (hebcalFails && url.includes('/hebcal?') ? '500' : false),
  });
  await readScreen(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await readScreen(page);
  await waitForCache(page, urls => urls.some(u => u.includes('/hebcal?')), 'hebcal');

  hebcalFails = true; // a server error is answered from the saved copy
  await page.reload();
  let screen = await readScreen(page);
  assert.equal(screen.error, '');
  assert.deepEqual(crowned(screen), ['יום ראשון']);

  const appUrl = page.url();
  await page.goto(appUrl + 'manifest.json'); // opening another file of the site...
  setOffline(true);
  await page.goto(appUrl); // ...does not replace the app page saved for offline use
  screen = await readScreen(page);
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  await context.close();
});

test('service worker: the app opens offline right after installing', async () => {
  const { page, context, setOffline } = await open({ now: '2026-10-25T09:00:00+02:00', serviceWorkers: 'allow' });
  await readScreen(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await waitForCache(page, urls => ['react@', 'react-dom@', 'babel', 'tailwind', 'gra-logic.js'].every(part => urls.some(u => u.includes(part))), 'precache');
  setOffline(true);
  await page.reload();
  await page.getByRole('heading', { name: 'שיר של יום' }).waitFor(); // React rendered the app, not a blank page
  const screen = await readScreen(page);
  assert.ok(screen.error !== '' || screen.verses.length > 0);
  await context.close();
});

test('service worker: old Gra caches are removed, other apps on the site are left alone', async () => {
  const { page, context } = await open({ serviceWorkers: 'allow' });
  await page.goto(page.url() + 'manifest.json'); // same origin, before the new worker exists
  await page.evaluate(async () => {
    await (await caches.open('shir-shel-yom-cache-v2')).put('/old', new Response('old'));
    await (await caches.open('smartlearn-cache-v1')).put('/other', new Response('other'));
    localStorage.setItem('smartlearn-settings', 'kept');
  });
  await page.goto(page.url().replace('manifest.json', ''));
  await page.evaluate(() => navigator.serviceWorker.ready);
  const urls = await waitForCache(page, urls => !urls.some(u => u.startsWith('shir-shel-yom-cache-v2')), 'v2 removed');
  assert.ok(urls.some(u => u.startsWith('smartlearn-cache-v1 ')));
  assert.ok(urls.some(u => u.startsWith('shir-shel-yom-cache-v3 ')));
  assert.equal(await page.evaluate(() => localStorage.getItem('smartlearn-settings')), 'kept');
  await context.close();
});

test('while the next day\'s text is loading, the previous day\'s text is not shown under the new heading', async () => {
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday (24) loads normally; Monday's psalm 48 is slow
    delay: url => (url.includes('Psalms.48') ? 1500 : 0),
  });
  await readScreen(page);
  const sampling = page.evaluate(() => new Promise(resolve => {
    const seen = [];
    const timer = setInterval(() => {
      const heading = document.querySelector('main h3')?.textContent;
      const verse = document.querySelector('[data-testid=verse] p')?.textContent;
      if (heading && verse) seen.push([heading, verse]);
    }, 10);
    setTimeout(() => { clearInterval(timer); resolve(seen); }, 2500);
  }));
  await nextDay(page);
  for (const [heading, verse] of await sampling) {
    assert.equal(heading === 'פרק כד', verse.startsWith('תהלים 24 '), `${heading} shown with "${verse}"`);
  }
  const screen = await readScreen(page);
  assert.equal(screen.heading, 'פרק מח');
  assert.ok(screen.verses.every(v => v.text.startsWith('תהלים 48 ')));
  await context.close();
});

test('an error for the new date is shown at once, not hidden behind the old day\'s loading text', async () => {
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // Sunday's psalm 24 is slow; Monday's calendar fails
    delay: url => (url.includes('Psalms.24') ? 2500 : 0),
    fail: url => (url.includes('date=2026-10-26') ? 'abort' : false),
  });
  await page.getByText('טוען פסוקים').waitFor(); // Sunday's psalm is on its way
  await nextDay(page);
  await page.waitForTimeout(800);
  const now = await glance(page);
  assert.equal(now.loadingText, false);
  assert.match(now.error, /שגיאה/);
  await context.close();
});

test('a converter answer without a date is an error too', async () => {
  let failures = 1;
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00',
    fail: url => (url.includes('g2h=1') && failures-- > 0 ? 'json-error' : false),
  });
  let screen = await waitForScreen(page, s => s.error !== '' || s.chips.length > 0);
  assert.match(screen.error, /שגיאה/);
  await page.getByRole('button', { name: 'נסה שוב' }).click();
  screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.ok(isHebrewDate(screen, 'י״ד', 'תשפ״ז'), screen.hebrewDate);
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['י״ד', 'חשוון', 'ה׳ תשפ״ז']);
  await context.close();
});

test('"today" while a Hebrew date pick is on its way puts the pickers back, even when today is already shown', async () => {
  const { page, context } = await open({
    now: '2026-10-25T09:00:00+02:00', // today: 14 Cheshvan 5787
    delay: url => (url.includes('h2g=1') ? 1500 : 0),
  });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyDate(page);
  await page.getByRole('button', { name: 'הצג את היום' }).click();
  await page.waitForTimeout(2000);
  const screen = await readScreen(page);
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['י״ד', 'חשוון', 'ה׳ תשפ״ז']);
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  await context.close();
});

test('a failed Hebrew date pick does not stop "today" from following the clock', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', fail: url => (url.includes('h2g=1') ? 'abort' : false) });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyDate(page);
  await dateAlert(page).waitFor();
  await page.clock.setFixedTime(new Date('2026-10-26T07:00:00+02:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitForScreen(page, s => crowned(s)[0] === 'יום שני');
  await context.close();
});

test('moving from the 30th to a month of 29 days lands on its last day', async () => {
  const { page, context } = await open({ now: '2026-12-10T09:00:00+02:00' }); // 30 Kislev 5787
  let screen = await readScreen(page);
  assert.equal(screen.hebrewSelects[0].label, 'ל׳');
  await hebrewSelect(page, 1).selectOption('Tevet'); // Tevet has 29 days
  await applyDate(page);
  screen = await waitForScreen(page, s => isHebrewDate(s, 'כ״ט', 'תשפ״ז'));
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['כ״ט', 'טבת', 'ה׳ תשפ״ז']);
  await context.close();
});

test('the year picker shows years outside its usual list', async () => {
  const { page, context } = await open({ now: '2089-09-04T09:00:00+03:00' }); // 29 Elul 5849, the last year listed
  await readScreen(page);
  await nextDay(page);
  const screen = await waitForScreen(page, s => isHebrewDate(s, 'א׳', 'תת״נ'));
  assert.equal(screen.hebrewSelects[2].label, 'ה׳ תת״נ');
  await context.close();
});

test('the Hebrew pickers are disabled until a date has loaded', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', fail: url => (url.includes('/hebcal?') ? 'abort' : false) });
  await waitForScreen(page, s => s.error !== '');
  for (let i = 0; i < 3; i++) assert.equal(await hebrewSelect(page, i).isDisabled(), true);
  await context.close();
});

test('when a psalm text fails, the other psalms of the day can still be chosen', async () => {
  // Rosh Chodesh Kislev 5787 (Wed 11 Nov 2026): the weekday psalm's text fails
  const { page, context } = await open({ now: '2026-11-11T09:00:00+02:00', fail: url => (url.includes('Psalms.94') ? 'abort' : false) });
  await readScreen(page);
  await clickChip(page, 'יום רביעי');
  let screen = await waitForScreen(page, s => s.error !== '');
  assert.deepEqual(chipNames(screen), ['יום רביעי', 'ראש חודש']);
  assert.equal(screen.verses.length, 0);
  await clickChip(page, 'ראש חודש');
  screen = await waitForScreen(page, s => s.verses.length > 0);
  assert.equal(screen.heading, 'פרק קד');
  assert.equal(screen.error, '');
  await context.close();
});

test('typing a year in the Gregorian field does not load the years on the way', async () => {
  const { page, context, apiRequests } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await showGregorian(page);
  await page.locator('footer input[type=date]').fill('0202-10-25');
  await page.waitForTimeout(500);
  assert.ok(!apiRequests.some(u => u.includes('year=202&')), apiRequests.join('\n'));
  assert.equal(await applyEnabled(page), false);
  await applyButton(page).click({ force: true }); // pressing the dimmed button does nothing
  await page.waitForTimeout(500);
  assert.ok(!apiRequests.some(u => u.includes('year=202&')), apiRequests.join('\n'));
  await context.close();
});

test('Sukkot abroad when the festival starts on Shabbat', async () => {
  // 5787: 15 Tishrei is Shabbat 26 Sep 2026, Hoshana Raba is Friday 2 Oct
  const { page, context } = await open({ now: '2026-09-27T09:00:00+03:00' });
  await readScreen(page);
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  let screen = await waitForScreen(page, s => crowned(s)[0] === 'ב\' של סוכות (חו"ל)');
  assert.equal(screen.heading, 'פרק עו'); // the first day's psalm, pushed from Shabbat
  const days = [['א\' דחוה"מ סוכות', 'פרק כט'], ['ב\' דחוה"מ סוכות', 'פרק נ'], ['ג\' דחוה"מ סוכות', 'פרק צד'],
    ['ד\' דחוה"מ סוכות', 'פרק פא'], ['הושענא רבה', 'פרק פב']];
  for (const [chip, heading] of days) {
    await nextDay(page);
    screen = await waitForScreen(page, s => crowned(s)[0] === chip && s.verses.length > 0);
    assert.equal(screen.heading, heading, chip);
  }
  await context.close();
});

test('Sukkot abroad: all of Psalm 94 on one day', async () => {
  // 5787 abroad: 19 Tishrei (Wed 30 Sep 2026)
  const { page, context } = await open({ now: '2026-09-30T09:00:00+03:00' });
  await readScreen(page);
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  const screen = await waitForScreen(page, s => crowned(s)[0] === 'ג\' דחוה"מ סוכות' && s.verses.length > 0);
  assert.equal(screen.heading, 'פרק צד');
  assert.equal(screen.verses.length, VERSE_COUNTS[94]);
  assert.equal(screen.verses[0].num, 'א');
  await context.close();
});

test('the 8th day of Pesach abroad', async () => {
  // 5787: Pesach VIII is Thursday 29 Apr 2027
  const { page, context } = await open({ now: '2027-04-29T09:00:00+03:00' });
  let screen = await readScreen(page);
  assert.deepEqual(chipNames(screen), ['יום חמישי']); // an ordinary day in Israel
  await page.getByRole('button', { name: 'בחו"ל' }).click();
  screen = await waitForScreen(page, s => crowned(s)[0] === 'אחרון של פסח (חו"ל)' && s.verses.length > 0);
  assert.equal(screen.heading, 'פרק קלח');
  assert.equal(screen.verses.length, VERSE_COUNTS[138]);
  await context.close();
});

test('choosing a Hebrew date changes nothing until "הצג" is pressed', async () => {
  const { page, context, apiRequests } = await open({ now: '2026-10-25T09:00:00+02:00' }); // Sunday 14 Cheshvan 5787
  let screen = await readScreen(page);
  assert.equal(await applyEnabled(page), false);
  const requestsBefore = apiRequests.length;

  await hebrewSelect(page, 0).selectOption('20');
  await hebrewSelect(page, 1).selectOption('Kislev');
  await hebrewSelect(page, 2).selectOption('5788');
  await page.waitForTimeout(500);
  screen = await readScreen(page);
  assert.equal(apiRequests.length, requestsBefore); // nothing was loaded
  assert.ok(isHebrewDate(screen, 'י״ד', 'תשפ״ז'), screen.hebrewDate); // still showing today
  assert.deepEqual(crowned(screen), ['יום ראשון']);
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['כ׳', 'כסלו', 'ה׳ תשפ״ח']);
  assert.equal(await applyEnabled(page), true);

  await applyDate(page);
  screen = await waitForScreen(page, s => isHebrewDate(s, 'כ׳', 'תשפ״ח') && s.verses.length > 0);
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['כ׳', 'כסלו', 'ה׳ תשפ״ח']);
  assert.equal(await applyEnabled(page), false);

  // choosing the date that is already shown leaves nothing to show
  await hebrewSelect(page, 0).selectOption('21');
  assert.equal(await applyEnabled(page), true);
  await hebrewSelect(page, 0).selectOption('20');
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

test('the arrows move from the date shown and drop a date chosen but not shown', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' }); // 14 Cheshvan 5787
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await nextDay(page);
  const screen = await waitForScreen(page, s => isHebrewDate(s, 'ט״ו', 'תשפ״ז') && s.verses.length > 0);
  assert.equal(screen.hebrewSelects[0].label, 'ט״ו');
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

test('a Gregorian date is shown only when "הצג" is pressed', async () => {
  const { page, context, apiRequests } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await showGregorian(page);
  const requestsBefore = apiRequests.length;
  await page.locator('footer input[type=date]').fill('2026-12-06'); // Chanukah, day 2
  await page.waitForTimeout(500);
  assert.equal(apiRequests.length, requestsBefore);
  assert.deepEqual(crowned(await readScreen(page)), ['יום ראשון']);
  await applyDate(page);
  const screen = await waitForScreen(page, s => crowned(s)[0] === "ב' דחנוכה" && s.verses.length > 0);
  assert.equal(screen.gregorianInput, '2026-12-06');
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

const isDark = (page) => page.evaluate(() => document.documentElement.classList.contains('dark'));
const themeColor = (page) => page.evaluate(() => document.querySelector('meta[name="theme-color"]').content);

test('dark mode follows the device, and the choice made in the app is remembered', async () => {
  let { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', colorScheme: 'dark' });
  await readScreen(page);
  assert.equal(await isDark(page), true);
  assert.equal(await themeColor(page), '#1c1917');

  const toggle = page.getByRole('button', { name: 'מצב כהה', exact: true });
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await toggle.click();
  assert.equal(await isDark(page), false);
  assert.equal(await themeColor(page), '#f5f5f4');
  await page.reload();
  await readScreen(page);
  assert.equal(await isDark(page), false); // the choice wins over the device setting
  await context.close();

  ({ page, context } = await open({ now: '2026-10-25T09:00:00+02:00', colorScheme: 'light' }));
  await readScreen(page);
  assert.equal(await isDark(page), false);
  await page.emulateMedia({ colorScheme: 'dark' }); // no choice made: follows the device as it changes
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await context.close();
});

test('dark mode is on before the app has even started', async () => {
  // the app never starts here, so only the early script in <head> can have set it
  const { page, context } = await open({ colorScheme: 'dark', fail: url => (url.endsWith('/gra-logic.js') ? '404' : false) });
  assert.equal(await isDark(page), true);
  assert.equal(await themeColor(page), '#1c1917');
  await context.close();
});

test('changing only the year can be shown', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' }); // 14 Cheshvan 5787
  await readScreen(page);
  await hebrewSelect(page, 2).selectOption('5788');
  assert.equal(await applyEnabled(page), true);
  await applyDate(page);
  await waitForScreen(page, s => isHebrewDate(s, 'י״ד', 'תשפ״ח') && s.verses.length > 0);
  await context.close();
});

test('a date that was shown with "הצג" stays when the clock passes 18:00', async () => {
  const { page, context } = await open({ now: '2026-10-23T17:59:00+03:00', fakeTimers: true }); // Friday
  await readScreen(page);
  await showGregorian(page);
  await page.locator('footer input[type=date]').fill('2026-12-06');
  await applyDate(page);
  await waitForScreen(page, s => crowned(s)[0] === "ב' דחנוכה" && s.verses.length > 0);
  await page.clock.fastForward('02:00');
  await page.waitForTimeout(500);
  assert.deepEqual(crowned(await readScreen(page)), ["ב' דחנוכה"]);
  await context.close();
});

test('while a chosen date loads, the pickers already show it', async () => {
  // 20 Cheshvan 5787 = Sat 31 Oct 2026; its calendar answer is slow
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', delay: url => (url.includes('date=2026-10-31') ? 1500 : 0) });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyDate(page);
  await page.waitForTimeout(300);
  assert.equal((await glance(page)).loadingDay, true);
  assert.equal(await hebrewSelect(page, 0).evaluate(s => s.selectedOptions[0].textContent), 'כ׳');
  assert.equal(await hebrewSelect(page, 0).isDisabled(), true); // no choosing from a half-loaded date
  await waitForScreen(page, s => isHebrewDate(s, 'כ׳', 'תשפ״ז') && s.verses.length > 0);
  await context.close();
});

test('Adar keeps the month that was chosen when the year changes back and forth', async () => {
  const { page, context, apiRequests } = await open({ now: '2027-03-23T09:00:00+02:00' }); // Purim, 14 Adar II 5787
  await readScreen(page);
  await hebrewSelect(page, 2).selectOption('5788'); // a regular year: Adar
  assert.equal(await hebrewSelect(page, 1).evaluate(s => s.selectedOptions[0].textContent), 'אדר');
  await hebrewSelect(page, 2).selectOption('5787'); // back: still Adar II, nothing to show
  assert.equal(await hebrewSelect(page, 1).evaluate(s => s.selectedOptions[0].textContent), "אדר ב'");
  assert.equal(await applyEnabled(page), false);

  await hebrewSelect(page, 2).selectOption('5788');
  await hebrewSelect(page, 1).selectOption('Adar'); // chosen in a regular year...
  await hebrewSelect(page, 2).selectOption('5790'); // ...and moved to a leap year: Adar I
  assert.equal(await hebrewSelect(page, 1).evaluate(s => s.selectedOptions[0].textContent), "אדר א'");
  await applyDate(page);
  await waitForScreen(page, s => isHebrewDate(s, 'י״ד', 'תש״צ') && s.verses.length > 0);
  assert.ok(apiRequests.some(u => u.includes('hy=5790&hm=Adar%20I&')), apiRequests.filter(u => u.includes('h2g')).join('\n'));
  await context.close();
});

test('a Hebrew choice does not light "הצג" in the Gregorian view', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await showGregorian(page);
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

test('choosing a date and then the shown date again leaves nothing pending, even after the day changes', async () => {
  const { page, context } = await open({ now: '2026-10-23T17:58:00+03:00', fakeTimers: true }); // Friday 12 Cheshvan
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('15');
  await hebrewSelect(page, 0).selectOption('12');
  assert.equal(await applyEnabled(page), false);
  await page.clock.fastForward('03:00'); // 18:01: Shabbat 13 Cheshvan is shown
  const screen = await waitForScreen(page, s => isHebrewDate(s, 'י״ג', 'תשפ״ז') && s.verses.length > 0);
  assert.equal(screen.hebrewSelects[0].label, 'י״ג');
  assert.equal(await applyEnabled(page), false);
  await context.close();
});

test('changing the pickers while "הצג" is still converting keeps the newer choice', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', delay: url => (url.includes('h2g=1') ? 1200 : 0) });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyDate(page);
  await hebrewSelect(page, 1).selectOption('Kislev');
  await page.waitForTimeout(2000);
  const screen = await readScreen(page);
  assert.ok(isHebrewDate(screen, 'י״ד', 'תשפ״ז'), screen.hebrewDate); // the older choice was not shown
  assert.deepEqual(screen.hebrewSelects.map(s => s.label), ['כ׳', 'כסלו', 'ה׳ תשפ״ז']);
  assert.equal(await applyEnabled(page), true);
  await context.close();
});

test('"הצג" keeps the keyboard focus after showing the date', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('20');
  await applyButton(page).focus();
  await page.keyboard.press('Enter');
  await waitForScreen(page, s => isHebrewDate(s, 'כ׳', 'תשפ״ז') && s.verses.length > 0);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'הצג את התאריך שנבחר');
  await context.close();
});

test('choosing the 30th of a 29-day month that is already shown keeps following today', async () => {
  const { page, context } = await open({ now: '2027-01-08T09:00:00+02:00' }); // 29 Tevet 5787
  await readScreen(page);
  await hebrewSelect(page, 0).selectOption('30');
  await applyDate(page);
  await page.waitForTimeout(500);
  assert.equal((await readScreen(page)).hebrewSelects[0].label, 'כ״ט');
  await page.clock.setFixedTime(new Date('2027-01-09T07:00:00+02:00'));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await waitForScreen(page, s => isHebrewDate(s, 'א׳', 'תשפ״ז') && s.verses.length > 0); // 1 Sh'vat
  await context.close();
});

test('a cleared Gregorian date field shows the current date again when left', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00' });
  await readScreen(page);
  await showGregorian(page);
  await page.locator('footer input[type=date]').fill('');
  await page.locator('h1').click();
  assert.equal(await page.locator('footer input[type=date]').inputValue(), '2026-10-25');
  await context.close();
});

test('switching the theme back to the device setting follows the device again', async () => {
  const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', colorScheme: 'light' });
  await readScreen(page);
  const toggle = page.getByRole('button', { name: 'מצב כהה', exact: true });
  await toggle.click(); // dark, unlike the device: remembered
  assert.equal(await page.evaluate(() => localStorage.getItem('shir-shel-yom-theme')), 'dark');
  await toggle.click(); // light, like the device: nothing to remember
  assert.equal(await page.evaluate(() => localStorage.getItem('shir-shel-yom-theme')), null);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
  await context.close();
});

test('every footer control can be reached on phones, tablets and desktops (real styles)', async () => {
  for (const width of [320, 360, 768, 1024, 1440]) {
    for (const mode of ['hebrew', 'gregorian']) {
      const { page, context } = await open({ now: '2026-10-25T09:00:00+02:00', realStyles: true, width });
      await readScreen(page);
      if (mode === 'gregorian') {
        await showGregorian(page);
        await page.locator('footer input[type=date]').fill('2026-12-06');
      } else {
        await hebrewSelect(page, 0).selectOption('20');
      }
      const problems = await page.evaluate(() => {
        const found = [];
        if (document.documentElement.scrollWidth > innerWidth) found.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
        for (const el of document.querySelectorAll('footer button, footer select, footer input')) {
          el.scrollIntoView({ block: 'center' });
          const box = el.getBoundingClientRect();
          const name = el.getAttribute('aria-label') || el.title || el.textContent.trim();
          const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
          if (box.left < 0 || box.right > innerWidth) found.push(`${name} is off screen`);
          else if (!(hit === el || el.contains(hit))) found.push(`${name} is covered by ${hit?.textContent.trim() || hit?.tagName}`);
        }
        return found;
      });
      assert.deepEqual(problems, [], `${width}px, ${mode}`);
      await context.close();
    }
  }
});
