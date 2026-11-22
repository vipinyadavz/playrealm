/* Block Climb — race three rivals up a tall block tower ahead of the rising lava.
   You can carry only 8 blocks: break blocks below you to place them above. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const T = 32;
  const COLS = 30;
  const ROWS = 180;
  const TAU = Math.PI * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TINY = '600 10px "JetBrains Mono", monospace';

  const EMPTY = 0;
  const DIRT = 1;
  const STONE = 2;
  const ROCK = 3;   // bedrock: never breaks
  const BRICK = 4;  // a placed block
  const HARD = [0, 0.35, 0.75, Infinity, 0.25];

  const GRAV = 2000;
  const JUMP = 600;
  const SPEED = 190;
  const MAX_FALL = 900;
  const CW = 20;
  const CH = 44;
  const REACH = 2.5 * T + 8;
  const BAG = 8;
  const COYOTE = 0.1;
  const BUFFER = 0.12;
  const PUNCH_CD = 0.5;
  const START_ROW = ROWS - 4;
  const SUMMIT_ROW = 8;
  const FLAG_COL = 15;
  const FINISH_BONUS = [1000, 600, 400, 200];
  const COLORS = [C.p1, C.p2, C.gold, C.violet];
  const MAX_PARTS = 300;
  const DIFF = {
    easy: { think: 0.34, speed: 0.8, mine: 0.6, punch: 0.15, lava: 0.3, hesitate: 0.25 },
    normal: { think: 0.22, speed: 0.92, mine: 0.85, punch: 0.35, lava: 0.4, hesitate: 0.1 },
    hard: { think: 0.14, speed: 1, mine: 1, punch: 0.6, lava: 0.5, hesitate: 0.03 }
  };
  const NAME_A = ['Pebble', 'Rocky', 'Brick', 'Moss', 'Gravel', 'Captain', 'Sir', 'Lady', 'Dusty', 'Granite'];
  const NAME_B = ['Pete', 'Rhoda', 'Bramble', 'Boss', 'Crumb', 'Wobble', 'Mabel', 'Toes', 'Noodle', 'Biscuit'];
  const NAME_SOLO = ['NoodleArm', 'Sir Wobble', 'Captain Crumb', 'StackAttack', 'Ms Pickaxe', 'Chunky Monkey', 'Climbo', 'Up Up Ada'];

  function botNames(n) {
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      const name = Math.random() < 0.4 ? U.pick(NAME_SOLO) : U.pick(NAME_A) + ' ' + U.pick(NAME_B);
      if (out.indexOf(name) < 0) out.push(name);
    }
    while (out.length < n) out.push('Climber ' + (out.length + 1));
    return out;
  }

  /* ---------- Shared drawing ---------- */
  function drawBlock(ctx, type, x, y, ownerColor, mossTop) {
    if (type === DIRT) {
      ctx.fillStyle = '#6B4A3A';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#5A3D30';
      ctx.fillRect(x + 6, y + 10, 4, 4);
      ctx.fillRect(x + 20, y + 20, 5, 4);
      ctx.fillRect(x + 14, y + 26, 3, 3);
      if (mossTop) {
        ctx.fillStyle = '#3FBF86';
        ctx.fillRect(x, y, T, 6);
        ctx.fillRect(x + 4, y + 6, 4, 3);
        ctx.fillRect(x + 22, y + 6, 5, 2);
      }
    } else if (type === STONE) {
      ctx.fillStyle = '#5A5488';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#6D67A0';
      ctx.fillRect(x + 2, y + 2, 13, 11);
      ctx.fillRect(x + 17, y + 16, 12, 11);
      ctx.fillStyle = '#48426F';
      ctx.fillRect(x + 4, y + 18, 9, 3);
    } else if (type === ROCK) {
      ctx.fillStyle = '#26213F';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#1E1A33';
      ctx.fillRect(x + 3, y + 3, 10, 10);
      ctx.fillRect(x + 18, y + 17, 11, 11);
    } else if (type === BRICK) {
      ctx.fillStyle = ownerColor;
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = 'rgba(15,13,36,0.35)';
      ctx.fillRect(x, y + 15, T, 2);
      ctx.fillRect(x + 15, y, 2, 15);
      ctx.fillRect(x + 7, y + 17, 2, 15);
      ctx.fillRect(x + 23, y + 17, 2, 15);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, T, 3);
    }
  }

  function drawClimber(ctx, x, y, color, facing, t, state) {
    // state: {run, air, mine, punch, stun}
    const bx = x - CW / 2;
    const by = y - CH;
    const legA = state.run ? Math.sin(t * 16) * 5 : 0;
    ctx.fillStyle = 'rgba(15,13,36,0.6)';
    ctx.fillRect(x - 7 + legA, y - 10, 5, 10);
    ctx.fillRect(x + 2 - legA, y - 10, 5, 10);
    ctx.fillStyle = color;
    U.roundRect(ctx, bx, by + 4, CW, CH - 12, 7);
    ctx.fill();
    // Helmet with a little lamp.
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    U.roundRect(ctx, bx - 1, by, CW + 2, 10, 5);
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.fillRect(x + facing * 7 - 2, by + 2, 4, 4);
    // Eyes.
    ctx.fillStyle = '#0F0D24';
    ctx.fillRect(x + facing * 3 - 1, by + 13, 3, 4);
    ctx.fillRect(x + facing * 8 - 1, by + 13, 3, 4);
    // Arm + pick.
    const ax = x + facing * 8;
    const ay = by + 24;
    let ang = facing > 0 ? -0.4 : Math.PI + 0.4;
    if (state.mine) ang = (facing > 0 ? -1.2 : Math.PI + 1.2) + Math.abs(Math.sin(t * 18)) * 1.4 * facing;
    if (state.punch > 0) ang = facing > 0 ? 0 : Math.PI;
    const reach = state.punch > 0 ? 16 : 11;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + Math.cos(ang) * reach, ay + Math.sin(ang) * reach);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (state.mine) {
      const hx = ax + Math.cos(ang) * reach;
      const hy = ay + Math.sin(ang) * reach;
      ctx.strokeStyle = '#C9C3E8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(hx - Math.sin(ang) * 7, hy + Math.cos(ang) * 7);
      ctx.lineTo(hx + Math.sin(ang) * 7, hy - Math.cos(ang) * 7);
      ctx.stroke();
    }
    if (state.punch > 0) {
      ctx.fillStyle = '#F3F0FF';
      ctx.beginPath();
      ctx.arc(ax + Math.cos(ang) * reach, ay + Math.sin(ang) * reach, 4, 0, TAU);
      ctx.fill();
    }
    if (state.stun > 0) {
      ctx.fillStyle = C.gold;
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + i * TAU / 3;
        ctx.fillRect(x + Math.cos(a) * 12 - 1.5, by - 6 + Math.sin(a) * 3, 3, 3);
      }
    }
  }

  Arcade.register({
    id: 'block-climb',
    title: 'Block Climb',
    category: 'io',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.mint,
    tagline: 'Race three rivals up a block tower while the lava rises below.',
    hook: 'You can carry only 8 blocks: break blocks below you to place them above.',
    tags: ['io', 'platformer', 'parkour', 'race', 'blocks', 'mining', 'building', 'lava', 'climb', 'bots'],
    howTo: 'Climb to the flag at the top before your three rivals, and stay ahead of the lava rising from below. ' +
      'Run and jump between ledges; when a wall is too tall, build. Hold click (or F) to mine a nearby block and ' +
      'right-click (or E) to place one; press E in mid-air to drop a block under your feet and climb a pillar. ' +
      'The twist: your bag holds only 8 blocks, so recycle the blocks below you to keep building up. ' +
      'Grab coins, and press G to punch a rival off a ledge. Score: height × 10, coins × 25, plus a bonus for your finish place.',
    controls: [
      { keys: ['A', 'D'], label: 'Run' },
      { keys: ['W', 'Space'], label: 'Jump' },
      { keys: ['Hold click', 'F'], label: 'Mine a block (S+F takes one from below you)' },
      { keys: ['Right-click', 'E'], label: 'Place a block (E in mid-air: under you)' },
      { keys: ['G'], label: 'Punch a rival' }
    ],

    drawThumb(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#120F2A');
      g.addColorStop(1, '#2A1B3A');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#1A1636';
      for (let i = 0; i < 6; i++) ctx.fillRect(i * 58 - 10, 40 + (i % 3) * 30, 34, h);
      // Ledges.
      for (let c = 0; c < 4; c++) drawBlock(ctx, DIRT, c * T, 136, null, true);
      for (let c = 6; c < 10; c++) drawBlock(ctx, STONE, c * T, 40, null, false);
      for (let c = 0; c < 3; c++) drawBlock(ctx, ROCK, c * T, 168, null, false);
      // A pillar of placed blocks with the climber on top.
      const k = (t * 0.8) % 1;
      const n = 2 + Math.floor(k * 2.99);
      for (let i = 0; i < n; i++) drawBlock(ctx, BRICK, 5 * T, 168 - i * T, C.p1, false);
      const top = 168 - (n - 1) * T;
      drawClimber(ctx, 5 * T + T / 2, top - Math.abs(Math.sin(t * 5)) * 20, C.p1, 1, t, { run: false, mine: false, punch: 0, stun: 0 });
      drawClimber(ctx, 2 * T + 10, 136, C.p2, 1, t, { run: true, mine: false, punch: 0, stun: 0 });
      // Coin + flag.
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.ellipse(8 * T + 16, 92, 7 * Math.abs(Math.cos(t * 3)) + 1, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#C9C3E8';
      ctx.fillRect(9 * T + 10, 2, 3, 38);
      ctx.fillStyle = C.mint;
      ctx.beginPath();
      ctx.moveTo(9 * T + 13, 4);
      ctx.lineTo(9 * T + 13 + 22 + Math.sin(t * 6) * 3, 10);
      ctx.lineTo(9 * T + 13, 18);
      ctx.closePath();
      ctx.fill();
      // Lava.
      const ly = h - 14;
      const lg = ctx.createLinearGradient(0, ly - 40, 0, h);
      lg.addColorStop(0, 'rgba(255,93,115,0)');
      lg.addColorStop(0.6, 'rgba(255,120,60,0.35)');
      lg.addColorStop(1, 'rgba(255,120,60,0.5)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, ly - 40, w, 54);
      ctx.fillStyle = '#FF7A3D';
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, ly + Math.sin(x * 0.05 + t * 3) * 3);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
      // Bag: 8 slots, 5 filled.
      const bx = w - 8 * 13 - 10;
      ctx.fillStyle = 'rgba(15,13,36,0.8)';
      U.roundRect(ctx, bx - 5, 8, 8 * 13 + 8, 20, 6);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i < 5 ? C.p1 : 'rgba(243,240,255,0.15)';
        ctx.fillRect(bx + i * 13, 12, 10, 12);
      }
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const keys = api.keys;

      const grid = new Uint8Array(COLS * ROWS);
      const owner = new Int8Array(COLS * ROWS);
      const coin = new Uint8Array(COLS * ROWS);
      const bgCols = [];
      for (let i = 0; i < 14; i++) bgCols.push({ x: i * 74 + Math.random() * 30 - 20, w: 26 + Math.random() * 40, h: 140 + Math.random() * 200 });
      const embers = [];
      for (let i = 0; i < 26; i++) embers.push({ x: Math.random() * W, y: Math.random() * 120, s: 1 + Math.random() * 2, v: 20 + Math.random() * 40 });

      let state = 'menu';
      let diffName = 'normal';
      let D = DIFF.normal;
      let climbers = [];
      let you = null;
      let ranked = [];
      let clock = 0;
      let raceT = 0;
      let countT = 0;
      let goT = 0;
      let lavaY = ROWS * T;
      let camY = (ROWS * T) - H;
      let finishCount = 0;
      let shake = 0;
      let mouseX = W / 2;
      let mouseY = H / 2;
      let mouseL = false;
      let hintEmpty = false;
      let hintFull = false;
      let hintLava = false;
      let hintPillar = false;
      let banner = null;
      let lastScore = 0;

      const parts = [];
      for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, color: '#fff', grav: true });

      function part(x, y, vx, vy, life, size, color, grav) {
        for (let i = 0; i < MAX_PARTS; i++) {
          const p = parts[i];
          if (p.on) continue;
          p.on = true;
          p.x = x; p.y = y; p.vx = vx; p.vy = vy;
          p.life = p.max = life;
          p.size = size;
          p.color = color;
          p.grav = grav;
          return;
        }
      }
      function burst(x, y, n, sp, color, life, size) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = sp * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * s, Math.sin(a) * s - sp * 0.3, life * (0.6 + Math.random() * 0.6), size, color, true);
        }
      }

      /* ---------- World ---------- */
      function cell(c, r) {
        if (c < 0 || c >= COLS || r >= ROWS || r < 0) return ROCK;
        return grid[r * COLS + c];
      }
      function solid(c, r) { return cell(c, r) !== EMPTY; }
      function standable(c, r) {
        return c > 0 && c < COLS - 1 && r > 1 && r < ROWS - 1 && !solid(c, r) && !solid(c, r - 1) && solid(c, r + 1);
      }
      function setCell(c, r, t) {
        if (c > 0 && c < COLS - 1 && r >= 0 && r < ROWS) {
          grid[r * COLS + c] = t;
          if (t !== EMPTY) coin[r * COLS + c] = 0;
        }
      }

      function generate() {
        grid.fill(EMPTY);
        owner.fill(-1);
        coin.fill(0);
        for (let r = 0; r < ROWS; r++) { grid[r * COLS] = ROCK; grid[r * COLS + COLS - 1] = ROCK; }
        for (let r = ROWS - 3; r < ROWS; r++) for (let c = 1; c < COLS - 1; c++) grid[r * COLS + c] = r === ROWS - 3 ? DIRT : ROCK;
        let y = ROWS - 3;
        let sinceSlab = 0;
        while (y > SUMMIT_ROW + 5) {
          const prog = 1 - y / ROWS;
          y -= U.randInt(2, prog > 0.55 ? 5 : 4);
          if (y <= SUMMIT_ROW + 4) break;
          sinceSlab++;
          if (sinceSlab > 7 && Math.random() < 0.35) {
            // A ceiling slab with a couple of narrow holes: go through, or dig.
            sinceSlab = 0;
            const holes = [U.randInt(2, 12), U.randInt(16, 26)];
            for (let c = 1; c < COLS - 1; c++) {
              if ((c >= holes[0] && c < holes[0] + 2) || (c >= holes[1] && c < holes[1] + 2)) continue;
              setCell(c, y, Math.random() < 0.25 + prog * 0.4 ? STONE : DIRT);
            }
            continue;
          }
          const n = U.randInt(1, 3);
          for (let i = 0; i < n; i++) {
            const len = U.randInt(3, 8);
            const c0 = U.randInt(1, COLS - 1 - len);
            const mat = Math.random() < 0.15 + prog * 0.45 ? STONE : DIRT;
            for (let c = c0; c < c0 + len; c++) {
              setCell(c, y, mat);
              if (Math.random() < 0.3) setCell(c, y + 1, DIRT);
            }
            if (Math.random() < 0.45) {
              const cc = U.randInt(c0, c0 + len - 1);
              if (!solid(cc, y - 1)) coin[(y - 1) * COLS + cc] = 1;
            }
            if (Math.random() < 0.2) {
              const cc = U.randInt(c0, c0 + len - 1);
              const rr = y - U.randInt(2, 3);
              if (!solid(cc, rr)) coin[rr * COLS + cc] = 1;
            }
          }
          if (Math.random() < 0.35) {
            const c = U.randInt(2, COLS - 3);
            const r = y + U.randInt(1, 2);
            if (r < ROWS - 3 && !solid(c, r - 1)) setCell(c, r, DIRT);
          }
        }
        // Summit.
        for (let r = SUMMIT_ROW - 8; r < SUMMIT_ROW; r++) for (let c = 1; c < COLS - 1; c++) setCell(c, r, EMPTY);
        for (let c = 8; c <= 21; c++) setCell(c, SUMMIT_ROW, STONE);
        for (let c = 8; c <= 21; c++) setCell(c, SUMMIT_ROW + 1, EMPTY);
        // Start area: clear headroom above the floor.
        for (let r = START_ROW - 3; r <= START_ROW; r++) for (let c = 1; c < COLS - 1; c++) { setCell(c, r, EMPTY); coin[r * COLS + c] = 0; }
      }

      /* ---------- Climbers ---------- */
      function makeClimber(idx, name, isBot, col) {
        return {
          idx, name, isBot, color: COLORS[idx],
          x: col * T + T / 2, y: (START_ROW + 1) * T, vx: 0, vy: 0, facing: 1,
          onGround: true, coyote: 0, jumpBuf: 0, jumpHeld: false, stun: 0,
          blocks: 4, coins: 0, bestRow: START_ROW, alive: true, finished: false, place: 0,
          mineC: -1, mineR: -1, mineT: 0, mining: false, punchCd: 0, punchAnim: 0, run: false,
          ai: isBot ? {
            think: 0.2 + Math.random() * 0.3, mode: 'idle', tc: 0, tr: 0, timer: 0, pr: -1,
            progT: 0, progRow: START_ROW, forcePillar: 0, failKey: -1, failN: 0, wanderDir: 1, wait: 0
          } : null
        };
      }

      function overlapsClimber(c, r) {
        const x0 = c * T;
        const y0 = r * T;
        for (const p of climbers) {
          if (!p.alive || p.finished) continue;
          if (p.x + CW / 2 > x0 && p.x - CW / 2 < x0 + T && p.y > y0 && p.y - CH < y0 + T) return true;
        }
        return false;
      }

      function inReach(p, c, r) {
        return Math.hypot(c * T + T / 2 - p.x, r * T + T / 2 - (p.y - CH / 2)) <= REACH;
      }

      function placeBlock(p, c, r) {
        if (c <= 0 || c >= COLS - 1 || r < 1 || r >= ROWS) return false;
        if (solid(c, r) || !inReach(p, c, r) || overlapsClimber(c, r)) return false;
        if (p.blocks <= 0) {
          if (p === you && !hintEmpty) {
            hintEmpty = true;
            api.setStatus('Out of blocks! Break blocks below you to place them above.');
          }
          return false;
        }
        grid[r * COLS + c] = BRICK;
        owner[r * COLS + c] = p.idx;
        p.blocks--;
        burst(c * T + T / 2, r * T + T / 2, 5, 80, p.color, 0.3, 3);
        if (p === you) {
          api.sfx('tick');
          if (!hintPillar && !p.onGround) {
            hintPillar = true;
            api.setStatus('Nice pillar. When the bag runs low, mine the blocks under you and build higher.');
          }
        }
        return true;
      }

      function mineStep(p, c, r, dt) {
        const t = cell(c, r);
        if (t === EMPTY || t === ROCK || r < 0 || !inReach(p, c, r)) {
          p.mining = false;
          return false;
        }
        if (p.mineC !== c || p.mineR !== r) {
          p.mineC = c;
          p.mineR = r;
          p.mineT = 0;
        }
        p.mining = true;
        p.mineT += dt * (p.isBot ? D.mine : 1);
        if (Math.random() < dt * 12) part(c * T + U.rand(4, 28), r * T + U.rand(4, 28), U.rand(-60, 60), U.rand(-120, -20), 0.35, 3, t === STONE ? '#6D67A0' : t === BRICK ? COLORS[Math.max(0, owner[r * COLS + c])] : '#6B4A3A', true);
        if (p.mineT >= HARD[t]) {
          const col = t === STONE ? '#6D67A0' : t === BRICK ? COLORS[Math.max(0, owner[r * COLS + c])] : '#6B4A3A';
          grid[r * COLS + c] = EMPTY;
          owner[r * COLS + c] = -1;
          p.mineT = 0;
          p.mineC = -1;
          burst(c * T + T / 2, r * T + T / 2, 10, 150, col, 0.5, 4);
          if (p.blocks < BAG) {
            p.blocks++;
            if (p === you) api.sfx('blip');
          } else if (p === you) {
            api.sfx('flip');
            if (!hintFull) {
              hintFull = true;
              api.setStatus('Your bag is full at 8 blocks. Place some before you mine more.');
            }
          }
          return true;
        }
        return false;
      }

      /* Front cell helpers. */
      function frontCol(p) {
        return Math.floor((p.x + p.facing * (CW / 2 + 6)) / T);
      }
      function feetRow(p) {
        return Math.floor((p.y - 1) / T);
      }

      function keyMineTarget(p) {
        const c = Math.floor(p.x / T);
        const r = feetRow(p);
        if (keys.has('KeyS') || keys.has('ArrowDown')) {
          // Recycle: take the block under the one you stand on, so you stay up.
          const t2 = cell(c, r + 2);
          if (t2 !== EMPTY && t2 !== ROCK && solid(c, r + 1) && inReach(p, c, r + 2)) return [c, r + 2];
          return [c, r + 1];
        }
        const fc = frontCol(p);
        if (solid(fc, r) && cell(fc, r) !== ROCK) return [fc, r];
        if (solid(fc, r - 1) && cell(fc, r - 1) !== ROCK) return [fc, r - 1];
        return [c, r - 2];
      }

      function keyPlace(p) {
        const c = Math.floor(p.x / T);
        if (!p.onGround) {
          // Drop a block under your feet.
          const r = Math.ceil(p.y / T);
          if (placeBlock(p, c, r)) return true;
          return placeBlock(p, frontCol(p), feetRow(p) + 1);
        }
        const fc = frontCol(p);
        const r = feetRow(p);
        if (!solid(fc, r + 1)) return placeBlock(p, fc, r + 1);
        return placeBlock(p, fc, r);
      }

      function punch(p) {
        if (p.punchCd > 0 || !p.alive || p.finished || p.stun > 0) return;
        p.punchCd = PUNCH_CD;
        p.punchAnim = 0.15;
        let hit = false;
        for (const o of climbers) {
          if (o === p || !o.alive || o.finished) continue;
          const dx = (o.x - p.x) * p.facing;
          if (dx < 0 || dx > 40 || Math.abs(o.y - p.y) > 36) continue;
          o.vx = p.facing * 430;
          o.vy = -300;
          o.stun = 0.45;
          o.onGround = false;
          hit = true;
          burst(o.x, o.y - CH / 2, 8, 140, '#F3F0FF', 0.3, 3);
          if (o === you) { shake = Math.max(shake, 0.2); api.sfx('hit'); } else if (p === you) api.sfx('hit');
        }
        if (!hit && p === you) api.sfx('flip');
      }

      /* ---------- Physics ---------- */
      function collideX(p) {
        const top = Math.floor((p.y - CH + 1) / T);
        const bot = Math.floor((p.y - 1) / T);
        if (p.vx > 0) {
          const c = Math.floor((p.x + CW / 2) / T);
          for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = c * T - CW / 2 - 0.01; p.vx = 0; return; }
        } else if (p.vx < 0) {
          const c = Math.floor((p.x - CW / 2) / T);
          for (let r = top; r <= bot; r++) if (solid(c, r)) { p.x = (c + 1) * T + CW / 2 + 0.01; p.vx = 0; return; }
        }
      }
      function collideY(p) {
        const c0 = Math.floor((p.x - CW / 2 + 1) / T);
        const c1 = Math.floor((p.x + CW / 2 - 1) / T);
        if (p.vy > 0) {
          const r = Math.floor(p.y / T);
          for (let c = c0; c <= c1; c++) {
            if (solid(c, r)) { p.y = r * T; p.vy = 0; p.onGround = true; return; }
          }
        } else if (p.vy < 0) {
          const r = Math.floor((p.y - CH) / T);
          for (let c = c0; c <= c1; c++) {
            if (solid(c, r)) { p.y = (r + 1) * T + CH; p.vy = 0; return; }
          }
        }
      }

      function physics(p, dt, move, jumpPress, jumpHeld) {
        p.stun = Math.max(0, p.stun - dt);
        p.punchAnim = Math.max(0, p.punchAnim - dt);
        if (p.stun > 0) move = 0;
        const target = move * SPEED * (p.isBot ? D.speed : 1);
        const acc = (p.onGround ? 2600 : 1500) * dt;
        if (p.stun > 0) p.vx *= Math.pow(0.3, dt);
        else p.vx += U.clamp(target - p.vx, -acc, acc);
        if (move) p.facing = move > 0 ? 1 : -1;
        p.run = p.onGround && Math.abs(p.vx) > 30;
        if (jumpPress) p.jumpBuf = BUFFER;
        else p.jumpBuf = Math.max(0, p.jumpBuf - dt);
        if (p.onGround) p.coyote = COYOTE;
        else p.coyote = Math.max(0, p.coyote - dt);
        if (p.jumpBuf > 0 && p.coyote > 0 && p.stun <= 0) {
          p.vy = -JUMP;
          p.jumpBuf = 0;
          p.coyote = 0;
          p.onGround = false;
          if (p === you) api.sfx('flip');
        }
        if (!jumpHeld && p.vy < -JUMP * 0.6 && p.jumpHeld) p.vy = -JUMP * 0.6;
        p.jumpHeld = jumpHeld;
        p.vy = Math.min(MAX_FALL, p.vy + GRAV * dt);
        const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt / 10));
        const h = dt / steps;
        p.onGround = false;
        for (let s = 0; s < steps; s++) {
          p.x += p.vx * h;
          collideX(p);
          p.y += p.vy * h;
          collideY(p);
        }
        // Ground probe so standing still keeps you grounded.
        if (!p.onGround && p.vy >= 0) {
          const r = Math.floor((p.y + 1) / T);
          const c0 = Math.floor((p.x - CW / 2 + 1) / T);
          const c1 = Math.floor((p.x + CW / 2 - 1) / T);
          for (let c = c0; c <= c1; c++) if (solid(c, r) && Math.abs(p.y - r * T) < 1) p.onGround = true;
        }
        p.x = U.clamp(p.x, T + CW / 2, (COLS - 1) * T - CW / 2);
      }

      /* ---------- Bots ---------- */
      function jumpClear(c, r, c2, r2) {
        if (solid(c, r - 2)) return false;
        if (r - r2 >= 2 && solid(c, r - 3)) return false;
        const step = c2 > c ? 1 : -1;
        for (let cc = c + step; cc !== c2; cc += step) {
          if (solid(cc, r2) || solid(cc, r2 - 1)) return false;
          if (solid(cc, r2 - 2) && r - r2 >= 1) return false;
        }
        return true;
      }

      function bestHop(c, r, ai) {
        let best = null;
        let bestSc = -1e9;
        for (let dr = 2; dr >= 1; dr--) {
          const maxDc = dr === 2 ? 2 : 3;
          for (let dc = -maxDc; dc <= maxDc; dc++) {
            if (!dc) continue;
            const c2 = c + dc;
            const r2 = r - dr;
            if (!standable(c2, r2) || !jumpClear(c, r, c2, r2)) continue;
            const key = r2 * COLS + c2;
            if (ai && key === ai.failKey && ai.failN >= 2) continue;
            const sc = dr * 10 - Math.abs(dc) + (coin[key] ? 3 : 0) + Math.random();
            if (sc > bestSc) { bestSc = sc; best = { c: c2, r: r2 }; }
          }
        }
        return best;
      }

      function botThink(b) {
        const ai = b.ai;
        ai.think = D.think * U.rand(0.8, 1.3);
        if (Math.random() < D.hesitate) { ai.mode = 'idle'; ai.timer = 0.3 + Math.random() * 0.4; ai.think = ai.timer; return; }
        const c = Math.floor(b.x / T);
        const r = feetRow(b);
        if (ai.forcePillar <= 0) {
          const hop = bestHop(c, r, ai);
          if (hop) {
            const key = hop.r * COLS + hop.c;
            if (key === ai.failKey) ai.failN++; else { ai.failKey = key; ai.failN = 0; }
            ai.mode = 'hop';
            ai.tc = hop.c;
            ai.tr = hop.r;
            ai.timer = 1.4;
            ai.jumped = false;
            return;
          }
          // Walk along this ledge to a spot that has a hop.
          let found = -1;
          for (let dist = 1; dist <= 10 && found < 0; dist++) {
            for (let s = -1; s <= 1 && found < 0; s += 2) {
              const cc = c + s * dist;
              let ok = true;
              for (let k = 1; k <= dist; k++) if (!standable(c + s * k, r)) { ok = false; break; }
              if (ok && bestHop(cc, r, null)) found = cc;
            }
          }
          if (found >= 0) {
            ai.mode = 'walk';
            ai.tc = found;
            ai.tr = r;
            ai.timer = 3;
            return;
          }
        }
        ai.mode = 'pillar';
        ai.timer = 4;
        ai.pr = -1;
      }

      function nearbyMineable(b) {
        const c = Math.floor(b.x / T);
        const r = feetRow(b);
        // Prefer recycling blocks below the one we stand on, then the sides.
        const order = [[0, 2], [0, 3], [-1, 1], [1, 1], [-1, 2], [1, 2], [-1, 0], [1, 0], [-1, -1], [1, -1], [-2, 1], [2, 1]];
        for (const o of order) {
          const cc = c + o[0];
          const rr = r + o[1];
          if (cc === c && rr === r + 1) continue;
          const t = cell(cc, rr);
          if (t === EMPTY || t === ROCK) continue;
          if (inReach(b, cc, rr)) return rr * COLS + cc;
        }
        return -1;
      }

      function updateBot(b, dt) {
        const ai = b.ai;
        let move = 0;
        let jump = false;
        b.mining = false;
        ai.think -= dt;
        ai.timer -= dt;
        ai.forcePillar -= dt;
        // Progress watchdog.
        const row = feetRow(b);
        ai.progT += dt;
        if (row < ai.progRow) { ai.progRow = row; ai.progT = 0; }
        if (ai.progT > 7) { ai.progT = 0; ai.progRow = row; ai.forcePillar = 4; ai.mode = 'pillar'; ai.pr = -1; }
        // Punch rivals that crowd us.
        b.punchCd -= dt;
        if (b.punchCd <= 0 && b.stun <= 0) {
          for (const o of climbers) {
            if (o === b || !o.alive || o.finished) continue;
            const dx = o.x - b.x;
            if (Math.abs(dx) < 34 && Math.abs(o.y - b.y) < 30 && Math.random() < D.punch * dt * 3) {
              b.facing = dx > 0 ? 1 : -1;
              punch(b);
              break;
            }
          }
        }
        if (b.stun > 0) { physics(b, dt, 0, false, false); return; }
        // At summit height: head for the flag, bridging gaps with blocks.
        if (b.onGround && row <= SUMMIT_ROW - 1) ai.mode = 'summit';
        if (b.onGround && (ai.think <= 0 || ai.timer <= 0) && ai.mode !== 'pillar' && ai.mode !== 'summit') botThink(b);
        const c = Math.floor(b.x / T);
        if (ai.mode === 'summit') {
          const dir = FLAG_COL * T + 4 > b.x ? 1 : -1;
          b.facing = dir;
          move = dir * 0.8;
          if (b.onGround) {
            const r = feetRow(b);
            const next = Math.floor((b.x + dir * (CW / 2 + 6)) / T);
            if (!solid(next, r + 1)) {
              move = 0;
              if (b.blocks > 0) placeBlock(b, next, r + 1);
              else {
                const m = nearbyMineable(b);
                if (m >= 0) mineStep(b, m % COLS, (m / COLS) | 0, dt);
                else move = dir * 0.8;
              }
            } else if (solid(next, r)) {
              if (cell(next, r) !== ROCK && !solid(c, r - 2)) jump = true;
              else if (cell(next, r) !== ROCK) mineStep(b, next, r, dt);
            }
          }
        } else if (ai.mode === 'idle') {
          if (ai.timer <= 0) ai.think = 0;
        } else if (ai.mode === 'hop') {
          const tx = ai.tc * T + T / 2;
          const dx = tx - b.x;
          move = Math.abs(dx) > 4 ? Math.sign(dx) : 0;
          if (!ai.jumped) {
            if (b.onGround) { jump = true; ai.jumped = true; ai.air = false; }
          } else if (!b.onGround) {
            ai.air = true;
          } else if (ai.air) {
            // Landed: success if we made the ledge, then plan the next move.
            if (feetRow(b) === ai.tr) { ai.failN = 0; ai.failKey = -1; }
            ai.mode = 'idle';
            ai.think = 0;
            ai.timer = 0;
          }
        } else if (ai.mode === 'walk') {
          const tx = ai.tc * T + T / 2;
          const dx = tx - b.x;
          if (Math.abs(dx) > 5) move = Math.sign(dx) * 0.9;
          else { ai.think = 0; ai.mode = 'idle'; ai.timer = 0; }
        } else if (ai.mode === 'pillar') {
          const r = feetRow(b);
          if (b.onGround) {
            ai.pr = -1;
            const above = cell(c, r - 2);
            const above2 = cell(c, r - 3);
            if (above === ROCK) {
              ai.mode = 'wander';
              ai.timer = 1.2;
              ai.wanderDir = b.x < W / 2 ? 1 : -1;
            } else if (above !== EMPTY) {
              mineStep(b, c, r - 2, dt);
            } else if (above2 !== EMPTY && above2 !== ROCK && inReach(b, c, r - 3)) {
              mineStep(b, c, r - 3, dt);
            } else if (b.blocks <= 0) {
              const m = nearbyMineable(b);
              if (m >= 0) mineStep(b, m % COLS, (m / COLS) | 0, dt);
              else { ai.mode = 'wander'; ai.timer = 1.5; ai.wanderDir = Math.random() < 0.5 ? 1 : -1; }
            } else {
              const tx = c * T + T / 2;
              const dx = tx - b.x;
              if (Math.abs(dx) > 3) move = Math.sign(dx) * 0.5;
              else {
                jump = true;
                ai.pr = r;
                ai.pc = c;
              }
              // Leave pillar mode when a natural hop opens up.
              if (ai.forcePillar <= 0 && ai.think <= 0) {
                ai.think = D.think * 2;
                if (bestHop(c, r, ai)) ai.mode = 'idle';
              }
            }
          } else if (ai.pr >= 0) {
            const tx = ai.pc * T + T / 2;
            if (Math.abs(tx - b.x) > 3) move = Math.sign(tx - b.x) * 0.4;
            if (b.y <= ai.pr * T + 0.5 && placeBlock(b, ai.pc, ai.pr)) ai.pr = -1;
          }
        } else if (ai.mode === 'wander') {
          move = ai.wanderDir * 0.8;
          if (b.onGround && solid(Math.floor((b.x + ai.wanderDir * 20) / T), feetRow(b))) jump = true;
          if (ai.timer <= 0) { ai.mode = 'idle'; ai.think = 0; }
        }
        physics(b, dt, move, jump, true);
      }

      /* ---------- Player ---------- */
      let jumpLatch = false;
      function updateYou(dt) {
        const p = you;
        let move = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) move -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) move += 1;
        const jumpHeld = keys.has('KeyW') || keys.has('Space') || keys.has('ArrowUp');
        const press = jumpHeld && !jumpLatch;
        jumpLatch = jumpHeld;
        p.punchCd -= dt;
        physics(p, dt, move, press, jumpHeld);
        // Mining: mouse first, then F.
        p.mining = false;
        if (mouseL) {
          const c = Math.floor(mouseX / T);
          const r = Math.floor((mouseY + camY) / T);
          if (inReach(p, c, r)) {
            p.facing = c * T + T / 2 >= p.x ? 1 : -1;
            mineStep(p, c, r, dt);
          }
        } else if (keys.has('KeyF')) {
          const tg = keyMineTarget(p);
          mineStep(p, tg[0], tg[1], dt);
        }
        if (!p.mining) { p.mineC = -1; p.mineT = 0; }
      }

      /* ---------- Flow ---------- */
      function startRace(dn) {
        diffName = dn;
        D = DIFF[dn];
        generate();
        const names = botNames(3);
        const cols = U.shuffle([6, 11, 18, 23]);
        climbers = [makeClimber(0, 'You', false, cols[0])];
        for (let i = 0; i < 3; i++) climbers.push(makeClimber(i + 1, names[i], true, cols[i + 1]));
        you = climbers[0];
        ranked = climbers.slice();
        for (const p of parts) p.on = false;
        lavaY = (ROWS - 1) * T + 10;
        camY = ROWS * T - H;
        raceT = 0;
        countT = 3;
        goT = 0;
        finishCount = 0;
        shake = 0;
        banner = null;
        hintEmpty = false;
        hintFull = false;
        hintLava = false;
        hintPillar = false;
        mouseL = false;
        state = 'count';
        lastScore = 0;
        api.setScore(0);
        api.setStatus('Climb to the flag! Hold click or F to mine, right-click or E to place. Your bag holds 8 blocks.');
        api.sfx('tick');
      }

      function showStartMenu() {
        state = 'menu';
        api.setStatus('Race to the summit flag before the lava catches you.');
        api.menu({
          title: 'Block Climb',
          text: 'Race three rivals up the tower. You can carry only 8 blocks: break blocks below you to place them above.',
          buttons: [
            { label: 'Easy', onClick: () => startRace('easy') },
            { label: 'Normal', primary: true, onClick: () => startRace('normal') },
            { label: 'Hard', onClick: () => startRace('hard') }
          ]
        });
      }

      function heightOf(p) { return START_ROW - p.bestRow; }
      function scoreOf(p) {
        return heightOf(p) * 10 + p.coins * 25 + (p.place ? FINISH_BONUS[p.place - 1] : 0);
      }

      function endRace(reason) {
        if (state === 'over') return;
        state = 'over';
        mouseL = false;
        const final = scoreOf(you);
        api.setScore(final);
        const best = api.reportScore(final);
        const place = you.place;
        api.sfx(place === 1 ? 'win' : place ? 'score' : 'lose');
        const ord = ['1st', '2nd', '3rd', '4th'];
        const title = best ? 'New best: ' + final + '!' : place === 1 ? 'Summit! 1st place' : place ? ord[place - 1] + ' place' : 'Melted!';
        const parts2 = [];
        parts2.push('Height ' + heightOf(you) + ' m (' + heightOf(you) * 10 + ')');
        parts2.push(you.coins + ' coin' + (you.coins === 1 ? '' : 's') + ' (' + you.coins * 25 + ')');
        if (place) parts2.push(ord[place - 1] + ' place bonus (' + FINISH_BONUS[place - 1] + ')');
        api.setStatus(reason);
        api.menu({
          title,
          text: reason + ' ' + parts2.join(', ') + ' = ' + final + ' points.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startRace(diffName) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function rankCmp(a, b) {
        const fa = a.place || 99;
        const fb = b.place || 99;
        if (fa !== fb) return fa - fb;
        return a.bestRow - b.bestRow || a.idx - b.idx;
      }

      /* ---------- Input ---------- */
      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        mouseX = p.x;
        mouseY = p.y;
      });
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        mouseX = p.x;
        mouseY = p.y;
        if (state !== 'play' || !you.alive || you.finished) return;
        if (e.button === 2) {
          const c = Math.floor(p.x / T);
          const r = Math.floor((p.y + camY) / T);
          if (!placeBlock(you, c, r) && you.blocks > 0 && !solid(c, r)) api.setStatus('Too far away, or someone is standing there.');
        } else {
          mouseL = true;
        }
      });
      api.on(window, 'pointerup', () => { mouseL = false; }, { always: true });
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat || !you.alive || you.finished) return;
        if (e.code === 'KeyE') keyPlace(you);
        else if (e.code === 'KeyG') punch(you);
      });

      /* ---------- Update ---------- */
      function updateParts(dt) {
        for (const p of parts) {
          if (!p.on) continue;
          p.life -= dt;
          if (p.life <= 0) { p.on = false; continue; }
          if (p.grav) p.vy += 900 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
      }

      function checkPickups(p) {
        const c0 = Math.floor((p.x - CW / 2) / T);
        const c1 = Math.floor((p.x + CW / 2) / T);
        const r0 = Math.floor((p.y - CH) / T);
        const r1 = Math.floor((p.y - 1) / T);
        for (let r = Math.max(0, r0); r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const i = r * COLS + c;
            if (!coin[i]) continue;
            coin[i] = 0;
            p.coins++;
            burst(c * T + T / 2, r * T + T / 2, 8, 120, C.gold, 0.4, 3);
            if (p === you) api.sfx('score');
          }
        }
        // Flag.
        if (!p.finished && r0 <= SUMMIT_ROW && Math.abs(p.x - (FLAG_COL * T + 4)) < 26 && p.y <= SUMMIT_ROW * T + 2) {
          p.finished = true;
          p.place = ++finishCount;
          p.bestRow = Math.min(p.bestRow, SUMMIT_ROW - 1);
          burst(FLAG_COL * T, SUMMIT_ROW * T - 60, 30, 260, p.color, 0.9, 4);
          if (p === you) {
            api.sfx('win');
          } else {
            api.sfx('power');
            api.setStatus(p.name + ' reached the flag in ' + ['1st', '2nd', '3rd', '4th'][p.place - 1] + ' place!');
          }
        }
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        goT = Math.max(0, goT - dt);
        if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
        updateParts(dt);
        for (const e of embers) {
          e.y += e.v * dt;
          if (e.y > 140) { e.y = 0; e.x = Math.random() * W; }
        }
        if (state === 'menu' || !you) return;
        // Camera.
        const focus = you;
        const ty = U.clamp(focus.y - H * 0.6, 0, ROWS * T - H);
        camY += (ty - camY) * Math.min(1, dt * 6);
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'play';
            goT = 0.8;
            api.sfx('blip');
          } else if (Math.ceil(countT) !== prev) {
            api.sfx('tick');
          }
          return;
        }
        if (state !== 'play') return;
        raceT += dt;
        // Lava: slow at first, faster over time, and never far below you.
        if (raceT > 5) {
          let speed = (D.lava + 0.0025 * raceT) * T;
          if (you.alive && !you.finished && lavaY - you.y > 16 * T) speed *= 3;
          lavaY -= speed * dt;
        }
        if (!hintLava && lavaY - camY < H + 20) {
          hintLava = true;
          api.setStatus('The lava is rising. Keep climbing!');
        }
        for (const p of climbers) {
          if (!p.alive || p.finished) continue;
          if (p === you) updateYou(dt);
          else updateBot(p, dt);
          const row = feetRow(p);
          if (row < p.bestRow && p.onGround) p.bestRow = Math.max(row, SUMMIT_ROW - 1);
          checkPickups(p);
          if (p.y - 6 > lavaY) {
            p.alive = false;
            burst(p.x, lavaY, 24, 260, '#FF7A3D', 0.8, 4);
            burst(p.x, lavaY, 10, 160, p.color, 0.6, 3);
            if (p === you) {
              shake = 0.4;
              api.sfx('lose');
            } else {
              api.sfx('boom');
              api.setStatus(p.name + ' fell into the lava.');
            }
          }
        }
        // Climbers bump each other sideways.
        for (let i = 0; i < climbers.length; i++) {
          const a = climbers[i];
          if (!a.alive || a.finished) continue;
          for (let j = i + 1; j < climbers.length; j++) {
            const b = climbers[j];
            if (!b.alive || b.finished) continue;
            const dx = b.x - a.x;
            if (Math.abs(dx) >= CW || Math.abs(b.y - a.y) >= CH * 0.8) continue;
            const push = (CW - Math.abs(dx)) * 0.5 * (dx >= 0 ? 1 : -1);
            const ax = a.x;
            const bx = b.x;
            a.x -= push;
            collideXPush(a, ax);
            b.x += push;
            collideXPush(b, bx);
          }
        }
        ranked.sort(rankCmp);
        const sc = scoreOf(you);
        if (sc !== lastScore) { lastScore = sc; api.setScore(sc); }
        if (!you.alive) { endRace('The lava caught you.'); return; }
        if (you.finished) { endRace('You reached the summit flag!'); return; }
      }

      /* After a bump, undo the move if it pushed someone into a block. */
      function collideXPush(p, oldX) {
        const top = Math.floor((p.y - CH + 1) / T);
        const bot = Math.floor((p.y - 1) / T);
        const c0 = Math.floor((p.x - CW / 2) / T);
        const c1 = Math.floor((p.x + CW / 2) / T);
        for (let r = top; r <= bot; r++) {
          if (solid(c0, r) || solid(c1, r)) { p.x = oldX; return; }
        }
      }

      /* ---------- Render ---------- */
      function drawBackground() {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        const k = camY / (ROWS * T);
        g.addColorStop(0, k < 0.3 ? '#0B0A1E' : '#120F2A');
        g.addColorStop(1, '#22163A');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // Far cliffs (slow parallax), near cliffs (faster).
        for (let layer = 0; layer < 2; layer++) {
          const f = layer === 0 ? 0.12 : 0.35;
          const period = layer === 0 ? 520 : 380;
          ctx.fillStyle = layer === 0 ? '#17132F' : '#1E1838';
          const off = ((camY * f) % period + period) % period;
          for (let i = 0; i < bgCols.length; i++) {
            const b = bgCols[i];
            if ((i % 2) !== layer) continue;
            for (let y = -off - period; y < H + period; y += period) {
              const yy = y + (i * 97) % period;
              ctx.fillRect(b.x, yy, b.w, b.h);
              ctx.fillRect(b.x - 8, yy + b.h * 0.3, b.w + 16, 10);
            }
          }
        }
      }

      function drawTiles() {
        const r0 = Math.max(0, Math.floor(camY / T));
        const r1 = Math.min(ROWS - 1, Math.floor((camY + H) / T) + 1);
        for (let r = r0; r <= r1; r++) {
          const y = r * T - camY;
          for (let c = 0; c < COLS; c++) {
            const t = grid[r * COLS + c];
            if (t) {
              drawBlock(ctx, t, c * T, y, t === BRICK ? COLORS[Math.max(0, owner[r * COLS + c])] : null, t === DIRT && r > 0 && !grid[(r - 1) * COLS + c]);
            } else if (coin[r * COLS + c]) {
              const s = Math.abs(Math.cos(clock * 3 + c + r));
              ctx.fillStyle = U.alpha(C.gold, 0.25);
              ctx.beginPath();
              ctx.arc(c * T + T / 2, y + T / 2, 11, 0, TAU);
              ctx.fill();
              ctx.fillStyle = C.gold;
              ctx.beginPath();
              ctx.ellipse(c * T + T / 2, y + T / 2, 8 * s + 1, 9, 0, 0, TAU);
              ctx.fill();
            }
          }
        }
        // Summit flag.
        const fy = SUMMIT_ROW * T - camY;
        if (fy > -120 && fy < H + 20) {
          ctx.fillStyle = '#C9C3E8';
          ctx.fillRect(FLAG_COL * T + 2, fy - 96, 4, 96);
          ctx.fillStyle = C.mint;
          ctx.beginPath();
          ctx.moveTo(FLAG_COL * T + 6, fy - 94);
          ctx.lineTo(FLAG_COL * T + 46 + Math.sin(clock * 6) * 4, fy - 82);
          ctx.lineTo(FLAG_COL * T + 6, fy - 66);
          ctx.closePath();
          ctx.fill();
        }
        // Mining cracks.
        for (const p of climbers) {
          if (!p.mining || p.mineC < 0) continue;
          const t = cell(p.mineC, p.mineR);
          const k = U.clamp(p.mineT / HARD[t], 0, 1);
          const x = p.mineC * T;
          const y = p.mineR * T - camY;
          ctx.strokeStyle = 'rgba(15,13,36,0.85)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 16 - 12 * k, y + 4);
          ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 16 + 13 * k, y + 16 + 10 * k);
          if (k > 0.4) { ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 6, y + 16 + 12 * k); }
          if (k > 0.7) { ctx.moveTo(x + 16, y + 16); ctx.lineTo(x + 28, y + 4); }
          ctx.stroke();
        }
      }

      function drawCursor() {
        if (state !== 'play' || !you.alive || you.finished) return;
        const c = Math.floor(mouseX / T);
        const r = Math.floor((mouseY + camY) / T);
        if (c <= 0 || c >= COLS - 1) return;
        const ok = inReach(you, c, r);
        const t = cell(c, r);
        const y = r * T - camY;
        ctx.strokeStyle = ok ? (t === EMPTY ? U.alpha(C.mint, 0.7) : 'rgba(243,240,255,0.8)') : 'rgba(255,93,115,0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash(t === EMPTY ? [5, 4] : []);
        ctx.strokeRect(c * T + 1, y + 1, T - 2, T - 2);
        ctx.setLineDash([]);
        if (ok && t === EMPTY && you.blocks > 0) {
          ctx.fillStyle = U.alpha(you.color, 0.18);
          ctx.fillRect(c * T + 2, y + 2, T - 4, T - 4);
        }
      }

      function drawClimbers() {
        for (const p of climbers) {
          if (!p.alive) continue;
          const y = p.y - camY;
          if (y < -60 || y > H + 60) continue;
          drawClimber(ctx, p.x, y, p.color, p.facing, clock, { run: p.run, mine: p.mining, punch: p.punchAnim, stun: p.stun });
          ctx.font = TINY;
          ctx.textAlign = 'center';
          ctx.fillStyle = p === you ? C.text : U.alpha(p.color, 0.9);
          ctx.fillText(p === you ? 'YOU' : p.name, p.x, y - CH - 8);
          if (p.finished) {
            ctx.fillStyle = C.gold;
            ctx.fillText(['1st', '2nd', '3rd', '4th'][p.place - 1], p.x, y - CH - 20);
          }
        }
      }

      function drawLava() {
        const ly = lavaY - camY;
        if (ly > H + 60) return;
        const g = ctx.createLinearGradient(0, ly - 160, 0, ly);
        g.addColorStop(0, 'rgba(255,122,61,0)');
        g.addColorStop(1, 'rgba(255,122,61,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(0, ly - 160, W, 160);
        ctx.fillStyle = '#C2361F';
        ctx.fillRect(0, ly + 8, W, Math.max(0, H - ly));
        ctx.fillStyle = '#FF7A3D';
        ctx.beginPath();
        ctx.moveTo(0, H + 10);
        for (let x = 0; x <= W; x += 24) ctx.lineTo(x, ly + Math.sin(x * 0.03 + clock * 2.5) * 5 + Math.sin(x * 0.11 - clock * 4) * 2);
        ctx.lineTo(W, H + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#FFC53D';
        for (let i = 0; i < 9; i++) {
          const x = (i * 113 + clock * 30) % W;
          const s = (Math.sin(clock * 2 + i) + 1) * 3;
          ctx.beginPath();
          ctx.arc(x, ly + 14 + (i % 3) * 10, s, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(255,197,61,0.7)';
        for (const e of embers) ctx.fillRect(e.x, ly - e.y, e.s, e.s);
      }

      function drawParts() {
        for (const p of parts) {
          if (!p.on) continue;
          ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - camY - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      function drawHud() {
        // Bag.
        const slot = 34;
        const bx = W / 2 - (BAG * slot) / 2;
        const by = H - 50;
        ctx.fillStyle = 'rgba(15,13,36,0.85)';
        U.roundRect(ctx, bx - 10, by - 10, BAG * slot + 20, slot + 20, 10);
        ctx.fill();
        for (let i = 0; i < BAG; i++) {
          const x = bx + i * slot + 2;
          ctx.fillStyle = 'rgba(243,240,255,0.08)';
          ctx.fillRect(x, by, slot - 4, slot - 4);
          if (i < you.blocks) drawMiniBrick(x + 2, by + 2, slot - 8, you.color);
        }
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = you.blocks === 0 ? C.p1 : you.blocks === BAG ? C.gold : C.text;
        ctx.fillText(you.blocks + '/' + BAG, bx + BAG * slot + 18, by + slot / 2 - 2);
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        ctx.fillText('BAG', bx - 18, by + slot / 2 - 2);
        // Height + coins.
        ctx.fillStyle = 'rgba(15,13,36,0.85)';
        U.roundRect(ctx, 12, 12, 200, 52, 10);
        ctx.fill();
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.mint;
        ctx.fillText(heightOf(you) + ' m', 24, 32);
        ctx.fillStyle = C.gold;
        ctx.textAlign = 'right';
        ctx.fillText('● ' + you.coins, 200, 32);
        ctx.font = TINY;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('SUMMIT AT ' + (START_ROW - SUMMIT_ROW + 1) + ' m', 24, 52);
        const lavaBelow = Math.max(0, Math.round((lavaY - you.y) / T));
        ctx.textAlign = 'right';
        ctx.fillStyle = lavaBelow < 5 ? C.p1 : C.muted;
        ctx.fillText('LAVA −' + lavaBelow + ' m', 200, 52);
        // Leaderboard.
        const lw = 190;
        const lx = W - lw - 52;
        ctx.fillStyle = 'rgba(15,13,36,0.85)';
        U.roundRect(ctx, lx, 12, lw, 26 + ranked.length * 18, 10);
        ctx.fill();
        ctx.font = TINY;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('RACE', lx + 10, 24);
        for (let i = 0; i < ranked.length; i++) {
          const p = ranked[i];
          const y = 42 + i * 18;
          if (p === you) {
            ctx.fillStyle = U.alpha(C.p1, 0.16);
            ctx.fillRect(lx + 4, y - 8, lw - 8, 16);
          }
          ctx.fillStyle = p.alive ? p.color : U.alpha(p.color, 0.35);
          ctx.fillRect(lx + 10, y - 4, 8, 8);
          ctx.font = SMALL;
          ctx.textAlign = 'left';
          ctx.fillStyle = p.alive ? (p === you ? C.text : C.muted) : U.alpha(C.muted, 0.5);
          const nm = p.name.length > 13 ? p.name.slice(0, 12) + '…' : p.name;
          ctx.fillText((i + 1) + ' ' + nm, lx + 24, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = p.finished ? C.gold : p.alive ? C.text : C.p1;
          ctx.fillText(p.finished ? 'flag' : p.alive ? heightOf(p) + 'm' : 'out', lx + lw - 10, y);
        }
        // Tower progress bar.
        const tx = W - 28;
        const top = 16;
        const bot = H - 16;
        ctx.fillStyle = 'rgba(15,13,36,0.85)';
        U.roundRect(ctx, tx - 10, top - 6, 20, bot - top + 12, 8);
        ctx.fill();
        const yOf = (row) => top + (bot - top) * U.clamp((row - SUMMIT_ROW) / (START_ROW - SUMMIT_ROW), 0, 1);
        const lr = lavaY / T;
        ctx.fillStyle = 'rgba(255,122,61,0.7)';
        ctx.fillRect(tx - 4, yOf(lr), 8, bot - yOf(lr));
        ctx.fillStyle = C.mint;
        ctx.fillRect(tx - 6, top - 2, 12, 4);
        ctx.strokeStyle = 'rgba(243,240,255,0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx - 6 + 0.5, yOf(camY / T), 11, (bot - top) * (H / T) / (START_ROW - SUMMIT_ROW));
        for (const p of climbers) {
          if (!p.alive && !p.finished) continue;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(tx, yOf(p.y / T), p === you ? 5 : 3.5, 0, TAU);
          ctx.fill();
        }
        // Off-screen rivals.
        ctx.font = TINY;
        for (const p of climbers) {
          if (p === you || !p.alive || p.finished) continue;
          const y = p.y - camY;
          if (y > -10 && y < H + 50) continue;
          const up = y <= -10;
          const ay = up ? 74 : H - 70;
          ctx.fillStyle = U.alpha(p.color, 0.9);
          ctx.beginPath();
          ctx.moveTo(p.x, up ? ay - 8 : ay + 8);
          ctx.lineTo(p.x - 6, ay);
          ctx.lineTo(p.x + 6, ay);
          ctx.closePath();
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.fillText(p.name + ' ' + Math.abs(Math.round((p.y - you.y) / T)) + 'm', p.x, up ? ay + 10 : ay - 6);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function drawMiniBrick(x, y, s, color) {
        ctx.fillStyle = color;
        ctx.fillRect(x, y, s, s);
        ctx.fillStyle = 'rgba(15,13,36,0.35)';
        ctx.fillRect(x, y + s / 2 - 1, s, 2);
        ctx.fillRect(x + s / 2 - 1, y, 2, s / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y, s, 2);
      }

      function drawBanner(text, color, sub) {
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,0.6)';
        ctx.fillText(text, W / 2 + 3, H / 2 - 97);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2 - 100);
        if (sub) {
          ctx.font = HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(sub, W / 2, H / 2 - 58);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 26, (Math.random() - 0.5) * shake * 26);
        drawBackground();
        drawTiles();
        if (you) {
          drawCursor();
          drawClimbers();
        }
        drawParts();
        drawLava();
        ctx.restore();
        if (!you) return;
        drawHud();
        if (state === 'count') drawBanner(String(Math.max(1, Math.ceil(countT))), C.gold, 'Climb to the flag. Mind the lava.');
        else if (goT > 0) drawBanner('Go!', C.mint, null);
        else if (banner) drawBanner(banner.text, banner.color, null);
      }

      generate();
      camY = ROWS * T - H;
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
