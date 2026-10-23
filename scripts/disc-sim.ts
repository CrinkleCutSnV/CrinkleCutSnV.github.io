// Headless checks for Arcade Disc Golf. Run with `npm run check:disc`.
import {
  DRIVER, HOLES, PUTTER, bearing, launch, step, discFor, distTo, simulate, surfaceAt, type Hole, type Throw, type Vec,
} from '../src/scripts/disc-golf/physics';

const hole = HOLES[0];
const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };

const toBasket = bearing(hole.tee, hole.basket);
console.log(`Hole 1 "${hole.name}", par ${hole.par}: tee to basket ${distTo(hole.tee, hole.basket).toFixed(1)} m as the crow flies, bearing ${deg(toBasket).toFixed(0)}°`);

// reach on open ground (straight up the left, away from trees)
for (const kind of [DRIVER, PUTTER]) {
  for (const p of [0.25, 0.5, 0.75, 1]) {
    const r = simulate({ ...hole, trees: [], bounds: { minX: -1e3, maxX: 1e3, minY: -1e3, maxY: 1e3 } }, { x: 0, y: 0 }, { aim: -Math.PI / 2, power: p, curve: 0, kind });
    console.log(`  ${kind.name.padEnd(6)} power ${(p * 100).toFixed(0).padStart(3)}%: ${(-r.disc.y).toFixed(1).padStart(5)} m in ${r.time.toFixed(1)} s`);
  }
}

// 1. the straight line is blocked by the oak
{
  const r = simulate(hole, hole.tee, { aim: toBasket, power: 1, curve: 0, kind: DRIVER });
  check(r.events.includes('tree') && !r.holed, `straight full-power drive at the basket hits the oak (stopped ${distTo(r.disc, hole.basket).toFixed(1)} m short)`);
}

// 2. search the tee shot space
type Res = { th: Throw; left: number; holed: boolean; surf: string };
const results: Res[] = [];
for (let a = -60; a <= 60; a += 2) {
  for (let p = 0.3; p <= 1.0001; p += 0.025) {
    for (let c = -1; c <= 1.0001; c += 0.1) {
      const th = { aim: toBasket + rad(a), power: p, curve: c, kind: DRIVER };
      const r = simulate(hole, hole.tee, th);
      results.push({ th, left: distTo(r.disc, hole.basket), holed: r.holed, surf: surfaceAt(hole, r.disc) });
    }
  }
}
const aces = results.filter((r) => r.holed);
const nearAndClear = results.filter((r) => !r.holed && r.left <= 10);
const puttable = results.filter((r) => !r.holed && r.left <= 22);
console.log(`  tee shots tried: ${results.length}, aces: ${aces.length} (${(100 * aces.length / results.length).toFixed(2)}%), within 10 m: ${nearAndClear.length}, within putter range (22 m): ${puttable.length}`);
const fmt = (t: Throw) => `aim ${(deg(t.aim - toBasket) >= 0 ? '+' : '')}${deg(t.aim - toBasket).toFixed(0)}° from the basket line, power ${(t.power * 100).toFixed(0)}%, curve ${t.curve >= 0 ? 'right' : 'left'} ${Math.abs(t.curve * 100).toFixed(0)}%`;
check(aces.length > 0, `an ace is possible${aces[0] ? ` (e.g. ${fmt(aces[Math.floor(aces.length / 2)].th)})` : ''}`);
const straightish = nearAndClear.filter((r) => Math.abs(r.th.curve) < 0.15);
const leftCurvers = nearAndClear.filter((r) => r.th.curve < -0.3);
const rightCurvers = nearAndClear.filter((r) => r.th.curve > 0.3);
console.log(`  within 10 m: straight-ish ${straightish.length}, curving right ${rightCurvers.length}, curving left ${leftCurvers.length}`);
check(rightCurvers.length > straightish.length * 2, 'curving round the oak is the way to get close');

