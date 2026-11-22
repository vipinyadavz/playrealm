/* Hoop Shot — side-view arcade basketball where the hoop slides faster the longer your streak runs. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 560;
  const FLOOR = 500;
  const G = 1500;            // gravity (px/s²)
  const BR = 17;             // ball radius
  const RR = 5;              // rim tube radius
  const RH = 42;             // half distance between the rim circles
  const RIM_Y = 228;
  const BOARD_GAP = 12;      // back rim to backboard face
  const BOARD_TOP = RIM_Y - 106;
  const BOARD_BOT = RIM_Y + 24;
  const BOARD_R = 4;
  const NET_D = 62;
  const X_MIN = 470;
  const X_MAX = 790;
  const HOME_X = 690;
  const TRACK_Y = 98;
  const SPAWN = { x: 168, y: 410 };
  const V_MIN = 480;
  const V_MAX = 1400;
  const DRAG_MAX = 210;
  const PREVIEW_SHOTS = 3;
  const HEAT_TIME = 10;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const ORANGE = '#F28A2E';
  const ORANGE_DARK = '#9A4A12';
  const RIM = '#FF6B2C';
  const WOOD = '#C98B4E';
  const WOOD_DARK = '#A86E39';
  const DIFF = {
    easy: { sv: 0.07, sa: 0.06, lead: 0.35, move: 0.06, wait: [1.5, 2.0] },
    normal: { sv: 0.03, sa: 0.035, lead: 0.8, move: 0.03, wait: [1.0, 1.4] },
    hard: { sv: 0.012, sa: 0.016, lead: 1, move: 0.01, wait: [0.7, 1.05] }
  };

  const hoopSpeedFor = (streak) => (streak > 0 ? Math.min(330, 50 + streak * 34) : 0);
  const multFor = (streak) => Math.min(5, 1 + Math.floor(streak / 2));

  /* ---------- Art shared with the thumbnail ---------- */
  function drawBall(ctx, x, y, r, rot, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(x, y);
    ctx.fillStyle = ORANGE;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(rot || 0);
    ctx.strokeStyle = ORANGE_DARK;
    ctx.lineWidth = Math.max(1.2, r * 0.11);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.moveTo(0, -r);
    ctx.lineTo(0, r);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 1.25, 0, r * 0.95, -0.85, 0.85);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(r * 1.25, 0, r * 0.95, Math.PI - 0.85, Math.PI + 0.85);
    ctx.stroke();
    ctx.rotate(-(rot || 0));
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.4, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,20,0,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /* Backboard, rim and net for a hoop centred at hx. netSwing shifts the bottom of the net. */
  function drawHoop(ctx, hx, mult, glow, netSwing, netStretch, t, heat) {
    const bx = hx + RH + BOARD_GAP;
    // Hanger arm from the track.
    ctx.strokeStyle = '#6E7391';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(bx + 4, TRACK_Y + 6);
    ctx.lineTo(bx + 4, BOARD_TOP);
    ctx.stroke();
    ctx.fillStyle = '#8D93B5';
    U.roundRect(ctx, bx - 14, TRACK_Y - 6, 36, 16, 5);
    ctx.fill();
    // Board, seen side-on but drawn a little open so the target square reads.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(bx + 2, BOARD_TOP + 4, 14, BOARD_BOT - BOARD_TOP);
    ctx.fillStyle = '#EEF1FA';
    U.roundRect(ctx, bx - BOARD_R, BOARD_TOP, 14, BOARD_BOT - BOARD_TOP, 3);
    ctx.fill();
    ctx.strokeStyle = glow > 0 ? U.alpha(C.gold, 0.6 + glow * 0.4) : '#B5BBD3';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.p1;
    ctx.fillRect(bx - 1, RIM_Y - 44, 4, 40);
    // Multiplier plate on top of the board.
    if (mult > 1) {
      ctx.fillStyle = heat ? C.p1 : C.gold;
      U.roundRect(ctx, bx + 16, BOARD_TOP + 8, 46, 26, 8);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '800 15px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×' + mult, bx + 39, BOARD_TOP + 21);
    }
    // Bracket.
    ctx.fillStyle = '#5C617E';
    ctx.fillRect(hx + RH, RIM_Y - 3, BOARD_GAP, 6);
    // Net: strings from the rim to a narrower, swinging bottom.
    const top = [];
    const bot = [];
    const depth = NET_D + netStretch * 16;
    for (let i = 0; i <= 6; i++) {
      const f = i / 6;
      top.push([hx - RH + f * RH * 2, RIM_Y + 2]);
      bot.push([hx - RH * 0.55 + f * RH * 1.1 + netSwing, RIM_Y + depth]);
    }
    ctx.strokeStyle = 'rgba(245,245,255,0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      ctx.moveTo(top[i][0], top[i][1]);
      const j = Math.min(6, i + 1);
      ctx.lineTo(U.lerp(top[i][0], bot[j][0], 0.5), U.lerp(top[i][1], bot[j][1], 0.5));
      ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.moveTo(top[i][0], top[i][1]);
      const k = Math.max(0, i - 1);
      ctx.lineTo(U.lerp(top[i][0], bot[k][0], 0.5), U.lerp(top[i][1], bot[k][1], 0.5));
      ctx.lineTo(bot[i][0], bot[i][1]);
    }
    for (const f of [0.5, 1]) {
      ctx.moveTo(U.lerp(top[0][0], bot[0][0], f), U.lerp(top[0][1], bot[0][1], f));
      for (let i = 1; i <= 6; i++) ctx.lineTo(U.lerp(top[i][0], bot[i][0], f), U.lerp(top[i][1], bot[i][1], f));
    }
    ctx.stroke();
    // Rim: a flat ellipse with the two contact points as knobs.
    ctx.strokeStyle = heat ? (Math.sin(t * 18) > 0 ? C.gold : RIM) : RIM;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(hx, RIM_Y, RH, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = RIM;
    ctx.beginPath();
    ctx.arc(hx - RH, RIM_Y, RR, 0, Math.PI * 2);
    ctx.arc(hx + RH, RIM_Y, RR, 0, Math.PI * 2);
    ctx.fill();
  }

  Arcade.register({
    id: 'hoop-shot',
    title: 'Hoop Shot',
    category: 'sports',
    mode: 'solo',
    players: '1–2P',
    color: C.gold,
    best: 'high',
    formatScore: (n) => n + ' pts',
    tagline: 'Sink as many baskets as you can in 60 seconds.',
    hook: 'The hoop slides faster with every streak, and swishes count double.',
    tags: ['sports', 'basketball', 'hoops', 'arcade', 'shooting', 'flick', 'touch', 'timed', 'computer opponent', 'versus'],
    howTo: 'Flick up from the ball to throw it at the hoop, or aim with the arrow keys and hold Space to charge. ' +
      'Each basket is worth 2 points, and a swish that touches neither rim nor board counts double. ' +
      'Baskets in a row build a streak that raises your multiplier, but the hoop starts sliding along its track and gets faster ' +
      'with every make. Miss once and the streak resets and the hoop slows to a stop. The last 10 seconds are heat time: every point doubles. ' +
      'Your first few throws show the arc. Play solo for a best score, or take turns against a friend or the computer.',
    controls: [
      { keys: ['Flick'], label: 'Drag up from the ball and release to throw' },
      { keys: ['←', '→'], label: 'Aim (A and D work too)' },
      { keys: ['Space'], label: 'Hold to charge, release to throw (Enter works too)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      // Crowd glow and floor.
      ctx.fillStyle = U.alpha(C.panel2, 0.9);
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        ctx.arc(8 + i * 12.5, 132 + (i % 2) * 5 + Math.sin(t * 4 + i) * 1.2, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = WOOD;
      ctx.fillRect(0, 160, 320, 40);
      ctx.fillStyle = WOOD_DARK;
      for (let x = 0; x < 320; x += 40) ctx.fillRect(x, 160, 2, 40);
      ctx.fillStyle = U.alpha(C.gold, 0.85);
      ctx.fillRect(0, 160, 320, 3);
      // The track with motion arrows; the hoop rides it.
      const hx = 232 + Math.sin(t * 1.6) * 28;
      ctx.save();
      ctx.translate(0, 0);
      ctx.scale(0.42, 0.42);
      ctx.strokeStyle = '#6E7391';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(380, TRACK_Y);
      ctx.lineTo(720, TRACK_Y);
      ctx.stroke();
      drawHoop(ctx, hx / 0.42, 3, 1, Math.sin(t * 5) * 6, 0.3, t, false);
      ctx.restore();
      ctx.fillStyle = U.alpha(C.gold, 0.85);
      [[-1, 150], [1, 300]].forEach(([d, x]) => {
        ctx.beginPath();
        ctx.moveTo(x + d * 10, 41);
        ctx.lineTo(x, 35);
        ctx.lineTo(x, 47);
        ctx.closePath();
        ctx.fill();
      });
      // Ball flying in on an arc, with a SWISH ×2 tag.
      const path = (f) => [40 + f * (hx - 40), 140 - Math.sin(f * Math.PI * 0.86) * 130 + f * 40];
      ctx.fillStyle = U.alpha('#FFFFFF', 0.7);
      for (let f = 0.05; f < 0.8; f += 0.06) {
        const p = path(f);
        ctx.beginPath();
        ctx.arc(p[0], p[1], 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      const bp = path(0.82);
      drawBall(ctx, bp[0], bp[1], 9, t * 3, 1);
      ctx.fillStyle = C.gold;
      U.roundRect(ctx, 14, 14, 110, 34, 10);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '800 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('SWISH ×2', 69, 32);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | cover | play | buzzer | over
      let mode = 'solo';  // solo | duo | cpu
      let diff = 'normal';
      let players = [];
      let order = [0];
      let turnIdx = 0;
      let timeLeft = 60;
      let turnTime = 60;
      let balls = [];
      let readyT = 0;
      let streak = 0;
      let bestStreak = 0;
      let hx = HOME_X;
      let hoopDir = -1;
      let hoopSpeed = 0;
      let netSwing = 0;
      let netSwingV = 0;
      let netStretch = 0;
      let boardGlow = 0;
      let previewLeft = PREVIEW_SHOTS;
      let heat = false;
      let aimAng = 0.98;   // radians above the horizon
      let charging = false;
      let charge = 0;
      let chargeT = 0;
      let drag = null;
      let clock = 0;
      let parts = [];
      let floats = [];
      let banner = null;
      let shake = 0;
      let flash = 0;
      let flashColor = C.gold;
      let crowdJump = 0;
      let told = {};
      let cpu = null;
      let stateT = 0;
      let tickSec = 0;

      const shooter = () => players[order[Math.min(turnIdx, order.length - 1)]];
      const cpuTurn = () => mode === 'cpu' && order[turnIdx] === 1;
      const humanCanThrow = () => state === 'play' && !cpuTurn();
      const hoopVx = () => hoopDir * hoopSpeed;
      const finalTurn = () => turnIdx >= order.length - (mode === 'solo' ? 1 : 2);
      const ballReady = () => balls.some((b) => b.state === 'held');

      function updateScore() {
        if (!players.length) return;
        api.setScore(mode === 'solo' ? players[0].score : players[0].score + ' – ' + players[1].score);
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed, life, size, up) {
        for (let i = 0; i < n && parts.length < 450; i++) {
          const a = up ? -Math.PI / 2 + U.rand(-1.1, 1.1) : Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.25, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * U.rand(0.6, 1), max: life, color,
            size: size * U.rand(0.6, 1.3), g: up ? 500 : 0 });
        }
      }

      function float(text, x, y, color, big) {
        floats.push({ text, x, y, color, t: 0, big: !!big });
      }

      function hint(key, text) {
        if (told[key]) return;
        told[key] = true;
        api.setStatus(text);
      }

      /* ---------- Balls ---------- */
      function spawnBall() {
        balls.push({ x: SPAWN.x, y: SPAWN.y, vx: 0, vy: 0, rot: 0, state: 'held', rim: false, board: false, age: 0,
          floorT: 0, alpha: 1, by: order[turnIdx], trail: [] });
      }

      function launchVel(ang, power) {
        const v = V_MIN + U.clamp(power, 0, 1) * (V_MAX - V_MIN);
        return { vx: Math.cos(ang) * v, vy: -Math.sin(ang) * v };
      }

      function throwBall(vx, vy) {
        const b = balls.find((q) => q.state === 'held');
        if (!b || state !== 'play') return;
        b.state = 'fly';
        b.vx = vx;
        b.vy = vy;
        b.age = 0;
        readyT = 0.42;
        api.sfx('shoot');
        if (previewLeft > 0) {
          previewLeft--;
          if (previewLeft === 0 && !cpuTurn()) hint('preview', 'The arc preview is off now. Trust your arm.');
        }
      }

      /* Keyboard and pointer both end up here with an angle (above horizon) and power 0..1. */
      function humanThrow(ang, power) {
        if (!humanCanThrow() || !ballReady()) return;
        const v = launchVel(ang, power);
        aimAng = ang;
        throwBall(v.vx, v.vy);
      }

      function scoreBall(b) {
        b.state = 'scored';
        const p = players[b.by];
        const swish = !b.rim && !b.board;
        const mult = multFor(streak);
        const pts = 2 * (swish ? 2 : 1) * mult * (heat ? 2 : 1);
        p.score += pts;
        p.makes++;
        if (swish) p.swishes++;
        streak++;
        bestStreak = Math.max(bestStreak, streak);
        p.bestStreak = Math.max(p.bestStreak, streak);
        netStretch = 1;
        netSwingV += (b.vx - hoopVx()) * 0.25;
        boardGlow = 1;
        crowdJump = 1;
        api.sfx(swish ? 'power' : 'score');
        burst(hx, RIM_Y + 20, swish ? C.gold : C.text, swish ? 26 : 12, swish ? 240 : 150, 0.6, 3.5, true);
        if (heat) burst(hx, RIM_Y + 20, C.p1, 16, 220, 0.6, 4, true);
        float('+' + pts, hx, RIM_Y - 40, swish ? C.gold : C.text, true);
        if (swish) float('Swish ×2', hx, RIM_Y - 74, C.gold);
        if (streak === 1) {
          hint('slide', 'The hoop is moving now. Every basket in a row makes it slide faster and raises your multiplier.');
        } else if (swish) {
          hint('swish', 'Swish! Nothing but net counts double.');
        }
        if (multFor(streak) > mult) {
          banner = { text: '×' + multFor(streak) + ' streak!', color: C.gold, t: 0 };
          api.after(150, () => api.sfx('flip'));
        }
        updateScore();
      }

      function missBall(b) {
        if (b.state !== 'fly') return;
        b.state = 'dead';
        players[b.by].misses++;
        if (streak >= 2) {
          float('Streak over', hx, RIM_Y - 50, C.muted);
          api.setStatus('Missed. The streak resets and the hoop slows to a stop.');
        }
        streak = 0;
      }

      function rimHit(b, cx, cy) {
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        const min = BR + RR;
        if (d >= min || d < 1e-6) return false;
        const nx = dx / d;
        const ny = dy / d;
        b.x = cx + nx * min;
        b.y = cy + ny * min;
        const rvx = b.vx - hoopVx();
        const vn = rvx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.55 * vn * nx;
          b.vy -= 1.55 * vn * ny;
          // A little spin-down along the rim keeps balls from balancing forever.
          b.vx *= 0.96;
          if (-vn > 120 && b.state === 'fly') api.sfx('hit');
          netSwingV += nx * 30;
        }
        return true;
      }

      function boardHit(b) {
        const bx = hx + RH + BOARD_GAP;
        const cy = U.clamp(b.y, BOARD_TOP, BOARD_BOT);
        const dx = b.x - bx;
        const dy = b.y - cy;
        const d = Math.hypot(dx, dy);
        const min = BR + BOARD_R;
        if (d >= min) return false;
        const nx = d > 1e-6 ? dx / d : -1;
        const ny = d > 1e-6 ? dy / d : 0;
        b.x = bx + nx * min;
        b.y = cy + ny * min;
        const rvx = b.vx - hoopVx();
        const vn = rvx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.65 * vn * nx;
          b.vy -= 1.65 * vn * ny;
          if (-vn > 120) {
            api.sfx('tick');
            boardGlow = Math.max(boardGlow, 0.4);
          }
        }
        return true;
      }

      function stepBalls(h) {
        // Hoop rides its track.
        hx += hoopVx() * h;
        if (hx < X_MIN) {
          hx = X_MIN;
          hoopDir = 1;
        } else if (hx > X_MAX) {
          hx = X_MAX;
          hoopDir = -1;
        }
        for (const b of balls) {
          if (b.state === 'held') continue;
          const py = b.y;
          b.vy += G * h;
          b.x += b.vx * h;
          b.y += b.vy * h;
          if (rimHit(b, hx - RH, RIM_Y) || rimHit(b, hx + RH, RIM_Y)) b.rim = true;
          if (boardHit(b)) b.board = true;
          // Net drag: a ball under the rim is pulled along with the hoop and slowed.
          if (b.y > RIM_Y && b.y < RIM_Y + NET_D && Math.abs(b.x - hx) < RH) {
            b.vx += (hoopVx() - b.vx) * Math.min(1, 7 * h);
            b.vy *= 1 - Math.min(0.5, 1.8 * h);
          }
          if (b.state === 'fly' && py < RIM_Y && b.y >= RIM_Y && b.vy > 0 && Math.abs(b.x - hx) < RH - 3) scoreBall(b);
          if (b.y > FLOOR - BR) {
            b.y = FLOOR - BR;
            if (b.vy > 0) {
              if (b.vy > 160) api.sfx('tick');
              b.vy = b.vy > 60 ? -b.vy * 0.55 : 0;
              b.vx *= 0.86;
            }
            if (b.state === 'fly') missBall(b);
          }
        }
        // Balls bump each other.
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          if (a.state === 'held') continue;
          for (let j = i + 1; j < balls.length; j++) {
            const c = balls[j];
            if (c.state === 'held') continue;
            const dx = c.x - a.x;
            const dy = c.y - a.y;
            const d = Math.hypot(dx, dy);
            if (d >= BR * 2 || d < 1e-6) continue;
            const nx = dx / d;
            const ny = dy / d;
            const push = (BR * 2 - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            c.x += nx * push;
            c.y += ny * push;
            const vn = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
            if (vn < 0) {
              const j2 = -0.9 * vn;
              a.vx -= j2 * nx;
              a.vy -= j2 * ny;
              c.vx += j2 * nx;
              c.vy += j2 * ny;
            }
          }
        }
      }

      function updateBalls(dt) {
        let fast = Math.abs(hoopVx());
        for (const b of balls) if (b.state !== 'held') fast = Math.max(fast, Math.hypot(b.vx, b.vy));
        const n = Math.min(40, Math.max(1, Math.ceil((fast * dt) / 4)));
        for (let i = 0; i < n; i++) stepBalls(dt / n);
        for (const b of balls) {
          if (b.state === 'held') continue;
          b.age += dt;
          b.rot += (b.vx / BR) * dt;
          b.trail.push(b.x, b.y);
          if (b.trail.length > 16) b.trail.splice(0, 2);
          const onFloor = b.y >= FLOOR - BR - 0.5;
          if (onFloor) {
            b.vx *= Math.exp(-1.6 * dt);
            b.floorT += dt;
          }
          if (b.state === 'fly' && (b.age > 7 || b.x < -BR * 2 || b.x > W + BR * 2)) missBall(b);
          if (b.floorT > 0.9 || b.x < -60 || b.x > W + 60 || b.age > 9) b.alpha -= dt * 3;
        }
        balls = balls.filter((b) => b.alpha > 0);
      }

      /* ---------- Turn flow ---------- */
      function startMatch(m, d) {
        mode = m;
        diff = d || diff;
        const names = m === 'solo' ? ['You'] : m === 'cpu' ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
        players = names.map((name, i) => ({ name, color: i === 0 ? C.p1 : C.p2, score: 0, makes: 0, misses: 0, swishes: 0,
          bestStreak: 0 }));
        order = m === 'solo' ? [0] : [0, 1, 0, 1];
        turnTime = m === 'solo' ? 60 : 30;
        turnIdx = 0;
        told = {};
        bestStreak = 0;
        updateScore();
        if (m === 'solo') startTurn();
        else showCover();
      }

      function resetCourt() {
        balls = [];
        parts = [];
        floats = [];
        banner = null;
        streak = 0;
        hoopSpeed = 0;
        hoopDir = -1;
        hx = HOME_X;
        netSwing = 0;
        netSwingV = 0;
        netStretch = 0;
        charging = false;
        drag = null;
        heat = false;
        readyT = 0;
        spawnBall();
      }

      function showCover() {
        state = 'cover';
        resetCourt();
        const p = shooter();
        const round = Math.floor(turnIdx / 2) + 1;
        const scores = players[0].name + ' ' + players[0].score + ', ' + players[1].name + ' ' + players[1].score + '.';
        const heatNote = finalTurn() ? ' Last turn: heat time doubles points in the final 10 seconds.' : '';
        if (cpuTurn()) {
          api.setStatus('The computer shoots next.');
          api.menu({
            title: 'Computer’s turn',
            text: 'Turn ' + round + ' of 2. ' + (turnIdx ? scores : '') + heatNote,
            buttons: [{ label: 'Watch', primary: true, onClick: startTurn }]
          });
          return;
        }
        api.setStatus(p.name + ' shoots next.');
        api.menu({
          title: mode === 'cpu' ? 'Your turn' : turnIdx === 0 ? p.name + ' shoots first' : 'Pass to ' + p.name,
          text: '30 seconds, turn ' + round + ' of 2. ' + (turnIdx ? scores : 'Flick up from the ball, or aim with the arrows and hold Space.') +
            heatNote,
          buttons: [{ label: 'Go', primary: true, onClick: startTurn }]
        });
      }

      function startTurn() {
        resetCourt();
        state = 'play';
        stateT = 0;
        timeLeft = turnTime;
        tickSec = Math.ceil(timeLeft);
        previewLeft = PREVIEW_SHOTS;
        cpu = cpuTurn() ? { wait: 0.9, aimT: 0, plan: null } : null;
        api.sfx('blip');
        const p = shooter();
        if (cpu) api.setStatus('The computer is shooting. Watch the hoop speed up when it gets a streak.');
        else if (!told.start) {
          told.start = true;
          api.setStatus((mode === 'solo' ? '' : p.name + ': ') + 'flick up from the ball to throw, or aim with ←/→ and hold Space. ' +
            'Baskets in a row make the hoop slide faster.');
        } else {
          api.setStatus(p.name + ' is shooting.');
        }
      }

      function endTurn() {
        state = 'cover';
        charging = false;
        drag = null;
        turnIdx++;
        if (turnIdx >= order.length) finish();
        else showCover();
      }

      function finish() {
        state = 'over';
        banner = null;
        if (mode === 'solo') {
          const p = players[0];
          const isBest = api.reportScore(p.score);
          api.sfx(isBest ? 'win' : 'score');
          api.setStatus('Final: ' + p.score + ' points. Best streak ' + p.bestStreak + '.');
          api.menu({
            title: isBest ? 'New best: ' + p.score + '!' : 'Time!',
            text: p.score + ' points from ' + p.makes + ' baskets (' + p.swishes + ' swishes). Best streak: ' + p.bestStreak + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startMatch(mode, diff) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
          return;
        }
        const a = players[0];
        const b = players[1];
        const winner = a.score === b.score ? null : a.score > b.score ? a : b;
        api.sfx(mode === 'cpu' && winner === b ? 'lose' : 'win');
        const title = !winner ? 'It’s a tie!' : mode === 'cpu' ? (winner === a ? 'You win!' : 'The computer wins') : winner.name + ' wins!';
        api.setStatus('Final score ' + a.score + ' – ' + b.score + '.');
        api.menu({
          title,
          text: a.name + ': ' + a.score + ' (' + a.makes + ' baskets, streak ' + a.bestStreak + ')\n' +
            b.name + ': ' + b.score + ' (' + b.makes + ' baskets, streak ' + b.bestStreak + ')',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(mode, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        players = [];
        resetCourt();
        api.setScore('—');
        api.setStatus('60 seconds on the clock. Baskets in a row speed up the hoop; swishes count double.');
        api.menu({
          title: 'Hoop Shot',
          text: 'Flick the ball into the hoop. The hoop slides faster with every streak, and swishes count double.',
          buttons: [
            { label: 'Solo', primary: true, onClick: () => startMatch('solo') },
            { label: '2 players', onClick: () => startMatch('duo') },
            { label: 'vs computer', onClick: showDifficultyMenu }
          ]
        });
      }

      function showDifficultyMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'You and the computer take two 30-second turns each. Highest total wins.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch('cpu', 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch('cpu', 'normal') },
            { label: 'Hard', onClick: () => startMatch('cpu', 'hard') }
          ]
        });
      }

      /* ---------- Computer shooter ---------- */
      /* Where the hoop will be after t seconds, bouncing between the track ends at the current speed. */
      function predictHoop(t) {
        let x = hx;
        let dir = hoopDir;
        let left = hoopSpeed * t;
        for (let i = 0; i < 6 && left > 0; i++) {
          const room = dir > 0 ? X_MAX - x : x - X_MIN;
          if (left <= room) {
            x += dir * left;
            left = 0;
          } else {
            x += dir * room;
            left -= room;
            dir = -dir;
          }
        }
        return x;
      }

      function cpuPlan() {
        const D = DIFF[diff];
        const ang = U.rand(0.97, 1.15);
        let tx = hx;
        let v = 900;
        let T = 0.9;
        for (let i = 0; i < 5; i++) {
          const lead = predictHoop(T);
          tx = hx + (lead - hx) * D.lead;
          const dx = tx - SPAWN.x;
          const rise = dx * Math.tan(ang) - (SPAWN.y - RIM_Y);
          if (rise <= 1) break;
          v = Math.sqrt((G * dx * dx) / (2 * Math.cos(ang) * Math.cos(ang) * rise));
          T = dx / (v * Math.cos(ang));
        }
        // Skill-based error, worse when the hoop is moving fast.
        const sv = D.sv + (hoopSpeed / 330) * D.move;
        const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        const a2 = ang + gauss() * D.sa;
        const v2 = v * (1 + gauss() * sv * 1.6);
        return { ang: a2, vx: Math.cos(a2) * v2, vy: -Math.sin(a2) * v2 };
      }

      function cpuUpdate(dt) {
        if (!cpu || state !== 'play') return;
        if (cpu.plan) {
          cpu.aimT -= dt;
          aimAng = U.lerp(aimAng, cpu.plan.ang, Math.min(1, dt * 10));
          charge = Math.min(1, charge + dt * 2.5);
          if (cpu.aimT <= 0) {
            const p = cpuPlan();
            throwBall(p.vx, p.vy);
            cpu.plan = null;
            charge = 0;
            cpu.wait = U.rand(DIFF[diff].wait[0], DIFF[diff].wait[1]);
          }
          return;
        }
        cpu.wait -= dt;
        if (cpu.wait <= 0 && ballReady()) {
          cpu.plan = cpuPlan();
          cpu.aimT = 0.35;
          charge = 0;
        }
      }

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        stateT += dt;
        shake = Math.max(0, shake - dt * 25);
        flash = Math.max(0, flash - dt * 2);
        boardGlow = Math.max(0, boardGlow - dt * 1.5);
        crowdJump = Math.max(0, crowdJump - dt * 1.8);
        netStretch = Math.max(0, netStretch - dt * 3);
        netSwingV += -netSwing * 90 * dt;
        netSwingV *= Math.exp(-5 * dt);
        netSwing = U.clamp(netSwing + netSwingV * dt, -16, 16);
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.4) banner = null;
        }
        floats.forEach((f) => { f.t += dt; });
        floats = floats.filter((f) => f.t < 1.2);
        for (const q of parts) {
          q.vy += q.g * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= 1 - dt * 2;
          q.life -= dt;
        }
        parts = parts.filter((q) => q.life > 0);

        if (state !== 'play' && state !== 'buzzer') {
          if (state === 'menu') {
            // Idle hoop drifts on the title screen.
            hx = HOME_X - 60 + Math.sin(clock * 0.8) * 60;
          }
          return;
        }

        // Hoop speed follows the streak.
        const target = hoopSpeedFor(streak);
        hoopSpeed += U.clamp(target - hoopSpeed, -260 * dt, 160 * dt);
        updateBalls(dt);

        if (state === 'play') {
          timeLeft -= dt;
          if (!heat && finalTurn() && timeLeft <= HEAT_TIME) {
            heat = true;
            banner = { text: 'Heat time!', color: C.p1, t: 0 };
            flash = 0.8;
            flashColor = C.p1;
            api.sfx('power');
            hint('heat', 'Heat time! Every basket is worth double for the last 10 seconds.');
          }
          const sec = Math.ceil(timeLeft);
          if (sec < tickSec) {
            tickSec = sec;
            if (sec <= 5 && sec > 0) api.sfx('tick');
          }
          if (!ballReady()) {
            readyT -= dt;
            if (readyT <= 0) spawnBall();
          }
          if (charging) {
            if (!api.keys.has('Space') && !api.keys.has('Enter')) {
              charging = false;
            } else {
              chargeT += dt;
              const ph = (chargeT / 1.1) % 2;
              charge = ph < 1 ? ph : 2 - ph;
            }
          }
          if (humanCanThrow()) {
            const k = api.keys;
            const l = k.has('ArrowLeft') || k.has('KeyA');
            const r = k.has('ArrowRight') || k.has('KeyD');
            if (l !== r) aimAng = U.clamp(aimAng + (l ? 1 : -1) * 0.9 * dt, 0.35, 1.45);
          }
          cpuUpdate(dt);
          if (timeLeft <= 0) {
            timeLeft = 0;
            state = 'buzzer';
            stateT = 0;
            charging = false;
            drag = null;
            balls = balls.filter((b) => b.state !== 'held');
            banner = { text: 'Time!', color: C.text, t: 0 };
            api.sfx('boom');
            shake = 4;
          }
        } else if (state === 'buzzer') {
          const flying = balls.some((b) => b.state === 'fly');
          if ((!flying && stateT > 1.2) || stateT > 3.5) {
            balls.forEach((b) => missBall(b));
            endTurn();
          }
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

      function drawArena() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        // Spotlights.
        ctx.fillStyle = U.alpha(C.violet, 0.06);
        ctx.beginPath();
        ctx.moveTo(250, 0);
        ctx.lineTo(330, 0);
        ctx.lineTo(520, FLOOR);
        ctx.lineTo(80, FLOOR);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = U.alpha(C.gold, heat ? 0.1 : 0.05);
        ctx.beginPath();
        ctx.moveTo(600, 0);
        ctx.lineTo(700, 0);
        ctx.lineTo(900, FLOOR);
        ctx.lineTo(440, FLOOR);
        ctx.closePath();
        ctx.fill();
        // Crowd in the stands.
        const rows = [[330, 9, 26], [362, 10, 24], [396, 11, 22]];
        rows.forEach(([y, r, gap], ri) => {
          for (let i = 0, x = 10 + ri * 8; x < W; i++, x += gap) {
            const hop = crowdJump > 0 ? Math.max(0, Math.sin(clock * 16 + i * 1.7)) * crowdJump * 7 : Math.sin(clock * 1.3 + i) * 0.8;
            const col = [C.panel2, C.panel, '#2E2860'][(i + ri) % 3];
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(x, y - hop, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(x - r, y - hop + r * 0.6, r * 2, 26);
          }
        });
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 418, W, FLOOR - 418);
        ctx.fillStyle = U.alpha(C.gold, 0.8);
        ctx.fillRect(0, 418, W, 3);
        ctx.font = '800 26px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = U.alpha(C.gold, 0.18);
        ctx.fillText('PLAYREALM HOOPS', W / 2, 460);
        // Floor.
        ctx.fillStyle = WOOD;
        ctx.fillRect(0, FLOOR, W, H - FLOOR);
        ctx.fillStyle = WOOD_DARK;
        for (let x = 20; x < W; x += 60) ctx.fillRect(x, FLOOR, 2, H - FLOOR);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(0, FLOOR, W, 3);
        // Painted lane under the hoop range.
        ctx.fillStyle = U.alpha(C.p2, 0.25);
        ctx.fillRect(X_MIN - RH, FLOOR + 6, X_MAX - X_MIN + RH * 2, 10);
        // Shooting spot.
        ctx.fillStyle = U.alpha(C.text, 0.5);
        ctx.fillRect(SPAWN.x - 30, FLOOR + 6, 60, 5);
        if (heat) {
          ctx.fillStyle = U.alpha(C.p1, 0.08 + 0.04 * Math.sin(clock * 10));
          ctx.fillRect(0, 0, W, H);
          for (let x = 0; x < W; x += 30) {
            const f = 14 + Math.sin(clock * 9 + x * 0.3) * 8;
            ctx.fillStyle = U.alpha(x % 60 ? C.gold : C.p1, 0.5);
            ctx.beginPath();
            ctx.moveTo(x, FLOOR);
            ctx.quadraticCurveTo(x + 15, FLOOR - f * 2, x + 30, FLOOR);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      function drawTrack() {
        ctx.strokeStyle = '#4A4E6E';
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(X_MIN + RH + BOARD_GAP - 20, TRACK_Y);
        ctx.lineTo(X_MAX + RH + BOARD_GAP + 30, TRACK_Y);
        ctx.stroke();
        ctx.strokeStyle = '#6E7391';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Speed chevrons on the track show how fast the hoop slides.
        const lv = Math.round((hoopSpeed / 330) * 5);
        if (lv > 0) {
          const bx = hx + RH + BOARD_GAP + 4;
          ctx.fillStyle = heat ? C.p1 : C.gold;
          for (let i = 0; i < lv; i++) {
            const x = bx + hoopDir * (30 + i * 12);
            ctx.beginPath();
            ctx.moveTo(x + hoopDir * 7, TRACK_Y);
            ctx.lineTo(x, TRACK_Y - 7);
            ctx.lineTo(x, TRACK_Y + 7);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      function drawShooter() {
        const p = players.length ? shooter() : { color: C.p1 };
        const x = SPAWN.x - 34;
        const col = p.color;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.ellipse(x + 6, FLOOR + 4, 40, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Legs.
        ctx.strokeStyle = '#2B2F4A';
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 8, 452);
        ctx.lineTo(x - 12, FLOOR - 4);
        ctx.moveTo(x + 8, 452);
        ctx.lineTo(x + 14, FLOOR - 4);
        ctx.stroke();
        // Body in the player's colour.
        ctx.fillStyle = col;
        U.roundRect(ctx, x - 20, 396, 40, 62, 14);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.ink, 0.3);
        ctx.font = '800 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(players.length ? String(order[Math.min(turnIdx, order.length - 1)] + 1) : '1', x, 426);
        // Head.
        ctx.fillStyle = '#E9C29A';
        ctx.beginPath();
        ctx.arc(x, 380, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.fillRect(x - 15, 370, 30, 5);
        // Arm reaching to the ball.
        const held = balls.find((b) => b.state === 'held');
        ctx.strokeStyle = '#E9C29A';
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(x + 14, 408);
        ctx.lineTo(held ? SPAWN.x - 10 : x + 30, held ? SPAWN.y + 6 : 370);
        ctx.stroke();
        ctx.lineCap = 'butt';
      }

      function drawAim() {
        if (!humanCanThrow() && !(cpu && cpu.plan)) return;
        const held = balls.find((b) => b.state === 'held');
        if (!held) return;
        let ang = aimAng;
        let power = charging || (cpu && cpu.plan) ? charge : null;
        if (drag && drag.len > 6) {
          ang = drag.ang;
          power = drag.power;
        }
        // Aim arrow (always on).
        const ax = Math.cos(ang);
        const ay = -Math.sin(ang);
        const col = shooter().color;
        const L = 46 + (power === null ? 0 : power * 40);
        ctx.strokeStyle = U.alpha(col, 0.9);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(held.x + ax * (BR + 4), held.y + ay * (BR + 4));
        ctx.lineTo(held.x + ax * (BR + L), held.y + ay * (BR + L));
        ctx.stroke();
        ctx.lineCap = 'butt';
        ctx.fillStyle = col;
        const tx = held.x + ax * (BR + L + 6);
        const ty = held.y + ay * (BR + L + 6);
        ctx.beginPath();
        ctx.moveTo(tx + ax * 8, ty + ay * 8);
        ctx.lineTo(tx - ay * 7, ty + ax * 7);
        ctx.lineTo(tx + ay * 7, ty - ax * 7);
        ctx.closePath();
        ctx.fill();
        // Power meter next to the ball.
        if (power !== null) {
          const mx = SPAWN.x - 120;
          ctx.fillStyle = U.alpha(C.ink, 0.8);
          U.roundRect(ctx, mx, held.y - 46, 16, 92, 6);
          ctx.fill();
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = power > 0.85 ? C.p1 : power > 0.5 ? C.gold : C.mint;
          ctx.fillRect(mx + 3, held.y + 43 - power * 86, 10, power * 86);
        }
        // Arc preview for the first few throws only.
        if (previewLeft > 0 && power !== null && !cpu) {
          const v = launchVel(ang, power);
          let x = held.x;
          let y = held.y;
          let vx = v.vx;
          let vy = v.vy;
          for (let i = 0; i < 70; i++) {
            vy += G * 0.02;
            x += vx * 0.02;
            y += vy * 0.02;
            if (y > FLOOR || x > W) break;
            if (i % 2) continue;
            ctx.fillStyle = U.alpha('#FFFFFF', 0.75 - i * 0.008);
            ctx.beginPath();
            ctx.arc(x, y, 2.6, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.font = SMALL;
          ctx.textAlign = 'left';
          ctx.fillStyle = C.muted;
          ctx.fillText('Arc preview: ' + previewLeft + ' left', 18, 300);
        }
      }

      function drawHud() {
        // Scoreboard.
        ctx.fillStyle = U.alpha(C.panel, 0.95);
        U.roundRect(ctx, W / 2 - 92, 8, 184, 62, 14);
        ctx.fill();
        ctx.strokeStyle = heat ? C.p1 : C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        const sec = Math.max(0, Math.ceil(timeLeft));
        ctx.font = '800 32px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = heat ? (Math.sin(clock * 10) > 0 ? C.p1 : C.gold) : sec <= 5 && state === 'play' ? C.p1 : C.text;
        ctx.fillText('0:' + String(sec).padStart(2, '0'), W / 2, 37);
        ctx.font = SMALL;
        ctx.fillStyle = heat ? C.p1 : C.muted;
        ctx.fillText(heat ? 'HEAT TIME ×2' : mode === 'solo' || !players.length ? 'SHOT CLOCK' : 'TURN ' + (Math.floor(turnIdx / 2) + 1) + ' OF 2', W / 2, 61);
        if (!players.length) return;
        // Scores.
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        players.forEach((p, i) => {
          const active = order[Math.min(turnIdx, order.length - 1)] === i && state !== 'over';
          ctx.fillStyle = active ? p.color : U.alpha(p.color, 0.55);
          ctx.fillText((active && players.length > 1 ? '▶ ' : '') + p.name, 18, 22 + i * 44);
          ctx.font = '800 22px Unbounded, sans-serif';
          ctx.fillText(String(p.score), 18, 44 + i * 44);
          ctx.font = HUD;
        });
        // Streak and multiplier.
        ctx.textAlign = 'right';
        ctx.fillStyle = streak > 0 ? C.gold : C.muted;
        ctx.fillText('Streak ' + streak, W - 18, 22);
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.fillStyle = multFor(streak) > 1 ? C.gold : C.muted;
        ctx.fillText('×' + multFor(streak), W - 18, 46);
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        const sp = Math.round(hoopSpeed);
        ctx.fillText(sp > 5 ? 'hoop speed ' + sp : 'hoop still', W - 18, 70);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawArena();
        drawTrack();
        // Balls behind the front of the rim are drawn before the hoop.
        drawShooter();
        const behind = [];
        const front = [];
        balls.forEach((b) => ((b.state === 'scored' && b.y > RIM_Y - 4 && b.y < RIM_Y + NET_D + 20) ? behind : front).push(b));
        behind.forEach((b) => drawBall(ctx, b.x, b.y, BR, b.rot, b.alpha));
        drawHoop(ctx, hx, multFor(streak), boardGlow, netSwing, netStretch, clock, heat);
        front.forEach((b) => {
          if (b.state === 'fly' && Math.hypot(b.vx, b.vy) > 700) {
            for (let i = 0; i < b.trail.length - 2; i += 2) {
              ctx.fillStyle = U.alpha(heat ? C.p1 : ORANGE, (i / b.trail.length) * 0.25);
              ctx.beginPath();
              ctx.arc(b.trail[i], b.trail[i + 1], BR * (0.4 + (i / b.trail.length) * 0.5), 0, Math.PI * 2);
              ctx.fill();
            }
          }
          drawBall(ctx, b.x, b.y, BR, b.rot, b.alpha);
        });
        drawAim();
        if (drag && drag.len > 6 && humanCanThrow()) {
          ctx.strokeStyle = U.alpha(C.text, 0.35);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(drag.sx, drag.sy);
          ctx.lineTo(drag.x, drag.y);
          ctx.stroke();
          ctx.fillStyle = U.alpha(C.text, 0.5);
          ctx.beginPath();
          ctx.arc(drag.x, drag.y, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const q of parts) {
          ctx.globalAlpha = Math.max(0, q.life / q.max);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        floats.forEach((f) => {
          const a = Math.min(1, (1.2 - f.t) * 3);
          ctx.font = f.big ? '800 26px Unbounded, sans-serif' : HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 6;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = U.alpha(C.ink, 0.8 * a);
          ctx.strokeText(f.text, f.x, f.y - f.t * 40);
          ctx.fillStyle = U.alpha(f.color, a);
          ctx.fillText(f.text, f.x, f.y - f.t * 40);
        });
        ctx.restore();
        drawHud();
        if (banner) {
          const a = Math.min(1, banner.t * 6) * Math.min(1, (1.4 - banner.t) * 4);
          bigText(banner.text, W / 2, 190, banner.color, 0.85 + Math.min(1, banner.t * 6) * 0.15, Math.max(0, a));
        }
        if (cpu && state === 'play') {
          ctx.font = HUD;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.p2, 0.6 + 0.4 * Math.sin(clock * 4));
          ctx.fillText('Computer shooting…', 18, 300);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.2);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (e.repeat) return;
        if ((e.code === 'Space' || e.code === 'Enter') && humanCanThrow() && ballReady() && !drag) {
          charging = true;
          chargeT = 0;
          charge = 0;
        }
      });
      api.on(window, 'keyup', (e) => {
        if ((e.code === 'Space' || e.code === 'Enter') && charging) {
          charging = false;
          humanThrow(aimAng, charge);
        }
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (!humanCanThrow() || charging) return;
        const p = api.toCanvas(e, canvas);
        drag = { sx: p.x, sy: p.y, x: p.x, y: p.y, len: 0, ang: aimAng, power: 0 };
      });
      api.on(window, 'pointermove', (e) => {
        if (!drag) return;
        const p = api.toCanvas(e, canvas);
        drag.x = p.x;
        drag.y = p.y;
        const dx = p.x - drag.sx;
        const dy = drag.sy - p.y;
        drag.len = Math.hypot(dx, dy);
        if (drag.len > 6) {
          drag.ang = U.clamp(Math.atan2(Math.max(dy, 0.01), dx), 0.15, 1.75);
          drag.power = U.clamp(drag.len / DRAG_MAX, 0, 1);
        }
      });
      api.on(window, 'pointerup', () => {
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.len < 18 || d.y > d.sy - 8) return;
        humanThrow(d.ang, d.power);
      });
      api.on(window, 'pointercancel', () => { drag = null; });

      if (api.onPause) api.onPause(() => { drag = null; charging = false; });
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
