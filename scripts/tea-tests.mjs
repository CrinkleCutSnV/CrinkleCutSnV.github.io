// Tea Dunk: browser checks + screenshots. Needs `npm run build && npm run preview` on :4321.
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
const showGame = async (p) => {
  const g = p.locator('[data-tea-dunk]');
  await g.scrollIntoViewIfNeeded();
  const box = await g.boundingBox();
  if (!box || box.y < 0 || box.y + Math.min(box.height, 200) > (p.viewportSize()?.height ?? 900)) {
    await p.evaluate(() => document.querySelector('[data-tea-dunk]')?.scrollIntoView({ block: 'center' }));
  }
};
const canvasPoint = async (p, fx = 0.60, fy = 0.55) => {
  await showGame(p);
  const box = await p.locator('[data-tea-dunk] > canvas').boundingBox();
  if (!box) throw new Error('canvas has no box');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy, box };
};
const waitPhase = async (p, want, ms = 4000) => {
  const steps = Math.ceil(ms / 100);
  for (let i = 0; i < steps; i++) {
    const phase = await p.evaluate((w) => {
      const s = window.__teaDunk.state;
      return w.includes(s.phase) ? s.phase : null;
    }, want);
    if (phase) return phase;
    await p.clock.runFor(100);
  }
  return (await p.evaluate(() => window.__teaDunk.state)).phase;
};
const dunkFor = async (p, holdMs) => {
  const pt = await canvasPoint(p);
  await p.mouse.move(pt.x, pt.y);
  await p.mouse.down();
  await p.clock.runFor(holdMs);
  await p.mouse.up();
  return waitPhase(p, ['dunk-result', 'gameover'], 2500);
};

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
watch(page);
await page.clock.install();
await page.goto(`${BASE}/`);
check(await page.locator('a.card[href="/apps/tea-dunk/"]').count() === 1, 'home page has a Tea Dunk card');
check(/Tea Dunk/.test(await txt(page.locator('a.card[href="/apps/tea-dunk/"]'))), 'the card is titled Tea Dunk');

await page.goto(`${BASE}/apps/tea-dunk/`);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.clock.runFor(400);
const game = page.locator('[data-tea-dunk]');
await game.scrollIntoViewIfNeeded();
const st = () => page.evaluate(() => window.__teaDunk.state);

check(await page.locator('h1').innerText() === 'Tea Dunk 🍵', 'page title is Tea Dunk');
check(await page.locator('[data-lineup] li').count() === 6 && await page.locator('[data-lineup] button').count() === 0, 'Meet the dunkers: six regulars, view only');
const lineup = await txt(page.locator('[data-lineup]'));
check(/Maureen/.test(lineup) && /Digestive/.test(lineup), 'Maureen’s signature is a digestive');
check(/Big Declan/.test(lineup) && /Hobnob/.test(lineup), 'Big Declan’s signature is a Hobnob');
check(/Nervous Nigel/.test(lineup) && /Rich tea/.test(lineup), 'Nervous Nigel’s signature is a rich tea');
check(/Auntie Dot/.test(lineup) && /Custard cream/.test(lineup), 'Auntie Dot’s signature is a custard cream');
check(/Walter the Walrus/.test(lineup) && /Chocolate digestive/.test(lineup), 'Walter’s signature is a chocolate digestive');
check(/Professor Pip/.test(lineup) && /Ginger nut/.test(lineup), 'Professor Pip’s signature is a ginger nut');
check(!/Guinness|McVitie|McVities|logo/i.test(await txt(page.locator('body'))), 'no brand names or logos in the page text');

const first = await st();
check(first.phase === 'intro' && first.introOpen && await page.locator('[data-intro]').isVisible(), `a game starts with an Up next card (${first.char}, ${first.biscuit})`);
const introTxt = await txt(page.locator('[data-intro]'));
check(/Up next/i.test(introTxt) && /Signature biscuit/i.test(introTxt) && /Ready! 🍵/.test(introTxt), `Up next card shows the character and biscuit: "${introTxt.slice(0, 180)}"`);
await game.screenshot({ path: `${OUT}/tea-desktop-start.png` });
await page.locator('.regulars').screenshot({ path: `${OUT}/tea-meet-the-dunkers.png` });
await showGame(page);

// clicking the table while the card is up doesn't dunk
const p0 = await canvasPoint(page, 0.62, 0.72);
await page.mouse.move(p0.x, p0.y);
await page.mouse.down(); await page.clock.runFor(300); await page.mouse.up();
check((await st()).introOpen && (await st()).phase === 'intro', 'clicking the table while the card is up does nothing');

