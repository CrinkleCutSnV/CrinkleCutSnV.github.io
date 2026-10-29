// Split the G: browser checks + screenshots. Needs `npm run build && npm run preview` on :4321.
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
await page.clock.runFor(500);
const game = page.locator('[data-split-the-g]');
await game.scrollIntoViewIfNeeded();
const st = () => page.evaluate(() => window.__splitTheG.state);
const phase = async () => (await st()).phase;

// --- no picking: the pub lines up a random drinker, with an 'Up next' card ---
check(await page.locator('[data-lineup] li').count() === 6 && await page.locator('[data-lineup] button').count() === 0, 'Meet the regulars: six drinkers, view only (nothing to pick)');
check(await page.locator('[data-random], [data-change], [data-pick]').count() === 0, 'no pick screen, no "Surprise me", no "Change drinker"');
const first = await st();
check(first.phase === 'pouring' && await page.locator('[data-intro]').isVisible(), `the first pint pours straight away for a random drinker (${first.char}), with an "Up next" card`);
const introTxt = (await page.locator('[data-intro]').innerText()).replace(/\s+/g, ' ');
check(/Up next/i.test(introTxt) && /Quirk:/.test(introTxt), `Up next card: "${introTxt.slice(0, 140)}"`);
await game.screenshot({ path: `${OUT}/split-v2-01-up-next.png` });
await page.locator('.regulars').screenshot({ path: `${OUT}/split-v2-02-meet-the-regulars.png` });
// a run of pints: random, never the same drinker twice in a row, and the G never moves
const ids = [first.char];
const geos = [];
for (let i = 0; i < 24; i++) {
  await page.evaluate(() => window.__splitTheG.next());
  await page.clock.runFor(50);
  const s1 = await st();
  ids.push(s1.char);
  geos.push(JSON.stringify([s1.g, s1.target, s1.geo.gTop, s1.geo.gBottom, s1.geo.bar, s1.geo.curl, s1.geo.target, s1.geo.glassX, s1.geo.glassY]));
}
check(ids.every((id, i) => i === 0 || id !== ids[i - 1]), `never the same drinker twice running: ${ids.join(' → ')}`);
check(new Set(ids).size >= 4, `the pub spreads it around (${new Set(ids).size} different drinkers in 25 pints)`);
check(new Set(geos).size === 1, 'the glass, the G and the split line are identical for every pint and every drinker');

// --- Maureen (forced via the test hook); the pint has to settle first ---
await page.evaluate(() => window.__splitTheG.pick('maureen'));
await page.clock.runFor(300);
check(await phase() === 'pouring', 'a new pint settles first');
await page.mouse.move(10, 10);
await page.keyboard.down('Space');
await page.clock.runFor(50);
check(await phase() === 'pouring', 'pressing before it settles does nothing');
await page.keyboard.up('Space');
await page.clock.runFor(2700);
check(await phase() === 'ready' && !(await page.locator('[data-intro]').isVisible()), 'then the card goes and it is ready');
// close-up of the glass with the G and the split line marked
const g0 = (await st()).geo;
const cb = await game.boundingBox();
const pad = g0.s * 10;
const clip = { x: cb.x + g0.gLeft - pad * 2.6, y: cb.y + g0.gTop - pad * 2.4, width: (g0.gRight - g0.gLeft) + pad * 5.6, height: (g0.gBottom - g0.gTop) + pad * 4.6 };
await page.evaluate(({ g, clip, cb }) => {
  const c = document.createElement('canvas'); c.id = '__marks';
  Object.assign(c.style, { position: 'fixed', left: `${cb.x}px`, top: `${cb.y}px`, width: `${cb.width}px`, height: `${cb.height}px`, pointerEvents: 'none', zIndex: 99 });
  c.width = cb.width * 2; c.height = cb.height * 2; document.body.append(c);
  const x = c.getContext('2d'); x.scale(2, 2);
  const L = g.gLeft - 18, Rr = g.gRight + 18;
  const ln = (y, col, dash, label) => { x.setLineDash(dash); x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); x.moveTo(L, y); x.lineTo(Rr, y); x.stroke(); x.setLineDash([]); x.font = '700 11px system-ui'; x.fillStyle = col; x.fillText(label, Rr + 4, y + 4); };
  ln(g.curl, '#7fd1ff', [3, 3], 'curl');
  ln(g.target, '#ffd84a', [], 'split line');
  ln(g.bar, '#ff9a7a', [3, 3], 'bar');
}, { g: g0, clip, cb });
await page.screenshot({ path: `${OUT}/split-v2-03-glass-closeup.png`, clip: { ...clip, width: clip.width + 70 } });
await page.evaluate(() => document.getElementById('__marks').remove());
check(Math.abs(g0.target - (g0.bar + g0.curl) / 2) < 0.01, `on screen the split line is halfway between bar (${g0.bar.toFixed(1)} px) and curl (${g0.curl.toFixed(1)} px): ${g0.target.toFixed(1)} px`);

