// Arcade disc golf: course data and a fixed-timestep, top-down disc physics model.
// World units are metres. x grows to the right, y grows downwards (screen-style),
// so on screen "up" the course is negative y.

export const FIXED_DT = 1 / 240;

export interface Vec { x: number; y: number }
export interface Tree { x: number; y: number; r: number; hit: number } // r = canopy (drawn), hit = collision radius
export type Surface = 'fairway' | 'rough' | 'tee' | 'water' | 'bridge';
/** A stream: a centre line and half-width. A disc that stops in it is a penalty. */
export interface Stream { path: Vec[]; halfWidth: number }
/** A footbridge: deck centre, axis angle (radians), length along the axis, width. The side rails block discs. */
export interface Bridge { x: number; y: number; angle: number; length: number; width: number }
/** A round hill: flat top out to `top` m, sloping down to `base` m; `push` is the peak downhill pull (m/s²). */
export interface Hill { x: number; y: number; top: number; base: number; push: number }

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
  water?: Stream[];
  bridges?: Bridge[];
  hills?: Hill[];
  /** a line of advice for the hole intro */
  tip: string;
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
  skidKeep: { fairway: 0.6, tee: 0.6, rough: 0.2, bridge: 0.6, water: 0 } as Record<Surface, number>,
  friction: { fairway: 4, tee: 4, rough: 12, bridge: 4, water: 99 } as Record<Surface, number>, // m/s² while sliding
  treeBounce: 0.32,
  // The chains: a slow disc anywhere within catchRadius of the pole drops in. Above
  // catchSoftSpeed the disc has to be more and more central to be caught, down to
  // catchMinRadius at catchHardSpeed and beyond. Anything that isn't caught either
  // clangs off the pole/chains (if it was fairly central) or skips past off the edge.
  catchRadius: 0.95, // m
  catchSoftSpeed: 10.5, // m/s
  catchHardSpeed: 22, // m/s
  catchMinRadius: 0.12, // m
  clangCore: 0.45, // m: missing the pole by less than this (and not caught) is a clang
  clangKeep: 0.18, clangMax: 4.5, // bounce-back speed: fraction, cap (m/s)
  skipKeep: 0.4, skipMax: 7, // carry-on speed after skipping past: fraction, cap (m/s)
  poleRadius: 0.22, // a sliding disc bumps the pole
  railRadius: 0.3, // bridge rails: collision half-thickness
  railBounce: 0.3,
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
    tip: 'Bend it right round the oak.',
  },
  // ---- Hole 2: "Troll Bridge", par 3. A stream cuts across, and the footbridge sits
  // right on the straight line, rails and all. Curve round it, or lay up and go over.
  {
    name: 'Troll Bridge',
    par: 3,
    tee: { x: 0, y: 0 },
    basket: { x: 0, y: -112 },
    fairway: cubic({ x: 0, y: 4 }, { x: 7, y: -40 }, { x: -7, y: -76 }, { x: 0, y: -117 }, 48),
    fairwayHalfWidth: 8,
    water: [{ path: wavy(-40, 40, (x) => -27 - 8 * Math.sin(x / 14)), halfWidth: 3.6 }],
    bridges: [{ x: 0, y: -27, angle: Math.atan2(-8 / 14, 1) + Math.PI / 2, length: 12, width: 3.2 }],
    trees: [
      // willows on the banks either side of the bridge
      { x: -15, y: -17, r: 4.5, hit: 3.6 },
      { x: 15, y: -38, r: 4.5, hit: 3.6 },
      { x: -27, y: -29, r: 4, hit: 3.2 },
      { x: 28, y: -44, r: 4, hit: 3.2 },
      // guarding the basket
      { x: -9, y: -96, r: 3.6, hit: 2.9 },
      { x: 11, y: -101, r: 3.4, hit: 2.7 },
      { x: -4, y: -126, r: 4, hit: 3.2 },
      // the walk to the stream
      { x: -21, y: 2, r: 3.8, hit: 3 },
      { x: 20, y: -18, r: 4, hit: 3.2 },
      { x: -14, y: -58, r: 4, hit: 3.2 },
      { x: 24, y: -90, r: 4, hit: 3.2 },
      { x: -24, y: -80, r: 4.2, hit: 3.4 },
    ],
    bounds: { minX: -34, maxX: 34, minY: -132, maxY: 12 },
    tip: 'Mind the bridge rails, and the water. Curve round, or lay up short.',
  },
  // ---- Hole 3: "King of the Hill", par 3. An S-bend up to a basket perched on a round
  // hill. Land on the flat top and it stays; come up short on the slope and it rolls back down.
  {
    name: 'King of the Hill',
    par: 3,
    tee: { x: 0, y: 0 },
    basket: { x: 22, y: -92 },
    fairway: cubic({ x: 0, y: 4 }, { x: -18, y: -38 }, { x: 40, y: -52 }, { x: 22, y: -94 }, 48),
    fairwayHalfWidth: 8,
    hills: [{ x: 22, y: -92, top: 4.5, base: 14, push: 7 }],
    trees: [
      { x: 14, y: -22, r: 4.5, hit: 3.6 },
      { x: 24, y: -36, r: 3.5, hit: 2.8 },
      { x: -16, y: -60, r: 4.5, hit: 3.6 },
      { x: -2, y: -74, r: 4, hit: 3.2 },
      { x: 2, y: -48, r: 3.4, hit: 2.7 },
      { x: 44, y: -70, r: 4, hit: 3.2 },
      { x: 46, y: -104, r: 4.5, hit: 3.6 },
      { x: 4, y: -108, r: 4, hit: 3.2 },
      { x: -18, y: -14, r: 3.5, hit: 2.8 },
      { x: 40, y: -30, r: 4, hit: 3.2 },
    ],
    bounds: { minX: -30, maxX: 58, minY: -118, maxY: 12 },
    tip: 'Land it on the flat top. Short on the slope and it rolls back down!',
  },
];

