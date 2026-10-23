// Awarding, saving and drawing medals. Rules live in src/data/medals.ts.
import { TIER_NAME, TIERS, medalFor, nextTarget, tierRank, type MedalRule, type Tier } from '../data/medals';
import { DATE_SUFFIX, readDate } from './scores';

export function readMedal(r: MedalRule): Tier | null {
  try {
    const v = localStorage.getItem(r.key);
    return (TIERS as string[]).includes(v ?? '') ? (v as Tier) : null;
  } catch { return null; }
}
export const readMedalDate = (r: MedalRule) => readDate(r.key);

/** Work out the medal for an attempt, save it if it beats the best so far. */
export function awardMedal(r: MedalRule, v: number) {
  const tier = medalFor(r, v);
  const prev = readMedal(r);
  const isBest = tierRank(tier) > tierRank(prev);
  if (isBest && tier) {
    try {
      localStorage.setItem(r.key, tier);
      localStorage.setItem(r.key + DATE_SUFFIX, new Date().toISOString());
    } catch { /* ignore */ }
  }
  return { tier, prev, isBest: isBest && !!tier, next: nextTarget(r, v) };
}

/** The medal itself: a ribboned disc. Pass null for a greyed outline. */
export const medalHtml = (t: Tier | null, label = '') =>
  `<span class="medal ${t ? `medal--${t}` : 'medal--none'}" aria-hidden="true"><span class="medal-ribbon"></span><span class="medal-face">${label}</span></span>`;

const CHEER: Record<Tier, string> = { bronze: 'On the podium!', silver: 'Shiny!', gold: 'Top of the podium!' };

/** The result-screen pop: the medal won (or a grey one), plus the next target. */
export function medalPopHtml(res: ReturnType<typeof awardMedal>) {
  const t = res.tier;
  const title = t ? `${TIER_NAME[t]}!` : 'No medal this time';
  const sub = [t && !res.next ? CHEER[t] : null, res.next ? capital(res.next) : null, res.isBest ? 'New best medal!' : null].filter(Boolean).join(' · ');
  return `<div class="medal-pop ${t ? `medal-pop--${t}` : 'medal-pop--none'}" data-medal="${t ?? 'none'}">`
    + medalHtml(t, t ? '★' : '')
    + `<span class="medal-text"><strong>${title}</strong><small>${sub}</small></span></div>`;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
