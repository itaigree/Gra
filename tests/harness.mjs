// Runs the real index.html in Chromium with every external request answered locally, so the
// end-to-end tests need no network:
//   hebcal.com/hebcal     -> @hebcal/core + @hebcal/rest-api (the libraries hebcal.com's API is built on)
//   hebcal.com/converter  -> @hebcal/core HDate
//   sefaria.org/api/texts -> placeholder verses ("תהלים <chapter> פסוק <verse>") with the real verse counts
//   unpkg.com             -> react, react-dom and @babel/standalone from node_modules
//   tailwind              -> empty stub, or (realStyles) the page's classes compiled with tailwindcss 3
//   google fonts          -> empty stub
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { hebcalJson, converterJson } from './hebcal-mock.mjs';

const require = createRequire(import.meta.url);
export const { chromium } = require('playwright');

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Verse counts (superscription = verse 1) of every psalm the app can ask for
export const VERSE_COUNTS = {
  8: 10, 12: 9, 18: 51, 19: 15, 22: 32, 24: 10, 29: 11, 30: 13, 32: 11, 42: 12, 48: 15, 50: 23,
  66: 20, 68: 36, 76: 13, 78: 72, 80: 20, 81: 17, 82: 8, 92: 16, 93: 5, 94: 23, 104: 35,
  105: 45, 114: 8, 135: 21, 136: 26, 138: 8,
};

