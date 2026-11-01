// Robot Rumble Melee: the big arena. A neutral crossroads plaza in the middle, four zones walled off from
// each other with doorways between them, and a couple of pillars in each zone for cover. Pure geometry plus a
// little grid pathfinder (no DOM), shared by the game, the headless sim and the tests.
import { BODIES, DT, type Bot, type Layout, type ZoneId } from './sim';

export const MAP_SIZE = 170; // units square: 1.7× the area of the old 130 melee arena, 2.9× the duel's
const S = MAP_SIZE, C = S / 2;
export const PLAZA = 24; // half-width of the central plaza
export const WALL = 3; // wall thickness
export const DOOR = 16; // doorway width
export const DOOR_AT = 30; // each doorway's centre, this far in from the outer wall
export const CAP = 10; // the plaza's wall caps run this far either side of each wall
export const PILLAR_R = 4.5;
const H = WALL / 2;

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export interface Pillar { x: number; y: number; r: number }
const R = (x0: number, y0: number, x1: number, y1: number): Rect => ({ x0, y0, x1, y1 });
const d0 = DOOR_AT - DOOR / 2, d1 = DOOR_AT + DOOR / 2;
/** The walls: the four arms of the cross (each with a doorway), and the caps that face the plaza. */
export const WALLS: Rect[] = [
  // north arm (between the top two zones), south, west, east
  R(C - H, 0, C + H, d0), R(C - H, d1, C + H, C - PLAZA),
  R(C - H, S - d0, C + H, S), R(C - H, C + PLAZA, C + H, S - d1),
  R(0, C - H, d0, C + H), R(d1, C - H, C - PLAZA, C + H),
  R(S - d0, C - H, S, C + H), R(C + PLAZA, C - H, S - d1, C + H),
  // the caps round the plaza
  R(C - CAP, C - PLAZA - H, C + CAP, C - PLAZA + H), R(C - CAP, C + PLAZA - H, C + CAP, C + PLAZA + H),
  R(C - PLAZA - H, C - CAP, C - PLAZA + H, C + CAP), R(C + PLAZA - H, C - CAP, C + PLAZA + H, C + CAP),
];
const mirror = (x: number, y: number, q: number) => ({ x: q % 2 ? S - x : x, y: q >= 2 ? S - y : y });
/** Two pillars per zone (zone order as in the layout: top left, top right, bottom left, bottom right). */
export const PILLARS: Pillar[] = [0, 1, 2, 3].flatMap((q) => [mirror(24, 52, q), mirror(52, 24, q)].map((p) => ({ ...p, r: PILLAR_R })));
const NW = WALLS.length, WF = new Float64Array(WALLS.flatMap((w) => [w.x0, w.y0, w.x1, w.y1]));
const NP = PILLARS.length, PF = new Float64Array(PILLARS.flatMap((p) => [p.x, p.y, p.r]));
/** The doorways (centre, and which way through), for drawing and for the tacticians' ambushes. */
export const DOORS = [
  { x: C, y: DOOR_AT, axis: 'x' as const }, { x: C, y: S - DOOR_AT, axis: 'x' as const },
  { x: DOOR_AT, y: C, axis: 'y' as const }, { x: S - DOOR_AT, y: C, axis: 'y' as const },
];
/** Where robot i of n starts: evenly round a big circle (turned by `spin`), nudged clear of any wall. */
export const START_R = 60;
export function spawn(i: number, n: number, spin: number) {
  const a = spin + (i * 2 * Math.PI) / n;
  return openNear(C + Math.cos(a) * START_R, C + Math.sin(a) * START_R);
}

export const inPlaza = (x: number, y: number) => Math.abs(x - C) < PLAZA && Math.abs(y - C) < PLAZA;
/** The ground under a point: one of the four zones, or the plaza (neutral: medium for every drive). */
export const groundAt = (L: Layout, x: number, y: number): ZoneId => (inPlaza(x, y) ? 'plaza' as ZoneId : L[(y >= C ? 2 : 0) + (x >= C ? 1 : 0)]);
/** Ways into each zone (zone index 0–3): just inside its two doorways and its corner of the plaza. */
export const ENTRANCES: { x: number; y: number }[][] = [0, 1, 2, 3].map((q) => [
  mirror(C - 9, DOOR_AT, q), mirror(DOOR_AT, C - 9, q), mirror(C - PLAZA - 8, C - PLAZA - 8, q),
]);

