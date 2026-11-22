/* Planet Sumo: two chunky wrestlers shove each other around a tiny planet.
   Hook: gravity cycles NORMAL / LOW / HEAVY every 8 s (2 s warning), with the odd reverse pulse. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const CX = W / 2;
  const CY = 326;
  const PR = 138;               // planet radius
  const WR = 22;                // wrestler radius
  const R0 = PR + WR;           // wrestler centre distance when standing
  const ER = 262;               // escape ring radius
  const ER_MIN = R0 + 44;       // overtime: the ring shrinks down to here
  const STEP = 1 / 120;         // fixed physics step
  const WIN = 5;
  const OMEGA = 0.1;            // planet spin, rad/s (the surface carries you along)
  const PHASE_LEN = 8;
  const WARN = 2;
  const PULSE_G = 400;          // outward pull during a reverse pulse
  const PULSE_LEN = 0.55;
  const PULSE_WARN = 1.6;
  const COOLDOWN = 0.8;
  const CHARGE_T = 0.6;
  const LUNGE_T = 0.16;
  const LUNGE_V = 300;
  const LUNGE_VC = 380;
  const TAP_P = 330;
  const CHARGE_P = 640;
  const REACH = 2 * WR + 18;
  const WALK = 200;
  const TRACTION = 1500;
  const AIR_CTRL = 260;
  const AIR_DRAG = 0.12;
  const OVERTIME = 35;
  const MAX_PARTS = 320;
  const HUD = '600 15px "JetBrains Mono", monospace';
  const BIG = '800 44px Unbounded, sans-serif';

  const PH = {
    normal: { g: 1000, grip: 1, walk: 1, jumpH: 56, lunge: 1, knock: 1, flow: 0.45, label: 'NORMAL', color: C.violet },
    low: { g: 430, grip: 0.5, walk: 0.8, jumpH: 66, lunge: 0.62, knock: 1, flow: 0.16, label: 'LOW', color: C.mint },
    heavy: { g: 1900, grip: 1.7, walk: 0.62, jumpH: 32, lunge: 0.8, knock: 0.92, flow: 0.95, label: 'HEAVY', color: C.gold }
  };
  const LEVELS = {
    easy: { react: 0.45, walk: 0.72, aggr: 0.35, charge: 0.2, guard: 0.2, smart: 0.1 },
    normal: { react: 0.22, walk: 0.88, aggr: 0.6, charge: 0.4, guard: 0.5, smart: 0.5 },
    hard: { react: 0.1, walk: 1, aggr: 0.85, charge: 0.5, guard: 0.75, smart: 0.9 }
  };

  /* Deterministic scenery so the card art never flickers. */
  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = seeded(7331);
  const STARS = [];
  for (let i = 0; i < 150; i++) {
    STARS.push({ x: rng(), y: rng(), s: rng() < 0.15 ? 2 : 1.2, b: 0.4 + rng() * 0.6, tw: 0.8 + rng() * 2.5, ph: rng() * 6.28 });
  }
  const CRATERS = [];
  for (let i = 0; i < 10; i++) CRATERS.push({ a: rng() * 6.28, d: 0.15 + rng() * 0.75, r: 0.06 + rng() * 0.12 });
  const ROCKS = [];
  for (let i = 0; i < 16; i++) ROCKS.push({ a: (i / 16) * 6.28 + rng() * 0.3, s: 2.5 + rng() * 3.5 });

  /* ---------- Shared drawing (game + card art) ---------- */
  function drawBackdrop(ctx, w, h, t) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(-20, -20, w + 40, h + 40);
    const n1 = ctx.createRadialGradient(w * 0.18, h * 0.22, 0, w * 0.18, h * 0.22, w * 0.45);
    n1.addColorStop(0, U.alpha(C.violet, 0.13));
    n1.addColorStop(1, U.alpha(C.violet, 0));
    ctx.fillStyle = n1;
    ctx.fillRect(0, 0, w, h);
    const n2 = ctx.createRadialGradient(w * 0.86, h * 0.8, 0, w * 0.86, h * 0.8, w * 0.4);
    n2.addColorStop(0, U.alpha(C.p2, 0.08));
    n2.addColorStop(1, U.alpha(C.p2, 0));
    ctx.fillStyle = n2;
    ctx.fillRect(0, 0, w, h);
    for (const s of STARS) {
      const a = s.b * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * s.tw + s.ph)));
      ctx.fillStyle = U.alpha(C.text, a * 0.8);
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
  }

  // Chevrons flowing toward the planet (or away during a reverse pulse); speed shows gravity strength.
  function drawField(ctx, cx, cy, s, flow, color, alpha, outward) {
    const inner = (PR + 50) * s;
    const outer = (ER - 8) * s;
    const dir = outward ? -1 : 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2, 2 * s);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + 0.2;
      const ca = Math.cos(a), sa = Math.sin(a);
      for (let k = 0; k < 2; k++) {
        const f = (((flow + k * 0.5 + (i % 2) * 0.25) % 1) + 1) % 1;
        const rr = outer - f * (outer - inner);
        ctx.globalAlpha = alpha * Math.sin(f * Math.PI);
        const px = cx + ca * rr, py = cy + sa * rr;
        const tipx = px - ca * 5 * s * dir, tipy = py - sa * 5 * s * dir;
        const bx = px + ca * 3 * s * dir, by = py + sa * 3 * s * dir;
        ctx.beginPath();
        ctx.moveTo(bx - sa * 6 * s, by + ca * 6 * s);
        ctx.lineTo(tipx, tipy);
        ctx.lineTo(bx + sa * 6 * s, by - ca * 6 * s);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawPlanet(ctx, cx, cy, r, rot, color, aura) {
    const s = r / PR;
    const ag = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r * 1.75);
    ag.addColorStop(0, U.alpha(color, U.clamp(0.4 * aura, 0, 1)));
    ag.addColorStop(1, U.alpha(color, 0));
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.75, 0, Math.PI * 2);
    ctx.fill();
    // Little bumps poking out of the rim.
    ctx.fillStyle = C.line;
    for (const k of ROCKS) {
      const a = k.a + rot;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r - 1), cy + Math.sin(a) * (r - 1), k.s * s, 0, Math.PI * 2);
      ctx.fill();
    }
    const bg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.05);
    bg.addColorStop(0, C.line);
    bg.addColorStop(0.55, C.panel2);
    bg.addColorStop(1, C.panel);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    for (const c of CRATERS) {
      const a = c.a + rot;
      const x = cx + Math.cos(a) * c.d * r, y = cy + Math.sin(a) * c.d * r, cr = c.r * r;
      ctx.fillStyle = U.alpha(C.ink, 0.32);
      ctx.beginPath();
      ctx.arc(x, y, cr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = U.alpha(C.muted, 0.25);
      ctx.lineWidth = Math.max(1, 2 * s);
      ctx.beginPath();
      ctx.arc(x, y, cr * 0.9, -0.1 * Math.PI, 0.75 * Math.PI);
      ctx.stroke();
    }
    const sh = ctx.createRadialGradient(cx - r * 0.45, cy - r * 0.5, r * 0.55, cx - r * 0.2, cy - r * 0.2, r * 1.6);
    sh.addColorStop(0, U.alpha(C.ink, 0));
    sh.addColorStop(1, U.alpha(C.ink, 0.55));
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.strokeStyle = U.alpha(color, 0.8);
    ctx.lineWidth = Math.max(1.5, 3 * s);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* A chunky wrestler. (x, y) is the body centre, ang the direction of its "up" (away from the planet). */
  function drawWrestler(ctx, x, y, ang, color, o) {
    const s = o.s || 1;
    const f = o.face || 1;
    const t = o.t || 0;
    const R = WR;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.scale(s, s);
    const sq = U.clamp(o.squash || 0, -0.5, 0.7);
    const sy = (o.crouch ? 0.74 : 1) * (1 - sq * 0.3);
    const sx = 1.1 * (1 + (1 - sy) * 0.55);
    const ry = R * sy, rx = R * sx, cy = R - ry;
    const ch = o.charge || 0;
    if (ch > 0) ctx.translate(Math.sin(t * 60) * 1.4 * ch, 0);
    if (ch > 0) {
      ctx.lineWidth = o.full ? 4 : 2.5;
      ctx.strokeStyle = o.full ? U.alpha(C.gold, 0.55 + 0.45 * Math.sin(t * 22)) : U.alpha(color, 0.3 + 0.5 * ch);
      ctx.beginPath();
      ctx.ellipse(0, cy, rx + 5 + ch * 4, ry + 5 + ch * 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Feet.
    ctx.fillStyle = C.muted;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(side * rx * 0.48, R - 3.5, 7, 4.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Back hand.
    ctx.fillStyle = C.text;
    ctx.strokeStyle = U.alpha(C.ink, 0.45);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(-f * (rx - 1), cy + 3, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Body.
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = C.text;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = U.alpha(C.muted, 0.42);
    ctx.beginPath();
    ctx.ellipse(-f * rx * 0.15, cy + ry * 0.78, rx * 1.1, ry * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    const by = cy + ry * 0.2;
    ctx.fillStyle = color;
    ctx.fillRect(-rx - 2, by - 5, rx * 2 + 4, 10);
    ctx.fillStyle = U.alpha(C.ink, 0.28);
    ctx.fillRect(-rx - 2, by + 3, rx * 2 + 4, 2);
    ctx.restore();
    ctx.strokeStyle = U.alpha(C.ink, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Belt knot and front flap.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(f * rx * 0.22, by, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(f * rx * 0.22 - 2.5, by + 2, 5, 8 * sy + 2);
    // Topknot.
    ctx.fillStyle = C.panel;
    ctx.beginPath();
    ctx.ellipse(-f * 3, cy - ry + 1, 7, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-f * 4, cy - ry - 3.5, 3.6, 3.2, 0, 0, Math.PI * 2);
    ctx.fill();
    // Face.
    const ex = f * rx * 0.4, ey = cy - ry * 0.3;
    ctx.fillStyle = U.alpha(color, 0.45);
    for (const d of [-9, 9]) {
      ctx.beginPath();
      ctx.arc(ex + d, ey + 6, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = C.ink;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (o.stun) {
      for (const d of [-5, 5]) {
        ctx.beginPath();
        ctx.moveTo(ex + d - 2.4, ey - 2.4);
        ctx.lineTo(ex + d + 2.4, ey + 2.4);
        ctx.moveTo(ex + d + 2.4, ey - 2.4);
        ctx.lineTo(ex + d - 2.4, ey + 2.4);
        ctx.stroke();
      }
    } else {
      for (const d of [-5, 5]) {
        ctx.beginPath();
        ctx.ellipse(ex + d, ey, 2.1, 2.7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      if (ch > 0 || o.lunge) {
        ctx.beginPath();
        ctx.moveTo(ex - 8, ey - 6.5);
        ctx.lineTo(ex - 2.5, ey - 4.5);
        ctx.moveTo(ex + 8, ey - 6.5);
        ctx.lineTo(ex + 2.5, ey - 4.5);
        ctx.stroke();
      }
    }
    ctx.beginPath();
    if (o.lunge || o.stun) {
      ctx.ellipse(ex, ey + 7, 2.6, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.arc(ex, ey + 4.5, 3, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    // Front hand: a big palm thrust while shoving.
    const hx = o.lunge ? f * (rx + 10) : f * (rx - 1);
    const hy = o.lunge ? cy - 1 : cy + 4;
    if (o.lunge) {
      ctx.strokeStyle = U.alpha(C.text, 0.6);
      ctx.lineWidth = 2;
      for (const d of [-6, 0, 6]) {
        ctx.beginPath();
        ctx.moveTo(hx - f * 12, hy + d);
        ctx.lineTo(hx - f * 22, hy + d);
        ctx.stroke();
      }
    }
    ctx.lineCap = 'butt';
    ctx.fillStyle = C.text;
    ctx.strokeStyle = U.alpha(C.ink, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(hx, hy, o.lunge ? 7 : 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  Arcade.register({
    id: 'planet-sumo',
    title: 'Planet Sumo',
    category: 'fresh',
    mode: 'together',
    players: '1–2P',
    best: false,
    original: true,
    color: C.violet,
    tagline: 'Chunky sumo wrestlers shove each other around a tiny spinning planet.',
    hook: 'Shove your rival off a tiny planet whose gravity keeps changing strength.',
    tags: ['versus', 'physics', 'space', 'sumo', 'gravity', 'two player', 'computer', 'keyboard'],
    howTo: 'Two sumo wrestlers share a tiny planet. Left and right walk you around it (relative to your own feet), ' +
      'up jumps. Tap your action key to shove: a quick lunge that knocks your rival back, with a 0.8 s cooldown. ' +
      'Hold it for 0.6 s until you glow gold, then let go for a charged shove that hits much harder. ' +
      'Every 8 seconds gravity shifts, with a 2-second warning ring on the planet: LOW is floaty, so shoves fling ' +
      'people off; HEAVY is sticky and slow. Now and then a reverse pulse pushes everyone outward. ' +
      'Hold down to crouch: you get heavier, take half the knockback and stay anchored, but move slowly. ' +
      'Drift past the faint escape ring and your rival scores. First to 5 wins.',
    controls: [
      { keys: ['A', 'D'], label: 'Player 1 walk around the planet' },
      { keys: ['W', 'S'], label: 'Player 1 jump / hold to crouch' },
      { keys: ['Space'], label: 'Player 1 shove (hold 0.6 s to charge)' },
      { keys: ['←', '→'], label: 'Player 2 walk' },
      { keys: ['↑', '↓'], label: 'Player 2 jump / hold to crouch' },
      { keys: ['Enter'], label: 'Player 2 shove (hold to charge)' }
    ],

    drawThumb(ctx, w, h, t) {
      drawBackdrop(ctx, w, h, t);
      const s = 0.42;
      const cx = w / 2, cy = h * 0.68, pr = PR * s;
      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = U.alpha(C.muted, 0.4);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, ER * s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
      drawField(ctx, cx, cy, s, t * 0.25, C.mint, 0.45, false);
      drawPlanet(ctx, cx, cy, pr, t * 0.1, C.mint, 1);
      // Gravity-shift countdown ring.
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, pr - 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.3);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.save();
      ctx.translate(cx, cy + 2);
      ctx.scale(0.42, 0.42);
      ctx.font = BIG;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = U.alpha(C.mint, 0.9);
      ctx.fillText('LOW', 0, 0);
      ctx.restore();
      const ws = 0.75;
      const a1 = -Math.PI / 2 - 0.4;
      const r1 = pr + WR * ws;
      const x1 = cx + Math.cos(a1) * r1, y1 = cy + Math.sin(a1) * r1;
      const bob = Math.sin(t * 2.6) * 4;
      const a2 = -Math.PI / 2 + 0.42;
      const r2 = pr + WR * ws + 24 + bob;
      const x2 = cx + Math.cos(a2) * r2, y2 = cy + Math.sin(a2) * r2;
      // Impact burst.
      const mx = (x1 + x2) / 2 + 4, my = (y1 + y2) / 2 - 4;
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 2;
      for (let k = 0; k < 7; k++) {
        const a = k * 0.9 + 0.3;
        ctx.beginPath();
        ctx.moveTo(mx + Math.cos(a) * 6, my + Math.sin(a) * 6);
        ctx.lineTo(mx + Math.cos(a) * 13, my + Math.sin(a) * 13);
        ctx.stroke();
      }
      ctx.strokeStyle = U.alpha(C.p2, 0.5);
      for (let k = 1; k <= 3; k++) {
        ctx.beginPath();
        ctx.moveTo(x2 - k * 7, y2 + 8 + k * 3);
        ctx.lineTo(x2 - k * 7 - 10, y2 + 12 + k * 3);
        ctx.stroke();
      }
      drawWrestler(ctx, x1, y1, a1, C.p1, { face: 1, lunge: true, t, s: ws });
      drawWrestler(ctx, x2, y2, a2 + 0.5 + bob * 0.03, C.p2, { face: -1, stun: true, t, s: ws });
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'point' | 'over'
      let cpuOn = false;
      let level = 'normal';
      let ws = [];
      let scores = [0, 0];
      let countT = 0, lastCount = 0, goFlash = 0;
      let pointT = 0, pointMsg = '', pointSub = '', pointColor = C.text;
      let phase = 'normal', nextPhase = 'low', phaseT = PHASE_LEN, phaseFlash = 0, warnTick = 0;
      let gCur = PH.normal.g;
      let pulseAt = -1, pulseT = 0;
      let rot = 0, clock = 0, flow = 0, shake = 0, playT = 0, erNow = ER;
      let acc = 0, lastT = -1, pointNo = 0;
      let particles = [];
      let popups = [];
      let hinted = {};
      const cpuIn = { dir: 0, up: false, down: false, act: false };
      const ai = { timer: 0, dir: 0, crouchT: 0, hold: false, wantCharge: false, holdT: 0, retreatT: 0 };

      const shortName = (i) => (cpuOn ? (i === 0 ? 'YOU' : 'CPU · ' + level.toUpperCase()) : 'P' + (i + 1));
      const longName = (i) => (cpuOn ? (i === 0 ? 'You' : 'The computer') : 'Player ' + (i + 1));
      const verb = (i, plain) => (cpuOn && i === 0 ? plain : plain + 's');

      function makeW(id) {
        const a = -Math.PI / 2 + (id === 0 ? -0.5 : 0.5);
        return {
          id, x: CX + Math.cos(a) * R0, y: CY + Math.sin(a) * R0, vx: 0, vy: 0,
          face: id === 0 ? 1 : -1, dir: 0, ground: 0.06, crouch: false,
          charge: 0, chargeLock: false, prevAct: false, prevUp: false, jumpBuf: 0,
          cd: 0, lunge: 0, lungeCharged: false, lungeHit: false, armT: 0,
          stun: 0, squash: 0, out: false, spin: 0, trail: [],
          color: id === 0 ? C.p1 : C.p2
        };
      }
      ws = [makeW(0), makeW(1)];

      function frameOf(w) {
        const dx = w.x - CX, dy = w.y - CY;
        const r = Math.hypot(dx, dy) || 1;
        const ux = dx / r, uy = dy / r;
        return { r, ux, uy, tx: -uy, ty: ux, ang: Math.atan2(dy, dx) };
      }

      const pickNext = (cur) => U.pick(['normal', 'low', 'heavy'].filter((p) => p !== cur));
      const pulseWarning = () => pulseAt > 0 && phaseT > pulseAt && phaseT - pulseAt <= PULSE_WARN;

      function gravOn(w) {
        if (w.out) return 0;
        if (pulseT > 0) return -PULSE_G * (w.crouch ? 0.15 : 1);
        return gCur;
      }

      function spark(x, y, color, n, speed, life) {
        for (let k = 0; k < n && particles.length < MAX_PARTS; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.25 + Math.random() * 0.75);
          particles.push({
            x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
            life: life * (0.5 + Math.random() * 0.5), max: life, color, size: 2 + Math.random() * 2.5
          });
        }
      }

      function popup(x, y, text, color) {
        popups.push({ x, y, text, color, life: 0.9 });
        if (popups.length > 6) popups.shift();
      }

      /* ---------- Match flow ---------- */
      function resetPhase() {
        phase = 'normal';
        nextPhase = pickNext(phase);
        phaseT = PHASE_LEN;
        gCur = PH.normal.g;
        pulseAt = -1;
        pulseT = 0;
        phaseFlash = 0;
        warnTick = 99;
      }

      function startPoint() {
        ws = [makeW(0), makeW(1)];
        particles = [];
        popups = [];
        state = 'count';
        countT = 3;
        lastCount = 4;
        acc = 0;
        playT = 0;
        erNow = ER;
        pulseT = 0;
        pointNo++;
        Object.assign(ai, { timer: 0.3, dir: 0, crouchT: 0, hold: false, wantCharge: false, holdT: 0, retreatT: 0 });
        cpuIn.dir = 0;
        cpuIn.down = false;
        cpuIn.act = false;
        if (pointNo === 1) {
          api.setStatus(cpuOn
            ? 'A/D walk, W jump, S crouch, Space shove (hold to charge). Arrows + Enter work too.'
            : 'P1: A/D walk, W jump, S crouch, Space shove. P2: arrows + Enter. Hold shove to charge.');
        } else {
          api.setStatus(scores[0] + ' – ' + scores[1] + '. First to ' + WIN + ' ring-outs. Gravity now: ' + PH[phase].label + '.');
        }
      }

      function startMatch(cpu, lvl) {
        cpuOn = cpu;
        level = lvl || 'normal';
        scores = [0, 0];
        hinted = {};
        pointNo = 0;
        api.setScore('0 – 0');
        resetPhase();
        startPoint();
      }

      function showStartMenu() {
        state = 'menu';
        ws = [makeW(0), makeW(1)];
        particles = [];
        popups = [];
        resetPhase();
        api.setScore('0 – 0');
        api.menu({
          title: 'Planet Sumo',
          text: 'Shove your rival off a tiny planet. Gravity shifts every 8 s: LOW is floaty, HEAVY is sticky. ' +
            'Hold shove to charge, crouch to brace. First to 5 ring-outs.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false) },
            { label: 'vs computer', onClick: showLevelMenu }
          ]
        });
        api.setStatus('Player 1: WASD + Space. Player 2: arrows + Enter.');
      }

      function showLevelMenu() {
        api.menu({
          title: 'Computer level',
          text: 'You are coral: A/D walk, W jump, S crouch, Space shove (hold to charge). Arrows + Enter work too.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      function matchOver() {
        state = 'over';
        const w = scores[0] >= WIN ? 0 : 1;
        api.sfx(cpuOn && w === 1 ? 'lose' : 'win');
        api.setStatus(longName(w) + ' ' + verb(w, 'win') + ' the match ' + scores[0] + ' – ' + scores[1] + '.');
        api.menu({
          title: cpuOn ? (w === 0 ? 'You win!' : 'Computer wins') : 'Player ' + (w + 1) + ' wins!',
          text: 'Final score ' + scores[0] + ' – ' + scores[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(cpuOn, level) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function ringOut(outs) {
        for (const w of outs) {
          w.out = true;
          w.charge = 0;
          const f = frameOf(w);
          w.vx += f.ux * 140;
          w.vy += f.uy * 140;
          spark(w.x, w.y, w.color, 40, 320, 0.9);
          spark(w.x, w.y, C.gold, 16, 220, 0.6);
        }
        shake = 12;
        state = 'point';
        pointT = 2.2;
        if (outs.length > 1) {
          pointMsg = 'DOUBLE OUT';
          pointColor = C.text;
          pointSub = 'No point. Go again!';
          api.sfx('lose');
          api.setStatus('Both wrestlers flew off together, so nobody scores.');
          return;
        }
        const win = 1 - outs[0].id;
        scores[win]++;
        api.setScore(scores[0] + ' – ' + scores[1]);
        pointMsg = 'RING OUT!';
        pointColor = ws[win].color;
        pointSub = longName(win) + ' ' + verb(win, 'score') + '  ' + scores[0] + ' – ' + scores[1];
        api.sfx(cpuOn && win === 1 ? 'lose' : 'score');
        api.setStatus(longName(outs[0].id) + ' drifted past the escape ring. ' + scores[0] + ' – ' + scores[1] +
          ', first to ' + WIN + '.');
      }

      /* ---------- Input ---------- */
      function readKeys(i) {
        if (cpuOn && i === 1) return cpuIn;
        const k = api.keys;
        let dir = 0, up = false, down = false, act = false;
        if (i === 0) {
          if (k.has('KeyA')) dir--;
          if (k.has('KeyD')) dir++;
          up = k.has('KeyW');
          down = k.has('KeyS');
          act = k.has('Space');
        }
        if (i === 1 || cpuOn) {
          if (k.has('ArrowLeft')) dir--;
          if (k.has('ArrowRight')) dir++;
          up = up || k.has('ArrowUp');
          down = down || k.has('ArrowDown');
          act = act || k.has('Enter') || k.has('NumpadEnter');
        }
        return { dir: U.clamp(dir, -1, 1), up, down, act };
      }

      const human = (w) => !(cpuOn && w.id === 1);

      function control(w, inp, dt) {
        w.dir = inp.dir;
        w.crouch = !!inp.down;
        if (inp.up && !w.prevUp) w.jumpBuf = 0.14;
        w.prevUp = !!inp.up;
        if (inp.act) {
          if (!w.chargeLock && w.cd <= 0 && w.lunge <= 0) {
            const before = w.charge;
            w.charge += dt;
            if (before < CHARGE_T && w.charge >= CHARGE_T) {
              api.sfx('tick');
              spark(w.x, w.y, C.gold, 8, 120, 0.35);
              if (!hinted.charge && human(w)) {
                hinted.charge = true;
                api.setStatus('Charged! Let go to unleash a big shove. A quick tap from your rival cancels it.');
              }
            }
          }
        } else {
          if (w.prevAct && w.charge > 0 && !w.chargeLock) shove(w, w.charge >= CHARGE_T);
          w.charge = 0;
          w.chargeLock = false;
        }
        w.prevAct = !!inp.act;
        if (w.lunge <= 0 && w.stun <= 0) {
          if (w.dir) {
            w.face = w.dir > 0 ? 1 : -1;
          } else {
            const foe = ws[1 - w.id];
            const f = frameOf(w);
            const dx = foe.x - w.x, dy = foe.y - w.y;
            if (!foe.out && Math.hypot(dx, dy) < 220) {
              const al = dx * f.tx + dy * f.ty;
              if (Math.abs(al) > 4) w.face = al > 0 ? 1 : -1;
            }
          }
        }
      }

      function idle(w) {
        w.dir = 0;
        w.crouch = false;
        w.charge = 0;
        w.chargeLock = false;
        w.prevAct = false;
        w.prevUp = false;
        w.jumpBuf = 0;
      }

      /* ---------- Shoving ---------- */
      function shove(w, charged) {
        const f = frameOf(w);
        const ph = PH[phase];
        w.cd = COOLDOWN;
        w.lunge = LUNGE_T;
        w.lungeCharged = charged;
        w.lungeHit = false;
        w.armT = 0.3;
        const grounded = w.ground > 0;
        const v = (charged ? LUNGE_VC : LUNGE_V) * ph.lunge * (grounded ? 1 : 0.6) * (w.crouch ? 0.7 : 1);
        const surf = grounded ? OMEGA * f.r : 0;
        const vt = w.vx * f.tx + w.vy * f.ty - surf;
        const want = w.face * Math.max(w.face * vt, v);
        const dv = want - vt;
        w.vx += f.tx * dv;
        w.vy += f.ty * dv;
        api.sfx(charged ? 'shoot' : 'flip');
      }

      function canHit(a, b) {
        if (a.lunge <= 0 || a.lungeHit) return false;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.hypot(dx, dy) > REACH) return false;
        const f = frameOf(a);
        return (dx * f.tx + dy * f.ty) * a.face > -6;
      }

      function land(att, vic) {
        att.lungeHit = true;
        const charged = att.lungeCharged;
        const fv = frameOf(vic), fa = frameOf(att);
        const s = (fa.tx * fv.tx + fa.ty * fv.ty) * att.face >= 0 ? 1 : -1;
        const lift = charged ? 0.62 : 0.5;
        const side = Math.sqrt(1 - lift * lift);
        let p = (charged ? CHARGE_P : TAP_P) * PH[phase].knock;
        const braced = vic.crouch;
        if (braced) p *= vic.ground > 0 ? 0.5 : 0.72;
        vic.vx += (fv.tx * s * side + fv.ux * lift) * p;
        vic.vy += (fv.ty * s * side + fv.uy * lift) * p;
        vic.ground = 0;
        vic.stun = charged ? 0.45 : 0.25;
        vic.lunge = 0;
        if (vic.charge > 0) {
          vic.charge = 0;
          vic.chargeLock = true;
        }
        // The attacker stops dead with a little recoil.
        const vt = att.vx * fa.tx + att.vy * fa.ty;
        const dv = -att.face * 50 - vt;
        att.vx += fa.tx * dv;
        att.vy += fa.ty * dv;
        att.lunge = 0;
        const mx = (att.x + vic.x) / 2, my = (att.y + vic.y) / 2;
        if (charged) {
          shake = Math.max(shake, braced ? 6 : 11);
          spark(mx, my, C.gold, 26, 340, 0.6);
          spark(mx, my, att.color, 18, 260, 0.5);
          api.sfx('boom');
          popup(mx + fa.ux * 40, my + fa.uy * 40, braced ? 'BRACED' : 'BIG SHOVE!', braced ? C.muted : C.gold);
          if (!braced && !hinted.crouch && human(vic)) {
            hinted.crouch = true;
            api.setStatus('Tip: hold ' + (vic.id === 0 && !cpuOn ? 'S' : vic.id === 0 ? 'S or ↓' : '↓') +
              ' to crouch. Crouching takes half the knockback.');
          }
        } else {
          shake = Math.max(shake, 4);
          spark(mx, my, C.text, 10, 200, 0.35);
          api.sfx('hit');
          if (braced) popup(mx + fa.ux * 36, my + fa.uy * 36, 'braced', C.muted);
        }
      }

      function clash(a, b) {
        a.lungeHit = b.lungeHit = true;
        a.lunge = b.lunge = 0;
        for (const [w, o] of [[a, b], [b, a]]) {
          const f = frameOf(w);
          const dx = w.x - o.x, dy = w.y - o.y;
          const s = dx * f.tx + dy * f.ty >= 0 ? 1 : -1;
          const p = TAP_P * 0.6 * (w.crouch ? 0.6 : 1);
          w.vx += (f.tx * s * 0.92 + f.ux * 0.38) * p;
          w.vy += (f.ty * s * 0.92 + f.uy * 0.38) * p;
          w.ground = 0;
          w.stun = 0.2;
        }
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        spark(mx, my, C.gold, 16, 240, 0.45);
        shake = Math.max(shake, 6);
        api.sfx('hit');
        const f = frameOf(a);
        popup(mx + f.ux * 40, my + f.uy * 40, 'CLASH!', C.gold);
      }

      function hits() {
        const a = ws[0], b = ws[1];
        const ab = canHit(a, b), ba = canHit(b, a);
        if (ab && ba) {
          if (a.lungeCharged === b.lungeCharged) clash(a, b);
          else if (a.lungeCharged) {
            b.lunge = 0;
            b.lungeHit = true;
            land(a, b);
          } else {
            a.lunge = 0;
            a.lungeHit = true;
            land(b, a);
          }
        } else if (ab) land(a, b);
        else if (ba) land(b, a);
      }

      const massOf = (w) => (w.crouch ? 1.8 : 1) * (w.lunge > 0 ? 1.25 : 1);

      function bodies() {
        const a = ws[0], b = ws[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = 2 * WR;
        if (d >= min) return;
        const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
        const ia = 1 / massOf(a), ib = 1 / massOf(b);
        const over = min - d;
        a.x -= nx * over * ia / (ia + ib);
        a.y -= ny * over * ia / (ia + ib);
        b.x += nx * over * ib / (ia + ib);
        b.y += ny * over * ib / (ia + ib);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j = -(1 + 0.3) * vn / (ia + ib);
          a.vx -= j * ia * nx;
          a.vy -= j * ia * ny;
          b.vx += j * ib * nx;
          b.vy += j * ib * ny;
          if (-vn > 240) {
            api.sfx('hit');
            spark(a.x + nx * WR, a.y + ny * WR, C.text, 6, 140, 0.3);
          }
        }
      }

      /* ---------- Physics (fixed step) ---------- */
      function step(h) {
        gCur += (PH[phase].g - gCur) * (1 - Math.exp(-8 * h));
        const ph = PH[phase];
        for (const w of ws) {
          const f = frameOf(w);
          const g = gravOn(w);
          w.vx -= f.ux * g * h;
          w.vy -= f.uy * g * h;
          let vr = w.vx * f.ux + w.vy * f.uy;
          let vt = w.vx * f.tx + w.vy * f.ty;
          const grounded = w.ground > 0;
          if (w.out) {
            // Drifting away into space.
          } else if (grounded) {
            const surf = OMEGA * f.r;
            let rel = vt - surf;
            if (w.lunge <= 0) {
              const dir = w.stun > 0 ? 0 : w.dir;
              const max = WALK * ph.walk * (w.crouch ? 0.42 : 1) * (w.charge > 0 ? 0.65 : 1);
              const a = TRACTION * ph.grip * (w.crouch ? 1.4 : 1) * (w.stun > 0 ? 0.45 : 1);
              rel += U.clamp(dir * max - rel, -a * h, a * h);
            }
            vt = rel + surf;
          } else {
            if (w.dir && w.stun <= 0 && w.dir * vt < 150) vt += w.dir * AIR_CTRL * h;
            const k = Math.exp(-AIR_DRAG * h);
            vr *= k;
            vt *= k;
          }
          if (w.jumpBuf > 0) {
            w.jumpBuf -= h;
            if (grounded && !w.crouch && w.stun <= 0 && !w.out && pulseT <= 0) {
              // Use the weaker of the old and new gravity so a jump during a shift never launches you off.
              vr = Math.sqrt(2 * Math.max(300, Math.min(gCur, ph.g)) * ph.jumpH);
              w.ground = 0;
              w.jumpBuf = 0;
              w.squash = -0.35;
              api.sfx('blip');
            }
          }
          w.vx = f.ux * vr + f.tx * vt;
          w.vy = f.uy * vr + f.ty * vt;
          w.x += w.vx * h;
          w.y += w.vy * h;
          w.lunge = Math.max(0, w.lunge - h);
          w.stun -= h;
          w.ground -= h;
        }
        if (!ws[0].out && !ws[1].out) {
          hits();
          bodies();
        }
        const outs = [];
        for (const w of ws) {
          if (!Number.isFinite(w.x) || !Number.isFinite(w.y) || !Number.isFinite(w.vx) || !Number.isFinite(w.vy)) {
            const fresh = makeW(w.id);
            w.x = fresh.x; w.y = fresh.y; w.vx = 0; w.vy = 0;
          }
          if (w.out) continue;
          const f = frameOf(w);
          if (f.r < R0) {
            w.x = CX + f.ux * R0;
            w.y = CY + f.uy * R0;
            const vr = w.vx * f.ux + w.vy * f.uy;
            let after = vr;
            if (vr < 0) {
              const bounce = vr < -380 ? 0.22 : 0;
              after = -vr * bounce;
              w.vx -= f.ux * vr * (1 + bounce);
              w.vy -= f.uy * vr * (1 + bounce);
              if (vr < -240 && w.ground <= 0) {
                w.squash = Math.min(0.7, -vr / 800);
                spark(CX + f.ux * PR, CY + f.uy * PR, C.muted, 6, 110, 0.4);
              }
            }
            // Only count as standing when not already launching away (a fresh shove or a bounce).
            if (after < 60) w.ground = 0.06;
          }
          if (state === 'play' && f.r > erNow) outs.push(w);
        }
        if (outs.length) ringOut(outs);
      }

      /* ---------- Gravity cycle ---------- */
      function updatePhase(dt) {
        const wasPulseWarn = pulseWarning();
        phaseT -= dt;
        if (phaseT <= WARN && phaseT > 0) {
          const n = Math.ceil(phaseT);
          if (n !== warnTick) {
            warnTick = n;
            api.sfx('tick');
            if (!hinted.warn) {
              hinted.warn = true;
              api.setStatus('Gravity is about to shift to ' + PH[nextPhase].label + ': watch the ring on the planet.');
            }
          }
        }
        if (!wasPulseWarn && pulseWarning() && !hinted.pulse) {
          hinted.pulse = true;
          api.setStatus('Reverse pulse incoming! Gravity pushes outward for a moment. Crouch to stay anchored.');
        }
        if (pulseAt > 0 && phaseT <= pulseAt) {
          pulseAt = -1;
          pulseT = PULSE_LEN;
          shake = Math.max(shake, 8);
          api.sfx('flip');
          for (let k = 0; k < 24; k++) {
            const a = (k / 24) * Math.PI * 2;
            spark(CX + Math.cos(a) * (PR + 4), CY + Math.sin(a) * (PR + 4), C.text, 1, 200, 0.5);
          }
        }
        if (phaseT <= 0) {
          phase = nextPhase;
          nextPhase = pickNext(phase);
          phaseT = PHASE_LEN;
          phaseFlash = 1;
          warnTick = 99;
          pulseAt = phase !== 'low' && Math.random() < 0.45 ? U.rand(3.4, 5.2) : -1;
          api.sfx('power');
          shake = Math.max(shake, 5);
          const crouchKey = cpuOn ? 'S' : 'S / ↓';
          api.setStatus(phase === 'low'
            ? 'LOW gravity: floaty! Shoves fling people off. Crouch (' + crouchKey + ') to stay grounded.'
            : phase === 'heavy'
              ? 'HEAVY gravity: sticky and slow. Hard to move, hard to knock off.'
              : 'NORMAL gravity again. Next shift in 8 seconds.');
        }
      }

      /* ---------- Computer ---------- */
      function cpuThink(dt) {
        const me = ws[1], foe = ws[0];
        const L = LEVELS[level] || LEVELS.normal;
        ai.timer -= dt;
        ai.crouchT -= dt;
        ai.retreatT -= dt;
        if (ai.hold) ai.holdT += dt;
        const fm = frameOf(me);
        const dx = foe.x - me.x, dy = foe.y - me.y;
        const d = Math.hypot(dx, dy);
        const along = dx * fm.tx + dy * fm.ty;
        const side = along >= 0 ? 1 : -1;
        const foeAir = foe.ground <= 0;
        if (ai.timer <= 0) {
          ai.timer = L.react * (0.6 + Math.random() * 0.8);
          const foeAims = foe.face === -side;
          const threat = foeAims && d < 170 && (foe.charge > 0.2 || (foe.lunge > 0 && foe.lungeCharged));
          if (threat && Math.random() < L.guard) ai.crouchT = 0.45 + Math.random() * 0.4;
          if ((pulseWarning() || pulseT > 0) && Math.random() < L.guard) ai.crouchT = Math.max(ai.crouchT, 0.5);
          if (phase === 'low' && d < 110 && foe.cd <= 0 && Math.random() < L.guard * 0.4) ai.crouchT = Math.max(ai.crouchT, 0.35);
          // A rival charging right next to us: interrupt with a quick tap.
          if (!ai.hold && me.cd <= 0 && foe.charge > 0 && d < REACH + 6 && Math.random() < L.smart) {
            ai.hold = true;
            ai.wantCharge = false;
            ai.holdT = 0;
            ai.crouchT = 0;
          }
          if (ai.retreatT > 0) ai.dir = -side;
          else if (d > REACH - 8) ai.dir = side;
          else ai.dir = 0;
          if (!ai.hold && me.cd <= 0 && ai.crouchT <= 0 && Math.random() < L.aggr) {
            let wantCharge = Math.random() < L.charge;
            if (Math.random() < L.smart) {
              if (phase === 'low' || pulseT > 0 || foeAir || foe.crouch || (nextPhase === 'low' && phaseT < 1.3)) wantCharge = true;
              else if (phase === 'heavy') wantCharge = false;
            }
            if (d < (wantCharge ? REACH + 170 : REACH + 12)) {
              ai.hold = true;
              ai.wantCharge = wantCharge;
              ai.holdT = 0;
            }
          }
        }
        if (ai.hold) {
          const ready = !ai.wantCharge || me.charge >= CHARGE_T;
          const inRange = d < REACH + (ai.wantCharge ? 30 : 16) && along * me.face > -6;
          if (me.chargeLock || ai.holdT > 2.6 || (ready && inRange && me.charge > 0)) {
            ai.hold = false;
            if (ready && inRange) ai.retreatT = L.smart > 0.6 ? 0.35 : 0;
          }
        }
        cpuIn.dir = (ai.crouchT > 0 && d < REACH + 10 ? 0 : ai.dir) * L.walk;
        cpuIn.down = ai.crouchT > 0;
        cpuIn.act = ai.hold;
        cpuIn.up = false;
      }

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        rot += OMEGA * dt;
        shake = Math.max(0, shake - dt * 30);
        goFlash = Math.max(0, goFlash - dt);
        phaseFlash = Math.max(0, phaseFlash - dt * 0.8);
        pulseT = Math.max(0, pulseT - dt);
        flow += dt * (pulseT > 0 ? -1.1 : PH[phase].flow);
        const drag = Math.max(0, 1 - 3 * dt);
        let j = 0;
        for (const p of particles) {
          p.life -= dt;
          if (p.life <= 0) continue;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= drag;
          p.vy *= drag;
          particles[j++] = p;
        }
        particles.length = j;
        for (const p of popups) {
          p.life -= dt;
          p.y -= 30 * dt;
        }
        popups = popups.filter((p) => p.life > 0);

        if (state === 'count') {
          countT -= dt;
          const n = Math.ceil(countT);
          if (n !== lastCount && n > 0) {
            lastCount = n;
            api.sfx('tick');
          }
          if (countT <= 0) {
            state = 'play';
            goFlash = 0.7;
            api.sfx('power');
          }
        } else if (state === 'play') {
          playT += dt;
          updatePhase(dt);
          if (playT > OVERTIME) {
            erNow = Math.max(ER_MIN, ER - (playT - OVERTIME) * 4);
            if (!hinted.overtime) {
              hinted.overtime = true;
              api.setStatus('Overtime: the escape ring is closing in!');
            }
          }
          if (cpuOn) cpuThink(dt);
          ws.forEach((w, i) => control(w, readKeys(i), dt));
        } else if (state === 'point') {
          pointT -= dt;
          if (pointT <= 0) {
            if (Math.max(scores[0], scores[1]) >= WIN) matchOver();
            else startPoint();
          }
        }
        if (state !== 'play') ws.forEach(idle);
        for (const w of ws) {
          w.cd = Math.max(0, w.cd - dt);
          w.armT = Math.max(0, w.armT - dt);
          w.squash *= Math.exp(-10 * dt);
          if (w.out) w.spin += dt * 9;
          const sp = Math.hypot(w.vx, w.vy);
          if (sp > 420 || w.out) w.trail.push({ x: w.x, y: w.y, life: 0.25 });
          for (const p of w.trail) p.life -= dt;
          w.trail = w.trail.filter((p) => p.life > 0).slice(-12);
        }
        acc += dt;
        let n = 0;
        while (acc >= STEP && n < 8) {
          step(STEP);
          acc -= STEP;
          n++;
        }
        if (n >= 8) acc = 0;
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, scale, color, alpha) {
        ctx.save();
        ctx.globalAlpha = U.clamp(alpha, 0, 1);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(text, 2, 3);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function drawEscapeRing() {
        const closing = erNow < ER - 0.5;
        ctx.save();
        ctx.setLineDash([5, 9]);
        ctx.lineDashOffset = -clock * 8;
        ctx.strokeStyle = U.alpha(closing ? C.gold : C.muted, closing ? 0.6 : 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(CX, CY, erNow, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        for (const w of ws) {
          if (w.out) continue;
          const f = frameOf(w);
          const near = (f.r - (erNow - 70)) / 70;
          if (near <= 0) continue;
          ctx.strokeStyle = U.alpha(w.color, U.clamp(near, 0, 1) * 0.9);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(CX, CY, erNow, f.ang - 0.3, f.ang + 0.3);
          ctx.stroke();
        }
      }

      function drawCenterLabel() {
        if (state !== 'play' && state !== 'menu') return;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (pulseT > 0 || pulseWarning()) {
          const on = pulseT > 0 || Math.sin(clock * 18) > 0;
          bigText('REVERSE', CX, CY - 16, 0.55, C.text, on ? 0.95 : 0.45);
          bigText('PULSE', CX, CY + 16, 0.55, C.text, on ? 0.95 : 0.45);
          ctx.font = HUD;
          ctx.fillStyle = U.alpha(C.text, 0.75);
          ctx.fillText(pulseT > 0 ? 'hold on!' : 'crouch!', CX, CY + 50);
          return;
        }
        if (state === 'play' && phaseT <= WARN) {
          const np = PH[nextPhase];
          bigText(np.label, CX, CY - 8, 0.72, np.color, 0.65 + 0.35 * Math.sin(clock * 16));
          ctx.font = HUD;
          ctx.fillStyle = C.text;
          ctx.fillText('gravity in ' + Math.max(1, Math.ceil(phaseT)), CX, CY + 28);
          return;
        }
        const ph = PH[phase];
        bigText(ph.label, CX, CY - 6, 0.68 * (1 + phaseFlash * 0.35), ph.color, 0.3 + phaseFlash * 0.7);
        ctx.font = HUD;
        ctx.fillStyle = U.alpha(C.muted, 0.6);
        ctx.fillText('gravity', CX, CY + 28);
      }

      function drawPanel(i) {
        const w = ws[i];
        const bw = 250, bh = 46, x = i === 0 ? 16 : W - 16 - bw, y = 12;
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, x, y, bw, bh, 10);
        ctx.fill();
        ctx.strokeStyle = U.alpha(w.color, 0.55);
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = i === 0 ? 'left' : 'right';
        ctx.fillStyle = w.color;
        ctx.fillText(shortName(i), i === 0 ? x + 14 : x + bw - 14, y + 16);
        for (let k = 0; k < WIN; k++) {
          const px = i === 0 ? x + bw - 18 - (WIN - 1 - k) * 16 : x + 18 + (WIN - 1 - k) * 16;
          ctx.beginPath();
          ctx.arc(px, y + 16, 5, 0, Math.PI * 2);
          if (k < scores[i]) {
            ctx.fillStyle = w.color;
            ctx.fill();
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        const mx = x + 14, my = y + 32, mw = bw - 28;
        ctx.fillStyle = C.line;
        U.roundRect(ctx, mx, my, mw, 6, 3);
        ctx.fill();
        let frac = 1, col = w.color;
        if (w.charge > 0) {
          frac = Math.min(1, w.charge / CHARGE_T);
          col = frac >= 1 ? C.gold : C.text;
        } else if (w.cd > 0) {
          frac = 1 - w.cd / COOLDOWN;
          col = U.alpha(w.color, 0.45);
        }
        ctx.fillStyle = col;
        U.roundRect(ctx, i === 0 ? mx : mx + mw - Math.max(6, mw * frac), my, Math.max(6, mw * frac), 6, 3);
        ctx.fill();
      }

      function drawHud() {
        drawPanel(0);
        drawPanel(1);
        const ph = PH[phase];
        const warn = state === 'play' && phaseT <= WARN;
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ph.color;
        ctx.fillText('GRAVITY · ' + ph.label, W / 2, 22);
        const bx = W / 2 - 80, by = 38;
        ctx.fillStyle = C.line;
        U.roundRect(ctx, bx, by, 160, 6, 3);
        ctx.fill();
        ctx.fillStyle = warn && Math.sin(clock * 16) > 0 ? PH[nextPhase].color : ph.color;
        U.roundRect(ctx, bx, by, Math.max(6, 160 * U.clamp(phaseT / PHASE_LEN, 0, 1)), 6, 3);
        ctx.fill();
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawBackdrop(ctx, W, H, clock);
        const ph = PH[phase];
        const warn = state === 'play' && phaseT <= WARN;
        const pWarn = pulseWarning() && state === 'play';
        drawEscapeRing();
        // Reverse pulse telegraph: rings rushing outward.
        if (pWarn || pulseT > 0) {
          for (let k = 0; k < 3; k++) {
            const p = (clock * 1.4 + k / 3) % 1;
            ctx.strokeStyle = U.alpha(C.text, (1 - p) * (pulseT > 0 ? 0.6 : 0.35));
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(CX, CY, PR + p * (erNow - PR), 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        drawField(ctx, CX, CY, 1, flow, pulseT > 0 ? C.text : ph.color, phase === 'heavy' ? 0.5 : 0.35, pulseT > 0);
        let auraColor = ph.color;
        let aura = 0.75 + 0.25 * Math.sin(clock * 2) + phaseFlash * 0.6;
        if (warn && Math.sin(clock * 16) > 0) {
          auraColor = PH[nextPhase].color;
          aura = 1.15;
        }
        if (pulseT > 0 || (pWarn && Math.sin(clock * 20) > 0)) {
          auraColor = C.text;
          aura = 1.1;
        }
        drawPlanet(ctx, CX, CY, PR, rot, auraColor, aura);
        // Countdown ring on the planet before each gravity shift.
        if (warn) {
          const k = U.clamp(1 - phaseT / WARN, 0, 1);
          ctx.strokeStyle = U.alpha(C.ink, 0.6);
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(CX, CY, PR - 12, 0, Math.PI * 2);
          ctx.stroke();
          ctx.strokeStyle = PH[nextPhase].color;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(CX, CY, PR - 12, -Math.PI / 2, -Math.PI / 2 + Math.max(0.01, k) * Math.PI * 2);
          ctx.stroke();
          ctx.lineCap = 'butt';
        }
        drawCenterLabel();
        // Shadows on the surface.
        for (const w of ws) {
          if (w.out) continue;
          const f = frameOf(w);
          const hgt = f.r - R0;
          if (hgt > 110) continue;
          const k = 1 - Math.max(0, hgt) / 110;
          ctx.fillStyle = U.alpha(C.ink, 0.5 * k);
          ctx.beginPath();
          ctx.ellipse(CX + f.ux * (PR + 1), CY + f.uy * (PR + 1), 17 * (0.5 + 0.5 * k), 4.5 * (0.5 + 0.5 * k),
            f.ang + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const w of ws) {
          for (const p of w.trail) {
            ctx.fillStyle = U.alpha(w.color, p.life * 1.2);
            ctx.beginPath();
            ctx.arc(p.x, p.y, WR * (0.3 + p.life * 2), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        for (const w of ws) {
          const f = frameOf(w);
          drawWrestler(ctx, w.x, w.y, f.ang + w.spin, w.color, {
            face: w.face,
            crouch: w.crouch,
            charge: w.charge > 0 ? Math.min(1, w.charge / CHARGE_T) : 0,
            full: w.charge >= CHARGE_T,
            lunge: w.armT > 0,
            stun: w.stun > 0 || w.out,
            squash: w.squash,
            t: clock
          });
        }
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const p of popups) {
          ctx.globalAlpha = U.clamp(p.life / 0.4, 0, 1);
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillText(p.text, p.x + 1, p.y + 2);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (state !== 'menu') drawHud();
        if (state === 'count') {
          const n = Math.max(1, Math.ceil(countT));
          const f = U.clamp(countT - (n - 1), 0, 1);
          bigText(String(n), CX, CY - 4, 1.2 + Math.pow(f, 3) * 1.1, C.text, 0.3 + f * 1.4);
        }
        if (goFlash > 0) bigText('Go!', CX, CY - 4, 1.2 + (0.7 - goFlash), C.gold, goFlash / 0.5);
        if (state === 'point') {
          const a = Math.min(1, (2.2 - pointT) * 5);
          bigText(pointMsg, CX, CY - 14, 0.9 + Math.max(0, pointT - 1.9), pointColor, a);
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = U.clamp(a, 0, 1);
          ctx.fillStyle = C.text;
          ctx.fillText(pointSub, CX, CY + 30);
          ctx.globalAlpha = 1;
        }
      }

      showStartMenu();
      api.loop((dt, t) => {
        // After a pause (or a hidden tab) forget half-finished button presses.
        if (lastT >= 0 && t - lastT > 0.25) {
          for (const w of ws) {
            w.prevAct = false;
            w.prevUp = false;
            w.charge = 0;
          }
        }
        lastT = t;
        update(dt);
        draw();
      });
    }
  });
})();
