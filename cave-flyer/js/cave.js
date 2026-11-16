// The procedurally generated cave: a ceiling and floor polyline plus rocks and
// gems. It's generated just ahead of the camera and dropped once it scrolls off
// the left edge, so it goes on forever.

import { lerp, clamp, rand, pick, circleHitsPolygon, distToSegment } from './geom.js';
import { SHIP_MAX_VY } from './ship.js';

export const SEG = 24;          // world px between wall points
const RAMP = 15000;             // world px until the walls reach full difficulty (~75 s)
const SPEED_RAMP = 30000;       // scroll speed ramps up more gently than the walls
const INTRO_START = 250;        // the cave is wide open before this...
const INTRO_LEN = 700;          // ...then settles into the real cave
const FIRST_ROCK = 1500;

export const difficultyAt = (x) => clamp(x / RAMP, 0, 1);
export const speedAt = (x) => lerp(170, 290, clamp(x / SPEED_RAMP, 0, 1));

// The walls carry the difficulty: the average opening narrows, and squeezes
// (tight stretches) get more frequent and longer.
const avgGap = (d) => lerp(330, 180, d);
const minGap = (d) => lerp(130, 88, d);
const squeezeChance = (d) => lerp(0.2, 0.55, d);
const squeezeSegs = (d) => lerp(5, 28, d);
const chamberChance = (d) => lerp(0.3, 0.15, d);
// Rocks only go in roomy stretches and always leave at least this much space.
const minPass = (d) => lerp(165, 130, d);

export class Cave {
  constructor(height) {
    this.H = height;
    this.points = [];    // { x, top, bot }
    this.obstacles = []; // { kind, poly, minX, maxX, minY, maxY }
    this.gems = [];      // { x, y, phase }
    this.x = -SEG * 2;
    this.center = height / 2;
    this.target = height / 2;
    this.segsToTarget = 20;
    this.gap = avgGap(0);
    this.section = { kind: 'normal', gap: avgGap(0), segs: 10 };
    this.gapPhase = rand(0, 10);
    this.nextRockX = FIRST_ROCK;
    this.lastRockX = -1e9;
    this.lastBands = null;
    this.nextGemX = 650;
  }

  ensure(maxX) {
    while (this.x < maxX) this.addPoint();
  }

  prune(minX) {
    let n = 0;
    while (n < this.points.length - 2 && this.points[n + 1].x < minX) n++;
    if (n) this.points.splice(0, n);
    this.obstacles = this.obstacles.filter((o) => o.maxX >= minX);
    this.gems = this.gems.filter((g) => g.x >= minX - 40);
  }

  // The cave is a chain of sections, each with a target opening and a length.
  nextSection(d) {
    const r = Math.random();
    const avg = avgGap(d);
    if (r < squeezeChance(d)) {
      this.section = {
        kind: 'squeeze',
        gap: Math.max(minGap(d), avg * rand(0.5, 0.72)),
        segs: Math.round(squeezeSegs(d) * rand(0.7, 1.3)),
      };
    } else if (r < squeezeChance(d) + chamberChance(d)) {
      this.section = { kind: 'chamber', gap: avg * rand(1.3, 1.7), segs: Math.round(rand(8, 20)) };
    } else {
      this.section = { kind: 'normal', gap: avg * rand(0.85, 1.15), segs: Math.round(rand(8, 22)) };
    }
  }

