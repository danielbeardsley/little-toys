// Cave Flyer: game states, the frame loop, and drawing.

import { Cave, SEG, difficultyAt, scrollSpeed } from './cave.js';
import { Ship, drawShip } from './ship.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { Particles, Starfield } from './effects.js';
import { rand } from './geom.js';

const W = 960;
const H = 540;
const START_LIVES = 3;
const RESPAWN_X = 150;
const RESPAWN_SAFE = 2.5;   // seconds of blinking invulnerability
const GEM_POINTS = 25;
const MILESTONE = 500;      // meters
const BEST_KEY = 'cave-flyer.best';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let scale = 1;

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  scale = canvas.width / W;
}
new ResizeObserver(resize).observe(canvas);
resize();

const input = new Input();
const sound = new Sound();
const stars = new Starfield(W, H);
const particles = new Particles();
addEventListener('keydown', () => sound.unlock());
addEventListener('pointerdown', () => sound.unlock());

let best = 0;
try { best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* storage blocked */ }

const g = {
  state: 'title',  // title | playing | dying | gameover
  paused: false,
  cave: null,
  ship: new Ship(),
  camX: 0,
  lives: 0,
  gems: 0,
  timer: 0,
  shake: 0,
  time: 0,
  milestone: 0,
  banner: null,
  newBest: false,
};

const meters = () => Math.floor(g.camX / 20);
const score = () => meters() + g.gems * GEM_POINTS;

function newWorld() {
  g.cave = new Cave(H);
  g.camX = 0;
  g.cave.ensure(W + SEG * 4);
  particles.clear();
  g.lives = START_LIVES;
  g.gems = 0;
  g.milestone = 0;
  g.banner = null;
  g.newBest = false;
}

function startGame() {
  newWorld();
  g.state = 'playing';
  g.paused = false;
  spawnShip(0);
  sound.launch();
}

function spawnShip(invuln) {
  const wx = g.camX + RESPAWN_X;
  g.ship.reset(RESPAWN_X, (g.cave.topAt(wx) + g.cave.botAt(wx)) / 2);
  g.ship.invuln = invuln;
}

function scrollWorld(dt) {
  g.camX += scrollSpeed(difficultyAt(g.camX)) * dt;
  g.cave.ensure(g.camX + W + SEG * 4);
  g.cave.prune(g.camX - 200);
}

function crash() {
  const s = g.ship;
  const wx = g.camX + s.x;
  particles.burst(wx, s.y, 90, {
    colors: ['#ffffff', '#ffe08a', '#ffb13b', '#ff6a3d', '#ff3d5a'],
    speed: [40, 420], life: [0.4, 1.3], size: [2, 6],
  });
  particles.burst(wx, s.y, 24, { colors: ['#c9d2e8', '#ff5d73'], speed: [80, 260], life: [0.8, 1.6], size: [3, 7] });
  sound.crash();
  input.rumble(1, 0.8, 450);
  g.shake = 0.45;
  g.lives--;
  g.state = 'dying';
  g.timer = 1.4;
  s.visible = false;
}

function afterCrash() {
  if (g.lives > 0) {
    spawnShip(RESPAWN_SAFE);
    g.state = 'playing';
    return;
  }
  g.state = 'gameover';
  g.timer = 1;
  if (score() > best) {
    best = score();
    g.newBest = true;
    try { localStorage.setItem(BEST_KEY, String(best)); } catch { /* storage blocked */ }
  }
  sound.gameOver();
}

function updateShip(dt) {
  const s = g.ship;
  s.update(dt, input, W, H);

  // Exhaust: particles left in world space, so they stream out behind as the cave scrolls.
  const speed = scrollSpeed(difficultyAt(g.camX));
  if (Math.random() < 0.9) {
    particles.add(g.camX + s.x - 22, s.y + rand(-3, 3), speed * 0.25 + rand(-30, 30), rand(-20, 20),
      rand(0.2, 0.45), rand(2, 4), Math.random() < 0.5 ? '#ffb13b' : '#ff6a3d', 1);
  }

  const circles = s.hitCircles(g.camX);
  const hit = circles.some(([x, y, r]) => g.cave.hitsCircle(x, y, r));
  if (s.invuln > 0) {
    s.invuln -= dt;
    // Stay a ghost until clear, so a respawn can never land inside a rock.
    if (s.invuln <= 0 && hit) s.invuln = 0.1;
  } else if (hit) {
    crash();
    return;
  }

  const mid = circles[1];
  for (const gem of g.cave.collectGems(mid[0], mid[1], 22)) {
    g.gems++;
    sound.gem();
    input.rumble(0, 0.35, 60);
    particles.burst(gem.x, gem.y, 18, {
      colors: ['#ffffff', '#7df9ff', '#ff8af0'], speed: [40, 180], life: [0.3, 0.7], size: [2, 4],
    });
  }

  const m = Math.floor(meters() / MILESTONE);
  if (m > g.milestone) {
    g.milestone = m;
    g.banner = { text: `${m * MILESTONE} m!`, t: 2 };
    sound.milestone();
  }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen?.().catch(() => {});
}

