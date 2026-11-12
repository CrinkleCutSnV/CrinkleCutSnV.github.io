// Tea Dunk: the kitchen, the mug, the biscuit and the dunkers (faces reused from Split the G).
import { drawArm, drawBody, drawFace, drawHand, drawPortrait, roundRect, type Pose } from '../split-the-g/scene';
import type { Character, Expression } from '../split-the-g/physics';
import { RAISE_CLEAR, biscuitFor, warningOf, type Biscuit, type Dunk } from './physics';

type Ctx = CanvasRenderingContext2D;
const INK = '#2b2d42';
const FONT = 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';

export { drawPortrait, drawBody, drawFace, drawArm, drawHand };
export type { Pose };

export interface TeaView {
  w: number;
  h: number;
  tableY: number;
  mugX: number;
  mugR: number;
  mugH: number;
  mugY: number; // bottom of the mug (on the table)
  teaY: number; // tea surface
  charX: number;
  charY: number;
  charR: number;
  /** pixel length of a "standard" biscuit (id length 1) */
  unit: number;
}

export function layout(w: number, h: number): TeaView {
  const tableY = h * 0.80;
  const mugR = Math.min(w, h) * 0.128;
  const mugH = mugR * 1.58;
  const mugX = w * 0.60;
  const mugY = tableY + mugR * 0.06;
  const teaY = mugY - mugH * 0.90;
  const charR = Math.min(w, h) * 0.145;
  return {
    w, h, tableY, mugX, mugR, mugH, mugY, teaY,
    charX: w * 0.26,
    charY: h * 0.34,
    charR,
    unit: mugR * 1.32,
  };
}

export function biscuitLen(v: TeaView, b: Biscuit) {
  return v.unit * b.length;
}

/** How much of the biscuit goes under the tea at full depth (the rest stays in the hand). */
export const DIP = 0.40;

/** Top-centre of the biscuit (where the hand pinches it) and the tip. */
export function biscuitPose(v: TeaView, d: Dunk) {
  const len = biscuitLen(v, d.biscuit);
  const tipY = d.depth >= 0 ? v.teaY + d.depth * len * DIP : v.teaY + d.depth * len;
  const topY = tipY - len;
  const topX = v.mugX;
  return { topX, topY, tipY, len, wid: v.unit * d.biscuit.width * 0.72 };
}

/** Clip so the biscuit can disappear into the tea, but never poke through the mug or the table. */
export function clipToMug(ctx: Ctx, v: TeaView) {
  const { mugX, mugR, mugH, mugY } = v;
  const top = mugY - mugH;
  const rim = mugR * 1.02;
  ctx.beginPath();
  ctx.rect(-2, -2, v.w + 4, top + 2);
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  ctx.closePath();
  ctx.clip();
}

