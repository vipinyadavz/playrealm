/* Tanks — top-down tank duel in a maze whose gold and violet walls trade places. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const COLS = 9;
  const ROWS = 5;
  const CELL = 96;
  const OX = (W - COLS * CELL) / 2;
  const OY = 46;
  const WR = 4;            // wall half-thickness: walls are capsules
  const TR = 15;           // tank radius
  const SR = 4;            // shell radius
  const PHASE = 6;         // seconds between phase-wall swaps
  const WARN = 1;          // warning time before a swap
  const WIN = 5;
  const SHELL_SPEED = 250;
  const SHELL_LIFE = 6;
  const MAX_SHELLS = 5;
  const FIRE_CD = 0.25;
  const ARM = 0.15;
  const DRIVE = 125;
  const REVERSE = 85;
  const TURN = 3.3;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const KEYS = [
    { fwd: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD' },
    { fwd: 'ArrowUp', back: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  ];
  const DIFF = {
    easy: { think: 0.55, err: 0.14, bounces: 0, angles: 16, dodge: 0.12, react: 0.55, speed: 0.85, lead: 0, lookAhead: false },
    normal: { think: 0.32, err: 0.06, bounces: 1, angles: 32, dodge: 0.4, react: 0.3, speed: 1, lead: 0.5, lookAhead: true },
    hard: { think: 0.16, err: 0.015, bounces: 2, angles: 56, dodge: 0.85, react: 0.08, speed: 1, lead: 1, lookAhead: true }
  };
  const POWERS = ['triple', 'fast', 'shield'];
  const POWER_NAMES = { triple: 'triple spread (3 shots)', fast: 'fast shells (8 s)', shield: 'a one-hit shield' };
  const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const CP = { x: 0, y: 0 }; // scratch: closest point on a wall

  function cellX(c) { return OX + c * CELL + CELL / 2; }
  function cellY(r) { return OY + r * CELL + CELL / 2; }
  function setColor(kind) { return kind === 1 ? C.gold : C.violet; }
  function angDiff(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  /* Closest point on wall segment to (px, py), written into CP. */
  function closestTo(w, px, py) {
    const dx = w.x2 - w.x1;
    const dy = w.y2 - w.y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - w.x1) * dx + (py - w.y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    CP.x = w.x1 + dx * t;
    CP.y = w.y1 + dy * t;
  }

  function drawTank(ctx, x, y, a, color, recoil, tread) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.fillStyle = C.ink;
    U.roundRect(ctx, -15, -14, 30, 8, 3);
    ctx.fill();
    U.roundRect(ctx, -15, 6, 30, 8, 3);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.muted, 0.55);
    const off = ((tread % 6) + 6) % 6;
    for (let i = -15 + off; i < 15; i += 6) {
      ctx.fillRect(i, -13, 2, 6);
      ctx.fillRect(i, 7, 2, 6);
    }
    ctx.fillStyle = color;
    U.roundRect(ctx, -12, -9, 24, 18, 5);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.ink, 0.25);
    U.roundRect(ctx, -12, 2, 24, 7, 4);
    ctx.fill();
    const back = recoil * 3;
    ctx.fillStyle = C.ink;
    ctx.fillRect(2 - back, -3.5, 19, 7);
    ctx.fillStyle = color;
    ctx.fillRect(3 - back, -2.5, 17, 5);
    ctx.beginPath();
    ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
    ctx.fillStyle = C.ink;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, 0.45);
    ctx.beginPath();
    ctx.arc(-1.5, -1.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  Arcade.register({
    id: 'tanks',
    title: 'Tanks',
    mode: 'together',
    players: '1–2P',
    color: C.gold,
    tagline: 'Bounce shells around a maze and outsmart the other tank.',
    hook: 'Shifting maze: gold and violet walls trade places every 6 seconds.',
    tags: ['versus', 'shooter', 'maze', 'keyboard', 'computer opponent'],
    howTo: 'Drive your tank through a new maze each round and hit the other tank with a shell. ' +
      'Shells bounce off walls, so you can shoot around corners, but your own shells can hit you too. ' +
      'Gold and violet walls take turns: only one color is solid, the other is a dashed ghost you can drive and shoot through. ' +
      'They swap every 6 seconds, and the incoming color flickers for a second first. Grab crates for a spread shot, fast shells or a shield. First to 5 wins.',
    controls: [
      { keys: ['W', 'S'], label: 'Coral: drive' },
      { keys: ['A', 'D'], label: 'Coral: turn' },
      { keys: ['Space'], label: 'Coral: fire' },
      { keys: ['↑', '↓'], label: 'Cyan: drive' },
      { keys: ['←', '→'], label: 'Cyan: turn' },
      { keys: ['Enter'], label: 'Cyan: fire' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      const ox = 16;
      const oy = 10;
      const s = 36;
      ctx.fillStyle = U.alpha(C.line, 0.5);
      for (let c = 0; c < 8; c++) {
        for (let r = 0; r < 5; r++) ctx.fillRect(ox + c * s + s / 2 - 1, oy + r * s + s / 2 - 1, 2, 2);
      }
      const segs = [
        [0, 0, 8, 0, 0], [0, 5, 8, 5, 0], [0, 0, 0, 5, 0], [8, 0, 8, 5, 0],
        [1, 1, 1, 3, 0], [1, 1, 3, 1, 0], [5, 3, 8, 3, 0], [3, 4, 5, 4, 0], [2, 4, 2, 5, 0],
        [4, 1, 4, 3, 2], [6, 3, 6, 5, 2],
        [5, 1, 5, 2, 1], [2, 2, 3, 2, 1], [7, 1, 8, 1, 1]
      ];
      const P = (v, o) => o + v * s;
      ctx.lineCap = 'round';
      const blink = Math.sin(t * 8) > 0;
      segs.forEach((g) => {
        ctx.beginPath();
        ctx.moveTo(P(g[0], ox), P(g[1], oy));
        ctx.lineTo(P(g[2], ox), P(g[3], oy));
        if (g[4] === 0) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 6;
          ctx.stroke();
        } else if (g[4] === 1) {
          ctx.strokeStyle = U.alpha(C.gold, 0.2);
          ctx.lineWidth = 13;
          ctx.stroke();
          ctx.strokeStyle = C.gold;
          ctx.lineWidth = 6;
          ctx.stroke();
        } else {
          ctx.setLineDash([5, 5]);
          ctx.lineDashOffset = -t * 12;
          ctx.strokeStyle = U.alpha(C.violet, t > 0 && blink ? 0.85 : 0.55);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
      // A shell path that bounces off the top wall and slips through a violet ghost wall.
      const pts = [[P(1.5, ox) + 14, P(4, oy) - 13], [P(5.05, ox), P(0.15, oy)], [P(6.75, ox), P(1.8, oy)]];
      ctx.setLineDash([3, 6]);
      ctx.strokeStyle = U.alpha(C.p1, 0.6);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      ctx.lineTo(pts[1][0], pts[1][1]);
      ctx.lineTo(pts[2][0], pts[2][1]);
      ctx.stroke();
      ctx.setLineDash([]);
      const l1 = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]);
      const l2 = Math.hypot(pts[2][0] - pts[1][0], pts[2][1] - pts[1][1]);
      const u = ((0.42 + t * 0.35) % 1) * (l1 + l2);
      const seg = u < l1 ? 0 : 1;
      const f = seg === 0 ? u / l1 : (u - l1) / l2;
      const sx = U.lerp(pts[seg][0], pts[seg + 1][0], f);
      const sy = U.lerp(pts[seg][1], pts[seg + 1][1], f);
      ctx.fillStyle = U.alpha(C.p1, 0.3);
      ctx.beginPath();
      ctx.arc(sx, sy, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
      ctx.fill();
      drawTank(ctx, P(1.5, ox), P(4, oy), -0.83, C.p1, 0, t * 20);
      drawTank(ctx, P(7, ox) + 2, P(2, oy) + 2, 2.6, C.p2, 0, 0);
      // Phase timer ring in the corner.
      const cx = 296;
      const cy = 186;
      ctx.lineWidth = 3;
      ctx.strokeStyle = C.line;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = C.gold;
      ctx.beginPath();
      ctx.arc(cx, cy, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (0.7 + 0.3 * ((t * 0.2) % 1)));
      ctx.stroke();
      ctx.fillStyle = C.violet;
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'end' | 'between' | 'over'
      let vsCpu = false;
      let diff = 'normal';
      let score = [0, 0];
      let round = 0;
      let walls = [];
      let near = [];
      let vWall = [];
      let hWall = [];
      let active = 1; // which phase set is solid: 1 gold, 2 violet
      let phaseT = 0;
      let warned = false;
      let explained = false;
      let tanks = [];
      let shells = [];
      let parts = [];
      let crate = null;
      let crateT = 0;
      let crateLeft = 0;
      let timer = 0;
      let banner = null;
      let goT = 0;
      let shake = 0;
      let flash = 0;
      let flashColor = C.text;
      let swapFlash = 0;
      let clock = 0;
      let bounceSfx = 0;
      let ai = null;

      const names = () => (vsCpu ? ['You', 'Computer'] : ['Coral', 'Cyan']);
      const solid = (w, set) => w.kind === 0 || w.kind === set;
      const live = () => state === 'play' || state === 'end';

      /* ---------- Maze ---------- */
      function buildMaze() {
        const vOpen = [];
        const hOpen = [];
        const seen = [];
        for (let r = 0; r < ROWS; r++) {
          vOpen.push(new Array(COLS - 1).fill(false));
          if (r < ROWS - 1) hOpen.push(new Array(COLS).fill(false));
          seen.push(new Array(COLS).fill(false));
        }
        const open = (c, r, dc, dr) => {
          if (dc === 1) vOpen[r][c] = true;
          else if (dc === -1) vOpen[r][c - 1] = true;
          else if (dr === 1) hOpen[r][c] = true;
          else hOpen[r - 1][c] = true;
        };
        // Randomized depth-first search carves a perfect maze.
        const stack = [{ c: U.randInt(0, COLS - 1), r: U.randInt(0, ROWS - 1) }];
        seen[stack[0].r][stack[0].c] = true;
        while (stack.length) {
          const cur = stack[stack.length - 1];
          const opts = DIRS4.filter(([dc, dr]) => {
            const nc = cur.c + dc;
            const nr = cur.r + dr;
            return nc >= 0 && nr >= 0 && nc < COLS && nr < ROWS && !seen[nr][nc];
          });
          if (!opts.length) {
            stack.pop();
            continue;
          }
          const [dc, dr] = U.pick(opts);
          open(cur.c, cur.r, dc, dr);
          seen[cur.r + dr][cur.c + dc] = true;
          stack.push({ c: cur.c + dc, r: cur.r + dr });
        }
        // Knock out some extra walls so there are loops to flank through.
        const closed = [];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS - 1; c++) if (!vOpen[r][c]) closed.push({ v: true, c, r });
        }
        for (let r = 0; r < ROWS - 1; r++) {
          for (let c = 0; c < COLS; c++) if (!hOpen[r][c]) closed.push({ v: false, c, r });
        }
        U.shuffle(closed);
        const extra = Math.round(closed.length * 0.22);
        const remain = closed.slice(extra);
        // About a third of the remaining walls become phase walls, split into gold and violet.
        const phaseCount = Math.max(4, Math.round(remain.length / 3));
        walls = [];
        vWall = [];
        hWall = [];
        for (let r = 0; r < ROWS; r++) vWall.push(new Array(COLS - 1).fill(null));
        for (let r = 0; r < ROWS - 1; r++) hWall.push(new Array(COLS).fill(null));
        remain.forEach((e, i) => {
          const kind = i < phaseCount ? (i % 2) + 1 : 0;
          let w;
          if (e.v) {
            const x = OX + (e.c + 1) * CELL;
            w = { x1: x, y1: OY + e.r * CELL, x2: x, y2: OY + (e.r + 1) * CELL, kind };
            vWall[e.r][e.c] = w;
          } else {
            const y = OY + (e.r + 1) * CELL;
            w = { x1: OX + e.c * CELL, y1: y, x2: OX + (e.c + 1) * CELL, y2: y, kind };
            hWall[e.r][e.c] = w;
          }
          walls.push(w);
        });
        const x0 = OX;
        const y0 = OY;
        const x1 = OX + COLS * CELL;
        const y1 = OY + ROWS * CELL;
        walls.push({ x1: x0, y1: y0, x2: x1, y2: y0, kind: 0 }, { x1: x0, y1: y1, x2: x1, y2: y1, kind: 0 },
          { x1: x0, y1: y0, x2: x0, y2: y1, kind: 0 }, { x1: x1, y1: y0, x2: x1, y2: y1, kind: 0 });
        // Per-cell lists of walls close enough to matter for collisions.
        near = [];
        const m = 26;
        for (let r = 0; r < ROWS; r++) {
          const row = [];
          for (let c = 0; c < COLS; c++) {
            const ax = OX + c * CELL - m;
            const ay = OY + r * CELL - m;
            const bx = ax + CELL + m * 2;
            const by = ay + CELL + m * 2;
            row.push(walls.filter((w) => Math.min(w.x1, w.x2) <= bx && Math.max(w.x1, w.x2) >= ax &&
              Math.min(w.y1, w.y2) <= by && Math.max(w.y1, w.y2) >= ay));
          }
          near.push(row);
        }
      }

      function cellOf(x, y) {
        return {
          c: U.clamp(Math.floor((x - OX) / CELL), 0, COLS - 1),
          r: U.clamp(Math.floor((y - OY) / CELL), 0, ROWS - 1)
        };
      }
      function nearAt(x, y) {
        const k = cellOf(x, y);
        return near[k.r][k.c];
      }
      function overlapsSolid(x, y, rad, set) {
        for (const w of nearAt(x, y)) {
          if (!solid(w, set)) continue;
          closestTo(w, x, y);
          if (Math.hypot(x - CP.x, y - CP.y) < rad) return true;
        }
        return false;
      }
      function clampArena(o, rad) {
        o.x = U.clamp(o.x, OX + WR + rad, OX + COLS * CELL - WR - rad);
        o.y = U.clamp(o.y, OY + WR + rad, OY + ROWS * CELL - WR - rad);
      }

      /* ---------- Tanks ---------- */
      function makeTank(id, c, r) {
        return {
          id, x: cellX(c), y: cellY(r), vx: 0, vy: 0, a: id === 0 ? 0 : Math.PI, alive: true,
          cd: 0, recoil: 0, tread: 0, shield: false, power: null,
          color: id === 0 ? C.p1 : C.p2
        };
      }

      function pushOutTank(tk) {
        const R = TR + WR;
        for (let iter = 0; iter < 4; iter++) {
          let moved = false;
          for (const w of nearAt(tk.x, tk.y)) {
            if (!solid(w, active)) continue;
            closestTo(w, tk.x, tk.y);
            let nx = tk.x - CP.x;
            let ny = tk.y - CP.y;
            const d = Math.hypot(nx, ny);
            if (d >= R) continue;
            if (d < 0.001) {
              // Dead centre on the wall: push toward the middle of the tank's own cell.
              const k = cellOf(tk.x, tk.y);
              nx = cellX(k.c) - tk.x;
              ny = cellY(k.r) - tk.y;
              const n = Math.hypot(nx, ny) || 1;
              nx /= n;
              ny /= n;
            } else {
              nx /= d;
              ny /= d;
            }
            tk.x = CP.x + nx * R;
            tk.y = CP.y + ny * R;
            moved = true;
          }
          if (!moved) break;
        }
        clampArena(tk, TR);
      }

      function unstick(tk) {
        pushOutTank(tk);
        if (overlapsSolid(tk.x, tk.y, TR + WR - 0.5, active)) {
          const k = cellOf(tk.x, tk.y);
          tk.x = cellX(k.c);
          tk.y = cellY(k.r);
        }
      }

      function driveTank(tk, fwd, turn, dt, mul) {
        const x0 = tk.x;
        const y0 = tk.y;
        tk.a += turn * TURN * dt;
        const sp = (fwd > 0 ? DRIVE : REVERSE) * (mul || 1);
        const dist = fwd * sp * dt;
        const steps = Math.max(1, Math.ceil(Math.abs(dist) / 3));
        const cx = Math.cos(tk.a) * dist / steps;
        const cy = Math.sin(tk.a) * dist / steps;
        for (let i = 0; i < steps; i++) {
          tk.x += cx;
          tk.y += cy;
          pushOutTank(tk);
        }
        tk.tread += dist + Math.abs(turn) * dt * 20;
        tk.vx = dt > 0 ? (tk.x - x0) / dt : 0;
        tk.vy = dt > 0 ? (tk.y - y0) / dt : 0;
      }

      function shellSpeed(tk) {
        return tk.power && tk.power.type === 'fast' ? SHELL_SPEED * 1.55 : SHELL_SPEED;
      }

      function fire(tk) {
        if (!tk || !tk.alive || tk.cd > 0 || !live()) return false;
        let mine = 0;
        for (const s of shells) if (s.owner === tk.id && !s.dead) mine++;
        if (mine >= MAX_SHELLS) return false;
        tk.cd = FIRE_CD;
        tk.recoil = 1;
        const spread = tk.power && tk.power.type === 'triple';
        const room = MAX_SHELLS - mine;
        const angs = !spread || room === 1 ? [0] : room === 2 ? [-0.12, 0.12] : [-0.2, 0, 0.2];
        const sp = shellSpeed(tk);
        angs.forEach((da) => {
          const a = tk.a + da;
          const s = { owner: tk.id, x: tk.x, y: tk.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            age: 0, life: SHELL_LIFE, trail: [], dead: false, color: tk.color };
          // Leave the barrel with full wall collision, so a shell never starts on the far side of a wall.
          moveShell(s, TR + 6, false);
          shells.push(s);
        });
        if (spread) {
          tk.power.shots--;
          if (tk.power.shots <= 0) tk.power = null;
        }
        const mx = tk.x + Math.cos(tk.a) * (TR + 6);
        const my = tk.y + Math.sin(tk.a) * (TR + 6);
        burst(mx, my, C.gold, 5, 90, 0.18, 2.5);
        api.sfx('shoot');
        return true;
      }

      function moveShell(s, dist, hitTanks) {
        const sp = Math.hypot(s.vx, s.vy) || 1;
        const steps = Math.max(1, Math.ceil(dist / 3));
        const k = dist / steps / sp;
        for (let i = 0; i < steps && !s.dead; i++) {
          s.x += s.vx * k;
          s.y += s.vy * k;
          bounceShell(s);
          if (hitTanks) checkShellHits(s);
        }
      }

      function bounceShell(s) {
        const R = SR + WR;
        for (const w of nearAt(s.x, s.y)) {
          if (!solid(w, active)) continue;
          closestTo(w, s.x, s.y);
          let nx = s.x - CP.x;
          let ny = s.y - CP.y;
          const d = Math.hypot(nx, ny);
          if (d >= R) continue;
          if (d < 1e-4) {
            const sp = Math.hypot(s.vx, s.vy) || 1;
            nx = -s.vx / sp;
            ny = -s.vy / sp;
          } else {
            nx /= d;
            ny /= d;
          }
          const vn = s.vx * nx + s.vy * ny;
          if (vn < 0) {
            s.vx -= 2 * vn * nx;
            s.vy -= 2 * vn * ny;
            burst(CP.x + nx * WR, CP.y + ny * WR, w.kind ? setColor(w.kind) : C.muted, 3, 70, 0.2, 2);
            if (bounceSfx <= 0) {
              api.sfx('tick');
              bounceSfx = 0.08;
            }
          }
          s.x = CP.x + nx * R;
          s.y = CP.y + ny * R;
        }
        clampArena(s, SR);
      }

      function checkShellHits(s) {
        for (const tk of tanks) {
          if (!tk.alive || (s.owner === tk.id && s.age < ARM)) continue;
          const dx = s.x - tk.x;
          const dy = s.y - tk.y;
          if (dx * dx + dy * dy >= (TR + SR - 1) * (TR + SR - 1)) continue;
          s.dead = true;
          if (tk.shield) {
            tk.shield = false;
            burst(tk.x, tk.y, C.mint, 18, 160, 0.4, 3);
            shake = Math.max(shake, 4);
            api.sfx('hit');
          } else {
            killTank(tk, s);
          }
          return;
        }
      }

      function killTank(tk, s) {
        tk.alive = false;
        burst(tk.x, tk.y, tk.color, 34, 260, 0.8, 4);
        burst(tk.x, tk.y, C.gold, 18, 180, 0.5, 3);
        burst(tk.x, tk.y, C.muted, 14, 90, 1.1, 5);
        shake = Math.max(shake, 11);
        flash = 0.6;
        flashColor = tk.color;
        api.sfx('boom');
        if (s.owner === tk.id) {
          api.setStatus(vsCpu ? (tk.id === 0 ? 'You were hit by your own shell.' : 'The computer was hit by its own shell.')
            : names()[tk.id] + ' was hit by its own shell.');
        }
        if (state === 'play') {
          state = 'end';
          timer = 1.5;
        }
      }

      /* ---------- Phase walls ---------- */
      function swapPhase() {
        active = 3 - active;
        warned = false;
        swapFlash = 1;
        shake = Math.max(shake, 3);
        api.sfx('flip');
        tanks.forEach((tk) => { if (tk.alive) unstick(tk); });
        shells.forEach((s) => {
          if (s.dead) return;
          for (const w of nearAt(s.x, s.y)) {
            if (w.kind !== active) continue;
            closestTo(w, s.x, s.y);
            if (Math.hypot(s.x - CP.x, s.y - CP.y) < SR + WR) {
              s.dead = true;
              burst(s.x, s.y, setColor(active), 6, 80, 0.25, 2);
              break;
            }
          }
        });
      }

      /* ---------- Particles ---------- */
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n && parts.length < 600; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.25, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: life * U.rand(0.6, 1), max: life, color, size: size * U.rand(0.6, 1.2) });
        }
      }
      function updateParts(dt) {
        const drag = Math.max(0, 1 - dt * 4);
        for (const p of parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= drag;
          p.vy *= drag;
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0);
      }

      /* ---------- Computer opponent ---------- */
      function passable(c, r, dc, dr, set) {
        let w;
        if (dc === 1) w = vWall[r][c];
        else if (dc === -1) w = vWall[r][c - 1];
        else if (dr === 1) w = hWall[r][c];
        else w = hWall[r - 1][c];
        return !w || !solid(w, set);
      }

      function bfs(from, to, set) {
        const prev = new Array(COLS * ROWS).fill(-1);
        const start = from.r * COLS + from.c;
        const goal = to.r * COLS + to.c;
        prev[start] = start;
        const q = [start];
        for (let qi = 0; qi < q.length; qi++) {
          const i = q[qi];
          if (i === goal) break;
          const c = i % COLS;
          const r = (i - c) / COLS;
          for (const [dc, dr] of DIRS4) {
            const nc = c + dc;
            const nr = r + dr;
            if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
            const j = nr * COLS + nc;
            if (prev[j] !== -1 || !passable(c, r, dc, dr, set)) continue;
            prev[j] = i;
            q.push(j);
          }
        }
        if (prev[goal] === -1) return null;
        const path = [];
        for (let i = goal; ; i = prev[i]) {
          path.unshift({ c: i % COLS, r: Math.floor(i / COLS) });
          if (i === start || path.length > COLS * ROWS) break;
        }
        return path;
      }

      function clearLine(x0, y0, x1, y1, rad, set) {
        const len = Math.hypot(x1 - x0, y1 - y0);
        const n = Math.max(1, Math.ceil(len / 8));
        for (let i = 1; i <= n; i++) {
          if (overlapsSolid(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, rad, set)) return false;
        }
        return true;
      }

      /* Simulates a shell fired at angle ang; true if it reaches the foe within maxB bounces
         without coming back to the shooter. Accounts for the next phase swap mid-flight and,
         with lead > 0, for where the foe will be by then. */
      function traceShot(tk, foe, ang, speed, maxB, swapIn, lead) {
        let x = tk.x;
        let y = tk.y;
        let vx = Math.cos(ang);
        let vy = Math.sin(ang);
        let set = active;
        let b = 0;
        const R = SR + WR;
        const hitR = (TR + SR - 2) * (TR + SR - 2);
        const selfR = (TR + SR + 3) * (TR + SR + 3);
        for (let d = 0; d < 1100; d += 5) {
          x += vx * 5;
          y += vy * 5;
          if (d / speed > swapIn) set = 3 - active;
          for (const w of nearAt(x, y)) {
            if (!solid(w, set)) continue;
            closestTo(w, x, y);
            let nx = x - CP.x;
            let ny = y - CP.y;
            const dd = Math.hypot(nx, ny);
            if (dd >= R) continue;
            if (dd < 1e-4) return false;
            nx /= dd;
            ny /= dd;
            const vn = vx * nx + vy * ny;
            if (vn < 0) {
              vx -= 2 * vn * nx;
              vy -= 2 * vn * ny;
              if (++b > maxB) return false;
            }
            x = CP.x + nx * R;
            y = CP.y + ny * R;
          }
          const ft = Math.min(1.2, d / speed) * lead;
          const fx = foe.x + foe.vx * ft;
          const fy = foe.y + foe.vy * ft;
          if ((x - fx) * (x - fx) + (y - fy) * (y - fy) < hitR) return true;
          if (d > 40 && (x - tk.x) * (x - tk.x) + (y - tk.y) * (y - tk.y) < selfR) return false;
        }
        return false;
      }

      function findShot(tk, foe, D) {
        const speed = shellSpeed(tk);
        const swapIn = PHASE - phaseT;
        const cands = [Math.atan2(foe.y - tk.y, foe.x - tk.x)];
        if (D.lead > 0) {
          const ft = Math.min(1.2, U.dist(tk.x, tk.y, foe.x, foe.y) / speed) * D.lead;
          cands.push(Math.atan2(foe.y + foe.vy * ft - tk.y, foe.x + foe.vx * ft - tk.x));
        }
        for (let i = 0; i < D.angles; i++) cands.push(tk.a + (i / D.angles) * Math.PI * 2);
        if (D.bounces > 0) for (let k = -6; k <= 6; k++) cands.push(tk.a + k * 0.035);
        let best = null;
        let bestD = Infinity;
        for (const a of cands) {
          const d = Math.abs(angDiff(a, tk.a));
          if (d >= bestD) continue;
          if (traceShot(tk, foe, a, speed, D.bounces, swapIn, D.lead)) {
            bestD = d;
            best = a;
          }
        }
        return best;
      }

      function findThreat(tk) {
        const fx = Math.cos(tk.a);
        const fy = Math.sin(tk.a);
        for (const s of shells) {
          if (s.dead || (s.owner === tk.id && s.age < ARM)) continue;
          const rx = s.x - tk.x;
          const ry = s.y - tk.y;
          const v2 = s.vx * s.vx + s.vy * s.vy;
          const tc = -(rx * s.vx + ry * s.vy) / v2;
          if (tc < 0 || tc > 0.8) continue;
          const mx = rx + s.vx * tc;
          const my = ry + s.vy * tc;
          if (mx * mx + my * my > (TR + 14) * (TR + 14)) continue;
          // Moving along our heading only helps if the shell crosses it.
          const cross = Math.abs((s.vx * fy - s.vy * fx) / Math.sqrt(v2));
          if (cross < 0.35) continue;
          return fx * mx + fy * my > 0 ? -1 : 1;
        }
        return 0;
      }

      function newAi() {
        return { think: 0, shot: null, react: 0.6, tx: 0, ty: 0, dodgeT: 0, dodgeDir: 0,
          backT: 0, backTurn: 1, checkT: 0.6, lx: 0, ly: 0, wantMove: false };
      }

      function planRoute(tk, foe, D) {
        // Smarter computers plan with the walls that are about to become solid.
        const set = D.lookAhead && phaseT > PHASE - WARN - 0.5 ? 3 - active : active;
        const from = cellOf(tk.x, tk.y);
        const goal = foe.alive ? cellOf(foe.x, foe.y) : from;
        const path = bfs(from, goal, set);
        let tx = cellX(from.c);
        let ty = cellY(from.r);
        if (path && path.length > 1) {
          tx = cellX(path[1].c);
          ty = cellY(path[1].r);
          // Cut back to our own cell centre first if a wall corner is in the way.
          if (!clearLine(tk.x, tk.y, tx, ty, TR + WR - 2, active)) {
            tx = cellX(from.c);
            ty = cellY(from.r);
          }
        } else if (foe.alive) {
          tx = foe.x;
          ty = foe.y;
        }
        ai.tx = tx;
        ai.ty = ty;
      }

      function cpuControl(tk, foe, dt) {
        const D = DIFF[diff];
        const out = { fwd: 0, turn: 0, fire: false };
        ai.think -= dt;
        ai.react -= dt;
        ai.dodgeT -= dt;
        ai.backT -= dt;
        if (ai.think <= 0) {
          ai.think = D.think * U.rand(0.8, 1.25);
          const had = ai.shot !== null;
          let mine = 0;
          for (const s of shells) if (s.owner === tk.id && !s.dead) mine++;
          ai.shot = foe.alive && mine < MAX_SHELLS ? findShot(tk, foe, D) : null;
          if (ai.shot !== null) {
            ai.shot += U.rand(-D.err, D.err);
            if (!had) ai.react = Math.max(ai.react, D.react);
          }
          planRoute(tk, foe, D);
          if (ai.dodgeT <= 0) {
            const dir = findThreat(tk);
            if (dir && Math.random() < D.dodge) {
              ai.dodgeT = 0.4;
              ai.dodgeDir = dir;
            }
          }
        }
        ai.checkT -= dt;
        if (ai.checkT <= 0) {
          ai.checkT = 0.6;
          if (ai.wantMove && U.dist(tk.x, tk.y, ai.lx, ai.ly) < 8) {
            ai.backT = 0.45;
            ai.backTurn = Math.random() < 0.5 ? -1 : 1;
          }
          ai.lx = tk.x;
          ai.ly = tk.y;
          ai.wantMove = false;
        }
        if (ai.backT > 0) {
          out.fwd = -1;
          out.turn = ai.backTurn;
          return out;
        }
        if (ai.shot !== null) {
          const d = angDiff(ai.shot, tk.a);
          out.turn = U.clamp(d * 5, -1, 1);
          if (Math.abs(d) < 0.045 && ai.react <= 0) {
            out.fire = true;
            ai.react = D.react * 1.6 + 0.1;
          }
        } else {
          const d = angDiff(Math.atan2(ai.ty - tk.y, ai.tx - tk.x), tk.a);
          out.turn = U.clamp(d * 4, -1, 1);
          const far = U.dist(tk.x, tk.y, ai.tx, ai.ty) > 6;
          out.fwd = !far ? 0 : Math.abs(d) < 0.5 ? 1 : Math.abs(d) < 1.2 ? 0.35 : 0;
          if (out.fwd > 0) ai.wantMove = true;
        }
        if (ai.dodgeT > 0) out.fwd = ai.dodgeDir;
        return out;
      }

      /* ---------- Round flow ---------- */
      function newRound() {
        round++;
        buildMaze();
        active = Math.random() < 0.5 ? 1 : 2;
        phaseT = 0;
        warned = false;
        tanks = [makeTank(0, 0, U.randInt(0, ROWS - 1)), makeTank(1, COLS - 1, U.randInt(0, ROWS - 1))];
        shells = [];
        crate = null;
        crateLeft = Math.random() < 0.8 ? 1 : 0;
        crateT = U.rand(3, 7);
        banner = null;
        ai = newAi();
        state = 'count';
        timer = 3;
        api.sfx('tick');
        api.setStatus('Round ' + round + ', first to ' + WIN + '. ' +
          (active === 1 ? 'Gold' : 'Violet') + ' walls are solid right now.');
      }

      function startMatch(cpu, d) {
        vsCpu = cpu;
        diff = d;
        score = [0, 0];
        round = 0;
        parts = [];
        api.setScore('0 – 0');
        newRound();
      }

      function resolveRound() {
        const alive = tanks.filter((tk) => tk.alive);
        const n = names();
        let text = 'Draw';
        let color = C.muted;
        if (alive.length === 1) {
          const w = alive[0];
          score[w.id]++;
          text = n[w.id] + (vsCpu && w.id === 0 ? ' score' : ' scores');
          color = w.color;
          api.sfx('score');
        } else {
          api.sfx('hit');
          api.setStatus('Both tanks went down. No point this round.');
        }
        shells.forEach((s) => { if (!s.dead) burst(s.x, s.y, s.color, 3, 50, 0.25, 2); });
        shells = [];
        api.setScore(score[0] + ' – ' + score[1]);
        banner = { text, color, t: 0 };
        state = 'between';
        timer = 1.6;
      }

      function matchOver() {
        state = 'over';
        const w = score[0] > score[1] ? 0 : 1;
        if (vsCpu) api.sfx(w === 0 ? 'win' : 'lose');
        else api.sfx('win');
        const title = vsCpu ? (w === 0 ? 'You win!' : 'The computer wins') : (w === 0 ? 'Coral wins!' : 'Cyan wins!');
        api.setStatus('Match over after ' + round + ' rounds.');
        api.menu({
          title,
          text: 'Final score ' + score[0] + ' – ' + score[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(vsCpu, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        tanks = [];
        shells = [];
        crate = null;
        banner = null;
        api.setStatus('Bounce shells, dodge your own, and watch the gold and violet walls.');
        api.menu({
          title: 'Tanks',
          text: 'Shells bounce off walls. Gold and violet walls swap every 6 seconds. First to 5 wins.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false, diff) },
            { label: 'vs computer', onClick: showDifficultyMenu }
          ]
        });
      }

      function showDifficultyMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'You drive the coral tank with WASD or the arrows. The computer drives cyan.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      /* ---------- Update ---------- */
      function humanInput(id) {
        const k = api.keys;
        const maps = vsCpu && id === 0 ? KEYS : [KEYS[id]];
        let fwd = 0;
        let turn = 0;
        maps.forEach((m) => {
          fwd += (k.has(m.fwd) ? 1 : 0) - (k.has(m.back) ? 1 : 0);
          turn += (k.has(m.right) ? 1 : 0) - (k.has(m.left) ? 1 : 0);
        });
        return { fwd: U.clamp(fwd, -1, 1), turn: U.clamp(turn, -1, 1) };
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 28);
        flash = Math.max(0, flash - dt * 2.5);
        swapFlash = Math.max(0, swapFlash - dt * 2);
        bounceSfx -= dt;
        goT = Math.max(0, goT - dt);
        if (banner) banner.t += dt;
        updateParts(dt);

        if (state === 'count') {
          const prev = Math.ceil(timer);
          timer -= dt;
          if (timer <= 0) {
            state = 'play';
            goT = 0.7;
            api.sfx('blip');
          } else if (Math.ceil(timer) !== prev) {
            api.sfx('tick');
          }
          return;
        }
        if (state === 'between') {
          timer -= dt;
          if (timer <= 0) {
            if (Math.max(score[0], score[1]) >= WIN) matchOver();
            else newRound();
          }
          return;
        }
        if (!live()) return;

        // Phase walls: warn one second ahead, then swap.
        phaseT += dt;
        if (!warned && phaseT >= PHASE - WARN) {
          warned = true;
          api.sfx('tick');
          if (!explained) {
            explained = true;
            api.setStatus('Heads up: the flickering walls turn solid in 1 second and the solid color turns to ghost. ' +
              'Ghost walls let tanks and shells through.');
          }
        }
        if (phaseT >= PHASE) {
          phaseT -= PHASE;
          swapPhase();
        }

        // Tanks.
        tanks.forEach((tk) => {
          tk.cd = Math.max(0, tk.cd - dt);
          tk.recoil = Math.max(0, tk.recoil - dt * 6);
          if (tk.power && tk.power.type === 'fast') {
            tk.power.time -= dt;
            if (tk.power.time <= 0) tk.power = null;
          }
        });
        const p1 = tanks[0];
        const p2 = tanks[1];
        if (p1.alive) {
          const inp = humanInput(0);
          driveTank(p1, inp.fwd, inp.turn, dt);
        }
        if (p2.alive) {
          if (vsCpu) {
            const out = cpuControl(p2, p1, dt);
            driveTank(p2, out.fwd, out.turn, dt, DIFF[diff].speed);
            if (out.fire) fire(p2);
          } else {
            const inp = humanInput(1);
            driveTank(p2, inp.fwd, inp.turn, dt);
          }
        }
        if (p1.alive && p2.alive) {
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const d = Math.hypot(dx, dy);
          if (d < TR * 2) {
            const nx = d > 0.001 ? dx / d : 1;
            const ny = d > 0.001 ? dy / d : 0;
            const push = (TR * 2 - d) / 2;
            p1.x -= nx * push;
            p1.y -= ny * push;
            p2.x += nx * push;
            p2.y += ny * push;
            pushOutTank(p1);
            pushOutTank(p2);
          }
        }

        // Shells.
        for (const s of shells) {
          if (s.dead) continue;
          s.age += dt;
          if (s.age > s.life) {
            s.dead = true;
            burst(s.x, s.y, s.color, 4, 40, 0.25, 2);
            continue;
          }
          s.trail.push(s.x, s.y);
          if (s.trail.length > 16) s.trail.splice(0, 2);
          moveShell(s, Math.hypot(s.vx, s.vy) * dt, true);
        }
        // Shells from different tanks cancel each other out.
        for (let i = 0; i < shells.length; i++) {
          const a = shells[i];
          if (a.dead) continue;
          for (let j = i + 1; j < shells.length; j++) {
            const b = shells[j];
            if (b.dead || b.owner === a.owner) continue;
            if (Math.hypot(a.x - b.x, a.y - b.y) < SR * 2 + 1) {
              a.dead = true;
              b.dead = true;
              burst((a.x + b.x) / 2, (a.y + b.y) / 2, C.text, 8, 120, 0.3, 2);
              api.sfx('hit');
              break;
            }
          }
        }
        shells = shells.filter((s) => !s.dead);

        // Crate.
        if (!crate && crateLeft > 0 && state === 'play') {
          crateT -= dt;
          if (crateT <= 0) spawnCrate();
        }
        if (crate) {
          crate.t += dt;
          for (const tk of tanks) {
            if (!tk.alive || U.dist(tk.x, tk.y, crate.x, crate.y) > TR + 12) continue;
            if (crate.type === 'shield') tk.shield = true;
            else tk.power = crate.type === 'triple' ? { type: 'triple', shots: 3 } : { type: 'fast', time: 8 };
            burst(crate.x, crate.y, C.gold, 20, 150, 0.5, 3);
            api.sfx('power');
            api.setStatus(names()[tk.id] + ' picked up ' + POWER_NAMES[crate.type] + '.');
            crate = null;
            break;
          }
        }

        if (state === 'end') {
          timer -= dt;
          if (timer <= 0) resolveRound();
        }
      }

      function spawnCrate() {
        crateLeft--;
        for (let tries = 0; tries < 40; tries++) {
          const c = U.randInt(1, COLS - 2);
          const r = U.randInt(0, ROWS - 1);
          const x = cellX(c);
          const y = cellY(r);
          if (tanks.every((tk) => U.dist(tk.x, tk.y, x, y) > 170)) {
            crate = { x, y, type: U.pick(POWERS), t: 0 };
            burst(x, y, C.gold, 12, 90, 0.4, 2);
            api.sfx('blip');
            return;
          }
        }
      }

      /* ---------- Drawing ---------- */
      function strokeWall(w) {
        ctx.beginPath();
        ctx.moveTo(w.x1, w.y1);
        ctx.lineTo(w.x2, w.y2);
        ctx.stroke();
      }

      function drawWalls() {
        const warn = live() && phaseT >= PHASE - WARN;
        const blink = Math.sin(clock * 26) > 0;
        ctx.lineCap = 'round';
        for (const w of walls) {
          if (w.kind === 0 || w.kind === active) continue;
          const col = setColor(w.kind);
          if (warn) {
            // Incoming set: a flickering hollow outline.
            ctx.strokeStyle = U.alpha(col, blink ? 0.95 : 0.35);
            ctx.lineWidth = WR * 2 + 2;
            strokeWall(w);
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = WR * 2 - 3;
            strokeWall(w);
          } else {
            ctx.setLineDash([7, 7]);
            ctx.lineDashOffset = -clock * 10;
            ctx.strokeStyle = U.alpha(col, 0.4);
            ctx.lineWidth = 2;
            strokeWall(w);
            ctx.setLineDash([]);
          }
        }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = WR * 2 + 1;
        ctx.beginPath();
        for (const w of walls) {
          if (w.kind !== 0) continue;
          ctx.moveTo(w.x1, w.y1);
          ctx.lineTo(w.x2, w.y2);
        }
        ctx.stroke();
        ctx.strokeStyle = U.alpha(C.muted, 0.3);
        ctx.lineWidth = 2;
        ctx.stroke();
        for (const w of walls) {
          if (w.kind !== active) continue;
          const col = setColor(w.kind);
          const fade = warn && !blink ? 0.5 : 1;
          ctx.strokeStyle = U.alpha(col, 0.16 * fade + swapFlash * 0.3);
          ctx.lineWidth = 18;
          strokeWall(w);
          ctx.strokeStyle = U.alpha(col, fade);
          ctx.lineWidth = WR * 2 + 1;
          strokeWall(w);
          if (swapFlash > 0) {
            ctx.strokeStyle = U.alpha(C.text, swapFlash * 0.8);
            ctx.lineWidth = 3;
            strokeWall(w);
          }
        }
      }

      function drawCrate() {
        if (!crate) return;
        const bob = Math.sin(crate.t * 4) * 2;
        const pop = Math.min(1, crate.t * 4);
        ctx.save();
        ctx.translate(crate.x, crate.y + bob);
        ctx.scale(pop, pop);
        ctx.fillStyle = U.alpha(C.gold, 0.15 + 0.08 * Math.sin(crate.t * 6));
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, -12, -12, 24, 24, 5);
        ctx.fill();
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.strokeStyle = C.text;
        ctx.fillStyle = C.text;
        ctx.lineWidth = 2;
        if (crate.type === 'triple') {
          [-0.45, 0, 0.45].forEach((a) => {
            ctx.beginPath();
            ctx.moveTo(-6, 4);
            ctx.lineTo(-6 + Math.cos(a - 0.6) * 13, 4 + Math.sin(a - 0.6) * 13);
            ctx.stroke();
          });
        } else if (crate.type === 'fast') {
          ctx.beginPath();
          ctx.moveTo(-7, -6); ctx.lineTo(-1, 0); ctx.lineTo(-7, 6);
          ctx.moveTo(1, -6); ctx.lineTo(7, 0); ctx.lineTo(1, 6);
          ctx.stroke();
        } else {
          ctx.strokeStyle = C.mint;
          ctx.beginPath();
          ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      }

      function drawShells() {
        ctx.lineCap = 'round';
        for (const s of shells) {
          const tr = s.trail;
          for (let i = 2; i < tr.length; i += 2) {
            ctx.strokeStyle = U.alpha(s.color, (i / tr.length) * 0.5);
            ctx.lineWidth = 1 + (i / tr.length) * 3;
            ctx.beginPath();
            ctx.moveTo(tr[i - 2], tr[i - 1]);
            ctx.lineTo(tr[i], tr[i + 1]);
            ctx.stroke();
          }
          const fade = s.life - s.age < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(s.age * 14)) : 1;
          ctx.fillStyle = U.alpha(s.color, 0.35 * fade);
          ctx.beginPath();
          ctx.arc(s.x, s.y, SR + 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = U.alpha(C.text, fade);
          ctx.beginPath();
          ctx.arc(s.x, s.y, SR, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function drawTanks() {
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const tk of tanks) {
          if (!tk.alive) {
            ctx.fillStyle = U.alpha(C.ink, 0.85);
            ctx.beginPath();
            ctx.arc(tk.x, tk.y, TR + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = U.alpha(tk.color, 0.35);
            ctx.lineWidth = 2;
            ctx.stroke();
            continue;
          }
          drawTank(ctx, tk.x, tk.y, tk.a, tk.color, tk.recoil, tk.tread);
          if (tk.shield) {
            ctx.strokeStyle = U.alpha(C.mint, 0.6 + 0.3 * Math.sin(clock * 6));
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(tk.x, tk.y, TR + 6, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (tk.power) {
            const label = tk.power.type === 'triple' ? '×' + tk.power.shots : 'fast';
            ctx.fillStyle = C.gold;
            ctx.fillText(label, tk.x, tk.y - TR - 14);
          }
        }
      }

      function drawHud() {
        const y = OY / 2;
        const n = names();
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        const pips = (x0, sc, col) => {
          for (let i = 0; i < WIN; i++) {
            ctx.beginPath();
            ctx.arc(x0 + i * 16, y, 5, 0, Math.PI * 2);
            if (i < sc) {
              ctx.fillStyle = col;
              ctx.fill();
            } else {
              ctx.strokeStyle = U.alpha(col, 0.5);
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }
          }
        };
        if (state !== 'menu') {
          ctx.textAlign = 'left';
          ctx.fillStyle = C.p1;
          ctx.fillText(n[0], OX + 2, y);
          pips(OX + ctx.measureText(n[0]).width + 18, score[0], C.p1);
          const right = W - 170;
          ctx.textAlign = 'right';
          ctx.fillStyle = C.p2;
          ctx.fillText(n[1], right, y);
          pips(right - ctx.measureText(n[1]).width - 14 - (WIN - 1) * 16, score[1], C.p2);
          ctx.textAlign = 'center';
          ctx.fillStyle = C.muted;
          ctx.fillText('Round ' + round, W / 2, y);
        }
        // Phase timer ring.
        const cx = W - OX - 14;
        const warn = live() && phaseT >= PHASE - WARN;
        const blink = Math.sin(clock * 26) > 0;
        const col = setColor(active);
        const next = setColor(3 - active);
        const frac = live() ? phaseT / PHASE : 0;
        ctx.lineWidth = 4;
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.arc(cx, y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = warn && blink ? next : col;
        ctx.beginPath();
        ctx.arc(cx, y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
        ctx.stroke();
        ctx.fillStyle = next;
        ctx.beginPath();
        ctx.arc(cx, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = warn ? next : C.muted;
        ctx.fillText('swap ' + (live() ? Math.ceil(PHASE - phaseT) : PHASE), cx - 22, y);
      }

      function bigText(text, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, OY + ROWS * CELL / 2);
        ctx.scale(scale, scale);
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = C.ink;
        ctx.strokeText(text, 0, 0);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.fillStyle = U.alpha(C.panel, 0.45);
        ctx.fillRect(OX, OY, COLS * CELL, ROWS * CELL);
        ctx.fillStyle = U.alpha(C.line, 0.6);
        for (let c = 0; c < COLS; c++) {
          for (let r = 0; r < ROWS; r++) ctx.fillRect(cellX(c) - 1, cellY(r) - 1, 2, 2);
        }
        drawCrate();
        drawWalls();
        drawShells();
        drawTanks();
        for (const p of parts) {
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        drawHud();

        if (state === 'count') {
          const n = Math.ceil(timer);
          const f = timer - Math.floor(timer);
          bigText(String(n), C.text, 1 + f * 0.5, Math.min(1, 0.3 + f));
        } else if (goT > 0) {
          bigText('Go!', C.gold, 1 + (0.7 - goT) * 0.6, Math.min(1, goT * 2));
        } else if (state === 'between' && banner) {
          const a = Math.min(1, banner.t * 5);
          ctx.fillStyle = U.alpha(C.ink, 0.55 * a);
          ctx.fillRect(0, OY + ROWS * CELL / 2 - 46, W, 92);
          bigText(banner.text, banner.color, 0.9 + a * 0.1, a);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.25);
          ctx.fillRect(0, 0, W, H);
        }
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || !live()) return;
        if (e.code === 'Space') fire(tanks[0]);
        else if (e.code === 'Enter') fire(vsCpu ? tanks[0] : tanks[1]);
      });

      buildMaze();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
