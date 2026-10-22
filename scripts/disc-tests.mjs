// Arcade Disc Golf: browser test + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };

const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
watch(page);
const G = (expr) => page.evaluate(expr);
const waitStage = (p, s, timeout = 20000) => p.waitForFunction((s) => s.split('|').includes(window.__discGolf.stage), s, { timeout });

await page.goto(`${BASE}/`);
await page.screenshot({ path: `${OUT}/disc-00-home.png`, fullPage: true });
check(await page.locator('a.card[href="/apps/disc-golf/"]').count() === 1, 'home page lists Arcade Disc Golf');

await page.goto(`${BASE}/apps/disc-golf/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForTimeout(900);
const game = page.locator('[data-disc-golf]');
await game.scrollIntoViewIfNeeded();
await page.waitForTimeout(300);
const shot = (name, p = page) => p.locator('[data-disc-golf]').screenshot({ path: `${OUT}/${name}` });

// --- the real selectors, driven by clicks and Space ---
check(await G(() => window.__discGolf.stage) === 'aim', 'starts on the direction selector');
const a1 = await G(() => window.__discGolf.aim); await page.waitForTimeout(350);
const a2 = await G(() => window.__discGolf.aim);
check(Math.abs(a1 - a2) > 0.05, 'direction arrow sweeps');
await page.waitForTimeout(200);
await shot('disc-01-tee-direction.png');
await game.click({ position: { x: 600, y: 300 } });
check(await G(() => window.__discGolf.stage) === 'power', 'click locks direction, moves to power');
const p = [];
for (let i = 0; i < 12; i++) { p.push(await G(() => window.__discGolf.power)); await page.waitForTimeout(50); }
check(Math.max(...p) - Math.min(...p) > 0.25, `power meter oscillates (saw ${Math.min(...p).toFixed(2)}–${Math.max(...p).toFixed(2)} in 0.6 s)`);
await page.waitForFunction(() => Math.abs(window.__discGolf.power - 0.62) < 0.05);
await shot('disc-02-power-meter.png');
await page.keyboard.press('Space');
check(await G(() => window.__discGolf.stage) === 'curve', 'Space locks power, moves to curve');
await page.waitForFunction(() => window.__discGolf.curve > 0.55);
await shot('disc-03-curve.png');
await page.keyboard.press('Space');
check(await G(() => window.__discGolf.stage) === 'flying' && await G(() => window.__discGolf.strokes) === 1, 'third press throws and counts a stroke');
await waitStage(page, 'aim|done');
const lie = await G(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return { x: d.x, y: d.y, left: Math.hypot(b.x - d.x, b.y - d.y) }; });
console.log(`      (that throw stopped ${lie.left.toFixed(1)} m from the basket)`);

// --- a par-2 route, with exact inputs: curve right round the oak, then a hard putt ---
await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);
await game.scrollIntoViewIfNeeded();
await G(() => window.__discGolf.throwWith(-26, 0.98, 0.7));
await page.waitForTimeout(1900);
await shot('disc-04-in-flight.png');
await waitStage(page, 'aim');
const afterDrive = await G(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return Math.hypot(b.x - d.x, b.y - d.y); });
check(afterDrive < 22, `drive round the oak leaves ${afterDrive.toFixed(1)} m (putter range)`);
await page.waitForTimeout(500);
await shot('disc-05-putt-lie.png');
await G(() => window.__discGolf.throwWith(0, 1, 0)); // full-power putt straight at it
await waitStage(page, 'holed|aim');
check(await G(() => window.__discGolf.stage) === 'holed', 'full-power putt is caught by the chains');
await page.waitForTimeout(250);
await shot('disc-06-chains.png');
await waitStage(page, 'done');
await page.waitForTimeout(400);
await shot('disc-07-holed-out.png');
const card = await page.locator('[data-end]').innerText();
check(/Par/.test(card) && /2 throws/.test(card), `end card: ${card.replace(/\s+/g, ' ').trim()}`);
check(await G(() => localStorage.getItem('crinklecut.discGolf.best.0')) === '2', 'best score saved');
await page.click('[data-again]');
check(await G(() => window.__discGolf.stage) === 'aim' && await G(() => window.__discGolf.strokes) === 0, 'Play again resets the hole');

// straight at the basket hits the oak
await G(() => window.__discGolf.throwWith(0, 1, 0));
await waitStage(page, 'aim');
const straight = await G(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return Math.hypot(b.x - d.x, b.y - d.y); });
check(straight > 30, `a straight drive at the basket is stopped by the oak (${straight.toFixed(1)} m left)`);

// --- phone, real touch taps ---
const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
watch(phone);
await phone.goto(`${BASE}/apps/disc-golf/`);
await phone.waitForTimeout(800);
await phone.locator('[data-disc-golf]').scrollIntoViewIfNeeded();
await phone.waitForTimeout(300);
const pb = await phone.locator('[data-disc-golf] canvas').boundingBox();
const cdp = await phone.context().newCDPSession(phone);
const tap = async () => {
  const pt = [{ x: pb.x + pb.width / 2, y: pb.y + pb.height * 0.45 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
await phone.screenshot({ path: `${OUT}/disc-08-phone.png` });
await tap();
await phone.waitForFunction(() => Math.abs(window.__discGolf.power - 0.7) < 0.06);
await phone.screenshot({ path: `${OUT}/disc-09-phone-power.png` });
await tap(); await tap();
check(await phone.evaluate(() => window.__discGolf.stage) === 'flying', 'three touch taps throw on a phone');
await phone.waitForTimeout(1500);
await phone.screenshot({ path: `${OUT}/disc-10-phone-flight.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all browser checks passed');
process.exit(failures || errors.length ? 1 : 0);
