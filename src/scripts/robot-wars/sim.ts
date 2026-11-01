// Robot Rumble: the battle simulation. Pure and deterministic (seeded), no DOM, so the game,
// the headless balance sim (`npm run check:robots`) and the tests all run exactly the same fights.

export const TITLE = 'Robot Rumble';
export const ARENA = 100; // the arena is 100 × 100 units, top-down
export const TIME_LIMIT = 60; // s
export const DT = 1 / 60; // fixed step, s

// ---- the parts -----------------------------------------------------------------------------
export type DriveId = 'wheels' | 'tracks' | 'legs' | 'hover';
export type WeaponId = 'flipper' | 'spinner' | 'hammer' | 'claw';
export type BodyId = 'box' | 'wedge' | 'dome' | 'frame';
export type BrainId = 'aggressive' | 'conservative' | 'flanker' | 'tactician';
export type ZoneId = 'steel' | 'sand' | 'ice' | 'rubble';
export interface Build { drive: DriveId; weapon: WeaponId; body: BodyId; brain: BrainId }
export type PartKind = keyof Build;

export const ZONES: Record<ZoneId, { name: string; blurb: string }> = {
  steel: { name: 'Steel floor', blurb: 'Smooth riveted plate.' },
  sand: { name: 'Sand pit', blurb: 'Deep, soft and draggy.' },
  ice: { name: 'Ice rink', blurb: 'Slippery as anything.' },
  rubble: { name: 'Rubble', blurb: 'Bricks, bolts and broken bots.' },
};
export const ZONE_IDS = Object.keys(ZONES) as ZoneId[];

/**
 * How each drive handles. All rates are before the zone and body multipliers.
 * - speed: straight-line top speed (units/s); accel: how quickly it gets there
 * - pivot: turn rate on the spot (rad/s, standing still); pivotFade: forward speed at which that's gone
 * - radius: tightest turning circle while moving (units); turnCap: fastest it can turn while moving (rad/s)
 * - strafe: sideways speed (units/s, 0 = can't); strafeAccel: how crisply it side-steps
 * - drift: how long its momentum takes to follow the controls (s); grip: how hard it is to shove
 */
export interface Drive {
  name: string; blurb: string; handling: string;
  speed: number; accel: number;
  pivot: number; pivotFade: number; radius: number; turnCap: number;
  strafe: number; strafeAccel: number; drift: number; grip: number;
  fast: ZoneId; slow: ZoneId;
}
export const DRIVES: Record<DriveId, Drive> = {
  wheels: {
    name: 'Wheels', blurb: 'Four fat tyres: quick, and they carve lovely arcs.', handling: 'Can’t turn on the spot, so it swings round in curves or backs up to turn. Quick in a straight line.',
    speed: 17, accel: 24, pivot: 0, pivotFade: 1, radius: 5.5, turnCap: 2.4, strafe: 0, strafeAccel: 0, drift: 0.08, grip: 1, fast: 'steel', slow: 'sand',
  },
  tracks: {
    name: 'Tracks', blurb: 'Tank treads: grippy, strong and hard to shove about.', handling: 'Fastest in a straight line but turns in wide, lazy arcs. Stops and spins on the spot to line up.',
    speed: 18.5, accel: 20, pivot: 2.5, pivotFade: 5, radius: 16, turnCap: 0.85, strafe: 0, strafeAccel: 0, drift: 0.04, grip: 1.25, fast: 'sand', slow: 'ice',
  },
  legs: {
    name: 'Legs', blurb: 'Six stompy legs: turns on a sixpence.', handling: 'Slowest in a straight line, but spins on the spot, turns tightly and side-steps neatly.',
    speed: 12.5, accel: 30, pivot: 3.6, pivotFade: 99, radius: 0, turnCap: 3.2, strafe: 8.5, strafeAccel: 40, drift: 0.03, grip: 1.1, fast: 'rubble', slow: 'steel',
  },
  hover: {
    name: 'Hover', blurb: 'Floats on a cushion of air: smooth, but drifty.', handling: 'Middling at everything. Turns slowly on the spot, slides sideways and drifts on its momentum.',
    speed: 15.5, accel: 16, pivot: 1.3, pivotFade: 99, radius: 7, turnCap: 1.6, strafe: 9, strafeAccel: 16, drift: 0.45, grip: 0.85, fast: 'ice', slow: 'rubble',
  },
};
export const STRAFERS: DriveId[] = ['legs', 'hover'];
export const canStrafe = (d: DriveId) => DRIVES[d].strafe > 0;

