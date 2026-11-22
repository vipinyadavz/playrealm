/* Hex Claim: grab territory on a hex map against seven CPU rivals.
   Hook: leave your land to draw a trail, loop back to claim everything inside,
   but anyone who crosses your trail knocks you out. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const COLS = 70;
  const ROWS = 44;
  const N = COLS * ROWS;
  const HR = 17;
  const SQ3 = Math.sqrt(3);
  const HW = SQ3 * HR;
  const VH = 1.5 * HR;
  const ORX = HW / 2 + 8;
  const ORY = HR + 8;
  const MAP_W = ORX * 2 + HW * COLS;
  const MAP_H = ORY * 2 + VH * (ROWS - 1);
  const SPEED = 118;
  const BOOST = 1.6;
  const TURN = 6.5;
  const WIN_PCT = 60;
  const MAX_PARTS = 400;
  const SPEED_HEXES = 6;
  const MONO = '"JetBrains Mono", monospace';
  const PCOLS = [C.p1, C.p2, C.mint, C.violet, '#FF9A3C', '#FF6FD8', '#5B8CFF', '#E6E1FF'];
  const NAMES = ['Captain Crumb', 'NoodleArm', 'Sir Wobble', 'Hexy Hank', 'Lady Loop', 'Duke Doodle', 'Pip Pocket',
    'Mx Meander', 'Baron Bramble', 'Tilly Tiles', 'Count Corner', 'Wiggle Wu'];
  const LEVELS = {
    easy: { dMin: 2, dMax: 4, wMin: 2, wMax: 3, maxTrail: 14, danger: 95, perceive: 300, hunt: 0, think: 0.34 },
    normal: { dMin: 3, dMax: 6, wMin: 2, wMax: 5, maxTrail: 24, danger: 170, perceive: 380, hunt: 150, think: 0.2 },
    hard: { dMin: 4, dMax: 9, wMin: 3, wMax: 7, maxTrail: 36, danger: 230, perceive: 440, hunt: 280, think: 0.12 }
  };
  // Odd-r offset neighbours (dcol, drow) for even and odd rows.
  const NB_EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
  const NB_ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]];
  const CX = [];
  const CY = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    CX.push(Math.cos(a));
    CY.push(Math.sin(a));
  }

  /* ---------- Hex grid (shared, static) ---------- */
  const HXC = new Float32Array(N);
  const HYC = new Float32Array(N);
  const NB = new Int32Array(N * 6);
  const BORDER = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const i = r * COLS + c;
      HXC[i] = ORX + HW * (c + 0.5 * (r & 1));
      HYC[i] = ORY + VH * r;
      const d = r & 1 ? NB_ODD : NB_EVEN;
      for (let k = 0; k < 6; k++) {
        const nc = c + d[k][0];
        const nr = r + d[k][1];
        NB[i * 6 + k] = nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS ? nr * COLS + nc : -1;
      }
      if (r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1) BORDER.push(i);
    }
  }

  function hexAt(x, y) {
    const px = x - ORX;
    const py = y - ORY;
    let q = (SQ3 / 3 * px - py / 3) / HR;
    let r = (2 / 3 * py) / HR;
    let s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);
    const dq = Math.abs(rq - q);
    const dr = Math.abs(rr - r);
    const ds = Math.abs(rs - s);
    if (dq > dr && dq > ds) rq = -rr - rs;
    else if (dr > ds) rr = -rq - rs;
    const col = rq + (rr - (rr & 1)) / 2;
    if (rr < 0 || rr >= ROWS || col < 0 || col >= COLS) return -1;
    return rr * COLS + col;
  }

  function hexPath(ctx, x, y, r) {
    ctx.moveTo(x + CX[0] * r, y + CY[0] * r);
    for (let k = 1; k < 6; k++) ctx.lineTo(x + CX[k] * r, y + CY[k] * r);
    ctx.closePath();
  }

  /* Claim: the trail becomes land, then every hex the map border cannot reach
     without crossing this player's land is enclosed and becomes theirs too. */
  function claimArea(owner, id, trailList, onSet) {
    for (let i = 0; i < trailList.length; i++) onSet(trailList[i], id);
    const seen = claimArea.seen || (claimArea.seen = new Uint8Array(N));
    const queue = claimArea.queue || (claimArea.queue = new Int32Array(N));
    seen.fill(0);
    let head = 0;
    let tail = 0;
    for (let i = 0; i < BORDER.length; i++) {
      const h = BORDER[i];
      if (owner[h] !== id && !seen[h]) { seen[h] = 1; queue[tail++] = h; }
    }
    while (head < tail) {
      const h = queue[head++];
      for (let k = 0; k < 6; k++) {
        const n = NB[h * 6 + k];
        if (n >= 0 && !seen[n] && owner[n] !== id) { seen[n] = 1; queue[tail++] = n; }
      }
    }
    let got = 0;
    for (let h = 0; h < N; h++) {
      if (!seen[h] && owner[h] !== id) { onSet(h, id); got++; }
    }
    return got;
  }

  Arcade.register({
    id: 'hex-claim',
    title: 'Hex Claim',
    category: 'io',
    mode: 'solo',
    players: '1P',
    best: 'high',
    formatScore: (n) => n + '%',
    color: C.mint,
    tagline: 'Paint the hex map in your color, one daring loop at a time.',
    hook: 'Leave your land to draw a trail, loop back to claim everything inside, but anyone who crosses your trail knocks you out.',
    tags: ['io', 'territory', 'hex', 'land grab', 'snake', 'trail', 'bots', 'strategy'],
    howTo: 'You start with a small patch of hexes and never stop moving. Step off your land and you leave a trail behind you. ' +
      'Get back onto your land and the trail, plus everything it encircles, becomes yours, even land other players owned. ' +
      'The catch: while you are out, your trail is your weak spot. If anyone touches it, you are knocked out, and if you touch your own trail, so are you. ' +
      'Cross a rival\'s trail to knock them out instead. Gold hexes give a 3 second speed boost. ' +
      'Your best score is the biggest share of the map you held. Own ' + WIN_PCT + '% to win outright.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Steer (8 directions)' },
      { keys: ['↑', '↓', '←', '→'], label: 'Steer (8 directions)' },
      { keys: ['Mouse', 'Touch'], label: 'Steer toward the pointer' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = w / 320;
      const r = 11 * s;
      const hw = SQ3 * r;
      const vh = 1.5 * r;
      const cols = Math.ceil(w / hw) + 1;
      const rows = Math.ceil(h / vh) + 1;
      const zone = (c, rr) => {
        if (c >= 2 && c <= 7 && rr >= 3 && rr <= 9) return 0;
        if (c >= 12 && c <= 17 && rr >= 1 && rr <= 6) return 1;
        if (c >= 10 && c <= 15 && rr >= 9 && rr <= 13) return 2;
        return -1;
      };
      const cols3 = [C.mint, C.p2, C.violet];
      for (let rr = 0; rr < rows; rr++) {
        for (let c = 0; c < cols; c++) {
          const x = hw * (c + 0.5 * (rr & 1));
          const y = vh * rr;
          const z = zone(c, rr);
          ctx.beginPath();
          hexPath(ctx, x, y, r - 1);
          ctx.fillStyle = z >= 0 ? U.alpha(cols3[z], 0.5) : U.alpha(C.panel, 0.7);
          ctx.fill();
        }
      }
      // A mint trail looping out from the mint land.
      const loop = [[8, 4], [9, 4], [10, 4], [10, 5], [10, 6], [10, 7], [9, 8], [8, 8]];
      const shown = 3 + Math.floor((t * 4) % (loop.length - 2));
      loop.slice(0, shown).forEach(([c, rr]) => {
        ctx.beginPath();
        hexPath(ctx, hw * (c + 0.5 * (rr & 1)), vh * rr, r - 2);
        ctx.fillStyle = U.alpha(C.mint, 0.95);
        ctx.fill();
      });
      const [hc, hr] = loop[shown - 1];
      const hx = hw * (hc + 0.5 * (hr & 1));
      const hy = vh * hr;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(hx, hy, 7 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = C.mint;
      ctx.beginPath(); ctx.arc(hx, hy, 5 * s, 0, TAU); ctx.fill();
      // A cyan rival closing in on that trail.
      ctx.fillStyle = C.p2;
      ctx.beginPath(); ctx.arc(hw * 12.5, vh * 7, 6 * s, 0, TAU); ctx.fill();
      ctx.strokeStyle = U.alpha(C.p1, 0.8);
      ctx.lineWidth = 2 * s;
      ctx.setLineDash([4 * s, 4 * s]);
      ctx.beginPath(); ctx.moveTo(hw * 12.5, vh * 7); ctx.lineTo(hw * 10.8, vh * 6.2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.text;
      ctx.font = '800 ' + Math.round(16 * s) + 'px ' + MONO;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText('23%', w - 10 * s, h - 8 * s);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      const owner = new Int8Array(N).fill(-1);
      const trail = new Int8Array(N).fill(-1);
      const speedHex = new Uint8Array(N);
      const counts = new Int32Array(8);
      const bfsSeen = new Int32Array(N);
      const bfsPrev = new Int32Array(N);
      const bfsQueue = new Int32Array(N);
      const nearGen = new Int32Array(N);
      let bfsGen = 0;
      const buckets = [];
      const bucketN = new Int32Array(10);
      for (let i = 0; i < 10; i++) buckets.push(new Int32Array(1600));

      let state = 'menu'; // menu | count | play | over
      let diff = 'normal';
      let L = LEVELS.normal;
      let players = [];
      let me = null;
      let clock = 0;
      let countT = 0;
      let goT = 0;
      let shake = 0;
      let peak = 0;
      let banner = null;
      let hinted = {};
      let danger = 0;
      let mapDirty = true;
      let mapT = 0;
      let killer = '';
      let speedQueue = [];
      const floats = [];
      const cam = { x: 0, y: 0 };
      const pointer = { x: 0, y: 0, active: false };

      const px = new Float32Array(MAX_PARTS);
      const py = new Float32Array(MAX_PARTS);
      const pvx = new Float32Array(MAX_PARTS);
      const pvy = new Float32Array(MAX_PARTS);
      const pl = new Float32Array(MAX_PARTS);
      const pm = new Float32Array(MAX_PARTS);
      const pc = new Array(MAX_PARTS).fill('#fff');
      let pNext = 0;
      function burst(x, y, color, n, speed, life) {
        for (let k = 0; k < n; k++) {
          const i = pNext;
          pNext = (pNext + 1) % MAX_PARTS;
          const a = Math.random() * TAU;
          const v = speed * (0.3 + Math.random() * 0.7);
          px[i] = x; py[i] = y; pvx[i] = Math.cos(a) * v; pvy[i] = Math.sin(a) * v;
          pl[i] = pm[i] = life * (0.6 + Math.random() * 0.4); pc[i] = color;
        }
      }
      function say(x, y, text, color) {
        if (floats.length > 10) floats.shift();
        floats.push({ x, y, text, color, t: 0 });
      }
      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }

      /* Minimap: one pixel per hex, refreshed when land changes. */
      let mini = null;
      let miniCtx = null;
      let miniImg = null;
      const rgb = PCOLS.map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
      try {
        mini = document.createElement('canvas');
        mini.width = COLS;
        mini.height = ROWS;
        miniCtx = mini.getContext('2d');
        miniImg = miniCtx && miniCtx.createImageData ? miniCtx.createImageData(COLS, ROWS) : null;
      } catch (e) {
        mini = null;
      }
      function refreshMini() {
        if (!miniImg || !miniImg.data || miniImg.data.length < N * 4) return;
        const d = miniImg.data;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const h = r * COLS + c;
            const o = trail[h] >= 0 ? trail[h] : owner[h];
            const j = h * 4;
            if (o >= 0) {
              const k = trail[h] >= 0 ? 1 : 0.75;
              d[j] = rgb[o][0] * k; d[j + 1] = rgb[o][1] * k; d[j + 2] = rgb[o][2] * k; d[j + 3] = 255;
            } else {
              d[j] = 38; d[j + 1] = 33; d[j + 2] = 80; d[j + 3] = 255;
            }
          }
        }
        miniCtx.putImageData(miniImg, 0, 0);
      }

      /* ---------- Land ---------- */
      function setOwner(h, id) {
        const prev = owner[h];
        if (prev === id) return;
        if (prev >= 0) counts[prev]--;
        owner[h] = id;
        if (id >= 0) counts[id]++;
      }
      const pct = (id) => (counts[id] / N) * 100;

      function blobFree(h, minD) {
        if (h < 0) return false;
        for (let k = 0; k < 6; k++) {
          const n = NB[h * 6 + k];
          if (n < 0 || owner[n] >= 0 || trail[n] >= 0) return false;
        }
        if (owner[h] >= 0 || trail[h] >= 0) return false;
        for (const o of players) {
          if (o.alive && U.dist(o.x, o.y, HXC[h], HYC[h]) < minD) return false;
        }
        return true;
      }

      function placeBlob(p) {
        let h = -1;
        for (let tries = 0; tries < 400 && h < 0; tries++) {
          const c = U.randInt(3, COLS - 4);
          const r = U.randInt(3, ROWS - 4);
          const cand = r * COLS + c;
          if (blobFree(cand, tries < 250 ? 320 : 120)) h = cand;
        }
        if (h < 0) h = U.randInt(3, ROWS - 4) * COLS + U.randInt(3, COLS - 4);
        setOwner(h, p.id);
        trail[h] = -1;
        for (let k = 0; k < 6; k++) {
          const n = NB[h * 6 + k];
          if (n >= 0) {
            setOwner(n, p.id);
            if (trail[n] >= 0 && trail[n] !== p.id) trail[n] = -1;
          }
        }
        p.x = HXC[h];
        p.y = HYC[h];
        p.hex = h;
        p.dir = Math.random() * TAU;
        p.want = p.dir;
        p.trailList.length = 0;
        mapDirty = true;
        // If spawning stole someone's last hexes, they are out.
        for (const o of players) if (o !== p && o.alive && counts[o.id] <= 0) eliminate(o, -1, 'lost all land');
      }

      function makePlayer(id, name, human) {
        return {
          id, name, human, color: PCOLS[id], x: 0, y: 0, dir: 0, want: 0, hex: -1, alive: true, trailList: [],
          boost: 0, kills: 0, respawn: 0, flash: 0,
          ai: { think: Math.random() * 0.3, mode: 'plan', leg: 0, wx: [0, 0], wy: [0, 0], path: [], goal: -1,
            huntT: 0, side: 1, planT: 0 }
        };
      }

      function startGame(d) {
        diff = d;
        L = LEVELS[d];
        owner.fill(-1);
        trail.fill(-1);
        speedHex.fill(0);
        counts.fill(0);
        pl.fill(0);
        floats.length = 0;
        speedQueue = [];
        const names = U.shuffle(NAMES.slice());
        players = [];
        for (let i = 0; i < 8; i++) {
          const p = makePlayer(i, i === 0 ? 'You' : names[i], i === 0);
          p.alive = false;
          players.push(p);
        }
        for (const p of players) { placeBlob(p); p.alive = true; }
        me = players[0];
        for (let i = 0; i < SPEED_HEXES; i++) spawnSpeed();
        clock = 0;
        countT = 3;
        goT = 0;
        shake = 0;
        peak = pct(0);
        banner = null;
        hinted = {};
        danger = 0;
        killer = '';
        mapDirty = true;
        cam.x = me.x - W / 2;
        cam.y = me.y - H / 2;
        state = 'count';
        api.sfx('tick');
        updateScore();
        api.setStatus('Steer with WASD, the arrows or the pointer. Leave your land, loop back, and claim the inside.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Hex Claim',
          text: 'Loop out from your land and back to claim hexes. Touch a rival\'s trail to knock them out; never touch your own.',
          buttons: [
            { label: 'Easy', onClick: () => startGame('easy') },
            { label: 'Normal', primary: true, onClick: () => startGame('normal') },
            { label: 'Hard', onClick: () => startGame('hard') }
          ]
        });
      }

      function updateScore() {
        if (!me) return;
        api.setScore(pct(0).toFixed(1) + '%');
      }

      function gameOver(won) {
        state = 'over';
        const score = Math.floor(peak);
        const isBest = api.reportScore(score);
        api.sfx(won ? 'win' : 'lose');
        api.setStatus(won ? 'You painted ' + WIN_PCT + '% of the map.' : killer + '.');
        api.after(won ? 600 : 1100, () => {
          api.menu({
            title: isBest ? 'New best: ' + score + '%!' : won ? 'Map conquered!' : 'Knocked out',
            text: (won ? 'You own ' + pct(0).toFixed(1) + '% of the map. ' : killer + '. ') +
              'Peak ' + peak.toFixed(1) + '%, ' + me.kills + ' knockout' + (me.kills === 1 ? '' : 's') + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(diff) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      function spawnSpeed() {
        for (let tries = 0; tries < 60; tries++) {
          const h = U.randInt(0, N - 1);
          if (speedHex[h] || trail[h] >= 0) continue;
          if (players.some((p) => p.alive && p.hex === h)) continue;
          speedHex[h] = 1;
          return;
        }
      }

      function eliminate(p, by, why) {
        if (!p.alive) return;
        p.alive = false;
        for (let h = 0; h < N; h++) {
          if (owner[h] === p.id) owner[h] = -1;
          if (trail[h] === p.id) trail[h] = -1;
        }
        counts[p.id] = 0;
        p.trailList.length = 0;
        mapDirty = true;
        burst(p.x, p.y, p.color, 30, 220, 0.9);
        burst(p.x, p.y, '#FFFFFF', 12, 160, 0.5);
        const k = by >= 0 && by !== p.id ? players[by] : null;
        if (k) {
          k.kills++;
          say(k.x, k.y - 22, '+1 knockout', k.color);
        }
        if (p === me) {
          shake = 14;
          killer = k ? 'Knocked out by ' + k.name : why === 'your own trail' ? 'You crossed your own trail' : 'You lost all your land';
          api.sfx('boom');
          gameOver(false);
          return;
        }
        if (onCam(p.x, p.y)) api.sfx('boom');
        if (k === me) {
          api.sfx('score');
          banner = { text: 'Knocked out ' + p.name, color: C.p1, t: 0 };
          hint('kill', 'You crossed ' + p.name + '\'s trail and knocked them out. Their land is up for grabs.');
        }
        p.respawn = 3;
      }

      function claim(p) {
        const before = counts[p.id];
        claimArea(owner, p.id, p.trailList, (h) => {
          setOwner(h, p.id);
          if (trail[h] === p.id) trail[h] = -1;
        });
        p.trailList.length = 0;
        const gained = counts[p.id] - before;
        mapDirty = true;
        if (p === me) {
          api.sfx(gained > 25 ? 'power' : 'score');
          say(p.x, p.y - 22, '+' + gained + ' hexes', C.mint);
          hint('claim', 'Claimed ' + gained + ' hexes! Bigger loops grab more, but leave your trail exposed for longer.');
          if (pct(0) > peak) peak = pct(0);
          updateScore();
        } else if (onCam(p.x, p.y) && gained > 10) {
          burst(p.x, p.y, p.color, 8, 100, 0.5);
        }
        for (const o of players) {
          if (o !== p && o.alive && counts[o.id] <= 0) eliminate(o, p.id, p.name);
        }
      }

      function enterHex(p, h) {
        p.hex = h;
        const t = trail[h];
        if (t >= 0) {
          if (t === p.id) {
            // Wobbling back into the hex you just left is forgiven; anything older is fatal.
            const n = p.trailList.length;
            if (p.trailList[n - 1] === h || p.trailList[n - 2] === h) return;
            eliminate(p, -1, 'your own trail');
            return;
          }
          eliminate(players[t], p.id, p.name);
        }
        if (speedHex[h]) {
          speedHex[h] = 0;
          p.boost = 3;
          speedQueue.push(4);
          burst(HXC[h], HYC[h], C.gold, 14, 160, 0.5);
          if (p === me) {
            api.sfx('power');
            hint('speed', 'Speed boost for 3 seconds. Great for closing a loop fast.');
          }
        }
        if (owner[h] === p.id) {
          if (p.trailList.length) claim(p);
        } else {
          trail[h] = p.id;
          p.trailList.push(h);
          if (p === me && p.trailList.length === 1) {
            hint('trail', 'You left your land, so you are drawing a trail. Loop back to claim the inside. If anyone touches it, you are out.');
          }
          if (p.trailList.length % 4 === 0) mapDirty = true;
        }
      }

      /* ---------- Bots ---------- */
      /* Shortest hex path that never steps on our own trail. With `margin`, it also keeps
         one hex away from the older part of the trail so turns cannot clip it. */
      function bfs(from, goalFn, id, list) {
        bfsGen++;
        const margin = !!list;
        if (margin) {
          for (let i = 0; i < list.length - 3; i++) {
            const t = list[i];
            for (let k = 0; k < 6; k++) {
              const n = NB[t * 6 + k];
              if (n >= 0) nearGen[n] = bfsGen;
            }
          }
        }
        let head = 0;
        let tail = 0;
        bfsQueue[tail++] = from;
        bfsSeen[from] = bfsGen;
        bfsPrev[from] = -1;
        let found = -1;
        while (head < tail) {
          const h = bfsQueue[head++];
          if (h !== from && goalFn(h)) { found = h; break; }
          for (let k = 0; k < 6; k++) {
            const n = NB[h * 6 + k];
            if (n < 0 || bfsSeen[n] === bfsGen || trail[n] === id || (margin && nearGen[n] === bfsGen)) continue;
            bfsSeen[n] = bfsGen;
            bfsPrev[n] = h;
            bfsQueue[tail++] = n;
          }
        }
        return found;
      }

      function pathTo(b, found) {
        const path = b.ai.path;
        path.length = 0;
        let h = found;
        while (h >= 0 && h !== b.hex) {
          path.push(h);
          h = bfsPrev[h];
        }
        path.reverse();
      }

      function planLoop(b) {
        const ai = b.ai;
        // Try a few headings; prefer ones that reach land we do not own quickly.
        let bestA = Math.random() * TAU;
        let bestS = -1e9;
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * TAU;
          let edge = 0;
          let s = 0;
          for (let step = 1; step <= 14; step++) {
            const h = hexAt(b.x + Math.cos(a) * HW * step, b.y + Math.sin(a) * HW * step);
            if (h < 0) { s -= 40; break; }
            if (owner[h] === b.id && edge === step - 1) edge = step;
            else if (owner[h] !== b.id) s += owner[h] >= 0 ? 3 : 2;
            if (trail[h] >= 0 && trail[h] !== b.id) s += 1;
          }
          s -= edge * 0.5;
          if (s > bestS) { bestS = s; bestA = a; }
        }
        let edge = 0;
        for (let step = 1; step <= 18; step++) {
          const h = hexAt(b.x + Math.cos(bestA) * HW * step, b.y + Math.sin(bestA) * HW * step);
          if (h < 0 || owner[h] !== b.id) break;
          edge = step;
        }
        const depth = U.randInt(L.dMin, L.dMax) + edge;
        const width = U.randInt(L.wMin, L.wMax);
        const side = Math.random() < 0.5 ? -1 : 1;
        const x1 = U.clamp(b.x + Math.cos(bestA) * HW * depth, ORX + HW, MAP_W - ORX - HW);
        const y1 = U.clamp(b.y + Math.sin(bestA) * HW * depth, ORY + VH, MAP_H - ORY - VH);
        const pa = bestA + side * Math.PI / 2;
        ai.wx[0] = x1;
        ai.wy[0] = y1;
        ai.wx[1] = U.clamp(x1 + Math.cos(pa) * HW * width, ORX + HW, MAP_W - ORX - HW);
        ai.wy[1] = U.clamp(y1 + Math.sin(pa) * HW * width, ORY + VH, MAP_H - ORY - VH);
        ai.leg = 0;
        ai.planT = 0;
        ai.mode = 'out';
      }

      function botThink(b) {
        const ai = b.ai;
        ai.think = L.think * U.rand(0.8, 1.25);
        const out = b.trailList.length > 0;
        // Threats: rivals close to our head or trail.
        let threat = false;
        if (out) {
          for (const o of players) {
            if (o === b || !o.alive) continue;
            const d = U.dist(o.x, o.y, b.x, b.y);
            if (d > L.perceive) continue;
            let m = d;
            for (let i = b.trailList.length - 1; i >= 0; i -= 2) {
              const h = b.trailList[i];
              const dd = U.dist(o.x, o.y, HXC[h], HYC[h]);
              if (dd < m) m = dd;
            }
            if (m < L.danger) { threat = true; break; }
          }
        }
        // Hunting: go cut an exposed rival trail when our own is short.
        if (L.hunt > 0 && b.trailList.length < 5 && ai.mode !== 'hunt') {
          const range = Math.ceil(L.hunt / VH);
          const r0 = Math.floor((b.y - ORY) / VH);
          const c0 = Math.floor((b.x - ORX) / HW);
          let best = -1;
          let bd = L.hunt;
          for (let r = Math.max(0, r0 - range); r <= Math.min(ROWS - 1, r0 + range); r++) {
            for (let c = Math.max(0, c0 - range); c <= Math.min(COLS - 1, c0 + range); c++) {
              const h = r * COLS + c;
              if (trail[h] < 0 || trail[h] === b.id) continue;
              const d = U.dist(b.x, b.y, HXC[h], HYC[h]);
              if (d < bd) { bd = d; best = h; }
            }
          }
          if (best >= 0) {
            ai.mode = 'hunt';
            ai.goal = best;
            ai.huntT = 0;
          }
        }
        if (ai.mode === 'hunt') {
          if (trail[ai.goal] < 0 || trail[ai.goal] === b.id || ai.huntT > 3.5 || b.trailList.length > L.maxTrail * 0.6) {
            ai.mode = out ? 'return' : 'plan';
          }
        }
        if (ai.mode === 'out' && (threat || b.trailList.length > L.maxTrail || ai.leg >= 2 || ai.planT > 9)) ai.mode = 'return';
        if (ai.mode === 'hunt' && threat && b.trailList.length > 2) ai.mode = 'return';
        if (ai.mode === 'return' && !out && owner[b.hex] === b.id) ai.mode = 'plan';
        if (ai.mode === 'plan') planLoop(b);
        if (ai.mode === 'return') {
          const home = (h) => owner[h] === b.id;
          let f = bfs(b.hex, home, b.id, b.trailList);
          if (f < 0) f = bfs(b.hex, home, b.id, null);
          if (f >= 0) pathTo(b, f);
          else ai.path.length = 0;
        } else if (ai.mode === 'hunt') {
          const g = ai.goal;
          let f = bfs(b.hex, (h) => h === g, b.id, b.trailList);
          if (f < 0) f = bfs(b.hex, (h) => h === g, b.id, null);
          if (f >= 0) pathTo(b, f);
          else ai.mode = out ? 'return' : 'plan';
        }
      }

      function safeHeading(b, a) {
        for (let k = 0; k < 9; k++) {
          const off = k === 0 ? 0 : Math.ceil(k / 2) * 0.55 * (k % 2 ? b.ai.side : -b.ai.side);
          const aa = a + off;
          const h1 = hexAt(b.x + Math.cos(aa) * HW * 0.75, b.y + Math.sin(aa) * HW * 0.75);
          const h2 = hexAt(b.x + Math.cos(aa) * HW * 1.4, b.y + Math.sin(aa) * HW * 1.4);
          const bad = (h) => h < 0 || trail[h] === b.id;
          if (!bad(h1) && (!bad(h2) || k > 5)) return aa;
        }
        b.ai.side = -b.ai.side;
        return a;
      }

      function botSteer(b, dt) {
        const ai = b.ai;
        ai.think -= dt;
        ai.planT += dt;
        if (ai.mode === 'hunt') ai.huntT += dt;
        if (ai.think <= 0) botThink(b);
        let tx = b.x + Math.cos(b.dir) * 40;
        let ty = b.y + Math.sin(b.dir) * 40;
        if (ai.mode === 'out') {
          tx = ai.wx[ai.leg];
          ty = ai.wy[ai.leg];
          if (U.dist(b.x, b.y, tx, ty) < 16) {
            ai.leg++;
            if (ai.leg >= 2) {
              ai.think = 0;
              if (b.trailList.length === 0) ai.mode = 'plan';
              else ai.mode = 'return';
            }
          }
          if (ai.leg === 1 && b.trailList.length === 0 && ai.planT > 1) ai.mode = 'plan';
        } else if ((ai.mode === 'return' || ai.mode === 'hunt') && ai.path.length) {
          let i = 0;
          while (i < ai.path.length - 1 && ai.path[i] === b.hex) i++;
          tx = HXC[ai.path[i]];
          ty = HYC[ai.path[i]];
        } else if (ai.mode === 'return') {
          // No safe path: head for our nearest land and hope.
          let bd = 1e9;
          for (let h = 0; h < N; h += 1) {
            if (owner[h] !== b.id) continue;
            const d = Math.abs(HXC[h] - b.x) + Math.abs(HYC[h] - b.y);
            if (d < bd) { bd = d; tx = HXC[h]; ty = HYC[h]; }
          }
        }
        b.want = safeHeading(b, Math.atan2(ty - b.y, tx - b.x));
      }

      /* ---------- Movement ---------- */
      function humanSteer() {
        const k = api.keys;
        const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        if (x || y) {
          pointer.active = false;
          me.want = Math.atan2(y, x);
        } else if (pointer.active) {
          const wx = pointer.x + cam.x;
          const wy = pointer.y + cam.y;
          if (U.dist(wx, wy, me.x, me.y) > 12) me.want = Math.atan2(wy - me.y, wx - me.x);
        }
      }

      function movePlayer(p, dt) {
        const d = Math.atan2(Math.sin(p.want - p.dir), Math.cos(p.want - p.dir));
        const m = TURN * dt;
        p.dir += d > m ? m : d < -m ? -m : d;
        const sp = SPEED * (p.boost > 0 ? BOOST : 1);
        p.x = U.clamp(p.x + Math.cos(p.dir) * sp * dt, ORX, ORX + HW * (COLS - 0.5));
        p.y = U.clamp(p.y + Math.sin(p.dir) * sp * dt, ORY, ORY + VH * (ROWS - 1));
        const h = hexAt(p.x, p.y);
        if (h >= 0 && h !== p.hex) enterHex(p, h);
      }

      api.on(canvas, 'pointermove', (e) => {
        const q = api.toCanvas(e, canvas);
        if (Math.abs(q.x - pointer.x) + Math.abs(q.y - pointer.y) > 2) pointer.active = true;
        pointer.x = q.x;
        pointer.y = q.y;
      });
      api.on(canvas, 'pointerdown', (e) => {
        const q = api.toCanvas(e, canvas);
        pointer.x = q.x;
        pointer.y = q.y;
        pointer.active = true;
      });

      const onCam = (x, y) => x > cam.x - 40 && x < cam.x + W + 40 && y > cam.y - 40 && y < cam.y + H + 40;

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 30);
        goT = Math.max(0, goT - dt);
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          pl[i] -= dt;
          px[i] += pvx[i] * dt;
          py[i] += pvy[i] * dt;
          pvx[i] *= 0.94;
          pvy[i] *= 0.94;
        }
        for (let i = floats.length - 1; i >= 0; i--) {
          floats[i].t += dt;
          if (floats[i].t > 1.3) floats.splice(i, 1);
        }
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.8) banner = null;
        }
        mapT -= dt;
        if (mapDirty && mapT <= 0) {
          refreshMini();
          if (state === 'play') updateScore();
          mapDirty = false;
          mapT = 0.25;
        }
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) { state = 'play'; goT = 0.8; api.sfx('blip'); }
          else if (Math.ceil(countT) !== prev) api.sfx('tick');
        } else if (state === 'play') {
          for (let i = speedQueue.length - 1; i >= 0; i--) {
            speedQueue[i] -= dt;
            if (speedQueue[i] <= 0) { speedQueue.splice(i, 1); spawnSpeed(); }
          }
          for (const p of players) {
            if (state !== 'play') break;
            if (!p.alive) {
              if (!p.human) {
                p.respawn -= dt;
                if (p.respawn <= 0) {
                  p.alive = true;
                  p.boost = 0;
                  p.ai.mode = 'plan';
                  placeBlob(p);
                  if (onCam(p.x, p.y)) burst(p.x, p.y, p.color, 12, 100, 0.5);
                }
              }
              continue;
            }
            p.boost = Math.max(0, p.boost - dt);
            p.flash = Math.max(0, p.flash - dt);
            if (p.human) humanSteer();
            else botSteer(p, dt);
            movePlayer(p, dt);
          }
          if (state === 'play') {
            if (pct(0) > peak) peak = pct(0);
            // Telegraph: a rival is near your exposed trail.
            danger = 0;
            if (me.alive && me.trailList.length) {
              for (const o of players) {
                if (o === me || !o.alive) continue;
                for (let i = 0; i < me.trailList.length; i += 2) {
                  const h = me.trailList[i];
                  if (Math.abs(o.x - HXC[h]) < 150 && Math.abs(o.y - HYC[h]) < 150) { danger = 1; break; }
                }
                if (danger) break;
              }
              if (danger) hint('danger', 'Careful: a rival is close to your trail. Get back to your land before they cross it!');
            }
            if (pct(0) >= WIN_PCT) {
              peak = Math.max(peak, pct(0));
              banner = { text: 'Map conquered!', color: C.mint, t: 0 };
              gameOver(true);
            }
          }
        }
        if (me) {
          const tx = U.clamp(me.x - W / 2, -60, MAP_W - W + 60);
          const ty = U.clamp(me.y - H / 2, -60, MAP_H - H + 60);
          const k = Math.min(1, dt * 6);
          cam.x += (tx - cam.x) * k;
          cam.y += (ty - cam.y) * k;
        }
      }

      /* ---------- Drawing ---------- */
      function drawMap() {
        const c0 = Math.max(0, Math.floor((cam.x - ORX) / HW) - 1);
        const c1 = Math.min(COLS - 1, Math.ceil((cam.x + W - ORX) / HW) + 1);
        const r0 = Math.max(0, Math.floor((cam.y - ORY) / VH) - 1);
        const r1 = Math.min(ROWS - 1, Math.ceil((cam.y + H - ORY) / VH) + 1);
        bucketN.fill(0);
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const h = r * COLS + c;
            const o = owner[h];
            const b = o >= 0 ? o : 8;
            if (bucketN[b] < 1600) buckets[b][bucketN[b]++] = h;
            if (trail[h] >= 0 && bucketN[9] < 1600) buckets[9][bucketN[9]++] = h;
          }
        }
        // Neutral ground.
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        ctx.beginPath();
        for (let i = 0; i < bucketN[8]; i++) hexPath(ctx, HXC[buckets[8][i]], HYC[buckets[8][i]], HR - 1.2);
        ctx.fill();
        // Land, one batch per owner.
        for (let o = 0; o < 8; o++) {
          if (!bucketN[o]) continue;
          ctx.fillStyle = U.alpha(PCOLS[o], o === 0 ? 0.5 : 0.42);
          ctx.beginPath();
          for (let i = 0; i < bucketN[o]; i++) hexPath(ctx, HXC[buckets[o][i]], HYC[buckets[o][i]], HR - 1.2);
          ctx.fill();
        }
        // Trails on top, brighter and inset.
        for (let i = 0; i < bucketN[9]; i++) {
          const h = buckets[9][i];
          const t = trail[h];
          const mine = t === 0;
          let col = PCOLS[t];
          if (mine && danger && Math.sin(clock * 18) > 0) col = '#FFFFFF';
          ctx.fillStyle = U.alpha(col, 0.9);
          ctx.beginPath();
          hexPath(ctx, HXC[h], HYC[h], HR - 3.5);
          ctx.fill();
        }
        // Speed hexes.
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const h = r * COLS + c;
            if (!speedHex[h]) continue;
            const pulse = 0.6 + 0.4 * Math.sin(clock * 6 + h);
            ctx.fillStyle = U.alpha(C.gold, 0.35 + 0.4 * pulse);
            ctx.beginPath();
            hexPath(ctx, HXC[h], HYC[h], HR - 2);
            ctx.fill();
            ctx.fillStyle = C.ink;
            ctx.beginPath();
            ctx.moveTo(HXC[h] + 2, HYC[h] - 8);
            ctx.lineTo(HXC[h] - 4, HYC[h] + 1);
            ctx.lineTo(HXC[h], HYC[h] + 1);
            ctx.lineTo(HXC[h] - 2, HYC[h] + 8);
            ctx.lineTo(HXC[h] + 4, HYC[h] - 1);
            ctx.lineTo(HXC[h], HYC[h] - 1);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.strokeStyle = U.alpha(C.mint, 0.35);
        ctx.lineWidth = 3;
        ctx.strokeRect(ORX - HW / 2 - 4, ORY - HR - 4, HW * (COLS + 0.5) + 8, VH * (ROWS - 1) + HR * 2 + 8);
      }

      function drawPlayers() {
        for (const p of players) {
          if (!p.alive || !onCam(p.x, p.y)) continue;
          // Thin line along the trail so its route reads at a glance.
          if (p.trailList.length) {
            ctx.strokeStyle = U.alpha('#FFFFFF', 0.35);
            ctx.lineWidth = 2;
            ctx.beginPath();
            const t0 = p.trailList[0];
            ctx.moveTo(HXC[t0], HYC[t0]);
            for (let i = 1; i < p.trailList.length; i++) ctx.lineTo(HXC[p.trailList[i]], HYC[p.trailList[i]]);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
          }
          if (p.boost > 0) {
            ctx.fillStyle = U.alpha(C.gold, 0.3);
            ctx.beginPath(); ctx.arc(p.x, p.y, 17, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.beginPath(); ctx.arc(p.x + 2, p.y + 3, 11, 0, TAU); ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, TAU); ctx.fill();
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, 8.5, 0, TAU); ctx.fill();
          ctx.fillStyle = C.ink;
          const ex = Math.cos(p.dir);
          const ey = Math.sin(p.dir);
          ctx.beginPath();
          ctx.arc(p.x + ex * 4 - ey * 3, p.y + ey * 4 + ex * 3, 1.8, 0, TAU);
          ctx.arc(p.x + ex * 4 + ey * 3, p.y + ey * 4 - ex * 3, 1.8, 0, TAU);
          ctx.fill();
          ctx.font = '600 11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = p.human ? C.text : U.alpha(C.text, 0.7);
          ctx.fillText(p.human ? 'You' : p.name, p.x, p.y - 14);
          // Threat marker over rivals near your trail.
          if (!p.human && danger && me.trailList.length && U.dist(p.x, p.y, me.x, me.y) < 420) {
            ctx.fillStyle = C.p1;
            ctx.font = '800 14px ' + MONO;
            ctx.fillText('!', p.x, p.y - 27);
          }
        }
      }

      function drawHud() {
        // Your share.
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, 14, 14, 190, 64, 12); ctx.fill();
        ctx.font = '800 26px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.p1;
        ctx.fillText(pct(0).toFixed(1) + '%', 26, 21);
        ctx.font = '600 12px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.fillText('peak ' + peak.toFixed(1) + '%  ·  ' + me.kills + ' KO', 26, 54);
        if (me.trailList.length) {
          const tw = 150;
          ctx.fillStyle = U.alpha(danger ? C.p1 : C.panel, 0.88);
          U.roundRect(ctx, 14, 84, tw, 26, 9); ctx.fill();
          ctx.fillStyle = C.text;
          ctx.font = '600 12px ' + MONO;
          ctx.fillText((danger ? 'danger · ' : 'trail · ') + me.trailList.length + ' hexes', 24, 91);
        }
        // Leaderboard: top 5 plus you.
        const ranked = players.slice().sort((a, b) => counts[b.id] - counts[a.id] || a.id - b.id);
        const rows = ranked.slice(0, 5);
        if (rows.indexOf(me) < 0) rows.push(me);
        const lx = W - 214;
        const ly = 14;
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        U.roundRect(ctx, lx, ly, 200, 26 + rows.length * 18, 12); ctx.fill();
        ctx.font = '600 11px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('map owned', lx + 10, ly + 8);
        rows.forEach((p, i) => {
          const y = ly + 26 + i * 18;
          if (p === me) {
            ctx.fillStyle = U.alpha(C.p1, 0.2);
            ctx.fillRect(lx + 4, y - 2, 192, 17);
          }
          ctx.fillStyle = p.alive ? p.color : U.alpha(C.muted, 0.4);
          ctx.fillRect(lx + 10, y + 3, 8, 8);
          ctx.fillStyle = p.alive ? C.text : U.alpha(C.text, 0.4);
          ctx.textAlign = 'left';
          ctx.fillText((ranked.indexOf(p) + 1) + '. ' + (p === me ? 'You' : p.name), lx + 24, y);
          ctx.textAlign = 'right';
          ctx.fillText(p.alive ? pct(p.id).toFixed(1) + '%' : 'out', lx + 190, y);
        });
        // Minimap.
        const mw = 176;
        const mh = mw * (MAP_H / MAP_W);
        const mx = W - mw - 14;
        const my = H - mh - 14;
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
        if (mini && miniImg) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(mini, mx, my, mw, mh);
          ctx.imageSmoothingEnabled = true;
        }
        const k = mw / MAP_W;
        ctx.strokeStyle = U.alpha(C.text, 0.7);
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + cam.x * k, my + cam.y * k, W * k, H * k);
        if (me.alive) {
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath(); ctx.arc(mx + me.x * k, my + me.y * k, 3, 0, TAU); ctx.fill();
        }
        for (const f of floats) {
          ctx.globalAlpha = Math.max(0, 1 - f.t / 1.3);
          ctx.font = '800 15px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x - cam.x, f.y - cam.y - f.t * 30);
        }
        ctx.globalAlpha = 1;
      }

      function announce(text, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, H / 2 - 30);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,.7)';
        ctx.fillText(text, 3, 4);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        ctx.restore();
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (state === 'menu' || !me) {
          // Idle backdrop: a slow pan over a hex field.
          ctx.save();
          ctx.translate(-((clock * 20) % HW) - HW, -VH);
          ctx.fillStyle = U.alpha(C.panel, 0.9);
          ctx.beginPath();
          for (let r = 0; r < 28; r++) for (let c = 0; c < 36; c++) hexPath(ctx, HW * (c + 0.5 * (r & 1)), VH * r, HR - 1.2);
          ctx.fill();
          ctx.restore();
          return;
        }
        ctx.save();
        const sx = shake > 0 ? U.rand(-shake, shake) * 0.5 : 0;
        const sy = shake > 0 ? U.rand(-shake, shake) * 0.5 : 0;
        ctx.translate(-Math.round(cam.x) + sx, -Math.round(cam.y) + sy);
        drawMap();
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          ctx.globalAlpha = pl[i] / pm[i];
          ctx.fillStyle = pc[i];
          ctx.fillRect(px[i] - 2, py[i] - 2, 4, 4);
        }
        ctx.globalAlpha = 1;
        drawPlayers();
        ctx.restore();
        drawHud();
        if (state === 'count') announce(String(Math.ceil(countT)), C.mint, 1 + (countT % 1) * 0.4, 1);
        else if (goT > 0) announce('GO!', C.mint, 1 + (0.8 - goT) * 0.5, Math.min(1, goT * 2));
        else if (banner) announce(banner.text, banner.color, 0.55, Math.min(1, (1.8 - banner.t) * 2));
        if (state === 'over' && !me.alive) announce('Knocked out', C.p1, 0.8, 1);
      }

      showStartMenu();
      api.loop((dt) => {
        if (state === 'menu') clock += dt;
        else update(dt);
        draw();
      });
    }
  });
})();
