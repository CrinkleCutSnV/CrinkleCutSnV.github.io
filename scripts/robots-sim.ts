// Robot Rumble: headless balance checks. `npm run check:robots`
import { createBattle, runBattle, driveStep, topSpeed, ZONE_IDS, DT, randomBuild, rng, PART_IDS, PARTS, WEAPONS, DRIVES, TIME_LIMIT, matchup, type Build, type Layout, type ZoneId, type PartKind } from '../src/scripts/robot-wars/sim';

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const N = Number(process.env.ROBOT_N ?? 160); // fights per build
const r = rng(20261029);
let seed = 1;

/** One fight from `a`'s point of view, on a random side. */
function fight(a: Build, b: Build, layout?: Layout) {
  const left = r() < 0.5;
  const bt = runBattle(left ? createBattle({ name: 'A', build: a }, { name: 'B', build: b }, seed++, layout) : createBattle({ name: 'B', build: b }, { name: 'A', build: a }, seed++, layout));
  return { won: bt.winner === (left ? 0 : 1), bt, left };
}

// --- the drives really handle differently (measured from the sim's own drive model, on medium ground) ---
function probe(drive: Build['drive']) {
  const D = DRIVES[drive];
  const z = ZONE_IDS.find((q) => q !== D.fast && q !== D.slow && q !== 'ice')!;
  const fresh = () => createBattle({ name: 'P', build: { drive, weapon: 'hammer', body: 'wedge', brain: 'aggressive' } }, { name: 'Q', build: { drive, weapon: 'hammer', body: 'wedge', brain: 'aggressive' } }, 1, [z, z, z, z]).bots[0];
  type B = ReturnType<typeof fresh>;
  const ang = (a: number) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
  const tick = (me: B, c: Parameters<typeof driveStep>[1]) => { driveStep(me, c); me.x += me.vx * DT; me.y += me.vy * DT; };
  const run = (me: B, s: number, c: Parameters<typeof driveStep>[1]) => { for (let i = 0; i < s / DT; i++) tick(me, c); };
  // on the spot: from standing, full turn for 1 s
  let me = fresh(); let h0 = me.heading; run(me, 1, { fwd: 0, side: 0, turn: 9 });
  const spot = ang(me.heading - h0);
  // flat out in a straight line
  me = fresh(); run(me, 3, { fwd: topSpeed(me), side: 0, turn: 0 });
  const straight = Math.hypot(me.vx, me.vy);
  // turning circle: flat out, hard over
  let turned = 0, path = 0, slip = 0;
  for (let i = 0; i < 2 / DT; i++) { h0 = me.heading; const x0 = me.x, y0 = me.y; tick(me, { fwd: topSpeed(me), side: 0, turn: 9 }); turned += ang(me.heading - h0); path += Math.hypot(me.x - x0, me.y - y0); slip += ang(Math.atan2(me.vy, me.vx) - me.heading) * DT / 2; }
  const circle = (2 * path) / Math.max(turned, 1e-6); // diameter, units
  // strafe: sideways from standing for 1 s, and how quickly it gets going (time to 80% of its strafe speed)
  me = fresh(); let t80 = 9, side = 0;
  for (let i = 1; i <= 1 / DT; i++) { tick(me, { fwd: 0, side: 99, turn: 0 }); side = Math.hypot(me.vx, me.vy); if (t80 > 8 && D.strafe > 0 && side >= 0.8 * D.strafe * 0.95) t80 = i * DT; }
  return { spot, straight, circle, strafe: side, t80, slip };
}
const P = Object.fromEntries(PART_IDS.drive.map((d) => [d, probe(d)])) as Record<Build['drive'], ReturnType<typeof probe>>;
for (const d of PART_IDS.drive) { const p = P[d]; console.log(`  ${d.padEnd(6)} straight ${p.straight.toFixed(1)} u/s · on-the-spot turn ${((p.spot * 180) / Math.PI).toFixed(0)}°/s · turning circle ${p.circle.toFixed(1)} u flat out · strafe ${p.strafe.toFixed(1)} u/s${p.strafe > 0 ? ` (80% in ${p.t80.toFixed(2)} s)` : ''}  · slides ${((p.slip * 180) / Math.PI).toFixed(0)}° wide in a hard turn`); }
check(P.wheels.spot < 0.01, 'wheels can’t turn on the spot');
check(P.tracks.spot > 1.8 && P.legs.spot > P.tracks.spot && P.hover.spot > 0.4 && P.hover.spot < P.tracks.spot * 0.7, 'legs spin on the spot fastest, then tracks; hover turns on the spot, but slowly');
check(P.tracks.circle > 2.5 * P.wheels.circle && P.tracks.circle > 2 * P.hover.circle, `tracks turn in wide arcs on the move (circle ${P.tracks.circle.toFixed(0)} u vs wheels ${P.wheels.circle.toFixed(0)} u)`);
check(P.legs.circle < 0.7 * P.wheels.circle && P.wheels.circle < P.hover.circle, 'legs turn tightest on the move, then wheels, then hover');
check(P.tracks.straight > Math.max(P.wheels.straight, P.hover.straight, P.legs.straight) && P.legs.straight < 0.85 * Math.min(P.wheels.straight, P.tracks.straight, P.hover.straight), 'tracks are fastest in a straight line, legs clearly slowest');
check(P.wheels.straight > P.hover.straight, 'wheels are quick in a straight line (faster than hover)');
check(P.tracks.strafe < 0.01 && P.wheels.strafe < 0.01 && P.legs.strafe > 5 && P.hover.strafe > 5, 'only legs and hover can strafe');
check(P.legs.t80 < 0.5 * P.hover.t80, `legs side-step crisply (${P.legs.t80.toFixed(2)} s to get going), hover slides into it (${P.hover.t80.toFixed(2)} s)`);
check(P.hover.slip > 2.5 * Math.max(P.wheels.slip, P.tracks.slip, P.legs.slip) && P.hover.slip > 0.2, `hover drifts on its momentum far more than the others (slides ${((P.hover.slip * 180) / Math.PI).toFixed(0)}° wide in a hard turn)`);
if (process.env.ROBOT_DRIVES_ONLY) { console.log(failures ? `\n${failures} failure(s)` : '\ndrive checks pass'); process.exit(failures ? 1 : 0); }

