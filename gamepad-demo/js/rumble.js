// Vibration controls for one gamepad.
//   Modern:  gamepad.vibrationActuator.playEffect('dual-rumble' | 'trigger-rumble', params)
//   Legacy:  gamepad.hapticActuators[0].pulse(value, durationMs)   (older Firefox)
(function () {
  'use strict';
  const h = GP.h;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function slider(label, min, max, step, value, unit) {
    const out = h('output', { text: value + (unit || '') });
    const input = h('input', { type: 'range', min, max, step, value });
    input.addEventListener('input', () => { out.textContent = input.value + (unit || ''); });
    const wrap = h('label', { class: 'slider' }, h('span', { text: label }), input, out);
    return { wrap, get value() { return Number(input.value); } };
  }

  // Describes what the browser exposes, for the card's info row.
  GP.describeVibration = function (gp) {
    const va = gp.vibrationActuator;
    if (va) {
      const effects = va.effects || (va.type ? [va.type] : []);
      return effects.length ? effects.join(', ') : 'vibrationActuator';
    }
    if (gp.hapticActuators && gp.hapticActuators.length) return 'hapticActuators (legacy)';
    return 'none';
  };

  GP.createRumble = function (gp) {
    const index = gp.index;
    const fresh = () => navigator.getGamepads()[index];
    const wrap = h('div', { class: 'rumble' }, h('h3', { text: 'Vibration' }));

    const va = gp.vibrationActuator;
    const legacy = gp.hapticActuators && gp.hapticActuators.length;
    if (!va && !legacy) {
      wrap.append(h('p', { class: 'muted small', text:
        'No vibration actuator is exposed for this controller in this browser. ' +
        '(Chrome, Edge and Safari support dual-rumble on most Xbox and PlayStation pads.)' }));
      return wrap;
    }

    // `effects` is newer; if it's missing we just try and report what happens.
    const effects = va && va.effects;
    const canDual = !va || !effects || effects.includes('dual-rumble');
    const canTrigger = !!va && (!effects || effects.includes('trigger-rumble'));

    const strong = slider('Strong (low freq)', 0, 1, 0.05, 1);
    const weak = slider('Weak (high freq)', 0, 1, 0.05, 0.5);
    const duration = slider('Duration', 50, 3000, 50, 500, ' ms');
    const leftT = slider('Left trigger', 0, 1, 0.05, 0.8);
    const rightT = slider('Right trigger', 0, 1, 0.05, 0.8);
    const status = h('span', { class: 'rumble-status muted small' });

    function report(promise, label) {
      status.textContent = label + '…';
      return Promise.resolve(promise).then(
        (result) => { status.textContent = `${label}: ${result || 'done'}`; },
        (err) => {
          status.textContent = `${label} failed: ${err.message || err}`;
          GP.log('error', `P${index + 1} ${label} failed: ${err.message || err}`);
        },
      );
    }

    function play(type, params) {
      const pad = fresh();
      if (!pad) return Promise.reject(new Error('gamepad gone'));
      if (pad.vibrationActuator) return pad.vibrationActuator.playEffect(type, params);
      if (pad.hapticActuators && pad.hapticActuators[0]) {
        return pad.hapticActuators[0].pulse(Math.max(params.strongMagnitude, params.weakMagnitude), params.duration);
      }
      return Promise.reject(new Error('no actuator'));
    }

    const dual = () => report(play('dual-rumble', {
      duration: duration.value, strongMagnitude: strong.value, weakMagnitude: weak.value,
    }), 'dual-rumble');

    const trigger = () => report(play('trigger-rumble', {
      duration: duration.value, strongMagnitude: strong.value, weakMagnitude: weak.value,
      leftTrigger: leftT.value, rightTrigger: rightT.value,
    }), 'trigger-rumble');

    const heartbeat = () => report((async () => {
      for (let i = 0; i < 3; i++) {
        await play('dual-rumble', { duration: 90, strongMagnitude: 1, weakMagnitude: 0.2 });
        await sleep(90);
        await play('dual-rumble', { duration: 120, strongMagnitude: 0.6, weakMagnitude: 0.1 });
        await sleep(550);
      }
      return 'done';
    })(), 'heartbeat');

    const stop = () => {
      const pad = fresh();
      if (pad && pad.vibrationActuator && pad.vibrationActuator.reset) {
        report(pad.vibrationActuator.reset(), 'reset');
      } else {
        report(play('dual-rumble', { duration: 1, strongMagnitude: 0, weakMagnitude: 0 }), 'stop');
      }
    };

    const sliders = [strong.wrap, weak.wrap, duration.wrap];
    if (canTrigger) sliders.push(leftT.wrap, rightT.wrap);

    wrap.append(
      h('div', { class: 'sliders' }, ...sliders),
      h('div', { class: 'row wrap' },
        h('button', { type: 'button', class: 'btn', onclick: dual, disabled: !canDual, text: 'Dual rumble' }),
        canTrigger ? h('button', { type: 'button', class: 'btn', onclick: trigger, text: 'Trigger rumble' }) : null,
        h('button', { type: 'button', class: 'btn', onclick: heartbeat, disabled: !canDual, text: 'Heartbeat' }),
        h('button', { type: 'button', class: 'btn ghost', onclick: stop, text: 'Stop' }),
        status,
      ),
    );
    if (canTrigger && !effects) {
      wrap.append(h('p', { class: 'muted small', text:
        'Trigger rumble only works on some pads/platforms (e.g. Xbox controllers on Windows).' }));
    }
    return wrap;
  };

  // Small fire-and-forget rumble used by the playground.
  GP.bump = function (index, magnitude, duration) {
    const pad = navigator.getGamepads()[index];
    const va = pad && pad.vibrationActuator;
    if (!va) return;
    va.playEffect('dual-rumble', {
      duration, strongMagnitude: magnitude, weakMagnitude: magnitude * 0.6,
    }).catch(() => {});
  };
})();
