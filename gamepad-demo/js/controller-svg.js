// Draws a generic controller using the W3C "standard" button/axis layout and
// lights it up from a Gamepad snapshot.
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  let uid = 0;

  function el(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  }

  const BODY = 'M170 90 L430 90 C480 90 510 110 520 150 C540 220 560 300 545 340 ' +
    'C535 370 490 372 465 345 C440 318 420 300 380 300 L220 300 C180 300 160 318 135 345 ' +
    'C110 372 65 370 55 340 C40 300 60 220 80 150 C90 110 120 90 170 90 Z';

  // Index = position in gamepad.buttons for mapping === 'standard'.
  const BUTTONS = [
    { i: 0, name: 'A / Cross (bottom face)', label: 'A', circle: [450, 205, 16] },
    { i: 1, name: 'B / Circle (right face)', label: 'B', circle: [485, 170, 16] },
    { i: 2, name: 'X / Square (left face)', label: 'X', circle: [415, 170, 16] },
    { i: 3, name: 'Y / Triangle (top face)', label: 'Y', circle: [450, 135, 16] },
    { i: 4, name: 'Left bumper', label: 'LB', rect: [112, 70, 106, 22, 11] },
    { i: 5, name: 'Right bumper', label: 'RB', rect: [382, 70, 106, 22, 11] },
    { i: 6, name: 'Left trigger (analog)', label: 'LT', rect: [128, 16, 80, 46, 12], trigger: true },
    { i: 7, name: 'Right trigger (analog)', label: 'RT', rect: [392, 16, 80, 46, 12], trigger: true },
    { i: 8, name: 'Back / Select / Share', label: '⧉', rect: [234, 142, 32, 17, 8.5] },
    { i: 9, name: 'Start / Options / Menu', label: '≡', rect: [334, 142, 32, 17, 8.5] },
    { i: 12, name: 'D-pad up', label: '▲', rect: [137, 127, 26, 31, 4] },
    { i: 13, name: 'D-pad down', label: '▼', rect: [137, 182, 26, 31, 4] },
    { i: 14, name: 'D-pad left', label: '◀', rect: [106, 157, 32, 26, 4] },
    { i: 15, name: 'D-pad right', label: '▶', rect: [162, 157, 32, 26, 4] },
    { i: 16, name: 'Home / Guide / PS', label: '⌂', circle: [300, 194, 15] },
    { i: 17, name: 'Touchpad / extra (non-standard)', label: '17', rect: [264, 100, 72, 30, 8] },
  ];

  const STICKS = [
    { name: 'Left stick', cx: 230, cy: 248, ax: 0, ay: 1, btn: 10, label: 'L3' },
    { name: 'Right stick', cx: 370, cy: 248, ax: 2, ay: 3, btn: 11, label: 'R3' },
  ];
  const STICK_TRAVEL = 20;

  function shape(def, cls, parent) {
    if (def.circle) {
      const [cx, cy, r] = def.circle;
      return el('circle', { cx, cy, r, class: cls }, parent);
    }
    const [x, y, width, height, rx] = def.rect;
    return el('rect', { x, y, width, height, rx, class: cls }, parent);
  }

  function center(def) {
    if (def.circle) return [def.circle[0], def.circle[1]];
    const [x, y, w, h] = def.rect;
    return [x + w / 2, y + h / 2];
  }

  GP.createControllerSVG = function () {
    const id = 'ctrl' + (++uid);
    const svg = el('svg', {
      viewBox: '40 8 520 370', class: 'controller', role: 'img',
      'aria-label': 'Controller diagram (standard mapping)',
    });
    const defs = el('defs', {}, svg);

    // Triggers and bumpers first so the body overlaps their bottom edge.
    const parts = [];
    const back = el('g', {}, svg);
    el('path', { d: BODY, class: 'ctrl-body' }, svg);
    el('rect', { x: 137, y: 157, width: 26, height: 26, class: 'dpad-center' }, svg);
    const front = el('g', {}, svg);

    for (const def of BUTTONS) {
      const parent = def.i >= 4 && def.i <= 7 ? back : front;
      const g = el('g', { class: def.trigger ? 'part trigger' : 'part', 'data-index': def.i }, parent);
      el('title', {}, g).textContent = `buttons[${def.i}] · ${def.name}`;
      shape(def, 'btn-base', g);
      let fill;
      if (def.trigger) {
        const clipId = `${id}-clip-${def.i}`;
        const clip = el('clipPath', { id: clipId }, defs);
        shape(def, '', clip);
        const [x, y, w] = def.rect;
        fill = el('rect', { x, y, width: w, height: 0, class: 'btn-fill trigger-fill', 'clip-path': `url(#${clipId})` }, g);
      } else {
        fill = shape(def, 'btn-fill', g);
      }
      const [lx, ly] = center(def);
      el('text', { x: lx, y: ly, class: 'btn-label' }, g).textContent = def.label;
      parts.push({ def, g, fill });
    }

    const sticks = STICKS.map((s) => {
      const g = el('g', { class: 'stick' }, front);
      el('title', {}, g).textContent =
        `${s.name} · axes[${s.ax}], axes[${s.ay}] · press = buttons[${s.btn}]`;
      el('circle', { cx: s.cx, cy: s.cy, r: 38, class: 'stick-well' }, g);
      el('line', { x1: s.cx - 34, y1: s.cy, x2: s.cx + 34, y2: s.cy, class: 'stick-cross' }, g);
      el('line', { x1: s.cx, y1: s.cy - 34, x2: s.cx, y2: s.cy + 34, class: 'stick-cross' }, g);
      const knob = el('g', { class: 'part' }, g);
      el('circle', { cx: s.cx, cy: s.cy, r: 22, class: 'btn-base' }, knob);
      const fill = el('circle', { cx: s.cx, cy: s.cy, r: 22, class: 'btn-fill' }, knob);
      el('text', { x: s.cx, y: s.cy, class: 'btn-label' }, knob).textContent = s.label;
      return { s, g, knob, fill };
    });

    function update(gp) {
      for (const p of parts) {
        const b = gp.buttons[p.def.i];
        p.g.classList.toggle('absent', !b);
        if (!b) continue;
        const v = GP.buttonValue(b);
        p.g.classList.toggle('pressed', b.pressed);
        p.g.classList.toggle('touched', !!b.touched && !b.pressed);
        if (p.def.trigger) {
          const [, y, , h] = p.def.rect;
          p.fill.setAttribute('y', y + h * (1 - v));
          p.fill.setAttribute('height', h * v);
        } else {
          p.fill.style.opacity = v;
        }
      }
      for (const st of sticks) {
        const hasAxes = gp.axes.length > st.s.ay;
        st.g.classList.toggle('absent', !hasAxes);
        const x = hasAxes ? gp.axes[st.s.ax] : 0;
        const y = hasAxes ? gp.axes[st.s.ay] : 0;
        st.knob.setAttribute('transform', `translate(${x * STICK_TRAVEL} ${y * STICK_TRAVEL})`);
        const b = gp.buttons[st.s.btn];
        st.knob.classList.toggle('pressed', !!(b && b.pressed));
        st.fill.style.opacity = GP.buttonValue(b);
      }
    }

    return { svg, update };
  };
})();
