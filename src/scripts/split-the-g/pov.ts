// Split the G: the drinker's-eye view (POV) while they're drinking.
//
// The pint is raised and tipped towards your face: the rim is near you at the bottom of the
// screen, the foot is far away at the top. You're looking at the side of the glass that faces
// you, where the G is printed. Because the glass is tipped right over, the G reads upside down
// from here (its curl is nearer you than its bar), exactly as it would in real life.
//
// Everything on the glass is drawn from the same numbers as the bar view and the scoring:
// GLASS, radiusAt(), G_MARK (via gOutline) and visibleLine(). Each glass height v (mm) maps to a
// ring on screen; a point u mm across the printed face maps onto that ring, wrapped around the
// curve of the glass and foreshortened by perspective. Only the sway is per drinker, and it moves
// the whole picture rigidly (it never changes the G, the line or the score).
import { BRAND, GLASS, G_MARK, headNow, radiusAt, visibleLine, type Character, type Pint } from './physics';
import { gOutline } from './scene';

type Ctx = CanvasRenderingContext2D;
const INK = '#2b2d42';
const FONT = 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';
const DEPTH = 0.85; // how much further away the foot is than the rim (perspective strength)
const RING = 0.22; // how round the glass's rings look from this angle (ellipse ratio)

export interface PovFrame {
  w: number;
  h: number;
  /** 0 = not shown, 1 = fully in the drinker's eyes */
  k: number;
  t: number;
}

/** Perspective: the rim (v = height) is nearest, the foot (v = 0) furthest. */
const persp = (v: number) => 1 / (1 + DEPTH * (1 - v / GLASS.height));
const P_FOOT = persp(0);

export function povLayout(w: number, h: number) {
  const cx = w / 2;
  const yFoot = -h * 0.35, yRim = h * 0.98; // the foot is up past the top of the view, the rim just at the bottom
  const K = Math.min(w * 0.44, h * 0.6) / radiusAt(GLASS.height); // px per mm at the rim
  const y = (v: number) => yFoot + (yRim - yFoot) * (persp(v) - P_FOOT) / (1 - P_FOOT);
  const X = (v: number) => radiusAt(v) * persp(v) * K; // half-width of the glass at height v
  /** a point on the near face of the glass: u mm across the print (+ = the print's right), v mm up */
  const at = (u: number, v: number) => {
    const r = radiusAt(v), th = u / r;
    // tipped towards you, the print's right ends up on your left, and its top nearest you
    return { x: cx - X(v) * Math.sin(th), y: y(v) + RING * X(v) * Math.cos(th), sc: persp(v) * K };
  };
  return { cx, y, X, at, K };
}
type Layout = ReturnType<typeof povLayout>;

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
  ctx.save();
  ctx.globalAlpha = Math.min(1, e * 1.4);
  ceiling(ctx, w, h, t);
  const L = povLayout(w, h);
  const sw = povSway(c, t, w, h);
  ctx.save();
  // the glass comes up from below as it's raised, then sways in the drinker's hand
  ctx.translate(L.cx + sw.dx, h * 0.5 + sw.dy + (1 - e) * h * 0.45);
  ctx.rotate(sw.rot + (1 - e) * 0.12);
  ctx.translate(-L.cx, -h * 0.5);
  glass(ctx, L, pint, t);
  hand(ctx, L, c, w, h, t);
  ctx.restore();
  face(ctx, c, w, h, t);
  // a soft vignette (no blur: everyone's perfectly sober)
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// ---- looking up at the pub ceiling ----
function ceiling(ctx: Ctx, w: number, h: number, t: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#3b2516');
  g.addColorStop(0.6, '#5b3b24');
  g.addColorStop(1, '#2d5546');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // beams running away from you
  ctx.strokeStyle = 'rgba(25,14,8,.55)';
  ctx.lineWidth = Math.max(6, w * 0.02);
  const vx = w / 2, vy = -h * 0.9;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(vx + i * w * 0.05, vy); ctx.lineTo(w / 2 + i * w * 0.42, h * 0.75); ctx.stroke();
  }
  // pendant lamps glowing overhead
  for (const [lx, ly] of [[0.18, 0.18], [0.84, 0.3]] as const) {
    const x = w * lx, y = h * ly, r = Math.min(w, h) * 0.07;
    const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, r * 3);
    glow.addColorStop(0, 'rgba(255,214,140,.55)');
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e9a23b'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, Math.PI * 2); ctx.fill();
  }
  void t;
}

