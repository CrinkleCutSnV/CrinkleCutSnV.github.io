// Robot Rumble: the workshop, the fight loop, the commentary and the result card.
import {
  ARENA, BODIES, BRAINS, DRIVES, DT, PART_IDS, PART_LABEL, PARTS, TIME_LIMIT, WEAPONS, ZONES,
  createBattle, matchup, randomBuild, randomLayout, randomName, rng, step,
  type Battle, type BattleEvent, type Build, type Layout, type PartKind, type ZoneId,
} from './sim';
import { INK, TEAM, ZONE_EMOJI, drawArena, drawBot, drawPartIcon, drawTrail, type BotLook, type Mark } from './draw';
import { BEST_STREAK_KEY, LAST_BUILD_KEY } from './keys';
import { readNumber, saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { ROBOT_MEDALS } from '../../data/medals';

type Phase = 'build' | 'intro' | 'countdown' | 'fight' | 'over' | 'result';
const KINDS = Object.keys(PART_IDS) as PartKind[];
const COUNT_TIME = 3.2; // s: 3, 2, 1, ACTIVATE!
const END_DELAY = 1.4; // s of KO dust before the result card
const pickOne = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const partName = (kind: PartKind, id: string) => (PARTS[kind] as Record<string, { name: string }>)[id].name;
const fastZone = (b: Build) => DRIVES[b.drive].fast;
const slowZone = (b: Build) => DRIVES[b.drive].slow;
const zoneWhere = (L: Layout, z: ZoneId) => ['top left', 'top right', 'bottom left', 'bottom right'][L.indexOf(z)];
const wins = (n: number) => `${n} win${n === 1 ? '' : 's'}`;

interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; colour: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; colour: string; big: boolean }

