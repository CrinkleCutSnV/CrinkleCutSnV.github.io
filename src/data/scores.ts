// The "My best scores" page is built from this list. To add a new game's scores:
// 1. save its best in localStorage with saveRecord(key, value) from src/scripts/scores.ts
//    (that also stores the date the record was set), and
// 2. add an entry below with the same key. The page, the empty state and "Reset scores"
//    all pick it up automatically.
import { HOLES } from '../scripts/disc-golf/physics';
import { DISC_GOLF_MEDALS, PLANE_MEDALS, type MedalRule } from './medals';

export type ScoreFormat =
  | { kind: 'metres'; decimals?: number }
  /** golf-style: fewer is better, shown with the par */
  | { kind: 'strokes'; par: number; scoreName?: boolean };

export interface ScoreStat {
  key: string; // localStorage key
  label: string;
  format: ScoreFormat;
  /** optional small number badge (e.g. a hole number) */
  badge?: string;
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
        format: { kind: 'strokes', par: h.par, scoreName: true },
      })),
    },
  },
];

/** Every localStorage key the page shows (used by "Reset scores"). */
export const allScoreKeys = gameScores.flatMap((g) => [g.headline, ...(g.breakdown?.stats ?? [])].map((s) => s.key).concat(g.medals ? [g.medals.key] : []));
