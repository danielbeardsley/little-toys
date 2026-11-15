// One card per connected gamepad: info, controller picture, raw buttons/axes, rumble.
(function () {
  'use strict';
  const h = GP.h;
  const TRAIL = 90; // points kept in each stick-pad trail

  function buttonTile(i, std) {
    const fill = h('div', { class: 'tile-fill' });
    const value = h('span', { class: 'tile-value', text: '0.00' });
    const name = std && GP.STANDARD_BUTTONS[i];
    const tile = h('div', { class: 'tile', title: `buttons[${i}]` },
      fill,
      h('span', { class: 'tile-index', text: i }),
      name ? h('span', { class: 'tile-name', text: name }) : null,
      value,
    );
    return {
      tile,
      update(b) {
        const v = GP.buttonValue(b);
        tile.classList.toggle('pressed', b.pressed);
        tile.classList.toggle('touched', !!b.touched);
        fill.style.transform = `scaleY(${v})`;
        value.textContent = v.toFixed(2);
      },
    };
  }

  function axisRow(i, std) {
    const fill = h('div', { class: 'axis-fill' });
    const value = h('span', { class: 'axis-value mono', text: '+0.00' });
    const label = `axes[${i}]` + (std && GP.STANDARD_AXES[i] ? ` · ${GP.STANDARD_AXES[i]}` : '');
    const row = h('div', { class: 'axis' },
      h('span', { class: 'axis-label', text: label }),
      h('div', { class: 'axis-track' }, fill, h('div', { class: 'axis-zero' })),
      value,
    );
    return {
      row,
      update(v) {
        const pct = Math.min(1, Math.abs(v)) * 50;
        fill.style.left = (v < 0 ? 50 - pct : 50) + '%';
        fill.style.width = pct + '%';
        value.textContent = GP.fmt(v);
      },
    };
  }

  // 2D view of an axis pair, with a fading trail so you can see the stick's range shape.
  function xyPad(ax, ay, std) {
    const size = 140;
    const dpr = window.devicePixelRatio || 1;
    const canvas = h('canvas', { class: 'xy-canvas', width: size * dpr, height: size * dpr });
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    const dot = h('div', { class: 'xy-dot' });
    const readout = h('div', { class: 'xy-readout mono' });
    const title = std && ax === 0 ? 'Left stick' : std && ax === 2 ? 'Right stick' : `axes[${ax}] / axes[${ay}]`;
    const wrap = h('div', { class: 'xy' },
      h('div', { class: 'xy-title', text: title }),
      h('div', { class: 'xy-field' }, canvas, dot),
      readout,
    );
    const pts = [];
    return {
      wrap,
      update(x, y) {
        const px = (x + 1) / 2 * size;
        const py = (y + 1) / 2 * size;
        const last = pts[pts.length - 1];
        if (!last || last[0] !== px || last[1] !== py) pts.push([px, py]);
        else if (pts.length > 1) pts.shift(); // let the trail drain when idle
        if (pts.length > TRAIL) pts.shift();

        ctx.clearRect(0, 0, size, size);
        ctx.strokeStyle = GP.cssVar('--accent');
        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        for (let i = 1; i < pts.length; i++) {
          ctx.globalAlpha = i / pts.length;
          ctx.beginPath();
          ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
          ctx.lineTo(pts[i][0], pts[i][1]);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        dot.style.left = (x + 1) * 50 + '%';
        dot.style.top = (y + 1) * 50 + '%';
        const mag = Math.hypot(x, y);
        readout.textContent = `x ${GP.fmt(x)}  y ${GP.fmt(y)}\ndistance ${mag.toFixed(2)}`;
      },
    };
  }

  GP.createCard = function (gp) {
    const std = gp.mapping === 'standard';
    const controller = GP.createControllerSVG();

    const tsEl = h('dd', { class: 'mono', text: '—' });
    const hzEl = h('dd', { class: 'mono', text: '—' });
    const connEl = h('dd', { text: 'yes' });
    const meta = h('dl', { class: 'meta' },
      h('div', {}, h('dt', { text: 'index' }), h('dd', { class: 'mono', text: gp.index })),
      h('div', {}, h('dt', { text: 'mapping' }), h('dd', { class: 'mono', text: gp.mapping ? `"${gp.mapping}"` : '"" (unknown)' })),
      h('div', {}, h('dt', { text: 'buttons' }), h('dd', { class: 'mono', text: gp.buttons.length })),
      h('div', {}, h('dt', { text: 'axes' }), h('dd', { class: 'mono', text: gp.axes.length })),
      h('div', {}, h('dt', { text: 'connected' }), connEl),
      h('div', {}, h('dt', { text: 'timestamp' }), tsEl),
      h('div', { title: 'How often gamepad.timestamp changes. Many browsers only bump it when input changes, so this is 0 while idle.' },
        h('dt', { text: 'updates / sec' }), hzEl),
      h('div', {}, h('dt', { text: 'vibration' }), h('dd', { class: 'mono', text: GP.describeVibration(gp) })),
    );

    const tiles = gp.buttons.map((_, i) => buttonTile(i, std));
    const axes = gp.axes.map((_, i) => axisRow(i, std));
    const pads = [];
    for (let i = 0; i + 1 < gp.axes.length; i += 2) pads.push({ ax: i, ay: i + 1, pad: xyPad(i, i + 1, std) });

    const viz = h('div', { class: 'viz' }, controller.svg);
    if (!std) {
      viz.prepend(h('p', { class: 'note small', text:
        `mapping is "${gp.mapping}", not "standard": the browser doesn't know this layout, ` +
        'so the picture is a guess. The raw panels are the truth.' }));
    }

    const root = h('section', { class: 'card panel' },
      h('div', { class: 'card-head' },
        h('span', { class: 'badge', text: 'P' + (gp.index + 1) }),
        h('h2', { class: 'pad-id', text: gp.id }),
      ),
      meta,
      h('div', { class: 'card-body' },
        viz,
        h('div', { class: 'raw' },
          h('h3', { text: 'Buttons' }),
          h('div', { class: 'tiles' }, ...tiles.map((t) => t.tile)),
          h('h3', { text: 'Axes' }),
          h('div', { class: 'axes' }, ...axes.map((a) => a.row)),
          pads.length ? h('div', { class: 'xys' }, ...pads.map((p) => p.pad.wrap)) : null,
        ),
      ),
      GP.createRumble(gp),
    );

    let lastTs = null;
    let changes = 0;
    let windowStart = performance.now();

    return {
      id: gp.id,
      root,
      update(gp) {
        controller.update(gp);
        gp.buttons.forEach((b, i) => tiles[i] && tiles[i].update(b));
        gp.axes.forEach((v, i) => axes[i] && axes[i].update(v));
        for (const p of pads) p.pad.update(gp.axes[p.ax], gp.axes[p.ay]);

        connEl.textContent = gp.connected ? 'yes' : 'no';
        tsEl.textContent = gp.timestamp.toFixed(1) + ' ms';
        if (gp.timestamp !== lastTs) { changes++; lastTs = gp.timestamp; }
        const now = performance.now();
        if (now - windowStart >= 1000) {
          hzEl.textContent = Math.round(changes * 1000 / (now - windowStart));
          changes = 0;
          windowStart = now;
        }
      },
      destroy() { root.remove(); },
    };
  };
})();