function update(dt) {
  input.poll();
  const p = input.pressed;
  if (p.confirm || p.pause) sound.unlock();
  if (p.mute) sound.toggleMute();
  if (p.fullscreen) toggleFullscreen();

  if (g.state === 'playing' || g.state === 'dying') {
    if (p.pause || (g.paused && p.confirm)) {
      g.paused = !g.paused;
      return;
    }
    if (g.paused) return;
  }

  g.time += dt;
  g.shake = Math.max(0, g.shake - dt);
  if (g.banner && (g.banner.t -= dt) <= 0) g.banner = null;

  switch (g.state) {
    case 'title':
      scrollWorld(dt * 0.7);
      if (p.confirm) startGame();
      break;
    case 'playing':
      scrollWorld(dt);
      updateShip(dt);
      break;
    case 'dying':
      scrollWorld(dt);
      if ((g.timer -= dt) <= 0) afterCrash();
      break;
    case 'gameover':
      scrollWorld(dt * 0.4);
      g.timer -= dt;
      if (g.timer <= 0 && p.confirm) startGame();
      break;
  }
  particles.update(dt);
}

// ---------- Drawing ----------

function caveColors() {
  const hue = (205 + g.camX * 0.004) % 360;
  return {
    fill: `hsl(${hue}, 30%, 13%)`,
    band: `hsl(${hue}, 35%, 22%)`,
    rim: `hsl(${hue}, 85%, 64%)`,
    glow: `hsla(${hue}, 90%, 60%, 0.22)`,
    bg: `hsl(${hue}, 45%, 5%)`,
  };
}

// Fills a closed rock path, adds a lighter inner band, then a glowing rim along `edge`.
function drawRock(fillPath, edgePath, colors) {
  ctx.fillStyle = colors.fill;
  ctx.fill(fillPath);
  ctx.save();
  ctx.clip(fillPath);
  ctx.strokeStyle = colors.band;
  ctx.lineWidth = 26;
  ctx.stroke(edgePath);
  ctx.restore();
  ctx.strokeStyle = colors.glow;
  ctx.lineWidth = 9;
  ctx.stroke(edgePath);
  ctx.strokeStyle = colors.rim;
  ctx.lineWidth = 2.5;
  ctx.stroke(edgePath);
}

function drawCave(colors) {
  const pts = g.cave.points;
  const cx = g.camX;
  for (const [key, outside] of [['top', -20], ['bot', H + 20]]) {
    const edge = new Path2D();
    const fill = new Path2D();
    fill.moveTo(pts[0].x - cx, outside);
    pts.forEach((p, i) => {
      const x = p.x - cx;
      if (i === 0) edge.moveTo(x, p[key]);
      else edge.lineTo(x, p[key]);
      fill.lineTo(x, p[key]);
    });
    fill.lineTo(pts[pts.length - 1].x - cx, outside);
    fill.closePath();
    drawRock(fill, edge, colors);
  }

  for (const o of g.cave.obstacles) {
    if (o.maxX < cx - 10 || o.minX > cx + W + 10) continue;
    const path = new Path2D();
    o.poly.forEach(([x, y], i) => (i ? path.lineTo(x - cx, y) : path.moveTo(x - cx, y)));
    path.closePath();
    drawRock(path, path, colors);
  }
}

function drawGems() {
  for (const gem of g.cave.gems) {
    const x = gem.x - g.camX;
    if (x < -30 || x > W + 30) continue;
    const y = gem.y + Math.sin(g.time * 3 + gem.phase) * 5;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 28);
    glow.addColorStop(0, 'rgba(125, 249, 255, 0.55)');
    glow.addColorStop(1, 'rgba(125, 249, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x - 28, y - 28, 56, 56);
    drawGem(x, y, 11, g.time * 2 + gem.phase);
  }
}

function drawGem(x, y, r, spin = 0) {
  const w = r * (0.55 + 0.45 * Math.abs(Math.cos(spin)));
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - r * 0.2);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y - r * 0.2);
  ctx.closePath();
  const grad = ctx.createLinearGradient(x - w, y - r, x + w, y + r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, '#7df9ff');
  grad.addColorStop(1, '#c264ff');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

