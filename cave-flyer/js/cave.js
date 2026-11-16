// The procedurally generated cave: a ceiling and floor polyline plus rocks and
// gems. It's generated just ahead of the camera and dropped once it scrolls off
// the left edge, so it goes on forever.

import { lerp, clamp, rand, pick, circleHitsPolygon, distToSegment } from './geom.js';
import { SHIP_MAX_VY } from './ship.js';

export const SEG = 24;          // world px between wall points
const RAMP = 40000;             // world px of flying until full difficulty
const INTRO_START = 500;        // the cave is wide open before this...
const INTRO_LEN = 1500;         // ...and narrows to normal over this distance
const FIRST_ROCK = 1300;

export const difficultyAt = (x) => clamp(x / RAMP, 0, 1);
export const scrollSpeed = (d) => lerp(170, 320, d);
// Smallest opening a rock is allowed to leave.
const minPass = (d) => lerp(150, 105, d);

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

  addPoint() {
    const x = (this.x += SEG);
    const H = this.H;
    const d = difficultyAt(x);
    const intro = clamp((x - INTRO_START) / INTRO_LEN, 0, 1);

    this.gapPhase += 0.045;
    const wobble = 1 + 0.1 * Math.sin(this.gapPhase) + 0.06 * Math.sin(this.gapPhase * 2.3 + 1);
    const gap = lerp(H - 60, lerp(390, 240, d) * wobble, intro);

    // Drift the cave's center line toward a target that changes every so often,
    // never sloping faster than the ship can climb at the current speed.
    if (--this.segsToTarget <= 0) {
      const half = gap / 2 + 24;
      this.target = rand(half, H - half);
      this.segsToTarget = Math.round(rand(12, 34));
    }
    const maxStep = (0.45 * SHIP_MAX_VY * SEG) / scrollSpeed(d);
    this.center += clamp((this.target - this.center) * 0.1, -maxStep, maxStep);
    this.center = clamp(this.center, gap / 2 + 18, H - gap / 2 - 18);

    const top = this.center - gap / 2 + rand(-4, 4);
    const bot = this.center + gap / 2 + rand(-4, 4);
    this.points.push({ x, top, bot });

    if (x >= this.nextRockX) {
      this.spawnRock(x, top, bot, d);
    } else if (x >= this.nextGemX && x - this.lastRockX > 140 && this.nextRockX - x > 140) {
      this.gems.push({ x, y: rand(top + 40, bot - 40), phase: rand(0, Math.PI * 2) });
      this.nextGemX = x + rand(200, 420);
    }
  }

  spawnRock(x, top, bot, d) {
    const rock = this.designRock(x, top, bot, d);
    // Only place it if a ship coming through the previous rock's opening can
    // reach this one's in time; otherwise try again a little further on.
    if (!rock || !this.reachable(x, rock.bands, d)) {
      this.nextRockX = x + SEG * 2;
      return;
    }
    for (const [kind, poly] of rock.parts) this.addObstacle(kind, poly);
    this.lastRockX = x;
    this.lastBands = rock.bands;
    this.nextRockX = x + lerp(640, 300, d) * rand(0.8, 1.25) + (rock.parts.length > 1 ? 120 : 0);
  }

  // Picks a rock shape. Returns its polygons plus the open "bands" [lo, hi]
  // (y ranges) a ship can fly through at this x.
  designRock(x, top, bot, d) {
    const pass = minPass(d);
    const room = bot - top;
    const kinds = ['stalactite', 'stalagmite'];
    if (d > 0.12 && room - pass * 1.05 > 70) kinds.push('gate');
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
    const lenMax = Math.min(room - pass, room * 0.68);
    if (lenMax < 40) return null;
    const len = lenMax * rand(0.55, 1);
    return kind === 'stalactite'
      ? { parts: [[kind, spike(x, top, len, -1)]], bands: [[top + len, bot]] }
      : { parts: [[kind, spike(x, bot, len, 1)]], bands: [[top, bot - len]] };
  }

  reachable(x, bands, d) {
    if (!this.lastBands) return true;
    // Room to maneuver: the gap between rocks minus their widths and the ship's length.
    const run = Math.max(0, x - this.lastRockX - 150);
    const canClimb = (0.6 * SHIP_MAX_VY * run) / scrollSpeed(d);
    const margin = 14;
    let need = Infinity;
    for (const [lo1, hi1] of this.lastBands) {
      for (const [lo2, hi2] of bands) {
        need = Math.min(need, Math.max(0, lo2 + margin - (hi1 - margin), lo1 + margin - (hi2 - margin)));
      }
    }
    return need <= canClimb;
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
