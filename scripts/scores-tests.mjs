// "My best scores" page: browser test + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const errors = [];
const watch = (p) => { p.on('pageerror', (e) => errors.push(String(e))); p.on('console', (m) => m.type() === 'error' && errors.push(m.text())); };
const txt = async (loc) => (await loc.innerText()).replace(/\s+/g, ' ').trim();

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
watch(page);

// --- links in ---
await page.goto(`${BASE}/`);
check(await page.locator('header nav a[href="/scores/"]').count() === 1, 'header nav links to /scores/ next to "All apps"');
check(await page.locator('main a.scores-link[href="/scores/"]').count() === 1, 'home page links to the scores page');
await page.click('header nav a[href="/scores/"]');
await page.waitForURL('**/scores/');
check(await page.locator('h1').innerText() === 'My best scores 🏆', 'the nav link opens "My best scores"');
check(await page.locator('header nav a[aria-current="page"]').innerText() === '🏆 Best scores', 'nav shows Best scores as the current page');

// --- empty state ---
await page.evaluate(() => localStorage.clear());
await page.reload();
const plane = page.locator('[data-game="paper-plane"]'), golf = page.locator('[data-game="disc-golf"]');
for (const [card, name] of [[plane, 'Paper Plane Throw'], [golf, 'Arcade Disc Golf']]) {
  const t = await txt(card);
  check(await card.locator('[data-empty]').isVisible() && await card.locator('[data-played]').isHidden() && /Not played yet – have a go!/.test(t), `${name}: empty state ("${t}")`);
  check(await card.locator(`[data-empty] a[href="/apps/${name === 'Paper Plane Throw' ? 'paper-plane' : 'disc-golf'}/"]`).count() === 1, `${name}: empty state links to the game`);
}
const medalTxt = async (card) => (await txt(card.locator('[data-medals]'))).replace(/★ /g, '');
check(/No medal yet/.test(await medalTxt(plane)) && await page.locator('[data-medals] .medal--none').count() === 9 && await page.locator('[data-medals] li.is-won').count() === 0, 'no medals yet: all nine medals are greyed outlines');
check(/Bronze 40–75 m Silver 75–100 m Gold 100 m\+/.test(await medalTxt(plane)), `plane medal bands on the page: "${await medalTxt(plane)}"`);
check(/Bronze \+3 to \+1 Silver E to −1 Gold −2 or better/.test(await medalTxt(golf)), `disc golf medal bands on the page: "${await medalTxt(golf)}"`);
check(/Gold in every game: 0 of 3/.test(await txt(page.locator('[data-gold-line]'))), 'progress line: "Gold in every game: 0 of 3"');
check(/in this browser on this device only/.test(await txt(page.locator('[data-note]'))), 'note: saved in this browser on this device only');
await page.screenshot({ path: `${OUT}/scores-02-empty.png`, fullPage: true });

// --- seeded values (old-style keys with no dates, plus new ones with dates) ---
await page.evaluate(() => {
  localStorage.setItem('crinklecut.paperPlane.best', '82.4483'); // silver, from a swoop
  localStorage.setItem('crinklecut.paperPlane.medal', 'silver');
  localStorage.setItem('crinklecut.paperPlane.medal.at', '2026-10-23T07:41:00.000Z');
  localStorage.setItem('crinklecut.discGolf.medal', 'gold'); // the 6-throw (−2) round
  localStorage.setItem('crinklecut.discGolf.medal.at', '2026-10-20T19:00:00.000Z');
  localStorage.setItem('crinklecut.paperPlane.best.at', '2026-10-23T07:41:00.000Z');
  localStorage.setItem('crinklecut.discGolf.bestRound', '6');
  localStorage.setItem('crinklecut.discGolf.bestRound.at', '2026-10-20T19:00:00.000Z');
  localStorage.setItem('crinklecut.discGolf.best.0', '1'); // an ace on the Old Oak, set before dates existed
  localStorage.setItem('crinklecut.discGolf.best.1', '3');
  localStorage.setItem('crinklecut.discGolf.best.1.at', '2026-10-22T12:00:00.000Z');
  localStorage.setItem('crinklecut.discGolf.best.2', '2');
  localStorage.setItem('crinklecut.discGolf.best.2.at', '2026-10-23T07:30:00.000Z');
});
await page.reload();
const pt = await txt(plane);
check(/Longest flight 82\.4 m set on 23 Oct 2026/.test(pt), `Paper Plane: "${pt}"`);
const head = await txt(golf.locator('[data-role="headline"]'));
check(/Best round \(3 holes, par 8\) 6 throws 2 under par set on 20 Oct 2026/.test(head), `Disc golf headline: "${head}"`);
const rows = await golf.locator('[data-role="row"]').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
console.log('      holes:', JSON.stringify(rows));
check(/Hole 1: The Old Oak Par 2 1 Ace \(−1\)$/.test(rows[0]), 'hole 1: The Old Oak, par 2, Ace (an old record with no date shows no date)');
check(/Hole 2: Troll Bridge Par 3 · set on 22 Oct 2026 3 Par \(E\)/.test(rows[1]), 'hole 2: Troll Bridge, par 3, Par, set on 22 Oct 2026');
check(/Hole 3: King of the Hill Par 3 · set on 23 Oct 2026 2 Birdie \(−1\)/.test(rows[2]), 'hole 3: King of the Hill, par 3, Birdie');
check(/Best medal: Silver set on 23 Oct 2026/.test(await medalTxt(plane)) && await plane.locator('li.is-won').count() === 2 && await plane.locator('li.is-best[data-tier="silver"]').count() === 1 && await plane.locator('li[data-tier="gold"] .medal--none').count() === 1,
  'plane: best medal Silver (dated), bronze and silver lit, gold still a greyed outline');