export interface Weapon { name: string; blurb: string; damage: number; cooldown: number; reach: number; arc: number; strong: BodyId; weak: BodyId }
export const WEAPONS: Record<WeaponId, Weapon> = {
  flipper: { name: 'Flipper', blurb: 'Flings them over: they’re stuck righting themselves.', damage: 8.7, cooldown: 1.5, reach: 4, arc: 0.75, strong: 'box', weak: 'wedge' },
  spinner: { name: 'Spinning disc', blurb: 'A whirling, toothed disc. Big hits, big recoil.', damage: 10.1, cooldown: 1.2, reach: 3.5, arc: 0.7, strong: 'frame', weak: 'dome' },
  hammer: { name: 'Hammer', blurb: 'An axe-hammer that slams down from above. Long reach.', damage: 20.3, cooldown: 1.9, reach: 6.5, arc: 0.5, strong: 'dome', weak: 'frame' },
  claw: { name: 'Crushing claw', blurb: 'Grabs, holds and squeezes. They can’t move while held.', damage: 20.8, cooldown: 2.1, reach: 3.5, arc: 0.85, strong: 'wedge', weak: 'box' },
};

export interface Body { name: string; blurb: string; hp: number; speed: number; turn: number; mass: number; radius: number }
export const BODIES: Record<BodyId, Body> = {
  box: { name: 'Box', blurb: 'A solid steel box. Tough, a bit heavy.', hp: 175, speed: 0.94, turn: 1.02, mass: 1.1, radius: 4.8 },
  wedge: { name: 'Wedge', blurb: 'Sloped front: scoops up anyone it rams.', hp: 140, speed: 1, turn: 0.93, mass: 1, radius: 4.6 },
  dome: { name: 'Dome', blurb: 'Round shell that glancing blows slide off.', hp: 155, speed: 0.97, turn: 1.02, mass: 1, radius: 4.6 },
  frame: { name: 'Open frame', blurb: 'Light tubular cage. Fast, but the insides show.', hp: 125, speed: 1.08, turn: 1.25, mass: 0.9, radius: 4.4 },
};

export const BRAINS: Record<BrainId, { name: string; blurb: string }> = {
  aggressive: { name: 'Aggressive', blurb: 'Charges straight in.' },
  conservative: { name: 'Conservative', blurb: 'Keeps its distance and waits for an opening.' },
  flanker: { name: 'Flanker', blurb: 'Circles round to hit from behind.' },
  tactician: { name: 'Tactician', blurb: 'Pulls the fight into its own fast zone and the enemy’s slow zone.' },
};

/** How early each computer swings, in units beyond its reach: trigger-happy ones swing early and sometimes whiff. */
/** A flanker goes in once it's this far round (radians from their nose), and circles this much wider while reloading. */
export const FLANK = { angle: 1.7, reload: 4, hold: ['circle', 'round the back'] as string[], backOff: false };
export const TRIGGER: Record<BrainId, number> = { aggressive: 0.15, conservative: 0.15, flanker: 1.8, tactician: 0.2 };

export const PARTS = { drive: DRIVES, weapon: WEAPONS, body: BODIES, brain: BRAINS } as const;
export const PART_IDS = {
  drive: Object.keys(DRIVES) as DriveId[],
  weapon: Object.keys(WEAPONS) as WeaponId[],
  body: Object.keys(BODIES) as BodyId[],
  brain: Object.keys(BRAINS) as BrainId[],
};
export const PART_LABEL: Record<PartKind, string> = { drive: 'Drive', weapon: 'Weapon', body: 'Body', brain: 'Computer' };

// ---- the rules tables ----------------------------------------------------------------------
export const STRONG = 1.6;
export const WEAK = 0.55;
export const SPEED = { fast: 1.35, medium: 1, slow: 0.6 } as const;
export const DIR_MUL = { front: 1, side: 1.5, rear: 2 } as const;
/** Chance a hit misses because the target is zipping about on its best ground (or stuck on its worst). */
/** After any swing a bot is committed for a moment and can hardly turn. */
export const RECOVER = 0.6;
/** Each computer's sensors only look forwards: an enemy beside or behind (outside ±SENSOR) is hard to track, so it turns slowly while it searches. */
export const SENSOR = 1.5;
/** ...though anything within this many units of touching it, it can feel. */
export const NEAR = 3;
export const SEARCH_TURN = 0.4;
export const DODGE = { fast: 0.3, medium: 0.1, slow: 0 } as const;
export type Matchup = 'strong' | 'weak' | 'even';
export type HitDir = keyof typeof DIR_MUL;

export const matchup = (w: WeaponId, b: BodyId): Matchup => (WEAPONS[w].strong === b ? 'strong' : WEAPONS[w].weak === b ? 'weak' : 'even');
export const matchMul = (m: Matchup) => (m === 'strong' ? STRONG : m === 'weak' ? WEAK : 1);
export const terrain = (d: DriveId, z: ZoneId): keyof typeof SPEED => (DRIVES[d].fast === z ? 'fast' : DRIVES[d].slow === z ? 'slow' : 'medium');

// ---- random numbers ------------------------------------------------------------------------
export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];
export const randomBuild = (r: () => number): Build => ({ drive: pick(r, PART_IDS.drive), weapon: pick(r, PART_IDS.weapon), body: pick(r, PART_IDS.body), brain: pick(r, PART_IDS.brain) });

