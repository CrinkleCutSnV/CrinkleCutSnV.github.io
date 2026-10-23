// Shared helpers for saved best scores. Every score lives in localStorage under its own key
// (the value is just the number, as the games have always saved it). When a new record is
// set, its date goes in a sibling key: `<key>.at` (an ISO timestamp).

export const DATE_SUFFIX = '.at';

export function readNumber(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(key));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch { return null; }
}

export function readDate(key: string): Date | null {
  try {
    const s = localStorage.getItem(key + DATE_SUFFIX);
    if (!s) return null;
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

/** Save a new record and the date it was set. */
export function saveRecord(key: string, value: number, when = new Date()) {
  try {
    localStorage.setItem(key, String(value));
    localStorage.setItem(key + DATE_SUFFIX, when.toISOString());
  } catch { /* private mode or storage full: never break the game */ }
}

export function clearRecord(key: string) {
  try {
    localStorage.removeItem(key);
    localStorage.removeItem(key + DATE_SUFFIX);
  } catch { /* ignore */ }
}

/** e.g. "23 Oct 2026" */
export const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- golf-style scoring, shared by the disc golf game and the scores page ----
export function scoreName(strokes: number, par: number) {
  if (strokes === 1) return 'Ace!';
  const d = strokes - par;
  return ({ [-3]: 'Albatross!', [-2]: 'Eagle!', [-1]: 'Birdie!', 0: 'Par', 1: 'Bogey', 2: 'Double bogey', 3: 'Triple bogey' } as Record<number, string>)[d]
    ?? `+${d}`;
}
export const vsPar = (strokes: number, par: number) => {
  const d = strokes - par;
  return d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`;
};
/** "Level par", "1 under par", "2 over par" */
export const vsParWords = (strokes: number, par: number) => {
  const d = strokes - par;
  return d === 0 ? 'Level par' : `${Math.abs(d)} ${d < 0 ? 'under' : 'over'} par`;
};