function wavy(x0: number, x1: number, f: (x: number) => number): Vec[] {
  const out: Vec[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 2) out.push({ x, y: f(x) });
  return out;
}

// ---- geometry helpers ---------------------------------------------------------------
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Distance from p to the segment a-b, and the parameter along it. */
export function segDist(p: Vec, a: Vec, b: Vec) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1) : 0;
  return { d: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), t };
}

/** Bridge-local coordinates: along the deck axis, and across it. */
export function bridgeLocal(b: Bridge, p: Vec) {
  const ax = Math.cos(b.angle), ay = Math.sin(b.angle);
  const dx = p.x - b.x, dy = p.y - b.y;
  return { along: dx * ax + dy * ay, across: -dx * ay + dy * ax };
}
/** The two side rails as segments. */
export function bridgeRails(b: Bridge): [Vec, Vec][] {
  const ax = Math.cos(b.angle), ay = Math.sin(b.angle);
  const nx = -ay, ny = ax;
  const L = b.length / 2, W = b.width / 2;
  return [-1, 1].map((k) => [
    { x: b.x - ax * L + nx * W * k, y: b.y - ay * L + ny * W * k },
    { x: b.x + ax * L + nx * W * k, y: b.y + ay * L + ny * W * k },
  ] as [Vec, Vec]);
}
export const inStream = (w: Stream, p: Vec) => {
  for (let i = 0; i < w.path.length - 1; i++) if (segDist(p, w.path[i], w.path[i + 1]).d <= w.halfWidth) return true;
  return false;
};

/** Downhill pull (m/s²) at p from any hills. */
export function slopeAt(hole: Hole, p: Vec): Vec {
  let gx = 0, gy = 0;
  for (const h of hole.hills ?? []) {
    const dx = p.x - h.x, dy = p.y - h.y, r = Math.hypot(dx, dy);
    if (r <= h.top || r >= h.base) continue;
    const m = h.push * Math.sin((Math.PI * (r - h.top)) / (h.base - h.top));
    gx += (dx / r) * m; gy += (dy / r) * m;
  }
  return { x: gx, y: gy };
}

