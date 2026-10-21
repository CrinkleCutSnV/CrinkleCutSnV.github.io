// Headless checks for the throw zone: auto-throw on leaving it, no aiming from outside it,
// still releases are weak, flicks and the dive still work. Plus screenshots.
// Needs `npm run build && npm run preview` running on :4321.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/apps/paper-plane/`);
await page.waitForTimeout(900);
const box = await page.locator('[data-paper-plane] canvas').boundingBox();
const S = () => page.evaluate(() => { const p = window.__paperPlane; return { phase: p.phase, x: p.x, y: p.y, d: p.distance, boosted: p.boosted, crashed: p.crashed, doorX: p.doorX, camX: p.readyCamX, ppm: p.ppm, gy: p.groundY, zone: p.zone, l: p.lastLaunch, rel: p.lastRelease }; });
const g = await S();
const px = (wx, wy) => [box.x + (wx - g.camX) * g.ppm, box.y + g.gy - wy * g.ppm];
const z = g.zone;
console.log(`zone x ${z.minX}..${z.maxX} m, y ${z.minY}..${z.maxY} m (${((z.maxX - z.minX) * g.ppm).toFixed(0)}x${((z.maxY - z.minY) * g.ppm).toFixed(0)} px); door at ${g.doorX.toFixed(2)} m; initial view right edge ${(g.camX + box.width / g.ppm).toFixed(2)} m`);
await page.screenshot({ path: `${OUT}/zone-01-ready.png` });

/** start at world (wx, wy), then segments of [dxMetres, dyMetres(up), ms, steps]; holdMs before release */
async function drag(wx, wy, segs, { holdMs = 0, shot, upAt } = {}) {
  let [x, y] = px(wx, wy);
  await page.mouse.move(x, y);
  await page.mouse.down();
  let exitedAt = null;
  for (const [dx, dy, ms, n = 8] of segs) {
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(x + (dx * g.ppm * i) / n, y - (dy * g.ppm * i) / n);
      await page.waitForTimeout(ms / n);
      if (shot && shot.at === i) await page.screenshot({ path: shot.path });
    }
    x += dx * g.ppm; y -= dy * g.ppm;
  }
  if (holdMs) await page.waitForTimeout(holdMs);
  if ((await page.evaluate(() => document.querySelector('[data-paper-plane]').dataset.phase)) === 'flying') exitedAt = 'mid-drag';
  await page.mouse.up();
  return exitedAt;
}
async function settle() {
  const ph = await page.evaluate(() => document.querySelector('[data-paper-plane]').dataset.phase);
  if (ph === 'ready') return null;
  await page.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 40000 });
  await page.waitForTimeout(300);
  const r = await S();
  await page.click('[data-again]'); await page.waitForTimeout(900);
  return r;
}
const deg = (a) => ((a * 180) / Math.PI).toFixed(0).padStart(3);
const fmt = (name, r, extra = '') => r
  ? `${name.padEnd(26)} ${r.d.toFixed(1).padStart(6)} m  launch ${r.l.speed.toFixed(1).padStart(4)} m/s at ${deg(r.l.angle)}° from (${r.l.x.toFixed(2)}, ${r.l.y.toFixed(2)}) m  hand ${r.rel.flick.toFixed(1)} m/s [${r.rel.reason}] ${r.crashed ? 'CRASHED(' + r.crashed + ') ' : ''}${r.boosted ? 'DIVE BOOST ' : ''}${extra}`
  : `${name.padEnd(26)} no throw (plane still on the desk) ${extra}`;

