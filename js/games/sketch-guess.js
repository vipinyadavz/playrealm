/* Sketch Guess: one-screen draw-and-guess for a room.
   The drawer secretly picks a word and draws it while everyone else shouts guesses.
   Twist: the drawer has a limited ink supply that drains with every stroke. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const PW = 800; // paper space for stored strokes
  const PH = 500;
  const TAU = Math.PI * 2;
  const INK = '#0B0B1A';
  const PAPER = '#FFFFFF';
  const F_TITLE = (s) => '800 ' + s + 'px Unbounded, sans-serif';
  const F_LABEL = (s) => '600 ' + s + 'px "JetBrains Mono", monospace';
  const F_BODY = (s, w) => (w || 600) + ' ' + s + 'px Figtree, sans-serif';
  const INK_COLORS = ['#0B0B1A', '#FF5D73', '#FF9A3D', '#2FBF7F', '#36A3F0', '#8E6BFF'];
  const SIZES = [6, 16];
  const SIZE_COST = [1, 2]; // thick lines drink ink twice as fast
  const INK_MAX = 5200; // paper units of thin line
  const REFILL = 0.3;
  const SEAT_COLORS = [C.p1, C.p2, C.gold, C.mint, C.violet, '#FF9A3D', '#F06BD0', '#7FD1FF'];

  const EASY = ('sun moon star tree house cat dog fish bird apple banana car boat ball hat cup book key door bed cake egg ' +
    'eye hand foot nose ear flower heart cloud rain snow fire kite drum shoe sock bell box lamp chair table bus train ' +
    'plane duck frog pig cow bee ant snail worm spider snake mouse owl pizza cookie candle ladder pencil clock phone ' +
    'smile rainbow umbrella balloon glasses crown ring bone carrot grapes cherry lemon pear leaf mushroom window ghost ' +
    'robot bread cheese milk spoon fork bowl sandwich hammer brush comb towel button star ' +
    'tooth hair lips shirt pants dress mitten scarf boot bucket shovel flag tent rock wave island volcano bubble ' +
    'turtle rabbit horse sheep lion tiger bear whale shark crab octopus jellyfish').split(' ');
  const MEDIUM = ('rocket castle penguin giraffe elephant snowman pirate mermaid lighthouse cactus igloo campfire ' +
    'waterfall windmill tractor helicopter submarine skateboard bicycle guitar piano trumpet camera backpack hamburger ' +
    'popcorn cupcake donut toaster teapot bathtub toothbrush scissors magnet telescope treasure map anchor parachute ' +
    'dinosaur unicorn kangaroo crocodile starfish seahorse peacock flamingo hedgehog squirrel bat spaceship astronaut ' +
    'alien wizard king queen knight superhero scarecrow snowflake tornado lightning planet comet mountain desert ' +
    'pyramid statue fountain bridge zebra koala panda gorilla camel llama parrot butterfly ladybug caterpillar dragon ' +
    'mailbox doghouse treehouse sailboat train-track firetruck ambulance stroller wheelbarrow lawnmower vacuum ' +
    'microphone headphones keyboard robot-dog paintbrush crayon envelope present trophy medal tiara mask ' +
    'pineapple watermelon strawberry pumpkin corn broccoli pancake waffle spaghetti taco hotdog pretzel ' +
    'snowboard surfboard swing slide trampoline sandcastle beehive spiderweb nest cocoon acorn').split(' ').map((w) => w.replace(/-/g, ' '));
  const HARD_PHRASES = [
    'homework', 'gravity', 'birthday', 'vacation', 'fireworks', 'traffic jam', 'time machine', 'echo', 'shadow',
    'reflection', 'recycling', 'invisible', 'nightmare', 'applause', 'sunrise', 'sunset', 'earthquake', 'hiccup',
    'sneeze', 'yawn', 'tickle', 'music', 'dance', 'wish', 'dream', 'teamwork', 'camping', 'snowball fight',
    'treasure hunt', 'hide and seek', 'tug of war', 'magic trick', 'surprise party', 'haircut', 'balance', 'puzzle',
    'weekend', 'invention', 'library', 'museum', 'orchestra', 'laundry', 'breakfast', 'sunburn', 'high five',
    'thumbs up', 'cartwheel', 'juggling', 'quicksand', 'hibernation', 'migration', 'avalanche', 'constellation',
    'black hole', 'eclipse', 'sleepwalking', 'daydream', 'thunderstorm', 'fog', 'heatwave', 'rush hour', 'picnic',
    'parade', 'circus', 'aquarium', 'playground', 'roller coaster', 'ferris wheel', 'hot air balloon', 'carousel',
    'bowling', 'karate', 'yoga', 'marathon', 'relay race', 'high jump', 'tightrope', 'piggy bank', 'alarm clock',
    'bubble bath', 'pillow fight', 'bedtime story', 'lullaby', 'jigsaw', 'dominoes', 'chess', 'mirror maze',
    'haunted house', 'spring cleaning', 'garage sale', 'lemonade stand', 'bake sale', 'field trip', 'fire drill',
    'loose tooth', 'brain freeze', 'stage fright', 'shooting star', 'full moon', 'solar system', 'double rainbow',
    'pen pal', 'best friends', 'twins', 'family photo', 'selfie', 'zigzag', 'spiral', 'upside down', 'inside out',
    'snow day', 'sick day', 'sleepover', 'tooth fairy', 'sandstorm', 'jet lag', 'treasure map', 'sunglasses'
  ];
  const TIERS = [
    { name: 'Easy', color: C.mint, words: Array.from(new Set(EASY)) },
    { name: 'Medium', color: C.gold, words: Array.from(new Set(MEDIUM)) },
    { name: 'Hard', color: C.p1, words: Array.from(new Set(HARD_PHRASES)) }
  ];

  /* ---------- Pure drawing helpers ---------- */
  function drawStroke(c, s, ox, oy, k) {
    const p = s.pts;
    const n = p.length >> 1;
    if (!n) return;
    const lw = Math.max(0.6, s.size * k);
    c.strokeStyle = s.color;
    c.fillStyle = s.color;
    if (n === 1) {
      c.beginPath();
      c.arc(ox + p[0] * k, oy + p[1] * k, lw / 2, 0, TAU);
      c.fill();
      return;
    }
    c.lineWidth = lw;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    c.beginPath();
    c.moveTo(ox + p[0] * k, oy + p[1] * k);
    if (n === 2) {
      c.lineTo(ox + p[2] * k, oy + p[3] * k);
    } else {
      for (let i = 1; i < n - 1; i++) {
        const x1 = ox + p[i * 2] * k;
        const y1 = oy + p[i * 2 + 1] * k;
        const x2 = ox + p[i * 2 + 2] * k;
        const y2 = oy + p[i * 2 + 3] * k;
        c.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      c.lineTo(ox + p[(n - 1) * 2] * k, oy + p[(n - 1) * 2 + 1] * k);
    }
    c.stroke();
  }

  function drawStrokes(c, strokes, ox, oy, k) {
    for (const s of strokes) drawStroke(c, s, ox, oy, k);
  }

  function wrapLines(c, str, maxW) {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (!line || c.measureText(test).width <= maxW) line = test;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  function fitFont(c, str, maxW, sizes, fontFn) {
    for (const s of sizes) {
      c.font = fontFn(s);
      if (c.measureText(str).width <= maxW) return s;
    }
    return sizes[sizes.length - 1];
  }

  /* Ink tank: vertical tube with a wavy liquid surface. */
  function drawTank(c, x, y, w, h, frac, t, liquid) {
    c.fillStyle = 'rgba(0,0,0,.35)';
    U.roundRect(c, x + 3, y + 4, w, h, w / 2);
    c.fill();
    c.fillStyle = C.panel;
    U.roundRect(c, x, y, w, h, w / 2);
    c.fill();
    c.save();
    U.roundRect(c, x + 5, y + 5, w - 10, h - 10, (w - 10) / 2);
    c.clip();
    const level = y + 5 + (h - 10) * (1 - U.clamp(frac, 0, 1));
    c.fillStyle = liquid;
    c.beginPath();
    c.moveTo(x, y + h);
    for (let i = 0; i <= 12; i++) {
      const xx = x + (w * i) / 12;
      c.lineTo(xx, level + Math.sin(t * 4 + i * 0.9) * 3);
    }
    c.lineTo(x + w, y + h);
    c.closePath();
    c.fill();
    c.fillStyle = 'rgba(255,255,255,.25)';
    c.fillRect(x + 9, level + 6, 5, Math.max(0, y + h - level - 18));
    c.restore();
    c.strokeStyle = C.line;
    c.lineWidth = 3;
    U.roundRect(c, x, y, w, h, w / 2);
    c.stroke();
  }

  Arcade.register({
    id: 'sketch-guess',
    title: 'Sketch Guess',
    category: 'party',
    mode: 'together',
    players: '2–8P',
    best: false,
    color: C.gold,
    tagline: 'One player draws a secret word while the whole room shouts guesses.',
    hook: "The drawer's ink runs out as they draw, so every stroke counts.",
    tags: ['party', 'drawing', 'words', 'guessing', 'groups', 'family', 'touch', 'one screen'],
    howTo: 'For 2 to 8 people around one screen. On your turn, only you look while you pick one of three secret words: ' +
      'easy, medium or hard. Then everyone watches you draw and shouts guesses. The word shows as blanks, and a letter ' +
      'appears at half time and again at three quarters. When someone gets it, tap their name: the faster the guess, the ' +
      'more points they get (up to 100), and you get 50 for each correct guesser. The twist: your ink tank drains as you ' +
      'draw (thick lines drink twice as fast) and undo or clear never give it back. Each hint letter refills 30%.',
    controls: [
      { keys: ['Mouse', 'Touch'], label: 'Draw on the paper' },
      { keys: ['1', '2', '3'], label: 'Pick the easy, medium or hard word' },
      { keys: ['1–6'], label: 'Pick an ink color while drawing' },
      { keys: ['X'], label: 'Thin or thick brush' },
      { keys: ['Z'], label: 'Undo the last stroke (no ink back)' },
      { keys: ['Hold P'], label: 'Peek at your word' },
      { keys: ['Enter'], label: 'Start drawing' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w * 0.4, h * 0.5, 10, w * 0.4, h * 0.5, w * 0.7);
      g.addColorStop(0, U.alpha(C.gold, 0.28));
      g.addColorStop(1, U.alpha(C.gold, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Paper with a rocket doodle that draws in while the tank drains.
      const px = 18;
      const py = 46;
      const pw = 216;
      const ph = 135;
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      U.roundRect(ctx, px + 4, py + 5, pw, ph, 12);
      ctx.fill();
      ctx.fillStyle = PAPER;
      U.roundRect(ctx, px, py, pw, ph, 12);
      ctx.fill();
      const cyc = t === 0 ? 0.62 : (t % 5) / 5;
      const k = pw / PW;
      const rocket = [
        { color: INK, size: 12, pts: [400, 70, 470, 170, 470, 330, 330, 330, 330, 170, 400, 70] },
        { color: '#36A3F0', size: 12, pts: [400, 200, 430, 215, 435, 245, 400, 262, 365, 245, 370, 215, 400, 200] },
        { color: INK, size: 12, pts: [330, 260, 270, 350, 330, 330] },
        { color: INK, size: 12, pts: [470, 260, 530, 350, 470, 330] },
        { color: '#FF5D73', size: 16, pts: [360, 345, 380, 420, 400, 370, 420, 430, 440, 345] }
      ];
      const total = rocket.reduce((a, r) => a + (r.pts.length >> 1), 0);
      let left = total * U.clamp(cyc / 0.62, 0, 1);
      for (const r of rocket) {
        if (left <= 0) break;
        const n = r.pts.length >> 1;
        const take = Math.min(n, Math.ceil(left));
        drawStroke(ctx, { color: r.color, size: r.size, pts: r.pts.slice(0, take * 2) }, px, py, k);
        left -= n;
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      U.roundRect(ctx, px, py, pw, ph, 12);
      ctx.stroke();
      // Blanks with one revealed letter.
      ctx.font = '700 18px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const word = 'R _ _ _ _ T';
      ctx.fillStyle = C.text;
      ctx.fillText(word, px + 4, 26);
      // Ink tank draining.
      const frac = t === 0 ? 0.32 : 1 - ((t % 5) / 5) * 0.85;
      drawTank(ctx, 252, 22, 50, 160, frac, t, frac < 0.25 ? C.p1 : C.gold);
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = C.text;
      ctx.fillText('INK', 277, 194 - 2);
      // Shout bubbles.
      ctx.fillStyle = C.p2;
      U.roundRect(ctx, 160, 14, 74, 26, 13);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = '800 13px Figtree, sans-serif';
      ctx.fillText('rocket!', 197, 28);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const P = { x: 20, y: 84, w: 672, h: 420 };
      const PK = P.w / PW;
      const TANK = { x: 708, y: 84, w: 58, h: 420 };

      /* ---------- State ---------- */
      let phase = 'setup'; // setup | names | cover | pick | ready | countdown | draw | turnEnd | podium
      let count = 4;
      let rounds = 2;
      let drawTime = 80;
      let savedNames = [];
      let players = []; // { name, score, gained }
      let turnIdx = 0;
      let usedWords = new Set();
      let choices = [];
      let word = '';
      let tier = 0;
      let revealed = new Set();
      let hintsShown = 0;
      let timeLeft = 0;
      let lastSec = -1;
      let marked = new Map(); // player index -> points
      let endingT = -1;
      let ink = INK_MAX;
      let inkShown = INK_MAX;
      let refillFx = 0;
      let dryFx = 0;
      let inkHinted = false;
      let peekPointer = null;
      let clock = 0;
      let phaseT = 0;
      let hits = [];
      let pointer = { x: -999, y: -999, over: false };
      let toast = null;
      let confetti = [];
      // Drawing
      let strokes = [];
      let undoStack = [];
      let cur = null;
      let curPointer = null;
      let colorIdx = 0;
      let sizeIdx = 0;
      let paperCache = null;
      let paperDirty = true;

      const N = () => players.length;
      const drawer = () => turnIdx % Math.max(1, N());
      const roundNo = () => Math.floor(turnIdx / Math.max(1, N())) + 1;
      const totalTurns = () => rounds * N();
      const seatColor = (p) => SEAT_COLORS[p % SEAT_COLORS.length];
      const guessers = () => players.map((_, i) => i).filter((i) => i !== drawer());

      /* ---------- DOM inputs (names only) ---------- */
      const inputs = {};

      function getInput(key, maxLen) {
        let r = inputs[key];
        if (!r) {
          const el = document.createElement('input');
          el.type = 'text';
          el.setAttribute('autocomplete', 'off');
          el.setAttribute('autocapitalize', 'off');
          el.setAttribute('autocorrect', 'off');
          el.setAttribute('spellcheck', 'false');
          el.setAttribute('enterkeyhint', 'next');
          el.spellcheck = false;
          el.className = 'sketch-guess-input';
          const s = el.style;
          s.position = 'absolute';
          s.boxSizing = 'border-box';
          s.margin = '0';
          s.padding = '0 14px';
          s.background = '#FFFFFF';
          s.color = INK;
          s.border = '3px solid #0B0B1A';
          s.borderRadius = '12px';
          s.font = "700 18px 'Figtree', sans-serif";
          s.outline = 'none';
          s.boxShadow = '4px 4px 0 rgba(0,0,0,.45)';
          s.zIndex = '1';
          s.display = 'none';
          stage.appendChild(el);
          r = { el, x: 0, y: 0, w: 100, h: 50, visible: false, onEnter: null };
          api.on(el, 'keydown', (e) => {
            if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') {
              e.preventDefault();
              if (r.onEnter) r.onEnter();
            }
          });
          inputs[key] = r;
        }
        r.el.maxLength = maxLen;
        r.el.setAttribute('maxlength', String(maxLen));
        return r;
      }

      function showInput(r, x, y, w, h, placeholder, value, onEnter) {
        r.x = x; r.y = y; r.w = w; r.h = h;
        r.onEnter = onEnter || null;
        r.el.placeholder = placeholder || '';
        r.el.setAttribute('placeholder', placeholder || '');
        r.el.value = value || '';
        r.visible = true;
        r.el.style.display = 'block';
        layoutInputs();
      }

      function hideInputs() {
        for (const k in inputs) {
          const r = inputs[k];
          if (!r.visible) continue;
          r.visible = false;
          r.el.style.display = 'none';
          try { if (typeof r.el.blur === 'function') r.el.blur(); } catch (e) { /* ignore */ }
        }
      }

      const valueOf = (r) => (r && typeof r.el.value === 'string' ? r.el.value : '');

      function focusInput(r, select) {
        try {
          if (typeof r.el.focus === 'function') r.el.focus({ preventScroll: true });
          if (select && typeof r.el.select === 'function') r.el.select();
        } catch (e) { /* ignore */ }
      }

      function layoutInputs() {
        let any = false;
        for (const k in inputs) if (inputs[k].visible) any = true;
        if (!any) return;
        let ox = 0;
        let oy = 0;
        let k = 1;
        let sw = W;
        let sh = H;
        try {
          const sr = stage.getBoundingClientRect();
          const cr = canvas.getBoundingClientRect();
          const w0 = stage.clientWidth || sr.width;
          const h0 = stage.clientHeight || sr.height;
          if (cr.width > 0 && w0 > 0 && h0 > 0) {
            sw = w0;
            sh = h0;
            ox = cr.left - sr.left - (stage.clientLeft || 0);
            oy = cr.top - sr.top - (stage.clientTop || 0);
            k = cr.width / W;
          }
        } catch (e) { /* keep defaults */ }
        for (const key in inputs) {
          const r = inputs[key];
          if (!r.visible) continue;
          const s = r.el.style;
          s.left = ((ox + r.x * k) / sw * 100).toFixed(3) + '%';
          s.top = ((oy + r.y * k) / sh * 100).toFixed(3) + '%';
          s.width = (r.w * k / sw * 100).toFixed(3) + '%';
          s.height = (r.h * k / sh * 100).toFixed(3) + '%';
          s.fontSize = Math.round(U.clamp(r.h * k * 0.4, 12, 18)) + 'px';
          s.padding = '0 ' + Math.round(U.clamp(14 * k, 6, 14)) + 'px';
        }
      }

      /* ---------- Canvas UI kit ---------- */
      function txt(str, x, y, font, color, align, base) {
        ctx.font = font;
        ctx.fillStyle = color;
        ctx.textAlign = align || 'left';
        ctx.textBaseline = base || 'alphabetic';
        ctx.fillText(str, x, y);
      }

      function inside(p, r) {
        return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
      }

      function button(x, y, w, h, label, opts, fn) {
        const o = opts || {};
        const r = { x, y, w, h };
        const hot = !o.disabled && pointer.over && inside(pointer, r) && !api.menuOpen;
        const lift = hot ? 2 : 0;
        ctx.globalAlpha = o.disabled ? 0.4 : 1;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        U.roundRect(ctx, x + 3, y + 4, w, h, o.r || 12);
        ctx.fill();
        ctx.fillStyle = o.color || C.panel2;
        U.roundRect(ctx, x, y - lift, w, h, o.r || 12);
        ctx.fill();
        if (o.active) {
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 3;
          ctx.stroke();
        } else if (!o.color) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (label) {
          const dark = !!o.color;
          const f = o.font || F_BODY(17, 800);
          if (o.sub) {
            txt(label, x + w / 2, y + h / 2 - lift - 8, f, o.textColor || (dark ? INK : C.text), 'center', 'middle');
            txt(o.sub, x + w / 2, y + h / 2 - lift + 12, F_LABEL(12), o.textColor || (dark ? INK : C.muted), 'center', 'middle');
          } else {
            txt(label, x + w / 2, y + h / 2 - lift + 1, f, o.textColor || (dark ? INK : C.text), 'center', 'middle');
          }
        }
        ctx.globalAlpha = 1;
        hits.push({ x, y, w, h, fn, disabled: !!o.disabled, id: o.id });
        return r;
      }

      function say(text, color) {
        toast = { text, color: color || C.gold, t: 0 };
      }

      function drawBackdrop() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.line, 0.45);
        for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x - 1, y - 1, 2, 2);
      }

      function shortName(n, max) {
        return n.length > max ? n.slice(0, max - 1) + '…' : n;
      }

      function updateScore() {
        if (!players.length) {
          api.setScore('—');
          return;
        }
        let best = 0;
        players.forEach((p, i) => { if (p.score > players[best].score) best = i; });
        const top = players[best];
        api.setScore(top.score ? shortName(top.name, 9) + ' ' + top.score : '0');
      }

      /* ---------- Setup ---------- */
      function showSetup() {
        phase = 'setup';
        hideInputs();
        players = [];
        updateScore();
        api.setStatus('Sketch Guess: one person draws, everyone else shouts guesses.');
        api.menu({
          title: 'Sketch Guess',
          text: 'One player draws a secret word, the room shouts guesses. Careful: the ink tank drains with every stroke.\nHow many players?',
          buttons: [2, 3, 4, 5, 6, 7, 8].map((n) => ({
            label: String(n),
            primary: n === count,
            onClick: () => { count = n; showRoundsMenu(); }
          }))
        });
      }

      function showRoundsMenu() {
        api.menu({
          title: 'Rounds',
          text: 'In each round, everyone draws once.',
          buttons: [1, 2, 3].map((n) => ({
            label: n + (n === 1 ? ' round' : ' rounds'),
            primary: n === rounds,
            onClick: () => { rounds = n; showTimerMenu(); }
          })).concat([{ label: 'Back', onClick: showSetup }])
        });
      }

      function showTimerMenu() {
        api.menu({
          title: 'Drawing time',
          text: 'How long does each drawing turn last? Faster guesses score more.',
          buttons: [60, 80, 100].map((s) => ({
            label: s + ' seconds',
            primary: s === drawTime,
            onClick: () => { drawTime = s; showNamesMenu(); }
          })).concat([{ label: 'Back', onClick: showRoundsMenu }])
        });
      }

      function showNamesMenu() {
        const have = savedNames.slice(0, count).some((n) => n);
        api.menu({
          title: 'Who is playing?',
          text: have
            ? 'Keep the names from last time, edit them, or go with Player 1 to Player ' + count + '.'
            : 'Type everyone\'s name, or just play as Player 1 to Player ' + count + '.',
          buttons: (have
            ? [{ label: 'Keep names', primary: true, onClick: () => startGame(namesFrom(savedNames)) },
              { label: 'Edit names', onClick: showNames }]
            : [{ label: 'Use Player 1–' + count, primary: true, onClick: () => startGame(namesFrom([])) },
              { label: 'Type names', onClick: showNames }])
            .concat([{ label: 'Back', onClick: showTimerMenu }])
        });
      }

      function namesFrom(raw) {
        const out = [];
        for (let i = 0; i < count; i++) {
          let n = String(raw[i] || '').replace(/\s+/g, ' ').trim().slice(0, 14);
          if (!n) n = 'Player ' + (i + 1);
          let name = n;
          let k = 2;
          while (out.some((o) => o.toLowerCase() === name.toLowerCase())) name = n + ' ' + k++;
          out.push(name);
        }
        return out;
      }

      function nameSlot(i) {
        const twoCols = count > 4;
        const col = twoCols ? (i < 4 ? 0 : 1) : 0;
        const row = twoCols ? i % 4 : i;
        const x = twoCols ? (col === 0 ? 150 : 500) : 325;
        return { x, y: 150 + row * 74, w: 310, h: 48 };
      }

      function showNames() {
        phase = 'names';
        hideInputs();
        for (let i = 0; i < count; i++) {
          const r = getInput('name' + i, 14);
          const s = nameSlot(i);
          showInput(r, s.x, s.y, s.w, s.h, 'Player ' + (i + 1), savedNames[i] || '', () => {
            if (i + 1 < count) focusInput(inputs['name' + (i + 1)], true);
            else confirmNames();
          });
        }
        focusInput(inputs.name0, true);
        api.setStatus('Type a name for each player. Blank boxes keep Player 1, 2…');
      }

      function confirmNames() {
        if (phase !== 'names') return;
        const raw = [];
        for (let i = 0; i < count; i++) raw.push(valueOf(inputs['name' + i]));
        savedNames = raw;
        startGame(namesFrom(raw));
      }

      function drawNames() {
        drawBackdrop();
        txt("Who's playing?", W / 2, 70, F_TITLE(32), C.text, 'center', 'middle');
        txt('Players take turns drawing in this order. Leave a box empty to keep the default name.', W / 2, 108, F_BODY(17), C.muted, 'center', 'middle');
        for (let i = 0; i < count; i++) {
          const s = nameSlot(i);
          txt('PLAYER ' + (i + 1), s.x, s.y - 9, F_LABEL(13), seatColor(i), 'left', 'alphabetic');
        }
        button(150, 500, 160, 54, 'Back', {}, () => { hideInputs(); showNamesMenu(); });
        button(650, 500, 160, 54, 'Start', { color: C.gold }, confirmNames);
      }

      /* ---------- Game flow ---------- */
      function startGame(names) {
        players = names.map((name) => ({ name, score: 0, gained: 0 }));
        turnIdx = 0;
        usedWords = new Set();
        inkHinted = false;
        confetti = [];
        updateScore();
        api.sfx('power');
        showCover();
      }

      function showCover() {
        phase = 'cover';
        phaseT = 0;
        hideInputs();
        strokes = [];
        cur = null;
        paperDirty = true;
        const d = players[drawer()];
        api.setStatus('Round ' + roundNo() + ' of ' + rounds + ': ' + d.name + ' draws next.');
        api.sfx('flip');
        api.menu({
          title: 'Only ' + d.name + ' looks',
          text: d.name + ', take the device and keep the screen to yourself while you pick a secret word. Everyone else, look away for a moment.',
          buttons: [{ label: "I'm " + d.name + ', show my words', primary: true, onClick: beginPick }]
        });
      }

      function pickWord(t) {
        const pool = TIERS[t].words.filter((w) => !usedWords.has(w));
        return U.pick(pool.length ? pool : TIERS[t].words);
      }

      function beginPick() {
        phase = 'pick';
        phaseT = 0;
        choices = [pickWord(0), pickWord(1), pickWord(2)];
        api.setStatus(players[drawer()].name + ': pick a word to draw. Keep it secret!');
      }

      function choose(t) {
        if (phase !== 'pick') return;
        tier = t;
        word = choices[t];
        phase = 'ready';
        phaseT = 0;
        api.sfx('blip');
        api.setStatus('Remember your word. Show everyone the screen, then tap Start drawing.');
      }

      function startCountdown() {
        if (phase !== 'ready') return;
        usedWords.add(word);
        phase = 'countdown';
        phaseT = 0;
        strokes = [];
        undoStack = [];
        cur = null;
        curPointer = null;
        paperDirty = true;
        revealed = new Set();
        hintsShown = 0;
        marked = new Map();
        endingT = -1;
        ink = INK_MAX;
        inkShown = INK_MAX;
        refillFx = 0;
        dryFx = 0;
        colorIdx = 0;
        sizeIdx = 0;
        timeLeft = drawTime;
        lastSec = -1;
        peekPointer = null;
        players.forEach((p) => { p.gained = 0; });
        api.sfx('tick');
        api.setStatus('Get ready to guess! ' + players[drawer()].name + ' is drawing.');
      }

      function startDrawing() {
        phase = 'draw';
        phaseT = 0;
        api.sfx('power');
        api.setStatus('Shout your guesses! ' + players[drawer()].name + ', tap the name of each player who gets it.');
      }

      function letterSlots() {
        const out = [];
        for (let i = 0; i < word.length; i++) if (/[a-z]/i.test(word[i])) out.push(i);
        return out;
      }

      function revealLetter() {
        const hidden = letterSlots().filter((i) => !revealed.has(i));
        if (hidden.length <= 1) return false;
        revealed.add(U.pick(hidden));
        return true;
      }

      function giveHint() {
        hintsShown++;
        revealLetter();
        const before = ink;
        ink = Math.min(INK_MAX, ink + INK_MAX * REFILL);
        refillFx = 1.4;
        api.sfx('power');
        say(ink > before ? 'Hint letter! Ink +30%' : 'Hint letter! Your ink is already full', C.gold);
        if (!inkHinted) {
          inkHinted = true;
          api.setStatus('A letter appeared and the ink tank refilled 30%. Undo and clear never give ink back.');
        }
      }

      function guessPoints() {
        return Math.max(10, Math.round(100 * U.clamp(timeLeft / drawTime, 0, 1)));
      }

      function toggleGuesser(i) {
        if (phase !== 'draw' || i === drawer()) return;
        const d = players[drawer()];
        if (marked.has(i)) {
          const pts = marked.get(i);
          marked.delete(i);
          players[i].score -= pts;
          players[i].gained -= pts;
          d.score -= 50;
          d.gained -= 50;
          endingT = -1;
          api.sfx('hit');
          say(players[i].name + ' unmarked', C.muted);
        } else {
          const pts = guessPoints();
          marked.set(i, pts);
          players[i].score += pts;
          players[i].gained += pts;
          d.score += 50;
          d.gained += 50;
          api.sfx('score');
          say(players[i].name + ' got it! +' + pts, C.mint);
          if (marked.size >= guessers().length) {
            endingT = 1.2;
            say('Everyone got it!', C.mint);
          }
        }
        updateScore();
      }

      function endTurn(reason) {
        if (phase !== 'draw') return;
        endStroke();
        phase = 'turnEnd';
        phaseT = 0;
        peekPointer = null;
        const d = drawer();
        const got = guessers().filter((i) => marked.has(i));
        if (got.length) api.sfx('win');
        else api.sfx('lose');
        const parts = got.map((i) => players[i].name + ' +' + marked.get(i));
        if (got.length) parts.push(players[d].name + ' +' + got.length * 50 + ' for drawing');
        const last = turnIdx + 1 >= totalTurns();
        const head = reason === 'time' ? "Time's up! " : reason === 'all' ? 'Everyone got it! ' : '';
        api.setStatus(head + 'The word was "' + word + '".');
        api.menu({
          title: 'It was "' + word + '"',
          text: (got.length ? parts.join(', ') + '.' : 'Nobody got it this time.') +
            '\nInk left: ' + Math.round((ink / INK_MAX) * 100) + '%',
          buttons: [{ label: last ? 'See final scores' : 'Next turn', primary: true, onClick: nextTurn }]
        });
      }

      function nextTurn() {
        turnIdx++;
        if (turnIdx >= totalTurns()) showPodium();
        else showCover();
      }

      function ranking() {
        return players.map((p, i) => ({ i, name: p.name, score: p.score }))
          .sort((a, b) => b.score - a.score || a.i - b.i);
      }

      function showPodium() {
        phase = 'podium';
        phaseT = 0;
        confetti = [];
        for (let i = 0; i < 90; i++) {
          confetti.push({ x: U.rand(0, W), y: U.rand(-400, -10), vx: U.rand(-30, 30), vy: U.rand(80, 200), r: U.rand(0, TAU), c: SEAT_COLORS[i % SEAT_COLORS.length] });
        }
        api.sfx('win');
        updateScore();
        const r = ranking();
        api.setStatus('Final scores: ' + r.map((x) => x.name + ' ' + x.score).join(' · '));
        api.after(2600, () => { if (phase === 'podium' && !api.menuOpen) showEndMenu(); });
      }

      function showEndMenu() {
        const r = ranking();
        const top = r.filter((x) => x.score === r[0].score);
        const title = top.length > 1 ? 'A tie at the top!' : r[0].name + ' wins!';
        api.menu({
          title,
          text: r.map((x, k) => (k + 1) + '. ' + x.name + ': ' + x.score).join('\n'),
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startGame(players.map((p) => p.name)) },
            { label: 'Change setup', onClick: showSetup },
            { label: 'See the podium', onClick: () => { phase = 'podium'; } }
          ]
        });
      }

      /* ---------- Drawing ---------- */
      function toPaper(p) {
        return { x: U.clamp((p.x - P.x) / PK, 0, PW), y: U.clamp((p.y - P.y) / PK, 0, PH) };
      }

      function outOfInk() {
        if (dryFx > 0.8) return;
        dryFx = 1.2;
        api.sfx('lose');
        const hintsLeft = 2 - hintsShown;
        say(hintsLeft > 0 ? 'Out of ink! The next hint letter refills 30%.' : 'Out of ink! Let them guess.', C.p1);
        if (!inkHinted) {
          inkHinted = true;
          api.setStatus('Out of ink! Each hint letter refills 30% of the tank, so plan your strokes.');
        }
      }

      function startStroke(e, p) {
        const dotCost = SIZES[sizeIdx] * 0.5 * SIZE_COST[sizeIdx];
        if (ink < dotCost) {
          outOfInk();
          return;
        }
        ink -= dotCost;
        const q = toPaper(p);
        undoStack.push(strokes);
        if (undoStack.length > 80) undoStack.shift();
        strokes = strokes.slice();
        cur = { color: INK_COLORS[colorIdx], size: SIZES[sizeIdx], pts: [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10] };
        curPointer = e.pointerId == null ? 0 : e.pointerId;
        try { if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }

      function extendStroke(p) {
        if (!cur) return;
        const q = toPaper(p);
        const n = cur.pts.length;
        const lx = cur.pts[n - 2];
        const ly = cur.pts[n - 1];
        const dx = q.x - lx;
        const dy = q.y - ly;
        const d2 = dx * dx + dy * dy;
        if (d2 < 2.25) return;
        const cost = Math.sqrt(d2) * SIZE_COST[sizeIdx];
        if (cost > ink) {
          const f = ink / cost;
          if (f > 0.02) cur.pts.push(Math.round((lx + dx * f) * 10) / 10, Math.round((ly + dy * f) * 10) / 10);
          ink = 0;
          endStroke();
          outOfInk();
          return;
        }
        ink -= cost;
        cur.pts.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10);
        if (!inkHinted && ink < INK_MAX * 0.5) {
          inkHinted = true;
          api.setStatus('Half your ink is gone! Each hint letter refills 30%; undo and clear never give ink back.');
        }
      }

      function endStroke() {
        if (!cur) return;
        strokes.push(cur);
        if (paperCache && !paperDirty) {
          try {
            paperCache.c.save();
            paperCache.c.beginPath();
            paperCache.c.rect(0, 0, P.w, P.h);
            paperCache.c.clip();
            drawStroke(paperCache.c, cur, 0, 0, PK);
            paperCache.c.restore();
          } catch (e) {
            paperDirty = true;
          }
        } else {
          paperDirty = true;
        }
        cur = null;
        curPointer = null;
      }

      function undo() {
        if (phase !== 'draw') return;
        endStroke();
        if (!undoStack.length) return;
        strokes = undoStack.pop();
        paperDirty = true;
        api.sfx('tick');
      }

      function clearPaper() {
        if (phase !== 'draw') return;
        endStroke();
        if (!strokes.length) return;
        undoStack.push(strokes);
        strokes = [];
        paperDirty = true;
        api.sfx('hit');
        say('Cleared. The ink you used stays used!', C.muted);
      }

      function ensurePaperCache() {
        if (paperCache && !paperDirty) return paperCache;
        try {
          if (!paperCache) {
            const el = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            el.width = Math.round(P.w * dpr);
            el.height = Math.round(P.h * dpr);
            const c = el.getContext('2d');
            if (!c) return null;
            paperCache = { el, c, dpr };
          }
          const c = paperCache.c;
          c.setTransform(paperCache.dpr, 0, 0, paperCache.dpr, 0, 0);
          c.fillStyle = PAPER;
          c.fillRect(0, 0, P.w, P.h);
          drawStrokes(c, strokes, 0, 0, PK);
          paperDirty = false;
          return paperCache;
        } catch (e) {
          paperCache = null;
          return null;
        }
      }

      /* ---------- Input ---------- */
      function onDown(e) {
        if (api.menuOpen) return;
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
        for (let i = hits.length - 1; i >= 0; i--) {
          const h = hits[i];
          if (inside(p, h)) {
            if (h.id === 'peek') {
              peekPointer = e.pointerId == null ? 0 : e.pointerId;
              return;
            }
            if (!h.disabled && h.fn) h.fn();
            return;
          }
        }
        if (phase === 'draw' && !cur && endingT < 0 && (e.button == null || e.button === 0) && inside(p, P) && timeLeft > 0) {
          startStroke(e, p);
        }
      }

      function onMove(e) {
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
        if (!cur || phase !== 'draw') return;
        const id = e.pointerId == null ? 0 : e.pointerId;
        if (id !== curPointer) return;
        let list = null;
        try { list = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null; } catch (err) { list = null; }
        if (list && list.length) {
          for (const ev of list) {
            extendStroke(api.toCanvas(ev, canvas));
            if (!cur) break;
          }
        } else {
          extendStroke(p);
        }
      }

      function onUp(e) {
        const id = e.pointerId == null ? 0 : e.pointerId;
        if (peekPointer !== null && id === peekPointer) peekPointer = null;
        if (cur && id === curPointer) {
          extendStroke(api.toCanvas(e, canvas));
          endStroke();
        }
      }

      function onLeave(e) {
        pointer.over = false;
        peekPointer = null;
        onUp(e);
      }

      api.on(canvas, 'pointerdown', onDown);
      api.on(canvas, 'pointermove', onMove);
      api.on(canvas, 'pointerup', onUp);
      api.on(canvas, 'pointercancel', onUp);
      api.on(canvas, 'pointerleave', onLeave);

      api.on(window, 'keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || api.menuOpen) return;
        const code = e.code || '';
        if (phase === 'pick') {
          if (code === 'Digit1' || code === 'Numpad1') choose(0);
          else if (code === 'Digit2' || code === 'Numpad2') choose(1);
          else if (code === 'Digit3' || code === 'Numpad3') choose(2);
        } else if (phase === 'ready') {
          if ((code === 'Enter' || code === 'Space' || code === 'NumpadEnter') && !e.repeat) startCountdown();
        } else if (phase === 'draw') {
          if (code.startsWith('Digit')) {
            const n = Number(code.slice(5));
            if (n >= 1 && n <= INK_COLORS.length) { colorIdx = n - 1; api.sfx('tick'); }
          } else if (code === 'KeyX') {
            sizeIdx = 1 - sizeIdx;
            api.sfx('tick');
          } else if (code === 'KeyZ') {
            undo();
          }
        } else if (phase === 'names') {
          if (code === 'Enter' || code === 'NumpadEnter') confirmNames();
        } else if (phase === 'podium') {
          if (code === 'Enter' && !e.repeat) showEndMenu();
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        phaseT += dt;
        refillFx = Math.max(0, refillFx - dt);
        dryFx = Math.max(0, dryFx - dt);
        inkShown += (ink - inkShown) * Math.min(1, dt * 8);
        if (toast) {
          toast.t += dt;
          if (toast.t > 3) toast = null;
        }
        if (phase === 'countdown' && phaseT >= 2.4) startDrawing();
        if (phase === 'draw' && !api.menuOpen) {
          timeLeft -= dt;
          const used = 1 - timeLeft / drawTime;
          if (hintsShown === 0 && used >= 0.5) giveHint();
          else if (hintsShown === 1 && used >= 0.75) giveHint();
          const sec = Math.ceil(timeLeft);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 5 && sec > 0) api.sfx('tick');
          }
          if (endingT >= 0) {
            endingT -= dt;
            if (endingT < 0) endTurn('all');
          } else if (timeLeft <= 0) {
            timeLeft = 0;
            api.sfx('boom');
            endTurn('time');
          }
        }
        if (phase === 'podium') {
          for (const c of confetti) {
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.r += dt * 4;
            if (c.y > H + 20) { c.y = -20; c.x = U.rand(0, W); }
          }
        }
      }

      /* ---------- Render ---------- */
      function drawCoverScreen() {
        drawBackdrop();
        const d = drawer();
        txt('ROUND ' + roundNo() + ' OF ' + rounds, W / 2, 60, F_LABEL(15), C.muted, 'center', 'middle');
        txt('Scores', W / 2, 100, F_TITLE(26), C.text, 'center', 'middle');
        const r = ranking();
        const rowH = Math.min(52, 400 / Math.max(1, r.length));
        r.forEach((x, k) => {
          const y = 140 + k * rowH;
          ctx.fillStyle = x.i === d ? C.panel2 : C.panel;
          U.roundRect(ctx, 280, y, 400, rowH - 8, 10);
          ctx.fill();
          txt((k + 1) + '.', 300, y + (rowH - 8) / 2, F_LABEL(15), C.muted, 'left', 'middle');
          txt(x.name + (x.i === d ? '  ✎ drawing' : ''), 340, y + (rowH - 8) / 2, F_BODY(18, 800), seatColor(x.i), 'left', 'middle');
          txt(String(x.score), 660, y + (rowH - 8) / 2, F_LABEL(17), C.text, 'right', 'middle');
        });
      }

      function drawPick() {
        drawBackdrop();
        const d = players[drawer()];
        txt('ONLY ' + d.name.toUpperCase() + ' SHOULD SEE THIS', W / 2, 60, F_LABEL(14), seatColor(drawer()), 'center', 'middle');
        txt('Pick a word to draw', W / 2, 104, F_TITLE(30), C.text, 'center', 'middle');
        for (let t = 0; t < 3; t++) {
          const x = 60 + t * 290;
          const y = 160;
          const w = 260;
          const h = 250;
          const r = { x, y, w, h };
          const hot = pointer.over && inside(pointer, r);
          const bob = hot ? -6 : Math.sin(clock * 2 + t) * 3;
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          U.roundRect(ctx, x + 6, y + 8, w, h, 20);
          ctx.fill();
          ctx.fillStyle = PAPER;
          U.roundRect(ctx, x, y + bob, w, h, 20);
          ctx.fill();
          ctx.strokeStyle = TIERS[t].color;
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.fillStyle = TIERS[t].color;
          U.roundRect(ctx, x + w / 2 - 60, y + bob + 22, 120, 30, 15);
          ctx.fill();
          txt(TIERS[t].name.toUpperCase(), x + w / 2, y + bob + 38, F_LABEL(14), INK, 'center', 'middle');
          const s = fitFont(ctx, choices[t], w - 30, [34, 30, 26, 22, 19], (z) => F_BODY(z, 800));
          ctx.font = F_BODY(s, 800);
          const lines = wrapLines(ctx, choices[t], w - 30);
          lines.slice(0, 2).forEach((ln, i) => txt(ln, x + w / 2, y + bob + 130 + (i - (Math.min(2, lines.length) - 1) / 2) * s * 1.15, F_BODY(s, 800), INK, 'center', 'middle'));
          txt('press ' + (t + 1), x + w / 2, y + bob + h - 28, F_LABEL(12), '#8A86B0', 'center', 'middle');
          hits.push({ x, y, w, h, fn: () => choose(t) });
        }
        txt('Points come from guess speed, not difficulty. Pick what you can draw with little ink!', W / 2, 470, F_BODY(17), C.muted, 'center', 'middle');
      }

      function drawReady() {
        drawBackdrop();
        const d = players[drawer()];
        txt('YOUR WORD', W / 2, 110, F_LABEL(15), TIERS[tier].color, 'center', 'middle');
        const s = fitFont(ctx, word, 760, [64, 54, 46, 38], F_TITLE);
        txt(word, W / 2, 190, F_TITLE(s), C.text, 'center', 'middle');
        txt('Remember it! The word is hidden once you start.', W / 2, 270, F_BODY(20), C.muted, 'center', 'middle');
        txt('Hold Peek during your turn if you forget, but shield the screen.', W / 2, 302, F_BODY(17), C.muted, 'center', 'middle');
        button(W / 2 - 150, 360, 300, 64, 'Start drawing', { color: C.gold, font: F_BODY(22, 800) }, startCountdown);
        button(W / 2 - 90, 446, 180, 46, 'Pick again', {}, () => { phase = 'pick'; api.sfx('blip'); });
        txt(d.name + ': show everyone the screen, then start.', W / 2, 540, F_LABEL(13), C.muted, 'center', 'middle');
      }

      function blanksText(showAll) {
        let out = '';
        for (let i = 0; i < word.length; i++) {
          const ch = word[i];
          if (ch === ' ') out += '   ';
          else if (!/[a-z]/i.test(ch)) out += ch + ' ';
          else out += (showAll || revealed.has(i) ? ch.toUpperCase() : '_') + ' ';
        }
        return out.trim();
      }

      function drawHeader() {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, 72);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, 72, W, 2);
        const d = drawer();
        const name = players[d].name;
        ctx.font = F_LABEL(13);
        const chipW = Math.min(170, ctx.measureText(name.toUpperCase()).width + 28);
        ctx.fillStyle = seatColor(d);
        U.roundRect(ctx, 20, 12, chipW, 24, 12);
        ctx.fill();
        txt(name.toUpperCase(), 20 + chipW / 2, 25, F_LABEL(13), INK, 'center', 'middle');
        txt('IS DRAWING · ROUND ' + roundNo() + '/' + rounds, 20, 56, F_LABEL(12), C.muted, 'left', 'middle');
        const peeking = peekPointer !== null || api.keys.has('KeyP');
        if (phase === 'draw' || phase === 'countdown' || phase === 'turnEnd') {
          const showAll = phase === 'turnEnd' || peeking;
          const str = blanksText(showAll);
          const s = fitFont(ctx, str, 520, [28, 24, 20, 17], (z) => '700 ' + z + 'px "JetBrains Mono", monospace');
          if (peeking && phase !== 'turnEnd') {
            ctx.font = '700 ' + s + 'px "JetBrains Mono", monospace';
            const bw = ctx.measureText(str).width + 30;
            ctx.fillStyle = C.gold;
            U.roundRect(ctx, 480 - bw / 2, 16, bw, 40, 10);
            ctx.fill();
          }
          txt(str, 480, 37, '700 ' + s + 'px "JetBrains Mono", monospace', peeking && phase !== 'turnEnd' ? INK : phase === 'turnEnd' ? C.mint : C.text, 'center', 'middle');
          const letters = letterSlots().length;
          txt(letters + ' letters' + (word.indexOf(' ') >= 0 ? ' · ' + word.split(' ').length + ' words' : ''), 480, 63, F_LABEL(11), C.muted, 'center', 'middle');
        }
        // Timer ring
        const frac = U.clamp(timeLeft / drawTime, 0, 1);
        const secs = Math.max(0, Math.ceil(timeLeft));
        const urgent = secs <= 10 && phase === 'draw';
        const x = 912;
        const y = 36;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(x, y, 30, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 7;
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.arc(x, y, 25, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = urgent ? C.p1 : frac < 0.5 ? C.gold : C.mint;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(x, y, 25, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
        ctx.lineCap = 'butt';
        // Hint markers at 50% and 75% of the time.
        [0.5, 0.25].forEach((m) => {
          const a = -Math.PI / 2 + TAU * m;
          ctx.fillStyle = frac > m ? C.gold : C.line;
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * 25, y + Math.sin(a) * 25, 4, 0, TAU);
          ctx.fill();
        });
        txt(String(secs), x, y + 1, F_TITLE(16), urgent ? C.p1 : C.text, 'center', 'middle');
      }

      function drawTools() {
        const x0 = 778;
        txt('COLOR', x0, 98, F_LABEL(12), C.muted, 'left', 'alphabetic');
        INK_COLORS.forEach((c, i) => {
          const bx = x0 + (i % 2) * 84;
          const by = 106 + Math.floor(i / 2) * 48;
          const active = colorIdx === i;
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          U.roundRect(ctx, bx + 3, by + 4, 76, 40, 10);
          ctx.fill();
          ctx.fillStyle = c;
          U.roundRect(ctx, bx, by, 76, 40, 10);
          ctx.fill();
          ctx.strokeStyle = active ? C.text : c === INK ? C.line : 'rgba(0,0,0,.25)';
          ctx.lineWidth = active ? 4 : 2;
          ctx.stroke();
          if (active) {
            ctx.fillStyle = c === INK ? C.text : INK;
            ctx.beginPath();
            ctx.arc(bx + 38, by + 20, 5, 0, TAU);
            ctx.fill();
          }
          hits.push({ x: bx, y: by, w: 76, h: 40, fn: () => { colorIdx = i; api.sfx('tick'); } });
        });
        txt('BRUSH', x0, 268, F_LABEL(12), C.muted, 'left', 'alphabetic');
        SIZES.forEach((s, i) => {
          const bx = x0 + i * 84;
          const by = 276;
          const active = sizeIdx === i;
          ctx.fillStyle = active ? C.panel2 : C.panel;
          U.roundRect(ctx, bx, by, 76, 58, 10);
          ctx.fill();
          ctx.strokeStyle = active ? C.text : C.line;
          ctx.lineWidth = active ? 3 : 2;
          ctx.stroke();
          ctx.fillStyle = INK_COLORS[colorIdx] === INK ? C.text : INK_COLORS[colorIdx];
          ctx.beginPath();
          ctx.arc(bx + 38, by + 22, Math.max(3, s * PK / 2), 0, TAU);
          ctx.fill();
          txt(SIZE_COST[i] + '× ink', bx + 38, by + 46, F_LABEL(11), i ? C.gold : C.muted, 'center', 'middle');
          hits.push({ x: bx, y: by, w: 76, h: 58, fn: () => { sizeIdx = i; api.sfx('tick'); } });
        });
        button(x0, 346, 76, 42, 'Undo', { font: F_BODY(15, 800), disabled: !undoStack.length }, undo);
        button(x0 + 84, 346, 76, 42, 'Clear', { font: F_BODY(15, 800), disabled: !strokes.length && !cur }, clearPaper);
        const peeking = peekPointer !== null;
        button(x0, 400, 160, 46, peeking ? word : 'Hold to peek', { id: 'peek', color: peeking ? C.gold : null, font: F_BODY(peeking ? 15 : 16, 800) }, null);
        button(x0, 456, 160, 46, "Time's up", { color: C.p1, font: F_BODY(16, 800) }, () => endTurn('button'));
      }

      function drawGuessers() {
        const g = guessers();
        const gap = 10;
        const bw = Math.min(200, (W - 40 - gap * (g.length - 1)) / Math.max(1, g.length));
        const total = bw * g.length + gap * (g.length - 1);
        const x0 = W / 2 - total / 2;
        const y = 524;
        txt(phase === 'draw' ? 'TAP EVERYONE WHO GUESSES RIGHT' : 'GUESSERS', W / 2, 516 - 2, F_LABEL(11), C.muted, 'center', 'alphabetic');
        g.forEach((i, k) => {
          const x = x0 + k * (bw + gap);
          const on = marked.has(i);
          const pts = on ? '+' + marked.get(i) : 'score ' + players[i].score;
          const nm = shortName(players[i].name, Math.max(5, Math.floor(bw / 10)));
          button(x, y + 4, bw, 58, (on ? '✓ ' : '') + nm, {
            color: on ? C.mint : null,
            font: F_BODY(bw < 140 ? 14 : 17, 800),
            sub: pts,
            disabled: phase !== 'draw'
          }, () => toggleGuesser(i));
          if (!on) {
            ctx.fillStyle = seatColor(i);
            ctx.fillRect(x + 10, y + 52, bw - 20, 3);
          }
        });
      }

      function drawPaperArea() {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        U.roundRect(ctx, P.x + 5, P.y + 6, P.w, P.h, 14);
        ctx.fill();
        ctx.fillStyle = PAPER;
        U.roundRect(ctx, P.x, P.y, P.w, P.h, 14);
        ctx.fill();
        const cache = ensurePaperCache();
        ctx.save();
        U.roundRect(ctx, P.x, P.y, P.w, P.h, 14);
        ctx.clip();
        if (cache) ctx.drawImage(cache.el, P.x, P.y, P.w, P.h);
        else drawStrokes(ctx, strokes, P.x, P.y, PK);
        if (cur) drawStroke(ctx, cur, P.x, P.y, PK);
        if (phase === 'draw' && pointer.over && inside(pointer, P) && !api.isTouch) {
          ctx.strokeStyle = ink > 0 ? INK_COLORS[colorIdx] : '#B0ACCB';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, Math.max(2, SIZES[sizeIdx] * PK / 2), 0, TAU);
          ctx.stroke();
        }
        if (ink <= 0.5 && phase === 'draw') {
          ctx.fillStyle = 'rgba(255,93,115,.12)';
          ctx.fillRect(P.x, P.y, P.w, P.h);
          ctx.fillStyle = 'rgba(15,13,36,.85)';
          U.roundRect(ctx, P.x + P.w / 2 - 150, P.y + 14, 300, 40, 20);
          ctx.fill();
          txt(hintsShown < 2 ? 'Out of ink until the next hint' : 'Out of ink!', P.x + P.w / 2, P.y + 35, F_BODY(17, 800), C.p1, 'center', 'middle');
        }
        ctx.restore();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        U.roundRect(ctx, P.x, P.y, P.w, P.h, 14);
        ctx.stroke();
      }

      function drawInkTank() {
        const frac = inkShown / INK_MAX;
        const low = frac < 0.2;
        const blink = low && Math.sin(clock * 12) > 0;
        const liquid = low ? (blink ? C.p1 : '#C9455A') : C.gold;
        drawTank(ctx, TANK.x, TANK.y + 24, TANK.w, TANK.h - 24, frac, clock, liquid);
        txt('INK', TANK.x + TANK.w / 2, TANK.y + 8, F_LABEL(12), C.muted, 'center', 'middle');
        const pct = Math.round(frac * 100);
        txt(pct + '%', TANK.x + TANK.w / 2, TANK.y + 50, F_LABEL(13), frac > 0.92 ? INK : C.text, 'center', 'middle');
        // Refill markers: where 30% lands.
        if (refillFx > 0) {
          const a = U.clamp(refillFx / 1.4, 0, 1);
          ctx.globalAlpha = a;
          txt('+30%', TANK.x + TANK.w / 2, TANK.y + TANK.h - 40 - (1 - a) * 60, F_TITLE(14), C.mint, 'center', 'middle');
          for (let i = 0; i < 6; i++) {
            const bx = TANK.x + 14 + ((i * 17) % 30);
            const by = TANK.y + TANK.h - 20 - ((clock * 90 + i * 40) % (TANK.h - 60));
            ctx.fillStyle = 'rgba(255,255,255,.6)';
            ctx.beginPath();
            ctx.arc(bx, by, 3, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (dryFx > 0) {
          ctx.strokeStyle = U.alpha(C.p1, U.clamp(dryFx, 0, 1));
          ctx.lineWidth = 4;
          U.roundRect(ctx, TANK.x - 4, TANK.y + 20, TANK.w + 8, TANK.h - 16, TANK.w / 2 + 4);
          ctx.stroke();
        }
      }

      function drawPlay() {
        drawBackdrop();
        drawHeader();
        drawPaperArea();
        drawInkTank();
        drawTools();
        drawGuessers();
        if (phase === 'countdown') {
          const n = 3 - Math.floor(phaseT / 0.8);
          const k = (phaseT % 0.8) / 0.8;
          ctx.fillStyle = 'rgba(15,13,36,.55)';
          ctx.fillRect(P.x, P.y, P.w, P.h);
          ctx.save();
          ctx.translate(P.x + P.w / 2, P.y + P.h / 2);
          const s = 1.4 - k * 0.4;
          ctx.scale(s, s);
          ctx.globalAlpha = 1 - k * 0.6;
          txt(n > 0 ? String(n) : 'Draw!', 0, 0, F_TITLE(80), C.gold, 'center', 'middle');
          ctx.restore();
          ctx.globalAlpha = 1;
          txt('Guessers, get ready to shout!', P.x + P.w / 2, P.y + P.h - 40, F_BODY(20, 800), C.text, 'center', 'middle');
        }
        if (phase === 'turnEnd') {
          ctx.fillStyle = 'rgba(15,13,36,.35)';
          ctx.fillRect(P.x, P.y, P.w, P.h);
        }
      }

      function drawPodium() {
        drawBackdrop();
        txt('Final scores', W / 2, 54, F_TITLE(32), C.text, 'center', 'middle');
        const r = ranking();
        const k = U.clamp(phaseT / 1.2, 0, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        const spots = [
          { rank: 1, x: W / 2 - 90, h: 200, color: C.gold },
          { rank: 0, x: W / 2 - 290, h: 140, color: C.p2 },
          { rank: 2, x: W / 2 + 110, h: 100, color: C.p1 }
        ];
        const base = 470;
        // Dense places: equal scores share a place.
        const place = [];
        r.forEach((x, i) => { place[i] = i > 0 && x.score === r[i - 1].score ? place[i - 1] : i + 1; });
        spots.forEach((s) => {
          const idx = s.rank === 1 ? 0 : s.rank === 0 ? 1 : 2;
          const x = r[idx];
          if (!x) return;
          const h = s.h * ease;
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          U.roundRect(ctx, s.x + 6, base - h + 8, 180, h, 12);
          ctx.fill();
          ctx.fillStyle = s.color;
          U.roundRect(ctx, s.x, base - h, 180, h, 12);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 3;
          ctx.stroke();
          if (h > 50) txt(String(place[idx]), s.x + 90, base - h + 44, F_TITLE(40), INK, 'center', 'middle');
          const ny = base - h - 46;
          const nm = shortName(x.name, 14);
          const fs = fitFont(ctx, nm, 200, [22, 19, 16], (z) => F_BODY(z, 800));
          txt(nm, s.x + 90, ny, F_BODY(fs, 800), seatColor(x.i), 'center', 'middle');
          txt(x.score + ' pts', s.x + 90, ny + 24, F_LABEL(14), C.text, 'center', 'middle');
          if (idx === 0 && k >= 1) {
            // Crown
            ctx.fillStyle = C.gold;
            ctx.beginPath();
            const cx = s.x + 90;
            const cy = ny - 38 + Math.sin(clock * 3) * 3;
            ctx.moveTo(cx - 24, cy + 12);
            ctx.lineTo(cx - 24, cy - 8);
            ctx.lineTo(cx - 12, cy + 2);
            ctx.lineTo(cx, cy - 14);
            ctx.lineTo(cx + 12, cy + 2);
            ctx.lineTo(cx + 24, cy - 8);
            ctx.lineTo(cx + 24, cy + 12);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = INK;
            ctx.lineWidth = 2;
            ctx.stroke();
          }
        });
        // Everyone else.
        const rest = r.slice(3);
        rest.forEach((x, j) => {
          const col = j % 3;
          const row = Math.floor(j / 3);
          const bx = 150 + col * 230;
          const by = 490 + row * 30;
          txt(place[j + 3] + '. ' + shortName(x.name, 12) + '  ' + x.score, bx, by, F_BODY(16, 700), C.muted, 'left', 'middle');
        });
        for (const c of confetti) {
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.rotate(c.r);
          ctx.fillStyle = c.c;
          ctx.fillRect(-4, -2, 8, 4);
          ctx.restore();
        }
        if (!api.menuOpen) {
          button(W / 2 - 230, 548, 210, 44, 'Play again', { color: C.gold }, () => startGame(players.map((p) => p.name)));
          button(W / 2 + 20, 548, 210, 44, 'Change setup', {}, showSetup);
        }
      }

      function setupBackdrop() {
        drawBackdrop();
        drawTank(ctx, 120, 120, 70, 340, 0.55 + Math.sin(clock) * 0.05, clock, C.gold);
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        U.roundRect(ctx, 255, 135, 600, 330, 18);
        ctx.fill();
        ctx.fillStyle = PAPER;
        U.roundRect(ctx, 250, 130, 600, 330, 18);
        ctx.fill();
        txt('_ _ _ _ _ _', 550, 80, '700 32px "JetBrains Mono", monospace', C.text, 'center', 'middle');
      }

      function drawToast() {
        if (!toast) return;
        const a = U.clamp(Math.min(toast.t * 6, (3 - toast.t) * 3), 0, 1);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        ctx.font = F_BODY(17, 800);
        const w = Math.min(P.w - 20, ctx.measureText(toast.text).width + 40);
        const x = P.x + P.w / 2;
        const y = P.y + P.h - 54;
        ctx.fillStyle = toast.color;
        U.roundRect(ctx, x - w / 2, y, w, 38, 19);
        ctx.fill();
        txt(toast.text, x, y + 20, F_BODY(17, 800), INK, 'center', 'middle');
        ctx.globalAlpha = 1;
      }

      function draw() {
        hits = [];
        switch (phase) {
          case 'names': drawNames(); break;
          case 'cover': drawCoverScreen(); break;
          case 'pick': drawPick(); break;
          case 'ready': drawReady(); break;
          case 'countdown':
          case 'draw':
          case 'turnEnd': drawPlay(); break;
          case 'podium': drawPodium(); break;
          default: setupBackdrop();
        }
        if (phase === 'draw' || phase === 'turnEnd') drawToast();
      }

      showSetup();
      api.loop((dt) => {
        update(dt);
        draw();
        layoutInputs();
      });
    }
  });
})();