// 3. a par-2 route: a good right-curving drive, then a putt
{
  const drive = rightCurvers.sort((a, b) => a.left - b.left)[Math.floor(rightCurvers.length * 0.4)];
  const r1 = simulate(hole, hole.tee, drive.th);
  const lie = r1.disc;
  const kind = discFor(hole, lie);
  // the putt: straight at the chains, find a power that holes it
  let putt: Throw | null = null;
  for (let p = 0.05; p <= 1; p += 0.01) {
    const th = { aim: bearing(lie, hole.basket), power: p, curve: 0, kind };
    if (simulate(hole, lie, th).holed) { putt = th; break; }
  }
  check(kind === PUTTER && putt !== null,
    `par 2: drive (${fmt(drive.th)}) leaves ${distTo(lie, hole.basket).toFixed(1)} m on the ${surfaceAt(hole, lie)}, then a ${kind.name.toLowerCase()} at ${putt ? (putt.power * 100).toFixed(0) : '?'}% power drops in`);
  // putting window: how wide is the range of power that holes out?
  const ok: number[] = [];
  for (let p = 0.01; p <= 1; p += 0.01) if (simulate(hole, lie, { aim: bearing(lie, hole.basket), power: p, curve: 0, kind }).holed) ok.push(p);
  console.log(`  putting window from there (dead-centre aim): ${(ok[0] * 100).toFixed(0)}%–${(ok[ok.length - 1] * 100).toFixed(0)}% power`);
}

// 4. the chains: catch rate by power, over putts that are on target (line passes within
//    the catch radius), for the putter from 6 m and 15 m, and the driver from 20-30 m
type Out = { chains: number; clang: number; skip: number; short: number; n: number };
function rate(dist: number, kind: typeof PUTTER, power: number): Out {
  const from = { x: hole.basket.x - dist, y: hole.basket.y + 0.4 };
  const base = bearing(from, hole.basket);
  const o: Out = { chains: 0, clang: 0, skip: 0, short: 0, n: 0 };
  for (let m = -0.94; m <= 0.94001; m += 0.02) {
    const r = simulate(hole, from, { aim: base + Math.atan2(m, dist), power, curve: 0, kind });
    o.n++;
    if (r.holed) o.chains++;
    else if (r.events.includes('clang')) o.clang++;
    else if (r.events.includes('skip')) o.skip++;
    else o.short++;
  }
  return o;
}
const pct = (k: number, n: number) => `${Math.round((100 * k) / n)}%`.padStart(4);
const row = (label: string, o: Out) => console.log(`  ${label.padEnd(22)} in ${pct(o.chains, o.n)}  clang ${pct(o.clang, o.n)}  skip ${pct(o.skip, o.n)}  short ${pct(o.short, o.n)}`);
const table: Record<string, Out> = {};
for (const [dist, kind, powers] of [[6, PUTTER, [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]], [15, PUTTER, [0.6, 0.7, 0.8, 0.9, 1]], [20, DRIVER, [0.4, 0.6, 1]], [25, DRIVER, [0.5, 0.7, 1]], [30, DRIVER, [0.5, 0.7, 1]]] as const) {
  console.log(`  ${kind.name} from ${dist} m (on-target throws, straight):`);
  for (const p of powers) { const o = rate(dist, kind, p); table[`${kind.name}${dist}@${p}`] = o; row(`${(p * 100).toFixed(0)}% power`, o); }
}
const r6 = (p: number) => table[`Putter6@${p}`].chains / table[`Putter6@${p}`].n;
check([0.3, 0.4, 0.5, 0.6, 0.7].every((p) => r6(p) >= 0.95), 'sensible putts (30–70%) from 6 m go in reliably');
check(r6(1) <= 0.6 && r6(1) >= 0.15, `full-power putt from 6 m only goes in when fairly central (${Math.round(r6(1) * 100)}%)`);
{
  const hard = ['Driver20@1', 'Driver25@1', 'Driver30@1'].map((k) => table[k]);
  const caught = hard.reduce((a, o) => a + o.chains, 0) / hard.reduce((a, o) => a + o.n, 0);
  check(caught <= 0.25, `a hard driver into the basket from 20–30 m usually bounces out (caught ${Math.round(caught * 100)}%)`);
}
// misses don't fly off miles away
{
  let far = 0;
  for (const [dist, kind] of [[6, PUTTER], [25, DRIVER]] as const) {
    const from = { x: hole.basket.x - dist, y: hole.basket.y + 0.4 };
    for (let m = -0.94; m <= 0.94001; m += 0.04) {
      const r = simulate(hole, from, { aim: bearing(from, hole.basket) + Math.atan2(m, dist), power: 1, curve: 0, kind });
      if (!r.holed) far = Math.max(far, distTo(r.disc, hole.basket));
    }
  }
  check(far < 9, `a clang or skip at full power ends up close by (furthest ${far.toFixed(1)} m from the basket)`);
}
{
  const from = { x: hole.basket.x - 6, y: hole.basket.y };
  const r = simulate(hole, from, { aim: bearing(from, hole.basket), power: 1, curve: 0, kind: PUTTER });
  check(r.holed, `dead-centre full-power putt from 6 m still goes in (${r.disc.catchSpeed.toFixed(1)} m/s)`);
}

