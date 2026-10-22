import {
  FIXED_DT, HOLES, PHYS, bearing, clamp, discFor, distTo, launch, restingDisc, step, surfaceAt,
  type Disc, type DiscKind, type Hole, type Throw, type Vec,
} from './physics';
import { drawBasket, drawCourse, drawDisc, drawMinimap, buildMinimap, drawAim, type Cam } from './scene';

const BEST_KEY = 'crinklecut.discGolf.best.'; // + hole index
const VIEW_M = 30; // metres visible across the shorter side of the screen

// Selector timings (seconds for a full back-and-forth)
const AIM_PERIOD = 2.6;
const AIM_SWING = (70 * Math.PI) / 180; // either side of the line to the basket
const POWER_PERIOD = 1.15; // "fairly quick"
const CURVE_PERIOD = 1.6;

type Stage = 'aim' | 'power' | 'curve' | 'flying' | 'settle' | 'holed' | 'done';

/** 0 → 1 → 0 triangle wave */
const tri = (u: number) => 1 - Math.abs(((u % 1) + 1) % 1 * 2 - 1);

function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'ACE!';
  const d = strokes - par;
  return ({ [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' } as Record<number, string>)[d]
    ?? `+${d}`;
}
const vsPar = (strokes: number, par: number) => {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`;
};
function remarkFor(strokes: number, par: number) {
  const d = strokes - par;
  if (strokes === 1) return 'Straight in the chains off the tee. Frame that one.';
  if (d < 0) return 'Round the oak and in. Lovely stuff.';
  if (d === 0) return 'Solid. The oak sends its regards.';
  if (d === 1) return 'Not bad. Try bending one round the tree.';
  if (d <= 3) return 'The oak won that round. Curve it right and go wide!';
  return 'Scenic route! Everyone has a day like this.';
}

export function initDiscGolf(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const hud = {
    hole: $('[data-hole]'), strokes: $('[data-strokes]'), kind: $('[data-kind]'), best: $('[data-best]'),
    toast: $('[data-toast]'), hint: $('[data-hint]'),
    end: $('[data-end]'), endTitle: $('[data-end-title]'), endScore: $('[data-end-score]'),
    endLine: $('[data-end-line]'), endRemark: $('[data-end-remark]'), endBest: $('[data-end-best]'),
    again: $<HTMLButtonElement>('[data-again]'), next: $<HTMLButtonElement>('[data-next]'),
  };

  let holeIdx = 0;
  let hole: Hole = HOLES[0];
  let w = 0, h = 0, dpr = 1, ppm = 20;
  let minimap: HTMLCanvasElement | null = null;
  let mm = { x: 0, y: 0, w: 0, h: 0, s: 1 };

  let disc: Disc = restingDisc(hole.tee);
  let kind: DiscKind = discFor(hole, disc);
  let stage: Stage = 'aim';
  let stageT = 0; // time in the current stage
  let aim = 0, power = 0, curve = 0;
  let strokes = 0;
  let throwsPath: Vec[][] = []; // every throw this hole, for the minimap
  let path: Vec[] = [];
  let cam = { x: hole.tee.x, y: hole.tee.y };
  let chainsT = -1; // time since the chains caught it
  let clangT = -1;
  let time = 0;
  let lastThrow: Throw | null = null;
  let lastEvent: Disc['event'] = null;
  let flash = -1;

  const bestOf = (i: number) => Number(localStorage.getItem(BEST_KEY + i) || 0) || 0;
  const showHud = () => {
    hud.hole.textContent = `Hole ${holeIdx + 1} · Par ${hole.par}`;
    hud.strokes.textContent = `Throws: ${strokes}`;
    const b = bestOf(holeIdx);
    hud.best.textContent = b ? `Best: ${b} (${vsPar(b, hole.par)})` : 'Best: –';
  };

  // ---- sizing ------------------------------------------------------------------------
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    w = Math.max(1, r.width); h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ppm = Math.min(w, h) / VIEW_M;
    // minimap in the top-right corner, sized to the screen
    const b = hole.bounds;
    const mw = clamp(Math.min(w * 0.24, h * 0.3), 92, 190);
    const s = mw / (b.maxX - b.minX);
    mm = { w: mw, h: (b.maxY - b.minY) * s, s, x: w - mw - 12, y: 12 };
    minimap = buildMinimap(hole, mm.w, mm.h, s, dpr);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // ---- throwing ----------------------------------------------------------------------
  const lineToBasket = () => bearing(disc, hole.basket);
  function startStroke() {
    const prevKind = kind;
    kind = discFor(hole, disc);
    if (strokes > 0 && kind !== prevKind) toast(`${kind.name} out`);
    hud.kind.textContent = `In hand: ${kind.name}`;
    stage = 'aim'; stageT = 0;
    aim = lineToBasket(); power = 0; curve = 0;
    root.dataset.stage = stage;
    updateHint();
  }

  function press() {
    if (stage === 'aim') { stage = 'power'; stageT = 0; }
    else if (stage === 'power') { stage = 'curve'; stageT = 0; }
    else if (stage === 'curve') { throwDisc({ aim, power, curve, kind }); return; }
    else return;
    flash = time;
    root.dataset.stage = stage;
    updateHint();
  }

  function throwDisc(th: Throw) {
    lastThrow = th;
    aim = th.aim; power = th.power; curve = th.curve;
    disc = launch(disc, th);
    lastEvent = null;
    strokes++;
    path = [{ x: disc.x, y: disc.y }];
    throwsPath.push(path);
    stage = 'flying'; stageT = 0;
    root.dataset.stage = stage;
    hud.hint.classList.add('is-hidden');
    showHud();
  }

  function updateHint() {
    const t = {
      aim: ['Tap to set the direction', 'Watch the arrow sweep, then tap (or press Space).'],
      power: ['Tap to set the power', 'The meter swings quickly. Tap at the strength you want.'],
      curve: ['Tap to set the curve', 'Left, straight or right. It bends more as the disc slows.'],
    } as Record<string, [string, string]>;
    const m = t[stage];
    if (!m) { hud.hint.classList.add('is-hidden'); return; }
    hud.hint.classList.remove('is-hidden');
    hud.hint.innerHTML = `<strong>${m[0]}</strong><span>${m[1]}</span>`;
  }

  let toastTimer = 0;
  function toast(msg: string, big = false) {
    hud.toast.textContent = msg;
    hud.toast.classList.toggle('is-big', big);
    hud.toast.classList.remove('is-hidden');
    hud.toast.style.animation = 'none'; void hud.toast.offsetWidth; hud.toast.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => hud.toast.classList.add('is-hidden'), big ? 1700 : 1300);
  }

  function onEvent(ev: NonNullable<Disc['event']>) {
    if (ev.kind === 'tree') toast(ev.speed > 14 ? 'THWACK! Straight into a tree.' : 'Clipped a branch!');
    else if (ev.kind === 'clang') { clangT = 0; toast('CLANG! Off the pole. Too hot!'); }
    else if (ev.kind === 'edge') toast('Into the hedge!');
    else if (ev.kind === 'pole') toast('Tink! Bumped the pole.');
    else if (ev.kind === 'land' && surfaceAt(hole, disc) === 'rough') toast('In the rough');
    else if (ev.kind === 'chains') { chainsT = 0; toast(strokes === 1 ? 'ACE!!' : 'CHAINS!', true); }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    press();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const r = root.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return; // game not on screen
    if (stage === 'done') return; // the focused end-card button handles it
    const tag = (document.activeElement as HTMLElement | null)?.tagName;
    if (tag === 'A' || tag === 'SUMMARY' || tag === 'INPUT' || tag === 'TEXTAREA') return;
    e.preventDefault();
    if (e.repeat) return;
    press();
  });

  function resetHole(idx = holeIdx) {
    holeIdx = idx; hole = HOLES[idx];
    disc = restingDisc(hole.tee);
    strokes = 0; throwsPath = []; path = [];
    chainsT = -1; clangT = -1;
    cam = { x: hole.tee.x, y: hole.tee.y };
    hud.end.classList.add('is-hidden');
    resize();
    showHud();
    startStroke();
    snapCamera();
  }
  hud.again.addEventListener('click', () => resetHole());
  hud.next.addEventListener('click', () => resetHole((holeIdx + 1) % HOLES.length));

  function finish() {
    stage = 'done';
    root.dataset.stage = stage;
    const prev = bestOf(holeIdx);
    const isBest = !prev || strokes < prev;
    if (isBest) localStorage.setItem(BEST_KEY + holeIdx, String(strokes));
    hud.endTitle.textContent = `Hole ${holeIdx + 1} · ${hole.name}`;
    hud.endScore.textContent = scoreName(strokes, hole.par);
    hud.endLine.textContent = `${strokes} ${strokes === 1 ? 'throw' : 'throws'} on a par ${hole.par} · ${vsPar(strokes, hole.par)}`;
    hud.endRemark.textContent = remarkFor(strokes, hole.par);
    hud.endBest.textContent = isBest ? (prev ? 'New best!' : 'First score on the board!') : `Best: ${prev} (${vsPar(prev, hole.par)})`;
    hud.endBest.classList.toggle('is-new', isBest);
    hud.next.classList.toggle('is-hidden', HOLES.length < 2);
    hud.end.classList.remove('is-hidden');
    showHud();
    hud.again.focus({ preventScroll: true });
  }

  // ---- camera ------------------------------------------------------------------------
  function camTarget(): Vec {
    const look = Math.min(w, h) / ppm * 0.22;
    if (stage === 'flying') {
      const v = Math.hypot(disc.vx, disc.vy);
      const k = Math.min(look, v * 0.35) / Math.max(v, 1e-3);
      return { x: disc.x + disc.vx * k, y: disc.y + disc.vy * k };
    }
    if (stage === 'holed' || stage === 'done') return { x: hole.basket.x, y: hole.basket.y };
    // aiming: look a little towards the basket so you can see where you're going
    const a = lineToBasket();
    const l = Math.min(look, distTo(disc, hole.basket) * 0.5);
    return { x: disc.x + Math.cos(a) * l, y: disc.y + Math.sin(a) * l };
  }
  function snapCamera() { cam = camTarget(); }

  // ---- loop --------------------------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt; stageT += dt;
    if (chainsT >= 0) chainsT += dt;
    if (clangT >= 0) clangT += dt;

    if (stage === 'aim') aim = lineToBasket() + AIM_SWING * (2 * tri(stageT / AIM_PERIOD + 0.25) - 1);
    else if (stage === 'power') power = tri(stageT / POWER_PERIOD);
    else if (stage === 'curve') curve = 2 * tri(stageT / CURVE_PERIOD + 0.25) - 1;

    if (stage === 'flying') {
      acc += dt;
      while (acc >= FIXED_DT) {
        step(hole, disc);
        if (disc.event && disc.event !== lastEvent) { lastEvent = disc.event; onEvent(disc.event); }
        acc -= FIXED_DT;
        if (disc.phase === 'rest' || disc.phase === 'holed') break;
      }
      const lp = path[path.length - 1];
      if (distTo(lp, disc) > 0.6) path.push({ x: disc.x, y: disc.y });
      if (disc.phase === 'holed') { path.push({ x: disc.x, y: disc.y }); stage = 'holed'; stageT = 0; root.dataset.stage = stage; }
      else if (disc.phase === 'rest') { path.push({ x: disc.x, y: disc.y }); stage = 'settle'; stageT = 0; root.dataset.stage = stage; }
    } else acc = 0;
    if (stage === 'settle' && stageT > 0.75) startStroke();
    if (stage === 'holed' && stageT > 1.9) finish();

    // ease the camera
    const tgt = camTarget();
    const k = 1 - Math.exp(-dt * (stage === 'flying' ? 6 : 3.2));
    cam.x += (tgt.x - cam.x) * k;
    cam.y += (tgt.y - cam.y) * k;

    draw();
    requestAnimationFrame(frame);
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const c: Cam = { x: cam.x, y: cam.y, ppm, w, h };
    drawCourse(ctx, hole, c, time);
    // this throw's trail
    if (path.length > 1 && stage !== 'aim' && stage !== 'power' && stage !== 'curve') {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = Math.max(2, ppm * 0.12);
      ctx.setLineDash([ppm * 0.3, ppm * 0.45]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      path.forEach((p, i) => {
        const sx = (p.x - c.x) * ppm + w / 2, sy = (p.y - c.y) * ppm + h / 2;
        i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
      });
      ctx.lineTo((disc.x - c.x) * ppm + w / 2, (disc.y - c.y) * ppm + h / 2);
      ctx.stroke();
      ctx.restore();
    }
    const aiming = stage === 'aim' || stage === 'power' || stage === 'curve';
    if (aiming) drawAim(ctx, c, disc, aim, stage === 'aim' ? -1 : power, stage === 'curve' ? curve : 0, stage, time - flash);
    drawBasket(ctx, hole.basket, c, chainsT, clangT, time);
    drawDisc(ctx, disc, c, stage === 'holed' || stage === 'done');

    // ---- overlays ----
    drawMinimap(ctx, minimap, mm, hole, disc, throwsPath, { x: cam.x - w / 2 / ppm, y: cam.y - h / 2 / ppm, w: w / ppm, h: h / ppm });
    drawGoalArrow();
    if (aiming) drawSelectors();
  }

  function roundRect(x: number, y: number, rw: number, rh: number, r: number) {
    ctx.beginPath();
    ctx.roundRect(x, y, rw, rh, r);
  }

  /** Bottom-left: an arrow pointing at the basket, with the distance. */
  function drawGoalArrow() {
    const small = w < 520;
    const r = small ? 30 : 40;
    const cx = 14 + r, cy = h - 14 - r - (small ? 16 : 20);
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#2b2d42'; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.stroke();
    // arrow
    const a = bearing(disc, hole.basket);
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ff7a59';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const L = r * 0.72;
    ctx.moveTo(L, 0); ctx.lineTo(L * 0.05, -L * 0.62); ctx.lineTo(L * 0.05, -L * 0.24); ctx.lineTo(-L * 0.8, -L * 0.24);
    ctx.lineTo(-L * 0.8, L * 0.24); ctx.lineTo(L * 0.05, L * 0.24); ctx.lineTo(L * 0.05, L * 0.62); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // distance label
    const d = distTo(disc, hole.basket);
    const label = stage === 'holed' || stage === 'done' ? 'In!' : `${d < 10 ? d.toFixed(1) : Math.round(d)} m`;
    ctx.save();
    ctx.font = `800 ${small ? 14 : 17}px ui-rounded, Nunito, system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 16;
    const ly = cy + r + (small ? 12 : 15);
    ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
    roundRect(cx - tw / 2, ly - (small ? 10 : 12), tw, small ? 20 : 24, 12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2b2d42';
    ctx.fillText(label, cx, ly + 1);
    ctx.restore();
  }

  /** Bottom panel: the three selectors, one live at a time. */
  function drawSelectors() {
    const small = w < 520;
    const left = small ? 88 : 120;
    const pw = Math.min(w - left - 12, 460);
    const ph = small ? 62 : 74;
    const px = left + (w - left - 12 - pw) / 2, py = h - ph - 12;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 3;
    ctx.shadowColor = '#2b2d42'; ctx.shadowOffsetX = 4; ctx.shadowOffsetY = 4;
    roundRect(px, py, pw, ph, 16); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.stroke();

    const slots = ['aim', 'power', 'curve'] as const;
    const sw = (pw - 16) / 3;
    const order = { aim: 0, power: 1, curve: 2 } as Record<string, number>;
    const cur = order[stage];
    const font = (s: number, wt = 800) => `${wt} ${s}px ui-rounded, Nunito, system-ui, sans-serif`;
    slots.forEach((s, i) => {
      const sx = px + 8 + i * sw, sy = py + 8, sh = ph - 16;
      const live = i === cur, done = i < cur;
      ctx.fillStyle = live ? '#fff4d6' : done ? '#eef7e8' : '#f3f3f6';
      ctx.strokeStyle = live ? '#2b2d42' : 'rgba(43,45,66,.25)';
      ctx.lineWidth = live ? 2.5 : 1.5;
      roundRect(sx + 3, sy, sw - 6, sh, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = live || done ? '#2b2d42' : 'rgba(43,45,66,.45)';
      ctx.font = font(small ? 10.5 : 12);
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const title = s === 'aim' ? 'Direction' : s === 'power' ? 'Power' : 'Curve';
      ctx.fillText(`${done ? '✓ ' : ''}${title}`, sx + 10, sy + 5);
      const bx = sx + 10, bw = sw - 20, by = sy + sh - (small ? 17 : 20), bh = small ? 10 : 12;
      if (s === 'aim') {
        const off = ((aim - lineToBasket()) * 180) / Math.PI;
        const txt = i > cur ? '–' : Math.abs(off) < 1 ? 'At basket' : `${Math.abs(off).toFixed(0)}° ${off < 0 ? 'left' : 'right'}`;
        ctx.font = font(small ? 12 : 15);
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(txt, bx, by + bh);
      } else if (s === 'power') {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
        roundRect(bx, by, bw, bh, bh / 2); ctx.fill();
        const v = i > cur ? 0 : power;
        if (v > 0.01) {
          const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
          g.addColorStop(0, '#7bd389'); g.addColorStop(0.6, '#f2c94c'); g.addColorStop(1, '#ff7a59');
          ctx.fillStyle = g;
          roundRect(bx, by, Math.max(bh, bw * v), bh, bh / 2); ctx.fill();
        }
        roundRect(bx, by, bw, bh, bh / 2); ctx.stroke();
        if (!small) {
          ctx.textAlign = 'right'; ctx.font = font(11, 700);
          ctx.fillStyle = 'rgba(43,45,66,.7)';
          ctx.fillText(kind.name, sx + sw - 10, sy + 6);
        }
      } else {
        // left..right gauge with a needle
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
        roundRect(bx, by, bw, bh, bh / 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(43,45,66,.35)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(bx + bw / 2, by + 2); ctx.lineTo(bx + bw / 2, by + bh - 2); ctx.stroke();
        if (!small) {
          ctx.fillStyle = 'rgba(43,45,66,.6)'; ctx.font = font(10, 800);
          ctx.textAlign = 'right'; ctx.textBaseline = 'top';
          ctx.fillText('L  ·  R', sx + sw - 10, sy + 6);
        }
        if (i <= cur) {
          const nx = bx + bw / 2 + (curve * (bw / 2 - bh / 2));
          ctx.fillStyle = '#48cae4'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(nx, by + bh / 2, bh * 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }
    });
    // a bouncing "Tap!" tag on the live selector
    const bx = px + 8 + cur * sw + sw / 2, by = py - 6 - Math.abs(Math.sin(time * 5)) * 4;
    ctx.font = font(small ? 11 : 12, 900);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = 'Tap!';
    const tw = ctx.measureText(label).width + 14;
    ctx.fillStyle = '#ff7a59'; ctx.strokeStyle = '#2b2d42'; ctx.lineWidth = 2;
    roundRect(bx - tw / 2, by - 10, tw, 20, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.fillText(label, bx, by + 1);
    ctx.restore();
  }

  resetHole(0);
  requestAnimationFrame(frame);

  // test/debug hook (used by scripts/disc-tests.mjs)
  (window as unknown as { __discGolf: unknown }).__discGolf = {
    get stage() { return stage; },
    get strokes() { return strokes; },
    get disc() { return { ...disc }; },
    get power() { return power; },
    get curve() { return curve; },
    get aim() { return aim; },
    get lastThrow() { return lastThrow; },
    hole: () => hole,
    lineToBasket,
    /** throw with aim given in degrees relative to the line to the basket (+ = right) */
    throwWith(aimDeg: number, pw: number, cv: number) {
      if (stage !== 'aim' && stage !== 'power' && stage !== 'curve') return false;
      throwDisc({ aim: lineToBasket() + (aimDeg * Math.PI) / 180, power: pw, curve: cv, kind });
      return true;
    },
    PHYS,
  };
}
