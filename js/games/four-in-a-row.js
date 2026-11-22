/* Four in a Row — each player also gets one bomb disc per round. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 600;
  const COLS = 7;
  const ROWS = 6;
  const CELL = 70;
  const BX = (W - CELL * COLS) / 2;
  const BY = 128;
  const GHOST_Y = BY - 46;
  const R_DISC = 27;
  const R_HOLE = 30;
  const GRAVITY = 3600;
  const PANEL_W = 124;
  const WIN = 100000;
  const BOMB_VALUE = 7;   // what an unused bomb is worth to the computer
  const DEPTH = { easy: 2, normal: 4, hard: 6 };
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SMALL = '600 12px "JetBrains Mono", monospace';
  const CENTER_ORDER = [3, 2, 4, 1, 5, 0, 6];
  const BLAST = [[0, -1], [0, 1], [1, 0]]; // [dRow, dCol]: left, right, below (row 0 is the top)

  /* All 69 windows of four cells, each listed in board order along its direction. */
  const WINDOWS = [];
  [[0, 1], [1, 0], [1, 1], [1, -1]].forEach(([dr, dc]) => {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const er = r + dr * 3;
        const ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        WINDOWS.push([0, 1, 2, 3].map((i) => (r + dr * i) * COLS + c + dc * i));
      }
    }
  });
  const WIN_AT = [];
  for (let i = 0; i < ROWS * COLS; i++) WIN_AT.push(WINDOWS.filter((w) => w.indexOf(i) >= 0));

  /* ---------- Rules: grid[row * 7 + col], row 0 on top; h[c] = discs in column c ---------- */

  function newGame() {
    return { grid: new Array(ROWS * COLS).fill(0), h: [0, 0, 0, 0, 0, 0, 0], bombs: [0, 1, 1] };
  }

  function copyGame(g) {
    return { grid: g.grid.slice(), h: g.h.slice(), bombs: g.bombs.slice() };
  }

  function isFull(g) {
    for (let c = 0; c < COLS; c++) if (g.h[c] < ROWS) return false;
    return true;
  }

  function fourAt(grid, p, idx) {
    for (const w of WIN_AT[idx]) {
      if (grid[w[0]] === p && grid[w[1]] === p && grid[w[2]] === p && grid[w[3]] === p) return w;
    }
    return null;
  }

  function findFour(grid, p) {
    for (const w of WINDOWS) {
      if (grid[w[0]] === p && grid[w[1]] === p && grid[w[2]] === p && grid[w[3]] === p) return w;
    }
    return null;
  }

  /* Windows where p has three and the fourth cell is empty. */
  function threats(grid, p) {
    let n = 0;
    for (const w of WINDOWS) {
      let mine = 0, empty = 0;
      for (let i = 0; i < 4; i++) {
        const x = grid[w[i]];
        if (x === p) mine++;
        else if (x === 0) empty++;
      }
      if (mine === 3 && empty === 1) n++;
    }
    return n;
  }

  /* Pack the given columns down. Returns the discs that moved. */
  function collapse(g, cols) {
    const moved = [];
    for (const c of cols) {
      if (c < 0 || c >= COLS) continue;
      let write = ROWS - 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const p = g.grid[r * COLS + c];
        if (!p) continue;
        if (r !== write) {
          g.grid[write * COLS + c] = p;
          g.grid[r * COLS + c] = 0;
          moved.push({ c, from: r, to: write, p });
        }
        write--;
      }
      g.h[c] = ROWS - 1 - write;
    }
    return moved;
  }

  /* A bomb lands on top of column c, removes itself and the discs left, right and below, then gravity. */
  function applyBomb(g, c) {
    const r = ROWS - 1 - g.h[c];
    const hit = [];
    for (const [dr, dc] of BLAST) {
      const rr = r + dr;
      const cc = c + dc;
      if (rr < ROWS && cc >= 0 && cc < COLS && g.grid[rr * COLS + cc]) hit.push(rr * COLS + cc);
    }
    hit.forEach((i) => { g.grid[i] = 0; });
    const falls = collapse(g, [c - 1, c, c + 1]);
    return { r, hit, falls };
  }

  /* ---------- Computer player: alpha-beta negamax, bombs considered in the first two plies ---------- */

  function evaluate(g, p) {
    const o = 3 - p;
    let v = 0;
    let mineNow = 0;
    let theirsNow = 0;
    for (const w of WINDOWS) {
      let a = 0, b = 0, gap = -1;
      for (let i = 0; i < 4; i++) {
        const x = g.grid[w[i]];
        if (x === p) a++;
        else if (x === o) b++;
        else gap = w[i];
      }
      if (a && b) continue;
      // A three whose gap can be filled right now is a live threat.
      const live = gap >= 0 && Math.floor(gap / COLS) === ROWS - 1 - g.h[gap % COLS];
      if (a === 3) { v += 5; if (live) mineNow++; }
      else if (a === 2) v += 2;
      else if (b === 3) { v -= 6; if (live) theirsNow++; }
      else if (b === 2) v -= 2;
    }
    if (mineNow) v += 60;               // the side to move just wins
    else if (theirsNow >= 2) v -= 60;   // two live threats can't both be blocked
    for (let r = 0; r < ROWS; r++) {
      const x = g.grid[r * COLS + 3];
      if (x === p) v += 3;
      else if (x === o) v -= 3;
    }
    return v + (g.bombs[p] - g.bombs[o]) * BOMB_VALUE;
  }

  function cpuMove(g0, p, depth, noise) {
    const g = copyGame(g0);

    function genMoves(side, ply) {
      const list = [];
      for (const c of CENTER_ORDER) if (g.h[c] < ROWS) list.push({ c, bomb: false });
      if (ply < 2 && g.bombs[side] > 0) {
        // Only bombs that win or break up rival threats are worth a look.
        const before = threats(g.grid, 3 - side);
        for (const c of CENTER_ORDER) {
          if (g.h[c] >= ROWS) continue;
          const snap = copyGame(g);
          applyBomb(g, c);
          const good = findFour(g.grid, side) || threats(g.grid, 3 - side) < before;
          g.grid = snap.grid;
          g.h = snap.h;
          if (good) list.push({ c, bomb: true });
        }
      }
      return list;
    }

    function tryMove(side, m, d, ply, alpha, beta) {
      let v;
      if (!m.bomb) {
        const idx = (ROWS - 1 - g.h[m.c]) * COLS + m.c;
        g.grid[idx] = side;
        g.h[m.c]++;
        if (fourAt(g.grid, side, idx)) v = WIN + d;
        else if (isFull(g)) v = 0;
        else v = -nm(3 - side, d - 1, ply + 1, -beta, -alpha);
        g.grid[idx] = 0;
        g.h[m.c]--;
        return v;
      }
      const snap = copyGame(g);
      applyBomb(g, m.c);
      g.bombs[side]--;
      if (findFour(g.grid, side)) v = WIN + d;          // the bomber wins ties
      else if (findFour(g.grid, 3 - side)) v = -(WIN + d);
      else v = -nm(3 - side, d - 1, ply + 1, -beta, -alpha);
      g.grid = snap.grid;
      g.h = snap.h;
      g.bombs = snap.bombs;
      return v;
    }

    function nm(side, d, ply, alpha, beta) {
      if (d === 0) return evaluate(g, side);
      let best = -Infinity;
      for (const m of genMoves(side, ply)) {
        const v = tryMove(side, m, d, ply, alpha, beta);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
      }
      return best === -Infinity ? 0 : best;
    }

    let best = -Infinity;
    let picks = [];
    for (const m of genMoves(p, 0)) {
      let v = tryMove(p, m, depth, 0, noise ? -Infinity : best - 1, Infinity);
      if (noise) v += U.rand(-noise, noise);
      if (v > best) { best = v; picks = [m]; }
      else if (v === best) picks.push(m);
    }
    return U.pick(picks);
  }

  /* ---------- Drawing ---------- */

  function drawDisc(ctx, x, y, r, p, bomb, t) {
    const col = p === 1 ? C.p1 : C.p2;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = r * 0.14;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    if (bomb) {
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.58, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = r * 0.1;
      ctx.setLineDash([r * 0.22, r * 0.16]);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      // Fuse and spark.
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = r * 0.12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + r * 0.45, y - r * 0.85);
      ctx.quadraticCurveTo(x + r * 0.55, y - r * 1.35, x + r * 0.95, y - r * 1.4);
      ctx.stroke();
      const s = r * (0.28 + 0.12 * Math.sin(t * 30));
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 8;
        const rr = i % 2 ? s * 0.4 : s;
        ctx.lineTo(x + r * 0.95 + Math.cos(a) * rr, y - r * 1.4 + Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* Board face with holes cut out, so discs show through and fall behind it. */
  function drawFace(ctx, x0, y0, cell, rHole, pad) {
    U.roundRect(ctx, x0 - pad, y0 - pad, cell * COLS + pad * 2, cell * ROWS + pad * 2, pad * 1.6);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cx = x0 + c * cell + cell / 2;
        const cy = y0 + r * cell + cell / 2;
        ctx.moveTo(cx + rHole, cy);
        ctx.arc(cx, cy, rHole, 0, Math.PI * 2);
      }
    }
    ctx.fillStyle = C.panel2;
    ctx.fill('evenodd');
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  Arcade.register({
    id: 'four-in-a-row',
    title: 'Four in a Row',
    mode: 'together',
    players: '1–2P',
    color: C.gold,
    tagline: 'Drop discs and connect four before your rival does.',
    hook: 'Each player gets one bomb disc that blasts its neighbors out of the grid.',
    tags: ['classic', 'board', 'strategy', 'turn-based', 'two player', 'vs computer', 'bomb'],
    howTo: 'Take turns dropping discs into the seven columns. Four of your color in a row, column or ' +
      'diagonal wins. Once per round you can arm your bomb (press B or tap the Bomb button): it drops like ' +
      'a disc, then blows up, removing itself and the discs directly left, right and below it. Discs above ' +
      'fall into the gaps. If the blast gives both players four, the bomber wins. A full grid is a draw.',
    controls: [
      { keys: ['←', '→'], label: 'Pick a column' },
      { keys: ['Enter', 'Space', '↓'], label: 'Drop' },
      { keys: ['1–7'], label: 'Drop in that column' },
      { keys: ['B'], label: 'Arm or disarm your bomb' },
      { keys: ['Click'], label: 'Drop, or tap Bomb under your tray' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const cell = Math.min(w / 11, (h - 40) / ROWS);
      const x0 = (w - cell * COLS) / 2;
      const y0 = h - cell * ROWS - 8;
      const before = [
        '.......',
        '..1....',
        '..2.2..',
        '..212..',
        '.21221.',
        '2121122'
      ];
      const k = t % 3.4;
      const fall = U.clamp((k - 1.0) / 0.35, 0, 1);
      const blown = k >= 1.6;
      const settle = U.clamp((k - 1.75) / 0.3, 0, 1);
      const fade = U.clamp((k - 2.9) / 0.5, 0, 1);
      const cx = (c) => x0 + c * cell + cell / 2;
      const cy = (r) => y0 + r * cell + cell / 2;
      const gone = { 2: [2, 4], 3: [3] }; // blasted cells: row -> cols
      const rd = cell * 0.4;
      ctx.globalAlpha = 1 - fade * 0.8;
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const p = Number(before[r][c]) || 0;
          if (!p) continue;
          if (blown && gone[r] && gone[r].indexOf(c) >= 0) continue;
          const y = blown && r === 1 && c === 2 ? U.lerp(cy(1), cy(2), settle * settle) : cy(r);
          drawDisc(ctx, cx(c), y, rd, p, false, t);
        }
      }
      if (!blown) {
        const by = U.lerp(y0 - cell * 0.55, cy(2), fall * fall);
        drawDisc(ctx, cx(3), by, rd, 1, true, t);
      }
      ctx.globalAlpha = 1;
      drawFace(ctx, x0, y0, cell, cell * 0.43, 6);
      if (!blown) {
        ctx.strokeStyle = U.alpha(C.gold, 0.6 + 0.4 * Math.sin(t * 6));
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        [[2, 2], [2, 4], [3, 3]].forEach(([r, c]) => {
          ctx.beginPath();
          ctx.arc(cx(c), cy(r), cell * 0.46, 0, Math.PI * 2);
          ctx.stroke();
        });
        ctx.setLineDash([]);
      } else {
        const e = U.clamp((k - 1.6) / 0.6, 0, 1);
        ctx.globalAlpha = 1 - e;
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx(3), cy(2), cell * (0.4 + e * 2), 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 18; i++) {
          const a = i * 2.4;
          const d = cell * (0.3 + e * (1 + (i % 4) * 0.4));
          ctx.fillStyle = [C.gold, C.p1, C.p2][i % 3];
          ctx.fillRect(cx(3) + Math.cos(a) * d - 2, cy(2) + Math.sin(a) * d - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
      }
      // Trays at the sides.
      drawDisc(ctx, x0 / 2, h / 2 - 8, cell * 0.55, 1, false, t);
      drawDisc(ctx, w - x0 / 2, h / 2 - 8, cell * 0.55, 2, false, t);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let G = newGame();
      let state = 'menu';    // 'menu' | 'play' | 'over'
      let vsCpu = false;
      let level = 'normal';
      let turn = 1;
      let firstTurn = 1;
      let round = 0;
      let busy = false;
      let armed = false;
      let cpuPreview = null;  // { bomb } while the computer shows its move
      let col = 3;
      let anim = null;
      let parts = [];
      let rings = [];
      let shake = 0;
      let clock = 0;
      let winCells = null;
      let tally = { 1: 0, 2: 0, draw: 0 };
      let pendingHint = '';
      let bombedOnce = false;

      const isCpu = (p) => vsCpu && p === 2;
      const nameOf = (p) => (vsCpu ? (p === 1 ? 'You' : 'Computer') : 'Player ' + p);
      const colorOf = (p) => (p === 1 ? C.p1 : C.p2);
      const cellX = (c) => BX + c * CELL + CELL / 2;
      const cellY = (r) => BY + r * CELL + CELL / 2;
      const panelX = (p) => (p === 1 ? 16 : W - 16 - PANEL_W);
      const bombBtn = (p) => ({ x: panelX(p) + 10, y: BY + 168, w: PANEL_W - 20, h: 48 });

      function showTally() {
        api.setScore(tally[1] + ' – ' + tally[2]);
      }

      function showModeMenu() {
        state = 'menu';
        api.setStatus('Connect four. Each player has one bomb disc per round.');
        api.menu({
          title: 'Four in a Row',
          text: 'Connect four to win. Once a round you can drop a bomb that blasts the discs ' +
            'left, right and below it out of the grid.',
          buttons: [
            { label: '2 players', onClick: () => startMatch(false) },
            { label: 'vs computer', primary: true, onClick: showLevelMenu }
          ]
        });
      }

      function showLevelMenu() {
        api.menu({
          title: 'Pick a difficulty',
          text: 'You play coral. The computer plays cyan and saves its bomb for the right moment.',
          buttons: [
            { label: 'Easy', onClick: () => { level = 'easy'; startMatch(true); } },
            { label: 'Normal', primary: true, onClick: () => { level = 'normal'; startMatch(true); } },
            { label: 'Hard', onClick: () => { level = 'hard'; startMatch(true); } }
          ]
        });
      }

      function startMatch(cpu) {
        vsCpu = cpu;
        tally = { 1: 0, 2: 0, draw: 0 };
        firstTurn = 1;
        showTally();
        startRound();
      }

      function startRound() {
        round++;
        G = newGame();
        anim = null;
        parts = [];
        rings = [];
        winCells = null;
        pendingHint = '';
        col = 3;
        turn = firstTurn;
        firstTurn = 3 - firstTurn;
        state = 'play';
        nextTurn();
      }

      function turnText() {
        const p = turn;
        let s = vsCpu ? 'Your turn: drop a coral disc.'
          : nameOf(p) + ' (' + (p === 1 ? 'coral' : 'cyan') + ') to drop.';
        if (G.bombs[p]) s += ' Press B to arm your bomb.';
        if (pendingHint) {
          s = pendingHint + ' ' + s;
          pendingHint = '';
        }
        return s;
      }

      function nextTurn() {
        armed = false;
        cpuPreview = null;
        if (state !== 'play') return;
        if (!isCpu(turn)) {
          busy = false;
          api.setStatus(turnText());
          return;
        }
        busy = true;
        api.setStatus('Computer is thinking…');
        const token = round;
        api.after(U.randInt(320, 520), () => {
          if (token !== round || state !== 'play') return;
          const m = cpuMove(G, 2, DEPTH[level], level === 'easy' ? 12 : 0);
          col = m.c;
          cpuPreview = { bomb: m.bomb };
          if (m.bomb) {
            api.sfx('power');
            api.setStatus('The computer armed its bomb!');
          }
          api.after(m.bomb ? 650 : 240, () => {
            if (token === round && state === 'play') drop(m.c, m.bomb);
          });
        });
      }

      function canAct() {
        return state === 'play' && !busy && !anim && !isCpu(turn) && !api.menuOpen;
      }

      function drop(c, bomb) {
        if (G.h[c] >= ROWS) return false;
        if (bomb) G.bombs[turn]--;
        armed = false;
        cpuPreview = null;
        busy = true;
        anim = { kind: 'drop', c, r: ROWS - 1 - G.h[c], p: turn, bomb, y: GHOST_Y, vy: 0, bounced: false };
        return true;
      }

      function humanDrop(c) {
        if (!canAct()) return;
        col = c;
        if (G.h[c] >= ROWS) {
          api.sfx('hit');
          api.setStatus('Column ' + (c + 1) + ' is full. Pick another.');
          return;
        }
        drop(c, armed);
      }

      function toggleBomb() {
        if (!canAct()) return;
        if (!G.bombs[turn]) {
          api.sfx('hit');
          api.setStatus('That bomb is already used this round.');
          return;
        }
        armed = !armed;
        api.sfx(armed ? 'power' : 'blip');
        api.setStatus(armed
          ? 'Bomb armed: it blasts the discs left, right and below where it lands. B to cancel.'
          : turnText());
      }

      function burst(x, y, color, n, speed) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = U.rand(speed * 0.3, speed);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120, life: U.rand(0.5, 1), max: 1,
            color, size: U.rand(3, 7) });
        }
      }

      function explode(a) {
        const pre = G.grid.slice();
        const res = applyBomb(G, a.c);
        api.sfx('boom');
        shake = 0.45;
        rings.push({ x: cellX(a.c), y: cellY(a.r), t: 0 });
        burst(cellX(a.c), cellY(a.r), C.gold, 26, 420);
        res.hit.forEach((i) => burst(cellX(i % COLS), cellY(Math.floor(i / COLS)), colorOf(pre[i]), 14, 300));
        if (!bombedOnce) {
          bombedOnce = true;
          pendingHint = 'Boom: discs above the blast fall down.';
        }
        const fallers = res.falls.map((f) => ({ c: f.c, to: f.to, p: f.p, y: cellY(f.from), vy: 0, done: false }));
        anim = {
          kind: 'collapse', p: a.p, wait: fallers.length ? 0.2 : 0.4, fallers,
          hidden: new Set(res.falls.map((f) => f.to * COLS + f.c))
        };
      }

      function settle(p, wasBomb) {
        anim = null;
        const o = 3 - p;
        const mine = findFour(G.grid, p);
        const theirs = wasBomb ? findFour(G.grid, o) : null;
        if (mine) return finish(p, mine, theirs ? 'The blast gave both players four, so the bomber wins. ' : '');
        if (theirs) return finish(o, theirs, 'The blast handed the other player four. ');
        if (isFull(G)) return finish(0, null, 'The grid is full. ');
        turn = o;
        nextTurn();
      }

      function finish(winner, cells, note) {
        state = 'over';
        busy = true;
        winCells = cells;
        if (winner) tally[winner]++;
        else tally.draw++;
        showTally();
        api.sfx(!winner ? 'hit' : isCpu(winner) ? 'lose' : 'win');
        if (cells) cells.forEach((i) => burst(cellX(i % COLS), cellY(Math.floor(i / COLS)), C.gold, 8, 200));
        let title = 'Draw';
        if (winner) title = vsCpu ? (winner === 1 ? 'You win!' : 'Computer wins') : nameOf(winner) + ' wins!';
        api.setStatus(winner ? title : 'Draw: the grid is full.');
        const token = round;
        api.after(1500, () => {
          if (token !== round) return;
          api.menu({
            title,
            text: (note || '') + 'Score ' + tally[1] + ' – ' + tally[2] +
              (tally.draw ? ' (' + tally.draw + ' draw' + (tally.draw === 1 ? '' : 's') + ')' : '') + '. ' +
              nameOf(firstTurn) + (vsCpu && firstTurn === 1 ? ' start' : ' starts') + ' the next round.',
            buttons: [
              { label: 'Play again', primary: true, onClick: startRound },
              { label: 'Change mode', onClick: showModeMenu }
            ]
          });
        });
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        parts.forEach((q) => {
          q.life -= dt;
          q.vy += 900 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
        });
        parts = parts.filter((q) => q.life > 0);
        rings.forEach((r) => { r.t += dt / 0.5; });
        rings = rings.filter((r) => r.t < 1);
        const a = anim;
        if (!a) return;
        if (a.kind === 'drop') {
          a.vy += GRAVITY * dt;
          a.y += a.vy * dt;
          const ty = cellY(a.r);
          if (a.y >= ty) {
            a.y = ty;
            if (!a.bounced && a.vy > 400) {
              a.bounced = true;
              a.vy = -a.vy * 0.24;
              api.sfx('tick');
            } else if (a.bomb) {
              anim = { kind: 'fuse', c: a.c, r: a.r, p: a.p, t: 0 };
              api.sfx('tick');
            } else {
              G.grid[a.r * COLS + a.c] = a.p;
              G.h[a.c]++;
              settle(a.p, false);
            }
          }
        } else if (a.kind === 'fuse') {
          a.t += dt;
          if (a.t >= 0.45) explode(a);
        } else if (a.kind === 'collapse') {
          a.wait -= dt;
          if (a.wait > 0) return;
          let all = true;
          a.fallers.forEach((f) => {
            if (f.done) return;
            f.vy += GRAVITY * dt;
            f.y += f.vy * dt;
            if (f.y >= cellY(f.to)) {
              f.y = cellY(f.to);
              f.done = true;
              a.hidden.delete(f.to * COLS + f.c);
            } else all = false;
          });
          if (all) {
            if (a.fallers.length) api.sfx('tick');
            settle(a.p, true);
          }
        }
      }

      function drawPanel(p) {
        const x = panelX(p);
        const active = state === 'play' && turn === p;
        ctx.fillStyle = active ? C.panel2 : C.panel;
        U.roundRect(ctx, x, BY - 8, PANEL_W, 296, 16);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = U.alpha(colorOf(p), 0.6 + 0.4 * Math.sin(clock * 4));
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        const mx = x + PANEL_W / 2;
        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = active ? C.text : C.muted;
        ctx.fillText(nameOf(p), mx, BY + 20);
        drawDisc(ctx, mx, BY + 78, 28, p, false, clock);
        ctx.fillStyle = C.muted;
        ctx.fillText('Wins ' + tally[p], mx, BY + 134);

        const b = bombBtn(p);
        const has = G.bombs[p] > 0;
        const on = has && active && (armed || (cpuPreview && cpuPreview.bomb));
        U.roundRect(ctx, b.x, b.y, b.w, b.h, 12);
        ctx.fillStyle = on ? U.alpha(C.gold, 0.85 + 0.15 * Math.sin(clock * 10)) : has ? C.ink : C.panel;
        ctx.fill();
        ctx.strokeStyle = has ? C.gold : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = on ? C.ink : has ? C.gold : C.line;
        ctx.fillText(on ? 'Armed!' : has ? 'Bomb' : 'Used', b.x + b.w / 2 + 12, b.y + b.h / 2 + 1);
        ctx.globalAlpha = has ? 1 : 0.35;
        drawDisc(ctx, b.x + 20, b.y + b.h / 2 + 4, 10, p, true, clock);
        ctx.globalAlpha = 1;
        ctx.font = FONT_SMALL;
        ctx.fillStyle = C.muted;
        if (has) {
          ctx.fillText('Blasts left,', mx, b.y + b.h + 20);
          ctx.fillText('right, below', mx, b.y + b.h + 38);
        } else {
          ctx.fillText('One per round', mx, b.y + b.h + 20);
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawPanel(1);
        drawPanel(2);

        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-1, 1) * shake * 18, U.rand(-1, 1) * shake * 18);

        const a = anim;
        const hidden = a && a.kind === 'collapse' ? a.hidden : null;
        for (let i = 0; i < ROWS * COLS; i++) {
          const p = G.grid[i];
          if (p && !(hidden && hidden.has(i))) drawDisc(ctx, cellX(i % COLS), cellY(Math.floor(i / COLS)), R_DISC, p, false, clock);
        }
        if (a && a.kind === 'drop') drawDisc(ctx, cellX(a.c), a.y, R_DISC, a.p, a.bomb, clock);
        if (a && a.kind === 'fuse') {
          const s = 1 + a.t * 0.35 + Math.sin(a.t * 60) * 0.04;
          drawDisc(ctx, cellX(a.c), cellY(a.r), R_DISC * s, a.p, true, clock);
        }
        if (a && a.kind === 'collapse') a.fallers.forEach((f) => drawDisc(ctx, cellX(f.c), f.y, R_DISC, f.p, false, clock));

        drawFace(ctx, BX, BY, CELL, R_HOLE, 12);

        // Column guide, ghost disc, landing spot and blast preview.
        const showGhost = state === 'play' && !anim && (canAct() || cpuPreview);
        if (showGhost && G.h[col] < ROWS) {
          const bomb = cpuPreview ? cpuPreview.bomb : armed;
          const r = ROWS - 1 - G.h[col];
          ctx.fillStyle = U.alpha(colorOf(turn), 0.07);
          ctx.fillRect(BX + col * CELL + 4, BY - 4, CELL - 8, CELL * ROWS + 8);
          ctx.globalAlpha = 0.85;
          drawDisc(ctx, cellX(col), GHOST_Y + Math.sin(clock * 5) * 3, R_DISC, turn, bomb, clock);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = U.alpha(bomb ? C.gold : colorOf(turn), 0.75);
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 5]);
          ctx.beginPath();
          ctx.arc(cellX(col), cellY(r), R_DISC - 2, 0, Math.PI * 2);
          ctx.stroke();
          if (bomb) {
            ctx.strokeStyle = U.alpha(C.gold, 0.6 + 0.4 * Math.sin(clock * 8));
            for (const [dr, dc] of BLAST) {
              const rr = r + dr;
              const cc = col + dc;
              if (rr >= ROWS || cc < 0 || cc >= COLS) continue;
              const filled = G.grid[rr * COLS + cc];
              ctx.lineWidth = filled ? 4 : 2;
              ctx.beginPath();
              ctx.arc(cellX(cc), cellY(rr), R_HOLE + 3, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
          ctx.setLineDash([]);
        } else if (showGhost) {
          ctx.fillStyle = U.alpha(C.muted, 0.08);
          ctx.fillRect(BX + col * CELL + 4, BY - 4, CELL - 8, CELL * ROWS + 8);
        }

        if (winCells) {
          const pulse = 0.6 + 0.4 * Math.sin(clock * 8);
          ctx.strokeStyle = U.alpha(C.text, pulse);
          ctx.lineWidth = 4;
          winCells.forEach((i) => {
            ctx.beginPath();
            ctx.arc(cellX(i % COLS), cellY(Math.floor(i / COLS)), R_DISC + 2, 0, Math.PI * 2);
            ctx.stroke();
          });
          const f = winCells[0];
          const l = winCells[3];
          ctx.strokeStyle = U.alpha(C.gold, 0.9);
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cellX(f % COLS), cellY(Math.floor(f / COLS)));
          ctx.lineTo(cellX(l % COLS), cellY(Math.floor(l / COLS)));
          ctx.stroke();
        }

        rings.forEach((r) => {
          ctx.globalAlpha = 1 - r.t;
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 6 * (1 - r.t) + 1;
          ctx.beginPath();
          ctx.arc(r.x, r.y, CELL * (0.4 + r.t * 1.8), 0, Math.PI * 2);
          ctx.stroke();
        });
        parts.forEach((q) => {
          ctx.globalAlpha = U.clamp(q.life / q.max, 0, 1);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        });
        ctx.globalAlpha = 1;
        ctx.restore();

        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let c = 0; c < COLS; c++) {
          ctx.fillStyle = c === col && showGhost ? colorOf(turn) : C.muted;
          ctx.fillText(String(c + 1), cellX(c), BY + CELL * ROWS + 30);
        }
        if (state === 'play') {
          ctx.fillStyle = colorOf(turn);
          const who = isCpu(turn) ? 'Computer is thinking' : vsCpu ? 'Your turn' : nameOf(turn) + ' to drop';
          ctx.fillText(who, W / 2, 28);
        }
      }

      function inBoardX(x) {
        return x >= BX && x < BX + CELL * COLS;
      }

      function onBombBtn(pt, p) {
        const b = bombBtn(p);
        return pt.x >= b.x && pt.x <= b.x + b.w && pt.y >= b.y && pt.y <= b.y + b.h;
      }

      api.on(canvas, 'pointermove', (e) => {
        const pt = api.toCanvas(e, canvas);
        if (canAct() && inBoardX(pt.x)) col = Math.floor((pt.x - BX) / CELL);
      });
      api.on(canvas, 'pointerdown', (e) => {
        const pt = api.toCanvas(e, canvas);
        if (!canAct()) return;
        if (onBombBtn(pt, turn)) {
          toggleBomb();
          return;
        }
        if (inBoardX(pt.x) && pt.y >= 40 && pt.y < BY + CELL * ROWS + 12) humanDrop(Math.floor((pt.x - BX) / CELL));
      });
      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(window, 'keydown', (e) => {
        if (!canAct()) return;
        const num = /^(?:Digit|Numpad)([1-7])$/.exec(e.code);
        if (num) {
          humanDrop(Number(num[1]) - 1);
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          col = Math.max(0, col - 1);
          api.sfx('tick');
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          col = Math.min(COLS - 1, col + 1);
          api.sfx('tick');
        } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'ArrowDown' || e.code === 'KeyS' ||
          e.code === 'NumpadEnter') {
          humanDrop(col);
        } else if (e.code === 'KeyB') {
          toggleBomb();
        }
      });

      showTally();
      showModeMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
