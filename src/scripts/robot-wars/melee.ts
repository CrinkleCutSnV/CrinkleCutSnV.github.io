// Robot Rumble Melee: five robots, one arena, last one standing. It runs on the duel's own robots:
// the same drives, weapons, bodies, zones and computers (from ./sim); this file only adds who goes for whom,
// the five-way bumping, the knockouts and the final placings.
import {
  BODIES, DRIVES, DT, WEAPONS, SPEED, matchMul, matchup, randomBuild, randomLayout, randomName, rng, terrain,
  makeBot, move, canStrike, strike, collidePair, tick,
  type Battle, type Bot, type Build, type Layout,
} from './sim';
import { MAP_SIZE, spawn, ENTRANCES, groundAt, isOpen, lineOfSight, nearestWall, pathDist, solidify, waypoint } from './map';

export const MELEE_SIZE = MAP_SIZE; // units square: the big walled map (./map)
export const MELEE_LIMIT = 130; // s
export const MELEE_BOTS = 5;
/** How often each computer thinks again about whom to go for (s), and how much it prefers to stick with its pick. */
export const RETHINK = 0.5;
export const STICK = 14;
/** Each other robot already going for someone makes them that much less attractive: so nobody gets mobbed. */
export const CROWD = 18;
/** Someone who's just hit me (within this many s) is worth a grudge. */
export const GRUDGE = 2.5;
/** Slammed into a wall faster than this (units/s of knockback) hurts: a little, up to WALL_MAX. */
export const WALL_HURT = 9;
export const WALL_MAX = 8;
/** Lost sight of its target for this long (s): it has a fair idea where they've gone and goes looking. */
export const HUNT = 1.2;

export interface Entrant { name: string; build: Build }
export interface Standing { side: number; place: number; kos: number; dealt: number; hits: number; hp: number; maxHp: number; t: number /* when it went out (or the end) */ }
export interface Melee extends Battle {
  target: number[]; // whom each robot is going for (−1 = nobody yet)
  rethink: number[]; // s until it thinks again
  place: number[]; // 0 = still in
  kos: number[];
  outAt: number[];
  wreck: { x: number; y: number }[]; // where each knocked-out robot is being dragged to
  wallCd: number[]; // s until a wall can hurt it again
  path: { t: number; gx: number; gy: number; x: number; y: number; direct: boolean }[]; // each robot's last route
  flank: { t: number; on: number; x: number; y: number; ok: boolean }[]; // a flanker's chosen spot behind its target (kept a while)
  stall: { t: number; x: number; y: number; until: number }[]; // dithering on the spot? then just go for it for a bit
  standings: Standing[] | null; // filled in at the end, 1st first
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Bot, b: Bot) => Math.hypot(b.x - a.x, b.y - a.y);
export const alive = (m: Melee) => m.bots.filter((b) => m.place[b.side] === 0);

