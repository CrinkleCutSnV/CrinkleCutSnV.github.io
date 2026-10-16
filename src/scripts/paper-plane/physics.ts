// Paper aeroplane flight model. Units: metres, seconds, radians.
// World axes: x to the right (distance down the corridor), y up from the floor.
// x = 0 is the front edge of the start desk, so distance scored = plane x.

export const WORLD = {
  gravity: 9.81,
  ceiling: 3.5, // corridor ceiling height (m)
  deskTop: 0.76, // desk surface height (m)
  deskLeft: -1.6,
  // Where the throw may be released from (keeps it near the desk)
  throwZone: { minX: -0.9, maxX: 0.6, minY: 0.95, maxY: 2.1 },
};

export const AERO = {
  liftK: 0.27, // lift accel = liftK * v^2 * liftCurve(alpha)
  alphaRef: (5 * Math.PI) / 180, // liftCurve(alphaRef) = 1
  stallAlpha: (12 * Math.PI) / 180, // lift peaks here then falls away
  dragK0: 0.02, // parasitic drag: accel = k * v^2
  dragKi: 1.05, // induced/form drag grows with alpha^2
  trimSpeed: 5.8, // speed (m/s) the plane is "trimmed" to glide at
  trimAlpha: (5 * Math.PI) / 180,
  pitchLag: 0.22, // seconds for nose to catch up with its target attitude
  maxSpeed: 16,
  minSpeed: 1.2,
  floorFriction: 5.5, // sliding deceleration (m/s^2)
};

export const FIXED_DT = 1 / 240;

export type Phase = 'ready' | 'flying' | 'sliding' | 'stopped';

export interface Plane {
  x: number;
  y: number;
  vx: number;
  vy: number;
  pitch: number; // nose angle, radians, anticlockwise from +x
  phase: Phase;
  time: number;
  maxHeight: number;
  ceilingHits: number;
}

export interface Launch {
  x: number;
  y: number;
  speed: number;
  angle: number; // radians, positive = upwards
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function restingPlane(): Plane {
  return {
    x: -0.35,
    y: WORLD.deskTop + 0.1,
    vx: 0,
    vy: 0,
    pitch: 0,
    phase: 'ready',
    time: 0,
    maxHeight: 0,
    ceilingHits: 0,
  };
}

export function launchPlane(l: Launch): Plane {
  const z = WORLD.throwZone;
  const speed = clamp(l.speed, AERO.minSpeed, AERO.maxSpeed);
  const angle = clamp(l.angle, (-50 * Math.PI) / 180, (70 * Math.PI) / 180);
  const y = clamp(l.y, z.minY, z.maxY);
  return {
    x: clamp(l.x, z.minX, z.maxX),
    y,
    vx: speed * Math.cos(angle),
    vy: speed * Math.sin(angle),
    pitch: angle,
    phase: 'flying',
    time: 0,
    maxHeight: y,
    ceilingHits: 0,
  };
}

/** Lift curve: linear up to the stall angle, then falls away (and is symmetric for negative alpha). */
export function liftCurve(alpha: number) {
  const a = Math.abs(alpha);
  const s = AERO.stallAlpha;
  let c: number;
  if (a <= s) c = a / AERO.alphaRef;
  else c = (s / AERO.alphaRef) * Math.max(0.35, 1 - (a - s) / (Math.PI / 6));
  return Math.sign(alpha) * c;
}

function wrapAngle(a: number) {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Advance the plane by one fixed timestep. Mutates and returns p. */
export function step(p: Plane, dt = FIXED_DT): Plane {
  if (p.phase === 'ready' || p.phase === 'stopped') return p;
  p.time += dt;

  if (p.phase === 'sliding') {
    const v = Math.abs(p.vx);
    const nv = Math.max(0, v - AERO.floorFriction * dt);
    p.vx = Math.sign(p.vx) * nv;
    p.x += p.vx * dt;
    p.pitch += (-0.03 - p.pitch) * Math.min(1, dt * 12);
    if (nv === 0) p.phase = 'stopped';
    return p;
  }

  const speed = Math.hypot(p.vx, p.vy);
  const gamma = Math.atan2(p.vy, p.vx); // flight path angle

  // Pitch: the nose chases "flight path + trim angle". Paper planes are pitch-stable,
  // so the trim angle shrinks as speed rises (the nose drops when fast), and the lag
  // lets a slow plane rear up and stall, or a dipping plane flare into a glide.
  const sp = Math.max(speed, 0.5);
  const targetAlpha = clamp(AERO.trimAlpha * (AERO.trimSpeed / sp) ** 2, (-2 * Math.PI) / 180, (16 * Math.PI) / 180);
  const target = gamma + targetAlpha;
  p.pitch += wrapAngle(target - p.pitch) * Math.min(1, dt / AERO.pitchLag);

  const alpha = wrapAngle(p.pitch - gamma);
  const v2 = speed * speed;
  const lift = AERO.liftK * v2 * liftCurve(alpha);
  const dragK = AERO.dragK0 + AERO.dragKi * Math.min(alpha * alpha, 0.6);
  const drag = dragK * v2;

  let ax = 0;
  let ay = -WORLD.gravity;
  if (speed > 1e-6) {
    const ux = p.vx / speed;
    const uy = p.vy / speed;
    // lift acts perpendicular to velocity (rotate +90 degrees), drag opposes it
    ax += -uy * lift - ux * drag;
    ay += ux * lift - uy * drag;
  }

  // semi-implicit Euler
  p.vx += ax * dt;
  p.vy += ay * dt;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.maxHeight = Math.max(p.maxHeight, p.y);

  // ceiling bump: knocks the plane down and scrubs speed
  if (p.y > WORLD.ceiling - 0.05) {
    p.y = WORLD.ceiling - 0.05;
    if (p.vy > 0) p.vy = -p.vy * 0.1;
    p.vx *= 0.85;
    p.pitch = Math.atan2(p.vy, p.vx);
    p.ceilingHits++;
  }

  // flew back into the desk (thrown backwards / weak drop near the desk)
  if (p.x < 0 && p.x > WORLD.deskLeft && p.y <= WORLD.deskTop && p.vy < 0 && p.y > WORLD.deskTop - 0.1) {
    p.y = WORLD.deskTop;
    p.vy = 0;
    p.vx *= 0.5;
    p.phase = 'sliding';
  }

  // floor
  if (p.y <= 0.06) {
    p.y = 0.06;
    p.vy = 0;
    p.vx = Math.max(0, p.vx) * 0.45; // most energy lost on touchdown, a little slide
    p.phase = p.vx > 0.01 ? 'sliding' : 'stopped';
  }

  // safety
  if (p.time > 60) p.phase = 'stopped';
  return p;
}

/** Score in metres from the front of the start desk (never negative). */
export function distanceOf(p: Plane) {
  return Math.max(0, p.x);
}

/** Run a whole flight headlessly (used by the sanity-check script). */
export function simulate(l: Launch) {
  const p = launchPlane(l);
  while (p.phase !== 'stopped') step(p);
  return { distance: distanceOf(p), time: p.time, maxHeight: p.maxHeight, ceilingHits: p.ceilingHits };
}