const NAME_A = ['Kettle', 'Toaster', 'Trolley', 'Teapot', 'Wheelie Bin', 'Biscuit Tin', 'Hoover', 'Lawnmower', 'Spanner', 'Bin Lid', 'Crumpet', 'Colander', 'Gnome', 'Mangle', 'Milk Float', 'Sprout'];
const NAME_B = ['of Doom', 'of Destruction', 'of Despair', 'of Mild Peril', 'of Grumpiness', 'of Chaos', 'of the Apocalypse', 'of Woe'];
const NAME_ADJ = ['Mighty', 'Furious', 'Rusty', 'Sergeant', 'Captain', 'Dreaded', 'Unstoppable', 'Wobbly', 'Grand Duke', 'Big', 'Lord', 'Angry'];
const NAME_SIR = ['Sir Clanksalot', 'Baron Von Bolt', 'Nan’s Revenge', 'The Tin Vicar', 'Mrs Sprocket', 'Uncle Gearbox', 'The Rivet Rascal', 'Count Crushula', 'Dame Spanner', 'Mr Whirly'];
export function randomName(r: () => number) {
  const k = r();
  if (k < 0.4) return `${pick(r, NAME_A)} ${pick(r, NAME_B)}`;
  if (k < 0.75) return `${pick(r, NAME_ADJ)} ${pick(r, NAME_A)}`;
  return pick(r, NAME_SIR);
}

// ---- the arena -----------------------------------------------------------------------------
/** Four zones, one per quarter: [top-left, top-right, bottom-left, bottom-right]. Shuffled every fight. */
export type Layout = [ZoneId, ZoneId, ZoneId, ZoneId];
export function randomLayout(r: () => number): Layout {
  const z = ZONE_IDS.slice();
  for (let i = z.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [z[i], z[j]] = [z[j], z[i]]; }
  return z as Layout;
}
export const zoneAt = (L: Layout, x: number, y: number): ZoneId => L[(y >= ARENA / 2 ? 2 : 0) + (x >= ARENA / 2 ? 1 : 0)];
export const zoneCentre = (L: Layout, z: ZoneId) => { const i = L.indexOf(z); return { x: (i % 2 ? 0.75 : 0.25) * ARENA, y: (i >= 2 ? 0.75 : 0.25) * ARENA }; };

// ---- the battle ----------------------------------------------------------------------------
export interface Bot {
  side: 0 | 1;
  name: string;
  build: Build;
  x: number; y: number; heading: number;
  speed: number; // forward, units/s (what the drive is pushing for)
  vs: number; // sideways, units/s (+ = to its left); only legs and hover can strafe
  vx: number; vy: number; // where it's actually going (lags behind the drive: a hover drifts)
  omega: number; // how fast it's turning, rad/s
  odoL: number; odoR: number; // how far each side's tracks/wheels have rolled (for the animation)
  gait: number; // legs: step phase
  manoeuvre: string; // what the drive is doing: 'drive' | 'pivot' | 'reverse-turn' | 'strafe'
  kx: number; ky: number; // knockback velocity
  hp: number; maxHp: number;
  cd: number; // weapon cooldown left, s
  stun: number; // s left flipped over / held / dazed
  flipped: number; // s left upside down (flipper)
  held: number; // s left held by a claw
  swing: number; // s since the weapon last fired (for drawing)
  recover: number; // s left committed to a swing: can barely turn
  dealt: number; // damage dealt
  hits: number;
  wait: number; // s spent waiting (conservative, tactician)
  orbit: 1 | -1; // which way a flanker circles
  seenX: number; seenY: number; // where it last saw the enemy
  lost: number; // how long the enemy has been out of sight
  ram: number; // wedge ram cooldown
  aggression: number; // s spent closing in (tie-break)
  zone: ZoneId;
  mode: string; // what the computer is up to, for the commentary and the tests
}
export interface BattleEvent {
  t: number;
  kind: 'start' | 'hit' | 'dodge' | 'miss' | 'ram' | 'zone' | 'ko' | 'time' | 'opening' | 'judges';
  by: 0 | 1;
  on?: 0 | 1;
  dmg?: number;
  dir?: HitDir;
  match?: Matchup;
  weapon?: WeaponId;
  zone?: ZoneId;
  x?: number; y?: number;
}
export interface Battle {
  t: number;
  bots: [Bot, Bot];
  layout: Layout;
  r: () => number;
  events: BattleEvent[];
  over: boolean;
  winner: 0 | 1 | null;
  reason: 'ko' | 'points' | 'judges' | null;
}

function makeBot(side: 0 | 1, name: string, build: Build, L: Layout): Bot {
  const b = BODIES[build.body];
  const x = side === 0 ? 14 : ARENA - 14, y = ARENA / 2;
  return {
    side, name, build, x, y, heading: side === 0 ? 0 : Math.PI, speed: 0, vs: 0, vx: 0, vy: 0, omega: 0, odoL: 0, odoR: 0, gait: 0, manoeuvre: 'drive', kx: 0, ky: 0,
    hp: b.hp, maxHp: b.hp, cd: 0.6, stun: 0, flipped: 0, held: 0, swing: 9, recover: 0, dealt: 0, hits: 0, wait: 0, orbit: side === 0 ? 1 : -1, ram: 0, aggression: 0, seenX: side === 0 ? ARENA - 14 : 14, seenY: y, lost: 0,
    zone: zoneAt(L, x, y), mode: 'start',
  };
}

