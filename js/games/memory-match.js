/* Memory Match — find every pair, but each miss swaps two hidden cards. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 720;
  const H = 600;
  const TOP = 66;            // HUD strip on the canvas
  const GAP = 12;
  const FLIP = 0.18;         // seconds for a half-turn of a card
  const SWAP = 0.6;          // seconds for a swap
  const MISS_MS = 700;
  const PEEK_MS = 1000;
  const MAX_PEEKS = 2;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT = '600 15px "JetBrains Mono", monospace';
  const LEVELS = {
    easy: { name: 'Easy', cols: 4, rows: 3, mult: 1, swaps: 1, par: 45 },
    normal: { name: 'Normal', cols: 4, rows: 4, mult: 2, swaps: 1, par: 80 },
    hard: { name: 'Hard', cols: 6, rows: 5, mult: 3, swaps: 2, par: 160 }
  };
  const ICONS = [
    ['star', '#FFC53D'], ['heart', '#FF5D73'], ['moon', '#C9B8FF'], ['bolt', '#F7F052'],
    ['diamond', '#36C9F0'], ['flower', '#FF7AD9'], ['crown', '#FF9F1C'], ['key', '#D9B36C'],
    ['anchor', '#5B7CFF'], ['leaf', '#4BE3A0'], ['drop', '#7FB8FF'], ['sun', '#FF7043'],
    ['note', '#9B7BFF'], ['planet', '#E08BFF'], ['rocket', '#F3F0FF'], ['cloud', '#AEB8D6']
  ];
  const ARROWS = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0]
  };

  /* ---------- Vector icons, drawn around (x, y) with size s ---------- */

  function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
    ctx.fill();
  }

  function drawIcon(ctx, name, color, x, y, s, bg) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    switch (name) {
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? s * 0.42 : s;
          pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.98 + s * 0.08]);
        }
        poly(ctx, pts);
        break;
      }
      case 'heart':
        ctx.moveTo(x, y + s * 0.85);
        ctx.bezierCurveTo(x - s * 1.25, y - s * 0.05, x - s * 0.6, y - s * 1.05, x, y - s * 0.35);
        ctx.bezierCurveTo(x + s * 0.6, y - s * 1.05, x + s * 1.25, y - s * 0.05, x, y + s * 0.85);
        ctx.fill();
        break;
      case 'moon':
        ctx.arc(x - s * 0.1, y, s * 0.85, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(x + s * 0.32, y - s * 0.28, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bolt':
        poly(ctx, [[x + s * 0.2, y - s], [x - s * 0.6, y + s * 0.12], [x - s * 0.05, y + s * 0.12],
          [x - s * 0.25, y + s], [x + s * 0.6, y - s * 0.15], [x + s * 0.05, y - s * 0.15]]);
        break;
      case 'diamond':
        poly(ctx, [[x - s * 0.9, y - s * 0.3], [x - s * 0.5, y - s * 0.8], [x + s * 0.5, y - s * 0.8],
          [x + s * 0.9, y - s * 0.3], [x, y + s * 0.9]]);
        ctx.strokeStyle = bg;
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.9, y - s * 0.3);
        ctx.lineTo(x + s * 0.9, y - s * 0.3);
        ctx.moveTo(x - s * 0.3, y - s * 0.3);
        ctx.lineTo(x, y + s * 0.85);
        ctx.lineTo(x + s * 0.3, y - s * 0.3);
        ctx.stroke();
        break;
      case 'flower':
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * s * 0.52, y + Math.sin(a) * s * 0.52, s * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = C.gold;
        ctx.beginPath();
        ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'crown':
        poly(ctx, [[x - s * 0.85, y + s * 0.6], [x - s * 0.85, y - s * 0.35], [x - s * 0.42, y + s * 0.05],
          [x, y - s * 0.6], [x + s * 0.42, y + s * 0.05], [x + s * 0.85, y - s * 0.35], [x + s * 0.85, y + s * 0.6]]);
        [[-0.85, -0.48], [0, -0.75], [0.85, -0.48]].forEach(([dx, dy]) => {
          ctx.beginPath();
          ctx.arc(x + dx * s, y + dy * s, s * 0.14, 0, Math.PI * 2);
          ctx.fill();
        });
        break;
      case 'key':
        ctx.lineWidth = s * 0.2;
        ctx.arc(x - s * 0.5, y, s * 0.34, 0, Math.PI * 2);
        ctx.moveTo(x - s * 0.16, y);
        ctx.lineTo(x + s * 0.9, y);
        ctx.moveTo(x + s * 0.5, y);
        ctx.lineTo(x + s * 0.5, y + s * 0.35);
        ctx.moveTo(x + s * 0.8, y);
        ctx.lineTo(x + s * 0.8, y + s * 0.42);
        ctx.stroke();
        break;
      case 'anchor':
        ctx.lineWidth = s * 0.16;
        ctx.arc(x, y - s * 0.72, s * 0.2, 0, Math.PI * 2);
        ctx.moveTo(x, y - s * 0.52);
        ctx.lineTo(x, y + s * 0.85);
        ctx.moveTo(x - s * 0.42, y - s * 0.25);
        ctx.lineTo(x + s * 0.42, y - s * 0.25);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y + s * 0.15, s * 0.7, Math.PI * 0.12, Math.PI * 0.88);
        ctx.stroke();
        poly(ctx, [[x + s * 0.88, y + s * 0.05], [x + s * 0.5, y + s * 0.3], [x + s * 0.82, y + s * 0.5]]);
        poly(ctx, [[x - s * 0.88, y + s * 0.05], [x - s * 0.5, y + s * 0.3], [x - s * 0.82, y + s * 0.5]]);
        break;
      case 'leaf':
        ctx.moveTo(x - s * 0.75, y + s * 0.75);
        ctx.quadraticCurveTo(x - s * 0.85, y - s * 0.85, x + s * 0.8, y - s * 0.8);
        ctx.quadraticCurveTo(x + s * 0.85, y + s * 0.85, x - s * 0.75, y + s * 0.75);
        ctx.fill();
        ctx.strokeStyle = bg;
        ctx.lineWidth = s * 0.08;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.62, y + s * 0.62);
        ctx.lineTo(x + s * 0.5, y - s * 0.5);
        ctx.stroke();
        break;
      case 'drop':
        ctx.moveTo(x, y - s);
        ctx.quadraticCurveTo(x + s * 0.75, y - s * 0.1, x + s * 0.68, y + s * 0.3);
        ctx.arc(x, y + s * 0.3, s * 0.68, 0, Math.PI);
        ctx.quadraticCurveTo(x - s * 0.75, y - s * 0.1, x, y - s);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(x - s * 0.28, y + s * 0.35, s * 0.14, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'sun':
        ctx.arc(x, y, s * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = s * 0.14;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          ctx.moveTo(x + Math.cos(a) * s * 0.64, y + Math.sin(a) * s * 0.64);
          ctx.lineTo(x + Math.cos(a) * s * 0.95, y + Math.sin(a) * s * 0.95);
        }
        ctx.stroke();
        break;
      case 'note':
        ctx.ellipse(x - s * 0.45, y + s * 0.58, s * 0.3, s * 0.21, -0.4, 0, Math.PI * 2);
        ctx.ellipse(x + s * 0.5, y + s * 0.42, s * 0.3, s * 0.21, -0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = s * 0.12;
        ctx.beginPath();
        ctx.moveTo(x - s * 0.18, y + s * 0.52);
        ctx.lineTo(x - s * 0.18, y - s * 0.62);
        ctx.moveTo(x + s * 0.77, y + s * 0.36);
        ctx.lineTo(x + s * 0.77, y - s * 0.78);
        ctx.stroke();
        poly(ctx, [[x - s * 0.24, y - s * 0.62], [x + s * 0.83, y - s * 0.86], [x + s * 0.83, y - s * 0.6],
          [x - s * 0.24, y - s * 0.36]]);
        break;
      case 'planet':
        ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(x, y, s * 0.98, s * 0.3, -0.35, 0, Math.PI * 2);
        ctx.strokeStyle = bg;
        ctx.lineWidth = s * 0.26;
        ctx.stroke();
        ctx.strokeStyle = color;
        ctx.lineWidth = s * 0.1;
        ctx.stroke();
        break;
      case 'rocket':
        ctx.fillStyle = C.p1;
        poly(ctx, [[x - s * 0.3, y], [x - s * 0.66, y + s * 0.62], [x - s * 0.28, y + s * 0.48]]);
        poly(ctx, [[x + s * 0.3, y], [x + s * 0.66, y + s * 0.62], [x + s * 0.28, y + s * 0.48]]);
        ctx.fillStyle = C.gold;
        poly(ctx, [[x - s * 0.18, y + s * 0.5], [x + s * 0.18, y + s * 0.5], [x, y + s]]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - s);
        ctx.quadraticCurveTo(x + s * 0.48, y - s * 0.5, x + s * 0.34, y + s * 0.5);
        ctx.lineTo(x - s * 0.34, y + s * 0.5);
        ctx.quadraticCurveTo(x - s * 0.48, y - s * 0.5, x, y - s);
        ctx.fill();
        ctx.fillStyle = C.p2;
        ctx.beginPath();
        ctx.arc(x, y - s * 0.22, s * 0.16, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'cloud':
        ctx.arc(x - s * 0.48, y + s * 0.18, s * 0.38, 0, Math.PI * 2);
        ctx.arc(x, y - s * 0.12, s * 0.52, 0, Math.PI * 2);
        ctx.arc(x + s * 0.5, y + s * 0.14, s * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(x - s * 0.48, y + s * 0.12, s * 0.98, s * 0.44);
        break;
      default:
        break;
    }
  }

  /* ---------- Cards, drawn centred on the origin ---------- */

  function drawBack(ctx, w, h) {
    U.roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
    ctx.fillStyle = C.violet;
    ctx.fill();
    ctx.save();
    U.roundRect(ctx, -w / 2 + 5, -h / 2 + 5, w - 10, h - 10, w * 0.09);
    ctx.clip();
    ctx.fillStyle = U.alpha(C.ink, 0.25);
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = U.alpha(C.violet, 0.9);
    ctx.lineWidth = 2;
    const step = Math.max(10, w / 5);
    ctx.beginPath();
    for (let d = -h; d < w + h; d += step) {
      ctx.moveTo(-w / 2 + d, -h / 2);
      ctx.lineTo(-w / 2 + d - h, h / 2);
      ctx.moveTo(-w / 2 + d - h, -h / 2);
      ctx.lineTo(-w / 2 + d, h / 2);
    }
    ctx.stroke();
    ctx.restore();
    const r = Math.min(w, h) * 0.17;
    ctx.fillStyle = C.ink;
    poly(ctx, [[0, -r * 1.3], [r, 0], [0, r * 1.3], [-r, 0]]);
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFace(ctx, w, h, icon, done) {
    U.roundRect(ctx, -w / 2, -h / 2, w, h, w * 0.12);
    ctx.fillStyle = C.panel;
    ctx.fill();
    ctx.strokeStyle = done ? C.mint : U.alpha(icon[1], 0.55);
    ctx.lineWidth = done ? 3 : 2;
    ctx.stroke();
    ctx.globalAlpha *= done ? 0.55 : 1;
    drawIcon(ctx, icon[0], icon[1], 0, 0, Math.min(w, h) * 0.3, C.panel);
  }

  /* f: 0 = back up, 1 = face up. The card squashes horizontally through the turn. */
  function drawCard(ctx, cx, cy, w, h, icon, f, done, scale) {
    const sx = Math.max(0.03, Math.abs(1 - 2 * f));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(sx * scale, scale);
    if (f > 0.5) drawFace(ctx, w, h, icon, done);
    else drawBack(ctx, w, h);
    ctx.restore();
  }

  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  Arcade.register({
    id: 'memory-match',
    title: 'Memory Match',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.violet,
    tagline: 'Flip cards two at a time and find every pair.',
    hook: 'Every miss makes two hidden cards swap places, so watch closely.',
    tags: ['classic', 'memory', 'cards', 'puzzle', 'touch'],
    howTo: 'Flip two cards per turn. Matching pictures stay face up. When you miss, both flip back and ' +
      'two hidden cards slide across the table to swap places (two swaps on Hard), so follow them with ' +
      'your eyes. Three matches in a row earn a peek that shows every hidden card for a second. Streaks ' +
      'score extra, misses cost a little, and a quick finish adds a time bonus.',
    controls: [
      { keys: ['Click'], label: 'Flip a card' },
      { keys: ['↑', '↓', '←', '→'], label: 'Move the cursor' },
      { keys: ['Enter', 'Space'], label: 'Flip the card at the cursor' },
      { keys: ['P'], label: 'Use a peek' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const cols = 5;
      const rows = 3;
      const gap = 9;
      const ch = (h - 20 - gap * (rows - 1)) / rows;
      const cw = Math.min(ch * 0.8, (w - 30 - gap * (cols - 1)) / cols);
      const x0 = (w - (cw * cols + gap * (cols - 1))) / 2;
      const y0 = (h - (ch * rows + gap * (rows - 1))) / 2;
      const pos = (s) => ({ x: x0 + (s % cols) * (cw + gap) + cw / 2, y: y0 + Math.floor(s / cols) * (ch + gap) + ch / 2 });
      const faces = { 1: ICONS[0], 8: ICONS[2], 12: ICONS[0] };
      const A = 5;
      const B = 9;
      for (let s = 0; s < cols * rows; s++) {
        const p = pos(s);
        if (s === A || s === B) {
          ctx.strokeStyle = U.alpha(C.gold, 0.5);
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          U.roundRect(ctx, p.x - cw / 2, p.y - ch / 2, cw, ch, 6);
          ctx.stroke();
          ctx.setLineDash([]);
          continue;
        }
        drawCard(ctx, p.x, p.y, cw, ch, faces[s] || ICONS[0], faces[s] ? 1 : 0, s === 1 || s === 12, 1);
      }
      // Two hidden cards arcing past each other.
      const pa = pos(A);
      const pb = pos(B);
      const e = ease((t * 0.45 + 0.4) % 1);
      const nx = -(pb.y - pa.y);
      const ny = pb.x - pa.x;
      const len = Math.hypot(nx, ny) || 1;
      ctx.strokeStyle = U.alpha(C.gold, 0.35);
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 5]);
      [1, -1].forEach((side) => {
        ctx.beginPath();
        for (let i = 0; i <= 20; i++) {
          const k = i / 20;
          const lift = Math.sin(Math.PI * k) * side * 0.26 * len;
          const x = U.lerp(pa.x, pb.x, k) + (nx / len) * lift;
          const y = U.lerp(pa.y, pb.y, k) + (ny / len) * lift;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        }
        ctx.stroke();
      });
      ctx.setLineDash([]);
      [[pa, pb, 1], [pb, pa, -1]].forEach(([from, to, side]) => {
        const lift = Math.sin(Math.PI * e) * side * 0.26 * len;
        const x = U.lerp(from.x, to.x, e) + (nx / len) * lift;
        const y = U.lerp(from.y, to.y, e) + (ny / len) * lift;
        ctx.shadowColor = C.gold;
        ctx.shadowBlur = 12;
        drawCard(ctx, x, y, cw, ch, ICONS[0], 0, false, 1 + 0.15 * Math.sin(Math.PI * e));
        ctx.shadowBlur = 0;
      });
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let level = LEVELS.normal;
      let levelKey = 'normal';
      let swapping = false;
      let state = 'menu';    // 'menu' | 'play' | 'over'
      let cards = [];        // { icon, slot, state: 'down' | 'up' | 'done', f, anim, wiggle, glow }
      let slots = [];        // slot -> card index
      let layout = null;
      let first = -1;
      let lock = false;
      let peeking = false;
      let moves = 0;
      let found = 0;
      let streak = 0;
      let peeks = 0;
      let score = 0;
      let time = 0;
      let timing = false;
      let round = 0;
      let cursor = 0;
      let hover = -1;
      let keyMode = false;
      let hint = '';
      let hintT = 0;
      let lastStatus = '';
      let swappedOnce = false;
      let pops = [];
      let bits = [];
      let pulse = 0;
      const peekBtn = { x: W - 196, y: 13, w: 176, h: 40 };

      function makeLayout(lv) {
        const areaW = W - 40;
        const areaH = H - TOP - 16;
        const cw = Math.min((areaW - GAP * (lv.cols - 1)) / lv.cols, ((areaH - GAP * (lv.rows - 1)) / lv.rows) * 0.8);
        const ch = cw / 0.8;
        const gw = cw * lv.cols + GAP * (lv.cols - 1);
        const gh = ch * lv.rows + GAP * (lv.rows - 1);
        return { cw, ch, x0: (W - gw) / 2, y0: TOP + (areaH - gh) / 2 + 4 };
      }

      function slotCenter(s) {
        return {
          x: layout.x0 + (s % level.cols) * (layout.cw + GAP) + layout.cw / 2,
          y: layout.y0 + Math.floor(s / level.cols) * (layout.ch + GAP) + layout.ch / 2
        };
      }

      function say(text, secs) {
        hint = text;
        hintT = secs || 3;
      }

      function showLevelMenu() {
        state = 'menu';
        api.setStatus('Find every pair. Each miss swaps two hidden cards.');
        api.menu({
          title: 'Memory Match',
          text: 'Flip two cards at a time to find pairs. Every miss makes two hidden cards swap places, ' +
            'so keep your eyes on them. Three matches in a row earn a peek.',
          buttons: [
            { label: 'Easy · 6 pairs', onClick: () => startGame('easy') },
            { label: 'Normal · 8 pairs', primary: true, onClick: () => startGame('normal') },
            { label: 'Hard · 15 pairs', onClick: () => startGame('hard') }
          ]
        });
      }

      function startGame(key) {
        round++;
        level = LEVELS[key];
        levelKey = key;
        layout = makeLayout(level);
        const n = (level.cols * level.rows) / 2;
        const icons = U.shuffle(ICONS.slice()).slice(0, n);
        const deck = U.shuffle(icons.concat(icons));
        cards = deck.map((icon, i) => ({ icon, slot: i, state: 'down', f: 0, anim: null, wiggle: 0, glow: 0 }));
        slots = cards.map((c, i) => i);
        first = -1;
        lock = false;
        peeking = false;
        swapping = false;
        moves = 0;
        found = 0;
        streak = 0;
        peeks = 0;
        score = 0;
        time = 0;
        timing = false;
        cursor = 0;
        pops = [];
        bits = [];
        state = 'play';
        api.setScore(0);
        say(level.name + ': find ' + n + ' pairs. A miss swaps two hidden cards.', 4);
      }

      function canAct() {
        return state === 'play' && !lock && !api.menuOpen;
      }

      function addScore(n, at, color) {
        const before = score;
        score = Math.max(0, score + n);
        api.setScore(score);
        const shown = score - before;
        if (at && shown !== 0) pops.push({ x: at.x, y: at.y, text: (shown > 0 ? '+' : '−') + Math.abs(shown), color, life: 1 });
      }

      function sparkle(at, color, n) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = U.rand(60, 240);
          bits.push({ x: at.x, y: at.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, g: 300, rot: 0, vr: 0,
            color, life: U.rand(0.4, 0.8), max: 0.8, w: 5, h: 5 });
        }
      }

      function flip(slot) {
        if (!canAct() || slot < 0 || slot >= slots.length) return;
        const idx = slots[slot];
        const card = cards[idx];
        if (card.state !== 'down') return;
        card.state = 'up';
        timing = true;
        api.sfx('flip');
        if (first < 0) {
          first = idx;
          return;
        }
        const a = cards[first];
        const b = card;
        first = -1;
        moves++;
        lock = true;
        const token = round;
        if (a.icon === b.icon) {
          api.after(300, () => {
            if (token !== round) return;
            a.state = 'done';
            b.state = 'done';
            found++;
            streak++;
            const at = slotCenter(b.slot);
            addScore(100 * level.mult + (streak - 1) * 25 * level.mult, at, C.mint);
            sparkle(slotCenter(a.slot), a.icon[1], 12);
            sparkle(at, a.icon[1], 12);
            api.sfx('score');
            if (found === cards.length / 2) {
              finish();
              return;
            }
            lock = false;
            if (streak % 3 === 0) {
              if (peeks < MAX_PEEKS) {
                peeks++;
                api.sfx('power');
                say('Three in a row: peek earned. Press P or tap Peek.', 3.5);
              } else {
                say('Three in a row! Peeks are full, so use one.', 3);
              }
            }
          });
        } else {
          streak = 0;
          api.sfx('hit');
          a.wiggle = 0.4;
          b.wiggle = 0.4;
          addScore(-10 * level.mult, slotCenter(b.slot), C.p1);
          api.after(MISS_MS, () => {
            if (token !== round) return;
            a.state = 'down';
            b.state = 'down';
            api.after(FLIP * 2000 + 60, () => { if (token === round) startSwaps(); });
          });
        }
      }

      function startSwaps() {
        const down = U.shuffle(cards.map((c, i) => i).filter((i) => cards[i].state === 'down'));
        const n = Math.min(level.swaps, Math.floor(down.length / 2));
        if (!n) {
          lock = false;
          return;
        }
        for (let k = 0; k < n; k++) {
          const i = down[k * 2];
          const j = down[k * 2 + 1];
          const si = cards[i].slot;
          const sj = cards[j].slot;
          const pi = slotCenter(si);
          const pj = slotCenter(sj);
          cards[i].slot = sj;
          cards[j].slot = si;
          slots[si] = j;
          slots[sj] = i;
          cards[i].anim = { from: pi, to: pj, t: 0 };
          cards[j].anim = { from: pj, to: pi, t: 0 };
        }
        swapping = true;
        api.sfx('tick');
        if (!swappedOnce) {
          swappedOnce = true;
          say('Miss! Two hidden cards just swapped places. Follow them.', 4);
        } else {
          say(n > 1 ? 'Miss: two swaps. Keep watching.' : 'Miss: two cards swapped.', 2);
        }
      }

      function peek() {
        if (!canAct()) return;
        if (!peeks) {
          api.sfx('hit');
          say('No peeks yet. Make three matches in a row to earn one.', 3);
          return;
        }
        peeks--;
        peeking = true;
        lock = true;
        api.sfx('power');
        const token = round;
        api.after(FLIP * 1000 + PEEK_MS, () => {
          if (token !== round) return;
          peeking = false;
          api.after(FLIP * 2000, () => { if (token === round) lock = false; });
        });
      }

      function finish() {
        state = 'over';
        lock = true;
        timing = false;
        const bonus = Math.max(0, Math.ceil(level.par - time)) * 5 * level.mult;
        if (bonus) addScore(bonus, { x: W / 2, y: H / 2 }, C.gold);
        api.sfx('win');
        for (let i = 0; i < 140; i++) {
          bits.push({ x: U.rand(0, W), y: U.rand(-200, -10), vx: U.rand(-60, 60), vy: U.rand(60, 220), g: 120,
            rot: U.rand(0, 6), vr: U.rand(-8, 8), color: U.pick([C.p1, C.p2, C.gold, C.mint, C.violet]),
            life: U.rand(2.5, 4), max: 1, w: U.rand(6, 10), h: U.rand(3, 6) });
        }
        const isBest = api.reportScore(score);
        const token = round;
        api.after(1500, () => {
          if (token !== round) return;
          api.menu({
            title: isBest ? 'New best: ' + score + '!' : 'All pairs found',
            text: level.name + ': ' + moves + ' moves in ' + clock(time) + '. Time bonus +' + bonus +
              '. Score ' + score + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(levelKey) },
              { label: 'Change difficulty', onClick: showLevelMenu }
            ]
          });
        });
      }

      function slotAt(x, y) {
        if (!layout) return -1;
        const c = Math.floor((x - layout.x0) / (layout.cw + GAP));
        const r = Math.floor((y - layout.y0) / (layout.ch + GAP));
        if (c < 0 || c >= level.cols || r < 0 || r >= level.rows) return -1;
        const lx = x - layout.x0 - c * (layout.cw + GAP);
        const ly = y - layout.y0 - r * (layout.ch + GAP);
        return lx <= layout.cw && ly <= layout.ch ? r * level.cols + c : -1;
      }

      function onPeekBtn(p) {
        return p.x >= peekBtn.x && p.x <= peekBtn.x + peekBtn.w && p.y >= peekBtn.y && p.y <= peekBtn.y + peekBtn.h;
      }

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        hover = state === 'play' ? slotAt(p.x, p.y) : -1;
        keyMode = false;
      });
      api.on(canvas, 'pointerleave', () => { hover = -1; });
      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const p = api.toCanvas(e, canvas);
        keyMode = false;
        if (onPeekBtn(p)) {
          peek();
          return;
        }
        const s = slotAt(p.x, p.y);
        if (s >= 0) {
          cursor = s;
          flip(s);
        }
      });
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || api.menuOpen) return;
        const d = ARROWS[e.code];
        if (d) {
          keyMode = true;
          const c = U.clamp((cursor % level.cols) + d[0], 0, level.cols - 1);
          const r = U.clamp(Math.floor(cursor / level.cols) + d[1], 0, level.rows - 1);
          cursor = r * level.cols + c;
        } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
          keyMode = true;
          flip(cursor);
        } else if (e.code === 'KeyP') {
          peek();
        }
      });

      function update(dt) {
        pulse += dt;
        if (state === 'play' && timing) time += dt;
        hintT = Math.max(0, hintT - dt);
        for (const c of cards) {
          const target = c.state !== 'down' || peeking ? 1 : 0;
          c.f = target > c.f ? Math.min(target, c.f + dt / (FLIP * 2)) : Math.max(target, c.f - dt / (FLIP * 2));
          c.wiggle = Math.max(0, c.wiggle - dt);
          c.glow = Math.max(0, c.glow - dt);
        }
        let moving = false;
        for (const c of cards) {
          if (!c.anim) continue;
          c.anim.t += dt / SWAP;
          if (c.anim.t >= 1) {
            c.anim = null;
            c.glow = 0.6;
          } else moving = true;
        }
        if (swapping && !moving) {
          swapping = false;
          if (state === 'play') lock = false;
        }
        pops.forEach((p) => { p.life -= dt; p.y -= 40 * dt; });
        pops = pops.filter((p) => p.life > 0);
        bits.forEach((b) => {
          b.life -= dt;
          b.vy += b.g * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.rot += b.vr * dt;
        });
        bits = bits.filter((b) => b.life > 0 && b.y < H + 20);

        if (state === 'play' || state === 'over') {
          const base = 'Moves ' + moves + ' · ' + clock(time) + (streak > 1 ? ' · streak ' + streak : '');
          const text = hintT > 0 ? hint + '  (' + base + ')' : base;
          if (text !== lastStatus) {
            lastStatus = text;
            api.setStatus(text);
          }
        }
      }

      function drawHud() {
        ctx.font = FONT;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.text;
        ctx.fillText('Pairs ' + found + '/' + cards.length / 2, 22, 33);
        // Streak progress toward the next peek.
        ctx.fillStyle = C.muted;
        ctx.fillText('Next peek', 190, 33);
        const prog = streak % 3;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(292 + i * 20, 33, 6, 0, Math.PI * 2);
          if (i < prog) {
            ctx.fillStyle = C.mint;
            ctx.fill();
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
        const b = peekBtn;
        const ready = peeks > 0 && canAct();
        U.roundRect(ctx, b.x, b.y, b.w, b.h, 12);
        ctx.fillStyle = peeking ? C.violet : ready ? C.panel2 : C.panel;
        ctx.fill();
        ctx.strokeStyle = peeks > 0 ? U.alpha(C.violet, 0.65 + 0.35 * Math.sin(pulse * 4)) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = peeks > 0 ? C.text : C.muted;
        ctx.fillText('Peek (P)', b.x + 16, b.y + b.h / 2 + 1);
        for (let i = 0; i < MAX_PEEKS; i++) {
          ctx.beginPath();
          ctx.arc(b.x + b.w - 42 + i * 20, b.y + b.h / 2, 6, 0, Math.PI * 2);
          if (i < peeks) {
            ctx.fillStyle = C.gold;
            ctx.fill();
          } else {
            ctx.strokeStyle = C.line;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        if (state === 'menu' || !layout) {
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.violet, 0.25);
          ctx.fillText('Memory Match', W / 2, H / 2);
          return;
        }
        drawHud();
        const { cw, ch } = layout;
        // Empty slots under moving cards, so the swap reads clearly.
        for (let s = 0; s < slots.length; s++) {
          const p = slotCenter(s);
          ctx.strokeStyle = U.alpha(C.line, 0.7);
          ctx.lineWidth = 2;
          U.roundRect(ctx, p.x - cw / 2, p.y - ch / 2, cw, ch, cw * 0.12);
          ctx.stroke();
        }
        const order = cards.map((c, i) => i).sort((a, b) => (cards[a].anim ? 1 : 0) - (cards[b].anim ? 1 : 0));
        for (const i of order) {
          const c = cards[i];
          let p = slotCenter(c.slot);
          let scale = 1;
          if (c.anim) {
            const e = ease(c.anim.t);
            const dx = c.anim.to.x - c.anim.from.x;
            const dy = c.anim.to.y - c.anim.from.y;
            const len = Math.hypot(dx, dy) || 1;
            const lift = Math.sin(Math.PI * e) * Math.min(120, len * 0.3);
            // Both cards bend to the same side of their own path, so they pass on opposite sides.
            p = { x: U.lerp(c.anim.from.x, c.anim.to.x, e) - (dy / len) * lift, y: U.lerp(c.anim.from.y, c.anim.to.y, e) + (dx / len) * lift };
            scale = 1 + 0.14 * Math.sin(Math.PI * e);
          }
          const x = p.x + Math.sin(c.wiggle * 50) * c.wiggle * 14;
          const hot = state === 'play' && c.state === 'down' && !lock &&
            ((keyMode && cursor === c.slot) || (!keyMode && hover === c.slot));
          if (c.anim || c.glow > 0) {
            ctx.shadowColor = C.gold;
            ctx.shadowBlur = 18;
          }
          drawCard(ctx, x, p.y - (hot ? 4 : 0), cw, ch, c.icon, c.f, c.state === 'done', scale * (hot ? 1.03 : 1));
          ctx.shadowBlur = 0;
          if (c.anim || c.glow > 0) {
            ctx.strokeStyle = U.alpha(C.gold, c.anim ? 0.9 : c.glow / 0.6);
            ctx.lineWidth = 3;
            U.roundRect(ctx, x - (cw * scale) / 2 - 3, p.y - (ch * scale) / 2 - 3, cw * scale + 6, ch * scale + 6, cw * 0.14);
            ctx.stroke();
          }
        }
        if (keyMode && state === 'play') {
          const p = slotCenter(cursor);
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 3;
          U.roundRect(ctx, p.x - cw / 2 - 6, p.y - ch / 2 - 6, cw + 12, ch + 12, cw * 0.16);
          ctx.stroke();
        }
        bits.forEach((b) => {
          ctx.save();
          ctx.globalAlpha = U.clamp(b.life / b.max, 0, 1);
          ctx.translate(b.x, b.y);
          ctx.rotate(b.rot);
          ctx.fillStyle = b.color;
          ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
          ctx.restore();
        });
        ctx.font = FONT;
        ctx.textAlign = 'center';
        pops.forEach((p) => {
          ctx.globalAlpha = U.clamp(p.life, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, p.x, p.y);
        });
        ctx.globalAlpha = 1;
      }

      showLevelMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
