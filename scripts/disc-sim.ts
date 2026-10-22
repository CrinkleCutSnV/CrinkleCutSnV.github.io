// Headless checks for Arcade Disc Golf. Run with `npm run check:disc`.
import {
  DRIVER, HOLES, PUTTER, bearing, discFor, distTo, simulate, surfaceAt, type Throw,
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
  console.log(`  putting window from there: ${(ok[0] * 100).toFixed(0)}%–${(ok[ok.length - 1] * 100).toFixed(0)}% power`);
}

// 4. a hard throw at the basket still counts
for (const [label, from, kind, power] of [
  ['full-power putt from 6 m', { x: hole.basket.x - 6, y: hole.basket.y + 1 }, PUTTER, 1],
  ['full-power putt from 18 m', { x: hole.basket.x - 18, y: hole.basket.y + 2 }, PUTTER, 1],
  ['full-power driver from 30 m (slightly off centre)', { x: hole.basket.x - 30, y: hole.basket.y + 0.5 }, DRIVER, 1],
] as const) {
  const r = simulate(hole, from, { aim: bearing(from, hole.basket) + 0.012, power: power, curve: 0, kind });
  check(r.holed, `${label}: ${r.holed ? `caught by the chains at ${r.disc.catchSpeed.toFixed(1)} m/s` : `not holed (${r.events.join(', ')})`}`);
}
{
  const from = { x: hole.basket.x - 20, y: hole.basket.y };
  const r = simulate(hole, from, { aim: bearing(from, hole.basket), power: 1, curve: 0, kind: DRIVER });
  console.log(`  dead-centre full-power driver from 20 m: ${r.holed ? `holed at ${r.disc.catchSpeed.toFixed(1)} m/s` : r.events.join(', ')} (only this, dead-centre at full whack, clangs off the pole)`);
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
console.log(failures ? `${failures} FAILED` : 'all disc golf checks passed');
process.exit(failures ? 1 : 0);
