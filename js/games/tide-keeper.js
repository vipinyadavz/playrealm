/* Tide Keeper — PlayRealm original. You control only the sea level of a terraced bay:
   float boats up to their docks and drown fires, but keep the stilt villages dry. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const PANEL_X = 888;        // the tide-lever panel starts here
  const SEABED = 576;
  const LV_TOP = 118;         // highest the sea can rise (canvas y)
  const LV_BOT = 548;         // lowest it can fall
  const PX_PER_M = 40;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 11px "JetBrains Mono", monospace';

  /* Terraces rise to the right. Face k is the cliff wall at TERR[k].x0. */
  const TERR = [
    { x0: 400, x1: 490, top: 480 },
    { x0: 490, x1: 590, top: 410 },
    { x0: 590, x1: 690, top: 340 },
    { x0: 690, x1: 790, top: 270 },
    { x0: 790, x1: PANEL_X, top: 195 }
  ];
  const PIER = 26;
  const DOCK_COLORS = [C.p1, C.gold, C.mint, C.p2, C.violet];
  const DOCK_NAMES = ['coral', 'gold', 'mint', 'cyan', 'violet'];
  /* One dock per face, a little above the terrace below it. */
  const DOCKS = TERR.map((tr, i) => ({ x: tr.x0, y: i === 0 ? 520 : TERR[i - 1].top - 14, color: DOCK_COLORS[i] }));
  const TOL = 11;             // how close the sea must be to a dock's height
  const DWELL = 0.5;          // seconds a boat needs alongside its own dock to moor
  const WRONG_DWELL = 1.5;    // boats are slower to settle for the wrong dock (coral ring warns you)
  const VILLAGES = [
    { t: 2, x: 634, w: 46, floor: 300 },
    { t: 3, x: 735, w: 46, floor: 230 },
    { t: 4, x: 850, w: 50, floor: 157 }
  ];
  const SPOTS = [
    { t: 0, x: 418 }, { t: 0, x: 446 }, { t: 1, x: 514 }, { t: 1, x: 542 },
    { t: 2, x: 600 }, { t: 3, x: 701 }, { t: 4, x: 806 }
  ];
  const WHALE_LINE = 290;
  const WHALE_WAIT_X = 300;
  const BOAT_HALF = 23;
  const LOCK_Y = 556;
  const LOCK_TIME = 6;
  const FLOOD_TIME = 2;
  const SOAK_TIME = 1;
  const STARS = [];
  for (let i = 0; i < 42; i++) {
    STARS.push({ x: (i * 211.7) % 880, y: (i * 97.3) % 230 + 8, r: (i % 3) * 0.4 + 0.6, p: i * 1.7 });
  }
  const WEEDS = [38, 92, 168, 236, 318, 366];

  /* Layered swell: three sines, roughly in [-1.15, 1.15]. */
  function wave(x, t) {
    return Math.sin(x * 0.021 + t * 1.7) * 0.5 +
      Math.sin(x * 0.047 - t * 2.3) * 0.25 +
      Math.sin(x * 0.0083 + t * 0.65) * 0.4;
  }

  /* ---------- Shared art (used by the card thumbnail and the game) ---------- */

  function drawSkyArt(ctx, w, h, storm, sunX, sunY) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#120F2C');
    g.addColorStop(0.42, '#33285E');
    g.addColorStop(0.72, '#7A4775');
    g.addColorStop(1, '#E9866A');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sg = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.38);
    sg.addColorStop(0, 'rgba(255,214,150,0.5)');
    sg.addColorStop(1, 'rgba(255,170,120,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#FFE2A8';
    ctx.beginPath();
    ctx.arc(sunX, sunY, h * 0.045, 0, TAU);
    ctx.fill();
    if (storm > 0.01) {
      ctx.fillStyle = 'rgba(12,10,30,' + (storm * 0.6).toFixed(3) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function addRockPath(ctx, terr, seabed, bottom, right) {
    ctx.moveTo(0, bottom);
    ctx.lineTo(0, seabed);
    for (let x = 0; x < terr[0].x0; x += 20) ctx.lineTo(x, seabed + Math.sin(x * 0.05) * 3);
    ctx.lineTo(terr[0].x0, seabed);
    for (const tr of terr) {
      ctx.lineTo(tr.x0, tr.top);
      ctx.lineTo(tr.x1, tr.top);
    }
    ctx.lineTo(right, bottom);
    ctx.closePath();
  }

  function drawRock(ctx, terr, seabed, bottom, right) {
    // Sand floor of the open bay.
    ctx.fillStyle = '#C9A66B';
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    for (let x = 0; x <= terr[0].x0 + 10; x += 20) ctx.lineTo(x, seabed + Math.sin(x * 0.05) * 3 - 1);
    ctx.lineTo(terr[0].x0 + 10, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    addRockPath(ctx, terr, seabed + 4, bottom, right);
    ctx.fillStyle = '#B88C5C';
    ctx.fill();
    // Cliffs.
    ctx.beginPath();
    ctx.moveTo(terr[0].x0, bottom);
    for (const tr of terr) {
      ctx.lineTo(tr.x0, tr.top);
      ctx.lineTo(tr.x1, tr.top);
    }
    ctx.lineTo(right, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, terr[terr.length - 1].top, 0, bottom);
    g.addColorStop(0, '#CF9A68');
    g.addColorStop(0.5, '#9C6B47');
    g.addColorStop(1, '#5E3F2E');
    ctx.fillStyle = g;
    ctx.fill();
    for (let i = 0; i < terr.length; i++) {
      const tr = terr[i];
      ctx.strokeStyle = 'rgba(70,40,28,0.26)';
      ctx.lineWidth = 1.5;
      for (let y = tr.top + 15; y < bottom; y += 19) {
        ctx.beginPath();
        ctx.moveTo(tr.x0 + 3, y);
        ctx.quadraticCurveTo((tr.x0 + tr.x1) / 2, y + ((i + Math.round(y)) % 2 ? 3 : -3), tr.x1, y + 1);
        ctx.stroke();
      }
      const fg = ctx.createLinearGradient(tr.x0, 0, tr.x0 + 14, 0);
      fg.addColorStop(0, 'rgba(50,28,20,0.5)');
      fg.addColorStop(1, 'rgba(50,28,20,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(tr.x0, tr.top, 14, bottom - tr.top);
      ctx.fillStyle = '#5DAE68';
      ctx.fillRect(tr.x0, tr.top - 1, tr.x1 - tr.x0, 5);
      ctx.fillStyle = '#8AD483';
      ctx.fillRect(tr.x0, tr.top - 1, tr.x1 - tr.x0, 1.5);
    }
  }

  function seaPath(ctx, p, off, ampK, phase) {
    ctx.beginPath();
    ctx.moveTo(0, p.bottom);
    for (let x = 0; ; x += p.step) {
      const xx = Math.min(x, p.right);
      ctx.lineTo(xx, p.level + off + p.amp * ampK * wave(xx + phase, p.t));
      if (xx >= p.right) break;
    }
    ctx.lineTo(p.right, p.bottom);
    ctx.closePath();
  }

  function seaClip(ctx, p) {
    ctx.beginPath();
    ctx.rect(0, 0, p.right, p.bottom);
    addRockPath(ctx, p.terr, p.seabed, p.bottom, p.right);
    ctx.clip('evenodd');
  }

  /* Far swell behind the cliffs, a little higher and darker. */
  function drawSeaBack(ctx, p) {
    seaPath(ctx, p, -6, 0.9, 150);
    ctx.fillStyle = 'rgba(34,92,150,0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,235,255,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawSea(ctx, p) {
    // Wet tint over submerged rock, villages and fires.
    seaPath(ctx, p, 0, 1, 0);
    const tg = ctx.createLinearGradient(0, p.level, 0, p.level + 150);
    tg.addColorStop(0, 'rgba(70,170,225,0.34)');
    tg.addColorStop(1, 'rgba(20,60,120,0.26)');
    ctx.fillStyle = tg;
    ctx.fill();
    ctx.save();
    seaClip(ctx, p);
    seaPath(ctx, p, 0, 1, 0);
    const g = ctx.createLinearGradient(0, p.level - 12, 0, p.seabed + 4);
    g.addColorStop(0, 'rgba(120,225,242,0.6)');
    g.addColorStop(0.12, 'rgba(46,152,204,0.64)');
    g.addColorStop(0.55, 'rgba(24,88,152,0.76)');
    g.addColorStop(1, 'rgba(12,36,82,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    // Light shafts.
    const sc = p.right / 888;
    for (let i = 0; i < 5; i++) {
      const rx = (70 + i * 170 + Math.sin(p.t * 0.3 + i * 1.9) * 24) * sc;
      ctx.fillStyle = 'rgba(210,245,255,0.05)';
      ctx.beginPath();
      ctx.moveTo(rx - 9 * sc, p.level);
      ctx.lineTo(rx + 9 * sc, p.level);
      ctx.lineTo(rx + 52 * sc, p.bottom);
      ctx.lineTo(rx + 12 * sc, p.bottom);
      ctx.closePath();
      ctx.fill();
    }
    // Sun glitter reflected just under the surface.
    for (let i = 0; i < 8; i++) {
      const y = p.level + (7 + i * 8) * sc;
      const ww = Math.max(4, (54 - i * 6 + Math.sin(p.t * 3 + i * 1.3) * 9) * sc);
      ctx.fillStyle = 'rgba(255,220,160,' + (0.38 - i * 0.04).toFixed(3) + ')';
      ctx.fillRect(p.sunX - ww / 2 + Math.sin(p.t * 2 + i) * 4 * sc, y, ww, 2 * sc);
    }
    ctx.restore();
  }

  /* Translucent front swell + foam: drawn over the boats so their hulls sit in the water. */
  function drawSeaFront(ctx, p) {
    ctx.save();
    seaClip(ctx, p);
    const pts = [];
    for (let x = 0; ; x += p.step) {
      const xx = Math.min(x, p.right);
      pts.push(xx, p.level + 3 + p.amp * 0.75 * wave(xx * 1.2 + 60, p.t * 1.15));
      if (xx >= p.right) break;
    }
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
    for (let i = pts.length - 2; i >= 0; i -= 2) ctx.lineTo(pts[i], pts[i + 1] + 16);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, p.level - 4, 0, p.level + 20);
    g.addColorStop(0, 'rgba(120,220,245,0.5)');
    g.addColorStop(1, 'rgba(40,130,190,0)');
    ctx.fillStyle = g;
    ctx.fill();
    // Foam line on the true surface.
    ctx.beginPath();
    for (let x = 0; ; x += p.step) {
      const xx = Math.min(x, p.right);
      ctx.lineTo(xx, p.level + p.amp * wave(xx, p.t));
      if (xx >= p.right) break;
    }
    ctx.strokeStyle = 'rgba(236,250,255,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let x = 4; x < p.right; x += p.step * 1.5) {
      const crest = Math.sin(x * 0.09 + p.t * 2.2) + Math.sin(x * 0.031 - p.t);
      if (crest > 1.1) {
        const y = p.level + p.amp * wave(x, p.t);
        ctx.fillRect(x - 3, y - 2, 6 + (crest - 1.1) * 8, 1.6);
      }
    }
    ctx.restore();
  }

  function drawBoat(ctx, x, y, ang, color, label, a, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.scale(s || 1, s || 1);
    ctx.globalAlpha = a == null ? 1 : a;
    // Main sail in the boat's dock color, with the dock number.
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(2, -42);
    ctx.lineTo(2, -10);
    ctx.lineTo(-20, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#F6EEDC';
    ctx.beginPath();
    ctx.moveTo(5, -37);
    ctx.lineTo(5, -10);
    ctx.lineTo(18, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3B2A22';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3.5, -6);
    ctx.lineTo(3.5, -47);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(3.5, -47);
    ctx.lineTo(15, -44);
    ctx.lineTo(3.5, -41);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6B4330';
    ctx.beginPath();
    ctx.moveTo(-23, -8);
    ctx.lineTo(24, -10);
    ctx.quadraticCurveTo(18, 5, 10, 6);
    ctx.lineTo(-15, 6);
    ctx.quadraticCurveTo(-21, 2, -23, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-22.5, -6);
    ctx.lineTo(23, -8);
    ctx.lineTo(22, -4.5);
    ctx.lineTo(-21.8, -2.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = '700 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, -4, -18);
    ctx.restore();
  }

  /* A dock pier on the cliff face at x0, deck at sea height y, with its numbered flag. */
  function drawPier(ctx, x0, y, below, color, label, t, s, lit, on) {
    ctx.save();
    ctx.translate(x0, y);
    ctx.scale(s, s);
    const deck = -5;
    const bot = (below - y) / s;
    ctx.fillStyle = '#5A3B2A';
    ctx.fillRect(-PIER + 2, deck, 3, bot - deck);
    ctx.fillRect(-10, deck, 3, bot - deck);
    ctx.fillStyle = '#9A6A44';
    ctx.fillRect(-PIER, deck - 2, PIER, 4);
    ctx.fillStyle = '#D29C66';
    ctx.fillRect(-PIER, deck - 2, PIER, 1.2);
    ctx.fillStyle = U.alpha(color, on ? 0.7 : 0.3);
    ctx.fillRect(-2, -TOL, 3, TOL * 2);
    const px = -PIER + 3;
    const top = deck - 40;
    if (lit) {
      const gg = ctx.createRadialGradient(px + 10, top + 7, 2, px + 10, top + 7, 26);
      gg.addColorStop(0, U.alpha(color, 0.6));
      gg.addColorStop(1, U.alpha(color, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(px - 20, top - 20, 60, 54);
    }
    ctx.strokeStyle = '#EDE1C6';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(px, deck - 2);
    ctx.lineTo(px, top);
    ctx.stroke();
    const wv = Math.sin(t * 4 + x0 * 0.1) * 1.8;
    ctx.fillStyle = on ? color : U.alpha(color, 0.4);
    ctx.beginPath();
    ctx.moveTo(px, top);
    ctx.quadraticCurveTo(px + 10, top - 2 + wv, px + 20, top + 1 + wv);
    ctx.lineTo(px + 20, top + 13 + wv);
    ctx.quadraticCurveTo(px + 10, top + 10 + wv, px, top + 13);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.font = '700 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + 10, top + 7 + wv * 0.5);
    ctx.restore();
  }

  function drawHouse(ctx, x, base, w, h, roof, lit) {
    ctx.fillStyle = '#F1E4C6';
    ctx.fillRect(x - w / 2, base - h, w, h);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 3, base - h + 1);
    ctx.lineTo(x, base - h - w * 0.55);
    ctx.lineTo(x + w / 2 + 3, base - h + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lit ? C.gold : '#3A2D40';
    ctx.fillRect(x - 3, base - h + 5, 6, 6);
  }

  function drawVillageArt(ctx, cx, floor, ground, w, scorched) {
    ctx.strokeStyle = '#5A3B2A';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) {
      const sx = cx - w / 2 + 4 + i * (w - 8) / 3;
      ctx.beginPath();
      ctx.moveTo(sx, floor);
      ctx.lineTo(sx, ground);
      ctx.stroke();
    }
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(cx - w / 2 + 4, floor + 4);
    ctx.lineTo(cx + w / 2 - 4, ground - 4);
    ctx.moveTo(cx + w / 2 - 4, floor + 4);
    ctx.lineTo(cx - w / 2 + 4, ground - 4);
    ctx.stroke();
    ctx.fillStyle = '#8A5A3A';
    ctx.fillRect(cx - w / 2 - 3, floor - 4, w + 6, 5);
    const roofA = scorched ? '#3B3046' : C.p1;
    const roofB = scorched ? '#2E2638' : C.violet;
    drawHouse(ctx, cx - w * 0.22, floor - 4, w * 0.4, 15, roofA, !scorched);
    drawHouse(ctx, cx + w * 0.24, floor - 4, w * 0.36, 20, roofB, !scorched);
  }

  function drawFire(ctx, x, y, s, t, dim) {
    const h = 12 + 18 * s;
    if (!dim) {
      const g = ctx.createRadialGradient(x, y - h * 0.4, 2, x, y - h * 0.4, h * 1.5);
      g.addColorStop(0, 'rgba(255,170,60,0.45)');
      g.addColorStop(1, 'rgba(255,120,60,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y - h * 0.4, h * 1.5, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#4A2C1E';
    ctx.fillRect(x - 9, y - 3, 18, 3);
    const layers = [[C.p1, 1], [C.gold, 0.68], ['#FFF3C4', 0.36]];
    for (const [col, k] of layers) {
      ctx.fillStyle = dim ? U.alpha(col, 0.35) : col;
      const fh = h * k * (1 + Math.sin(t * 13 + x) * 0.08);
      const fw = (5 + 4 * s) * k + 2;
      const sway = Math.sin(t * 7 + x * 0.3) * 3 * k;
      ctx.beginPath();
      ctx.moveTo(x - fw, y - 2);
      ctx.quadraticCurveTo(x - fw, y - fh * 0.5, x + sway, y - fh);
      ctx.quadraticCurveTo(x + fw, y - fh * 0.5, x + fw, y - 2);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawWhale(ctx, x, y, t, a, dir) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#2C3F7A';
    const tw = Math.sin(t * 3) * 5;
    ctx.beginPath();
    ctx.moveTo(-40, -3);
    ctx.quadraticCurveTo(-58, -4 + tw, -70, -17 + tw);
    ctx.lineTo(-62, tw);
    ctx.lineTo(-72, 11 + tw);
    ctx.quadraticCurveTo(-56, 7 + tw, -40, 7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 48, 18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#9FB4E8';
    ctx.beginPath();
    ctx.ellipse(6, 8, 36, 7, 0, 0, Math.PI);
    ctx.fill();
    ctx.fillStyle = '#3E57A0';
    ctx.beginPath();
    ctx.ellipse(-6, 10, 12, 4, 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(31, -3, 2.3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawLockGlyph(ctx, x, y, s, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.arc(x, y - 3 * s, 4.5 * s, Math.PI, 0);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.fillRect(x - 7 * s, y - 3 * s, 14 * s, 10 * s);
  }

  function drawToken(ctx, x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 2) * 0.15);
    const g = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
    g.addColorStop(0, 'rgba(255,197,61,0.5)');
    g.addColorStop(1, 'rgba(255,197,61,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 12, i * Math.PI / 2, i * Math.PI / 2 + 0.35);
      ctx.stroke();
    }
    drawLockGlyph(ctx, 0, 0, 0.6, C.text);
    ctx.restore();
  }

  function drawHeart(ctx, x, y, r, fill) {
    ctx.beginPath();
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.4);
    ctx.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function fmtTime(s) {
    const n = Math.max(0, Math.floor(s));
    return Math.floor(n / 60) + ':' + String(n % 60).padStart(2, '0');
  }

  Arcade.register({
    id: 'tide-keeper',
    title: 'Tide Keeper',
    category: 'fresh',
    mode: 'solo',
    players: '1P',
    best: 'high',
    original: true,
    color: C.p2,
    tagline: 'Raise and lower the sea to bring boats home and put out fires.',
    hook: 'You control the sea level: float boats home and drown fires, but keep the villages dry.',
    tags: ['strategy', 'water', 'puzzle', 'physics', 'boats', 'fire', 'keyboard', 'touch', 'original'],
    howTo: 'You only control the sea level. Each boat flies a colored, numbered sail: when it reaches the cliffs, ' +
      'bring the sea to the dock with the same flag and hold it there a moment to moor it. Higher docks pay more; ' +
      'hold a boat at the wrong dock until its coral ring fills and it moors there for a penalty. Fires catch on the ledges and slowly spread: sink one under the sea for 1 second ' +
      'to douse it. But a stilt village floods if the water stays above its floor for 2 seconds, and a fire that grows ' +
      'on a village ledge burns it. Each costs one of your 3 hearts. Collect floating tide locks to seal the villages ' +
      'for 6 seconds, raise the sea for a visiting whale so it spouts on the fires, and brace for storms.',
    controls: [
      { keys: ['↑', '↓'], label: 'Raise / lower the sea' },
      { keys: ['W', 'S'], label: 'Raise / lower the sea' },
      { keys: ['Drag'], label: 'Pull the tide lever (or drag anywhere)' },
      { keys: ['Space'], label: 'Use a tide lock' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      const terr = [
        { x0: 172, x1: 212, top: 160 },
        { x0: 212, x1: 252, top: 128 },
        { x0: 252, x1: 290, top: 96 },
        { x0: 290, x1: 320, top: 64 }
      ];
      const seabed = 188;
      const lv = 140 + Math.sin(t * 0.9) * 2.5;
      drawSkyArt(ctx, 320, 200, 0, 66, 46);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      [[20, 18], [118, 30], [160, 12], [230, 24], [270, 40], [40, 70]].forEach(([x, y], i) => {
        ctx.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(t * 1.5 + i));
        ctx.fillRect(x, y, 1.6, 1.6);
      });
      ctx.globalAlpha = 1;
      const p = { right: 320, bottom: 200, level: lv, amp: 2.4, t, terr, seabed, step: 5, sunX: 66 };
      drawSeaBack(ctx, p);
      drawRock(ctx, terr, seabed, 200, 320);
      drawPier(ctx, 172, 176, seabed, C.p1, '1', t, 0.7, false, true);
      drawPier(ctx, 212, 146, 160, C.gold, '2', t, 0.7, true, true);
      drawPier(ctx, 252, 114, 128, C.mint, '3', t, 0.7, false, true);
      drawVillageArt(ctx, 272, 80, 96, 30, false);
      drawFire(ctx, 225, 128, 0.75, t, false);
      drawFire(ctx, 304, 64, 0.35, t, false);
      drawSea(ctx, p);
      const sy = (x) => lv + 2.4 * wave(x, t);
      drawBoat(ctx, 175, sy(175), 0, C.gold, '2', 1, 0.72);
      drawBoat(ctx, 112, sy(112), Math.sin(t * 1.3) * 0.05, C.mint, '3', 1, 0.72);
      drawBoat(ctx, 44, sy(44), Math.sin(t * 1.1 + 1) * 0.05, C.p1, '1', 1, 0.72);
      drawSeaFront(ctx, p);
      // "You move the water" arrows.
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(14, lv - 26); ctx.lineTo(21, lv - 16); ctx.lineTo(7, lv - 16);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, lv + 26); ctx.lineTo(21, lv + 16); ctx.lineTo(7, lv + 16);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(6, lv - 1, 16, 2.5);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'ending' | 'over'
      let time = 0;
      let elapsed = 0;
      let score = 0;
      let hearts = 3;
      let surv = 0;
      let level = 480;
      let vel = 0;
      let target = 480;
      let amp = 3.5;
      let mode = 'lever';  // 'keys' = velocity control, 'lever' = spring toward target
      let drag = null;
      let boats = [];
      let fires = [];
      let pending = [];
      let vills = [];
      let parts = [];
      let texts = [];
      let moored = [];
      let tokens = [];
      let whale = null;
      let locks = 0;
      let lockT = 0;
      let stormT = 0;
      let stormVis = 0;
      let lightT = 0;
      let flash = 0;
      let bolt = null;
      let shake = 0;
      let boatT = 0;
      let fireT = 0;
      let stormIn = 0;
      let whaleIn = 0;
      let tokenIn = 0;
      let docked = 0;
      let doused = 0;
      let wrong = 0;
      let unlocked = 3;
      let seen = {};
      let hintHold = 0;
      let lastStatus = '';
      let foamT = 0;

      const surf = (x) => level + amp * wave(x, time);
      const diff = () => U.clamp(elapsed / 240, 0, 1);
      const spotY = (s) => TERR[SPOTS[s].t].top;

      /* Index of the cliff face the sea currently washes against (5 = the back wall). */
      function shoreFace(lv) {
        for (let k = 0; k < TERR.length; k++) if (TERR[k].top < lv) return k;
        return TERR.length;
      }
      const faceX = (f) => (f < TERR.length ? TERR[f].x0 : PANEL_X);
      const contactX = (f) => (f < TERR.length ? TERR[f].x0 - PIER : PANEL_X - 6);

      function status(text) {
        if (text !== lastStatus) {
          lastStatus = text;
          api.setStatus(text);
        }
      }
      function hint(text, hold) {
        status(text);
        hintHold = hold == null ? 4 : hold;
      }
      function addScore(n) {
        score = Math.max(0, score + n);
        api.setScore(score);
      }
      function say(x, y, text, color) {
        texts.push({ x, y, text, color, life: 0 });
      }
      function emit(x, y, n, kind, color, spd) {
        for (let i = 0; i < n && parts.length < 560; i++) {
          const a = U.rand(0, TAU);
          const s = U.rand(0.3, 1) * (spd || 120);
          parts.push({
            x, y,
            vx: Math.cos(a) * s,
            vy: kind === 'drop' ? -Math.abs(Math.sin(a)) * s - 40 : Math.sin(a) * s * 0.4 - 20,
            life: 0,
            max: U.rand(0.6, 1.2) * (kind === 'steam' ? 1.6 : 1),
            r: kind === 'steam' ? U.rand(4, 8) : U.rand(1.5, 3),
            kind,
            color: color || '#FFFFFF'
          });
        }
      }

      function reset() {
        elapsed = 0;
        score = 0;
        hearts = 3;
        surv = 0;
        level = 495;
        vel = 0;
        target = 495;
        mode = 'keys';
        drag = null;
        boats = [];
        fires = [];
        pending = [];
        parts = [];
        texts = [];
        moored = [];
        tokens = [];
        vills = VILLAGES.map((v) => Object.assign({ meter: 0, immune: 0, scorch: 0, wet: false }, v));
        whale = null;
        locks = 0;
        lockT = 0;
        stormT = 0;
        lightT = 0;
        flash = 0;
        bolt = null;
        shake = 0;
        boatT = 1.2;
        fireT = 10;
        stormIn = U.rand(50, 65);
        whaleIn = U.rand(30, 40);
        tokenIn = U.rand(18, 26);
        docked = 0;
        doused = 0;
        wrong = 0;
        unlocked = 3;
        seen = {};
        hintHold = 0;
        api.setScore(0);
      }

      function startRun() {
        reset();
        state = 'play';
        hint('Hold ↑/↓ (W/S) or drag the tide lever. Bring each boat to the dock that flies its color.', 6);
        api.sfx('power');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Tide Keeper',
          text: 'You control the sea. Raise or lower it (↑/↓, W/S or drag the lever) so each boat meets the dock ' +
            'with its color, and sink fires for 1 second to douse them. Water above a village floor for 2 seconds ' +
            'floods it. Lose 3 hearts and the bay is lost.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function loseHeart() {
        hearts = Math.max(0, hearts - 1);
        shake = 0.6;
        if (hearts <= 0 && state === 'play') {
          state = 'ending';
          hint('The last heart is gone…', 10);
          api.after(1300, gameOver);
        }
      }

      function gameOver() {
        if (state !== 'ending') return;
        state = 'over';
        api.sfx('lose');
        const isBest = api.reportScore(score);
        status('Final score ' + score + '. Press Play again to keep a new bay.');
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'The bay is lost',
          text: 'Score ' + score + ': ' + docked + ' boat' + (docked === 1 ? '' : 's') + ' docked, ' +
            doused + ' fire' + (doused === 1 ? '' : 's') + ' doused, and you kept the villages for ' + fmtTime(elapsed) + '.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      function spawnBoat() {
        for (const b of boats) if (b.x < -40 + BOAT_HALF * 2 + 8) return false; // entrance is crowded
        let c = U.randInt(0, unlocked - 1);
        const last = boats.length ? boats[boats.length - 1].c : -1;
        if (c === last && Math.random() < 0.55) c = U.randInt(0, unlocked - 1);
        // Newly opened docks show up a little more often.
        if (unlocked > 3 && Math.random() < 0.25) c = unlocked - 1;
        boats.push({ x: -40, c, dwell: 0, dockF: -1, life: U.lerp(44, 34, diff()), atShore: false });
        return true;
      }

      function burning(s) {
        return fires.some((f) => f.s === s) || pending.some((p) => p.s === s);
      }

      function igniteRandom(delay, from) {
        // Early fires stay on the low ledges; later the high ones (harder to drown) join in.
        const free = [];
        let sum = 0;
        for (let i = 0; i < SPOTS.length; i++) {
          if (burning(i) || spotY(i) >= level - 10) continue;
          const t = SPOTS[i].t;
          const w = t <= 2 ? 1 : elapsed < 40 && from == null ? 0 : t === 3 ? 0.6 : 0.4;
          if (w > 0) {
            free.push([i, w]);
            sum += w;
          }
        }
        if (!free.length) return -1;
        let r = Math.random() * sum;
        let s = free[0][0];
        for (const [i, w] of free) {
          r -= w;
          if (r <= 0) {
            s = i;
            break;
          }
        }
        pending.push({ s, t: delay, t0: delay, from: from == null ? -1 : from });
        return s;
      }

      function villageOn(t) {
        return vills.find((v) => v.t === t) || null;
      }

      function douse(fi, viaWhale) {
        fi.dead = true;
        const sp = SPOTS[fi.s];
        const y = spotY(fi.s);
        const pts = 15 + (sp.t >= 3 ? 10 : 0);
        addScore(pts);
        doused++;
        emit(sp.x, Math.min(y, surf(sp.x)) - 4, 16, 'steam', '#E8EEFF', 60);
        if (!viaWhale) api.sfx('flip');
        say(sp.x, y - 34, 'Doused +' + pts, C.mint);
        if (!seen.douse) {
          seen.douse = true;
          hint('Hiss! Every doused fire scores. Fires on the high ledges pay extra.', 4);
        }
      }

      function burnVillage(v) {
        v.immune = 5;
        v.scorch = 6;
        v.meter = 0;
        api.sfx('boom');
        emit(v.x, v.floor - 16, 26, 'ember', C.gold, 90);
        say(v.x, v.floor - 60, 'Village burned! −1 ♥', C.p1);
        hint('A fire grew on a village ledge and burned it. Douse fires before they grow on village ledges.', 5);
        loseHeart();
      }

      function floodVillage(v) {
        v.immune = 4;
        v.meter = 0;
        api.sfx('boom');
        emit(v.x, v.floor - 6, 34, 'drop', '#CFF2FF', 190);
        say(v.x, v.floor - 60, 'Flooded! −1 ♥', C.p1);
        hint('A village flooded. Water may only touch a village floor for under 2 seconds.', 5);
        loseHeart();
      }

      function dockBoat(b, f) {
        boats.splice(boats.indexOf(b), 1);
        const d = DOCKS[f];
        emit(d.x - PIER, level, 12, 'drop', '#D8F4FF', 110);
        moored.push({ x: b.x, c: b.c, life: 0 });
        if (b.c === f) {
          const pts = 20 + 10 * f;
          addScore(pts);
          docked++;
          api.sfx('score');
          say(d.x - PIER, d.y - 58, 'Docked +' + pts, d.color);
          if (!seen.dock) {
            seen.dock = true;
            hint('Moored! Higher docks pay more, but mind the villages above.', 4);
          }
        } else {
          addScore(-10);
          wrong++;
          api.sfx('hit');
          say(d.x - PIER, d.y - 58, 'Wrong dock −10', C.p1);
          hint('That boat wanted the ' + DOCK_NAMES[b.c] + ' dock (' + (b.c + 1) + '). Wrong docks cost 10.', 4);
        }
      }

      function useLock() {
        if (state !== 'play' || locks <= 0 || lockT > 0) return;
        locks--;
        lockT = LOCK_TIME;
        api.sfx('power');
        hint('Tide lock! Floodgates shut for 6 s: the villages cannot flood and the waves calm down.', 4);
      }

      function startStorm() {
        stormT = 14;
        lightT = 1.2;
        api.sfx('boom');
        hint('Storm! Bigger waves and a surge that pushes the sea up. Watch the villages.', 5);
      }

      function strike(ignite) {
        flash = 1;
        api.sfx('boom');
        let tx = U.rand(60, PANEL_X - 60);
        let ty = Math.min(surf(tx), groundAt(tx));
        if (ignite) {
          const s = igniteRandom(0.3);
          if (s >= 0) {
            tx = SPOTS[s].x;
            ty = spotY(s);
          }
        }
        const pts = [];
        const sx = tx + U.rand(-60, 60);
        for (let i = 0; i <= 7; i++) {
          const k = i / 7;
          pts.push(U.lerp(sx, tx, k) + (i && i < 7 ? U.rand(-14, 14) : 0), k * ty);
        }
        bolt = { pts, life: 0.25 };
      }

      function groundAt(x) {
        if (x < TERR[0].x0) return SEABED;
        for (const tr of TERR) if (x >= tr.x0 && x < tr.x1) return tr.top;
        return 0;
      }

      /* ---------------- Update ---------------- */

      function update(dt) {
        time += dt;
        const play = state === 'play';
        const live = play || state === 'ending';
        if (play) elapsed += dt;
        const d = diff();
        hintHold -= dt;
        flash = Math.max(0, flash - dt * 2.5);
        shake = Math.max(0, shake - dt);
        if (bolt) {
          bolt.life -= dt;
          if (bolt.life <= 0) bolt = null;
        }

        // Sea level control: keys drive the water's speed, the lever pulls it toward a height.
        if (play) {
          const up = api.keys.has('ArrowUp') || api.keys.has('KeyW');
          const down = api.keys.has('ArrowDown') || api.keys.has('KeyS');
          if (up !== down) {
            mode = 'keys';
            drag = null;
            vel += ((up ? -230 : 230) - vel) * Math.min(1, dt * 7);
          } else if (mode === 'keys') {
            vel *= Math.exp(-dt * 9);
          }
        } else if (state === 'menu') {
          mode = 'lever';
          target = 465 + Math.sin(time * 0.4) * 50;
        } else {
          mode = 'keys';
          vel *= Math.exp(-dt * 3);
        }
        if (mode === 'lever') vel += ((target - level) * 22 - vel * 8.5) * dt;
        vel = U.clamp(vel, -260, 260);
        const surge = play && stormT > 0 && lockT <= 0 ? 7 : 0;
        level += (vel - surge) * dt;
        if (mode === 'lever') target = U.clamp(target - surge * dt, LV_TOP, LV_BOT);
        if (level < LV_TOP) {
          level = LV_TOP;
          if (vel < 0) vel = 0;
        }
        if (level > LV_BOT) {
          level = LV_BOT;
          if (vel > 0) vel = 0;
        }
        if (mode === 'keys') target = level;

        stormVis += ((stormT > 0 ? 1 : 0) - stormVis) * Math.min(1, dt * 1.2);
        const ampWant = (3.5 + d * 1.5 + stormVis * 9) * (lockT > 0 ? 0.35 : 1);
        amp += (ampWant - amp) * Math.min(1, dt * 1.5);

        // Spawns and events.
        if (play) {
          surv += dt;
          while (surv >= 1) {
            surv -= 1;
            addScore(1);
          }
          const nu = elapsed < 25 ? 3 : elapsed < 60 ? 4 : 5;
          if (nu > unlocked) {
            unlocked = nu;
            api.sfx('tick');
            hint('New boats are coming for the ' + DOCK_NAMES[nu - 1] + ' dock (' + nu + '), higher up the cliffs.', 5);
          }
          boatT -= dt;
          if (boatT <= 0) boatT = spawnBoat() ? U.lerp(8.5, 4.2, d) * U.rand(0.8, 1.2) : 1;
          fireT -= dt;
          if (fireT <= 0) {
            igniteRandom(1.3);
            fireT = U.lerp(17, 8, d) * U.rand(0.8, 1.25);
          }
          tokenIn -= dt;
          if (tokenIn <= 0) {
            tokens.push({ x: -30 });
            tokenIn = U.rand(34, 50);
          }
          if (!whale) {
            whaleIn -= dt;
            if (whaleIn <= 0) {
              whale = { x: -130, ph: 'in', t: 0, dir: 1, a: 1 };
              whaleIn = U.rand(55, 85);
            }
          }
          if (stormT <= 0) {
            stormIn -= dt;
            if (stormIn <= 0) {
              startStorm();
              stormIn = U.rand(55, 80) - d * 15;
            }
          }
          if (lockT > 0) {
            lockT -= dt;
            if (lockT <= 0) {
              lockT = 0;
              hint('The floodgates open again.', 3);
            }
          }
        }
        if (stormT > 0) {
          stormT -= dt;
          lightT -= dt;
          if (lightT <= 0) {
            lightT = U.rand(2.6, 5);
            strike(play && Math.random() < 0.5);
          }
        }

        const f = shoreFace(level);
        const current = U.lerp(38, 60, d);

        // Boats: drift in, queue against the shore; the front one moors when the sea matches a dock.
        if (live) {
          boats.sort((a, b) => b.x - a.x);
          let limit = contactX(f) - BOAT_HALF;
          for (let i = 0; i < boats.length; i++) {
            const b = boats[i];
            const sp = b.x > 360 ? Math.max(170, current * 2.4) : current; // the bay's inner current is quick
            const nx = b.x + sp * dt;
            b.x = nx <= limit ? nx : Math.max(limit, b.x - 300 * dt);
            b.atShore = i === 0 && b.x >= limit - 2;
            limit = b.x - BOAT_HALF * 2 - 6;
            if (i > 0) b.dwell = 0;
            if (play) b.life -= dt;
          }
          const fb = boats[0];
          if (play && fb) {
            if (fb.atShore && f < DOCKS.length && Math.abs(level - DOCKS[f].y) <= TOL) {
              if (fb.dockF !== f) {
                fb.dockF = f;
                fb.dwell = 0;
              }
              fb.dwell += dt;
              if (fb.dwell >= (fb.c === f ? DWELL : WRONG_DWELL)) dockBoat(fb, f);
            } else {
              fb.dwell = Math.max(0, fb.dwell - dt * 2);
            }
          }
          if (play) {
            for (let i = boats.length - 1; i >= 0; i--) {
              const b = boats[i];
              if (b.life > 0) continue;
              boats.splice(i, 1);
              addScore(-5);
              say(Math.max(30, b.x), surf(Math.max(30, b.x)) - 60, 'Gave up −5', C.muted);
              moored.push({ x: b.x, c: b.c, life: 0, away: true });
              api.sfx('tick');
              if (!seen.leave) {
                seen.leave = true;
                hint('Boats sail away if they wait too long. A flashing sail means it is nearly out of patience.', 5);
              }
            }
          }
        }

        // Floating tide-lock tokens ride the current to the shore.
        if (live) {
          for (let i = tokens.length - 1; i >= 0; i--) {
            const tk = tokens[i];
            tk.x += current * 1.3 * dt;
            if (tk.x >= contactX(f) - 8) {
              tokens.splice(i, 1);
              if (!play) continue;
              emit(tk.x, surf(tk.x), 14, 'ember', C.gold, 100);
              if (locks < 2) {
                locks++;
                api.sfx('power');
                say(tk.x, surf(tk.x) - 40, 'Tide lock +1', C.gold);
                if (!seen.token) {
                  seen.token = true;
                  hint('Tide lock collected! Press Space (or tap the lock under the lever) to seal the villages for 6 s.', 6);
                }
              } else {
                addScore(15);
                api.sfx('blip');
                say(tk.x, surf(tk.x) - 40, '+15', C.gold);
              }
            }
          }
        }

        // Fires: pending sparks, growth, spreading, dousing.
        if (play) {
          for (let i = pending.length - 1; i >= 0; i--) {
            const pd = pending[i];
            pd.t -= dt;
            if (pd.t > 0) continue;
            pending.splice(i, 1);
            const sp = SPOTS[pd.s];
            if (surf(sp.x) < spotY(pd.s) - 3) {
              emit(sp.x, spotY(pd.s) - 4, 5, 'steam', '#E8EEFF', 30);
              continue;
            }
            fires.push({ s: pd.s, size: 0.12, sub: 0 });
            api.sfx('tick');
            if (!seen.fire) {
              seen.fire = true;
              hint('A fire! Raise the sea over it and keep it under for 1 second to douse it.', 6);
            }
          }
          const growT = U.lerp(22, 12, d);
          for (const fi of fires) {
            const sp = SPOTS[fi.s];
            const y = spotY(fi.s);
            if (surf(sp.x) < y - 4) {
              fi.sub += dt;
              if (fi.sub >= SOAK_TIME) douse(fi);
              continue;
            }
            fi.sub = Math.max(0, fi.sub - dt * 0.35); // soaking progress lingers, so two quick dips work
            fi.size = Math.min(1, fi.size + dt / growT);
            if (Math.random() < dt * (2 + fi.size * 4)) emit(sp.x + U.rand(-5, 5), y - 10 - fi.size * 10, 1, 'ember', C.gold, 20);
            if (fi.size < 1) continue;
            const v = villageOn(sp.t);
            if (v) {
              if (v.immune <= 0) {
                fi.dead = true;
                burnVillage(v);
              }
            } else {
              const near = [fi.s - 1, fi.s + 1].filter((n) => n >= 0 && n < SPOTS.length && !burning(n) && spotY(n) < level - 8);
              if (near.length) {
                pending.push({ s: U.pick(near), t: 0.7, t0: 0.7, from: fi.s });
                fi.size = 0.55;
                if (!seen.spread) {
                  seen.spread = true;
                  hint('Fires spread along the ledges toward the villages. Douse them early.', 5);
                }
              } else {
                fi.size = 0.9;
              }
            }
          }
          fires = fires.filter((fi) => !fi.dead);
        }

        // Villages flood when water stays above their floor.
        for (const v of vills) {
          v.immune = Math.max(0, v.immune - dt);
          v.scorch = Math.max(0, v.scorch - dt);
          v.wet = surf(v.x) < v.floor;
          if (play && v.wet && lockT <= 0 && v.immune <= 0) {
            v.meter += dt / FLOOD_TIME;
            if (!seen.flood && v.meter > 0.12) {
              seen.flood = true;
              hint('Water in a village! Drop the sea below its floor within 2 seconds or it floods.', 5);
            }
            if (v.meter >= 1) floodVillage(v);
          } else {
            v.meter = Math.max(0, v.meter - dt * 0.6);
          }
        }

        // The whale waits offshore and rides in on high water.
        if (whale) {
          const wh = whale;
          if (wh.ph === 'in') {
            wh.x += 70 * dt;
            if (wh.x >= WHALE_WAIT_X) {
              wh.ph = 'wait';
              wh.t = 11;
              if (play && !seen.whale) {
                seen.whale = true;
                hint('A whale! Raise the sea above the dashed whale line and it rides in to spout on the fires.', 6);
              }
            }
          } else if (wh.ph === 'wait') {
            wh.t -= dt;
            wh.x = WHALE_WAIT_X + Math.sin(time * 0.8) * 8;
            if (play && level <= WHALE_LINE) {
              wh.ph = 'rush';
              api.sfx('power');
            } else if (wh.t <= 0 || !live) {
              wh.ph = 'leave';
            }
          } else if (wh.ph === 'rush') {
            const lim = contactX(f) - 52;
            wh.x = Math.min(wh.x + 320 * dt, Math.max(lim, WHALE_WAIT_X));
            if (wh.x >= lim - 1) {
              wh.ph = 'spout';
              wh.t = 1.4;
              if (play) {
                let n = 0;
                for (const fi of fires) {
                  if (Math.abs(SPOTS[fi.s].x - wh.x) < 240) {
                    douse(fi, true);
                    n++;
                  }
                }
                fires = fires.filter((fi) => !fi.dead);
                addScore(40);
                api.sfx('win');
                say(wh.x, surf(wh.x) - 80, 'Whale spout +40' + (n ? ' · ' + n + ' doused' : ''), C.p2);
              }
            }
          } else if (wh.ph === 'spout') {
            wh.t -= dt;
            if (Math.random() < 0.8) emit(wh.x + 26, surf(wh.x) - 12, 3, 'drop', '#DDF6FF', 220);
            if (wh.t <= 0) wh.ph = 'leave';
          } else {
            wh.dir = -1;
            wh.x -= 120 * dt;
            wh.a -= dt * 0.35;
            if (wh.x < -160 || wh.a <= 0) whale = null;
          }
        }

        // Particles, texts, ghosts, ambient bubbles and shore spray.
        for (const pt of parts) {
          pt.life += dt;
          if (pt.kind === 'drop') {
            pt.vy += 520 * dt;
            if (pt.vy > 0 && pt.y > surf(pt.x)) pt.life = pt.max;
          } else if (pt.kind === 'steam') {
            pt.vy -= 30 * dt;
            pt.vx *= 1 - dt;
            pt.r += dt * 10;
          } else if (pt.kind === 'ember') {
            pt.vy -= 20 * dt;
          } else if (pt.kind === 'bubble') {
            pt.vy = -42;
            pt.vx = Math.sin(time * 4 + pt.r * 10) * 10;
            if (pt.y < surf(pt.x) + 2) pt.life = pt.max;
          }
          pt.x += pt.vx * dt;
          pt.y += pt.vy * dt;
        }
        parts = parts.filter((pt) => pt.life < pt.max);
        for (const tx of texts) {
          tx.life += dt;
          tx.y -= 26 * dt;
        }
        texts = texts.filter((tx) => tx.life < 1.6);
        for (const m of moored) {
          m.life += dt;
          if (m.away) m.x -= 90 * dt;
        }
        moored = moored.filter((m) => m.life < 1.6);
        if (level < SEABED - 24 && Math.random() < dt * 3) {
          parts.push({ x: U.rand(10, 390), y: SEABED - 6, vx: 0, vy: -42, life: 0, max: 12, r: U.rand(1.5, 3), kind: 'bubble', color: '#FFFFFF' });
        }
        foamT -= dt * (1 + stormVis * 5);
        if (foamT <= 0) {
          foamT = 0.35;
          const fx = faceX(f) - 3;
          emit(fx, surf(fx), 2 + Math.round(stormVis * 3), 'drop', '#F2FBFF', 70 + stormVis * 90);
        }

        // Ongoing guidance in the status line.
        if (play && hintHold <= 0) {
          const fb = boats[0];
          if (fb) {
            const name = DOCK_NAMES[fb.c];
            status(fb.c === 4
              ? 'Lead boat flies violet 5: that dock floods the low village. Let it reach the cliff at cyan 4, then surge up and back.'
              : 'Lead boat flies ' + name + ' ' + (fb.c + 1) + ': bring the sea to the ' + name + ' dock and hold it there.');
          } else if (fires.length) {
            status('Sink fires under the sea for 1 second. Keep water off the villages for more than 2 seconds.');
          } else {
            status('Boats are on their way. Hold ↑/↓ or drag the lever to set the sea level.');
          }
        }
      }

      /* ---------------- Draw ---------------- */

      function drawBackdrop() {
        drawSkyArt(ctx, PANEL_X, H, stormVis, 170, 78);
        for (const s of STARS) {
          ctx.fillStyle = 'rgba(255,255,255,' + ((0.25 + 0.35 * Math.abs(Math.sin(time * 0.9 + s.p))) * (1 - stormVis)).toFixed(3) + ')';
          ctx.fillRect(s.x, s.y, s.r * 2, s.r * 2);
        }
        for (let i = 0; i < 4; i++) {
          const cx = ((i * 260 + time * (8 + i * 3)) % (PANEL_X + 240)) - 120;
          const cy = 60 + i * 38;
          ctx.fillStyle = stormVis > 0.3 ? 'rgba(60,56,96,' + (0.35 + stormVis * 0.4).toFixed(3) + ')' : 'rgba(255,200,220,0.1)';
          ctx.beginPath();
          ctx.moveTo(cx + 70, cy);
          ctx.ellipse(cx, cy, 70, 14, 0, 0, TAU);
          ctx.moveTo(cx + 74, cy - 8);
          ctx.ellipse(cx + 34, cy - 8, 40, 12, 0, 0, TAU);
          ctx.moveTo(cx + 4, cy - 5);
          ctx.ellipse(cx - 30, cy - 5, 34, 10, 0, 0, TAU);
          ctx.fill();
        }
      }

      function drawWeeds() {
        ctx.strokeStyle = '#3E8E5E';
        ctx.lineWidth = 3;
        for (const wx of WEEDS) {
          ctx.beginPath();
          ctx.moveTo(wx, SEABED + 2);
          for (let k = 1; k <= 5; k++) {
            ctx.lineTo(wx + Math.sin(time * 1.4 + wx + k * 0.8) * k * 1.6, SEABED + 2 - k * 9);
          }
          ctx.stroke();
        }
      }

      function drawDocks() {
        const f = shoreFace(level);
        DOCKS.forEach((dk, k) => {
          const below = k === 0 ? SEABED : TERR[k - 1].top;
          const lit = f === k && Math.abs(level - dk.y) <= TOL;
          drawPier(ctx, dk.x, dk.y, below, dk.color, String(k + 1), time, 1, lit, k < unlocked || state !== 'play');
        });
      }

      function drawVillages() {
        for (const v of vills) {
          drawVillageArt(ctx, v.x, v.floor, TERR[v.t].top, v.w, v.scorch > 0);
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = U.alpha(C.p1, v.wet ? 0.9 : 0.4);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(v.x - v.w / 2 - 8, v.floor + 1);
          ctx.lineTo(v.x + v.w / 2 + 8, v.floor + 1);
          ctx.stroke();
          ctx.setLineDash([]);
          if (v.scorch > 0 && Math.random() < 0.3) emit(v.x + U.rand(-12, 12), v.floor - 24, 1, 'steam', '#6E6680', 20);
        }
      }

      function drawFires() {
        for (const fi of fires) {
          const sp = SPOTS[fi.s];
          const y = spotY(fi.s);
          const under = surf(sp.x) < y - 4;
          drawFire(ctx, sp.x, y, 0.3 + fi.size * 0.9, time, under);
        }
        for (const pd of pending) {
          const sp = SPOTS[pd.s];
          const k = 1 - Math.max(0, pd.t) / pd.t0;
          let x, y;
          if (pd.from >= 0) {
            const a = SPOTS[pd.from];
            x = U.lerp(a.x, sp.x, k);
            y = U.lerp(spotY(pd.from), spotY(pd.s), k) - 10 - Math.sin(k * Math.PI) * 34;
          } else {
            x = sp.x + (1 - k) * 70;
            y = U.lerp(36, spotY(pd.s) - 4, k);
          }
          ctx.fillStyle = U.alpha(C.gold, 0.35);
          ctx.beginPath();
          ctx.arc(x, y, 7, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#FFF3C4';
          ctx.beginPath();
          ctx.arc(x, y, 2.6, 0, TAU);
          ctx.fill();
        }
      }

      function drawBoats() {
        for (const m of moored) {
          const a = Math.max(0, 1 - m.life / 1.6);
          drawBoat(ctx, m.x, surf(m.x) - (m.away ? 0 : m.life * 8), 0, DOCK_COLORS[m.c], String(m.c + 1), a, 1);
        }
        for (const b of boats) {
          const y = surf(b.x);
          const ang = Math.atan2(surf(b.x + 12) - surf(b.x - 12), 24) * 0.9;
          const blink = b.life < 8 && Math.sin(time * 14) > 0;
          drawBoat(ctx, b.x, y, ang, blink ? '#F3F0FF' : DOCK_COLORS[b.c], String(b.c + 1), 1, 1);
          if (b.life < 12 && state === 'play') {
            ctx.fillStyle = U.alpha(C.ink, 0.7);
            ctx.fillRect(b.x - 16, y - 62, 32, 5);
            ctx.fillStyle = C.p1;
            ctx.fillRect(b.x - 15, y - 61, 30 * U.clamp(b.life / 12, 0, 1), 3);
          }
        }
        for (const tk of tokens) drawToken(ctx, tk.x, surf(tk.x) - 3, time);
      }

      function drawShoreFoam() {
        const f = shoreFace(level);
        const fx = faceX(f);
        for (let i = 0; i < 6; i++) {
          const x = fx - 3 - i * 4.5;
          const y = surf(x) - 1 + Math.sin(time * 6 + i * 1.7) * 1.6;
          ctx.fillStyle = 'rgba(245,252,255,' + (0.8 - i * 0.11).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(x, y, 3.2 - i * 0.35, 0, TAU);
          ctx.fill();
        }
      }

      function ring(x, y, r, k, color, width) {
        ctx.strokeStyle = U.alpha(C.ink, 0.55);
        ctx.lineWidth = width + 2;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * U.clamp(k, 0, 1));
        ctx.stroke();
      }

      function drawOverlays() {
        const play = state === 'play';
        // Guidance: dashed line at the lead boat's dock height.
        const fb = boats[0];
        if (play && fb) {
          const dk = DOCKS[fb.c];
          ctx.setLineDash([7, 7]);
          ctx.lineDashOffset = -time * 20;
          ctx.strokeStyle = U.alpha(dk.color, 0.55);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(Math.max(0, fb.x + BOAT_HALF + 4), dk.y);
          ctx.lineTo(dk.x - PIER - 2, dk.y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          if (fb.dwell > 0 && fb.dockF >= 0) {
            const at = DOCKS[fb.dockF];
            const ok = fb.c === fb.dockF;
            ring(at.x - PIER + 13, at.y - 38, 17, fb.dwell / (ok ? DWELL : WRONG_DWELL), ok ? C.mint : C.p1, 3);
          }
        }
        // Whale line.
        if (whale && (whale.ph === 'in' || whale.ph === 'wait')) {
          ctx.setLineDash([10, 8]);
          ctx.strokeStyle = 'rgba(220,240,255,0.6)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, WHALE_LINE);
          ctx.lineTo(TERR[0].x0 + 60, WHALE_LINE);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = SMALL;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = 'rgba(220,240,255,0.85)';
          ctx.fillText('WHALE LINE: raise the sea here', 12, WHALE_LINE - 5);
        }
        // Douse progress on drowned fires.
        for (const fi of fires) {
          if (fi.sub <= 0) continue;
          ring(SPOTS[fi.s].x, spotY(fi.s) - 14, 12, fi.sub / SOAK_TIME, C.mint, 3);
        }
        // Fires about to spread or burn get a warning pulse.
        for (const fi of fires) {
          if (fi.size < 0.75 || fi.sub > 0) continue;
          const sp = SPOTS[fi.s];
          ctx.strokeStyle = U.alpha(C.p1, 0.4 + 0.4 * Math.abs(Math.sin(time * 8)));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sp.x, spotY(fi.s) - 14, 20, 0, TAU);
          ctx.stroke();
        }
        // Village flood meters, immunity and floodgates.
        for (const v of vills) {
          const top = v.floor - 56;
          if (lockT > 0) {
            ctx.fillStyle = U.alpha(C.gold, 0.14);
            ctx.strokeStyle = U.alpha(C.gold, 0.8);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(v.x, v.floor + 2, v.w / 2 + 12, Math.PI, 0);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          if (v.meter > 0) {
            ring(v.x, top, 11, v.meter, C.p1, 4);
            ctx.fillStyle = Math.sin(time * 16) > 0 ? C.p1 : C.text;
            ctx.font = '800 13px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('!', v.x, top + 1);
          } else if (v.immune > 0) {
            ring(v.x, top, 9, v.immune / 5, U.alpha(C.mint, 0.7), 2);
          }
        }
      }

      function drawParticles() {
        for (const pt of parts) {
          const k = pt.life / pt.max;
          if (pt.kind === 'steam') {
            ctx.fillStyle = U.alpha(pt.color, (1 - k) * 0.45);
          } else if (pt.kind === 'bubble') {
            ctx.fillStyle = 'rgba(220,245,255,0.35)';
          } else if (pt.kind === 'ember') {
            ctx.fillStyle = U.alpha(pt.color, (1 - k) * (0.6 + 0.4 * Math.sin(pt.life * 30)));
          } else {
            ctx.fillStyle = U.alpha(pt.color, Math.min(1, (1 - k) * 1.4));
          }
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.r, 0, TAU);
          ctx.fill();
        }
      }

      function drawTexts() {
        ctx.font = '700 15px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const tx of texts) {
          const a = Math.min(1, (1.6 - tx.life) * 2);
          ctx.fillStyle = U.alpha(C.ink, a * 0.6);
          ctx.fillText(tx.text, U.clamp(tx.x, 90, PANEL_X - 90) + 1, tx.y + 1);
          ctx.fillStyle = U.alpha(tx.color, a);
          ctx.fillText(tx.text, U.clamp(tx.x, 90, PANEL_X - 90), tx.y);
        }
      }

      function drawWeather() {
        if (stormVis > 0.05) {
          ctx.strokeStyle = 'rgba(190,210,255,' + (0.38 * stormVis).toFixed(3) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          for (let i = 0; i < 90; i++) {
            const x = ((i * 53.7 + time * 140) % (PANEL_X + 80)) - 40;
            const y = ((i * 131.3 + time * 720) % (H + 40)) - 20;
            ctx.moveTo(x, y);
            ctx.lineTo(x - 5, y + 15);
          }
          ctx.stroke();
        }
        if (bolt) {
          ctx.strokeStyle = 'rgba(240,244,255,' + Math.min(1, bolt.life * 5).toFixed(3) + ')';
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let i = 0; i < bolt.pts.length; i += 2) ctx.lineTo(bolt.pts[i], bolt.pts[i + 1]);
          ctx.stroke();
        }
      }

      function drawPanel() {
        const cx = 924;
        ctx.fillStyle = C.panel;
        ctx.fillRect(PANEL_X, 0, W - PANEL_X, H);
        ctx.fillStyle = C.line;
        ctx.fillRect(PANEL_X, 0, 2, H);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.fillText('TIDE', cx, 20);
        ctx.font = HUD;
        ctx.fillStyle = C.p2;
        ctx.fillText(((LV_BOT - level) / PX_PER_M).toFixed(1) + 'm', cx, 44);
        ctx.font = SMALL;
        ctx.fillStyle = Math.abs(vel) > 12 ? C.text : U.alpha(C.muted, 0.5);
        ctx.fillText(vel < -12 ? '▲ rising' : vel > 12 ? '▼ falling' : '· steady', cx, 66);
        if (stormT > 0 && lockT <= 0 && state === 'play') {
          ctx.fillStyle = C.p1;
          ctx.fillText('surge', cx, 84);
        }
        // Track with the water inside it.
        ctx.fillStyle = C.ink;
        U.roundRect(ctx, cx - 6, LV_TOP - 8, 12, LV_BOT - LV_TOP + 16, 6);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.p2, 0.6);
        U.roundRect(ctx, cx - 5, level, 10, LV_BOT + 7 - level, 5);
        ctx.fill();
        // Dock bands on the left of the track, village floors on the right.
        ctx.font = '700 10px "JetBrains Mono", monospace';
        DOCKS.forEach((dk, k) => {
          const on = k < unlocked || state !== 'play';
          ctx.fillStyle = U.alpha(dk.color, on ? 0.95 : 0.3);
          U.roundRect(ctx, PANEL_X + 6, dk.y - TOL, 16, TOL * 2, 3);
          ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.fillText(String(k + 1), PANEL_X + 14, dk.y + 0.5);
        });
        for (const v of vills) {
          ctx.fillStyle = v.wet ? C.p1 : U.alpha(C.p1, 0.6);
          ctx.fillRect(cx + 9, v.floor - 1, 16, 3);
          ctx.beginPath();
          ctx.moveTo(cx + 12, v.floor - 3);
          ctx.lineTo(cx + 17, v.floor - 9);
          ctx.lineTo(cx + 22, v.floor - 3);
          ctx.closePath();
          ctx.fill();
        }
        if (whale && (whale.ph === 'in' || whale.ph === 'wait')) {
          ctx.fillStyle = 'rgba(220,240,255,0.85)';
          ctx.fillRect(cx + 9, WHALE_LINE - 1, 16, 2);
        }
        // Lead boat's wanted dock.
        const fb = boats[0];
        if (fb && state === 'play') {
          const dk = DOCKS[fb.c];
          const bob = Math.sin(time * 6) * 2;
          ctx.fillStyle = dk.color;
          ctx.beginPath();
          ctx.moveTo(PANEL_X + 3 + bob, dk.y);
          ctx.lineTo(PANEL_X - 5 + bob, dk.y - 6);
          ctx.lineTo(PANEL_X - 5 + bob, dk.y + 6);
          ctx.closePath();
          ctx.fill();
        }
        // The lever knob (target height) and the actual level marker.
        const ky = mode === 'lever' ? target : level;
        ctx.fillStyle = U.alpha(C.ink, 0.5);
        U.roundRect(ctx, cx - 24, ky - 11, 48, 26, 8);
        ctx.fill();
        ctx.fillStyle = drag ? C.gold : C.text;
        U.roundRect(ctx, cx - 24, ky - 13, 48, 26, 8);
        ctx.fill();
        ctx.strokeStyle = U.alpha(C.ink, 0.45);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(cx - 12, ky + i * 5);
          ctx.lineTo(cx + 12, ky + i * 5);
        }
        ctx.stroke();
        ctx.fillStyle = C.p2;
        ctx.beginPath();
        ctx.moveTo(cx - 7, level);
        ctx.lineTo(cx - 13, level - 5);
        ctx.lineTo(cx - 13, level + 5);
        ctx.closePath();
        ctx.fill();
        // Tide lock button.
        const ready = locks > 0 && lockT <= 0 && state === 'play';
        ctx.fillStyle = lockT > 0 ? U.alpha(C.gold, 0.9) : ready ? C.panel2 : U.alpha(C.panel2, 0.5);
        U.roundRect(ctx, PANEL_X + 8, LOCK_Y + 2, 56, 36, 9);
        ctx.fill();
        ctx.strokeStyle = ready ? U.alpha(C.gold, 0.6 + 0.4 * Math.abs(Math.sin(time * 3))) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (lockT > 0) {
          ctx.fillStyle = C.ink;
          ctx.font = HUD;
          ctx.fillText(lockT.toFixed(1), cx, LOCK_Y + 20);
        } else {
          drawLockGlyph(ctx, cx - 9, LOCK_Y + 20, 0.9, ready ? C.gold : C.muted);
          ctx.fillStyle = ready ? C.gold : C.muted;
          ctx.font = '700 13px "JetBrains Mono", monospace';
          ctx.fillText('×' + locks, cx + 12, LOCK_Y + 21);
        }
      }

      function drawHud() {
        ctx.textBaseline = 'middle';
        for (let i = 0; i < 3; i++) {
          drawHeart(ctx, 22 + i * 26, 22, 9, i < hearts ? C.p1 : U.alpha(C.muted, 0.3));
        }
        ctx.font = HUD;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText(fmtTime(elapsed), 98, 22);
        const chips = [];
        if (stormT > 0) chips.push(['STORM ' + Math.ceil(stormT) + 's', C.violet]);
        if (lockT > 0) chips.push(['FLOODGATES ' + lockT.toFixed(1) + 's', C.gold]);
        if (whale && whale.ph !== 'leave') chips.push(['WHALE', C.p2]);
        let x = 170;
        ctx.font = SMALL;
        for (const [label, col] of chips) {
          const w = label.length * 7.4 + 18;
          ctx.fillStyle = U.alpha(col, 0.22);
          U.roundRect(ctx, x, 11, w, 22, 11);
          ctx.fill();
          ctx.fillStyle = col;
          ctx.textAlign = 'center';
          ctx.fillText(label, x + w / 2, 22.5);
          x += w + 8;
        }
        ctx.textAlign = 'right';
        ctx.font = HUD;
        ctx.fillStyle = U.alpha(C.ink, 0.6);
        ctx.fillText('SEA ' + ((LV_BOT - level) / PX_PER_M).toFixed(1) + ' m', PANEL_X - 13, 23);
        ctx.fillStyle = C.p2;
        ctx.fillText('SEA ' + ((LV_BOT - level) / PX_PER_M).toFixed(1) + ' m', PANEL_X - 14, 22);
        if (state === 'ending' || state === 'over') {
          ctx.fillStyle = U.alpha(C.ink, 0.45);
          ctx.fillRect(0, 0, PANEL_X, H);
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.p1;
          ctx.fillText('Bay lost', PANEL_X / 2, 130);
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-1, 1) * shake * 8, U.rand(-1, 1) * shake * 8);
        drawBackdrop();
        const p = { right: PANEL_X, bottom: H, level, amp, t: time, terr: TERR, seabed: SEABED, step: 8, sunX: 170 };
        drawSeaBack(ctx, p);
        drawRock(ctx, TERR, SEABED, H, PANEL_X);
        drawWeeds();
        drawDocks();
        drawVillages();
        drawFires();
        if (whale) drawWhale(ctx, whale.x, surf(whale.x) + 9, time, Math.max(0, whale.a), whale.dir);
        drawSea(ctx, p);
        drawBoats();
        drawSeaFront(ctx, p);
        drawShoreFoam();
        drawOverlays();
        drawParticles();
        drawTexts();
        drawWeather();
        ctx.restore();
        drawPanel();
        drawHud();
        if (flash > 0) {
          ctx.fillStyle = 'rgba(235,240,255,' + (flash * 0.35).toFixed(3) + ')';
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------------- Input ---------------- */

      api.on(window, 'keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'Space' || e.code === 'Enter') useLock();
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        if (p.x >= PANEL_X && p.y >= LOCK_Y) {
          useLock();
          return;
        }
        mode = 'lever';
        if (p.x >= PANEL_X - 10) {
          // Grab the lever: the knob jumps to the pointer height.
          drag = { abs: true, y0: p.y, t0: p.y };
          target = U.clamp(p.y, LV_TOP, LV_BOT);
        } else {
          // Anywhere else: push the sea up or down relative to where you grabbed.
          drag = { abs: false, y0: p.y, t0: target };
        }
      });
      api.on(window, 'pointermove', (e) => {
        if (!drag || state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        target = U.clamp(drag.abs ? p.y : drag.t0 + (p.y - drag.y0), LV_TOP, LV_BOT);
      });
      api.on(window, 'pointerup', () => { drag = null; });
      api.on(window, 'pointercancel', () => { drag = null; });

      reset();
      level = 470;
      target = 470;
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
