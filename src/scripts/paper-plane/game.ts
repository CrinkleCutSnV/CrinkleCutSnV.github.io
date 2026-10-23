import {
  AERO, FIXED_DT, WORLD, clamp, distanceOf, launchPlane, restingPlane, step,
  type Launch, type Plane,
} from './physics';
import { drawBackground, drawBonk, drawDesk, drawDoorway, drawPlane, drawShadow, drawWhoosh, type View } from './scene';
import { saveRecord } from '../scores';
import { awardMedal, medalPopHtml } from '../medals';
import { PLANE_MEDALS } from '../../data/medals';

const BEST_KEY = 'crinklecut.paperPlane.best';
const VIEW_BELOW = 0.6; // metres of floor band visible below the flight line
const VIEW_ABOVE = WORLD.ceiling + 0.35;

// Drag -> throw tuning. Throw speed comes only from how fast the hand is moving at
// release (the last ~100 ms), never from how far it was dragged, so a still release is weak.
const FLICK_WINDOW_MS = 100;
const FLICK_GAIN = 1.0; // throw speed per m/s of hand speed
const MIN_FLICK = 0.8; // hand speed (m/s) below which the release is treated as "still"
// A pointer-up arriving this soon after the last move, at the same spot, is part of the flick
// (events only come once a frame); any longer and the hand had stopped, so it counts as still.
const RELEASE_GAP_MS = 60;
const GRAB_RADIUS = 0.45; // m: you can also pick the plane up straight off the desk

interface Sample { t: number; x: number; y: number }

const DOOR_MIN_X = 6.5;

