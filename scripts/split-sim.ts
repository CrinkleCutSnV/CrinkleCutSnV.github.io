// Split the G: physics checks and a medal-band tuning sim. `npm run check:split`
import { CHARACTERS, TARGET, G_MARK, pourPint, predictFinal, simulate, step, startDrinking, judge, visibleLine, areaAt, radiusAt, type Pint } from '../src/scripts/split-the-g/physics';
import { SPLIT_MEDALS } from '../src/data/medals';
import { medalFor } from '../src/data/medals';

let failures = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
let seed = 1;
const gauss = (() => { let s = 12345; const u = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296); return () => Math.sqrt(-2 * Math.log(u() + 1e-12)) * Math.cos(2 * Math.PI * u()); })();

// --- the glass ---
let vol = 0; for (let v = 0; v < 140; v += 0.1) vol += areaAt(v) * 0.1;
console.log(`glass: radius ${radiusAt(0).toFixed(1)} mm at the foot, ${radiusAt(130).toFixed(1)} mm at the bulge, ${radiusAt(160).toFixed(1)} mm at the rim; ${(vol / 1000).toFixed(0)} ml up to 140 mm`);
check(vol / 1000 > 480 && vol / 1000 < 620, 'a pint-ish of stout below the head');

// --- each drinker: speed near the G, how much more goes after you let go, and the settle ---
const offset: Record<string, number> = {};
for (const c of CHARACTERS) {
  const offs: number[] = [], speeds: number[] = [], times: number[] = [];
  for (let i = 0; i < 300; i++) {
    const p = pourPint(c, seed++);
    startDrinking(p);
    while (p.line > TARGET + 1) step(p);
    const before = p.line; step(p);
    speeds.push((before - p.line) * 240);
    times.push(p.t);
    offs.push(predictFinal(p) - p.line);
  }
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const sd = (a: number[]) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
  offset[c.id] = mean(offs);
  console.log(`${c.id.padEnd(8)} reaches the G in ${mean(times).toFixed(1)} s, line falling ${mean(speeds).toFixed(1)} mm/s (±${sd(speeds).toFixed(1)}); after letting go it ends ${mean(offs).toFixed(1)} mm (±${sd(offs).toFixed(1)}) from where it was`);
}

// --- a perfect release (the planner) always splits it ---
for (const c of CHARACTERS) {
  let worst = 0;
  for (let i = 0; i < 100; i++) {
    const p = pourPint(c, seed++);
    const end = simulate(p, (q) => predictFinal(q) <= TARGET);
    worst = Math.max(worst, Math.abs(end - TARGET));
  }
  check(worst < 0.5, `${c.id}: letting go at exactly the right moment always splits the G (worst ${worst.toFixed(2)} mm)`);
}

