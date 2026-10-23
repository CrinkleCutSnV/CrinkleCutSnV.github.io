// Graded swoop: in-browser flights + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.clock.install(); // drive the game clock ourselves, so screenshots land at exact moments
await page.goto(`${BASE}/apps/paper-plane/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.clock.runFor(700);
const game = page.locator('[data-paper-plane]');
await game.scrollIntoViewIfNeeded();
const phase = () => page.evaluate(() => document.querySelector('[data-paper-plane]').dataset.phase);

/** throw exactly, screenshot at `at` ms into the flight (or at the first ceiling bump), then let it land */
async function flight(name, l, { shot, at = 700, ceiling = false } = {}) {
  if (await phase() === 'landed') { await page.click('[data-again]'); await page.clock.runFor(400); }
  await page.evaluate((l) => window.__paperPlane.launch({ ...l, angle: (l.deg * Math.PI) / 180 }), l);
  const t0 = Date.now();
  if (shot) {
    if (ceiling) { for (let i = 0; i < 200 && await page.evaluate(() => window.__paperPlane.y < 3.4); i++) await page.clock.runFor(16); }
    else await page.clock.runFor(at);
    await game.screenshot({ path: `${OUT}/${shot}` });
  }
  for (let i = 0; i < 80 && await phase() !== 'landed'; i++) await page.clock.runFor(500);
  const r = await page.evaluate(() => ({ d: window.__paperPlane.distance, swoop: window.__paperPlane.swoop, boosted: window.__paperPlane.boosted, crashed: window.__paperPlane.crashed }));
  const remark = await page.locator('[data-end-remark]').innerText();
  console.log(`      ${name}: ${r.d.toFixed(1)} m, swoop ${(r.swoop * 100).toFixed(0)}% — "${remark}" (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  return { ...r, remark };
}

// flat throw for reference, then the small swoop, the big swoop and an over-swoop
const flat = await flight('flat 14 m/s at 0°', { x: 0.3, y: 1.8, speed: 14, deg: 0 });
const tiny = await flight('barely downward 14 m/s at −5°', { x: 0.3, y: 1.8, speed: 14, deg: -5 });
check(tiny.swoop < 0.05 && tiny.d < 40, `a barely-downward throw gets almost nothing: ${tiny.d.toFixed(1)} m, strength ${(tiny.swoop * 100).toFixed(0)}%`);
const small = await flight('flick 14 m/s at −10°', { x: 0.3, y: 1.8, speed: 14, deg: -10 }, { shot: 'swoop-01-small-shallow-flick.png', at: 450 });
check(small.swoop > 0.1 && small.swoop < 0.5 && small.d > flat.d + 5 && small.d < 75, `a firmer downward flick swoops a little: ${small.d.toFixed(1)} m (flat: ${flat.d.toFixed(1)} m), strength ${(small.swoop * 100).toFixed(0)}%`);
check(/swoop a little/.test(small.remark), 'and the result card drops a hint');
await page.clock.runFor(800);
await game.screenshot({ path: `${OUT}/swoop-02-small-result.png` });
const big = await flight('great dive 16 m/s at −20°', { x: 0.3, y: 2.1, speed: 16, deg: -20 }, { shot: 'swoop-03-big-swoop.png', at: 650 });
check(big.swoop === 1 && big.d >= 100 && Math.abs(big.d - 104.1) < 1, `a steep, fast dive gives the full swoop: ${big.d.toFixed(1)} m (sim: 104.1 m)`);
await page.clock.runFor(800);
await game.screenshot({ path: `${OUT}/swoop-04-big-result-gold.png` });
check(/Gold!/.test(await page.locator('[data-end-medal]').innerText()), 'and wins gold');
const over = await flight('over-swoop 16 m/s at −20° from 2.5 m', { x: 0.3, y: 2.5, speed: 16, deg: -20 }, { shot: 'swoop-05-over-swoop-ceiling.png', ceiling: true });
check(over.d < big.d - 5 && over.d > 40, `an over-swoop bumps the ceiling and loses distance: ${over.d.toFixed(1)} m (from 2.1 m it went ${big.d.toFixed(1)} m)`);
const steep = await flight('too steep 16 m/s at −40°', { x: 0.3, y: 1.8, speed: 16, deg: -40 });
check(steep.d < 10, `a very steep dive hits the floor: ${steep.d.toFixed(1)} m`);
const lob = await flight('gentle lob 8 m/s at −15°', { x: 0.3, y: 1.8, speed: 8, deg: -15 });
check(lob.swoop < 0.1, `a slow, gentle lob barely swoops (${lob.d.toFixed(1)} m, strength ${(lob.swoop * 100).toFixed(0)}%)`);

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all swoop checks passed');
process.exit(failures || errors.length ? 1 : 0);