/** Five robots spread evenly round the map (turned at random every melee, so nobody's spot is better), facing the middle. */
export function createMelee(entrants: Entrant[], seed: number, layout?: Layout): Melee {
  const r = rng(seed);
  const L = layout ?? randomLayout(r);
  const S = MELEE_SIZE, n = entrants.length;
  const spin = r() * Math.PI * 2;
  const bots = entrants.map((e, i) => {
    const b = makeBot(i, e.name, e.build, L);
    const p = spawn(i, n, spin);
    b.x = p.x; b.y = p.y;
    b.heading = Math.atan2(S / 2 - p.y, S / 2 - p.x); b.seenX = S / 2; b.seenY = S / 2;
    b.orbit = i % 2 ? 1 : -1;
    b.zone = groundAt(L, b.x, b.y);
    return b;
  });
  const m: Melee = {
    t: 0, bots, layout: L, size: S, limit: MELEE_LIMIT, r, events: [{ t: 0, kind: 'start', by: 0, left: n }], over: false, winner: null, reason: null,
    target: bots.map(() => -1), rethink: bots.map((_, i) => (i * RETHINK) / n), place: bots.map(() => 0), kos: bots.map(() => 0), outAt: bots.map(() => 0),
    wreck: bots.map(() => ({ x: 0, y: 0 })), standings: null, wallCd: bots.map(() => 0), path: bots.map(() => ({ t: -9, gx: 0, gy: 0, x: 0, y: 0, direct: true })),
    flank: bots.map(() => ({ t: -9, on: -1, x: 0, y: 0, ok: false })), stall: bots.map((b) => ({ t: 0, x: b.x, y: b.y, until: -1 })),
  };
  // ---- the map's rules, plugged into the shared robot code ----
  m.ground = (x, y) => groundAt(L, x, y);
  m.sees = (a, b) => lineOfSight(a, b);
  m.solid = (me) => {
    const impact = solidify(me);
    if (impact <= WALL_HURT || m.wallCd[me.side] > 0 || m.place[me.side] !== 0) return;
    const dmg = Math.round(Math.min(WALL_MAX, 1 + (impact - WALL_HURT) * 0.3) * 10) / 10;
    me.hp = Math.max(0, me.hp - dmg);
    me.stun = Math.max(me.stun, 0.2);
    m.wallCd[me.side] = 0.5;
    // whoever sent it flying gets the credit
    const by = me.lastBy !== undefined && me.lastBy !== me.side && m.t - (me.lastByT ?? -99) < 1.5 ? me.lastBy : -1;
    if (by >= 0) m.bots[by].dealt += dmg;
    m.events.push({ t: m.t, kind: 'wall', by, on: me.side, dmg, x: me.x, y: me.y });
  };
  m.route = (me, g, foe) => {
    // with five robots about, there's always someone to look for: anyone on the move turns at full rate
    g.nav = true;
    // stuck dithering between two plans (pivoting one way, then the other)? Forget the plan and go straight for them
    const st = m.stall[me.side];
    if (m.t - st.t >= 1.5) {
      if (Math.hypot(me.x - st.x, me.y - st.y) < 1.5 && Math.hypot(foe.x - me.x, foe.y - me.y) > 16) st.until = m.t + 2;
      st.t = m.t; st.x = me.x; st.y = me.y;
    }
    if (m.t < st.until) { g.tx = foe.x; g.ty = foe.y; g.throttle = Math.max(g.throttle, 0.75); g.face = false; g.reverse = false; }
    // a flanker that can't see its target goes the long way round, to come at it from behind (picking its spot
    // and sticking with it for a second or so, so it doesn't swing back and forth as its target turns)
    else if (me.build.brain === 'flanker' && !lineOfSight(me, foe)) {
      const f = m.flank[me.side];
      if (m.t - f.t > 1.5 || f.on !== foe.side) {
        const bx = foe.x - Math.cos(foe.heading) * 14, by = foe.y - Math.sin(foe.heading) * 14;
        m.flank[me.side] = { t: m.t, on: foe.side, x: bx, y: by, ok: isOpen(bx, by) };
      }
      const k = m.flank[me.side];
      if (k.ok) { g.tx = k.x; g.ty = k.y; }
    }
    const c = m.path[me.side];
    if (m.t - c.t > 0.1 || Math.abs(c.gx - g.tx) > 3 || Math.abs(c.gy - g.ty) > 3) {
      const w = waypoint(me.x, me.y, g.tx, g.ty, BODIES[me.build.body].radius);
      m.path[me.side] = { t: m.t, gx: g.tx, gy: g.ty, ...w };
    }
    const w = m.path[me.side];
    if (w.direct) return;
    g.tx = w.x; g.ty = w.y; g.face = false; g.reverse = false; g.throttle = Math.max(g.throttle, 0.75);
    me.mode = me.mode === 'round the back' || me.build.brain === 'flanker' ? 'sneak round' : 'find a way';
  };
  // a tactician lies in wait just inside the way into its best zone that its target is likeliest to use
  m.ambush = (me, z, foe) => {
    const q = L.indexOf(z);
    let best = ENTRANCES[q][0], bd = Infinity;
    for (const e of ENTRANCES[q]) { const d = pathDist(foe.x, foe.y, e.x, e.y); if (d < bd) { bd = d; best = e; } }
    return best;
  };
  // a hammer blow knocks them back a bit too: into a wall, ideally
  m.onHit = (me, foe, fx) => {
    if (me.build.weapon !== 'hammer') return;
    const d = Math.hypot(foe.x - me.x, foe.y - me.y) || 1;
    const mass = BODIES[foe.build.body].mass * DRIVES[foe.build.drive].grip;
    foe.kx += ((foe.x - me.x) / d) * 16 * fx / mass; foe.ky += ((foe.y - me.y) / d) * 16 * fx / mass;
  };
  return m;
}

