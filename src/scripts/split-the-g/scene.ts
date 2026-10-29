// Split the G: drawing. The pub, the pint (with our own stylised G) and the drinkers.
import { BRAND, GLASS, G_MARK, TARGET, headNow, radiusAt, visibleLine, type Character, type Expression, type Pint } from './physics';

type Ctx = CanvasRenderingContext2D;
const INK = '#2b2d42';
const WALL = 0.6; // glass wall thickness, mm (drawn a bit chunkier)
const FONT = 'ui-rounded, "SF Pro Rounded", Nunito, system-ui, sans-serif';

// ---- the pub ---------------------------------------------------------------------------
export function drawPub(ctx: Ctx, w: number, h: number, barY: number, t: number) {
  // back wall: deep green panelling with a warm glow
  const g = ctx.createLinearGradient(0, 0, 0, barY);
  g.addColorStop(0, '#1d3b32');
  g.addColorStop(1, '#2d5546');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, barY);
  // panels
  ctx.strokeStyle = 'rgba(0,0,0,.22)';
  ctx.lineWidth = 3;
  const pw = Math.max(120, w / 7);
  for (let x = pw * 0.15; x < w; x += pw) {
    roundRect(ctx, x, barY * 0.5, pw * 0.7, barY * 0.38, 10);
    ctx.stroke();
  }
  // shelf with bottles (generic shapes, no labels you'd recognise)
  const shelfY = barY * 0.34;
  ctx.fillStyle = '#6b4226';
  ctx.fillRect(0, shelfY, w, 10);
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.fillRect(0, shelfY + 10, w, 6);
  const cols = ['#7a2e2e', '#c9a227', '#3f6e4f', '#5a3d73', '#b5652b', '#2f4f6f'];
  for (let i = 0, x = 18; x < w - 20; i++) {
    const bw = 16 + ((i * 7) % 9), bh = 46 + ((i * 13) % 30);
    ctx.fillStyle = cols[i % cols.length];
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, shelfY);
    ctx.lineTo(x, shelfY - bh * 0.62);
    ctx.quadraticCurveTo(x, shelfY - bh * 0.75, x + bw * 0.32, shelfY - bh * 0.8);
    ctx.lineTo(x + bw * 0.32, shelfY - bh);
    ctx.lineTo(x + bw * 0.68, shelfY - bh);
    ctx.lineTo(x + bw * 0.68, shelfY - bh * 0.8);
    ctx.quadraticCurveTo(x + bw, shelfY - bh * 0.75, x + bw, shelfY - bh * 0.62);
    ctx.lineTo(x + bw, shelfY);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    ctx.fillRect(x + 3, shelfY - bh * 0.58, 3, bh * 0.45);
    x += bw + 14 + ((i * 5) % 12);
  }
  // hanging lamps with a gentle glow
  for (const fx of [0.2, 0.55, 0.88]) {
    const lx = w * fx, ly = barY * 0.12;
    const glow = ctx.createRadialGradient(lx, ly + 18, 4, lx, ly + 18, barY * 0.55);
    glow.addColorStop(0, `rgba(255,214,140,${0.32 + 0.02 * Math.sin(t * 2 + fx * 9)})`);
    glow.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, barY);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, ly); ctx.stroke();
    ctx.fillStyle = '#c98b2b';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(lx - 22, ly + 18); ctx.quadraticCurveTo(lx, ly - 8, lx + 22, ly + 18); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath(); ctx.ellipse(lx, ly + 19, 9, 4, 0, 0, Math.PI * 2); ctx.fill();
  }
}

/** The bar counter, drawn in front of the drinker. */
export function drawBar(ctx: Ctx, w: number, h: number, barY: number) {
  const bt = ctx.createLinearGradient(0, barY, 0, h);
  bt.addColorStop(0, '#8a5530');
  bt.addColorStop(0.08, '#6e4224');
  bt.addColorStop(1, '#4a2b16');
  ctx.fillStyle = bt;
  ctx.fillRect(0, barY, w, h - barY);
  ctx.fillStyle = '#a8693d';
  ctx.fillRect(0, barY, w, 6);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, barY); ctx.lineTo(w, barY); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,.18)';
  ctx.lineWidth = 2;
  for (let y = barY + 22; y < h; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(w * 0.3, y + 4, w * 0.6, y - 4, w, y + 2); ctx.stroke(); }
}

// ---- the pint glass ----------------------------------------------------------------------
export interface GlassView {
  x: number; // screen position of the middle of the glass's foot (bottom)
  y: number;
  s: number; // px per mm
  angle: number; // radians, negative = tipped towards the drinker on the left
}

/** Screen position of a point given in glass coordinates (u across, v up from the very bottom, mm). */
export function glassToScreen(gv: GlassView, u: number, v: number) {
  const c = Math.cos(gv.angle), s = Math.sin(gv.angle);
  const x = u * gv.s, y = -v * gv.s;
  return { x: gv.x + x * c - y * s, y: gv.y + x * s + y * c };
}