// Ready! dismisses without dunking, even if held
const rb = await page.locator('[data-intro-go]').boundingBox();
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
await page.mouse.down(); await page.clock.runFor(400); await page.mouse.up();
await page.clock.runFor(80);
check(!(await st()).introOpen && (await st()).phase === 'ready' && (await st()).dunkPhase === 'ready', 'clicking (even holding) "Ready!" dismisses the card without dunking');
check(/Press and hold to dunk/.test(await txt(page.locator('[data-hint]'))), 'the hint says to press and hold to dunk');

// a fresh press dunks, and letting go lifts it out
await page.evaluate(() => window.__teaDunk.pick('maureen'));
await page.clock.runFor(80);
await page.locator('[data-intro-go]').click();
await page.clock.runFor(80);
let pt = await canvasPoint(page);
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
await page.clock.runFor(200);
let s = await st();
check(s.phase === 'playing' && s.dunkPhase === 'dunking' && s.depth > -0.1, `holding lowers the biscuit (phase ${s.dunkPhase}, depth ${s.depth?.toFixed(2)})`);
await page.mouse.up();
await page.clock.runFor(250);
s = await st();
check(s.dunkPhase === 'lifting' || s.dunkPhase === 'ready' || s.dunkPhase === 'result' || s.depth < 0.2, `letting go lifts the biscuit (phase ${s.dunkPhase}, depth ${s.depth?.toFixed(2)})`);

// Space works the same way
await page.evaluate(() => window.__teaDunk.pick('declan'));
await page.clock.runFor(80);
await page.keyboard.press('Enter');
await page.clock.runFor(80);
check(!(await st()).introOpen && (await st()).phase === 'ready' && (await st()).char === 'declan', 'Enter dismisses the Up next card for Big Declan');
await page.keyboard.down('Space');
await page.clock.runFor(200);
s = await st();
check(s.phase === 'playing' && s.holding && s.depth > -0.1, 'Space lowers the biscuit');
await page.keyboard.up('Space');
await page.clock.runFor(200);
s = await st();
check(!s.holding && (s.dunkPhase === 'lifting' || s.depth < (await st()).depth + 1), 'releasing Space lifts it');

// mid-dunk with a soggy biscuit (Maureen’s digestive holds long enough to look wet)
await page.evaluate(() => window.__teaDunk.newGame());
await page.clock.runFor(80);
await page.evaluate(() => window.__teaDunk.pick('maureen'));
await page.clock.runFor(80);
await page.locator('[data-intro-go]').click();
await page.clock.runFor(80);
pt = await canvasPoint(page);
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
await page.clock.runFor(2000);
s = await st();
check(s.dunkPhase === 'dunking' && s.soak > 0.45 && !s.broken, `mid-dunk: soggy but still in one piece (soak ${s.soak?.toFixed(2)}, warn ${s.warning})`);
check(s.warning === 'sag' || s.warning === 'crumbs' || s.warning === 'crack' || s.warning === 'critical', `warning signs have started (${s.warning})`);
await game.screenshot({ path: `${OUT}/tea-mid-dunk.png` });
await page.mouse.up();
await waitPhase(page, ['dunk-result', 'gameover'], 2500);
s = await st();
const mid = s.history[s.history.length - 1];
check(s.phase === 'dunk-result' && mid && !mid.broken && mid.score > 0, `a pulled-out dunk scores (${mid?.score}) and is not a miss`);
check(/Nice dunk|nerve|cautious/i.test(await txt(page.locator('[data-end]'))), `the result has a reaction: "${(await txt(page.locator('[data-end]'))).slice(0, 120)}"`);

// a break: hold Nigel’s rich tea until it snaps (fresh game so it doesn't mess up the round count)
await page.evaluate(() => window.__teaDunk.newGame());
await page.clock.runFor(80);
await page.evaluate(() => window.__teaDunk.pick('nigel'));
await page.clock.runFor(80);
await page.locator('[data-intro-go]').click();
await page.clock.runFor(80);
const bestBefore = await page.evaluate(() => localStorage.getItem('crinklecut.teaDunk.best.nigel'));
pt = await canvasPoint(page);
await page.mouse.move(pt.x, pt.y);
await page.mouse.down();
for (let i = 0; i < 40 && !(await st()).broken; i++) await page.clock.runFor(150);
s = await st();
check(s.broken && (s.dunkPhase === 'breaking' || s.dunkPhase === 'result' || s.phase === 'dunk-result'), `holding a rich tea too long breaks it (phase ${s.dunkPhase}, soak ${s.soak})`);
await game.screenshot({ path: `${OUT}/tea-break-splash.png` });
await page.mouse.up();
await waitPhase(page, ['dunk-result'], 2500);
s = await st();
const missed = s.history[s.history.length - 1];
check(missed?.broken && missed?.score === 0, 'a break scores zero and counts as a miss');
const bestAfter = await page.evaluate(() => localStorage.getItem('crinklecut.teaDunk.best.nigel'));
check(bestAfter === bestBefore, 'a miss is never saved as a best dunk');
check(/in it goes|snapped|tea/i.test(await txt(page.locator('[data-end]'))), `the break has a reaction line: "${(await txt(page.locator('[data-end]'))).slice(0, 140)}"`);