// ---- kitchen ---------------------------------------------------------------------------
export function drawKitchen(ctx: Ctx, v: TeaView, t: number) {
  const { w, h, tableY } = v;
  const wall = ctx.createLinearGradient(0, 0, 0, tableY);
  wall.addColorStop(0, '#f3efe4');
  wall.addColorStop(0.7, '#e7dfcf');
  wall.addColorStop(1, '#d9ceb8');
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, w, h);

  // a soft window of daylight on the right
  ctx.save();
  const winX = w * 0.72, winY = h * 0.06, winW = w * 0.22, winH = h * 0.32;
  ctx.fillStyle = '#cfe6ef';
  roundRect(ctx, winX, winY, winW, winH, 8);
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.stroke();
  // sash
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.moveTo(winX, winY + winH / 2);
  ctx.lineTo(winX + winW, winY + winH / 2);
  ctx.stroke();
  // a hint of garden
  ctx.fillStyle = '#8fbf88';
  ctx.beginPath();
  ctx.ellipse(winX + winW * 0.28, winY + winH * 0.72, winW * 0.2, winH * 0.12, 0, 0, Math.PI * 2);
  ctx.ellipse(winX + winW * 0.72, winY + winH * 0.78, winW * 0.22, winH * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f7e39a';
  ctx.beginPath();
  ctx.arc(winX + winW * 0.7, winY + winH * 0.22, winW * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // a little shelf on the left
  const sx = w * 0.05, sy = h * 0.12, sw = w * 0.22;
  ctx.fillStyle = '#b0895e';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  roundRect(ctx, sx, sy, sw, 10, 3);
  ctx.fill(); ctx.stroke();
  drawTeapot(ctx, sx + sw * 0.3, sy, Math.min(40, sw * 0.28));
  drawJar(ctx, sx + sw * 0.72, sy, Math.min(28, sw * 0.2));

  // wallpaper sprigs, very faint
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.strokeStyle = '#5a7a4a';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 18; i++) {
    const x = (i * 97 + 40) % (w * 0.7) + 10;
    const y = (i * 53 + 30) % (tableY * 0.7) + 10;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.moveTo(x, y + 6);
    ctx.quadraticCurveTo(x + 8, y + 16, x, y + 22);
    ctx.stroke();
  }
  ctx.restore();

  // table
  const board = ctx.createLinearGradient(0, tableY, 0, h);
  board.addColorStop(0, '#e8c992');
  board.addColorStop(0.12, '#d2a86a');
  board.addColorStop(1, '#b8864a');
  ctx.fillStyle = board;
  ctx.fillRect(0, tableY, w, h - tableY);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, tableY);
  ctx.lineTo(w, tableY);
  ctx.stroke();
  // wood grain
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#8a5a28';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 6; i++) {
    const y = tableY + 16 + i * 18 + Math.sin(t * 0 + i) * 0;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 3, w, y + 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawTeapot(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#d9ecec';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r * 0.85, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // spout
  ctx.beginPath();
  ctx.moveTo(r * 0.7, -r * 0.25);
  ctx.quadraticCurveTo(r * 1.35, -r * 0.7, r * 1.15, -r * 0.05);
  ctx.stroke();
  // lid + knob
  ctx.beginPath();
  ctx.arc(0, -r * 0.85, r * 0.18, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#2a9d8f';
  ctx.beginPath();
  ctx.arc(0, -r * 1.05, r * 0.1, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // handle
  ctx.beginPath();
  ctx.arc(-r * 0.95, -r * 0.2, r * 0.28, Math.PI * 0.2, Math.PI * 1.6);
  ctx.stroke();
  ctx.restore();
}

function drawJar(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = '#c0392b';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  roundRect(ctx, -r * 0.5, -r * 1.1, r, r * 1.05, 4);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f3efe4';
  roundRect(ctx, -r * 0.42, -r * 1.28, r * 0.84, r * 0.28, 3);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

// ---- mug -------------------------------------------------------------------------------
export function drawMugBack(ctx: Ctx, v: TeaView) {
  const { mugX, mugR, mugH, mugY, teaY } = v;
  const top = mugY - mugH;
  const rim = mugR * 1.02;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  // inside of the mug (back wall)
  ctx.beginPath();
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  ctx.ellipse(mugX, top, rim, mugR * 0.28, 0, 0, Math.PI);
  ctx.closePath();
  const inside = ctx.createLinearGradient(mugX - mugR, top, mugX + mugR, mugY);
  inside.addColorStop(0, '#f6efe3');
  inside.addColorStop(0.5, '#e8d7be');
  inside.addColorStop(1, '#d9c4a4');
  ctx.fillStyle = inside;
  ctx.fill();
  ctx.stroke();

  // tea liquid, clipped to the bowl
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  ctx.closePath();
  ctx.clip();
  const tea = ctx.createLinearGradient(mugX, teaY, mugX, mugY);
  tea.addColorStop(0, '#7a3f14');
  tea.addColorStop(0.45, '#5a2c0c');
  tea.addColorStop(1, '#3a1a06');
  ctx.fillStyle = tea;
  ctx.fillRect(mugX - mugR * 1.2, teaY, mugR * 2.4, mugY - teaY + 8);
  ctx.restore();

  // back half of the rim
  ctx.fillStyle = '#f3eadc';
  ctx.beginPath();
  ctx.ellipse(mugX, top, rim, mugR * 0.28, 0, Math.PI, 0);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function drawTeaSurface(ctx: Ctx, v: TeaView, d: Dunk | null, t: number) {
  const { mugX, mugR, mugY, mugH, teaY } = v;
  const top = mugY - mugH;
  const rim = mugR * 1.02;
  const rip = d && d.depth > 0 ? 1 + Math.sin(t * 14) * 0.04 * Math.min(1, d.depth * 2) : 1;
  const splash = d && d.phase === 'breaking' ? Math.min(1, d.breakT * 8) : 0;

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(mugX, teaY, mugR * 0.86 * rip, mugR * 0.22 * rip, 0, 0, Math.PI * 2);
  const surf = ctx.createRadialGradient(mugX - mugR * 0.2, teaY - mugR * 0.05, 2, mugX, teaY, mugR);
  surf.addColorStop(0, '#c17a3a');
  surf.addColorStop(0.45, '#8a4a18');
  surf.addColorStop(1, '#5a2c0c');
  ctx.fillStyle = surf;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
  // highlight
  ctx.strokeStyle = 'rgba(255,230,180,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(mugX - mugR * 0.15, teaY - mugR * 0.04, mugR * 0.4, mugR * 0.08, -0.3, 0, Math.PI * 1.1);
  ctx.stroke();

  // ripples when dunking or after a plop
  const rings = splash > 0 ? 3 : (d && d.depth > 0 ? 2 : 0);
  for (let i = 0; i < rings; i++) {
    const k = splash > 0 ? (d!.breakT * 1.8 + i * 0.22) % 1 : (t * 0.7 + i * 0.4) % 1;
    ctx.strokeStyle = `rgba(43,45,66,${0.35 * (1 - k)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(mugX, teaY, mugR * 0.2 + k * mugR * 0.65, mugR * 0.06 + k * mugR * 0.16, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawMugFront(ctx: Ctx, v: TeaView) {
  const { mugX, mugR, mugH, mugY } = v;
  const top = mugY - mugH;
  const rim = mugR * 1.02;
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // handle on the right
  ctx.beginPath();
  ctx.arc(mugX + rim + mugR * 0.28, top + mugH * 0.42, mugR * 0.42, -Math.PI * 0.7, Math.PI * 0.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(mugX + rim + mugR * 0.28, top + mugH * 0.42, mugR * 0.24, -Math.PI * 0.7, Math.PI * 0.7);
  ctx.stroke();

  // front wall
  ctx.beginPath();
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  const ceramic = ctx.createLinearGradient(mugX - mugR, top, mugX + mugR, mugY);
  ceramic.addColorStop(0, '#fffaf2');
  ceramic.addColorStop(0.45, '#f3eadc');
  ceramic.addColorStop(1, '#dcc9a8');
  ctx.fillStyle = ceramic;
  ctx.fill();
  ctx.stroke();

  // a simple teal stripe (no logo)
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  ctx.closePath();
  ctx.clip();
  ctx.fillStyle = '#2a9d8f';
  ctx.fillRect(mugX - mugR * 1.2, top + mugH * 0.38, mugR * 2.4, mugH * 0.14);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(mugX - rim, top);
  ctx.bezierCurveTo(mugX - mugR * 1.08, top + mugH * 0.45, mugX - mugR * 0.95, mugY, mugX, mugY);
  ctx.bezierCurveTo(mugX + mugR * 0.95, mugY, mugX + mugR * 1.08, top + mugH * 0.45, mugX + rim, top);
  ctx.stroke();

  // front half of the rim
  ctx.fillStyle = '#fffaf2';
  ctx.beginPath();
  ctx.ellipse(mugX, top, rim, mugR * 0.28, 0, 0, Math.PI);
  ctx.fill();
  ctx.stroke();
  // rim lip highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(mugX, top, rim * 0.86, mugR * 0.16, 0, Math.PI * 1.1, Math.PI * 1.85);
  ctx.stroke();
  ctx.restore();
}

export function drawSteam(ctx: Ctx, v: TeaView, t: number, extra = 0) {
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const x = v.mugX + (i - 1) * v.mugR * 0.28;
    const y0 = v.teaY - v.mugR * 0.35;
    const ph = t * (0.7 + i * 0.15) + i * 1.7 + extra;
    ctx.globalAlpha = 0.45 + 0.2 * Math.sin(ph);
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(x + Math.sin(ph) * 10, y0 - 22, x - Math.sin(ph + 1) * 12, y0 - 44, x + Math.sin(ph * 0.8) * 6, y0 - 64 - i * 6);
    ctx.stroke();
  }
  ctx.restore();
}

// ---- biscuits --------------------------------------------------------------------------
/** Draw a biscuit stood on end, origin at the top centre, +y towards the tip. */
export function drawBiscuitShape(ctx: Ctx, b: Biscuit, len: number, wid: number, sag = 0, brokenFrom?: number) {
  const tip = brokenFrom ?? len;
  const edge = (y: number) => {
    // half-width at y, with a rounded tip and a slightly narrower top (the pinch)
    const u = Math.min(1, Math.max(0, y / len));
    const profile = Math.sin(Math.PI * Math.min(1, u / 0.12)) * 0.55 + 0.45; // swell from the pinch
    const tipTaper = u > 0.86 ? Math.cos(((u - 0.86) / 0.14) * (Math.PI / 2)) : 1;
    const topTaper = u < 0.08 ? 0.65 + 0.35 * (u / 0.08) : 1;
    return (wid / 2) * profile * tipTaper * topTaper;
  };
  const sagX = (y: number) => sag * wid * (y / len) * (y / len);

  ctx.beginPath();
  ctx.moveTo(sagX(0), 0);
  for (let i = 1; i <= 16; i++) {
    const y = (i / 16) * tip;
    ctx.lineTo(sagX(y) + edge(y), y);
  }
  for (let i = 16; i >= 0; i--) {
    const y = (i / 16) * tip;
    ctx.lineTo(sagX(y) - edge(y), y);
  }
  ctx.closePath();
}

function fillBiscuit(ctx: Ctx, b: Biscuit, len: number, wid: number, sag: number, end: number) {
  drawBiscuitShape(ctx, b, len, wid, sag, end);
  const g = ctx.createLinearGradient(-wid / 2, 0, wid / 2, len);
  g.addColorStop(0, lighter(b.dough, 18));
  g.addColorStop(0.5, b.dough);
  g.addColorStop(1, b.edge);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, wid * 0.045);
  ctx.stroke();
}

function lighter(hex: string, n: number) {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((c >> 16) & 255) + n);
  const g = Math.min(255, ((c >> 8) & 255) + n);
  const b = Math.min(255, (c & 255) + n);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
function darker(hex: string, n: number) {
  return lighter(hex, -n);
}

function biscuitDecor(ctx: Ctx, b: Biscuit, len: number, wid: number, sag: number, end: number) {
  ctx.save();
  drawBiscuitShape(ctx, b, len, wid, sag, end);
  ctx.clip();
  const sw = (y: number) => sag * wid * (y / len) * (y / len);
  if (b.id === 'digestive' || b.id === 'chocolate-digestive') {
    // fork pricks
    ctx.fillStyle = 'rgba(80,40,10,0.28)';
    const rows = 5, cols = 5;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const y = len * (0.18 + r * 0.15);
      if (y > end) continue;
      const x = sw(y) + (c - (cols - 1) / 2) * wid * 0.14;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1.2, wid * 0.025), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (b.id === 'chocolate-digestive') {
    // a chocolate face on the "front" — a rounded slab
    ctx.fillStyle = '#4a2a14';
    ctx.strokeStyle = '#2a160a';
    ctx.lineWidth = 1.5;
    const y0 = len * 0.08, y1 = Math.min(end, len * 0.96);
    ctx.beginPath();
    ctx.moveTo(sw(y0) - wid * 0.32, y0);
    ctx.lineTo(sw(y1) - wid * 0.32, y1);
    ctx.lineTo(sw(y1) + wid * 0.32, y1);
    ctx.lineTo(sw(y0) + wid * 0.32, y0);
    ctx.closePath();
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  }
  if (b.id === 'custard-cream') {
    // cream filling down the middle, and a faint fancy stamp
    ctx.fillStyle = '#f7e7b0';
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.moveTo(sw(len * 0.08) - wid * 0.07, len * 0.08);
    ctx.lineTo(sw(Math.min(end, len * 0.95)) - wid * 0.08, Math.min(end, len * 0.95));
    ctx.lineTo(sw(Math.min(end, len * 0.95)) + wid * 0.08, Math.min(end, len * 0.95));
    ctx.lineTo(sw(len * 0.08) + wid * 0.07, len * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#b0893a';
    ctx.lineWidth = 1.5;
    const cy = len * 0.48;
    if (cy < end) {
      ctx.beginPath();
      ctx.ellipse(sw(cy), cy, wid * 0.18, len * 0.12, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  if (b.id === 'ginger-nut') {
    ctx.strokeStyle = 'rgba(80,20,0,0.35)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 7; i++) {
      const y = len * (0.15 + i * 0.11);
      if (y > end) continue;
      ctx.beginPath();
      ctx.moveTo(sw(y) - wid * 0.22, y);
      ctx.quadraticCurveTo(sw(y) + wid * 0.05, y + 4, sw(y) + wid * 0.2, y - 2);
      ctx.stroke();
    }
  }
  if (b.id === 'hobnob') {
    // oat flakes
    ctx.strokeStyle = 'rgba(70,35,5,0.4)';
    ctx.fillStyle = 'rgba(210,160,80,0.45)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 16; i++) {
      const y = len * (0.12 + (i * 0.11) % 0.8);
      if (y > end) continue;
      const x = sw(y) + ((i % 5) - 2) * wid * 0.12;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(i * 0.7);
      ctx.beginPath();
      ctx.ellipse(0, 0, wid * 0.08, wid * 0.03, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
  if (b.id === 'rich-tea') {
    // a smooth, almost plain face with a faint rim ring
    ctx.strokeStyle = 'rgba(140,90,30,0.25)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(sw(len * 0.5), Math.min(end * 0.7, len * 0.5), wid * 0.28, len * 0.28, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function wetStain(ctx: Ctx, b: Biscuit, len: number, wid: number, sag: number, end: number, peakDepth: number, soak: number) {
  if (peakDepth <= 0 || soak <= 0) return;
  const wetFrom = Math.max(0, len - peakDepth * len * DIP - 2);
  if (wetFrom >= end) return;
  ctx.save();
  drawBiscuitShape(ctx, b, len, wid, sag, end);
  ctx.clip();
  const dark = ctx.createLinearGradient(0, wetFrom, 0, end);
  const a = Math.min(0.82, 0.28 + soak * 0.7);
  dark.addColorStop(0, `rgba(80,40,10,0)`);
  dark.addColorStop(0.08, `rgba(70,32,8,${a * 0.7})`);
  dark.addColorStop(1, `rgba(50,22,5,${a})`);
  ctx.fillStyle = dark;
  ctx.fillRect(-wid, wetFrom - 4, wid * 2, end - wetFrom + 12);
  ctx.restore();
}

function drawCrack(ctx: Ctx, len: number, wid: number, sag: number, soak: number, y: number) {
  const wob = (soak - 0.66) / 0.34;
  const x = sag * wid * (y / len) * (y / len);
  ctx.save();
  ctx.strokeStyle = '#3a1a06';
  ctx.lineWidth = 1.6 + wob * 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - wid * (0.28 + wob * 0.1), y - 2);
  ctx.lineTo(x - wid * 0.05, y + 3);
  ctx.lineTo(x + wid * 0.12, y - 1);
  ctx.lineTo(x + wid * (0.3 + wob * 0.08), y + 4);
  ctx.stroke();
  ctx.restore();
}

export function drawBiscuit(ctx: Ctx, v: TeaView, d: Dunk, t: number) {
  const pose = biscuitPose(v, d);
  const { topX, topY, len, wid } = pose;
  const soak = d.soak;
  const warn = warningOf(soak);
  const sagAmt = Math.max(0, soak - 0.28) * 1.15;
  const wobble = Math.sin(t * (9 + soak * 12)) * soak * soak * 0.16;
  const jit = d.char.id === 'nigel' ? Math.sin(t * 23) * 0.045 + Math.sin(t * 37) * 0.02 : d.char.id === 'walter' ? Math.sin(t * 3.1) * 0.03 : 0;
  const crackY = len * (0.52 + Math.sin(d.seed) * 0.08);

  ctx.save();
  ctx.translate(topX, topY);
  ctx.rotate(wobble + jit);

  if (d.phase === 'breaking' || d.broken) {
    // the piece still in the hand
    fillBiscuit(ctx, d.biscuit, len, wid, sagAmt * 0.4, crackY);
    biscuitDecor(ctx, d.biscuit, len, wid, sagAmt * 0.4, crackY);
    wetStain(ctx, d.biscuit, len, wid, sagAmt * 0.4, crackY, d.peakDepth, soak);
    ctx.restore();

    // the soggy piece falling into the mug
    const fall = d.fall;
    const fx = topX + Math.sin(d.seed) * 18 * fall + (fall * fall) * 8;
    const dest = v.teaY + v.mugR * 0.15;
    const fy = (topY + crackY) + fall * (dest - (topY + crackY)) + fall * fall * v.mugR * 0.2;
    const rot = fall * (0.8 + (d.seed % 5) * 0.15) * (d.seed % 2 === 0 ? 1 : -1);
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(wobble + rot);
    ctx.translate(0, -crackY);
    fillBiscuit(ctx, d.biscuit, len, wid, sagAmt, len);
    // hide the top of this path by clipping to the broken half — draw a dark soggy chunk
    ctx.beginPath();
    ctx.rect(-wid, crackY - 2, wid * 2, len);
    ctx.clip();
    biscuitDecor(ctx, d.biscuit, len, wid, sagAmt, len);
    wetStain(ctx, d.biscuit, len, wid, sagAmt, len, 1, 1);
    ctx.restore();
    return { topX, topY, len, wid, crackY };
  }

  fillBiscuit(ctx, d.biscuit, len, wid, sagAmt, len);
  biscuitDecor(ctx, d.biscuit, len, wid, sagAmt, len);
  wetStain(ctx, d.biscuit, len, wid, sagAmt, len, d.peakDepth, soak);
  if (warn === 'crack' || warn === 'critical') drawCrack(ctx, len, wid, sagAmt, soak, crackY);
  ctx.restore();
  return { topX, topY, len, wid, crackY };
}

export function drawCrumbsAndDrips(ctx: Ctx, v: TeaView, d: Dunk, t: number) {
  const soak = d.soak;
  const pose = biscuitPose(v, d);
  const warn = warningOf(soak);
  const seed = d.seed || 1;

  if (warn === 'crumbs' || warn === 'crack' || warn === 'critical' || d.broken) {
    const n = d.broken ? 14 : warn === 'critical' ? 9 : warn === 'crack' ? 6 : 5;
    for (let i = 0; i < n; i++) {
      const life = (t * 0.6 + i * 0.37 + seed * 0.01) % 1.2;
      if (life > 1) continue;
      const sx = pose.topX + Math.sin(seed + i * 2.1) * pose.wid * 0.55;
      const sy = Math.min(v.teaY - 4, pose.topY + pose.len * (0.45 + (i % 5) * 0.1));
      const x = sx + Math.sin(seed + i) * 12 * life;
      const y = sy + life * life * 36 + life * 10;
      ctx.fillStyle = d.biscuit.edge;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, 2.4, 1.7, i, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // drips when lifting or at high soak
  if ((d.phase === 'lifting' || d.depth > 0.15) && soak > 0.2 && !d.broken) {
    const n = 2 + (soak > 0.6 ? 2 : 0);
    for (let i = 0; i < n; i++) {
      const life = (t * 1.4 + i * 0.45) % 1;
      const x = pose.topX + Math.sin(i * 2 + seed) * pose.wid * 0.15;
      const y = pose.tipY + life * Math.max(8, v.teaY - pose.tipY + 10) * (d.depth > 0 ? 0.3 : 1);
      if (y > v.teaY - 2 && d.depth > 0) continue;
      ctx.fillStyle = '#6a3a12';
      ctx.beginPath();
      ctx.ellipse(x, y, 2.2, 3.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawSplash(ctx: Ctx, v: TeaView, d: Dunk) {
  if (d.phase !== 'breaking' && !(d.broken && d.breakT < 0.9)) return;
  const t = d.breakT;
  const n = 16;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI - Math.PI / 2 + Math.sin(d.seed + i) * 0.2;
    const speed = 80 + (i % 5) * 30;
    const x = v.mugX + Math.cos(ang) * speed * t;
    const y = v.teaY + Math.sin(ang) * speed * t * 0.5 + 180 * t * t;
    const a = Math.max(0, 1 - t / 0.85);
    ctx.fillStyle = `rgba(90,44,12,${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, 3.5, 5, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  // a little "PLOP!"
  if (t > 0.08 && t < 0.7) {
    ctx.globalAlpha = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.45;
    ctx.fillStyle = INK;
    ctx.font = `900 ${Math.round(v.mugR * 0.42)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.translate(v.mugX + v.mugR * 0.9, v.teaY - v.mugR * 0.8);
    ctx.rotate(-0.15);
    ctx.fillText('PLOP!', 0, 0);
  }
  ctx.restore();
}

// ---- the dunker ------------------------------------------------------------------------
export function expressionFor(d: Dunk | null, intro = false): Expression {
  if (!d || intro) return 'idle';
  if (d.phase === 'breaking' || (d.phase === 'result' && d.broken)) return 'gutted';
  if (d.phase === 'result' && d.score > 0) return d.peakSoak >= 0.82 ? 'chuffed' : 'happy';
  if (d.phase === 'dunking' || d.phase === 'lifting') return d.char.id === 'nigel' || warningOf(d.soak) === 'critical' ? 'nervous' : 'drinking';
  return 'idle';
}

export function drawDunker(ctx: Ctx, v: TeaView, c: Character, d: Dunk | null, t: number, intro = false) {
  const expr = expressionFor(d, intro);
  const bob = Math.sin(t * 2.2) * 2;
  const pose: Pose = {
    x: v.charX,
    y: v.charY + bob,
    R: v.charR,
    expr,
    t,
    tash: 0,
    puff: expr === 'drinking' ? 0.6 : 0,
  };
  // a simple chair back
  ctx.save();
  ctx.fillStyle = '#a06e3a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  roundRect(ctx, v.charX - v.charR * 1.5, v.charY + v.charR * 1.1, v.charR * 3, v.tableY - (v.charY + v.charR * 0.6), 8);
  ctx.fill(); ctx.stroke();
  ctx.restore();

  drawBody(ctx, c, pose, v.tableY + 6);

  const b = d?.biscuit ?? biscuitFor(c);
  let hand = { x: v.mugX, y: v.teaY - biscuitLen(v, b) * (1 + RAISE_CLEAR) };
  if (d) {
    const p = biscuitPose(v, d);
    hand = { x: p.topX, y: p.topY };
  }
  drawArm(ctx, c, pose, hand);
  drawFace(ctx, c, pose);
  return { pose, hand };
}

export function drawHandOnBiscuit(ctx: Ctx, c: Character, hand: { x: number; y: number }, R: number) {
  drawHand(ctx, c, hand, R, -0.4);
}

// ---- small biscuit portrait for the Up next card and the line-up ----------------------
export function drawBiscuitIcon(canvas: HTMLCanvasElement, b: Biscuit) {
  const dpr = Math.min(2, (typeof window !== 'undefined' ? window.devicePixelRatio : 1) || 1);
  const w = canvas.clientWidth || 72, h = canvas.clientHeight || 72;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f3efe4';
  ctx.fillRect(0, 0, w, h);
  const len = h * 0.78;
  const wid = w * 0.55 * b.width / Math.max(b.length, 0.8);
  ctx.save();
  ctx.translate(w / 2, h * 0.1);
  fillBiscuit(ctx, b, len, wid, 0, len);
  biscuitDecor(ctx, b, len, wid, 0, len);
  ctx.restore();
}

/** A complete frame of the tea table. */
export function drawScene(ctx: Ctx, v: TeaView, c: Character, d: Dunk | null, t: number, intro = false) {
  drawKitchen(ctx, v, t);
  const { hand } = drawDunker(ctx, v, c, d, t, intro);
  drawMugBack(ctx, v);
  drawTeaSurface(ctx, v, d, t);
  if (d) {
    ctx.save();
    clipToMug(ctx, v);
    drawBiscuit(ctx, v, d, t);
    drawCrumbsAndDrips(ctx, v, d, t);
    ctx.restore();
  }
  drawMugFront(ctx, v);
  // the front wall would otherwise cover the mouth of the mug: redraw the opening
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(v.mugX, v.mugY - v.mugH, v.mugR * 1.02, v.mugR * 0.28, 0, 0, Math.PI * 2);
  ctx.clip();
  drawTeaSurface(ctx, v, d, t);
  if (d) {
    drawBiscuit(ctx, v, d, t);
    drawCrumbsAndDrips(ctx, v, d, t);
  }
  ctx.restore();
  if (d) drawSplash(ctx, v, d);
  drawSteam(ctx, v, t, d && d.depth > 0 ? 0.4 : 0);
  drawHandOnBiscuit(ctx, c, hand, v.charR);
}