function innerPath(ctx: Ctx, s: number) {
  ctx.beginPath();
  const steps = 32;
  for (let i = 0; i <= steps; i++) { const v = (GLASS.height * i) / steps; ctx.lineTo(-radiusAt(v) * s, -(GLASS.base + v) * s); }
  for (let i = steps; i >= 0; i--) { const v = (GLASS.height * i) / steps; ctx.lineTo(radiusAt(v) * s, -(GLASS.base + v) * s); }
  ctx.closePath();
}
function outerPath(ctx: Ctx, s: number) {
  ctx.beginPath();
  const steps = 32, foot = radiusAt(0) + 4;
  ctx.moveTo(-foot * s, 0);
  ctx.lineTo(-(foot - 0.5) * s, -GLASS.base * 0.7 * s);
  for (let i = 0; i <= steps; i++) { const v = (GLASS.height * i) / steps; ctx.lineTo(-(radiusAt(v) + 1.6 + WALL) * s, -(GLASS.base + v) * s); }
  for (let i = steps; i >= 0; i--) { const v = (GLASS.height * i) / steps; ctx.lineTo((radiusAt(v) + 1.6 + WALL) * s, -(GLASS.base + v) * s); }
  ctx.lineTo((foot - 0.5) * s, -GLASS.base * 0.7 * s);
  ctx.lineTo(foot * s, 0);
  ctx.closePath();
}

export interface PintLook {
  /** 0 → just poured (cloudy, surging), 1 → fully settled */
  settled: number;
  time: number;
  /** show the ideal line and where yours ended up */
  verdict?: { line: number; good: boolean } | null;
  empty?: boolean;
}

export function drawGlass(ctx: Ctx, gv: GlassView, pint: Pint | null, look: PintLook) {
  const { s } = gv;
  ctx.save();
  ctx.translate(gv.x, gv.y);
  ctx.rotate(gv.angle);

  // shadow on the bar (only when the glass is down)
  // glass body
  outerPath(ctx, s);
  ctx.fillStyle = 'rgba(220,235,240,.28)';
  ctx.fill();

  if (pint && !look.empty) {
    const line = visibleLine(pint);
    const head = Math.max(4, headNow(pint));
    ctx.save();
    innerPath(ctx, s);
    ctx.clip();
    // foam left clinging to the glass above the head (lacing)
    const topNow = line + head, topStart = pint.start + pint.head;
    if (topStart - topNow > 3) {
      ctx.fillStyle = 'rgba(246,234,208,.22)';
      ctx.fillRect(-60 * s, -(GLASS.base + topStart) * s, 120 * s, (topStart - topNow) * s);
      ctx.strokeStyle = 'rgba(246,234,208,.55)';
      ctx.lineWidth = Math.max(1, 0.5 * s);
      for (let v = topNow + 5; v < topStart; v += 7 + ((v * 3.7) % 5)) {
        ctx.beginPath();
        for (let u = -45; u <= 45; u += 3) ctx.lineTo(u * s, -(GLASS.base + v + Math.sin(u * 0.4 + v) * 0.9) * s);
        ctx.stroke();
      }
    }
    // level surfaces stay level in the world, so undo the tilt about the line
    ctx.translate(0, -(GLASS.base + line) * s);
    ctx.rotate(-gv.angle);
    const W = 140 * s;
    // the stout
    const settled = look.settled;
    const beer = ctx.createLinearGradient(-40 * s, 0, 40 * s, 0);
    beer.addColorStop(0, '#120806');
    beer.addColorStop(0.35, '#2a1209');
    beer.addColorStop(0.5, '#3a190c');
    beer.addColorStop(1, '#0d0504');
    ctx.fillStyle = beer;
    ctx.fillRect(-W, 0, 2 * W, W);
    if (settled < 1) {
      // still surging: a creamy tan cloud that clears from the bottom up
      const front = (GLASS.base + line) * settled; // mm above the bottom that has cleared
      const depth = GLASS.base + line - front;
      const surge = ctx.createLinearGradient(0, 0, 0, depth * s);
      surge.addColorStop(0, 'rgba(196,150,104,.97)');
      surge.addColorStop(0.75, 'rgba(150,100,62,.9)');
      surge.addColorStop(1, 'rgba(90,50,26,0)');
      ctx.fillStyle = surge;
      ctx.fillRect(-W, 0, 2 * W, depth * s);
      // tiny bubbles sinking down the sides, as stout bubbles do
      ctx.fillStyle = 'rgba(240,215,170,.6)';
      for (let i = 0; i < 36; i++) {
        const u = ((i * 37) % 70) - 35;
        const v = ((look.time * (18 + (i % 5) * 4) + i * 11) % Math.max(4, depth));
        ctx.beginPath(); ctx.arc(u * s, v * s, Math.max(0.8, 0.35 * s), 0, Math.PI * 2); ctx.fill();
      }
    }
    // the head: thin caramel band where it meets the stout, then cream
    const hd = ctx.createLinearGradient(0, -head * s, 0, 0);
    hd.addColorStop(0, '#fff6e0');
    hd.addColorStop(0.7, '#f3e2bf');
    hd.addColorStop(0.93, '#d9b98a');
    hd.addColorStop(1, '#a0703f');
    ctx.fillStyle = hd;
    ctx.fillRect(-W, -head * s, 2 * W, head * s + 0.6);
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.fillRect(-W, -head * s, 2 * W, Math.max(1.5, 0.8 * s));
    ctx.restore();
  }

  // the printed G and the brand: our own design
  drawMark(ctx, s);

  // the ideal line and yours
  if (look.verdict) drawVerdictLines(ctx, s, look.verdict.line, look.verdict.good);

  // glass outline + shine
  outerPath(ctx, s);
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2.5, 1.1 * s);
  ctx.lineJoin = 'round';
  ctx.stroke();
  innerPath(ctx, s);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = Math.max(1, 0.5 * s);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.28)';
  ctx.beginPath();
  for (let v = 20; v <= 150; v += 5) ctx.lineTo(-(radiusAt(v) - 6) * s, -(GLASS.base + v) * s);
  for (let v = 150; v >= 20; v -= 5) ctx.lineTo(-(radiusAt(v) - 10) * s, -(GLASS.base + v) * s);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)';
  ctx.fillRect((radiusAt(120) - 7) * s, -(GLASS.base + 140) * s, 2.5 * s, 50 * s);
  ctx.restore();
}