// ---- geometry ------------------------------------------------------------------------------
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Does the segment a→b pass within `r` of any wall or pillar? (Walls are grown by r: a slightly cautious box.) */
export function blocked(ax: number, ay: number, bx: number, by: number, r = 0) {
  const dx = bx - ax, dy = by - ay;
  const minX = Math.min(ax, bx) - r, maxX = Math.max(ax, bx) + r, minY = Math.min(ay, by) - r, maxY = Math.max(ay, by) + r;
  for (let k = 0; k < NW; k++) {
    const x0 = WF[4 * k] - r, y0 = WF[4 * k + 1] - r, x1 = WF[4 * k + 2] + r, y1 = WF[4 * k + 3] + r;
    if (maxX < x0 || minX > x1 || maxY < y0 || minY > y1) continue;
    let t0 = 0, t1 = 1;
    if (Math.abs(dx) < 1e-9) { if (ax < x0 || ax > x1) continue; }
    else { let ta = (x0 - ax) / dx, tb = (x1 - ax) / dx; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue; }
    if (Math.abs(dy) < 1e-9) { if (ay < y0 || ay > y1) continue; }
    else { let ta = (y0 - ay) / dy, tb = (y1 - ay) / dy; if (ta > tb) { const t = ta; ta = tb; tb = t; } if (ta > t0) t0 = ta; if (tb < t1) t1 = tb; if (t0 > t1) continue; }
    return true;
  }
  const L2 = dx * dx + dy * dy || 1e-9;
  for (let k = 0; k < NP; k++) {
    const px = PF[3 * k], py = PF[3 * k + 1], pr = PF[3 * k + 2] + r;
    if (maxX < px - pr || minX > px + pr || maxY < py - pr || minY > py + pr) continue;
    let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px, ey = ay + dy * t - py;
    if (ex * ex + ey * ey < pr * pr) return true;
  }
  return false;
}
/** Can a robot at a see one at b? Walls and pillars block the view (and the swing). */
export const lineOfSight = (a: { x: number; y: number }, b: { x: number; y: number }) => !blocked(a.x, a.y, b.x, b.y, 0);

/** The nearest bit of wall (or pillar, or the outer wall) to a point: its distance and which way is out. */
export function nearestWall(x: number, y: number) {
  let best = { d: Math.min(x, y, S - x, S - y), nx: 0, ny: 0, qx: x, qy: y };
  const outer = [[x, 1, 0, 0, y], [S - x, -1, 0, S, y], [y, 0, 1, x, 0], [S - y, 0, -1, x, S]];
  for (const [d, nx, ny, qx, qy] of outer) if (d <= best.d) best = { d, nx, ny, qx, qy };
  for (const w of WALLS) {
    const qx = clamp(x, w.x0, w.x1), qy = clamp(y, w.y0, w.y1), d = Math.hypot(x - qx, y - qy);
    if (d < best.d) best = { d, nx: d ? (x - qx) / d : 0, ny: d ? (y - qy) / d : 0, qx, qy };
  }
  for (const p of PILLARS) {
    const dd = Math.hypot(x - p.x, y - p.y), d = dd - p.r;
    if (d < best.d) best = { d, nx: (x - p.x) / (dd || 1), ny: (y - p.y) / (dd || 1), qx: p.x + ((x - p.x) / (dd || 1)) * p.r, qy: p.y + ((y - p.y) / (dd || 1)) * p.r };
  }
  return best;
}

/**
 * Keep a robot out of the walls and pillars: push it out and let it slide along. Returns how hard its knockback
 * slammed it in (units/s into the wall), so the melee can hurt it.
 */