export function createBattle(a: { name: string; build: Build }, b: { name: string; build: Build }, seed: number, layout?: Layout): Battle {
  const r = rng(seed);
  const L = layout ?? randomLayout(r);
  const bots: [Bot, Bot] = [makeBot(0, a.name, a.build, L), makeBot(1, b.name, b.build, L)];
  return { t: 0, bots, layout: L, r, events: [{ t: 0, kind: 'start', by: 0 }], over: false, winner: null, reason: null };
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Bot, b: Bot) => Math.hypot(b.x - a.x, b.y - a.y);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const speedMul = (bot: Bot) => SPEED[terrain(bot.build.drive, bot.zone)];
export const topSpeed = (bot: Bot) => DRIVES[bot.build.drive].speed * BODIES[bot.build.body].speed * speedMul(bot);

/** Which way `att` is from `tgt`, relative to where `tgt` is facing. */
export function hitDir(tgt: Bot, att: Bot): HitDir {
  const a = Math.abs(wrap(Math.atan2(att.y - tgt.y, att.x - tgt.x) - tgt.heading));
  return a < 0.87 ? 'front' : a > 2.2 ? 'rear' : 'side';
}

/** The computer: where to drive, how hard, and whether it's fine to swing. */
interface Goal { tx: number; ty: number; throttle: number; reverse?: boolean; face?: boolean /* strafers: keep the nose on the enemy while moving */ }
function brain(b: Battle, me: Bot, foe: Bot): Goal {
  const d = dist(me, foe);
  const toFoe = Math.atan2(foe.y - me.y, foe.x - me.x);
  const reach = WEAPONS[me.build.weapon].reach + BODIES[me.build.body].radius + BODIES[foe.build.body].radius;
  const charge = (lead = 0.25) => ({ tx: foe.x + (foe.vx + foe.kx) * lead, ty: foe.y + (foe.vy + foe.ky) * lead, throttle: 1 });
  const strafer = canStrafe(me.build.drive);
  // legs and hover can circle sideways round them, nose on target
  const sidestep = (ang: number, R: number, throttle = 1): Goal => ({ tx: clamp(foe.x + Math.cos(ang) * R, 7, ARENA - 7), ty: clamp(foe.y + Math.sin(ang) * R, 7, ARENA - 7), throttle, face: true });
  const late = b.t > TIME_LIMIT - 12 && me.dealt <= foe.dealt; // behind on points late on: go for it
  const helpless = foe.stun > 0.25;
  const foeReach = WEAPONS[foe.build.weapon].reach + BODIES[foe.build.body].radius + BODIES[me.build.body].radius;
  // where am I round them? 0 = dead ahead of them, ±π = right behind
  const phi = wrap(Math.atan2(me.y - foe.y, me.x - foe.x) - foe.heading);
  const sideOf = phi >= 0 ? 1 : -1;
  const round = Math.atan2(me.y - foe.y, me.x - foe.x); // my bearing from them
  // legs and hover hop sideways out of a swing that's coming their way, then slip round the side
  if (strafer && !helpless && foe.stun <= 0 && Math.abs(phi) < 0.7 && d < foeReach + 3 && foe.cd < 0.25 && me.cd > 0.15 && me.build.brain !== 'tactician') {
    me.mode = 'side-step';
    return sidestep(round + sideOf * 0.9, Math.max(d, foeReach - 1));
  }
  switch (me.build.brain) {
    case 'aggressive':
      me.mode = 'charge';
      return charge();
    case 'conservative': {
      // an opening: weapon ready and they're helpless, busy reloading, or looking the other way
      const foeFacesMe = Math.abs(wrap(toFoe + Math.PI - foe.heading)) < 0.9;
      const open = me.cd <= 0.05 && (helpless || foe.cd > 0.6 || !foeFacesMe || me.wait > 3);
      if (open || late || d < reach * 0.7) {
        if (me.mode !== 'pounce' && b.events.length < 4000) b.events.push({ t: b.t, kind: 'opening', by: me.side });
        me.mode = 'pounce'; me.wait = 0;
        return charge(0.15);
      }
      me.mode = 'wait';
      me.wait += DT;
      // hang back at a safe distance, still facing them, reversing away if they come close
      const keep = reach + 14;
      if (d < keep) {
        let bx = me.x - Math.cos(toFoe) * 10 + Math.cos(toFoe + Math.PI / 2) * 6 * me.orbit, by = me.y - Math.sin(toFoe) * 10 + Math.sin(toFoe + Math.PI / 2) * 6 * me.orbit;
        if (bx < 10 || bx > ARENA - 10 || by < 10 || by > ARENA - 10) { me.orbit = (me.orbit * -1) as 1 | -1; bx = clamp(bx, 10, ARENA - 10); by = clamp(by, 10, ARENA - 10); }
        if (strafer) return { tx: bx, ty: by, throttle: 0.8, face: true }; // backs and slides away, still facing them
        return { tx: bx, ty: by, throttle: 0.7, reverse: true };
      }
      if (strafer && d < keep + 12) {
        // a slow sideways shuffle round them, keeping its distance and its nose on them
        const g = sidestep(round + 0.5 * me.orbit, keep + 2, 0.45);
        if (g.tx <= 7.5 || g.tx >= ARENA - 7.5 || g.ty <= 7.5 || g.ty >= ARENA - 7.5) me.orbit = (me.orbit * -1) as 1 | -1;
        return g;
      }
      return { tx: foe.x, ty: foe.y, throttle: d > keep + 12 ? 0.4 : 0 };
    }
    case 'flanker': {
      // they're stuck or committed to a swing: nip round to their side and back
      if ((helpless || foe.recover > 0.1) && d < foeReach + 14 && me.cd < 0.4) {
        if (Math.abs(phi) > 1.4) { me.mode = 'strike'; return charge(0.1); }
        me.mode = 'round the back';
        const a2 = foe.heading + sideOf * 2.4, rr = reach * 0.75;
        return { tx: clamp(foe.x + Math.cos(a2) * rr, 6, ARENA - 6), ty: clamp(foe.y + Math.sin(a2) * rr, 6, ARENA - 6), throttle: 1, face: strafer };
      }
      if ((Math.abs(phi) > FLANK.angle && me.cd < 0.2) || late) { me.mode = 'strike'; return charge(0.2); }
      // nose to nose: back out (still facing them) rather than turn side-on
      const s2 = Math.atan2(me.y - foe.y, me.x - foe.x) + 0.6 * sideOf;
      const pinned = me.x + Math.cos(s2) * 12 < 8 || me.x + Math.cos(s2) * 12 > ARENA - 8 || me.y + Math.sin(s2) * 12 < 8 || me.y + Math.sin(s2) * 12 > ARENA - 8;
      if (d < foeReach + 1 && Math.abs(phi) < 1.0 && pinned) { me.mode = 'cornered'; return charge(0); }
      if (d < foeReach + 1 && Math.abs(phi) < 1.0) {
        me.mode = 'back off';
        return { tx: clamp(me.x + Math.cos(s2) * 12, 7, ARENA - 7), ty: clamp(me.y + Math.sin(s2) * 12, 7, ARENA - 7), throttle: 1, reverse: !strafer, face: strafer };
      }
      // circle round them on the edge of their reach (baiting a swing), wider while reloading
      me.mode = me.cd > 0.2 ? 'back off' : 'circle';
      me.orbit = sideOf as 1 | -1;
      const R = foeReach + (me.cd > 0.2 ? FLANK.reload : 1.5);
      const aim = foe.heading + phi + 0.8 * me.orbit;
      let tx = foe.x + Math.cos(aim) * R, ty = foe.y + Math.sin(aim) * R;
      if (tx < 7 || tx > ARENA - 7 || ty < 7 || ty > ARENA - 7) {
        const alt = foe.heading + phi - 0.8 * me.orbit; // pinned against a wall: go the other way round
        tx = foe.x + Math.cos(alt) * R; ty = foe.y + Math.sin(alt) * R;
      }
      // while reloading, back away still facing them rather than show them its back
      return { tx: clamp(tx, 7, ARENA - 7), ty: clamp(ty, 7, ARENA - 7), throttle: 1, reverse: !strafer && FLANK.backOff && me.cd > 0.2 && d < foeReach + 6, face: strafer };
    }
    case 'tactician': {
      // the best ground: fast for me, slow for them
      let best = ZONE_IDS[0], score = -1;
      for (const z of ZONE_IDS) {
        const s = SPEED[terrain(me.build.drive, z)] / SPEED[terrain(foe.build.drive, z)];
        if (s > score + 1e-6) { score = s; best = z; }
      }
      const c = zoneCentre(b.layout, best);
      const foeIn = zoneAt(b.layout, foe.x, foe.y) === best;
      const meIn = me.zone === best;
      if (foeIn || helpless || late || me.wait > 5 || d < reach + 6) { me.mode = meIn || foeIn ? 'home fight' : 'engage'; return charge(0.2); }
      if (!meIn || Math.hypot(c.x - me.x, c.y - me.y) > 10) { me.mode = 'to zone'; return { tx: c.x, ty: c.y, throttle: 1 }; }
      me.mode = 'lure';
      me.wait += DT;
      return { tx: foe.x, ty: foe.y, throttle: 0 }; // face them and wait for them to come
    }
  }
}