// --- hold the pointer to drink (mid-drink shot) ---
const box = await game.boundingBox();
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
const before = (await st()).line;
await page.mouse.down();
await page.clock.runFor(600);
const mid = await st();
check(mid.phase === 'drinking' && mid.line < before - 8, `holding drinks: line ${before.toFixed(1)} → ${mid.line.toFixed(1)} mm`);
await game.screenshot({ path: `${OUT}/split-v2-04-mid-drink.png` });
await page.mouse.up();
const atRelease = (await st()).line;
await page.clock.runFor(100);
check((await phase()) === 'settling', 'letting go ends the gulp');
await page.mouse.down(); await page.clock.runFor(200); await page.mouse.up();
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const miss = await st();
check(miss.phase === 'result', 'one gulp per pint: pressing again after letting go does nothing, the ref calls it');
check(miss.line < atRelease, `the glass coming back down takes a bit more: ${atRelease.toFixed(1)} → ${miss.line.toFixed(1)} mm`);
const missTxt = (await page.locator('[data-end]').innerText()).replace(/\s+/g, ' ');
console.log(`      result: "${missTxt}"`);
check(miss.verdict.mm > 3 && miss.verdict.signed > 0, `stopping early is a miss above the split line (${miss.verdict.signed} mm)`);
check(/Next pint/.test(await page.locator('[data-again]').innerText()), 'the result offers "Next pint"');
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-v2-05-early-miss.png` });

// --- a near miss: auto-release aimed 2.5 mm low (silver) ---
await page.evaluate(() => { window.__splitTheG.pick('maureen'); window.__splitTheG.skipPour(); window.__splitTheG.autoRelease = window.__splitTheG.state.target - 2.5; });
await page.clock.runFor(100);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && await phase() === 'drinking'; i++) await page.clock.runFor(50);
await page.keyboard.up('Space');
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const near = await st();
check(near.verdict.mm > 1 && near.verdict.mm <= 3.5 && /Silver/.test(await page.locator('[data-end-medal]').innerText()), `a near miss (${near.verdict.signed} mm) is silver`);
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-v2-06-near-miss.png` });
await page.evaluate(() => { window.__splitTheG.autoRelease = null; });

// --- a perfect split (auto-release at exactly the right moment) ---
await page.evaluate(() => { window.__splitTheG.pick('maureen'); window.__splitTheG.autoRelease = window.__splitTheG.state.target; });
await page.clock.runFor(2900);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && await phase() === 'drinking'; i++) await page.clock.runFor(50);
await page.keyboard.up('Space');
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const perfect = await st();
check(perfect.verdict && perfect.verdict.mm <= 0.3 && perfect.verdict.rating === 'Split the G!', `a perfectly timed release splits the G (${perfect.verdict?.mm} mm)`);
check(/Gold!/.test(await page.locator('[data-end-medal]').innerText()), 'and wins gold');
let pg0 = perfect.geo;
check(Math.abs(pg0.line - pg0.target) < 0.3 * pg0.s + 0.5 && pg0.line > pg0.curl && pg0.line < pg0.bar, `perfect: the beer line (${pg0.line.toFixed(1)} px) sits midway between curl (${pg0.curl.toFixed(1)}) and bar (${pg0.bar.toFixed(1)})`);
await page.clock.runFor(700);
await game.screenshot({ path: `${OUT}/split-v2-07-perfect-split.png` });
pg0 = (await st()).geo;
const gb = await game.boundingBox();
await page.screenshot({ path: `${OUT}/split-v2-08-perfect-closeup.png`, clip: { x: gb.x + pg0.gLeft - pg0.s * 40, y: gb.y + pg0.gTop - pg0.s * 14, width: (pg0.gRight - pg0.gLeft) + pg0.s * 110, height: (pg0.gBottom - pg0.gTop) + pg0.s * 30 } });
const best = await page.evaluate(() => ({ all: localStorage.getItem('crinklecut.splitTheG.best'), m: localStorage.getItem('crinklecut.splitTheG.best.maureen'), medal: localStorage.getItem('crinklecut.splitTheG.medal') }));
check(Number(best.all) <= 0.3 && best.medal === 'gold', `best saved: ${best.all} mm, medal ${best.medal}`);
await page.evaluate(() => { window.__splitTheG.autoRelease = null; });

