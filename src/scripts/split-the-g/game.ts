import {
  BEST_KEY, CHARACTERS, FIXED_DT, bestKeyFor, GLASS, G_MARK, TARGET, characterById, judge, pourPint, predictFinal, radiusAt, startDrinking, step, stopDrinking, visibleLine,
  type Character, type Expression, type Pint, type Verdict,
} from './physics';
import { drawArm, drawBar, drawBody, drawFace, drawGlass, drawGlug, drawHand, drawPortrait, drawPub, glassToScreen, type GlassView, type Pose } from './scene';
import { readNumber, saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { SPLIT_MEDALS } from '../../data/medals';

const POUR_TIME = 2.8; // s for the pint to settle (while the 'Up next' card shows) before you're allowed a go
const NEED_V = 288; // mm of scene above the bar, glass foot to the top of a tipped-back head
const NEED_H = 236; // mm across, back of the head to the far side of the glass

type GamePhase = 'pouring' | 'ready' | 'drinking' | 'settling' | 'result';

const pickOne = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const dots = (n: number) => '●'.repeat(n) + '○'.repeat(4 - n);
const fmtMm = (v: number) => `${v.toFixed(1)} mm`;

export function initSplitTheG(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const ui = {
    who: $('[data-who]'), whoName: $('[data-who-name]'), whoDiff: $('[data-who-diff]'), best: $('[data-best]'),
    bubble: $('[data-bubble]'), hint: $('[data-hint]'), hintMain: $('[data-hint-main]'), hintSub: $('[data-hint-sub]'),
    intro: $('[data-intro]'), introFace: $<HTMLCanvasElement>('[data-intro-face]'), introName: $('[data-intro-name]'),
    introTag: $('[data-intro-tag]'), introQuirk: $('[data-intro-quirk]'), introGo: $<HTMLButtonElement>('[data-intro-go]'),
    lineup: root.parentElement!.querySelector<HTMLElement>('[data-lineup]'),
    end: $('[data-end]'), endCard: $('.end-card'), rating: $('[data-end-rating]'), mm: $('[data-end-mm]'), where: $('[data-end-where]'),
    remark: $('[data-end-remark]'), medal: $('[data-end-medal]'), endBest: $('[data-end-best]'),
    again: $<HTMLButtonElement>('[data-again]'),
  };

  let w = 0, h = 0, dpr = 1;
  let phase: GamePhase = 'pouring';
  let char: Character = CHARACTERS[0];
  let lastId: string | null = null; // never the same drinker twice in a row
  let pint: Pint | null = null;
  let phaseT = 0; // seconds in the current phase
  let clock = 0;
  let k = 0; // 0 = glass on the bar, 1 = tipped up to the mouth
  let tash = 0;
  let verdict: Verdict | null = null;
  let pointerId = -1;
  let acc = 0;
  let seedOverride: number | null = null;
  let autoRelease: number | null = null;
  let regionShift = 0; // 0 = scene centred, 1 = making room for the result card

  // ---- meet the regulars (view only: the pub picks your drinker) ----
  if (ui.lineup) {
    CHARACTERS.forEach((c) => {
      const li = document.createElement('li');
      li.dataset.char = c.id;
      li.innerHTML = `<canvas width="72" height="72" aria-hidden="true"></canvas>`
        + `<strong>${c.name}</strong><span class="tag">${c.tagline}</span>`
        + `<span class="quirk"><b>Quirk:</b> ${c.quirk} <span class="diffdots" title="Trickiness ${c.difficulty} of 4">${dots(c.difficulty)}</span></span>`;
      ui.lineup!.append(li);
      drawPortrait(li.querySelector('canvas')!, c);
    });
  }
  ui.again.addEventListener('click', () => newPint(randomChar()));
  ui.introGo.addEventListener('click', () => { if (phase === 'pouring') phaseT = POUR_TIME; });

  function randomChar() {
    const others = CHARACTERS.filter((c) => c.id !== lastId || CHARACTERS.length === 1);
    return pickOne(others);
  }
  function setPhase(p: GamePhase) { phase = p; phaseT = 0; root.dataset.phase = p; }
  function newPint(c: Character) {
    char = c; lastId = c.id;
    pint = pourPint(c, seedOverride ?? Math.floor(Math.random() * 2 ** 31));
    seedOverride = null;
    verdict = null; tash = 0; k = 0; acc = 0;
    setPhase('pouring');
    ui.end.classList.add('is-hidden');
    ui.whoName.textContent = c.name;
    ui.whoDiff.textContent = dots(c.difficulty);
    ui.whoDiff.title = `Trickiness ${c.difficulty} of 4`;
    // the 'Up next' card: who the pub has lined up for this pint
    ui.introName.textContent = c.name;
    ui.introTag.textContent = c.tagline;
    ui.introQuirk.innerHTML = `<b>Quirk:</b> ${c.quirk} <span class="diffdots" title="Trickiness ${c.difficulty} of 4">${dots(c.difficulty)}</span>`;
    drawPortrait(ui.introFace, c);
    ui.intro.classList.remove('is-hidden');
    ui.bubble.classList.add('is-hidden');
    ui.hint.classList.add('is-hidden');
    ui.introGo.focus({ preventScroll: true });
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
    ui.best.textContent = b === null ? 'Best: –' : `Best: ${fmtMm(b)}`;
  }

  // ---- input: hold anywhere on the pub to drink ----
  function press() {
    if (phase === 'ready' && pint) {
      startDrinking(pint);
      setPhase('drinking');
      ui.hint.classList.add('is-hidden');
      ui.bubble.classList.add('is-hidden');
      return true;
    }
    if (phase === 'pouring') showHint('Wait for it to settle!', 'The black stuff needs a moment.');
    return false;
  }
  function release() {
    if (phase === 'drinking' && pint) { stopDrinking(pint); setPhase('settling'); }
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
    if (e.code !== 'Space' || !inView()) return;
    const tgt = e.target as HTMLElement;
    if (tgt && (tgt.closest('button, a, input, textarea, select'))) return; // let Space press buttons
    if (phase === 'pouring' || phase === 'ready' || phase === 'drinking') e.preventDefault();
    if (!e.repeat) press();
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') release(); });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  // ---- layout ----
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const isWide = () => w >= 700;
  function scene() {
    // the part of the canvas the pub scene sits in (it makes room for the result card)
    let rx = 0, ry = 44, rw = w, rh = h - 44;
    if (isWide()) rw = w - regionShift * w * 0.36;
    else {
      const cardH = phase === 'result' ? ui.endCard.offsetHeight + 16 : 0;
      rh = h - 44 - regionShift * cardH;
    }
    const s = Math.min((rh * 0.84) / NEED_V, (rw * 0.94) / NEED_H);
    const barY = ry + rh * 0.86 + (isWide() ? 0 : 0);
    const cx = rx + rw / 2;
    const gx = cx + 66 * s, gy = barY + 3 * s;
    // the drinker's mouth meets the rim when the glass is fully tipped
    const tilt = (-char.tilt * Math.PI) / 180;
    const full: GlassView = { x: gx - 24 * s, y: gy - 38 * s, s, angle: tilt };
    const rim = glassToScreen(full, -(radiusAt(GLASS.height) + 2.2), GLASS.base + GLASS.height);
    const R = 50 * s;
    const head = { x: rim.x - 3 * s, y: rim.y + 3 * s - 0.5 * R, R };
    const e = ease(k);
    const gv: GlassView = { x: gx - 24 * s * e, y: gy - 38 * s * e, s, angle: tilt * e };
    return { s, barY, gx, gy, gv, head };
  }
  const ease = (x: number) => x * x * (3 - 2 * x);

  // ---- frame ----
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  function update(dt: number) {
    clock += dt; phaseT += dt;
    if (phase === 'pouring' && phaseT >= POUR_TIME) {
      setPhase('ready');
      ui.intro.classList.add('is-hidden');
      if (root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur(); // so Space drinks
      say(pickOne(char.quips.before));
      showHint(matchMedia('(hover: none)').matches ? 'Press and hold to drink' : 'Press and hold to drink (or hold Space)', 'Let go to stop. One gulp per pint!');
    }
    if (pint && (phase === 'drinking' || phase === 'settling')) {
      acc += dt;
      while (acc >= FIXED_DT) {
        acc -= FIXED_DT;
        step(pint);
        if (phase === 'drinking' && autoRelease !== null && predictFinal(pint) <= autoRelease) release();
        if (phase === 'drinking' && pint.phase !== 'drinking') setPhase('settling'); // emptied the glass
      }
      if (pint.phase === 'done') finish();
    }
    // the glass tips up while drinking, and comes back down with the drinker's lag
    const tipping = phase === 'drinking';
    const tau = tipping ? 0.1 : (pint?.lag ?? 0.25) * 0.8;
    k += ((tipping ? 1 : 0) - k) * (1 - Math.exp(-dt / tau));
    if (phase === 'drinking' && k > 0.7 && pint && pint.t > 0.25) tash = Math.min(1, tash + dt * 1.5);
    regionShift += ((phase === 'result' ? 1 : 0) - regionShift) * (1 - Math.exp(-dt / 0.18));
  }

  function finish() {
    if (!pint) return;
    const line = visibleLine(pint);
    verdict = judge(line, pint.emptied);
    setPhase('result');
    const v = verdict;
    ui.endCard.dataset.band = v.band;
    ui.rating.textContent = v.rating;
    ui.mm.textContent = fmtMm(v.mm);
    ui.where.textContent = pint.emptied ? 'below the G (the pint’s gone!)' : v.mm === 0 ? 'dead on the split line' : `${v.signed > 0 ? 'above' : 'below'} the split line`;
    ui.remark.textContent = v.remark;
    const medal = awardMedal(SPLIT_MEDALS, v.mm);
    ui.medal.innerHTML = medalPopHtml(medal);
    const prev = readNumber(BEST_KEY);
    const prevChar = readNumber(bestKeyFor(char.id));
    if (prevChar === null || v.mm < prevChar) saveRecord(bestKeyFor(char.id), v.mm);
    const isBest = prev === null || v.mm < prev;
    if (isBest) saveRecord(BEST_KEY, v.mm);
    const first = char.name.split(' ')[0].replace(/[“”]/g, '');
    ui.endBest.textContent = isBest ? (prev === null ? 'First split on the board!' : 'New best split!')
      : prevChar === null || v.mm < prevChar ? `New best with ${first}! (Overall best: ${fmtMm(prev!)})` : `Best: ${fmtMm(prev!)}`;
    ui.endBest.classList.toggle('is-new', isBest || prevChar === null || v.mm < prevChar);
    updateBest();
    const q = char.quips;
    say(pickOne(v.band === 'perfect' || v.band === 'great' ? q.great : v.band === 'good' ? q.good : q.bad));
    ui.hint.classList.add('is-hidden');
    ui.end.classList.remove('is-hidden');
    ui.again.textContent = 'Next pint 🎲';
    ui.again.focus({ preventScroll: true });
  }

  function expression(): Expression {
    if (phase === 'drinking' || (phase === 'settling' && k > 0.35)) return 'drinking';
    if (phase === 'result' && verdict) {
      return verdict.band === 'perfect' ? 'chuffed' : verdict.band === 'great' || verdict.band === 'good' ? 'happy' : verdict.band === 'fair' ? 'nervous' : 'gutted';
    }
    if (char.id === 'nigel') return 'nervous';
    return 'idle';
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sc = scene();
    const { s, barY, gv, head } = sc;
    drawPub(ctx, w, h, barY, clock);
    const pose: Pose = { x: head.x, y: head.y, R: head.R, expr: expression(), t: clock, tash, puff: phase === 'drinking' ? 0.5 + 0.5 * Math.sin(clock * 9) : 0 };
    const showChar = true;
    if (showChar) { drawBody(ctx, char, pose, h); drawFace(ctx, char, pose); }
    drawBar(ctx, w, h, barY);
    const grip = glassToScreen(gv, -(radiusAt(60) + 2.6), GLASS.base + 60);
    if (showChar) drawArm(ctx, char, pose, grip);
    // shadow under the glass
    ctx.fillStyle = `rgba(0,0,0,${0.3 * (1 - ease(k))})`;
    ctx.beginPath(); ctx.ellipse(sc.gx + 6 * s, sc.gy, 40 * s, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    const settled = phase === 'pouring' ? Math.min(1, phaseT / POUR_TIME) : 1;
    drawGlass(ctx, gv, pint ?? pourPint(char, 1), {
      settled: pint ? settled : 1,
      time: clock,
      verdict: phase === 'result' && pint ? { line: visibleLine(pint), good: (verdict?.mm ?? 99) <= SPLIT_MEDALS.thresholds.silver } : null,
    });
    if (showChar) drawHand(ctx, char, grip, head.R, gv.angle);
    if (phase === 'drinking' && k > 0.6) drawGlug(ctx, head.x - head.R * 0.5, head.y, clock, head.R);
    if (phase === 'result' && pint && verdict) drawVerdictLabels(sc, visibleLine(pint), verdict);
    // speech bubble sits above the glass, its tail pointing at the drinker
    const bx = head.x + head.R * 0.8, by = head.y - head.R * 0.15;
    ui.bubble.style.left = `${bx}px`;
    ui.bubble.style.top = `${by}px`;
  }

  function drawVerdictLabels(sc: ReturnType<typeof scene>, line: number, v: Verdict) {
    const { gv, s } = sc;
    const tx = (radiusAt(TARGET) + 16) * s;
    const yT = gv.y - (GLASS.base + TARGET) * s, yL = gv.y - (GLASS.base + line) * s;
    const small = s < 1.6;
    ctx.save();
    ctx.font = `800 ${small ? 11 : 13}px ui-rounded, Nunito, system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const tag = (text: string, x: number, y: number, bg: string) => {
      const pw = ctx.measureText(text).width + 12, ph = small ? 18 : 22;
      x = Math.min(x, ctx.canvas.clientWidth - pw - 6);
      ctx.fillStyle = bg; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(x, y - ph / 2, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2d42'; ctx.fillText(text, x + 6, y + 1);
    };
    const gap = Math.abs(yT - yL) < (small ? 20 : 24) ? (small ? 20 : 24) * Math.sign(yL - yT || 1) : 0;
    tag('Split line', gv.x + tx, yT - (gap ? Math.abs(gap) / 2 : 0), '#ffd84a');
    if (!pintEmpty()) tag(`Your line ${v.signed > 0 ? '+' : v.signed < 0 ? '−' : '±'}${fmtMm(v.mm)}`, gv.x + tx, yL + (gap ? Math.abs(gap) / 2 : 0), v.mm <= SPLIT_MEDALS.thresholds.silver ? '#bff0c8' : '#ffc2b0');
    ctx.restore();
  }
  const pintEmpty = () => !!pint?.emptied;

  // debug/test hooks (harmless in production)
  (window as any).__splitTheG = {
    pick: (id: string) => newPint(id === 'random' ? randomChar() : characterById(id)), // tests only: the game always picks at random
    next: () => newPint(randomChar()),
    seed: (n: number) => { seedOverride = n; },
    skipPour: () => { if (phase === 'pouring') phaseT = POUR_TIME; },
    set autoRelease(v: number | null) { autoRelease = v; },
    get state() {
      // where the G, the split line and the beer line are on screen (CSS px, canvas-relative), for tests
      const { gv, s } = scene();
      const y = (v: number) => glassToScreen(gv, 0, GLASS.base + v).y;
      const line = pint ? visibleLine(pint) : null;
      const geo = { s, glassX: gv.x, glassY: gv.y, angle: gv.angle, gLeft: gv.x - G_MARK.R * s, gRight: gv.x + G_MARK.R * s, gTop: y(G_MARK.top), gBottom: y(G_MARK.bottom), bar: y(G_MARK.barY), curl: y(G_MARK.curl.v), target: y(TARGET), line: line === null ? null : y(line), rimTop: y(GLASS.height + 4), foot: gv.y };
      return { phase, char: char.id, line, target: TARGET, g: { ...G_MARK }, geo, verdict, k, pintPhase: pint?.phase, emptied: pint?.emptied };
    },
  };

  updateBest();
  newPint(randomChar());
  requestAnimationFrame(frame);
}
