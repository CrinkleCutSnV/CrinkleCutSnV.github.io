// Split the G: a drained pint looks empty everywhere afterwards. Needs `npm run build && npm run preview` on :4321.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

async function open(page) {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.clock.install();
  await page.goto(`${BASE}/apps/split-the-g/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.clock.runFor(300);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await page.locator('[data-split-the-g]').scrollIntoViewIfNeeded();
}
const st = (page) => page.evaluate(() => window.__splitTheG.state);
/** Stout-coloured pixels inside the glass on the bar (between the inside bottom and 70 mm up). */
const stoutPixels = (page) => page.evaluate(() => {
  const { geo } = window.__splitTheG.state;
  const cv = document.querySelector('[data-split-the-g] canvas');
  const dpr = cv.width / cv.getBoundingClientRect().width;
  const c = cv.getContext('2d');
  const x0 = Math.round((geo.glassX - 28 * geo.s) * dpr), w = Math.round(56 * geo.s * dpr);
  const y0 = Math.round((geo.foot - (11 + 70) * geo.s) * dpr), h = Math.round(70 * geo.s * dpr);
  const d = c.getImageData(x0, y0, w, h).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) { const [r, g, b] = [d[i], d[i + 1], d[i + 2]]; if (r < 75 && g < 40 && b < 25 && r >= g) n++; }
  return { n, of: d.length / 4 };
});
const hold = async (page, down, up) => {
  await down();
  for (let i = 0; i < 200 && (await st(page)).phase === 'drinking'; i++) await page.clock.runFor(100);
  await up();
};

// --- desktop, every drinker ---
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await open(page);
const game = page.locator('[data-split-the-g]');
const kb = [() => page.keyboard.down('Space'), () => page.keyboard.up('Space')];
// sanity: a normal go still has stout in the glass, and the detector sees it
await page.evaluate(() => { window.__splitTheG.pick('maureen'); window.__splitTheG.skipPour(); });
await page.clock.runFor(100);
await kb[0](); await page.clock.runFor(700); await kb[1]();
for (let i = 0; i < 80 && (await st(page)).phase !== 'result'; i++) await page.clock.runFor(100);
const normal = await st(page), normalPx = await stoutPixels(page);
check(!normal.emptied && normal.line > 40 && normal.head >= 4 && normalPx.n > normalPx.of * 0.3, `a normal go still shows its stout (${normal.line.toFixed(1)} mm line, ${Math.round(100 * normalPx.n / normalPx.of)}% stout pixels)`);

for (const id of ['maureen', 'declan', 'nigel', 'dot', 'walter', 'pip']) {
  await page.evaluate((id) => { window.__splitTheG.pick(id); window.__splitTheG.skipPour(); }, id);
  await page.clock.runFor(100);
  await hold(page, ...kb);
  let povEnd = null, back = null, worst = 0;
  for (let i = 0; i < 160; i++) {
    const s = await st(page);
    if (s.pov >= 0.999 && s.line < 0.01 && s.head <= 1.5) povEnd ??= s;
    if (s.pov <= 0.001 && !s.hat && s.emptied) { // back at the bar, before the flip
      back ??= s;
      worst = Math.max(worst, (await stoutPixels(page)).n);
      if (id === 'declan' && !back.shot) { back.shot = true; await game.screenshot({ path: `${OUT}/split-empty-bar.png` }); }
    }
    if (povEnd && id === 'declan' && !povEnd.shot) { povEnd.shot = true; await game.screenshot({ path: `${OUT}/split-empty-pov.png` }); }
    if (s.hat || s.phase === 'result') break;
    await page.clock.runFor(50);
  }
  check(!!povEnd, `${id}: the last look down the glass (POV) is at an empty bottom`);
  check(back && back.line === 0 && back.head > 0 && back.head <= 1.5, `${id}: back at the bar the glass is drained (line ${back?.line} mm, a ${back?.head?.toFixed(1)} mm wisp of foam)`);
  check(back && worst === 0, `${id}: no stout pixels in the glass before the flip (${worst})`);
  for (let i = 0; i < 80 && (await st(page)).phase !== 'result'; i++) await page.clock.runFor(100);
  const r = await st(page);
  check(r.phase === 'result' && r.line === 0 && r.hat?.landed, `${id}: still empty on the result screen, with the glass hat on`);
}

// --- phone ---
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
const phone = await ctx.newPage();
await open(phone);
await phone.evaluate(() => { window.__splitTheG.pick('declan'); window.__splitTheG.skipPour(); });
await phone.clock.runFor(100);
const box = await phone.locator('canvas').first().boundingBox();
await hold(phone, async () => { await phone.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await phone.mouse.down(); }, () => phone.mouse.up());
let shot = false;
for (let i = 0; i < 160 && !shot; i++) {
  const s = await st(phone);
  if (s.pov <= 0.001 && !s.hat && s.emptied) {
    const px = await stoutPixels(phone);
    check(s.line === 0 && px.n === 0, `phone: back at the bar the glass is empty (${px.n} stout pixels)`);
    await phone.locator('[data-split-the-g]').screenshot({ path: `${OUT}/split-empty-mobile.png` });
    shot = true;
  }
  await phone.clock.runFor(50);
}
check(shot, 'phone: saw the drained glass back at the bar');

check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall empty-glass checks passed');
process.exit(failures ? 1 : 0);