/** Random challengers with silly names, none of them called what you are. */
export function challengers(r: () => number, you: string, n = MELEE_BOTS - 1): Entrant[] {
  const names = new Set([you]);
  const out: Entrant[] = [];
  while (out.length < n) {
    const name = randomName(r);
    if (names.has(name)) continue;
    names.add(name);
    out.push({ name, build: randomBuild(r) });
  }
  return out;
}

// ---- who to go for -------------------------------------------------------------------------
/** How much `me` fancies going for `o` right now (higher = more). Each computer has its own taste. */
export function appeal(m: Melee, me: Bot, o: Bot): number {
  const d = pathDist(me.x, me.y, o.x, o.y); // the way round the walls, not as the crow flies
  const crowd = m.bots.filter((x) => x !== me && m.place[x.side] === 0 && m.target[x.side] === o.side).length;
  let s = -CROWD * crowd - (crowd >= 2 ? CROWD : 0);
  if (m.target[me.side] === o.side) s += STICK;
  const grudge = me.lastBy === o.side && m.t - (me.lastByT ?? -99) < GRUDGE;
  const theirs = m.target[o.side];
  const busy = theirs >= 0 && theirs !== me.side && m.place[theirs] === 0 && dist(o, m.bots[theirs]) < 30 && lineOfSight(o, m.bots[theirs]);
  const facingAway = Math.abs(wrap(Math.atan2(me.y - o.y, me.x - o.x) - o.heading)) > 1.6;
  const health = o.hp / o.maxHp;
  switch (me.build.brain) {
    case 'aggressive':
      // the nearest one, and anyone who's just had a go at it
      s += -d + (grudge ? 20 : 0);
      break;
    case 'conservative':
      // picks off the weakest: whoever's hurt, ideally while they're tied up with someone else
      s += -55 * health - 0.35 * d + (busy ? 12 : 0) + (grudge && d < 20 ? 10 : 0);
      break;
    case 'flanker':
      // whoever's busy with someone else, or has its back turned
      s += -0.6 * d + (busy ? 26 : 0) + (facingAway ? 18 : 0) + (grudge && d < 15 ? 8 : 0);
      break;
    case 'tactician': {
      // the best matchup: my weapon vs their body, their weapon vs mine, and the ground they're on
      const mine = matchMul(matchup(me.build.weapon, o.build.body)), theirsM = matchMul(matchup(o.build.weapon, me.build.body));
      const z = groundAt(m.layout, o.x, o.y);
      const ground = SPEED[terrain(me.build.drive, z)] / SPEED[terrain(o.build.drive, z)];
      s += 28 * mine - 16 * theirsM + 14 * ground - 0.45 * d + (grudge ? 8 : 0);
      break;
    }
  }
  return s;
}
function choose(m: Melee, me: Bot) {
  let best = -1, score = -Infinity;
  for (const o of m.bots) {
    if (o === me || m.place[o.side] !== 0) continue;
    const s = appeal(m, me, o);
    if (s > score) { score = s; best = o.side; }
  }
  if (best !== m.target[me.side] && best >= 0) {
    const o = m.bots[best];
    me.seenX = o.x; me.seenY = o.y; me.lost = 0; me.wait = Math.min(me.wait, 2);
  }
  m.target[me.side] = best;
}

// ---- the step ------------------------------------------------------------------------------
/** Anything else in reach and in front of it: in a melee you hit whoever's there. */
function victim(m: Melee, me: Bot, foe: Bot): Bot | null {
  if (canStrike(me, foe) && lineOfSight(me, foe)) return foe;
  let best: Bot | null = null, bd = Infinity;
  for (const o of m.bots) {
    if (o === me || o === foe || m.place[o.side] !== 0) continue;
    const W = WEAPONS[me.build.weapon];
    const reach = W.reach + BODIES[me.build.body].radius + BODIES[o.build.body].radius;
    const d = dist(me, o);
    if (d > reach || d >= bd || !canStrike(me, o) || !lineOfSight(me, o)) continue;
    best = o; bd = d;
  }
  return best;
}

