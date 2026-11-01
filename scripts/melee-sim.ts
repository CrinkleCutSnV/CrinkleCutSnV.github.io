// Robot Rumble Melee: headless balance checks over many five-robot melees. `npm run check:melee`
// (MELEE_N = melees per build for the ranking pass; the work is shared out over worker threads.)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { createMelee, runMelee, stepMelee, challengers, alive, MELEE_LIMIT, type Melee } from '../src/scripts/robot-wars/melee';
import { randomBuild, rng, PART_IDS, PARTS, matchMul, matchup, type Build, type PartKind, type BrainId } from '../src/scripts/robot-wars/sim';

const N = Number(process.env.MELEE_N ?? 120); // melees per build, ranking pass
const FRESH = Number(process.env.MELEE_FRESH ?? 100); // fresh melees for each of the top-fifth builds
const AIM = 1600; // melees watched for who goes for whom
const all: Build[] = [];
for (const drive of PART_IDS.drive) for (const weapon of PART_IDS.weapon) for (const body of PART_IDS.body) for (const brain of PART_IDS.brain) all.push({ drive, weapon, body, brain });
const key = (a: Build) => `${a.drive}/${a.weapon}/${a.body}/${a.brain}`;

interface Job { task: 'rank' | 'fresh' | 'aim'; shard: number; shards: number; builds?: string[] }
interface Tally { n: number; nearest: number; weakest: number; busy: number; strong: number }
interface Out {
  builds: Record<string, [number, number]>; // share 1st, share top 3
  melees: number; inTime: number; dur: number; orderOk: number; place: number[];
  part: Record<string, { w: number; n: number }>;
  tal: Record<string, Tally>; onYou: number; fair: number; samples: number;
}

function work(job: Job): Out {
  const r = rng(20261101 + job.shard * 7919 + (job.task === 'fresh' ? 1e6 : job.task === 'aim' ? 2e6 : 0));
  const melee = (a: Build) => createMelee([{ name: 'You', build: a }, ...challengers(r, 'You')], Math.floor(r() * 2 ** 31));
  const o: Out = { builds: {}, melees: 0, inTime: 0, dur: 0, orderOk: 0, place: [0, 0, 0, 0, 0, 0], part: {}, tal: {}, onYou: 0, fair: 0, samples: 0 };
  if (job.task !== 'aim') {
    const list = job.task === 'rank' ? all.filter((_, i) => i % job.shards === job.shard) : all.filter((a) => job.builds!.includes(key(a))).filter((_, i) => i % job.shards === job.shard);
    const n = job.task === 'rank' ? N : FRESH;
    for (const a of list) {
      let f = 0, t3 = 0;
      for (let i = 0; i < n; i++) {
        const m = runMelee(melee(a));
        o.melees++; o.dur += m.t;
        if (m.reason === 'ko') o.inTime++;
        const p = m.place[0];
        o.place[p]++;
        if (p === 1) f++;
        if (p <= 3) t3++;
        for (const k of Object.keys(a) as PartKind[]) { const id = `${k}:${a[k]}`; o.part[id] ??= { w: 0, n: 0 }; o.part[id].n++; if (p === 1) o.part[id].w++; }
        // placings follow the knockouts: whoever went out first finished last
        const outs = m.events.filter((e) => e.kind === 'ko').map((e) => m.place[e.on!]);
        if (outs.every((q, j) => j === 0 || q < outs[j - 1]) && (outs.length === 0 || outs[0] === 5) && new Set(m.place).size === 5) o.orderOk++;
      }
      o.builds[key(a)] = [f / n, t3 / n];
    }
    return o;
  }
  // who goes for whom, sampled twice a second while three or more are still in
  for (const b of PART_IDS.brain) o.tal[b] = { n: 0, nearest: 0, weakest: 0, busy: 0, strong: 0 };
  for (let i = job.shard; i < AIM; i += job.shards) {
    const m: Melee = melee(randomBuild(r));
    let s = 0;
    while (!m.over) {
      stepMelee(m);
      if (++s % 30 || m.t < 2) continue;
      const live = alive(m);
      if (live.length < 3) continue;
      for (const me of live) {
        const tg = m.target[me.side];
        if (tg < 0 || m.place[tg] !== 0) continue;
        const rivals = live.filter((x) => x !== me);
        const d = (x: typeof me) => Math.hypot(x.x - me.x, x.y - me.y);
        const t = o.tal[me.build.brain]; t.n++;
        const it = m.bots[tg];
        const away = Math.abs(Math.atan2(Math.sin(Math.atan2(me.y - it.y, me.x - it.x) - it.heading), Math.cos(Math.atan2(me.y - it.y, me.x - it.x) - it.heading))) > 1.6;
        const theirs = m.target[it.side];
        if (it === rivals.reduce((a, b) => (d(b) < d(a) ? b : a))) t.nearest++;
        if (it === rivals.reduce((a, b) => (b.hp / b.maxHp < a.hp / a.maxHp ? b : a))) t.weakest++;
        if ((theirs >= 0 && theirs !== me.side) || away) t.busy++;
        if (matchMul(matchup(me.build.weapon, it.build.body)) === Math.max(...rivals.map((x) => matchMul(matchup(me.build.weapon, x.build.body))))) t.strong++;
      }
      if (m.place[0] === 0) { const rv = live.filter((b) => b.side !== 0); o.samples += rv.length; o.onYou += rv.filter((b) => m.target[b.side] === 0).length; o.fair += 1; }
    }
  }
  return o;
}