check(/Best medal: Gold set on 20 Oct 2026/.test(await medalTxt(golf)) && await golf.locator('li.is-won').count() === 3, 'disc golf: best medal Gold, all three lit');
check(/Gold in every game: 1 of 3/.test(await txt(page.locator('[data-gold-line]'))), `progress line: "${await txt(page.locator('[data-gold-line]'))}"`);
await page.screenshot({ path: `${OUT}/scores-01-desktop-seeded.png`, fullPage: true });
await page.locator('[data-game="paper-plane"] [data-medals]').screenshot({ path: `${OUT}/scores-05-medals-panel.png` });
await page.evaluate(() => localStorage.setItem('crinklecut.paperPlane.medal', 'gold'));
await page.reload();
check(/Gold in every game: 2 of 3/.test(await txt(page.locator('[data-gold-line]'))) && !/Clean sweep/.test(await txt(page.locator('[data-gold-line]'))), 'gold in two of three: "2 of 3", no sweep yet');
await page.evaluate(() => localStorage.setItem('crinklecut.splitTheG.medal', 'gold'));
await page.reload();
check(/Gold in every game: 3 of 3 Clean sweep!/.test(await txt(page.locator('[data-gold-line]'))), 'gold in all three: "3 of 3 Clean sweep!"');
await page.evaluate(() => localStorage.removeItem('crinklecut.splitTheG.medal'));
await page.evaluate(() => localStorage.setItem('crinklecut.paperPlane.medal', 'silver'));

// a partly played game: holes but no full round, plus junk values
await page.evaluate(() => {
  localStorage.removeItem('crinklecut.discGolf.bestRound');
  localStorage.removeItem('crinklecut.discGolf.best.2');
  localStorage.setItem('crinklecut.paperPlane.best', 'banana');
});
await page.reload();
check(/No full round yet/.test(await txt(golf.locator('[data-role="headline"]'))) && /Not played yet/.test(await txt(golf.locator('[data-role="row"]').nth(2))),
  'disc golf with some holes but no full round: "No full round yet", unplayed hole says "Not played yet"');
check(await plane.locator('[data-empty]').isVisible(), 'a junk stored value is treated as not played');

// --- reset, with a confirm step ---
await page.evaluate(() => { localStorage.setItem('crinklecut.paperPlane.best', '9.5'); localStorage.setItem('crinklecut.discGolf.medal', 'gold'); localStorage.setItem('crinklecut.discGolf.medal.at', '2026-10-20T19:00:00.000Z'); });
await page.reload();
await page.click('[data-reset]');
check(await page.locator('[data-confirm]').isVisible(), 'Reset scores asks for confirmation first');
await page.click('[data-reset-no]');
check(await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.best')) === '9.5' && await page.locator('[data-confirm]').isHidden(), '"No, keep them" keeps everything');
await page.click('[data-reset]');
await page.locator('[data-confirm]').screenshot({ path: `${OUT}/scores-04-reset-confirm.png` });
await page.click('[data-reset-yes]');
const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('crinklecut.')));
check(left.length === 0 && /0 of 3/.test(await txt(page.locator('[data-gold-line]'))) && await page.locator('[data-medals] li.is-won').count() === 0, `"Yes, reset them" clears every score, medal and date (left: ${JSON.stringify(left)})`);
check(await plane.locator('[data-empty]').isVisible() && await golf.locator('[data-empty]').isVisible() && await page.locator('[data-reset-done]').isVisible(), 'page shows the empty state again, with a "reset" message');

