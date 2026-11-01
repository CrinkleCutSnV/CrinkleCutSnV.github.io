// Robot Rumble Melee: five robots, one arena, last one standing. It runs on the duel's own robots:
// the same drives, weapons, bodies, zones and computers (from ./sim); this file only adds who goes for whom,
// the five-way bumping, the knockouts and the final placings.
import {
  BODIES, DT, WEAPONS, SPEED, matchMul, matchup, randomBuild, randomLayout, randomName, rng, terrain, zoneAt,
  makeBot, move, canStrike, strike, collidePair, tick,
  type Battle, type Bot, type Build, type Layout,
} from './sim';

export const MELEE_SIZE = 130; // units square: roomier than the duel's 100
export const MELEE_LIMIT = 100; // s
export const MELEE_BOTS = 5;
/** How often each computer thinks again about whom to go for (s), and how much it prefers to stick with its pick. */
export const RETHINK = 0.5;
export const STICK = 14;
/** Each other robot already going for someone makes them that much less attractive: so nobody gets mobbed. */
export const CROWD = 18;
/** Someone who's just hit me (within this many s) is worth a grudge. */
export const GRUDGE = 2.5;

export interface Entrant { name: string; build: Build }
export interface Standing { side: number; place: number; kos: number; dealt: number; hits: number; hp: number; maxHp: number; t: number /* when it went out (or the end) */ }
export interface Melee extends Battle {
  target: number[]; // whom each robot is going for (−1 = nobody yet)
  rethink: number[]; // s until it thinks again
  place: number[]; // 0 = still in
  kos: number[];
  outAt: number[];
  wreck: { x: number; y: number }[]; // where each knocked-out robot is being dragged to
  standings: Standing[] | null; // filled in at the end, 1st first
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const dist = (a: Bot, b: Bot) => Math.hypot(b.x - a.x, b.y - a.y);
export const alive = (m: Melee) => m.bots.filter((b) => m.place[b.side] === 0);

/** Five robots round a circle, facing the middle. Robot 0 is you (in a random spot on the circle). */
export function createMelee(entrants: Entrant[], seed: number, layout?: Layout): Melee {
  const r = rng(seed);
  const L = layout ?? randomLayout(r);
  const S = MELEE_SIZE, n = entrants.length;
  const spin = r() * Math.PI * 2;
  const bots = entrants.map((e, i) => {
    const a = spin + (i * 2 * Math.PI) / n;
    const b = makeBot(i, e.name, e.build, L);
    b.x = S / 2 + Math.cos(a) * S * 0.36; b.y = S / 2 + Math.sin(a) * S * 0.36;
    b.heading = wrap(a + Math.PI); b.seenX = S / 2; b.seenY = S / 2;
    b.orbit = i % 2 ? 1 : -1;
    b.zone = zoneAt(L, b.x, b.y, S);
    return b;
  });
  return {
    t: 0, bots, layout: L, size: S, limit: MELEE_LIMIT, r, events: [{ t: 0, kind: 'start', by: 0, left: n }], over: false, winner: null, reason: null,
    target: bots.map(() => -1), rethink: bots.map((_, i) => (i * RETHINK) / n), place: bots.map(() => 0), kos: bots.map(() => 0), outAt: bots.map(() => 0),
    wreck: bots.map(() => ({ x: 0, y: 0 })), standings: null,
  };
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
  const d = dist(me, o);
  const crowd = m.bots.filter((x) => x !== me && m.place[x.side] === 0 && m.target[x.side] === o.side).length;
  let s = -CROWD * crowd - (crowd >= 2 ? CROWD : 0);
  if (m.target[me.side] === o.side) s += STICK;
  const grudge = me.lastBy === o.side && m.t - (me.lastByT ?? -99) < GRUDGE;
  const theirs = m.target[o.side];
  const busy = theirs >= 0 && theirs !== me.side && m.place[theirs] === 0 && dist(o, m.bots[theirs]) < 30;
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
      const z = zoneAt(m.layout, o.x, o.y, m.size);
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
  if (canStrike(me, foe)) return foe;
  let best: Bot | null = null, bd = Infinity;
  for (const o of m.bots) {
    if (o === me || o === foe || m.place[o.side] !== 0) continue;
    const W = WEAPONS[me.build.weapon];
    const reach = W.reach + BODIES[me.build.body].radius + BODIES[o.build.body].radius;
    const d = dist(me, o);
    if (d > reach || d >= bd || !canStrike(me, o)) continue;
    best = o; bd = d;
  }
  return best;
}

export function stepMelee(m: Melee) {
  if (m.over) return;
  m.t += DT;
  const live = alive(m);
  for (const me of live) tick(me);
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
    move(m, me, m.bots[m.target[me.side]]);
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) collidePair(m, live[i], live[j]);
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
    // to the nearest wall
    const opts = [{ x: r, y: v.y, d: v.x }, { x: S - r, y: v.y, d: S - v.x }, { x: v.x, y: r, d: v.y }, { x: v.x, y: S - r, d: S - v.y }];
    const w = opts.sort((a, b) => a.d - b.d)[0];
    m.wreck[v.side] = { x: Math.min(S - r, Math.max(r, w.x)), y: Math.min(S - r, Math.max(r, w.y)) };
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
export const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
