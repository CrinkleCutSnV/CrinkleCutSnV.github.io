// Tea Dunk: scripted dunks to set medal bands. Pure physics, no DOM.
import { CHARACTERS, characterById } from '../src/scripts/split-the-g/physics';
import {
  BISCUITS, ROUNDS, SIGNATURE, biscuitFor, characterById as charById, pointsFor, scriptedDunk, warningOf,
  type Dunk,
} from '../src/scripts/tea-dunk/physics';
import { TEA_MEDALS, TIERS, bandLabel, medalFor } from '../src/data/medals';

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const pct = (n: number, d: number) => `${((100 * n) / d).toFixed(1)}%`;
const summary = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const at = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p)))];
  return `n=${s.length}  mean ${mean(s).toFixed(0)}  p10 ${at(0.1)}  p25 ${at(0.25)}  p50 ${at(0.5)}  p75 ${at(0.75)}  p90 ${at(0.9)}  max ${s[s.length - 1]}`;
};

function one(charId: string, seed: number, depth: number, pull: number) {
  return scriptedDunk(characterById(charId), seed, depth, pull);
}

console.log('=== Per-biscuit dunks (same script: depth 0.65, pull at soak 0.86) ===');
for (const c of CHARACTERS) {
  const scores: number[] = [];
  let breaks = 0;
  for (let i = 0; i < 80; i++) {
    const d = one(c.id, 1000 + i * 17, 0.65, 0.86);
    if (d.broken) breaks++;
    else scores.push(d.score);
  }
  const b = biscuitFor(c);
  console.log(`${c.name} / ${b.name}: ${scores.length ? summary(scores) : 'all broke'}  breaks ${pct(breaks, 80)}  (absorb ${b.absorb}, frag ${b.fragility}, ${b.curve})`);
}

console.log('\n=== Same biscuit, pull soak sweep (depth 0.65, Nigel/Maureen/Declan) ===');
for (const [id, label] of [['nigel', 'rich tea'], ['maureen', 'digestive'], ['declan', 'hobnob'], ['pip', 'ginger nut']] as const) {
  for (const pull of [0.40, 0.55, 0.70, 0.80, 0.86, 0.90, 0.94]) {
    const scores: number[] = [];
    let breaks = 0, meanTime = 0, meanPeak = 0;
    const N = 40;
    for (let i = 0; i < N; i++) {
      const d = one(id, 2000 + i * 13, 0.65, pull);
      if (d.broken) breaks++;
      else scores.push(d.score);
      meanTime += d.timeWet;
      meanPeak += d.peakSoak;
    }
    console.log(`  ${label} pull ${pull.toFixed(2)}: score ${scores.length ? mean(scores).toFixed(0) : '—'}  breaks ${pct(breaks, N)}  tWet ${(meanTime / N).toFixed(2)}s  peak ${(meanPeak / N).toFixed(2)}`);
  }
}

console.log('\n=== Depth matters (Maureen, pull 0.86) ===');
for (const depth of [0.25, 0.4, 0.55, 0.7, 0.85, 1]) {
  const scores: number[] = [];
  let breaks = 0;
  const N = 40;
  for (let i = 0; i < N; i++) {
    const d = one('maureen', 3000 + i * 11, depth, 0.86);
    if (d.broken) breaks++;
    else scores.push(d.score);
  }
  console.log(`  depth ${depth}: score ${scores.length ? mean(scores).toFixed(0) : '—'}  breaks ${pct(breaks, 40)}`);
}

// --- strategies for a 3-biscuit game -------------------------------------------------
type Style = 'timid' | 'casual' | 'average' | 'skilled' | 'daring' | 'greedy' | 'mixed';

