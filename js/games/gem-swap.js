/* Gem Swap — 8×8 match-3 where gravity turns every 10 moves, so gems start falling sideways. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 780;
  const H = 600;
  const N = 8;
  const CS = 64;
  const BX = 32;
  const BY = 44;
  const BW = N * CS;
  const PX = BX + BW + 24;
  const PW = W - PX - 20;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const TURN_EVERY = 10;
  const MOVE_LIMIT = 30;
  const TIME_LIMIT = 90;
  const HINT_AFTER = 6;
  const CLEAR_T = 0.26;
  const SWAP_T = 0.15;

  const GEMS = [
    { shape: 'square', base: '#FF5D73', hi: '#FFC2CB', lo: '#A8203A', gx: -0.32, gy: -0.38 },
    { shape: 'diamond', base: '#36C9F0', hi: '#C9F3FF', lo: '#11789A', gx: -0.2, gy: -0.36 },
    { shape: 'star', base: '#FFC53D', hi: '#FFF1BF', lo: '#B57A00', gx: -0.14, gy: -0.3 },
    { shape: 'triangle', base: '#4BE3A0', hi: '#CBFFE7', lo: '#14895A', gx: -0.1, gy: -0.2 },
    { shape: 'circle', base: '#9B7BFF', hi: '#DFD4FF', lo: '#5636C4', gx: -0.32, gy: -0.38 },
    { shape: 'hex', base: '#FF7AD9', hi: '#FFD3F3', lo: '#B3288F', gx: -0.3, gy: -0.36 }
  ];
  /* Gravity turns clockwise: down → left → up → right. */
  const GRAV = [
    { x: 0, y: 1, name: 'down', entry: 'top' },
    { x: -1, y: 0, name: 'left', entry: 'right' },
    { x: 0, y: -1, name: 'up', entry: 'bottom' },
    { x: 1, y: 0, name: 'right', entry: 'left' }
  ];
  const DIRS = {
    ArrowUp: [-1, 0], KeyW: [-1, 0], ArrowDown: [1, 0], KeyS: [1, 0],
    ArrowLeft: [0, -1], KeyA: [0, -1], ArrowRight: [0, 1], KeyD: [0, 1]
  };

  /* ---------- Board model (pure helpers on a grid of gems) ---------- */

  const inB = (r, c) => r >= 0 && r < N && c >= 0 && c < N;
  const keyOf = (r, c) => r * N + c;

  function typeAt(grid, r, c) {
    if (!inB(r, c)) return -1;
    const g = grid[r][c];
    return g && !g.die ? g.type : -1;
  }

  /* Every straight line of 3+ same-type gems. Prisms (type -1) never match. */
  function findRuns(grid) {
    const runs = [];
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < N; a++) {
        let b = 0;
        while (b < N) {
          const t = pass ? typeAt(grid, b, a) : typeAt(grid, a, b);
          let e = b + 1;
          if (t >= 0) {
            while (e < N && (pass ? typeAt(grid, e, a) : typeAt(grid, a, e)) === t) e++;
            if (e - b >= 3) {
              const cells = [];
              for (let k = b; k < e; k++) cells.push(pass ? keyOf(k, a) : keyOf(a, k));
              runs.push({ dir: pass ? 'v' : 'h', type: t, cells });
            }
          }
          b = e;
        }
      }
    }
    return runs;
  }

  /* Runs that share a cell (L and T shapes) form one group. */
  function groupRuns(runs) {
    const parent = runs.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        if (runs[i].type === runs[j].type && runs[i].cells.some((k) => runs[j].cells.includes(k))) {
          parent[find(i)] = find(j);
        }
      }
    }
    const map = new Map();
    runs.forEach((run, i) => {
      const root = find(i);
      if (!map.has(root)) map.set(root, []);
      map.get(root).push(run);
    });
    return [...map.values()];
  }

  /* Decides what a set of runs clears and which special gems it creates.
     prefer: cell keys the player just swapped (specials appear there when possible). */
  function planMatches(grid, runs, prefer) {
    const clear = new Set();
    const creates = [];
    let bonus = 0;
    const gemAt = (k) => grid[Math.floor(k / N)][k % N];
    const free = (k) => {
      const g = gemAt(k);
      return !!g && !g.sp && !creates.some((cr) => cr.key === k);
    };
    const pick = (list) => {
      const p = (prefer || []).find((k) => list.includes(k) && free(k));
      if (p !== undefined) return p;
      const mid = list[Math.floor(list.length / 2)];
      if (free(mid)) return mid;
      const any = list.find(free);
      return any === undefined ? -1 : any;
    };
    for (const grp of groupRuns(runs)) {
      const cells = [];
      grp.forEach((run) => run.cells.forEach((k) => { if (!cells.includes(k)) cells.push(k); }));
      cells.forEach((k) => clear.add(k));
      const longest = grp.reduce((a, b) => (b.cells.length > a.cells.length ? b : a));
      const hs = grp.filter((run) => run.dir === 'h');
      const vs = grp.filter((run) => run.dir === 'v');
      let sp = null;
      let at = -1;
      if (longest.cells.length >= 5) {
        sp = 'prism';
        at = pick(longest.cells);
        bonus += 100;
      } else if (hs.length && vs.length) {
        sp = 'burst';
        bonus += 60;
        let cross = -1;
        hs.forEach((a) => vs.forEach((b) => {
          const k = a.cells.find((x) => b.cells.includes(x));
          if (k !== undefined && cross < 0) cross = k;
        }));
        at = cross >= 0 && free(cross) ? cross : pick(cells);
      } else if (longest.cells.length === 4) {
        sp = longest.dir;
        at = pick(longest.cells);
        bonus += 30;
      }
      if (sp && at >= 0) creates.push({ key: at, sp, type: grp[0].type });
    }
    creates.forEach((cr) => clear.delete(cr.key));
    return { clear, creates, bonus };
  }

  /* Most common gem type that is not already being cleared. */
  function commonType(grid, clear) {
    const count = [0, 0, 0, 0, 0, 0];
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const t = typeAt(grid, r, c);
        if (t >= 0 && !clear.has(keyOf(r, c))) count[t]++;
      }
    }
    let best = 0;
    for (let t = 1; t < count.length; t++) if (count[t] > count[best]) best = t;
    return best;
  }

  /* Fires every special gem inside `clear`, adding what they hit (chains included).
     Cells in `protect` (specials being created) survive. Returns visual effects. */
  function expandClear(grid, clear, protect, spent) {
    const fx = [];
    const queue = [...clear];
    while (queue.length) {
      const k = queue.shift();
      const r = Math.floor(k / N);
      const c = k % N;
      const g = grid[r][c];
      if (!g || !g.sp || spent.has(g.id)) continue;
      spent.add(g.id);
      const add = [];
      if (g.sp === 'h') {
        for (let cc = 0; cc < N; cc++) add.push(keyOf(r, cc));
        fx.push({ kind: 'beam', dir: 'h', r, c, type: g.type });
      } else if (g.sp === 'v') {
        for (let rr = 0; rr < N; rr++) add.push(keyOf(rr, c));
        fx.push({ kind: 'beam', dir: 'v', r, c, type: g.type });
      } else if (g.sp === 'burst') {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) if (inB(r + dr, c + dc)) add.push(keyOf(r + dr, c + dc));
        }
        fx.push({ kind: 'burst', r, c, type: g.type });
      } else if (g.sp === 'prism') {
        const t = commonType(grid, clear);
        const hit = [];
        for (let rr = 0; rr < N; rr++) {
          for (let cc = 0; cc < N; cc++) {
            if (typeAt(grid, rr, cc) === t) {
              add.push(keyOf(rr, cc));
              hit.push(keyOf(rr, cc));
            }
          }
        }
        fx.push({ kind: 'bolts', r, c, hit, type: t });
      }
      for (const a of add) {
        if (protect.has(a) || clear.has(a)) continue;
        clear.add(a);
        queue.push(a);
      }
    }
    return fx;
  }

  /* Would a gem at (r, c) be part of a line of three? */
  function matchAt(grid, r, c) {
    const t = typeAt(grid, r, c);
    if (t < 0) return false;
    let n = 1;
    for (let k = c - 1; typeAt(grid, r, k) === t; k--) n++;
    for (let k = c + 1; typeAt(grid, r, k) === t; k++) n++;
    if (n >= 3) return true;
    n = 1;
    for (let k = r - 1; typeAt(grid, k, c) === t; k--) n++;
    for (let k = r + 1; typeAt(grid, k, c) === t; k++) n++;
    return n >= 3;
  }

  /* First legal swap found, as [[r, c], [r2, c2]], or null on a dead board. */
  function findMove(grid) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
          const r2 = r + dr;
          const c2 = c + dc;
          if (!inB(r2, c2)) continue;
          const a = grid[r][c];
          const b = grid[r2][c2];
          if (!a || !b) continue;
          if (a.sp === 'prism' || b.sp === 'prism') return [[r, c], [r2, c2]];
          grid[r][c] = b;
          grid[r2][c2] = a;
          const ok = matchAt(grid, r, c) || matchAt(grid, r2, c2);
          grid[r][c] = a;
          grid[r2][c2] = b;
          if (ok) return [[r, c], [r2, c2]];
        }
      }
    }
    return null;
  }

  /* Lane L, slot k (k = 0 is the floor) for gravity index gi. */
  function laneCell(gi, L, k) {
    if (gi === 0) return [N - 1 - k, L];
    if (gi === 1) return [L, k];
    if (gi === 2) return [k, L];
    return [L, N - 1 - k];
  }

  /* Packs gems toward the floor and fills the gaps from the far edge.
     make(r, c) returns a new gem; new gems start behind the entry edge. */
  function collapse(grid, gi, make) {
    const g = GRAV[gi];
    for (let L = 0; L < N; L++) {
      const keep = [];
      for (let k = 0; k < N; k++) {
        const [r, c] = laneCell(gi, L, k);
        if (grid[r][c]) keep.push(grid[r][c]);
      }
      const missing = N - keep.length;
      for (let k = 0; k < N; k++) {
        const [r, c] = laneCell(gi, L, k);
        if (k < keep.length) {
          grid[r][c] = keep[k];
        } else {
          const gem = make(r, c);
          gem.x = c - g.x * missing;
          gem.y = r - g.y * missing;
          grid[r][c] = gem;
        }
      }
    }
  }

  /* ---------- Drawing ---------- */

  function shapePath(ctx, shape, x, y, r) {
    ctx.beginPath();
    if (shape === 'square') {
      const s = r * 0.8;
      const k = r * 0.3;
      ctx.moveTo(x - s + k, y - s);
      ctx.lineTo(x + s - k, y - s);
      ctx.lineTo(x + s, y - s + k);
      ctx.lineTo(x + s, y + s - k);
      ctx.lineTo(x + s - k, y + s);
      ctx.lineTo(x - s + k, y + s);
      ctx.lineTo(x - s, y + s - k);
      ctx.lineTo(x - s, y - s + k);
    } else if (shape === 'diamond') {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r * 0.8, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r * 0.8, y);
    } else if (shape === 'star') {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 ? r * 0.52 : r;
        if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr + r * 0.06);
        else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr + r * 0.06);
      }
    } else if (shape === 'triangle') {
      ctx.moveTo(x, y - r * 0.92);
      ctx.lineTo(x + r * 0.95, y + r * 0.74);
      ctx.lineTo(x - r * 0.95, y + r * 0.74);
    } else if (shape === 'circle') {
      ctx.arc(x, y, r * 0.84, 0, Math.PI * 2);
    } else {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        if (i) ctx.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
        else ctx.moveTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
      }
    }
    ctx.closePath();
  }

  function star4(ctx, x, y, big, small, rot) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = rot + (i * Math.PI) / 4;
      const rr = i % 2 ? small : big;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawPrism(ctx, x, y, r, t) {
    ctx.fillStyle = 'rgba(5,4,20,0.35)';
    ctx.beginPath();
    ctx.arc(x + r * 0.05, y + r * 0.12, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    const rot = t * 1.4;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = GEMS[i].base;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r * 0.86, rot + (i * Math.PI) / 3, rot + ((i + 1) * Math.PI) / 3);
      ctx.closePath();
      ctx.fill();
    }
    const grd = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.05, x, y, r * 0.86);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    star4(ctx, x, y, r * 0.5, r * 0.15, -rot * 1.5);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawLineMark(ctx, g, sp, x, y, r, t) {
    ctx.save();
    shapePath(ctx, g.shape, x, y, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    const w = r * 0.17;
    for (const o of [-0.3, 0.3]) {
      if (sp === 'h') ctx.fillRect(x - r, y + o * r - w / 2, 2 * r, w);
      else ctx.fillRect(x + o * r - w / 2, y - r, w, 2 * r);
    }
    ctx.restore();
    const p = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.fillStyle = U.alpha('#FFFFFF', 0.55 + 0.45 * p);
    const d = r * (1.0 + 0.1 * p);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      if (sp === 'h') {
        ctx.moveTo(x + s * (d + r * 0.2), y);
        ctx.lineTo(x + s * d, y - r * 0.17);
        ctx.lineTo(x + s * d, y + r * 0.17);
      } else {
        ctx.moveTo(x, y + s * (d + r * 0.2));
        ctx.lineTo(x - r * 0.17, y + s * d);
        ctx.lineTo(x + r * 0.17, y + s * d);
      }
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBurstMark(ctx, x, y, r, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.strokeStyle = U.alpha('#FFFFFF', 0.45 + 0.45 * p);
    ctx.lineWidth = 2.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r * (1.04 + 0.07 * p), t, t + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#FFFFFF';
    star4(ctx, x, y, r * 0.44, r * 0.13, t * 0.8);
  }

  /* One gem centred on (x, y), radius r. type -1 / sp 'prism' draws a prism. */
  function drawGem(ctx, type, sp, x, y, r, t) {
    if (sp === 'prism' || type < 0) {
      drawPrism(ctx, x, y, r, t);
      return;
    }
    const g = GEMS[type];
    ctx.fillStyle = 'rgba(5,4,20,0.35)';
    shapePath(ctx, g.shape, x + r * 0.05, y + r * 0.12, r);
    ctx.fill();
    const grd = ctx.createLinearGradient(x - r * 0.7, y - r, x + r * 0.7, y + r);
    grd.addColorStop(0, g.hi);
    grd.addColorStop(0.42, g.base);
    grd.addColorStop(1, g.lo);
    ctx.fillStyle = grd;
    shapePath(ctx, g.shape, x, y, r);
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = g.lo;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    shapePath(ctx, g.shape, x, y - r * 0.04, r * 0.52);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(x + g.gx * r, y + g.gy * r, r * 0.15, r * 0.08, -0.6, 0, Math.PI * 2);
    ctx.fill();
    if (sp === 'h' || sp === 'v') drawLineMark(ctx, g, sp, x, y, r, t);
    else if (sp === 'burst') drawBurstMark(ctx, x, y, r, t);
  }

  /* Arrow pointing along angle `ang`, centred on (x, y). */
  function drawArrow(ctx, x, y, ang, len, width) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(-len * 0.5, -width / 2);
    ctx.lineTo(len * 0.1, -width / 2);
    ctx.lineTo(len * 0.1, -width * 1.4);
    ctx.lineTo(len * 0.5, 0);
    ctx.lineTo(len * 0.1, width * 1.4);
    ctx.lineTo(len * 0.1, width / 2);
    ctx.lineTo(-len * 0.5, width / 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const gravAngle = (gi) => Math.atan2(GRAV[gi].y, GRAV[gi].x);
  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  Arcade.register({
    id: 'gem-swap',
    title: 'Gem Swap',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.violet,
    tagline: 'Swap neighbouring gems to line up three or more of a kind.',
    hook: 'Gravity turns every 10 moves, so gems start falling sideways.',
    tags: ['match 3', 'match three', 'gems', 'jewels', 'puzzle', 'swap', 'gravity', 'combo', 'touch'],
    howTo: 'Swap two neighbouring gems to make a line of three or more of the same kind. Matched gems shatter, ' +
      'the rest fall and new ones drop in, and every chain reaction raises the combo multiplier. A line of four makes a ' +
      'line gem that clears its whole row or column, an L or T makes a burst gem that clears a 3×3 block, and a line of ' +
      'five makes a prism: swap it with any gem to clear every gem of that kind. The twist: every 10 moves gravity turns ' +
      'a quarter clockwise (down, left, up, right), so gems slide sideways and new ones pour in from a different edge. ' +
      'The compass warns you two moves ahead. Moves mode gives you 30 swaps; Timed mode gives you 90 seconds.',
    controls: [
      { keys: ['Drag', 'Swipe'], label: 'Swap a gem with its neighbour' },
      { keys: ['Click', 'Click'], label: 'Select a gem, then a neighbour' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor' },
      { keys: ['Space', 'Enter'], label: 'Pick up a gem, then press an arrow to swap' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const cs = 40;
      const cols = 6;
      const rows = 4;
      const x0 = 16;
      const y0 = (h - rows * cs) / 2;
      ctx.fillStyle = C.panel;
      U.roundRect(ctx, x0 - 6, y0 - 6, cols * cs + 12, rows * cs + 12, 12);
      ctx.fill();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if ((r + c) % 2) {
            ctx.fillStyle = U.alpha(C.panel2, 0.8);
            ctx.fillRect(x0 + c * cs, y0 + r * cs, cs, cs);
          }
        }
      }
      const pattern = [
        [4, 1, 2, 0, 3, 5],
        [2, 0, 5, 1, 4, 3],
        [1, 3, 0, 2, 5, 0],
        [5, 2, 4, 3, 1, 4]
      ];
      const slide = 1 - ((t * 0.7 + 0.45) % 1);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, cols * cs, rows * cs);
      ctx.clip();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const moving = r === 1 && c >= 3;
          const off = moving ? slide * cs * 1.2 : 0;
          const x = x0 + c * cs + cs / 2 + off;
          const y = y0 + r * cs + cs / 2;
          if (moving && off > 2) {
            ctx.strokeStyle = U.alpha(GEMS[pattern[r][c]].base, 0.35);
            ctx.lineWidth = 3;
            ctx.beginPath();
            for (const dy of [-8, 0, 8]) {
              ctx.moveTo(x + 18, y + dy);
              ctx.lineTo(x + 18 + off * 0.8, y + dy);
            }
            ctx.stroke();
          }
          const sp = r === 2 && c === 1 ? 'h' : r === 0 && c === 4 ? 'prism' : r === 3 && c === 2 ? 'burst' : null;
          drawGem(ctx, sp === 'prism' ? -1 : pattern[r][c], sp, x, y, cs * 0.4, t);
        }
      }
      ctx.restore();
      // Gravity compass: the arrow has swung from down to left.
      const cx = w - 37;
      const cy = h / 2;
      ctx.fillStyle = C.panel;
      ctx.beginPath();
      ctx.arc(cx, cy, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = U.alpha(C.gold, 0.8);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, 36, Math.PI * 0.55, Math.PI * 0.95);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = U.alpha(C.muted, 0.4);
      drawArrow(ctx, cx, cy, Math.PI / 2, 36, 6);
      ctx.fillStyle = C.gold;
      drawArrow(ctx, cx, cy, Math.PI + Math.sin(t * 2) * 0.08, 40, 7);
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.muted;
      ctx.fillText('10', cx, cy + 46);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let mode = 'moves';
      let state = 'menu'; // menu | fall | idle | swap | swapback | clear | turn | shuffle | over
      let grid = [];
      let gi = 0;
      let turns = 0;
      let angDisp = Math.PI / 2;
      let movesSince = 0;
      let movesLeft = MOVE_LIMIT;
      let timeLeft = TIME_LIMIT;
      let clockOn = false;
      let score = 0;
      let combo = 0;
      let bestCombo = 0;
      let specialsMade = 0;
      let timer = 0;
      let swapInfo = null;
      let sel = null;
      let drag = null;
      let hover = null;
      let cursor = { r: 3, c: 3 };
      let keyMode = false;
      let held = false;
      let idleT = 0;
      let hintMove = null;
      let parts = [];
      let pops = [];
      let beams = [];
      let rings = [];
      let bolts = [];
      let banner = null;
      let shake = 0;
      let lurch = 0;
      let lurchDir = GRAV[0];
      let pulse = 0;
      let round = 0;
      let warned = false;
      let turnedOnce = false;
      let tipsSeen = {};
      let tipText = '';
      let tipT = 0;
      let lastStatus = '';
      let landSfx = 0;
      let nextId = 1;

      const randType = () => U.randInt(0, GEMS.length - 1);
      const makeGem = (r, c, type) => ({
        id: nextId++, type: type === undefined ? randType() : type, sp: null,
        x: c, y: r, v: 0, tw: null, die: 0, flash: 0, squash: 0
      });
      const gemAtKey = (k) => grid[Math.floor(k / N)][k % N];
      const cellCenter = (r, c) => ({ x: BX + c * CS + CS / 2, y: BY + r * CS + CS / 2 });

      function tip(text, secs) {
        tipText = text;
        tipT = secs || 4;
      }

      function tipOnce(id, text, secs) {
        if (tipsSeen[id]) return;
        tipsSeen[id] = true;
        tip(text, secs || 5);
      }

      function fillFresh() {
        for (let tries = 0; tries < 60; tries++) {
          grid = [];
          for (let r = 0; r < N; r++) {
            grid.push([]);
            for (let c = 0; c < N; c++) {
              let t;
              do {
                t = randType();
              } while ((c >= 2 && grid[r][c - 1].type === t && grid[r][c - 2].type === t) ||
                (r >= 2 && grid[r - 1][c].type === t && grid[r - 2][c].type === t));
              grid[r].push(makeGem(r, c, t));
            }
          }
          if (findMove(grid)) return;
        }
      }

      function showStartMenu() {
        state = 'menu';
        round++;
        api.setStatus('Line up three or more. Gravity turns every 10 moves.');
        api.menu({
          title: 'Gem Swap',
          text: 'Swap neighbouring gems to make lines of three. Every 10 moves gravity turns a quarter clockwise, ' +
            'so gems fall sideways and new ones pour in from another edge.',
          buttons: [
            { label: 'Moves · 30 swaps', primary: true, onClick: () => startGame('moves') },
            { label: 'Timed · 90 seconds', onClick: () => startGame('timed') }
          ]
        });
      }

      function startGame(m) {
        round++;
        mode = m;
        gi = 0;
        turns = 0;
        angDisp = gravAngle(0);
        movesSince = 0;
        movesLeft = MOVE_LIMIT;
        timeLeft = TIME_LIMIT;
        clockOn = false;
        score = 0;
        combo = 0;
        bestCombo = 0;
        specialsMade = 0;
        sel = null;
        drag = null;
        held = false;
        hintMove = null;
        idleT = 0;
        parts = [];
        pops = [];
        beams = [];
        rings = [];
        bolts = [];
        banner = null;
        shake = 0;
        lurch = 0;
        warned = false;
        turnedOnce = false;
        tipsSeen = {};
        fillFresh();
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            grid[r][c].y = r - N - 1 - c * 0.35;
          }
        }
        state = 'fall';
        api.setScore(0);
        tip(m === 'moves'
          ? 'You have 30 swaps. Drag a gem onto a neighbour to make a line of three.'
          : 'You have 90 seconds. Drag a gem onto a neighbour to make a line of three.', 5);
      }

      /* True while the compass should warn: the turn is at most 2 moves away and will happen. */
      function turnComing() {
        if (state === 'over' || state === 'menu') return false;
        const left = TURN_EVERY - movesSince;
        return left <= 2 && (mode !== 'moves' || movesLeft - left > 0);
      }

      function canInput() {
        return state === 'idle' && !api.menuOpen && !(mode === 'timed' && timeLeft <= 0);
      }

      /* ---------- Moves ---------- */

      function trySwap(a, b) {
        if (!canInput() || !inB(a.r, a.c) || !inB(b.r, b.c)) return;
        if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return;
        const ga = grid[a.r][a.c];
        const gb = grid[b.r][b.c];
        if (!ga || !gb) return;
        grid[a.r][a.c] = gb;
        grid[b.r][b.c] = ga;
        ga.tw = { fx: ga.x, fy: ga.y, tx: b.c, ty: b.r, t: 0, d: SWAP_T };
        gb.tw = { fx: gb.x, fy: gb.y, tx: a.c, ty: a.r, t: 0, d: SWAP_T };
        swapInfo = { a: { r: a.r, c: a.c }, b: { r: b.r, c: b.c } };
        state = 'swap';
        idleT = 0;
        hintMove = null;
        sel = null;
        held = false;
        api.sfx('tick');
      }

      function countMove() {
        movesSince++;
        if (mode === 'moves') movesLeft--;
        const left = TURN_EVERY - movesSince;
        if (left > 0 && turnComing()) {
          const next = GRAV[(gi + 1) % 4];
          if (!warned) {
            warned = true;
            tip('Gravity turns in ' + left + ' move' + (left === 1 ? '' : 's') + ': gems will fall ' + next.name +
              ' and new ones will enter from the ' + next.entry + '. Plan for it.', 6);
          } else if (left === 2) {
            tip('Gravity turns ' + next.name + ' in 2 moves.', 3);
          }
        }
      }

      function afterSwap() {
        const { a, b } = swapInfo;
        const ga = grid[b.r][b.c]; // the gem the player moved now sits at b
        const gb = grid[a.r][a.c];
        if (ga.sp === 'prism' || gb.sp === 'prism') {
          countMove();
          combo = 1;
          prismSwap(ga.sp === 'prism' ? b : a, ga.sp === 'prism' ? gb : ga);
          return;
        }
        const runs = findRuns(grid);
        if (!runs.length) {
          grid[a.r][a.c] = ga;
          grid[b.r][b.c] = gb;
          ga.tw = { fx: ga.x, fy: ga.y, tx: a.c, ty: a.r, t: 0, d: SWAP_T * 1.3 };
          gb.tw = { fx: gb.x, fy: gb.y, tx: b.c, ty: b.r, t: 0, d: SWAP_T * 1.3 };
          state = 'swapback';
          api.sfx('hit');
          tipOnce('nomatch', 'A swap only counts if it makes a line of three. That one bounced back.', 3);
          return;
        }
        countMove();
        combo = 1;
        const plan = planMatches(grid, runs, [keyOf(b.r, b.c), keyOf(a.r, a.c)]);
        doClear(plan.clear, plan.creates, plan.bonus);
      }

      function prismSwap(pc, other) {
        const clear = new Set([keyOf(pc.r, pc.c)]);
        const prism = grid[pc.r][pc.c];
        const hit = [];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const g = grid[r][c];
            if (!g) continue;
            if (other.sp === 'prism' || g.type === other.type) {
              clear.add(keyOf(r, c));
              hit.push(keyOf(r, c));
            }
          }
        }
        const spent = new Set([prism.id]);
        if (other.sp === 'prism') spent.add(other.id);
        addFx([{ kind: 'bolts', r: pc.r, c: pc.c, hit, type: other.type }]);
        api.sfx('boom');
        doClear(clear, [], 150, spent);
      }

      function doClear(clear, creates, bonus, spent) {
        const protect = new Set(creates.map((cr) => cr.key));
        const fx = expandClear(grid, clear, protect, spent || new Set());
        addFx(fx);
        let n = 0;
        let sx = 0;
        let sy = 0;
        clear.forEach((k) => {
          const g = gemAtKey(k);
          if (!g || g.die) return;
          g.die = 0.0001;
          n++;
          const p = cellCenter(Math.floor(k / N), k % N);
          sx += p.x;
          sy += p.y;
          shatter(p.x, p.y, g.type);
        });
        creates.forEach((cr) => {
          const g = gemAtKey(cr.key);
          if (!g) return;
          g.sp = cr.sp;
          if (cr.sp === 'prism') g.type = -1;
          g.flash = 1;
          g.die = 0;
          specialsMade++;
          const p = cellCenter(Math.floor(cr.key / N), cr.key % N);
          rings.push({ x: p.x, y: p.y, r: CS * 0.3, grow: 120, life: 0.5, max: 0.5, color: '#FFFFFF', w: 4 });
          if (cr.sp === 'prism') {
            tipOnce('prism', 'Five in a row made a prism. Swap it with any gem to clear every gem of that kind.', 6);
          } else if (cr.sp === 'burst') {
            tipOnce('burst', 'An L or T made a burst gem. Match it to blow up the 3×3 block around it.', 6);
          } else {
            tipOnce('line', 'Four in a row made a line gem. Match it to clear its whole ' +
              (cr.sp === 'h' ? 'row' : 'column') + '.', 6);
          }
        });
        const mult = Math.max(1, combo);
        const gained = (n * 10 + bonus) * mult;
        score += gained;
        api.setScore(score);
        bestCombo = Math.max(bestCombo, combo);
        if (n) {
          pops.push({ x: sx / n, y: sy / n, text: '+' + gained, color: mult > 1 ? C.gold : C.text, life: 1.1, size: gained >= 300 ? 26 : 18 });
        }
        if (combo >= 2) {
          banner = { text: 'Combo ×' + combo, sub: '', life: 1.1, max: 1.1, color: combo >= 4 ? C.p1 : C.gold };
          tipOnce('combo', 'Chain reaction! Every cascade in a row adds 1 to the multiplier.', 4);
        }
        if (creates.length) api.sfx('power');
        else if (combo >= 3 || n >= 8) api.sfx('boom');
        else api.sfx('score');
        shake = Math.min(12, shake + n * 0.3 + (combo > 1 ? 2 : 0));
        state = 'clear';
        timer = CLEAR_T;
      }

      function addFx(fx) {
        for (const f of fx) {
          const color = f.type >= 0 ? GEMS[f.type].base : '#FFFFFF';
          if (f.kind === 'beam') {
            beams.push({ dir: f.dir, r: f.r, c: f.c, life: 0.45, max: 0.45, color });
            api.sfx('shoot');
            shake = Math.min(12, shake + 4);
          } else if (f.kind === 'burst') {
            const p = cellCenter(f.r, f.c);
            rings.push({ x: p.x, y: p.y, r: 10, grow: 360, life: 0.45, max: 0.45, color, w: 8 });
            rings.push({ x: p.x, y: p.y, r: 4, grow: 220, life: 0.35, max: 0.35, color: '#FFFFFF', w: 4 });
            api.sfx('boom');
            shake = Math.min(12, shake + 6);
          } else if (f.kind === 'bolts') {
            const from = cellCenter(f.r, f.c);
            const targets = f.hit.map((k) => cellCenter(Math.floor(k / N), k % N));
            bolts.push({ from, targets, life: 0.5, max: 0.5, color });
            shake = Math.min(12, shake + 6);
          }
        }
      }

      function shatter(x, y, type) {
        const color = type >= 0 ? GEMS[type].base : '#FFFFFF';
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = U.rand(90, 280);
          parts.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.35, 0.75), max: 0.75,
            color, s: U.rand(3, 7), rot: U.rand(0, 6), vr: U.rand(-12, 12)
          });
        }
        rings.push({ x, y, r: 8, grow: 150, life: 0.28, max: 0.28, color, w: 3 });
        if (parts.length > 700) parts.splice(0, parts.length - 700);
      }

      function endOfMove() {
        combo = 0;
        if (mode === 'moves' && movesLeft <= 0) {
          finish();
          return;
        }
        if (mode === 'timed' && clockOn && timeLeft <= 0) {
          finish();
          return;
        }
        if (movesSince >= TURN_EVERY) {
          startTurn();
          return;
        }
        settleIdle();
      }

      function settleIdle() {
        if (!findMove(grid)) {
          startShuffle();
          return;
        }
        state = 'idle';
        clockOn = true;
        idleT = 0;
        hintMove = null;
      }

      function startTurn() {
        gi = (gi + 1) % 4;
        turns++;
        movesSince = 0;
        state = 'turn';
        timer = 0.8;
        lurch = 0.5;
        lurchDir = GRAV[gi];
        api.sfx('power');
        banner = { text: 'Gravity ' + GRAV[gi].name, sub: 'New gems enter from the ' + GRAV[gi].entry, life: 1.7, max: 1.7, color: C.gold, arrow: gi };
        if (!turnedOnce) {
          turnedOnce = true;
          tip('Gravity turned! Gems now fall ' + GRAV[gi].name + ' and new ones pour in from the ' + GRAV[gi].entry + '.', 6);
        } else {
          tip('Gravity turned ' + GRAV[gi].name + '. New gems enter from the ' + GRAV[gi].entry + '.', 3.5);
        }
      }

      function startShuffle() {
        const gems = [];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if (!grid[r][c]) grid[r][c] = makeGem(r, c);
            gems.push(grid[r][c]);
          }
        }
        let ok = false;
        for (let tries = 0; tries < 400 && !ok; tries++) {
          if (tries > 150) gems.forEach((g) => { if (!g.sp) g.type = randType(); });
          U.shuffle(gems);
          let i = 0;
          for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c] = gems[i++];
          ok = !findRuns(grid).length && !!findMove(grid);
        }
        if (!ok) {
          // Practically unreachable: deal fresh colours that are known to work.
          const keep = grid;
          fillFresh();
          for (let r = 0; r < N; r++) {
            for (let c = 0; c < N; c++) {
              grid[r][c].x = keep[r][c].x;
              grid[r][c].y = keep[r][c].y;
            }
          }
        }
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const g = grid[r][c];
            g.v = 0;
            g.tw = { fx: g.x, fy: g.y, tx: c, ty: r, t: 0, d: 0.6, arc: true };
          }
        }
        state = 'shuffle';
        banner = { text: 'Shuffle', sub: 'No moves were left', life: 1.4, max: 1.4, color: C.p2 };
        api.sfx('flip');
        tip('No swaps were left, so the board shuffled itself.', 3);
      }

      function finish() {
        if (state === 'over') return;
        state = 'over';
        sel = null;
        held = false;
        drag = null;
        hintMove = null;
        const isBest = api.reportScore(score);
        api.sfx(isBest ? 'win' : 'score');
        lastStatus = (mode === 'moves' ? 'Out of moves' : 'Time is up') + ': ' + score + ' points.';
        api.setStatus(lastStatus);
        banner = { text: mode === 'moves' ? 'Out of moves' : 'Time is up', sub: score + ' points', life: 1.3, max: 1.3, color: C.violet };
        const token = round;
        api.after(1200, () => {
          if (token !== round) return;
          api.menu({
            title: isBest ? 'New best: ' + score + '!' : (mode === 'moves' ? 'Out of moves' : 'Time is up'),
            text: 'You scored ' + score + ' points. Best combo ×' + Math.max(1, bestCombo) + ', ' + specialsMade +
              ' special gem' + (specialsMade === 1 ? '' : 's') + ' made, gravity turned ' + turns +
              ' time' + (turns === 1 ? '' : 's') + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(mode) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      /* ---------- Update ---------- */

      function moveGems(dt) {
        let moving = false;
        let landed = false;
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const g = grid[r][c];
            if (!g) continue;
            g.flash = Math.max(0, g.flash - dt * 2);
            g.squash = Math.max(0, g.squash - dt * 5);
            if (g.die) g.die += dt;
            if (g.tw) {
              g.tw.t = Math.min(1, g.tw.t + dt / g.tw.d);
              const e = g.tw.t < 0.5 ? 2 * g.tw.t * g.tw.t : 1 - Math.pow(-2 * g.tw.t + 2, 2) / 2;
              g.x = U.lerp(g.tw.fx, g.tw.tx, e);
              g.y = U.lerp(g.tw.fy, g.tw.ty, e);
              if (g.tw.t >= 1) {
                g.x = g.tw.tx;
                g.y = g.tw.ty;
                g.tw = null;
              } else moving = true;
              continue;
            }
            const dx = c - g.x;
            const dy = r - g.y;
            const d = Math.hypot(dx, dy);
            if (d > 0.0005) {
              g.v = Math.min(g.v + 42 * dt, 18);
              const step = g.v * dt;
              if (step >= d) {
                g.x = c;
                g.y = r;
                if (g.v > 5) {
                  g.squash = 1;
                  landed = true;
                }
                g.v = 0;
              } else {
                g.x += (dx / d) * step;
                g.y += (dy / d) * step;
                moving = true;
              }
            } else {
              g.x = c;
              g.y = r;
              g.v = 0;
            }
          }
        }
        if (landed && landSfx <= 0) {
          api.sfx('tick');
          landSfx = 0.12;
        }
        return moving;
      }

      function update(dt) {
        pulse += dt;
        tipT = Math.max(0, tipT - dt);
        landSfx -= dt;
        shake = Math.max(0, shake - dt * 30);
        lurch = Math.max(0, lurch - dt);
        const target = gravAngle(gi);
        let diff = target - angDisp;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        angDisp += diff * Math.min(1, dt * 7);
        if (banner) {
          banner.life -= dt;
          banner.age = (banner.age || 0) + dt;
          if (banner.life <= 0) banner = null;
        }
        if (state === 'menu') return;

        if (mode === 'timed' && clockOn && state !== 'over') {
          timeLeft = Math.max(0, timeLeft - dt);
          if (timeLeft <= 0 && state === 'idle') finish();
        }

        const moving = moveGems(dt);
        if (state === 'swap' && !moving) afterSwap();
        else if (state === 'swapback' && !moving) state = 'idle';
        else if (state === 'clear') {
          timer -= dt;
          if (timer <= 0) {
            for (let r = 0; r < N; r++) {
              for (let c = 0; c < N; c++) if (grid[r][c] && grid[r][c].die) grid[r][c] = null;
            }
            collapse(grid, gi, (r, c) => makeGem(r, c));
            state = 'fall';
          }
        } else if (state === 'fall' && !moving) {
          const runs = findRuns(grid);
          if (runs.length) {
            combo = Math.max(1, combo) + 1;
            const plan = planMatches(grid, runs, null);
            doClear(plan.clear, plan.creates, plan.bonus);
          } else endOfMove();
        } else if (state === 'turn') {
          timer -= dt;
          if (timer <= 0) settleIdle();
        } else if (state === 'shuffle' && !moving) {
          const runs = findRuns(grid);
          if (runs.length) {
            combo = 1;
            const plan = planMatches(grid, runs, null);
            doClear(plan.clear, plan.creates, plan.bonus);
          } else settleIdle();
        }

        if (state === 'idle') {
          idleT += dt;
          if (idleT > HINT_AFTER && !hintMove) hintMove = findMove(grid);
        }

        const g = GRAV[gi];
        parts.forEach((p) => {
          p.life -= dt;
          p.vx += g.x * 700 * dt;
          p.vy += g.y * 700 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.vr * dt;
        });
        parts = parts.filter((p) => p.life > 0);
        pops.forEach((p) => {
          p.life -= dt;
          p.x -= g.x * 40 * dt;
          p.y -= g.y * 40 * dt;
        });
        pops = pops.filter((p) => p.life > 0);
        rings.forEach((r) => {
          r.life -= dt;
          r.r += r.grow * dt;
        });
        rings = rings.filter((r) => r.life > 0);
        beams.forEach((b) => { b.life -= dt; });
        beams = beams.filter((b) => b.life > 0);
        bolts.forEach((b) => { b.life -= dt; });
        bolts = bolts.filter((b) => b.life > 0);

        if (state !== 'over') {
          const left = TURN_EVERY - movesSince;
          const base = (mode === 'moves' ? 'Moves left ' + movesLeft : 'Time ' + clock(Math.ceil(timeLeft))) +
            ' · gravity ' + GRAV[gi].name + ' · turns in ' + left + ' move' + (left === 1 ? '' : 's');
          const text = tipT > 0 ? tipText : base;
          if (text !== lastStatus) {
            lastStatus = text;
            api.setStatus(text);
          }
        }
      }

      /* ---------- Draw ---------- */

      function drawEdges() {
        const g = GRAV[gi];
        const warn = turnComing();
        const edgeRect = (dir, off, thick) => {
          // dir: gravity-like vector naming the board side
          if (dir.y === 1) return [BX, BY + BW + off, BW, thick];
          if (dir.y === -1) return [BX, BY - off - thick, BW, thick];
          if (dir.x === -1) return [BX - off - thick, BY, thick, BW];
          return [BX + BW + off, BY, thick, BW];
        };
        // Floor: where gems fall to.
        const f = edgeRect(g, 7, 6);
        ctx.fillStyle = U.alpha(C.mint, 0.25);
        U.roundRect(ctx, f[0] - 3, f[1] - 3, f[2] + 6, f[3] + 6, 6);
        ctx.fill();
        ctx.fillStyle = C.mint;
        U.roundRect(ctx, f[0], f[1], f[2], f[3], 3);
        ctx.fill();
        // Entry: chevrons drifting inward on the side new gems come from.
        const entry = { x: -g.x, y: -g.y };
        const ang = Math.atan2(g.y, g.x);
        const drift = (pulse * 0.9) % 1;
        ctx.fillStyle = U.alpha(C.mint, 0.55);
        for (let i = 0; i < N; i++) {
          const along = BX + i * CS + CS / 2;
          const alongY = BY + i * CS + CS / 2;
          const d = 9 + drift * 8;
          let x;
          let y;
          if (entry.y === -1) { x = along; y = BY - 22 + d; }
          else if (entry.y === 1) { x = along; y = BY + BW + 22 - d; }
          else if (entry.x === -1) { x = BX - 22 + d; y = alongY; }
          else { x = BX + BW + 22 - d; y = alongY; }
          ctx.globalAlpha = 0.35 + 0.5 * Math.sin(drift * Math.PI);
          chevron(x, y, ang, 7);
        }
        ctx.globalAlpha = 1;
        if (warn) {
          const ng = GRAV[(gi + 1) % 4];
          const blink = 0.45 + 0.45 * Math.sin(pulse * 8);
          const nf = edgeRect(ng, 7, 6);
          ctx.fillStyle = U.alpha(C.gold, blink);
          U.roundRect(ctx, nf[0], nf[1], nf[2], nf[3], 3);
          ctx.fill();
        }
      }

      function chevron(x, y, ang, s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, -s);
        ctx.lineTo(s * 0.5, 0);
        ctx.lineTo(-s * 0.6, s);
        ctx.lineTo(-s * 0.2, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawBoard() {
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX - 4, BY - 4, BW + 8, BW + 8, 14);
        ctx.fill();
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            if ((r + c) % 2) {
              ctx.fillStyle = U.alpha(C.panel2, 0.75);
              ctx.fillRect(BX + c * CS, BY + r * CS, CS, CS);
            }
          }
        }
        if (hover && state === 'idle' && !keyMode) {
          ctx.fillStyle = U.alpha(C.text, 0.06);
          ctx.fillRect(BX + hover.c * CS, BY + hover.r * CS, CS, CS);
        }
        ctx.save();
        ctx.beginPath();
        ctx.rect(BX, BY, BW, BW);
        ctx.clip();
        const lp = lurch > 0 ? Math.sin(Math.PI * (lurch / 0.5)) * 0.16 : 0;
        const lx = lurchDir.x * lp * CS;
        const ly = lurchDir.y * lp * CS;
        const gv = GRAV[gi];
        const late = [];
        for (let r = 0; r < N; r++) {
          for (let c = 0; c < N; c++) {
            const g = grid[r] && grid[r][c];
            if (!g) continue;
            if (g.tw || g.die) late.push(g);
            else drawOne(g, lx, ly, gv);
          }
        }
        late.forEach((g) => drawOne(g, lx, ly, gv));

        // Beams from line gems.
        beams.forEach((b) => {
          const k = b.life / b.max;
          const thick = CS * (0.25 + 0.75 * k);
          ctx.fillStyle = U.alpha(b.color, 0.55 * k);
          if (b.dir === 'h') ctx.fillRect(BX, BY + b.r * CS + CS / 2 - thick / 2, BW, thick);
          else ctx.fillRect(BX + b.c * CS + CS / 2 - thick / 2, BY, thick, BW);
          ctx.fillStyle = U.alpha('#FFFFFF', 0.85 * k);
          const core = thick * 0.25;
          if (b.dir === 'h') ctx.fillRect(BX, BY + b.r * CS + CS / 2 - core / 2, BW, core);
          else ctx.fillRect(BX + b.c * CS + CS / 2 - core / 2, BY, core, BW);
        });
        ctx.restore();

        // Hint glow.
        if (hintMove && state === 'idle') {
          const a = 0.35 + 0.35 * Math.sin(pulse * 5);
          ctx.strokeStyle = U.alpha(C.gold, a + 0.2);
          ctx.lineWidth = 3;
          hintMove.forEach(([r, c]) => {
            U.roundRect(ctx, BX + c * CS + 3, BY + r * CS + 3, CS - 6, CS - 6, 12);
            ctx.stroke();
          });
          ctx.fillStyle = U.alpha(C.gold, a * 0.35);
          hintMove.forEach(([r, c]) => {
            U.roundRect(ctx, BX + c * CS + 3, BY + r * CS + 3, CS - 6, CS - 6, 12);
            ctx.fill();
          });
        }
        // Selection and keyboard cursor.
        if (sel && state !== 'over') {
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 3;
          U.roundRect(ctx, BX + sel.c * CS + 2, BY + sel.r * CS + 2, CS - 4, CS - 4, 12);
          ctx.stroke();
        }
        if (keyMode && state !== 'over' && state !== 'menu') {
          const x = BX + cursor.c * CS;
          const y = BY + cursor.r * CS;
          ctx.strokeStyle = held ? C.gold : U.alpha(C.text, 0.85);
          ctx.lineWidth = 3;
          ctx.setLineDash(held ? [] : [6, 5]);
          U.roundRect(ctx, x - 2, y - 2, CS + 4, CS + 4, 14);
          ctx.stroke();
          ctx.setLineDash([]);
          if (held) {
            ctx.fillStyle = C.gold;
            const bob = Math.sin(pulse * 8) * 2;
            [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
              if (!inB(cursor.r + dy, cursor.c + dx)) return;
              chevron(x + CS / 2 + dx * (CS / 2 + 9 + bob), y + CS / 2 + dy * (CS / 2 + 9 + bob), Math.atan2(dy, dx), 6);
            });
          }
        }
      }

      function drawOne(g, lx, ly, gv) {
        let x = BX + (g.x + 0.5) * CS + lx;
        let y = BY + (g.y + 0.5) * CS + ly;
        let sx = 1;
        let sy = 1;
        let alpha = 1;
        if (g.squash > 0) {
          const q = 0.14 * Math.sin(g.squash * Math.PI);
          if (gv.y) { sx = 1 + q; sy = 1 - q; } else { sx = 1 - q; sy = 1 + q; }
          x += gv.x * q * CS * 0.25;
          y += gv.y * q * CS * 0.25;
        }
        if (g.tw && g.tw.arc) {
          const s = 1 - 0.35 * Math.sin(Math.PI * g.tw.t);
          sx *= s;
          sy *= s;
        }
        const isSel = (sel && grid[sel.r] && grid[sel.r][sel.c] === g) ||
          (held && keyMode && grid[cursor.r] && grid[cursor.r][cursor.c] === g);
        if (isSel) {
          const s = 1.08 + 0.04 * Math.sin(pulse * 9);
          sx *= s;
          sy *= s;
        }
        if (g.die) {
          const p = Math.min(1, g.die / CLEAR_T);
          const s = p < 0.3 ? 1 + p : 1.3 * (1 - (p - 0.3) / 0.7);
          sx *= s;
          sy *= s;
          alpha = 1 - p * 0.6;
        }
        if (sx <= 0.01 || sy <= 0.01) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(sx, sy);
        drawGem(ctx, g.type, g.sp, 0, 0, CS * 0.4, pulse);
        if (g.die) {
          ctx.fillStyle = U.alpha('#FFFFFF', 0.7 * (1 - Math.min(1, g.die / CLEAR_T)));
          ctx.beginPath();
          ctx.arc(0, 0, CS * 0.36, 0, Math.PI * 2);
          ctx.fill();
        }
        if (g.flash > 0) {
          ctx.strokeStyle = U.alpha('#FFFFFF', g.flash);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, CS * (0.46 + (1 - g.flash) * 0.2), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawFx() {
        rings.forEach((r) => {
          ctx.strokeStyle = U.alpha(r.color, Math.max(0, r.life / r.max));
          ctx.lineWidth = r.w;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
          ctx.stroke();
        });
        bolts.forEach((b) => {
          const k = b.life / b.max;
          ctx.strokeStyle = U.alpha(b.color, k);
          ctx.lineWidth = 3;
          ctx.beginPath();
          b.targets.forEach((t) => {
            ctx.moveTo(b.from.x, b.from.y);
            const steps = 5;
            for (let i = 1; i <= steps; i++) {
              const f = i / steps;
              const j = i < steps ? (Math.random() - 0.5) * 18 : 0;
              ctx.lineTo(U.lerp(b.from.x, t.x, f) + j, U.lerp(b.from.y, t.y, f) + j);
            }
          });
          ctx.stroke();
          ctx.strokeStyle = U.alpha('#FFFFFF', k * 0.8);
          ctx.lineWidth = 1.2;
          ctx.stroke();
        });
        parts.forEach((p) => {
          ctx.save();
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(0, -p.s);
          ctx.lineTo(p.s * 0.7, 0);
          ctx.lineTo(0, p.s);
          ctx.lineTo(-p.s * 0.7, 0);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        pops.forEach((p) => {
          ctx.globalAlpha = U.clamp(p.life, 0, 1);
          ctx.font = '800 ' + p.size + 'px Unbounded, sans-serif';
          ctx.fillStyle = C.ink;
          ctx.fillText(p.text, p.x + 2, p.y + 2);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        });
        ctx.globalAlpha = 1;
      }

      function drawBanner() {
        if (!banner) return;
        const inT = Math.min(1, (banner.age || 0) / 0.18);
        const outT = Math.min(1, banner.life / 0.3);
        const a = Math.min(inT, outT);
        const s = 0.7 + 0.3 * inT;
        const cx = BX + BW / 2;
        const cy = BY + BW / 2;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx, cy);
        ctx.scale(s, s);
        ctx.font = FONT_BIG;
        const aw = banner.arrow !== undefined ? 60 : 0;
        const tw = ctx.measureText(banner.text).width;
        const k = Math.min(1, (BW - 90 - aw) / Math.max(1, tw));
        const bw = Math.min(BW - 16, tw * k + aw + 64);
        ctx.fillStyle = U.alpha(C.ink, 0.75);
        U.roundRect(ctx, -bw / 2, -58, bw, banner.sub ? 116 : 84, 20);
        ctx.fill();
        ctx.strokeStyle = U.alpha(banner.color, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = banner.color;
        const tx = -aw / 2;
        ctx.save();
        ctx.translate(tx, -16);
        ctx.scale(k, k);
        ctx.fillText(banner.text, 0, 0);
        ctx.restore();
        if (aw) drawArrow(ctx, tx + (tw * k) / 2 + 34, -16, gravAngle(banner.arrow), 44, 8);
        if (banner.sub) {
          ctx.font = FONT;
          ctx.fillStyle = C.text;
          ctx.fillText(banner.sub, 0, 30);
        }
        ctx.restore();
      }

      function drawPanel() {
        const x = PX;
        const cx = PX + PW / 2;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x, BY - 4, PW, BW + 8, 16);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText(mode === 'moves' ? 'MOVES LEFT' : 'TIME', cx, BY + 24);
        ctx.font = '800 38px Unbounded, sans-serif';
        const low = mode === 'moves' ? movesLeft <= 5 : timeLeft <= 10;
        ctx.fillStyle = low && state !== 'menu' ? (Math.sin(pulse * 8) > 0 ? C.p1 : C.text) : C.text;
        ctx.fillText(mode === 'moves' ? String(Math.max(0, movesLeft)) : clock(Math.ceil(timeLeft)), cx, BY + 64);
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText('SCORE', cx, BY + 106);
        ctx.font = '800 24px Unbounded, sans-serif';
        ctx.fillStyle = C.gold;
        ctx.fillText(String(score), cx, BY + 134);

        // Gravity compass.
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.fillText('GRAVITY', cx, BY + 176);
        const gy = BY + 248;
        const R = 54;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(cx, gy, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const a = gravAngle(i);
          ctx.fillStyle = i === gi ? C.mint : C.line;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * (R - 9), gy + Math.sin(a) * (R - 9), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const warn = turnComing();
        if (warn) {
          const na = gravAngle((gi + 1) % 4);
          ctx.fillStyle = U.alpha(C.gold, 0.35 + 0.35 * Math.sin(pulse * 8));
          drawArrow(ctx, cx, gy, na, 74, 9);
          ctx.strokeStyle = U.alpha(C.gold, 0.7);
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(cx, gy, R + 8, gravAngle(gi) + 0.2, gravAngle(gi) + Math.PI / 2 - 0.2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.fillStyle = C.mint;
        drawArrow(ctx, cx, gy, angDisp, 78, 10);
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(cx, gy, 5, 0, Math.PI * 2);
        ctx.fill();

        const left = TURN_EVERY - movesSince;
        ctx.font = FONT_SM;
        ctx.fillStyle = warn ? C.gold : C.text;
        ctx.fillText('turns in ' + left + ' move' + (left === 1 ? '' : 's'), cx, BY + 324);
        const pw = 12;
        const px0 = cx - (TURN_EVERY * pw) / 2 + pw / 2;
        for (let i = 0; i < TURN_EVERY; i++) {
          ctx.beginPath();
          ctx.arc(px0 + i * pw, BY + 346, 4, 0, Math.PI * 2);
          if (i < movesSince) {
            ctx.fillStyle = i >= TURN_EVERY - 2 ? C.gold : C.mint;
            ctx.fill();
          } else {
            ctx.strokeStyle = i >= TURN_EVERY - 2 ? U.alpha(C.gold, 0.7) : C.line;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Special gem legend.
        const rows = [
          { type: 1, sp: 'h', label: '4 in a row' },
          { type: 3, sp: 'burst', label: 'L or T shape' },
          { type: -1, sp: 'prism', label: '5 in a row' }
        ];
        ctx.textAlign = 'left';
        rows.forEach((row, i) => {
          const y = BY + 394 + i * 38;
          drawGem(ctx, row.type, row.sp, x + 30, y, 13, pulse);
          ctx.font = FONT_SM;
          ctx.fillStyle = C.muted;
          ctx.fillText(row.label, x + 56, y + 1);
        });
        ctx.textAlign = 'center';
        ctx.fillStyle = U.alpha(C.muted, 0.8);
        ctx.fillText(combo > 1 ? 'combo ×' + combo : 'best combo ×' + Math.max(1, bestCombo), cx, BY + 500);
        ctx.textAlign = 'left';
      }

      function draw() {
        ctx.save();
        if (shake > 0.2) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        if (state === 'menu' && !grid.length) {
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.violet, 0.3);
          ctx.fillText('Gem Swap', W / 2, H / 2);
          ctx.restore();
          return;
        }
        drawEdges();
        drawBoard();
        drawFx();
        drawPanel();
        drawBanner();
        ctx.restore();
      }

      /* ---------- Input ---------- */

      function cellAt(p) {
        const c = Math.floor((p.x - BX) / CS);
        const r = Math.floor((p.y - BY) / CS);
        return inB(r, c) ? { r, c } : null;
      }

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(canvas, 'pointerdown', (e) => {
        if (state === 'menu' || state === 'over') return;
        const p = api.toCanvas(e, canvas);
        const cell = cellAt(p);
        keyMode = false;
        held = false;
        if (!cell) {
          sel = null;
          return;
        }
        cursor = { r: cell.r, c: cell.c };
        if (!canInput()) return;
        idleT = 0;
        hintMove = null;
        if (sel && Math.abs(sel.r - cell.r) + Math.abs(sel.c - cell.c) === 1) {
          trySwap(sel, cell);
          drag = null;
          return;
        }
        const again = !!sel && sel.r === cell.r && sel.c === cell.c;
        sel = cell;
        drag = { r: cell.r, c: cell.c, x: p.x, y: p.y, again };
        if (!again) api.sfx('blip');
      });
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        hover = cellAt(p);
        if (!drag) return;
        const dx = p.x - drag.x;
        const dy = p.y - drag.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < CS * 0.35) return;
        const from = { r: drag.r, c: drag.c };
        const to = Math.abs(dx) > Math.abs(dy)
          ? { r: from.r, c: from.c + (dx > 0 ? 1 : -1) }
          : { r: from.r + (dy > 0 ? 1 : -1), c: from.c };
        drag = null;
        if (inB(to.r, to.c)) trySwap(from, to);
        else sel = null;
      });
      api.on(canvas, 'pointerup', () => {
        if (drag && drag.again) sel = null;
        drag = null;
      });
      api.on(canvas, 'pointerleave', () => { hover = null; });

      api.on(window, 'keydown', (e) => {
        if (state === 'menu' || state === 'over' || api.menuOpen) return;
        const d = DIRS[e.code];
        if (d) {
          keyMode = true;
          idleT = 0;
          hintMove = null;
          if (held) {
            if (canInput()) {
              const to = { r: cursor.r + d[0], c: cursor.c + d[1] };
              if (inB(to.r, to.c)) {
                trySwap({ r: cursor.r, c: cursor.c }, to);
              }
            }
            return;
          }
          sel = null;
          cursor = { r: U.clamp(cursor.r + d[0], 0, N - 1), c: U.clamp(cursor.c + d[1], 0, N - 1) };
        } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
          keyMode = true;
          if (!canInput()) return;
          idleT = 0;
          held = !held;
          sel = null;
          api.sfx(held ? 'blip' : 'tick');
          if (held) tipOnce('held', 'Gem picked up: press an arrow to swap it that way.', 3);
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