function canStrike(me: Bot, foe: Bot) {
  const W = WEAPONS[me.build.weapon];
  const reach = W.reach + BODIES[me.build.body].radius + BODIES[foe.build.body].radius;
  const d = dist(me, foe);
  const trigger = reach + TRIGGER[me.build.brain];
  if (me.cd > 0 || me.stun > 0 || d > trigger) return false;
  // a flanker holds its fire for side and back shots, unless it's cornered or they're helpless
  if (me.build.brain === 'flanker' && hitDir(foe, me) === 'front' && FLANK.hold.includes(me.mode) && foe.stun <= 0) return false;
  return Math.abs(wrap(Math.atan2(foe.y - me.y, foe.x - me.x) - me.heading)) <= W.arc;
}

function strike(b: Battle, me: Bot, foe: Bot) {
  const W = WEAPONS[me.build.weapon];
  const d = dist(me, foe);
  me.cd = W.cooldown; me.swing = 0; me.recover = RECOVER;
  if (d > W.reach + BODIES[me.build.body].radius + BODIES[foe.build.body].radius) {
    b.events.push({ t: b.t, kind: 'miss', by: me.side, on: foe.side, weapon: me.build.weapon, x: foe.x, y: foe.y });
    return;
  }
  if (foe.stun <= 0 && b.r() < DODGE[terrain(foe.build.drive, foe.zone)]) {
    b.events.push({ t: b.t, kind: 'dodge', by: me.side, on: foe.side, weapon: me.build.weapon, zone: foe.zone, x: foe.x, y: foe.y });
    return;
  }
  const dir = hitDir(foe, me);
  const m = matchup(me.build.weapon, foe.build.body);
  const dmg = Math.round(W.damage * matchMul(m) * DIR_MUL[dir] * (0.85 + 0.3 * b.r()) * 10) / 10;
  foe.hp = Math.max(0, foe.hp - dmg);
  me.dealt += dmg; me.hits++;
  const ux = (foe.x - me.x) / (d || 1), uy = (foe.y - me.y) / (d || 1);
  const mass = BODIES[foe.build.body].mass * DRIVES[foe.build.drive].grip;
  // the matchup scales the weapon's effect as well as its damage: a flipper really can't get under a wedge
  const fx = matchMul(m);
  switch (me.build.weapon) {
    case 'flipper': foe.kx += (ux * 26 * fx) / mass; foe.ky += (uy * 26 * fx) / mass; foe.heading = wrap(foe.heading + (b.r() < 0.5 ? -1 : 1) * (0.6 + 0.9 * b.r()) * fx); foe.stun = Math.max(foe.stun, 1.0 * fx); foe.flipped = 1.0 * fx; break;
    case 'spinner': foe.kx += (ux * 20 * fx) / mass; foe.ky += (uy * 20 * fx) / mass; foe.heading = wrap(foe.heading + (b.r() < 0.5 ? -1 : 1) * (0.5 + 0.8 * b.r()) * fx); me.kx -= ux * 12; me.ky -= uy * 12; foe.stun = Math.max(foe.stun, 0.25 * fx); break;
    case 'hammer': foe.stun = Math.max(foe.stun, 0.6 * fx); foe.speed *= 0.2; foe.vs *= 0.2; foe.vx *= 0.2; foe.vy *= 0.2; break;
    case 'claw': foe.stun = Math.max(foe.stun, 1.0 * fx); foe.held = 1.0 * fx; foe.speed = 0; foe.vs = 0; foe.vx = 0; foe.vy = 0; break;
  }
  b.events.push({ t: b.t, kind: 'hit', by: me.side, on: foe.side, dmg, dir, match: m, weapon: me.build.weapon, x: (me.x + foe.x) / 2, y: (me.y + foe.y) / 2 });
}