// --- model players ---
interface Player { name: string; comp: number; compErr: number; judge: number; timing: number }
const players: Player[] = [
  { name: 'first go (no allowance for the lag)', comp: 0, compErr: 0, judge: 2.5, timing: 0.07 },
  { name: 'getting the hang of it', comp: 0.6, compErr: 1.5, judge: 1.6, timing: 0.055 },
  { name: 'pub regular (knows each drinker)', comp: 1, compErr: 1.0, judge: 1.2, timing: 0.045 },
  { name: 'sharp-eyed expert', comp: 1, compErr: 0.6, judge: 0.6, timing: 0.035 },
];
const N = 1500;
const rate: Record<string, Record<string, number>> = {};
for (const pl of players) {
  const tally = { gold: 0, silver: 0, bronze: 0, none: 0 } as Record<string, number>;
  const per: string[] = [];
  for (const c of CHARACTERS) {
    const t2 = { gold: 0, silver: 0, bronze: 0, none: 0 } as Record<string, number>;
    for (let i = 0; i < N; i++) {
      const p = pourPint(c, seed++);
      // aim for the line at which you should let go, then let go a bit early or late
      const aim = TARGET - pl.comp * (offset[c.id] + gauss() * pl.compErr) + gauss() * pl.judge;
      const late = gauss() * pl.timing;
      let crossT = -1;
      const end = simulate(p, (q) => { if (crossT < 0 && q.line <= aim) crossT = q.t; return crossT >= 0 && q.t >= crossT + Math.max(-0.15, late); });
      const v = judge(end, p.emptied).mm;
      const m = medalFor(SPLIT_MEDALS, v) ?? 'none';
      tally[m]++; t2[m]++;
    }
    per.push(`${c.id} ${(100 * t2.gold / N).toFixed(0)}/${(100 * (t2.gold + t2.silver) / N).toFixed(0)}/${(100 * (N - t2.none) / N).toFixed(0)}`);
  }
  const T = N * CHARACTERS.length;
  rate[pl.name] = { gold: tally.gold / T, silver: (tally.gold + tally.silver) / T, bronze: (T - tally.none) / T };
  console.log(`\n${pl.name}: gold ${(100 * tally.gold / T).toFixed(1)}%, silver or better ${(100 * (tally.gold + tally.silver) / T).toFixed(1)}%, any medal ${(100 * (T - tally.none) / T).toFixed(1)}%`);
  console.log(`   by drinker (gold/silver+/any %): ${per.join(' · ')}`);
}
const first = rate[players[0].name], reg = rate[players[2].name], exp = rate[players[3].name];
check(first.bronze < 0.85 && first.bronze > 0.35, `bronze isn't a gimme on a first go (${(100 * first.bronze).toFixed(0)}%)`);
check(first.gold < 0.12, `gold on a first go is rare (${(100 * first.gold).toFixed(1)}%)`);
check(reg.gold < 0.35 && reg.gold > 0.08, `a regular gets gold now and then (${(100 * reg.gold).toFixed(0)}%)`);
check(exp.gold < 0.6, `even an expert misses gold often (${(100 * exp.gold).toFixed(0)}%)`);

// --- judging ---
check(judge(TARGET).rating === 'Split the G!' && judge(TARGET + 0.9).rating === 'Split the G!', 'a line on the split line (halfway between bar and curl) is a split');
check(judge(TARGET + 20).rating === 'Not even close, pal' && judge(TARGET - 20).rating === 'Not even close, pal', 'miles off: "Not even close, pal"');
check(judge(G_MARK.top + 1).signed > 0, 'above the G reads as positive');
const keep = pourPint(CHARACTERS[0], 5);
const end = simulate(keep, () => false);
check(keep.emptied && judge(end, true).remark.includes('finishing the pint'), 'holding on forever finishes the pint and ends the go');
check(Math.abs(visibleLine(keep) - end) < 1e-9, 'visible line = judged line');


// --- the G and the split line: one fixed G, the same on every glass ---
{
  const g = G_MARK;
  const half = (g.curl.v - g.barY) / 2;
  console.log(`\nthe G: ring ${g.bottom.toFixed(1)}–${g.top.toFixed(1)} mm up the glass, bar at ${g.barY.toFixed(2)} mm, curl at ${g.curl.v.toFixed(2)} mm, split line at ${TARGET.toFixed(2)} mm (bar→curl ${(2 * half).toFixed(1)} mm)`);
  check(Math.abs(TARGET - (g.barY + g.curl.v) / 2) < 1e-9, 'the split line is exactly halfway between the bar and the curl');
  check(g.barY < g.cy && g.curl.v > g.cy, 'the bar is in the lower half of the G, the curl in the upper half');
  check(Object.isFrozen(G_MARK), 'G_MARK is frozen: nothing can change the G at run time');
  const glassOk = [g.bottom, g.barY, g.cy, g.curl.v, g.top].every((v) => g.R + g.stroke.thick < radiusAt(v));
  check(glassOk, 'the whole G fits on the glass at every height it spans');
  const seen = new Set<string>();
  for (const c of CHARACTERS) for (let i = 0; i < 50; i++) { pourPint(c, i * 7919 + 3); seen.add(JSON.stringify(G_MARK) + TARGET); }
  check(seen.size === 1, 'pouring 300 pints for all six drinkers never changes the G or the split line');
  const { gold, silver, bronze } = SPLIT_MEDALS.thresholds;
  check(gold < silver && silver < half && bronze > half, `gold (${gold}) and silver (${silver}) sit inside the bar→curl window (±${half.toFixed(2)} mm); bronze (${bronze}) reaches a little past it`);
}
console.log(failures ? `\n${failures} CHECK(S) FAILED` : '\nall split checks passed');
process.exit(failures ? 1 : 0);
