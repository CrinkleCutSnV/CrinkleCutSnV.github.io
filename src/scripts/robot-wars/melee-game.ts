// Robot Rumble Melee: the workshop (shared with Robot Rumble), the five-robot fight, the commentary and the standings.
import { BODIES, DRIVES, PARTS, WEAPONS, ZONES, matchup, rng, type BattleEvent, type Layout, type PartKind } from './sim';
import { MELEE_SIZE, challengers, createMelee, ordinal, stepMelee, alive, type Entrant, type Melee } from './melee';
import { TEAM, ZONE_EMOJI, drawArena, drawBot, type BotLook } from './draw';
import { MELEE_BEST_KEY } from './keys';
import { esc, initWorkshop, sizeCanvas } from './workshop';
import { Commentary, Fx, nameTag, pickOne, teamRing } from './fx';
import { readNumber, saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { MELEE_MEDALS } from '../../data/medals';

type Phase = 'build' | 'intro' | 'countdown' | 'fight' | 'over' | 'result';
const COUNT_TIME = 3.2;
const END_DELAY = 1.6;
const MEDAL_EMOJI = ['', '🥇', '🥈', '🥉', '', ''];
const partName = (kind: PartKind, id: string) => (PARTS[kind] as Record<string, { name: string }>)[id].name;
const zoneWhere = (L: Layout, z: string) => ['top left', 'top right', 'bottom left', 'bottom right'][L.indexOf(z as Layout[number])];

export function initRobotMelee(root: HTMLElement) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const ui = {
    builder: $('[data-builder]'), battle: $('[data-battle]'), bestLine: $('[data-best-line]'),
    bars: $('[data-mbars]'), timer: $('[data-timer]'), speeds: [...root.querySelectorAll<HTMLButtonElement>('[data-speed]')],
    arena: $<HTMLCanvasElement>('[data-arena]'), count: $('[data-count]'), log: $('[data-log]'),
    intro: $('[data-intro]'), lineup: $('[data-lineup]'), introNotes: $('[data-intro-notes]'), introMap: $<HTMLCanvasElement>('[data-intro-map]'), go: $('[data-go]'),
    end: $('[data-end]'), endCard: $('.end-card'), endTitle: $('[data-end-title]'), endHow: $('[data-end-how]'), standings: $('[data-standings]'),
    endBest: $('[data-end-best]'), endMedal: $('[data-end-medal]'), endButtons: $('[data-end-buttons]'),
  };
  const ctx = ui.arena.getContext('2d')!;
  const shop = initWorkshop(root, () => startMelee());
  let phase: Phase = 'build';
  let melee: Melee | null = null;
  let forced: { seed?: number; layout?: Layout; rivals?: Entrant[] } | null = null;
  let speed = 1, acc = 0, phaseT = 0, evIndex = 0, meleeNo = 0;
  const fx = new Fx();
  const comm = new Commentary(ui.log, 6);
  let arenaCache: HTMLCanvasElement | null = null, cacheKey = '';

  const best = () => readNumber(MELEE_BEST_KEY);
  const showBest = () => { const b = best(); ui.bestLine.textContent = b ? `Best finish: ${ordinal(b)} of 5${b === 1 ? ' 🥇' : ''}` : 'Best finish: not played yet'; };
  const setPhase = (p: Phase) => { phase = p; phaseT = 0; root.dataset.phase = p; };

  // ---- a melee ----
  function startMelee() {
    shop.ready();
    meleeNo++;
    const seed = forced?.seed ?? Math.floor(Math.random() * 2 ** 31);
    const r = rng(seed ^ 0x2c1b3c6d);
    const rivals = forced?.rivals ?? challengers(r, shop.name);
    melee = createMelee([{ name: shop.name, build: shop.build }, ...rivals], seed, forced?.layout);
    forced = null;
    evIndex = 0; acc = 0; fx.reset(melee.bots.length); comm.reset();
    ui.builder.classList.add('is-hidden');
    ui.battle.classList.remove('is-hidden');
    ui.end.classList.add('is-hidden');
    ui.count.classList.add('is-hidden');
    buildHud();
    showIntro();
    setPhase('intro');
    requestAnimationFrame(() => { sizeCanvas(ui.arena); render(0); });
  }

  function showIntro() {
    const m = melee!, me = m.bots[0];
    ui.intro.classList.remove('is-hidden');
    ui.lineup.innerHTML = m.bots.map((b) => {
      const mine = b.side === 0 ? '' : matchup(me.build.weapon, b.build.body), theirs = b.side === 0 ? '' : matchup(b.build.weapon, me.build.body);
      const note = b.side === 0 ? '<span class="you">That’s you!</span>'
        : [mine === 'strong' ? `<span class="good">your ${esc(WEAPONS[me.build.weapon].name.toLowerCase())} is strong vs it</span>` : mine === 'weak' ? `<span class="bad">your ${esc(WEAPONS[me.build.weapon].name.toLowerCase())} is weak vs it</span>` : '',
          theirs === 'strong' ? '<span class="bad">dangerous to you</span>' : theirs === 'weak' ? '<span class="good">can’t hurt you much</span>' : ''].filter(Boolean).join(' · ') || 'an even match';
      return `<li class="lu" style="--c:${TEAM[b.side].main}"><canvas data-lu="${b.side}" aria-hidden="true"></canvas><span class="lu-text"><strong>${esc(b.name)}</strong><small>${esc(partName('drive', b.build.drive))} · ${esc(partName('weapon', b.build.weapon))} · ${esc(partName('body', b.build.body))} · ${esc(partName('brain', b.build.brain))}</small><small class="lu-note">${note}</small></span></li>`;
    }).join('');
    for (const b of m.bots) {
      const c = root.querySelector<HTMLCanvasElement>(`[data-lu="${b.side}"]`)!;
      const s = sizeCanvas(c), cx = c.getContext('2d')!;
      cx.clearRect(0, 0, s, s);
      drawBot(cx, { x: 11, y: 11, heading: -Math.PI / 2 - 0.35, build: b.build, side: b.side, swing: 9, odo: 0.3 }, s / 22, 0.2);
    }
    const mapS = sizeCanvas(ui.introMap), mc = ui.introMap.getContext('2d')!;
    drawArena(mc, m.layout, mapS, false);
    mc.font = `${Math.round(mapS / 6)}px system-ui, sans-serif`; mc.textAlign = 'center'; mc.textBaseline = 'middle';
    m.layout.forEach((z, i) => mc.fillText(ZONE_EMOJI[z], ((i % 2) + 0.5) * mapS / 2, ((i >= 2 ? 1 : 0) + 0.5) * mapS / 2));
    const D = DRIVES[me.build.drive];
    ui.introNotes.innerHTML = [
      `You’re fast on ${ZONE_EMOJI[D.fast]} ${ZONES[D.fast].name.toLowerCase()} (${zoneWhere(m.layout, D.fast)}), slow on ${ZONE_EMOJI[D.slow]}`,
      'Last robot standing wins. Out first finishes 5th.',
    ].map((n) => `<li>${n}</li>`).join('');
    setTimeout(() => ui.go.focus({ preventScroll: true }), 50);
  }
  ui.go.addEventListener('click', () => {
    if (phase !== 'intro') return;
    ui.intro.classList.add('is-hidden');
    ui.count.classList.remove('is-hidden');
    setPhase('countdown');
    comm.say(`Five robots, one arena. ${lineName(0)} and four challengers… activate!`, 0, true);
  });

  function setSpeed(n: number) {
    speed = n;
    for (const b of ui.speeds) { const on = Number(b.dataset.speed) === n; b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', String(on)); }
  }
  ui.speeds.forEach((b) => b.addEventListener('click', () => setSpeed(Number(b.dataset.speed))));

  // ---- HUD: five compact health bars ----
  function buildHud() {
    ui.bars.innerHTML = melee!.bots.map((b) => `<li class="mb${b.side === 0 ? ' mb--you' : ''}" style="--c:${TEAM[b.side].main}" data-mb="${b.side}">`
      + `<span class="mb-top"><span class="mb-dot" aria-hidden="true"></span><strong class="mb-name">${esc(b.name)}</strong><span class="mb-ko" data-mb-ko></span></span>`
      + `<span class="bar" role="progressbar" aria-label="${esc(b.name)}’s health" aria-valuemin="0" aria-valuemax="100"><span data-mb-hp></span></span>`
      + `<span class="mb-out" data-mb-out></span></li>`).join('');
    fillHud();
  }
  function fillHud() {
    const m = melee!;
    for (const b of m.bots) {
      const li = ui.bars.querySelector<HTMLElement>(`[data-mb="${b.side}"]`)!;
      const pc = Math.max(0, (b.hp / b.maxHp) * 100);
      const bar = li.querySelector<HTMLElement>('[data-mb-hp]')!;
      bar.style.width = `${pc}%`;
      bar.dataset.low = pc < 25 ? 'low' : pc < 55 ? 'mid' : '';
      li.querySelector('[role="progressbar"]')!.setAttribute('aria-valuenow', String(Math.round(pc)));
      const k = m.kos[b.side];
      li.querySelector<HTMLElement>('[data-mb-ko]')!.textContent = k ? `${'💀'.repeat(Math.min(k, 4))}` : '';
      const place = m.place[b.side];
      li.classList.toggle('is-out', place > 0 && (!m.over || b.hp <= 0));
      li.querySelector<HTMLElement>('[data-mb-out]')!.textContent = place ? `${ordinal(place)}${MEDAL_EMOJI[place] ? ' ' + MEDAL_EMOJI[place] : ''}` : '';
    }
    const left = Math.max(0, Math.ceil(m.limit - m.t));
    ui.timer.textContent = String(left);
    if (left <= 10 && phase === 'fight') ui.timer.dataset.hurry = ''; else delete ui.timer.dataset.hurry;
  }

  // ---- commentary ----
  const lineName = (side: number) => (side >= 0 ? nameTag(melee!.bots, side) : 'Someone');
  function commentate(e: BattleEvent) {
    const m = melee!;
    if (comm.everyday(e, m.bots, lineName)) return;
    const A = lineName(e.by), B = e.on !== undefined ? lineName(e.on) : '';
    const left = e.left ?? 0;
    switch (e.kind) {
      case 'ko': {
        const tail = left > 1 ? ` <b>${left} left!</b>` : '';
        const you = e.on === 0 ? ` You finish ${ordinal(m.place[0])}.` : '';
        const line = e.by >= 0
          ? pickOne([`<b>${B} is out!</b> ${A} finishes it off.`, `<b>KO!</b> ${A} puts ${B} out of action.`, `<b>${B} is scrap!</b> Credit to ${A}.`])
          : `<b>${B} is out!</b>`;
        comm.say(line + tail + you, e.t, true);
        break;
      }
      case 'time': comm.say(`<b>Time!</b> ${left} still standing: it goes to health left…`, e.t, true); break;
      case 'winner':
        comm.say(m.reason === 'ko' ? `<b>${A} is the last robot standing!</b> 🏆` : `<b>${A} wins on health left!</b> 🏆`, e.t, true);
        break;
    }
  }

  // ---- drawing ----
  function render(t: number) {
    const m = melee;
    if (!m) return;
    const s = ui.arena.width;
    if (!s) return;
    const k = s / m.size;
    const key = `${m.layout.join()}:${s}`;
    if (cacheKey !== key) {
      arenaCache = document.createElement('canvas');
      arenaCache.width = arenaCache.height = s;
      drawArena(arenaCache.getContext('2d')!, m.layout, s, true, m.size);
      cacheKey = key;
    }
    ctx.save();
    ctx.clearRect(0, 0, s, s);
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake * k, (Math.random() - 0.5) * fx.shake * k);
    ctx.drawImage(arenaCache!, 0, 0);
    // wrecks underneath, then the ones still fighting; you on top
    const out = m.bots.filter((b) => m.place[b.side] > 0 && b.hp <= 0).map((b) => b.side);
    const live = m.bots.filter((b) => !out.includes(b.side)).map((b) => b.side).sort((a, b) => (a === 0 ? 1 : 0) - (b === 0 ? 1 : 0));
    fx.drawTrails(ctx, m.bots, [...out, ...live], k);
    for (const i of out) {
      const b = m.bots[i], w = m.wreck[i];
      const dragging = Math.hypot(w.x - b.x, w.y - b.y) > 0.3;
      if (dragging) {
        // the arena's tow hook hauls it off to the wall
        const ex = w.x + Math.sign(w.x - b.x || 0) * 3, ey = w.y + Math.sign(w.y - b.y || 0) * 3;
        ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = Math.max(2, 0.5 * k); ctx.setLineDash([0.9 * k, 0.6 * k]);
        ctx.beginPath(); ctx.moveTo(ex * k, ey * k); ctx.lineTo(b.x * k, b.y * k); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.save();
      ctx.globalAlpha = 0.85; ctx.filter = 'grayscale(.85) brightness(.75)';
      drawBot(ctx, { ...b, odo: fx.odo[i] } as BotLook, k, 0);
      ctx.restore();
    }
    for (const i of live) {
      const b = m.bots[i];
      drawBot(ctx, { ...b, odo: fx.odo[i] } as BotLook, k, t);
      teamRing(ctx, b, k);
    }
    // a little tag over yours
    const you = m.bots[0];
    if (m.place[0] === 0 || you.hp > 0) {
      const y = (you.y - BODIES[you.build.body].radius - 3.6) * k;
      ctx.font = `900 ${Math.max(10, 2.6 * k)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(3, 0.7 * k); ctx.strokeStyle = '#2b2d42'; ctx.lineJoin = 'round';
      ctx.strokeText('YOU', you.x * k, y); ctx.fillStyle = TEAM[0].light; ctx.fillText('YOU', you.x * k, y);
    }
    fx.drawTop(ctx, k);
    ctx.restore();
  }

  // ---- the loop ----
  function stepOnce() {
    const m = melee!;
    const before = m.bots.flatMap((b) => [b.x, b.y]);
    stepMelee(m);
    fx.track(m.bots, before);
    for (; evIndex < m.events.length; evIndex++) { const e = m.events[evIndex]; fx.event(e, m.bots, m.size); commentate(e); }
  }
  let last = 0, wall = 0;
  function frame(ts: number) {
    const dt = last ? Math.min(0.1, (ts - last) / 1000) : 0;
    last = ts; wall += dt;
    if (phase === 'build') { if (!ui.builder.classList.contains('is-hidden')) shop.drawPreview(wall); }
    else if (melee) {
      phaseT += dt;
      if (phase === 'countdown') {
        const n = Math.floor(phaseT / 0.8);
        const text = n < 3 ? String(3 - n) : 'GO!';
        if (ui.count.dataset.text !== text) { ui.count.dataset.text = text; ui.count.innerHTML = `<span>${text}</span>`; }
        if (phaseT >= COUNT_TIME) { ui.count.classList.add('is-hidden'); setPhase('fight'); }
      } else if (phase === 'fight') {
        acc += dt * speed;
        while (acc >= 1 / 60 && !melee.over) { stepOnce(); acc -= 1 / 60; }
        if (melee.over) setPhase('over');
      } else if (phase === 'over' && phaseT >= END_DELAY) finish();
      fx.update(dt * (phase === 'fight' ? speed : 1), melee.bots);
      fillHud();
      render(melee.t);
    }
    requestAnimationFrame(frame);
  }

  function finish() {
    const m = melee!;
    if (phase === 'result') return;
    setPhase('result');
    const place = m.place[0];
    const prev = best();
    const isNewBest = prev === null || place < prev;
    if (isNewBest) saveRecord(MELEE_BEST_KEY, place);
    const medal = awardMedal(MELEE_MEDALS, place);
    const me = m.bots[0];
    ui.endCard.dataset.place = String(place);
    ui.endCard.dataset.won = String(place === 1);
    ui.endTitle.textContent = place === 1 ? pickOne(['You win the melee! 🥇', 'Last robot standing! 🥇', 'Champion! 🥇'])
      : place === 2 ? 'So close: 2nd place! 🥈' : place === 3 ? 'On the podium: 3rd! 🥉' : place === 4 ? '4th place 💥' : pickOne(['Out first! 💥', 'Scrapped first! 💥']);
    const winner = m.bots[m.winner ?? 0];
    ui.endHow.textContent = place === 1
      ? (m.reason === 'ko' ? `${me.name} outlasted all four in ${Math.ceil(m.t)} s` : `Time! ${me.name} had the most health left`)
      : me.hp <= 0 ? `${me.name} was knocked out after ${Math.ceil(m.outAt[0])} s · ${winner.name} won it`
        : `Time! ${winner.name} had more health left`;
    ui.standings.innerHTML = '<thead><tr><th scope="col">Place</th><th scope="col">Robot</th><th scope="col" title="Knockouts scored">KOs</th><th scope="col" title="Damage dealt">Damage</th></tr></thead><tbody>'
      + m.standings!.map((st) => `<tr class="${st.side === 0 ? 'is-you' : ''}" style="--c:${TEAM[st.side].main}"><td>${ordinal(st.place)}${MEDAL_EMOJI[st.place] ? ' ' + MEDAL_EMOJI[st.place] : ''}</td>`
        + `<td class="st-name"><span class="mb-dot" aria-hidden="true"></span>${esc(m.bots[st.side].name)}${st.side === 0 ? ' <small>(you)</small>' : ''}</td><td>${st.kos}</td><td>${Math.round(st.dealt)}</td></tr>`).join('')
      + '</tbody>';
    ui.endBest.innerHTML = isNewBest && prev !== null ? `New best finish: ${ordinal(place)}!` : `Best finish: ${ordinal(Math.min(place, prev ?? place))}`;
    ui.endMedal.innerHTML = medalPopHtml(medal);
    ui.endButtons.innerHTML = `<button type="button" class="btn" data-again>Fight again 🔁</button><button type="button" class="btn btn--ghost" data-new>New robot 🔧</button>`;
    ui.endButtons.querySelector<HTMLElement>('[data-again]')!.addEventListener('click', () => startMelee());
    ui.endButtons.querySelector<HTMLElement>('[data-new]')!.addEventListener('click', () => toWorkshop());
    ui.end.classList.remove('is-hidden');
    showBest();
    fillHud();
    render(m.t);
  }
  function toWorkshop() {
    melee = null;
    ui.battle.classList.add('is-hidden');
    ui.builder.classList.remove('is-hidden');
    setPhase('build');
    requestAnimationFrame(() => { shop.drawIcons(); shop.refresh(); });
    root.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // ---- start up ----
  shop.drawIcons();
  shop.refresh();
  showBest();
  new ResizeObserver(() => { sizeCanvas(ui.arena); if (phase === 'build') shop.drawIcons(); else if (melee) render(melee.t); }).observe(root);
  requestAnimationFrame(frame);

  // for the tests and for poking about in the console
  (window as any).__robotMelee = {
    state: () => ({
      phase, meleeNo, build: { ...shop.build }, name: shop.name, speed, best: best(), t: melee?.t ?? 0, over: melee?.over ?? false, reason: melee?.reason ?? null,
      winner: melee?.winner ?? null, place: melee ? [...melee.place] : null, left: melee ? alive(melee).length : 0, kos: melee ? [...melee.kos] : null,
      hp: melee?.bots.map((b) => b.hp), pos: melee?.bots.map((b) => [b.x, b.y]), target: melee ? [...melee.target] : null, names: melee?.bots.map((b) => b.name),
      builds: melee?.bots.map((b) => ({ ...b.build })), events: melee?.events.length ?? 0, kos_events: melee?.events.filter((e) => e.kind === 'ko').map((e) => ({ by: e.by, on: e.on, left: e.left, t: e.t })) ?? [], log: ui.log.children.length,
    }),
    pick: (kind: PartKind, id: string) => shop.pick(kind, id),
    setName: (n: string) => shop.setName(n),
    force: (f: typeof forced) => { forced = f; },
    fight: () => startMelee(),
    go: () => ui.go.click(),
    runTo: (t = Infinity) => { if (!melee) return; if (phase === 'intro') ui.go.click(); if (phase === 'countdown') { ui.count.classList.add('is-hidden'); setPhase('fight'); } while (!melee.over && melee.t < t) stepOnce(); if (melee.over && phase === 'fight') setPhase('over'); },
    finish: () => { if (!melee) return; (window as any).__robotMelee.runTo(); finish(); },
    speed: setSpeed,
  };
}