/** The G's centreline as points in glass mm (u across, v up), each with a stroke width, all from G_MARK. */
export function gOutline() {
  const g = G_MARK;
  const pts: { u: number; v: number; w: number }[] = [];
  const { thin, thick } = g.stroke;
  // stress like a pen held at an angle: thickest down the left, hairline over the top and bottom
  const width = (a: number) => thin + (thick - thin) * Math.max(0, -Math.cos(a - 0.25)) ** 1.6;
  // 1. the curl: a little spiral tucked inside the ring, unwinding out to meet it at the top right
  const turns = 1.15 * Math.PI * 2;
  for (let i = 0; i <= 40; i++) {
    const t = i / 40; // 0 = centre of the curl, 1 = where it joins the ring
    const a = g.startAngle - turns * (1 - t);
    const r = g.curlR * (0.15 + 0.85 * t);
    pts.push({ u: g.curl.u + r * Math.cos(a), v: g.curl.v + r * Math.sin(a), w: thin * (0.9 + 0.5 * (1 - t)) });
  }
  // 2. the ring: anticlockwise over the top, down the left and round to meet the bar on the right
  const end = Math.PI * 2 + g.barEndAngle;
  for (let i = 1; i <= 120; i++) {
    const a = g.startAngle + ((end - g.startAngle) * i) / 120;
    pts.push({ u: g.R * Math.cos(a), v: g.cy + g.R * Math.sin(a), w: width(a) });
  }
  // 3. the bar: straight in from the ring towards the middle, a firm horizontal
  for (let i = 1; i <= 12; i++) {
    const u = g.barFrom + ((g.barTo - g.barFrom) * i) / 12;
    pts.push({ u, v: g.barY, w: thin * 1.5 });
  }
  return pts;
}

