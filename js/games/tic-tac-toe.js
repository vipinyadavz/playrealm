/* Tic-Tac-Toe — each player keeps only three marks; a fourth erases the oldest. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 600;
  const H = 600;
  const CELL = 136;
  const BX = (W - CELL * 3) / 2;
  const BY = 118;
  const KEEP = 3;        // marks each player may have on the board
  const MOVE_CAP = 30;   // the board never fills, so a round with no line ends here
  const WIN = 1000;
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SMALL = '600 12px "JetBrains Mono", monospace';
  const MARK = [null, 'X', 'O'];
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const LINES_AT = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => LINES.filter((L) => L.indexOf(i) >= 0));
  const ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7];
  const NUMPAD = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };
  const ARROWS = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0]
  };

  /* ---------- Rules: board + per-player queue of marks, oldest first ---------- */

  function newBoard() {
    return { cells: [0, 0, 0, 0, 0, 0, 0, 0, 0], q: [null, [], []] };
  }

  function copyBoard(s) {
    return { cells: s.cells.slice(), q: [null, s.q[1].slice(), s.q[2].slice()] };
  }

  /* The cell whose mark disappears when p places next, or -1. */
  function leaving(s, p) {
    return s.q[p].length >= KEEP ? s.q[p][0] : -1;
  }

  /* Legal cells are the empty ones; the leaving mark still occupies its cell, so it can't be reused this move. */
  function place(s, p, cell) {
    let gone = -1;
    if (s.q[p].length >= KEEP) {
      gone = s.q[p].shift();
      s.cells[gone] = 0;
    }
    s.cells[cell] = p;
    s.q[p].push(cell);
    return gone;
  }

  function unplace(s, p, cell, gone) {
    s.q[p].pop();
    s.cells[cell] = 0;
    if (gone >= 0) {
      s.q[p].unshift(gone);
      s.cells[gone] = p;
    }
  }

  function lineThrough(s, p, cell) {
    for (const L of LINES_AT[cell]) {
      if (s.cells[L[0]] === p && s.cells[L[1]] === p && s.cells[L[2]] === p) return L;
    }
    return null;
  }

  function freeCells(s) {
    return ORDER.filter((c) => !s.cells[c]);
  }

  function winsNow(s, p) {
    return freeCells(s).filter((c) => {
      const g = place(s, p, c);
      const won = !!lineThrough(s, p, c);
      unplace(s, p, c, g);
      return won;
    });
  }

  /* ---------- Computer player ---------- */

  function evaluate(s, p) {
    const o = 3 - p;
    const lp = leaving(s, p);
    const lo = leaving(s, o);
    let v = 0;
    for (const L of LINES) {
      let mine = 0, theirs = 0, openP = 0, openO = 0;
      for (const c of L) {
        const x = s.cells[c];
        if (x === 0) { openP++; openO++; }
        else if (x === p) { if (c === lp) openO++; else mine++; } // p's leaving cell opens up for o
        else if (c !== lo) theirs++;
      }
      if (mine === 2 && openP === 1) v += 40;
      else if (mine === 1 && openP === 2) v += 3;
      if (theirs === 2 && openO === 1) v -= 30;
      else if (theirs === 1 && openO === 2) v -= 3;
    }
    if (s.cells[4] === p && lp !== 4) v += 4;
    else if (s.cells[4] === o && lo !== 4) v -= 4;
    return v;
  }

  function ordered(s, p) {
    const o = 3 - p;
    const lp = leaving(s, p);
    const lo = leaving(s, o);
    const list = [];
    for (const c of ORDER) {
      if (s.cells[c]) continue;
      let k = 0;
      for (const L of LINES_AT[c]) {
        let mine = 0, theirs = 0;
        for (const d of L) {
          if (d === c) continue;
          if (s.cells[d] === p && d !== lp) mine++;
          else if (s.cells[d] === o && d !== lo) theirs++;
        }
        if (mine === 2) k += 100;
        if (theirs === 2) k += 50;
      }
      list.push({ c, k });
    }
    list.sort((a, b) => b.k - a.k);
    return list.map((x) => x.c);
  }

  /* Negamax with alpha-beta and a memo keyed on both mark queues (so mark ages count). */
  function searchMove(board, p, depth, movesLeft) {
    const s = copyBoard(board);
    const tt = new Map();
    const code = (q) => q.reduce((k, c) => k * 10 + c + 1, 0);

    function nm(side, d, ply, alpha, beta) {
      if (ply >= movesLeft) return 0;
      if (d === 0) return evaluate(s, side);
      const key = ((code(s.q[1]) * 1000 + code(s.q[2])) * 2 + side - 1) * 16 + d;
      const hit = tt.get(key);
      if (hit) {
        if (hit.f === 0) return hit.v;
        if (hit.f === 1 && hit.v > alpha) alpha = hit.v;
        else if (hit.f === 2 && hit.v < beta) beta = hit.v;
        if (alpha >= beta) return hit.v;
      }
      const a0 = alpha;
      let best = -Infinity;
      for (const c of ordered(s, side)) {
        const g = place(s, side, c);
        const v = lineThrough(s, side, c) ? WIN + d : -nm(3 - side, d - 1, ply + 1, -beta, -alpha);
        unplace(s, side, c, g);
        if (v > best) best = v;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      tt.set(key, { v: best, f: best <= a0 ? 2 : best >= beta ? 1 : 0 });
      return best;
    }

    const scored = ordered(s, p).map((c) => {
      const g = place(s, p, c);
      const v = lineThrough(s, p, c) ? WIN + depth : -nm(3 - p, depth - 1, 1, -Infinity, Infinity);
      unplace(s, p, c, g);
      return { c, v };
    });
    const top = Math.max(...scored.map((x) => x.v));
    return U.pick(scored.filter((x) => x.v === top)).c;
  }

  function easyMove(board, p) {
    const s = copyBoard(board);
    const wins = winsNow(s, p);
    if (wins.length && Math.random() < 0.5) return U.pick(wins);
    const free = freeCells(s);
    if (Math.random() < 0.35) {
      // Occasionally block: pick a cell after which the rival has no instant win.
      const safe = free.filter((c) => {
        const g = place(s, p, c);
        const ok = winsNow(s, 3 - p).length === 0;
        unplace(s, p, c, g);
        return ok;
      });
      if (safe.length) return U.pick(safe);
    }
    return U.pick(free);
  }

  /* ---------- Drawing helpers (shared with the card art) ---------- */

  function drawMark(ctx, p, x, y, r, prog, lw) {
    ctx.strokeStyle = p === 1 ? C.p1 : C.p2;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    if (p === 1) {
      const a = U.clamp(prog * 2, 0, 1);
      const b = U.clamp(prog * 2 - 1, 0, 1);
      ctx.beginPath();
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x - r + 2 * r * a, y - r + 2 * r * a);
      ctx.stroke();
      if (b > 0) {
        ctx.beginPath();
        ctx.moveTo(x + r, y - r);
        ctx.lineTo(x + r - 2 * r * b, y - r + 2 * r * b);
        ctx.stroke();
      }
    } else if (prog > 0) {
      ctx.beginPath();
      ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * U.clamp(prog, 0, 1));
      ctx.stroke();
    }
  }

  function drawCrack(ctx, x, y, r, lw) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 1.1, y - r * 0.35);
    ctx.lineTo(x - r * 0.35, y + r * 0.05);
    ctx.lineTo(x + r * 0.05, y - r * 0.3);
    ctx.lineTo(x + r * 0.5, y + r * 0.2);
    ctx.lineTo(x + r * 1.1, y - r * 0.05);
    ctx.moveTo(x + r * 0.05, y - r * 0.3);
    ctx.lineTo(x + r * 0.2, y - r * 0.85);
    ctx.stroke();
  }

  function drawBadge(ctx, p, x, y, rad, font) {
    ctx.fillStyle = p === 1 ? C.p1 : C.p2;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('1', x, y + 1);
  }

  Arcade.register({
    id: 'tic-tac-toe',
    title: 'Tic-Tac-Toe',
    mode: 'together',
    players: '1–2P',
    color: C.p1,
    tagline: 'Three in a row wins, on a board that never fills up.',
    hook: 'You only get three marks: placing a fourth erases your oldest.',
    tags: ['classic', 'board', 'strategy', 'turn-based', 'two player', 'vs computer'],
    howTo: 'Line up three of your marks to win. Each player keeps at most three marks on the board: ' +
      'when you place a fourth, your oldest one (shown faded and cracked, with a 1) is erased first, ' +
      'and the new mark cannot go into the cell it just left. The board never fills, so a round with ' +
      'no line after 30 moves is a draw. The starting player alternates each round.',
    controls: [
      { keys: ['Click'], label: 'Place a mark' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor' },
      { keys: ['Enter', 'Space'], label: 'Place at the cursor' },
      { keys: ['1–9'], label: 'Place by number pad layout (7 is top left)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.line, 0.5);
      for (let x = 10; x < w; x += 20) {
        for (let y = 10; y < h; y += 20) ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      const cell = Math.min(w, h) * 0.26;
      const x0 = (w - cell * 3) / 2;
      const y0 = (h - cell * 3) / 2;
      const ctr = (i) => ({ x: x0 + (i % 3) * cell + cell / 2, y: y0 + Math.floor(i / 3) * cell + cell / 2 });
      const k = t % 4.6;
      const fadeOld = U.clamp((k - 1.8) / 0.5, 0, 1);
      const newX = U.clamp((k - 1.8) / 0.5, 0, 1);
      const lineT = U.clamp((k - 2.3) / 0.4, 0, 1);
      const reset = U.clamp((k - 4.0) / 0.6, 0, 1);

      // Side pips: three marks per player, oldest one faded.
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i === 0 ? 0.35 : 1;
        ctx.fillStyle = C.p1;
        ctx.beginPath();
        ctx.arc(x0 / 2, h / 2 - 26 + i * 26, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.p2;
        ctx.beginPath();
        ctx.arc(w - x0 / 2, h / 2 - 26 + i * 26, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.fillStyle = C.panel;
      U.roundRect(ctx, x0 - 8, y0 - 8, cell * 3 + 16, cell * 3 + 16, 12);
      ctx.fill();
      // The next move: X lands on the left edge and completes the middle row.
      const hc = ctr(3);
      ctx.fillStyle = U.alpha(C.p1, 0.12 + 0.06 * Math.sin(t * 5) * (1 - newX));
      U.roundRect(ctx, hc.x - cell / 2 + 4, hc.y - cell / 2 + 4, cell - 8, cell - 8, 8);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x0 + i * cell, y0 + 4);
        ctx.lineTo(x0 + i * cell, y0 + cell * 3 - 4);
        ctx.moveTo(x0 + 4, y0 + i * cell);
        ctx.lineTo(x0 + cell * 3 - 4, y0 + i * cell);
        ctx.stroke();
      }
      const r = cell * 0.27;
      const show = 1 - reset;
      ctx.globalAlpha = show;
      [4, 5].forEach((i) => drawMark(ctx, 1, ctr(i).x, ctr(i).y, r, 1, 6));
      [1, 6, 8].forEach((i) => drawMark(ctx, 2, ctr(i).x, ctr(i).y, r, 1, 6));
      const oc = ctr(0);
      const oldA = reset > 0 ? reset : 1 - fadeOld;
      ctx.globalAlpha = 0.38 * oldA;
      drawMark(ctx, 1, oc.x, oc.y + fadeOld * 8, r, 1, 6);
      ctx.globalAlpha = oldA;
      drawCrack(ctx, oc.x, oc.y + fadeOld * 8, r, 2);
      drawBadge(ctx, 1, oc.x + cell * 0.32, oc.y - cell * 0.32, 7, '600 10px "JetBrains Mono", monospace');
      ctx.globalAlpha = show;
      if (newX > 0) drawMark(ctx, 1, hc.x, hc.y, r, newX, 6);
      if (lineT > 0) {
        const a = ctr(3);
        const b = ctr(5);
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(a.x - cell * 0.35, a.y);
        ctx.lineTo(U.lerp(a.x - cell * 0.35, b.x + cell * 0.35, lineT), b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let S = newBoard();
      let state = 'menu';       // 'menu' | 'play' | 'over'
      let vsCpu = false;
      let level = 'normal';
      let turn = 1;
      let firstTurn = 1;
      let moves = 0;
      let busy = false;
      let round = 0;
      let tally = { 1: 0, 2: 0, draw: 0 };
      let sel = -1;
      let keyMode = false;
      let grow = [1, 1, 1, 1, 1, 1, 1, 1, 1];
      let ghosts = [];
      let bits = [];
      let winLine = null;
      let shake = { cell: -1, t: 0 };
      let clock = 0;
      let erasedOnce = false;
      let pendingHint = '';

      const isCpu = (p) => vsCpu && p === 2;
      const nameOf = (p) => (vsCpu ? (p === 1 ? 'You' : 'Computer') : 'Player ' + p);
      const center = (i) => ({ x: BX + (i % 3) * CELL + CELL / 2, y: BY + Math.floor(i / 3) * CELL + CELL / 2 });

      function showTally() {
        api.setScore(tally[1] + ' – ' + tally.draw + ' – ' + tally[2]);
      }

      function showModeMenu() {
        state = 'menu';
        api.setStatus('Three marks each. Your fourth mark erases your oldest.');
        api.menu({
          title: 'Tic-Tac-Toe',
          text: 'You only keep three marks: placing a fourth erases your oldest, so the board never fills. ' +
            'Click a cell, or use the arrows and Enter, or keys 1–9.',
          buttons: [
            { label: '2 players', onClick: () => startMatch(false) },
            { label: 'vs computer', primary: true, onClick: showLevelMenu }
          ]
        });
      }

      function showLevelMenu() {
        api.menu({
          title: 'Pick a difficulty',
          text: 'You play X (coral). The computer plays O and knows which marks are about to vanish.',
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
        S = newBoard();
        grow = [1, 1, 1, 1, 1, 1, 1, 1, 1];
        ghosts = [];
        bits = [];
        winLine = null;
        pendingHint = '';
        moves = 0;
        turn = firstTurn;
        firstTurn = 3 - firstTurn;
        state = 'play';
        busy = false;
        nextTurn();
      }

      function turnText() {
        const p = turn;
        const fading = leaving(S, p) >= 0;
        if (pendingHint) {
          const lead = pendingHint;
          pendingHint = '';
          return lead + (vsCpu ? ' Your turn (X).' : ' ' + MARK[p] + ' to move.');
        }
        if (vsCpu) {
          return 'Your turn (X).' + (fading ? ' Your faded X vanishes as soon as you place.' : ' You keep three marks at most.');
        }
        return MARK[p] + ' to move (' + nameOf(p) + ').' +
          (fading ? ' The faded ' + MARK[p] + ' vanishes when ' + MARK[p] + ' places.' : '');
      }

      function nextTurn() {
        if (state !== 'play') return;
        if (!isCpu(turn)) {
          busy = false;
          api.setStatus(turnText());
          return;
        }
        busy = true;
        api.setStatus('Computer is thinking…');
        const token = round;
        api.after(U.randInt(380, 620), () => {
          if (token !== round || state !== 'play') return;
          const left = MOVE_CAP - moves;
          const cell = level === 'easy' ? easyMove(S, 2)
            : searchMove(S, 2, level === 'hard' ? 8 : 4, left);
          play(cell);
        });
      }

      function burst(i, color, n, speed) {
        const c = center(i);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = U.rand(speed * 0.4, speed);
          bits.push({ x: c.x + U.rand(-20, 20), y: c.y + U.rand(-20, 20), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60,
            life: U.rand(0.4, 0.8), max: 0.8, color, size: U.rand(3, 6) });
        }
      }

      function play(cell) {
        const p = turn;
        const gone = place(S, p, cell);
        moves++;
        grow[cell] = 0;
        api.sfx('flip');
        if (gone >= 0) {
          ghosts.push({ cell: gone, p, t: 0 });
          burst(gone, p === 1 ? C.p1 : C.p2, 10, 160);
          api.sfx('hit');
          if (!erasedOnce) {
            erasedOnce = true;
            pendingHint = 'The oldest ' + MARK[p] + ' was erased: three marks max.';
          }
        }
        busy = true;
        const token = round;
        const line = lineThrough(S, p, cell);
        if (line) {
          state = 'over';
          winLine = { line, p, t: 0 };
          api.after(320, () => {
            if (token !== round) return;
            line.forEach((i) => burst(i, C.gold, 10, 220));
            api.sfx(isCpu(p) ? 'lose' : 'win');
          });
          api.after(1500, () => { if (token === round) endRound(p); });
          return;
        }
        if (moves >= MOVE_CAP) {
          state = 'over';
          api.after(600, () => { if (token === round) endRound(0); });
          return;
        }
        turn = 3 - p;
        api.after(gone >= 0 && !isCpu(turn) ? 520 : 300, () => { if (token === round) nextTurn(); });
      }

      function endRound(winner) {
        if (winner) tally[winner]++;
        else tally.draw++;
        showTally();
        let title;
        if (!winner) title = 'Draw';
        else if (vsCpu) title = winner === 1 ? 'You win!' : 'Computer wins';
        else title = MARK[winner] + ' wins!';
        if (!winner) api.sfx('hit');
        const summary = 'X ' + tally[1] + ' · draws ' + tally.draw + ' · O ' + tally[2] + '. ' +
          MARK[firstTurn] + ' starts the next round.';
        api.setStatus(winner ? title : 'Draw: 30 moves and no line.');
        api.menu({
          title,
          text: (winner ? '' : 'No line after 30 moves. ') + summary,
          buttons: [
            { label: 'Play again', primary: true, onClick: startRound },
            { label: 'Change mode', onClick: showModeMenu }
          ]
        });
      }

      function canAct() {
        return state === 'play' && !busy && !isCpu(turn) && !api.menuOpen;
      }

      function tryPlace(cell) {
        if (!canAct() || cell < 0) return;
        if (cell === leaving(S, turn)) {
          shake = { cell, t: 0.35 };
          api.sfx('hit');
          api.setStatus('That mark leaves on this move, so its cell is blocked until next turn.');
          return;
        }
        if (S.cells[cell]) {
          shake = { cell, t: 0.25 };
          api.sfx('tick');
          return;
        }
        play(cell);
      }

      function cellAt(x, y) {
        const c = Math.floor((x - BX) / CELL);
        const r = Math.floor((y - BY) / CELL);
        return c >= 0 && c < 3 && r >= 0 && r < 3 ? r * 3 + c : -1;
      }

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        sel = cellAt(p.x, p.y);
        keyMode = false;
      });
      api.on(canvas, 'pointerleave', () => { if (!keyMode) sel = -1; });
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        sel = cellAt(p.x, p.y);
        keyMode = false;
        tryPlace(sel);
      });
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || api.menuOpen) return;
        const num = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
        if (num) {
          keyMode = true;
          sel = NUMPAD[num[1]];
          tryPlace(sel);
          return;
        }
        const d = ARROWS[e.code];
        if (d) {
          keyMode = true;
          if (sel < 0) sel = 4;
          else sel = U.clamp(Math.floor(sel / 3) + d[1], 0, 2) * 3 + U.clamp((sel % 3) + d[0], 0, 2);
          return;
        }
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
          keyMode = true;
          if (sel < 0) sel = 4;
          else tryPlace(sel);
        }
      });

      function update(dt) {
        clock += dt;
        for (let i = 0; i < 9; i++) grow[i] = Math.min(1, grow[i] + dt / 0.28);
        ghosts.forEach((g) => { g.t += dt / 0.45; });
        ghosts = ghosts.filter((g) => g.t < 1);
        bits.forEach((b) => {
          b.life -= dt;
          b.vy += 420 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        });
        bits = bits.filter((b) => b.life > 0);
        if (winLine) winLine.t = Math.min(1, winLine.t + dt / 0.45);
        shake.t = Math.max(0, shake.t - dt);
      }

      function drawSide(p) {
        const bw = 204;
        const bh = 66;
        const bx = p === 1 ? 22 : W - 22 - bw;
        const by = 22;
        const active = state === 'play' && turn === p;
        const col = p === 1 ? C.p1 : C.p2;
        ctx.fillStyle = active ? C.panel2 : C.panel;
        U.roundRect(ctx, bx, by, bw, bh, 14);
        ctx.fill();
        if (active) {
          ctx.strokeStyle = U.alpha(col, 0.7 + 0.3 * Math.sin(clock * 4));
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        drawMark(ctx, p, bx + 32, by + bh / 2, 12, 1, 5);
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = active ? C.text : C.muted;
        ctx.fillText(nameOf(p), bx + 60, by + 22);
        const n = S.q[p].length;
        for (let i = 0; i < KEEP; i++) {
          const px = bx + 66 + i * 22;
          const py = by + 46;
          ctx.beginPath();
          ctx.arc(px, py, 7, 0, Math.PI * 2);
          if (i < n) {
            ctx.fillStyle = col;
            ctx.globalAlpha = n === KEEP && i === 0 ? 0.35 : 1;
            ctx.fill();
            ctx.globalAlpha = 1;
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        ctx.fillStyle = C.muted;
        ctx.font = FONT_SMALL;
        ctx.fillText(n === KEEP ? 'full' : n + '/3', bx + 66 + KEEP * 22 + 2, by + 47);
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawSide(1);
        drawSide(2);

        // Move counter toward the draw cap.
        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = MOVE_CAP - moves <= 6 && state === 'play' ? C.gold : C.muted;
        ctx.fillText('Move ' + (state === 'play' ? Math.min(moves + 1, MOVE_CAP) : moves) + '/' + MOVE_CAP, W / 2, 44);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, W / 2 - 54, 62, 108, 6, 3);
        ctx.fill();
        ctx.fillStyle = C.gold;
        U.roundRect(ctx, W / 2 - 54, 62, 108 * (moves / MOVE_CAP), 6, 3);
        ctx.fill();

        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX - 14, BY - 14, CELL * 3 + 28, CELL * 3 + 28, 22);
        ctx.fill();

        const human = canAct();
        const out = state === 'play' ? leaving(S, turn) : -1;
        if (human && sel >= 0) {
          const col = turn === 1 ? C.p1 : C.p2;
          const sx = BX + (sel % 3) * CELL;
          const sy = BY + Math.floor(sel / 3) * CELL;
          const blocked = S.cells[sel] !== 0;
          ctx.fillStyle = U.alpha(blocked ? C.muted : col, blocked ? 0.08 : 0.14);
          U.roundRect(ctx, sx + 8, sy + 8, CELL - 16, CELL - 16, 16);
          ctx.fill();
          if (keyMode) {
            ctx.strokeStyle = col;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          if (!blocked) {
            ctx.globalAlpha = 0.25;
            drawMark(ctx, turn, sx + CELL / 2, sy + CELL / 2, CELL * 0.28, 1, 14);
            ctx.globalAlpha = 1;
          }
        }

        ctx.strokeStyle = C.line;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(BX + i * CELL, BY + 10);
          ctx.lineTo(BX + i * CELL, BY + CELL * 3 - 10);
          ctx.moveTo(BX + 10, BY + i * CELL);
          ctx.lineTo(BX + CELL * 3 - 10, BY + i * CELL);
          ctx.stroke();
        }

        if (winLine) {
          winLine.line.forEach((i) => {
            const c = center(i);
            ctx.fillStyle = U.alpha(C.gold, 0.16 + 0.08 * Math.sin(clock * 8));
            ctx.beginPath();
            ctx.arc(c.x, c.y, CELL * 0.42, 0, Math.PI * 2);
            ctx.fill();
          });
        }

        for (let p = 1; p <= 2; p++) {
          const old = leaving(S, p);
          for (const cell of S.q[p]) {
            const c = center(cell);
            const dx = shake.cell === cell ? Math.sin(shake.t * 70) * shake.t * 24 : 0;
            const fading = cell === old && state !== 'over';
            if (fading) {
              const urgent = state === 'play' && turn === p;
              ctx.globalAlpha = urgent ? 0.32 + 0.14 * Math.sin(clock * 6) : 0.42;
            }
            drawMark(ctx, p, c.x + dx, c.y, CELL * 0.28, grow[cell], 14);
            ctx.globalAlpha = 1;
            if (fading) {
              drawCrack(ctx, c.x + dx, c.y, CELL * 0.28, 4);
              drawBadge(ctx, p, c.x + dx + CELL * 0.33, c.y - CELL * 0.33, 12, FONT);
              if (cell === out && human && sel === cell) {
                // A no-entry sign: this cell can't take the new mark this move.
                ctx.strokeStyle = C.text;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(c.x + dx, c.y, CELL * 0.4, 0, Math.PI * 2);
                ctx.moveTo(c.x + dx - CELL * 0.28, c.y + CELL * 0.28);
                ctx.lineTo(c.x + dx + CELL * 0.28, c.y - CELL * 0.28);
                ctx.stroke();
              }
            }
          }
        }

        ghosts.forEach((g) => {
          const c = center(g.cell);
          ctx.globalAlpha = 0.45 * (1 - g.t);
          drawMark(ctx, g.p, c.x, c.y + g.t * 26, CELL * 0.28 * (1 + g.t * 0.25), 1, 14);
          ctx.globalAlpha = 1 - g.t;
          drawCrack(ctx, c.x, c.y + g.t * 26, CELL * 0.28, 4);
          ctx.globalAlpha = 1;
        });

        bits.forEach((b) => {
          ctx.globalAlpha = U.clamp(b.life / b.max, 0, 1);
          ctx.fillStyle = b.color;
          ctx.fillRect(b.x - b.size / 2, b.y - b.size / 2, b.size, b.size);
        });
        ctx.globalAlpha = 1;

        if (winLine) {
          const a = center(winLine.line[0]);
          const b = center(winLine.line[2]);
          const ex = (b.x - a.x) * 0.175;
          const ey = (b.y - a.y) * 0.175;
          const ax = a.x - ex;
          const ay = a.y - ey;
          const e = 1 - Math.pow(1 - winLine.t, 3);
          const bx = U.lerp(ax, b.x + ex, e);
          const by = U.lerp(ay, b.y + ey, e);
          ctx.lineCap = 'round';
          ctx.strokeStyle = U.alpha(C.gold, 0.35);
          ctx.lineWidth = 22;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 9;
          ctx.stroke();
        }

        // Contextual hint under the board: the visible telegraph for the hook.
        let hint = 'Each side keeps three marks. A fourth erases the oldest.';
        if (state === 'play' && out >= 0) {
          hint = MARK[turn] + ' moves next, so the faded ' + MARK[turn] + ' (1) disappears.';
        }
        if (state === 'play' && MOVE_CAP - moves <= 6) {
          hint = (MOVE_CAP - moves) + ' move' + (MOVE_CAP - moves === 1 ? '' : 's') + ' left before a draw.';
        }
        if (state === 'over') hint = winLine ? MARK[winLine.p] + ' made three in a row.' : 'Move limit reached: draw.';
        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.muted;
        ctx.fillText(hint, W / 2, BY + CELL * 3 + 46);
      }

      showTally();
      showModeMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
