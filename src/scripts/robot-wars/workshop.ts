// The robot workshop, shared by Robot Rumble and Robot Rumble Melee: pick parts, name it, preview it.
// Both games remember the same last robot (LAST_BUILD_KEY), so you can take one robot into either.
import { BODIES, BRAINS, DRIVES, PART_IDS, WEAPONS, ZONES, randomBuild, randomName, type Build, type PartKind } from './sim';
import { ZONE_EMOJI, drawBot, drawPartIcon, type BotLook } from './draw';
import { LAST_BUILD_KEY } from './keys';

export const KINDS = Object.keys(PART_IDS) as PartKind[];
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Size a canvas's backing store to its CSS box (× device pixels, up to 2×). Returns its width in px. */
export function sizeCanvas(c: HTMLCanvasElement) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = c.getBoundingClientRect();
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c.width;
}

export function initWorkshop(root: HTMLElement, onFight: () => void) {
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const ui = {
    preview: $<HTMLCanvasElement>('[data-preview]'), name: $<HTMLInputElement>('[data-name]'), rename: $('[data-rename]'),
    summary: $('[data-summary]'), fight: $('[data-fight]'), random: $('[data-random]'),
    opts: [...root.querySelectorAll<HTMLButtonElement>('[data-part]')],
  };
  let build: Build = randomBuild(Math.random);
  let name = randomName(Math.random);
  try {
    const saved = JSON.parse(localStorage.getItem(LAST_BUILD_KEY) ?? 'null');
    if (saved && KINDS.every((k) => (PART_IDS[k] as readonly string[]).includes(saved.build?.[k]))) { build = saved.build; if (typeof saved.name === 'string' && saved.name.trim()) name = saved.name.slice(0, 22); }
  } catch { /* fresh robot */ }
  const save = () => { try { localStorage.setItem(LAST_BUILD_KEY, JSON.stringify({ build, name })); } catch { /* ignore */ } };

  function drawIcons() {
    for (const b of ui.opts) {
      const c = b.querySelector<HTMLCanvasElement>('canvas')!;
      const s = sizeCanvas(c);
      drawPartIcon(c.getContext('2d')!, b.dataset.part as PartKind, b.dataset.id!, s, 0);
    }
  }
  function refresh() {
    for (const b of ui.opts) b.setAttribute('aria-checked', String(build[b.dataset.part as PartKind] === b.dataset.id));
    for (const k of KINDS) {
      const opt = ui.opts.find((b) => b.dataset.part === k && b.dataset.id === build[k])!;
      const h = root.querySelector<HTMLElement>(`[data-hint-for="${k}"]`)!;
      h.innerHTML = esc(opt.dataset.blurb ?? '') + (opt.dataset.hint ? `<b>${esc(opt.dataset.hint)}</b>` : '');
    }
    const D = DRIVES[build.drive], W = WEAPONS[build.weapon], B = BODIES[build.body];
    ui.summary.innerHTML = `<b>${esc(D.name)}</b> · <b>${esc(W.name)}</b> · <b>${esc(B.name)}</b> · <b>${esc(BRAINS[build.brain].name)}</b> computer<br>`
      + `${B.hp} HP · loves ${ZONE_EMOJI[D.fast]} ${ZONES[D.fast].name.toLowerCase()}, hates ${ZONE_EMOJI[D.slow]} ${ZONES[D.slow].name.toLowerCase()}`;
    if (document.activeElement !== ui.name) ui.name.value = name;
    save();
  }
  ui.opts.forEach((b) => b.addEventListener('click', () => { build = { ...build, [b.dataset.part!]: b.dataset.id } as Build; refresh(); }));
  ui.name.addEventListener('input', () => { name = ui.name.value.slice(0, 22); save(); });
  ui.name.addEventListener('blur', () => { if (!ui.name.value.trim()) { name = randomName(Math.random); refresh(); } });
  ui.rename.addEventListener('click', () => { name = randomName(Math.random); ui.name.value = name; save(); });
  ui.random.addEventListener('click', () => { build = randomBuild(Math.random); refresh(); });
  ui.fight.addEventListener('click', () => onFight());

  function drawPreview(t: number) {
    const s = sizeCanvas(ui.preview);
    const c = ui.preview.getContext('2d')!;
    c.save();
    const k = s / 26;
    // a steel workshop floor
    c.fillStyle = '#a9b4c2'; c.fillRect(0, 0, s, s);
    c.strokeStyle = '#7d8896'; c.lineWidth = Math.max(1, s / 260);
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo((i * s) / 4, 0); c.lineTo((i * s) / 4, s); c.moveTo(0, (i * s) / 4); c.lineTo(s, (i * s) / 4); c.stroke(); }
    const swing = (t % 2.4);
    const look: BotLook = { x: 13, y: 13.4, heading: -Math.PI / 2 + Math.sin(t * 0.7) * 0.5, build, side: 0, swing, odo: t * 4, speed: 5 };
    drawBot(c, look, k, t);
    c.restore();
  }

  return {
    get build() { return build; },
    get name() { return name; },
    /** Before a fight: make sure it has a name, and remember it. */
    ready() { if (!ui.name.value.trim()) { name = randomName(Math.random); ui.name.value = name; } save(); },
    pick(kind: PartKind, id: string) { build = { ...build, [kind]: id } as Build; refresh(); },
    setName(n: string) { name = n; ui.name.value = n; save(); },
    drawIcons, refresh, drawPreview,
  };
}
export type Workshop = ReturnType<typeof initWorkshop>;
