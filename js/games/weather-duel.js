/* Weather Duel: two weather spirits tend one shared garden. Hook: a seed blooms for whoever gives it the
   last bit of rain or sun it needs, and a flower that gets too much of either wilts back into a seed. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const TAU = Math.PI * 2;
  const W = 960;
  const H = 600;
  const HUD_H = 50;
  const GX = 14;
  const GY = 58;
  const GW = W - GX * 2;
  const GH = H - GY - 12;
  const COLS = 8;
  const ROWS = 5;
  const ROUND_TIME = 75;
  const WIN_ROUNDS = 2;          // best of 3
  const MAX_ROUNDS = 5;          // tie rounds can't drag a match on forever
  const SPEED = 235;
  const BODY_R = 24;
  const R_FULL = 40;             // full-strength weather radius
  const R_MAX = 78;              // weather fades out to this radius
  const RATE = 0.62;             // seed meter per second at full strength
  const STRESS = 0.5;            // rival flood / scorch per second on a flower
  const SOOTHE = 0.9;            // owner's own weather calms a flower this fast
  const RELAX = 0.1;             // flowers slowly recover on their own
  const FRESH = 1.5;             // a new bloom is safe for this long
  const FLOAT = 36;              // spirit body height above its ground spot
  const DOUBLE_TAP = 0.3;
  const MAX_PARTS = 700;
  const WATER = '#7DB7FF';
  const EMBER = '#FF9A3D';
  const SOIL = '#4A3123';
  const SOIL_HI = '#6A4733';
  const GRASS = '#163626';
  const GRASS2 = '#1D4430';
  const LEAF = '#3FA866';
  const LEAF_DK = '#2B7A4A';
  const RAINBOW = [C.p1, C.gold, C.mint, C.p2, C.violet];
  const RECIPES = [{ w: 1.5, l: 0.6 }, { w: 0.6, l: 1.5 }, { w: 1.0, l: 1.0 }];
  const LEVELS = {
    easy: { think: 1.3, react: 0.8, speed: 0.62, noise: 0.7, sabotage: 0.2, defend: 0.1, pickup: 0.4, gust: 0.2, rest: 1.6, wander: 0.45 },
    normal: { think: 0.45, react: 0.25, speed: 0.9, noise: 0.22, sabotage: 0.8, defend: 0.7, pickup: 1, gust: 0.7, rest: 0.35, wander: 0.06 },
    hard: { think: 0.18, react: 0.08, speed: 1, noise: 0.04, sabotage: 1, defend: 1, pickup: 1.2, gust: 1, rest: 0, wander: 0 }
  };

  const easeBack = (x) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);

  function oval(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
  }

  // Circle added to the current path (no beginPath, so several batch into one fill).
  function dot(ctx, x, y, r) {
    ctx.moveTo(x + r, y);
    ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  }

  function dropPath(ctx, x, y, r) {
    const a = Math.acos(1 / 1.7);
    ctx.beginPath();
    ctx.moveTo(x, y - r * 1.7);
    ctx.arc(x, y, r, -Math.PI / 2 + a, Math.PI * 1.5 - a);
    ctx.closePath();
  }

  /* Recipe pip: a drop (rain) or a little sun, sized by how much the seed needs, filled by how much it has. */
  function drawPip(ctx, x, y, r, frac, water, t) {
    const col = water ? WATER : C.gold;
    const full = frac >= 0.999;
    if (!water) {
      ctx.strokeStyle = U.alpha(C.gold, full ? 0.95 : 0.5);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8 + (full ? t : 0);
        ctx.moveTo(x + Math.cos(a) * (r + 2), y + Math.sin(a) * (r + 2));
        ctx.lineTo(x + Math.cos(a) * (r + 4.5), y + Math.sin(a) * (r + 4.5));
      }
      ctx.stroke();
    }
    if (water) dropPath(ctx, x, y, r);
    else {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
    }
    ctx.fillStyle = 'rgba(12,10,30,0.78)';
    ctx.fill();
    if (frac > 0) {
      const top = water ? y - r * 1.7 : y - r;
      const hh = (y + r - top) * Math.min(1, frac);
      ctx.save();
      ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(x - r - 1, y + r - hh, r * 2 + 2, hh + 1);
      ctx.restore();
    }
    ctx.strokeStyle = full ? '#FFFFFF' : col;
    ctx.lineWidth = full ? 2 : 1.5;
    ctx.stroke();
  }

  function drawSprout(ctx, x, y, prog, t) {
    if (prog < 0.04) {
      ctx.fillStyle = '#C9A36B';
      oval(ctx, x, y, 4.5, 3, -0.3);
      ctx.fill();
      return;
    }
    const h = 5 + prog * 20;
    const sway = Math.sin(t * 2 + x * 0.05) * 1.6 * prog;
    ctx.strokeStyle = LEAF;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x, y - h * 0.6, x + sway, y - h);
    ctx.stroke();
    if (prog > 0.25) {
      const ls = 2 + Math.min(1, (prog - 0.25) / 0.4) * 4;
      ctx.fillStyle = LEAF;
      oval(ctx, x - ls * 0.9, y - h * 0.45, ls, ls * 0.5, -0.5);
      ctx.fill();
      oval(ctx, x + ls * 0.9 + sway * 0.4, y - h * 0.6, ls, ls * 0.5, 0.5);
      ctx.fill();
    }
    if (prog > 0.7) {
      ctx.fillStyle = LEAF_DK;
      oval(ctx, x + sway, y - h - 2, 3 + (prog - 0.7) * 6, 4 + (prog - 0.7) * 8, 0);
      ctx.fill();
    }
  }

  function drawFlower(ctx, x, y, color, sc, droop, flood, scorch) {
    const hgt = 26 * (0.55 + 0.45 * Math.min(1, sc));
    const hx = x + droop * 12;
    const hy = y - hgt + droop * 9;
    ctx.strokeStyle = scorch > 0.5 ? '#7C7A3A' : LEAF;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x, y - hgt * 0.6, hx, hy);
    ctx.stroke();
    ctx.fillStyle = LEAF;
    oval(ctx, x - 6, y - 9, 6, 2.8, -0.5);
    ctx.fill();
    oval(ctx, x + 6, y - 13, 6, 2.8, 0.5);
    ctx.fill();
    const s = sc * (1 - scorch * 0.3);
    if (s <= 0.01) return;
    const tint = flood > scorch ? U.alpha(WATER, Math.min(1, flood) * 0.7) : U.alpha('#6B3A1A', Math.min(1, scorch) * 0.75);
    for (let k = 0; k < 6; k++) {
      const a = k * TAU / 6 + 0.3;
      oval(ctx, hx + Math.cos(a) * 7 * s, hy + Math.sin(a) * 6 * s, 6.5 * s, 4 * s, a);
      ctx.fillStyle = color;
      ctx.fill();
      if (flood > 0.05 || scorch > 0.05) {
        ctx.fillStyle = tint;
        ctx.fill();
      }
    }
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    dot(ctx, hx, hy, 4.2 * s);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    dot(ctx, hx - 1.3 * s, hy - 1.3 * s, 1.5 * s);
    ctx.fill();
  }

  /* A seed plot: soil mound, sprout or flower, recipe pips (seeds) or stress ring (flowers). */
  function drawPlot(ctx, p, t) {
    const x = p.x, y = p.y;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    oval(ctx, x + 2, y + 7, 27, 10);
    ctx.fill();
    ctx.fillStyle = SOIL;
    oval(ctx, x, y + 3, 24, 9);
    ctx.fill();
    const wet = p.owner ? 0.4 : p.water / p.needW;
    if (wet > 0.02) {
      ctx.fillStyle = U.alpha('#1A1030', Math.min(1, wet) * 0.45);
      ctx.fill();
    }
    ctx.fillStyle = SOIL_HI;
    oval(ctx, x - 5, y + 1, 12, 3.5);
    ctx.fill();
    if (!p.owner) {
      const prog = (p.water + p.light) / (p.needW + p.needL);
      if (prog > 0.75) {
        ctx.strokeStyle = U.alpha(C.text, 0.25 + 0.2 * Math.sin(t * 6 + x));
        ctx.lineWidth = 2;
        oval(ctx, x, y + 3, 29, 12);
        ctx.stroke();
      }
      drawSprout(ctx, x, y, prog, t);
      drawPip(ctx, x - 34, y + 3, 3.4 + p.needW * 3.8, p.water / p.needW, true, t);
      drawPip(ctx, x + 34, y + 3, 3.4 + p.needL * 3.8, p.light / p.needL, false, t);
    } else {
      const color = p.owner === 1 ? C.p1 : C.p2;
      const age = t - p.bloomT;
      const sc = age < 0.5 ? easeBack(U.clamp(age / 0.5, 0, 1)) : 1;
      const st = Math.max(p.flood, p.scorch);
      const wob = st > 0.6 ? Math.sin(t * 30 + x) * 2.5 * (st - 0.6) / 0.4 : 0;
      // Stress ring: flood fills the left half (water side), scorch the right half (sun side).
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      oval(ctx, x, y + 3, 31, 13);
      ctx.stroke();
      if (p.flood > 0.01) {
        ctx.strokeStyle = WATER;
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 31, 13, 0, Math.PI / 2, Math.PI / 2 + Math.min(1, p.flood) * Math.PI);
        ctx.stroke();
      }
      if (p.scorch > 0.01) {
        ctx.strokeStyle = EMBER;
        ctx.beginPath();
        ctx.ellipse(x, y + 3, 31, 13, 0, Math.PI / 2, Math.PI / 2 - Math.min(1, p.scorch) * Math.PI, true);
        ctx.stroke();
      }
      drawFlower(ctx, x + wob, y, color, sc, p.flood * 0.8, p.flood, p.scorch);
      if (p.fresh > 0) {
        ctx.strokeStyle = U.alpha('#FFFFFF', 0.55 * p.fresh / FRESH);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x + wob, y - 22, 15 + (1 - p.fresh / FRESH) * 6, 0, TAU);
        ctx.stroke();
      }
    }
  }

  const PUFFS = [[-17, 3, 12], [-6, -6, 14], [8, -5, 13], [18, 4, 11], [0, 6, 13]];

  function drawCloud(ctx, x, y, s, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const pf of PUFFS) dot(ctx, pf[0], pf[1], pf[2] + 3);
    ctx.fill();
    ctx.fillStyle = '#DDE6FB';
    ctx.beginPath();
    for (const pf of PUFFS) dot(ctx, pf[0], pf[1], pf[2]);
    ctx.fill();
    ctx.fillStyle = '#B9C8EC';
    oval(ctx, 0, 10, 20, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    oval(ctx, -7, -12, 7, 3.5, -0.2);
    ctx.fill();
    ctx.restore();
  }

  function drawSun(ctx, x, y, s, color, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = k * TAU / 10 + t * 0.9;
      const ro = k % 2 ? 26 : 31;
      ctx.moveTo(Math.cos(a - 0.17) * 18, Math.sin(a - 0.17) * 18);
      ctx.lineTo(Math.cos(a) * ro, Math.sin(a) * ro);
      ctx.lineTo(Math.cos(a + 0.17) * 18, Math.sin(a + 0.17) * 18);
      ctx.closePath();
    }
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    dot(ctx, 0, 0, 19);
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    dot(ctx, 0, 0, 15.5);
    ctx.fill();
    ctx.fillStyle = '#FFE39A';
    ctx.beginPath();
    dot(ctx, -4, -5, 7);
    ctx.fill();
    ctx.restore();
  }

  function drawFace(ctx, x, y, lx, ly, dazed, t) {
    if (dazed) {
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (const s of [-1, 1]) {
        ctx.moveTo(x + s * 6 - 2.5, y - 2.5);
        ctx.lineTo(x + s * 6 + 2.5, y + 2.5);
        ctx.moveTo(x + s * 6 + 2.5, y - 2.5);
        ctx.lineTo(x + s * 6 - 2.5, y + 2.5);
      }
      ctx.stroke();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const a = t * 6 + k * TAU / 3;
        dot(ctx, x + Math.cos(a) * 20, y - 24 + Math.sin(a) * 5, 2.6);
      }
      ctx.fill();
      return;
    }
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#FFFFFF';
      oval(ctx, x + s * 6, y, 3.6, 4.3);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      dot(ctx, x + s * 6 + lx * 1.4, y + 0.5 + ly * 1.4, 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,110,120,0.45)';
    ctx.beginPath();
    dot(ctx, x - 11, y + 5, 2.6);
    dot(ctx, x + 11, y + 5, 2.6);
    ctx.fill();
  }

  function drawGustIcon(ctx, x, y, s) {
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = 2 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 8 * s, y - 4 * s);
    ctx.lineTo(x + 3 * s, y - 4 * s);
    ctx.arc(x + 3 * s, y - 7 * s, 3 * s, Math.PI / 2, -Math.PI * 0.8, true);
    ctx.moveTo(x - 5 * s, y + 1 * s);
    ctx.lineTo(x + 8 * s, y + 1 * s);
    ctx.moveTo(x - 8 * s, y + 6 * s);
    ctx.lineTo(x + 1 * s, y + 6 * s);
    ctx.arc(x + 1 * s, y + 9 * s, 3 * s, -Math.PI / 2, Math.PI * 0.8);
    ctx.stroke();
  }

  function drawRainbowIcon(ctx, x, y, s) {
    ctx.lineWidth = 2.2 * s;
    RAINBOW.forEach((c, k) => {
      ctx.strokeStyle = c;
      ctx.beginPath();
      ctx.arc(x, y + 4 * s, (10 - k * 2) * s, Math.PI, TAU);
      ctx.stroke();
    });
  }

  function drawSpiritArt(ctx, s, t) {
    const bx = s.x;
    const by = s.y - FLOAT + Math.sin(t * 2.4 + s.bob) * 3;
    const m = s.morph;
    if (s.rainbow > 0) {
      ctx.lineWidth = 3;
      RAINBOW.forEach((c, k) => {
        ctx.strokeStyle = U.alpha(c, 0.75);
        ctx.beginPath();
        ctx.arc(bx, by + 8, 34 + k * 3.2, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      });
    }
    if (m < 0.98) {
      ctx.globalAlpha = 1 - m;
      drawCloud(ctx, bx, by, 1 - m * 0.35, s.color);
    }
    if (m > 0.02) {
      ctx.globalAlpha = m;
      drawSun(ctx, bx, by, 0.65 + m * 0.35, s.color, t);
    }
    ctx.globalAlpha = 1;
    drawFace(ctx, bx + s.lookX * 2, by + 1 + s.lookY * 1.5, s.lookX, s.lookY, s.daze > 0, t);
    if (s.gust) drawGustIcon(ctx, bx + Math.cos(t * 3) * 32, by - 2 + Math.sin(t * 3) * 10, 0.75);
    if (s.label) {
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const tw = s.label.length * 7 + 10;
      ctx.fillStyle = s.color;
      U.roundRect(ctx, bx - tw / 2, by - 48, tw, 15, 7);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.fillText(s.label, bx, by - 40.5);
    }
  }

  function drawPickupArt(ctx, q, t) {
    const bob = Math.sin(t * 3 + q.x) * 3;
    const y = q.y - 18 + bob;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    oval(ctx, q.x, q.y + 2, 12, 4);
    ctx.fill();
    const col = q.kind === 'gust' ? C.mint : C.gold;
    ctx.fillStyle = U.alpha(col, 0.22);
    ctx.beginPath();
    dot(ctx, q.x, y, 17 + Math.sin(t * 6) * 2);
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    dot(ctx, q.x, y, 13);
    ctx.fill();
    ctx.stroke();
    if (q.kind === 'gust') drawGustIcon(ctx, q.x, y - 1, 0.9);
    else drawRainbowIcon(ctx, q.x, y, 0.9);
  }

  Arcade.register({
    id: 'weather-duel',
    title: 'Weather Duel',
    category: 'fresh',
    mode: 'together',
    players: '1–2P',
    best: false,
    original: true,
    color: C.mint,
    tagline: 'Rain and shine over a shared garden to bloom more flowers than your rival.',
    hook: 'Steer a weather spirit over a shared garden: flowers bloom for whoever gives them the right mix of rain and sun.',
    tags: ['versus', 'garden', 'weather', 'two player', 'computer', 'flowers', 'keyboard', 'arcade'],
    howTo: 'You are a weather spirit floating over a garden of 40 seeds. Your action key switches you between a rain ' +
      'cloud and a sun, and whatever is under you gets watered or warmed. Each seed shows two pips, a drop and a sun, ' +
      'and their size says how much of each it needs. Whoever fills the last missing bit makes it bloom in their color, ' +
      'so you can finish a seed your rival started. Flowers can be stolen back: rival rain floods them and rival sun ' +
      'scorches them until they wilt into seeds again (your own weather soothes them). A flooded seed stays soaked and ' +
      'only needs sun; a scorched one only needs rain. Grab a wind gust, then double-tap your action key to dash and ' +
      'blow your rival away. A rare rainbow makes your next 3 seeds bloom on touch. Most flowers after 75 seconds wins ' +
      'the round; best of 3.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Player 1 float' },
      { keys: ['Space'], label: 'Player 1 switch rain / sun (double-tap: gust)' },
      { keys: ['↑', '↓', '←', '→'], label: 'Player 2 float' },
      { keys: ['Enter'], label: 'Player 2 switch rain / sun (double-tap: gust)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      const k = w / 460;
      ctx.scale(k, k);
      const VW = 460, VH = h / k;
      ctx.fillStyle = GRASS;
      ctx.fillRect(0, 30, VW, VH - 30);
      ctx.fillStyle = U.alpha(GRASS2, 0.8);
      for (let x = 0; x < VW; x += 110) ctx.fillRect(x, 30, 55, VH - 30);
      ctx.strokeStyle = U.alpha(LEAF_DK, 0.6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 46; i++) {
        const x = (i * 97) % VW, y = 40 + (i * 53) % (VH - 50);
        ctx.moveTo(x - 2.5, y - 4);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 2.5, y - 4);
      }
      ctx.stroke();
      const mk = (x, y, o, wa, li, nw, nl, fl, sc) => ({
        x, y, owner: o, water: wa || 0, light: li || 0, needW: nw || 1, needL: nl || 1,
        flood: fl || 0, scorch: sc || 0, fresh: 0, bloomT: -9
      });
      const ps = [
        mk(70, 102, 1), mk(185, 98, 0, 1.3, 0.4, 1.5, 0.6), mk(300, 104, 2, 0, 0, 1, 1, 0, 0.55),
        mk(405, 98, 0, 0.6, 0.7, 0.6, 1.5), mk(75, 226, 0, 0.5, 0, 1, 1), mk(190, 232, 1, 0, 0, 1, 1, 0.4),
        mk(300, 226, 2), mk(408, 230, 1)
      ];
      // Weather pools on the ground.
      ctx.fillStyle = U.alpha(WATER, 0.14);
      ctx.beginPath();
      dot(ctx, 130, 172, 62);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.gold, 0.15);
      ctx.beginPath();
      dot(ctx, 352, 168, 62);
      ctx.fill();
      ctx.fillStyle = U.alpha('#FFE39A', 0.09);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + t * 0.4;
        ctx.moveTo(352, 168);
        ctx.arc(352, 168, 62, a, a + 0.22);
        ctx.closePath();
      }
      ctx.fill();
      ps.forEach((p) => drawPlot(ctx, p, t));
      // Rain streaks under the cloud.
      ctx.strokeStyle = U.alpha(WATER, 0.8);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 16; i++) {
        const x = 130 + ((i * 29) % 70) - 35;
        const ph = (i * 0.37 + t * 1.6) % 1;
        const y = U.lerp(146, 178 + ((i * 13) % 26) - 13, ph);
        ctx.moveTo(x, y - 9);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      // Petals from a fresh cyan bloom.
      for (let i = 0; i < 7; i++) {
        const a = i * TAU / 7 + 0.4;
        const r = 26 + ((t * 20 + i * 5) % 14);
        ctx.fillStyle = U.alpha(C.p2, 0.85);
        oval(ctx, 300 + Math.cos(a) * r, 74 + Math.sin(a) * r * 0.8, 4.5, 2.6, a + t);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      oval(ctx, 130, 172, 20, 7);
      ctx.fill();
      oval(ctx, 352, 168, 20, 7);
      ctx.fill();
      drawSpiritArt(ctx, { x: 130, y: 172, morph: 0, color: C.p1, lookX: 1, lookY: 0.3, daze: 0, bob: 0, rainbow: 0, gust: false }, t);
      drawSpiritArt(ctx, { x: 352, y: 168, morph: 1, color: C.p2, lookX: -1, lookY: 0.3, daze: 0, bob: 2, rainbow: 0, gust: true }, t);
      // Tally bar.
      ctx.fillStyle = C.panel;
      ctx.fillRect(0, 0, VW, 30);
      const bw = 220, bx = (VW - bw) / 2;
      ctx.fillStyle = C.ink;
      U.roundRect(ctx, bx, 10, bw, 11, 5);
      ctx.fill();
      ctx.fillStyle = C.p1;
      ctx.fillRect(bx + 3, 10, bw * 0.34, 11);
      ctx.fillStyle = C.p2;
      ctx.fillRect(bx + bw * 0.73 - 3, 10, bw * 0.27, 11);
      ctx.fillStyle = C.text;
      ctx.fillRect(VW / 2 - 1, 7, 2, 17);
      ctx.font = '700 17px "JetBrains Mono", monospace';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillStyle = C.p1;
      ctx.fillText('7', bx - 10, 16);
      ctx.textAlign = 'left';
      ctx.fillStyle = C.p2;
      ctx.fillText('5', bx + bw + 10, 16);
      drawCloud(ctx, 26, 16, 0.42, C.p1);
      drawSun(ctx, VW - 26, 15, 0.42, C.p2, t);
      ctx.restore();
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'roundEnd' | 'over'
      let cpuOn = false;
      let level = 'normal';
      let plots = [];
      let spirits = [];
      let counts = [0, 0];
      let scores = [0, 0];
      let round = 0;
      let timeLeft = ROUND_TIME;
      let clock = 0;
      let countT = 0, lastCount = 0, goFlash = 0, endT = 0, lastSec = 0;
      let roundMsg = '', roundSub = '', roundColor = C.text;
      let pickups = [];
      let gustT = 0, rainbowAt = 0, rainbowDone = false;
      let parts = [];
      let shake = 0;
      let bumpCd = 0;
      let hinted = {};
      const ai = { timer: 0, kind: null, ref: null, tx: 0, ty: 0, react: 0, hold: 0, rest: 0 };

      const tufts = [];
      for (let i = 0; i < 230; i++) tufts.push({ x: U.rand(GX + 8, GX + GW - 8), y: U.rand(GY + 10, GY + GH - 6), s: U.rand(2.5, 5) });
      const flies = [];
      for (let i = 0; i < 14; i++) flies.push({ x: U.rand(GX + 30, GX + GW - 30), y: U.rand(GY + 30, GY + GH - 30), ph: U.rand(0, TAU), sp: U.rand(0.3, 0.8) });

      const nameOf = (i) => (cpuOn ? (i === 0 ? 'You' : 'Computer') : 'Player ' + (i + 1));
      const shortName = (i) => (cpuOn ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));
      const isHuman = (s) => !(cpuOn && s.id === 1);
      const actKey = (i) => (cpuOn || i === 0 ? 'Space' : 'Enter');
      const updateScore = () => api.setScore(counts[0] + ' – ' + counts[1]);

      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }

      /* ---------- Setup ---------- */
      function newPlot(x, y, rec) {
        return {
          x, y, needW: rec.w, needL: rec.l, water: 0, light: 0, owner: 0, flood: 0, scorch: 0,
          fresh: 0, bloomT: -9, by: [0, 0], lastOwner: 0
        };
      }

      // Left half is random; the right half mirrors it so both spirits start with the same garden.
      function makePlots() {
        const cw = GW / COLS, ch = GH / ROWS;
        const half = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS / 2; c++) half.push({ r, c });
        const kinds = U.shuffle(half.map((_, i) => i % RECIPES.length));
        const list = [];
        half.forEach((cell, i) => {
          const jx = U.rand(-14, 14), jy = U.rand(-10, 10);
          const y = GY + (cell.r + 0.5) * ch + jy + 10;
          for (const side of [0, 1]) {
            const c = side ? COLS - 1 - cell.c : cell.c;
            list.push(newPlot(GX + (c + 0.5) * cw + (side ? -jx : jx), y, RECIPES[kinds[i]]));
          }
        });
        return list.sort((a, b) => a.y - b.y);
      }

      function makeSpirit(id) {
        return {
          id, x: id === 0 ? GX + 70 : GX + GW - 70, y: GY + GH / 2, vx: 0, vy: 0,
          form: id === 0 ? 'rain' : 'sun', morph: id === 0 ? 0 : 1, gust: false, rainbow: 0, daze: 0, dash: 0,
          lastTap: -9, lookX: id === 0 ? 1 : -1, lookY: 0, color: id === 0 ? C.p1 : C.p2, fx: 0, bob: id * 2.1,
          label: ''
        };
      }

      function resetRound() {
        plots = makePlots();
        spirits = [makeSpirit(0), makeSpirit(1)];
        spirits.forEach((s, i) => { s.label = shortName(i); });
        counts = [0, 0];
        pickups = [];
        gustT = U.rand(5, 8);
        rainbowAt = U.rand(22, 45);
        rainbowDone = false;
        timeLeft = ROUND_TIME;
        lastSec = ROUND_TIME;
        ai.timer = 0;
        ai.kind = null;
        ai.ref = null;
        ai.react = 0;
        ai.hold = 0;
        ai.rest = 0;
      }

      function startRound() {
        round++;
        resetRound();
        updateScore();
        state = 'count';
        countT = 3;
        lastCount = 4;
        api.setStatus('Round ' + round + ', best of 3. ' + (cpuOn
          ? 'Float with WASD or arrows; Space switches rain and sun.'
          : 'P1: WASD + Space. P2: arrows + Enter. The action key switches rain and sun.') +
          ' Fill both pips on a seed to bloom it.');
      }

      function startMatch(cpu, lvl) {
        cpuOn = cpu;
        level = lvl || 'normal';
        scores = [0, 0];
        round = 0;
        parts = [];
        hinted = {};
        startRound();
      }

      function showStartMenu() {
        state = 'menu';
        cpuOn = false;
        resetRound();
        updateScore();
        api.menu({
          title: 'Weather Duel',
          text: 'Switch between rain cloud and sun. A seed blooms in the color of whoever adds the last drop or ray ' +
            'it needs, and too much of either wilts a flower back into a seed. Most flowers after 75 seconds wins ' +
            'the round; best of 3.',
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
          text: 'You are the coral spirit: WASD or arrows to float, Space or Enter to switch rain and sun. ' +
            'The computer plays cyan.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      function matchOver() {
        state = 'over';
        const even = scores[0] === scores[1];
        const w = scores[0] > scores[1] ? 0 : 1;
        api.sfx(even ? 'lose' : cpuOn && w === 1 ? 'lose' : 'win');
        const title = even ? 'Draw!' : cpuOn ? (w === 0 ? 'You win!' : 'Computer wins') : 'Player ' + (w + 1) + ' wins!';
        api.setStatus(even ? 'The match ends level, ' + scores[0] + ' – ' + scores[1] + '.'
          : nameOf(w) + (cpuOn && w === 0 ? ' win' : ' wins') + ' the match ' + scores[0] + ' – ' + scores[1] + '.');
        api.menu({
          title,
          text: 'Rounds won ' + scores[0] + ' – ' + scores[1] + '.' + (even ? ' Too many tied rounds to split you.' : ''),
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(cpuOn, level) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function endRound() {
        state = 'roundEnd';
        endT = 2.8;
        if (counts[0] === counts[1]) {
          roundMsg = 'Tie round';
          roundColor = C.gold;
          roundSub = counts[0] + ' flowers each. Nobody scores';
          api.sfx('hit');
        } else {
          const w = counts[0] > counts[1] ? 0 : 1;
          scores[w]++;
          roundMsg = (cpuOn ? (w === 0 ? 'You take' : 'Computer takes') : 'Player ' + (w + 1) + ' takes') + ' the round';
          roundColor = spirits[w].color;
          roundSub = counts[0] + ' coral flowers to ' + counts[1] + ' cyan';
          api.sfx('score');
          for (const p of plots) if (p.owner === w + 1) burst(p.x, p.y - 24, spirits[w].color, 4, 90, 'petal');
        }
        api.setStatus(roundMsg + '. ' + roundSub + '.');
      }

      /* ---------- Effects ---------- */
      function addPart(p) {
        if (parts.length < MAX_PARTS) parts.push(p);
      }

      function burst(x, y, color, n, speed, kind) {
        for (let k = 0; k < n; k++) {
          const a = Math.random() * TAU, v = speed * U.rand(0.35, 1);
          addPart({
            k: kind || 'petal', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8, rot: Math.random() * TAU,
            vr: U.rand(-8, 8), life: U.rand(0.6, 1.1), max: 1.1, color, size: U.rand(3, 5.5)
          });
        }
      }

      function ring(x, y, color, vr, life, flat, width) {
        addPart({ k: 'ring', x, y, r: 2, vr, life, max: life, color, flat: !!flat, size: width || 2 });
      }

      function floatText(x, y, text, color) {
        addPart({ k: 'text', x, y, vx: 0, vy: -46, life: 1.2, max: 1.2, text, color });
      }

      function weatherFx(s, dt) {
        if (s.daze > 0) return;
        const rain = s.form === 'rain';
        s.fx += dt * (rain ? 75 : 18);
        while (s.fx >= 1) {
          s.fx -= 1;
          const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * R_FULL * 1.2;
          const gx = s.x + Math.cos(a) * rr, gy = s.y + Math.sin(a) * rr;
          if (rain) {
            const top = s.y - FLOAT + 8 + Math.random() * 6;
            addPart({ k: 'rain', x: gx, y: Math.min(top, gy - 8), gy, vy: 430, life: 1, max: 1 });
          } else {
            addPart({
              k: 'mote', x: gx, y: gy, vx: U.rand(-6, 6), vy: U.rand(-40, -20), life: U.rand(0.5, 0.9), max: 0.9,
              color: Math.random() < 0.5 ? C.gold : '#FFE39A', size: U.rand(1.5, 2.6)
            });
          }
        }
      }

      function updateParts(dt) {
        const drag = Math.exp(-3 * dt);
        let j = 0;
        for (const p of parts) {
          p.life -= dt;
          if (p.life <= 0) continue;
          if (p.k === 'rain') {
            p.y += p.vy * dt;
            if (p.y >= p.gy) {
              p.k = 'ring';
              p.y = p.gy;
              p.r = 1;
              p.vr = 24;
              p.life = p.max = 0.28;
              p.color = WATER;
              p.flat = true;
              p.size = 1.2;
            }
          } else if (p.k === 'ring') {
            p.r += p.vr * dt;
          } else {
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (p.k !== 'text') {
              p.vx *= drag;
              p.vy *= drag;
            }
            if (p.k === 'petal') {
              p.vy += 40 * dt;
              p.rot += p.vr * dt;
            }
          }
          parts[j++] = p;
        }
        parts.length = j;
      }

      /* ---------- Garden rules ---------- */
      function bloom(p, who, magic) {
        const other = 1 - who;
        const stolen = (p.lastOwner && p.lastOwner !== who + 1) || p.by[other] > p.by[who];
        p.owner = who + 1;
        p.water = p.needW;
        p.light = p.needL;
        p.flood = 0;
        p.scorch = 0;
        p.fresh = FRESH;
        p.bloomT = clock;
        p.by = [0, 0];
        p.lastOwner = 0;
        counts[who]++;
        updateScore();
        const col = spirits[who].color;
        burst(p.x, p.y - 22, col, 14, 170, 'petal');
        burst(p.x, p.y - 22, C.gold, 6, 120, 'mote');
        if (magic) RAINBOW.forEach((c) => burst(p.x, p.y - 22, c, 3, 150, 'petal'));
        ring(p.x, p.y + 3, col, 90, 0.45, true, 3);
        api.sfx(magic ? 'power' : 'score');
        if (stolen && !magic) {
          floatText(p.x, p.y - 48, 'Stolen!', col);
          hint('steal', nameOf(who) + ' finished a seed the other spirit had worked on, so it blooms ' +
            (who === 0 ? 'coral' : 'cyan') + '. The last drop or ray decides!');
        } else {
          floatText(p.x, p.y - 48, '+1', col);
          if (isHuman(spirits[who])) {
            hint('bloom', 'Bloomed! Rival rain floods it and rival sun scorches it. Hover your own weather over a ' +
              'flower to soothe it.');
          }
        }
      }

      function wilt(p, why) {
        const prev = p.owner - 1;
        if (prev >= 0) counts[prev]--;
        p.lastOwner = p.owner;
        p.owner = 0;
        p.fresh = 0;
        p.by = [0, 0];
        // The killing element stays soaked in: the seed only needs the other one now.
        if (why === 'flood') {
          p.water = p.needW;
          p.light = 0;
        } else {
          p.light = p.needL;
          p.water = 0;
        }
        p.flood = 0;
        p.scorch = 0;
        updateScore();
        const col = prev >= 0 ? spirits[prev].color : C.text;
        for (let k = 0; k < 10; k++) {
          addPart({
            k: 'petal', x: p.x + U.rand(-10, 10), y: p.y - 24 + U.rand(-6, 6), vx: U.rand(-50, 50), vy: U.rand(-30, 10),
            rot: Math.random() * TAU, vr: U.rand(-6, 6), life: U.rand(0.8, 1.3), max: 1.3, color: col, size: U.rand(3, 5)
          });
        }
        if (why === 'flood') ring(p.x, p.y + 3, WATER, 70, 0.5, true, 3);
        else burst(p.x, p.y - 16, '#5A5266', 8, 40, 'smoke');
        floatText(p.x, p.y - 46, why === 'flood' ? 'Flooded!' : 'Scorched!', why === 'flood' ? WATER : EMBER);
        api.sfx('hit');
        shake = Math.max(shake, 3);
        hint('wilt', 'Wilted! A flooded seed stays soaked and only needs sun; a scorched one only needs rain. ' +
          'Finish it first to claim it.');
      }

      function applyWeather(dt) {
        const cw = [0, 0], cl = [0, 0];
        for (const p of plots) {
          if (p.fresh > 0) p.fresh = Math.max(0, p.fresh - dt);
          cw[0] = cw[1] = cl[0] = cl[1] = 0;
          for (const s of spirits) {
            if (s.daze > 0) continue;
            const d = Math.hypot(s.x - p.x, s.y - p.y);
            if (d >= R_MAX) continue;
            const k = d <= R_FULL ? 1 : 1 - (d - R_FULL) / (R_MAX - R_FULL);
            const rain = s.form === 'rain';
            if (p.owner === 0) {
              if (rain) cw[s.id] += RATE * k * dt;
              else cl[s.id] += RATE * k * dt;
            } else if (p.owner === s.id + 1) {
              p.flood = Math.max(0, p.flood - SOOTHE * k * dt);
              p.scorch = Math.max(0, p.scorch - SOOTHE * k * dt);
            } else if (p.fresh <= 0) {
              if (rain) p.flood += STRESS * k * dt;
              else p.scorch += STRESS * k * dt;
            }
          }
          if (p.owner === 0) {
            const missW = p.water < p.needW, missL = p.light < p.needL;
            const gain = [(missW ? cw[0] : 0) + (missL ? cl[0] : 0), (missW ? cw[1] : 0) + (missL ? cl[1] : 0)];
            p.by[0] += gain[0];
            p.by[1] += gain[1];
            p.water = Math.min(p.needW, p.water + cw[0] + cw[1]);
            p.light = Math.min(p.needL, p.light + cl[0] + cl[1]);
            if (p.water >= p.needW && p.light >= p.needL) {
              // Whoever supplied the last missing part this frame gets the bloom.
              let who = gain[0] > gain[1] ? 0 : gain[1] > gain[0] ? 1 : -1;
              if (who < 0) {
                const all0 = cw[0] + cl[0], all1 = cw[1] + cl[1];
                who = all0 > all1 ? 0 : all1 > all0 ? 1 : (Math.random() < 0.5 ? 0 : 1);
              }
              bloom(p, who, false);
            }
          } else {
            p.flood = Math.max(0, p.flood - RELAX * dt);
            p.scorch = Math.max(0, p.scorch - RELAX * dt);
            const st = Math.max(p.flood, p.scorch);
            if (st > 0.45 && Math.random() < dt * 8) {
              if (p.flood >= p.scorch) ring(p.x + U.rand(-14, 14), p.y + U.rand(0, 8), WATER, 30, 0.35, true, 1.5);
              else addPart({ k: 'smoke', x: p.x + U.rand(-8, 8), y: p.y - 26, vx: U.rand(-8, 8), vy: -30, life: 0.7, max: 0.7, color: '#5A5266', size: 3 });
            }
            if (p.flood >= 1) wilt(p, 'flood');
            else if (p.scorch >= 1) wilt(p, 'scorch');
          }
        }
      }

      function useRainbows() {
        for (const s of spirits) {
          if (s.rainbow <= 0 || s.daze > 0) continue;
          let best = null, bd = R_FULL + 8;
          for (const p of plots) {
            if (p.owner) continue;
            const d = Math.hypot(p.x - s.x, p.y - s.y);
            if (d < bd) {
              bd = d;
              best = p;
            }
          }
          if (best) {
            s.rainbow--;
            bloom(best, s.id, true);
            if (isHuman(s)) api.setStatus(s.rainbow ? 'Rainbow bloom! ' + s.rainbow + ' left.' : 'Rainbow used up.');
          }
        }
      }

      function spawnPickup(kind) {
        for (let tries = 0; tries < 50; tries++) {
          const x = U.rand(GX + 50, GX + GW - 50), y = U.rand(GY + 70, GY + GH - 30);
          if (spirits.some((s) => Math.hypot(s.x - x, s.y - y) < 150)) continue;
          if (plots.some((p) => Math.hypot(p.x - x, p.y - y) < 38)) continue;
          if (pickups.some((q) => Math.hypot(q.x - x, q.y - y) < 80)) continue;
          pickups.push({ kind, x, y, life: kind === 'rainbow' ? 14 : 12 });
          api.sfx('blip');
          if (kind === 'rainbow') api.setStatus('A rainbow appeared! Grab it to make your next 3 seeds bloom on touch.');
          return;
        }
      }

      function updatePickups(dt) {
        gustT -= dt;
        if (gustT <= 0) {
          gustT = U.rand(8, 12);
          if (pickups.filter((q) => q.kind === 'gust').length < 2) spawnPickup('gust');
        }
        if (!rainbowDone && ROUND_TIME - timeLeft >= rainbowAt) {
          rainbowDone = true;
          spawnPickup('rainbow');
        }
        for (const q of pickups) {
          q.life -= dt;
          for (const s of spirits) {
            if (q.life <= 0 || s.daze > 0) continue;
            if (Math.hypot(q.x - s.x, q.y - s.y) > BODY_R + 14) continue;
            if (q.kind === 'gust') {
              if (s.gust) continue;
              s.gust = true;
              if (isHuman(s)) hint('gust', 'Wind gust! Double-tap ' + actKey(s.id) + ' to dash and blow your rival away.');
              burst(q.x, q.y - 18, C.mint, 12, 150, 'mote');
            } else {
              s.rainbow = 3;
              if (isHuman(s)) api.setStatus('Rainbow! Your next 3 seeds bloom the moment you touch them.');
              RAINBOW.forEach((c) => burst(q.x, q.y - 18, c, 3, 150, 'mote'));
            }
            q.life = 0;
            api.sfx('power');
          }
        }
        pickups = pickups.filter((q) => q.life > 0);
      }

      /* ---------- Actions ---------- */
      function toggleForm(s, quiet) {
        s.form = s.form === 'rain' ? 'sun' : 'rain';
        if (!quiet) {
          api.sfx('flip');
          ring(s.x, s.y - FLOAT, s.form === 'rain' ? WATER : C.gold, 110, 0.3, false, 2);
        }
      }

      function fireGust(s, aimAtFoe) {
        if (state !== 'play' || !s.gust || s.daze > 0) return;
        s.gust = false;
        const foe = spirits[1 - s.id];
        const dx = foe.x - s.x, dy = foe.y - s.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.hypot(s.vx, s.vy);
        let ux = dx / d, uy = dy / d;
        if (!aimAtFoe && sp > 40) {
          ux = s.vx / sp;
          uy = s.vy / sp;
        }
        s.vx = ux * 620;
        s.vy = uy * 620;
        s.dash = 0.32;
        ring(s.x, s.y, C.mint, 520, 0.4, false, 3);
        for (let k = 0; k < 22; k++) {
          const a = Math.random() * TAU, v = U.rand(380, 620);
          addPart({ k: 'wind', x: s.x, y: s.y - 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4, max: 0.4 });
        }
        if (d < 230) {
          const push = 260 + 700 * (1 - d / 230);
          foe.vx = (dx / d) * push;
          foe.vy = (dy / d) * push;
          foe.daze = 0.9;
          foe.dash = 0;
          shake = 8;
          api.sfx('boom');
          floatText(foe.x, foe.y - FLOAT - 30, 'Whoosh!', C.mint);
        } else {
          api.sfx('shoot');
        }
      }

      function actionPress(s) {
        if (state !== 'play' || s.daze > 0) return;
        if (s.gust && clock - s.lastTap < DOUBLE_TAP) {
          toggleForm(s, true); // undo the first tap of the double-tap
          s.lastTap = -9;
          fireGust(s, false);
          return;
        }
        s.lastTap = clock;
        toggleForm(s, false);
      }

      /* ---------- Computer ---------- */
      function targetValid(me, foe) {
        const r = ai.ref;
        if (!r || !ai.kind) return false;
        if (ai.kind === 'pickup') return r.life > 0 && pickups.includes(r);
        if (ai.kind === 'seed') return r.owner === 0;
        if (ai.kind === 'foe') return r.owner === foe.id + 1;
        if (ai.kind === 'own') return r.owner === me.id + 1 && Math.max(r.flood, r.scorch) > 0.04;
        return false;
      }

      function cpuChoose(me, foe, L) {
        if (Math.random() < L.wander) {
          const seeds = plots.filter((p) => p.owner === 0);
          if (seeds.length) {
            ai.kind = 'seed';
            ai.ref = U.pick(seeds);
            return;
          }
        }
        let bestV = -Infinity, pick = null;
        const sp = SPEED * L.speed;
        const consider = (v, kind, ref) => {
          let val = v * (1 + U.rand(-L.noise, L.noise));
          if (ref === ai.ref) val *= 1.25; // stick with the current plan unless something is clearly better
          if (val > bestV) {
            bestV = val;
            pick = { kind, ref };
          }
        };
        for (const p of plots) {
          const travel = Math.hypot(p.x - me.x, p.y - me.y) / sp;
          if (p.owner === 0) {
            if (me.rainbow > 0) {
              consider(4 / (travel + 0.3), 'seed', p);
              continue;
            }
            const mW = Math.max(0, p.needW - p.water), mL = Math.max(0, p.needL - p.light);
            let work = (mW + mL) / RATE;
            if ((me.form === 'rain' ? mW : mL) <= 0) work += L.react + 0.1;
            if (mW > 0 && mL > 0) work += L.react + 0.1;
            const prog = 1 - (mW + mL) / (p.needW + p.needL);
            const contest = Math.hypot(p.x - foe.x, p.y - foe.y) < R_MAX ? 0.75 : 1;
            consider((1 + prog) * contest / (travel + work + 0.8), 'seed', p);
          } else if (p.owner === foe.id + 1) {
            const st = Math.max(p.flood, p.scorch);
            const work = (1 - st) / STRESS + p.fresh + L.react;
            consider(L.sabotage * 1.6 / (travel + work + 0.8), 'foe', p);
          } else {
            const st = Math.max(p.flood, p.scorch);
            // A rival camping on the flower makes defending a slow tug of war: worth less than fresh work.
            const camped = Math.hypot(p.x - foe.x, p.y - foe.y) < R_MAX ? 0.5 : 1;
            if (st > 0.3) consider(L.defend * camped * (1.2 + st * 3) / (travel + 0.5), 'own', p);
          }
        }
        for (const q of pickups) {
          if (q.kind === 'gust' && me.gust) continue;
          const travel = Math.hypot(q.x - me.x, q.y - me.y) / sp;
          if (travel > q.life) continue;
          consider((q.kind === 'rainbow' ? 3 : 1.1) * L.pickup / (travel + 0.4), 'pickup', q);
        }
        ai.kind = pick ? pick.kind : null;
        ai.ref = pick ? pick.ref : null;
      }

      function cpuWantForm(me) {
        const p = ai.ref;
        if (!p || ai.kind === 'pickup' || ai.kind === 'own') return me.form;
        if (ai.kind === 'seed') {
          if (me.rainbow > 0) return me.form;
          const mW = p.needW - p.water > 1e-4, mL = p.needL - p.light > 1e-4;
          if (me.form === 'rain' ? mW : mL) return me.form;
          return me.form === 'rain' ? 'sun' : 'rain';
        }
        if (Math.abs(p.flood - p.scorch) < 0.12) return me.form;
        return p.flood > p.scorch ? 'rain' : 'sun';
      }

      function cpuThink(me, foe, dt) {
        const L = LEVELS[level] || LEVELS.normal;
        ai.timer -= dt;
        const valid = targetValid(me, foe);
        if (ai.timer <= 0 || !valid) {
          if (!valid && ai.kind) ai.rest = L.rest; // a beat of hesitation after each finished job
          ai.timer = L.think * U.rand(0.7, 1.3);
          cpuChoose(me, foe, L);
        }
        if (ai.ref) {
          ai.tx = ai.ref.x;
          ai.ty = ai.ref.y;
        } else {
          ai.tx = foe.x;
          ai.ty = foe.y;
        }
        if (me.daze > 0) return { x: 0, y: 0 };
        if (ai.rest > 0) {
          ai.rest -= dt;
          return { x: 0, y: 0 };
        }
        const want = cpuWantForm(me);
        if (want !== me.form) {
          ai.react += dt;
          if (ai.react >= L.react) {
            ai.react = 0;
            toggleForm(me, false);
          }
        } else {
          ai.react = 0;
        }
        if (me.gust) {
          ai.hold += dt;
          const fd = Math.hypot(foe.x - me.x, foe.y - me.y);
          const nearTarget = Math.hypot(foe.x - ai.tx, foe.y - ai.ty) < R_MAX + 20;
          const threat = plots.some((p) => p.owner === me.id + 1 && Math.hypot(foe.x - p.x, foe.y - p.y) < R_FULL + 10);
          if (fd < 170 && foe.daze <= 0 && (nearTarget || threat || ai.hold > 6) && Math.random() < dt * 5 * L.gust) {
            ai.hold = 0;
            fireGust(me, true);
          }
        } else {
          ai.hold = 0;
        }
        const dx = ai.tx - me.x, dy = ai.ty - me.y;
        const d = Math.hypot(dx, dy);
        if (d < 5) return { x: 0, y: 0 };
        const k = L.speed * Math.min(1, d / 50);
        return { x: (dx / d) * k, y: (dy / d) * k };
      }

      /* ---------- Movement ---------- */
      function inputFor(i) {
        const k = api.keys;
        let x = 0, y = 0;
        if (i === 0) {
          if (k.has('KeyA')) x--;
          if (k.has('KeyD')) x++;
          if (k.has('KeyW')) y--;
          if (k.has('KeyS')) y++;
        }
        if (i === 1 || cpuOn) {
          if (k.has('ArrowLeft')) x--;
          if (k.has('ArrowRight')) x++;
          if (k.has('ArrowUp')) y--;
          if (k.has('ArrowDown')) y++;
        }
        x = U.clamp(x, -1, 1);
        y = U.clamp(y, -1, 1);
        const m = Math.hypot(x, y);
        return m > 1 ? { x: x / m, y: y / m } : { x, y };
      }

      function clampSpirit(s) {
        const minX = GX + 26, maxX = GX + GW - 26, minY = GY + 44, maxY = GY + GH - 14;
        if (s.x < minX) { s.x = minX; s.vx = Math.abs(s.vx) * 0.4; }
        if (s.x > maxX) { s.x = maxX; s.vx = -Math.abs(s.vx) * 0.4; }
        if (s.y < minY) { s.y = minY; s.vy = Math.abs(s.vy) * 0.4; }
        if (s.y > maxY) { s.y = maxY; s.vy = -Math.abs(s.vy) * 0.4; }
      }

      function moveSpirits(dt, inputs) {
        spirits.forEach((s, i) => {
          s.daze = Math.max(0, s.daze - dt);
          s.dash = Math.max(0, s.dash - dt);
          if (s.daze > 0 || s.dash > 0) {
            const f = Math.exp(-2.5 * dt);
            s.vx *= f;
            s.vy *= f;
          } else {
            const k = 1 - Math.exp(-6 * dt);
            s.vx += (inputs[i].x * SPEED - s.vx) * k;
            s.vy += (inputs[i].y * SPEED - s.vy) * k;
          }
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const sp = Math.hypot(s.vx, s.vy);
          if (sp > 25) {
            s.lookX = s.vx / sp;
            s.lookY = s.vy / sp;
          }
        });
        const a = spirits[0], b = spirits[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d < BODY_R * 2) {
          const nx = d > 0.001 ? dx / d : 1, ny = d > 0.001 ? dy / d : 0;
          const over = (BODY_R * 2 - d) / 2;
          a.x -= nx * over;
          a.y -= ny * over;
          b.x += nx * over;
          b.y += ny * over;
          const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (vn < 0) {
            const j = -vn * 0.8;
            a.vx -= nx * j;
            a.vy -= ny * j;
            b.vx += nx * j;
            b.vy += ny * j;
            if (j > 100 && bumpCd <= 0) {
              bumpCd = 0.3;
              api.sfx('hit');
            }
          }
        }
        spirits.forEach(clampSpirit);
      }

      /* ---------- Loop ---------- */
      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        goFlash = Math.max(0, goFlash - dt);
        bumpCd = Math.max(0, bumpCd - dt);
        updateParts(dt);
        for (const s of spirits) {
          const target = s.form === 'sun' ? 1 : 0;
          s.morph += (target - s.morph) * (1 - Math.exp(-12 * dt));
        }
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
          timeLeft -= dt;
          const sec = Math.ceil(timeLeft);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 10 && sec > 0) api.sfx('tick');
          }
          const inputs = [inputFor(0), cpuOn ? cpuThink(spirits[1], spirits[0], dt) : inputFor(1)];
          moveSpirits(dt, inputs);
          for (const s of spirits) weatherFx(s, dt);
          useRainbows();
          applyWeather(dt);
          updatePickups(dt);
          if (timeLeft <= 0) {
            timeLeft = 0;
            endRound();
          }
        } else if (state === 'roundEnd') {
          endT -= dt;
          if (endT <= 0) {
            if (Math.max(scores[0], scores[1]) >= WIN_ROUNDS || round >= MAX_ROUNDS) matchOver();
            else startRound();
          }
        }
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, scale, color, alpha) {
        ctx.save();
        ctx.globalAlpha = U.clamp(alpha, 0, 1);
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillText(text, 2, 3);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function drawGarden() {
        ctx.fillStyle = '#0E2118';
        U.roundRect(ctx, GX - 4, GY - 4, GW + 8, GH + 8, 18);
        ctx.fill();
        ctx.save();
        U.roundRect(ctx, GX, GY, GW, GH, 14);
        ctx.clip();
        ctx.fillStyle = GRASS;
        ctx.fillRect(GX, GY, GW, GH);
        ctx.fillStyle = U.alpha(GRASS2, 0.7);
        for (let x = GX; x < GX + GW; x += GW / COLS) ctx.fillRect(x, GY, GW / COLS / 2, GH);
        ctx.strokeStyle = U.alpha(LEAF_DK, 0.55);
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (const f of tufts) {
          ctx.moveTo(f.x - f.s * 0.6, f.y - f.s);
          ctx.lineTo(f.x, f.y);
          ctx.lineTo(f.x + f.s * 0.6, f.y - f.s);
        }
        ctx.stroke();
        ctx.restore();
      }

      function drawGround(s) {
        const rain = s.form === 'rain';
        const live = state === 'play' && s.daze <= 0;
        const col = rain ? WATER : C.gold;
        ctx.fillStyle = U.alpha(col, live ? 0.1 : 0.05);
        ctx.beginPath();
        dot(ctx, s.x, s.y, R_MAX);
        ctx.fill();
        ctx.beginPath();
        dot(ctx, s.x, s.y, R_FULL);
        ctx.fill();
        if (!rain && live) {
          ctx.fillStyle = U.alpha('#FFE39A', 0.08);
          ctx.beginPath();
          for (let k = 0; k < 8; k++) {
            const a = k * TAU / 8 + clock * 0.4;
            ctx.moveTo(s.x, s.y);
            ctx.arc(s.x, s.y, R_MAX, a, a + 0.22);
            ctx.closePath();
          }
          ctx.fill();
        }
        ctx.strokeStyle = U.alpha(s.color, live ? 0.6 : 0.3);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        ctx.lineDashOffset = -clock * 12;
        ctx.beginPath();
        ctx.arc(s.x, s.y, R_MAX, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
      }

      function drawParts() {
        for (const p of parts) {
          const a = U.clamp(p.life / p.max, 0, 1);
          if (p.k === 'rain') {
            ctx.strokeStyle = U.alpha(WATER, 0.75);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y - 9);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          } else if (p.k === 'ring') {
            ctx.strokeStyle = U.alpha(p.color, a * 0.9);
            ctx.lineWidth = p.size;
            ctx.beginPath();
            if (p.flat) ctx.ellipse(p.x, p.y, Math.max(0.1, p.r), Math.max(0.1, p.r * 0.45), 0, 0, TAU);
            else ctx.arc(p.x, p.y, Math.max(0.1, p.r), 0, TAU);
            ctx.stroke();
          } else if (p.k === 'petal') {
            ctx.fillStyle = U.alpha(p.color, a);
            oval(ctx, p.x, p.y, p.size, p.size * 0.55, p.rot);
            ctx.fill();
          } else if (p.k === 'wind') {
            ctx.strokeStyle = U.alpha(C.mint, a * 0.8);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
            ctx.stroke();
          } else if (p.k === 'text') {
            ctx.globalAlpha = Math.min(1, a * 2);
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillText(p.text, p.x + 1, p.y + 2);
            ctx.fillStyle = p.color;
            ctx.fillText(p.text, p.x, p.y);
            ctx.globalAlpha = 1;
          } else {
            ctx.fillStyle = U.alpha(p.color, p.k === 'smoke' ? a * 0.6 : a);
            ctx.beginPath();
            dot(ctx, p.x, p.y, p.size * (p.k === 'smoke' ? 1.6 - a * 0.6 : 0.5 + a * 0.5));
            ctx.fill();
          }
        }
      }

      function drawHud() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, HUD_H);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, HUD_H - 2, W, 2);
        ctx.textBaseline = 'middle';
        spirits.forEach((s, i) => {
          const left = i === 0;
          const bx = left ? 30 : W - 30;
          ctx.fillStyle = C.ink;
          ctx.beginPath();
          dot(ctx, bx, 24, 19);
          ctx.fill();
          ctx.strokeStyle = s.color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          if (s.form === 'rain') drawCloud(ctx, bx, 25, 0.5, s.color);
          else drawSun(ctx, bx, 24, 0.5, s.color, clock);
          const tx = left ? 58 : W - 58;
          ctx.font = '600 15px "JetBrains Mono", monospace';
          ctx.textAlign = left ? 'left' : 'right';
          ctx.fillStyle = s.color;
          ctx.fillText(shortName(i) + ' ' + (s.form === 'rain' ? 'RAIN' : 'SUN'), tx, 15);
          for (let k = 0; k < WIN_ROUNDS; k++) {
            const px = left ? tx + 5 + k * 15 : tx - 5 - k * 15;
            ctx.beginPath();
            dot(ctx, px, 35, 5);
            ctx.fillStyle = scores[i] > k ? s.color : C.ink;
            ctx.fill();
            ctx.strokeStyle = U.alpha(s.color, 0.7);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          let ix = left ? tx + 50 : tx - 50;
          if (s.gust) {
            drawGustIcon(ctx, ix, 34, 0.85);
            ix += left ? 26 : -26;
          }
          if (s.rainbow > 0) {
            drawRainbowIcon(ctx, ix, 34, 0.75);
            ctx.font = '600 13px "JetBrains Mono", monospace';
            ctx.fillStyle = C.text;
            ctx.textAlign = left ? 'left' : 'right';
            ctx.fillText('×' + s.rainbow, left ? ix + 10 : ix - 10, 36);
          }
        });
        // Timer and live flower tally.
        const sec = Math.max(0, Math.ceil(timeLeft));
        const label = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
        const urgent = state === 'play' && sec <= 10;
        ctx.font = '600 15px "JetBrains Mono", monospace';
        ctx.save();
        ctx.translate(W / 2, 13);
        if (urgent) {
          const ph = timeLeft - Math.floor(timeLeft);
          ctx.scale(1 + ph * 0.3, 1 + ph * 0.3);
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = urgent ? C.gold : C.text;
        ctx.fillText(label, 0, 0);
        ctx.restore();
        ctx.font = '600 12px "JetBrains Mono", monospace';
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('ROUND ' + Math.max(1, round), W / 2 + 34, 13);
        const bw = 340, bx = (W - bw) / 2, by = 27;
        const n = plots.length || 1;
        ctx.fillStyle = C.ink;
        U.roundRect(ctx, bx, by, bw, 12, 6);
        ctx.fill();
        ctx.save();
        U.roundRect(ctx, bx, by, bw, 12, 6);
        ctx.clip();
        ctx.fillStyle = C.p1;
        ctx.fillRect(bx, by, bw * counts[0] / n, 12);
        ctx.fillStyle = C.p2;
        ctx.fillRect(bx + bw - bw * counts[1] / n, by, bw * counts[1] / n, 12);
        ctx.restore();
        ctx.fillStyle = C.text;
        ctx.fillRect(W / 2 - 1, by - 2, 2, 16);
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.fillStyle = C.p1;
        ctx.fillText(String(counts[0]), bx - 10, by + 7);
        ctx.textAlign = 'left';
        ctx.fillStyle = C.p2;
        ctx.fillText(String(counts[1]), bx + bw + 10, by + 7);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        drawGarden();
        for (const s of spirits) drawGround(s);
        for (const p of plots) drawPlot(ctx, p, clock);
        for (const q of pickups) {
          ctx.globalAlpha = q.life < 3 && Math.sin(clock * 18) < 0 ? 0.4 : 1;
          drawPickupArt(ctx, q, clock);
        }
        ctx.globalAlpha = 1;
        drawParts();
        for (const s of spirits) {
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          oval(ctx, s.x, s.y, 20, 7);
          ctx.fill();
        }
        const order = spirits.slice().sort((a, b) => a.y - b.y);
        for (const s of order) {
          if (s.dash > 0) {
            ctx.fillStyle = U.alpha(C.mint, 0.25);
            ctx.beginPath();
            dot(ctx, s.x - s.vx * 0.05, s.y - FLOAT - s.vy * 0.05, 20);
            dot(ctx, s.x - s.vx * 0.1, s.y - FLOAT - s.vy * 0.1, 15);
            ctx.fill();
          }
          drawSpiritArt(ctx, s, clock);
        }
        for (const f of flies) {
          const x = f.x + Math.sin(clock * f.sp + f.ph) * 24;
          const y = f.y + Math.cos(clock * f.sp * 1.3 + f.ph) * 16;
          const a = 0.3 + 0.25 * Math.sin(clock * 3 + f.ph);
          ctx.fillStyle = U.alpha('#E8FFA8', a * 0.3);
          ctx.beginPath();
          dot(ctx, x, y, 5);
          ctx.fill();
          ctx.fillStyle = U.alpha('#E8FFA8', a + 0.2);
          ctx.beginPath();
          dot(ctx, x, y, 1.6);
          ctx.fill();
        }
        ctx.restore();
        drawHud();
        if (state === 'count') {
          const n = Math.max(1, Math.ceil(countT));
          const f = U.clamp(countT - (n - 1), 0, 1);
          bigText(String(n), W / 2, H / 2, 1.4 + Math.pow(f, 3) * 1.2, C.text, 0.3 + f * 1.4);
        }
        if (goFlash > 0) bigText('Grow!', W / 2, H / 2, 1.3 + (0.7 - goFlash), C.mint, goFlash / 0.5);
        if (state === 'roundEnd') {
          const a = Math.min(1, (2.8 - endT) * 4);
          ctx.fillStyle = U.alpha(C.ink, 0.45 * a);
          ctx.fillRect(0, HUD_H, W, H - HUD_H);
          bigText(roundMsg, W / 2, H / 2 - 10, 0.9, roundColor, a);
          ctx.globalAlpha = a;
          ctx.font = '600 15px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.text;
          ctx.fillText(roundSub, W / 2, H / 2 + 34);
          ctx.globalAlpha = 1;
        }
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || state !== 'play') return;
        if (e.code === 'Space') actionPress(spirits[0]);
        else if (e.code === 'Enter' || e.code === 'NumpadEnter') actionPress(cpuOn ? spirits[0] : spirits[1]);
      });

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
