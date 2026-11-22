/* Star Defender — vertical shooter where wreck cores from downed ships become wingmen. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 600;
  const H = 800;
  const TAU = Math.PI * 2;
  const UP = -Math.PI / 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const STEP = 1 / 110;
  const MAX_WING = 4;
  const SLOTS = [{ x: -46, y: 18 }, { x: 46, y: 18 }, { x: -86, y: 46 }, { x: 86, y: 46 }];
  const BOMB_BTN = { x: W - 54, y: H - 56, r: 34 };
  const MOVE_TOP = H * 0.42;
  const MOVE_BOTTOM = H - 84;
  const CAP = { enemies: 60, eb: 320, pb: 260, parts: 520, texts: 24, cores: 4, powers: 3 };

  // Enemy archetypes. `gun` is what a wingman built from this wreck fires.
  const TYPES = {
    drifter: { color: C.violet, hp: 2, r: 18, pts: 50, gun: 'twin cannons' },
    swooper: { color: C.mint, hp: 1, r: 15, pts: 75, gun: 'angled shots' },
    shooter: { color: C.gold, hp: 4, r: 19, pts: 100, gun: 'aimed shots' },
    splitter: { color: C.text, hp: 3, r: 18, pts: 80, gun: 'splitting shots' },
    mini: { color: C.text, hp: 1, r: 10, pts: 30, gun: '' },
    kamikaze: { color: C.p1, hp: 1, r: 14, pts: 90, gun: 'homing rockets' }
  };
  const CORE_TYPES = ['drifter', 'swooper', 'shooter', 'splitter', 'kamikaze'];
  const POWERS = {
    spread: { color: C.gold, letter: 'S', name: 'Spread shot' },
    rapid: { color: C.mint, letter: 'R', name: 'Rapid fire' },
    bomb: { color: C.p1, letter: 'B', name: 'Bomb' }
  };
  const BOSS_PATTERNS = [
    { name: 'fan', color: C.p1 },
    { name: 'aimed', color: C.gold },
    { name: 'spiral', color: C.violet }
  ];
  const SUBS = {
    1: 'Drifters and swoopers',
    2: 'Shooters aim at you',
    3: 'Splitters break in two',
    4: 'Kamikazes lock on and charge'
  };

  function hash(i) {
    const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  function drawFighter(ctx, x, y, s, color, t, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (1 - Math.min(0.35, Math.abs(tilt || 0))), s);
    const f = 9 + Math.sin(t * 38) * 3;
    ctx.fillStyle = U.alpha(C.gold, 0.9);
    ctx.beginPath();
    ctx.moveTo(-5, 11); ctx.lineTo(0, 12 + f); ctx.lineTo(5, 11);
    ctx.fill();
    ctx.fillStyle = U.alpha(color, 0.16);
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(color, 0.6);
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(20, 12); ctx.lineTo(11, 15); ctx.lineTo(0, 8);
    ctx.lineTo(-11, 15); ctx.lineTo(-20, 12);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(7, 4); ctx.lineTo(0, 12); ctx.lineTo(-7, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(0, -4, 2.6, 5.5, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawDrone(ctx, x, y, color, t) {
    drawFighter(ctx, x, y, 0.56, color, t, 0);
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = U.alpha(color, 0.7);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 15, t * 2, t * 2 + 1.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 15, t * 2 + Math.PI, t * 2 + Math.PI + 1.6);
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(0, 1, 2.2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawEnemy(ctx, e, t) {
    const T = TYPES[e.type];
    const pale = e.type === 'splitter' || e.type === 'mini';
    const col = e.flash > 0 ? (pale ? C.gold : C.text) : T.color;
    const r = e.r;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.fillStyle = U.alpha(T.color, 0.14);
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = col;
    if (e.type === 'drifter') {
      ctx.beginPath();
      ctx.ellipse(0, 3, r, r * 0.45, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.text, 0.85);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 0.5, r * 0.5, 0, Math.PI, TAU);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = Math.sin(t * 5 + i) > 0 ? C.ink : C.gold;
        ctx.fillRect(-r * 0.66 + i * r * 0.44 - 1.5, 3, 3, 3);
      }
    } else if (e.type === 'swooper') {
      ctx.rotate((e.ang || Math.PI / 2) - Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, r); ctx.lineTo(r, -r * 0.7); ctx.lineTo(r * 0.3, -r * 0.25);
      ctx.lineTo(0, -r * 0.55); ctx.lineTo(-r * 0.3, -r * 0.25); ctx.lineTo(-r, -r * 0.7);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, r * 0.1, r * 0.2, 0, TAU);
      ctx.fill();
    } else if (e.type === 'shooter') {
      ctx.save();
      ctx.rotate(e.ang || Math.PI / 2);
      ctx.fillStyle = C.text;
      ctx.fillRect(0, -3, r * 1.35, 6);
      ctx.restore();
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + Math.PI / 8;
        ctx.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
      }
      ctx.closePath();
      ctx.fill();
      const charge = e.fire != null && e.fire < 0.5 ? 1 - e.fire / 0.5 : 0;
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.45, 0, TAU);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.p1, 0.4 + charge * 0.6);
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.18 + charge * 0.2), 0, TAU);
      ctx.fill();
    } else if (e.type === 'splitter' || e.type === 'mini') {
      ctx.rotate(t * 1.4 + (e.phase || 0));
      const g = e.type === 'splitter' ? 2.5 : 0;
      ctx.beginPath();
      ctx.moveTo(-g, -r); ctx.lineTo(-r - g, 0); ctx.lineTo(-g, r);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(g, -r); ctx.lineTo(r + g, 0); ctx.lineTo(g, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.violet;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, TAU);
      ctx.fill();
    } else if (e.type === 'kamikaze') {
      ctx.rotate(e.ang || Math.PI / 2);
      if (e.mode === 2) {
        ctx.fillStyle = U.alpha(C.gold, 0.8);
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -5); ctx.lineTo(-r * 1.6 - Math.sin(t * 50) * 4, 0); ctx.lineTo(-r * 0.5, 5);
        ctx.fill();
        ctx.fillStyle = col;
      }
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.8, r * 0.85); ctx.lineTo(-r * 0.35, 0); ctx.lineTo(-r * 0.8, -r * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(r * 0.25, 0, r * 0.18, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCore(ctx, x, y, color, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = U.alpha(color, 0.12 + pulse * 0.1);
    ctx.beginPath();
    ctx.arc(0, 0, 24 + pulse * 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(color, 0.3);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    for (let i = 0; i < 3; i++) {
      const a = -t * 3.4 + (i * TAU) / 3;
      ctx.fillRect(Math.cos(a) * 19 - 1.5, Math.sin(a) * 19 - 1.5, 3, 3);
    }
    ctx.rotate(t * 1.8);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5 + pulse * 1.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBoss(ctx, b, t, glow) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const hull = b.flash > 0 ? C.text : C.p1;
    ctx.fillStyle = U.alpha(C.p1, 0.12);
    ctx.beginPath();
    ctx.ellipse(0, 0, 128, 72, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = b.flash > 0 ? C.text : C.violet;
    ctx.beginPath();
    ctx.moveTo(-112, -8); ctx.lineTo(-60, -34); ctx.lineTo(60, -34); ctx.lineTo(112, -8);
    ctx.lineTo(84, 26); ctx.lineTo(-84, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.fillRect(-68, 10, 12, 26);
    ctx.fillRect(56, 10, 12, 26);
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.ellipse(0, 0, 70, 40, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.ellipse(0, 6, 30, 20, 0, 0, TAU);
    ctx.fill();
    const g = glow || C.p1;
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    ctx.fillStyle = U.alpha(g, 0.35 + pulse * 0.3);
    ctx.beginPath();
    ctx.arc(0, 6, 22, 0, TAU);
    ctx.fill();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 6, 10 + pulse * 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  Arcade.register({
    id: 'star-defender',
    title: 'Star Defender',
    mode: 'solo',
    players: '1P',
    original: false,
    color: C.p2,
    tagline: 'Blast through waves of alien ships and their bosses.',
    hook: 'Collect wreckage from downed ships to build a squadron of wingmen.',
    tags: ['shooter', 'arcade', 'space', 'waves', 'keyboard', 'touch'],
    howTo: 'Fly in the lower half of the screen and shoot down each wave. Some wrecks leave a glowing core: ' +
      'fly into it and a wingman joins your squadron (up to 4). Each wingman fires like the ship it came from ' +
      'and blocks one bullet for you. Every fifth wave brings a boss. Power-ups give spread shot, rapid fire ' +
      'and bombs. Getting hit costs a life and resets your score multiplier.',
    controls: [
      { keys: ['←', '→', '↑', '↓'], label: 'Fly' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Fly' },
      { keys: ['Space'], label: 'Hold to fire' },
      { keys: ['B'], label: 'Bomb' },
      { keys: ['Drag'], label: 'Fly and auto-fire with mouse or touch' }
    ],
    best: 'high',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const neb = ctx.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.25, h * 0.2, w * 0.6);
      neb.addColorStop(0, U.alpha(C.violet, 0.28));
      neb.addColorStop(1, U.alpha(C.violet, 0));
      ctx.fillStyle = neb;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const l = i % 3;
        const y = (hash(i + 99) * h + t * [8, 20, 44][l]) % h;
        ctx.fillStyle = U.alpha(C.text, [0.3, 0.55, 0.9][l]);
        ctx.fillRect(hash(i) * w, y, l * 0.7 + 1, l * 0.7 + 1);
      }
      const s = h / 250;
      const vw = w / s;
      const vh = h / s;
      ctx.save();
      ctx.scale(s, s);
      const px = vw * 0.46 + Math.sin(t * 1.3) * 18;
      const py = vh * 0.76;
      const wings = [
        { slot: 0, color: C.violet }, { slot: 1, color: C.mint }, { slot: 2, color: C.gold }
      ];
      // Shots streaking up.
      ctx.fillStyle = C.p2;
      for (let k = 0; k < 4; k++) {
        const yy = py - 34 - ((t * 260 + k * 46) % 180);
        ctx.fillRect(px - 1.5, yy, 3, 12);
      }
      wings.forEach((wg, i) => {
        const sl = SLOTS[wg.slot];
        ctx.fillStyle = wg.color;
        for (let k = 0; k < 3; k++) {
          const yy = py + sl.y - 26 - ((t * 240 + k * 60 + i * 20) % 170);
          const dx = wg.slot === 1 ? (py + sl.y - yy) * 0.3 : 0;
          ctx.fillRect(px + sl.x - 1.5 + dx, yy, 3, 10);
        }
      });
      drawEnemy(ctx, { type: 'drifter', x: vw * 0.2, y: vh * 0.2, r: 16, flash: 0 }, t);
      drawEnemy(ctx, { type: 'swooper', x: vw * 0.5 + Math.sin(t * 2) * 30, y: vh * 0.13, r: 14, ang: Math.PI / 2, flash: 0 }, t);
      drawEnemy(ctx, { type: 'shooter', x: vw * 0.8, y: vh * 0.24, r: 17, ang: 2.2, flash: 0, fire: 1 }, t);
      ctx.fillStyle = U.alpha(C.gold, 0.35);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(vw * 0.74 - k * 20, vh * 0.34 + k * 26, 7, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = C.gold;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(vw * 0.74 - k * 20, vh * 0.34 + k * 26, 4, 0, TAU);
        ctx.fill();
      }
      // Squadron: three wingmen plus an empty slot waiting for the next core.
      ctx.strokeStyle = U.alpha(C.p2, 0.3);
      ctx.setLineDash([3, 5]);
      ctx.lineWidth = 1.5;
      wings.forEach((wg) => {
        const sl = SLOTS[wg.slot];
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + sl.x, py + sl.y);
        ctx.stroke();
      });
      const empty = SLOTS[3];
      const ex = px + empty.x;
      const ey = py + empty.y;
      ctx.strokeStyle = U.alpha(C.p1, 0.75);
      ctx.beginPath();
      ctx.arc(ex, ey, 15, 0, TAU);
      ctx.stroke();
      const cx = vw * 0.84;
      const cy = vh * 0.5 + Math.sin(t * 2) * 6;
      ctx.strokeStyle = U.alpha(C.p1, 0.55);
      ctx.beginPath();
      ctx.moveTo(cx, cy + 18);
      ctx.quadraticCurveTo(cx + 10, (cy + ey) / 2, ex + 8, ey - 16);
      ctx.stroke();
      ctx.setLineDash([]);
      wings.forEach((wg) => drawDrone(ctx, px + SLOTS[wg.slot].x, py + SLOTS[wg.slot].y, wg.color, t + wg.slot));
      drawFighter(ctx, px, py, 1, C.p2, t, 0);
      drawCore(ctx, cx, cy, C.p1, t);
      ctx.font = HUD;
      ctx.textAlign = 'right';
      ctx.fillStyle = C.p1;
      ctx.fillText('+1 wingman', cx + 26, cy - 30);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      canvas.style.touchAction = 'none';

      const LAYERS = [
        { v: 22, s: 1, a: 0.35, px: 0.03 },
        { v: 58, s: 1.6, a: 0.6, px: 0.07 },
        { v: 150, s: 2.4, a: 0.9, px: 0.14 }
      ];
      const stars = [];
      [48, 30, 16].forEach((n, l) => {
        for (let i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H, l, tw: Math.random() * TAU });
      });
      const nebula = ctx.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, W * 0.8);
      nebula.addColorStop(0, U.alpha(C.violet, 0.14));
      nebula.addColorStop(1, U.alpha(C.violet, 0));

      const seen = {};
      const sfxNext = {};
      let state = 'menu'; // 'menu' | 'play' | 'dying' | 'over'
      let player, wing, enemies, eb, pb, cores, powers, parts, texts, boss;
      let score, lives, bombs, wave, combo, mult, spread, rapidT, fireCd, peakWing;
      let queue, waveT, clearT, announce, shake, flash, deadT, hint, hintT, lastStatus, sinceCore, clock;
      let drag = null;

      function reset() {
        player = { x: W / 2, y: H - 150, inv: 2, alive: true, tilt: 0 };
        wing = [];
        enemies = [];
        eb = [];
        pb = [];
        cores = [];
        powers = [];
        parts = [];
        texts = [];
        boss = null;
        score = 0;
        lives = 3;
        bombs = 1;
        wave = 0;
        combo = 0;
        mult = 1;
        spread = 0;
        rapidT = 0;
        fireCd = 0;
        peakWing = 0;
        queue = [];
        waveT = 0;
        clearT = 0;
        announce = null;
        shake = 0;
        flash = 0;
        deadT = 0;
        hint = '';
        hintT = 0;
        lastStatus = '';
        sinceCore = 0;
        clock = 0;
        drag = null;
        api.setScore(0);
      }

      function sfx(name, gap) {
        if ((sfxNext[name] || 0) > clock) return;
        sfxNext[name] = clock + (gap || 0);
        api.sfx(name);
      }

      function say(text, secs) {
        hint = text;
        hintT = secs;
      }

      function refreshStatus() {
        let s;
        if (state === 'menu') s = 'Collect wreck cores from downed ships to build a squadron.';
        else if (hintT > 0) s = hint;
        else {
          s = 'Wave ' + wave + ' · Lives ' + lives + ' · Wingmen ' + wing.length + '/' + MAX_WING +
            ' · Bombs ' + bombs + ' · x' + mult;
        }
        if (s !== lastStatus) {
          lastStatus = s;
          api.setStatus(s);
        }
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed) {
        for (let i = 0; i < n && parts.length < CAP.parts; i++) {
          const a = Math.random() * TAU;
          const v = Math.random() * speed;
          const life = U.rand(0.3, 0.8);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, color, size: U.rand(1.5, 3.5), ring: 0 });
        }
      }

      function ring(x, y, color, radius, life) {
        if (parts.length < CAP.parts) parts.push({ x, y, vx: 0, vy: 0, life, max: life, color, size: 3, ring: radius });
      }

      function popText(x, y, text, color) {
        if (texts.length >= CAP.texts) texts.shift();
        texts.push({ x, y, text, color, life: 1.1 });
      }

      function announceIt(title, sub) {
        announce = { title, sub, t: 0, life: 2.4 };
      }

      /* ---------- Waves ---------- */
      function addGroup(q, type, at, n) {
        const extra = Math.floor(n / 4);
        if (type === 'drifter') {
          const k = Math.min(7, 3 + extra + U.randInt(0, 1));
          for (let i = 0; i < k; i++) q.push({ at: at + i * 0.06, type, x: (W / (k + 1)) * (i + 1) });
          return at;
        }
        if (type === 'swooper') {
          const k = Math.min(8, 4 + extra);
          const x0 = U.rand(140, W - 140);
          const phase = U.pick([0, Math.PI]);
          for (let i = 0; i < k; i++) q.push({ at: at + i * 0.26, type, x: x0, extra: { phase } });
          return at + k * 0.26;
        }
        if (type === 'shooter') {
          const k = Math.min(4, 1 + Math.floor(n / 5) + U.randInt(0, 1));
          for (let i = 0; i < k; i++) q.push({ at: at + i * 0.4, type, x: U.rand(60, W - 60) });
          return at + k * 0.4;
        }
        if (type === 'splitter') {
          const k = Math.min(5, 2 + extra);
          for (let i = 0; i < k; i++) q.push({ at: at + i * 0.5, type, x: U.rand(70, W - 70) });
          return at + k * 0.5;
        }
        const k = Math.min(6, 2 + extra);
        for (let i = 0; i < k; i++) q.push({ at: at + i * 0.6, type, x: U.rand(60, W - 60) });
        return at + k * 0.6;
      }

      function buildWave(n) {
        const q = [];
        const pool = ['drifter', 'swooper'];
        if (n >= 2) pool.push('shooter');
        if (n >= 3) pool.push('splitter');
        if (n >= 4) pool.push('kamikaze');
        const intro = { 2: 'shooter', 3: 'splitter', 4: 'kamikaze' }[n];
        const groups = Math.min(10, 3 + Math.floor(n * 0.7));
        let at = 1.6;
        for (let g = 0; g < groups; g++) {
          let type = U.pick(pool);
          if (g === 0) type = n === 1 ? 'drifter' : type;
          if (g === 1 && intro) type = intro;
          at = addGroup(q, type, at, n);
          at += Math.max(1.1, U.rand(2.0, 3.0) - n * 0.06);
        }
        return q.sort((a, b) => a.at - b.at);
      }

      function startWave(n) {
        wave = n;
        waveT = 0;
        clearT = 0;
        if (n % 5 === 0) {
          queue = [{ at: 2.2, type: 'boss' }];
          announceIt('Wave ' + n, 'Boss approaching');
        } else {
          queue = buildWave(n);
          announceIt('Wave ' + n, SUBS[n] || (n > 5 ? 'They are getting faster' : 'Incoming'));
        }
        sfx('flip');
      }

      function spawnEnemy(type, x, y, extra) {
        if (enemies.length >= CAP.enemies) return null;
        const T = TYPES[type];
        const e = {
          type, x, y, r: T.r, hp: T.hp + (type !== 'mini' && wave >= 8 ? 1 : 0), t: 0, flash: 0,
          spd: 1 + Math.min(0.9, (wave - 1) * 0.045), vx: 0, vy: 0, x0: x, phase: Math.random() * TAU,
          ang: Math.PI / 2, mode: 0, fire: U.rand(0.9, 1.8), hold: U.rand(110, 280), dead: false
        };
        if (type === 'splitter' || type === 'shooter') e.vx = U.pick([-1, 1]) * U.rand(30, 65);
        if (type === 'kamikaze') e.hold = U.rand(70, 170);
        if (extra) Object.assign(e, extra);
        enemies.push(e);
        if (type === 'kamikaze' && !seen.kamikaze) {
          seen.kamikaze = true;
          say('Kamikazes lock on, then charge along the red line. Sidestep them.', 5);
        }
        return e;
      }

      function enemyShot(x, y, ang, v, color) {
        if (eb.length >= CAP.eb) return;
        eb.push({ x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, r: 5, color, dead: false });
      }

      function stepEnemy(e, dt) {
        e.t += dt;
        e.flash = Math.max(0, e.flash - dt);
        if (e.type === 'drifter') {
          e.y += 70 * e.spd * dt;
          e.x += Math.sin(e.t * 1.6 + e.phase) * 40 * dt;
        } else if (e.type === 'swooper') {
          e.y += 165 * e.spd * dt;
          e.x = e.x0 + Math.sin(e.t * 2.4 + e.phase) * 115;
          e.ang = Math.PI / 2 - Math.cos(e.t * 2.4 + e.phase) * 0.7;
        } else if (e.type === 'shooter') {
          e.ang = Math.atan2(player.y - e.y, player.x - e.x);
          if (e.y < e.hold) e.y += 140 * dt;
          else {
            e.x += e.vx * dt;
            if (e.x < 40 || e.x > W - 40) {
              e.vx = -e.vx;
              e.x = U.clamp(e.x, 40, W - 40);
            }
            if (e.t > 18) e.y += 50 * dt;
            e.fire -= dt;
            if (e.fire <= 0) {
              e.fire = U.rand(1.5, 2.4) / e.spd;
              if (player.alive && state === 'play') {
                const v = 220 + Math.min(120, wave * 6);
                enemyShot(e.x, e.y, e.ang, v, C.gold);
                if (wave >= 7) {
                  enemyShot(e.x, e.y, e.ang - 0.2, v, C.gold);
                  enemyShot(e.x, e.y, e.ang + 0.2, v, C.gold);
                }
              }
            }
          }
        } else if (e.type === 'splitter') {
          e.y += 75 * e.spd * dt;
          e.x += e.vx * dt;
          if (e.x < 30 || e.x > W - 30) e.vx = -e.vx;
        } else if (e.type === 'mini') {
          e.x += e.vx * dt;
          e.y += e.vy * dt;
        } else if (e.type === 'kamikaze') {
          if (e.mode === 0) {
            e.y += 190 * dt;
            if (e.y >= e.hold) {
              e.mode = 1;
              e.t = 0;
            }
          } else if (e.mode === 1) {
            e.ang = Math.atan2(player.y - e.y, player.x - e.x);
            if (e.t > 0.85) {
              e.mode = 2;
              const v = 470 * e.spd;
              e.vx = Math.cos(e.ang) * v;
              e.vy = Math.sin(e.ang) * v;
              sfx('shoot', 0.1);
            }
          } else {
            e.x += e.vx * dt;
            e.y += e.vy * dt;
          }
        }
        if (e.y > H + 50 || e.y < -260 || e.x < -80 || e.x > W + 80) e.dead = true;
      }

      function damage(e, dmg) {
        if (e.dead) return;
        e.hp -= dmg;
        e.flash = 0.08;
        if (e.hp <= 0) killEnemy(e);
      }

      function addScore(n, x, y, color) {
        const v = Math.round(n * mult);
        score += v;
        api.setScore(score);
        if (x != null) popText(x, y, '+' + v, color || C.text);
      }

      function killEnemy(e) {
        e.dead = true;
        const T = TYPES[e.type];
        combo++;
        mult = Math.min(6, 1 + Math.floor(combo / 8));
        addScore(T.pts, e.x, e.y - 8, T.color);
        burst(e.x, e.y, T.color, e.type === 'mini' ? 8 : 18, 220);
        ring(e.x, e.y, T.color, e.r * 2.6, 0.4);
        shake = Math.max(shake, e.type === 'mini' ? 2 : 5);
        sfx(e.type === 'shooter' || e.type === 'splitter' ? 'boom' : 'hit', 0.06);
        if (e.type === 'splitter') {
          for (const s of [-1, 1]) {
            spawnEnemy('mini', e.x + s * 8, e.y, { vx: s * 120, vy: 150 * e.spd, phase: e.phase });
          }
        }
        if (e.type === 'mini') return;
        sinceCore++;
        const chance = 0.1 + sinceCore * 0.025 + (wing.length === 0 ? 0.05 : 0);
        if (cores.length < CAP.cores && wing.length + cores.length < MAX_WING + 1 && Math.random() < chance) {
          spawnCore(e.x, e.y, e.type);
          sinceCore = 0;
        } else if (powers.length < CAP.powers && Math.random() < 0.07) {
          spawnPower(e.x, e.y);
        }
      }

      function spawnCore(x, y, type) {
        cores.push({ x, y, vx: U.rand(-20, 20), vy: 70, type, color: TYPES[type].color, t: 0, dead: false });
        if (!seen.core) {
          seen.core = true;
          say('A wreck dropped a glowing core. Fly into it to add a wingman to your squadron.', 6);
        }
      }

      function spawnPower(x, y, kind) {
        let k = kind;
        if (!k) {
          const r = Math.random();
          k = r < 0.45 && spread < 3 ? 'spread' : r < 0.75 ? 'rapid' : 'bomb';
        }
        powers.push({ x, y, kind: k, t: 0, dead: false });
      }

      /* ---------- Boss ---------- */
      function spawnBoss() {
        const k = Math.max(1, Math.round(wave / 5));
        const hp = 160 + (k - 1) * 110;
        boss = { x: W / 2, y: -140, hp, max: hp, t: 0, pat: 0, patT: 0, gap: 1.2, shot: 0, burst: 0, spin: 0, flash: 0, k, dying: 0 };
        if (!seen.boss) {
          seen.boss = true;
          say('Boss! Its core glows a new color before each attack. It drops two wreck cores.', 6);
        }
      }

      function hurtBoss(dmg) {
        if (!boss || boss.dying > 0) return;
        boss.hp -= dmg;
        boss.flash = 0.06;
        if (boss.hp <= 0) {
          boss.hp = 0;
          boss.dying = 1.4;
          for (const b of eb) b.dead = true;
          shake = 14;
          sfx('boom');
        }
      }

      function finishBoss() {
        const b = boss;
        boss = null;
        burst(b.x, b.y, C.p1, 60, 420);
        burst(b.x, b.y, C.gold, 40, 300);
        ring(b.x, b.y, C.p1, 220, 0.8);
        ring(b.x, b.y, C.violet, 140, 0.6);
        shake = 26;
        flash = 0.7;
        const bonus = Math.round(1500 * b.k * mult);
        addScore(1500 * b.k, b.x, b.y, C.gold);
        combo += 8;
        mult = Math.min(6, 1 + Math.floor(combo / 8));
        spawnCore(b.x - 40, b.y, U.pick(CORE_TYPES));
        spawnCore(b.x + 40, b.y, U.pick(CORE_TYPES));
        spawnPower(b.x, b.y + 20, spread < 3 ? 'spread' : 'bomb');
        announceIt('Boss down', '+' + bonus + ' and two wreck cores');
        api.sfx('win');
      }

      function stepBoss(dt) {
        const b = boss;
        b.t += dt;
        b.flash = Math.max(0, b.flash - dt);
        if (b.dying > 0) {
          b.dying -= dt;
          if (Math.random() < dt * 14) {
            const x = b.x + U.rand(-90, 90);
            const y = b.y + U.rand(-30, 30);
            burst(x, y, U.pick([C.p1, C.gold, C.violet]), 12, 200);
            ring(x, y, C.gold, 40, 0.35);
            sfx('hit', 0.08);
            shake = Math.max(shake, 8);
          }
          if (b.dying <= 0) finishBoss();
          return;
        }
        if (b.y < 150) {
          b.y += 110 * dt;
          return;
        }
        b.x = W / 2 + Math.sin(b.t * 0.55) * 170;
        if (b.gap > 0) {
          b.gap -= dt;
          return;
        }
        const rage = b.hp < b.max * 0.5 ? 0.72 : 1;
        const p = BOSS_PATTERNS[b.pat].name;
        b.patT += dt;
        b.shot -= dt;
        if (b.shot <= 0 && state === 'play') {
          if (p === 'fan') {
            const n = 9 + b.k * 2;
            const off = (b.burst % 2) * 0.08;
            for (let i = 0; i < n; i++) enemyShot(b.x, b.y + 36, Math.PI / 2 + (i - (n - 1) / 2) * 0.16 + off, 190, C.p1);
            b.burst++;
            b.shot = 0.95 * rage;
            sfx('shoot', 0.1);
          } else if (p === 'aimed') {
            const sx = b.x + (b.burst % 2 ? 62 : -62);
            const sy = b.y + 36;
            enemyShot(sx, sy, Math.atan2(player.y - sy, player.x - sx), 300, C.gold);
            b.burst++;
            b.shot = (b.burst % 6 === 0 ? 0.7 : 0.12) * rage;
            sfx('shoot', 0.12);
          } else {
            b.spin += 0.37;
            for (let j = 0; j < 3; j++) enemyShot(b.x, b.y + 6, b.spin + (j * TAU) / 3, 165, C.violet);
            b.shot = 0.085 * rage;
            sfx('tick', 0.2);
          }
        }
        if (b.patT > 5) {
          b.patT = 0;
          b.pat = (b.pat + 1) % BOSS_PATTERNS.length;
          b.gap = 1.0;
          b.shot = 0.2;
          b.burst = 0;
        }
      }

      function inBoss(x, y, pad) {
        if (!boss || boss.dying > 0) return false;
        const dx = (x - boss.x) / (88 + pad);
        const dy = (y - boss.y) / (44 + pad);
        return dx * dx + dy * dy <= 1;
      }

      /* ---------- Player, wingmen, weapons ---------- */
      function addPB(x, y, ang, v, dmg, color) {
        if (pb.length >= CAP.pb) return null;
        const b = { x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, dmg, color, r: 4, dead: false, split: -1, homing: false, life: 3 };
        pb.push(b);
        return b;
      }

      function nearestTarget(x, y) {
        let best = null;
        let bd = Infinity;
        for (const e of enemies) {
          if (e.dead || e.y < 0) continue;
          const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (boss && boss.dying <= 0 && boss.y > 0) {
          const d = (boss.x - x) * (boss.x - x) + (boss.y - y) * (boss.y - y);
          if (d < bd) best = boss;
        }
        return best;
      }

      function playerFire() {
        fireCd = rapidT > 0 ? 0.075 : 0.15;
        const n = spread * 2 + 1;
        for (let i = 0; i < n; i++) {
          const o = i - (n - 1) / 2;
          addPB(player.x + o * 4, player.y - 20, UP + o * 0.13, 880, 1, C.p2);
        }
        sfx('shoot', 0.13);
      }

      function wingFire(w) {
        const k = w.type;
        if (k === 'drifter') {
          addPB(w.x - 5, w.y - 10, UP, 820, 1, w.color);
          addPB(w.x + 5, w.y - 10, UP, 820, 1, w.color);
          w.cd = 0.26;
        } else if (k === 'swooper') {
          const side = SLOTS[w.slot].x < 0 ? -1 : 1;
          addPB(w.x, w.y - 8, UP + side * 0.12, 800, 1, w.color);
          addPB(w.x, w.y - 8, UP + side * 0.36, 800, 1, w.color);
          w.cd = 0.24;
        } else if (k === 'shooter') {
          const tg = nearestTarget(w.x, w.y);
          addPB(w.x, w.y - 8, tg ? Math.atan2(tg.y - w.y, tg.x - w.x) : UP, 760, 1, w.color);
          w.cd = 0.3;
        } else if (k === 'splitter') {
          const b = addPB(w.x, w.y - 8, UP, 700, 1, w.color);
          if (b) {
            b.split = 0.22;
            b.r = 5;
          }
          w.cd = 0.42;
        } else {
          const b = addPB(w.x, w.y - 8, UP, 380, 3, w.color);
          if (b) {
            b.homing = true;
            b.r = 5;
          }
          w.cd = 0.85;
        }
      }

      function addWingman(c) {
        if (wing.length >= MAX_WING) {
          addScore(250, c.x, c.y - 14, C.gold);
          popText(c.x, c.y - 34, 'Squadron full', C.muted);
          sfx('score');
          return;
        }
        const used = wing.map((w) => w.slot);
        let slot = 0;
        while (used.includes(slot)) slot++;
        wing.push({ type: c.type, slot, x: c.x, y: c.y, cd: 0.3, color: c.color, born: 0 });
        peakWing = Math.max(peakWing, wing.length);
        const gun = TYPES[c.type].gun;
        popText(c.x, c.y - 14, 'Wingman: ' + gun, c.color);
        api.sfx('power');
        if (!seen.wing) {
          seen.wing = true;
          say('Wingman joined. It fires ' + gun + ' like its wreck and takes one hit for you.', 6);
        }
      }

      function loseWingman(i) {
        const w = wing[i];
        wing.splice(i, 1);
        burst(w.x, w.y, w.color, 20, 220);
        ring(w.x, w.y, w.color, 40, 0.4);
        popText(w.x, w.y - 12, 'Wingman lost', C.muted);
        shake = Math.max(shake, 7);
        sfx('hit', 0.05);
        if (!seen.shield) {
          seen.shield = true;
          say('Your wingman took that hit, so your lives and multiplier are safe.', 5);
        }
      }

      function hurtPlayer() {
        if (!player.alive || player.inv > 0) return;
        lives--;
        combo = 0;
        mult = 1;
        spread = Math.max(0, spread - 1);
        rapidT = 0;
        burst(player.x, player.y, C.p2, 34, 300);
        burst(player.x, player.y, C.gold, 16, 200);
        ring(player.x, player.y, C.p2, 90, 0.5);
        shake = 18;
        flash = 0.6;
        api.sfx('boom');
        for (const b of eb) {
          if (U.dist(b.x, b.y, player.x, player.y) < 150) b.dead = true;
        }
        if (lives <= 0) {
          player.alive = false;
          state = 'dying';
          deadT = 1.6;
          drag = null;
        } else {
          player.inv = 2.4;
          popText(player.x, player.y - 30, 'Multiplier reset', C.p1);
        }
      }

      function useBomb() {
        if (state !== 'play' || !player.alive) return;
        if (bombs <= 0) {
          sfx('tick', 0.2);
          return;
        }
        bombs--;
        let n = 0;
        for (const b of eb) {
          if (!b.dead && n++ < 80) burst(b.x, b.y, b.color, 1, 60);
          b.dead = true;
        }
        for (const e of enemies) damage(e, 8);
        hurtBoss(30);
        ring(player.x, player.y, C.text, 700, 0.7);
        ring(player.x, player.y, C.p1, 520, 0.55);
        flash = 0.8;
        shake = 22;
        api.sfx('boom');
      }

      function collectPower(p) {
        const P = POWERS[p.kind];
        if (p.kind === 'spread') {
          if (spread < 3) spread++;
          else addScore(300, p.x, p.y - 20, C.gold);
          popText(p.x, p.y, 'Spread shot ' + spread + '/3', P.color);
        } else if (p.kind === 'rapid') {
          rapidT = 10;
          popText(p.x, p.y, 'Rapid fire', P.color);
        } else {
          bombs = Math.min(3, bombs + 1);
          popText(p.x, p.y, '+1 bomb', P.color);
        }
        ring(p.x, p.y, P.color, 46, 0.4);
        api.sfx('power');
      }

      /* ---------- Simulation ---------- */
      function sweep(arr) {
        let j = 0;
        for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
        arr.length = j;
      }

      function movePlayer(dt) {
        const k = api.keys;
        let ix = 0;
        let iy = 0;
        if (k.has('ArrowLeft') || k.has('KeyA')) ix -= 1;
        if (k.has('ArrowRight') || k.has('KeyD')) ix += 1;
        if (k.has('ArrowUp') || k.has('KeyW')) iy -= 1;
        if (k.has('ArrowDown') || k.has('KeyS')) iy += 1;
        let vx = 0;
        if (ix || iy) {
          const m = Math.hypot(ix, iy);
          vx = (ix / m) * 380;
          player.x += vx * dt;
          player.y += (iy / m) * 380 * dt;
        } else if (drag) {
          const dx = drag.tx - player.x;
          const dy = drag.ty - player.y;
          const d = Math.hypot(dx, dy);
          const maxStep = 1100 * dt;
          if (d > 0.01) {
            const s = Math.min(1, maxStep / d);
            player.x += dx * s;
            player.y += dy * s;
            vx = (dx * s) / dt;
          }
        }
        player.x = U.clamp(player.x, 22, W - 22);
        player.y = U.clamp(player.y, MOVE_TOP, MOVE_BOTTOM);
        player.tilt = U.lerp(player.tilt, U.clamp(vx / 1200, -0.35, 0.35), Math.min(1, dt * 12));
      }

      function stepWorld(dt) {
        const playing = state === 'play' && player.alive;
        if (playing) movePlayer(dt);
        player.inv = Math.max(0, player.inv - dt);
        rapidT = Math.max(0, rapidT - dt);
        fireCd -= dt;
        const firing = playing && (api.keys.has('Space') || !!drag);
        if (firing && fireCd <= 0) playerFire();

        const follow = 1 - Math.exp(-9 * dt);
        for (const w of wing) {
          const s = SLOTS[w.slot];
          w.x += (player.x + s.x - w.x) * follow;
          w.y += (player.y + s.y + Math.sin(clock * 3 + w.slot) * 3 - w.y) * follow;
          w.born += dt;
          w.cd -= dt;
          if (firing && w.cd <= 0) wingFire(w);
        }

        for (let i = 0; i < enemies.length; i++) stepEnemy(enemies[i], dt);
        if (boss) stepBoss(dt);

        // Player shots.
        for (let i = 0; i < pb.length; i++) {
          const b = pb[i];
          if (b.dead) continue;
          if (b.homing) {
            const tg = nearestTarget(b.x, b.y);
            let sp = Math.hypot(b.vx, b.vy);
            sp = Math.min(640, sp + 500 * dt);
            let a = Math.atan2(b.vy, b.vx);
            if (tg) {
              let d = Math.atan2(tg.y - b.y, tg.x - b.x) - a;
              while (d > Math.PI) d -= TAU;
              while (d < -Math.PI) d += TAU;
              a += U.clamp(d, -5 * dt, 5 * dt);
            }
            b.vx = Math.cos(a) * sp;
            b.vy = Math.sin(a) * sp;
            if (Math.random() < dt * 30 && parts.length < CAP.parts) {
              parts.push({ x: b.x, y: b.y, vx: 0, vy: 30, life: 0.3, max: 0.3, color: C.gold, size: 2, ring: 0 });
            }
          }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.life -= dt;
          if (b.split > 0) {
            b.split -= dt;
            if (b.split <= 0) {
              b.dead = true;
              const a = Math.atan2(b.vy, b.vx);
              addPB(b.x, b.y, a - 0.38, 700, 1, b.color);
              addPB(b.x, b.y, a + 0.38, 700, 1, b.color);
              continue;
            }
          }
          if (b.life <= 0 || b.y < -30 || b.y > H + 30 || b.x < -30 || b.x > W + 30) {
            b.dead = true;
            continue;
          }
          for (const e of enemies) {
            if (e.dead) continue;
            const rr = e.r + b.r;
            if ((e.x - b.x) * (e.x - b.x) + (e.y - b.y) * (e.y - b.y) < rr * rr) {
              b.dead = true;
              burst(b.x, b.y, b.color, 3, 120);
              damage(e, b.dmg);
              break;
            }
          }
          if (!b.dead && inBoss(b.x, b.y, b.r)) {
            b.dead = true;
            burst(b.x, b.y, C.gold, 3, 140);
            hurtBoss(b.dmg);
          }
        }

        // Enemy shots: wingmen soak them first.
        for (const b of eb) {
          if (b.dead) continue;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          if (b.y < -40 || b.y > H + 40 || b.x < -40 || b.x > W + 40) {
            b.dead = true;
            continue;
          }
          let hit = -1;
          for (let i = 0; i < wing.length; i++) {
            const rr = b.r + 11;
            if ((wing[i].x - b.x) * (wing[i].x - b.x) + (wing[i].y - b.y) * (wing[i].y - b.y) < rr * rr) {
              hit = i;
              break;
            }
          }
          if (hit >= 0) {
            b.dead = true;
            loseWingman(hit);
            continue;
          }
          if (player.alive && player.inv <= 0) {
            const rr = b.r + 6;
            if ((player.x - b.x) * (player.x - b.x) + (player.y - b.y) * (player.y - b.y) < rr * rr) {
              b.dead = true;
              hurtPlayer();
            }
          }
        }

        // Ships ramming the squadron.
        for (const e of enemies) {
          if (e.dead) continue;
          for (let i = wing.length - 1; i >= 0; i--) {
            if (U.dist(e.x, e.y, wing[i].x, wing[i].y) < e.r + 11) {
              loseWingman(i);
              damage(e, 3);
              break;
            }
          }
          if (!e.dead && player.alive && player.inv <= 0 && U.dist(e.x, e.y, player.x, player.y) < e.r * 0.8 + 12) {
            hurtPlayer();
            damage(e, 5);
          }
        }
        if (player.alive && player.inv <= 0 && inBoss(player.x, player.y, 8)) hurtPlayer();

        // Pickups.
        for (const c of cores) {
          c.t += dt;
          const d = U.dist(c.x, c.y, player.x, player.y);
          if (player.alive && d < 140) {
            const pull = 300 / Math.max(d, 1);
            c.x += (player.x - c.x) * pull * dt;
            c.y += (player.y - c.y) * pull * dt;
          } else {
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.x = U.clamp(c.x, 20, W - 20);
          }
          if (player.alive && d < 28) {
            c.dead = true;
            burst(c.x, c.y, c.color, 24, 240);
            ring(c.x, c.y, c.color, 60, 0.45);
            addWingman(c);
          } else if (c.y > H + 30) c.dead = true;
        }
        for (const p of powers) {
          p.t += dt;
          p.y += 85 * dt;
          p.x += Math.sin(p.t * 2) * 20 * dt;
          if (player.alive && U.dist(p.x, p.y, player.x, player.y) < 30) {
            p.dead = true;
            collectPower(p);
          } else if (p.y > H + 30) p.dead = true;
        }

        sweep(pb);
        sweep(eb);
        sweep(enemies);
        sweep(cores);
        sweep(powers);
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 40);
        flash = Math.max(0, flash - dt * 2.5);
        hintT = Math.max(0, hintT - dt);
        if (announce) {
          announce.t += dt;
          if (announce.t > announce.life) announce = null;
        }
        for (const s of stars) {
          s.y += LAYERS[s.l].v * dt;
          if (s.y > H) {
            s.y -= H;
            s.x = Math.random() * W;
          }
        }
        for (const p of parts) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 2.5;
          p.vy *= 1 - dt * 2.5;
          if (p.life <= 0) p.dead = true;
        }
        sweep(parts);
        for (const tx of texts) {
          tx.life -= dt;
          tx.y -= 34 * dt;
        }
        while (texts.length && texts[0].life <= 0) texts.shift();

        if (state === 'play' || state === 'dying') {
          const steps = Math.max(1, Math.ceil(dt / STEP));
          for (let i = 0; i < steps; i++) stepWorld(dt / steps);
        }
        if (state === 'play') {
          waveT += dt;
          while (queue.length && queue[0].at <= waveT) {
            const it = queue.shift();
            if (it.type === 'boss') spawnBoss();
            else spawnEnemy(it.type, it.x, -30, it.extra);
          }
          if (!queue.length && !enemies.length && !boss) {
            clearT += dt;
            if (clearT > 1.4) startWave(wave + 1);
          }
        } else if (state === 'dying') {
          deadT -= dt;
          if (deadT <= 0) gameOver();
        }
        refreshStatus();
      }

      /* ---------- Drawing ---------- */
      function drawHud() {
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
          const on = i < lives;
          drawFighter(ctx, 26 + i * 30, 28, 0.5, on ? C.p2 : C.line, clock, 0);
        }
        ctx.textAlign = 'left';
        let y = 58;
        if (spread > 0) {
          ctx.fillStyle = C.gold;
          ctx.fillText('Spread ' + spread + '/3', 14, y);
          y += 22;
        }
        if (rapidT > 0) {
          ctx.fillStyle = C.mint;
          ctx.fillText('Rapid', 14, y);
          ctx.fillStyle = U.alpha(C.mint, 0.3);
          ctx.fillRect(70, y - 4, 80, 8);
          ctx.fillStyle = C.mint;
          ctx.fillRect(70, y - 4, 80 * (rapidT / 10), 8);
        }
        // Multiplier.
        ctx.textAlign = 'right';
        ctx.fillStyle = mult > 1 ? C.gold : C.muted;
        ctx.fillText('x' + mult + ' multiplier', W - 14, 24);
        ctx.fillStyle = U.alpha(C.line, 0.9);
        ctx.fillRect(W - 134, 38, 120, 5);
        ctx.fillStyle = C.gold;
        ctx.fillRect(W - 134, 38, mult >= 6 ? 120 : 120 * ((combo % 8) / 8), 5);

        // Squadron slots: the hook, always on screen.
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('Squadron', 14, H - 66);
        for (let i = 0; i < MAX_WING; i++) {
          const x = 30 + i * 34;
          const yy = H - 36;
          const w = wing.find((m) => m.slot === i);
          ctx.fillStyle = U.alpha(C.panel, 0.85);
          ctx.beginPath();
          ctx.arc(x, yy, 14, 0, TAU);
          ctx.fill();
          if (w) {
            ctx.strokeStyle = w.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(x, yy, 14, 0, TAU);
            ctx.stroke();
            drawEnemy(ctx, { type: w.type, x, y: yy, r: 7, flash: 0, ang: Math.PI / 2, fire: 1 }, clock);
          } else {
            ctx.strokeStyle = U.alpha(C.line, 1);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(x, yy, 14, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        // Bomb button.
        const bb = BOMB_BTN;
        const ready = bombs > 0 && state === 'play';
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        ctx.beginPath();
        ctx.arc(bb.x, bb.y, bb.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = ready ? C.p1 : C.line;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = ready ? C.p1 : C.muted;
        ctx.beginPath();
        ctx.arc(bb.x, bb.y - 6, 10, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = ready ? C.gold : C.muted;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bb.x + 6, bb.y - 14);
        ctx.lineTo(bb.x + 11, bb.y - 20);
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.fillStyle = ready ? C.text : C.muted;
        ctx.fillText('B x' + bombs, bb.x, bb.y + 17);

        // Boss health.
        if (boss) {
          const bw = 320;
          const bx = (W - bw) / 2;
          ctx.fillStyle = U.alpha(C.panel, 0.9);
          U.roundRect(ctx, bx - 4, 58, bw + 8, 16, 6);
          ctx.fill();
          ctx.fillStyle = BOSS_PATTERNS[boss.pat].color;
          U.roundRect(ctx, bx, 62, Math.max(0, bw * (boss.hp / boss.max)), 8, 4);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.textAlign = 'center';
          ctx.fillText('Boss', W / 2, 88);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = nebula;
        ctx.fillRect(0, 0, W, H);
        const sway = player ? player.x - W / 2 : 0;
        for (const s of stars) {
          const L = LAYERS[s.l];
          let x = s.x - sway * L.px;
          if (x < 0) x += W;
          else if (x > W) x -= W;
          ctx.fillStyle = U.alpha(C.text, L.a * (0.75 + 0.25 * Math.sin(clock * 3 + s.tw)));
          ctx.fillRect(x, s.y, L.s, L.s * (s.l === 2 ? 3 : 1));
        }

        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);

        for (const c of cores) drawCore(ctx, c.x, c.y, c.color, c.t + clock);
        for (const p of powers) {
          const P = POWERS[p.kind];
          ctx.fillStyle = U.alpha(P.color, 0.2);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 20, 0, TAU);
          ctx.fill();
          ctx.fillStyle = C.panel2;
          U.roundRect(ctx, p.x - 13, p.y - 13, 26, 26, 8);
          ctx.fill();
          ctx.strokeStyle = P.color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = P.color;
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(P.letter, p.x, p.y + 1);
          ctx.textBaseline = 'alphabetic';
        }

        // Kamikaze telegraphs.
        for (const e of enemies) {
          if (e.type === 'kamikaze' && e.mode === 1 && Math.sin(clock * 30) > -0.3) {
            ctx.strokeStyle = U.alpha(C.p1, 0.55);
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(e.x, e.y);
            ctx.lineTo(e.x + Math.cos(e.ang) * 900, e.y + Math.sin(e.ang) * 900);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }

        for (const b of pb) {
          ctx.fillStyle = b.color;
          if (b.homing || b.split > 0) {
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r, 0, TAU);
            ctx.fill();
          } else {
            const a = Math.atan2(b.vy, b.vx);
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.rotate(a);
            ctx.fillRect(-9, -1.8, 14, 3.6);
            ctx.restore();
          }
        }

        for (const e of enemies) drawEnemy(ctx, e, clock);
        if (boss) {
          const next = BOSS_PATTERNS[boss.pat].color;
          if (boss.gap > 0 && boss.y >= 150 && boss.dying <= 0) {
            ctx.strokeStyle = U.alpha(next, 0.7);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(boss.x, boss.y + 6, 24 + boss.gap * 60, 0, TAU);
            ctx.stroke();
          }
          drawBoss(ctx, boss, clock, next);
        }

        // Squadron.
        if (player.alive || state === 'menu') {
          ctx.strokeStyle = U.alpha(C.p2, 0.22);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 6]);
          for (const w of wing) {
            ctx.beginPath();
            ctx.moveTo(player.x, player.y);
            ctx.lineTo(w.x, w.y);
            ctx.stroke();
          }
          ctx.setLineDash([]);
        }
        for (const w of wing) {
          const s = Math.min(1, w.born * 4);
          if (s < 1) {
            ctx.strokeStyle = U.alpha(w.color, 1 - s);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(w.x, w.y, 30 * (1 - s) + 12, 0, TAU);
            ctx.stroke();
          }
          drawDrone(ctx, w.x, w.y, w.color, clock + w.slot);
        }
        const blink = player.inv > 0 && Math.sin(clock * 30) < 0;
        if (player.alive && !blink) drawFighter(ctx, player.x, player.y, 1, C.p2, clock, player.tilt);
        if (player.alive && player.inv > 0) {
          ctx.strokeStyle = U.alpha(C.p2, 0.4);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(player.x, player.y, 30, 0, TAU);
          ctx.stroke();
        }

        for (const b of eb) {
          ctx.fillStyle = U.alpha(b.color, 0.3);
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r + 4, 0, TAU);
          ctx.fill();
          ctx.fillStyle = b.color;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.r * 0.45, 0, TAU);
          ctx.fill();
        }

        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) {
          const a = Math.max(0, p.life / p.max);
          if (p.ring) {
            ctx.strokeStyle = U.alpha(p.color, a * 0.8);
            ctx.lineWidth = 3 * a + 1;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.ring * (1 - a) + 4, 0, TAU);
            ctx.stroke();
          } else {
            ctx.fillStyle = U.alpha(p.color, a);
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          }
        }
        ctx.globalCompositeOperation = 'source-over';

        ctx.font = HUD;
        ctx.textAlign = 'center';
        for (const tx of texts) {
          ctx.fillStyle = U.alpha(tx.color, Math.min(1, tx.life * 2));
          ctx.fillText(tx.text, tx.x, tx.y);
        }
        ctx.restore();

        if (state !== 'menu') drawHud();

        if (announce) {
          const a = Math.min(1, announce.t * 4, (announce.life - announce.t) * 3);
          ctx.textAlign = 'center';
          ctx.font = BIG;
          ctx.fillStyle = U.alpha(C.text, Math.max(0, a));
          ctx.fillText(announce.title, W / 2, H * 0.38);
          ctx.font = HUD;
          ctx.fillStyle = U.alpha(C.p2, Math.max(0, a));
          ctx.fillText(announce.sub, W / 2, H * 0.38 + 36);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.text, flash * 0.3);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Flow ---------- */
      function startRun() {
        reset();
        state = 'play';
        startWave(1);
        say('Hold Space to fire. Some wrecks drop glowing cores: grab them to gain wingmen.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Star Defender',
          text: api.isTouch
            ? 'Drag to fly; you fire while dragging. Tap the round button for a bomb.'
            : 'Arrows or WASD to fly, hold Space to fire, B for a bomb. Or drag with the mouse.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function gameOver() {
        state = 'over';
        drag = null;
        api.sfx('lose');
        const isBest = api.reportScore(score);
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Game over',
          text: 'You reached wave ' + wave + ' with ' + score + ' points. Biggest squadron: ' +
            peakWing + ' wingm' + (peakWing === 1 ? 'an' : 'en') + '.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      api.on(window, 'keydown', (e) => {
        if (e.code === 'KeyB' && !e.repeat) useBomb();
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play' || !player.alive) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        if (U.dist(p.x, p.y, BOMB_BTN.x, BOMB_BTN.y) <= BOMB_BTN.r + 10) {
          useBomb();
          return;
        }
        drag = { sx: p.x, sy: p.y, px: player.x, py: player.y, tx: player.x, ty: player.y };
      });
      api.on(window, 'pointermove', (e) => {
        if (!drag) return;
        const p = api.toCanvas(e, canvas);
        drag.tx = U.clamp(drag.px + (p.x - drag.sx) * 1.15, 22, W - 22);
        drag.ty = U.clamp(drag.py + (p.y - drag.sy) * 1.15, MOVE_TOP, MOVE_BOTTOM);
      });
      const endDrag = () => { drag = null; };
      api.on(window, 'pointerup', endDrag, { always: true });
      api.on(window, 'pointercancel', endDrag, { always: true });

      reset();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
