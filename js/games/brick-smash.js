/* Brick Smash — break every brick. The ball takes the color of the last brick it hits,
   and bricks of that color shatter in one hit. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 800;
  const H = 600;
  const TOP = 40; // HUD strip; the playfield starts below it
  const COLS = 12;
  const BW = 60;
  const BH = 24;
  const GAP = 4;
  const BX0 = (W - (COLS * BW + (COLS - 1) * GAP)) / 2;
  const BY0 = 72;
  const PADDLE_Y = 556;
  const PADDLE_H = 14;
  const R = 7;
  const MAX_BALLS = 8;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const PALETTE = [C.p1, C.p2, C.gold, C.mint];
  const NAMES = ['coral', 'cyan', 'gold', 'mint'];

  /* Layout legend: c b g m = coral/cyan/gold/mint with 1 HP, C B G M = 2 HP,
     1 2 3 4 = coral/cyan/gold/mint with 3 HP, # = steel (unbreakable), . = empty. */
  const CODES = {
    c: [0, 1], b: [1, 1], g: [2, 1], m: [3, 1],
    C: [0, 2], B: [1, 2], G: [2, 2], M: [3, 2],
    1: [0, 3], 2: [1, 3], 3: [2, 3], 4: [3, 3],
    '#': [-1, 0]
  };
  const LAYOUTS = [
    [ // Bands: each thin row recolors the ball, so the 2 HP row above it shatters.
      'cccccccccccc',
      'CCCCCCCCCCCC',
      'bbbbbbbbbbbb',
      'gggggggggggg',
      'mmmmmmmmmmmm'
    ],
    [ // Quadrants: crack a soft centre, then its tough rim breaks in one hit.
      'CCCCC..BBBBB',
      'Ccccc..bbbbB',
      'Ccccc..bbbbB',
      '............',
      'Mmmmm..ggggG',
      'Mmmmm..ggggG',
      'MMMMM..GGGGG'
    ],
    [ // Diamond: gold shell, a 3 HP cyan ring and a cyan core.
      '#....gg....#',
      '....gGGg....',
      '...gG22Gg...',
      '..gG2bb2Gg..',
      '...gG22Gg...',
      '....gGGg....',
      '#....gg....#'
    ],
    [ // Shelf: a steel shelf with gaps hides the tough rows on top.
      'GGGGBBBBGGGG',
      'ggggbbbbgggg',
      '............',
      '###..##..###',
      '............',
      'mmMMccCCmmMM',
      'mmMMccCCmmMM'
    ],
    [ // Rainbow arch: work inward one color band at a time.
      '....cccc....',
      '..ccCCCCcc..',
      '.cbbBBBBbbc.',
      'cbggGGGGggbc',
      'bgm#....#mgb',
      'gm#......#mg',
      'm#........#m'
    ],
    [ // Fortress: steel-walled vaults with 3 HP hearts.
      '............',
      '#MMMM##GGGG#',
      '#m44m##g33g#',
      '#mmmm##gggg#',
      '............',
      'CCcc1111bbBB',
      'cccc....bbbb'
    ]
  ];
  const POWERS = {
    wide: { label: 'Wide', color: C.mint, weight: 18, hint: 'Wide paddle for 12 seconds.' },
    multi: { label: 'Multi', color: C.p2, weight: 16, hint: 'Multi-ball: each ball keeps its own color and chain.' },
    slow: { label: 'Slow', color: C.violet, weight: 13, hint: 'Slow ball for 10 seconds.' },
    laser: { label: 'Laser', color: C.p1, weight: 12, hint: 'Laser paddle for 8 seconds. Lasers chip 1 HP and never recolor the ball.' },
    sticky: { label: 'Sticky', color: C.gold, weight: 13, hint: 'Sticky paddle: catch the ball, aim, then Space or tap to release.' },
    life: { label: '+1', color: C.text, weight: 5, hint: 'Extra life.' },
    shrink: { label: 'Shrink', color: C.muted, weight: 15, hint: 'Shrunk paddle for 10 seconds. Avoid the grey capsules.' }
  };
  const POWER_TOTAL = Object.keys(POWERS).reduce((s, k) => s + POWERS[k].weight, 0);

  function layoutFor(level) {
    if (level <= LAYOUTS.length) return LAYOUTS[level - 1];
    const n = level - LAYOUTS.length;
    const rows = Math.min(9, 5 + Math.floor(n / 2));
    const hard = Math.min(0.55, 0.15 + n * 0.04);
    const steel = Math.min(0.08, 0.02 + n * 0.006);
    const out = [];
    let color = U.randInt(0, 3);
    for (let r = 0; r < rows; r++) {
      let half = '';
      for (let c = 0; c < COLS / 2; c++) {
        if (Math.random() < 0.3) color = U.randInt(0, 3); // colors come in runs, so chains form
        const roll = Math.random();
        if (roll < 0.08) half += '.';
        else if (roll < 0.08 + steel && r < rows - 1) half += '#';
        else {
          const hp = Math.random() < hard ? (Math.random() < 0.4 ? 3 : 2) : 1;
          half += (hp === 3 ? '1234' : hp === 2 ? 'CBGM' : 'cbgm')[color];
        }
      }
      out.push(half + half.split('').reverse().join(''));
    }
    return out;
  }

  function drawBrick(ctx, x, y, w, h, color, hp, max, glow, flash) {
    if (color < 0) {
      ctx.fillStyle = C.line;
      U.roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.text, 0.18);
      ctx.fillRect(x + 4, y + 2, w - 8, 3);
      ctx.fillStyle = C.muted;
      for (const rx of [x + 7, x + w - 7]) {
        ctx.beginPath();
        ctx.arc(rx, y + h / 2, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = PALETTE[color];
      U.roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.text, 0.3);
      ctx.fillRect(x + 4, y + 2, w - 8, 3);
      ctx.fillStyle = U.alpha(C.ink, 0.22);
      ctx.fillRect(x + 2, y + h - 5, w - 4, 3);
      if (max > 1) {
        ctx.fillStyle = U.alpha(C.ink, 0.7);
        for (let k = 0; k < hp; k++) {
          ctx.beginPath();
          ctx.arc(x + w / 2 + (k - (hp - 1) / 2) * 10, y + h / 2 + 1, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      if (hp < max) {
        ctx.strokeStyle = U.alpha(C.ink, 0.55);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x + w * 0.15, y + 3);
        ctx.lineTo(x + w * 0.28, y + h * 0.55);
        ctx.lineTo(x + w * 0.22, y + h - 3);
        ctx.moveTo(x + w * 0.85, y + h - 3);
        ctx.lineTo(x + w * 0.72, y + h * 0.4);
        ctx.stroke();
      }
    }
    if (glow > 0) {
      ctx.strokeStyle = U.alpha(C.text, glow);
      ctx.lineWidth = 2;
      U.roundRect(ctx, x - 1, y - 1, w + 2, h + 2, 6);
      ctx.stroke();
    }
    if (flash > 0) {
      ctx.fillStyle = U.alpha(C.text, flash * 0.7);
      U.roundRect(ctx, x, y, w, h, 5);
      ctx.fill();
    }
  }

  function drawBall(ctx, x, y, color, t) {
    const col = color < 0 ? C.text : PALETTE[color];
    ctx.shadowColor = col;
    ctx.shadowBlur = color < 0 ? 6 : 16;
    if (color >= 0) {
      ctx.strokeStyle = U.alpha(col, 0.75);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, R + 5 + Math.sin(t * 9) * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x, y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = U.alpha(C.text, 0.8);
    ctx.beginPath();
    ctx.arc(x - 2.2, y - 2.2, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Circle (ball) vs rect. Pushes the ball out and reflects it about the contact normal.
     Returns true only for real contacts (ball moving into the rect). */
  function collideRect(ball, rx, ry, rw, rh) {
    const px = U.clamp(ball.x, rx, rx + rw);
    const py = U.clamp(ball.y, ry, ry + rh);
    let nx = ball.x - px;
    let ny = ball.y - py;
    const d2 = nx * nx + ny * ny;
    if (d2 > R * R) return false;
    if (d2 === 0) {
      // Centre inside the rect: leave by the shallowest side.
      const l = ball.x - rx;
      const r = rx + rw - ball.x;
      const u = ball.y - ry;
      const d = ry + rh - ball.y;
      const m = Math.min(l, r, u, d);
      nx = m === l ? -1 : m === r ? 1 : 0;
      ny = nx ? 0 : m === u ? -1 : 1;
      ball.x += nx * (m + R);
      ball.y += ny * (m + R);
    } else {
      const d = Math.sqrt(d2);
      nx /= d;
      ny /= d;
      if (ball.dx * nx + ball.dy * ny >= 0) return false;
      ball.x = px + nx * R;
      ball.y = py + ny * R;
    }
    const dot = ball.dx * nx + ball.dy * ny;
    if (dot < 0) {
      ball.dx -= 2 * dot * nx;
      ball.dy -= 2 * dot * ny;
    }
    return true;
  }

  /* Keeps the ball from skimming almost horizontally forever. */
  function fixAngle(ball) {
    const len = Math.hypot(ball.dx, ball.dy) || 1;
    ball.dx /= len;
    ball.dy /= len;
    if (Math.abs(ball.dy) < 0.28) {
      ball.dy = ball.dy < 0 ? -0.28 : 0.28;
      ball.dx = (ball.dx < 0 ? -1 : 1) * Math.sqrt(1 - ball.dy * ball.dy);
    }
  }

  Arcade.register({
    id: 'brick-smash',
    title: 'Brick Smash',
    mode: 'solo',
    players: '1P',
    color: C.p1,
    tagline: 'Bounce the ball, break every brick, catch the power-ups.',
    hook: 'The ball takes the color of the last brick it hits, and same-color bricks shatter in one hit.',
    tags: ['arcade', 'classic', 'paddle', 'keyboard', 'mouse', 'touch'],
    howTo: 'Move the paddle to keep the ball in play and break every colored brick; steel never breaks. ' +
      'The ball glows with the color of the last brick it touched. Hitting a brick of that same color shatters it ' +
      'at once, however tough, and grows a chain multiplier (×2, ×3 …). A different color only chips 1 HP and recolors ' +
      'the ball, resetting the chain. Catch falling capsules for power-ups, but dodge the grey Shrink. You have 3 lives.',
    controls: [
      { keys: ['←', '→'], label: 'Move paddle' },
      { keys: ['A', 'D'], label: 'Move paddle' },
      { keys: ['Mouse', 'Drag'], label: 'Move paddle' },
      { keys: ['Space', 'Click'], label: 'Launch / release a caught ball' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const rows = ['cccbbggmmm', 'CCcbbGGmMM', 'ccbbbggmmc', 'bbccgggmmb', '..cc..gg..'];
      const cols = 10;
      const gap = 3;
      const bw = (w - 12 - gap * (cols - 1)) / cols;
      const bh = h * 0.07;
      const pulse = 0.35 + Math.sin(t * 5) * 0.25;
      const cleared = [[2, 2], [3, 2], [3, 3]];
      rows.forEach((row, r) => {
        for (let c = 0; c < cols; c++) {
          const code = CODES[row[c]];
          if (!code || cleared.some((p) => p[0] === c && p[1] === r)) continue;
          drawBrick(ctx, 6 + c * (bw + gap), h * 0.1 + r * (bh + gap), bw, bh, code[0], code[1], code[1],
            code[0] === 0 ? pulse : 0, 0);
        }
      });
      // Shards from the coral chain.
      for (let k = 0; k < 14; k++) {
        const a = k * 2.4 + t * 0.6;
        const d = 10 + ((k * 13 + t * 40) % 34);
        ctx.fillStyle = U.alpha(C.p1, 1 - d / 46);
        ctx.fillRect(6 + 3 * (bw + gap) + Math.cos(a) * d, h * 0.1 + 2.6 * (bh + gap) + Math.sin(a) * d, 4, 4);
      }
      const bx = w * 0.42 + Math.sin(t * 1.4) * w * 0.18;
      const by = h * 0.62 + Math.cos(t * 1.9) * h * 0.08;
      for (let k = 1; k <= 5; k++) {
        ctx.fillStyle = U.alpha(C.p1, 0.3 - k * 0.05);
        ctx.beginPath();
        ctx.arc(bx - Math.cos(t * 1.4) * k * 7, by + Math.sin(t * 1.9) * k * 4 + k * 3, R - k * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBall(ctx, bx, by, 0, t);
      ctx.font = FONT_HUD;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.p1;
      ctx.fillText('×3', bx + 16, by - 14);
      const px = w * 0.42 + Math.sin(t * 1.4 - 0.5) * w * 0.14;
      ctx.fillStyle = C.text;
      ctx.shadowColor = C.p1;
      ctx.shadowBlur = 10;
      U.roundRect(ctx, px - 36, h - 18, 72, 9, 4.5);
      ctx.fill();
      ctx.shadowBlur = 0;
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'clear' | 'over'
      let level, lives, score, bricks, bricksLeft, balls, capsules, bolts, particles, floaters, banner;
      let paddle, pointerX, usePointer, sizeMode, sizeT, slowT, slowK, laserT, laserCd, stickyT;
      let ramp, clearT, levelT, shake, flash, clock = 0;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      const told = {};
      const stars = [];
      for (let k = 0; k < 70; k++) {
        stars.push({ x: Math.random() * W, y: Math.random() * H, z: U.pick([0.25, 0.5, 1]) });
      }

      function setHint(text, secs) {
        hint = text;
        hintT = secs;
      }

      function tellOnce(key, text, secs) {
        if (told[key]) return;
        told[key] = true;
        setHint(text, secs || 6);
      }

      function loadLevel() {
        for (let tries = 0; tries < 10; tries++) {
          bricks = [];
          layoutFor(level).forEach((row, r) => {
            for (let c = 0; c < COLS; c++) {
              const code = CODES[row[c]];
              if (!code) continue;
              bricks.push({
                x: BX0 + c * (BW + GAP), y: BY0 + r * (BH + GAP), color: code[0], hp: code[1], max: code[1],
                flash: 0, dead: false, delay: r * 0.06 + Math.abs(c - 5.5) * 0.03
              });
            }
          });
          bricksLeft = bricks.filter((b) => b.color >= 0).length;
          if (bricksLeft > 0) break;
        }
        levelT = 0;
        ramp = 0;
        capsules = [];
        bolts = [];
        newBall();
      }

      function newBall() {
        balls = [{ x: paddle.x, y: PADDLE_Y - R, dx: 0, dy: -1, color: -1, chain: 0, stuck: true, off: 0, auto: false, stickT: 0, trail: [] }];
      }

      function startRun() {
        level = 1;
        lives = 3;
        score = 0;
        paddle = { x: W / 2, w: 104, vx: 0 };
        pointerX = W / 2;
        usePointer = false;
        sizeMode = null;
        sizeT = 0;
        slowT = 0;
        slowK = 1;
        laserT = 0;
        laserCd = 0;
        stickyT = 0;
        shake = 0;
        flash = null;
        banner = null;
        particles = [];
        floaters = [];
        loadLevel();
        state = 'play';
        api.setScore(0);
        setHint('Space, click or tap to launch. The ball takes the color of the last brick it hits.', 6);
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Brick Smash',
          text: 'Arrows, A/D or the mouse move the paddle; Space or click launches. Same-color hits shatter bricks.',
          buttons: [{ label: 'Start', primary: true, onClick: startRun }]
        });
      }

      function gameOver() {
        state = 'over';
        api.sfx('lose');
        const isBest = api.reportScore(score);
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Game over',
          text: 'You reached level ' + level + ' with ' + score + ' points.',
          buttons: [{ label: 'Play again', primary: true, onClick: startRun }]
        });
      }

      function addScore(n) {
        score += n;
        api.setScore(score);
      }

      function burst(x, y, n, color, speed) {
        for (let k = 0; k < n && particles.length < 400; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * (0.3 + Math.random() * 0.7);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.35, 0.8), size: U.rand(2, 5), color });
        }
      }

      function floater(x, y, text, color) {
        if (floaters.length > 30) floaters.shift();
        floaters.push({ x, y, text, color, t: 0 });
      }

      function speedNow() {
        return (Math.min(560, 340 + (level - 1) * 16) + ramp) * slowK;
      }

      function launch() {
        for (const b of balls) {
          if (!b.stuck) continue;
          b.stuck = false;
          const rel = U.clamp(b.off / (paddle.w / 2), -1, 1);
          const a = rel * 0.9 + (Math.abs(rel) < 0.05 ? U.rand(-0.25, 0.25) : 0);
          b.dx = Math.sin(a);
          b.dy = -Math.cos(a);
          api.sfx('flip');
        }
      }

      function dropPower(x, y) {
        if (capsules.length >= 6) return;
        let roll = Math.random() * POWER_TOTAL;
        for (const type in POWERS) {
          roll -= POWERS[type].weight;
          if (roll <= 0) {
            capsules.push({ x, y, type });
            return;
          }
        }
      }

      function applyPower(type) {
        const p = POWERS[type];
        floater(paddle.x, PADDLE_Y - 24, p.label, p.color);
        api.sfx(type === 'shrink' ? 'hit' : 'power');
        if (type === 'wide') { sizeMode = 'wide'; sizeT = 12; }
        else if (type === 'shrink') { sizeMode = 'small'; sizeT = 10; }
        else if (type === 'slow') slowT = 10;
        else if (type === 'laser') laserT = 8;
        else if (type === 'sticky') stickyT = 15;
        else if (type === 'life') lives = Math.min(5, lives + 1);
        else if (type === 'multi') {
          const src = balls.find((b) => !b.stuck) || balls[0];
          if (!src) return;
          const base = src.stuck ? -Math.PI / 2 : Math.atan2(src.dy, src.dx);
          for (const da of [-0.45, 0.45]) {
            if (balls.length >= MAX_BALLS) break;
            const nb = Object.assign({}, src, { stuck: false, auto: false, trail: [], dx: Math.cos(base + da), dy: Math.sin(base + da) });
            if (src.stuck) nb.y = PADDLE_Y - R - 2;
            fixAngle(nb);
            balls.push(nb);
          }
        }
        tellOnce('p-' + type, p.hint, 4);
      }

      function breakBrick(br, ball, mult) {
        br.dead = true;
        bricksLeft--;
        const cx = br.x + BW / 2;
        const cy = br.y + BH / 2;
        const pts = 10 * level * mult;
        addScore(pts);
        burst(cx, cy, mult > 1 ? 22 : 12, PALETTE[br.color], mult > 1 ? 300 : 200);
        floater(cx, cy, '+' + pts + (mult > 1 ? ' ×' + mult : ''), mult > 1 ? PALETTE[br.color] : C.text);
        shake = Math.min(10, shake + (mult > 1 ? 3 : 1.5));
        api.sfx(mult > 1 ? 'score' : 'blip');
        if (Math.random() < 0.12) dropPower(cx, cy);
        if (bricksLeft <= 0) levelClear();
      }

      function hitBrick(ball, br) {
        br.flash = 1;
        if (br.color < 0) {
          api.sfx('tick');
          return;
        }
        if (ball.color === br.color) {
          ball.chain++;
          breakBrick(br, ball, ball.chain + 1);
          if (ball.chain === 1) {
            tellOnce('chain', 'Color chain ×2! Keep hitting ' + NAMES[br.color] +
              ' to multiply points. Any other color resets the chain.', 6);
          }
          return;
        }
        ball.color = br.color;
        ball.chain = 0;
        tellOnce('color', 'Your ball is now ' + NAMES[br.color] + '. ' + NAMES[br.color][0].toUpperCase() +
          NAMES[br.color].slice(1) + ' bricks shatter in one hit, however tough they are.', 7);
        br.hp--;
        if (br.hp <= 0) breakBrick(br, ball, 1);
        else {
          addScore(2 * level);
          burst(ball.x, ball.y, 5, PALETTE[br.color], 120);
          api.sfx('hit');
        }
      }

      function levelClear() {
        state = 'clear';
        clearT = 2;
        const bonus = 200 * level;
        addScore(bonus);
        banner = { text: 'Level ' + level + ' cleared', sub: '+' + bonus + ' bonus', color: C.mint, t: 0, life: 2 };
        for (const b of balls) burst(b.x, b.y, 20, C.mint, 260);
        balls = [];
        capsules = [];
        bolts = [];
        api.sfx('win');
      }

      function loseLife() {
        lives--;
        shake = 14;
        flash = { color: C.p1, a: 0.5 };
        sizeMode = null;
        sizeT = 0;
        slowT = 0;
        laserT = 0;
        stickyT = 0;
        capsules = [];
        bolts = [];
        if (lives <= 0) {
          gameOver();
          return;
        }
        api.sfx('lose');
        newBall();
        setHint('Ball lost. ' + lives + (lives === 1 ? ' life' : ' lives') + ' left. Space or tap to launch.', 4);
      }

      /* ---------- Input ---------- */

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter') launch();
      });

      api.on(canvas, 'pointermove', (e) => {
        pointerX = api.toCanvas(e, canvas).x;
        usePointer = true;
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        pointerX = api.toCanvas(e, canvas).x;
        usePointer = true;
        launch();
      });

      /* ---------- Update ---------- */

      function stepBall(b, dist) {
        const steps = Math.max(1, Math.ceil(dist / 3));
        const d = dist / steps;
        for (let s = 0; s < steps; s++) {
          b.x += b.dx * d;
          b.y += b.dy * d;
          if (b.x < R) { b.x = R; b.dx = Math.abs(b.dx); api.sfx('tick'); }
          else if (b.x > W - R) { b.x = W - R; b.dx = -Math.abs(b.dx); api.sfx('tick'); }
          if (b.y < TOP + R) { b.y = TOP + R; b.dy = Math.abs(b.dy); api.sfx('tick'); }
          // Paddle: angle depends on where it lands.
          const half = paddle.w / 2;
          if (b.dy > 0 && b.y + R >= PADDLE_Y && b.y <= PADDLE_Y + PADDLE_H / 2 &&
            b.x >= paddle.x - half - R && b.x <= paddle.x + half + R) {
            const rel = U.clamp((b.x - paddle.x) / half, -1, 1);
            const a = rel * 1.05;
            b.dx = Math.sin(a);
            b.dy = -Math.cos(a);
            b.y = PADDLE_Y - R;
            api.sfx('blip');
            if (stickyT > 0) {
              b.stuck = true;
              b.auto = true;
              b.stickT = 2.5;
              b.off = U.clamp(b.x - paddle.x, -half, half);
              return;
            }
          }
          let hit = false;
          for (const br of bricks) {
            if (br.dead || b.x + R < br.x || b.x - R > br.x + BW || b.y + R < br.y || b.y - R > br.y + BH) continue;
            if (collideRect(b, br.x, br.y, BW, BH)) {
              hit = true;
              hitBrick(b, br);
              if (state !== 'play') return;
            }
          }
          if (hit) fixAngle(b);
          if (b.y - R > H) return;
        }
      }

      function update(dt) {
        clock += dt;
        if (hintT > 0) hintT -= dt;
        shake = Math.max(0, shake - dt * 30);
        if (flash) {
          flash.a -= dt * 1.4;
          if (flash.a <= 0) flash = null;
        }
        for (const s of stars) {
          s.y += s.z * 14 * dt;
          if (s.y > H) { s.y = 0; s.x = Math.random() * W; }
        }
        for (const p of particles) {
          p.vy += 500 * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
        for (const f of floaters) f.t += dt;
        floaters = floaters.filter((f) => f.t < 1);
        if (banner) {
          banner.t += dt;
          if (banner.t > banner.life) banner = null;
        }
        if (state === 'clear') {
          clearT -= dt;
          if (clearT <= 0) {
            level++;
            loadLevel();
            state = 'play';
            setHint('Level ' + level + '. Space or tap to launch.', 3);
          }
        }
        if (state !== 'play' && state !== 'clear') return;
        levelT += dt;
        for (const br of bricks) br.flash = Math.max(0, br.flash - dt * 5);

        // Timers.
        if (sizeT > 0 && (sizeT -= dt) <= 0) sizeMode = null;
        if (slowT > 0) slowT -= dt;
        if (laserT > 0) laserT -= dt;
        if (stickyT > 0) stickyT -= dt;
        slowK += ((slowT > 0 ? 0.68 : 1) - slowK) * Math.min(1, dt * 3);
        const targetW = sizeMode === 'wide' ? 160 : sizeMode === 'small' ? 64 : 104;
        paddle.w += (targetW - paddle.w) * Math.min(1, dt * 8);

        // Paddle.
        const left = api.keys.has('ArrowLeft') || api.keys.has('KeyA');
        const right = api.keys.has('ArrowRight') || api.keys.has('KeyD');
        if (left || right) {
          usePointer = false;
          const want = (right ? 1 : 0) - (left ? 1 : 0);
          paddle.vx += (want * 780 - paddle.vx) * Math.min(1, dt * 14);
          paddle.x += paddle.vx * dt;
        } else if (usePointer) {
          const dx = pointerX - paddle.x;
          paddle.x += U.clamp(dx, -2200 * dt, 2200 * dt);
        } else {
          paddle.vx *= Math.max(0, 1 - dt * 12);
          paddle.x += paddle.vx * dt;
        }
        const clamped = U.clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);
        if (clamped !== paddle.x) paddle.vx = 0;
        paddle.x = clamped;

        if (state !== 'play') return;

        // Lasers.
        if (laserT > 0) {
          laserCd -= dt;
          if (laserCd <= 0 && bolts.length < 30) {
            laserCd = 0.32;
            bolts.push({ x: paddle.x - paddle.w / 2 + 6, y: PADDLE_Y - 4 });
            bolts.push({ x: paddle.x + paddle.w / 2 - 6, y: PADDLE_Y - 4 });
            api.sfx('shoot');
          }
        }
        for (const bolt of bolts) {
          for (let s = 0; s < 3 && !bolt.dead; s++) {
            bolt.y -= 300 * dt;
            if (bolt.y < TOP) bolt.dead = true;
            for (const br of bricks) {
              if (br.dead || bolt.x < br.x || bolt.x > br.x + BW || bolt.y < br.y || bolt.y > br.y + BH) continue;
              bolt.dead = true;
              br.flash = 1;
              burst(bolt.x, br.y + BH, 4, C.p1, 100);
              if (br.color >= 0 && --br.hp <= 0) breakBrick(br, null, 1);
              else api.sfx('tick');
              break;
            }
            if (state !== 'play') return;
          }
        }
        bolts = bolts.filter((bt) => !bt.dead);

        // Balls.
        const inFlight = balls.some((b) => !b.stuck);
        if (inFlight) ramp = Math.min(90, ramp + dt * 3);
        const sp = speedNow();
        for (const b of balls) {
          if (b.stuck) {
            b.off = U.clamp(b.off, -paddle.w / 2, paddle.w / 2);
            b.x = paddle.x + b.off;
            b.y = PADDLE_Y - R;
            if (b.auto && (b.stickT -= dt) <= 0) launch();
            continue;
          }
          stepBall(b, sp * dt);
          if (state !== 'play') return;
          b.trail.push(b.x, b.y);
          if (b.trail.length > 12) b.trail.splice(0, 2);
        }
        balls = balls.filter((b) => b.y - R <= H);
        if (!balls.length) {
          loseLife();
          return;
        }

        // Capsules.
        for (const cap of capsules) {
          cap.y += 150 * dt;
          if (cap.y + 10 >= PADDLE_Y && cap.y - 10 <= PADDLE_Y + PADDLE_H &&
            Math.abs(cap.x - paddle.x) <= paddle.w / 2 + 30) {
            cap.dead = true;
            applyPower(cap.type);
          } else if (cap.y > H + 20) cap.dead = true;
        }
        capsules = capsules.filter((cap) => !cap.dead);
        bricks = bricks.filter((br) => !br.dead);

        // Status line.
        const lead = balls[0];
        const status = hintT > 0 ? hint
          : 'Level ' + level + ' · Lives ' + lives + ' · Ball ' + (lead.color < 0 ? 'neutral' : NAMES[lead.color]) +
            (lead.chain > 0 ? ' · Chain ×' + (lead.chain + 1) : '');
        if (status !== lastStatus) {
          api.setStatus(status);
          lastStatus = status;
        }
      }

      /* ---------- Draw ---------- */

      function drawHud() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, TOP);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, TOP - 1, W, 1);
        ctx.font = FONT_HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('Lives', 14, TOP / 2);
        for (let k = 0; k < lives; k++) {
          ctx.fillStyle = C.p1;
          ctx.beginPath();
          ctx.arc(78 + k * 18, TOP / 2, 6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.textAlign = 'center';
        ctx.fillStyle = C.text;
        ctx.fillText('Level ' + level, W / 2, TOP / 2);
        // Active power-ups with remaining time.
        const active = [];
        if (sizeMode) active.push([sizeMode === 'wide' ? 'Wide' : 'Shrink', sizeT, sizeMode === 'wide' ? C.mint : C.muted]);
        if (slowT > 0) active.push(['Slow', slowT, C.violet]);
        if (laserT > 0) active.push(['Laser', laserT, C.p1]);
        if (stickyT > 0) active.push(['Sticky', stickyT, C.gold]);
        ctx.textAlign = 'right';
        let x = W - 14;
        for (const a of active) {
          ctx.fillStyle = a[2];
          ctx.fillText(a[0] + ' ' + Math.ceil(a[1]), x, TOP / 2);
          x -= (a[0].length + 4) * 9 + 8;
        }
      }

      function drawPaddle() {
        const x = paddle.x - paddle.w / 2;
        const glow = balls.length && balls[0].color >= 0 ? PALETTE[balls[0].color] : C.text;
        ctx.shadowColor = glow;
        ctx.shadowBlur = 12;
        ctx.fillStyle = C.text;
        U.roundRect(ctx, x, PADDLE_Y, paddle.w, PADDLE_H, PADDLE_H / 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = U.alpha(glow, 0.8);
        U.roundRect(ctx, x + 6, PADDLE_Y + PADDLE_H - 5, paddle.w - 12, 3, 1.5);
        ctx.fill();
        if (laserT > 0) {
          ctx.fillStyle = C.p1;
          ctx.fillRect(x + 3, PADDLE_Y - 6, 6, 8);
          ctx.fillRect(x + paddle.w - 9, PADDLE_Y - 6, 6, 8);
        }
        if (stickyT > 0) {
          ctx.fillStyle = C.gold;
          for (let k = 0; k < 5; k++) {
            ctx.beginPath();
            ctx.arc(x + paddle.w * (0.15 + k * 0.175), PADDLE_Y + 1, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        for (const s of stars) {
          ctx.fillStyle = U.alpha(C.muted, s.z * 0.5);
          ctx.fillRect(s.x, s.y, s.z * 2.4, s.z * 2.4);
        }
        drawHud();
        if (state === 'menu' && !bricks) return;
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);

        // Bricks; same-color bricks pulse so the next chain target is obvious.
        const colors = new Set(balls.map((b) => b.color));
        const pulse = 0.35 + Math.sin(clock * 6) * 0.25;
        for (const br of bricks) {
          const k = U.clamp((levelT - br.delay) / 0.3, 0, 1);
          if (k <= 0) continue;
          const y = br.y - (1 - k) * (1 - k) * 60;
          ctx.globalAlpha = k;
          drawBrick(ctx, br.x, y, BW, BH, br.color, br.hp, br.max, br.color >= 0 && colors.has(br.color) ? pulse : 0, br.flash);
        }
        ctx.globalAlpha = 1;

        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const cap of capsules) {
          const p = POWERS[cap.type];
          ctx.fillStyle = U.alpha(p.color, 0.25);
          U.roundRect(ctx, cap.x - 34, cap.y - 11, 68, 22, 11);
          ctx.fill();
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.fillStyle = p.color;
          ctx.fillText(p.label, cap.x, cap.y + 1);
        }

        ctx.fillStyle = C.p1;
        for (const bt of bolts) ctx.fillRect(bt.x - 1.5, bt.y - 10, 3, 12);

        if (state === 'play' || state === 'clear') drawPaddle();

        for (const b of balls) {
          const col = b.color < 0 ? C.text : PALETTE[b.color];
          for (let k = 0; k < b.trail.length; k += 2) {
            const a = (k + 2) / (b.trail.length + 2);
            ctx.fillStyle = U.alpha(col, a * 0.35);
            ctx.beginPath();
            ctx.arc(b.trail[k], b.trail[k + 1], R * a, 0, Math.PI * 2);
            ctx.fill();
          }
          drawBall(ctx, b.x, b.y, b.color, clock);
          if (b.chain > 0) {
            ctx.font = FONT_HUD;
            ctx.textAlign = 'left';
            ctx.fillStyle = col;
            ctx.fillText('×' + (b.chain + 1), b.x + 14, b.y - 14);
          }
        }

        for (const p of particles) {
          ctx.globalAlpha = Math.min(1, p.life * 2.5);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = FONT_HUD;
        ctx.textAlign = 'center';
        for (const f of floaters) {
          ctx.globalAlpha = 1 - f.t;
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y - f.t * 36);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        if (state === 'play' && balls.length === 1 && balls[0].stuck && !balls[0].auto) {
          ctx.font = FONT_HUD;
          ctx.textAlign = 'center';
          ctx.fillStyle = U.alpha(C.text, 0.6 + Math.sin(clock * 4) * 0.3);
          ctx.fillText('Space, click or tap to launch', W / 2, PADDLE_Y - 60);
        }

        if (banner) {
          const a = Math.min(1, banner.t * 5, (banner.life - banner.t) * 3);
          ctx.globalAlpha = Math.max(0, a);
          ctx.fillStyle = U.alpha(C.ink, 0.75);
          ctx.fillRect(0, H / 2 - 60, W, 120);
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.fillStyle = banner.color;
          ctx.shadowColor = banner.color;
          ctx.shadowBlur = 18;
          ctx.fillText(banner.text, W / 2, H / 2 - 10);
          ctx.shadowBlur = 0;
          ctx.font = FONT_HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(banner.sub, W / 2, H / 2 + 34);
          ctx.globalAlpha = 1;
        }
        if (flash) {
          ctx.fillStyle = U.alpha(flash.color, Math.max(0, flash.a) * 0.4);
          ctx.fillRect(0, 0, W, H);
        }
      }

      level = 1;
      lives = 3;
      bricks = null;
      balls = [];
      capsules = [];
      bolts = [];
      particles = [];
      floaters = [];
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
