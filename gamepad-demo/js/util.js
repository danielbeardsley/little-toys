// Shared helpers. Plain scripts (no modules) so index.html works from file:// too.
window.GP = window.GP || {};

(function () {
  'use strict';

  // Tiny DOM builder: h('div', {class: 'x', text: 'hi'}, child1, child2)
  GP.h = function (tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [key, val] of Object.entries(props)) {
        if (val == null || val === false) continue;
        if (key === 'class') node.className = val;
        else if (key === 'text') node.textContent = val;
        else if (key.startsWith('on')) node.addEventListener(key.slice(2), val);
        else node.setAttribute(key, val === true ? '' : val);
      }
    }
    for (const child of children) {
      if (child != null) node.append(child);
    }
    return node;
  };

  // Some controllers report pressed=true with value=0 for digital buttons.
  GP.buttonValue = function (b) {
    if (!b) return 0;
    return b.pressed && !b.value ? 1 : b.value;
  };

  GP.fmt = function (n) {
    const s = (n >= 0 ? '+' : '') + n.toFixed(2);
    return s === '-0.00' ? '+0.00' : s;
  };

  // Theme colors for canvas drawing, refreshed when the color scheme flips.
  const cache = {};
  GP.cssVar = function (name) {
    if (!(name in cache)) {
      cache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }
    return cache[name];
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    for (const k in cache) delete cache[k];
  });

  // Names from the W3C "standard" mapping: https://w3c.github.io/gamepad/#remapping
  GP.STANDARD_BUTTONS = [
    'A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start',
    'L3', 'R3', 'Up', 'Down', 'Left', 'Right', 'Home', 'Extra',
  ];
  GP.STANDARD_AXES = ['Left X', 'Left Y', 'Right X', 'Right Y'];
})();
