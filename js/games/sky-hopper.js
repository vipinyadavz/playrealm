/* Sky Hopper — bounce from platform to platform and climb. Spend 5 coins to drop a
   rescue cloud under your feet when you fall. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 480;
  const H = 720;
  const PX_PER_M = 10;
  const GRAV = 1500;
  const JUMP = 820;        // ~22 m apex
  const SPRING = 1450;
  const CLOUD_JUMP = 900;
  const JET_V = 950;
  const MAX_VX = 340;
  const ACCEL = 1600;
  const FRICTION = 1200;
  const PW = 34;
  const PH = 34;
  const CLOUD_COST = 5;
  const COIN_PTS = 5;
  const BTN = { x: W - 54, y: H - 54, r: 38 };
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const TAU = Math.PI * 2;

  function mixHex(a, b, t) {
    const x = parseInt(a.slice(1), 16);
    const y = parseInt(b.slice(1), 16);
    const ch = (s) => Math.round(((x >> s) & 255) + ((((y >> s) & 255) - ((x >> s) & 255)) * t));
    return '#' + ((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1);
  }

  const SKY = [
    { m: 0, top: C.panel2, bot: mixHex(C.p1, C.panel2, 0.6) },
    { m: 600, top: C.panel, bot: mixHex(C.violet, C.panel2, 0.55) },
    { m: 1500, top: C.ink, bot: C.panel2 },
    { m: 3000, top: C.ink, bot: C.ink }
  ];

  function skyAt(m) {
    for (let i = 1; i < SKY.length; i++) {
      if (m < SKY[i].m) {
        const a = SKY[i - 1];
        const b = SKY[i];
        const t = (m - a.m) / (b.m - a.m);
        return { top: mixHex(a.top, b.top, t), bot: mixHex(a.bot, b.bot, t) };
      }
    }
    return SKY[SKY.length - 1];
  }

  /* Puffy cloud whose flat base sits on y. */
  function drawCloud(ctx, x, y, w, fill) {
    const r = w * 0.2;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const c of [[-0.3, -0.25, 0.9], [-0.05, -0.55, 1.25], [0.25, -0.35, 1], [0.42, -0.1, 0.7], [-0.45, -0.05, 0.6]]) {
      const cx = x + c[0] * w;
      const cy = y + c[1] * r * 1.2;
      ctx.moveTo(cx + r * c[2], cy);
      ctx.arc(cx, cy, r * c[2], 0, TAU);
    }
    ctx.fill();
    U.roundRect(ctx, x - w * 0.5, y - r * 0.5, w, r * 0.8, r * 0.4);
    ctx.fill();
  }

  function drawCoin(ctx, x, y, r, spin) {
    const sx = Math.max(0.15, Math.abs(Math.cos(spin)));
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.ellipse(x, y, r * sx, r, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = U.alpha(C.ink, 0.35);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(x, y, r * sx * 0.6, r * 0.6, 0, 0, TAU);
    ctx.stroke();
  }

  function drawPlatform(ctx, p, t) {
    const x = p.x - p.w / 2;
    if (p.type === 'ground') {
      ctx.fillStyle = mixHex(C.mint, C.panel, 0.55);
      ctx.fillRect(-10, p.y, W + 20, 400);
      ctx.fillStyle = C.mint;
      ctx.fillRect(-10, p.y, W + 20, 8);
      return;
    }
    if (p.type === 'cloud') {
      const a = p.vis;
      if (a <= 0.02) return;
      drawCloud(ctx, p.x, p.y + 10, p.w, U.alpha(C.text, 0.25 + a * 0.6));
      return;
    }
    ctx.save();
    if (p.broken) {
      ctx.globalAlpha = Math.max(0, 1 - p.fall / 0.8);
      ctx.translate(0, p.fall * p.fall * 300);
    }
    const color = p.type === 'moving' ? C.p2 : p.type === 'crumble' ? C.gold : C.mint;
    if (p.type === 'spring') {
      const sq = p.boing > 0 ? Math.sin(p.boing * 14) * p.boing * 6 : 0;
      ctx.strokeStyle = C.p1;
      ctx.lineWidth = 3;
      ctx.beginPath();
      const top = p.y - 14 + sq;
      for (let k = 0; k <= 4; k++) {
        const yy = p.y - (k / 4) * (p.y - top);
        ctx.lineTo(p.x + (k % 2 ? 7 : -7), yy);
      }
      ctx.stroke();
      ctx.fillStyle = C.p1;
      ctx.fillRect(p.x - 10, top - 3, 20, 4);
    }
    if (p.broken) {
      // Two halves tumbling apart.
      const off = p.fall * 30;
      ctx.fillStyle = color;
      U.roundRect(ctx, x - off, p.y, p.w / 2 - 2, 12, 6);
      ctx.fill();
      U.roundRect(ctx, x + p.w / 2 + 2 + off, p.y, p.w / 2 - 2, 12, 6);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      U.roundRect(ctx, x, p.y, p.w, 12, 6);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.text, 0.35);
      ctx.fillRect(x + 6, p.y + 2, p.w - 12, 2);
      if (p.type === 'crumble') {
        ctx.strokeStyle = U.alpha(C.ink, 0.6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p.x - 6, p.y);
        ctx.lineTo(p.x + 2, p.y + 6);
        ctx.lineTo(p.x - 3, p.y + 12);
        ctx.moveTo(x + p.w * 0.78, p.y);
        ctx.lineTo(x + p.w * 0.72, p.y + 7);
        ctx.stroke();
      } else if (p.type === 'moving') {
        ctx.fillStyle = U.alpha(C.ink, 0.55);
        for (const s of [-1, 1]) {
          const ax = p.x + s * (p.w / 2 - 9);
          ctx.beginPath();
          ctx.moveTo(ax + s * 4, p.y + 6);
          ctx.lineTo(ax - s * 2, p.y + 2.5);
          ctx.lineTo(ax - s * 2, p.y + 9.5);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  /* Hopper anchored at its feet so squash keeps it planted. */
  function drawHopper(ctx, x, feetY, sx, sy, face, look, stunned, t) {
    ctx.save();
    ctx.translate(x, feetY);
    ctx.scale(sx, sy);
    ctx.fillStyle = stunned ? mixHex(C.p1, C.text, 0.4 + Math.sin(t * 30) * 0.3) : C.p1;
    U.roundRect(ctx, -PW / 2, -PH, PW, PH, 14);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, 0.25);
    U.roundRect(ctx, -PW / 2 + 5, -PH + 4, PW - 18, 6, 3);
    ctx.fill();
    ctx.fillStyle = mixHex(C.p1, C.gold, 0.5);
    U.roundRect(ctx, -PW / 2 + 7, -12, PW - 14, 9, 4.5);
    ctx.fill();
    const ex = face * 4;
    const ey = -PH * 0.62 + look * 2;
    for (const s of [-1, 1]) {
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.arc(ex + s * 7, ey, 5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      if (stunned) {
        ctx.arc(ex + s * 7 + Math.cos(t * 12 + s) * 2, ey + Math.sin(t * 12 + s) * 2, 2, 0, TAU);
      } else {
        ctx.arc(ex + s * 7 + face * 1.6, ey + look * 1.5, 2.4, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSpike(ctx, x, y, r, spin) {
    ctx.fillStyle = C.violet;
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + spin;
      const rr = k % 2 ? r * 0.62 : r * 1.15;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x - 3.5, y - 1, 2.2, 0, TAU);
    ctx.arc(x + 3.5, y - 1, 2.2, 0, TAU);
    ctx.fill();
  }

  function wrapDx(a, b) {
    let d = a - b;
    if (d > W / 2) d -= W;
    else if (d < -W / 2) d += W;
    return d;
  }

  Arcade.register({
    id: 'sky-hopper',
    title: 'Sky Hopper',
    mode: 'solo',
    players: '1P',
    color: C.gold,
    tagline: 'Bounce from platform to platform and climb as high as you can.',
    hook: 'Spend 5 coins to drop a rescue cloud under your feet when you fall.',
    tags: ['arcade', 'endless', 'jumping', 'keyboard', 'touch'],
    howTo: 'You bounce automatically whenever you land on a platform; steer left and right to pick where you land. ' +
      'Leaving one side of the screen brings you back on the other. Blue platforms move, cracked gold ones break after ' +
      'one bounce, springs launch you high and pale clouds fade in and out. Grab a jetpack for a 3 second boost. ' +
      'Above 1500 m, spiky floaters knock you down. Collect coins: when a fall looks fatal, spend 5 to drop a ' +
      'rescue cloud right under your feet. Score is your best height in meters plus 5 per coin collected.',
    controls: [
      { keys: ['←', '→'], label: 'Steer' },
      { keys: ['A', 'D'], label: 'Steer' },
      { keys: ['Hold left / right'], label: 'Steer on a touch screen' },
      { keys: ['Space', 'Cloud button'], label: 'Rescue cloud (5 coins)' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, C.panel);
      g.addColorStop(1, mixHex(C.p1, C.panel2, 0.6));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let k = 0; k < 24; k++) {
        ctx.fillStyle = U.alpha(C.text, 0.15 + (k % 3) * 0.12);
        ctx.fillRect((k * 97) % w, (k * 53) % (h * 0.6), 2, 2);
      }
      drawCloud(ctx, w * 0.15, h * 0.32, 70, U.alpha(C.text, 0.12));
      drawCloud(ctx, w * 0.82, h * 0.6, 90, U.alpha(C.text, 0.1));
      const plats = [
        { type: 'normal', x: w * 0.18, y: h * 0.78, w: 64 },
        { type: 'moving', x: w * 0.8, y: h * 0.42, w: 64 },
        { type: 'crumble', x: w * 0.3, y: h * 0.22, w: 60 },
        { type: 'spring', x: w * 0.72, y: h * 0.9, w: 60, boing: 0 }
      ];
      for (const p of plats) drawPlatform(ctx, p, t);
      for (let k = 0; k < 4; k++) drawCoin(ctx, w * 0.62 + k * 22, h * 0.24 - Math.sin(k * 0.8) * 10, 7, t * 4 + k);
      // Hopper bouncing on its gold rescue cloud.
      const cx = w * 0.47;
      const cy = h * 0.8;
      ctx.shadowColor = C.gold;
      ctx.shadowBlur = 16;
      drawCloud(ctx, cx, cy, 96, U.alpha(C.gold, 0.85));
      ctx.shadowBlur = 0;
      const bounce = Math.abs(Math.sin(t * 3));
      const sq = Math.max(0, 0.25 - bounce) * 1.2;
      drawHopper(ctx, cx, cy - 10 - bounce * 62, 1 + sq - bounce * 0.08, 1 - sq + bounce * 0.12, 1, 1, false, t);
      ctx.fillStyle = U.alpha(C.ink, 0.75);
      U.roundRect(ctx, cx + 42, cy - 4, 52, 24, 12);
      ctx.fill();
      drawCoin(ctx, cx + 56, cy + 8, 7, 0);
      ctx.font = FONT_HUD;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText('−5', cx + 67, cy + 9);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'fall' | 'over'
      let p, camY, genY, mainX, lastMain, platforms, coinsList, items, spikes, rescue;
      let coins, coinsTotal, maxH, clock, deadT, shake, nextMilestone, cloudsUsed;
      let particles = [];
      let banner = null;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      let lastScore = -1;
      const told = {};
      const pointers = new Map();
      const stars = [];
      for (let k = 0; k < 90; k++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: U.pick([0.02, 0.05, 0.1]), s: U.rand(1, 2.4) });
      const decor = [];
      for (let k = 0; k < 7; k++) decor.push({ x: Math.random() * W, y: Math.random() * (H + 200), w: U.rand(80, 160), f: U.pick([0.15, 0.3]) });
      clock = 0;

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function tellOnce(key, text, secs) {
        if (told[key]) return;
        told[key] = true;
        setHint(text, secs || 5);
      }

      function burst(x, y, n, colors, speed, grav) {
        for (let k = 0; k < n && particles.length < 300; k++) {
          const a = Math.random() * TAU;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: grav, life: U.rand(0.35, 0.8), size: U.rand(2, 5), color: U.pick(colors) });
        }
      }

      function meters(y) {
        return Math.max(0, -y / PX_PER_M);
      }

      function addPlatform(type, x, y, w, diff) {
        const pl = { type, x, y, w, broken: false, fall: 0, boing: 0, vis: 1, vx: 0, phase: Math.random() * TAU };
        if (type === 'moving') pl.vx = (Math.random() < 0.5 ? -1 : 1) * (40 + diff * 80);
        platforms.push(pl);
        return pl;
      }

      function addRow() {
        const m = meters(genY);
        const diff = U.clamp(m / 3000, 0, 1);
        // After a crumbling platform keep the next hop easy: you only get one bounce there.
        const gap = U.rand(60, lastMain === 'crumble' ? 120 : 85 + diff * 100);
        genY -= gap;
        const w = Math.round(78 - diff * 22);
        let x = mainX + U.rand(-190, 190);
        x = U.clamp(((x % W) + W) % W, w / 2 + 4, W - w / 2 - 4);
        let type = 'normal';
        const r = Math.random();
        if (m > 40) {
          const pMove = lastMain === 'crumble' ? 0 : 0.08 + diff * 0.25;
          const pCrumble = 0.04 + diff * 0.16;
          if (r < 0.07) type = 'spring';
          else if (r < 0.07 + pMove) type = 'moving';
          else if (r < 0.07 + pMove + pCrumble) type = 'crumble';
        }
        addPlatform(type, x, genY, w, diff);
        mainX = x;
        lastMain = type;
        if (Math.random() < 0.32 && coinsList.length < 40) {
          const n = U.randInt(1, 3);
          for (let k = 0; k < n; k++) coinsList.push({ x, y: genY - 34 - k * 28, spin: Math.random() * TAU });
        }
        // Decoys: fading clouds and extra cracked platforms off the main path.
        if (Math.random() < 0.3 + diff * 0.2) {
          const ex = U.rand(40, W - 40);
          if (Math.abs(wrapDx(ex, x)) > w + 30) {
            const et = m > 250 && Math.random() < 0.6 ? 'cloud' : Math.random() < 0.5 ? 'crumble' : 'normal';
            addPlatform(et, ex, genY + U.rand(-gap * 0.4, gap * 0.4), et === 'cloud' ? w + 16 : w, diff);
          }
        }
        if (m > 120 && !items.length && Math.random() < 0.012) items.push({ x, y: genY - 32, type: 'jet' });
        if (m > 1500 && spikes.length < 6 && Math.random() < Math.min(0.22, 0.07 + (m - 1500) / 12000)) {
          let sx = x + (Math.random() < 0.5 ? -1 : 1) * U.rand(110, 200);
          sx = U.clamp(((sx % W) + W) % W, 30, W - 30);
          spikes.push({ x: sx, y: genY + gap * 0.5, vx: U.rand(25, 60) * (Math.random() < 0.5 ? -1 : 1), r: 15, spin: 0 });
        }
      }

      function startRun() {
        p = { x: W / 2, y: -PH / 2, vx: 0, vy: -JUMP, sq: 0, face: 1, stunT: 0, jetT: 0 };
        camY = -H + 140;
        genY = 0;
        mainX = W / 2;
        lastMain = 'normal';
        platforms = [{ type: 'ground', x: W / 2, y: 0, w: W * 2, broken: false, fall: 0, boing: 0, vis: 1, vx: 0 }];
        coinsList = [];
        items = [];
        spikes = [];
        rescue = null;
        coins = 0;
        coinsTotal = 0;
        cloudsUsed = 0;
        maxH = 0;
        deadT = 0;
        shake = 0;
        nextMilestone = 500;
        particles = [];
        banner = null;
        lastScore = -1;
        lastStatus = '';
        pointers.clear();
        while (genY > camY - 300) addRow();
        state = 'play';
        api.setScore(0);
        setHint('Steer with ←/→, A/D or by holding a side of the screen. Grab coins: 5 buy a rescue cloud.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Sky Hopper',
          text: 'Steer with arrows, A/D or by holding a screen side. Space or the cloud button drops a rescue cloud for 5 coins.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function score() {
        return Math.floor(maxH) + coinsTotal * COIN_PTS;
      }

      function gameOver() {
        state = 'over';
        const s = score();
        api.setScore(s);
        const isBest = api.reportScore(s);
        api.menu({
          title: isBest ? 'New best: ' + s + '!' : 'Game over',
          text: 'You climbed ' + Math.floor(maxH) + ' m and collected ' + coinsTotal + ' coin' + (coinsTotal === 1 ? '' : 's') +
            (cloudsUsed ? ', using ' + cloudsUsed + ' rescue cloud' + (cloudsUsed === 1 ? '' : 's') : '') + '.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      function useCloud() {
        if (state !== 'play') return;
        if (rescue) {
          setHint('Your rescue cloud is already out.', 2);
          return;
        }
        if (p.jetT > 0) return;
        if (coins < CLOUD_COST) {
          setHint('A rescue cloud costs ' + CLOUD_COST + ' coins. You have ' + coins + '.', 3);
          api.sfx('tick');
          return;
        }
        coins -= CLOUD_COST;
        cloudsUsed++;
        rescue = { x: U.clamp(p.x, 50, W - 50), y: p.y + PH / 2 + 12, w: 100, t: 0 };
        burst(rescue.x, rescue.y, 24, [C.gold, C.text], 180, 0);
        api.sfx('power');
        tellOnce('used', 'Rescue cloud out! It bounces you once, then puffs away.', 4);
      }

      function land(pl) {
        p.y = pl.y - PH / 2;
        p.sq = 1;
        burst(p.x, pl.y, 6, [C.text, C.muted], 90, 200);
        if (pl.type === 'spring') {
          p.vy = -SPRING;
          pl.boing = 1;
          api.sfx('flip');
          tellOnce('spring', 'Springs launch you extra high.', 3);
          return;
        }
        p.vy = -JUMP;
        if (pl.type === 'crumble') {
          pl.broken = true;
          burst(pl.x, pl.y + 6, 12, [C.gold], 140, 500);
          api.sfx('hit');
          tellOnce('crumble', 'Cracked gold platforms break after one bounce.', 4);
        } else {
          api.sfx('tick');
          if (pl.type === 'cloud') tellOnce('cloud', 'Pale clouds fade in and out. Only land on them while they are solid.', 4);
        }
      }

      function knock(s) {
        p.vy = Math.max(p.vy, 380);
        p.vx = wrapDx(p.x, s.x) > 0 ? 220 : -220;
        p.stunT = 0.5;
        shake = 12;
        burst(p.x, p.y, 16, [C.violet, C.p1], 220, 300);
        api.sfx('hit');
        tellOnce('spike', 'Spikes knock you down. Have 5 coins ready for a rescue cloud up here.', 5);
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) useCloud();
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const q = api.toCanvas(e, canvas);
        if (Math.hypot(q.x - BTN.x, q.y - BTN.y) <= BTN.r + 8) {
          useCloud();
          return;
        }
        try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
        pointers.set(e.pointerId, q.x < W / 2 ? -1 : 1);
      });
      api.on(canvas, 'pointermove', (e) => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, api.toCanvas(e, canvas).x < W / 2 ? -1 : 1);
      });
      const release = (e) => pointers.delete(e.pointerId);
      api.on(canvas, 'pointerup', release, { always: true });
      api.on(canvas, 'pointercancel', release, { always: true });

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        if (hintT > 0) hintT -= dt;
        shake = Math.max(0, shake - dt * 30);
        for (const q of particles) {
          q.vy += q.g * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.life -= dt;
        }
        particles = particles.filter((q) => q.life > 0);
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.8) banner = null;
        }
        if (state === 'fall') {
          p.vy += GRAV * dt;
          p.y += p.vy * dt;
          if ((deadT -= dt) <= 0) gameOver();
          return;
        }
        if (state !== 'play') return;

        // Steering with momentum.
        let steer = 0;
        if (api.keys.has('ArrowLeft') || api.keys.has('KeyA')) steer -= 1;
        if (api.keys.has('ArrowRight') || api.keys.has('KeyD')) steer += 1;
        for (const v of pointers.values()) steer += v;
        steer = U.clamp(steer, -1, 1);
        if (p.stunT > 0) {
          p.stunT -= dt;
          steer = 0;
        }
        if (steer) {
          p.vx += steer * ACCEL * dt;
          p.face = steer;
        } else {
          const f = FRICTION * dt;
          p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - Math.sign(p.vx) * f;
        }
        p.vx = U.clamp(p.vx, -MAX_VX, MAX_VX);

        if (p.jetT > 0) {
          p.jetT -= dt;
          p.vy = -JET_V;
          if (particles.length < 300) {
            particles.push({ x: p.x + U.rand(-6, 6), y: p.y + PH / 2, vx: U.rand(-40, 40), vy: U.rand(150, 300), g: 0, life: 0.4, size: U.rand(3, 6), color: U.pick([C.gold, C.p1, C.text]) });
          }
        } else {
          p.vy = Math.min(1400, p.vy + GRAV * dt);
        }
        p.sq = Math.max(0, p.sq - dt * 5);

        // Platforms move / crumble / fade.
        for (const pl of platforms) {
          if (pl.vx) {
            pl.x += pl.vx * dt;
            if (pl.x < pl.w / 2) { pl.x = pl.w / 2; pl.vx = Math.abs(pl.vx); }
            else if (pl.x > W - pl.w / 2) { pl.x = W - pl.w / 2; pl.vx = -Math.abs(pl.vx); }
          }
          if (pl.broken) pl.fall += dt;
          if (pl.boing > 0) pl.boing = Math.max(0, pl.boing - dt * 2);
          if (pl.type === 'cloud') {
            const c = (clock * 0.32 + pl.phase / TAU) % 1; // ~3.1 s cycle: solid, fade, gone, return
            pl.vis = c < 0.6 ? 1 : c < 0.72 ? 1 - (c - 0.6) / 0.12 : c < 0.88 ? 0 : (c - 0.88) / 0.12;
          }
        }
        for (const s of spikes) {
          s.x += s.vx * dt;
          s.spin += dt * 2;
          if (s.x < 20 || s.x > W - 20) s.vx = -s.vx;
        }
        if (rescue) {
          rescue.t += dt;
          if (rescue.t > 6 || rescue.y > camY + H + 40) {
            burst(rescue.x, rescue.y, 14, [C.gold, C.text], 120, 0);
            rescue = null;
          }
        }

        // Move in sub-steps so fast falls and jetpack climbs never skip anything.
        const steps = Math.max(1, Math.ceil(Math.abs(p.vy * dt) / 12));
        for (let s = 0; s < steps; s++) {
          const prevFeet = p.y + PH / 2;
          p.y += (p.vy * dt) / steps;
          p.x += (p.vx * dt) / steps;
          if (p.x < 0) p.x += W;
          else if (p.x >= W) p.x -= W;
          const feet = p.y + PH / 2;
          if (p.vy > 0 && p.jetT <= 0) {
            if (rescue && prevFeet <= rescue.y + 2 && feet >= rescue.y && Math.abs(wrapDx(p.x, rescue.x)) < rescue.w / 2 + 6) {
              p.y = rescue.y - PH / 2;
              p.vy = -CLOUD_JUMP;
              p.sq = 1;
              burst(rescue.x, rescue.y, 30, [C.gold, C.text, C.gold], 220, 60);
              rescue = null;
              api.sfx('score');
            } else {
              for (const pl of platforms) {
                if (pl.broken || (pl.type === 'cloud' && pl.vis < 0.5)) continue;
                if (prevFeet <= pl.y + 2 && feet >= pl.y && Math.abs(wrapDx(p.x, pl.x)) < pl.w / 2 + PW * 0.3) {
                  land(pl);
                  break;
                }
              }
            }
          }
          for (const c of coinsList) {
            if (!c.taken && Math.abs(wrapDx(p.x, c.x)) < 22 && Math.abs(p.y - c.y) < 24) {
              c.taken = true;
              coins++;
              coinsTotal++;
              burst(c.x, c.y, 8, [C.gold, C.text], 120, 0);
              api.sfx('blip');
            }
          }
          for (const it of items) {
            if (!it.taken && Math.abs(wrapDx(p.x, it.x)) < 26 && Math.abs(p.y - it.y) < 28) {
              it.taken = true;
              p.jetT = 3;
              api.sfx('power');
              tellOnce('jet', 'Jetpack! Three seconds of free flight that smashes spikes.', 4);
            }
          }
          for (const sp of spikes) {
            if (sp.dead || Math.hypot(wrapDx(p.x, sp.x), p.y - sp.y) > sp.r + 14) continue;
            if (p.jetT > 0) {
              sp.dead = true;
              burst(sp.x, sp.y, 24, [C.violet, C.text], 260, 200);
              shake = 8;
              api.sfx('boom');
            } else if (p.stunT <= 0) {
              knock(sp);
            }
          }
        }

        // Height, camera, milestones.
        const h = meters(p.y + PH / 2);
        if (h > maxH) maxH = h;
        const target = p.y - H * 0.42;
        if (target < camY) camY += (target - camY) * Math.min(1, dt * 10);
        if (maxH >= nextMilestone) {
          banner = { text: nextMilestone + ' m', sub: nextMilestone === 1500 ? 'Spikes ahead. Keep coins for clouds.' : 'Keep climbing!', t: 0 };
          api.sfx('win');
          nextMilestone += 500;
        }

        // Spawn ahead, cull behind.
        while (genY > camY - 300) addRow();
        const cut = camY + H + 80;
        platforms = platforms.filter((pl) => pl.y < cut && pl.fall < 1);
        coinsList = coinsList.filter((c) => !c.taken && c.y < cut);
        items = items.filter((it) => !it.taken && it.y < cut);
        spikes = spikes.filter((s) => !s.dead && s.y < cut);

        // First time a rescue would help: you can afford one and you are falling low on screen.
        if (coins >= CLOUD_COST && !rescue && p.vy > 250 && p.y - camY > H * 0.6) {
          tellOnce('afford', 'Falling? Press Space or tap the gold cloud button to spend 5 coins on a rescue cloud.', 6);
        }

        if (p.y - PH / 2 > camY + H) {
          state = 'fall';
          deadT = 0.6;
          shake = 10;
          api.sfx('lose');
          api.setStatus('You fell from ' + Math.floor(maxH) + ' m.');
          lastStatus = '';
          return;
        }

        const sc = score();
        if (sc !== lastScore) {
          api.setScore(sc);
          lastScore = sc;
        }
        const status = hintT > 0 ? hint
          : 'Height ' + Math.floor(h) + ' m · Best this run ' + Math.floor(maxH) + ' m · Coins ' + coins +
            (coins >= CLOUD_COST ? ' · Rescue cloud ready' : '');
        if (status !== lastStatus) {
          api.setStatus(status);
          lastStatus = status;
        }
      }

      /* ---------- Draw ---------- */

      function drawBackground(m) {
        const sky = skyAt(m);
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, sky.top);
        g.addColorStop(1, sky.bot);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        const starA = U.clamp(0.2 + m / 1500, 0.2, 1);
        for (const s of stars) {
          const y = (((s.y - camY * s.z) % H) + H) % H;
          ctx.fillStyle = U.alpha(C.text, starA * (0.3 + s.z * 5));
          ctx.fillRect(s.x, y, s.s, s.s);
        }
        // Distant hills near the ground, sliding away faster than the stars.
        const hillY = -camY * 0.4 + H * 0.35;
        if (hillY < H + 120) {
          ctx.fillStyle = U.alpha(C.violet, 0.25);
          ctx.beginPath();
          ctx.moveTo(0, H);
          for (let x = 0; x <= W; x += 24) ctx.lineTo(x, hillY + Math.sin(x * 0.018) * 40 + Math.sin(x * 0.05) * 12);
          ctx.lineTo(W, H);
          ctx.fill();
        }
        for (const d of decor) {
          const y = (((d.y - camY * d.f) % (H + 200)) + H + 200) % (H + 200) - 100;
          drawCloud(ctx, d.x, y, d.w, U.alpha(C.text, d.f * 0.25));
        }
      }

      function drawButton() {
        const ready = coins >= CLOUD_COST && !rescue && p.jetT <= 0;
        const urgent = ready && p.vy > 250 && p.y - camY > H * 0.55;
        ctx.fillStyle = ready ? U.alpha(C.gold, urgent ? 0.4 + Math.sin(clock * 12) * 0.15 : 0.25) : U.alpha(C.panel, 0.7);
        ctx.beginPath();
        ctx.arc(BTN.x, BTN.y, BTN.r, 0, TAU);
        ctx.fill();
        if (ready) {
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = urgent ? 22 : 12;
        }
        ctx.strokeStyle = ready ? C.gold : C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.shadowBlur = 0;
        drawCloud(ctx, BTN.x, BTN.y + 4, 44, ready ? C.gold : U.alpha(C.muted, 0.6));
        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ready ? C.text : C.muted;
        ctx.fillText(Math.min(coins, CLOUD_COST) + '/' + CLOUD_COST, BTN.x, BTN.y + 22);
      }

      function draw() {
        if (!p) {
          drawBackground(0);
          return;
        }
        drawBackground(maxH);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.translate(0, -camY);
        const top = camY - 40;
        const bottom = camY + H + 40;
        for (const pl of platforms) if (pl.y > top && pl.y < bottom) drawPlatform(ctx, pl, clock);
        for (const c of coinsList) if (c.y > top && c.y < bottom) drawCoin(ctx, c.x, c.y, 8, clock * 4 + c.spin);
        for (const it of items) {
          const y = it.y + Math.sin(clock * 3) * 4;
          ctx.shadowColor = C.p1;
          ctx.shadowBlur = 14;
          ctx.fillStyle = C.p1;
          U.roundRect(ctx, it.x - 10, y - 14, 20, 26, 6);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = C.gold;
          ctx.beginPath();
          ctx.moveTo(it.x - 6, y + 12);
          ctx.lineTo(it.x, y + 22 + Math.sin(clock * 20) * 3);
          ctx.lineTo(it.x + 6, y + 12);
          ctx.fill();
        }
        for (const s of spikes) drawSpike(ctx, s.x, s.y, s.r, s.spin);
        if (rescue) {
          const pop = Math.min(1, rescue.t * 6);
          const fade = rescue.t > 5 ? 1 - (rescue.t - 5) : 1;
          ctx.globalAlpha = Math.max(0, fade);
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 18;
          drawCloud(ctx, rescue.x, rescue.y + 12, rescue.w * (0.5 + pop * 0.5), U.alpha(C.gold, 0.9));
          ctx.shadowBlur = 0;
          ctx.globalAlpha = 1;
        }
        for (const q of particles) {
          ctx.globalAlpha = Math.min(1, q.life * 2.5);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        // Hopper with squash on landing and stretch while flying; drawn twice near the wrap edges.
        const stretch = U.clamp(-p.vy / 2600, -0.12, 0.3);
        const sx = 1 + p.sq * 0.35 - stretch * 0.5;
        const sy = 1 - p.sq * 0.35 + stretch;
        const look = U.clamp(p.vy / 600, -1, 1);
        for (const off of [0, -W, W]) {
          const x = p.x + off;
          if (x < -PW || x > W + PW) continue;
          drawHopper(ctx, x, p.y + PH / 2, sx, sy, p.face, look, p.stunT > 0, clock);
        }
        ctx.restore();

        // HUD.
        ctx.font = FONT_HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = U.alpha(C.ink, 0.55);
        U.roundRect(ctx, 10, 10, 120, 30, 15);
        ctx.fill();
        U.roundRect(ctx, W - 100, 10, 90, 30, 15);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.fillText(Math.floor(maxH) + ' m', 24, 26);
        drawCoin(ctx, W - 82, 25, 8, clock * 3);
        ctx.fillStyle = C.gold;
        ctx.fillText('× ' + coins, W - 68, 26);
        if (p.jetT > 0) {
          ctx.fillStyle = C.p1;
          U.roundRect(ctx, W / 2 - 60, 18, 120 * (p.jetT / 3), 8, 4);
          ctx.fill();
        }
        drawButton();
        if (banner) {
          const a = Math.min(1, banner.t * 5, (1.8 - banner.t) * 3);
          ctx.globalAlpha = Math.max(0, a);
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.gold;
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 16;
          ctx.fillText(banner.text, W / 2, H * 0.26);
          ctx.shadowBlur = 0;
          ctx.font = FONT_HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(banner.sub, W / 2, H * 0.26 + 40);
          ctx.globalAlpha = 1;
        }
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
