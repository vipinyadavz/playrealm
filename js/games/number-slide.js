/* Number Slide — slide a 4×4 board and merge equal numbers. Every 12 moves a block
   of ice drops onto an empty cell; merges right beside it crack and thaw it.
   See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 780;
  const H = 540;
  const N = 4;
  const GAP = 12;
  const CELL = 108;
  const BOARD = N * CELL + (N + 1) * GAP;
  const BX = 24;
  const BY = Math.round((H - BOARD) / 2);
  const PX = BX + BOARD + 24;
  const PW = W - PX - 24;
  const SLIDE = 0.12;   // seconds for a slide
  const POP = 0.18;     // seconds for spawn / merge pop
  const DROP = 0.28;    // seconds for an ice block to fall in
  const UNDO_COST = 50;
  const UNDO_MAX = 3;
  const THAW_AT = 2;    // cracks needed to thaw
  const WIN_TILE = 2048;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const MODES = [
    { name: 'Normal', every: 12 },
    { name: 'Deep freeze', every: 8 }
  ];
  const DIRS = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down'
  };
  const ICE_HI = '#E6FAFF';
  const ICE_MID = '#A7E2F8';
  const ICE_LO = '#7CCDEE';
  const ICE_LIP = '#4E93B4';
  const RAMP = {
    2: ['#332D6E', '#F3F0FF'],
    4: ['#4A3F9A', '#F3F0FF'],
    8: ['#36C9F0', '#0F0D24'],
    16: ['#33D3C2', '#0F0D24'],
    32: ['#4BE3A0', '#0F0D24'],
    64: ['#A6E35A', '#0F0D24'],
    128: ['#FFC53D', '#0F0D24'],
    256: ['#FF9F43', '#0F0D24'],
    512: ['#FF5D73', '#0F0D24'],
    1024: ['#E9508F', '#FFFFFF'],
    2048: ['#9B7BFF', '#FFFFFF'],
    4096: ['#F3F0FF', '#0F0D24']
  };
  const CRACK_A = [[0.16, 0.06], [0.36, 0.3], [0.28, 0.47], [0.54, 0.6], [0.47, 0.78], [0.66, 0.95]];
  const CRACK_B = [[0.36, 0.3], [0.6, 0.27], [0.8, 0.4], [0.94, 0.36]];
  const CRACK_C = [[0.54, 0.6], [0.78, 0.68], [0.86, 0.9]];

  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  const backOut = (k) => {
    const s = 1.70158;
    const q = k - 1;
    return 1 + q * q * ((s + 1) * q + s);
  };

  function tileColors(v) {
    return RAMP[v] || RAMP[4096];
  }

  /* ---------- Drawing helpers (shared by the game and the card art) ---------- */

  function drawTile(ctx, x, y, s, v, k) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const ss = s * k;
    if (ss < 1) return;
    const [bg, fg] = tileColors(v);
    const r = ss * 0.16;
    ctx.fillStyle = 'rgba(5,4,16,.45)';
    U.roundRect(ctx, cx - ss / 2, cy - ss / 2 + s * 0.05, ss, ss, r);
    ctx.fill();
    if (v >= 2048) {
      ctx.shadowColor = bg;
      ctx.shadowBlur = s * 0.25;
    }
    ctx.fillStyle = bg;
    U.roundRect(ctx, cx - ss / 2, cy - ss / 2, ss, ss, r);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,.16)';
    U.roundRect(ctx, cx - ss * 0.4, cy - ss * 0.43, ss * 0.8, ss * 0.14, ss * 0.07);
    ctx.fill();
    const str = String(v);
    const f = str.length <= 2 ? 0.42 : str.length === 3 ? 0.34 : str.length === 4 ? 0.27 : 0.21;
    const fs = Math.max(6, Math.round(s * f * k));
    ctx.font = '700 ' + fs + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(str, cx, cy + fs * 0.06);
  }

  function drawSnowflake(ctx, cx, cy, r, color, lw) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 2;
      const ex = cx + Math.cos(a) * r;
      const ey = cy + Math.sin(a) * r;
      ctx.moveTo(cx, cy);
      ctx.lineTo(ex, ey);
      const bx = cx + Math.cos(a) * r * 0.58;
      const by = cy + Math.sin(a) * r * 0.58;
      for (const side of [-1, 1]) {
        const b = a + side * 0.75;
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + Math.cos(b) * r * 0.32, by + Math.sin(b) * r * 0.32);
      }
    }
    ctx.stroke();
  }

  function crackPath(ctx, L, T, ss, pts) {
    ctx.moveTo(L + pts[0][0] * ss, T + pts[0][1] * ss);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(L + pts[i][0] * ss, T + pts[i][1] * ss);
  }

  /* Ice block. cracks: 0, 1 or 2 (2 = about to shatter). */
  function drawIce(ctx, x, y, s, cracks, k, alpha) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    const ss = s * k;
    if (ss < 1) return;
    const L = cx - ss / 2;
    const T = cy - ss / 2;
    const r = ss * 0.16;
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = ICE_LIP;
    U.roundRect(ctx, L, T + s * 0.05, ss, ss, r);
    ctx.fill();
    const g = ctx.createLinearGradient(L, T, L + ss, T + ss);
    g.addColorStop(0, ICE_HI);
    g.addColorStop(0.55, ICE_MID);
    g.addColorStop(1, ICE_LO);
    ctx.fillStyle = g;
    U.roundRect(ctx, L, T, ss, ss, r);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath();
    ctx.moveTo(L + ss * 0.12, T + ss * 0.1);
    ctx.lineTo(L + ss * 0.56, T + ss * 0.1);
    ctx.lineTo(L + ss * 0.1, T + ss * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.2)';
    ctx.beginPath();
    ctx.moveTo(L + ss * 0.9, T + ss * 0.5);
    ctx.lineTo(L + ss * 0.9, T + ss * 0.9);
    ctx.lineTo(L + ss * 0.48, T + ss * 0.9);
    ctx.closePath();
    ctx.fill();
    drawSnowflake(ctx, cx, cy, ss * 0.23, 'rgba(36,104,140,.5)', Math.max(1.2, ss * 0.03));
    if (cracks >= 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      crackPath(ctx, L, T, ss, CRACK_A);
      crackPath(ctx, L, T, ss, CRACK_B);
      if (cracks >= 2) crackPath(ctx, L, T, ss, CRACK_C);
      ctx.strokeStyle = 'rgba(18,58,84,.8)';
      ctx.lineWidth = Math.max(1.5, ss * 0.035);
      ctx.stroke();
      ctx.save();
      ctx.translate(ss * 0.015, ss * 0.015);
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = Math.max(1, ss * 0.014);
      ctx.stroke();
      ctx.restore();
    }
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = Math.max(1, ss * 0.02);
    U.roundRect(ctx, L + 1, T + 1, ss - 2, ss - 2, r);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /* ---------- Board logic ---------- */

  /* Cells of one line, ordered from the front (the side tiles slide toward) to the back. */
  function lineCells(dir, k) {
    const out = [];
    for (let i = 0; i < N; i++) {
      if (dir === 'left') out.push([i, k]);
      else if (dir === 'right') out.push([N - 1 - i, k]);
      else if (dir === 'up') out.push([k, i]);
      else out.push([k, N - 1 - i]);
    }
    return out;
  }

  /* Works out a slide without changing anything. Ice acts as a wall that splits a line
     into segments; each segment slides and merges on its own. */
  function plan(grid, dir) {
    const steps = [];
    let moved = false;
    for (let k = 0; k < N; k++) {
      const cells = lineCells(dir, k);
      let slot = 0;
      let last = null;
      for (let i = 0; i < N; i++) {
        const [x, y] = cells[i];
        const t = grid[y][x];
        if (!t) continue;
        if (t.ice) {
          slot = i + 1;
          last = null;
          continue;
        }
        if (last && !last.merged && last.tile.v === t.v) {
          const [tx, ty] = cells[last.idx];
          steps.push({ tile: t, tx, ty, into: last.tile });
          last.merged = true;
          moved = true;
        } else {
          const [tx, ty] = cells[slot];
          steps.push({ tile: t, tx, ty, into: null });
          if (tx !== x || ty !== y) moved = true;
          last = { idx: slot, tile: t, merged: false };
          slot++;
        }
      }
    }
    return { moved, steps };
  }

  /* ---------- Card art ---------- */

  const THUMB = [
    [2, 8, 0, 4],
    [16, -1, 32, 2],
    [64, 128, 0, 8],
    [4, 2, 16, 0]
  ];

  Arcade.register({
    id: 'number-slide',
    title: 'Number Slide',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    color: C.gold,
    tagline: 'Slide the board and merge matching numbers into bigger ones.',
    hook: 'Every 12 moves a frozen tile drops in, and only a merge right beside it thaws it.',
    tags: ['puzzle', 'numbers', 'merge', 'slide', 'math', 'ice', 'keyboard', 'touch'],
    howTo: 'Slide every tile at once with the arrow keys, WASD or a swipe. Two equal numbers that bump together merge ' +
      'into their sum, and the merged value is added to your score. A new 2 or 4 appears after each move. ' +
      'The twist: every 12 moves a block of ice lands on the frosted cell. Ice never slides, so tiles stop against it ' +
      'like a wall. Each merge in a cell right next to the ice cracks it, and two cracks thaw it into a free small tile. ' +
      'Reach 2048 to win, then keep going if you like. You get 3 undos per game, each costing 50 points.',
    controls: [
      { keys: ['↑', '↓', '←', '→'], label: 'Slide' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Slide' },
      { keys: ['Swipe'], label: 'Slide on a touch screen' },
      { keys: ['Z', 'Backspace'], label: 'Undo one move (−50 points, 3 per game)' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const size = Math.min(h - 20, w * 0.6);
      const gap = size * 0.03;
      const s = (size - gap * 5) / 4;
      const bx = 16;
      const by = (h - size) / 2;
      ctx.fillStyle = C.panel;
      U.roundRect(ctx, bx, by, size, size, 12);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // A 16 slides into the 16 beside the ice every few seconds, then pops into 32.
      const cyc = t % 3;
      const slideK = cyc < 0.5 ? 0 : cyc < 0.75 ? easeOut((cyc - 0.5) / 0.25) : 1;
      const merged = cyc >= 0.75 || t === 0;
      for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
          const px = bx + gap + x * (s + gap);
          const py = by + gap + y * (s + gap);
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          U.roundRect(ctx, px, py, s, s, s * 0.14);
          ctx.fill();
          const v = THUMB[y][x];
          if (v === -1) drawIce(ctx, px, py, s, merged ? 1 : 0, 1);
          else if (v > 0 && !(x === 2 && y === 1)) drawTile(ctx, px, py, s, v, 1);
        }
      }
      // The merge cell (2,1) next to the ice.
      const mx = bx + gap + 2 * (s + gap);
      const my = by + gap + 1 * (s + gap);
      if (merged) {
        const pk = t === 0 ? 1 : Math.min(1, (cyc - 0.75) / 0.2);
        drawTile(ctx, mx, my, s, 32, 1 + Math.sin(pk * Math.PI) * 0.15);
        ctx.strokeStyle = U.alpha(ICE_HI, 0.8);
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        U.roundRect(ctx, mx - s - gap - 3, my - 3, s * 2 + gap + 6, s + 6, s * 0.2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        drawTile(ctx, mx, my, s, 16, 1);
        drawTile(ctx, mx + (1 - slideK) * (s + gap), my, s, 16, 1);
      }
      // Side column: falling ice and the countdown.
      const rx = bx + size + 20;
      const rw = w - rx - 14;
      const bob = Math.sin(t * 2.2) * 4;
      const iceS = Math.min(rw * 0.62, 70);
      drawIce(ctx, rx + (rw - iceS) / 2, by + 14 + bob, iceS, 0, 1);
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ICE_HI;
      ctx.fillText('ice in 3', rx + rw / 2, by + iceS + 40);
      const pips = 12;
      const filled = 9;
      const pr = Math.min(5, rw / 16);
      for (let i = 0; i < pips; i++) {
        const col = i % 6;
        const row = (i / 6) | 0;
        const px = rx + rw / 2 + (col - 2.5) * pr * 2.6;
        const py = by + iceS + 64 + row * pr * 2.8;
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, Math.PI * 2);
        if (i < filled) {
          ctx.fillStyle = i === filled - 1 ? ICE_HI : ICE_LO;
          ctx.fill();
        } else {
          ctx.strokeStyle = U.alpha(ICE_MID, 0.5);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const undoBtn = { x: PX, y: 380, w: PW, h: 62 };

      let state = 'menu'; // 'menu' | 'play' | 'wait' | 'over'
      let mode = MODES[0];
      let tiles = [];
      let nextId = 1;
      let score = 0;
      let penalty = 0;
      let moves = 0;
      let undosLeft = UNDO_MAX;
      let snap = null;
      let bestTile = 2;
      let won = false;
      let iceTarget = null;
      let icePending = false;
      let thawed = 0;
      let clock = 0;
      let movedAt = -10;
      let shownScore = 0;
      let particles = [];
      let floaters = [];
      let flash = null;
      let shake = 0;
      let bumpX = 0;
      let bumpY = 0;
      let pending = null;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      let lastScore = null;
      let swipe = null;
      let hoverUndo = false;
      let tileBump = 0;
      const told = {};

      const cellX = (gx) => BX + GAP + gx * (CELL + GAP);
      const cellY = (gy) => BY + GAP + gy * (CELL + GAP);
      const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      const currentScore = () => Math.max(0, score - penalty);
      const movesToIce = () => (icePending ? 0 : mode.every - (moves % mode.every));

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function mkTile(x, y, v) {
        return {
          id: nextId++, v, prevV: v, ice: false, cracks: 0, x, y, fx: x, fy: y,
          bornAt: -10, popAt: -10, dead: false,
          crackAt: 0, crackFx: true, thawAt: 0, thawFx: true, dropAt: -10, dropFx: true
        };
      }

      function grid() {
        const g = [];
        for (let y = 0; y < N; y++) g.push([null, null, null, null]);
        for (const t of tiles) if (!t.dead) g[t.y][t.x] = t;
        return g;
      }

      function emptyCells(g) {
        const out = [];
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) if (!g[y][x]) out.push({ x, y });
        }
        return out;
      }

      function canMove() {
        const g = grid();
        return Object.keys(DIRS).some((d) => plan(g, d).moved);
      }

      function spawnTile(at) {
        let cells = emptyCells(grid());
        if (iceTarget && cells.length > 1) {
          cells = cells.filter((c) => c.x !== iceTarget.x || c.y !== iceTarget.y);
        }
        if (!cells.length) return null;
        const c = U.pick(cells);
        const t = mkTile(c.x, c.y, Math.random() < 0.9 ? 2 : 4);
        t.bornAt = at;
        tiles.push(t);
        return t;
      }

      function dropIce(at) {
        const g = grid();
        let cell = iceTarget && !g[iceTarget.y][iceTarget.x] ? iceTarget : null;
        if (!cell) {
          const e = emptyCells(g);
          if (!e.length) return false;
          cell = U.pick(e);
        }
        const t = mkTile(cell.x, cell.y, 0);
        t.ice = true;
        t.dropAt = at;
        t.dropFx = false;
        tiles.push(t);
        icePending = false;
        iceTarget = null;
        if (!told.ice) {
          told.ice = true;
          setHint('Ice landed! It blocks slides like a wall. Merge two tiles right beside it twice to thaw it.', 9);
        }
        return true;
      }

      function updateIceTarget() {
        const left = movesToIce();
        if (left > 3) {
          iceTarget = null;
          return;
        }
        const g = grid();
        if (iceTarget && !g[iceTarget.y][iceTarget.x]) return;
        const e = emptyCells(g);
        iceTarget = e.length ? Object.assign(U.pick(e), { since: clock }) : null;
        if (iceTarget && !told.frost && left > 0) {
          told.frost = true;
          setHint('Frost is forming on the glowing cell. Ice lands there in ' + left +
            ' move' + (left === 1 ? '' : 's') + ', so plan around it.', 7);
        }
      }

      function refreshScore() {
        const s = currentScore();
        if (s !== lastScore) {
          api.setScore(s);
          lastScore = s;
        }
      }

      function newGame(m) {
        mode = m;
        tiles = [];
        nextId = 1;
        score = 0;
        penalty = 0;
        moves = 0;
        undosLeft = UNDO_MAX;
        snap = null;
        bestTile = 2;
        won = false;
        iceTarget = null;
        icePending = false;
        thawed = 0;
        movedAt = -10;
        shownScore = 0;
        particles = [];
        floaters = [];
        flash = null;
        shake = 0;
        pending = null;
        lastScore = null;
        lastStatus = '';
        spawnTile(clock);
        spawnTile(clock + 0.08);
        for (const t of tiles) if (t.v > bestTile) bestTile = t.v;
        state = 'play';
        setHint('Slide with the arrow keys, WASD or a swipe. Ice drops in every ' + mode.every + ' moves.', 6);
        refreshScore();
      }

      function showStart() {
        state = 'menu';
        api.menu({
          title: 'Number Slide',
          text: 'Merge equal numbers by sliding the whole board. Every few moves a block of ice drops in: ' +
            'merge right beside it twice to thaw it.',
          buttons: [
            { label: 'Normal: ice every 12', primary: true, onClick: () => newGame(MODES[0]) },
            { label: 'Deep freeze: ice every 8', onClick: () => newGame(MODES[1]) }
          ]
        });
      }

      function burst(x, y, n, colors, speed, shard) {
        for (let k = 0; k < n && particles.length < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3,
            life: U.rand(0.45, 0.9), size: U.rand(3, shard ? 9 : 5), color: U.pick(colors),
            rot: Math.random() * 6, vr: U.rand(-8, 8), shard: !!shard
          });
        }
      }

      function settle() {
        tiles = tiles.filter((t) => !t.dead);
        for (const t of tiles) {
          t.fx = t.x;
          t.fy = t.y;
        }
        movedAt = -10;
      }

      function snapshot() {
        return {
          tiles: tiles.filter((t) => !t.dead).map((t) => ({ v: t.v, ice: t.ice, cracks: t.cracks, x: t.x, y: t.y })),
          score, moves, icePending, bestTile, thawed, won,
          iceTarget: iceTarget ? { x: iceTarget.x, y: iceTarget.y, since: iceTarget.since } : null
        };
      }

      function undo() {
        if (state !== 'play') return;
        if (undosLeft <= 0) {
          setHint('No undos left in this game.', 3);
          api.sfx('tick');
          return;
        }
        if (!snap) {
          setHint('Undo steps back one move, and only once in a row.', 3);
          api.sfx('tick');
          return;
        }
        const s = snap;
        snap = null;
        settle();
        tiles = s.tiles.map((o) => {
          const t = mkTile(o.x, o.y, o.v);
          t.ice = o.ice;
          t.cracks = o.cracks;
          return t;
        });
        score = s.score;
        moves = s.moves;
        icePending = s.icePending;
        bestTile = s.bestTile;
        thawed = s.thawed;
        won = s.won;
        iceTarget = s.iceTarget;
        penalty += UNDO_COST;
        undosLeft--;
        flash = { color: C.violet, a: 0.35 };
        api.sfx('flip');
        setHint('Stepped back one move for ' + UNDO_COST + ' points. ' +
          (undosLeft ? undosLeft + ' undo' + (undosLeft === 1 ? '' : 's') + ' left.' : 'That was your last undo.'), 4);
        refreshScore();
      }

      function move(dir) {
        if (state !== 'play') return;
        settle();
        const p = plan(grid(), dir);
        if (!p.moved) {
          bumpX = DIRS[dir][0] * 7;
          bumpY = DIRS[dir][1] * 7;
          api.sfx('tick');
          return;
        }
        snap = snapshot();
        movedAt = clock;
        const land = clock + SLIDE;
        let gained = 0;
        let biggest = 0;
        for (const s of p.steps) {
          const t = s.tile;
          t.fx = t.x;
          t.fy = t.y;
          t.x = s.tx;
          t.y = s.ty;
          if (s.into) {
            t.dead = true;
            s.into.prevV = s.into.v;
            s.into.v *= 2;
            s.into.popAt = land;
            gained += s.into.v;
            biggest = Math.max(biggest, s.into.v);
            floaters.push({ x: cellX(s.tx) + CELL / 2, y: cellY(s.ty) + CELL / 2, text: '+' + s.into.v, t: -SLIDE, color: C.gold });
          }
        }

        // Merges crack any ice block right beside them.
        const g = grid();
        const hit = new Map();
        for (const s of p.steps) {
          if (!s.into) continue;
          for (const [dx, dy] of ORTH) {
            const nx = s.tx + dx;
            const ny = s.ty + dy;
            if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
            const o = g[ny][nx];
            if (o && o.ice) {
              o.cracks++;
              o.crackAt = land;
              o.crackFx = false;
              hit.set(o.id, o);
            }
          }
        }
        for (const o of hit.values()) {
          if (o.cracks < THAW_AT) continue;
          o.ice = false;
          o.v = U.pick([2, 2, 2, 4, 4, 8]);
          o.prevV = o.v;
          o.crackFx = true;
          o.thawAt = land + 0.08;
          o.thawFx = false;
          thawed++;
        }

        score += gained;
        moves++;
        if (gained) {
          api.sfx(biggest >= 128 ? 'score' : 'blip');
          tileBump = 1;
        }
        if (moves % mode.every === 0) icePending = true;
        if (icePending) dropIce(land + 0.06);
        spawnTile(land);
        updateIceTarget();
        for (const t of tiles) if (!t.dead && !t.ice && t.v > bestTile) bestTile = t.v;
        refreshScore();

        if (!won && bestTile >= WIN_TILE) {
          won = true;
          state = 'wait';
          pending = { at: clock + 0.6, fn: showWin };
        } else if (!canMove()) {
          state = 'wait';
          pending = { at: clock + 0.9, fn: showOver };
        }
      }

      function showWin() {
        state = 'over';
        api.sfx('win');
        for (let n = 0; n < 6; n++) {
          burst(U.rand(BX, BX + BOARD), U.rand(BY, BY + BOARD * 0.5), 20, [C.violet, C.gold, C.p2, C.mint, C.p1], 320);
        }
        api.menu({
          title: WIN_TILE + ' reached!',
          text: 'You built the ' + WIN_TILE + ' tile with ' + currentScore() + ' points. Keep sliding for a bigger score?',
          buttons: [
            { label: 'Keep going', primary: true, onClick: () => {
              state = 'play';
              if (!canMove()) showOver();
            } },
            { label: 'End run here', onClick: showOver }
          ]
        });
      }

      function showOver() {
        state = 'over';
        const final = currentScore();
        const isBest = api.reportScore(final);
        api.sfx(isBest ? 'win' : 'lose');
        flash = { color: isBest ? C.gold : C.p1, a: 0.35 };
        const text = 'Score ' + final + ' · best tile ' + bestTile + ' · ice thawed ' + thawed + '.';
        api.setStatus(text);
        lastStatus = text;
        const buttons = [
          { label: 'Play again', primary: true, onClick: () => newGame(mode) },
          { label: 'Change difficulty', onClick: showStart }
        ];
        if (snap && undosLeft > 0) {
          buttons.push({ label: 'Undo last move (−' + UNDO_COST + ')', onClick: () => {
            state = 'play';
            undo();
          } });
        }
        api.menu({ title: isBest ? 'New best: ' + final + '!' : canMove() ? 'Run ended' : 'Out of moves', text, buttons });
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        const d = KEYMAP[e.code];
        if (d) move(d);
        else if (e.code === 'KeyZ' || e.code === 'Backspace') undo();
      });

      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        swipe = { x: p.x, y: p.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      });
      api.on(canvas, 'pointermove', (e) => {
        hoverUndo = inRect(api.toCanvas(e, canvas), undoBtn);
      });
      api.on(canvas, 'pointerup', (e) => {
        const start = swipe;
        swipe = null;
        if (!start || state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 28) {
          move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
        } else if (inRect(start, undoBtn) && inRect(p, undoBtn)) {
          undo();
        }
      });
      api.on(canvas, 'pointercancel', () => { swipe = null; });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        hintT = Math.max(0, hintT - dt);
        shake = Math.max(0, shake - dt * 30);
        const damp = Math.pow(0.0005, dt);
        bumpX *= damp;
        bumpY *= damp;
        tileBump = Math.max(0, tileBump - dt * 4);
        if (flash) {
          flash.a -= dt * 1.4;
          if (flash.a <= 0) flash = null;
        }
        shownScore += (currentScore() - shownScore) * Math.min(1, dt * 12);
        if (Math.abs(currentScore() - shownScore) < 0.5) shownScore = currentScore();

        for (const t of tiles) {
          const cx = cellX(t.x) + CELL / 2;
          const cy = cellY(t.y) + CELL / 2;
          if (!t.dropFx && clock >= t.dropAt + DROP) {
            t.dropFx = true;
            shake = 7;
            burst(cx, cy + CELL * 0.4, 18, [ICE_HI, ICE_MID, '#FFFFFF'], 180, false);
            api.sfx('boom');
          }
          if (!t.crackFx && clock >= t.crackAt) {
            t.crackFx = true;
            shake = Math.max(shake, 4);
            burst(cx, cy, 8, [ICE_HI, ICE_MID], 140, true);
            api.sfx('hit');
            if (!told.crack) {
              told.crack = true;
              setHint('Crack! One more merge right beside that ice and it thaws into a free tile.', 7);
            }
          }
          if (!t.thawFx && clock >= t.thawAt) {
            t.thawFx = true;
            shake = Math.max(shake, 8);
            burst(cx, cy, 28, [ICE_HI, ICE_MID, ICE_LO, '#FFFFFF'], 300, true);
            floaters.push({ x: cx, y: cy - CELL * 0.2, text: 'Thawed!', t: 0, color: ICE_HI });
            api.sfx('power');
            if (!told.thaw) {
              told.thaw = true;
              setHint('Thawed! The ice melted into ' + (t.v === 8 ? 'an ' : 'a ') + t.v + '. Keep merging next to ice to clear it.', 6);
            }
          }
        }
        if (movedAt > -10 && clock > movedAt + SLIDE) {
          if (tiles.some((t) => t.dead)) tiles = tiles.filter((t) => !t.dead);
        }

        for (const p of particles) {
          p.vy += 520 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 0.9);

        if (pending && clock >= pending.at) {
          const fn = pending.fn;
          pending = null;
          fn();
        }

        if (state === 'play' || state === 'wait') {
          const left = movesToIce();
          const info = hintT > 0 ? hint
            : mode.name + ' · Moves ' + moves + ' · ' +
              (left === 0 ? 'Ice is waiting for a free cell' : 'Ice in ' + left) +
              ' · Undos ' + undosLeft + '/' + UNDO_MAX;
          if (info !== lastStatus) {
            api.setStatus(info);
            lastStatus = info;
          }
        }
      }

      /* ---------- Draw ---------- */

      function drawFrost() {
        if (!iceTarget || (state !== 'play' && state !== 'wait')) return;
        const left = movesToIce();
        const x = cellX(iceTarget.x);
        const y = cellY(iceTarget.y);
        const strength = U.clamp((4 - left) / 3, 0.2, 1);
        const pulse = 0.5 + 0.5 * Math.sin(clock * 5);
        ctx.fillStyle = U.alpha(ICE_MID, 0.08 + strength * 0.14 + pulse * 0.06);
        U.roundRect(ctx, x, y, CELL, CELL, CELL * 0.14);
        ctx.fill();
        ctx.setLineDash([8, 6]);
        ctx.lineDashOffset = -clock * 18;
        ctx.strokeStyle = U.alpha(ICE_HI, 0.45 + strength * 0.4);
        ctx.lineWidth = 2;
        U.roundRect(ctx, x + 3, y + 3, CELL - 6, CELL - 6, CELL * 0.12);
        ctx.stroke();
        ctx.setLineDash([]);
        drawSnowflake(ctx, x + CELL / 2, y + CELL / 2, CELL * (0.16 + strength * 0.08),
          U.alpha(ICE_HI, 0.35 + strength * 0.4), 2.5);
        ctx.font = '700 14px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = ICE_HI;
        ctx.fillText(left > 0 ? 'in ' + left : 'next', x + CELL - 10, y + CELL - 8);
      }

      function drawPiece(t) {
        if (t.dead && (movedAt < 0 || clock >= movedAt + SLIDE)) return;
        if (t.bornAt > clock) return;
        const k = movedAt > -10 ? easeOut(U.clamp((clock - movedAt) / SLIDE, 0, 1)) : 1;
        const x = cellX(U.lerp(t.fx, t.x, k));
        const y = cellY(U.lerp(t.fy, t.y, k));
        let s = 1;
        const age = clock - t.bornAt;
        if (age < POP) s = Math.max(0.01, backOut(age / POP));

        const showIce = t.ice || (t.thawAt > 0 && clock < t.thawAt);
        if (showIce) {
          if (clock < t.dropAt) return;
          const dk = U.clamp((clock - t.dropAt) / DROP, 0, 1);
          const fall = 1 - dk * dk;
          // Shadow grows on the landing cell while the block falls.
          ctx.fillStyle = U.alpha('#000000', 0.25 * dk);
          U.roundRect(ctx, x + CELL * (0.5 - 0.45 * dk), y + CELL * (0.55 - 0.45 * dk), CELL * 0.9 * dk, CELL * 0.9 * dk, 12);
          ctx.fill();
          const visible = clock >= t.crackAt ? t.cracks : t.cracks - 1;
          const cracks = t.thawAt > 0 ? (clock >= t.crackAt ? 2 : 1) : Math.min(1, Math.max(0, visible));
          drawIce(ctx, x, y - fall * CELL * 0.8, CELL, cracks, 1 + fall * 0.18, Math.min(1, dk * 3 + 0.2));
          return;
        }
        let v = clock < t.popAt ? t.prevV : t.v;
        if (clock >= t.popAt && clock - t.popAt < POP) s *= 1 + 0.2 * Math.sin(Math.PI * (clock - t.popAt) / POP);
        if (t.thawAt > 0 && clock - t.thawAt < POP) s *= Math.max(0.01, backOut((clock - t.thawAt) / POP));
        if (!v) v = 2;
        drawTile(ctx, x, y, CELL, v, s);
      }

      function drawBoard() {
        ctx.fillStyle = 'rgba(5,4,16,.5)';
        U.roundRect(ctx, BX, BY + 6, BOARD, BOARD, 20);
        ctx.fill();
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX, BY, BOARD, BOARD, 20);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            ctx.fillStyle = U.alpha(C.ink, 0.6);
            U.roundRect(ctx, cellX(x), cellY(y), CELL, CELL, CELL * 0.14);
            ctx.fill();
          }
        }
        drawFrost();
        for (const t of tiles) if (t.dead) drawPiece(t);
        for (const t of tiles) if (!t.dead) drawPiece(t);
      }

      function drawEffects() {
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.35));
          ctx.fillStyle = p.color;
          if (p.shard) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.beginPath();
            ctx.moveTo(0, -p.size * 0.6);
            ctx.lineTo(p.size * 0.5, p.size * 0.4);
            ctx.lineTo(-p.size * 0.4, p.size * 0.3);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          } else {
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          }
        }
        ctx.globalAlpha = 1;
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floaters) {
          if (f.t < 0) continue;
          const yy = f.y - 30 - f.t * 60;
          ctx.globalAlpha = Math.max(0, 1 - f.t / 0.9);
          ctx.fillStyle = C.ink;
          ctx.fillText(f.text, f.x + 1.5, yy + 1.5);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, yy);
        }
        ctx.globalAlpha = 1;
      }

      function card(x, y, w, h) {
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      function label(text, x, y, color) {
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = color || C.muted;
        ctx.fillText(text, x, y);
      }

      function drawPanel() {
        // Score.
        card(PX, BY, PW, 96);
        label('SCORE', PX + 16, BY + 26);
        ctx.font = '700 ' + Math.round(34 + tileBump * 4) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.text;
        ctx.fillText(String(Math.round(shownScore)), PX + 16, BY + 72);
        const best = api.best();
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('BEST', PX + PW - 16, BY + 26);
        ctx.font = FONT_HUD;
        ctx.fillStyle = C.gold;
        ctx.fillText(best == null ? '—' : String(best), PX + PW - 16, BY + 48);
        if (penalty > 0) {
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.fillStyle = C.p1;
          ctx.fillText('−' + penalty + ' undo', PX + PW - 16, BY + 72);
        }

        // Best tile.
        const ty = BY + 108;
        card(PX, ty, PW, 88);
        label('BEST TILE', PX + 16, ty + 26);
        ctx.font = '700 28px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = tileColors(bestTile)[0];
        ctx.fillText(String(bestTile), PX + 16, ty + 66);
        drawTile(ctx, PX + PW - 16 - 58, ty + 14, 58, bestTile, 1);

        // Ice countdown.
        const iy = ty + 100;
        const ih = 148;
        card(PX, iy, PW, ih);
        const left = movesToIce();
        const soon = left <= 3;
        if (soon) {
          ctx.strokeStyle = U.alpha(ICE_HI, 0.35 + 0.3 * Math.sin(clock * 5));
          ctx.lineWidth = 2;
          U.roundRect(ctx, PX, iy, PW, ih, 14);
          ctx.stroke();
        }
        label('NEXT ICE', PX + 16, iy + 26);
        drawSnowflake(ctx, PX + PW - 28, iy + 24, 11, soon ? ICE_HI : U.alpha(ICE_MID, 0.6), 2);
        ctx.font = '700 22px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = soon ? ICE_HI : C.text;
        ctx.fillText(state === 'menu' ? '—' : left === 0 ? 'waiting' : 'in ' + left, PX + 16, iy + 56);
        const done = state === 'menu' ? 0 : left === 0 ? mode.every : mode.every - left;
        const perRow = mode.every > 8 ? 6 : 4;
        const pr = 7;
        for (let i = 0; i < mode.every; i++) {
          const col = i % perRow;
          const row = (i / perRow) | 0;
          const px = PX + 24 + col * 30;
          const py = iy + 80 + row * 24;
          ctx.beginPath();
          ctx.arc(px, py, pr, 0, Math.PI * 2);
          if (i < done) {
            ctx.fillStyle = i >= mode.every - 3 ? ICE_HI : ICE_LO;
            ctx.fill();
          } else {
            ctx.strokeStyle = U.alpha(ICE_MID, 0.45);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        let onBoard = 0;
        for (const t of tiles) if (t.ice && !t.dead) onBoard++;
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('On board ' + onBoard + ' · thawed ' + thawed, PX + 16, iy + ih - 14);

        // Undo button.
        const r = undoBtn;
        const can = state === 'play' && undosLeft > 0 && !!snap;
        ctx.fillStyle = can && hoverUndo ? C.line : C.panel2;
        U.roundRect(ctx, r.x, r.y, r.w, r.h, 14);
        ctx.fill();
        ctx.strokeStyle = can ? C.violet : C.line;
        ctx.lineWidth = can ? 2 : 1.5;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '700 17px "JetBrains Mono", monospace';
        ctx.fillStyle = can ? C.text : C.muted;
        ctx.fillText('↶ Undo', r.x + 16, r.y + 27);
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('−' + UNDO_COST + ' pts · ' + undosLeft + ' left', r.x + 16, r.y + 47);
        ctx.textAlign = 'right';
        ctx.fillStyle = U.alpha(C.text, 0.5);
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillText('Z', r.x + r.w - 16, r.y + 27);

        // Moves + mode.
        const my = r.y + r.h + 14;
        ctx.textAlign = 'left';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText(mode.name.toUpperCase(), PX + 4, my + 14);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.text;
        ctx.fillText(moves + ' moves', PX + PW - 4, my + 14);
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        const sx = bumpX + (shake > 0 ? U.rand(-shake, shake) * 0.4 : 0);
        const sy = bumpY + (shake > 0 ? U.rand(-shake, shake) * 0.4 : 0);
        ctx.translate(sx, sy);
        drawBoard();
        drawEffects();
        ctx.restore();
        drawPanel();
        if (state === 'menu' || state === 'over') {
          ctx.fillStyle = U.alpha(C.ink, 0.35);
          ctx.fillRect(BX, BY, BOARD, BOARD);
        }
        if (flash) {
          ctx.fillStyle = U.alpha(flash.color, Math.max(0, flash.a) * 0.5);
          ctx.fillRect(0, 0, W, H);
        }
        if (state === 'menu' && !tiles.length) {
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.gold, 0.25);
          ctx.fillText('Slide', BX + BOARD / 2, BY + BOARD / 2);
        }
      }

      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
