// Tea Dunk: biscuits, dunkers and soak. Pure maths, no DOM, so the sim can run it.
import { CHARACTERS, characterById, rng, type Character } from '../split-the-g/physics';

export const FIXED_DT = 1 / 240;
export const ROUNDS = 3;

/** localStorage: best three-biscuit total, and best successful dunk per dunker */
export const BEST_KEY = 'crinklecut.teaDunk.best';
export const bestKeyFor = (id: string) => `crinklecut.teaDunk.best.${id}`;

// How far above the tea the biscuit starts / rests (in "depth" units: 0 = tip at the surface, 1 = fully in).
export const RAISE_CLEAR = 0.18;
export const LOWER_SPEED = 1.15; // depth units per second, down
export const RAISE_SPEED = 1.55; // a little quicker on the way out, so you can still escape a close one
/** After the biscuit is clear of the tea, a short drip before the dunk is judged. */
export const CLEAR_TIME = 0.35;
/** The soggy piece has this long to plop in before we show the miss. */
export const BREAK_TIME = 1.05;
/** Points = depth-integral × fragility × this. */
export const SCORE_SCALE = 100;

// ---- biscuits ------------------------------------------------------------------------
export type BiscuitKind = 'rich-tea' | 'digestive' | 'chocolate-digestive' | 'custard-cream' | 'ginger-nut' | 'hobnob';
export type SoakCurve = 'steady' | 'late';

export interface Biscuit {
  id: BiscuitKind;
  name: string;
  /** one-line flavour for the Up next card and the line-up */
  tagline: string;
  /** plain-English feel, e.g. "Fragile — don't hang about" */
  feel: string;
  /** 1 = most fragile, 5 = sturdiest */
  stoutness: 1 | 2 | 3 | 4 | 5;
  /** soak per second at full depth (before the curve) */
  absorb: number;
  /** score multiplier: a long dunk with a fragile biscuit scores well */
  fragility: number;
  /** 'late' holds firm, then suddenly softens (ginger nut) */
  curve: SoakCurve;
  /** dough / coating colours, for the drawing */
  dough: string;
  edge: string;
  /** relative size (1 is a standard digestive) */
  width: number;
  length: number;
}

export const BISCUITS: Biscuit[] = [
  {
    id: 'rich-tea',
    name: 'Rich tea',
    tagline: 'Thin, pale and famous for its tragic endings.',
    feel: 'Fragile — a few bold seconds, then get out.',
    stoutness: 1,
    absorb: 0.72,
    fragility: 4.15,
    curve: 'steady',
    dough: '#e6c58a',
    edge: '#c9a05e',
    width: 0.92,
    length: 0.88,
  },
  {
    id: 'digestive',
    name: 'Digestive',
    tagline: 'The everyday classic. No fuss, no frosting, no surprises.',
    feel: 'A steady, honest dunk. Reliable as a metronome.',
    stoutness: 3,
    absorb: 0.38,
    fragility: 1.55,
    curve: 'steady',
    dough: '#c99555',
    edge: '#a06e34',
    width: 1,
    length: 1,
  },
  {
    id: 'chocolate-digestive',
    name: 'Chocolate digestive',
    tagline: 'A proper one: chocolate on one side, crumbs on the other.',
    feel: 'Sturdy, and the chocolate buys you a moment.',
    stoutness: 4,
    absorb: 0.30,
    fragility: 1.28,
    curve: 'steady',
    dough: '#c08a48',
    edge: '#8a5a28',
    width: 1.08,
    length: 1.06,
  },
  {
    id: 'custard-cream',
    name: 'Custard cream',
    tagline: 'Two little biscuits with a blob of cream in the middle.',
    feel: 'The cream can squidge, so don’t get carried away.',
    stoutness: 2,
    absorb: 0.50,
    fragility: 1.95,
    curve: 'steady',
    dough: '#f0d7a0',
    edge: '#d4b06a',
    width: 0.86,
    length: 1.12,
  },
  {
    id: 'ginger-nut',
    name: 'Ginger nut',
    tagline: 'Hard as a hypothesis, until it isn’t.',
    feel: 'Holds firm, then suddenly gives. Watch it closely.',
    stoutness: 4,
    absorb: 0.31,
    fragility: 1.18,
    curve: 'late',
    dough: '#c46a2b',
    edge: '#8d3f12',
    width: 0.9,
    length: 0.9,
  },
  {
    id: 'hobnob',
    name: 'Hobnob',
    tagline: 'Oaty, thick and built like a prop. A proper stayer.',
    feel: 'Sturdy — you can be brave, but don’t get cocky.',
    stoutness: 5,
    absorb: 0.21,
    fragility: 1.12,
    curve: 'steady',
    dough: '#b07a38',
    edge: '#7a4e1c',
    width: 1.06,
    length: 1.04,
  },
];