export function surfaceAt(hole: Hole, p: Vec): Surface {
  if (Math.abs(p.x - hole.tee.x) < 1.6 && p.y < hole.tee.y + 2.6 && p.y > hole.tee.y - 2.6) return 'tee';
  for (const b of hole.bridges ?? []) {
    const l = bridgeLocal(b, p);
    if (Math.abs(l.along) <= b.length / 2 && Math.abs(l.across) <= b.width / 2) return 'bridge';
  }
  for (const w of hole.water ?? []) if (inStream(w, p)) return 'water';
  for (const h of hole.hills ?? []) if (distTo(p, h) < h.base) return 'fairway';
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
  event: null | { kind: 'tree' | 'chains' | 'clang' | 'skip' | 'pole' | 'land' | 'edge' | 'stop' | 'rail' | 'splash'; t: number; speed: number };
  catchSpeed: number;
  ox: number; oy: number; // where this throw was thrown from
}

export interface Throw { aim: number; power: number; curve: number; kind: DiscKind }

export const restingDisc = (p: Vec): Disc => ({
  x: p.x, y: p.y, vx: 0, vy: 0, z: 0, phase: 'rest', v0: 0, vLand: 0, drag: 0.3, curve: 0, t: 0, spin: 0, event: null, catchSpeed: 0, ox: p.x, oy: p.y,
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
    ox: from.x, oy: from.y,
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

    // chains: checked along the whole step
    const hit = segDist(hole.basket, { x: px, y: py }, d);
    if (hit.d <= PHYS.catchRadius) {
      const res = basketOutcome(v, hole.basket, { x: px, y: py }, d);
      if (res.kind === 'chains') {
        d.x = hole.basket.x + (d.x - hole.basket.x) * 0.15;
        d.y = hole.basket.y + (d.y - hole.basket.y) * 0.15;
        d.vx = d.vy = 0; d.z = 0.9;
        d.phase = 'holed';
        d.catchSpeed = v;
        d.event = { kind: 'chains', t: d.t, speed: v };
        return;
      }
      // not caught: it comes down off the basket, either back towards you or a little beyond
      d.x = res.x; d.y = res.y; d.vx = res.vx; d.vy = res.vy;
      d.phase = 'ground'; d.z = 0;
      d.event = { kind: res.kind, t: d.t, speed: v };
      return;
    }

    if (v <= d.vLand) {
      const surf = surfaceAt(hole, d);
      if (surf === 'water') { splash(d, v); return; }
      const keep = PHYS.skidKeep[surf];
      d.vx *= keep; d.vy *= keep;
      d.phase = 'ground'; d.z = 0;
      d.event = { kind: 'land', t: d.t, speed: v };
    }
  } else {
    // sliding along the grass (and rolling down any slope)
    const surf = surfaceAt(hole, d);
    if (surf === 'water') { splash(d, v); return; }
    const g = slopeAt(hole, d);
    const gm = Math.hypot(g.x, g.y);
    const mu = PHYS.friction[surf];
    let vx = d.vx + g.x * dt, vy = d.vy + g.y * dt;
    const sp = Math.hypot(vx, vy);
    const nv = sp - mu * dt;
    if (nv <= 0.05) {
      if (gm <= mu * 1.1) {
        d.vx = d.vy = 0;
        d.phase = 'rest';
        d.event = { kind: 'stop', t: d.t, speed: 0 };
        return;
      }
      // too steep to stay put: it starts rolling downhill
      vx = (g.x / gm) * 0.08; vy = (g.y / gm) * 0.08;
    } else { vx *= nv / sp; vy *= nv / sp; }
    d.vx = vx; d.vy = vy;
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.spin += dt * Math.hypot(vx, vy) * 2;
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
  // bridge rails
  for (const br of hole.bridges ?? []) {
    for (const [a, b] of bridgeRails(br)) {
      const sd = segDist(d, a, b);
      if (sd.d < PHYS.railRadius) {
        const c = { x: a.x + (b.x - a.x) * sd.t, y: a.y + (b.y - a.y) * sd.t };
        bounceOff(d, c, PHYS.railRadius, PHYS.railBounce);
        if (d.phase === 'flight') { d.phase = 'ground'; d.z = 0; }
        d.event = { kind: 'rail', t: d.t, speed: v };
      }
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

/** Allowed miss distance (m) for the chains to catch a disc arriving at speed v. */
export function catchWindow(v: number) {
  const f = clamp((v - PHYS.catchSoftSpeed) / (PHYS.catchHardSpeed - PHYS.catchSoftSpeed), 0, 1);
  return PHYS.catchMinRadius + (PHYS.catchRadius - PHYS.catchMinRadius) * (1 - f) * (1 - f);
}

/** What happens when a flying disc moving from p0 to p1 at speed v reaches the basket. */
export function basketOutcome(v: number, basket: Vec, p0: Vec, p1: Vec) {
  const dx = p1.x - p0.x, dy = p1.y - p0.y;
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l, uy = dy / l;
  // closest approach to the pole along this line, and which side of it the disc passes
  const along = (basket.x - p0.x) * ux + (basket.y - p0.y) * uy;
  const side = (basket.y - p0.y) * ux - (basket.x - p0.x) * uy; // >0: pole is to the disc's right
  const miss = Math.abs(side);
  if (miss <= catchWindow(v)) return { kind: 'chains' as const, miss, x: 0, y: 0, vx: 0, vy: 0 };
  const cx = p0.x + ux * along, cy = p0.y + uy * along;
  const away = side > 0 ? -1 : 1; // sideways, away from the pole (unit normal is (-uy, ux))
  const nx = -uy * away, ny = ux * away;
  if (miss <= PHYS.clangCore) {
    // CLANG: knocked back off the pole and chains, kicked a little to the side
    const sp = Math.min(v * PHYS.clangKeep, PHYS.clangMax);
    return { kind: 'clang' as const, miss, x: cx - ux * 0.5 + nx * 0.2, y: cy - uy * 0.5 + ny * 0.2, vx: (-ux * 0.8 + nx * 0.6) * sp, vy: (-uy * 0.8 + ny * 0.6) * sp };
  }
  // skipped off the edge of the basket: deflected away and drops a short way beyond
  const sp = Math.min(v * PHYS.skipKeep, PHYS.skipMax);
  const turn = 0.25 + 0.5 * (1 - (miss - PHYS.clangCore) / (PHYS.catchRadius - PHYS.clangCore));
  const c = Math.cos(turn), s = Math.sin(turn);
  return { kind: 'skip' as const, miss, x: cx + nx * 0.15, y: cy + ny * 0.15, vx: (ux * c + nx * s) * sp, vy: (uy * c + ny * s) * sp };
}

function splash(d: Disc, v: number) {
  d.vx = d.vy = 0; d.z = 0;
  d.phase = 'rest';
  d.event = { kind: 'splash', t: d.t, speed: v };
}

/**
 * Where a disc that went in the water is played from: back along the line it came,
 * onto the bank on the side it was thrown from, a step clear of the water.
 */
export function dryLie(hole: Hole, wet: Vec, from: Vec): Vec {
  const L = distTo(wet, from);
  const ux = (from.x - wet.x) / (L || 1), uy = (from.y - wet.y) / (L || 1);
  for (let s = 0; s <= L; s += 0.25) {
    const p = { x: wet.x + ux * s, y: wet.y + uy * s };
    if (surfaceAt(hole, p) !== 'water') {
      const q = { x: p.x + ux * 1.2, y: p.y + uy * 1.2 };
      return s + 1.2 <= L && surfaceAt(hole, q) !== 'water' ? q : p;
    }
  }
  return { ...from };
}

export interface SimResult { disc: Disc; path: Vec[]; holed: boolean; events: string[]; time: number; penalty: boolean; lie: Vec }

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
  const penalty = d.event?.kind === 'splash';
  const lie = penalty ? dryLie(hole, d, from) : { x: d.x, y: d.y };
  return { disc: d, path, holed: d.phase === 'holed', events, time: d.t, penalty, lie };
}
