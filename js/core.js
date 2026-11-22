/* PlayRealm core: game registry, per-game runtime API, sound, shared helpers.
   Loaded before every game file. No dependencies. See docs/GAME_API.md. */
(function () {
  'use strict';

  /* ---------- Storage (never throws) ---------- */
  const PREFIX = 'playrealm:';
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) { /* storage unavailable: scores just won't persist */ }
    },
    clearBests() {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith(PREFIX + 'best:'))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
    }
  };

  /* ---------- Shared palette (matches css/style.css tokens) ---------- */
  const colors = {
    ink: '#0F0D24',
    panel: '#1C1838',
    panel2: '#262150',
    line: '#3A3470',
    text: '#F3F0FF',
    muted: '#A9A3D6',
    p1: '#FF5D73',
    p2: '#36C9F0',
    gold: '#FFC53D',
    mint: '#4BE3A0',
    violet: '#9B7BFF'
  };

  /* ---------- Sound: tiny WebAudio synth ---------- */
  const sound = (function () {
    let ac = null;
    let muted = store.get('muted', false);

    function audio() {
      if (!ac) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ac = new AC();
      }
      if (ac.state !== 'running' && ac.resume) ac.resume(); // 'suspended', or 'interrupted' on iOS
      return ac;
    }

    function tone(freq, dur, opts) {
      const o = opts || {};
      const a = audio();
      if (!a) return;
      const t0 = a.currentTime + (o.delay || 0);
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t0 + dur);
      gain.gain.setValueAtTime(o.vol == null ? 0.07 : o.vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(a.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, vol) {
      const a = audio();
      if (!a) return;
      const len = Math.floor(a.sampleRate * dur);
      const buf = a.createBuffer(1, len, a.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource();
      src.buffer = buf;
      const gain = a.createGain();
      gain.gain.value = vol;
      src.connect(gain).connect(a.destination);
      src.start();
    }

    const presets = {
      blip: () => tone(660, 0.05),
      tick: () => tone(440, 0.03, { type: 'triangle', vol: 0.06 }),
      flip: () => tone(320, 0.08, { type: 'sine', slide: 640, vol: 0.1 }),
      hit: () => tone(220, 0.09, { slide: 110 }),
      shoot: () => tone(900, 0.1, { slide: 180, vol: 0.04 }),
      power: () => tone(400, 0.22, { type: 'triangle', slide: 1200, vol: 0.09 }),
      score: () => {
        tone(523, 0.08, { type: 'triangle', vol: 0.1 });
        tone(784, 0.12, { type: 'triangle', delay: 0.08, vol: 0.1 });
      },
      lose: () => tone(300, 0.45, { type: 'sawtooth', slide: 70, vol: 0.06 }),
      win: () => [523, 659, 784, 1046].forEach((f, i) =>
        tone(f, 0.14, { type: 'triangle', delay: i * 0.1, vol: 0.1 })),
      boom: () => {
        noise(0.35, 0.16);
        tone(120, 0.3, { type: 'sine', slide: 40, vol: 0.14 });
      }
    };

    return {
      play(name) {
        if (muted || !presets[name]) return;
        try { presets[name](); } catch (e) { /* audio is optional */ }
      },
      get muted() { return muted; },
      setMuted(m) {
        muted = !!m;
        store.set('muted', muted);
      },
      names: Object.keys(presets)
    };
  })();

  /* ---------- Math + drawing helpers ---------- */
  const util = {
    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
    lerp: (a, b, t) => a + (b - a) * t,
    rand: (lo, hi) => lo + Math.random() * (hi - lo),
    randInt: (lo, hi) => Math.floor(lo + Math.random() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    /* Adds a rounded-rect path; caller fills/strokes. */
    roundRect(ctx, x, y, w, h, r) {
      const rr = Math.max(0, Math.min(r, w / 2, h / 2));
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y, x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x, y + h, rr);
      ctx.arcTo(x, y + h, x, y, rr);
      ctx.arcTo(x, y, x + w, y, rr);
      ctx.closePath();
    },
    /* Hex color (#RRGGBB) to rgba() string. */
    alpha(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
  };

  /* ---------- Registry ---------- */
  const games = [];
  /* Adults-only games (def.adult) live in their own list, so everything that walks
     `games` (shelves, search, game of the day, game night, badges) never sees them. */
  const lounge = [];

  function register(def) {
    for (const k of ['id', 'title', 'mode', 'create']) {
      if (!def[k]) {
        console.error('[PlayRealm] game is missing "' + k + '"', def);
        return;
      }
    }
    if (games.some((g) => g.id === def.id) || lounge.some((g) => g.id === def.id)) {
      console.error('[PlayRealm] duplicate game id "' + def.id + '"');
      return;
    }
    (def.adult ? lounge : games).push(Object.assign({
      category: 'arcade',
      players: def.mode === 'solo' ? '1P' : '2P',
      original: false,
      tagline: '',
      hook: '',
      tags: [],
      color: colors.p2,
      controls: [],
      howTo: '',
      best: def.mode === 'solo' ? 'high' : false,
      formatScore: (n) => String(n),
      drawThumb: null
    }, def));
  }

  function getBest(def) {
    const v = store.get('best:' + def.id, null);
    return typeof v === 'number' && isFinite(v) ? v : null; // ignore damaged or foreign values
  }

  function submitBest(def, n) {
    if (!def.best || typeof n !== 'number' || !isFinite(n)) return false;
    const cur = getBest(def);
    const better = cur === null
      ? def.best === 'low' || n > 0
      : def.best === 'low' ? n < cur : n > cur;
    if (better) store.set('best:' + def.id, n);
    return better;
  }

  /* ---------- Runtime: one per running game ---------- */
  function start(def, stage, ui) {
    const disposers = [];
    const keys = new Set();
    const canvases = [];
    let paused = false;
    let alive = true;
    let menuEl = null;
    let instance = null;
    const pauseHandlers = [];

    const onKeyDown = (e) => keys.add(e.code);
    const onKeyUp = (e) => keys.delete(e.code);
    const onBlur = () => keys.clear();
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    disposers.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    });

    function fit() {
      const sw = stage.clientWidth;
      const sh = stage.clientHeight;
      if (!sw || !sh) return;
      for (const c of canvases) {
        const s = Math.min(sw / c.w, sh / c.h);
        c.el.style.width = Math.floor(c.w * s) + 'px';
        c.el.style.height = Math.floor(c.h * s) + 'px';
      }
    }
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    disposers.push(() => ro.disconnect());

    function hideMenu() {
      if (menuEl) {
        menuEl.remove();
        menuEl = null;
      }
    }

    const api = {
      stage,
      keys,
      get paused() { return paused; },
      isTouch: window.matchMedia('(pointer: coarse)').matches,

      /* Create the game canvas at a logical size; it is scaled to fit the stage. */
      canvas(w, h) {
        const el = document.createElement('canvas');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
        el.className = 'game-canvas';
        const ctx = el.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        stage.appendChild(el);
        stage.style.setProperty('--ar', w + ' / ' + h);
        canvases.push({ el, w, h });
        fit();
        return { canvas: el, ctx, w, h };
      },

      /* Pointer/mouse/touch event -> logical canvas coordinates. */
      toCanvas(evt, el) {
        const c = canvases.find((x) => x.el === el) || canvases[0];
        const rect = c.el.getBoundingClientRect();
        return {
          x: (evt.clientX - rect.left) * (c.w / rect.width),
          y: (evt.clientY - rect.top) * (c.h / rect.height)
        };
      },

      /* rAF loop. fn(dt seconds, clamped to 0.05; t seconds). Skipped while paused. */
      loop(fn) {
        let id = 0;
        let stopped = false;
        let last = performance.now();
        const frame = (now) => {
          if (!alive || stopped) return;
          // rAF timestamps can trail performance.now() on the first frame: never go negative.
          const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
          last = now;
          if (!paused) {
            try {
              fn(dt, now / 1000);
            } catch (err) {
              console.error('[PlayRealm] ' + def.id + ' loop crashed:', err);
              ui.setStatus('This game hit an error. Press Restart to try again.');
              return;
            }
          }
          // stop() may have been called from inside fn: do not schedule another frame.
          if (!stopped) id = requestAnimationFrame(frame);
        };
        id = requestAnimationFrame(frame);
        const stop = () => {
          stopped = true;
          cancelAnimationFrame(id);
        };
        disposers.push(stop);
        return stop;
      },

      /* addEventListener that auto-removes on exit and is muted while paused
         (pass { always: true } to receive events while paused). */
      on(target, type, handler, opts) {
        const always = !!(opts && opts.always);
        const wrapped = (e) => {
          if (!alive || (paused && !always)) return;
          handler(e);
        };
        target.addEventListener(type, wrapped, { passive: !!(opts && opts.passive) });
        const off = () => target.removeEventListener(type, wrapped);
        disposers.push(off);
        return off;
      },

      /* setTimeout that waits out pauses and is cancelled on exit. */
      after(ms, fn) {
        let id = 0;
        const fire = () => {
          if (!alive) return;
          if (paused) {
            id = setTimeout(fire, 100);
            return;
          }
          fn();
        };
        id = setTimeout(fire, ms);
        const cancel = () => clearTimeout(id);
        disposers.push(cancel);
        return cancel;
      },

      /* Overlay card inside the stage: title, text, buttons [{label, onClick, primary}]. */
      menu(opts) {
        hideMenu();
        const o = opts || {};
        menuEl = document.createElement('div');
        menuEl.className = 'stage-menu';
        const card = document.createElement('div');
        card.className = 'stage-menu__card';
        if (o.title) {
          const h = document.createElement('h3');
          h.textContent = o.title;
          card.append(h);
        }
        if (o.text) {
          const p = document.createElement('p');
          p.textContent = o.text;
          card.append(p);
        }
        const row = document.createElement('div');
        row.className = 'stage-menu__buttons';
        const buttons = o.buttons || [];
        const hasPrimary = buttons.some((b) => b.primary);
        buttons.forEach((b, i) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'btn' + (b.primary || (!hasPrimary && i === 0) ? ' btn--primary' : '');
          btn.textContent = b.label;
          btn.addEventListener('click', () => {
            if (!alive) return;
            sound.play('blip');
            hideMenu();
            if (b.onClick) b.onClick();
          });
          row.append(btn);
        });
        card.append(row);
        menuEl.append(card);
        stage.append(menuEl);
        const first = row.querySelector('.btn--primary') || row.querySelector('button');
        if (first) first.focus({ preventScroll: true });
      },
      hideMenu,
      get menuOpen() { return !!menuEl; },

      /* fn(paused) runs whenever the shell pauses or resumes the game. */
      onPause(fn) { pauseHandlers.push(fn); },

      setScore(v) { ui.setScore(v); },
      setStatus(text) { ui.setStatus(text); },
      best() { return getBest(def); },
      /* Submit a final score; returns true if it is a new best. */
      reportScore(n) {
        const better = submitBest(def, n);
        if (better) ui.setBest(n);
        return better;
      },
      sfx(name) { sound.play(name); },

      colors,
      util
    };

    try {
      instance = def.create(stage, api) || null;
    } catch (err) {
      console.error('[PlayRealm] ' + def.id + ' failed to start:', err);
      ui.setStatus('This game could not start. Check the console for details.');
    }

    return {
      get paused() { return paused; },
      setPaused(p) {
        const was = paused;
        paused = !!p;
        keys.clear();
        if (was !== paused) {
          pauseHandlers.forEach((fn) => {
            try { fn(paused); } catch (err) { console.error(err); }
          });
        }
      },
      destroy() {
        if (!alive) return;
        alive = false;
        try {
          if (instance && instance.destroy) instance.destroy();
        } catch (err) {
          console.error(err);
        }
        disposers.forEach((d) => {
          try { d(); } catch (e) { /* ignore */ }
        });
        stage.innerHTML = '';
        stage.style.removeProperty('--ar');
      }
    };
  }

  window.Arcade = {
    games,
    lounge,
    register,
    get: (id) => games.find((g) => g.id === id) || lounge.find((g) => g.id === id),
    getBest,
    start,
    store,
    sound,
    colors,
    util
  };
})();
