/* PlayRealm input: gamepads and the on-screen touch pad.
   Both are driven by one mapping built from a game's `controls` list, and both "press keys"
   by dispatching synthetic keyboard events. Games keep reading the keyboard and never know
   the difference, so every game gets controller and touch support for free.
   Loaded after core.js; app.js calls Input.attach(def) / Input.detach(). */
(function () {
  'use strict';

  const A = window.Arcade;
  const ARROWS = { '↑': 'ArrowUp', '↓': 'ArrowDown', '←': 'ArrowLeft', '→': 'ArrowRight' };
  const WASD = { W: 'KeyW', A: 'KeyA', S: 'KeyS', D: 'KeyD' };
  const DIR = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
  const NAMED = {
    Space: 'Space', Enter: 'Enter', Shift: 'ShiftLeft', 'L-Shift': 'ShiftLeft', 'Right Shift': 'ShiftRight',
    'R-Shift': 'ShiftRight', Backspace: 'Backspace', Tab: 'Tab', '/': 'Slash', '.': 'Period'
  };
  const KEY_OF = { Space: ' ', ShiftLeft: 'Shift', ShiftRight: 'Shift', Slash: '/', Period: '.' };
  const CAP = { Space: 'Space', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', Backspace: '⌫', Tab: 'Tab', Slash: '/', Period: '.' };

  function codeFor(token) {
    if (ARROWS[token]) return ARROWS[token];
    if (NAMED[token]) return NAMED[token];
    if (/^[A-Z]$/.test(token)) return 'Key' + token;
    if (/^[0-9]$/.test(token)) return 'Digit' + token;
    return null;
  }
  function keyFor(code) {
    if (KEY_OF[code]) return KEY_OF[code];
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }
  function capFor(code) {
    if (CAP[code]) return CAP[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
  }
  function maxPlayers(def) {
    const m = /(\d+)\s*(?:[–-]\s*(\d+))?\s*P/.exec(def.players || '');
    return m ? Number(m[2] || m[1]) : 1;
  }

  /* controls -> { p1: { dirs, actions }, p2: { dirs, actions } }
     dirs: { up, down, left, right } key codes; actions: [{ code, label }]. */
  function mapFor(def) {
    const wasd = {};
    const arrows = {};
    const actions = [];
    const controls = def.controls || [];
    // W, A, S or D on its own is only a direction when the game also steers with a WASD
    // pair or quad. Alone it is an ordinary key ("S: scan", "D: draw a card").
    const steersWithWasd = controls.some((c) => (c.keys || []).length > 1 && c.keys.every((t) => WASD[t]));
    controls.forEach((c) => {
      const tokens = c.keys || [];
      if (!tokens.length) return;
      tokens.filter((t) => ARROWS[t]).forEach((t) => { arrows[DIR[ARROWS[t]]] = ARROWS[t]; });
      if (tokens.every((t) => WASD[t]) && (tokens.length > 1 || steersWithWasd)) {
        tokens.forEach((t) => { wasd[DIR[WASD[t]]] = WASD[t]; });
        return;
      }
      const rest = tokens.filter((t) => !ARROWS[t]);
      const label = c.label || '';
      // Single characters side by side (F G, 1 2 3) are separate buttons;
      // anything else (Space / Enter, Z / Backspace) is one action with alternatives.
      if (rest.length > 1 && rest.every((t) => t.length === 1)) {
        const parts = label.split(/\s*(?:\/|,)\s*/);
        rest.forEach((t, i) => {
          const code = codeFor(t);
          if (code) actions.push({ code, label: parts.length === rest.length ? parts[i] : label, group: label });
        });
        return;
      }
      const tok = rest.find((t) => codeFor(t));
      if (tok) actions.push({ code: codeFor(tok), label, group: label });
    });

    const hasWasd = Object.keys(wasd).length > 0;
    const hasArrows = Object.keys(arrows).length > 0;
    // Two players on one keyboard: both key clusters, and the controls name a second player.
    // (Pool and Mini Golf list both clusters too, but one player uses them all.)
    const namesP2 = controls.some((c) => /\b(P2|Player 2|Cyan)\b/i.test(c.label || ''));
    const shared = hasWasd && hasArrows && maxPlayers(def) >= 2 && namesP2;
    const isP2 = (a) => /\b(P2|Player 2|Cyan)\b/i.test(a.group) ||
      (shared && a.code === 'Enter' && !/\b(P1|Player 1|Coral)\b/i.test(a.group));
    // One player with both clusters: the arrows are the main set, WASD fills any gaps.
    const p1 = { dirs: shared ? wasd : Object.assign({}, wasd, arrows), actions: [] };
    const p2 = { dirs: shared ? arrows : {}, actions: [] };
    actions.forEach((a) => {
      const side = shared && isP2(a) ? p2 : p1;
      if (!side.actions.some((x) => x.code === a.code)) side.actions.push(a);
    });
    // Space is the main action everywhere: keep it on the first (biggest) button.
    p1.actions.sort((a, b) => (b.code === 'Space') - (a.code === 'Space'));
    return { p1, p2 };
  }

  /* ---------- Virtual key presses ---------- */
  const held = new Map(); // code -> how many sources hold it
  function fire(type, code) {
    document.body.dispatchEvent(new KeyboardEvent(type, { code, key: keyFor(code), bubbles: true, cancelable: true }));
  }
  function press(code) {
    const n = held.get(code) || 0;
    held.set(code, n + 1);
    if (!n) fire('keydown', code);
  }
  function release(code) {
    const n = held.get(code) || 0;
    if (!n) return;
    if (n === 1) {
      held.delete(code);
      fire('keyup', code);
    } else held.set(code, n - 1);
  }
  function releaseAll() {
    [...held.keys()].forEach((code) => {
      held.delete(code);
      fire('keyup', code);
    });
  }
  /* The shell forgets every held key when it pauses. After a resume, press the ones that
     are still physically down again, so a held stick keeps steering. */
  function repress() {
    [...held.keys()].forEach((code) => fire('keydown', code));
  }

  let current = null; // { def, map }
  const $ = (sel) => document.querySelector(sel);
  const padEl = $('#pad');
  const hintEl = $('#pad-hint');

  /* ---------- Touch pad ---------- */
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  function touchWanted() {
    const mode = A.store.get('pad', 'auto');
    return mode === 'on' || (mode === 'auto' && coarse);
  }

  function shortLabel(a) {
    const words = a.label.replace(/\(.*?\)/g, '').replace(/^(P1|P2|Player [12]|Coral|Cyan)\b[:\s]*/i, '').trim().split(/\s+/);
    let out = '';
    for (const w of words) {
      if ((out + ' ' + w).trim().length > 12) break;
      out = (out + ' ' + w).trim();
    }
    return out || capFor(a.code);
  }

  function buildStick(dirs) {
    const stick = document.createElement('div');
    stick.className = 'pad__stick';
    stick.setAttribute('role', 'group');
    stick.setAttribute('aria-label', 'Direction pad');
    ['up', 'left', 'right', 'down'].forEach((d) => {
      const arm = document.createElement('span');
      arm.className = 'pad__arm pad__arm--' + d + (dirs[d] ? '' : ' is-off');
      arm.dataset.dir = d;
      stick.append(arm);
    });
    let active = new Set();
    let pointer = null;
    function apply(next) {
      active.forEach((d) => { if (!next.has(d)) release(dirs[d]); });
      next.forEach((d) => { if (!active.has(d)) press(dirs[d]); });
      active = next;
      stick.querySelectorAll('.pad__arm').forEach((arm) => arm.classList.toggle('is-down', active.has(arm.dataset.dir)));
    }
    function read(e) {
      const r = stick.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const next = new Set();
      if (Math.hypot(dx, dy) > 0.22) {
        // 8-way: a direction counts when it carries at least ~40% of the push.
        const a = Math.abs(dx);
        const b = Math.abs(dy);
        if (a > b * 0.42) next.add(dx < 0 ? 'left' : 'right');
        if (b > a * 0.42) next.add(dy < 0 ? 'up' : 'down');
      }
      [...next].forEach((d) => { if (!dirs[d]) next.delete(d); });
      apply(next);
    }
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      pointer = e.pointerId;
      try { stick.setPointerCapture(pointer); } catch (err) { /* older browsers */ }
      read(e);
    });
    stick.addEventListener('pointermove', (e) => {
      if (e.pointerId === pointer) read(e);
    });
    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null;
      apply(new Set());
    };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    stick.addEventListener('lostpointercapture', end);
    stick.addEventListener('contextmenu', (e) => e.preventDefault());
    return stick;
  }

  function buildButton(a, big) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pad__btn' + (big ? ' pad__btn--main' : '');
    b.tabIndex = -1; // keep Space/Enter from re-pressing it
    b.innerHTML = '<b></b><span></span>';
    b.firstChild.textContent = capFor(a.code);
    b.lastChild.textContent = shortLabel(a);
    b.setAttribute('aria-label', a.label);
    let down = false;
    const off = () => {
      if (!down) return;
      down = false;
      b.classList.remove('is-down');
      release(a.code);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (down) return;
      down = true;
      b.classList.add('is-down');
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      press(a.code);
    });
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('lostpointercapture', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  }

  function renderPad() {
    if (!padEl) return;
    padEl.innerHTML = '';
    const wrap = padEl.parentElement;
    const map = current && current.map.p1;
    const show = !!map && touchWanted() && (Object.keys(map.dirs).length > 0 || map.actions.length > 0);
    padEl.hidden = !show;
    if (wrap) wrap.classList.toggle('has-pad', show);
    if (!show) return;
    if (Object.keys(map.dirs).length) padEl.append(buildStick(map.dirs));
    else padEl.append(document.createElement('span'));
    const actions = document.createElement('div');
    actions.className = 'pad__actions';
    map.actions.slice(0, 6).forEach((a, i) => actions.append(buildButton(a, i === 0)));
    padEl.append(actions);
  }

  /* ---------- Gamepads ---------- */
  const FACE = [0, 1, 2, 3, 5, 4]; // A B X Y RB LB -> actions 0..5
  const FACE_NAME = ['A', 'B', 'X', 'Y', 'RB', 'LB'];
  const padState = new Map(); // gamepad index -> { down: Set of buttons held, sent: Map button -> key code pressed }
  let polling = 0;

  function pads() {
    if (!navigator.getGamepads) return [];
    let list;
    try { list = navigator.getGamepads(); } catch (e) { return []; }
    return [...(list || [])].filter((p) => p && p.connected);
  }

  function menuButtons() {
    const pause = $('#pause');
    const root = pause && !pause.hidden ? pause : $('#stage .stage-menu');
    return root ? [...root.querySelectorAll('button, a.btn')] : null;
  }

  /* Script focus does not always draw a focus ring, so mark the chosen button ourselves. */
  function padFocus(menu, i) {
    menu.forEach((b) => b.classList.remove('pad-focus'));
    menu[i].classList.add('pad-focus');
    menu[i].focus({ preventScroll: true });
  }

  function pollPad(gp, map, state) {
    const now = new Set();
    const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const ax = gp.axes[0] || 0;
    const ay = gp.axes[1] || 0;
    if (ax < -0.5 || b(14)) now.add('left');
    if (ax > 0.5 || b(15)) now.add('right');
    if (ay < -0.5 || b(12)) now.add('up');
    if (ay > 0.5 || b(13)) now.add('down');
    FACE.forEach((btn, i) => { if (b(btn)) now.add('a' + i); });
    if (b(9)) now.add('start');

    const codeOf = (tok) => (tok[0] === 'a' ? (map.actions[Number(tok.slice(1))] || {}).code : map.dirs[tok]);
    // Rising edges: a button that just went down.
    now.forEach((tok) => {
      if (state.down.has(tok)) return;
      if (tok === 'start') {
        fire('keydown', 'Escape'); // the shell toggles pause on Escape
        fire('keyup', 'Escape');
        return;
      }
      const menu = menuButtons();
      if (menu && menu.length) {
        // Menus: d-pad moves between buttons, A presses the focused one. No game keys are sent.
        const at = Math.max(0, menu.indexOf(document.activeElement));
        if (tok === 'a0') menu[at].click();
        else if (tok === 'left' || tok === 'up') padFocus(menu, (at + menu.length - 1) % menu.length);
        else if (tok === 'right' || tok === 'down') padFocus(menu, (at + 1) % menu.length);
        return;
      }
      const code = codeOf(tok);
      if (code) {
        state.sent.set(tok, code);
        press(code);
        if (window.Profile && Profile.markPad) Profile.markPad();
      }
    });
    // Falling edges: release only what this pad actually pressed.
    state.down.forEach((tok) => {
      if (now.has(tok) || !state.sent.has(tok)) return;
      release(state.sent.get(tok));
      state.sent.delete(tok);
    });
    state.down = now;
  }

  function poll() {
    polling = 0;
    if (!current) return;
    const list = pads();
    list.slice(0, 2).forEach((gp, slot) => {
      if (!padState.has(gp.index)) padState.set(gp.index, { down: new Set(), sent: new Map() });
      pollPad(gp, slot === 0 ? current.map.p1 : current.map.p2, padState.get(gp.index));
    });
    if (list.length) polling = requestAnimationFrame(poll);
  }
  function startPolling() {
    if (!polling && current && pads().length) polling = requestAnimationFrame(poll);
  }

  function renderHint() {
    if (!hintEl) return;
    const list = pads();
    const map = current && current.map;
    const usable = map && (Object.keys(map.p1.dirs).length || map.p1.actions.length);
    if (!usable || !list.length) {
      hintEl.hidden = true;
      return;
    }
    const bits = [];
    if (Object.keys(map.p1.dirs).length) bits.push('stick or d-pad moves');
    map.p1.actions.slice(0, 6).forEach((a, i) => bits.push(FACE_NAME[i] + ' = ' + shortLabel(a).toLowerCase()));
    bits.push('Start pauses');
    const second = Object.keys(map.p2.dirs).length ? ' A second controller plays as player 2.' : '';
    hintEl.textContent = 'Controller connected: ' + bits.join(', ') + '.' + second;
    hintEl.hidden = false;
  }

  window.addEventListener('gamepadconnected', (e) => {
    if (window.Profile) Profile.toast('Controller connected', (e.gamepad && e.gamepad.id ? e.gamepad.id.split('(')[0].trim() : 'Gamepad') + ' is ready.', 'bolt');
    renderHint();
    startPolling();
  });
  window.addEventListener('gamepaddisconnected', (e) => {
    padState.delete(e.gamepad.index);
    releaseAll();
    renderHint();
  });
  // Never leave a key stuck when the tab loses focus.
  window.addEventListener('blur', releaseAll);

  window.Input = {
    mapFor,
    attach(def) {
      releaseAll();
      padState.clear();
      current = { def, map: mapFor(def) };
      renderPad();
      renderHint();
      startPolling();
    },
    detach() {
      releaseAll();
      padState.clear();
      current = null;
      cancelAnimationFrame(polling);
      polling = 0;
      renderPad();
      renderHint();
    },
    /* Called by the shell after a resume. */
    resume: repress,
    /* 'auto' (touch devices only) | 'on' | 'off' */
    get touchOn() { return touchWanted(); },
    setTouch(on) {
      A.store.set('pad', on ? 'on' : 'off');
      renderPad();
    }
  };
})();
