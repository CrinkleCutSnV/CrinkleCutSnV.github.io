// Sparks, smoke, damage numbers, ground marks and commentary lines: shared by Robot Rumble and the Melee.
import { BODIES, DRIVES, DT, ZONES, type BattleEvent, type Bot, type ZoneId } from './sim';
import { INK, TEAM, drawTrail, type Mark } from './draw';
import { esc } from './workshop';

export const pickOne = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; colour: string; size: number }
interface Floater { x: number; y: number; text: string; life: number; colour: string; big: boolean }
export const TRAIL_LIFE = 2.6;

export class Fx {
  sparks: Spark[] = [];
  floaters: Floater[] = [];
  shake = 0;
  odo: number[] = [];
  trails: Mark[][] = [];
  private footStep: number[] = [];
  private steps = 0;

  reset(n: number) {
    this.sparks = []; this.floaters = []; this.shake = 0; this.steps = 0;
    this.odo = Array(n).fill(0); this.trails = Array.from({ length: n }, () => []); this.footStep = Array(n).fill(0);
  }
  burst(x: number, y: number, n: number, colours: string[], power = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (8 + Math.random() * 26) * power;
      const max = 0.25 + Math.random() * 0.35;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: max, max, colour: pickOne(colours), size: 0.35 + Math.random() * 0.5 });
    }
  }
  /** Sparks and numbers for something that happened in the fight. */
  event(e: BattleEvent, bots: Bot[], size: number) {
    const x = e.x ?? size / 2, y = e.y ?? size / 2;
    const colour = TEAM[e.by]?.main ?? '#ffffff';
    if (e.kind === 'hit') {
      const d = e.dmg ?? 0;
      this.burst(x, y, Math.min(34, 8 + d * 0.8), ['#fff3a3', '#f2c94c', '#ff9f43', '#ffffff'], e.match === 'strong' ? 1.3 : 1);
      const tag = e.dir === 'rear' ? ' ×2' : e.dir === 'side' ? ' ×1.5' : '';
      this.floaters.push({ x, y: y - 3, text: `−${Math.round(d)}${tag}`, life: 1.1, colour, big: d >= 25 || e.dir === 'rear' });
      this.shake = Math.max(this.shake, Math.min(1.6, d / 22));
    } else if (e.kind === 'ram') {
      this.burst(x, y, 8, ['#ffffff', '#d3dbe4'], 0.6);
      this.floaters.push({ x, y: y - 3, text: 'SHOVE!', life: 0.8, colour, big: false });
    } else if (e.kind === 'dodge') {
      this.floaters.push({ x, y: y - 4, text: 'dodge!', life: 0.8, colour: '#ffffff', big: false });
    } else if (e.kind === 'miss') {
      this.floaters.push({ x, y: y - 4, text: 'whiff', life: 0.6, colour: 'rgba(255,255,255,.85)', big: false });
    } else if (e.kind === 'ko') {
      const v = bots[e.on!];
      this.burst(v.x, v.y, 60, ['#ff9f43', '#e5483b', '#f2c94c', '#5c5f6e', '#2b2d42'], 1.4);
      this.shake = 2.2;
    }
  }
  update(dt: number, bots: Bot[] | null) {
    for (const s of this.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= Math.exp(-dt * 4); s.vy *= Math.exp(-dt * 4); s.life -= dt; }
    this.sparks = this.sparks.filter((s) => s.life > 0);
    for (const f of this.floaters) { f.y -= 7 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    this.shake = Math.max(0, this.shake - dt * 4);
    // smoke from badly hurt robots (and wrecks)
    if (bots && Math.random() < dt * 14) for (const b of bots) if (b.hp / b.maxHp < 0.3) this.sparks.push({ x: b.x + (Math.random() - 0.5) * 3, y: b.y, vx: (Math.random() - 0.5) * 3, vy: -6, life: 0.9, max: 0.9, colour: 'smoke', size: 1.2 });
  }
  /** After a sim step: wheel/leg odometers and ground marks (tread and tyre lines, footprints, air rings). */
  track(bots: Bot[], before: number[]) {
    this.steps++;
    bots.forEach((bot, i) => {
      this.odo[i] += Math.hypot(bot.x - before[2 * i], bot.y - before[2 * i + 1]);
      const tr = this.trails[i];
      for (const m of tr) m.age += DT;
      while (tr.length && tr[0].age > TRAIL_LIFE) tr.shift();
      if (bot.hp <= 0) return;
      if (bot.build.drive === 'legs') {
        const n = Math.floor((bot.gait / (BODIES[bot.build.body].radius * 0.9)) * 2.2 / Math.PI);
        if (n !== this.footStep[i]) { this.footStep[i] = n; tr.push({ x: bot.x, y: bot.y, h: bot.heading, age: 0, foot: n % 2 ? 1 : -1 }); }
      } else if (this.steps % 3 === 0 && (Math.hypot(bot.vx, bot.vy) > 0.5 || Math.abs(bot.omega) > 0.3)) tr.push({ x: bot.x, y: bot.y, h: bot.heading, age: 0 });
    });
  }
  drawTrails(ctx: CanvasRenderingContext2D, bots: Bot[], order: number[], k: number) {
    for (const i of order) drawTrail(ctx, bots[i].build.drive, bots[i].build.body, this.trails[i], k, TRAIL_LIFE);
  }
  /** Sparks, smoke and floating numbers, on top of everything. */
  drawTop(ctx: CanvasRenderingContext2D, k: number) {
    for (const sp of this.sparks) {
      const a = Math.max(0, sp.life / sp.max);
      if (sp.colour === 'smoke') { ctx.fillStyle = `rgba(80,80,90,${0.35 * a})`; ctx.beginPath(); ctx.arc(sp.x * k, sp.y * k, sp.size * k * (2 - a), 0, 7); ctx.fill(); continue; }
      ctx.globalAlpha = a; ctx.strokeStyle = sp.colour; ctx.lineWidth = sp.size * k * 0.7; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(sp.x * k, sp.y * k); ctx.lineTo((sp.x - sp.vx * 0.03) * k, (sp.y - sp.vy * 0.03) * k); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of this.floaters) {
      const a = Math.min(1, f.life * 2.5);
      ctx.globalAlpha = a;
      ctx.font = `900 ${Math.max(f.big ? 18 : 13, (f.big ? 5 : 3.6) * k)}px system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, 0.9 * k); ctx.strokeStyle = INK; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, f.x * k, f.y * k); ctx.fillStyle = f.colour; ctx.fillText(f.text, f.x * k, f.y * k);
    }
    ctx.globalAlpha = 1;
  }
}

/** A dotted ring in the robot's colour, so you can tell who's who at a glance. */
export function teamRing(ctx: CanvasRenderingContext2D, b: Bot, k: number) {
  ctx.strokeStyle = TEAM[b.side].main; ctx.lineWidth = Math.max(2, 0.45 * k); ctx.setLineDash([1.2 * k, 1 * k]);
  ctx.beginPath(); ctx.arc(b.x * k, b.y * k, (BODIES[b.build.body].radius + 1.8) * k, 0, 7); ctx.stroke(); ctx.setLineDash([]);
}

// ---- commentary ----
export class Commentary {
  private last = -9;
  private lastZone: Record<string, number> = {};
  constructor(private log: HTMLElement, private max = 5) {}
  reset() { this.log.innerHTML = ''; this.last = -9; this.lastZone = {}; }
  say(html: string, t: number, important = false) {
    if (!important && t - this.last < 1.1) return;
    this.last = t;
    const li = document.createElement('li');
    li.innerHTML = `<span class="t">${Math.floor(t)}s</span>${html}`;
    this.log.prepend(li);
    while (this.log.children.length > this.max) this.log.lastElementChild!.remove();
  }
  /** The everyday lines (hits, dodges, misses, rams, openings, terrain). Returns false for anything else. */
  everyday(e: BattleEvent, bots: Bot[], name: (side: number) => string) {
    const A = name(e.by), B = e.on !== undefined ? name(e.on) : '';
    switch (e.kind) {
      case 'hit': {
        const big = e.dir === 'rear' || e.match === 'strong' || (e.dmg ?? 0) >= 30;
        let s = `${A} ${pickOne(HIT_VERB[e.weapon!])} ${B} for <b>${Math.round(e.dmg!)}</b>`;
        if (e.dir === 'rear') s += pickOne([' — right up the back! Double damage!', ' from behind! Cheeky, and double damage.', ' — never saw it coming! ×2']);
        else if (e.dir === 'side') s += pickOne([' in the side. ×1.5', ' — a lovely side swipe. ×1.5']);
        else s += '.';
        if (e.match === 'strong') s += pickOne([' That’s its weak spot!', ' Ooh, that’ll leave a mark.', ' Textbook.']);
        else if (e.match === 'weak') s += pickOne([' …barely a scratch.', ' It just bounces off.', ' Not very effective.']);
        if (e.weapon === 'flipper' && e.match !== 'weak') s += ' Over it goes!';
        this.say(s, e.t, big);
        return true;
      }
      case 'dodge': this.say(pickOne([`${B} skips clear!`, `${B} sidesteps ${A}!`, `Missed! ${B} is too nippy.`]), e.t); return true;
      case 'miss': this.say(pickOne([`${A} swings at thin air.`, `${A} whiffs it!`, `Too early from ${A}.`]), e.t); return true;
      case 'ram': this.say(pickOne([`${A} scoops up ${B} with the wedge!`, `${A} rams ${B} across the floor!`]), e.t); return true;
      case 'opening': this.say(pickOne([`${A} spots an opening…`, `${A} pounces!`]), e.t); return true;
      case 'zone': {
        const bot = bots[e.by];
        const key = `${e.by}:${e.zone}`;
        if ((this.lastZone[key] ?? -99) > e.t - 8) return true;
        this.lastZone[key] = e.t;
        if (DRIVES[bot.build.drive].slow === e.zone) this.say(`${A} is ${({ sand: 'bogged down in the sand', ice: 'slipping all over the ice', steel: 'clattering about on the steel', rubble: 'stumbling through the rubble' } as Record<ZoneId, string>)[e.zone!]}.`, e.t);
        else if (DRIVES[bot.build.drive].fast === e.zone) this.say(`${A} is flying on the ${ZONES[e.zone!].name.toLowerCase()}!`, e.t);
        return true;
      }
    }
    return false;
  }
}
export const HIT_VERB: Record<string, string[]> = {
  flipper: ['flips', 'launches', 'tosses', 'catapults'],
  spinner: ['shreds', 'carves into', 'slices', 'chews up'],
  hammer: ['wallops', 'clobbers', 'bonks', 'flattens'],
  claw: ['grabs', 'squeezes', 'crushes', 'pinches'],
};
/** A robot's name for the commentary, in its colour. */
export const nameTag = (bots: Bot[], side: number) => `<span class="c${side}">${esc(bots[side].name)}</span>`;
