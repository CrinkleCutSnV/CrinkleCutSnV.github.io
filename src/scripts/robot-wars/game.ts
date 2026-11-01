// Robot Rumble: the workshop, the fight loop, the commentary and the result card.
import {
  ARENA, BODIES, DRIVES, DT, PARTS, PART_LABEL, TIME_LIMIT, WEAPONS,
  createBattle, matchup, randomBuild, randomLayout, randomName, rng, step,
  type Battle, type BattleEvent, type Build, type Layout, type PartKind, type ZoneId,
} from './sim';
import { ZONE_EMOJI, drawArena, drawBot, type BotLook } from './draw';
import { BEST_STREAK_KEY } from './keys';
import { KINDS, esc, initWorkshop, sizeCanvas } from './workshop';
import { Commentary, Fx, nameTag, pickOne, teamRing } from './fx';
import { readNumber, saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { ROBOT_MEDALS } from '../../data/medals';

type Phase = 'build' | 'intro' | 'countdown' | 'fight' | 'over' | 'result';
const COUNT_TIME = 3.2; // s: 3, 2, 1, ACTIVATE!
const END_DELAY = 1.4; // s of KO dust before the result card
const partName = (kind: PartKind, id: string) => (PARTS[kind] as Record<string, { name: string }>)[id].name;
const fastZone = (b: Build) => DRIVES[b.drive].fast;
const slowZone = (b: Build) => DRIVES[b.drive].slow;
const zoneWhere = (L: Layout, z: ZoneId) => ['top left', 'top right', 'bottom left', 'bottom right'][L.indexOf(z)];
const wins = (n: number) => `${n} win${n === 1 ? '' : 's'}`;

export function initRobotWars(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const ui = {
    builder: $('[data-builder]'), battle: $('[data-battle]'), bestLine: $('[data-best-line]'),
    sides: [0, 1].map((i) => root.querySelector<HTMLElement>(`[data-side="${i}"]`)!),
    timer: $('[data-timer]'), speeds: $$<HTMLButtonElement>('[data-speed]'),
    stage: $('.stage'), arena: $<HTMLCanvasElement>('[data-arena]'), count: $('[data-count]'), log: $('[data-log]'),
    intro: $('[data-intro]'), introKicker: $('[data-intro-kicker]'), introParts: $('[data-intro-parts]'), introNotes: $('[data-intro-notes]'),
    introMap: $<HTMLCanvasElement>('[data-intro-map]'), go: $('[data-go]'),
    end: $('[data-end]'), endCard: $('.end-card'), endTitle: $('[data-end-title]'), endHow: $('[data-end-how]'), endScore: $('[data-end-score]'),
    endStreak: $('[data-end-streak]'), endMedal: $('[data-end-medal]'), endButtons: $('[data-end-buttons]'),
  };
  const ctx = ui.arena.getContext('2d')!;

  // ---- state ----
  const shop = initWorkshop(root, () => startRun());
  let name = shop.name;
  let phase: Phase = 'build';
  let streak = 0, fightNo = 0;
  let battle: Battle | null = null;
  let opp: { name: string; build: Build } | null = null;
  let forced: { name?: string; build?: Build; layout?: Layout; seed?: number } | null = null;
  let speed = 1, acc = 0, phaseT = 0, evIndex = 0;
  const fx = new Fx();
  const comm = new Commentary(ui.log);
  let arenaCache: HTMLCanvasElement | null = null, cacheKey = '';

  const best = () => readNumber(BEST_STREAK_KEY) ?? 0;
  const showBest = () => { const b = best(); ui.bestLine.textContent = b ? `Best streak: ${wins(b)} in a row` : 'Best streak: no wins yet'; };
  const setPhase = (p: Phase) => { phase = p; phaseT = 0; root.dataset.phase = p; };

  // ---- a run ----
  function startRun() {
    shop.ready(); name = shop.name;
    streak = 0; fightNo = 0;
    nextFight();
  }
  function nextFight() {
    fightNo++;
    const seed = forced?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const r = rng(seed ^ 0x5bd1e995);
    let oname = forced?.name ?? randomName(r);
    while (oname === name) oname = randomName(r);
    opp = { name: oname, build: forced?.build ?? randomBuild(r) };
    const layout = forced?.layout ?? randomLayout(r);
    forced = null;
    battle = createBattle({ name, build: shop.build }, opp, seed, layout);
    evIndex = 0; fx.reset(2); acc = 0;
    comm.reset();
    ui.builder.classList.add('is-hidden');
    ui.battle.classList.remove('is-hidden');
    ui.end.classList.add('is-hidden');
    ui.count.classList.add('is-hidden');
    fillHud();
    showIntro();
    setPhase('intro');
    requestAnimationFrame(() => { resize(); render(0); });
  }

  function showIntro() {
    const b = battle!, me = b.bots[0], them = b.bots[1];
    ui.intro.classList.remove('is-hidden'); // visible first, so the canvases have a size to draw at
    ui.introKicker.textContent = fightNo === 1 ? 'Fight 1 · Your first challenger' : `Fight ${fightNo} · Win streak ${streak}`;
    for (const side of [0, 1] as const) {
      const c = root.querySelector<HTMLCanvasElement>(`[data-intro-bot="${side}"]`)!;
      const s = sizeCanvas(c), cx = c.getContext('2d')!;
      cx.clearRect(0, 0, s, s);
      drawBot(cx, { x: 11, y: 11, heading: side === 0 ? -0.35 : Math.PI + 0.35, build: b.bots[side].build, side, swing: 9, odo: 0.3 }, s / 22, 0.2);
      root.querySelector<HTMLElement>(`[data-intro-name="${side}"]`)!.textContent = b.bots[side].name;
    }
    ui.introParts.innerHTML = KINDS.map((k) => `<li><span>${esc(partName(k, me.build[k]))}</span><span class="k">${PART_LABEL[k]}</span><span>${esc(partName(k, them.build[k]))}</span></li>`).join('');
    const mapS = sizeCanvas(ui.introMap);
    const mc = ui.introMap.getContext('2d')!;
    drawArena(mc, b.layout, mapS, false);
    mc.font = `${Math.round(mapS / 6)}px system-ui, sans-serif`; mc.textAlign = 'center'; mc.textBaseline = 'middle';
    b.layout.forEach((z, i) => mc.fillText(ZONE_EMOJI[z], ((i % 2) + 0.5) * mapS / 2, ((i >= 2 ? 1 : 0) + 0.5) * mapS / 2));
    const mine = matchup(me.build.weapon, them.build.body), theirs = matchup(them.build.weapon, me.build.body);
    // good = green, bad = red, from your point of view
    const mText = (m: string, mineSide: boolean, w: string, body: string) => {
      const cls = m === 'even' ? '' : (m === 'strong') === mineSide ? 'good' : 'bad';
      return m === 'even' ? `${w} vs ${body}: even` : `<span class="${cls}">${w} is <b>${m}</b> vs ${body}</span>`;
    };
    const notes = [
      mText(mine, true, `Your ${esc(WEAPONS[me.build.weapon].name.toLowerCase())}`, `their ${esc(BODIES[them.build.body].name.toLowerCase())}`),
      mText(theirs, false, `Their ${esc(WEAPONS[them.build.weapon].name.toLowerCase())}`, `your ${esc(BODIES[me.build.body].name.toLowerCase())}`),
      `You’re fast on ${ZONE_EMOJI[fastZone(me.build)]} (${zoneWhere(b.layout, fastZone(me.build))}), slow on ${ZONE_EMOJI[slowZone(me.build)]}`,
      `They’re fast on ${ZONE_EMOJI[fastZone(them.build)]} (${zoneWhere(b.layout, fastZone(them.build))}), slow on ${ZONE_EMOJI[slowZone(them.build)]}`,
    ];
    ui.introNotes.innerHTML = notes.map((n) => `<li>${n}</li>`).join('');
    setTimeout(() => ui.go.focus({ preventScroll: true }), 50);
  }
  ui.go.addEventListener('click', () => {
    if (phase !== 'intro') return;
    ui.intro.classList.add('is-hidden');
    ui.count.classList.remove('is-hidden');
    setPhase('countdown');
    comm.say(`${lineName(0)} versus ${lineName(1)}. Robots… activate!`, 0, true);
  });

  // ---- speed ----
  function setSpeed(n: number) {
    speed = n;
    for (const b of ui.speeds) { const on = Number(b.dataset.speed) === n; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }
  }
  ui.speeds.forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));

  // ---- HUD ----
  function fillHud() {
    const b = battle!;
    b.bots.forEach((bot, i) => {
      const s = ui.sides[i];
      s.querySelector<HTMLElement>('[data-hud-name]')!.textContent = bot.name;
      const pc = Math.max(0, (bot.hp / bot.maxHp) * 100);
      const bar = s.querySelector<HTMLElement>('[data-hud-hp]')!;
      bar.style.width = `${pc}%`;
      bar.dataset.low = pc < 25 ? 'low' : pc < 55 ? 'mid' : '';
      s.querySelector('[role="progressbar"]')!.setAttribute('aria-valuenow', String(Math.round(pc)));
      s.querySelector<HTMLElement>('[data-hud-dealt]')!.textContent = String(Math.round(bot.dealt));
    });
    const left = Math.max(0, Math.ceil(TIME_LIMIT - b.t));
    ui.timer.textContent = String(left);
    if (left <= 10 && phase === 'fight') ui.timer.dataset.hurry = ''; else delete ui.timer.dataset.hurry;
  }

  // ---- commentary ----
  const lineName = (side: number) => nameTag(battle!.bots, side);
  function commentate(e: BattleEvent) {
    if (comm.everyday(e, battle!.bots, lineName)) return;
    const A = lineName(e.by), B = e.on !== undefined ? lineName(e.on) : '';
    switch (e.kind) {
      case 'ko': comm.say(`<b>KNOCKOUT!</b> ${B} is out of action! ${A} wins!`, e.t, true); break;
      case 'time': comm.say(`<b>Time!</b> It goes to the damage count… ${A} takes it!`, e.t, true); break;
      case 'judges': comm.say(`<b>Time!</b> Dead level! The judges give it to ${A} for aggression.`, e.t, true); break;
    }
  }

  // ---- drawing ----
  function resize() { sizeCanvas(ui.arena); }
  function render(t: number) {
    if (!battle) return;
    const s = ui.arena.width;
    if (!s) return;
    const k = s / ARENA;
    const key = `${battle.layout.join()}:${s}`;
    if (cacheKey !== key) {
      arenaCache = document.createElement('canvas');
      arenaCache.width = arenaCache.height = s;
      drawArena(arenaCache.getContext('2d')!, battle.layout, s, true);
      cacheKey = key;
    }
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * k, (Math.random() - 0.5) * fx.shake * k);
    ctx.drawImage(arenaCache!, 0, 0);
    // a KO'd robot lies there smoking; the winner gets drawn on top
    const order = battle.over && battle.winner === 0 ? [1, 0] : [0, 1];
    fx.drawTrails(ctx, battle.bots, order, k);
    for (const i of order) {
      const b = battle.bots[i];
      ctx.save();
      if (b.hp <= 0) { ctx.globalAlpha = 0.85; ctx.filter = 'grayscale(.8) brightness(.8)'; }
      drawBot(ctx, { ...b, odo: fx.odo[i] } as BotLook, k, b.hp <= 0 ? 0 : t);
      ctx.restore();
      teamRing(ctx, b, k);
    }
    fx.drawTop(ctx, k);
    ctx.restore();
  }

  // ---- the loop ----
  function stepOnce() {
    const b = battle!;
    const before = b.bots.flatMap((bot) => [bot.x, bot.y]);
    step(b);
    fx.track(b.bots, before);
    for (; evIndex < b.events.length; evIndex++) { const e = b.events[evIndex]; fx.event(e, b.bots, ARENA); commentate(e); }
  }
  let last = 0, wall = 0;
  function frame(ts: number) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts; wall += dt;
    if (phase === 'build') { if (!ui.builder.classList.contains('is-hidden')) shop.drawPreview(wall); }
    else if (battle) {
      phaseT += dt;
      if (phase === 'countdown') {
        const n = Math.floor(phaseT / 0.8);
        const text = n < 3 ? String(3 - n) : 'GO!';
        if (ui.count.dataset.text !== text) { ui.count.dataset.text = text; ui.count.innerHTML = `<span>${text}</span>`; }
        if (phaseT >= COUNT_TIME) { ui.count.classList.add('is-hidden'); setPhase('fight'); }
      } else if (phase === 'fight') {
        acc += dt * speed;
        while (acc >= DT && !battle.over) { stepOnce(); acc -= DT; }
        if (battle.over) setPhase('over');
      } else if (phase === 'over' && phaseT >= END_DELAY) finish();
      fx.update(dt * (phase === 'fight' ? speed : 1), battle.bots);
      fillHud();
      render(battle.t);
    }
    requestAnimationFrame(frame);
  }

  function finish() {
    const b = battle!;
    if (phase === 'result') return;
    setPhase('result');
    const won = b.winner === 0;
    let isNewBest = false;
    if (won) {
      streak++;
      if (streak > best()) { saveRecord(BEST_STREAK_KEY, streak); isNewBest = true; }
    }
    const medal = awardMedal(ROBOT_MEDALS, streak);
    ui.endCard.dataset.won = String(won);
    const me = b.bots[0], them = b.bots[1];
    ui.endTitle.textContent = won ? pickOne(['Victory! 🏆', 'You win! 🏆', 'Smashing! 🏆']) : pickOne(['Defeated! 💥', 'Out of action! 💥', 'Scrapped! 💥']);
    ui.endHow.textContent = b.reason === 'ko'
      ? (won ? `${them.name} knocked out in ${Math.ceil(b.t)} s` : `${me.name} knocked out in ${Math.ceil(b.t)} s`)
      : b.reason === 'points' ? `Time! ${won ? 'You' : 'They'} win on damage dealt` : `Dead level: the judges pick ${won ? 'you' : 'them'} for aggression`;
    ui.endScore.textContent = `Damage dealt: ${Math.round(me.dealt)} – ${Math.round(them.dealt)} · Hits: ${me.hits} – ${them.hits}`;
    ui.endStreak.innerHTML = won
      ? `Win streak: ${streak}${isNewBest ? '<span class="new">New best!</span>' : ''}`
      : streak ? `Run over after ${wins(streak)} in a row` : 'Run over: no wins this time';
    ui.endMedal.innerHTML = medalPopHtml(medal);
    ui.endButtons.innerHTML = won
      ? `<button type="button" class="btn" data-next>Next challenger ➜</button><button type="button" class="btn btn--ghost" data-new>Retire · new robot</button>`
      : `<button type="button" class="btn" data-again>Try again 🔁</button><button type="button" class="btn btn--ghost" data-new>New robot 🔧</button>`;
    ui.endButtons.querySelector<HTMLElement>('[data-next]')?.addEventListener('click', () => nextFight());
    ui.endButtons.querySelector<HTMLElement>('[data-again]')?.addEventListener('click', () => startRun());
    ui.endButtons.querySelector<HTMLElement>('[data-new]')!.addEventListener('click', () => toWorkshop());
    ui.end.classList.remove('is-hidden');
    showBest();
    fillHud();
    render(b.t);
  }
  function toWorkshop() {
    battle = null; opp = null;
    ui.battle.classList.add('is-hidden');
    ui.builder.classList.remove('is-hidden');
    setPhase('build');
    requestAnimationFrame(() => { resize(); shop.drawIcons(); shop.refresh(); });
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---- start up ----
  resize();
  shop.drawIcons();
  shop.refresh();
  showBest();
  new ResizeObserver(() => { resize(); if (phase === 'build') shop.drawIcons(); else if (battle) render(battle.t); }).observe(root);
  requestAnimationFrame(frame);

  // for the tests and for poking about in the console
  (window as any).__robotWars = {
    state: () => ({ phase, streak, fightNo, build: { ...shop.build }, name: shop.name, speed, best: best(), opponent: opp, t: battle?.t ?? 0, winner: battle?.winner ?? null, reason: battle?.reason ?? null, hp: battle?.bots.map((b) => b.hp), pos: battle?.bots.map((b) => [b.x, b.y]), man: battle?.bots.map((b) => b.manoeuvre), events: battle?.events.length ?? 0, log: ui.log.children.length }),
    pick: (kind: PartKind, id: string) => shop.pick(kind, id),
    setName: (n: string) => shop.setName(n),
    force: (f: typeof forced) => { forced = f; },
    fight: () => startRun(),
    go: () => ui.go.click(),
    /** run the current fight on to `t` seconds (or the end), as fast as possible */
    runTo: (t = Infinity) => { if (!battle) return; if (phase === 'intro') ui.go.click(); if (phase === 'countdown') { ui.count.classList.add('is-hidden'); setPhase('fight'); } while (!battle.over && battle.t < t) stepOnce(); if (battle.over && phase === 'fight') setPhase('over'); },
    finish: () => { if (!battle) return; (window as any).__robotWars.runTo(); finish(); },
    speed: setSpeed,
  };
}
