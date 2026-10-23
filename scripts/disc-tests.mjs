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
{
  // measure the sweep: time between two turnarounds
  const ts = await page.evaluate(async () => {
    const out = []; let prev = window.__discGolf.aim, dir = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 2600 && out.length < 3) {
      await new Promise((r) => requestAnimationFrame(r));
      const a = window.__discGolf.aim, d = Math.sign(a - prev);
      if (dir && d && d !== dir) out.push(performance.now());
      if (d) dir = d; prev = a;
    }
    return out;
  });
  const cycle = ts.length >= 3 ? (ts[2] - ts[0]) / 1000 : NaN;
  check(Math.abs(cycle - 1.6) < 0.15, `direction sweep takes ${cycle.toFixed(2)} s per full cycle`);
}
await page.waitForFunction(() => Math.abs(window.__discGolf.aim - window.__discGolf.lineToBasket() + 0.45) < 0.05);
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
await G(() => window.__discGolf.throwWith(0, 0.55, 0)); // a sensible putt straight at it
await waitStage(page, 'holed|aim');
check(await G(() => window.__discGolf.stage) === 'holed', 'a 55% putt from there is caught by the chains');
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

// same drive, then a full-power putt that's a bit off centre: too hot, it bounces out
for (const [offM, want, file] of [[0.42, 'clang', 'disc-11-clang.png'], [0.7, 'skip', 'disc-12-skip.png']]) {
  await page.reload(); await page.waitForTimeout(700);
  await G(() => window.__discGolf.throwWith(-26, 0.98, 0.7));
  await waitStage(page, 'aim');
  const off = await page.evaluate((m) => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return (Math.atan2(m, Math.hypot(b.x - d.x, b.y - d.y)) * 180) / Math.PI; }, offM);
  await page.evaluate((o) => window.__discGolf.throwWith(o, 1, 0), off);
  await page.waitForFunction(() => ['clang', 'skip'].includes(window.__discGolf.lastEvent) || window.__discGolf.stage === 'holed', null, { timeout: 8000 });
  const ev = await G(() => window.__discGolf.lastEvent);
  await page.waitForTimeout(180);
  await shot(file);
  check(ev === want, `full-power putt ${offM} m off centre: ${ev} (toast "${(await page.locator('[data-toast]').innerText()).trim()}")`);
  await waitStage(page, 'aim');
  const left = await G(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return Math.hypot(b.x - d.x, b.y - d.y); });
  check(left < 8, `...and it ends up ${left.toFixed(1)} m from the basket`);
}
await page.reload();
await page.waitForTimeout(800);

// straight at the basket hits the oak
await G(() => window.__discGolf.throwWith(0, 1, 0));
await waitStage(page, 'aim');
const straight = await G(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return Math.hypot(b.x - d.x, b.y - d.y); });
check(straight > 30, `a straight drive at the basket is stopped by the oak (${straight.toFixed(1)} m left)`);