// --- each drinker gets a go via the debug hook; holding on forever finishes the pint ---
for (const id of ['declan', 'nigel', 'dot', 'walter', 'pip']) {
  await page.evaluate((id) => window.__splitTheG.pick(id), id);
  await page.evaluate(() => window.__splitTheG.skipPour());
  await page.clock.runFor(100);
  await page.keyboard.down('Space');
  await page.clock.runFor(id === 'declan' ? 900 : 1300);
  await game.screenshot({ path: `${OUT}/split-v2-drinking-${id}.png` });
  await page.keyboard.up('Space');
  for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
  const r = await st();
  console.log(`      ${id}: ${r.verdict.signed} mm, "${r.verdict.rating}"`);
  await page.clock.runFor(600);
  await game.screenshot({ path: `${OUT}/split-v2-result-${id}.png` });
}
await page.evaluate(() => { window.__splitTheG.pick('declan'); window.__splitTheG.skipPour(); });
await page.clock.runFor(100);
await page.keyboard.down('Space');
for (let i = 0; i < 100 && await phase() === 'drinking'; i++) await page.clock.runFor(100);
await page.keyboard.up('Space');
for (let i = 0; i < 40 && await phase() !== 'result'; i++) await page.clock.runFor(100);
const empty = await st();
check(empty.emptied && /finishing the pint/.test(await page.locator('[data-end-remark]').innerText()), 'holding on forever finishes the pint and ends the go');
await page.click('[data-again]');
await page.clock.runFor(50);
const nxt = await st();
check(nxt.char !== 'declan' && nxt.phase === 'pouring', `"Next pint" brings a different random drinker (${nxt.char})`);

// --- scores page ---
await page.goto(`${BASE}/scores/`);
const card = page.locator('[data-game="split-the-g"]');
const ctext = (await card.innerText()).replace(/\s+/g, ' ');
check(/Split the G/.test(ctext) && /Best medal: Gold/.test(ctext) && /within 9 mm/.test(ctext) && /within 3.5 mm/.test(ctext) && /within 1 mm/.test(ctext), `scores page card: "${ctext.slice(0, 240)}…"`);
check(/0\.\d mm/.test(await card.locator('[data-role="headline"] [data-value]').innerText()), 'closest split shows on the scores page');
await card.screenshot({ path: `${OUT}/split-v2-09-scores-entry.png` });
await page.goto(`${BASE}/`);
check(await page.locator('a.card[href="/apps/split-the-g/"]').count() === 1, 'home page has a Split the G card');
await page.locator('a.card[href="/apps/split-the-g/"]').screenshot({ path: `${OUT}/split-v2-10-home-card.png` });

// --- phone ---
const phone = await browser.newPage({ ...devices['iPhone 13'], defaultBrowserType: undefined });
watch(phone);
await phone.clock.install();
await phone.goto(`${BASE}/apps/split-the-g/`);
await phone.clock.runFor(500);
const pg = phone.locator('[data-split-the-g]');
await pg.scrollIntoViewIfNeeded();
await pg.screenshot({ path: `${OUT}/split-v2-11-mobile-up-next.png` });
await phone.tap('[data-intro-go]');
await phone.clock.runFor(100);
check((await phone.evaluate(() => window.__splitTheG.state.phase)) === 'ready', 'phone: "Ready!" on the Up next card skips the wait');
const pb = await pg.boundingBox();
const y0 = await phone.evaluate(() => scrollY);
const cdp = await phone.context().newCDPSession(phone);
const tp = { x: pb.x + pb.width * 0.5, y: pb.y + pb.height * 0.45 };
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp] });
await phone.clock.runFor(1200);
await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tp.x, y: tp.y - 60 }] });
await phone.clock.runFor(200);
const ph = await phone.evaluate(() => window.__splitTheG.state);
check(ph.phase === 'drinking', 'phone: touch and hold drinks');
check(await phone.evaluate(() => scrollY) === y0, 'phone: dragging while holding does not scroll the page');
await pg.screenshot({ path: `${OUT}/split-v2-12-mobile-drinking.png` });
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
for (let i = 0; i < 40 && (await phone.evaluate(() => window.__splitTheG.state.phase)) !== 'result'; i++) await phone.clock.runFor(100);
check((await phone.evaluate(() => window.__splitTheG.state.phase)) === 'result', 'phone: lifting the finger ends the gulp');
await phone.clock.runFor(700);
await pg.screenshot({ path: `${OUT}/split-v2-13-mobile-result.png` });

console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no page errors');
await browser.close();
console.log(failures || errors.length ? 'SOME CHECKS FAILED' : 'all split checks passed');
process.exit(failures || errors.length ? 1 : 0);
