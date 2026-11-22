/* Drop Duel — two-board versus falling-block puzzle with three-cell pieces.
   The twist: clears send garbage rows to your rival, and digging through garbage sends double. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;

  const W = 960;
  const H = 600;
  const BW = 8;
  const BH = 16;
  const CS = 30;
  const TOP = 84;
  const BOARD_X = [104, 616];
  const NEXT_X = [370, 514];
  const HOLD_X = [20, 864];
  const METER_X = [350, 598];
  const LOCK = 0.5;
  const MAX_RESETS = 15;
  const WARN = 1.6;          // seconds of warning before garbage is ready to rise
  const MAX_RISE = 6;        // most garbage rows that rise on one lock
  const SPEEDUP = 30;
  const PRESSURE_AT = 90;    // after this, both boards get a garbage row on a shrinking timer
  const DAS = 0.16;
  const ARR = 0.045;
  const GARB = 9;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';

  /* Pieces: straight 3 (in a 3×3 box) and the corner 3 (in a 2×2 box), four rotations each. */
  const SHAPES = {
    I: [[[0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2]], [[0, 1], [1, 1], [2, 1]], [[1, 0], [1, 1], [1, 2]]],
    L: [[[0, 0], [0, 1], [1, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[1, 0], [0, 1], [1, 1]]]
  };
  const SPAWN_Y = { I: -1, L: 0 };
  const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1], [-2, 0], [2, 0]];

  function mix(hex, to, t) {
    const a = parseInt(hex.slice(1), 16);
    const b = parseInt(to.slice(1), 16);
    const ch = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t));
    return 'rgb(' + ch(16) + ',' + ch(8) + ',' + ch(0) + ')';
  }
  const GEM_BASE = [null, C.gold, C.mint, C.violet, '#5EA8FF', '#FF7EB0'];
  const GEMS = GEM_BASE.map((c) => (c ? { base: c, light: mix(c, '#FFFFFF', 0.55), dark: mix(c, '#0F0D24', 0.45) } : null));

  function drawGem(ctx, x, y, s, c, alpha) {
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    if (c === GARB) {
      ctx.fillStyle = '#2C2754';
      U.roundRect(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.18);
      ctx.fill();
      ctx.fillStyle = '#463F7A';
      U.roundRect(ctx, x + 2, y + 2, s - 4, s - 5, s * 0.16);
      ctx.fill();
      ctx.fillStyle = 'rgba(15,13,36,0.55)';
      ctx.fillRect(x + s * 0.3, y + s * 0.45, s * 0.4, 2);
      ctx.fillRect(x + s * 0.45, y + s * 0.3, 2, s * 0.3);
    } else {
      const g = GEMS[c] || GEMS[1];
      ctx.fillStyle = g.dark;
      U.roundRect(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.24);
      ctx.fill();
      ctx.fillStyle = g.base;
      U.roundRect(ctx, x + 2, y + 2, s - 4, s - 6, s * 0.2);
      ctx.fill();
      ctx.fillStyle = g.light;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 5);
      ctx.lineTo(x + s * 0.6, y + 5);
      ctx.lineTo(x + 5, y + s * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(x + s * 0.68, y + s * 0.22, 2.5, 2.5);
    }
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }

  function fits(board, kind, rot, x, y) {
    const cells = SHAPES[kind][rot];
    for (let i = 0; i < 3; i++) {
      const cx = x + cells[i][0];
      const cy = y + cells[i][1];
      if (cx < 0 || cx >= BW || cy >= BH) return false;
      if (cy >= 0 && board[cy * BW + cx]) return false;
    }
    return true;
  }

  /* ---------- Bot evaluation (scratch buffers reused) ---------- */
  const scratch = new Uint8Array(BW * BH);
  const packed = new Uint8Array(BW * BH);
  const heights = new Int8Array(BW);
  const EVAL = { lines: 0, garb: 0 };

  function evalPlacement(board, kind, rot, x, cfg, pendingRows) {
    let y = SPAWN_Y[kind];
    if (!fits(board, kind, rot, x, y)) return -1e9;
    while (fits(board, kind, rot, x, y + 1)) y++;
    scratch.set(board);
    const cells = SHAPES[kind][rot];
    for (let i = 0; i < 3; i++) {
      const cy = y + cells[i][1];
      if (cy < 0) return -1e9;
      scratch[cy * BW + x + cells[i][0]] = 1;
    }
    // Clear full rows into the packed copy.
    let lines = 0;
    let garb = 0;
    let dst = BH - 1;
    packed.fill(0);
    for (let r = BH - 1; r >= 0; r--) {
      let full = true;
      let hasG = false;
      for (let c = 0; c < BW; c++) {
        const v = scratch[r * BW + c];
        if (!v) { full = false; break; }
        if (v === GARB) hasG = true;
      }
      if (full) {
        lines++;
        if (hasG) garb++;
        continue;
      }
      for (let c = 0; c < BW; c++) packed[dst * BW + c] = scratch[r * BW + c];
      dst--;
    }
    let agg = 0;
    let holes = 0;
    let bump = 0;
    let maxH = 0;
    for (let c = 0; c < BW; c++) {
      let h = 0;
      for (let r = 0; r < BH; r++) {
        if (packed[r * BW + c]) { h = BH - r; break; }
      }
      heights[c] = h;
      agg += h;
      if (h > maxH) maxH = h;
      for (let r = BH - h + 1; r < BH; r++) if (!packed[r * BW + c]) holes++;
    }
    for (let c = 0; c < BW - 1; c++) bump += Math.abs(heights[c] - heights[c + 1]);
    const base = lines >= 2 ? lines - 1 : 0;
    const send = garb > 0 ? Math.max(1, base * 2) : base;
    EVAL.lines = lines;
    EVAL.garb = garb;
    let s = -0.5 * agg + 0.7 * lines - 0.85 * holes - 0.2 * bump + 0.9 * send + cfg.dig * garb;
    if (pendingRows > 0) s += 0.6 * Math.min(send, pendingRows);
    if (maxH > 10) s -= (maxH - 10) * 2.5;
    return s;
  }

  const AI = {
    easy: { think: 0.85, step: 0.16, noise: 2.6, hold: false, dig: 0.4, sloppy: 0.25 },
    normal: { think: 0.45, step: 0.09, noise: 0.5, hold: true, dig: 1.2, sloppy: 0.05 },
    hard: { think: 0.22, step: 0.05, noise: 0, hold: true, dig: 1.8, sloppy: 0 }
  };

  const KEYSETS = [
    { left: 'KeyA', right: 'KeyD', soft: 'KeyS', rot: 'KeyW', ccw: 'KeyE', hard: 'Space', hold: 'KeyQ' },
    { left: 'ArrowLeft', right: 'ArrowRight', soft: 'ArrowDown', rot: 'ArrowUp', ccw: 'Period', hard: 'Enter', hold: 'Slash' }
  ];

  Arcade.register({
    id: 'drop-duel',
    title: 'Drop Duel',
    category: 'combat',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.violet,
    tagline: 'Stack three-cell gems, clear lines and bury your rival in garbage.',
    hook: 'Clears fire garbage rows at your rival; dig through garbage to send it back doubled.',
    tags: ['puzzle', 'versus', 'falling blocks', 'garbage', 'stacking', 'computer opponent', 'keyboard'],
    howTo: 'Two boards, eight wide and sixteen tall, fed the same three-cell pieces: a straight 3 and a corner. ' +
      'Fill a row to clear it. Clearing 2 lines at once sends 1 garbage row to your rival, 3 lines send 2. ' +
      'Garbage rows are grey stone with one gap, and they rise from the bottom after a short warning on the meter ' +
      'beside the board. The twist: clearing a garbage row is a dig, and digs send double, so a buried board can ' +
      'fight back hard. Clears also cancel garbage that is still waiting on your meter. The pieces fall faster every ' +
      '30 seconds, and after a minute and a half both boards get a garbage row every few seconds. Top out and you lose the round. Best of 3.',
    controls: [
      { keys: ['A', 'D'], label: 'P1 move' },
      { keys: ['W'], label: 'P1 rotate (E turns the other way)' },
      { keys: ['S'], label: 'P1 soft drop' },
      { keys: ['Space'], label: 'P1 hard drop' },
      { keys: ['Q'], label: 'P1 hold' },
      { keys: ['←', '→'], label: 'P2 move' },
      { keys: ['↑'], label: 'P2 rotate (Period turns the other way)' },
      { keys: ['↓'], label: 'P2 soft drop' },
      { keys: ['Enter'], label: 'P2 hard drop' },
      { keys: ['/'], label: 'P2 hold' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 14;
      const drawBoard = (ox, cols, garbRows, hole, falling) => {
        ctx.fillStyle = C.panel;
        ctx.fillRect(ox - 3, 18, 8 * s + 6, 12 * s + 6);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.strokeRect(ox - 3, 18, 8 * s + 6, 12 * s + 6);
        for (let c = 0; c < 8; c++) {
          for (let r = 0; r < cols[c]; r++) drawGem(ctx, ox + c * s, 21 + (11 - r - garbRows) * s, s, 1 + ((c * 3 + r) % 5));
        }
        for (let r = 0; r < garbRows; r++) {
          for (let c = 0; c < 8; c++) if (c !== hole) drawGem(ctx, ox + c * s, 21 + (11 - r) * s, s, GARB);
        }
        if (falling) falling();
      };
      drawBoard(24, [2, 3, 1, 2, 2, 0, 1, 2], 0, -1, () => {
        const y = 21 + ((Math.floor(t * 3) % 4) + 1) * s;
        drawGem(ctx, 24 + 5 * s, y, s, 3);
        drawGem(ctx, 24 + 5 * s, y + s, s, 3);
        drawGem(ctx, 24 + 6 * s, y + s, s, 3);
      });
      drawBoard(w - 24 - 8 * s, [1, 2, 0, 1, 2, 1, 1, 0], 4, 5);
      // Garbage volley flying across.
      const p = (t * 0.6) % 1;
      const x = 24 + 8 * s + 10 + p * (w - 2 * (24 + 8 * s) - 20);
      const y = 120 - Math.sin(p * Math.PI) * 50;
      ctx.fillStyle = U.alpha(C.violet, 0.3);
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.violet;
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '800 18px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText('×2', w / 2, 178);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      void canvas;

      let state = 'menu';     // 'menu' | 'count' | 'play' | 'roundEnd' | 'over'
      let vsCpu = false;
      let diff = 'normal';
      let countT = 0;
      let roundT = 0;
      let round = 1;
      let roundTime = 0;
      let level = 0;
      let pressT = 0;
      let time = 0;
      let seq = [];
      let hints = {};
      let roundMsg = '';
      let roundColor = C.text;
      const players = [makePlayer(0), makePlayer(1)];

      function makePlayer(i) {
        return {
          i, board: new Uint8Array(BW * BH), cur: null, hold: null, canHold: true, seqIdx: 0,
          gravT: 0, lockT: 0, resets: 0, das: 0, dasT: 0, pending: [], dead: false, wins: 0,
          cpu: false, ai: { planned: false, wait: 0, act: 0, rot: 0, x: 0, hold: false },
          shake: 0, bump: 0, flash: [], stats: { lines: 0, sent: 0, digs: 0 }, deadT: 0
        };
      }

      /* ---------- Particles, orbs and popups (pooled) ---------- */
      const PMAX = 320;
      const parts = [];
      for (let i = 0; i < PMAX; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: C.text, size: 3 });
      let pNext = 0;
      function spark(x, y, vx, vy, life, color, size) {
        const p = parts[pNext];
        pNext = (pNext + 1) % PMAX;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.color = color; p.size = size;
      }
      const orbs = [];
      for (let i = 0; i < 8; i++) orbs.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, n: 0, dig: false });
      const pops = [];
      for (let i = 0; i < 6; i++) pops.push({ t: 0, text: '', color: C.text, x: 0, y: 0 });
      function popup(text, color, x, y) {
        let best = pops[0];
        for (let i = 1; i < pops.length; i++) if (pops[i].t < best.t) best = pops[i];
        best.t = 1.2; best.text = text; best.color = color; best.x = x; best.y = y;
      }

      function hint(key, text) {
        if (hints[key]) return;
        hints[key] = true;
        api.setStatus(text);
      }

      const nameOf = (i) => (vsCpu ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));

      /* ---------- Piece sequence: both boards get the same pieces ---------- */
      function pieceAt(n) {
        while (seq.length <= n) {
          const bag = U.shuffle(['I', 'I', 'L', 'L', 'L']);
          for (let k = 0; k < bag.length; k++) seq.push({ kind: bag[k], color: U.randInt(1, 5) });
        }
        return seq[n];
      }

      function spawn(p, piece) {
        const pc = piece || pieceAt(p.seqIdx++);
        p.cur = { kind: pc.kind, color: pc.color, rot: 0, x: 3, y: SPAWN_Y[pc.kind] };
        p.gravT = 0;
        p.lockT = 0;
        p.resets = 0;
        p.ai.planned = false;
        p.ai.wait = AI[diff].think * (0.8 + Math.random() * 0.4);
        if (!fits(p.board, p.cur.kind, p.cur.rot, p.cur.x, p.cur.y)) topOut(p);
      }

      function topOut(p) {
        if (p.dead) return;
        p.dead = true;
        p.deadT = 0;
        p.shake = 10;
        api.sfx('boom');
        const ox = BOARD_X[p.i] + (BW * CS) / 2;
        for (let i = 0; i < 30; i++) {
          spark(ox + (Math.random() - 0.5) * BW * CS, TOP + Math.random() * 120,
            (Math.random() - 0.5) * 200, -Math.random() * 200, 0.9, C.p1, 4);
        }
      }

      /* ---------- Movement ---------- */
      function grounded(p) {
        const c = p.cur;
        return !fits(p.board, c.kind, c.rot, c.x, c.y + 1);
      }

      function tryMove(p, dx, dy) {
        const c = p.cur;
        if (!c || !fits(p.board, c.kind, c.rot, c.x + dx, c.y + dy)) return false;
        c.x += dx;
        c.y += dy;
        if (dx && grounded(p) && p.resets < MAX_RESETS) { p.lockT = 0; p.resets++; }
        return true;
      }

      function tryRotate(p, dir) {
        const c = p.cur;
        if (!c) return false;
        const nr = (c.rot + dir + 4) % 4;
        for (let k = 0; k < KICKS.length; k++) {
          const nx = c.x + KICKS[k][0];
          const ny = c.y + KICKS[k][1];
          if (fits(p.board, c.kind, nr, nx, ny)) {
            c.x = nx;
            c.y = ny;
            c.rot = nr;
            if (grounded(p) && p.resets < MAX_RESETS) { p.lockT = 0; p.resets++; }
            if (!p.cpu) api.sfx('tick');
            return true;
          }
        }
        return false;
      }

      function ghostY(p) {
        const c = p.cur;
        let y = c.y;
        while (fits(p.board, c.kind, c.rot, c.x, y + 1)) y++;
        return y;
      }

      function hardDrop(p) {
        const c = p.cur;
        if (!c) return;
        const y0 = c.y;
        const y1 = ghostY(p);
        c.y = y1;
        const cells = SHAPES[c.kind][c.rot];
        if (y1 > y0) {
          for (let i = 0; i < 3; i++) {
            const px = BOARD_X[p.i] + (c.x + cells[i][0]) * CS + CS / 2;
            for (let k = 0; k < 3; k++) {
              spark(px + (Math.random() - 0.5) * 16, TOP + (y0 + cells[i][1] + Math.random() * (y1 - y0)) * CS,
                0, -60, 0.3, U.alpha(GEM_BASE[c.color], 0.7), 3);
            }
          }
        }
        p.bump = 4;
        lockPiece(p);
      }

      function doHold(p) {
        if (!p.canHold || !p.cur) return;
        const cur = p.cur;
        const out = p.hold;
        p.hold = { kind: cur.kind, color: cur.color };
        p.canHold = false;
        api.sfx('flip');
        spawn(p, out);
        p.canHold = false;
      }

      /* ---------- Locking, clears, garbage ---------- */
      function lockPiece(p) {
        const c = p.cur;
        const cells = SHAPES[c.kind][c.rot];
        let out = false;
        for (let i = 0; i < 3; i++) {
          const x = c.x + cells[i][0];
          const y = c.y + cells[i][1];
          if (y < 0) { out = true; continue; }
          p.board[y * BW + x] = c.color;
        }
        p.cur = null;
        if (out) { topOut(p); return; }
        if (!p.cpu) api.sfx('blip');
        // Clear full rows.
        let lines = 0;
        let garb = 0;
        for (let r = BH - 1; r >= 0; r--) {
          let full = true;
          let hasG = false;
          for (let x = 0; x < BW; x++) {
            const v = p.board[r * BW + x];
            if (!v) { full = false; break; }
            if (v === GARB) hasG = true;
          }
          if (!full) continue;
          lines++;
          if (hasG) garb++;
          for (let x = 0; x < BW; x++) {
            const v = p.board[r * BW + x];
            const col = v === GARB ? '#7A72B8' : GEM_BASE[v];
            const px = BOARD_X[p.i] + x * CS + CS / 2;
            const py = TOP + r * CS + CS / 2;
            for (let k = 0; k < 2; k++) {
              spark(px, py, (Math.random() - 0.5) * 260, (Math.random() - 0.8) * 220, 0.6 + Math.random() * 0.3, col, 4);
            }
          }
          p.flash.push({ row: r - (lines - 1), t: 0.35 }); // where the row sat before earlier clears shifted it
          p.board.copyWithin(BW, 0, r * BW);
          p.board.fill(0, 0, BW);
          r++; // re-check the same row index after collapse
        }
        if (lines > 0) {
          p.stats.lines += lines;
          const base = lines >= 2 ? lines - 1 : 0;
          const dig = garb > 0;
          let send = dig ? Math.max(1, base * 2) : base;
          api.sfx(send > 0 ? 'score' : 'flip');
          if (dig) {
            p.stats.digs += garb;
            popup('Dig +' + send, C.gold, BOARD_X[p.i] + (BW * CS) / 2, TOP + 200);
            if (!p.cpu || !vsCpu) hint('dig', 'Dig! Clearing a garbage row sends double garbage back at your rival.');
          } else if (lines >= 2) {
            popup((lines === 3 ? 'Triple +' : 'Double +') + send, C.mint, BOARD_X[p.i] + (BW * CS) / 2, TOP + 200);
          }
          // Clears cancel your own waiting rival garbage first (pressure rows can't be cancelled).
          for (let i = 0; i < p.pending.length && send > 0; i++) {
            const e = p.pending[i];
            if (e.hole < 0) continue;
            const k = Math.min(send, e.rows);
            e.rows -= k;
            send -= k;
            if (e.rows <= 0) { p.pending.splice(i, 1); i--; }
          }
          if (send > 0) attack(p, send, dig);
        }
        // Whatever is still waiting and ready rises now.
        riseGarbage(p);
        if (p.dead) return;
        p.canHold = true;
        spawn(p);
      }

      function attack(p, rows, dig) {
        const foe = players[1 - p.i];
        p.stats.sent += rows;
        if (foe.dead) return;
        foe.pending.push({ rows, hole: U.randInt(0, BW - 1), t: WARN });
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          if (o.on) continue;
          o.on = true;
          o.x0 = BOARD_X[p.i] + (BW * CS) / 2;
          o.y0 = TOP + 240;
          o.x1 = METER_X[foe.i] + 6;
          o.y1 = TOP + BH * CS - 20;
          o.t = 0;
          o.n = rows;
          o.dig = dig;
          break;
        }
        api.sfx('shoot');
        if (!foe.cpu) hint('garbage', 'Garbage incoming! It waits on the meter by your board, then rises. Clear lines to cancel it.');
      }

      function riseGarbage(p) {
        let total = 0;
        while (p.pending.length && p.pending[0].t <= 0 && total < MAX_RISE) {
          const e = p.pending[0];
          const n = Math.min(e.rows, MAX_RISE - total);
          // Anything pushed off the top tops you out.
          for (let i = 0; i < n * BW; i++) if (p.board[i]) { p.board.fill(0, 0, n * BW); topOut(p); }
          p.board.copyWithin(0, n * BW);
          for (let r = BH - n; r < BH; r++) {
            // Rival garbage shares one gap per volley; pressure rows (hole -1) get a gap each.
            const hole = e.hole >= 0 ? e.hole : U.randInt(0, BW - 1);
            for (let x = 0; x < BW; x++) p.board[r * BW + x] = x === hole ? 0 : GARB;
          }
          total += n;
          e.rows -= n;
          if (e.rows <= 0) p.pending.shift();
          if (p.dead) break;
        }
        if (total > 0) {
          p.shake = Math.min(12, 4 + total * 2);
          api.sfx('hit');
          if (!p.cpu || !vsCpu) hint('rise', 'Garbage rose. Fill the single gap in a grey row to dig it out and send double back.');
        }
      }

      /* ---------- Bot ---------- */
      function pendingRows(p) {
        let n = 0;
        for (let i = 0; i < p.pending.length; i++) n += p.pending[i].rows;
        return n;
      }

      function makePlan(p) {
        const cfg = AI[diff];
        const pend = pendingRows(p);
        let best = -1e9;
        let second = -1e9;
        let bRot = 0;
        let bX = p.cur.x;
        let bHold = false;
        let sRot = 0;
        let sX = p.cur.x;
        let sHold = false;
        const opts = cfg.hold && p.canHold ? 2 : 1;
        for (let o = 0; o < opts; o++) {
          let kind = p.cur.kind;
          if (o === 1) {
            const alt = p.hold || pieceAt(p.seqIdx);
            if (alt.kind === kind) continue;
            kind = alt.kind;
          }
          const rots = kind === 'I' ? 2 : 4;
          for (let rot = 0; rot < rots; rot++) {
            for (let x = -1; x < BW; x++) {
              let s = evalPlacement(p.board, kind, rot, x, cfg, pend);
              if (s <= -1e8) continue;
              if (cfg.noise) s += (Math.random() - 0.5) * cfg.noise;
              if (s > best) {
                second = best; sRot = bRot; sX = bX; sHold = bHold;
                best = s; bRot = rot; bX = x; bHold = o === 1;
              } else if (s > second) {
                second = s; sRot = rot; sX = x; sHold = o === 1;
              }
            }
          }
        }
        const ai = p.ai;
        const sloppy = second > -1e8 && Math.random() < cfg.sloppy;
        ai.rot = sloppy ? sRot : bRot;
        ai.x = sloppy ? sX : bX;
        ai.hold = sloppy ? sHold : bHold;
        ai.act = cfg.step;
      }

      function aiUpdate(p, dt) {
        const ai = p.ai;
        if (!p.cur) return;
        if (!ai.planned) {
          ai.wait -= dt;
          if (ai.wait > 0) return;
          makePlan(p);
          ai.planned = true;
        }
        ai.act -= dt;
        if (ai.act > 0) return;
        ai.act = AI[diff].step;
        if (ai.hold) {
          ai.hold = false;
          const rot = ai.rot;
          const x = ai.x;
          doHold(p);
          // doHold respawned: keep the plan for the swapped-in piece.
          ai.planned = true;
          ai.rot = rot;
          ai.x = x;
          return;
        }
        const c = p.cur;
        if (c.rot !== ai.rot) {
          if (!tryRotate(p, 1)) ai.rot = c.rot;
          return;
        }
        if (c.x !== ai.x) {
          if (!tryMove(p, ai.x > c.x ? 1 : -1, 0)) ai.x = c.x;
          return;
        }
        hardDrop(p);
      }

      /* ---------- Input ---------- */
      function humanFor(code) {
        // In vs computer mode both key sets steer the left board.
        for (let i = 0; i < 2; i++) {
          const ks = KEYSETS[i];
          const owner = vsCpu ? players[0] : players[i];
          if (code === ks.left || code === ks.right || code === ks.soft || code === ks.rot ||
            code === ks.ccw || code === ks.hard || code === ks.hold) return { p: owner, ks };
        }
        return null;
      }

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        const h = humanFor(e.code);
        if (!h || h.p.cpu || h.p.dead || !h.p.cur) return;
        const p = h.p;
        const ks = h.ks;
        if (e.code === ks.left || e.code === ks.right) {
          const d = e.code === ks.left ? -1 : 1;
          if (tryMove(p, d, 0)) api.sfx('tick');
          p.das = d;
          p.dasKeys = ks;
          p.dasT = DAS;
        } else if (e.code === ks.rot) tryRotate(p, 1);
        else if (e.code === ks.ccw) tryRotate(p, -1);
        else if (e.code === ks.hard) hardDrop(p);
        else if (e.code === ks.hold) doHold(p);
      });

      function heldFor(p, which) {
        const k = api.keys;
        if (vsCpu) return k.has(KEYSETS[0][which]) || k.has(KEYSETS[1][which]);
        return k.has(KEYSETS[p.i][which]);
      }

      /* ---------- Rounds ---------- */
      function resetRound() {
        seq = [];
        roundTime = 0;
        level = 0;
        pressT = 0;
        for (let i = 0; i < 2; i++) {
          const p = players[i];
          p.board.fill(0);
          p.hold = null;
          p.canHold = true;
          p.seqIdx = 0;
          p.pending.length = 0;
          p.dead = false;
          p.das = 0;
          p.flash.length = 0;
          p.cpu = vsCpu && i === 1;
          p.cur = null;
        }
        for (let i = 0; i < PMAX; i++) parts[i].life = 0;
        for (let i = 0; i < orbs.length; i++) orbs[i].on = false;
      }

      function startRound() {
        resetRound();
        state = 'count';
        countT = 3;
        api.sfx('tick');
        api.setScore(players[0].wins + ' – ' + players[1].wins);
      }

      function startMatch(cpu, d) {
        vsCpu = cpu;
        if (d) diff = d;
        players[0].wins = 0;
        players[1].wins = 0;
        for (let i = 0; i < 2; i++) players[i].stats = { lines: 0, sent: 0, digs: 0 };
        round = 1;
        hints = {};
        startRound();
        api.setStatus(vsCpu
          ? 'You are the left board. Clear 2+ lines to send garbage; dig through garbage rows to send double.'
          : 'P1 left (WASD, Space, Q), P2 right (arrows, Enter, /). Clear 2+ lines to send garbage; digs send double.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Drop Duel',
          text: 'Clear lines to bury your rival in garbage. Dig through their garbage to send it back doubled. Best of 3.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false) },
            { label: 'vs computer', onClick: showDiffMenu }
          ]
        });
      }

      function showDiffMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'Pick how fast and clever the computer stacks.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') },
            { label: 'Back', onClick: showStartMenu }
          ]
        });
      }

      function endRound() {
        const a = players[0].dead;
        const b = players[1].dead;
        state = 'roundEnd';
        roundT = 2.4;
        if (a && b) {
          roundMsg = 'Both topped out';
          roundColor = C.gold;
          api.setStatus('Both boards topped out together. Replaying the round.');
        } else {
          const w = a ? 1 : 0;
          players[w].wins++;
          roundMsg = nameOf(w) + (vsCpu && w === 0 ? ' take' : ' takes') + ' round ' + round;
          roundColor = w === 0 ? C.p1 : C.p2;
          api.setStatus(nameOf(1 - w) + ' topped out. ' + nameOf(0) + ' ' + players[0].wins + ' – ' + players[1].wins + ' ' + nameOf(1) + '.');
          round++;
        }
        api.sfx('lose');
        api.setScore(players[0].wins + ' – ' + players[1].wins);
      }

      function afterRound() {
        const w0 = players[0].wins;
        const w1 = players[1].wins;
        if (w0 >= 2 || w1 >= 2 || round > 7) {
          state = 'over';
          const winner = w0 > w1 ? 0 : w1 > w0 ? 1 : -1;
          let title = 'Draw';
          if (winner >= 0) title = vsCpu ? (winner === 0 ? 'You win!' : 'The computer wins') : 'P' + (winner + 1) + ' wins!';
          api.sfx(winner === 1 && vsCpu ? 'lose' : 'win');
          const s0 = players[0].stats;
          const s1 = players[1].stats;
          api.menu({
            title,
            text: 'Rounds ' + w0 + ' – ' + w1 + '. ' + nameOf(0) + ': ' + s0.lines + ' lines, ' + s0.sent + ' sent, ' + s0.digs +
              ' dug. ' + nameOf(1) + ': ' + s1.lines + ' lines, ' + s1.sent + ' sent, ' + s1.digs + ' dug.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startMatch(vsCpu) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        } else {
          startRound();
        }
      }

      /* ---------- Update ---------- */
      function gravity() {
        return Math.max(0.07, 0.8 * Math.pow(0.78, level));
      }

      function updatePlayer(p, dt) {
        for (let i = 0; i < p.pending.length; i++) p.pending[i].t -= dt;
        if (p.dead || !p.cur) return;
        if (p.cpu) aiUpdate(p, dt);
        else if (p.das) {
          const ks = p.dasKeys;
          const key = p.das < 0 ? ks.left : ks.right;
          if (!api.keys.has(key)) {
            const other = p.das < 0 ? ks.right : ks.left;
            if (api.keys.has(other)) { p.das = -p.das; p.dasT = DAS; } else p.das = 0;
          } else {
            p.dasT -= dt;
            while (p.dasT <= 0 && p.cur) {
              p.dasT += ARR;
              if (!tryMove(p, p.das, 0)) { p.dasT = ARR; break; }
            }
          }
        }
        if (!p.cur || p.dead) return;
        const soft = !p.cpu && heldFor(p, 'soft');
        const g = soft ? Math.min(gravity(), 0.035) : gravity();
        p.gravT += dt;
        while (p.gravT >= g && p.cur) {
          p.gravT -= g;
          if (!tryMove(p, 0, 1)) { p.gravT = 0; break; }
        }
        if (!p.cur) return;
        if (grounded(p)) {
          p.lockT += dt;
          if (p.lockT >= LOCK) lockPiece(p);
        } else p.lockT = 0;
      }

      function update(dt) {
        time += dt;
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 500 * dt;
        }
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          if (!o.on) continue;
          o.t += dt / 0.5;
          if (o.t >= 1) {
            o.on = false;
            for (let k = 0; k < 10; k++) {
              spark(o.x1, o.y1, (Math.random() - 0.5) * 200, (Math.random() - 0.5) * 200, 0.4, o.dig ? C.gold : C.violet, 3);
            }
          }
        }
        for (let i = 0; i < pops.length; i++) pops[i].t -= dt;
        for (let k = 0; k < 2; k++) {
          const p = players[k];
          p.shake = Math.max(0, p.shake - dt * 30);
          p.bump = Math.max(0, p.bump - dt * 40);
          for (let i = p.flash.length - 1; i >= 0; i--) {
            p.flash[i].t -= dt;
            if (p.flash[i].t <= 0) p.flash.splice(i, 1);
          }
          if (p.dead) p.deadT += dt;
        }
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'play';
            api.sfx('power');
            spawn(players[0]);
            spawn(players[1]);
          } else if (Math.ceil(countT) !== prev) api.sfx('tick');
          return;
        }
        if (state === 'roundEnd') {
          roundT -= dt;
          if (roundT <= 0) afterRound();
          return;
        }
        if (state !== 'play') return;
        roundTime += dt;
        const lv = Math.floor(roundTime / SPEEDUP);
        if (lv > level) {
          level = lv;
          api.sfx('power');
          popup('Speed ' + (level + 1), C.gold, W / 2, TOP + 40);
        }
        if (roundTime > PRESSURE_AT) {
          pressT -= dt;
          if (pressT <= 0) {
            pressT = Math.max(2.5, 8 - (roundTime - PRESSURE_AT) / 15);
            const rows = 1 + Math.floor((roundTime - PRESSURE_AT) / 45);
            for (let k = 0; k < 2; k++) {
              if (!players[k].dead) players[k].pending.push({ rows, hole: -1, t: WARN });
            }
            api.sfx('shoot');
            if (!hints.pressure) {
              popup('Pressure!', C.p1, W / 2, TOP + 80);
              hint('pressure', 'Pressure: both boards now get a garbage row every few seconds. Dig it out to send double back.');
            }
          }
        }
        updatePlayer(players[0], dt);
        updatePlayer(players[1], dt);
        if (players[0].dead || players[1].dead) endRound();
      }

      /* ---------- Drawing ---------- */
      function drawPieceMini(kind, color, cx, cy, s, alpha) {
        const cells = SHAPES[kind][0];
        let minX = 9;
        let maxX = -9;
        let minY = 9;
        let maxY = -9;
        for (let i = 0; i < 3; i++) {
          minX = Math.min(minX, cells[i][0]); maxX = Math.max(maxX, cells[i][0]);
          minY = Math.min(minY, cells[i][1]); maxY = Math.max(maxY, cells[i][1]);
        }
        const ox = cx - ((maxX - minX + 1) * s) / 2 - minX * s;
        const oy = cy - ((maxY - minY + 1) * s) / 2 - minY * s;
        for (let i = 0; i < 3; i++) drawGem(ctx, ox + cells[i][0] * s, oy + cells[i][1] * s, s, color, alpha);
      }

      function drawPlayer(p) {
        const bx = BOARD_X[p.i];
        const sx = p.shake > 0 ? (Math.random() - 0.5) * p.shake : 0;
        const sy = (p.shake > 0 ? (Math.random() - 0.5) * p.shake : 0) + p.bump;
        const pc = p.i === 0 ? C.p1 : C.p2;
        ctx.save();
        ctx.translate(sx, sy);
        // Board frame.
        let maxH = 0;
        for (let r = 0; r < BH; r++) {
          let any = false;
          for (let x = 0; x < BW; x++) if (p.board[r * BW + x]) { any = true; break; }
          if (any) { maxH = BH - r; break; }
        }
        const danger = maxH >= 12 && !p.dead && state === 'play';
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, bx - 6, TOP - 6, BW * CS + 12, BH * CS + 12, 10);
        ctx.fill();
        ctx.strokeStyle = danger && Math.sin(time * 12) > 0 ? C.p1 : U.alpha(pc, 0.55);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = U.alpha(C.ink, 0.7);
        ctx.fillRect(bx, TOP, BW * CS, BH * CS);
        ctx.fillStyle = U.alpha(C.line, 0.5);
        for (let x = 1; x < BW; x++) {
          for (let r = 1; r < BH; r++) ctx.fillRect(bx + x * CS - 1, TOP + r * CS - 1, 2, 2);
        }
        // Cells.
        for (let r = 0; r < BH; r++) {
          for (let x = 0; x < BW; x++) {
            const v = p.board[r * BW + x];
            if (v) drawGem(ctx, bx + x * CS, TOP + r * CS, CS, p.dead ? GARB : v);
          }
        }
        // Clear flashes.
        for (let i = 0; i < p.flash.length; i++) {
          const f = p.flash[i];
          ctx.fillStyle = U.alpha('#FFFFFF', (f.t / 0.35) * 0.7);
          const r = Math.min(BH - 1, f.row);
          ctx.fillRect(bx, TOP + r * CS, BW * CS, CS);
        }
        // Ghost and active piece.
        const c = p.cur;
        if (c && !p.dead && state === 'play') {
          const gy = ghostY(p);
          const cells = SHAPES[c.kind][c.rot];
          ctx.strokeStyle = U.alpha(GEM_BASE[c.color], 0.7);
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const y = gy + cells[i][1];
            if (y < 0) continue;
            U.roundRect(ctx, bx + (c.x + cells[i][0]) * CS + 3, TOP + y * CS + 3, CS - 6, CS - 6, 6);
            ctx.stroke();
          }
          const lockFade = p.lockT > 0 ? 1 - (p.lockT / LOCK) * 0.35 : 1;
          for (let i = 0; i < 3; i++) {
            const y = c.y + cells[i][1];
            if (y < 0) continue;
            drawGem(ctx, bx + (c.x + cells[i][0]) * CS, TOP + y * CS, CS, c.color, lockFade);
          }
        }
        // Garbage meter.
        const mx = METER_X[p.i];
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, mx, TOP, 12, BH * CS, 5);
        ctx.fill();
        let yy = TOP + BH * CS;
        for (let i = 0; i < p.pending.length; i++) {
          const e = p.pending[i];
          const hgt = Math.min(e.rows * CS, yy - TOP);
          if (hgt <= 0) break;
          const ready = e.t <= 0;
          ctx.fillStyle = ready ? (Math.sin(time * 16) > 0 ? C.p1 : '#FF9AA8') : C.gold;
          ctx.fillRect(mx + 2, yy - hgt + 2, 8, hgt - 3);
          if (!ready) {
            ctx.fillStyle = U.alpha(C.ink, 0.55);
            ctx.fillRect(mx + 2, yy - hgt + 2, 8, (hgt - 3) * Math.max(0, e.t / WARN));
          }
          yy -= hgt;
        }
        const pend = pendingRows(p);
        if (pend > 0) {
          ctx.font = SMALL;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = C.gold;
          ctx.fillText('+' + pend, mx + 6, yy - 4);
        }
        // Next queue and hold.
        const nx = NEXT_X[p.i];
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        U.roundRect(ctx, nx, TOP, 76, 210, 10);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.muted;
        ctx.fillText('NEXT', nx + 38, TOP + 8);
        if (state !== 'menu') {
          for (let k = 0; k < 3; k++) {
            const pc2 = pieceAt(p.seqIdx + k);
            drawPieceMini(pc2.kind, pc2.color, nx + 38, TOP + 56 + k * 56, k === 0 ? 20 : 16, k === 0 ? 1 : 0.75);
          }
        }
        const hx = HOLD_X[p.i];
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        U.roundRect(ctx, hx, TOP, 76, 90, 10);
        ctx.fill();
        ctx.fillStyle = C.muted;
        ctx.fillText('HOLD', hx + 38, TOP + 8);
        if (p.hold) drawPieceMini(p.hold.kind, p.hold.color, hx + 38, TOP + 55, 18, p.canHold ? 1 : 0.35);
        // Stats.
        ctx.textAlign = 'center';
        ctx.fillStyle = C.muted;
        ctx.fillText('LINES', hx + 38, TOP + 110);
        ctx.fillText('SENT', hx + 38, TOP + 160);
        ctx.fillText('DUG', hx + 38, TOP + 210);
        ctx.font = HUD;
        ctx.fillStyle = C.text;
        ctx.fillText(String(p.stats.lines), hx + 38, TOP + 126);
        ctx.fillStyle = C.violet;
        ctx.fillText(String(p.stats.sent), hx + 38, TOP + 176);
        ctx.fillStyle = C.gold;
        ctx.fillText(String(p.stats.digs), hx + 38, TOP + 226);
        // Topped-out overlay.
        if (p.dead) {
          ctx.fillStyle = U.alpha(C.ink, Math.min(0.7, p.deadT));
          ctx.fillRect(bx, TOP, BW * CS, BH * CS);
          ctx.font = '800 26px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.p1;
          ctx.fillText('Topped out', bx + (BW * CS) / 2, TOP + (BH * CS) / 2);
        }
        ctx.restore();
        // Name plate.
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = p.i === 0 ? 'left' : 'right';
        ctx.fillStyle = pc;
        const label = nameOf(p.i) + (p.cpu ? ' · ' + diff : '');
        ctx.fillText(label, p.i === 0 ? bx : bx + BW * CS, TOP - 26);
        // Round pips.
        for (let k = 0; k < 2; k++) {
          const px = p.i === 0 ? bx + BW * CS - 10 - k * 18 : bx + 10 + k * 18;
          ctx.beginPath();
          ctx.arc(px, TOP - 26, 6, 0, Math.PI * 2);
          ctx.fillStyle = p.wins > k ? pc : C.panel2;
          ctx.fill();
          ctx.strokeStyle = U.alpha(pc, 0.6);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.violet, 0.05);
        ctx.fillRect(W / 2 - 34, 0, 68, H);
        drawPlayer(players[0]);
        drawPlayer(players[1]);
        // Center info.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = HUD;
        ctx.fillStyle = C.text;
        ctx.fillText('Round ' + Math.min(round, 7), W / 2, 26);
        ctx.font = SMALL;
        const pressure = state === 'play' && roundTime > PRESSURE_AT;
        ctx.fillStyle = pressure ? C.p1 : C.gold;
        ctx.fillText(pressure ? 'Pressure' : 'Speed ' + (level + 1), W / 2, 50);
        const prog = state === 'play' ? (roundTime % SPEEDUP) / SPEEDUP : 0;
        ctx.fillStyle = C.panel2;
        ctx.fillRect(W / 2 - 26, 62, 52, 4);
        ctx.fillStyle = C.gold;
        ctx.fillRect(W / 2 - 26, 62, 52 * prog, 4);
        // Orbs.
        for (let i = 0; i < orbs.length; i++) {
          const o = orbs[i];
          if (!o.on) continue;
          const e = o.t * o.t * (3 - 2 * o.t);
          const x = o.x0 + (o.x1 - o.x0) * e;
          const y = o.y0 + (o.y1 - o.y0) * e - Math.sin(o.t * Math.PI) * 140;
          const col = o.dig ? C.gold : C.violet;
          ctx.fillStyle = U.alpha(col, 0.3);
          ctx.beginPath();
          ctx.arc(x, y, 14 + o.n * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(x, y, 8 + o.n, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.font = SMALL;
          ctx.fillText(String(o.n), x, y + 1);
        }
        // Particles.
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.4);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        // Popups.
        for (let i = 0; i < pops.length; i++) {
          const pp = pops[i];
          if (pp.t <= 0) continue;
          ctx.globalAlpha = Math.min(1, pp.t * 2);
          ctx.font = '800 24px Unbounded, sans-serif';
          ctx.fillStyle = pp.color;
          ctx.fillText(pp.text, pp.x, pp.y - (1.2 - pp.t) * 30);
        }
        ctx.globalAlpha = 1;
        // Announcements.
        if (state === 'count') {
          ctx.font = BIG;
          ctx.fillStyle = C.text;
          ctx.fillText(String(Math.max(1, Math.ceil(countT))), W / 2, H / 2);
          ctx.font = HUD;
          ctx.fillStyle = C.muted;
          ctx.fillText('Round ' + round, W / 2, H / 2 + 44);
        } else if (state === 'roundEnd') {
          ctx.font = '800 30px Unbounded, sans-serif';
          ctx.fillStyle = 'rgba(15,13,36,0.75)';
          ctx.fillRect(0, H / 2 - 40, W, 80);
          ctx.fillStyle = roundColor;
          ctx.fillText(roundMsg, W / 2, H / 2);
        }
        ctx.font = SMALL;
        ctx.fillStyle = U.alpha(C.muted, 0.8);
        ctx.textBaseline = 'middle';
        if (state === 'play' && roundTime < 8) {
          ctx.fillText(vsCpu ? 'A/D or ←/→ move · W/↑ rotate · S/↓ soft · Space/Enter drop · Q or / hold'
            : 'P1: A D move, W rotate, S soft, Space drop, Q hold   ·   P2: ← → move, ↑ rotate, ↓ soft, Enter drop, / hold', W / 2, H - 16);
        }
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