// --- the full round: holes 2 and 3, the bridge, the water and the scorecard ---
const left = (p = page) => p.evaluate(() => { const d = window.__discGolf.disc, b = window.__discGolf.hole().basket; return Math.hypot(b.x - d.x, b.y - d.y); });
/** play the current hole out with the best throw (from an in-page grid search) each time */
async function playOut(p = page) {
  for (let i = 0; i < 10; i++) {
    await waitStage(p, 'aim|done');
    if (await p.evaluate(() => window.__discGolf.stage) === 'done') return;
    await p.evaluate(() => {
      const g = window.__discGolf; let best = null;
      for (let a = -60; a <= 60; a += 2) for (let pw = 0.1; pw <= 1.0001; pw += 0.05) for (let c = -1; c <= 1.0001; c += 0.25) {
        const r = g.predict(a, pw, c);
        const sc = r.holed ? -1 : r.left + (r.penalty ? 40 : 0);
        if (!best || sc < best.sc) best = { sc, a, pw, c };
      }
      g.throwWith(best.a, best.pw, best.c);
    });
    await waitStage(p, 'aim|done', 30000);
  }
}
const cardRows = () => page.evaluate(() => [...document.querySelectorAll('[data-end-card] tbody tr, [data-end-card] tfoot tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim())));

await page.evaluate(() => localStorage.clear());
await page.reload(); await page.waitForTimeout(800);
await game.scrollIntoViewIfNeeded();
// hole 1: the par route
await G(() => window.__discGolf.throwWith(-26, 0.98, 0.7));
await waitStage(page, 'aim');
await G(() => window.__discGolf.throwWith(0, 0.55, 0));
await waitStage(page, 'done');
check(await page.locator('[data-next]').isVisible(), 'end card after hole 1 offers "Next hole"');
await page.click('[data-next]');
await page.waitForTimeout(200);
check(await G(() => window.__discGolf.holeIdx) === 1 && await G(() => window.__discGolf.strokes) === 0 && await G(() => window.__discGolf.stage) === 'aim',
  `Next hole goes to hole 2, "${await G(() => window.__discGolf.hole().name)}"`);
check(Math.abs(await G(() => window.__discGolf.lineToBasket()) + Math.PI / 2) < 0.01, 'the goal arrow points up the new hole');
const banner = (await page.locator('[data-banner]').innerText()).replace(/\s+/g, ' ');
check(/Troll Bridge/.test(banner), `hole intro banner: "${banner}"`);
await page.waitForTimeout(3500);
await page.waitForFunction(() => Math.abs(window.__discGolf.aim - window.__discGolf.lineToBasket() + 0.3) < 0.05);
await shot('disc-h01-hole2-tee.png');
// the scorecard toggle mid-round
await page.click('[data-card-toggle]');
const mid = (await page.locator('[data-card]').innerText()).replace(/\s+/g, ' ');
check(/The Old Oak 2 2 E E/.test(mid) && /Troll Bridge 3 – – –/.test(mid), `Card button shows the scorecard mid-round: "${mid}"`);
await shot('disc-h06-card-midround.png');
await page.click('[data-card-close]');
check(await page.locator('[data-card]').isHidden(), 'scorecard closes');
// straight at the basket: the bridge rail stops it, and it drops in the stream
await G(() => window.__discGolf.throwWith(0, 1, 0));
await page.waitForFunction(() => window.__discGolf.lastEvent === 'splash', null, { timeout: 8000 });
await page.waitForTimeout(220);
const evs = await G(() => window.__discGolf.throwEvents);
check(evs[0] === 'rail', `a straight full drive at the basket hits the bridge rail (events: ${evs.join(' → ')})`);
await shot('disc-h02-splash.png');
const toastTxt = (await page.locator('[data-toast]').innerText()).trim();
check(toastTxt === 'Splash! +1 penalty' && await G(() => window.__discGolf.strokes) === 2, `in the water: toast "${toastTxt}", throws now ${await G(() => window.__discGolf.strokes)} (1 + penalty)`);
const wetAt = await G(() => window.__discGolf.splashAt);
await waitStage(page, 'aim');
const bank = await G(() => window.__discGolf.disc);
check(bank.y > wetAt.y && Math.hypot(bank.x - wetAt.x, bank.y - wetAt.y) < 6 && Math.hypot(bank.x, bank.y) < Math.hypot(wetAt.x, wetAt.y),
  `replayed from the tee-side bank (${bank.x.toFixed(1)}, ${bank.y.toFixed(1)}), ${Math.hypot(bank.x - wetAt.x, bank.y - wetAt.y).toFixed(1)} m back from the splash`);
await playOut();
const h2 = await G(() => window.__discGolf.strokes);
check(h2 >= 3, `hole 2 played out in ${h2} (including the penalty)`);
await page.click('[data-next]');
await page.waitForTimeout(3600);
check(await G(() => window.__discGolf.hole().name) === 'King of the Hill', 'hole 3 is "King of the Hill"');
await page.waitForFunction(() => Math.abs(window.__discGolf.aim - window.__discGolf.lineToBasket() - 0.2) < 0.05);
await shot('disc-h03-hole3-tee.png');
await G(() => window.__discGolf.throwWith(3, 1, 0));
await page.waitForTimeout(2300);
await shot('disc-h04-hole3-flight.png');
await waitStage(page, 'aim');
console.log(`      (hole 3 drive left ${(await left()).toFixed(1)} m)`);
await playOut();
const h3 = await G(() => window.__discGolf.strokes);
await page.waitForTimeout(500);
await shot('disc-h05-scorecard.png');
const scores = await G(() => window.__discGolf.scores);
const total = scores.reduce((a, x) => a + x, 0);
const rows = await cardRows();
console.log('      scorecard:', JSON.stringify(rows));
check(scores[0] === 2 && scores[1] === h2 && scores[2] === h3, `scores recorded per hole: ${scores.join(', ')}`);
const vs = (d) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`);
check(rows.length === 4 && rows[3][2] === String(total) && rows[3][1] === '8' && rows[3][4] === vs(total - 8), `round total on the card: ${total} on a par 8 (${vs(total - 8)})`);
check(rows[1][4] === vs(2 + h2 - 5) && rows[2][4] === vs(total - 8), 'running totals vs par add up hole by hole');
const endTxt = (await page.locator('[data-end]').innerText()).replace(/\s+/g, ' ');
check(/Round complete/.test(endTxt) && new RegExp(`${total} throws round a par 8`).test(endTxt) && await page.locator('[data-next]').isHidden(), `round end card: "${endTxt.slice(0, 120)}…"`);
check(await G(() => localStorage.getItem('crinklecut.discGolf.bestRound')) === String(total), 'best round saved');
check(await G(() => [0, 1, 2].map((i) => localStorage.getItem(`crinklecut.discGolf.best.${i}`)).join(',')) === scores.join(','), 'best per hole saved for all three');
await page.click('[data-again]');
await page.waitForTimeout(200);
check(await G(() => window.__discGolf.holeIdx) === 0 && await G(() => window.__discGolf.scores.every((x) => x === null)) && await G(() => window.__discGolf.strokes) === 0, 'Play again restarts the round from hole 1');

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
await phone.evaluate(() => window.__discGolf.goToHole(1));
await phone.waitForTimeout(3600);
await phone.screenshot({ path: `${OUT}/disc-h07-phone-hole2.png` });
await phone.evaluate(() => window.__discGolf.goToHole(0));
for (let i = 0; i < 3; i++) {
  await playOut(phone);
  if (i < 2) { await phone.click('[data-next]'); await phone.waitForTimeout(200); }
}
await phone.waitForTimeout(500);
const pc = await phone.locator('[data-end] .end-card').boundingBox(), pg = await phone.locator('[data-disc-golf]').boundingBox();
check(pc.x >= pg.x && pc.x + pc.width <= pg.x + pg.width + 1 && pc.y >= pg.y, 'round scorecard fits on a phone screen');
await phone.locator("[data-disc-golf]").scrollIntoViewIfNeeded();
await phone.locator("[data-disc-golf]").screenshot({ path: `${OUT}/disc-h08-phone-scorecard.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all browser checks passed');
process.exit(failures || errors.length ? 1 : 0);
