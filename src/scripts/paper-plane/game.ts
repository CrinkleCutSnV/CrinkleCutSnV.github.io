import {
  AERO, FIXED_DT, WORLD, clamp, distanceOf, launchPlane, restingPlane, step,
  type Launch, type Plane,
} from './physics';
import { drawBackground, drawDesk, drawPlane, drawShadow, type View } from './scene';

const BEST_KEY = 'crinklecut.paperPlane.best';
const VIEW_BELOW = 0.6; // metres of floor band visible below the flight line
const VIEW_ABOVE = WORLD.ceiling + 0.35;

// Drag -> throw tuning
const FLICK_WINDOW_MS = 100;
const FLICK_GAIN = 0.85; // share of release speed from flick velocity (world m/s)
const LENGTH_GAIN = 7.5; // m/s of throw per metre of drag
const LENGTH_SHARE = 0.4;

interface Sample { t: number; x: number; y: number }

function remarkFor(d: number) {
  if (d < 2) return 'Nosedive into the bin. It happens to the best of us.';
  if (d < 8) return 'Made it past the desk. Gentle start!';
  if (d < 20) return 'Respectable. Halfway to the kettle.';
  if (d < 35) return 'Lovely glide — it nearly reached the photocopier.';
  if (d < 50) return 'Top throw! Someone in Accounts just ducked.';
  return 'Legendary. Facilities would like a word.';
}

