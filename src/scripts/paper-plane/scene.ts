// Cartoon office corridor, drawn on canvas. Everything is procedural and
// deterministic per segment, so the corridor repeats forever without storing anything.

import { WORLD } from './physics';

export interface View {
  ctx: CanvasRenderingContext2D;
  w: number; // CSS pixels
  h: number;
  ppm: number; // pixels per metre
  camX: number; // world x at left edge of screen (plane layer)
  groundY: number; // screen y of the floor line (world y = 0)
}

const C = {
  ceiling: '#eef1f5',
  ceilingEdge: '#d5dbe3',
  wall: '#f6e7c8',
  wallStripe: '#efd9ae',
  skirting: '#8b6b4a',
  floor: '#9fb3c8',
  floorDark: '#8aa0b7',
  outline: '#2b2d42',
  door: '#c98d55',
  doorDark: '#a8703f',
  glass: '#bfe3f5',
  sky: '#9ad3f0',
  board: '#c4935f',
  cork: '#e3b97f',
  plantPot: '#e07a5f',
  leaf: '#4caf6e',
  leafDark: '#2e8b57',
  cooler: '#dfe9f3',
  water: '#7cc4f2',
};

/** Small deterministic hash -> [0, 1) */
export function rand(i: number, salt = 0) {
  let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(salt + 1, 0xc2b2ae35);
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

/** Map a world point in a parallax layer (factor f) to screen coordinates. */
function sx(v: View, x: number, f: number) {
  return (x - v.camX * f) * v.ppm;
}
function sy(v: View, y: number) {
  return v.groundY - y * v.ppm;
}

function forSegments(v: View, f: number, segW: number, cb: (i: number, x0: number) => void) {
  const left = v.camX * f - segW;
  const right = v.camX * f + v.w / v.ppm + segW;
  for (let i = Math.floor(left / segW); i <= Math.ceil(right / segW); i++) cb(i, i * segW);
}

/** A sub-view for a layer further from the camera: smaller and with its base higher up the screen. */
function layer(v: View, scale: number, baseLift: number): View {
  return { ...v, ppm: v.ppm * scale, groundY: v.groundY - baseLift * v.ppm };
}

export const WALL_LIFT = 0.35; // the back wall meets the floor this far "behind" the plane's flight line

export function drawBackground(v: View) {
  const { ctx, w } = v;
  const wall = layer(v, 0.9, WALL_LIFT);
  const ceilY = sy(v, WORLD.ceiling);

  // wall
  ctx.fillStyle = C.wall;
  ctx.fillRect(0, ceilY, w, wall.groundY - ceilY);
  ctx.fillStyle = C.wallStripe;
  ctx.fillRect(0, sy(wall, 0.95), w, 0.08 * wall.ppm); // dado rail

  // ceiling band (fills anything above the ceiling too)
  ctx.fillStyle = C.ceiling;
  ctx.fillRect(0, 0, w, ceilY);
  ctx.fillStyle = C.ceilingEdge;
  ctx.fillRect(0, ceilY - 0.06 * v.ppm, w, 0.06 * v.ppm);

  drawWallItems(wall);
  drawFloor(v, wall);
  drawFloorItems(layer(v, 0.95, 0.18));
  drawCeilingLights(v);
}

// --- wall layer: doors, windows, notice boards (parallax 0.8, it's further away) ---
const WALL_F = 0.8;
const WALL_SEG = 3.2;

function drawWallItems(v: View) {
  const { ctx, ppm } = v;
  forSegments(v, WALL_F, WALL_SEG, (i, x0) => {
    const r = rand(i, 1);
    const kind = i < 0 ? 'picture' : r < 0.36 ? 'door' : r < 0.68 ? 'window' : r < 0.9 ? 'board' : 'clock';
    const cx = x0 + WALL_SEG / 2 + (rand(i, 2) - 0.5) * 0.6;
    const X = (x: number) => sx(v, x, WALL_F);
    const Y = (y: number) => sy(v, y);
    ctx.lineWidth = Math.max(1.5, ppm * 0.018);
    ctx.strokeStyle = C.outline;

    if (kind === 'door') {
      const dw = 0.95, dh = 2.15;
      rr(ctx, X(cx - dw / 2 - 0.06), Y(dh + 0.06), (dw + 0.12) * ppm, (dh + 0.06) * ppm, 3);
      ctx.fillStyle = C.doorDark; ctx.fill(); ctx.stroke();
      rr(ctx, X(cx - dw / 2), Y(dh), dw * ppm, dh * ppm, 2);
      ctx.fillStyle = C.door; ctx.fill(); ctx.stroke();
      // glass panel
      rr(ctx, X(cx - 0.12), Y(1.85), 0.24 * ppm, 0.55 * ppm, 2);
      ctx.fillStyle = C.glass; ctx.fill(); ctx.stroke();
      // handle
      ctx.beginPath(); ctx.arc(X(cx + dw / 2 - 0.12), Y(1.0), 0.04 * ppm, 0, Math.PI * 2);
      ctx.fillStyle = '#f2c94c'; ctx.fill(); ctx.stroke();
      // sign
      const labels = ['Meeting room', 'Stationery', 'Kitchen', 'Post room', 'Boardroom', 'Archive', 'IT', 'Quiet room'];
      const label = labels[Math.floor(rand(i, 3) * labels.length)];
      rr(ctx, X(cx - 0.32), Y(2.45), 0.64 * ppm, 0.2 * ppm, 3);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.outline;
      ctx.font = `600 ${Math.max(8, 0.085 * ppm)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, X(cx), Y(2.35));
    } else if (kind === 'window') {
      const ww = 1.7, wh = 1.15, wy = 1.25;
      ctx.save();
      rr(ctx, X(cx - ww / 2), Y(wy + wh), ww * ppm, wh * ppm, 4);
      ctx.clip();
      // sky + distant city skyline, much slower parallax so it feels far away
      ctx.fillStyle = C.sky; ctx.fillRect(X(cx - ww / 2), Y(wy + wh), ww * ppm, wh * ppm);
      ctx.fillStyle = '#ffffff';
      const cloudX = X(cx) - (v.camX * 0.15 % 3) * ppm * 0.4;
      ctx.beginPath(); ctx.ellipse(cloudX, Y(wy + wh - 0.25), 0.25 * ppm, 0.08 * ppm, 0, 0, Math.PI * 2); ctx.fill();
      const skyF = 0.3;
      for (let k = -4; k <= 4; k++) {
        const bx = cx + k * 0.42 - ((v.camX * (WALL_F - skyF)) % 0.42);
        const bh = 0.25 + rand(Math.floor(k + v.camX * (WALL_F - skyF) / 0.42), 7) * 0.55;
        ctx.fillStyle = k % 2 ? '#7f9bb5' : '#6d87a1';
        ctx.fillRect(X(bx), Y(wy + bh), 0.36 * ppm, bh * ppm);
      }
      ctx.restore();
      rr(ctx, X(cx - ww / 2), Y(wy + wh), ww * ppm, wh * ppm, 4);
      ctx.lineWidth = Math.max(2, ppm * 0.03); ctx.strokeStyle = '#ffffff'; ctx.stroke();
      ctx.lineWidth = Math.max(1.5, ppm * 0.018); ctx.strokeStyle = C.outline; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(cx), Y(wy + wh)); ctx.lineTo(X(cx), Y(wy)); ctx.stroke();
      // sill
      rr(ctx, X(cx - ww / 2 - 0.08), Y(wy), (ww + 0.16) * ppm, 0.07 * ppm, 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    } else if (kind === 'board') {
      const bw = 1.3, bh = 0.85, by = 1.25;
      rr(ctx, X(cx - bw / 2), Y(by + bh), bw * ppm, bh * ppm, 4);
      ctx.fillStyle = C.board; ctx.fill(); ctx.stroke();
      rr(ctx, X(cx - bw / 2 + 0.05), Y(by + bh - 0.05), (bw - 0.1) * ppm, (bh - 0.1) * ppm, 2);
      ctx.fillStyle = C.cork; ctx.fill();
      const notes = ['#ffffff', '#fff3a3', '#ffd1dc', '#c8f2d4', '#cfe3ff'];
      for (let n = 0; n < 5; n++) {
        const nx = cx - bw / 2 + 0.12 + rand(i * 7 + n, 4) * (bw - 0.45);
        const ny = by + 0.12 + rand(i * 7 + n, 5) * (bh - 0.42);
        ctx.save();
        ctx.translate(X(nx + 0.13), Y(ny + 0.15));
        ctx.rotate((rand(i * 7 + n, 6) - 0.5) * 0.3);
        ctx.fillStyle = notes[n];
        ctx.fillRect(-0.13 * ppm, -0.15 * ppm, 0.26 * ppm, 0.3 * ppm);
        ctx.strokeStyle = 'rgba(43,45,66,0.35)'; ctx.lineWidth = 1;
        for (let l = 0; l < 3; l++) { ctx.beginPath(); ctx.moveTo(-0.09 * ppm, (-0.07 + l * 0.06) * ppm); ctx.lineTo(0.09 * ppm, (-0.07 + l * 0.06) * ppm); ctx.stroke(); }
        ctx.fillStyle = '#e63946'; ctx.beginPath(); ctx.arc(0, -0.12 * ppm, 0.018 * ppm + 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = C.outline; ctx.lineWidth = Math.max(1.5, ppm * 0.018);
    } else if (kind === 'clock') {
      ctx.beginPath(); ctx.arc(X(cx), Y(2.3), 0.22 * ppm, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(X(cx), Y(2.3)); ctx.lineTo(X(cx), Y(2.45));
      ctx.moveTo(X(cx), Y(2.3)); ctx.lineTo(X(cx + 0.1), Y(2.3)); ctx.stroke();
      // bonus window under the clock so the wall isn't bare
      rr(ctx, X(cx - 0.5), Y(1.7), 1.0 * ppm, 0.6 * ppm, 4);
      ctx.fillStyle = '#d9ecf7'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.outline;
      ctx.font = `700 ${Math.max(8, 0.1 * ppm)}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Keep calm', X(cx), Y(1.5));
    } else {
      // framed picture behind the start desk
      rr(ctx, X(cx - 0.4), Y(2.2), 0.8 * ppm, 0.55 * ppm, 3);
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7cc4a0';
      ctx.beginPath(); ctx.moveTo(X(cx - 0.33), Y(1.72)); ctx.lineTo(X(cx - 0.1), Y(2.0)); ctx.lineTo(X(cx + 0.05), Y(1.85)); ctx.lineTo(X(cx + 0.18), Y(2.05)); ctx.lineTo(X(cx + 0.33), Y(1.72)); ctx.fill();
      ctx.fillStyle = '#f2c94c'; ctx.beginPath(); ctx.arc(X(cx + 0.2), Y(2.08), 0.05 * ppm, 0, Math.PI * 2); ctx.fill();
    }
  });
}

// --- ceiling lights (parallax 0.85) ---
function drawCeilingLights(v: View) {
  const { ctx, ppm } = v;
  const f = 0.85;
  forSegments(v, f, 3.6, (i, x0) => {
    const cx = x0 + 1.8;
    const X = sx(v, cx, f);
    const y = sy(v, WORLD.ceiling);
    // soft glow cone
    const g = ctx.createLinearGradient(0, y, 0, y + 1.6 * ppm);
    g.addColorStop(0, 'rgba(255, 249, 214, 0.55)');
    g.addColorStop(1, 'rgba(255, 249, 214, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(X - 0.35 * ppm, y); ctx.lineTo(X + 0.35 * ppm, y);
    ctx.lineTo(X + 0.9 * ppm, y + 1.6 * ppm); ctx.lineTo(X - 0.9 * ppm, y + 1.6 * ppm);
    ctx.fill();
    rr(ctx, X - 0.4 * ppm, y - 0.02 * ppm, 0.8 * ppm, 0.09 * ppm, 4);
    ctx.fillStyle = '#fffbe0'; ctx.fill();
    ctx.lineWidth = Math.max(1.5, ppm * 0.018); ctx.strokeStyle = C.outline; ctx.stroke();
  });
}

// --- floor, skirting, distance markers (plane layer, parallax 1) ---
function drawFloor(v: View, wall: View) {
  const { ctx, w, h, ppm } = v;
  // skirting
  ctx.fillStyle = C.skirting;
  ctx.fillRect(0, sy(wall, 0.13), w, 0.13 * wall.ppm);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, sy(wall, 0.13), w, 0.02 * wall.ppm);
  // floor band (the carpet, seen at a shallow angle) from the wall base to the bottom of the screen
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, wall.groundY, w, h - wall.groundY);
  // carpet tiles, slanted for a bit of fake perspective
  ctx.strokeStyle = C.floorDark;
  ctx.lineWidth = 1;
  const tile = 1.0;
  const start = Math.floor(v.camX / tile) - 1;
  for (let k = start; k < start + w / ppm / tile + 3; k++) {
    const x = (k * tile - v.camX) * ppm;
    ctx.beginPath(); ctx.moveTo(x + 0.2 * ppm, wall.groundY); ctx.lineTo(x - 0.35 * ppm, h); ctx.stroke();
  }
  ctx.beginPath(); ctx.moveTo(0, v.groundY + 0.3 * ppm); ctx.lineTo(w, v.groundY + 0.3 * ppm); ctx.stroke();

  // distance markers every 5 m
  const first = Math.max(0, Math.floor(v.camX / 5) * 5);
  for (let m = first; m < v.camX + w / ppm + 5; m += 5) {
    const x = (m - v.camX) * ppm;
    ctx.fillStyle = m % 25 === 0 ? '#f2c94c' : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x + 0.1 * ppm, v.groundY - 0.3 * ppm); ctx.lineTo(x + 0.16 * ppm, v.groundY - 0.3 * ppm);
    ctx.lineTo(x - 0.17 * ppm, v.groundY + 0.5 * ppm); ctx.lineTo(x - 0.23 * ppm, v.groundY + 0.5 * ppm);
    ctx.closePath(); ctx.fill();
    const label = m === 0 ? 'START' : `${m} m`;
    ctx.font = `800 ${Math.max(10, 0.14 * ppm)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(label).width + 0.12 * ppm;
    rr(ctx, x - 0.12 * ppm - tw / 2, v.groundY + 0.28 * ppm, tw, 0.2 * ppm, 4);
    ctx.fillStyle = 'rgba(43,45,66,0.75)'; ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x - 0.12 * ppm, v.groundY + 0.385 * ppm);
  }
}

// --- plants and water coolers against the wall (parallax 0.9) ---
function drawFloorItems(v: View) {
  const { ctx, ppm } = v;
  const f = 0.9;
  forSegments(v, f, 4.3, (i, x0) => {
    if (i < 1) return; // keep the desk area tidy
    const r = rand(i, 11);
    if (r < 0.25) return;
    const cx = x0 + 0.6 + rand(i, 12) * 3.0;
    const X = (x: number) => sx(v, x, f);
    const Y = (y: number) => sy(v, y);
    ctx.lineWidth = Math.max(1.5, ppm * 0.018);
    ctx.strokeStyle = C.outline;
    if (r < 0.7) {
      // potted plant
      const tall = 0.6 + rand(i, 13) * 0.6;
      for (let l = 0; l < 7; l++) {
        const a = -Math.PI / 2 + (l - 3) * 0.33;
        const len = tall * (0.7 + 0.3 * Math.cos((l - 3) * 0.5));
        ctx.save();
        ctx.translate(X(cx), Y(0.38));
        ctx.rotate(a + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, -len * ppm * 0.5, 0.08 * ppm, len * ppm * 0.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = l % 2 ? C.leaf : C.leafDark; ctx.fill(); ctx.stroke();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.moveTo(X(cx - 0.22), Y(0.42)); ctx.lineTo(X(cx + 0.22), Y(0.42));
      ctx.lineTo(X(cx + 0.16), Y(0)); ctx.lineTo(X(cx - 0.16), Y(0)); ctx.closePath();
      ctx.fillStyle = C.plantPot; ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(X(cx - 0.22), Y(0.42), 0.44 * ppm, 0.05 * ppm);
    } else {
      // water cooler
      rr(ctx, X(cx - 0.18), Y(0.95), 0.36 * ppm, 0.95 * ppm, 4);
      ctx.fillStyle = C.cooler; ctx.fill(); ctx.stroke();
      rr(ctx, X(cx - 0.15), Y(1.45), 0.3 * ppm, 0.5 * ppm, 10);
      ctx.fillStyle = C.water; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(X(cx - 0.1), Y(1.38), 0.04 * ppm, 0.3 * ppm);
      rr(ctx, X(cx - 0.06), Y(0.72), 0.12 * ppm, 0.06 * ppm, 2);
      ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
      // paper cup
      ctx.beginPath();
      ctx.moveTo(X(cx - 0.05), Y(0.62)); ctx.lineTo(X(cx + 0.05), Y(0.62));
      ctx.lineTo(X(cx + 0.035), Y(0.52)); ctx.lineTo(X(cx - 0.035), Y(0.52)); ctx.closePath();
      ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
    }
  });
}

// --- the start desk (plane layer) ---
export function drawDesk(v: View) {
  const { ctx, ppm } = v;
  const X = (x: number) => sx(v, x, 1);
  const Y = (y: number) => sy(v, y);
  const top = WORLD.deskTop;
  ctx.lineWidth = Math.max(1.5, ppm * 0.02);
  ctx.strokeStyle = C.outline;

  // chair (behind the desk, to the left)
  rr(ctx, X(-2.25), Y(1.25), 0.5 * ppm, 0.62 * ppm, 10);
  ctx.fillStyle = '#3d5a80'; ctx.fill(); ctx.stroke();
  rr(ctx, X(-2.3), Y(0.6), 0.65 * ppm, 0.12 * ppm, 6);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#555';
  ctx.fillRect(X(-2.0) - 0.025 * ppm, Y(0.48), 0.05 * ppm, 0.36 * ppm);
  ctx.beginPath(); ctx.moveTo(X(-2.25), Y(0.03)); ctx.lineTo(X(-1.75), Y(0.03)); ctx.lineWidth = 0.05 * ppm; ctx.strokeStyle = '#555'; ctx.stroke();
  ctx.lineWidth = Math.max(1.5, ppm * 0.02); ctx.strokeStyle = C.outline;

  // desk legs + drawers
  rr(ctx, X(-1.55), Y(top), 0.07 * ppm, top * ppm, 2);
  ctx.fillStyle = '#a0704a'; ctx.fill(); ctx.stroke();
  rr(ctx, X(-0.5), Y(top - 0.02), 0.45 * ppm, (top - 0.02) * ppm, 3);
  ctx.fillStyle = '#b07d52'; ctx.fill(); ctx.stroke();
  for (let d = 0; d < 3; d++) {
    const dy = top - 0.08 - d * 0.23;
    rr(ctx, X(-0.46), Y(dy), 0.37 * ppm, 0.19 * ppm, 2);
    ctx.fillStyle = '#c38f61'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(X(-0.33), Y(dy - 0.09)); ctx.lineTo(X(-0.22), Y(dy - 0.09)); ctx.stroke();
  }
  // desk top
  rr(ctx, X(WORLD.deskLeft), Y(top + 0.05), -WORLD.deskLeft * ppm, 0.07 * ppm, 3);
  ctx.fillStyle = '#c98d55'; ctx.fill(); ctx.stroke();

  // monitor
  rr(ctx, X(-1.3), Y(top + 0.62), 0.62 * ppm, 0.42 * ppm, 5);
  ctx.fillStyle = '#2b2d42'; ctx.fill(); ctx.stroke();
  rr(ctx, X(-1.26), Y(top + 0.58), 0.54 * ppm, 0.34 * ppm, 3);
  ctx.fillStyle = '#48cae4'; ctx.fill();
  // spreadsheet-y lines on screen
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1;
  for (let l = 0; l < 4; l++) { ctx.beginPath(); ctx.moveTo(X(-1.2), Y(top + 0.5 - l * 0.07)); ctx.lineTo(X(-0.78 - (l % 2) * 0.1), Y(top + 0.5 - l * 0.07)); ctx.stroke(); }
  ctx.strokeStyle = C.outline; ctx.lineWidth = Math.max(1.5, ppm * 0.02);
  ctx.fillStyle = '#2b2d42';
  ctx.fillRect(X(-1.02), Y(top + 0.2), 0.06 * ppm, 0.15 * ppm);
  rr(ctx, X(-1.15), Y(top + 0.07), 0.32 * ppm, 0.03 * ppm, 2); ctx.fill();
  // keyboard
  rr(ctx, X(-1.25), Y(top + 0.08), 0.42 * ppm, 0.03 * ppm, 2);
  ctx.fillStyle = '#e0e0e0'; ctx.fill(); ctx.stroke();

  // paper stack
  rr(ctx, X(-0.68), Y(top + 0.1), 0.24 * ppm, 0.05 * ppm, 1);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();

  // mug
  const mx = -0.12;
  rr(ctx, X(mx - 0.06), Y(top + 0.17), 0.12 * ppm, 0.12 * ppm, 3);
  ctx.fillStyle = '#e63946'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.arc(X(mx + 0.07), Y(top + 0.11), 0.035 * ppm, -Math.PI / 2, Math.PI / 2); ctx.stroke();
  // steam
  ctx.strokeStyle = 'rgba(43,45,66,0.3)'; ctx.lineWidth = Math.max(1, ppm * 0.012);
  for (let s = 0; s < 2; s++) {
    ctx.beginPath();
    ctx.moveTo(X(mx - 0.02 + s * 0.04), Y(top + 0.2));
    ctx.quadraticCurveTo(X(mx - 0.05 + s * 0.04), Y(top + 0.26), X(mx - 0.02 + s * 0.04), Y(top + 0.32));
    ctx.stroke();
  }
}

/** Paper plane, side view. (x, y) = world centre, pitch in radians. */
export function drawPlane(v: View, x: number, y: number, pitch: number, scale = 1.5) {
  const { ctx, ppm } = v;
  const L = 0.44 * ppm * scale;
  ctx.save();
  ctx.translate(sx(v, x, 1), sy(v, y));
  ctx.rotate(-pitch);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.5, L * 0.035);
  ctx.strokeStyle = C.outline;
  // shadow-ish keel (the folded body, underneath)
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.lineTo(-L * 0.45, -L * 0.02);
  ctx.lineTo(-L * 0.38, L * 0.13);
  ctx.closePath();
  ctx.fillStyle = '#dfe6ee'; ctx.fill(); ctx.stroke();
  // near wing
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.lineTo(-L * 0.5, -L * 0.2);
  ctx.lineTo(-L * 0.42, -L * 0.02);
  ctx.closePath();
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.stroke();
  // fold line
  ctx.beginPath();
  ctx.moveTo(L * 0.45, -L * 0.005);
  ctx.lineTo(-L * 0.45, -L * 0.09);
  ctx.lineWidth = Math.max(1, L * 0.018);
  ctx.strokeStyle = 'rgba(43,45,66,0.45)';
  ctx.stroke();
  ctx.restore();
}

/** Drop shadow on the floor under the plane. */
export function drawShadow(v: View, x: number, y: number) {
  const { ctx, ppm } = v;
  const k = Math.max(0.15, 1 - y / 3.5);
  ctx.fillStyle = `rgba(43,45,66,${0.18 * k})`;
  ctx.beginPath();
  ctx.ellipse(sx(v, x, 1), v.groundY + 0.02 * ppm, 0.22 * ppm * (0.6 + 0.4 * k), 0.035 * ppm, 0, 0, Math.PI * 2);
  ctx.fill();
}
