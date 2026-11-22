/* Mirror Run — one set of controls steers two runners: the one below lives upside down and moves the opposite way. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;

  /* SIM-START: pure level + physics code (no api, no DOM), so it can be tested headless. */
  const T = 30;                 // tile size
  const COLS = 32;
  const ROWS = 10;
  const WW = COLS * T;          // 960: world width
  const WH = ROWS * T;          // 300: one world's height
  const RW = 18;                // runner box
  const RH = 26;
  const RUN = 210;
  const ACC_G = 2600;
  const DEC_G = 3200;
  const ACC_A = 1700;
  const GRAV = 2200;
  const JUMP = 600;
  const MAXFALL = 900;
  const CUT = 2.6;              // extra gravity while rising with jump released (variable jump height)
  const COYOTE = 0.1;
  const BUFFER = 0.13;
  const CRUMBLE = 0.45;         // seconds from first touch to collapse
  const CRUMBLE_BACK = 3;       // seconds until a crumbled tile returns
  const FLAG_HOLD = 0.6;        // both on flags this long clears the level
  const SUB = 1 / 120;
  const EMPTY = 0;
  const SOLID = 1;
  const SPIKE = 2;
  const SPIKE_DN = 3;
  const CRUMB = 4;
  const DOOR = 5;
  const SWITCH = 6;

  /* Worlds are written in local coordinates with gravity pointing down (row 9 is the floor next to
     the mirror line). The bottom world is drawn flipped. Legend: # solid, ^ spikes, v hanging spikes,
     ~ crumbling tile, S/T gold/mint switch (flips doors of that colour in the OTHER world),
     D/E closed gold/mint door, d/e open door, P start, F flag. */
  const E = '................................';
  const F = '################################';
  const LEVELS = [
    {
      name: 'Two of you', par: 12,
      hint: 'Hold → : the top runner goes right, the mirrored one goes left. Get both onto their flags.',
      top: [E, E, E, E, E, E, E,
        '..........#.........##..........',
        '.P........#.........##.........F',
        F],
      bot: [E, E, E, E, E, E, E,
        '..........##.........#..........',
        'F.........##.........#........P.',
        F]
    },
    {
      name: 'Sharp edges', par: 15,
      hint: 'Spikes rewind the level. One jump button lifts both runners, so watch both worlds.',
      top: [E, E, E, E, E, E, E, E,
        '.P........^^..........^........F',
        F],
      bot: [E, E, E, E, E, E, E, E,
        'F...^.........^^.........^....P.',
        F]
    },
    {
      name: 'Crosswired', par: 15,
      hint: 'A switch flips the doors of its colour in the OTHER world.',
      top: [E, E, E, E, E, E,
        '....................D...........',
        '....................D...........',
        '.P..........T.......D..........F',
        F],
      bot: [E, E, E, E, E, E,
        '........E.......................',
        '........E.......................',
        'F.......E................S....P.',
        F]
    },
    {
      name: 'Out of step', par: 20,
      hint: 'Push a runner into a wall: it waits while the other one keeps walking.',
      top: [E, E, E, E, E, E,
        '...#............................',
        '...#............................',
        '...#..P......^...........F......',
        F],
      bot: [E, E, E, E, E, E, E, E,
        '..........F......^.......P......',
        F]
    },
    {
      name: 'Thin ice', par: 20,
      hint: 'Crumbling tiles give way a moment after you touch them. Line up first, then keep moving.',
      top: [E, E, E, E, E, E,
        '..#.............................',
        '..#.............................',
        '..#.P........................F..',
        '#########~~~~~~#################'],
      bot: [E, E, E, E, E, E, E, E,
        '.....F.....................P....',
        '#################~~~~###########']
    },
    {
      name: 'Backpedal', par: 22,
      hint: 'Sometimes the way forward starts by walking the other way.',
      top: [E, E, E, E, E, E,
        '............................#...',
        '............................#...',
        '..F...^^..P.........^^......#...',
        F],
      bot: [E, E, E, E, E, E,
        '.#..............................',
        '.#..............................',
        '.#............^^....P......F....',
        F]
    },
    {
      name: 'Relay', par: 25,
      hint: 'Each world holds the key to the other one’s door.',
      top: [E, E, E, E, E, E,
        '............D.............#.....',
        '............D.............#.....',
        '....F.......D....T..P.....#.....',
        F],
      bot: [E, E, E, E, E, E,
        '..#.................E...........',
        '..#.................E...........',
        '..#.......P...S.....E...F.......',
        F]
    },
    {
      name: 'Ferry', par: 25,
      hint: 'Ride the platform. While it carries one runner, the other one stays put.',
      top: [E, E, E, E, E, E, E, E,
        '.P.............................F',
        '#######^^^^^^^^^^^^^^^##########'],
      bot: [E, E, E, E, E, E,
        '.....................#..........',
        '.....................#..........',
        '.....................#F.......P.',
        F],
      movers: [{ w: 0, x: 7, y: 8, len: 2, dx: 13, dy: 0, period: 5 }]
    },
    {
      name: 'Low ceiling', par: 25,
      hint: 'Never jump while the bottom runner stands under the hanging spikes.',
      top: [E, E,
        '.............................#..',
        '.............................#..',
        '.............................#..',
        '........................F....#..',
        '................################',
        '...............#################',
        '..P...........##################',
        F],
      bot: [E, E, E, E, E,
        '..............#######...........',
        '...#..........vvvvvvv...........',
        '...#............................',
        '...#....F.................P.....',
        F]
    },
    {
      name: 'Shut the door', par: 25,
      hint: 'A closed door is a wall too. Close it before you need it.',
      top: [E, E, E, E, E, E,
        '.......................d........',
        '.......................d........',
        '....^^........P.....F..d........',
        F],
      bot: [E, E, E, E, E, E,
        '..#........#####################',
        '..#........#####################',
        '..#.PF....S#####################',
        F]
    },
    {
      name: 'Stepping stones', par: 25,
      hint: 'The stones crumble. Get in step before you cross.',
      top: [E, E, E, E, E, E, E, E,
        '.P........~~..~~...........F....',
        '########^^^^^^^^^^##############'],
      bot: [E, E, E, E, E, E, E, E,
        '....F........................P..',
        '#########...####################']
    },
    {
      name: 'Two rides', par: 40,
      hint: 'Park one runner against a wall so the other can travel alone.',
      top: [E,
        '..............................#.',
        '..............................#.',
        '..........................F...#.',
        '.................###############',
        E, E, E,
        '..P.............................',
        F],
      bot: [E, E, E, E, E, E,
        '.#..............................',
        '.#..............................',
        '.#...F......................P...',
        '#######............#############'],
      movers: [
        { w: 0, x: 15, y: 8, len: 2, dx: 0, dy: -4, period: 4 },
        { w: 1, x: 7, y: 8, len: 2, dx: 10, dy: 0, period: 5 }
      ]
    },
    {
      name: 'Gatekeepers', par: 35,
      hint: 'Each runner can close the other one’s door. Use those doors as walls.',
      top: [E, E, E, E, E, E,
        '........d............###########',
        '........d............###########',
        '...^....d......FP...T###########',
        F],
      bot: [E, E, E, E, E, E,
        '..#.........e...........########',
        '..#.........e...........########',
        '..#.........e....FP....S########',
        F]
    },
    {
      name: 'Night ferry', par: 40,
      hint: 'Ferry, switch and hanging spikes. Think before you jump.',
      top: [E, E, E, E, E,
        '.........#####..................',
        '##.......vvvvv......D.........#.',
        '##..................D.........#.',
        '##.P................D.....F...#.',
        F],
      bot: [E, E, E, E, E, E,
        '.#..............................',
        '.#..............................',
        '.#...FS..................^^..P..',
        '#########..........#############'],
      movers: [{ w: 1, x: 17, y: 8, len: 2, dx: -8, dy: 0, period: 5 }]
    },
    {
      name: 'Mirror master', par: 40,
      hint: 'Everything at once. Wait at doors, mind the ceiling, climb, then line up.',
      top: [E, E, E, E,
        '...............................#',
        '...............................#',
        '..................D........F...#',
        '..................D.....########',
        '.P..........T.....D...##########',
        '######~~~~######################'],
      bot: [E, E, E, E, E,
        '.............#####..............',
        '..#......E...vvvvv..............',
        '..#......E......................',
        '..#.S.F..E...................P..',
        F]
    }
  ];

  function parseLevel(def) {
    const worlds = [def.top, def.bot].map((rows) => {
      const grid = [];
      const idx = [];
      const doors = [];
      const switches = [];
      const crumbles = [];
      let start = { x: T + (T - RW) / 2, y: (ROWS - 1) * T - RH };
      let flag = { c: COLS - 1, r: ROWS - 2 };
      for (let r = 0; r < ROWS; r++) {
        const line = rows[r] || '';
        grid.push([]);
        idx.push([]);
        for (let c = 0; c < COLS; c++) {
          const ch = line[c] || '.';
          let k = EMPTY;
          let i = -1;
          if (ch === '#') k = SOLID;
          else if (ch === '^') k = SPIKE;
          else if (ch === 'v') k = SPIKE_DN;
          else if (ch === '~') {
            k = CRUMB;
            i = crumbles.length;
            crumbles.push({ c, r });
          } else if ('DdEe'.indexOf(ch) >= 0) {
            k = DOOR;
            i = doors.length;
            doors.push({ c, r, ch: ch === 'D' || ch === 'd' ? 0 : 1, open: ch === 'd' || ch === 'e' });
          } else if (ch === 'S' || ch === 'T') {
            k = SWITCH;
            i = switches.length;
            switches.push({ c, r, ch: ch === 'S' ? 0 : 1 });
          } else if (ch === 'P') start = { x: c * T + (T - RW) / 2, y: (r + 1) * T - RH };
          else if (ch === 'F') flag = { c, r };
          grid[r].push(k);
          idx[r].push(i);
        }
      }
      return { grid, idx, doors, switches, crumbles, start, flag };
    });
    const movers = (def.movers || []).map((m) => Object.assign({ len: 2, period: 4, phase: 0, dx: 0, dy: 0 }, m));
    return { def, worlds, movers };
  }

  function moverPos(m, t) {
    const f = (1 - Math.cos(2 * Math.PI * (t / m.period + m.phase))) / 2;
    return { x: (m.x + m.dx * f) * T, y: (m.y + m.dy * f) * T };
  }

  function newState(L) {
    return {
      t: 0,
      meter: 0,
      done: false,
      dead: -1,
      r: L.worlds.map((W, w) => ({
        x: W.start.x, y: W.start.y, vx: 0, vy: 0, ground: true, coyote: 0, buf: 0,
        face: w === 0 ? 1 : -1, ride: -1, onFlag: false, over: W.switches.map(() => false)
      })),
      flip: [[false, false], [false, false]],
      ghost: L.worlds.map((W) => W.doors.map(() => false)),
      crumb: L.worlds.map((W) => W.crumbles.map(() => ({ t: 0, gone: 0 }))),
      mov: L.movers.map((m) => {
        const p = moverPos(m, 0);
        return { x: p.x, y: p.y, dx: 0, dy: 0 };
      })
    };
  }

  function doorOpen(L, S, w, i) {
    const d = L.worlds[w].doors[i];
    return d.open !== S.flip[w][d.ch];
  }

  function solidAt(L, S, w, c, r) {
    if (c < 0 || c >= COLS || r < 0) return true;
    if (r >= ROWS) return false;
    const W = L.worlds[w];
    const k = W.grid[r][c];
    if (k === SOLID) return true;
    if (k === CRUMB) return S.crumb[w][W.idx[r][c]].gone <= 0;
    if (k === DOOR) {
      const i = W.idx[r][c];
      return !doorOpen(L, S, w, i) && !S.ghost[w][i];
    }
    return false;
  }

  function overlaps(R, x, y, w, h) {
    return R.x < x + w && R.x + RW > x && R.y < y + h && R.y + RH > y;
  }

  function moveX(L, S, w, R, dx) {
    if (!dx) return;
    R.x += dx;
    const r0 = Math.floor(R.y / T);
    const r1 = Math.floor((R.y + RH - 0.001) / T);
    if (dx > 0) {
      const c = Math.floor((R.x + RW - 0.001) / T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, S, w, c, r)) { R.x = c * T - RW; R.vx = 0; return; }
      }
    } else {
      const c = Math.floor(R.x / T);
      for (let r = r0; r <= r1; r++) {
        if (solidAt(L, S, w, c, r)) { R.x = (c + 1) * T; R.vx = 0; return; }
      }
    }
  }

  function moveY(L, S, w, R, dy) {
    if (!dy) return false;
    R.y += dy;
    const c0 = Math.floor(R.x / T);
    const c1 = Math.floor((R.x + RW - 0.001) / T);
    if (dy > 0) {
      const r = Math.floor((R.y + RH - 0.001) / T);
      for (let c = c0; c <= c1; c++) {
        if (solidAt(L, S, w, c, r)) { R.y = r * T - RH; return true; }
      }
    } else {
      const r = Math.floor(R.y / T);
      for (let c = c0; c <= c1; c++) {
        if (solidAt(L, S, w, c, r)) { R.y = (r + 1) * T; return true; }
      }
    }
    return false;
  }

  function runnerStep(L, S, w, inp, h, ev) {
    const W = L.worlds[w];
    const R = S.r[w];
    const d = w === 0 ? inp.dir : -inp.dir;   // the mirror: bottom runner gets the opposite direction
    if (R.ride >= 0) {
      const m = S.mov[R.ride];
      moveX(L, S, w, R, m.dx);
      moveY(L, S, w, R, m.dy);
    }
    if (d) R.face = d;
    const target = d * RUN;
    const a = R.ground ? (d ? ACC_G : DEC_G) : ACC_A;
    R.vx = R.vx < target ? Math.min(target, R.vx + a * h) : Math.max(target, R.vx - a * h);
    R.coyote = R.ground ? COYOTE : R.coyote - h;
    if (R.buf > 0 && R.coyote > 0) {
      R.vy = -JUMP;
      R.buf = 0;
      R.coyote = 0;
      R.ground = false;
      R.ride = -1;
      ev.push({ type: 'jump', w });
    }
    R.buf -= h;
    R.vy = Math.min(MAXFALL, R.vy + (R.vy < 0 && !inp.held ? GRAV * CUT : GRAV) * h);
    moveX(L, S, w, R, R.vx * h);
    const wasGround = R.ground;
    const vyIn = R.vy;
    const prevBottom = R.y + RH;
    R.ground = false;
    R.ride = -1;
    if (moveY(L, S, w, R, R.vy * h)) {
      if (vyIn > 0) R.ground = true;
      R.vy = 0;
    }
    if (!R.ground && vyIn >= 0) {
      for (let k = 0; k < L.movers.length; k++) {
        const m = L.movers[k];
        if (m.w !== w) continue;
        const p = S.mov[k];
        if (R.x + RW > p.x && R.x < p.x + m.len * T && prevBottom <= p.y + 4 && R.y + RH >= p.y) {
          R.y = p.y - RH;
          R.vy = 0;
          R.ground = true;
          R.ride = k;
          break;
        }
      }
    }
    if (R.ground && !wasGround && vyIn > 300) ev.push({ type: 'land', w, v: vyIn });

    // Hazards: pits and spikes.
    if (R.y > WH + 24) {
      S.dead = w;
      ev.push({ type: 'die', w });
      return;
    }
    const c0 = Math.max(0, Math.floor(R.x / T));
    const c1 = Math.min(COLS - 1, Math.floor((R.x + RW) / T));
    const r0 = Math.max(0, Math.floor(R.y / T));
    const r1 = Math.min(ROWS - 1, Math.floor((R.y + RH) / T));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = W.grid[r][c];
        if (k !== SPIKE && k !== SPIKE_DN) continue;
        const sy = k === SPIKE ? r * T + 13 : r * T;
        if (R.x + 2 < c * T + T - 5 && R.x + RW - 2 > c * T + 5 && R.y + 2 < sy + T - 13 && R.y + RH - 1 > sy) {
          S.dead = w;
          ev.push({ type: 'die', w });
          return;
        }
      }
    }

    // Switches flip doors of their colour in the other world (on first touch).
    for (let i = 0; i < W.switches.length; i++) {
      const sw = W.switches[i];
      const on = overlaps(R, sw.c * T + 6, sw.r * T + 8, T - 12, T - 8);
      if (on && !R.over[i]) {
        const o = 1 - w;
        S.flip[o][sw.ch] = !S.flip[o][sw.ch];
        L.worlds[o].doors.forEach((dd, j) => {
          // A door never closes on a runner: it stays passable until they step out.
          if (dd.ch === sw.ch && !doorOpen(L, S, o, j) && overlaps(S.r[o], dd.c * T, dd.r * T, T, T)) S.ghost[o][j] = true;
        });
        ev.push({ type: 'switch', w, i, ch: sw.ch });
      }
      R.over[i] = on;
    }
    for (let j = 0; j < W.doors.length; j++) {
      const dd = W.doors[j];
      if (S.ghost[w][j] && !overlaps(R, dd.c * T, dd.r * T, T, T)) S.ghost[w][j] = false;
    }

    // Crumbling tiles start to go once stood on.
    if (R.ground && R.ride < 0) {
      const fr = Math.floor((R.y + RH + 1) / T);
      if (fr < ROWS) {
        for (let c = Math.floor(R.x / T); c <= Math.floor((R.x + RW - 0.001) / T); c++) {
          if (c < 0 || c >= COLS || W.grid[fr][c] !== CRUMB) continue;
          const cs = S.crumb[w][W.idx[fr][c]];
          if (cs.gone <= 0 && cs.t === 0) {
            cs.t = 0.0001;
            ev.push({ type: 'crack', w, c, r: fr });
          }
        }
      }
    }

    const f = W.flag;
    R.onFlag = R.ground && Math.abs(R.x + RW / 2 - (f.c * T + T / 2)) < 16 && Math.abs(R.y + RH - (f.r + 1) * T) < 2;
  }

  function subStep(L, S, inp, h, ev) {
    S.t += h;
    for (let k = 0; k < L.movers.length; k++) {
      const p = moverPos(L.movers[k], S.t);
      const st = S.mov[k];
      st.dx = p.x - st.x;
      st.dy = p.y - st.y;
      st.x = p.x;
      st.y = p.y;
    }
    for (let w = 0; w < 2; w++) {
      const W = L.worlds[w];
      for (let i = 0; i < W.crumbles.length; i++) {
        const cs = S.crumb[w][i];
        const cr = W.crumbles[i];
        if (cs.gone > 0) {
          cs.gone -= h;
          if (cs.gone <= 0 && overlaps(S.r[w], cr.c * T, cr.r * T, T, T)) cs.gone = 0.1;
        } else if (cs.t > 0) {
          cs.t += h;
          if (cs.t >= CRUMBLE) {
            cs.t = 0;
            cs.gone = CRUMBLE_BACK;
            ev.push({ type: 'break', w, c: cr.c, r: cr.r });
          }
        }
      }
    }
    for (let w = 0; w < 2; w++) {
      runnerStep(L, S, w, inp, h, ev);
      if (S.dead >= 0) return;
    }
    const both = S.r[0].onFlag && S.r[1].onFlag;
    S.meter = both ? S.meter + h / FLAG_HOLD : Math.max(0, S.meter - h * 2);
    if (S.meter >= 1) {
      S.meter = 1;
      S.done = true;
      ev.push({ type: 'clear' });
    }
  }

  /* Advance the level by dt seconds. inp = { dir: -1|0|1, press: jump pressed this frame, held: jump held }. */
  function stepSim(L, S, inp, dt, ev) {
    if (S.done || S.dead >= 0) return;
    if (inp.press) {
      S.r[0].buf = BUFFER;
      S.r[1].buf = BUFFER;
    }
    const n = Math.max(1, Math.ceil(dt / SUB - 1e-6));
    const h = dt / n;
    for (let i = 0; i < n && !S.done && S.dead < 0; i++) subStep(L, S, inp, h, ev);
  }
  /* SIM-END */

  const PARSED = LEVELS.map(parseLevel);
  const W = WW;
  const H = WH * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const ACCENT = [C.p1, C.p2];
  const CHAN = [C.gold, C.mint];
  const CHAN_NAME = ['gold', 'mint'];
  const SKY = ['#17143C', '#120F30'];
  let unlocked = 1; // levels unlock as you clear them; kept for this page session

  function drawRunnerShape(ctx, cx, by, w, h, color, face) {
    ctx.fillStyle = color;
    U.roundRect(ctx, cx - w / 2, by - h, w, h, Math.min(6, w / 3));
    ctx.fill();
    ctx.fillStyle = U.alpha('#FFFFFF', 0.22);
    U.roundRect(ctx, cx - w / 2 + 3, by - h + 3, w * 0.35, h * 0.45, 3);
    ctx.fill();
    ctx.fillStyle = C.ink;
    const ey = by - h + h * 0.26;
    const ex = cx + face * w * 0.18;
    ctx.fillRect(ex - w * 0.24, ey, Math.max(2, w * 0.14), h * 0.2);
    ctx.fillRect(ex + w * 0.1, ey, Math.max(2, w * 0.14), h * 0.2);
  }

  function drawFlagShape(ctx, fx, fy, color, wave) {
    ctx.fillStyle = C.text;
    ctx.fillRect(fx - 1, fy - 28, 2, 28);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(fx + 1, fy - 28);
    ctx.quadraticCurveTo(fx + 9, fy - 27 + wave, fx + 16, fy - 23 + wave);
    ctx.quadraticCurveTo(fx + 9, fy - 19 + wave, fx + 1, fy - 17);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.line;
    ctx.fillRect(fx - 5, fy - 3, 10, 3);
  }

  function drawSpikeShape(ctx, x, y, size, down) {
    const n = 3;
    const bw = (size - 6) / n;
    ctx.fillStyle = C.muted;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const bx = x + 3 + i * bw;
      if (down) {
        ctx.moveTo(bx, y);
        ctx.lineTo(bx + bw / 2, y + size * 0.6);
        ctx.lineTo(bx + bw, y);
      } else {
        ctx.moveTo(bx, y + size);
        ctx.lineTo(bx + bw / 2, y + size * 0.4);
        ctx.lineTo(bx + bw, y + size);
      }
    }
    ctx.fill();
    ctx.fillStyle = C.p1;
    for (let i = 0; i < n; i++) {
      const tx = x + 3 + i * bw + bw / 2;
      const ty = down ? y + size * 0.6 : y + size * 0.4;
      ctx.beginPath();
      ctx.arc(tx, ty + (down ? -2 : 2), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  Arcade.register({
    id: 'mirror-run',
    title: 'Mirror Run',
    category: 'fresh',
    mode: 'solo',
    players: '1P',
    best: 'high',
    original: true,
    color: C.violet,
    tagline: 'Guide two linked runners through mirrored worlds onto their flags.',
    hook: 'Steer two runners at once: the one below lives upside down and moves the opposite way.',
    tags: ['platformer', 'puzzle', 'mirror', 'levels', 'gravity', 'keyboard', 'brain'],
    howTo: 'One set of controls moves two runners. The coral runner walks the top world; the cyan runner hangs ' +
      'upside down in the world below and always moves the opposite way, and both jump together. Get both onto ' +
      'their flags at the same time to clear a level. Push a runner into a wall to make it wait while the other ' +
      'keeps walking: that is how you get them in step. Spikes and pits rewind the level, crumbling tiles give way, ' +
      'and a switch flips the doors of its colour in the other world. Each level scores 100 plus a time bonus ' +
      'for beating par. 15 levels; new ones unlock as you clear them.',
    controls: [
      { keys: ['←', '→'], label: 'Move (the bottom runner goes the other way)' },
      { keys: ['A', 'D'], label: 'Move' },
      { keys: ['Space', 'W', '↑'], label: 'Jump (both runners, hold for higher)' },
      { keys: ['R'], label: 'Rewind to the level start' },
      { keys: ['M'], label: 'Level menu' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = SKY[0];
      ctx.fillRect(0, 0, 320, 100);
      ctx.fillStyle = SKY[1];
      ctx.fillRect(0, 100, 320, 100);
      const s = 16;
      const run = (Math.sin(t * 1.4) + 1) / 2;
      for (let wi = 0; wi < 2; wi++) {
        const acc = ACCENT[wi];
        ctx.save();
        if (wi === 1) {
          ctx.translate(0, 200);
          ctx.scale(1, -1);
        }
        const glow = ctx.createLinearGradient(0, 100, 0, 40);
        glow.addColorStop(0, U.alpha(C.violet, 0.22));
        glow.addColorStop(1, U.alpha(C.violet, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, 40, 320, 60);
        for (let x = 0; x < 320; x += s) {
          ctx.fillStyle = C.panel2;
          ctx.fillRect(x, 84, s, 16);
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, 84.5, s - 1, 15);
        }
        ctx.fillStyle = U.alpha(acc, 0.8);
        ctx.fillRect(0, 84, 320, 3);
        // A block in each world, mirrored left to right.
        const bx = wi ? 176 : 128;
        ctx.fillStyle = C.panel2;
        ctx.fillRect(bx, 52, s, 32);
        ctx.fillStyle = U.alpha(acc, 0.8);
        ctx.fillRect(bx, 52, s, 3);
        // Spikes in the top world, a gold door in the bottom world.
        if (wi === 0) {
          drawSpikeShape(ctx, 208, 68, 16, false);
          drawSpikeShape(ctx, 224, 68, 16, false);
        } else {
          ctx.fillStyle = U.alpha(C.gold, 0.85);
          ctx.fillRect(80, 36, s, 48);
          ctx.fillStyle = U.alpha(C.ink, 0.3);
          for (let y = 40; y < 84; y += 8) ctx.fillRect(80, y, s, 3);
        }
        drawFlagShape(ctx, wi ? 30 : 290, 84, acc, Math.sin(t * 5 + wi) * 2);
        const rx = wi ? 268 - run * 56 : 52 + run * 56;
        const hop = Math.abs(Math.sin(t * 5)) * 3;
        drawRunnerShape(ctx, rx, 84 - hop, 13, 18, acc, wi ? -1 : 1);
        ctx.restore();
      }
      // The mirror line.
      ctx.fillStyle = U.alpha(C.violet, 0.35);
      ctx.fillRect(0, 97, 320, 6);
      ctx.fillStyle = C.violet;
      ctx.fillRect(0, 99, 320, 2);
      const sx = ((t * 120) % 440) - 60;
      ctx.fillStyle = U.alpha(C.text, 0.7);
      ctx.fillRect(sx, 99, 40, 2);
      // Opposite arrows over each runner.
      ctx.font = '800 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.p1;
      ctx.fillText('→', 52 + run * 56, 40);
      ctx.fillStyle = C.p2;
      ctx.fillText('←', 268 - run * 56, 160);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'rewind' | 'clear' | 'over'
      let lv = 0;
      let L = PARSED[0];
      let S = newState(L);
      let levelTime = 0;
      let deaths = 0;
      let runBest = {};
      let history = [];
      let rewind = null;
      let parts = [];
      let beams = [];
      let banner = null;
      let flash = 0;
      let flashColor = C.p1;
      let shake = 0;
      let pulse = 0;
      let jumpQueued = false;
      let ptr = null;
      let squash = [0, 0];
      let lastDir = 0;
      const seen = {};

      const total = () => Object.keys(runBest).reduce((n, k) => n + runBest[k], 0);
      const clearedCount = () => Object.keys(runBest).length;

      function hintOnce(key, text) {
        if (seen[key]) return;
        seen[key] = true;
        api.setStatus(text);
      }

      /* ---------- Flow ---------- */
      function loadLevel(i) {
        lv = U.clamp(i, 0, LEVELS.length - 1);
        L = PARSED[lv];
        S = newState(L);
        levelTime = 0;
        deaths = 0;
        history = [];
        rewind = null;
        parts = [];
        beams = [];
        squash = [0, 0];
        jumpQueued = false;
        ptr = null;
        state = 'play';
        banner = { text: L.def.name, t: 0 };
        api.setStatus('Level ' + (lv + 1) + ': ' + L.def.hint);
        api.setScore(total());
      }

      function startRun(i) {
        runBest = {};
        api.setScore(0);
        loadLevel(i);
      }

      function showStart() {
        state = 'menu';
        const buttons = [{ label: 'Play', primary: true, onClick: () => startRun(0) }];
        if (unlocked > 1) buttons.push({ label: 'Level select', onClick: () => showLevels(true, showStart) });
        api.menu({
          title: 'Mirror Run',
          text: 'One set of controls, two runners. The cyan one hangs upside down below the mirror and moves the ' +
            'opposite way. Get both onto their flags at the same time. ←/→ or A/D move, Space/W/↑ jumps.',
          buttons
        });
        api.setStatus('Steer two runners at once: the one below lives upside down and moves the opposite way.');
      }

      function showLevels(fresh, back) {
        state = 'menu';
        const buttons = [];
        for (let i = 0; i < unlocked; i++) {
          const done = !fresh && runBest[i];
          buttons.push({
            label: (done ? '✓ ' : '') + (i + 1),
            primary: i === unlocked - 1,
            onClick: () => (fresh ? startRun(i) : loadLevel(i))
          });
        }
        buttons.push({ label: 'Back', onClick: back });
        api.menu({
          title: 'Level select',
          text: unlocked + ' of ' + LEVELS.length + ' levels open. Clear a level to unlock the next.' +
            (fresh ? ' Picking a level starts a new run.' : ''),
          buttons
        });
      }

      function showPauseMenu() {
        state = 'menu';
        api.menu({
          title: 'Level ' + (lv + 1) + ': ' + L.def.name,
          text: 'Run score so far: ' + total() + ' from ' + clearedCount() + ' level' + (clearedCount() === 1 ? '' : 's') + '.',
          buttons: [
            { label: 'Resume', primary: true, onClick: () => { state = 'play'; } },
            { label: 'Restart level', onClick: () => loadLevel(lv) },
            { label: 'Level select', onClick: () => showLevels(false, showPauseMenu) },
            { label: 'End run', onClick: endRun }
          ]
        });
      }

      function showClearMenu(info) {
        state = 'menu';
        api.menu({
          title: 'Level ' + (lv + 1) + ' clear!',
          text: 'Time ' + info.time.toFixed(1) + 's (par ' + L.def.par + 's): 100 + time bonus ' + info.bonus +
            ' = ' + info.score + (info.improved ? '' : ' (you already scored ' + runBest[lv] + ' here)') +
            '. Run total: ' + total() + '.',
          buttons: [
            { label: 'Next level', primary: true, onClick: () => loadLevel(lv + 1) },
            { label: 'Replay', onClick: () => loadLevel(lv) },
            { label: 'Level select', onClick: () => showLevels(false, () => showClearMenu(info)) },
            { label: 'End run', onClick: endRun }
          ]
        });
      }

      function showOver(title, n, isBest) {
        state = 'over';
        const k = clearedCount();
        api.menu({
          title: isBest ? 'New best: ' + n + '!' : title,
          text: 'You cleared ' + k + ' level' + (k === 1 ? '' : 's') + ' for ' + n + ' point' + (n === 1 ? '' : 's') + '.' +
            (unlocked > 1 ? ' ' + unlocked + ' of ' + LEVELS.length + ' levels are open.' : ''),
          buttons: [
            { label: 'New run', primary: true, onClick: () => startRun(0) },
            { label: 'Level select', onClick: () => showLevels(true, () => showOver(title, n, isBest)) }
          ]
        });
      }

      function endRun() {
        const n = total();
        const isBest = api.reportScore(n);
        api.sfx(isBest ? 'win' : 'score');
        api.setStatus('Run over: ' + n + ' points.');
        showOver('Run over', n, isBest);
      }

      function finishAll() {
        const n = total();
        const isBest = api.reportScore(n);
        api.sfx('win');
        api.setStatus('All ' + LEVELS.length + ' levels cleared. Both runners made it home.');
        showOver('All ' + LEVELS.length + ' cleared!', n, isBest);
      }

      function onClear() {
        state = 'clear';
        const time = levelTime;
        const bonus = Math.max(0, Math.round(L.def.par - time)) * 5;
        const score = 100 + bonus;
        const improved = !runBest[lv] || score > runBest[lv];
        if (improved) runBest[lv] = score;
        unlocked = Math.max(unlocked, Math.min(LEVELS.length, lv + 2));
        api.setScore(total());
        api.sfx('win');
        flash = 0.5;
        flashColor = C.mint;
        for (let w = 0; w < 2; w++) {
          const f = L.worlds[w].flag;
          for (let i = 0; i < 26; i++) {
            parts.push({
              w, x: f.c * T + T / 2, y: (f.r + 1) * T - 20, vx: U.rand(-200, 200), vy: U.rand(-380, -60),
              life: U.rand(0.6, 1.1), max: 1.1, color: U.pick([C.gold, C.mint, ACCENT[w], C.text]), size: U.rand(2, 4), g: 700
            });
          }
        }
        api.setStatus('Both runners home! Level ' + (lv + 1) + ' clear in ' + time.toFixed(1) + 's.');
        const info = { time, bonus, score, improved };
        api.after(900, () => {
          if (state !== 'clear') return;
          if (lv === LEVELS.length - 1) finishAll();
          else showClearMenu(info);
        });
      }

      function startRewind() {
        rewind = { t: 0, dur: U.clamp(0.3 + (history.length / 4 / 60) * 0.06, 0.35, 0.8), hist: history };
        history = [];
        S = newState(L);
        beams = [];
        squash = [0, 0];
        state = 'rewind';
      }

      function die(w) {
        deaths++;
        flash = 0.9;
        flashColor = C.p1;
        shake = 1;
        api.sfx('lose');
        const R = S.r[w];
        for (let i = 0; i < 20; i++) {
          parts.push({
            w, x: R.x + RW / 2, y: Math.min(WH - 4, R.y + RH / 2), vx: U.rand(-240, 240), vy: U.rand(-340, 40),
            life: U.rand(0.4, 0.7), max: 0.7, color: ACCENT[w], size: U.rand(2, 4.5), g: 900
          });
        }
        hintOnce('die', 'Ouch! Spikes and pits rewind the level, but the clock keeps running. R rewinds on purpose.');
        startRewind();
      }

      /* ---------- Particles ---------- */
      function dust(w, n) {
        const R = S.r[w];
        for (let i = 0; i < n; i++) {
          parts.push({
            w, x: R.x + RW / 2 + U.rand(-8, 8), y: R.y + RH - 1, vx: U.rand(-90, 90), vy: U.rand(-90, -20),
            life: U.rand(0.25, 0.45), max: 0.45, color: U.alpha(C.text, 0.7), size: U.rand(1.5, 3), g: 300
          });
        }
      }

      function sparkle(w) {
        const f = L.worlds[w].flag;
        parts.push({
          w, x: f.c * T + T / 2 + U.rand(-14, 14), y: (f.r + 1) * T - U.rand(0, 30), vx: U.rand(-15, 15), vy: U.rand(-60, -20),
          life: 0.7, max: 0.7, color: U.pick([C.gold, ACCENT[w], C.text]), size: U.rand(1.5, 2.8), g: 0, star: true
        });
      }

      function debris(w, c, r) {
        for (let i = 0; i < 10; i++) {
          parts.push({
            w, x: c * T + U.rand(4, T - 4), y: r * T + U.rand(4, T - 4), vx: U.rand(-60, 60), vy: U.rand(-60, 80),
            life: U.rand(0.4, 0.8), max: 0.8, color: U.alpha(C.gold, 0.8), size: U.rand(2, 4), g: 900
          });
        }
      }

      /* ---------- Update ---------- */
      function handle(ev) {
        let jumped = false;
        for (const e of ev) {
          if (e.type === 'jump') {
            jumped = true;
            squash[e.w] = -0.3;
            dust(e.w, 4);
          } else if (e.type === 'land') {
            squash[e.w] = Math.min(0.4, e.v / 1800);
            dust(e.w, Math.min(10, Math.round(e.v / 100)));
            if (e.v > 700) api.sfx('tick');
          } else if (e.type === 'switch') {
            api.sfx('power');
            beams.push({ w: e.w, sw: L.worlds[e.w].switches[e.i], ch: e.ch, t: 0 });
            hintOnce('switch', 'That switch flipped every ' + CHAN_NAME[e.ch] + ' door in the other world.');
          } else if (e.type === 'crack') {
            api.sfx('tick');
          } else if (e.type === 'break') {
            api.sfx('hit');
            debris(e.w, e.c, e.r);
          } else if (e.type === 'die') {
            die(e.w);
            return;
          } else if (e.type === 'clear') {
            onClear();
            return;
          }
        }
        if (jumped) api.sfx('flip');
      }

      function updatePlay(dt) {
        const k = api.keys;
        let dir = (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) - (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
        let held = k.has('Space') || k.has('KeyW') || k.has('ArrowUp');
        if (ptr) {
          if (ptr.zone) dir = ptr.zone;
          else held = true;
        }
        lastDir = dir;
        const ev = [];
        stepSim(L, S, { dir, press: jumpQueued, held }, dt, ev);
        jumpQueued = false;
        levelTime += dt;
        history.push(S.r[0].x, S.r[0].y, S.r[1].x, S.r[1].y);
        if (history.length > 4 * 1200) history.splice(0, 4 * 120);
        handle(ev);
        if (state !== 'play') return;
        for (let w = 0; w < 2; w++) {
          if (S.r[w].onFlag && Math.random() < dt * 18) sparkle(w);
        }
        if (S.r[0].onFlag !== S.r[1].onFlag) {
          hintOnce('both', 'One runner is home. Both must stand on their flags at the same time.');
        }
        if (lastDir && !seen.mirror) {
          seen.mirror = true;
          api.setStatus('See the arrows: the bottom runner always moves the opposite way.');
        }
      }

      function update(dt) {
        pulse += dt;
        flash = Math.max(0, flash - dt * 2.4);
        shake = Math.max(0, shake - dt * 3.5);
        if (banner) {
          banner.t += dt;
          if (banner.t > 2) banner = null;
        }
        if (state === 'play') updatePlay(dt);
        else if (state === 'rewind') {
          rewind.t += dt;
          levelTime += dt;
          if (rewind.t >= rewind.dur) {
            rewind = null;
            jumpQueued = false;
            state = 'play';
          }
        }
        const decay = Math.exp(-12 * dt);
        squash[0] *= decay;
        squash[1] *= decay;
        for (const p of parts) {
          p.life -= dt;
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        parts = parts.filter((p) => p.life > 0);
        if (parts.length > 500) parts.splice(0, parts.length - 500);
        for (const b of beams) b.t += dt;
        beams = beams.filter((b) => b.t < 0.9);
      }

      /* ---------- Draw ---------- */
      function runnerPos(w) {
        if (rewind) {
          const hist = rewind.hist;
          const frames = Math.floor(hist.length / 4);
          if (frames > 0) {
            const p = U.clamp(rewind.t / rewind.dur, 0, 1);
            const eased = p * p * (3 - 2 * p);
            const i = Math.round((1 - eased) * (frames - 1));
            return { x: hist[i * 4 + w * 2], y: hist[i * 4 + w * 2 + 1] };
          }
        }
        return { x: S.r[w].x, y: S.r[w].y };
      }

      function drawTiles(w) {
        const Wd = L.worlds[w];
        const acc = ACCENT[w];
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const k = Wd.grid[r][c];
            const x = c * T;
            const y = r * T;
            if (k === EMPTY) {
              ctx.fillStyle = U.alpha(C.line, 0.45);
              ctx.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
            } else if (k === SOLID) {
              ctx.fillStyle = C.panel2;
              ctx.fillRect(x, y, T, T);
              ctx.strokeStyle = U.alpha(C.line, 0.9);
              ctx.lineWidth = 1;
              ctx.strokeRect(x + 0.5, y + 0.5, T - 1, T - 1);
              if (r === 0 || Wd.grid[r - 1][c] !== SOLID) {
                ctx.fillStyle = U.alpha(acc, 0.75);
                ctx.fillRect(x, y, T, 4);
              }
            } else if (k === SPIKE || k === SPIKE_DN) {
              drawSpikeShape(ctx, x, y, T, k === SPIKE_DN);
            } else if (k === CRUMB) {
              const cs = S.crumb[w][Wd.idx[r][c]];
              if (cs.gone > 0) {
                ctx.strokeStyle = U.alpha(C.gold, cs.gone < 0.6 ? 0.6 : 0.22);
                ctx.lineWidth = 1.5;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(x + 3, y + 3, T - 6, T - 6);
                ctx.setLineDash([]);
              } else {
                const jit = cs.t > 0 ? Math.sin(pulse * 70 + c * 3) * (1 + 3 * cs.t / CRUMBLE) : 0;
                ctx.fillStyle = C.panel2;
                ctx.fillRect(x + 1 + jit, y + 1, T - 2, T - 2);
                ctx.fillStyle = U.alpha(C.gold, cs.t > 0 ? 0.55 : 0.35);
                ctx.fillRect(x + 1 + jit, y + 1, T - 2, T - 2);
                ctx.fillStyle = C.gold;
                ctx.fillRect(x + 1 + jit, y + 1, T - 2, 3);
                ctx.strokeStyle = U.alpha(C.ink, 0.7);
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x + 8 + jit, y + 5);
                ctx.lineTo(x + 13 + jit, y + 15);
                ctx.lineTo(x + 10 + jit, y + 26);
                ctx.moveTo(x + 13 + jit, y + 15);
                ctx.lineTo(x + 22 + jit, y + 19);
                ctx.stroke();
              }
            } else if (k === DOOR) {
              const i = Wd.idx[r][c];
              const col = CHAN[Wd.doors[i].ch];
              if (doorOpen(L, S, w, i) || S.ghost[w][i]) {
                ctx.fillStyle = U.alpha(col, 0.07);
                ctx.fillRect(x + 4, y, T - 8, T);
                ctx.strokeStyle = U.alpha(col, 0.4);
                ctx.lineWidth = 1.5;
                ctx.setLineDash([3, 4]);
                ctx.strokeRect(x + 4.5, y + 0.5, T - 9, T - 1);
                ctx.setLineDash([]);
              } else {
                ctx.fillStyle = U.alpha(col, 0.9);
                ctx.fillRect(x + 3, y, T - 6, T);
                ctx.fillStyle = U.alpha(C.ink, 0.3);
                for (let sy = 3; sy < T; sy += 9) ctx.fillRect(x + 3, y + sy, T - 6, 3);
              }
            } else if (k === SWITCH) {
              const sw = Wd.switches[Wd.idx[r][c]];
              const col = CHAN[sw.ch];
              const on = S.flip[1 - w][sw.ch];
              ctx.strokeStyle = U.alpha(col, 0.25 + 0.15 * Math.sin(pulse * 4));
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(x + T / 2, y + T - 8, 13, Math.PI, 0);
              ctx.stroke();
              ctx.save();
              ctx.translate(x + T / 2, y + T - 6);
              ctx.rotate(on ? 0.65 : -0.65);
              ctx.strokeStyle = C.text;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(0, -16);
              ctx.stroke();
              ctx.fillStyle = col;
              ctx.beginPath();
              ctx.arc(0, -17, 4.5, 0, Math.PI * 2);
              ctx.fill();
              ctx.restore();
              ctx.fillStyle = C.line;
              U.roundRect(ctx, x + 6, y + T - 7, T - 12, 7, 3);
              ctx.fill();
            }
          }
        }
      }

      function drawWorld(w) {
        const Wd = L.worlds[w];
        const acc = ACCENT[w];
        ctx.save();
        if (w === 1) {
          ctx.translate(0, H);
          ctx.scale(1, -1);
        }
        ctx.beginPath();
        ctx.rect(0, 0, WW, WH);
        ctx.clip();
        ctx.fillStyle = SKY[w];
        ctx.fillRect(0, 0, WW, WH);
        const glow = ctx.createLinearGradient(0, WH, 0, WH - 160);
        glow.addColorStop(0, U.alpha(C.violet, 0.16));
        glow.addColorStop(1, U.alpha(C.violet, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(0, WH - 160, WW, 160);

        // Moving platform rails and bodies.
        L.movers.forEach((m, k) => {
          if (m.w !== w) return;
          const a = moverPos(Object.assign({}, m, { phase: 0 }), 0);
          const b = { x: (m.x + m.dx) * T, y: (m.y + m.dy) * T };
          const hw = (m.len * T) / 2;
          ctx.strokeStyle = U.alpha(C.violet, 0.4);
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 7]);
          ctx.beginPath();
          ctx.moveTo(a.x + hw, a.y + 5);
          ctx.lineTo(b.x + hw, b.y + 5);
          ctx.stroke();
          ctx.setLineDash([]);
          const p = S.mov[k];
          ctx.fillStyle = C.violet;
          U.roundRect(ctx, p.x + 1, p.y, m.len * T - 2, 10, 4);
          ctx.fill();
          ctx.fillStyle = U.alpha(C.text, 0.45);
          ctx.fillRect(p.x + 5, p.y + 2, m.len * T - 10, 2);
        });

        drawTiles(w);

        // Flag, glowing while its runner stands on it.
        const f = Wd.flag;
        const fx = f.c * T + T / 2;
        const fy = (f.r + 1) * T;
        if (S.r[w].onFlag) {
          ctx.fillStyle = U.alpha(acc, 0.18 + 0.08 * Math.sin(pulse * 8));
          ctx.beginPath();
          ctx.arc(fx, fy - 14, 24, 0, Math.PI * 2);
          ctx.fill();
        }
        drawFlagShape(ctx, fx, fy, acc, Math.sin(pulse * 5 + w * 2) * 2.5);

        // Particles in this world.
        for (const p of parts) {
          if (p.w !== w) continue;
          const a = U.clamp(p.life / p.max, 0, 1);
          ctx.globalAlpha = a;
          ctx.fillStyle = p.color;
          if (p.star) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(pulse * 3);
            ctx.fillRect(-p.size, -0.6, p.size * 2, 1.2);
            ctx.fillRect(-0.6, -p.size, 1.2, p.size * 2);
            ctx.restore();
          } else {
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
          }
        }
        ctx.globalAlpha = 1;

        // Runner (with a ghost trail while rewinding).
        const pos = runnerPos(w);
        const s = squash[w];
        if (rewind) {
          const hist = rewind.hist;
          const frames = Math.floor(hist.length / 4);
          const p = U.clamp(rewind.t / rewind.dur, 0, 1);
          const eased = p * p * (3 - 2 * p);
          const i0 = Math.round((1 - eased) * (frames - 1));
          for (let g = 1; g <= 4 && frames > 0; g++) {
            const i = Math.min(frames - 1, i0 + g * 6);
            ctx.globalAlpha = 0.18 * (1 - g / 5);
            drawRunnerShape(ctx, hist[i * 4 + w * 2] + RW / 2, hist[i * 4 + w * 2 + 1] + RH, RW, RH, acc, S.r[w].face);
          }
          ctx.globalAlpha = 0.85;
        }
        drawRunnerShape(ctx, pos.x + RW / 2, pos.y + RH, RW * (1 + s * 0.5), RH * (1 - s * 0.5), acc, S.r[w].face);
        ctx.globalAlpha = 1;

        // Motion arrow: makes the mirrored controls obvious.
        if (state === 'play' && lastDir) {
          const d = w === 0 ? lastDir : -lastDir;
          const ax = pos.x + RW / 2 + d * 18;
          const ay = pos.y - 8;
          ctx.fillStyle = U.alpha(acc, 0.85);
          ctx.beginPath();
          ctx.moveTo(ax + d * 6, ay);
          ctx.lineTo(ax - d * 4, ay - 6);
          ctx.lineTo(ax - d * 4, ay + 6);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      function screenY(w, y) {
        return w === 0 ? y : H - y;
      }

      function drawBeams() {
        for (const b of beams) {
          const a = 1 - b.t / 0.9;
          const col = CHAN[b.ch];
          const x = b.sw.c * T + T / 2;
          const y0 = screenY(b.w, b.sw.r * T + T - 10);
          const reach = U.clamp(b.t / 0.25, 0, 1);
          ctx.strokeStyle = U.alpha(col, 0.8 * a);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, U.lerp(y0, H / 2, reach));
          ctx.stroke();
          if (b.t > 0.2) {
            const o = 1 - b.w;
            L.worlds[o].doors.forEach((d) => {
              if (d.ch !== b.ch) return;
              const yy = o === 0 ? d.r * T : H - (d.r + 1) * T;
              const grow = (b.t - 0.2) * 14;
              ctx.strokeStyle = U.alpha(col, 0.9 * a);
              ctx.lineWidth = 2;
              ctx.strokeRect(d.c * T - grow, yy - grow, T + grow * 2, T + grow * 2);
            });
          }
        }
      }

      function drawDivider() {
        const y = H / 2;
        ctx.fillStyle = U.alpha(C.violet, 0.3);
        ctx.fillRect(0, y - 4, W, 8);
        ctx.fillStyle = C.violet;
        ctx.fillRect(0, y - 1.5, W, 3);
        const sx = ((pulse * 300) % (W + 400)) - 200;
        const g = ctx.createLinearGradient(sx - 90, 0, sx + 90, 0);
        g.addColorStop(0, U.alpha(C.text, 0));
        g.addColorStop(0.5, U.alpha(C.text, 0.85));
        g.addColorStop(1, U.alpha(C.text, 0));
        ctx.fillStyle = g;
        ctx.fillRect(sx - 90, y - 1.5, 180, 3);
      }

      function drawHUD() {
        ctx.textBaseline = 'middle';
        ctx.font = HUD;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText((lv + 1) + '/' + LEVELS.length + '  ' + L.def.name, 12, 16);
        ctx.textAlign = 'right';
        ctx.fillStyle = levelTime <= L.def.par ? C.gold : C.muted;
        ctx.fillText(levelTime.toFixed(1) + 's', W - 92, 16);
        ctx.fillStyle = C.muted;
        ctx.fillText('par ' + L.def.par, W - 12, 16);

        // Both-on-flags meter.
        const mw = 140;
        const mx = W / 2 - mw / 2;
        const my = 9;
        ctx.fillStyle = U.alpha(C.ink, 0.75);
        U.roundRect(ctx, mx - 34, my - 5, mw + 68, 22, 11);
        ctx.fill();
        for (let w = 0; w < 2; w++) {
          const on = S.r[w].onFlag;
          const fx = w === 0 ? mx - 20 : mx + mw + 14;
          ctx.globalAlpha = on ? 1 : 0.35;
          drawFlagShape(ctx, fx, my + 14, ACCENT[w], 0);
          ctx.globalAlpha = 1;
        }
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, mx, my + 1, mw, 10, 5);
        ctx.fill();
        if (S.meter > 0) {
          ctx.fillStyle = C.mint;
          U.roundRect(ctx, mx, my + 1, Math.max(10, mw * S.meter), 10, 5);
          ctx.fill();
        }
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.fillStyle = S.r[0].onFlag && S.r[1].onFlag ? C.mint : U.alpha(C.muted, 0.9);
        ctx.fillText('BOTH ON FLAGS', W / 2, my + 24);

        ctx.textAlign = 'left';
        ctx.fillStyle = U.alpha(C.muted, 0.85);
        ctx.fillText('R rewind  ·  M menu', 12, H - 14);
        ctx.textAlign = 'right';
        ctx.fillText(deaths ? 'rewinds ' + deaths : '', W - 12, H - 14);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-1, 1) * shake * 6, U.rand(-1, 1) * shake * 6);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-10, -10, W + 20, H + 20);
        drawWorld(0);
        drawWorld(1);
        drawDivider();
        drawBeams();
        ctx.restore();
        drawHUD();

        if (rewind) {
          ctx.fillStyle = U.alpha(C.violet, 0.1);
          ctx.fillRect(0, 0, W, H);
          ctx.fillStyle = U.alpha(C.ink, 0.22);
          const off = (pulse * 90) % 6;
          for (let y = off; y < H; y += 6) ctx.fillRect(0, y, W, 2);
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.text, 0.85);
          ctx.fillText('◀◀ REWIND', W / 2, H / 2 - 70);
        }
        if (banner && state === 'play') {
          const a = banner.t < 1.3 ? 1 : 1 - (banner.t - 1.3) / 0.7;
          ctx.globalAlpha = U.clamp(a, 0, 1);
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          ctx.fillText(banner.text, W / 2 + 3, H / 2 - 77);
          ctx.fillStyle = C.text;
          ctx.fillText(banner.text, W / 2, H / 2 - 80);
          ctx.font = HUD;
          ctx.fillStyle = C.gold;
          ctx.fillText('LEVEL ' + (lv + 1), W / 2, H / 2 - 120);
          ctx.globalAlpha = 1;
        }
        if (state === 'clear') {
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.mint;
          ctx.fillText('Both home!', W / 2, H / 2 - 80);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.4);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (e.code === 'KeyM' && !e.repeat && (state === 'play' || state === 'rewind')) {
          rewind = null; // a running rewind just finishes instantly
          showPauseMenu();
          return;
        }
        if (state !== 'play') return;
        if ((e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') && !e.repeat) jumpQueued = true;
        else if (e.code === 'KeyR' && !e.repeat) {
          api.sfx('flip');
          startRewind();
        }
      });

      // Touch: hold the left or right third to move, tap the middle to jump.
      function zoneOf(e) {
        const p = api.toCanvas(e, canvas);
        return p.x < W / 3 ? -1 : p.x > (W * 2) / 3 ? 1 : 0;
      }
      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play' || e.pointerType === 'mouse') return;
        ptr = { id: e.pointerId, zone: zoneOf(e) };
        if (ptr.zone === 0) jumpQueued = true;
      });
      api.on(canvas, 'pointermove', (e) => {
        if (ptr && ptr.id === e.pointerId) ptr.zone = zoneOf(e);
      });
      const release = (e) => {
        if (ptr && ptr.id === e.pointerId) ptr = null;
      };
      api.on(window, 'pointerup', release, { always: true });
      api.on(window, 'pointercancel', release, { always: true });

      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
