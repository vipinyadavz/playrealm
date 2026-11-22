/* Sonar Maze — find the exit of a dark maze by sonar while blind stalkers hunt the sound. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 600;
  const TAU = Math.PI * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const CS = 64;
  const WT = 6;
  const PR = 10;
  const SPEED = 150;
  const GLOW = 88;
  const PING_SPEED = 400;
  const PING_MAX = 350;
  const LIT_TIME = 2.5;
  const PINGS_PER_LEVEL = 5;
  const BEACON_EVERY = 3;
  const STEP = 1 / 120;
  const BTN = { x: W - 56, y: H - 56, r: 34 };
  const DIRS = [
    { dx: 0, dy: -1, bit: 1, opp: 4 },
    { dx: 1, dy: 0, bit: 2, opp: 8 },
    { dx: 0, dy: 1, bit: 4, opp: 1 },
    { dx: -1, dy: 0, bit: 8, opp: 2 }
  ];
  const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* Recursive backtracker (iterative), then a few extra openings so there are loops to escape through. */
  function genMaze(cols, rows, rnd) {
    const walls = new Uint8Array(cols * rows).fill(15);
    const seen = new Uint8Array(cols * rows);
    const stack = [Math.floor(rnd() * cols * rows)];
    seen[stack[0]] = 1;
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const c = cur % cols;
      const r = (cur - c) / cols;
      const opts = [];
      for (const d of DIRS) {
        const nc = c + d.dx;
        const nr = r + d.dy;
        if (nc >= 0 && nr >= 0 && nc < cols && nr < rows && !seen[nr * cols + nc]) opts.push(d);
      }
      if (!opts.length) {
        stack.pop();
        continue;
      }
      const d = opts[Math.floor(rnd() * opts.length)];
      const n = (r + d.dy) * cols + c + d.dx;
      walls[cur] &= ~d.bit;
      walls[n] &= ~d.opp;
      seen[n] = 1;
      stack.push(n);
    }
    const extra = Math.floor(cols * rows * 0.07);
    let removed = 0;
    for (let k = 0; k < extra * 8 && removed < extra; k++) {
      const c = 1 + Math.floor(rnd() * (cols - 2));
      const r = 1 + Math.floor(rnd() * (rows - 2));
      const d = DIRS[Math.floor(rnd() * 4)];
      const i = r * cols + c;
      if (walls[i] & d.bit) {
        walls[i] &= ~d.bit;
        walls[(r + d.dy) * cols + c + d.dx] &= ~d.opp;
        removed++;
      }
    }
    return walls;
  }

  /* Wall edges as half-cell segments (finer reveal as the ring sweeps). */
  function buildSegs(walls, cols, rows, cs) {
    const segs = [];
    const add = (x1, y1, x2, y2) => {
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      segs.push({ x1, y1, x2: mx, y2: my, lit: 0, hot: 0 }, { x1: mx, y1: my, x2, y2, lit: 0, hot: 0 });
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const w = walls[r * cols + c];
        const x = c * cs;
        const y = r * cs;
        if (w & 1) add(x, y, x + cs, y);
        if (w & 8) add(x, y, x, y + cs);
        if (r === rows - 1 && (w & 4)) add(x, y + cs, x + cs, y + cs);
        if (c === cols - 1 && (w & 2)) add(x + cs, y, x + cs, y + cs);
      }
    }
    return segs;
  }

  function segDist(s, x, y) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((x - s.x1) * dx + (y - s.y1) * dy) / l2, 0, 1);
    return Math.hypot(x - (s.x1 + dx * t), y - (s.y1 + dy * t));
  }

  function strokeSeg(ctx, s) {
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }

  function drawStalker(ctx, x, y, a, t, hunting) {
    if (a <= 0.01) return;
    ctx.fillStyle = U.alpha(C.p1, 0.18 * a);
    ctx.beginPath();
    ctx.arc(x, y, 24, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.p1, 0.95 * a);
    ctx.beginPath();
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * TAU;
      const rr = (i % 2 ? 8 : 13) + Math.sin(t * 9 + i * 1.7) * 1.8;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = U.alpha(hunting ? C.gold : C.p1, 0.8 * a);
    ctx.lineWidth = 2;
    const k = hunting ? 1 + 0.25 * Math.sin(t * 12) : 1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(x, y, 17 * k, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6);
      ctx.stroke();
    }
    ctx.fillStyle = U.alpha(C.ink, a);
    ctx.fillRect(x - 5, y - 1, 10, 2);
  }

  function drawExit(ctx, x, y, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = U.alpha(C.gold, 0.12 + p * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, 30, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    U.roundRect(ctx, x - 11, y - 15, 22, 30, 6);
    ctx.stroke();
    ctx.fillStyle = U.alpha(C.gold, 0.5 + p * 0.4);
    U.roundRect(ctx, x - 6, y - 10, 12, 20, 4);
    ctx.fill();
  }

  function drawPlayer(ctx, x, y) {
    ctx.fillStyle = U.alpha(C.p2, 0.3);
    ctx.beginPath();
    ctx.arc(x, y, PR + 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.p2;
    ctx.beginPath();
    ctx.arc(x, y, PR - 1, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, TAU);
    ctx.fill();
  }

  const THUMB = (function () {
    const cols = 12;
    const rows = 8;
    const walls = genMaze(cols, rows, seeded(11));
    return { segs: buildSegs(walls, cols, rows, 30) };
  })();

  Arcade.register({
    id: 'sonar-maze',
    title: 'Sonar Maze',
    mode: 'solo',
    players: '1P',
    original: true,
    color: C.p2,
    tagline: 'Find the exit of a pitch-dark maze using sound.',
    hook: 'Your sonar pings reveal the walls, but the stalkers hear them too.',
    tags: ['maze', 'stealth', 'puzzle', 'dark', 'keyboard', 'touch'],
    howTo: 'The maze is dark: you only see a small glow around yourself. Press Space to send a sonar ping that lights ' +
      'up nearby walls for a few seconds. You get 5 pings per level, plus any you find. Stalkers are blind, but every ' +
      'ping tells them where you were, and they rush to that spot. You only see them when a ping or your glow touches ' +
      'them. Reach the gold exit (it pulses every 3 seconds). Getting caught costs a life and sends you back to the start.',
    controls: [
      { keys: ['↑', '↓', '←', '→'], label: 'Move (hold two to queue a turn)' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
      { keys: ['Space'], label: 'Sonar ping' },
      { keys: ['Tap'], label: 'Tap beside yourself to move that way; round button pings' }
    ],
    best: 'high',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = Math.max(w / 360, h / 240);
      ctx.save();
      ctx.scale(s, s);
      ctx.translate(-10, -10);
      const ox = 3.5 * 30;
      const oy = 4.5 * 30;
      const r = 120 + ((t * 110) % 240);
      ctx.lineCap = 'round';
      for (const sg of THUMB.segs) {
        const d = segDist(sg, ox, oy);
        if (d > r) continue;
        const age = (r - d) / 110;
        const a = Math.max(0, 1 - age / 2.2);
        if (a <= 0) continue;
        ctx.strokeStyle = U.alpha(C.p2, a * 0.25);
        ctx.lineWidth = 10;
        strokeSeg(ctx, sg);
        ctx.strokeStyle = age < 0.15 ? C.text : U.alpha(C.p2, a);
        ctx.lineWidth = 4;
        strokeSeg(ctx, sg);
      }
      ctx.strokeStyle = U.alpha(C.p2, 0.85 * (1 - r / 380));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ox, oy, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = U.alpha(C.p2, 0.3 * (1 - r / 380));
      ctx.beginPath();
      ctx.arc(ox, oy, Math.max(0, r - 16), 0, TAU);
      ctx.stroke();
      const ex = 10.5 * 30;
      const ey = 6.5 * 30;
      const br = (t * 60) % 120;
      ctx.strokeStyle = U.alpha(C.gold, 0.4 * (1 - br / 120));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey, br + 10, 0, TAU);
      ctx.stroke();
      drawExit(ctx, ex, ey, t);
      const sx = 6.5 * 30;
      const sy = 2.5 * 30;
      const sd = Math.hypot(sx - ox, sy - oy);
      drawStalker(ctx, sx, sy, sd < r ? Math.max(0.35, 1 - (r - sd) / 260) : 0.35, t, true);
      const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, 60);
      g.addColorStop(0, U.alpha(C.p2, 0.3));
      g.addColorStop(1, U.alpha(C.p2, 0));
      ctx.fillStyle = g;
      ctx.fillRect(ox - 60, oy - 60, 120, 120);
      drawPlayer(ctx, ox, oy);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      canvas.style.touchAction = 'none';

      const seen = {};
      const tap = { want: null, cur: null };
      const pointer = { down: false };
      const cam = { x: 0, y: 0 };
      let state = 'menu'; // 'menu' | 'play' | 'clear' | 'dying' | 'over'
      let level, cols, rows, walls, segs, mazeW, mazeH, start, exit, pickups, stalkers, stalkerSpeed;
      let rings, beacons, noise, noiseId, ringSeq, player, par;
      let score, lives, pings, pingCd, elapsed, beaconT, parts, texts, shake, flash, banner, clearT, deadT;
      let hint, hintT, lastStatus, clock;

      const cx = (i) => (i % cols + 0.5) * CS;
      const cy = (i) => (Math.floor(i / cols) + 0.5) * CS;
      const cellOf = (x, y) => U.clamp(Math.floor(y / CS), 0, rows - 1) * cols + U.clamp(Math.floor(x / CS), 0, cols - 1);
      const cellGap = (a, b) => Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols));

      function neighbors(i, fn) {
        const c = i % cols;
        const r = (i - c) / cols;
        for (const d of DIRS) if (!(walls[i] & d.bit)) fn((r + d.dy) * cols + c + d.dx);
      }

      function bfsAll(src) {
        const dist = new Int16Array(cols * rows).fill(-1);
        const q = [src];
        dist[src] = 0;
        for (let h = 0; h < q.length; h++) {
          const i = q[h];
          neighbors(i, (n) => {
            if (dist[n] < 0) {
              dist[n] = dist[i] + 1;
              q.push(n);
            }
          });
        }
        return dist;
      }

      function bfsPath(src, dst) {
        if (src === dst) return [];
        const prev = new Int32Array(cols * rows).fill(-1);
        prev[src] = src;
        const q = [src];
        for (let h = 0; h < q.length && prev[dst] < 0; h++) {
          const i = q[h];
          neighbors(i, (n) => {
            if (prev[n] < 0) {
              prev[n] = i;
              q.push(n);
            }
          });
        }
        if (prev[dst] < 0) return [];
        const path = [];
        for (let i = dst; i !== src; i = prev[i]) path.push(i);
        return path.reverse();
      }

      function say(text, secs) {
        hint = text;
        hintT = secs;
      }

      function refreshStatus() {
        let s;
        if (state === 'menu') s = 'Ping to see the walls. Blind stalkers hunt the sound.';
        else if (hintT > 0) s = hint;
        else s = 'Level ' + level + ' · Lives ' + lives + ' · Pings ' + pings + ' · Stalkers ' + stalkers.length;
        if (s !== lastStatus) {
          lastStatus = s;
          api.setStatus(s);
        }
      }

      function burst(x, y, color, n, speed) {
        for (let i = 0; i < n && parts.length < 400; i++) {
          const a = Math.random() * TAU;
          const v = Math.random() * speed;
          const l = U.rand(0.4, 0.9);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, color, size: U.rand(1.5, 3.5) });
        }
      }

      function popText(x, y, text, color) {
        if (texts.length > 12) texts.shift();
        texts.push({ x, y, text, color, life: 1.2 });
      }

      function makeStalker(i) {
        return { home: i, cell: i, next: -1, prev: -1, x: cx(i), y: cy(i), path: [], heard: -1, vis: 0, ringId: -1, hunting: false, wait: 0 };
      }

      function resetStalker(st) {
        Object.assign(st, makeStalker(st.home));
      }

      function snapCamera() {
        cam.x = mazeW <= W ? (mazeW - W) / 2 : U.clamp(player.x - W / 2, 0, mazeW - W);
        cam.y = mazeH <= H ? (mazeH - H) / 2 : U.clamp(player.y - H / 2, 0, mazeH - H);
      }

      function placePlayer() {
        player = { x: cx(start), y: cy(start), inv: 1.5 };
        tap.want = null;
        tap.cur = null;
        snapCamera();
      }

      function buildLevel(n) {
        level = n;
        cols = Math.min(31, 9 + 2 * n);
        rows = Math.min(23, 7 + 2 * n);
        walls = genMaze(cols, rows, Math.random);
        segs = buildSegs(walls, cols, rows, CS);
        mazeW = cols * CS;
        mazeH = rows * CS;
        start = U.pick([0, cols - 1, (rows - 1) * cols, rows * cols - 1]);
        const dist = bfsAll(start);
        let best = 0;
        exit = start;
        for (let i = 0; i < dist.length; i++) {
          if (dist[i] > best) {
            best = dist[i];
            exit = i;
          }
        }
        const dead = [];
        for (let i = 0; i < cols * rows; i++) {
          if (i === start || i === exit) continue;
          let k = 0;
          for (const d of DIRS) if (walls[i] & d.bit) k++;
          if (k === 3 && dist[i] > 3) dead.push(i);
        }
        U.shuffle(dead);
        pickups = [];
        const wantPickups = Math.min(5, 2 + Math.floor(n / 2));
        for (const i of dead) {
          if (pickups.length >= wantPickups) break;
          if (pickups.every((p) => cellGap(p.cell, i) > 3)) pickups.push({ cell: i, x: cx(i), y: cy(i), vis: 0 });
        }
        const far = [];
        for (let i = 0; i < dist.length; i++) if (dist[i] >= best * 0.45 && i !== exit) far.push(i);
        U.shuffle(far);
        stalkers = [];
        const count = Math.min(7, 1 + n);
        for (const i of far) {
          if (stalkers.length >= count) break;
          if (stalkers.every((st) => cellGap(st.home, i) > 2)) stalkers.push(makeStalker(i));
        }
        stalkerSpeed = Math.min(122, 70 + (n - 1) * 9);
        par = cols * rows * 0.35;
        pings = PINGS_PER_LEVEL;
        pingCd = 0;
        rings = [];
        beacons = [];
        beaconT = 0.6;
        noise = null;
        elapsed = 0;
        placePlayer();
        banner = { title: 'Level ' + n, sub: stalkers.length + ' stalker' + (stalkers.length === 1 ? '' : 's') + ' in the dark', t: 0, life: 2.2 };
      }

      function reset() {
        noiseId = 0;
        ringSeq = 0;
        score = 0;
        lives = 3;
        parts = [];
        texts = [];
        shake = 0;
        flash = 0;
        clearT = 0;
        deadT = 0;
        hint = '';
        hintT = 0;
        lastStatus = '';
        clock = 0;
        pointer.down = false;
        buildLevel(1);
        banner = null;
        api.setScore(0);
      }

      /* ---------- Sonar ---------- */
      function ping() {
        if (state !== 'play' || pingCd > 0) return;
        if (pings <= 0) {
          api.sfx('tick');
          popText(player.x, player.y - 28, 'No pings left', C.muted);
          return;
        }
        pings--;
        pingCd = 0.5;
        const ring = { x: player.x, y: player.y, r: 0, id: ++ringSeq, queue: [], qi: 0 };
        for (const s of segs) {
          const d = segDist(s, ring.x, ring.y);
          if (d <= PING_MAX) ring.queue.push({ s, d });
        }
        ring.queue.sort((a, b) => a.d - b.d);
        if (rings.length > 6) rings.shift();
        rings.push(ring);
        noise = { cell: cellOf(player.x, player.y), id: ++noiseId, x: player.x, y: player.y, t: 0 };
        shake = Math.max(shake, 2);
        api.sfx('flip');
        if (!seen.ping) {
          seen.ping = true;
          say('Every stalker heard that and is heading to this spot. Keep moving.', 5);
        } else if (pings === 0 && !seen.empty) {
          seen.empty = true;
          say('Out of pings. Feel your way with your glow and follow the gold pulse.', 5);
        }
      }

      function stepRings(dt) {
        for (const ring of rings) {
          ring.r += PING_SPEED * dt;
          while (ring.qi < ring.queue.length && ring.queue[ring.qi].d <= ring.r) {
            const s = ring.queue[ring.qi++].s;
            s.lit = 1;
            s.hot = 1;
          }
          for (const st of stalkers) {
            if (st.ringId === ring.id || ring.r > PING_MAX) continue;
            if (U.dist(st.x, st.y, ring.x, ring.y) <= ring.r) {
              st.ringId = ring.id;
              st.vis = 1;
              api.sfx('hit');
              if (!seen.stalker) {
                seen.stalker = true;
                say('Stalker spotted. They are blind and follow only the sound of your pings.', 5);
              }
            }
          }
          for (const p of pickups) {
            if (U.dist(p.x, p.y, ring.x, ring.y) <= ring.r) p.vis = 1;
          }
        }
        rings = rings.filter((ring) => ring.r < PING_MAX);
      }

      /* ---------- Movement with turning assistance ---------- */
      function isOpen(i, bit) {
        return !(walls[i] & bit);
      }

      /* Perpendicular lane coordinate to steer onto for moving in d, or null if no opening nearby. */
      function laneFor(d) {
        const c = U.clamp(Math.floor(player.x / CS), 0, cols - 1);
        const r = U.clamp(Math.floor(player.y / CS), 0, rows - 1);
        const i = r * cols + c;
        const vertical = d.dy !== 0;
        const centre = vertical ? (c + 0.5) * CS : (r + 0.5) * CS;
        if (isOpen(i, d.bit)) return centre;
        const off = (vertical ? player.x : player.y) - centre;
        if (Math.abs(off) < CS * 0.18) return null;
        const s = off > 0 ? 1 : -1;
        const nc = vertical ? c + s : c;
        const nr = vertical ? r : r + s;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return null;
        const between = vertical ? (s > 0 ? 2 : 8) : (s > 0 ? 4 : 1);
        if (!isOpen(i, between) || !isOpen(nr * cols + nc, d.bit)) return null;
        return centre + s * CS;
      }

      /* Room left to move in d inside the current cell before touching its wall. */
      function roomAhead(d) {
        const c = U.clamp(Math.floor(player.x / CS), 0, cols - 1);
        const r = U.clamp(Math.floor(player.y / CS), 0, rows - 1);
        if (isOpen(r * cols + c, d.bit)) return true;
        const pad = PR + WT / 2 + 0.5;
        if (d.dy < 0) return player.y > r * CS + pad;
        if (d.dy > 0) return player.y < (r + 1) * CS - pad;
        if (d.dx < 0) return player.x > c * CS + pad;
        return player.x < (c + 1) * CS - pad;
      }

      function pushOut(x1, y1, x2, y2) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const t = U.clamp(((player.x - x1) * dx + (player.y - y1) * dy) / (dx * dx + dy * dy), 0, 1);
        const px = x1 + dx * t;
        const py = y1 + dy * t;
        const ex = player.x - px;
        const ey = player.y - py;
        const d = Math.hypot(ex, ey);
        const min = PR + WT / 2;
        if (d < min && d > 0.0001) {
          player.x = px + (ex / d) * min;
          player.y = py + (ey / d) * min;
        }
      }

      function collide() {
        const c0 = Math.floor(player.x / CS);
        const r0 = Math.floor(player.y / CS);
        for (let r = r0 - 1; r <= r0 + 1; r++) {
          for (let c = c0 - 1; c <= c0 + 1; c++) {
            if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
            const w = walls[r * cols + c];
            const x = c * CS;
            const y = r * CS;
            if (w & 1) pushOut(x, y, x + CS, y);
            if (w & 2) pushOut(x + CS, y, x + CS, y + CS);
            if (w & 4) pushOut(x, y + CS, x + CS, y + CS);
            if (w & 8) pushOut(x, y, x, y + CS);
          }
        }
        player.x = U.clamp(player.x, PR + WT / 2, mazeW - PR - WT / 2);
        player.y = U.clamp(player.y, PR + WT / 2, mazeH - PR - WT / 2);
      }

      function movePlayer(dt) {
        const held = [];
        for (const code of api.keys) {
          const k = KEYDIR[code];
          if (k !== undefined) {
            const at = held.indexOf(k);
            if (at >= 0) held.splice(at, 1);
            held.push(k);
          }
        }
        let want = null;
        let fallback = null;
        if (held.length) {
          tap.want = null;
          tap.cur = null;
          want = DIRS[held[held.length - 1]];
          if (held.length > 1) fallback = DIRS[held[held.length - 2]];
        } else {
          want = tap.want;
          fallback = tap.cur;
        }
        let dir = null;
        if (want && laneFor(want) !== null) dir = want;
        else if (fallback && fallback !== want && (laneFor(fallback) !== null || roomAhead(fallback))) dir = fallback;
        else if (want && roomAhead(want)) dir = want;
        if (!held.length) {
          tap.cur = dir;
          if (!dir) tap.want = null;
        }
        if (dir) {
          const step = SPEED * dt;
          let main = step;
          const lane = laneFor(dir);
          if (lane !== null) {
            const vertical = dir.dy !== 0;
            const diff = lane - (vertical ? player.x : player.y);
            const m = Math.sign(diff) * Math.min(Math.abs(diff), step);
            if (vertical) player.x += m;
            else player.y += m;
            if (Math.abs(diff) > 6) main = step * 0.25;
          }
          player.x += dir.dx * main;
          player.y += dir.dy * main;
        }
        collide();
      }

      /* ---------- Stalkers ---------- */
      function chooseNext(st) {
        if (noise && st.heard !== noise.id) {
          st.heard = noise.id;
          st.path = bfsPath(st.cell, noise.cell);
          st.hunting = st.path.length > 0;
        }
        if (st.path.length) {
          st.next = st.path.shift();
          return;
        }
        if (st.hunting) {
          st.hunting = false;
          st.wait = 0.9; // listens at the spot of the ping
          return;
        }
        const opts = [];
        neighbors(st.cell, (n) => { if (n !== st.prev) opts.push(n); });
        if (!opts.length) neighbors(st.cell, (n) => opts.push(n));
        st.next = opts.length ? U.pick(opts) : -1;
      }

      function stepStalker(st, dt) {
        st.vis = Math.max(0, st.vis - dt / 1.4);
        if (st.wait > 0) {
          st.wait -= dt;
          return;
        }
        if (st.next < 0) chooseNext(st);
        if (st.next < 0) return;
        const tx = cx(st.next);
        const ty = cy(st.next);
        const dx = tx - st.x;
        const dy = ty - st.y;
        const d = Math.hypot(dx, dy);
        const sp = stalkerSpeed * (st.hunting ? 1.2 : 0.75) * dt;
        if (d <= sp) {
          st.x = tx;
          st.y = ty;
          st.prev = st.cell;
          st.cell = st.next;
          st.next = -1;
        } else {
          st.x += (dx / d) * sp;
          st.y += (dy / d) * sp;
        }
      }

      /* ---------- Outcomes ---------- */
      function caught(st) {
        lives--;
        flash = 0.8;
        shake = 12;
        burst(player.x, player.y, C.p2, 30, 220);
        burst(st.x, st.y, C.p1, 20, 160);
        st.vis = 1;
        api.sfx('boom');
        if (lives <= 0) {
          state = 'dying';
          deadT = 1.4;
          return;
        }
        for (const s of stalkers) resetStalker(s);
        noise = null;
        rings = [];
        placePlayer();
        player.inv = 2;
        say('Caught! Back to the start of the level. Lives left: ' + lives + '.', 4);
      }

      function levelClear() {
        state = 'clear';
        const timeBonus = Math.max(0, Math.round((par - elapsed) * 4));
        const pingBonus = pings * 25;
        score += 100 + pingBonus + timeBonus;
        api.setScore(score);
        banner = {
          title: 'Level ' + level + ' clear',
          sub: '+100 exit · +' + pingBonus + ' unused pings · +' + timeBonus + ' time',
          t: 0,
          life: 2.6
        };
        clearT = 2.6;
        burst(player.x, player.y, C.gold, 40, 260);
        api.sfx('win');
      }

      function step(dt) {
        if (state === 'play') {
          movePlayer(dt);
          player.inv = Math.max(0, player.inv - dt);
          for (const st of stalkers) {
            if (player.inv <= 0 && U.dist(st.x, st.y, player.x, player.y) < PR + 11) {
              caught(st);
              return;
            }
          }
          for (let i = pickups.length - 1; i >= 0; i--) {
            const p = pickups[i];
            if (U.dist(p.x, p.y, player.x, player.y) < 22) {
              pickups.splice(i, 1);
              pings++;
              popText(p.x, p.y - 22, '+1 ping', C.p2);
              burst(p.x, p.y, C.p2, 18, 160);
              api.sfx('power');
            }
          }
          if (U.dist(player.x, player.y, cx(exit), cy(exit)) < 24) levelClear();
        }
        for (const st of stalkers) stepStalker(st, dt);
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 2);
        hintT = Math.max(0, hintT - dt);
        if (banner) {
          banner.t += dt;
          if (banner.t > banner.life) banner = null;
        }
        for (const p of parts) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 2;
          p.vy *= 1 - dt * 2;
        }
        parts = parts.filter((p) => p.life > 0);
        for (const tx of texts) {
          tx.life -= dt;
          tx.y -= 28 * dt;
        }
        texts = texts.filter((tx) => tx.life > 0);
        if (state === 'menu') return;

        for (const s of segs) {
          if (s.lit > 0) s.lit = Math.max(0, s.lit - dt / LIT_TIME);
          if (s.hot > 0) s.hot = Math.max(0, s.hot - dt * 5);
        }
        for (const p of pickups) p.vis = Math.max(0, p.vis - dt / 4);
        if (noise) noise.t += dt;
        stepRings(dt);
        beaconT -= dt;
        if (beaconT <= 0) {
          beaconT += BEACON_EVERY;
          beacons.push({ r: 0 });
        }
        for (const b of beacons) b.r += 170 * dt;
        beacons = beacons.filter((b) => b.r < 520);

        if (state === 'play' || state === 'dying') {
          if (state === 'play') {
            elapsed += dt;
            pingCd = Math.max(0, pingCd - dt);
          }
          const n = Math.max(1, Math.ceil(dt / STEP));
          for (let i = 0; i < n && (state === 'play' || state === 'dying'); i++) step(dt / n);
        }
        if (state === 'clear') {
          clearT -= dt;
          if (clearT <= 0) {
            buildLevel(level + 1);
            state = 'play';
            api.sfx('flip');
          }
        } else if (state === 'dying') {
          deadT -= dt;
          if (deadT <= 0) gameOver();
        }
        if (player) {
          const tx = mazeW <= W ? (mazeW - W) / 2 : U.clamp(player.x - W / 2, 0, mazeW - W);
          const ty = mazeH <= H ? (mazeH - H) / 2 : U.clamp(player.y - H / 2, 0, mazeH - H);
          const k = 1 - Math.exp(-dt * 8);
          cam.x += (tx - cam.x) * k;
          cam.y += (ty - cam.y) * k;
        }
        refreshStatus();
      }

      /* ---------- Drawing ---------- */
      function drawWorld() {
        const px = player.x;
        const py = player.y;
        const x0 = cam.x - 20;
        const y0 = cam.y - 20;
        const x1 = cam.x + W + 20;
        const y1 = cam.y + H + 20;

        const glow = ctx.createRadialGradient(px, py, 0, px, py, GLOW * 1.5);
        glow.addColorStop(0, U.alpha(C.p2, 0.16));
        glow.addColorStop(1, U.alpha(C.p2, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(px - GLOW * 1.5, py - GLOW * 1.5, GLOW * 3, GLOW * 3);

        // Exit beacon pulses.
        const ex = cx(exit);
        const ey = cy(exit);
        ctx.lineWidth = 2;
        for (const b of beacons) {
          ctx.strokeStyle = U.alpha(C.gold, 0.4 * (1 - b.r / 520));
          ctx.beginPath();
          ctx.arc(ex, ey, b.r + 12, 0, TAU);
          ctx.stroke();
        }
        drawExit(ctx, ex, ey, clock);

        // Where the stalkers are heading: the spot of your last ping.
        if (noise && stalkers.some((st) => st.hunting || st.wait > 0)) {
          const a = 0.55 + 0.25 * Math.sin(clock * 6);
          ctx.strokeStyle = U.alpha(C.p1, a * 0.6);
          ctx.lineWidth = 1.5;
          for (let k = 0; k < 3; k++) {
            const rr = 6 + ((clock * 18 + k * 8) % 24);
            ctx.beginPath();
            ctx.arc(noise.x, noise.y, rr, 0, TAU);
            ctx.stroke();
          }
        }

        // Walls: lit by sonar (cyan) or by your own glow (soft).
        ctx.lineCap = 'round';
        for (const s of segs) {
          if (Math.max(s.x1, s.x2) < x0 || Math.min(s.x1, s.x2) > x1 || Math.max(s.y1, s.y2) < y0 || Math.min(s.y1, s.y2) > y1) continue;
          const d = Math.hypot((s.x1 + s.x2) / 2 - px, (s.y1 + s.y2) / 2 - py);
          const g = d < GLOW ? 1 - d / GLOW : 0;
          if (s.lit > 0.01) {
            ctx.strokeStyle = U.alpha(C.p2, s.lit * 0.22);
            ctx.lineWidth = 14;
            strokeSeg(ctx, s);
            ctx.strokeStyle = s.hot > 0.3 ? C.text : U.alpha(C.p2, Math.min(1, s.lit * 1.1));
            ctx.lineWidth = WT;
            strokeSeg(ctx, s);
          }
          if (g > 0) {
            ctx.strokeStyle = U.alpha(C.muted, g * 0.85);
            ctx.lineWidth = WT;
            strokeSeg(ctx, s);
          }
        }

        for (const ring of rings) {
          const k = 1 - ring.r / PING_MAX;
          ctx.strokeStyle = U.alpha(C.p2, 0.9 * k);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = U.alpha(C.p2, 0.35 * k);
          ctx.lineWidth = 8;
          ctx.beginPath();
          ctx.arc(ring.x, ring.y, Math.max(0, ring.r - 10), 0, TAU);
          ctx.stroke();
        }

        for (const p of pickups) {
          const d = U.dist(p.x, p.y, px, py);
          const a = Math.max(p.vis, d < GLOW + 20 ? 1 - d / (GLOW + 20) : 0);
          if (a <= 0.01) continue;
          ctx.fillStyle = U.alpha(C.p2, 0.2 * a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 16, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.p2, a);
          ctx.lineWidth = 2;
          for (let k = 1; k <= 2; k++) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, k * 5 + Math.sin(clock * 4) * 1.5, 0, TAU);
            ctx.stroke();
          }
          ctx.fillStyle = U.alpha(C.text, a);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5, 0, TAU);
          ctx.fill();
        }

        for (const st of stalkers) {
          const d = U.dist(st.x, st.y, px, py);
          const near = d < GLOW + 14 ? Math.min(1, (GLOW + 14 - d) / 30) : 0;
          drawStalker(ctx, st.x, st.y, Math.max(st.vis, near, state === 'dying' ? 1 : 0), clock, st.hunting);
        }

        if (state !== 'dying' && state !== 'over') {
          if (!(player.inv > 0 && Math.sin(clock * 25) < 0)) drawPlayer(ctx, px, py);
          if (state === 'play' && pingCd > 0) {
            ctx.strokeStyle = U.alpha(C.p2, pingCd);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, PR + 10 + (0.5 - pingCd) * 30, 0, TAU);
            ctx.stroke();
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) {
          ctx.fillStyle = U.alpha(p.color, Math.max(0, p.life / p.max));
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = HUD;
        ctx.textAlign = 'center';
        for (const tx of texts) {
          ctx.fillStyle = U.alpha(tx.color, Math.min(1, tx.life * 2));
          ctx.fillText(tx.text, tx.x, tx.y);
        }
      }

      function drawHud() {
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText('Level ' + level, 16, 22);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i < lives ? C.p2 : U.alpha(C.line, 1);
          ctx.beginPath();
          ctx.arc(110 + i * 18, 22, 6, 0, TAU);
          ctx.fill();
        }
        // Ping button with remaining pings. It hops to the left corner when the player is under it.
        const psx = player.x - cam.x;
        const psy = player.y - cam.y;
        BTN.x = psx > W - 170 && psy > H - 170 ? 56 : W - 56;
        const ready = pings > 0 && state === 'play';
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        ctx.beginPath();
        ctx.arc(BTN.x, BTN.y, BTN.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = ready ? C.p2 : C.line;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.strokeStyle = ready ? C.p2 : C.muted;
        ctx.lineWidth = 2;
        ctx.fillStyle = ready ? C.p2 : C.muted;
        ctx.beginPath();
        ctx.arc(BTN.x - 10, BTN.y - 4, 3, 0, TAU);
        ctx.fill();
        for (let k = 1; k <= 3; k++) {
          ctx.beginPath();
          ctx.arc(BTN.x - 10, BTN.y - 4, k * 6, -0.7, 0.7);
          ctx.stroke();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = ready ? C.text : C.muted;
        ctx.fillText('x' + pings, BTN.x + 2, BTN.y + 18);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('Pings', W - 16, 22);
        for (let i = 0; i < Math.max(pings, PINGS_PER_LEVEL); i++) {
          ctx.strokeStyle = C.p2;
          ctx.fillStyle = i < pings ? C.p2 : 'transparent';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(W - 80 - i * 16, 22, 5, 0, TAU);
          if (i < pings) ctx.fill();
          else ctx.stroke();
        }
        ctx.textBaseline = 'alphabetic';
        if (banner) {
          const a = Math.max(0, Math.min(1, banner.t * 4, (banner.life - banner.t) * 3));
          ctx.textAlign = 'center';
          ctx.font = BIG;
          ctx.fillStyle = U.alpha(C.text, a);
          ctx.fillText(banner.title, W / 2, H * 0.42);
          ctx.font = HUD;
          ctx.fillStyle = U.alpha(C.p2, a);
          ctx.fillText(banner.sub, W / 2, H * 0.42 + 36);
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
        drawWorld();
        ctx.restore();
        if (state !== 'menu') drawHud();
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.p1, flash * 0.3);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Flow ---------- */
      function startRun() {
        reset();
        state = 'play';
        banner = { title: 'Level 1', sub: 'Find the gold exit', t: 0, life: 2.2 };
        say('Press Space to ping: sonar lights up the walls near you. Find the gold exit.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Sonar Maze',
          text: api.isTouch
            ? 'Tap beside yourself to move that way. Tap the round button to ping.'
            : 'Arrows or WASD to move, Space to ping. You can also click beside yourself to move.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function gameOver() {
        state = 'over';
        api.sfx('lose');
        const isBest = api.reportScore(score);
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Game over',
          text: 'The stalkers got you on level ' + level + '. Final score: ' + score + '.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      function setTapDir(p) {
        const dx = p.x - (player.x - cam.x);
        const dy = p.y - (player.y - cam.y);
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 16) {
          tap.want = null;
          tap.cur = null;
          return;
        }
        tap.want = DIRS[Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)];
      }

      api.on(window, 'keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) ping();
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        if (U.dist(p.x, p.y, BTN.x, BTN.y) <= BTN.r + 10) {
          ping();
          return;
        }
        pointer.down = true;
        setTapDir(p);
      });
      api.on(window, 'pointermove', (e) => {
        if (!pointer.down || state !== 'play') return;
        setTapDir(api.toCanvas(e, canvas));
      });
      const release = () => { pointer.down = false; };
      api.on(window, 'pointerup', release, { always: true });
      api.on(window, 'pointercancel', release, { always: true });

      reset();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
