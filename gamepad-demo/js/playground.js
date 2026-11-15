// A tiny multiplayer toy: each connected gamepad drives a blob.
(function () {
  'use strict';
  const canvas = document.getElementById('playground');
  const ctx = canvas.getContext('2d');
  const wallRumble = document.getElementById('wall-rumble');
  const COLORS = ['#ff5d73', '#3ec7ff', '#ffc93f', '#6fdc8c', '#b48cff', '#ff9b4a'];
  const DEADZONE = 0.15;
  const players = new Map();
  const particles = [];
  let W = 0;
  let H = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = rect.width;
    H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // Rescale so the stick reads 0 inside the deadzone and still reaches 1 at the edge.
  const dz = (v) => {
    v = v || 0;
    return Math.abs(v) < DEADZONE ? 0 : (v - Math.sign(v) * DEADZONE) / (1 - DEADZONE);
  };
  const val = (gp, i) => GP.buttonValue(gp.buttons[i]);
  const down = (gp, i) => !!(gp.buttons[i] && gp.buttons[i].pressed);

  function spawnPlayer(gp) {
    const p = {
      index: gp.index, x: W / 2 + (gp.index - 1.5) * 90, y: H / 2,
      vx: 0, vy: 0, color: gp.index % COLORS.length, size: 26,
      lookX: 0, lookY: 0, boing: 0, prev: [], lastBump: 0,
    };
    players.set(gp.index, p);
    burst(p, 24);
    return p;
  }

  function burst(p, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 80 + Math.random() * 260;
      particles.push({
        x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6 + Math.random() * 0.6, age: 0, color: COLORS[p.color],
      });
    }
  }

  function step(p, gp, dt) {
    const pressedNow = gp.buttons.map((b) => b.pressed);
    const edge = (i) => pressedNow[i] && !p.prev[i];

    let mx = dz(gp.axes[0]) + val(gp, 15) - val(gp, 14);
    let my = dz(gp.axes[1]) + val(gp, 13) - val(gp, 12);
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }

    const ACCEL = 1500;
    p.vx += mx * ACCEL * dt;
    p.vy += my * ACCEL * dt;
    const friction = Math.pow(0.04, dt);
    p.vx *= friction;
    p.vy *= friction;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const target = 26 + val(gp, 7) * 34 - val(gp, 6) * 14;
    p.size += (target - p.size) * Math.min(1, dt * 12);

    // Bounce off the walls (and rumble the controller a little).
    const r = p.size;
    let hit = 0;
    if (p.x < r) { hit = Math.max(hit, -p.vx); p.x = r; p.vx = -p.vx * 0.6; }
    if (p.x > W - r) { hit = Math.max(hit, p.vx); p.x = W - r; p.vx = -p.vx * 0.6; }
    if (p.y < r) { hit = Math.max(hit, -p.vy); p.y = r; p.vy = -p.vy * 0.6; }
    if (p.y > H - r) { hit = Math.max(hit, p.vy); p.y = H - r; p.vy = -p.vy * 0.6; }
    const now = performance.now();
    if (hit > 120 && wallRumble.checked && now - p.lastBump > 120) {
      p.lastBump = now;
      GP.bump(p.index, Math.min(1, hit / 700), 80);
    }

    // Eyes follow the right stick, or drift toward the direction of travel.
    let lx = dz(gp.axes[2]);
    let ly = dz(gp.axes[3]);
    if (!lx && !ly) {
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 20) { lx = p.vx / sp * Math.min(1, sp / 300); ly = p.vy / sp * Math.min(1, sp / 300); }
    }
    p.lookX += (lx - p.lookX) * Math.min(1, dt * 14);
    p.lookY += (ly - p.lookY) * Math.min(1, dt * 14);

    if (edge(0)) burst(p, 40);
    if (edge(1)) p.color = (p.color + 1) % COLORS.length;
    if (edge(3)) p.boing = 1;
    p.boing = Math.max(0, p.boing - dt * 2.2);
    p.prev = pressedNow;
  }

  function drawPlayer(p) {
    const color = COLORS[p.color];
    const wobble = Math.sin(p.boing * Math.PI * 4) * p.boing * 0.35;
    const sx = 1 + wobble;
    const sy = 1 - wobble;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(sx, sy);

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(0, p.size * 0.9, p.size * 0.8, p.size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();

    const er = p.size * 0.28;
    for (const side of [-1, 1]) {
      const ex = side * p.size * 0.36;
      const ey = -p.size * 0.15;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, er, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1a22';
      ctx.beginPath();
      ctx.arc(ex + p.lookX * er * 0.5, ey + p.lookY * er * 0.5, er * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = GP.cssVar('--text');
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('P' + (p.index + 1), p.x, p.y + p.size + 20);
  }

  GP.playground = {
    update(gamepads, dt) {
      if (!W || !H) return;
      const seen = new Set();
      for (const gp of gamepads) {
        if (!gp || !gp.connected) continue;
        seen.add(gp.index);
        step(players.get(gp.index) || spawnPlayer(gp), gp, dt);
      }
      for (const idx of players.keys()) if (!seen.has(idx)) players.delete(idx);

      ctx.clearRect(0, 0, W, H);

      for (let i = particles.length - 1; i >= 0; i--) {
        const q = particles[i];
        q.age += dt;
        if (q.age >= q.life) { particles.splice(i, 1); continue; }
        q.vx *= Math.pow(0.1, dt);
        q.vy = q.vy * Math.pow(0.1, dt) + 300 * dt;
        q.x += q.vx * dt;
        q.y += q.vy * dt;
        ctx.globalAlpha = 1 - q.age / q.life;
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      for (const p of players.values()) drawPlayer(p);

      if (!players.size) {
        ctx.fillStyle = GP.cssVar('--muted');
        ctx.font = '500 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Connect a controller to play', W / 2, H / 2);
      }
    },
  };
})();