// ---- the drives ----------------------------------------------------------------------------
/** The fastest this bot can turn right now (rad/s): on the spot, or along its turning circle while moving. */
export function turnLimit(me: Bot) {
  const D = DRIVES[me.build.drive];
  const v = Math.abs(me.speed);
  const spot = D.pivot * clamp(1 - v / D.pivotFade, 0, 1);
  const moving = D.radius > 0 ? Math.min(D.turnCap, v / D.radius) : D.turnCap;
  return Math.max(spot, moving) * BODIES[me.build.body].turn * Math.sqrt(speedMul(me));
}
export const strafeSpeed = (me: Bot) => DRIVES[me.build.drive].strafe * BODIES[me.build.body].speed * speedMul(me);

/** What the computer asks of the drive this step. */
export interface Cmd { fwd: number; side: number; turn: number; turnMul?: number }
/** Apply a command: turn (within its limits), push forwards/sideways, and let its momentum catch up. */
export function driveStep(me: Bot, c: Cmd, ice = me.zone === 'ice') {
  const D = DRIVES[me.build.drive];
  const mul = speedMul(me);
  const lim = turnLimit(me) * (c.turnMul ?? 1) * DT;
  const dh = clamp(c.turn, -lim, lim);
  me.heading = wrap(me.heading + dh);
  me.omega = dh / DT;
  const acc = D.accel * mul * DT;
  me.speed += clamp(c.fwd - me.speed, -acc * 1.6, acc * 1.6);
  const side = clamp(c.side, -strafeSpeed(me), strafeSpeed(me));
  const sacc = D.strafeAccel * mul * DT;
  me.vs += clamp(side - me.vs, -sacc, sacc);
  const ch = Math.cos(me.heading), sh = Math.sin(me.heading);
  const wx = ch * me.speed - sh * me.vs, wy = sh * me.speed + ch * me.vs;
  // momentum: a hover takes a while to change direction (longer on ice); tracks bite at once
  const tau = D.drift * (ice ? 2 : 1);
  const f = 1 - Math.exp(-DT / Math.max(tau, 1e-3));
  me.vx += (wx - me.vx) * f; me.vy += (wy - me.vy) * f;
  // for the animation: each side's track/wheel rolls with forward speed ± the turn
  const half = BODIES[me.build.body].radius;
  me.odoL += (me.speed - me.omega * half) * DT; me.odoR += (me.speed + me.omega * half) * DT;
  me.gait += (Math.abs(me.speed) + Math.abs(me.vs) * 1.3 + Math.abs(me.omega) * half) * DT;
}

