// Split the G: drink the lot and the empty glass goes on your head. Needs `npm run build && npm run preview` on :4321.
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
const IDS = ['maureen', 'declan', 'nigel', 'dot', 'walter', 'pip'];

async function open(page) {
  watch(page);
  await page.clock.install();
  await page.goto(`${BASE}/apps/split-the-g/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.clock.runFor(300);
  // screenshots can be slow: don't let game time run on while they're taken
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator('[data-split-the-g]').scrollIntoViewIfNeeded();
}
const st = (page) => page.evaluate(() => window.__splitTheG.state);

/** Hold on until the pint's gone, let go, and wait for the hat. */
async function drainAndHat(page, id, press, onLanded) {
  await page.evaluate((id) => { window.__splitTheG.pick(id); window.__splitTheG.skipPour(); }, id);
  await page.clock.runFor(100);
  await press.down();
  for (let i = 0; i < 200 && (await st(page)).phase === 'drinking'; i++) await page.clock.runFor(100);
  await press.up();
  const seen = { pov: false, hatBeforeLanding: false, flip: null };
  for (let i = 0; i < 120; i++) {
    const s = await st(page);
    if (s.pov > 0.5) seen.pov = true;
    if (s.hat && !s.hat.landed) { seen.hatBeforeLanding = true; if (s.pov > 0.001) seen.hatInPov = true; }
    if (onLanded && s.hat?.t > 1.3) { await onLanded(); onLanded = null; }
    if (s.phase === 'result') break;
    await page.clock.runFor(50);
  }
  return seen;
}

// --- desktop: all six drinkers ---
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await open(page);
const game = page.locator('[data-split-the-g]');
const kb = { down: () => page.keyboard.down('Space'), up: () => page.keyboard.up('Space') };
for (const id of IDS) {
  // a mid-flip shot for one drinker
  if (id === 'declan') {
    await page.evaluate((id) => { window.__splitTheG.pick(id); window.__splitTheG.skipPour(); }, id);
    await page.clock.runFor(100);
    await kb.down();
    for (let i = 0; i < 200 && (await st(page)).phase === 'drinking'; i++) await page.clock.runFor(100);
    await kb.up();
    for (let i = 0; i < 120 && !((await st(page)).hat?.t > 0.45); i++) await page.clock.runFor(25);
    await game.screenshot({ path: `${OUT}/split-hat-flip.png` });
  }
  const seen = await drainAndHat(page, id, kb);
  const s = await st(page);
  await page.clock.runFor(700); // let the drips run
  const rating = await page.locator('[data-end-rating]').innerText();
  const medal = await page.locator('[data-end-medal] [data-medal]').getAttribute('data-medal');
  const bubble = (await page.locator('[data-bubble]').innerText()).trim();
  const again = page.locator('[data-again]');
  check(s.emptied && s.verdict?.band === 'miss', `${id}: drank the lot (emptied, a miss)`);
  check(seen.pov && seen.hatBeforeLanding && !seen.hatInPov, `${id}: back out of the POV to the bar before the glass goes on the head`);
  check(s.hat?.landed && s.hat.line && bubble === s.hat.line, `${id}: glass hat on, says “${bubble}”`);
  check(/Glass hat!/.test(rating) && medal === 'none', `${id}: result card "${rating}", no medal`);
  check(/finishing the pint/.test(await page.locator('[data-end-remark]').innerText()), `${id}: remark still calls it finishing the pint`);
  check(await again.isVisible() && /Next pint/.test(await again.innerText()), `${id}: the usual Next pint button`);
  check(/Hats don’t/.test(await page.locator('[data-end-best]').innerText()) && await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('crinklecut.splitTheG.best')).length) === 0, `${id}: a hat never goes on the scoreboard`);
  await game.screenshot({ path: `${OUT}/split-hat-${id}.png` });
}
// each drinker has 2-3 hat lines, and they vary
const lines = new Set();
for (let i = 0; i < 6; i++) { await drainAndHat(page, 'pip', kb); lines.add((await st(page)).hat.line); }
check(lines.size >= 2, `the hat line is picked at random (${lines.size} different from Pip in 6 goes)`);
// a normal go has no hat
await page.evaluate(() => { window.__splitTheG.pick('maureen'); window.__splitTheG.skipPour(); });
await page.clock.runFor(100);
await kb.down(); await page.clock.runFor(600); await kb.up();
for (let i = 0; i < 80 && (await st(page)).phase !== 'result'; i++) await page.clock.runFor(100);
const norm = await st(page);
check(norm.phase === 'result' && !norm.emptied && norm.hat === null, 'a normal go keeps the glass on the bar (no hat)');

// --- phone ---
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const phone = await ctx.newPage();
await open(phone);
const tap = { down: async () => { const b = await phone.locator('canvas').first().boundingBox(); await phone.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await phone.mouse.down(); }, up: () => phone.mouse.up() };
await drainAndHat(phone, 'walter', tap, () => phone.locator('[data-split-the-g]').screenshot({ path: `${OUT}/split-hat-mobile-on.png` }));
await phone.clock.runFor(700);
const ps = await st(phone);
check(ps.hat?.landed && ps.phase === 'result', 'phone: glass hat and result card');
await phone.locator('[data-split-the-g]').screenshot({ path: `${OUT}/split-hat-mobile.png` });

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall glass-hat checks passed');
process.exit(failures ? 1 : 0);
