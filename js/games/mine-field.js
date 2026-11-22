/* Mine Field — clear the field with number clues. Big openings charge a scanner,
   and one shield forgives a single mistake. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 580;
  const PAD = 12;
  const BAR_H = 54;
  const LEVELS = [
    { name: 'Easy', cols: 9, rows: 9, mines: 10, base: 1000 },
    { name: 'Medium', cols: 16, rows: 16, mines: 40, base: 4000 },
    { name: 'Hard', cols: 24, rows: 16, mines: 75, base: 10000 }
  ];
  const CHARGE_AT = 10;   // cells opened by one action to earn a scan charge
  const MAX_CHARGES = 3;
  const LONG_PRESS = 0.4; // seconds held to flag
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const NUM_COLORS = [C.text, C.p2, C.mint, C.p1, C.violet, C.gold, C.p2, C.text, C.muted];
  const MOVES = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
  const LOCK_SCAN = 1;
  const LOCK_SHIELD = 2;
  const LOCK_WIN = 3;

  /* ---------- Board model (shared by the game and the card art) ---------- */

  function makeBoard(cols, rows) {
    const n = cols * rows;
    return {
      cols, rows, n,
      mine: new Uint8Array(n),
      adj: new Uint8Array(n),
      open: new Uint8Array(n),
      flag: new Uint8Array(n),
      lock: new Uint8Array(n),   // flags placed by the scanner, the shield or a win
      blown: new Uint8Array(n),
      at: new Float32Array(n)    // when the cell's reveal / flag becomes visible
    };
  }

  function eachNeighbor(b, i, fn) {
    const x = i % b.cols;
    const y = (i / b.cols) | 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < b.cols && ny < b.rows) fn(ny * b.cols + nx);
      }
    }
  }

  /* Places mines anywhere except the 3×3 block around `safe`. Returns the count placed. */
  function plantMines(b, count, safe, rnd) {
    const sx = safe % b.cols;
    const sy = (safe / b.cols) | 0;
    const pool = [];
    for (let i = 0; i < b.n; i++) {
      if (Math.abs((i % b.cols) - sx) <= 1 && Math.abs(((i / b.cols) | 0) - sy) <= 1) continue;
      pool.push(i);
    }
    const k = Math.min(count, pool.length);
    for (let j = 0; j < k; j++) {
      const r = j + Math.floor(rnd() * (pool.length - j));
      const t = pool[j]; pool[j] = pool[r]; pool[r] = t;
      b.mine[pool[j]] = 1;
    }
    for (let i = 0; i < b.n; i++) {
      let c = 0;
      eachNeighbor(b, i, (j) => { c += b.mine[j]; });
      b.adj[i] = c;
    }
    return k;
  }

  /* Opens `start` and floods through zeros. onOpen(index, depth) per opened cell. */
  function flood(b, start, onOpen) {
    if (b.open[start] || b.flag[start] || b.mine[start]) return 0;
    const queue = [start];
    const depth = [0];
    b.open[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q];
      if (onOpen) onOpen(i, depth[q]);
      if (b.adj[i] !== 0) continue;
      eachNeighbor(b, i, (j) => {
        if (b.open[j] || b.flag[j] || b.mine[j]) return;
        b.open[j] = 1;
        queue.push(j);
        depth.push(depth[q] + 1);
      });
    }
    return queue.length;
  }

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /* ---------- Drawing helpers ---------- */

  function drawHidden(ctx, x, y, s, lit) {
    const g = Math.max(1, s * 0.06);
    ctx.fillStyle = lit ? C.line : C.panel2;
    U.roundRect(ctx, x + g, y + g, s - g * 2, s - g * 2, s * 0.16);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, lit ? 0.16 : 0.07);
    ctx.fillRect(x + s * 0.2, y + g + 1, s * 0.6, Math.max(1, s * 0.06));
  }

  /* Number font must be set by the caller (once per frame). k = pop-in progress 0..1. */
  function drawOpen(ctx, x, y, s, n, k) {
    const g = Math.max(1, s * 0.06) + (1 - k) * s * 0.3;
    ctx.fillStyle = C.panel;
    U.roundRect(ctx, x + g, y + g, s - g * 2, s - g * 2, s * 0.12);
    ctx.fill();
    if (n > 0) {
      ctx.globalAlpha = k;
      ctx.fillStyle = NUM_COLORS[n];
      ctx.fillText(String(n), x + s / 2, y + s / 2 + s * 0.04);
      ctx.globalAlpha = 1;
    }
  }

  function drawMine(ctx, cx, cy, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.3);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      ctx.moveTo(cx + Math.cos(a) * r * 1.45, cy + Math.sin(a) * r * 1.45);
      ctx.lineTo(cx - Math.cos(a) * r * 1.45, cy - Math.sin(a) * r * 1.45);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, 0.7);
    ctx.beginPath();
    ctx.arc(cx - r * 0.35, cy - r * 0.35, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlag(ctx, cx, cy, s, color, drop) {
    const y = cy - (drop || 0) * s * 0.4;
    const px = cx - s * 0.12;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(px, y - s * 0.28);
    ctx.lineTo(px, y + s * 0.26);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, y - s * 0.3);
    ctx.lineTo(px + s * 0.36, y - s * 0.15);
    ctx.lineTo(px, y - s * 0.01);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.fillRect(px - s * 0.14, y + s * 0.24, s * 0.28, Math.max(1.5, s * 0.06));
  }

  function shieldPath(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.5);
    ctx.lineTo(cx + s * 0.42, cy - s * 0.32);
    ctx.lineTo(cx + s * 0.38, cy + s * 0.06);
    ctx.quadraticCurveTo(cx + s * 0.3, cy + s * 0.36, cx, cy + s * 0.52);
    ctx.quadraticCurveTo(cx - s * 0.3, cy + s * 0.36, cx - s * 0.38, cy + s * 0.06);
    ctx.lineTo(cx - s * 0.42, cy - s * 0.32);
    ctx.closePath();
  }

  function drawShield(ctx, cx, cy, s, intact) {
    shieldPath(ctx, cx, cy, s);
    ctx.fillStyle = intact ? U.alpha(C.p2, 0.3) : U.alpha(C.muted, 0.12);
    ctx.fill();
    ctx.strokeStyle = intact ? C.p2 : C.muted;
    ctx.lineWidth = Math.max(1.5, s * 0.09);
    ctx.lineJoin = 'round';
    ctx.stroke();
    if (!intact) {
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.05, cy - s * 0.45);
      ctx.lineTo(cx - s * 0.1, cy - s * 0.1);
      ctx.lineTo(cx + s * 0.1, cy + s * 0.05);
      ctx.lineTo(cx - s * 0.05, cy + s * 0.45);
      ctx.stroke();
    }
  }

  /* Rotating radar beam clipped to a rectangle. */
  function drawBeam(ctx, x, y, w, h, angle, a) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const r = Math.hypot(w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = U.alpha(C.mint, a * (1 - k / 6) * 0.35);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle - (k + 1) * 0.12, angle - k * 0.12);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = U.alpha(C.mint, a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
    ctx.stroke();
    ctx.restore();
  }

  /* Card art board: built once from a fixed seed. */
  let thumbData = null;
  function thumbBoard() {
    if (thumbData) return thumbData;
    const cols = 16;
    const rows = 10;
    const safe = 5 * cols + 5;
    let b = null;
    for (let seed = 3; seed < 80; seed++) {
      b = makeBoard(cols, rows);
      plantMines(b, 24, safe, seeded(seed));
      const opened = flood(b, safe);
      if (opened >= 40 && opened <= 80) break;
    }
    let zone = { x: 13, y: 3 };
    search:
    for (let y = 1; y < rows - 1; y++) {
      for (let x = 11; x < cols - 1; x++) {
        let hidden = true;
        let mines = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const j = (y + dy) * cols + x + dx;
            if (b.open[j]) hidden = false;
            mines += b.mine[j];
          }
        }
        if (hidden && mines >= 2 && mines <= 3) { zone = { x, y }; break search; }
      }
    }
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const j = (zone.y + dy) * cols + zone.x + dx;
        if (b.mine[j]) { b.flag[j] = 1; b.lock[j] = LOCK_SCAN; } else b.open[j] = 1;
      }
    }
    let alt = 0;
    for (let i = 0; i < b.n; i++) {
      if (!b.mine[i] || b.flag[i]) continue;
      let edge = false;
      eachNeighbor(b, i, (j) => { if (b.open[j]) edge = true; });
      if (edge && alt++ % 2 === 0) b.flag[i] = 1;
    }
    thumbData = { b, zone };
    return thumbData;
  }

  function fmtTime(sec) {
    const s = Math.floor(sec);
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  Arcade.register({
    id: 'mine-field',
    title: 'Mine Field',
    mode: 'solo',
    players: '1P',
    color: C.mint,
    tagline: 'Clear the field using number clues without setting off a mine.',
    hook: 'Big openings charge a scanner, and one shield forgives a mistake.',
    tags: ['puzzle', 'logic', 'classic', 'mouse', 'touch', 'keyboard'],
    howTo: 'Each number tells you how many of the eight cells around it hide a mine. Reveal every safe cell to win. ' +
      'Your first click is always safe. Any reveal that opens 10 or more cells at once charges the scanner (up to 3): ' +
      'scan a cell to reveal its 3×3 area safely and auto-flag the mines inside. You also carry one shield: the first ' +
      'mine you step on breaks it instead of ending the run. Faster clears score more, and an unused shield adds 15%.',
    controls: [
      { keys: ['Click'], label: 'Reveal (click a satisfied number to open its neighbors)' },
      { keys: ['Right-click', 'F'], label: 'Flag' },
      { keys: ['Hold'], label: 'Flag on a touch screen' },
      { keys: ['S'], label: 'Scan, then pick a cell' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor' },
      { keys: ['Space', 'Enter'], label: 'Reveal at the cursor' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      const { b, zone } = thumbBoard();
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = Math.max(w / b.cols, h / b.rows);
      const ox = (w - s * b.cols) / 2;
      const oy = (h - s * b.rows) / 2;
      ctx.font = '800 ' + Math.round(s * 0.5) + 'px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < b.n; i++) {
        const x = ox + (i % b.cols) * s;
        const y = oy + ((i / b.cols) | 0) * s;
        if (b.open[i]) drawOpen(ctx, x, y, s, b.adj[i], 1);
        else {
          drawHidden(ctx, x, y, s, false);
          if (b.flag[i]) drawFlag(ctx, x + s / 2, y + s / 2, s, b.lock[i] ? C.mint : C.p1, 0);
        }
      }
      // Scanner sweep over its 3×3 zone.
      const zx = ox + (zone.x - 1) * s;
      const zy = oy + (zone.y - 1) * s;
      ctx.fillStyle = U.alpha(C.mint, 0.12);
      ctx.fillRect(zx, zy, s * 3, s * 3);
      drawBeam(ctx, zx, zy, s * 3, s * 3, t * 2.4 - 0.6, 0.9);
      ctx.strokeStyle = C.mint;
      ctx.lineWidth = 2;
      ctx.shadowColor = C.mint;
      ctx.shadowBlur = 12;
      ctx.strokeRect(zx + 1, zy + 1, s * 3 - 2, s * 3 - 2);
      ctx.shadowBlur = 0;
      // Scan charge pips + shield badge.
      const bx = w - 66;
      const by = h - 42;
      ctx.fillStyle = U.alpha(C.ink, 0.85);
      U.roundRect(ctx, bx - 60, by - 22, 116, 52, 14);
      ctx.fill();
      ctx.strokeStyle = U.alpha(C.p2, 0.6);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      const glow = 0.5 + 0.5 * Math.sin(t * 3);
      ctx.shadowColor = C.p2;
      ctx.shadowBlur = 8 + glow * 10;
      drawShield(ctx, bx + 26, by + 4, 34, true);
      ctx.shadowBlur = 0;
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k < 2 ? C.mint : 'transparent';
        ctx.strokeStyle = C.mint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bx - 40 + k * 18, by + 4, 6, 0, Math.PI * 2);
        if (k < 2) ctx.fill();
        ctx.stroke();
      }
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const barY = H - BAR_H + 8;
      const barH = BAR_H - 16;
      const tools = {
        flag: { x: PAD, y: barY, w: 168, h: barH },
        scan: { x: PAD + 180, y: barY, w: 176, h: barH },
        shield: { x: PAD + 368, y: barY, w: 128, h: barH }
      };

      let state = 'menu'; // 'menu' | 'play' | 'boom' | 'won' | 'over'
      let level = LEVELS[0];
      let flagMode = false;
      let b, cell, ox, oy, started, time, openCount, mineCount, charges, shield, scanMode;
      let cursor, kb, hover, press, clock, shake, overT, finalScore, pipPulse, lost;
      let particles, rings, sweeps, floaters, blasts, banner, flash;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      let lastScore = -1;
      let toldCharge = false;
      clock = 0;

      function resetBoard(lv) {
        level = lv;
        b = makeBoard(lv.cols, lv.rows);
        const availW = W - PAD * 2;
        const availH = H - BAR_H - PAD - 6;
        cell = Math.min(52, Math.floor(Math.min(availW / lv.cols, availH / lv.rows)));
        ox = Math.floor((W - cell * lv.cols) / 2);
        oy = PAD + Math.floor((availH - cell * lv.rows) / 2);
        started = false;
        time = 0;
        openCount = 0;
        mineCount = lv.mines;
        charges = 0;
        shield = 1;
        scanMode = false;
        cursor = { x: lv.cols >> 1, y: lv.rows >> 1 };
        kb = false;
        hover = -1;
        press = null;
        shake = 0;
        overT = 0;
        finalScore = 0;
        pipPulse = 0;
        lost = false;
        particles = [];
        rings = [];
        sweeps = [];
        floaters = [];
        blasts = [];
        banner = null;
        flash = null;
        lastStatus = '';
        lastScore = -1;
      }

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function potential() {
        const base = level.base;
        let s = Math.max(base * 0.1, base - Math.floor(time) * (base / 300));
        if (shield > 0) s *= 1.15;
        return Math.floor(s);
      }

      function startRun(lv) {
        resetBoard(lv);
        state = 'play';
        setHint('First click is always safe. Open 10+ cells in one go to charge the scanner.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Mine Field',
          text: 'Click to reveal, right-click or hold to flag, S to scan. One shield forgives a mine.',
          buttons: LEVELS.map((lv, k) => ({
            label: lv.name,
            primary: k === 0,
            onClick: () => startRun(lv)
          }))
        });
      }

      function center(i) {
        return { x: ox + (i % b.cols) * cell + cell / 2, y: oy + ((i / b.cols) | 0) * cell + cell / 2 };
      }

      function burst(x, y, n, colors, speed, grav) {
        for (let k = 0; k < n && particles.length < 500; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.2,
            life: U.rand(0.5, 1.1), max: 1.1, size: U.rand(2, 4.5),
            color: U.pick(colors), g: grav
          });
        }
      }

      function openFrom(i, delay) {
        const n = flood(b, i, (j, depth) => {
          b.at[j] = clock + (delay || 0) + Math.min(0.6, depth * 0.03);
        });
        openCount += n;
        return n;
      }

      function gainCharge(i, count) {
        const p = center(i);
        if (charges >= MAX_CHARGES) {
          floaters.push({ x: p.x, y: p.y, text: 'Scanner full', color: C.muted, t: 0 });
          return;
        }
        charges++;
        pipPulse = 1;
        api.sfx('power');
        floaters.push({ x: p.x, y: p.y, text: '+1 scan', color: C.mint, t: 0 });
        rings.push({ x: p.x, y: p.y, t: 0, life: 0.7, r: cell * 3, color: C.mint });
        if (!toldCharge) {
          toldCharge = true;
          setHint('That opening of ' + count + ' cells charged the scanner. Press S or tap Scan, ' +
            'then pick a cell to reveal its 3×3 area safely.', 9);
        }
      }

      function finishOpen(count, i) {
        if (!count) return;
        api.sfx(count > 1 ? 'flip' : 'tick');
        if (count >= CHARGE_AT) gainCharge(i, count);
        checkWin();
      }

      function reveal(i) {
        if (b.flag[i] || b.open[i]) return;
        if (!started) {
          mineCount = plantMines(b, level.mines, i, Math.random);
          started = true;
        }
        if (b.mine[i]) {
          stepOnMine(i);
          return;
        }
        finishOpen(openFrom(i, 0), i);
      }

      function chord(i) {
        if (!b.open[i] || !b.adj[i]) return;
        let flags = 0;
        const targets = [];
        eachNeighbor(b, i, (j) => {
          if (b.flag[j]) flags++;
          else if (!b.open[j]) targets.push(j);
        });
        if (!targets.length) return;
        if (flags !== b.adj[i]) {
          api.sfx('tick');
          rings.push(Object.assign(center(i), { t: 0, life: 0.3, r: cell * 0.8, color: C.muted }));
          return;
        }
        let total = 0;
        for (const j of targets) {
          if (state !== 'play') return;
          if (b.open[j] || b.flag[j]) continue;
          if (b.mine[j]) stepOnMine(j);
          else total += openFrom(j, 0);
        }
        if (state === 'play') finishOpen(total, i);
      }

      function toggleFlag(i) {
        if (b.open[i] || b.lock[i]) return;
        b.flag[i] ^= 1;
        b.at[i] = clock;
        api.sfx(b.flag[i] ? 'flip' : 'tick');
      }

      function rightAction(i) {
        if (b.open[i]) chord(i);
        else toggleFlag(i);
      }

      function toggleScan() {
        if (state !== 'play') return;
        if (scanMode) {
          scanMode = false;
          api.sfx('tick');
          return;
        }
        if (charges <= 0) {
          setHint('No scan charges yet. Open 10 or more cells with one reveal to earn one.', 4);
          api.sfx('tick');
          return;
        }
        scanMode = true;
        api.sfx('blip');
        setHint('Scanner armed: pick a cell to reveal its 3×3 area. Press S or tap Scan again to cancel.', 5);
      }

      function scan(i) {
        const cx = i % b.cols;
        const cy = (i / b.cols) | 0;
        const area = [];
        let useful = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 0 || y < 0 || x >= b.cols || y >= b.rows) continue;
            const j = y * b.cols + x;
            area.push({ j, dx, dy });
            if (!b.open[j] && !b.lock[j]) useful = true;
          }
        }
        if (!useful) {
          setHint('Nothing hidden there. Pick a cell next to unrevealed ground.', 3);
          api.sfx('tick');
          return;
        }
        scanMode = false;
        charges--;
        sweeps.push({ cx, cy, t: 0 });
        api.sfx('power');
        let found = 0;
        let total = 0;
        for (const c of area) {
          // The beam sweeps clockwise from 12 o'clock; each cell resolves as it passes.
          let ang = Math.atan2(c.dy, c.dx) + Math.PI / 2;
          if (ang < 0) ang += Math.PI * 2;
          const delay = c.dx || c.dy ? 0.08 + (ang / (Math.PI * 2)) * 0.55 : 0.04;
          const j = c.j;
          if (b.mine[j]) {
            if (!b.lock[j]) {
              b.flag[j] = 1;
              b.lock[j] = LOCK_SCAN;
              b.at[j] = clock + delay;
              found++;
            }
          } else if (!b.open[j]) {
            b.flag[j] = 0; // a wrong flag gets cleared
            total += openFrom(j, delay);
          }
        }
        setHint(found ? 'Scan found ' + found + ' mine' + (found === 1 ? '' : 's') + ' and flagged ' +
          (found === 1 ? 'it' : 'them') + '.' : 'Scan found no mines there.', 4);
        if (total) api.sfx('flip');
        checkWin();
      }

      function stepOnMine(i) {
        if (shield > 0) {
          shield = 0;
          b.flag[i] = 1;
          b.lock[i] = LOCK_SHIELD;
          b.at[i] = clock + 0.25;
          const p = center(i);
          burst(p.x, p.y, 70, [C.p2, C.p2, C.text, C.violet], 420, 300);
          rings.push({ x: p.x, y: p.y, t: 0, life: 0.8, r: 220, color: C.p2 });
          rings.push({ x: p.x, y: p.y, t: -0.12, life: 0.7, r: 120, color: C.text });
          shake = 16;
          flash = { color: C.p2, a: 0.45 };
          banner = { text: 'Shield broke!', sub: 'That mine is flagged now. The next one ends the run.', color: C.p2, t: 0, life: 2.4 };
          api.sfx('boom');
          api.sfx('hit');
          setHint('Your shield absorbed that mine and flagged it. Keep going, but the next mine ends the run.', 8);
          return;
        }
        lose(i);
      }

      function lose(i) {
        state = 'boom';
        lost = true;
        scanMode = false;
        press = null;
        const hx = i % b.cols;
        const hy = (i / b.cols) | 0;
        const rest = [];
        for (let j = 0; j < b.n; j++) if (b.mine[j] && !b.flag[j] && j !== i) rest.push(j);
        const d = (j) => Math.hypot((j % b.cols) - hx, ((j / b.cols) | 0) - hy);
        rest.sort((p, q) => d(p) - d(q));
        const step = Math.min(0.09, 1.6 / Math.max(1, rest.length));
        blasts = [{ i, at: clock, done: false }]
          .concat(rest.map((j, k) => ({ i: j, at: clock + 0.4 + k * step, done: false })));
        overT = clock + 0.4 + rest.length * step + 1;
        flash = { color: C.p1, a: 0.55 };
        banner = { text: 'Boom!', sub: 'You stepped on a mine.', color: C.p1, t: 0, life: 2.4 };
        api.setScore(0);
        api.sfx('lose');
      }

      function checkWin() {
        if (state !== 'play' || !started || openCount < b.n - mineCount) return;
        state = 'won';
        scanMode = false;
        press = null;
        finalScore = potential();
        let k = 0;
        for (let j = 0; j < b.n; j++) {
          if (!b.mine[j] || b.flag[j]) continue;
          b.flag[j] = 1;
          b.lock[j] = LOCK_WIN;
          b.at[j] = clock + 0.2 + (k++) * 0.03;
        }
        for (let n = 0; n < 6; n++) {
          burst(U.rand(ox, ox + cell * b.cols), oy + U.rand(0, cell * b.rows * 0.5), 22,
            [C.mint, C.gold, C.p2, C.p1, C.violet], 320, 420);
        }
        banner = { text: 'Cleared!', sub: 'Every safe cell is open.', color: C.mint, t: 0, life: 2.4 };
        overT = clock + 1.7;
        api.setScore(finalScore);
        api.sfx('win');
      }

      function endRun(won) {
        state = 'over';
        const score = won ? finalScore : 0;
        api.setScore(score);
        const isBest = api.reportScore(score);
        const t = fmtTime(time);
        const text = won
          ? level.name + ' cleared in ' + t + (shield > 0 ? ' with the shield intact (+15%). ' : '. ') + score + ' points.'
          : 'A mine went off after ' + t + '. ' + openCount + ' of ' + (b.n - mineCount) + ' safe cells were open.';
        api.setStatus(text);
        lastStatus = text;
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : won ? 'Cleared!' : 'Game over',
          text,
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startRun(level) },
            { label: 'Change difficulty', onClick: showStartMenu }
          ]
        });
      }

      function act(i) {
        if (state !== 'play' || i < 0) return;
        if (scanMode) {
          if (started) scan(i);
          return;
        }
        if (b.open[i]) chord(i);
        else if (flagMode) toggleFlag(i);
        else reveal(i);
      }

      function cellAt(p) {
        const x = Math.floor((p.x - ox) / cell);
        const y = Math.floor((p.y - oy) / cell);
        if (x < 0 || y < 0 || x >= b.cols || y >= b.rows) return -1;
        return y * b.cols + x;
      }

      function toolAt(p) {
        for (const name in tools) {
          const r = tools[name];
          if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) return name;
        }
        return null;
      }

      function cursorIndex() {
        return cursor.y * b.cols + cursor.x;
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (state !== 'play') return;
        const mv = MOVES[e.code];
        if (mv) {
          if (kb) {
            cursor.x = U.clamp(cursor.x + mv[0], 0, b.cols - 1);
            cursor.y = U.clamp(cursor.y + mv[1], 0, b.rows - 1);
          } else if (hover >= 0) {
            cursor = { x: hover % b.cols, y: (hover / b.cols) | 0 };
          }
          kb = true;
          return;
        }
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          kb = true;
          act(cursorIndex());
        } else if (e.code === 'KeyF') {
          const i = kb || hover < 0 ? cursorIndex() : hover;
          if (hover < 0) kb = true;
          rightAction(i);
        } else if (e.code === 'KeyS') {
          toggleScan();
        }
      });

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        kb = false;
        press = null;
        const tool = toolAt(p);
        if (tool === 'flag') {
          flagMode = !flagMode;
          api.sfx('flip');
          setHint(flagMode ? 'Flag mode on: taps place flags. Tap numbers to open their neighbors.' : 'Flag mode off: taps reveal cells.', 4);
          return;
        }
        if (tool === 'scan') {
          toggleScan();
          return;
        }
        const i = cellAt(p);
        hover = i;
        if (i < 0) return;
        if (e.button === 2) {
          rightAction(i);
          return;
        }
        press = { i, x: p.x, y: p.y, t: clock, done: false };
      });

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        const i = cellAt(p);
        if (i !== hover) kb = false;
        hover = i;
        if (press && !press.done && Math.hypot(p.x - press.x, p.y - press.y) > Math.max(10, cell * 0.4)) press = null;
      });

      api.on(canvas, 'pointerup', () => {
        const pr = press;
        press = null;
        if (!pr || pr.done) return;
        act(pr.i);
      });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        if (state === 'play' && started) time += dt;
        shake = Math.max(0, shake - dt * 40);
        pipPulse = Math.max(0, pipPulse - dt * 1.5);
        if (hintT > 0) hintT -= dt;
        if (flash) {
          flash.a -= dt * 1.2;
          if (flash.a <= 0) flash = null;
        }
        if (press && !press.done && clock - press.t >= LONG_PRESS) {
          press.done = true;
          if (state === 'play') rightAction(press.i);
        }
        for (const p of particles) {
          p.vy += p.g * dt;
          p.vx *= 1 - dt * 1.5;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const r of rings) r.t += dt;
        rings = rings.filter((r) => r.t < r.life);
        for (const s of sweeps) s.t += dt;
        sweeps = sweeps.filter((s) => s.t < 1);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 1.3);
        if (banner) {
          banner.t += dt;
          if (banner.t > banner.life) banner = null;
        }

        if (state === 'boom') {
          for (let k = 0; k < blasts.length; k++) {
            const bl = blasts[k];
            if (bl.done || clock < bl.at) continue;
            bl.done = true;
            b.blown[bl.i] = 1;
            const p = center(bl.i);
            burst(p.x, p.y, 16, [C.p1, C.gold, C.text], 260, 260);
            rings.push({ x: p.x, y: p.y, t: 0, life: 0.45, r: cell * 1.6, color: C.gold });
            shake = Math.min(18, shake + 7);
            if (k === 0) api.sfx('boom');
            else if (k % 4 === 0) api.sfx('hit');
          }
          if (clock >= overT) endRun(false);
        } else if (state === 'won' && clock >= overT) {
          endRun(true);
        }

        if (state === 'play' || state === 'boom' || state === 'won') {
          let flags = 0;
          for (let i = 0; i < b.n; i++) flags += b.flag[i];
          const status = hintT > 0 ? hint
            : level.name + ' · Mines left ' + (mineCount - flags) + ' · Time ' + fmtTime(time) +
              ' · Scans ' + charges + '/' + MAX_CHARGES + ' · Shield ' + (shield ? 'up' : 'used');
          if (status !== lastStatus) {
            api.setStatus(status);
            lastStatus = status;
          }
          if (state === 'play') {
            const s = potential();
            if (s !== lastScore) {
              api.setScore(s);
              lastScore = s;
            }
          }
        }
      }

      /* ---------- Draw ---------- */

      function drawBoard() {
        const bw = cell * b.cols;
        const bh = cell * b.rows;
        // Frame: glows cyan while the shield is up.
        ctx.fillStyle = C.ink;
        U.roundRect(ctx, ox - 6, oy - 6, bw + 12, bh + 12, 12);
        ctx.fill();
        if (shield > 0) {
          ctx.shadowColor = C.p2;
          ctx.shadowBlur = 10 + Math.sin(clock * 2.5) * 4;
          ctx.strokeStyle = U.alpha(C.p2, 0.55);
        } else {
          ctx.strokeStyle = C.line;
        }
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.shadowBlur = 0;

        const target = kb ? cursorIndex() : hover;
        const ended = state === 'boom' || state === 'over';
        ctx.font = '800 ' + Math.round(cell * 0.46) + 'px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < b.n; i++) {
          const x = ox + (i % b.cols) * cell;
          const y = oy + ((i / b.cols) | 0) * cell;
          const age = clock - b.at[i];
          if (b.blown[i]) {
            ctx.fillStyle = U.alpha(C.p1, 0.85);
            U.roundRect(ctx, x + 1, y + 1, cell - 2, cell - 2, cell * 0.14);
            ctx.fill();
            drawMine(ctx, x + cell / 2, y + cell / 2, cell * 0.2, C.ink);
          } else if (b.open[i] && age >= 0) {
            drawOpen(ctx, x, y, cell, b.adj[i], Math.min(1, age / 0.15));
          } else {
            drawHidden(ctx, x, y, cell, i === target && state === 'play' && !scanMode);
            if (b.flag[i] && age >= 0) {
              const color = b.lock[i] === LOCK_SCAN || b.lock[i] === LOCK_WIN ? C.mint
                : b.lock[i] === LOCK_SHIELD ? C.p2 : C.p1;
              drawFlag(ctx, x + cell / 2, y + cell / 2, cell, color, age < 0.15 ? 1 - age / 0.15 : 0);
              if (b.lock[i] === LOCK_SHIELD) {
                ctx.strokeStyle = U.alpha(C.p2, 0.7);
                ctx.lineWidth = 1.5;
                U.roundRect(ctx, x + 2, y + 2, cell - 4, cell - 4, cell * 0.16);
                ctx.stroke();
              }
              if (ended && lost && !b.mine[i]) {
                ctx.strokeStyle = C.p1;
                ctx.lineWidth = Math.max(2, cell * 0.08);
                ctx.beginPath();
                ctx.moveTo(x + cell * 0.22, y + cell * 0.22);
                ctx.lineTo(x + cell * 0.78, y + cell * 0.78);
                ctx.moveTo(x + cell * 0.78, y + cell * 0.22);
                ctx.lineTo(x + cell * 0.22, y + cell * 0.78);
                ctx.stroke();
              }
            }
          }
        }

        // Scanner preview: the 3×3 it would reveal.
        if (state === 'play' && scanMode && target >= 0) {
          const tx = U.clamp((target % b.cols) - 1, 0, b.cols - 1);
          const ty = U.clamp(((target / b.cols) | 0) - 1, 0, b.rows - 1);
          const tx2 = U.clamp((target % b.cols) + 1, 0, b.cols - 1);
          const ty2 = U.clamp(((target / b.cols) | 0) + 1, 0, b.rows - 1);
          const rx = ox + tx * cell;
          const ry = oy + ty * cell;
          const rw = (tx2 - tx + 1) * cell;
          const rh = (ty2 - ty + 1) * cell;
          ctx.fillStyle = U.alpha(C.mint, 0.12 + Math.sin(clock * 6) * 0.05);
          ctx.fillRect(rx, ry, rw, rh);
          ctx.setLineDash([6, 5]);
          ctx.lineDashOffset = -clock * 20;
          ctx.strokeStyle = C.mint;
          ctx.lineWidth = 2;
          ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
          ctx.setLineDash([]);
        }

        // Scanner sweeps in progress.
        for (const s of sweeps) {
          const tx = Math.max(0, s.cx - 1);
          const ty = Math.max(0, s.cy - 1);
          const tx2 = Math.min(b.cols - 1, s.cx + 1);
          const ty2 = Math.min(b.rows - 1, s.cy + 1);
          const a = s.t < 0.7 ? 1 : 1 - (s.t - 0.7) / 0.3;
          const rx = ox + tx * cell;
          const ry = oy + ty * cell;
          const rw = (tx2 - tx + 1) * cell;
          const rh = (ty2 - ty + 1) * cell;
          if (s.t < 0.7) {
            const bcx = ox + s.cx * cell + cell / 2;
            const bcy = oy + s.cy * cell + cell / 2;
            drawBeam(ctx, bcx - cell * 1.5, bcy - cell * 1.5, cell * 3, cell * 3,
              -Math.PI / 2 + (s.t / 0.63) * Math.PI * 2, a);
          }
          ctx.strokeStyle = U.alpha(C.mint, a);
          ctx.lineWidth = 2.5;
          ctx.shadowColor = C.mint;
          ctx.shadowBlur = 14;
          ctx.strokeRect(rx + 1, ry + 1, rw - 2, rh - 2);
          ctx.shadowBlur = 0;
        }

        // Keyboard cursor.
        if (kb && state === 'play') {
          const x = ox + cursor.x * cell;
          const y = oy + cursor.y * cell;
          ctx.strokeStyle = scanMode ? C.mint : C.gold;
          ctx.lineWidth = 2.5;
          U.roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, cell * 0.18);
          ctx.stroke();
        }
      }

      function drawEffects() {
        for (const r of rings) {
          if (r.t < 0) continue;
          const k = r.t / r.life;
          ctx.strokeStyle = U.alpha(r.color, (1 - k) * 0.9);
          ctx.lineWidth = 3 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r * (0.15 + k * 0.85), 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floaters) {
          ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3);
          ctx.fillStyle = C.ink;
          ctx.fillText(f.text, f.x + 1, f.y - f.t * 40 + 1);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y - f.t * 40);
        }
        ctx.globalAlpha = 1;
      }

      function drawButton(r, on, ready, color) {
        ctx.fillStyle = on ? U.alpha(color, 0.25) : C.panel2;
        U.roundRect(ctx, r.x, r.y, r.w, r.h, 10);
        ctx.fill();
        ctx.strokeStyle = on || ready ? color : C.line;
        ctx.lineWidth = on ? 2 : 1.5;
        ctx.stroke();
      }

      function drawToolbar() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, H - BAR_H, W, BAR_H);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, H - BAR_H, W, 1);
        ctx.font = FONT_HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const my = barY + barH / 2;

        // Flag mode toggle.
        const f = tools.flag;
        drawButton(f, flagMode, false, C.p1);
        drawFlag(ctx, f.x + 20, my, 24, C.p1, 0);
        ctx.fillStyle = C.text;
        ctx.fillText('Flag mode', f.x + 38, my);
        const sx = f.x + f.w - 40;
        ctx.fillStyle = flagMode ? C.p1 : C.line;
        U.roundRect(ctx, sx, my - 9, 30, 18, 9);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.beginPath();
        ctx.arc(flagMode ? sx + 21 : sx + 9, my, 6, 0, Math.PI * 2);
        ctx.fill();

        // Scan button with charge pips.
        const s = tools.scan;
        drawButton(s, scanMode, charges > 0, C.mint);
        if (charges > 0 && !scanMode) {
          ctx.shadowColor = C.mint;
          ctx.shadowBlur = 6 + Math.sin(clock * 4) * 4;
          ctx.strokeStyle = U.alpha(C.mint, 0.6);
          U.roundRect(ctx, s.x, s.y, s.w, s.h, 10);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = charges > 0 ? C.mint : C.muted;
        ctx.fillText(scanMode ? 'Pick cell' : 'Scan (S)', s.x + 12, my);
        for (let k = 0; k < MAX_CHARGES; k++) {
          const px = s.x + s.w - 62 + k * 20;
          const pr = 6 + (k === charges - 1 ? pipPulse * 4 : 0);
          ctx.beginPath();
          ctx.arc(px, my, pr, 0, Math.PI * 2);
          if (k < charges) {
            ctx.fillStyle = C.mint;
            ctx.fill();
          }
          ctx.strokeStyle = k < charges ? C.mint : C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Shield indicator.
        const sh = tools.shield;
        drawButton(sh, false, shield > 0, C.p2);
        if (shield > 0) {
          ctx.shadowColor = C.p2;
          ctx.shadowBlur = 8;
        }
        drawShield(ctx, sh.x + 20, my, 22, shield > 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = shield > 0 ? C.p2 : C.muted;
        ctx.fillText(shield > 0 ? 'Shield' : 'Broken', sh.x + 38, my);

        // Mines left + time.
        let flags = 0;
        for (let i = 0; i < b.n; i++) flags += b.flag[i];
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('Time ', W - PAD - 64, my);
        ctx.fillStyle = C.text;
        ctx.fillText(fmtTime(time), W - PAD, my);
        ctx.fillStyle = C.muted;
        ctx.fillText('Mines ', W - PAD - 150, my);
        ctx.fillStyle = C.text;
        ctx.fillText(String(mineCount - flags), W - PAD - 118, my);
      }

      function drawBanner() {
        if (!banner) return;
        const k = banner.t;
        const a = Math.min(1, k * 5, (banner.life - k) * 2.5);
        const scale = 1 + Math.max(0, 0.25 - k) * 1.2;
        const cy = oy + (cell * b.rows) / 2;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = U.alpha(C.ink, 0.78);
        ctx.fillRect(0, cy - 58, W, 116);
        ctx.fillStyle = U.alpha(banner.color, 0.8);
        ctx.fillRect(0, cy - 58, W, 2);
        ctx.fillRect(0, cy + 56, W, 2);
        ctx.save();
        ctx.translate(W / 2, cy - 10);
        ctx.scale(scale, scale);
        ctx.font = FONT_BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = banner.color;
        ctx.shadowColor = banner.color;
        ctx.shadowBlur = 18;
        ctx.fillText(banner.text, 0, 0);
        ctx.restore();
        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.text;
        ctx.fillText(banner.sub, W / 2, cy + 34);
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawBoard();
        drawEffects();
        ctx.restore();
        drawToolbar();
        drawBanner();
        if (flash) {
          ctx.fillStyle = U.alpha(flash.color, Math.max(0, flash.a) * 0.5);
          ctx.fillRect(0, 0, W, H);
        }
      }

      resetBoard(LEVELS[0]);
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