export const biscuitById = (id: string) => BISCUITS.find((b) => b.id === id) ?? BISCUITS[0];

/**
 * Each Split the G regular has a signature biscuit that fits them.
 * Maureen the metronome: a plain digestive. Big Declan: a sturdy Hobnob.
 * Nervous Nigel: a fragile rich tea. Auntie Dot: a custard cream.
 * Walter the Walrus: a big chocolate digestive. Professor Pip: a ginger nut.
 */
export const SIGNATURE: Record<string, BiscuitKind> = {
  maureen: 'digestive',
  declan: 'hobnob',
  nigel: 'rich-tea',
  dot: 'custard-cream',
  walter: 'chocolate-digestive',
  pip: 'ginger-nut',
};

export const biscuitFor = (char: Character | string) => biscuitById(SIGNATURE[typeof char === 'string' ? char : char.id] ?? 'digestive');

export const dunkers = () => CHARACTERS.map((c) => ({ char: c, biscuit: biscuitFor(c) }));

// ---- quips (dunk-specific; the pint lines stay on Split the G) ------------------------
export interface DunkQuips {
  before: string[];
  /** a solid, sensible dunk */
  good: string[];
  /** pulled out late and got away with it */
  great: string[];
  /** barely dipped it */
  timid: string[];
  break: string[];
}

export const QUIPS: Record<string, DunkQuips> = {
  maureen: {
    before: ['Nice and steady. In, and out, on the beat.', 'Tempo, dear. Everything is tempo.', 'I shall count us in. One, two…'],
    good: ['And… rest. Perfectly in time.', 'Clean as a bar line. The altos would be proud.'],
    great: ['Right up to the fermata. Bravo.', 'A little lingering, but still in time. Encore?'],
    timid: ['A tad early, dear. The second movement had barely begun.', 'Half a beat short. Next time, hold the note.'],
    break: ['Dreadful. I lost count, and then I lost the biscuit.', 'Someone has moved the tea. I’m sure of it.'],
  },
  declan: {
    before: ['Stand back, lads. I’m going in.', 'One dunk. How hard can it be?', 'Scrum down!'],
    good: ['Ha! Built like a prop, this one.', 'Soft hands, me. And a sturdy biscuit helps.'],
    great: ['TRY! Right down to the last oat.', 'That’s how the front row dunks.'],
    timid: ['Ah, I barely got it wet. Call that a dunk?', 'A bit timid for a big lad. I’ll go again.'],
    break: ['It went down a bit quick there…', 'Ah, I’ve no brakes, me. That’s one for the tea.'],
  },
  nigel: {
    before: ['Oh gosh. Everyone’s watching, aren’t they?', 'Right. Okay. Okay. Right. Just a little dip.', 'I’ve done a spreadsheet on the soak times.'],
    good: ['I… I did it? I did it!', 'Within tolerance! Lovely. I’ll just… sit down.'],
    great: ['That was the full calculated window. I think I need a lie-down.', 'Within tolerance, just. Don’t ask me to do it again immediately.'],
    timid: ['I bottled it. I know I bottled it.', 'That’s a conservative estimate. I’ll be thinking about it all week.'],
    break: ['Oh no. Oh no no no. It’s gone. It’s actually gone.', 'Can we pretend that didn’t happen? I’ll put it in the minutes as “spillage”.'],
  },
  dot: {
    before: ['Just a little dunk, love…', 'Oh go on then. For the craic.', 'Watch your Auntie Dot, now.'],
    good: ['Ooh! Look at that! Somebody take a picture!', 'Still got it, darling. Not a crumb out of place.'],
    great: ['Ooh, I left it in a second longer than I meant to… and it held! Still got it.', 'A daring little one. Don’t tell your uncle how close that was.'],
    timid: ['Just a little one, like I said. Perhaps a smidge more next time.', 'Ooh, I bottled it. I’m usually braver after the second cup.'],
    break: ['Oops! Got into the swing of it there.', 'Well, that went quick, didn’t it? I’ll have another, shall I?'],
  },
  walter: {
    before: ['Mind the moustache. And the chocolate. Here we go.', 'Steady as she goes…', 'Ahoy. Fetch me that mug.'],
    good: ['A fair dunk, and the chocolate survived the voyage.', 'Smooth seas, me hearties. Not a drop on the jacket.'],
    great: ['Ha-harr! Held her in the swell and brought her home!', 'Close to the rocks, but we cleared them. Fine dunking.'],
    timid: ['A touch shy of the harbour. The tide turned me early.', 'Barely got her keel wet. Next time I’ll be braver.'],
    break: ['Man overboard! The chocolate’s gone to Davy Jones.', 'The moustache copped more of that than I did.'],
  },
  pip: {
    before: ['Fascinating. A porous solid in a hot liquid. Observe.', 'By my calculations, a controlled immersion.', 'The ginger nut is an excellent test case. Science.'],
    good: ['Exactly as the model predicted.', 'A tidy result. I’ll write it up later.'],
    great: ['Quod erat demonstrandum. Right up to the failure envelope.', 'A daring data point, but reproducible. I hope.'],
    timid: ['A conservative trial. The model can take more than that.', 'Within experimental error, but rather a small sample.'],
    break: ['The model requires… adjustments.', 'A structural failure. Fascinating. Also: my biscuit is gone.'],
  },
};

