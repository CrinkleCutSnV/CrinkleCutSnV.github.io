import { simulate } from '../src/scripts/paper-plane/physics';
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
