// Split the G: the drinker's-eye (POV) view. Browser checks + screenshots.
// Needs `npm run build && npm run preview` on :4321.
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
await page.clock.runFor(300);
const game = page.locator('[data-split-the-g]');
await game.scrollIntoViewIfNeeded();
const st = () => page.evaluate(() => window.__splitTheG.state);
const view = () => game.getAttribute('data-view');
const untilResult = async () => { for (let i = 0; i < 60 && (await st()).phase !== 'result'; i++) await page.clock.runFor(100); };

// --- bar view until you press ---
await page.evaluate(() => window.__splitTheG.pick('walter'));
await page.clock.runFor(3000);
check((await st()).phase === 'ready' && await view() === 'bar', 'before you press: the bar view, Walter holding his pint');
await game.screenshot({ path: `${OUT}/split-pov-01-bar-before.png` });

// --- press: into Walter's eyes ---
await page.mouse.move(10, 10);
await page.keyboard.down('Space');
await page.clock.runFor(200);
const mid = await st();
check(await view() === 'turning' && mid.pov > 0.2 && mid.pov < 0.8, `pressing turns into the drinker's eyes (pov ${mid.pov.toFixed(2)} after 0.2 s)`);
await game.screenshot({ path: `${OUT}/split-pov-02-transition.png` });
await page.clock.runFor(300);
check(await view() === 'pov', 'fully in POV within half a second');
await page.clock.runFor(700);
const l1 = (await st()).line;
await page.clock.runFor(300);
const l2 = (await st()).line;
check(l2 < l1 - 2, `in POV the level keeps dropping while you hold (${l1.toFixed(1)} → ${l2.toFixed(1)} mm)`);
await game.screenshot({ path: `${OUT}/split-pov-03-walter.png` });
await page.keyboard.up('Space');
await page.clock.runFor(200);
check(await view() === 'pov' && (await st()).phase === 'settling', 'letting go: still in POV for a beat');
await page.clock.runFor(700);
check(await view() === 'bar', 'then back to the bar');
await untilResult();
const r1 = await st();
check(r1.phase === 'result' && r1.pov === 0, 'the result comes in the bar view');
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-pov-04-result-back-at-bar.png` });

// --- the POV doesn't change the scoring: a perfect release is still a perfect split ---
await page.evaluate(() => { window.__splitTheG.pick('nigel'); window.__splitTheG.skipPour(); window.__splitTheG.autoRelease = window.__splitTheG.state.target; });
await page.clock.runFor(100);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && (await st()).phase === 'drinking'; i++) await page.clock.runFor(50);
await page.keyboard.up('Space');
await untilResult();
const perf = await st();
check(perf.verdict.mm <= 0.3, `scoring unchanged: a perfect release still splits the G (${perf.verdict.mm} mm)`);
await page.evaluate(() => { window.__splitTheG.autoRelease = null; });
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-pov-05-perfect-back-at-bar.png` });

// --- every drinker's POV ---
for (const id of ['maureen', 'declan', 'nigel', 'dot', 'walter', 'pip']) {
  await page.evaluate((id) => { window.__splitTheG.pick(id); window.__splitTheG.skipPour(); }, id);
  await page.clock.runFor(100);
  await page.keyboard.down('Space');
  await page.clock.runFor(id === 'declan' ? 1000 : 1300);
  check(await view() === 'pov', `${id}: POV while drinking`);
  await game.screenshot({ path: `${OUT}/split-pov-drink-${id}.png` });
  await page.keyboard.up('Space');
  await untilResult();
}

// --- phone: touch hold into POV, no scroll, no long-press menu ---
const phone = await browser.newPage({ ...devices['iPhone 13'] });
watch(phone);
await phone.goto(`${BASE}/apps/split-the-g/`);
const pg = phone.locator('[data-split-the-g]');
await pg.scrollIntoViewIfNeeded();
await phone.evaluate(() => { window.__splitTheG.pick('dot'); window.__splitTheG.skipPour(); });
await phone.waitForTimeout(200);
const pb = await pg.boundingBox();
const y0 = await phone.evaluate(() => scrollY);
const menus = await phone.evaluate(() => { window.__menus = 0; addEventListener('contextmenu', (e) => { if (!e.defaultPrevented) window.__menus++; }); return 0; });
const cdp = await phone.context().newCDPSession(phone);
const tp = { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.45 };
const measure = () => phone.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)); }; requestAnimationFrame(f); }));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const barFps = await measure();
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
// measure frame rate while in POV with the CPU slowed 4x (a mid-range phone)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await phone.waitForTimeout(500);
const fps = await measure();
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tp.x, y: tp.y - 60 }] });
const ph = await phone.evaluate(() => window.__splitTheG.state);
check(ph.phase === 'drinking' && ph.pov === 1, 'phone: touch and hold goes into POV');
// headless Chrome renders on the CPU, so judge POV against the bar view on the same machine
check(fps >= 20 && fps >= barFps * 0.8, `phone, CPU slowed 4x: POV ${fps.toFixed(0)} fps vs bar view ${barFps.toFixed(0)} fps (software rendering)`);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await pg.screenshot({ path: `${OUT}/split-pov-06-mobile-pov.png` });
check(await phone.evaluate(() => scrollY) === y0, 'phone: dragging while holding does not scroll the page');
check(await phone.evaluate(() => window.__menus) === 0 && menus === 0, 'phone: no long-press menu');
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await phone.waitForFunction(() => window.__splitTheG.state.phase === 'result', null, { timeout: 8000 });
check((await phone.evaluate(() => window.__splitTheG.state.pov)) === 0, 'phone: lifting the finger goes back to the bar for the result');
await phone.waitForTimeout(700);
await pg.screenshot({ path: `${OUT}/split-pov-07-mobile-result.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all POV checks passed');
process.exit(failures || errors.length ? 1 : 0);