export function quipsFor(id: string): DunkQuips {
  return QUIPS[id] ?? QUIPS.maureen;
}

export function pickLine(lines: string[], seed: number) {
  const r = rng(seed);
  return lines[Math.floor(r() * lines.length)] ?? lines[0];
}

/** How daring a finished dunk was, for the reaction line. */
export function resultTone(d: Dunk): 'break' | 'great' | 'timid' | 'good' {
  if (d.broken) return 'break';
  if (d.peakSoak >= 0.82) return 'great';
  if (d.peakSoak < 0.42 || d.depthIntegral < 0.35) return 'timid';
  return 'good';
}

// ---- one dunk ------------------------------------------------------------------------
export type DunkPhase = 'ready' | 'dunking' | 'lifting' | 'breaking' | 'result';

export type Warning = 'none' | 'dark' | 'sag' | 'crumbs' | 'crack' | 'critical';

export interface Dunk {
  char: Character;
  biscuit: Biscuit;
  seed: number;
  /** rolled absorbency for this dunk (a little variation, warning signs still follow the real soak) */
  absorb: number;
  phase: DunkPhase;
  t: number;
  holding: boolean;
  /** -RAISE_CLEAR .. 1. 0 = the tip has just met the tea. */
  depth: number;
  soak: number;
  peakSoak: number;
  timeWet: number;
  /** deepest the biscuit has been this dunk, for the wet stain */
  peakDepth: number;
  /** ∫ max(0, depth) dt, in seconds */
  depthIntegral: number;
  broken: boolean;
  score: number;
  /** seconds the biscuit has been clear after a wet dunk */
  clearT: number;
  /** seconds since it snapped */
  breakT: number;
  /** 0..1, used by the drawing for the falling piece and the splash */
  fall: number;
}

export function pourDunk(char: Character, seed: number): Dunk {
  const r = rng(seed);
  const biscuit = biscuitFor(char);
  return {
    char,
    biscuit,
    seed,
    absorb: biscuit.absorb * (0.95 + r() * 0.1),
    phase: 'ready',
    t: 0,
    holding: false,
    depth: -RAISE_CLEAR,
    soak: 0,
    peakSoak: 0,
    timeWet: 0,
    peakDepth: 0,
    depthIntegral: 0,
    broken: false,
    score: 0,
    clearT: 0,
    breakT: 0,
    fall: 0,
  };
}

