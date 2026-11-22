/* Bumper Blitz: top-down kart battle arena for one or two local drivers plus CPU karts.
   Hook: drift to charge your weapon. The longer you slide, the bigger the blast. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const AX0 = 18;
  const AY0 = 18;
  const AX1 = W - 18;
  const AY1 = H - 18;
  const MATCH_TIME = 180;
  const KO_GOAL = 10;
  const KART_R = 13;
  const MAX_HP = 3;
  const MAX_SPEED = 290;
  const ACCEL = 520;
  const BRAKE = 760;
  const REV_MAX = 130;
  const TURN = 3.3;
  const TIER_AT = [0, 0.7, 1.6, 2.7];
  const TIER_COL = [C.muted, C.mint, C.gold, C.violet];
  const HOLD_TIME = 3;
  const PILLARS = [{ x: 300, y: 190, r: 24 }, { x: 660, y: 190, r: 24 }, { x: 300, y: 410, r: 24 }, { x: 660, y: 410, r: 24 }];
  const BUMPERS = [{ x: 480, y: 300, r: 32, f: 0 }, { x: 120, y: 120, r: 18, f: 0 }, { x: 840, y: 120, r: 18, f: 0 },
    { x: 120, y: 480, r: 18, f: 0 }, { x: 840, y: 480, r: 18, f: 0 }];
  const SOLIDS = PILLARS.concat(BUMPERS);
  const OILS = [{ x: 480, y: 108, rx: 96, ry: 36 }, { x: 480, y: 492, rx: 96, ry: 36 }];
  const ZAPS = [{ x: 150, y: 262, w: 76, h: 76, phase: 0 }, { x: 734, y: 262, w: 76, h: 76, phase: 4.5 }];
  const ZAP_CYCLE = 9;
  const ZAP_WARN = 1.3;
  const ZAP_ON = 1.7;
  const CRATE_SPOTS = [{ x: 390, y: 300 }, { x: 570, y: 300 }, { x: 200, y: 150 }, { x: 760, y: 150 },
    { x: 200, y: 450 }, { x: 760, y: 450 }];
  const SPAWNS = [{ x: 60, y: 300 }, { x: 900, y: 300 }, { x: 240, y: 60 }, { x: 720, y: 540 },
    { x: 720, y: 60 }, { x: 240, y: 540 }];
  const WEAPONS = {
    rocket: { name: 'Rocket', color: C.p1 },
    mine: { name: 'Mine', color: C.gold },
    wave: { name: 'Shockwave', color: C.p2 },
    shield: { name: 'Shield', color: C.mint },
    boost: { name: 'Boost', color: C.violet }
  };
  const WEAPON_POOL = ['rocket', 'rocket', 'rocket', 'mine', 'mine', 'wave', 'wave', 'wave', 'shield', 'boost', 'boost'];
  const BOT_NAMES = ['Captain Crumb', 'NoodleArm', 'Sir Wobble', 'Lady Skid', 'Turbo Toast', 'Baron Bonk',
    'Gravel Gus', 'Pickle Pilot', 'Dame Donut', 'Lugnut Lou', 'Mx Marmalade', 'Professor Pothole'];
  const BOT_COLS = [C.gold, C.mint, C.violet, '#FF9A3C', '#FF6FD8', '#5B8CFF'];
  const LEVELS = {
    easy: { speed: 0.8, think: 0.45, aimErr: 0.32, aimTol: 0.34, react: 0.55, tierMin: 0, tierMax: 1, humanBias: 0.7, lead: 0, driftTurns: false },
    normal: { speed: 0.92, think: 0.25, aimErr: 0.13, aimTol: 0.22, react: 0.25, tierMin: 1, tierMax: 2, humanBias: 1, lead: 0.5, driftTurns: true },
    hard: { speed: 1, think: 0.12, aimErr: 0.05, aimTol: 0.15, react: 0.1, tierMin: 2, tierMax: 3, humanBias: 1.15, lead: 1, driftTurns: true }
  };
  const KEYMAPS = [
    { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], drift: ['KeyQ', 'ShiftLeft'], fire: ['Space'] },
    { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], drift: ['Slash', 'ShiftRight'], fire: ['Enter'] }
  ];
  const SOLO_MAP = {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    drift: ['KeyQ', 'ShiftLeft', 'Slash', 'ShiftRight'], fire: ['Space', 'Enter']
  };
  const MAX_PARTS = 520;
  const MONO = '"JetBrains Mono", monospace';

  const tierOf = (c) => (c >= TIER_AT[3] ? 3 : c >= TIER_AT[2] ? 2 : c >= TIER_AT[1] ? 1 : 0);
  const wrapA = (a) => {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  };
  const waveRadius = (tier) => 95 + 40 * tier;
  const inOil = (x, y) => {
    for (const o of OILS) {
      const dx = (x - o.x) / o.rx;
      const dy = (y - o.y) / o.ry;
      if (dx * dx + dy * dy < 1) return true;
    }
    return false;
  };
  const zapState = (z, clock) => {
    const t = (clock + z.phase) % ZAP_CYCLE;
    return t < ZAP_CYCLE - ZAP_WARN - ZAP_ON ? 0 : t < ZAP_CYCLE - ZAP_ON ? 1 : 2;
  };

  /* Shared kart sprite: used in play and on the card art. */
  function drawKartBody(ctx, x, y, a, color, flash) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    U.roundRect(ctx, -13, -7, 30, 20, 6);
    ctx.fill();
    ctx.fillStyle = '#07061A';
    ctx.fillRect(-12, -12, 8, 5);
    ctx.fillRect(-12, 7, 8, 5);
    ctx.fillRect(5, -12, 7, 5);
    ctx.fillRect(5, 7, 7, 5);
    ctx.fillStyle = flash ? '#FFFFFF' : color;
    U.roundRect(ctx, -15, -9, 30, 18, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(15,13,36,.55)';
    U.roundRect(ctx, -6, -5, 10, 10, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.fillRect(9, -6, 3, 12);
    ctx.restore();
  }

  function drawFloor(ctx, w, h, s) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = U.alpha(C.line, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 40 * s; x < w; x += 40 * s) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 40 * s; y < h; y += 40 * s) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  Arcade.register({
    id: 'bumper-blitz',
    title: 'Bumper Blitz',
    category: 'io',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.gold,
    tagline: 'Six karts, one arena, and a crate of weapons on every corner.',
    hook: 'Drift to charge your weapon: the longer you slide, the bigger the blast.',
    tags: ['io', 'battle', 'kart', 'racing', 'arena', 'drift', 'shooter', 'bots', '2 player', 'local multiplayer'],
    howTo: 'Drive over a crate to grab a rocket, mine, shockwave, shield or boost, then fire it at the other karts. ' +
      'Every kart has 3 hit points; knock one out to score a KO. It respawns 2 seconds later. ' +
      'The twist: hold the drift key while turning to slide. The ring around your kart fills through tiers 1, 2 and 3, ' +
      'and the next weapon you fire is upgraded to that tier: triple rockets, wider blasts, longer shields. ' +
      'A charge lasts 3 seconds after the slide ends. Oil slicks make you slide for free; zap pads flash yellow before they shock. ' +
      'First to 10 KOs or most KOs after 3 minutes wins.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'P1 drive' },
      { keys: ['Q', 'L-Shift'], label: 'P1 drift (hold while turning)' },
      { keys: ['Space'], label: 'P1 fire' },
      { keys: ['↑', '↓', '←', '→'], label: 'P2 drive' },
      { keys: ['/', 'R-Shift'], label: 'P2 drift' },
      { keys: ['Enter'], label: 'P2 fire' }
    ],

    drawThumb(ctx, w, h, t) {
      const s = w / 320;
      drawFloor(ctx, w, h, s);
      ctx.strokeStyle = U.alpha(C.gold, 0.5);
      ctx.lineWidth = 3 * s;
      ctx.strokeRect(5 * s, 5 * s, w - 10 * s, h - 10 * s);
      // Center bumper.
      ctx.fillStyle = U.alpha(C.p1, 0.25);
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 22 * s, 0, TAU); ctx.fill();
      ctx.strokeStyle = C.p1; ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.5, 15 * s, 0, TAU); ctx.stroke();
      // Oil slick.
      ctx.fillStyle = 'rgba(80,60,160,.35)';
      ctx.beginPath(); ctx.ellipse(w * 0.3, h * 0.78, 50 * s, 16 * s, 0, 0, TAU); ctx.fill();
      // Drifting kart with smoke and a full charge ring.
      const kx = w * 0.27;
      const ky = h * 0.42;
      for (let i = 0; i < 7; i++) {
        ctx.fillStyle = 'rgba(220,215,255,' + (0.28 - i * 0.035) + ')';
        ctx.beginPath(); ctx.arc(kx - (18 + i * 9) * s, ky + (10 + i * 4) * s, (5 + i * 1.6) * s, 0, TAU); ctx.fill();
      }
      const pulse = 0.6 + 0.4 * Math.sin(t * 6);
      ctx.strokeStyle = U.alpha(C.violet, pulse);
      ctx.lineWidth = 4 * s;
      ctx.beginPath(); ctx.arc(kx, ky, 26 * s, 0, TAU); ctx.stroke();
      ctx.save(); ctx.scale(s, s); drawKartBody(ctx, kx / s, ky / s, -0.5, C.p1, false); ctx.restore();
      // Upgraded triple rockets streaking out.
      for (let i = -1; i <= 1; i++) {
        const rx = w * 0.5 + 40 * s + ((t * 40) % 30) * s;
        const ry = h * 0.26 + i * 18 * s;
        ctx.strokeStyle = U.alpha(C.p1, 0.5); ctx.lineWidth = 3 * s;
        ctx.beginPath(); ctx.moveTo(rx - 40 * s, ry + 8 * s); ctx.lineTo(rx, ry); ctx.stroke();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath(); ctx.arc(rx, ry, 3.5 * s, 0, TAU); ctx.fill();
      }
      ctx.save(); ctx.scale(s, s);
      drawKartBody(ctx, 268, 50, 2.6, C.p2, false);
      drawKartBody(ctx, 236, 150, 3.6, C.gold, false);
      ctx.restore();
      // Shockwave ring.
      ctx.strokeStyle = U.alpha(C.p2, 0.7); ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(236 * s, 150 * s, (28 + (t * 30) % 20) * s, 0, TAU); ctx.stroke();
      ctx.fillStyle = C.violet;
      ctx.font = '800 ' + Math.round(15 * s) + 'px ' + MONO;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('TIER 3', 14 * s, 14 * s);
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | count | play | over
      let twoP = false;
      let diff = 'normal';
      let L = LEVELS.normal;
      let karts = [];
      let clock = 0;
      let timeLeft = MATCH_TIME;
      let countT = 0;
      let endT = 0;
      let goT = 0;
      let shake = 0;
      let banner = null;
      let hinted = {};
      const rockets = [];
      const mines = [];
      const waves = [];
      const floats = [];
      const feed = [];
      const crates = CRATE_SPOTS.map((p) => ({ x: p.x, y: p.y, t: 0, up: true }));

      /* Particle pool: fixed arrays, ring-buffer reuse. */
      const px = new Float32Array(MAX_PARTS);
      const py = new Float32Array(MAX_PARTS);
      const pvx = new Float32Array(MAX_PARTS);
      const pvy = new Float32Array(MAX_PARTS);
      const pl = new Float32Array(MAX_PARTS);
      const pm = new Float32Array(MAX_PARTS);
      const ps = new Float32Array(MAX_PARTS);
      const pc = new Array(MAX_PARTS).fill('#fff');
      let pNext = 0;
      function part(x, y, vx, vy, life, size, color) {
        const i = pNext;
        pNext = (pNext + 1) % MAX_PARTS;
        px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pm[i] = life; ps[i] = size; pc[i] = color;
      }
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const v = speed * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size, color);
        }
      }

      function sfx(name) {
        if (state !== 'menu') api.sfx(name);
      }

      function say(x, y, text, color) {
        if (floats.length > 14) floats.shift();
        floats.push({ x, y, text, color, t: 0 });
      }
      function log(text, color) {
        if (feed.length > 3) feed.shift();
        feed.push({ text, color, t: 0 });
      }
      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }

      function makeKart(i, name, color, human) {
        return {
          i, name, color, human, x: 0, y: 0, vx: 0, vy: 0, a: 0, hp: MAX_HP, kos: 0, deaths: 0,
          dead: false, respawn: 0, inv: 0, weapon: null, charge: 0, hold: 0, sliding: false, slip: 0,
          shield: 0, spiked: false, boost: 0, boostTier: 0, flash: 0, lastHit: -1, lastHitT: -99,
          zapCd: 0, bumpCd: [0, 0, 0, 0, 0, 0], tierShown: 0, smokeT: 0,
          input: { thr: 0, steer: 0, drift: false },
          ai: { think: 0, target: null, crate: null, tierGoal: -1, circle: 1, stuck: 0, reverse: 0, revSteer: 1,
            ready: 0, chargeT: 0, holdT: 0, err: 0, roamX: W / 2, roamY: H / 2 }
        };
      }

      function placeKart(k, sp) {
        k.x = sp.x; k.y = sp.y; k.vx = 0; k.vy = 0;
        k.a = Math.atan2(H / 2 - sp.y, W / 2 - sp.x);
        k.hp = MAX_HP; k.dead = false; k.weapon = null; k.charge = 0; k.hold = 0;
        k.shield = 0; k.boost = 0; k.flash = 0; k.tierShown = 0;
      }

      function startMatch(two, d) {
        twoP = two;
        diff = d;
        L = LEVELS[d];
        const names = U.shuffle(BOT_NAMES.slice());
        const cols = U.shuffle(BOT_COLS.slice());
        karts = [];
        karts.push(makeKart(0, twoP ? 'Coral' : 'You', C.p1, 0));
        if (twoP) karts.push(makeKart(1, 'Cyan', C.p2, 1));
        while (karts.length < 6) karts.push(makeKart(karts.length, names[karts.length], cols[karts.length], -1));
        const spawns = U.shuffle(SPAWNS.slice());
        karts.forEach((k, i) => placeKart(k, spawns[i]));
        rockets.length = 0; mines.length = 0; waves.length = 0; floats.length = 0; feed.length = 0;
        crates.forEach((c) => { c.up = true; c.t = 0; });
        clock = 0; timeLeft = MATCH_TIME; countT = 3; endT = 0; goT = 0; shake = 0; banner = null;
        hinted = {};
        pl.fill(0);
        state = 'count';
        sfx('tick');
        updateScore();
        api.setStatus(twoP
          ? 'Coral drifts with Q or Left Shift, Cyan with / or Right Shift. Sliding charges your weapon.'
          : 'Hold Q or Shift while turning to drift. Sliding charges your next weapon.');
      }

      function showStartMenu() {
        state = 'menu';
        idleSetup();
        api.menu({
          title: 'Bumper Blitz',
          text: 'Six karts, crates of weapons, 3 minutes. Drift to charge your shots. First to 10 KOs wins.',
          buttons: [
            { label: 'Solo vs 5 bots', primary: true, onClick: () => showDiffMenu(false) },
            { label: '2 players + 4 bots', onClick: () => showDiffMenu(true) }
          ]
        });
      }

      function showDiffMenu(two) {
        api.menu({
          title: 'Bot skill',
          text: two ? 'Coral: WASD, Q to drift, Space to fire. Cyan: arrows, / to drift, Enter to fire.'
            : 'WASD or arrows to drive, Q or Shift to drift, Space to fire.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(two, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(two, 'normal') },
            { label: 'Hard', onClick: () => startMatch(two, 'hard') }
          ]
        });
      }

      function ranked() {
        return karts.slice().sort((a, b) => b.kos - a.kos || a.deaths - b.deaths || a.i - b.i);
      }

      function updateScore() {
        if (!karts.length) return;
        api.setScore(twoP ? karts[0].kos + ' – ' + karts[1].kos : karts[0].kos + ' KO');
      }

      function finish() {
        state = 'over';
        const r = ranked();
        const top = r[0].kos;
        const leaders = r.filter((k) => k.kos === top);
        const place = (k) => r.filter((o) => o.kos > k.kos).length + 1;
        let title;
        if (leaders.length > 1) {
          title = leaders.some((k) => k.human >= 0) ? 'Tied for first!' : 'Draw!';
        } else if (leaders[0].human >= 0) {
          title = twoP ? leaders[0].name + ' wins!' : 'You win!';
        } else {
          title = leaders[0].name + ' wins';
        }
        const humanWon = leaders.some((k) => k.human >= 0);
        sfx(humanWon ? 'win' : 'lose');
        const text = twoP
          ? 'Coral: ' + karts[0].kos + ' KOs (#' + place(karts[0]) + '). Cyan: ' + karts[1].kos + ' KOs (#' + place(karts[1]) + ').'
          : 'You scored ' + karts[0].kos + ' KO' + (karts[0].kos === 1 ? '' : 's') + ' and placed #' + place(karts[0]) + ' of 6.';
        api.setStatus(leaders.length > 1 ? 'Tied at ' + top + ' KOs: ' + leaders.map((k) => k.name).join(', ') + '.'
          : leaders[0].name + ' took the arena with ' + top + ' KOs.');
        api.menu({
          title,
          text,
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(twoP, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      /* ---------- Combat ---------- */
      function hurt(k, dmg, from) {
        if (k.dead || k.inv > 0 || state !== 'play') return false;
        if (k.shield > 0) {
          k.flash = 0.15;
          burst(k.x, k.y, C.mint, 8, 160, 0.3, 2.5);
          return false;
        }
        if (from >= 0 && from !== k.i) { k.lastHit = from; k.lastHitT = clock; }
        k.hp -= dmg;
        k.flash = 0.3;
        shake = Math.max(shake, k.human >= 0 ? 7 : 3);
        if (k.human >= 0 || (from >= 0 && karts[from].human >= 0)) sfx('hit');
        if (k.hp <= 0) knockOut(k);
        return true;
      }

      function knockOut(k) {
        const killer = k.lastHit >= 0 && clock - k.lastHitT < 5 ? karts[k.lastHit] : null;
        k.dead = true;
        k.respawn = 2;
        k.deaths++;
        k.hp = 0;
        k.weapon = null; k.charge = 0; k.shield = 0; k.boost = 0;
        burst(k.x, k.y, k.color, 30, 260, 0.8, 4);
        burst(k.x, k.y, '#FFFFFF', 14, 180, 0.5, 3);
        burst(k.x, k.y, C.gold, 12, 120, 0.9, 5);
        shake = Math.max(shake, 12);
        sfx('boom');
        if (killer && killer !== k) {
          killer.kos++;
          say(killer.x, killer.y - 26, '+1 KO', killer.color);
          log(killer.name + ' KO\'d ' + k.name, killer.color);
          if (killer.kos >= KO_GOAL) endT = 1.2;
        } else {
          log(k.name + ' wiped out', k.color);
        }
        k.lastHit = -1;
        updateScore();
      }

      function respawn(k) {
        let best = SPAWNS[0];
        let bestD = -1;
        for (const sp of SPAWNS) {
          let m = 1e9;
          for (const o of karts) if (o !== k && !o.dead) m = Math.min(m, U.dist(sp.x, sp.y, o.x, o.y));
          m += Math.random() * 60;
          if (m > bestD) { bestD = m; best = sp; }
        }
        placeKart(k, best);
        k.inv = 2;
        burst(k.x, k.y, k.color, 16, 140, 0.5, 3);
      }

      function explode(x, y, radius, dmg, owner, tier) {
        for (const k of karts) {
          if (k.dead || k.i === owner) continue;
          const d = U.dist(x, y, k.x, k.y);
          if (d < radius + KART_R) {
            const push = (170 + 70 * tier) / Math.max(d, 8);
            k.vx += (k.x - x) * push;
            k.vy += (k.y - y) * push;
            hurt(k, dmg, owner);
          }
        }
        const col = tier ? TIER_COL[tier] : C.gold;
        burst(x, y, col, 14 + tier * 8, radius * 3, 0.5, 3.5);
        burst(x, y, '#FFE7A8', 10, radius * 2, 0.35, 3);
        waves.push({ x, y, r: 6, maxR: radius, owner: -2, tier, dmg: 0, hit: [1, 1, 1, 1, 1, 1], fx: true });
        shake = Math.max(shake, 4 + radius / 14);
        sfx('boom');
      }

      function fire(k) {
        if (k.dead || !k.weapon || state !== 'play') return;
        const tier = tierOf(k.charge);
        const w = k.weapon;
        k.weapon = null;
        k.charge = 0;
        k.hold = 0;
        const fx = Math.cos(k.a);
        const fy = Math.sin(k.a);
        if (w === 'rocket') {
          const n = tier >= 3 ? 3 : 1;
          for (let j = 0; j < n; j++) {
            const a = k.a + (j - (n - 1) / 2) * 0.24;
            const sp = 380 + 45 * tier;
            if (rockets.length < 40) {
              rockets.push({ x: k.x + fx * 18, y: k.y + fy * 18, a, sp, owner: k.i, tier, life: 2.4,
                dmg: tier >= 2 ? 2 : 1, rad: 34 + 14 * tier, hom: 1.4 + 0.9 * tier });
            }
          }
          sfx('shoot');
        } else if (w === 'mine') {
          const n = tier >= 3 ? 3 : 1;
          for (let j = 0; j < n; j++) {
            const a = k.a + Math.PI + (j - (n - 1) / 2) * 0.7;
            if (mines.length < 24) {
              mines.push({ x: k.x + Math.cos(a) * 24, y: k.y + Math.sin(a) * 24, owner: k.i, tier, arm: 0.5,
                life: 25, trig: 26 + 5 * tier, rad: 55 + 22 * tier, dmg: tier >= 2 ? 2 : 1 });
            }
          }
          sfx('tick');
        } else if (w === 'wave') {
          waves.push({ x: k.x, y: k.y, r: 10, maxR: waveRadius(tier), owner: k.i, tier, dmg: tier >= 2 ? 2 : 1,
            hit: [0, 0, 0, 0, 0, 0], fx: false });
          shake = Math.max(shake, 5 + tier * 2);
          sfx('boom');
        } else if (w === 'shield') {
          k.shield = 3 + 1.5 * tier;
          k.spiked = tier >= 2;
          sfx('power');
        } else if (w === 'boost') {
          k.boost = 1 + 0.45 * tier;
          k.boostTier = tier;
          k.vx += fx * (120 + 40 * tier);
          k.vy += fy * (120 + 40 * tier);
          sfx('power');
        }
        if (tier > 0) {
          say(k.x, k.y - 28, 'Tier ' + tier + ' ' + WEAPONS[w].name.toLowerCase() + '!', TIER_COL[tier]);
          burst(k.x, k.y, TIER_COL[tier], 10 + tier * 6, 200, 0.5, 3);
        }
      }

      /* ---------- Input ---------- */
      function anyHeld(list) {
        for (const c of list) if (api.keys.has(c)) return true;
        return false;
      }

      function humanInput(k) {
        const m = twoP ? KEYMAPS[k.human] : SOLO_MAP;
        const inp = k.input;
        inp.thr = (anyHeld(m.up) ? 1 : 0) - (anyHeld(m.down) ? 1 : 0);
        inp.steer = (anyHeld(m.right) ? 1 : 0) - (anyHeld(m.left) ? 1 : 0);
        inp.drift = anyHeld(m.drift);
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || state !== 'play') return;
        for (const k of karts) {
          if (k.human < 0) continue;
          const m = twoP ? KEYMAPS[k.human] : SOLO_MAP;
          if (m.fire.indexOf(e.code) >= 0) fire(k);
        }
      });

      /* ---------- Bots ---------- */
      function clearShot(k, t) {
        for (const o of SOLIDS) {
          const dx = t.x - k.x;
          const dy = t.y - k.y;
          const len2 = dx * dx + dy * dy || 1;
          const u = U.clamp(((o.x - k.x) * dx + (o.y - k.y) * dy) / len2, 0, 1);
          if (U.dist(k.x + dx * u, k.y + dy * u, o.x, o.y) < o.r + 6) return false;
        }
        return true;
      }

      function threatened(k) {
        for (const r of rockets) {
          if (r.owner === k.i) continue;
          const d = U.dist(r.x, r.y, k.x, k.y);
          if (d < 170) return true;
        }
        for (const o of karts) {
          if (o === k || o.dead) continue;
          if (U.dist(o.x, o.y, k.x, k.y) < 80 && (o.weapon === 'wave' || o.boost > 0)) return true;
        }
        return false;
      }

      function botThink(k) {
        const ai = k.ai;
        ai.think = L.think * U.rand(0.8, 1.25);
        let best = null;
        let bestS = Infinity;
        for (const o of karts) {
          if (o === k || o.dead) continue;
          let s = U.dist(k.x, k.y, o.x, o.y);
          if (o.inv > 0) s += 300;
          if (o.shield > 0) s += 200;
          if (o.human >= 0) s /= L.humanBias;
          s -= (MAX_HP - o.hp) * 40;
          if (o === ai.target) s -= 70;
          if (s < bestS) { bestS = s; best = o; }
        }
        ai.target = best;
        ai.crate = null;
        if (!k.weapon) {
          let bd = Infinity;
          for (const c of crates) {
            if (!c.up) continue;
            const d = U.dist(k.x, k.y, c.x, c.y) + Math.random() * 40;
            if (d < bd) { bd = d; ai.crate = c; }
          }
          ai.tierGoal = -1;
        } else if (ai.tierGoal < 0) {
          ai.tierGoal = U.randInt(L.tierMin, L.tierMax);
          ai.chargeT = 0;
          ai.holdT = 0;
        }
        ai.err = U.rand(-1, 1) * L.aimErr;
        if (Math.random() < 0.15) ai.circle = -ai.circle;
        if (Math.random() < 0.2 || U.dist(k.x, k.y, ai.roamX, ai.roamY) < 60) {
          ai.roamX = U.rand(140, W - 140);
          ai.roamY = U.rand(100, H - 100);
        }
      }

      function steerTo(k, gx, gy) {
        const inp = k.input;
        const desired = Math.atan2(gy - k.y, gx - k.x);
        const d = wrapA(desired - k.a);
        inp.steer = U.clamp(d * 3, -1, 1);
        inp.thr = Math.abs(d) > 1.9 ? 0.35 : 1;
        return d;
      }

      function botDrive(k, dt) {
        const ai = k.ai;
        const inp = k.input;
        inp.drift = false;
        ai.think -= dt;
        if (ai.think <= 0) botThink(k);
        if (ai.reverse > 0) {
          ai.reverse -= dt;
          inp.thr = -1;
          inp.steer = ai.revSteer;
          return;
        }
        const sp = Math.hypot(k.vx, k.vy);
        if (inp.thr > 0.5 && sp < 30) {
          ai.stuck += dt;
          if (ai.stuck > 0.7) { ai.reverse = 0.6; ai.revSteer = Math.random() < 0.5 ? -1 : 1; ai.stuck = 0; }
        } else {
          ai.stuck = Math.max(0, ai.stuck - dt);
        }
        const t = ai.target && !ai.target.dead ? ai.target : null;
        const tier = tierOf(k.charge);
        let wantFire = false;
        let diffA = 0;
        if (!k.weapon) {
          if (ai.crate && ai.crate.up) diffA = steerTo(k, ai.crate.x, ai.crate.y);
          else if (t) diffA = steerTo(k, t.x, t.y);
          else diffA = steerTo(k, ai.roamX, ai.roamY);
        } else if (t) {
          ai.holdT += dt;
          const d = U.dist(k.x, k.y, t.x, t.y);
          const charging = tier < ai.tierGoal && d > 230 && ai.chargeT < 4.5 && k.weapon !== 'shield';
          if (charging) {
            // Drift circles in open space to build charge before engaging.
            ai.chargeT += dt;
            const cx = U.clamp(k.x, 150, W - 150);
            const cy = U.clamp(k.y, 120, H - 120);
            const toC = Math.atan2(cy - k.y, cx - k.x);
            const off = U.dist(k.x, k.y, cx, cy) > 20 ? wrapA(toC - k.a) * 0.6 : 0;
            inp.steer = U.clamp(ai.circle + off, -1, 1);
            inp.thr = 1;
            inp.drift = sp > 120;
          } else {
            const projSp = k.weapon === 'rocket' ? 380 + 45 * tier : 300;
            const lead = L.lead * Math.min(1, d / projSp);
            const ax = t.x + t.vx * lead;
            const ay = t.y + t.vy * lead;
            if (k.weapon === 'mine') {
              // Lay mines when someone is tailing us, otherwise cruise past their path.
              const back = Math.abs(wrapA(Math.atan2(t.y - k.y, t.x - k.x) - k.a));
              diffA = steerTo(k, ai.roamX, ai.roamY);
              wantFire = (back > 2.2 && d < 170) || ai.holdT > 9;
            } else if (k.weapon === 'shield') {
              diffA = steerTo(k, t.x, t.y);
              wantFire = threatened(k) || d < 60;
            } else {
              const desired = Math.atan2(ay - k.y, ax - k.x) + ai.err;
              diffA = wrapA(desired - k.a);
              inp.steer = U.clamp(diffA * 3, -1, 1);
              inp.thr = Math.abs(diffA) > 1.9 ? 0.35 : 1;
              if (k.weapon === 'rocket') wantFire = Math.abs(diffA) < L.aimTol && d < 470 && clearShot(k, t);
              else if (k.weapon === 'boost') wantFire = Math.abs(diffA) < L.aimTol && d < 240 && clearShot(k, t);
              else if (k.weapon === 'wave') wantFire = d < waveRadius(tier) * 0.8;
            }
          }
        } else {
          diffA = steerTo(k, ai.roamX, ai.roamY);
        }
        // Drift through tight turns: a free charge, just like a person would.
        if (L.driftTurns && Math.abs(diffA) > 0.8 && sp > 140) inp.drift = true;
        if (wantFire) {
          ai.ready += dt;
          if (ai.ready >= L.react) { fire(k); ai.ready = 0; ai.tierGoal = -1; }
        } else {
          ai.ready = Math.max(0, ai.ready - dt);
        }
        avoid(k, sp);
      }

      function avoid(k, sp) {
        const inp = k.input;
        const fx = Math.cos(k.a);
        const fy = Math.sin(k.a);
        const look = 30 + sp * 0.32;
        const qx = k.x + fx * look;
        const qy = k.y + fy * look;
        let push = 0;
        for (const o of SOLIDS) {
          if (U.dist(qx, qy, o.x, o.y) < o.r + KART_R + 14) {
            const side = fx * (o.y - k.y) - fy * (o.x - k.x);
            push += side > 0 ? -1.4 : 1.4;
          }
        }
        for (const z of ZAPS) {
          if (zapState(z, clock) > 0 && qx > z.x - 16 && qx < z.x + z.w + 16 && qy > z.y - 16 && qy < z.y + z.h + 16) {
            const side = fx * (z.y + z.h / 2 - k.y) - fy * (z.x + z.w / 2 - k.x);
            push += side > 0 ? -1.2 : 1.2;
          }
        }
        if (qx < AX0 + 30 || qx > AX1 - 30 || qy < AY0 + 30 || qy > AY1 - 30) {
          const d = wrapA(Math.atan2(H / 2 - k.y, W / 2 - k.x) - k.a);
          push += d > 0 ? 1.5 : -1.5;
          if (sp > 200) inp.thr = Math.min(inp.thr, 0.3);
        }
        for (const m of mines) {
          if (m.owner === k.i) continue;
          if (U.dist(qx, qy, m.x, m.y) < m.trig + KART_R + 8 && Math.random() < (diff === 'easy' ? 0.3 : 1)) {
            const side = fx * (m.y - k.y) - fy * (m.x - k.x);
            push += side > 0 ? -1 : 1;
          }
        }
        if (push) inp.steer = U.clamp(inp.steer + push, -1, 1);
      }

      /* ---------- Physics ---------- */
      function drive(k, dt) {
        const inp = k.input;
        const sp0 = Math.hypot(k.vx, k.vy);
        let fx = Math.cos(k.a);
        let fy = Math.sin(k.a);
        const fwd0 = k.vx * fx + k.vy * fy;
        const drifting = inp.drift && inp.steer !== 0 && sp0 > 100;
        const auth = Math.min(1, Math.abs(fwd0) / 110);
        k.a += inp.steer * TURN * auth * (drifting ? 1.4 : 1) * (fwd0 < -5 ? -1 : 1) * dt;
        fx = Math.cos(k.a);
        fy = Math.sin(k.a);
        let fwd = k.vx * fx + k.vy * fy;
        let lat = -k.vx * fy + k.vy * fx;
        const boosting = k.boost > 0;
        const maxF = MAX_SPEED * (k.human < 0 ? L.speed : 1) * (boosting ? 1.55 : 1);
        if (boosting) {
          fwd += ACCEL * 1.8 * dt;
        } else if (inp.thr > 0) {
          fwd += ACCEL * inp.thr * dt;
        } else if (inp.thr < 0) {
          if (fwd > 0) fwd -= BRAKE * dt;
          else fwd = Math.max(-REV_MAX, fwd - ACCEL * 0.6 * dt);
        } else {
          fwd -= fwd * Math.min(1, 1.3 * dt);
        }
        if (fwd > maxF) fwd -= (fwd - maxF) * Math.min(1, 5 * dt);
        const oil = inOil(k.x, k.y);
        if (drifting) lat -= inp.steer * 150 * dt; // kick the tail out
        const grip = oil ? 0.6 : drifting ? 1.5 : 9;
        const lat2 = lat * Math.exp(-grip * dt);
        if (fwd > 0) fwd += (Math.abs(lat) - Math.abs(lat2)) * 0.35;
        lat = lat2;
        k.vx = fx * fwd - fy * lat;
        k.vy = fy * fwd + fx * lat;
        k.slip = Math.abs(lat);
        k.sliding = k.slip > 50 && sp0 > 90 && (drifting || oil);
        if (k.sliding) {
          k.charge = Math.min(TIER_AT[3] + 0.3, k.charge + dt * (drifting ? 1 : 0.7));
          k.hold = HOLD_TIME;
          k.smokeT -= dt;
          if (k.smokeT <= 0) {
            k.smokeT = 0.03;
            const tier = tierOf(k.charge);
            for (let s = -1; s <= 1; s += 2) {
              const wx = k.x - fx * 11 - fy * 8 * s;
              const wy = k.y - fy * 11 + fx * 8 * s;
              part(wx, wy, -k.vx * 0.1 + U.rand(-20, 20), -k.vy * 0.1 + U.rand(-20, 20), 0.6, 5, 'rgba(220,215,255,.22)');
              if (tier > 0 && Math.random() < 0.5) part(wx, wy, U.rand(-80, 80), U.rand(-80, 80), 0.3, 2.2, TIER_COL[tier]);
            }
          }
        } else if (k.charge > 0) {
          k.hold -= dt;
          if (k.hold <= 0) k.charge = Math.max(0, k.charge - dt * 2.5);
        }
        const tier = tierOf(k.charge);
        if (tier > k.tierShown) {
          burst(k.x, k.y, TIER_COL[tier], 6 + tier * 3, 150, 0.35, 2.5);
          if (k.human >= 0) {
            sfx('tick');
            hint('tier', 'Tier ' + tier + ' charge! Fire now for a bigger shot, or keep sliding to reach tier 3.');
          }
        }
        k.tierShown = tier;
        if (boosting && Math.random() < 0.7) {
          part(k.x - fx * 16, k.y - fy * 16, -fx * 120 + U.rand(-30, 30), -fy * 120 + U.rand(-30, 30), 0.3, 4,
            Math.random() < 0.5 ? C.violet : C.gold);
        }
        k.x += k.vx * dt;
        k.y += k.vy * dt;
        collideStatic(k);
      }

      function collideStatic(k) {
        const r = KART_R;
        if (k.x < AX0 + r) { k.x = AX0 + r; k.vx = Math.abs(k.vx) * 0.5; }
        if (k.x > AX1 - r) { k.x = AX1 - r; k.vx = -Math.abs(k.vx) * 0.5; }
        if (k.y < AY0 + r) { k.y = AY0 + r; k.vy = Math.abs(k.vy) * 0.5; }
        if (k.y > AY1 - r) { k.y = AY1 - r; k.vy = -Math.abs(k.vy) * 0.5; }
        for (const p of PILLARS) {
          const dx = k.x - p.x;
          const dy = k.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < p.r + r) {
            const nx = dx / d;
            const ny = dy / d;
            k.x = p.x + nx * (p.r + r);
            k.y = p.y + ny * (p.r + r);
            const vn = k.vx * nx + k.vy * ny;
            if (vn < 0) { k.vx -= vn * nx * 1.4; k.vy -= vn * ny * 1.4; }
          }
        }
        for (const b of BUMPERS) {
          const dx = k.x - b.x;
          const dy = k.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < b.r + r) {
            const nx = dx / d;
            const ny = dy / d;
            k.x = b.x + nx * (b.r + r + 1);
            k.y = b.y + ny * (b.r + r + 1);
            const vn = k.vx * nx + k.vy * ny;
            const out = Math.max(340, Math.abs(vn) * 1.2);
            k.vx += (out - vn) * nx;
            k.vy += (out - vn) * ny;
            if (b.f < 0.6) {
              burst(b.x + nx * b.r, b.y + ny * b.r, C.p1, 8, 160, 0.3, 2.5);
              sfx('flip');
            }
            b.f = 1;
          }
        }
      }

      function collideKarts() {
        for (let i = 0; i < karts.length; i++) {
          const a = karts[i];
          if (a.dead) continue;
          for (let j = i + 1; j < karts.length; j++) {
            const b = karts[j];
            if (b.dead) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d = Math.hypot(dx, dy) || 1;
            if (d >= KART_R * 2) continue;
            const nx = dx / d;
            const ny = dy / d;
            const over = (KART_R * 2 - d) / 2;
            a.x -= nx * over; a.y -= ny * over;
            b.x += nx * over; b.y += ny * over;
            const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
            if (rel > 0) {
              const imp = rel * 0.9;
              a.vx -= imp * nx; a.vy -= imp * ny;
              b.vx += imp * nx; b.vy += imp * ny;
              if (rel > 160) {
                part((a.x + b.x) / 2, (a.y + b.y) / 2, 0, 0, 0.2, 10, 'rgba(255,255,255,.5)');
                if (a.human >= 0 || b.human >= 0) sfx('hit');
              }
            }
            ram(a, b);
            ram(b, a);
          }
        }
      }

      /* Boosting or wearing a spiked shield turns a bump into a hit. */
      function ram(a, b) {
        if (a.bumpCd[b.i] > 0) return;
        if (a.boost > 0 || (a.shield > 0 && a.spiked)) {
          a.bumpCd[b.i] = 0.8;
          hurt(b, a.boost > 0 && a.boostTier >= 3 ? 2 : 1, a.i);
          burst(b.x, b.y, a.boost > 0 ? C.violet : C.mint, 10, 180, 0.35, 3);
        }
      }

      /* ---------- Update ---------- */
      function updateParts(dt) {
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          pl[i] -= dt;
          px[i] += pvx[i] * dt;
          py[i] += pvy[i] * dt;
          pvx[i] *= 0.94;
          pvy[i] *= 0.94;
        }
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        goT = Math.max(0, goT - dt);
        updateParts(dt);
        for (const b of BUMPERS) b.f = Math.max(0, b.f - dt * 3);
        for (let i = floats.length - 1; i >= 0; i--) {
          floats[i].t += dt;
          if (floats[i].t > 1.2) floats.splice(i, 1);
        }
        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t += dt;
          if (feed[i].t > 5) feed.splice(i, 1);
        }
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.6) banner = null;
        }
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'play';
            goT = 0.8;
            sfx('blip');
          } else if (Math.ceil(countT) !== prev) {
            sfx('tick');
          }
          return;
        }
        if (state !== 'play') return;

        timeLeft -= dt;
        if (timeLeft <= 30 && !hinted.late) {
          hinted.late = true;
          banner = { text: '30 seconds left', color: C.gold, t: 0 };
          sfx('tick');
        }

        for (const c of crates) {
          if (!c.up) {
            c.t -= dt;
            if (c.t <= 0) { c.up = true; burst(c.x, c.y, C.gold, 8, 90, 0.4, 2.5); }
          }
        }

        for (const k of karts) {
          k.flash = Math.max(0, k.flash - dt);
          k.inv = Math.max(0, k.inv - dt);
          k.shield = Math.max(0, k.shield - dt);
          k.boost = Math.max(0, k.boost - dt);
          k.zapCd = Math.max(0, k.zapCd - dt);
          for (let j = 0; j < 6; j++) k.bumpCd[j] = Math.max(0, k.bumpCd[j] - dt);
          if (k.dead) {
            k.respawn -= dt;
            if (k.respawn <= 0) respawn(k);
            continue;
          }
          if (k.human >= 0) humanInput(k);
          else botDrive(k, dt);
          drive(k, dt);
          if (!k.weapon) {
            for (const c of crates) {
              if (c.up && U.dist(k.x, k.y, c.x, c.y) < KART_R + 15) {
                c.up = false;
                c.t = 6;
                k.weapon = U.pick(WEAPON_POOL);
                k.ai.tierGoal = -1;
                burst(c.x, c.y, WEAPONS[k.weapon].color, 12, 160, 0.4, 3);
                if (k.human >= 0) {
                  sfx('power');
                  say(k.x, k.y - 26, WEAPONS[k.weapon].name, WEAPONS[k.weapon].color);
                  hint('crate', 'Got a ' + WEAPONS[k.weapon].name.toLowerCase() +
                    '. Drift first to upgrade it, then fire with ' + (k.human === 1 ? 'Enter' : 'Space') + '.');
                }
                break;
              }
            }
          }
          for (const z of ZAPS) {
            if (k.zapCd <= 0 && zapState(z, clock) === 2 && k.x > z.x && k.x < z.x + z.w && k.y > z.y && k.y < z.y + z.h) {
              k.zapCd = 1;
              burst(k.x, k.y, C.gold, 10, 200, 0.3, 2.5);
              hurt(k, 1, -1);
            }
          }
        }
        collideKarts();

        // Rockets: gentle homing, sub-stepped so fast ones never tunnel.
        for (let i = rockets.length - 1; i >= 0; i--) {
          const r = rockets[i];
          r.life -= dt;
          let tgt = null;
          let td = 520;
          for (const k of karts) {
            if (k.dead || k.i === r.owner) continue;
            const d = U.dist(r.x, r.y, k.x, k.y);
            const off = Math.abs(wrapA(Math.atan2(k.y - r.y, k.x - r.x) - r.a));
            if (off < 1.1 && d < td) { td = d; tgt = k; }
          }
          if (tgt) {
            const want = wrapA(Math.atan2(tgt.y - r.y, tgt.x - r.x) - r.a);
            r.a += U.clamp(want, -r.hom * dt, r.hom * dt);
          }
          const steps = Math.max(1, Math.ceil((r.sp * dt) / 8));
          const sdt = dt / steps;
          let boom = r.life <= 0;
          for (let s = 0; s < steps && !boom; s++) {
            r.x += Math.cos(r.a) * r.sp * sdt;
            r.y += Math.sin(r.a) * r.sp * sdt;
            if (r.x < AX0 || r.x > AX1 || r.y < AY0 || r.y > AY1) boom = true;
            for (const o of SOLIDS) if (!boom && U.dist(r.x, r.y, o.x, o.y) < o.r + 4) boom = true;
            for (const k of karts) {
              if (!boom && !k.dead && k.i !== r.owner && U.dist(r.x, r.y, k.x, k.y) < KART_R + 5) boom = true;
            }
          }
          if (Math.random() < 0.8) part(r.x, r.y, U.rand(-20, 20), U.rand(-20, 20), 0.35, 3, r.tier ? TIER_COL[r.tier] : 'rgba(255,200,160,.6)');
          if (boom) {
            rockets.splice(i, 1);
            explode(r.x, r.y, r.rad, r.dmg, r.owner, r.tier);
          }
        }

        for (let i = mines.length - 1; i >= 0; i--) {
          const m = mines[i];
          m.arm -= dt;
          m.life -= dt;
          let go = m.life <= 0;
          if (m.arm <= 0) {
            for (const k of karts) {
              if (!k.dead && k.i !== m.owner && U.dist(k.x, k.y, m.x, m.y) < m.trig + KART_R) go = true;
            }
          }
          if (go) {
            mines.splice(i, 1);
            explode(m.x, m.y, m.rad, m.dmg, m.owner, m.tier);
          }
        }

        for (let i = waves.length - 1; i >= 0; i--) {
          const wv = waves[i];
          wv.r += (wv.maxR / (wv.fx ? 0.25 : 0.4)) * dt;
          if (!wv.fx) {
            for (const k of karts) {
              if (k.dead || k.i === wv.owner || wv.hit[k.i]) continue;
              const d = U.dist(k.x, k.y, wv.x, wv.y);
              if (d < wv.r + KART_R) {
                wv.hit[k.i] = 1;
                const push = (260 + 90 * wv.tier) / Math.max(d, 8);
                k.vx += (k.x - wv.x) * push;
                k.vy += (k.y - wv.y) * push;
                hurt(k, wv.dmg, wv.owner);
              }
            }
            for (let j = rockets.length - 1; j >= 0; j--) {
              const r = rockets[j];
              if (r.owner !== wv.owner && U.dist(r.x, r.y, wv.x, wv.y) < wv.r) {
                burst(r.x, r.y, C.p2, 6, 100, 0.3, 2);
                rockets.splice(j, 1);
              }
            }
          }
          if (wv.r >= wv.maxR) waves.splice(i, 1);
        }

        if (endT > 0) {
          endT -= dt;
          if (endT <= 0) finish();
        } else if (timeLeft <= 0) {
          timeLeft = 0;
          finish();
        }
      }

      /* ---------- Drawing ---------- */
      function drawArena() {
        drawFloor(ctx, W, H, 1);
        for (const o of OILS) {
          ctx.fillStyle = 'rgba(70,52,150,.38)';
          ctx.beginPath(); ctx.ellipse(o.x, o.y, o.rx, o.ry, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(155,123,255,.12)';
          ctx.beginPath(); ctx.ellipse(o.x - 20, o.y - 8, o.rx * 0.5, o.ry * 0.35, 0, 0, TAU); ctx.fill();
        }
        for (const z of ZAPS) {
          const st = zapState(z, clock);
          const blink = st === 1 && Math.sin(clock * 22) > 0;
          ctx.fillStyle = st === 2 ? U.alpha(C.gold, 0.35 + Math.random() * 0.2) : blink ? U.alpha(C.gold, 0.25) : U.alpha(C.gold, 0.07);
          ctx.fillRect(z.x, z.y, z.w, z.h);
          ctx.strokeStyle = U.alpha(C.gold, st ? 0.9 : 0.35);
          ctx.lineWidth = 2;
          ctx.setLineDash(st === 2 ? [] : [6, 5]);
          ctx.strokeRect(z.x + 1, z.y + 1, z.w - 2, z.h - 2);
          ctx.setLineDash([]);
          if (st === 2) {
            ctx.strokeStyle = U.alpha('#FFFFFF', 0.7);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            let lx = z.x + 6;
            ctx.moveTo(lx, z.y + z.h / 2);
            while (lx < z.x + z.w - 6) {
              lx += 8;
              ctx.lineTo(lx, z.y + z.h / 2 + U.rand(-z.h / 2.5, z.h / 2.5));
            }
            ctx.stroke();
          }
          ctx.fillStyle = U.alpha(C.gold, st ? 1 : 0.5);
          ctx.font = '600 11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(st === 2 ? 'ZAP' : st === 1 ? '!' : 'zap', z.x + z.w / 2, z.y + z.h / 2);
        }
        ctx.strokeStyle = U.alpha(C.gold, 0.55);
        ctx.lineWidth = 4;
        ctx.strokeRect(AX0 - 2, AY0 - 2, AX1 - AX0 + 4, AY1 - AY0 + 4);
        for (const p of PILLARS) {
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.beginPath(); ctx.arc(p.x + 3, p.y + 4, p.r, 0, TAU); ctx.fill();
          ctx.fillStyle = C.panel2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill();
          ctx.strokeStyle = C.line; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r - 1.5, 0, TAU); ctx.stroke();
          ctx.fillStyle = U.alpha(C.text, 0.08);
          ctx.beginPath(); ctx.arc(p.x - 6, p.y - 6, p.r * 0.45, 0, TAU); ctx.fill();
        }
        for (const b of BUMPERS) {
          ctx.fillStyle = U.alpha(C.p1, 0.15 + b.f * 0.35);
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 6 + b.f * 6, 0, TAU); ctx.fill();
          ctx.strokeStyle = b.f > 0.3 ? '#FFFFFF' : C.p1;
          ctx.lineWidth = 5;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 2.5, 0, TAU); ctx.stroke();
          ctx.fillStyle = C.panel;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r - 6, 0, TAU); ctx.fill();
          ctx.fillStyle = U.alpha(C.p1, 0.6);
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.3, 0, TAU); ctx.fill();
        }
        for (const c of crates) {
          if (!c.up) continue;
          const bob = Math.sin(clock * 3 + c.x) * 2;
          ctx.fillStyle = U.alpha(C.gold, 0.18);
          ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, TAU); ctx.fill();
          ctx.save();
          ctx.translate(c.x, c.y + bob);
          ctx.rotate(Math.sin(clock * 1.5 + c.y) * 0.2);
          ctx.fillStyle = C.gold;
          U.roundRect(ctx, -10, -10, 20, 20, 4); ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.font = '800 13px ' + MONO;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('?', 0, 1);
          ctx.restore();
        }
        for (const m of mines) {
          const armed = m.arm <= 0;
          const col = m.tier ? TIER_COL[m.tier] : C.gold;
          ctx.strokeStyle = U.alpha(col, armed ? 0.25 : 0.1);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(m.x, m.y, m.trig + KART_R, 0, TAU); ctx.stroke();
          ctx.fillStyle = C.panel2;
          ctx.beginPath(); ctx.arc(m.x, m.y, 8, 0, TAU); ctx.fill();
          ctx.fillStyle = armed && Math.sin(clock * 10 + m.x) > 0 ? col : U.alpha(col, 0.4);
          ctx.beginPath(); ctx.arc(m.x, m.y, 4, 0, TAU); ctx.fill();
        }
      }

      function drawKart(k) {
        if (k.dead) return;
        if (k.inv > 0 && Math.floor(k.inv * 10) % 2 === 0) return;
        const tier = tierOf(k.charge);
        if (k.charge > 0) {
          const lo = TIER_AT[tier];
          const hi = tier < 3 ? TIER_AT[tier + 1] : lo + 1;
          const frac = tier < 3 ? (k.charge - lo) / (hi - lo) : 1;
          if (tier > 0) {
            ctx.strokeStyle = U.alpha(TIER_COL[tier], 0.45 + 0.25 * Math.sin(clock * 12));
            ctx.lineWidth = 3 + tier;
            ctx.beginPath(); ctx.arc(k.x, k.y, 21 + tier * 2, 0, TAU); ctx.stroke();
          }
          if (tier < 3) {
            ctx.strokeStyle = TIER_COL[tier + 1];
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(k.x, k.y, 27 + tier * 2, -Math.PI / 2, -Math.PI / 2 + frac * TAU); ctx.stroke();
          }
          if (!k.sliding && k.hold > 0 && tier > 0) {
            ctx.strokeStyle = U.alpha(C.text, 0.5);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(k.x, k.y, 31 + tier * 2, -Math.PI / 2, -Math.PI / 2 + (k.hold / HOLD_TIME) * TAU); ctx.stroke();
          }
        }
        if (k.boost > 0) {
          ctx.fillStyle = U.alpha(C.violet, 0.5);
          ctx.beginPath();
          ctx.moveTo(k.x - Math.cos(k.a) * 14 - Math.sin(k.a) * 7, k.y - Math.sin(k.a) * 14 + Math.cos(k.a) * 7);
          ctx.lineTo(k.x - Math.cos(k.a) * (34 + Math.random() * 10), k.y - Math.sin(k.a) * (34 + Math.random() * 10));
          ctx.lineTo(k.x - Math.cos(k.a) * 14 + Math.sin(k.a) * 7, k.y - Math.sin(k.a) * 14 - Math.cos(k.a) * 7);
          ctx.fill();
        }
        drawKartBody(ctx, k.x, k.y, k.a, k.color, k.flash > 0.15);
        if (k.shield > 0) {
          const fade = k.shield < 1 && Math.sin(clock * 30) > 0 ? 0.3 : 0.8;
          ctx.strokeStyle = U.alpha(C.mint, fade);
          ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(k.x, k.y, 20, 0, TAU); ctx.stroke();
          ctx.fillStyle = U.alpha(C.mint, 0.12);
          ctx.fill();
          if (k.spiked) {
            ctx.fillStyle = U.alpha(C.mint, fade);
            for (let s = 0; s < 8; s++) {
              const a = s / 8 * TAU + clock * 2;
              ctx.beginPath();
              ctx.moveTo(k.x + Math.cos(a - 0.15) * 20, k.y + Math.sin(a - 0.15) * 20);
              ctx.lineTo(k.x + Math.cos(a) * 27, k.y + Math.sin(a) * 27);
              ctx.lineTo(k.x + Math.cos(a + 0.15) * 20, k.y + Math.sin(a + 0.15) * 20);
              ctx.fill();
            }
          }
        }
        // HP pips and a name tag.
        for (let h = 0; h < MAX_HP; h++) {
          ctx.fillStyle = h < k.hp ? (k.hp === 1 ? C.p1 : C.text) : U.alpha(C.text, 0.15);
          ctx.fillRect(k.x - 10 + h * 7.5, k.y - 26, 5, 4);
        }
        ctx.font = '600 11px ' + MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = k.human >= 0 ? k.color : U.alpha(C.text, 0.6);
        ctx.fillText(k.human >= 0 ? (twoP ? (k.human ? 'P2' : 'P1') : 'YOU') : k.name, k.x, k.y - 28);
        if (k.weapon) {
          ctx.fillStyle = WEAPONS[k.weapon].color;
          ctx.beginPath(); ctx.arc(k.x + 17, k.y - 22, 3.5, 0, TAU); ctx.fill();
        }
      }

      function drawProjectiles() {
        for (const r of rockets) {
          ctx.save();
          ctx.translate(r.x, r.y);
          ctx.rotate(r.a);
          ctx.fillStyle = r.tier ? TIER_COL[r.tier] : C.p1;
          U.roundRect(ctx, -7, -3.5, 14, 7, 3); ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(4, -2, 3, 4);
          ctx.restore();
        }
        for (const wv of waves) {
          const k = wv.r / wv.maxR;
          const col = wv.fx ? '#FFE7A8' : wv.tier ? TIER_COL[wv.tier] : C.p2;
          ctx.strokeStyle = U.alpha(col.charAt(0) === '#' ? col : C.p2, Math.max(0, 0.9 - k * 0.8));
          ctx.lineWidth = wv.fx ? 3 : 5 + wv.tier * 2;
          ctx.beginPath(); ctx.arc(wv.x, wv.y, wv.r, 0, TAU); ctx.stroke();
          if (wv.fx && k < 0.5) {
            ctx.fillStyle = U.alpha('#FFE7A8', 0.35 * (1 - k * 2));
            ctx.fill();
          }
        }
      }

      function drawParts() {
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          const a = pl[i] / pm[i];
          ctx.globalAlpha = a;
          ctx.fillStyle = pc[i];
          const s = ps[i] * (pc[i].charAt(0) === 'r' ? 2 - a : 1);
          ctx.fillRect(px[i] - s / 2, py[i] - s / 2, s, s);
        }
        ctx.globalAlpha = 1;
      }

      function drawPanel(k, x, align) {
        const pw = 210;
        const ph = 52;
        const bx = align === 'left' ? x : x - pw;
        const by = H - ph - 26;
        ctx.fillStyle = U.alpha(C.panel, 0.82);
        U.roundRect(ctx, bx, by, pw, ph, 10); ctx.fill();
        ctx.strokeStyle = U.alpha(k.color, 0.6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 13px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = k.color;
        ctx.fillText(twoP ? (k.human ? 'P2' : 'P1') : 'YOU', bx + 10, by + 8);
        ctx.fillStyle = k.weapon ? WEAPONS[k.weapon].color : U.alpha(C.text, 0.4);
        ctx.fillText(k.dead ? 'respawning…' : k.weapon ? WEAPONS[k.weapon].name : 'no weapon', bx + 46, by + 8);
        for (let h = 0; h < MAX_HP; h++) {
          ctx.fillStyle = h < k.hp ? C.p1 : U.alpha(C.text, 0.15);
          ctx.fillRect(bx + pw - 46 + h * 12, by + 10, 9, 9);
        }
        const tier = tierOf(k.charge);
        for (let s = 1; s <= 3; s++) {
          const lo = TIER_AT[s - 1];
          const hi = TIER_AT[s];
          const f = U.clamp((k.charge - lo) / (hi - lo), 0, 1);
          const sx = bx + 10 + (s - 1) * 64;
          ctx.fillStyle = U.alpha(C.text, 0.1);
          ctx.fillRect(sx, by + 32, 60, 9);
          ctx.fillStyle = TIER_COL[s];
          ctx.fillRect(sx, by + 32, 60 * f, 9);
        }
        if (tier > 0 && !k.sliding) {
          ctx.fillStyle = U.alpha(C.text, 0.6);
          ctx.fillRect(bx + 10, by + 43, (pw - 20) * (k.hold / HOLD_TIME), 2);
        }
      }

      function drawHud() {
        // Clock.
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        U.roundRect(ctx, W / 2 - 70, 26, 140, 40, 10); ctx.fill();
        ctx.font = '800 22px ' + MONO;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tl = Math.max(0, Math.ceil(timeLeft));
        ctx.fillStyle = tl <= 30 ? C.gold : C.text;
        ctx.fillText(Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0'), W / 2, 42);
        ctx.font = '600 10px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.fillText('first to ' + KO_GOAL + ' KOs', W / 2, 59);

        // Leaderboard: top 5 plus any human outside it.
        const r = ranked();
        const rows = r.slice(0, 5);
        for (const k of r) if (k.human >= 0 && rows.indexOf(k) < 0) rows.push(k);
        const lx = W - 222;
        const ly = 28;
        ctx.fillStyle = U.alpha(C.panel, 0.8);
        U.roundRect(ctx, lx, ly, 196, 24 + rows.length * 18, 10); ctx.fill();
        ctx.font = '600 11px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.muted;
        ctx.fillText('KOs', lx + 10, ly + 7);
        rows.forEach((k, idx) => {
          const y = ly + 24 + idx * 18;
          const place = r.indexOf(k) + 1;
          if (k.human >= 0) {
            ctx.fillStyle = U.alpha(k.color, 0.18);
            ctx.fillRect(lx + 4, y - 2, 188, 17);
          }
          ctx.fillStyle = k.color;
          ctx.fillRect(lx + 10, y + 3, 8, 8);
          ctx.fillStyle = k.human >= 0 ? C.text : U.alpha(C.text, 0.8);
          ctx.textAlign = 'left';
          ctx.fillText(place + '. ' + (k.human >= 0 && !twoP ? 'You' : k.name), lx + 24, y);
          ctx.textAlign = 'right';
          ctx.fillText(String(k.kos), lx + 186, y);
        });

        // Kill feed.
        ctx.textAlign = 'left';
        ctx.font = '600 12px ' + MONO;
        feed.forEach((f, idx) => {
          ctx.globalAlpha = Math.min(1, (5 - f.t) * 2);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, 30, 30 + idx * 17);
        });
        ctx.globalAlpha = 1;

        const humans = karts.filter((k) => k.human >= 0);
        if (humans[0]) drawPanel(humans[0], 28, 'left');
        if (humans[1]) drawPanel(humans[1], W - 28, 'right');

        for (const f of floats) {
          ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
          ctx.font = '800 14px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y - f.t * 30);
        }
        ctx.globalAlpha = 1;
      }

      function drawAnnounce(text, color, scale) {
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,.7)';
        ctx.fillText(text, 3, 4);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawArena();
        drawParts();
        for (const k of karts) drawKart(k);
        drawProjectiles();
        ctx.restore();
        if (state === 'menu') {
          ctx.fillStyle = 'rgba(15,13,36,.45)';
          ctx.fillRect(0, 0, W, H);
          return;
        }
        drawHud();
        if (state === 'count') {
          const n = Math.ceil(countT);
          drawAnnounce(String(n), C.gold, 1 + (countT - Math.floor(countT)) * 0.4);
        } else if (goT > 0) {
          ctx.globalAlpha = Math.min(1, goT * 2);
          drawAnnounce('GO!', C.mint, 1 + (0.8 - goT) * 0.5);
          ctx.globalAlpha = 1;
        } else if (banner) {
          ctx.globalAlpha = Math.min(1, (1.6 - banner.t) * 2);
          drawAnnounce(banner.text, banner.color, 0.7);
          ctx.globalAlpha = 1;
        }
        if (endT > 0) drawAnnounce('KO limit!', C.gold, 0.9);
      }

      // Attract mode behind the start menu: bots cruise the arena.
      function idleSetup() {
        karts = [];
        rockets.length = 0; mines.length = 0; waves.length = 0; floats.length = 0; feed.length = 0;
        banner = null; endT = 0; goT = 0;
        const cols = BOT_COLS.slice();
        for (let i = 0; i < 4; i++) {
          const k = makeKart(i, BOT_NAMES[i], cols[i], -1);
          placeKart(k, SPAWNS[i]);
          k.i = i;
          karts.push(k);
        }
      }

      function idleUpdate(dt) {
        clock += dt;
        updateParts(dt);
        for (const b of BUMPERS) b.f = Math.max(0, b.f - dt * 3);
        for (const k of karts) {
          botDrive(k, dt);
          k.weapon = null;
          drive(k, dt);
        }
        collideKarts();
      }

      showStartMenu();
      api.loop((dt) => {
        if (state === 'menu') idleUpdate(dt);
        else update(dt);
        draw();
      });
    }
  });
})();