// --- the games save a date with a new record (and keep the old key format) ---
await page.goto(`${BASE}/apps/disc-golf/`);
await page.waitForTimeout(700);
await page.evaluate(() => window.__discGolf.throwWith(-26, 0.98, 0.7));
await page.waitForFunction(() => window.__discGolf.stage === 'aim', null, { timeout: 20000 });
await page.evaluate(() => window.__discGolf.throwWith(0, 0.55, 0));
await page.waitForFunction(() => window.__discGolf.stage === 'done', null, { timeout: 20000 });
const saved = await page.evaluate(() => ({ v: localStorage.getItem('crinklecut.discGolf.best.0'), at: localStorage.getItem('crinklecut.discGolf.best.0.at') }));
check(saved.v === '2' && !Number.isNaN(Date.parse(saved.at)), `disc golf saves the hole best as before ("${saved.v}") plus its date (${saved.at})`);
await page.goto(`${BASE}/scores/`);
const r0 = await txt(golf.locator('[data-role="row"]').first());
const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
check(r0.includes(`set on ${today}`) && /2 Par \(E\)/.test(r0), `...and it shows on the scores page: "${r0}"`);
await page.goto(`${BASE}/apps/paper-plane/`);
await page.waitForTimeout(700);
const box = await page.locator('canvas').first().boundingBox();
// grab the plane where it sits (world metres -> canvas pixels)
const pos = await page.evaluate(() => { const p = window.__paperPlane; return { x: (p.x - p.readyCamX) * p.ppm, y: p.groundY - p.y * p.ppm }; });
const sx = box.x + pos.x, sy = box.y + pos.y;
await page.mouse.move(sx, sy); await page.mouse.down();
for (let i = 1; i <= 8; i++) { await page.mouse.move(sx + i * 14, sy - i * 3); await page.waitForTimeout(16); }
await page.mouse.up();
await page.waitForFunction(() => localStorage.getItem('crinklecut.paperPlane.best'), null, { timeout: 20000 });
const pp = await page.evaluate(() => ({ v: localStorage.getItem('crinklecut.paperPlane.best'), at: localStorage.getItem('crinklecut.paperPlane.best.at') }));
check(Number(pp.v) > 0 && !Number.isNaN(Date.parse(pp.at)), `paper plane saves its best distance as before (${Number(pp.v).toFixed(1)} m) plus its date`);