export function setHolding(d: Dunk, holding: boolean) {
  if (d.phase === 'breaking' || d.phase === 'result') return;
  d.holding = holding;
}

/** Soak rate at this depth and current soak (the ginger nut speeds up as it goes). */
export function soakRate(d: Pick<Dunk, 'absorb' | 'biscuit' | 'depth' | 'soak'>): number {
  if (d.depth <= 0) return 0;
  const base = d.absorb * (0.18 + 0.82 * d.depth);
  if (d.biscuit.curve === 'late') return base * (0.9 + 2.2 * Math.pow(Math.max(0, d.soak - 0.48), 2));
  return base;
}

export function pointsFor(depthIntegral: number, fragility: number) {
  return Math.round(depthIntegral * fragility * SCORE_SCALE);
}

export function warningOf(soak: number): Warning {
  if (soak >= 0.82) return 'critical';
  if (soak >= 0.66) return 'crack';
  if (soak >= 0.52) return 'crumbs';
  if (soak >= 0.36) return 'sag';
  if (soak > 0.04) return 'dark';
  return 'none';
}

export function step(d: Dunk, dt: number) {
  if (d.phase === 'result') return;
  d.t += dt;

  if (d.phase === 'breaking') {
    d.breakT += dt;
    d.fall = Math.min(1, d.breakT / 0.55);
    if (d.breakT >= BREAK_TIME) {
      d.phase = 'result';
      d.score = 0;
    }
    return;
  }

  if (d.holding) {
    d.depth = Math.min(1, d.depth + LOWER_SPEED * dt);
    if (d.phase === 'ready' || d.phase === 'lifting') d.phase = 'dunking';
  } else {
    d.depth = Math.max(-RAISE_CLEAR, d.depth - RAISE_SPEED * dt);
    if (d.phase === 'dunking') d.phase = 'lifting';
    if (d.depth <= 0 && d.timeWet === 0) d.phase = 'ready';
  }

  if (d.depth > 0) {
    d.soak = Math.min(1.25, d.soak + soakRate(d) * dt);
    d.peakSoak = Math.max(d.peakSoak, d.soak);
    d.timeWet += dt;
    d.peakDepth = Math.max(d.peakDepth, d.depth);
    d.depthIntegral += d.depth * dt;
    d.clearT = 0;
    if (d.soak >= 1) {
      d.phase = 'breaking';
      d.broken = true;
      d.score = 0;
      d.holding = false;
      d.breakT = 0;
      d.fall = 0;
      d.soak = 1;
      d.peakSoak = 1;
    }
  } else if (d.timeWet > 0 && !d.holding && (d.phase === 'lifting' || d.phase === 'dunking')) {
    d.phase = 'lifting';
    d.clearT += dt;
    if (d.clearT >= CLEAR_TIME) {
      d.phase = 'result';
      d.score = pointsFor(d.depthIntegral, d.biscuit.fragility);
    }
  }
}

/** Run a dunk with a fixed dt until it is judged. */
export function runUntilResult(d: Dunk, input: (d: Dunk) => boolean, maxT = 30) {
  const steps = Math.ceil(maxT / FIXED_DT);
  for (let i = 0; i < steps && d.phase !== 'result'; i++) {
    setHolding(d, input(d));
    step(d, FIXED_DT);
  }
  return d;
}

/**
 * A scripted dunk for the sim and the tests: lower to `targetDepth`, hold until
 * `pullSoak` (or until it breaks), then lift out.
 */
export function scriptedDunk(char: Character, seed: number, targetDepth: number, pullSoak: number): Dunk {
  const d = pourDunk(char, seed);
  return runUntilResult(d, (cur) => {
    if (cur.phase === 'breaking' || cur.phase === 'result') return false;
    if (cur.soak >= pullSoak) return false;
    // Feather the hold so the biscuit hovers around targetDepth (the real game is binary:
    // hold to lower, release to lift). A target at or above the tea means "don't dip".
    if (cur.depth < targetDepth) return true;
    if (targetDepth <= 0) return false;
    return cur.depth < targetDepth + 0.03;
  });
}

export { CHARACTERS, characterById, rng };
