// Headless checks for the doorway lintel and the (secret) dive boost.
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
await page.waitForTimeout(800);
const box = await page.locator('[data-paper-plane] canvas').boundingBox();
const S = () => page.evaluate(() => { const p = window.__paperPlane; return { x: p.x, y: p.y, d: p.distance, boost: p.boost, boosted: p.boosted, crashed: p.crashed, doorX: p.doorX, camX: p.camX, ppm: p.ppm, l: p.lastLaunch }; });

const start = await S();
console.log(`door at ${start.doorX.toFixed(2)} m; initial view right edge ${(start.camX + box.width / start.ppm).toFixed(2)} m`);

/** path: list of [dx, dy, ms] segments relative to the grab point */
async function throwPath(path, { during } = {}) {
  const x0 = box.x + box.width * 0.24, y0 = box.y + box.height * 0.62;
  let x = x0, y = y0;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const [dx, dy, ms, n = 8] of path) {
    for (let i = 1; i <= n; i++) {
      await page.mouse.move(x + (dx * i) / n, y + (dy * i) / n);
      await page.waitForTimeout(ms / n);
    }
    x += dx; y += dy;
  }
  await page.mouse.up();
  if (during) await during();
  await page.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 30000 });
  await page.waitForTimeout(450);
  return S();
}
const again = async () => { await page.click('[data-again]'); await page.waitForTimeout(900); };
const fmt = (name, r) => `${name.padEnd(14)} ${r.d.toFixed(1).padStart(6)} m  launch ${r.l.speed.toFixed(1)} m/s at ${(r.l.angle * 180 / Math.PI).toFixed(0).padStart(3)}° from y=${r.l.y.toFixed(2)} m  ${r.crashed ? 'CRASHED (' + r.crashed + ')' : ''}${r.boosted ? 'DIVE BOOST' : ''}`;

// 1. normal strong throw (flat-ish), screenshot when the doorway is in view
let r = await throwPath([[380, -45, 180, 12]], {
  during: async () => {
    await page.waitForFunction(() => window.__paperPlane.camX + 7 > window.__paperPlane.doorX + 0.5 || window.__paperPlane.phase === 'stopped', null, { timeout: 10000 });
    await page.waitForTimeout(120);
    await page.screenshot({ path: `${OUT}/doorway-mid-flight.png` });
  },
});
console.log(fmt('normal strong', r)); await again();

// 2. ceiling skim: fast and upwards from high in the zone -> should clip the lintel
r = await throwPath([[0, -120, 250, 6], [360, -120, 150, 10]]);
console.log(fmt('ceiling skim', r));
if (r.crashed) await page.screenshot({ path: `${OUT}/lintel-crash.png` });
await again();

// 3. medium upward throw that also clips it
r = await throwPath([[260, -90, 200, 10]]);
console.log(fmt('medium upward', r)); if (r.crashed && !errors.length) await page.screenshot({ path: `${OUT}/lintel-crash-2.png` }); await again();

// 4. sloppy dive: too steep
r = await throwPath([[0, -320, 300, 8], [200, 300, 90, 6]]);
console.log(fmt('sloppy (steep)', r)); await again();

// 5. sloppy dive: too slow
r = await throwPath([[0, -320, 300, 8], [160, 75, 300, 8]]);
console.log(fmt('sloppy (slow)', r)); await again();

// 6. good dive: lift high, then a fast flick down-right at ~-25°
r = await throwPath([[0, -320, 300, 8], [330, 150, 75, 6]], {
  during: async () => {
    await page.waitForFunction(() => window.__paperPlane.boost === 2 || window.__paperPlane.phase === 'stopped', null, { timeout: 10000, polling: 10 });
    await page.waitForTimeout(60);
    await page.screenshot({ path: `${OUT}/dive-swoop.png` });
  },
});
console.log(fmt('good dive', r));
await page.screenshot({ path: `${OUT}/dive-end.png` });
await again();

// 7. great dive: same idea, faster flick
r = await throwPath([[0, -320, 300, 8], [400, 185, 60, 6]]);
console.log(fmt('great dive', r));
await page.screenshot({ path: `${OUT}/dive-end-great.png` });

console.log('best in localStorage:', await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.best')));
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
