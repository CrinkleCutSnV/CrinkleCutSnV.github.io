// Before/after balance tables for the graded swoop (dev tool):
//   npx tsx scripts/swoop-compare.ts
// "before" is the old all-or-nothing dive boost (scripts/swoop-before-physics.ts, from main 67904ee).
import * as NEW from '../src/scripts/paper-plane/physics';
import * as OLD from './swoop-before-physics';
type M = typeof NEW | typeof OLD;
const d = (deg: number) => (deg * Math.PI) / 180;
type L = { x: number; y: number; speed: number; angle: number };

/** fly a throw and say how it ended: floor (dived in before pulling out), ceiling/lintel (hit after a swoop), swoop (a real swoop), or plain */
export function fly(m: M, l: L) {
  const p = m.launchPlane(l) as NEW.Plane;
  let out = '';
  while (p.phase !== 'stopped') {
    const b = p.boost, ch = p.ceilingHits;
    m.step(p as never);
    if (!out && p.phase !== 'flying' && !p.crashed && b === 1 && p.boosted) out = 'floor';
    if (!out && p.ceilingHits > ch && p.boost !== 0 && p.boosted) out = 'ceiling';
  }
  if (p.crashed && p.boosted) out = 'lintel';
  return { d: Math.max(0, p.x), out: out || (p.boosted ? 'swoop' : ''), k: p.swoop ?? (p.boosted ? 1 : 0) };
}
const tag = (o: string) => ({ floor: ' ▼floor', ceiling: ' ▲ceiling', lintel: ' ▲beam', swoop: ' ~swoop', '': '' })[o];
const H = 1.8, X = 0.3;
const angles = [5, 0, -3, -5, -10, -15, -20, -25, -30, -35, -40, -50];
console.log(`Distance (m) by throw angle, released at ${H} m, ${X} m past the desk front.  before -> after (after: swoop strength)`);
for (const sp of [10, 13, 16]) {
  console.log(`\n${sp} m/s`);
  for (const a of angles) {
    const o = fly(OLD, { x: X, y: H, speed: sp, angle: d(a) }), n = fly(NEW, { x: X, y: H, speed: sp, angle: d(a) });
    console.log(`  ${String(a).padStart(4)}°  ${(o.d.toFixed(1) + tag(o.out)).padEnd(17)} -> ${(n.d.toFixed(1) + tag(n.out)).padEnd(17)} ${(n.k * 100).toFixed(0).padStart(3)}%`);
  }
}
function grid(m: M) {
  const all: { d: number; a: number; s: number; out: string }[] = [];
  for (let s = 2; s <= 16 + 1e-9; s += 0.5) for (let a = -45; a <= 30; a += 1) for (const y of [1.0, 1.5, 2.0, 2.5, 3.0]) for (const x of [-1.2, 0, 1.2])
    { const r = fly(m, { x, y, speed: s, angle: d(a) }); all.push({ d: Math.round(r.d * 10) / 10, a, s, out: r.out }); }
  return all;
}
const tier = (v: number) => (v >= 100 ? 'gold' : v >= 75 ? 'silver' : v >= 40 ? 'bronze' : 'none');
const pct = (arr: { d: number }[], f: (r: any) => boolean) => `${((100 * arr.filter(f).length) / arr.length).toFixed(1)}%`;
for (const [name, m] of [['BEFORE', OLD], ['AFTER', NEW]] as const) {
  const g = grid(m);
  const sets = {
    'all throws': g,
    'shallow flick (−1..−14°, ≥10 m/s)': g.filter((r) => r.a < 0 && r.a > -15 && r.s >= 10),
    'good swoop try (−15..−30°, ≥12 m/s)': g.filter((r) => r.a <= -15 && r.a >= -30 && r.s >= 12),
    'very steep (−35..−45°, ≥10 m/s)': g.filter((r) => r.a <= -35 && r.s >= 10),
    'flat/upward (≥0°)': g.filter((r) => r.a >= 0),
    'gentle lob (<10 m/s, downward)': g.filter((r) => r.a < 0 && r.s < 10),
  };
  console.log(`\n${name}  (${g.length} throws: 2–16 m/s, −45..30°, 5 heights, 3 positions)`);
  console.log(`  ${'set'.padEnd(38)} ${['none', 'bronze', 'silver', 'gold'].map((t) => t.padStart(7)).join('')}   best   floor  ceil/beam`);
  for (const [k, v] of Object.entries(sets))
    console.log(`  ${k.padEnd(38)} ${['none', 'bronze', 'silver', 'gold'].map((t) => pct(v, (r) => tier(r.d) === t).padStart(7)).join('')}  ${Math.max(...v.map((r) => r.d)).toFixed(1).padStart(5)}  ${pct(v, (r) => r.out === 'floor').padStart(6)}  ${pct(v, (r) => r.out === 'ceiling' || r.out === 'lintel').padStart(6)}`);
}
// examples
console.log('\nExamples (after):');
const ex: [string, L][] = [
  ['good swoop', { x: 0.3, y: 2.1, speed: 16, angle: d(-20) }],
  ['over-swoop', { x: 0, y: 2.5, speed: 16, angle: d(-22) }],
  ['shallow flick', { x: 0.3, y: 1.8, speed: 14, angle: d(-6) }],
  ['too steep', { x: 0.3, y: 1.8, speed: 16, angle: d(-30) }],
  ['too low', { x: 0.3, y: 1.0, speed: 16, angle: d(-20) }],
];
for (const [n, l] of ex) { const r = fly(NEW, l); console.log(`  ${n.padEnd(14)} ${l.speed} m/s at ${(l.angle * 180 / Math.PI).toFixed(0)}° from ${l.y} m: ${r.d.toFixed(1)} m ${tag(r.out)}`); }
// over-swoops: dives with too much speed/height that balloon into the ceiling or the doorway beam
{
  const found: Record<string, string[]> = { ceiling: [], lintel: [] };
  for (const y of [2.0, 2.5, 3.0]) for (const s of [13, 14, 15, 16]) for (const a of [-15, -20, -25]) for (const x of [-1.2, 0, 1.2]) {
    const r = fly(NEW, { x, y, speed: s, angle: d(a) });
    if ((r.out === 'ceiling' || r.out === 'lintel') && found[r.out].length < 3) found[r.out].push(`${s} m/s at ${a}° from ${y} m (x ${x}): ${r.d.toFixed(1)} m`);
  }
  console.log('  over-swoop into the ceiling:', found.ceiling.join('; ') || 'none');
  console.log('  over-swoop into the doorway beam:', found.lintel.join('; ') || 'none');
}