function move(b: Battle, me: Bot, foe: Bot) {
  const D = DRIVES[me.build.drive];
  if (me.stun > 0) {
    me.speed *= Math.exp(-DT / 0.15); me.vs *= Math.exp(-DT / 0.15);
    driveStep(me, { fwd: me.speed, side: me.vs, turn: 0 });
  } else {
    // it only knows where the enemy is while it's in the sensor cone, or close enough to bump into
    const outOfSight = Math.abs(wrap(Math.atan2(foe.y - me.y, foe.x - me.x) - me.heading)) > SENSOR && dist(me, foe) > BODIES[me.build.body].radius + BODIES[foe.build.body].radius + NEAR;
    if (!outOfSight) { me.seenX = foe.x; me.seenY = foe.y; me.lost = 0; } else me.lost += DT;
    const view = me.lost > 0 ? { ...foe, x: me.seenX, y: me.seenY } : foe;
    const g = brain(b, me, view);
    // lost them and reached the spot it last saw them: look around (towards them, slowly)
    const searching = me.lost > 0 && Math.hypot(me.seenX - me.x, me.seenY - me.y) < 8;
    const look = searching ? foe : view;
    const toLook = Math.atan2(look.y - me.y, look.x - me.x);
    const toGoal = Math.atan2(g.ty - me.y, g.tx - me.x);
    const goalDist = Math.hypot(g.tx - me.x, g.ty - me.y);
    const top = topSpeed(me);
    const turnMul = (me.recover > 0 ? 0.2 : 1) * (Math.abs(wrap(Math.atan2(foe.y - me.y, foe.x - me.x) - me.heading)) > SENSOR ? SEARCH_TURN : 1);
    let cmd: Cmd;
    if (g.face && canStrafe(me.build.drive) && !searching) {
      // strafe: nose on them, slide towards the goal (forwards, backwards or sideways)
      const diff = wrap(toLook - me.heading);
      const want = top * g.throttle * clamp(goalDist / 5, 0, 1);
      const rel = wrap(toGoal - me.heading);
      cmd = { fwd: clamp(Math.cos(rel) * want, -0.7 * top, top), side: Math.sin(rel) * want, turn: diff, turnMul };
      me.manoeuvre = Math.abs(Math.sin(rel)) > 0.5 && want > 2 ? 'strafe' : 'drive';
    } else if (g.reverse || g.face) {
      // back away, still facing them
      const diff = wrap(toLook - me.heading);
      const back = Math.cos(wrap(toGoal - me.heading));
      cmd = { fwd: top * g.throttle * Math.min(0, back) * 0.7, side: 0, turn: diff, turnMul };
      me.manoeuvre = 'drive';
    } else {
      const diff = wrap((searching ? toLook : toGoal) - me.heading);
      const align = Math.cos(diff);
      let fwd: number;
      switch (me.build.drive) {
        case 'tracks':
          // too far off line: stop dead and spin on the spot, then go
          if (me.manoeuvre === 'pivot' ? Math.abs(diff) > 0.2 : Math.abs(diff) > 0.65) { me.manoeuvre = 'pivot'; fwd = 0; }
          else { me.manoeuvre = 'drive'; fwd = top * g.throttle * Math.max(0.3, align); }
          break;
        case 'wheels':
          // can't turn standing still: keep rolling round an arc, or back up and swing the nose round
          if (me.manoeuvre === 'reverse-turn' ? Math.abs(diff) > 1.2 : Math.abs(diff) > 2.1 && goalDist < 22) { me.manoeuvre = 'reverse-turn'; fwd = -0.55 * top; }
          else { me.manoeuvre = 'drive'; fwd = top * Math.max(g.throttle, Math.abs(diff) > 0.15 ? 0.45 : 0) * Math.max(0.55, align); }
          break;
        case 'legs':
          // turns first (it's quick at that), then walks
          me.manoeuvre = Math.abs(diff) > 0.8 ? 'pivot' : 'drive';
          fwd = top * g.throttle * (align > 0 ? Math.max(0.1, align * align) : 0);
          break;
        default:
          me.manoeuvre = 'drive';
          fwd = top * g.throttle * (align > 0 ? Math.max(0.25, align) : 0.15);
      }
      cmd = { fwd, side: 0, turn: diff, turnMul };
    }
    driveStep(me, cmd);
    if (g.throttle > 0.9 && (me.mode === 'charge' || me.mode === 'pounce' || me.mode === 'strike' || me.mode === 'home fight' || me.mode === 'engage')) me.aggression += DT;
  }
  void D;
  // a claw holds its victim in place, right in front of it
  if (me.held > 0) {
    const fx = foe.x + Math.cos(foe.heading) * (BODIES[foe.build.body].radius + BODIES[me.build.body].radius + 1);
    const fy = foe.y + Math.sin(foe.heading) * (BODIES[foe.build.body].radius + BODIES[me.build.body].radius + 1);
    me.x += (fx - me.x) * 0.2; me.y += (fy - me.y) * 0.2;
  }
  me.x += (me.vx + me.kx) * DT;
  me.y += (me.vy + me.ky) * DT;
  // knockback dies away (faster with grip; ice barely slows a hover)
  const slide = me.zone === 'ice' ? 0.55 : 0.28;
  const k = Math.exp(-DT / (slide / D.grip));
  me.kx *= k; me.ky *= k;
  const r = BODIES[me.build.body].radius;
  if (me.x < r) { me.x = r; me.kx = Math.abs(me.kx) * 0.4; me.vx = Math.max(0, me.vx); me.speed *= 0.5; }
  if (me.x > ARENA - r) { me.x = ARENA - r; me.kx = -Math.abs(me.kx) * 0.4; me.vx = Math.min(0, me.vx); me.speed *= 0.5; }
  if (me.y < r) { me.y = r; me.ky = Math.abs(me.ky) * 0.4; me.vy = Math.max(0, me.vy); me.speed *= 0.5; }
  if (me.y > ARENA - r) { me.y = ARENA - r; me.ky = -Math.abs(me.ky) * 0.4; me.vy = Math.min(0, me.vy); me.speed *= 0.5; }
  const z = zoneAt(b.layout, me.x, me.y);
  if (z !== me.zone) { me.zone = z; b.events.push({ t: b.t, kind: 'zone', by: me.side, zone: z }); }
}