// a clean three-biscuit game for a medal (sturdy biscuits, held long enough but not to breaking)
await page.evaluate(() => window.__teaDunk.newGame());
await page.clock.runFor(80);
for (const id of ['declan', 'walter', 'maureen']) {
  await page.evaluate((cid) => window.__teaDunk.pick(cid), id);
  await page.clock.runFor(80);
  await page.locator('[data-intro-go]').click();
  await page.clock.runFor(80);
  const hold = id === 'declan' ? 4000 : 2600;
  const ended = await dunkFor(page, hold);
  s = await st();
  check(s.phase === 'dunk-result' || ended === 'dunk-result', `${id}: dunk finished (phase ${s.phase}, last ${JSON.stringify(s.history[s.history.length - 1] || null)})`);
  await page.locator('[data-again]').click();
  await page.clock.runFor(300);
}
s = await st();
check(s.phase === 'gameover' && s.history.length === 3, `the game ends after three dunks (phase ${s.phase}, history ${s.history.length}, total ${s.total})`);
const endTxt = await txt(page.locator('[data-end]'));
check(/pts/.test(endTxt), `final score is in points: "${endTxt.slice(0, 180)}"`);
check(await page.locator('[data-end-medal] [data-medal="bronze"], [data-end-medal] [data-medal="silver"], [data-end-medal] [data-medal="gold"]').count() >= 1, `the final results award a medal (total ${s.total})`);
await showGame(page);
await game.screenshot({ path: `${OUT}/tea-results-medal.png` });

// how-it-works and British English (the details are closed, so read textContent)
const how = await page.locator('.how').evaluate((el) => el.textContent);
check(/biscuit/.test(how) && /dunk/.test(how.toLowerCase()), 'how-it-works talks about biscuits and dunking');
check(/320/.test(how) && /800/.test(how) && /1160/.test(how), 'how-it-works lists the medal bands');
check(/Maureen/.test(how) && /Nigel/.test(how) && /Hobnob/.test(how), 'how-it-works names the regulars and their biscuits');

// scores page picked up a best if we medalled
await page.goto(`${BASE}/scores/`);
await page.clock.runFor(200);
const teaCard = page.locator('[data-game="tea-dunk"]');
check(await teaCard.count() === 1, 'the scores page has a Tea Dunk card');

// --- phone ---
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
watch(phone);
await phone.clock.install();
await phone.goto(`${BASE}/apps/tea-dunk/`);
await phone.evaluate(() => localStorage.clear());
await phone.reload();
await phone.clock.runFor(400);
const pgame = phone.locator('[data-tea-dunk]');
await showGame(phone);
const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 0, `no sideways scrolling on a phone (overflow ${overflow}px)`);
await pgame.screenshot({ path: `${OUT}/tea-mobile-start.png` });
check(await phone.locator('[data-intro]').isVisible(), 'phone: Up next card is visible at the start');
const go = phone.locator('[data-intro-go]');
const goBox = await go.boundingBox();
check(goBox && goBox.height >= 44, `phone: Ready! is a large tap target (${goBox ? Math.round(goBox.height) : 0}px tall)`);
await go.tap();
await phone.clock.runFor(80);
await showGame(phone);
const pbox = await phone.locator('[data-tea-dunk] > canvas').boundingBox();
const cdp = await phone.context().newCDPSession(phone);
const tp = { x: pbox.x + pbox.width * 0.6, y: pbox.y + pbox.height * 0.55 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
await phone.clock.runFor(500);
const ps = await phone.evaluate(() => window.__teaDunk.state);
check(ps.phase === 'playing' && ps.depth > -0.1, `phone: holding a finger lowers the biscuit (depth ${ps.depth?.toFixed(2)})`);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await phone.clock.runFor(400);
const ps2 = await phone.evaluate(() => window.__teaDunk.state);
check(ps2.depth < ps.depth || ps2.dunkPhase === 'lifting' || ps2.phase === 'dunk-result', 'phone: lifting the finger raises the biscuit');

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all tea dunk checks passed');
process.exit(failures || errors.length ? 1 : 0);
