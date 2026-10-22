// Cartoon top-down drawing for Arcade Disc Golf.
import type { Disc, Hole, Vec } from './physics';

export interface Cam { x: number; y: number; ppm: number; w: number; h: number }

const INK = '#2b2d42';
const ROUGH = '#79c25e';
const ROUGH_DARK = '#68b04f';
const FAIRWAY = '#a9e27c';
const FAIRWAY_STRIPE = '#b8ea8c';
const HEDGE = '#3e8a47';
const DISC = '#ff7a59';

const sx = (c: Cam, x: number) => (x - c.x) * c.ppm + c.w / 2;
const sy = (c: Cam, y: number) => (y - c.y) * c.ppm + c.h / 2;

/** cheap repeatable hash → 0..1 */
function hash(i: number, j: number, k = 0) {
  const s = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function fairwayPath(ctx: CanvasRenderingContext2D, pts: Vec[], tx: (p: Vec) => [number, number]) {
  ctx.beginPath();
  pts.forEach((p, i) => { const [x, y] = tx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
}

function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number, sway: number) {
  // shadow
  ctx.fillStyle = 'rgba(30,60,30,.28)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.22, y + r * 0.26, r * 1.02, r * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  // canopy: a cluster of blobs
  const blobs = 7;
  const pts: [number, number, number][] = [];
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + seed * 6;
    const rr = r * (0.42 + hash(seed, i) * 0.12);
    pts.push([x + Math.cos(a) * (r - rr) + sway, y + Math.sin(a) * (r - rr), rr]);
  }
  ctx.lineWidth = Math.max(2, r * 0.07);
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#3f9d52';
  // outline pass, then fill pass, so the inner overlaps don't show lines
  for (const [bx, by, br] of pts) { ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  for (const [bx, by, br] of pts) { ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); }
  ctx.beginPath(); ctx.arc(x + sway, y, r * 0.62, 0, Math.PI * 2); ctx.fill();
  // highlights
  ctx.fillStyle = '#5cbd69';
  ctx.beginPath(); ctx.arc(x - r * 0.25 + sway, y - r * 0.28, r * 0.38, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7fd685';
  ctx.beginPath(); ctx.arc(x - r * 0.33 + sway, y - r * 0.36, r * 0.16, 0, Math.PI * 2); ctx.fill();
}

export function drawCourse(ctx: CanvasRenderingContext2D, hole: Hole, c: Cam, time: number) {
  const { w, h, ppm } = c;
  ctx.fillStyle = ROUGH;
  ctx.fillRect(0, 0, w, h);

  // rough tufts on a world grid
  const x0 = Math.floor(c.x - w / 2 / ppm) - 1, x1 = Math.ceil(c.x + w / 2 / ppm) + 1;
  const y0 = Math.floor(c.y - h / 2 / ppm) - 1, y1 = Math.ceil(c.y + h / 2 / ppm) + 1;
  ctx.strokeStyle = ROUGH_DARK;
  ctx.lineWidth = Math.max(1.5, ppm * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = x0 - (x0 % 2); i <= x1; i += 2) {
    for (let j = y0 - (y0 % 2); j <= y1; j += 2) {
      if (hash(i, j) > 0.55) continue;
      const tx = sx(c, i + hash(i, j, 1) * 2), ty = sy(c, j + hash(i, j, 2) * 2);
      const s = ppm * 0.28;
      ctx.moveTo(tx - s, ty); ctx.lineTo(tx - s * 0.6, ty - s);
      ctx.moveTo(tx, ty); ctx.lineTo(tx, ty - s * 1.3);
      ctx.moveTo(tx + s, ty); ctx.lineTo(tx + s * 0.6, ty - s);
    }
  }
  ctx.stroke();

  // fairway: outline, fill, then mown stripes that follow the curve
  const tx = (p: Vec): [number, number] => [sx(c, p.x), sy(c, p.y)];
  const fw = hole.fairwayHalfWidth * 2 * ppm;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  fairwayPath(ctx, hole.fairway, tx);
  ctx.strokeStyle = 'rgba(43,45,66,.35)'; ctx.lineWidth = fw + 6; ctx.stroke();
  ctx.strokeStyle = FAIRWAY; ctx.lineWidth = fw; ctx.stroke();
  ctx.save();
  ctx.lineCap = 'butt';
  ctx.setLineDash([4 * ppm, 4 * ppm]);
  ctx.strokeStyle = FAIRWAY_STRIPE; ctx.lineWidth = fw - 2; ctx.stroke();
  ctx.restore();

  // tee pad
  const t = hole.tee;
  ctx.save();
  ctx.translate(sx(c, t.x), sy(c, t.y));
  ctx.fillStyle = 'rgba(30,60,30,.25)';
  ctx.beginPath(); ctx.roundRect(-1.6 * ppm + 4, -2.6 * ppm + 4, 3.2 * ppm, 5.2 * ppm, ppm * 0.5); ctx.fill();
  ctx.fillStyle = '#d9cdb8'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, ppm * 0.1);
  ctx.beginPath(); ctx.roundRect(-1.6 * ppm, -2.6 * ppm, 3.2 * ppm, 5.2 * ppm, ppm * 0.5); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(43,45,66,.18)'; ctx.lineWidth = Math.max(1, ppm * 0.05);
  for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(-1.6 * ppm, k * 1.3 * ppm); ctx.lineTo(1.6 * ppm, k * 1.3 * ppm); ctx.stroke(); }
  // hole sign
  ctx.translate(2.6 * ppm, 1.6 * ppm);
  ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-0.12 * ppm, -0.2 * ppm, 0.24 * ppm, 0.9 * ppm);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, ppm * 0.08);
  ctx.beginPath(); ctx.roundRect(-0.9 * ppm, -1.3 * ppm, 1.8 * ppm, 1.2 * ppm, ppm * 0.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = `900 ${Math.round(ppm * 0.62)}px ui-rounded, Nunito, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`1 · P${hole.par}`, 0, -0.68 * ppm);
  ctx.restore();

  // hedge beyond the course boundary
  const b = hole.bounds;
  ctx.save();
  ctx.fillStyle = HEDGE;
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(sx(c, b.minX), sy(c, b.minY), (b.maxX - b.minX) * ppm, (b.maxY - b.minY) * ppm);
  ctx.fill('evenodd');
  // bumpy hedge edge
  ctx.fillStyle = HEDGE; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, ppm * 0.07);
  const bump = (x: number, y: number, k: number) => {
    const X = sx(c, x), Y = sy(c, y);
    if (X < -ppm * 2 || X > w + ppm * 2 || Y < -ppm * 2 || Y > h + ppm * 2) return;
    ctx.beginPath(); ctx.arc(X, Y, ppm * (0.9 + hash(k, x + y) * 0.5), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  };
  for (let x = b.minX; x <= b.maxX; x += 1.6) { bump(x, b.minY, 1); bump(x, b.maxY, 2); }
  for (let y = b.minY; y <= b.maxY; y += 1.6) { bump(b.minX, y, 3); bump(b.maxX, y, 4); }
  ctx.restore();

  // trees
  hole.trees.forEach((tr, i) => {
    const X = sx(c, tr.x), Y = sy(c, tr.y), R = tr.r * ppm;
    if (X < -R * 2 || X > w + R * 2 || Y < -R * 2 || Y > h + R * 2) return;
    drawTree(ctx, X, Y, R, i + 1, Math.sin(time * 0.9 + i) * ppm * 0.06);
  });
}

/** The chain basket from above: tray, chains, yellow top band, pole cap. */
export function drawBasket(ctx: CanvasRenderingContext2D, p: Vec, c: Cam, chainsT: number, clangT: number, time: number) {
  const X = sx(c, p.x), Y = sy(c, p.y), u = c.ppm;
  const R = 0.95 * u; // drawn a bit larger than life so it reads on a phone
  let shake = 0, pulse = 0;
  if (chainsT >= 0) { shake = Math.exp(-chainsT * 2.2) * Math.sin(chainsT * 38); pulse = Math.exp(-chainsT * 3); }
  if (clangT >= 0) shake += Math.exp(-clangT * 5) * Math.sin(clangT * 70) * 0.6;
  ctx.save();
  ctx.translate(X, Y);
  // shadow
  ctx.fillStyle = 'rgba(30,60,30,.3)';
  ctx.beginPath(); ctx.ellipse(R * 0.35, R * 0.4, R * 1.05, R * 0.95, 0, 0, Math.PI * 2); ctx.fill();
  // catch rings when the chains get it
  if (chainsT >= 0 && chainsT < 1.6) {
    for (let k = 0; k < 3; k++) {
      const tt = chainsT - k * 0.18;
      if (tt <= 0) continue;
      ctx.strokeStyle = `rgba(242,201,76,${Math.max(0, 1 - tt / 0.9)})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, R * (1.1 + tt * 3.2), 0, Math.PI * 2); ctx.stroke();
    }
  }
  ctx.scale(1 + pulse * 0.18, 1 + pulse * 0.18);
  ctx.rotate(shake * 0.12);
  // tray (lower basket)
  ctx.fillStyle = '#b8c0c8'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, u * 0.09);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9099a3';
  ctx.beginPath(); ctx.arc(0, 0, R * 0.78, 0, Math.PI * 2); ctx.fill();
  // wire basket bars
  ctx.strokeStyle = 'rgba(43,45,66,.35)'; ctx.lineWidth = Math.max(1, u * 0.04);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78); ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R); ctx.stroke();
  }
  // chains hanging from the top band, swinging when hit
  ctx.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const sw = shake * 0.35 * Math.sin(k * 1.7 + time * 20) + Math.sin(time * 1.3 + k) * 0.02;
    ctx.strokeStyle = k % 2 ? '#e4e8ec' : '#cdd3d9';
    ctx.lineWidth = Math.max(1.5, u * 0.07);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62);
    ctx.quadraticCurveTo(Math.cos(a + sw) * R * 0.38, Math.sin(a + sw) * R * 0.38, Math.cos(a + sw * 2) * R * 0.12, Math.sin(a + sw * 2) * R * 0.12);
    ctx.stroke();
  }
  // yellow top band
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(4, u * 0.26);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.64, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = Math.max(2.5, u * 0.16);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.64, 0, Math.PI * 2); ctx.stroke();
  // pole cap
  ctx.fillStyle = '#e04f3a'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, u * 0.06);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}

