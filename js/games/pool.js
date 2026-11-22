/* Pool — top-down 8-ball against the computer or a friend, with a neutral gold bonus ball. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  /* ===== PHYSICS START ===== */
  const W = 960;
  const H = 640;
  const L = 70;
  const T = 132;
  const RR = 890;
  const B = 542;
  const TW = RR - L;
  const MX = (L + RR) / 2;
  const MY = (T + B) / 2;
  const R = 11;
  const RAIL = 40;
  const CG = 30;
  const SG = 22;
  const MAX_SPEED = 1550;
  const FRICTION = 170;
  const DAMP = 0.15;
  const SLEEP = 6;
  const E_BALL = 0.95;
  const E_RAIL = 0.76;
  const H_LIVE = 1 / 480;
  const H_SIM = 1 / 480;
  const HEAD_X = L + TW * 0.25;
  const FOOT_X = L + TW * 0.75;
  const GOLD = 16;
  const GOLD_SPOT = { x: MX - 90, y: T + 62 };
  const MAX_PULL = 240;
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const BIG = '800 44px Unbounded, sans-serif';
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  const BALL_COLORS = { 1: '#F2D24B', 2: '#3D6EF2', 3: '#E8475C', 4: '#9B6BFF', 5: '#FF8A3D', 6: '#2FB57A', 7: '#9E2F4E', 8: '#15122B' };
  const ballColor = (id) => (id === 0 ? '#F7F4EC' : id === GOLD ? C.gold : BALL_COLORS[id > 8 ? id - 8 : id]);
  const isSolid = (id) => id >= 1 && id <= 7;
  const isStripe = (id) => id >= 9 && id <= 15;

  const POCKETS = [
    { x: L - 6, y: T - 6, r: 21 },
    { x: MX, y: T - 13, r: 19 },
    { x: RR + 6, y: T - 6, r: 21 },
    { x: L - 6, y: B + 6, r: 21 },
    { x: MX, y: B + 13, r: 19 },
    { x: RR + 6, y: B + 6, r: 21 }
  ];

  /* Cushions as segments; the angled ones are pocket jaws. Balls bounce off any segment (ends act as round noses). */
  const SEGS = [];
  const seg = (x1, y1, x2, y2) => SEGS.push({ x1, y1, x2, y2, dx: x2 - x1, dy: y2 - y1, l2: (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1) });
  seg(L + CG, T, MX - SG, T); seg(MX + SG, T, RR - CG, T);
  seg(L + CG, B, MX - SG, B); seg(MX + SG, B, RR - CG, B);
  seg(L, T + CG, L, B - CG); seg(RR, T + CG, RR, B - CG);
  seg(L + CG, T, L + CG - 8, T - 18); seg(L, T + CG, L - 18, T + CG - 8);
  seg(RR - CG, T, RR - CG + 8, T - 18); seg(RR, T + CG, RR + 18, T + CG - 8);
  seg(L + CG, B, L + CG - 8, B + 18); seg(L, B - CG, L - 18, B - CG + 8);
  seg(RR - CG, B, RR - CG + 8, B + 18); seg(RR, B - CG, RR + 18, B - CG + 8);
  seg(MX - SG, T, MX - SG + 3, T - 18); seg(MX + SG, T, MX + SG - 3, T - 18);
  seg(MX - SG, B, MX - SG + 3, B + 18); seg(MX + SG, B, MX + SG - 3, B + 18);
  const JAWS = [[L + CG, T], [L, T + CG], [RR - CG, T], [RR, T + CG], [L + CG, B], [L, B - CG], [RR - CG, B], [RR, B - CG],
    [MX - SG, T], [MX + SG, T], [MX - SG, B], [MX + SG, B]];

  /* ---------- Physics (shared by play and the computer's simulations) ---------- */
  function newEvents() {
    return { first: -1, railAfter: false, pots: [], pocket: {}, clack: 0, thud: 0 };
  }

  /* Equal-mass elastic collisions between touching balls; returns how many impacts happened. */
  function collidePairs(balls, ev) {
    const n = balls.length;
    let hits = 0;
    for (let i = 0; i < n; i++) {
      const a = balls[i];
      if (!a.on) continue;
      for (let j = i + 1; j < n; j++) {
        const b = balls[j];
        if (!b.on) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx > 2 * R || dx < -2 * R || dy > 2 * R || dy < -2 * R) continue;
        let d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) continue;
        let nx;
        let ny;
        if (d2 < 1e-6) { nx = 1; ny = 0; d2 = 0; } else {
          const d = Math.sqrt(d2);
          nx = dx / d;
          ny = dy / d;
        }
        const push = (2 * R - Math.sqrt(d2)) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          const jimp = (rel * (1 + E_BALL)) / 2;
          a.vx -= jimp * nx; a.vy -= jimp * ny;
          b.vx += jimp * nx; b.vy += jimp * ny;
          if (ev.first < 0 && (a.id === 0 || b.id === 0)) ev.first = a.id === 0 ? b.id : a.id;
          if (rel > ev.clack) ev.clack = rel;
          hits++;
        }
      }
    }
    return hits;
  }

  function physStep(balls, h, ev, live) {
    const n = balls.length;
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on || (b.vx === 0 && b.vy === 0)) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      if (live) {
        b.roll += (Math.hypot(b.vx, b.vy) * h) / R;
        b.dir = Math.atan2(b.vy, b.vx);
      }
    }
    // A few passes so packed clusters (the rack) share momentum the way simultaneous contacts would.
    for (let pass = 0; pass < 3; pass++) {
      if (!collidePairs(balls, ev)) break;
    }
    for (let i = 0; i < n; i++) {
      const b = balls[i];
      if (!b.on) continue;
      const inner = b.x > L + R + 1 && b.x < RR - R - 1 && b.y > T + R + 1 && b.y < B - R - 1;
      if (!inner) {
        for (let k = 0; k < SEGS.length; k++) {
          const s = SEGS[k];
          let t = ((b.x - s.x1) * s.dx + (b.y - s.y1) * s.dy) / s.l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = s.x1 + s.dx * t;
          const cy = s.y1 + s.dy * t;
          const ex = b.x - cx;
          const ey = b.y - cy;
          const d2 = ex * ex + ey * ey;
          if (d2 >= R * R || d2 < 1e-9) continue;
          const d = Math.sqrt(d2);
          const nx = ex / d;
          const ny = ey / d;
          b.x = cx + nx * R;
          b.y = cy + ny * R;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) {
            b.vx -= (1 + E_RAIL) * vn * nx;
            b.vy -= (1 + E_RAIL) * vn * ny;
            const vt = -b.vx * ny + b.vy * nx;
            b.vx -= vt * 0.05 * -ny;
            b.vy -= vt * 0.05 * nx;
            if (ev.first >= 0) ev.railAfter = true;
            if (-vn > ev.thud) ev.thud = -vn;
          }
        }
        let pocket = -1;
        for (let k = 0; k < POCKETS.length; k++) {
          const p = POCKETS[k];
          if ((b.x - p.x) * (b.x - p.x) + (b.y - p.y) * (b.y - p.y) < p.r * p.r) { pocket = k; break; }
        }
        if (pocket < 0 && (b.x < L - 6 || b.x > RR + 6 || b.y < T - 6 || b.y > B + 6)) {
          let bd = Infinity;
          POCKETS.forEach((p, k) => {
            const d = Math.hypot(b.x - p.x, b.y - p.y);
            if (d < bd) { bd = d; pocket = k; }
          });
        }
        if (pocket >= 0) {
          b.on = false;
          ev.pots.push(b.id);
          ev.pocket[b.id] = pocket;
          if (live) b.fall = { x: b.x, y: b.y, t: 0, p: pocket };
          b.vx = 0;
          b.vy = 0;
          continue;
        }
      }
      if (b.vx !== 0 || b.vy !== 0) {
        const sp = Math.hypot(b.vx, b.vy);
        const dec = (FRICTION + DAMP * sp) * h;
        if (sp <= dec || sp < SLEEP) { b.vx = 0; b.vy = 0; } else {
          const k = (sp - dec) / sp;
          b.vx *= k;
          b.vy *= k;
        }
      }
    }
  }

  const stopped = (balls) => balls.every((b) => !b.on || (b.vx === 0 && b.vy === 0));

  function simulate(src, angle, speed) {
    const balls = src.map((b) => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0, on: b.on }));
    const cue = balls.find((b) => b.id === 0);
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    const ev = newEvents();
    for (let i = 0; i < 4800; i++) {
      physStep(balls, H_SIM, ev, false);
      if ((i & 7) === 0 && stopped(balls)) break;
    }
    return { first: ev.first, railAfter: ev.railAfter, pots: ev.pots, cue: { x: cue.x, y: cue.y, on: cue.on }, balls };
  }

  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t));
  }

  /* ===== PHYSICS END ===== */

  /* ---------- Art ---------- */
  function drawBall(ctx, id, x, y, r, roll, dir, alpha, t) {
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    if (id === GOLD) {
      const pulse = 0.5 + 0.5 * Math.sin((t || 0) * 4);
      ctx.fillStyle = U.alpha(C.gold, 0.16 + 0.16 * pulse);
      ctx.beginPath();
      ctx.arc(x, y, r * (1.7 + pulse * 0.25), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + r * 0.22, y + r * 0.32, r, r * 0.92, 0, 0, Math.PI * 2);
    ctx.fill();
    const col = ballColor(id);
    ctx.fillStyle = isStripe(id) ? '#F7F4EC' : col;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    const sr = Math.sin(roll || 0);
    const front = Math.cos(roll || 0);
    const ox = Math.cos(dir || 0) * sr * r * 0.45;
    const oy = Math.sin(dir || 0) * sr * r * 0.45;
    if (isStripe(id)) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.translate(x + ox * 0.6, y + oy * 0.6);
      ctx.rotate((dir || 0) + Math.PI / 2);
      ctx.fillStyle = col;
      ctx.fillRect(-r * 1.2, -r * 0.55, r * 2.4, r * 1.1);
      ctx.restore();
    }
    if (id !== 0 && front > -0.25) {
      ctx.fillStyle = '#FBF8F0';
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, r * 0.48, 0, Math.PI * 2);
      ctx.fill();
      if (id === GOLD) {
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const rr = (i % 2 ? 0.17 : 0.4) * r;
          ctx.lineTo(x + ox + Math.cos(a) * rr, y + oy + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
      } else if (r >= 8) {
        ctx.fillStyle = '#15122B';
        ctx.font = '800 ' + Math.round(r * 0.68) + 'px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(id), x + ox, y + oy + 0.5);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.35, y - r * 0.4, r * 0.32, r * 0.2, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,36,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawTable(ctx, t) {
    // Rails.
    ctx.fillStyle = '#2B2452';
    U.roundRect(ctx, L - RAIL, T - RAIL, TW + RAIL * 2, B - T + RAIL * 2, 26);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#211B44';
    U.roundRect(ctx, L - RAIL + 8, T - RAIL + 8, TW + RAIL * 2 - 16, B - T + RAIL * 2 - 16, 20);
    ctx.fill();
    // Cloth.
    const g = ctx.createRadialGradient(MX, MY, 40, MX, MY, TW * 0.6);
    g.addColorStop(0, '#1C7466');
    g.addColorStop(1, '#125148');
    ctx.fillStyle = g;
    ctx.fillRect(L - 4, T - 4, TW + 8, B - T + 8);
    // Cushion strips.
    ctx.strokeStyle = '#0E3F38';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    SEGS.forEach((s, i) => {
      if (i >= 6) return;
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    });
    // Diamonds.
    ctx.fillStyle = U.alpha(C.gold, 0.8);
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      const x = L + (TW * i) / 8;
      [T - RAIL / 2 - 4, B + RAIL / 2 + 4].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y);
        ctx.fill();
      });
    }
    for (let i = 1; i < 4; i++) {
      const y = T + ((B - T) * i) / 4;
      [L - RAIL / 2 - 4, RR + RAIL / 2 + 4].forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y);
        ctx.fill();
      });
    }
    // Head string and spots.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEAD_X, T);
    ctx.lineTo(HEAD_X, B);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    [[HEAD_X, MY], [FOOT_X, MY]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.strokeStyle = U.alpha(C.gold, 0.35 + 0.15 * Math.sin((t || 0) * 3));
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(GOLD_SPOT.x, GOLD_SPOT.y, R + 4, 0, Math.PI * 2);
    ctx.stroke();
    // Pockets.
    POCKETS.forEach((p) => {
      ctx.fillStyle = '#07060F';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = U.alpha(C.line, 0.9);
      ctx.lineWidth = 3;
      ctx.stroke();
    });
  }

  function drawCue(ctx, x, y, ang, pull) {
    const tip = R + 5 + pull;
    const len = 340;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(-tip + 4, 6);
    ctx.lineTo(-tip - len + 4, 12);
    ctx.lineTo(-tip - len + 4, 22);
    ctx.lineTo(-tip + 4, 10);
    ctx.fill();
    ctx.fillStyle = '#EAD8B0';
    ctx.beginPath();
    ctx.moveTo(-tip, -2.6);
    ctx.lineTo(-tip - len, -6);
    ctx.lineTo(-tip - len, 6);
    ctx.lineTo(-tip, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#4A2F7A';
    ctx.beginPath();
    ctx.moveTo(-tip - len * 0.6, -4.7);
    ctx.lineTo(-tip - len, -6);
    ctx.lineTo(-tip - len, 6);
    ctx.lineTo(-tip - len * 0.6, 4.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.violet;
    ctx.fillRect(-tip - len * 0.6 - 6, -4.8, 6, 9.6);
    ctx.fillStyle = '#F7F4EC';
    ctx.fillRect(-tip - 10, -2.7, 9, 5.4);
    ctx.fillStyle = C.p2;
    ctx.fillRect(-tip - 1.5, -2.6, 2.5, 5.2);
    ctx.restore();
  }

  const LEVELS = {
    easy: { aim: 0.035, power: 0.15, cands: 4, mults: [1.25], bank: false },
    normal: { aim: 0.011, power: 0.07, cands: 8, mults: [1.0, 1.4], bank: true },
    hard: { aim: 0.0035, power: 0.03, cands: 12, mults: [0.9, 1.25, 1.7], bank: true }
  };

  Arcade.register({
    id: 'pool',
    title: 'Pool',
    category: 'board',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.mint,
    tagline: 'Top-down 8-ball: clear your solids or stripes, then sink the black.',
    hook: 'Sink the gold ball and you shoot again, no matter what.',
    tags: ['board', 'billiards', 'pool', '8-ball', 'physics', 'sports', 'ai', 'turn-based'],
    howTo: 'Break the rack, then claim solids (1–7) or stripes (9–15) with your first legal pot after the break. ' +
      'Pot one of your balls to keep shooting. Fouls hand your opponent ball in hand (place the cue ball anywhere): ' +
      'potting the cue ball, hitting the wrong ball first, or no ball reaching a cushion after contact. ' +
      'Clear your group, then sink the 8 to win; sinking it early or with a foul loses. ' +
      'The twist: a neutral gold ball sits near the top rail. Hitting it first is never a foul, and potting it ' +
      'gives you another shot no matter what else happened. It comes back once per rack.',
    controls: [
      { keys: ['Drag'], label: 'Pull back from the cue ball, release to shoot' },
      { keys: ['Click'], label: 'Aim at a point' },
      { keys: ['←', '→'], label: 'Aim (hold Shift for fine)' },
      { keys: ['↑', '↓'], label: 'Power' },
      { keys: ['Space', 'Enter'], label: 'Shoot' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Move the cue ball (ball in hand)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2B2452';
      U.roundRect(ctx, 8, 14, w - 16, h - 28, 18);
      ctx.fill();
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.6);
      g.addColorStop(0, '#1C7466');
      g.addColorStop(1, '#125148');
      ctx.fillStyle = g;
      ctx.fillRect(28, 34, w - 56, h - 68);
      [[24, 30], [w / 2, 26], [w - 24, 30], [24, h - 30], [w / 2, h - 26], [w - 24, h - 30]].forEach(([x, y]) => {
        ctx.fillStyle = '#07060F';
        ctx.beginPath();
        ctx.arc(x, y, 13, 0, Math.PI * 2);
        ctx.fill();
      });
      const rk = [[200, 100, 1], [217, 90, 10], [217, 110, 3], [234, 80, 6], [234, 100, 8], [234, 120, 13], [251, 90, 4], [251, 110, 12]];
      rk.forEach(([x, y, id]) => drawBall(ctx, id, x, y, 9.5, 0, 0, 1, t));
      // Gold ball rolling into the top side pocket, trail behind.
      const k = (t * 0.5) % 1;
      const gx = U.lerp(118, w / 2, k);
      const gy = U.lerp(118, 34, k);
      ctx.strokeStyle = U.alpha(C.gold, 0.4);
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(118, 118);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      drawBall(ctx, GOLD, gx, gy, 10 * (1 - Math.max(0, k - 0.85) * 4), k * 12, -0.9, 1, t);
      drawBall(ctx, 0, 90, 150, 10, 0, 0, 1, t);
      drawCue(ctx, 90, 150, Math.atan2(118 - 150, 118 - 90), 8 + Math.sin(t * 3) * 6);
      ctx.fillStyle = C.gold;
      ctx.font = '800 18px Unbounded, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('+1 shot', w - 34, h - 44);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let vsCpu = true;
      let level = 'normal';
      let balls = [];
      let turn = 0;              // 0 = player 1 (coral), 1 = player 2 / computer (cyan)
      let breaker = 0;
      let groups = [null, null]; // 'solids' | 'stripes'
      let phase = 'menu';        // 'menu' | 'aim' | 'cpu' | 'roll' | 'over'
      let aim = 0;
      let power = 0.55;
      let inHand = false;
      let breakShot = true;
      let shot = null;
      let ev = null;
      let acc = 0;
      let drag = null;           // { kind: 'aim'|'place', x0, y0, d0, moved }
      let cpuAnim = null;
      let token = 0;
      let tally = [0, 0];
      let clock = 0;
      let banner = null;
      let flash = null;
      let goldRespots = 1;
      let goldBy = [0, 0];
      let hinted = { first: false, gold: false };
      let lastPlace = null;
      let particles = [];

      const isCpu = (p) => vsCpu && p === 1;
      const nameOf = (p) => (vsCpu ? (p === 0 ? 'You' : 'Computer') : 'Player ' + (p + 1));
      const pColor = (p) => (p === 0 ? C.p1 : C.p2);
      const cueBall = () => balls[0];
      const ballById = (id) => balls.find((b) => b.id === id);
      const groupOf = (id) => (isSolid(id) ? 'solids' : isStripe(id) ? 'stripes' : null);
      const inGroup = (p, id) => groups[p] && groupOf(id) === groups[p];
      const groupLeft = (p, list) => (list || balls).filter((b) => b.on && inGroup(p, b.id)).length;
      const onEight = (p, list) => !!groups[p] && groupLeft(p, list) === 0;

      function showTally() {
        api.setScore(vsCpu ? 'You ' + tally[0] + ' – ' + tally[1] + ' CPU' : 'P1 ' + tally[0] + ' – ' + tally[1] + ' P2');
      }

      /* Is id a legal first contact for p? eight: p was already on the 8 when the shot began. */
      function legalFirst(p, id, eight) {
        if (id < 0) return false;
        if (id === GOLD) return true;
        if (!groups[p]) return id !== 8;
        if (eight) return id === 8;
        return inGroup(p, id);
      }

      /* ---------- Menus ---------- */
      function showStartMenu() {
        token++;
        phase = 'menu';
        api.setStatus('Pool: 8-ball with a gold bonus ball.');
        api.menu({
          title: 'Pool',
          text: 'Play 8-ball against the computer or a friend. Sink the gold ball to shoot again, no matter what.',
          buttons: [
            { label: 'vs computer', primary: true, onClick: showLevelMenu },
            { label: '2 players', onClick: () => { vsCpu = false; startMatch(); } }
          ]
        });
      }
      function showLevelMenu() {
        api.menu({
          title: 'Pick a difficulty',
          text: 'You break first. The computer aims with ghost balls and test shots; Easy misses more.',
          buttons: [
            { label: 'Easy', onClick: () => { level = 'easy'; vsCpu = true; startMatch(); } },
            { label: 'Normal', primary: true, onClick: () => { level = 'normal'; vsCpu = true; startMatch(); } },
            { label: 'Hard', onClick: () => { level = 'hard'; vsCpu = true; startMatch(); } }
          ]
        });
      }

      function startMatch() {
        tally = [0, 0];
        breaker = 0;
        showTally();
        newRack();
      }

      function newRack() {
        token++;
        const solids = U.shuffle([1, 2, 3, 4, 5, 6, 7]);
        const stripes = U.shuffle([9, 10, 11, 12, 13, 14, 15]);
        const pos = [];
        for (let i = 0; i < 5; i++) {
          for (let j = 0; j <= i; j++) pos.push({ x: FOOT_X + i * (R * Math.sqrt(3) + 0.3), y: MY + (j - i / 2) * (2 * R + 0.3) });
        }
        const ids = new Array(15).fill(0);
        ids[4] = 8;
        const a = solids.pop();
        const b = stripes.pop();
        if (Math.random() < 0.5) { ids[10] = a; ids[14] = b; } else { ids[10] = b; ids[14] = a; }
        const rest = U.shuffle(solids.concat(stripes));
        for (let i = 0; i < 15; i++) if (!ids[i]) ids[i] = rest.pop();
        const mk = (id, x, y) => ({ id, x, y, vx: 0, vy: 0, on: true, roll: Math.random() * 6, dir: Math.random() * 6, fall: null });
        balls = [mk(0, HEAD_X, MY)];
        pos.forEach((p, i) => balls.push(mk(ids[i], p.x + U.rand(-0.15, 0.15), p.y + U.rand(-0.15, 0.15))));
        balls.push(mk(GOLD, GOLD_SPOT.x, GOLD_SPOT.y));
        groups = [null, null];
        turn = breaker;
        breaker = 1 - breaker;
        breakShot = true;
        inHand = true;
        goldRespots = 1;
        goldBy = [0, 0];
        aim = 0;
        power = 0.85;
        shot = null;
        banner = null;
        flash = null;
        particles = [];
        drag = null;
        cpuAnim = null;
        beginTurn('');
      }

      /* ---------- Turn flow ---------- */
      function beginTurn(prefix) {
        phase = 'aim';
        drag = null;
        if (isCpu(turn)) {
          phase = 'cpu';
          api.setStatus((prefix ? prefix + ' ' : '') + 'Computer is thinking…');
          planCpu();
          return;
        }
        const who = vsCpu ? 'Your shot' : nameOf(turn) + "'s shot";
        let s = who + (groups[turn] ? ' (' + (onEight(turn) ? 'the 8' : groups[turn]) + ').' : breakShot ? ': break!' : ' (open table).');
        if (inHand) s += breakShot ? ' Drag the cue ball along the left end to place it.' : ' Ball in hand: drag the cue ball anywhere.';
        if (!hinted.first) {
          hinted.first = true;
          s += ' Pull back from anywhere and release to shoot, or use arrows and Space. Sink the gold ball to shoot again!';
        }
        api.setStatus((prefix ? prefix + ' ' : '') + s);
      }

      function shoot(speed) {
        const cue = cueBall();
        if (!cue.on) return;
        cue.vx = Math.cos(aim) * speed;
        cue.vy = Math.sin(aim) * speed;
        shot = { breakShot, onEight: onEight(turn), shooter: turn };
        ev = newEvents();
        acc = 0;
        inHand = false;
        phase = 'roll';
        drag = null;
        api.sfx('shoot');
        api.setStatus(isCpu(turn) ? 'The computer shoots.' : 'Rolling…');
      }

      function respot(b, spot) {
        let x = spot.x;
        const y = spot.y;
        const free = (px) => balls.every((o) => o === b || !o.on || Math.hypot(o.x - px, o.y - y) > 2 * R + 0.5);
        for (let k = 0; k < 120 && !free(x); k++) x = spot.x + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 3;
        b.x = U.clamp(x, L + R + 1, RR - R - 1);
        b.y = y;
        b.vx = 0;
        b.vy = 0;
        b.on = true;
        b.fall = null;
      }

      /* Nearest spot to (x, y) where the cue ball fits without touching another ball. */
      function freeSpot(list, x, y) {
        const ok = (px, py) => list.every((o) => o.id === 0 || !o.on || Math.hypot(o.x - px, o.y - py) > 2 * R + 1);
        for (let k = 0; k < 600; k++) {
          const a = k * 2.4;
          const d = Math.sqrt(k) * 6;
          const px = U.clamp(x + Math.cos(a) * d, L + R + 2, RR - R - 2);
          const py = U.clamp(y + Math.sin(a) * d, T + R + 2, B - R - 2);
          if (ok(px, py)) return { x: px, y: py };
        }
        return { x, y };
      }

      function placeCueFree(x, y) {
        const cue = cueBall();
        const spot = freeSpot(balls, x, y);
        cue.on = true;
        cue.fall = null;
        cue.vx = 0;
        cue.vy = 0;
        cue.x = spot.x;
        cue.y = spot.y;
      }

      function resolveShot() {
        const me = shot.shooter;
        const opp = 1 - me;
        const pots = ev.pots.slice();
        const scratch = pots.indexOf(0) >= 0;
        const obj = pots.filter((id) => id >= 1 && id <= 15 && id !== 8);
        const potted8 = pots.indexOf(8) >= 0;
        const goldDown = pots.indexOf(GOLD) >= 0;
        let foul = '';
        if (scratch) foul = 'scratch';
        else if (ev.first < 0) foul = 'no ball hit';
        else if (!legalFirst(me, ev.first, shot.onEight)) foul = ev.first === 8 ? 'hit the 8 first' : 'wrong ball first';
        else if (!pots.length && !ev.railAfter) foul = 'no cushion after contact';
        // On the break nothing is "wrong" to hit first.
        if (shot.breakShot && foul && !scratch && ev.first >= 0) foul = '';
        breakShot = false;

        if (goldDown) {
          goldBy[me]++;
          const g = ballById(GOLD);
          if (goldRespots > 0) {
            goldRespots--;
            respot(g, GOLD_SPOT);
          }
        }

        // The 8.
        if (potted8) {
          if (shot.breakShot) {
            respot(ballById(8), { x: FOOT_X, y: MY });
            banner = { text: 'The 8 went down on the break and was put back.', t: 0 };
          } else if (shot.onEight && !foul) {
            endRack(me, 'sank the 8');
            return;
          } else {
            endRack(opp, shot.onEight ? 'fouled on the 8' : 'sank the 8 too early');
            return;
          }
        }

        // Groups: the first legal pot after the break claims a group.
        if (!groups[me] && !shot.breakShot && !foul && obj.length) {
          const g = groupOf(obj[0]);
          groups[me] = g;
          groups[opp] = g === 'solids' ? 'stripes' : 'solids';
          banner = { text: (vsCpu ? (me === 0 ? 'You take ' : 'The computer takes ') : nameOf(me) + ' takes ') + g + '.', t: 0 };
          api.sfx('score');
        }

        let next = me;
        let hand = false;
        let msg = '';
        if (goldDown) {
          next = me;
          hand = scratch;
          msg = 'Gold ball! ' + (vsCpu ? (me === 0 ? 'You shoot' : 'The computer shoots') : nameOf(me) + ' shoots') + ' again' + (foul ? ', even after a foul.' : '.');
          flash = { text: 'Gold!', t: 0, color: C.gold };
          api.sfx('power');
          if (!hinted.gold) { hinted.gold = true; msg += ' The gold ball comes back once per rack.'; }
        } else if (foul) {
          next = opp;
          hand = true;
          msg = 'Foul: ' + foul + '. ' + (vsCpu ? (opp === 0 ? 'You have' : 'The computer has') : nameOf(opp) + ' has') + ' ball in hand.';
          flash = { text: 'Foul', t: 0, color: C.p1 };
          api.sfx('lose');
        } else {
          const mine = groups[me] ? obj.filter((id) => inGroup(me, id)).length : obj.length;
          if (mine > 0) {
            next = me;
            api.sfx('score');
          } else {
            next = opp;
            if (obj.length) msg = 'Only the other group went down.';
          }
        }
        if (scratch || !cueBall().on) placeCueFree(HEAD_X, MY);
        turn = next;
        inHand = hand;
        shot = null;
        if (msg) banner = { text: msg, t: 0 };
        beginTurn(msg);
      }

      function endRack(winner, how) {
        phase = 'over';
        const my = ++token;
        tally[winner]++;
        showTally();
        const loser = 1 - winner;
        let title;
        if (vsCpu) title = winner === 0 ? 'You win the rack!' : 'The computer wins';
        else title = nameOf(winner) + ' wins!';
        const subject = how === 'sank the 8' ? winner : loser;
        const who = vsCpu ? (subject === 0 ? 'You' : 'The computer') : nameOf(subject);
        const text = who + ' ' + how + '.';
        api.sfx(vsCpu && winner === 1 ? 'lose' : 'win');
        flash = { text: title, t: 0, color: pColor(winner), stay: true };
        api.setStatus(title + ' ' + text);
        api.after(1500, () => {
          if (my !== token || phase !== 'over') return;
          api.menu({
            title,
            text,
            buttons: [
              { label: 'Play again', primary: true, onClick: newRack },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      /* ---------- Computer ---------- */
      function legalTargets(p, list) {
        const out = [];
        list.forEach((b) => {
          if (!b.on || b.id === 0) return;
          if (b.id === GOLD) { out.push(b); return; }
          if (!groups[p]) { if (b.id !== 8) out.push(b); return; }
          if (onEight(p, list)) { if (b.id === 8) out.push(b); return; }
          if (inGroup(p, b.id)) out.push(b);
        });
        return out;
      }

      function clearPath(list, x1, y1, x2, y2, skipA, skipB, rad) {
        for (const b of list) {
          if (!b.on || b.id === skipA || b.id === skipB) continue;
          if (segDist(b.x, b.y, x1, y1, x2, y2) < rad) return false;
        }
        return true;
      }

      /* Geometric shot list: straight-in shots (and one-cushion banks) using ghost-ball aiming. */
      function candidates(list, p, cue, bank) {
        const out = [];
        legalTargets(p, list).forEach((t) => {
          POCKETS.forEach((pk, pi) => {
            const aims = [{ x: pk.x, y: pk.y, bank: false }];
            if (bank) {
              // Mirror the pocket across the far cushion line: one-rail bank toward it.
              if (pi === 0 || pi === 2) aims.push({ x: pk.x, y: 2 * (B - R) - pk.y, bank: true, rail: B - R, axis: 'y' });
              if (pi === 3 || pi === 5) aims.push({ x: pk.x, y: 2 * (T + R) - pk.y, bank: true, rail: T + R, axis: 'y' });
              if (pi === 1) aims.push({ x: pk.x, y: 2 * (B - R) - pk.y, bank: true, rail: B - R, axis: 'y' });
              if (pi === 4) aims.push({ x: pk.x, y: 2 * (T + R) - pk.y, bank: true, rail: T + R, axis: 'y' });
            }
            aims.forEach((a) => {
              const dx = a.x - t.x;
              const dy = a.y - t.y;
              const dtp = Math.hypot(dx, dy);
              if (dtp < 1) return;
              const ux = dx / dtp;
              const uy = dy / dtp;
              if (!a.bank && (pi === 1 || pi === 4) && Math.abs(uy) < 0.55) return; // side pockets need a steep approach
              const gx = t.x - ux * 2 * R;
              const gy = t.y - uy * 2 * R;
              if (gx < L + R || gx > RR - R || gy < T + R || gy > B - R) return;
              const cx = gx - cue.x;
              const cy = gy - cue.y;
              const dcg = Math.hypot(cx, cy);
              if (dcg < 1) return;
              const cosCut = (cx * ux + cy * uy) / dcg;
              if (cosCut < 0.2) return;
              if (!clearPath(list, cue.x, cue.y, gx, gy, 0, t.id, 2 * R + 1.5)) return;
              let ex = a.x;
              let ey = a.y;
              if (a.bank) {
                // Path to the cushion point, then on to the real pocket.
                const k = (a.rail - t.y) / (a.y - t.y);
                if (k <= 0 || k >= 1) return;
                ex = t.x + (a.x - t.x) * k;
                ey = a.rail;
                if (ex < L + CG + 4 || ex > RR - CG - 4 || Math.abs(ex - MX) < SG + 6) return;
                if (!clearPath(list, ex, ey, pk.x, pk.y, t.id, 0, 2 * R + 0.5)) return;
              }
              if (!clearPath(list, t.x, t.y, ex, ey, t.id, 0, 2 * R + 0.5)) return;
              if (!a.bank && JAWS.some(([jx, jy]) => segDist(jx, jy, t.x, t.y, pk.x, pk.y) < R + 1)) return;
              const cutDeg = Math.acos(U.clamp(cosCut, -1, 1)) * 57.3;
              let score = 1000 - dcg * 0.35 - dtp * 0.6 - cutDeg * cutDeg * 0.12 - (a.bank ? 260 : 0);
              if (t.id === GOLD) score += 120;
              if (t.id === 8) score += 50;
              // Speed: the object ball must reach the pocket; the cue loses speed on the way and in the cut.
              const vObj = Math.sqrt(2 * FRICTION * (dtp + 40)) * 1.25;
              const vCue = vObj / Math.max(0.35, cosCut);
              const speed = Math.sqrt(vCue * vCue + 2 * FRICTION * dcg) * 1.1;
              out.push({ target: t.id, pocket: pi, angle: Math.atan2(cy, cx), speed: U.clamp(speed, 220, MAX_SPEED), score, bank: a.bank });
            });
          });
        });
        out.sort((a, b) => b.score - a.score);
        return out;
      }

      function shotValue(res, p, list) {
        const pots = res.pots;
        const scratch = pots.indexOf(0) >= 0;
        const first = res.first;
        const wasOnEight = onEight(p, list);
        const foul = scratch || first < 0 || !legalFirst(p, first, wasOnEight) || (!pots.length && !res.railAfter);
        let v = 0;
        if (pots.indexOf(8) >= 0) v += wasOnEight && !foul ? 100000 : -100000;
        const gold = pots.indexOf(GOLD) >= 0;
        const obj = pots.filter((id) => id !== 0 && id !== 8 && id !== GOLD);
        let mine = 0;
        let theirs = 0;
        obj.forEach((id) => {
          if (!groups[p] || inGroup(p, id)) mine++;
          else theirs++;
        });
        if (gold) v += 450;
        v += mine * 320 - theirs * 70;
        if (foul && !gold) v -= 500;
        if ((mine > 0 || gold) && (!foul || gold) && res.cue.on) {
          const after = res.balls;
          const c2 = candidates(after, p, res.cue, false);
          v += c2.length ? Math.max(0, c2[0].score - 600) * 0.25 : -40;
        }
        return { v, foul, pots: mine + (gold ? 1 : 0) };
      }

      function* cpuThink(p) {
        const cfg = LEVELS[level];
        const list = balls.map((b) => ({ id: b.id, x: b.x, y: b.y, on: b.on }));
        const cue = list[0];
        let place = null;
        yield 0;
        if (breakShot) {
          if (inHand) place = { x: HEAD_X, y: MY + U.rand(-60, 60) };
          const cx = place ? place.x : cue.x;
          const cy = place ? place.y : cue.y;
          const apex = list.find((b, i) => i === 1);
          return { angle: Math.atan2(apex.y - cy, apex.x - cx) + U.rand(-0.02, 0.02), speed: MAX_SPEED * U.rand(0.88, 1.0), place };
        }
        if (inHand) {
          // Ball in hand: set up the easiest straight-in shot.
          let best = null;
          legalTargets(p, list).forEach((t) => {
            POCKETS.forEach((pk, pi) => {
              const dx = pk.x - t.x;
              const dy = pk.y - t.y;
              const d = Math.hypot(dx, dy);
              const ux = dx / d;
              const uy = dy / d;
              if ((pi === 1 || pi === 4) && Math.abs(uy) < 0.55) return;
              if (!clearPath(list, t.x, t.y, pk.x, pk.y, t.id, 0, 2 * R + 0.5)) return;
              if (JAWS.some(([jx, jy]) => segDist(jx, jy, t.x, t.y, pk.x, pk.y) < R + 1)) return;
              for (const back of [120, 80, 170]) {
                const x = t.x - ux * (2 * R + back);
                const y = t.y - uy * (2 * R + back);
                if (x < L + R + 2 || x > RR - R - 2 || y < T + R + 2 || y > B - R - 2) continue;
                if (list.some((b) => b.on && b.id !== 0 && Math.hypot(b.x - x, b.y - y) < 2 * R + 2)) continue;
                if (!clearPath(list, x, y, t.x - ux * 2 * R, t.y - uy * 2 * R, 0, t.id, 2 * R + 1.5)) continue;
                const s = 1000 - d * 0.6 + (t.id === GOLD ? 150 : 0) + Math.random() * 20;
                if (!best || s > best.s) best = { s, x, y };
                break;
              }
            });
          });
          if (best) place = { x: best.x, y: best.y };
          else place = freeSpot(list, HEAD_X, MY);
          cue.x = place.x;
          cue.y = place.y;
          cue.on = true;
        }
        yield 0;
        const cands = candidates(list, p, cue, cfg.bank).slice(0, cfg.cands);
        let best = null;
        let sims = 0;
        let sliceT = now();
        const tried = [];
        for (const c of cands) {
          for (const m of cfg.mults) {
            const speed = U.clamp(c.speed * m, 200, MAX_SPEED);
            const res = simulate(list, c.angle, speed);
            const val = shotValue(res, p, list);
            const v = val.v + c.score * 0.05;
            tried.push({ v, angle: c.angle, speed });
            if (!best || v > best.v) best = { v, angle: c.angle, speed };
            sims++;
            if (now() - sliceT > 20 || sims % 2 === 0) { yield 0; sliceT = now(); }
          }
        }
        if (level !== 'easy' && tried.length > 1) {
          // Re-check the best few with this level's aim and power wobble; prefer shots that still work.
          tried.sort((a, b) => b.v - a.v);
          best = null;
          for (const c of tried.slice(0, 3)) {
            let total = c.v;
            for (const sgn of [-1, 1]) {
              const res = simulate(list, c.angle + sgn * cfg.aim, c.speed * (1 - sgn * cfg.power));
              total += shotValue(res, p, list).v;
              sims++;
              if (now() - sliceT > 20 || sims % 2 === 0) { yield 0; sliceT = now(); }
            }
            const v = total / 3;
            if (!best || v > best.v) best = { v, angle: c.angle, speed: c.speed };
          }
        }
        if (!best || best.v < 100) {
          // Safety: hit a legal ball cleanly (thin, full, or off a cushion) and reach a cushion.
          const targets = legalTargets(p, list);
          const tries = [];
          targets.forEach((t) => {
            const base = Math.atan2(t.y - cue.y, t.x - cue.x);
            const d = Math.hypot(t.y - cue.y, t.x - cue.x);
            const half = Math.asin(Math.min(1, (1.6 * R) / Math.max(d, 2 * R)));
            [0, -half, half].forEach((o) => tries.push(base + o));
          });
          // Kick shots: sweep the whole circle.
          if (level !== 'easy') for (let k = 0; k < 48; k++) tries.push((k / 48) * Math.PI * 2 + Math.random() * 0.05);
          for (const ang of tries) {
            for (const sp of [560, 950]) {
              const res = simulate(list, ang, sp);
              const val = shotValue(res, p, list);
              if (!best || val.v > best.v) best = { v: val.v, angle: ang, speed: sp };
              sims++;
              if (now() - sliceT > 20 || sims % 2 === 0) { yield 0; sliceT = now(); }
            }
          }
        }
        if (!best) {
          const t = U.pick(legalTargets(p, list).concat([]));
          const ang = t ? Math.atan2(t.y - cue.y, t.x - cue.x) : Math.random() * Math.PI * 2;
          best = { angle: ang, speed: 700 };
        }
        return { angle: best.angle, speed: best.speed, place };
      }

      function planCpu() {
        const my = token;
        const p = turn;
        const gen = cpuThink(p);
        const started = now();
        const step = () => {
          if (my !== token || phase !== 'cpu') return;
          let r;
          try { r = gen.next(); } catch (err) { r = { done: true, value: null }; }
          if (!r.done) { api.after(0, step); return; }
          const plan = r.value || { angle: aim, speed: 700, place: null };
          const cfg = LEVELS[level];
          const angle = plan.angle + U.rand(-1, 1) * cfg.aim * (breakShot ? 0.3 : 1);
          const speed = U.clamp(plan.speed * (1 + U.rand(-1, 1) * cfg.power), 150, MAX_SPEED);
          api.after(Math.max(0, 500 - (now() - started)), () => {
            if (my !== token || phase !== 'cpu') return;
            const cue = cueBall();
            let a0 = aim;
            let da = angle - a0;
            while (da > Math.PI) da -= Math.PI * 2;
            while (da < -Math.PI) da += Math.PI * 2;
            cpuAnim = {
              t: 0, a0, da, speed, from: plan.place ? { x: cue.x, y: cue.y } : null, place: plan.place,
              done: () => { cpuAnim = null; shoot(speed); }
            };
          });
        };
        api.after(30, step);
      }

      /* ---------- Aim prediction ---------- */
      function predict() {
        const cue = cueBall();
        const dx = Math.cos(aim);
        const dy = Math.sin(aim);
        let best = Infinity;
        let hit = null;
        balls.forEach((b) => {
          if (!b.on || b.id === 0) return;
          const ox = b.x - cue.x;
          const oy = b.y - cue.y;
          const proj = ox * dx + oy * dy;
          if (proj <= 0) return;
          const perp2 = ox * ox + oy * oy - proj * proj;
          if (perp2 >= 4 * R * R) return;
          const t = proj - Math.sqrt(4 * R * R - perp2);
          if (t < best) { best = t; hit = b; }
        });
        let tw = Infinity;
        let nx = 0;
        let ny = 0;
        if (dx > 0) { const t = (RR - R - cue.x) / dx; if (t < tw) { tw = t; nx = -1; ny = 0; } }
        if (dx < 0) { const t = (L + R - cue.x) / dx; if (t < tw) { tw = t; nx = 1; ny = 0; } }
        if (dy > 0) { const t = (B - R - cue.y) / dy; if (t < tw) { tw = t; nx = 0; ny = -1; } }
        if (dy < 0) { const t = (T + R - cue.y) / dy; if (t < tw) { tw = t; nx = 0; ny = 1; } }
        if (hit && best < tw) {
          const gx = cue.x + dx * best;
          const gy = cue.y + dy * best;
          const ux = (hit.x - gx) / (2 * R);
          const uy = (hit.y - gy) / (2 * R);
          const cosA = dx * ux + dy * uy;
          // Cue ball leaves along the tangent.
          let tx = dx - ux * cosA;
          let ty = dy - uy * cosA;
          const tl = Math.hypot(tx, ty) || 1;
          tx /= tl;
          ty /= tl;
          return { kind: 'ball', gx, gy, hit, ux, uy, cosA, tx, ty, sinA: Math.sqrt(Math.max(0, 1 - cosA * cosA)) };
        }
        const t = Math.max(0, tw);
        const wx = cue.x + dx * t;
        const wy = cue.y + dy * t;
        const dot = dx * nx + dy * ny;
        return { kind: 'rail', gx: wx, gy: wy, rx: dx - 2 * dot * nx, ry: dy - 2 * dot * ny };
      }

      /* ---------- Input ---------- */
      const canAim = () => phase === 'aim' && !isCpu(turn) && !api.menuOpen && cueBall() && cueBall().on;

      function placeCue(x, y) {
        const cue = cueBall();
        const maxX = breakShot ? HEAD_X : RR - R - 1;
        const px = U.clamp(x, L + R + 1, maxX);
        const py = U.clamp(y, T + R + 1, B - R - 1);
        const ok = balls.every((o) => o.id === 0 || !o.on || Math.hypot(o.x - px, o.y - py) > 2 * R + 0.5);
        if (ok) {
          cue.x = px;
          cue.y = py;
          lastPlace = null;
        } else lastPlace = { x: px, y: py, t: 0.3 };
      }

      api.on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
      api.on(canvas, 'pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        if (!canAim()) return;
        const p = api.toCanvas(e, canvas);
        const cue = cueBall();
        if (inHand && Math.hypot(p.x - cue.x, p.y - cue.y) < R * 2.2) {
          drag = { kind: 'place', x0: p.x, y0: p.y, ox: cue.x - p.x, oy: cue.y - p.y };
        } else {
          drag = { kind: 'aim', x0: p.x, y0: p.y, d0: Math.hypot(p.x - cue.x, p.y - cue.y), moved: false, aim0: aim, pow0: power };
        }
        try { if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
      });
      api.on(window, 'pointermove', (e) => {
        if (!drag || !canAim()) return;
        const p = api.toCanvas(e, canvas);
        const cue = cueBall();
        if (drag.kind === 'place') {
          placeCue(p.x + drag.ox, p.y + drag.oy);
          return;
        }
        if (Math.hypot(p.x - drag.x0, p.y - drag.y0) > 6) drag.moved = true;
        if (drag.moved) {
          const dx = cue.x - p.x;
          const dy = cue.y - p.y;
          if (Math.hypot(dx, dy) > 4) aim = Math.atan2(dy, dx);
          power = U.clamp((Math.hypot(dx, dy) - drag.d0) / MAX_PULL, 0, 1);
        }
      });
      api.on(window, 'pointerup', (e) => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (!canAim()) return;
        const p = api.toCanvas(e, canvas);
        if (d.kind === 'place') { api.sfx('tick'); return; }
        const cue = cueBall();
        if (!d.moved) {
          aim = Math.atan2(p.y - cue.y, p.x - cue.x);
          power = d.pow0;
          api.sfx('tick');
          return;
        }
        if (power >= 0.04) shoot(power * MAX_SPEED);
        else power = d.pow0;
      });
      api.on(window, 'pointercancel', () => { drag = null; });

      api.on(window, 'keydown', (e) => {
        if (!canAim() || drag) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          if (power < 0.04) power = 0.04;
          shoot(power * MAX_SPEED);
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        if (canAim() && !drag) {
          const k = api.keys;
          const fine = k.has('ShiftLeft') || k.has('ShiftRight');
          const rate = fine ? 0.12 : 1.1;
          if (k.has('ArrowLeft')) aim -= rate * dt;
          if (k.has('ArrowRight')) aim += rate * dt;
          if (k.has('ArrowUp')) power = U.clamp(power + 0.6 * dt, 0, 1);
          if (k.has('ArrowDown')) power = U.clamp(power - 0.6 * dt, 0, 1);
          if (inHand) {
            const cue = cueBall();
            const sp = 180 * dt;
            let mx = 0;
            let my = 0;
            if (k.has('KeyA')) mx -= sp;
            if (k.has('KeyD')) mx += sp;
            if (k.has('KeyW')) my -= sp;
            if (k.has('KeyS')) my += sp;
            if (mx || my) placeCue(cue.x + mx, cue.y + my);
          }
        }
        if (cpuAnim) {
          cpuAnim.t += dt;
          const cue = cueBall();
          if (cpuAnim.place && cpuAnim.from) {
            const k = U.clamp(cpuAnim.t / 0.45, 0, 1);
            const e = 1 - Math.pow(1 - k, 3);
            cue.x = U.lerp(cpuAnim.from.x, cpuAnim.place.x, e);
            cue.y = U.lerp(cpuAnim.from.y, cpuAnim.place.y, e);
            cue.on = true;
          }
          const ka = U.clamp((cpuAnim.t - 0.35) / 0.6, 0, 1);
          aim = cpuAnim.a0 + cpuAnim.da * (1 - Math.pow(1 - ka, 3));
          power = U.clamp((cpuAnim.t - 0.9) / 0.4, 0, 1) * (cpuAnim.speed / MAX_SPEED);
          if (cpuAnim.t >= 1.45) cpuAnim.done();
        }
        if (phase === 'roll') {
          acc += dt;
          let steps = 0;
          while (acc >= H_LIVE && steps < 40) {
            physStep(balls, H_LIVE, ev, true);
            acc -= H_LIVE;
            steps++;
          }
          if (ev.clack > 0) {
            if (ev.clack > 60) api.sfx(ev.clack > 500 ? 'hit' : 'tick');
            ev.clack = 0;
          }
          if (ev.thud > 0) {
            if (ev.thud > 250) api.sfx('blip');
            ev.thud = 0;
          }
          balls.forEach((b) => {
            if (b.fall && b.fall.t === 0) {
              b.fall.t = 0.0001;
              api.sfx(b.id === GOLD ? 'power' : b.id === 0 ? 'lose' : 'score');
              const p = POCKETS[b.fall.p];
              burst(p.x, p.y, ballColor(b.id), b.id === GOLD ? 22 : 10);
            }
          });
          const falling = balls.some((b) => b.fall && b.fall.t < 0.3);
          if (stopped(balls) && !falling) {
            phase = 'settle';
            resolveShot();
          }
        }
        balls.forEach((b) => { if (b.fall) b.fall.t += dt; });
        if (lastPlace) { lastPlace.t -= dt; if (lastPlace.t <= 0) lastPlace = null; }
        if (banner) {
          banner.t += dt;
          if (banner.t > 3.2) banner = null;
        }
        if (flash) {
          flash.t += dt;
          if (!flash.stay && flash.t > 1.1) flash = null;
        }
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
      }

      function burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 40 + Math.random() * 140;
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, color });
        }
      }

      /* ---------- Draw ---------- */
      function drawPlayerBox(p, x, y, w) {
        const active = (phase === 'aim' || phase === 'cpu' || phase === 'roll') && turn === p;
        ctx.fillStyle = active ? U.alpha(pColor(p), 0.16) : C.panel;
        U.roundRect(ctx, x, y, w, 70, 12);
        ctx.fill();
        ctx.strokeStyle = active ? pColor(p) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = pColor(p);
        ctx.beginPath();
        ctx.arc(x + 18, y + 22, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = FONT;
        ctx.fillStyle = C.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(nameOf(p), x + 32, y + 27);
        ctx.font = FONT_SM;
        ctx.fillStyle = active ? pColor(p) : C.muted;
        const g = groups[p];
        const label = g ? (onEight(p) ? 'on the 8' : g) : 'open table';
        ctx.textAlign = 'right';
        ctx.fillText(label + (goldBy[p] ? '  ★' + goldBy[p] : ''), x + w - 12, y + 26);
        ctx.textAlign = 'left';
        if (g) {
          const ids = g === 'solids' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
          ids.forEach((id, i) => {
            const b = ballById(id);
            const down = b && !b.on && !(b.fall && b.fall.t < 0.3);
            drawBall(ctx, id, x + 22 + i * 26, y + 50, 9, 0, 0, down ? 1 : 0.25, clock);
          });
          if (onEight(p)) drawBall(ctx, 8, x + 22 + 7 * 26 + 8, y + 50, 9, 0, 0, 1, clock);
        } else {
          ctx.fillStyle = U.alpha(C.muted, 0.8);
          ctx.fillText(breakShot ? 'Break to start the rack.' : 'Pot any ball to claim a group.', x + 16, y + 54);
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawTable(ctx, clock);
        if (!balls.length) { drawHud(); return; }

        // Falling balls shrink into their pocket.
        balls.forEach((b) => {
          if (!b.fall || b.fall.t > 0.3) return;
          const p = POCKETS[b.fall.p];
          const k = U.clamp(b.fall.t / 0.3, 0, 1);
          drawBall(ctx, b.id, U.lerp(b.fall.x, p.x, k), U.lerp(b.fall.y, p.y, k), R * (1 - k * 0.6), b.roll, b.dir, 1 - k * 0.7, clock);
        });

        const cue = cueBall();
        const aiming = (phase === 'aim' && !isCpu(turn)) || (phase === 'cpu' && cpuAnim);
        if (aiming && cue.on && !(drag && drag.kind === 'place')) {
          const pr = predict();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cue.x, cue.y);
          ctx.lineTo(pr.gx, pr.gy);
          ctx.stroke();
          ctx.setLineDash([]);
          if (pr.kind === 'ball') {
            const legal = legalFirst(turn, pr.hit.id, onEight(turn));
            ctx.strokeStyle = legal ? 'rgba(255,255,255,0.8)' : U.alpha(C.p1, 0.9);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(pr.gx, pr.gy, R, 0, Math.PI * 2);
            ctx.stroke();
            const ol = 40 + 150 * pr.cosA;
            ctx.strokeStyle = legal ? U.alpha(pr.hit.id === GOLD ? C.gold : C.mint, 0.9) : U.alpha(C.p1, 0.8);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(pr.hit.x, pr.hit.y);
            ctx.lineTo(pr.hit.x + pr.ux * ol, pr.hit.y + pr.uy * ol);
            ctx.stroke();
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pr.gx, pr.gy);
            ctx.lineTo(pr.gx + pr.tx * 90 * pr.sinA, pr.gy + pr.ty * 90 * pr.sinA);
            ctx.stroke();
            if (!legal) {
              ctx.fillStyle = C.p1;
              ctx.font = FONT_SM;
              ctx.textAlign = 'center';
              ctx.fillText('foul', pr.gx, pr.gy - R - 8);
              ctx.textAlign = 'left';
            }
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pr.gx, pr.gy);
            ctx.lineTo(pr.gx + pr.rx * 60, pr.gy + pr.ry * 60);
            ctx.stroke();
          }
        }

        balls.forEach((b) => {
          if (!b.on) return;
          drawBall(ctx, b.id, b.x, b.y, R, b.roll, b.dir, 1, clock);
        });

        if (inHand && cue.on && (phase === 'aim' || phase === 'cpu')) {
          ctx.strokeStyle = U.alpha(C.mint, 0.6 + 0.3 * Math.sin(clock * 5));
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(cue.x, cue.y, R + 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          if (breakShot && phase === 'aim') {
            ctx.fillStyle = U.alpha(C.mint, 0.06);
            ctx.fillRect(L, T, HEAD_X - L, B - T);
          }
        }
        if (lastPlace) {
          ctx.strokeStyle = U.alpha(C.p1, lastPlace.t * 2.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(lastPlace.x, lastPlace.y, R, 0, Math.PI * 2);
          ctx.stroke();
        }

        if (aiming && cue.on && !(drag && drag.kind === 'place')) {
          const pull = drag && drag.kind === 'aim' && drag.moved ? power * 70 : cpuAnim ? power * 70 : 4 + Math.sin(clock * 3) * 2;
          drawCue(ctx, cue.x, cue.y, aim, pull);
        }

        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life * 2.5, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
        }
        ctx.globalAlpha = 1;

        if (flash) {
          const k = flash.stay ? Math.min(1, flash.t * 4) : Math.max(0, 1 - Math.max(0, flash.t - 0.6) * 2);
          ctx.globalAlpha = k;
          ctx.fillStyle = U.alpha(C.ink, 0.65);
          U.roundRect(ctx, MX - 230, MY - 44, 460, 88, 18);
          ctx.fill();
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = flash.color;
          ctx.fillText(flash.text, MX, MY + 2, 430);
          ctx.globalAlpha = 1;
        }
        drawHud();
      }

      function drawHud() {
        drawPlayerBox(0, 30, 10, 300);
        drawPlayerBox(1, W - 330, 10, 300);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = FONT_SM;
        ctx.fillStyle = C.gold;
        const goldOn = balls.length && ballById(GOLD) && ballById(GOLD).on;
        ctx.fillText(goldOn ? (goldRespots ? 'gold ball: comes back once' : 'gold ball: last chance') : balls.length ? 'gold ball: gone' : '', MX, 30);
        if (banner) {
          ctx.font = FONT_SM;
          ctx.fillStyle = U.alpha(C.text, Math.min(1, 3.2 - banner.t));
          const words = banner.text.split(' ');
          let line = '';
          let yy = 52;
          words.forEach((w) => {
            const test = line ? line + ' ' + w : w;
            if (ctx.measureText(test).width > 270 && line) { ctx.fillText(line, MX, yy); line = w; yy += 16; } else line = test;
          });
          if (line) ctx.fillText(line, MX, yy);
        } else if (inHand && (phase === 'aim' || phase === 'cpu')) {
          ctx.fillStyle = C.mint;
          ctx.font = FONT;
          ctx.fillText('Ball in hand', MX, 58);
        }
        // Power meter.
        const show = (phase === 'aim' && !isCpu(turn)) || cpuAnim;
        const bx = MX - 160;
        const by = H - 30;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, bx, by, 320, 14, 7);
        ctx.fill();
        if (show) {
          ctx.fillStyle = power > 0.75 ? C.p1 : power > 0.45 ? C.gold : C.mint;
          U.roundRect(ctx, bx, by, Math.max(14, 320 * power), 14, 7);
          ctx.fill();
        }
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        ctx.fillText('power', bx - 10, by + 11);
        ctx.textAlign = 'left';
        ctx.fillText(show ? Math.round(power * 100) + '%' : '', bx + 330, by + 11);
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