// 5. rough is slower than fairway
{
  // the same 40 m drive landing on fairway vs rough
  const open = { ...hole, trees: [], bounds: { minX: -1e3, maxX: 1e3, minY: -1e3, maxY: 1e3 } };
  const th = { aim: -Math.PI / 2, power: 0.5, curve: 0, kind: DRIVER };
  const fair = simulate(open, { x: 0, y: 0 }, th); // lands up the fairway
  const rough = simulate(open, { x: -40, y: 0 }, th); // lands out in the rough
  check(surfaceAt(hole, fair.disc) === 'fairway' && -rough.disc.y < -fair.disc.y - 1.5,
    `rough grabs the disc on landing (same throw: ${(-fair.disc.y).toFixed(1)} m on the fairway vs ${(-rough.disc.y).toFixed(1)} m in the rough)`);
}
// ---- every hole: a par route, birdie chances, and each hole's special feature ----------
const robustTee: Record<string, Cand> = {};
type Cand = { th: Throw; r: ReturnType<typeof simulate>; score: number };
function search(h: Hole, lie: Vec, step = 3): Cand[] {
  const kind = discFor(h, lie);
  const base = bearing(lie, h.basket);
  const out: Cand[] = [];
  for (let a = -60; a <= 60; a += step) {
    for (let p = 0.1; p <= 1.0001; p += 0.05) {
      for (let c = -1; c <= 1.0001; c += 0.25) {
        const th = { aim: base + rad(a), power: p, curve: c, kind };
        const r = simulate(h, lie, th);
        out.push({ th, r, score: r.holed ? -1 : distTo(r.lie, h.basket) + (r.penalty ? 40 : 0) });
      }
    }
  }
  return out.sort((x, y) => x.score - y.score);
}
const fmtTh = (h: Hole, lie: Vec, t: Throw) => {
  const off = deg(t.aim - bearing(lie, h.basket));
  return `${t.kind.name.toLowerCase()} ${Math.abs(off).toFixed(0)}° ${off < 0 ? 'left' : 'right'}, ${(t.power * 100).toFixed(0)}%, curve ${t.curve === 0 ? 'none' : `${t.curve > 0 ? 'right' : 'left'} ${Math.abs(t.curve * 100).toFixed(0)}%`}`;
};
function pathLength(h: Hole) { let L = 0; for (let i = 1; i < h.fairway.length; i++) L += distTo(h.fairway[i - 1], h.fairway[i]); return L; }

