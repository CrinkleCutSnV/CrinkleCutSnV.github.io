// Split the G: the pint, the drinkers and the gulp. Pure maths, no DOM, so the sim can run it.
import { SPLIT_MEDALS } from '../../data/medals';
//
// Units: millimetres for heights in the glass (measured up from the inside of the base),
// millilitres per second for how fast the stout goes. The beer line drops at
// flow / (cross-section area at that height), so it falls faster where the glass is narrow.

/** The parody brand on the glass. Change it here and it changes everywhere. */
export const BRAND = 'Guzzness';

export const FIXED_DT = 1 / 240;

/** localStorage: closest split overall, and per drinker */
export const BEST_KEY = 'crinklecut.splitTheG.best';
export const bestKeyFor = (id: string) => `crinklecut.splitTheG.best.${id}`;

// ---- the glass ----------------------------------------------------------------------
export const GLASS = {
  height: 160, // inside height, mm
  base: 11, // thickness of the glass foot, mm
};

/** Inside radius (mm) at height v: a tulip pint, narrow foot, bulge near the top, slight in-curve at the rim. */
export function radiusAt(v: number) {
  const s = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
  return 26.5 + 12 * s(v / 118) + 2.2 * Math.exp(-(((v - 132) / 14) ** 2)) - 1.6 * s((v - 136) / 24);
}
export const areaAt = (v: number) => Math.PI * radiusAt(v) ** 2; // mm²

// ---- the G on the glass ---------------------------------------------------------------
/**
 * The G printed on the glass, in mm (v = height above the inside of the foot, u = across, centre 0).
 * A thin, elegant G: an open ring from a curly terminal at the top right, anticlockwise over the
 * top, down the left and round the bottom, up to a horizontal bar on the lower right.
 * Both the artwork (scene.ts) and the scoring read these numbers, so they can't drift apart.
 */
export const G_MARK = Object.freeze((() => {
  const cy = 92.6; // centre of the G's ring
  const R = 15; // ring radius (centreline of the stroke)
  const startAngle = (40 * Math.PI) / 180; // where the ring ends at the top right, above horizontal
  const curlR = 2.7; // the curl tucks inside the ring at that end
  const barDrop = 0.24; // bar sits this fraction of R below the centre: the G's bar is low
  const barY = cy - barDrop * R;
  const barEndAngle = -Math.asin(barDrop); // the ring comes up the right side to meet the bar
  const curl = { u: (R - curlR) * Math.cos(startAngle), v: cy + (R - curlR) * Math.sin(startAngle) }; // centre of the curl
  return {
    cy, R, startAngle, curlR, barY, barEndAngle,
    barFrom: R * Math.cos(barEndAngle), // bar runs from the ring...
    barTo: R * 0.18, // ...in towards the middle
    curl,
    stroke: { thin: 0.55, thick: 1.5 }, // mm: hairline at top and bottom, thicker down the left
    bottom: cy - R,
    top: cy + R,
    /** a perfect split: exactly halfway between the bar and the curly end at the top */
    target: (barY + curl.v) / 2,
  };
})());
export const TARGET = G_MARK.target;

// ---- the drinkers ---------------------------------------------------------------------
export type Expression = 'idle' | 'drinking' | 'happy' | 'chuffed' | 'gutted' | 'nervous';

export interface Look {
  skin: string;
  shirt: string;
  hair: string;
  kind: 'human' | 'walrus';
  style: 'bob' | 'beard' | 'parting' | 'curls' | 'walrus' | 'bald';
  glasses?: boolean;
  extra?: 'tie' | 'hoops' | 'earrings' | 'bowtie' | 'cardigan' | 'flatcap';
}

export interface Quips {
  before: string[]; great: string[]; good: string[]; bad: string[];
  /** said with the empty glass upside down on their head (they drank the lot) */
  hat: string[];
}

