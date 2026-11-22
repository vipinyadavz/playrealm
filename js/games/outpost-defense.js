/* Outpost Defense — build turrets by day, hold the walls at night with only a flashlight cone. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TINY = '600 10px "JetBrains Mono", monospace';

  /* Outpost geometry. */
  const X0 = 340;
  const X1 = 620;
  const Y0 = 180;
  const Y1 = 420;
  const WT = 16;
  const GATE_A = 440;
  const GATE_B = 520;
  const CORE_X = 480;
  const CORE_Y = 300;
  const CORE_R = 26;
  const CORE_HP = 1200;
  const SEG_HP = 280;
  const GATE_HP = 360;
  const SLOTS = [
    [X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1],
    [410, Y0], [550, Y0], [X0, CORE_Y], [X1, CORE_Y], [400, Y1], [560, Y1]
  ];

  /* Rules. */
  const DAY_TIME = 35;
  const DUSK_TIME = 3;
  const DAWN_TIME = 2.6;
  const S_SPEED = 150;
  const S_R = 11;
  const S_HP = 100;
  const GUN = { rate: 0.13, dmg: 13, speed: 760, life: 0.62, mag: 30, reload: 1.3, spread: 0.035 };
  const RESPAWN = 4;
  const CONE_RANGE = 330;
  const CONE_HALF = 0.42;
  const MAX_BULLETS = 180;
  const MAX_SPIT = 50;
  const MAX_PARTS = 360;
  const MAX_CREATURES = 80;
  const TOWERS = {
    gun: { name: 'Gun turret', short: 'Gun', cost: 60, range: [150, 175, 200], rate: [0.42, 0.32, 0.24], dmg: [11, 15, 21], color: C.gold },
    slow: { name: 'Slow tower', short: 'Slow', cost: 50, range: [115, 132, 150], rate: [1.2, 1.05, 0.9], dmg: [4, 7, 10], slow: [0.45, 0.55, 0.65], color: C.p2 },
    flame: { name: 'Flame post', short: 'Flame', cost: 80, range: [86, 98, 112], dps: [34, 50, 72], color: '#FF8A3D' }
  };
  const TOWER_KEYS = ['gun', 'slow', 'flame'];
  const KINDS = {
    crawler: { name: 'Mud crawler', hp: 26, speed: 88, r: 8, dmg: 6, rate: 0.65, reward: 4, color: '#7A5A3A', eye: '#FFC53D', aggro: 110 },
    walker: { name: 'Stilt walker', hp: 55, speed: 42, r: 11, dmg: 10, rate: 2.2, reward: 8, color: '#5E8C5A', eye: '#9CFF6B', aggro: 240, range: 170 },
    brute: { name: 'Brute', hp: 240, speed: 30, r: 18, dmg: 40, rate: 1.3, reward: 18, color: '#4F4370', eye: '#FF5D73', aggro: 70 }
  };
  const DIFF = {
    easy: { hp: 0.75, count: 0.8, cash: 240 },
    normal: { hp: 1, count: 1, cash: 180 },
    hard: { hp: 1.2, count: 1.15, cash: 160 }
  };

  function upgradeCost(key, level) {
    return Math.round(TOWERS[key].cost * (0.8 + 0.4 * level));
  }

  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function makeSegments() {
    const segs = [];
    for (let i = 0; i < 4; i++) {
      const a = X0 + i * 70 - (i === 0 ? 8 : 0);
      const b = X0 + (i + 1) * 70 + (i === 3 ? 8 : 0);
      segs.push({ x: a, y: Y0 - WT / 2, w: b - a, h: WT, nx: 0, ny: -1 });
    }
    segs.push({ x: X0 - 8, y: Y1 - WT / 2, w: GATE_A - X0 + 8, h: WT, nx: 0, ny: 1 });
    segs.push({ x: GATE_A, y: Y1 - WT / 2, w: GATE_B - GATE_A, h: WT, nx: 0, ny: 1, gate: true });
    segs.push({ x: GATE_B, y: Y1 - WT / 2, w: X1 + 8 - GATE_B, h: WT, nx: 0, ny: 1 });
    for (let i = 0; i < 3; i++) {
      segs.push({ x: X0 - WT / 2, y: Y0 + i * 80, w: WT, h: 80, nx: -1, ny: 0 });
      segs.push({ x: X1 - WT / 2, y: Y0 + i * 80, w: WT, h: 80, nx: 1, ny: 0 });
    }
    for (const s of segs) {
      s.max = s.gate ? GATE_HP : SEG_HP;
      s.hp = s.max;
      s.flash = 0;
      s.cx = s.x + s.w / 2;
      s.cy = s.y + s.h / 2;
    }
    return segs;
  }

  /* ---------- Drawing helpers (shared with the card art) ---------- */
  function drawCreature(ctx, kind, x, y, ang, t, hitFlash) {
    const k = KINDS[kind];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    if (kind === 'crawler') {
      ctx.strokeStyle = '#4E3A26';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const wob = Math.sin(t * 22 + i * 2) * 3;
        const lx = -5 + i * 5;
        ctx.moveTo(lx, -5); ctx.lineTo(lx + wob, -12);
        ctx.moveTo(lx, 5); ctx.lineTo(lx - wob, 12);
      }
      ctx.stroke();
      ctx.fillStyle = hitFlash > 0 ? '#FFFFFF' : k.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 11, 8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.ellipse(-2, -3, 6, 3, 0, 0, TAU);
      ctx.fill();
    } else if (kind === 'walker') {
      ctx.strokeStyle = '#3E5E3C';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + Math.sin(t * 5 + i) * 0.3 + 0.5;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * 24, Math.sin(a) * 24);
      }
      ctx.stroke();
      ctx.fillStyle = '#2C4A2A';
      for (let i = 0; i < 3; i++) {
        const a = i * TAU / 3 + Math.sin(t * 5 + i) * 0.3 + 0.5;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 24, Math.sin(a) * 24, 3, 0, TAU);
        ctx.fill();
      }
      ctx.fillStyle = hitFlash > 0 ? '#FFFFFF' : k.color;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9CFF6B';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(-3, 0, 4, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = '#2E2648';
      ctx.beginPath();
      ctx.arc(4, -15, 7, 0, TAU);
      ctx.arc(4, 15, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = hitFlash > 0 ? '#FFFFFF' : k.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 20, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#6A5C94';
      ctx.fillRect(-12, -9, 8, 18);
      ctx.fillRect(-2, -12, 7, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.ellipse(-5, -6, 8, 5, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawEyes(ctx, kind, x, y, ang, t, seed) {
    const k = KINDS[kind];
    const off = kind === 'brute' ? 12 : kind === 'walker' ? 6 : 7;
    const gap = kind === 'brute' ? 6 : 3.5;
    const size = kind === 'brute' ? 3 : 2;
    const blink = Math.sin(t * 1.3 + seed * 7) > 0.97;
    if (blink) return;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const ex = x + ca * off;
    const ey = y + sa * off;
    ctx.fillStyle = U.alpha(k.eye, 0.25);
    ctx.beginPath();
    ctx.arc(ex, ey, size * 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = k.eye;
    ctx.beginPath();
    ctx.arc(ex - sa * gap, ey + ca * gap, size, 0, TAU);
    ctx.arc(ex + sa * gap, ey - ca * gap, size, 0, TAU);
    ctx.fill();
  }

  function drawSoldier(ctx, x, y, ang, flash) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, S_R, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#2A2546';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + ca * 4 - sa * 4, y + sa * 4 + ca * 4);
    ctx.lineTo(x + ca * 22 - sa * 4, y + sa * 22 + ca * 4);
    ctx.stroke();
    ctx.lineCap = 'butt';
    if (flash > 0) {
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(x + ca * 26 - sa * 4, y + sa * 26 + ca * 4, 5, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = C.p1;
    ctx.beginPath();
    ctx.arc(x, y, S_R, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#B8404F';
    ctx.beginPath();
    ctx.arc(x - ca * 2, y - sa * 2, 6.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#FFF4C8';
    ctx.beginPath();
    ctx.arc(x + ca * 7 - sa * 6, y + sa * 7 + ca * 6, 2.5, 0, TAU);
    ctx.fill();
  }

  function drawTower(ctx, key, level, x, y, ang, t) {
    const tw = TOWERS[key];
    ctx.fillStyle = '#2A2546';
    ctx.beginPath();
    ctx.arc(x, y, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = tw.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    for (let i = 0; i < level; i++) {
      ctx.fillStyle = tw.color;
      ctx.fillRect(x - 7 + i * 6, y + 9, 4, 3);
    }
    if (key === 'gun') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = '#5E5794';
      ctx.fillRect(-7, -7, 14, 14);
      ctx.fillStyle = tw.color;
      ctx.fillRect(4, -2.5, 14 + level * 2, 5);
      ctx.restore();
    } else if (key === 'slow') {
      ctx.fillStyle = U.alpha(C.p2, 0.35 + Math.sin(t * 4) * 0.15);
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.p2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 3 + t * 0.6;
        ctx.moveTo(x + Math.cos(a) * 8, y + Math.sin(a) * 8);
        ctx.lineTo(x - Math.cos(a) * 8, y - Math.sin(a) * 8);
      }
      ctx.stroke();
    } else {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang);
      ctx.fillStyle = '#5E5794';
      ctx.beginPath();
      ctx.moveTo(-6, -8);
      ctx.lineTo(12, -4);
      ctx.lineTo(12, 4);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = tw.color;
      ctx.fillRect(10, -3, 5, 6);
      ctx.restore();
    }
  }

  Arcade.register({
    id: 'outpost-defense',
    title: 'Outpost Defense',
    category: 'combat',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.gold,
    tagline: 'Fortify a lonely outpost by day and survive creature waves by night.',
    hook: 'Build turrets by day, then hold the walls at night with only a flashlight cone.',
    tags: ['defense', 'tower defense', 'survival', 'shooter', 'top-down', 'base building', 'night', 'flashlight', 'waves'],
    howTo: 'Protect the glowing core in the middle of your outpost. By day, click the slots on the walls to build a gun ' +
      'turret, slow tower or flame post, click a built one to upgrade it, and press R to repair walls. Press Enter to ' +
      'start the night early. At night the creatures come from every edge: fast mud crawlers, spitting stilt walkers ' +
      'and brutes that smash walls. The twist: it is pitch dark. Your flashlight cone and the small turret lamps are ' +
      'the only light, and anything outside it is just a pair of glowing eyes. Score 1000 per night survived plus 10 per kill.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
      { keys: ['Mouse'], label: 'Aim the flashlight and rifle' },
      { keys: ['Click', 'Space'], label: 'Shoot' },
      { keys: ['Click slot'], label: 'Build or upgrade (day)' },
      { keys: ['1', '2', '3'], label: 'Pick a tower in the build menu' },
      { keys: ['R'], label: 'Repair walls (day)' },
      { keys: ['Enter'], label: 'Start the night early' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = '#1C2333';
      ctx.fillRect(0, 0, w, h);
      // Outpost corner.
      ctx.fillStyle = '#211C3D';
      ctx.fillRect(0, 0, 120, 120);
      ctx.fillStyle = '#5D5490';
      ctx.fillRect(112, 0, 14, 128);
      ctx.fillRect(0, 114, 126, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(112, 0, 14, 3);
      ctx.fillRect(0, 114, 126, 3);
      drawTower(ctx, 'gun', 2, 119, 121, 0.7 + Math.sin(t) * 0.2, t);
      ctx.fillStyle = C.mint;
      ctx.globalAlpha = 0.6 + Math.sin(t * 3) * 0.2;
      ctx.beginPath();
      ctx.arc(46, 48, 16, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
      // A creature caught in the cone.
      const sx = 92;
      const sy = 84;
      const aim = 0.45 + Math.sin(t * 0.8) * 0.12;
      drawCreature(ctx, 'brute', 236, 160, Math.PI + 0.5, t, 0);
      drawCreature(ctx, 'crawler', 205, 118, Math.PI + 0.4, t, 0);
      // Darkness with the cone cut out.
      ctx.save();
      ctx.fillStyle = 'rgba(4,3,14,0.9)';
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, 230, aim + CONE_HALF, aim - CONE_HALF, true);
      ctx.closePath();
      ctx.fill('evenodd');
      ctx.restore();
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 230);
      g.addColorStop(0, 'rgba(255,240,190,0.22)');
      g.addColorStop(1, 'rgba(255,240,190,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy, 230, aim - CONE_HALF, aim + CONE_HALF);
      ctx.closePath();
      ctx.fill();
      drawSoldier(ctx, sx, sy, aim, Math.sin(t * 14) > 0.6 ? 1 : 0);
      drawEyes(ctx, 'crawler', 270, 40, Math.PI, t, 1);
      drawEyes(ctx, 'walker', 300, 92, Math.PI, t, 2);
      drawEyes(ctx, 'crawler', 40, 178, -1.2, t, 3);
      drawEyes(ctx, 'brute', 186, 26, 2.4, t, 4);
      ctx.fillStyle = '#E9E4C8';
      ctx.beginPath();
      ctx.arc(w - 26, 24, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(4,3,14,0.9)';
      ctx.beginPath();
      ctx.arc(w - 21, 20, 9, 0, TAU);
      ctx.fill();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const keys = api.keys;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      /* Light mask: darkness with lights punched out of it. */
      const mask = document.createElement('canvas');
      mask.width = Math.round(W * dpr);
      mask.height = Math.round(H * dpr);
      const mctx = mask.getContext('2d');
      mctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const blob = document.createElement('canvas');
      blob.width = 128;
      blob.height = 128;
      const bctx = blob.getContext('2d');
      const bg = bctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      bg.addColorStop(0, 'rgba(0,0,0,1)');
      bg.addColorStop(0.5, 'rgba(0,0,0,0.85)');
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      bctx.fillStyle = bg;
      bctx.fillRect(0, 0, 128, 128);

      /* Static ground decoration. */
      const tufts = [];
      for (let i = 0; i < 110; i++) {
        const x = Math.random() * W;
        const y = Math.random() * H;
        if (x > X0 - 20 && x < X1 + 20 && y > Y0 - 20 && y < Y1 + 20) continue;
        tufts.push({ x, y, s: 2 + Math.random() * 3, c: Math.random() < 0.5 ? '#25304A' : '#2B2346' });
      }

      let state = 'menu';
      let diffName = 'normal';
      let D = DIFF.normal;
      let clock = 0;
      let night = 0;
      let phaseT = 0;
      let cash = 0;
      let kills = 0;
      let nightsSurvived = 0;
      let coreHp = CORE_HP;
      let coreFlash = 0;
      let segs = makeSegments();
      let towers = [];
      let creatures = [];
      let spawnQueue = [];
      let spawnT = 0;
      let spawnGap = 1;
      let nightTotal = 1;
      let dark = 0;
      let shake = 0;
      let popup = -1;
      let popupFlash = 0;
      let mouseX = W / 2;
      let mouseY = H / 2;
      let mouseDown = false;
      let hintNight = false;
      let hintBreach = false;
      let hintEyes = false;
      let banner = null;
      const floats = [];
      const sol = { x: CORE_X, y: CORE_Y + 60, ang: -Math.PI / 2, hp: S_HP, alive: true, respawnT: 0, cool: 0, mag: GUN.mag, reloadT: 0, flash: 0, hurtT: 0 };

      const bullets = [];
      for (let i = 0; i < MAX_BULLETS; i++) bullets.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, dmg: 0, tower: false });
      const spits = [];
      for (let i = 0; i < MAX_SPIT; i++) spits.push({ on: false, x0: 0, y0: 0, x1: 0, y1: 0, t: 0, dur: 1, seg: -1, core: false });
      const parts = [];
      for (let i = 0; i < MAX_PARTS; i++) parts.push({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 2, color: '#fff', glow: false });

      function part(x, y, vx, vy, life, size, color, glow) {
        for (let i = 0; i < MAX_PARTS; i++) {
          const p = parts[i];
          if (p.on) continue;
          p.on = true;
          p.x = x; p.y = y; p.vx = vx; p.vy = vy;
          p.life = p.max = life;
          p.size = size;
          p.color = color;
          p.glow = glow;
          return;
        }
      }
      function burst(x, y, n, sp, color, life, size, glow) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = sp * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), size, color, glow);
        }
      }
      function floatText(x, y, text, color) {
        if (floats.length > 24) floats.shift();
        floats.push({ x, y, text, color, t: 1 });
      }

      /* ---------- Geometry ---------- */
      function inside(x, y) {
        return x > X0 && x < X1 && y > Y0 && y < Y1;
      }

      /* Push a circle out of intact wall segments. */
      function resolveWalls(e, r, passGate) {
        let touched = -1;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (s.hp <= 0 || (passGate && s.gate)) continue;
          const qx = e.x < s.x ? s.x : e.x > s.x + s.w ? s.x + s.w : e.x;
          const qy = e.y < s.y ? s.y : e.y > s.y + s.h ? s.y + s.h : e.y;
          const dx = e.x - qx;
          const dy = e.y - qy;
          const d2 = dx * dx + dy * dy;
          if (d2 >= r * r) continue;
          touched = i;
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            e.x += dx / d * (r - d);
            e.y += dy / d * (r - d);
          } else {
            // Centre inside the wall: push out along the wall's outward normal or by the nearest edge.
            const l = e.x - s.x;
            const rr = s.x + s.w - e.x;
            const t = e.y - s.y;
            const b = s.y + s.h - e.y;
            const m = Math.min(l, rr, t, b);
            if (m === l) e.x = s.x - r;
            else if (m === rr) e.x = s.x + s.w + r;
            else if (m === t) e.y = s.y - r;
            else e.y = s.y + s.h + r;
          }
        }
        return touched;
      }

      /* Closest point on segment s to (x, y), written to the shared SP scratch. */
      const SP = { x: 0, y: 0 };
      function segPoint(s, x, y) {
        SP.x = x < s.x ? s.x : x > s.x + s.w ? s.x + s.w : x;
        SP.y = y < s.y ? s.y : y > s.y + s.h ? s.y + s.h : y;
        return SP;
      }

      function nearestSeg(x, y, intactOnly) {
        let best = -1;
        let bestD = 1e9;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (intactOnly && s.hp <= 0) continue;
          const q = segPoint(s, x, y);
          const d = Math.hypot(q.x - x, q.y - y);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      }

      function bestGap(x, y) {
        let best = -1;
        let bestD = 1e9;
        for (let i = 0; i < segs.length; i++) {
          const s = segs[i];
          if (s.hp > 0) continue;
          const d = Math.hypot(s.cx - x, s.cy - y);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      }

      function lit(x, y) {
        if (state === 'day' || state === 'menu') return true;
        if (dark < 0.4) return true;
        if (sol.alive) {
          const dx = x - sol.x;
          const dy = y - sol.y;
          const d = Math.hypot(dx, dy);
          if (d < 52) return true;
          if (d < CONE_RANGE * 0.92 && Math.abs(angDiff(Math.atan2(dy, dx), sol.ang)) < CONE_HALF + 0.05) return true;
          if (sol.flash > 0 && d < 90) return true;
        }
        if (Math.hypot(x - CORE_X, y - CORE_Y) < 70) return true;
        for (const t of towers) {
          if (Math.abs(x - t.x) < 52 && Math.abs(y - t.y) < 52 && Math.hypot(x - t.x, y - t.y) < 52) return true;
        }
        return false;
      }

      /* ---------- Damage ---------- */
      function hurtSeg(i, dmg) {
        const s = segs[i];
        if (s.hp <= 0) return;
        s.hp -= dmg;
        s.flash = 0.12;
        if (s.hp <= 0) {
          s.hp = 0;
          burst(s.cx, s.cy, 18, 160, '#5D5490', 0.7, 4, false);
          burst(s.cx, s.cy, 8, 60, 'rgba(169,163,214,0.5)', 1, 8, false);
          api.sfx('boom');
          shake = Math.max(shake, 0.25);
          if (!hintBreach) {
            hintBreach = true;
            api.setStatus((s.gate ? 'The gate' : 'A wall') + ' broke! Creatures will pour through. Repair with R during the day.');
          }
        }
      }

      function hurtCore(dmg) {
        if (state !== 'night' && state !== 'dusk') return;
        coreHp -= dmg;
        coreFlash = 0.15;
        if (coreHp <= 0) {
          coreHp = 0;
          gameOver();
        }
      }

      function hurtSoldier(dmg) {
        if (!sol.alive) return;
        sol.hp -= dmg;
        sol.hurtT = 0.3;
        shake = Math.max(shake, 0.12);
        api.sfx('hit');
        if (sol.hp <= 0) {
          sol.hp = 0;
          sol.alive = false;
          sol.respawnT = RESPAWN;
          burst(sol.x, sol.y, 18, 180, C.p1, 0.7, 3, false);
          api.sfx('lose');
          api.setStatus('You went down. Back at the core in ' + RESPAWN + ' seconds; the turrets hold the line.');
        }
      }

      function hurtCreature(c, dmg) {
        if (c.dead) return;
        c.hp -= dmg;
        c.hit = 0.08;
        if (c.hp <= 0) {
          c.dead = true;
          kills++;
          const k = KINDS[c.kind];
          const reward = k.reward;
          cash += reward;
          floatText(c.x, c.y - 10, '+$' + reward, C.gold);
          burst(c.x, c.y, c.kind === 'brute' ? 22 : 12, 150, k.color, 0.6, 3, false);
          burst(c.x, c.y, 4, 60, k.eye, 0.4, 2, true);
          api.sfx(c.kind === 'brute' ? 'boom' : 'hit');
          updateScore();
        }
      }

      function updateScore() {
        api.setScore(nightsSurvived * 1000 + kills * 10);
      }

      /* ---------- Spawning ---------- */
      function planNight(n) {
        const q = [];
        const crawl = Math.round((5 + 3 * n) * D.count);
        const walk = n >= 2 ? Math.round((1 + n) * D.count) : 0;
        const brute = n >= 3 ? Math.max(1, Math.round((n - 2) * D.count)) : n === 2 ? 1 : 0;
        for (let i = 0; i < crawl; i++) q.push('crawler');
        for (let i = 0; i < walk; i++) q.push('walker');
        for (let i = 0; i < brute; i++) q.push('brute');
        U.shuffle(q);
        // Brutes never lead: keep the first few spawns light.
        for (let i = 0; i < Math.min(3, q.length); i++) {
          if (q[i] === 'brute') {
            const j = q.length - 1 - i;
            const t = q[i]; q[i] = q[j]; q[j] = t;
          }
        }
        spawnQueue = q;
        nightTotal = q.length;
        spawnGap = (18 + n) / Math.max(1, q.length);
        spawnT = 0.5;
      }

      function spawnCreature(kind) {
        if (creatures.length >= MAX_CREATURES) return false;
        const edge = (Math.random() * 4) | 0;
        let x;
        let y;
        if (edge === 0) { x = Math.random() * W; y = -24; } else if (edge === 1) { x = W + 24; y = Math.random() * H; } else if (edge === 2) { x = Math.random() * W; y = H + 24; } else { x = -24; y = Math.random() * H; }
        const k = KINDS[kind];
        const n1 = night - 1;
        const mul = D.hp * (1 + 0.15 * n1 + 0.012 * n1 * n1);
        creatures.push({
          kind, x, y, ang: Math.atan2(CORE_Y - y, CORE_X - x), hp: k.hp * mul, max: k.hp * mul, spd: Math.min(1.4, 1 + 0.025 * n1),
          cool: Math.random() * k.rate, slowT: 0, slowK: 0, hit: 0, dead: false, seed: Math.random(),
          think: 0, gx: CORE_X, gy: CORE_Y, mode: 'core', seg: -1, wp: 0, gap: -1, stuck: 0, lx: x, ly: y, windup: 0
        });
        return true;
      }

      /* ---------- Creatures ---------- */
      function creatureThink(c) {
        const k = KINDS[c.kind];
        c.think = 0.35 + Math.random() * 0.2;
        const inCamp = inside(c.x, c.y);
        if (sol.alive && Math.hypot(sol.x - c.x, sol.y - c.y) < k.aggro && (inCamp === inside(sol.x, sol.y) || c.kind === 'walker')) {
          c.mode = 'soldier';
          return;
        }
        if (inCamp) { c.mode = 'core'; c.gx = CORE_X; c.gy = CORE_Y; return; }
        if (c.kind === 'walker' && Math.hypot(CORE_X - c.x, CORE_Y - c.y) < k.range + 30) { c.mode = 'core'; c.gx = CORE_X; c.gy = CORE_Y; return; }
        if (c.kind !== 'brute') {
          const g = bestGap(c.x, c.y);
          if (g >= 0) {
            if (c.gap !== g) { c.gap = g; c.wp = 0; }
            c.mode = 'gap';
            return;
          }
        }
        c.gap = -1;
        const si = nearestSeg(c.x, c.y, true);
        if (si < 0) { c.mode = 'core'; c.gx = CORE_X; c.gy = CORE_Y; return; }
        c.mode = 'wall';
        c.seg = si;
        const q = segPoint(segs[si], c.x, c.y);
        const s = segs[si];
        c.gx = q.x + s.nx * (k.r + 2);
        c.gy = q.y + s.ny * (k.r + 2);
      }

      function updateCreature(c, dt) {
        const k = KINDS[c.kind];
        c.think -= dt;
        c.cool -= dt;
        c.hit -= dt;
        c.slowT -= dt;
        c.windup -= dt;
        if (c.think <= 0) creatureThink(c);
        let gx = c.gx;
        let gy = c.gy;
        let stopAt = 0;
        let target = null;
        if (c.mode === 'soldier') {
          if (!sol.alive) { c.think = 0; return; }
          gx = sol.x; gy = sol.y;
          stopAt = c.kind === 'walker' ? k.range : k.r + S_R + 2;
          target = 'soldier';
        } else if (c.mode === 'core') {
          gx = CORE_X; gy = CORE_Y;
          stopAt = c.kind === 'walker' ? k.range : CORE_R + k.r + 2;
          target = 'core';
        } else if (c.mode === 'gap') {
          const s = segs[c.gap];
          if (!s || s.hp > 0) { c.think = 0; c.mode = 'core'; return; }
          if (c.wp === 0) { gx = s.cx + s.nx * 34; gy = s.cy + s.ny * 34; } else { gx = s.cx - s.nx * 34; gy = s.cy - s.ny * 34; }
          if (Math.hypot(gx - c.x, gy - c.y) < 12) {
            c.wp++;
            if (c.wp > 1) { c.mode = 'core'; c.think = 0.5; }
          }
        } else if (c.mode === 'wall') {
          const s = segs[c.seg];
          if (!s || s.hp <= 0) { c.think = 0; return; }
          target = 'wall';
          stopAt = 4;
        }
        const dx = gx - c.x;
        const dy = gy - c.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = Math.atan2(dy, dx);
        c.ang += angDiff(want, c.ang) * Math.min(1, dt * 8);
        const slow = c.slowT > 0 ? 1 - c.slowK : 1;
        const sp = k.speed * c.spd * slow * (c.windup > 0 ? 0.2 : 1);
        if (d > stopAt) {
          const step = Math.min(d - stopAt, sp * dt);
          c.x += dx / d * step;
          c.y += dy / d * step;
        }
        const touched = resolveWalls(c, k.r, false);
        // Stuck against a wall it did not plan to hit: claw through it.
        c.stuck += dt;
        if (c.stuck > 0.7) {
          if (Math.hypot(c.x - c.lx, c.y - c.ly) < sp * 0.7 * 0.25 && touched >= 0 && d > stopAt + 4 && !inside(c.x, c.y)) {
            c.mode = 'wall';
            c.seg = touched;
            c.think = 2;
          }
          c.stuck = 0;
          c.lx = c.x;
          c.ly = c.y;
        }
        if (c.cool > 0) return;
        // Attacks.
        if (target === 'soldier' && sol.alive) {
          const sd = Math.hypot(sol.x - c.x, sol.y - c.y);
          if (c.kind === 'walker') {
            if (sd < k.range + 40) { spit(c, sol.x, sol.y, -1, false); c.cool = k.rate; }
          } else if (sd < k.r + S_R + 8) {
            hurtSoldier(c.kind === 'brute' ? 22 : k.dmg);
            c.cool = k.rate;
          }
        } else if (target === 'core') {
          const cd = Math.hypot(CORE_X - c.x, CORE_Y - c.y);
          if (c.kind === 'walker') {
            if (cd < k.range + 40) { spit(c, CORE_X, CORE_Y, -1, true); c.cool = k.rate; }
          } else if (cd < CORE_R + k.r + 8) {
            hurtCore(k.dmg);
            c.cool = k.rate;
            burst(c.x + (CORE_X - c.x) * 0.5, c.y + (CORE_Y - c.y) * 0.5, 3, 80, C.mint, 0.3, 2, true);
          }
        } else if (target === 'wall' || c.mode === 'wall') {
          const s = segs[c.seg];
          if (s && s.hp > 0) {
            const q = segPoint(s, c.x, c.y);
            if (Math.hypot(q.x - c.x, q.y - c.y) < k.r + 6) {
              if (c.kind === 'brute') {
                // Telegraphed smash: wind up first, strike when the wind-up ends.
                if (c.windup <= -0.2) { c.windup = 0.35; return; }
                if (c.windup > 0) return;
              }
              if (c.kind === 'walker') {
                spit(c, q.x, q.y, c.seg, false);
              } else {
                hurtSeg(c.seg, c.kind === 'brute' ? k.dmg * 2 : k.dmg);
                burst(q.x, q.y, c.kind === 'brute' ? 8 : 2, 100, '#5D5490', 0.4, 3, false);
                if (c.kind === 'brute' && lit(c.x, c.y)) shake = Math.max(shake, 0.08);
              }
              c.cool = k.rate;
            }
          }
        }
      }

      function spit(c, tx, ty, seg, core) {
        for (const s of spits) {
          if (s.on) continue;
          s.on = true;
          s.x0 = c.x; s.y0 = c.y;
          s.x1 = tx + U.rand(-10, 10);
          s.y1 = ty + U.rand(-10, 10);
          s.t = 0;
          s.dur = Math.max(0.4, Math.hypot(tx - c.x, ty - c.y) / 170);
          s.seg = seg;
          s.core = core;
          return;
        }
      }

      function updateSpits(dt) {
        for (const s of spits) {
          if (!s.on) continue;
          s.t += dt;
          if (s.t < s.dur) continue;
          s.on = false;
          burst(s.x1, s.y1, 8, 90, '#9CFF6B', 0.4, 3, true);
          if (sol.alive && Math.hypot(sol.x - s.x1, sol.y - s.y1) < 24) hurtSoldier(KINDS.walker.dmg);
          if (s.seg >= 0) hurtSeg(s.seg, KINDS.walker.dmg);
          if (s.core) hurtCore(KINDS.walker.dmg);
          if (state === 'over') return;
        }
      }

      /* ---------- Towers ---------- */
      function nearestCreature(x, y, range) {
        let best = null;
        let bestD = 1e9;
        for (const c of creatures) {
          if (c.dead) continue;
          const d = Math.hypot(c.x - x, c.y - y);
          // Prefer creatures closer to the core.
          const sc = d + Math.hypot(c.x - CORE_X, c.y - CORE_Y) * 0.25 - range * 0.25;
          if (d < range && sc < bestD) { bestD = sc; best = c; }
        }
        return best;
      }

      function updateTowers(dt) {
        for (const t of towers) {
          const spec = TOWERS[t.key];
          const L = t.level - 1;
          t.cool -= dt;
          t.pulse = Math.max(0, t.pulse - dt);
          t.firing = false;
          const range = spec.range[L];
          const tg = nearestCreature(t.x, t.y, range);
          if (t.key === 'slow') {
            if (tg && t.cool <= 0) {
              t.cool = spec.rate[L];
              t.pulse = 0.5;
              for (const c of creatures) {
                if (c.dead || Math.hypot(c.x - t.x, c.y - t.y) > range) continue;
                c.slowT = 1.6;
                c.slowK = spec.slow[L];
                hurtCreature(c, spec.dmg[L]);
              }
            }
            continue;
          }
          if (!tg) continue;
          const want = Math.atan2(tg.y - t.y, tg.x - t.x);
          t.ang += angDiff(want, t.ang) * Math.min(1, dt * 10);
          if (t.key === 'gun') {
            if (t.cool <= 0 && Math.abs(angDiff(want, t.ang)) < 0.25) {
              t.cool = spec.rate[L];
              shoot(t.x + Math.cos(t.ang) * 16, t.y + Math.sin(t.ang) * 16, t.ang, 0.04, spec.dmg[L], true, range / 700 + 0.05);
              t.pulse = 0.06;
              if (lit(t.x, t.y) && Math.random() < 0.5) api.sfx('tick');
            }
          } else {
            t.firing = true;
            const dps = spec.dps[L];
            for (const c of creatures) {
              if (c.dead) continue;
              const dx = c.x - t.x;
              const dy = c.y - t.y;
              const d = Math.hypot(dx, dy);
              if (d > range + KINDS[c.kind].r) continue;
              if (Math.abs(angDiff(Math.atan2(dy, dx), t.ang)) > 0.5) continue;
              hurtCreature(c, dps * dt);
            }
            if (Math.random() < 0.8) {
              const a = t.ang + U.rand(-0.35, 0.35);
              const s = U.rand(150, 260);
              part(t.x + Math.cos(t.ang) * 14, t.y + Math.sin(t.ang) * 14, Math.cos(a) * s, Math.sin(a) * s, range / s, U.rand(4, 7), Math.random() < 0.5 ? '#FF8A3D' : C.gold, true);
            }
          }
        }
      }

      /* ---------- Soldier ---------- */
      function shoot(x, y, ang, spread, dmg, tower, life) {
        for (const b of bullets) {
          if (b.on) continue;
          const a = ang + (Math.random() - 0.5) * 2 * spread;
          b.on = true;
          b.x = x;
          b.y = y;
          b.vx = Math.cos(a) * GUN.speed;
          b.vy = Math.sin(a) * GUN.speed;
          b.life = life;
          b.dmg = dmg;
          b.tower = tower;
          return;
        }
      }

      function soldierFire() {
        if (!sol.alive || sol.cool > 0 || sol.reloadT > 0) return;
        if (state !== 'night' && state !== 'dusk') return;
        sol.cool = GUN.rate;
        sol.mag--;
        sol.flash = 0.05;
        shoot(sol.x + Math.cos(sol.ang) * 22, sol.y + Math.sin(sol.ang) * 22, sol.ang, GUN.spread, GUN.dmg, false, GUN.life);
        api.sfx('shoot');
        if (sol.mag <= 0) sol.reloadT = GUN.reload;
      }

      function updateSoldier(dt) {
        sol.cool -= dt;
        sol.flash -= dt;
        sol.hurtT -= dt;
        if (!sol.alive) {
          sol.respawnT -= dt;
          if (sol.respawnT <= 0) {
            sol.alive = true;
            sol.hp = S_HP;
            sol.x = CORE_X;
            sol.y = CORE_Y + 44;
            sol.mag = GUN.mag;
            sol.reloadT = 0;
          }
          return;
        }
        if (sol.reloadT > 0) {
          sol.reloadT -= dt;
          if (sol.reloadT <= 0) { sol.mag = GUN.mag; api.sfx('blip'); }
        }
        let mx = 0;
        let my = 0;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
        if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
        if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
        const ml = Math.hypot(mx, my);
        if (ml) {
          sol.x += mx / ml * S_SPEED * dt;
          sol.y += my / ml * S_SPEED * dt;
        }
        sol.x = U.clamp(sol.x, S_R, W - S_R);
        sol.y = U.clamp(sol.y, S_R, H - S_R);
        resolveWalls(sol, S_R, true);
        const cd = Math.hypot(sol.x - CORE_X, sol.y - CORE_Y);
        if (cd < CORE_R + S_R) {
          sol.x = CORE_X + (sol.x - CORE_X) / (cd || 1) * (CORE_R + S_R);
          sol.y = CORE_Y + (sol.y - CORE_Y) / (cd || 1) * (CORE_R + S_R);
        }
        sol.ang = Math.atan2(mouseY - sol.y, mouseX - sol.x);
        if (mouseDown || keys.has('Space')) soldierFire();
        if (state === 'day' && sol.hp < S_HP) sol.hp = Math.min(S_HP, sol.hp + 20 * dt);
      }

      function updateBullets(dt) {
        for (const b of bullets) {
          if (!b.on) continue;
          b.life -= dt;
          if (b.life <= 0) { b.on = false; continue; }
          const steps = Math.max(1, Math.ceil(GUN.speed * dt / 8));
          const h = dt / steps;
          for (let s = 0; s < steps && b.on; s++) {
            b.x += b.vx * h;
            b.y += b.vy * h;
            if (b.x < -30 || b.y < -30 || b.x > W + 30 || b.y > H + 30) { b.on = false; break; }
            for (const c of creatures) {
              if (c.dead) continue;
              const r = KINDS[c.kind].r + 2;
              if (Math.abs(c.x - b.x) > r || Math.abs(c.y - b.y) > r) continue;
              if ((c.x - b.x) * (c.x - b.x) + (c.y - b.y) * (c.y - b.y) < r * r) {
                b.on = false;
                hurtCreature(c, b.dmg);
                burst(b.x, b.y, 3, 90, KINDS[c.kind].color, 0.25, 2, false);
                break;
              }
            }
          }
        }
      }

      function updateParts(dt) {
        for (const p of parts) {
          if (!p.on) continue;
          p.life -= dt;
          if (p.life <= 0) { p.on = false; continue; }
          const k = Math.pow(0.08, dt);
          p.vx *= k;
          p.vy *= k;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
        }
        for (let i = floats.length - 1; i >= 0; i--) {
          floats[i].t -= dt;
          floats[i].y -= 24 * dt;
          if (floats[i].t <= 0) floats.splice(i, 1);
        }
      }

      /* ---------- Building ---------- */
      function slotAt(x, y) {
        for (let i = 0; i < SLOTS.length; i++) {
          if (Math.hypot(SLOTS[i][0] - x, SLOTS[i][1] - y) < 20) return i;
        }
        return -1;
      }
      function towerAt(i) {
        for (const t of towers) if (t.slot === i) return t;
        return null;
      }
      function popupButtons(i) {
        const sx = SLOTS[i][0];
        const sy = SLOTS[i][1];
        const up = sy > 200;
        const y = up ? sy - 92 : sy + 30;
        const x0 = U.clamp(sx - 114, 8, W - 236);
        return [0, 1, 2].map((k) => ({ x: x0 + k * 78, y, w: 72, h: 62, key: TOWER_KEYS[k] }));
      }

      function build(slot, key) {
        const spec = TOWERS[key];
        if (cash < spec.cost) {
          popupFlash = 0.4;
          api.sfx('lose');
          api.setStatus('Not enough cash for the ' + spec.name + ' ($' + spec.cost + ').');
          return;
        }
        cash -= spec.cost;
        towers.push({ slot, key, level: 1, x: SLOTS[slot][0], y: SLOTS[slot][1], ang: Math.atan2(SLOTS[slot][1] - CORE_Y, SLOTS[slot][0] - CORE_X), cool: 0, pulse: 0, firing: false });
        popup = -1;
        api.sfx('power');
        burst(SLOTS[slot][0], SLOTS[slot][1], 12, 120, spec.color, 0.5, 3, true);
        api.setStatus(spec.name + ' built. Click it again to upgrade.');
      }

      function upgrade(t) {
        if (t.level >= 3) { api.setStatus('That ' + TOWERS[t.key].name + ' is already at max level.'); return; }
        const cost = upgradeCost(t.key, t.level);
        if (cash < cost) {
          api.sfx('lose');
          api.setStatus('Upgrading costs $' + cost + '.');
          return;
        }
        cash -= cost;
        t.level++;
        api.sfx('power');
        burst(t.x, t.y, 14, 140, TOWERS[t.key].color, 0.5, 3, true);
        api.setStatus(TOWERS[t.key].name + ' upgraded to level ' + t.level + '.');
      }

      function repairCost() {
        let missing = 0;
        for (const s of segs) missing += s.max - s.hp;
        return Math.ceil(missing / 5);
      }

      function repair() {
        if (state !== 'day') return;
        const cost = repairCost();
        if (cost <= 0) { api.setStatus('The walls are already in one piece.'); return; }
        if (cash <= 0) { api.sfx('lose'); api.setStatus('No cash left for repairs.'); return; }
        let budget = Math.min(cash, cost) * 5;
        const spent = Math.min(cash, cost);
        cash -= spent;
        // Fix the most damaged segments first.
        const order = segs.slice().sort((a, b) => a.hp / a.max - b.hp / b.max);
        for (const s of order) {
          const need = s.max - s.hp;
          const fix = Math.min(need, budget);
          s.hp += fix;
          budget -= fix;
          if (fix > 0) burst(s.cx, s.cy, 5, 60, C.mint, 0.4, 2, true);
          if (budget <= 0) break;
        }
        api.sfx('power');
        api.setStatus('Walls repaired for $' + spent + '.');
      }

      /* ---------- Flow ---------- */
      function startGame(dn) {
        diffName = dn;
        D = DIFF[dn];
        segs = makeSegments();
        towers = [];
        creatures = [];
        spawnQueue = [];
        for (const b of bullets) b.on = false;
        for (const s of spits) s.on = false;
        for (const p of parts) p.on = false;
        floats.length = 0;
        cash = D.cash;
        kills = 0;
        nightsSurvived = 0;
        night = 0;
        coreHp = CORE_HP;
        sol.x = CORE_X;
        sol.y = CORE_Y + 60;
        sol.hp = S_HP;
        sol.alive = true;
        sol.mag = GUN.mag;
        sol.reloadT = 0;
        hintNight = false;
        hintBreach = false;
        hintEyes = false;
        popup = -1;
        dark = 0;
        updateScore();
        startDay();
      }

      function startDay() {
        state = 'day';
        night++;
        phaseT = DAY_TIME;
        popup = -1;
        sol.hp = S_HP;
        if (!sol.alive) { sol.alive = true; sol.x = CORE_X; sol.y = CORE_Y + 44; }
        sol.mag = GUN.mag;
        sol.reloadT = 0;
        banner = { text: 'Day ' + night, color: C.gold, t: 2 };
        const rc = repairCost();
        if (night === 1) api.setStatus('Day 1: click a glowing slot on the walls to build. Press Enter to start the night early.');
        else if (rc > 0) api.setStatus('Day ' + night + ': press R to repair the walls for $' + rc + '. Enter starts the night.');
        else api.setStatus('Day ' + night + ': build and upgrade. Enter starts the night.');
      }

      function startDusk() {
        if (state !== 'day') return;
        state = 'dusk';
        phaseT = DUSK_TIME;
        popup = -1;
        planNight(night);
        api.sfx('tick');
      }

      function startNight() {
        state = 'night';
        banner = { text: 'Night ' + night, color: C.violet, t: 1.6 };
        api.sfx('blip');
        if (!hintNight) {
          hintNight = true;
          api.setStatus('Night falls. Only your flashlight cone and the turret lamps light the dark. Aim with the mouse.');
        } else {
          api.setStatus('Night ' + night + ': ' + spawnQueue.length + ' creatures are coming.');
        }
      }

      function endNight() {
        nightsSurvived++;
        const bonus = 50 + 25 * night;
        cash += bonus;
        state = 'dawn';
        phaseT = DAWN_TIME;
        banner = { text: 'Night ' + night + ' survived', color: C.mint, t: DAWN_TIME };
        floatText(CORE_X, CORE_Y - 50, '+$' + bonus + ' dawn bonus', C.gold);
        api.sfx('win');
        updateScore();
      }

      function gameOver() {
        if (state === 'over') return;
        state = 'over';
        mouseDown = false;
        burst(CORE_X, CORE_Y, 40, 260, C.mint, 1, 4, true);
        api.sfx('boom');
        shake = 0.6;
        const final = nightsSurvived * 1000 + kills * 10;
        updateScore();
        const best = api.reportScore(final);
        api.setStatus('The outpost fell on night ' + night + '.');
        api.after(900, () => {
          api.menu({
            title: best ? 'New best: ' + final + '!' : 'The outpost fell',
            text: 'You survived ' + nightsSurvived + ' night' + (nightsSurvived === 1 ? '' : 's') + ' and stopped ' + kills +
              ' creatures for ' + final + ' points.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(diffName) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      function showStartMenu() {
        state = 'menu';
        popup = -1;
        api.setStatus('Build by day, survive the night.');
        api.menu({
          title: 'Outpost Defense',
          text: 'Build turrets by day, then hold the walls at night with only a flashlight cone. Keep the core alive.',
          buttons: [
            { label: 'Easy', onClick: () => startGame('easy') },
            { label: 'Normal', primary: true, onClick: () => startGame('normal') },
            { label: 'Hard', onClick: () => startGame('hard') }
          ]
        });
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
        if (state === 'day') {
          if (popup >= 0) {
            const btns = popupButtons(popup);
            for (const b of btns) {
              if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) { build(popup, b.key); return; }
            }
          }
          const s = slotAt(p.x, p.y);
          if (s >= 0) {
            const t = towerAt(s);
            if (t) { popup = -1; upgrade(t); } else { popup = popup === s ? -1 : s; api.sfx('blip'); }
            return;
          }
          popup = -1;
          return;
        }
        if (state === 'night' || state === 'dusk') mouseDown = e.button !== 2;
      });
      api.on(window, 'pointerup', () => { mouseDown = false; }, { always: true });
      api.on(window, 'keydown', (e) => {
        if (e.repeat) return;
        if (state === 'day') {
          if (e.code === 'Enter') startDusk();
          else if (e.code === 'KeyR') repair();
          else if (popup >= 0 && (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3')) {
            build(popup, TOWER_KEYS[e.code.charCodeAt(5) - 49]);
          }
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        coreFlash = Math.max(0, coreFlash - dt);
        popupFlash = Math.max(0, popupFlash - dt);
        if (banner) { banner.t -= dt; if (banner.t <= 0) banner = null; }
        for (const s of segs) s.flash = Math.max(0, s.flash - dt);
        updateParts(dt);
        const wantDark = state === 'night' || state === 'over' ? 0.94 : state === 'dusk' ? 0.94 * (1 - phaseT / DUSK_TIME) :
          state === 'dawn' ? 0.94 * phaseT / DAWN_TIME : state === 'day' && phaseT < 5 ? 0.3 * (1 - phaseT / 5) : 0;
        dark += (wantDark - dark) * Math.min(1, dt * 4);
        if (state === 'menu' || state === 'over') {
          updateBullets(dt);
          return;
        }
        updateSoldier(dt);
        if (state === 'day') {
          phaseT -= dt;
          if (phaseT <= 0) startDusk();
          return;
        }
        if (state === 'dusk') {
          const prev = Math.ceil(phaseT);
          phaseT -= dt;
          if (phaseT <= 0) startNight();
          else if (Math.ceil(phaseT) !== prev) api.sfx('tick');
        }
        if (state === 'night') {
          spawnT -= dt;
          if (spawnT <= 0 && spawnQueue.length) {
            if (spawnCreature(spawnQueue[spawnQueue.length - 1])) spawnQueue.pop();
            spawnT = spawnGap * U.rand(0.5, 1.5);
          }
        }
        for (const c of creatures) {
          updateCreature(c, dt);
          if (state === 'over') return;
        }
        // Soft separation.
        for (let i = 0; i < creatures.length; i++) {
          const a = creatures[i];
          const ra = KINDS[a.kind].r;
          for (let j = i + 1; j < creatures.length; j++) {
            const b = creatures[j];
            const rr = ra + KINDS[b.kind].r;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr && d2 > 1e-4) {
              const d = Math.sqrt(d2);
              const push = (rr - d) * 0.3;
              a.x -= dx / d * push;
              a.y -= dy / d * push;
              b.x += dx / d * push;
              b.y += dy / d * push;
            }
          }
        }
        updateTowers(dt);
        updateBullets(dt);
        updateSpits(dt);
        if (state === 'over') return;
        for (let i = creatures.length - 1; i >= 0; i--) if (creatures[i].dead) creatures.splice(i, 1);
        if (!hintEyes && state === 'night' && creatures.length > 2 && clock > 3) {
          for (const c of creatures) {
            if (!lit(c.x, c.y) && c.x > 0 && c.y > 0 && c.x < W && c.y < H) {
              hintEyes = true;
              api.setStatus('Those glowing eyes are creatures in the dark. Sweep your flashlight to see them.');
              break;
            }
          }
        }
        if (state === 'night' && !spawnQueue.length && !creatures.length) endNight();
        if (state === 'dawn') {
          phaseT -= dt;
          if (phaseT <= 0) startDay();
        }
      }

      /* ---------- Render ---------- */
      function drawGround() {
        ctx.fillStyle = '#1C2333';
        ctx.fillRect(-30, -30, W + 60, H + 60);
        for (const t of tufts) {
          ctx.fillStyle = t.c;
          ctx.fillRect(t.x, t.y, t.s, t.s * 2);
          ctx.fillRect(t.x + t.s, t.y + t.s * 0.6, t.s, t.s * 1.4);
        }
        // Compound floor.
        ctx.fillStyle = '#211C3D';
        ctx.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
        ctx.strokeStyle = '#2A2450';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = X0 + 28; x < X1; x += 28) { ctx.moveTo(x, Y0); ctx.lineTo(x, Y1); }
        for (let y = Y0 + 28; y < Y1; y += 28) { ctx.moveTo(X0, y); ctx.lineTo(X1, y); }
        ctx.stroke();
        // Path out of the gate.
        ctx.fillStyle = '#242A3C';
        ctx.fillRect(GATE_A + 8, Y1 + 8, GATE_B - GATE_A - 16, H - Y1);
      }

      function drawWalls() {
        for (const s of segs) {
          if (s.hp <= 0) {
            ctx.fillStyle = '#3A3466';
            for (let i = 0; i < 5; i++) {
              const fx = s.x + ((i * 37 + s.x) % Math.max(1, s.w - 6));
              const fy = s.y + ((i * 23 + s.y) % Math.max(1, s.h - 6));
              ctx.fillRect(fx, fy, 6, 5);
            }
            continue;
          }
          const k = s.hp / s.max;
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(s.x + 3, s.y + 4, s.w, s.h);
          ctx.fillStyle = s.gate ? (k > 0.5 ? '#8C6A3F' : '#6E5232') : (k > 0.66 ? '#5D5490' : k > 0.33 ? '#514880' : '#463D6E');
          ctx.fillRect(s.x, s.y, s.w, s.h);
          ctx.fillStyle = 'rgba(255,255,255,0.13)';
          if (s.w > s.h) ctx.fillRect(s.x, s.y, s.w, 3); else ctx.fillRect(s.x, s.y, 3, s.h);
          if (s.gate) {
            ctx.fillStyle = C.gold;
            ctx.fillRect(s.x + 10, s.y + 3, 4, s.h - 6);
            ctx.fillRect(s.x + s.w - 14, s.y + 3, 4, s.h - 6);
          }
          if (k < 0.66) {
            ctx.strokeStyle = '#1C1838';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const long = s.w > s.h;
            const n = k < 0.33 ? 3 : 1;
            for (let i = 0; i < n; i++) {
              const f = (i + 0.5) / n;
              if (long) {
                const x = s.x + s.w * f;
                ctx.moveTo(x - 4, s.y + 2); ctx.lineTo(x + 3, s.y + s.h / 2); ctx.lineTo(x - 2, s.y + s.h - 2);
              } else {
                const y = s.y + s.h * f;
                ctx.moveTo(s.x + 2, y - 4); ctx.lineTo(s.x + s.w / 2, y + 3); ctx.lineTo(s.x + s.w - 2, y - 2);
              }
            }
            ctx.stroke();
          }
          if (s.flash > 0) {
            ctx.fillStyle = U.alpha('#FFFFFF', s.flash * 3);
            ctx.fillRect(s.x, s.y, s.w, s.h);
          }
          if (k < 1 && (state === 'day' || k < 0.5)) {
            const bw = Math.min(40, Math.max(s.w, s.h) - 10);
            ctx.fillStyle = 'rgba(15,13,36,0.8)';
            ctx.fillRect(s.cx - bw / 2, s.cy - 2, bw, 4);
            ctx.fillStyle = k > 0.5 ? C.mint : k > 0.25 ? C.gold : C.p1;
            ctx.fillRect(s.cx - bw / 2, s.cy - 2, bw * k, 4);
          }
        }
      }

      function drawCore() {
        const pulse = Math.sin(clock * 3) * 0.5 + 0.5;
        ctx.fillStyle = U.alpha(C.mint, 0.12 + pulse * 0.08);
        ctx.beginPath();
        ctx.arc(CORE_X, CORE_Y, CORE_R + 14, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#2A2546';
        ctx.beginPath();
        ctx.arc(CORE_X, CORE_Y, CORE_R, 0, TAU);
        ctx.fill();
        ctx.fillStyle = coreFlash > 0 ? '#FFFFFF' : C.mint;
        ctx.beginPath();
        ctx.arc(CORE_X, CORE_Y, 12 + pulse * 3, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.mint;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(CORE_X, CORE_Y, CORE_R - 4, -Math.PI / 2, -Math.PI / 2 + TAU * coreHp / CORE_HP);
        ctx.stroke();
      }

      function drawSlots() {
        for (let i = 0; i < SLOTS.length; i++) {
          const t = towerAt(i);
          const sx = SLOTS[i][0];
          const sy = SLOTS[i][1];
          if (t) {
            if (t.key === 'slow' && t.pulse > 0) {
              ctx.strokeStyle = U.alpha(C.p2, t.pulse);
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(t.x, t.y, TOWERS.slow.range[t.level - 1] * (1 - t.pulse), 0, TAU);
              ctx.stroke();
            }
            drawTower(ctx, t.key, t.level, t.x, t.y, t.ang, clock);
            continue;
          }
          if (state !== 'day') continue;
          const glow = 0.4 + Math.sin(clock * 4 + i) * 0.2;
          ctx.fillStyle = U.alpha(C.gold, popup === i ? 0.45 : 0.15);
          ctx.beginPath();
          ctx.arc(sx, sy, 14, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.gold, glow + 0.2);
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(sx, sy, 14, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = C.gold;
          ctx.fillRect(sx - 1, sy - 6, 2, 12);
          ctx.fillRect(sx - 6, sy - 1, 12, 2);
        }
      }

      function drawPopup() {
        if (state !== 'day' || popup < 0) return;
        const btns = popupButtons(popup);
        for (let k = 0; k < 3; k++) {
          const b = btns[k];
          const spec = TOWERS[b.key];
          const hover = mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h;
          const afford = cash >= spec.cost;
          ctx.fillStyle = hover ? '#2E2860' : 'rgba(28,24,56,0.95)';
          U.roundRect(ctx, b.x, b.y, b.w, b.h, 8);
          ctx.fill();
          ctx.strokeStyle = popupFlash > 0 && !afford ? C.p1 : hover ? spec.color : C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          drawTower(ctx, b.key, 1, b.x + 20, b.y + 22, -0.5, clock);
          ctx.font = TINY;
          ctx.textAlign = 'left';
          ctx.fillStyle = C.muted;
          ctx.fillText(String(k + 1), b.x + 60, b.y + 13);
          ctx.textAlign = 'center';
          ctx.fillStyle = C.text;
          ctx.fillText(spec.short, b.x + b.w / 2, b.y + 47);
          ctx.fillStyle = afford ? C.gold : C.p1;
          ctx.fillText('$' + spec.cost, b.x + b.w / 2, b.y + 57);
        }
        // Range preview for the hovered option.
        for (const b of btns) {
          if (mouseX >= b.x && mouseX <= b.x + b.w && mouseY >= b.y && mouseY <= b.y + b.h) {
            ctx.strokeStyle = U.alpha(TOWERS[b.key].color, 0.5);
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(SLOTS[popup][0], SLOTS[popup][1], TOWERS[b.key].range[0], 0, TAU);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      function drawTooltip() {
        if (state !== 'day' || popup >= 0) return;
        const s = slotAt(mouseX, mouseY);
        if (s < 0) return;
        const t = towerAt(s);
        const text = t ? (t.level >= 3 ? TOWERS[t.key].name + ' · max level' : 'Upgrade to level ' + (t.level + 1) + ' · $' + upgradeCost(t.key, t.level)) : 'Build here';
        if (t) {
          ctx.strokeStyle = U.alpha(TOWERS[t.key].color, 0.5);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.arc(t.x, t.y, TOWERS[t.key].range[Math.min(2, t.level)], 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.font = SMALL;
        const tw = ctx.measureText(text).width + 16;
        const x = U.clamp(mouseX + 14, 4, W - tw - 4);
        const y = U.clamp(mouseY - 30, 4, H - 26);
        ctx.fillStyle = 'rgba(15,13,36,0.92)';
        U.roundRect(ctx, x, y, tw, 22, 6);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x + 8, y + 11);
        ctx.textBaseline = 'alphabetic';
      }

      function drawWorld() {
        drawGround();
        drawWalls();
        drawCore();
        drawSlots();
        for (const c of creatures) {
          drawCreature(ctx, c.kind, c.x, c.y, c.ang, clock + c.seed * 10, c.hit);
          if (c.slowT > 0) {
            ctx.strokeStyle = U.alpha(C.p2, 0.6);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(c.x, c.y, KINDS[c.kind].r + 5, 0, TAU);
            ctx.stroke();
          }
          if (c.hp < c.max) {
            const r = KINDS[c.kind].r;
            ctx.fillStyle = 'rgba(15,13,36,0.8)';
            ctx.fillRect(c.x - r, c.y - r - 9, r * 2, 3);
            ctx.fillStyle = C.p1;
            ctx.fillRect(c.x - r, c.y - r - 9, r * 2 * Math.max(0, c.hp / c.max), 3);
          }
          if (c.kind === 'brute' && c.windup > 0) {
            ctx.strokeStyle = U.alpha(C.p1, 0.8);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(c.x, c.y, 26 - c.windup * 20, 0, TAU);
            ctx.stroke();
          }
        }
        if (sol.alive) drawSoldier(ctx, sol.x, sol.y, sol.ang, sol.flash);
      }

      function drawLights() {
        if (dark < 0.02) return;
        mctx.globalCompositeOperation = 'source-over';
        mctx.clearRect(0, 0, W, H);
        mctx.fillStyle = 'rgba(4,3,14,' + dark.toFixed(3) + ')';
        mctx.fillRect(0, 0, W, H);
        mctx.globalCompositeOperation = 'destination-out';
        const L = (x, y, r, a) => {
          mctx.globalAlpha = a;
          mctx.drawImage(blob, x - r, y - r, r * 2, r * 2);
        };
        L(CORE_X, CORE_Y, 95, 0.9);
        for (const t of towers) L(t.x, t.y, 70, 0.85);
        for (const t of towers) {
          if (t.key === 'flame' && t.firing) L(t.x + Math.cos(t.ang) * 50, t.y + Math.sin(t.ang) * 50, 80, 0.7);
        }
        for (const p of parts) if (p.on && p.glow && p.size > 3) L(p.x, p.y, 18, 0.25);
        for (const s of spits) if (s.on) L(s.x0 + (s.x1 - s.x0) * s.t / s.dur, s.y0 + (s.y1 - s.y0) * s.t / s.dur, 26, 0.5);
        if (sol.alive) {
          L(sol.x, sol.y, 60, 1);
          if (sol.flash > 0) L(sol.x + Math.cos(sol.ang) * 26, sol.y + Math.sin(sol.ang) * 26, 90, 0.8);
          // Flashlight: soft wide penumbra, then the bright cone.
          for (let pass = 0; pass < 2; pass++) {
            const half = pass === 0 ? CONE_HALF + 0.16 : CONE_HALF;
            const range = pass === 0 ? CONE_RANGE * 0.9 : CONE_RANGE;
            mctx.save();
            mctx.beginPath();
            mctx.moveTo(sol.x, sol.y);
            mctx.arc(sol.x, sol.y, range, sol.ang - half, sol.ang + half);
            mctx.closePath();
            mctx.clip();
            mctx.globalAlpha = pass === 0 ? 0.45 : 1;
            mctx.drawImage(blob, sol.x - range, sol.y - range, range * 2, range * 2);
            mctx.drawImage(blob, sol.x - range * 0.6, sol.y - range * 0.6, range * 1.2, range * 1.2);
            mctx.restore();
          }
        }
        mctx.globalAlpha = 1;
        mctx.globalCompositeOperation = 'source-over';
        ctx.drawImage(mask, 0, 0, W, H);
        // Warm tint inside the beam.
        if (sol.alive && dark > 0.5) {
          ctx.fillStyle = 'rgba(255,236,170,0.05)';
          ctx.beginPath();
          ctx.moveTo(sol.x, sol.y);
          ctx.arc(sol.x, sol.y, CONE_RANGE, sol.ang - CONE_HALF, sol.ang + CONE_HALF);
          ctx.closePath();
          ctx.fill();
        }
      }

      function drawOverDark() {
        // Things that glow on their own: eyes, spit, tracers, flames.
        if (dark > 0.4) {
          for (const c of creatures) if (!lit(c.x, c.y)) drawEyes(ctx, c.kind, c.x, c.y, c.ang, clock, c.seed);
        }
        for (const s of spits) {
          if (!s.on) continue;
          const k = s.t / s.dur;
          const x = s.x0 + (s.x1 - s.x0) * k;
          const y = s.y0 + (s.y1 - s.y0) * k - Math.sin(k * Math.PI) * 40;
          ctx.fillStyle = 'rgba(156,255,107,0.3)';
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#9CFF6B';
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, TAU);
          ctx.fill();
          if (dark > 0.4) {
            ctx.strokeStyle = 'rgba(156,255,107,0.35)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(s.x1, s.y1, 10 * (1 - k) + 4, 0, TAU);
            ctx.stroke();
          }
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#FFE08A';
        ctx.beginPath();
        for (const b of bullets) {
          if (!b.on) continue;
          ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
        for (const p of parts) {
          if (!p.on) continue;
          if (!p.glow && dark > 0.4 && !lit(p.x, p.y)) continue;
          ctx.globalAlpha = p.life / p.max;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        // Turret lamps.
        for (const t of towers) {
          ctx.fillStyle = U.alpha(TOWERS[t.key].color, 0.9);
          ctx.beginPath();
          ctx.arc(t.x, t.y - 1, 2.5, 0, TAU);
          ctx.fill();
        }
      }

      function drawHud() {
        ctx.textBaseline = 'middle';
        // Phase panel.
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, 12, 12, 250, 48, 10);
        ctx.fill();
        ctx.font = HUD;
        ctx.textAlign = 'left';
        const isDay = state === 'day';
        ctx.fillStyle = isDay ? C.gold : C.violet;
        const label = state === 'menu' ? 'OUTPOST' : isDay ? 'DAY ' + night : state === 'dusk' ? 'DUSK' : state === 'dawn' ? 'DAWN' : 'NIGHT ' + night;
        ctx.fillText(label, 24, 28);
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'right';
        if (isDay) ctx.fillText(Math.ceil(phaseT) + 's · Enter skips', 250, 28);
        else if (state === 'night') ctx.fillText((creatures.length + spawnQueue.length) + ' creatures left', 250, 28);
        ctx.fillStyle = 'rgba(243,240,255,0.1)';
        ctx.fillRect(24, 42, 226, 6);
        if (isDay) {
          ctx.fillStyle = C.gold;
          ctx.fillRect(24, 42, 226 * phaseT / DAY_TIME, 6);
        } else if (state === 'night') {
          const total = Math.max(1, creatures.length + spawnQueue.length);
          ctx.fillStyle = C.violet;
          ctx.fillRect(24, 42, 226 * Math.min(1, total / Math.max(1, nightTotal)), 6);
        }
        // Core.
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, W / 2 - 150, 12, 300, 34, 10);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.mint;
        ctx.fillText('CORE', W / 2 - 138, 29);
        ctx.fillStyle = 'rgba(243,240,255,0.1)';
        ctx.fillRect(W / 2 - 92, 24, 230, 10);
        ctx.fillStyle = coreHp > CORE_HP * 0.5 ? C.mint : coreHp > CORE_HP * 0.25 ? C.gold : C.p1;
        ctx.fillRect(W / 2 - 92, 24, 230 * coreHp / CORE_HP, 10);
        // Cash + score.
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, W - 192, 12, 180, 48, 10);
        ctx.fill();
        ctx.font = '700 20px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.gold;
        ctx.fillText('$' + cash, W - 178, 30);
        ctx.font = TINY;
        ctx.fillStyle = C.muted;
        ctx.fillText('SCORE ' + (nightsSurvived * 1000 + kills * 10), W - 178, 50);
        ctx.textAlign = 'right';
        ctx.fillText(kills + ' kills', W - 24, 50);
        // Soldier.
        ctx.fillStyle = 'rgba(15,13,36,0.82)';
        U.roundRect(ctx, 12, H - 52, 250, 40, 10);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.p1;
        ctx.fillText('YOU', 24, H - 32);
        ctx.fillStyle = 'rgba(243,240,255,0.1)';
        ctx.fillRect(62, H - 37, 110, 10);
        ctx.fillStyle = sol.hp > 50 ? C.mint : sol.hp > 25 ? C.gold : C.p1;
        ctx.fillRect(62, H - 37, 110 * sol.hp / S_HP, 10);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.text;
        ctx.fillText(!sol.alive ? 'down ' + Math.max(0, sol.respawnT).toFixed(1) : sol.reloadT > 0 ? 'reloading' : sol.mag + ' / ' + GUN.mag, 250, H - 32);
        if (state === 'day') {
          const rc = repairCost();
          const txt = 'Click a slot to build  ·  R repair' + (rc > 0 ? ' $' + rc : '') + '  ·  Enter: night';
          ctx.font = SMALL;
          const tw = ctx.measureText(txt).width + 20;
          ctx.fillStyle = 'rgba(15,13,36,0.82)';
          U.roundRect(ctx, W - tw - 12, H - 46, tw, 30, 10);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.textAlign = 'right';
          ctx.fillText(txt, W - 22, H - 31);
        }
        ctx.textBaseline = 'alphabetic';
        // Floating texts.
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        for (const f of floats) {
          ctx.globalAlpha = Math.min(1, f.t * 2);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
      }

      function drawBannerText(text, color, sub) {
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,0.6)';
        ctx.fillText(text, W / 2 + 3, H / 2 - 117);
        ctx.fillStyle = color;
        ctx.fillText(text, W / 2, H / 2 - 120);
        if (sub) {
          ctx.font = HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(sub, W / 2, H / 2 - 78);
        }
        ctx.textBaseline = 'alphabetic';
      }

      function drawCrosshair() {
        if (state !== 'night' && state !== 'dusk') return;
        ctx.strokeStyle = U.alpha(C.text, 0.8);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 7, 0, TAU);
        ctx.moveTo(mouseX - 12, mouseY); ctx.lineTo(mouseX - 4, mouseY);
        ctx.moveTo(mouseX + 4, mouseY); ctx.lineTo(mouseX + 12, mouseY);
        ctx.stroke();
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 30, (Math.random() - 0.5) * shake * 30);
        drawWorld();
        drawLights();
        drawOverDark();
        ctx.restore();
        if (sol.hurtT > 0) {
          ctx.fillStyle = U.alpha(C.p1, sol.hurtT * 0.4);
          ctx.fillRect(0, 0, W, H);
        }
        drawPopup();
        drawTooltip();
        drawCrosshair();
        drawHud();
        if (state === 'dusk') drawBannerText(String(Math.max(1, Math.ceil(phaseT))), C.violet, 'Night falls. Get to the walls.');
        else if (banner) drawBannerText(banner.text, banner.color, null);
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