HOLES.forEach((h, i) => {
  console.log(`\nHole ${i + 1} "${h.name}", par ${h.par}: ${distTo(h.tee, h.basket).toFixed(0)} m tee to basket, about ${pathLength(h).toFixed(0)} m along the fairway`);
  // a careful route: the best grid throw each time
  let lie: Vec = h.tee, strokes = 0, holed = false;
  const steps: string[] = [];
  while (!holed && strokes < 8) {
    const best = search(h, lie)[0];
    strokes += 1 + (best.r.penalty ? 1 : 0);
    steps.push(`${fmtTh(h, lie, best.th)} → ${best.r.holed ? 'IN' : `${distTo(best.r.lie, h.basket).toFixed(1)} m left`}`);
    holed = best.r.holed; lie = best.r.lie;
  }
  check(holed && strokes <= h.par, `best-input route in ${strokes}: ${steps.join('; ')}`);
  // tee shots: how many leave a good lie, and can any be followed by a holed second (birdie)?
  const tee = search(h, h.tee);
  const n = tee.length;
  const within = (m: number) => tee.filter((c) => !c.r.holed && !c.r.penalty && distTo(c.r.lie, h.basket) <= m).length;
  const wet = tee.filter((c) => c.r.penalty).length;
  if (process.env.DEBUG_HOLE) console.log(tee.slice(0,3).map(c=>fmtTh(h,h.tee,c.th)));
  console.log(`  tee grid ${n}: aces ${tee.filter((c) => c.r.holed).length}, within 22 m ${pct(within(22), n)}, within 35 m ${pct(within(35), n)}, in the water ${pct(wet, n)}`);
  // a forgiving tee shot: the top candidates, judged over a neighbourhood of slightly-off inputs
  // (±3° aim, ±4% power, ±0.1 curve), so a real player has a margin for error.
  const robust = tee.filter((c) => !c.r.holed).slice(0, 200).map((c) => {
    const ds: number[] = []; let wetN = 0;
    for (const da of [-3, 0, 3]) for (const dp of [-0.04, 0, 0.04]) for (const dc of [-0.1, 0, 0.1]) {
      const r = simulate(h, h.tee, { ...c.th, aim: c.th.aim + rad(da), power: Math.min(1, c.th.power + dp), curve: Math.max(-1, Math.min(1, c.th.curve + dc)) });
      if (r.penalty) wetN++;
      ds.push(r.holed ? 0 : distTo(r.lie, h.basket) + (r.penalty ? 20 : 0));
    }
    return { c, mean: ds.reduce((a, x) => a + x, 0) / ds.length, worst: Math.max(...ds), wetN };
  }).sort((a, b) => a.mean - b.mean)[0];
  robustTee[h.name] = robust.c;
  const need = h.par - 1; // throws left after the drive, for par
  check(robust.mean <= (need >= 2 ? 45 : 16),
    `forgiving tee shot: ${fmtTh(h, h.tee, robust.c.th)}; slightly-off inputs leave ${robust.mean.toFixed(1)} m on average (worst ${robust.worst.toFixed(1)} m, ${robust.wetN}/27 wet) → par needs ${need === 1 ? 'one putt' : 'an approach and a putt'} from there`);
  if (need >= 2) {
    // ... and from that lie, an approach that reliably reaches easy putting range (≤ 6 m)
    const lie2 = robust.c.r.lie;
    const app = search(h, lie2).filter((c) => !c.r.penalty).slice(0, 60).map((c) => {
      const ds: number[] = [];
      for (const da of [-2, 0, 2]) for (const dp of [-0.04, 0, 0.04]) {
        const r = simulate(h, lie2, { ...c.th, aim: c.th.aim + rad(da), power: Math.min(1, c.th.power + dp) });
        ds.push(r.holed ? 0 : distTo(r.lie, h.basket) + (r.penalty ? 20 : 0));
      }
      return { c, worst: Math.max(...ds) };
    }).sort((a, b) => a.worst - b.worst)[0];
    check(app.worst <= 7, `...then an approach (${fmtTh(h, lie2, app.c.th)}) leaves at most ${app.worst.toFixed(1)} m even when slightly off, for a tap-in par`);
  }
  if (h.par >= 3) {
    let birdieLies = 0;
    const tried = tee.filter((c) => !c.r.holed && !c.r.penalty).slice(0, 6);
    for (const c of tried) if (search(h, c.r.lie, 3).some((x) => x.r.holed)) birdieLies++;
    console.log(`  birdie: from the 6 best tee shots, ${birdieLies} leave a lie where some second throw goes in`);
    check(birdieLies > 0, 'birdie is possible');
  }
});