/** Our own slender G (its geometry is G_MARK, the same numbers the scoring uses), and the parody brand underneath. */
function drawMark(ctx: Ctx, s: number) {
  const pts = gOutline();
  const X = (u: number) => u * s, Y = (v: number) => -(GLASS.base + v) * s;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const strokeAll = (style: string | CanvasGradient, extra: number) => {
    ctx.strokeStyle = style;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i];
      ctx.lineWidth = Math.max(1, ((p.w + q.w) / 2) * s + extra);
      ctx.beginPath(); ctx.moveTo(X(p.u), Y(p.v)); ctx.lineTo(X(q.u), Y(q.v)); ctx.stroke();
    }
  };
  strokeAll('rgba(43,22,10,.5)', Math.max(1.5, 0.6 * s));
  const gold = ctx.createLinearGradient(0, Y(G_MARK.top), 0, Y(G_MARK.bottom));
  gold.addColorStop(0, '#fbe7a6');
  gold.addColorStop(1, '#e2b85c');
  strokeAll(gold, 0);
  // a fine serif under the inner end of the bar
  ctx.strokeStyle = gold;
  ctx.lineWidth = Math.max(1, G_MARK.stroke.thin * s);
  ctx.beginPath(); ctx.moveTo(X(G_MARK.barTo), Y(G_MARK.barY)); ctx.lineTo(X(G_MARK.barTo), Y(G_MARK.barY - 1.6)); ctx.stroke();
  // brand wordmark under the G
  ctx.font = `900 ${6.2 * s}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = `${0.6 * s}px`;
  ctx.lineWidth = Math.max(2, 0.9 * s);
  ctx.strokeStyle = 'rgba(43,22,10,.55)';
  const by = -(GLASS.base + G_MARK.bottom - 8) * s;
  ctx.strokeText(BRAND.toUpperCase(), 0, by);
  ctx.fillStyle = '#f4dc98';
  ctx.fillText(BRAND.toUpperCase(), 0, by);
  ctx.font = `800 ${3.3 * s}px ${FONT}`;
  ctx.letterSpacing = `${0.3 * s}px`;
  ctx.fillStyle = 'rgba(244,220,152,.85)';
  ctx.fillText('THE BLACK STUFF', 0, by + 6 * s);
  ctx.restore();
}

function drawVerdictLines(ctx: Ctx, s: number, line: number, good: boolean) {
  const X0 = (u: number) => u * s;
  const yT = -(GLASS.base + TARGET) * s, yL = -(GLASS.base + line) * s;
  const half = (radiusAt(TARGET) + 9) * s;
  ctx.save();
  ctx.setLineDash([2.5 * s, 2 * s]);
  ctx.lineWidth = Math.max(2, 0.9 * s);
  ctx.strokeStyle = '#ffd84a';
  ctx.beginPath(); ctx.moveTo(-half, yT); ctx.lineTo(half + 6 * s, yT); ctx.stroke();
  ctx.setLineDash([]);
  // the ref's bracket: from the G's bar up to its curl, with the split line halfway
  const yBar = -(GLASS.base + G_MARK.barY) * s, yCurl = -(GLASS.base + G_MARK.curl.v) * s;
  const bx = -half - 3 * s;
  ctx.strokeStyle = '#ffd84a';
  ctx.lineWidth = Math.max(1.5, 0.5 * s);
  ctx.beginPath();
  ctx.moveTo(bx + 3 * s, yCurl); ctx.lineTo(bx, yCurl); ctx.lineTo(bx, yBar); ctx.lineTo(bx + 3 * s, yBar);
  ctx.moveTo(bx - 2.5 * s, yT); ctx.lineTo(bx, yT);
  ctx.stroke();
  ctx.setLineDash([1 * s, 1.5 * s]);
  ctx.strokeStyle = 'rgba(255,216,74,.6)';
  ctx.beginPath();
  ctx.moveTo(bx + 3 * s, yCurl); ctx.lineTo(X0(G_MARK.curl.u), yCurl);
  ctx.moveTo(bx + 3 * s, yBar); ctx.lineTo(X0(G_MARK.barTo), yBar);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = good ? '#7bd389' : '#ff7a59';
  ctx.lineWidth = Math.max(2, 0.7 * s);
  const halfL = (radiusAt(line) + 9) * s;
  ctx.beginPath(); ctx.moveTo(-halfL, yL); ctx.lineTo(halfL + 6 * s, yL); ctx.stroke();
  ctx.restore();
}

// ---- the drinkers ----------------------------------------------------------------------------
export interface Pose {
  x: number; // head centre
  y: number;
  R: number; // head radius, px
  expr: Expression;
  t: number; // seconds, for blinks and bobbing
  /** creamy moustache from the head (0..1) */
  tash: number;
  /** cheeks puffed (drinking) */
  puff: number;
}

export function drawBody(ctx: Ctx, c: Character, p: Pose, bottom: number) {
  const { x, y, R } = p;
  const top = y + R * 0.78;
  const L = c.look;
  ctx.save();
  ctx.lineWidth = Math.max(2.5, R * 0.05);
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  // torso
  ctx.beginPath();
  ctx.moveTo(x - R * 1.25, bottom + 4);
  ctx.bezierCurveTo(x - R * 1.32, top + R * 0.5, x - R * 0.9, top + R * 0.05, x - R * 0.45, top);
  ctx.lineTo(x + R * 0.45, top);
  ctx.bezierCurveTo(x + R * 0.9, top + R * 0.05, x + R * 1.32, top + R * 0.5, x + R * 1.25, bottom + 4);
  ctx.closePath();
  ctx.fillStyle = L.shirt;
  ctx.fill();
  ctx.save();
  ctx.clip();
  if (L.extra === 'hoops') {
    ctx.fillStyle = '#f5f5f0';
    for (let yy = top + R * 0.25; yy < bottom; yy += R * 0.5) ctx.fillRect(x - R * 1.5, yy, R * 3, R * 0.22);
  }
  if (L.extra === 'cardigan') {
    ctx.fillStyle = '#f6efe6';
    ctx.beginPath(); ctx.moveTo(x - R * 0.35, top); ctx.lineTo(x + R * 0.35, top); ctx.lineTo(x + R * 0.12, bottom); ctx.lineTo(x - R * 0.12, bottom); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffd84a';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(x + R * 0.3, top + R * (0.35 + i * 0.32), R * 0.05, 0, Math.PI * 2); ctx.fill(); }
  }
  if (L.extra === 'tie') {
    ctx.fillStyle = '#c0392b';
    ctx.beginPath(); ctx.moveTo(x - R * 0.09, top + R * 0.05); ctx.lineTo(x + R * 0.09, top + R * 0.05); ctx.lineTo(x + R * 0.15, top + R * 0.9); ctx.lineTo(x, top + R * 1.05); ctx.lineTo(x - R * 0.15, top + R * 0.9); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (L.kind === 'walrus') {
    // a captain's jacket: brass buttons
    ctx.fillStyle = '#e2b85c';
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * R * 0.28, top + R * (0.45 + i * 0.35), R * 0.06, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
  ctx.stroke();
  // collar / neck
  ctx.fillStyle = L.skin;
  ctx.beginPath(); ctx.ellipse(x, top + R * 0.02, R * 0.36, R * 0.16, 0, 0, Math.PI); ctx.fill(); ctx.stroke();
  if (L.extra === 'bowtie') {
    ctx.fillStyle = '#c0392b';
    const by = top + R * 0.15;
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x - R * 0.28, by - R * 0.13); ctx.lineTo(x - R * 0.28, by + R * 0.13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + R * 0.28, by - R * 0.13); ctx.lineTo(x + R * 0.28, by + R * 0.13); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, by, R * 0.06, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

/** The drinking arm, from the right shoulder to the glass. */
export function drawArm(ctx: Ctx, c: Character, p: Pose, hand: { x: number; y: number }) {
  const sx = p.x + p.R * 0.95, sy = p.y + p.R * 1.25;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  ctx.lineWidth = p.R * 0.42 + 5;
  const mx = (sx + hand.x) / 2 + p.R * 0.15, my = Math.max(sy, hand.y) + p.R * 0.35;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hand.x, hand.y); ctx.stroke();
  ctx.strokeStyle = c.look.shirt;
  ctx.lineWidth = p.R * 0.42;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, hand.x, hand.y); ctx.stroke();
  ctx.restore();
}

/** Fingers wrapped round the front of the glass. */
export function drawHand(ctx: Ctx, c: Character, hand: { x: number; y: number }, R: number, angle: number) {
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(angle);
  ctx.fillStyle = c.look.kind === 'walrus' ? '#8d6b50' : c.look.skin;
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(2, R * 0.045);
  for (let i = 0; i < 4; i++) {
    roundRect(ctx, -R * 0.12, -R * 0.24 + i * R * 0.15, R * 0.42 - i * R * 0.03, R * 0.14, R * 0.07);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawFace(ctx: Ctx, c: Character, p: Pose) {
  const { x, y, R, expr, t } = p;
  const L = c.look;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK;
  const lw = Math.max(2, R * 0.05);
  ctx.lineWidth = lw;
  const bob = expr === 'idle' || expr === 'nervous' ? Math.sin(t * 2.2) * R * 0.015 : 0;
  ctx.translate(0, bob);

  // hair behind the head
  ctx.fillStyle = L.hair;
  if (L.style === 'bob') {
    ctx.beginPath(); ctx.ellipse(x, y + R * 0.05, R * 1.13, R * 1.08, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.lineTo(x + R * 1.1, y + R * 0.55); ctx.lineTo(x - R * 1.1, y + R * 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  if (L.style === 'curls') {
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.85 + (i / 13) * 1.3);
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 1.02, y + Math.sin(a) * R * 0.98 + R * 0.05, R * 0.27, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  // ears
  const skin = L.skin;
  if (L.kind === 'human') {
    ctx.fillStyle = skin;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sx * R * 0.93, y + R * 0.08, R * 0.16, R * 0.22, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }
  // head
  ctx.fillStyle = skin;
  ctx.beginPath();
  if (L.kind === 'walrus') ctx.ellipse(x, y, R * 1.02, R * 0.95, 0, 0, Math.PI * 2);
  else ctx.ellipse(x, y, R * 0.92, R, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();

  // earrings
  if (L.extra === 'earrings') {
    ctx.fillStyle = '#ffd84a';
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * R * 0.95, y + R * 0.38, R * 0.11, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }

  // cheeks
  const blush = expr === 'happy' || expr === 'chuffed' ? 0.55 : expr === 'drinking' ? 0.35 + 0.25 * p.puff : 0.22;
  ctx.fillStyle = `rgba(255,110,110,${blush})`;
  const cheekR = R * (0.17 + 0.07 * p.puff);
  for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sx * R * 0.52, y + R * 0.32, cheekR * 1.2, cheekR, 0, 0, Math.PI * 2); ctx.fill(); }

  // eyes
  const ey = y - R * 0.05, ex = R * 0.34;
  const blink = (t % 3.7) < 0.12;
  ctx.lineWidth = lw * 1.1;
  if (expr === 'drinking') {
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * ex, ey + R * 0.02, R * 0.12, Math.PI * 0.1, Math.PI * 0.9); ctx.stroke(); }
  } else if (expr === 'happy' || expr === 'chuffed') {
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * ex, ey + R * 0.06, R * 0.13, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
  } else if (blink) {
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sx * ex - R * 0.11, ey); ctx.lineTo(x + sx * ex + R * 0.11, ey); ctx.stroke(); }
  } else {
    const er = L.kind === 'walrus' ? R * 0.1 : R * 0.15;
    const pr = expr === 'nervous' ? R * 0.045 : R * 0.075;
    const look = expr === 'gutted' ? { x: 0, y: R * 0.05 } : { x: R * 0.03, y: 0 };
    for (const sx of [-1, 1]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.ellipse(x + sx * ex, ey, er, er * 1.15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath(); ctx.arc(x + sx * ex + look.x, ey + look.y, pr, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x + sx * ex + look.x + pr * 0.35, ey + look.y - pr * 0.35, pr * 0.3, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.lineWidth = lw;
  // eyebrows
  ctx.strokeStyle = L.kind === 'walrus' ? '#5a3f2c' : darken(L.hair === '#e6e6e6' || L.hair === '#cfd3da' ? '#9aa0aa' : L.hair);
  ctx.lineWidth = lw * 1.6;
  const brow = expr === 'gutted' ? 0.1 : expr === 'nervous' ? 0.16 : expr === 'drinking' ? -0.05 : expr === 'chuffed' ? -0.1 : 0;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + sx * (ex - R * 0.14), ey - R * (0.24 - (expr === 'gutted' ? -brow : 0)));
    ctx.lineTo(x + sx * (ex + R * 0.13), ey - R * (0.26 + brow));
    ctx.stroke();
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = lw;

  // glasses
  if (L.glasses) {
    ctx.lineWidth = lw * 0.9;
    for (const sx of [-1, 1]) { ctx.beginPath(); ctx.arc(x + sx * ex, ey, R * 0.21, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(x - ex + R * 0.21, ey); ctx.quadraticCurveTo(x, ey - R * 0.07, x + ex - R * 0.21, ey); ctx.stroke();
    ctx.lineWidth = lw;
  }

  // nose
  const ny = y + R * 0.2;
  if (L.kind === 'walrus') {
    ctx.fillStyle = '#3b2a1e';
    ctx.beginPath(); ctx.ellipse(x, ny - R * 0.04, R * 0.16, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = darken(skin, 0.12);
    ctx.beginPath(); ctx.ellipse(x, ny, R * 0.13, R * 0.1, 0, 0, Math.PI * 2); ctx.fill();
    if (c.id === 'declan') { ctx.beginPath(); ctx.moveTo(x - R * 0.08, ny - R * 0.12); ctx.lineTo(x + R * 0.04, ny - R * 0.04); ctx.stroke(); }
  }

  // mouth
  const my = y + R * 0.5;
  drawMouth(ctx, x, my, R, expr, L.kind === 'walrus');

  // beard / walrus moustache and tusks
  if (L.style === 'beard') {
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(x - R * 0.88, y + R * 0.1);
    ctx.bezierCurveTo(x - R * 0.9, y + R * 1.25, x + R * 0.9, y + R * 1.25, x + R * 0.88, y + R * 0.1);
    ctx.bezierCurveTo(x + R * 0.7, y + R * 0.55, x + R * 0.35, y + R * 0.38, x, y + R * 0.36);
    ctx.bezierCurveTo(x - R * 0.35, y + R * 0.38, x - R * 0.7, y + R * 0.55, x - R * 0.88, y + R * 0.1);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = expr === 'happy' || expr === 'chuffed' ? '#8b2f2f' : darken(skin, 0.25);
    ctx.beginPath(); ctx.ellipse(x, my + R * 0.03, R * 0.2, expr === 'happy' || expr === 'chuffed' ? R * 0.12 : R * 0.05, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  if (L.kind === 'walrus') {
    ctx.fillStyle = '#f7f1e3';
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + sx * R * 0.16, my + R * 0.05);
      ctx.quadraticCurveTo(x + sx * R * 0.24, my + R * 0.6, x + sx * R * 0.12, my + R * 0.85);
      ctx.quadraticCurveTo(x + sx * R * 0.06, my + R * 0.45, x + sx * R * 0.05, my + R * 0.05);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = L.hair;
    ctx.beginPath();
    ctx.moveTo(x, ny + R * 0.04);
    ctx.bezierCurveTo(x - R * 0.35, ny - R * 0.02, x - R * 0.78, ny + R * 0.18, x - R * 0.72, ny + R * 0.42);
    ctx.bezierCurveTo(x - R * 0.4, ny + R * 0.38, x - R * 0.2, ny + R * 0.4, x, ny + R * 0.28);
    ctx.bezierCurveTo(x + R * 0.2, ny + R * 0.4, x + R * 0.4, ny + R * 0.38, x + R * 0.72, ny + R * 0.42);
    ctx.bezierCurveTo(x + R * 0.78, ny + R * 0.18, x + R * 0.35, ny - R * 0.02, x, ny + R * 0.04);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = INK;
    for (const [dx, dy] of [[-0.35, 0.15], [-0.48, 0.22], [-0.3, 0.26], [0.35, 0.15], [0.48, 0.22], [0.3, 0.26]]) { ctx.beginPath(); ctx.arc(x + dx * R, ny + dy * R, R * 0.025, 0, Math.PI * 2); ctx.fill(); }
  }

  // creamy moustache from the head of the pint
  if (p.tash > 0.02) {
    ctx.globalAlpha = Math.min(1, p.tash);
    ctx.fillStyle = '#fff4da';
    ctx.strokeStyle = 'rgba(160,120,70,.6)';
    ctx.lineWidth = lw * 0.6;
    const ty = L.kind === 'walrus' ? ny + R * 0.38 : my - R * 0.1;
    const tw = L.kind === 'walrus' ? R * 0.6 : R * 0.34;
    ctx.beginPath();
    ctx.moveTo(x - tw, ty);
    for (let i = 1; i <= 6; i++) { const u = x - tw + (2 * tw * i) / 6; ctx.quadraticCurveTo(u - tw / 6, ty - R * 0.12, u, ty - R * 0.02); }
    ctx.quadraticCurveTo(x, ty + R * 0.1, x - tw, ty);
    ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
  }

  // hair on top
  ctx.fillStyle = L.hair;
  if (L.style === 'bob') {
    ctx.beginPath(); ctx.moveTo(x - R * 0.95, y - R * 0.05); ctx.bezierCurveTo(x - R * 1.0, y - R * 1.25, x + R * 1.0, y - R * 1.25, x + R * 0.95, y - R * 0.05); ctx.bezierCurveTo(x + R * 0.6, y - R * 0.5, x - R * 0.2, y - R * 0.3, x - R * 0.95, y - R * 0.05); ctx.fill(); ctx.stroke();
  } else if (L.style === 'beard') {
    ctx.beginPath(); ctx.moveTo(x - R * 0.85, y - R * 0.35); ctx.bezierCurveTo(x - R * 0.85, y - R * 1.15, x + R * 0.85, y - R * 1.15, x + R * 0.85, y - R * 0.35); ctx.bezierCurveTo(x + R * 0.4, y - R * 0.62, x - R * 0.4, y - R * 0.62, x - R * 0.85, y - R * 0.35); ctx.fill(); ctx.stroke();
  } else if (L.style === 'parting') {
    ctx.beginPath(); ctx.moveTo(x - R * 0.9, y - R * 0.1); ctx.bezierCurveTo(x - R * 1.0, y - R * 1.2, x + R * 1.0, y - R * 1.2, x + R * 0.9, y - R * 0.1); ctx.bezierCurveTo(x + R * 0.85, y - R * 0.55, x - R * 0.1, y - R * 0.75, x - R * 0.3, y - R * 0.55); ctx.bezierCurveTo(x - R * 0.5, y - R * 0.5, x - R * 0.8, y - R * 0.4, x - R * 0.9, y - R * 0.1); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - R * 0.3, y - R * 0.95); ctx.lineTo(x - R * 0.32, y - R * 0.6); ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.stroke(); ctx.strokeStyle = INK;
  } else if (L.style === 'curls') {
    for (let i = 0; i < 9; i++) { const a = Math.PI * (1.08 + (i / 8) * 0.84); ctx.beginPath(); ctx.arc(x + Math.cos(a) * R * 0.78, y + Math.sin(a) * R * 0.8, R * 0.24, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  } else if (L.style === 'bald') {
    for (const sx of [-1, 1]) { for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(x + sx * R * (0.86 + i * 0.05), y - R * (0.35 - i * 0.17), R * 0.16, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } }
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath(); ctx.ellipse(x - R * 0.3, y - R * 0.72, R * 0.2, R * 0.08, -0.4, 0, Math.PI * 2); ctx.fill();
  }
  if (L.extra === 'flatcap') {
    ctx.fillStyle = '#3d4a5c';
    ctx.beginPath();
    ctx.moveTo(x - R * 0.98, y - R * 0.38);
    ctx.bezierCurveTo(x - R * 0.95, y - R * 1.2, x + R * 0.9, y - R * 1.25, x + R * 1.0, y - R * 0.5);
    ctx.quadraticCurveTo(x + R * 1.35, y - R * 0.42, x + R * 1.2, y - R * 0.3);
    ctx.quadraticCurveTo(x + R * 0.2, y - R * 0.55, x - R * 0.98, y - R * 0.38);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(x - R * (0.9 - i * 0.4), y - R * 0.48); ctx.lineTo(x - R * (0.8 - i * 0.38), y - R * 1.0); ctx.stroke(); }
    ctx.strokeStyle = INK;
  }

  // sweat drop when nervous
  if (expr === 'nervous') {
    ctx.fillStyle = '#8fd3ff';
    const dy = ((t * 0.8) % 1) * R * 0.25;
    ctx.beginPath(); ctx.moveTo(x + R * 0.85, y - R * 0.55 + dy); ctx.quadraticCurveTo(x + R * 0.98, y - R * 0.3 + dy, x + R * 0.85, y - R * 0.27 + dy); ctx.quadraticCurveTo(x + R * 0.72, y - R * 0.3 + dy, x + R * 0.85, y - R * 0.55 + dy); ctx.fill(); ctx.stroke();
  }
  // sparkles when chuffed
  if (expr === 'chuffed') {
    ctx.fillStyle = '#ffd84a';
    for (const [dx, dy, k] of [[-1.25, -0.9, 1], [1.3, -1.05, 0.8], [1.45, 0.1, 0.6]]) star(ctx, x + dx * R, y + dy * R, R * 0.16 * k * (1 + 0.2 * Math.sin(t * 6 + dx)));
  }
  ctx.restore();
}

function drawMouth(ctx: Ctx, x: number, my: number, R: number, expr: Expression, walrus: boolean) {
  ctx.save();
  if (walrus) my -= R * 0.02;
  if (expr === 'drinking') {
    ctx.fillStyle = '#6b2b2b';
    ctx.beginPath(); ctx.ellipse(x, my, R * 0.11, R * 0.09, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (expr === 'happy' || expr === 'chuffed') {
    ctx.fillStyle = '#8b2f2f';
    ctx.beginPath(); ctx.moveTo(x - R * 0.3, my - R * 0.05); ctx.quadraticCurveTo(x, my + R * 0.45, x + R * 0.3, my - R * 0.05); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff9aa2';
    ctx.beginPath(); ctx.ellipse(x, my + R * 0.13, R * 0.11, R * 0.06, 0, 0, Math.PI * 2); ctx.fill();
  } else if (expr === 'gutted') {
    ctx.beginPath(); ctx.moveTo(x - R * 0.22, my + R * 0.1); ctx.quadraticCurveTo(x, my - R * 0.12, x + R * 0.22, my + R * 0.1); ctx.stroke();
  } else if (expr === 'nervous') {
    ctx.beginPath(); ctx.moveTo(x - R * 0.24, my);
    for (let i = 1; i <= 6; i++) ctx.lineTo(x - R * 0.24 + i * R * 0.08, my + (i % 2 ? -1 : 1) * R * 0.04);
    ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(x - R * 0.22, my - R * 0.02); ctx.quadraticCurveTo(x, my + R * 0.16, x + R * 0.22, my - R * 0.02); ctx.stroke();
  }
  ctx.restore();
}

/** A small portrait for the line-up (head and shoulders). */
export function drawPortrait(canvas: HTMLCanvasElement, c: Character, expr: Expression = 'idle') {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 96, h = canvas.clientHeight || 96;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const R = h * 0.3;
  const pose: Pose = { x: w / 2, y: h * 0.45, R, expr, t: 1, tash: 0, puff: 0 };
  drawBody(ctx, c, pose, h);
  drawFace(ctx, c, pose);
}

// ---- helpers -----------------------------------------------------------------------------
export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function star(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = (Math.PI * i) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.42 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function darken(hex: string, k = 0.35) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.round(v * (1 - k));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function drawGlug(ctx: Ctx, x: number, y: number, t: number, R: number) {
  ctx.save();
  ctx.font = `900 ${Math.max(14, R * 0.32)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) {
    const ph = (t * 1.6 + i * 0.5) % 1;
    ctx.globalAlpha = 1 - ph;
    const xx = x - R * (0.6 + ph * 0.5), yy = y - R * (0.2 + ph * 0.9);
    ctx.strokeText('glug', xx, yy);
    ctx.fillText('glug', xx, yy);
  }
  ctx.restore();
}

