/* Ink Wars: paint the arena your color. Hook: painting costs ink, and you only refill on your own color. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const CELL = 18;
  const COLS = 48;
  const ROWS = 27;
  const N = COLS * ROWS;
  const OX = (W - COLS * CELL) / 2;
  const OY = 46;
  const ROUND_TIME = 60;
  const WIN_ROUNDS = 2;          // best of 3
  const INK_MAX = 40;
  const REFILL = 30;             // ink per second on your own color
  const SPEED = 150;
  const BOOST = 1.6;
  const BLOB_R = 11;
  const SPLASH_R = 3.2;          // cells
  const MAX_PARTS = 500;
  const POWERS = {
    splash: { color: C.gold, label: 'Splash bomb' },
    boots: { color: C.mint, label: 'Speed boots' },
    freeze: { color: C.violet, label: 'Freeze ray' }
  };
  const KINDS = Object.keys(POWERS);
  const LEVELS = {
    easy: { think: 0.75, samples: 25, homeAt: 0.02, wander: 0.25, useDelay: 2.5, speed: 0.88, smart: false },
    normal: { think: 0.35, samples: 90, homeAt: 0.18, wander: 0.06, useDelay: 1, speed: 1, smart: false },
    hard: { think: 0.15, samples: N, homeAt: 0.25, wander: 0, useDelay: 0.25, speed: 1, smart: true }
  };

  // Rounded tile added to the current path (no beginPath, so tiles of one color batch into one fill).
  function tile(ctx, x, y, s, r) {
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + s, y, x + s, y + s, r);
    ctx.arcTo(x + s, y + s, x, y + s, r);
    ctx.arcTo(x, y + s, x, y, r);
    ctx.arcTo(x, y, x + s, y, r);
    ctx.closePath();
  }

  function drawBlob(ctx, x, y, color, lookX, lookY, squash, frozen) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + BLOB_R * 0.8, BLOB_R, BLOB_R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1 + squash, 1 - squash);
    ctx.fillStyle = color;
    ctx.strokeStyle = U.alpha(C.ink, 0.8);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, BLOB_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(-BLOB_R * 0.35, -BLOB_R * 0.4, BLOB_R * 0.3, 0, Math.PI * 2);
    ctx.fill();
    for (const s of [-1, 1]) {
      const ex = lookX * 3 + s * 4 - lookY * s * 0.5, ey = lookY * 3 - 1;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(ex + lookX * 1.3, ey + lookY * 1.3, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (frozen) {
      ctx.strokeStyle = U.alpha('#DDEBFF', 0.9);
      ctx.fillStyle = U.alpha('#DDEBFF', 0.35);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = k * Math.PI / 3 + Math.PI / 6;
        ctx.lineTo(x + Math.cos(a) * (BLOB_R + 5), y + Math.sin(a) * (BLOB_R + 5));
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  function drawPower(ctx, x, y, kind, t) {
    const col = POWERS[kind].color;
    const bob = Math.sin(t * 4) * 2;
    ctx.fillStyle = U.alpha(col, 0.22);
    ctx.beginPath();
    ctx.arc(x, y + bob, 13 + Math.sin(t * 6) * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + bob, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    drawIcon(ctx, x, y + bob, kind, 1);
  }

  function drawIcon(ctx, x, y, kind, s) {
    const col = POWERS[kind].color;
    ctx.fillStyle = col;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    if (kind === 'splash') {
      ctx.moveTo(x, y - 6 * s);
      ctx.quadraticCurveTo(x + 6 * s, y + 1 * s, x, y + 5 * s);
      ctx.quadraticCurveTo(x - 6 * s, y + 1 * s, x, y - 6 * s);
      ctx.fill();
    } else if (kind === 'boots') {
      ctx.moveTo(x - 5 * s, y - 4 * s); ctx.lineTo(x, y); ctx.lineTo(x - 5 * s, y + 4 * s);
      ctx.moveTo(x + 1 * s, y - 4 * s); ctx.lineTo(x + 6 * s, y); ctx.lineTo(x + 1 * s, y + 4 * s);
      ctx.stroke();
    } else {
      for (let k = 0; k < 3; k++) {
        const a = k * Math.PI / 3;
        ctx.moveTo(x - Math.cos(a) * 6 * s, y - Math.sin(a) * 6 * s);
        ctx.lineTo(x + Math.cos(a) * 6 * s, y + Math.sin(a) * 6 * s);
      }
      ctx.stroke();
    }
  }

  Arcade.register({
    id: 'ink-wars',
    title: 'Ink Wars',
    mode: 'together',
    players: '1–2P',
    original: true,
    color: C.mint,
    tagline: 'Paint the arena your color before the clock runs out.',
    hook: 'Painting costs ink, and you only refill standing on your own color.',
    tags: ['versus', 'two player', 'computer', 'territory', 'arcade', 'keyboard'],
    howTo: 'Roll your blob over the floor to paint it. Each round lasts 60 seconds, and whoever covers more of the ' +
      'arena wins it; best of 3. Painting a blank tile costs 1 ink and taking an enemy tile costs 2. When your tank ' +
      'runs dry you stop painting, so roll back onto your own color to refill fast. Grab power-ups and fire them with ' +
      'your action key: a splash bomb paints a big circle for free, speed boots last 5 seconds, and a freeze ray ' +
      'stops your rival for 2 seconds.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Player 1 move' },
      { keys: ['Space'], label: 'Player 1 use power-up' },
      { keys: ['↑', '↓', '←', '→'], label: 'Player 2 move' },
      { keys: ['Enter'], label: 'Player 2 use power-up' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 16;
      const top = 26;
      const cols = Math.ceil(w / s), rows = Math.ceil((h - top) / s);
      const shift = Math.sin(t * 1.2) * 0.8;
      const fills = [[], [], []];
      for (let y = 0; y < rows; y++) {
        const b1 = cols * 0.36 + Math.sin(y * 0.9) * 1.6 + shift;
        const b2 = cols * 0.6 + Math.sin(y * 0.7 + 1) * 1.8 + shift;
        for (let x = 0; x < cols; x++) fills[x < b1 ? 1 : x > b2 ? 2 : 0].push(x, y);
      }
      [U.alpha(C.line, 0.6), C.p1, C.p2].forEach((col, k) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        const f = fills[k];
        for (let i = 0; i < f.length; i += 2) tile(ctx, f[i] * s + 1.5, top + f[i + 1] * s + 1.5, s - 3, 4);
        ctx.fill();
      });
      // Tug-of-war bar and ink tanks.
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, w, top);
      const bw = w * 0.44, bx = (w - bw) / 2;
      ctx.fillStyle = C.p1;
      ctx.fillRect(bx, 9, bw * (0.47 + shift * 0.02), 8);
      ctx.fillStyle = C.p2;
      ctx.fillRect(bx + bw * 0.6, 9, bw * 0.4, 8);
      ctx.fillStyle = U.alpha(C.p1, 0.9);
      ctx.fillRect(10, 10, 50 * (0.35 + 0.3 * Math.sin(t * 2) ** 2), 6);
      ctx.fillStyle = U.alpha(C.p2, 0.9);
      ctx.fillRect(w - 60, 10, 50 * 0.8, 6);
      ctx.strokeStyle = U.alpha(C.text, 0.6);
      ctx.lineWidth = 1;
      ctx.strokeRect(10, 10, 50, 6);
      ctx.strokeRect(w - 60, 10, 50, 6);
      // Blobs at the front lines, ink drops flying.
      const y1 = top + (h - top) * 0.45 + Math.sin(t * 2) * 10;
      const x1 = w * 0.38 + shift * s;
      for (let k = 0; k < 5; k++) {
        ctx.fillStyle = U.alpha(C.p1, 0.8);
        ctx.beginPath();
        ctx.arc(x1 + 14 + k * 5, y1 - 8 + Math.sin(k * 2.1 + t * 5) * 7, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBlob(ctx, x1, y1, C.p1, 1, 0, 0.08, false);
      drawBlob(ctx, w * 0.6 + shift * s, top + (h - top) * 0.72, C.p2, -1, 0, 0, false);
      drawPower(ctx, w * 0.5, top + (h - top) * 0.22, 'splash', t);
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);
      const owner = new Uint8Array(N);       // 0 neutral, 1 P1, 2 P2
      const paintedAt = new Float32Array(N); // for the fresh-paint pop

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'roundEnd' | 'over'
      let cpuOn = false;
      let level = 'normal';
      let blobs = [];
      let counts = [0, 0];
      let scores = [0, 0];
      let round = 0;
      let timeLeft = ROUND_TIME;
      let clock = 0;
      let countT = 0, lastCount = 0, goFlash = 0, endT = 0, lastSec = 0;
      let roundMsg = '', roundSub = '', roundColor = C.text;
      let powers = [];
      let spawnT = 0;
      let particles = [];
      let shake = 0;
      let hinted = { empty: false, power: false };
      const ai = { timer: 0, tx: 0, ty: 0, useT: 0, refill: false, stuckT: 0 };

      const nameOf = (i) => (cpuOn ? (i === 0 ? 'You' : 'Computer') : 'Player ' + (i + 1));
      const shortName = (i) => (cpuOn ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));
      const cellCx = (c) => OX + (c % COLS) * CELL + CELL / 2;
      const cellCy = (c) => OY + Math.floor(c / COLS) * CELL + CELL / 2;
      const isHuman = (p) => !(cpuOn && p.id === 1);

      function cellAt(x, y) {
        const cx = Math.floor((x - OX) / CELL), cy = Math.floor((y - OY) / CELL);
        if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return -1;
        return cy * COLS + cx;
      }

      function makeBlob(id) {
        return {
          id, x: cellCx(13 * COLS + (id === 0 ? 6 : COLS - 7)), y: cellCy(13 * COLS), vx: 0, vy: 0,
          ink: INK_MAX, dry: false, slot: null, boots: 0, frozen: 0, look: id === 0 ? 1 : -1, lookY: 0,
          squash: 0, color: id === 0 ? C.p1 : C.p2
        };
      }

      function resetRound() {
        owner.fill(0);
        paintedAt.fill(-10);
        counts = [0, 0];
        blobs = [makeBlob(0), makeBlob(1)];
        powers = [];
        spawnT = 5;
        timeLeft = ROUND_TIME;
        lastSec = ROUND_TIME;
        ai.timer = 0;
        ai.refill = false;
        ai.useT = 0;
      }

      function startRound() {
        round++;
        resetRound();
        state = 'count';
        countT = 3;
        lastCount = 4;
        api.setStatus('Round ' + round + ', best of 3. Painting costs ink (enemy tiles cost 2). Refill by standing on your own color.');
      }

      function startMatch(cpu, lvl) {
        cpuOn = cpu;
        level = lvl || 'normal';
        scores = [0, 0];
        round = 0;
        particles = [];
        hinted = { empty: false, power: false };
        api.setScore('0 – 0');
        startRound();
      }

      function showStartMenu() {
        state = 'menu';
        resetRound();
        api.setScore('0 – 0');
        api.menu({
          title: 'Ink Wars',
          text: 'Paint more of the arena than your rival in 60 seconds. Painting costs ink, and you only refill on ' +
            'your own color. Best of 3 rounds.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false) },
            { label: 'vs computer', onClick: showLevelMenu }
          ]
        });
        api.setStatus('Player 1: WASD + Space. Player 2: arrows + Enter.');
      }

      function showLevelMenu() {
        api.menu({
          title: 'Computer level',
          text: 'You paint coral with WASD (or arrows) and use power-ups with Space. The computer paints cyan.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      function matchOver() {
        state = 'over';
        const w = scores[0] >= WIN_ROUNDS ? 0 : 1;
        api.sfx(cpuOn && w === 1 ? 'lose' : 'win');
        api.setStatus(nameOf(w) + (cpuOn && w === 0 ? ' win' : ' wins') + ' the match ' + scores[0] + ' – ' + scores[1] + '.');
        api.menu({
          title: cpuOn ? (w === 0 ? 'You win!' : 'Computer wins') : 'Player ' + (w + 1) + ' wins!',
          text: 'Rounds won ' + scores[0] + ' – ' + scores[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(cpuOn, level) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function endRound() {
        state = 'roundEnd';
        endT = 2.6;
        const total = N;
        const pct = (k) => Math.round((counts[k] / total) * 100);
        if (counts[0] === counts[1]) {
          roundMsg = 'Tie round';
          roundColor = C.gold;
          roundSub = 'Exactly even. Nobody scores.';
        } else {
          const w = counts[0] > counts[1] ? 0 : 1;
          scores[w]++;
          roundMsg = (cpuOn ? (w === 0 ? 'You take' : 'Computer takes') : 'Player ' + (w + 1) + ' takes') + ' the round';
          roundColor = blobs[w].color;
          roundSub = pct(0) + '% coral, ' + pct(1) + '% cyan';
          api.sfx('score');
        }
        api.setScore(scores[0] + ' – ' + scores[1]);
        api.setStatus(roundMsg + '. ' + roundSub + '.');
      }

      /* ---------- Paint + effects ---------- */
      function splat(x, y, color, n, speed) {
        for (let k = 0; k < n && particles.length < MAX_PARTS; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, max: 0.8, color, size: 2 + Math.random() * 3 });
        }
      }

      function setOwner(c, who) {
        const old = owner[c];
        if (old === who) return;
        if (old) counts[old - 1]--;
        owner[c] = who;
        if (who) counts[who - 1]++;
        paintedAt[c] = clock;
      }

      function paintUnder(p) {
        if (p.frozen > 0) return;
        const c = cellAt(p.x, p.y);
        if (c < 0) return;
        const o = owner[c];
        if (o === p.id + 1) return;
        const cost = o === 0 ? 1 : 2;
        if (p.ink >= cost) {
          p.ink -= cost;
          setOwner(c, p.id + 1);
          splat(cellCx(c), cellCy(c), p.color, o ? 4 : 2, o ? 110 : 70);
        } else if (!p.dry) {
          p.dry = true;
          if (isHuman(p)) api.sfx('blip');
          if (!hinted.empty && isHuman(p)) {
            hinted.empty = true;
            api.setStatus('Out of ink! Roll back onto your own color to refill, then go again.');
          }
        }
      }

      function usePower(p) {
        if (state !== 'play' || !p.slot || p.frozen > 0) return;
        const kind = p.slot;
        p.slot = null;
        const foe = blobs[1 - p.id];
        if (kind === 'splash') {
          const c0 = cellAt(p.x, p.y);
          if (c0 >= 0) {
            const x0 = c0 % COLS, y0 = Math.floor(c0 / COLS);
            const rr = Math.ceil(SPLASH_R);
            for (let dy = -rr; dy <= rr; dy++) {
              for (let dx = -rr; dx <= rr; dx++) {
                const x = x0 + dx, y = y0 + dy;
                if (x < 0 || y < 0 || x >= COLS || y >= ROWS || dx * dx + dy * dy > SPLASH_R * SPLASH_R) continue;
                setOwner(y * COLS + x, p.id + 1);
                if (Math.random() < 0.35) splat(OX + x * CELL + CELL / 2, OY + y * CELL + CELL / 2, p.color, 2, 90);
              }
            }
          }
          splat(p.x, p.y, p.color, 40, 320);
          shake = 9;
          api.sfx('boom');
        } else if (kind === 'boots') {
          p.boots = 5;
          api.sfx('flip');
          splat(p.x, p.y, C.mint, 16, 160);
        } else {
          foe.frozen = 2;
          foe.vx = 0;
          foe.vy = 0;
          api.sfx('shoot');
          api.after(120, () => api.sfx('hit'));
          splat(foe.x, foe.y, '#DDEBFF', 24, 200);
          shake = 5;
        }
        if (isHuman(p)) api.setStatus(nameOf(p.id) + ' used ' + POWERS[kind].label.toLowerCase() + '.');
      }

      function spawnPower() {
        if (powers.length >= 3) return;
        for (let tries = 0; tries < 40; tries++) {
          const c = U.randInt(0, N - 1);
          const x = cellCx(c), y = cellCy(c);
          if (blobs.some((b) => Math.hypot(b.x - x, b.y - y) < CELL * 5)) continue;
          if (powers.some((q) => Math.hypot(q.x - x, q.y - y) < CELL * 4)) continue;
          powers.push({ x, y, kind: U.pick(KINDS), life: 14 });
          api.sfx('blip');
          return;
        }
      }

      /* ---------- Computer ---------- */
      function cellValue(c, me) {
        const x0 = c % COLS, y0 = Math.floor(c / COLS);
        let v = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = x0 + dx, y = y0 + dy;
            if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
            const o = owner[y * COLS + x];
            v += o === 0 ? 1 : o === me.id + 1 ? 0 : 1.6;
          }
        }
        return v;
      }

      function choose(me, foe, L) {
        const here = cellAt(me.x, me.y);
        const onOwn = here >= 0 && owner[here] === me.id + 1;
        const ownCount = counts[me.id];
        if (me.ink < INK_MAX * L.homeAt + 2 && ownCount > 0) ai.refill = true;
        if (ai.refill && (me.ink >= INK_MAX * 0.9 || ownCount === 0)) ai.refill = false;
        if (ai.refill) {
          if (onOwn) {
            ai.tx = me.x;
            ai.ty = me.y;
            return;
          }
          let best = -1, bd = Infinity;
          for (let c = 0; c < N; c++) {
            if (owner[c] !== me.id + 1) continue;
            const d = Math.hypot(cellCx(c) - me.x, cellCy(c) - me.y);
            if (d < bd) { bd = d; best = c; }
          }
          if (best >= 0) {
            ai.tx = cellCx(best);
            ai.ty = cellCy(best);
            return;
          }
        }
        if (Math.random() < L.wander) {
          const c = U.randInt(0, N - 1);
          ai.tx = cellCx(c);
          ai.ty = cellCy(c);
          return;
        }
        let bestV = -Infinity;
        const consider = (c, v) => {
          if (v > bestV) {
            bestV = v;
            ai.tx = cellCx(c);
            ai.ty = cellCy(c);
          }
        };
        const sp = Math.hypot(me.vx, me.vy) || 1;
        const score = (c) => {
          const dx = cellCx(c) - me.x, dy = cellCy(c) - me.y;
          const d = Math.hypot(dx, dy) / CELL;
          const ahead = d > 0 ? (dx * me.vx + dy * me.vy) / (d * CELL * sp) : 0;
          return cellValue(c, me) / (d + 3) + ahead * 0.08;
        };
        if (L.samples >= N) {
          for (let c = 0; c < N; c++) if (owner[c] !== me.id + 1) consider(c, score(c));
        } else {
          for (let k = 0; k < L.samples; k++) {
            const c = U.randInt(0, N - 1);
            if (owner[c] !== me.id + 1) consider(c, score(c));
          }
        }
        if (!me.slot) {
          for (const q of powers) {
            const d = Math.hypot(q.x - me.x, q.y - me.y) / CELL;
            if (d < 16) {
              const v = 30 / (d + 3);
              if (v > bestV) {
                bestV = v;
                ai.tx = q.x;
                ai.ty = q.y;
              }
            }
          }
        }
        if (bestV === -Infinity) {
          ai.tx = foe.x;
          ai.ty = foe.y;
        }
      }

      function wantsPower(me, foe, L) {
        if (!L.smart) return true;
        if (me.slot === 'splash') {
          const c0 = cellAt(me.x, me.y);
          if (c0 < 0) return false;
          let gain = 0;
          const x0 = c0 % COLS, y0 = Math.floor(c0 / COLS);
          for (let dy = -3; dy <= 3; dy++) {
            for (let dx = -3; dx <= 3; dx++) {
              const x = x0 + dx, y = y0 + dy;
              if (x < 0 || y < 0 || x >= COLS || y >= ROWS || dx * dx + dy * dy > SPLASH_R * SPLASH_R) continue;
              const o = owner[y * COLS + x];
              gain += o === 0 ? 1 : o === me.id + 1 ? 0 : 2;
            }
          }
          return gain >= 26 || timeLeft < 4;
        }
        if (me.slot === 'freeze') {
          const fc = cellAt(foe.x, foe.y);
          return foe.frozen <= 0 && (foe.ink > 8 || foe.boots > 0) && fc >= 0 && owner[fc] !== foe.id + 1;
        }
        return !ai.refill;
      }

      function cpuThink(me, foe, dt) {
        const L = LEVELS[level] || LEVELS.normal;
        ai.timer -= dt;
        const close = Math.hypot(ai.tx - me.x, ai.ty - me.y) < CELL * 0.4;
        if (ai.timer <= 0 || (close && !ai.refill)) {
          ai.timer = L.think * (0.7 + Math.random() * 0.6);
          choose(me, foe, L);
        }
        if (me.slot) {
          ai.useT += dt;
          if (ai.useT > L.useDelay && (wantsPower(me, foe, L) || ai.useT > 6)) {
            ai.useT = 0;
            usePower(me);
          }
        } else {
          ai.useT = 0;
        }
        // Stuck behind the rival: pick a fresh target.
        if (Math.hypot(me.vx, me.vy) < 20 && !ai.refill) {
          ai.stuckT += dt;
          if (ai.stuckT > 0.8) {
            ai.stuckT = 0;
            const c = U.randInt(0, N - 1);
            ai.tx = cellCx(c);
            ai.ty = cellCy(c);
            ai.timer = 0.8;
          }
        } else {
          ai.stuckT = 0;
        }
        const dx = ai.tx - me.x, dy = ai.ty - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 3) return { x: 0, y: 0 };
        const k = L.speed * Math.min(1, d / 12);
        return { x: (dx / d) * k, y: (dy / d) * k };
      }

      /* ---------- Movement ---------- */
      function inputFor(i) {
        const k = api.keys;
        let x = 0, y = 0;
        if (i === 0) {
          if (k.has('KeyA')) x--;
          if (k.has('KeyD')) x++;
          if (k.has('KeyW')) y--;
          if (k.has('KeyS')) y++;
        }
        if (i === 1 || cpuOn) {
          if (k.has('ArrowLeft')) x--;
          if (k.has('ArrowRight')) x++;
          if (k.has('ArrowUp')) y--;
          if (k.has('ArrowDown')) y++;
        }
        x = U.clamp(x, -1, 1);
        y = U.clamp(y, -1, 1);
        const m = Math.hypot(x, y);
        return m > 1 ? { x: x / m, y: y / m } : { x, y };
      }

      function collide() {
        const a = blobs[0], b = blobs[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= BLOB_R * 2) return;
        const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
        const over = (BLOB_R * 2 - d) / 2;
        a.x -= nx * over; a.y -= ny * over;
        b.x += nx * over; b.y += ny * over;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j = Math.max(-vn, 120) * 1.1;
          a.vx -= nx * j; a.vy -= ny * j;
          b.vx += nx * j; b.vy += ny * j;
          a.squash = b.squash = 0.25;
          api.sfx('hit');
          splat((a.x + b.x) / 2, (a.y + b.y) / 2, C.text, 6, 120);
        }
      }

      function move(h, inputs) {
        blobs.forEach((p, i) => {
          if (p.frozen > 0) {
            const f = Math.exp(-8 * h);
            p.vx *= f;
            p.vy *= f;
          } else {
            const sp = SPEED * (p.boots > 0 ? BOOST : 1);
            const k = 1 - Math.exp(-10 * h);
            p.vx += (inputs[i].x * sp - p.vx) * k;
            p.vy += (inputs[i].y * sp - p.vy) * k;
          }
          p.x += p.vx * h;
          p.y += p.vy * h;
          const minX = OX + BLOB_R, maxX = OX + COLS * CELL - BLOB_R;
          const minY = OY + BLOB_R, maxY = OY + ROWS * CELL - BLOB_R;
          if (p.x < minX) { p.x = minX; p.vx = Math.abs(p.vx) * 0.5; }
          if (p.x > maxX) { p.x = maxX; p.vx = -Math.abs(p.vx) * 0.5; }
          if (p.y < minY) { p.y = minY; p.vy = Math.abs(p.vy) * 0.5; }
          if (p.y > maxY) { p.y = maxY; p.vy = -Math.abs(p.vy) * 0.5; }
        });
        collide();
        blobs.forEach(paintUnder);
      }

      /* ---------- Loop ---------- */
      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        goFlash = Math.max(0, goFlash - dt);
        const drag = Math.max(0, 1 - 4 * dt);
        let j = 0;
        for (const p of particles) {
          p.life -= dt;
          if (p.life <= 0) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= drag;
          p.vy *= drag;
          particles[j++] = p;
        }
        particles.length = j;
        for (const p of blobs) p.squash = Math.max(0, p.squash - dt * 1.5);

        if (state === 'count') {
          countT -= dt;
          const n = Math.ceil(countT);
          if (n !== lastCount && n > 0) {
            lastCount = n;
            api.sfx('tick');
          }
          if (countT <= 0) {
            state = 'play';
            goFlash = 0.7;
            api.sfx('power');
          }
        } else if (state === 'play') {
          timeLeft -= dt;
          const sec = Math.ceil(timeLeft);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 10 && sec > 0) api.sfx('tick');
          }
          const inputs = [inputFor(0), cpuOn ? cpuThink(blobs[1], blobs[0], dt) : inputFor(1)];
          for (const p of blobs) {
            p.boots = Math.max(0, p.boots - dt);
            p.frozen = Math.max(0, p.frozen - dt);
            const c = cellAt(p.x, p.y);
            if (c >= 0 && owner[c] === p.id + 1 && p.frozen <= 0) {
              p.ink = Math.min(INK_MAX, p.ink + REFILL * dt);
              if (p.ink >= 2) p.dry = false;
            }
            // Safety valve: with no territory at all you could never refill again.
            if (counts[p.id] === 0 && p.ink < 1) p.ink = 6;
            const sp = Math.hypot(p.vx, p.vy);
            if (sp > 20) {
              p.look = p.vx / sp;
              p.lookY = p.vy / sp;
            }
          }
          const n = Math.min(8, Math.max(1, Math.ceil(dt / 0.008)));
          for (let s = 0; s < n; s++) move(dt / n, inputs);
          for (const q of powers) {
            q.life -= dt;
            for (const p of blobs) {
              if (q.life > 0 && !p.slot && p.frozen <= 0 && Math.hypot(q.x - p.x, q.y - p.y) < BLOB_R + 12) {
                p.slot = q.kind;
                q.life = 0;
                api.sfx('power');
                splat(q.x, q.y, POWERS[q.kind].color, 14, 150);
                if (!hinted.power && isHuman(p)) {
                  hinted.power = true;
                  api.setStatus(POWERS[q.kind].label + '! Press ' + (p.id === 0 ? 'Space' : 'Enter') + ' to use it.');
                }
              }
            }
          }
          powers = powers.filter((q) => q.life > 0);
          spawnT -= dt;
          if (spawnT <= 0) {
            spawnT = U.rand(7, 9);
            spawnPower();
          }
          if (timeLeft <= 0) {
            timeLeft = 0;
            endRound();
          }
        } else if (state === 'roundEnd') {
          endT -= dt;
          if (endT <= 0) {
            if (Math.max(scores[0], scores[1]) >= WIN_ROUNDS) matchOver();
            else startRound();
          }
        }
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, scale, color, alpha) {
        ctx.save();
        ctx.globalAlpha = U.clamp(alpha, 0, 1);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(text, 2, 3);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function drawTiles() {
        const cols = [U.alpha(C.line, 0.45), C.p1, C.p2];
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = cols[k];
          ctx.beginPath();
          for (let c = 0; c < N; c++) {
            if (owner[c] !== k) continue;
            const age = clock - paintedAt[c];
            const pop = k && age < 0.25 ? (1 - age / 0.25) * 3 : 0;
            const x = OX + (c % COLS) * CELL, y = OY + Math.floor(c / COLS) * CELL;
            tile(ctx, x + 2 - pop, y + 2 - pop, CELL - 4 + pop * 2, 5);
          }
          ctx.fill();
        }
        // Soft highlight on painted tiles.
        ctx.fillStyle = 'rgba(255,255,255,0.13)';
        ctx.beginPath();
        for (let c = 0; c < N; c++) {
          if (!owner[c]) continue;
          const x = OX + (c % COLS) * CELL, y = OY + Math.floor(c / COLS) * CELL;
          ctx.moveTo(x + 9, y + 6);
          ctx.arc(x + 6, y + 6, 3, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      function drawHud() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, OY - 6);
        ctx.font = '600 15px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        blobs.forEach((p, i) => {
          const left = i === 0;
          const sx = left ? 14 : W - 44;
          ctx.fillStyle = C.ink;
          U.roundRect(ctx, sx, 5, 30, 30, 7);
          ctx.fill();
          ctx.strokeStyle = p.slot ? POWERS[p.slot].color : C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          if (p.slot) drawIcon(ctx, sx + 15, 20, p.slot, 1.1);
          ctx.fillStyle = p.color;
          ctx.textAlign = left ? 'left' : 'right';
          const tx = left ? 54 : W - 54;
          const extra = p.frozen > 0 ? ' frozen' : p.boots > 0 ? ' boots' : '';
          ctx.fillText(shortName(i) + ' ink' + extra, tx, 13);
          const bw = 170, bx = left ? 54 : W - 54 - bw;
          ctx.fillStyle = C.ink;
          U.roundRect(ctx, bx, 24, bw, 10, 5);
          ctx.fill();
          const f = p.ink / INK_MAX;
          ctx.fillStyle = f < 0.15 ? C.gold : p.color;
          const fw = Math.max(6, bw * f);
          U.roundRect(ctx, left ? bx : bx + bw - fw, 24, fw, 10, 5);
          ctx.fill();
        });
        // Timer and tug-of-war bar.
        const sec = Math.ceil(timeLeft);
        const urgent = state === 'play' && sec <= 10;
        const label = '0:' + String(Math.max(0, sec)).padStart(2, '0');
        ctx.save();
        ctx.translate(W / 2, 12);
        if (urgent) {
          const ph = timeLeft - Math.floor(timeLeft);
          ctx.scale(1 + ph * 0.35, 1 + ph * 0.35);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = urgent ? C.gold : C.text;
        ctx.fillText(label, 0, 0);
        ctx.restore();
        const bw = 300, bx = (W - bw) / 2, by = 24;
        ctx.fillStyle = C.ink;
        U.roundRect(ctx, bx, by, bw, 12, 6);
        ctx.fill();
        const a = (counts[0] / N) * bw, b = (counts[1] / N) * bw;
        ctx.fillStyle = C.p1;
        ctx.fillRect(bx, by, a, 12);
        ctx.fillStyle = C.p2;
        ctx.fillRect(bx + bw - b, by, b, 12);
        ctx.fillStyle = C.text;
        ctx.fillRect(bx + bw / 2 - 1, by - 2, 2, 16);
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        ctx.fillText(Math.round((counts[0] / N) * 100) + '%', bx - 8, by + 6);
        ctx.textAlign = 'left';
        ctx.fillText(Math.round((counts[1] / N) * 100) + '%', bx + bw + 8, by + 6);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, OX - 6, OY - 6, COLS * CELL + 12, ROWS * CELL + 12, 12);
        ctx.fill();
        drawTiles();
        for (const q of powers) {
          ctx.globalAlpha = q.life < 3 && Math.sin(clock * 18) < 0 ? 0.4 : 1;
          drawPower(ctx, q.x, q.y, q.kind, clock);
        }
        ctx.globalAlpha = 1;
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.5 + p.life), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (const p of blobs) {
          if (p.boots > 0) {
            ctx.fillStyle = U.alpha(C.mint, 0.25);
            ctx.beginPath();
            ctx.arc(p.x - p.vx * 0.06, p.y - p.vy * 0.06, BLOB_R, 0, Math.PI * 2);
            ctx.arc(p.x - p.vx * 0.12, p.y - p.vy * 0.12, BLOB_R * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
          const wob = Math.min(0.12, Math.hypot(p.vx, p.vy) / 2000) + p.squash * 0.4;
          drawBlob(ctx, p.x, p.y, p.color, p.look, p.lookY, wob, p.frozen > 0);
          // Mini ink gauge under the blob.
          const f = p.ink / INK_MAX;
          ctx.fillStyle = U.alpha(C.ink, 0.8);
          ctx.fillRect(p.x - 13, p.y + BLOB_R + 5, 26, 4);
          ctx.fillStyle = f < 0.15 ? C.gold : C.text;
          ctx.fillRect(p.x - 13, p.y + BLOB_R + 5, 26 * f, 4);
        }
        ctx.restore();
        drawHud();
        if (state === 'count') {
          const n = Math.max(1, Math.ceil(countT));
          const f = U.clamp(countT - (n - 1), 0, 1);
          bigText(String(n), W / 2, H / 2, 1.4 + Math.pow(f, 3) * 1.2, C.text, 0.3 + f * 1.4);
        }
        if (goFlash > 0) bigText('Paint!', W / 2, H / 2, 1.3 + (0.7 - goFlash), C.mint, goFlash / 0.5);
        if (state === 'roundEnd') {
          const a = Math.min(1, (2.6 - endT) * 4);
          ctx.fillStyle = U.alpha(C.ink, 0.45 * a);
          ctx.fillRect(0, OY - 6, W, H - OY + 6);
          bigText(roundMsg, W / 2, H / 2 - 10, 1, roundColor, a);
          ctx.font = '600 15px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillStyle = C.text;
          ctx.fillText(roundSub, W / 2, H / 2 + 36);
        }
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || state !== 'play') return;
        if (e.code === 'Space') usePower(blobs[0]);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') usePower(cpuOn ? blobs[0] : blobs[1]);
      });

      resetRound();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