export function initRobotWars(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const $$ = <T extends HTMLElement = HTMLElement>(s: string) => [...root.querySelectorAll<T>(s)];
  const ui = {
    builder: $('[data-builder]'), battle: $('[data-battle]'),
    preview: $<HTMLCanvasElement>('[data-preview]'), name: $<HTMLInputElement>('[data-name]'), rename: $('[data-rename]'),
    summary: $('[data-summary]'), fight: $('[data-fight]'), random: $('[data-random]'), bestLine: $('[data-best-line]'),
    opts: $$<HTMLButtonElement>('[data-part]'),
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
  let build: Build = randomBuild(Math.random);
  let name = randomName(Math.random);
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_BUILD_KEY) ?? 'null');
    if (saved && KINDS.every((k) => (PART_IDS[k] as readonly string[]).includes(saved.build?.[k]))) { build = saved.build; if (typeof saved.name === 'string' && saved.name.trim()) name = saved.name.slice(0, 22); }
  } catch { /* fresh robot */ }
  let phase: Phase = 'build';
  let streak = 0, fightNo = 0;
  let battle: Battle | null = null;
  let opp: { name: string; build: Build } | null = null;
  let forced: { name?: string; build?: Build; layout?: Layout; seed?: number } | null = null;
  let speed = 1, acc = 0, phaseT = 0, evIndex = 0, shake = 0;
  let sparks: Spark[] = [], floaters: Floater[] = [];
  const odo = [0, 0];
  let trails: Mark[][] = [[], []], steps = 0;
  const footStep = [0, 0], TRAIL_LIFE = 2.6;
  let lastLine = -9, lastLow: Record<string, number> = {};
  let arenaCache: HTMLCanvasElement | null = null, cacheKey = '';
  let dpr = 1;

  const best = () => readNumber(BEST_STREAK_KEY) ?? 0;
  const showBest = () => { const b = best(); ui.bestLine.textContent = b ? `Best streak: ${wins(b)} in a row` : 'Best streak: no wins yet'; };
  const save = () => { try { localStorage.setItem(LAST_BUILD_KEY, JSON.stringify({ build, name })); } catch { /* ignore */ } };
  const setPhase = (p: Phase) => { phase = p; phaseT = 0; root.dataset.phase = p; };

  // ---- the workshop ----
  function sizeCanvas(c: HTMLCanvasElement) {
    const r = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c.width;
  }
  function drawIcons() {
    for (const b of ui.opts) {
      const c = b.querySelector<HTMLCanvasElement>('canvas')!;
      const s = sizeCanvas(c);
      drawPartIcon(c.getContext('2d')!, b.dataset.part as PartKind, b.dataset.id!, s, 0);
    }
  }
  function refreshBuilder() {
    for (const b of ui.opts) b.setAttribute('aria-checked', String(build[b.dataset.part as PartKind] === b.dataset.id));
    for (const k of KINDS) {
      const opt = ui.opts.find((b) => b.dataset.part === k && b.dataset.id === build[k])!;
      const h = root.querySelector<HTMLElement>(`[data-hint-for="${k}"]`)!;
      h.innerHTML = esc(opt.dataset.blurb ?? '') + (opt.dataset.hint ? `<b>${esc(opt.dataset.hint)}</b>` : '');
    }
    const D = DRIVES[build.drive], W = WEAPONS[build.weapon], B = BODIES[build.body];
    ui.summary.innerHTML = `<b>${esc(D.name)}</b> · <b>${esc(W.name)}</b> · <b>${esc(B.name)}</b> · <b>${esc(BRAINS[build.brain].name)}</b> computer<br>`
      + `${B.hp} HP · loves ${ZONE_EMOJI[D.fast]} ${ZONES[D.fast].name.toLowerCase()}, hates ${ZONE_EMOJI[D.slow]} ${ZONES[D.slow].name.toLowerCase()}`;
    if (document.activeElement !== ui.name) ui.name.value = name;
    save();
  }
  ui.opts.forEach((b) => b.addEventListener('click', () => { build = { ...build, [b.dataset.part!]: b.dataset.id } as Build; refreshBuilder(); }));
  ui.name.addEventListener('input', () => { name = ui.name.value.slice(0, 22); save(); });
  ui.name.addEventListener('blur', () => { if (!ui.name.value.trim()) { name = randomName(Math.random); refreshBuilder(); } });
  ui.rename.addEventListener('click', () => { name = randomName(Math.random); ui.name.value = name; save(); });
  ui.random.addEventListener('click', () => { build = randomBuild(Math.random); refreshBuilder(); });
  ui.fight.addEventListener('click', () => startRun());

  function drawPreview(t: number) {
    const s = sizeCanvas(ui.preview);
    const c = ui.preview.getContext('2d')!;
    c.save();
    const k = s / 26;
    // a steel workshop floor
    c.fillStyle = '#a9b4c2'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#7d8896'; c.lineWidth = Math.max(1, s / 260);
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo((i * s) / 4, 0); c.lineTo((i * s) / 4, s); c.moveTo(0, (i * s) / 4); c.lineTo(s, (i * s) / 4); c.stroke(); }
    const swing = (t % 2.4);
    const look: BotLook = { x: 13, y: 13.4, heading: -Math.PI / 2 + Math.sin(t * 0.7) * 0.5, build, side: 0, swing, odo: t * 4, speed: 5 };
    drawBot(c, look, k, t);
    c.restore();
  }

  // ---- a run ----
  function startRun() {
    if (!ui.name.value.trim()) { name = randomName(Math.random); ui.name.value = name; }
    save();
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
    battle = createBattle({ name, build }, opp, seed, layout);
    evIndex = 0; sparks = []; floaters = []; odo[0] = odo[1] = 0; trails = [[], []]; steps = 0; footStep[0] = footStep[1] = 0; shake = 0; acc = 0; lastLine = -9; lastLow = {};
    ui.log.innerHTML = '';
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
    say(`${lineName(0)} versus ${lineName(1)}. Robots… activate!`, 0, true);
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
  const lineName = (side: number) => `<span class="c${side}">${esc(battle!.bots[side].name)}</span>`;
  function say(html: string, t: number, important = false) {
    if (!important && t - lastLine < 1.1) return;
    lastLine = t;
    const li = document.createElement('li');
    li.innerHTML = `<span class="t">${Math.floor(t)}s</span>${html}`;
    ui.log.prepend(li);
    while (ui.log.children.length > 5) ui.log.lastElementChild!.remove();
  }
  const HIT_VERB: Record<string, string[]> = {
    flipper: ['flips', 'launches', 'tosses', 'catapults'],
    spinner: ['shreds', 'carves into', 'slices', 'chews up'],
    hammer: ['wallops', 'clobbers', 'bonks', 'flattens'],
    claw: ['grabs', 'squeezes', 'crushes', 'pinches'],
  };
  function commentate(e: BattleEvent) {
    const A = lineName(e.by), B = e.on !== undefined ? lineName(e.on) : '';
    switch (e.kind) {
      case 'hit': {
        const big = e.dir === 'rear' || e.match === 'strong' || (e.dmg ?? 0) >= 30;
        let s = `${A} ${pickOne(HIT_VERB[e.weapon!])} ${B} for <b>${Math.round(e.dmg!)}</b>`;
        if (e.dir === 'rear') s += pickOne([' — right up the back! Double damage!', ' from behind! Cheeky, and double damage.', ' — never saw it coming! ×2']);
        else if (e.dir === 'side') s += pickOne([' in the side. ×1.5', ' — a lovely side swipe. ×1.5']);
        else s += '.';
        if (e.match === 'strong') s += pickOne([' That’s its weak spot!', ' Ooh, that’ll leave a mark.', ' Textbook.']);
        else if (e.match === 'weak') s += pickOne([' …barely a scratch.', ' It just bounces off.', ' Not very effective.']);
        if (e.weapon === 'flipper' && e.match !== 'weak') s += ' Over it goes!';
        say(s, e.t, big);
        break;
      }
      case 'dodge': say(pickOne([`${B} skips clear!`, `${B} sidesteps ${A}!`, `Missed! ${B} is too nippy.`]), e.t); break;
      case 'miss': say(pickOne([`${A} swings at thin air.`, `${A} whiffs it!`, `Too early from ${A}.`]), e.t); break;
      case 'ram': say(pickOne([`${A} scoops up ${B} with the wedge!`, `${A} rams ${B} across the floor!`]), e.t); break;
      case 'opening': say(pickOne([`${A} spots an opening…`, `${A} pounces!`]), e.t); break;
      case 'zone': {
        const bot = battle!.bots[e.by];
        const key = `${e.by}:${e.zone}`;
        if ((lastLow[key] ?? -99) > e.t - 8) break;
        lastLow[key] = e.t;
        if (DRIVES[bot.build.drive].slow === e.zone) say(`${A} is ${({ sand: 'bogged down in the sand', ice: 'slipping all over the ice', steel: 'clattering about on the steel', rubble: 'stumbling through the rubble' } as Record<ZoneId, string>)[e.zone!]}.`, e.t);
        else if (DRIVES[bot.build.drive].fast === e.zone) say(`${A} is flying on the ${ZONES[e.zone!].name.toLowerCase()}!`, e.t);
        break;
      }
      case 'ko': say(`<b>KNOCKOUT!</b> ${B} is out of action! ${A} wins!`, e.t, true); break;
      case 'time': say(`<b>Time!</b> It goes to the damage count… ${A} takes it!`, e.t, true); break;
      case 'judges': say(`<b>Time!</b> Dead level! The judges give it to ${A} for aggression.`, e.t, true); break;
    }
  }

  // ---- effects ----
  function burst(x: number, y: number, n: number, colours: string[], power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (8 + Math.random() * 26) * power;
      const max = 0.25 + Math.random() * 0.35;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, colour: pickOne(colours), size: 0.35 + Math.random() * 0.5 });
    }
  }
  function effects(e: BattleEvent) {
    const x = e.x ?? ARENA / 2, y = e.y ?? ARENA / 2;
    if (e.kind === 'hit') {
      const d = e.dmg ?? 0;
      burst(x, y, Math.min(34, 8 + d * 0.8), ['#fff3a3', '#f2c94c', '#ff9f43', '#ffffff'], e.match === 'strong' ? 1.3 : 1);
      const tag = e.dir === 'rear' ? ' ×2' : e.dir === 'side' ? ' ×1.5' : '';
      floaters.push({ x, y: y - 3, text: `−${Math.round(d)}${tag}`, life: 1.1, colour: TEAM[e.by].main, big: d >= 25 || e.dir === 'rear' });
      shake = Math.max(shake, Math.min(1.6, d / 22));
    } else if (e.kind === 'ram') {
      burst(x, y, 8, ['#ffffff', '#d3dbe4'], 0.6);
      floaters.push({ x, y: y - 3, text: 'SHOVE!', life: 0.8, colour: TEAM[e.by].main, big: false });
    } else if (e.kind === 'dodge') {
      floaters.push({ x, y: y - 4, text: 'dodge!', life: 0.8, colour: '#ffffff', big: false });
    } else if (e.kind === 'miss') {
      floaters.push({ x, y: y - 4, text: 'whiff', life: 0.6, colour: 'rgba(255,255,255,.85)', big: false });
    } else if (e.kind === 'ko') {
      const v = battle!.bots[e.on!];
      burst(v.x, v.y, 60, ['#ff9f43', '#e5483b', '#f2c94c', '#5c5f6e', '#2b2d42'], 1.4);
      shake = 2.2;
    }
  }
  function updateEffects(dt: number) {
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.exp(-dt * 4); s.vy *= Math.exp(-dt * 4); s.life -= dt; }
    sparks = sparks.filter((s) => s.life > 0);
    for (const f of floaters) { f.y -= 7 * dt; f.life -= dt; }
    floaters = floaters.filter((f) => f.life > 0);
    shake = Math.max(0, shake - dt * 4);
    // smoke from badly hurt robots
    if (battle && Math.random() < dt * 14) for (const b of battle.bots) if (b.hp / b.maxHp < 0.3) sparks.push({ x: b.x + (Math.random() - 0.5) * 3, y: b.y, vx: (Math.random() - 0.5) * 3, vy: -6, life: 0.9, max: 0.9, colour: 'smoke', size: 1.2 });
  }

  // ---- drawing ----
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    sizeCanvas(ui.arena);
  }
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
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * k, (Math.random() - 0.5) * shake * k);
    ctx.drawImage(arenaCache!, 0, 0);
    // a KO'd robot lies there smoking; the winner gets drawn on top
    const order = battle.over && battle.winner === 0 ? [1, 0] : [0, 1];
    for (const i of order) drawTrail(ctx, battle.bots[i].build.drive, battle.bots[i].build.body, trails[i], k, TRAIL_LIFE);
    for (const i of order) {
      const b = battle.bots[i];
      ctx.save();
      if (b.hp <= 0) { ctx.globalAlpha = 0.85; ctx.filter = 'grayscale(.8) brightness(.8)'; }
      drawBot(ctx, { ...b, odo: odo[i] } as BotLook, k, b.hp <= 0 ? 0 : t);
      ctx.restore();
      // a little team ring, so you can tell yours at a glance
      ctx.strokeStyle = TEAM[i].main; ctx.lineWidth = Math.max(2, 0.45 * k); ctx.setLineDash([1.2 * k, 1 * k]);
      ctx.beginPath(); ctx.arc(b.x * k, b.y * k, (BODIES[b.build.body].radius + 1.8) * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    for (const sp of sparks) {
      const a = Math.max(0, sp.life / sp.max);
      if (sp.colour === 'smoke') { ctx.fillStyle = `rgba(80,80,90,${0.35 * a})`; ctx.beginPath(); ctx.arc(sp.x * k, sp.y * k, sp.size * k * (2 - a), 0, 7); ctx.fill(); continue; }
      ctx.globalAlpha = a; ctx.strokeStyle = sp.colour; ctx.lineWidth = sp.size * k * 0.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sp.x * k, sp.y * k); ctx.lineTo((sp.x - sp.vx * 0.03) * k, (sp.y - sp.vy * 0.03) * k); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of floaters) {
      const a = Math.min(1, f.life * 2.5);
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.max(f.big ? 18 : 13, (f.big ? 5 : 3.6) * k)}px system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, 0.9 * k); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, f.x * k, f.y * k); ctx.fillStyle = f.colour; ctx.fillText(f.text, f.x * k, f.y * k);
    }
    ctx.restore();
  }

  // ---- the loop ----
  function stepOnce() {
    const b = battle!;
    const before = [b.bots[0].x, b.bots[0].y, b.bots[1].x, b.bots[1].y];
    step(b);
    odo[0] += Math.hypot(b.bots[0].x - before[0], b.bots[0].y - before[1]);
    odo[1] += Math.hypot(b.bots[1].x - before[2], b.bots[1].y - before[3]);
    // ground marks: tread and tyre lines, footprints, air rings
    steps++;
    b.bots.forEach((bot, i) => {
      const tr = trails[i];
      for (const m of tr) m.age += DT;
      while (tr.length && tr[0].age > TRAIL_LIFE) tr.shift();
      if (bot.hp <= 0) return;
      if (bot.build.drive === 'legs') {
        const n = Math.floor((bot.gait / (BODIES[bot.build.body].radius * 0.9)) * 2.2 / Math.PI);
        if (n !== footStep[i]) { footStep[i] = n; tr.push({ x: bot.x, y: bot.y, h: bot.heading, age: 0, foot: n % 2 ? 1 : -1 }); }
      } else if (steps % 3 === 0 && (Math.hypot(bot.vx, bot.vy) > 0.5 || Math.abs(bot.omega) > 0.3)) tr.push({ x: bot.x, y: bot.y, h: bot.heading, age: 0 });
    });
    for (; evIndex < b.events.length; evIndex++) { const e = b.events[evIndex]; effects(e); commentate(e); }
  }
  let last = 0, wall = 0;
  function frame(ts: number) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts; wall += dt;
    if (phase === 'build') { if (!ui.builder.classList.contains('is-hidden')) drawPreview(wall); }
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
      updateEffects(dt * (phase === 'fight' ? speed : 1));
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
    requestAnimationFrame(() => { resize(); drawIcons(); refreshBuilder(); });
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---- start up ----
  resize();
  drawIcons();
  refreshBuilder();
  showBest();
  new ResizeObserver(() => { resize(); if (phase === 'build') drawIcons(); else if (battle) render(battle.t); }).observe(root);
  requestAnimationFrame(frame);

  // for the tests and for poking about in the console
  (window as any).__robotWars = {
    state: () => ({ phase, streak, fightNo, build: { ...build }, name, speed, best: best(), opponent: opp, t: battle?.t ?? 0, winner: battle?.winner ?? null, reason: battle?.reason ?? null, hp: battle?.bots.map((b) => b.hp), pos: battle?.bots.map((b) => [b.x, b.y]), man: battle?.bots.map((b) => b.manoeuvre), events: battle?.events.length ?? 0, log: ui.log.children.length }),
    pick: (kind: PartKind, id: string) => { build = { ...build, [kind]: id } as Build; refreshBuilder(); },
    setName: (n: string) => { name = n; ui.name.value = n; save(); },
    force: (f: typeof forced) => { forced = f; },
    fight: () => startRun(),
    go: () => ui.go.click(),
    /** run the current fight on to `t` seconds (or the end), as fast as possible */
    runTo: (t = Infinity) => { if (!battle) return; if (phase === 'intro') ui.go.click(); if (phase === 'countdown') { ui.count.classList.add('is-hidden'); setPhase('fight'); } while (!battle.over && battle.t < t) stepOnce(); if (battle.over && phase === 'fight') setPhase('over'); },
    finish: () => { if (!battle) return; (window as any).__robotWars.runTo(); finish(); },
    speed: setSpeed,
  };
}