export interface Character {
  id: string;
  name: string;
  /** one-line personality for the line-up card */
  tagline: string;
  /** the drinking quirk, in plain words */
  quirk: string;
  difficulty: 1 | 2 | 3 | 4;
  /** base flow in ml/s */
  flow: number;
  /** how long the glass takes to come back down after you let go (s): more = more beer after release */
  lag: number;
  /** glass tilt while drinking (degrees) */
  tilt: number;
  look: Look;
  quips: Quips;
}

export const CHARACTERS: Character[] = [
  {
    id: 'maureen',
    name: 'Maureen “The Metronome”',
    tagline: 'Retired choir mistress. Has never once been off the beat.',
    quirk: 'Steady as you like: the same pace from first sip to last.',
    difficulty: 1,
    flow: 98, lag: 0.22, tilt: 14,
    look: { kind: 'human', skin: '#f5c9a8', shirt: '#7b5ea7', hair: '#cfd3da', style: 'bob', glasses: true, extra: 'cardigan' },
    quips: {
      before: ['Nice and steady. One-two, one-two…', 'Tempo, dear. Everything is tempo.', 'Shush now, I’m counting.'],
      hat: ['And that, my dears, is what we call a full rest.', 'Every hymn deserves a big finish. This one’s mine.', 'Steady to the last drop. Does it go with the cardigan?'],
      great: ['And… rest. Perfectly in time.', 'Bravo. Encore? Maybe next week.'],
      good: ['Hm. Half a beat out.', 'Not bad. The altos would be proud.'],
      bad: ['Someone has moved the G. I’m sure of it.', 'Dreadful. I lost count.'],
    },
  },
  {
    id: 'declan',
    name: 'Big Declan',
    tagline: 'Rugby prop. Gentle giant. Not a gentle drinker.',
    quirk: 'Huge gulps, fast drain, and the glass takes ages to come back down.',
    difficulty: 4,
    flow: 150, lag: 0.34, tilt: 24,
    look: { kind: 'human', skin: '#f2b896', shirt: '#2f8f5b', hair: '#c4552b', style: 'beard', extra: 'hoops' },
    quips: {
      before: ['Stand back, lads. I’m going in.', 'One gulp. How hard can it be?', 'Scrum down!'],
      hat: ['Scrum cap, sorted.', 'Didn’t touch the sides. Fits like a glove, mind.', 'Who needs a split when you can have a helmet?'],
      great: ['TRY! Over the line, right on the G!', 'Ha! Soft hands, me.'],
      good: ['Ah, close enough for the front row.', 'Not bad for a big lad.'],
      bad: ['It went down a bit quick there…', 'Ah, I’ve no brakes, me.'],
    },
  },
  {
    id: 'nigel',
    name: 'Nervous Nigel',
    tagline: 'Accountant. Triple-checks the bill. Hates being watched.',
    quirk: 'Stop-start sips: a nervous little gulp, a pause, another gulp…',
    difficulty: 3,
    flow: 135, lag: 0.17, tilt: 12,
    look: { kind: 'human', skin: '#f7d2b6', shirt: '#dfe9f2', hair: '#6b4a2b', style: 'parting', glasses: true, extra: 'tie' },
    quips: {
      before: ['Oh gosh. Everyone’s watching, aren’t they?', 'Right. Okay. Okay. Right.', 'I’ve done a spreadsheet on this.'],
      hat: ['I panicked. Now I’m a lampshade.', 'Is this… is this the done thing? It feels like the done thing.', 'This was not in the spreadsheet.'],
      great: ['I… I did it? I did it!', 'Within tolerance! Lovely.'],
      good: ['That’s a rounding error, surely.', 'Close. I’ll be thinking about it all week.'],
      bad: ['Oh no. Oh no no no.', 'Can we pretend that didn’t happen?'],
    },
  },
  {
    id: 'dot',
    name: 'Auntie Dot',
    tagline: 'Life and soul of every wedding. Always “just having a little one”.',
    quirk: 'Starts with dainty sips, then really warms up: she speeds up as she goes.',
    difficulty: 3,
    flow: 66, lag: 0.25, tilt: 16,
    look: { kind: 'human', skin: '#e9b48f', shirt: '#ef6f8e', hair: '#b5432f', style: 'curls', extra: 'earrings' },
    quips: {
      before: ['Just a little sip, love…', 'Oh go on then. For the craic.', 'Watch your Auntie Dot, now.'],
      hat: ['Ooh, a fascinator! Very Ascot.', 'Squashes the curls, but you can’t have everything.', 'I’ll wear it to the next wedding, so I will.'],
      great: ['Ooh! Look at that! Somebody take a picture!', 'Still got it, darling.'],
      good: ['Ooh, nearly! I got a bit carried away.', 'Close! Don’t tell your uncle.'],
      bad: ['Oops! Got into the swing of it there.', 'Well, that went quick, didn’t it?'],
    },
  },
  {
    id: 'walter',
    name: 'Walter the Walrus',
    tagline: 'Retired sea captain. Magnificent moustache. Wobbly rhythm.',
    quirk: 'His pace rolls in and out like the tide: fast, slow, fast again.',
    difficulty: 3,
    flow: 108, lag: 0.26, tilt: 18,
    look: { kind: 'walrus', skin: '#a88466', shirt: '#22406e', hair: '#e8dcc6', style: 'walrus', extra: 'flatcap' },
    quips: {
      before: ['Mind the moustache. Here we go.', 'Steady as she goes…', 'Ahoy. Fetch me that G.'],
      hat: ['Captain’s hat, mark two. Shipshape!', 'Glass overboard! Oh no, it’s on me head.', 'Empty hold, fine hat. Steady as she goes.'],
      great: ['Ha-harr! Dead on the G!', 'Smooth seas, me hearties.'],
      good: ['A fair wind, but a touch off course.', 'Close. The tide turned on me.'],
      bad: ['Man overboard!', 'The moustache drank more than I did.'],
    },
  },
  {
    id: 'pip',
    name: 'Professor Pip',
    tagline: 'Physicist. Has a theory about foam. Will tell you about it.',
    quirk: 'Opens with a bold swig, then slows right down as he overthinks it.',
    difficulty: 2,
    flow: 124, lag: 0.2, tilt: 15,
    look: { kind: 'human', skin: '#f3c7a5', shirt: '#9c7b4f', hair: '#e6e6e6', style: 'bald', glasses: true, extra: 'bowtie' },
    quips: {
      before: ['Fascinating. The foam is a non-Newtonian marvel.', 'By my calculations, a bold opening swig.', 'Observe: science.'],
      hat: ['For science, I’ve drunk the control sample.', 'A pint has a fixed volume. A hat, it turns out, does not.', 'Peer review pending, but I believe this suits me.'],
      great: ['Quod erat demonstrandum.', 'Exactly as the model predicted.'],
      good: ['Within experimental error. Broadly.', 'A promising result. Needs more data.'],
      bad: ['The model requires… adjustments.', 'Clearly the glass is non-standard.'],
    },
  },
];
export const characterById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];