export function stepMelee(m: Melee) {
  if (m.over) return;
  m.t += DT;
  const live = alive(m);
  for (const me of live) { tick(me); m.wallCd[me.side] = Math.max(0, m.wallCd[me.side] - DT); }
  // the knocked-out ones get dragged to the nearest wall, out of the way
  for (const w of m.bots) {
    if (m.place[w.side] === 0) continue;
    const g = m.wreck[w.side], dx = g.x - w.x, dy = g.y - w.y, d = Math.hypot(dx, dy);
    if (d > 0.05) { const v = Math.min(d, 9 * DT * Math.min(1, (m.t - m.outAt[w.side]) / 0.8)); w.x += (dx / d) * v; w.y += (dy / d) * v; }
    w.speed = 0; w.vs = 0; w.vx = 0; w.vy = 0; w.omega = 0; w.kx = 0; w.ky = 0; w.swing += DT;
  }
  for (const me of live) {
    m.rethink[me.side] -= DT;
    const cur = m.target[me.side];
    if (m.rethink[me.side] <= 0 || cur < 0 || m.place[cur] !== 0) { choose(m, me); m.rethink[me.side] += RETHINK; if (m.rethink[me.side] <= 0) m.rethink[me.side] = RETHINK; }
  }
  // take turns going first, as in the duel
  const off = Math.round(m.t / DT) % live.length;
  for (let i = 0; i < live.length; i++) {
    const me = live[(i + off) % live.length];
    const foe = m.bots[m.target[me.side]];
    // out of sight for a while: it hears where they've gone and goes looking (round the walls)
    if (me.lost > HUNT) { me.seenX = foe.x; me.seenY = foe.y; }
    move(m, me, foe);
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) collidePair(m, live[i], live[j]);
  for (const me of live) m.solid!(me); // bumped into a wall by someone else
  const swings = live.map((me) => [me, victim(m, me, m.bots[m.target[me.side]])] as const);
  for (const [me, foe] of swings) if (foe) strike(m, me, foe);
  // knockouts: the first one out finishes last
  const down = live.filter((b) => b.hp <= 0).sort((a, b) => a.hp - b.hp || a.dealt - b.dealt);
  let left = live.length;
  for (const v of down) {
    m.place[v.side] = left; m.outAt[v.side] = m.t;
    left--;
    const by = v.lastBy !== undefined && v.lastBy !== v.side ? v.lastBy : -1;
    if (by >= 0) m.kos[by]++;
    const r = BODIES[v.build.body].radius + 0.6, S = m.size;
    // to the nearest wall (or pillar), out of the way
    const w = nearestWall(v.x, v.y);
    m.wreck[v.side] = { x: Math.min(S - r, Math.max(r, w.qx + w.nx * r)), y: Math.min(S - r, Math.max(r, w.qy + w.ny * r)) };
    m.events.push({ t: m.t, kind: 'ko', by, on: v.side, left, x: v.x, y: v.y });
  }
  if (left <= 1) return finishMelee(m, 'ko');
  if (m.t >= m.limit) finishMelee(m, 'points');
}

function finishMelee(m: Melee, reason: 'ko' | 'points') {
  // survivors by health left (as a share, so a tough box doesn't win just for being big), then damage dealt
  const live = alive(m).sort((a, b) => b.hp / b.maxHp - a.hp / a.maxHp || b.dealt - a.dealt);
  live.forEach((b, i) => { m.place[b.side] = i + 1; m.outAt[b.side] = m.t; });
  m.over = true; m.reason = reason;
  m.winner = live[0]?.side ?? null;
  if (reason === 'points') m.events.push({ t: m.t, kind: 'time', by: m.winner ?? -1, left: live.length });
  m.events.push({ t: m.t, kind: 'winner', by: m.winner ?? -1, left: live.length });
  m.standings = m.bots.map((b) => ({ side: b.side, place: m.place[b.side], kos: m.kos[b.side], dealt: b.dealt, hits: b.hits, hp: b.hp, maxHp: b.maxHp, t: m.outAt[b.side] }))
    .sort((a, b) => a.place - b.place);
}

/** Fight to the end, headless. */
export function runMelee(m: Melee) { while (!m.over) stepMelee(m); return m; }

/** For the end card: 1st, 2nd, 3rd… */
export { ordinal } from '../../data/medals';
