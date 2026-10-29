// Split the G: the drinker's-eye view (POV) while they're drinking.
//
// Your eye is at the rim and you're looking DOWN into the glass, as you do when you drink a pint:
// the rim in the foreground, the inside wall tapering away, and the creamy top of the head with
// the stout beneath. The G is on the outside of the glass, so you can't see it from here: you
// judge by how far down the glass the head has gone, which is the skill.
//
// It's an honest 3D perspective of the same glass as the bar view (GLASS, radiusAt) and the same
// level (visibleLine + headNow). The picture depends only on the level, so the same level always
// looks the same and players can learn it: as the level drops the head's surface shrinks and
// recedes, more inside wall shows, the glass tips further (the surface tilts across it) and foam
// lacing is left on the wall. The only thing that differs between drinkers is the sway, which
// moves the whole picture rigidly, and their personal touches round the edges.
import { GLASS, HEAD_MM, headNow, radiusAt, visibleLine, type Character, type Pint } from './physics';

type Ctx = CanvasRenderingContext2D;
type V3 = [number, number, number];
const INK = '#2b2d42';
const TOP = GLASS.height; // the rim, mm above the inside of the foot
const R_RIM = radiusAt(TOP);
const LIP = 2.4; // glass thickness at the rim, mm
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

export interface PovFrame {
  w: number;
  h: number;
  /** 0 = not shown, 1 = fully in the drinker's eyes */
  k: number;
  t: number;
}

/** How empty the glass is, 0 (full) to 1, from the head's top: drives the tip of the glass. */
const emptiness = (top: number) => clamp((TOP - 2 - top) / 118, 0, 1);
/** How far the glass is tipped towards you (rad) when the head's top is at `top` mm. */
export const tiltFor = (top: number) => 0.14 + 0.6 * emptiness(top);

/**
 * The camera, in the glass's own frame (x across, y away from you, z up the glass's axis).
 * Your eye is just inside the near rim; as the glass tips up, you look further down it.
 */
function camera(top: number) {
  const e = emptiness(top);
  const eye: V3 = [0, -R_RIM * 0.7 + 8 * e, TOP + 24 - 4 * e];
  const at: V3 = [0, R_RIM * 0.3 - 10 * e, 70 - 20 * e];
  const f = norm(sub(at, eye));
  const r = norm(cross(f, [0, 0, 1]));
  const u = cross(r, f);
  return { eye, f, r, u };
}
type Cam = ReturnType<typeof camera>;

/** Fit the picture to the canvas once, from the full glass, so the scale never changes with the level. */
function fit(w: number, h: number) {
  const c = camera(TOP);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const q = raw(c, [Math.cos(a) * (R_RIM + LIP), Math.sin(a) * (R_RIM + LIP), TOP]);
    minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]); minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
  }
  // the rim fills most of the width; the far rim sits just under the HUD; the near rim near the bottom
  const F = Math.min((w * (w > h ? 0.74 : 1.04)) / (maxX - minX), (h * 0.98) / (maxY - minY));
  const ox = (w > h ? w * 0.47 : w / 2) - F * (minX + maxX) / 2; // a touch left on wide screens, to leave room for your hand
  const oy = Math.max(h * 0.06 + 22, (h - F * (maxY - minY)) * (w > h ? 0.5 : 0.36)) - F * minY; // on a phone, centred a bit high so your hand fits below
  return { F, ox, oy };
}
function raw(c: Cam, p: V3): [number, number, number] {
  const d = sub(p, c.eye);
  const z = Math.max(4, dot(d, c.f));
  return [dot(d, c.r) / z, -dot(d, c.u) / z, z];
}

export function povLayout(w: number, h: number, top: number) {
  const ft = fit(w, h);
  const cam = camera(top);
  /** a point in the glass (mm) to the screen; s = px per mm there */
  const P = (p: V3) => { const q = raw(cam, p); return { x: ft.ox + ft.F * q[0], y: ft.oy + ft.F * q[1], s: ft.F / q[2] }; };
  /** a point on the inside wall, angle a (0 = your right, π/2 = far side), height v */
  const wall = (a: number, v: number, out = 0) => { const r = radiusAt(v) + out; return P([Math.cos(a) * r, Math.sin(a) * r, v]); };
  return { P, wall, F: ft.F };
}
type Layout = ReturnType<typeof povLayout>;

