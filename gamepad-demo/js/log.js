(function () {
  'use strict';
  const MAX_ENTRIES = 200;
  const list = document.getElementById('log');

  // kind: 'connect' | 'disconnect' | 'press' | 'release' | 'info' | 'error'
  GP.log = function (kind, message) {
    const time = new Date().toLocaleTimeString([], { hour12: false }) +
      '.' + String(Date.now() % 1000).padStart(3, '0');
    const item = GP.h('li', { class: 'log-' + kind },
      GP.h('span', { class: 'log-time', text: time }),
      GP.h('span', { class: 'log-kind', text: kind }),
      GP.h('span', { class: 'log-msg', text: message }),
    );
    list.prepend(item);
    while (list.children.length > MAX_ENTRIES) list.lastElementChild.remove();
  };

  document.getElementById('clear-log').addEventListener('click', () => {
    list.replaceChildren();
  });
})();
