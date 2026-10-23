import { simulate, AERO, DIVE, launchPlane, step, swoopStrength } from '../src/scripts/paper-plane/physics';
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
  ['shallow flick (14 m/s, -6°)', 14, -6, 1.8],
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

// ---- the graded swoop ----
{
  let failures = 0;
  const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
  const at = (speed: number, angle: number, y = 1.8, x = 0.3) => simulate({ x, y, speed, angle: d(angle) });
  /** how a flight ends: 'floor' if it hits the floor still pulling out of the dive, 'ceiling' if it bumps the ceiling after swooping */
  const ending = (speed: number, angle: number, y = 1.8, x = 0.3) => {
    const p = launchPlane({ x, y, speed, angle: d(angle) }); let out = '';
    while (p.phase !== 'stopped') { const b = p.boost, ch = p.ceilingHits; step(p); if (!out && p.phase !== 'flying' && !p.crashed && b === 1) out = 'floor'; if (!out && p.ceilingHits > ch && p.boost) out = 'ceiling'; }
    return { out: p.crashed ? 'lintel' : out, d: p.x };
  };
  console.log('\nGraded swoop');
  const ss = [0, -2, -5, -10, -15, -20, -30, -45].map((a) => swoopStrength(d(a), 16));
  check(ss[0] === 0 && ss.every((v, i) => i === 0 || v >= ss[i - 1]) && ss[5] === 1 && ss[7] === 1 && ss[1] < 0.05,
    `strength grows smoothly with dive angle: ${[0, -2, -5, -10, -15, -20, -30, -45].map((a, i) => `${a}° ${(ss[i] * 100).toFixed(0)}%`).join(', ')} (no cut-off when steeper)`);
  const sv = [8, 9, 10, 11, 12, 16].map((v) => swoopStrength(d(-25), v));
  check(sv[1] === 0 && sv[4] === 1 && sv[2] > 0 && sv[2] < 0.5, `...and with speed: ${[8, 9, 10, 11, 12, 16].map((v, i) => `${v} m/s ${(sv[i] * 100).toFixed(0)}%`).join(', ')}`);
  // a shallow downward flick: compare with the swoop switched off
  const keep = DIVE.minStrength; DIVE.minStrength = 9;
  const plainFlick = at(14, -6).distance, plainFlat = at(14, 0).distance;
  DIVE.minStrength = keep;
  const flick = at(14, -6);
  check(flick.distance > plainFlick + 15 && flick.distance < 75, `a shallow flick (14 m/s at −6°) gets a small swoop: ${flick.distance.toFixed(1)} m vs ${plainFlick.toFixed(1)} m without it (a flat throw goes ${plainFlat.toFixed(1)} m)`);
  check(at(14, 0).distance - plainFlat < 8, `a flat throw gets (almost) nothing: ${at(14, 0).distance.toFixed(1)} m vs ${plainFlat.toFixed(1)} m`);
  const lob = at(8, -15);
  check(lob.swoop === 0 && lob.distance < 20, `a slow, gentle downward lob (8 m/s at −15°) doesn't swoop: ${lob.distance.toFixed(1)} m`);
  const row16 = [-10, -15, -20, -25].map((a) => at(16, a).distance);
  check(row16[0] < row16[1] && row16[1] < row16[2] && row16[2] >= 100 && row16[3] < 40, `sweet spot at 16 m/s: −10° ${row16[0].toFixed(0)} m, −15° ${row16[1].toFixed(0)} m, −20° ${row16[2].toFixed(0)} m, −25° ${row16[3].toFixed(0)} m (too steep)`);
  const steep = [[13, -40], [16, -40], [16, -35], [13, -50]].map(([v, a]) => ending(v, a));
  check(steep.every((r) => r.out === 'floor' && r.d < 15), `very steep dives swoop at full strength but run out of height and hit the floor: ${steep.map((r) => r.d.toFixed(1) + ' m').join(', ')}`);
  const over = ending(13, -20, 2.5), clean = at(13, -20, 1.8).distance;
  check(over.out === 'ceiling' && over.d < clean, `an over-swoop balloons into the ceiling: 13 m/s at −20° from 2.5 m goes ${over.d.toFixed(1)} m vs ${clean.toFixed(1)} m from 1.8 m`);
  // a good swoop attempt: −15..−30°, 12–16 m/s, from anywhere in the zone
  let n = 0, gold = 0, floor = 0, ceil = 0, best = 0;
  for (let v = 12; v <= 16; v += 0.5) for (let a = -30; a <= -15; a++) for (const y of [1, 1.5, 2, 2.5, 3]) for (const x of [-1.2, 0, 1.2]) {
    const r = ending(v, a, y, x); n++; best = Math.max(best, r.d); if (r.d >= 100) gold++; if (r.out === 'floor') floor++; if (r.out === 'ceiling' || r.out === 'lintel') ceil++;
  }
  check(gold / n >= 0.04 && gold / n <= 0.1 && best >= 104 && best <= 111, `gold stays hard: ${(100 * gold / n).toFixed(1)}% of good swoop attempts reach 100 m, best ${best.toFixed(1)} m (${(100 * floor / n).toFixed(0)}% hit the floor, ${(100 * ceil / n).toFixed(0)}% over-swoop into the ceiling)`);
  let vs = 0, vsFloor = 0;
  for (let v = 10; v <= 16; v += 0.5) for (let a = -45; a <= -35; a++) for (const y of [1, 1.5, 2, 2.5, 3]) for (const x of [-1.2, 0, 1.2]) { vs++; if (ending(v, a, y, x).out === 'floor') vsFloor++; }
  check(vsFloor / vs > 0.7, `−35° and steeper: ${(100 * vsFloor / vs).toFixed(0)}% of firm throws hit the floor`);
  if (failures) process.exit(1);
}
