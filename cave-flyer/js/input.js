// Merges keyboard and every connected gamepad into one simple control state:
//   input.x, input.y   -1..1 steering
//   input.pressed[a]   true on the frame action `a` was pressed

const DEADZONE = 0.2;

const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'confirm', Enter: 'confirm',
  KeyP: 'pause', Escape: 'pause',
  KeyM: 'mute',
  KeyF: 'fullscreen',
};

// Standard-mapping button indexes: 0 = A, 8 = Back/View, 9 = Start/Menu.
const PAD_BUTTONS = {
  confirm: [0, 9],
  pause: [9],
  fullscreen: [8],
};

const ACTIONS = ['confirm', 'pause', 'mute', 'fullscreen'];

export class Input {
  constructor() {
    this.keys = new Set();
    this.x = 0;
    this.y = 0;
    this.pressed = {};
    this.prev = {};
    this.padCount = 0;
    this.padIndex = null;

    addEventListener('keydown', (e) => {
      const action = KEYS[e.code];
      if (!action || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      this.keys.add(action);
    });
    addEventListener('keyup', (e) => {
      const action = KEYS[e.code];
      if (action) this.keys.delete(action);
    });
    addEventListener('blur', () => this.keys.clear());
  }

  poll() {
    const k = this.keys;
    let x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    let y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
    const down = {};
    for (const a of ACTIONS) down[a] = k.has(a);

    let count = 0;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp || !gp.connected) continue;
      count++;
      const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);

      // Radial deadzone, rescaled so the stick still reaches 1 at the edge.
      let ax = gp.axes[0] || 0;
      let ay = gp.axes[1] || 0;
      const mag = Math.hypot(ax, ay);
      if (mag < DEADZONE) {
        ax = ay = 0;
      } else {
        const s = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE)) / mag;
        ax *= s;
        ay *= s;
      }
      ax += (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0); // D-pad
      ay += (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);

      if (ax || ay || gp.buttons.some((b) => b.pressed)) this.padIndex = gp.index;
      x += ax;
      y += ay;
      for (const [action, idxs] of Object.entries(PAD_BUTTONS)) {
        if (idxs.some(btn)) down[action] = true;
      }
    }
    this.padCount = count;

    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.x = x;
    this.y = y;

    for (const a of ACTIONS) this.pressed[a] = down[a] && !this.prev[a];
    this.prev = down;
  }

  rumble(strong, weak, ms) {
    if (this.padIndex == null || !navigator.getGamepads) return;
    const gp = navigator.getGamepads()[this.padIndex];
    const va = gp && gp.vibrationActuator;
    if (!va || !va.playEffect) return;
    va.playEffect('dual-rumble', {
      startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak,
    }).catch(() => {});
  }
}
