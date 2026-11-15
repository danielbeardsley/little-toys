// Main loop: poll navigator.getGamepads() every animation frame and fan out to the views.
(function () {
  'use strict';
  const h = GP.h;
  const padsEl = document.getElementById('pads');
  const emptyEl = document.getElementById('empty');
  const logButtons = document.getElementById('log-buttons');
  const cards = new Map();     // gamepad.index -> card
  const prevPressed = new Map(); // gamepad.index -> boolean[]

  // ---- Feature support chips ----
  const support = [
    ['navigator.getGamepads', 'getGamepads' in navigator],
    ['secure context', window.isSecureContext],
    ['gamepadconnected event', 'ongamepadconnected' in window],
    ['GamepadHapticActuator', 'GamepadHapticActuator' in window],
  ];
  const chips = document.getElementById('support');
  for (const [name, ok] of support) {
    chips.append(h('li', { class: 'chip ' + (ok ? 'ok' : 'no'), text: (ok ? '✓ ' : '✗ ') + name }));
  }
  if (!('getGamepads' in navigator)) {
    emptyEl.querySelector('h2').textContent = 'This browser does not support the Gamepad API';
  } else if (!window.isSecureContext) {
    emptyEl.querySelector('p').textContent =
      'The Gamepad API only works in a secure context. Open this page over https:// or http://localhost.';
  }

  // ---- Real browser events ----
  function describe(gp) {
    return `#${gp.index} "${gp.id}" · mapping="${gp.mapping}" · ` +
      `${gp.buttons.length} buttons, ${gp.axes.length} axes`;
  }
  window.addEventListener('gamepadconnected', (e) => GP.log('connect', describe(e.gamepad)));
  window.addEventListener('gamepaddisconnected', (e) => GP.log('disconnect', describe(e.gamepad)));

  // ---- Synthesized button press / release events ----
  function diffButtons(gp) {
    const prev = prevPressed.get(gp.index) || [];
    const now = gp.buttons.map((b) => b.pressed);
    if (logButtons.checked) {
      now.forEach((p, i) => {
        if (p === !!prev[i]) return;
        const name = gp.mapping === 'standard' && GP.STANDARD_BUTTONS[i] ? ` (${GP.STANDARD_BUTTONS[i]})` : '';
        const value = p ? ` value=${GP.buttonValue(gp.buttons[i]).toFixed(2)}` : '';
        GP.log(p ? 'press' : 'release', `P${gp.index + 1} buttons[${i}]${name}${value}`);
      });
    }
    prevPressed.set(gp.index, now);
  }

  // ---- Loop ----
  let lastTime = performance.now();
  function frame(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000);
    lastTime = time;
    const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()) : [];
    const seen = new Set();

    for (const gp of gamepads) {
      if (!gp || !gp.connected) continue;
      seen.add(gp.index);
      let card = cards.get(gp.index);
      if (card && card.id !== gp.id) { card.destroy(); card = null; }
      if (!card) {
        card = GP.createCard(gp);
        cards.set(gp.index, card);
        // Keep cards ordered by index.
        const after = [...cards.keys()].filter((i) => i > gp.index).sort((a, b) => a - b)[0];
        padsEl.insertBefore(card.root, after != null ? cards.get(after).root : null);
      }
      card.update(gp);
      diffButtons(gp);
    }

    for (const [index, card] of cards) {
      if (!seen.has(index)) {
        card.destroy();
        cards.delete(index);
        prevPressed.delete(index);
      }
    }

    emptyEl.hidden = cards.size > 0;
    GP.playground.update(gamepads, dt);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
