import { CHARACTERS, characterById } from '../split-the-g/physics';
import {
  BEST_KEY, FIXED_DT, ROUNDS, bestKeyFor, biscuitFor, pickLine, pointsFor, pourDunk, quipsFor, resultTone, setHolding, step, warningOf,
  type Dunk,
} from './physics';
import { drawBiscuitIcon, drawPortrait, drawScene, layout } from './scene';
import { readNumber, saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { TEA_MEDALS, TIER_NAME } from '../../data/medals';
import type { Character } from '../split-the-g/physics';

type GamePhase = 'intro' | 'ready' | 'playing' | 'dunk-result' | 'gameover';

const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]!;
const dots = (n: number) => '●'.repeat(n) + '○'.repeat(5 - n);
const fmtPts = (v: number) => `${v} ${v === 1 ? 'pt' : 'pts'}`;
const stoutness = (n: number) => `${dots(n)} ${n} of 5`;

export interface RoundResult {
  charId: string;
  biscuitName: string;
  score: number;
  broken: boolean;
}

export function initTeaDunk(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const ui = {
    who: $('[data-who]'), whoName: $('[data-who-name]'), whoBiscuit: $('[data-who-biscuit]'),
    best: $('[data-best]'), round: $('[data-round]'), live: $('[data-live]'),
    bubble: $('[data-bubble]'), hint: $('[data-hint]'), hintMain: $('[data-hint-main]'), hintSub: $('[data-hint-sub]'),
    intro: $('[data-intro]'), introFace: $<HTMLCanvasElement>('[data-intro-face]'), introBiscuit: $<HTMLCanvasElement>('[data-intro-biscuit]'),
    introName: $('[data-intro-name]'), introTag: $('[data-intro-tag]'), introQuirk: $('[data-intro-quirk]'),
    introGo: $<HTMLButtonElement>('[data-intro-go]'), introStatus: $('[data-intro-status]'),
    lineup: root.parentElement!.querySelector<HTMLElement>('[data-lineup]'),
    end: $('[data-end]'), endCard: $('.end-card'), rating: $('[data-end-rating]'), score: $('[data-end-score]'),
    where: $('[data-end-where]'), remark: $('[data-end-remark]'), medal: $('[data-end-medal]'),
    endBest: $('[data-end-best]'), breakdown: $('[data-end-breakdown]'),
    again: $<HTMLButtonElement>('[data-again]'),
  };

  let w = 0, h = 0, dpr = 1;
  let phase: GamePhase = 'intro';
  let introOpen = false;
  let char: Character = CHARACTERS[0];
  let dunk: Dunk | null = null;
  let lastId: string | null = null;
  let usedIds: string[] = [];
  let history: RoundResult[] = [];
  let total = 0;
  let round = 0;
  let clock = 0;
  let pointerId = -1;
  let acc = 0;
  let seedOverride: number | null = null;
  let charOverride: string | null = null;
  let holding = false;
  let spaceHeld = false;

  // ---- meet the dunkers (view only) ----
  if (ui.lineup) {
    CHARACTERS.forEach((c) => {
      const b = biscuitFor(c);
      const li = document.createElement('li');
      li.dataset.char = c.id;
      li.innerHTML = `<canvas class="face" width="72" height="72" aria-hidden="true"></canvas>`
        + `<canvas class="biccie" width="48" height="48" aria-hidden="true"></canvas>`
        + `<strong>${c.name}</strong><span class="tag">${c.tagline}</span>`
        + `<span class="quirk"><b>Signature:</b> ${b.name}. ${b.feel} <span class="diffdots" title="Stoutness ${b.stoutness} of 5">${dots(b.stoutness)}</span></span>`;
      ui.lineup!.append(li);
      drawPortrait(li.querySelector<HTMLCanvasElement>('canvas.face')!, c);
      drawBiscuitIcon(li.querySelector<HTMLCanvasElement>('canvas.biccie')!, b);
    });
  }
  ui.again.addEventListener('click', () => {
    if (phase === 'dunk-result') nextRound();
    else newGame();
  });
  ui.introGo.addEventListener('click', () => dismissIntro());
  for (const ev of ['pointerdown', 'pointerup', 'touchstart'] as const) ui.intro.addEventListener(ev, (e) => e.stopPropagation());
  ui.end.addEventListener('pointerdown', (e) => e.stopPropagation());

  function dismissIntro() {
    if (!introOpen) return;
    introOpen = false;
    root.dataset.upnext = 'closed';
    ui.intro.classList.add('is-hidden');
    if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    becomeReady();
  }
  function becomeReady() {
    setPhase('ready');
    if (dunk) {
      say(pickLine(quipsFor(char.id).before, dunk.seed + 3));
    }
    const touch = matchMedia('(hover: none)').matches;
    showHint(touch ? 'Press and hold to dunk' : 'Press and hold to dunk (or hold Space)', 'Let go to lift the biscuit out. Don’t leave it too long!');
  }
  function nudgeIntro() {
    ui.introGo.classList.remove('is-nudged'); void ui.introGo.offsetWidth; ui.introGo.classList.add('is-nudged');
  }

  function randomChar() {
    const pool = CHARACTERS.filter((c) => !usedIds.includes(c.id) && (c.id !== lastId || CHARACTERS.length === 1));
    const fallback = CHARACTERS.filter((c) => !usedIds.includes(c.id));
    return pickOne(pool.length ? pool : (fallback.length ? fallback : CHARACTERS));
  }
  function setPhase(p: GamePhase) { phase = p; root.dataset.phase = p; }

  function newGame() {
    usedIds = [];
    history = [];
    total = 0;
    round = 0;
    lastId = lastId; // still avoid opening with the last dunker of the previous game
    startRound(charOverride ? characterById(charOverride) : randomChar());
    charOverride = null;
  }

  function startRound(c: Character) {
    char = c;
    lastId = c.id;
    usedIds.push(c.id);
    const seed = seedOverride ?? Math.floor(Math.random() * 2 ** 31);
    seedOverride = null;
    dunk = pourDunk(c, seed);
    holding = false;
    acc = 0;
    setPhase('intro');
    ui.end.classList.add('is-hidden');
    const b = biscuitFor(c);
    ui.whoName.textContent = c.name;
    ui.whoBiscuit.textContent = b.name;
    round = history.length;
    ui.round.textContent = `Biscuit ${history.length + 1} of ${ROUNDS}`;
    ui.live.textContent = 'Score: 0'; ui.live.dataset.warn = '';
    ui.introName.textContent = c.name;
    ui.introTag.textContent = c.tagline;
    ui.introQuirk.innerHTML = `<b>Signature biscuit:</b> ${b.name}. ${b.feel} <span class="diffdots" title="Stoutness ${b.stoutness} of 5">${stoutness(b.stoutness)}</span>`;
    ui.introStatus.textContent = `${b.tagline}`;
    drawPortrait(ui.introFace, c);
    drawBiscuitIcon(ui.introBiscuit, b);
    introOpen = true;
    root.dataset.upnext = 'open';
    ui.intro.classList.remove('is-hidden');
    ui.bubble.classList.add('is-hidden');
    ui.hint.classList.add('is-hidden');
    ui.introGo.focus({ preventScroll: true });
    updateBest();
  }

  function nextRound() {
    if (history.length >= ROUNDS) showGameOver();
    else startRound(charOverride ? characterById(charOverride) : randomChar());
    charOverride = null;
  }

  function finishDunk() {
    if (!dunk || dunk.phase !== 'result' || phase === 'dunk-result' || phase === 'gameover') return;
    const res: RoundResult = {
      charId: char.id,
      biscuitName: dunk.biscuit.name,
      score: dunk.broken ? 0 : dunk.score,
      broken: dunk.broken,
    };
    history.push(res);
    total += res.score;
    if (!res.broken && res.score > 0) {
      const key = bestKeyFor(char.id);
      const prev = readNumber(key);
      if (prev === null || res.score > prev) saveRecord(key, res.score);
    }
    setPhase('dunk-result');
    showDunkCard(res);
  }

  function showDunkCard(res: RoundResult) {
    const tone = dunk ? resultTone(dunk) : (res.broken ? 'break' : 'good');
    const lines = quipsFor(char.id)[tone];
    ui.end.classList.remove('is-hidden');
    ui.endCard.dataset.band = res.broken ? 'miss' : tone === 'great' ? 'great' : tone === 'timid' ? 'timid' : 'good';
    ui.rating.textContent = res.broken ? 'In it goes!' : tone === 'great' ? 'What a nerve!' : tone === 'timid' ? 'A cautious dip' : 'Nice dunk!';
    ui.score.textContent = res.broken ? '0 pts' : fmtPts(res.score);
    ui.where.textContent = res.broken
      ? `${dunk?.biscuit.name ?? 'The biscuit'} snapped off into the tea.`
      : `${dunk?.biscuit.name ?? 'Biscuit'} · ${((dunk?.peakDepth ?? 0) * 100).toFixed(0)}% in · ${dunk?.timeWet.toFixed(1)}s`;
    ui.remark.textContent = pickOne(lines);
    ui.medal.innerHTML = '';
    ui.breakdown.innerHTML = '';
    ui.endBest.textContent = `Running total: ${fmtPts(total)}  ·  Biscuit ${history.length} of ${ROUNDS}`;
    ui.endBest.classList.remove('is-new');
    ui.again.textContent = history.length >= ROUNDS ? 'See results 🏆' : 'Next biscuit 🍪';
    say(ui.remark.textContent);
    updateLive();
  }

  function showGameOver() {
    setPhase('gameover');
    const prevBest = readNumber(BEST_KEY);
    const isBest = total > 0 && (prevBest === null || total > prevBest);
    if (isBest) saveRecord(BEST_KEY, total);
    // a broken dunk is never a best, and a three-miss game (total 0) is not saved either
    const award = awardMedal(TEA_MEDALS, total);
    ui.end.classList.remove('is-hidden');
    ui.endCard.dataset.band = award.tier === 'gold' ? 'great' : total === 0 ? 'miss' : 'good';
    ui.rating.textContent = total === 0 ? 'All in the tea!' : award.tier ? `${TIER_NAME[award.tier]} dunking!` : 'Tea’s up!';
    ui.score.textContent = fmtPts(total);
    ui.where.textContent = `${ROUNDS} biscuits, ${history.filter((r) => !r.broken).length} saved, ${history.filter((r) => r.broken).length} in the mug`;
    const lines = total === 0
      ? ['A full set of plops. The tea’s had a better afternoon than you have.', 'Three dunks, three swimmers. Worthy of a sit-down.']
      : award.tier === 'gold'
        ? ['A textbook tea-time. Someone put the kettle on again.', 'Gold. The regulars are raising their mugs.']
        : award.tier === 'silver'
          ? ['Silver service. One more brave dunk and you’re in the gold.', 'A very respectable spread.']
          : award.tier === 'bronze'
            ? ['Bronze! On the podium, and the tea’s still drinkable.', 'A solid session. The biscuits would be proud. Well, most of them.']
            : ['A bit of a soggy showing. Have another go — the tin’s still full.'];
    ui.remark.textContent = pickOne(lines);
    ui.medal.innerHTML = medalPopHtml(award);
    ui.breakdown.innerHTML = `<ul>${history.map((r) => {
      const c = characterById(r.charId);
      return `<li${r.broken ? ' class="is-miss"' : ''}><span class="who"><strong>${c.name}</strong><small>${r.biscuitName}</small></span><b>${r.broken ? 'Miss' : fmtPts(r.score)}</b></li>`;
    }).join('')}</ul>`;
    ui.endBest.textContent = isBest ? 'New best score!' : (prevBest === null ? '' : `Best: ${fmtPts(prevBest)}`);
    ui.endBest.classList.toggle('is-new', isBest);
    ui.again.textContent = 'Another cup? 🍵';
    updateBest();
  }

  function say(text: string) {
    ui.bubble.textContent = text;
    ui.bubble.classList.remove('is-hidden');
    ui.bubble.style.animation = 'none'; void ui.bubble.offsetWidth; ui.bubble.style.animation = '';
  }
  function showHint(main: string, sub: string) {
    ui.hintMain.textContent = main; ui.hintSub.textContent = sub;
    ui.hint.classList.remove('is-hidden');
  }
  function updateBest() {
    const b = readNumber(BEST_KEY);
    ui.best.textContent = b === null ? 'Best: –' : `Best: ${fmtPts(b)}`;
  }
  function updateLive() {
    if (!dunk) { ui.live.textContent = 'Score: 0'; return; }
    if (dunk.broken || dunk.phase === 'result' || dunk.phase === 'breaking') {
      ui.live.textContent = dunk.broken ? 'Score: 0' : `Score: ${dunk.score || pointsFor(dunk.depthIntegral, dunk.biscuit.fragility)}`;
      ui.live.dataset.warn = dunk.broken ? 'critical' : '';
      return;
    }
    const live = pointsFor(dunk.depthIntegral, dunk.biscuit.fragility);
    ui.live.textContent = `Score: ${live}`;
    const warn = warningOf(dunk.soak);
    ui.live.dataset.warn = dunk.phase === 'ready' ? '' : warn;
  }

  // ---- input ----
  function press() {
    if (introOpen) { nudgeIntro(); return false; }
    if (phase === 'dunk-result' || phase === 'gameover' || phase === 'intro') return false;
    if (!dunk) return false;
    holding = true;
    setHolding(dunk, true);
    if (phase === 'ready') {
      setPhase('playing');
      ui.hint.classList.add('is-hidden');
      ui.bubble.classList.add('is-hidden');
    }
    return true;
  }
  function release() {
    holding = false;
    if (dunk) setHolding(dunk, false);
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    if (press()) { pointerId = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
  });
  const up = (e: PointerEvent) => { if (e.pointerId === pointerId) { pointerId = -1; release(); } };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('lostpointercapture', up);
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  const inView = () => { const r = root.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; };
  window.addEventListener('keydown', (e) => {
    if (!inView()) return;
    const tgt = e.target as HTMLElement;
    if (introOpen && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') && (tgt === ui.introGo || !tgt?.closest?.('button, a, input, textarea, select, summary'))) {
      e.preventDefault();
      if (!e.repeat) dismissIntro();
      return;
    }
    if (e.code !== 'Space') return;
    if (tgt && tgt.closest('button, a, input, textarea, select')) return;
    if (phase === 'intro' || phase === 'ready' || phase === 'playing') e.preventDefault();
    if (!e.repeat) { spaceHeld = true; press(); }
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceHeld = false; release(); } });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  function update(dt: number) {
    clock += dt;
    if (dunk && (phase === 'playing' || phase === 'ready')) {
      acc += dt;
      while (acc >= FIXED_DT) {
        setHolding(dunk, holding || spaceHeld);
        step(dunk, FIXED_DT);
        acc -= FIXED_DT;
      }
      updateLive();
      if (dunk.phase === 'result') finishDunk();
    }
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const v = layout(w, h);
    drawScene(ctx, v, char, dunk, clock, introOpen && (!dunk || dunk.phase === 'ready') ? false : false);
    // always show the waiting biscuit during intro too
    const bx = v.charX + v.charR * 0.85;
    const by = v.charY - v.charR * 0.15;
    ui.bubble.style.left = `${bx}px`;
    ui.bubble.style.top = `${by}px`;
  }

  (window as any).__teaDunk = {
    pick: (id: string) => {
      charOverride = null;
      if (phase === 'gameover' || history.length === 0 && phase === 'intro') {
        usedIds = []; history = []; total = 0; round = 0;
        startRound(id === 'random' ? randomChar() : characterById(id));
      } else {
        // mid-game test hook: start this character as the current (or next) dunk
        usedIds = usedIds.filter((x) => x !== (id === 'random' ? '' : id));
        startRound(id === 'random' ? randomChar() : characterById(id));
      }
    },
    next: () => {
      if (phase === 'dunk-result') nextRound();
      else if (phase === 'gameover') newGame();
      else startRound(randomChar());
    },
    newGame: () => newGame(),
    seed: (n: number) => { seedOverride = n; },
    dismiss: () => dismissIntro(),
    get introOpen() { return introOpen; },
    get state() {
      return {
        phase, dunkPhase: dunk?.phase ?? null, char: char.id, biscuit: dunk?.biscuit.id ?? biscuitFor(char).id,
        depth: dunk?.depth ?? null, soak: dunk?.soak ?? null, warning: dunk ? warningOf(dunk.soak) : 'none',
        score: dunk?.score ?? 0, live: dunk && !dunk.broken ? pointsFor(dunk.depthIntegral, dunk.biscuit.fragility) : 0,
        broken: dunk?.broken ?? false, timeWet: dunk?.timeWet ?? 0, peakDepth: dunk?.peakDepth ?? 0,
        round, total, history: history.map((r) => ({ ...r })),
        holding, introOpen,
      };
    },
  };

  updateBest();
  newGame();
  requestAnimationFrame(frame);
}
