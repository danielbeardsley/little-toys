// The player's ship. Position is in screen space: with the stick centered the
// ship holds still on screen, which means it travels exactly as fast as the cave.

import { clamp } from './geom.js';

export const SHIP_MAX_VX = 280;  // px/s relative to the scrolling world
export const SHIP_MAX_VY = 300;
const RESPONSE = 12;             // how quickly velocity follows the stick (1/s)

// Hit circles in ship-local space [x, y, r]. A bit smaller than the drawing so
// near-misses feel like near-misses.
const HIT_CIRCLES = [[-12, 0, 8], [2, 0, 9], [16, 0, 6]];

export class Ship {
  constructor() {
    this.reset(150, 270);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.tilt = 0;
    this.thrust = 0;
    this.invuln = 0;
    this.visible = true;
  }

  update(dt, input, W, H) {
    const k = 1 - Math.exp(-RESPONSE * dt);
    this.vx += (input.x * SHIP_MAX_VX - this.vx) * k;
    this.vy += (input.y * SHIP_MAX_VY - this.vy) * k;
    this.x = clamp(this.x + this.vx * dt, 24, W - 40);
    this.y = clamp(this.y + this.vy * dt, 12, H - 12);
    this.tilt = (this.vy / SHIP_MAX_VY) * 0.28;
    this.thrust = this.vx / SHIP_MAX_VX;
  }

  // World-space hit circles, given the camera's world x.
  hitCircles(camX) {
    const c = Math.cos(this.tilt);
    const s = Math.sin(this.tilt);
    return HIT_CIRCLES.map(([x, y, r]) => [camX + this.x + x * c - y * s, this.y + x * s + y * c, r]);
  }

  draw(ctx, time) {
    if (!this.visible) return;
    ctx.save();
    if (this.invuln > 0 && Math.floor(time * 12) % 2) ctx.globalAlpha = 0.35;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt);
    drawShip(ctx, this.thrust, time);
    ctx.restore();
  }
}

// Draws a ship pointing right, centered on the origin, about 50px long.
export function drawShip(ctx, thrust = 0, time = 0) {
  // Engine flame: longer when pushing forward, short when braking.
  const len = 14 + 12 * (thrust + 1) + Math.sin(time * 60) * 3 + Math.random() * 3;
  const flame = ctx.createLinearGradient(-20, 0, -20 - len, 0);
  flame.addColorStop(0, '#fff7d6');
  flame.addColorStop(0.3, '#ffc93f');
  flame.addColorStop(1, 'rgba(255, 80, 40, 0)');
  ctx.fillStyle = flame;
  ctx.beginPath();
  ctx.moveTo(-18, -6);
  ctx.quadraticCurveTo(-20 - len, 0, -18, 6);
  ctx.closePath();
  ctx.fill();

  // Fins.
  ctx.fillStyle = '#ff5d73';
  ctx.beginPath();
  ctx.moveTo(-4, -8); ctx.lineTo(-18, -20); ctx.lineTo(-24, -18); ctx.lineTo(-16, -5);
  ctx.closePath();
  ctx.moveTo(-4, 8); ctx.lineTo(-18, 20); ctx.lineTo(-24, 18); ctx.lineTo(-16, 5);
  ctx.closePath();
  ctx.fill();

  // Body.
  const body = ctx.createLinearGradient(0, -12, 0, 12);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.6, '#c9d2e8');
  body.addColorStop(1, '#8792b3');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(27, 0);
  ctx.bezierCurveTo(14, -11, -4, -12, -18, -8);
  ctx.lineTo(-21, 0);
  ctx.lineTo(-18, 8);
  ctx.bezierCurveTo(-4, 12, 14, 11, 27, 0);
  ctx.closePath();
  ctx.fill();

  // Stripe and cockpit.
  ctx.fillStyle = '#ff5d73';
  ctx.fillRect(-12, -1.5, 14, 3);
  ctx.fillStyle = '#3ec7ff';
  ctx.beginPath();
  ctx.ellipse(9, -3, 8, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.ellipse(11, -4.5, 3, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();
}
