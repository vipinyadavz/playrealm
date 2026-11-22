/* Mini Golf — a nine-hole top-down putting course where you pick a bouncy, sticky or heavy ball before every hole. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 560;
  const TOP = 46;            // HUD band height
  const R = 7;               // ball radius
  const CUP_R = 11;
  const VMAX = 1000;         // launch speed at full power (px/s)
  const PULL_MAX = 150;      // drag distance for full power
  const SLOPE_A = 260;       // slope acceleration at strength 1 (px/s²)
  const BUMP_KICK = 210;
  const PORTAL_R = 14;
  const BAR_T = 6;
  const CAP = 8;             // stroke limit per hole
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const GREEN = '#3BB56A';
  const GREEN_DARK = '#2A8A50';
  const RAIL = '#C88D55';
  const RAIL_DARK = '#7B4C26';
  const SAND = '#EBD290';
  const SAND_DOT = '#C9A95C';
  const WATER = '#2C86DA';
  const WATER_LIGHT = '#8CCBF8';
  const PLAYER_COLORS = [C.p1, C.p2, C.gold, C.violet];
  const ORDER = ['bouncy', 'sticky', 'heavy'];
  const TYPES = {
    bouncy: { key: 'bouncy', name: 'Bouncy', letter: 'B', wallE: 0.82, mu: 65, drag: 0.38, slope: 1, sand: 3.4, bumper: 1.45,
      capture: 200, heavy: false, color: '#FF6FCF', dark: '#A3307F' },
    sticky: { key: 'sticky', name: 'Sticky', letter: 'S', wallE: 0.3, mu: 170, drag: 0.7, slope: 0.35, sand: 1.7, bumper: 0.6,
      capture: 380, heavy: false, color: '#FFC53D', dark: '#9C6E00' },
    heavy: { key: 'heavy', name: 'Heavy', letter: 'H', wallE: 0.4, mu: 90, drag: 0.45, slope: 1, sand: 2.4, bumper: 0,
      capture: 320, heavy: true, color: '#9BA3C2', dark: '#3A4060' }
  };

  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  /* The course. Every hole fits the 900×560 canvas below the HUD band. */
  const HOLES = [
    {
      name: 'Bank shot', par: 2, tee: [140, 415], cup: [700, 165], aimAt: [745, 405],
      tip: 'Bounce off the angled rail in the corner to turn up toward the cup.',
      outline: [[70, 350], [70, 480], [700, 480], [790, 390], [790, 150], [730, 90], [600, 90], [600, 350]]
    },
    {
      name: 'Bunkers', par: 3, tee: [140, 300], cup: [765, 300],
      tip: 'Sand slows every ball. A crescent bunker guards the cup.',
      outline: [[70, 180], [70, 420], [140, 490], [760, 490], [830, 420], [830, 180], [760, 110], [140, 110]],
      blocks: [[[430, 225], [505, 300], [430, 375], [355, 300]]],
      sand: [
        [[290, 110], [570, 110], [530, 165], [330, 165]],
        [[330, 435], [530, 435], [570, 490], [290, 490]],
        [[640, 245], [675, 232], [692, 300], [675, 368], [640, 355], [656, 300]]
      ]
    },
    {
      name: 'Pond', par: 3, tee: [120, 302], cup: [775, 170],
      tip: 'Water costs a stroke. The plank bridge is a short cut, if your aim is true.',
      outline: [[60, 120], [100, 80], [800, 80], [840, 120], [840, 470], [800, 510], [100, 510], [60, 470]],
      water: [[[290, 165], [600, 148], [672, 270], [612, 420], [330, 442], [258, 300]]],
      bridges: [rect(240, 287, 440, 30)],
      sand: [[[400, 470], [520, 470], [545, 510], [375, 510]]]
    },
    {
      name: 'Hillside', par: 3, tee: [150, 300], cup: [730, 210],
      tip: 'The hill drags balls down toward the water. Sticky balls barely notice it.',
      outline: [[80, 130], [120, 90], [780, 90], [820, 130], [820, 460], [780, 500], [120, 500], [80, 460]],
      slopes: [{ poly: rect(250, 90, 370, 410), dir: [0, 1.2] }],
      water: [rect(300, 452, 270, 48)],
      sand: [[[250, 90], [360, 90], [330, 135], [250, 135]]]
    },
    {
      name: 'Sliders', par: 3, tee: [130, 280], cup: [785, 200],
      tip: 'Time your putt through the sliding gates, or send a heavy ball to shove them aside.',
      outline: [[60, 160], [220, 160], [220, 220], [680, 220], [680, 140], [840, 140], [840, 420], [680, 420], [680, 340],
        [220, 340], [220, 400], [60, 400]],
      movers: [
        { x: 330, y: 220, w: 34, h: 66, ax: 0, ay: 1, range: 54, speed: 60, s0: 0 },
        { x: 520, y: 220, w: 34, h: 66, ax: 0, ay: 1, range: 54, speed: 60, s0: 54 }
      ]
    },
    {
      name: 'Spinner', par: 3, tee: [130, 360], cup: [775, 240],
      tip: 'A spinning bar guards the throat. Heavy balls knock it out of the way.',
      outline: [[60, 110], [420, 110], [540, 220], [620, 220], [700, 140], [840, 140], [840, 460], [700, 460], [620, 380],
        [540, 380], [420, 490], [60, 490]],
      bars: [{ x: 580, y: 300, len: 70, w: 1.7, a0: 0.4 }],
      sand: [[[230, 110], [330, 110], [300, 150], [250, 150]], [[230, 490], [330, 490], [300, 450], [250, 450]]]
    },
    {
      name: 'Pinball', par: 3, tee: [115, 300], cup: [780, 300],
      tip: 'Bumpers kick bouncy balls hard and barely touch sticky ones. Heavy balls ignore the kick.',
      outline: [[120, 100], [780, 100], [850, 170], [850, 430], [780, 500], [120, 500], [50, 430], [50, 170]],
      bumpers: [[380, 300, 26], [470, 215, 22], [470, 385, 22], [560, 300, 26], [650, 195, 18], [650, 405, 18]]
    },
    {
      name: 'Tunnel', par: 3, tee: [130, 440], cup: [735, 460], aimAt: [250, 260],
      tip: 'Roll into a tunnel mouth to pop out of the other one, at the same speed.',
      outline: [[60, 140], [300, 140], [300, 60], [790, 60], [840, 110], [840, 500], [480, 500], [480, 200], [420, 200],
        [420, 500], [60, 500]],
      portals: [{ a: [250, 260, 0, 1], b: [540, 395, 1, 0] }],
      water: [rect(560, 250, 240, 60)],
      sand: [[[620, 60], [720, 60], [700, 110], [640, 110]]]
    },
    {
      name: 'Grand tour', par: 4, tee: [110, 420], cup: [120, 135], aimAt: [700, 420],
      tip: 'Everything at once: a hill by the pond, a sliding gate, then a bumper alley to the cup.',
      outline: [[60, 360], [700, 360], [700, 210], [60, 210], [60, 60], [790, 60], [840, 110], [840, 460], [790, 510], [60, 510]],
      slopes: [{ poly: rect(270, 360, 270, 150), dir: [0, 0.9] }],
      water: [rect(345, 462, 120, 48)],
      movers: [{ x: 700, y: 268, w: 90, h: 26, ax: 1, ay: 0, range: 50, speed: 70, s0: 0 }],
      bumpers: [[560, 108, 17], [470, 162, 17], [380, 108, 17], [290, 162, 17]],
      sand: [[[160, 60], [240, 60], [225, 100], [175, 100]]]
    }
  ];

  /* ---------- Geometry ---------- */
  function polyArea(p) {
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i][0] * q[1] - q[0] * p[i][1];
    }
    return a / 2;
  }

  function inPoly(x, y, p) {
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      const xi = p[i][0];
      const yi = p[i][1];
      const xj = p[j][0];
      const yj = p[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }

  const inAny = (polys, x, y) => polys.some((p) => inPoly(x, y, p));

  /* Wall segments with a fallback normal pointing into the playable side. */
  function addSegs(out, pts, inward) {
    const sgn = (polyArea(pts) > 0) === inward ? 1 : -1;
    for (let i = 0; i < pts.length; i++) {
      const ax = pts[i][0];
      const ay = pts[i][1];
      const bx = pts[(i + 1) % pts.length][0];
      const by = pts[(i + 1) % pts.length][1];
      const dx = bx - ax;
      const dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      out.push({ ax, ay, dx, dy, len2: dx * dx + dy * dy || 1, nx: (-dy / len) * sgn, ny: (dx / len) * sgn,
        x0: Math.min(ax, bx) - R - 2, x1: Math.max(ax, bx) + R + 2, y0: Math.min(ay, by) - R - 2, y1: Math.max(ay, by) + R + 2 });
    }
  }

  function makeWorld(def) {
    const segs = [];
    addSegs(segs, def.outline, true);
    (def.blocks || []).forEach((p) => addSegs(segs, p, false));
    const port = (p) => ({ x: p[0], y: p[1], dx: p[2], dy: p[3] });
    return {
      def,
      segs,
      sand: def.sand || [],
      water: def.water || [],
      bridges: def.bridges || [],
      blocks: def.blocks || [],
      slopes: (def.slopes || []).map((s) => ({ poly: s.poly, dx: s.dir[0], dy: s.dir[1] })),
      bumpers: (def.bumpers || []).map((b) => ({ x: b[0], y: b[1], r: b[2], flash: 0 })),
      movers: (def.movers || []).map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, ax: m.ax, ay: m.ay, range: m.range,
        speed: m.speed, s: m.s0 || 0, dir: m.s0 ? -1 : 1, shoveT: 0, ghostT: 0, flash: 0 })),
      bars: (def.bars || []).map((b) => ({ x: b.x, y: b.y, len: b.len, w: b.w, ang: b.a0 || 0, knockT: 0, knockW: 0,
        ghostT: 0, flash: 0 })),
      portals: (def.portals || []).map((p) => ({ a: port(p.a), b: port(p.b) })),
      cup: { x: def.cup[0], y: def.cup[1] },
      tee: { x: def.tee[0], y: def.tee[1] }
    };
  }

  function newBall(x, y) {
    return { x, y, vx: 0, vy: 0, rest: true, active: true, inSand: false, portalCD: 0 };
  }

  const moverX = (m) => m.x + m.ax * m.s;
  const moverY = (m) => m.y + m.ay * m.s;
  const moverSpeed = (m) => m.speed * (m.shoveT > 0 ? 3.2 : 1);
  const barSpin = (b) => (b.knockT > 0 ? b.knockW : b.w);

  /* Circle (x, y, rad) against a mover's rectangle: push direction and depth, or null. */
  function rectContact(m, x, y, rad) {
    const rx = moverX(m);
    const ry = moverY(m);
    const cx = U.clamp(x, rx, rx + m.w);
    const cy = U.clamp(y, ry, ry + m.h);
    const nx = x - cx;
    const ny = y - cy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rad * rad) return null;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      return { nx: nx / d, ny: ny / d, depth: rad - d, cx, cy };
    }
    const l = x - rx;
    const r = rx + m.w - x;
    const t = y - ry;
    const b = ry + m.h - y;
    const mn = Math.min(l, r, t, b);
    if (mn === l) return { nx: -1, ny: 0, depth: l + rad, cx: rx, cy: y };
    if (mn === r) return { nx: 1, ny: 0, depth: r + rad, cx: rx + m.w, cy: y };
    if (mn === t) return { nx: 0, ny: -1, depth: t + rad, cx: x, cy: ry };
    return { nx: 0, ny: 1, depth: b + rad, cx: x, cy: ry + m.h };
  }

  function barEnds(b) {
    const c = Math.cos(b.ang) * b.len;
    const s = Math.sin(b.ang) * b.len;
    return [b.x - c, b.y - s, b.x + c, b.y + s];
  }

  function barContact(b, x, y, rad) {
    const e = barEnds(b);
    const dx = e[2] - e[0];
    const dy = e[3] - e[1];
    const t = U.clamp(((x - e[0]) * dx + (y - e[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    const cx = e[0] + dx * t;
    const cy = e[1] + dy * t;
    let nx = x - cx;
    let ny = y - cy;
    const d = Math.hypot(nx, ny);
    if (d >= rad) return null;
    if (d < 1e-6) {
      const l = Math.hypot(dx, dy) || 1;
      nx = -dy / l;
      ny = dx / l;
    } else {
      nx /= d;
      ny /= d;
    }
    return { nx, ny, depth: rad - d, cx, cy };
  }

  /* Direction along a mover's track that leads away from the ball. */
  function awayDir(m, ball) {
    const proj = (moverX(m) + m.w / 2 - ball.x) * m.ax + (moverY(m) + m.h / 2 - ball.y) * m.ay;
    return proj >= 0 ? 1 : -1;
  }

  function collideWalls(w, ball, e) {
    let hit = 0;
    for (const s of w.segs) {
      if (ball.x < s.x0 || ball.x > s.x1 || ball.y < s.y0 || ball.y > s.y1) continue;
      const t = U.clamp(((ball.x - s.ax) * s.dx + (ball.y - s.ay) * s.dy) / s.len2, 0, 1);
      const cx = s.ax + s.dx * t;
      const cy = s.ay + s.dy * t;
      let nx = ball.x - cx;
      let ny = ball.y - cy;
      const d2 = nx * nx + ny * ny;
      if (d2 >= R * R) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        nx = s.nx;
        ny = s.ny;
      } else {
        nx /= d;
        ny /= d;
      }
      ball.x = cx + nx * R;
      ball.y = cy + ny * R;
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        ball.vx -= (1 + e) * vn * nx;
        ball.vy -= (1 + e) * vn * ny;
        hit = Math.max(hit, -vn);
      }
    }
    return hit;
  }

  /* Moving obstacles. A ball at rest (or a slow heavy ball) stops them: they turn back instead of pushing it. */
  function moveObstacles(w, ball, T, h) {
    const blocking = ball.active && (ball.rest || (T.heavy && Math.hypot(ball.vx, ball.vy) < 80));
    for (const m of w.movers) {
      m.ghostT = Math.max(0, m.ghostT - h);
      m.shoveT = Math.max(0, m.shoveT - h);
      const prev = m.s;
      m.s += m.dir * moverSpeed(m) * h;
      if (m.s >= m.range) {
        m.s = m.range;
        m.dir = -1;
      } else if (m.s <= 0) {
        m.s = 0;
        m.dir = 1;
      }
      if (blocking && m.ghostT <= 0 && rectContact(m, ball.x, ball.y, R + 0.5)) {
        m.s = prev;
        m.dir = awayDir(m, ball);
      }
    }
    for (const b of w.bars) {
      b.knockT = Math.max(0, b.knockT - h);
      b.ghostT = Math.max(0, b.ghostT - h);
      const prev = b.ang;
      b.ang += barSpin(b) * h;
      if (blocking && b.ghostT <= 0 && barContact(b, ball.x, ball.y, R + BAR_T + 0.5)) {
        b.ang = prev;
        b.w = -b.w;
        b.knockT = 0;
      }
    }
  }

  /* One physics sub-step for a rolling ball. Fills ev with what happened. */
  function stepBall(w, ball, T, h, ev) {
    let fx = 0;
    let fy = 0;
    for (const s of w.slopes) {
      if (inPoly(ball.x, ball.y, s.poly)) {
        fx += s.dx * SLOPE_A * T.slope;
        fy += s.dy * SLOPE_A * T.slope;
        ev.slope = true;
      }
    }
    const sand = inAny(w.sand, ball.x, ball.y);
    if (sand && !ball.inSand) ev.sand = true;
    ball.inSand = sand;
    const mu = T.mu * (sand ? T.sand : 1);
    const drag = T.drag * (sand ? T.sand : 1);
    // The cup's lip pulls the ball toward the middle.
    const cdx = w.cup.x - ball.x;
    const cdy = w.cup.y - ball.y;
    const cd = Math.hypot(cdx, cdy);
    if (cd < CUP_R + 4 && cd > 0.01) {
      fx += (cdx / cd) * 700;
      fy += (cdy / cd) * 700;
    }
    ball.vx += fx * h;
    ball.vy += fy * h;
    let sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - mu * h) * Math.exp(-drag * h);
      ball.vx *= ns / sp;
      ball.vy *= ns / sp;
      sp = ns;
    }
    ball.x += ball.vx * h;
    ball.y += ball.vy * h;

    ev.wall = Math.max(ev.wall || 0, collideWalls(w, ball, T.wallE));

    for (const b of w.bumpers) {
      let nx = ball.x - b.x;
      let ny = ball.y - b.y;
      const d = Math.hypot(nx, ny);
      if (d >= b.r + R || d < 1e-6) continue;
      nx /= d;
      ny /= d;
      ball.x = b.x + nx * (b.r + R);
      ball.y = b.y + ny * (b.r + R);
      const vn = ball.vx * nx + ball.vy * ny;
      if (vn < 0) {
        if (T.heavy) {
          ball.vx -= (1 + T.wallE) * vn * nx;
          ball.vy -= (1 + T.wallE) * vn * ny;
        } else {
          ball.vx -= 1.8 * vn * nx - nx * BUMP_KICK * T.bumper;
          ball.vy -= 1.8 * vn * ny - ny * BUMP_KICK * T.bumper;
        }
        b.flash = 1;
        ev.bumper = b;
      }
    }

    sp = Math.hypot(ball.vx, ball.vy);
    for (const m of w.movers) {
      if (m.ghostT > 0) continue;
      const c = rectContact(m, ball.x, ball.y, R);
      if (!c) continue;
      if (T.heavy && sp > 80) {
        // The twist: a heavy ball shoves the block along its track and keeps rolling.
        let dir = awayDir(m, ball);
        if ((dir > 0 && m.s >= m.range - 0.5) || (dir < 0 && m.s <= 0.5)) dir = -dir;
        m.dir = dir;
        m.shoveT = 0.5;
        m.ghostT = 0.3;
        m.flash = 1;
        ball.vx *= 0.8;
        ball.vy *= 0.8;
        ev.shove = { x: c.cx, y: c.cy };
        continue;
      }
      ball.x += c.nx * c.depth;
      ball.y += c.ny * c.depth;
      let mvx = m.ax * m.dir * moverSpeed(m);
      let mvy = m.ay * m.dir * moverSpeed(m);
      if (T.heavy) {
        m.dir = awayDir(m, ball);
        mvx = 0;
        mvy = 0;
      }
      const vn = (ball.vx - mvx) * c.nx + (ball.vy - mvy) * c.ny;
      if (vn < 0) {
        ball.vx -= (1 + T.wallE) * vn * c.nx;
        ball.vy -= (1 + T.wallE) * vn * c.ny;
        ev.wall = Math.max(ev.wall, -vn);
      }
    }

    for (const b of w.bars) {
      if (b.ghostT > 0) continue;
      const c = barContact(b, ball.x, ball.y, R + BAR_T);
      if (!c) continue;
      const rx = c.cx - b.x;
      const ry = c.cy - b.y;
      if (T.heavy && sp > 80 && Math.hypot(rx, ry) > 18) {
        // Heavy balls knock the bar spinning out of the way.
        const sign = rx * ball.vy - ry * ball.vx >= 0 ? 1 : -1;
        b.knockW = sign * Math.max(6, Math.abs(b.w) * 3.5);
        b.knockT = 0.55;
        b.w = sign * Math.abs(b.w);
        b.ghostT = 0.22;
        b.flash = 1;
        ball.vx *= 0.82;
        ball.vy *= 0.82;
        ev.shove = { x: c.cx, y: c.cy };
        continue;
      }
      ball.x += c.nx * c.depth;
      ball.y += c.ny * c.depth;
      const wNow = T.heavy ? 0 : barSpin(b);
      if (T.heavy) {
        b.w = -b.w;
        b.knockT = 0;
      }
      const bvx = -wNow * ry;
      const bvy = wNow * rx;
      const vn = (ball.vx - bvx) * c.nx + (ball.vy - bvy) * c.ny;
      if (vn < 0) {
        ball.vx -= (1 + T.wallE) * vn * c.nx;
        ball.vy -= (1 + T.wallE) * vn * c.ny;
        ev.wall = Math.max(ev.wall, -vn);
      }
    }

    // Walls win over moving parts; a ball squeezed against a wall turns the obstacle around.
    if (w.movers.length || w.bars.length) {
      collideWalls(w, ball, T.wallE);
      for (const m of w.movers) {
        if (m.ghostT <= 0 && rectContact(m, ball.x, ball.y, R - 1.5)) {
          m.dir = awayDir(m, ball);
          m.s = U.clamp(m.s + m.dir * 2, 0, m.range);
        }
      }
      for (const b of w.bars) {
        if (b.ghostT <= 0 && barContact(b, ball.x, ball.y, R + BAR_T - 1.5)) {
          b.w = -b.w;
          b.knockT = 0;
          b.ang += b.w * 0.02;
        }
      }
    }

    ball.portalCD = Math.max(0, ball.portalCD - h);
    if (ball.portalCD <= 0) {
      for (const p of w.portals) {
        for (const pair of [[p.a, p.b], [p.b, p.a]]) {
          const from = pair[0];
          const to = pair[1];
          if (Math.hypot(ball.x - from.x, ball.y - from.y) >= PORTAL_R - 2) continue;
          const s = Math.max(Math.hypot(ball.vx, ball.vy) * 0.95, 170);
          ball.x = to.x + to.dx * (PORTAL_R + R + 3);
          ball.y = to.y + to.dy * (PORTAL_R + R + 3);
          ball.vx = to.dx * s;
          ball.vy = to.dy * s;
          ball.portalCD = 0.3;
          ev.portal = { from, to };
          return;
        }
      }
    }

    if (inAny(w.water, ball.x, ball.y) && !inAny(w.bridges, ball.x, ball.y)) {
      ev.splash = true;
      return;
    }

    sp = Math.hypot(ball.vx, ball.vy);
    const cd2 = Math.hypot(w.cup.x - ball.x, w.cup.y - ball.y);
    if (cd2 < CUP_R - 3 && sp < T.capture) {
      ev.sink = true;
      return;
    }
    if (sp < 4 && Math.hypot(fx, fy) <= mu) {
      ball.vx = 0;
      ball.vy = 0;
      ball.rest = true;
      ev.stop = true;
    }
  }

  /* Advance obstacles and the ball by dt with small sub-steps (no tunnelling). */
  function stepWorld(w, ball, T, dt, ev) {
    const sp = ball.rest ? 0 : Math.hypot(ball.vx, ball.vy);
    const n = Math.min(80, Math.max(2, Math.ceil(((sp + 500) * dt) / 3)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      moveObstacles(w, ball, T, h);
      if (ball.active && !ball.rest) {
        stepBall(w, ball, T, h, ev);
        if (ev.sink || ev.splash) return;
      }
    }
  }

  /* Expected roll distance on flat green for a launch speed. */
  function rollDistance(T, v0) {
    if (v0 <= 0) return 0;
    return v0 / T.drag - (T.mu / (T.drag * T.drag)) * Math.log(1 + (T.drag * v0) / T.mu);
  }

  /* Would a ball centred at (x, y) touch anything solid right now? */
  function touchesSolid(w, x, y) {
    for (const s of w.segs) {
      if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
      const t = U.clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.len2, 0, 1);
      if (Math.hypot(x - s.ax - s.dx * t, y - s.ay - s.dy * t) < R) return true;
    }
    for (const b of w.bumpers) if (Math.hypot(x - b.x, y - b.y) < b.r + R) return true;
    for (const m of w.movers) if (rectContact(m, x, y, R)) return true;
    for (const b of w.bars) if (barContact(b, x, y, R + BAR_T)) return true;
    return false;
  }

  /* Can a ball roll in a straight line from (x0, y0) to (x1, y1) without touching anything solid? */
  function clearLine(w, x0, y0, x1, y1) {
    const d = Math.hypot(x1 - x0, y1 - y0);
    for (let s = R + 2; s < d - CUP_R; s += 5) {
      if (touchesSolid(w, x0 + ((x1 - x0) * s) / d, y0 + ((y1 - y0) * s) / d)) return false;
    }
    return true;
  }

  /* ---------- Drawing helpers (shared with the thumbnail) ---------- */
  function drawBall(ctx, x, y, type, scale) {
    const T = TYPES[type];
    const r = R * (scale || 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(x + r * 0.3, y + r * 0.45, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = T.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = T.dark;
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.stroke();
    if (type === 'bouncy') {
      ctx.strokeStyle = U.alpha('#FFFFFF', 0.75);
      ctx.lineWidth = Math.max(1, r * 0.2);
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, -0.4, 1.6);
      ctx.stroke();
    } else if (type === 'sticky') {
      ctx.fillStyle = T.dark;
      [[-0.35, 0.25], [0.3, 0.35], [0.1, -0.2]].forEach(([a, b]) => {
        ctx.beginPath();
        ctx.arc(x + a * r, y + b * r, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
      });
    } else {
      ctx.fillStyle = T.dark;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = U.alpha('#FFFFFF', 0.8);
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.38, r * 0.26, 0, Math.PI * 2);
    ctx.fill();
  }

  function pathPoly(ctx, p) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.closePath();
  }

  function drawFlag(ctx, x, y, t, alpha, color) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y + 6);
    ctx.stroke();
    ctx.strokeStyle = '#F4F1E6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 4, y - 40);
    ctx.stroke();
    const wv = Math.sin(t * 5) * 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 40);
    ctx.quadraticCurveTo(x + 16, y - 38 + wv, x + 28, y - 33 + wv);
    ctx.quadraticCurveTo(x + 16, y - 28 + wv * 0.5, x + 3.5, y - 26);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  Arcade.register({
    id: 'mini-golf',
    title: 'Mini Golf',
    category: 'sports',
    mode: 'solo',
    players: '1–4P',
    color: C.mint,
    best: 'low',
    formatScore: (n) => n + ' strokes',
    tagline: 'Putt your way around nine tricky holes in as few strokes as you can.',
    hook: 'Pick a ball before each hole: bouncy, sticky or heavy, and each plays the course differently.',
    tags: ['sports', 'golf', 'mini golf', 'putt', 'putting', 'physics', 'hotseat', 'party', 'touch', 'course'],
    howTo: 'Sink the ball in the cup in as few strokes as you can across nine holes with sand, water, hills, sliding gates, ' +
      'a spinning bar, bumpers and a tunnel. Drag back from the ball and let go to putt; the dotted line shows where it rolls first. ' +
      'Water costs a penalty stroke and puts you back where you hit from, and a hole ends at ' + CAP + ' strokes. ' +
      'The twist: before every hole you pick a ball. Bouncy rolls far and gets big kicks off bumpers, sticky stops fast and grips ' +
      'hills, heavy shoves sliding gates and spinners aside and ignores bumpers. You can use each type only 3 times per round, so ' +
      'plan where each one helps most. Up to 4 players take turns on each hole.',
    controls: [
      { keys: ['Drag'], label: 'Pull back from the ball, release to putt' },
      { keys: ['←', '→'], label: 'Aim' },
      { keys: ['↑', '↓'], label: 'Power' },
      { keys: ['Space'], label: 'Putt (Enter works too)' },
      { keys: ['A', 'D', 'W', 'S'], label: 'Aim and power, same as arrows' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = U.alpha(C.line, 0.5);
      for (let x = 10; x < 320; x += 20) for (let y = 10; y < 200; y += 20) ctx.fillRect(x - 1, y - 1, 2, 2);
      // A dogleg green with rails.
      const outline = [[20, 112], [20, 182], [228, 182], [300, 110], [300, 34], [270, 14], [196, 14], [196, 112]];
      ctx.lineJoin = 'round';
      pathPoly(ctx, outline);
      ctx.strokeStyle = RAIL_DARK;
      ctx.lineWidth = 12;
      ctx.stroke();
      ctx.strokeStyle = RAIL;
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.fill();
      ctx.save();
      pathPoly(ctx, outline);
      ctx.clip();
      ctx.fillStyle = U.alpha('#FFFFFF', 0.05);
      for (let x = -200; x < 320; x += 36) {
        ctx.beginPath();
        ctx.moveTo(x, 200);
        ctx.lineTo(x + 18, 200);
        ctx.lineTo(x + 218, 0);
        ctx.lineTo(x + 200, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      // Sand and water.
      ctx.fillStyle = SAND;
      ctx.beginPath();
      ctx.ellipse(120, 128, 30, 13, -0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = WATER;
      ctx.beginPath();
      ctx.ellipse(232, 74, 20, 26, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = U.alpha(WATER_LIGHT, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(232, 74, 6 + ((t * 8) % 12), 0, Math.PI * 2);
      ctx.stroke();
      // Cup and flag.
      ctx.fillStyle = '#123322';
      ctx.beginPath();
      ctx.arc(268, 46, 6, 0, Math.PI * 2);
      ctx.fill();
      drawFlag(ctx, 268, 46, t, 1, C.p1);
      // The ball and its bank-shot path.
      const p = [[44, 150], [262, 150], [268, 52]];
      ctx.fillStyle = U.alpha('#FFFFFF', 0.75);
      const total = 218 + 98;
      for (let d = 10; d < total; d += 9) {
        const seg = d < 218 ? [p[0], p[1], d / 218] : [p[1], p[2], (d - 218) / 98];
        const x = U.lerp(seg[0][0], seg[1][0], seg[2]);
        const y = U.lerp(seg[0][1], seg[1][1], seg[2]);
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      // Three ball choices; the picked one bobs.
      const pick = Math.floor(t / 1.2) % 3;
      ORDER.forEach((k, i) => {
        const x = 46 + i * 46;
        const y = 54 + (i === pick ? Math.sin(t * 6) * 3 - 4 : 0);
        ctx.fillStyle = U.alpha(C.panel, 0.92);
        U.roundRect(ctx, x - 20, y - 20, 40, 40, 12);
        ctx.fill();
        ctx.strokeStyle = i === pick ? TYPES[k].color : C.line;
        ctx.lineWidth = i === pick ? 3 : 2;
        ctx.stroke();
        drawBall(ctx, x, y - 3, k, 1.6);
        ctx.fillStyle = C.text;
        ctx.font = '700 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('×3', x, y + 13);
      });
      drawBall(ctx, 44, 150, ORDER[pick], 1.3);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | pick | aim | roll | sink | splash | card | over
      let nPlayers = 1;
      let full = true;
      let players = [];
      let holes = [];
      let holeNo = 0;
      let turn = 0;
      let world = makeWorld(HOLES[0]);
      let ball = newBall(world.tee.x, world.tee.y);
      let type = 'heavy';
      let strokes = 0;
      let lie = { x: 0, y: 0 };
      let aim = { ang: 0, power: 0.45 };
      let drag = null;
      let inputLock = 0;
      let rollT = 0;
      let slowT = 0;
      let stateT = 0;
      let holeResult = 0;
      let sinking = false;
      let sinkFrom = null;
      let clock = 0;
      let parts = [];
      let floats = [];
      let banner = null;
      let shake = 0;
      let tickCD = 0;
      let holdA = 0;
      let told = {};

      const hole = () => HOLES[holes[holeNo]];
      const cur = () => players[Math.min(turn, players.length - 1)];
      const T = () => TYPES[type];
      const holeTotal = (p) => p.scores.reduce((a, b) => a + (b || 0), 0);
      const parUpTo = (n) => holes.slice(0, n).reduce((a, i) => a + HOLES[i].par, 0);
      const playing = () => state === 'aim' || state === 'roll' || state === 'sink' || state === 'splash';

      function relText(d) {
        if (d === 0) return 'even par';
        return Math.abs(d) + (d > 0 ? ' over par' : ' under par');
      }

      function updateScore() {
        if (!players.length) return;
        const live = (p, i) => holeTotal(p) + (i === turn && playing() && p.scores[holeNo] === undefined ? strokes : 0);
        api.setScore(nPlayers === 1 ? live(players[0], 0) : players.map(live).join(' · '));
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n && parts.length < 400; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.2, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * U.rand(0.6, 1), max: life, color,
            size: size * U.rand(0.6, 1.3) });
        }
      }

      function float(text, x, y, color) {
        floats.push({ text, x, y, color, t: 0 });
      }

      function hint(key, text) {
        if (told[key]) return;
        told[key] = true;
        api.setStatus(text);
      }

      /* ---------- Round flow ---------- */
      function startGame(n, fullCourse) {
        nPlayers = n;
        full = fullCourse;
        holes = full ? HOLES.map((_, i) => i) : U.shuffle(HOLES.map((_, i) => i)).slice(0, 3).sort((a, b) => a - b);
        const per = holes.length / 3;
        players = [];
        for (let i = 0; i < n; i++) {
          players.push({ name: n === 1 ? 'You' : 'Player ' + (i + 1), color: PLAYER_COLORS[i],
            uses: { bouncy: per, sticky: per, heavy: per }, scores: [], picks: [] });
        }
        holeNo = 0;
        turn = 0;
        parts = [];
        floats = [];
        told = {};
        beginTurn();
      }

      function beginTurn() {
        world = makeWorld(hole());
        ball = newBall(world.tee.x, world.tee.y);
        strokes = 0;
        lie = { x: ball.x, y: ball.y };
        drag = null;
        banner = null;
        sinking = false;
        const at = hole().aimAt || [world.cup.x, world.cup.y];
        aim.ang = Math.atan2(at[1] - ball.y, at[0] - ball.x);
        aim.power = 0.45;
        state = 'pick';
        stateT = 0;
        updateScore();
        showPick();
      }

      function showPick() {
        const p = cur();
        const h = hole();
        const avail = ORDER.filter((k) => p.uses[k] > 0);
        let primary = avail[0];
        avail.forEach((k) => { if (p.uses[k] > p.uses[primary]) primary = k; });
        const where = 'Hole ' + (holeNo + 1) + ' of ' + holes.length + ', par ' + h.par + '. ';
        const title = nPlayers === 1 ? 'Hole ' + (holeNo + 1) + ': ' + h.name
          : holeNo === 0 && turn === 0 ? p.name + ' tees off' : 'Pass to ' + p.name;
        const choice = avail.length === 1
          ? 'Only your ' + TYPES[avail[0]].name.toLowerCase() + ' ball is left.'
          : 'Pick a ball. Bouncy rolls far and loves bumpers. Sticky stops fast and grips hills. ' +
            'Heavy shoves gates and ignores bumpers.';
        api.setStatus(nPlayers === 1 ? where + h.tip : p.name + ' is up. ' + where + h.tip);
        api.menu({
          title,
          text: (nPlayers === 1 ? 'Par ' + h.par + '. ' : where) + h.tip + '\n' + choice,
          buttons: avail.map((k) => ({
            label: TYPES[k].name + ' (' + p.uses[k] + ' left)',
            primary: k === primary,
            onClick: () => startAim(k)
          }))
        });
      }

      function startAim(k) {
        if (state !== 'pick') return;
        type = k;
        const p = cur();
        p.uses[k] = Math.max(0, p.uses[k] - 1);
        p.picks[holeNo] = k;
        state = 'aim';
        stateT = 0;
        inputLock = 0.3;
        api.sfx('flip');
        burst(ball.x, ball.y, TYPES[k].color, 12, 90, 0.4, 3);
        const who = nPlayers === 1 ? '' : p.name + ': ';
        if (!told.pick) {
          told.pick = true;
          api.setStatus(who + 'each ball type can be used ' + holes.length / 3 + ' times per round, so save them for the holes ' +
            'they suit. Drag back from the ball and release to putt, or use the arrow keys and Space.');
        } else {
          api.setStatus(who + TYPES[k].name + ' ball on ' + hole().name + '. Drag back and release, or ←/→ aim, ↑/↓ power, Space putt.');
        }
      }

      function shoot(ang, power) {
        if (state !== 'aim' || inputLock > 0) return;
        const pw = U.clamp(power, 0.03, 1);
        aim.ang = ang;
        aim.power = pw;
        strokes++;
        lie = { x: ball.x, y: ball.y };
        ball.vx = Math.cos(ang) * pw * VMAX;
        ball.vy = Math.sin(ang) * pw * VMAX;
        ball.rest = false;
        ball.portalCD = 0;
        state = 'roll';
        rollT = 0;
        slowT = 0;
        drag = null;
        api.sfx(pw > 0.45 ? 'hit' : 'tick');
        burst(ball.x - Math.cos(ang) * 6, ball.y - Math.sin(ang) * 6, '#B8F5C8', 6 + Math.round(pw * 8), 120 * pw + 40, 0.35, 2.5);
        updateScore();
      }

      function stopped() {
        ball.rest = true;
        ball.vx = 0;
        ball.vy = 0;
        if (strokes >= CAP) {
          pickUp();
          return;
        }
        state = 'aim';
        stateT = 0;
        inputLock = 0.15;
        // Keyboard aim snaps back to the cup when there is a clear line to it.
        if (clearLine(world, ball.x, ball.y, world.cup.x, world.cup.y)) aim.ang = Math.atan2(world.cup.y - ball.y, world.cup.x - ball.x);
      }

      function resultName(n, par) {
        if (n === 1) return 'Hole in one!';
        const d = n - par;
        if (d <= -3) return 'Albatross!';
        if (d === -2) return 'Eagle!';
        if (d === -1) return 'Birdie!';
        if (d === 0) return 'Par';
        if (d === 1) return 'Bogey';
        if (d === 2) return 'Double bogey';
        return '+' + d;
      }

      function sink() {
        state = 'sink';
        stateT = 0;
        sinking = true;
        sinkFrom = { x: ball.x, y: ball.y };
        ball.active = false;
        ball.rest = true;
        holeResult = Math.min(strokes, CAP);
        const par = hole().par;
        const name = resultName(holeResult, par);
        const good = holeResult < par || holeResult === 1;
        banner = { text: name, color: good ? C.gold : holeResult === par ? C.mint : C.text, t: 0 };
        api.sfx(good ? 'win' : 'score');
        burst(world.cup.x, world.cup.y, C.gold, good ? 40 : 16, good ? 260 : 150, 0.9, 4);
        if (good) burst(world.cup.x, world.cup.y, cur().color, 24, 220, 0.8, 4);
        const who = nPlayers === 1 ? 'You' : cur().name;
        api.setStatus(who + ' holed out in ' + holeResult + (holeResult === 1 ? ' stroke' : ' strokes') + ' (par ' + par + ').');
        updateScore();
      }

      function pickUp() {
        state = 'sink';
        stateT = 0;
        sinking = false;
        holeResult = CAP;
        banner = { text: 'Picked up', color: C.muted, t: 0 };
        api.sfx('lose');
        api.setStatus('That is the stroke limit: ' + CAP + ' goes on the card.');
        updateScore();
      }

      function splash() {
        state = 'splash';
        stateT = 0;
        ball.rest = true;
        ball.active = false;
        strokes++;
        api.sfx('boom');
        burst(ball.x, ball.y, WATER_LIGHT, 26, 160, 0.7, 3.5);
        burst(ball.x, ball.y, '#FFFFFF', 10, 100, 0.5, 2.5);
        float('+1 penalty', ball.x, ball.y - 16, WATER_LIGHT);
        shake = 4;
        if (!told.water) {
          told.water = true;
          api.setStatus('Splash! Water adds a penalty stroke and puts you back where you hit from.');
        }
        updateScore();
      }

      function endTurn() {
        cur().scores[holeNo] = holeResult;
        banner = null;
        turn++;
        updateScore();
        if (turn < nPlayers) {
          beginTurn();
        } else {
          state = 'card';
          stateT = 0;
          api.sfx('tick');
          api.setStatus(holeNo + 1 >= holes.length ? 'Final card. Click or press Space to finish.'
            : 'Scorecard after hole ' + (holeNo + 1) + '. Click or press Space for the next hole.');
        }
      }

      function continueCard() {
        if (state !== 'card' || stateT < 0.35) return;
        api.sfx('blip');
        if (holeNo + 1 >= holes.length) {
          finish();
          return;
        }
        holeNo++;
        turn = 0;
        beginTurn();
      }

      function finish() {
        state = 'over';
        const par = parUpTo(holes.length);
        if (nPlayers === 1) {
          const total = holeTotal(players[0]);
          const isBest = full ? api.reportScore(total) : false;
          api.sfx(isBest ? 'win' : 'score');
          api.setStatus('Round over: ' + total + ' strokes, ' + relText(total - par) + '.');
          api.menu({
            title: isBest ? 'New best: ' + total + '!' : 'Round complete',
            text: total + ' strokes on ' + (full ? 'the 9-hole course' : 'a quick 3-hole round') + ', ' + relText(total - par) + '.' +
              (full ? '' : ' Play the full course to set a best.'),
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(nPlayers, full) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
          return;
        }
        const ranked = players.slice().sort((a, b) => holeTotal(a) - holeTotal(b));
        const low = holeTotal(ranked[0]);
        const winners = ranked.filter((p) => holeTotal(p) === low);
        api.sfx('win');
        api.setStatus(winners.length > 1 ? 'Tied at ' + low + ' strokes.' : winners[0].name + ' wins with ' + low + ' strokes.');
        api.menu({
          title: winners.length > 1 ? 'It’s a tie!' : winners[0].name + ' wins!',
          text: ranked.map((p) => p.name + ': ' + holeTotal(p) + ' (' + relText(holeTotal(p) - par) + ')').join('\n'),
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startGame(nPlayers, full) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        players = [];
        banner = null;
        world = makeWorld(HOLES[0]);
        ball = newBall(world.tee.x, world.tee.y);
        api.setScore('—');
        api.setStatus('Pick a ball type before every hole. Each type can be used only 3 times per round.');
        api.menu({
          title: 'Mini Golf',
          text: 'Nine holes. Before each one you choose a bouncy, sticky or heavy ball, and each type can be used only 3 times.',
          buttons: [
            { label: 'Solo', primary: true, onClick: () => showCourseMenu(1) },
            { label: '2 players', onClick: () => showCourseMenu(2) },
            { label: '3 players', onClick: () => showCourseMenu(3) },
            { label: '4 players', onClick: () => showCourseMenu(4) }
          ]
        });
      }

      function showCourseMenu(n) {
        api.menu({
          title: n === 1 ? 'Solo round' : n + ' players',
          text: (n === 1 ? 'Only the full course counts for your best score.'
            : 'Players take turns on each hole and pass the device between turns. Lowest total wins.') +
            ' A quick round is 3 random holes with one of each ball.',
          buttons: [
            { label: 'Full course', primary: true, onClick: () => startGame(n, true) },
            { label: 'Quick round', onClick: () => startGame(n, false) }
          ]
        });
      }

      /* ---------- Update ---------- */
      function handleEvents(ev) {
        if (ev.wall > 90 && tickCD <= 0) {
          api.sfx('tick');
          tickCD = 0.08;
        }
        if (ev.bumper) {
          const b = ev.bumper;
          api.sfx(type === 'heavy' ? 'tick' : 'hit');
          burst(ball.x, ball.y, type === 'heavy' ? C.muted : C.violet, type === 'bouncy' ? 14 : 6, 160, 0.35, 3);
          if (type === 'bouncy') hint('bumpBouncy', 'Bouncy balls get an extra big kick from bumpers.');
          else if (type === 'heavy') hint('bumpHeavy', 'Heavy balls ignore bumper kicks and just bump off.');
          else hint('bumpSticky', 'Sticky balls only get a small kick from bumpers.');
          void b;
        }
        if (ev.shove) {
          api.sfx('power');
          shake = 5;
          burst(ev.shove.x, ev.shove.y, '#FFD27A', 16, 200, 0.4, 3);
          float('Shove!', ev.shove.x, ev.shove.y - 20, '#FFD27A');
          hint('shove', 'The heavy ball shoved the obstacle out of its way.');
        }
        if (ev.portal) {
          api.sfx('flip');
          burst(ev.portal.from.x, ev.portal.from.y, C.violet, 12, 120, 0.4, 3);
          burst(ev.portal.to.x, ev.portal.to.y, C.violet, 12, 120, 0.4, 3);
          hint('portal', 'Through the tunnel: the ball keeps its speed and comes out of the other mouth.');
        }
        if (ev.sand) {
          burst(ball.x, ball.y, SAND, 8, 70, 0.4, 2.5);
          hint('sand', 'Sand drags every ball to a quick stop.');
        }
        if (ev.slope) {
          if (type === 'sticky') hint('slopeSticky', 'The sticky ball grips the hill and barely drifts.');
          else hint('slope', 'Hills push the ball the way the arrows point.');
        }
      }

      function update(dt) {
        clock += dt;
        stateT += dt;
        inputLock = Math.max(0, inputLock - dt);
        tickCD -= dt;
        shake = Math.max(0, shake - dt * 20);
        if (banner) banner.t += dt;
        floats.forEach((f) => { f.t += dt; });
        floats = floats.filter((f) => f.t < 1.4);
        const dr = Math.max(0, 1 - dt * 3);
        for (const q of parts) {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= dr;
          q.vy *= dr;
          q.life -= dt;
        }
        parts = parts.filter((q) => q.life > 0);
        if (world) {
          world.bumpers.forEach((b) => { b.flash = Math.max(0, b.flash - dt * 4); });
          world.movers.forEach((m) => { m.flash = Math.max(0, m.flash - dt * 3); });
          world.bars.forEach((b) => { b.flash = Math.max(0, b.flash - dt * 3); });
        }

        if (state === 'roll') {
          const ev = {};
          stepWorld(world, ball, T(), dt, ev);
          rollT += dt;
          handleEvents(ev);
          if (ev.sink) return sink();
          if (ev.splash) return splash();
          if (!ball.rest) {
            const sp = Math.hypot(ball.vx, ball.vy);
            slowT = sp < 10 ? slowT + dt : 0;
            if (slowT > 0.6 || rollT > 15) ball.rest = true;
          }
          // Safety net: a ball that somehow leaves the green goes back without a penalty.
          if (!inPoly(ball.x, ball.y, world.def.outline) || inAny(world.blocks, ball.x, ball.y)) {
            ball.x = lie.x;
            ball.y = lie.y;
            ball.rest = true;
            api.setStatus('The ball hopped the rail, so it goes back to where you hit from.');
          }
          if (ball.rest) stopped();
          return;
        }

        // Obstacles keep moving while you aim; the ball at rest blocks them.
        if (state !== 'menu' && state !== 'card' && state !== 'over') stepWorld(world, ball, T(), dt, {});

        if (state === 'aim') {
          const k = api.keys;
          const l = k.has('ArrowLeft') || k.has('KeyA');
          const r = k.has('ArrowRight') || k.has('KeyD');
          if (l !== r) {
            holdA += dt;
            aim.ang += (r ? 1 : -1) * (0.35 + Math.min(1.9, holdA * 1.5)) * dt;
          } else {
            holdA = 0;
          }
          if (k.has('ArrowUp') || k.has('KeyW')) aim.power = Math.min(1, aim.power + 0.55 * dt);
          if (k.has('ArrowDown') || k.has('KeyS')) aim.power = Math.max(0.03, aim.power - 0.55 * dt);
        } else if (state === 'sink') {
          if (stateT > 1.6) endTurn();
        } else if (state === 'splash') {
          if (stateT > 0.9) {
            if (strokes >= CAP) {
              ball.x = lie.x;
              ball.y = lie.y;
              ball.active = true;
              pickUp();
            } else {
              ball = newBall(lie.x, lie.y);
              state = 'aim';
              stateT = 0;
              inputLock = 0.15;
              burst(ball.x, ball.y, '#FFFFFF', 8, 60, 0.3, 2);
            }
          }
        }
      }

      /* ---------- Aim ---------- */
      function currentAim() {
        if (drag) {
          const dx = drag.sx - drag.x;
          const dy = drag.sy - drag.y;
          const len = Math.hypot(dx, dy);
          return { ang: len > 2 ? Math.atan2(dy, dx) : aim.ang, power: U.clamp(len / PULL_MAX, 0, 1), len };
        }
        return { ang: aim.ang, power: aim.power, len: PULL_MAX };
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8;
        ctx.strokeStyle = C.ink;
        ctx.strokeText(text, 0, 0);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function drawGreen() {
        const def = world.def;
        ctx.lineJoin = 'round';
        // Shadow, rails, then the green on top so rails sit outside the playing edge.
        ctx.save();
        ctx.translate(5, 7);
        pathPoly(ctx, def.outline);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth = 22;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.stroke();
        ctx.restore();
        pathPoly(ctx, def.outline);
        ctx.strokeStyle = RAIL_DARK;
        ctx.lineWidth = 22;
        ctx.stroke();
        ctx.strokeStyle = RAIL;
        ctx.lineWidth = 15;
        ctx.stroke();
        ctx.fillStyle = GREEN;
        ctx.fill();
        ctx.save();
        pathPoly(ctx, def.outline);
        ctx.clip();
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let x = -H; x < W; x += 64) {
          ctx.beginPath();
          ctx.moveTo(x, H);
          ctx.lineTo(x + 32, H);
          ctx.lineTo(x + 32 + H, 0);
          ctx.lineTo(x + H, 0);
          ctx.closePath();
          ctx.fill();
        }
        // Slopes: tinted with drifting chevrons.
        world.slopes.forEach((s) => {
          ctx.save();
          pathPoly(ctx, s.poly);
          ctx.fillStyle = 'rgba(10,40,20,0.18)';
          ctx.fill();
          ctx.clip();
          const xs = s.poly.map((q) => q[0]);
          const ys = s.poly.map((q) => q[1]);
          const x0 = Math.min(...xs);
          const x1 = Math.max(...xs);
          const y0 = Math.min(...ys);
          const y1 = Math.max(...ys);
          const len = Math.hypot(s.dx, s.dy) || 1;
          const ux = s.dx / len;
          const uy = s.dy / len;
          const off = (clock * 26) % 48;
          ctx.strokeStyle = 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          for (let gx = x0 + 24; gx < x1 + 48; gx += 56) {
            for (let gy = y0 - 48; gy < y1 + 48; gy += 48) {
              const cx = gx + ux * off + (Math.abs(ux) > 0.5 ? 0 : 0);
              const cy = gy + uy * off;
              ctx.beginPath();
              ctx.moveTo(cx - uy * 9 - ux * 6, cy + ux * 9 - uy * 6);
              ctx.lineTo(cx, cy);
              ctx.lineTo(cx + uy * 9 - ux * 6, cy - ux * 9 - uy * 6);
              ctx.stroke();
            }
          }
          ctx.lineCap = 'butt';
          ctx.restore();
        });
        // Sand.
        world.sand.forEach((p) => {
          pathPoly(ctx, p);
          ctx.fillStyle = SAND;
          ctx.fill();
          ctx.strokeStyle = '#D9BA6E';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.save();
          pathPoly(ctx, p);
          ctx.clip();
          ctx.fillStyle = SAND_DOT;
          const xs = p.map((q) => q[0]);
          const ys = p.map((q) => q[1]);
          for (let x = Math.min(...xs); x < Math.max(...xs); x += 11) {
            for (let y = Math.min(...ys); y < Math.max(...ys); y += 9) {
              const j = ((x * 7 + y * 13) % 5) - 2;
              ctx.fillRect(x + j, y + ((x + y) % 4), 2, 2);
            }
          }
          ctx.restore();
        });
        // Water with moving ripples.
        world.water.forEach((p) => {
          pathPoly(ctx, p);
          ctx.fillStyle = WATER;
          ctx.fill();
          ctx.strokeStyle = '#1E5E9E';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.save();
          pathPoly(ctx, p);
          ctx.clip();
          ctx.strokeStyle = U.alpha(WATER_LIGHT, 0.45);
          ctx.lineWidth = 2;
          const xs = p.map((q) => q[0]);
          const ys = p.map((q) => q[1]);
          for (let y = Math.min(...ys) + 12; y < Math.max(...ys); y += 18) {
            for (let x = Math.min(...xs) + ((y / 18) % 2) * 22; x < Math.max(...xs); x += 44) {
              const dx = Math.sin(clock * 1.5 + y * 0.1 + x * 0.05) * 6;
              ctx.beginPath();
              ctx.moveTo(x + dx, y);
              ctx.quadraticCurveTo(x + dx + 7, y - 4, x + dx + 14, y);
              ctx.stroke();
            }
          }
          ctx.restore();
        });
        // Plank bridges.
        world.bridges.forEach((p) => {
          pathPoly(ctx, p);
          ctx.fillStyle = '#B07A45';
          ctx.fill();
          ctx.strokeStyle = RAIL_DARK;
          ctx.lineWidth = 2;
          ctx.stroke();
          const xs = p.map((q) => q[0]);
          const ys = p.map((q) => q[1]);
          ctx.strokeStyle = 'rgba(70,40,15,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = Math.min(...xs) + 14; x < Math.max(...xs); x += 14) {
            ctx.moveTo(x, Math.min(...ys) + 1);
            ctx.lineTo(x, Math.max(...ys) - 1);
          }
          ctx.stroke();
        });
        ctx.restore();
        // A crisp edge where the green meets the rails.
        pathPoly(ctx, def.outline);
        ctx.strokeStyle = GREEN_DARK;
        ctx.lineWidth = 2;
        ctx.stroke();
        // Solid blocks.
        world.blocks.forEach((p) => {
          ctx.save();
          ctx.translate(3, 4);
          pathPoly(ctx, p);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fill();
          ctx.restore();
          pathPoly(ctx, p);
          ctx.fillStyle = RAIL;
          ctx.fill();
          ctx.strokeStyle = RAIL_DARK;
          ctx.lineWidth = 3;
          ctx.stroke();
        });
      }

      function drawTeeAndCup() {
        const t = world.tee;
        ctx.fillStyle = 'rgba(15,60,30,0.35)';
        U.roundRect(ctx, t.x - 22, t.y - 16, 44, 32, 6);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const c = world.cup;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.beginPath();
        ctx.arc(c.x, c.y, CUP_R + 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#0E2A1A';
        ctx.beginPath();
        ctx.arc(c.x, c.y, CUP_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#071810';
        ctx.beginPath();
        ctx.arc(c.x + 1.5, c.y + 2, CUP_R - 3, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawPortals() {
        world.portals.forEach((p) => {
          [p.a, p.b].forEach((q, i) => {
            ctx.fillStyle = '#1B1440';
            ctx.beginPath();
            ctx.arc(q.x, q.y, PORTAL_R + 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = C.violet;
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.strokeStyle = U.alpha(C.violet, 0.7);
            ctx.lineWidth = 2;
            for (let k = 0; k < 3; k++) {
              const a = clock * (i ? -3 : 3) + (k * Math.PI * 2) / 3;
              ctx.beginPath();
              ctx.arc(q.x, q.y, PORTAL_R - 5, a, a + 1.2);
              ctx.stroke();
            }
            // Exit arrow.
            const ax = q.x + q.dx * (PORTAL_R + 8);
            const ay = q.y + q.dy * (PORTAL_R + 8);
            ctx.fillStyle = U.alpha(C.violet, 0.9);
            ctx.beginPath();
            ctx.moveTo(ax + q.dx * 7, ay + q.dy * 7);
            ctx.lineTo(ax - q.dy * 6, ay + q.dx * 6);
            ctx.lineTo(ax + q.dy * 6, ay - q.dx * 6);
            ctx.closePath();
            ctx.fill();
          });
        });
      }

      function drawBumpers() {
        world.bumpers.forEach((b) => {
          const r = b.r + b.flash * 3;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.arc(b.x + 3, b.y + 4, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = b.flash > 0 ? '#FFFFFF' : C.violet;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#6A4FD8';
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 0.66, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.beginPath();
          ctx.arc(b.x, b.y, r * 0.3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      function drawMovers() {
        world.movers.forEach((m) => {
          // Track groove.
          ctx.strokeStyle = 'rgba(10,40,20,0.45)';
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(m.x + m.w / 2, m.y + m.h / 2);
          ctx.lineTo(m.x + m.w / 2 + m.ax * m.range, m.y + m.h / 2 + m.ay * m.range);
          ctx.stroke();
          ctx.lineCap = 'butt';
          const x = moverX(m);
          const y = moverY(m);
          ctx.save();
          if (m.ghostT > 0) ctx.globalAlpha = 0.55;
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(x + 3, y + 4, m.w, m.h);
          ctx.fillStyle = m.flash > 0.5 ? '#FFF1C9' : '#F0A040';
          ctx.fillRect(x, y, m.w, m.h);
          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, m.w, m.h);
          ctx.clip();
          ctx.fillStyle = '#2B2238';
          for (let k = -m.h; k < m.w + m.h; k += 14) {
            ctx.beginPath();
            ctx.moveTo(x + k, y);
            ctx.lineTo(x + k + 7, y);
            ctx.lineTo(x + k + 7 - m.h, y + m.h);
            ctx.lineTo(x + k - m.h, y + m.h);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
          ctx.strokeStyle = '#2B2238';
          ctx.lineWidth = 2.5;
          ctx.strokeRect(x, y, m.w, m.h);
          if (m.shoveT > 0) {
            ctx.strokeStyle = U.alpha('#FFD27A', m.shoveT * 2);
            ctx.lineWidth = 2;
            for (let k = 1; k <= 3; k++) {
              const bx = x + m.w / 2 - m.ax * m.dir * (m.w / 2 + k * 8);
              const by = y + m.h / 2 - m.ay * m.dir * (m.h / 2 + k * 8);
              ctx.beginPath();
              ctx.moveTo(bx - m.ay * 10, by - m.ax * 10);
              ctx.lineTo(bx + m.ay * 10, by + m.ax * 10);
              ctx.stroke();
            }
          }
          ctx.restore();
        });
      }

      function drawBars() {
        world.bars.forEach((b) => {
          const e = barEnds(b);
          ctx.lineCap = 'round';
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = BAR_T * 2;
          ctx.beginPath();
          ctx.moveTo(e[0] + 3, e[1] + 4);
          ctx.lineTo(e[2] + 3, e[3] + 4);
          ctx.stroke();
          ctx.strokeStyle = '#2B2238';
          ctx.lineWidth = BAR_T * 2 + 3;
          ctx.beginPath();
          ctx.moveTo(e[0], e[1]);
          ctx.lineTo(e[2], e[3]);
          ctx.stroke();
          ctx.strokeStyle = b.flash > 0.4 ? '#FFF1C9' : '#E4E8F5';
          ctx.lineWidth = BAR_T * 2 - 2;
          ctx.stroke();
          ctx.strokeStyle = C.p1;
          ctx.lineWidth = BAR_T * 2 - 2;
          ctx.beginPath();
          ctx.moveTo(e[0], e[1]);
          ctx.lineTo(U.lerp(e[0], e[2], 0.12), U.lerp(e[1], e[3], 0.12));
          ctx.moveTo(e[2], e[3]);
          ctx.lineTo(U.lerp(e[2], e[0], 0.12), U.lerp(e[3], e[1], 0.12));
          ctx.stroke();
          ctx.lineCap = 'butt';
          ctx.fillStyle = C.violet;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.beginPath();
          ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      function drawAim() {
        const a = currentAim();
        if (drag && a.len < 6) return;
        const col = players.length ? cur().color : C.p1;
        const ux = Math.cos(a.ang);
        const uy = Math.sin(a.ang);
        // Slingshot band behind the ball.
        const pull = a.power * PULL_MAX * 0.6 + 6;
        ctx.strokeStyle = U.alpha(col, 0.85);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ball.x - ux * (R + 3), ball.y - uy * (R + 3));
        ctx.lineTo(ball.x - ux * (R + 3 + pull), ball.y - uy * (R + 3 + pull));
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(ball.x - ux * (R + 3 + pull), ball.y - uy * (R + 3 + pull), 5, 0, Math.PI * 2);
        ctx.fill();
        // Dotted preview of the first stretch of the roll.
        const est = Math.min(rollDistance(T(), a.power * VMAX), 420);
        let len = 0;
        let hit = false;
        while (len < est) {
          const nl = Math.min(est, len + 4);
          if (touchesSolid(world, ball.x + ux * nl, ball.y + uy * nl)) {
            hit = true;
            break;
          }
          len = nl;
        }
        for (let d = R + 8; d < len; d += 12) {
          const f = 1 - (d / Math.max(len, 1)) * 0.6;
          ctx.fillStyle = U.alpha('#FFFFFF', 0.85 * f);
          ctx.beginPath();
          ctx.arc(ball.x + ux * d, ball.y + uy * d, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
        const ex = ball.x + ux * len;
        const ey = ball.y + uy * len;
        ctx.strokeStyle = U.alpha(hit ? C.gold : '#FFFFFF', 0.85);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(ex, ey, R, 0, Math.PI * 2);
        ctx.stroke();
        // Power readout.
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tx = ball.x - ux * (R + 22 + pull);
        const ty = ball.y - uy * (R + 22 + pull);
        const label = Math.round(a.power * 100) + '%';
        ctx.fillStyle = U.alpha(C.ink, 0.75);
        U.roundRect(ctx, tx - 20, ty - 10, 40, 20, 8);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.fillText(label, tx, ty);
      }

      function drawHud() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, TOP);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, TOP - 2, W, 2);
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        const y = TOP / 2;
        if (!players.length) {
          ctx.textAlign = 'left';
          ctx.fillStyle = C.mint;
          ctx.fillText('Mini Golf', 16, y);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.muted;
          ctx.fillText('9 holes · 3 ball types', W - 16, y);
          return;
        }
        const h = hole();
        ctx.textAlign = 'left';
        let x = 16;
        const put = (text, color) => {
          ctx.fillStyle = color;
          ctx.fillText(text, x, y);
          x += ctx.measureText(text).width + 14;
        };
        put('Hole ' + (holeNo + 1) + '/' + holes.length, C.gold);
        put('Par ' + h.par, C.text);
        put(h.name, C.muted);
        // Current player and ball.
        const p = cur();
        const pickedType = state !== 'pick' && p.picks[holeNo] ? p.picks[holeNo] : null;
        const label = p.name + (pickedType ? ' · ' + TYPES[pickedType].name : ' · picking');
        ctx.textAlign = 'center';
        const cx = W / 2 + 40;
        const lw = ctx.measureText(label).width;
        if (pickedType) drawBall(ctx, cx - lw / 2 - 14, y, pickedType, 1);
        ctx.fillStyle = p.color;
        ctx.fillText(label, cx, y);
        // Strokes and remaining balls.
        ctx.textAlign = 'right';
        let rx = W - 16;
        for (let i = ORDER.length - 1; i >= 0; i--) {
          const k = ORDER[i];
          const n = p.uses[k];
          ctx.fillStyle = n > 0 ? C.text : U.alpha(C.muted, 0.5);
          ctx.fillText('×' + n, rx, y);
          const tw = ctx.measureText('×' + n).width;
          ctx.save();
          if (n <= 0) ctx.globalAlpha = 0.35;
          drawBall(ctx, rx - tw - 10, y, k, 1);
          ctx.restore();
          rx -= tw + 32;
        }
        ctx.fillStyle = strokes >= CAP - 1 ? C.p1 : C.text;
        ctx.fillText('Stroke ' + strokes + '/' + CAP, rx - 6, y);
      }

      function drawCard() {
        const n = players.length;
        const nh = holes.length;
        const colW = nh > 3 ? 44 : 70;
        const nameW = 140;
        const tw = nameW + nh * colW + 80 + 70;
        const rowH = 34;
        const th = 74 + rowH * (n + 2) + 40;
        const x0 = (W - tw) / 2;
        const y0 = TOP + (H - TOP - th) / 2;
        const a = Math.min(1, stateT * 5);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = U.alpha(C.ink, 0.55);
        ctx.fillRect(0, TOP, W, H - TOP);
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x0, y0, tw, th, 18);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.mint;
        ctx.fillText(holeNo + 1 >= nh ? 'Final card' : 'Scorecard', x0 + 22, y0 + 32);
        ctx.font = HUD;
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('after hole ' + (holeNo + 1) + ' of ' + nh, x0 + tw - 22, y0 + 32);
        const top = y0 + 62;
        const colX = (i) => x0 + nameW + i * colW + colW / 2;
        const totX = x0 + nameW + nh * colW + 40;
        const relX = totX + 74;
        ctx.textAlign = 'center';
        // Header and par rows.
        ctx.fillStyle = U.alpha(C.panel2, 1);
        ctx.fillRect(x0 + 12, top, tw - 24, rowH * 2);
        ctx.fillStyle = U.alpha(C.mint, 0.12);
        ctx.fillRect(colX(holeNo) - colW / 2, top, colW, rowH * (n + 2));
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('Hole', x0 + 24, top + rowH / 2);
        ctx.fillText('Par', x0 + 24, top + rowH * 1.5);
        ctx.textAlign = 'center';
        for (let i = 0; i < nh; i++) {
          ctx.fillStyle = i === holeNo ? C.mint : C.muted;
          ctx.fillText(String(holes[i] + 1), colX(i), top + rowH / 2);
          ctx.fillStyle = C.text;
          ctx.fillText(String(HOLES[holes[i]].par), colX(i), top + rowH * 1.5);
        }
        ctx.fillStyle = C.muted;
        ctx.fillText('Total', totX, top + rowH / 2);
        ctx.fillText('±', relX, top + rowH / 2);
        ctx.fillStyle = C.text;
        ctx.fillText(String(parUpTo(nh)), totX, top + rowH * 1.5);
        players.forEach((p, r) => {
          const ry = top + rowH * (r + 2) + rowH / 2;
          ctx.textAlign = 'left';
          ctx.fillStyle = p.color;
          ctx.fillText(p.name, x0 + 24, ry);
          ctx.textAlign = 'center';
          let played = 0;
          for (let i = 0; i < nh; i++) {
            const s = p.scores[i];
            if (s === undefined) continue;
            played = i + 1;
            const par = HOLES[holes[i]].par;
            ctx.fillStyle = s < par ? C.gold : s === par ? C.mint : s >= CAP ? C.p1 : C.text;
            ctx.fillText(String(s), colX(i) - 4, ry);
            const k = p.picks[i];
            if (k) {
              ctx.fillStyle = TYPES[k].color;
              ctx.beginPath();
              ctx.arc(colX(i) + 11, ry - 6, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          const tot = holeTotal(p);
          const d = tot - parUpTo(played);
          ctx.fillStyle = C.text;
          ctx.fillText(String(tot), totX, ry);
          ctx.fillStyle = d < 0 ? C.gold : d === 0 ? C.mint : C.p1;
          ctx.fillText(d === 0 ? 'E' : (d > 0 ? '+' : '−') + Math.abs(d), relX, ry);
        });
        ctx.strokeStyle = U.alpha(C.line, 0.9);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let r = 1; r <= n + 1; r++) {
          ctx.moveTo(x0 + 12, top + rowH * r);
          ctx.lineTo(x0 + tw - 12, top + rowH * r);
        }
        ctx.stroke();
        // Legend for the ball dots.
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        let lx = x0 + 24;
        const ly = y0 + th - 22;
        ORDER.forEach((k) => {
          ctx.fillStyle = TYPES[k].color;
          ctx.beginPath();
          ctx.arc(lx + 4, ly, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.muted;
          ctx.fillText(TYPES[k].name, lx + 13, ly);
          lx += 92;
        });
        ctx.textAlign = 'right';
        ctx.fillStyle = U.alpha(C.text, 0.6 + 0.4 * Math.sin(clock * 4));
        ctx.fillText(holeNo + 1 >= nh ? 'Click or Space to finish' : 'Click or Space for the next hole', x0 + tw - 22, ly);
        ctx.restore();
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.line, 0.45);
        for (let x = 15; x < W; x += 30) for (let y = TOP + 15; y < H; y += 30) ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawGreen();
        drawTeeAndCup();
        drawPortals();
        drawMovers();
        drawBars();
        drawBumpers();
        if (state === 'aim' && inputLock <= 0.1) drawAim();
        // Ball.
        if (state === 'sink' && sinking) {
          const f = Math.min(1, stateT / 0.35);
          const bx = U.lerp(sinkFrom.x, world.cup.x, f);
          const by = U.lerp(sinkFrom.y, world.cup.y, f);
          if (f < 1) drawBall(ctx, bx, by, type, 1 - f * 0.45);
        } else if (state !== 'splash' && state !== 'menu') {
          drawBall(ctx, ball.x, ball.y, state === 'pick' ? ORDER[Math.floor(clock * 1.5) % 3] : type, 1);
        } else if (state === 'menu') {
          drawBall(ctx, ball.x, ball.y, ORDER[Math.floor(clock * 1.5) % 3], 1);
        }
        const near = Math.hypot(ball.x - world.cup.x, ball.y - world.cup.y);
        drawFlag(ctx, world.cup.x, world.cup.y, clock, near < 70 && state === 'roll' ? 0.35 : 1, players.length ? cur().color : C.p1);
        for (const q of parts) {
          ctx.globalAlpha = Math.max(0, q.life / q.max);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        floats.forEach((f) => {
          const al = Math.min(1, (1.4 - f.t) * 2);
          ctx.fillStyle = U.alpha(C.ink, 0.7 * al);
          const tw = ctx.measureText(f.text).width + 20;
          U.roundRect(ctx, f.x - tw / 2, f.y - 13 - f.t * 24, tw, 26, 13);
          ctx.fill();
          ctx.fillStyle = U.alpha(f.color, al);
          ctx.fillText(f.text, f.x, f.y - f.t * 24);
        });
        ctx.restore();
        drawHud();
        if (banner) {
          const a = Math.min(1, banner.t * 5) * Math.min(1, Math.max(0, 1.6 - banner.t) * 3);
          bigText(banner.text, W / 2, TOP + 70, banner.color, 0.8 + Math.min(1, banner.t * 5) * 0.2, a);
        }
        if (state === 'card') drawCard();
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          if (state === 'card') continueCard();
          else if (state === 'aim' && !drag) shoot(aim.ang, aim.power);
        }
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (state === 'card') {
          continueCard();
          return;
        }
        if (state !== 'aim' || inputLock > 0) return;
        const p = api.toCanvas(e, canvas);
        drag = { sx: p.x, sy: p.y, x: p.x, y: p.y };
      });
      api.on(window, 'pointermove', (e) => {
        if (!drag) return;
        const p = api.toCanvas(e, canvas);
        drag.x = p.x;
        drag.y = p.y;
      });
      api.on(window, 'pointerup', () => {
        if (!drag) return;
        const a = currentAim();
        drag = null;
        if (state !== 'aim') return;
        if (a.len < 12) return;
        shoot(a.ang, a.power);
      });
      api.on(window, 'pointercancel', () => { drag = null; });

      if (api.onPause) api.onPause(() => { drag = null; });
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
