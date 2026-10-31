// Robot Rumble: cartoon top-down drawing of the arena and the robots.
import { ARENA, BODIES, WEAPONS, type Build, type Layout, type ZoneId } from './sim';

export const INK = '#2b2d42';
export const TEAM = [
  { main: '#48cae4', dark: '#1b8fae', light: '#bdeffa', name: 'blue' },
  { main: '#ff7a59', dark: '#c94a2c', light: '#ffd3c6', name: 'orange' },
] as const;
export const ZONE_COLOUR: Record<ZoneId, { base: string; dark: string; light: string; label: string }> = {
  steel: { base: '#a9b4c2', dark: '#7d8896', light: '#d3dbe4', label: '#3d4654' },
  sand: { base: '#ecc879', dark: '#c9a052', light: '#f8e3b0', label: '#7a5a1c' },
  ice: { base: '#cfeefa', dark: '#8fcfe8', light: '#ffffff', label: '#2d6f8c' },
  rubble: { base: '#a08a72', dark: '#6f5c49', light: '#c9b39a', label: '#3f3125' },
};
export const ZONE_EMOJI: Record<ZoneId, string> = { steel: '🔩', sand: '🏜️', ice: '🧊', rubble: '🧱' };

/** What the drawer needs to know about a robot (a sim Bot fits, so does a preview). */
export interface BotLook {
  x: number; y: number; heading: number;
  build: Build;
  side: 0 | 1;
  speed?: number;
  swing?: number; // s since the weapon fired
  flipped?: number;
  held?: number;
  stun?: number;
  hp?: number; maxHp?: number;
  odo?: number; // distance travelled, for wheel and leg animation
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
const seeded = (s: number) => () => ((s = (s * 16807) % 2147483647) / 2147483647);

// ---- the arena ---------------------------------------------------------------------------
function texture(ctx: CanvasRenderingContext2D, z: ZoneId, x0: number, y0: number, w: number, h: number, k: number) {
  const c = ZONE_COLOUR[z];
  ctx.fillStyle = c.base; ctx.fillRect(x0, y0, w, h);
  const r = seeded(17 + ZONE_IDS_ORDER.indexOf(z) * 101);
  ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
  if (z === 'steel') {
    // riveted plates
    const p = 12.5 * k;
    ctx.strokeStyle = c.dark; ctx.lineWidth = Math.max(1, 0.35 * k);
    for (let x = x0; x <= x0 + w + 1; x += p) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); ctx.stroke(); }
    for (let y = y0; y <= y0 + h + 1; y += p) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
    ctx.fillStyle = c.dark;
    for (let x = x0; x < x0 + w; x += p) for (let y = y0; y < y0 + h; y += p) for (const [dx, dy] of [[1.4, 1.4], [p / k - 1.4, 1.4], [1.4, p / k - 1.4], [p / k - 1.4, p / k - 1.4]]) { ctx.beginPath(); ctx.arc(x + dx * k, y + dy * k, 0.45 * k, 0, 7); ctx.fill(); }
    ctx.strokeStyle = c.light; ctx.lineWidth = 0.6 * k; ctx.globalAlpha = 0.6;
    for (let i = 0; i < 7; i++) { const x = x0 + r() * w, y = y0 + r() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 * k, y - 4 * k); ctx.stroke(); }
  } else if (z === 'sand') {
    ctx.strokeStyle = c.dark; ctx.lineWidth = 0.5 * k; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 9; i++) { const y = y0 + (i + 0.5) * h / 9; ctx.beginPath(); for (let x = x0; x <= x0 + w; x += 2 * k) ctx.lineTo(x, y + Math.sin((x - x0) / (3.2 * k) + i) * 0.9 * k); ctx.stroke(); }
    ctx.globalAlpha = 0.7; ctx.fillStyle = c.dark;
    for (let i = 0; i < 90; i++) { ctx.beginPath(); ctx.arc(x0 + r() * w, y0 + r() * h, (0.2 + r() * 0.3) * k, 0, 7); ctx.fill(); }
    ctx.fillStyle = c.light;
    for (let i = 0; i < 50; i++) { ctx.beginPath(); ctx.arc(x0 + r() * w, y0 + r() * h, 0.3 * k, 0, 7); ctx.fill(); }
  } else if (z === 'ice') {
    const g = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
    g.addColorStop(0, '#e4f7fd'); g.addColorStop(1, c.base);
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = c.light; ctx.lineWidth = 0.9 * k; ctx.globalAlpha = 0.9;
    for (let i = 0; i < 8; i++) { const x = x0 + r() * w, y = y0 + r() * h, l = (5 + r() * 8) * k; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y - l * 0.35); ctx.stroke(); }
    ctx.strokeStyle = c.dark; ctx.lineWidth = 0.35 * k; ctx.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) { let x = x0 + r() * w, y = y0 + r() * h; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (r() - 0.3) * 5 * k; y += (r() - 0.5) * 5 * k; ctx.lineTo(x, y); } ctx.stroke(); }
  } else {
    // rubble: bricks, bolts and bits
    for (let i = 0; i < 42; i++) {
      const x = x0 + r() * w, y = y0 + r() * h, s = (1.2 + r() * 2.2) * k, a = r() * 3;
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = r() < 0.5 ? '#b5654a' : r() < 0.5 ? c.dark : c.light;
      ctx.strokeStyle = 'rgba(43,45,66,.55)'; ctx.lineWidth = 0.3 * k;
      ctx.beginPath(); ctx.moveTo(-s, -s * 0.5); ctx.lineTo(s * 0.8, -s * 0.7); ctx.lineTo(s, s * 0.4); ctx.lineTo(-s * 0.6, s * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = '#5c5f6e';
    for (let i = 0; i < 10; i++) { const x = x0 + r() * w, y = y0 + r() * h; ctx.beginPath(); ctx.arc(x, y, 0.7 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#8a8d9c'; ctx.beginPath(); ctx.arc(x, y, 0.3 * k, 0, 7); ctx.fill(); ctx.fillStyle = '#5c5f6e'; }
  }
  ctx.restore();
}
const ZONE_IDS_ORDER: ZoneId[] = ['steel', 'sand', 'ice', 'rubble'];

/** Draw the arena floor, walls and zone labels into a canvas `size` px square. */
export function drawArena(ctx: CanvasRenderingContext2D, L: Layout, size: number, labels = true) {
  const k = size / ARENA;
  const h = size / 2;
  L.forEach((z, i) => texture(ctx, z, (i % 2) * h, (i >= 2 ? 1 : 0) * h, h, h, k));
  // zone seams
  ctx.strokeStyle = 'rgba(43,45,66,.45)'; ctx.lineWidth = Math.max(1.5, 0.5 * k); ctx.setLineDash([2 * k, 1.5 * k]);
  ctx.beginPath(); ctx.moveTo(h, 0); ctx.lineTo(h, size); ctx.moveTo(0, h); ctx.lineTo(size, h); ctx.stroke(); ctx.setLineDash([]);
  // the centre spot
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = Math.max(2, 0.7 * k);
  ctx.beginPath(); ctx.arc(h, h, 7 * k, 0, 7); ctx.stroke();
  // hazard-striped walls
  const wall = 1.6 * k;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.rect(wall, wall, size - 2 * wall, size - 2 * wall); ctx.clip('evenodd');
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = INK;
  for (let x = -size; x < size * 2; x += 4 * k) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2 * k, 0); ctx.lineTo(x + 2 * k + size, size); ctx.lineTo(x + size, size); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.6 * k); ctx.strokeRect(wall, wall, size - 2 * wall, size - 2 * wall);
  if (!labels) return;
  ctx.font = `800 ${Math.max(10, 3.1 * k)}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  L.forEach((z, i) => {
    const right = i % 2 === 1, bottom = i >= 2;
    const x = right ? size - wall - 2 * k : wall + 2 * k, y = bottom ? size - wall - 3 * k : wall + 3 * k;
    const text = ZONE_NAME_SHORT[z];
    ctx.textAlign = right ? 'right' : 'left';
    const w = ctx.measureText(text).width + 3 * k;
    ctx.fillStyle = 'rgba(255,255,255,.78)';
    rr(ctx, right ? x - w + 1.5 * k - 1.5 * k : x - 1.5 * k, y - 2.4 * k, w, 4.8 * k, 2.4 * k); ctx.fill();
    ctx.fillStyle = ZONE_COLOUR[z].label;
    ctx.fillText(text, right ? x - 0 : x, y + 0.2 * k);
  });
}
const ZONE_NAME_SHORT: Record<ZoneId, string> = { steel: 'STEEL', sand: 'SAND', ice: 'ICE', rubble: 'RUBBLE' };

// ---- the robots ----------------------------------------------------------------------------
/** Draw a robot. `k` = px per arena unit, `t` = seconds (for spinning and bobbing). */
export function drawBot(ctx: CanvasRenderingContext2D, b: BotLook, k: number, t: number) {
  const B = BODIES[b.build.body];
  const r = B.radius * k;
  const team = TEAM[b.side];
  const flipped = (b.flipped ?? 0) > 0;
  const lw = Math.max(1.5, 0.42 * k);
  ctx.save();
  ctx.translate(b.x * k, b.y * k);
  // a claw-held bot trembles; a flipped one bounces as it rights itself
  if ((b.held ?? 0) > 0) ctx.translate(Math.sin(t * 90) * 0.25 * k, Math.cos(t * 77) * 0.25 * k);
  const hop = flipped ? Math.abs(Math.sin((b.flipped ?? 0) * 9)) * 0.18 : 0;
  // shadow
  ctx.fillStyle = 'rgba(43,45,66,.28)';
  ctx.beginPath(); ctx.ellipse(0.6 * k, 0.9 * k, r * (1.15 + hop), r * (1.05 + hop), 0, 0, 7); ctx.fill();
  if (hop) ctx.scale(1 + hop, 1 + hop);
  ctx.rotate(b.heading);
  ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const odo = b.odo ?? t * 6;
  drawDrive(ctx, b, r, k, t, odo, flipped);
  if (flipped) drawUnderside(ctx, b, r, k);
  else {
    drawBody(ctx, b, r, k, team);
    drawWeapon(ctx, b, r, k, t);
    // eyes (LEDs) on the front, cartoon style; they look worried when stunned
    if (b.build.body !== 'frame') drawEyes(ctx, b, r, k);
  }
  ctx.restore();
  if ((b.stun ?? 0) > 0.05 && !flipped) drawStars(ctx, b.x * k, b.y * k - r * 1.1, k, t);
  if (flipped) drawStars(ctx, b.x * k, b.y * k - r * 1.2, k, t);
}

function drawDrive(ctx: CanvasRenderingContext2D, b: BotLook, r: number, k: number, t: number, odo: number, flipped: boolean) {
  const d = b.build.drive;
  if (d === 'wheels') {
    for (const sx of [-0.55, 0.55]) for (const sy of [-1, 1]) {
      ctx.save(); ctx.translate(sx * r, sy * r * 0.98);
      ctx.fillStyle = '#34364a'; rr(ctx, -0.36 * r, -0.2 * r, 0.72 * r, 0.4 * r, 0.12 * r); ctx.fill(); ctx.stroke();
      // tread marks rolling round
      ctx.strokeStyle = '#6b6e85'; ctx.lineWidth = Math.max(1, 0.18 * k);
      for (let i = 0; i < 4; i++) { const x = (((odo * 0.9 + i * 0.25) % 1) - 0.5) * 0.66 * r; ctx.beginPath(); ctx.moveTo(x, -0.16 * r); ctx.lineTo(x, 0.16 * r); ctx.stroke(); }
      ctx.restore();
    }
  } else if (d === 'tracks') {
    for (const sy of [-1, 1]) {
      ctx.save(); ctx.translate(0, sy * r * 0.95);
      ctx.fillStyle = '#3b3d52'; rr(ctx, -1.05 * r, -0.27 * r, 2.1 * r, 0.54 * r, 0.25 * r); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#8b8ea6'; ctx.lineWidth = Math.max(1, 0.2 * k);
      for (let i = 0; i < 9; i++) { const x = ((((odo * 0.7 + i / 9) % 1) + 1) % 1 - 0.5) * 1.9 * r; ctx.beginPath(); ctx.moveTo(x, -0.2 * r); ctx.lineTo(x, 0.2 * r); ctx.stroke(); }
      ctx.fillStyle = '#6b6e85';
      for (const x of [-0.78, 0.78]) { ctx.beginPath(); ctx.arc(x * r, 0, 0.13 * r, 0, 7); ctx.fill(); }
      ctx.restore();
    }
  } else if (d === 'legs') {
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.55 * k);
    for (const sy of [-1, 1]) for (let i = 0; i < 3; i++) {
      const phase = odo * 2.2 + i * 2.1 + (sy > 0 ? Math.PI : 0);
      const bx = (i - 1) * 0.6 * r, swingx = Math.sin(phase) * 0.28 * r;
      const kx = bx + swingx * 0.5, ky = sy * 1.25 * r, fx = bx + swingx, fy = sy * (1.55 + 0.08 * Math.cos(phase)) * r;
      ctx.beginPath(); ctx.moveTo(bx, sy * 0.6 * r); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      ctx.fillStyle = '#5c5f6e'; ctx.beginPath(); ctx.arc(kx, ky, 0.14 * r, 0, 7); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(fx, fy, 0.12 * r, 0, 7); ctx.fill();
    }
    ctx.lineWidth = Math.max(1.5, 0.42 * k);
  } else {
    // hover: a rubber skirt on a glowing cushion of air
    const bob = Math.sin(t * 7) * 0.04 * r;
    const g = ctx.createRadialGradient(0, 0, r * 0.6, 0, 0, r * 1.55);
    g.addColorStop(0, 'rgba(120,230,255,.0)'); g.addColorStop(0.75, 'rgba(120,230,255,.55)'); g.addColorStop(1, 'rgba(120,230,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r * 1.55, 0, 7); ctx.fill();
    ctx.fillStyle = '#2f3145'; ctx.beginPath(); ctx.ellipse(0, 0, r * 1.22 + bob, r * 1.22 + bob, 0, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#78e6ff'; ctx.lineWidth = Math.max(1, 0.25 * k); ctx.setLineDash([0.5 * k, 0.6 * k]); ctx.lineDashOffset = -t * 20;
    ctx.beginPath(); ctx.arc(0, 0, r * 1.08, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    // two fans at the back
    for (const sy of [-0.55, 0.55]) {
      ctx.save(); ctx.translate(-1.02 * r, sy * r);
      ctx.fillStyle = '#4a4d66'; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, 0.3 * k);
      ctx.beginPath(); ctx.arc(0, 0, 0.32 * r, 0, 7); ctx.fill(); ctx.stroke();
      ctx.rotate(t * 25 * (sy > 0 ? 1 : -1)); ctx.strokeStyle = '#b8bbcf';
      for (let i = 0; i < 3; i++) { ctx.rotate(2.09); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0.26 * r, 0); ctx.stroke(); }
      ctx.restore();
    }
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 0.42 * k);
  }
  void flipped;
}

function drawBody(ctx: CanvasRenderingContext2D, b: BotLook, r: number, k: number, team: (typeof TEAM)[number]) {
  const body = b.build.body;
  const grad = (x0: number, y0: number, x1: number, y1: number) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, team.light); g.addColorStop(0.35, team.main); g.addColorStop(1, team.dark); return g; };
  if (body === 'box') {
    ctx.fillStyle = grad(-r, -r, r, r);
    rr(ctx, -0.92 * r, -0.86 * r, 1.84 * r, 1.72 * r, 0.22 * r); ctx.fill(); ctx.stroke();
    // armour panel and bolts
    ctx.strokeStyle = team.dark; ctx.lineWidth = Math.max(1, 0.25 * k);
    rr(ctx, -0.62 * r, -0.56 * r, 1.1 * r, 1.12 * r, 0.12 * r); ctx.stroke();
    ctx.fillStyle = INK;
    for (const [x, y] of [[-0.72, -0.66], [0.72, -0.66], [-0.72, 0.66], [0.72, 0.66]]) { ctx.beginPath(); ctx.arc(x * r, y * r, 0.08 * r, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,.45)'; rr(ctx, -0.8 * r, -0.76 * r, 0.9 * r, 0.16 * r, 0.08 * r); ctx.fill();
  } else if (body === 'wedge') {
    ctx.fillStyle = grad(r, 0, -r, 0);
    ctx.beginPath(); ctx.moveTo(-0.85 * r, -0.92 * r); ctx.lineTo(0.35 * r, -0.92 * r); ctx.lineTo(1.12 * r, -0.62 * r); ctx.lineTo(1.12 * r, 0.62 * r); ctx.lineTo(0.35 * r, 0.92 * r); ctx.lineTo(-0.85 * r, 0.92 * r); ctx.closePath(); ctx.fill(); ctx.stroke();
    // the sloped nose: stripes getting closer together towards the front edge
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = Math.max(1, 0.2 * k);
    for (const x of [0.05, 0.42, 0.7, 0.9]) { ctx.beginPath(); ctx.moveTo(x * r, -0.85 * r + Math.max(0, x - 0.35) * 0.4 * r); ctx.lineTo(x * r, 0.85 * r - Math.max(0, x - 0.35) * 0.4 * r); ctx.stroke(); }
    ctx.fillStyle = team.dark; rr(ctx, -0.75 * r, -0.4 * r, 0.5 * r, 0.8 * r, 0.1 * r); ctx.fill();
  } else if (body === 'dome') {
    const g = ctx.createRadialGradient(-0.35 * r, -0.35 * r, 0.1 * r, 0, 0, r);
    g.addColorStop(0, '#fff'); g.addColorStop(0.25, team.light); g.addColorStop(0.6, team.main); g.addColorStop(1, team.dark);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(43,45,66,.35)'; ctx.lineWidth = Math.max(1, 0.2 * k);
    ctx.beginPath(); ctx.arc(0, 0, 0.62 * r, 0, 7); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.ellipse(-0.38 * r, -0.42 * r, 0.26 * r, 0.12 * r, -0.7, 0, 7); ctx.fill();
  } else {
    // open frame: a tubular cage with its insides on show
    ctx.fillStyle = 'rgba(43,45,66,.18)'; rr(ctx, -0.9 * r, -0.85 * r, 1.8 * r, 1.7 * r, 0.15 * r); ctx.fill();
    // the guts: battery, motors, wires
    ctx.fillStyle = '#f2c94c'; rr(ctx, -0.55 * r, -0.3 * r, 0.6 * r, 0.6 * r, 0.06 * r); ctx.fill(); ctx.lineWidth = Math.max(1, 0.2 * k); ctx.stroke();
    ctx.fillStyle = '#9aa0b5'; for (const y of [-0.5, 0.5]) { ctx.beginPath(); ctx.arc(0.35 * r, y * r, 0.2 * r, 0, 7); ctx.fill(); ctx.stroke(); }
    ctx.strokeStyle = '#e63946'; ctx.lineWidth = Math.max(1, 0.15 * k);
    ctx.beginPath(); ctx.moveTo(0.05 * r, -0.1 * r); ctx.quadraticCurveTo(0.25 * r, -0.2 * r, 0.35 * r, -0.5 * r); ctx.stroke();
    ctx.strokeStyle = '#2a9d8f'; ctx.beginPath(); ctx.moveTo(0.05 * r, 0.1 * r); ctx.quadraticCurveTo(0.25 * r, 0.2 * r, 0.35 * r, 0.5 * r); ctx.stroke();
    // the tubes, in team colour
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, 0.5 * k) + 2;
    const tube = () => { rr(ctx, -0.9 * r, -0.85 * r, 1.8 * r, 1.7 * r, 0.15 * r); ctx.moveTo(-0.9 * r, 0); ctx.lineTo(-0.6 * r, 0); ctx.moveTo(-0.9 * r, -0.85 * r); ctx.lineTo(-0.6 * r, -0.3 * r); ctx.moveTo(-0.9 * r, 0.85 * r); ctx.lineTo(-0.6 * r, 0.3 * r); };
    ctx.beginPath(); tube(); ctx.stroke();
    ctx.strokeStyle = team.main; ctx.lineWidth = Math.max(3, 0.5 * k) - 0.5;
    ctx.beginPath(); tube(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 0.42 * k);
    // two LED eyes bolted to the front tube
    ctx.fillStyle = '#fff';
    for (const y of [-0.38, 0.38]) { ctx.beginPath(); ctx.arc(0.82 * r, y * r, 0.17 * r, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0.88 * r, y * r, 0.08 * r, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; }
  }
}

function drawEyes(ctx: CanvasRenderingContext2D, b: BotLook, r: number, k: number) {
  const x = b.build.body === 'wedge' ? -0.2 * r : b.build.body === 'dome' ? 0.35 * r : 0.4 * r;
  const stunned = (b.stun ?? 0) > 0.05;
  for (const y of [-0.3, 0.3]) {
    ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1, 0.25 * k);
    ctx.beginPath(); ctx.arc(x, y * r, 0.19 * r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    if (stunned) { ctx.lineWidth = Math.max(1, 0.18 * k); ctx.beginPath(); ctx.moveTo(x - 0.09 * r, y * r - 0.09 * r); ctx.lineTo(x + 0.09 * r, y * r + 0.09 * r); ctx.moveTo(x + 0.09 * r, y * r - 0.09 * r); ctx.lineTo(x - 0.09 * r, y * r + 0.09 * r); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x + 0.07 * r, y * r, 0.09 * r, 0, 7); ctx.fill(); }
  }
  ctx.lineWidth = Math.max(1.5, 0.42 * k);
}

function drawUnderside(ctx: CanvasRenderingContext2D, b: BotLook, r: number, k: number) {
  // upside down: grey belly plate, a battery hatch and a sorry-looking label
  ctx.fillStyle = '#7d8094';
  if (b.build.body === 'dome') { ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke(); }
  else { rr(ctx, -0.92 * r, -0.86 * r, 1.84 * r, 1.72 * r, 0.22 * r); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#5c5f73'; rr(ctx, -0.45 * r, -0.35 * r, 0.9 * r, 0.7 * r, 0.1 * r); ctx.fill();
  ctx.strokeStyle = '#a5a8bb'; ctx.lineWidth = Math.max(1, 0.2 * k);
  ctx.beginPath(); ctx.moveTo(-0.3 * r, -0.15 * r); ctx.lineTo(0.3 * r, -0.15 * r); ctx.moveTo(-0.3 * r, 0.05 * r); ctx.lineTo(0.2 * r, 0.05 * r); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 0.42 * k);
}

function drawStars(ctx: CanvasRenderingContext2D, x: number, y: number, k: number, t: number) {
  ctx.save();
  ctx.font = `${Math.max(9, 2.6 * k)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) { const a = t * 5 + i * 2.1; ctx.fillText('⭐', x + Math.cos(a) * 3 * k, y + Math.sin(a) * 1.1 * k); }
  ctx.restore();
}

function drawWeapon(ctx: CanvasRenderingContext2D, b: BotLook, r: number, k: number, t: number) {
  const w = b.build.weapon;
  const s = b.swing ?? 9;
  const reach = WEAPONS[w].reach * k;
  const front = b.build.body === 'wedge' ? 1.12 * r : b.build.body === 'dome' ? 0.95 * r : 0.92 * r;
  if (w === 'flipper') {
    // a flat lifting plate on the front; it flicks up (out and bigger) when it fires
    const up = s < 0.3 ? Math.sin((s / 0.3) * Math.PI) : 0;
    const len = (0.55 + 0.35 * up) * r + up * reach * 0.5;
    ctx.fillStyle = up > 0 ? '#ffe08a' : '#c9ccd9';
    ctx.beginPath(); ctx.moveTo(front - 0.1 * r, -0.7 * r); ctx.lineTo(front + len, -0.8 * r - up * 0.2 * r); ctx.lineTo(front + len, 0.8 * r + up * 0.2 * r); ctx.lineTo(front - 0.1 * r, 0.7 * r); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(43,45,66,.5)'; ctx.lineWidth = Math.max(1, 0.18 * k);
    for (const y of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(front + 0.1 * r, y * r); ctx.lineTo(front + len - 0.12 * r, y * r * 1.05); ctx.stroke(); }
    if (up > 0.2) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(1, 0.25 * k); for (const y of [-0.9, 0.9]) { ctx.beginPath(); ctx.moveTo(front + len + 0.2 * r, y * r); ctx.lineTo(front + len + 0.7 * r, y * r * 1.3); ctx.stroke(); } }
  } else if (w === 'spinner') {
    // a toothed disc on a short boom, whirling
    const cx = front + 0.35 * r, rad = 0.62 * r;
    ctx.fillStyle = '#9aa0b5'; rr(ctx, front - 0.2 * r, -0.12 * r, 0.6 * r, 0.24 * r, 0.06 * r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(200,205,220,.35)'; ctx.beginPath(); ctx.arc(cx, 0, rad * 1.18, 0, 7); ctx.fill();
    ctx.save(); ctx.translate(cx, 0); ctx.rotate(t * 40);
    ctx.fillStyle = '#d7dbe6';
    ctx.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; const rr2 = i % 2 ? rad : rad * 1.18; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = s < 0.2 ? '#ff7a59' : '#6b6e85'; ctx.beginPath(); ctx.arc(0, 0, rad * 0.3, 0, 7); ctx.fill(); ctx.stroke();
    ctx.restore();
  } else if (w === 'hammer') {
    // an arm on a pivot; it rests folded back over the body, then slams forward
    let a: number; // 0 = pointing forwards, π = folded back
    if (s < 0.12) a = Math.PI * (1 - s / 0.12);
    else if (s < 0.45) a = 0;
    else a = Math.PI * Math.min(1, (s - 0.45) / 0.6);
    const L = 0.95 * r + reach * 0.75 * Math.cos(a / 2) ** 2;
    const hx = Math.cos(a) * L * (a > Math.PI / 2 ? 0.75 : 1), hy = Math.sin(a) * 0.15 * r;
    ctx.fillStyle = '#5c5f6e'; ctx.beginPath(); ctx.arc(0, 0, 0.22 * r, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(3, 0.55 * k) + 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = '#9aa0b5'; ctx.lineWidth = Math.max(3, 0.55 * k) - 0.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(hx, hy); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.5, 0.42 * k);
    ctx.save(); ctx.translate(hx, hy);
    const big = a < 0.3 ? 1.12 : 1;
    ctx.fillStyle = a < 0.3 ? '#ffe08a' : '#c9ccd9';
    rr(ctx, -0.3 * r * big, -0.55 * r * big, 0.6 * r * big, 1.1 * r * big, 0.1 * r); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8eaf2'; ctx.beginPath(); ctx.moveTo(0.3 * r * big, -0.55 * r * big); ctx.lineTo(0.55 * r * big, 0); ctx.lineTo(0.3 * r * big, 0.55 * r * big); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    if (s < 0.25) { ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1, 0.25 * k); ctx.beginPath(); ctx.arc(0, 0, L * 0.85, -0.5, 0.5); ctx.stroke(); }
  } else {
    // crushing claw: two jaws that snap shut
    const held = (b.held ?? 0) > 0 || s < 0.9;
    const open = held ? 0.12 : 0.55 + Math.sin(t * 3) * 0.08;
    ctx.fillStyle = '#9aa0b5'; rr(ctx, front - 0.25 * r, -0.2 * r, 0.5 * r, 0.4 * r, 0.08 * r); ctx.fill(); ctx.stroke();
    for (const sy of [-1, 1]) {
      ctx.save(); ctx.translate(front + 0.15 * r, sy * 0.18 * r); ctx.rotate(sy * open);
      ctx.fillStyle = '#c9ccd9';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(0.6 * r, sy * 0.45 * r, 1.05 * r, sy * 0.05 * r); ctx.lineTo(0.95 * r, -sy * 0.12 * r); ctx.quadraticCurveTo(0.55 * r, sy * 0.12 * r, 0, -sy * 0.12 * r); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }
}

/** A part on its own, for the builder buttons: the part on a plain grey robot, nose up-right. */
export function drawPartIcon(ctx: CanvasRenderingContext2D, kind: keyof Build, id: string, size: number, side: 0 | 1 = 0) {
  ctx.clearRect(0, 0, size, size);
  const base: Build = { drive: 'wheels', weapon: 'flipper', body: 'box', brain: 'aggressive' };
  const build = { ...base, [kind]: id } as Build;
  if (kind === 'drive') build.weapon = 'claw';
  const k = size / 17;
  if (kind === 'brain') {
    // the computer doesn't change the look, so show a small robot and the computer's badge
    drawBot(ctx, { x: 6.2, y: 10.5, heading: -Math.PI / 2, build, side, swing: 9, odo: 0.3 }, k * 0.8, 0.15);
    drawBrainBadge(ctx, id, 11.6 * k, 6.6 * k, 4.6 * k);
    return;
  }
  drawBot(ctx, { x: 8.5, y: 9.3, heading: -Math.PI / 2, build, side, swing: 9, odo: 0.3 }, k, 0.15);
}

/** A round badge for each computer: crossed swords, a shield, a curving arrow round the back, a map pin. */
export function drawBrainBadge(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.5, r * 0.16); ctx.strokeStyle = INK; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const fill = { aggressive: '#ff7a59', conservative: '#7bd389', flanker: '#b39ddb', tactician: '#f2c94c' }[id] ?? '#fff';
  ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.lineWidth = Math.max(1.2, r * 0.12);
  const u = r / 10;
  if (id === 'aggressive') {
    // crossed swords
    for (const s of [1, -1]) {
      ctx.save(); ctx.rotate(s * Math.PI / 4);
      ctx.beginPath(); ctx.rect(-1 * u, -7 * u, 2 * u, 10 * u); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.rect(-3 * u, 3 * u, 6 * u, 1.6 * u); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  } else if (id === 'conservative') {
    // a shield
    ctx.beginPath(); ctx.moveTo(0, -6.5 * u); ctx.lineTo(5.5 * u, -4.5 * u); ctx.quadraticCurveTo(5.5 * u, 3.5 * u, 0, 7 * u); ctx.quadraticCurveTo(-5.5 * u, 3.5 * u, -5.5 * u, -4.5 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -4 * u); ctx.lineTo(0, 4.5 * u); ctx.stroke();
  } else if (id === 'flanker') {
    // a dot (the enemy) and an arrow curling round behind it
    ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, -1.5 * u, 2.2 * u, 0, 7); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.2 * u;
    ctx.beginPath(); ctx.arc(0, -1.5 * u, 5.5 * u, 0.9, Math.PI * 1.85); ctx.stroke();
    const ax = Math.cos(Math.PI * 1.85) * 5.5 * u, ay = -1.5 * u + Math.sin(Math.PI * 1.85) * 5.5 * u;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(ax + 3 * u, ay + 1 * u); ctx.lineTo(ax - 1.5 * u, ay - 2.5 * u); ctx.lineTo(ax - 1 * u, ay + 3 * u); ctx.closePath(); ctx.fill();
  } else {
    // a map pin on a little grid
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, u);
    ctx.beginPath(); ctx.rect(-6 * u, -5 * u, 12 * u, 11 * u); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -5 * u); ctx.lineTo(0, 6 * u); ctx.moveTo(-6 * u, 0.5 * u); ctx.lineTo(6 * u, 0.5 * u); ctx.stroke();
    ctx.fillStyle = '#e5483b'; ctx.lineWidth = Math.max(1.2, 1.2 * u);
    ctx.beginPath(); ctx.arc(2.5 * u, -3.5 * u, 3 * u, Math.PI, 0); ctx.lineTo(2.5 * u, 3 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