// hole 2: the bridge blocks the straight line, and the water penalty
{
  const h = HOLES[1];
  for (const p of [0.7, 0.85, 1]) {
    const r = simulate(h, h.tee, { aim: bearing(h.tee, h.basket), power: p, curve: 0, kind: DRIVER });
    check(r.events.includes('rail') && !r.holed, `hole 2: straight ${p * 100}% drive hits the bridge rail${r.penalty ? ', drops in the stream (+1)' : ''} (ends ${distTo(r.lie, h.tee).toFixed(1)} m out)`);
  }
  // find a lay-up that comes up short in the water, left of the bridge
  let wetCase: ReturnType<typeof simulate> | null = null, wetP = 0;
  for (let p = 0.15; p <= 0.8 && !wetCase; p += 0.01) {
    const r = simulate(h, h.tee, { aim: bearing(h.tee, h.basket) - rad(14), power: p, curve: 0, kind: DRIVER });
    if (r.penalty) { wetCase = r; wetP = p; }
  }
  if (!wetCase) check(false, 'hole 2: found a throw that stops in the stream');
  else {
    const dryOk = surfaceAt(h, wetCase.lie) !== 'water';
    const sameSide = distTo(wetCase.lie, h.tee) < distTo(wetCase.disc, h.tee);
    check(dryOk && sameSide && distTo(wetCase.lie, wetCase.disc) < 8,
      `hole 2: ${(wetP * 100).toFixed(0)}% drive 14° left stops in the stream → penalty, replayed from the tee-side bank ${distTo(wetCase.lie, wetCase.disc).toFixed(1)} m back (${surfaceAt(h, wetCase.lie)})`);
  }
  const over = robustTee[h.name].r;
  check(!over.penalty && over.lie.y < -45, `hole 2: the forgiving drive flies over the stream with no penalty (ends ${distTo(over.lie, h.tee).toFixed(0)} m out, on the ${surfaceAt(h, over.lie)})`);
  // lay up short, then over: also par-able
  const lay = simulate(h, h.tee, { aim: bearing(h.tee, h.basket) - rad(10), power: 0.2, curve: 0, kind: DRIVER });
  check(!lay.penalty && lay.lie.y > -22, `hole 2: a lay-up (20% drive) stops dry short of the stream, ${distTo(lay.lie, h.basket).toFixed(0)} m out`);
}
// hole 3: the hill
{
  const h = HOLES[2];
  const hill = h.hills![0];
  // putt from below the hill that lands on the slope and rolls back
  const from = { x: hill.x, y: hill.y + 24 };
  let rolled: { land: number; end: number; p: number } | null = null;
  for (let p = 0.3; p <= 1 && !rolled; p += 0.02) {
    const th = { aim: bearing(from, hill) + 0.06, power: p, curve: 0, kind: PUTTER };
    const r = simulate(h, from, th);
    // where did it land? re-run and catch the land event
    let landAt = Infinity;
    const end = distTo(r.lie, hill);
    if (r.events.includes('land')) {
      // replay to find the landing point
      const d = launch(from, th);
      while (d.phase === 'flight') step(h, d);
      landAt = distTo(d, hill);
    }
    if (landAt > hill.top + 1 && landAt < hill.base - 2 && end > landAt + 1) rolled = { land: landAt, end, p };
  }
  check(!!rolled, `hole 3: short on the slope rolls back down${rolled ? ` (${(rolled.p * 100).toFixed(0)}% putt from 24 m: lands ${rolled.land.toFixed(1)} m from the pin, rolls back to ${rolled.end.toFixed(1)} m)` : ''}`);
  // a disc on the flat top stays put
  const top = simulate(h, { x: hill.x, y: hill.y + 9 }, { aim: -Math.PI / 2 + 0.25, power: 0.35, curve: 0, kind: PUTTER });
  check(distTo(top.lie, hill) <= hill.top + 0.5 || top.holed, `hole 3: a gentle putt that stops on the flat top stays there (${distTo(top.lie, hill).toFixed(1)} m from the pin)`);
}

console.log(failures ? `${failures} FAILED` : 'all disc golf checks passed');
process.exit(failures ? 1 : 0);
