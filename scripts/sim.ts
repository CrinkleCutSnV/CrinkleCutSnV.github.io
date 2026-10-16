import { simulate } from '../src/scripts/paper-plane/physics';
const d = (deg: number) => (deg * Math.PI) / 180;
const cases: [string, number, number, number][] = [
  ['weak (3 m/s, 10°)', 3, 10, 1.3],
  ['weak-ish (5 m/s, 15°)', 5, 15, 1.4],
  ['medium (8 m/s, 15°)', 8, 15, 1.5],
  ['medium (10 m/s, 10°)', 10, 10, 1.5],
  ['strong (13 m/s, 12°)', 13, 12, 1.6],
  ['strong (16 m/s, 8°)', 16, 8, 1.7],
  ['strong (16 m/s, 20°)', 16, 20, 1.7],
  ['lob (12 m/s, 50°)', 12, 50, 1.5],
  ['spike (10 m/s, -30°)', 10, -30, 1.5],
];
for (const [name, s, a, y] of cases) {
  const r = simulate({ x: 0.3, y, speed: s, angle: d(a) });
  console.log(`${name.padEnd(24)} ${r.distance.toFixed(1).padStart(6)} m  t=${r.time.toFixed(2)}s  peak=${r.maxHeight.toFixed(2)}m  ceiling=${r.ceilingHits}`);
}