function collide(b: Battle) {
  const [p, q] = b.bots;
  const rp = BODIES[p.build.body].radius, rq = BODIES[q.build.body].radius;
  const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.001;
  const overlap = rp + rq - d;
  if (overlap <= 0) return;
  const mp = BODIES[p.build.body].mass * DRIVES[p.build.drive].grip, mq = BODIES[q.build.body].mass * DRIVES[q.build.drive].grip;
  const ux = dx / d, uy = dy / d;
  p.x -= ux * overlap * (mq / (mp + mq)); p.y -= uy * overlap * (mq / (mp + mq));
  q.x += ux * overlap * (mp / (mp + mq)); q.y += uy * overlap * (mp / (mp + mq));
  // a wedge driving in nose-first scoops the other one up and shoves it
  for (const [me, foe, s] of [[p, q, 1], [q, p, -1]] as const) {
    if (me.build.body !== 'wedge' || me.ram > 0 || me.stun > 0 || me.speed < 6) continue;
    const off = Math.abs(wrap(Math.atan2(uy * s, ux * s) - me.heading));
    if (off > 0.6) continue;
    const m = BODIES[foe.build.body].mass * DRIVES[foe.build.drive].grip;
    foe.kx += (ux * s * 18) / m; foe.ky += (uy * s * 18) / m;
    const dmg = 3;
    foe.hp = Math.max(0, foe.hp - dmg); me.dealt += dmg; me.ram = 1.2;
    b.events.push({ t: b.t, kind: 'ram', by: me.side, on: foe.side, dmg, x: (me.x + foe.x) / 2, y: (me.y + foe.y) / 2 });
  }
}

export function step(b: Battle) {
  if (b.over) return;
  b.t += DT;
  const [p, q] = b.bots;
  for (const me of b.bots) {
    me.cd = Math.max(0, me.cd - DT); me.stun = Math.max(0, me.stun - DT); me.flipped = Math.max(0, me.flipped - DT);
    me.held = Math.max(0, me.held - DT); me.recover = Math.max(0, me.recover - DT); me.ram = Math.max(0, me.ram - DT); me.swing += DT;
  }
  if (Math.round(b.t / DT) % 2) { move(b, p, q); move(b, q, p); } else { move(b, q, p); move(b, p, q); }
  collide(b);
  const sp = canStrike(p, q), sq = canStrike(q, p);
  if (sp) strike(b, p, q);
  if (sq) strike(b, q, p);
  for (const me of b.bots) {
    if (me.hp <= 0 && !b.over) {
      b.over = true; b.winner = me.side === 0 ? 1 : 0; b.reason = 'ko';
      b.events.push({ t: b.t, kind: 'ko', by: b.winner, on: me.side });
    }
  }
  if (!b.over && b.t >= TIME_LIMIT) {
    b.over = true;
    if (Math.abs(p.dealt - q.dealt) >= 0.05) { b.winner = p.dealt > q.dealt ? 0 : 1; b.reason = 'points'; }
    else { b.winner = p.aggression >= q.aggression ? 0 : 1; b.reason = 'judges'; }
    b.events.push({ t: b.t, kind: b.reason === 'points' ? 'time' : 'judges', by: b.winner });
  }
}

/** Fight to the end, headless. */
export function runBattle(b: Battle) { while (!b.over) step(b); return b; }