// ---- the glass hat (for anyone who drinks the lot) ----------------------------------------
export interface HatFit {
  /** how far above the middle of the head the upturned rim rests, × head radius */
  crown: number;
  /** a jaunty tilt, radians */
  tilt: number;
  /** a sideways nudge, × head radius */
  dx: number;
}
/** Where an upside-down pint sits on each drinker's head art. */
export const HAT_FIT: Record<string, HatFit> = {
  maureen: { crown: 1.0, tilt: -0.08, dx: -0.03 }, // perched on top of the bob
  declan: { crown: 0.9, tilt: 0.1, dx: 0.04 }, // jammed on like a scrum cap
  nigel: { crown: 0.95, tilt: 0.18, dx: 0.06 }, // a bit wonky, naturally
  dot: { crown: 1.12, tilt: -0.12, dx: -0.05 }, // riding high on the curls
  walter: { crown: 1.14, tilt: 0.07, dx: 0.08 }, // balanced on top of the flat cap
  pip: { crown: 0.88, tilt: 0, dx: 0 }, // straight down on the dome
};
export const hatFit = (c: Character): HatFit => HAT_FIT[c.id] ?? { crown: 0.7, tilt: 0, dx: 0 };

/** The last of the head sliding out of an upturned glass: foam round the rim and a few drips down the drinker. */
export function drawHatFoam(ctx: Ctx, gv: GlassView, R: number, t: number) {
  if (t < 0) return;
  const rim = GLASS.base + GLASS.height;
  const r = radiusAt(GLASS.height);
  const clamp = (x: number) => Math.max(0, Math.min(1, x));
  ctx.save();
  ctx.fillStyle = '#fff4da';
  ctx.strokeStyle = 'rgba(160,120,70,.65)';
  ctx.lineWidth = Math.max(1.2, R * 0.03);
  // drips run straight down (gravity), from points on the rim
  for (const [u, delay, len] of [[-0.86, 0, 0.36], [0.84, 0.14, 0.62], [-0.3, 0.35, 0.14]]) {
    const d = clamp((t - delay) / 0.9);
    if (d <= 0) continue;
    const p = glassToScreen(gv, u * r, rim);
    const L = len * R * (1 - (1 - d) ** 2);
    const wdt = R * 0.065;
    ctx.beginPath();
    ctx.moveTo(p.x - wdt, p.y);
    ctx.lineTo(p.x - wdt * 0.55, p.y + L);
    ctx.arc(p.x, p.y + L, wdt * 0.85, Math.PI, 0, true);
    ctx.lineTo(p.x + wdt, p.y);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // now and then a drop lets go of the longest drip
    if (len > 0.6 && d >= 1) {
      const f = ((t - delay - 0.9) % 1.4) / 1.4;
      ctx.globalAlpha = 1 - f;
      ctx.beginPath(); ctx.arc(p.x, p.y + L + R * (0.15 + f * f * 1.1), wdt * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // a creamy ring of foam round the rim
  for (let i = 0; i <= 8; i++) {
    const u = -r + (2 * r * i) / 8;
    const p = glassToScreen(gv, u, rim - 2);
    ctx.beginPath(); ctx.arc(p.x, p.y, R * (0.05 + 0.02 * ((i * 7) % 3)), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}
