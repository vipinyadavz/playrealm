/* Bounce Architect — you never touch the ball. Draw short-lived bounce lines to steer a
   falling ball through every ring and into the goal cup. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 720;
  const H = 720;
  const TOP = 44;             // HUD strip; the playfield starts below it
  const R = 10;               // ball radius
  const GRAV = 680;
  const MAX_SPEED = 1150;
  const STEP_MAX = 4;         // max px per physics sub-step (well under R, so nothing tunnels)
  const LINE_LIFE = 3;
  const LINE_FADE = 0.8;
  const MAX_LINES = 3;
  const LINE_HALF = 3;
  const LINE_E = 0.9;
  const LINE_KICK = 28;
  const LINE_MIN = 22;
  const LINE_MAX = 250;
  const INK_MAX = 520;
  const INK_REGEN = 90;
  const WALL_HALF = 5;
  const WALL_E = 0.55;
  const SPIKE_HALF = 5;
  const BUMP_MIN = 540;
  const RING_R = 20;
  const PORTAL_R = 22;
  const CUP_W = 100;
  const CUP_H = 58;
  const HOLD = 3;
  const STUCK_TIME = 3;
  const STUCK_PENALTY = 25;
  const SL = 40;              // endless shaft: inner face of the left wall
  const SR = 680;             // endless shaft: inner face of the right wall
  const TAU = Math.PI * 2;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const FONT_SMALL = '600 12px "JetBrains Mono", monospace';

  /* Level format (720×720, playfield y >= 44):
     launch [x, y]; cup [centerX, topY]; rings [x, y, dx?, dy?, speed?] (dx/dy = drift amplitude);
     walls / spikes [x1, y1, x2, y2]; bumpers [x, y, r]; winds [x, y, w, h, ax, ay]; portals [ax, ay, bx, by]. */
  const LEVELS = [
    { name: 'First bounce', launch: [200, 84], cup: [560, 646], rings: [[420, 420]],
      hint: 'Drag to draw a slanted line under the ball. It bounces off at that angle: hit the gold ring, then the cup.' },
    { name: 'Detour', launch: [540, 84], cup: [420, 646], rings: [[300, 300], [180, 510]],
      walls: [[420, 300, 660, 340]],
      hint: 'Walls are solid. Knock the ball left before it lands on the shelf.' },
    { name: 'Funnel', launch: [360, 84], cup: [580, 646], rings: [[170, 320], [550, 320], [360, 560]],
      walls: [[40, 400, 290, 480], [680, 400, 430, 480]],
      hint: 'Steep lines kick the ball back up and across. Grab both side rings.' },
    { name: 'Bumpers', launch: [140, 84], cup: [140, 646], rings: [[470, 250], [620, 330], [400, 580]],
      bumpers: [[330, 300, 26], [520, 430, 26], [250, 500, 22]],
      hint: 'Violet bumpers fire the ball off hard. Use them instead of fighting them.' },
    { name: 'Spikes', launch: [360, 84], cup: [360, 646], rings: [[180, 380], [540, 380]],
      spikes: [[280, 300, 440, 300], [560, 520, 720, 520]],
      hint: 'Coral spikes pop the ball. You get 3 balls per level, so steer clear.' },
    { name: 'Crosswind', launch: [150, 84], cup: [300, 646], rings: [[400, 340], [600, 560]],
      winds: [[0, 260, 720, 170, 420, 0]], spikes: [[716, 240, 716, 450]],
      hint: 'The wind band shoves the ball right, into a spiked wall. Brake it with a line.' },
    { name: 'Portals', launch: [110, 84], cup: [180, 646], rings: [[400, 250], [300, 590]],
      walls: [[0, 400, 600, 400]], portals: [[220, 320, 500, 500]],
      hint: 'Portals are two-way: fall into one and you pop out of the other.' },
    { name: 'Moving rings', launch: [360, 84], cup: [360, 646],
      rings: [[360, 260, 180, 0, 0.9], [180, 520, 0, 70, 1.4], [540, 520, 0, 70, 1.4]],
      bumpers: [[360, 410, 24]],
      hint: 'These rings drift. Time your lines to meet them.' },
    { name: 'Spike garden', launch: [600, 84], cup: [400, 646], rings: [[420, 200], [200, 380], [600, 560]],
      bumpers: [[300, 300, 24], [470, 470, 24]],
      spikes: [[500, 260, 640, 260], [120, 460, 300, 460], [0, 610, 240, 610]],
      hint: 'Bumpers among spikes. Short, precise lines win here.' },
    { name: 'Wind tunnel', launch: [100, 84], cup: [600, 646], rings: [[360, 180], [600, 320], [360, 560]],
      winds: [[240, 44, 240, 300, -380, 0]], portals: [[120, 520, 600, 200]],
      walls: [[460, 400, 720, 440]],
      hint: 'Wind blows left up top, and a portal links the low left to the high right.' },
    { name: 'Drift', launch: [360, 84], cup: [140, 646],
      rings: [[140, 250, 0, 60, 1.2], [580, 420, 90, 0, 1.0], [360, 560, 160, 0, 1.6]],
      spikes: [[250, 330, 470, 330], [0, 470, 180, 470]],
      hint: 'Drifting rings over spikes. Wait for the right moment.' },
    { name: 'Pinball', launch: [360, 84], cup: [600, 646], rings: [[280, 300], [440, 300], [250, 570], [470, 570]],
      bumpers: [[200, 230, 24], [520, 230, 24], [360, 360, 28], [150, 450, 22], [570, 450, 22], [360, 520, 20]],
      spikes: [[0, 640, 240, 640]],
      hint: 'Six bumpers. Nudge the ball and let them do the work.' },
    { name: 'Updraft', launch: [120, 84], cup: [200, 646], rings: [[380, 180], [600, 400], [120, 480]],
      winds: [[300, 300, 160, 420, 0, -1150]], spikes: [[520, 560, 720, 560]],
      hint: 'A strong updraft lifts the ball. Ride it up to the high ring.' },
    { name: 'Labyrinth', launch: [100, 84], cup: [600, 646], rings: [[300, 175], [620, 290], [110, 430], [430, 600]],
      walls: [[0, 220, 480, 260], [720, 350, 240, 390], [0, 480, 480, 520]], spikes: [[0, 640, 200, 640]],
      hint: 'The shelves roll the ball along, but every ring sits off the easy path.' },
    { name: 'Grand finale', launch: [360, 84], cup: [360, 646],
      rings: [[240, 180, 0, 50, 1.3], [480, 180, 0, 50, 1.3], [360, 420, 150, 0, 1.1], [640, 410]],
      bumpers: [[160, 300, 24], [560, 300, 24]],
      spikes: [[300, 250, 420, 250], [0, 520, 160, 520], [560, 520, 720, 520]],
      winds: [[0, 570, 300, 100, 500, 0]], portals: [[80, 420, 640, 180]],
      hint: 'Everything at once. Good luck, architect.' }
  ];

  /* Closest point on a segment, written into `near`; returns squared distance. */
  const near = { x: 0, y: 0 };
  function closest(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    near.x = x1 + dx * t;
    near.y = y1 + dy * t;
    const ox = px - near.x;
    const oy = py - near.y;
    return ox * ox + oy * oy;
  }

  /* ---------- Shared drawing (game + thumbnail) ---------- */

  function strokeSeg(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  function drawWall(ctx, s, k) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = C.line;
    ctx.lineWidth = WALL_HALF * 2 * k;
    strokeSeg(ctx, s.x1, s.y1, s.x2, s.y2);
    ctx.strokeStyle = U.alpha(C.muted, 0.45);
    ctx.lineWidth = 2 * k;
    strokeSeg(ctx, s.x1, s.y1 - 2 * k, s.x2, s.y2 - 2 * k);
  }

  function drawSpikes(ctx, s, k) {
    const dx = s.x2 - s.x1;
    const dy = s.y2 - s.y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const n = Math.max(1, Math.round(len / (12 * k)));
    const step = len / n;
    ctx.fillStyle = C.p1;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const cx = s.x1 + ux * (i + 0.5) * step;
      const cy = s.y1 + uy * (i + 0.5) * step;
      for (const sg of [1, -1]) {
        ctx.moveTo(cx - ux * step * 0.45, cy - uy * step * 0.45);
        ctx.lineTo(cx + nx * 8 * k * sg, cy + ny * 8 * k * sg);
        ctx.lineTo(cx + ux * step * 0.45, cy + uy * step * 0.45);
      }
    }
    ctx.fill();
    ctx.strokeStyle = '#B83A50';
    ctx.lineWidth = 3 * k;
    ctx.lineCap = 'round';
    strokeSeg(ctx, s.x1, s.y1, s.x2, s.y2);
  }

  function drawRing(ctx, x, y, r, t, a) {
    const rr = r + Math.sin(t * 4 + x * 0.05) * 1.5;
    ctx.strokeStyle = U.alpha(C.gold, 0.18 * a);
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = U.alpha(C.gold, a);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, TAU);
    ctx.stroke();
    const sa = t * 2.5 + y * 0.03;
    ctx.fillStyle = U.alpha('#FFFFFF', 0.8 * a);
    ctx.beginPath();
    ctx.arc(x + Math.cos(sa) * rr, y + Math.sin(sa) * rr, 2, 0, TAU);
    ctx.fill();
  }

  function drawBumper(ctx, x, y, r, fl) {
    ctx.fillStyle = U.alpha(C.violet, 0.22 + fl * 0.5);
    ctx.beginPath();
    ctx.arc(x, y, r + fl * 5, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = fl > 0.3 ? '#FFFFFF' : C.violet;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = C.violet;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, TAU);
    ctx.fill();
  }

  function drawPortal(ctx, x, y, t) {
    ctx.fillStyle = U.alpha(C.ink, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, PORTAL_R, 0, TAU);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = C.violet;
    ctx.beginPath();
    ctx.arc(x, y, PORTAL_R, t * 2, t * 2 + TAU);
    ctx.stroke();
    ctx.strokeStyle = C.p2;
    ctx.beginPath();
    ctx.arc(x, y, PORTAL_R - 7, -t * 3, -t * 3 + TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = U.alpha(C.violet, 0.5 + Math.sin(t * 5) * 0.2);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, TAU);
    ctx.fill();
  }

  function drawCup(ctx, cx, top, w, h, open, t) {
    const l = cx - w / 2;
    const r = cx + w / 2;
    ctx.fillStyle = U.alpha(C.mint, open ? 0.16 + Math.sin(t * 5) * 0.05 : 0.07);
    ctx.fillRect(l, top, w, h);
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = WALL_HALF * 2 * (w / CUP_W);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(l, top);
    ctx.lineTo(l, top + h);
    ctx.lineTo(r, top + h);
    ctx.lineTo(r, top);
    ctx.stroke();
    if (!open) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = U.alpha(C.muted, 0.8);
      ctx.lineWidth = 3;
      strokeSeg(ctx, l, top, r, top);
      ctx.setLineDash([]);
      // Padlock.
      const ly = top + h * 0.55;
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(cx, ly - 4, 5, Math.PI, 0);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      ctx.fillRect(cx - 7, ly - 4, 14, 11);
    } else {
      const bob = Math.sin(t * 6) * 5;
      ctx.fillStyle = C.mint;
      ctx.beginPath();
      ctx.moveTo(cx - 10, top - 30 + bob);
      ctx.lineTo(cx + 10, top - 30 + bob);
      ctx.lineTo(cx, top - 16 + bob);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawBall(ctx, x, y, r) {
    ctx.fillStyle = U.alpha(C.text, 0.18);
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.p2, 0.55);
    ctx.beginPath();
    ctx.arc(x + r * 0.25, y + r * 0.25, r * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, TAU);
    ctx.fill();
  }

  function drawBounceLine(ctx, x1, y1, x2, y2, a, glow, k) {
    ctx.lineCap = 'round';
    ctx.strokeStyle = U.alpha(C.p2, (0.14 + glow * 0.4) * a);
    ctx.lineWidth = (12 + glow * 10) * k;
    strokeSeg(ctx, x1, y1, x2, y2);
    ctx.strokeStyle = U.alpha(C.p2, a);
    ctx.lineWidth = 5 * k;
    strokeSeg(ctx, x1, y1, x2, y2);
    if (glow > 0.05) {
      ctx.strokeStyle = U.alpha('#FFFFFF', glow * a);
      ctx.lineWidth = 2 * k;
      strokeSeg(ctx, x1, y1, x2, y2);
    }
  }

  function drawLauncher(ctx, x, y) {
    ctx.fillStyle = C.panel2;
    ctx.strokeStyle = C.p2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 26, y - 32);
    ctx.lineTo(x + 26, y - 32);
    ctx.lineTo(x + 14, y - 15);
    ctx.lineTo(x - 14, y - 15);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  Arcade.register({
    id: 'bounce-architect',
    title: 'Bounce Architect',
    category: 'fresh',
    mode: 'solo',
    players: '1P',
    best: 'high',
    original: true,
    color: C.p2,
    tagline: 'Draw quick bounce lines to guide a falling ball through rings and into the cup.',
    hook: "You can't touch the ball: draw short-lived bounce lines to guide it through every ring.",
    tags: ['physics', 'drawing', 'puzzle', 'gravity', 'levels', 'endless', 'ball', 'mouse', 'touch', 'original'],
    howTo: 'A ball drops from the launcher at the top and you can never touch it. Instead, press, drag and ' +
      'release to draw a straight bounce line; the ball rebounds off it at whatever angle you drew. Lines fade ' +
      'after 3 seconds, only 3 can exist at once (the oldest vanishes), and they cost ink, which refills slowly. ' +
      'Pass the ball through every gold ring to unlock the cup, then drop it in. Bumpers fire it off, coral ' +
      'spikes pop it, wind pushes it and portals warp it. You have 3 balls per level. A dotted guide shows the ' +
      'first bounce while you draw. Endless drop is a bottomless shaft: collect rings and dive deep.',
    controls: [
      { keys: ['Drag'], label: 'Draw a bounce line' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the crosshair' },
      { keys: ['Space'], label: 'Start / finish a line at the crosshair' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = U.alpha(C.line, 0.5);
      for (let x = 10; x < 320; x += 20) {
        for (let y = 10; y < 200; y += 20) ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      // Path: drop, bounce off the line, arc through both rings into the cup.
      const at = (u) => {
        if (u < 0.3) {
          const s = u / 0.3;
          return { x: 85, y: 34 + 70 * s * s };
        }
        const s = ((u - 0.3) / 0.7) * 1.2;
        return { x: 85 + 150 * s, y: 104 - 120 * s + 150 * s * s };
      };
      const u = (0.55 + t * 0.32) % 1;
      ctx.fillStyle = U.alpha(C.text, 0.22);
      for (let i = 0; i <= 60; i++) {
        const p = at(i / 60);
        ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
      // Ink meter + line pips.
      ctx.fillStyle = C.panel2;
      ctx.fillRect(12, 12, 70, 6);
      ctx.fillStyle = C.p2;
      ctx.fillRect(12, 12, 46, 6);
      drawLauncher(ctx, 85, 46);
      drawSpikes(ctx, { x1: 16, y1: 184, x2: 120, y2: 184 }, 0.8);
      drawBumper(ctx, 222, 42, 13, 0);
      // Older faded line + the active glowing line.
      drawBounceLine(ctx, 200, 150, 232, 168, 0.3, 0, 0.8);
      const near = Math.abs(u - 0.3) < 0.06 ? 1 - Math.abs(u - 0.3) / 0.06 : 0;
      drawBounceLine(ctx, 40.5, 92.6, 121.5, 131.4, 1, 0.35 + near * 0.65, 0.8);
      const rings = [{ x: 145, y: 80, u: 0.3 + (0.4 / 1.2) * 0.7 }, { x: 212, y: 110, u: 0.3 + (0.85 / 1.2) * 0.7 }];
      for (const r of rings) {
        const since = u - r.u;
        if (since > 0 && since < 0.12) {
          ctx.strokeStyle = U.alpha(C.gold, 1 - since / 0.12);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(r.x, r.y, 14 + since * 160, 0, TAU);
          ctx.stroke();
        } else if (since <= 0) {
          drawRing(ctx, r.x, r.y, 14, t, 1);
        } else {
          drawRing(ctx, r.x, r.y, 14, t, 0.25);
        }
      }
      drawCup(ctx, 265, 150, 50, 36, u > rings[1].u, t);
      for (let i = 6; i >= 1; i--) {
        const p = at(Math.max(0, u - i * 0.012));
        ctx.fillStyle = U.alpha(C.text, 0.25 * (1 - i / 7));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7 * (1 - i / 10), 0, TAU);
        ctx.fill();
      }
      const b = at(u);
      drawBall(ctx, b.x, b.y, 7);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      try { canvas.style.touchAction = 'none'; } catch (e) { /* cosmetic only */ }

      let state = 'menu'; // 'menu' | 'play' | 'clear' | 'over'
      let mode = 'levels'; // 'levels' | 'endless'
      let levelIdx = 0;
      const cleared = new Set();
      let score = 0;
      let levelStartScore = 0;
      let shownScore = null;
      let world;
      let ball = null;
      let lines = [];
      let draft = null;
      let ink = INK_MAX;
      let balls = 3;
      let ringsGot = 0;
      let ringsTotal = 0;
      let unlocked = false;
      let particles = [];
      let pops = [];
      let floaters = [];
      let trail = [];
      let banner = null;
      let camY = 0;
      let time = 0;
      let levelT = 0;
      let shake = 0;
      let flash = 0;
      let flashColor = C.p1;
      let stuckT = 0;
      let anchorX = 0;
      let anchorY = 0;
      let sndCd = 0;
      let runId = 0;
      let genY = 0;
      let maxY = 0;
      let ringPts = 0;
      let penalty = 0;
      const cross = { x: W / 2, y: H / 2, on: false };
      const told = {};

      function hint(key, text) {
        if (told[key]) return;
        told[key] = true;
        api.setStatus(text);
      }

      /* ---------- World setup ---------- */

      function emptyWorld() {
        return { launch: { x: 360, y: 100 }, walls: [], spikes: [], bumpers: [], rings: [], winds: [], portals: [],
          cup: null, cupSegs: [], lid: null };
      }
      const seg = (a) => ({ x1: a[0], y1: a[1], x2: a[2], y2: a[3] });

      function buildLevel(def) {
        const w = emptyWorld();
        w.launch = { x: def.launch[0], y: def.launch[1] };
        w.walls = (def.walls || []).map(seg);
        w.spikes = (def.spikes || []).map(seg);
        w.bumpers = (def.bumpers || []).map((b) => ({ x: b[0], y: b[1], r: b[2], flash: 0 }));
        w.rings = (def.rings || []).map((r) => ({ bx: r[0], by: r[1], dx: r[2] || 0, dy: r[3] || 0, sp: r[4] || 0,
          ph: 0, x: r[0], y: r[1], got: false }));
        w.winds = (def.winds || []).map((v) => ({ x: v[0], y: v[1], w: v[2], h: v[3], ax: v[4], ay: v[5] }));
        w.portals = (def.portals || []).map((p) => ({ ax: p[0], ay: p[1], bx: p[2], by: p[3] }));
        if (def.cup) {
          const cx = def.cup[0];
          const top = def.cup[1];
          const l = cx - CUP_W / 2;
          const r = cx + CUP_W / 2;
          w.cup = { x: cx, y: top };
          w.cupSegs = [seg([l, top, l, top + CUP_H]), seg([l, top + CUP_H, r, top + CUP_H]), seg([r, top + CUP_H, r, top])];
          w.lid = seg([l, top, r, top]);
        }
        return w;
      }

      function resetCommon() {
        runId++;
        lines = [];
        draft = null;
        ink = INK_MAX;
        balls = 3;
        particles = [];
        pops = [];
        floaters = [];
        trail = [];
        camY = 0;
        levelT = 0;
        ringsGot = 0;
        shake = 0;
        flash = 0;
        banner = null;
        shownScore = null;
      }

      function spawnBall() {
        const L = world.launch;
        if (mode === 'endless') {
          L.x = 360;
          L.y = camY + 100;
          // Never respawn straight above a spike bar.
          world.spikes = world.spikes.filter((s) => !(Math.max(s.x1, s.x2) > L.x - 90 && Math.min(s.x1, s.x2) < L.x + 90 &&
            Math.max(s.y1, s.y2) > L.y - 30 && Math.min(s.y1, s.y2) < L.y + 280));
        }
        const hold = mode === 'endless' ? 2.5 : HOLD;
        ball = { x: L.x, y: L.y, vx: 0, vy: 0, held: true, holdT: hold, hold0: hold, dead: false, lock: null };
        trail = [];
        stuckT = 0;
        anchorX = ball.x;
        anchorY = ball.y;
      }

      function release() {
        if (!ball || !ball.held || ball.dead) return;
        ball.held = false;
        api.sfx('blip');
      }

      function startLevel(i, startScore) {
        mode = 'levels';
        levelIdx = U.clamp(i, 0, LEVELS.length - 1);
        resetCommon();
        const def = LEVELS[levelIdx];
        world = buildLevel(def);
        score = startScore;
        levelStartScore = startScore;
        ringsTotal = world.rings.length;
        unlocked = ringsTotal === 0;
        spawnBall();
        state = 'play';
        banner = { text: 'Level ' + (levelIdx + 1), sub: def.name, color: C.p2, t: 0, life: 1.8 };
        api.setStatus('Level ' + (levelIdx + 1) + ': ' + def.hint + ' The ball drops in 3 s or when you finish a line.');
      }

      function startEndless() {
        mode = 'endless';
        resetCommon();
        world = emptyWorld();
        score = 0;
        ringPts = 0;
        penalty = 0;
        ringsTotal = 0;
        unlocked = false;
        genY = 520;
        maxY = 100;
        spawnBall();
        generate();
        state = 'play';
        banner = { text: 'Endless drop', sub: 'how deep can you go?', color: C.p2, t: 0, life: 1.8 };
        api.setStatus('Endless drop: the shaft never ends. Grab rings, dodge spikes, dive deep. 3 balls.');
      }

      /* ---------- Endless generator ---------- */

      function addRing(x, y, dx, dy, sp) {
        const bx = U.clamp(x, SL + 30, SR - 30);
        const ax = Math.min(dx || 0, bx - SL - 30, SR - 30 - bx);
        world.rings.push({ bx, by: y, dx: Math.max(0, ax), dy: dy || 0, sp: sp || 0, ph: Math.random() * TAU,
          x: bx, y, got: false });
      }

      function clearOfBumpers(x, y, gap) {
        return world.bumpers.every((b) => Math.hypot(b.x - x, b.y - y) > b.r + gap);
      }

      function genChunk() {
        const d = U.clamp((genY - 600) / 8000, 0, 1);
        const hgt = U.lerp(320, 220, d);
        const y0 = genY;
        const cx = (SL + SR) / 2;
        let kind = 'rings';
        if (genY > 900) {
          const kinds = [['rings', 2.5], ['spikebar', 2 + 3 * d], ['bumpers', 2], ['wind', 1 + d],
            ['wallspikes', 0.6 + 2 * d], ['slant', 1], ['mover', 0.8 + 1.5 * d]];
          let total = 0;
          for (const k of kinds) total += k[1];
          let roll = Math.random() * total;
          for (const k of kinds) {
            roll -= k[1];
            if (roll <= 0) { kind = k[0]; break; }
          }
        }
        if (kind === 'rings') {
          const n = U.randInt(2, 3);
          const x0 = U.rand(SL + 60, SR - 60);
          const dir = x0 > cx ? -1 : 1;
          const gap = U.rand(50, 80);
          for (let i = 0; i < n; i++) addRing(x0 + dir * i * gap, y0 + 60 + i * 50);
        } else if (kind === 'spikebar') {
          const w = U.lerp(180, 340, d) * U.rand(0.85, 1.1);
          const x = U.rand(SL + 30, SR - 30 - w);
          const y = y0 + hgt * 0.55;
          world.spikes.push({ x1: x, y1: y, x2: x + w, y2: y + U.rand(-1, 1) * 40 * d });
          const lg = x - SL;
          const rg = SR - (x + w);
          addRing(lg > rg ? SL + lg / 2 : x + w + rg / 2, y - 30);
        } else if (kind === 'bumpers') {
          const n = U.randInt(2, 3);
          for (let i = 0; i < n; i++) {
            const bx = U.rand(SL + 70, SR - 70);
            const by = y0 + 60 + i * 70;
            if (clearOfBumpers(bx, by, 40)) world.bumpers.push({ x: bx, y: by, r: U.rand(20, 26), flash: 0 });
          }
          for (let tries = 0; tries < 8; tries++) {
            const rx = U.rand(SL + 60, SR - 60);
            const ry = y0 + U.rand(50, hgt - 30);
            if (clearOfBumpers(rx, ry, 46)) { addRing(rx, ry); break; }
          }
        } else if (kind === 'wind') {
          const dir = Math.random() < 0.5 ? -1 : 1;
          const wh = U.rand(120, 170);
          world.winds.push({ x: SL, y: y0 + 50, w: SR - SL, h: wh, ax: dir * U.lerp(260, 460, d), ay: 0 });
          addRing(cx + dir * U.rand(80, 200), y0 + 50 + wh * 0.6);
          if (d > 0.35) {
            const x = dir > 0 ? SR - 1 : SL + 1;
            world.spikes.push({ x1: x, y1: y0 + 40, x2: x, y2: y0 + 60 + wh });
          }
        } else if (kind === 'wallspikes') {
          const side = Math.random() < 0.5 ? -1 : 1;
          const x = side < 0 ? SL + 1 : SR - 1;
          const len = U.rand(140, 240);
          world.spikes.push({ x1: x, y1: y0 + 40, x2: x, y2: y0 + 40 + len });
          addRing(side < 0 ? SR - U.rand(80, 160) : SL + U.rand(80, 160), y0 + 40 + len / 2);
        } else if (kind === 'slant') {
          const side = Math.random() < 0.5 ? -1 : 1;
          const len = U.rand(140, 220);
          const drop = U.rand(70, 120);
          if (side < 0) {
            world.walls.push({ x1: SL, y1: y0 + 60, x2: SL + len, y2: y0 + 60 + drop });
            addRing(SL + len + 50, y0 + 60 + drop + 60);
          } else {
            world.walls.push({ x1: SR, y1: y0 + 60, x2: SR - len, y2: y0 + 60 + drop });
            addRing(SR - len - 50, y0 + 60 + drop + 60);
          }
        } else {
          addRing(cx, y0 + hgt / 2, U.rand(100, 200), 0, U.rand(1, 1.8));
          if (d > 0.3) world.spikes.push({ x1: cx - 70, y1: y0 + hgt / 2 + 70, x2: cx + 70, y2: y0 + hgt / 2 + 70 });
        }
        genY += hgt;
      }

      function generate() {
        let guard = 0;
        while (genY < camY + H + 300 && guard++ < 20) genChunk();
      }

      function cleanup() {
        const cut = camY - 300;
        world.rings = world.rings.filter((r) => !r.got && r.by + r.dy > cut);
        world.walls = world.walls.filter((s) => Math.max(s.y1, s.y2) > cut);
        world.spikes = world.spikes.filter((s) => Math.max(s.y1, s.y2) > cut);
        world.bumpers = world.bumpers.filter((b) => b.y + b.r > cut);
        world.winds = world.winds.filter((v) => v.y + v.h > cut);
      }

      const depthM = () => Math.max(0, Math.floor((maxY - 100) / 20));
      const endlessScore = () => Math.max(0, ringPts + depthM() - penalty);

      /* ---------- Events ---------- */

      function burst(x, y, color, n, speed) {
        for (let i = 0; i < n && particles.length < 320; i++) {
          const a = Math.random() * TAU;
          const s = speed * (0.3 + Math.random() * 0.7);
          const life = 0.4 + Math.random() * 0.5;
          particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - speed * 0.2, life, max: life, color,
            size: 2 + Math.random() * 2.5 });
        }
      }

      function loseBall(reason) {
        if (!ball || ball.dead || state !== 'play') return;
        ball.dead = true;
        burst(ball.x, ball.y, C.p1, 26, 280);
        burst(ball.x, ball.y, C.text, 10, 180);
        pops.push({ x: ball.x, y: ball.y, t: 0, color: C.p1, r: 14 });
        shake = 0.45;
        flash = 0.5;
        flashColor = C.p1;
        balls -= 1;
        api.sfx(balls > 0 ? 'lose' : 'boom');
        const id = runId;
        if (balls > 0) {
          api.setStatus(reason + ' ' + balls + (balls === 1 ? ' ball' : ' balls') + ' left.');
          api.after(850, () => { if (id === runId && state === 'play') spawnBall(); });
        } else {
          api.setStatus(reason + ' No balls left.');
          api.after(1000, () => { if (id === runId && state === 'play') gameOver(); });
        }
      }

      function respawnStuck() {
        burst(ball.x, ball.y, C.muted, 12, 120);
        if (mode === 'levels') score = Math.max(0, score - STUCK_PENALTY);
        else penalty += STUCK_PENALTY;
        floaters.push({ x: ball.x, y: ball.y - 24, text: '−' + STUCK_PENALTY, color: C.p1, t: 0 });
        api.sfx('hit');
        api.setStatus('The ball sat still for 3 s, so it went back to the launcher (−' + STUCK_PENALTY + ').');
        spawnBall();
      }

      function collectRing(r) {
        r.got = true;
        ringsGot++;
        const pts = mode === 'levels' ? 100 : 50;
        if (mode === 'levels') score += pts;
        else ringPts += pts;
        pops.push({ x: r.x, y: r.y, t: 0, color: C.gold, r: RING_R });
        burst(r.x, r.y, C.gold, 16, 230);
        floaters.push({ x: r.x, y: r.y - 28, text: '+' + pts, color: C.gold, t: 0 });
        api.sfx('score');
        if (mode === 'levels' && ringsGot >= ringsTotal && !unlocked) {
          unlocked = true;
          flash = 0.3;
          flashColor = C.mint;
          api.after(150, () => api.sfx('power'));
          if (world.cup) pops.push({ x: world.cup.x, y: world.cup.y + CUP_H / 2, t: 0, color: C.mint, r: CUP_W / 2 });
          api.setStatus('All rings! The cup is open: drop the ball in.');
        } else if (mode === 'levels') {
          hint('ring', 'Ring ' + ringsGot + ' of ' + ringsTotal + '. Collect them all to unlock the cup.');
        }
      }

      function clearLevel() {
        state = 'clear';
        ball.vx = 0;
        ball.vy = 0;
        const bonus = 300 + balls * 100;
        score += bonus;
        shownScore = score;
        api.setScore(score);
        cleared.add(levelIdx);
        api.sfx('win');
        burst(world.cup.x, world.cup.y + 20, C.mint, 40, 420);
        burst(world.cup.x, world.cup.y + 20, C.gold, 24, 360);
        flash = 0.35;
        flashColor = C.mint;
        banner = { text: 'Clear!', sub: '+' + bonus + ' bonus', color: C.mint, t: 0, life: 2 };
        const id = runId;
        api.after(1000, () => { if (id === runId && state === 'clear') showClearMenu(bonus); });
      }

      /* ---------- Menus ---------- */

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Bounce Architect',
          text: 'You can\'t touch the ball. Drag to draw bounce lines (3 at a time, 3 s each, ink limited) ' +
            'to guide it through every ring and into the cup.',
          buttons: [
            { label: 'Levels', primary: true, onClick: showLevelSelect },
            { label: 'Endless drop', onClick: startEndless }
          ]
        });
      }

      function showLevelSelect() {
        state = 'menu';
        const buttons = LEVELS.map((L, i) => ({
          label: (i + 1) + (cleared.has(i) ? ' ✓' : ''),
          primary: i === nextUncleared(),
          onClick: () => startLevel(i, 0)
        }));
        buttons.push({ label: 'Back', onClick: showStartMenu });
        api.menu({
          title: 'Pick a level',
          text: 'Levels get harder as you go. ✓ marks levels cleared this session.',
          buttons
        });
      }

      function nextUncleared() {
        for (let i = 0; i < LEVELS.length; i++) if (!cleared.has(i)) return i;
        return 0;
      }

      function showClearMenu(bonus) {
        const isBest = api.reportScore(score);
        const last = levelIdx >= LEVELS.length - 1;
        const n = levelIdx + 1;
        const ballsTxt = balls + (balls === 1 ? ' ball' : ' balls') + ' left';
        if (isBest) api.sfx('power');
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : last ? 'All 15 levels cleared!' : 'Level ' + n + ' clear!',
          text: (last ? 'You beat the final level. ' : 'Level ' + n + ', ' + LEVELS[levelIdx].name + ', done. ') +
            'Bonus +' + bonus + ' (' + ballsTxt + ').\nScore: ' + score,
          buttons: last
            ? [{ label: 'Play again', primary: true, onClick: () => startLevel(0, 0) },
              { label: 'Endless drop', onClick: startEndless }]
            : [{ label: 'Next level', primary: true, onClick: () => startLevel(levelIdx + 1, score) },
              { label: 'Level select', onClick: showLevelSelect }]
        });
      }

      function gameOver() {
        state = 'over';
        if (mode === 'levels') {
          const isBest = api.reportScore(score);
          api.menu({
            title: isBest ? 'New best: ' + score + '!' : 'Out of balls',
            text: 'Level ' + (levelIdx + 1) + ': ' + LEVELS[levelIdx].name + '. Rings ' + ringsGot + '/' + ringsTotal +
              '.\nScore: ' + score + '. Play again retries this level.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startLevel(levelIdx, levelStartScore) },
              { label: 'Level select', onClick: showLevelSelect }
            ]
          });
        } else {
          const final = endlessScore();
          const isBest = api.reportScore(final);
          api.menu({
            title: isBest ? 'New best: ' + final + '!' : 'Run over',
            text: 'Depth ' + depthM() + ' m, ' + ringsGot + (ringsGot === 1 ? ' ring' : ' rings') + '.\nScore: ' + final,
            buttons: [
              { label: 'Play again', primary: true, onClick: startEndless },
              { label: 'Levels', onClick: showLevelSelect }
            ]
          });
        }
      }

      /* ---------- Drawing lines ---------- */

      function draftEnd() {
        const ex = draft.ex;
        const ey = draft.ey + camY;
        let dx = ex - draft.x1;
        let dy = ey - draft.y1;
        let L = Math.hypot(dx, dy);
        const maxL = Math.max(0, Math.min(LINE_MAX, ink));
        let clamped = false;
        if (L > maxL && L > 0) {
          const k = maxL / L;
          dx *= k;
          dy *= k;
          L = maxL;
          clamped = true;
        }
        return { x: draft.x1 + dx, y: draft.y1 + dy, L, clamped, short: L < LINE_MIN };
      }

      function beginDraft(sx, sy, src) {
        if (state !== 'play' || api.menuOpen) return;
        const y = U.clamp(sy, TOP + 2, H);
        draft = { x1: U.clamp(sx, 0, W), y1: y + camY, ex: sx, ey: y, src };
      }

      function commitDraft() {
        if (!draft) return;
        const e = draftEnd();
        const d = draft;
        draft = null;
        if (state !== 'play') return;
        if (e.short) {
          if (ink < LINE_MIN) api.setStatus('Out of ink: wait a moment for the meter to refill.');
          return;
        }
        const line = { x1: d.x1, y1: d.y1, x2: e.x, y2: e.y, age: 0, glow: 0.6 };
        lines.push(line);
        ink = Math.max(0, ink - e.L);
        if (lines.length > MAX_LINES) {
          const old = lines.shift();
          for (let i = 0; i <= 4; i++) {
            burst(U.lerp(old.x1, old.x2, i / 4), U.lerp(old.y1, old.y2, i / 4), C.p2, 2, 60);
          }
          hint('oldest', 'Only 3 lines at once: drawing a 4th removes the oldest.');
        }
        api.sfx('tick');
        if (ball && ball.held && !ball.dead) release();
        else hint('fade', 'Lines last 3 s and cost ink, which refills slowly. Draw them just in time.');
      }

      /* Ballistic preview: path until the first bounce off the draft line, plus the rebound. */
      function predict(s) {
        const pts = [];
        const after = [];
        if (!ball || ball.dead) return { pts, after, hit: null };
        let x = ball.x;
        let y = ball.y;
        let vx = ball.held ? 0 : ball.vx;
        let vy = ball.held ? 0 : ball.vy;
        const h = 1 / 90;
        const rad = R + LINE_HALF;
        const accel = () => {
          let ax = 0;
          let ay = GRAV;
          for (const w of world.winds) {
            if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) { ax += w.ax; ay += w.ay; }
          }
          vx += ax * h;
          vy += ay * h;
          if (mode === 'endless') {
            const k = dragK();
            vx -= vx * k * h;
            vy -= vy * k * h;
          }
          x += vx * h;
          y += vy * h;
        };
        for (let i = 0; i < 270; i++) {
          accel();
          if (i % 3 === 0) pts.push(x, y);
          if (y > camY + H + 30 || y < camY - 200 || x < -20 || x > W + 20) break;
          const d2 = closest(x, y, s.x1, s.y1, s.x2, s.y2);
          if (d2 < rad * rad) {
            const d = Math.sqrt(d2);
            let nx;
            let ny;
            if (d < 1e-4) {
              const L = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) || 1;
              nx = -(s.y2 - s.y1) / L;
              ny = (s.x2 - s.x1) / L;
              if (nx * vx + ny * vy > 0) { nx = -nx; ny = -ny; }
            } else {
              nx = (x - near.x) / d;
              ny = (y - near.y) / d;
            }
            const vn = vx * nx + vy * ny;
            if (vn < 0) {
              const out = -vn * LINE_E + LINE_KICK;
              vx += (out - vn) * nx;
              vy += (out - vn) * ny;
            }
            const hit = { x, y };
            for (let j = 0; j < 45; j++) {
              accel();
              if (j % 2 === 0) after.push(x, y);
            }
            return { pts, after, hit };
          }
          if (blocked(x, y)) break;
        }
        return { pts, after, hit: null };
      }

      function blocked(x, y) {
        const rw = (R + WALL_HALF) * (R + WALL_HALF);
        for (const s of world.walls) if (closest(x, y, s.x1, s.y1, s.x2, s.y2) < rw) return true;
        for (const s of world.cupSegs) if (closest(x, y, s.x1, s.y1, s.x2, s.y2) < rw) return true;
        if (!unlocked && world.lid && closest(x, y, world.lid.x1, world.lid.y1, world.lid.x2, world.lid.y2) < rw) return true;
        const rs = (R + SPIKE_HALF) * (R + SPIKE_HALF);
        for (const s of world.spikes) if (closest(x, y, s.x1, s.y1, s.x2, s.y2) < rs) return true;
        const rl = (R + LINE_HALF) * (R + LINE_HALF);
        for (const l of lines) if (closest(x, y, l.x1, l.y1, l.x2, l.y2) < rl) return true;
        for (const b of world.bumpers) if (Math.hypot(x - b.x, y - b.y) < R + b.r) return true;
        return false;
      }

      /* ---------- Physics ---------- */

      function dragK() {
        return U.lerp(1.6, 1.1, U.clamp(depthM() / 600, 0, 1));
      }

      function hitSeg(s, half, e, kick) {
        const b = ball;
        const d2 = closest(b.x, b.y, s.x1, s.y1, s.x2, s.y2);
        const rad = R + half;
        if (d2 >= rad * rad) return -1;
        const d = Math.sqrt(d2);
        let nx;
        let ny;
        if (d < 1e-4) {
          const sx = s.x2 - s.x1;
          const sy = s.y2 - s.y1;
          const L = Math.hypot(sx, sy) || 1;
          nx = -sy / L;
          ny = sx / L;
          if (nx * b.vx + ny * b.vy > 0) { nx = -nx; ny = -ny; }
        } else {
          nx = (b.x - near.x) / d;
          ny = (b.y - near.y) / d;
        }
        b.x = near.x + nx * rad;
        b.y = near.y + ny * rad;
        const vn = b.vx * nx + b.vy * ny;
        if (vn >= 0) return 0;
        const impact = -vn;
        const tx = b.vx - vn * nx;
        const ty = b.vy - vn * ny;
        const fr = impact > 40 ? 0.98 : 1;
        const out = impact * e + (impact > 15 ? kick : 0);
        b.vx = tx * fr + nx * out;
        b.vy = ty * fr + ny * out;
        return impact;
      }

      function thud(imp) {
        if (imp > 140 && sndCd <= 0) {
          api.sfx('tick');
          sndCd = 0.08;
        }
      }

      function subStep(h) {
        const b = ball;
        let ax = 0;
        let ay = GRAV;
        for (const w of world.winds) {
          if (b.x > w.x && b.x < w.x + w.w && b.y > w.y && b.y < w.y + w.h) { ax += w.ax; ay += w.ay; }
        }
        b.vx += ax * h;
        b.vy += ay * h;
        if (mode === 'endless') {
          const k = dragK();
          b.vx -= b.vx * k * h;
          b.vy -= b.vy * k * h;
        }
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > MAX_SPEED) {
          b.vx *= MAX_SPEED / sp;
          b.vy *= MAX_SPEED / sp;
        }
        b.x += b.vx * h;
        b.y += b.vy * h;

        const left = mode === 'endless' ? SL : 0;
        const right = mode === 'endless' ? SR : W;
        const ceil = mode === 'endless' ? camY + TOP : TOP;
        if (b.x < left + R) {
          b.x = left + R;
          if (b.vx < 0) { thud(-b.vx); b.vx = -b.vx * WALL_E; }
        } else if (b.x > right - R) {
          b.x = right - R;
          if (b.vx > 0) { thud(b.vx); b.vx = -b.vx * WALL_E; }
        }
        if (b.y < ceil + R) {
          b.y = ceil + R;
          if (b.vy < 0) { thud(-b.vy); b.vy = -b.vy * WALL_E; }
        }

        for (const s of world.walls) thud(hitSeg(s, WALL_HALF, WALL_E, 0));
        for (const s of world.cupSegs) thud(hitSeg(s, WALL_HALF, WALL_E, 0));
        if (!unlocked && world.lid) {
          const imp = hitSeg(world.lid, WALL_HALF, WALL_E, 0);
          if (imp > 100) hint('lid', 'The cup is locked until every ring is collected.');
          thud(imp);
        }
        for (const l of lines) {
          const imp = hitSeg(l, LINE_HALF, LINE_E, LINE_KICK);
          if (imp >= 0) {
            l.glow = Math.max(l.glow, imp > 60 ? Math.min(1, 0.45 + imp / 600) : 0.3);
            if (imp > 80 && sndCd <= 0) {
              api.sfx('blip');
              sndCd = 0.08;
            }
            if (imp > 160) burst(b.x, b.y, C.p2, 7, 160);
          }
        }
        for (const bp of world.bumpers) {
          const dx = b.x - bp.x;
          const dy = b.y - bp.y;
          const rad = R + bp.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rad * rad) continue;
          const d = Math.sqrt(d2);
          const nx = d > 1e-4 ? dx / d : 0;
          const ny = d > 1e-4 ? dy / d : -1;
          b.x = bp.x + nx * rad;
          b.y = bp.y + ny * rad;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 40) {
            const out = Math.max(-vn * 1.05, BUMP_MIN);
            // A little sideways jitter so a dead-centre drop can't bounce straight up forever.
            const jit = U.rand(-45, 45);
            b.vx += (out - vn) * nx - ny * jit;
            b.vy += (out - vn) * ny + nx * jit;
            bp.flash = 1;
            burst(bp.x + nx * bp.r, bp.y + ny * bp.r, C.violet, 8, 200);
            if (sndCd <= 0) {
              api.sfx('flip');
              sndCd = 0.06;
            }
            hint('bumper', 'Bumpers always fire the ball off at full power.');
          }
        }
        const rs = (R + SPIKE_HALF) * (R + SPIKE_HALF);
        for (const s of world.spikes) {
          if (closest(b.x, b.y, s.x1, s.y1, s.x2, s.y2) < rs) {
            loseBall('Spiked!');
            return false;
          }
        }
        for (const r of world.rings) {
          if (r.got) continue;
          const dx = b.x - r.x;
          const dy = b.y - r.y;
          if (dx * dx + dy * dy < RING_R * RING_R) collectRing(r);
        }
        if (b.lock && Math.hypot(b.x - b.lock.x, b.y - b.lock.y) > PORTAL_R + R + 4) b.lock = null;
        if (!b.lock) {
          for (const p of world.portals) {
            let to = null;
            let from = null;
            if (Math.hypot(b.x - p.ax, b.y - p.ay) < PORTAL_R * 0.75) { from = { x: p.ax, y: p.ay }; to = { x: p.bx, y: p.by }; }
            else if (Math.hypot(b.x - p.bx, b.y - p.by) < PORTAL_R * 0.75) { from = { x: p.bx, y: p.by }; to = { x: p.ax, y: p.ay }; }
            if (to) {
              pops.push({ x: from.x, y: from.y, t: 0, color: C.violet, r: PORTAL_R });
              pops.push({ x: to.x, y: to.y, t: 0, color: C.p2, r: PORTAL_R });
              burst(to.x, to.y, C.violet, 12, 200);
              b.x = to.x;
              b.y = to.y;
              b.lock = to;
              trail = [];
              api.sfx('shoot');
              hint('portal', 'Warped! Portals keep the ball\'s speed and work both ways.');
              break;
            }
          }
        }
        const cup = world.cup;
        if (cup && unlocked && Math.abs(b.x - cup.x) < CUP_W / 2 - 6 && b.y > cup.y + 6 && b.y < cup.y + CUP_H + 4) {
          clearLevel();
          return false;
        }
        if (mode === 'levels' && b.y > H + 30) {
          loseBall('The ball fell out.');
          return false;
        }
        return true;
      }

      function physics(dt) {
        const steps = Math.max(1, Math.ceil((MAX_SPEED * dt) / STEP_MAX));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          if (!subStep(h)) return;
        }
      }

      /* ---------- Update ---------- */

      function updateFx(dt) {
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 420 * dt;
          p.vx *= 1 - dt * 1.5;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const p of pops) p.t += dt;
        pops = pops.filter((p) => p.t < 0.5);
        for (const f of floaters) {
          f.t += dt;
          f.y -= 40 * dt;
        }
        floaters = floaters.filter((f) => f.t < 1);
        if (banner) {
          banner.t += dt;
          if (banner.t > banner.life) banner = null;
        }
      }

      function moveCross(dt) {
        const k = api.keys;
        let dx = 0;
        let dy = 0;
        if (k.has('ArrowLeft')) dx -= 1;
        if (k.has('ArrowRight')) dx += 1;
        if (k.has('ArrowUp')) dy -= 1;
        if (k.has('ArrowDown')) dy += 1;
        if (dx || dy) {
          cross.on = true;
          cross.x = U.clamp(cross.x + dx * 400 * dt, 6, W - 6);
          cross.y = U.clamp(cross.y + dy * 400 * dt, TOP + 6, H - 6);
        }
        if (draft && draft.src === 'kb') {
          draft.ex = cross.x;
          draft.ey = cross.y;
        }
      }

      function update(dt) {
        time += dt;
        sndCd = Math.max(0, sndCd - dt);
        shake = Math.max(0, shake - dt);
        flash = Math.max(0, flash - dt * 1.6);
        updateFx(dt);
        if (state !== 'play') return;
        levelT += dt;
        ink = Math.min(INK_MAX, ink + INK_REGEN * dt);
        for (const l of lines) {
          l.age += dt;
          l.glow = Math.max(0, l.glow - dt * 2.5);
        }
        lines = lines.filter((l) => l.age < LINE_LIFE);
        for (const bp of world.bumpers) bp.flash = Math.max(0, bp.flash - dt * 3);
        for (const r of world.rings) {
          if (r.sp) {
            const s = Math.sin(levelT * r.sp + r.ph);
            r.x = r.bx + r.dx * s;
            r.y = r.by + r.dy * s;
          }
        }
        moveCross(dt);
        if (mode === 'endless') generate();
        if (ball && !ball.dead) {
          if (ball.held) {
            ball.holdT -= dt;
            if (ball.holdT <= 0) release();
          } else {
            physics(dt);
            if (state === 'play' && !ball.dead) {
              if (!isFinite(ball.x) || !isFinite(ball.y) || !isFinite(ball.vx) || !isFinite(ball.vy)) {
                spawnBall();
              } else {
                trail.push({ x: ball.x, y: ball.y });
                if (trail.length > 16) trail.shift();
                const dx = ball.x - anchorX;
                const dy = ball.y - anchorY;
                if (dx * dx + dy * dy > 14 * 14) {
                  anchorX = ball.x;
                  anchorY = ball.y;
                  stuckT = 0;
                } else {
                  stuckT += dt;
                  if (stuckT >= STUCK_TIME) respawnStuck();
                }
              }
            }
          }
        }
        if (mode === 'endless' && state === 'play') {
          if (ball && !ball.dead && !ball.held) {
            const target = ball.y - 250;
            if (target > camY) camY += (target - camY) * Math.min(1, dt * 6);
            if (ball.y - camY > H - 140) camY = ball.y - (H - 140);
            maxY = Math.max(maxY, ball.y);
          }
          cleanup();
          score = endlessScore();
        }
        if (score !== shownScore) {
          shownScore = score;
          api.setScore(score);
        }
      }

      /* ---------- Draw ---------- */

      function drawWind(v) {
        ctx.fillStyle = U.alpha(C.mint, 0.06);
        ctx.fillRect(v.x, v.y, v.w, v.h);
        ctx.strokeStyle = U.alpha(C.mint, 0.25);
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.strokeRect(v.x + 0.5, v.y + 0.5, v.w - 1, v.h - 1);
        ctx.setLineDash([]);
        const mag = Math.hypot(v.ax, v.ay) || 1;
        const ux = v.ax / mag;
        const uy = v.ay / mag;
        ctx.save();
        ctx.beginPath();
        ctx.rect(v.x, v.y, v.w, v.h);
        ctx.clip();
        ctx.strokeStyle = U.alpha(C.mint, 0.4);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const n = Math.max(6, Math.round((v.w * v.h) / 5000));
        const speed = 60 + mag * 0.25;
        for (let i = 0; i < n; i++) {
          const fx = (i * 97.31) % 1;
          const fy = (i * 53.77 + 0.37) % 1;
          let sx = v.x + fx * v.w + ux * ((time * speed + i * 40) % (v.w + v.h));
          let sy = v.y + fy * v.h + uy * ((time * speed + i * 40) % (v.w + v.h));
          sx = v.x + ((((sx - v.x) % v.w) + v.w) % v.w);
          sy = v.y + ((((sy - v.y) % v.h) + v.h) % v.h);
          strokeSeg(ctx, sx, sy, sx + ux * 18, sy + uy * 18);
        }
        ctx.restore();
      }

      function drawShaft() {
        const y0 = camY - 20;
        const y1 = camY + H + 20;
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, y0, SL, y1 - y0);
        ctx.fillRect(SR, y0, W - SR, y1 - y0);
        ctx.fillStyle = C.line;
        ctx.fillRect(SL - 3, y0, 3, y1 - y0);
        ctx.fillRect(SR, y0, 3, y1 - y0);
        ctx.font = FONT_SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let y = Math.floor(y0 / 100) * 100; y < y1; y += 100) {
          ctx.fillStyle = U.alpha(C.muted, 0.35);
          ctx.fillRect(SL - 14, y, 10, 2);
          ctx.fillRect(SR + 4, y, 10, 2);
          if (y % 400 === 0 && y > 100) {
            ctx.fillStyle = U.alpha(C.muted, 0.5);
            ctx.save();
            ctx.translate(SL / 2 - 2, y + 30);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(Math.floor((y - 100) / 20) + 'm', 0, 0);
            ctx.restore();
          }
        }
      }

      function drawPrediction() {
        const e = draftEnd();
        ctx.lineCap = 'round';
        ctx.setLineDash([10, 8]);
        ctx.strokeStyle = U.alpha(e.short ? C.muted : C.p2, 0.85);
        ctx.lineWidth = 4;
        strokeSeg(ctx, draft.x1, draft.y1, e.x, e.y);
        ctx.setLineDash([]);
        ctx.fillStyle = e.short ? C.muted : C.p2;
        ctx.beginPath();
        ctx.arc(draft.x1, draft.y1, 4, 0, TAU);
        ctx.arc(e.x, e.y, 4, 0, TAU);
        ctx.fill();
        if (e.clamped) {
          ctx.font = FONT_SMALL;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = C.p1;
          ctx.fillText(ink < LINE_MAX ? 'ink' : 'max', e.x, e.y - 8);
        }
        if (e.short) return;
        const pr = predict({ x1: draft.x1, y1: draft.y1, x2: e.x, y2: e.y });
        ctx.fillStyle = U.alpha(C.text, 0.2);
        for (let i = 0; i < pr.pts.length; i += 2) ctx.fillRect(pr.pts[i] - 1, pr.pts[i + 1] - 1, 2, 2);
        if (pr.hit && pr.after.length >= 4) {
          ctx.strokeStyle = U.alpha(C.p2, 0.5);
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 6]);
          ctx.beginPath();
          ctx.moveTo(pr.hit.x, pr.hit.y);
          for (let i = 0; i < pr.after.length; i += 2) ctx.lineTo(pr.after[i], pr.after[i + 1]);
          ctx.stroke();
          ctx.setLineDash([]);
          const n = pr.after.length;
          const tx = pr.after[n - 2];
          const ty = pr.after[n - 1];
          const a = Math.atan2(ty - pr.after[n - 3], tx - pr.after[n - 4]);
          ctx.fillStyle = U.alpha(C.p2, 0.6);
          ctx.beginPath();
          ctx.moveTo(tx + Math.cos(a) * 9, ty + Math.sin(a) * 9);
          ctx.lineTo(tx + Math.cos(a + 2.5) * 8, ty + Math.sin(a + 2.5) * 8);
          ctx.lineTo(tx + Math.cos(a - 2.5) * 8, ty + Math.sin(a - 2.5) * 8);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.text, 0.5);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pr.hit.x, pr.hit.y, R, 0, TAU);
          ctx.stroke();
        }
      }

      function drawHud() {
        ctx.fillStyle = U.alpha(C.panel, 0.95);
        ctx.fillRect(0, 0, W, TOP);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, TOP - 2, W, 2);
        ctx.font = FONT_HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const cy = TOP / 2;
        if (mode === 'levels') {
          ctx.fillStyle = C.text;
          const lv = 'LV ' + (levelIdx + 1);
          ctx.fillText(lv, 14, cy);
          ctx.fillStyle = C.muted;
          ctx.fillText(LEVELS[levelIdx].name, 14 + ctx.measureText(lv + ' ').width + 4, cy);
        } else {
          ctx.fillStyle = C.text;
          ctx.fillText('DEPTH ' + depthM() + 'm', 14, cy);
        }
        // Ink meter.
        ctx.fillStyle = C.muted;
        ctx.fillText('INK', 236, cy);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, 272, cy - 6, 140, 12, 6);
        ctx.fill();
        ctx.fillStyle = ink < LINE_MIN ? C.p1 : C.p2;
        U.roundRect(ctx, 272, cy - 6, Math.max(4, 140 * (ink / INK_MAX)), 12, 6);
        ctx.fill();
        // Line slots: each pip drains as its line fades.
        for (let i = 0; i < MAX_LINES; i++) {
          const x = 426 + i * 22;
          ctx.fillStyle = C.panel2;
          ctx.fillRect(x, cy - 5, 16, 10);
          const l = lines[i];
          if (l) {
            ctx.fillStyle = l.age > LINE_LIFE - LINE_FADE ? C.p1 : C.p2;
            ctx.fillRect(x, cy - 5, 16 * Math.max(0, 1 - l.age / LINE_LIFE), 10);
          }
        }
        // Rings.
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(510, cy, 7, 0, TAU);
        ctx.stroke();
        ctx.fillStyle = unlocked && mode === 'levels' ? C.mint : C.gold;
        ctx.fillText(mode === 'levels' ? ringsGot + '/' + ringsTotal : String(ringsGot), 524, cy);
        // Balls left.
        for (let i = 0; i < 3; i++) {
          const x = W - 20 - i * 22;
          ctx.beginPath();
          ctx.arc(x, cy, 7, 0, TAU);
          if (i < balls) {
            ctx.fillStyle = C.text;
            ctx.fill();
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 16, (Math.random() - 0.5) * shake * 16);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.fillStyle = U.alpha(C.line, 0.45);
        const off = ((camY % 40) + 40) % 40;
        for (let y = TOP + 20 - off; y < H + 20; y += 40) {
          for (let x = 20; x < W; x += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
        }

        ctx.save();
        ctx.translate(0, -camY);
        if (mode === 'endless') drawShaft();
        for (const v of world.winds) drawWind(v);
        for (const s of world.walls) drawWall(ctx, s, 1);
        for (const s of world.spikes) drawSpikes(ctx, s, 1);
        for (const b of world.bumpers) drawBumper(ctx, b.x, b.y, b.r, b.flash);
        for (const p of world.portals) {
          ctx.strokeStyle = U.alpha(C.violet, 0.14);
          ctx.lineWidth = 2;
          ctx.setLineDash([3, 9]);
          strokeSeg(ctx, p.ax, p.ay, p.bx, p.by);
          ctx.setLineDash([]);
          drawPortal(ctx, p.ax, p.ay, time);
          drawPortal(ctx, p.bx, p.by, time + 1.3);
        }
        for (const r of world.rings) {
          if (r.got) continue;
          if (r.sp) {
            ctx.strokeStyle = U.alpha(C.gold, 0.14);
            ctx.lineWidth = 2;
            ctx.setLineDash([2, 8]);
            strokeSeg(ctx, r.bx - r.dx, r.by - r.dy, r.bx + r.dx, r.by + r.dy);
            ctx.setLineDash([]);
          }
          drawRing(ctx, r.x, r.y, RING_R, time, 1);
        }
        if (world.cup) drawCup(ctx, world.cup.x, world.cup.y, CUP_W, CUP_H, unlocked, time);
        if (mode === 'levels' || (ball && ball.held && !ball.dead)) drawLauncher(ctx, world.launch.x, world.launch.y);
        for (const l of lines) {
          const a = l.age < LINE_LIFE - LINE_FADE ? 1 : Math.max(0, (LINE_LIFE - l.age) / LINE_FADE);
          const blink = l.age > LINE_LIFE - LINE_FADE && Math.sin(time * 28) > 0.4 ? 0.55 : 1;
          drawBounceLine(ctx, l.x1, l.y1, l.x2, l.y2, a * blink, l.glow, 1);
        }
        if (draft && state === 'play') drawPrediction();
        if (ball && !ball.dead) {
          for (let i = 0; i < trail.length; i++) {
            const k = (i + 1) / trail.length;
            ctx.fillStyle = U.alpha(C.p2, 0.22 * k);
            ctx.beginPath();
            ctx.arc(trail[i].x, trail[i].y, R * (0.35 + 0.6 * k), 0, TAU);
            ctx.fill();
          }
          drawBall(ctx, ball.x, ball.y, R);
          if (ball.held && state === 'play') {
            ctx.strokeStyle = C.p2;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, R + 7, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(ball.holdT / ball.hold0, 0, 1));
            ctx.stroke();
          }
          if (stuckT > 1.2 && state === 'play' && !ball.held) {
            ctx.font = FONT_SMALL;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = U.alpha(C.muted, 0.9);
            ctx.fillText('stuck ' + Math.max(1, Math.ceil(STUCK_TIME - stuckT)), ball.x, ball.y - R - 8);
          }
        }
        for (const p of particles) {
          ctx.fillStyle = U.alpha(p.color, Math.max(0, p.life / p.max));
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        for (const p of pops) {
          const k = p.t / 0.5;
          ctx.strokeStyle = U.alpha(p.color, 1 - k);
          ctx.lineWidth = 4 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r + k * 50, 0, TAU);
          ctx.stroke();
        }
        ctx.font = FONT_SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floaters) {
          ctx.fillStyle = U.alpha(f.color, 1 - f.t);
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.restore();

        if (cross.on && state === 'play') {
          ctx.strokeStyle = U.alpha(draft && draft.src === 'kb' ? C.p2 : C.text, 0.85);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cross.x, cross.y, 9, 0, TAU);
          ctx.moveTo(cross.x - 15, cross.y);
          ctx.lineTo(cross.x - 5, cross.y);
          ctx.moveTo(cross.x + 5, cross.y);
          ctx.lineTo(cross.x + 15, cross.y);
          ctx.moveTo(cross.x, cross.y - 15);
          ctx.lineTo(cross.x, cross.y - 5);
          ctx.moveTo(cross.x, cross.y + 5);
          ctx.lineTo(cross.x, cross.y + 15);
          ctx.stroke();
        }
        if (banner) {
          const k = banner.t / banner.life;
          const a = k < 0.15 ? k / 0.15 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = FONT_BIG;
          ctx.fillStyle = U.alpha(C.ink, 0.6 * a);
          ctx.fillText(banner.text, W / 2 + 3, H * 0.42 + 3);
          ctx.fillStyle = U.alpha(banner.color, a);
          ctx.fillText(banner.text, W / 2, H * 0.42);
          if (banner.sub) {
            ctx.font = FONT_HUD;
            ctx.fillStyle = U.alpha(C.text, 0.85 * a);
            ctx.fillText(banner.sub, W / 2, H * 0.42 + 40);
          }
        }
        drawHud();
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.3);
          ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }

      /* ---------- Input ---------- */

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play' || api.menuOpen) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        beginDraft(p.x, p.y, 'ptr');
        if (draft) {
          try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* capture is optional */ }
        }
      });
      api.on(window, 'pointermove', (e) => {
        if (!draft || draft.src !== 'ptr') return;
        const p = api.toCanvas(e, canvas);
        draft.ex = U.clamp(p.x, 0, W);
        draft.ey = U.clamp(p.y, TOP, H);
      });
      api.on(window, 'pointerup', (e) => {
        if (!draft || draft.src !== 'ptr') return;
        const p = api.toCanvas(e, canvas);
        draft.ex = U.clamp(p.x, 0, W);
        draft.ey = U.clamp(p.y, TOP, H);
        commitDraft();
      });
      api.on(window, 'pointercancel', () => {
        if (draft && draft.src === 'ptr') draft = null;
      });
      api.on(window, 'keydown', (e) => {
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'ArrowUp' || e.code === 'ArrowDown') {
          if (state === 'play' && !cross.on) {
            cross.on = true;
            hint('kb', 'Keyboard: arrows move the crosshair, Space starts a line, Space again finishes it.');
          }
          return;
        }
        if (e.code !== 'Space' || e.repeat || state !== 'play' || api.menuOpen) return;
        cross.on = true;
        if (!draft) beginDraft(cross.x, cross.y, 'kb');
        else commitDraft();
      });

      world = buildLevel(LEVELS[0]);
      ringsTotal = world.rings.length;
      spawnBall();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });

      return {
        destroy() {
          draft = null;
          lines = [];
        }
      };
    }
  });
})();