function styleFor(style: Style, seed: number, round: number): { depth: number; pull: number } {
  const r = ((seed * 1103515245 + round * 12345) >>> 0) / 4294967296;
  switch (style) {
    case 'timid': return { depth: 0.32 + r * 0.16, pull: 0.36 + r * 0.12 };
    case 'casual': return { depth: 0.42 + r * 0.18, pull: 0.50 + r * 0.12 };
    case 'average': return { depth: 0.52 + r * 0.18, pull: 0.66 + r * 0.12 };
    case 'skilled': return { depth: 0.62 + r * 0.18, pull: 0.82 + r * 0.07 };
    case 'daring': return { depth: 0.70 + r * 0.22, pull: 0.88 + r * 0.06 };
    case 'greedy': return { depth: 0.75 + r * 0.25, pull: 0.94 + r * 0.05 };
    case 'mixed': {
      const pick = r;
      if (pick < 0.25) return styleFor('casual', seed + 1, round);
      if (pick < 0.6) return styleFor('average', seed + 2, round);
      if (pick < 0.85) return styleFor('skilled', seed + 3, round);
      return styleFor('timid', seed + 4, round);
    }
  }
}

function pickChars(seed: number) {
  const ids = CHARACTERS.map((c) => c.id);
  const r = (n: number) => {
    let a = (seed + n * 9973) >>> 0;
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: string[] = [];
  const left = [...ids];
  for (let i = 0; i < ROUNDS; i++) {
    const k = Math.floor(r(i + 3) * left.length);
    out.push(left.splice(k, 1)[0]);
  }
  return out;
}

function playGame(style: Style, seed: number) {
  const chars = pickChars(seed);
  const dunks: Dunk[] = [];
  for (let i = 0; i < ROUNDS; i++) {
    const s = styleFor(style, seed, i);
    dunks.push(one(chars[i], seed * 17 + i * 101, s.depth, s.pull));
  }
  const total = dunks.reduce((a, d) => a + d.score, 0);
  const breaks = dunks.filter((d) => d.broken).length;
  return { total, breaks, dunks, chars, medal: medalFor(TEA_MEDALS, total) };
}

console.log('\n=== 3-biscuit games by style ===');
const styles: Style[] = ['timid', 'casual', 'average', 'skilled', 'daring', 'greedy', 'mixed'];
const N = 400;
const dist: Record<string, Record<string, number>> = {};
for (const style of styles) {
  const totals: number[] = [];
  let breaks = 0;
  const medals: Record<string, number> = { none: 0, bronze: 0, silver: 0, gold: 0 };
  for (let i = 0; i < N; i++) {
    const g = playGame(style, 8000 + i * 31);
    totals.push(g.total);
    breaks += g.breaks;
    medals[g.medal ?? 'none']++;
  }
  dist[style] = medals;
  console.log(`${style}: ${summary(totals)}  breaks/game ${(breaks / N).toFixed(2)}  medals none ${pct(medals.none, N)}  B ${pct(medals.bronze, N)}  S ${pct(medals.silver, N)}  G ${pct(medals.gold, N)}`);
}

const R = TEA_MEDALS;
console.log(`\nMedal bands: ${TIERS.map((t) => `${t} ${bandLabel(R, t)}`).join(', ')}  (thresholds ${JSON.stringify(R.thresholds)})`);

// Design goals, for the check:tea script:
// - a timid or casual player should get bronze fairly easily, and almost never gold
// - an average player often bronze, sometimes silver, rarely gold
// - a skilled player should get gold only sometimes (it's hard), silver often, bronze almost always
// - a daring player risks breaks; gold not a gimme
// - greedy play should often miss even bronze because of breaks
const timidBronze = (dist.timid.bronze + dist.timid.silver + dist.timid.gold) / N;
const casualBronze = (dist.casual.bronze + dist.casual.silver + dist.casual.gold) / N;
const skilledGold = dist.skilled.gold / N;
const skilledMedal = (dist.skilled.bronze + dist.skilled.silver + dist.skilled.gold) / N;
const daringGold = dist.daring.gold / N;
const greedyGold = dist.greedy.gold / N;
const timidGold = (dist.timid.gold + dist.casual.gold) / (2 * N);
const averageGold = dist.average.gold / N;

let fails = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!ok) fails++;
};

