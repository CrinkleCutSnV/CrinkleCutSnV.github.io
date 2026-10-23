import { simulate, AERO } from '../src/scripts/paper-plane/physics';
import { PLANE_MEDALS, bandLabel, medalFor, TIERS } from '../src/data/medals';
const d = (deg: number) => (deg * Math.PI) / 180;
// [name, speed m/s, angle deg, release height m]
const cases: [string, number, number, number][] = [
  ['weak (3 m/s, 10°)', 3, 10, 1.3],
  ['medium (8 m/s, 5°)', 8, 5, 1.5],
  ['normal strong (16 m/s, 5°)', 16, 5, 1.5],
  ['ceiling skim (16 m/s, 8°)', 16, 8, 1.5],
  ['lintel crash (12 m/s, 15°)', 12, 15, 1.5],
  ['lintel crash (14 m/s, 8°, high)', 14, 8, 2.1],
  ['sloppy dive (16 m/s, -40°)', 16, -40, 2.1],
  ['sloppy dive (10 m/s, -25°, slow)', 10, -25, 2.1],
  ['sloppy dive (16 m/s, -25°, low)', 16, -25, 1.5],
  ['good dive (12 m/s, -30°)', 12, -30, 2.1],
  ['good dive (14 m/s, -25°)', 14, -25, 2.1],
  ['great dive (16 m/s, -20°)', 16, -20, 2.1],
];
for (const [name, s, a, y] of cases) {
  const r = simulate({ x: 0.3, y, speed: s, angle: d(a) });
  const tag = r.crashed ? 'LINTEL' : r.boosted ? 'boost' : '';
  console.log(`${name.padEnd(34)} ${r.distance.toFixed(1).padStart(6)} m  t=${r.time.toFixed(2)}s  peak=${r.maxHeight.toFixed(2)}m  ceiling=${r.ceilingHits} ${tag}`);
}

// ---- medals: bronze 40–75 m, silver 75–100 m, gold 100 m+ ----
{
  let failures = 0;
  const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
  const nd: number[] = [], dv: number[] = [];
  for (let s = 2; s <= AERO.maxSpeed + 1e-9; s += 0.5) for (let a = -45; a <= 30; a += 1) for (const y of [1.0, 1.5, 2.0, 2.5, 3.0]) for (const x of [-1.2, 0, 1.2]) {
    const r = simulate({ x, y, speed: s, angle: d(a) });
    (r.boosted ? dv : nd).push(r.distance);
  }
  const pct = (arr: number[], f: (x: number) => boolean) => `${((100 * arr.filter(f).length) / arr.length).toFixed(1)}%`;
  const R = PLANE_MEDALS;
  console.log(`\nMedals: ${TIERS.map((t) => `${t} ${bandLabel(R, t)}`).join(', ')}  (grid of ${nd.length + dv.length} throws)`);
  for (const t of [null, ...TIERS] as const) {
    const f = (x: number) => medalFor(R, Math.round(x * 10) / 10) === t;
    console.log(`  ${(t ?? 'no medal').padEnd(8)}  ordinary throws ${pct(nd, f).padStart(6)}   swoop throws ${pct(dv, f).padStart(6)}`);
  }
  const ndMax = Math.max(...nd), dvMax = Math.max(...dv);
  check(ndMax >= R.thresholds.bronze, `bronze needs a good, firm throw: the best ordinary throw goes ${ndMax.toFixed(1)} m; a medium 8 m/s throw only ${simulate({ x: 0.3, y: 1.5, speed: 8, angle: d(5) }).distance.toFixed(1)} m`);
  check(ndMax < R.thresholds.silver, `silver needs the secret swoop: no ordinary throw reaches ${R.thresholds.silver} m`);
  const great = simulate({ x: 0.3, y: 2.1, speed: 16, angle: d(-20) });
  check(dvMax >= R.thresholds.gold && great.distance >= R.thresholds.gold, `gold is possible with a great dive (16 m/s at −20° goes ${great.distance.toFixed(1)} m; best ${dvMax.toFixed(1)} m)`);
  check(dv.filter((x) => x >= R.thresholds.gold).length / dv.length < 0.1, `...but hard: only ${pct(dv, (x) => x >= R.thresholds.gold)} of swoop throws make it`);
  check([[39.9, null], [40, 'bronze'], [74.9, 'bronze'], [75, 'silver'], [99.9, 'silver'], [100, 'gold']].every(([v, t]) => medalFor(R, v as number) === t), 'band edges: 39.9 none, 40 bronze, 75 silver, 100 gold');
  if (failures) process.exit(1);
}
