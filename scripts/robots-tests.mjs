// Robot Rumble: browser checks + screenshots. Needs `npm run build && npm run preview` on :4321.
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4321';
const OUT = process.env.OUT_DIR || '/workspace/plane-shots';
mkdirSync(OUT, { recursive: true });
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });

const ME = { drive: 'hover', weapon: 'hammer', body: 'dome', brain: 'flanker' };
const THEM = { drive: 'tracks', weapon: 'flipper', body: 'box', brain: 'aggressive' };
const FORCE = { name: 'Kettle of Doom', build: THEM, layout: ['steel', 'ice', 'sand', 'rubble'], seed: 45 }; // a nail-biting KO win at ~35 s, with a hit mid-arena at 25.1 s
const MOMENT = 25.12;

async function run(label, ctxOpts) {
  const errors = [];
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.clock.install();
  await page.goto(`${BASE}/apps/robot-wars/`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.clock.runFor(300);
  const st = () => page.evaluate(() => window.__robotWars.state());
  const game = page.locator('[data-robot-wars]');
  const mobile = !!ctxOpts.isMobile;
  const noOverflow = async (what) => check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${label}: no sideways scrolling (${what})`);

  // --- the workshop ---
  check(await page.locator('[data-part]').count() === 16, `${label}: 16 part buttons (4 × 4)`);
  check(await page.locator('[data-part][aria-checked="true"]').count() === 4, `${label}: one part picked per slot`);
  for (const [k, v] of Object.entries(ME)) await page.locator(`[data-part="${k}"][data-id="${v}"]`).click();
  const s0 = await st();
  check(JSON.stringify(s0.build) === JSON.stringify(ME), `${label}: clicking parts builds the robot (${Object.values(s0.build).join('/')})`);
  const hints = (await page.locator('.parts').innerText()).replace(/\s+/g, ' ');
  check(/Fast on ice/i.test(hints) && /Strong vs Dome · weak vs Open frame/.test(hints) && /fears hammer/.test(hints), `${label}: hints show terrain and matchups`);
  await page.locator('[data-name]').fill('Tin Lizzie');
  check((await st()).name === 'Tin Lizzie', `${label}: name box sets the name`);
  check(/Best streak: no wins yet/.test(await page.locator('[data-best-line]').innerText()), `${label}: best streak starts empty`);
  await page.clock.runFor(700);
  await noOverflow('workshop');
  await game.screenshot({ path: `${OUT}/robots-builder-${mobile ? 'mobile' : 'desktop'}.png` });
  if (mobile) await page.screenshot({ path: `${OUT}/robots-builder-mobile-top.png` });

  // --- fight intro ---
  await page.evaluate((f) => window.__robotWars.force(f), FORCE);
  await page.locator('[data-fight]').click();
  await page.clock.runFor(300);
  check((await st()).phase === 'intro' && await page.locator('[data-intro]').isVisible(), `${label}: Fight! shows the challenger card`);
  const intro = (await page.locator('[data-intro]').innerText()).replace(/\s+/g, ' ');
  check(/Kettle of Doom/.test(intro) && /Tin Lizzie/.test(intro) && /Fight 1/i.test(intro), `${label}: intro names both robots: "${intro.slice(0, 90)}…"`);
  check(/Your hammer is strong vs their box|Your hammer vs their box: even/.test(intro) && /Their flipper vs your dome: even/.test(intro), `${label}: intro spells out the matchups`);
  check(/fast on 🧊 \(top right\)/.test(intro), `${label}: intro shows where your fast ground is`);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/robots-intro-${mobile ? 'mobile' : 'desktop'}.png` });

  // --- countdown and the fight at 1× then 2× ---
  await page.locator('[data-go]').click();
  await page.clock.runFor(1000);
  check((await st()).phase === 'countdown' && await page.locator('[data-count]').isVisible(), `${label}: 3-2-1 countdown`);
  await page.clock.runFor(2400);
  check((await st()).phase === 'fight', `${label}: robots activate after the countdown`);
  const t0 = (await st()).t;
  await page.clock.runFor(4000);
  const t1 = (await st()).t;
  check(Math.abs(t1 - t0 - 4) < 0.6, `${label}: 1× runs in real time (${(t1 - t0).toFixed(2)} s in 4 s)`);
  await page.locator('[data-speed="2"]').click();
  await page.clock.runFor(4000);
  const t2 = (await st()).t;
  check(Math.abs(t2 - t1 - 8) < 1, `${label}: 2× runs twice as fast (${(t2 - t1).toFixed(2)} s in 4 s)`);
  await page.locator('[data-speed="1"]').click();
  // jump to a juicy moment: just after a hit in the middle of the arena
  let s = await st();
  await page.clock.runFor(Math.round((MOMENT - s.t) * 1000) + 60);
  s = await st();
  check(s.log >= 3, `${label}: commentary is running (${s.log} lines)`);
  check(s.hp[0] < 155 && s.hp[1] < 155, `${label}: both robots have taken damage by ${s.t.toFixed(1)} s (${s.hp.map(Math.round).join(' / ')} HP)`);
  const hud = await page.locator('[data-hud-hp]').evaluateAll((els) => els.map((e) => parseFloat(e.style.width)));
  check(hud.every((w) => w > 0 && w < 100), `${label}: HP bars track damage (${hud.map(Math.round).join('% / ')}%)`);
  await noOverflow('arena');
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/robots-battle-${mobile ? 'mobile' : 'desktop'}.png` });

  // --- the result ---
  await page.clock.runFor(16000);
  s = await st();
  check(s.phase === 'result' && s.winner === 0 && s.reason === 'ko', `${label}: forced fight ends in a KO win (${s.reason} at ${s.t.toFixed(1)} s)`);
  const end = (await page.locator('[data-end]').innerText()).replace(/\s+/g, ' ');
  check(/Win streak: 1/.test(end) && /Next challenger/.test(end), `${label}: win card offers Next challenger: "${end.slice(0, 120)}…"`);
  check(await page.locator('[data-end] [data-medal="bronze"]').count() === 1, `${label}: first win earns bronze`);
  check(await page.evaluate(() => localStorage.getItem('crinklecut.robotWars.bestStreak')) === '1', `${label}: best streak saved`);
  await page.locator('[data-battle]').screenshot({ path: `${OUT}/robots-result-${mobile ? 'mobile' : 'desktop'}.png` });

  // --- a run: repaired between fights, a loss ends it ---
  await page.locator('[data-next]').click();
  await page.clock.runFor(300);
  s = await st();
  check(s.phase === 'intro' && s.fightNo === 2 && s.hp[0] === 155, `${label}: Next challenger: fight 2, robot fully repaired (${s.hp[0]} HP)`);
  check(s.opponent.name !== 'Kettle of Doom' || JSON.stringify(s.opponent.build) !== JSON.stringify(THEM), `${label}: a new random challenger (${s.opponent.name})`);
  let streak = 1, lost = false;
  for (let i = 0; i < 25 && !lost; i++) {
    await page.evaluate(() => window.__robotWars.finish());
    await page.clock.runFor(100);
    s = await st();
    if (s.winner === 0) { streak++; check(s.streak === streak, `${label}: win ${streak} counted`); await page.locator('[data-next]').click(); await page.clock.runFor(100); }
    else lost = true;
  }
  const endTxt = (await page.locator('[data-end]').innerText()).replace(/\s+/g, ' ');
  check(lost && /Try again/.test(endTxt) && /New robot/.test(endTxt) && /Run over/.test(endTxt), `${label}: a loss ends the run after ${streak} win(s): "${endTxt.slice(0, 100)}…"`);
  const tier = streak >= 3 ? 'gold' : streak === 2 ? 'silver' : 'bronze';
  check(await page.locator(`[data-end] [data-medal="${tier}"]`).count() === 1, `${label}: medal for a ${streak}-win run is ${tier}`);
  check(await page.evaluate(() => localStorage.getItem('crinklecut.robotWars.bestStreak')) === String(streak), `${label}: best streak is ${streak}`);
  if (!mobile) await page.locator('[data-battle]').screenshot({ path: `${OUT}/robots-loss-desktop.png` });
  await page.locator('[data-again]').click();
  await page.clock.runFor(200);
  s = await st();
  check(s.phase === 'intro' && s.streak === 0 && s.fightNo === 1 && JSON.stringify(s.build) === JSON.stringify(ME), `${label}: Try again keeps the robot and resets the streak`);
  await page.evaluate(() => window.__robotWars.finish());
  await page.clock.runFor(100);
  await page.locator('[data-new]').click();
  await page.clock.runFor(300);
  check((await st()).phase === 'build' && await page.locator('[data-builder]').isVisible(), `${label}: New robot goes back to the workshop`);
  await page.reload();
  await page.clock.runFor(300);
  s = await st();
  check(JSON.stringify(s.build) === JSON.stringify(ME) && s.name === 'Tin Lizzie', `${label}: the last robot is remembered after a reload`);
  check(new RegExp(`Best streak: ${streak} win`).test(await page.locator('[data-best-line]').innerText()), `${label}: workshop shows the best streak`);

  // --- scores page ---
  await page.goto(`${BASE}/scores/`);
  await page.clock.runFor(300);
  const sc = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  check(new RegExp(`Robot Rumble.*${streak} wins?`).test(sc), `${label}: scores page shows the Robot Rumble streak`);
  check(errors.length === 0, `${label}: no console errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  await ctx.close();
}

await run('desktop', { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
await run('mobile', { ...devices['iPhone 13'] });

// the home page lists it
{
  const page = await browser.newPage();
  await page.goto(`${BASE}/`);
  check(await page.locator('a[href*="/apps/robot-wars"]').count() > 0 && await page.locator('img[src="/icons/robot-wars.svg"]').count() > 0, 'home page has the Robot Rumble card and icon');
  await page.close();
}
await browser.close();
console.log(failures ? `\n${failures} failure(s)` : '\nall robot checks passed');
process.exit(failures ? 1 : 0);
