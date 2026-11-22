/* Paddle Duel — two-paddle tennis where long rallies heat the ball up and raise the stakes. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const TOP = 32;
  const BOT = H - 32;
  const PX = 44;            // paddle centre distance from the side edge
  const PW = 14;
  const PH = 96;
  const PSPEED = 560;
  const R = 9;
  const START_SPEED = 400;
  const MAX_SPEED = 1100;
  const MAX_ANGLE = 0.95;
  const SPIN = 240;         // curve from a moving paddle, px/s²
  const SMASH_WINDOW = 0.12;
  const SMASH_CD = 0.45;
  const WARM = 6;
  const BLAZE = 12;
  const WIN = 11;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const DIFF = {
    easy: { react: 0.36, err: 44, nerves: 20, speedErr: 2, speed: 0.72, spin: false, smash: [0, 0], aggro: 0.15 },
    normal: { react: 0.17, err: 18, nerves: 8, speedErr: 1.4, speed: 0.9, spin: false, smash: [0, 0.3], aggro: 0.5 },
    hard: { react: 0.08, err: 9, nerves: 0, speedErr: 1.2, speed: 1, spin: true, smash: [0.3, 0.85], aggro: 0.9 }
  };

  function heatValue(rally) { return rally >= BLAZE ? 3 : rally >= WARM ? 2 : 1; }
  function heatColor(v) { return v === 3 ? C.p1 : v === 2 ? C.gold : C.text; }

  function drawPaddle(ctx, x, y, color, glow, squash) {
    const w = PW + squash * 6;
    const h = PH - squash * 8;
    if (glow > 0) {
      ctx.fillStyle = U.alpha(C.text, 0.35 * glow);
      U.roundRect(ctx, x - w / 2 - 6, y - h / 2 - 6, w + 12, h + 12, 10);
      ctx.fill();
    }
    ctx.fillStyle = color;
    U.roundRect(ctx, x - w / 2, y - h / 2, w, h, 7);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.text, 0.35);
    U.roundRect(ctx, x - w / 2 + 3, y - h / 2 + 5, 3, h - 10, 2);
    ctx.fill();
  }

  Arcade.register({
    id: 'paddle-duel',
    title: 'Paddle Duel',
    mode: 'together',
    players: '1–2P',
    color: C.p2,
    tagline: 'Classic two-paddle tennis, first to 11.',
    hook: 'Rally heat: long rallies set the ball on fire and make the point worth up to 3.',
    tags: ['versus', 'classic', 'sports', 'keyboard', 'computer opponent'],
    howTo: 'Move your paddle to return the ball. Where it hits your paddle sets the angle, and a moving paddle puts a slight curve on it. ' +
      'The ball speeds up with every hit. After 6 hits in a rally it turns gold and the point is worth 2; after 12 it blazes and is worth 3. ' +
      'Tap your action key just before the ball reaches you to smash it back faster. First to 11 wins.',
    controls: [
      { keys: ['W', 'S'], label: 'Coral: move' },
      { keys: ['Space'], label: 'Coral: smash (tap just before contact)' },
      { keys: ['↑', '↓'], label: 'Cyan: move' },
      { keys: ['Enter'], label: 'Cyan: smash' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = C.line;
      ctx.fillRect(0, 12, 320, 3);
      ctx.fillRect(0, 185, 320, 3);
      ctx.strokeStyle = U.alpha(C.line, 0.9);
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 8]);
      ctx.beginPath();
      ctx.moveTo(160, 20);
      ctx.lineTo(160, 182);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = BIG;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = U.alpha(C.p1, 0.25);
      ctx.fillText('7', 112, 52);
      ctx.fillStyle = U.alpha(C.p2, 0.25);
      ctx.fillText('9', 208, 52);
      // Point badge on the centre line.
      ctx.fillStyle = C.panel2;
      U.roundRect(ctx, 133, 86, 54, 26, 13);
      ctx.fill();
      ctx.strokeStyle = C.p1;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.font = HUD;
      ctx.fillStyle = C.text;
      ctx.fillText('3 pts', 160, 100);
      ctx.save();
      ctx.scale(0.5, 0.5);
      drawPaddle(ctx, 44, 250 + Math.sin(t * 2) * 30, C.p1, 0, 0);
      drawPaddle(ctx, 596, 160, C.p2, 0, 0);
      ctx.restore();
      // A blazing ball curving across the court.
      const pts = [];
      for (let i = 0; i < 18; i++) {
        const u = i / 17;
        pts.push([40 + u * 200, 140 - u * 85 + Math.sin(u * Math.PI) * -18]);
      }
      for (let i = 1; i < pts.length; i++) {
        const a = i / pts.length;
        ctx.strokeStyle = U.alpha(i > 10 ? C.p1 : C.gold, a * 0.8);
        ctx.lineWidth = 2 + a * 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      const bx = pts[17][0];
      const by = pts[17][1];
      for (let i = 0; i < 9; i++) {
        const k = (i * 0.37 + t * 1.7) % 1;
        ctx.fillStyle = U.alpha(i % 2 ? C.gold : C.p1, 1 - k);
        ctx.beginPath();
        ctx.arc(bx - 8 - k * 26 + Math.sin(i * 7) * 4, by + 4 + k * 10 - Math.cos(i * 3) * 6 * k, 4 * (1 - k) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = U.alpha(C.gold, 0.35);
      ctx.beginPath();
      ctx.arc(bx, by, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.p1;
      ctx.beginPath();
      ctx.arc(bx, by, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.arc(bx - 1.5, by - 1.5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'serve' | 'play' | 'point' | 'over'
      let vsCpu = false;
      let diff = 'normal';
      let score = [0, 0];
      let paddles = [makePaddle(0), makePaddle(1)];
      let ball = null;
      let rally = 0;
      let serveDir = 1;
      let firstServe = true;
      let timer = 0;
      let serveDur = 3;
      let banner = null;
      let floats = [];
      let parts = [];
      let shake = 0;
      let flash = 0;
      let flashColor = C.text;
      let clock = 0;
      let told = { warm: false, blaze: false };
      let ai = null;

      const names = () => (vsCpu ? ['You', 'The computer'] : ['Coral', 'Cyan']);

      function makePaddle(id) {
        return { id, x: id === 0 ? PX : W - PX, y: H / 2, vy: 0, tapAt: -9, lastTap: -9, squash: 0,
          color: id === 0 ? C.p1 : C.p2 };
      }

      function newBall() {
        return { x: W / 2, y: H / 2, vx: 0, vy: 0, base: START_SPEED, boost: 1, spin: 0, trail: [], smashed: false };
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n && parts.length < 500; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.25, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * U.rand(0.6, 1), max: life,
            color, size: size * U.rand(0.6, 1.2) });
        }
      }
      function floatText(text, x, y, color) {
        floats.push({ text, x: U.clamp(x, 60, W - 60), y: U.clamp(y, TOP + 30, BOT - 30), color, t: 0 });
      }

      /* ---------- Ball physics (shared by play and the computer's prediction) ---------- */
      function advance(b, h, spinOn) {
        if (spinOn && b.spin) {
          b.vy += b.spin * h;
          b.spin *= Math.max(0, 1 - h * 0.9);
        }
        const sp = Math.min(MAX_SPEED * 1.25, b.base * b.boost);
        const n = Math.hypot(b.vx, b.vy) || 1;
        b.vx = (b.vx / n) * sp;
        b.vy = (b.vy / n) * sp;
        const minX = sp * 0.42;
        if (Math.abs(b.vx) < minX) {
          b.vx = (b.vx < 0 ? -1 : 1) * minX;
          b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(sp * sp - minX * minX);
        }
        b.x += b.vx * h;
        b.y += b.vy * h;
        if (b.y < TOP + R) {
          b.y = TOP + R;
          b.vy = Math.abs(b.vy);
          b.spin *= -0.5;
          return true;
        }
        if (b.y > BOT - R) {
          b.y = BOT - R;
          b.vy = -Math.abs(b.vy);
          b.spin *= -0.5;
          return true;
        }
        return false;
      }

      function hitPaddle(p) {
        const b = ball;
        const dir = p.id === 0 ? 1 : -1; // direction the ball leaves this paddle
        if (b.vx * dir >= 0 || (b.x - p.x) * dir < -PW / 2) return false;
        const cx = U.clamp(b.x, p.x - PW / 2, p.x + PW / 2);
        const cy = U.clamp(b.y, p.y - PH / 2, p.y + PH / 2);
        if ((b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy) > R * R) return false;

        const before = heatValue(rally);
        rally++;
        const rel = U.clamp((b.y - p.y) / (PH / 2 + R * 0.5), -1, 1);
        const ang = rel * MAX_ANGLE;
        const smash = clock - p.tapAt <= SMASH_WINDOW;
        b.base = Math.min(MAX_SPEED, b.base * 1.06 + 8);
        b.boost = smash ? 1.35 : 1;
        const sp = b.base * b.boost;
        b.vx = dir * Math.cos(ang) * sp;
        b.vy = Math.sin(ang) * sp;
        b.spin = U.clamp(p.vy / PSPEED, -1, 1) * SPIN;
        b.x = p.x + dir * (PW / 2 + R + 0.5);
        b.smashed = smash;
        p.squash = 1;
        burst(p.x + dir * PW / 2, b.y, p.color, smash ? 22 : 8, smash ? 320 : 160, 0.35, 3);
        if (smash) {
          p.tapAt = -9;
          shake = Math.max(shake, 9);
          flash = 0.45;
          flashColor = C.text;
          floatText('Smash!', p.x + dir * 70, p.y - 40, C.text);
          api.sfx('power');
        } else {
          api.sfx('blip');
        }
        const after = heatValue(rally);
        if (after > before) heatUp(after);
        return true;
      }

      function heatUp(v) {
        const col = heatColor(v);
        burst(ball.x, ball.y, col, 26, 240, 0.5, 3);
        shake = Math.max(shake, 4);
        floatText(v === 3 ? 'Blazing: worth 3' : 'Warm: worth 2', ball.x, ball.y - 36, col);
        api.sfx('power');
        if (v === 2 && !told.warm) {
          told.warm = true;
          api.setStatus('Rally heat: 6 hits turned the ball gold, so this point is worth 2. Reach 12 hits and it is worth 3.');
        } else if (v === 3 && !told.blaze) {
          told.blaze = true;
          api.setStatus('Blazing ball! This point is worth 3.');
        }
      }

      function stepBall(dt) {
        const b = ball;
        const sp = Math.hypot(b.vx, b.vy);
        const steps = Math.max(1, Math.ceil((sp * dt) / 5));
        const h = dt / steps;
        for (let i = 0; i < steps; i++) {
          if (advance(b, h, true)) {
            burst(b.x, b.y + (b.vy > 0 ? -R : R), U.alpha(C.muted, 1), 4, 90, 0.2, 2);
            api.sfx('tick');
          }
          if (hitPaddle(paddles[0]) || hitPaddle(paddles[1])) continue;
          if (b.x < -R * 2) return pointTo(1);
          if (b.x > W + R * 2) return pointTo(0);
        }
        b.trail.push(b.x, b.y);
        if (b.trail.length > 36) b.trail.splice(0, 2);
        const v = heatValue(rally);
        if (v === 3) {
          for (let i = 0; i < 2; i++) {
            parts.push({ x: b.x + U.rand(-4, 4), y: b.y + U.rand(-4, 4), vx: -b.vx * 0.12 + U.rand(-30, 30),
              vy: -b.vy * 0.12 - U.rand(20, 70), life: 0.4, max: 0.4, color: Math.random() < 0.5 ? C.p1 : C.gold, size: U.rand(3, 6) });
          }
        } else if (v === 2 && Math.random() < 0.5) {
          parts.push({ x: b.x, y: b.y, vx: U.rand(-30, 30), vy: U.rand(-40, 10), life: 0.3, max: 0.3, color: C.gold, size: 2.5 });
        }
      }

      /* ---------- Round flow ---------- */
      function pointTo(id) {
        const v = heatValue(rally);
        score[id] += v;
        api.setScore(score[0] + ' – ' + score[1]);
        const p = paddles[id];
        const ex = id === 0 ? W - 4 : 4;
        burst(ex, U.clamp(ball.y, TOP, BOT), p.color, 14 + v * 10, 200 + v * 60, 0.7, 4);
        shake = Math.max(shake, 5 + v * 3);
        flash = 0.25 + v * 0.1;
        flashColor = p.color;
        api.sfx('score');
        banner = { text: '+' + v, color: p.color, t: 0 };
        const who = vsCpu ? (id === 0 ? 'you' : 'the computer') : names()[id];
        api.setStatus((rally >= 2 ? rally + '-hit rally, point to ' : 'Point to ') + who +
          (v > 1 ? ' (worth ' + v + ').' : '.'));
        serveDir = id === 0 ? 1 : -1; // serve toward the player who conceded
        ball = null;
        rally = 0;
        state = 'point';
        timer = 1.0;
      }

      function beginServe() {
        state = 'serve';
        serveDur = firstServe ? 3 : 1.8;
        firstServe = false;
        timer = serveDur;
        ball = newBall();
        rally = 0;
        ai = newAi();
        api.sfx('tick');
      }

      function launch() {
        const a = U.rand(-0.4, 0.4);
        ball.vx = serveDir * Math.cos(a) * START_SPEED;
        ball.vy = Math.sin(a) * START_SPEED;
        state = 'play';
        api.sfx('blip');
      }

      function startMatch(cpu, d) {
        vsCpu = cpu;
        diff = d;
        score = [0, 0];
        paddles = [makePaddle(0), makePaddle(1)];
        parts = [];
        floats = [];
        banner = null;
        firstServe = true;
        serveDir = Math.random() < 0.5 ? 1 : -1;
        api.setScore('0 – 0');
        api.setStatus('First to 11. Tap ' + (vsCpu ? 'Space' : 'Space or Enter') +
          ' just before the ball reaches your paddle to smash it.');
        beginServe();
      }

      function matchOver() {
        state = 'over';
        ball = null;
        const w = score[0] > score[1] ? 0 : 1;
        if (vsCpu) api.sfx(w === 0 ? 'win' : 'lose');
        else api.sfx('win');
        api.setStatus('Match over.');
        api.menu({
          title: vsCpu ? (w === 0 ? 'You win!' : 'The computer wins') : (w === 0 ? 'Coral wins!' : 'Cyan wins!'),
          text: 'Final score ' + score[0] + ' – ' + score[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(vsCpu, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        ball = null;
        banner = null;
        api.setStatus('Long rallies heat the ball up: 6 hits makes a point worth 2, 12 hits worth 3.');
        api.menu({
          title: 'Paddle Duel',
          text: 'First to 11. Keep a rally going and the point becomes worth up to 3.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false, diff) },
            { label: 'vs computer', onClick: showDifficultyMenu }
          ]
        });
      }

      function showDifficultyMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'You play coral on the left with W/S or the arrow keys. Space or Enter smashes.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      /* ---------- Computer opponent ---------- */
      function newAi() {
        return { lastDir: 0, trackT: 0, planT: 0, err: 0, offset: 0, smash: false, tapped: false, targetY: H / 2, fresh: true };
      }

      /* Where will the ball cross x = faceX? Simulates walls (and spin, if the computer reads it). */
      function predictY(faceX, withSpin) {
        const b = { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, base: ball.base, boost: ball.boost, spin: ball.spin };
        if (b.vx <= 0) return H / 2;
        for (let i = 0; i < 1200 && b.x < faceX; i++) advance(b, 1 / 240, withSpin);
        return b.y;
      }

      function planReturn(p, D) {
        const v = heatValue(rally);
        if (ai.fresh) {
          // One read per incoming ball: how wrong it is, where to aim, whether to smash.
          ai.fresh = false;
          const sp = Math.hypot(ball.vx, ball.vy);
          const fast = Math.max(0, (sp - START_SPEED) / START_SPEED);
          ai.err = U.rand(-1, 1) * (D.err + D.nerves * (v - 1)) * (1 + fast * D.speedErr);
          // The computer cashes in hot rallies with steep angles and plays safe on cold ones.
          if (Math.random() < (v >= 2 ? D.aggro : D.aggro * 0.3)) {
            const away = paddles[0].y < H / 2 ? 1 : -1;
            ai.offset = away * U.rand(0.45, 0.8);
          } else {
            ai.offset = U.rand(-0.2, 0.2);
          }
          ai.smash = Math.random() < (v >= 2 ? D.smash[1] : D.smash[0]);
          ai.tapped = false;
        }
        const y = predictY(p.x - PW / 2 - R, D.spin);
        ai.targetY = U.clamp(y + ai.err - ai.offset * (PH / 2 + R * 0.5), TOP + PH / 2, BOT - PH / 2);
      }

      function cpuInput(p, dt) {
        const D = DIFF[diff];
        let target = p.y;
        if (state === 'play' && ball) {
          const incoming = ball.vx > 0;
          if (incoming && ai.lastDir <= 0) {
            ai.trackT = D.react;
            ai.planT = 0;
            ai.fresh = true;
          }
          ai.lastDir = ball.vx > 0 ? 1 : -1;
          if (incoming) {
            ai.trackT -= dt;
            if (ai.trackT <= 0) {
              ai.planT -= dt;
              if (ai.planT <= 0) {
                planReturn(p, D);
                ai.planT = D.react * 1.5 + 0.05;
              }
              target = ai.targetY;
              const tHit = (p.x - PW / 2 - R - ball.x) / ball.vx;
              if (ai.smash && !ai.tapped && tHit > 0 && tHit < 0.08) {
                ai.tapped = true;
                p.tapAt = clock;
                p.lastTap = clock;
              }
            }
          } else {
            // Drift back toward the middle, shading toward the ball.
            target = H / 2 + (ball.y - H / 2) * 0.3;
          }
        } else if (state === 'serve' || state === 'point') {
          target = H / 2;
        }
        return U.clamp((target - p.y) / 26, -1, 1);
      }

      /* ---------- Update ---------- */
      function humanInput(id) {
        const k = api.keys;
        let v = 0;
        if (id === 0 || vsCpu) v += (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
        if (id === 1 || vsCpu) v += (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
        return U.clamp(v, -1, 1);
      }

      function movePaddles(dt) {
        paddles.forEach((p) => {
          const cpu = vsCpu && p.id === 1;
          const input = cpu ? cpuInput(p, dt) : humanInput(p.id);
          const maxV = PSPEED * (cpu ? DIFF[diff].speed : 1);
          p.vy += (input * maxV - p.vy) * Math.min(1, dt * 18);
          p.y += p.vy * dt;
          const lo = TOP + PH / 2;
          const hi = BOT - PH / 2;
          if (p.y < lo || p.y > hi) {
            p.y = U.clamp(p.y, lo, hi);
            p.vy = 0;
          }
          p.squash = Math.max(0, p.squash - dt * 6);
        });
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 2.5);
        if (banner) banner.t += dt;
        floats.forEach((f) => { f.t += dt; });
        floats = floats.filter((f) => f.t < 1);
        const drag = Math.max(0, 1 - dt * 3);
        for (const q of parts) {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= drag;
          q.vy *= drag;
          q.life -= dt;
        }
        parts = parts.filter((q) => q.life > 0);

        if (state === 'menu' || state === 'over') return;
        movePaddles(dt);
        if (state === 'serve') {
          const step = serveDur / 3;
          const prev = Math.ceil(timer / step);
          timer -= dt;
          if (timer <= 0) launch();
          else if (Math.ceil(timer / step) !== prev) api.sfx('tick');
        } else if (state === 'point') {
          timer -= dt;
          if (timer <= 0) {
            if (Math.max(score[0], score[1]) >= WIN) matchOver();
            else beginServe();
          }
        } else if (state === 'play') {
          stepBall(dt);
        }
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

      function drawCourt() {
        const v = heatValue(rally);
        const heat = state === 'play' ? v : 1;
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.fillStyle = U.alpha(C.panel, 0.5);
        ctx.fillRect(0, TOP, W, BOT - TOP);
        const wallCol = heat === 3 ? U.alpha(C.p1, 0.7) : heat === 2 ? U.alpha(C.gold, 0.6) : C.line;
        ctx.fillStyle = wallCol;
        ctx.fillRect(0, TOP - 6, W, 6);
        ctx.fillRect(0, BOT, W, 6);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 12]);
        ctx.beginPath();
        ctx.moveTo(W / 2, TOP + 6);
        ctx.lineTo(W / 2, BOT - 6);
        ctx.stroke();
        ctx.setLineDash([]);
        // Scores.
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = U.alpha(C.p1, 0.85);
        ctx.fillText(String(score[0]), W / 2 - 110, TOP + 50);
        ctx.fillStyle = U.alpha(C.p2, 0.85);
        ctx.fillText(String(score[1]), W / 2 + 110, TOP + 50);
        // Big faint rally count in the middle of the court.
        if (rally > 0 && state === 'play') {
          ctx.save();
          ctx.globalAlpha = 0.09;
          ctx.translate(W / 2, H / 2 + 20);
          ctx.scale(3, 3);
          ctx.fillStyle = heatColor(v);
          ctx.fillText(String(rally), 0, 0);
          ctx.restore();
        }
        // Point value badge on the centre line.
        const bw = 92;
        const by = TOP + 50;
        const col = heatColor(heat);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, W / 2 - bw / 2, by - 18, bw, 36, 18);
        ctx.fill();
        ctx.strokeStyle = heat > 1 ? col : C.line;
        ctx.lineWidth = heat > 1 ? 3 : 2;
        ctx.stroke();
        ctx.font = HUD;
        ctx.fillStyle = heat > 1 ? col : C.muted;
        ctx.fillText(heat + (heat === 1 ? ' pt' : ' pts'), W / 2, by + 1);
        // Heat ladder: 12 pips under the court, tiers at 6 and 12.
        const gap = 16;
        const x0 = W / 2 - (BLAZE - 1) * gap / 2 + 40;
        const y = H - 16;
        ctx.textAlign = 'right';
        ctx.fillStyle = C.muted;
        ctx.fillText('Rally ' + rally, x0 - 20, y);
        const shown = state === 'play' ? rally : 0;
        for (let i = 0; i < BLAZE; i++) {
          const filled = i < shown;
          const tierCol = i < WARM ? C.gold : C.p1;
          const next = i === shown && (shown === WARM - 1 || shown === BLAZE - 1);
          ctx.beginPath();
          ctx.arc(x0 + i * gap, y, i === WARM - 1 || i === BLAZE - 1 ? 6 : 4.5, 0, Math.PI * 2);
          if (filled) {
            ctx.fillStyle = tierCol;
            ctx.fill();
          } else {
            ctx.strokeStyle = U.alpha(tierCol, next && Math.sin(clock * 18) > 0 ? 1 : 0.4);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = shown >= BLAZE ? C.p1 : shown >= WARM ? C.gold : C.muted;
        ctx.fillText(shown >= BLAZE ? 'blazing' : shown >= WARM ? 'warm' : 'cold', x0 + BLAZE * gap + 4, y);
      }

      function drawBall() {
        if (!ball) return;
        const b = ball;
        const v = state === 'play' ? heatValue(rally) : 1;
        const col = heatColor(v);
        const tr = b.trail;
        ctx.lineCap = 'round';
        for (let i = 2; i < tr.length; i += 2) {
          const a = i / tr.length;
          ctx.strokeStyle = U.alpha(v === 1 ? C.p2 : col, a * (v === 1 ? 0.35 : 0.7));
          ctx.lineWidth = 1 + a * (v === 3 ? 12 : v === 2 ? 9 : 6);
          ctx.beginPath();
          ctx.moveTo(tr[i - 2], tr[i - 1]);
          ctx.lineTo(tr[i], tr[i + 1]);
          ctx.stroke();
        }
        // Rally count riding on the trail.
        if (rally > 0 && tr.length >= 20) {
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(col, 0.8);
          ctx.fillText(String(rally), tr[tr.length - 20], tr[tr.length - 19] - 16);
        }
        ctx.fillStyle = U.alpha(v === 1 ? C.p2 : col, 0.25 + (b.smashed ? 0.2 : 0));
        ctx.beginPath();
        ctx.arc(b.x, b.y, R + 7 + (v - 1) * 3, 0, Math.PI * 2);
        ctx.fill();
        if (b.smashed) {
          ctx.strokeStyle = U.alpha(C.text, 0.8);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(b.x, b.y, R + 5, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
        ctx.fill();
        if (v === 3) {
          ctx.fillStyle = C.gold;
          ctx.beginPath();
          ctx.arc(b.x - 2, b.y - 2, R * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
        if (state === 'serve') {
          // Arrow toward the receiver.
          const ax = b.x + serveDir * 34;
          ctx.strokeStyle = U.alpha(C.text, 0.5 + 0.4 * Math.sin(clock * 10));
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(ax - serveDir * 8, b.y - 9);
          ctx.lineTo(ax, b.y);
          ctx.lineTo(ax - serveDir * 8, b.y + 9);
          ctx.stroke();
        }
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawCourt();
        const live = state !== 'menu' && state !== 'over';
        paddles.forEach((p) => {
          const armed = live && clock - p.tapAt <= SMASH_WINDOW ? 1 - (clock - p.tapAt) / SMASH_WINDOW : 0;
          drawPaddle(ctx, p.x, p.y, p.color, armed, p.squash);
        });
        drawBall();
        for (const q of parts) {
          ctx.globalAlpha = Math.max(0, q.life / q.max);
          ctx.fillStyle = q.color;
          ctx.beginPath();
          ctx.arc(q.x, q.y, q.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        floats.forEach((f) => {
          ctx.fillStyle = U.alpha(f.color, 1 - f.t);
          ctx.fillText(f.text, f.x, f.y - f.t * 30);
        });
        ctx.restore();

        if (state === 'serve') {
          const step = serveDur / 3;
          const n = Math.ceil(timer / step);
          const f = (timer % step) / step;
          bigText(String(n), W / 2, H / 2 - 90, C.text, 1 + f * 0.4, Math.min(1, 0.3 + f));
        } else if (state === 'point' && banner) {
          const a = Math.min(1, banner.t * 6);
          bigText(banner.text, W / 2, H / 2, banner.color, 0.8 + a * 0.5, Math.min(a, (1 - banner.t) * 3));
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.22);
          ctx.fillRect(0, 0, W, H);
        }
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || (state !== 'play' && state !== 'serve')) return;
        let p = null;
        if (e.code === 'Space') p = paddles[0];
        else if (e.code === 'Enter') p = vsCpu ? paddles[0] : paddles[1];
        if (!p || clock - p.lastTap < SMASH_CD) return;
        p.lastTap = clock;
        p.tapAt = clock;
      });

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