/** Where the (level) surface of the pint meets the wall at angle a, with the glass tipped by `tilt`. */
function surfaceV(a: number, top: number, tilt: number) {
  let v = top;
  for (let i = 0; i < 4; i++) v = top - radiusAt(v) * Math.sin(a) * Math.tan(tilt); // higher on the side nearest you
  return clamp(v, 1, TOP - 0.5);
}

/** How each drinker's hands move the glass: visual only. */
export function povSway(c: Character, t: number, w: number, h: number) {
  const S = Math.min(w, h);
  switch (c.id) {
    case 'maureen': return { dx: S * 0.004 * Math.sin(t * Math.PI * 2), dy: 0, rot: 0.01 * Math.sin(t * Math.PI * 2) }; // tick, tock
    case 'declan': return { dx: S * 0.02 * Math.sin(t * 0.8), dy: S * 0.012 * Math.sin(t * 0.6 + 1), rot: 0.022 * Math.sin(t * 0.8 + 0.6) }; // big slow heaves
    case 'nigel': return { dx: S * 0.004 * (Math.sin(t * 23) + Math.sin(t * 31 + 1)), dy: S * 0.004 * Math.sin(t * 27 + 2), rot: 0.007 * Math.sin(t * 29) }; // the jitters
    case 'dot': return { dx: S * 0.006 * Math.sin(t * 1.6), dy: -S * 0.014 * Math.abs(Math.sin(t * 3.2)), rot: 0.016 * Math.sin(t * 1.6) }; // dancing to the band
    case 'walter': return { dx: S * 0.016 * Math.sin(t * 0.9 + 0.5), dy: S * 0.006 * Math.sin(t * 1.8), rot: 0.035 * Math.sin(t * 0.9) }; // a rolling sea
    case 'pip': return { dx: S * 0.003 * Math.sin(t * 1.3), dy: 0, rot: 0.006 * Math.sin(t * 1.3) + (Math.sin(t * 0.5) > 0.6 ? 0.006 : 0) }; // precise, the odd thoughtful tilt
    default: return { dx: 0, dy: 0, rot: 0 };
  }
}

export function drawPov(ctx: Ctx, c: Character, pint: Pint, f: PovFrame) {
  const { w, h, k, t } = f;
  if (k <= 0.001) return;
  const e = k * k * (3 - 2 * k);
  const line = visibleLine(pint);
  const top = Math.min(TOP - 0.3, line + Math.max(0, headNow(pint)));
  const L = povLayout(w, h, top);
  const sw = povSway(c, t, w, h);
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.4);
  backdrop(ctx, w, h);
  ctx.save();
  // the glass comes up to your face, then sways in your hand
  ctx.translate(w / 2 + sw.dx, h * 0.5 + sw.dy + (1 - e) * h * 0.45);
  ctx.rotate(sw.rot + (1 - e) * 0.12);
  ctx.translate(-w / 2, -h * 0.5);
  glass(ctx, L, pint, top);
  hand(ctx, L, c, w, h, t);
  ctx.restore();
  face(ctx, c, w, h, t);
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.35)'); // a soft vignette, no blur: everyone's perfectly sober
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---- what's beyond the rim: the bar top, far below ----
function backdrop(ctx: Ctx, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#4a2c18'); g.addColorStop(1, '#2a170c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 3;
  for (let y = h * 0.1; y < h; y += h * 0.16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + h * 0.03); ctx.stroke(); }
}

function loop(ctx: Ctx, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
}
const N = 72;
const angles = Array.from({ length: N }, (_, i) => (i / N) * Math.PI * 2);