const all: Build[] = [];
for (const drive of PART_IDS.drive) for (const weapon of PART_IDS.weapon) for (const body of PART_IDS.body) for (const brain of PART_IDS.brain) all.push({ drive, weapon, body, brain });

// --- every build against random opponents ---
const t0 = Date.now();
const rate = new Map<string, number>();
const half = new Map<string, [number, number]>(); // wins in the first and second half of each build's fights
const part: Record<string, { w: number; n: number }> = {};
let ko = 0, judged = 0, fights = 0, dur = 0, leftWins = 0;
for (const a of all) {
  let w = 0;
  for (let i = 0; i < N; i++) {
    const { won, bt, left } = fight(a, randomBuild(r));
    fights++; dur += bt.t;
    if (bt.reason === 'ko') ko++;
    if (bt.reason === 'judges') judged++;
    if (bt.winner === 0) leftWins++;
    if (won) w++;
    void left;
    if (i === N / 2 - 1) half.set(`${a.drive}/${a.weapon}/${a.body}/${a.brain}`, [w, 0]);
  }
  { const k = `${a.drive}/${a.weapon}/${a.body}/${a.brain}`; const h = half.get(k)!; h[1] = w - h[0]; }
  const key = `${a.drive}/${a.weapon}/${a.body}/${a.brain}`;
  rate.set(key, w / N);
  for (const k of Object.keys(a) as PartKind[]) { const id = `${k}:${a[k]}`; part[id] ??= { w: 0, n: 0 }; part[id].w += w; part[id].n += N; }
}
const sorted = [...rate.entries()].sort((x, y) => y[1] - x[1]);
const q = (p: number) => sorted[Math.floor((1 - p) * (sorted.length - 1))][1];
console.log(`${fights} fights in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log(`best builds:  ${sorted.slice(0, 5).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
console.log(`worst builds: ${sorted.slice(-3).map(([k, v]) => `${k} ${pct(v)}`).join(', ')}`);
console.log(`build win rates: median ${pct(q(0.5))}, 75th percentile ${pct(q(0.75))}, 90th ${pct(q(0.9))}`);
for (const k of Object.keys(PARTS) as PartKind[]) console.log(`  ${k.padEnd(7)} ${PART_IDS[k].map((id) => `${id} ${pct(part[`${k}:${id}`].w / part[`${k}:${id}`].n)}`).join('  ')}`);
console.log(`knockouts ${pct(ko / fights)}, on points ${pct((fights - ko - judged) / fights)}, judges ${pct(judged / fights)}; average fight ${(dur / fights).toFixed(1)} s; left side wins ${pct(leftWins / fights)}`);

check(sorted[0][1] < 0.8, `no build dominates: the best wins ${pct(sorted[0][1])} (< 80%)`);
check(sorted[sorted.length - 1][1] > 0.15, `no build is hopeless: the worst wins ${pct(sorted[sorted.length - 1][1])} (> 15%)`);
for (const k of Object.keys(PARTS) as PartKind[]) {
  const rs = PART_IDS[k].map((id) => part[`${k}:${id}`].w / part[`${k}:${id}`].n);
  check(Math.max(...rs) - Math.min(...rs) < 0.2, `every ${k} is viable: spread ${pct(Math.max(...rs) - Math.min(...rs))} (< 20 points)`);
}
check(ko / fights > 0.6, `most fights end in a knockout inside ${TIME_LIMIT} s (${pct(ko / fights)})`);
check(judged / fights < 0.02, `hardly any need the judges (${pct(judged / fights)})`);
check(Math.abs(leftWins / fights - 0.5) < 0.03, `starting side doesn't matter (${pct(leftWins / fights)})`);
// "sensible" = the top quarter of builds. Pick them on one half of the fights and score them on the other,
// so lucky streaks in the ranking don't flatter them.
const byFirst = [...half.entries()].sort((x, y) => y[1][0] - x[1][0]);
const top = byFirst.slice(0, 64);
const sensible = top.reduce((t, [, h]) => t + h[1], 0) / (64 * (N / 2));
const bestTrue = byFirst[0][1][1] / (N / 2);
check(sensible >= 0.5 && sensible <= 0.7, `a sensible build (top quarter, scored on fresh fights) wins its first fight ${pct(sensible)} (50–70%)`);
console.log(`  the top-ranked build (${byFirst[0][0]}) wins ${pct(bestTrue)} on fresh fights`);
console.log(`  so a gold streak (3 wins in a row) comes round in about ${pct(sensible ** 3)} of runs with a sensible build`);

// --- weapon vs body matchups: same everything else, strong body vs weak body ---
const M = 1500;
for (const w of PART_IDS.weapon) {
  const W = WEAPONS[w];
  let ws = 0, ww = 0;
  for (let i = 0; i < M; i++) {
    const a = { ...randomBuild(r), weapon: w };
    const b = randomBuild(r);
    if (fight(a, { ...b, body: W.strong }).won) ws++;
    if (fight(a, { ...b, body: W.weak }).won) ww++;
  }
  const gap = (ws - ww) / M;
  check(gap > 0.15, `${W.name} vs ${W.strong} wins ${pct(ws / M)}, vs ${W.weak} ${pct(ww / M)}: matchup matters (${(gap * 100).toFixed(0)} points)`);
}
// sanity: matchup table is a proper cycle
check(PART_IDS.body.every((b) => PART_IDS.weapon.filter((w) => matchup(w, b) === 'strong').length === 1 && PART_IDS.weapon.filter((w) => matchup(w, b) === 'weak').length === 1), 'each body has exactly one weapon it fears and one it shrugs off');

// --- terrain: the same drive in an arena all of its fast ground vs all of its slow ground ---
const flat = (z: ZoneId): Layout => [z, z, z, z];
for (const d of PART_IDS.drive) {
  const D = DRIVES[d];
  let wf = 0, wsl = 0;
  for (let i = 0; i < M; i++) {
    const a = { ...randomBuild(r), drive: d };
    let b = randomBuild(r); while (b.drive === d) b = randomBuild(r);
    if (fight(a, b, flat(D.fast)).won) wf++;
    if (fight(a, b, flat(D.slow)).won) wsl++;
  }
  const gap = (wf - wsl) / M;
  check(gap > 0.15, `${D.name} on all-${D.fast} wins ${pct(wf / M)}, on all-${D.slow} ${pct(wsl / M)}: terrain matters (${(gap * 100).toFixed(0)} points)`);
}

// --- hits from behind: flankers land far more of them than the other computers ---
const dirs = (brain: Build['brain'] | null) => {
  let rear = 0, side = 0, n = 0;
  for (let i = 0; i < 800; i++) {
    let a = randomBuild(r); if (brain) a = { ...a, brain }; else while (a.brain === 'flanker') a = randomBuild(r);
    const { bt, left } = fight(a, randomBuild(r));
    for (const e of bt.events) if (e.kind === 'hit' && e.by === (left ? 0 : 1)) { n++; if (e.dir === 'rear') rear++; else if (e.dir === 'side') side++; }
  }
  return { rear: rear / n, side: side / n };
};
const fl = dirs('flanker'), other = dirs(null);
console.log(`flankers: ${pct(fl.rear)} of hits from behind, ${pct(fl.side)} from the side; other computers: ${pct(other.rear)} and ${pct(other.side)}`);
check(fl.rear > 1.4 * other.rear, 'flankers land at least 1.4× as many hits from behind as the other computers');
check(fl.rear + fl.side > 1.1 * (other.rear + other.side), 'and more hits off the front (side or behind) overall');

console.log(failures ? `\n${failures} failure(s)` : '\nall robot checks pass');
process.exit(failures ? 1 : 0);