export function solidify(me: Bot): number {
  const r = BODIES[me.build.body].radius;
  let impact = 0;
  const hit = (nx: number, ny: number, pen: number) => {
    me.x += nx * pen; me.y += ny * pen;
    const vn = me.vx * nx + me.vy * ny;
    if (vn < 0) { me.vx -= vn * nx; me.vy -= vn * ny; }
    const kn = me.kx * nx + me.ky * ny;
    if (kn < 0) { if (-kn > impact) impact = -kn; me.kx -= 1.4 * kn * nx; me.ky -= 1.4 * kn * ny; }
  };
  for (let k = 0; k < NW; k++) {
    const x0 = WF[4 * k], y0 = WF[4 * k + 1], x1 = WF[4 * k + 2], y1 = WF[4 * k + 3];
    if (me.x < x0 - r || me.x > x1 + r || me.y < y0 - r || me.y > y1 + r) continue;
    const qx = me.x < x0 ? x0 : me.x > x1 ? x1 : me.x, qy = me.y < y0 ? y0 : me.y > y1 ? y1 : me.y;
    const dx = me.x - qx, dy = me.y - qy, d = Math.sqrt(dx * dx + dy * dy);
    if (d >= r) continue;
    if (d > 1e-6) hit(dx / d, dy / d, r - d);
    else {
      // right inside it (a big shove): out the nearest side
      const l = me.x - x0, rt = x1 - me.x, u = me.y - y0, dn = y1 - me.y, mn = Math.min(l, rt, u, dn);
      if (mn === l) hit(-1, 0, l + r); else if (mn === rt) hit(1, 0, rt + r); else if (mn === u) hit(0, -1, u + r); else hit(0, 1, dn + r);
    }
  }
  for (let k = 0; k < NP; k++) {
    const px = PF[3 * k], py = PF[3 * k + 1], pr = PF[3 * k + 2] + r;
    const dx = me.x - px, dy = me.y - py;
    if (dx > pr || dx < -pr || dy > pr || dy < -pr) continue;
    const d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
    if (d < pr) hit(dx / d, dy / d, pr - d);
  }
  if (me.x < r) hit(1, 0, r - me.x);
  if (me.x > S - r) hit(-1, 0, me.x - (S - r));
  if (me.y < r) hit(0, 1, r - me.y);
  if (me.y > S - r) hit(0, -1, me.y - (S - r));
  return impact;
}