function glass(ctx: Ctx, L: Layout, p: Pint, top: number) {
  const tilt = tiltFor(top);
  const rimIn = angles.map((a) => L.wall(a, TOP));
  const rimOut = angles.map((a) => L.wall(a, TOP, LIP));
  // the inside wall, from the rim down to the surface: clear glass, the bar showing through
  loop(ctx, rimIn);
  ctx.save();
  ctx.clip();
  const surf = angles.map((a) => L.wall(a, surfaceV(a, top, tilt)));
  const far = L.wall(Math.PI / 2, TOP), deep = L.wall(Math.PI / 2, top);
  const wg = ctx.createLinearGradient(0, far.y, 0, deep.y);
  wg.addColorStop(0, 'rgba(196,214,206,.55)'); wg.addColorStop(1, 'rgba(70,86,80,.85)');
  ctx.fillStyle = wg; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  // the wall's own curve catching the light: fixed streaks, the same at every level
  ctx.strokeStyle = 'rgba(255,255,255,.12)';
  for (const a of [Math.PI * 0.62, Math.PI * 0.7, Math.PI * 0.38]) {
    ctx.lineWidth = L.wall(a, TOP).s * 3;
    ctx.beginPath();
    for (let v = TOP; v >= surfaceV(a, top, tilt); v -= 4) { const q = L.wall(a, v); ctx.lineTo(q.x, q.y); }
    ctx.stroke();
  }
  // foam lacing: rings left on the wall each time the level dropped past (spaced from where this pint started)
  const from = p.start + p.head;
  ctx.strokeStyle = 'rgba(246,234,208,.5)';
  for (let i = 0; ; i++) {
    const v0 = from - 6 - i * 13 - (i % 3) * 3;
    if (v0 < Math.max(top + 2, p.lacing)) break;
    ctx.beginPath();
    let pen = false;
    for (let j = 0; j <= N; j++) {
      const a = angles[j % N], v = v0 + 0.8 * Math.sin(a * 5 + i * 1.7);
      if (v <= surfaceV(a, top, tilt) + 0.5 || Math.sin(a * 3 + i * 2.3) > 0.55) { pen = false; continue; }
      const q = L.wall(a, v);
      ctx.lineWidth = Math.max(1, q.s * 0.7);
      if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; }
    }
    ctx.stroke();
  }
  if (p.emptied && top < 3) {
    // drained: clear glass all the way down, the bar showing through the bottom, and a few wisps of foam
    loop(ctx, surf);
    ctx.fillStyle = 'rgba(150,170,160,.55)'; ctx.fill();
    const c0 = L.P([0, 0, top]);
    ctx.fillStyle = 'rgba(250,240,218,.8)';
    const hsh = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    for (let i = 0; i < 26; i++) {
      const rad = 0.55 + 0.42 * hsh(i), a = hsh(i + 99) * Math.PI * 2;
      const q = L.P([Math.cos(a) * radiusAt(top) * rad, Math.sin(a) * radiusAt(top) * rad, top]);
      ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(1, q.s * (1 + (i % 3) * 0.8)), 0, Math.PI * 2); ctx.fill();
    }
    void c0;
    ctx.restore();
    rimAndGlint(ctx, L, rimIn, rimOut);
    return;
  }
  // the top of the head: a level, creamy surface where it meets the wall
  loop(ctx, surf);
  const c0 = L.P([0, 0, top]);
  const rr = Math.max(...surf.map((q) => Math.hypot(q.x - c0.x, q.y - c0.y)));
  const hg = ctx.createRadialGradient(c0.x, c0.y, rr * 0.1, c0.x, c0.y, rr);
  hg.addColorStop(0, '#fff7e3'); hg.addColorStop(0.75, '#f1dfb9'); hg.addColorStop(1, '#c9a26e');
  ctx.fillStyle = hg; ctx.fill();
  // bubbles in the foam, fixed to the surface (so they shrink with distance too)
  ctx.fillStyle = 'rgba(190,150,100,.35)';
  for (let i = 0; i < 40; i++) {
    const hsh = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
    const rad = Math.sqrt(hsh(i)) * 0.88, an = hsh(i + 99) * Math.PI * 2;
    const a = an, r0 = radiusAt(top) * rad;
    const v = top - r0 * Math.sin(a) * Math.tan(tilt);
    const q = L.P([Math.cos(a) * r0, Math.sin(a) * r0, v]);
    ctx.beginPath(); ctx.arc(q.x, q.y, Math.max(0.8, q.s * (0.6 + (i % 3) * 0.3)), 0, Math.PI * 2); ctx.fill();
  }
  // the stout beneath, showing as a dark edge where the head pulls away from the glass
  loop(ctx, surf);
  ctx.strokeStyle = '#2a1209'; ctx.lineWidth = Math.max(2, deep.s * 2.2); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,90,45,.8)'; ctx.lineWidth = Math.max(1, deep.s * 0.7); ctx.stroke();
  ctx.restore();
  rimAndGlint(ctx, L, rimIn, rimOut);
  void HEAD_MM;
}