export function drawDisc(ctx: CanvasRenderingContext2D, d: Disc, c: Cam, inBasket: boolean) {
  const u = c.ppm;
  const r = 0.55 * u * (1 + d.z * 0.12); // closer to the camera when it's up in the air
  const X = sx(c, d.x), Y = sy(c, d.y);
  ctx.save();
  // shadow drops away as it climbs
  if (!inBasket) {
    ctx.fillStyle = 'rgba(30,50,30,.3)';
    ctx.beginPath(); ctx.ellipse(X + d.z * u * 0.5, Y + d.z * u * 0.6, 0.55 * u, 0.5 * u, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(X, Y);
  ctx.rotate(d.spin);
  ctx.fillStyle = DISC; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, u * 0.09);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(1.5, u * 0.06);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.stroke();
  // a stamp, so you can see it spin
  ctx.fillStyle = '#fff4d6';
  ctx.beginPath(); ctx.moveTo(r * 0.15, -r * 0.42); ctx.lineTo(r * 0.38, 0); ctx.lineTo(r * 0.15, r * 0.42); ctx.closePath(); ctx.fill();
  ctx.restore();
}

/**
 * The aim arrow from the disc. power < 0 while still picking the direction (a sweeping arrow);
 * then it fills with power, then bends to show which way the curve will go.
 */
export function drawAim(ctx: CanvasRenderingContext2D, c: Cam, d: Vec, aim: number, power: number, curve: number, stage: string, sinceLock: number) {
  const u = c.ppm;
  const X = sx(c, d.x), Y = sy(c, d.y);
  const len = Math.min(c.w, c.h) * 0.3;
  ctx.save();
  ctx.translate(X, Y);
  ctx.rotate(aim);
  // the arrow's centre line, bent for curve
  const bend = curve * len * 0.32;
  const along = (t: number) => ({ x: t * len, y: bend * t * t });
  const tip = along(1);
  const pre = along(0.94);
  const ang = Math.atan2(tip.y - pre.y, tip.x - pre.x);
  const body = (t0: number, t1: number) => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) { const p = along(t0 + (t1 - t0) * (i / 24)); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
  };
  const start = (0.75 * u) / len;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  body(start, 0.9);
  ctx.strokeStyle = INK; ctx.lineWidth = 11; ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.stroke();
  if (power >= 0) {
    body(start, start + (0.9 - start) * Math.max(0.001, power));
    ctx.strokeStyle = power > 0.85 ? '#ff7a59' : power > 0.5 ? '#f2c94c' : '#7bd389';
    ctx.lineWidth = 6; ctx.stroke();
  } else {
    // sweeping: dashes march outwards
    ctx.setLineDash([8, 10]); ctx.lineDashOffset = -performance.now() / 30;
    body(start, 0.9); ctx.strokeStyle = 'rgba(72,202,228,.9)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.setLineDash([]);
  }
  // head
  ctx.translate(tip.x, tip.y); ctx.rotate(ang);
  const hs = 16 + (sinceLock >= 0 && sinceLock < 0.25 ? (0.25 - sinceLock) * 30 : 0);
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-hs, -hs * 0.7); ctx.lineTo(-hs * 0.7, 0); ctx.lineTo(-hs, hs * 0.7); ctx.closePath();
  ctx.fillStyle = stage === 'aim' ? '#48cae4' : '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---- minimap ---------------------------------------------------------------------------