// ---- the pathfinder ------------------------------------------------------------------------
/** A 2.5-unit grid of the floor; a cell is open if a robot (up to 5 units across the middle) fits there. */
export const CELL = 2.5;
export const GRID = Math.round(S / CELL);
const CLEAR = 5;
const open = new Uint8Array(GRID * GRID);
const cx = (i: number) => ((i % GRID) + 0.5) * CELL, cy = (i: number) => (Math.floor(i / GRID) + 0.5) * CELL;
for (let i = 0; i < GRID * GRID; i++) open[i] = nearestWall(cx(i), cy(i)).d >= CLEAR ? 1 : 0;
/** For every cell, the nearest open one (so a robot squashed up against a wall still finds its way). */
const nearOpen = new Int32Array(GRID * GRID).fill(-1);
{
  const q: number[] = [];
  for (let i = 0; i < GRID * GRID; i++) if (open[i]) { nearOpen[i] = i; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = i % GRID, y = Math.floor(i / GRID);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const j = ny * GRID + nx;
      if (nearOpen[j] < 0) { nearOpen[j] = nearOpen[i]; q.push(j); }
    }
  }
}
export const cellOf = (x: number, y: number) => clamp(Math.floor(y / CELL), 0, GRID - 1) * GRID + clamp(Math.floor(x / CELL), 0, GRID - 1);
export function openNear(x: number, y: number) {
  if (nearestWall(x, y).d >= CLEAR + 1) return { x, y };
  const i = nearOpen[cellOf(x, y)];
  return { x: cx(i), y: cy(i) };
}
export const isOpen = (x: number, y: number) => open[cellOf(x, y)] === 1;
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
const FAR = 65535;
/** Distance fields (in tenths of a cell) to each 5 × 5-unit goal block, worked out once and kept. */
const fields = new Map<number, Uint16Array>();
function field(goal: number) {
  const g = nearOpen[goal];
  const key = (Math.floor(Math.floor(g / GRID) / 2) * GRID) + Math.floor((g % GRID) / 2);
  let f = fields.get(key);
  if (f) return f;
  // the block's own open cell nearest its middle
  const bx = Math.floor((g % GRID) / 2) * 2, by = Math.floor(Math.floor(g / GRID) / 2) * 2;
  let src = g;
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const j = (by + oy) * GRID + bx + ox; if (by + oy < GRID && bx + ox < GRID && open[j]) { src = j; break; } }
  f = new Uint16Array(GRID * GRID).fill(FAR);
  // Dijkstra with a little binary heap
  const heap: number[] = [], pri: number[] = [];
  const push = (i: number, p: number) => { heap.push(i); pri.push(p); let k = heap.length - 1; while (k > 0) { const u = (k - 1) >> 1; if (pri[u] <= pri[k]) break; [heap[u], heap[k]] = [heap[k], heap[u]]; [pri[u], pri[k]] = [pri[k], pri[u]]; k = u; } };
  const pop = () => { const top = heap[0], tp = pri[0], li = heap.pop()!, lp = pri.pop()!; if (heap.length) { heap[0] = li; pri[0] = lp; let k = 0; for (;;) { const a = 2 * k + 1, b = a + 1; let m = k; if (a < heap.length && pri[a] < pri[m]) m = a; if (b < heap.length && pri[b] < pri[m]) m = b; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; [pri[m], pri[k]] = [pri[k], pri[m]]; k = m; } } return [top, tp]; };
  f[src] = 0; push(src, 0);
  while (heap.length) {
    const [i, p] = pop();
    if (p > f[i]) continue;
    const x = i % GRID, y = Math.floor(i / GRID);
    for (const [dx, dy, c] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const j = ny * GRID + nx;
      if (!open[j]) continue;
      // no cutting a corner past a wall
      if (dx && dy && (!open[y * GRID + nx] || !open[ny * GRID + x])) continue;
      const v = p + c;
      if (v < f[j]) { f[j] = v; push(j, v); }
    }
  }
  fields.set(key, f);
  return f;
}
export const fieldCount = () => fields.size;

/** How far it is to walk from a to b, round the walls (units). */
export function pathDist(ax: number, ay: number, bx: number, by: number) {
  if (!blocked(ax, ay, bx, by, 0)) return Math.hypot(bx - ax, by - ay);
  const v = field(cellOf(bx, by))[nearOpen[cellOf(ax, ay)]];
  return v >= FAR ? 1e4 : (v / 10) * CELL;
}

/**
 * Where to steer to get from (x, y) to the goal: the goal itself if the way is clear, otherwise the farthest
 * point it can drive straight to along the shortest route round the walls.
 */
export function waypoint(x: number, y: number, gx: number, gy: number, r: number) {
  if (!blocked(x, y, gx, gy, r * 0.95)) return { x: gx, y: gy, direct: true };
  const f = field(cellOf(gx, gy));
  let cur = nearOpen[cellOf(x, y)];
  const chain = [cur];
  for (let n = 0; n < 24; n++) {
    const px = cur % GRID, py = Math.floor(cur / GRID);
    let best = cur;
    for (const [dx, dy] of NB) {
      const nx = px + dx, ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const j = ny * GRID + nx;
      if (open[j] && f[j] < f[best]) best = j;
    }
    if (best === cur) break;
    cur = best; chain.push(cur);
  }
  for (let i = chain.length - 1; i > 0; i--) if (!blocked(x, y, cx(chain[i]), cy(chain[i]), r * 0.9)) return { x: cx(chain[i]), y: cy(chain[i]), direct: false };
  const i = chain[Math.min(1, chain.length - 1)];
  return { x: cx(i), y: cy(i), direct: false };
}
void DT;