function remarkFor(d: number, p: Plane) {
  if (p.crashed === 'lintel') {
    const lines = [
      'BONK! Straight into the door frame. Mind your head!',
      'Clipped the doorway. Facilities are adding a "Low beam" sign.',
      'Thwack! That lintel came out of nowhere.',
      'Grounded by a door frame. Fly lower next time?',
    ];
    return lines[Math.floor(Math.random() * lines.length)];
  }
  if (p.boosted && d >= 70) {
    if (d >= 95) return 'What a swoop! That plane has clearly done this before.';
    return 'Ooh, a swooper! Was that skill or luck?';
  }
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
    endMedal: root.querySelector<HTMLElement>('[data-end-medal]')!,
  };

  let w = 0, h = 0, dpr = 1, ppm = 100, groundY = 0;
  let camX = -2.6, camTarget = -2.6;
  let plane: Plane = restingPlane();
  let trail: { x: number; y: number }[] = [];
  let best = Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  let lastLaunch: Launch | null = null;
  let lastMedal: ReturnType<typeof awardMedal> | null = null;

  // drag state
  let dragging = false;
  let pointerId = -1;
  let samples: Sample[] = [];
  let dragStart = { x: 0, y: 0 };
  let grabOffset = { x: 0, y: 0 }; // only non-zero when the plane is picked up off the desk, below the zone
  let preview: Launch | null = null;
  let zoneFlash = -1; // time (s) of a press outside the zone, to flash the outline
  let lastRelease: null | { reason: 'release' | 'exit' | 'still' | 'tap'; flick: number } = null;

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

  const rest = restingPlane();
  // Where the camera sits while you're aiming. Pointer positions are mapped to the world
  // with this (not the live, still-easing camera), so the zone you see is the zone you get.
  const readyCamX = () => Math.min(-2.6, rest.x - viewWidthM() * 0.3);

  // Pointer position in world metres
  const toWorld = (clientX: number, clientY: number) => {
    const r = canvas.getBoundingClientRect();
    return { x: (clientX - r.left) / ppm + readyCamX(), y: (groundY - (clientY - r.top)) / ppm };
  };
  // Where the held plane is for a pointer position (the grab offset is applied during a drag)
  const toHand = (clientX: number, clientY: number) => {
    const p = toWorld(clientX, clientY);
    return { x: p.x + grabOffset.x, y: p.y + grabOffset.y };
  };

  // ---- throwing -----------------------------------------------------------
  const inZone = (p: { x: number; y: number }) => {
    const z = WORLD.throwZone;
    return p.x >= z.minX && p.x <= z.maxX && p.y >= z.minY && p.y <= z.maxY;
  };

  // the plane sits under your finger, kept inside the zone (so it lifts off the desk when grabbed)
  function heldPosition(p: { x: number; y: number }) {
    const z = WORLD.throwZone;
    return { x: clamp(p.x, z.minX, z.maxX), y: clamp(p.y, z.minY, z.maxY) };
  }

  /** Hand speed (m/s) and direction over the last ~100 ms of the drag. */
  function flickOf() {
    const last = samples[samples.length - 1];
    // flick velocity over the last ~100 ms
    let k = samples.length - 1;
    while (k > 0 && last.t - samples[k - 1].t <= FLICK_WINDOW_MS) k--;
    if (k === samples.length - 1) k = Math.max(0, k - 1);
    const s0 = samples[k];
    const dt = Math.max(0.016, (last.t - s0.t) / 1000);
    const vx = (last.x - s0.x) / dt;
    const vy = (last.y - s0.y) / dt;
    return { vx, vy, flick: Math.hypot(vx, vy) };
  }

  function computeLaunch(): Launch | null {
    if (samples.length < 2) return null;
    const { vx, vy, flick } = flickOf();
    const pos = heldPosition(samples[samples.length - 1]);
    let angle = Math.atan2(vy, vx);
    let speed = clamp(FLICK_GAIN * flick, 0, AERO.maxSpeed);
    if (flick < MIN_FLICK || vx <= 0) {
      // let go of a still (or backwards-moving) hand: the plane just flops out of it
      speed = AERO.minSpeed;
      angle = -0.3;
    }
    return { x: pos.x, y: pos.y, speed, angle: clamp(angle, (-50 * Math.PI) / 180, (70 * Math.PI) / 180) };
  }

  function addSample(t: number, clientX: number, clientY: number) {
    samples.push({ t, ...toHand(clientX, clientY) });
    // keep only recent motion (plus the last sample before it, so a still hand reads as still)
    const cutoff = t - 400;
    while (samples.length > 2 && samples[1].t < cutoff) samples.shift();
  }

  function onDown(e: PointerEvent) {
    if (plane.phase !== 'ready' || dragging) return;
    e.preventDefault();
    const p = toWorld(e.clientX, e.clientY);
    const onPlane = Math.hypot(p.x - rest.x, p.y - rest.y) <= GRAB_RADIUS;
    if (!inZone(p) && !onPlane) {
      // no aiming from outside the zone: just flash its outline
      zoneFlash = performance.now() / 1000;
      return;
    }
    dragging = true;
    pointerId = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    // grabbed off the desk just below the zone: lift it into the zone and keep that offset
    const pos = heldPosition(p);
    grabOffset = { x: pos.x - p.x, y: pos.y - p.y };
    samples = [{ t: e.timeStamp, ...pos }];
    dragStart = pos;
    plane.x = pos.x; plane.y = pos.y;
    hud.hint.classList.add('is-hidden');
    root.dataset.phase = 'aiming';
  }

  function onMove(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    e.preventDefault();
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    for (const ce of events.length ? events : [e]) {
      addSample(ce.timeStamp, ce.clientX, ce.clientY);
      // leaving the throw zone lets go of the plane right there, mid-flick
      if (!inZone(samples[samples.length - 1])) {
        release('exit');
        return;
      }
    }
    const pos = heldPosition(samples[samples.length - 1]);
    preview = computeLaunch();
    plane.x = pos.x; plane.y = pos.y;
    plane.pitch = preview ? preview.angle * 0.6 : 0;
  }

  function onUp(e: PointerEvent) {
    if (!dragging || e.pointerId !== pointerId) return;
    const prev = samples[samples.length - 1];
    const p = toHand(e.clientX, e.clientY);
    const samePlace = Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-3;
    if (!(samePlace && e.timeStamp - prev.t <= RELEASE_GAP_MS)) addSample(e.timeStamp, e.clientX, e.clientY);
    release('release');
  }

  function release(reason: 'release' | 'exit') {
    dragging = false;
    if (canvas.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
    const l = computeLaunch();
    const flick = samples.length > 1 ? flickOf().flick : 0;
    const lastS = samples[samples.length - 1];
    const moved = Math.hypot(lastS.x - dragStart.x, lastS.y - dragStart.y);
    preview = null;
    hud.aim.classList.add('is-hidden');
    if (!l || (reason === 'release' && moved < 0.08 && flick < MIN_FLICK)) {
      // just a tap: put it back on the desk
      lastRelease = { reason: 'tap', flick };
      plane = restingPlane();
      hud.hint.classList.remove('is-hidden');
      root.dataset.phase = 'ready';
      return;
    }
    lastRelease = { reason: flick < MIN_FLICK ? 'still' : reason, flick };
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
    bonk = null;
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
      saveRecord(BEST_KEY, best); // also stores the date it was set
      showBest();
    }
    hud.endDistance.textContent = `${d.toFixed(1)} m`;
    hud.endRemark.textContent = remarkFor(d, plane);
    // medals are judged on the distance shown (one decimal place)
    lastMedal = awardMedal(PLANE_MEDALS, Math.round(d * 10) / 10);
    hud.endMedal.innerHTML = medalPopHtml(lastMedal);
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
    const x = (z.minX - v.camX) * ppm, y = groundY - z.maxY * ppm;
    const zw = (z.maxX - z.minX) * ppm, zh = (z.maxY - z.minY) * ppm;
    const since = performance.now() / 1000 - zoneFlash;
    const flash = since >= 0 && since < 0.7 ? 0.5 + 0.5 * Math.cos(since * Math.PI * 4) : 0;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, zw, zh, 14);
    ctx.fillStyle = dragging ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.3)';
    ctx.fill();
    ctx.setLineDash([9, 7]);
    ctx.lineDashOffset = -(performance.now() / 60) % 16; // gently marching ants
    ctx.lineWidth = Math.max(2, ppm * 0.014);
    ctx.strokeStyle = flash > 0 ? `rgba(214,64,69,${0.55 + 0.45 * flash})` : dragging ? 'rgba(43,45,66,0.85)' : 'rgba(43,45,66,0.7)';
    ctx.stroke();
    ctx.setLineDash([]);
    const fs = Math.round(clamp(ppm * 0.085, 10, 15));
    ctx.font = `700 ${fs}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = flash > 0 ? 'rgba(214,64,69,0.95)' : 'rgba(43,45,66,0.75)';
    ctx.fillText('THROW ZONE', x + 10, y + 8);
    ctx.restore();
  }

  // ---- main loop ------------------------------------------------------------
  let acc = 0;
  let last = performance.now();
  let bonk: { x: number; y: number; t: number } | null = null;
  let wasStopped = false;

  function frame(now: number) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    if (plane.phase === 'flying' || plane.phase === 'falling' || plane.phase === 'sliding') {
      acc += dt;
      while (acc >= FIXED_DT) {
        const wasCrashed = plane.crashed;
        step(plane);
        if (!wasCrashed && plane.crashed) bonk = { x: WORLD.door.x - 0.02, y: plane.y + 0.05, t: now / 1000 };
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
    if (plane.phase === 'ready') {
      camTarget = readyCamX();
      // keep the doorway just beyond the right edge of the throwing screen
      WORLD.door.x = Math.max(DOOR_MIN_X, camTarget + vw + 0.6);
    }
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
    drawDoorway(v);
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
    if ((plane.boost === 1 || plane.boost === 2) && Math.hypot(plane.vx, plane.vy) > 8.5) {
      drawWhoosh(v, plane.x, plane.y, plane.vx, plane.vy, performance.now() / 1000);
    }
    drawPlane(v, plane.x, plane.y, plane.pitch);
    if (bonk) drawBonk(v, bonk.x, bonk.y, performance.now() / 1000 - bonk.t);
  }

  root.dataset.phase = 'ready';
  requestAnimationFrame(frame);

  // read-only hook for automated checks
  (window as unknown as { __paperPlane: unknown }).__paperPlane = {
    get phase() { return plane.phase; },
    get distance() { return distanceOf(plane); },
    get lastLaunch() { return lastLaunch; },
    get camX() { return camX; },
    get boost() { return plane.boost; },
    get boosted() { return plane.boosted; },
    get crashed() { return plane.crashed; },
    get doorX() { return WORLD.door.x; },
    get x() { return plane.x; },
    get y() { return plane.y; },
    get ppm() { return ppm; },
    get groundY() { return groundY; },
    get readyCamX() { return readyCamX(); },
    get zone() { return { ...WORLD.throwZone }; },
    get lastRelease() { return lastRelease; },
    get lastMedal() { return lastMedal; },
    /** throw with an exact launch (testing): { x, y, speed, angle } */
    launch(l: Launch) {
      lastLaunch = l; plane = launchPlane(l); trail = [];
      hud.hint.classList.add('is-hidden');
      root.dataset.phase = 'flying';
    },
  };
}
