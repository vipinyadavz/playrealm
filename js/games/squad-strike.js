/* Squad Strike — top-down 4v4 team shooter where every wall can be shot down. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const T = 32;
  const COLS = 46;
  const ROWS = 30;
  const MW = COLS * T;
  const MH = ROWS * T;
  const HALF = COLS / 2;
  const FLOOR = 0;
  const WALL = 1;
  const PILLAR = 2;
  const WALL_HP = 150;
  const KILLS_TO_WIN = 25;
  const MATCH_TIME = 240;
  const RESPAWN = 3;
  const PROTECT = 1.5;
  const SPEED = 165;
  const RAD = 12;
  const REGEN_DELAY = 4;
  const REGEN = 22;
  const GREN_R = 100;
  const GREN_FUSE = 1.4;
  const PICKUP_RESPAWN = 14;
  const MAX_BULLETS = 320;
  const MAX_PARTS = 520;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TINY = '600 10px "JetBrains Mono", monospace';
  const TAU = Math.PI * 2;
  const TEAM_COL = [C.p1, C.p2];
  const TEAM_NAME = ['Coral', 'Cyan'];
  const WEAPONS = {
    pistol: { name: 'Pistol', dmg: 24, rate: 0.3, speed: 900, spread: 0.035, pellets: 1, mag: 12, reserve: Infinity, reload: 1, life: 0.6, len: 13, keep: 300 },
    smg: { name: 'SMG', dmg: 13, rate: 0.085, speed: 950, spread: 0.1, pellets: 1, mag: 30, reserve: 60, reload: 1.5, life: 0.5, len: 17, keep: 230 },
    shotgun: { name: 'Shotgun', dmg: 12, rate: 0.75, speed: 820, spread: 0.32, pellets: 7, mag: 5, reserve: 10, reload: 1.8, life: 0.32, len: 19, keep: 140 },
    rifle: { name: 'Rifle', dmg: 36, rate: 0.2, speed: 1300, spread: 0.018, pellets: 1, mag: 20, reserve: 40, reload: 1.6, life: 0.8, len: 24, keep: 420 }
  };
  const PICKUP_SPOTS = [[9, 4, 'smg'], [9, ROWS - 5, 'shotgun'], [16, ROWS / 2, 'rifle']];
  const DIFF = {
    easy: { react: 0.6, err: 0.17, turn: 5, think: 0.36, cover: 0.3, grenade: 0.12, speed: 0.85, lead: 0.2 },
    normal: { react: 0.34, err: 0.085, turn: 8, think: 0.22, cover: 0.6, grenade: 0.3, speed: 0.95, lead: 0.6 },
    hard: { react: 0.2, err: 0.045, turn: 12, think: 0.14, cover: 0.85, grenade: 0.5, speed: 1, lead: 0.9 }
  };
  // Your squadmates on Easy are a little sharper than the enemy, so the match stays winnable.
  const ALLY_EASY = { react: 0.45, err: 0.12, turn: 6.5, think: 0.28, cover: 0.45, grenade: 0.2, speed: 0.9, lead: 0.4 };
  const RANKS = ['Sgt', 'Private', 'Major', 'Corporal', 'Lt', 'Captain', 'Cadet', 'Colonel'];
  const NOUNS = ['Pickles', 'Noodle', 'Mayhem', 'Crumb', 'Wobble', 'Toast', 'Biscuit', 'Waffles', 'Pudding', 'Sprout', 'Gravy', 'Muffin', 'Nugget', 'Tater'];
  const SOLO_NAMES = ['NoodleArm', 'Sir Wobble', 'Captain Crumb', 'TacoTornado', 'BeanCounter', 'Lord Snacks', 'PixelPaws', 'Turbo Toad', 'Mx Mayhem', 'Dizzy Dot'];
  const DEBRIS = ['#8A79C2', '#6F5FA6', '#B3A6E0', '#55487F'];
  const SPARK = ['#FFC53D', '#FFE08A', '#F3F0FF'];
  const SMOKE = 'rgba(169,163,214,0.5)';

  function botNames(n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 300) {
      const name = Math.random() < 0.4 ? U.pick(SOLO_NAMES) : U.pick(RANKS) + ' ' + U.pick(NOUNS);
      if (out.indexOf(name) < 0) out.push(name);
    }
    while (out.length < n) out.push('Bot ' + (out.length + 1));
    return out;
  }

  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function drawSoldier(ctx, x, y, ang, color, len, flash, protect, t) {
    ctx.fillStyle = 'rgba(8,6,26,0.4)';
    ctx.beginPath();
    ctx.arc(x + 3, y + 4, RAD, 0, TAU);
    ctx.fill();
    // Gun.
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    ctx.strokeStyle = '#2A2546';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + ca * 4 - sa * 4, y + sa * 4 + ca * 4);
    ctx.lineTo(x + ca * (8 + len) - sa * 4, y + sa * (8 + len) + ca * 4);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (flash > 0) {
      const mx = x + ca * (12 + len) - sa * 4;
      const my = y + sa * (12 + len) + ca * 4;
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(mx + ca * 12, my + sa * 12);
      ctx.lineTo(mx - sa * 5, my + ca * 5);
      ctx.lineTo(mx + sa * 5, my - ca * 5);
      ctx.closePath();
      ctx.fill();
    }
    // Body + helmet.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, RAD, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,36,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,13,36,0.35)';
    ctx.beginPath();
    ctx.arc(x - ca * 2, y - sa * 2, 7, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - ca * 3 - 2, y - sa * 3 - 2, 3, 0, TAU);
    ctx.fill();
    // Hands on the gun.
    ctx.fillStyle = '#F3D9C4';
    ctx.beginPath();
    ctx.arc(x + ca * 9 - sa * 4, y + sa * 9 + ca * 4, 3, 0, TAU);
    ctx.fill();
    if (protect > 0) {
      ctx.strokeStyle = U.alpha('#F3F0FF', 0.4 + Math.sin(t * 20) * 0.2);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, RAD + 5, 0, TAU);
      ctx.stroke();
    }
  }

  function drawWallTile(ctx, x, y, stage, seed) {
    const body = stage === 0 ? '#8A79C2' : stage === 1 ? '#7867AE' : '#5F5090';
    ctx.fillStyle = 'rgba(8,6,26,0.45)';
    ctx.fillRect(x + 4, y + 5, T, T);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(x, y, T, 4);
    ctx.strokeStyle = 'rgba(40,32,80,0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 16); ctx.lineTo(x + T, y + 16);
    ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 16, y + 16);
    ctx.moveTo(x + 8, y + 16); ctx.lineTo(x + 8, y + T);
    ctx.moveTo(x + 24, y + 16); ctx.lineTo(x + 24, y + T);
    ctx.stroke();
    if (stage > 0) {
      ctx.strokeStyle = '#1C1838';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 6 + (seed % 18), y + 2);
      ctx.lineTo(x + 15, y + 14);
      ctx.lineTo(x + 9 + (seed % 13), y + 29);
      if (stage > 1) {
        ctx.moveTo(x + 30, y + 8 + (seed % 12));
        ctx.lineTo(x + 18, y + 18);
        ctx.lineTo(x + 2, y + 13 + (seed % 15));
      }
      ctx.stroke();
    }
  }

  function drawPillar(ctx, x, y) {
    ctx.fillStyle = 'rgba(8,6,26,0.5)';
    ctx.fillRect(x + 4, y + 5, T, T);
    ctx.fillStyle = '#34305C';
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = '#4A4480';
    ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
    ctx.fillStyle = '#34305C';
    ctx.fillRect(x + 7, y + 7, T - 14, T - 14);
    ctx.fillStyle = '#A9A3D6';
    ctx.fillRect(x + 4, y + 4, 2, 2);
    ctx.fillRect(x + T - 6, y + 4, 2, 2);
    ctx.fillRect(x + 4, y + T - 6, 2, 2);
    ctx.fillRect(x + T - 6, y + T - 6, 2, 2);
  }

  Arcade.register({
    id: 'squad-strike',
    title: 'Squad Strike',
    category: 'io',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.p1,
    tagline: 'A top-down 4v4 team shootout where no cover lasts for long.',
    hook: 'Every wall can be shot down, so cover never lasts.',
    tags: ['io', 'shooter', 'team', 'tactical', 'top-down', 'co-op', 'bots', 'deathmatch', 'destructible', 'grenades'],
    howTo: 'Coral team (you, a friend and bots) against the cyan bots. First team to 25 knockouts wins, or the team ' +
      'ahead after 4 minutes. Grab the SMG, shotgun and rifle lying on the floor, and throw grenades to blast groups. ' +
      'The twist: every lavender brick wall cracks and falls when it is shot, so hiding only buys time. Only the dark ' +
      'riveted pillars last. Health comes back if you stay out of fire for a few seconds.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Move (P1)' },
      { keys: ['Mouse', 'Click'], label: 'Aim and shoot (1 player)' },
      { keys: ['Space'], label: 'Shoot where you face (P1, 2 players)' },
      { keys: ['G'], label: 'Grenade (P1)' },
      { keys: ['R'], label: 'Reload (P1)' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move (P2)' },
      { keys: ['Enter'], label: 'Shoot (P2)' },
      { keys: ['.'], label: 'Grenade (P2)' },
      { keys: ['/'], label: 'Reload (P2)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = '#191630';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#221E40';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += T) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 8; y <= h; y += T) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      ctx.fillStyle = U.alpha(C.p1, 0.08);
      ctx.fillRect(0, 0, 64, h);
      ctx.fillStyle = U.alpha(C.p2, 0.08);
      ctx.fillRect(w - 64, 0, 64, h);
      // A wall being shot apart, a pillar that stays.
      drawWallTile(ctx, 160, 40, 0, 5);
      drawWallTile(ctx, 160, 72, 1, 9);
      drawWallTile(ctx, 160, 104, 2, 3);
      drawPillar(ctx, 160, 136);
      drawPillar(ctx, 96, 8);
      drawWallTile(ctx, 64, 136, 0, 7);
      ctx.fillStyle = '#55487F';
      for (let i = 0; i < 7; i++) ctx.fillRect(166 + (i * 7) % 20, 175 + (i * 5) % 12, 4, 4);
      const k = (t * 1.6) % 1;
      // Bullets streaking into the cracked wall.
      ctx.strokeStyle = C.p2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const p = (k + i / 3) % 1;
        const bx = 268 - p * 76;
        ctx.moveTo(bx, 116 + i * 4 - 4);
        ctx.lineTo(bx + 14, 116 + i * 4 - 4);
      }
      ctx.stroke();
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + t * 2;
        ctx.fillStyle = DEBRIS[i % 4];
        ctx.fillRect(196 + Math.cos(a) * 10 + ((t * 30 + i * 7) % 18), 112 + Math.sin(a) * 10, 4, 4);
      }
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(194, 118, 3 + Math.sin(t * 20) * 1.5, 0, TAU);
      ctx.fill();
      drawSoldier(ctx, 128, 112, 0, C.p1, 17, 0, 0, t);
      drawSoldier(ctx, 82, 70, -0.3, C.p1, 13, 0, 0, t);
      drawSoldier(ctx, 280, 118, Math.PI, C.p2, 17, Math.sin(t * 18) > 0 ? 1 : 0, 0, t);
      drawSoldier(ctx, 262, 46, Math.PI - 0.4, C.p2, 24, 0, 0, t);
      // Score strip.
      ctx.fillStyle = 'rgba(15,13,36,0.8)';
      U.roundRect(ctx, w / 2 - 64, h - 32, 128, 24, 8);
      ctx.fill();
      ctx.font = '700 14px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.p1;
      ctx.fillText('12', w / 2 - 30, h - 20);
      ctx.fillStyle = C.muted;
      ctx.fillText('–', w / 2, h - 20);
      ctx.fillStyle = C.p2;
      ctx.fillText('9', w / 2 + 30, h - 20);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const keys = api.keys;

      /* ---------- Map ---------- */
      const tiles = new Uint8Array(COLS * ROWS);
      const hp = new Float32Array(COLS * ROWS);
      const seed = new Uint8Array(COLS * ROWS);
      const flashT = new Float32Array(COLS * ROWS);
      const rubble = new Uint8Array(COLS * ROWS);
      const bfsPrev = new Int16Array(COLS * ROWS);
      const bfsQ = new Int16Array(COLS * ROWS);
      const spawns = [[], []];
      const DX4 = [1, -1, 0, 0];
      const DY4 = [0, 0, 1, -1];

      function setT(x, y, t) {
        if (x >= 1 && x < HALF && y >= 1 && y < ROWS - 1) tiles[y * COLS + x] = t;
      }

      function floodCount() {
        bfsPrev.fill(-1);
        const start = (ROWS >> 1) * COLS + 2;
        if (tiles[start]) return -1;
        let head = 0;
        let tail = 0;
        bfsQ[tail++] = start;
        bfsPrev[start] = start;
        while (head < tail) {
          const c = bfsQ[head++];
          const cx = c % COLS;
          const cy = (c / COLS) | 0;
          for (let k = 0; k < 4; k++) {
            const n = (cy + DY4[k]) * COLS + cx + DX4[k];
            if (bfsPrev[n] !== -1 || tiles[n]) continue;
            bfsPrev[n] = c;
            bfsQ[tail++] = n;
          }
        }
        return tail;
      }

      function genMap() {
        for (let attempt = 0; attempt < 60; attempt++) {
          tiles.fill(FLOOR);
          for (let x = 0; x < COLS; x++) { tiles[x] = PILLAR; tiles[(ROWS - 1) * COLS + x] = PILLAR; }
          for (let y = 0; y < ROWS; y++) { tiles[y * COLS] = PILLAR; tiles[y * COLS + COLS - 1] = PILLAR; }
          // Base cover.
          setT(6, 9, PILLAR); setT(6, 10, PILLAR); setT(6, 19, PILLAR); setT(6, 20, PILLAR);
          setT(7, 14, WALL); setT(7, 15, WALL);
          const segs = U.randInt(8, 11);
          for (let i = 0; i < segs; i++) {
            const horiz = Math.random() < 0.5;
            const len = U.randInt(3, 6);
            const x0 = U.randInt(8, HALF - 1 - (horiz ? len : 0));
            const y0 = U.randInt(2, ROWS - 3 - (horiz ? 0 : len));
            for (let k = 0; k < len; k++) setT(horiz ? x0 + k : x0, horiz ? y0 : y0 + k, WALL);
            if (Math.random() < 0.4) setT(horiz ? x0 + len : x0, horiz ? y0 : y0 + len, PILLAR);
          }
          const blocks = U.randInt(3, 5);
          for (let i = 0; i < blocks; i++) {
            const x = U.randInt(9, HALF - 3);
            const y = U.randInt(3, ROWS - 5);
            setT(x, y, PILLAR);
            if (Math.random() < 0.5) { setT(x + 1, y, PILLAR); setT(x, y + 1, PILLAR); setT(x + 1, y + 1, PILLAR); }
          }
          const crates = U.randInt(4, 7);
          for (let i = 0; i < crates; i++) {
            const x = U.randInt(8, HALF - 2);
            const y = U.randInt(2, ROWS - 3);
            setT(x, y, WALL);
            if (Math.random() < 0.5) setT(x + 1, y, WALL);
            if (Math.random() < 0.4) setT(x, y + 1, WALL);
          }
          // Centre line cover with gaps.
          for (let y = 3; y < ROWS - 3; y++) if ((y % 7) > 1 && (y % 7) < 5 && Math.random() < 0.8) setT(HALF - 2, y, WALL);
          // Keep bases and pickup pads clear.
          for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x <= 4; x++) tiles[y * COLS + x] = FLOOR;
          for (const p of PICKUP_SPOTS) {
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) setT(p[0] + dx, p[1] + dy, FLOOR);
          }
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < HALF; x++) tiles[y * COLS + COLS - 1 - x] = tiles[y * COLS + x];
          let floors = 0;
          for (let i = 0; i < tiles.length; i++) if (!tiles[i]) floors++;
          if (floodCount() === floors) break;
          if (attempt === 59) {
            for (let i = 0; i < tiles.length; i++) if (tiles[i] === WALL) tiles[i] = FLOOR;
          }
        }
        for (let i = 0; i < tiles.length; i++) {
          hp[i] = tiles[i] === WALL ? WALL_HP : 0;
          seed[i] = (Math.random() * 255) | 0;
          flashT[i] = 0;
          rubble[i] = 0;
        }
        spawns[0].length = 0;
        spawns[1].length = 0;
        for (let y = ROWS / 2 - 6; y <= ROWS / 2 + 5; y += 2) {
          for (let x = 2; x <= 3; x++) {
            spawns[0].push([x * T + T / 2, y * T + T / 2]);
            spawns[1].push([(COLS - 1 - x) * T + T / 2, y * T + T / 2]);
          }
        }
      }

      function solid(tx, ty) {
        if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) return true;
        return tiles[ty * COLS + tx] !== FLOOR;
      }

      function hitsTiles(x, y, r) {
        const x0 = Math.floor((x - r) / T);
        const x1 = Math.floor((x + r) / T);
        const y0 = Math.floor((y - r) / T);
        const y1 = Math.floor((y + r) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (!solid(tx, ty)) continue;
            const qx = x < tx * T ? tx * T : x > tx * T + T ? tx * T + T : x;
            const qy = y < ty * T ? ty * T : y > ty * T + T ? ty * T + T : y;
            if ((x - qx) * (x - qx) + (y - qy) * (y - qy) < r * r) return true;
          }
        }
        return false;
      }

      /* First solid tile on a->b (pixel coords), or -1 when clear. */
      function lineBlock(ax, ay, bx, by) {
        const fx = ax / T;
        const fy = ay / T;
        let x = Math.floor(fx);
        let y = Math.floor(fy);
        const tx = Math.floor(bx / T);
        const ty = Math.floor(by / T);
        const dx = (bx - ax) / T;
        const dy = (by - ay) / T;
        const sx = dx > 0 ? 1 : -1;
        const sy = dy > 0 ? 1 : -1;
        const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9;
        const tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
        let tmx = dx !== 0 ? (dx > 0 ? x + 1 - fx : fx - x) * tdx : 1e9;
        let tmy = dy !== 0 ? (dy > 0 ? y + 1 - fy : fy - y) * tdy : 1e9;
        for (let i = 0; i < 120; i++) {
          if (x === tx && y === ty) return -1;
          if (tmx < tmy) { tmx += tdx; x += sx; } else { tmy += tdy; y += sy; }
          if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return 0;
          const c = y * COLS + x;
          if (tiles[c]) return c;
        }
        return -1;
      }

      /* Is a body of radius r able to slide straight from a to b? */
      function clearPath(ax, ay, bx, by, r) {
        const d = Math.hypot(bx - ax, by - ay);
        const n = Math.ceil(d / 10);
        for (let i = 1; i <= n; i++) {
          const k = i / n;
          if (hitsTiles(ax + (bx - ax) * k, ay + (by - ay) * k, r)) return false;
        }
        return true;
      }

      function findPath(from, to, out, throughWalls) {
        if (from === to) return 0;
        if (tiles[to] === PILLAR) return -1;
        bfsPrev.fill(-1);
        let head = 0;
        let tail = 0;
        bfsQ[tail++] = from;
        bfsPrev[from] = from;
        while (head < tail) {
          const c = bfsQ[head++];
          if (c === to) break;
          const cx = c % COLS;
          const cy = (c / COLS) | 0;
          for (let k = 0; k < 4; k++) {
            const nx = cx + DX4[k];
            const ny = cy + DY4[k];
            if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
            const n = ny * COLS + nx;
            if (bfsPrev[n] !== -1) continue;
            const t = tiles[n];
            if (t === PILLAR || (t === WALL && !throughWalls)) continue;
            bfsPrev[n] = c;
            bfsQ[tail++] = n;
          }
        }
        if (bfsPrev[to] === -1) return -1;
        let len = 0;
        let c = to;
        while (c !== from && len < out.length) { out[len++] = c; c = bfsPrev[c]; }
        for (let i = 0; i < len >> 1; i++) {
          const tmp = out[i];
          out[i] = out[len - 1 - i];
          out[len - 1 - i] = tmp;
        }
        return len;
      }

      /* ---------- State ---------- */
      let state = 'menu';
      let twoP = false;
      let diffName = 'normal';
      let D = DIFF.normal;
      let DA = DIFF.normal;
      let soldiers = [];
      let humans = [];
      let ranked = [];
      let score = [0, 0];
      let matchT = MATCH_TIME;
      let countT = 0;
      let goT = 0;
      let clock = 0;
      let shake = 0;
      let feed = [];
      let pickups = [];
      let grenades = [];
      let hintWall = false;
      let hintPillar = false;
      let lastSec = 0;
      let mouseX = W / 2;
      let mouseY = H / 2;
      let mouseDown = false;
      let mouseSeen = false;
      let camX = MW / 2;
      let camY = MH / 2;
      let zoom = 1;
      const memX = [new Float32Array(8), new Float32Array(8)];
      const memY = [new Float32Array(8), new Float32Array(8)];
      const memT = [new Float32Array(8), new Float32Array(8)];
      const sfxCd = {};

      const bullets = [];
      for (let i = 0; i < MAX_BULLETS; i++) bullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0, team: 0, owner: null });
      const parts = [];
      for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', kind: 0 });

      function sfx(name, x, y) {
        if (x !== undefined && !onScreen(x, y, 80)) return;
        if ((sfxCd[name] || 0) > clock) return;
        sfxCd[name] = clock + (name === 'shoot' ? 0.06 : 0.04);
        api.sfx(name);
      }

      function part(x, y, vx, vy, life, size, color, kind) {
        for (let i = 0; i < MAX_PARTS; i++) {
          const p = parts[i];
          if (p.on) continue;
          p.on = true;
          p.x = x; p.y = y; p.vx = vx; p.vy = vy;
          p.life = p.max = life;
          p.size = size;
          p.color = color;
          p.kind = kind;
          return;
        }
      }

      function burst(x, y, n, speed, colors, kind, life, size) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = speed * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, colors[i % colors.length], kind);
        }
      }

      /* ---------- Soldiers ---------- */
      function makeSoldier(idx, team, name, human) {
        return {
          idx, team, name, human, color: TEAM_COL[team],
          x: 0, y: 0, ox: 0, oy: 0, vx: 0, vy: 0, ang: team === 0 ? 0 : Math.PI, face: team === 0 ? 0 : Math.PI,
          hp: 100, alive: true, respawnT: 0, protect: 0, lastHurt: -99, hitFlash: 0,
          weapon: 'pistol', mag: 12, reserve: Infinity, cool: 0, reloadT: 0, muzzle: 0, nades: 2, nadeCd: 0,
          kills: 0, deaths: 0,
          in: { mx: 0, my: 0, aim: 0, fire: false, reload: false, nade: false, gx: 0, gy: 0 },
          ai: human >= 0 ? null : {
            path: new Int16Array(COLS * ROWS), len: 0, at: 0, goal: -1, repath: 0, through: false,
            think: Math.random() * 0.3, mode: 'advance', target: null, react: 0, err: 0, aim: 0,
            strafe: 1, strafeT: 0, coverX: 0, coverY: 0, hasCover: false, coverCd: 0, holdT: 0,
            stuck: 0, sx: 0, sy: 0, goalT: 0, flank: false, flankSide: 1, wallShot: -1, pull: 0, gx: 0, gy: 0
          }
        };
      }

      function spawnSoldier(s) {
        let best = null;
        let bestSc = -1;
        for (const sp of spawns[s.team]) {
          let md = 2000;
          for (const o of soldiers) {
            if (o === s || !o.alive) continue;
            const d = Math.hypot(o.x - sp[0], o.y - sp[1]);
            md = Math.min(md, o.team === s.team ? d * 3 : d);
          }
          md += Math.random() * 60;
          if (md > bestSc) { bestSc = md; best = sp; }
        }
        s.x = s.ox = best[0];
        s.y = s.oy = best[1];
        s.hp = 100;
        s.alive = true;
        s.protect = PROTECT;
        s.weapon = 'pistol';
        s.mag = WEAPONS.pistol.mag;
        s.reserve = Infinity;
        s.reloadT = 0;
        s.cool = 0.2;
        s.nades = 2;
        s.ang = s.face = s.team === 0 ? 0 : Math.PI;
        s.lastHurt = -99;
        if (s.ai) {
          s.ai.len = 0;
          s.ai.goal = -1;
          s.ai.target = null;
          s.ai.mode = 'advance';
          s.ai.hasCover = false;
          s.ai.holdT = 0;
          s.ai.aim = s.ang;
        }
      }

      function moveSoldier(s, dx, dy) {
        if (dx && !hitsTiles(s.x + dx, s.y, RAD)) s.x += dx;
        if (dy && !hitsTiles(s.x, s.y + dy, RAD)) s.y += dy;
      }

      /* ---------- Combat ---------- */
      function damageTile(c, amount, x, y) {
        if (tiles[c] !== WALL) {
          if (tiles[c] === PILLAR) burst(x, y, 2, 120, SPARK, 0, 0.18, 2);
          return;
        }
        const before = hp[c];
        hp[c] -= amount;
        flashT[c] = 0.08;
        burst(x, y, 2, 140, DEBRIS, 1, 0.4, 3);
        const tx = c % COLS;
        const ty = (c / COLS) | 0;
        const st0 = before > WALL_HP * 0.66 ? 0 : before > WALL_HP * 0.33 ? 1 : 2;
        const st1 = hp[c] > WALL_HP * 0.66 ? 0 : hp[c] > WALL_HP * 0.33 ? 1 : 2;
        if (st1 !== st0 && hp[c] > 0) sfx('tick', x, y);
        if (hp[c] <= 0) {
          tiles[c] = FLOOR;
          hp[c] = 0;
          rubble[c] = 1;
          const cx = tx * T + T / 2;
          const cy = ty * T + T / 2;
          burst(cx, cy, 14, 200, DEBRIS, 1, 0.7, 4);
          burst(cx, cy, 6, 50, [SMOKE], 2, 1.1, 14);
          sfx('boom', cx, cy);
          for (const h of humans) {
            if (!h.alive || Math.hypot(h.x - cx, h.y - cy) > 160) continue;
            shake = Math.max(shake, 0.12);
            if (!hintWall) {
              hintWall = true;
              api.setStatus('That wall is gone. Every brick wall can be shot down, so keep moving.');
            } else if (!hintPillar) {
              hintPillar = true;
              api.setStatus('Only the dark riveted pillars never break. Use them when it gets hot.');
            }
          }
        }
      }

      function damageSoldier(s, dmg, by) {
        if (state !== 'play' || !s.alive || s.protect > 0) return;
        s.hp -= dmg;
        s.lastHurt = clock;
        s.hitFlash = 0.12;
        burst(s.x, s.y, 3, 120, [s.color, '#F3F0FF'], 0, 0.25, 2);
        if (s.human >= 0) {
          shake = Math.max(shake, 0.1);
          sfx('hit');
        }
        if (by && by.human >= 0) {
          by.hitMark = 0.2;
          sfx('tick');
        }
        if (s.ai && by) {
          // Being shot reveals the shooter's position.
          memX[s.team][by.idx] = by.x;
          memY[s.team][by.idx] = by.y;
          memT[s.team][by.idx] = clock;
          if (!s.ai.target) s.ai.think = Math.min(s.ai.think, 0.05);
        }
        if (s.hp <= 0) killSoldier(s, by);
      }

      function killSoldier(s, by) {
        s.hp = 0;
        s.alive = false;
        s.respawnT = RESPAWN;
        s.deaths++;
        burst(s.x, s.y, 16, 220, [s.color, '#F3F0FF', C.gold], 0, 0.6, 3);
        burst(s.x, s.y, 4, 40, [SMOKE], 2, 0.9, 12);
        if (by && by.team !== s.team) {
          by.kills++;
          score[by.team]++;
        } else {
          // Self-inflicted or unknown: point goes to the other team.
          score[1 - s.team]++;
        }
        feed.unshift({ a: by ? by.name : '—', at: by ? by.team : 1 - s.team, b: s.name, bt: s.team, t: 4.5 });
        if (feed.length > 5) feed.length = 5;
        if (s.human >= 0) {
          sfx('lose');
          shake = Math.max(shake, 0.25);
        } else if (by && by.human >= 0) {
          sfx('score');
        } else {
          sfx('hit', s.x, s.y);
        }
        api.setScore(score[0] + ' – ' + score[1]);
        if (score[0] >= KILLS_TO_WIN || score[1] >= KILLS_TO_WIN) endMatch();
      }

      function fire(s) {
        const wp = WEAPONS[s.weapon];
        if (s.cool > 0 || s.reloadT > 0) return;
        if (s.mag <= 0) { startReload(s); return; }
        s.cool = wp.rate;
        s.mag--;
        s.muzzle = 0.06;
        const ca = Math.cos(s.ang);
        const sa = Math.sin(s.ang);
        let mx = s.x + ca * (10 + wp.len) - sa * 4;
        let my = s.y + sa * (10 + wp.len) + ca * 4;
        // Never spawn bullets inside a wall the shooter is hugging.
        if (lineBlock(s.x, s.y, mx, my) !== -1) { mx = s.x; my = s.y; }
        for (let k = 0; k < wp.pellets; k++) {
          let b = null;
          for (let i = 0; i < MAX_BULLETS; i++) if (!bullets[i].on) { b = bullets[i]; break; }
          if (!b) break;
          const a = s.ang + (Math.random() - 0.5) * 2 * wp.spread;
          const sp = wp.speed * (wp.pellets > 1 ? 0.85 + Math.random() * 0.3 : 1);
          b.on = true;
          b.x = mx;
          b.y = my;
          b.vx = Math.cos(a) * sp;
          b.vy = Math.sin(a) * sp;
          b.life = wp.life;
          b.dmg = wp.dmg;
          b.team = s.team;
          b.owner = s;
        }
        part(s.x - sa * 5, s.y + ca * 5, -sa * 80 + (Math.random() - 0.5) * 40, ca * 80, 0.5, 3, C.gold, 1);
        if (s.human >= 0) {
          sfx('shoot');
          shake = Math.max(shake, s.weapon === 'shotgun' ? 0.1 : 0.03);
        } else {
          sfx('shoot', s.x, s.y);
        }
        // Gunfire is loud: nearby enemies hear roughly where it came from.
        for (const o of soldiers) {
          if (o.team === s.team || !o.ai || !o.alive) continue;
          if (Math.abs(o.x - s.x) + Math.abs(o.y - s.y) < 520) {
            memX[o.team][s.idx] = s.x;
            memY[o.team][s.idx] = s.y;
            memT[o.team][s.idx] = clock - 1;
          }
        }
        if (s.mag <= 0) startReload(s);
      }

      function startReload(s) {
        const wp = WEAPONS[s.weapon];
        if (s.reloadT > 0 || s.mag >= wp.mag) return;
        if (s.reserve <= 0) {
          if (s.weapon !== 'pistol') {
            s.weapon = 'pistol';
            s.mag = WEAPONS.pistol.mag;
            s.reserve = Infinity;
            s.cool = 0.25;
          }
          return;
        }
        s.reloadT = wp.reload;
      }

      function throwNade(s, tx, ty) {
        if (s.nades <= 0 || s.nadeCd > 0 || !s.alive) return;
        let dx = tx - s.x;
        let dy = ty - s.y;
        let d = Math.hypot(dx, dy) || 1;
        if (d > 360) { dx *= 360 / d; dy *= 360 / d; d = 360; }
        if (d < 60) { dx *= 60 / d; dy *= 60 / d; }
        s.nades--;
        s.nadeCd = 0.8;
        grenades.push({ x: s.x, y: s.y, vx: dx / 0.7, vy: dy / 0.7, t: 0, team: s.team, owner: s });
        sfx('flip', s.x, s.y);
      }

      function explode(g) {
        burst(g.x, g.y, 26, 320, [C.gold, '#FF9F45', '#F3F0FF'], 0, 0.5, 3);
        burst(g.x, g.y, 10, 70, [SMOKE], 2, 1.3, 20);
        sfx('boom', g.x, g.y);
        for (const h of humans) if (Math.hypot(h.x - g.x, h.y - g.y) < 420) shake = Math.max(shake, 0.3);
        const tx0 = Math.floor((g.x - GREN_R) / T);
        const tx1 = Math.floor((g.x + GREN_R) / T);
        const ty0 = Math.floor((g.y - GREN_R) / T);
        const ty1 = Math.floor((g.y + GREN_R) / T);
        for (let ty = Math.max(0, ty0); ty <= Math.min(ROWS - 1, ty1); ty++) {
          for (let tx = Math.max(0, tx0); tx <= Math.min(COLS - 1, tx1); tx++) {
            const c = ty * COLS + tx;
            if (tiles[c] !== WALL) continue;
            const d = Math.hypot(tx * T + T / 2 - g.x, ty * T + T / 2 - g.y);
            if (d < GREN_R) damageTile(c, 130 * (1 - d / GREN_R) + 30, tx * T + T / 2, ty * T + T / 2);
          }
        }
        for (const s of soldiers) {
          if (!s.alive || s.team === g.team) continue;
          const d = Math.hypot(s.x - g.x, s.y - g.y);
          if (d > GREN_R) continue;
          const blk = lineBlock(g.x, g.y, s.x, s.y);
          if (blk >= 0 && tiles[blk] === PILLAR) continue;
          damageSoldier(s, 100 * (1 - d / GREN_R) + 15, g.owner);
        }
      }

      function updateGrenades(dt) {
        for (let i = grenades.length - 1; i >= 0; i--) {
          const g = grenades[i];
          g.t += dt;
          if (g.t > 0.7) {
            const f = Math.pow(0.02, dt);
            g.vx *= f;
            g.vy *= f;
          }
          const nx = g.x + g.vx * dt;
          if (hitsTiles(nx, g.y, 5)) g.vx *= -0.5; else g.x = nx;
          const ny = g.y + g.vy * dt;
          if (hitsTiles(g.x, ny, 5)) g.vy *= -0.5; else g.y = ny;
          if (g.t >= GREN_FUSE) {
            grenades.splice(i, 1);
            explode(g);
            if (state !== 'play') return;
          }
        }
      }

      function updateBullets(dt) {
        for (let i = 0; i < MAX_BULLETS; i++) {
          const b = bullets[i];
          if (!b.on) continue;
          b.life -= dt;
          if (b.life <= 0) { b.on = false; continue; }
          const sp = Math.hypot(b.vx, b.vy);
          const steps = Math.max(1, Math.ceil(sp * dt / 7));
          const h = dt / steps;
          for (let s = 0; s < steps && b.on; s++) {
            b.x += b.vx * h;
            b.y += b.vy * h;
            const tx = Math.floor(b.x / T);
            const ty = Math.floor(b.y / T);
            if (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) { b.on = false; break; }
            const c = ty * COLS + tx;
            if (tiles[c]) {
              b.on = false;
              damageTile(c, b.dmg, b.x - b.vx * h * 0.5, b.y - b.vy * h * 0.5);
              break;
            }
            for (let k = 0; k < soldiers.length; k++) {
              const o = soldiers[k];
              if (!o.alive || o.team === b.team) continue;
              const dx = o.x - b.x;
              const dy = o.y - b.y;
              if (dx * dx + dy * dy < (RAD + 2) * (RAD + 2)) {
                b.on = false;
                damageSoldier(o, b.dmg, b.owner);
                break;
              }
            }
          }
          if (state !== 'play') return;
        }
      }

      function updateParts(dt) {
        for (let i = 0; i < MAX_PARTS; i++) {
          const p = parts[i];
          if (!p.on) continue;
          p.life -= dt;
          if (p.life <= 0) { p.on = false; continue; }
          const f = p.kind === 2 ? 0.4 : 0.05;
          const k = Math.pow(f, dt);
          p.vx *= k;
          p.vy *= k;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }

      function updatePickups(dt) {
        for (const p of pickups) {
          if (!p.on) {
            p.t -= dt;
            if (p.t <= 0) p.on = true;
            continue;
          }
          for (const s of soldiers) {
            if (!s.alive || Math.abs(s.x - p.x) > 20 || Math.abs(s.y - p.y) > 20) continue;
            if (s.weapon === p.kind && s.reserve >= WEAPONS[p.kind].reserve) continue;
            s.weapon = p.kind;
            s.mag = WEAPONS[p.kind].mag;
            s.reserve = WEAPONS[p.kind].reserve;
            s.reloadT = 0;
            s.cool = 0.15;
            p.on = false;
            p.t = PICKUP_RESPAWN;
            if (s.human >= 0) {
              api.sfx('power');
              api.setStatus((twoP ? 'P' + (s.human + 1) + ' picked up the ' : 'You picked up the ') + WEAPONS[p.kind].name + '.');
            }
            break;
          }
        }
      }

      /* ---------- Bots ---------- */
      function rememberVisible(b) {
        let best = null;
        let bestSc = 1e9;
        for (const e of soldiers) {
          if (e.team === b.team || !e.alive) continue;
          const d = Math.hypot(e.x - b.x, e.y - b.y);
          if (d > 760) continue;
          if (lineBlock(b.x, b.y, e.x, e.y) !== -1) continue;
          memX[b.team][e.idx] = e.x;
          memY[b.team][e.idx] = e.y;
          memT[b.team][e.idx] = clock;
          let sc = d + e.hp * 1.5;
          if (e === b.ai.target) sc -= 120;
          if (e.protect > 0) sc += 300;
          if (sc < bestSc) { bestSc = sc; best = e; }
        }
        return best;
      }

      function knownEnemy(b) {
        let best = -1;
        let bestD = 1e9;
        const team = b.team;
        for (const e of soldiers) {
          if (e.team === team || !e.alive) continue;
          if (clock - memT[team][e.idx] > 6) continue;
          const d = Math.hypot(memX[team][e.idx] - b.x, memY[team][e.idx] - b.y) + (clock - memT[team][e.idx]) * 40;
          if (d < bestD) { bestD = d; best = e.idx; }
        }
        return best;
      }

      function findCover(b, tx, ty) {
        const cx = Math.floor(b.x / T);
        const cy = Math.floor(b.y / T);
        let best = -1;
        let bestSc = 1e9;
        for (let dy = -5; dy <= 5; dy++) {
          for (let dx = -5; dx <= 5; dx++) {
            const x = cx + dx;
            const y = cy + dy;
            if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) continue;
            const c = y * COLS + x;
            if (tiles[c]) continue;
            let pillar = false;
            let near = false;
            for (let k = 0; k < 4; k++) {
              const n = tiles[(y + DY4[k]) * COLS + x + DX4[k]];
              if (n) near = true;
              if (n === PILLAR) pillar = true;
            }
            if (!near) continue;
            const px = x * T + T / 2;
            const py = y * T + T / 2;
            if (lineBlock(tx, ty, px, py) === -1) continue;
            const dt = Math.hypot(px - tx, py - ty);
            let sc = Math.hypot(px - b.x, py - b.y) + (pillar ? -70 : 0) + (dt < 120 ? 200 : 0);
            if (sc < bestSc) { bestSc = sc; best = c; }
          }
        }
        return best;
      }

      function pathTo(b, goalCell) {
        const ai = b.ai;
        const here = Math.floor(b.y / T) * COLS + Math.floor(b.x / T);
        ai.goal = goalCell;
        ai.through = false;
        ai.len = findPath(here, goalCell, ai.path, false);
        if (ai.len < 0) {
          ai.len = findPath(here, goalCell, ai.path, true);
          ai.through = true;
        }
        ai.at = 0;
        ai.repath = 0.7 + Math.random() * 0.5;
        if (ai.len < 0) ai.len = 0;
      }

      /* Steers along the current path. Returns false when there is nowhere left to go. */
      function followPath(b, speedK) {
        const ai = b.ai;
        if (ai.repath <= 0 && ai.goal >= 0) pathTo(b, ai.goal);
        if (ai.at >= ai.len) return false;
        // Skip waypoints we can walk to directly.
        ai.pull -= 1;
        if (ai.pull <= 0) {
          ai.pull = 6;
          while (ai.at + 1 < ai.len) {
            const n = ai.path[ai.at + 1];
            if (tiles[n] || !clearPath(b.x, b.y, (n % COLS) * T + T / 2, ((n / COLS) | 0) * T + T / 2, RAD - 1)) break;
            ai.at++;
          }
        }
        const c = ai.path[ai.at];
        const cx = (c % COLS) * T + T / 2;
        const cy = ((c / COLS) | 0) * T + T / 2;
        if (tiles[c] === WALL) {
          // Breach: shoot the wall in the way.
          ai.wallShot = c;
          b.in.mx = 0;
          b.in.my = 0;
          return true;
        }
        if (tiles[c] === PILLAR) { ai.repath = 0; return true; }
        const dx = cx - b.x;
        const dy = cy - b.y;
        const d = Math.hypot(dx, dy);
        if (d < 8) { ai.at++; return true; }
        b.in.mx = dx / d * speedK;
        b.in.my = dy / d * speedK;
        return true;
      }

      function botThink(b) {
        const ai = b.ai;
        const sk = b.team === 0 ? DA : D;
        ai.think = sk.think * U.rand(0.8, 1.2);
        const seen = rememberVisible(b);
        if (seen && seen !== ai.target) {
          ai.react = sk.react * U.rand(0.8, 1.3);
          ai.err = (Math.random() * 2 - 1) * sk.err;
        }
        ai.target = seen;
        const hurtRecently = clock - b.lastHurt < 1.5;
        if (b.hp < 35 && (seen || hurtRecently) && ai.mode !== 'retreat') {
          ai.mode = 'retreat';
          const threatX = seen ? seen.x : b.x + (b.team === 0 ? 200 : -200);
          const threatY = seen ? seen.y : b.y;
          const cov = findCover(b, threatX, threatY);
          if (cov >= 0) pathTo(b, cov);
          else {
            const sp = spawns[b.team][(Math.random() * spawns[b.team].length) | 0];
            pathTo(b, Math.floor(sp[1] / T) * COLS + Math.floor(sp[0] / T));
          }
          ai.holdT = 2.5;
          return;
        }
        if (ai.mode === 'retreat' && (b.hp < 80 && clock - b.lastHurt < 6)) return;
        if (seen) {
          if (ai.mode !== 'fight') ai.hasCover = false;
          ai.mode = 'fight';
          ai.coverCd -= sk.think;
          if (!ai.hasCover && ai.coverCd <= 0 && (hurtRecently || Math.random() < sk.cover * 0.35) && Math.random() < sk.cover) {
            ai.coverCd = 3;
            const cov = findCover(b, seen.x, seen.y);
            if (cov >= 0) {
              ai.hasCover = true;
              ai.coverX = (cov % COLS) * T + T / 2;
              ai.coverY = ((cov / COLS) | 0) * T + T / 2;
              pathTo(b, cov);
            }
          }
          // Grenade a clump of enemies.
          if (b.nades > 0 && Math.random() < sk.grenade * 0.25) {
            const d = Math.hypot(seen.x - b.x, seen.y - b.y);
            if (d > 120 && d < 360) {
              let crowd = 0;
              for (const o of soldiers) if (o.alive && o.team === seen.team && Math.hypot(o.x - seen.x, o.y - seen.y) < 90) crowd++;
              if (crowd >= 2 || b.hp < 50) throwNade(b, seen.x + seen.vx * 0.6, seen.y + seen.vy * 0.6);
            }
          }
          return;
        }
        if (ai.mode === 'fight' && ai.hasCover) {
          ai.mode = 'hold';
          ai.holdT = 0.8 + Math.random() * 1.6;
        }
        if (ai.mode === 'hold' || ai.mode === 'retreat') {
          if (ai.holdT > 0) return;
        }
        const k = knownEnemy(b);
        if (k >= 0) {
          const ex = memX[b.team][k];
          const ey = memY[b.team][k];
          const age = clock - memT[b.team][k];
          const d = Math.hypot(ex - b.x, ey - b.y);
          // Enemy ducked behind breakable cover: grenade it or shoot the wall down.
          if (age < 2.5 && d < 400) {
            const blk = lineBlock(b.x, b.y, ex, ey);
            if (blk > 0 && tiles[blk] === WALL) {
              if (b.nades > 0 && d > 130 && Math.random() < sk.grenade) {
                throwNade(b, ex, ey);
              } else {
                const bx = (blk % COLS) * T + T / 2;
                const by = ((blk / COLS) | 0) * T + T / 2;
                if (Math.hypot(bx - b.x, by - b.y) < 330) {
                  ai.mode = 'breach';
                  ai.wallShot = blk;
                  return;
                }
              }
            }
          }
          ai.mode = 'hunt';
          let gx = ex;
          let gy = ey;
          if (ai.flank && d > 220 && !(ai.mode === 'hunt' && ai.goal >= 0 && ai.at >= ai.len)) {
            const nx = (ex - b.x) / d;
            const ny = (ey - b.y) / d;
            gx = ex - nx * 120 - ny * 200 * ai.flankSide;
            gy = ey - ny * 120 + nx * 200 * ai.flankSide;
          }
          gx = U.clamp(gx, T * 1.5, MW - T * 1.5);
          gy = U.clamp(gy, T * 1.5, MH - T * 1.5);
          const gc = Math.floor(gy / T) * COLS + Math.floor(gx / T);
          if (tiles[gc] !== PILLAR && (gc !== ai.goal || ai.repath <= 0)) pathTo(b, gc);
          if (d < 40) memT[b.team][k] = -99;
          return;
        }
        // Loot a better gun if one is close.
        if (b.weapon === 'pistol') {
          for (const p of pickups) {
            if (!p.on || Math.hypot(p.x - b.x, p.y - b.y) > 420) continue;
            ai.mode = 'loot';
            const gc = Math.floor(p.y / T) * COLS + Math.floor(p.x / T);
            if (gc !== ai.goal) pathTo(b, gc);
            return;
          }
        }
        if (ai.mode !== 'advance' || ai.goal < 0 || ai.len === 0 || ai.at >= ai.len || ai.goalT <= 0) {
          ai.mode = 'advance';
          ai.goalT = 8 + Math.random() * 6;
          for (let tries = 0; tries < 30; tries++) {
            const x = b.team === 0 ? U.randInt(HALF - 6, COLS - 6) : U.randInt(5, HALF + 5);
            const y = U.randInt(2, ROWS - 3);
            const c = y * COLS + x;
            if (!tiles[c]) { pathTo(b, c); break; }
          }
        }
      }

      function updateBot(b, dt) {
        const ai = b.ai;
        const sk = b.team === 0 ? DA : D;
        ai.think -= dt;
        ai.react -= dt;
        ai.repath -= dt;
        ai.holdT -= dt;
        ai.goalT -= dt;
        ai.strafeT -= dt;
        b.in.mx = 0;
        b.in.my = 0;
        b.in.fire = false;
        if (ai.think <= 0) botThink(b);
        const t = ai.target;
        const tVisible = t && t.alive && lineBlock(b.x, b.y, t.x, t.y) === -1;
        const speedK = sk.speed;
        let aimAt = null;
        if (tVisible) {
          const wp = WEAPONS[b.weapon];
          const d = Math.hypot(t.x - b.x, t.y - b.y);
          const lead = d / wp.speed * sk.lead;
          ai.gx = t.x + t.vx * lead;
          ai.gy = t.y + t.vy * lead;
          aimAt = true;
          if (ai.mode === 'retreat') {
            followPath(b, speedK);
          } else if (ai.hasCover && Math.hypot(ai.coverX - b.x, ai.coverY - b.y) > 10 && ai.at < ai.len) {
            followPath(b, speedK);
          } else {
            if (ai.strafeT <= 0) {
              ai.strafeT = U.rand(0.4, 1.2);
              if (Math.random() < 0.5) ai.strafe = -ai.strafe;
            }
            const nx = (t.x - b.x) / (d || 1);
            const ny = (t.y - b.y) / (d || 1);
            let mx = -ny * ai.strafe * 0.8;
            let my = nx * ai.strafe * 0.8;
            const keep = wp.keep;
            if (d > keep + 60) { mx += nx; my += ny; } else if (d < keep - 80) { mx -= nx * 0.7; my -= ny * 0.7; }
            const ml = Math.hypot(mx, my) || 1;
            b.in.mx = mx / ml * speedK * 0.8;
            b.in.my = my / ml * speedK * 0.8;
            if (hitsTiles(b.x + b.in.mx * 14, b.y + b.in.my * 14, RAD)) ai.strafe = -ai.strafe;
          }
          if (ai.react <= 0 && d < wp.speed * wp.life * 0.95) {
            b.in.fire = Math.abs(angDiff(Math.atan2(ai.gy - b.y, ai.gx - b.x) + ai.err, b.ang)) < 0.14;
          }
          if (b.in.fire && Math.random() < dt * 1.5) ai.err = (Math.random() * 2 - 1) * sk.err;
        } else if (ai.mode === 'breach' || (ai.wallShot >= 0 && tiles[ai.wallShot] === WALL && ai.through)) {
          const c = ai.wallShot;
          if (c >= 0 && tiles[c] === WALL) {
            ai.gx = (c % COLS) * T + T / 2;
            ai.gy = ((c / COLS) | 0) * T + T / 2;
            aimAt = true;
            b.in.fire = Math.abs(angDiff(Math.atan2(ai.gy - b.y, ai.gx - b.x), b.ang)) < 0.2;
            if (ai.mode !== 'breach') followPath(b, speedK);
          } else {
            ai.mode = 'hunt';
            ai.wallShot = -1;
            ai.think = 0;
          }
        } else if (ai.mode === 'hold' && ai.holdT > 0) {
          // Sit tight behind cover and heal.
        } else {
          followPath(b, speedK * (ai.mode === 'advance' ? 0.85 : 1));
          if (ai.wallShot >= 0 && tiles[ai.wallShot] === WALL) {
            ai.gx = (ai.wallShot % COLS) * T + T / 2;
            ai.gy = ((ai.wallShot / COLS) | 0) * T + T / 2;
            aimAt = true;
            b.in.fire = Math.abs(angDiff(Math.atan2(ai.gy - b.y, ai.gx - b.x), b.ang)) < 0.2;
          }
        }
        if (ai.wallShot >= 0 && tiles[ai.wallShot] !== WALL) ai.wallShot = -1;
        // Aim: track target or face where we walk.
        let want = b.ang;
        if (aimAt) want = Math.atan2(ai.gy - b.y, ai.gx - b.x) + (tVisible ? ai.err : 0);
        else if (b.in.mx || b.in.my) want = Math.atan2(b.in.my, b.in.mx);
        const diff = angDiff(want, b.ang);
        const m = sk.turn * dt;
        b.ang += diff > m ? m : diff < -m ? -m : diff;
        // Unstick.
        ai.stuck += dt;
        if (ai.stuck > 1) {
          if ((b.in.mx || b.in.my) && Math.hypot(b.x - ai.sx, b.y - ai.sy) < 10) {
            ai.repath = 0;
            ai.strafe = -ai.strafe;
            ai.goalT = 0;
            ai.think = 0;
          }
          ai.stuck = 0;
          ai.sx = b.x;
          ai.sy = b.y;
        }
        if (b.mag === 0 && b.reloadT <= 0) startReload(b);
        else if (!tVisible && b.mag < WEAPONS[b.weapon].mag * 0.4) startReload(b);
      }

      /* ---------- Humans ---------- */
      const P_KEYS = [
        { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', nade: 'KeyG', reload: 'KeyR' },
        { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter', nade: 'Period', reload: 'Slash' }
      ];

      function mouseWorld() {
        return { x: camX + (mouseX - W / 2) / zoom, y: camY + (mouseY - H / 2) / zoom };
      }

      function aimAssist(s, base) {
        let best = null;
        let bestD = 0.38;
        for (const e of soldiers) {
          if (!e.alive || e.team === s.team) continue;
          const d = Math.hypot(e.x - s.x, e.y - s.y);
          if (d > 520) continue;
          const a = Math.atan2(e.y - s.y, e.x - s.x);
          const df = Math.abs(angDiff(a, base));
          if (df < bestD && lineBlock(s.x, s.y, e.x, e.y) === -1) { bestD = df; best = a; }
        }
        if (best === null) return base;
        return base + angDiff(best, base) * 0.75;
      }

      function updateHuman(s, dt) {
        const k = P_KEYS[s.human];
        let mx = 0;
        let my = 0;
        if (keys.has(k.left)) mx -= 1;
        if (keys.has(k.right)) mx += 1;
        if (keys.has(k.up)) my -= 1;
        if (keys.has(k.down)) my += 1;
        const ml = Math.hypot(mx, my);
        s.in.mx = ml ? mx / ml : 0;
        s.in.my = ml ? my / ml : 0;
        s.in.fire = keys.has(k.fire);
        if (keys.has(k.reload)) startReload(s);
        if (!twoP) {
          const mw = mouseWorld();
          if (mouseSeen) s.ang = Math.atan2(mw.y - s.y, mw.x - s.x);
          else if (ml) s.ang = Math.atan2(my, mx);
          s.in.fire = s.in.fire || mouseDown;
        } else {
          if (ml) {
            const want = Math.atan2(my, mx);
            const rate = s.in.fire ? 3 : 12;
            const d = angDiff(want, s.face);
            s.face += U.clamp(d, -rate * dt, rate * dt);
          }
          s.ang = s.in.fire ? aimAssist(s, s.face) : s.face;
        }
      }

      function humanNade(s) {
        if (state !== 'play' || !s.alive) return;
        if (!twoP) {
          const mw = mouseWorld();
          throwNade(s, mw.x, mw.y);
        } else {
          throwNade(s, s.x + Math.cos(s.face) * 260, s.y + Math.sin(s.face) * 260);
        }
      }

      /* ---------- Common soldier update ---------- */
      function updateSoldier(s, dt) {
        s.cool -= dt;
        s.nadeCd -= dt;
        s.muzzle -= dt;
        s.hitFlash -= dt;
        s.protect -= dt;
        if (s.hitMark) s.hitMark = Math.max(0, s.hitMark - dt);
        if (!s.alive) {
          s.vx = s.vy = 0;
          s.respawnT -= dt;
          if (s.respawnT <= 0) spawnSoldier(s);
          return;
        }
        if (s.reloadT > 0) {
          s.reloadT -= dt;
          if (s.reloadT <= 0) {
            const wp = WEAPONS[s.weapon];
            const take = Math.min(wp.mag - s.mag, s.reserve);
            s.mag += take;
            s.reserve -= take;
            if (s.human >= 0) sfx('blip');
          }
        }
        if (s.human >= 0) updateHuman(s, dt);
        else updateBot(s, dt);
        const sp = SPEED * (s.weapon === 'rifle' ? 0.94 : 1);
        moveSoldier(s, s.in.mx * sp * dt, s.in.my * sp * dt);
        if (s.in.fire) {
          if (s.protect > 0) s.protect = 0;
          fire(s);
        }
        if (clock - s.lastHurt > REGEN_DELAY && s.hp < 100) s.hp = Math.min(100, s.hp + REGEN * dt);
      }

      function separate() {
        for (let i = 0; i < soldiers.length; i++) {
          const a = soldiers[i];
          if (!a.alive) continue;
          for (let j = i + 1; j < soldiers.length; j++) {
            const b = soldiers[j];
            if (!b.alive) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            if (d2 < (RAD * 2) * (RAD * 2) && d2 > 0.01) {
              const d = Math.sqrt(d2);
              const push = (RAD * 2 - d) * 0.5;
              moveSoldier(a, -dx / d * push, -dy / d * push);
              moveSoldier(b, dx / d * push, dy / d * push);
            }
          }
        }
      }

      /* ---------- Flow ---------- */
      function startMatch(two, dn) {
        twoP = two;
        diffName = dn;
        D = DIFF[dn];
        DA = dn === 'easy' ? ALLY_EASY : DIFF[dn];
        genMap();
        for (const b of bullets) b.on = false;
        for (const p of parts) p.on = false;
        grenades = [];
        feed = [];
        score = [0, 0];
        matchT = MATCH_TIME;
        countT = 3;
        goT = 0;
        shake = 0;
        hintWall = false;
        hintPillar = false;
        lastSec = 0;
        const names = botNames(8);
        soldiers = [];
        humans = [];
        let ni = 0;
        const p1 = makeSoldier(0, 0, twoP ? 'P1' : 'You', 0);
        soldiers.push(p1);
        humans.push(p1);
        if (twoP) {
          const p2 = makeSoldier(1, 0, 'P2', 1);
          soldiers.push(p2);
          humans.push(p2);
        }
        while (soldiers.length < 4) soldiers.push(makeSoldier(soldiers.length, 0, names[ni++], -1));
        for (let i = 0; i < 4; i++) soldiers.push(makeSoldier(soldiers.length, 1, names[ni++], -1));
        let flankers = [0, 0];
        for (const s of soldiers) {
          s.alive = false;
          if (s.ai && flankers[s.team] < (dn === 'hard' ? 2 : 1)) {
            s.ai.flank = true;
            s.ai.flankSide = flankers[s.team] === 0 ? 1 : -1;
            flankers[s.team]++;
          }
        }
        for (const s of soldiers) spawnSoldier(s);
        for (const s of soldiers) s.protect = 0;
        for (let t = 0; t < 2; t++) { memT[t].fill(-99); }
        ranked = soldiers.slice();
        pickups = [];
        for (const sp of PICKUP_SPOTS) {
          pickups.push({ x: sp[0] * T + T / 2, y: sp[1] * T + T / 2, kind: sp[2], on: true, t: 0 });
          pickups.push({ x: (COLS - 1 - sp[0]) * T + T / 2, y: sp[1] * T + T / 2, kind: sp[2], on: true, t: 0 });
        }
        camX = humans[0].x;
        camY = humans[0].y;
        zoom = 1;
        canvas.style.cursor = twoP ? 'default' : 'none';
        state = 'count';
        api.setScore('0 – 0');
        api.setStatus('Brick walls crack and fall when shot. The dark riveted pillars are the only cover that lasts.');
        api.sfx('tick');
      }

      function showStartMenu() {
        state = 'menu';
        canvas.style.cursor = 'default';
        api.setStatus('4v4 team deathmatch: first to 25 knockouts.');
        api.menu({
          title: 'Squad Strike',
          text: 'Coral squad versus the cyan bots, first to 25 knockouts. Every brick wall can be shot down, so cover never lasts.',
          buttons: [
            { label: '1 player', primary: true, onClick: () => showDiffMenu(false) },
            { label: '2 players (co-op)', onClick: () => showDiffMenu(true) }
          ]
        });
      }

      function showDiffMenu(two) {
        api.menu({
          title: two ? 'Co-op squad' : 'Solo squad',
          text: two
            ? 'P1: WASD, Space shoots where you face, G grenade, R reload. P2: arrows, Enter shoots, . grenade, / reload.'
            : 'WASD to move, mouse to aim, click to shoot, G grenade, R reload. Your squadmates are bots.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(two, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(two, 'normal') },
            { label: 'Hard', onClick: () => startMatch(two, 'hard') }
          ]
        });
      }

      function endMatch() {
        if (state === 'over') return;
        state = 'over';
        canvas.style.cursor = 'default';
        const win = score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : -1;
        api.sfx(win === 0 ? 'win' : 'lose');
        sortRanked();
        const mvp = ranked[0];
        const humanLine = humans.map((h) => h.name + ' ' + h.kills + '/' + h.deaths).join(', ');
        api.setStatus('Match over: Coral ' + score[0] + ' – ' + score[1] + ' Cyan.');
        api.menu({
          title: win === 0 ? 'Coral squad wins!' : win === 1 ? 'Cyan squad wins' : 'Draw!',
          text: 'Final score ' + score[0] + ' – ' + score[1] + '. Kills/deaths: ' + humanLine + '. Top fragger: ' +
            mvp.name + ' with ' + mvp.kills + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(twoP, diffName) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function rankCmp(a, b) { return a.team - b.team || b.kills - a.kills || a.deaths - b.deaths || a.idx - b.idx; }
      function sortRanked() { ranked.sort(rankCmp); }

      /* ---------- Input ---------- */
      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        mouseX = p.x;
        mouseY = p.y;
        mouseSeen = true;
      });
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        mouseX = p.x;
        mouseY = p.y;
        mouseSeen = true;
        if (twoP || state !== 'play') return;
        if (e.button === 2) humanNade(humans[0]);
        else mouseDown = true;
      });
      api.on(window, 'pointerup', () => { mouseDown = false; }, { always: true });
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        if (e.code === 'KeyG' && humans[0]) humanNade(humans[0]);
        if (e.code === 'Period' && twoP && humans[1]) humanNade(humans[1]);
      });

      /* ---------- Update ---------- */
      function updateCamera(dt) {
        let tx;
        let ty;
        let tz = 1;
        const a0 = humans[0];
        const a1 = humans[1];
        const both = twoP && a0.alive && a1.alive;
        if (!both) {
          const h = twoP && !a0.alive && a1.alive ? a1 : a0;
          tx = h.x;
          ty = h.y;
          if (!twoP && mouseSeen && h.alive) {
            tx += U.clamp((mouseX - W / 2) * 0.3, -160, 160);
            ty += U.clamp((mouseY - H / 2) * 0.3, -110, 110);
          }
        } else {
          tx = (a0.x + a1.x) / 2;
          ty = (a0.y + a1.y) / 2;
          tz = U.clamp(Math.min((W - 220) / (Math.abs(a0.x - a1.x) + 1), (H - 180) / (Math.abs(a0.y - a1.y) + 1)), 0.5, 1);
        }
        const k = 1 - Math.pow(0.002, dt);
        zoom += (tz - zoom) * k;
        const hw = W / 2 / zoom;
        const hh = H / 2 / zoom;
        tx = MW > hw * 2 ? U.clamp(tx, hw, MW - hw) : MW / 2;
        ty = MH > hh * 2 ? U.clamp(ty, hh, MH - hh) : MH / 2;
        camX += (tx - camX) * k;
        camY += (ty - camY) * k;
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        goT = Math.max(0, goT - dt);
        for (let i = 0; i < flashT.length; i++) if (flashT[i] > 0) flashT[i] -= dt;
        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t -= dt;
          if (feed[i].t <= 0) feed.splice(i, 1);
        }
        updateParts(dt);
        if (state === 'menu' || !humans.length) return;
        updateCamera(dt);
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          for (const h of humans) updateHuman(h, 0);
          if (countT <= 0) {
            state = 'play';
            goT = 0.8;
            api.sfx('blip');
          } else if (Math.ceil(countT) !== prev) {
            api.sfx('tick');
          }
          return;
        }
        if (state !== 'play') {
          updateBullets(dt);
          return;
        }
        matchT -= dt;
        const sec = Math.ceil(matchT);
        if (sec <= 10 && sec > 0 && sec !== lastSec) api.sfx('tick');
        lastSec = sec;
        if (matchT <= 0) {
          matchT = 0;
          endMatch();
          return;
        }
        for (const s of soldiers) {
          updateSoldier(s, dt);
          if (state !== 'play') return;
        }
        separate();
        for (const s of soldiers) {
          if (dt > 0) {
            s.vx = (s.x - s.ox) / dt;
            s.vy = (s.y - s.oy) / dt;
          }
          s.ox = s.x;
          s.oy = s.y;
        }
        updateBullets(dt);
        if (state !== 'play') return;
        updateGrenades(dt);
        if (state !== 'play') return;
        updatePickups(dt);
        sortRanked();
      }

      /* ---------- Render ---------- */
      function onScreen(x, y, m) {
        const hw = W / 2 / zoom + m;
        const hh = H / 2 / zoom + m;
        return Math.abs(x - camX) < hw && Math.abs(y - camY) < hh;
      }

      function drawMap() {
        const hw = W / 2 / zoom;
        const hh = H / 2 / zoom;
        const tx0 = Math.max(0, Math.floor((camX - hw) / T) - 1);
        const tx1 = Math.min(COLS - 1, Math.floor((camX + hw) / T) + 1);
        const ty0 = Math.max(0, Math.floor((camY - hh) / T) - 1);
        const ty1 = Math.min(ROWS - 1, Math.floor((camY + hh) / T) + 1);
        ctx.fillStyle = '#191630';
        ctx.fillRect(0, 0, MW, MH);
        ctx.fillStyle = U.alpha(C.p1, 0.07);
        ctx.fillRect(T, T, T * 4, MH - T * 2);
        ctx.fillStyle = U.alpha(C.p2, 0.07);
        ctx.fillRect(MW - T * 5, T, T * 4, MH - T * 2);
        ctx.strokeStyle = '#211D3F';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = tx0; x <= tx1 + 1; x++) { ctx.moveTo(x * T, ty0 * T); ctx.lineTo(x * T, (ty1 + 1) * T); }
        for (let y = ty0; y <= ty1 + 1; y++) { ctx.moveTo(tx0 * T, y * T); ctx.lineTo((tx1 + 1) * T, y * T); }
        ctx.stroke();
        ctx.strokeStyle = U.alpha(C.violet, 0.12);
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(MW / 2, T);
        ctx.lineTo(MW / 2, MH - T);
        ctx.stroke();
        ctx.setLineDash([]);
        // Rubble left by fallen walls.
        ctx.fillStyle = '#2E2852';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const c = ty * COLS + tx;
            if (!rubble[c] || tiles[c]) continue;
            const sd = seed[c];
            const x = tx * T;
            const y = ty * T;
            ctx.rect(x + 4 + (sd % 9), y + 5 + (sd % 7), 6, 5);
            ctx.rect(x + 18 - (sd % 5), y + 17 + (sd % 6), 7, 6);
            ctx.rect(x + 9 + (sd % 13), y + 22 - (sd % 9), 4, 4);
          }
        }
        ctx.fill();
        // Shadows, then bodies grouped by damage stage, then details.
        ctx.fillStyle = 'rgba(8,6,26,0.45)';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) if (tiles[ty * COLS + tx]) ctx.rect(tx * T + 4, ty * T + 5, T, T);
        }
        ctx.fill();
        for (let st = 0; st < 3; st++) {
          ctx.fillStyle = st === 0 ? '#8A79C2' : st === 1 ? '#7867AE' : '#5F5090';
          ctx.beginPath();
          for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
              const c = ty * COLS + tx;
              if (tiles[c] !== WALL) continue;
              const s = hp[c] > WALL_HP * 0.66 ? 0 : hp[c] > WALL_HP * 0.33 ? 1 : 2;
              if (s === st) ctx.rect(tx * T, ty * T, T, T);
            }
          }
          ctx.fill();
        }
        ctx.fillStyle = '#34305C';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) if (tiles[ty * COLS + tx] === PILLAR) ctx.rect(tx * T, ty * T, T, T);
        }
        ctx.fill();
        ctx.fillStyle = '#4A4480';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) if (tiles[ty * COLS + tx] === PILLAR) ctx.rect(tx * T + 3, ty * T + 3, T - 6, 4);
        }
        ctx.fill();
        ctx.fillStyle = '#A9A3D6';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            if (tiles[ty * COLS + tx] !== PILLAR) continue;
            const x = tx * T;
            const y = ty * T;
            ctx.rect(x + 5, y + 10, 2, 2);
            ctx.rect(x + T - 7, y + 10, 2, 2);
            ctx.rect(x + 5, y + T - 7, 2, 2);
            ctx.rect(x + T - 7, y + T - 7, 2, 2);
          }
        }
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) if (tiles[ty * COLS + tx] === WALL) ctx.rect(tx * T, ty * T, T, 4);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,32,80,0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            if (tiles[ty * COLS + tx] !== WALL) continue;
            const x = tx * T;
            const y = ty * T;
            ctx.moveTo(x, y + 16); ctx.lineTo(x + T, y + 16);
            ctx.moveTo(x + 16, y + 4); ctx.lineTo(x + 16, y + 16);
            ctx.moveTo(x + 8, y + 16); ctx.lineTo(x + 8, y + T);
            ctx.moveTo(x + 24, y + 16); ctx.lineTo(x + 24, y + T);
          }
        }
        ctx.stroke();
        ctx.strokeStyle = '#1C1838';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) {
            const c = ty * COLS + tx;
            if (tiles[c] !== WALL || hp[c] > WALL_HP * 0.66) continue;
            const x = tx * T;
            const y = ty * T;
            const sd = seed[c];
            ctx.moveTo(x + 6 + (sd % 18), y + 2);
            ctx.lineTo(x + 15, y + 14);
            ctx.lineTo(x + 9 + (sd % 13), y + 29);
            if (hp[c] <= WALL_HP * 0.33) {
              ctx.moveTo(x + 30, y + 8 + (sd % 12));
              ctx.lineTo(x + 18, y + 18);
              ctx.lineTo(x + 2, y + 13 + (sd % 15));
            }
          }
        }
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        for (let ty = ty0; ty <= ty1; ty++) {
          for (let tx = tx0; tx <= tx1; tx++) if (flashT[ty * COLS + tx] > 0 && tiles[ty * COLS + tx] === WALL) ctx.rect(tx * T, ty * T, T, T);
        }
        ctx.fill();
      }

      function drawPickups() {
        for (const p of pickups) {
          if (!onScreen(p.x, p.y, 40)) continue;
          ctx.strokeStyle = U.alpha(C.gold, p.on ? 0.7 : 0.2);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 15, 0, TAU);
          ctx.stroke();
          if (!p.on) {
            ctx.strokeStyle = U.alpha(C.gold, 0.6);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.t / PICKUP_RESPAWN));
            ctx.stroke();
            continue;
          }
          const wp = WEAPONS[p.kind];
          const bob = Math.sin(clock * 3 + p.x) * 2;
          ctx.fillStyle = U.alpha(C.gold, 0.15);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 13, 0, TAU);
          ctx.fill();
          ctx.fillStyle = C.gold;
          ctx.fillRect(p.x - wp.len / 2 - 2, p.y - 3 + bob, wp.len + 4, 6);
          ctx.fillRect(p.x - wp.len / 2, p.y + 1 + bob, 5, 6);
          ctx.font = TINY;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.text;
          ctx.fillText(wp.name, p.x, p.y - 20);
        }
      }

      function drawBullets() {
        for (let team = 0; team < 2; team++) {
          ctx.strokeStyle = team === 0 ? '#FFB0BC' : '#A6EBFF';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i < MAX_BULLETS; i++) {
            const b = bullets[i];
            if (!b.on || b.team !== team) continue;
            ctx.moveTo(b.x - b.vx * 0.018, b.y - b.vy * 0.018);
            ctx.lineTo(b.x, b.y);
          }
          ctx.stroke();
        }
      }

      function drawParts() {
        for (let i = 0; i < MAX_PARTS; i++) {
          const p = parts[i];
          if (!p.on) continue;
          const k = p.life / p.max;
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          if (p.kind === 2) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
            ctx.fill();
          } else {
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          }
        }
        ctx.globalAlpha = 1;
      }

      function drawGrenades() {
        for (const g of grenades) {
          const lift = g.t < 0.7 ? Math.sin(g.t / 0.7 * Math.PI) * 18 : 0;
          ctx.fillStyle = 'rgba(8,6,26,0.4)';
          ctx.beginPath();
          ctx.arc(g.x, g.y + 3, 5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = TEAM_COL[g.team];
          ctx.beginPath();
          ctx.arc(g.x, g.y - lift, 6, 0, TAU);
          ctx.fill();
          const blink = (GREN_FUSE - g.t) < 0.5 ? Math.sin(clock * 40) > 0 : Math.sin(clock * 12) > 0;
          ctx.fillStyle = blink ? C.gold : '#2A2546';
          ctx.fillRect(g.x - 2, g.y - lift - 2, 4, 4);
          if (g.t > 0.7) {
            ctx.strokeStyle = U.alpha(C.gold, 0.25);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 6]);
            ctx.beginPath();
            ctx.arc(g.x, g.y, GREN_R, 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      function drawSoldiers() {
        for (const s of soldiers) {
          if (!onScreen(s.x, s.y, 60)) continue;
          if (!s.alive) {
            ctx.strokeStyle = U.alpha(s.color, 0.5 * Math.min(1, s.respawnT));
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(s.x - 7, s.y - 7); ctx.lineTo(s.x + 7, s.y + 7);
            ctx.moveTo(s.x + 7, s.y - 7); ctx.lineTo(s.x - 7, s.y + 7);
            ctx.stroke();
            continue;
          }
          drawSoldier(ctx, s.x, s.y, s.ang, s.hitFlash > 0 ? '#FFFFFF' : s.color, WEAPONS[s.weapon].len, s.muzzle, s.protect, clock);
          // Label + health.
          ctx.font = TINY;
          ctx.textAlign = 'center';
          if (s.human >= 0) {
            ctx.fillStyle = s.human === 0 ? C.text : C.gold;
            ctx.font = SMALL;
            ctx.fillText(twoP ? 'P' + (s.human + 1) : 'YOU', s.x, s.y - 20);
          } else {
            ctx.fillStyle = U.alpha(s.color, 0.85);
            ctx.fillText(s.name, s.x, s.y - 19);
          }
          if (s.hp < 100) {
            ctx.fillStyle = 'rgba(15,13,36,0.8)';
            ctx.fillRect(s.x - 14, s.y + 16, 28, 4);
            ctx.fillStyle = s.hp > 50 ? C.mint : s.hp > 25 ? C.gold : C.p1;
            ctx.fillRect(s.x - 14, s.y + 16, 28 * s.hp / 100, 4);
          }
          if (s.reloadT > 0) {
            ctx.strokeStyle = U.alpha(C.text, 0.7);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(s.x, s.y, RAD + 7, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - s.reloadT / WEAPONS[s.weapon].reload));
            ctx.stroke();
          }
        }
      }

      function drawPlayerPanel(s, x, y, alignRight) {
        const w = 236;
        const px = alignRight ? x - w : x;
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, px, y, w, 62, 10);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = s.human === 1 ? C.gold : C.text;
        ctx.fillText(twoP ? 'P' + (s.human + 1) : 'YOU', px + 12, y + 14);
        ctx.fillStyle = 'rgba(243,240,255,0.12)';
        ctx.fillRect(px + 52, y + 9, 170, 10);
        ctx.fillStyle = s.hp > 50 ? C.mint : s.hp > 25 ? C.gold : C.p1;
        ctx.fillRect(px + 52, y + 9, 170 * Math.max(0, s.hp) / 100, 10);
        const wp = WEAPONS[s.weapon];
        ctx.font = HUD;
        ctx.fillStyle = C.text;
        ctx.fillText(wp.name, px + 12, y + 40);
        ctx.textAlign = 'right';
        ctx.fillStyle = s.mag === 0 ? C.p1 : C.text;
        const res = s.reserve === Infinity ? '∞' : String(s.reserve);
        ctx.fillText(s.reloadT > 0 ? 'reloading' : s.mag + ' / ' + res, px + 168, y + 40);
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = k < s.nades ? C.gold : 'rgba(255,197,61,0.18)';
          ctx.beginPath();
          ctx.arc(px + 192 + k * 18, y + 40, 6, 0, TAU);
          ctx.fill();
        }
        if (!s.alive) {
          ctx.fillStyle = 'rgba(15,13,36,0.75)';
          U.roundRect(ctx, px, y, w, 62, 10);
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.fillStyle = C.p1;
          ctx.fillText('Respawn in ' + Math.max(0, s.respawnT).toFixed(1), px + w / 2, y + 31);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function drawMinimap(x, y) {
        const s = 3;
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, x - 5, y - 5, COLS * s + 10, ROWS * s + 10, 8);
        ctx.fill();
        for (let i = 0; i < tiles.length; i++) {
          if (!tiles[i]) continue;
          ctx.fillStyle = tiles[i] === PILLAR ? '#4A4480' : '#7867AE';
          ctx.fillRect(x + (i % COLS) * s, y + ((i / COLS) | 0) * s, s, s);
        }
        for (const o of soldiers) {
          if (!o.alive) continue;
          let show = o.team === 0;
          if (!show) {
            for (const f of soldiers) {
              if (f.team !== 0 || !f.alive) continue;
              if (Math.abs(f.x - o.x) + Math.abs(f.y - o.y) < 900 && lineBlock(f.x, f.y, o.x, o.y) === -1) { show = true; break; }
            }
          }
          if (!show) continue;
          ctx.fillStyle = o.human >= 0 ? '#FFFFFF' : o.color;
          ctx.fillRect(x + o.x / T * s - 2, y + o.y / T * s - 2, 4, 4);
        }
        const hw = W / 2 / zoom;
        const hh = H / 2 / zoom;
        ctx.strokeStyle = 'rgba(243,240,255,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + (camX - hw) / T * s, y + (camY - hh) / T * s, hw * 2 / T * s, hh * 2 / T * s);
      }

      function drawHud() {
        // Team score + timer.
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, W / 2 - 150, 10, 300, 44, 12);
        ctx.fill();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = '800 24px Unbounded, sans-serif';
        ctx.fillStyle = C.p1;
        ctx.fillText(String(score[0]), W / 2 - 100, 32);
        ctx.fillStyle = C.p2;
        ctx.fillText(String(score[1]), W / 2 + 100, 32);
        const secs = Math.max(0, Math.ceil(matchT));
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillStyle = secs <= 10 && state === 'play' ? C.p1 : C.text;
        ctx.fillText(Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'), W / 2, 27);
        ctx.font = TINY;
        ctx.fillStyle = C.muted;
        ctx.fillText('FIRST TO ' + KILLS_TO_WIN, W / 2, 44);
        ctx.fillStyle = U.alpha(C.p1, 0.8);
        ctx.fillRect(W / 2 - 140, 50, 100 * score[0] / KILLS_TO_WIN, 3);
        ctx.fillStyle = U.alpha(C.p2, 0.8);
        ctx.fillRect(W / 2 + 140 - 100 * score[1] / KILLS_TO_WIN, 50, 100 * score[1] / KILLS_TO_WIN, 3);
        // Leaderboard.
        const lw = 200;
        const lx = W - lw - 10;
        ctx.fillStyle = 'rgba(15,13,36,0.78)';
        U.roundRect(ctx, lx, 10, lw, 26 + ranked.length * 16, 10);
        ctx.fill();
        ctx.font = TINY;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('SQUADS', lx + 10, 22);
        ctx.textAlign = 'right';
        ctx.fillText('K   D', lx + lw - 10, 22);
        for (let i = 0; i < ranked.length; i++) {
          const s = ranked[i];
          const y = 38 + i * 16;
          if (s.human >= 0) {
            ctx.fillStyle = U.alpha(C.p1, 0.18);
            ctx.fillRect(lx + 4, y - 7, lw - 8, 15);
          }
          ctx.fillStyle = s.alive ? s.color : U.alpha(s.color, 0.4);
          ctx.fillRect(lx + 10, y - 3, 6, 6);
          ctx.textAlign = 'left';
          ctx.fillStyle = s.human >= 0 ? C.text : C.muted;
          ctx.fillText(s.name.length > 16 ? s.name.slice(0, 15) + '…' : s.name, lx + 22, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.text;
          ctx.fillText(String(s.kills).padStart(2, ' ') + '  ' + String(s.deaths).padStart(2, ' '), lx + lw - 10, y);
        }
        // Kill feed.
        ctx.font = TINY;
        for (let i = 0; i < feed.length; i++) {
          const f = feed[i];
          const y = 22 + i * 18;
          ctx.globalAlpha = Math.min(1, f.t);
          ctx.fillStyle = 'rgba(15,13,36,0.7)';
          U.roundRect(ctx, 10, y - 8, 230, 16, 5);
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.fillStyle = TEAM_COL[f.at];
          ctx.fillText(f.a, 18, y);
          ctx.fillStyle = C.muted;
          ctx.textAlign = 'center';
          ctx.fillText('»', 125, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = TEAM_COL[f.bt];
          ctx.fillText(f.b, 232, y);
        }
        ctx.globalAlpha = 1;
        // Player panels + minimap.
        if (!twoP) {
          drawPlayerPanel(humans[0], 10, H - 72, false);
          drawMinimap(W - COLS * 3 - 15, H - ROWS * 3 - 15);
        } else {
          drawPlayerPanel(humans[0], 10, H - 72, false);
          drawPlayerPanel(humans[1], W - 10, H - 72, true);
          drawMinimap(W / 2 - COLS * 3 / 2, H - ROWS * 3 - 15);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function drawCrosshair() {
        if (twoP || !mouseSeen || state !== 'play' && state !== 'count') return;
        const h = humans[0];
        const x = mouseX;
        const y = mouseY;
        ctx.strokeStyle = h.hitMark > 0 ? C.gold : C.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.moveTo(x - 15, y); ctx.lineTo(x - 5, y);
        ctx.moveTo(x + 5, y); ctx.lineTo(x + 15, y);
        ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 5);
        ctx.moveTo(x, y + 5); ctx.lineTo(x, y + 15);
        ctx.stroke();
        if (h.hitMark > 0) {
          ctx.strokeStyle = C.gold;
          ctx.beginPath();
          ctx.moveTo(x - 12, y - 12); ctx.lineTo(x - 6, y - 6);
          ctx.moveTo(x + 12, y - 12); ctx.lineTo(x + 6, y - 6);
          ctx.moveTo(x - 12, y + 12); ctx.lineTo(x - 6, y + 6);
          ctx.moveTo(x + 12, y + 12); ctx.lineTo(x + 6, y + 6);
          ctx.stroke();
        }
      }

      function drawBanner(text, color) {
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,0.6)';
        ctx.fillText(text, W / 2 + 3, H / 2 - 37);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2 - 40);
        ctx.textBaseline = 'alphabetic';
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (!humans.length) {
          // Idle backdrop behind the first menu.
          ctx.save();
          ctx.translate(W / 2, H / 2);
          ctx.scale(0.62, 0.62);
          camX = MW / 2 + Math.sin(clock * 0.2) * 200;
          camY = MH / 2;
          zoom = 0.62;
          ctx.translate(-camX, -camY);
          drawMap();
          ctx.restore();
          return;
        }
        ctx.save();
        const sx = shake > 0 ? (Math.random() - 0.5) * shake * 40 : 0;
        const sy = shake > 0 ? (Math.random() - 0.5) * shake * 40 : 0;
        ctx.translate(W / 2 + sx, H / 2 + sy);
        ctx.scale(zoom, zoom);
        ctx.translate(-camX, -camY);
        drawMap();
        drawPickups();
        drawGrenades();
        drawSoldiers();
        drawBullets();
        drawParts();
        ctx.restore();
        drawHud();
        drawCrosshair();
        if (state === 'count') drawBanner(String(Math.max(1, Math.ceil(countT))), C.gold);
        else if (goT > 0) drawBanner('Go!', C.mint);
      }

      genMap();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });

      return {
        destroy() {
          canvas.style.cursor = '';
        }
      };
    }
  });
})();
