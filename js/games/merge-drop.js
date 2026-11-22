/* Merge Drop — physics merge puzzle in a cosmic jar.
   The twist: every 15 merges a comet streaks through the jar and smashes the smallest pieces in its path. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;

  const W = 520;
  const H = 760;
  const LEFT = 40;
  const RIGHT = 480;
  const FLOOR = 724;
  const RIM = 150;
  const DANGER = 190;
  const DROP_Y = 96;
  const G = 1500;
  const STEP = 1 / 480;
  const ITER = 4;
  const REST = 0.12;
  const FRICTION = 0.32;
  const MAXB = 140;
  const OVER_TIME = 2;
  const COMET_R = 24;
  const WARN_T = 1.5;
  const STREAK_T = 0.45;
  const DROP_CD = 0.42;
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TAU = Math.PI * 2;

  const TIERS = [
    { name: 'Dust', r: 15, color: '#B7B0E0', value: 1 },
    { name: 'Pebble', r: 20, color: '#B98E72', value: 3 },
    { name: 'Ice chip', r: 26, color: '#9FE7FF', value: 6 },
    { name: 'Moonlet', r: 32, color: '#C9C2E6', value: 10 },
    { name: 'Moon', r: 39, color: '#F3E6B8', value: 15 },
    { name: 'Ring world', r: 47, color: '#4BE3A0', value: 21 },
    { name: 'Gas giant', r: 56, color: '#FF9F5A', value: 28 },
    { name: 'Sun', r: 66, color: '#FFC53D', value: 36 },
    { name: 'Blue star', r: 76, color: '#5EA8FF', value: 45 },
    { name: 'Nova', r: 88, color: '#FF7EB0', value: 55 },
    { name: 'Galaxy', r: 102, color: '#9B7BFF', value: 66 }
  ];
  const DROP_WEIGHTS = [32, 28, 20, 12, 8];
  const SUPER_BONUS = 200;

  function mix(hex, to, t) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  const DARK = TIERS.map((t) => mix(t.color, '#0F0D24', 0.35));
  const LIGHT = TIERS.map((t) => mix(t.color, '#FFFFFF', 0.45));

  /* Draws one piece: body details rotate with the roll, the face stays upright. */
  function drawPiece(ctx, x, y, r, tier, ang, t, blink) {
    const T = TIERS[tier];
    if (tier >= 7) {
      ctx.fillStyle = U.alpha(T.color, 0.18 + 0.06 * Math.sin(t * 3 + tier));
      ctx.beginPath();
      ctx.arc(x, y, r * 1.28, 0, TAU);
      ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    // Rays for the bright tiers sit behind the body.
    if (tier === 7 || tier === 9) {
      ctx.save();
      ctx.rotate(ang * 0.3 + t * (tier === 9 ? 0.8 : 0.3));
      ctx.fillStyle = tier === 7 ? C.gold : '#FF9AC4';
      const n = tier === 7 ? 12 : 8;
      ctx.beginPath();
      for (let i = 0; i < n * 2; i++) {
        const a = (i / (n * 2)) * TAU;
        const rr = i % 2 ? r * 0.92 : r * (tier === 9 ? 1.32 : 1.18);
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = DARK[tier];
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = T.color;
    ctx.beginPath();
    ctx.arc(-r * 0.05, -r * 0.06, r * 0.93, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.clip();
    ctx.rotate(ang);
    switch (tier) {
      case 0: // dust: soft puffs
        ctx.fillStyle = LIGHT[0];
        ctx.beginPath();
        ctx.arc(-r * 0.4, -r * 0.3, r * 0.35, 0, TAU);
        ctx.arc(r * 0.35, r * 0.35, r * 0.28, 0, TAU);
        ctx.fill();
        break;
      case 1: // pebble: speckles
        ctx.fillStyle = DARK[1];
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.arc(Math.cos(i * 2.4) * r * 0.55, Math.sin(i * 2.4) * r * 0.55, r * 0.09, 0, TAU);
          ctx.fill();
        }
        break;
      case 2: // ice chip: facets
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.moveTo(-r, -r * 0.2);
        ctx.lineTo(-r * 0.1, -r);
        ctx.lineTo(r * 0.2, -r * 0.1);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 0.2, -r * 0.1);
        ctx.lineTo(r, r * 0.4);
        ctx.moveTo(r * 0.2, -r * 0.1);
        ctx.lineTo(-r * 0.3, r);
        ctx.stroke();
        break;
      case 3: // moonlet: two craters
      case 4: // moon: three craters
        ctx.fillStyle = DARK[tier];
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.arc(-r * 0.45, r * 0.35, r * 0.22, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(r * 0.5, -r * 0.4, r * 0.16, 0, TAU);
        ctx.fill();
        if (tier === 4) {
          ctx.beginPath();
          ctx.arc(r * 0.35, r * 0.55, r * 0.12, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      case 6: // gas giant: bands
        ctx.fillStyle = DARK[6];
        ctx.globalAlpha = 0.45;
        ctx.fillRect(-r, -r * 0.55, r * 2, r * 0.18);
        ctx.fillRect(-r, r * 0.3, r * 2, r * 0.24);
        ctx.fillStyle = LIGHT[6];
        ctx.fillRect(-r, -r * 0.05, r * 2, r * 0.12);
        ctx.globalAlpha = 1;
        ctx.fillStyle = DARK[6];
        ctx.beginPath();
        ctx.ellipse(r * 0.4, r * 0.42, r * 0.18, r * 0.1, 0, 0, TAU);
        ctx.fill();
        break;
      case 8: // blue star: sparkle
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * TAU;
          const rr = i % 2 ? r * 0.18 : r * 0.85;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        break;
      case 10: // galaxy: spiral arms
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = r * 0.12;
        ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          for (let i = 0; i <= 18; i++) {
            const a = (i / 18) * Math.PI * 1.6 + k * Math.PI;
            const rr = r * (0.15 + (i / 18) * 0.8);
            if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
            else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
          }
          ctx.stroke();
        }
        break;
      default:
        break;
    }
    ctx.restore();
    // Ring world's ring crosses in front of the body.
    if (tier === 5) {
      ctx.strokeStyle = LIGHT[5];
      ctx.lineWidth = r * 0.12;
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.25, r * 0.32, -0.35, 0.05, Math.PI - 0.05);
      ctx.stroke();
    }
    // Shine.
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.arc(-r * 0.38, -r * 0.42, r * 0.24, 0, TAU);
    ctx.fill();
    // Face.
    const ey = -r * 0.05;
    const ex = r * 0.3;
    const es = Math.max(1.6, r * 0.11);
    ctx.fillStyle = '#1B1638';
    if (blink) {
      ctx.fillRect(-ex - es, ey - 1, es * 2, 2);
      ctx.fillRect(ex - es, ey - 1, es * 2, 2);
    } else {
      ctx.beginPath();
      ctx.ellipse(-ex, ey, es, es * 1.25, 0, 0, TAU);
      ctx.ellipse(ex, ey, es, es * 1.25, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-ex + es * 0.35, ey - es * 0.4, es * 0.38, 0, TAU);
      ctx.arc(ex + es * 0.35, ey - es * 0.4, es * 0.38, 0, TAU);
      ctx.fill();
    }
    ctx.strokeStyle = '#1B1638';
    ctx.lineWidth = Math.max(1.2, r * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, r * 0.18, r * 0.16, 0.2, Math.PI - 0.2);
    ctx.stroke();
    if (tier >= 3) {
      ctx.fillStyle = 'rgba(255,126,176,0.35)';
      ctx.beginPath();
      ctx.arc(-ex - es * 0.6, ey + es * 2, es * 0.9, 0, TAU);
      ctx.arc(ex + es * 0.6, ey + es * 2, es * 0.9, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  /* Distance² from point to segment. */
  function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px;
    const qy = ay + dy * t - py;
    return qx * qx + qy * qy;
  }

  // Background stars, generated once.
  const STARS = new Float32Array(90 * 3);
  for (let i = 0; i < 90; i++) {
    STARS[i * 3] = Math.random();
    STARS[i * 3 + 1] = Math.random();
    STARS[i * 3 + 2] = Math.random();
  }

  Arcade.register({
    id: 'merge-drop',
    title: 'Merge Drop',
    category: 'combat',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.gold,
    tagline: 'Drop cosmic pieces into the jar and merge matching ones into bigger worlds.',
    hook: 'Every 15 merges a comet falls and smashes the smallest pieces in its path.',
    tags: ['puzzle', 'merge', 'physics', 'drop', 'space', 'casual', 'mouse', 'touch', 'keyboard'],
    howTo: 'Move the dropper and release a piece into the jar. When two pieces of the same kind touch they merge ' +
      'into the next one up: dust, pebble, ice chip, moonlet, moon, ring world, gas giant, sun, blue star, nova and ' +
      'galaxy. Each merge scores the new piece’s value, and two galaxies make a supercluster bonus. If any piece ' +
      'sits above the dashed line for 2 seconds the jar overflows and the run ends. The twist: every 15 merges a ' +
      'comet lines up for a second and a half. Steer its path with the dropper, then it streaks through the jar ' +
      'and smashes every dust and pebble it touches, scoring more for each one in a row.',
    controls: [
      { keys: ['Mouse', 'Touch'], label: 'Aim, click or release to drop' },
      { keys: ['←', '→'], label: 'Move the dropper (A / D too)' },
      { keys: ['Space'], label: 'Drop (Enter or ↓ too)' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = U.alpha(C.text, 0.25 + 0.5 * STARS[i * 3 + 2]);
        ctx.fillRect(STARS[i * 3] * w, STARS[i * 3 + 1] * h, 1.5, 1.5);
      }
      // Jar.
      const jl = w * 0.22;
      const jr = w * 0.78;
      const jb = h - 10;
      ctx.fillStyle = U.alpha(C.panel, 0.7);
      ctx.fillRect(jl, 40, jr - jl, jb - 40);
      ctx.strokeStyle = U.alpha(C.text, 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(jl, 36);
      ctx.lineTo(jl, jb);
      ctx.lineTo(jr, jb);
      ctx.lineTo(jr, 36);
      ctx.stroke();
      const s = 0.42;
      const pcs = [[0.36, 0.84, 7], [0.62, 0.86, 5], [0.79, 0.88, 2], [0.47, 0.62, 4], [0.7, 0.66, 1], [0.58, 0.55, 0],
        [0.33, 0.56, 3], [0.75, 0.52, 0], [0.43, 0.46, 1]];
      for (let i = 0; i < pcs.length; i++) {
        const p = pcs[i];
        drawPiece(ctx, w * p[0], h * p[1], TIERS[p[2]].r * s * (p[2] > 5 ? 0.8 : 1), p[2], i, t, false);
      }
      // Comet streaking diagonally.
      const k = (t * 0.5) % 1;
      const hx = w * 0.05 + k * w * 0.9;
      const hy = 10 + k * h * 0.55;
      ctx.strokeStyle = U.alpha(C.gold, 0.35);
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w * 0.05, 10);
      ctx.lineTo(w * 0.95, 10 + h * 0.55);
      ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = U.alpha(C.gold, 0.5 - i * 0.06);
        ctx.beginPath();
        ctx.arc(hx - i * 9, hy - i * 5.5, 9 - i, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(hx, hy, 6, 0, TAU);
      ctx.fill();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu';    // 'menu' | 'play' | 'over'
      let rush = false;
      let score = 0;
      let merges = 0;
      let cometEvery = 15;
      let sinceComet = 0;
      let biggest = 0;
      let time = 0;
      let acc = 0;
      let shake = 0;
      let dropX = W / 2;
      let aimX = W / 2;
      let cur = 0;
      let next = 0;
      let dropCd = 0;
      let overFx = 0;
      let dangerMax = 0;
      let lastMergeT = -9;
      let chain = 0;
      let hints = {};
      let pointerDown = false;
      let bestShown = null;
      const comet = { phase: 'none', t: 0, side: 1, sx: 0, sy: 0, ex: 0, ey: 0, hx: 0, hy: 0, px: 0, py: 0, smashed: 0, id: 0 };

      /* ---------- Bodies (pooled) ---------- */
      const pool = [];
      for (let i = 0; i < MAXB; i++) {
        pool.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, r: 10, rt: 10, tier: 0, inv: 1, sleep: false, slowT: 0, age: 0,
          ang: 0, overT: 0, sup: false, merging: false, blink: 0, comet: 0, hl: false });
      }
      const live = [];
      const mergeA = [];
      const mergeB = [];
      // Scratch for pieces born from merges (spawned only after the dead ones leave `live`).
      const born = [];
      for (let i = 0; i < 24; i++) born.push({ x: 0, y: 0, vx: 0, vy: 0, tier: 0, fromR: 0 });
      let bornN = 0;

      function addBody(x, y, tier, vx, vy, fromR) {
        let b = null;
        for (let i = 0; i < MAXB; i++) if (!pool[i].on) { b = pool[i]; break; }
        if (!b) return null;
        b.on = true;
        b.x = x; b.y = y; b.vx = vx; b.vy = vy;
        b.tier = tier;
        b.rt = TIERS[tier].r;
        b.r = fromR || b.rt;
        b.inv = 900 / (b.rt * b.rt);
        b.sleep = false; b.slowT = 0; b.age = 0; b.ang = Math.random() * TAU; b.overT = 0;
        b.sup = false; b.merging = false; b.blink = 2 + Math.random() * 4; b.comet = 0; b.hl = false;
        live.push(b);
        return b;
      }

      function compact() {
        let j = 0;
        for (let i = 0; i < live.length; i++) if (live[i].on) live[j++] = live[i];
        live.length = j;
      }

      function wake(b) {
        b.sleep = false;
        b.slowT = 0;
      }

      function wakeNear(x, y, rad) {
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          const dx = b.x - x;
          const dy = b.y - y;
          const rr = rad + b.r;
          if (dx * dx + dy * dy < rr * rr) wake(b);
        }
      }

      /* ---------- Effects (pooled) ---------- */
      const PMAX = 300;
      const parts = [];
      for (let i = 0; i < PMAX; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: C.text, size: 3 });
      let pNext = 0;
      function spark(x, y, vx, vy, life, color, size) {
        const p = parts[pNext];
        pNext = (pNext + 1) % PMAX;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.color = color; p.size = size;
      }
      function burst(x, y, color, n, sp) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = sp * (0.3 + Math.random() * 0.7);
          spark(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.4, color, 2 + Math.random() * 3);
        }
      }
      const rings = [];
      for (let i = 0; i < 10; i++) rings.push({ x: 0, y: 0, r: 10, t: 0, max: 1, color: C.text });
      function ring(x, y, r, color, dur) {
        let best = rings[0];
        for (let i = 1; i < rings.length; i++) if (rings[i].t < best.t) best = rings[i];
        best.x = x; best.y = y; best.r = r; best.color = color; best.t = dur; best.max = dur;
      }
      const texts = [];
      for (let i = 0; i < 10; i++) texts.push({ x: 0, y: 0, t: 0, text: '', color: C.text, big: false });
      function floatText(x, y, text, color, big) {
        let best = texts[0];
        for (let i = 1; i < texts.length; i++) if (texts[i].t < best.t) best = texts[i];
        best.x = x; best.y = y; best.text = text; best.color = color; best.t = big ? 1.4 : 0.9; best.big = !!big;
      }

      function hint(key, text) {
        if (hints[key]) return;
        hints[key] = true;
        api.setStatus(text);
      }

      function randTier() {
        let total = 0;
        for (let i = 0; i < DROP_WEIGHTS.length; i++) total += DROP_WEIGHTS[i];
        let r = Math.random() * total;
        for (let i = 0; i < DROP_WEIGHTS.length; i++) {
          r -= DROP_WEIGHTS[i];
          if (r < 0) return i;
        }
        return 0;
      }

      /* ---------- Game flow ---------- */
      function reset() {
        for (let i = 0; i < MAXB; i++) pool[i].on = false;
        live.length = 0;
        for (let i = 0; i < PMAX; i++) parts[i].life = 0;
        score = 0;
        merges = 0;
        sinceComet = 0;
        biggest = 0;
        dropCd = 0.3;
        cur = randTier();
        next = randTier();
        dropX = W / 2;
        aimX = W / 2;
        comet.phase = 'none';
        overFx = 0;
        chain = 0;
        hints = {};
        bestShown = api.best();
        api.setScore(0);
      }

      function startRun(r) {
        rush = r;
        cometEvery = rush ? 8 : 15;
        reset();
        state = 'play';
        api.setStatus(rush
          ? 'Comet rush: a comet every 8 merges. Merge matching pieces and aim each comet at the dust.'
          : 'Merge matching pieces. Every 15 merges a comet smashes the dust and pebbles in its path.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Merge Drop',
          text: 'Drop and merge cosmic pieces. Every 15 merges a comet streaks through and smashes the smallest ones.',
          buttons: [
            { label: 'Classic', primary: true, onClick: () => startRun(false) },
            { label: 'Comet rush', onClick: () => startRun(true) }
          ]
        });
      }

      function gameOver() {
        state = 'over';
        overFx = 1;
        shake = 10;
        api.sfx('lose');
        const isBest = api.reportScore(score);
        bestShown = api.best();
        api.setStatus('The jar overflowed. Biggest piece: ' + TIERS[biggest].name.toLowerCase() + '.');
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Jar overflowed',
          text: 'You scored ' + score + ' points with ' + merges + ' merges. Biggest piece: ' + TIERS[biggest].name + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startRun(rush) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function drop() {
        if (state !== 'play' || dropCd > 0 || comet.phase !== 'none') return;
        const r = TIERS[cur].r;
        const x = U.clamp(dropX, LEFT + r + 1, RIGHT - r - 1);
        addBody(x, DROP_Y, cur, 0, 60);
        cur = next;
        next = randTier();
        dropCd = DROP_CD;
        api.sfx('flip');
      }

      /* ---------- Merging ---------- */
      function queueMerge(a, b) {
        if (a.merging || b.merging || mergeA.length >= 24) return;
        a.merging = true;
        b.merging = true;
        mergeA.push(a);
        mergeB.push(b);
      }

      function processMerges() {
        if (!mergeA.length) return;
        for (let i = 0; i < mergeA.length; i++) {
          const a = mergeA[i];
          const b = mergeB[i];
          if (!a.on || !b.on) continue;
          const t = a.tier + 1;
          const mx = (a.x * a.rt * a.rt + b.x * b.rt * b.rt) / (a.rt * a.rt + b.rt * b.rt);
          const my = (a.y + b.y) / 2;
          a.on = false;
          b.on = false;
          a.merging = false;
          b.merging = false;
          merges++;
          sinceComet++;
          if (time - lastMergeT < 0.7) chain++;
          else chain = 1;
          lastMergeT = time;
          if (t >= TIERS.length) {
            score += SUPER_BONUS;
            burst(mx, my, C.violet, 60, 500);
            burst(mx, my, '#FFFFFF', 30, 400);
            ring(mx, my, 140, C.violet, 0.8);
            floatText(mx, my, 'Supercluster! +' + SUPER_BONUS, C.violet, true);
            shake = 14;
            api.sfx('win');
            wakeNear(mx, my, 260);
          } else {
            const nb = born[bornN++];
            nb.x = mx;
            nb.y = my;
            nb.vx = (a.vx + b.vx) / 2;
            nb.vy = Math.min(0, (a.vy + b.vy) / 2) - 40;
            nb.tier = t;
            nb.fromR = TIERS[a.tier].r * 1.05;
            score += TIERS[t].value;
            if (t > biggest) {
              biggest = t;
              if (t >= 5) floatText(W / 2, 250, TIERS[t].name + '!', TIERS[t].color, true);
            }
            burst(mx, my, TIERS[t].color, 10 + t * 3, 140 + t * 25);
            ring(mx, my, TIERS[t].r, TIERS[t].color, 0.4);
            floatText(mx, my - TIERS[t].r * 0.4, '+' + TIERS[t].value + (chain > 1 ? '  ×' + chain : ''), C.text, false);
            if (t >= 7) shake = Math.max(shake, 4 + t - 7);
            api.sfx(t >= 6 ? 'score' : t >= 3 ? 'blip' : 'tick');
            wakeNear(mx, my, TIERS[t].r + 90);
          }
          api.setScore(score);
          if (sinceComet === cometEvery - 3 && !hints.soon) {
            hint('soon', 'A comet is coming in 3 merges. It smashes dust and pebbles, so leave some in a line.');
          }
        }
        mergeA.length = 0;
        mergeB.length = 0;
        compact();
        for (let i = 0; i < bornN; i++) {
          const nb = born[i];
          addBody(nb.x, nb.y, nb.tier, nb.vx, nb.vy, nb.fromR);
        }
        bornN = 0;
        if (sinceComet >= cometEvery && comet.phase === 'none') startComet();
      }

      /* ---------- Comet ---------- */
      function cometLine(ax) {
        comet.sx = comet.side < 0 ? LEFT - 90 : RIGHT + 90;
        comet.sy = 70;
        comet.ex = ax;
        comet.ey = FLOOR + 10;
      }

      function countHits(ax) {
        cometLine(ax);
        let n = 0;
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          if (b.tier > 1) continue;
          const rr = b.r + COMET_R;
          if (segDist2(b.x, b.y, comet.sx, comet.sy, comet.ex, comet.ey) < rr * rr) n++;
        }
        return n;
      }

      function startComet() {
        sinceComet = 0;
        comet.phase = 'warn';
        comet.t = 0;
        comet.side = Math.random() < 0.5 ? -1 : 1;
        comet.smashed = 0;
        comet.id++;
        // Start aimed at the lane with the most small pieces; the player can steer it.
        let best = -1;
        let bx = W / 2;
        for (let x = LEFT + 20; x <= RIGHT - 20; x += 10) {
          const n = countHits(x) * 100 - Math.abs(x - W / 2) * 0.05;
          if (n > best) { best = n; bx = x; }
        }
        dropX = bx;
        aimX = bx;
        cometLine(bx);
        api.sfx('power');
        hint('comet', 'Comet incoming! Move the dropper to aim it. It smashes every dust and pebble it touches.');
      }

      function cometStep(dt) {
        comet.t += dt;
        if (comet.phase === 'warn') {
          cometLine(aimX);
          if (comet.t >= WARN_T) {
            comet.phase = 'streak';
            comet.t = 0;
            comet.hx = comet.sx;
            comet.hy = comet.sy;
            api.sfx('shoot');
          }
          return;
        }
        if (comet.phase !== 'streak') return;
        comet.px = comet.hx;
        comet.py = comet.hy;
        const k = Math.min(1, comet.t / STREAK_T);
        comet.hx = comet.sx + (comet.ex - comet.sx) * k;
        comet.hy = comet.sy + (comet.ey - comet.sy) * k;
        const dx = comet.ex - comet.sx;
        const dy = comet.ey - comet.sy;
        const dl = Math.hypot(dx, dy);
        const ux = dx / dl;
        const uy = dy / dl;
        let removed = false;
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          if (!b.on || b.comet === comet.id) continue;
          const rr = b.r + COMET_R;
          if (segDist2(b.x, b.y, comet.px, comet.py, comet.hx, comet.hy) >= rr * rr) continue;
          b.comet = comet.id;
          if (b.tier <= 1) {
            comet.smashed++;
            const pts = TIERS[b.tier].value * comet.smashed;
            score += pts;
            b.on = false;
            removed = true;
            burst(b.x, b.y, TIERS[b.tier].color, 14, 260);
            burst(b.x, b.y, C.gold, 6, 200);
            floatText(b.x, b.y, '+' + pts, C.gold, false);
            api.sfx('hit');
            wakeNear(b.x, b.y, b.r + 70);
          } else {
            wake(b);
            const push = 260 / Math.sqrt(b.tier);
            b.vx += ux * push;
            b.vy += uy * push * 0.5 - 60;
          }
        }
        if (removed) {
          compact();
          api.setScore(score);
          shake = Math.max(shake, 5);
        }
        if (Math.random() < 0.9) spark(comet.hx, comet.hy, -ux * 120 + (Math.random() - 0.5) * 80, -uy * 120 + (Math.random() - 0.5) * 80, 0.5, C.gold, 4);
        if (k >= 1) {
          comet.phase = 'none';
          shake = Math.max(shake, 9);
          burst(comet.ex, FLOOR - 4, C.gold, 30, 380);
          ring(comet.ex, FLOOR - 4, 60, C.gold, 0.5);
          api.sfx('boom');
          if (comet.smashed > 0) {
            floatText(W / 2, 300, 'Comet smashed ' + comet.smashed, C.gold, true);
            api.setStatus('The comet smashed ' + comet.smashed + ' small piece' + (comet.smashed === 1 ? '' : 's') + '. Next one in ' + cometEvery + ' merges.');
          } else {
            api.setStatus('The comet missed every small piece. Next one in ' + cometEvery + ' merges.');
          }
          wakeNear(W / 2, FLOOR / 2, 900);
          dropCd = Math.max(dropCd, 0.25);
        }
      }

      /* ---------- Physics ---------- */
      function contact(a, b) {
        const rs = a.r + b.r;
        const dx = b.x - a.x;
        if (dx > rs + 1 || dx < -rs - 1) return;
        const dy = b.y - a.y;
        if (dy > rs + 1 || dy < -rs - 1) return;
        const d2 = dx * dx + dy * dy;
        if (d2 > (rs + 1) * (rs + 1)) return;
        let d = Math.sqrt(d2);
        let nx = 0;
        let ny = 1;
        if (d > 0.0001) { nx = dx / d; ny = dy / d; } else d = 0;
        // Resting contacts count as support for whoever is on top.
        if (ny > 0.25) a.sup = true;
        else if (ny < -0.25) b.sup = true;
        if (d >= rs) return;
        if (a.tier === b.tier && !a.merging && !b.merging) { queueMerge(a, b); return; }
        if (a.sleep && b.sleep) return;
        const pen = rs - d;
        if (a.sleep && pen > 0.8) wake(a);
        if (b.sleep && pen > 0.8) wake(b);
        const ima = a.sleep ? 0 : a.inv;
        const imb = b.sleep ? 0 : b.inv;
        const sum = ima + imb;
        if (sum <= 0) return;
        const corr = (Math.min(pen, 5) * 0.85) / sum;
        a.x -= nx * corr * ima;
        a.y -= ny * corr * ima;
        b.x += nx * corr * imb;
        b.y += ny * corr * imb;
        const rvx = b.vx - a.vx;
        const rvy = b.vy - a.vy;
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) {
          if (vn < -25) { if (a.sleep) wake(a); if (b.sleep) wake(b); }
          const j = (-(1 + REST) * vn) / sum;
          a.vx -= j * nx * ima;
          a.vy -= j * ny * ima;
          b.vx += j * nx * imb;
          b.vy += j * ny * imb;
          const tx = -ny;
          const ty = nx;
          const vt = rvx * tx + rvy * ty;
          let jt = -vt / sum;
          const mf = FRICTION * j;
          jt = jt < -mf ? -mf : jt > mf ? mf : jt;
          a.vx -= jt * tx * ima;
          a.vy -= jt * ty * ima;
          b.vx += jt * tx * imb;
          b.vy += jt * ty * imb;
        }
      }

      function walls(b) {
        if (b.x - b.r < LEFT) { b.x = LEFT + b.r; if (b.vx < 0) b.vx = -b.vx * 0.2; }
        if (b.x + b.r > RIGHT) { b.x = RIGHT - b.r; if (b.vx > 0) b.vx = -b.vx * 0.2; }
        if (b.y + b.r >= FLOOR - 0.5) {
          b.sup = true;
          if (b.y + b.r > FLOOR) {
            b.y = FLOOR - b.r;
            if (b.vy > 0) b.vy = -b.vy * 0.1;
            b.vx *= 0.985;
          }
        }
      }

      function physStep(dt) {
        const n = live.length;
        for (let i = 0; i < n; i++) {
          const b = live[i];
          b.age += dt;
          if (b.r < b.rt) {
            b.r = Math.min(b.rt, b.r + b.rt * dt * 5);
            wake(b);
          }
          b.sup = false;
          if (b.sleep) continue;
          b.vy += G * dt;
          b.vx *= 0.9995;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.ang += (b.vx / b.r) * dt;
        }
        for (let it = 0; it < ITER; it++) {
          if (it > 0) for (let i = 0; i < n; i++) live[i].sup = false;
          for (let i = 0; i < n; i++) {
            const a = live[i];
            for (let j = i + 1; j < n; j++) contact(a, live[j]);
          }
          for (let i = 0; i < n; i++) if (!live[i].sleep) walls(live[i]); else if (live[i].y + live[i].r >= FLOOR - 0.5) live[i].sup = true;
        }
        processMerges();
        const m = live.length;
        for (let i = 0; i < m; i++) {
          const b = live[i];
          if (b.sleep) {
            if (!b.sup) wake(b);
            continue;
          }
          const sp2 = b.vx * b.vx + b.vy * b.vy;
          if (sp2 < 144 && b.sup && b.age > 0.6) {
            b.slowT += dt;
            if (b.slowT > 0.45) {
              b.sleep = true;
              b.vx = 0;
              b.vy = 0;
            }
          } else b.slowT = 0;
          // Safety: never let anything escape the jar sideways or through the floor.
          if (b.x < LEFT + b.r - 2 || b.x > RIGHT - b.r + 2) b.x = U.clamp(b.x, LEFT + b.r, RIGHT - b.r);
          if (b.y > FLOOR - b.r + 2) b.y = FLOOR - b.r;
        }
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown' || e.code === 'KeyS') drop();
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        pointerDown = true;
        dropX = api.toCanvas(e, canvas).x;
      });
      api.on(canvas, 'pointermove', (e) => {
        if (state !== 'play') return;
        if (e.pointerType === 'mouse' || pointerDown) {
          dropX = api.toCanvas(e, canvas).x;
        }
      });
      api.on(canvas, 'pointerup', (e) => {
        if (state !== 'play' || !pointerDown) return;
        pointerDown = false;
        dropX = api.toCanvas(e, canvas).x;
        drop();
      });
      api.on(canvas, 'pointercancel', () => { pointerDown = false; });

      /* ---------- Update ---------- */
      function update(dt) {
        time += dt;
        shake = Math.max(0, shake - dt * 30);
        overFx = Math.max(0, overFx - dt * 0.8);
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 300 * dt;
          p.vx *= 0.98;
        }
        for (let i = 0; i < rings.length; i++) rings[i].t -= dt;
        for (let i = 0; i < texts.length; i++) texts[i].t -= dt;
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          b.blink -= dt;
          if (b.blink < -0.12) b.blink = 2 + Math.random() * 4;
        }
        if (state !== 'play') return;
        const k = api.keys;
        const dir = ((k.has('ArrowRight') || k.has('KeyD')) ? 1 : 0) - ((k.has('ArrowLeft') || k.has('KeyA')) ? 1 : 0);
        if (dir) dropX += dir * 460 * dt;
        const r = TIERS[cur].r;
        dropX = U.clamp(dropX, comet.phase === 'warn' ? LEFT + 10 : LEFT + r + 1, comet.phase === 'warn' ? RIGHT - 10 : RIGHT - r - 1);
        aimX = dropX;
        dropCd -= dt;
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          physStep(STEP);
          if (comet.phase !== 'none') cometStep(STEP);
        }
        // Overflow check.
        dangerMax = 0;
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          b.hl = false;
          if (b.age > 1.2 && b.y - b.r < DANGER && Math.abs(b.vy) < 120) b.overT += dt;
          else b.overT = Math.max(0, b.overT - dt * 2);
          if (b.overT > dangerMax) dangerMax = b.overT;
        }
        if (dangerMax > 0.4) hint('danger', 'A piece is poking above the dashed line. Merge it down within 2 seconds or the jar overflows.');
        if (dangerMax >= OVER_TIME) { gameOver(); return; }
        if (comet.phase === 'warn') {
          for (let i = 0; i < live.length; i++) {
            const b = live[i];
            if (b.tier > 1) continue;
            const rr = b.r + COMET_R;
            b.hl = segDist2(b.x, b.y, comet.sx, comet.sy, comet.ex, comet.ey) < rr * rr;
          }
        }
      }

      /* ---------- Drawing ---------- */
      function drawBackground() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.violet, 0.07);
        ctx.beginPath();
        ctx.arc(W * 0.2, H * 0.25, 220, 0, TAU);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.p2, 0.05);
        ctx.beginPath();
        ctx.arc(W * 0.85, H * 0.7, 260, 0, TAU);
        ctx.fill();
        for (let i = 0; i < 90; i++) {
          const tw = 0.3 + 0.7 * Math.abs(Math.sin(time * (0.5 + STARS[i * 3 + 2]) + i));
          ctx.fillStyle = U.alpha(C.text, 0.15 + 0.45 * tw * STARS[i * 3 + 2]);
          const s = STARS[i * 3 + 2] > 0.8 ? 2 : 1.2;
          ctx.fillRect(STARS[i * 3] * W, STARS[i * 3 + 1] * H, s, s);
        }
      }

      function drawJar() {
        ctx.fillStyle = U.alpha(C.panel, 0.55);
        ctx.fillRect(LEFT, RIM, RIGHT - LEFT, FLOOR - RIM);
        ctx.fillStyle = U.alpha('#FFFFFF', 0.03);
        ctx.fillRect(LEFT + 8, RIM, 18, FLOOR - RIM - 10);
        ctx.strokeStyle = U.alpha(C.text, 0.35);
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(LEFT - 3, RIM - 14);
        ctx.lineTo(LEFT - 3, FLOOR + 3);
        ctx.lineTo(RIGHT + 3, FLOOR + 3);
        ctx.lineTo(RIGHT + 3, RIM - 14);
        ctx.stroke();
        ctx.strokeStyle = U.alpha(C.text, 0.12);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(LEFT + 6, RIM);
        ctx.lineTo(LEFT + 6, FLOOR - 8);
        ctx.stroke();
        // Danger line.
        const warn = Math.min(1, dangerMax / OVER_TIME);
        const pulse = warn > 0 ? 0.5 + 0.5 * Math.sin(time * (8 + warn * 16)) : 0;
        ctx.strokeStyle = warn > 0 ? U.alpha(C.p1, 0.5 + pulse * 0.5) : U.alpha(C.p1, 0.35);
        ctx.lineWidth = warn > 0 ? 2 + pulse * 2 : 2;
        ctx.setLineDash([10, 8]);
        ctx.lineDashOffset = -time * 20;
        ctx.beginPath();
        ctx.moveTo(LEFT, DANGER);
        ctx.lineTo(RIGHT, DANGER);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        if (warn > 0) {
          ctx.fillStyle = U.alpha(C.p1, 0.12 * pulse + 0.05);
          ctx.fillRect(LEFT, RIM, RIGHT - LEFT, DANGER - RIM);
        }
      }

      function drawDropper() {
        if (state !== 'play') return;
        const x = dropX;
        if (comet.phase === 'warn') {
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, DROP_Y, 16, 0, TAU);
          ctx.moveTo(x - 24, DROP_Y);
          ctx.lineTo(x + 24, DROP_Y);
          ctx.moveTo(x, DROP_Y - 24);
          ctx.lineTo(x, DROP_Y + 24);
          ctx.stroke();
          return;
        }
        ctx.strokeStyle = U.alpha(C.text, 0.15);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(x, DROP_Y + TIERS[cur].r);
        ctx.lineTo(x, FLOOR);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, x - 22, 34, 44, 10, 5);
        ctx.fill();
        if (dropCd <= 0) {
          const r = TIERS[cur].r;
          drawPiece(ctx, U.clamp(x, LEFT + r + 1, RIGHT - r - 1), DROP_Y, r, cur, 0, time, false);
        }
      }

      function drawComet() {
        if (comet.phase === 'warn') {
          const k = comet.t / WARN_T;
          const a = 0.35 + 0.45 * Math.abs(Math.sin(time * (6 + k * 14)));
          ctx.strokeStyle = U.alpha(C.gold, 0.12);
          ctx.lineWidth = COMET_R * 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(comet.sx, comet.sy);
          ctx.lineTo(comet.ex, comet.ey);
          ctx.stroke();
          ctx.strokeStyle = U.alpha(C.gold, a);
          ctx.lineWidth = 2;
          ctx.setLineDash([12, 10]);
          ctx.lineDashOffset = -time * 60;
          ctx.beginPath();
          ctx.moveTo(comet.sx, comet.sy);
          ctx.lineTo(comet.ex, comet.ey);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          // Countdown arc at the entry point.
          const ex = U.clamp(comet.sx, 20, W - 20);
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(ex, comet.sy + 10, 14, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - k));
          ctx.stroke();
          for (let i = 0; i < live.length; i++) {
            const b = live[i];
            if (!b.hl) continue;
            ctx.strokeStyle = U.alpha(C.p1, a + 0.2);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 4, 0, TAU);
            ctx.stroke();
          }
        } else if (comet.phase === 'streak') {
          const dx = comet.ex - comet.sx;
          const dy = comet.ey - comet.sy;
          const dl = Math.hypot(dx, dy);
          for (let i = 10; i >= 0; i--) {
            const bx = comet.hx - (dx / dl) * i * 14;
            const by = comet.hy - (dy / dl) * i * 14;
            ctx.fillStyle = U.alpha(i < 2 ? '#FFFFFF' : C.gold, 0.55 - i * 0.045);
            ctx.beginPath();
            ctx.arc(bx, by, COMET_R * (1 - i * 0.06), 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(comet.hx, comet.hy, COMET_R * 0.6, 0, TAU);
          ctx.fill();
        }
      }

      function drawHud() {
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.font = '800 26px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(String(score), 16, 14);
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.fillText('best ' + (bestShown === null ? '–' : Math.max(bestShown, score)), 18, 48);
        // Next piece.
        ctx.textAlign = 'right';
        ctx.fillText('NEXT', W - 18, 14);
        drawPiece(ctx, W - 40, 56, Math.min(22, TIERS[next].r), next, 0, time, false);
        // Comet meter.
        const cx = W / 2;
        const frac = comet.phase === 'none' ? sinceComet / cometEvery : 1;
        ctx.strokeStyle = C.panel2;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, 46, 18, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = comet.phase !== 'none' && Math.sin(time * 14) > 0 ? '#FFFFFF' : C.gold;
        ctx.beginPath();
        ctx.arc(cx, 46, 18, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(cx + 3, 43, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.gold, 0.5);
        ctx.beginPath();
        ctx.moveTo(cx - 9, 52);
        ctx.lineTo(cx, 40);
        ctx.lineTo(cx + 2, 48);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        const left = cometEvery - sinceComet;
        ctx.fillText(comet.phase !== 'none' ? 'COMET!' : 'comet in ' + left, cx, 70);
        // Tier ladder.
        const y = H - 18;
        const gap = (W - 60) / (TIERS.length - 1);
        for (let i = 0; i < TIERS.length; i++) {
          const x = 30 + i * gap;
          const rr = 4 + i * 0.6;
          ctx.fillStyle = i <= biggest ? TIERS[i].color : C.panel2;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, TAU);
          ctx.fill();
        }
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        drawBackground();
        drawJar();
        for (let i = 0; i < live.length; i++) {
          const b = live[i];
          drawPiece(ctx, b.x, b.y, b.r, b.tier, b.ang, time, b.blink < 0);
          if (b.overT > 0.2) {
            ctx.strokeStyle = U.alpha(C.p1, 0.5 + 0.5 * Math.sin(time * 20));
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.r + 3, 0, TAU);
            ctx.stroke();
          }
        }
        drawComet();
        for (let i = 0; i < rings.length; i++) {
          const rg = rings[i];
          if (rg.t <= 0) continue;
          const k = 1 - rg.t / rg.max;
          ctx.strokeStyle = U.alpha(rg.color, 1 - k);
          ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(rg.x, rg.y, rg.r * (0.8 + k * 0.7), 0, TAU);
          ctx.stroke();
        }
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.5);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        drawDropper();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < texts.length; i++) {
          const tx = texts[i];
          if (tx.t <= 0) continue;
          ctx.globalAlpha = Math.min(1, tx.t * 2.5);
          ctx.font = tx.big ? '800 26px Unbounded, sans-serif' : HUD;
          ctx.fillStyle = 'rgba(15,13,36,0.7)';
          ctx.fillText(tx.text, tx.x + 2, tx.y - (1 - tx.t) * 30 + 2);
          ctx.fillStyle = tx.color;
          ctx.fillText(tx.text, tx.x, tx.y - (1 - tx.t) * 30);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (overFx > 0) {
          ctx.fillStyle = U.alpha(C.p1, overFx * 0.3);
          ctx.fillRect(0, 0, W, H);
        }
        drawHud();
      }

      reset();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