export function initPaperPlane(root: HTMLElement) {
  const canvas = root.querySelector('canvas')!;
  const ctx = canvas.getContext('2d')!;
  const hud = {
    distance: root.querySelector<HTMLElement>('[data-distance]')!,
    best: root.querySelector<HTMLElement>('[data-best]')!,
    hint: root.querySelector<HTMLElement>('[data-hint]')!,
    aim: root.querySelector<HTMLElement>('[data-aim]')!,
    end: root.querySelector<HTMLElement>('[data-end]')!,
    endDistance: root.querySelector<HTMLElement>('[data-end-distance]')!,
    endRemark: root.querySelector<HTMLElement>('[data-end-remark]')!,
    endBest: root.querySelector<HTMLElement>('[data-end-best]')!,
    again: root.querySelector<HTMLButtonElement>('[data-again]')!,
  };

  let w = 0, h = 0, dpr = 1, ppm = 100, groundY = 0;
  let camX = -2.6, camTarget = -2.6;
  let plane: Plane = restingPlane();
  let trail: { x: number; y: number }[] = [];
  let best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  let lastLaunch: Launch | null = null;

  // drag state
  let dragging = false;
  let pointerId = -1;
  let grab = { x: 0, y: 0 }; // world point where the drag started
  let samples: Sample[] = [];
  let preview: Launch | null = null;

  const showBest = () => (hud.best.textContent = best > 0 ? `Best: ${best.toFixed(1)} m` : 'Best: –');
  showBest();

  // ---- sizing -------------------------------------------------------------
  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    w = Math.max(1, r.width);
    h = Math.max(1, r.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    // fit the corridor height, but keep at least ~5.5 m visible across on narrow screens
    ppm = Math.min(h / (VIEW_ABOVE + VIEW_BELOW), w / 5.5);
    groundY = h - VIEW_BELOW * ppm;
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  const viewWidthM = () => w / ppm;

  // Pointer position in metres, measured in screen space (independent of the moving camera),
  // so a drag that starts while the camera is still panning back to the desk behaves the same.
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / ppm, y: (groundY - (clientY - r.top)) / ppm };
  };

  // ---- throwing -----------------------------------------------------------
  const rest = restingPlane();

  function heldPosition(p: { x: number; y: number }) {
    const z = WORLD.throwZone;
    // the plane starts on the desk; lift it as soon as it's picked up
    return {
      x: clamp(rest.x + (p.x - grab.x), z.minX, z.maxX),
      y: clamp(Math.max(z.minY, rest.y + 0.25) + (p.y - grab.y), z.minY, z.maxY),
    };
  }

  function computeLaunch(): Launch | null {
    if (samples.length < 2) return null;
    const last = samples[samples.length - 1];
    const first = samples[0];
    // flick velocity over the last ~100 ms
    let k = samples.length - 1;
    while (k > 0 && last.t - samples[k - 1].t <= FLICK_WINDOW_MS) k--;
    if (k === samples.length - 1) k = Math.max(0, k - 1);
    const s0 = samples[k];
    const dt = Math.max(0.016, (last.t - s0.t) / 1000);
    let fvx = (last.x - s0.x) / dt;
    let fvy = (last.y - s0.y) / dt;
    const flick = Math.hypot(fvx, fvy);

    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const len = Math.hypot(dx, dy);

    // direction: flick direction if the hand was moving, otherwise the overall drag
    let dirX = dx, dirY = dy;
    if (flick > 0.8) { dirX = fvx; dirY = fvy; }
    if (Math.hypot(dirX, dirY) < 1e-6) return null;

    let angle = Math.atan2(dirY, dirX);
    let speed = FLICK_GAIN * (1 - LENGTH_SHARE) * flick + LENGTH_SHARE * LENGTH_GAIN * len;
    if (dirX <= 0) {
      // dragged backwards: the plane just flops out of your hand
      angle = clamp(angle, -Math.PI, Math.PI);
      speed = Math.min(speed, 1.5);
      angle = -0.3;
    }
    speed = clamp(speed, 0, AERO.maxSpeed);
    const pos = heldPosition(last);
    return { x: pos.x, y: pos.y, speed, angle: clamp(angle, (-50 * Math.PI) / 180, (70 * Math.PI) / 180) };
  }

  function onDown(e: PointerEvent) {
    if (plane.phase !== 'ready' || dragging) return;
    e.preventDefault();
    dragging = true;
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    grab = p;
    samples = [{ t: e.timeStamp, ...p }];
    const pos = heldPosition(p);
    plane.x = pos.x; plane.y = pos.y;
    hud.hint.classList.add('is-hidden');
    root.dataset.phase = 'aiming';
  }

  function onMove(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length ? events : [e]) {
      samples.push({ t: ce.timeStamp, ...toWorld(ce.clientX, ce.clientY) });
    }
    const cutoff = samples[samples.length - 1].t - 400;
    while (samples.length > 2 && samples[1].t < cutoff) {
      // keep the very first sample (drag start) for drag length
      samples.splice(1, 1);
    }
    const pos = heldPosition(samples[samples.length - 1]);
    preview = computeLaunch();
    plane.x = pos.x; plane.y = pos.y;
    plane.pitch = preview ? preview.angle * 0.6 : 0;
  }

  function onUp(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    samples.push({ t: e.timeStamp, ...toWorld(e.clientX, e.clientY) });
    // a release with no movement in the last moment shouldn't zero the flick
    const l = computeLaunch() ?? preview;
    preview = null;
    hud.aim.classList.add('is-hidden');
    if (!l || l.speed < 0.6) {
      // just a tap: put it back on the desk
      plane = restingPlane();
      hud.hint.classList.remove('is-hidden');
      root.dataset.phase = 'ready';
      return;
    }
    lastLaunch = l;
    plane = launchPlane(l);
    trail = [];
    root.dataset.phase = 'flying';
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  function reset() {
    plane = restingPlane();
    trail = [];
    hud.end.classList.add('is-hidden');
    hud.hint.classList.remove('is-hidden');
    hud.distance.textContent = '0.0 m';
    root.dataset.phase = 'ready';
  }
  hud.again.addEventListener('click', reset);
  window.addEventListener('keydown', (e) => {
    if ((e.key === ' ' || e.key === 'Enter') && plane.phase === 'stopped' && !hud.end.classList.contains('is-hidden')) {
      e.preventDefault();
      reset();
    }
  });

  function finish() {
    const d = distanceOf(plane);
    const isBest = d > best + 1e-6;
    if (isBest) {
      best = d;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* private mode */ }
      showBest();
    }
    hud.endDistance.textContent = `${d.toFixed(1)} m`;
    hud.endRemark.textContent = remarkFor(d);
    hud.endBest.textContent = isBest ? 'New best!' : `Best: ${best.toFixed(1)} m`;
    hud.endBest.classList.toggle('is-new', isBest);
    hud.end.classList.remove('is-hidden');
    root.dataset.phase = 'landed';
    root.dataset.distance = d.toFixed(2);
    setTimeout(() => hud.again.focus({ preventScroll: true }), 50);
  }

  // ---- aim preview: short dotted path from the physics model itself -------
  function drawAim(v: View, l: Launch) {
    const p = launchPlane(l);
    ctx.fillStyle = 'rgba(43,45,66,0.35)';
    for (let i = 1; i <= 14; i++) {
      for (let s = 0; s < 12; s++) step(p);
      if (p.phase !== 'flying') break;
      const r = Math.max(1.5, ppm * 0.022 * (1 - i / 18));
      ctx.beginPath();
      ctx.arc((p.x - v.camX) * ppm, groundY - p.y * ppm, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const deg = Math.round((l.angle * 180) / Math.PI);
    hud.aim.textContent = `${l.speed.toFixed(1)} m/s · ${deg}°`;
    hud.aim.style.top = `${groundY - (l.y + 0.5) * ppm}px`;
    hud.aim.style.left = `${(l.x - v.camX + 0.1) * ppm}px`;
    hud.aim.classList.remove('is-hidden');
  }

  function drawZone(v: View) {
    const z = WORLD.throwZone;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(43,45,66,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect((z.minX - v.camX) * ppm, groundY - z.maxY * ppm, (z.maxX - z.minX) * ppm, (z.maxY - z.minY) * ppm, 12);
    ctx.stroke();
    ctx.restore();
  }

  // ---- main loop ------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let wasStopped = false;

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (plane.phase === 'flying' || plane.phase === 'sliding') {
      acc += dt;
      while (acc >= FIXED_DT) {
        step(plane);
        acc -= FIXED_DT;
      }
      trail.push({ x: plane.x, y: plane.y });
      if (trail.length > 90) trail.shift();
      hud.distance.textContent = `${distanceOf(plane).toFixed(1)} m`;
      wasStopped = false;
    } else acc = 0;

    if (plane.phase === 'stopped' && !wasStopped) {
      wasStopped = true;
      finish();
    }

    // camera: keep the plane about a third of the way across, smoothed
    const vw = viewWidthM();
    if (plane.phase === 'ready') camTarget = Math.min(-2.6, rest.x - vw * 0.3);
    else camTarget = Math.max(Math.min(-2.6, rest.x - vw * 0.3), plane.x - vw * 0.35 + clamp(plane.vx, 0, 12) * 0.08);
    camX += (camTarget - camX) * (1 - Math.exp(-dt * 4.5));

    render();
    requestAnimationFrame(frame);
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v: View = { ctx, w, h, ppm, camX, groundY };
    drawBackground(v);
    drawDesk(v);
    if (plane.phase === 'ready') drawZone(v);
    if (trail.length > 1) {
      ctx.save();
      ctx.setLineDash([4, 7]);
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = Math.max(1.5, ppm * 0.015);
      ctx.beginPath();
      trail.forEach((p, i) => {
        const X = (p.x - camX) * ppm, Y = groundY - p.y * ppm;
        if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
      });
      ctx.stroke();
      ctx.restore();
    }
    if (plane.phase !== 'ready' || dragging) drawShadow(v, plane.x, plane.y);
    if (dragging && preview) drawAim(v, preview);
    drawPlane(v, plane.x, plane.y, plane.pitch);
  }

  root.dataset.phase = 'ready';
  requestAnimationFrame(frame);

  // read-only hook for automated checks
  (window as unknown as { __paperPlane: unknown }).__paperPlane = {
    get phase() { return plane.phase; },
    get distance() { return distanceOf(plane); },
    get lastLaunch() { return lastLaunch; },
    get camX() { return camX; },
    get ppm() { return ppm; },
  };
}