  addPoint() {
    const x = (this.x += SEG);
    const H = this.H;
    const d = difficultyAt(x);
    const intro = clamp((x - INTRO_START) / INTRO_LEN, 0, 1);
    // Wall speed limits, as shares of how far the ship can climb per segment
    // at the current scroll speed.
    const perSeg = (SHIP_MAX_VY * SEG) / speedAt(x);
    const centerMax = lerp(0.35, 0.5, d) * perSeg;
    const wallMax = lerp(0.45, 0.65, d) * perSeg;
    const sec = this.section;

    // Drift the center line toward a target that changes every so often (more
    // often, so twistier, as it gets harder).
    if (--this.segsToTarget <= 0) {
      const half = Math.min(sec.gap, this.gap) / 2 + 20;
      this.target = rand(half, H - half);
      this.segsToTarget = Math.round(rand(lerp(14, 7, d), lerp(34, 20, d)));
    }
    const step = clamp((this.target - this.center) * 0.1, -centerMax, centerMax);
    this.center += step;

    // Ease the opening toward the current section's size, but never so fast
    // that a wall (drift plus half the opening change) outruns the ship. A
    // section's length only counts down once the opening has arrived, so
    // squeezes last as long as they say.
    const gapMax = 2 * Math.max(0, wallMax - Math.abs(step));
    this.gap += clamp((sec.gap - this.gap) * 0.2, -gapMax, gapMax);
    if (Math.abs(this.gap - sec.gap) < 12 && --sec.segs <= 0) this.nextSection(d);
    this.gapPhase += 0.06;
    const gap = Math.min(H - 40, lerp(H - 60, this.gap * (1 + 0.04 * Math.sin(this.gapPhase)), intro));
    this.center = clamp(this.center, gap / 2 + 18, H - gap / 2 - 18);

    const top = this.center - gap / 2 + rand(-3, 3);
    const bot = this.center + gap / 2 + rand(-3, 3);
    this.points.push({ x, top, bot });

    const settled = sec.kind !== 'squeeze' && sec.segs >= 4 && Math.abs(this.gap - sec.gap) < 12;
    if (x >= this.nextRockX && settled) {
      this.spawnRock(x, top, bot, d);
    } else if (x >= this.nextGemX && x - this.lastRockX > 140 && this.nextRockX - x > 140) {
      const m = Math.min(40, (bot - top) / 2 - 6);
      this.gems.push({ x, y: rand(top + m, bot - m), phase: rand(0, Math.PI * 2) });
      this.nextGemX = x + rand(200, 420);
    }
  }

  spawnRock(x, top, bot, d) {
    const rock = this.designRock(x, top, bot, d);
    // Only place it if a ship coming through the previous rock's opening can
    // reach this one's in time; otherwise try again a little further on.
    if (!rock || !this.reachable(x, rock.bands)) {
      this.nextRockX = x + SEG * 2;
      return;
    }
    for (const [kind, poly] of rock.parts) this.addObstacle(kind, poly);
    this.lastRockX = x;
    this.lastBands = rock.bands;
    this.nextRockX = x + lerp(1000, 650, d) * rand(0.8, 1.3) + (rock.parts.length > 1 ? 120 : 0);
  }

