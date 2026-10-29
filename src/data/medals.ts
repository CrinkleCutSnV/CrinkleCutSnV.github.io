// Bronze, silver and gold awards for one attempt at a game (one throw, one round...).
// Each game defines its own rule here; the game's result screen, the saved best medal and
// the "My best scores" page all read from it. To add a game: add a rule, call
// awardMedal(rule, value) from src/scripts/medals.ts when an attempt finishes, and point
// the game's entry in src/data/scores.ts at the rule.

export type Tier = 'bronze' | 'silver' | 'gold';
export const TIERS: Tier[] = ['bronze', 'silver', 'gold'];
export const TIER_NAME: Record<Tier, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold' };

export interface MedalRule {
  game: string; // slug, as in src/data/apps.ts
  key: string; // localStorage key for the best medal won (+ ".at" for its date)
  /** what is judged, e.g. "each throw's distance" */
  measure: string;
  /** 'higher' = the value must reach the threshold; 'lower' = it must be at or under it */
  better: 'higher' | 'lower';
  /** the value needed for each medal */
  thresholds: Record<Tier, number>;
  unit: 'm' | 'vsPar' | 'mm';
}

export const PLANE_MEDALS: MedalRule = {
  game: 'paper-plane',
  key: 'crinklecut.paperPlane.medal',
  measure: "each throw's distance",
  better: 'higher',
  thresholds: { bronze: 40, silver: 75, gold: 100 },
  unit: 'm',
};

export const DISC_GOLF_MEDALS: MedalRule = {
  game: 'disc-golf',
  key: 'crinklecut.discGolf.medal',
  measure: 'each full round against par (par 8)',
  better: 'lower',
  // strokes over (+) or under (−) par for the round
  thresholds: { bronze: 3, silver: 0, gold: -2 },
  unit: 'vsPar',
};

export const SPLIT_MEDALS: MedalRule = {
  game: 'split-the-g',
  key: 'crinklecut.splitTheG.medal',
  measure: 'how close each pint comes to a perfect split (the line through the middle of the G)',
  better: 'lower',
  // mm from a perfect split, at or under
  thresholds: { bronze: 9, silver: 3.5, gold: 1 },
  unit: 'mm',
};

export const MEDAL_RULES: MedalRule[] = [PLANE_MEDALS, DISC_GOLF_MEDALS, SPLIT_MEDALS];

// ---- formatting --------------------------------------------------------------------
export const fmtVsPar = (d: number) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`);
const fmtValue = (r: MedalRule, v: number) => (r.unit === 'm' ? `${v} m` : r.unit === 'mm' ? `${v} mm` : fmtVsPar(v));

/** The band for a medal, e.g. "40–75 m", "100 m+", "+3 to +1", "−2 or better", "within 4 mm". */
export function bandLabel(r: MedalRule, t: Tier): string {
  if (r.unit === 'mm') return `within ${fmtValue(r, r.thresholds[t])}`;
  const i = TIERS.indexOf(t);
  const lo = r.thresholds[t];
  const next = TIERS[i + 1];
  if (r.better === 'higher') return next ? `${lo}–${fmtValue(r, r.thresholds[next])}` : `${fmtValue(r, lo)}+`;
  if (!next) return `${fmtValue(r, lo)} or better`;
  const hi = r.thresholds[next] + 1; // the best score still in this band
  return lo === hi ? fmtValue(r, lo) : `${fmtValue(r, lo)} to ${fmtValue(r, hi)}`;
}

/** Which medal a value earns (or null). */
export function medalFor(r: MedalRule, v: number): Tier | null {
  let won: Tier | null = null;
  for (const t of TIERS) if (r.better === 'higher' ? v >= r.thresholds[t] : v <= r.thresholds[t]) won = t;
  return won;
}

/** "18.0 m more for gold", "2 fewer throws for silver", or null at gold. */
export function nextTarget(r: MedalRule, v: number): string | null {
  const won = medalFor(r, v);
  const next = TIERS[won ? TIERS.indexOf(won) + 1 : 0];
  if (!next) return null;
  const goal = r.thresholds[next];
  if (r.better === 'higher') {
    const gap = Math.max(0.1, Math.ceil((goal - v) * 10) / 10);
    return `${gap.toFixed(1)} m more for ${next}`;
  }
  if (r.unit === 'mm') return `${Math.max(0.1, Math.round((v - goal) * 10) / 10).toFixed(1)} mm closer for ${next}`;
  const gap = v - goal;
  return `${gap} ${gap === 1 ? 'throw' : 'throws'} fewer for ${next}`;
}

export const tierRank = (t: Tier | null) => (t ? TIERS.indexOf(t) + 1 : 0);
