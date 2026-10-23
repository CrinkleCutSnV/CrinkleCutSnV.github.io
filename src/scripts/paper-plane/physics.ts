// Paper aeroplane flight model. Units: metres, seconds, radians.
// World axes: x to the right (distance down the corridor), y up from the floor.
// x = 0 is the front edge of the start desk, so distance scored = plane x.

export const WORLD = {
  gravity: 9.81,
  ceiling: 3.5, // corridor ceiling height (m)
  deskTop: 0.76, // desk surface height (m)
  deskLeft: -1.6,
  // Where the plane can be held and thrown from (around the desk). Dragging out of it
  // throws the plane on the spot, so it's also the furthest you can reach.
  throwZone: { minX: -1.45, maxX: 1.3, minY: 0.82, maxY: 3.05 },
  // Doorway across the corridor: a header/lintel from `bottom` up to the ceiling.
  // `x` is its leading face; the game nudges it so it's just off the initial screen.
  door: { x: 6.5, depth: 0.45, bottom: 2.7 },
};

// Secret swoop: a plane that dives "bites" the air: while it's fast it can fly at a
// higher angle of attack (a higher effective lift coefficient), so it swoops out of the
// dive and can climb, trading the speed it gained for height. That's ALL it does: lift
// is always perpendicular to the velocity (it bends the path, it can't speed the plane
// up), drag is always the normal drag (including the extra induced drag of flying at a
// higher angle of attack), and there's no thrust. The only speed comes from gravity in
// the dive; the sim checks that ½v² + g·h never goes up during a flight. It's graded: the
// swoop strength (0..1) grows smoothly with how steep and how fast the dive is, so a
// shallow downward flick gives a small boost and a steep, fast dive the full swoop.
// There's no "too steep" cut-off: a very steep dive still swoops at full strength, but
// the pull-out is limited by how much lift the wing can make (it can't turn instantly),
// so from a normal height it simply runs out of room and hits the floor.
export const DIVE = {
  fullAngle: (-20 * Math.PI) / 180, // full strength once the path is this steep (0 at level)
  curve: 2.5, // strength = smoothstep(angle)^curve: >1 keeps shallow dives gentle
  speedFrom: 9, // m/s: no swoop below this airspeed...
  speedFull: 12, // ...full strength from this airspeed (smooth ramp in between)
  minStrength: 0.01, // below this the plane just flies normally
  pullG: 8, // at full strength the nose comes up to pull this many g...
  pullLag: 0.07, // ...and responds much faster than normal
  pullCurve: 0.7, // the pull-out uses strength^pullCurve (<1: gentle swoops still pull out)
  // The extra lift fades out as the path levels and starts to climb (and as the plane
  // slows). There's no hard stop: a dive that's too fast carries on up and can balloon
  // into the ceiling or the doorway beam.
  fadeFrom: (-15 * Math.PI) / 180, // extra lift starts fading as the path comes up through here...
  fadeTo: (9 * Math.PI) / 180, // ...and is gone by this climb angle
  fadeSpeed: 1.2, // and it fades out over this many m/s above endSpeed
  levelGain: 1.2, // after the swoop, how firmly the extra lift holds a sinking glide up
  endSpeed: 6.5, // boost wears off below this speed
  boostedFrom: 0.25, // strength that counts as "a swoop" for remarks and speed streaks
};

/** Pitch that makes enough lift to hold a sinking glide up (capped at the stall angle). */
function levelAlpha(gamma: number, sp: number) {
  const want = WORLD.gravity * Math.cos(gamma) - DIVE.levelGain * gamma * sp;
  return gamma + Math.min((AERO.alphaRef * want) / (AERO.liftK * sp * sp), AERO.stallAlpha);
}

/** Hermite smoothstep: 0 at e0, 1 at e1, smooth in between. */
export function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Swoop strength (0..1) for a flight path angle (radians, negative = down) and airspeed. */
export function swoopStrength(gamma: number, speed: number) {
  return smoothstep(0, -DIVE.fullAngle, -gamma) ** DIVE.curve * smoothstep(DIVE.speedFrom, DIVE.speedFull, speed);
}

