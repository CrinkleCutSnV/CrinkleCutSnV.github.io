// The "My best scores" page is built from this list. To add a new game's scores:
// 1. save its best in localStorage with saveRecord(key, value) from src/scripts/scores.ts
//    (that also stores the date the record was set), and
// 2. add an entry below with the same key. The page, the empty state and "Reset scores"
//    all pick it up automatically.
import { HOLES } from '../scripts/disc-golf/physics';
import { BEST_KEY as SPLIT_BEST, CHARACTERS, bestKeyFor } from '../scripts/split-the-g/physics';
import { DISC_GOLF_MEDALS, MELEE_MEDALS, PLANE_MEDALS, ROBOT_MEDALS, SPLIT_MEDALS, type MedalRule } from './medals';
import { BEST_STREAK_KEY, MELEE_BEST_KEY } from '../scripts/robot-wars/keys';

export type ScoreFormat =
  | { kind: 'metres'; decimals?: number }
  /** golf-style: fewer is better, shown with the par */
  | { kind: 'strokes'; par: number; scoreName?: boolean }
  /** millimetres off a target: lower is better, 0 is perfect */
  | { kind: 'mm' }
  /** fights won in a row: higher is better */
  | { kind: 'wins' }
  /** a finishing place (1 = won): lower is better */
  | { kind: 'place'; of: number };

export interface ScoreStat {
  key: string; // localStorage key
  label: string;
  format: ScoreFormat;
  /** optional small badge (e.g. a hole number) */
  badge?: string;
  /** shown before the label, e.g. "Hole 1: " */
  prefix?: string;
  /** small print under the label */
  note?: string;
}

export interface GameScores {
  slug: string; // matches src/data/apps.ts and /apps/<slug>/
  title: string;
  icon?: string;
  emoji: string;
  colour: string;
  /** the big number at the top of the card */
  headline: ScoreStat;
  /** an optional list underneath, e.g. best on each hole */
  breakdown?: { title: string; stats: ScoreStat[] };
  /** bronze/silver/gold rule for one attempt (see src/data/medals.ts) */
  medals?: MedalRule;
}

const coursePar = HOLES.reduce((a, h) => a + h.par, 0);

export const gameScores: GameScores[] = [
  {
    slug: 'paper-plane',
    title: 'Paper Plane Throw',
    icon: '/icons/paper-plane.svg',
    emoji: '✈️',
    colour: '#48cae4',
    headline: { key: 'crinklecut.paperPlane.best', label: 'Longest flight', format: { kind: 'metres', decimals: 1 } },
    medals: PLANE_MEDALS,
  },
  {
    slug: 'disc-golf',
    title: 'Arcade Disc Golf',
    icon: '/icons/disc-golf.svg',
    emoji: '🥏',
    colour: '#7bd389',
    headline: { key: 'crinklecut.discGolf.bestRound', label: `Best round (${HOLES.length} holes, par ${coursePar})`, format: { kind: 'strokes', par: coursePar } },
    medals: DISC_GOLF_MEDALS,
    breakdown: {
      title: 'Best on each hole',
      stats: HOLES.map((h, i) => ({
        key: `crinklecut.discGolf.best.${i}`,
        label: h.name,
        badge: String(i + 1),
        prefix: `Hole ${i + 1}: `,
        format: { kind: 'strokes', par: h.par, scoreName: true },
      })),
    },
  },
  {
    slug: 'split-the-g',
    title: 'Split the G',
    icon: '/icons/split-the-g.svg',
    emoji: '🍺',
    colour: '#e9c46a',
    headline: { key: SPLIT_BEST, label: 'Closest split (mm off the split line)', format: { kind: 'mm' } },
    medals: SPLIT_MEDALS,
    breakdown: {
      title: 'Closest with each drinker',
      stats: CHARACTERS.map((c) => ({ key: bestKeyFor(c.id), label: c.name, badge: c.name.replace(/[^A-Za-z]/g, '').charAt(0), format: { kind: 'mm' } as ScoreFormat, note: `Trickiness ${c.difficulty} of 4` })),
    },
  },
  {
    slug: 'robot-wars',
    title: 'Robot Rumble',
    icon: '/icons/robot-wars.svg',
    emoji: '🤖',
    colour: '#a0c4ff',
    headline: { key: BEST_STREAK_KEY, label: 'Longest win streak (fights won in a row with one robot)', format: { kind: 'wins' } },
    medals: ROBOT_MEDALS,
  },
  {
    slug: 'robot-melee',
    title: 'Robot Rumble Melee',
    icon: '/icons/robot-melee.svg',
    emoji: '💥',
    colour: '#ffadad',
    headline: { key: MELEE_BEST_KEY, label: 'Best finish in a five-robot melee', format: { kind: 'place', of: 5 } },
    medals: MELEE_MEDALS,
  },
];

/** Every localStorage key the page shows (used by "Reset scores"). */
export const allScoreKeys = gameScores.flatMap((g) => [g.headline, ...(g.breakdown?.stats ?? [])].map((s) => s.key).concat(g.medals ? [g.medals.key] : []));
