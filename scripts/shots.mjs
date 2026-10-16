// Headless smoke test + screenshots. Needs `npm run build && npm run preview` running on :4321.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${BASE}/`);
await page.screenshot({ path: `${OUT}/01-home.png`, fullPage: true });

await page.goto(`${BASE}/apps/paper-plane/`);
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/02-game-ready.png` });
const box = await page.locator('[data-paper-plane] canvas').boundingBox();

/** Drag from the desk: dx/dy in px, over `ms` milliseconds in `n` steps. */
async function throwPlane({ dx, dy, ms, n = 12, shotMid, shotFlight, shotEnd }) {
  const x0 = box.x + box.width * 0.24, y0 = box.y + box.height * 0.62;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= n; i++) {
    await page.mouse.move(x0 + (dx * i) / n, y0 + (dy * i) / n);
    await page.waitForTimeout(ms / n);
    if (shotMid && i === Math.round(n * 0.75)) await page.screenshot({ path: shotMid });
  }
  await page.mouse.up();
  if (shotFlight) {
    await page.waitForTimeout(1300);
    await page.screenshot({ path: shotFlight });
    // two frames a moment apart to show the corridor scrolling 1:1 and the skyline (nearly) still
    const cam = () => page.evaluate(() => ({ camX: window.__paperPlane.camX, ppm: window.__paperPlane.ppm }));
    await page.waitForTimeout(200);
    const a = await cam(); await page.screenshot({ path: `${OUT}/parallax-a.png` });
    await page.waitForTimeout(220);
    const b = await cam(); await page.screenshot({ path: `${OUT}/parallax-b.png` });
    const px = (b.camX - a.camX) * a.ppm;
    console.log(`parallax frames: camera moved ${(b.camX - a.camX).toFixed(2)} m = ${px.toFixed(0)} CSS px; corridor shifts ${px.toFixed(0)} px, skyline shifts ${(px * 0.03).toFixed(1)} px`);
  }
  await page.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 30000 });
  await page.waitForTimeout(400);
  if (shotEnd) await page.screenshot({ path: shotEnd });
  const r = await page.evaluate(() => ({ d: window.__paperPlane.distance, l: window.__paperPlane.lastLaunch }));
  await page.click('[data-again]');
  await page.waitForTimeout(500);
  return r;
}

const fmt = (name, r) => `${name.padEnd(8)} ${r.d.toFixed(1).padStart(5)} m  (launch ${r.l.speed.toFixed(1)} m/s at ${(r.l.angle * 180 / Math.PI).toFixed(0)}°)`;

const strong = await throwPlane({
  dx: 380, dy: -45, ms: 180, n: 12,
  shotMid: `${OUT}/03-aiming.png`, shotFlight: `${OUT}/04-mid-flight.png`, shotEnd: `${OUT}/05-landed.png`,
});
console.log(fmt('strong', strong));
console.log(fmt('medium', await throwPlane({ dx: 220, dy: -20, ms: 260, n: 12 })));
console.log(fmt('weak', await throwPlane({ dx: 70, dy: 0, ms: 300, n: 10 })));
console.log(fmt('lob', await throwPlane({ dx: 200, dy: -200, ms: 160, n: 10 })));
console.log(fmt('spike', await throwPlane({ dx: 250, dy: 120, ms: 160, n: 10 })));
console.log('best in localStorage:', await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.best')));

// phone-sized portrait, touch
const phone = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true });
phone.on('pageerror', (e) => errors.push(String(e)));
await phone.goto(`${BASE}/apps/paper-plane/`);
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${OUT}/06-phone.png` });
// real touch drag via CDP
{
  const cdp = await phone.context().newCDPSession(phone);
  const pb = await phone.locator('[data-paper-plane] canvas').boundingBox();
  const x0 = pb.x + pb.width * 0.4, y0 = pb.y + pb.height * 0.62;
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', x0, y0);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', x0 + 18 * i, y0 - 2 * i); await phone.waitForTimeout(15); if (i === 8) await phone.screenshot({ path: `${OUT}/07-phone-aiming.png` }); }
  await touch('touchEnd');
  await phone.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 30000 });
  await phone.waitForTimeout(400);
  await phone.screenshot({ path: `${OUT}/08-phone-landed.png` });
  console.log(fmt('touch', await phone.evaluate(() => ({ d: window.__paperPlane.distance, l: window.__paperPlane.lastLaunch }))));
}

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