export function startServer() {
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const rel = decodeURIComponent(pathname.replace(/^\/Gra\//, '')) || 'index.html';
    const file = path.join(REPO, rel);
    if (!pathname.startsWith('/Gra/') || !file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/Gra/`,
    close: () => new Promise(done => server.close(done)),
  })));
}

// https://www.sefaria.org/api/texts/Psalms.92  or  Psalms.94.16-23
export function sefariaJson(ref) {
  const m = ref.match(/^Psalms\.(\d+)(?:\.(\d+)-(\d+))?$/);
  if (!m || !VERSE_COUNTS[m[1]]) return { error: `Unknown ref ${ref}` };
  const chapter = Number(m[1]);
  const from = m[2] ? Number(m[2]) : 1, to = m[3] ? Number(m[3]) : VERSE_COUNTS[chapter];
  const he = [];
  for (let v = from; v <= to; v++) he.push(`תהלים ${chapter} פסוק ${v}`);
  return { ref, he };
}

const nodeModule = (p) => path.join(REPO, 'node_modules', p);

// The CSS the Tailwind CDN would generate for index.html (dark mode by class), built once
let tailwindScript;
async function realTailwind() {
  if (!tailwindScript) {
    const postcss = require('postcss');
    const tailwindcss = require('tailwindcss');
    const { css } = await postcss([tailwindcss({ darkMode: 'class', content: [path.join(REPO, 'index.html')] })])
      .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined });
    tailwindScript = `document.head.appendChild(Object.assign(document.createElement('style'), { textContent: ${JSON.stringify(css)} }));`;
  }
  return tailwindScript;
}

/**
 * Opens the app in a fresh browser context.
 *   timezoneId   browser time zone (default Asia/Jerusalem)
 *   now          frozen wall-clock time (anything new Date() accepts)
 *   delay(url)   ms to hold an API response (to force out-of-order responses)
 *   fail(url)    'abort' (network error) | '500' (HTML error page) | 'json-error' (200 with {error}) |
 *                '404' (for the app's own files) | falsy
 *   serviceWorkers  'block' (default) or 'allow' to run sw.js
 *   fakeTimers   install a controllable clock (page.clock.fastForward) instead of only freezing the time
 *   colorScheme  'light' (default) or 'dark' device setting
 *   realStyles   load real Tailwind styles (for layout checks) instead of none
 *   width        viewport width (default 400)
 * Returns { context, page, errors, apiRequests, setOffline(bool) }; offline fails every request, local ones too.
 */
export async function openApp(browser, appUrl, { timezoneId = 'Asia/Jerusalem', now, delay = () => 0, fail = () => false, serviceWorkers = 'block', fakeTimers = false, colorScheme = 'light', realStyles = false, width = 400 } = {}) {
  const context = await browser.newContext({ timezoneId, serviceWorkers, colorScheme, viewport: { width, height: 900 } });
  const errors = [];
  const apiRequests = [];
  let offline = false;
  const respond = async (route, url, body) => {
    apiRequests.push(url);
    const ms = delay(url);
    if (ms) await new Promise(r => setTimeout(r, ms));
    const failure = fail(url);
    if (failure === 'abort') return route.abort('internetdisconnected');
    if (failure === '500') return route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Server Error</h1>' });
    if (failure === 'json-error') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"Too many requests"}' });
    const json = body();
    const status = json.error && url.includes('/converter?') ? 400 : 200;
    return route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(json) });
  };
  // context.route also sees the requests the service worker makes
  await context.route(() => true, async route => {
    const url = route.request().url();
    const u = new URL(url);
    if (offline) return route.abort('internetdisconnected');
    if (u.hostname === '127.0.0.1') {
      const failure = fail(url);
      if (failure === '404') return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
      if (failure === 'abort') return route.abort('internetdisconnected');
      return route.continue();
    }
    if (u.hostname === 'unpkg.com') {
      const file = u.pathname.includes('react-dom') ? 'react-dom/umd/react-dom.production.min.js'
        : u.pathname.includes('/react@') ? 'react/umd/react.production.min.js'
        : u.pathname.includes('@babel/standalone') ? '@babel/standalone/babel.min.js' : null;
      if (file) return route.fulfill({ path: nodeModule(file), contentType: 'text/javascript' });
    }
    if (u.hostname === 'cdn.tailwindcss.com') return route.fulfill({ body: realStyles ? await realTailwind() : '', contentType: 'text/javascript' });
    if (u.hostname.startsWith('fonts.')) return route.fulfill({ body: '', contentType: 'text/css' });
    if (u.hostname === 'www.hebcal.com' && u.pathname === '/hebcal') return respond(route, url, () => hebcalJson(u.searchParams));
    if (u.hostname === 'www.hebcal.com' && u.pathname === '/converter') return respond(route, url, () => converterJson(u.searchParams));
    if (u.hostname === 'www.sefaria.org' && u.pathname.startsWith('/api/texts/')) return respond(route, url, () => sefariaJson(decodeURIComponent(u.pathname.slice('/api/texts/'.length))));
    errors.push(`unexpected request ${url}`);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  if (now !== undefined && fakeTimers) await page.clock.install({ time: new Date(now) });
  else if (now !== undefined) await page.clock.setFixedTime(new Date(now));
  await page.goto(appUrl);
  return { context, page, errors, apiRequests, setOffline: value => { offline = value; } };
}

/** Waits until nothing is loading, then returns what the user sees (checked and read in one go). */
export async function readScreen(page, timeout = 10000) {
  const end = Date.now() + timeout;
  for (;;) {
    const screen = await page.evaluate(() => {
      const main = document.querySelector('main');
      const text = document.body.innerText;
      if (!main || text.includes('מחשב זמנים ומועדים') || text.includes('טוען פסוקים')) return null;
      return {
        hebrewDate: document.querySelector('header .font-serif')?.textContent.trim() || '',
        chips: [...main.querySelectorAll('[data-testid=psalm-chip]')].map(b => ({
          name: b.textContent.trim(),
          active: b.getAttribute('aria-pressed') === 'true',
          graDefault: !!b.querySelector('[data-testid=gra-default]'),
        })),
        heading: main.querySelector('h3')?.textContent.trim() || '',
        verses: [...main.querySelectorAll('[data-testid=verse]')].map(v => ({
          num: v.querySelector('span').textContent.trim(),
          text: v.querySelector('p').textContent.trim(),
        })),
        error: main.querySelector('[role=alert]')?.textContent.trim() || '',
        gregorianInput: document.querySelector('footer input[type=date]')?.value ?? null,
        hebrewSelects: [...document.querySelectorAll('footer select')].map(s => ({ value: s.value, label: s.selectedOptions[0]?.textContent })),
      };
    });
    if (screen) return screen;
    if (Date.now() > end) throw new Error('the app is still loading');
    await page.waitForTimeout(25);
  }
}

/** Reads the screen until it satisfies `predicate` (use after a click: loading may not have started yet). */
export async function waitForScreen(page, predicate, timeout = 10000) {
  const end = Date.now() + timeout;
  let screen;
  while (Date.now() < end) {
    screen = await readScreen(page);
    if (predicate(screen)) return screen;
    await page.waitForTimeout(50);
  }
  throw new Error(`screen never matched: ${JSON.stringify({ ...screen, verses: screen?.verses.length })}`);
}
