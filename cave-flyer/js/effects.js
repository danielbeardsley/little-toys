// Particles (exhaust, explosions, sparkles) and the parallax starfield.

import { rand, pick } from './geom.js';

export class Particles {
  constructor() {
    this.list = [];
  }

  clear() {
    this.list.length = 0;
  }

  add(x, y, vx, vy, life, size, color, drag = 0) {
    this.list.push({ x, y, vx, vy, life, age: 0, size, color, drag });
  }

  burst(x, y, n, { colors, speed = [60, 300], life = [0.4, 1], size = [2, 5], drag = 1.5 }) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(speed[0], speed[1]);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life[0], life[1]), rand(size[0], size[1]), pick(colors), drag);
    }
  }

  update(dt) {
    const list = this.list;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.age += dt;
      if (p.age >= p.life) {
        list[i] = list[list.length - 1];
        list.pop();
        continue;
      }
      const damp = Math.exp(-p.drag * dt);
      p.vx *= damp;
      p.vy *= damp;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // Draws in world space; the caller translates by -camX.
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      const s = p.size * (0.5 + 0.5 * t);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.restore();
  }
}

export class Starfield {
  constructor(W, H) {
    this.W = W;
    this.layers = [
      { f: 0.05, size: 1, alpha: 0.35, n: 70 },
      { f: 0.15, size: 1.5, alpha: 0.55, n: 45 },
      { f: 0.35, size: 2, alpha: 0.85, n: 25 },
    ].map((l) => ({ ...l, stars: Array.from({ length: l.n }, () => [rand(0, W), rand(0, H)]) }));
  }

  draw(ctx, camX) {
    const W = this.W;
    ctx.fillStyle = '#ffffff';
    for (const l of this.layers) {
      ctx.globalAlpha = l.alpha;
      const shift = camX * l.f;
      for (const [x, y] of l.stars) {
        const sx = (((x - shift) % W) + W) % W;
        ctx.fillRect(sx, y, l.size, l.size);
      }
    }
    ctx.globalAlpha = 1;
  }
}
