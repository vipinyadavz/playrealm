/* Magnet Brawl: magnet-disc soccer with a steel ball. Hook: your magnet always pulls; hold action to push. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const M = 22;                 // wall thickness
  const GOAL_HALF = 80;
  const GOAL_TOP = H / 2 - GOAL_HALF;
  const GOAL_BOT = H / 2 + GOAL_HALF;
  const R = 26;                 // magnet disc radius
  const BR = 14;                // ball radius
  const MD = 3;                 // disc mass (ball mass is 1)
  const ACC = 1700;
  const DAMP = 4.5;
  const BALL_DAMP = 0.45;
  const BALL_MAX = 950;
  const PULL_R = 200;           // pull reach, centre to centre
  const PULL_K = 2200;          // pull at contact (beats disc acceleration, so you can carry)
  const PUSH_R = 150;
  const PUSH_K = 3400;
  const KICK = 640;             // instant shove when flipping to push
  const GRIP = R + BR + 8;
  const DRAIN = 0.8;            // push energy per second
  const FLIP_COST = 0.12;
  const REFILL = 0.35;
  const UNLOCK = 0.3;           // empty meter must refill this far before pushing again
  const WIN = 5;
  const SUB = 0.004;            // physics sub-step, seconds
  const MAX_PARTS = 400;
  const LEVELS = {
    easy: { react: 0.42, speed: 0.68, aimCos: 0.78, aimErr: 1, lead: 0, defPush: false, press: 0.3, smartAim: false },
    normal: { react: 0.18, speed: 0.86, aimCos: 0.9, aimErr: 0.5, lead: 0.15, defPush: true, press: 0.65, smartAim: false },
    hard: { react: 0.07, speed: 1, aimCos: 0.95, aimErr: 0.15, lead: 0.25, defPush: true, press: 1, smartAim: true }
  };

  function drawField(ctx, x, y, color, push, t) {
    ctx.lineWidth = 2;
    if (push) {
      ctx.fillStyle = U.alpha(C.text, 0.05);
      ctx.beginPath();
      ctx.arc(x, y, PUSH_R, 0, Math.PI * 2);
      ctx.fill();
      for (let k = 0; k < 3; k++) {
        const ph = (t * 2.4 + k / 3) % 1;
        ctx.strokeStyle = U.alpha(k % 2 ? C.text : color, (1 - ph) * 0.8);
        ctx.lineWidth = 3.5 - ph * 2.5;
        ctx.beginPath();
        ctx.arc(x, y, R + (PUSH_R - R) * ph, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      for (let k = 0; k < 4; k++) {
        const ph = (t * 0.55 + k / 4) % 1;
        ctx.strokeStyle = U.alpha(color, 0.05 + 0.25 * ph);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, PULL_R - (PULL_R - R - 4) * ph, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  function drawDisc(ctx, x, y, color, push, energy, spin) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 6, R, R * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.ink, 0.6);
    ctx.beginPath();
    ctx.arc(x, y, R * 0.66, 0, Math.PI * 2);
    ctx.fill();
    // Four arrows: pointing in while pulling, out while pushing.
    ctx.fillStyle = push ? '#FFFFFF' : color;
    for (let k = 0; k < 4; k++) {
      const a = spin + k * Math.PI / 2;
      const c = Math.cos(a), s = Math.sin(a);
      const tip = push ? R * 0.58 : R * 0.18;
      const base = push ? R * 0.3 : R * 0.48;
      ctx.beginPath();
      ctx.moveTo(x + c * tip, y + s * tip);
      ctx.lineTo(x + c * base - s * 5, y + s * base + c * 5);
      ctx.lineTo(x + c * base + s * 5, y + s * base - c * 5);
      ctx.closePath();
      ctx.fill();
    }
    // Push energy arc.
    ctx.lineWidth = 3;
    ctx.strokeStyle = U.alpha(C.ink, 0.7);
    ctx.beginPath();
    ctx.arc(x, y, R + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = energy < UNLOCK ? C.gold : C.text;
    ctx.beginPath();
    ctx.arc(x, y, R + 5, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, energy) * Math.PI * 2);
    ctx.stroke();
  }

  function drawBall(ctx, x, y) {
    const g = ctx.createRadialGradient(x - BR * 0.35, y - BR * 0.4, BR * 0.1, x, y, BR);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.35, '#C9CBDD');
    g.addColorStop(1, '#4A4C68');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, BR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = U.alpha(C.text, 0.5);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawPitch(ctx) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(-20, -20, W + 40, H + 40);
    ctx.fillStyle = C.panel;
    ctx.fillRect(M, M, W - 2 * M, H - 2 * M);
    ctx.fillStyle = U.alpha(C.panel2, 0.45);
    const band = (W - 2 * M) / 10;
    for (let i = 1; i < 10; i += 2) ctx.fillRect(M + i * band, M, band, H - 2 * M);
    ctx.strokeStyle = U.alpha(C.line, 0.95);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, M);
    ctx.lineTo(W / 2, H - M);
    ctx.moveTo(W / 2 + 70, H / 2);
    ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeRect(M, H / 2 - 130, 96, 260);
    ctx.strokeRect(W - M - 96, H / 2 - 130, 96, 260);
    // Goal pockets, tinted by the side that defends them.
    [[0, C.p1], [W - M, C.p2]].forEach(([gx, col]) => {
      ctx.fillStyle = U.alpha(col, 0.22);
      ctx.fillRect(gx, GOAL_TOP, M, GOAL_HALF * 2);
      ctx.strokeStyle = U.alpha(col, 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = GOAL_TOP + 10; y < GOAL_BOT; y += 10) { ctx.moveTo(gx, y); ctx.lineTo(gx + M, y); }
      ctx.stroke();
      ctx.strokeStyle = U.alpha(col, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      const lx = gx === 0 ? M : W - M;
      ctx.moveTo(lx, GOAL_TOP);
      ctx.lineTo(lx, GOAL_BOT);
      ctx.stroke();
    });
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(M, GOAL_TOP); ctx.lineTo(M, M); ctx.lineTo(W - M, M); ctx.lineTo(W - M, GOAL_TOP);
    ctx.moveTo(M, GOAL_BOT); ctx.lineTo(M, H - M); ctx.lineTo(W - M, H - M); ctx.lineTo(W - M, GOAL_BOT);
    ctx.stroke();
    ctx.fillStyle = C.text;
    for (const [px, py] of [[M, GOAL_TOP], [M, GOAL_BOT], [W - M, GOAL_TOP], [W - M, GOAL_BOT]]) {
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  Arcade.register({
    id: 'magnet-brawl',
    title: 'Magnet Brawl',
    mode: 'together',
    players: '1–2P',
    original: true,
    color: C.p1,
    tagline: 'Pull the steel ball in, then blast it into the goal.',
    hook: 'Your magnet always pulls; hold action to flip it to push.',
    tags: ['versus', 'two player', 'computer', 'sports', 'physics', 'keyboard'],
    howTo: 'You are a magnet disc. Your magnet always pulls the steel ball toward you, so you can grab it and carry it. ' +
      'Hold your action key to flip the magnet to push: the ball blasts straight out from your centre, and a rival ' +
      'close by gets shoved too. Pushing drains your meter (the ring around your disc), which refills while you pull. ' +
      'Line the ball up between you and the goal, then flip. First to 5 goals wins.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Player 1 move' },
      { keys: ['Space'], label: 'Player 1 hold to push' },
      { keys: ['↑', '↓', '←', '→'], label: 'Player 2 move' },
      { keys: ['Enter'], label: 'Player 2 hold to push' }
    ],

    drawThumb(ctx, w, h, t) {
      const s = Math.max(w / W, h / H);
      ctx.save();
      ctx.translate((w - W * s) / 2, (h - H * s) / 2);
      ctx.scale(s, s);
      drawPitch(ctx);
      // Coral disc pushing, cyan disc pulling near its goal, ball flying between.
      const ph = (t * 0.5 + 0.35) % 1;
      const p1 = { x: 380, y: 300 };
      const p2 = { x: 720, y: 250 };
      drawField(ctx, p1.x, p1.y, C.p1, true, t);
      drawField(ctx, p2.x, p2.y, C.p2, false, t);
      const bx = 450 + ph * 170;
      const by = 290 - ph * 16;
      for (let k = 1; k <= 5; k++) {
        ctx.fillStyle = U.alpha(C.text, 0.16 - k * 0.025);
        ctx.beginPath();
        ctx.arc(bx - k * 22, by + k * 2, BR * (1 - k * 0.08), 0, Math.PI * 2);
        ctx.fill();
      }
      drawBall(ctx, bx, by);
      drawDisc(ctx, p1.x, p1.y, C.p1, true, 0.6, t * 2);
      drawDisc(ctx, p2.x, p2.y, C.p2, false, 1, 0);
      ctx.restore();
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'goal' | 'over'
      let cpuOn = false;
      let level = 'normal';
      let discs = [];
      let ball = null;
      let scores = [0, 0];
      let countT = 0, lastCount = 0, goFlash = 0, goalT = 0;
      let goalMsg = '', goalColor = C.text;
      let pulse = 0, shake = 0, hitCool = 0;
      let particles = [];
      let trail = [];
      let stuck = { x: 0, y: 0, t: 0 };
      let hinted = { grip: false, push: false, empty: false };
      const cpuIn = { x: 0, y: 0, act: false };
      const ai = { timer: 0, tx: W * 0.75, ty: H / 2, push: 0, moodT: 0, press: false };

      const nameOf = (i) => (cpuOn ? (i === 0 ? 'You' : 'Computer') : 'Player ' + (i + 1));
      const shortName = (i) => (cpuOn ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));

      function makeDisc(id) {
        return {
          id, x: id === 0 ? W * 0.25 : W * 0.75, y: H / 2, vx: 0, vy: 0, push: false, energy: 1,
          locked: false, refillDelay: 0, spin: 0, color: id === 0 ? C.p1 : C.p2
        };
      }

      function kickoff() {
        discs = [makeDisc(0), makeDisc(1)];
        ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, hidden: false };
        trail = [];
        stuck = { x: ball.x, y: ball.y, t: 0 };
        ai.timer = 0;
        ai.push = 0;
        state = 'count';
        countT = 3;
        lastCount = 4;
        api.setStatus('First to ' + WIN + '. ' + (cpuOn
          ? 'Your magnet pulls the ball; hold Space to flip it to push and shoot.'
          : 'Magnets always pull. Hold Space (P1) or Enter (P2) to flip to push.'));
      }

      function startMatch(cpu, lvl) {
        cpuOn = cpu;
        level = lvl || 'normal';
        scores = [0, 0];
        particles = [];
        hinted = { grip: false, push: false, empty: false };
        api.setScore('0 – 0');
        kickoff();
      }

      function showStartMenu() {
        state = 'menu';
        discs = [makeDisc(0), makeDisc(1)];
        ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, hidden: false };
        api.setScore('0 – 0');
        api.menu({
          title: 'Magnet Brawl',
          text: 'Your magnet always pulls the steel ball. Hold Space / Enter to flip it to push and blast the ball ' +
            'into the goal. First to 5.',
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
          text: 'You are coral, attacking the right goal with WASD (or arrows) and Space. The computer pulls and pushes too.',
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
        api.setStatus(nameOf(w) + (cpuOn && w === 0 ? ' win' : ' wins') + ' the match ' + scores[0] + ' – ' + scores[1] + '.');
        api.menu({
          title: cpuOn ? (w === 0 ? 'You win!' : 'Computer wins') : 'Player ' + (w + 1) + ' wins!',
          text: 'Final score ' + scores[0] + ' – ' + scores[1] + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(cpuOn, level) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
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

      /* ---------- Input ---------- */
      function inputFor(i) {
        if (cpuOn && i === 1) return cpuIn;
        const k = api.keys;
        let x = 0, y = 0, act = false;
        const wasd = i === 0;
        const arrows = i === 1 || cpuOn;
        if (wasd) {
          if (k.has('KeyA')) x--;
          if (k.has('KeyD')) x++;
          if (k.has('KeyW')) y--;
          if (k.has('KeyS')) y++;
          act = k.has('Space');
        }
        if (arrows) {
          if (k.has('ArrowLeft')) x--;
          if (k.has('ArrowRight')) x++;
          if (k.has('ArrowUp')) y--;
          if (k.has('ArrowDown')) y++;
          act = act || k.has('Enter') || k.has('NumpadEnter');
        }
        x = U.clamp(x, -1, 1);
        y = U.clamp(y, -1, 1);
        const m = Math.hypot(x, y);
        return m > 1 ? { x: x / m, y: y / m, act } : { x, y, act };
      }

      /* ---------- Magnet mode + energy ---------- */
      function setMode(d, want, dt) {
        if (d.locked && d.energy >= UNLOCK) d.locked = false;
        const canPush = want && !d.locked && d.energy > 0;
        if (canPush && !d.push) {
          d.push = true;
          d.energy = Math.max(0, d.energy - FLIP_COST);
          flipKick(d);
          if (!hinted.push && !(cpuOn && d.id === 1)) {
            hinted.push = true;
            api.setStatus('Push! It drains the ring around your disc, which refills while you pull.');
          }
        } else if (!canPush && d.push) {
          d.push = false;
          d.refillDelay = 0.3;
        }
        if (d.push) {
          d.energy -= DRAIN * dt;
          if (d.energy <= 0) {
            d.energy = 0;
            d.push = false;
            d.locked = true;
            d.refillDelay = 0.5;
            if (!hinted.empty && !(cpuOn && d.id === 1)) {
              hinted.empty = true;
              api.setStatus('Out of push energy. Pull for a moment to refill the ring.');
            }
          }
        } else {
          d.refillDelay -= dt;
          if (d.refillDelay <= 0) d.energy = Math.min(1, d.energy + REFILL * dt);
        }
      }

      // Flipping to push gives an instant shove to the ball and to a nearby rival.
      function flipKick(d) {
        api.sfx('flip');
        let dx = ball.x - d.x, dy = ball.y - d.y;
        let dist = Math.hypot(dx, dy) || 1;
        if (dist < PUSH_R + BR) {
          const f = Math.pow(U.clamp(1 - (dist - R - BR) / (PUSH_R - R), 0, 1), 0.6);
          shoveBall(d, dx / dist, dy / dist, KICK * f);
          if (f > 0.5) {
            shake = Math.max(shake, 5);
            api.sfx('shoot');
            spark(ball.x, ball.y, C.text, 12, 220, 0.4);
          }
        }
        const foe = discs[1 - d.id];
        dx = foe.x - d.x;
        dy = foe.y - d.y;
        dist = Math.hypot(dx, dy) || 1;
        if (dist < PUSH_R + R) {
          const f = U.clamp(1 - (dist - 2 * R) / (PUSH_R - R), 0, 1);
          foe.vx += (dx / dist) * 380 * f;
          foe.vy += (dy / dist) * 380 * f;
        }
      }

      /* ---------- Physics ---------- */
      // Ball forces are paired with an equal and opposite force on the disc (mass MD), so a ball
      // stuck to a disc can never self-propel.
      function shoveBall(d, nx, ny, dv) {
        ball.vx += nx * dv;
        ball.vy += ny * dv;
        d.vx -= (nx * dv) / MD;
        d.vy -= (ny * dv) / MD;
      }

      function fields(h) {
        for (const d of discs) {
          const dx = ball.x - d.x, dy = ball.y - d.y;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = dx / dist, ny = dy / dist;
          if (d.push) {
            if (dist < PUSH_R + BR) {
              const f = U.clamp(1 - Math.max(0, dist - R - BR) / (PUSH_R - R), 0, 1);
              shoveBall(d, nx, ny, PUSH_K * f * h);
            }
            const foe = discs[1 - d.id];
            const ex = foe.x - d.x, ey = foe.y - d.y;
            const ed = Math.hypot(ex, ey) || 1;
            if (ed < PUSH_R + R) {
              const f = U.clamp(1 - Math.max(0, ed - 2 * R) / (PUSH_R - R), 0, 1);
              foe.vx += (ex / ed) * PUSH_K * 0.35 * f * h;
              foe.vy += (ey / ed) * PUSH_K * 0.35 * f * h;
            }
          } else if (dist < PULL_R) {
            const f = Math.pow(U.clamp(1 - Math.max(0, dist - R - BR) / (PULL_R - R - BR), 0, 1), 1.5);
            shoveBall(d, nx, ny, -PULL_K * f * h);
            if (dist < GRIP) {
              // Magnetic grip: kill bounce strongly, let the ball roll around the rim a little.
              const rvx = ball.vx - d.vx, rvy = ball.vy - d.vy;
              const rn = rvx * nx + rvy * ny;
              const tx = rvx - rn * nx, ty = rvy - rn * ny;
              const kn = 1 - Math.exp(-12 * h), kt = 1 - Math.exp(-1.5 * h);
              // Remove part of the relative velocity, shared by mass so momentum is kept.
              const cx = rn * kn * nx + tx * kt, cy = rn * kn * ny + ty * kt;
              ball.vx -= cx * (MD / (MD + 1));
              ball.vy -= cy * (MD / (MD + 1));
              d.vx += cx * (1 / (MD + 1));
              d.vy += cy * (1 / (MD + 1));
            }
          }
        }
      }

      function hitSound(speed) {
        if (speed > 260 && hitCool <= 0) {
          api.sfx('hit');
          hitCool = 0.08;
        }
      }

      function ballDisc(d, moveBall) {
        const dx = ball.x - d.x, dy = ball.y - d.y;
        const dist = Math.hypot(dx, dy);
        const min = R + BR;
        if (dist >= min) return;
        const nx = dist > 0.001 ? dx / dist : 1, ny = dist > 0.001 ? dy / dist : 0;
        const over = min - dist;
        if (moveBall) {
          ball.x += nx * over * (MD / (MD + 1));
          ball.y += ny * over * (MD / (MD + 1));
          d.x -= nx * over * (1 / (MD + 1));
          d.y -= ny * over * (1 / (MD + 1));
        } else {
          d.x -= nx * over;
          d.y -= ny * over;
        }
        const vn = (ball.vx - d.vx) * nx + (ball.vy - d.vy) * ny;
        if (vn < 0) {
          const e = d.push ? 0.7 : 0.25;
          const j = -(1 + e) * vn / (1 + 1 / MD);
          ball.vx += j * nx;
          ball.vy += j * ny;
          d.vx -= (j / MD) * nx;
          d.vy -= (j / MD) * ny;
          hitSound(-vn);
        }
      }

      function discDisc() {
        const a = discs[0], b = discs[1];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 2 * R) return;
        const nx = dist > 0.001 ? dx / dist : 1, ny = dist > 0.001 ? dy / dist : 0;
        const over = (2 * R - dist) / 2;
        a.x -= nx * over; a.y -= ny * over;
        b.x += nx * over; b.y += ny * over;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j = -(1.5 * vn) / 2;
          a.vx -= j * nx; a.vy -= j * ny;
          b.vx += j * nx; b.vy += j * ny;
          if (-vn > 200 && hitCool <= 0) {
            api.sfx('hit');
            hitCool = 0.1;
            spark((a.x + b.x) / 2, (a.y + b.y) / 2, C.gold, 8, 160, 0.3);
          }
        }
      }

      function clampDisc(d) {
        if (d.x < M + R) { d.x = M + R; d.vx = Math.abs(d.vx) * 0.3; }
        if (d.x > W - M - R) { d.x = W - M - R; d.vx = -Math.abs(d.vx) * 0.3; }
        if (d.y < M + R) { d.y = M + R; d.vy = Math.abs(d.vy) * 0.3; }
        if (d.y > H - M - R) { d.y = H - M - R; d.vy = -Math.abs(d.vy) * 0.3; }
      }

      function ballWalls() {
        const rest = 0.82;
        for (const [px, py] of [[M, GOAL_TOP], [M, GOAL_BOT], [W - M, GOAL_TOP], [W - M, GOAL_BOT]]) {
          const dx = ball.x - px, dy = ball.y - py;
          const dist = Math.hypot(dx, dy);
          if (dist < BR && dist > 0.001) {
            const nx = dx / dist, ny = dy / dist;
            ball.x = px + nx * BR;
            ball.y = py + ny * BR;
            const vn = ball.vx * nx + ball.vy * ny;
            if (vn < 0) {
              ball.vx -= (1 + rest) * vn * nx;
              ball.vy -= (1 + rest) * vn * ny;
              hitSound(-vn);
            }
          }
        }
        const inMouth = ball.y > GOAL_TOP && ball.y < GOAL_BOT;
        if (ball.y < M + BR) { ball.y = M + BR; hitSound(-ball.vy); ball.vy = Math.abs(ball.vy) * rest; }
        if (ball.y > H - M - BR) { ball.y = H - M - BR; hitSound(ball.vy); ball.vy = -Math.abs(ball.vy) * rest; }
        if (!inMouth) {
          if (ball.x < M + BR) { ball.x = M + BR; hitSound(-ball.vx); ball.vx = Math.abs(ball.vx) * rest; }
          if (ball.x > W - M - BR) { ball.x = W - M - BR; hitSound(ball.vx); ball.vx = -Math.abs(ball.vx) * rest; }
        } else {
          // Inside the goal pocket the ball is boxed by the pocket's top and bottom.
          if (ball.x < M || ball.x > W - M) ball.y = U.clamp(ball.y, GOAL_TOP + BR, GOAL_BOT - BR);
        }
      }

      function physics(h, inputs) {
        const dd = Math.exp(-DAMP * h);
        const bd = Math.exp(-BALL_DAMP * h);
        discs.forEach((d, i) => {
          d.vx = (d.vx + inputs[i].x * ACC * h) * dd;
          d.vy = (d.vy + inputs[i].y * ACC * h) * dd;
        });
        fields(h);
        ball.vx *= bd;
        ball.vy *= bd;
        const sp = Math.hypot(ball.vx, ball.vy);
        if (sp > BALL_MAX) {
          ball.vx *= BALL_MAX / sp;
          ball.vy *= BALL_MAX / sp;
        }
        for (const d of discs) {
          d.x += d.vx * h;
          d.y += d.vy * h;
        }
        ball.x += ball.vx * h;
        ball.y += ball.vy * h;
        discDisc();
        discs.forEach((d) => ballDisc(d, true));
        ballWalls();
        // If the wall pinned the ball into a disc, move the disc instead.
        discs.forEach((d) => { ballDisc(d, false); clampDisc(d); });
        if (!Number.isFinite(ball.x) || !Number.isFinite(ball.y)) {
          ball.x = W / 2; ball.y = H / 2; ball.vx = 0; ball.vy = 0;
        }
        if (ball.x < M - 2) return 1;      // into the left goal: player 2 scores
        if (ball.x > W - M + 2) return 0;  // into the right goal: player 1 scores
        return -1;
      }

      function goal(scorer) {
        scores[scorer]++;
        api.setScore(scores[0] + ' – ' + scores[1]);
        state = 'goal';
        goalT = 1.8;
        goalMsg = 'Goal!';
        goalColor = discs[scorer].color;
        ball.hidden = true;
        const gx = scorer === 0 ? W - M : M;
        spark(gx, ball.y, discs[scorer].color, 70, 380, 1);
        spark(gx, ball.y, C.gold, 30, 260, 0.8);
        shake = 14;
        api.sfx('boom');
        api.after(250, () => api.sfx('score'));
        api.setStatus(nameOf(scorer) + (cpuOn && scorer === 0 ? ' score' : ' scores') + '. ' + scores[0] + ' – ' + scores[1] + ', first to ' + WIN + '.');
      }

      /* ---------- Computer ---------- */
      function plan(me, foe, L, st) {
        const side = me.id === 1 ? 1 : -1; // +1: defends the right goal
        const own = { x: side > 0 ? W - M : M, y: H / 2 };
        let aimY = H / 2 + U.rand(-1, 1) * L.aimErr * GOAL_HALF;
        if (L.smartAim) aimY = foe.y < H / 2 ? GOAL_BOT - 28 : GOAL_TOP + 28;
        let ax = (side > 0 ? M - 30 : W - M + 30) - ball.x, ay = aimY - ball.y;
        const al = Math.hypot(ax, ay) || 1;
        ax /= al;
        ay /= al;
        const dMe = Math.hypot(ball.x - me.x, ball.y - me.y) || 1;
        const dFoe = Math.hypot(ball.x - foe.x, ball.y - foe.y);
        const bx = (ball.x - me.x) / dMe, by = (ball.y - me.y) / dMe;
        const align = bx * ax + by * ay;
        // Never push when the ball sits between us and our own goal.
        const ox = own.x - me.x, oy = own.y - me.y;
        const towardOwn = (bx * ox + by * oy) / (Math.hypot(ox, oy) || 1);
        const canShoot = me.energy > 0.3 && !me.locked && towardOwn < 0.3;
        if (dMe < R + BR + 40 && align > L.aimCos && canShoot) {
          st.push = 0.3;
          st.tx = me.x + ax * 40;
          st.ty = me.y + ay * 40;
          return;
        }
        if (dMe < GRIP + 4) {
          // Holding the ball: back away from the goal so it swings round to the front, then shoot.
          st.tx = me.x - ax * 90;
          st.ty = me.y - ay * 90;
          return;
        }
        const px = ball.x + ball.vx * L.lead, py = ball.y + ball.vy * L.lead;
        const gx = px - own.x, gy = py - own.y;
        const gl = Math.hypot(gx, gy) || 1;
        const canPush = me.energy > 0.3 && !me.locked;
        // A fast ball heading for our goal: step onto its line and let the pull catch it.
        const toOwn = -(ball.vx * gx + ball.vy * gy) / gl;
        if (toOwn > 260 && dMe > R + BR + 30) {
          const k = Math.min(gl * 0.5, 170);
          st.tx = own.x + (gx / gl) * k;
          st.ty = own.y + (gy / gl) * k;
          return;
        }
        if (dFoe < GRIP + 10 && dFoe < dMe) {
          st.moodT -= L.react;
          if (st.moodT <= 0) {
            st.moodT = 2.5;
            st.press = Math.random() < L.press;
          }
          if (st.press || gl < 300) {
            // Rival has the ball: get goal-side of it, then push it off their magnet.
            st.tx = ball.x - (gx / gl) * (R + BR + 18);
            st.ty = ball.y - (gy / gl) * (R + BR + 18);
            if (L.defPush && dMe < R + BR + 80 && towardOwn < -0.2 && canPush) st.push = 0.25;
          } else {
            const k = Math.min(gl * 0.45, 170);
            st.tx = own.x + (gx / gl) * k;
            st.ty = own.y + (gy / gl) * k;
          }
          return;
        }
        // Loose ball: get behind it (relative to the target goal), going round if we are on the wrong side.
        const sx = me.x - px, sy = me.y - py;
        if (sx * ax + sy * ay > -10) {
          const turn = ax * sy - ay * sx >= 0 ? 1 : -1;
          st.tx = px - ax * 60 - ay * 75 * turn;
          st.ty = py - ay * 60 + ax * 75 * turn;
        } else {
          st.tx = px - ax * (R + BR);
          st.ty = py - ay * (R + BR);
        }
      }

      function cpuThink(dt, me, foe, st, out, lvl) {
        const L = LEVELS[lvl] || LEVELS.normal;
        st.timer -= dt;
        st.push = Math.max(0, st.push - dt);
        if (st.timer <= 0) {
          st.timer = L.react * (0.6 + Math.random() * 0.8);
          plan(me, foe, L, st);
        }
        const tx = U.clamp(st.tx, M + R, W - M - R), ty = U.clamp(st.ty, M + R, H - M - R);
        const dx = tx - me.x, dy = ty - me.y;
        const d = Math.hypot(dx, dy) || 1;
        const want = Math.min(1, d / 70) * (ACC / DAMP) * L.speed;
        let ix = ((dx / d) * want - me.vx) / 160;
        let iy = ((dy / d) * want - me.vy) / 160;
        const m = Math.hypot(ix, iy);
        if (m > L.speed) {
          ix = (ix / m) * L.speed;
          iy = (iy / m) * L.speed;
        }
        out.x = Number.isFinite(ix) ? ix : 0;
        out.y = Number.isFinite(iy) ? iy : 0;
        out.act = st.push > 0;
      }

      /* ---------- Loop ---------- */
      function update(dt) {
        pulse += dt;
        shake = Math.max(0, shake - dt * 30);
        goFlash = Math.max(0, goFlash - dt);
        hitCool -= dt;
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
        for (const d of discs) d.spin += dt * (d.push ? 6 : 0.8);

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
          if (cpuOn) cpuThink(dt, discs[1], discs[0], ai, cpuIn, level);
          const inputs = [inputFor(0), inputFor(1)];
          discs.forEach((d, i) => setMode(d, inputs[i].act, dt));
          const n = Math.min(16, Math.max(1, Math.ceil(dt / SUB)));
          for (let s = 0; s < n; s++) {
            const scorer = physics(dt / n, inputs);
            if (scorer >= 0) {
              goal(scorer);
              break;
            }
          }
          if (state === 'play') {
            if (!hinted.grip) {
              const d0 = discs[0];
              if (Math.hypot(ball.x - d0.x, ball.y - d0.y) < GRIP && !d0.push) {
                hinted.grip = true;
                api.setStatus('Got it. The ball shoots straight out from your centre: line it up, then flip to push.');
              }
            }
            // Unstick: a ball that sits in one spot too long gets a zap toward the middle.
            if (Math.hypot(ball.x - stuck.x, ball.y - stuck.y) > 40) {
              stuck.x = ball.x;
              stuck.y = ball.y;
              stuck.t = 0;
            } else {
              stuck.t += dt;
              if (stuck.t > 5) {
                const zx = W / 2 - ball.x, zy = H / 2 - ball.y;
                const zl = Math.hypot(zx, zy) || 1;
                ball.vx += (zx / zl) * 520 + U.rand(-80, 80);
                ball.vy += (zy / zl) * 520 + U.rand(-80, 80);
                spark(ball.x, ball.y, C.violet, 20, 200, 0.5);
                api.sfx('power');
                api.setStatus('The ball sat still too long, so it got a zap toward the middle.');
                stuck.t = 0;
              }
            }
            const sp = Math.hypot(ball.vx, ball.vy);
            if (sp > 380) trail.push({ x: ball.x, y: ball.y, life: 0.18 });
          }
        } else if (state === 'goal') {
          goalT -= dt;
          if (goalT <= 0) {
            if (Math.max(scores[0], scores[1]) >= WIN) matchOver();
            else kickoff();
          }
        }
        for (const p of trail) p.life -= dt;
        trail = trail.filter((p) => p.life > 0).slice(-14);
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

      function drawHud() {
        ctx.font = '600 15px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        discs.forEach((d, i) => {
          const bw = 210, bh = 28, x = i === 0 ? M + 10 : W - M - 10 - bw, y = M + 10;
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          U.roundRect(ctx, x, y, bw, bh, 8);
          ctx.fill();
          ctx.fillStyle = d.color;
          ctx.beginPath();
          ctx.arc(x + 15, y + bh / 2, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.textAlign = 'left';
          ctx.fillText(shortName(i) + (d.push ? ' push' : ' pull'), x + 27, y + bh / 2 + 1);
          const mx = x + 124, mw = 76;
          ctx.fillStyle = C.line;
          U.roundRect(ctx, mx, y + 9, mw, 10, 5);
          ctx.fill();
          ctx.fillStyle = d.locked ? C.gold : d.push ? C.text : U.alpha(d.color, 0.9);
          U.roundRect(ctx, mx, y + 9, Math.max(10, mw * d.energy), 10, 5);
          ctx.fill();
        });
        ctx.textAlign = 'center';
        ctx.fillStyle = U.alpha(C.text, 0.85);
        ctx.fillText(scores[0] + '  –  ' + scores[1], W / 2, M + 24);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawPitch(ctx);
        for (const d of discs) drawField(ctx, d.x, d.y, d.color, d.push, pulse);
        if (ball && !ball.hidden) {
          for (const p of trail) {
            ctx.fillStyle = U.alpha(C.text, p.life * 0.9);
            ctx.beginPath();
            ctx.arc(p.x, p.y, BR * (0.5 + p.life * 2.5), 0, Math.PI * 2);
            ctx.fill();
          }
          drawBall(ctx, ball.x, ball.y);
        }
        for (const d of discs) drawDisc(ctx, d.x, d.y, d.color, d.push, d.energy, d.spin);
        ctx.globalCompositeOperation = 'lighter';
        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life / p.max, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        drawHud();
        if (state === 'count') {
          const n = Math.max(1, Math.ceil(countT));
          const f = U.clamp(countT - (n - 1), 0, 1);
          bigText(String(n), W / 2, H / 2 - 10, 1.4 + Math.pow(f, 3) * 1.2, C.text, 0.3 + f * 1.4);
        }
        if (goFlash > 0) bigText('Go!', W / 2, H / 2 - 10, 1.4 + (0.7 - goFlash), C.gold, goFlash / 0.5);
        if (state === 'goal') bigText(goalMsg, W / 2, H / 2 - 10, 1.3 + Math.max(0, goalT - 1.5), goalColor, Math.min(1, (1.8 - goalT) * 5));
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
