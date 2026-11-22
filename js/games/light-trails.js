/* Light Trails: a two-rider grid duel. Hook: hop over any wall every 5 s, and old trails fade away. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const CELL = 10;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const N = COLS * ROWS;
  const FADE = 7;        // seconds a trail cell stays solid
  const HOP_CD = 5;      // seconds between hops
  const HOP_LEN = 3;     // cells covered by one hop
  const WIN_ROUNDS = 3;
  const STEP_START = 0.072;
  const STEP_MIN = 0.042;
  const STEP_RAMP = 0.0006;
  const BUCKETS = 8;     // brightness bands for trail age
  const MAX_PARTS = 420;
  const DIRS = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
  const P1_KEYS = { KeyW: 0, KeyD: 1, KeyS: 2, KeyA: 3 };
  const P2_KEYS = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
  // cap = flood-fill lookahead, aggro = weight on cutting the rival off, lazy = chance to skip thinking.
  const LEVELS = {
    easy: { cap: 90, noise: 10, lazy: 0.4, aggro: 0, slip: 0.04, hopBelow: 0, hopChance: 0.6, hopCost: 0, headOn: 0 },
    normal: { cap: 900, noise: 3, lazy: 0.08, aggro: 0.6, slip: 0, hopBelow: 400, hopChance: 0.95, hopCost: 15, headOn: 15 },
    hard: { cap: N, noise: 0.5, lazy: 0, aggro: 1, slip: 0, hopBelow: N + 1, hopChance: 1, hopCost: 6, headOn: 30 }
  };

  /* Three-pass stroke of the current path: soft halo, colored tube, white-hot core. */
  function glowStroke(ctx, color, a, wide) {
    ctx.strokeStyle = U.alpha(color, a * 0.16);
    ctx.lineWidth = wide;
    ctx.stroke();
    ctx.strokeStyle = U.alpha(color, a);
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (a * 0.5).toFixed(3) + ')';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  function drawHead(ctx, x, y, color, angle, scale) {
    ctx.fillStyle = U.alpha(color, 0.22);
    ctx.beginPath();
    ctx.arc(x, y, 12 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    U.roundRect(ctx, -7 * scale, -4.5 * scale, 14 * scale, 9 * scale, 3 * scale);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x, y, 2.2 * scale, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Polyline split into short pieces so brightness can fade along it (older end dimmer). */
  function thumbLine(ctx, pts, color, a0, a1) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    let run = 0;
    ctx.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const x0 = pts[i - 1][0], y0 = pts[i - 1][1], x1 = pts[i][0], y1 = pts[i][1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(len / 10));
      for (let k = 0; k < n; k++) {
        const s0 = k / n, s1 = (k + 1) / n;
        ctx.beginPath();
        ctx.moveTo(U.lerp(x0, x1, s0), U.lerp(y0, y1, s0));
        ctx.lineTo(U.lerp(x0, x1, s1), U.lerp(y0, y1, s1));
        glowStroke(ctx, color, U.lerp(a0, a1, (run + len * (s0 + s1) / 2) / total), 9);
      }
      run += len;
    }
  }

  Arcade.register({
    id: 'light-trails',
    title: 'Light Trails',
    mode: 'together',
    players: '1–2P',
    original: false,
    color: C.violet,
    tagline: 'Ride a light cycle and box your rival in.',
    hook: 'Hop over any wall once every 5 seconds, and old trails fade away.',
    tags: ['versus', 'two player', 'computer', 'arcade', 'keyboard', 'classic'],
    howTo: 'Each rider leaves a wall of light behind it. Hit a wall, any trail or the edge and you lose the round. ' +
      'Press your action key to hop 3 cells forward over anything; you must land on an empty cell, and the hop ' +
      'recharges in 5 seconds (the ring around your rider fills up). Trails fade after 7 seconds, so dim light is ' +
      'about to vanish, and the riders slowly speed up. First to 3 rounds wins.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Player 1 steer' },
      { keys: ['Space'], label: 'Player 1 hop' },
      { keys: ['↑', '↓', '←', '→'], label: 'Player 2 steer' },
      { keys: ['Enter'], label: 'Player 2 hop' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = U.alpha(C.line, 0.4);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
      for (let y = 0; y <= h; y += 16) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
      ctx.stroke();
      const s = Math.min(w / 320, h / 200);
      ctx.save();
      ctx.translate((w - 320 * s) / 2, (h - 200 * s) / 2);
      ctx.scale(s, s);
      // Cyan wall, dimming toward its old end.
      thumbLine(ctx, [[300, 14], [300, 40], [180, 40], [180, 168]], C.p2, 0.08, 1);
      drawHead(ctx, 180, 168, C.p2, Math.PI / 2, 1);
      // Coral trail up to the take-off point.
      thumbLine(ctx, [[22, 196], [22, 112], [140, 112]], C.p1, 0.08, 1);
      // The hop: dashed arc over the cyan wall, shadow on the ground.
      const p = 0.5 + 0.42 * Math.sin(t * 1.8);
      const x0 = 140, x1 = 224, yb = 112, cy = 40;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = U.alpha(C.p1, 0.7);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, yb);
      ctx.quadraticCurveTo((x0 + x1) / 2, cy, x1, yb);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = U.alpha(C.p1, 0.8);
      ctx.strokeRect(x1 - 6, yb - 6, 12, 12);
      const bx = U.lerp(x0, x1, p);
      const by = (1 - p) * (1 - p) * yb + 2 * (1 - p) * p * cy + p * p * yb;
      const lift = Math.sin(p * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(bx, yb + 3, 9 - lift * 3, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      drawHead(ctx, bx, by, C.p1, 0, 1.2 + lift * 0.4);
      ctx.strokeStyle = U.alpha(C.text, 0.85);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx, by, 17 + lift * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);
      const own = new Uint8Array(N);       // 0 empty, 1 P1, 2 P2
      const born = new Float64Array(N);    // round clock when the cell was painted
      const seenA = new Int32Array(N);
      const distA = new Int32Array(N);
      const seenB = new Int32Array(N);
      const distB = new Int32Array(N);
      const queue = new Int32Array(N);
      const segs = [];
      for (let b = 0; b < BUCKETS; b++) segs.push([]);
      let stampA = 0;
      let stampB = 0;

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'roundEnd' | 'over'
      let cpuOn = false;
      let level = 'normal';
      let riders = [];
      let scores = [0, 0];
      let round = 0;
      let clock = 0, acc = 0, stepTime = STEP_START;
      let countT = 0, lastCount = 0, goFlash = 0, endT = 0;
      let roundMsg = '', roundSub = '', roundColor = C.text;
      let pulse = 0, shake = 0, flash = 0;
      let particles = [];
      let hinted = { hop: false, fade: false };

      const nameOf = (i) => (cpuOn ? (i === 0 ? 'You' : 'Computer') : 'Player ' + (i + 1));
      const shortName = (i) => (cpuOn ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));
      const solid = (i, time) => own[i] !== 0 && born[i] + FADE > time;
      const freeAt = (x, y, time) => x >= 0 && y >= 0 && x < COLS && y < ROWS && !solid(y * COLS + x, time);
      const cx = (x) => x * CELL + CELL / 2;

      function makeRider(id, x, y, dir) {
        return {
          id, x, y, px: x, py: y, dir, queue: [], trail: [], hopCd: 0, hopReq: false, air: 0,
          hopping: false, hopDir: dir, hx: x, hy: y, alive: true, ready: 0, color: id === 0 ? C.p1 : C.p2
        };
      }

      function paint(r, gap) {
        const i = r.y * COLS + r.x;
        own[i] = r.id + 1;
        born[i] = clock;
        r.trail.push({ x: r.x, y: r.y, t: clock, gap: !!gap });
      }

      function resetRound() {
        own.fill(0);
        born.fill(0);
        clock = 0;
        acc = 0;
        stepTime = STEP_START;
        riders = [makeRider(0, 14, 27, 1), makeRider(1, COLS - 15, ROWS - 28, 3)];
        riders.forEach((r) => paint(r, false));
      }

      function startRound() {
        round++;
        resetRound();
        state = 'count';
        countT = 3;
        lastCount = 4;
        api.setStatus('Round ' + round + ', first to ' + WIN_ROUNDS + '. ' + (cpuOn
          ? 'Space hops 3 cells over any wall, once every 5 s.'
          : 'Hop over a wall: Space (P1) or Enter (P2), once every 5 s.'));
      }

      function startMatch(cpu, lvl) {
        cpuOn = cpu;
        level = lvl || 'normal';
        scores = [0, 0];
        round = 0;
        particles = [];
        hinted = { hop: false, fade: false };
        api.setScore('0 – 0');
        startRound();
      }

      function showStartMenu() {
        state = 'menu';
        resetRound();
        api.setScore('0 – 0');
        api.menu({
          title: 'Light Trails',
          text: 'Leave a wall of light and box your rival in. Space / Enter hops 3 cells over any wall, ' +
            'once every 5 s. Trails fade after 7 s. First to 3 rounds.',
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
          text: 'You ride coral with WASD (or arrows) and hop with Space. The computer rides cyan and hops too.',
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
          text: 'Final score ' + scores[0] + ' – ' + scores[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(cpuOn, level) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      /* ---------- Effects ---------- */
      function spark(x, y, color, n, speed, life) {
        for (let k = 0; k < n && particles.length < MAX_PARTS; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.25 + Math.random() * 0.75);
          particles.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: life * (0.5 + Math.random() * 0.5), max: life, color, size: 1.5 + Math.random() * 2.2
          });
        }
      }

      function updateParticles(dt) {
        const drag = Math.max(0, 1 - 3 * dt);
        let j = 0;
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.life -= dt;
          if (p.life <= 0) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= drag;
          p.vy *= drag;
          particles[j++] = p;
        }
        particles.length = j;
      }

      /* ---------- Rules ---------- */
      function turn(r, d) {
        if (!r || !r.alive) return;
        const last = r.queue.length ? r.queue[r.queue.length - 1] : r.dir;
        if (d === last || d === (last + 2) % 4) return;
        if (r.queue.length < 2) r.queue.push(d);
      }

      function requestHop(r) {
        if (state !== 'play' || !r || !r.alive || r.air > 0 || r.hopCd > 0) return;
        r.hopReq = true;
      }

      function startHop(r) {
        r.air = HOP_LEN - 1;
        r.hopping = true;
        r.hopCd = HOP_CD;
        r.hopDir = r.dir;
        r.hx = r.x;
        r.hy = r.y;
        api.sfx('flip');
        spark(cx(r.x), cx(r.y), r.color, 12, 130, 0.45);
        if (!hinted.hop) {
          hinted.hop = true;
          api.setStatus('Hop! It recharges in 5 s. The ring around a rider fills up as it charges.');
        }
      }

      function step() {
        if (cpuOn) cpuThink(riders[1], riders[0]);
        const moves = [];
        for (const r of riders) {
          if (r.hopping && r.air === 0) r.hopping = false;
          r.px = r.x;
          r.py = r.y;
          let landing;
          let gap = false;
          if (r.air > 0) {
            r.air--;
            landing = r.air === 0;
            gap = landing;
          } else {
            if (r.queue.length) r.dir = r.queue.shift();
            if (r.hopReq && r.hopCd <= 0) startHop(r);
            r.hopReq = false;
            landing = r.air === 0;
          }
          r.x += DIRS[r.dir].x;
          r.y += DIRS[r.dir].y;
          moves.push({ r, landing, gap });
        }
        // Collisions are judged against the grid before anyone paints, so same-tick crashes are a draw.
        const crashed = [];
        for (const m of moves) {
          const r = m.r;
          const out = r.x < 0 || r.y < 0 || r.x >= COLS || r.y >= ROWS;
          if (out || (m.landing && solid(r.y * COLS + r.x, clock))) crashed.push(r);
        }
        const a = moves[0], b = moves[1];
        if (a.landing && b.landing && a.r.x === b.r.x && a.r.y === b.r.y) {
          if (!crashed.includes(a.r)) crashed.push(a.r);
          if (!crashed.includes(b.r)) crashed.push(b.r);
        }
        for (const m of moves) {
          const r = m.r;
          if (crashed.includes(r)) continue;
          if (m.landing) paint(r, m.gap);
          if (m.gap) {
            spark(cx(r.x), cx(r.y), r.color, 16, 150, 0.5);
            api.sfx('tick');
          } else if (Math.random() < 0.5) {
            spark(cx(r.px), cx(r.py), r.color, 1, 40, 0.35);
          }
        }
        if (crashed.length) endRound(crashed);
      }

      function endRound(crashed) {
        for (const r of crashed) {
          r.alive = false;
          const x = cx(U.clamp(r.x, 0, COLS - 1));
          const y = cx(U.clamp(r.y, 0, ROWS - 1));
          spark(x, y, r.color, 60, 280, 0.9);
          spark(x, y, '#FFFFFF', 16, 170, 0.5);
        }
        shake = 12;
        flash = 1;
        api.sfx('boom');
        state = 'roundEnd';
        endT = 2;
        if (crashed.length >= 2) {
          roundMsg = 'Draw';
          roundSub = 'Both riders crashed at once. No point.';
          roundColor = C.gold;
        } else {
          const w = crashed[0].id === 0 ? 1 : 0;
          scores[w]++;
          roundMsg = (cpuOn ? (w === 0 ? 'You take' : 'Computer takes') : 'Player ' + (w + 1) + ' takes') + ' the round';
          roundSub = 'Score ' + scores[0] + ' – ' + scores[1];
          roundColor = riders[w].color;
          api.after(380, () => api.sfx('score'));
        }
        api.setScore(scores[0] + ' – ' + scores[1]);
      }

      /* ---------- Computer rider ---------- */
      // The d-th move from now happens at this time (slightly early, since the riders speed up).
      const arrive = (d) => clock + (d - 1) * stepTime * 0.97;

      // Time-aware flood fill from the rival's head: a trail cell counts as open once it will have faded.
      function floodFoe(foe) {
        stampB++;
        let qh = 0, qt = 0;
        const s = U.clamp(foe.y, 0, ROWS - 1) * COLS + U.clamp(foe.x, 0, COLS - 1);
        seenB[s] = stampB;
        distB[s] = 0;
        queue[qt++] = s;
        while (qh < qt) {
          const i = queue[qh++];
          const d = distB[i] + 1;
          const x = i % COLS, y = (i - x) / COLS;
          const tm = arrive(d);
          for (let k = 0; k < 4; k++) {
            const nx = x + DIRS[k].x, ny = y + DIRS[k].y;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const j = ny * COLS + nx;
            if (seenB[j] === stampB || solid(j, tm)) continue;
            seenB[j] = stampB;
            distB[j] = d;
            queue[qt++] = j;
          }
        }
      }

      // Reachable area from a cell, and how much of it the computer would reach before the rival.
      function floodMe(sx, sy, d0, cap, useFoe) {
        stampA++;
        let qh = 0, qt = 0, reach = 0, mine = 0;
        const s = sy * COLS + sx;
        seenA[s] = stampA;
        distA[s] = d0;
        queue[qt++] = s;
        while (qh < qt && reach < cap) {
          const i = queue[qh++];
          const d = distA[i];
          reach++;
          if (!useFoe || seenB[i] !== stampB || distB[i] > d) mine++;
          const x = i % COLS, y = (i - x) / COLS;
          const tm = arrive(d + 1);
          for (let k = 0; k < 4; k++) {
            const nx = x + DIRS[k].x, ny = y + DIRS[k].y;
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const j = ny * COLS + nx;
            if (seenA[j] === stampA || solid(j, tm)) continue;
            seenA[j] = stampA;
            distA[j] = d + 1;
            queue[qt++] = j;
          }
        }
        return { reach, mine };
      }

      function cpuThink(me, foe) {
        if (!me.alive || me.air > 0) return;
        const L = LEVELS[level] || LEVELS.normal;
        const cur = me.dir;
        const t1 = arrive(1);
        const dirs = [cur, (cur + 3) % 4, (cur + 1) % 4];
        const ahead = (d, n) => ({ x: me.x + DIRS[d].x * n, y: me.y + DIRS[d].y * n });
        if (Math.random() < L.lazy) {
          const a1 = ahead(cur, 1), a2 = ahead(cur, 2);
          if (freeAt(a1.x, a1.y, t1) && freeAt(a2.x, a2.y, arrive(2))) {
            me.queue.length = 0;
            return;
          }
        }
        const useFoe = L.aggro > 0 && foe.alive;
        if (useFoe) floodFoe(foe);
        const value = (f) => (1 - L.aggro) * f.reach + L.aggro * (f.mine + 0.25 * f.reach);
        const opts = [];
        for (const d of dirs) {
          const a = ahead(d, 1);
          if (!freeAt(a.x, a.y, t1)) continue;
          const f = floodMe(a.x, a.y, 1, L.cap, useFoe);
          let score = value(f) + (d === cur ? 6 : 0) + U.rand(-L.noise, L.noise);
          if (L.headOn && foe.alive && foe.air === 0 && Math.abs(a.x - foe.x) + Math.abs(a.y - foe.y) === 1) score -= L.headOn;
          opts.push({ d, hop: false, score, reach: f.reach });
        }
        let best = null;
        for (const o of opts) if (!best || o.score > best.score) best = o;
        if (opts.length && Math.random() < L.slip) best = U.pick(opts);
        // Hop when boxed in (all levels), or whenever space is getting tight (Normal, Hard).
        const wantHop = !best || best.reach < L.hopBelow;
        if (me.hopCd <= 0 && wantHop && Math.random() < L.hopChance) {
          for (const d of dirs) {
            const a = ahead(d, HOP_LEN);
            if (!freeAt(a.x, a.y, arrive(HOP_LEN))) continue;
            const f = floodMe(a.x, a.y, HOP_LEN, L.cap, useFoe);
            const score = value(f) - L.hopCost;
            if (!best || score > best.score) best = { d, hop: true, score, reach: f.reach };
          }
        }
        me.queue.length = 0;
        if (!best) return;
        if (best.d !== cur) me.queue.push(best.d);
        me.hopReq = best.hop;
      }

      /* ---------- Loop ---------- */
      function update(dt) {
        pulse += dt;
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 2.5);
        goFlash = Math.max(0, goFlash - dt);
        updateParticles(dt);
        for (const r of riders) r.ready = Math.max(0, r.ready - dt);
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
          for (const r of riders) {
            if (r.hopCd > 0) {
              r.hopCd -= dt;
              if (r.hopCd <= 0) {
                r.hopCd = 0;
                r.ready = 0.5;
              }
            }
          }
          if (!hinted.fade && clock >= FADE) {
            hinted.fade = true;
            api.setStatus('Trails older than 7 s fade out. Dim, flickering light is about to vanish.');
          }
          acc += dt;
          let guard = 0;
          // The round clock advances per step, so fade timing is exact for collisions and the computer.
          while (state === 'play' && acc >= stepTime && guard < 4) {
            acc -= stepTime;
            guard++;
            clock += stepTime;
            step();
            stepTime = Math.max(STEP_MIN, STEP_START - clock * STEP_RAMP);
          }
          for (const r of riders) {
            while (r.trail.length && clock - r.trail[0].t >= FADE) r.trail.shift();
            if (r.trail.length > 600) r.trail.splice(0, r.trail.length - 600);
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
      function bucketOf(t) {
        return Math.min(BUCKETS - 1, Math.max(0, Math.floor(((clock - t) / FADE) * BUCKETS)));
      }

      function bucketAlpha(b) {
        let a = 1 - ((b + 0.5) / BUCKETS) * 0.8;
        if (b === BUCKETS - 1) a *= 0.55 + 0.45 * Math.sin(pulse * 26);
        return a;
      }

      function drawArena() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.strokeStyle = U.alpha(C.line, 0.3);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= W; x += CELL * 3) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
        for (let y = 0; y <= H; y += CELL * 3) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
        ctx.stroke();
        ctx.strokeStyle = U.alpha(C.violet, 0.14);
        ctx.lineWidth = 10;
        ctx.strokeRect(5, 5, W - 10, H - 10);
        ctx.strokeStyle = U.alpha(C.violet, 0.6);
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, W - 2, H - 2);
      }

      function headPos(r, frac) {
        return { x: U.lerp(cx(r.px), cx(r.x), frac), y: U.lerp(cx(r.py), cx(r.y), frac) };
      }

      function drawTrail(r, frac) {
        const tr = r.trail;
        const n = tr.length;
        if (!n) return;
        for (const s of segs) s.length = 0;
        // While riding, the newest segment is drawn to the moving head instead of the cell centre.
        const last = tr[n - 1];
        const live = r.alive && !r.hopping && n > 1 && !last.gap && last.x === r.x && last.y === r.y;
        const liveB = live ? bucketOf(tr[n - 2].t) : -1;
        for (let i = 1; i < n; i++) {
          const c = tr[i];
          if (c.gap || (live && i === n - 1)) continue;
          segs[bucketOf(tr[i - 1].t)].push(tr[i - 1], c);
        }
        const hp = live ? headPos(r, frac) : null;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (let b = BUCKETS - 1; b >= 0; b--) {
          const s = segs[b];
          if (!s.length && b !== liveB) continue;
          ctx.beginPath();
          for (let k = 0; k < s.length; k += 2) {
            ctx.moveTo(cx(s[k].x), cx(s[k].y));
            ctx.lineTo(cx(s[k + 1].x), cx(s[k + 1].y));
          }
          if (b === liveB) {
            ctx.moveTo(cx(tr[n - 2].x), cx(tr[n - 2].y));
            ctx.lineTo(hp.x, hp.y);
          }
          glowStroke(ctx, r.color, bucketAlpha(b), 10);
        }
        // Landing cells and lone cells show as small blocks.
        for (let i = 0; i < n; i++) {
          const c = tr[i];
          if (!c.gap && !(i === 0 && n === 1)) continue;
          ctx.fillStyle = U.alpha(r.color, bucketAlpha(bucketOf(c.t)));
          ctx.fillRect(c.x * CELL + 2, c.y * CELL + 2, CELL - 4, CELL - 4);
        }
      }

      function drawRider(r, frac) {
        if (!r.alive) return;
        const g = headPos(r, frac);
        let lift = 0;
        let scale = 1;
        if (r.hopping) {
          const ox = cx(r.hx), oy = cx(r.hy);
          const lx = ox + DIRS[r.hopDir].x * HOP_LEN * CELL;
          const ly = oy + DIRS[r.hopDir].y * HOP_LEN * CELL;
          const p = U.clamp(Math.hypot(g.x - ox, g.y - oy) / (HOP_LEN * CELL), 0, 1);
          lift = Math.sin(p * Math.PI) * 22;
          scale = 1 + Math.sin(p * Math.PI) * 0.5;
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = U.alpha(r.color, 0.65);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.quadraticCurveTo((ox + lx) / 2, (oy + ly) / 2 - 44, lx, ly);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = U.alpha(r.color, 0.9);
          ctx.strokeRect(lx - 6, ly - 6, 12, 12);
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.ellipse(g.x, g.y + 2, 8 - lift * 0.12, 3.5, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const x = g.x, y = g.y - lift;
        drawHead(ctx, x, y, r.color, (r.dir - 1) * Math.PI / 2, scale);
        // Hop cooldown ring: fills while charging, glows when ready.
        const rr = 14 * scale;
        ctx.lineWidth = 2;
        if (r.hopCd > 0) {
          ctx.strokeStyle = U.alpha(r.color, 0.25);
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = U.alpha(C.text, 0.8);
          ctx.beginPath();
          ctx.arc(x, y, rr, -Math.PI / 2, -Math.PI / 2 + (1 - r.hopCd / HOP_CD) * Math.PI * 2);
          ctx.stroke();
        } else {
          ctx.strokeStyle = U.alpha(C.text, 0.55 + 0.35 * Math.sin(pulse * 6));
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI * 2);
          ctx.stroke();
          if (r.ready > 0) {
            ctx.strokeStyle = U.alpha(C.text, r.ready * 1.6);
            ctx.beginPath();
            ctx.arc(x, y, rr + (0.5 - r.ready) * 50, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
      }

      function drawParticles() {
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }

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

      function smallText(text, x, y, color) {
        ctx.font = '600 15px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      }

      function drawHud() {
        ctx.font = '600 15px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        riders.forEach((r, i) => {
          const bw = 200, bh = 28, x = i === 0 ? 10 : W - 10 - bw, y = 10;
          ctx.fillStyle = U.alpha(C.panel, 0.78);
          U.roundRect(ctx, x, y, bw, bh, 8);
          ctx.fill();
          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.arc(x + 15, y + bh / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.textAlign = 'left';
          ctx.fillText(shortName(i) + ' hop', x + 27, y + bh / 2 + 1);
          const p = r.hopCd > 0 ? 1 - r.hopCd / HOP_CD : 1;
          const mx = x + 112, mw = 76;
          ctx.fillStyle = C.line;
          U.roundRect(ctx, mx, y + 9, mw, 10, 5);
          ctx.fill();
          ctx.fillStyle = p >= 1 ? C.text : U.alpha(r.color, 0.85);
          U.roundRect(ctx, mx, y + 9, Math.max(10, mw * p), 10, 5);
          ctx.fill();
        });
        if (state === 'play' || state === 'count' || state === 'roundEnd') {
          smallText('Round ' + Math.max(1, round) + '  ·  speed ' + (STEP_START / stepTime).toFixed(1) + 'x', W / 2, 24, U.alpha(C.muted, 0.9));
        }
      }

      function drawOverlay() {
        if (state === 'count') {
          const n = Math.max(1, Math.ceil(countT));
          const f = U.clamp(countT - (n - 1), 0, 1);
          bigText(String(n), W / 2, H / 2 - 10, 1.4 + Math.pow(f, 3) * 1.2, C.text, 0.3 + f * 1.4);
          smallText('Space / Enter hops over a wall. Trails fade after 7 s.', W / 2, H / 2 + 62, C.muted);
        }
        if (goFlash > 0) bigText('Go!', W / 2, H / 2 - 10, 1.4 + (0.7 - goFlash), C.gold, goFlash / 0.5);
        if (state === 'roundEnd') {
          bigText(roundMsg, W / 2, H / 2 - 14, 1, roundColor, Math.min(1, (2 - endT) * 4));
          smallText(roundSub, W / 2, H / 2 + 34, C.text);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.text, flash * 0.12);
          ctx.fillRect(0, 0, W, H);
        }
      }

      function draw() {
        const frac = state === 'play' ? U.clamp(acc / stepTime, 0, 1) : 1;
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawArena();
        riders.forEach((r) => drawTrail(r, frac));
        riders.forEach((r) => drawRider(r, frac));
        drawParticles();
        ctx.restore();
        drawHud();
        drawOverlay();
      }

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' && state !== 'count') return;
        if (e.repeat) return;
        const p1 = P1_KEYS[e.code];
        const p2 = P2_KEYS[e.code];
        if (p1 !== undefined) turn(riders[0], p1);
        else if (e.code === 'Space') requestHop(riders[0]);
        else if (p2 !== undefined) turn(cpuOn ? riders[0] : riders[1], p2);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') requestHop(cpuOn ? riders[0] : riders[1]);
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