// --- medals on the result screens ---
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/apps/paper-plane/`);
await page.waitForTimeout(700);
// a great dive: 16 m/s at −20° from 2.1 m (the sim says ~105 m)
await page.evaluate(() => window.__paperPlane.launch({ x: 0.3, y: 2.1, speed: 16, angle: -20 * Math.PI / 180 }));
await page.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 40000 });
const pDist = await page.evaluate(() => window.__paperPlane.distance);
const pMedal = (await txt(page.locator('[data-end-medal]'))).replace('★ ', '');
check(pDist >= 100 && /^Gold! Top of the podium! · New best medal!$/.test(pMedal) && await page.locator('[data-end-medal] .medal--gold').isVisible(), `plane: a ${pDist.toFixed(1)} m great dive pops "${pMedal}"`);
check(await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.medal')) === 'gold' && await page.evaluate(() => !Number.isNaN(Date.parse(localStorage.getItem('crinklecut.paperPlane.medal.at')))), 'plane: gold saved with its date');
await page.waitForTimeout(700); // let the pop settle
await page.locator('[data-paper-plane]').screenshot({ path: `${OUT}/scores-06-medal-plane-gold.png` });
// a short throw after a gold: no downgrade, and the next target is shown
await page.click('[data-again]');
await page.waitForTimeout(400);
await page.evaluate(() => window.__paperPlane.launch({ x: 0.3, y: 1.5, speed: 8, angle: 5 * Math.PI / 180 }));
await page.waitForFunction(() => document.querySelector('[data-paper-plane]').dataset.phase === 'landed', null, { timeout: 40000 });
const shortD = await page.evaluate(() => window.__paperPlane.distance);
const shortM = await txt(page.locator('[data-end-medal]'));
const gap = (Math.ceil((40 - Math.round(shortD * 10) / 10) * 10) / 10).toFixed(1);
check(shortM === `No medal this time ${gap} m more for bronze`, `plane: a ${shortD.toFixed(1)} m throw says "${shortM}"`);
check(await page.evaluate(() => localStorage.getItem('crinklecut.paperPlane.medal')) === 'gold', 'plane: a worse throw never downgrades the saved medal');

await page.goto(`${BASE}/apps/disc-golf/`);
await page.waitForTimeout(800);
const waitStage = (st, t = 30000) => page.waitForFunction((s) => new RegExp(`^(${s})$`).test(window.__discGolf.stage), st, { timeout: t });
async function playOut() {
  for (let i = 0; i < 10; i++) {
    await waitStage('aim|done');
    if (await page.evaluate(() => window.__discGolf.stage) === 'done') return;
    await page.evaluate(() => {
      const g = window.__discGolf; let best = null;
      for (let a = -60; a <= 60; a += 2) for (let pw = 0.1; pw <= 1.0001; pw += 0.05) for (let c = -1; c <= 1.0001; c += 0.25) {
        const r = g.predict(a, pw, c);
        const sc = r.holed ? -1 : r.left + (r.penalty ? 40 : 0);
        if (!best || sc < best.sc) best = { sc, a, pw, c };
      }
      g.throwWith(best.a, best.pw, best.c);
    });
    await waitStage('aim|done');
  }
}
for (let h = 0; h < 3; h++) {
  await playOut();
  if (h < 2) { check(await page.locator('[data-end-medal]').isHidden(), `disc golf: no medal pop after hole ${h + 1} (medals are per round)`); await page.click('[data-next]'); await page.waitForTimeout(600); }
}
const rt = await page.evaluate(() => window.__discGolf.roundTotals());
const gm = (await txt(page.locator('[data-end-medal]'))).replace('★ ', '');
const vsP = rt.strokes - 8;
const expTier = vsP <= -2 ? 'Gold' : vsP <= 0 ? 'Silver' : vsP <= 3 ? 'Bronze' : null;
check(await page.locator('[data-end-medal]').isVisible() && (expTier ? gm.startsWith(`${expTier}!`) : gm.startsWith('No medal')), `disc golf round of ${rt.strokes} (${vsP} vs par) pops "${gm}"`);
check(await page.evaluate(() => localStorage.getItem('crinklecut.discGolf.medal')) === (expTier ? expTier.toLowerCase() : null), 'disc golf: round medal saved');
await page.waitForTimeout(700);
await page.locator('[data-disc-golf]').screenshot({ path: `${OUT}/scores-07-medal-disc-golf.png` });
await page.goto(`${BASE}/scores/`);
check(/Best medal: Gold/.test(await medalTxt(page.locator('[data-game="paper-plane"]'))) && new RegExp(`Best medal: ${expTier}`).test(await medalTxt(page.locator('[data-game="disc-golf"]'))), 'scores page shows the medals just won');

// --- phone ---
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
watch(phone);
await phone.goto(`${BASE}/scores/`);
await phone.evaluate(() => {
  localStorage.setItem('crinklecut.discGolf.bestRound', '9');
  localStorage.setItem('crinklecut.discGolf.bestRound.at', '2026-10-23T07:41:00.000Z');
  localStorage.setItem('crinklecut.discGolf.best.0', '2');
  localStorage.setItem('crinklecut.discGolf.best.1', '4');
  localStorage.setItem('crinklecut.discGolf.best.1.at', '2026-10-22T12:00:00.000Z');
  localStorage.setItem('crinklecut.discGolf.best.2', '3');
  localStorage.removeItem('crinklecut.paperPlane.best');
  localStorage.setItem('crinklecut.discGolf.medal', 'bronze');
  localStorage.removeItem('crinklecut.paperPlane.medal');
});
await phone.reload();
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 0, `no sideways scrolling on a phone (overflow ${overflow}px)`);
check(/9 throws 1 over par/.test(await txt(phone.locator('[data-game="disc-golf"] [data-role="headline"]'))), 'phone: a round over par shows "1 over par"');
await phone.screenshot({ path: `${OUT}/scores-03-phone.png`, fullPage: true });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all scores page checks passed');
process.exit(failures || errors.length ? 1 : 0);