export const AERO = {
  liftK: 0.27, // lift accel = liftK * v^2 * liftCurve(alpha)
  alphaRef: (5 * Math.PI) / 180, // liftCurve(alphaRef) = 1
  stallAlpha: (12 * Math.PI) / 180, // lift peaks here then falls away
  dragK0: 0.0091, // parasitic drag: accel = k * v^2
  dragKi: 1.05, // induced/form drag grows with alpha^2
  trimSpeed: 4.0, // speed (m/s) the plane is "trimmed" to glide at (a fast plane sinks)
  trimAlpha: (5 * Math.PI) / 180,
  pitchLag: 0.22, // seconds for nose to catch up with its target attitude
  maxSpeed: 16,
  minSpeed: 1.2,
  floorFriction: 5.5, // sliding deceleration (m/s^2)
};

export const FIXED_DT = 1 / 240;

export type Phase = 'ready' | 'flying' | 'falling' | 'sliding' | 'stopped';
/** 0 none, 1 pulling out of a dive, 2 boosted glide, 3 spent */
export type Boost = 0 | 1 | 2 | 3;

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
  boost: Boost;
  boosted: boolean; // did a real swoop (strength >= DIVE.boostedFrom) happen?
  swoop: number; // swoop strength 0..1 (the most the dive earned)
  gPrev: number; // flight path angle last step (to spot the top of the swoop)
  pullDone: number; // 0..1: how far the pull-out has faded (it never comes back)
  crashed: null | 'lintel';
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
    boost: 0,
    boosted: false,
    swoop: 0,
    gPrev: 0,
    pullDone: 0,
    crashed: null,
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
    boost: 0,
    boosted: false,
    swoop: 0,
    gPrev: 0,
    pullDone: 0,
    crashed: null,
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

  if (p.phase === 'falling') {
    // knocked out of the air: tumble down, a bit of drag, no lift
    const sp = Math.hypot(p.vx, p.vy);
    p.vx -= p.vx * sp * 0.08 * dt;
    p.vy -= WORLD.gravity * dt + p.vy * sp * 0.08 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.pitch -= 7 * dt;
    if (p.y <= 0.06) {
      p.y = 0.06;
      p.vy = 0;
      p.vx *= 0.3;
      p.pitch = -0.08;
      p.phase = Math.abs(p.vx) > 0.01 ? 'sliding' : 'stopped';
    }
    return p;
  }

  const speed = Math.hypot(p.vx, p.vy);
  const gamma = Math.atan2(p.vy, p.vx); // flight path angle

  // secret swoop state machine: while diving, the strength grows with the steepest,
  // fastest part of the dive (it never shrinks during the pull-out)
  if (p.boost === 0 || p.boost === 1) {
    const s = swoopStrength(gamma, speed);
    if (s > p.swoop) p.swoop = s;
    if (p.boost === 0 && p.swoop >= DIVE.minStrength) p.boost = 1;
    if (p.swoop >= DIVE.boostedFrom) p.boosted = true;
  }
  // the pull ends at the top of the swoop (the path stops rising)
  // (or, for a gentle swoop that never quite climbs, once the path stops levelling out)
  if (p.boost === 1 && gamma > DIVE.fadeFrom * p.swoop && gamma < p.gPrev) p.boost = 2;
  p.gPrev = gamma;
  if ((p.boost === 1 || p.boost === 2) && speed < DIVE.endSpeed) p.boost = 3;
  const fs = smoothstep(DIVE.endSpeed, DIVE.endSpeed + DIVE.fadeSpeed, speed);
  const k = p.swoop * fs; // strength right now (fades as the plane slows)

  // Pitch: the nose chases "flight path + trim angle". Paper planes are pitch-stable,
  // so the trim angle shrinks as speed rises (the nose drops when fast), and the lag
  // lets a slow plane rear up and stall, or a dipping plane flare into a glide.
  const sp = Math.max(speed, 0.5);
  const targetAlpha = clamp(AERO.trimAlpha * (AERO.trimSpeed / sp) ** 2, (-2 * Math.PI) / 180, (16 * Math.PI) / 180);
  const normal = gamma + targetAlpha;
  let target = normal;
  let lag = AERO.pitchLag;
  if (p.boost === 1) {
    // swoop: the plane "bites" and pitches up to pull several g. The angle of attack is
    // capped at the stall angle (the wing's maximum lift), so the turn rate is limited.
    const pullAlpha = (AERO.alphaRef * DIVE.pullG * WORLD.gravity) / (AERO.liftK * sp * sp);
    // (a gentle swoop fades out nearer level; a full one carries on up into a climb)
    // (even a gentle swoop pulls out of its dive firmly; it's the glide after it that's
    // only stretched a little)
    p.pullDone = Math.max(p.pullDone, smoothstep(DIVE.fadeFrom * p.swoop, DIVE.fadeTo * p.swoop, gamma));
    const kp = p.swoop ** DIVE.pullCurve * fs * (1 - p.pullDone);
    target = normal + kp * (gamma + Math.min(pullAlpha, AERO.stallAlpha) - normal);
    // once the pull has faded but the path is still sinking (a gentle swoop that never
    // climbs), the rest of the extra lift holds the glide up a little, as after a swoop
    if (gamma < 0) target += Math.max(0, k - kp) * (levelAlpha(gamma, sp) - normal);
    lag = AERO.pitchLag + k * (DIVE.pullLag - AERO.pitchLag);
  } else if (p.boost === 2 && gamma < 0) {
    // after the swoop, once it starts to sink again: while it's still fast, the extra
    // lift coefficient lets it fly a little nose-up and stretch its glide (it still slows
    // down as normal; nothing stops it climbing, that's up to you)
    target = normal + k * (levelAlpha(gamma, sp) - normal);
  }
  p.pitch += wrapAngle(target - p.pitch) * Math.min(1, dt / lag);

  const alpha = wrapAngle(p.pitch - gamma);
  const v2 = speed * speed;
  const lift = AERO.liftK * v2 * liftCurve(alpha);
  const dragK = AERO.dragK0 + AERO.dragKi * Math.min(alpha * alpha, 0.6);
  const drag = dragK * v2;

  if (speed > 1e-6) {
    // drag opposes the velocity: it only ever slows the plane
    const ns = Math.max(0, speed - drag * dt);
    let vx = (p.vx / speed) * ns, vy = (p.vy / speed) * ns;
    // lift is perpendicular to the velocity, so it only turns the path. Applied as an
    // exact rotation, it can't add (or lose) any speed, even numerically.
    if (ns > 1e-6) {
      const turn = (lift / speed) * dt; // turn rate = lift / speed
      const c = Math.cos(turn), sn = Math.sin(turn);
      [vx, vy] = [vx * c - vy * sn, vx * sn + vy * c];
    }
    p.vx = vx;
    p.vy = vy;
  }
  // gravity, then move (semi-implicit Euler: this loses ½g²dt² of energy a step, never gains)
  p.vy -= WORLD.gravity * dt;
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

  // doorway lintel: anything above its underside within the header's depth is solid
  const d = WORLD.door;
  const nose = p.x + 0.3, tail = p.x - 0.3;
  if (nose >= d.x && tail <= d.x + d.depth && p.y + 0.06 > d.bottom) {
    p.crashed = 'lintel';
    p.phase = 'falling';
    p.boost = 3;
    p.x = Math.min(p.x, d.x - 0.3);
    const before = Math.hypot(p.vx, p.vy);
    p.vx = -Math.min(2.5, 0.15 * Math.abs(p.vx) + 0.5); // bounce back off the beam
    p.vy = Math.min(p.vy, 0) - 0.5;
    const after = Math.hypot(p.vx, p.vy);
    if (after > before * 0.9) { p.vx *= (before * 0.9) / after; p.vy *= (before * 0.9) / after; } // a bonk never adds speed
    return p;
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
  return { distance: distanceOf(p), time: p.time, maxHeight: p.maxHeight, ceilingHits: p.ceilingHits, boosted: p.boosted, swoop: p.swoop, crashed: p.crashed };
}