  // Picks a rock shape. Returns its polygons plus the open "bands" [lo, hi]
  // (y ranges) a ship can fly through at this x.
  designRock(x, top, bot, d) {
    const pass = minPass(d);
    const room = bot - top;
    const kinds = ['stalactite', 'stalagmite'];
    if (d > 0.3 && room - pass * 1.05 > 70) kinds.push('gate');
    if (room > pass * 2 + 70) kinds.push('boulder', 'boulder');
    const kind = pick(kinds);

    if (kind === 'boulder') {
      const rMax = Math.min(62, (room - 2 * pass) / 2 / 1.05);
      const r = rand(Math.min(30, rMax), rMax);
      const cy = rand(top + pass + r * 1.05, bot - pass - r * 1.05);
      const poly = [];
      const n = 11;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand(-0.15, 0.15);
        const rr = r * rand(0.82, 1.05);
        poly.push([x + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
      }
      return { parts: [['boulder', poly]], bands: [[top, cy - r * 1.05], [cy + r * 1.05, bot]] };
    }
    if (kind === 'gate') {
      const total = room - pass * 1.05;
      const a = total * rand(0.25, 0.75);
      return {
        parts: [['stalactite', spike(x, top, a, -1)], ['stalagmite', spike(x + rand(-10, 10), bot, total - a, 1)]],
        bands: [[top + a, bot - (total - a)]],
      };
    }
    const lenMax = Math.min(room - pass, room * 0.6);
    if (lenMax < 60) return null;
    const len = lenMax * rand(0.55, 1);
    return kind === 'stalactite'
      ? { parts: [[kind, spike(x, top, len, -1)]], bands: [[top + len, bot]] }
      : { parts: [[kind, spike(x, bot, len, 1)]], bands: [[top, bot - len]] };
  }

  // Could a ship get from everywhere it might have been forced to be (the
  // last rock's openings, and the recent wall openings) into one of `bands`?
  reachable(x, bands) {
    const climbPerPx = (0.6 * SHIP_MAX_VY) / speedAt(x);
    const margin = 14;
    const need = (lo1, hi1) => Math.min(...bands.map(([lo2, hi2]) =>
      Math.max(0, lo2 + margin - (hi1 - margin), lo1 + margin - (hi2 - margin))));

    // Room to maneuver is the horizontal run minus rock widths and the ship's length.
    if (this.lastBands) {
      const run = Math.max(0, x - this.lastRockX - 170);
      if (Math.min(...this.lastBands.map(([lo, hi]) => need(lo, hi))) > climbPerPx * run) return false;
    }
    for (const p of this.points) {
      if (p.x < x - 600 || p.x >= x) continue;
      if (need(p.top, p.bot) > climbPerPx * Math.max(0, x - p.x - 110)) return false;
    }
    return true;
  }

  addObstacle(kind, poly) {
    const xs = poly.map((p) => p[0]);
    const ys = poly.map((p) => p[1]);
    this.obstacles.push({
      kind, poly,
      minX: Math.min(...xs), maxX: Math.max(...xs),
      minY: Math.min(...ys), maxY: Math.max(...ys),
    });
  }

  // Interpolated wall heights at world x.
  wallAt(x, key) {
    const pts = this.points;
    const f = (x - pts[0].x) / SEG;
    const i = clamp(Math.floor(f), 0, pts.length - 2);
    const t = clamp(f - i, 0, 1);
    return lerp(pts[i][key], pts[i + 1][key], t);
  }
  topAt(x) { return this.wallAt(x, 'top'); }
  botAt(x) { return this.wallAt(x, 'bot'); }

  hitsCircle(cx, cy, r) {
    if (cy < this.topAt(cx) || cy > this.botAt(cx)) return true;
    const pts = this.points;
    const i0 = clamp(Math.floor((cx - r - pts[0].x) / SEG), 0, pts.length - 2);
    const i1 = clamp(Math.ceil((cx + r - pts[0].x) / SEG), 0, pts.length - 1);
    for (let i = i0; i < i1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      if (distToSegment(cx, cy, a.x, a.top, b.x, b.top) < r) return true;
      if (distToSegment(cx, cy, a.x, a.bot, b.x, b.bot) < r) return true;
    }
    for (const o of this.obstacles) {
      if (cx + r < o.minX || cx - r > o.maxX || cy + r < o.minY || cy - r > o.maxY) continue;
      if (circleHitsPolygon(cx, cy, r, o.poly)) return true;
    }
    return false;
  }

  // Removes and returns the gems within reach of a circle.
  collectGems(cx, cy, r) {
    const taken = [];
    this.gems = this.gems.filter((g) => {
      const hit = Math.hypot(g.x - cx, g.y - cy) < r + 14;
      if (hit) taken.push(g);
      return !hit;
    });
    return taken;
  }
}

// A rocky spike growing from a wall at baseY. dir -1 hangs down from the
// ceiling, +1 grows up from the floor. The base is buried in the wall so a
// sloped wall never shows a gap under it.
function spike(x, baseY, len, dir) {
  const hw = rand(30, 52);
  const s = -dir; // +1 = downward
  const bury = 40;
  return [
    [x - hw, baseY - s * bury],
    [x + hw, baseY - s * bury],
    [x + hw * 0.45, baseY + s * len * 0.55],
    [x + rand(-6, 6), baseY + s * len],
    [x - hw * 0.4, baseY + s * len * 0.5],
  ];
}
