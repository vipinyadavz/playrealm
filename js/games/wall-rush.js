/* Wall Rush: top-down battle royale against nine CPU players on a big island.
   Hook: drop an instant wall to soak up bullets while the storm closes in every 40 seconds. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const WORLD = 2400;
  const TAU = Math.PI * 2;
  const R = 14;
  const SPEED = 185;
  const CELL = 120;
  const GN = WORLD / CELL;
  const WALL_COST = 10;
  const WALL_HP = 120;
  const WALL_LEN = 72;
  const WALL_TH = 12;
  const WALL_DIST = 60;
  const MAX_BUILT = 140;
  const MAX_HP = 100;
  const MAX_WOOD = 300;
  const MAX_BULLETS = 260;
  const MAX_PARTS = 500;
  const PHASE_T = 40;
  const HOLD_T = 22;
  const RADII = [1750, 1050, 650, 380, 200, 80, 0];
  const STORM_DPS = [1, 2, 4, 7, 10, 14, 22];
  const PICK_R = 44;
  const MONO = '"JetBrains Mono", monospace';
  const WOOD = '#C99A5B';
  const GUNS = {
    pistol: { name: 'Pistol', dmg: 17, rate: 3.2, spread: 0.07, range: 620, speed: 950, mag: 12, reload: 1.0, pellets: 1, color: C.text, len: 14, pref: 280, rank: 1 },
    smg: { name: 'SMG', dmg: 10, rate: 10, spread: 0.2, range: 460, speed: 900, mag: 30, reload: 1.6, pellets: 1, color: C.p2, len: 17, pref: 220, rank: 3 },
    shotgun: { name: 'Shotgun', dmg: 10, rate: 1.1, spread: 0.36, range: 270, speed: 820, mag: 5, reload: 2.0, pellets: 7, color: C.gold, len: 19, pref: 120, rank: 3 },
    rifle: { name: 'Rifle', dmg: 36, rate: 1.4, spread: 0.02, range: 950, speed: 1400, mag: 6, reload: 1.9, pellets: 1, color: C.violet, len: 24, pref: 420, rank: 4 }
  };
  const GUN_LOOT = ['pistol', 'pistol', 'pistol', 'smg', 'smg', 'shotgun', 'shotgun', 'rifle'];
  const AXE = { dmg: 22, rate: 2.2, range: 46 };
  const NAMES = ['Captain Crumb', 'NoodleArm', 'Sir Wobble', 'Pancake Pete', 'Wobbly Wanda', 'Count Crumble',
    'Duchess Dash', 'Sergeant Sprout', 'Turnip Tim', 'Lady Lasagna', 'Professor Plop', 'Gnocchi Joe', 'Admiral Toast'];
  const COLS = [C.p2, C.gold, C.mint, C.violet, '#FF9A3C', '#FF6FD8', '#5B8CFF', '#B4F05A', '#E6E1FF'];
  const LEVELS = {
    easy: { aimErr: 0.2, react: 0.75, build: 0.25, sight: 430, turn: 5, tol: 0.3, lead: 0, wallShoot: false, think: 0.35 },
    normal: { aimErr: 0.1, react: 0.42, build: 0.6, sight: 480, turn: 8, tol: 0.18, lead: 0.5, wallShoot: true, think: 0.25 },
    hard: { aimErr: 0.05, react: 0.24, build: 0.9, sight: 540, turn: 12, tol: 0.1, lead: 1, wallShoot: true, think: 0.18 }
  };
  const STEER_OFFS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3];

  /* ---------- Geometry ---------- */
  function segDist2(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy || 1;
    let t = ((px - x1) * dx + (py - y1) * dy) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = x1 + dx * t - px;
    const ey = y1 + dy * t - py;
    return ex * ex + ey * ey;
  }
  function segsCross(ax, ay, bx, by, cx, cy, dx, dy) {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
  }
  function segRect(x1, y1, x2, y2, o) {
    let t0 = 0;
    let t1 = 1;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const p = [-dx, dx, -dy, dy];
    const q = [x1 - o.x, o.x + o.w - x1, y1 - o.y, o.y + o.h - y1];
    for (let i = 0; i < 4; i++) {
      if (p[i] === 0) {
        if (q[i] < 0) return false;
      } else {
        const r = q[i] / p[i];
        if (p[i] < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
      }
    }
    return true;
  }

  /* Card art, also reused nowhere else: a fighter behind a fresh wall, storm edge creeping in. */
  function thumbPlayer(ctx, x, y, a, col, s) {
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 4 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 20 * s, y + Math.sin(a) * 20 * s); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, 11 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,36,.6)';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  Arcade.register({
    id: 'wall-rush',
    title: 'Wall Rush',
    category: 'io',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.p2,
    tagline: 'Ten players drop onto an island. Loot, build, and be the last one standing.',
    hook: 'Drop an instant wall to soak up bullets, while the storm closes in every 40 seconds.',
    tags: ['io', 'battle royale', 'battle', 'shooter', 'build', 'storm', 'loot', 'bots', 'top-down'],
    howTo: 'You and nine CPU players start with an axe. Find pistols, SMGs, shotguns and rifles in houses and crates, ' +
      'grab ammo and medkits, and chop trees or crates for wood. ' +
      'The twist: press Q to drop a wooden wall right in front of you. It costs 10 wood, takes 120 damage before it breaks, ' +
      'and shows cracks as it weakens. Every 40 seconds the storm shrinks toward the white circle on the minimap, and it hurts more each time. ' +
      'Score 100 points per place above last, plus 150 per elimination.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
      { keys: ['Mouse', 'Click'], label: 'Aim and shoot' },
      { keys: ['↑', '↓', '←', '→', 'Space'], label: 'Aim and shoot without a mouse' },
      { keys: ['Q', 'Right-click'], label: 'Drop a wall (10 wood)' },
      { keys: ['E'], label: 'Pick up' },
      { keys: ['R'], label: 'Reload' },
      { keys: ['1', '2', '3'], label: 'Switch slot (empty slot = axe)' }
    ],

    drawThumb(ctx, w, h, t) {
      const s = w / 320;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.mint, 0.06);
      for (let i = 0; i < 40; i++) ctx.fillRect(((i * 73) % 320) * s, ((i * 47) % 200) * s, 3 * s, 3 * s);
      // House corner.
      ctx.fillStyle = C.panel;
      ctx.fillRect(200 * s, 20 * s, 110 * s, 90 * s);
      ctx.fillStyle = C.line;
      ctx.fillRect(200 * s, 20 * s, 110 * s, 7 * s);
      ctx.fillRect(200 * s, 20 * s, 7 * s, 40 * s);
      // Trees.
      [[40, 40, 22], [70, 165, 18], [285, 160, 20]].forEach(([x, y, r]) => {
        ctx.fillStyle = 'rgba(75,227,160,.28)';
        ctx.beginPath(); ctx.arc(x * s, y * s, r * s, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(75,227,160,.5)';
        ctx.beginPath(); ctx.arc(x * s, y * s, r * 0.5 * s, 0, TAU); ctx.fill();
      });
      // Storm sweeping in from the left.
      ctx.fillStyle = U.alpha(C.violet, 0.28);
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.arc(230 * s, 110 * s, (215 - Math.sin(t) * 4) * s, 0, TAU, true);
      ctx.fill();
      ctx.strokeStyle = C.violet;
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(230 * s, 110 * s, (215 - Math.sin(t) * 4) * s, Math.PI * 0.8, Math.PI * 1.25); ctx.stroke();
      // Incoming bullets stopped by a cracked wall.
      for (let i = 0; i < 4; i++) {
        const bx = (190 + ((t * 120 + i * 22) % 60)) * s;
        ctx.strokeStyle = U.alpha(C.gold, 0.8);
        ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(bx + 10 * s, (92 + i * 6) * s); ctx.lineTo(bx, (92 + i * 6) * s); ctx.stroke();
      }
      ctx.strokeStyle = WOOD;
      ctx.lineWidth = 11 * s;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(176 * s, 62 * s); ctx.lineTo(170 * s, 140 * s); ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.strokeStyle = 'rgba(15,13,36,.8)';
      ctx.lineWidth = 1.5 * s;
      ctx.beginPath();
      ctx.moveTo(170 * s, 92 * s); ctx.lineTo(176 * s, 98 * s); ctx.lineTo(170 * s, 104 * s); ctx.lineTo(176 * s, 110 * s);
      ctx.stroke();
      thumbPlayer(ctx, 130 * s, 100 * s, 0.1, C.p1, s);
      thumbPlayer(ctx, 268 * s, 120 * s, Math.PI, C.gold, s);
      ctx.fillStyle = C.p2;
      ctx.font = '800 ' + Math.round(14 * s) + 'px ' + MONO;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('3 LEFT', 12 * s, 12 * s);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | count | play | over
      let diff = 'normal';
      let L = LEVELS.normal;
      let players = [];
      let me = null;
      let obstacles = [];
      let built = [];
      let houses = [];
      let items = [];
      let decor = [];
      let grid = [];
      let stamp = 0;
      const found = [];
      let clock = 0;
      let countT = 0;
      let goT = 0;
      let overT = 0;
      let shake = 0;
      let hurtFx = 0;
      let alive = 10;
      let banner = null;
      let hinted = {};
      let feed = [];
      const storm = { x: 1200, y: 1200, r: 1750, fx: 1200, fy: 1200, fr: 1750, tx: 1200, ty: 1200, tr: 1050, phase: 0, t: 0, shrinking: false };
      const cam = { x: 0, y: 0 };
      const mouse = { x: W / 2 + 100, y: H / 2, down: false };
      let aimByKeys = false;

      /* Bullets: parallel typed arrays, swap-remove. */
      const bx = new Float32Array(MAX_BULLETS);
      const by = new Float32Array(MAX_BULLETS);
      const bdx = new Float32Array(MAX_BULLETS);
      const bdy = new Float32Array(MAX_BULLETS);
      const bsp = new Float32Array(MAX_BULLETS);
      const brange = new Float32Array(MAX_BULLETS);
      const bdmg = new Float32Array(MAX_BULLETS);
      const bown = new Int8Array(MAX_BULLETS);
      let bn = 0;

      const px = new Float32Array(MAX_PARTS);
      const py = new Float32Array(MAX_PARTS);
      const pvx = new Float32Array(MAX_PARTS);
      const pvy = new Float32Array(MAX_PARTS);
      const pl = new Float32Array(MAX_PARTS);
      const pm = new Float32Array(MAX_PARTS);
      const ps = new Float32Array(MAX_PARTS);
      const pc = new Array(MAX_PARTS).fill('#fff');
      let pNext = 0;
      function part(x, y, vx, vy, life, size, color) {
        const i = pNext;
        pNext = (pNext + 1) % MAX_PARTS;
        px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pm[i] = life; ps[i] = size; pc[i] = color;
      }
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const v = speed * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size, color);
        }
      }
      const onScreen = (x, y, m) => x > cam.x - m && x < cam.x + W + m && y > cam.y - m && y < cam.y + H + m;
      function sfxAt(name, x, y) {
        if (state === 'play' && onScreen(x, y, 60)) api.sfx(name);
      }
      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }
      function log(text, color) {
        feed.push({ text, color, t: 0 });
        if (feed.length > 4) feed.shift();
      }

      /* ---------- Spatial grid for static and built obstacles ---------- */
      function gridAdd(o) {
        let x0;
        let y0;
        let x1;
        let y1;
        if (o.shape === 0) { x0 = o.x - o.r; x1 = o.x + o.r; y0 = o.y - o.r; y1 = o.y + o.r; }
        else if (o.shape === 1) { x0 = o.x; x1 = o.x + o.w; y0 = o.y; y1 = o.y + o.h; }
        else {
          x0 = Math.min(o.x1, o.x2) - o.th; x1 = Math.max(o.x1, o.x2) + o.th;
          y0 = Math.min(o.y1, o.y2) - o.th; y1 = Math.max(o.y1, o.y2) + o.th;
        }
        const c0 = U.clamp(Math.floor(x0 / CELL), 0, GN - 1);
        const c1 = U.clamp(Math.floor(x1 / CELL), 0, GN - 1);
        const r0 = U.clamp(Math.floor(y0 / CELL), 0, GN - 1);
        const r1 = U.clamp(Math.floor(y1 / CELL), 0, GN - 1);
        o.cells = [];
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            grid[r * GN + c].push(o);
            o.cells.push(r * GN + c);
          }
        }
      }
      function gridRemove(o) {
        for (const idx of o.cells) {
          const arr = grid[idx];
          const i = arr.indexOf(o);
          if (i >= 0) arr.splice(i, 1);
        }
        o.cells = [];
      }
      function query(x0, y0, x1, y1) {
        stamp++;
        found.length = 0;
        const c0 = U.clamp(Math.floor(x0 / CELL), 0, GN - 1);
        const c1 = U.clamp(Math.floor(x1 / CELL), 0, GN - 1);
        const r0 = U.clamp(Math.floor(y0 / CELL), 0, GN - 1);
        const r1 = U.clamp(Math.floor(y1 / CELL), 0, GN - 1);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const arr = grid[r * GN + c];
            for (let i = 0; i < arr.length; i++) {
              const o = arr[i];
              if (o.stamp !== stamp && o.alive) { o.stamp = stamp; found.push(o); }
            }
          }
        }
        return found;
      }
      function cellAt(x, y) {
        const c = U.clamp(Math.floor(x / CELL), 0, GN - 1);
        const r = U.clamp(Math.floor(y / CELL), 0, GN - 1);
        return grid[r * GN + c];
      }
      function hitsPoint(o, x, y, pad) {
        if (o.shape === 0) {
          const dx = x - o.x;
          const dy = y - o.y;
          const rr = o.r + pad;
          return dx * dx + dy * dy < rr * rr;
        }
        if (o.shape === 1) return x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad;
        const rr = o.th / 2 + pad;
        return segDist2(x, y, o.x1, o.y1, o.x2, o.y2) < rr * rr;
      }
      function blocksSeg(o, x1, y1, x2, y2) {
        if (o.shape === 0) return segDist2(o.x, o.y, x1, y1, x2, y2) < o.r * o.r;
        if (o.shape === 1) return segRect(x1, y1, x2, y2, o);
        if (segsCross(x1, y1, x2, y2, o.x1, o.y1, o.x2, o.y2)) return true;
        const rr = (o.th / 2) * (o.th / 2);
        return segDist2(o.x1, o.y1, x1, y1, x2, y2) < rr || segDist2(o.x2, o.y2, x1, y1, x2, y2) < rr;
      }
      /* 0 = clear, 1 = only player-built walls in the way, 2 = blocked by terrain. */
      function losCode(x1, y1, x2, y2) {
        const list = query(Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2));
        let code = 0;
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (o.kind === 'crate') continue;
          if (blocksSeg(o, x1, y1, x2, y2)) {
            if (o.kind !== 'built') return 2;
            code = 1;
          }
        }
        return code;
      }
      function free(x, y, rad) {
        if (x < rad || y < rad || x > WORLD - rad || y > WORLD - rad) return false;
        const list = query(x - rad, y - rad, x + rad, y + rad);
        for (let i = 0; i < list.length; i++) if (hitsPoint(list[i], x, y, rad)) return false;
        return true;
      }
      function pushOut(p) {
        const list = query(p.x - R - 2, p.y - R - 2, p.x + R + 2, p.y + R + 2);
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          let nx;
          let ny;
          let d;
          let lim;
          if (o.shape === 0) {
            nx = p.x - o.x; ny = p.y - o.y; lim = o.r + R;
          } else if (o.shape === 1) {
            const cx = U.clamp(p.x, o.x, o.x + o.w);
            const cy = U.clamp(p.y, o.y, o.y + o.h);
            nx = p.x - cx; ny = p.y - cy; lim = R;
            if (nx === 0 && ny === 0) {
              // Center inside the rect: leave by the nearest side.
              const l = p.x - o.x;
              const r = o.x + o.w - p.x;
              const t = p.y - o.y;
              const b = o.y + o.h - p.y;
              const m = Math.min(l, r, t, b);
              if (m === l) p.x = o.x - R; else if (m === r) p.x = o.x + o.w + R; else if (m === t) p.y = o.y - R; else p.y = o.y + o.h + R;
              continue;
            }
          } else {
            const dx = o.x2 - o.x1;
            const dy = o.y2 - o.y1;
            const l2 = dx * dx + dy * dy || 1;
            const t = U.clamp(((p.x - o.x1) * dx + (p.y - o.y1) * dy) / l2, 0, 1);
            nx = p.x - (o.x1 + dx * t); ny = p.y - (o.y1 + dy * t); lim = R + o.th / 2;
          }
          d = Math.hypot(nx, ny);
          if (d < lim) {
            if (d < 0.001) { nx = 1; ny = 0; d = 1; }
            p.x += (nx / d) * (lim - d);
            p.y += (ny / d) * (lim - d);
          }
        }
        p.x = U.clamp(p.x, R, WORLD - R);
        p.y = U.clamp(p.y, R, WORLD - R);
      }

      /* ---------- World generation ---------- */
      function addObs(o) {
        o.alive = true;
        o.stamp = 0;
        o.flash = 0;
        obstacles.push(o);
        gridAdd(o);
        return o;
      }
      function inHouse(x, y, m) {
        for (const h of houses) if (x > h.x - m && x < h.x + h.w + m && y > h.y - m && y < h.y + h.h + m) return h;
        return null;
      }
      function addItem(x, y, type, extra) {
        const it = Object.assign({ x, y, type, alive: true, bob: Math.random() * TAU }, extra || {});
        items.push(it);
        return it;
      }
      function randomLoot(x, y) {
        const r = Math.random();
        if (r < 0.42) addItem(x, y, 'gun', { gun: U.pick(GUN_LOOT) });
        else if (r < 0.72) addItem(x, y, 'ammo', { amount: 24 });
        else if (r < 0.88) addItem(x, y, 'med');
        else addItem(x, y, 'wood', { amount: 20 });
      }

      function buildWorld() {
        obstacles = [];
        built = [];
        houses = [];
        items = [];
        grid = [];
        for (let i = 0; i < GN * GN; i++) grid.push([]);
        // Houses with doorways.
        for (let tries = 0; houses.length < 9 && tries < 400; tries++) {
          const w = U.randInt(220, 320);
          const h = U.randInt(180, 250);
          const x = U.randInt(120, WORLD - 120 - w);
          const y = U.randInt(120, WORLD - 120 - h);
          if (houses.some((o) => x < o.x + o.w + 150 && x + w + 150 > o.x && y < o.y + o.h + 150 && y + h + 150 > o.y)) continue;
          houses.push({ x, y, w, h });
        }
        const T = 14;
        const DOOR = 64;
        for (const h of houses) {
          const doors = U.shuffle([0, 1, 2, 3]).slice(0, 2);
          const side = (i, x, y, len, horiz) => {
            if (doors.indexOf(i) < 0) {
              addObs(horiz ? { kind: 'wall', shape: 1, x, y, w: len, h: T } : { kind: 'wall', shape: 1, x, y, w: T, h: len });
              return;
            }
            const a = (len - DOOR) / 2;
            if (horiz) {
              addObs({ kind: 'wall', shape: 1, x, y, w: a, h: T });
              addObs({ kind: 'wall', shape: 1, x: x + a + DOOR, y, w: len - a - DOOR, h: T });
            } else {
              addObs({ kind: 'wall', shape: 1, x, y, w: T, h: a });
              addObs({ kind: 'wall', shape: 1, x, y: y + a + DOOR, w: T, h: len - a - DOOR });
            }
          };
          side(0, h.x, h.y, h.w, true);
          side(1, h.x, h.y + h.h - T, h.w, true);
          side(2, h.x, h.y + T, h.h - 2 * T, false);
          side(3, h.x + h.w - T, h.y + T, h.h - 2 * T, false);
          for (let k = 0; k < 3; k++) randomLoot(h.x + U.rand(40, h.w - 40), h.y + U.rand(40, h.h - 40));
          addObs({ kind: 'crate', shape: 0, x: h.x + U.rand(40, h.w - 40), y: h.y + U.rand(40, h.h - 40), r: 16, hp: 50, maxHp: 50 });
        }
        const place = (n, r0, r1, kind, hp) => {
          for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
            const r = U.rand(r0, r1);
            const x = U.rand(60, WORLD - 60);
            const y = U.rand(60, WORLD - 60);
            if (inHouse(x, y, r + 30) || !free(x, y, r + 26)) continue;
            addObs({ kind, shape: 0, x, y, r, hp, maxHp: hp });
            i++;
          }
        };
        place(42, 22, 38, 'rock', Infinity);
        place(150, 17, 22, 'tree', 160);
        place(40, 16, 16, 'crate', 50);
        for (let i = 0, tries = 0; i < 34 && tries < 600; tries++) {
          const x = U.rand(80, WORLD - 80);
          const y = U.rand(80, WORLD - 80);
          if (!free(x, y, 16)) continue;
          randomLoot(x, y);
          i++;
        }
        decor = [];
        for (let i = 0; i < 520; i++) decor.push({ x: Math.random() * WORLD, y: Math.random() * WORLD, s: U.rand(2, 5), k: Math.random() < 0.85 });
      }

      /* ---------- Players ---------- */
      function makePlayer(id, name, color, human) {
        return {
          id, name, color, human, x: 0, y: 0, vx: 0, vy: 0, hp: MAX_HP, alive: true, aim: 0,
          slots: [null, null, null], cur: 0, ammo: 0, wood: 30, reload: 0, fireCd: 0, wallCd: 0,
          kills: 0, place: 0, flash: 0, lastHit: -1, lastHitT: -99, swing: 0, showHp: 0,
          ai: { think: Math.random() * 0.3, mode: 'roam', gx: 0, gy: 0, target: null, seenT: -99, lx: 0, ly: 0,
            los: 2, react: 0, strafe: 1, strafeT: 0, item: null, itemT: 0, tree: null, wantWall: false, hurtBy: -1,
            hurtT: -99, stuckT: 0, sx: 0, sy: 0, detourA: 0, detourT: 0, side: 1, ban: [], err: 0, firing: false }
        };
      }

      function spawnPlayers() {
        const spots = [];
        for (let tries = 0; spots.length < 10 && tries < 3000; tries++) {
          const x = U.rand(150, WORLD - 150);
          const y = U.rand(150, WORLD - 150);
          const minD = tries < 2000 ? 520 : 200;
          if (!free(x, y, R + 4) || spots.some((s) => U.dist(s.x, s.y, x, y) < minD)) continue;
          spots.push({ x, y });
        }
        while (spots.length < 10) spots.push({ x: 1200 + U.rand(-40, 40) * spots.length, y: 1200 });
        const names = U.shuffle(NAMES.slice());
        const cols = U.shuffle(COLS.slice());
        players = [];
        for (let i = 0; i < 10; i++) {
          const p = i === 0 ? makePlayer(0, 'You', C.p1, true) : makePlayer(i, names[i], cols[i - 1], false);
          p.x = spots[i].x;
          p.y = spots[i].y;
          p.aim = Math.atan2(1200 - p.y, 1200 - p.x);
          players.push(p);
        }
        me = players[0];
      }

      function startGame(d) {
        diff = d;
        L = LEVELS[d];
        buildWorld();
        spawnPlayers();
        bn = 0;
        pl.fill(0);
        feed = [];
        hinted = {};
        alive = 10;
        clock = 0;
        countT = 3;
        goT = 0;
        overT = 0;
        shake = 0;
        hurtFx = 0;
        banner = null;
        storm.x = storm.fx = 1200; storm.y = storm.fy = 1200; storm.r = storm.fr = RADII[0];
        storm.phase = 0; storm.t = 0; storm.shrinking = false;
        pickNext();
        cam.x = me.x - W / 2;
        cam.y = me.y - H / 2;
        state = 'count';
        api.sfx('tick');
        updateScore();
        api.setStatus('Grab a gun and chop trees for wood. Q or right-click drops a wall in front of you.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Wall Rush',
          text: 'Ten players, one island, one shrinking storm. WASD to move, mouse to aim and shoot, Q to drop a wall.',
          buttons: [
            { label: 'Easy', onClick: () => startGame('easy') },
            { label: 'Normal', primary: true, onClick: () => startGame('normal') },
            { label: 'Hard', onClick: () => startGame('hard') }
          ]
        });
      }

      function updateScore() {
        api.setScore(me ? me.kills + (me.kills === 1 ? ' kill' : ' kills') + ' · ' + alive + ' left' : 0);
      }

      function endGame(won) {
        if (state === 'over') return;
        state = 'over';
        if (won) me.place = 1;
        const score = (11 - me.place) * 100 + me.kills * 150;
        const isBest = api.reportScore(score);
        api.sfx(won ? 'win' : 'lose');
        overT = 0;
        const lines = 'Placed #' + me.place + ' of 10 with ' + me.kills + ' elimination' + (me.kills === 1 ? '' : 's') +
          '. Score ' + score + '.';
        api.setStatus(won ? 'You outlasted all nine rivals.' : 'Eliminated in place ' + me.place + '.');
        api.after(1200, () => {
          api.menu({
            title: won ? 'Last one standing!' : isBest ? 'New best: ' + score + '!' : 'Eliminated',
            text: (won && isBest ? 'New best: ' + score + '! ' : '') + lines,
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(diff) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      /* ---------- Storm ---------- */
      function pickNext() {
        const p = storm.phase;
        const nr = RADII[Math.min(p + 1, RADII.length - 1)];
        const slack = Math.max(0, storm.fr - nr);
        const a = Math.random() * TAU;
        const d = Math.random() * slack * 0.85;
        const lim = 120 + nr * 0.3;
        storm.tx = U.clamp(storm.fx + Math.cos(a) * d, lim, WORLD - lim);
        storm.ty = U.clamp(storm.fy + Math.sin(a) * d, lim, WORLD - lim);
        storm.tr = nr;
      }

      function updateStorm(dt) {
        storm.t += dt;
        if (storm.t >= PHASE_T) {
          storm.t -= PHASE_T;
          storm.fx = storm.x = storm.tx;
          storm.fy = storm.y = storm.ty;
          storm.fr = storm.r = storm.tr;
          storm.phase = Math.min(storm.phase + 1, RADII.length - 1);
          storm.shrinking = false;
          if (storm.phase < RADII.length - 1) {
            pickNext();
            banner = { text: 'New safe zone marked', color: C.text, t: 0 };
          }
        }
        if (storm.t >= HOLD_T && storm.fr > storm.tr) {
          if (!storm.shrinking) {
            storm.shrinking = true;
            banner = { text: 'Storm closing in', color: C.violet, t: 0 };
            api.sfx('power');
            hint('storm', 'The storm is closing. Get inside the white circle on the minimap; it hurts more every phase.');
          }
          const k = (storm.t - HOLD_T) / (PHASE_T - HOLD_T);
          storm.x = U.lerp(storm.fx, storm.tx, k);
          storm.y = U.lerp(storm.fy, storm.ty, k);
          storm.r = U.lerp(storm.fr, storm.tr, k);
        }
      }
      const stormDps = () => STORM_DPS[Math.min(storm.phase, STORM_DPS.length - 1)];
      const inStorm = (x, y) => U.dist(x, y, storm.x, storm.y) > storm.r;

      /* ---------- Combat ---------- */
      function spawnBullet(x, y, a, G, owner) {
        if (bn >= MAX_BULLETS) return;
        const i = bn++;
        bx[i] = x; by[i] = y; bdx[i] = Math.cos(a); bdy[i] = Math.sin(a);
        bsp[i] = G.speed; brange[i] = G.range; bdmg[i] = G.dmg; bown[i] = owner;
      }

      function startReload(p) {
        const g = p.slots[p.cur];
        if (!g || p.reload > 0 || p.ammo <= 0 || g.mag >= GUNS[g.type].mag) return;
        p.reload = GUNS[g.type].reload;
        if (p.human) api.sfx('tick');
      }

      function finishReload(p) {
        const g = p.slots[p.cur];
        if (!g) return;
        const need = GUNS[g.type].mag - g.mag;
        const take = Math.min(need, p.ammo);
        g.mag += take;
        p.ammo -= take;
      }

      function tryFire(p) {
        if (p.fireCd > 0 || p.reload > 0 || !p.alive) return;
        const g = p.slots[p.cur];
        if (!g) {
          p.fireCd = 1 / AXE.rate;
          p.swing = 0.2;
          melee(p);
          return;
        }
        const G = GUNS[g.type];
        if (g.mag <= 0) {
          startReload(p);
          if (p.human && p.ammo <= 0) { p.fireCd = 0.4; api.sfx('tick'); hint('noammo', 'Out of ammo. Find ammo boxes, or switch to an empty slot to use your axe.'); }
          return;
        }
        g.mag--;
        p.fireCd = 1 / G.rate;
        const ca = Math.cos(p.aim);
        const sa = Math.sin(p.aim);
        const mx = p.x + ca * (R + 6);
        const my = p.y + sa * (R + 6);
        for (let k = 0; k < G.pellets; k++) {
          const a = G.pellets > 1 ? p.aim + (k / (G.pellets - 1) - 0.5) * G.spread + U.rand(-0.04, 0.04)
            : p.aim + U.rand(-0.5, 0.5) * G.spread;
          spawnBullet(mx, my, a, G, p.id);
        }
        part(mx + ca * 6, my + sa * 6, ca * 60, sa * 60, 0.08, 9, '#FFE7A8');
        if (p.human) {
          api.sfx('shoot');
          shake = Math.max(shake, g.type === 'shotgun' || g.type === 'rifle' ? 4 : 1.5);
        } else {
          sfxAt('shoot', p.x, p.y);
        }
        if (g.mag === 0) startReload(p);
      }

      function melee(p) {
        const ca = Math.cos(p.aim);
        const sa = Math.sin(p.aim);
        const hx = p.x + ca * (R + 16);
        const hy = p.y + sa * (R + 16);
        const list = query(hx - 20, hy - 20, hx + 20, hy + 20);
        for (let i = 0; i < list.length; i++) {
          const o = list[i];
          if (hitsPoint(o, hx, hy, 14)) {
            damageObs(o, AXE.dmg, p, true);
            break;
          }
        }
        for (const o of players) {
          if (o === p || !o.alive) continue;
          if (U.dist(hx, hy, o.x, o.y) < R + 18) {
            hurtPlayer(o, AXE.dmg, p.id, 'axe');
            break;
          }
        }
        if (p.human) api.sfx('tick');
      }

      function damageObs(o, dmg, p, isMelee) {
        o.flash = 0.12;
        if (o.kind === 'rock' || o.kind === 'wall') return;
        o.hp -= dmg;
        if (p && (o.kind === 'tree' || o.kind === 'crate')) {
          const gain = o.kind === 'tree' ? (isMelee ? 4 : dmg >= 30 ? 3 : 1) : 2;
          p.wood = Math.min(MAX_WOOD, p.wood + gain);
          if (p.human && !hinted.wood) hint('wood', 'Wood +' + gain + '. Each wall costs ' + WALL_COST + '. Press Q to drop one.');
        }
        burst(o.shape === 2 ? (o.x1 + o.x2) / 2 : o.x, o.shape === 2 ? (o.y1 + o.y2) / 2 : o.y,
          o.kind === 'tree' ? C.mint : WOOD, 3, 90, 0.3, 2.5);
        if (o.hp <= 0) {
          o.alive = false;
          gridRemove(o);
          if (o.kind === 'built') {
            const i = built.indexOf(o);
            if (i >= 0) built.splice(i, 1);
            for (let k = 0; k < 10; k++) {
              const t = k / 9;
              part(U.lerp(o.x1, o.x2, t), U.lerp(o.y1, o.y2, t), U.rand(-90, 90), U.rand(-90, 90), 0.6, 4, WOOD);
            }
            sfxAt('boom', o.x1, o.y1);
          } else if (o.kind === 'crate') {
            burst(o.x, o.y, WOOD, 14, 160, 0.5, 4);
            randomLoot(o.x, o.y);
            if (Math.random() < 0.5) addItem(o.x + 14, o.y + 8, 'ammo', { amount: 24 });
            sfxAt('hit', o.x, o.y);
          } else if (o.kind === 'tree') {
            burst(o.x, o.y, C.mint, 18, 150, 0.6, 4);
          }
        }
      }

      function hurtPlayer(p, dmg, from, how) {
        if (!p.alive || state !== 'play') return;
        p.hp -= dmg;
        p.flash = 0.15;
        p.showHp = 2;
        if (from >= 0 && from !== p.id) {
          p.lastHit = from;
          p.lastHitT = clock;
        }
        burst(p.x, p.y, p.color, 4, 120, 0.3, 3);
        if (p.human) {
          shake = Math.max(shake, 6);
          hurtFx = 0.5;
          api.sfx('hit');
          if (from >= 0) hint('shot', 'You\'re under fire! Press Q or right-click to drop a wall between you and them.');
        } else if (from >= 0) {
          p.ai.hurtBy = from;
          p.ai.hurtT = clock;
          if (Math.random() < L.build * dmg / 12) p.ai.wantWall = true;
          if (from === 0) sfxAt('hit', p.x, p.y);
        }
        if (p.hp <= 0) eliminate(p, from, how);
      }

      function eliminate(p, from, how) {
        p.alive = false;
        p.hp = 0;
        p.place = alive;
        alive--;
        const killer = from >= 0 && from !== p.id ? players[from] : null;
        if (killer) killer.kills++;
        burst(p.x, p.y, p.color, 26, 220, 0.8, 4);
        burst(p.x, p.y, '#FFFFFF', 10, 160, 0.5, 3);
        // Drop everything for the next looter.
        let k = 0;
        for (const g of p.slots) {
          if (g) addItem(p.x + Math.cos(k * 2.1) * 26, p.y + Math.sin(k * 2.1) * 26, 'gun', { gun: g.type });
          k++;
        }
        if (p.ammo > 0) addItem(p.x - 10, p.y + 18, 'ammo', { amount: Math.max(12, Math.round(p.ammo / 2)) });
        if (p.wood >= 10) addItem(p.x + 14, p.y - 16, 'wood', { amount: Math.round(p.wood / 2) });
        if (how === 'storm') log(p.name + ' was caught by the storm', C.violet);
        else if (killer) log(killer.name + ' eliminated ' + p.name + (how ? ' (' + how + ')' : ''), killer.color);
        else log(p.name + ' is out', p.color);
        if (killer === me) {
          api.sfx('score');
          banner = { text: 'Eliminated ' + p.name, color: C.p1, t: 0 };
        } else {
          sfxAt('boom', p.x, p.y);
        }
        updateScore();
        if (p === me) {
          shake = 14;
          endGame(false);
        } else if (alive <= 1 && me.alive) {
          endGame(true);
        }
      }

      function placeWall(p) {
        if (p.wood < WALL_COST || p.wallCd > 0 || !p.alive) {
          if (p.human && p.wood < WALL_COST && p.wallCd <= 0) {
            p.wallCd = 0.4;
            api.sfx('tick');
            hint('nowood', 'Not enough wood. Chop trees or crates: your axe is the empty slot.');
          }
          return;
        }
        const ca = Math.cos(p.aim);
        const sa = Math.sin(p.aim);
        const cx = U.clamp(p.x + ca * WALL_DIST, 10, WORLD - 10);
        const cy = U.clamp(p.y + sa * WALL_DIST, 10, WORLD - 10);
        const hx = -sa * WALL_LEN / 2;
        const hy = ca * WALL_LEN / 2;
        const o = addObs({ kind: 'built', shape: 2, x1: cx - hx, y1: cy - hy, x2: cx + hx, y2: cy + hy, th: WALL_TH,
          hp: WALL_HP, maxHp: WALL_HP, x: cx, y: cy, born: clock, owner: p.id });
        built.push(o);
        if (built.length > MAX_BUILT) {
          const old = built.shift();
          old.alive = false;
          gridRemove(old);
        }
        p.wood -= WALL_COST;
        p.wallCd = 0.3;
        for (let k = 0; k < 8; k++) {
          const t = k / 7;
          part(U.lerp(o.x1, o.x2, t), U.lerp(o.y1, o.y2, t), U.rand(-40, 40), U.rand(-40, 40), 0.35, 3, WOOD);
        }
        if (p.human) api.sfx('flip');
        else sfxAt('flip', cx, cy);
      }

      function pickup(p, it) {
        if (!it || !it.alive) return false;
        if (it.type === 'gun') {
          let slot = p.slots.indexOf(null);
          if (slot < 0) slot = p.cur;
          const old = p.slots[slot];
          if (old) {
            if (old.type === it.gun) { p.ammo += GUNS[it.gun].mag; it.alive = false; return true; }
            addItem(p.x + U.rand(-12, 12), p.y + 18, 'gun', { gun: old.type });
          }
          p.slots[slot] = { type: it.gun, mag: GUNS[it.gun].mag };
          p.ammo += GUNS[it.gun].mag;
          p.cur = slot;
          p.reload = 0;
        } else if (it.type === 'med') {
          if (p.hp >= MAX_HP) return false;
          p.hp = Math.min(MAX_HP, p.hp + 50);
          burst(p.x, p.y, C.mint, 10, 100, 0.5, 3);
        } else if (it.type === 'ammo') {
          p.ammo += it.amount;
        } else if (it.type === 'wood') {
          p.wood = Math.min(MAX_WOOD, p.wood + it.amount);
        }
        it.alive = false;
        if (p.human) api.sfx('power');
        return true;
      }

      function nearestItem(p, maxD, filter) {
        let best = null;
        let bd = maxD;
        for (const it of items) {
          if (!it.alive) continue;
          const d = U.dist(p.x, p.y, it.x, it.y);
          if (d < bd && (!filter || filter(it))) { bd = d; best = it; }
        }
        return best;
      }

      /* ---------- Bots ---------- */
      const hasAmmo = (p) => p.slots.some((g) => g && (g.mag > 0 || p.ammo > 0));
      const ammoTotal = (p) => p.slots.reduce((s, g) => s + (g ? g.mag : 0), p.ammo);

      function pickSlot(p, d) {
        let best = -1;
        let bs = -1;
        for (let i = 0; i < 3; i++) {
          const g = p.slots[i];
          if (!g || (g.mag <= 0 && p.ammo <= 0)) continue;
          const G = GUNS[g.type];
          let s = G.rank * 10 - Math.abs(d - G.pref) / 20;
          if (d > G.range * 0.9) s -= 40;
          if (g.mag <= 0) s -= 8;
          if (s > bs) { bs = s; best = i; }
        }
        if (best >= 0 && best !== p.cur) { p.cur = best; p.reload = 0; }
        return best;
      }

      function emptySlot(p) {
        const i = p.slots.indexOf(null);
        if (i >= 0 && i !== p.cur) { p.cur = i; p.reload = 0; }
        return i;
      }

      function itemWanted(p) {
        return (it) => {
          if (p.ai.ban.indexOf(it) >= 0) return false;
          if (it.type === 'gun') {
            if (p.slots.indexOf(null) >= 0) return !p.slots.some((g) => g && g.type === it.gun);
            const worst = Math.min(...p.slots.map((g) => GUNS[g.type].rank));
            return GUNS[it.gun].rank > worst;
          }
          if (it.type === 'ammo') return p.slots.some((g) => g) && p.ammo < 90;
          if (it.type === 'med') return p.hp < 70;
          if (it.type === 'wood') return p.wood < 120;
          return false;
        };
      }

      function botThink(b) {
        const ai = b.ai;
        ai.think = L.think * U.rand(0.8, 1.3);
        let tgt = null;
        let td = L.sight;
        for (const o of players) {
          if (o === b || !o.alive) continue;
          const d = U.dist(b.x, b.y, o.x, o.y);
          if (d > td) continue;
          if (losCode(b.x, b.y, o.x, o.y) === 0) { td = d; tgt = o; }
        }
        if (tgt) {
          if (ai.target !== tgt) ai.react = L.react;
          ai.target = tgt;
          ai.seenT = clock;
          ai.lx = tgt.x;
          ai.ly = tgt.y;
          ai.los = 0;
        } else if (ai.target) {
          if (!ai.target.alive || clock - ai.seenT > 3) ai.target = null;
          else ai.los = losCode(b.x, b.y, ai.target.x, ai.target.y);
        }
        ai.err = U.rand(-1, 1) * L.aimErr;
        const dNext = U.dist(b.x, b.y, storm.tx, storm.ty);
        const stormNow = U.dist(b.x, b.y, storm.x, storm.y) > storm.r - 40;
        const late = storm.shrinking || storm.t > HOLD_T - 12 || storm.phase >= 4;
        const needRotate = stormNow || (dNext > storm.tr * 0.8 && late);
        const armed = hasAmmo(b);
        const td2 = ai.target ? U.dist(b.x, b.y, ai.target.x, ai.target.y) : 1e9;
        ai.item = null;
        ai.tree = null;
        if (ai.target && (armed || td2 < 160) && !(stormNow && td2 > 260)) {
          ai.mode = 'fight';
        } else if (needRotate) {
          ai.mode = 'rotate';
          if (U.dist(ai.gx, ai.gy, storm.tx, storm.ty) > storm.tr * 0.6 || Math.random() < 0.1) {
            const a = Math.random() * TAU;
            const r = Math.random() * storm.tr * 0.5;
            ai.gx = storm.tx + Math.cos(a) * r;
            ai.gy = storm.ty + Math.sin(a) * r;
          }
        } else {
          const want = itemWanted(b);
          const it = nearestItem(b, armed ? 520 : 900, want);
          if (it && (!armed || it.type === 'gun' || ammoTotal(b) < 40 || (it.type === 'med' && b.hp < 70) || Math.random() < 0.5)) {
            if (ai.item !== it) ai.itemT = 0;
            ai.mode = 'item';
            ai.item = it;
          } else if (b.wood < 40 && (armed || b.slots.indexOf(null) >= 0)) {
            let best = null;
            let bd = 480;
            for (const o of query(b.x - 480, b.y - 480, b.x + 480, b.y + 480)) {
              if (o.kind !== 'tree' && o.kind !== 'crate') continue;
              const d = U.dist(b.x, b.y, o.x, o.y);
              if (d < bd) { bd = d; best = o; }
            }
            if (best) { ai.mode = 'wood'; ai.tree = best; } else ai.mode = 'roam';
          } else {
            ai.mode = 'roam';
          }
        }
        if (ai.mode === 'roam' && (U.dist(b.x, b.y, ai.gx, ai.gy) < 60 || Math.random() < 0.05 ||
          U.dist(ai.gx, ai.gy, storm.tx, storm.ty) > storm.tr)) {
          const a = Math.random() * TAU;
          const r = Math.random() * Math.max(80, Math.min(storm.tr, storm.r) * 0.7);
          ai.gx = U.clamp(storm.tx + Math.cos(a) * r, 60, WORLD - 60);
          ai.gy = U.clamp(storm.ty + Math.sin(a) * r, 60, WORLD - 60);
        }
        if (ai.ban.length > 6) ai.ban.shift();
      }

      function turnAim(b, want, dt) {
        const d = Math.atan2(Math.sin(want - b.aim), Math.cos(want - b.aim));
        const m = L.turn * dt;
        b.aim += U.clamp(d, -m, m);
        return Math.abs(d);
      }

      /* Steer toward a point, sliding around obstacles; returns a unit move vector in b.vx/b.vy. */
      function navigate(b, gx, gy, dt) {
        const ai = b.ai;
        let ang = Math.atan2(gy - b.y, gx - b.x);
        if (ai.detourT > 0) { ai.detourT -= dt; ang = ai.detourA; }
        for (const off of STEER_OFFS) {
          const a = ang + off * ai.side;
          if (free(b.x + Math.cos(a) * 26, b.y + Math.sin(a) * 26, R - 2)) { ang = a; break; }
        }
        b.vx = Math.cos(ang);
        b.vy = Math.sin(ang);
      }

      function botUpdate(b, dt) {
        const ai = b.ai;
        ai.think -= dt;
        if (ai.think <= 0) botThink(b);
        ai.firing = false;
        let mvx = 0;
        let mvy = 0;
        let aimAt = null;
        const t = ai.target && ai.target.alive ? ai.target : null;
        if (ai.mode === 'fight' && t) {
          const d = U.dist(b.x, b.y, t.x, t.y);
          const slot = pickSlot(b, d);
          const G = slot >= 0 ? GUNS[b.slots[slot].type] : null;
          if (!G) emptySlot(b);
          const pref = G ? G.pref : 20;
          const lead = G ? L.lead * d / G.speed : 0;
          const visible = ai.los === 0 && clock - ai.seenT < 0.6;
          const ax = visible ? t.x + t.vx * SPEED * lead : ai.lx;
          const ay = visible ? t.y + t.vy * SPEED * lead : ai.ly;
          const off = turnAim(b, Math.atan2(ay - b.y, ax - b.x) + ai.err, dt);
          ai.strafeT -= dt;
          if (ai.strafeT <= 0) { ai.strafeT = U.rand(0.7, 1.8); ai.strafe = Math.random() < 0.5 ? -1 : 1; }
          // Out of sight, bots only know where they last saw their target.
          const kx = visible ? t.x : ai.lx;
          const ky = visible ? t.y : ai.ly;
          const kd = U.dist(b.x, b.y, kx, ky) || 1;
          const ux = (kx - b.x) / kd;
          const uy = (ky - b.y) / kd;
          const towards = !G ? (d > 34 ? 1 : 0) : d > pref + 60 ? 1 : d < pref - 60 ? -0.8 : 0;
          mvx = ux * towards - uy * ai.strafe * 0.8;
          mvy = uy * towards + ux * ai.strafe * 0.8;
          if (ai.react > 0) ai.react -= dt;
          else if (off < L.tol + (G && G.pellets > 1 ? 0.15 : 0)) {
            const inRange = G ? d < G.range * 0.95 : d < AXE.range + R;
            if (inRange && (ai.los === 0 || (ai.los === 1 && L.wallShoot))) ai.firing = true;
          }
          if (!G && d > 140) ai.mode = 'roam';
        } else if (ai.mode === 'item' && ai.item && ai.item.alive) {
          ai.itemT += dt;
          navigate(b, ai.item.x, ai.item.y, dt);
          mvx = b.vx; mvy = b.vy;
          if (U.dist(b.x, b.y, ai.item.x, ai.item.y) < 30) {
            pickup(b, ai.item);
            ai.item = null;
            ai.think = 0;
          } else if (ai.itemT > 9) {
            ai.ban.push(ai.item);
            ai.item = null;
            ai.think = 0;
          }
        } else if (ai.mode === 'wood' && ai.tree && ai.tree.alive) {
          const d = U.dist(b.x, b.y, ai.tree.x, ai.tree.y);
          const axe = emptySlot(b) >= 0;
          const reach = axe ? ai.tree.r + R + 12 : 170;
          if (d > reach) {
            navigate(b, ai.tree.x, ai.tree.y, dt);
            mvx = b.vx; mvy = b.vy;
          } else {
            const off = turnAim(b, Math.atan2(ai.tree.y - b.y, ai.tree.x - b.x), dt);
            if (off < 0.2) ai.firing = true;
          }
          if (b.wood >= 80) ai.think = 0;
        } else {
          navigate(b, ai.gx, ai.gy, dt);
          mvx = b.vx; mvy = b.vy;
          if (ai.mode === 'fight' || ai.mode === 'item' || ai.mode === 'wood') ai.think = 0;
        }
        // Under fire: face the shooter and throw up a wall.
        if (ai.wantWall) {
          const src = players[ai.hurtBy];
          if (!src || !src.alive || b.wood < WALL_COST || clock - ai.hurtT > 1.5) ai.wantWall = false;
          else {
            aimAt = Math.atan2(src.y - b.y, src.x - b.x);
            if (turnAim(b, aimAt, dt * 1.5) < 0.35) {
              placeWall(b);
              ai.wantWall = false;
              ai.strafe = -ai.strafe;
            }
          }
        } else if (ai.mode !== 'fight' && ai.mode !== 'wood') {
          if (clock - ai.hurtT < 1.2 && players[ai.hurtBy]) {
            const src = players[ai.hurtBy];
            turnAim(b, Math.atan2(src.y - b.y, src.x - b.x), dt);
          } else if (mvx || mvy) {
            turnAim(b, Math.atan2(mvy, mvx), dt * 0.6);
          }
        }
        // Reload when it is safe or necessary.
        const g = b.slots[b.cur];
        if (g && b.reload <= 0 && b.ammo > 0 && (g.mag === 0 || (ai.mode !== 'fight' && g.mag < GUNS[g.type].mag * 0.5))) startReload(b);
        if (ai.firing) tryFire(b);
        // Avoid walking into the storm unless chasing back to safety.
        if (ai.mode === 'fight' && inStorm(b.x + mvx * 40, b.y + mvy * 40) && !inStorm(b.x, b.y)) {
          mvx = (storm.x - b.x) / (U.dist(b.x, b.y, storm.x, storm.y) || 1);
          mvy = (storm.y - b.y) / (U.dist(b.x, b.y, storm.x, storm.y) || 1);
        }
        // Stuck detection: if we barely moved in a second, take a random detour.
        ai.stuckT += dt;
        if (ai.stuckT > 1) {
          if ((mvx || mvy) && U.dist(b.x, b.y, ai.sx, ai.sy) < 22) {
            ai.detourA = Math.random() * TAU;
            ai.detourT = 0.8;
            ai.side = -ai.side;
            if (ai.mode === 'item' && ai.item) ai.itemT += 3;
          }
          ai.stuckT = 0;
          ai.sx = b.x;
          ai.sy = b.y;
        }
        if (ai.detourT > 0 && ai.mode === 'fight') {
          ai.detourT -= dt;
          mvx = Math.cos(ai.detourA);
          mvy = Math.sin(ai.detourA);
        }
        return move(b, mvx, mvy, dt);
      }

      function move(p, mx, my, dt) {
        const m = Math.hypot(mx, my);
        if (m > 0.001) {
          p.vx = mx / m;
          p.vy = my / m;
        } else {
          p.vx = 0;
          p.vy = 0;
        }
        p.x += p.vx * SPEED * dt;
        p.y += p.vy * SPEED * dt;
        pushOut(p);
        pushOut(p);
      }

      /* ---------- Input ---------- */
      function humanUpdate(dt) {
        const k = api.keys;
        const mx = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
        const my = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
        const ax = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
        const ay = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
        if (ax || ay) {
          aimByKeys = true;
          me.aim = Math.atan2(ay, ax);
        } else if (!aimByKeys) {
          me.aim = Math.atan2(mouse.y + cam.y - me.y, mouse.x + cam.x - me.x);
        }
        move(me, mx, my, dt);
        if (mouse.down || k.has('Space')) tryFire(me);
      }

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || !me || !me.alive) return;
        if (e.code === 'KeyQ') placeWall(me);
        else if (e.code === 'KeyE') {
          const it = nearestItem(me, PICK_R, (x) => x.type === 'gun' || x.type === 'med') || nearestItem(me, PICK_R, null);
          if (it && !pickup(me, it) && it.type === 'med') api.setStatus('You are already at full health.');
        } else if (e.code === 'KeyR') startReload(me);
        else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') {
          const s = Number(e.code.slice(5)) - 1;
          if (s !== me.cur) { me.cur = s; me.reload = 0; api.sfx('tick'); }
        }
      });
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        if (Math.abs(p.x - mouse.x) + Math.abs(p.y - mouse.y) > 1) aimByKeys = false;
        mouse.x = p.x;
        mouse.y = p.y;
      });
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        mouse.x = p.x;
        mouse.y = p.y;
        aimByKeys = false;
        if (state !== 'play' || !me) return;
        me.aim = Math.atan2(mouse.y + cam.y - me.y, mouse.x + cam.x - me.x);
        if (e.button === 2) placeWall(me);
        else mouse.down = true;
      });
      api.on(canvas, 'pointerup', () => { mouse.down = false; });
      api.on(canvas, 'pointerleave', () => { mouse.down = false; });
      api.on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });

      /* ---------- Update ---------- */
      function updateBullets(dt) {
        for (let i = bn - 1; i >= 0; i--) {
          let travel = bsp[i] * dt;
          if (travel > brange[i]) travel = brange[i];
          brange[i] -= travel;
          const steps = Math.max(1, Math.ceil(travel / 10));
          const st = travel / steps;
          let dead = false;
          for (let s = 0; s < steps && !dead; s++) {
            bx[i] += bdx[i] * st;
            by[i] += bdy[i] * st;
            const x = bx[i];
            const y = by[i];
            if (x < 0 || y < 0 || x > WORLD || y > WORLD) { dead = true; break; }
            const arr = cellAt(x, y);
            for (let k = 0; k < arr.length; k++) {
              const o = arr[k];
              if (o.alive && hitsPoint(o, x, y, 2)) {
                damageObs(o, bdmg[i], players[bown[i]], false);
                dead = true;
                break;
              }
            }
            if (dead) break;
            for (let k = 0; k < players.length; k++) {
              const p = players[k];
              if (!p.alive || p.id === bown[i]) continue;
              const dx = p.x - x;
              const dy = p.y - y;
              if (dx * dx + dy * dy < (R + 2) * (R + 2)) {
                const g = players[bown[i]].slots[players[bown[i]].cur];
                hurtPlayer(p, bdmg[i], bown[i], g ? GUNS[g.type].name : '');
                dead = true;
                break;
              }
            }
          }
          if (dead || brange[i] <= 0) {
            if (dead) part(bx[i], by[i], 0, 0, 0.15, 5, '#FFE7A8');
            bn--;
            bx[i] = bx[bn]; by[i] = by[bn]; bdx[i] = bdx[bn]; bdy[i] = bdy[bn];
            bsp[i] = bsp[bn]; brange[i] = brange[bn]; bdmg[i] = bdmg[bn]; bown[i] = bown[bn];
          }
        }
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        hurtFx = Math.max(0, hurtFx - dt);
        goT = Math.max(0, goT - dt);
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          pl[i] -= dt;
          px[i] += pvx[i] * dt;
          py[i] += pvy[i] * dt;
          pvx[i] *= 0.93;
          pvy[i] *= 0.93;
        }
        for (let i = feed.length - 1; i >= 0; i--) {
          feed[i].t += dt;
          if (feed[i].t > 6) feed.splice(i, 1);
        }
        if (banner) {
          banner.t += dt;
          if (banner.t > 2) banner = null;
        }
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) { state = 'play'; goT = 0.8; api.sfx('blip'); }
          else if (Math.ceil(countT) !== prev) api.sfx('tick');
        } else if (state === 'play') {
          updateStorm(dt);
          for (const p of players) {
            if (!p.alive) continue;
            p.fireCd = Math.max(0, p.fireCd - dt);
            p.wallCd = Math.max(0, p.wallCd - dt);
            p.flash = Math.max(0, p.flash - dt);
            p.swing = Math.max(0, p.swing - dt);
            p.showHp = Math.max(0, p.showHp - dt);
            if (p.reload > 0) {
              p.reload -= dt;
              if (p.reload <= 0) { p.reload = 0; finishReload(p); }
            }
            if (p.human) humanUpdate(dt);
            else botUpdate(p, dt);
            // Walking over ammo and wood picks them up automatically.
            for (const it of items) {
              if (it.alive && (it.type === 'ammo' || it.type === 'wood') && Math.abs(it.x - p.x) < 24 && Math.abs(it.y - p.y) < 24) {
                if (it.type === 'ammo' && !p.slots.some((g) => g)) continue;
                pickup(p, it);
              }
            }
          }
          // Gentle player-player separation.
          for (let i = 0; i < players.length; i++) {
            const a = players[i];
            if (!a.alive) continue;
            for (let j = i + 1; j < players.length; j++) {
              const b = players[j];
              if (!b.alive) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy);
              if (d > 0.01 && d < R * 2) {
                const o = (R * 2 - d) / 2;
                a.x -= dx / d * o; a.y -= dy / d * o;
                b.x += dx / d * o; b.y += dy / d * o;
              }
            }
          }
          updateBullets(dt);
          const dps = stormDps();
          for (const p of players) {
            if (!p.alive || !inStorm(p.x, p.y)) continue;
            p.hp -= dps * dt;
            if (p.human) {
              hurtFx = Math.max(hurtFx, 0.3);
              hint('instorm', 'You are in the storm and losing health. Head for the safe circle.');
            }
            if (p.hp <= 0) eliminate(p, -1, 'storm');
            if (state !== 'play') break;
          }
          if (items.length > 260) items = items.filter((it) => it.alive);
          for (const o of built) o.flash = Math.max(0, o.flash - dt);
        } else if (state === 'over') {
          overT += dt;
          updateBullets(dt);
        }
        if (me) {
          const look = state === 'play' && me.alive ? 70 : 0;
          const tx = U.clamp(me.x + Math.cos(me.aim) * look - W / 2, -40, WORLD - W + 40);
          const ty = U.clamp(me.y + Math.sin(me.aim) * look - H / 2, -40, WORLD - H + 40);
          const k = Math.min(1, dt * 7);
          cam.x += (tx - cam.x) * k;
          cam.y += (ty - cam.y) * k;
        }
        for (const o of obstacles) if (o.flash > 0) o.flash = Math.max(0, o.flash - dt);
      }

      /* ---------- Drawing ---------- */
      function drawWorld() {
        ctx.fillStyle = '#090818';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, WORLD, WORLD);
        ctx.strokeStyle = U.alpha(C.line, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        const gx0 = Math.max(0, Math.floor(cam.x / 100) * 100);
        const gy0 = Math.max(0, Math.floor(cam.y / 100) * 100);
        for (let x = gx0; x < Math.min(WORLD, cam.x + W + 100); x += 100) { ctx.moveTo(x, Math.max(0, cam.y)); ctx.lineTo(x, Math.min(WORLD, cam.y + H)); }
        for (let y = gy0; y < Math.min(WORLD, cam.y + H + 100); y += 100) { ctx.moveTo(Math.max(0, cam.x), y); ctx.lineTo(Math.min(WORLD, cam.x + W), y); }
        ctx.stroke();
        for (const d of decor) {
          if (!onScreen(d.x, d.y, 10)) continue;
          ctx.fillStyle = d.k ? 'rgba(75,227,160,.07)' : 'rgba(155,123,255,.08)';
          ctx.fillRect(d.x, d.y, d.s, d.s);
        }
        ctx.strokeStyle = U.alpha(C.p2, 0.4);
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, WORLD, WORLD);
        for (const h of houses) {
          if (!onScreen(h.x + h.w / 2, h.y + h.h / 2, Math.max(h.w, h.h))) continue;
          ctx.fillStyle = C.panel;
          ctx.fillRect(h.x, h.y, h.w, h.h);
          ctx.fillStyle = U.alpha(C.panel2, 0.5);
          for (let y = h.y + 20; y < h.y + h.h; y += 28) ctx.fillRect(h.x + 14, y, h.w - 28, 2);
        }
        for (const it of items) {
          if (!it.alive || !onScreen(it.x, it.y, 30)) continue;
          drawItem(it);
        }
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0 || pc[i] !== '#FFE7A8') continue;
          ctx.globalAlpha = pl[i] / pm[i];
          ctx.fillStyle = pc[i];
          ctx.fillRect(px[i] - ps[i] / 2, py[i] - ps[i] / 2, ps[i], ps[i]);
        }
        ctx.globalAlpha = 1;
        for (const p of players) if (p.alive && onScreen(p.x, p.y, 40)) drawPlayer(p);
        ctx.strokeStyle = '#FFE7A8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < bn; i++) {
          ctx.moveTo(bx[i], by[i]);
          ctx.lineTo(bx[i] - bdx[i] * 14, by[i] - bdy[i] * 14);
        }
        ctx.stroke();
        const view = query(cam.x - 60, cam.y - 60, cam.x + W + 60, cam.y + H + 60);
        for (let i = 0; i < view.length; i++) {
          const o = view[i];
          if (o.kind !== 'tree') drawObstacle(o);
        }
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0 || pc[i] === '#FFE7A8') continue;
          ctx.globalAlpha = pl[i] / pm[i];
          ctx.fillStyle = pc[i];
          ctx.fillRect(px[i] - ps[i] / 2, py[i] - ps[i] / 2, ps[i], ps[i]);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < view.length; i++) if (view[i].kind === 'tree') drawObstacle(view[i]);
        for (const p of players) {
          if (!p.alive || p.human || !onScreen(p.x, p.y, 40)) continue;
          ctx.font = '600 11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = U.alpha(C.text, 0.75);
          ctx.fillText(p.name, p.x, p.y - R - 9);
          if (p.showHp > 0) {
            ctx.fillStyle = 'rgba(15,13,36,.7)';
            ctx.fillRect(p.x - 16, p.y - R - 7, 32, 4);
            ctx.fillStyle = p.hp > 40 ? C.mint : C.p1;
            ctx.fillRect(p.x - 16, p.y - R - 7, 32 * p.hp / MAX_HP, 4);
          }
        }
        drawStorm();
        ctx.restore();
      }

      function drawStorm() {
        ctx.fillStyle = U.alpha(C.violet, 0.24);
        ctx.beginPath();
        ctx.rect(cam.x - 50, cam.y - 50, W + 100, H + 100);
        if (storm.r > 0) ctx.arc(storm.x, storm.y, storm.r, 0, TAU, true);
        ctx.fill();
        if (storm.r > 0) {
          ctx.strokeStyle = U.alpha(C.violet, 0.9);
          ctx.lineWidth = 4;
          ctx.beginPath(); ctx.arc(storm.x, storm.y, storm.r, 0, TAU); ctx.stroke();
        }
        if (storm.phase < RADII.length - 1 && storm.tr > 0) {
          ctx.strokeStyle = U.alpha('#FFFFFF', 0.5);
          ctx.lineWidth = 2;
          ctx.setLineDash([14, 10]);
          ctx.beginPath(); ctx.arc(storm.tx, storm.ty, storm.tr, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      function drawItem(it) {
        const y = it.y + Math.sin(clock * 3 + it.bob) * 2;
        let col = C.text;
        let label = '';
        if (it.type === 'gun') { col = GUNS[it.gun].color; label = GUNS[it.gun].name; }
        else if (it.type === 'ammo') { col = C.gold; label = 'Ammo'; }
        else if (it.type === 'med') { col = C.mint; label = 'Medkit'; }
        else { col = WOOD; label = 'Wood'; }
        ctx.fillStyle = U.alpha(col, 0.16);
        ctx.beginPath(); ctx.arc(it.x, y, 15, 0, TAU); ctx.fill();
        ctx.fillStyle = col;
        if (it.type === 'gun') {
          ctx.fillRect(it.x - 10, y - 3, 20, 6);
          ctx.fillRect(it.x - 8, y + 2, 5, 6);
        } else if (it.type === 'med') {
          ctx.fillRect(it.x - 8, y - 2.5, 16, 5);
          ctx.fillRect(it.x - 2.5, y - 8, 5, 16);
        } else if (it.type === 'ammo') {
          ctx.fillRect(it.x - 7, y - 6, 14, 12);
          ctx.fillStyle = C.ink;
          ctx.fillRect(it.x - 4, y - 3, 8, 2);
        } else {
          ctx.fillRect(it.x - 9, y - 5, 18, 4);
          ctx.fillRect(it.x - 9, y + 1, 18, 4);
        }
        if (me && me.alive && U.dist(me.x, me.y, it.x, it.y) < 140) {
          ctx.font = '600 10px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = U.alpha(col, 0.85);
          ctx.fillText(label, it.x, y + 12);
        }
      }

      function drawObstacle(o) {
        const fl = o.flash > 0;
        if (o.kind === 'tree') {
          ctx.fillStyle = fl ? 'rgba(255,255,255,.35)' : 'rgba(75,227,160,.2)';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 1.7, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(75,227,160,.32)';
          ctx.beginPath(); ctx.arc(o.x - 4, o.y - 4, o.r * 1.1, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2F7A5C';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.55, 0, TAU); ctx.fill();
          if (o.hp < o.maxHp) {
            ctx.fillStyle = 'rgba(15,13,36,.6)';
            ctx.fillRect(o.x - 14, o.y + o.r + 4, 28, 3);
            ctx.fillStyle = C.mint;
            ctx.fillRect(o.x - 14, o.y + o.r + 4, 28 * o.hp / o.maxHp, 3);
          }
        } else if (o.kind === 'rock') {
          ctx.fillStyle = 'rgba(0,0,0,.3)';
          ctx.beginPath(); ctx.arc(o.x + 4, o.y + 5, o.r, 0, TAU); ctx.fill();
          ctx.fillStyle = fl ? '#7A74AE' : '#4A4580';
          ctx.beginPath(); ctx.arc(o.x, o.y, o.r, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          ctx.beginPath(); ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.5, 0, TAU); ctx.fill();
        } else if (o.kind === 'wall') {
          ctx.fillStyle = fl ? C.muted : C.line;
          ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          ctx.fillRect(o.x, o.y, o.w, 3);
        } else if (o.kind === 'crate') {
          ctx.fillStyle = fl ? '#FFFFFF' : WOOD;
          ctx.fillRect(o.x - 15, o.y - 15, 30, 30);
          ctx.strokeStyle = 'rgba(15,13,36,.55)';
          ctx.lineWidth = 2;
          ctx.strokeRect(o.x - 12, o.y - 12, 24, 24);
          ctx.beginPath(); ctx.moveTo(o.x - 12, o.y - 12); ctx.lineTo(o.x + 12, o.y + 12); ctx.stroke();
        } else if (o.kind === 'built') {
          const age = clock - o.born;
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,.35)';
          ctx.lineWidth = o.th;
          ctx.beginPath(); ctx.moveTo(o.x1 + 3, o.y1 + 4); ctx.lineTo(o.x2 + 3, o.y2 + 4); ctx.stroke();
          ctx.strokeStyle = fl ? '#FFFFFF' : WOOD;
          ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
          ctx.lineCap = 'butt';
          if (age < 0.25) {
            ctx.strokeStyle = U.alpha('#FFFFFF', 0.8 * (1 - age / 0.25));
            ctx.lineWidth = o.th + 6;
            ctx.beginPath(); ctx.moveTo(o.x1, o.y1); ctx.lineTo(o.x2, o.y2); ctx.stroke();
          }
          // Cracks appear as the wall weakens.
          const dmg = 1 - o.hp / o.maxHp;
          if (dmg > 0.3) {
            const cracks = dmg > 0.7 ? 3 : dmg > 0.5 ? 2 : 1;
            const ux = (o.x2 - o.x1) / WALL_LEN;
            const uy = (o.y2 - o.y1) / WALL_LEN;
            ctx.strokeStyle = 'rgba(15,13,36,.85)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            for (let c = 0; c < cracks; c++) {
              const t = (c + 1) / (cracks + 1) * WALL_LEN;
              const cx = o.x1 + ux * t;
              const cy = o.y1 + uy * t;
              ctx.moveTo(cx - uy * 6, cy + ux * 6);
              ctx.lineTo(cx + ux * 4, cy + uy * 4);
              ctx.lineTo(cx - ux * 2 + uy * 6, cy - uy * 2 - ux * 6);
            }
            ctx.stroke();
          }
        }
      }

      function drawPlayer(p) {
        const g = p.slots[p.cur];
        const ca = Math.cos(p.aim);
        const sa = Math.sin(p.aim);
        ctx.fillStyle = 'rgba(0,0,0,.3)';
        ctx.beginPath(); ctx.arc(p.x + 3, p.y + 4, R, 0, TAU); ctx.fill();
        if (g) {
          ctx.strokeStyle = GUNS[g.type].color;
          ctx.lineWidth = g.type === 'shotgun' ? 6 : 4;
          ctx.beginPath();
          ctx.moveTo(p.x + ca * 6, p.y + sa * 6);
          ctx.lineTo(p.x + ca * (R + GUNS[g.type].len), p.y + sa * (R + GUNS[g.type].len));
          ctx.stroke();
        } else {
          const sw = p.swing > 0 ? (p.swing / 0.2 - 0.5) * 1.6 : 0.6;
          const ha = p.aim + sw;
          ctx.strokeStyle = WOOD;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(ha) * 8, p.y + Math.sin(ha) * 8);
          ctx.lineTo(p.x + Math.cos(ha) * (R + 14), p.y + Math.sin(ha) * (R + 14));
          ctx.stroke();
          ctx.fillStyle = C.muted;
          ctx.fillRect(p.x + Math.cos(ha) * (R + 12) - 4, p.y + Math.sin(ha) * (R + 12) - 4, 8, 8);
        }
        ctx.fillStyle = p.flash > 0 ? '#FFFFFF' : p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(15,13,36,.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(15,13,36,.6)';
        ctx.beginPath();
        ctx.arc(p.x + ca * 6 - sa * 4, p.y + sa * 6 + ca * 4, 2.2, 0, TAU);
        ctx.arc(p.x + ca * 6 + sa * 4, p.y + sa * 6 - ca * 4, 2.2, 0, TAU);
        ctx.fill();
        if (p.human) {
          ctx.strokeStyle = U.alpha(C.p1, 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, R + 5, 0, TAU); ctx.stroke();
          if (p.wood >= WALL_COST) {
            // Ghost of where Q would drop a wall.
            const cx = p.x + ca * WALL_DIST;
            const cy = p.y + sa * WALL_DIST;
            ctx.strokeStyle = U.alpha(WOOD, 0.22);
            ctx.lineWidth = WALL_TH;
            ctx.beginPath();
            ctx.moveTo(cx + sa * WALL_LEN / 2, cy - ca * WALL_LEN / 2);
            ctx.lineTo(cx - sa * WALL_LEN / 2, cy + ca * WALL_LEN / 2);
            ctx.stroke();
          }
        }
      }

      function drawMinimap() {
        const S = 150;
        const mx = W - S - 14;
        const my = 14;
        const k = S / WORLD;
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        ctx.fillRect(mx - 4, my - 4, S + 8, S + 8);
        ctx.fillStyle = C.ink;
        ctx.fillRect(mx, my, S, S);
        ctx.fillStyle = C.panel2;
        for (const h of houses) ctx.fillRect(mx + h.x * k, my + h.y * k, Math.max(2, h.w * k), Math.max(2, h.h * k));
        ctx.save();
        ctx.beginPath();
        ctx.rect(mx, my, S, S);
        ctx.clip();
        ctx.fillStyle = U.alpha(C.violet, 0.4);
        ctx.beginPath();
        ctx.rect(mx, my, S, S);
        if (storm.r > 0) ctx.arc(mx + storm.x * k, my + storm.y * k, storm.r * k, 0, TAU, true);
        ctx.fill();
        if (storm.phase < RADII.length - 1 && storm.tr > 0) {
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(mx + storm.tx * k, my + storm.ty * k, Math.max(2, storm.tr * k), 0, TAU); ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = U.alpha(C.text, 0.6);
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + cam.x * k, my + cam.y * k, W * k, H * k);
        if (me) {
          ctx.fillStyle = me.alive ? C.p1 : C.muted;
          ctx.beginPath(); ctx.arc(mx + me.x * k, my + me.y * k, 3.5, 0, TAU); ctx.fill();
        }
      }

      function drawHud() {
        // Alive and kills.
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        U.roundRect(ctx, 14, 14, 168, 50, 10); ctx.fill();
        ctx.font = '800 22px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.text;
        ctx.fillText(alive + ' left', 26, 22);
        ctx.font = '600 12px ' + MONO;
        ctx.fillStyle = C.p1;
        ctx.fillText(me.kills + ' kill' + (me.kills === 1 ? '' : 's'), 26, 46);
        ctx.fillStyle = C.muted;
        ctx.fillText('phase ' + (storm.phase + 1), 110, 46);
        // Storm clock.
        let st;
        if (storm.phase >= RADII.length - 1) st = 'Final storm';
        else if (storm.shrinking) st = 'Storm closing ' + Math.ceil(PHASE_T - storm.t) + 's';
        else st = 'Storm moves in ' + Math.ceil(HOLD_T - storm.t) + 's';
        ctx.font = '600 15px ' + MONO;
        ctx.textAlign = 'center';
        const tw = ctx.measureText(st).width + 30;
        ctx.fillStyle = U.alpha(storm.shrinking ? C.violet : C.panel, 0.85);
        U.roundRect(ctx, W / 2 - tw / 2, 14, tw, 30, 10); ctx.fill();
        ctx.fillStyle = C.text;
        ctx.fillText(st, W / 2, 21);
        ctx.font = '600 11px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.fillText('storm ' + stormDps() + ' hp/s', W / 2, 49);
        // Kill feed.
        ctx.textAlign = 'left';
        ctx.font = '600 12px ' + MONO;
        feed.forEach((f, i) => {
          ctx.globalAlpha = Math.min(1, (6 - f.t) * 2);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, 16, 74 + i * 17);
        });
        ctx.globalAlpha = 1;
        // Leaderboard by eliminations.
        const ranked = players.slice().sort((a, b) => b.kills - a.kills || (b.alive - a.alive) || a.id - b.id);
        const rows = ranked.slice(0, 5);
        if (rows.indexOf(me) < 0) rows.push(me);
        const lx = W - 178;
        const ly = 180;
        ctx.fillStyle = U.alpha(C.panel, 0.8);
        U.roundRect(ctx, lx, ly, 164, 24 + rows.length * 17, 10); ctx.fill();
        ctx.font = '600 11px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('eliminations', lx + 10, ly + 7);
        rows.forEach((p, i) => {
          const y = ly + 24 + i * 17;
          if (p === me) {
            ctx.fillStyle = U.alpha(C.p1, 0.18);
            ctx.fillRect(lx + 4, y - 2, 156, 16);
          }
          ctx.fillStyle = p.alive ? p.color : U.alpha(C.muted, 0.5);
          ctx.fillRect(lx + 10, y + 3, 7, 7);
          ctx.fillStyle = p.alive ? C.text : U.alpha(C.text, 0.4);
          ctx.textAlign = 'left';
          ctx.fillText((ranked.indexOf(p) + 1) + '. ' + (p === me ? 'You' : p.name.slice(0, 13)), lx + 22, y);
          ctx.textAlign = 'right';
          ctx.fillText(String(p.kills), lx + 156, y);
        });
        // Health, wood, weapon slots.
        const hx = W / 2 - 150;
        const hy = H - 58;
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, hx - 10, hy - 10, 320, 54, 12); ctx.fill();
        ctx.fillStyle = 'rgba(15,13,36,.8)';
        ctx.fillRect(hx, hy, 200, 14);
        ctx.fillStyle = me.hp > 40 ? C.mint : C.p1;
        ctx.fillRect(hx, hy, 200 * Math.max(0, me.hp) / MAX_HP, 14);
        ctx.font = '600 11px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.ink;
        ctx.fillText(Math.ceil(Math.max(0, me.hp)) + ' hp', hx + 6, hy + 7.5);
        ctx.fillStyle = WOOD;
        ctx.font = '600 15px ' + MONO;
        ctx.fillText('wood ' + me.wood, hx + 210, hy + 7);
        ctx.font = '600 11px ' + MONO;
        ctx.fillStyle = me.wood >= WALL_COST ? C.text : C.muted;
        ctx.fillText('Q wall · ' + Math.floor(me.wood / WALL_COST), hx, hy + 28);
        const g = me.slots[me.cur];
        ctx.fillStyle = C.text;
        ctx.fillText(g ? (me.reload > 0 ? 'reloading…' : g.mag + ' / ' + me.ammo) : 'axe', hx + 130, hy + 28);
        for (let i = 0; i < 3; i++) {
          const sx = W / 2 + 180 + i * 62;
          const sg = me.slots[i];
          ctx.fillStyle = U.alpha(i === me.cur ? C.panel2 : C.panel, 0.9);
          U.roundRect(ctx, sx, hy - 10, 56, 54, 10); ctx.fill();
          if (i === me.cur) {
            ctx.strokeStyle = C.p2;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.textAlign = 'center';
          ctx.fillStyle = C.muted;
          ctx.font = '600 10px ' + MONO;
          ctx.fillText(String(i + 1), sx + 28, hy);
          ctx.font = '600 11px ' + MONO;
          ctx.fillStyle = sg ? GUNS[sg.type].color : U.alpha(C.text, 0.35);
          ctx.fillText(sg ? GUNS[sg.type].name : 'axe', sx + 28, hy + 18);
          if (sg) {
            ctx.fillStyle = U.alpha(C.text, 0.6);
            ctx.font = '600 10px ' + MONO;
            ctx.fillText(String(sg.mag), sx + 28, hy + 33);
          }
        }
        // Pickup prompt.
        if (me.alive) {
          const it = nearestItem(me, PICK_R, (x) => x.type === 'gun' || x.type === 'med');
          if (it) {
            const label = it.type === 'gun' ? GUNS[it.gun].name : 'medkit';
            ctx.font = '600 13px ' + MONO;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const sx = me.x - cam.x;
            const sy = me.y - cam.y + 38;
            const tw2 = ctx.measureText('E  pick up ' + label).width + 20;
            ctx.fillStyle = U.alpha(C.panel, 0.9);
            U.roundRect(ctx, sx - tw2 / 2, sy - 11, tw2, 22, 8); ctx.fill();
            ctx.fillStyle = C.text;
            ctx.fillText('E  pick up ' + label, sx, sy);
          }
        }
        // Crosshair.
        if (!aimByKeys && !api.isTouch) {
          ctx.strokeStyle = U.alpha(C.text, 0.8);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(mouse.x, mouse.y, 8, 0, TAU);
          ctx.moveTo(mouse.x - 13, mouse.y); ctx.lineTo(mouse.x - 4, mouse.y);
          ctx.moveTo(mouse.x + 4, mouse.y); ctx.lineTo(mouse.x + 13, mouse.y);
          ctx.moveTo(mouse.x, mouse.y - 13); ctx.lineTo(mouse.x, mouse.y - 4);
          ctx.moveTo(mouse.x, mouse.y + 4); ctx.lineTo(mouse.x, mouse.y + 13);
          ctx.stroke();
        }
      }

      function announce(text, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, H / 2 - 40);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,.7)';
        ctx.fillText(text, 3, 4);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function draw() {
        if (state === 'menu' || !me) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(0, 0, W, H);
          drawMenuBackdrop();
          return;
        }
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawWorld();
        ctx.restore();
        if (hurtFx > 0) {
          ctx.strokeStyle = U.alpha(C.p1, Math.min(0.5, hurtFx));
          ctx.lineWidth = 30;
          ctx.strokeRect(0, 0, W, H);
        }
        if (me.alive && inStorm(me.x, me.y)) {
          ctx.fillStyle = U.alpha(C.violet, 0.12 + 0.05 * Math.sin(clock * 6));
          ctx.fillRect(0, 0, W, H);
        }
        drawMinimap();
        drawHud();
        if (state === 'count') {
          announce(String(Math.ceil(countT)), C.p2, 1 + (countT % 1) * 0.4, 1);
        } else if (goT > 0) {
          announce('GO!', C.mint, 1 + (0.8 - goT) * 0.5, Math.min(1, goT * 2));
        } else if (banner) {
          announce(banner.text, banner.color, 0.55, Math.min(1, (2 - banner.t) * 2));
        }
        if (state === 'over') {
          announce(me.alive ? 'Last one standing!' : '#' + me.place, me.alive ? C.gold : C.p1, 0.9, Math.min(1, overT * 2));
        }
      }

      function drawMenuBackdrop() {
        const t = clock;
        ctx.fillStyle = U.alpha(C.violet, 0.2);
        ctx.beginPath();
        ctx.rect(0, 0, W, H);
        ctx.arc(W / 2, H / 2, 260 + Math.sin(t) * 10, 0, TAU, true);
        ctx.fill();
        ctx.strokeStyle = U.alpha(C.violet, 0.8);
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(W / 2, H / 2, 260 + Math.sin(t) * 10, 0, TAU); ctx.stroke();
      }

      showStartMenu();
      api.loop((dt) => {
        if (state === 'menu') clock += dt;
        else update(dt);
        draw();
      });
    }
  });
})();
