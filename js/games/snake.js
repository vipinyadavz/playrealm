/* Snake — reference implementation of the PlayRealm game API (docs/GAME_API.md). */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 720;
  const H = 480;
  const CELL = 24;
  const COLS = W / CELL;
  const ROWS = H / CELL;
  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const KEYMAP = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right'
  };

  function drawSnakeBody(ctx, cells, size, head, tail) {
    cells.forEach((c, i) => {
      const t = cells.length > 1 ? i / (cells.length - 1) : 0;
      ctx.fillStyle = t < 0.5 ? head : tail;
      ctx.globalAlpha = 1 - t * 0.45;
      U.roundRect(ctx, c.x * size + 2, c.y * size + 2, size - 4, size - 4, size * 0.3);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function drawStone(ctx, x, y, size) {
    const px = x * size;
    const py = y * size;
    ctx.fillStyle = '#5A5488';
    U.roundRect(ctx, px + 1, py + 1, size - 2, size - 2, size * 0.18);
    ctx.fill();
    ctx.fillStyle = '#7A74AE';
    ctx.fillRect(px + 3, py + 3, size - 6, size * 0.22);
    ctx.strokeStyle = 'rgba(15,13,36,.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(px + size * 0.3, py + size * 0.35);
    ctx.lineTo(px + size * 0.5, py + size * 0.6);
    ctx.lineTo(px + size * 0.42, py + size * 0.85);
    ctx.stroke();
  }

  Arcade.register({
    id: 'snake',
    title: 'Snake',
    mode: 'solo',
    players: '1P',
    color: C.mint,
    tagline: 'Eat, grow longer, and never bite your own tail.',
    hook: 'Every 8 bites your tail breaks off and turns to stone, and bites score more.',
    tags: ['classic', 'arcade', 'keyboard', 'touch', 'molt', 'stone'],
    howTo: 'Steer the snake to the glowing food. Each bite makes you longer and a little faster. ' +
      'On every 8th bite you molt: the back half of your body breaks off and becomes stone walls, and every bite ' +
      'after that is worth one more point. Your tail flashes the bite before it happens, so park it somewhere harmless. ' +
      'Gold food is worth 5× your multiplier but vanishes fast. Hitting a wall, stone or your own body ends the run. ' +
      'Pick Wrap mode to pass through the edges instead.',
    controls: [
      { keys: ['↑', '↓', '←', '→'], label: 'Steer' },
      { keys: ['W', 'A', 'S', 'D'], label: 'Steer' },
      { keys: ['Swipe'], label: 'Steer on a touch screen' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const size = 20;
      ctx.fillStyle = U.alpha(C.line, 0.6);
      for (let x = size / 2; x < w; x += size) {
        for (let y = size / 2; y < h; y += size) ctx.fillRect(x - 1, y - 1, 2, 2);
      }
      // Stone left behind by earlier molts.
      [[2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [11, 7], [12, 7], [13, 7], [13, 6]].forEach(([x, y]) => drawStone(ctx, x, y, size));
      // A loop path around the stones; the snake slides along it.
      const path = [];
      for (let x = 6; x <= 14; x++) path.push({ x, y: 3 });
      for (let y = 4; y <= 5; y++) path.push({ x: 14, y });
      for (let x = 13; x >= 6; x--) path.push({ x, y: 5 });
      path.push({ x: 6, y: 4 });
      const len = 9;
      const offset = Math.floor(t * 7);
      const cells = [];
      for (let i = 0; i < len; i++) cells.push(path[(offset - i + path.length * 50) % path.length]);
      drawSnakeBody(ctx, cells, size, C.mint, U.alpha(C.mint, 0.7));
      ctx.fillStyle = C.p1;
      ctx.beginPath();
      ctx.arc(9.5 * size, 7.5 * size, size * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('×3', w - 12, h - 8);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'over'
      let wrap = false;
      let snake, dir, queue, food, gold, score, stepTime, acc, pulse, flash;
      let stones, bites, mult, molted;
      const MOLT_EVERY = 8;

      const isStone = (x, y) => stones.some((s) => s.x === x && s.y === y);

      function taken(x, y) {
        return snake.some((s) => s.x === x && s.y === y) || isStone(x, y) ||
          (food && food.x === x && food.y === y) ||
          (gold && gold.x === x && gold.y === y);
      }

      function freeCell() {
        for (let tries = 0; tries < 300; tries++) {
          const c = { x: U.randInt(0, COLS - 1), y: U.randInt(0, ROWS - 1) };
          if (!taken(c.x, c.y)) return c;
        }
        const open = [];
        for (let x = 0; x < COLS; x++) {
          for (let y = 0; y < ROWS; y++) if (!taken(x, y)) open.push({ x, y });
        }
        return open.length ? U.pick(open) : null;
      }

      /* How many segments stay attached at the next molt. */
      const keepCount = () => Math.max(3, Math.ceil(snake.length / 2));

      function molt() {
        const shed = snake.splice(keepCount());
        if (!shed.length) return;
        shed.forEach((c) => stones.push({ x: c.x, y: c.y, born: pulse }));
        mult += 1;
        flash = 0.6;
        api.sfx('boom');
        api.setStatus(molted
          ? 'Molted again. Bites are now worth ' + mult + ' points.'
          : 'You molted! Your old tail is stone now. Bites are worth ' + mult + ' points.');
        molted = true;
      }

      function reset() {
        const cx = Math.floor(COLS / 4);
        const cy = Math.floor(ROWS / 2);
        snake = [{ x: cx, y: cy }, { x: cx - 1, y: cy }, { x: cx - 2, y: cy }];
        dir = DIRS.right;
        queue = [];
        food = null;
        gold = null;
        stones = [];
        bites = 0;
        mult = 1;
        molted = false;
        food = freeCell();
        score = 0;
        stepTime = 0.13;
        acc = 0;
        pulse = 0;
        flash = 0;
        api.setScore(0);
      }

      function startRun(useWrap) {
        wrap = useWrap;
        reset();
        state = 'play';
        api.setStatus(wrap ? 'Wrap mode: walls let you through.' : 'Classic mode: walls are deadly.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Snake',
          text: 'Arrow keys or WASD to steer. Swipe on touch screens.',
          buttons: [
            { label: 'Classic', primary: true, onClick: () => startRun(false) },
            { label: 'Wrap mode', onClick: () => startRun(true) }
          ]
        });
      }

      function gameOver() {
        state = 'over';
        flash = 1;
        api.sfx('lose');
        const isBest = api.reportScore(score);
        api.menu({
          title: isBest ? 'New best: ' + score + '!' : 'Game over',
          text: 'You ate your way to ' + score + ' point' + (score === 1 ? '' : 's') + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startRun(wrap) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function turn(name) {
        if (state !== 'play') return;
        const next = DIRS[name];
        const last = queue.length ? queue[queue.length - 1] : dir;
        if (next === last || (next.x === -last.x && next.y === -last.y)) return;
        if (queue.length < 3) queue.push(next);
      }

      function step() {
        if (queue.length) dir = queue.shift();
        const head = snake[0];
        let nx = head.x + dir.x;
        let ny = head.y + dir.y;
        if (wrap) {
          nx = (nx + COLS) % COLS;
          ny = (ny + ROWS) % ROWS;
        } else if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
          gameOver();
          return;
        }
        const eatsFood = food && food.x === nx && food.y === ny;
        const eatsGold = gold && gold.x === nx && gold.y === ny;
        // The tail moves away this step unless we grow, so it is safe to enter.
        const body = eatsFood ? snake : snake.slice(0, -1);
        if (body.some((s) => s.x === nx && s.y === ny) || isStone(nx, ny)) {
          gameOver();
          return;
        }
        snake.unshift({ x: nx, y: ny });
        if (eatsFood) {
          score += mult;
          bites += 1;
          api.sfx('score');
          stepTime = Math.max(0.055, stepTime * 0.97);
          food = null;
          food = freeCell();
          if (!gold && Math.random() < 0.2) {
            const g = freeCell();
            if (g) gold = Object.assign(g, { life: 6 });
          }
          if (bites % MOLT_EVERY === MOLT_EVERY - 1 && !molted) {
            api.setStatus('Next bite you molt: the flashing half of your tail turns to stone.');
          }
        } else {
          snake.pop();
        }
        if (eatsGold) {
          score += 5 * mult;
          gold = null;
          api.sfx('power');
          snake.push(Object.assign({}, snake[snake.length - 1]));
        }
        if (eatsFood && bites % MOLT_EVERY === 0) molt();
        if (!food) food = freeCell();
        api.setScore(mult > 1 ? score + '  ×' + mult : score);
      }

      function update(dt) {
        pulse += dt;
        flash = Math.max(0, flash - dt * 2);
        if (state !== 'play') return;
        if (gold) {
          gold.life -= dt;
          if (gold.life <= 0) gold = null;
        }
        acc += dt;
        while (acc >= stepTime && state === 'play') {
          acc -= stepTime;
          step();
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.line, 0.55);
        for (let x = 0; x < COLS; x++) {
          for (let y = 0; y < ROWS; y++) ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
        }
        if (!wrap) {
          ctx.strokeStyle = U.alpha(C.mint, 0.35);
          ctx.lineWidth = 2;
          ctx.strokeRect(1, 1, W - 2, H - 2);
        }
        if (stones) {
          for (const st of stones) {
            const age = pulse - st.born;
            if (age < 0.35) {
              // Fresh stone settles with a quick white flash.
              ctx.fillStyle = U.alpha('#FFFFFF', 0.7 * (1 - age / 0.35));
              ctx.fillRect(st.x * CELL, st.y * CELL, CELL, CELL);
            }
            drawStone(ctx, st.x, st.y, CELL);
          }
        }
        if (food) {
          const r = CELL * 0.32 + Math.sin(pulse * 6) * 2;
          ctx.fillStyle = U.alpha(C.p1, 0.25);
          ctx.beginPath();
          ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, r + 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.p1;
          ctx.beginPath();
          ctx.arc(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2, r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (gold) {
          const blink = gold.life < 2 && Math.sin(pulse * 20) < 0;
          if (!blink) {
            ctx.fillStyle = C.gold;
            const gx = gold.x * CELL + CELL / 2;
            const gy = gold.y * CELL + CELL / 2;
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
              const a = (i / 10) * Math.PI * 2 - Math.PI / 2 + pulse;
              const rr = i % 2 ? CELL * 0.22 : CELL * 0.48;
              ctx.lineTo(gx + Math.cos(a) * rr, gy + Math.sin(a) * rr);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
        if (snake) {
          drawSnakeBody(ctx, snake, CELL, C.mint, U.alpha(C.mint, 0.75));
          // Telegraph: the half that will turn to stone on the next bite flashes.
          if (state === 'play' && bites % MOLT_EVERY === MOLT_EVERY - 1 && Math.sin(pulse * 14) > 0) {
            for (let i = keepCount(); i < snake.length; i++) {
              ctx.fillStyle = U.alpha('#7A74AE', 0.85);
              U.roundRect(ctx, snake[i].x * CELL + 2, snake[i].y * CELL + 2, CELL - 4, CELL - 4, CELL * 0.3);
              ctx.fill();
            }
          }
          const h = snake[0];
          ctx.fillStyle = C.ink;
          const ex = h.x * CELL + CELL / 2 + dir.x * 4;
          const ey = h.y * CELL + CELL / 2 + dir.y * 4;
          ctx.beginPath();
          ctx.arc(ex - dir.y * 5, ey - dir.x * 5, 2.6, 0, Math.PI * 2);
          ctx.arc(ex + dir.y * 5, ey + dir.x * 5, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (state === 'play' || state === 'over') {
          ctx.font = '700 18px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillStyle = mult > 1 ? C.gold : U.alpha(C.text, 0.5);
          ctx.fillText('×' + mult, W - 12, 10);
          ctx.font = '600 13px "JetBrains Mono", monospace';
          ctx.fillStyle = U.alpha(C.text, 0.55);
          const left = MOLT_EVERY - (bites % MOLT_EVERY);
          ctx.fillText('molt in ' + left, W - 12, 32);
          ctx.textAlign = 'left';
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(state === 'over' ? C.p1 : C.violet, flash * 0.35);
          ctx.fillRect(0, 0, W, H);
        }
      }

      api.on(window, 'keydown', (e) => {
        const name = KEYMAP[e.code];
        if (name) turn(name);
      });

      // Swipe to steer on touch screens.
      let swipe = null;
      api.on(canvas, 'pointerdown', (e) => { swipe = { x: e.clientX, y: e.clientY }; });
      api.on(canvas, 'pointerup', (e) => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
        if (Math.abs(dx) > Math.abs(dy)) turn(dx > 0 ? 'right' : 'left');
        else turn(dy > 0 ? 'down' : 'up');
      });

      reset();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