// Pointer events arrive about once a frame (~16-33 ms headless), so hand speed is set by the
// distance per step; the measured hand speed is printed for each throw.
// 0. aiming screenshot (a slow-ish drag, screenshots slow the events down)
let ex = await drag(-1.0, 1.25, [[0.5, 0.05, 200, 6], [1.0, 0.12, 80, 6]], { shot: { at: 4, path: `${OUT}/zone-02-aiming.png` } });
await settle();
// 1. normal strong flick, released inside the zone
ex = await drag(-1.1, 1.25, [[1.8, 0.18, 0, 10]]);
console.log(fmt('normal strong (in zone)', await settle(), ex ? '(exited)' : ''));
// 1b. medium flick
ex = await drag(-1.1, 1.25, [[1.2, 0.1, 0, 12]]);
console.log(fmt('medium (in zone)', await settle()));
// 2. fast drag that leaves the zone: should be thrown at the edge mid-drag
ex = await drag(-1.2, 1.35, [[3.6, 0.3, 0, 8]]);
console.log(fmt('fast drag out of zone', await settle(), ex === 'mid-drag' ? '(thrown mid-drag at exit)' : '(NOT auto-thrown)'));
// 3. slow drag out of the zone (the old line-up cheat, now leaves the zone -> weak drop)
ex = await drag(-0.3, 1.4, [[2.5, 0.2, 1500, 25]]);
console.log(fmt('slow drag out of zone', await settle(), ex === 'mid-drag' ? '(thrown mid-drag at exit)' : ''));
// 4. press outside the zone, drag about and release: nothing should happen
const before = (await S()).l;
await drag(2.4, 1.6, [[-0.6, 0.2, 300, 8], [1.5, 0.1, 0, 5]]);
const r4 = await S();
console.log(`press outside zone          phase=${r4.phase}, new launch=${JSON.stringify(r4.l) !== JSON.stringify(before)}`);
await page.waitForTimeout(300);
// 4b. press outside, sweep into the zone and flick: still nothing
await drag(-2.2, 2.0, [[1.5, 0, 200, 8], [1.5, 0.1, 0, 5]]);
const r4b = await S();
console.log(`press outside, sweep in     phase=${r4b.phase}, new launch=${JSON.stringify(r4b.l) !== JSON.stringify(before)}`);
// 5. line up, hold still, release
ex = await drag(-0.8, 1.2, [[1.6, 0.4, 500, 12]], { holdMs: 400 });
console.log(fmt('hold still then release', await settle()));
// 5b. long drag to the far corner of the zone, hold, release
ex = await drag(-1.3, 1.0, [[2.5, 1.9, 700, 14]], { holdMs: 250 });
console.log(fmt('long drag, hold, release', await settle()));
// 6. strong flat throw from high in the zone (should clip the hidden lintel)
ex = await drag(-1.1, 2.6, [[1.8, 0.18, 0, 10]]);
console.log(fmt('high flat throw', await settle()));
// 7. dives: lift towards the top of the zone, then flick down-right
ex = await drag(-0.35, 1.1, [[0, 1.85, 300, 8], [1.3, -0.6, 0, 6]]);
console.log(fmt('good dive', await settle()));
ex = await drag(-0.6, 1.1, [[0, 1.9, 300, 8], [1.6, -0.7, 0, 6]]);
console.log(fmt('great dive', await settle()));
ex = await drag(-0.6, 1.1, [[0, 1.0, 300, 8], [1.3, -0.6, 0, 6]]);
console.log(fmt('dive from y~2.1 (old top)', await settle()));
ex = await drag(-0.6, 1.1, [[0, 1.85, 300, 8], [1.0, -0.85, 0, 6]]);
console.log(fmt('dive, steep (~-40°)', await settle()));
ex = await drag(-0.6, 1.1, [[0, 1.85, 300, 8], [0.8, -0.37, 0, 6]]);
console.log(fmt('dive, too slow', await settle()));
console.log('best in localStorage:', await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.best')));

// phone, portrait, real touch via CDP
const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
phone.on('pageerror', (e) => errors.push(String(e)));
await phone.goto(`${BASE}/apps/paper-plane/`);
await phone.waitForTimeout(900);
await phone.screenshot({ path: `${OUT}/zone-03-phone.png` });
{
  const pg = await phone.evaluate(() => { const p = window.__paperPlane; return { camX: p.readyCamX, ppm: p.ppm, gy: p.groundY, doorX: p.doorX }; });
  const pb = await phone.locator('[data-paper-plane] canvas').boundingBox();
  console.log(`phone: ppm ${pg.ppm.toFixed(0)}, view right edge ${(pg.camX + pb.width / pg.ppm).toFixed(2)} m, door ${pg.doorX.toFixed(2)} m`);
  const cdp = await phone.context().newCDPSession(phone);
  const P = (wx, wy) => [pb.x + (wx - pg.camX) * pg.ppm, pb.y + pg.gy - wy * pg.ppm];
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const [x0, y0] = P(-0.35, 0.9); // grab the plane on the desk
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', x0 + 0.24 * pg.ppm * i, y0 - 0.03 * pg.ppm * i); await phone.waitForTimeout(15); if (i === 3) await phone.screenshot({ path: `${OUT}/zone-04-phone-aiming.png` }); }
  await touch('touchEnd');
  await phone.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 30000 });
  await phone.waitForTimeout(300);
  const r = await phone.evaluate(() => { const p = window.__paperPlane; return { d: p.distance, l: p.lastLaunch, rel: p.lastRelease, crashed: p.crashed, boosted: p.boosted }; });
  console.log(fmt('phone touch flick', r));
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