// ---- the pint, tipped towards you ----
/** Path of the near wall between heights v0 < v1 (foot side to rim side). */
function band(ctx: Ctx, L: Layout, v0: number, v1: number) {
  ctx.beginPath();
  const N = 24;
  // left edge, foot side to rim side
  for (let i = 0; i <= N; i++) { const v = v0 + ((v1 - v0) * i) / N; ctx.lineTo(L.cx - L.X(v), L.y(v)); }
  // across the near side at v1 (left to right, bulging towards you)
  for (let i = 0; i <= N; i++) { const a = Math.PI / 2 - (Math.PI * i) / N; ctx.lineTo(L.cx - L.X(v1) * Math.sin(a), L.y(v1) + RING * L.X(v1) * Math.cos(a)); }
  // right edge back to the foot side
  for (let i = N; i >= 0; i--) { const v = v0 + ((v1 - v0) * i) / N; ctx.lineTo(L.cx + L.X(v), L.y(v)); }
  // across at v0 (right to left)
  for (let i = N; i >= 0; i--) { const a = Math.PI / 2 - (Math.PI * i) / N; ctx.lineTo(L.cx - L.X(v0) * Math.sin(a), L.y(v0) + RING * L.X(v0) * Math.cos(a)); }
  ctx.closePath();
}
function ring(ctx: Ctx, L: Layout, v: number) {
  ctx.beginPath();
  for (let i = 0; i <= 32; i++) { const a = Math.PI / 2 - (Math.PI * i) / 32; ctx.lineTo(L.cx - L.X(v) * Math.sin(a), L.y(v) + RING * L.X(v) * Math.cos(a)); }
}