export function buildMinimap(hole: Hole, mw: number, mh: number, s: number, dpr: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(mw * dpr); cv.height = Math.round(mh * dpr);
  const g = cv.getContext('2d')!;
  g.scale(dpr, dpr);
  const b = hole.bounds;
  const tx = (p: Vec): [number, number] => [(p.x - b.minX) * s, (p.y - b.minY) * s];
  g.fillStyle = ROUGH; g.fillRect(0, 0, mw, mh);
  g.lineJoin = 'round'; g.lineCap = 'round';
  fairwayPath(g, hole.fairway, tx);
  g.strokeStyle = FAIRWAY; g.lineWidth = hole.fairwayHalfWidth * 2 * s; g.stroke();
  for (const tr of hole.trees) {
    const [x, y] = tx(tr);
    g.fillStyle = '#3f9d52'; g.strokeStyle = 'rgba(43,45,66,.7)'; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, tr.r * s, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  const [teeX, teeY] = tx(hole.tee);
  g.fillStyle = '#d9cdb8'; g.strokeStyle = INK; g.lineWidth = 1.2;
  g.fillRect(teeX - 1.6 * s, teeY - 2.6 * s, 3.2 * s, 5.2 * s); g.strokeRect(teeX - 1.6 * s, teeY - 2.6 * s, 3.2 * s, 5.2 * s);
  return cv;
}

export function drawMinimap(
  ctx: CanvasRenderingContext2D, img: HTMLCanvasElement | null, mm: { x: number; y: number; w: number; h: number; s: number },
  hole: Hole, d: Disc, throws: Vec[][], view: { x: number; y: number; w: number; h: number },
) {
  if (!img) return;
  const b = hole.bounds;
  const tx = (p: Vec): [number, number] => [mm.x + (p.x - b.minX) * mm.s, mm.y + (p.y - b.minY) * mm.s];
  ctx.save();
  ctx.shadowColor = INK; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.roundRect(mm.x - 4, mm.y - 4, mm.w + 8, mm.h + 8, 12); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.save();
  ctx.beginPath(); ctx.roundRect(mm.x, mm.y, mm.w, mm.h, 9); ctx.clip();
  ctx.drawImage(img, mm.x, mm.y, mm.w, mm.h);
  // what the main view is showing
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
  const [vx, vy] = tx(view);
  ctx.strokeRect(vx, vy, view.w * mm.s, view.h * mm.s);
  ctx.setLineDash([]);
  // throws so far
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const t of throws) {
    ctx.beginPath();
    t.forEach((p, i) => { const [x, y] = tx(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.roundRect(mm.x - 4, mm.y - 4, mm.w + 8, mm.h + 8, 12); ctx.stroke();
  // basket
  const [bx, by] = tx(hole.basket);
  ctx.fillStyle = '#f2c94c'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(bx, by, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fill();
  // disc
  const [dx, dy] = tx(d);
  ctx.fillStyle = DISC; ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(dx, dy, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
}