function text(str, x, y, size, { color = '#ffffff', align = 'center', weight = 800 } = {}) {
  ctx.font = `${weight} ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(3, size / 7);
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.strokeText(str, x, y);
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

function drawHud() {
  text(`Score ${score()}`, 20, 28, 24, { align: 'left' });
  text(`${meters()} m`, 20, 56, 16, { align: 'left', color: '#b9c3e6', weight: 600 });
  drawGem(30, 84, 9, g.time * 2);
  text(`${g.gems}`, 46, 85, 18, { align: 'left', color: '#7df9ff' });

  const shown = g.lives - (g.state === 'playing' ? 1 : 0);
  for (let i = 0; i < shown; i++) {
    ctx.save();
    ctx.translate(W - 34 - i * 40, 30);
    ctx.scale(0.6, 0.6);
    drawShip(ctx, -1, g.time);
    ctx.restore();
  }
  if (g.banner) {
    ctx.globalAlpha = Math.min(1, g.banner.t * 2);
    text(g.banner.text, W / 2, 70, 40, { color: '#ffe08a' });
    ctx.globalAlpha = 1;
  }
  if (sound.muted) text('🔇', W - 24, H - 24, 18);
}

function dim(alpha = 0.55) {
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

const blink = () => Math.floor(g.time * 2.5) % 2 === 0;

function drawTitle() {
  dim(0.45);
  ctx.save();
  ctx.translate(W / 2 - 230, 150);
  ctx.rotate(Math.sin(g.time * 2) * 0.08);
  ctx.scale(1.6, 1.6);
  drawShip(ctx, 0.5, g.time);
  ctx.restore();
  text('CAVE FLYER', W / 2 + 30, 150, 76, { color: '#ffe08a', weight: 900 });
  text('Fly through the cave. Don’t touch the rocks! Grab the gems.', W / 2, 235, 22, { color: '#dfe6ff', weight: 600 });
  if (blink()) text(input.padCount ? 'Press  A  to launch' : 'Press  Space  to launch', W / 2, 310, 34);

  text('Steer: left stick / D-pad / arrow keys / WASD', W / 2, 385, 18, { color: '#b9c3e6', weight: 600 });
  text('Let go and the ship keeps pace with the cave', W / 2, 412, 18, { color: '#b9c3e6', weight: 600 });
  text('Pause: Start / P    ·    Fullscreen: View / F    ·    Sound: M', W / 2, 439, 16, { color: '#8f9acb', weight: 600 });

  const padMsg = input.padCount
    ? `🎮 ${input.padCount} controller${input.padCount > 1 ? 's' : ''} connected`
    : '🎮 Press any button on a controller to connect it';
  text(padMsg, W / 2, 490, 16, { color: input.padCount ? '#6fdc8c' : '#8f9acb', weight: 600 });
  if (best) text(`Best ${best}`, W - 20, 28, 20, { align: 'right', color: '#ffe08a' });
}

function drawGameOver() {
  dim(0.55);
  text('Out of ships!', W / 2, 150, 64, { color: '#ff8a9c', weight: 900 });
  text(`Score ${score()}`, W / 2, 235, 40);
  text(`${meters()} m flown  ·  ${g.gems} gems`, W / 2, 285, 22, { color: '#dfe6ff', weight: 600 });
  text(g.newBest ? '★ New best! ★' : `Best ${best}`, W / 2, 330, 26, { color: '#ffe08a' });
  if (g.timer <= 0 && blink()) {
    text(input.padCount ? 'Press  A  to fly again' : 'Press  Space  to fly again', W / 2, 410, 30);
  }
}

function drawPaused() {
  dim(0.55);
  text('Paused', W / 2, H / 2 - 30, 64, { weight: 900 });
  text(input.padCount ? 'Press  Start  to keep flying' : 'Press  P  or  Space  to keep flying', W / 2, H / 2 + 40, 24, { color: '#dfe6ff' });
}

function render() {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const colors = caveColors();
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  if (g.shake > 0 && !g.paused) {
    const m = g.shake * 18;
    ctx.translate(rand(-m, m), rand(-m, m));
  }
  stars.draw(ctx, g.camX);
  drawCave(colors);
  drawGems();
  ctx.save();
  ctx.translate(-g.camX, 0);
  particles.draw(ctx);
  ctx.restore();
  if (g.state === 'playing') g.ship.draw(ctx, g.time);
  ctx.restore();

  if (g.state !== 'title') drawHud();
  if (g.state === 'title') drawTitle();
  else if (g.state === 'gameover') drawGameOver();
  if (g.paused) drawPaused();
}

// Pause automatically if the tab is hidden or loses focus mid-flight.
function autoPause() {
  if (g.state === 'playing' || g.state === 'dying') g.paused = true;
}
document.addEventListener('visibilitychange', () => document.hidden && autoPause());
addEventListener('blur', autoPause);

newWorld();
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Handy for poking at the game from the dev console.
window.caveFlyer = g;