function glass(ctx: Ctx, L: Layout, p: Pint, t: number) {
  const line = visibleLine(p);
  const head = Math.max(4, headNow(p));
  const top = Math.min(GLASS.height, line + head);
  // the far end: the foot, a thick disc of glass
  // (seen end-on through the stout, a thick dark disc with a glint)
  const fx = L.X(0) * 1.04, fy = L.y(0) - L.K * P_FOOT * GLASS.base * 0.6;
  ctx.fillStyle = '#5c6f6f'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(L.cx, fy, fx, RING * fx, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#1a0c07';
  ctx.beginPath(); ctx.ellipse(L.cx, fy, fx * 0.78, RING * fx * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(L.cx, fy, fx * 0.9, RING * fx * 0.85, 0, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
  ctx.fillStyle = '#5c6f6f'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(L.cx - fx, fy); ctx.lineTo(L.cx - L.X(0), L.y(0)); ctx.lineTo(L.cx + L.X(0), L.y(0)); ctx.lineTo(L.cx + fx, fy); ctx.stroke();
  // the stout, from the foot to the line
  band(ctx, L, 0, line);
  const beer = ctx.createLinearGradient(L.cx - L.X(line), 0, L.cx + L.X(line), 0);
  beer.addColorStop(0, '#0d0504'); beer.addColorStop(0.4, '#2a1209'); beer.addColorStop(0.55, '#3d1b0d'); beer.addColorStop(1, '#0d0504');
  ctx.fillStyle = beer; ctx.fill();
  // the head, from the line to its top
  if (top > line) {
    band(ctx, L, line, top);
    const yl = L.y(line), yt = L.y(top);
    const hd = ctx.createLinearGradient(0, yl, 0, yt + RING * L.X(top));
    hd.addColorStop(0, '#9a6a3a'); hd.addColorStop(0.08, '#d9b98a'); hd.addColorStop(0.4, '#f3e2bf'); hd.addColorStop(1, '#fff6e0');
    ctx.fillStyle = hd; ctx.fill();
  }
  // empty glass, with foam lacing left behind as the level drops
  if (top < GLASS.height) {
    band(ctx, L, top, GLASS.height);
    ctx.fillStyle = 'rgba(215,235,240,.22)'; ctx.fill();
    const topStart = Math.min(GLASS.height - 2, p.start + p.head);
    ctx.strokeStyle = 'rgba(246,234,208,.6)';
    ctx.lineWidth = 2;
    for (let v = top + 5; v < topStart; v += 7 + ((v * 3.7) % 5)) { ring(ctx, L, v); ctx.stroke(); }
  }
  // the line itself: a crisp caramel edge where stout meets head
  ring(ctx, L, line);
  ctx.strokeStyle = 'rgba(120,80,40,.9)'; ctx.lineWidth = Math.max(1.5, 0.35 * L.at(0, line).sc); ctx.stroke();
  // the G and the brand, printed on the side facing you
  mark(ctx, L);
  // glass outline and highlights
  band(ctx, L, 0, GLASS.height);
  ctx.strokeStyle = INK; ctx.lineWidth = 3.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(4, L.K * 2.4);
  ctx.beginPath();
  for (let v = 20; v <= 150; v += 5) { const q = L.at(-radiusAt(v) * 0.75, v); ctx.lineTo(q.x, q.y); }
  ctx.stroke();
  // the rim, right up close
  ctx.strokeStyle = 'rgba(230,245,248,.8)'; ctx.lineWidth = Math.max(6, L.K * 2.2);
  ring(ctx, L, GLASS.height); ctx.stroke();
  void t;
}

function mark(ctx: Ctx, L: Layout) {
  const pts = gOutline();
  ctx.save();
  ctx.lineCap = 'round';
  const strokeAll = (style: string, extra: number) => {
    ctx.strokeStyle = style;
    for (let i = 1; i < pts.length; i++) {
      const a = L.at(pts[i - 1].u, pts[i - 1].v), b = L.at(pts[i].u, pts[i].v);
      ctx.lineWidth = Math.max(1, ((pts[i - 1].w + pts[i].w) / 2) * a.sc + extra);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
  };
  strokeAll('rgba(43,22,10,.5)', 1.6);
  strokeAll('#f1d68e', 0);
  // the bar's little serif
  const s0 = L.at(G_MARK.barTo, G_MARK.barY), s1 = L.at(G_MARK.barTo, G_MARK.barY - 1.6);
  ctx.lineWidth = Math.max(1, G_MARK.stroke.thin * s0.sc);
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
  // the wordmark, upside down from here like the G
  const wm = L.at(0, G_MARK.bottom - 8);
  ctx.translate(wm.x, wm.y);
  ctx.rotate(Math.PI);
  ctx.scale(wm.sc, wm.sc);
  ctx.font = `900 6.2px ${FONT}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f4dc98';
  ctx.fillText(BRAND.toUpperCase(), 0, 0);
  ctx.restore();
}

// ---- whose hand is this? ----
function hand(ctx: Ctx, L: Layout, c: Character, w: number, h: number, t: number) {
  const big = (c.id === 'declan' ? 1.4 : 1) * persp(72); // the hand is out by the far half of the glass
  const skin = c.look.kind === 'walrus' ? '#8d6b50' : c.look.skin;
  const palm = { x: L.cx + L.X(72) + L.K * 5 * big, y: L.y(72) };
  const elbow = { x: w * 1.08, y: h * 1.1 };
  const armW = L.K * 20 * big;
  // the sleeve: from off-screen bottom right up to the wrist
  const wrist = { x: palm.x + (elbow.x - palm.x) * 0.3, y: palm.y + (elbow.y - palm.y) * 0.3 };
  const ang = Math.atan2(elbow.y - wrist.y, elbow.x - wrist.x);
  ctx.save();
  ctx.lineCap = 'round';
  // forearm skin between palm and cuff
  ctx.strokeStyle = INK; ctx.lineWidth = armW * 0.85 + 6;
  ctx.beginPath(); ctx.moveTo(palm.x, palm.y); ctx.lineTo(wrist.x, wrist.y); ctx.stroke();
  ctx.strokeStyle = skin; ctx.lineWidth = armW * 0.85;
  ctx.stroke();
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
      const q = { x: palm.x + (wrist.x - palm.x) * (0.45 + i * 0.16), y: palm.y + (wrist.y - palm.y) * (0.45 + i * 0.16) + Math.sin(t * 6 + i) * 1.5 };
      ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang + Math.PI / 2);
      ctx.strokeStyle = INK; ctx.lineWidth = armW * 0.16 + 3;
      ctx.beginPath(); ctx.ellipse(0, 0, armW * 0.5, armW * 0.14, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = armW * 0.16; ctx.stroke();
      ctx.restore();
    });
  }
  // palm, just round the far side of the glass
  ctx.fillStyle = skin; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(palm.x, palm.y, L.K * 8 * big, L.K * 13 * big, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  // fingers wrapped round the near side (well clear of the G)
  const fv = c.id === 'declan' ? [56, 65, 74, 83] : [62, 69, 76, 83];
  fv.forEach((v, i) => {
    const reach = (c.id === 'declan' ? 0.58 : 0.7) + i * 0.03; // how far across the glass (1 = edge)
    ctx.beginPath();
    for (let j = 0; j <= 10; j++) {
      const sx = 1.08 - (1.08 - reach) * (j / 10);
      const a = Math.asin(Math.min(1, sx));
      ctx.lineTo(L.cx + L.X(v) * sx, L.y(v) + RING * L.X(v) * Math.cos(a));
    }
    const fw = L.K * 6 * big;
    ctx.strokeStyle = INK; ctx.lineWidth = fw + 5; ctx.stroke();
    ctx.strokeStyle = skin; ctx.lineWidth = fw; ctx.stroke();
    if (c.id === 'dot' && (i === 1 || i === 3)) { // her rings
      const sx = reach + 0.1, a = Math.asin(sx);
      const q = { x: L.cx + L.X(v) * sx, y: L.y(v) + RING * L.X(v) * Math.cos(a) };
      ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(q.x - fw * 0.2, q.y - fw * 0.55, fw * 0.4, fw * 1.1, 3); ctx.fill(); ctx.stroke();
      if (i === 1) { ctx.fillStyle = '#9be7ff'; ctx.beginPath(); ctx.arc(q.x, q.y - fw * 0.55, fw * 0.28, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    }
  });
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
    // a red curl bobbing in at the top
    ctx.strokeStyle = c.look.hair; ctx.lineWidth = S * 0.025; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const x = S * (0.06 + i * 0.07), y = S * 0.02 + Math.sin(t * 3 + i) * S * 0.005;
      ctx.beginPath(); ctx.arc(x, y, S * 0.04, 0.2, Math.PI * 1.8); ctx.stroke();
    }
  } else if (c.id === 'maureen') {
    // the edge of her silver bob
    ctx.fillStyle = c.look.hair; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, -4); ctx.lineTo(S * 0.22, -4); ctx.quadraticCurveTo(S * 0.08, S * 0.1, -4, S * 0.3); ctx.closePath(); ctx.fill(); ctx.stroke();
  } else if (c.id === 'pip') {
    // the rim of his half-moon specs at the bottom of the view
    ctx.lineWidth = S * 0.018; ctx.strokeStyle = '#9c7b4f';
    ctx.beginPath(); ctx.ellipse(w * 0.27, h * 1.02, S * 0.2, S * 0.1, 0, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(w * 0.73, h * 1.02, S * 0.2, S * 0.1, 0, Math.PI, 0); ctx.stroke();
  }
  ctx.restore();
}
