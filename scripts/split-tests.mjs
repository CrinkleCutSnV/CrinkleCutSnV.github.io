// Split the G: browser checks + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
watch(page);
await page.clock.install();
await page.goto(`${BASE}/apps/split-the-g/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.clock.runFor(500);
const game = page.locator('[data-split-the-g]');
await game.scrollIntoViewIfNeeded();
const st = () => page.evaluate(() => window.__splitTheG.state);
const phase = async () => (await st()).phase;

// --- the line-up ---
check(await page.locator('[data-lineup] button').count() >= 4, `line-up shows ${await page.locator('[data-lineup] button').count()} drinkers`);
check(await phase() === 'pick', 'starts on the pick screen');
await game.screenshot({ path: `${OUT}/split-01-intro-lineup.png` });
await page.locator('[data-lineup]').screenshot({ path: `${OUT}/split-05-lineup.png` });

// --- pick Maureen; the pint has to settle first ---
await page.click('[data-char="maureen"]');
await page.clock.runFor(300);
check(await phase() === 'pouring', 'picking a drinker pours a fresh pint, which settles first');
await page.keyboard.down('Space');
await page.clock.runFor(50);
check(await phase() === 'pouring' && /settle/i.test(await page.locator('[data-hint]').innerText()), 'pressing before it settles does nothing ("Wait for it to settle!")');
await page.keyboard.up('Space');
await page.clock.runFor(1800);
check(await phase() === 'ready', 'then it is ready');
await game.screenshot({ path: `${OUT}/split-02-ready.png` });

// --- hold the pointer to drink (mid-drink shot) ---
const box = await game.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
const before = (await st()).line;
await page.mouse.down();
await page.clock.runFor(600);
const mid = await st();
check(mid.phase === 'drinking' && mid.line < before - 8, `holding drinks: line ${before.toFixed(1)} → ${mid.line.toFixed(1)} mm`);
await game.screenshot({ path: `${OUT}/split-03-mid-drink.png` });
await page.mouse.up();
const atRelease = (await st()).line;
await page.clock.runFor(100);
check((await phase()) === 'settling', 'letting go ends the gulp');
await page.mouse.down(); await page.clock.runFor(200); await page.mouse.up();
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const miss = await st();
check(miss.phase === 'result', 'one gulp per pint: pressing again after letting go does nothing, the ref calls it');
check(miss.line < atRelease, `the glass coming back down takes a bit more: ${atRelease.toFixed(1)} → ${miss.line.toFixed(1)} mm`);
const missTxt = (await page.locator('[data-end]').innerText()).replace(/\s+/g, ' ');
console.log(`      result: "${missTxt}"`);
check(miss.verdict.mm > 3 && miss.verdict.signed > 0, `stopping early is a miss above the G (${miss.verdict.signed} mm)`);
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-04-miss-result.png` });

