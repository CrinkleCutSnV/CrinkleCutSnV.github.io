// Robot Rumble Melee: drawing the big arena (the plaza, its roads, the walls with their doorways, and the pillars).
import { INK, ZONE_COLOUR, texture } from './draw';
import { MAP_SIZE, PLAZA, WALLS, PILLARS, DOORS, DOOR, WALL } from './map';
import type { Layout, ZoneId } from './sim';

const S = MAP_SIZE, C = S / 2;
const NAME: Record<ZoneId, string> = { steel: 'STEEL', sand: 'SAND', ice: 'ICE', rubble: 'RUBBLE' };

/** Draw the melee map into a canvas `size` px square. `labels` adds the zone names (the little intro map leaves them off). */
export function drawMeleeMap(ctx: CanvasRenderingContext2D, L: Layout, size: number, labels = true) {
  const k = size / S, h = size / 2;
  L.forEach((z, i) => texture(ctx, z, (i % 2) * h, (i >= 2 ? 1 : 0) * h, h, h, k * 1.3));

  // roads: from each corner of the plaza out to the middle of its zone, and through each doorway
  const road = (pts: [number, number][], w: number) => {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(43,45,66,.55)'; ctx.lineWidth = (w + 1.6) * k; line(pts); ctx.stroke();
    ctx.strokeStyle = '#6b6f80'; ctx.lineWidth = w * k; line(pts); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, 0.5 * k); ctx.setLineDash([2.2 * k, 2.2 * k]); line(pts); ctx.stroke(); ctx.setLineDash([]);
  };
  const line = (pts: [number, number][]) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k))); };
  const M = (x: number, y: number, q: number): [number, number] => [q % 2 ? S - x : x, q >= 2 ? S - y : y];
  // each zone has a hub; a road runs from it to its corner of the plaza, and through each doorway to the next hub
  const hub = (q: number) => M(36, 36, q);
  for (let q = 0; q < 4; q++) road([M(C - PLAZA + 2, C - PLAZA + 2, q), hub(q)], 10);
  for (const d of DOORS) {
    const [a, b] = d.axis === 'x' ? (d.y < C ? [0, 1] : [2, 3]) : (d.x < C ? [0, 2] : [1, 3]);
    road(d.axis === 'x' ? [hub(a), [d.x - 14, d.y], [d.x + 14, d.y], hub(b)] : [hub(a), [d.x, d.y - 14], [d.x, d.y + 14], hub(b)], 9);
  }
  for (let q = 0; q < 4; q++) { const [x, y] = hub(q); ctx.fillStyle = '#6b6f80'; ctx.beginPath(); ctx.arc(x * k, y * k, 6.5 * k, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = Math.max(1, 0.5 * k); ctx.beginPath(); ctx.arc(x * k, y * k, 3 * k, 0, 7); ctx.stroke(); }

  // the plaza: neutral paving, with a roundabout in the middle
  const p0 = (C - PLAZA) * k, pw = 2 * PLAZA * k;
  ctx.fillStyle = '#c9c4b8'; ctx.fillRect(p0, p0, pw, pw);
  ctx.strokeStyle = 'rgba(43,45,66,.18)'; ctx.lineWidth = Math.max(1, 0.3 * k);
  for (let v = C - PLAZA; v <= C + PLAZA + 0.1; v += 6) { ctx.beginPath(); ctx.moveTo(v * k, p0); ctx.lineTo(v * k, p0 + pw); ctx.moveTo(p0, v * k); ctx.lineTo(p0 + pw, v * k); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = Math.max(1.5, 0.6 * k); ctx.setLineDash([2 * k, 1.6 * k]);
  ctx.strokeRect(p0 + 1.2 * k, p0 + 1.2 * k, pw - 2.4 * k, pw - 2.4 * k); ctx.setLineDash([]);
  ctx.fillStyle = '#b3ad9f'; ctx.beginPath(); ctx.arc(C * k, C * k, 9 * k, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = Math.max(2, 0.7 * k); ctx.beginPath(); ctx.arc(C * k, C * k, 9 * k, 0, 7); ctx.stroke();
  ctx.fillStyle = 'rgba(43,45,66,.35)'; ctx.font = `900 ${Math.max(8, 3 * k)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (labels) ctx.fillText('PLAZA', C * k, C * k + 0.3 * k);

  // doorways: yellow-and-black thresholds
  for (const d of DOORS) {
    const w = DOOR * k, t = WALL * k + 2;
    ctx.save(); ctx.translate(d.x * k, d.y * k); if (d.axis === 'y') ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.rect(-t / 2, -w / 2, t, w); ctx.clip();
    ctx.fillStyle = '#f2c94c'; ctx.fillRect(-t / 2, -w / 2, t, w);
    ctx.fillStyle = INK; for (let y = -w; y < w; y += 2.4 * k) { ctx.beginPath(); ctx.moveTo(-t, y); ctx.lineTo(t, y + 1.4 * k); ctx.lineTo(t, y + 2.6 * k); ctx.lineTo(-t, y + 1.2 * k); ctx.fill(); }
    ctx.restore();
  }

  // walls: raised blocks with a light top edge and a shadow
  for (const w of WALLS) {
    const x = w.x0 * k, y = w.y0 * k, ww = (w.x1 - w.x0) * k, hh = (w.y1 - w.y0) * k;
    ctx.fillStyle = 'rgba(43,45,66,.35)'; ctx.fillRect(x + 0.8 * k, y + 0.8 * k, ww, hh);
    ctx.fillStyle = '#5c5f6e'; ctx.fillRect(x, y, ww, hh);
    ctx.fillStyle = '#8a8d9c'; ctx.fillRect(x, y, ww, Math.max(1, 0.7 * k)); ctx.fillRect(x, y, Math.max(1, 0.7 * k), hh);
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, 0.35 * k); ctx.strokeRect(x, y, ww, hh);
  }
  // pillars: concrete posts with a hazard band
  for (const p of PILLARS) {
    const x = p.x * k, y = p.y * k, r = p.r * k;
    ctx.fillStyle = 'rgba(43,45,66,.35)'; ctx.beginPath(); ctx.arc(x + 0.8 * k, y + 0.8 * k, r, 0, 7); ctx.fill();
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#b8bbc8'); g.addColorStop(1, '#5c5f6e');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
    ctx.strokeStyle = '#f2c94c'; ctx.lineWidth = Math.max(1.5, 0.8 * k); ctx.beginPath(); ctx.arc(x, y, r * 0.62, 0, 7); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1.2, 0.35 * k); ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
  }

  // the outer wall, hazard striped like the duel arena's
  const wall = 1.6 * k;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.rect(wall, wall, size - 2 * wall, size - 2 * wall); ctx.clip('evenodd');
  ctx.fillStyle = '#f2c94c'; ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = INK;
  for (let x = -size; x < size * 2; x += 4 * k) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 2 * k, 0); ctx.lineTo(x + 2 * k + size, size); ctx.lineTo(x + size, size); ctx.fill(); }
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = Math.max(2, 0.6 * k); ctx.strokeRect(wall, wall, size - 2 * wall, size - 2 * wall);

  if (!labels) return;
  ctx.font = `800 ${Math.max(10, 3.4 * k)}px system-ui, sans-serif`; ctx.textBaseline = 'middle';
  L.forEach((z, i) => {
    const right = i % 2 === 1, bottom = i >= 2;
    const x = right ? size - wall - 2.5 * k : wall + 2.5 * k, y = bottom ? size - wall - 3.5 * k : wall + 3.5 * k;
    ctx.textAlign = right ? 'right' : 'left';
    const tw = ctx.measureText(NAME[z]).width + 3 * k;
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.roundRect(right ? x - tw + 1.5 * k : x - 1.5 * k, y - 2.6 * k, tw, 5.2 * k, 2.6 * k); ctx.fill();
    ctx.fillStyle = ZONE_COLOUR[z].label; ctx.fillText(NAME[z], x, y + 0.2 * k);
  });
}