// ---- randomness ----------------------------------------------------------------------
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- one pint --------------------------------------------------------------------------
export type Phase = 'ready' | 'drinking' | 'stopping' | 'settling' | 'done';

export interface Pint {
  char: Character;
  /** the random bits for this pint, fixed when it is poured */
  q: number; // flow multiplier
  lag: number; // s
  settleRise: number; // mm the line creeps back up as the head drains
  /** mm of head gone once you've had the lot (it leaves just a wisp) */
  drained: number;
  phases: [number, number]; // for the wobbly drinker
  sips: number[]; // for the stuttering drinker: alternating gulp/pause lengths (s)
  gulps: number[]; // …and how big each gulp is (the odd panicky big one)
  start: number; // where the line starts (mm)
  head: number; // head thickness (mm)
  // live state
  phase: Phase;
  t: number; // seconds of drinking
  flow: number; // current ml/s
  line: number; // beer-to-head line (mm), before settling
  settleT: number;
  /** lowest the head top has been: foam left clinging to the glass above this */
  lacing: number;
  emptied: boolean;
}

/** Head thickness (mm) on every pint. */
export const HEAD_MM = 18;

export function pourPint(char: Character, seed: number): Pint {
  const r = rng(seed);
  const sips: number[] = [];
  const gulps: number[] = [];
  for (let i = 0; i < 40; i++) { sips.push(i % 2 === 0 ? 0.22 + r() * 0.26 : 0.16 + r() * 0.34); gulps.push(r() < 0.25 ? 1.7 + r() * 0.4 : 0.7 + r() * 0.5); }
  const start = 138 + r() * 4;
  r(); // (was a random head size; kept so every other random draw, and so the sim, is unchanged)
  const head = HEAD_MM; // every pint gets the same head, so the drinker's-eye view of a level is always the same
  return {
    char,
    q: 0.9 + r() * 0.2,
    lag: char.lag * (0.75 + r() * 0.5),
    settleRise: 0.8 + r() * 2.6,
    phases: [r() * Math.PI * 2, r() * Math.PI * 2],
    sips, gulps,
    start, head,
    phase: 'ready', t: 0, flow: 0, line: start, settleT: 0, lacing: start + head, emptied: false, drained: 0,
  };
}

