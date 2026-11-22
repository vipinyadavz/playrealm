/* Sudoku — fill the 9×9 grid so every row, column and box holds 1 to 9 once.
   Completing a row, column or box earns a hint charge. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 860;
  const H = 580;
  const CELL = 58;
  const BOARD = CELL * 9;
  const BX = 24;
  const BY = Math.round((H - BOARD) / 2);
  const PX = BX + BOARD + 24;
  const PW = W - PX - 24;
  const LEVELS = [
    { name: 'Easy', givens: 40, base: 1500 },
    { name: 'Medium', givens: 32, base: 3000 },
    { name: 'Hard', givens: 26, base: 5000 }
  ];
  const MAX_HINTS = 3;
  const HINT_BONUS = 150;
  const STRIKES = 3;
  const GEN_BUDGET = 150; // ms
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const THICK = '#6A62B8';
  const MOVES = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0]
  };

  /* ---------- Grid geometry ---------- */

  const ROW = new Uint8Array(81);
  const COL = new Uint8Array(81);
  const BOX = new Uint8Array(81);
  for (let i = 0; i < 81; i++) {
    ROW[i] = (i / 9) | 0;
    COL[i] = i % 9;
    BOX[i] = ((ROW[i] / 3) | 0) * 3 + ((COL[i] / 3) | 0);
  }
  /* Units 0–8 rows, 9–17 columns, 18–26 boxes; cells listed in reading order. */
  const UNITS = [];
  for (let u = 0; u < 27; u++) UNITS.push([]);
  for (let i = 0; i < 81; i++) {
    UNITS[ROW[i]].push(i);
    UNITS[9 + COL[i]].push(i);
    UNITS[18 + BOX[i]].push(i);
  }
  const PEERS = [];
  for (let i = 0; i < 81; i++) {
    const set = new Set();
    for (const u of [ROW[i], 9 + COL[i], 18 + BOX[i]]) for (const j of UNITS[u]) if (j !== i) set.add(j);
    PEERS.push([...set]);
  }
  const POP = new Uint8Array(1024);
  for (let m = 1; m < 1024; m++) POP[m] = POP[m >> 1] + (m & 1);
  const BITVAL = {};
  for (let d = 1; d <= 9; d++) BITVAL[1 << d] = d;

  function unitName(u) {
    if (u < 9) return 'Row ' + (u + 1);
    if (u < 18) return 'Column ' + (u - 8);
    return 'Box ' + (u - 17);
  }

  /* ---------- Solver + generator ---------- */

  /* Backtracking with fewest-candidates-first. Counts solutions up to `limit`.
     With `rnd`, tries digits in random order and writes the first solution into `cells`.
     Returns the count, or -1 if the node budget ran out (treated as "not unique"). */
  function search(cells, limit, rnd) {
    const rows = new Uint16Array(9);
    const cols = new Uint16Array(9);
    const boxes = new Uint16Array(9);
    const empties = [];
    for (let i = 0; i < 81; i++) {
      const v = cells[i];
      if (!v) {
        empties.push(i);
        continue;
      }
      const bit = 1 << v;
      if ((rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & bit) return 0;
      rows[ROW[i]] |= bit;
      cols[COL[i]] |= bit;
      boxes[BOX[i]] |= bit;
    }
    let count = 0;
    let nodes = 0;
    let blown = false;
    function rec(k) {
      if (k === empties.length) {
        count++;
        return count >= limit;
      }
      if (++nodes > 150000) {
        blown = true;
        return true;
      }
      let bj = -1;
      let bm = 0;
      let bn = 10;
      for (let j = k; j < empties.length; j++) {
        const i = empties[j];
        const m = ~(rows[ROW[i]] | cols[COL[i]] | boxes[BOX[i]]) & 0x3FE;
        const n = POP[m];
        if (n < bn) {
          bn = n;
          bj = j;
          bm = m;
          if (n <= 1) break;
        }
      }
      if (bn === 0) return false;
      const tmp = empties[k];
      empties[k] = empties[bj];
      empties[bj] = tmp;
      const i = empties[k];
      const r = ROW[i];
      const c = COL[i];
      const b = BOX[i];
      const opts = [];
      let m = bm;
      while (m) {
        const bit = m & -m;
        m ^= bit;
        opts.push(bit);
      }
      if (rnd) {
        for (let a = opts.length - 1; a > 0; a--) {
          const z = Math.floor(rnd() * (a + 1));
          const t = opts[a];
          opts[a] = opts[z];
          opts[z] = t;
        }
      }
      for (const bit of opts) {
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[b] |= bit;
        if (rnd) cells[i] = BITVAL[bit];
        if (rec(k + 1)) return true;
        rows[r] ^= bit;
        cols[c] ^= bit;
        boxes[b] ^= bit;
      }
      if (rnd) cells[i] = 0;
      return false;
    }
    rec(0);
    return blown ? -1 : count;
  }

  /* Random full grid, then remove clues in symmetric pairs while the answer stays unique.
     Stops at the target or the time budget; keeps the attempt with the fewest clues. */
  function generate(target) {
    const t0 = Date.now();
    let best = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      const sol = new Int8Array(81);
      if (search(sol, 1, Math.random) !== 1) continue;
      const puz = Int8Array.from(sol);
      const order = [];
      for (let i = 0; i <= 40; i++) order.push(i);
      U.shuffle(order);
      let givens = 81;
      for (const i of order) {
        const j = 80 - i;
        const drop = i === j ? 1 : 2;
        if (givens - drop < target) continue;
        if (Date.now() - t0 > GEN_BUDGET) break;
        const vi = puz[i];
        const vj = puz[j];
        puz[i] = 0;
        puz[j] = 0;
        if (search(Int8Array.from(puz), 2, null) === 1) givens -= drop;
        else {
          puz[i] = vi;
          puz[j] = vj;
        }
      }
      if (!best || givens < best.givens) best = { puz, sol, givens };
      if (givens <= target || Date.now() - t0 > GEN_BUDGET) break;
    }
    if (!best) {
      // Practically unreachable: a fixed valid grid with a few clues removed.
      const sol = new Int8Array(81);
      for (let i = 0; i < 81; i++) sol[i] = ((ROW[i] * 3 + ((ROW[i] / 3) | 0) + COL[i]) % 9) + 1;
      const puz = Int8Array.from(sol);
      for (const i of [0, 10, 20, 30, 40, 50, 60, 70, 80]) puz[i] = 0;
      best = { puz, sol, givens: 72 };
    }
    return best;
  }

  /* ---------- Drawing helpers ---------- */

  function drawBulb(ctx, cx, cy, r, lit, glow) {
    if (lit) {
      ctx.shadowColor = C.gold;
      ctx.shadowBlur = 8 + (glow || 0) * 14;
    }
    ctx.fillStyle = lit ? C.gold : 'transparent';
    ctx.strokeStyle = lit ? C.gold : C.line;
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.beginPath();
    ctx.arc(cx, cy - r * 0.15, r * 0.72, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(cx + r * 0.3, cy + r * 0.62);
    ctx.lineTo(cx - r * 0.3, cy + r * 0.62);
    ctx.closePath();
    if (lit) ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = lit ? C.text : C.line;
    ctx.fillRect(cx - r * 0.3, cy + r * 0.72, r * 0.6, r * 0.14);
    ctx.fillRect(cx - r * 0.22, cy + r * 0.92, r * 0.44, r * 0.12);
    if (lit) {
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.arc(cx - r * 0.25, cy - r * 0.35, r * 0.14, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function fmtTime(sec) {
    const s = Math.floor(sec);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }

  /* Card art grid: a valid solved pattern with a fixed set of visible cells. */
  const THUMB_SOL = [];
  for (let i = 0; i < 81; i++) THUMB_SOL.push(((ROW[i] * 3 + ((ROW[i] / 3) | 0) + COL[i]) % 9) + 1);

  Arcade.register({
    id: 'sudoku',
    title: 'Sudoku',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    color: C.violet,
    tagline: 'Fill the grid so each row, column and box has 1 to 9 exactly once.',
    hook: 'Completing a row, column or box earns a hint, so clean solving pays off.',
    tags: ['puzzle', 'logic', 'numbers', 'classic', 'brain', 'sudoku', 'keyboard', 'mouse', 'touch'],
    howTo: 'Every row, column and 3×3 box must hold the digits 1 to 9 exactly once. Pick a cell and enter a digit; ' +
      'switch on notes to pencil in candidates. A wrong digit is a strike, and three strikes end the puzzle. ' +
      'The twist: each row, column or box you finish correctly flashes and charges one hint (up to 3). A hint reveals ' +
      'the selected cell, or the most useful cell if none is open. Units finished by a hint do not charge another, ' +
      'and every hint you never use adds ' + HINT_BONUS + ' points.',
    controls: [
      { keys: ['Click', '↑', '↓', '←', '→'], label: 'Select a cell (WASD works too)' },
      { keys: ['1–9'], label: 'Enter a digit (Shift+digit for a note)' },
      { keys: ['N', 'Space'], label: 'Toggle notes mode' },
      { keys: ['Backspace', '0'], label: 'Clear the cell' },
      { keys: ['H'], label: 'Use a hint' },
      { keys: ['Z'], label: 'Undo' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = Math.floor((h - 16) / 9);
      const size = s * 9;
      const bx = 14;
      const by = Math.round((h - size) / 2);
      ctx.fillStyle = C.panel;
      ctx.fillRect(bx, by, size, size);
      const hotRow = 4;
      const sweep = (t * 1.4) % 3;
      ctx.font = '700 ' + Math.round(s * 0.62) + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let i = 0; i < 81; i++) {
        const r = ROW[i];
        const c = COL[i];
        const x = bx + c * s;
        const y = by + r * s;
        const shown = r === hotRow || ((i * 37 + r * 11) % 7) < 3;
        if (r === hotRow) {
          const k = Math.max(0, 1 - Math.abs(sweep * 4 - c * 0.45));
          ctx.fillStyle = U.alpha(C.gold, 0.18 + k * 0.45);
          ctx.fillRect(x, y, s, s);
        }
        if (!shown) continue;
        ctx.fillStyle = r === hotRow ? C.gold : (i % 5 === 0 ? C.p2 : C.text);
        ctx.fillText(String(THUMB_SOL[i]), x + s / 2, y + s / 2 + 1);
      }
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 9; k++) {
        if (k % 3 === 0) continue;
        ctx.moveTo(bx + k * s + 0.5, by);
        ctx.lineTo(bx + k * s + 0.5, by + size);
        ctx.moveTo(bx, by + k * s + 0.5);
        ctx.lineTo(bx + size, by + k * s + 0.5);
      }
      ctx.stroke();
      ctx.strokeStyle = THICK;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 3; k < 9; k += 3) {
        ctx.moveTo(bx + k * s, by);
        ctx.lineTo(bx + k * s, by + size);
        ctx.moveTo(bx, by + k * s);
        ctx.lineTo(bx + size, by + k * s);
      }
      ctx.stroke();
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx + 1, by + hotRow * s, size - 2, s);
      ctx.strokeStyle = C.violet;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, size, size);
      // Hint bulbs: the row just earned the third one.
      const rx = bx + size + (w - bx - size) / 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      for (let k = 0; k < 3; k++) drawBulb(ctx, rx + (k - 1) * 30, by + 54, 11, true, k === 2 ? pulse : 0);
      ctx.font = '800 26px Unbounded, sans-serif';
      ctx.fillStyle = C.gold;
      ctx.fillText('+1', rx, by + 104 - pulse * 4);
      ctx.font = '600 13px "JetBrains Mono", monospace';
      ctx.fillStyle = C.muted;
      ctx.fillText('hint', rx, by + 132);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      const info = { x: PX, y: BY, w: PW, h: 64 };
      const hintBtn = { x: PX, y: BY + 76, w: PW, h: 76, id: 'hint' };
      const padY = hintBtn.y + hintBtn.h + 12;
      const bw = (PW - 26) / 3;
      const bh = 62;
      const buttons = [hintBtn];
      for (let d = 1; d <= 9; d++) {
        const k = d - 1;
        buttons.push({ x: PX + (k % 3) * (bw + 13), y: padY + ((k / 3) | 0) * (bh + 10), w: bw, h: bh, id: 'd' + d, d });
      }
      const toolY = padY + 3 * bh + 2 * 10 + 12;
      const toolH = 54;
      buttons.push({ x: PX, y: toolY, w: bw, h: toolH, id: 'notes' });
      buttons.push({ x: PX + bw + 13, y: toolY, w: bw, h: toolH, id: 'erase' });
      buttons.push({ x: PX + 2 * (bw + 13), y: toolY, w: bw, h: toolH, id: 'undo' });
      const unitsCard = { x: PX, y: toolY + toolH + 12, w: PW, h: BY + BOARD - (toolY + toolH + 12) };

      let state = 'menu'; // 'menu' | 'play' | 'won' | 'lost' | 'over'
      let level = LEVELS[0];
      let sol = new Int8Array(81);
      let val = new Int8Array(81);
      let notes = new Uint16Array(81);
      let fixed = new Uint8Array(81); // 1 = given, 2 = revealed by a hint
      let conflict = new Uint8Array(81);
      let awarded = new Uint8Array(27);
      let sel = 40;
      let notesMode = false;
      let hints = 0;
      let mistakes = 0;
      let time = 0;
      let undoStack = [];
      let clock = 0;
      let endAt = 0;
      let finalScore = 0;
      let flashes = [];
      let pops = [];
      let shakes = [];
      let floaters = [];
      let particles = [];
      let banner = null;
      let redFlash = 0;
      let bulbPulse = 0;
      let hover = null;
      let pressed = null;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      let lastScore = null;
      const told = {};

      const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      const cellCX = (i) => BX + COL[i] * CELL + CELL / 2;
      const cellCY = (i) => BY + ROW[i] * CELL + CELL / 2;

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function potential() {
        const timeScore = Math.max(Math.round(level.base * 0.2), level.base - Math.floor(time));
        return timeScore + hints * HINT_BONUS;
      }

      function recomputeConflicts() {
        conflict.fill(0);
        for (let i = 0; i < 81; i++) {
          const v = val[i];
          if (!v) continue;
          for (const j of PEERS[i]) {
            if (val[j] === v) {
              conflict[i] = 1;
              break;
            }
          }
        }
      }

      function newPuzzle(lv) {
        level = lv;
        const g = generate(lv.givens);
        sol = g.sol;
        val = Int8Array.from(g.puz);
        notes = new Uint16Array(81);
        fixed = new Uint8Array(81);
        for (let i = 0; i < 81; i++) if (val[i]) fixed[i] = 1;
        awarded = new Uint8Array(27);
        // Units that start complete (rare) never pay out.
        for (let u = 0; u < 27; u++) if (UNITS[u].every((i) => val[i])) awarded[u] = 1;
        sel = 40;
        for (let k = 0; k < 81; k++) {
          const i = (40 + k) % 81;
          if (!val[i]) {
            sel = i;
            break;
          }
        }
        notesMode = false;
        hints = 0;
        mistakes = 0;
        time = 0;
        undoStack = [];
        flashes = [];
        pops = [];
        shakes = [];
        floaters = [];
        particles = [];
        banner = null;
        redFlash = 0;
        lastScore = null;
        lastStatus = '';
        recomputeConflicts();
        state = 'play';
        setHint(lv.name + ': ' + g.givens + ' clues. Finish any row, column or box correctly to earn a hint (up to 3).', 7);
      }

      function showStart() {
        state = 'menu';
        api.menu({
          title: 'Sudoku',
          text: 'Every row, column and box needs 1 to 9 once. Finish a row, column or box to earn a hint. ' +
            'Three wrong digits end the puzzle.',
          buttons: LEVELS.map((lv, k) => ({
            label: lv.name + ' · ' + lv.givens + ' clues',
            primary: k === 0,
            onClick: () => newPuzzle(lv)
          }))
        });
      }

      function burst(x, y, n, colors, speed) {
        for (let k = 0; k < n && particles.length < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.25, life: U.rand(0.4, 0.9), size: U.rand(2, 4.5), color: U.pick(colors) });
        }
      }

      function nudge(i) {
        shakes.push({ i, t: 0, soft: true });
        api.sfx('tick');
      }

      /* Checks the three units through cell i. byPlayer = placed by hand (earns hints). */
      function checkUnits(i, byPlayer) {
        let gained = 0;
        let full = 0;
        const names = [];
        for (const u of [ROW[i], 9 + COL[i], 18 + BOX[i]]) {
          if (awarded[u]) continue;
          if (!UNITS[u].every((j) => val[j] === sol[j])) continue;
          awarded[u] = 1;
          flashes.push({ u, t: 0, gold: byPlayer });
          names.push(unitName(u));
          if (!byPlayer) continue;
          if (hints < MAX_HINTS) {
            hints++;
            gained++;
          } else {
            full++;
          }
        }
        if (!names.length) return;
        const cx = cellCX(i);
        const cy = cellCY(i);
        burst(cx, cy, 14 * names.length, byPlayer ? [C.gold, C.violet, C.text] : [C.muted, C.violet], 240);
        if (gained) {
          bulbPulse = 1;
          api.sfx('power');
          floaters.push({ x: cx, y: cy - 10, text: '+' + gained + ' hint' + (gained > 1 ? 's' : ''), color: C.gold, t: 0 });
          if (!told.earn) {
            told.earn = true;
            setHint(names.join(' + ') + ' complete: +' + gained + ' hint' + (gained > 1 ? 's' : '') +
              '! Press H or tap Hint to reveal a cell.', 8);
          } else {
            setHint(names.join(' + ') + ' complete: +' + gained + ' hint' + (gained > 1 ? 's' : '') + '.', 4);
          }
        } else if (full) {
          api.sfx('score');
          floaters.push({ x: cx, y: cy - 10, text: 'Hints full', color: C.muted, t: 0 });
          setHint(names.join(' + ') + ' complete, but hints are full (3). Spend one to keep earning.', 5);
        } else {
          api.sfx('score');
          setHint(names.join(' + ') + ' complete. Units finished by a hint do not earn a new one.', 5);
        }
      }

      function checkWin() {
        for (let i = 0; i < 81; i++) if (val[i] !== sol[i]) return;
        state = 'won';
        finalScore = potential();
        api.setScore(finalScore);
        endAt = clock + 1.8;
        banner = { text: 'Solved!', sub: fmtTime(time) + ' · ' + mistakes + ' strike' + (mistakes === 1 ? '' : 's') + ' · ' + hints + ' hint' + (hints === 1 ? '' : 's') + ' saved', color: C.violet, t: 0 };
        for (let n = 0; n < 8; n++) burst(U.rand(BX, BX + BOARD), U.rand(BY, BY + BOARD * 0.6), 18, [C.violet, C.gold, C.p2, C.mint, C.p1], 320);
        api.sfx('win');
      }

      function lose() {
        state = 'lost';
        endAt = clock + 1.6;
        redFlash = 1;
        banner = { text: 'Three strikes', sub: 'The answers are shown in gray.', color: C.p1, t: 0 };
        api.sfx('lose');
      }

      function endRun(won) {
        state = 'over';
        const done = awarded.reduce((a, b) => a + b, 0);
        if (won) {
          const isBest = api.reportScore(finalScore);
          const text = level.name + ' solved in ' + fmtTime(time) + ' with ' + mistakes + ' strike' +
            (mistakes === 1 ? '' : 's') + '. ' + hints + ' unused hint' + (hints === 1 ? '' : 's') + ' (+' +
            hints * HINT_BONUS + '). ' + finalScore + ' points.';
          api.setStatus(text);
          lastStatus = text;
          api.menu({
            title: isBest ? 'New best: ' + finalScore + '!' : 'Solved!',
            text,
            buttons: [
              { label: 'Next puzzle', primary: true, onClick: () => newPuzzle(level) },
              { label: 'Change difficulty', onClick: showStart }
            ]
          });
        } else {
          const text = 'Three wrong digits ended this ' + level.name.toLowerCase() + ' puzzle after ' + fmtTime(time) +
            '. You completed ' + done + ' of 27 rows, columns and boxes.';
          api.setStatus(text);
          lastStatus = text;
          api.menu({
            title: 'Out of strikes',
            text,
            buttons: [
              { label: 'Play again', primary: true, onClick: () => newPuzzle(level) },
              { label: 'Change difficulty', onClick: showStart }
            ]
          });
        }
      }

      function pushUndo(rec) {
        undoStack.push(rec);
        if (undoStack.length > 400) undoStack.shift();
      }

      function toggleNote(i, d) {
        if (fixed[i]) {
          nudge(i);
          return;
        }
        if (val[i]) {
          nudge(i);
          setHint('Clear the cell before adding notes.', 3);
          return;
        }
        pushUndo([{ i, v: val[i], n: notes[i] }]);
        notes[i] ^= 1 << d;
        api.sfx('tick');
      }

      function enter(d, asNote) {
        if (state !== 'play') return;
        const i = sel;
        if (asNote || notesMode) {
          toggleNote(i, d);
          return;
        }
        if (fixed[i]) {
          nudge(i);
          return;
        }
        if (val[i] === d) return;
        if (val[i] && val[i] === sol[i]) {
          nudge(i);
          setHint('That number is already right, so it stays. Press Z to undo it if you must.', 4);
          return;
        }
        const rec = [{ i, v: val[i], n: notes[i] }];
        val[i] = d;
        notes[i] = 0;
        pops.push({ i, t: 0 });
        if (d === sol[i]) {
          for (const j of PEERS[i]) {
            if (notes[j] & (1 << d)) {
              rec.push({ i: j, v: val[j], n: notes[j] });
              notes[j] &= ~(1 << d);
            }
          }
          pushUndo(rec);
          api.sfx('blip');
          recomputeConflicts();
          checkUnits(i, true);
          checkWin();
        } else {
          pushUndo(rec);
          mistakes++;
          shakes.push({ i, t: 0, soft: false });
          redFlash = 0.5;
          recomputeConflicts();
          if (mistakes >= STRIKES) {
            lose();
          } else {
            api.sfx('hit');
            setHint('That ' + d + ' does not belong there. Strike ' + mistakes + ' of ' + STRIKES + '.', 4);
          }
        }
      }

      function erase() {
        if (state !== 'play') return;
        const i = sel;
        if (fixed[i]) {
          nudge(i);
          return;
        }
        if (val[i] && val[i] === sol[i]) {
          nudge(i);
          setHint('That number is already right, so it stays. Press Z to undo it if you must.', 4);
          return;
        }
        if (!val[i] && !notes[i]) return;
        pushUndo([{ i, v: val[i], n: notes[i] }]);
        val[i] = 0;
        notes[i] = 0;
        api.sfx('tick');
        recomputeConflicts();
      }

      function undo() {
        if (state !== 'play') return;
        const rec = undoStack.pop();
        if (!rec) {
          setHint('Nothing to undo.', 2);
          api.sfx('tick');
          return;
        }
        for (let k = rec.length - 1; k >= 0; k--) {
          const e = rec[k];
          if (fixed[e.i]) continue;
          val[e.i] = e.v;
          notes[e.i] = e.n;
        }
        sel = rec[0].i;
        api.sfx('flip');
        recomputeConflicts();
      }

      /* The open cell with the fewest candidates; ties go to the cell in the fullest units. */
      function smartCell() {
        let best = -1;
        let bestN = 99;
        let bestFill = -1;
        for (let i = 0; i < 81; i++) {
          if (fixed[i] || val[i] === sol[i]) continue;
          let used = 0;
          let fill = 0;
          for (const j of PEERS[i]) {
            if (val[j] && val[j] === sol[j]) used |= 1 << val[j];
          }
          for (const u of [ROW[i], 9 + COL[i], 18 + BOX[i]]) {
            for (const j of UNITS[u]) if (val[j] === sol[j]) fill++;
          }
          const n = 9 - POP[used & 0x3FE];
          if (n < bestN || (n === bestN && fill > bestFill)) {
            best = i;
            bestN = n;
            bestFill = fill;
          }
        }
        return best;
      }

      function useHint() {
        if (state !== 'play') return;
        if (hints <= 0) {
          setHint('No hints yet. Finish a row, column or box correctly to earn one.', 4);
          api.sfx('tick');
          return;
        }
        let i = sel;
        if (fixed[i] || val[i] === sol[i]) i = smartCell();
        if (i < 0) return;
        hints--;
        val[i] = sol[i];
        notes[i] = 0;
        fixed[i] = 2;
        for (const j of PEERS[i]) notes[j] &= ~(1 << sol[i]);
        sel = i;
        pops.push({ i, t: 0, hint: true });
        burst(cellCX(i), cellCY(i), 16, [C.gold, C.text], 200);
        api.sfx('power');
        if (!told.used) {
          told.used = true;
          setHint('Hint revealed a ' + sol[i] + '. Every hint you save is worth ' + HINT_BONUS + ' points at the end.', 5);
        }
        recomputeConflicts();
        checkUnits(i, false);
        checkWin();
      }

      function toggleNotes() {
        if (state !== 'play') return;
        notesMode = !notesMode;
        api.sfx('flip');
        setHint(notesMode ? 'Notes on: digits pencil in candidates.' : 'Notes off: digits fill the cell.', 3);
      }

      function pressButton(b) {
        if (state !== 'play' || !b) return;
        if (b.d) enter(b.d, false);
        else if (b.id === 'hint') useHint();
        else if (b.id === 'notes') toggleNotes();
        else if (b.id === 'erase') erase();
        else if (b.id === 'undo') undo();
      }

      function cellAt(p) {
        const c = Math.floor((p.x - BX) / CELL);
        const r = Math.floor((p.y - BY) / CELL);
        if (c < 0 || r < 0 || c > 8 || r > 8) return -1;
        return r * 9 + c;
      }

      function buttonAt(p) {
        for (const b of buttons) if (inRect(p, b)) return b;
        return null;
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (state !== 'play') return;
        const mv = MOVES[e.code];
        if (mv) {
          const c = (COL[sel] + mv[0] + 9) % 9;
          const r = (ROW[sel] + mv[1] + 9) % 9;
          sel = r * 9 + c;
          return;
        }
        let d = 0;
        if (/^Digit[1-9]$/.test(e.code)) d = Number(e.code.slice(5));
        else if (/^Numpad[1-9]$/.test(e.code)) d = Number(e.code.slice(6));
        if (d) {
          if (!e.repeat) enter(d, e.shiftKey);
          return;
        }
        if (e.repeat) return;
        if (e.code === 'KeyN' || e.code === 'Space') toggleNotes();
        else if (e.code === 'Backspace' || e.code === 'Delete' || e.code === 'Digit0' || e.code === 'Numpad0') erase();
        else if (e.code === 'KeyZ') undo();
        else if (e.code === 'KeyH') useHint();
      });

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        const i = cellAt(p);
        if (i >= 0) {
          if (sel !== i) api.sfx('tick');
          sel = i;
          return;
        }
        pressed = buttonAt(p);
      });
      api.on(canvas, 'pointermove', (e) => {
        hover = buttonAt(api.toCanvas(e, canvas));
      });
      api.on(canvas, 'pointerup', (e) => {
        const b = pressed;
        pressed = null;
        if (!b || state !== 'play') return;
        if (inRect(api.toCanvas(e, canvas), b)) pressButton(b);
      });
      api.on(canvas, 'pointercancel', () => { pressed = null; });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        if (state === 'play') time += dt;
        hintT = Math.max(0, hintT - dt);
        redFlash = Math.max(0, redFlash - dt * 2);
        bulbPulse = Math.max(0, bulbPulse - dt * 1.2);
        for (const f of flashes) f.t += dt;
        flashes = flashes.filter((f) => f.t < 1.2);
        for (const p of pops) p.t += dt;
        pops = pops.filter((p) => p.t < 0.3);
        for (const s of shakes) s.t += dt;
        shakes = shakes.filter((s) => s.t < 0.35);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 1.2);
        for (const p of particles) {
          p.vy += 420 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        if (banner) banner.t += dt;

        if ((state === 'won' || state === 'lost') && clock >= endAt) {
          endRun(state === 'won');
          return;
        }
        if (state === 'play') {
          const s = potential();
          if (s !== lastScore) {
            api.setScore(s);
            lastScore = s;
          }
          const status = hintT > 0 ? hint
            : level.name + ' · ' + fmtTime(time) + ' · Strikes ' + mistakes + '/' + STRIKES +
              ' · Hints ' + hints + '/' + MAX_HINTS + (notesMode ? ' · Notes on' : '');
          if (status !== lastStatus) {
            api.setStatus(status);
            lastStatus = status;
          }
        }
      }

      /* ---------- Draw ---------- */

      function unitGlow(i) {
        let a = 0;
        let gold = false;
        for (const f of flashes) {
          const cells = UNITS[f.u];
          const k = cells.indexOf(i);
          if (k < 0) continue;
          const tt = f.t - k * 0.045;
          if (tt < 0) continue;
          const v = tt < 0.15 ? tt / 0.15 : Math.max(0, 1 - (tt - 0.15) / 0.65);
          if (v > a) {
            a = v;
            gold = f.gold;
          }
        }
        return { a, gold };
      }

      function drawBoard() {
        const sv = val[sel];
        const ended = state === 'lost' || state === 'over';
        ctx.fillStyle = 'rgba(5,4,16,.5)';
        U.roundRect(ctx, BX - 4, BY + 2, BOARD + 8, BOARD + 8, 14);
        ctx.fill();
        ctx.fillStyle = C.panel;
        ctx.fillRect(BX, BY, BOARD, BOARD);
        const winWave = state === 'won' || (state === 'over' && val.every((v, i) => v === sol[i]));

        for (let i = 0; i < 81; i++) {
          const x = BX + COL[i] * CELL;
          const y = BY + ROW[i] * CELL;
          const peer = state === 'play' && (ROW[i] === ROW[sel] || COL[i] === COL[sel] || BOX[i] === BOX[sel]);
          if (peer) {
            ctx.fillStyle = C.panel2;
            ctx.fillRect(x, y, CELL, CELL);
          }
          if (state === 'play' && sv && val[i] === sv) {
            ctx.fillStyle = U.alpha(C.violet, 0.26);
            ctx.fillRect(x, y, CELL, CELL);
          }
          if (conflict[i]) {
            ctx.fillStyle = U.alpha(C.p1, 0.22);
            ctx.fillRect(x, y, CELL, CELL);
          }
          if (i === sel && state === 'play') {
            ctx.fillStyle = U.alpha(C.violet, 0.42);
            ctx.fillRect(x, y, CELL, CELL);
          }
          const g = unitGlow(i);
          if (g.a > 0) {
            ctx.fillStyle = U.alpha(g.gold ? C.gold : C.violet, g.a * 0.5);
            ctx.fillRect(x, y, CELL, CELL);
          }
          if (winWave && state === 'won') {
            const d = (COL[i] + ROW[i]) * 0.05;
            const tt = 1.8 - (endAt - clock) - d;
            if (tt > 0 && tt < 0.6) {
              ctx.fillStyle = U.alpha(C.violet, (1 - tt / 0.6) * 0.6);
              ctx.fillRect(x, y, CELL, CELL);
            }
          }

          // Digit or notes.
          let ox = 0;
          for (const s of shakes) if (s.i === i) ox = Math.sin(s.t * 60) * (1 - s.t / 0.35) * (s.soft ? 3 : 6);
          let scale = 1;
          for (const p of pops) if (p.i === i) scale = 1 + Math.sin(Math.min(1, p.t / 0.3) * Math.PI) * 0.28;
          const v = val[i];
          if (v) {
            let color = C.p2;
            if (fixed[i] === 1) color = C.text;
            else if (fixed[i] === 2) color = C.gold;
            else if (v !== sol[i]) color = C.p1;
            ctx.font = (fixed[i] === 1 ? '700 ' : '600 ') + Math.round(CELL * 0.52 * scale) + 'px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;
            ctx.fillText(String(v), x + CELL / 2 + ox, y + CELL / 2 + 2);
            if (fixed[i] === 2) {
              ctx.fillStyle = U.alpha(C.gold, 0.8);
              ctx.beginPath();
              ctx.arc(x + CELL - 9, y + 9, 3, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (ended) {
            ctx.font = '600 ' + Math.round(CELL * 0.46) + 'px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = U.alpha(C.muted, 0.45);
            ctx.fillText(String(sol[i]), x + CELL / 2, y + CELL / 2 + 2);
          } else if (notes[i]) {
            ctx.font = '600 ' + Math.round(CELL * 0.24) + 'px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            for (let d = 1; d <= 9; d++) {
              if (!(notes[i] & (1 << d))) continue;
              const nx = x + CELL * (0.2 + ((d - 1) % 3) * 0.3);
              const ny = y + CELL * (0.21 + (((d - 1) / 3) | 0) * 0.3);
              if (sv === d && state === 'play') {
                ctx.fillStyle = U.alpha(C.violet, 0.5);
                ctx.beginPath();
                ctx.arc(nx, ny, CELL * 0.13, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = C.text;
              } else {
                ctx.fillStyle = C.muted;
              }
              ctx.fillText(String(d), nx + ox, ny + 1);
            }
          }
        }

        // Grid lines.
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let k = 1; k < 9; k++) {
          if (k % 3 === 0) continue;
          ctx.moveTo(BX + k * CELL + 0.5, BY);
          ctx.lineTo(BX + k * CELL + 0.5, BY + BOARD);
          ctx.moveTo(BX, BY + k * CELL + 0.5);
          ctx.lineTo(BX + BOARD, BY + k * CELL + 0.5);
        }
        ctx.stroke();
        ctx.strokeStyle = THICK;
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let k = 3; k < 9; k += 3) {
          ctx.moveTo(BX + k * CELL, BY);
          ctx.lineTo(BX + k * CELL, BY + BOARD);
          ctx.moveTo(BX, BY + k * CELL);
          ctx.lineTo(BX + BOARD, BY + k * CELL);
        }
        ctx.stroke();
        ctx.strokeStyle = notesMode && state === 'play' ? C.p2 : C.violet;
        ctx.lineWidth = 3;
        U.roundRect(ctx, BX - 1.5, BY - 1.5, BOARD + 3, BOARD + 3, 6);
        ctx.stroke();

        if (state === 'play') {
          const x = BX + COL[sel] * CELL;
          const y = BY + ROW[sel] * CELL;
          ctx.strokeStyle = notesMode ? C.p2 : C.text;
          ctx.lineWidth = 2.5;
          U.roundRect(ctx, x + 2, y + 2, CELL - 4, CELL - 4, 6);
          ctx.stroke();
        }
      }

      function btnBase(b, active, accent) {
        const hot = hover === b && state === 'play';
        const down = pressed === b;
        ctx.fillStyle = active ? U.alpha(accent, 0.22) : hot ? C.line : C.panel2;
        U.roundRect(ctx, b.x, b.y + (down ? 2 : 0), b.w, b.h, 12);
        ctx.fill();
        ctx.strokeStyle = active ? accent : hot ? C.muted : C.line;
        ctx.lineWidth = active ? 2 : 1.5;
        ctx.stroke();
        return down ? 2 : 0;
      }

      function drawPanel() {
        // Info card: difficulty, time, strikes.
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, info.x, info.y, info.w, info.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText(level.name.toUpperCase(), info.x + 14, info.y + 24);
        ctx.font = '700 22px "JetBrains Mono", monospace';
        ctx.fillStyle = C.text;
        ctx.fillText(fmtTime(time), info.x + 14, info.y + 52);
        ctx.textAlign = 'right';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('STRIKES', info.x + info.w - 14, info.y + 24);
        for (let k = 0; k < STRIKES; k++) {
          const cx = info.x + info.w - 22 - (STRIKES - 1 - k) * 26;
          const cy = info.y + 44;
          const on = k < mistakes;
          ctx.strokeStyle = on ? C.p1 : C.line;
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx - 7, cy - 7);
          ctx.lineTo(cx + 7, cy + 7);
          ctx.moveTo(cx + 7, cy - 7);
          ctx.lineTo(cx - 7, cy + 7);
          ctx.stroke();
        }

        // Hint button with charge bulbs.
        const hb = hintBtn;
        const ready = hints > 0 && state === 'play';
        const dy = btnBase(hb, false, C.gold);
        if (ready) {
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 6 + bulbPulse * 16 + Math.sin(clock * 3) * 3;
          ctx.strokeStyle = U.alpha(C.gold, 0.7);
          ctx.lineWidth = 2;
          U.roundRect(ctx, hb.x, hb.y + dy, hb.w, hb.h, 12);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.textAlign = 'left';
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillStyle = ready ? C.gold : C.muted;
        ctx.fillText('Hint', hb.x + 16, hb.y + dy + 32);
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText(hints ? 'H · reveals a cell' : 'finish a unit to earn', hb.x + 16, hb.y + dy + 54);
        for (let k = 0; k < MAX_HINTS; k++) {
          const lit = k < hints;
          drawBulb(ctx, hb.x + hb.w - 26 - (MAX_HINTS - 1 - k) * 30, hb.y + dy + 36, 11, lit,
            lit && k === hints - 1 ? bulbPulse : 0);
        }

        // Number pad with remaining counts.
        const placed = new Array(10).fill(0);
        for (let i = 0; i < 81; i++) if (val[i] && val[i] === sol[i]) placed[val[i]]++;
        const sv = val[sel];
        for (const b of buttons) {
          if (!b.d) continue;
          const left = 9 - placed[b.d];
          const same = state === 'play' && sv === b.d;
          const by = btnBase(b, same, C.violet);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          if (notesMode) {
            ctx.font = '600 22px "JetBrains Mono", monospace';
            ctx.fillStyle = left ? C.p2 : U.alpha(C.muted, 0.4);
          } else {
            ctx.font = '700 28px "JetBrains Mono", monospace';
            ctx.fillStyle = left ? C.text : U.alpha(C.muted, 0.4);
          }
          ctx.fillText(String(b.d), b.x + b.w / 2, b.y + by + b.h / 2 - 4);
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.fillStyle = left ? C.muted : C.mint;
          ctx.fillText(left ? left + ' left' : 'done', b.x + b.w / 2, b.y + by + b.h - 11);
          ctx.textBaseline = 'alphabetic';
        }

        // Tools.
        const toolText = { notes: notesMode ? 'Notes on' : 'Notes', erase: 'Erase', undo: 'Undo' };
        const toolKey = { notes: 'N', erase: '⌫', undo: 'Z' };
        for (const b of buttons) {
          if (!toolText[b.id]) continue;
          const by = btnBase(b, b.id === 'notes' && notesMode, C.p2);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = '700 14px "JetBrains Mono", monospace';
          ctx.fillStyle = b.id === 'notes' && notesMode ? C.p2 : C.text;
          ctx.fillText(toolText[b.id], b.x + b.w / 2, b.y + by + b.h / 2 - 7);
          ctx.font = '600 11px "JetBrains Mono", monospace';
          ctx.fillStyle = C.muted;
          ctx.fillText(toolKey[b.id], b.x + b.w / 2, b.y + by + b.h / 2 + 12);
          ctx.textBaseline = 'alphabetic';
        }

        // Units complete: 27 segments (rows, columns, boxes).
        const uc = unitsCard;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, uc.x, uc.y, uc.w, uc.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const done = awarded.reduce((a, b) => a + b, 0);
        ctx.textAlign = 'left';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('UNITS DONE', uc.x + 14, uc.y + 22);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.text;
        ctx.fillText(done + '/27', uc.x + uc.w - 14, uc.y + 22);
        const segW = (uc.w - 28 - 2 * 8) / 27;
        for (let u = 0; u < 27; u++) {
          const group = (u / 9) | 0;
          const sx = uc.x + 14 + u * segW + group * 8;
          ctx.fillStyle = awarded[u] ? [C.violet, C.p2, C.gold][group] : C.ink;
          ctx.fillRect(sx + 1, uc.y + 34, segW - 2, Math.max(8, uc.h - 50));
        }
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = C.muted;
        const labels = ['rows', 'cols', 'boxes'];
        for (let g = 0; g < 3; g++) {
          ctx.fillText(labels[g], uc.x + 14 + (g * 9 + 4.5) * segW + g * 8, uc.y + uc.h - 4);
        }
      }

      function drawEffects() {
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.35));
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = '700 17px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floaters) {
          const y = f.y - 20 - f.t * 46;
          ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
          ctx.fillStyle = C.ink;
          ctx.fillText(f.text, f.x + 1.5, y + 1.5);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, y);
        }
        ctx.globalAlpha = 1;
      }

      function drawBanner() {
        if (!banner) return;
        const k = banner.t;
        const a = Math.min(1, k * 5);
        const scale = 1 + Math.max(0, 0.25 - k) * 1.2;
        const cy = BY + BOARD / 2;
        ctx.globalAlpha = a;
        ctx.fillStyle = U.alpha(C.ink, 0.8);
        ctx.fillRect(BX, cy - 56, BOARD, 112);
        ctx.fillStyle = banner.color;
        ctx.fillRect(BX, cy - 56, BOARD, 2);
        ctx.fillRect(BX, cy + 54, BOARD, 2);
        ctx.save();
        ctx.translate(BX + BOARD / 2, cy - 10);
        ctx.scale(scale, scale);
        ctx.font = FONT_BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = banner.color;
        ctx.shadowColor = banner.color;
        ctx.shadowBlur = 16;
        ctx.fillText(banner.text, 0, 0);
        ctx.restore();
        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.text;
        ctx.fillText(banner.sub, BX + BOARD / 2, cy + 32);
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawBoard();
        drawPanel();
        drawEffects();
        if (state === 'won' || state === 'lost') drawBanner();
        if (redFlash > 0) {
          ctx.fillStyle = U.alpha(C.p1, redFlash * 0.18);
          ctx.fillRect(0, 0, W, H);
        }
      }

      // Show a puzzle behind the start menu so the stage never looks empty.
      newPuzzle(LEVELS[0]);
      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
