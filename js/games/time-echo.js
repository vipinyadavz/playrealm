/* Time Echo — collect orbs while ghosts replay your own recent path. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 500;
  const TAU = Math.PI * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const TICK = 1 / 60;
  const ECHO_EVERY = 6;
  const HIST = ECHO_EVERY * 60; // one sample per tick: an echo path is the last 6 s
  const FADE_IN = 1;
  const PR = 9;
  const ER = 9;
  const MAXV = 250;
  const MARGIN = 16;
  const QUICK = 3;
  const MAX_CHARGES = 2;
  const ORBS_PER_CHARGE = 3;
  const MAX_ECHOES = 24;
  const BTN = { x: W - 54, y: H - 54, r: 32 };

  function ghostBody(ctx, x, y, a, r) {
    ctx.fillStyle = U.alpha(C.violet, 0.18 * a);
    ctx.beginPath();
    ctx.arc(x, y, r * 2.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.violet, 0.75 * a);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, 0.55 * a);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.35, 0, TAU);
    ctx.fill();
  }

  function playerBody(ctx, x, y, r) {
    ctx.fillStyle = U.alpha(C.p2, 0.16);
    ctx.beginPath();
    ctx.arc(x, y, r * 2.8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.p2, 0.35);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.p2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.4, 0, TAU);
    ctx.fill();
  }

  function orbBody(ctx, x, y, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    ctx.fillStyle = U.alpha(C.gold, 0.15 + p * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, 20 + p * 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = U.alpha(C.gold, 0.8);
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = t * 1.5 + (i * TAU) / 4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
      ctx.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
      ctx.stroke();
    }
  }

  function timerRing(ctx, x, y, r, frac, warn) {
    ctx.lineWidth = 3;
    ctx.strokeStyle = U.alpha(C.line, 0.9);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = warn ? C.p1 : C.violet;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.stroke();
  }

  Arcade.register({
    id: 'time-echo',
    title: 'Time Echo',
    mode: 'solo',
    players: '1P',
    original: true,
    color: C.violet,
    tagline: 'Collect orbs while dodging ghosts of your own past moves.',
    hook: 'Every 6 seconds a ghost spawns and replays exactly what you just did.',
    tags: ['arcade', 'dodge', 'ghosts', 'keyboard', 'touch'],
    howTo: 'Move the glowing dot to collect gold orbs, one at a time. Every 6 seconds an echo appears where you were ' +
      '6 seconds ago and retraces your path, then walks it back and forth forever. New echoes are harmless while they ' +
      'fade in; after that, touching one ends the run. Grab orbs quickly for a bonus, skim past echoes for close-call ' +
      'points, and spend a Rewind (earned every 3 orbs, hold up to 2) to erase your oldest echo.',
    controls: [
      { keys: ['↑', '↓', '←', '→'], label: 'Move' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Move' },
      { keys: ['Space'], label: 'Rewind: erase the oldest echo' },
      { keys: ['Hold'], label: 'Move toward the pointer; tap the round button to rewind' }
    ],
    best: 'high',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.line, 0.5);
      for (let x = 10; x < w; x += 20) {
        for (let y = 10; y < h; y += 20) ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      const path = (s) => ({
        x: w * 0.08 + s * w * 0.84,
        y: h * 0.55 + Math.sin(s * 7.5) * h * 0.24 + Math.sin(s * 3) * h * 0.06
      });
      // Faint recorded path that the echoes walk.
      ctx.strokeStyle = U.alpha(C.violet, 0.28);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const p = path(i / 60);
        if (i) ctx.lineTo(p.x, p.y);
        else ctx.moveTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      const sp = 0.66 + 0.26 * (0.5 - 0.5 * Math.cos(t * 0.7));
      // Player trail.
      for (let k = 12; k >= 1; k--) {
        const p = path(Math.max(0, sp - k * 0.012));
        ctx.fillStyle = U.alpha(C.p2, 0.35 * (1 - k / 13));
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, TAU);
        ctx.fill();
      }
      const ghosts = [sp - 0.42, 0.62 - sp * 0.5];
      ghosts.forEach((gs, gi) => {
        const s = U.clamp(gs, 0.02, 0.98);
        for (let k = 8; k >= 1; k--) {
          const p = path(U.clamp(s - (gi ? -1 : 1) * k * 0.012, 0, 1));
          ghostBody(ctx, p.x, p.y, 0.25 * (1 - k / 9), 4);
        }
        const p = path(s);
        ghostBody(ctx, p.x, p.y, 1, 8);
      });
      // A new echo forming at the start of the path.
      const f = path(0.02);
      ctx.strokeStyle = U.alpha(C.violet, 0.8);
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, 10 + 4 * Math.sin(t * 4), 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      orbBody(ctx, w * 0.7, h * 0.2, t);
      const p = path(sp);
      playerBody(ctx, p.x, p.y, 7);
      timerRing(ctx, p.x, p.y, 17, (t * 0.18 + 0.55) % 1, false);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      canvas.style.touchAction = 'none';

      const hist = new Float32Array(HIST * 2);
      const seen = {};
      const pointer = { down: false, x: 0, y: 0 };
      let state = 'menu'; // 'menu' | 'play' | 'dying' | 'over'
      let histHead, player, echoes, orb, fading, parts, texts, killer;
      let score, orbs, streak, charges, chargeProg, echoT, acc, clock, shake, flash, deadT;
      let hint, hintT, lastStatus, rewindFx, banner, spawned;

      function reset() {
        player = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
        histHead = 0;
        for (let i = 0; i < HIST; i++) {
          hist[i * 2] = player.x;
          hist[i * 2 + 1] = player.y;
        }
        echoes = [];
        fading = [];
        parts = [];
        texts = [];
        killer = null;
        orb = null;
        score = 0;
        orbs = 0;
        streak = 0;
        charges = 0;
        chargeProg = 0;
        echoT = ECHO_EVERY;
        acc = 0;
        clock = 0;
        shake = 0;
        flash = 0;
        deadT = 0;
        hint = '';
        hintT = 0;
        lastStatus = '';
        rewindFx = 0;
        banner = null;
        spawned = 0;
        pointer.down = false;
        api.setScore(0);
      }

      function say(text, secs) {
        hint = text;
        hintT = secs;
      }

      function refreshStatus() {
        let s;
        if (state === 'menu') s = 'Every 6 seconds a ghost of you replays your last 6 seconds.';
        else if (hintT > 0) s = hint;
        else {
          s = 'Echoes ' + echoes.length + ' · Rewinds ' + charges + '/' + MAX_CHARGES + ' · Orbs ' + orbs +
            ' · Next echo in ' + Math.max(1, Math.ceil(echoT)) + 's';
        }
        if (s !== lastStatus) {
          lastStatus = s;
          api.setStatus(s);
        }
      }

      function addScore(n) {
        score += n;
        api.setScore(score);
      }

      function burst(x, y, color, n, speed, life) {
        for (let i = 0; i < n && parts.length < 500; i++) {
          const a = Math.random() * TAU;
          const v = Math.random() * speed;
          const l = (life || 0.7) * U.rand(0.5, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, color, size: U.rand(1.5, 3.5) });
        }
      }

      function popText(x, y, text, color) {
        if (texts.length > 16) texts.shift();
        texts.push({ x: U.clamp(x, 70, W - 70), y: Math.max(24, y), text, color, life: 1.1 });
      }

      /* Sample k ticks ago (0 = newest). */
      function histAt(k) {
        const i = (histHead - 1 - k + HIST * 2) % HIST;
        return { x: hist[i * 2], y: hist[i * 2 + 1] };
      }

      function record() {
        hist[histHead * 2] = player.x;
        hist[histHead * 2 + 1] = player.y;
        histHead = (histHead + 1) % HIST;
      }

      function spawnOrb() {
        let best = null;
        let bestScore = -1;
        for (let tries = 0; tries < 40; tries++) {
          const x = U.rand(50, W - 50);
          const y = U.rand(50, H - 50);
          if (U.dist(x, y, BTN.x, BTN.y) < BTN.r + 30) continue;
          const dp = U.dist(x, y, player.x, player.y);
          let de = Infinity;
          for (const e of echoes) de = Math.min(de, U.dist(x, y, e.x, e.y));
          if (dp < 140 || de < 50) continue;
          const sc = Math.min(dp, 360) + Math.min(de, 120);
          if (sc > bestScore) {
            bestScore = sc;
            best = { x, y };
          }
        }
        if (!best) best = { x: W - player.x, y: H - player.y };
        orb = { x: best.x, y: best.y, age: 0 };
      }

      function spawnEcho() {
        if (echoes.length >= MAX_ECHOES) eraseEcho(0, true);
        const path = new Float32Array(HIST * 2);
        for (let j = 0; j < HIST; j++) {
          const k = (histHead + j) % HIST;
          path[j * 2] = hist[k * 2];
          path[j * 2 + 1] = hist[k * 2 + 1];
        }
        const e = { path, i: 0, dir: 1, age: 0, x: path[0], y: path[1], near: false, nearCd: 0 };
        echoes.push(e);
        spawned++;
        banner = { text: 'Echo ' + spawned, t: 0 };
        api.sfx('flip');
        for (let i = 0; i < 16 && parts.length < 500; i++) {
          const a = (i / 16) * TAU;
          parts.push({ x: e.x + Math.cos(a) * 40, y: e.y + Math.sin(a) * 40, vx: -Math.cos(a) * 60, vy: -Math.sin(a) * 60, life: 0.6, max: 0.6, color: C.violet, size: 2.5 });
        }
        if (!seen.echo) {
          seen.echo = true;
          say('An echo is forming where you were 6 s ago. Harmless while dashed, then deadly. It walks your path back and forth.', 7);
        }
      }

      function eraseEcho(idx, fx) {
        const e = echoes.splice(idx, 1)[0];
        if (!e || !fx) return;
        fading.push({ path: e.path, x: e.x, y: e.y, t: 0 });
        burst(e.x, e.y, C.violet, 26, 200, 0.9);
        burst(e.x, e.y, C.text, 10, 120, 0.6);
        for (let j = 0; j < HIST; j += 18) {
          if (parts.length >= 500) break;
          parts.push({ x: e.path[j * 2], y: e.path[j * 2 + 1], vx: U.rand(-20, 20), vy: U.rand(-40, -10), life: 0.8, max: 0.8, color: C.violet, size: 2 });
        }
      }

      function rewind() {
        if (state !== 'play') return;
        if (!echoes.length) {
          api.sfx('tick');
          popText(player.x, player.y - 30, 'No echoes yet', C.muted);
          return;
        }
        if (charges <= 0) {
          api.sfx('tick');
          popText(player.x, player.y - 30, (ORBS_PER_CHARGE - chargeProg) + ' more orbs to rewind', C.muted);
          return;
        }
        charges--;
        eraseEcho(0, true);
        rewindFx = 0.6;
        shake = 5;
        api.sfx('power');
        popText(player.x, player.y - 30, 'Oldest echo erased', C.violet);
      }

      function collectOrb() {
        orbs++;
        let gain = 1;
        if (orb.age <= QUICK) {
          streak++;
          gain += Math.min(3, streak);
          popText(orb.x, orb.y - 22, 'Quick +' + gain, C.gold);
        } else {
          streak = 0;
          popText(orb.x, orb.y - 22, '+1', C.gold);
        }
        addScore(gain);
        burst(orb.x, orb.y, C.gold, 22, 220);
        api.sfx('score');
        if (charges < MAX_CHARGES) {
          chargeProg++;
          if (chargeProg >= ORBS_PER_CHARGE) {
            chargeProg = 0;
            charges++;
            api.sfx('power');
            popText(player.x, player.y + 40, 'Rewind ready', C.violet);
            if (!seen.rewind) {
              seen.rewind = true;
              say('Rewind charged: press Space (or the round button) to erase your oldest echo.', 6);
            }
          }
        }
        spawnOrb();
      }

      function die(e) {
        state = 'dying';
        deadT = 1.2;
        killer = e;
        flash = 0.8;
        shake = 14;
        pointer.down = false;
        burst(player.x, player.y, C.p2, 40, 260, 1);
        burst(player.x, player.y, C.violet, 20, 180, 1);
        api.sfx('hit');
      }

      function tick() {
        if (state === 'play') {
          const k = api.keys;
          let ix = 0;
          let iy = 0;
          if (k.has('ArrowLeft') || k.has('KeyA')) ix -= 1;
          if (k.has('ArrowRight') || k.has('KeyD')) ix += 1;
          if (k.has('ArrowUp') || k.has('KeyW')) iy -= 1;
          if (k.has('ArrowDown') || k.has('KeyS')) iy += 1;
          if (ix || iy) {
            const m = Math.hypot(ix, iy);
            ix /= m;
            iy /= m;
          } else if (pointer.down) {
            const dx = pointer.x - player.x;
            const dy = pointer.y - player.y;
            const d = Math.hypot(dx, dy);
            if (d > 3) {
              const s = Math.min(1, d / 50);
              ix = (dx / d) * s;
              iy = (dy / d) * s;
            }
          }
          const ease = 1 - Math.exp(-TICK * 10);
          player.vx += (ix * MAXV - player.vx) * ease;
          player.vy += (iy * MAXV - player.vy) * ease;
          player.x += player.vx * TICK;
          player.y += player.vy * TICK;
          if (player.x < MARGIN || player.x > W - MARGIN) {
            player.x = U.clamp(player.x, MARGIN, W - MARGIN);
            player.vx = 0;
          }
          if (player.y < MARGIN || player.y > H - MARGIN) {
            player.y = U.clamp(player.y, MARGIN, H - MARGIN);
            player.vy = 0;
          }
          record();
          const before = echoT;
          echoT -= TICK;
          if (echoT > 0 && echoT < 3 && Math.ceil(echoT) !== Math.ceil(before)) api.sfx('tick');
          if (echoT <= 0) {
            echoT += ECHO_EVERY;
            spawnEcho();
          }
          if (orb) orb.age += TICK;
        }
        for (const e of echoes) {
          e.age += TICK;
          e.nearCd = Math.max(0, e.nearCd - TICK);
          e.i += e.dir;
          if (e.i >= HIST - 1) {
            e.i = HIST - 1;
            e.dir = -1;
          } else if (e.i <= 0) {
            e.i = 0;
            e.dir = 1;
          }
          e.x = e.path[e.i * 2];
          e.y = e.path[e.i * 2 + 1];
        }
        if (state !== 'play') return;
        for (const e of echoes) {
          if (e.age < FADE_IN) continue;
          const d = U.dist(e.x, e.y, player.x, player.y);
          if (d < PR + ER - 3) {
            die(e);
            return;
          }
          if (d < 30) e.near = true;
          else if (e.near && d > 44) {
            e.near = false;
            if (e.nearCd <= 0) {
              e.nearCd = 1.5;
              addScore(1);
              popText(player.x, player.y - 26, 'Close call +1', C.mint);
              api.sfx('blip');
              if (!seen.close) {
                seen.close = true;
                say('Close call: skimming past a solid echo is worth a bonus point.', 4);
              }
            }
          }
        }
        if (orb && U.dist(orb.x, orb.y, player.x, player.y) < PR + 12) collectOrb();
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 2);
        hintT = Math.max(0, hintT - dt);
        rewindFx = Math.max(0, rewindFx - dt);
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.4) banner = null;
        }
        for (const p of parts) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 2;
          p.vy *= 1 - dt * 2;
        }
        parts = parts.filter((p) => p.life > 0);
        for (const f of fading) f.t += dt;
        fading = fading.filter((f) => f.t < 0.7);
        for (const tx of texts) {
          tx.life -= dt;
          tx.y -= 30 * dt;
        }
        texts = texts.filter((tx) => tx.life > 0);
        if (state === 'play' || state === 'dying') {
          acc += dt;
          while (acc >= TICK) {
            acc -= TICK;
            tick();
          }
        }
        if (state === 'dying') {
          deadT -= dt;
          if (deadT <= 0) gameOver();
        }
        refreshStatus();
      }

      /* ---------- Drawing ---------- */
      function strokePath(path, upto, color, width) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(path[0], path[1]);
        for (let j = 3; j < upto; j += 3) ctx.lineTo(path[j * 2], path[j * 2 + 1]);
        ctx.stroke();
      }

      function drawEcho(e, oldest) {
        const solid = Math.min(1, e.age / FADE_IN);
        strokePath(e.path, HIST, U.alpha(oldest && charges > 0 ? C.p1 : C.violet, oldest && charges > 0 ? 0.16 : 0.08), 2);
        for (let k = 10; k >= 1; k--) {
          const j = U.clamp(e.i - e.dir * k * 2, 0, HIST - 1);
          const a = (1 - k / 11) * 0.35 * solid;
          ctx.fillStyle = U.alpha(C.violet, a);
          ctx.beginPath();
          ctx.arc(e.path[j * 2], e.path[j * 2 + 1], ER * (1 - k / 14), 0, TAU);
          ctx.fill();
        }
        if (solid < 1) {
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = U.alpha(C.violet, 0.4 + solid * 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(e.x, e.y, ER + (1 - solid) * 22, clock * 3, clock * 3 + TAU);
          ctx.stroke();
          ctx.setLineDash([]);
          ghostBody(ctx, e.x, e.y, solid * 0.45, ER);
        } else {
          ghostBody(ctx, e.x, e.y, killer === e ? 1 : 0.85, ER);
        }
        if (oldest && charges > 0 && state === 'play') {
          ctx.strokeStyle = U.alpha(C.p1, 0.6 + 0.3 * Math.sin(clock * 6));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(e.x, e.y, ER + 8, 0, TAU);
          ctx.stroke();
        }
      }

      function drawHud() {
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.violet;
        ctx.fillText('Echoes ' + echoes.length, 16, 22);
        ctx.fillStyle = C.gold;
        ctx.fillText('Orbs ' + orbs, 16, 44);
        if (streak > 0 && state === 'play') {
          ctx.fillStyle = C.mint;
          ctx.fillText('Quick streak ' + streak, 16, 66);
        }
        // Rewind button with charge pips and progress to the next charge.
        const ready = charges > 0 && echoes.length > 0 && state === 'play';
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        ctx.beginPath();
        ctx.arc(BTN.x, BTN.y, BTN.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = ready ? C.violet : C.line;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.fillStyle = ready ? C.text : C.muted;
        for (const ox of [-9, 3]) {
          ctx.beginPath();
          ctx.moveTo(BTN.x + ox, BTN.y - 6);
          ctx.lineTo(BTN.x + ox + 10, BTN.y - 14);
          ctx.lineTo(BTN.x + ox + 10, BTN.y + 2);
          ctx.closePath();
          ctx.fill();
        }
        for (let i = 0; i < MAX_CHARGES; i++) {
          ctx.fillStyle = i < charges ? C.violet : U.alpha(C.line, 1);
          ctx.beginPath();
          ctx.arc(BTN.x - 7 + i * 14, BTN.y + 15, 4.5, 0, TAU);
          ctx.fill();
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('Rewind', BTN.x - BTN.r - 10, BTN.y - 8);
        if (charges < MAX_CHARGES) {
          for (let i = 0; i < ORBS_PER_CHARGE; i++) {
            ctx.fillStyle = i < chargeProg ? C.gold : U.alpha(C.line, 1);
            ctx.fillRect(BTN.x - BTN.r - 40 + i * 10, BTN.y + 8, 7, 7);
          }
        }
        ctx.textBaseline = 'alphabetic';
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        ctx.fillStyle = U.alpha(C.line, 0.45);
        for (let x = 20; x < W; x += 40) {
          for (let y = 20; y < H; y += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        ctx.strokeStyle = U.alpha(C.violet, 0.3);
        ctx.lineWidth = 2;
        ctx.strokeRect(MARGIN - 8, MARGIN - 8, W - MARGIN * 2 + 16, H - MARGIN * 2 + 16);

        for (const f of fading) {
          const k = 1 - f.t / 0.7;
          strokePath(f.path, Math.max(4, Math.floor(HIST * k)), U.alpha(C.violet, 0.5 * k), 3);
        }
        echoes.forEach((e, i) => drawEcho(e, i === 0));

        // Where the next echo will appear.
        if (state === 'play' && echoT < 1.5) {
          const p = histAt(Math.min(HIST - 1, Math.round((ECHO_EVERY - echoT) * 60)));
          const a = 1 - echoT / 1.5;
          ctx.setLineDash([3, 5]);
          ctx.strokeStyle = U.alpha(C.violet, 0.3 + a * 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 12 + echoT * 20, 0, TAU);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (orb) {
          orbBody(ctx, orb.x, orb.y, clock);
          if (orb.age < QUICK && state === 'play') {
            ctx.strokeStyle = U.alpha(C.mint, 0.8);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, 24, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - orb.age / QUICK));
            ctx.stroke();
          }
        }

        if (state !== 'dying' && state !== 'over') {
          for (let k = 18; k >= 1; k -= 1) {
            const p = histAt(k * 2);
            ctx.fillStyle = U.alpha(C.p2, 0.3 * (1 - k / 19));
            ctx.beginPath();
            ctx.arc(p.x, p.y, PR * 0.6 * (1 - k / 22), 0, TAU);
            ctx.fill();
          }
          playerBody(ctx, player.x, player.y, PR);
          if (state === 'play') {
            const warn = echoT < 1;
            if (!warn || Math.sin(clock * 20) > -0.5) {
              timerRing(ctx, player.x, player.y, 20, 1 - echoT / ECHO_EVERY, warn);
            }
          }
          if (rewindFx > 0) {
            const k = rewindFx / 0.6;
            ctx.strokeStyle = U.alpha(C.violet, k);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(player.x, player.y, 28 + (1 - k) * 30, -clock * 12, -clock * 12 + 4);
            ctx.stroke();
          }
        }

        ctx.globalCompositeOperation = 'lighter';
        for (const p of parts) {
          ctx.fillStyle = U.alpha(p.color, Math.max(0, p.life / p.max));
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalCompositeOperation = 'source-over';

        ctx.font = HUD;
        ctx.textAlign = 'center';
        for (const tx of texts) {
          ctx.fillStyle = U.alpha(tx.color, Math.min(1, tx.life * 2));
          ctx.fillText(tx.text, tx.x, tx.y);
        }
        ctx.restore();

        if (banner) {
          const a = Math.min(1, banner.t * 5, (1.4 - banner.t) * 3);
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.fillStyle = U.alpha(C.violet, 0.55 * Math.max(0, a));
          ctx.fillText(banner.text, W / 2, H / 2 + 16);
        }
        if (state !== 'menu') drawHud();
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.p1, flash * 0.3);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Flow ---------- */
      function startRun() {
        reset();
        state = 'play';
        spawnOrb();
        say('Grab the gold orbs. In 6 seconds a ghost will replay everything you do now.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Time Echo',
          text: api.isTouch
            ? 'Hold anywhere to move toward your finger. Tap the round button to rewind.'
            : 'Arrows or WASD to move, Space to rewind. You can also hold the mouse to steer.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function gameOver() {
        state = 'over';
        api.sfx('lose');
        const isBest = api.reportScore(score);
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Game over',
          text: 'Caught by your own echo. ' + orbs + ' orb' + (orbs === 1 ? '' : 's') + ', ' + score +
            ' points, ' + spawned + ' echo' + (spawned === 1 ? '' : 'es') + ' faced.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      api.on(window, 'keydown', (e) => {
        if (e.code === 'Space' && !e.repeat) rewind();
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        if (U.dist(p.x, p.y, BTN.x, BTN.y) <= BTN.r + 10) {
          rewind();
          return;
        }
        pointer.down = true;
        pointer.x = p.x;
        pointer.y = p.y;
      });
      api.on(window, 'pointermove', (e) => {
        if (!pointer.down) return;
        const p = api.toCanvas(e, canvas);
        pointer.x = p.x;
        pointer.y = p.y;
      });
      const release = () => { pointer.down = false; };
      api.on(window, 'pointerup', release, { always: true });
      api.on(window, 'pointercancel', release, { always: true });

      reset();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