/** How hard this drinker wants to be drinking t seconds into the gulp (× their base flow). */
export function paceAt(p: Pint, t: number): number {
  switch (p.char.id) {
    case 'declan': return 1;
    case 'nigel': {
      // gulp, pause, gulp, pause… with soft edges
      let acc = 0;
      for (let i = 0; i < p.sips.length; i++) {
        const len = p.sips[i];
        if (t < acc + len) {
          if (i % 2 === 1) return 0.06;
          const x = (t - acc) / len;
          return Math.min(1, Math.sin(Math.PI * x) * 1.6) * p.gulps[i];
        }
        acc += len;
      }
      return 0.5;
    }
    case 'dot': return Math.min(2.6, 0.45 + 0.85 * t + 0.12 * t * t);
    case 'walter': return 1 + 0.5 * Math.sin((2 * Math.PI * t) / 1.15 + p.phases[0]) + 0.18 * Math.sin((2 * Math.PI * t) / 0.41 + p.phases[1]);
    case 'pip': return 0.42 + 1.45 * Math.exp(-t / 1.1);
    default: return 1 + 0.03 * Math.sin(t * 9 + p.phases[0]);
  }
}

const RAMP = 0.12; // s to get the glass tipped and the stout flowing
const EMPTY_AT = 14; // mm: you've had the lot
/** mm of foam left in the bottom of a drained glass: just a wisp */
export const WISP = 1.2;
const SLURP = 70; // mm/s: the last of the stout and the head going down once you've had the lot
const SETTLE_TIME = 0.45; // s, time constant of the head draining back
export const SETTLE_DONE = 1.7; // s after the flow stops before the ref calls it

/** The line you'd see now, settling included. */
export const visibleLine = (p: Pint) => p.line + p.settleRise * (1 - Math.exp(-p.settleT / SETTLE_TIME));
/** Head thickness now (it shrinks by what it gives back to the beer). */
export const headNow = (p: Pint) => p.head - (visibleLine(p) - p.line) * 0.8 - p.drained;

export function startDrinking(p: Pint) { if (p.phase === 'ready') p.phase = 'drinking'; }
export function stopDrinking(p: Pint) { if (p.phase === 'drinking') p.phase = 'stopping'; }