// --- a perfect split (auto-release at exactly the right moment) ---
await page.evaluate(() => { window.__splitTheG.autoRelease = window.__splitTheG.state.target; });
await page.click('[data-again]');
await page.clock.runFor(2000);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && await phase() === 'drinking'; i++) await page.clock.runFor(50);
await page.keyboard.up('Space');
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const perfect = await st();
check(perfect.verdict && perfect.verdict.mm <= 0.3 && perfect.verdict.rating === 'Split the G!', `a perfectly timed release splits the G (${perfect.verdict?.mm} mm)`);
check(/Gold!/.test(await page.locator('[data-end-medal]').innerText()), 'and wins gold');
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-06-perfect-result.png` });
const best = await page.evaluate(() => ({ all: localStorage.getItem('crinklecut.splitTheG.best'), m: localStorage.getItem('crinklecut.splitTheG.best.maureen'), medal: localStorage.getItem('crinklecut.splitTheG.medal') }));
check(Number(best.all) <= 0.3 && best.medal === 'gold', `best saved: ${best.all} mm, medal ${best.medal}`);
await page.evaluate(() => { window.__splitTheG.autoRelease = null; });

// --- each drinker gets a go via the debug hook; holding on forever finishes the pint ---
for (const id of ['declan', 'nigel', 'dot', 'walter', 'pip']) {
  await page.evaluate((id) => window.__splitTheG.pick(id), id);
  await page.clock.runFor(1900);
  await page.keyboard.down('Space');
  await page.clock.runFor(id === 'declan' ? 900 : 1300);
  await game.screenshot({ path: `${OUT}/split-drinking-${id}.png` });
  await page.keyboard.up('Space');
  for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
  const r = await st();
  console.log(`      ${id}: ${r.verdict.signed} mm, "${r.verdict.rating}"`);
  await page.clock.runFor(600);
  await game.screenshot({ path: `${OUT}/split-result-${id}.png` });
}
await page.evaluate(() => window.__splitTheG.pick('declan'));
await page.clock.runFor(1900);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && await phase() === 'drinking'; i++) await page.clock.runFor(100);
await page.keyboard.up('Space');
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const empty = await st();
check(empty.emptied && /finishing the pint/.test(await page.locator('[data-end-remark]').innerText()), 'holding on forever finishes the pint and ends the go');
const surprise = await page.evaluate(() => { window.__splitTheG.pick('random'); return window.__splitTheG.state.char; });
check(surprise !== 'declan', `"Surprise me" pours for a different drinker (${surprise})`);

// --- scores page ---
await page.goto(`${BASE}/scores/`);
const card = page.locator('[data-game="split-the-g"]');
const ctext = (await card.innerText()).replace(/\s+/g, ' ');
check(/Split the G/.test(ctext) && /Best medal: Gold/.test(ctext) && /within 9 mm/.test(ctext) && /within 3.5 mm/.test(ctext) && /within 1 mm/.test(ctext), `scores page card: "${ctext.slice(0, 240)}…"`);
check(/0\.\d mm/.test(await card.locator('[data-role="headline"] [data-value]').innerText()), 'closest split shows on the scores page');
await card.screenshot({ path: `${OUT}/split-08-scores-entry.png` });
await page.goto(`${BASE}/`);
check(await page.locator('a.card[href="/apps/split-the-g/"]').count() === 1, 'home page has a Split the G card');
await page.locator('a.card[href="/apps/split-the-g/"]').screenshot({ path: `${OUT}/split-09-home-card.png` });

// --- phone ---
const phone = await browser.newPage({ ...devices['iPhone 13'], defaultBrowserType: undefined });
watch(phone);
await phone.clock.install();
await phone.goto(`${BASE}/apps/split-the-g/`);
await phone.clock.runFor(500);
const pg = phone.locator('[data-split-the-g]');
await pg.scrollIntoViewIfNeeded();
await pg.screenshot({ path: `${OUT}/split-07a-mobile-lineup.png` });
await phone.tap('[data-char="walter"]');
await phone.clock.runFor(2000);
const pb = await pg.boundingBox();
const y0 = await phone.evaluate(() => scrollY);
const cdp = await phone.context().newCDPSession(phone);
const tp = { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.45 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
await phone.clock.runFor(1200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tp.x, y: tp.y - 60 }] });
await phone.clock.runFor(200);
const ph = await phone.evaluate(() => window.__splitTheG.state);
check(ph.phase === 'drinking', 'phone: touch and hold drinks');
check(await phone.evaluate(() => scrollY) === y0, 'phone: dragging while holding does not scroll the page');
await pg.screenshot({ path: `${OUT}/split-07b-mobile-drinking.png` });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
for (let i = 0; i < 40 && (await phone.evaluate(() => window.__splitTheG.state.phase)) !== 'result'; i++) await phone.clock.runFor(100);
check((await phone.evaluate(() => window.__splitTheG.state.phase)) === 'result', 'phone: lifting the finger ends the gulp');
await phone.clock.runFor(700);
await pg.screenshot({ path: `${OUT}/split-07c-mobile-result.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all split checks passed');
process.exit(failures || errors.length ? 1 : 0);
