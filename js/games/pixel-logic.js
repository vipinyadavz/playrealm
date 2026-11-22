/* Pixel Logic — nonogram puzzles. Number clues tell you the runs of filled cells in each
   row and column. Every solved picture becomes one tile of a 4×4 beach mosaic.
   See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 860;
  const H = 600;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const FILLED = '#E7E2FF';
  const THICK = '#6A62B8';
  const LONG_PRESS = 0.45;
  /* Mosaic rows: sky, sea, dry sand, wet sand. Empty cells of a solved tile take this color. */
  const BG = ['#7CCBF2', '#2E86C9', '#F5DDA0', '#E9BF73'];
  const MOVES = {
    ArrowUp: [0, -1], KeyW: [0, -1],
    ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0],
    ArrowRight: [1, 0], KeyD: [1, 0]
  };

  /* ---------- The 16 pictures (all checked: unique and solvable line by line) ---------- */

  const RAW = [
    { name: 'Sun', pal: 'y:#FFE066 o:#FFB627 w:#FFF3C4', rows: [
      '....yy....',
      '....yy....',
      '..owoooo..',
      '.owoooooo.',
      'yoo.oo.ooy',
      'yooooooooy',
      '.ooo..ooo.',
      '..oooooo..',
      '....yy....',
      '....yy....'] },
    { name: 'Gull', pal: 'k:#3A3550 g:#9AA3B8 w:#FFFFFF y:#FFB627 c:#E4F5FF', rows: [
      '..........',
      '......kkk.',
      '.....ggg..',
      '.wk.ggg...',
      'ywwwgg....',
      '.wwwwwwww.',
      '..wwwwwwgg',
      '...wwww...',
      '.........c',
      '.cc....ccc'] },
    { name: 'Kite', pal: 'r:#FF5D73 b:#2F6FDB y:#FFC53D g:#2FBF71 k:#3A3550 p:#9B7BFF', rows: [
      '....r.....',
      '...rrb....',
      '..rrrbb...',
      '.rrrrbbb..',
      '..yyygg...',
      '...yyg....',
      '....y.....',
      '.....k....',
      '....pkp...',
      '.....k....'] },
    { name: 'Balloon', pal: 'r:#FF5D73 y:#FFC53D k:#5A4A3A b:#A0703C w:#FFFFFF', rows: [
      '.....rrrrr.....',
      '...rryyyyyrr...',
      '..ryyyrrryyyr..',
      '.rryyrrrrryyrr.',
      '.ryyrrrrrrryyr.',
      '.ryyrrrrrrryyr.',
      '.rryyrrrrryyrr.',
      '..ryyyrrryyyr..',
      '...rryyyyyrr...',
      '....rryyyrr....',
      '.....k...k.....',
      '.ww...k.k......',
      'wwww.bbbbb.....',
      '.....bbbbb.....',
      '......bbb......'] },
    { name: 'Sailboat', pal: 'r:#FF5D73 k:#6B4A2E w:#FFFFFF b:#8B5A2B n:#FFC53D c:#BFEFFF', rows: [
      '.......rr......',
      '.......k.......',
      '.....w.k.......',
      '....ww.k.w.....',
      '...www.k.ww....',
      '..wwww.k.www...',
      '.wwwww.k.wwww..',
      'wwwwww.k.wwwww.',
      '.......k.......',
      'bbbbbbbbbbbbbbb',
      '.bbbbbbbbbbbbb.',
      '..bnbnbnbnbnb..',
      '...............',
      '.cc..ccc..ccc..',
      'ccccccccccccccc'] },
    { name: 'Lighthouse', pal: 'r:#E8414F y:#FFE066 k:#2A2840 w:#FFFFFF g:#56655A', rows: [
      '.......r.......',
      '......rrr......',
      'yyy..kyyyk..yyy',
      '.....kyyyk.....',
      '.....kkkkk.....',
      '......rrr......',
      '......www......',
      '.....rrrrr.....',
      '.....wwwww.....',
      '.....rr.rr.....',
      '....www.www....',
      '....rrrrrrr....',
      '..ggggggggggg..',
      '.ggggggggggggg.',
      'ggggggggggggggg'] },
    { name: 'Whale', pal: 'c:#BFEFFF b:#22417F w:#E6EEFF', rows: [
      '...c.c....',
      '....c.....',
      '....c.....',
      '..bbbbb..b',
      '.bbbbbbb.b',
      'bb.bbbbbbb',
      'bbbbbbbbb.',
      'wwwwwbbb..',
      '.wwww.....',
      'cc..cc..cc'] },
    { name: 'Clownfish', pal: 'c:#BFEFFF o:#FF8A3D w:#FFFFFF', rows: [
      '.......c..',
      '...ooo....',
      '.ooowoo..o',
      'o.oowooooo',
      'ooowwoooo.',
      'ooowwoooo.',
      '.oowwooooo',
      '..ooooo..o',
      '...oo.....',
      '..........'] },
    { name: 'Palm tree', pal: 'g:#2FBF71 t:#8B5A2B c:#5E3A1C s:#DDB15A', rows: [
      '....ggg.ggg....',
      '..ggggg.ggggg..',
      '.gg..ggggg..gg.',
      'g...gg.t.gg...g',
      '...g..ctc..g...',
      '.......tt......',
      '.......tt......',
      '........tt.....',
      '........tt.....',
      '.......tt......',
      '.......tt......',
      '......tt.......',
      '....sssssss....',
      '..sssssssssss..',
      'sssssssssssssss'] },
    { name: 'Umbrella', pal: 'k:#3A3550 r:#FF5D73 w:#FFFFFF p:#9B7BFF y:#FFC53D s:#DDB15A', rows: [
      '.......k.......',
      '.....rrwrr.....',
      '...rrrwwwrrr...',
      '..wrrrwwwrrrw..',
      '.wwrrrwwwrrrww.',
      '.wwrrrwwwrrrww.',
      'wwwrrrwwwrrrwww',
      'ww.rr.wkw.rr.ww',
      '.......k.......',
      '.......k.......',
      '.......k.......',
      '.......k.......',
      '.pypyp.k.......',
      '.pypyp.k.......',
      'sssssssssssssss'] },
    { name: 'Beach ball', pal: 'r:#FF5D73 y:#FFB000 b:#2F8FE0 g:#2FBF71 w:#FFFFFF', rows: [
      '...rryy...',
      '.rrrryyyy.',
      '.r.rryyyy.',
      'rr.rryyyyy',
      'rrrrrwwyyy',
      'bbbbbwwggg',
      'bbbbbggggg',
      '.bbbbgggg.',
      '.bbbbgggg.',
      '...bbgg...'] },
    { name: 'Sandcastle', pal: 'r:#FF5D73 k:#5A4A3A s:#CF9644 c:#7FD6F5', rows: [
      '...rr......rr..',
      '...k.......k...',
      '...k.......k...',
      '.s.s.s...s.s.s.',
      '.sssss...sssss.',
      '.ss.ss...ss.ss.',
      '.sssss.s.sssss.',
      '.sssssssssssss.',
      '.sssssssssssss.',
      '.ssssss.ssssss.',
      '.sssss...sssss.',
      '.sssss...sssss.',
      'ssssss...ssssss',
      'sssssssssssssss',
      'cc...........cc'] },
    { name: 'Crab', pal: 'r:#E8414F w:#FFFFFF k:#1E1B3A', rows: [
      '.rr.........rr.',
      'r..r.......r..r',
      'rr.r.......r.rr',
      '.rrr.......rrr.',
      '..r..w...w..r..',
      '..r..k...k..r..',
      '...rrrrrrrrr...',
      '..rrrrrrrrrrr..',
      'r.rrrrrrrrrrr.r',
      '.rrrrr...rrrrr.',
      'r.rrrrrrrrrrr.r',
      '.r.rrrrrrrrr.r.',
      'r..rr.....rr..r',
      '...r.......r...',
      '...............'] },
    { name: 'Shell', pal: 'p:#FF9EB5 q:#E86F92', rows: [
      '..pppppp..',
      '.pppppppp.',
      'pp.pppp.pp',
      'pp.pppp.pp',
      'ppp.pp.ppp',
      '.pp.pp.pp.',
      '..pp..pp..',
      '...pppp...',
      '.qqqqqqqq.',
      '..qqqqqq..'] },
    { name: 'Starfish', pal: 'o:#FF6B4A y:#FFD08A', rows: [
      '....oo....',
      '....oo....',
      '...oyyo...',
      'oooooooooo',
      '.oooyyooo.',
      '..oooooo..',
      '..oooooo..',
      '.ooo..ooo.',
      '.oo....oo.',
      'oo......oo'] },
    { name: 'Ice cream', pal: 'k:#3F8F3F r:#E8414F p:#FF9EC4 w:#FFFFFF m:#7FE0B8 c:#B5762E', rows: [
      '........k......',
      '.......rr......',
      '....ppprrpp....',
      '...ppppppppp...',
      '..ppwpppppppp..',
      '..ppppppppppp..',
      '.mpmmmpmmmmpmm.',
      '.mmmmmmmmmmmmm.',
      '..m.mmmmmmm.m..',
      '..ccccccccccc..',
      '...c.c.c.c.c...',
      '...ccccccccc...',
      '....c.c.c.c....',
      '.....ccccc.....',
      '......ccc......'] }
  ];

  function runsOf(line) {
    const out = [];
    let run = 0;
    for (const v of line) {
      if (v) run++;
      else if (run) {
        out.push(run);
        run = 0;
      }
    }
    if (run) out.push(run);
    return out;
  }

  const PICS = RAW.map((p, k) => {
    const n = p.rows.length;
    const pal = {};
    p.pal.split(' ').forEach((s) => {
      const parts = s.split(':');
      pal[parts[0]] = parts[1];
    });
    const sol = new Uint8Array(n * n);
    const color = new Array(n * n).fill(null);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const ch = p.rows[r][c] || '.';
        if (ch === '.') continue;
        sol[r * n + c] = 1;
        color[r * n + c] = pal[ch] || '#FFFFFF';
      }
    }
    const rowClues = [];
    const colClues = [];
    for (let r = 0; r < n; r++) rowClues.push(runsOf(Array.from(sol.slice(r * n, r * n + n))));
    for (let c = 0; c < n; c++) {
      const col = [];
      for (let r = 0; r < n; r++) col.push(sol[r * n + c]);
      colClues.push(runsOf(col));
    }
    return { k, name: p.name, n, sol, color, bg: BG[k >> 2], rowClues, colClues };
  });

  /* Progress lives for the page session (no storage): which tiles are solved, boards in progress. */
  const session = {
    solved: new Array(PICS.length).fill(false),
    boards: new Array(PICS.length).fill(null),
    check: false,
    fresh: -1,
    told: {}
  };
  const solvedCount = () => session.solved.filter(Boolean).length;

  /* ---------- Drawing helpers ---------- */

  /* A finished picture: background color plus its pixels. alpha fades the whole tile. */
  function drawPicture(ctx, pic, x, y, size) {
    const n = pic.n;
    const s = size / n;
    ctx.fillStyle = pic.bg;
    ctx.fillRect(x, y, size, size);
    for (let i = 0; i < n * n; i++) {
      if (!pic.sol[i]) continue;
      ctx.fillStyle = pic.color[i];
      const px = x + (i % n) * s;
      const py = y + ((i / n) | 0) * s;
      ctx.fillRect(Math.floor(px), Math.floor(py), Math.ceil(s + 0.5), Math.ceil(s + 0.5));
    }
  }

  function drawMystery(ctx, pic, x, y, size, board) {
    ctx.fillStyle = C.panel2;
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = U.alpha(C.line, 0.9);
    ctx.lineWidth = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, size, size);
    ctx.clip();
    ctx.beginPath();
    for (let d = -size; d < size; d += 12) {
      ctx.moveTo(x + d, y + size);
      ctx.lineTo(x + d + size, y);
    }
    ctx.stroke();
    if (board) {
      const n = pic.n;
      const s = size / n;
      ctx.fillStyle = U.alpha(C.muted, 0.55);
      for (let i = 0; i < n * n; i++) {
        if (board.cells[i] !== 1) continue;
        ctx.fillRect(x + (i % n) * s, y + ((i / n) | 0) * s, Math.ceil(s), Math.ceil(s));
      }
    }
    ctx.restore();
    ctx.font = '800 ' + Math.round(size * 0.34) + 'px Unbounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = U.alpha(C.muted, 0.8);
    ctx.fillText('?', x + size / 2, y + size / 2 - size * 0.04);
    ctx.font = '600 ' + Math.max(9, Math.round(size * 0.1)) + 'px "JetBrains Mono", monospace';
    ctx.fillStyle = C.muted;
    ctx.fillText(pic.n + '×' + pic.n, x + size / 2, y + size * 0.82);
  }

  const THUMB_SOLVED = [0, 1, 3, 4, 5, 6, 8, 9, 12, 13, 15];

  Arcade.register({
    id: 'pixel-logic',
    title: 'Pixel Logic',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    color: C.mint,
    tagline: 'Use number clues to fill in the grid and uncover a hidden pixel picture.',
    hook: 'Each solved puzzle becomes one tile of a bigger mosaic picture.',
    tags: ['puzzle', 'logic', 'nonogram', 'picture', 'pixel', 'grid', 'mosaic', 'mouse', 'touch', 'keyboard'],
    howTo: 'The numbers beside each row and above each column list the runs of filled cells in that line, in order. ' +
      '"3 1" means a run of three, at least one gap, then a single cell. Fill cells to match every clue, and mark cells ' +
      'you know are empty with an ×. Drag to paint a whole line at once. A clue dims when its line matches. ' +
      'The twist: the 16 pictures are tiles of one big beach scene. Each one you solve drops into the mosaic in color, ' +
      'and you can pick any tile from the gallery. Turn on Check if you want wrong fills caught and counted.',
    controls: [
      { keys: ['Click', 'Drag'], label: 'Fill cells (drag paints a line)' },
      { keys: ['Right-click', 'Hold'], label: 'Mark a cell as empty' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor (WASD works too)' },
      { keys: ['Space', 'Enter'], label: 'Fill at the cursor (hold and move to paint)' },
      { keys: ['X'], label: 'Mark at the cursor (hold and move to paint)' },
      { keys: ['Z', 'Backspace'], label: 'Undo / clear a cell' },
      { keys: ['C', 'G', 'R'], label: 'Check on/off, gallery, clear puzzle' }
    ],
    best: 'high',
    formatScore: (n) => n + ' solved',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const size = h - 24;
      const tile = size / 4;
      const mx = 14;
      const my = 12;
      for (let k = 0; k < 16; k++) {
        const x = mx + (k % 4) * tile;
        const y = my + ((k / 4) | 0) * tile;
        if (THUMB_SOLVED.includes(k)) drawPicture(ctx, PICS[k], x, y, tile);
        else drawMystery(ctx, PICS[k], x + 1, y + 1, tile - 2, null);
      }
      ctx.strokeStyle = C.mint;
      ctx.lineWidth = 2;
      ctx.strokeRect(mx - 1, my - 1, size + 2, size + 2);
      // The kite tile, freshly solved, glides toward its empty slot.
      const target = { x: mx + 2 * tile, y: my };
      const k = (t % 4) / 4;
      const glide = t === 0 ? 0 : Math.min(1, Math.max(0, (k - 0.55) / 0.35));
      const big = Math.min(w - mx - size - 34, 104);
      const sx = mx + size + 20;
      const sy = (h - big) / 2;
      const e = glide * glide * (3 - 2 * glide);
      const x = U.lerp(sx, target.x, e);
      const y = U.lerp(sy, target.y, e);
      const sz = U.lerp(big, tile, e);
      ctx.shadowColor = C.mint;
      ctx.shadowBlur = 14 + Math.sin(t * 4) * 4;
      drawPicture(ctx, PICS[2], x, y, sz);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, sz, sz);
      if (glide < 0.05) {
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = U.alpha(C.mint, 0.9);
        ctx.strokeRect(target.x + 2, target.y + 2, tile - 4, tile - 4);
        ctx.setLineDash([]);
      }
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      // Play-screen side panel.
      const PX = 644;
      const PW = W - PX - 20;
      const infoBox = { x: PX, y: 20, w: PW, h: 66 };
      const previewBox = { x: PX, y: 96, w: PW, h: 142 };
      const btn = (y, id) => ({ x: PX, y, w: PW, h: 44, id });
      const playButtons = [btn(250, 'mode'), btn(302, 'check'), btn(354, 'undo'), btn(406, 'clear'), btn(458, 'gallery')];
      const statsBox = { x: PX, y: 514, w: PW, h: 66 };
      // Gallery layout.
      const MOS = 512;
      const MX = 28;
      const MY = Math.round((H - MOS) / 2) + 6;
      const TILE = MOS / 4;
      const galleryPlay = { x: 600, y: 470, w: 232, h: 52, id: 'play' };

      let state = 'menu'; // 'menu' | 'gallery' | 'play' | 'reveal' | 'done'
      let cur = 0;
      let pz = PICS[0];
      let board = null;
      let cells = new Uint8Array(100);
      let cellT = new Float32Array(100);
      let L = null;
      let rowOk = [];
      let colOk = [];
      let cursor = { x: 0, y: 0 };
      let kb = false;
      let hover = -1;
      let hoverBtn = null;
      let pressedBtn = null;
      let focus = 0;
      let stroke = null;
      let keyStroke = null;
      let undoStack = [];
      let mode = 'fill';
      let clock = 0;
      let revealT = 0;
      let galleryT = 0;
      let solveBest = false;
      let particles = [];
      let errFlash = 0;
      let lastTick = 0;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';

      const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      const firstUnsolved = () => {
        const k = session.solved.indexOf(false);
        return k < 0 ? 0 : k;
      };
      const nextUnsolved = (from) => {
        for (let d = 1; d <= PICS.length; d++) {
          const k = (from + d) % PICS.length;
          if (!session.solved[k]) return k;
        }
        return (from + 1) % PICS.length;
      };

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function layout(p) {
        const n = p.n;
        const maxR = Math.max(...p.rowClues.map((c) => Math.max(1, c.length)));
        const maxC = Math.max(...p.colClues.map((c) => Math.max(1, c.length)));
        const areaW = PX - 40;
        const areaH = H - 40;
        let cell = 44;
        let cs = 22;
        for (; cell > 16; cell--) {
          cs = U.clamp(Math.round(cell * 0.62), 14, 22);
          if (maxR * cs + 14 + n * cell <= areaW && maxC * cs + 14 + n * cell <= areaH) break;
        }
        const clueW = maxR * cs + 14;
        const clueH = maxC * cs + 14;
        const ox = 20 + Math.round((areaW - (clueW + n * cell)) / 2) + clueW;
        const oy = 20 + Math.round((areaH - (clueH + n * cell)) / 2) + clueH;
        return { n, cell, cs, clueW, clueH, ox, oy, size: n * cell };
      }

      function refresh() {
        const n = pz.n;
        rowOk = [];
        colOk = [];
        for (let r = 0; r < n; r++) {
          const line = [];
          for (let c = 0; c < n; c++) line.push(cells[r * n + c] === 1 ? 1 : 0);
          rowOk.push(sameClue(runsOf(line), pz.rowClues[r]));
        }
        for (let c = 0; c < n; c++) {
          const line = [];
          for (let r = 0; r < n; r++) line.push(cells[r * n + c] === 1 ? 1 : 0);
          colOk.push(sameClue(runsOf(line), pz.colClues[c]));
        }
      }

      function sameClue(a, b) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      }

      function openPuzzle(k) {
        cur = k;
        pz = PICS[k];
        let b = session.boards[k];
        if (!b || b.done) {
          b = { cells: new Uint8Array(pz.n * pz.n), mistakes: 0, time: 0, done: false };
          session.boards[k] = b;
        }
        board = b;
        cells = b.cells;
        cellT = new Float32Array(pz.n * pz.n).fill(-10);
        L = layout(pz);
        cursor = { x: 0, y: 0 };
        hover = -1;
        stroke = null;
        keyStroke = null;
        undoStack = [];
        revealT = 0;
        particles = [];
        errFlash = 0;
        lastStatus = '';
        refresh();
        state = 'play';
        api.hideMenu();
        api.setScore(solvedCount());
        if (!session.told.controls) {
          session.told.controls = true;
          setHint((api.isTouch ? 'Tap to fill, hold to mark ×' : 'Click to fill, right-click to mark ×') +
            '. Drag to paint a line. Clues dim when a line is right.', 8);
        } else {
          setHint('Puzzle ' + (k + 1) + ' of 16 · ' + pz.n + '×' + pz.n + (session.solved[k] ? ' · ' + pz.name : ''), 4);
        }
      }

      function showGallery() {
        state = 'gallery';
        galleryT = 0;
        stroke = null;
        keyStroke = null;
        api.hideMenu();
        focus = session.fresh >= 0 ? session.fresh : firstUnsolved();
        api.setScore(solvedCount());
        setHint(solvedCount() === 16 ? 'The beach is complete! Pick any tile to play it again.'
          : 'Pick any tile to play it. Solved pictures fill in the beach scene.', 6);
      }

      function showStart() {
        state = 'menu';
        const count = solvedCount();
        const next = firstUnsolved();
        api.menu({
          title: 'Pixel Logic',
          text: 'Use the number clues to fill the right cells and uncover a pixel picture. ' +
            'Each picture you solve becomes one tile of a 4×4 beach mosaic.' +
            (count ? '\n' + count + ' of 16 tiles solved this session.' : ''),
          buttons: [
            count === 16
              ? { label: 'View mosaic', primary: true, onClick: showGallery }
              : { label: 'Play puzzle ' + (next + 1), primary: true, onClick: () => openPuzzle(next) },
            { label: 'Mosaic gallery', onClick: showGallery }
          ]
        });
      }

      function burst(x, y, n, colors, speed) {
        for (let k = 0; k < n && particles.length < 500; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: U.rand(0.6, 1.2), size: U.rand(3, 6), color: U.pick(colors) });
        }
      }

      /* ---------- Editing ---------- */

      function setCell(i, next, rec) {
        const prev = cells[i];
        if (prev === next) return;
        if (next === 1 && session.check && !pz.sol[i]) {
          // Check mode: a wrong fill becomes a red × and counts as a mistake.
          next = 3;
          board.mistakes++;
          errFlash = 1;
          api.sfx('hit');
          if (!session.told.check) {
            session.told.check = true;
            setHint('That cell is empty in the picture, so Check marked it with a red ×.', 5);
          }
        } else if (clock - lastTick > 0.04) {
          api.sfx(next === 1 ? 'tick' : 'blip');
          lastTick = clock;
        }
        rec.push({ i, prev });
        cells[i] = next;
        cellT[i] = clock;
      }

      /* Applies a stroke action to one cell; only cells in the matching state change. */
      function applyAction(action, i, rec) {
        const v = cells[i];
        if (action === 'fill' && v === 0) setCell(i, 1, rec);
        else if (action === 'unfill' && v === 1) setCell(i, 0, rec);
        else if (action === 'mark' && v === 0) setCell(i, 2, rec);
        else if (action === 'unmark' && (v === 2 || v === 3)) setCell(i, 0, rec);
      }

      function actionFor(i, mark) {
        const v = cells[i];
        if (mark) return v === 2 || v === 3 ? 'unmark' : 'mark';
        return v === 1 ? 'unfill' : 'fill';
      }

      function commit(rec) {
        if (rec.length) {
          undoStack.push(rec);
          if (undoStack.length > 300) undoStack.shift();
        }
        refresh();
        checkSolved();
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
          cells[rec[k].i] = rec[k].prev;
          cellT[rec[k].i] = clock;
        }
        api.sfx('flip');
        refresh();
      }

      function clearBoard() {
        if (state !== 'play') return;
        const rec = [];
        for (let i = 0; i < cells.length; i++) {
          if (cells[i]) {
            rec.push({ i, prev: cells[i] });
            cells[i] = 0;
          }
        }
        if (!rec.length) return;
        undoStack.push(rec);
        api.sfx('flip');
        setHint('Puzzle cleared. Press Z to bring it back.', 3);
        refresh();
      }

      function toggleCheck() {
        session.check = !session.check;
        api.sfx('flip');
        setHint(session.check ? 'Check on: wrong fills are caught, marked with a red × and counted.'
          : 'Check off: nothing is checked until the picture is complete.', 4);
      }

      function toggleMode() {
        mode = mode === 'fill' ? 'mark' : 'fill';
        api.sfx('flip');
        setHint(mode === 'fill' ? 'Taps fill cells.' : 'Taps mark cells with ×.', 3);
      }

      function checkSolved() {
        if (state !== 'play') return;
        if (!rowOk.every(Boolean) || !colOk.every(Boolean)) return;
        state = 'reveal';
        revealT = 0;
        stroke = null;
        keyStroke = null;
        board.done = true;
        const isNew = !session.solved[cur];
        session.solved[cur] = true;
        const count = solvedCount();
        api.setScore(count);
        solveBest = isNew ? api.reportScore(count) : false;
        if (isNew) session.fresh = cur;
        api.sfx('win');
        if (!session.told.mosaic) {
          session.told.mosaic = true;
          setHint('Solved! This picture is one tile of the beach mosaic. Open the gallery to watch it grow.', 8);
        } else {
          setHint(pz.name + '! ' + count + ' of 16 mosaic tiles are in place.', 6);
        }
      }

      function showSolvedMenu() {
        state = 'done';
        const count = solvedCount();
        const all = count === PICS.length;
        const text = all
          ? 'All 16 tiles are in place: the whole beach day is complete.'
          : pz.name + ' joins the mosaic. ' + count + ' of 16 tiles are in place.' +
            (session.check ? ' Mistakes caught: ' + board.mistakes + '.' : '');
        api.setStatus(text);
        lastStatus = text;
        api.menu({
          title: solveBest ? 'New best: ' + count + '!' : all ? 'Mosaic complete!' : 'Solved: ' + pz.name,
          text,
          buttons: all
            ? [{ label: 'View mosaic', primary: true, onClick: showGallery }]
            : [
              { label: 'Next puzzle', primary: true, onClick: () => openPuzzle(nextUnsolved(cur)) },
              { label: 'Mosaic gallery', onClick: showGallery }
            ]
        });
      }

      /* ---------- Geometry ---------- */

      function cellAt(p) {
        if (!L) return -1;
        const c = Math.floor((p.x - L.ox) / L.cell);
        const r = Math.floor((p.y - L.oy) / L.cell);
        if (c < 0 || r < 0 || c >= L.n || r >= L.n) return -1;
        return r * L.n + c;
      }

      function tileAt(p) {
        const c = Math.floor((p.x - MX) / TILE);
        const r = Math.floor((p.y - MY) / TILE);
        if (c < 0 || r < 0 || c > 3 || r > 3) return -1;
        return r * 4 + c;
      }

      /* Cells from a to b along one row or column, inclusive. */
      function lineCells(a, b) {
        const n = L.n;
        const out = [];
        const ar = (a / n) | 0;
        const ac = a % n;
        const br = (b / n) | 0;
        const bc = b % n;
        if (ar === br) {
          const step = bc >= ac ? 1 : -1;
          for (let c = ac; c !== bc + step; c += step) out.push(ar * n + c);
        } else if (ac === bc) {
          const step = br >= ar ? 1 : -1;
          for (let r = ar; r !== br + step; r += step) out.push(r * n + ac);
        } else out.push(b);
        return out;
      }

      /* ---------- Pointer input ---------- */

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());

      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        if (state === 'gallery') {
          const k = tileAt(p);
          if (k >= 0) {
            focus = k;
            openPuzzle(k);
          } else if (inRect(p, galleryPlay)) {
            openPuzzle(focus);
          }
          return;
        }
        if (state !== 'play') return;
        const b = playButtons.find((r) => inRect(p, r));
        if (b) {
          pressedBtn = b;
          return;
        }
        const i = cellAt(p);
        if (i < 0) return;
        if (stroke) endStroke();
        if (state !== 'play') return;
        kb = false;
        hover = i;
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
        const mark = e.button === 2 || mode === 'mark';
        const action = actionFor(i, mark);
        // On touch the first cell waits: holding still turns the tap into a mark instead.
        const wait = e.pointerType !== 'mouse' && !mark;
        stroke = { action, start: i, last: i, rec: [], t0: clock, moved: false, wait };
        if (!wait) applyAction(action, i, stroke.rec);
      });

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        if (state === 'gallery') {
          const k = tileAt(p);
          if (k >= 0) focus = k;
          hoverBtn = inRect(p, galleryPlay) ? galleryPlay : null;
          return;
        }
        if (state !== 'play') return;
        hoverBtn = playButtons.find((r) => inRect(p, r)) || null;
        const i = cellAt(p);
        if (i >= 0) {
          if (i !== hover) kb = false;
          hover = i;
        }
        if (!stroke) return;
        // Lock the drag to the start cell's row or column.
        const n = L.n;
        const sr = (stroke.start / n) | 0;
        const sc = stroke.start % n;
        const cx = U.clamp(Math.floor((p.x - L.ox) / L.cell), 0, n - 1);
        const cy = U.clamp(Math.floor((p.y - L.oy) / L.cell), 0, n - 1);
        if (!stroke.axis) {
          if (cx === sc && cy === sr) return;
          stroke.axis = Math.abs(cx - sc) >= Math.abs(cy - sr) ? 'row' : 'col';
        }
        const target = stroke.axis === 'row' ? sr * n + cx : cy * n + sc;
        if (target === stroke.last) return;
        stroke.moved = true;
        if (stroke.wait) {
          stroke.wait = false;
          applyAction(stroke.action, stroke.start, stroke.rec);
        }
        for (const j of lineCells(stroke.last, target)) applyAction(stroke.action, j, stroke.rec);
        stroke.last = target;
      });

      function endStroke() {
        if (!stroke) return;
        if (stroke.wait) applyAction(stroke.action, stroke.start, stroke.rec);
        const rec = stroke.rec;
        stroke = null;
        commit(rec);
      }
      api.on(canvas, 'pointerup', (e) => {
        const p = api.toCanvas(e, canvas);
        const b = pressedBtn;
        pressedBtn = null;
        if (b && state === 'play' && inRect(p, b)) {
          if (b.id === 'mode') toggleMode();
          else if (b.id === 'check') toggleCheck();
          else if (b.id === 'undo') undo();
          else if (b.id === 'clear') clearBoard();
          else if (b.id === 'gallery') showGallery();
          return;
        }
        endStroke();
      });
      api.on(canvas, 'pointercancel', () => {
        pressedBtn = null;
        endStroke();
      });

      /* ---------- Keyboard input ---------- */

      function keyAct(code, mark) {
        if (!L) return;
        const i = cursor.y * L.n + cursor.x;
        const action = actionFor(i, mark);
        keyStroke = { code, action, rec: [] };
        applyAction(action, i, keyStroke.rec);
        refresh();
      }

      function endKeyStroke() {
        if (!keyStroke) return;
        const rec = keyStroke.rec;
        keyStroke = null;
        commit(rec);
      }

      api.on(window, 'keydown', (e) => {
        if (state === 'gallery') {
          const mv = MOVES[e.code];
          if (mv) {
            const x = U.clamp((focus % 4) + mv[0], 0, 3);
            const y = U.clamp(((focus / 4) | 0) + mv[1], 0, 3);
            focus = y * 4 + x;
            api.sfx('tick');
          } else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
            openPuzzle(focus);
          }
          return;
        }
        if (state !== 'play') return;
        const mv = MOVES[e.code];
        if (mv) {
          if (!kb && hover >= 0) cursor = { x: hover % L.n, y: (hover / L.n) | 0 };
          else {
            cursor.x = U.clamp(cursor.x + mv[0], 0, L.n - 1);
            cursor.y = U.clamp(cursor.y + mv[1], 0, L.n - 1);
          }
          kb = true;
          if (keyStroke) {
            applyAction(keyStroke.action, cursor.y * L.n + cursor.x, keyStroke.rec);
            refresh();
          }
          return;
        }
        if (e.repeat) return;
        // Keys act on the hovered cell if the mouse was used last.
        if (!kb && hover >= 0 && ['Space', 'Enter', 'KeyX', 'Backspace', 'Delete'].includes(e.code)) {
          cursor = { x: hover % L.n, y: (hover / L.n) | 0 };
        }
        if (e.code === 'Space' || e.code === 'Enter') {
          kb = true;
          endKeyStroke();
          if (state === 'play') keyAct(e.code, false);
        } else if (e.code === 'KeyX') {
          kb = true;
          endKeyStroke();
          if (state === 'play') keyAct(e.code, true);
        } else if (e.code === 'Backspace' || e.code === 'Delete') {
          const i = cursor.y * L.n + cursor.x;
          if (cells[i]) {
            const rec = [];
            rec.push({ i, prev: cells[i] });
            cells[i] = 0;
            cellT[i] = clock;
            api.sfx('blip');
            commit(rec);
          }
        } else if (e.code === 'KeyZ') {
          endKeyStroke();
          undo();
        } else if (e.code === 'KeyC') toggleCheck();
        else if (e.code === 'KeyG') {
          endKeyStroke();
          if (state === 'play') showGallery();
        } else if (e.code === 'KeyR') {
          endKeyStroke();
          clearBoard();
        } else if (e.code === 'KeyM') toggleMode();
      });

      api.on(window, 'keyup', (e) => {
        if (keyStroke && e.code === keyStroke.code) endKeyStroke();
      });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        hintT = Math.max(0, hintT - dt);
        errFlash = Math.max(0, errFlash - dt * 2.5);
        for (const p of particles) {
          p.vy += 380 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);

        if (state === 'play') {
          if (board) board.time += dt;
          // Held key released while paused: finish the stroke.
          if (keyStroke && !api.keys.has(keyStroke.code)) endKeyStroke();
          // Touch: holding still turns a fill into a mark.
          if (stroke && stroke.wait && clock - stroke.t0 >= LONG_PRESS) {
            stroke.wait = false;
            stroke.action = actionFor(stroke.start, true);
            applyAction(stroke.action, stroke.start, stroke.rec);
            api.sfx('flip');
          }
        }
        if (state === 'reveal') {
          const before = revealT;
          revealT += dt;
          if (before < 0.9 && revealT >= 0.9) {
            for (let n = 0; n < 6; n++) {
              burst(L.ox + Math.random() * L.size, L.oy + Math.random() * L.size * 0.6, 16,
                [pz.color.find(Boolean) || C.mint, C.gold, C.mint, C.text, pz.bg], 300);
            }
            api.sfx('score');
          }
          if (revealT >= 2.6) showSolvedMenu();
        }
        if (state === 'gallery') {
          const before = galleryT;
          galleryT += dt;
          if (session.fresh >= 0 && before < 0.55 && galleryT >= 0.55) api.sfx('hit');
          if (session.fresh >= 0 && galleryT > 1.4) session.fresh = -1;
        }

        if (state === 'play' || state === 'reveal' || state === 'gallery') {
          let status = hint;
          if (hintT <= 0) {
            if (state === 'gallery') {
              status = 'Mosaic ' + solvedCount() + '/16 · Arrow keys + Enter or click a tile';
            } else {
              status = 'Puzzle ' + (cur + 1) + '/16 · ' + pz.n + '×' + pz.n + ' · ' +
                (mode === 'fill' ? 'Tap fills' : 'Tap marks ×') + ' · Check ' + (session.check ? 'on' : 'off') +
                (session.check ? ' · Mistakes ' + board.mistakes : '');
            }
          }
          if (status !== lastStatus) {
            api.setStatus(status);
            lastStatus = status;
          }
        }
      }

      /* ---------- Draw: play screen ---------- */

      function drawCross(x, y, s, color, a) {
        ctx.strokeStyle = U.alpha(color, a);
        ctx.lineWidth = Math.max(1.5, s * 0.09);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + s * 0.3, y + s * 0.3);
        ctx.lineTo(x + s * 0.7, y + s * 0.7);
        ctx.moveTo(x + s * 0.7, y + s * 0.3);
        ctx.lineTo(x + s * 0.3, y + s * 0.7);
        ctx.stroke();
      }

      function drawPlay() {
        const n = L.n;
        const s = L.cell;
        const revealing = state === 'reveal' || state === 'done';
        const rk = revealing ? Math.min(1, revealT / 0.6) : 0;
        const focusCell = kb ? cursor.y * n + cursor.x : hover;
        const fr = focusCell >= 0 ? (focusCell / n) | 0 : -1;
        const fc = focusCell >= 0 ? focusCell % n : -1;

        // Clue strips.
        ctx.globalAlpha = 1 - rk;
        for (let r = 0; r < n; r++) {
          ctx.fillStyle = r === fr && !revealing ? U.alpha(C.violet, 0.22) : r % 2 ? C.panel : U.alpha(C.panel, 0.6);
          ctx.fillRect(L.ox - L.clueW, L.oy + r * s, L.clueW - 4, s);
        }
        for (let c = 0; c < n; c++) {
          ctx.fillStyle = c === fc && !revealing ? U.alpha(C.violet, 0.22) : c % 2 ? C.panel : U.alpha(C.panel, 0.6);
          ctx.fillRect(L.ox + c * s, L.oy - L.clueH, s, L.clueH - 4);
        }
        const fs = Math.round(L.cs * 0.72);
        ctx.font = '600 ' + fs + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let r = 0; r < n; r++) {
          const cl = pz.rowClues[r].length ? pz.rowClues[r] : [0];
          ctx.fillStyle = rowOk[r] ? U.alpha(C.muted, 0.4) : C.text;
          for (let j = 0; j < cl.length; j++) {
            const x = L.ox - 10 - (cl.length - 1 - j) * L.cs - L.cs / 2 + 4;
            ctx.fillText(String(cl[j]), x, L.oy + r * s + s / 2 + 1);
          }
        }
        for (let c = 0; c < n; c++) {
          const cl = pz.colClues[c].length ? pz.colClues[c] : [0];
          ctx.fillStyle = colOk[c] ? U.alpha(C.muted, 0.4) : C.text;
          for (let j = 0; j < cl.length; j++) {
            const y = L.oy - 10 - (cl.length - 1 - j) * L.cs - L.cs / 2 + 4;
            ctx.fillText(String(cl[j]), L.ox + c * s + s / 2, y);
          }
        }
        ctx.globalAlpha = 1;

        // Cells.
        ctx.fillStyle = C.ink;
        ctx.fillRect(L.ox - 2, L.oy - 2, L.size + 4, L.size + 4);
        for (let i = 0; i < n * n; i++) {
          const r = (i / n) | 0;
          const c = i % n;
          const x = L.ox + c * s;
          const y = L.oy + r * s;
          const block = (((r / 5) | 0) + ((c / 5) | 0)) % 2;
          ctx.fillStyle = block ? '#2A2459' : C.panel2;
          ctx.fillRect(x, y, s, s);
          if (!revealing && (r === fr || c === fc)) {
            ctx.fillStyle = U.alpha(C.violet, 0.13);
            ctx.fillRect(x, y, s, s);
          }
          const v = cells[i];
          const age = clock - cellT[i];
          const pop = age < 0.14 ? 0.75 + 0.25 * (age / 0.14) : 1;
          // Reveal wave: each cell turns to its picture color in a diagonal sweep.
          let ck = 0;
          if (revealing) ck = U.clamp((revealT - 0.25 - ((r + c) / (2 * n)) * 0.9) / 0.3, 0, 1);
          if (v === 1) {
            const g = s * 0.06 + (1 - pop) * s * 0.25;
            ctx.fillStyle = FILLED;
            U.roundRect(ctx, x + g, y + g, s - g * 2, s - g * 2, s * 0.14);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,.35)';
            ctx.fillRect(x + s * 0.2, y + g + 1, s * 0.6, Math.max(1, s * 0.07));
          } else if ((v === 2 || v === 3) && ck < 1) {
            drawCross(x, y, s, v === 3 ? C.p1 : C.muted, (v === 3 ? 1 : 0.8) * (1 - ck));
          }
          if (ck > 0) {
            ctx.globalAlpha = ck;
            ctx.fillStyle = pz.sol[i] ? pz.color[i] : pz.bg;
            ctx.fillRect(x - 0.5, y - 0.5, s + 1, s + 1);
            ctx.globalAlpha = 1;
          }
        }

        // Grid lines fade out during the reveal.
        const ga = 1 - rk;
        if (ga > 0) {
          ctx.globalAlpha = ga;
          ctx.strokeStyle = C.ink;
          ctx.lineWidth = 1;
          ctx.beginPath();
          for (let k = 1; k < n; k++) {
            if (k % 5 === 0) continue;
            ctx.moveTo(L.ox + k * s + 0.5, L.oy);
            ctx.lineTo(L.ox + k * s + 0.5, L.oy + L.size);
            ctx.moveTo(L.ox, L.oy + k * s + 0.5);
            ctx.lineTo(L.ox + L.size, L.oy + k * s + 0.5);
          }
          ctx.stroke();
          ctx.strokeStyle = THICK;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 5; k < n; k += 5) {
            ctx.moveTo(L.ox + k * s, L.oy);
            ctx.lineTo(L.ox + k * s, L.oy + L.size);
            ctx.moveTo(L.ox, L.oy + k * s);
            ctx.lineTo(L.ox + L.size, L.oy + k * s);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        ctx.strokeStyle = revealing ? C.mint : C.line;
        ctx.lineWidth = revealing ? 3 : 2;
        ctx.strokeRect(L.ox - 1, L.oy - 1, L.size + 2, L.size + 2);

        // Shine sweep once the picture is in.
        if (revealing && revealT > 1.2 && revealT < 2.2) {
          const k = (revealT - 1.2) / 1;
          ctx.save();
          ctx.beginPath();
          ctx.rect(L.ox, L.oy, L.size, L.size);
          ctx.clip();
          const sx = L.ox - L.size * 0.5 + k * L.size * 2;
          ctx.fillStyle = 'rgba(255,255,255,.28)';
          ctx.beginPath();
          ctx.moveTo(sx, L.oy);
          ctx.lineTo(sx + L.size * 0.2, L.oy);
          ctx.lineTo(sx - L.size * 0.3, L.oy + L.size);
          ctx.lineTo(sx - L.size * 0.5, L.oy + L.size);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }
        if (revealing && revealT > 0.9) {
          const k = Math.min(1, (revealT - 0.9) / 0.3);
          ctx.globalAlpha = k;
          ctx.font = '800 30px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.ink;
          ctx.fillText(pz.name, L.ox + L.size / 2 + 2, L.oy - L.clueH / 2 + 2);
          ctx.fillStyle = C.mint;
          ctx.fillText(pz.name, L.ox + L.size / 2, L.oy - L.clueH / 2);
          ctx.globalAlpha = 1;
        }

        // Keyboard cursor.
        if (kb && state === 'play') {
          const x = L.ox + cursor.x * s;
          const y = L.oy + cursor.y * s;
          ctx.strokeStyle = keyStroke ? (keyStroke.action === 'mark' || keyStroke.action === 'unmark' ? C.p1 : C.mint) : C.gold;
          ctx.lineWidth = 2.5;
          U.roundRect(ctx, x + 1.5, y + 1.5, s - 3, s - 3, s * 0.16);
          ctx.stroke();
        }
      }

      function panelButton(b, label, sub, on, accent) {
        const hot = hoverBtn === b;
        const down = pressedBtn === b;
        ctx.fillStyle = on ? U.alpha(accent, 0.22) : hot ? C.line : C.panel2;
        U.roundRect(ctx, b.x, b.y + (down ? 2 : 0), b.w, b.h, 11);
        ctx.fill();
        ctx.strokeStyle = on ? accent : hot ? C.muted : C.line;
        ctx.lineWidth = on ? 2 : 1.5;
        ctx.stroke();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = '700 14px "JetBrains Mono", monospace';
        ctx.fillStyle = on ? accent : C.text;
        ctx.fillText(label, b.x + 14, b.y + b.h / 2 + (down ? 2 : 0));
        ctx.textAlign = 'right';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText(sub, b.x + b.w - 14, b.y + b.h / 2 + (down ? 2 : 0));
      }

      function drawPlayPanel() {
        const solvedHere = session.solved[cur];
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, infoBox.x, infoBox.y, infoBox.w, infoBox.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('PUZZLE ' + (cur + 1) + '/16 · ' + pz.n + '×' + pz.n, infoBox.x + 14, infoBox.y + 24);
        ctx.font = '700 19px "JetBrains Mono", monospace';
        ctx.fillStyle = solvedHere ? C.mint : C.text;
        ctx.fillText(solvedHere ? pz.name : '???', infoBox.x + 14, infoBox.y + 50);

        // Live preview of the picture so far, placed in its mosaic slot.
        const pb = previewBox;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.stroke();
        const ms = 4 * 26;
        const mx = pb.x + 14;
        const my = pb.y + (pb.h - ms) / 2;
        for (let k = 0; k < 16; k++) {
          const tx = mx + (k % 4) * 26;
          const ty = my + ((k / 4) | 0) * 26;
          if (session.solved[k]) drawPicture(ctx, PICS[k], tx, ty, 26);
          else {
            ctx.fillStyle = C.panel2;
            ctx.fillRect(tx + 1, ty + 1, 24, 24);
          }
          if (k === cur) {
            ctx.strokeStyle = C.gold;
            ctx.lineWidth = 2;
            ctx.strokeRect(tx, ty, 26, 26);
          }
        }
        const vs = pb.x + pb.w - 14 - 72;
        const vy = pb.y + 20;
        const n = pz.n;
        const ps = 72 / n;
        ctx.fillStyle = C.ink;
        ctx.fillRect(vs, vy, 72, 72);
        for (let i = 0; i < n * n; i++) {
          if (cells[i] !== 1) continue;
          ctx.fillStyle = state === 'reveal' || state === 'done' ? pz.color[i] || FILLED : FILLED;
          ctx.fillRect(vs + (i % n) * ps, vy + ((i / n) | 0) * ps, Math.ceil(ps), Math.ceil(ps));
        }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.strokeRect(vs, vy, 72, 72);
        ctx.font = '600 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = C.muted;
        ctx.fillText('this tile', vs + 36, vy + 92);
        ctx.fillText(solvedCount() + '/16 done', vs + 36, vy + 108);

        panelButton(playButtons[0], mode === 'fill' ? 'Tap: fill' : 'Tap: mark ×', 'M', mode === 'mark', C.p1);
        panelButton(playButtons[1], 'Check ' + (session.check ? 'on' : 'off'), 'C', session.check, C.mint);
        panelButton(playButtons[2], 'Undo', 'Z', false, C.violet);
        panelButton(playButtons[3], 'Clear', 'R', false, C.violet);
        panelButton(playButtons[4], 'Gallery', 'G', false, C.violet);

        const sb = statsBox;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, sb.x, sb.y, sb.w, sb.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        let filled = 0;
        let need = 0;
        for (let i = 0; i < cells.length; i++) {
          if (cells[i] === 1) filled++;
          if (pz.sol[i]) need++;
        }
        const t = Math.floor(board ? board.time : 0);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('FILLED', sb.x + 14, sb.y + 24);
        ctx.fillText(session.check ? 'MISTAKES' : 'TIME', sb.x + 110, sb.y + 24);
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillStyle = C.text;
        ctx.fillText(filled + '/' + need, sb.x + 14, sb.y + 50);
        ctx.fillStyle = session.check && board && board.mistakes ? C.p1 : C.text;
        ctx.fillText(session.check ? String(board ? board.mistakes : 0) : Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'),
          sb.x + 110, sb.y + 50);
      }

      /* ---------- Draw: gallery ---------- */

      function drawGallery() {
        const all = solvedCount() === 16;
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.text;
        ctx.fillText('Beach day mosaic', MX, MY - 14);
        // Frame.
        ctx.fillStyle = C.panel;
        ctx.fillRect(MX - 8, MY - 8, MOS + 16, MOS + 16);
        if (all) {
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 16 + Math.sin(clock * 2) * 6;
        }
        ctx.strokeStyle = all ? C.gold : C.line;
        ctx.lineWidth = 3;
        ctx.strokeRect(MX - 8, MY - 8, MOS + 16, MOS + 16);
        ctx.shadowBlur = 0;
        for (let k = 0; k < 16; k++) {
          if (k === session.fresh) continue;
          const x = MX + (k % 4) * TILE;
          const y = MY + ((k / 4) | 0) * TILE;
          if (session.solved[k]) drawPicture(ctx, PICS[k], x, y, TILE);
          else drawMystery(ctx, PICS[k], x + 2, y + 2, TILE - 4, session.boards[k]);
        }
        if (!all) {
          // Thin seams between unsolved tiles keep the grid readable.
          ctx.strokeStyle = U.alpha(C.ink, 0.5);
          ctx.lineWidth = 1;
          for (let k = 0; k < 16; k++) {
            if (session.solved[k]) continue;
            ctx.strokeRect(MX + (k % 4) * TILE + 0.5, MY + ((k / 4) | 0) * TILE + 0.5, TILE - 1, TILE - 1);
          }
        }
        // A freshly solved tile drops into place.
        if (session.fresh >= 0) {
          const k = session.fresh;
          const e = Math.min(1, galleryT / 0.6);
          const sc = 1 + (1 - e) * 0.5;
          const x = MX + (k % 4) * TILE + TILE / 2;
          const y = MY + ((k / 4) | 0) * TILE + TILE / 2;
          const sz = TILE * sc;
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 24 * (1 - Math.min(1, galleryT / 1.4)) + 4;
          drawPicture(ctx, PICS[k], x - sz / 2, y - sz / 2, sz);
          ctx.shadowBlur = 0;
        }
        // Focus ring.
        const fx = MX + (focus % 4) * TILE;
        const fy = MY + ((focus / 4) | 0) * TILE;
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 3;
        U.roundRect(ctx, fx + 2, fy + 2, TILE - 4, TILE - 4, 6);
        ctx.stroke();

        // Side panel.
        const sx = 600;
        const sw = W - sx - 28;
        ctx.textAlign = 'left';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('TILES SOLVED', sx, MY + 14);
        ctx.font = '800 40px Unbounded, sans-serif';
        ctx.fillStyle = all ? C.gold : C.mint;
        ctx.fillText(solvedCount() + '/16', sx, MY + 62);
        ctx.fillStyle = C.ink;
        U.roundRect(ctx, sx, MY + 80, sw, 12, 6);
        ctx.fill();
        ctx.fillStyle = all ? C.gold : C.mint;
        U.roundRect(ctx, sx, MY + 80, Math.max(12, sw * solvedCount() / 16), 12, 6);
        ctx.fill();
        if (all) {
          ctx.font = FONT_HUD;
          ctx.fillStyle = C.gold;
          ctx.fillText('The beach is complete!', sx, MY + 122);
        }

        const fp = PICS[focus];
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, sx, MY + 150, sw, 200, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('PUZZLE ' + (focus + 1) + ' · ' + fp.n + '×' + fp.n, sx + 16, MY + 178);
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.fillStyle = session.solved[focus] ? C.mint : C.text;
        ctx.fillText(session.solved[focus] ? fp.name : 'Not solved yet', sx + 16, MY + 208);
        const pv = 110;
        if (session.solved[focus]) drawPicture(ctx, fp, sx + (sw - pv) / 2, MY + 226, pv);
        else drawMystery(ctx, fp, sx + (sw - pv) / 2, MY + 226, pv, session.boards[focus]);

        const gp = galleryPlay;
        const hot = hoverBtn === gp;
        ctx.fillStyle = hot ? U.alpha(C.mint, 0.3) : U.alpha(C.mint, 0.18);
        U.roundRect(ctx, gp.x, gp.y, gp.w, gp.h, 12);
        ctx.fill();
        ctx.strokeStyle = C.mint;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = '700 16px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.mint;
        const b = session.boards[focus];
        ctx.fillText(session.solved[focus] ? 'Play again' : b && !b.done && b.cells.some(Boolean) ? 'Continue' : 'Play',
          gp.x + gp.w / 2, gp.y + gp.h / 2);
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('Enter or click a tile', gp.x + gp.w / 2, gp.y + gp.h + 20);
      }

      function drawParticles() {
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.4));
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (state === 'gallery' || state === 'menu') {
          drawGallery();
        } else if (L) {
          drawPlay();
          drawPlayPanel();
        }
        drawParticles();
        if (errFlash > 0) {
          ctx.fillStyle = U.alpha(C.p1, errFlash * 0.15);
          ctx.fillRect(0, 0, W, H);
        }
      }

      api.setScore(solvedCount());
      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
