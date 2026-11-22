/* Snowball Siege — first-person snowball free-for-all drawn with a canvas raycaster.
   Pack snow walls in front of you; snowballs chip them away. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TAU = Math.PI * 2;

  /* ---------- Arena ---------- */
  const N = 24;
  const MAP_ROWS = [
    '########################',
    '#......R.........R.....#',
    '#.II...R...............#',
    '#.I.........II.....WW..#',
    '#..................WW..#',
    '#RR...WWW.........R....#',
    '#.....W.....R.....R..I.#',
    '#.....W.....R........I.#',
    '#..I...................#',
    '#..I.....II.....WW.....#',
    '#...........R...W....RR#',
    '#.WW........R..........#',
    '#.W....R...............#',
    '#......R.....II....I...#',
    '#...........II.....I...#',
    '#..II.............WWW..#',
    '#..........R...........#',
    '#.R....W...R.....I.....#',
    '#.R....W.........I..R..#',
    '#......WWW..........R..#',
    '#............II........#',
    '#..I....R.........WW...#',
    '#..I....R..............#',
    '########################'
  ];
  const SPAWNS = [[1, 1], [22, 1], [1, 22], [22, 22], [11, 1], [1, 12], [22, 12], [12, 22], [9, 7], [14, 17]];
  const ICE = 1;
  const ROCK = 2;
  const WOOD = 3;
  const SNOW = 4;
  const DX4 = [1, -1, 0, 0];
  const DY4 = [0, 0, 1, -1];

  /* ---------- Rendering ---------- */
  const RAY_W = 2;
  const RAYS = W / RAY_W;
  const PLANE = 0.66;
  const PROJ = (W / 2) / PLANE;
  const EYE = 0.5;
  const FOG_LEVELS = 32;
  const FOG = [43, 39, 96];
  const BASE = ['#000000', '#7FB4E8', '#8C80CC', '#C08A5C', '#EEF2FF'];

  /* ---------- Rules ---------- */
  const MATCH = 180;
  const MAX_HP = 3;
  const RESPAWN = 3;
  const INVULN = 1.5;
  const MOVE = 3.2;
  const KEY_TURN = 2.6;
  const R = 0.22;
  const HIT_R = 0.32;
  const BALL_SPEED = 10;
  const BALL_VZ = 1.2;
  const GRAV = 4;
  const THROW_CD = 0.45;
  const PACK_CD = 1;
  const WALL_HP = 3;
  const MAX_WALLS = 3;
  const RISE = 0.3;
  const MAX_BALLS = 64;
  const MAX_PARTS = 180;
  const COLORS = [C.p1, C.p2, C.gold, C.mint, C.violet, '#FF9F45'];
  const DIFF = {
    easy: { speed: 0.72, turn: 2.4, react: 0.8, err: 0.13, throwCd: 1.15, look: 0.32, fov: 1.1, build: 0.25, lead: 0.15, range: 6.5 },
    normal: { speed: 0.88, turn: 3.6, react: 0.45, err: 0.065, throwCd: 0.8, look: 0.18, fov: 1.35, build: 0.5, lead: 0.6, range: 7.8 },
    hard: { speed: 1, turn: 5, react: 0.22, err: 0.03, throwCd: 0.58, look: 0.1, fov: 1.6, build: 0.8, lead: 0.95, range: 8.5 }
  };
  const NAME_A = ['Captain', 'Sir', 'Lady', 'Doctor', 'Big', 'Lil', 'Professor', 'Agent', 'Baron', 'Auntie'];
  const NAME_B = ['Crumb', 'Wobble', 'Flurry', 'Mittens', 'Slush', 'Pebble', 'Biscuit', 'Noodle', 'Puddle', 'Sprout', 'Gumdrop', 'Pickle', 'Waffles', 'Snowpea'];
  const NAME_SOLO = ['NoodleArm', 'IcyToes', 'SnowCone', 'ChillyBean', 'Brr-ito', 'FrostyFeet', 'Sleetwood', 'Mr Shiver', 'Glacier Greg', 'Pom-Pom', 'Sir Wobble', 'Captain Crumb'];

  function botNames(n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      const name = Math.random() < 0.5 ? U.pick(NAME_SOLO) : U.pick(NAME_A) + ' ' + U.pick(NAME_B);
      if (out.indexOf(name) < 0) out.push(name);
    }
    while (out.length < n) out.push('Snowbot ' + (out.length + 1));
    return out;
  }

  function hexRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* 32 css colours from `hex` (scaled by mult) fading into the fog colour. */
  function fogRamp(hex, mult) {
    const c = hexRgb(hex);
    const out = [];
    for (let i = 0; i < FOG_LEVELS; i++) {
      const f = i / (FOG_LEVELS - 1);
      out.push('rgb(' + Math.round(c[0] * mult * (1 - f) + FOG[0] * f) + ',' +
        Math.round(c[1] * mult * (1 - f) + FOG[1] * f) + ',' +
        Math.round(c[2] * mult * (1 - f) + FOG[2] * f) + ')');
    }
    return out;
  }

  function fogIndex(d) {
    const i = ((1 - Math.exp(-d * 0.1)) * 36) | 0;
    return i > FOG_LEVELS - 1 ? FOG_LEVELS - 1 : i < 0 ? 0 : i;
  }

  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  const WALL_COL = [];
  const SEAM_COL = [];
  for (let t = 0; t <= SNOW; t++) {
    WALL_COL.push([fogRamp(BASE[t], 1), fogRamp(BASE[t], 0.76)]);
    SEAM_COL.push([fogRamp(BASE[t], t === SNOW ? 0.62 : 0.6), fogRamp(BASE[t], t === SNOW ? 0.48 : 0.45)]);
  }
  const CAP_COL = fogRamp('#F2F5FF', 1);
  const SNOW_R = fogRamp('#F4F6FF', 1);
  const SNOW_SH = fogRamp('#AEB8E4', 1);
  const COAL = fogRamp('#1A1730', 1);
  const CARROT = fogRamp('#FF9F45', 1);
  const STICK = fogRamp('#7A5236', 1);
  const PCOL = COLORS.map((c) => fogRamp(c, 1));

  /* ---------- Drawing helpers shared by the game and the card ---------- */
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r > 0.5 ? r : 0.5, 0, TAU);
    ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx > 0.5 ? rx : 0.5, ry > 0.5 ? ry : 0.5, 0, 0, TAU);
    ctx.fill();
  }

  /* A round snow-folk standing on the floor line gy, s px per world unit.
     look: -1..1 sideways head turn, facing: whether the face is visible. */
  function drawFolk(ctx, sx, gy, s, fi, colIdx, look, facing, arm, walk) {
    const bob = Math.sin(walk) * 0.012 * s;
    ctx.fillStyle = 'rgba(8,6,26,0.35)';
    ellipse(ctx, sx, gy, 0.3 * s, 0.05 * s);
    // Stick arms.
    ctx.strokeStyle = STICK[fi];
    ctx.lineWidth = Math.max(1, 0.025 * s);
    ctx.beginPath();
    ctx.moveTo(sx - 0.14 * s, gy - 0.52 * s + bob);
    ctx.lineTo(sx - 0.34 * s, gy - 0.62 * s + bob);
    ctx.moveTo(sx + 0.14 * s, gy - 0.52 * s + bob);
    if (arm > 0) ctx.lineTo(sx + 0.26 * s, gy - 0.88 * s);
    else ctx.lineTo(sx + 0.34 * s, gy - 0.6 * s + bob);
    ctx.stroke();
    // Three snow balls with a soft shade.
    ctx.fillStyle = SNOW_SH[fi];
    circle(ctx, sx, gy - 0.22 * s, 0.24 * s);
    circle(ctx, sx, gy - 0.52 * s + bob, 0.18 * s);
    circle(ctx, sx, gy - 0.76 * s + bob, 0.14 * s);
    ctx.fillStyle = SNOW_R[fi];
    circle(ctx, sx - 0.03 * s, gy - 0.24 * s, 0.2 * s);
    circle(ctx, sx - 0.025 * s, gy - 0.54 * s + bob, 0.145 * s);
    circle(ctx, sx - 0.02 * s, gy - 0.78 * s + bob, 0.11 * s);
    // Scarf and woolly hat in the player's colour.
    ctx.fillStyle = PCOL[colIdx][fi];
    U.roundRect(ctx, sx - 0.15 * s, gy - 0.67 * s + bob, 0.3 * s, 0.06 * s, 0.03 * s);
    ctx.fill();
    if (!facing) ctx.fillRect(sx + 0.04 * s, gy - 0.66 * s + bob, 0.06 * s, 0.16 * s);
    ctx.beginPath();
    ctx.arc(sx, gy - 0.84 * s + bob, 0.125 * s, Math.PI, TAU);
    ctx.fill();
    ctx.fillRect(sx - 0.135 * s, gy - 0.86 * s + bob, 0.27 * s, 0.035 * s);
    ctx.fillStyle = SNOW_R[fi];
    circle(ctx, sx, gy - 0.97 * s + bob, 0.04 * s);
    if (facing) {
      const ex = sx + look * 0.05 * s;
      ctx.fillStyle = COAL[fi];
      circle(ctx, ex - 0.045 * s, gy - 0.79 * s + bob, 0.018 * s);
      circle(ctx, ex + 0.045 * s, gy - 0.79 * s + bob, 0.018 * s);
      circle(ctx, sx, gy - 0.46 * s + bob, 0.018 * s);
      circle(ctx, sx, gy - 0.54 * s + bob, 0.018 * s);
      ctx.fillStyle = CARROT[fi];
      ctx.beginPath();
      ctx.moveTo(ex - 0.02 * s, gy - 0.755 * s + bob);
      ctx.lineTo(ex + 0.02 * s, gy - 0.755 * s + bob);
      ctx.lineTo(ex + look * 0.09 * s, gy - 0.72 * s + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  Arcade.register({
    id: 'snowball-siege',
    title: 'Snowball Siege',
    category: 'io',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.p2,
    tagline: 'A first-person snowball free-for-all against five snow-folk.',
    hook: 'Pack a snow wall in front of you in a second; snowballs chip walls away.',
    tags: ['io', 'fps', 'first-person', 'shooter', 'arena', 'snowball', 'bots', 'free-for-all', 'raycaster', 'winter'],
    howTo: 'Three minutes, six snow-folk, one icy arena. Every snowball that lands scores a point, and the third hit ' +
      'knocks a player out for 3 seconds for 3 more points. Snowballs fly in a gentle arc, so lead moving targets. ' +
      'The twist: press E to pack a snow wall in the cell in front of you. It blocks throws, but every snowball ' +
      'chips it, and after 3 hits it crumbles. You can keep 3 walls at once; packing a fourth melts your oldest.',
    controls: [
      { keys: ['W', 'S'], label: 'Move' },
      { keys: ['A', 'D'], label: 'Strafe' },
      { keys: ['Mouse'], label: 'Look (click the view to lock)' },
      { keys: ['←', '→'], label: 'Turn without a mouse' },
      { keys: ['Click', 'Space'], label: 'Throw a snowball' },
      { keys: ['E', 'Right-click'], label: 'Pack a snow wall' }
    ],

    drawThumb(ctx, w, h, t) {
      const hz = h * 0.52;
      let g = ctx.createLinearGradient(0, 0, 0, hz);
      g.addColorStop(0, '#0B0A1E');
      g.addColorStop(1, '#2B2760');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, hz);
      g = ctx.createLinearGradient(0, hz, 0, h);
      g.addColorStop(0, '#2B2760');
      g.addColorStop(1, '#9AA6D8');
      ctx.fillStyle = g;
      ctx.fillRect(0, hz, w, h - hz);
      ctx.fillStyle = 'rgba(243,240,255,0.7)';
      for (let i = 0; i < 26; i++) ctx.fillRect((i * 97) % w, (i * 53) % (hz - 30) + 6, 1.5, 1.5);
      ctx.fillStyle = '#E9E4C8';
      circle(ctx, w * 0.78, h * 0.16, 9);
      // Corridor walls in perspective.
      const side = (x0, x1, top0, top1, col, seam) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(x0, hz - top0);
        ctx.lineTo(x1, hz - top1);
        ctx.lineTo(x1, hz + top1);
        ctx.lineTo(x0, hz + top0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#F2F5FF';
        ctx.beginPath();
        ctx.moveTo(x0, hz - top0);
        ctx.lineTo(x1, hz - top1);
        ctx.lineTo(x1, hz - top1 * 0.86);
        ctx.lineTo(x0, hz - top0 * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = seam;
        ctx.lineWidth = 1.5;
        for (let k = 1; k < 3; k++) {
          ctx.beginPath();
          ctx.moveTo(x0, hz + top0 - (2 * top0) * k / 3);
          ctx.lineTo(x1, hz + top1 - (2 * top1) * k / 3);
          ctx.stroke();
        }
      };
      side(0, w * 0.26, h * 0.62, h * 0.2, '#6E9DD0', '#4C6E96');
      side(w, w * 0.8, h * 0.5, h * 0.18, '#7A6FB5', '#544A86');
      ctx.fillStyle = '#3A3470';
      ctx.fillRect(w * 0.26, hz - h * 0.12, w * 0.54, h * 0.24);
      // A snow-folk peeking out, and a cracked snow wall in front.
      drawFolk(ctx, w * 0.66, hz + h * 0.14, 78, 6, 1, -0.6, true, Math.sin(t * 3) > 0 ? 1 : 0, t * 6);
      const bx = w * 0.3;
      const by = hz + h * 0.32;
      ctx.fillStyle = '#C9D0F0';
      ctx.fillRect(bx, by - 86, 112, 86);
      ctx.fillStyle = '#EEF2FF';
      ctx.fillRect(bx + 6, by - 86, 112, 80);
      ctx.fillStyle = C.p1;
      ctx.fillRect(bx + 6, by - 14, 112, 8);
      ctx.strokeStyle = '#8F98C8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + 40, by - 86);
      ctx.lineTo(bx + 52, by - 62);
      ctx.lineTo(bx + 44, by - 44);
      ctx.moveTo(bx + 52, by - 62);
      ctx.lineTo(bx + 70, by - 54);
      ctx.stroke();
      // Snowball arcing toward the wall, with a puff on impact.
      const p = (t * 0.7) % 1;
      const sx = w * 0.62 - p * w * 0.24;
      const sy = h * 0.42 - Math.sin(p * Math.PI) * 18;
      ctx.fillStyle = '#F4F6FF';
      circle(ctx, sx, sy, 7 - p * 2);
      if (p > 0.82) {
        ctx.fillStyle = 'rgba(244,246,255,0.8)';
        for (let i = 0; i < 6; i++) circle(ctx, bx + 110 + Math.cos(i) * 10 * (p - 0.8) * 5, by - 60 + Math.sin(i * 2) * 10 * (p - 0.8) * 5, 3);
      }
      // Crosshair and the pack-wall key.
      ctx.strokeStyle = '#F3F0FF';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - 8, h / 2);
      ctx.lineTo(w / 2 - 3, h / 2);
      ctx.moveTo(w / 2 + 3, h / 2);
      ctx.lineTo(w / 2 + 8, h / 2);
      ctx.moveTo(w / 2, h / 2 - 8);
      ctx.lineTo(w / 2, h / 2 - 3);
      ctx.moveTo(w / 2, h / 2 + 3);
      ctx.lineTo(w / 2, h / 2 + 8);
      ctx.stroke();
      ctx.fillStyle = 'rgba(15,13,36,0.75)';
      U.roundRect(ctx, w - 92, h - 34, 82, 24, 6);
      ctx.fill();
      ctx.fillStyle = C.p2;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('E  wall', w - 51, h - 22);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const keys = api.keys;

      /* ---------- World state ---------- */
      const grid = new Uint8Array(N * N);
      const wallHp = new Uint8Array(N * N);
      const wallOwner = new Int8Array(N * N);
      const wallBorn = new Float32Array(N * N);
      const depth = new Float32Array(RAYS);
      const bfsPrev = new Int16Array(N * N);
      const bfsQueue = new Int16Array(N * N);
      const openCells = [];
      const RAY = { dist: 0, side: 0, cell: 0, u: 0 };
      const PRJ = { x: 0, d: 0 };
      const stars = [];
      for (let i = 0; i < 70; i++) stars.push({ a: Math.random() * TAU, y: 8 + Math.random() * 230, s: Math.random() < 0.2 ? 2 : 1.2 });

      const balls = [];
      for (let i = 0; i < MAX_BALLS; i++) balls.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: 0, life: 0, d: 0, sx: 0 });
      const parts = [];
      for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, big: false });
      const drawList = [];

      let state = 'menu';
      let diffName = 'normal';
      let D = DIFF.normal;
      let players = [];
      let ranked = [];
      let you = null;
      let clock = 0;
      let matchT = 0;
      let countT = 0;
      let goT = 0;
      let shake = 0;
      let hurt = 0;
      let hurtAng = 0;
      let hitMark = 0;
      let hitMarkKo = false;
      let feed = [];
      let horizon = H / 2;
      let walkBob = 0;
      let hintHit = false;
      let hintChip = false;
      let hintPack = false;
      let lastSec = 0;
      let locked = false;
      let dragging = false;
      let dragX = 0;
      let dragMoved = 0;
      let skyGrad = null;
      let floorGrad = null;

      let lockSupported = typeof canvas.requestPointerLock === 'function';

      function resetGrid() {
        openCells.length = 0;
        for (let y = 0; y < N; y++) {
          for (let x = 0; x < N; x++) {
            const ch = MAP_ROWS[y][x];
            const i = y * N + x;
            grid[i] = ch === '#' || ch === 'I' ? ICE : ch === 'R' ? ROCK : ch === 'W' ? WOOD : 0;
            wallHp[i] = 0;
            wallOwner[i] = -1;
            if (!grid[i]) openCells.push(i);
          }
        }
      }

      function blocked(x, y) {
        if (x < 0 || y < 0 || x >= N || y >= N) return true;
        return grid[(y | 0) * N + (x | 0)] !== 0;
      }

      function moveEntity(p, dx, dy) {
        const nx = p.x + dx;
        if (!blocked(nx + (dx > 0 ? R : -R), p.y - R) && !blocked(nx + (dx > 0 ? R : -R), p.y + R)) p.x = nx;
        const ny = p.y + dy;
        if (!blocked(p.x - R, ny + (dy > 0 ? R : -R)) && !blocked(p.x + R, ny + (dy > 0 ? R : -R))) p.y = ny;
      }

      /* First blocking cell on the segment a->b, or -1 when the line is clear. */
      function losBlock(ax, ay, bx, by) {
        let x = ax | 0;
        let y = ay | 0;
        const tx = bx | 0;
        const ty = by | 0;
        const dx = bx - ax;
        const dy = by - ay;
        const sx = dx > 0 ? 1 : -1;
        const sy = dy > 0 ? 1 : -1;
        const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9;
        const tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
        let tmx = dx !== 0 ? (dx > 0 ? x + 1 - ax : ax - x) * tdx : 1e9;
        let tmy = dy !== 0 ? (dy > 0 ? y + 1 - ay : ay - y) * tdy : 1e9;
        for (let i = 0; i < 80; i++) {
          if (x === tx && y === ty) return -1;
          if (tmx < tmy) { tmx += tdx; x += sx; } else { tmy += tdy; y += sy; }
          if (x < 0 || y < 0 || x >= N || y >= N) return 0;
          const c = y * N + x;
          if (grid[c]) return c;
        }
        return -1;
      }

      function findPath(from, to, out) {
        if (from === to) return 0;
        if (grid[to]) return -1;
        bfsPrev.fill(-1);
        let head = 0;
        let tail = 0;
        bfsQueue[tail++] = from;
        bfsPrev[from] = from;
        while (head < tail) {
          const c = bfsQueue[head++];
          if (c === to) break;
          const cx = c % N;
          const cy = (c / N) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = cx + DX4[k];
            const ny = cy + DY4[k];
            if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
            const n = ny * N + nx;
            if (bfsPrev[n] !== -1 || grid[n]) continue;
            bfsPrev[n] = c;
            bfsQueue[tail++] = n;
          }
        }
        if (bfsPrev[to] === -1) return -1;
        let len = 0;
        let c = to;
        while (c !== from && len < out.length) {
          out[len++] = c;
          c = bfsPrev[c];
        }
        for (let i = 0; i < len >> 1; i++) {
          const tmp = out[i];
          out[i] = out[len - 1 - i];
          out[len - 1 - i] = tmp;
        }
        return len;
      }

      /* ---------- Players ---------- */
      function makePlayer(idx, name, isBot) {
        return {
          idx, name, isBot, color: COLORS[idx],
          x: 1.5, y: 1.5, ang: 0, vx: 0, vy: 0, ox: 0, oy: 0,
          hp: MAX_HP, alive: true, respawnT: 0, invuln: 0,
          hits: 0, kos: 0, score: 0,
          throwCd: 0, packCd: 0, throwAnim: 0, hitFlash: 0, walk: 0,
          walls: [], d: 0, sx: 0,
          skill: isBot ? U.rand(0.82, 1.18) : 1,
          ai: isBot ? {
            path: new Int16Array(N * N), len: 0, at: 0, goal: -1, repath: 0,
            target: null, seenT: -99, lx: 0, ly: 0, look: 0, react: 0, err: 0,
            strafe: 1, strafeT: 0, coverT: 0, stuck: 0, sx: 0, sy: 0, roamT: 0,
            buildT: -1, buildAng: 0, wallAim: -1
          } : null
        };
      }

      function spawn(p) {
        let best = null;
        let bestD = -1;
        for (const s of SPAWNS) {
          const i = s[1] * N + s[0];
          if (grid[i]) continue;
          const cx = s[0] + 0.5;
          const cy = s[1] + 0.5;
          let md = 99;
          for (const o of players) {
            if (o === p || !o.alive) continue;
            md = Math.min(md, Math.hypot(o.x - cx, o.y - cy));
          }
          md += Math.random() * 3;
          if (md > bestD) { bestD = md; best = s; }
        }
        if (!best) {
          const c = U.pick(openCells.filter((i) => !grid[i]));
          best = [c % N, (c / N) | 0];
        }
        p.x = best[0] + 0.5;
        p.y = best[1] + 0.5;
        p.ox = p.x;
        p.oy = p.y;
        p.ang = Math.atan2(N / 2 - p.y, N / 2 - p.x);
        p.hp = MAX_HP;
        p.alive = true;
        p.invuln = INVULN;
        if (p.ai) {
          p.ai.len = 0;
          p.ai.target = null;
          p.ai.seenT = -99;
          p.ai.coverT = 0;
          p.ai.repath = 0;
          p.ai.buildT = -1;
        }
      }

      /* ---------- Walls ---------- */
      function packCell(p, ang) {
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const own = (p.y | 0) * N + (p.x | 0);
        for (let k = 0; k < 2; k++) {
          const dist = k === 0 ? 1 : 1.55;
          const cx = (p.x + ca * dist) | 0;
          const cy = (p.y + sa * dist) | 0;
          if (cx < 1 || cy < 1 || cx >= N - 1 || cy >= N - 1) continue;
          const c = cy * N + cx;
          if (c === own) continue;
          if (grid[c]) return -1;
          for (const o of players) {
            if (!o.alive) continue;
            const qx = U.clamp(o.x, cx, cx + 1);
            const qy = U.clamp(o.y, cy, cy + 1);
            if ((o.x - qx) * (o.x - qx) + (o.y - qy) * (o.y - qy) < (R + 0.06) * (R + 0.06)) return -1;
          }
          return c;
        }
        return -1;
      }

      function removeWall(c, melt) {
        const owner = players[wallOwner[c]];
        if (owner) {
          const i = owner.walls.indexOf(c);
          if (i >= 0) owner.walls.splice(i, 1);
        }
        grid[c] = 0;
        wallHp[c] = 0;
        wallOwner[c] = -1;
        const cx = (c % N) + 0.5;
        const cy = ((c / N) | 0) + 0.5;
        for (let i = 0; i < (melt ? 8 : 16); i++) {
          puff(cx + U.rand(-0.4, 0.4), cy + U.rand(-0.4, 0.4), U.rand(0.1, 0.9), U.rand(-1.5, 1.5), U.rand(-1.5, 1.5), U.rand(0, 2.5), true);
        }
        if (Math.hypot(cx - you.x, cy - you.y) < 9) api.sfx(melt ? 'flip' : 'boom');
      }

      function tryPack(p, ang) {
        if (state !== 'play' || !p.alive || p.packCd > 0) return false;
        const c = packCell(p, ang);
        if (c < 0) return false;
        if (p.walls.length >= MAX_WALLS) removeWall(p.walls[0], true);
        grid[c] = SNOW;
        wallHp[c] = WALL_HP;
        wallOwner[c] = p.idx;
        wallBorn[c] = clock;
        p.walls.push(c);
        p.packCd = PACK_CD;
        const cx = (c % N) + 0.5;
        const cy = ((c / N) | 0) + 0.5;
        for (let i = 0; i < 10; i++) puff(cx + U.rand(-0.5, 0.5), cy + U.rand(-0.5, 0.5), 0.05, U.rand(-1, 1), U.rand(-1, 1), U.rand(0.5, 2), false);
        if (p === you) {
          api.sfx('power');
          if (!hintPack) {
            hintPack = true;
            api.setStatus('Wall packed. It takes 3 snowballs to break, and you can keep 3 at once.');
          }
        } else if (Math.hypot(cx - you.x, cy - you.y) < 8) {
          api.sfx('tick');
        }
        return true;
      }

      /* ---------- Snowballs + particles ---------- */
      function puff(x, y, z, vx, vy, vz, big) {
        for (const q of parts) {
          if (q.on) continue;
          q.on = true;
          q.x = x; q.y = y; q.z = z; q.vx = vx; q.vy = vy; q.vz = vz;
          q.max = q.life = U.rand(0.35, 0.8);
          q.big = big;
          return;
        }
      }

      function splash(x, y, z, n) {
        for (let i = 0; i < n; i++) puff(x, y, z, U.rand(-1.6, 1.6), U.rand(-1.6, 1.6), U.rand(0.2, 2.2), false);
      }

      function throwBall(p, ang) {
        if (!p.alive || p.throwCd > 0 || state !== 'play') return;
        let b = null;
        for (const q of balls) if (!q.on) { b = q; break; }
        if (!b) return;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        b.on = true;
        b.x = p.x + ca * 0.25;
        b.y = p.y + sa * 0.25;
        if (blocked(b.x, b.y)) { b.x = p.x; b.y = p.y; }
        b.z = 0.55;
        b.vx = ca * BALL_SPEED;
        b.vy = sa * BALL_SPEED;
        b.vz = BALL_VZ;
        b.owner = p.idx;
        b.life = 2;
        p.throwCd = p.isBot ? D.throwCd / p.skill * U.rand(0.85, 1.25) : THROW_CD;
        p.throwAnim = 0.3;
        if (p === you) api.sfx('shoot');
      }

      function hitPlayer(t, b) {
        const thrower = players[b.owner];
        splash(b.x, b.y, b.z, 9);
        if (t.invuln > 0) return;
        t.hp -= 1;
        t.hitFlash = 0.25;
        thrower.hits += 1;
        if (t === you) {
          hurt = 1;
          shake = 0.25;
          hurtAng = angDiff(Math.atan2(-b.vy, -b.vx), you.ang);
          api.sfx('hit');
          if (!hintHit) {
            hintHit = true;
            api.setStatus('Hit! Press E to pack a snow wall between you and the thrower.');
          }
        }
        if (thrower === you) {
          hitMark = 0.3;
          hitMarkKo = false;
          api.sfx('tick');
        }
        if (t.ai) {
          // Getting hit tells you roughly where it came from.
          t.ai.lx = thrower.x;
          t.ai.ly = thrower.y;
          t.ai.seenT = clock;
          if (!t.ai.target || !t.ai.target.alive) t.ai.target = thrower;
          if (t.packCd <= 0 && t.ai.buildT < 0 && Math.random() < D.build * t.skill && Math.hypot(thrower.x - t.x, thrower.y - t.y) > 2.2) {
            t.ai.buildT = 0.15 + Math.random() * 0.25;
            t.ai.buildAng = Math.atan2(thrower.y - t.y, thrower.x - t.x);
          }
        }
        if (t.hp <= 0) {
          t.alive = false;
          t.respawnT = RESPAWN;
          thrower.kos += 1;
          for (let i = 0; i < 18; i++) puff(t.x, t.y, U.rand(0.1, 0.9), U.rand(-2, 2), U.rand(-2, 2), U.rand(0.5, 3), true);
          feed.unshift({ a: thrower.name, ac: thrower.idx, b: t.name, bc: t.idx, t: 4 });
          if (feed.length > 4) feed.length = 4;
          if (thrower === you) {
            hitMarkKo = true;
            api.sfx('score');
          }
          if (t === you) {
            api.sfx('lose');
            api.setStatus(thrower.name + ' knocked you out. Back in 3 seconds.');
          }
        }
        thrower.score = thrower.hits + thrower.kos * 3;
        if (thrower === you) api.setScore(you.score);
      }

      function hitWall(b, c) {
        b.on = false;
        // Pull the splash back out of the wall a little.
        const sp = Math.hypot(b.vx, b.vy) || 1;
        splash(b.x - b.vx / sp * 0.08, b.y - b.vy / sp * 0.08, b.z, 6);
        if (c >= 0 && grid[c] === SNOW) {
          wallHp[c] -= 1;
          const near = Math.hypot(b.x - you.x, b.y - you.y) < 7;
          if (wallHp[c] <= 0) removeWall(c, false);
          else if (near) api.sfx('hit');
          if (near && !hintChip) {
            hintChip = true;
            api.setStatus('Snowballs chip snow walls. Three hits and a wall crumbles.');
          }
        }
      }

      function updateBalls(dt) {
        for (const b of balls) {
          if (!b.on) continue;
          b.life -= dt;
          if (b.life <= 0) { b.on = false; continue; }
          const steps = Math.max(1, Math.ceil(BALL_SPEED * dt / 0.1));
          const h = dt / steps;
          for (let s = 0; s < steps && b.on; s++) {
            b.vz -= GRAV * h;
            b.x += b.vx * h;
            b.y += b.vy * h;
            b.z += b.vz * h;
            if (b.x < 0 || b.y < 0 || b.x >= N || b.y >= N) { b.on = false; break; }
            const c = (b.y | 0) * N + (b.x | 0);
            if (grid[c]) { hitWall(b, c); break; }
            if (b.z <= 0) {
              b.on = false;
              b.z = 0.02;
              splash(b.x, b.y, 0.02, 5);
              break;
            }
            if (b.z > 0.98) continue;
            for (const p of players) {
              if (!p.alive || p.idx === b.owner) continue;
              const dx = p.x - b.x;
              const dy = p.y - b.y;
              if (dx * dx + dy * dy < HIT_R * HIT_R) {
                b.on = false;
                hitPlayer(p, b);
                break;
              }
            }
          }
        }
      }

      function updateParts(dt) {
        for (const q of parts) {
          if (!q.on) continue;
          q.life -= dt;
          if (q.life <= 0) { q.on = false; continue; }
          q.vz -= 6 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.z += q.vz * dt;
          if (q.z < 0) { q.z = 0; q.vz = 0; q.vx *= 0.5; q.vy *= 0.5; }
        }
      }

      /* ---------- Bots ---------- */
      function botSee(b, o) {
        const dx = o.x - b.x;
        const dy = o.y - b.y;
        const d = Math.hypot(dx, dy);
        if (d > 13) return false;
        if (d > 2.5 && Math.abs(angDiff(Math.atan2(dy, dx), b.ang)) > D.fov * b.skill * 0.5 + 0.2) return false;
        return losBlock(b.x, b.y, o.x, o.y) === -1;
      }

      function pickRoamGoal(b) {
        for (let tries = 0; tries < 20; tries++) {
          const c = openCells[(Math.random() * openCells.length) | 0];
          if (grid[c]) continue;
          const cx = c % N + 0.5;
          const cy = ((c / N) | 0) + 0.5;
          if (Math.hypot(cx - b.x, cy - b.y) > 5) return c;
        }
        return openCells[(Math.random() * openCells.length) | 0];
      }

      function steer(b, tx, ty, speed, dt) {
        const dx = tx - b.x;
        const dy = ty - b.y;
        const d = Math.hypot(dx, dy) || 1;
        moveEntity(b, dx / d * speed * dt, dy / d * speed * dt);
      }

      function turnTo(b, a, rate, dt) {
        const d = angDiff(a, b.ang);
        const m = rate * dt;
        b.ang += d > m ? m : d < -m ? -m : d;
      }

      function followPath(b, goalCell, speed, dt) {
        const ai = b.ai;
        const here = (b.y | 0) * N + (b.x | 0);
        if (ai.goal !== goalCell || ai.repath <= 0) {
          ai.goal = goalCell;
          ai.len = findPath(here, goalCell, ai.path);
          ai.at = 0;
          ai.repath = 0.8 + Math.random() * 0.6;
          if (ai.len < 0) { ai.len = 0; return -1; }
        }
        if (ai.at >= ai.len) return 0;
        const c = ai.path[ai.at];
        if (grid[c]) { ai.repath = 0; return 1; }
        const cx = c % N + 0.5;
        const cy = ((c / N) | 0) + 0.5;
        if (Math.hypot(cx - b.x, cy - b.y) < 0.3) { ai.at++; return 1; }
        steer(b, cx, cy, speed, dt);
        turnTo(b, Math.atan2(cy - b.y, cx - b.x), D.turn * 0.7, dt);
        return 1;
      }

      function adjacentSnow(b) {
        const cx = b.x | 0;
        const cy = b.y | 0;
        for (let k = 0; k < 4; k++) {
          const c = (cy + DY4[k]) * N + cx + DX4[k];
          if (grid[c] === SNOW) return c;
        }
        return -1;
      }

      function updateBot(b, dt) {
        const ai = b.ai;
        const speed = MOVE * D.speed * (0.9 + b.skill * 0.1);
        ai.look -= dt;
        ai.react -= dt;
        ai.repath -= dt;
        ai.coverT -= dt;
        ai.strafeT -= dt;
        ai.roamT -= dt;

        if (ai.buildT >= 0) {
          ai.buildT -= dt;
          turnTo(b, ai.buildAng, D.turn * 1.5, dt);
          if (ai.buildT < 0) {
            if (tryPack(b, ai.buildAng)) {
              ai.coverT = 1.6 + Math.random() * 1.4;
              ai.strafe = Math.random() < 0.5 ? 1 : -1;
            }
          }
          return;
        }

        if (ai.look <= 0) {
          ai.look = D.look * U.rand(0.8, 1.2);
          let best = null;
          let bestScore = 1e9;
          for (const o of players) {
            if (o === b || !o.alive) continue;
            if (!botSee(b, o)) continue;
            let sc = Math.hypot(o.x - b.x, o.y - b.y);
            if (o === ai.target) sc -= 2;
            if (o.invuln > 0.4) sc += 6;
            if (sc < bestScore) { bestScore = sc; best = o; }
          }
          if (best) {
            if (best !== ai.target || clock - ai.seenT > 1) {
              ai.react = D.react / b.skill * U.rand(0.8, 1.3);
              ai.err = (Math.random() * 2 - 1) * D.err / b.skill;
            }
            ai.target = best;
            ai.seenT = clock;
            ai.lx = best.x;
            ai.ly = best.y;
          } else if (ai.target && !ai.target.alive) {
            ai.target = null;
          }
        }

        const t = ai.target;
        const visible = t && t.alive && clock - ai.seenT < 0.35;
        if (visible) {
          const dx = t.x - b.x;
          const dy = t.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          const tt = d / BALL_SPEED * D.lead;
          const aim = Math.atan2(t.y + t.vy * tt - b.y, t.x + t.vx * tt - b.x) + ai.err;
          turnTo(b, aim, D.turn * b.skill, dt);
          if (ai.coverT <= 0) {
            if (ai.strafeT <= 0) {
              ai.strafeT = U.rand(0.5, 1.4);
              if (Math.random() < 0.55) ai.strafe = -ai.strafe;
            }
            let mx = -dy / d * ai.strafe;
            let my = dx / d * ai.strafe;
            if (d > 6.2) { mx += dx / d * 0.9; my += dy / d * 0.9; } else if (d < 3) { mx -= dx / d * 0.8; my -= dy / d * 0.8; }
            const ml = Math.hypot(mx, my) || 1;
            const bx = b.x;
            const by = b.y;
            moveEntity(b, mx / ml * speed * 0.85 * dt, my / ml * speed * 0.85 * dt);
            if (Math.abs(b.x - bx) + Math.abs(b.y - by) < speed * dt * 0.3) ai.strafe = -ai.strafe;
          }
          if (ai.react <= 0 && b.throwCd <= 0 && d < D.range && Math.abs(angDiff(aim, b.ang)) < 0.09) {
            throwBall(b, b.ang);
            ai.err = (Math.random() * 2 - 1) * D.err / b.skill;
          }
          if (b.hp === 1 && d > 2.5 && b.packCd <= 0 && Math.random() < D.build * 0.6 * dt) {
            ai.buildT = 0.2;
            ai.buildAng = Math.atan2(dy, dx);
          }
          return;
        }

        if (ai.coverT > 0) {
          turnTo(b, Math.atan2(ai.ly - b.y, ai.lx - b.x), D.turn, dt);
          return;
        }

        // Recently seen: chip through a snow wall in the way, or chase the last known spot.
        if (t && clock - ai.seenT < 4) {
          const blk = losBlock(b.x, b.y, ai.lx, ai.ly);
          if (blk > 0 && grid[blk] === SNOW && wallOwner[blk] !== b.idx && clock - ai.seenT < 2.5) {
            const wx = blk % N + 0.5;
            const wy = ((blk / N) | 0) + 0.5;
            const wd = Math.hypot(wx - b.x, wy - b.y);
            if (wd < D.range) {
              const aim = Math.atan2(wy - b.y, wx - b.x);
              turnTo(b, aim, D.turn, dt);
              if (b.throwCd <= 0 && Math.abs(angDiff(aim, b.ang)) < 0.12) throwBall(b, b.ang);
              return;
            }
          }
          const goal = (ai.ly | 0) * N + (ai.lx | 0);
          if (Math.hypot(ai.lx - b.x, ai.ly - b.y) > 0.6 && !grid[goal] && followPath(b, goal, speed, dt) === 1) return;
          ai.target = null;
        }

        // Roam.
        if (ai.goal < 0 || ai.roamT <= 0 || grid[ai.goal]) {
          ai.goal = pickRoamGoal(b);
          ai.roamT = 7 + Math.random() * 5;
          ai.repath = 0;
        }
        const fp = followPath(b, ai.goal, speed * 0.85, dt);
        if (fp !== 1) {
          const ws = fp < 0 ? adjacentSnow(b) : -1;
          if (ws >= 0) {
            const aim = Math.atan2(((ws / N) | 0) + 0.5 - b.y, ws % N + 0.5 - b.x);
            turnTo(b, aim, D.turn, dt);
            if (b.throwCd <= 0 && Math.abs(angDiff(aim, b.ang)) < 0.15) throwBall(b, b.ang);
          }
          ai.goal = -1;
        }
        // Stuck check.
        ai.stuck += dt;
        if (ai.stuck > 1.2) {
          if (Math.hypot(b.x - ai.sx, b.y - ai.sy) < 0.3) { ai.goal = -1; ai.repath = 0; }
          ai.stuck = 0;
          ai.sx = b.x;
          ai.sy = b.y;
        }
      }

      /* ---------- Match flow ---------- */
      function startMatch(dn) {
        diffName = dn;
        D = DIFF[dn];
        resetGrid();
        for (const b of balls) b.on = false;
        for (const q of parts) q.on = false;
        const names = botNames(5);
        players = [makePlayer(0, 'You', false)];
        for (let i = 0; i < 5; i++) players.push(makePlayer(i + 1, names[i], true));
        players.forEach((p) => { p.alive = false; });
        players.forEach((p) => spawn(p));
        you = players[0];
        ranked = players.slice();
        matchT = MATCH;
        countT = 3;
        goT = 0;
        lastSec = 0;
        feed = [];
        hurt = 0;
        shake = 0;
        hitMark = 0;
        hintHit = false;
        hintChip = false;
        hintPack = false;
        state = 'count';
        api.setScore(0);
        api.setStatus(lockSupported && !api.isTouch
          ? 'Click the view to aim with the mouse. Space or click throws, E packs a snow wall.'
          : 'Drag to look, tap to throw. E packs a snow wall in front of you.');
        api.sfx('tick');
      }

      function showStartMenu() {
        state = 'menu';
        exitLock();
        api.setStatus('Snowball free-for-all: 3 minutes, 6 snow-folk.');
        api.menu({
          title: 'Snowball Siege',
          text: 'Three minutes against five snow-folk. A hit is 1 point, a knockout 3 more. ' +
            'Press E to pack a snow wall in front of you; snowballs chip walls away.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch('easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch('normal') },
            { label: 'Hard', onClick: () => startMatch('hard') }
          ]
        });
      }

      function ordinal(n) {
        return n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
      }

      function endMatch() {
        state = 'over';
        exitLock();
        sortRanked();
        let rank = 1;
        let tied = false;
        for (const p of players) {
          if (p === you) continue;
          if (p.score > you.score) rank++;
          else if (p.score === you.score) tied = true;
        }
        const best = api.reportScore(you.score);
        api.sfx(rank === 1 ? 'win' : 'lose');
        const place = (tied ? 'tied for ' : '') + ordinal(rank);
        api.setStatus('Match over: you finished ' + place + ' of 6.');
        api.menu({
          title: best ? 'New best: ' + you.score + '!' : rank === 1 && !tied ? 'You win!' : rank === 1 ? 'Tied for first!' : 'Time!',
          text: 'You finished ' + place + ' of 6 with ' + you.score + ' points (' + you.hits + ' hits, ' +
            you.kos + ' knockouts). Top snow-folk: ' + ranked[0].name + ' with ' + ranked[0].score + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(diffName) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function rankCmp(a, b) {
        return b.score - a.score || b.kos - a.kos || a.idx - b.idx;
      }
      function sortRanked() { ranked.sort(rankCmp); }

      /* ---------- Input ---------- */
      function exitLock() {
        if (typeof document !== 'undefined' && document.pointerLockElement === canvas && typeof document.exitPointerLock === 'function') {
          try { document.exitPointerLock(); } catch (e) { /* ignore */ }
        }
      }
      function requestLock() {
        if (!lockSupported) return;
        try {
          const r = canvas.requestPointerLock();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        } catch (e) { /* ignore */ }
      }

      api.on(document, 'pointerlockchange', () => {
        locked = document.pointerLockElement === canvas;
      }, { always: true });

      // If the page cannot lock the pointer (e.g. a sandboxed frame), fall back to drag-to-look.
      api.on(document, 'pointerlockerror', () => { lockSupported = false; }, { always: true });

      api.on(document, 'mousemove', (e) => {
        if (!locked || !you || (state !== 'play' && state !== 'count')) return;
        you.ang += (e.movementX || 0) * 0.0026;
      });

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play' && state !== 'count') return;
        if (lockSupported && !api.isTouch && e.pointerType !== 'touch') {
          if (!locked) { requestLock(); return; }
          if (e.button === 2) tryPack(you, you.ang);
          else if (e.button === 0) throwBall(you, you.ang);
          return;
        }
        if (e.button === 2) { tryPack(you, you.ang); return; }
        dragging = true;
        dragX = api.toCanvas(e, canvas).x;
        dragMoved = 0;
      });
      api.on(canvas, 'pointermove', (e) => {
        if (!dragging || !you) return;
        const x = api.toCanvas(e, canvas).x;
        you.ang += (x - dragX) * 0.008;
        dragMoved += Math.abs(x - dragX);
        dragX = x;
      });
      api.on(canvas, 'pointerup', () => {
        if (!dragging) return;
        dragging = false;
        if (dragMoved < 12) throwBall(you, you.ang);
      });

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        if (e.code === 'KeyE') tryPack(you, you.ang);
        else if (e.code === 'Space') throwBall(you, you.ang);
      });

      /* ---------- Update ---------- */
      function updateYou(dt) {
        const p = you;
        let turn = 0;
        if (keys.has('ArrowLeft')) turn -= 1;
        if (keys.has('ArrowRight')) turn += 1;
        p.ang += turn * KEY_TURN * dt;
        if (!p.alive || state !== 'play') return;
        let f = 0;
        let s = 0;
        if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
        if (keys.has('KeyD')) s += 1;
        if (keys.has('KeyA')) s -= 1;
        if (f || s) {
          const len = Math.hypot(f, s);
          const ca = Math.cos(p.ang);
          const sa = Math.sin(p.ang);
          moveEntity(p, (ca * f - sa * s) / len * MOVE * dt, (sa * f + ca * s) / len * MOVE * dt);
        }
        if (keys.has('Space')) throwBall(p, p.ang);
      }

      function updatePlayers(dt) {
        for (const p of players) {
          p.throwCd = Math.max(0, p.throwCd - dt);
          p.packCd = Math.max(0, p.packCd - dt);
          p.throwAnim = Math.max(0, p.throwAnim - dt);
          p.hitFlash = Math.max(0, p.hitFlash - dt);
          p.invuln = Math.max(0, p.invuln - dt);
          if (!p.alive) {
            p.vx = p.vy = 0;
            if (state === 'play') {
              p.respawnT -= dt;
              if (p.respawnT <= 0) spawn(p);
            }
            continue;
          }
          if (p.isBot && state === 'play') updateBot(p, dt);
        }
        // Soft separation so nobody stands inside anyone else.
        for (let i = 0; i < players.length; i++) {
          const a = players[i];
          if (!a.alive) continue;
          for (let j = i + 1; j < players.length; j++) {
            const b = players[j];
            if (!b.alive) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < 0.2 && d2 > 1e-6) {
              const d = Math.sqrt(d2);
              const push = (0.45 - d) * 0.5;
              moveEntity(a, -dx / d * push, -dy / d * push);
              moveEntity(b, dx / d * push, dy / d * push);
            }
          }
        }
        for (const p of players) {
          if (dt > 0) {
            p.vx = (p.x - p.ox) / dt;
            p.vy = (p.y - p.oy) / dt;
          }
          const sp = Math.hypot(p.x - p.ox, p.y - p.oy);
          p.walk += sp * 9;
          p.ox = p.x;
          p.oy = p.y;
        }
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        hurt = Math.max(0, hurt - dt * 1.6);
        hitMark = Math.max(0, hitMark - dt);
        goT = Math.max(0, goT - dt);
        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t -= dt;
          if (feed[i].t <= 0) feed.splice(i, 1);
        }
        updateParts(dt);
        if (state === 'menu' || !you) return;
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          updateYou(dt);
          if (countT <= 0) {
            state = 'play';
            goT = 0.8;
            api.sfx('blip');
          } else if (Math.ceil(countT) !== prev) {
            api.sfx('tick');
          }
          updatePlayers(0);
          return;
        }
        if (state === 'play') {
          matchT -= dt;
          const sec = Math.ceil(matchT);
          if (sec <= 10 && sec !== lastSec && sec > 0) api.sfx('tick');
          lastSec = sec;
          if (matchT <= 0) {
            matchT = 0;
            updateBalls(dt);
            endMatch();
            return;
          }
          updateYou(dt);
          updatePlayers(dt);
          updateBalls(dt);
          sortRanked();
          return;
        }
        // Over: keep the world drifting.
        updateBalls(dt);
      }

      /* ---------- Render ---------- */
      let camX = 0;
      let camY = 0;
      let dirX = 1;
      let dirY = 0;

      /* World point -> screen x and depth (written to PRJ). Returns false when behind. */
      function project(wx, wy) {
        const rx = wx - camX;
        const ry = wy - camY;
        const d = rx * dirX + ry * dirY;
        if (d < 0.12) return false;
        const lat = -rx * dirY + ry * dirX;
        PRJ.d = d;
        PRJ.x = W / 2 + lat / d * PROJ;
        return true;
      }

      function castRay(rdx, rdy) {
        let mx = camX | 0;
        let my = camY | 0;
        const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
        const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
        let stepX;
        let stepY;
        let sdx;
        let sdy;
        if (rdx < 0) { stepX = -1; sdx = (camX - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - camX) * ddx; }
        if (rdy < 0) { stepY = -1; sdy = (camY - my) * ddy; } else { stepY = 1; sdy = (my + 1 - camY) * ddy; }
        let side = 0;
        let cell = -1;
        for (let i = 0; i < 64; i++) {
          if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
          if (mx < 0 || my < 0 || mx >= N || my >= N) { cell = -1; break; }
          const c = my * N + mx;
          if (grid[c]) { cell = c; break; }
        }
        const dist = side === 0 ? sdx - ddx : sdy - ddy;
        let u = side === 0 ? camY + dist * rdy : camX + dist * rdx;
        u -= Math.floor(u);
        RAY.dist = dist;
        RAY.side = side;
        RAY.cell = cell;
        RAY.u = u;
      }

      function drawWallColumn(i) {
        const d = RAY.dist > 0.05 ? RAY.dist : 0.05;
        depth[i] = d;
        const cell = RAY.cell;
        if (cell < 0) return;
        const type = grid[cell];
        const side = RAY.side;
        const u = RAY.u;
        const x = i * RAY_W;
        const lh = PROJ / d;
        const bottom = horizon + lh * EYE;
        let hf = 1;
        if (type === SNOW) {
          const age = clock - wallBorn[cell];
          if (age < RISE) hf = 0.08 + 0.92 * (1 - (1 - age / RISE) * (1 - age / RISE));
        }
        const top = bottom - lh * hf;
        const fi = fogIndex(d);
        ctx.fillStyle = WALL_COL[type][side][fi];
        ctx.fillRect(x, top, RAY_W, bottom - top);
        if (lh < 5) return;
        const thin = lh * 0.014 > 1 ? lh * 0.014 : 1;
        ctx.fillStyle = SEAM_COL[type][side][fi];
        if (type === ICE) {
          const ch = lh / 3;
          ctx.fillRect(x, bottom - ch, RAY_W, thin);
          ctx.fillRect(x, bottom - ch * 2, RAY_W, thin);
          for (let r = 0; r < 3; r++) {
            const uu = (u * 2 + (r & 1) * 0.5) % 1;
            if (uu < 0.035) ctx.fillRect(x, bottom - ch * (r + 1), RAY_W, ch);
          }
        } else if (type === ROCK) {
          const w1 = 0.34 + Math.sin(u * 9.4 + cell) * 0.06;
          const w2 = 0.68 + Math.sin(u * 6.1 + cell * 1.7) * 0.05;
          ctx.fillRect(x, bottom - lh * w1, RAY_W, thin * 2);
          ctx.fillRect(x, bottom - lh * w2, RAY_W, thin * 1.6);
          if ((u * 3 + cell * 0.37) % 1 < 0.05) ctx.fillRect(x, bottom - lh * w2, RAY_W, lh * (w2 - w1));
        } else if (type === WOOD) {
          for (let k = 1; k < 5; k++) ctx.fillRect(x, bottom - lh * k / 5, RAY_W, thin * 1.3);
          if (u < 0.05 || u > 0.95) ctx.fillRect(x, top, RAY_W, bottom - top);
        } else {
          const hp = wallHp[cell];
          if (hp <= 2 && Math.abs((u * 3 + cell * 0.13) % 1 - 0.5) < 0.035) ctx.fillRect(x, top + lh * 0.12, RAY_W, lh * 0.45 * hf);
          if (hp <= 1) {
            if (Math.abs((u * 5 + 0.3) % 1 - 0.5) < 0.045) ctx.fillRect(x, top + lh * 0.35 * hf, RAY_W, lh * 0.5 * hf);
            ctx.fillRect(x, top + lh * (0.3 + u * 0.2) * hf, RAY_W, thin * 1.5);
          }
          const o = wallOwner[cell];
          if (o >= 0) {
            ctx.fillStyle = PCOL[o][fi];
            ctx.fillRect(x, bottom - lh * 0.08 * hf, RAY_W, lh * 0.08 * hf);
          }
          return;
        }
        ctx.fillStyle = CAP_COL[fi];
        ctx.fillRect(x, top, RAY_W, lh * 0.065);
      }

      /* Clip to screen columns [x0, x1] where the sprite at depth d is in front of the walls. */
      function clipSprite(x0, x1, d) {
        const c0 = Math.max(0, Math.floor(x0 / RAY_W));
        const c1 = Math.min(RAYS - 1, Math.floor(x1 / RAY_W));
        if (c1 < c0) return false;
        ctx.beginPath();
        let any = false;
        let run = -1;
        for (let c = c0; c <= c1 + 1; c++) {
          const vis = c <= c1 && depth[c] > d;
          if (vis && run < 0) run = c;
          else if (!vis && run >= 0) {
            ctx.rect(run * RAY_W, 0, (c - run) * RAY_W, H);
            any = true;
            run = -1;
          }
        }
        return any;
      }

      function drawSky() {
        if (!skyGrad) {
          skyGrad = ctx.createLinearGradient(0, 0, 0, H / 2);
          skyGrad.addColorStop(0, '#0B0A1E');
          skyGrad.addColorStop(1, '#2B2760');
          floorGrad = ctx.createLinearGradient(0, H / 2, 0, H);
          floorGrad.addColorStop(0, '#2B2760');
          floorGrad.addColorStop(0.35, '#4C5290');
          floorGrad.addColorStop(1, '#9AA6D8');
        }
        ctx.fillStyle = skyGrad;
        ctx.fillRect(-20, -20, W + 40, horizon + 20);
        ctx.fillStyle = floorGrad;
        ctx.fillRect(-20, horizon, W + 40, H - horizon + 20);
        const a = you.ang;
        ctx.fillStyle = 'rgba(243,240,255,0.75)';
        for (const s of stars) {
          const rel = angDiff(s.a, a);
          if (rel < -0.62 || rel > 0.62) continue;
          ctx.fillRect(W / 2 + Math.tan(rel) * PROJ, s.y - (H / 2 - horizon), s.s, s.s);
        }
        const mrel = angDiff(-0.9, a);
        if (mrel > -0.7 && mrel < 0.7) {
          const mx = W / 2 + Math.tan(mrel) * PROJ;
          ctx.fillStyle = 'rgba(233,228,200,0.12)';
          circle(ctx, mx, 92, 46);
          ctx.fillStyle = '#E9E4C8';
          circle(ctx, mx, 92, 24);
          ctx.fillStyle = 'rgba(15,13,36,0.25)';
          circle(ctx, mx + 7, 86, 6);
          circle(ctx, mx - 8, 100, 4);
        }
      }

      function drawWorld() {
        camX = you.x;
        camY = you.y;
        dirX = Math.cos(you.ang);
        dirY = Math.sin(you.ang);
        const plX = -dirY * PLANE;
        const plY = dirX * PLANE;
        horizon = H / 2 + Math.sin(walkBob) * 2.5;
        drawSky();
        for (let i = 0; i < RAYS; i++) {
          const camT = (2 * (i + 0.5)) / RAYS - 1;
          castRay(dirX + plX * camT, dirY + plY * camT);
          drawWallColumn(i);
        }
        drawPackMarker();
        // Particles (tiny, unsorted, per-point depth test).
        for (const q of parts) {
          if (!q.on || !project(q.x, q.y)) continue;
          const col = (PRJ.x / RAY_W) | 0;
          if (col < 0 || col >= RAYS || depth[col] < PRJ.d) continue;
          const s = PROJ / PRJ.d;
          const sz = Math.max(1.5, (q.big ? 0.06 : 0.035) * s);
          const fi = fogIndex(PRJ.d);
          ctx.globalAlpha = Math.min(1, q.life / q.max * 1.6);
          ctx.fillStyle = SNOW_R[fi];
          ctx.fillRect(PRJ.x - sz / 2, horizon + (EYE - q.z) * s - sz / 2, sz, sz);
        }
        ctx.globalAlpha = 1;
        // Players and snowballs, far to near.
        drawList.length = 0;
        for (const p of players) {
          if (p === you || !project(p.x, p.y) || PRJ.d < 0.2) continue;
          p.d = PRJ.d;
          p.sx = PRJ.x;
          drawList.push(p);
        }
        for (const b of balls) {
          if (!b.on || !project(b.x, b.y)) continue;
          b.d = PRJ.d;
          b.sx = PRJ.x;
          drawList.push(b);
        }
        drawList.sort(byDepth);
        for (const o of drawList) {
          if (o.idx !== undefined) drawPlayerSprite(o);
          else drawBallSprite(o);
        }
      }

      function drawPlayerSprite(p) {
        const s = PROJ / p.d;
        if (p.sx + s * 0.5 < 0 || p.sx - s * 0.5 > W) return;
        ctx.save();
        if (!clipSprite(p.sx - s * 0.42, p.sx + s * 0.42, p.d)) { ctx.restore(); return; }
        ctx.clip();
        const fi = fogIndex(p.d);
        const gy = horizon + EYE * s;
        if (!p.alive) {
          ctx.fillStyle = SNOW_SH[fi];
          ellipse(ctx, p.sx, gy - 0.03 * s, 0.34 * s, 0.07 * s);
          ctx.fillStyle = SNOW_R[fi];
          ellipse(ctx, p.sx - 0.03 * s, gy - 0.07 * s, 0.22 * s, 0.08 * s);
          ctx.fillStyle = PCOL[p.idx][fi];
          ctx.beginPath();
          ctx.arc(p.sx + 0.1 * s, gy - 0.1 * s, 0.1 * s, Math.PI, TAU);
          ctx.fill();
          ctx.restore();
          return;
        }
        const toCam = Math.atan2(camY - p.y, camX - p.x);
        const rel = angDiff(p.ang, toCam);
        const facing = Math.cos(rel) > -0.1;
        const look = U.clamp(-Math.sin(rel), -1, 1);
        if (p.invuln > 0 && Math.sin(clock * 30) > 0) ctx.globalAlpha = 0.45;
        drawFolk(ctx, p.sx, gy, s, fi, p.idx, look, facing, p.throwAnim, p.walk);
        ctx.globalAlpha = 1;
        if (p.hitFlash > 0) {
          ctx.strokeStyle = U.alpha('#FFFFFF', p.hitFlash * 3);
          ctx.lineWidth = Math.max(2, 0.03 * s);
          ctx.beginPath();
          ctx.arc(p.sx, gy - 0.5 * s, (0.5 + (0.25 - p.hitFlash) * 1.5) * s, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        // Name tag + health pips when close and visible.
        const col = Math.max(0, Math.min(RAYS - 1, (p.sx / RAY_W) | 0));
        if (p.d < 10 && depth[col] > p.d) {
          const ty = gy - 1.05 * s - 8;
          ctx.font = SMALL;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(15,13,36,0.6)';
          const tw = ctx.measureText(p.name).width + 12;
          U.roundRect(ctx, p.sx - tw / 2, ty - 26, tw, 18, 6);
          ctx.fill();
          ctx.fillStyle = p.color;
          ctx.fillText(p.name, p.sx, ty - 11);
          for (let k = 0; k < MAX_HP; k++) {
            ctx.fillStyle = k < p.hp ? '#F3F0FF' : 'rgba(243,240,255,0.2)';
            circle(ctx, p.sx + (k - 1) * 9, ty - 2, 3);
          }
        }
      }

      function drawBallSprite(b) {
        const col = (b.sx / RAY_W) | 0;
        if (col < 0 || col >= RAYS || depth[col] < b.d) return;
        const s = PROJ / b.d;
        const fi = fogIndex(b.d);
        const r = Math.max(1.5, 0.07 * s);
        ctx.fillStyle = 'rgba(8,6,26,0.3)';
        ellipse(ctx, b.sx, horizon + EYE * s, r * 1.1, r * 0.3);
        ctx.fillStyle = SNOW_SH[fi];
        circle(ctx, b.sx, horizon + (EYE - b.z) * s, r);
        ctx.fillStyle = SNOW_R[fi];
        circle(ctx, b.sx - r * 0.2, horizon + (EYE - b.z) * s - r * 0.2, r * 0.75);
      }

      const MK = [0, 0, 0, 0, 0, 0, 0, 0];
      function byDepth(a, b) { return b.d - a.d; }
      function drawPackMarker() {
        if (state !== 'play' || !you.alive) return;
        const c = packCell(you, you.ang);
        if (c < 0) return;
        const cx = c % N;
        const cy = (c / N) | 0;
        const pts = [cx, cy, cx + 1, cy, cx + 1, cy + 1, cx, cy + 1];
        for (let k = 0; k < 4; k++) {
          if (!project(pts[k * 2], pts[k * 2 + 1])) return;
          MK[k * 2] = PRJ.x;
          MK[k * 2 + 1] = horizon + EYE * PROJ / PRJ.d;
        }
        const ready = you.packCd <= 0;
        ctx.strokeStyle = ready ? U.alpha('#F3F0FF', 0.35 + Math.sin(clock * 5) * 0.1) : 'rgba(243,240,255,0.12)';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(MK[0], MK[1]);
        for (let k = 1; k < 4; k++) ctx.lineTo(MK[k * 2], MK[k * 2 + 1]);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      function drawHand() {
        const moving = Math.hypot(you.vx, you.vy) > 0.5;
        const bx = W * 0.7 + (moving ? Math.cos(walkBob) * 8 : 0);
        let by = H + 20 + (moving ? Math.abs(Math.sin(walkBob)) * 8 : 0);
        const ta = you.throwAnim / 0.3;
        if (ta > 0) by += Math.sin(ta * Math.PI) * -60 + (1 - ta) * 40;
        else if (you.throwCd > 0) by += 80 * (you.throwCd / THROW_CD);
        if (!you.alive) by += 200;
        ctx.fillStyle = '#C9D0F0';
        circle(ctx, bx, by - 80, 30);
        ctx.fillStyle = '#F4F6FF';
        circle(ctx, bx - 5, by - 85, 25);
        ctx.fillStyle = you.color;
        U.roundRect(ctx, bx - 38, by - 66, 76, 90, 26);
        ctx.fill();
        ctx.fillStyle = U.alpha('#000000', 0.15);
        ctx.fillRect(bx - 38, by - 8, 76, 10);
      }

      function drawMinimap() {
        const s = 5;
        const ox = 14;
        const oy = 14;
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, ox - 6, oy - 6, N * s + 12, N * s + 12, 8);
        ctx.fill();
        for (let i = 0; i < N * N; i++) {
          const t = grid[i];
          if (!t) continue;
          ctx.fillStyle = t === SNOW ? '#EEF2FF' : t === ROCK ? '#5A5090' : t === WOOD ? '#7A5A48' : '#3E5C86';
          ctx.fillRect(ox + (i % N) * s, oy + ((i / N) | 0) * s, s, s);
          if (t === SNOW && wallOwner[i] >= 0) {
            ctx.fillStyle = COLORS[wallOwner[i]];
            ctx.fillRect(ox + (i % N) * s + 1, oy + ((i / N) | 0) * s + 3, s - 2, 2);
          }
        }
        for (const p of players) {
          if (p === you || !p.alive) continue;
          if (Math.hypot(p.x - you.x, p.y - you.y) > 14 || losBlock(you.x, you.y, p.x, p.y) !== -1) continue;
          ctx.fillStyle = p.color;
          circle(ctx, ox + p.x * s, oy + p.y * s, 2.5);
        }
        ctx.save();
        ctx.translate(ox + you.x * s, oy + you.y * s);
        ctx.rotate(you.ang);
        ctx.fillStyle = 'rgba(243,240,255,0.12)';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 26, -0.58, 0.58);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = you.color;
        ctx.beginPath();
        ctx.moveTo(5, 0);
        ctx.lineTo(-3.5, -3.5);
        ctx.lineTo(-1.5, 0);
        ctx.lineTo(-3.5, 3.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawHud() {
        // Crosshair + hit marker.
        const cx = W / 2;
        const cy = H / 2;
        ctx.strokeStyle = 'rgba(243,240,255,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy);
        ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
        ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4);
        ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10);
        ctx.stroke();
        if (hitMark > 0) {
          ctx.strokeStyle = hitMarkKo ? C.gold : '#FFFFFF';
          ctx.globalAlpha = Math.min(1, hitMark * 5);
          ctx.lineWidth = 3;
          const r0 = 7;
          const r1 = hitMarkKo ? 18 : 14;
          ctx.beginPath();
          for (let k = 0; k < 4; k++) {
            const a = Math.PI / 4 + k * Math.PI / 2;
            ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
            ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
          }
          ctx.stroke();
          ctx.globalAlpha = 1;
        }
        // Hit direction arc.
        if (hurt > 0) {
          ctx.strokeStyle = U.alpha(C.p1, hurt * 0.9);
          ctx.lineWidth = 8;
          ctx.beginPath();
          const a = hurtAng - Math.PI / 2;
          ctx.arc(cx, cy, 120, a - 0.35, a + 0.35);
          ctx.stroke();
        }
        drawMinimap();
        // Timer.
        const secs = Math.max(0, Math.ceil(matchT));
        const label = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, W / 2 - 54, 12, 108, 34, 10);
        ctx.fill();
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = secs <= 10 && state === 'play' ? C.p1 : C.text;
        ctx.fillText(label, W / 2, 30);
        // Knockout feed.
        ctx.font = SMALL;
        for (let i = 0; i < feed.length; i++) {
          const f = feed[i];
          ctx.globalAlpha = Math.min(1, f.t);
          const y = 62 + i * 20;
          const txt = f.a + '  ❄  ' + f.b;
          const tw = ctx.measureText(txt).width + 16;
          ctx.fillStyle = 'rgba(15,13,36,0.7)';
          U.roundRect(ctx, W / 2 - tw / 2, y - 9, tw, 18, 6);
          ctx.fill();
          ctx.textAlign = 'right';
          ctx.fillStyle = COLORS[f.ac];
          ctx.fillText(f.a, W / 2 - 14, y);
          ctx.fillStyle = C.muted;
          ctx.textAlign = 'center';
          ctx.fillText('❄', W / 2, y);
          ctx.textAlign = 'left';
          ctx.fillStyle = COLORS[f.bc];
          ctx.fillText(f.b, W / 2 + 14, y);
        }
        ctx.globalAlpha = 1;
        // Leaderboard.
        const lw = 214;
        const lx = W - lw - 12;
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, lx, 12, lw, 28 + ranked.length * 19, 10);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('LEADERBOARD', lx + 12, 27);
        for (let i = 0; i < ranked.length; i++) {
          const p = ranked[i];
          const y = 46 + i * 19;
          if (p === you) {
            ctx.fillStyle = U.alpha(C.p1, 0.18);
            ctx.fillRect(lx + 4, y - 9, lw - 8, 18);
          }
          ctx.fillStyle = p.alive ? p.color : U.alpha(p.color, 0.45);
          circle(ctx, lx + 16, y, 4);
          ctx.fillStyle = p === you ? C.text : C.muted;
          ctx.textAlign = 'left';
          ctx.fillText((i + 1) + ' ' + (p.name.length > 15 ? p.name.slice(0, 14) + '…' : p.name), lx + 26, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.text;
          ctx.fillText(String(p.score), lx + lw - 12, y);
        }
        // Health.
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, 12, H - 58, 196, 46, 10);
        ctx.fill();
        ctx.font = HUD;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('HP', 24, H - 35);
        for (let k = 0; k < MAX_HP; k++) {
          ctx.fillStyle = k < you.hp && you.alive ? '#F4F6FF' : 'rgba(243,240,255,0.15)';
          circle(ctx, 66 + k * 26, H - 35, 9);
        }
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'right';
        ctx.fillText(String(you.score), 196, H - 35);
        // Walls.
        const wx = W - 214;
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, wx, H - 58, 202, 46, 10);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('E wall', wx + 12, H - 35);
        for (let k = 0; k < MAX_WALLS; k++) {
          const used = k < you.walls.length;
          const x = wx + 94 + k * 32;
          ctx.fillStyle = used ? U.alpha('#EEF2FF', 0.25) : '#EEF2FF';
          ctx.fillRect(x, H - 46, 24, 22);
          if (!used) {
            ctx.fillStyle = you.color;
            ctx.fillRect(x, H - 28, 24, 4);
          }
        }
        if (you.packCd > 0) {
          ctx.fillStyle = C.p2;
          ctx.fillRect(wx + 94, H - 20, 88 * (1 - you.packCd / PACK_CD), 3);
        } else if (you.walls.length >= MAX_WALLS) {
          ctx.font = SMALL;
          ctx.fillStyle = C.muted;
          ctx.fillText('next melts oldest', wx + 12, H - 18);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function drawBanner(text, color, sub) {
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,0.55)';
        ctx.fillText(text, W / 2 + 3, H / 2 - 77);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2 - 80);
        if (sub) {
          ctx.font = HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(sub, W / 2, H / 2 - 38);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (!you) {
          drawIdle();
          return;
        }
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-1, 1) * shake * 24, U.rand(-1, 1) * shake * 24);
        drawWorld();
        ctx.restore();
        if (you.alive) drawHand();
        if (hurt > 0) {
          ctx.fillStyle = U.alpha(C.p1, hurt * 0.18);
          ctx.fillRect(0, 0, W, H);
        }
        if (!you.alive && state === 'play') {
          ctx.fillStyle = 'rgba(15,13,36,0.45)';
          ctx.fillRect(0, 0, W, H);
          drawBanner('Out!', C.p1, 'Back in ' + Math.max(0, you.respawnT).toFixed(1) + ' s');
        }
        drawHud();
        if (state === 'count') drawBanner(String(Math.max(1, Math.ceil(countT))), C.gold, 'Get ready');
        else if (goT > 0) drawBanner('Go!', C.mint, null);
        if (state === 'play' && lockSupported && !locked && !api.isTouch && clock % 2 < 1.4) {
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.fillStyle = 'rgba(15,13,36,0.7)';
          U.roundRect(ctx, W / 2 - 150, H / 2 + 40, 300, 30, 8);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.textBaseline = 'middle';
          ctx.fillText('Click to aim with the mouse', W / 2, H / 2 + 55);
          ctx.textBaseline = 'alphabetic';
        }
      }

      /* Behind the start menu: a slowly turning view of the empty arena. */
      let idleCam = null;
      function drawIdle() {
        if (!idleCam) {
          idleCam = makePlayer(0, 'You', false);
          idleCam.x = 12.5;
          idleCam.y = 8.5;
        }
        idleCam.ang = clock * 0.15;
        const real = you;
        you = idleCam;
        drawWorld();
        you = real;
      }

      api.loop((dt) => {
        if (you && you.alive && state === 'play' && Math.hypot(you.vx, you.vy) > 0.5) walkBob += dt * 9;
        update(dt);
        draw();
      });

      resetGrid();
      showStartMenu();

      return {
        destroy() {
          exitLock();
        }
      };
    }
  });
})();
