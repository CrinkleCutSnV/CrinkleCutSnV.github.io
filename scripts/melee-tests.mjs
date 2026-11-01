// Robot Rumble Melee: browser checks + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
const PRE = process.env.SHOT_PREFIX || 'melee';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

const ME = { drive: 'legs', weapon: 'spinner', body: 'wedge', brain: 'tactician' };
const FORCE = { seed: 110, layout: ['sand', 'steel', 'ice', 'rubble'] }; // you win by KO at ~39 s; all five are in a scrap at ~18.7 s
const MOMENT = 18.7;

async function run(label, ctxOpts) {
  const errors = [];
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install();
  await page.goto(`${BASE}/apps/robot-melee/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.clock.runFor(300);
  const st = () => page.evaluate(() => window.__robotMelee.state());
  const game = page.locator('[data-robot-melee]');
  const mobile = !!ctxOpts.isMobile;
  const dev = mobile ? 'mobile' : 'desktop';
  const noOverflow = async (what) => check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scrolling (${what})`);

  // --- the shared workshop ---
  check(await page.locator('[data-part]').count() === 16, `${label}: the same 16-part workshop`);
  check(/Into the melee/.test(await page.locator('[data-fight]').innerText()), `${label}: the fight button says "Into the melee"`);
  check(/Best finish: not played yet/.test(await page.locator('[data-best-line]').innerText()), `${label}: best finish starts empty`);
  for (const [k, v] of Object.entries(ME)) await page.locator(`[data-part="${k}"][data-id="${v}"]`).click();
  await page.locator('[data-name]').fill('Tin Lizzie');
  const s0 = await st();
  check(JSON.stringify(s0.build) === JSON.stringify(ME) && s0.name === 'Tin Lizzie', `${label}: clicking parts and typing a name builds the robot`);
  await noOverflow('workshop');

  // --- the line-up ---
  await page.evaluate((f) => window.__robotMelee.force(f), FORCE);
  await page.locator('[data-fight]').click();
  await page.clock.runFor(400);
  let s = await st();
  check(s.phase === 'intro' && s.names.length === 5 && new Set(s.names).size === 5 && s.names[0] === 'Tin Lizzie', `${label}: five robots with five different names (${s.names.join(', ')})`);
  check(new Set(s.builds.slice(1).map((b) => Object.values(b).join())).size >= 3, `${label}: the challengers have random parts`);
  check(await page.locator('[data-lineup] .lu').count() === 5, `${label}: the line-up card lists all five`);
  check(await page.locator('[data-mbars] .mb').count() === 5 && /Tin Lizzie/.test(await page.locator('[data-mbars] .mb--you').innerText()), `${label}: five compact health bars, yours highlighted`);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/${PRE}-lineup-${dev}.png` });

  // --- start of the fight ---
  await page.locator('[data-go]').click();
  await page.clock.runFor(4000);
  s = await st();
  check(s.phase === 'fight' && s.t > 0, `${label}: countdown, then the fight starts (t=${s.t.toFixed(1)})`);
  await page.clock.runFor(1500);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/${PRE}-start-${dev}.png` });
  await page.locator('.stage').screenshot({ path: `${OUT}/${PRE}-map-${dev}.png` });
  s = await st();
  check(s.wall.every((d) => d > 0.5), `${label}: nobody starts in a wall (${s.wall.map((d) => d.toFixed(1)).join(', ')} units clear)`);
  check(s.sees.some((row, i) => row.some((v, j) => i !== j && !v)), `${label}: the walls block the view between some robots`);
  await noOverflow('fight');

  // --- busy mid-melee ---
  s = await st();
  await page.clock.runFor(Math.max(0, Math.round((MOMENT - s.t) * 1000)) + 40);
  s = await st();
  check(s.left === 5 && s.hp.every((h) => h > 0), `${label}: all five still fighting at ${s.t.toFixed(1)} s`);
  const tgt = s.target.filter((t, i) => s.hp[i] > 0);
  check(tgt.filter((t) => t === 0).length <= 2, `${label}: nobody is mobbed (targets ${s.target.join(',')})`);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/${PRE}-mid-${dev}.png` });
  if (!mobile) await page.locator('.stage').screenshot({ path: `${OUT}/${PRE}-mid-arena-desktop.png` });

  // --- a KO, its commentary, and a wreck towed away ---
  await page.evaluate(() => window.__robotMelee.speed(4));
  for (let i = 0; i < 60 && (await st()).kos_events.length === 0; i++) await page.clock.runFor(250);
  s = await st();
  const ko = s.kos_events[0];
  check(ko && ko.left === 4 && s.place[ko.on] === 5, `${label}: first robot out finishes 5th (${s.names[ko?.on]} out at ${ko?.t.toFixed(1)} s)`);
  const log = await page.locator('[data-log]').innerText();
  check(/is out!|KO!|is scrap!/.test(log) && /4 left!/.test(log), `${label}: KO commentary ("${log.split('\n').find((l) => /left!/.test(l))}")`);
  check(/5th/.test(await page.locator(`[data-mb="${ko.on}"]`).innerText()) && await page.locator(`[data-mb="${ko.on}"].is-out`).count() === 1, `${label}: the knocked-out robot's bar is greyed with its placing`);
  const p0 = s.pos[ko.on], s0wall = s.wall[ko.on];
  await page.clock.runFor(1500);
  s = await st();
  const w0 = s0wall, w1 = s.wall[ko.on];
  check(w1 < w0 || w1 < 6, `${label}: the wreck is towed to the nearest wall (${w0.toFixed(1)} → ${w1.toFixed(1)} units from it)`);
  void p0;

  // --- the end ---
  for (let i = 0; i < 120 && (await st()).phase !== 'result'; i++) await page.clock.runFor(500);
  s = await st();
  check(s.slams > 0, `${label}: robots get slammed into the walls (${s.slams} times)`);
  check(s.phase === 'result' && s.over && s.reason === 'ko', `${label}: the melee ends by knockout (${s.t.toFixed(1)} s)`);
  check(JSON.stringify([...s.place].sort()) === '[1,2,3,4,5]', `${label}: placings 1–5 (${s.place.join(',')})`);
  const order = s.kos_events.map((e) => s.place[e.on]);
  check(JSON.stringify(order) === '[5,4,3,2]', `${label}: placings follow the KO order (${order.join(',')})`);
  check(s.place[0] === 1 && s.winner === 0, `${label}: you win this one`);
  const rows = await page.locator('[data-standings] tbody tr').allInnerTexts();
  check(rows.length === 5 && /^1st/.test(rows[0]) && /Tin Lizzie/.test(rows[0]) && /^5th/.test(rows[4]), `${label}: standings card (${rows.map((r) => r.replace(/\s+/g, ' ')).join(' | ')})`);
  check(s.kos.reduce((a, b) => a + b, 0) <= 4 && rows.every((r) => /\d+\s+\d+\s*$/.test(r)), `${label}: KOs and damage on each row`);
  const end = await page.locator('.end-card').innerText();
  check(/Gold/i.test(end) && /🥇/.test(end), `${label}: gold medal for winning`);
  check(await page.evaluate(() => localStorage.getItem('crinklecut.robotMelee.bestPlace')) === '1' && await page.evaluate(() => localStorage.getItem('crinklecut.robotMelee.medal')) === 'gold', `${label}: best place and medal saved`);
  check(await page.locator('[data-again]').isVisible() && await page.locator('[data-new]').isVisible(), `${label}: "Fight again" and "New robot" buttons`);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/${PRE}-standings-${dev}.png` });
  await noOverflow('standings');

  // --- fight again: same robot, new opponents ---
  const before = s.names;
  await page.locator('[data-again]').click();
  await page.clock.runFor(300);
  s = await st();
  check(s.phase === 'intro' && s.meleeNo === 2 && JSON.stringify(s.builds[0]) === JSON.stringify(ME) && s.names[0] === 'Tin Lizzie' && s.names.slice(1).join() !== before.slice(1).join(), `${label}: "Fight again" keeps your robot and brings new challengers`);
  await page.evaluate(() => window.__robotMelee.finish());
  await page.clock.runFor(300);
  s = await st();
  check(s.phase === 'result' && await page.evaluate(() => localStorage.getItem('crinklecut.robotMelee.bestPlace')) === '1', `${label}: a second melee (${s.place[0]}) doesn't overwrite a better best`);
  await page.locator('[data-new]').click();
  await page.clock.runFor(300);
  check((await st()).phase === 'build' && await page.locator('[data-builder]').isVisible(), `${label}: "New robot" goes back to the workshop`);
  check(/Best finish: 1st of 5/.test(await page.locator('[data-best-line]').innerText()), `${label}: workshop shows the best finish`);

  // --- the robot carries over to Robot Rumble ---
  await page.goto(`${BASE}/apps/robot-wars/`);
  await page.clock.runFor(300);
  const rw = await page.evaluate(() => window.__robotWars.state());
  check(JSON.stringify(rw.build) === JSON.stringify(ME) && rw.name === 'Tin Lizzie', `${label}: Robot Rumble's workshop remembers the melee robot`);

  // --- scores page ---
  await page.goto(`${BASE}/scores/`);
  const card = await page.locator('[data-game="robot-melee"]').innerText();
  check(/Robot Rumble Melee/.test(card) && /1st of 5/.test(card) && /Last robot standing/.test(card), `${label}: scores page shows the melee best ("${card.replace(/\s+/g, ' ').slice(0, 100)}")`);
  await page.goto(`${BASE}/`);
  check(await page.locator('a[href="/apps/robot-melee/"]').count() >= 1, `${label}: the home page has a Melee card`);

  check(errors.length === 0, `${label}: no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 900 } });
await run('mobile', { ...devices['iPhone 13'] });
await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall melee checks passed');
process.exit(failures ? 1 : 0);