export function step(p: Pint, dt = FIXED_DT) {
  if (p.phase === 'drinking') {
    p.t += dt;
    const want = p.char.flow * p.q * Math.max(0, paceAt(p, p.t));
    p.flow += (want - p.flow) * (1 - Math.exp(-dt / RAMP));
  } else if (p.phase === 'stopping') {
    p.flow *= Math.exp(-dt / p.lag);
    if (p.flow < 0.4) { p.flow = 0; p.phase = 'settling'; }
  } else if (p.phase === 'settling') {
    p.settleT += dt;
    if (p.emptied) {
      // you've had the lot: the dregs and the head go too, leaving lacing and a wisp of foam
      p.line = Math.max(0, p.line - SLURP * dt);
      p.drained = Math.min(p.head - WISP, p.drained + SLURP * dt);
      p.lacing = Math.min(p.lacing, p.line + headNow(p));
    }
    if (p.settleT >= SETTLE_DONE) p.phase = 'done';
  }
  if (p.flow > 0) {
    p.line -= (p.flow * 1000 * dt) / areaAt(p.line);
    p.lacing = Math.min(p.lacing, p.line + p.head);
    if (p.line <= EMPTY_AT) { p.line = EMPTY_AT; p.flow = 0; p.emptied = true; p.settleRise = 0; p.phase = 'settling'; }
  }
}

/** Where the line would end up if you let go right now. */
export function predictFinal(p: Pint) {
  const c: Pint = { ...p };
  stopDrinking(c);
  while (c.phase !== 'done') step(c);
  return visibleLine(c);
}

/** Run a whole gulp, letting go `release` seconds in. Used by the sim. */
export function simulate(p: Pint, release: (p: Pint) => boolean) {
  startDrinking(p);
  while (p.phase === 'drinking') { step(p); if (release(p)) stopDrinking(p); }
  while (p.phase !== 'done') step(p);
  return visibleLine(p);
}

// ---- judging ------------------------------------------------------------------------------
export interface Verdict {
  /** distance from a perfect split, mm, to 0.1 */
  mm: number;
  /** + = line above the split line (not enough drunk), − = below */
  signed: number;
  rating: string;
  remark: string;
  band: 'perfect' | 'great' | 'good' | 'fair' | 'miss';
}

export function judge(line: number, emptied = false, pick = Math.random): Verdict {
  const signed = Math.round((line - TARGET) * 10) / 10;
  const mm = Math.abs(signed);
  const high = signed > 0;
  const any = (a: string[]) => a[Math.floor(pick() * a.length)];
  const { gold, silver, bronze } = SPLIT_MEDALS.thresholds;
  if (emptied) return { mm, signed, band: 'miss', rating: 'Glass hat!', remark: 'That’s not splitting the G, that’s finishing the pint! No medal, but what a hat.' };
  if (mm <= 0.3) return { mm, signed, band: 'perfect', rating: 'Split the G!', remark: any(['Bang through the middle. Absolute textbook.', 'Perfect. Somebody frame that pint.', 'Smack between the bar and the curl. Take a bow.']) };
  if (mm <= gold) return { mm, signed, band: 'great', rating: 'Split the G!', remark: high ? 'A hair high, but that’s a split in any pub.' : 'A whisker low, but the G is well and truly split.' };
  if (mm <= silver) return { mm, signed, band: 'good', rating: 'So close!', remark: high ? 'Just shy: you’re creeping up towards the curl.' : 'A touch too far: you’re heading for the bar.' };
  if (mm <= bronze) return { mm, signed, band: 'fair', rating: line <= G_MARK.curl.v && line >= G_MARK.barY ? 'Between the bar and the curl, at least' : line <= G_MARK.top && line >= G_MARK.bottom ? 'On the G, at least' : 'Close, but no cigar', remark: high ? 'Still up by the curl. Be braver!' : 'Down past the bar. Ease off sooner.' };
  return { mm, signed, band: 'miss', rating: 'Not even close, pal', remark: high ? 'Didn’t even trouble the G. That was a sip, not a gulp!' : 'You’ve drunk the G clean off the glass!' };
}