check(timidBronze >= 0.7, `timid players get bronze fairly easily (${pct(dist.timid.bronze + dist.timid.silver + dist.timid.gold, N)})`);
check(casualBronze >= 0.85, `casual players almost always make bronze (${pct(dist.casual.bronze + dist.casual.silver + dist.casual.gold, N)})`);
check(timidGold <= 0.02, `timid/casual almost never take gold (${pct(dist.timid.gold + dist.casual.gold, 2 * N)})`);
check(averageGold <= 0.06, `average players rarely get gold (${pct(dist.average.gold, N)})`);
check(skilledMedal >= 0.95, `skilled players almost always medal (${pct(dist.skilled.bronze + dist.skilled.silver + dist.skilled.gold, N)})`);
check(skilledGold >= 0.08 && skilledGold <= 0.25, `skilled gold is uncommon, not a gimme (${pct(dist.skilled.gold, N)})`);
check(daringGold <= 0.45, `even daring play doesn't make gold easy (${pct(dist.daring.gold, N)})`);
check(greedyGold < skilledGold, `greedy (holding too long) gets gold less often than skilled play (${pct(dist.greedy.gold, N)} vs ${pct(dist.skilled.gold, N)})`);

// Physics sanity, so the sim doubles as check:tea
console.log('\n=== Physics checks ===');
const rich = one('nigel', 42, 0.7, 0.78);
const hobSame = one('declan', 42, 0.7, 0.78);
const hobLate = one('declan', 42, 0.7, 0.90);
check(!rich.broken && !hobSame.broken, 'a skilled 0.78 pull at 0.7 depth survives on rich tea and on a Hobnob');
check(rich.timeWet < hobSame.timeWet, `rich tea is in for less time than a Hobnob (${rich.timeWet.toFixed(2)}s vs ${hobSame.timeWet.toFixed(2)}s)`);
check(rich.score > hobSame.score, `a long rich tea dunk scores more than the same pull on a Hobnob (${rich.score} vs ${hobSame.score})`);
check(!hobLate.broken && hobLate.score > hobSame.score, `a Hobnob can stay in longer and still score well (${hobLate.score} > ${hobSame.score})`);

const broke = one('nigel', 99, 0.8, 0.995);
check(broke.broken && broke.score === 0, 'holding a rich tea until soak 0.995 breaks it, score 0');

const dry = one('maureen', 7, -0.1, 0.5);
check(dry.timeWet === 0 && dry.score === 0 && !dry.broken, 'never dipping the biscuit scores 0 and does not break');

const shallow = one('maureen', 11, 0.25, 0.8);
const deep = one('maureen', 11, 0.9, 0.8);
check(!shallow.broken && !deep.broken && deep.score > shallow.score, `deeper dunks score more for the same pull soak (${deep.score} > ${shallow.score})`);

const late = one('pip', 21, 0.7, 0.7);
const earlyPip = { ...late };
// ginger nut should still be short of a digestive's soak if we compare mid-way — just check the curve is 'late'
check(biscuitFor('pip').curve === 'late' && warningOf(0.86) === 'critical' && warningOf(0.70) === 'crack' && warningOf(0.55) === 'crumbs' && warningOf(0.4) === 'sag', 'warning stages and the ginger-nut late curve are wired up');

check(Object.keys(SIGNATURE).length === 6 && CHARACTERS.every((c) => SIGNATURE[c.id]), 'every Split the G drinker has a signature biscuit');

// A greedy rich-tea dunk should break more often than a skilled one
let gBreak = 0, sBreak = 0;
for (let i = 0; i < 80; i++) {
  if (one('nigel', 5000 + i, 0.8, 0.96).broken) gBreak++;
  if (one('nigel', 5000 + i, 0.65, 0.84).broken) sBreak++;
}
check(gBreak > sBreak + 20, `greedy rich-tea dunks break more than skilled ones (${gBreak}/80 vs ${sBreak}/80)`);

// pointsFor is deterministic
check(pointsFor(2, 1.5) === 300, 'points = round(integral × fragility × 100)');

if (fails) {
  console.log(`\n${fails} check(s) failed`);
  process.exit(1);
}
console.log('\nall tea dunk sim checks passed');
