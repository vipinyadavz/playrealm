/* Box Push — push every crate onto a pad in a small warehouse. Crates that land on ice
   keep sliding until something stops them or they reach plain floor.
   See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 600;
  const TOP = 58;
  const BOTTOM = 66;
  const STEP = 0.1;    // seconds per player step
  const SLIDE = 0.05;  // seconds per tile a crate glides on ice
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const PAR_BONUS = 50;
  const LEVEL_POINTS = 100;
  const FLOOR = '#211C46';
  const FLOOR_IN = '#272056';
  const WALL_TOP = '#4A4390';
  const WALL_HI = '#5F57AE';
  const WALL_LIP = '#2C2664';
  const ICE_HI = '#E2F8FF';
  const ICE_MID = '#A9E3F8';
  const ICE_LO = '#7FCBEB';
  const CRATE = '#FF5D73';
  const CRATE_DARK = '#C23C55';
  const CRATE_LIGHT = '#FF8C9B';
  const DONE = '#4BE3A0';
  const DONE_DARK = '#2A9E6E';
  const DONE_LIGHT = '#8BF0C4';
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  /* Legend: # wall, space floor, . pad, $ crate, * crate on pad, @ you, + you on a pad,
     ~ ice, : pad on ice. Every level was checked with a solver; par is the fewest moves. */
  const LEVELS = [
    { name: 'Warm up', par: 10, map: [
      '#######',
      '#.    #',
      '# $## #',
      '# @   #',
      '#######'] },
    { name: 'Two crates', par: 18, map: [
      '########',
      '#  .   #',
      '# $##$ #',
      '#   @ .#',
      '########'] },
    { name: 'Slippery', par: 12, map: [
      '##########',
      '#   ~~~~.#',
      '# $ ######',
      '#@ $  .  #',
      '##########'] },
    { name: 'Backstop', par: 15, map: [
      '#########',
      '#   ~~:.#',
      '#@$$    #',
      '#       #',
      '#########'] },
    { name: 'Pond', par: 19, map: [
      '##########',
      '#.      .#',
      '#  ~~~~  #',
      '# $~~~~$ #',
      '#  ~~~~  #',
      '#   @    #',
      '##########'] },
    { name: 'Stopper chain', par: 21, map: [
      '###########',
      '#    ~~::.#',
      '# $ $ $   #',
      '#@        #',
      '###########'] },
    { name: 'Nook', par: 25, map: [
      '#########',
      '###   ###',
      '#  $ $  #',
      '# # $ # #',
      '#   @   #',
      '###...###',
      '#########'] },
    { name: 'Twin rinks', par: 29, map: [
      '###########',
      '#   # ~~~.#',
      '# $ # ~~~ #',
      '#   $ ~~~ #',
      '#@  # ~~~.#',
      '###########'] },
    { name: 'Corner pocket', par: 36, map: [
      '########',
      '#  ##  #',
      '# $  $ #',
      '#  ## .#',
      '## $ ..#',
      '#  @  ##',
      '########'] },
    { name: 'Elbow', par: 37, map: [
      '#########',
      '#@  #   #',
      '# $ ~~~ #',
      '#   ~#~ #',
      '###$ #~ #',
      '#  .  . #',
      '#########'] },
    { name: 'Switchback', par: 37, map: [
      '##########',
      '#@   #   #',
      '# $$ # $ #',
      '#  ~~~~~ #',
      '## ~## ~ #',
      '#. ~~~~~ #',
      '#..      #',
      '##########'] },
    { name: 'Hallway', par: 50, map: [
      '#########',
      '#  #    #',
      '#  $  $ #',
      '## # ####',
      '#   $  .#',
      '#@    ..#',
      '#########'] },
    { name: 'Ice yard', par: 56, map: [
      '###########',
      '#   #     #',
      '# $ ~~~ $ #',
      '#   ~#~   #',
      '##$~~~~~$##',
      '#   ~#~   #',
      '#.  ~~~  .#',
      '#.   @   .#',
      '###########'] },
    { name: 'Stack', par: 62, map: [
      '#########',
      '#.#~~~~ #',
      '#.~~~~~ #',
      '#.~###  #',
      '# $ $ $ #',
      '#  #@   #',
      '#########'] },
    { name: 'Blocker', par: 66, map: [
      '##########',
      '#  ~#~:~ #',
      '#@$  $~  #',
      '#  #   ###',
      '##$ ~~~~.#',
      '#   :~~  #',
      '##########'] },
    { name: 'Cold storage', par: 75, map: [
      '##########',
      '#  #  ~~ #',
      '# $$  ~~##',
      '#  # ### #',
      '#  #  $  #',
      '#..~~### #',
      '#. #  @  #',
      '##########'] },
    { name: 'Glacier', par: 79, map: [
      '##########',
      '#@  ~~~~ #',
      '# $$~##~ #',
      '# #~ ~~# #',
      '###~ .#~ #',
      '#  ~~:~~ #',
      '# .    $ #',
      '##########'] },
    { name: 'Courtyard', par: 100, map: [
      '##########',
      '###   ####',
      '#   $   ##',
      '# # ## $ #',
      '# $ .. # #',
      '#  #..$  #',
      '##   @ ###',
      '##########'] },
    { name: 'Frozen gate', par: 79, map: [
      '##########',
      '#   #    #',
      '# $ ~ $  #',
      '#  ##  # #',
      '### ~ ## #',
      '#.  ~  $ #',
      '#..  #  @#',
      '##########'] },
    { name: 'Lanes', par: 86, map: [
      '###########',
      '#  #~~~~  #',
      '# $##### $#',
      '#   ~~~   #',
      '### #  #  #',
      '#.  $  @ .#',
      '#.   ###  #',
      '###########'] }
  ];

  const HINTS = {
    0: 'Push every crate onto a gold pad. You can push but never pull. Arrows, WASD, swipe or tap.',
    1: 'Plan the order: a crate pushed into a corner can never come back out.',
    2: 'Ice! A crate pushed onto ice keeps sliding until it bumps into something or reaches plain floor. You walk on ice normally.',
    3: 'A pad on ice only holds a crate if something stops it there. Slide one crate to the far pad first, then use it as a backstop.'
  };

  function parseLevel(lv) {
    const h = lv.map.length;
    const w = Math.max(...lv.map.map((r) => r.length));
    const n = w * h;
    const wall = new Uint8Array(n);
    const goal = new Uint8Array(n);
    const ice = new Uint8Array(n);
    const inside = new Uint8Array(n);
    const boxes = [];
    let player = 0;
    let hasIce = false;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = lv.map[y][x] || ' ';
        const i = y * w + x;
        if (ch === '#') wall[i] = 1;
        if ('.*+:'.includes(ch)) goal[i] = 1;
        if ('~:'.includes(ch)) {
          ice[i] = 1;
          hasIce = true;
        }
        if ('$*'.includes(ch)) boxes.push(i);
        if ('@+'.includes(ch)) player = i;
      }
    }
    // Interior = everything the player could reach with no crates in the way.
    const q = [player];
    inside[player] = 1;
    for (let k = 0; k < q.length; k++) {
      const c = q[k];
      for (const d of [-w, w, -1, 1]) {
        const nx = c + d;
        if (nx < 0 || nx >= n || wall[nx] || inside[nx]) continue;
        inside[nx] = 1;
        q.push(nx);
      }
    }
    return { w, h, n, wall, goal, ice, inside, boxes, player, hasIce };
  }

  const DATA = LEVELS.map(parseLevel);

  /* Session progress (no storage): best moves per level. */
  const session = { best: new Array(LEVELS.length).fill(null), told: {} };

  function totalScore() {
    let s = 0;
    session.best.forEach((b, i) => {
      if (b != null) s += LEVEL_POINTS + (b <= LEVELS[i].par ? PAR_BONUS : 0);
    });
    return s;
  }

  const firstOpen = () => {
    const k = session.best.indexOf(null);
    return k < 0 ? 0 : k;
  };

  /* ---------- Drawing helpers (shared by the game and the card art) ---------- */

  function drawFloor(ctx, x, y, s) {
    ctx.fillStyle = FLOOR;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = FLOOR_IN;
    U.roundRect(ctx, x + s * 0.06, y + s * 0.06, s * 0.88, s * 0.88, s * 0.12);
    ctx.fill();
  }

  function drawIce(ctx, x, y, s, t) {
    const g = ctx.createLinearGradient(x, y, x + s, y + s);
    g.addColorStop(0, ICE_HI);
    g.addColorStop(0.6, ICE_MID);
    g.addColorStop(1, ICE_LO);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,.75)';
    ctx.lineWidth = Math.max(1, s * 0.05);
    ctx.lineCap = 'round';
    const sh = ((t || 0) * 0.25 + (x + y) * 0.003) % 1;
    ctx.beginPath();
    ctx.moveTo(x + s * 0.18, y + s * 0.42);
    ctx.lineTo(x + s * 0.42, y + s * 0.18);
    ctx.moveTo(x + s * 0.5, y + s * 0.82);
    ctx.lineTo(x + s * 0.82, y + s * 0.5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.18 * Math.max(0, Math.sin(sh * Math.PI))).toFixed(3) + ')';
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = 'rgba(40,110,150,.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, s - 1, s - 1);
  }

  function drawWall(ctx, x, y, s, lip) {
    ctx.fillStyle = WALL_LIP;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = WALL_TOP;
    ctx.fillRect(x, y, s, lip ? s * 0.8 : s);
    ctx.fillStyle = WALL_HI;
    ctx.fillRect(x, y, s, Math.max(1, s * 0.08));
    ctx.strokeStyle = 'rgba(15,13,36,.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + s * 0.4);
    ctx.lineTo(x + s - 0.5, y + s * 0.4);
    ctx.moveTo(x + s * 0.5, y);
    ctx.lineTo(x + s * 0.5, y + s * 0.4);
    ctx.stroke();
  }

  function drawPad(ctx, cx, cy, s, t, lit) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.strokeStyle = U.alpha(C.gold, lit ? 1 : 0.65 + pulse * 0.3);
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = U.alpha(C.gold, 0.25 + pulse * 0.2);
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.14, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawCrate(ctx, x, y, s, done, glow) {
    const g = s * 0.1;
    const base = done ? DONE : CRATE;
    const dark = done ? DONE_DARK : CRATE_DARK;
    const light = done ? DONE_LIGHT : CRATE_LIGHT;
    ctx.fillStyle = 'rgba(5,4,16,.4)';
    U.roundRect(ctx, x + g, y + g + s * 0.06, s - g * 2, s - g * 2, s * 0.12);
    ctx.fill();
    if (glow) {
      ctx.shadowColor = base;
      ctx.shadowBlur = s * 0.35 * glow;
    }
    ctx.fillStyle = dark;
    U.roundRect(ctx, x + g, y + g, s - g * 2, s - g * 2, s * 0.12);
    ctx.fill();
    ctx.shadowBlur = 0;
    const inset = s * 0.17;
    ctx.fillStyle = base;
    ctx.fillRect(x + inset, y + inset, s - inset * 2, s - inset * 2);
    ctx.strokeStyle = dark;
    ctx.lineWidth = Math.max(1.5, s * 0.07);
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(x + inset, y + inset);
    ctx.lineTo(x + s - inset, y + s - inset);
    ctx.moveTo(x + s - inset, y + inset);
    ctx.lineTo(x + inset, y + s - inset);
    ctx.stroke();
    ctx.fillStyle = light;
    ctx.fillRect(x + g + s * 0.04, y + g + s * 0.03, s - g * 2 - s * 0.08, Math.max(1, s * 0.05));
  }

  function drawBot(ctx, cx, cy, s, facing, t) {
    const bob = Math.sin(t * 6) * s * 0.02;
    const r = s * 0.33;
    ctx.fillStyle = 'rgba(5,4,16,.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.95, r * 0.85, r * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1E8FB5';
    U.roundRect(ctx, cx - r, cy - r + bob + s * 0.04, r * 2, r * 2, r * 0.7);
    ctx.fill();
    ctx.fillStyle = C.p2;
    U.roundRect(ctx, cx - r, cy - r + bob, r * 2, r * 1.86, r * 0.7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    U.roundRect(ctx, cx - r * 0.6, cy - r * 0.86 + bob, r * 1.2, r * 0.22, r * 0.11);
    ctx.fill();
    // Antenna.
    ctx.strokeStyle = '#1E8FB5';
    ctx.lineWidth = Math.max(1.5, s * 0.04);
    ctx.beginPath();
    ctx.moveTo(cx, cy - r + bob);
    ctx.lineTo(cx, cy - r * 1.35 + bob);
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(cx, cy - r * 1.42 + bob, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    // Eyes look where you are heading.
    const d = DIRS[facing] || DIRS.down;
    const ex = d[0] * r * 0.3;
    const ey = d[1] * r * 0.22;
    ctx.fillStyle = C.ink;
    U.roundRect(ctx, cx - r * 0.5 + ex - r * 0.13, cy - r * 0.2 + ey + bob, r * 0.28, r * 0.42, r * 0.14);
    ctx.fill();
    U.roundRect(ctx, cx + r * 0.5 + ex - r * 0.15, cy - r * 0.2 + ey + bob, r * 0.28, r * 0.42, r * 0.14);
    ctx.fill();
  }

  /* Card art: a crate gliding along an ice lane toward its pad. */
  const THUMB = [
    '##########',
    '#  #     #',
    '#@$~~~~~.#',
    '#    ##  #',
    '# .   $  #',
    '##########'
  ];

  Arcade.register({
    id: 'box-push',
    title: 'Box Push',
    category: 'puzzle',
    mode: 'solo',
    players: '1P',
    color: C.p1,
    tagline: 'Push every crate onto a pad without boxing yourself in.',
    hook: 'Ice tiles make boxes slide until they hit something.',
    tags: ['puzzle', 'logic', 'boxes', 'crates', 'warehouse', 'ice', 'levels', 'keyboard', 'touch'],
    howTo: 'Walk around the warehouse and push every crate onto a gold pad. You can only push, one crate at a time, ' +
      'and never pull, so a crate in a corner is stuck for good. The twist: a crate pushed onto ice keeps sliding ' +
      'until it hits a wall or another crate, or glides onto plain floor. You walk on ice normally. Pads on ice only ' +
      'hold a crate that something stops there. There are 20 levels; each one cleared is worth 100 points, plus 50 ' +
      'if you finish within par (the fewest possible moves). Undo as often as you like.',
    controls: [
      { keys: ['↑', '↓', '←', '→'], label: 'Walk and push (WASD works too)' },
      { keys: ['Tap', 'Swipe'], label: 'Step or walk to a tapped spot' },
      { keys: ['Z', 'Backspace'], label: 'Undo a move' },
      { keys: ['R'], label: 'Restart the level' },
      { keys: ['L'], label: 'Level select' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const rows = THUMB.length;
      const cols = THUMB[0].length;
      const s = Math.min(w / cols, h / rows);
      const ox = (w - s * cols) / 2;
      const oy = (h - s * rows) / 2;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const ch = THUMB[y][x];
          const px = ox + x * s;
          const py = oy + y * s;
          if (ch === '#') {
            const below = y + 1 < rows ? THUMB[y + 1][x] : '#';
            drawWall(ctx, px, py, s, below !== '#');
          } else if (ch === '~') {
            drawIce(ctx, px, py, s, t);
          } else {
            drawFloor(ctx, px, py, s);
          }
          if (ch === '.') drawPad(ctx, px + s / 2, py + s / 2, s, t, false);
        }
      }
      // The crate glides from the bot down the ice to the pad, then the loop restarts.
      const cyc = t % 3.2;
      const k = t === 0 ? 0.55 : cyc < 0.4 ? 0 : Math.min(1, (cyc - 0.4) / 0.9);
      const e = 1 - Math.pow(1 - k, 2);
      const cx = ox + U.lerp(2, 8, e) * s;
      const cy = oy + 2 * s;
      if (k > 0 && k < 1) {
        ctx.strokeStyle = 'rgba(255,255,255,.7)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
          const ly = cy + s * (0.3 + i * 0.2);
          ctx.beginPath();
          ctx.moveTo(cx - s * (0.2 + i * 0.15), ly);
          ctx.lineTo(cx - s * (0.9 + i * 0.2), ly);
          ctx.stroke();
        }
      }
      drawCrate(ctx, cx, cy, s, k >= 1, k >= 1 ? 1 : 0);
      drawCrate(ctx, ox + 6 * s, oy + 4 * s, s, false, 0);
      drawBot(ctx, ox + (k > 0 ? 2.5 : 1.5) * s, oy + 2.5 * s, s, 'right', t);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const by = H - BOTTOM + 11;
      const bh = BOTTOM - 22;
      const buttons = [
        { id: 'undo', label: 'Undo', key: 'Z', x: 20, y: by, w: 140, h: bh },
        { id: 'restart', label: 'Restart', key: 'R', x: 172, y: by, w: 150, h: bh },
        { id: 'levels', label: 'Levels', key: 'L', x: 334, y: by, w: 140, h: bh }
      ];
      // Level select grid.
      const GC = 5;
      const CW = 136;
      const CH = 92;
      const GX = Math.round((W - (GC * CW + (GC - 1) * 14)) / 2);
      const GY = 96;

      let state = 'menu'; // 'menu' | 'select' | 'play' | 'won' | 'done'
      let li = 0;
      let D = DATA[0];
      let boxes = [];
      let player = 0;
      let moves = 0;
      let pushes = 0;
      let facing = 'down';
      let history = [];
      let queue = [];
      let anim = null;   // your step: { t, from, to, dir }
      let slides = [];   // crates in motion: { i, path, t, dur, dir }
      let tile = 48;
      let ox = 0;
      let oy = 0;
      let clock = 0;
      let wonAt = 0;
      let bumpT = 0;
      let bumpDir = 'down';
      let particles = [];
      let floaters = [];
      let focus = 0;
      let hoverBtn = null;
      let pressedBtn = null;
      let press = null;
      let doneGlow = new Map();
      let hint = '';
      let hintT = 0;
      let lastStatus = '';

      const inRect = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      const cellX = (i) => ox + (i % D.w) * tile;
      const cellY = (i) => oy + ((i / D.w) | 0) * tile;

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function startLevel(i, quiet) {
        li = U.clamp(i, 0, LEVELS.length - 1);
        D = DATA[li];
        boxes = D.boxes.slice();
        player = D.player;
        moves = 0;
        pushes = 0;
        facing = 'down';
        history = [];
        queue = [];
        anim = null;
        slides = [];
        particles = [];
        floaters = [];
        doneGlow = new Map();
        bumpT = 0;
        tile = Math.min(64, Math.floor((W - 40) / D.w), Math.floor((H - TOP - BOTTOM - 16) / D.h));
        ox = Math.round((W - tile * D.w) / 2);
        oy = TOP + Math.round((H - TOP - BOTTOM - tile * D.h) / 2);
        state = 'play';
        api.hideMenu();
        api.setScore(totalScore());
        lastStatus = '';
        const lv = LEVELS[li];
        if (quiet) return;
        if (HINTS[li] && !session.told['lvl' + li]) {
          session.told['lvl' + li] = true;
          setHint(HINTS[li], 10);
        } else {
          setHint('Level ' + (li + 1) + ': ' + lv.name + '. Par is ' + lv.par + ' moves.', 4);
        }
      }

      function restart() {
        if (state !== 'play' || (!moves && !history.length)) return;
        startLevel(li);
        api.sfx('flip');
        setHint('Level restarted. Par is ' + LEVELS[li].par + ' moves.', 3);
      }

      function showStart() {
        state = 'menu';
        const next = firstOpen();
        const done = session.best.filter((b) => b != null).length;
        api.menu({
          title: 'Box Push',
          text: 'Push every crate onto a gold pad. Crates on ice keep sliding until something stops them.' +
            (done ? '\n' + done + ' of ' + LEVELS.length + ' levels cleared this session.' : ''),
          buttons: [
            { label: (done ? 'Continue: level ' : 'Start: level ') + (next + 1), primary: true, onClick: () => startLevel(next) },
            { label: 'Level select', onClick: showSelect }
          ]
        });
      }

      function showSelect() {
        state = 'select';
        queue = [];
        api.hideMenu();
        focus = li;
        api.setScore(totalScore());
        setHint('Pick any level. A check means cleared, a star means cleared within par.', 5);
      }

      function snapshot() {
        return { player, boxes: boxes.slice(), moves, pushes, facing };
      }

      function burst(x, y, n, colors, speed) {
        for (let k = 0; k < n && particles.length < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - speed * 0.3, life: U.rand(0.4, 0.9), size: U.rand(2.5, 5), color: U.pick(colors) });
        }
      }

      function cornered(i) {
        if (D.goal[i]) return false;
        const w = D.w;
        return (D.wall[i - w] || D.wall[i + w]) && (D.wall[i - 1] || D.wall[i + 1]);
      }

      /* One step in a direction. Returns true if you moved. */
      function step(dir) {
        if (state !== 'play') return false;
        const [dx, dy] = DIRS[dir];
        const s = dx + dy * D.w;
        facing = dir;
        const np = player + s;
        if (D.wall[np]) {
          bumpT = 0.18;
          bumpDir = dir;
          return false;
        }
        const bi = boxes.indexOf(np);
        let path = null;
        if (bi >= 0) {
          const bp = np + s;
          if (D.wall[bp] || boxes.includes(bp)) {
            bumpT = 0.18;
            bumpDir = dir;
            api.sfx('tick');
            return false;
          }
          // On ice the crate keeps going until the next cell is blocked or it reaches plain floor.
          let dest = bp;
          path = [np, bp];
          while (D.ice[dest] && !D.wall[dest + s] && !boxes.includes(dest + s)) {
            dest += s;
            path.push(dest);
          }
          history.push(snapshot());
          boxes[bi] = dest;
          pushes++;
        } else {
          history.push(snapshot());
        }
        const from = player;
        player = np;
        moves++;
        const slideTiles = path ? path.length - 2 : 0;
        anim = { t: 0, from, to: np, dir };
        if (bi >= 0) {
          const dur = STEP + slideTiles * SLIDE;
          slides = slides.filter((sl) => sl.i !== bi);
          slides.push({ i: bi, path, t: 0, dur, dir });
          const dest = boxes[bi];
          if (D.goal[dest]) {
            api.sfx('score');
            doneGlow.set(bi, clock + dur);
          } else if (slideTiles > 0 || D.ice[path[1]]) {
            api.sfx('shoot');
          } else {
            api.sfx('tick');
          }
          if ((slideTiles > 0 || D.ice[dest]) && !session.told.slide) {
            session.told.slide = true;
            setHint('Whee! Crates on ice keep sliding until they bump into something or reach plain floor.', 7);
          }
          if (cornered(dest)) {
            setHint('That crate is stuck against two walls. Press Z to undo or R to restart.', 6);
          }
        }
        if (boxes.every((b) => D.goal[b])) win();
        return true;
      }

      function win() {
        state = 'won';
        queue = [];
        let wait = STEP;
        for (const sl of slides) wait = Math.max(wait, sl.dur - sl.t);
        wonAt = clock + wait + 1.1;
        const prev = session.best[li];
        if (prev == null || moves < prev) session.best[li] = moves;
        api.setScore(totalScore());
        api.after(Math.round(wait * 1000), () => {
          if (state !== 'won') return;
          api.sfx('win');
          for (const b of boxes) burst(cellX(b) + tile / 2, cellY(b) + tile / 2, 14, [DONE, C.gold, C.text, C.p2], 260);
        });
      }

      function showWon() {
        state = 'done';
        const lv = LEVELS[li];
        const total = totalScore();
        const isBest = api.reportScore(total);
        const underPar = moves <= lv.par;
        const all = session.best.every((b) => b != null);
        const text = lv.name + ' in ' + moves + ' moves (par ' + lv.par + ')' +
          (underPar ? ', par bonus +' + PAR_BONUS : '') + '. Session score ' + total + '.' +
          (all ? '\nAll ' + LEVELS.length + ' levels cleared!' : '');
        api.setStatus(text);
        lastStatus = text;
        const last = li === LEVELS.length - 1;
        const buttons = [];
        if (!last) buttons.push({ label: 'Next level', primary: true, onClick: () => startLevel(li + 1) });
        buttons.push({ label: 'Level select', primary: last, onClick: showSelect });
        buttons.push({ label: 'Replay', onClick: () => startLevel(li) });
        api.menu({
          title: isBest ? 'New best: ' + total + '!' : 'Level ' + (li + 1) + ' cleared!',
          text,
          buttons
        });
      }

      function undo() {
        if (state !== 'play') return;
        queue = [];
        const s = history.pop();
        if (!s) {
          setHint('Nothing to undo yet.', 2);
          api.sfx('tick');
          return;
        }
        player = s.player;
        boxes = s.boxes;
        moves = s.moves;
        pushes = s.pushes;
        facing = s.facing;
        anim = null;
        slides = [];
        doneGlow = new Map();
        api.sfx('flip');
      }

      /* Walk to a tapped floor cell along the shortest free path (no pushing). */
      function walkTo(target) {
        const n = D.n;
        const prev = new Int32Array(n).fill(-2);
        prev[player] = -1;
        const q = [player];
        for (let k = 0; k < q.length; k++) {
          const c = q[k];
          if (c === target) break;
          for (const d of [-D.w, D.w, -1, 1]) {
            const nx = c + d;
            if (nx < 0 || nx >= n || D.wall[nx] || boxes.includes(nx) || prev[nx] !== -2) continue;
            prev[nx] = c;
            q.push(nx);
          }
        }
        if (prev[target] === -2) return false;
        const dirs = [];
        for (let c = target; c !== player; c = prev[c]) {
          const d = c - prev[c];
          dirs.push(d === -D.w ? 'up' : d === D.w ? 'down' : d === -1 ? 'left' : 'right');
        }
        queue = dirs.reverse().slice(0, 80);
        return true;
      }

      function tapCell(i) {
        if (i < 0 || i === player) return;
        const px = player % D.w;
        const py = (player / D.w) | 0;
        const tx = i % D.w;
        const ty = (i / D.w) | 0;
        const ddx = tx - px;
        const ddy = ty - py;
        if (Math.abs(ddx) + Math.abs(ddy) === 1) {
          queue = [ddx === 1 ? 'right' : ddx === -1 ? 'left' : ddy === 1 ? 'down' : 'up'];
          return;
        }
        if (D.wall[i] || !D.inside[i] || boxes.includes(i)) return;
        if (!walkTo(i)) setHint('No clear path there. Push crates out of the way first.', 3);
      }

      function cellAt(p) {
        const x = Math.floor((p.x - ox) / tile);
        const y = Math.floor((p.y - oy) / tile);
        if (x < 0 || y < 0 || x >= D.w || y >= D.h) return -1;
        return y * D.w + x;
      }

      function cardRect(k) {
        return { x: GX + (k % GC) * (CW + 14), y: GY + ((k / GC) | 0) * (CH + 14), w: CW, h: CH };
      }

      function pressButton(b) {
        if (b.id === 'undo') undo();
        else if (b.id === 'restart') restart();
        else if (b.id === 'levels') showSelect();
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (state === 'select') {
          const d = KEYMAP[e.code];
          if (d) {
            const [dx, dy] = DIRS[d];
            const x = U.clamp((focus % GC) + dx, 0, GC - 1);
            const y = U.clamp(((focus / GC) | 0) + dy, 0, Math.ceil(LEVELS.length / GC) - 1);
            focus = Math.min(LEVELS.length - 1, y * GC + x);
            api.sfx('tick');
          } else if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat) {
            startLevel(focus);
          }
          return;
        }
        if (state !== 'play') return;
        const d = KEYMAP[e.code];
        if (d) {
          if (queue.length > 2) queue = [];
          if (queue.length < 2) queue.push(d);
          return;
        }
        if (e.repeat && e.code !== 'KeyZ' && e.code !== 'Backspace') return;
        if (e.code === 'KeyZ' || e.code === 'Backspace') undo();
        else if (e.code === 'KeyR') restart();
        else if (e.code === 'KeyL') showSelect();
      });

      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        if (state === 'select') {
          for (let k = 0; k < LEVELS.length; k++) {
            if (inRect(p, cardRect(k))) {
              focus = k;
              startLevel(k);
              return;
            }
          }
          return;
        }
        if (state !== 'play') return;
        const b = buttons.find((r) => inRect(p, r));
        if (b) {
          pressedBtn = b;
          return;
        }
        press = { x: p.x, y: p.y };
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* not supported */ }
      });

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        if (state === 'select') {
          for (let k = 0; k < LEVELS.length; k++) if (inRect(p, cardRect(k))) focus = k;
          return;
        }
        hoverBtn = buttons.find((r) => inRect(p, r)) || null;
      });

      api.on(canvas, 'pointerup', (e) => {
        const p = api.toCanvas(e, canvas);
        const b = pressedBtn;
        pressedBtn = null;
        if (b) {
          if (state === 'play' && inRect(p, b)) pressButton(b);
          return;
        }
        const start = press;
        press = null;
        if (!start || state !== 'play') return;
        const dx = p.x - start.x;
        const dy = p.y - start.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) >= 30) {
          queue = [Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')];
        } else {
          tapCell(cellAt(start));
        }
      });
      api.on(canvas, 'pointercancel', () => {
        press = null;
        pressedBtn = null;
      });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        hintT = Math.max(0, hintT - dt);
        bumpT = Math.max(0, bumpT - dt);
        for (const p of particles) {
          p.vy += 420 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 1);

        if (anim) {
          anim.t += dt;
          if (anim.t >= STEP) anim = null;
        }
        for (const sl of slides) sl.t += dt;
        if (slides.length) slides = slides.filter((sl) => sl.t < sl.dur);
        if (state === 'play' && queue.length && !anim) {
          const d = queue.shift();
          if (!step(d)) queue = [];
        }
        if (state === 'won' && clock >= wonAt) showWon();

        if (state === 'play' || state === 'won' || state === 'select') {
          const lv = LEVELS[li];
          const status = hintT > 0 ? hint
            : state === 'select'
              ? session.best.filter((b) => b != null).length + ' of ' + LEVELS.length + ' cleared · Session score ' + totalScore()
              : 'Level ' + (li + 1) + ' · ' + lv.name + ' · Moves ' + moves + ' (par ' + lv.par + ') · Pushes ' + pushes;
          if (status !== lastStatus) {
            api.setStatus(status);
            lastStatus = status;
          }
        }
      }

      /* ---------- Draw: level ---------- */

      function slideOf(k) {
        for (const sl of slides) if (sl.i === k) return sl;
        return null;
      }

      function boxPos(k) {
        const b = boxes[k];
        const sl = slideOf(k);
        if (sl) {
          const path = sl.path;
          let fx;
          let fy;
          if (sl.t < STEP) {
            const e = sl.t / STEP;
            fx = U.lerp(path[0] % D.w, path[1] % D.w, e);
            fy = U.lerp((path[0] / D.w) | 0, (path[1] / D.w) | 0, e);
          } else {
            const pos = Math.min(path.length - 1, 1 + (sl.t - STEP) / SLIDE);
            const a = Math.floor(pos);
            const bIdx = Math.min(path.length - 1, a + 1);
            const e = pos - a;
            fx = U.lerp(path[a] % D.w, path[bIdx] % D.w, e);
            fy = U.lerp((path[a] / D.w) | 0, (path[bIdx] / D.w) | 0, e);
          }
          return { x: ox + fx * tile, y: oy + fy * tile, moving: sl.t >= STEP && path.length > 2, dir: sl.dir };
        }
        return { x: cellX(b), y: cellY(b), moving: false };
      }

      function drawLevel() {
        const w = D.w;
        for (let i = 0; i < D.n; i++) {
          if (!D.inside[i]) continue;
          const x = cellX(i);
          const y = cellY(i);
          if (D.ice[i]) drawIce(ctx, x, y, tile, clock);
          else drawFloor(ctx, x, y, tile);
          if (D.goal[i]) drawPad(ctx, x + tile / 2, y + tile / 2, tile, clock, boxes.includes(i));
        }
        // Walls that touch the interior.
        for (let i = 0; i < D.n; i++) {
          if (!D.wall[i]) continue;
          const x0 = i % w;
          const y0 = (i / w) | 0;
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const nx = x0 + dx;
              const ny = y0 + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= D.h) continue;
              if (D.inside[ny * w + nx]) {
                near = true;
                break;
              }
            }
          }
          if (!near) continue;
          const below = y0 + 1 < D.h ? i + w : -1;
          drawWall(ctx, cellX(i), cellY(i), tile, below < 0 || !D.wall[below]);
        }
        // Crates.
        for (let k = 0; k < boxes.length; k++) {
          const p = boxPos(k);
          const done = D.goal[boxes[k]] && !slideOf(k);
          let glow = 0;
          if (done) {
            const at = doneGlow.get(k);
            glow = at != null && clock - at < 0.6 ? 1 - (clock - at) / 0.6 : state === 'won' || state === 'done' ? 0.6 : 0;
          }
          if (p.moving) {
            ctx.strokeStyle = 'rgba(226,248,255,.7)';
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            const d = DIRS[p.dir];
            for (let j = 0; j < 3; j++) {
              const off = (j - 1) * tile * 0.22;
              const sx = p.x + tile / 2 - d[0] * tile * 0.55 + (d[1] ? off : 0);
              const sy = p.y + tile / 2 - d[1] * tile * 0.55 + (d[0] ? off : 0);
              ctx.beginPath();
              ctx.moveTo(sx, sy);
              ctx.lineTo(sx - d[0] * tile * 0.5, sy - d[1] * tile * 0.5);
              ctx.stroke();
            }
          }
          drawCrate(ctx, p.x, p.y, tile, done, glow);
        }
        // You.
        let px = cellX(player);
        let py = cellY(player);
        if (anim) {
          const e = Math.min(1, anim.t / STEP);
          px = U.lerp(cellX(anim.from), cellX(anim.to), e);
          py = U.lerp(cellY(anim.from), cellY(anim.to), e);
        }
        if (bumpT > 0) {
          const d = DIRS[bumpDir];
          const k = Math.sin((bumpT / 0.18) * Math.PI) * tile * 0.08;
          px += d[0] * k;
          py += d[1] * k;
        }
        drawBot(ctx, px + tile / 2, py + tile / 2, tile, facing, clock);
      }

      function drawTopBar() {
        const lv = LEVELS[li];
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, TOP - 8);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, TOP - 9, W, 1);
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('LEVEL ' + (li + 1) + '/' + LEVELS.length, 20, TOP / 2 - 4);
        ctx.font = '800 18px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(lv.name, 130, TOP / 2 - 4);
        if (D.hasIce) {
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.fillStyle = ICE_MID;
          const nw = Math.min(260, lv.name.length * 14 + 10);
          ctx.fillText('· ice', 130 + nw, TOP / 2 - 4);
        }
        ctx.textAlign = 'right';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('PAR ' + lv.par, W - 20, TOP / 2 - 4);
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.fillStyle = moves > lv.par ? C.p1 : C.text;
        ctx.fillText(String(moves), W - 90, TOP / 2 - 4);
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('MOVES', W - 90 - ctx.measureText(String(moves)).width - 14 - 26, TOP / 2 - 4);
      }

      function drawBottomBar() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, H - BOTTOM, W, BOTTOM);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, H - BOTTOM, W, 1);
        for (const b of buttons) {
          const hot = hoverBtn === b && state === 'play';
          const down = pressedBtn === b;
          ctx.fillStyle = hot ? C.line : C.panel2;
          U.roundRect(ctx, b.x, b.y + (down ? 2 : 0), b.w, b.h, 11);
          ctx.fill();
          ctx.strokeStyle = hot ? C.muted : C.line;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.font = '700 15px "JetBrains Mono", monospace';
          ctx.fillStyle = C.text;
          ctx.fillText(b.label, b.x + 16, b.y + b.h / 2 + (down ? 2 : 0));
          ctx.textAlign = 'right';
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.fillStyle = C.muted;
          ctx.fillText(b.key, b.x + b.w - 14, b.y + b.h / 2 + (down ? 2 : 0));
        }
        // Crates placed.
        let placed = 0;
        for (const b of boxes) if (D.goal[b]) placed++;
        const rx = W - 20;
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('CRATES ON PADS', rx, by + bh / 2 - 9);
        const pip = 16;
        for (let k = 0; k < boxes.length; k++) {
          const x = rx - (boxes.length - k) * (pip + 6) + 6;
          ctx.fillStyle = k < placed ? DONE : C.ink;
          U.roundRect(ctx, x, by + bh / 2 + 2, pip, pip * 0.7, 3);
          ctx.fill();
          ctx.strokeStyle = k < placed ? DONE_DARK : C.line;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }

      /* ---------- Draw: level select ---------- */

      function drawSelect() {
        ctx.font = '800 26px Unbounded, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.text;
        ctx.fillText('Choose a level', GX, 62);
        const done = session.best.filter((b) => b != null).length;
        ctx.textAlign = 'right';
        ctx.font = FONT_HUD;
        ctx.fillStyle = C.muted;
        ctx.fillText(done + '/' + LEVELS.length + ' cleared · ' + totalScore() + ' pts', W - GX, 62);
        for (let k = 0; k < LEVELS.length; k++) {
          const r = cardRect(k);
          const best = session.best[k];
          const star = best != null && best <= LEVELS[k].par;
          const f = k === focus;
          ctx.fillStyle = f ? C.panel2 : C.panel;
          U.roundRect(ctx, r.x, r.y, r.w, r.h, 12);
          ctx.fill();
          ctx.strokeStyle = f ? C.gold : best != null ? U.alpha(DONE, 0.7) : C.line;
          ctx.lineWidth = f ? 2.5 : 1.5;
          ctx.stroke();
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          ctx.font = '800 24px Unbounded, sans-serif';
          ctx.fillStyle = best != null ? DONE : C.text;
          ctx.fillText(String(k + 1), r.x + 12, r.y + 36);
          ctx.font = '600 12px "JetBrains Mono", monospace';
          ctx.fillStyle = C.text;
          ctx.fillText(LEVELS[k].name, r.x + 12, r.y + 60);
          ctx.fillStyle = C.muted;
          ctx.fillText(best != null ? 'best ' + best + ' · par ' + LEVELS[k].par : 'par ' + LEVELS[k].par, r.x + 12, r.y + 80);
          if (DATA[k].hasIce) {
            ctx.fillStyle = ICE_MID;
            U.roundRect(ctx, r.x + r.w - 30, r.y + 12, 18, 18, 4);
            ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,.8)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(r.x + r.w - 26, r.y + 22);
            ctx.lineTo(r.x + r.w - 20, r.y + 16);
            ctx.stroke();
          }
          if (best != null) {
            ctx.strokeStyle = DONE;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(r.x + r.w - 56, r.y + 22);
            ctx.lineTo(r.x + r.w - 50, r.y + 28);
            ctx.lineTo(r.x + r.w - 40, r.y + 15);
            ctx.stroke();
          }
          if (star) {
            ctx.fillStyle = C.gold;
            const cx = r.x + r.w - 22;
            const cy = r.y + r.h - 22;
            ctx.beginPath();
            for (let j = 0; j < 10; j++) {
              const a = (j / 10) * Math.PI * 2 - Math.PI / 2;
              const rr = j % 2 ? 4 : 9;
              ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.textAlign = 'center';
        ctx.font = '600 13px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.fillText('Click a level, or use the arrow keys and Enter', W / 2, H - 24);
      }

      function drawEffects() {
        for (const p of particles) {
          ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 0.35));
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      function drawWinBanner() {
        if (state !== 'won' && state !== 'done') return;
        const k = Math.min(1, Math.max(0, 1.1 - (wonAt - clock)) / 0.3);
        if (k <= 0) return;
        const cy = TOP + (H - TOP - BOTTOM) / 2;
        ctx.globalAlpha = k;
        ctx.fillStyle = U.alpha(C.ink, 0.7);
        ctx.fillRect(0, cy - 44, W, 88);
        ctx.font = FONT_BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = DONE;
        ctx.shadowColor = DONE;
        ctx.shadowBlur = 16;
        ctx.fillText('Cleared!', W / 2, cy);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (state === 'select') {
          drawSelect();
          return;
        }
        drawLevel();
        drawEffects();
        drawTopBar();
        drawBottomBar();
        drawWinBanner();
      }

      startLevel(firstOpen(), true);
      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
