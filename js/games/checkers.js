/* Checkers — American rules against the computer or a friend, with an optional 10-second rush fuse. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 640;
  const SQ = 75;
  const BX = 20;
  const BY = 20;
  const PX = 640;
  const PW = 240;
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const BIG = '800 44px Unbounded, sans-serif';
  const FUSE = 10;
  const QUIET_LIMIT = 40;
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  /* ===== ENGINE START ===== */
  /* Board: Int8Array(64), row 0 at the top. 1 = coral man, 2 = coral king, -1 = cyan man, -2 = cyan king.
     Coral (side 1) starts at the bottom and moves up; cyan (side -1) moves down. Dark squares: (r + c) odd. */
  const WIN = 100000;
  const INF = 1000000;
  const D_UP = [[-1, -1], [-1, 1]];
  const D_DOWN = [[1, -1], [1, 1]];
  const D_ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const dirsOf = (p) => (p === 1 ? D_UP : p === -1 ? D_DOWN : D_ALL);
  const crownRow = (p) => (p > 0 ? 0 : 7);

  function initialBoard() {
    const b = new Int8Array(64);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 !== 1) continue;
        if (r <= 2) b[r * 8 + c] = -1;
        else if (r >= 5) b[r * 8 + c] = 1;
      }
    }
    return b;
  }

  function addJumps(b, from, p, out) {
    b[from] = 0;
    const path = [];
    const caps = [];
    const dirs = dirsOf(p);
    const rec = (sq) => {
      const r = sq >> 3;
      const c = sq & 7;
      let any = false;
      for (let i = 0; i < dirs.length; i++) {
        const dr = dirs[i][0];
        const dc = dirs[i][1];
        const lr = r + 2 * dr;
        const lc = c + 2 * dc;
        if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
        const mid = (r + dr) * 8 + c + dc;
        const land = lr * 8 + lc;
        if (b[mid] * p >= 0 || b[land] !== 0 || caps.indexOf(mid) >= 0) continue;
        any = true;
        path.push(land);
        caps.push(mid);
        if ((p === 1 || p === -1) && lr === crownRow(p)) {
          // Crowning ends the move.
          out.push({ from, to: land, path: path.slice(), caps: caps.slice(), crown: true });
        } else rec(land);
        path.pop();
        caps.pop();
      }
      if (!any && path.length) out.push({ from, to: sq, path: path.slice(), caps: caps.slice(), crown: false });
    };
    rec(from);
    b[from] = p;
  }

  /* All legal moves for side (1 or -1). Captures are mandatory, and every jump chain runs to its end. */
  function genMoves(b, side) {
    const jumps = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p * side > 0) addJumps(b, sq, p, jumps);
    }
    if (jumps.length) return jumps;
    const moves = [];
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (p * side <= 0) continue;
      const r = sq >> 3;
      const c = sq & 7;
      const dirs = dirsOf(p);
      for (let i = 0; i < dirs.length; i++) {
        const nr = r + dirs[i][0];
        const nc = c + dirs[i][1];
        if (nr < 0 || nr > 7 || nc < 0 || nc > 7) continue;
        const to = nr * 8 + nc;
        if (b[to]) continue;
        moves.push({ from: sq, to, path: [to], caps: [], crown: (p === 1 || p === -1) && nr === crownRow(p) });
      }
    }
    return moves;
  }

  function makeMove(b, m) {
    const p = b[m.from];
    const undo = { p, capVals: m.caps.map((s) => b[s]) };
    b[m.from] = 0;
    for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = 0;
    b[m.to] = m.crown ? (p > 0 ? 2 : -2) : p;
    return undo;
  }

  function unmakeMove(b, m, undo) {
    b[m.to] = 0;
    for (let i = 0; i < m.caps.length; i++) b[m.caps[i]] = undo.capVals[i];
    b[m.from] = undo.p;
  }

  function countPieces(b, side) {
    let n = 0;
    for (let i = 0; i < 64; i++) if (b[i] * side > 0) n++;
    return n;
  }

  /* Static score from side's point of view: material, kings, advancement, centre, back-row guard,
     trading down when ahead, and kings hunting in the endgame. */
  function evaluate(b, side) {
    let s = 0;
    let m1 = 0;
    let m2 = 0;
    let n = 0;
    for (let sq = 0; sq < 64; sq++) {
      const p = b[sq];
      if (!p) continue;
      n++;
      const r = sq >> 3;
      const c = sq & 7;
      const centre = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 6 : 0;
      const edge = (c === 0 || c === 7) ? -4 : 0;
      if (p === 1) {
        m1 += 100;
        s += 100 + (7 - r) * 5 + centre + edge + (r === 7 && (c === 2 || c === 6) ? 12 : 0);
      } else if (p === -1) {
        m2 += 100;
        s -= 100 + r * 5 + centre + edge + (r === 0 && (c === 1 || c === 5) ? 12 : 0);
      } else if (p === 2) {
        m1 += 165;
        s += 165 + centre + edge;
      } else {
        m2 += 165;
        s -= 165 + centre + edge;
      }
    }
    if (m1 !== m2) {
      const total = m1 + m2;
      s += ((m1 - m2) * 0.3 * (2400 - Math.min(2400, total))) / 2400;
      if (n <= 10) {
        // The stronger side's kings close in on the weaker side.
        const lead = m1 > m2 ? 1 : -1;
        for (let sq = 0; sq < 64; sq++) {
          if (b[sq] !== 2 * lead) continue;
          let best = 8;
          for (let t = 0; t < 64; t++) {
            if (b[t] * lead >= 0) continue;
            const d = Math.max(Math.abs((sq >> 3) - (t >> 3)), Math.abs((sq & 7) - (t & 7)));
            if (d < best) best = d;
          }
          s += lead * (8 - best) * 4;
        }
      }
    }
    return (s * side) | 0;
  }

  const SLICE_MS = 14;
  const SLICE_NODES = 3000;

  function* negamax(S, side, depth, alpha, beta, ply) {
    if (S.nodes - S.lastCheck >= 200) {
      S.lastCheck = S.nodes;
      const t = now();
      if (S.depthDone >= 1 && t > S.deadline) S.stop = true;
      else if (t - S.sliceT > SLICE_MS || S.nodes - S.sliceNodes > SLICE_NODES) {
        yield 0;
        S.sliceT = now();
        S.sliceNodes = S.nodes;
      }
    }
    if (S.stop) return 0;
    S.nodes++;
    const b = S.b;
    const moves = genMoves(b, side);
    if (!moves.length) return -WIN + ply;
    const forced = moves[0].caps.length > 0;
    if (depth <= 0 && (!forced || ply >= 40)) return evaluate(b, side);
    if (moves.length > 1) {
      const k = S.killers[ply] || '';
      moves.sort((a, c) => score(c, k) - score(a, k));
    }
    let best = -INF;
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const u = makeMove(b, m);
      const v = -(yield* negamax(S, -side, depth - 1, -beta, -alpha, ply + 1));
      unmakeMove(b, m, u);
      if (S.stop) return 0;
      if (v > best) {
        best = v;
        if (v > alpha) {
          alpha = v;
          if (alpha >= beta) {
            S.killers[ply] = m.from + ':' + m.to;
            break;
          }
        }
      }
    }
    return best;
  }

  function score(m, killer) {
    return m.caps.length * 100 + (m.crown ? 50 : 0) + (killer === m.from + ':' + m.to ? 30 : 0);
  }

  /* Iterative deepening; a generator so each next() runs one short slice. Returns the chosen move. */
  function* think(board, side, opts) {
    const b = Int8Array.from(board);
    const root = genMoves(b, side);
    if (!root.length) return null;
    if (root.length === 1) return root[0];
    U.shuffle(root);
    const start = now();
    const S = { b, nodes: 0, lastCheck: 0, sliceT: start, sliceNodes: 0, stop: false, depthDone: 0, deadline: start + opts.time, killers: [] };
    let best = root[0];
    let scores = null;
    for (let depth = 1; depth <= opts.depth; depth++) {
      let alpha = -INF;
      let iterBest = null;
      let iterScore = -INF;
      const sc = [];
      for (let i = 0; i < root.length; i++) {
        const m = root[i];
        const u = makeMove(b, m);
        const v = -(yield* negamax(S, -side, depth - 1, -INF, opts.noise ? INF : -alpha, 1));
        unmakeMove(b, m, u);
        if (S.stop) break;
        sc.push({ m, s: v });
        if (v > iterScore) { iterScore = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      if (iterBest) best = iterBest;
      if (S.stop) break;
      S.depthDone = depth;
      scores = sc;
      sc.sort((a, c) => c.s - a.s);
      for (let i = 0; i < root.length; i++) root[i] = sc[i].m;
      if (Math.abs(iterScore) > WIN - 1000) break;
    }
    if (opts.noise && scores) {
      let pick = best;
      let ps = -Infinity;
      for (const e of scores) {
        const s = e.s + (Math.random() * 2 - 1) * opts.noise;
        if (s > ps) { ps = s; pick = e.m; }
      }
      return pick;
    }
    return best;
  }
  /* ===== ENGINE END ===== */

  const LEVELS = {
    easy: { depth: 2, time: 400, noise: 45 },
    normal: { depth: 5, time: 1200, noise: 0 },
    hard: { depth: 8, time: 2400, noise: 0 }
  };

  /* ---------- Art ---------- */
  function drawCrown(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.moveTo(-0.5, 0.3);
    ctx.lineTo(-0.56, -0.22);
    ctx.lineTo(-0.26, 0.04);
    ctx.lineTo(0, -0.36);
    ctx.lineTo(0.26, 0.04);
    ctx.lineTo(0.56, -0.22);
    ctx.lineTo(0.5, 0.3);
    ctx.closePath();
    ctx.fillStyle = C.gold;
    ctx.fill();
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = 'rgba(15,13,36,0.7)';
    ctx.stroke();
    ctx.restore();
  }

  function drawDisc(ctx, x, y, r, p, alpha) {
    const coral = p > 0;
    const top = coral ? C.p1 : C.p2;
    const rim = coral ? '#B53048' : '#1C85A8';
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + r * 0.32, r * 1.02, r * 0.86, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.14, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = top;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,36,0.28)';
    ctx.lineWidth = Math.max(1, r * 0.09);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, Math.PI * 1.1, Math.PI * 1.55);
    ctx.stroke();
    if (Math.abs(p) === 2) drawCrown(ctx, x, y + r * 0.02, r * 0.62);
    ctx.restore();
  }

  function drawFuseRing(ctx, x, y, r, frac, t, width) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = width;
    ctx.strokeStyle = U.alpha(C.line, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    const col = frac > 0.5 ? C.mint : frac > 0.25 ? C.gold : C.p1;
    if (frac > 0) {
      const a0 = -Math.PI / 2;
      const a1 = a0 + Math.PI * 2 * frac;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, r, a0, a1);
      ctx.stroke();
      // Burning tip.
      const sx = x + Math.cos(a1) * r;
      const sy = y + Math.sin(a1) * r;
      const flick = 0.7 + 0.3 * Math.sin(t * 40);
      ctx.fillStyle = U.alpha(C.gold, 0.35 * flick);
      ctx.beginPath();
      ctx.arc(sx, sy, width * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFF4C8';
      ctx.beginPath();
      ctx.arc(sx, sy, width * 0.75 * flick, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = t * 13 + i * 1.7;
        const d = width * (1.2 + ((t * 5 + i * 0.37) % 1) * 2);
        ctx.fillStyle = U.alpha(i % 2 ? C.gold : C.p1, 0.8);
        ctx.fillRect(sx + Math.cos(a) * d - 1.5, sy + Math.sin(a) * d - 1.5, 3, 3);
      }
    }
    ctx.restore();
  }

  Arcade.register({
    id: 'checkers',
    title: 'Checkers',
    category: 'board',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.p1,
    tagline: 'Jump, chain and crown your way across the board.',
    hook: 'Rush mode: every turn has a 10-second fuse, and running out costs you a piece.',
    tags: ['board', 'strategy', 'classic', 'checkers', 'draughts', 'timer', 'rush', 'ai', 'turn-based'],
    howTo: 'Move one piece diagonally forward to an empty dark square. Jump an enemy piece by hopping over it into ' +
      'the empty square behind; jumping is mandatory, and you keep jumping with the same piece while you can ' +
      '(glowing pieces must capture). Reach the far row to crown a king, which moves and jumps both ways. ' +
      'Win by taking every enemy piece or leaving your opponent with no move. Forty moves in a row without a capture ' +
      'is a draw. The twist is Rush mode: each turn has a 10-second fuse, and if it burns out you lose a random piece ' +
      'and your turn. The computer plays under the same fuse.',
    controls: [
      { keys: ['Click', 'Drag'], label: 'Pick a piece, then its landing square' },
      { keys: ['←', '↑', '→', '↓'], label: 'Move the cursor' },
      { keys: ['Enter', 'Space'], label: 'Select / move' },
      { keys: ['Backspace'], label: 'Drop the selection' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 40;
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 8; c++) {
          ctx.fillStyle = (r + c) % 2 ? '#2C275E' : '#463E86';
          ctx.fillRect(c * s, r * s, s, s);
        }
      }
      drawDisc(ctx, 1.5 * s, 3.5 * s, 15, 1);
      drawDisc(ctx, 3.5 * s, 3.5 * s, 15, 1);
      drawDisc(ctx, 0.5 * s, 4.5 * s, 15, 2);
      drawDisc(ctx, 2.5 * s, 2.5 * s, 15, -1);
      drawDisc(ctx, 4.5 * s, 0.5 * s, 15, -2);
      drawDisc(ctx, 6.5 * s, 2.5 * s, 15, -1);
      // A jump arc.
      ctx.strokeStyle = U.alpha(C.gold, 0.85);
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(1.5 * s, 3.5 * s);
      ctx.quadraticCurveTo(2.5 * s, 1.6 * s, 3.5 * s, 1.5 * s);
      ctx.stroke();
      ctx.setLineDash([]);
      const frac = 1 - ((t * 0.12) % 1) * 0.75 - 0.15;
      ctx.fillStyle = U.alpha(C.ink, 0.75);
      ctx.beginPath();
      ctx.arc(w - 58, 58, 44, 0, Math.PI * 2);
      ctx.fill();
      drawFuseRing(ctx, w - 58, 58, 38, frac, t + 0.3, 7);
      ctx.fillStyle = C.text;
      ctx.font = '800 26px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(Math.max(1, Math.ceil(frac * 10))), w - 58, 60);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let vsCpu = true;
      let rush = false;
      let level = 'normal';
      let board = initialBoard();
      let side = 1;
      let legal = [];
      let phase = 'menu';       // 'menu' | 'play' | 'think' | 'anim' | 'over'
      let sel = null;           // { from, steps: [] }
      let drag = null;
      let cursor = 5 * 8 + 0;
      let kb = false;
      let anim = null;          // { p, pts: [sq...], seg, t, ghostCaps, onDone }
      let particles = [];
      let fizzles = [];
      let flash = null;
      let token = 0;
      let quiet = 0;
      let fuse = FUSE;
      let lastTick = FUSE;
      let tally = { a: 0, b: 0 };
      let taken = { 1: 0, '-1': 0 };
      let clock = 0;
      let lastMove = null;
      let hintedCapture = false;
      let hintedRush = false;
      let hintedHurry = false;
      let pointer = { x: -1, y: -1 };

      const isCpu = (s) => vsCpu && s === -1;
      const nameOf = (s) => (vsCpu ? (s === 1 ? 'You' : 'Computer') : s === 1 ? 'Coral' : 'Cyan');
      const colorOf = (s) => (s === 1 ? C.p1 : C.p2);
      const sqX = (sq) => BX + (sq & 7) * SQ;
      const sqY = (sq) => BY + (sq >> 3) * SQ;
      const cx = (sq) => sqX(sq) + SQ / 2;
      const cy = (sq) => sqY(sq) + SQ / 2;
      function squareAt(x, y) {
        const c = Math.floor((x - BX) / SQ);
        const r = Math.floor((y - BY) / SQ);
        if (c < 0 || c > 7 || r < 0 || r > 7) return -1;
        return r * 8 + c;
      }

      function showTally() {
        api.setScore(vsCpu ? 'You ' + tally.a + ' – ' + tally.b + ' CPU' : 'Coral ' + tally.a + ' – ' + tally.b + ' Cyan');
      }

      /* ---------- Menus ---------- */
      function showStartMenu() {
        token++;
        phase = 'menu';
        anim = null;
        sel = null;
        api.setStatus('Checkers: American rules. Captures are mandatory.');
        api.menu({
          title: 'Checkers',
          text: 'Play the computer or a friend on this screen. Coral moves first.',
          buttons: [
            { label: 'vs computer', primary: true, onClick: () => { vsCpu = true; showRushMenu(); } },
            { label: '2 players', onClick: () => { vsCpu = false; showRushMenu(); } }
          ]
        });
      }
      function showRushMenu() {
        api.menu({
          title: 'Pick a mode',
          text: 'Rush mode gives every turn a 10-second fuse. If it burns out, you lose a random piece and your turn.',
          buttons: [
            { label: 'Rush mode', primary: true, onClick: () => { rush = true; afterMode(); } },
            { label: 'Classic', onClick: () => { rush = false; afterMode(); } }
          ]
        });
      }
      function afterMode() {
        if (!vsCpu) { startMatch(); return; }
        api.menu({
          title: 'Pick a difficulty',
          text: 'You play coral and move first.',
          buttons: [
            { label: 'Easy', onClick: () => { level = 'easy'; startMatch(); } },
            { label: 'Normal', primary: true, onClick: () => { level = 'normal'; startMatch(); } },
            { label: 'Hard', onClick: () => { level = 'hard'; startMatch(); } }
          ]
        });
      }

      function startMatch() {
        tally = { a: 0, b: 0 };
        showTally();
        newGame();
      }

      function newGame() {
        token++;
        board = initialBoard();
        side = 1;
        quiet = 0;
        taken = { 1: 0, '-1': 0 };
        sel = null;
        drag = null;
        anim = null;
        particles = [];
        fizzles = [];
        flash = null;
        lastMove = null;
        cursor = 5 * 8;
        beginTurn();
      }

      function turnText() {
        const forced = legal.length && legal[0].caps.length > 0;
        let s = vsCpu ? 'Your move.' : nameOf(side) + ' to move.';
        if (forced) {
          s = (vsCpu ? 'You must capture.' : nameOf(side) + ' must capture.') + ' Glowing pieces can jump.';
          if (!hintedCapture) {
            hintedCapture = true;
            s = 'Captures are mandatory: glowing pieces must jump, and chains continue with the same piece. ' + s;
          }
        }
        if (rush && !hintedRush) {
          hintedRush = true;
          s = 'Rush: 10 seconds per turn. If the fuse burns out you lose a random piece. ' + s;
        }
        return s;
      }

      function beginTurn() {
        sel = null;
        drag = null;
        legal = genMoves(board, side);
        fuse = FUSE;
        lastTick = FUSE;
        if (!legal.length) {
          endGame(-side, countPieces(board, side) ? 'blocked' : 'wiped');
          return;
        }
        if (quiet >= QUIET_LIMIT) {
          endGame(0, 'quiet');
          return;
        }
        if (isCpu(side)) {
          startThink();
          return;
        }
        phase = 'play';
        const own = legal[0].from;
        if (!(board[cursor] * side > 0)) cursor = own;
        api.setStatus(turnText());
      }

      /* ---------- Computer ---------- */
      function startThink() {
        phase = 'think';
        api.setStatus(rush ? 'Computer is thinking… the fuse is burning.' : 'Computer is thinking…');
        const my = token;
        const started = now();
        let gen = null;
        const minWait = rush ? U.rand(500, 1400) : 450;
        const finish = (m) => {
          if (!m || legal.indexOf(m) < 0) m = U.pick(legal);
          api.after(Math.max(0, minWait - (now() - started)), () => {
            if (my === token && phase === 'think') playMove(m);
          });
        };
        const step = () => {
          if (my !== token || phase !== 'think') return;
          let r;
          try {
            if (!gen) gen = think(board, side, LEVELS[level]);
            r = gen.next();
          } catch (err) {
            finish(null);
            return;
          }
          if (!r.done) { api.after(0, step); return; }
          // Map the engine's move back onto the identical move in our legal list.
          const v = r.value;
          const m = v && legal.find((x) => x.from === v.from && x.path.join() === v.path.join());
          finish(m || null);
        };
        api.after(30, step);
      }

      /* ---------- Moves ---------- */
      const canAct = () => phase === 'play' && !anim && !api.menuOpen && !isCpu(side);

      function candidates() {
        if (!sel) return [];
        return legal.filter((m) => m.from === sel.from && sel.steps.every((s, i) => m.path[i] === s));
      }
      function nextTargets() {
        const k = sel ? sel.steps.length : 0;
        const out = [];
        candidates().forEach((m) => { if (m.path.length > k && out.indexOf(m.path[k]) < 0) out.push(m.path[k]); });
        return out;
      }
      const movable = (sq) => legal.some((m) => m.from === sq);
      const pieceAt = () => (sel ? (sel.steps.length ? sel.steps[sel.steps.length - 1] : sel.from) : -1);

      /* Human picks the next landing square of the selected piece. */
      function stepTo(sq, fromDrag) {
        const k = sel.steps.length;
        const cands = candidates().filter((m) => m.path[k] === sq);
        if (!cands.length) return false;
        const fromSq = pieceAt();
        sel.steps.push(sq);
        const done = cands.find((m) => m.path.length === sel.steps.length);
        const capSq = cands[0].caps[k];
        api.sfx(capSq != null ? 'hit' : 'tick');
        const p = board[sel.from];
        anim = {
          p, pts: [fromSq, sq], seg: 0, t: 0, hop: capSq != null, ghostCaps: [], dur: fromDrag ? 0.07 : (capSq != null ? 0.22 : 0.18),
          onDone: () => {
            if (done) commit(done);
            else api.setStatus('Keep jumping with the same piece.');
          }
        };
        return true;
      }

      function playMove(m) {
        sel = null;
        const p = board[m.from];
        phase = 'anim';
        anim = {
          p, pts: [m.from].concat(m.path), seg: 0, t: 0, hop: m.caps.length > 0, dur: m.caps.length ? 0.24 : 0.2, ghostCaps: [],
          eachHop: (i) => {
            anim.ghostCaps = m.caps.slice(0, i);
            api.sfx('hit');
          },
          onDone: () => commit(m)
        };
        api.sfx(m.caps.length ? 'hit' : 'tick');
      }

      function commit(m) {
        const mover = side;
        m.caps.forEach((s) => {
          burst(cx(s), cy(s), board[s] > 0 ? C.p1 : C.p2, 14);
        });
        makeMove(board, m);
        taken[mover] += m.caps.length;
        quiet = m.caps.length ? 0 : quiet + 1;
        lastMove = { from: m.from, path: m.path.slice() };
        sel = null;
        anim = null;
        if (m.crown) {
          flash = { text: 'Crowned', t: 0, color: C.gold };
          burst(cx(m.to), cy(m.to), C.gold, 22);
          api.sfx('power');
        } else if (m.caps.length > 1) {
          flash = { text: m.caps.length + '× jump', t: 0, color: colorOf(mover) };
          api.sfx('score');
        }
        side = -mover;
        if (!countPieces(board, side)) { endGame(mover, 'wiped'); return; }
        beginTurn();
      }

      /* Rush: the fuse burned out. A random piece of the slow player fizzles away and the turn passes. */
      function fuseOut() {
        token++;
        const loser = side;
        sel = null;
        drag = null;
        anim = null;
        const mine = [];
        for (let i = 0; i < 64; i++) if (board[i] * loser > 0) mine.push(i);
        const sq = U.pick(mine);
        fizzles.push({ sq, p: board[sq], t: 0 });
        burst(cx(sq), cy(sq), C.gold, 26);
        board[sq] = 0;
        api.sfx('boom');
        flash = { text: 'Fizzled!', t: 0, color: C.gold };
        api.setStatus('The fuse burned out: ' + (vsCpu && loser === 1 ? 'you lose' : nameOf(loser) + ' loses') + ' a piece and the turn.');
        side = -loser;
        phase = 'anim';
        const my = token;
        api.after(700, () => {
          if (my !== token) return;
          if (!countPieces(board, loser)) { endGame(-loser, 'wiped'); return; }
          beginTurn();
        });
      }

      function endGame(winner, reason) {
        phase = 'over';
        sel = null;
        anim = null;
        const my = ++token;
        if (winner === 1) tally.a++;
        else if (winner === -1) tally.b++;
        showTally();
        let title;
        let text;
        if (winner === 0) {
          title = 'Draw';
          text = QUIET_LIMIT + ' moves in a row without a capture.';
          api.sfx('flip');
        } else {
          const youLost = vsCpu && winner === -1;
          title = vsCpu ? (youLost ? 'The computer wins' : 'You win!') : nameOf(winner) + ' wins!';
          const loserName = vsCpu ? (winner === 1 ? 'The computer' : 'You') : nameOf(-winner);
          text = reason === 'wiped' ? loserName + (vsCpu && winner === -1 ? ' have' : ' has') + ' no pieces left.'
            : loserName + (vsCpu && winner === -1 ? ' have' : ' has') + ' no legal move.';
          api.sfx(youLost ? 'lose' : 'win');
        }
        flash = { text: title, t: 0, color: winner === 0 ? C.gold : colorOf(winner), stay: true };
        api.setStatus(title + ' ' + text);
        api.after(1400, () => {
          if (my !== token || phase !== 'over') return;
          api.menu({
            title,
            text,
            buttons: [
              { label: 'Play again', primary: true, onClick: newGame },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      function burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 50 + Math.random() * 170;
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.35, color });
        }
      }

      /* Click / Enter on a square. */
      function activate(sq) {
        if (sq < 0) { if (sel && !sel.steps.length) sel = null; return; }
        if (sel && nextTargets().indexOf(sq) >= 0) { stepTo(sq, false); return; }
        if (sel && sel.steps.length) {
          api.setStatus('Finish the jump: keep jumping with the same piece.');
          return;
        }
        if (board[sq] * side > 0) {
          if (movable(sq)) {
            sel = sel && sel.from === sq ? null : { from: sq, steps: [] };
            if (sel) api.sfx('blip');
          } else {
            sel = null;
            const forced = legal[0] && legal[0].caps.length;
            api.setStatus(forced ? 'A capture is available, so you must jump with a glowing piece.' : 'That piece has no move.');
          }
          return;
        }
        sel = null;
      }

      /* ---------- Input ---------- */
      api.on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
      api.on(canvas, 'pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        pointer = p;
        if (!canAct()) return;
        kb = false;
        const sq = squareAt(p.x, p.y);
        if (sq >= 0) cursor = sq;
        if (sel && nextTargets().indexOf(sq) >= 0) { stepTo(sq, false); return; }
        if (sq >= 0 && board[sq] * side > 0 && movable(sq) && !(sel && sel.steps.length)) {
          const was = sel && sel.from === sq;
          sel = { from: sq, steps: [] };
          if (!was) api.sfx('blip');
          drag = { from: sq, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, was };
          try { if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
          return;
        }
        activate(sq);
      });
      api.on(window, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        pointer = p;
        if (drag) {
          drag.x = p.x;
          drag.y = p.y;
          if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 8) drag.moved = true;
        }
      });
      api.on(window, 'pointerup', (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (!canAct() || !sel || sel.from !== d.from) return;
        const p = api.toCanvas(e, canvas);
        if (d.moved) {
          const sq = squareAt(p.x, p.y);
          if (sq >= 0 && nextTargets().indexOf(sq) >= 0) stepTo(sq, true);
        } else if (d.was) sel = null;
      });
      api.on(window, 'pointercancel', () => { drag = null; });

      api.on(window, 'keydown', (e) => {
        if (api.menuOpen || !canAct()) return;
        const code = e.code;
        let r = cursor >> 3;
        let c = cursor & 7;
        if (code === 'ArrowUp') r--;
        else if (code === 'ArrowDown') r++;
        else if (code === 'ArrowLeft') c--;
        else if (code === 'ArrowRight') c++;
        else if (code === 'Enter' || code === 'Space') { kb = true; activate(cursor); return; }
        else if (code === 'Backspace') { if (sel && !sel.steps.length) sel = null; return; }
        else return;
        kb = true;
        cursor = U.clamp(r, 0, 7) * 8 + U.clamp(c, 0, 7);
        api.sfx('tick');
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        if (anim) {
          anim.t += dt;
          if (anim.t >= anim.dur) {
            anim.t = 0;
            anim.seg++;
            if (anim.seg >= anim.pts.length - 1) {
              const done = anim.onDone;
              anim = null;
              if (done) done();
            } else if (anim.eachHop) anim.eachHop(anim.seg);
          }
        }
        if (rush && (phase === 'play' || phase === 'think') && !api.menuOpen) {
          fuse -= dt;
          const sec = Math.ceil(fuse);
          if (sec < lastTick && sec <= 3 && sec > 0) {
            api.sfx('tick');
            if (!hintedHurry && !isCpu(side)) {
              hintedHurry = true;
              api.setStatus('Hurry! When the fuse runs out you lose a random piece.');
            }
          }
          lastTick = sec;
          if (fuse <= 0 && !anim) fuseOut();
        }
        if (flash) {
          flash.t += dt;
          if (!flash.stay && flash.t > 1.1) flash = null;
        }
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        fizzles.forEach((f) => { f.t += dt; });
        fizzles = fizzles.filter((f) => f.t < 0.8);
      }

      /* ---------- Draw ---------- */
      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX - 10, BY - 10, SQ * 8 + 20, SQ * 8 + 20, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let r = 0; r < 8; r++) {
          for (let c = 0; c < 8; c++) {
            ctx.fillStyle = (r + c) % 2 ? '#2C275E' : '#463E86';
            ctx.fillRect(BX + c * SQ, BY + r * SQ, SQ, SQ);
          }
        }
        // Rush fuse burning along the active player's edge of the board.
        if (rush && (phase === 'play' || phase === 'think')) {
          const frac = U.clamp(fuse / FUSE, 0, 1);
          const y = side === 1 ? BY + SQ * 8 + 5 : BY - 5;
          const len = SQ * 8 * frac;
          ctx.strokeStyle = U.alpha(C.line, 0.9);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(BX, y);
          ctx.lineTo(BX + SQ * 8, y);
          ctx.stroke();
          ctx.strokeStyle = frac > 0.5 ? C.mint : frac > 0.25 ? C.gold : C.p1;
          ctx.beginPath();
          ctx.moveTo(BX, y);
          ctx.lineTo(BX + len, y);
          ctx.stroke();
          const flick = 0.7 + 0.3 * Math.sin(clock * 40);
          ctx.fillStyle = U.alpha(C.gold, 0.4 * flick);
          ctx.beginPath();
          ctx.arc(BX + len, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#FFF4C8';
          ctx.beginPath();
          ctx.arc(BX + len, y, 3.5 * flick, 0, Math.PI * 2);
          ctx.fill();
        }

        // Last move trail.
        if (lastMove && phase !== 'anim') {
          ctx.fillStyle = U.alpha(C.gold, 0.18);
          ctx.fillRect(sqX(lastMove.from), sqY(lastMove.from), SQ, SQ);
          lastMove.path.forEach((s) => {
            ctx.fillStyle = U.alpha(C.gold, 0.26);
            ctx.fillRect(sqX(s), sqY(s), SQ, SQ);
          });
        }

        const human = phase === 'play' && !isCpu(side);
        const forced = human && legal.length && legal[0].caps.length > 0;
        if (sel) {
          ctx.fillStyle = U.alpha(C.violet, 0.5);
          ctx.fillRect(sqX(pieceAt()), sqY(pieceAt()), SQ, SQ);
        }

        // Pieces.
        const hideFrom = sel && sel.steps.length ? sel.from : -1;
        const dragging = drag && drag.moved ? drag.from : -1;
        const ghost = [];
        if (sel) {
          const c0 = candidates()[0];
          if (c0) for (let i = 0; i < sel.steps.length; i++) ghost.push(c0.caps[i]);
        }
        const animHide = anim && phase === 'anim' ? anim.pts[0] : -1;
        for (let sq = 0; sq < 64; sq++) {
          const p = board[sq];
          if (!p || sq === hideFrom || sq === dragging || sq === animHide) continue;
          const x = cx(sq);
          const y = cy(sq);
          const isGhost = ghost.indexOf(sq) >= 0 || (anim && anim.ghostCaps && anim.ghostCaps.indexOf(sq) >= 0);
          if (forced && !sel && movable(sq)) {
            const pulse = 0.5 + 0.5 * Math.sin(clock * 6);
            ctx.fillStyle = U.alpha(C.gold, 0.18 + pulse * 0.25);
            ctx.beginPath();
            ctx.arc(x, y, SQ * 0.47, 0, Math.PI * 2);
            ctx.fill();
          }
          drawDisc(ctx, x, y, SQ * 0.36, p, isGhost ? 0.35 : 1);
        }
        // Mid-chain, the selected piece waits on its latest landing square.
        if (sel && sel.steps.length && !anim) {
          const s = sel.steps[sel.steps.length - 1];
          drawDisc(ctx, cx(s), cy(s), SQ * 0.36, board[sel.from]);
        }

        // Legal targets.
        if (human && sel && !anim) {
          nextTargets().forEach((t) => {
            const cand = candidates().find((m) => m.path[sel.steps.length] === t);
            const jump = cand && cand.caps.length > 0;
            ctx.fillStyle = U.alpha(jump ? C.gold : C.text, 0.4);
            ctx.beginPath();
            ctx.arc(cx(t), cy(t), SQ * (jump ? 0.17 : 0.13), 0, Math.PI * 2);
            ctx.fill();
            if (jump) {
              ctx.strokeStyle = U.alpha(C.gold, 0.7);
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(cx(t), cy(t), SQ * 0.27, 0, Math.PI * 2);
              ctx.stroke();
            }
          });
        }

        // Fizzles: removed pieces shrink and spark.
        fizzles.forEach((f) => {
          const k = f.t / 0.8;
          drawDisc(ctx, cx(f.sq), cy(f.sq) - k * 10, SQ * 0.36 * (1 - k), f.p, 1 - k);
        });

        // Moving piece.
        if (anim) {
          const a = anim.pts[anim.seg];
          const b2 = anim.pts[Math.min(anim.seg + 1, anim.pts.length - 1)];
          const k = U.clamp(anim.t / anim.dur, 0, 1);
          const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
          const x = U.lerp(cx(a), cx(b2), e);
          const y = U.lerp(cy(a), cy(b2), e) - (anim.hop ? Math.sin(k * Math.PI) * 22 : 0);
          const p = anim.p || 1;
          drawDisc(ctx, x, y, SQ * 0.36 * (anim.hop ? 1 + Math.sin(k * Math.PI) * 0.12 : 1), p);
        }
        if (drag && drag.moved && board[drag.from]) drawDisc(ctx, drag.x, drag.y, SQ * 0.4, board[drag.from]);

        if (kb && human) {
          ctx.strokeStyle = C.mint;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -clock * 20;
          ctx.strokeRect(sqX(cursor) + 3, sqY(cursor) + 3, SQ - 6, SQ - 6);
          ctx.setLineDash([]);
        }

        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life * 2, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;

        if (flash) {
          const k = flash.stay ? Math.min(1, flash.t * 4) : Math.max(0, 1 - Math.max(0, flash.t - 0.6) * 2);
          ctx.globalAlpha = k;
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          U.roundRect(ctx, BX + 70, BY + 4 * SQ - 46, SQ * 8 - 140, 92, 18);
          ctx.fill();
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = flash.color;
          ctx.fillText(flash.text, BX + 4 * SQ, BY + 4 * SQ + 2, SQ * 8 - 170);
          ctx.globalAlpha = 1;
        }
        drawPanel();
      }

      function drawBadge(s, x, y, w) {
        const active = (phase === 'play' || phase === 'think') && side === s;
        ctx.fillStyle = active ? U.alpha(colorOf(s), 0.16) : C.panel2;
        U.roundRect(ctx, x, y, w, 112, 12);
        ctx.fill();
        ctx.strokeStyle = active ? colorOf(s) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        const ox = x + 46;
        const oy = y + 56;
        if (rush && active) {
          drawFuseRing(ctx, ox, oy, 34, U.clamp(fuse / FUSE, 0, 1), clock, 6);
        }
        drawDisc(ctx, ox, oy, 22, s);
        if (rush && active) {
          ctx.fillStyle = C.ink;
          ctx.font = '800 16px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.max(0, Math.ceil(fuse))), ox, oy + 1);
        }
        let men = 0;
        let kings = 0;
        for (let i = 0; i < 64; i++) {
          if (board[i] === s) men++;
          else if (board[i] === 2 * s) kings++;
        }
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = FONT;
        ctx.fillStyle = C.text;
        ctx.fillText(nameOf(s), x + 92, y + 36);
        ctx.font = FONT_SM;
        ctx.fillStyle = active ? colorOf(s) : C.muted;
        ctx.fillText(active ? (phase === 'think' ? 'thinking…' : 'to move') : (s === 1 ? 'coral' : 'cyan'), x + 92, y + 54);
        ctx.fillStyle = C.muted;
        ctx.fillText(men + ' men · ' + kings + ' kings', x + 92, y + 76);
        ctx.fillText('took ' + taken[s], x + 92, y + 94);
      }

      function drawPanel() {
        const x = PX;
        const y = BY - 10;
        const w = PW;
        const h = SQ * 8 + 20;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        drawBadge(-1, x + 12, y + 12, w - 24);
        drawBadge(1, x + 12, y + h - 124, w - 24);
        const my = y + 150;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = FONT_SM;
        ctx.fillStyle = rush ? C.gold : C.muted;
        ctx.fillText(rush ? 'Rush mode · 10 s fuse' : 'Classic', x + 18, my);
        ctx.fillStyle = C.muted;
        ctx.fillText(vsCpu ? 'vs computer · ' + level : '2 players', x + 18, my + 20);
        // Quiet-move meter toward the draw.
        ctx.fillText('No capture for', x + 18, my + 56);
        ctx.fillStyle = quiet > QUIET_LIMIT * 0.75 ? C.p1 : C.text;
        ctx.font = FONT;
        ctx.fillText(quiet + ' / ' + QUIET_LIMIT, x + 18, my + 74);
        ctx.fillStyle = C.line;
        U.roundRect(ctx, x + 18, my + 98, w - 36, 8, 4);
        ctx.fill();
        ctx.fillStyle = quiet > QUIET_LIMIT * 0.75 ? C.p1 : C.violet;
        U.roundRect(ctx, x + 18, my + 98, Math.max(8, (w - 36) * Math.min(1, quiet / QUIET_LIMIT)), 8, 4);
        ctx.fill();
        ctx.font = FONT_SM;
        ctx.fillStyle = U.alpha(C.muted, 0.85);
        const tip = rush ? ['Beat the fuse or lose', 'a random piece.'] : ['Captures are mandatory.', 'Kings move both ways.'];
        ctx.fillText(tip[0], x + 18, my + 128);
        ctx.fillText(tip[1], x + 18, my + 146);
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
