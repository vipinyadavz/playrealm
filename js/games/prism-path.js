/* Prism Path — split white light with prisms, bend it with mirrors, strip it with filters and
   mix it with mergers so every crystal receives exactly its own color. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 540;

  /* <model> Board model + beam tracer (also loaded by the offline level checker). */
  const COLS = 10;
  const ROWS = 8;
  const N = COLS * ROWS;
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  const RED = 1;
  const GREEN = 2;
  const BLUE = 4;
  const WHITE = 7;
  const KINDS = ['mirror', 'prism', 'filterR', 'filterG', 'filterB', 'merger'];
  const FILTER_MASK = { filterR: RED, filterG: GREEN, filterB: BLUE };
  const ORIENTS = { mirror: 2, prism: 2, filterR: 1, filterG: 1, filterB: 1, merger: 4 };
  const SRC_DIR = { '>': 0, v: 1, '<': 2, '^': 3 };
  const CRYSTAL = { R: 1, G: 2, B: 4, Y: 3, M: 5, C: 6, W: 7 };
  const FIXED = {
    '/': { t: 'mirror', o: 0 },
    '\\': { t: 'mirror', o: 1 },
    P: { t: 'prism', o: 0 },
    p: { t: 'prism', o: 1 },
    r: { t: 'filterR', o: 0 },
    g: { t: 'filterG', o: 0 },
    b: { t: 'filterB', o: 0 }
  };

  /* Map legend: . empty  # wall  o glass  > v < ^ white source  R G B Y M C W crystal
     / \ fixed mirror  P p fixed prism  r g b fixed filter. */
  const LEVELS = [
    {
      name: 'First Light',
      hint: 'Drag the mirror into the beam. Click a placed mirror to turn it.',
      map: ['..........', '......W...', '..........', '..........', '..........', '.>.......#', '..........', '..........'],
      inv: { mirror: 1 },
      sol: [[6, 5, 'mirror', 0]]
    },
    {
      name: 'Around the Wall',
      hint: 'Two mirrors can carry light around a wall.',
      map: ['..........', '.>....#...', '......#...', '......#...', '......#...', '......#...', '........W.', '..........'],
      inv: { mirror: 2 },
      sol: [[3, 1, 'mirror', 1], [3, 6, 'mirror', 1]]
    },
    {
      name: 'Glass Garden',
      hint: 'Glass lets light through, but nothing can sit on it.',
      map: ['....#.....', '.v..#..W..', '....#.....', 'oooo#..#..', '....o.....', '....o.....', '..........', '.........#'],
      inv: { mirror: 4 },
      sol: [[1, 6, 'mirror', 1], [8, 6, 'mirror', 0], [8, 1, 'mirror', 1]]
    },
    {
      name: 'Twin Beams',
      hint: 'Two sources, two crystals. Beams can cross each other freely.',
      map: ['W.........', '..........', '...#......', '.>.#....<.', '...#......', '..........', '..........', '.........W'],
      inv: { mirror: 4 },
      sol: [[2, 3, 'mirror', 0], [2, 0, 'mirror', 1], [7, 3, 'mirror', 0], [7, 7, 'mirror', 1]]
    },
    {
      name: 'Prism Dawn',
      hint: 'A prism splits white light: red goes straight on, green and blue leave to the sides.',
      map: ['.....G....', '..........', '..........', '>........R', '..........', '..........', '..........', '.....B....'],
      inv: { prism: 1 },
      sol: [[5, 3, 'prism', 0]]
    },
    {
      name: 'Mirror Twist',
      hint: 'Click a placed prism to flip which side green and blue leave from.',
      map: ['.v....B..#', '..........', '..........', '..........', '.........R', '..........', '..........', '......G...'],
      inv: { mirror: 1, prism: 1 },
      sol: [[1, 4, 'mirror', 1], [6, 4, 'prism', 1]]
    },
    {
      name: 'Bent Rainbow',
      hint: 'Mirrors bounce colored light too.',
      map: ['......G...', '..........', '....#.....', '..........', '>........R', '..........', '..........', '..B.......'],
      inv: { mirror: 2, prism: 1 },
      sol: [[6, 4, 'prism', 0], [6, 7, 'mirror', 0]]
    },
    {
      name: 'Pass Through',
      hint: 'Colored light passes straight through a prism. Only white gets split.',
      map: ['....G.....', '..........', '..........', '>.....P..R', '..........', '..........', '..........', '..B.......'],
      inv: { mirror: 1, prism: 1 },
      sol: [[4, 3, 'prism', 0], [4, 7, 'mirror', 0]]
    },
    {
      name: 'Red Glass',
      hint: 'A red filter turns white into red. The white crystal is happy as it is.',
      map: ['..........', '.v........', '..........', 'W........<', '..........', '..........', '......R...', '..........'],
      inv: { mirror: 1, filterR: 1 },
      sol: [[1, 6, 'mirror', 1], [3, 6, 'filterR', 0]]
    },
    {
      name: 'Crossroads',
      hint: 'One filter, two beams. Where do they meet?',
      map: ['....R.....', '..........', '>........R', '..........', '..........', '..........', '..........', '....^.....'],
      inv: { filterR: 1 },
      sol: [[4, 2, 'filterR', 0]]
    },
    {
      name: 'Green Gate',
      hint: 'A crystal hit by any other color stays dark. Keep stray light away.',
      map: ['......B...', '..........', '..........', '>........G', '..........', '..........', '>........R', '......G...'],
      inv: { prism: 1, filterG: 1 },
      sol: [[6, 6, 'prism', 1], [2, 3, 'filterG', 0]]
    },
    {
      name: 'Yellow Dawn',
      hint: 'Mergers add up the beams that enter them: red + green = yellow. Click one to aim it.',
      map: ['#........#', '..........', '..........', '>........Y', '..........', '..........', '..........', '#........#'],
      inv: { mirror: 3, prism: 1, merger: 1 },
      sol: [[3, 3, 'prism', 0], [3, 1, 'mirror', 0], [6, 1, 'mirror', 1], [6, 3, 'merger', 0]]
    },
    {
      name: 'Magenta Bloom',
      hint: 'Red + blue makes magenta. Mergers ignore light that hits their arrow side.',
      map: ['.v........', '..........', '..........', 'G.........', '..........', '..........', '........M.', '..........'],
      inv: { mirror: 2, prism: 1, merger: 1 },
      sol: [[1, 3, 'prism', 1], [1, 6, 'mirror', 1], [5, 3, 'mirror', 1], [5, 6, 'merger', 0]]
    },
    {
      name: 'Cyan Tide',
      hint: 'Green + blue makes cyan. Red has a crystal of its own.',
      map: ['....C.....', '..........', '..........', '..........', '>........R', '..........', '..........', '..........'],
      inv: { mirror: 3, prism: 1, merger: 1 },
      sol: [[4, 4, 'prism', 0], [4, 6, 'mirror', 1], [6, 6, 'mirror', 0], [6, 1, 'mirror', 1], [4, 1, 'merger', 3]]
    },
    {
      name: 'Rebuild White',
      hint: 'The bolted prism splits everything. Put all three colors back together.',
      map: ['..........', '..........', '.#........', '>.P......W', '.#........', '..........', '..........', '..........'],
      inv: { mirror: 4, merger: 1 },
      sol: [[2, 1, 'mirror', 0], [6, 1, 'mirror', 1], [2, 5, 'mirror', 1], [6, 5, 'mirror', 0], [6, 3, 'merger', 0]]
    },
    {
      name: 'Twin Filters',
      hint: 'Two white sources, two filters, one yellow crystal.',
      map: ['..........', '>.........', '..........', '.........Y', '..........', '..........', '>.........', '..........'],
      inv: { mirror: 2, filterR: 1, filterG: 1, merger: 1 },
      sol: [[1, 1, 'filterR', 0], [6, 1, 'mirror', 1], [1, 6, 'filterG', 0], [6, 6, 'mirror', 0], [6, 3, 'merger', 0]]
    },
    {
      name: 'Fixed Fortune',
      hint: 'The bolted prism sends colors the wrong way. Split the light before it gets there.',
      map: ['....B.....', '..........', '..........', '>...P....R', '..........', '..........', '..........', '....G.....'],
      inv: { mirror: 2, prism: 1 },
      sol: [[2, 3, 'prism', 1], [2, 7, 'mirror', 1], [2, 0, 'mirror', 0]]
    },
    {
      name: 'Prism Relay',
      hint: 'Two sources, two jobs: magenta for one crystal, pure white for the other.',
      map: ['>.........', '..........', '..W.......', '..........', 'M.........', '..........', '..........', '.........<'],
      inv: { mirror: 3, prism: 1, merger: 1 },
      sol: [[4, 0, 'prism', 0], [8, 0, 'mirror', 1], [8, 4, 'mirror', 0], [4, 4, 'merger', 2], [2, 7, 'mirror', 1]]
    },
    {
      name: 'Two Mixes',
      hint: 'Two prisms, two mergers, two mixes.',
      map: ['..........', '>........Y', '..........', '..........', '..........', '..........', '>........M', '..........'],
      inv: { mirror: 4, prism: 2, merger: 2 },
      sol: [[2, 1, 'prism', 1], [6, 1, 'merger', 0], [2, 3, 'mirror', 1], [6, 3, 'mirror', 0],
        [2, 6, 'prism', 0], [6, 6, 'merger', 0], [2, 7, 'mirror', 1], [6, 7, 'mirror', 0]]
    },
    {
      name: 'Grand Prism',
      hint: 'Everything you have learned on one board. A spare piece earns a bonus.',
      map: ['.........<', '..........', '..........', '>........Y', '..........', '..........', '.........B', '.......W..'],
      inv: { mirror: 4, prism: 1, filterR: 1, merger: 1 },
      sol: [[2, 3, 'prism', 0], [2, 1, 'mirror', 0], [6, 1, 'mirror', 1], [6, 3, 'merger', 0], [2, 6, 'mirror', 1], [7, 0, 'mirror', 0]]
    }
  ];

  function parseLevel(def) {
    const base = new Array(N).fill(null);
    const crystals = [];
    for (let y = 0; y < ROWS; y++) {
      const row = def.map[y] || '';
      for (let x = 0; x < COLS; x++) {
        const ch = row[x] || '.';
        const i = y * COLS + x;
        if (ch === '#') base[i] = { t: 'wall' };
        else if (ch === 'o') base[i] = { t: 'glass' };
        else if (ch in SRC_DIR) base[i] = { t: 'src', d: SRC_DIR[ch] };
        else if (ch in CRYSTAL) {
          base[i] = { t: 'crystal', c: CRYSTAL[ch] };
          crystals.push(i);
        } else if (FIXED[ch]) base[i] = { t: FIXED[ch].t, o: FIXED[ch].o, fixed: true };
      }
    }
    const slots = KINDS.filter((k) => def.inv[k] > 0);
    const total = slots.reduce((s, k) => s + def.inv[k], 0);
    return { def, base, crystals, slots, total };
  }

  const mirrorTurn = (o, d) => (o === 0 ? 3 - d : d ^ 1);

  function traceOnce(grid, mOut) {
    const segs = [];
    const hits = new Uint8Array(N);
    const mIn = new Map();
    const seen = new Uint8Array(N * 4);
    const queue = [];
    for (let i = 0; i < N; i++) {
      const cell = grid[i];
      if (!cell) continue;
      if (cell.t === 'src') queue.push([i, cell.d, WHITE]);
      else if (cell.t === 'merger' && mOut.get(i)) queue.push([i, cell.o, mOut.get(i)]);
    }
    let steps = 0;
    for (let q = 0; q < queue.length && q < 400; q++) {
      const start = queue[q][0];
      let d = queue[q][1];
      let c = queue[q][2];
      let x = start % COLS;
      let y = (start / COLS) | 0;
      let sx = x;
      let sy = y;
      while (steps++ < 8000) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
          segs.push([sx, sy, x + DX[d] * 0.5, y + DY[d] * 0.5, c, 0]);
          break;
        }
        const ni = ny * COLS + nx;
        const bit = 1 << c;
        if (seen[ni * 4 + d] & bit) {
          segs.push([sx, sy, nx, ny, c, 0]);
          break;
        }
        seen[ni * 4 + d] |= bit;
        const cell = grid[ni];
        if (cell && (cell.t === 'wall' || cell.t === 'src')) {
          segs.push([sx, sy, nx - DX[d] * 0.5, ny - DY[d] * 0.5, c, 0]);
          break;
        }
        x = nx;
        y = ny;
        if (!cell || cell.t === 'glass') continue;
        if (cell.t === 'crystal') {
          segs.push([sx, sy, x, y, c, 1]);
          hits[ni] |= bit;
          break;
        }
        if (cell.t === 'mirror') {
          segs.push([sx, sy, x, y, c, 0]);
          d = mirrorTurn(cell.o, d);
          sx = x;
          sy = y;
          continue;
        }
        if (cell.t === 'prism') {
          if (c !== WHITE) continue;
          segs.push([sx, sy, x, y, c, 0]);
          const left = (d + 3) % 4;
          const right = (d + 1) % 4;
          queue.push([ni, d, RED], [ni, cell.o ? right : left, GREEN], [ni, cell.o ? left : right, BLUE]);
          break;
        }
        if (cell.t === 'merger') {
          if (d === (cell.o + 2) % 4) {
            segs.push([sx, sy, x - DX[d] * 0.3, y - DY[d] * 0.3, c, 0]);
          } else {
            segs.push([sx, sy, x, y, c, 0]);
            mIn.set(ni, (mIn.get(ni) || 0) | c);
          }
          break;
        }
        const mask = FILTER_MASK[cell.t];
        if (mask) {
          const nc = c & mask;
          if (nc === c) continue;
          segs.push([sx, sy, x, y, c, 0]);
          if (!nc) break;
          c = nc;
          sx = x;
          sy = y;
        }
      }
    }
    return { segs, hits, mIn, mOut, seen };
  }

  /* Mergers feed back into the board, so iterate until their inputs settle. */
  function traceBoard(grid) {
    let mOut = new Map();
    let r = null;
    for (let iter = 0; iter < 10; iter++) {
      r = traceOnce(grid, mOut);
      let same = r.mIn.size === mOut.size;
      if (same) r.mIn.forEach((v, k) => { if (mOut.get(k) !== v) same = false; });
      if (same) break;
      mOut = r.mIn;
    }
    return r;
  }

  /* A crystal wakes only when its exact color, and nothing else, reaches it. */
  function crystalState(level, grid, r) {
    let lit = 0;
    let wrong = 0;
    for (const i of level.crystals) {
      const want = 1 << grid[i].c;
      if (r.hits[i] === want) lit++;
      else if (r.hits[i] & ~want) wrong++;
    }
    return { lit, wrong, all: lit === level.crystals.length };
  }
  /* </model> */

  const CELL = 58;
  const OX = 16;
  const OY = 62;
  const BW = COLS * CELL;
  const BH = ROWS * CELL;
  const TX = 612;
  const TW = W - TX - 16;
  const SLOT_H = 58;
  const SLOT_GAP = 8;
  const BTN_H = 34;
  const LONG_PRESS = 0.5;
  const BONUS = 25;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const FONT_SMALL = '600 12px "JetBrains Mono", monospace';
  const LIGHT = { 1: '#FF4D5E', 2: '#3BE38B', 4: '#3D8BFF', 3: '#FFE14D', 5: '#FF4DE3', 6: '#4DE6FF', 7: '#FFFFFF' };
  const COLOR_NAME = { 1: 'red', 2: 'green', 4: 'blue', 3: 'yellow', 5: 'magenta', 6: 'cyan', 7: 'white' };
  const KIND_LABEL = {
    mirror: 'Mirror', prism: 'Prism', filterR: 'Red filter', filterG: 'Green filter', filterB: 'Blue filter', merger: 'Merger'
  };
  const KIND_TIP = {
    mirror: 'click: turn', prism: 'click: flip', filterR: 'keeps red', filterG: 'keeps green', filterB: 'keeps blue', merger: 'click: aim'
  };
  const KIND_HINT = {
    prism: 'Prisms split white: red straight on, green and blue to the sides. Click to swap the sides.',
    filterR: 'Filters keep only their own color: white in, red out. Other colors are stopped cold.',
    filterG: 'Filters keep only their own color: white in, green out. Other colors are stopped cold.',
    filterB: 'Filters keep only their own color: white in, blue out. Other colors are stopped cold.',
    merger: 'Mergers add up every beam that enters and fire the mix out of the arrow. Click to aim.'
  };
  const MOVES = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const GROUPS = [
    { label: '1–5 · Mirrors & prisms', from: 0 },
    { label: '6–10 · Bends & filters', from: 5 },
    { label: '11–15 · Mergers', from: 10 },
    { label: '16–20 · Grand mixes', from: 15 }
  ];

  /* ---------- Drawing helpers (shared by the game and the card art) ---------- */

  function drawBeams(ctx, segs, ox, oy, s, t) {
    if (!segs.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const passes = [[0.44, 0.07], [0.24, 0.16], [0.11, 0.42], [0.04, 0.95]];
    for (const ps of passes) {
      ctx.lineWidth = Math.max(1, s * ps[0]);
      for (const g of segs) {
        ctx.strokeStyle = U.alpha(LIGHT[g[4]], ps[1]);
        ctx.beginPath();
        ctx.moveTo(ox + (g[0] + 0.5) * s, oy + (g[1] + 0.5) * s);
        ctx.lineTo(ox + (g[2] + 0.5) * s, oy + (g[3] + 0.5) * s);
        ctx.stroke();
      }
    }
    // Photons drifting along each beam.
    const gap = 0.75;
    const r = Math.max(1, s * 0.035);
    for (const g of segs) {
      const dx = g[2] - g[0];
      const dy = g[3] - g[1];
      const len = Math.hypot(dx, dy);
      if (len < 0.05) continue;
      ctx.fillStyle = U.alpha(LIGHT[g[4]], 0.9);
      for (let d = (t * 2.4) % gap; d < len; d += gap) {
        const x = ox + (g[0] + 0.5 + (dx / len) * d) * s;
        const y = oy + (g[1] + 0.5 + (dy / len) * d) * s;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  function hexPath(ctx, cx, cy, r) {
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 3;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 1.12;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }

  /* state: 'lit' | 'dim' | 'wrong'; k = pop-in progress after lighting. */
  function drawCrystal(ctx, cx, cy, s, col, state, t, k) {
    const hex = LIGHT[col];
    const r = s * 0.3;
    if (state === 'lit') {
      const pulse = 1 + Math.sin(t * 3 + cx * 0.05) * 0.08 + (1 - (k == null ? 1 : k)) * 0.6;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 3; i >= 1; i--) {
        ctx.fillStyle = U.alpha(hex, 0.09);
        ctx.beginPath();
        ctx.arc(cx, cy, r * (0.9 + i * 0.45) * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    const shake = state === 'wrong' ? Math.sin(t * 40) * s * 0.025 : 0;
    const x = cx + shake;
    hexPath(ctx, x, cy, r);
    ctx.fillStyle = state === 'lit' ? hex : U.alpha(hex, state === 'wrong' ? 0.1 : 0.2);
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.strokeStyle = state === 'wrong' ? U.alpha(hex, 0.45 + 0.3 * Math.abs(Math.sin(t * 9))) : hex;
    ctx.stroke();
    // Facets.
    ctx.strokeStyle = state === 'lit' ? 'rgba(255,255,255,0.55)' : U.alpha(hex, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, cy - r * 1.12);
    ctx.lineTo(x - r * 0.4, cy);
    ctx.lineTo(x, cy + r * 1.12);
    ctx.lineTo(x + r * 0.4, cy);
    ctx.closePath();
    ctx.stroke();
    if (state === 'lit') {
      const a = t * 1.6;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = i % 2 ? r * 0.12 : r * 0.42;
        const ang = a + (i * Math.PI) / 4;
        ctx.lineTo(x + r * 0.35 + Math.cos(ang) * rr, cy - r * 0.45 + Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else if (state === 'wrong') {
      ctx.strokeStyle = U.alpha(C.text, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.3, cy - r * 0.3);
      ctx.lineTo(x + r * 0.3, cy + r * 0.3);
      ctx.moveTo(x + r * 0.3, cy - r * 0.3);
      ctx.lineTo(x - r * 0.3, cy + r * 0.3);
      ctx.stroke();
    }
  }

  function drawSource(ctx, cx, cy, s, d, t) {
    U.roundRect(ctx, cx - s * 0.36, cy - s * 0.36, s * 0.72, s * 0.72, s * 0.16);
    ctx.fillStyle = '#2B2558';
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
    const lx = cx + DX[d] * s * 0.2;
    const ly = cy + DY[d] * s * 0.2;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(lx, ly, s * (0.22 + Math.sin(t * 4) * 0.03), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(lx, ly, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.muted, 0.8);
    ctx.beginPath();
    ctx.arc(cx - DX[d] * s * 0.14, cy - DY[d] * s * 0.14, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWall(ctx, x, y, s) {
    U.roundRect(ctx, x + 2, y + 2, s - 4, s - 4, s * 0.12);
    ctx.fillStyle = C.panel2;
    ctx.fill();
    ctx.fillStyle = U.alpha(C.line, 0.9);
    ctx.fillRect(x + s * 0.18, y + 5, s * 0.64, Math.max(2, s * 0.07));
    ctx.strokeStyle = U.alpha(C.ink, 0.6);
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2.5, y + 2.5, s - 5, s - 5);
  }

  function drawGlass(ctx, x, y, s) {
    U.roundRect(ctx, x + 3, y + 3, s - 6, s - 6, s * 0.1);
    ctx.fillStyle = 'rgba(168,220,255,0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(168,220,255,0.38)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.25, y + s * 0.62);
    ctx.lineTo(x + s * 0.62, y + s * 0.25);
    ctx.moveTo(x + s * 0.42, y + s * 0.72);
    ctx.lineTo(x + s * 0.72, y + s * 0.42);
    ctx.stroke();
  }

  /* Draws a placeable piece centred on (cx, cy) in a cell of size s. mix = merger output color. */
  function drawPiece(ctx, kind, o, cx, cy, s, fixed, mix) {
    if (fixed) {
      U.roundRect(ctx, cx - s * 0.44, cy - s * 0.44, s * 0.88, s * 0.88, s * 0.12);
      ctx.fillStyle = U.alpha(C.panel2, 0.9);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.muted, 0.75);
      for (const [px, py] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.arc(cx + px * s * 0.34, cy + py * s * 0.34, Math.max(1.2, s * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (kind === 'mirror') {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(o === 0 ? -Math.PI / 4 : Math.PI / 4);
      U.roundRect(ctx, -s * 0.46, -s * 0.075, s * 0.92, s * 0.15, s * 0.05);
      ctx.fillStyle = '#5E6AA8';
      ctx.fill();
      ctx.fillStyle = '#DDE6FF';
      ctx.fillRect(-s * 0.43, -s * 0.06, s * 0.86, s * 0.065);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(-s * 0.2, -s * 0.055, s * 0.16, s * 0.035);
      ctx.restore();
    } else if (kind === 'prism') {
      const up = o === 0 ? 1 : -1;
      const r = s * 0.36;
      const ax = cx;
      const ay = cy - up * r;
      const lx = cx - r * 0.95;
      const rx = cx + r * 0.95;
      const by = cy + up * r * 0.62;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(rx, by);
      ctx.lineTo(lx, by);
      ctx.closePath();
      ctx.fillStyle = 'rgba(220,235,255,0.22)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.strokeStyle = '#E8F0FF';
      ctx.stroke();
      // Which side green and blue leave from (left/right of the incoming beam).
      const dots = [[ax, ay, LIGHT[1]], [lx, by, LIGHT[o === 0 ? 2 : 4]], [rx, by, LIGHT[o === 0 ? 4 : 2]]];
      for (const [x, y, col] of dots) {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(2, s * 0.06), 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (kind === 'merger') {
      const r = s * 0.27;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#2E2862';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.strokeStyle = C.muted;
      ctx.stroke();
      ctx.fillStyle = mix ? LIGHT[mix] : U.alpha(C.text, 0.25);
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
      ctx.fill();
      const ax = DX[o];
      const ay = DY[o];
      const tip = s * 0.47;
      const base = s * 0.3;
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(cx + ax * tip, cy + ay * tip);
      ctx.lineTo(cx + ax * base - ay * s * 0.14, cy + ay * base + ax * s * 0.14);
      ctx.lineTo(cx + ax * base + ay * s * 0.14, cy + ay * base - ax * s * 0.14);
      ctx.closePath();
      ctx.fill();
    } else if (FILTER_MASK[kind]) {
      const col = LIGHT[FILTER_MASK[kind]];
      U.roundRect(ctx, cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6, s * 0.1);
      ctx.fillStyle = U.alpha(col, 0.3);
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, s * 0.05);
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.strokeStyle = U.alpha(col, 0.7);
      ctx.lineWidth = Math.max(1, s * 0.03);
      ctx.beginPath();
      for (let k = -1; k <= 1; k++) {
        ctx.moveTo(cx - s * 0.2, cy + k * s * 0.13);
        ctx.lineTo(cx + s * 0.2, cy + k * s * 0.13);
      }
      ctx.stroke();
    }
  }

  function drawCell(ctx, cell, x, y, s, t, extra) {
    const cx = x + s / 2;
    const cy = y + s / 2;
    if (cell.t === 'wall') drawWall(ctx, x, y, s);
    else if (cell.t === 'glass') drawGlass(ctx, x, y, s);
    else if (cell.t === 'src') drawSource(ctx, cx, cy, s, cell.d, t);
    else if (cell.t === 'crystal') drawCrystal(ctx, cx, cy, s, cell.c, extra.state, t, extra.k);
    else drawPiece(ctx, cell.t, cell.o, cx, cy, s, cell.fixed, extra && extra.mix);
  }

  Arcade.register({
    id: 'prism-path',
    title: 'Prism Path',
    category: 'fresh',
    mode: 'solo',
    players: '1P',
    original: true,
    color: C.gold,
    best: 'high',
    tagline: 'Bend, split, filter and mix beams of light to wake every crystal.',
    hook: 'Split white light with prisms and mix colors to wake crystals that answer to only one color.',
    tags: ['puzzle', 'light', 'laser', 'colors', 'prism', 'mirrors', 'logic', 'mouse', 'touch', 'keyboard'],
    howTo: 'A source shoots a white beam across the board. Drag pieces from the tray onto empty cells to steer it. ' +
      'Mirrors bounce light; click one to turn it. Prisms split white into red (straight on), green and blue (to the sides); ' +
      'colored light passes through them untouched, and a click swaps the sides. Filters keep only their own color. ' +
      'Mergers add up every beam that enters them (red + green = yellow, red + blue = magenta, green + blue = cyan, all three = white) ' +
      'and fire the mix out of their arrow; click to aim. Each crystal wakes only for its exact color, and any other color ' +
      'hitting it keeps it dark. Light every crystal at once to clear the puzzle. 20 puzzles, 100 points each, ' +
      'plus 25 for every tray piece you did not need.',
    controls: [
      { keys: ['Drag'], label: 'Place or move a piece' },
      { keys: ['Click'], label: 'Turn / flip / aim a piece' },
      { keys: ['Right-click', 'Hold'], label: 'Return a piece to the tray' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor' },
      { keys: ['1', '2', '3', '4'], label: 'Pick a tray piece' },
      { keys: ['Space'], label: 'Place / turn at the cursor' },
      { keys: ['Backspace'], label: 'Remove at the cursor' },
      { keys: ['Z'], label: 'Undo' },
      { keys: ['R'], label: 'Clear the board' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 40;
      const ox = (w - 8 * s) / 2;
      const oy = (h - 5 * s) / 2;
      ctx.strokeStyle = U.alpha(C.line, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= 8; x++) {
        ctx.moveTo(ox + x * s + 0.5, oy);
        ctx.lineTo(ox + x * s + 0.5, oy + 5 * s);
      }
      for (let y = 0; y <= 5; y++) {
        ctx.moveTo(ox, oy + y * s + 0.5);
        ctx.lineTo(ox + 8 * s, oy + y * s + 0.5);
      }
      ctx.stroke();
      drawWall(ctx, ox + 6 * s, oy + 4 * s, s);
      drawWall(ctx, ox + 0 * s, oy + 0 * s, s);
      drawGlass(ctx, ox + 5 * s, oy + 2 * s, s);
      // White in from the left, split at the prism, mixed back at the merger.
      const segs = [[0, 2, 3, 2, 7], [3, 2, 7, 2, 1], [3, 2, 3, 0, 2], [3, 2, 3, 4, 4], [3, 4, 5, 4, 4], [3, 0, 7, 0, 2]];
      drawBeams(ctx, segs, ox, oy, s, t);
      drawSource(ctx, ox + 0.5 * s, oy + 2.5 * s, s, 0, t);
      drawPiece(ctx, 'prism', 0, ox + 3.5 * s, oy + 2.5 * s, s, false);
      drawPiece(ctx, 'mirror', 0, ox + 3.5 * s, oy + 0.5 * s, s, false);
      drawPiece(ctx, 'mirror', 1, ox + 3.5 * s, oy + 4.5 * s, s, false);
      drawCrystal(ctx, ox + 7.5 * s, oy + 2.5 * s, s, 1, 'lit', t, 1);
      drawCrystal(ctx, ox + 7.5 * s, oy + 0.5 * s, s, 2, 'lit', t, 1);
      drawCrystal(ctx, ox + 5.5 * s, oy + 4.5 * s, s, 4, 'lit', t, 1);
      drawCrystal(ctx, ox + 1.5 * s, oy + 4.5 * s, s, 3, 'dim', t, 1);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'won'
      let idx = 0;
      let level = null;
      let placed = new Map(); // cell -> { k, o, at }
      let history = [];
      let sel = 0;
      let grid = null;
      let beam = null;
      let cs = { lit: 0, wrong: 0, all: false };
      let litNow = new Uint8Array(N);
      let litAt = new Float32Array(N);
      let cursor = { x: 4, y: 3 };
      let kb = false;
      let hover = -1;
      let drag = null;
      let clock = 0;
      let flash = 0;
      let winT = 0;
      let particles = [];
      let winToken = 0;
      const solved = new Array(LEVELS.length).fill(0);
      const told = {};

      const total = () => solved.reduce((a, b) => a + b, 0);
      const canPlace = (i) => i >= 0 && level && !level.base[i] && !placed.has(i);
      const cellX = (i) => OX + (i % COLS) * CELL;
      const cellY = (i) => OY + ((i / COLS) | 0) * CELL;

      function remaining(k) {
        let used = 0;
        placed.forEach((p) => { if (p.k === k) used++; });
        return (level.def.inv[k] || 0) - used;
      }

      function slotRect(k) {
        return { x: TX, y: OY + k * (SLOT_H + SLOT_GAP), w: TW, h: SLOT_H };
      }

      const BUTTONS = [
        { id: 'undo', label: 'Undo  Z' },
        { id: 'reset', label: 'Clear  R' },
        { id: 'levels', label: 'Puzzles' }
      ];
      function buttonRect(k) {
        const y0 = OY + BH - BUTTONS.length * BTN_H - (BUTTONS.length - 1) * 8;
        return { x: TX, y: y0 + k * (BTN_H + 8), w: TW, h: BTN_H };
      }
      const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

      function cellAt(p) {
        const x = Math.floor((p.x - OX) / CELL);
        const y = Math.floor((p.y - OY) / CELL);
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
        return y * COLS + x;
      }

      function burst(x, y, color, n, speed) {
        for (let k = 0; k < n && particles.length < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.5, 1.1), max: 1.1, size: U.rand(1.5, 3.5), color });
        }
      }

      function hud() {
        api.setScore(total());
      }

      function rebuild(quiet) {
        grid = level.base.slice();
        placed.forEach((p, i) => { grid[i] = { t: p.k, o: p.o }; });
        beam = traceBoard(grid);
        cs = crystalState(level, grid, beam);
        for (const i of level.crystals) {
          const on = beam.hits[i] === 1 << grid[i].c ? 1 : 0;
          if (on && !litNow[i]) {
            litAt[i] = clock;
            if (!quiet) burst(cellX(i) + CELL / 2, cellY(i) + CELL / 2, LIGHT[grid[i].c], 14, 120);
          }
          litNow[i] = on;
        }
      }

      function afterChange(sound) {
        const prevLit = cs.lit;
        const prevWrong = cs.wrong;
        rebuild(false);
        if (cs.all) {
          win();
          return;
        }
        if (cs.lit > prevLit) api.sfx('score');
        else if (sound) api.sfx(sound);
        if (cs.wrong > prevWrong && !told.wrong) {
          told.wrong = true;
          api.setStatus('Wrong color! A crystal answers to only one color and stays dark if any other light hits it.');
        }
      }

      function snapshot() {
        history.push(Array.from(placed, ([i, p]) => [i, p.k, p.o]));
        if (history.length > 200) history.shift();
      }

      function tellKind(k) {
        if (told[k] || !KIND_HINT[k]) return;
        told[k] = true;
        api.setStatus(KIND_HINT[k]);
      }

      function place(i, k) {
        if (!canPlace(i)) {
          api.sfx('hit');
          return false;
        }
        if (!k || remaining(k) <= 0) {
          api.sfx('hit');
          api.setStatus('No ' + (k ? KIND_LABEL[k].toLowerCase() + 's' : 'pieces') +
            ' left in the tray. Right-click or hold a placed piece to take it back.');
          return false;
        }
        snapshot();
        placed.set(i, { k, o: 0, at: clock });
        tellKind(k);
        afterChange('tick');
        return true;
      }

      function rotate(i) {
        const p = placed.get(i);
        if (!p) return;
        if (ORIENTS[p.k] < 2) {
          api.sfx('tick');
          api.setStatus('Filters work the same from every side. Drag one to move it.');
          return;
        }
        snapshot();
        p.o = (p.o + 1) % ORIENTS[p.k];
        p.at = clock;
        afterChange('flip');
      }

      function removeAt(i) {
        if (!placed.has(i)) {
          if (level.base[i] && level.base[i].fixed) api.setStatus('That piece is bolted to the board.');
          return;
        }
        snapshot();
        placed.delete(i);
        afterChange('blip');
      }

      function movePiece(from, to) {
        const p = placed.get(from);
        if (!p || from === to || !canPlace(to)) return;
        snapshot();
        placed.delete(from);
        placed.set(to, { k: p.k, o: p.o, at: clock });
        afterChange('tick');
      }

      function undo() {
        if (!history.length) {
          api.sfx('hit');
          return;
        }
        const snap = history.pop();
        placed = new Map(snap.map(([i, k, o]) => [i, { k, o, at: clock }]));
        afterChange('tick');
      }

      function clearBoard() {
        if (!placed.size) return;
        snapshot();
        placed = new Map();
        afterChange('flip');
        api.setStatus('Board cleared. Press Z to undo.');
      }

      function startLevel(n) {
        idx = U.clamp(n, 0, LEVELS.length - 1);
        level = parseLevel(LEVELS[idx]);
        placed = new Map();
        history = [];
        sel = 0;
        drag = null;
        particles = [];
        flash = 0;
        litNow = new Uint8Array(N);
        litAt = new Float32Array(N);
        cursor = { x: 4, y: 3 };
        state = 'play';
        winToken++;
        rebuild(true);
        hud();
        api.setStatus((idx + 1) + '/' + LEVELS.length + ' · ' + level.def.hint);
        api.sfx('power');
      }

      function firstUnsolved() {
        const k = solved.findIndex((v) => !v);
        return k < 0 ? 0 : k;
      }

      function win() {
        state = 'won';
        winT = clock;
        drag = null;
        const spare = level.total - placed.size;
        const pts = 100 + BONUS * spare;
        solved[idx] = Math.max(solved[idx], pts);
        const sum = total();
        hud();
        const isBest = api.reportScore(sum);
        api.sfx('win');
        flash = 1;
        for (const i of level.crystals) burst(cellX(i) + CELL / 2, cellY(i) + CELL / 2, LIGHT[grid[i].c], 30, 200);
        const text = 'Puzzle ' + (idx + 1) + ' solved with ' + placed.size + ' of ' + level.total + ' pieces' +
          (spare ? ' (+' + BONUS * spare + ' spare bonus)' : '') + '. Session total: ' + sum + ' pts.';
        api.setStatus(text);
        const token = ++winToken;
        api.after(1300, () => {
          if (token !== winToken || state !== 'won') return;
          const last = idx === LEVELS.length - 1;
          const buttons = last
            ? [{ label: 'Choose puzzle', primary: true, onClick: showLevelSelect }, { label: 'Replay', onClick: () => startLevel(idx) }]
            : [
              { label: 'Next puzzle', primary: true, onClick: () => startLevel(idx + 1) },
              { label: 'Replay', onClick: () => startLevel(idx) },
              { label: 'Choose puzzle', onClick: showLevelSelect }
            ];
          api.menu({
            title: isBest ? 'New best: ' + sum + '!' : last ? 'Every crystal is awake!' : 'Puzzle cleared!',
            text,
            buttons
          });
        });
      }

      function showStart() {
        state = 'menu';
        api.menu({
          title: 'Prism Path',
          text: 'Drag mirrors, prisms, filters and mergers into the beam. Wake every crystal with its exact color.',
          buttons: [
            { label: 'Play', primary: true, onClick: () => startLevel(firstUnsolved()) },
            { label: 'Choose puzzle', onClick: showLevelSelect }
          ]
        });
      }

      function resume() {
        if (level && !cs.all) {
          state = 'play';
          api.setStatus((idx + 1) + '/' + LEVELS.length + ' · ' + level.def.hint);
        } else showStart();
      }

      function showLevelSelect() {
        state = 'menu';
        winToken++;
        const done = solved.filter(Boolean).length;
        api.menu({
          title: 'Choose a puzzle',
          text: done + ' of ' + LEVELS.length + ' solved this session · ' + total() + ' pts.',
          buttons: GROUPS.map((g, k) => ({ label: g.label, primary: k === Math.floor(firstUnsolved() / 5), onClick: () => showGroup(g) }))
            .concat([{ label: 'Back', onClick: resume }])
        });
      }

      function showGroup(g) {
        const buttons = [];
        for (let n = g.from; n < g.from + 5 && n < LEVELS.length; n++) {
          buttons.push({
            label: (n + 1) + ' · ' + LEVELS[n].name + (solved[n] ? ' ✓' : ''),
            primary: n === firstUnsolved(),
            onClick: () => startLevel(n)
          });
        }
        buttons.push({ label: 'Back', onClick: showLevelSelect });
        api.menu({ title: g.label, text: 'Pick a puzzle. A ✓ marks the ones you solved this session.', buttons });
      }

      function pressButton(id) {
        if (id === 'undo') undo();
        else if (id === 'reset') clearBoard();
        else if (id === 'levels') {
          drag = null;
          showLevelSelect();
        }
      }

      /* ---------- Input ---------- */

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play' || api.menuOpen) return;
        const p = api.toCanvas(e, canvas);
        kb = false;
        hover = cellAt(p);
        for (let k = 0; k < BUTTONS.length; k++) {
          if (inside(p, buttonRect(k))) {
            pressButton(BUTTONS[k].id);
            return;
          }
        }
        for (let k = 0; k < level.slots.length; k++) {
          if (!inside(p, slotRect(k))) continue;
          sel = k;
          const kind = level.slots[k];
          api.sfx('tick');
          if (remaining(kind) > 0) drag = { kind, from: -1, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, t: clock, done: false };
          else api.setStatus('No ' + KIND_LABEL[kind].toLowerCase() + 's left. Right-click or hold a placed one to take it back.');
          return;
        }
        const i = cellAt(p);
        if (i < 0) return;
        cursor = { x: i % COLS, y: (i / COLS) | 0 };
        if (e.button === 2) {
          removeAt(i);
          return;
        }
        const pc = placed.get(i);
        if (pc) {
          drag = { kind: pc.k, from: i, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, t: clock, done: false };
          return;
        }
        if (canPlace(i)) place(i, level.slots[sel]);
        else if (level.base[i] && level.base[i].fixed) api.setStatus('That piece is bolted to the board.');
        else if (level.base[i] && level.base[i].t === 'glass') api.setStatus('Glass lets light through, but nothing can sit on it.');
      });

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        hover = cellAt(p);
        if (drag && !drag.done) {
          drag.x = p.x;
          drag.y = p.y;
          if (!drag.moved && Math.hypot(p.x - drag.sx, p.y - drag.sy) > 10) drag.moved = true;
        }
      });

      api.on(window, 'pointerup', (e) => {
        const d = drag;
        drag = null;
        if (!d || d.done || state !== 'play' || api.menuOpen) return;
        const p = api.toCanvas(e, canvas);
        const i = cellAt(p);
        if (!d.moved) {
          if (d.from >= 0) rotate(d.from);
          return;
        }
        if (d.from < 0) {
          if (i >= 0) place(i, d.kind);
          return;
        }
        if (i === d.from) return;
        if (i < 0) removeAt(d.from);
        else if (canPlace(i)) movePiece(d.from, i);
        else api.sfx('hit');
      });

      api.on(window, 'pointercancel', () => { drag = null; });

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || api.menuOpen) return;
        const mv = MOVES[e.code];
        if (mv) {
          if (kb) {
            cursor.x = U.clamp(cursor.x + mv[0], 0, COLS - 1);
            cursor.y = U.clamp(cursor.y + mv[1], 0, ROWS - 1);
          } else if (hover >= 0) {
            cursor = { x: hover % COLS, y: (hover / COLS) | 0 };
          }
          kb = true;
          return;
        }
        if (e.repeat) return;
        const dm = /^Digit([1-6])$/.exec(e.code);
        if (dm) {
          const k = Number(dm[1]) - 1;
          if (k < level.slots.length) {
            sel = k;
            api.sfx('tick');
            const kind = level.slots[k];
            api.setStatus(KIND_LABEL[kind] + ' selected (' + remaining(kind) + ' left). Space places it at the cursor.');
          }
          return;
        }
        const i = cursor.y * COLS + cursor.x;
        if (e.code === 'Space' || e.code === 'Enter') {
          kb = true;
          if (placed.has(i)) rotate(i);
          else if (canPlace(i)) place(i, level.slots[sel]);
          else api.sfx('hit');
        } else if (e.code === 'Backspace' || e.code === 'Delete') {
          kb = true;
          removeAt(i);
        } else if (e.code === 'KeyZ') {
          undo();
        } else if (e.code === 'KeyR') {
          clearBoard();
        }
      });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        flash = Math.max(0, flash - dt * 1.6);
        if (drag && !drag.done && drag.from >= 0 && !drag.moved && clock - drag.t >= LONG_PRESS) {
          drag.done = true;
          if (state === 'play') removeAt(drag.from);
          drag = null;
        }
        for (const p of particles) {
          p.vx *= 1 - dt * 2;
          p.vy *= 1 - dt * 2;
          p.vy += 30 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
      }

      /* ---------- Draw ---------- */

      function drawHeader() {
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.fillStyle = C.gold;
        const num = String(idx + 1).padStart(2, '0');
        ctx.fillText(num, OX, 32);
        const nw = ctx.measureText(num).width;
        ctx.font = '800 17px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(level.def.name, OX + nw + 12, 33);
        // Crystal tally on the right of the board.
        const n = level.crystals.length;
        let x = OX + BW - 10;
        ctx.font = FONT_HUD;
        ctx.textAlign = 'right';
        ctx.fillStyle = cs.all ? C.gold : C.muted;
        ctx.fillText(cs.lit + '/' + n + ' lit', x, 33);
        x -= ctx.measureText(cs.lit + '/' + n + ' lit').width + 16;
        for (let k = n - 1; k >= 0; k--) {
          const i = level.crystals[k];
          const want = grid[i].c;
          const on = litNow[i];
          hexPath(ctx, x, 33, 7);
          ctx.fillStyle = on ? LIGHT[want] : U.alpha(LIGHT[want], 0.18);
          ctx.fill();
          ctx.strokeStyle = LIGHT[want];
          ctx.lineWidth = 1.5;
          ctx.stroke();
          x -= 20;
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText(total() + ' pts', W - 16, 33);
      }

      function drawBoard() {
        U.roundRect(ctx, OX - 6, OY - 6, BW + 12, BH + 12, 12);
        ctx.fillStyle = C.panel;
        ctx.fill();
        ctx.strokeStyle = U.alpha(C.line, 0.5);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x++) {
          ctx.moveTo(OX + x * CELL + 0.5, OY);
          ctx.lineTo(OX + x * CELL + 0.5, OY + BH);
        }
        for (let y = 0; y <= ROWS; y++) {
          ctx.moveTo(OX, OY + y * CELL + 0.5);
          ctx.lineTo(OX + BW, OY + y * CELL + 0.5);
        }
        ctx.stroke();
        // Hover / drop target.
        const target = drag && drag.moved ? cellAt(drag) : kb ? -1 : hover;
        if (state === 'play' && target >= 0) {
          const ok = canPlace(target) || placed.has(target) || (drag && target === drag.from);
          ctx.fillStyle = drag && drag.moved ? U.alpha(ok ? C.mint : C.p1, 0.18) : U.alpha(C.text, 0.05);
          ctx.fillRect(cellX(target) + 1, cellY(target) + 1, CELL - 1, CELL - 1);
        }
        for (let i = 0; i < N; i++) {
          const cell = level.base[i];
          if (cell && (cell.t === 'wall' || cell.t === 'glass')) drawCell(ctx, cell, cellX(i), cellY(i), CELL, clock);
        }
        drawBeams(ctx, beam.segs, OX, OY, CELL, clock);
        for (let i = 0; i < N; i++) {
          const cell = grid[i];
          if (!cell || cell.t === 'wall' || cell.t === 'glass') continue;
          const x = cellX(i);
          const y = cellY(i);
          if (cell.t === 'crystal') {
            const want = 1 << cell.c;
            const st = beam.hits[i] === want ? 'lit' : beam.hits[i] & ~want ? 'wrong' : 'dim';
            drawCell(ctx, cell, x, y, CELL, clock, { state: st, k: U.clamp((clock - litAt[i]) / 0.4, 0, 1) });
            continue;
          }
          const p = placed.get(i);
          let s = CELL;
          if (p) s = CELL * (1 + Math.max(0, 0.18 - (clock - p.at)) * 1.5);
          ctx.globalAlpha = drag && drag.moved && drag.from === i ? 0.3 : 1;
          drawCell(ctx, cell, x + (CELL - s) / 2, y + (CELL - s) / 2, s, clock, { mix: cell.t === 'merger' ? beam.mOut.get(i) : 0 });
          ctx.globalAlpha = 1;
        }
        if (kb && state === 'play') {
          const x = OX + cursor.x * CELL;
          const y = OY + cursor.y * CELL;
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([7, 5]);
          ctx.lineDashOffset = -clock * 20;
          U.roundRect(ctx, x + 3, y + 3, CELL - 6, CELL - 6, 8);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      function drawTray() {
        ctx.textBaseline = 'middle';
        ctx.font = FONT_SMALL;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('TRAY · ' + (level.total - placed.size) + ' left', TX + 2, OY - 14 + 2);
        level.slots.forEach((kind, k) => {
          const r = slotRect(k);
          const left = remaining(kind);
          U.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
          ctx.fillStyle = k === sel ? C.panel2 : C.panel;
          ctx.fill();
          ctx.lineWidth = k === sel ? 2 : 1;
          ctx.strokeStyle = k === sel ? C.gold : U.alpha(C.line, 0.8);
          ctx.stroke();
          ctx.globalAlpha = left > 0 ? 1 : 0.35;
          drawPiece(ctx, kind, 0, r.x + 30, r.y + r.h / 2, 46, false);
          ctx.textAlign = 'left';
          ctx.font = FONT_SMALL;
          ctx.fillStyle = C.text;
          ctx.fillText(KIND_LABEL[kind], r.x + 60, r.y + 21);
          ctx.fillStyle = C.muted;
          ctx.fillText(KIND_TIP[kind], r.x + 60, r.y + 39);
          ctx.textAlign = 'right';
          ctx.font = FONT_HUD;
          ctx.fillStyle = left > 0 ? C.gold : C.muted;
          ctx.fillText('×' + left, r.x + r.w - 10, r.y + 21);
          ctx.font = FONT_SMALL;
          ctx.fillStyle = U.alpha(C.muted, 0.8);
          ctx.fillText('[' + (k + 1) + ']', r.x + r.w - 10, r.y + 40);
          ctx.globalAlpha = 1;
        });
        BUTTONS.forEach((b, k) => {
          const r = buttonRect(k);
          U.roundRect(ctx, r.x, r.y, r.w, r.h, 9);
          ctx.fillStyle = C.panel;
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.line, 0.9);
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.font = FONT_SMALL;
          ctx.fillStyle = b.id === 'undo' && !history.length ? U.alpha(C.muted, 0.5) : C.text;
          ctx.fillText(b.label, r.x + r.w / 2, r.y + r.h / 2 + 1);
        });
        ctx.textAlign = 'left';
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (!level) {
          // Title backdrop behind the start menu.
          const s = 50;
          drawBeams(ctx, [[-1, 4.3, 7, 4.3, 7], [7, 4.3, 16, 4.3, 1], [7, 4.3, 7, -1, 2], [7, 4.3, 7, 11, 4]], 0, 0, s, clock);
          drawPiece(ctx, 'prism', 0, 7.5 * s, 4.8 * s, s, false);
          return;
        }
        drawHeader();
        drawBoard();
        drawTray();
        if (drag && drag.moved) {
          ctx.globalAlpha = 0.9;
          const p = drag.from >= 0 ? placed.get(drag.from) : null;
          drawPiece(ctx, drag.kind, p ? p.o : 0, drag.x, drag.y, CELL, false);
          ctx.globalAlpha = 1;
        }
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        if (flash > 0) {
          ctx.fillStyle = U.alpha('#FFFFFF', flash * 0.22);
          ctx.fillRect(OX, OY, BW, BH);
        }
        if (state === 'won') {
          const k = U.clamp((clock - winT) / 0.35, 0, 1);
          ctx.save();
          ctx.translate(OX + BW / 2, OY + BH / 2);
          ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
          ctx.globalAlpha = k;
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.ink, 0.7);
          ctx.fillText('ALL LIT', 3, 4);
          ctx.fillStyle = C.gold;
          ctx.fillText('ALL LIT', 0, 0);
          ctx.restore();
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
