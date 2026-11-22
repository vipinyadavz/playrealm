/* Bubble Pop — hex bubble shooter where the ceiling only drops when you miss. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 720;
  const H = 640;
  const R = 20;
  const COLS = 12;
  const ROW_H = R * Math.sqrt(3);
  const FW = COLS * 2 * R;
  const FX = (W - FW) / 2;
  const FT = 30;          // where the ceiling rests at the start of a level
  const DEAD = 548;       // no bubble may reach past this line
  const SX = W / 2;
  const SY = 598;
  const NX = SX - 96;     // the "next" bubble cradle
  const NY = SY + 10;
  const SPEED = 1150;
  const HIT = 2 * R - 6;  // a little forgiving, so shots slip through tight gaps
  const MISS_LIMIT = 4;
  const BOMB_EVERY = 12;
  const BLAST = 2;
  const MAX_ROWS = 22;
  const MIN_ANG = -Math.PI + 0.13;
  const MAX_ANG = -0.13;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const PAL = [
    { base: '#FF5D73', hi: '#FFC9D1', lo: '#A8203A', mark: 'dot' },
    { base: '#36C9F0', hi: '#CDF4FF', lo: '#11789A', mark: 'diamond' },
    { base: '#FFC53D', hi: '#FFF2C4', lo: '#B57A00', mark: 'star' },
    { base: '#4BE3A0', hi: '#CEFFE8', lo: '#14895A', mark: 'tri' },
    { base: '#9B7BFF', hi: '#E1D7FF', lo: '#5636C4', mark: 'ring' }
  ];

  /* ---------- Hex grid model. Odd rows sit half a bubble to the right and hold one fewer. ---------- */

  const colsIn = (r) => (r % 2 ? COLS - 1 : COLS);
  const valid = (r, c) => r >= 0 && r < MAX_ROWS && c >= 0 && c < colsIn(r);
  const cellX = (r, c) => FX + R + c * 2 * R + (r % 2 ? R : 0);
  const cellY = (r, ceil) => ceil + R + r * ROW_H;

  function makeGrid() {
    const g = [];
    for (let r = 0; r < MAX_ROWS; r++) g.push(new Array(colsIn(r)).fill(null));
    return g;
  }

  function neighbors(r, c) {
    const d = r % 2
      ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
      : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
    const out = [];
    for (const [dr, dc] of d) if (valid(r + dr, c + dc)) out.push([r + dr, c + dc]);
    return out;
  }

  /* Connected same-colour bubbles including (r, c). */
  function cluster(grid, r, c) {
    const start = grid[r][c];
    if (!start) return [];
    const seen = new Set([r * COLS + c]);
    const out = [[r, c]];
    for (let i = 0; i < out.length; i++) {
      for (const [a, b] of neighbors(out[i][0], out[i][1])) {
        const k = a * COLS + b;
        if (seen.has(k) || !grid[a][b] || grid[a][b].color !== start.color) continue;
        seen.add(k);
        out.push([a, b]);
      }
    }
    return out;
  }

  /* Every cell (occupied or not) within `dist` steps of (r, c), including itself. */
  function within(r, c, dist) {
    const seen = new Set([r * COLS + c]);
    let ring = [[r, c]];
    const out = [[r, c]];
    for (let d = 0; d < dist; d++) {
      const next = [];
      for (const [a, b] of ring) {
        for (const [x, y] of neighbors(a, b)) {
          const k = x * COLS + y;
          if (seen.has(k)) continue;
          seen.add(k);
          next.push([x, y]);
          out.push([x, y]);
        }
      }
      ring = next;
    }
    return out;
  }

  /* Bubbles no longer connected to the ceiling. */
  function findFloating(grid) {
    const seen = new Set();
    const stack = [];
    for (let c = 0; c < colsIn(0); c++) {
      if (grid[0][c]) {
        seen.add(c);
        stack.push([0, c]);
      }
    }
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [a, b] of neighbors(r, c)) {
        const k = a * COLS + b;
        if (!seen.has(k) && grid[a][b]) {
          seen.add(k);
          stack.push([a, b]);
        }
      }
    }
    const out = [];
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < colsIn(r); c++) if (grid[r][c] && !seen.has(r * COLS + c)) out.push([r, c]);
    }
    return out;
  }

  function hitAt(grid, x, y, ceil) {
    if (y - R <= ceil) return true;
    const r0 = Math.round((y - ceil - R) / ROW_H);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(MAX_ROWS - 1, r0 + 1); r++) {
      for (let c = 0; c < colsIn(r); c++) {
        if (grid[r][c] && Math.hypot(cellX(r, c) - x, cellY(r, ceil) - y) < HIT) return true;
      }
    }
    return false;
  }

  /* Nearest empty cell to (x, y) that touches the ceiling or another bubble. */
  function snapCell(grid, x, y, ceil) {
    let best = null;
    let bd = Infinity;
    const scan = (r) => {
      for (let c = 0; c < colsIn(r); c++) {
        if (grid[r][c]) continue;
        if (r > 0 && !neighbors(r, c).some(([a, b]) => grid[a][b])) continue;
        const d = Math.hypot(cellX(r, c) - x, cellY(r, ceil) - y);
        if (d < bd) {
          bd = d;
          best = { r, c };
        }
      }
    };
    const r0 = Math.round((y - ceil - R) / ROW_H);
    for (let r = Math.max(0, r0 - 1); r <= Math.min(MAX_ROWS - 1, r0 + 1); r++) scan(r);
    if (!best) for (let r = 0; r < MAX_ROWS; r++) scan(r);
    return best;
  }

  /* Flight path from the launcher at angle `ang`, bouncing off the side walls. */
  function trace(grid, ceil, ang) {
    let x = SX;
    let y = SY;
    let dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const pts = [{ x, y }];
    let firstBounce = -1;
    const left = FX + R;
    const right = FX + FW - R;
    for (let i = 0; i < 3000; i++) {
      x += dx * 4;
      y += dy * 4;
      if (x < left) {
        x = 2 * left - x;
        dx = -dx;
        pts.push({ x: left, y, bounce: true });
        if (firstBounce < 0) firstBounce = pts.length - 1;
      } else if (x > right) {
        x = 2 * right - x;
        dx = -dx;
        pts.push({ x: right, y, bounce: true });
        if (firstBounce < 0) firstBounce = pts.length - 1;
      }
      if (hitAt(grid, x, y, ceil)) break;
    }
    pts.push({ x, y });
    return { pts, x, y, firstBounce };
  }

  /* ---------- Level patterns: (row, col, rows) -> filled? ---------- */

  const PATTERNS = [
    () => true,
    (r, c) => {
      const cut = Math.floor(r / 2);
      return c >= cut && c < colsIn(r) - cut;
    },
    (r, c) => r < 2 || Math.floor(c / 2) % 2 === 0,
    (r, c) => (r + Math.floor(c / 3)) % 4 !== 3,
    (r, c) => {
      const x = c + (r % 2 ? 0.5 : 0);
      return r < 1 || Math.hypot(x - 2.6, r * 0.9 - 2) < 3.3 || Math.hypot(x - 8.4, r * 0.9 - 2) < 3.3;
    },
    (r, c) => !(r % 3 === 2 && c % 3 !== 0),
    (r, c, rows) => {
      const x = c + (r % 2 ? 0.5 : 0);
      return Math.abs(x - 5.5) >= (r / rows) * 4 - 0.5 || r < 2;
    }
  ];

  function genLevel(n, hard) {
    const g = makeGrid();
    const nCol = hard ? 5 : n <= 2 ? 4 : 5;
    const rows = Math.min(hard ? 8 + n : 5 + n, hard ? 11 : 10);
    const pat = PATTERNS[(n - 1) % PATTERNS.length];
    const palette = U.shuffle([0, 1, 2, 3, 4]).slice(0, nCol);
    const holes = n > 6 ? Math.min(0.15, (n - 6) * 0.025) : 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < colsIn(r); c++) {
        if (!pat(r, c, rows) || (r > 0 && Math.random() < holes)) continue;
        const prev = neighbors(r, c).filter(([a, b]) => (a < r || (a === r && b < c)) && g[a][b]);
        const color = prev.length && Math.random() < 0.5
          ? g[prev[0][0]][prev[0][1]].color
          : U.pick(palette);
        g[r][c] = { color, sq: 0 };
      }
    }
    findFloating(g).forEach(([a, b]) => { g[a][b] = null; });
    if (!g[0].some(Boolean)) for (let c = 0; c < COLS; c++) g[0][c] = { color: U.pick(palette), sq: 0 };
    return g;
  }

  /* ---------- Drawing ---------- */

  function drawMark(ctx, mark, x, y, s) {
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth = s * 0.22;
    ctx.beginPath();
    if (mark === 'dot') {
      ctx.arc(x, y, s * 0.36, 0, Math.PI * 2);
      ctx.fill();
    } else if (mark === 'diamond') {
      ctx.moveTo(x, y - s * 0.5);
      ctx.lineTo(x + s * 0.4, y);
      ctx.lineTo(x, y + s * 0.5);
      ctx.lineTo(x - s * 0.4, y);
      ctx.closePath();
      ctx.fill();
    } else if (mark === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? s * 0.22 : s * 0.52;
        if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else if (mark === 'tri') {
      ctx.moveTo(x, y - s * 0.45);
      ctx.lineTo(x + s * 0.45, y + s * 0.35);
      ctx.lineTo(x - s * 0.45, y + s * 0.35);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.arc(x, y, s * 0.34, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawBubble(ctx, color, x, y, r) {
    const p = PAL[color];
    const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, p.hi);
    grd.addColorStop(0.5, p.base);
    grd.addColorStop(1, p.lo);
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = U.alpha(p.lo, 0.9);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawMark(ctx, p.mark, x + r * 0.08, y + r * 0.1, r * 0.75);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.24, r * 0.13, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBomb(ctx, x, y, r, t) {
    const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, '#5B5590');
    grd.addColorStop(0.6, '#26214C');
    grd.addColorStop(1, '#0F0D24');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r - 1, 0, Math.PI * 2);
    ctx.fill();
    const p = 0.5 + 0.5 * Math.sin(t * 9);
    ctx.strokeStyle = U.alpha(C.p1, 0.6 + 0.4 * p);
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // Two-ring blast mark.
    ctx.strokeStyle = U.alpha(C.gold, 0.85);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.08, r * 0.28, 0, Math.PI * 2);
    ctx.moveTo(x + r * 0.55, y + r * 0.08);
    ctx.arc(x, y + r * 0.08, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    // Fuse and spark.
    ctx.strokeStyle = '#D9C9A3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x + r * 0.35, y - r * 0.75);
    ctx.quadraticCurveTo(x + r * 0.6, y - r * 1.05, x + r * 0.85, y - r * 0.95);
    ctx.stroke();
    ctx.fillStyle = U.alpha(C.gold, 0.6 + 0.4 * p);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + t * 4;
      const rr = i % 2 ? r * 0.12 : r * (0.28 + 0.1 * p);
      const px = x + r * 0.88 + Math.cos(a) * rr;
      const py = y - r * 0.97 + Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.36, y - r * 0.42, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAny(ctx, b, x, y, r, t) {
    if (b.bomb) drawBomb(ctx, x, y, r, t);
    else drawBubble(ctx, b.color, x, y, r);
  }

  function drawPlate(ctx, x, w, bottom, t, misses, warn) {
    if (bottom <= 0) return;
    ctx.fillStyle = '#2E2862';
    ctx.fillRect(x, 0, w, bottom);
    // Seams: one per row the ceiling has dropped.
    ctx.strokeStyle = U.alpha(C.line, 0.9);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let y = bottom - 12 - ROW_H; y > 0; y -= ROW_H) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
    }
    ctx.stroke();
    // Hazard stripe along the edge.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, bottom - 8, w, 8);
    ctx.clip();
    ctx.fillStyle = warn ? U.alpha(C.p1, 0.6 + 0.4 * Math.sin(t * 10)) : C.gold;
    ctx.fillRect(x, bottom - 8, w, 8);
    ctx.fillStyle = C.ink;
    for (let sx = x - 20; sx < x + w + 20; sx += 18) {
      ctx.beginPath();
      ctx.moveTo(sx, bottom);
      ctx.lineTo(sx + 9, bottom);
      ctx.lineTo(sx + 17, bottom - 8);
      ctx.lineTo(sx + 8, bottom - 8);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Rivets.
    ctx.fillStyle = U.alpha(C.muted, 0.5);
    for (const rx of [x + 10, x + w - 10]) {
      ctx.beginPath();
      ctx.arc(rx, bottom - 18, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Miss pips, right on the plate that they move.
    const py = bottom - 19;
    if (py > 4) {
      for (let i = 0; i < MISS_LIMIT; i++) {
        const px = x + w / 2 + (i - (MISS_LIMIT - 1) / 2) * 22;
        ctx.beginPath();
        ctx.arc(px, py, 6.5, 0, Math.PI * 2);
        if (i < misses) {
          ctx.fillStyle = C.p1;
          ctx.fill();
        } else {
          ctx.fillStyle = C.ink;
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.p1, 0.7);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }
  }

  Arcade.register({
    id: 'bubble-pop',
    title: 'Bubble Pop',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.p2,
    tagline: 'Aim, bounce and pop bubbles in groups of three or more.',
    hook: 'The ceiling only drops when you miss, and bomb bubbles clear a whole ring.',
    tags: ['bubble shooter', 'bubbles', 'puzzle', 'aim', 'match 3', 'colors', 'touch'],
    howTo: 'Shoot bubbles at the cluster hanging from the ceiling. Land next to two or more of the same colour to pop ' +
      'them, and anything left hanging without a link to the ceiling falls for bonus points. Bank shots off the side ' +
      'walls; the guide shows your first bounce. The twist: only misses move the ceiling. A shot that pops nothing ' +
      'lights a pip, and four pips drop the ceiling one row, while shots that pop never move it. Every 12 shots a bomb ' +
      'joins the queue and blasts every bubble within two rings of where it lands, whatever the colour. Clear the ' +
      'board to reach the next level; if bubbles cross the line at the bottom, the game ends.',
    controls: [
      { keys: ['Mouse', 'Drag'], label: 'Aim' },
      { keys: ['Click', 'Release'], label: 'Shoot' },
      { keys: ['←', '→'], label: 'Aim' },
      { keys: ['Space', 'Enter', '↑'], label: 'Shoot' },
      { keys: ['Shift'], label: 'Swap with the next bubble (or tap it)' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const r = 13;
      const rowH = r * Math.sqrt(3);
      const cols = 10;
      const fx = (w - cols * 2 * r) / 2;
      ctx.fillStyle = C.panel;
      ctx.fillRect(fx, 0, cols * 2 * r, h);
      drawPlate(ctx, fx, cols * 2 * r, 40, t, 3, true);
      const rows = ['0012233441', '011223344', '4400122310', '44003311', '22  33'];
      rows.forEach((row, ri) => {
        for (let c = 0; c < row.length; c++) {
          if (row[c] === ' ') continue;
          drawBubble(ctx, Number(row[c]), fx + r + c * 2 * r + (ri % 2 ? r : 0), 40 + r + ri * rowH, r);
        }
      });
      // Aim line banking off the right wall toward the cluster.
      const sx = w / 2;
      const sy = h - 14;
      const bx = fx + cols * 2 * r - r;
      const by = 118;
      const ex = fx + 5 * 2 * r + r;
      const ey = 40 + r + 4 * rowH;
      ctx.fillStyle = U.alpha(C.text, 0.8);
      for (let i = 0; i <= 10; i++) {
        const k = i / 10;
        ctx.beginPath();
        ctx.arc(U.lerp(sx, bx, k), U.lerp(sy, by, k), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 1; i <= 5; i++) {
        const k = i / 7;
        ctx.globalAlpha = 1 - i / 6;
        ctx.beginPath();
        ctx.arc(U.lerp(bx, ex, k), U.lerp(by, ey, k), 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Bomb in flight with its blast ring.
      const k = (t * 0.5 + 0.35) % 1;
      const fxp = k < 0.6 ? U.lerp(sx, bx, k / 0.6) : U.lerp(bx, ex, (k - 0.6) / 0.4 * 0.7);
      const fyp = k < 0.6 ? U.lerp(sy, by, k / 0.6) : U.lerp(by, ey, (k - 0.6) / 0.4 * 0.7);
      ctx.strokeStyle = U.alpha(C.p1, 0.5);
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ex, ey, r * 4.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawBomb(ctx, fxp, fyp, r, t);
      // Launcher.
      ctx.fillStyle = C.panel2;
      ctx.beginPath();
      ctx.arc(sx, h + 4, 26, Math.PI, 0);
      ctx.fill();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | aim | fly | drop | clear | over
      let hard = false;
      let level = 1;
      let grid = makeGrid();
      let ceil = FT;
      let ceilTo = FT;
      let score = 0;
      let shots = 0;
      let misses = 0;
      let drops = 0;
      let popTotal = 0;
      let cur = null;
      let nxt = null;
      let ang = -Math.PI / 2;
      let aimHold = 0;
      let ball = null;
      let pressed = false;
      let pops = [];
      let fallers = [];
      let parts = [];
      let rings = [];
      let texts = [];
      let banner = null;
      let shake = 0;
      let pulse = 0;
      let round = 0;
      let gridVer = 0;
      let aimCache = null;
      let tipsSeen = {};
      let tipText = '';
      let tipT = 0;
      let lastStatus = '';
      let swapPop = 0;
      let flash = 0;

      function tip(text, secs) {
        tipText = text;
        tipT = secs || 4;
      }

      function tipOnce(id, text, secs) {
        if (tipsSeen[id]) return;
        tipsSeen[id] = true;
        tip(text, secs || 5);
      }

      function colorsPresent() {
        const set = new Set();
        for (let r = 0; r < MAX_ROWS; r++) {
          for (let c = 0; c < colsIn(r); c++) if (grid[r][c] && grid[r][c].color >= 0) set.add(grid[r][c].color);
        }
        return [...set];
      }

      function randomColor() {
        const present = colorsPresent();
        return present.length ? U.pick(present) : U.randInt(0, PAL.length - 1);
      }

      function makeNext() {
        if (shots > 0 && shots % BOMB_EVERY === 0) {
          tipOnce('bomb', 'A bomb joined the queue. It clears every bubble within two rings of where it lands, any colour.', 6);
          api.sfx('power');
          return { bomb: true, color: -1, pop: 1 };
        }
        return { bomb: false, color: randomColor(), pop: 1 };
      }

      function recolorQueue() {
        const present = colorsPresent();
        if (!present.length) return;
        for (const b of [cur, nxt]) {
          if (b && !b.bomb && !present.includes(b.color)) {
            b.color = U.pick(present);
            b.pop = 1;
          }
        }
      }

      function lowestBottom() {
        for (let r = MAX_ROWS - 1; r >= 0; r--) {
          if (grid[r].some(Boolean)) return cellY(r, ceil) + R;
        }
        return -Infinity;
      }

      const isEmpty = () => grid.every((row) => row.every((x) => !x));

      function showStartMenu() {
        state = 'menu';
        round++;
        api.setStatus('Pop groups of three. Only misses bring the ceiling down.');
        api.menu({
          title: 'Bubble Pop',
          text: 'Aim and shoot to pop groups of three or more. A shot that pops nothing is a miss, and four misses ' +
            'drop the ceiling one row. Every 12 shots you get a bomb.',
          buttons: [
            { label: 'Normal', primary: true, onClick: () => startGame(false) },
            { label: 'Hard · 5 colours, more rows', onClick: () => startGame(true) }
          ]
        });
      }

      function startGame(isHard) {
        round++;
        hard = isHard;
        score = 0;
        shots = 0;
        drops = 0;
        popTotal = 0;
        tipsSeen = {};
        pops = [];
        fallers = [];
        parts = [];
        rings = [];
        texts = [];
        ball = null;
        pressed = false;
        ang = -Math.PI / 2;
        api.setScore(0);
        startLevel(1);
        cur = { bomb: false, color: randomColor(), pop: 1 };
        nxt = { bomb: false, color: randomColor(), pop: 1 };
        tip('Aim with the mouse or ←/→, shoot with a click or Space. Four misses drop the ceiling.', 5);
      }

      function startLevel(n) {
        level = n;
        grid = genLevel(n, hard);
        gridVer++;
        misses = 0;
        ceilTo = FT;
        ceil = FT - 360;
        state = 'drop';
        banner = { text: 'Level ' + n, sub: n === 1 ? '' : 'Ceiling reset, misses cleared', life: 1.4, age: 0, color: C.p2 };
        recolorQueue();
      }

      function canShoot() {
        return state === 'aim' && !!cur && !api.menuOpen;
      }

      function shoot() {
        if (!canShoot()) return;
        const tr = trace(grid, ceil, ang);
        const cell = snapCell(grid, tr.x, tr.y, ceil);
        if (!cell) return;
        ball = { pts: tr.pts, i: 0, x: SX, y: SY, color: cur.color, bomb: cur.bomb, cell };
        shots++;
        cur = nxt;
        nxt = makeNext();
        state = 'fly';
        api.sfx('shoot');
      }

      function swapQueue() {
        if (state === 'menu' || state === 'over' || !cur || !nxt) return;
        const t = cur;
        cur = nxt;
        nxt = t;
        cur.pop = 1;
        nxt.pop = 1;
        swapPop = 1;
        api.sfx('flip');
        tipOnce('swap', 'Swapped. Shift or a tap on the next bubble trades it with the loaded one.', 3);
      }

      function burst(x, y, color, n, speed) {
        const col = color >= 0 ? PAL[color].base : C.p1;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = U.rand(60, speed);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: U.rand(0.3, 0.6), max: 0.6, color: col, s: U.rand(2, 4.5) });
        }
        if (parts.length > 600) parts.splice(0, parts.length - 600);
      }

      function land() {
        const b = ball;
        ball = null;
        const { r, c } = b.cell;
        const x0 = cellX(r, c);
        const y0 = cellY(r, ceil);
        grid[r][c] = { color: b.bomb ? -1 : b.color, sq: 1 };
        // Neighbours wobble from the impact.
        neighbors(r, c).forEach(([a, d]) => { if (grid[a][d]) grid[a][d].sq = Math.max(grid[a][d].sq, 0.5); });
        let popped = [];
        if (b.bomb) {
          popped = within(r, c, BLAST).filter(([a, d]) => grid[a][d]);
          rings.push({ x: x0, y: y0, r: R, grow: 520, life: 0.45, max: 0.45, color: C.gold, w: 10 });
          rings.push({ x: x0, y: y0, r: R * 0.5, grow: 320, life: 0.35, max: 0.35, color: C.p1, w: 6 });
          burst(x0, y0, -1, 30, 420);
          shake = 12;
          flash = 0.5;
          api.sfx('boom');
        } else {
          const cl = cluster(grid, r, c);
          if (cl.length >= 3) popped = cl;
        }
        popped.forEach(([a, d], i) => {
          const cell = grid[a][d];
          const px = cellX(a, d);
          const py = cellY(a, ceil);
          const dist = Math.hypot(px - x0, py - y0);
          pops.push({ x: px, y: py, color: cell.color, t: -dist / 900 - i * 0.004, bomb: cell.color < 0 });
          grid[a][d] = null;
        });
        const fell = popped.length ? findFloating(grid) : [];
        fell.forEach(([a, d]) => {
          fallers.push({ x: cellX(a, d), y: cellY(a, ceil), vx: U.rand(-90, 90), vy: U.rand(-160, -20), color: grid[a][d].color, rot: 0 });
          grid[a][d] = null;
        });
        gridVer++;
        const poppedReal = popped.filter(([a, d]) => !(a === r && d === c && b.bomb)).length;
        const hit = poppedReal > 0;
        if (hit) {
          popTotal += poppedReal + fell.length;
          const gained = poppedReal * 10 + fell.length * 25 + (fell.length >= 6 ? fell.length * 10 : 0);
          score += gained;
          api.setScore(score);
          texts.push({ x: x0, y: y0, text: '+' + gained, color: fell.length ? C.gold : C.text, life: 1.1, size: gained >= 200 ? 24 : 17 });
          if (fell.length) {
            texts.push({ x: x0, y: y0 + 26, text: fell.length + ' dropped', color: C.mint, life: 1.1, size: 13 });
            tipOnce('drop', 'Bubbles cut off from the ceiling fall for 25 points each.', 4);
          }
          if (!b.bomb) api.sfx(fell.length >= 4 ? 'power' : 'score');
        } else {
          misses++;
          api.sfx('hit');
          if (misses >= MISS_LIMIT) {
            misses = 0;
            dropCeiling();
          } else if (misses === 1) {
            tipOnce('miss', 'That shot popped nothing: 1 of 4 miss pips. Four misses drop the ceiling one row.', 6);
          } else if (misses === MISS_LIMIT - 1) {
            tip('One more miss and the ceiling drops.', 3);
          }
        }
        recolorQueue();
        if (isEmpty()) {
          levelClear();
          return;
        }
        if (state !== 'drop') {
          if (lowestBottom() > DEAD + 0.5) gameOver();
          else state = 'aim';
        }
        const lb = lowestBottom();
        if (state === 'aim' && lb > DEAD - ROW_H * 2) tipOnce('danger', 'Careful: the bubbles are close to the line.', 3);
      }

      function dropCeiling() {
        ceilTo += ROW_H;
        drops++;
        state = 'drop';
        shake = 10;
        api.sfx('boom');
        if (!tipsSeen.ceiling) {
          tipOnce('ceiling', 'Four misses: the ceiling dropped a row. Shots that pop something never move it.', 6);
        } else tip('The ceiling dropped a row.', 2.5);
      }

      function levelClear() {
        state = 'clear';
        const bonus = 250 + level * 250;
        score += bonus;
        api.setScore(score);
        api.sfx('win');
        banner = { text: 'Level clear', sub: '+' + bonus + ' bonus', life: 1.8, age: 0, color: C.mint };
        for (let i = 0; i < 80; i++) {
          parts.push({ x: U.rand(FX, FX + FW), y: U.rand(-40, 0), vx: U.rand(-40, 40), vy: U.rand(60, 260), life: U.rand(1.2, 2.2), max: 2.2,
            color: PAL[U.randInt(0, PAL.length - 1)].base, s: U.rand(3, 6) });
        }
        const token = round;
        api.after(1900, () => {
          if (token !== round || state !== 'clear') return;
          startLevel(level + 1);
        });
      }

      function gameOver() {
        if (state === 'over') return;
        state = 'over';
        flash = 0.8;
        api.sfx('lose');
        // Everything left tumbles down.
        for (let r = 0; r < MAX_ROWS; r++) {
          for (let c = 0; c < colsIn(r); c++) {
            const cell = grid[r][c];
            if (!cell) continue;
            fallers.push({ x: cellX(r, c), y: cellY(r, ceil), vx: U.rand(-60, 60), vy: U.rand(-120, 0) - r * 6, color: cell.color, rot: 0, slow: true });
            grid[r][c] = null;
          }
        }
        const isBest = api.reportScore(score);
        lastStatus = 'The bubbles crossed the line on level ' + level + '. Final score ' + score + '.';
        api.setStatus(lastStatus);
        const token = round;
        api.after(1300, () => {
          if (token !== round) return;
          api.menu({
            title: isBest ? 'New best: ' + score + '!' : 'Game over',
            text: 'You reached level ' + level + ' with ' + score + ' points, popped ' + popTotal + ' bubbles and let the ceiling drop ' +
              drops + ' time' + (drops === 1 ? '' : 's') + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(hard) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      /* ---------- Update ---------- */

      function moveBall(dt) {
        let left = SPEED * dt;
        while (ball && left > 0) {
          const next = ball.pts[ball.i + 1];
          if (!next) {
            land();
            return;
          }
          const d = Math.hypot(next.x - ball.x, next.y - ball.y);
          if (left >= d) {
            ball.x = next.x;
            ball.y = next.y;
            ball.i++;
            left -= d;
            if (next.bounce) {
              api.sfx('tick');
              rings.push({ x: next.x, y: next.y, r: 4, grow: 90, life: 0.2, max: 0.2, color: C.p2, w: 2 });
            }
          } else {
            ball.x += ((next.x - ball.x) / d) * left;
            ball.y += ((next.y - ball.y) / d) * left;
            left = 0;
          }
        }
      }

      function update(dt) {
        pulse += dt;
        tipT = Math.max(0, tipT - dt);
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 1.5);
        swapPop = Math.max(0, swapPop - dt * 4);
        if (banner) {
          banner.life -= dt;
          banner.age += dt;
          if (banner.life <= 0) banner = null;
        }
        for (const b of [cur, nxt]) if (b) b.pop = Math.max(0, b.pop - dt * 4);

        if (state === 'aim' || state === 'fly' || state === 'drop') {
          const l = api.keys.has('ArrowLeft') || api.keys.has('KeyA');
          const r = api.keys.has('ArrowRight') || api.keys.has('KeyD');
          if (l !== r) {
            aimHold += dt;
            const speed = 0.45 + Math.min(1.6, aimHold * 1.8);
            ang = U.clamp(ang + (r ? 1 : -1) * speed * dt, MIN_ANG, MAX_ANG);
          } else aimHold = 0;
        }

        if (state === 'fly') moveBall(dt);
        if (state === 'drop') {
          const d = ceilTo - ceil;
          ceil += Math.sign(d) * Math.min(Math.abs(d), Math.max(60, Math.abs(d) * 9) * dt);
          if (Math.abs(ceilTo - ceil) < 0.3) {
            ceil = ceilTo;
            gridVer++;
            if (lowestBottom() > DEAD + 0.5) gameOver();
            else state = 'aim';
          }
        }

        for (let r = 0; r < MAX_ROWS; r++) {
          for (let c = 0; c < colsIn(r); c++) {
            const cell = grid[r][c];
            if (cell && cell.sq > 0) cell.sq = Math.max(0, cell.sq - dt * 3.5);
          }
        }
        pops.forEach((p) => {
          const before = p.t;
          p.t += dt;
          if (before < 0 && p.t >= 0) burst(p.x, p.y, p.color, 8, 220);
        });
        pops = pops.filter((p) => p.t < 0.25);
        fallers.forEach((f) => {
          f.vy += (f.slow ? 900 : 1500) * dt;
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.rot += f.vx * dt * 0.02;
          if (f.x < FX + R || f.x > FX + FW - R) f.vx = -f.vx;
        });
        fallers = fallers.filter((f) => f.y < H + 40);
        parts.forEach((p) => {
          p.life -= dt;
          p.vy += 500 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        });
        parts = parts.filter((p) => p.life > 0);
        rings.forEach((g) => {
          g.life -= dt;
          g.r += g.grow * dt;
        });
        rings = rings.filter((g) => g.life > 0);
        texts.forEach((t) => {
          t.life -= dt;
          t.y -= 40 * dt;
        });
        texts = texts.filter((t) => t.life > 0);

        if (state !== 'menu' && state !== 'over') {
          const toBomb = BOMB_EVERY - (shots % BOMB_EVERY);
          const bombReady = (cur && cur.bomb) || (nxt && nxt.bomb);
          const base = 'Level ' + level + ' · misses ' + misses + '/' + MISS_LIMIT + ' · ' +
            (bombReady ? 'bomb in the queue' : 'bomb in ' + toBomb + ' shot' + (toBomb === 1 ? '' : 's'));
          const text = tipT > 0 ? tipText : base;
          if (text !== lastStatus) {
            lastStatus = text;
            api.setStatus(text);
          }
        }
      }

      /* ---------- Draw ---------- */

      function drawGuide() {
        if (state !== 'aim' || !cur) return;
        const key = ang.toFixed(4) + '|' + gridVer + '|' + ceil;
        if (!aimCache || aimCache.key !== key) {
          const tr = trace(grid, ceil, ang);
          aimCache = { key, tr, cell: snapCell(grid, tr.x, tr.y, ceil) };
        }
        const { tr, cell } = aimCache;
        // Walk the path: solid dots to the first bounce, then a short fading tail.
        const tail = 130;
        let dist = 0;
        let after = -1;
        let reachedEnd = true;
        const spacing = 15;
        let carry = spacing * 0.6;
        const color = cur.bomb ? C.p1 : PAL[cur.color].base;
        for (let i = 0; i < tr.pts.length - 1; i++) {
          const a = tr.pts[i];
          const b = tr.pts[i + 1];
          const seg = Math.hypot(b.x - a.x, b.y - a.y);
          if (tr.firstBounce >= 0 && i === tr.firstBounce) after = 0;
          let s = carry;
          while (s < seg) {
            const k = s / seg;
            const x = U.lerp(a.x, b.x, k);
            const y = U.lerp(a.y, b.y, k);
            const fade = after >= 0 ? 1 - (after + s) / tail : 1;
            if (fade <= 0) {
              reachedEnd = false;
              break;
            }
            ctx.globalAlpha = 0.85 * fade;
            ctx.fillStyle = (Math.floor((dist + s - pulse * 40) / spacing) % 2) ? C.text : color;
            ctx.beginPath();
            ctx.arc(x, y, 2.6, 0, Math.PI * 2);
            ctx.fill();
            s += spacing;
          }
          if (!reachedEnd) break;
          carry = s - seg;
          dist += seg;
          if (after >= 0) after += seg;
        }
        ctx.globalAlpha = 1;
        // Bounce marker.
        if (tr.firstBounce >= 0) {
          const p = tr.pts[tr.firstBounce];
          ctx.strokeStyle = U.alpha(C.p2, 0.9);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x + (p.x < W / 2 ? -R + 2 : R - 2), p.y, 7, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Landing ghost, shown when the guide reaches it.
        if (cell && reachedEnd) {
          const gx = cellX(cell.r, cell.c);
          const gy = cellY(cell.r, ceil);
          if (cur.bomb) {
            ctx.fillStyle = U.alpha(C.p1, 0.16 + 0.08 * Math.sin(pulse * 8));
            within(cell.r, cell.c, BLAST).forEach(([a, d]) => {
              ctx.beginPath();
              ctx.arc(cellX(a, d), cellY(a, ceil), R - 1, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          ctx.strokeStyle = U.alpha(cur.bomb ? C.p1 : C.text, 0.7);
          ctx.setLineDash([4, 4]);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gx, gy, R - 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      function drawLauncher() {
        // Barrel.
        ctx.save();
        ctx.translate(SX, SY);
        ctx.rotate(ang + Math.PI / 2);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, -11, -52, 22, 44, 8);
        ctx.fill();
        ctx.strokeStyle = U.alpha(C.p2, 0.7);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
        // Base.
        ctx.fillStyle = C.panel2;
        ctx.beginPath();
        ctx.arc(SX, SY + 6, 34, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (cur && state !== 'over') {
          const s = 1 + 0.25 * Math.sin(cur.pop * Math.PI);
          drawAny(ctx, cur, SX, SY, R * s, pulse);
        }
        // Next bubble cradle.
        ctx.fillStyle = C.panel;
        ctx.beginPath();
        ctx.arc(NX, NY, 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = swapPop > 0 ? C.p2 : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (nxt && state !== 'over') {
          const s = 1 + 0.25 * Math.sin(nxt.pop * Math.PI);
          drawAny(ctx, nxt, NX, NY, R * 0.8 * s, pulse);
        }
        ctx.font = FONT_SM;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.muted;
        ctx.fillText('next', NX - 32, NY - 8);
        ctx.fillStyle = U.alpha(C.muted, 0.7);
        ctx.fillText('Shift', NX - 32, NY + 9);
        ctx.textAlign = 'left';
      }

      function drawSide() {
        const lx = FX / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText('LEVEL', lx, 50);
        ctx.font = '800 34px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(String(level), lx, 86);
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText('SCORE', lx, 136);
        ctx.font = '800 20px Unbounded, sans-serif';
        ctx.fillStyle = C.gold;
        ctx.fillText(String(score), lx, 162);
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText('MISSES', lx, 212);
        for (let i = 0; i < MISS_LIMIT; i++) {
          const y = 240 + i * 24;
          ctx.beginPath();
          ctx.arc(lx, y, 8, 0, Math.PI * 2);
          if (i < misses) {
            ctx.fillStyle = C.p1;
            ctx.fill();
          } else {
            ctx.strokeStyle = U.alpha(C.p1, 0.6);
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        ctx.fillStyle = U.alpha(C.muted, 0.85);
        ctx.fillText('4 = drop', lx, 340);

        // Bomb meter on the right.
        const rx = FX + FW + (W - FX - FW) / 2;
        ctx.fillStyle = C.muted;
        ctx.fillText('BOMB', rx, 50);
        const cy = 104;
        const filled = shots % BOMB_EVERY;
        const ready = (cur && cur.bomb) || (nxt && nxt.bomb);
        for (let i = 0; i < BOMB_EVERY; i++) {
          const a0 = -Math.PI / 2 + (i / BOMB_EVERY) * Math.PI * 2 + 0.05;
          const a1 = -Math.PI / 2 + ((i + 1) / BOMB_EVERY) * Math.PI * 2 - 0.05;
          ctx.strokeStyle = ready ? U.alpha(C.p1, 0.6 + 0.4 * Math.sin(pulse * 8)) : i < filled ? C.gold : C.line;
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(rx, cy, 34, a0, a1);
          ctx.stroke();
        }
        drawBomb(ctx, rx, cy + 3, 17, pulse);
        ctx.font = FONT_SM;
        ctx.fillStyle = ready ? C.p1 : C.text;
        const toBomb = BOMB_EVERY - filled;
        ctx.fillText(ready ? 'ready' : 'in ' + toBomb, rx, 158);
        ctx.fillStyle = U.alpha(C.muted, 0.85);
        ctx.fillText('clears 2', rx, 182);
        ctx.fillText('rings', rx, 198);
        ctx.textAlign = 'left';
      }

      function draw() {
        ctx.save();
        if (shake > 0.2) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        // Field.
        ctx.fillStyle = C.panel;
        ctx.fillRect(FX, 0, FW, H);
        ctx.fillStyle = U.alpha(C.line, 0.35);
        for (let y = 24; y < DEAD; y += ROW_H) {
          for (let x = FX + R; x < FX + FW; x += 2 * R) ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        ctx.strokeStyle = U.alpha(C.p2, 0.45);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(FX, 0);
        ctx.lineTo(FX, H);
        ctx.moveTo(FX + FW, 0);
        ctx.lineTo(FX + FW, H);
        ctx.stroke();

        if (state === 'menu' && isEmpty()) {
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.p2, 0.3);
          ctx.fillText('Bubble Pop', W / 2, H / 2 - 40);
          ctx.restore();
          return;
        }

        // Deadline.
        const lb = lowestBottom();
        const danger = state !== 'over' && lb > DEAD - ROW_H * 2;
        ctx.strokeStyle = U.alpha(C.p1, danger ? 0.55 + 0.45 * Math.sin(pulse * 10) : 0.45);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(FX, DEAD);
        ctx.lineTo(FX + FW, DEAD);
        ctx.stroke();
        ctx.setLineDash([]);

        // Bubbles.
        for (let r = 0; r < MAX_ROWS; r++) {
          for (let c = 0; c < colsIn(r); c++) {
            const cell = grid[r][c];
            if (!cell) continue;
            const x = cellX(r, c);
            const y = cellY(r, ceil);
            const s = 1 + 0.12 * Math.sin(cell.sq * Math.PI * 2) * cell.sq;
            if (cell.color < 0) drawBomb(ctx, x, y, R * s, pulse);
            else drawBubble(ctx, cell.color, x, y, R * s);
          }
        }
        drawPlate(ctx, FX, FW, ceil, pulse, misses, misses === MISS_LIMIT - 1 && state !== 'over');

        drawGuide();

        // Pops.
        pops.forEach((p) => {
          if (p.t < 0) {
            if (p.bomb) drawBomb(ctx, p.x, p.y, R, pulse);
            else drawBubble(ctx, p.color, p.x, p.y, R);
            return;
          }
          const k = p.t / 0.25;
          ctx.globalAlpha = 1 - k;
          if (p.bomb) drawBomb(ctx, p.x, p.y, R * (1 + k * 0.6), pulse);
          else drawBubble(ctx, p.color, p.x, p.y, R * (1 + k * 0.6));
          ctx.globalAlpha = 1;
        });
        fallers.forEach((f) => {
          ctx.globalAlpha = U.clamp((H + 40 - f.y) / 120, 0, 1);
          if (f.color < 0) drawBomb(ctx, f.x, f.y, R, pulse);
          else drawBubble(ctx, f.color, f.x, f.y, R);
        });
        ctx.globalAlpha = 1;
        if (ball) {
          const tail = 4;
          for (let i = tail; i >= 1; i--) {
            ctx.globalAlpha = 0.12 * (tail - i + 1);
            const prev = ball.pts[Math.max(0, ball.i)];
            const k = i / (tail + 2);
            ctx.fillStyle = ball.bomb ? C.p1 : PAL[ball.color].base;
            ctx.beginPath();
            ctx.arc(U.lerp(ball.x, prev.x, k * 0.6), U.lerp(ball.y, prev.y, k * 0.6), R * (1 - k * 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          drawAny(ctx, ball, ball.x, ball.y, R, pulse);
        }
        rings.forEach((g) => {
          ctx.strokeStyle = U.alpha(g.color, Math.max(0, g.life / g.max));
          ctx.lineWidth = g.w;
          ctx.beginPath();
          ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
          ctx.stroke();
        });
        parts.forEach((p) => {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        texts.forEach((t) => {
          ctx.globalAlpha = U.clamp(t.life, 0, 1);
          ctx.font = '800 ' + t.size + 'px Unbounded, sans-serif';
          ctx.fillStyle = C.ink;
          ctx.fillText(t.text, t.x + 2, t.y + 2);
          ctx.fillStyle = t.color;
          ctx.fillText(t.text, t.x, t.y);
        });
        ctx.globalAlpha = 1;

        drawLauncher();
        drawSide();

        if (banner) {
          const inT = Math.min(1, banner.age / 0.2);
          const outT = Math.min(1, banner.life / 0.3);
          ctx.save();
          ctx.globalAlpha = Math.min(inT, outT);
          ctx.translate(W / 2, H / 2 - 30);
          const s = 0.75 + 0.25 * inT;
          ctx.scale(s, s);
          ctx.fillStyle = U.alpha(C.ink, 0.8);
          U.roundRect(ctx, -FW / 2 + 20, -56, FW - 40, banner.sub ? 112 : 80, 18);
          ctx.fill();
          ctx.strokeStyle = U.alpha(banner.color, 0.8);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = FONT_BIG;
          ctx.fillStyle = banner.color;
          ctx.fillText(banner.text, 0, -16);
          if (banner.sub) {
            ctx.font = FONT;
            ctx.fillStyle = C.text;
            ctx.fillText(banner.sub, 0, 30);
          }
          ctx.restore();
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(state === 'over' ? C.p1 : C.gold, flash * 0.3);
          ctx.fillRect(-20, -20, W + 40, H + 40);
        }
        ctx.restore();
      }

      /* ---------- Input ---------- */

      function aimAt(p) {
        if (p.y > SY - 12) return;
        ang = U.clamp(Math.atan2(p.y - SY, p.x - SX), MIN_ANG, MAX_ANG);
      }

      const live = () => state !== 'menu' && state !== 'over' && !api.menuOpen;

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(canvas, 'pointermove', (e) => {
        if (!live()) return;
        aimAt(api.toCanvas(e, canvas));
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (!live()) return;
        const p = api.toCanvas(e, canvas);
        if (Math.hypot(p.x - NX, p.y - NY) < 34) {
          swapQueue();
          return;
        }
        if (p.y < SY - 12) {
          aimAt(p);
          pressed = true;
        }
      });
      api.on(canvas, 'pointerup', (e) => {
        if (!pressed) return;
        pressed = false;
        if (!live()) return;
        aimAt(api.toCanvas(e, canvas));
        shoot();
      });
      api.on(canvas, 'pointercancel', () => { pressed = false; });

      api.on(window, 'keydown', (e) => {
        if (!live()) return;
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          if (!e.repeat) shoot();
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'ArrowDown' || e.code === 'KeyS') {
          if (!e.repeat) swapQueue();
        }
      });

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
