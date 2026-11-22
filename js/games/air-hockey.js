/* Air Hockey — frictionless table duel where every goal you score widens your own goal. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 540;
  const L = 34;               // table edges
  const RT = W - 34;
  const T = 34;
  const B = H - 34;
  const CY = H / 2;
  const CR = 60;              // rounded corner radius
  const PR = 16;              // puck radius
  const MR = 28;              // mallet radius
  const POST = 5;
  const POCKET = 34;
  const GOAL_BASE = 68;       // half-width of a goal mouth at the start
  const GOAL_STEP = 0.2;      // each goal you score widens your own goal by 20% of the base
  const GOAL_MAX = 170;
  const WIN = 7;
  const ACC = 3000;
  const MAX_MS = 560;
  const DASH_SPEED = 950;
  const DASH_TIME = 0.16;
  const DASH_CD = 2;
  const PUCK_MAX = 1400;
  const WALL_E = 0.88;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const KEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' }
  ];
  const DIFF = {
    easy: { think: 0.28, speed: 0.62, err: 60, smart: 0.2, dash: 0, bank: 0, block: 600 },
    normal: { think: 0.13, speed: 0.82, err: 30, smart: 0.6, dash: 0.3, bank: 0.25, block: 450 },
    hard: { think: 0.05, speed: 1, err: 10, smart: 0.95, dash: 0.8, bank: 0.5, block: 260 }
  };
  const CORNERS = [[L + CR, T + CR], [RT - CR, T + CR], [L + CR, B - CR], [RT - CR, B - CR]];

  /* Keeps a circle inside the rounded corners; reflects velocity with restitution e. */
  function cornerConfine(o, r, e) {
    let hit = false;
    for (const [cx, cy] of CORNERS) {
      if ((cx < W / 2 ? o.x >= cx : o.x <= cx) || (cy < H / 2 ? o.y >= cy : o.y <= cy)) continue;
      const dx = o.x - cx;
      const dy = o.y - cy;
      const d = Math.hypot(dx, dy);
      const lim = CR - r;
      if (d <= lim) continue;
      const nx = dx / d;
      const ny = dy / d;
      o.x = cx + nx * lim;
      o.y = cy + ny * lim;
      const vn = o.vx * nx + o.vy * ny;
      if (vn > 0) {
        o.vx -= (1 + e) * vn * nx;
        o.vy -= (1 + e) * vn * ny;
        hit = true;
      }
    }
    return hit;
  }

  function drawMallet(ctx, x, y, color) {
    ctx.fillStyle = U.alpha(C.ink, 0.5);
    ctx.beginPath();
    ctx.arc(x + 2, y + 3, MR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, MR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = U.alpha(C.ink, 0.35);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, MR - 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = U.alpha(C.text, 0.45);
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 9, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawPuck(ctx, x, y) {
    ctx.fillStyle = C.text;
    ctx.beginPath();
    ctx.arc(x, y, PR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, PR - 5, 0, Math.PI * 2);
    ctx.stroke();
  }

  Arcade.register({
    id: 'air-hockey',
    title: 'Air Hockey',
    mode: 'together',
    players: '1–2P',
    color: C.mint,
    tagline: 'Slam the puck into the other goal on a frictionless table.',
    hook: 'Comeback goals: every goal you score makes your own goal wider.',
    tags: ['versus', 'sports', 'physics', 'keyboard', 'touch', 'computer opponent'],
    howTo: 'Push your mallet around your half and knock the puck into the other goal. Hit it while moving to send it faster. ' +
      'Your action key gives a short dash; the ring around your mallet shows when it is ready. ' +
      'Every goal you score widens your own goal by 20%, so a lead is never safe. First to 7 wins. ' +
      'Against the computer you can also drag your mallet with the mouse or a finger.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Coral: move' },
      { keys: ['Space'], label: 'Coral: dash' },
      { keys: ['↑', '←', '↓', '→'], label: 'Cyan: move' },
      { keys: ['Enter'], label: 'Cyan: dash' },
      { keys: ['Drag'], label: 'Move your mallet (vs computer)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = U.alpha(C.panel, 0.9);
      U.roundRect(ctx, 14, 12, 292, 176, 24);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(160, 14);
      ctx.lineTo(160, 186);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(160, 100, 24, 0, Math.PI * 2);
      ctx.stroke();
      // Narrow coral goal on the left, a wide cyan goal on the right that keeps growing.
      const grow = 46 + Math.min(1, (t % 4) / 1.2) * 14;
      const goal = (x, half, col, dir) => {
        ctx.fillStyle = C.ink;
        ctx.fillRect(x - 4, 100 - half, 8, half * 2);
        ctx.fillStyle = U.alpha(col, 0.25);
        ctx.fillRect(dir < 0 ? x - 12 : x, 100 - half, 12, half * 2);
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x, 100 - half);
        ctx.lineTo(x, 100 + half);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, 100 - half, 4, 0, Math.PI * 2);
        ctx.arc(x, 100 + half, 4, 0, Math.PI * 2);
        ctx.fill();
      };
      goal(14, 26, C.p1, -1);
      goal(306, grow, C.p2, 1);
      ctx.strokeStyle = U.alpha(C.p2, 0.8);
      ctx.lineWidth = 2;
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.moveTo(292, 100 + s * (grow - 18));
        ctx.lineTo(292, 100 + s * (grow + 2));
        ctx.moveTo(287, 100 + s * (grow - 4));
        ctx.lineTo(292, 100 + s * (grow + 2));
        ctx.lineTo(297, 100 + s * (grow - 4));
        ctx.stroke();
      });
      ctx.font = HUD;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.p2;
      ctx.fillText('+20%', 282, 100);
      ctx.save();
      ctx.scale(0.62, 0.62);
      drawMallet(ctx, 120 / 0.62, (100 + Math.sin(t * 2) * 10) / 0.62, C.p1);
      drawMallet(ctx, 250 / 0.62, 150 / 0.62, C.p2);
      ctx.restore();
      // The puck streaks toward the wide goal.
      const px = 205 + ((t * 30) % 30);
      const py = 72 + ((t * 30) % 30) * 0.3;
      for (let i = 1; i <= 6; i++) {
        ctx.fillStyle = U.alpha(C.mint, 0.12 * (7 - i) / 6 + 0.04);
        ctx.beginPath();
        ctx.arc(px - i * 9, py - i * 2.7, 9 - i * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(0.62, 0.62);
      drawPuck(ctx, 0, 0);
      ctx.restore();
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'play' | 'goal' | 'over'
      let vsCpu = false;
      let diff = 'normal';
      let score = [0, 0];
      let gHalf = [GOAL_BASE, GOAL_BASE];
      let gTarget = [GOAL_BASE, GOAL_BASE];
      let mallets = [makeMallet(0), makeMallet(1)];
      let puck = makePuck(-1);
      let timer = 0;
      let goT = 0;
      let banner = null;
      let floats = [];
      let parts = [];
      let shake = 0;
      let flash = 0;
      let flashColor = C.text;
      let clock = 0;
      let hitSfx = 0;
      let slowT = 0;
      let told = false;
      let drag = null;
      let serveSide = 0; // the player who gets the puck at the next faceoff
      let ai = null;

      const names = () => (vsCpu ? ['You', 'Computer'] : ['Coral', 'Cyan']);
      const live = () => state === 'play';

      function makeMallet(id) {
        return { id, x: id === 0 ? L + 110 : RT - 110, y: CY, vx: 0, vy: 0, dashT: 0, cd: 0,
          color: id === 0 ? C.p1 : C.p2, trail: [] };
      }
      function makePuck(side) {
        return { x: W / 2 + side * 120, y: CY, vx: 0, vy: 0, trail: [] };
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

      /* ---------- Physics ---------- */
      function confineMallet(m) {
        cornerConfine(m, MR, 0);
        const minX = m.id === 0 ? L + MR : W / 2 + MR;
        const maxX = m.id === 0 ? W / 2 - MR : RT - MR;
        if (m.x < minX) { m.x = minX; m.vx = Math.max(0, m.vx); }
        if (m.x > maxX) { m.x = maxX; m.vx = Math.min(0, m.vx); }
        if (m.y < T + MR) { m.y = T + MR; m.vy = Math.max(0, m.vy); }
        if (m.y > B - MR) { m.y = B - MR; m.vy = Math.min(0, m.vy); }
      }

      function confinePuck() {
        const p = puck;
        let hit = cornerConfine(p, PR, WALL_E);
        if (p.y < T + PR) { p.y = T + PR; if (p.vy < 0) { p.vy = -p.vy * WALL_E; hit = true; } }
        if (p.y > B - PR) { p.y = B - PR; if (p.vy > 0) { p.vy = -p.vy * WALL_E; hit = true; } }
        for (let side = 0; side < 2; side++) {
          const wx = side === 0 ? L : RT;
          const s = side === 0 ? 1 : -1; // direction from this wall into the table
          const g = gHalf[side];
          const into = (p.x - wx) * s;
          if (into >= PR + POST) continue;
          if (into < 0) {
            // Inside the goal pocket: stay within the mouth.
            const lim = g - PR;
            if (p.y < CY - lim) { p.y = CY - lim; if (p.vy < 0) p.vy = -p.vy * WALL_E; }
            if (p.y > CY + lim) { p.y = CY + lim; if (p.vy > 0) p.vy = -p.vy * WALL_E; }
          } else if (into < PR && Math.abs(p.y - CY) >= g) {
            p.x = wx + s * PR;
            if (p.vx * s < 0) { p.vx = -p.vx * WALL_E; hit = true; }
          }
          for (const py of [CY - g, CY + g]) {
            const dx = p.x - wx;
            const dy = p.y - py;
            const d = Math.hypot(dx, dy);
            if (d >= PR + POST || d < 0.001) continue;
            const nx = dx / d;
            const ny = dy / d;
            p.x = wx + nx * (PR + POST);
            p.y = py + ny * (PR + POST);
            const vn = p.vx * nx + p.vy * ny;
            if (vn < 0) {
              p.vx -= (1 + WALL_E) * vn * nx;
              p.vy -= (1 + WALL_E) * vn * ny;
              hit = true;
            }
          }
        }
        return hit;
      }

      function capPuck() {
        const sp = Math.hypot(puck.vx, puck.vy);
        if (sp > PUCK_MAX) {
          puck.vx *= PUCK_MAX / sp;
          puck.vy *= PUCK_MAX / sp;
        }
      }

      function strike(m) {
        const p = puck;
        const dx = p.x - m.x;
        const dy = p.y - m.y;
        const d = Math.hypot(dx, dy);
        const min = PR + MR;
        if (d >= min) return;
        const nx = d > 0.001 ? dx / d : (m.id === 0 ? 1 : -1);
        const ny = d > 0.001 ? dy / d : 0;
        p.x = m.x + nx * min;
        p.y = m.y + ny * min;
        const vn = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
        if (vn >= 0) return;
        p.vx -= 1.9 * vn * nx;
        p.vy -= 1.9 * vn * ny;
        capPuck();
        if (-vn > 120) {
          burst(m.x + nx * MR, m.y + ny * MR, m.color, Math.min(16, 4 + (-vn / 80) | 0), 60 + -vn * 0.25, 0.3, 3);
          if (hitSfx <= 0) {
            api.sfx('hit');
            hitSfx = 0.07;
          }
          if (-vn > 750) shake = Math.max(shake, 5);
        }
      }

      /* If the puck is pinned against a wall, the mallet gives way instead of the puck. */
      function yieldMallet(m) {
        const dx = m.x - puck.x;
        const dy = m.y - puck.y;
        const d = Math.hypot(dx, dy);
        const min = PR + MR;
        if (d >= min) return;
        const nx = d > 0.001 ? dx / d : (m.id === 0 ? -1 : 1);
        const ny = d > 0.001 ? dy / d : 0;
        m.x = puck.x + nx * min;
        m.y = puck.y + ny * min;
        const vn = m.vx * nx + m.vy * ny;
        if (vn < 0) {
          m.vx -= vn * nx;
          m.vy -= vn * ny;
        }
        confineMallet(m);
      }

      function driveMallet(m, ix, iy, dt, speedMul, accMul) {
        const mag = Math.hypot(ix, iy);
        if (mag > 1) {
          ix /= mag;
          iy /= mag;
        }
        const cap = MAX_MS * speedMul;
        if (m.dashT > 0) {
          m.dashT -= dt;
        } else {
          m.vx += ix * ACC * accMul * dt;
          m.vy += iy * ACC * accMul * dt;
          const damp = Math.exp(-(mag > 0.05 ? 2 : 7) * dt);
          m.vx *= damp;
          m.vy *= damp;
          const sp = Math.hypot(m.vx, m.vy);
          if (sp > cap) {
            const k = Math.max(cap, sp - 2600 * dt) / sp;
            m.vx *= k;
            m.vy *= k;
          }
        }
        m.cd = Math.max(0, m.cd - dt);
        m.trail.push(m.x, m.y);
        while (m.trail.length > (m.dashT > 0 ? 12 : 2)) m.trail.splice(0, 2);
      }

      function dash(m, ix, iy) {
        if (m.cd > 0 || !live()) return;
        let dx = ix;
        let dy = iy;
        if (Math.hypot(dx, dy) < 0.1) {
          dx = puck.x - m.x;
          dy = puck.y - m.y;
        }
        const d = Math.hypot(dx, dy) || 1;
        m.vx = (dx / d) * DASH_SPEED;
        m.vy = (dy / d) * DASH_SPEED;
        m.dashT = DASH_TIME;
        m.cd = DASH_CD;
        burst(m.x, m.y, m.color, 10, 120, 0.3, 3);
        api.sfx('flip');
      }

      function physics(dt) {
        const fast = Math.max(Math.hypot(puck.vx, puck.vy),
          Math.hypot(mallets[0].vx, mallets[0].vy) + 300, Math.hypot(mallets[1].vx, mallets[1].vy) + 300);
        const steps = Math.min(40, Math.max(1, Math.ceil((fast * dt) / 4)));
        const h = dt / steps;
        let wallHit = false;
        for (let i = 0; i < steps; i++) {
          mallets.forEach((m) => {
            m.x += m.vx * h;
            m.y += m.vy * h;
            confineMallet(m);
          });
          puck.x += puck.vx * h;
          puck.y += puck.vy * h;
          mallets.forEach(strike);
          if (confinePuck()) wallHit = true;
          mallets.forEach(yieldMallet);
          if (puck.x < L - PR * 0.6) return goal(1);
          if (puck.x > RT + PR * 0.6) return goal(0);
        }
        const fr = Math.max(0, 1 - 0.18 * dt);
        puck.vx *= fr;
        puck.vy *= fr;
        if (wallHit && Math.hypot(puck.vx, puck.vy) > 150) {
          api.sfx('tick');
          burst(puck.x, puck.y, C.muted, 3, 80, 0.2, 2);
        }
        // Unstick: a puck resting by the boards drifts to the middle; one left alone in a half
        // drifts toward the centre line so the game never stalls.
        const sp = Math.hypot(puck.vx, puck.vy);
        slowT = sp < 40 ? slowT + dt : 0;
        const nearBoard = puck.x < L + PR + 14 || puck.x > RT - PR - 14 || puck.y < T + PR + 14 || puck.y > B - PR - 14;
        if (slowT > (nearBoard ? 2 : 3.5)) {
          const dx = nearBoard ? W / 2 - puck.x : (puck.x < W / 2 ? 1 : -1) * 200;
          const dy = nearBoard ? CY - puck.y : U.rand(-50, 50);
          const d = Math.hypot(dx, dy) || 1;
          puck.vx = (dx / d) * 160;
          puck.vy = (dy / d) * 160;
          slowT = 0;
          burst(puck.x, puck.y, C.mint, 8, 90, 0.3, 2);
        }
        puck.trail.push(puck.x, puck.y);
        if (puck.trail.length > 20) puck.trail.splice(0, 2);
      }

      /* ---------- Round flow ---------- */
      function goal(scorer) {
        const n = names();
        score[scorer]++;
        api.setScore(score[0] + ' – ' + score[1]);
        const sc = mallets[scorer];
        const gx = scorer === 0 ? RT : L;
        burst(gx, U.clamp(puck.y, T, B), sc.color, 40, 320, 0.8, 4);
        burst(gx, U.clamp(puck.y, T, B), C.text, 14, 200, 0.5, 3);
        shake = 12;
        flash = 0.7;
        flashColor = sc.color;
        api.sfx('score');
        puck.vx = 0;
        puck.vy = 0;
        state = 'goal';
        timer = 1.6;
        banner = { text: 'Goal!', color: sc.color, t: 0 };
        // The hook: the scorer's own goal gets wider.
        if (score[scorer] < WIN) {
          const before = gTarget[scorer];
          gTarget[scorer] = Math.min(GOAL_MAX, gTarget[scorer] + GOAL_BASE * GOAL_STEP);
          if (gTarget[scorer] > before) {
            const own = vsCpu ? (scorer === 0 ? 'Your goal' : 'Computer goal') : (scorer === 0 ? 'Coral goal' : 'Cyan goal');
            floats.push({ text: own + ' +20%', x: scorer === 0 ? L + 120 : RT - 120, y: CY, color: sc.color, t: 0 });
            api.after(350, () => api.sfx('power'));
            if (!told) {
              told = true;
              api.setStatus('Comeback goals: scoring made ' + (vsCpu && scorer === 0 ? 'your' : n[scorer] + '’s') +
                ' own goal 20% wider. Leads never feel safe.');
            } else {
              api.setStatus(n[scorer] + (vsCpu && scorer === 0 ? ' score' : ' scores') + '. ' + own + ' is now ' +
                Math.round((gTarget[scorer] / GOAL_BASE) * 100) + '% wide.');
            }
          }
        }
        serveSide = scorer === 0 ? 1 : 0; // the player who conceded gets the puck
      }

      function startCount() {
        puck = makePuck(serveSide === 0 ? -1 : 1);
        mallets = [makeMallet(0), makeMallet(1)];
        state = 'count';
        timer = 3;
        slowT = 0;
        ai = newAi();
        api.sfx('tick');
      }

      function startMatch(cpu, d) {
        vsCpu = cpu;
        diff = d;
        score = [0, 0];
        gHalf = [GOAL_BASE, GOAL_BASE];
        gTarget = [GOAL_BASE, GOAL_BASE];
        parts = [];
        floats = [];
        banner = null;
        drag = null;
        serveSide = Math.random() < 0.5 ? 0 : 1;
        api.setScore('0 – 0');
        api.setStatus('First to 7. Every goal you score makes your own goal wider.' +
          (cpu ? ' You can also drag your mallet.' : ''));
        startCount();
      }

      function matchOver() {
        state = 'over';
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
        banner = null;
        api.setStatus('Every goal you score widens your own goal, so the trailing player always has a way back.');
        api.menu({
          title: 'Air Hockey',
          text: 'First to 7. Scoring widens your own goal by 20%.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false, diff) },
            { label: 'vs computer', onClick: showDifficultyMenu }
          ]
        });
      }

      function showDifficultyMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'You play coral on the left: WASD or arrows, or drag your mallet. Space or Enter dashes.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') }
          ]
        });
      }

      /* ---------- Computer opponent ---------- */
      function newAi() {
        return { think: 0, tx: RT - 110, ty: CY, strikeT: 0, aimY: CY, ux: -1, uy: 0, err: 0, wantDash: false };
      }

      /* Where the puck will be when it reaches x, bouncing off the side boards (no friction). */
      function predictY(x) {
        const t = (x - puck.x) / puck.vx;
        if (!(t > 0) || t > 2) return null;
        const span = (B - PR) - (T + PR);
        let y = puck.y + puck.vy * t - (T + PR);
        y = ((y % (2 * span)) + 2 * span) % (2 * span);
        if (y > span) y = 2 * span - y;
        return y + T + PR;
      }

      function cpuPlan(m, D) {
        const p = puck;
        // A wider own goal makes the computer hang back closer to it.
        const homeX = RT - 70 - (gHalf[1] - GOAL_BASE) * 0.4;
        ai.err = U.rand(-1, 1) * D.err;
        if (p.x < W / 2 - PR) {
          // Puck on the far side: guard, shading toward it, or intercept a shot that is coming.
          const x = homeX;
          let y = CY + (p.y - CY) * 0.35;
          if (p.vx > 80) {
            const py = predictY(homeX);
            if (py !== null) y = py;
          }
          ai.tx = x;
          ai.ty = y + ai.err * 0.5;
          ai.strikeT = 0;
          return;
        }
        if (p.vx > D.block && p.x < m.x) {
          // Shot coming in fast: get between the puck and the goal.
          const py = predictY(Math.max(m.x, p.x + 40));
          ai.tx = Math.min(homeX, Math.max(p.x + 60, W / 2 + MR));
          ai.ty = (py !== null ? py : p.y) + ai.err * 0.4;
          ai.strikeT = 0;
          return;
        }
        // Strike: aim inside the opponent's goal mouth, at the side the defender leaves open.
        // A wider goal (the hook) gives the computer more room to aim.
        if (ai.strikeT <= 0) {
          const open = mallets[0].y > CY ? -1 : 1;
          const side = Math.random() < D.smart ? open : Math.random() < 0.5 ? -1 : 1;
          ai.aimY = CY + side * gHalf[0] * U.rand(0.35, 0.8) + ai.err;
          const blocked = Math.abs(mallets[0].y - (p.y + (ai.aimY - p.y) * ((mallets[0].x - p.x) / (L - p.x)))) < MR + PR;
          // Bank it off the board on the side away from the defender.
          if (blocked && Math.random() < D.bank) ai.aimY = mallets[0].y < CY ? 2 * (B - PR) - ai.aimY : 2 * (T + PR) - ai.aimY;
          ai.wantDash = Math.random() < D.dash;
        }
        let ux = L - p.x;
        let uy = ai.aimY - p.y;
        const ud = Math.hypot(ux, uy) || 1;
        ux /= ud;
        uy /= ud;
        ai.ux = ux;
        ai.uy = uy;
        const bx = p.x - ux * (PR + MR + 10);
        const by = p.y - uy * (PR + MR + 10);
        if (m.x < p.x - 6) {
          // Wrong side of the puck: loop around it instead of pushing it toward our goal.
          ai.tx = p.x + PR + MR + 20;
          ai.ty = p.y + (m.y < p.y ? -1 : 1) * (PR + MR + 14);
        } else if (ai.strikeT > 0 || Math.hypot(m.x - bx, m.y - by) < 16) {
          if (ai.strikeT <= 0) ai.strikeT = 0.3;
          ai.tx = p.x + ux * 40;
          ai.ty = p.y + uy * 40;
        } else {
          ai.tx = bx;
          ai.ty = by;
        }
      }

      function cpuDrive(m, dt) {
        const D = DIFF[diff];
        ai.think -= dt;
        ai.strikeT -= dt;
        if (ai.think <= 0) {
          ai.think = D.think * U.rand(0.8, 1.2);
          cpuPlan(m, D);
        }
        const cap = MAX_MS * D.speed;
        let dvx = (ai.tx - m.x) * 7;
        let dvy = (ai.ty - m.y) * 7;
        const dl = Math.hypot(dvx, dvy);
        if (ai.strikeT > 0) {
          // Swing through the puck at full speed along the aim line.
          dvx = ai.ux * cap;
          dvy = ai.uy * cap;
        } else if (dl > cap) {
          dvx *= cap / dl;
          dvy *= cap / dl;
        }
        const ix = (dvx - m.vx) / (cap * 0.25);
        const iy = (dvy - m.vy) / (cap * 0.25);
        if (ai.strikeT > 0 && ai.wantDash && m.cd <= 0 && Math.hypot(puck.x - m.x, puck.y - m.y) < 110) {
          ai.wantDash = false;
          dash(m, ai.tx - m.x, ai.ty - m.y);
        }
        driveMallet(m, ix, iy, dt, D.speed, D.speed);
      }

      /* ---------- Update ---------- */
      function keyInput(id) {
        const k = api.keys;
        const maps = vsCpu && id === 0 ? KEYS : [KEYS[id]];
        let ix = 0;
        let iy = 0;
        maps.forEach((m) => {
          ix += (k.has(m.right) ? 1 : 0) - (k.has(m.left) ? 1 : 0);
          iy += (k.has(m.down) ? 1 : 0) - (k.has(m.up) ? 1 : 0);
        });
        return { ix: U.clamp(ix, -1, 1), iy: U.clamp(iy, -1, 1) };
      }

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        flash = Math.max(0, flash - dt * 2.5);
        hitSfx -= dt;
        goT = Math.max(0, goT - dt);
        if (banner) banner.t += dt;
        floats.forEach((f) => { f.t += dt; });
        floats = floats.filter((f) => f.t < 1.6);
        const drag2 = Math.max(0, 1 - dt * 3);
        for (const q of parts) {
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= drag2;
          q.vy *= drag2;
          q.life -= dt;
        }
        parts = parts.filter((q) => q.life > 0);
        // Goal mouths ease toward their new width.
        for (let i = 0; i < 2; i++) {
          if (gHalf[i] < gTarget[i]) gHalf[i] = Math.min(gTarget[i], gHalf[i] + dt * 30);
        }

        if (state === 'count') {
          const prev = Math.ceil(timer);
          timer -= dt;
          if (timer <= 0) {
            state = 'play';
            goT = 0.7;
            api.sfx('blip');
          } else if (Math.ceil(timer) !== prev) {
            api.sfx('tick');
          }
          return;
        }
        if (state === 'goal') {
          timer -= dt;
          if (timer <= 0) {
            if (Math.max(score[0], score[1]) >= WIN) matchOver();
            else startCount();
          }
          return;
        }
        if (!live()) return;

        const m1 = mallets[0];
        const m2 = mallets[1];
        const k1 = keyInput(0);
        if (vsCpu && drag && !k1.ix && !k1.iy) {
          // Steer toward the pointer with the same speed limit as the keys.
          let dvx = (drag.x - m1.x) * 9;
          let dvy = (drag.y - m1.y) * 9;
          const dl = Math.hypot(dvx, dvy);
          if (dl > MAX_MS) {
            dvx *= MAX_MS / dl;
            dvy *= MAX_MS / dl;
          }
          driveMallet(m1, (dvx - m1.vx) / (MAX_MS * 0.2), (dvy - m1.vy) / (MAX_MS * 0.2), dt, 1, 1.4);
        } else {
          driveMallet(m1, k1.ix, k1.iy, dt, 1, 1);
        }
        if (vsCpu) cpuDrive(m2, dt);
        else {
          const k2 = keyInput(1);
          driveMallet(m2, k2.ix, k2.iy, dt, 1, 1);
        }
        physics(dt);
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

      function drawGoal(side) {
        const g = gHalf[side];
        const wx = side === 0 ? L : RT;
        const s = side === 0 ? -1 : 1; // direction into the pocket
        const col = side === 0 ? C.p1 : C.p2;
        const growing = gHalf[side] < gTarget[side];
        // Crease.
        ctx.strokeStyle = U.alpha(col, 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(wx, CY, g + 34, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.stroke();
        // Pocket.
        ctx.fillStyle = C.ink;
        ctx.fillRect(wx - 5, CY - g, 10, g * 2);
        ctx.fillStyle = U.alpha(col, 0.22);
        ctx.fillRect(s < 0 ? wx - POCKET : wx, CY - g, POCKET, g * 2);
        ctx.strokeStyle = U.alpha(col, 0.25);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = CY - g + 10; y < CY + g; y += 12) {
          ctx.moveTo(wx, y);
          ctx.lineTo(wx + s * POCKET, y);
        }
        ctx.stroke();
        // Mouth line and posts in the owner's color.
        ctx.strokeStyle = growing && Math.sin(clock * 30) > 0 ? C.text : col;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(wx, CY - g);
        ctx.lineTo(wx, CY + g);
        ctx.stroke();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(wx, CY - g, POST + 1, 0, Math.PI * 2);
        ctx.arc(wx, CY + g, POST + 1, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawTable() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(-20, -20, W + 40, H + 40);
        ctx.fillStyle = U.alpha(C.panel, 0.7);
        U.roundRect(ctx, L, T, RT - L, B - T, CR);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.p1, 0.04);
        ctx.fillRect(L + CR, T, W / 2 - L - CR, B - T);
        ctx.fillStyle = U.alpha(C.p2, 0.04);
        ctx.fillRect(W / 2, T, RT - W / 2 - CR, B - T);
        // Air holes.
        ctx.fillStyle = U.alpha(C.line, 0.5);
        for (let x = L + 30; x < RT - 20; x += 30) {
          for (let y = T + 30; y < B - 20; y += 30) ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(W / 2, T);
        ctx.lineTo(W / 2, B);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, CY, 60, 0, Math.PI * 2);
        ctx.stroke();
        // Big faint scores in each half.
        ctx.save();
        ctx.font = BIG;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = 0.08;
        ctx.fillStyle = C.p1;
        ctx.fillText(String(score[0]), W / 4 + 10, CY);
        ctx.fillStyle = C.p2;
        ctx.fillText(String(score[1]), (W * 3) / 4 - 10, CY);
        ctx.restore();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 6;
        U.roundRect(ctx, L, T, RT - L, B - T, CR);
        ctx.stroke();
        drawGoal(0);
        drawGoal(1);
      }

      function drawHud() {
        const n = names();
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.p1;
        ctx.fillText(n[0] + ' ' + score[0], L, T / 2);
        ctx.fillText((vsCpu ? 'Your' : 'Coral') + ' goal ' + Math.round((gHalf[0] / GOAL_BASE) * 100) + '%', L, H - T / 2);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.p2;
        ctx.fillText(score[1] + ' ' + n[1], RT, T / 2);
        ctx.fillText((vsCpu ? 'Computer' : 'Cyan') + ' goal ' + Math.round((gHalf[1] / GOAL_BASE) * 100) + '%', RT, H - T / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = C.muted;
        ctx.fillText('first to ' + WIN, W / 2, T / 2);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawTable();
        // Puck trail and puck.
        const tr = puck.trail;
        const sp = Math.hypot(puck.vx, puck.vy);
        if (sp > 250) {
          for (let i = 0; i < tr.length; i += 2) {
            ctx.fillStyle = U.alpha(C.mint, (i / tr.length) * 0.25);
            ctx.beginPath();
            ctx.arc(tr[i], tr[i + 1], PR * (0.4 + (i / tr.length) * 0.6), 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (state !== 'goal' || Math.sin(clock * 20) > 0) drawPuck(ctx, puck.x, puck.y);
        mallets.forEach((m) => {
          for (let i = 0; i < m.trail.length - 2; i += 2) {
            ctx.fillStyle = U.alpha(m.color, 0.15);
            ctx.beginPath();
            ctx.arc(m.trail[i], m.trail[i + 1], MR, 0, Math.PI * 2);
            ctx.fill();
          }
          drawMallet(ctx, m.x, m.y, m.color);
          // Dash ring: fills while recharging, glows when ready.
          const ready = m.cd <= 0;
          ctx.strokeStyle = ready ? U.alpha(C.text, 0.45 + 0.25 * Math.sin(clock * 5)) : U.alpha(m.color, 0.8);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(m.x, m.y, MR + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - m.cd / DASH_CD));
          ctx.stroke();
        });
        if (drag && vsCpu && live()) {
          ctx.strokeStyle = U.alpha(C.p1, 0.5);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(U.clamp(drag.x, L, W / 2), U.clamp(drag.y, T, B), 8, 0, Math.PI * 2);
          ctx.stroke();
        }
        for (const q of parts) {
          ctx.globalAlpha = Math.max(0, q.life / q.max);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        floats.forEach((f) => {
          const a = Math.min(1, (1.6 - f.t) * 2);
          ctx.fillStyle = U.alpha(C.ink, 0.7 * a);
          U.roundRect(ctx, f.x - 82, f.y - 16 - f.t * 20, 164, 32, 16);
          ctx.fill();
          ctx.fillStyle = U.alpha(f.color, a);
          ctx.fillText(f.text, f.x, f.y - f.t * 20);
        });
        ctx.restore();
        drawHud();

        if (state === 'count') {
          const f = timer - Math.floor(timer);
          bigText(String(Math.ceil(timer)), W / 2, CY - 110, C.text, 1 + f * 0.5, Math.min(1, 0.3 + f));
        } else if (goT > 0) {
          bigText('Go!', W / 2, CY - 110, C.mint, 1 + (0.7 - goT) * 0.6, Math.min(1, goT * 2));
        } else if (state === 'goal' && banner) {
          const a = Math.min(1, banner.t * 6);
          bigText(banner.text, W / 2, CY - 110, banner.color, 0.8 + a * 0.4, a);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.22);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (e.repeat || !live()) return;
        if (e.code === 'Space' || (e.code === 'Enter' && vsCpu)) {
          const k = keyInput(0);
          dash(mallets[0], k.ix, k.iy);
        } else if (e.code === 'Enter') {
          const k = keyInput(1);
          dash(mallets[1], k.ix, k.iy);
        }
      });
      api.on(canvas, 'pointerdown', (e) => {
        if (vsCpu && (state === 'play' || state === 'count')) drag = api.toCanvas(e, canvas);
      });
      api.on(window, 'pointermove', (e) => {
        if (drag) drag = api.toCanvas(e, canvas);
      });
      api.on(window, 'pointerup', () => { drag = null; });
      api.on(window, 'pointercancel', () => { drag = null; });

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
