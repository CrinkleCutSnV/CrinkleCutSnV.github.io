// Arcade disc golf: course data and a fixed-timestep, top-down disc physics model.
// World units are metres. x grows to the right, y grows downwards (screen-style),
// so on screen "up" the course is negative y.

export const FIXED_DT = 1 / 240;

export interface Vec { x: number; y: number }
export interface Tree { x: number; y: number; r: number; hit: number } // r = canopy (drawn), hit = collision radius
export type Surface = 'fairway' | 'rough' | 'tee';

export interface Hole {
  name: string;
  par: number;
  tee: Vec;
  basket: Vec;
  /** fairway centre line (sampled from a curve), and its half-width */
  fairway: Vec[];
  fairwayHalfWidth: number;
  trees: Tree[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export interface DiscKind {
  name: string;
  maxSpeed: number; // launch speed (m/s) at full power
  drag: number; // 1/s, speed-proportional drag: the putter slows quicker so putts don't hang about
}

// Two discs, picked for you: a driver off the tee and from distance, a putter up close.
export const DRIVER: DiscKind = { name: 'Driver', maxSpeed: 38, drag: 0.3 };
export const PUTTER: DiscKind = { name: 'Putter', maxSpeed: 19, drag: 0.55 };
export const PUTTER_RANGE = 22; // m: inside this distance you get the putter

export const PHYS = {
  // Drag is mostly proportional to speed, so every throw flies for about the same time
  // and reach is close to proportional to launch speed (and so to power).
  dragC: 0.15, // m/s², a touch of constant drag
  landFrac: 0.35, // flight ends when speed drops to this fraction of launch speed
  minLand: 0.8, // ...or below this speed
  turnMax: 0.95, // rad/s of turn at full curve once the disc has slowed right down
  turnEarly: 0.18, // fraction of that turn rate straight out of the hand
  skidKeep: { fairway: 0.6, tee: 0.6, rough: 0.2 } as Record<Surface, number>,
  friction: { fairway: 4, tee: 4, rough: 12 } as Record<Surface, number>, // m/s² while sliding
  treeBounce: 0.32,
  catchRadius: 0.95, // m: a flying disc this close to the pole is caught by the chains
  clangSpeed: 31, // m/s: only faster than this...
  clangCore: 0.22, // ...and dead-centre on the pole does it clang off
  poleRadius: 0.22, // a sliding disc bumps the pole
  launchHeight: 1.1,
};

// ---- Hole 1: "The Old Oak", a par-2 dogleg right around a big tree ------------------
function cubic(p0: Vec, p1: Vec, p2: Vec, p3: Vec, n: number): Vec[] {
  const out: Vec[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
}

export const HOLES: Hole[] = [
  {
    name: 'The Old Oak',
    par: 2,
    tee: { x: 0, y: 0 },
    basket: { x: 40, y: -64 },
    fairway: cubic({ x: 0, y: 4 }, { x: -3, y: -48 }, { x: 8, y: -66 }, { x: 46, y: -64 }, 48),
    fairwayHalfWidth: 7.5,
    trees: [
      // the big oak in the crook of the dogleg, right on the straight line to the basket
      { x: 18, y: -29, r: 7.5, hit: 6.2 },
      // its friends, filling the inside of the bend
      { x: 27, y: -18, r: 4.5, hit: 3.6 },
      { x: 30, y: -40, r: 4, hit: 3.2 },
      { x: 12, y: -10, r: 3.2, hit: 2.5 },
      // outside the bend and round the edges
      { x: -16, y: -40, r: 5, hit: 4 },
      { x: -13, y: -74, r: 4.5, hit: 3.6 },
      { x: 18, y: -86, r: 4, hit: 3.2 },
      { x: 54, y: -80, r: 5, hit: 4 },
      { x: 60, y: -52, r: 4.5, hit: 3.6 },
      { x: -14, y: 4, r: 3.5, hit: 2.8 },
      { x: 46, y: -36, r: 3.5, hit: 2.8 },
    ],
    bounds: { minX: -26, maxX: 68, minY: -94, maxY: 14 },
  },
];

// ---- geometry helpers ---------------------------------------------------------------
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Distance from p to the segment a-b, and the parameter along it. */
export function segDist(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

export function surfaceAt(hole: Hole, p: Vec): Surface {
  if (Math.abs(p.x - hole.tee.x) < 1.6 && p.y < hole.tee.y + 2.6 && p.y > hole.tee.y - 2.6) return 'tee';
  const f = hole.fairway;
  for (let i = 0; i < f.length - 1; i++) {
    if (segDist(p, f[i], f[i + 1]).d <= hole.fairwayHalfWidth) return 'fairway';
  }
  return 'rough';
}

export const distTo = (a: Vec, b: Vec) => Math.hypot(b.x - a.x, b.y - a.y);
/** Bearing from a to b in radians, screen convention: 0 = right, -π/2 = up the screen. */
export const bearing = (a: Vec, b: Vec) => Math.atan2(b.y - a.y, b.x - a.x);

export const discFor = (hole: Hole, p: Vec): DiscKind => (distTo(p, hole.basket) <= PUTTER_RANGE ? PUTTER : DRIVER);

// ---- the disc ------------------------------------------------------------------------
export type Phase = 'rest' | 'flight' | 'ground' | 'holed';

export interface Disc {
  x: number; y: number;
  vx: number; vy: number;
  z: number; // height above the grass (visual only, plus "in the air" for the basket)
  phase: Phase;
  v0: number; vLand: number; drag: number;
  curve: number; // -1 hard left .. +1 hard right
  t: number;
  spin: number; // visual rotation
  event: null | { kind: 'tree' | 'chains' | 'clang' | 'pole' | 'land' | 'edge' | 'stop'; t: number; speed: number };
  catchSpeed: number;
}

export interface Throw { aim: number; power: number; curve: number; kind: DiscKind }

export const restingDisc = (p: Vec): Disc => ({
  x: p.x, y: p.y, vx: 0, vy: 0, z: 0, phase: 'rest', v0: 0, vLand: 0, drag: 0.3, curve: 0, t: 0, spin: 0, event: null, catchSpeed: 0,
});

/** Launch speed for a power setting; reach is roughly proportional to it. */
export const launchSpeed = (power: number, kind: DiscKind) => kind.maxSpeed * clamp(power, 0, 1);

export function launch(from: Vec, th: Throw): Disc {
  const v = Math.max(0.6, launchSpeed(th.power, th.kind));
  return {
    ...restingDisc(from),
    vx: Math.cos(th.aim) * v,
    vy: Math.sin(th.aim) * v,
    z: PHYS.launchHeight,
    phase: 'flight',
    v0: v,
    drag: th.kind.drag,
    vLand: Math.max(PHYS.minLand, v * PHYS.landFrac),
    curve: clamp(th.curve, -1, 1),
  };
}

function bounceOff(d: Disc, c: Vec, r: number, keep: number) {
  const nx = d.x - c.x, ny = d.y - c.y;
  const n = Math.hypot(nx, ny) || 1;
  const ux = nx / n, uy = ny / n;
  d.x = c.x + ux * (r + 0.01);
  d.y = c.y + uy * (r + 0.01);
  const vn = d.vx * ux + d.vy * uy;
  if (vn < 0) {
    d.vx -= (1 + keep) * vn * ux;
    d.vy -= (1 + keep) * vn * uy;
  }
  d.vx *= keep + 0.25;
  d.vy *= keep + 0.25;
}

/** Advance the disc by one fixed step. */
export function step(hole: Hole, d: Disc, dt = FIXED_DT) {
  if (d.phase === 'rest' || d.phase === 'holed') return;
  d.t += dt;
  const px = d.x, py = d.y;
  let v = Math.hypot(d.vx, d.vy);

  if (d.phase === 'flight') {
    // air drag
    const nv = Math.max(0, v - (PHYS.dragC + d.drag * v) * dt);
    // the disc fades harder as it slows down, like a real one
    const prog = clamp((d.v0 - nv) / Math.max(0.001, d.v0 - d.vLand), 0, 1);
    const turn = d.curve * PHYS.turnMax * (PHYS.turnEarly + (1 - PHYS.turnEarly) * prog * prog) * dt;
    const c = Math.cos(turn), s = Math.sin(turn);
    const k = v > 0 ? nv / v : 0;
    const vx = (d.vx * c - d.vy * s) * k;
    const vy = (d.vx * s + d.vy * c) * k;
    d.vx = vx; d.vy = vy; v = nv;
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.z = Math.max(0.05, PHYS.launchHeight + 1.6 * Math.sin(Math.PI * prog) - PHYS.launchHeight * prog * prog);
    d.spin += dt * (8 + v);

    // chains: generous catch radius, checked along the whole step
    const hit = segDist(hole.basket, { x: px, y: py }, d);
    if (hit.d <= PHYS.catchRadius) {
      // how far the line of flight misses the pole by
      const miss = Math.abs((d.vx * (hole.basket.y - py) - d.vy * (hole.basket.x - px)) / Math.max(0.001, v));
      if (v > PHYS.clangSpeed && miss <= PHYS.clangCore) {
        // smacked dead into the pole at full whack: clang, and it drops
        bounceOff(d, hole.basket, PHYS.poleRadius + 0.2, 0.15);
        d.phase = 'ground'; d.z = 0;
        d.event = { kind: 'clang', t: d.t, speed: v };
        return;
      }
      d.x = hole.basket.x + (d.x - hole.basket.x) * 0.15;
      d.y = hole.basket.y + (d.y - hole.basket.y) * 0.15;
      d.vx = d.vy = 0; d.z = 0.9;
      d.phase = 'holed';
      d.catchSpeed = v;
      d.event = { kind: 'chains', t: d.t, speed: v };
      return;
    }

    if (v <= d.vLand) {
      const surf = surfaceAt(hole, d);
      const keep = PHYS.skidKeep[surf];
      d.vx *= keep; d.vy *= keep;
      d.phase = 'ground'; d.z = 0;
      d.event = { kind: 'land', t: d.t, speed: v };
    }
  } else {
    // sliding along the grass
    const surf = surfaceAt(hole, d);
    const nv = v - PHYS.friction[surf] * dt;
    if (nv <= 0.05) {
      d.vx = d.vy = 0;
      d.phase = 'rest';
      d.event = { kind: 'stop', t: d.t, speed: 0 };
      return;
    }
    d.vx *= nv / v; d.vy *= nv / v;
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.spin += dt * v * 2;
    if (distTo(d, hole.basket) < PHYS.poleRadius) {
      bounceOff(d, hole.basket, PHYS.poleRadius, 0.2);
      d.event = { kind: 'pole', t: d.t, speed: v };
    }
  }

  // trees knock it down
  for (const tr of hole.trees) {
    if (distTo(d, tr) < tr.hit) {
      bounceOff(d, tr, tr.hit, PHYS.treeBounce);
      if (d.phase === 'flight') { d.phase = 'ground'; d.z = 0; }
      d.event = { kind: 'tree', t: d.t, speed: v };
    }
  }
  // the edge of the course is thick hedge: the disc stops there
  const b = hole.bounds;
  if (d.x < b.minX || d.x > b.maxX || d.y < b.minY || d.y > b.maxY) {
    d.x = clamp(d.x, b.minX + 0.3, b.maxX - 0.3);
    d.y = clamp(d.y, b.minY + 0.3, b.maxY - 0.3);
    d.vx = d.vy = 0; d.z = 0;
    d.phase = 'rest';
    d.event = { kind: 'edge', t: d.t, speed: v };
  }
}

export interface SimResult { disc: Disc; path: Vec[]; holed: boolean; events: string[]; time: number }

/** Run a throw to completion (headless). */
export function simulate(hole: Hole, from: Vec, th: Throw): SimResult {
  const d = launch(from, th);
  const path: Vec[] = [{ x: d.x, y: d.y }];
  const events: string[] = [];
  let lastEv: Disc['event'] = null;
  for (let i = 0; i < 240 * 30 && (d.phase === 'flight' || d.phase === 'ground'); i++) {
    step(hole, d);
    if (d.event && d.event !== lastEv) { events.push(d.event.kind); lastEv = d.event; }
    if (i % 12 === 0) path.push({ x: d.x, y: d.y });
  }
  path.push({ x: d.x, y: d.y });
  return { disc: d, path, holed: d.phase === 'holed', events, time: d.t };
}