function rimAndGlint(ctx: Ctx, L: Layout, rimIn: { x: number; y: number }[], rimOut: { x: number; y: number }[]) {
  // the rim, right in front of you
  ctx.beginPath();
  rimOut.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  rimIn.slice().reverse().forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y))); ctx.closePath();
  ctx.fillStyle = 'rgba(225,238,236,.85)'; ctx.fill('evenodd');
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
  // a glint on the near rim
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let a = -Math.PI * 0.8; a <= -Math.PI * 0.6; a += 0.05) { const q = L.wall(a, TOP, LIP * 0.5); ctx.lineTo(q.x, q.y); }
  ctx.lineWidth = Math.max(3, L.wall(-Math.PI / 2, TOP).s * 1.2); ctx.stroke();
}

// ---- your hand round the glass, coming in from the bottom right ----
function hand(ctx: Ctx, L: Layout, c: Character, w: number, h: number, t: number) {
  const big = c.id === 'declan' ? 1.4 : 1;
  const skin = c.look.kind === 'walrus' ? '#8d6b50' : c.look.skin;
  const S = Math.min(w, h);
  // you can't see much of your own hand from up here: the fingers curl round the outside of the
  // rim on the right, and the palm and wrist come in from the bottom right
  const fw = S * 0.055 * big;
  const nr = L.wall(-0.18 * Math.PI, TOP, LIP); // the rim at the near right, where your fingers rest
  const palm = w > h ? { x: nr.x + S * 0.12 * big, y: nr.y + S * 0.1 * big } : { x: Math.min(nr.x + S * 0.06, w * 0.8), y: nr.y + S * 0.3 * big };
  const elbow = { x: Math.max(w * 1.05, palm.x + S * 0.3), y: Math.max(h * 1.15, palm.y + S * 0.45) };
  const wrist = { x: palm.x + (elbow.x - palm.x) * 0.3, y: palm.y + (elbow.y - palm.y) * 0.3 };
  const ang = Math.atan2(elbow.y - wrist.y, elbow.x - wrist.x);
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // keep the hand outside the glass
  ctx.beginPath(); ctx.rect(-w, -h, w * 3, h * 3);
  angles.slice().reverse().forEach((a, i) => { const q = L.wall(a, TOP); i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
  ctx.closePath(); ctx.clip('evenodd');
  const fa = [-0.04, -0.12, -0.2, -0.28].map((x) => x * Math.PI * (big > 1 ? 1.12 : 1));
  fa.forEach((a, i) => {
    // each finger runs from the palm to a fingertip resting on the rim
    const tip = L.wall(a, TOP, LIP + 0.5), mid = L.wall(a, TOP - 2, LIP + 9 * big);
    ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.quadraticCurveTo(mid.x, mid.y, tip.x, tip.y);
    ctx.strokeStyle = INK; ctx.lineWidth = fw + 5; ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = fw; ctx.stroke();
    if (c.id === 'dot' && (i === 1 || i === 3)) { // her rings
      const q = { x: (mid.x + palm.x) / 2 * 0.5 + mid.x * 0.5, y: (mid.y + palm.y) / 2 * 0.5 + mid.y * 0.5 };
      ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(q.x, q.y, fw * 0.42, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (i === 1) { ctx.fillStyle = '#9be7ff'; ctx.beginPath(); ctx.arc(q.x, q.y, fw * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
  });
  const armW = S * 0.2 * big;
  // palm and forearm
  ctx.fillStyle = skin; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(palm.x, palm.y, armW * 0.55, armW * 0.42, ang, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = armW * 0.8 + 6;
  ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(wrist.x, wrist.y); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = armW * 0.8; ctx.stroke();
  // sleeve
  const sleeve = c.id === 'pip' ? '#f7f7f2' : c.look.shirt;
  ctx.save();
  ctx.translate(wrist.x, wrist.y); ctx.rotate(ang);
  const len = Math.hypot(elbow.x - wrist.x, elbow.y - wrist.y) + armW;
  ctx.fillStyle = sleeve; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(0, -armW * 0.62, len, armW * 1.24, armW * 0.2); ctx.fill(); ctx.stroke();
  if (c.id === 'declan') { // rugby hoops
    ctx.fillStyle = '#f4f1e8';
    for (let x = armW * 0.35; x < len; x += armW * 0.7) ctx.fillRect(x, -armW * 0.6, armW * 0.33, armW * 1.2);
    ctx.strokeRect(0, -armW * 0.62, len, armW * 1.24);
  }
  if (c.id === 'maureen') { // ribbed cardigan cuff
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 2;
    for (let x = 4; x < armW * 0.6; x += 5) { ctx.beginPath(); ctx.moveTo(x, -armW * 0.6); ctx.lineTo(x, armW * 0.6); ctx.stroke(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(armW * 0.62, -armW * 0.62); ctx.lineTo(armW * 0.62, armW * 0.62); ctx.stroke();
  }
  if (c.id === 'walter') { // a captain's gold cuff rings
    ctx.fillStyle = '#e2b85c';
    for (const x of [armW * 0.25, armW * 0.5]) ctx.fillRect(x, -armW * 0.6, armW * 0.1, armW * 1.2);
  }
  if (c.id === 'pip') { // lab coat cuff, button and a biro
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(armW * 0.5, -armW * 0.6); ctx.lineTo(armW * 0.5, armW * 0.6); ctx.stroke();
    ctx.fillStyle = '#cfd3da'; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(armW * 0.3, armW * 0.3, armW * 0.07, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2f6fdf'; ctx.fillRect(armW * 0.8, -armW * 0.5, armW * 0.9, armW * 0.1);
  }
  if (c.id === 'nigel') { // crisp shirt cuff with a cufflink
    ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(armW * 0.55, -armW * 0.6); ctx.lineTo(armW * 0.55, armW * 0.6); ctx.stroke();
    ctx.fillStyle = '#e2b85c'; ctx.strokeStyle = INK;
    ctx.beginPath(); ctx.arc(armW * 0.28, 0, armW * 0.08, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
  if (c.id === 'dot') { // bangles jingling on her wrist
    const cols = ['#f2c94c', '#e76f51', '#2a9d8f', '#f2c94c'];
    cols.forEach((col, i) => {
      const f = 0.55 + i * 0.13;
      const q = { x: palm.x + (wrist.x - palm.x) * f, y: palm.y + (wrist.y - palm.y) * f + Math.sin(t * 6 + i) * 1.5 };
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang + Math.PI / 2);
      ctx.strokeStyle = INK; ctx.lineWidth = armW * 0.14 + 3;
      ctx.beginPath(); ctx.ellipse(0, 0, armW * 0.48, armW * 0.13, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = armW * 0.14; ctx.stroke();
      ctx.restore();
    });
  }
  ctx.restore();
}

// ---- a bit of the drinker's own face at the edge of the view ----
function face(ctx: Ctx, c: Character, w: number, h: number, t: number) {
  const S = Math.min(w, h);
  ctx.save();
  ctx.strokeStyle = INK;
  if (c.id === 'walter') {
    // that magnificent moustache, drooping in at the bottom of the view
    ctx.fillStyle = c.look.hair;
    ctx.lineWidth = 3;
    const n = 11;
    for (let i = 0; i < n; i++) {
      const x = (w * (i + 0.5)) / n, len = S * (0.1 + 0.05 * Math.sin(i * 1.7)) + S * 0.01 * Math.sin(t * 2 + i);
      ctx.beginPath();
      ctx.moveTo(x - w / n * 0.75, h + 4);
      ctx.quadraticCurveTo(x, h - len * 1.25, x + w / n * 0.75, h + 4);
      ctx.fill(); ctx.stroke();
    }
  } else if (c.id === 'nigel') {
    // looking through his glasses: chunky frames round the edges and the bridge at the top
    ctx.lineWidth = S * 0.05;
    ctx.strokeStyle = '#2b2d42';
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, w * 0.5, h * 0.62, 0, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w / 2, h * 0.5, w * 0.5, h * 0.62, 0, -Math.PI * 0.38, Math.PI * 0.38); ctx.stroke();
    // frames meeting the bridge at the top
    ctx.lineWidth = S * 0.035;
    ctx.beginPath(); ctx.moveTo(w * 0.12, -S * 0.01); ctx.quadraticCurveTo(w * 0.3, S * 0.05, w / 2 - S * 0.08, S * 0.015); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w * 0.88, -S * 0.01); ctx.quadraticCurveTo(w * 0.7, S * 0.05, w / 2 + S * 0.08, S * 0.015); ctx.stroke();
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath(); ctx.roundRect(w / 2 - S * 0.09, -S * 0.02, S * 0.18, S * 0.06, S * 0.03); ctx.fill();
    // a little glint
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = S * 0.012;
    ctx.beginPath(); ctx.arc(w * 0.22, h * 0.2, S * 0.08, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  } else if (c.id === 'declan') {
    // ginger beard bristling in at the bottom corners
    ctx.fillStyle = c.look.hair; ctx.lineWidth = 3;
    for (const side of [0, 1]) for (let i = 0; i < 5; i++) {
      const x = side ? w - i * S * 0.06 : i * S * 0.06;
      ctx.beginPath(); ctx.arc(x, h + S * 0.02, S * (0.07 - i * 0.008), Math.PI, 0); ctx.fill(); ctx.stroke();
    }
  } else if (c.id === 'dot') {
    // red curls bobbing in at the left of the view (clear of the HUD)
    ctx.strokeStyle = c.look.hair; ctx.lineWidth = S * 0.025; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const x = S * 0.03 + (i % 2) * S * 0.04, y = h * 0.3 + i * S * 0.08 + Math.sin(t * 3 + i) * S * 0.005;
      ctx.beginPath(); ctx.arc(x, y, S * 0.04, 0.2, Math.PI * 1.8); ctx.stroke();
    }
  } else if (c.id === 'maureen') {
    // her silver bob falling forward at the left as she looks down (clear of the HUD)
    ctx.fillStyle = c.look.hair; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, h * 0.12); ctx.quadraticCurveTo(S * 0.16, h * 0.35, S * 0.1, h * 0.78);
    ctx.quadraticCurveTo(S * 0.05, h * 0.86, -4, h * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(0, h * (0.16 + i * 0.04)); ctx.quadraticCurveTo(S * 0.03 * i, h * 0.5, S * 0.025 * i, h * 0.82); ctx.stroke(); }
  } else if (c.id === 'pip') {
    // the rim of his half-moon specs at the bottom of the view
    ctx.lineWidth = S * 0.018; ctx.strokeStyle = '#9c7b4f';
    ctx.beginPath(); ctx.ellipse(w * 0.27, h * 1.02, S * 0.2, S * 0.1, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.73, h * 1.02, S * 0.2, S * 0.1, 0, Math.PI, 0); ctx.stroke();
  }
  ctx.restore();
}