if (!isMainThread) parentPort!.postMessage(work(workerData as Job));
else main();

async function main() {
  let failures = 0;
  const check = (ok: boolean, msg: string) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures++; };
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const W = Math.max(1, Math.min(8, availableParallelism() - 1));
  const run = (task: Job['task'], builds?: string[]) => Promise.all([...Array(W).keys()].map((shard) => new Promise<Out>((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { task, shard, shards: W, builds } });
    w.once('message', res); w.once('error', rej);
  })));
  const merge = (outs: Out[]) => outs.reduce((a, b) => {
    Object.assign(a.builds, b.builds);
    a.melees += b.melees; a.inTime += b.inTime; a.dur += b.dur; a.orderOk += b.orderOk; b.place.forEach((v, i) => (a.place[i] += v));
    for (const [k, v] of Object.entries(b.part)) { a.part[k] ??= { w: 0, n: 0 }; a.part[k].w += v.w; a.part[k].n += v.n; }
    for (const [k, v] of Object.entries(b.tal)) { a.tal[k] ??= { n: 0, nearest: 0, weakest: 0, busy: 0, strong: 0 }; for (const f of Object.keys(v) as (keyof Tally)[]) a.tal[k][f] += v[f]; }
    a.onYou += b.onYou; a.fair += b.fair; a.samples += b.samples;
    return a;
  });
  const t0 = Date.now();
  // --- every build in melees against four random challengers ---
  const R = merge(await run('rank'));
  const sorted = Object.entries(R.builds).sort((x, y) => y[1][0] - x[1][0]);
  console.log(`${R.melees} melees (${N} per build, ${W} threads) in ${((Date.now() - t0) / 1000).toFixed(1)} s; average melee ${(R.dur / R.melees).toFixed(1)} s`);
  console.log(`best builds (share of 1st places): ${sorted.slice(0, 5).map(([k, v]) => `${k} ${pct(v[0])}`).join(', ')}`);
  console.log(`worst builds: ${sorted.slice(-3).map(([k, v]) => `${k} ${pct(v[0])}`).join(', ')}`);
  console.log(`a random build's placings: ${[1, 2, 3, 4, 5].map((p) => `${p}: ${pct(R.place[p] / R.melees)}`).join(' · ')}`);
  for (const k of Object.keys(PARTS) as PartKind[]) console.log(`  ${k.padEnd(7)} ${PART_IDS[k].map((id) => `${id} ${pct(R.part[`${k}:${id}`].w / R.part[`${k}:${id}`].n)}`).join('  ')}`);
  const first = R.place[1] / R.melees, podium = (R.place[1] + R.place[2] + R.place[3]) / R.melees;
  check(Math.abs(first - 0.2) < 0.025, `a random build finishes 1st ${pct(first)} of the time (about 20%)`);
  check(Math.abs(podium - 0.6) < 0.03, `and in the top 3 ${pct(podium)} (about 60%)`);
  check(sorted[0][1][0] < 0.6, `no build dominates: the best wins ${pct(sorted[0][1][0])} of its melees (< 60%)`);
  for (const k of Object.keys(PARTS) as PartKind[]) {
    const rs = PART_IDS[k].map((id) => R.part[`${k}:${id}`].w / R.part[`${k}:${id}`].n);
    check(Math.min(...rs) > 0.12 && Math.max(...rs) < 0.3, `every ${k} is viable: 1st place ${pct(Math.min(...rs))}–${pct(Math.max(...rs))} (12–30%)`);
  }
  check(R.inTime / R.melees > 0.75, `most melees end with one robot standing inside ${MELEE_LIMIT} s (${pct(R.inTime / R.melees)}); the rest go to health left`);
  check(R.orderOk === R.melees, `placings follow the knockouts: the first out finishes 5th (${R.orderOk}/${R.melees})`);

  // --- a sensible build: the top fifth of the ranking (51 of 256 builds), scored on fresh melees (so lucky streaks don't flatter them) ---
  const top = Object.entries(R.builds).sort((x, y) => y[1][0] + 0.5 * y[1][1] - (x[1][0] + 0.5 * x[1][1])).slice(0, 51).map(([k]) => k);
  const F = merge(await run('fresh', top));
  const sF = F.place[1] / F.melees, s3 = (F.place[1] + F.place[2] + F.place[3]) / F.melees;
  check(sF >= 0.25 && sF <= 0.35, `a sensible build (top fifth, ${F.melees} fresh melees) finishes 1st ${pct(sF)} (about 25–35%): that’s gold`);
  check(s3 >= 0.65 && s3 <= 0.75, `and on the podium (top 3) ${pct(s3)} (about 65–75%)`);
  const bestFresh = Object.entries(F.builds).sort((x, y) => y[1][0] - x[1][0])[0];
  console.log(`  the best of them on fresh melees: ${bestFresh[0]} 1st ${pct(bestFresh[1][0])}, top 3 ${pct(bestFresh[1][1])}`);
  check(bestFresh[1][0] < 0.6, 'still none wins over 60%');

  // --- who goes for whom ---
  const A = merge(await run('aim'));
  const f = (b: BrainId, k: keyof Tally) => A.tal[b][k] / A.tal[b].n;
  const others = (b: BrainId, k: keyof Tally) => Math.max(...PART_IDS.brain.filter((x) => x !== b).map((x) => f(x, k)));
  for (const b of PART_IDS.brain) console.log(`  ${b.padEnd(12)} goes for the nearest ${pct(f(b, 'nearest'))} · the most hurt ${pct(f(b, 'weakest'))} · someone busy or facing away ${pct(f(b, 'busy'))} · its best weapon matchup ${pct(f(b, 'strong'))}`);
  check(f('aggressive', 'nearest') > others('aggressive', 'nearest') + 0.1, 'aggressive computers go for the nearest robot most');
  check(f('conservative', 'weakest') > others('conservative', 'weakest'), 'conservative ones pick off the most hurt robot most');
  check(f('flanker', 'busy') > others('flanker', 'busy'), 'flankers go for robots busy with someone else, or facing away, most');
  check(f('tactician', 'strong') > others('tactician', 'strong') + 0.1, 'tacticians go for their best weapon-vs-body matchup most');
  check(Math.abs(A.onYou / A.samples - A.fair / A.samples) < 0.03, `nobody mobs you: ${pct(A.onYou / A.samples)} of the challengers go for you; a fair share is ${pct(A.fair / A.samples)}`);
  console.log(`(${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  console.log(failures ? `\n${failures} failure(s)` : '\nall melee checks pass');
  process.exit(failures ? 1 : 0);
}
