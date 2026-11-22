/* Draw Relay: pass-and-play telephone drawing game.
   Every player starts a chain with a prompt; then turns alternate between drawing the last
   words and describing the last drawing, so every prompt mutates as it travels down the line. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const PW = 800; // paper space: strokes are stored in these units so they redraw at any size
  const PH = 500;
  const TAU = Math.PI * 2;
  const INK = '#0B0B1A';
  const PAPER = '#FFFFFF';
  const F_TITLE = (s) => '800 ' + s + 'px Unbounded, sans-serif';
  const F_LABEL = (s) => '600 ' + s + 'px "JetBrains Mono", monospace';
  const F_BODY = (s, w) => (w || 600) + ' ' + s + 'px Figtree, sans-serif';
  const INK_COLORS = ['#0B0B1A', '#FF5D73', '#FF9A3D', '#FFC53D', '#2FBF7F', '#36C9F0', '#8E6BFF', '#8A5A3B'];
  const SIZES = [4, 10, 24];
  const ERASER_SIZE = [14, 28, 56];
  const SEAT_COLORS = [C.p1, C.p2, C.gold, C.mint, C.violet, '#FF9A3D', '#F06BD0', '#7FD1FF'];
  const MAX_POINTS = 16000; // per drawing, keeps very long scribbles cheap to replay

  const PROMPTS = [
    'a cat running a bakery', 'a dragon at the dentist', 'a snowman on a beach holiday', 'a giraffe in a tiny car',
    'a robot walking a dog', 'a pirate ship in a bathtub', 'an octopus playing the drums', 'a penguin selling ice cream',
    'a wizard stuck in traffic', 'a dinosaur on a skateboard', 'a ghost doing laundry', 'a shark at a birthday party',
    'a sloth winning a race', 'a bear riding a bicycle', 'a knight scared of a mouse', 'an alien ordering pizza',
    'a mermaid in a library', 'a turtle with a jetpack', 'a chicken crossing a busy road', 'a superhero doing the dishes',
    'a snail delivering the mail', 'a hamster lifting weights', 'a frog king on a lily pad', 'a volcano making popcorn',
    'a cactus giving a hug', 'a whale in a fish tank', 'a kangaroo with a heavy backpack', 'a bee directing traffic',
    'a unicorn at the car wash', 'a horse playing chess', 'a cloud raining spaghetti', 'a lighthouse in the desert',
    'a tiny elephant in a teacup', 'a mummy opening a present', 'a fox camping in the woods', 'a bunny driving a tractor',
    'a lion getting a haircut', 'a spider knitting a scarf', 'a pig in a spacesuit', 'an astronaut planting a garden',
    'a parrot reading the news', 'a crab building a sandcastle', 'a dog flying a kite', 'a goat on a mountain bike',
    'a squirrel hoarding donuts', 'a train made of cheese', 'a castle on a cloud', 'penguins having a snowball fight',
    'a teddy bear in a rainstorm', 'an owl teaching a class', 'a jellyfish at a disco', 'a rocket shaped like a carrot',
    'a baby dragon learning to fly', 'a camel at the north pole', 'a robot baking cookies', 'a bus full of ducks',
    'a gorilla playing the violin', 'a sandwich taller than a house', 'a fish riding a bicycle', 'a cat stuck in a tree',
    'a ninja tying their shoes', 'a raccoon at a fancy dinner', 'a giant sneezing', 'a moose in a canoe',
    'a koala sleeping on a cloud', 'a pumpkin with a mustache', 'a king who lost his crown', 'a mouse lifting a car',
    'an ant carrying a watermelon', 'a yeti making snow angels', 'a hedgehog getting a hug', 'a zebra at a crosswalk',
    'a cow on a trampoline', 'a duck in a business suit', 'a polar bear eating an ice pop', 'a snake wearing a scarf',
    'a bat hanging up laundry', 'a tiger painting its stripes', 'a pizza wearing sunglasses', 'a lamp afraid of the dark',
    'a cupcake volcano', 'a tree house in a storm', 'a wolf at a sleepover', 'a seal juggling fish',
    'a peacock showing off', 'a rhino in a ballet tutu', 'a squid writing a letter', 'a skeleton playing the xylophone',
    'a submarine full of cats', 'a lemon at the gym', 'the sun wearing sunscreen', 'the moon eating cheese',
    'a star falling into a pond', 'a broom that sweeps by itself', 'a traffic jam of magic carpets', 'a robot hugging a toaster',
    'a time machine made of cardboard', 'a bridge made of spaghetti', 'a giant on a tiny chair', 'a hippo in a bubble bath',
    'a puppy delivering newspapers', 'a beaver building a skyscraper', 'a flamingo on roller skates', 'ants playing soccer',
    'a haunted ice cream truck', 'a cookie running away', 'a dragon toasting marshmallows', 'an igloo with a chimney',
    'a crocodile brushing its teeth', 'a giraffe wearing a scarf', 'a hot air balloon shaped like a cat', 'a viking on a pedal boat',
    'a strawberry with legs', 'a carrot escaping a rabbit', 'a cloud wearing a hat', 'a shy volcano',
    'a mermaid driving a bus', 'a parrot pirate captain', 'a sheep counting people', 'a llama at the hairdresser',
    'a sad umbrella in the sun', 'a happy little thunderstorm', 'a bear stuck in a honey jar', 'a fire truck at a birthday cake',
    'a train going over a rainbow', 'a whale singing karaoke', 'a dog in a tuxedo', 'an egg hatching a robot',
    'a planet shaped like a donut', 'a cat conducting an orchestra', 'a mouse building a rocket', "a lion's first day at school",
    'a pirate looking for his socks', 'a worm reading a giant book', 'a robot learning to dance', 'a lazy dog on a hammock',
    'a cow driving a race car', 'a ghost afraid of people', 'a dragon guarding a cookie jar', 'an elephant hiding behind a tree'
  ];

  /* ---------- Pure drawing helpers (shared by the game and the card art) ---------- */

  /* One stroke with quadratic midpoint smoothing. limit = how many points to draw (replay). */
  function drawStroke(c, s, ox, oy, k, limit) {
    const p = s.pts;
    let n = p.length >> 1;
    if (limit != null && limit < n) n = limit;
    if (n <= 0) return;
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

  function drawStrokes(c, strokes, ox, oy, k, limitPts) {
    let left = limitPts == null ? Infinity : limitPts;
    for (const s of strokes) {
      if (left <= 0) break;
      const n = s.pts.length >> 1;
      drawStroke(c, s, ox, oy, k, left < n ? Math.floor(left) : null);
      left -= n;
    }
  }

  const totalPts = (strokes) => strokes.reduce((a, s) => a + (s.pts.length >> 1), 0);

  /* Word wrap with hard breaks for words wider than the box. */
  function wrapLines(c, str, maxW) {
    const words = String(str).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (let w of words) {
      while (c.measureText(w).width > maxW && w.length > 1) {
        let cut = w.length - 1;
        while (cut > 1 && c.measureText(w.slice(0, cut)).width > maxW) cut--;
        if (line) { lines.push(line); line = ''; }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const test = line ? line + ' ' + w : w;
      if (!line || c.measureText(test).width <= maxW) line = test;
      else { lines.push(line); line = w; }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }

  /* Largest font size (from sizes) whose wrapped text fits in maxLines. */
  function fitText(c, str, maxW, maxLines, sizes, fontFn) {
    for (const s of sizes) {
      c.font = fontFn(s);
      const lines = wrapLines(c, str, maxW);
      if (lines.length <= maxLines) return { lines, size: s };
    }
    const s = sizes[sizes.length - 1];
    c.font = fontFn(s);
    let lines = wrapLines(c, str, maxW);
    if (lines.length > maxLines) {
      lines = lines.slice(0, maxLines);
      lines[maxLines - 1] = lines[maxLines - 1].replace(/.?$/, '…');
    }
    return { lines, size: s };
  }

  /* A procedurally built doodle (cat in a chef hat) for the card art. */
  function circlePts(cx, cy, rx, ry, a0, a1, n) {
    const out = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
    }
    return out;
  }
  const CAT_DOODLE = [
    { color: INK, size: 14, pts: circlePts(400, 300, 150, 125, 0, TAU, 40) },
    { color: INK, size: 14, pts: [270, 230, 285, 120, 345, 185] },
    { color: INK, size: 14, pts: [455, 185, 515, 120, 530, 230] },
    { color: INK, size: 22, pts: [350, 285] },
    { color: INK, size: 22, pts: [450, 285] },
    { color: '#FF5D73', size: 12, pts: [390, 320, 400, 332, 410, 320, 390, 320] },
    { color: INK, size: 8, pts: [370, 345, 385, 360, 400, 345, 415, 360, 430, 345] },
    { color: INK, size: 6, pts: [330, 330, 220, 315] },
    { color: INK, size: 6, pts: [330, 345, 225, 360] },
    { color: INK, size: 6, pts: [470, 330, 580, 315] },
    { color: INK, size: 6, pts: [470, 345, 575, 360] },
    { color: '#36C9F0', size: 10, pts: circlePts(400, 95, 95, 55, Math.PI, TAU, 18).concat([495, 95, 470, 150, 330, 150, 305, 95]) }
  ];

  function drawThumbCard(ctx, x, y, w, h, text, color, rot, typed) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    U.roundRect(ctx, -w / 2 + 4, -h / 2 + 5, w, h, 12);
    ctx.fill();
    ctx.fillStyle = color;
    U.roundRect(ctx, -w / 2, -h / 2, w, h, 12);
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = F_BODY(14, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const shown = text.slice(0, Math.max(0, Math.floor(typed)));
    const lines = wrapLines(ctx, shown || ' ', w - 16);
    lines.forEach((ln, i) => ctx.fillText(ln, 0, (i - (lines.length - 1) / 2) * 17));
    ctx.restore();
  }

  Arcade.register({
    id: 'draw-relay',
    title: 'Draw Relay',
    category: 'party',
    mode: 'together',
    players: '3–8P',
    best: false,
    color: C.violet,
    tagline: 'Pass one device around: write a prompt, draw what you read, describe what you see.',
    hook: 'Words become drawings become words: watch your prompt mutate down the line.',
    tags: ['party', 'drawing', 'words', 'pass and play', 'telephone', 'groups', 'family', 'touch', 'hotseat'],
    howTo: 'For 3 to 8 people sharing one device. Everyone starts a chain by writing a prompt (or tapping Give me one). ' +
      'Then the chains travel around the group: the next player sees only the last step, so they draw the words they read, ' +
      'and the player after them describes the drawing they see. A cover screen hides everything while you pass the device. ' +
      'When every chain has one step from each player, gather round for the reveal and watch each prompt mutate, ' +
      'step by step, from the first words to the final result. No letters or numbers in drawings!',
    controls: [
      { keys: ['Mouse', 'Touch'], label: 'Draw on the paper' },
      { keys: ['1–8'], label: 'Pick an ink color' },
      { keys: ['X'], label: 'Change brush size' },
      { keys: ['E'], label: 'Toggle the eraser' },
      { keys: ['Z'], label: 'Undo the last stroke' },
      { keys: ['Enter'], label: 'Submit a prompt or description' },
      { keys: ['→', 'Space'], label: 'Next step in the reveal' },
      { keys: ['←'], label: 'Previous step in the reveal' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, U.alpha(C.violet, 0.35));
      g.addColorStop(1, U.alpha(C.violet, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.line, 0.6);
      for (let x = 10; x < w; x += 20) for (let y = 10; y < h; y += 20) ctx.fillRect(x - 1, y - 1, 2, 2);
      // Animated: the doodle draws itself, then the guess types out. Static at t=0: everything shown.
      const cyc = t === 0 ? 99 : t % 5;
      const drawP = U.clamp(cyc / 2, 0, 1);
      const typeP = U.clamp((cyc - 2.1) * 14, 0, 40);
      drawThumbCard(ctx, 12, 20, 104, 70, 'a cat running a bakery', C.gold, -0.07, 99);
      // Arrow 1
      ctx.strokeStyle = C.text;
      ctx.fillStyle = C.text;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      const arrow = (x1, y1, x2, y2) => {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2, Math.min(y1, y2) - 18, x2, y2);
        ctx.stroke();
        const a = Math.atan2(y2 - (Math.min(y1, y2) - 18), x2 - (x1 + x2) / 2);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - Math.cos(a - 0.5) * 9, y2 - Math.sin(a - 0.5) * 9);
        ctx.lineTo(x2 - Math.cos(a + 0.5) * 9, y2 - Math.sin(a + 0.5) * 9);
        ctx.closePath();
        ctx.fill();
      };
      arrow(70, 106, 98, 132);
      // Paper with the doodle
      const px = 96;
      const py = 96;
      const pw = 140;
      const ph = 88;
      ctx.save();
      ctx.translate(px + pw / 2, py + ph / 2);
      ctx.rotate(0.04);
      ctx.fillStyle = 'rgba(0,0,0,.35)';
      U.roundRect(ctx, -pw / 2 + 4, -ph / 2 + 5, pw, ph, 10);
      ctx.fill();
      ctx.fillStyle = PAPER;
      U.roundRect(ctx, -pw / 2, -ph / 2, pw, ph, 10);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      drawStrokes(ctx, CAT_DOODLE, -pw / 2, -ph / 2 + 2, pw / PW, totalPts(CAT_DOODLE) * drawP);
      ctx.restore();
      arrow(232, 112, 252, 84);
      drawThumbCard(ctx, 206, 14, 104, 70, 'a lion selling bread?', C.mint, 0.06, typeP);
      // Labels
      ctx.font = '700 11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = U.alpha(C.text, 0.7);
      ctx.fillText('WROTE', 16, 108);
      ctx.fillText('DREW', 98, 196);
      ctx.fillText('GUESSED', 252, 102);
      ctx.fillStyle = C.violet;
      ctx.font = F_TITLE(15);
      ctx.textAlign = 'right';
      ctx.fillText('?!', w - 16, h - 18);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const PAPER_RECT = { x: 20, y: 88, w: 752, h: 470 };
      const PK = PAPER_RECT.w / PW;

      /* ---------- State ---------- */
      let phase = 'setup'; // setup | names | cover | write | draw | describe | sent | revealIntro | reveal | gallery
      let count = 4;
      let drawTime = 60;
      let savedNames = [];
      let players = [];
      let chains = [];
      let step = 0;
      let seat = 0;
      let usedPrompts = new Set();
      let clock = 0;
      let phaseT = 0;
      let hits = [];
      let pointer = { x: -999, y: -999, over: false };
      let toast = null;
      let shakeT = 0;
      let sentPreview = null;
      // Drawing
      let strokes = [];
      let undoStack = [];
      let cur = null;
      let curPointer = null;
      let pointsUsed = 0;
      let colorIdx = 0;
      let sizeIdx = 1;
      let eraser = false;
      let timeLeft = 0;
      let lastSec = -1;
      let paperCache = null;
      let paperDirty = true;
      // Text turns
      let emptyArmed = false;
      let autoPicked = false;
      const hinted = { draw: false, describe: false, reveal: false };
      // Reveal
      let rc = 0;
      let ri = 0;
      let rT = 0;
      let fromGallery = false;

      const N = () => players.length;
      const totalTurns = () => N() * N();
      const turnNo = () => step * N() + seat + 1;
      const chainFor = (p, s) => ((p - s) % N() + N()) % N();
      const kindOf = (s) => (s === 0 ? 'write' : s % 2 ? 'draw' : 'describe');
      const seatColor = (p) => SEAT_COLORS[p % SEAT_COLORS.length];

      /* ---------- DOM text inputs (positioned over the canvas in % of the stage) ---------- */
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
          el.setAttribute('enterkeyhint', 'done');
          el.spellcheck = false;
          el.className = 'draw-relay-input';
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

      function valueOf(r) {
        return r && typeof r.el.value === 'string' ? r.el.value : '';
      }

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

      /* ---------- Small canvas UI kit ---------- */
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

      /* Immediate-mode button: draws now, clickable until the next frame. */
      function button(x, y, w, h, label, opts, fn) {
        const o = opts || {};
        const r = { x, y, w, h };
        const hot = !o.disabled && pointer.over && inside(pointer, r);
        const fill = o.color || C.panel2;
        const lift = hot ? 2 : 0;
        ctx.globalAlpha = o.disabled ? 0.4 : 1;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        U.roundRect(ctx, x + 3, y + 4, w, h, o.r || 12);
        ctx.fill();
        ctx.fillStyle = fill;
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
          const dark = o.color && o.color !== C.panel2 && o.color !== C.panel;
          txt(label, x + w / 2, y + h / 2 - lift + 1, o.font || F_BODY(17, 800), o.textColor || (dark ? INK : C.text), 'center', 'middle');
        }
        ctx.globalAlpha = 1;
        hits.push({ x, y, w, h, fn, disabled: !!o.disabled });
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

      function textCard(x, y, w, h, str, opts) {
        const o = opts || {};
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        U.roundRect(ctx, x + 5, y + 6, w, h, 18);
        ctx.fill();
        ctx.fillStyle = o.fill || C.panel2;
        U.roundRect(ctx, x, y, w, h, 18);
        ctx.fill();
        ctx.strokeStyle = o.stroke || C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        const sizes = o.sizes || [34, 30, 26, 22, 19, 16];
        const shown = o.typed == null ? str : str.slice(0, Math.floor(o.typed));
        const fit = fitText(ctx, str, w - 40, o.maxLines || 4, sizes, (s) => F_BODY(s, 800));
        ctx.font = F_BODY(fit.size, 800);
        const lines = o.typed == null ? fit.lines : wrapLines(ctx, shown || ' ', w - 40).slice(0, o.maxLines || 4);
        const lh = fit.size * 1.22;
        const top = y + h / 2 - ((fit.lines.length - 1) * lh) / 2;
        lines.forEach((ln, i) => txt(ln, x + w / 2, top + i * lh, F_BODY(fit.size, 800), o.color || C.text, 'center', 'middle'));
      }

      function paperFrame(x, y, w, h) {
        ctx.fillStyle = 'rgba(0,0,0,.35)';
        U.roundRect(ctx, x + 5, y + 6, w, h, 14);
        ctx.fill();
        ctx.fillStyle = PAPER;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.fill();
      }

      /* Static drawings are rendered once into an offscreen canvas per size. */
      function strokesImage(entry, w, h) {
        const key = Math.round(w) + 'x' + Math.round(h);
        if (!entry.cache) entry.cache = {};
        if (key in entry.cache) return entry.cache[key];
        let el = null;
        try {
          el = document.createElement('canvas');
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          el.width = Math.max(1, Math.round(w * dpr));
          el.height = Math.max(1, Math.round(h * dpr));
          const c2 = el.getContext('2d');
          if (c2) {
            c2.setTransform(dpr, 0, 0, dpr, 0, 0);
            c2.fillStyle = PAPER;
            c2.fillRect(0, 0, w, h);
            drawStrokes(c2, entry.strokes, 0, 0, w / PW);
          } else {
            el = null;
          }
        } catch (e) {
          el = null;
        }
        entry.cache[key] = el;
        return el;
      }

      function drawEntryPaper(entry, x, y, w, h, limit) {
        paperFrame(x, y, w, h);
        ctx.save();
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.clip();
        const img = limit == null ? strokesImage(entry, w, h) : null;
        if (img) ctx.drawImage(img, x, y, w, h);
        else drawStrokes(ctx, entry.strokes, x, y, w / PW, limit);
        ctx.restore();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.stroke();
        if (!entry.strokes.length && limit == null) {
          txt('(blank page)', x + w / 2, y + h / 2, F_LABEL(Math.max(10, Math.min(15, w / 14))), '#8A86B0', 'center', 'middle');
        }
      }

      /* ---------- Setup ---------- */
      function setupBackdrop() {
        drawBackdrop();
        const t = clock;
        const items = [
          { x: 120, y: 150, rot: -0.08, text: 'a cat running a bakery', color: C.gold },
          { x: 600, y: 380, rot: 0.06, text: 'a lion selling bread?', color: C.mint }
        ];
        items.forEach((it) => drawThumbCard(ctx, it.x, it.y, 240, 120, it.text, it.color, it.rot + Math.sin(t + it.x) * 0.02, 99));
        ctx.save();
        ctx.translate(470, 250);
        ctx.rotate(-0.03);
        paperFrame(-130, -80, 260, 162);
        drawStrokes(ctx, CAT_DOODLE, -130, -80, 260 / PW, totalPts(CAT_DOODLE) * U.clamp((t % 6) / 3, 0, 1));
        ctx.restore();
      }

      function showSetup() {
        phase = 'setup';
        hideInputs();
        api.setScore('—');
        api.setStatus('Draw Relay: 3 to 8 players pass one device around.');
        api.menu({
          title: 'Draw Relay',
          text: 'Write a prompt, draw what you read, describe what you see, and pass the device on. ' +
            'Every prompt mutates down the line.\nHow many players?',
          buttons: [3, 4, 5, 6, 7, 8].map((n) => ({
            label: String(n),
            primary: n === count,
            onClick: () => { count = n; showTimerMenu(); }
          }))
        });
      }

      function showTimerMenu() {
        api.menu({
          title: 'Drawing time',
          text: 'How long does each drawing turn last? The drawing is sent automatically when time runs out.',
          buttons: [45, 60, 90].map((s) => ({
            label: s + ' seconds',
            primary: s === drawTime,
            onClick: () => { drawTime = s; showNamesMenu(); }
          })).concat([{ label: 'Back', onClick: showSetup }])
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
        phaseT = 0;
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
        api.setStatus('Type a name for each seat, in the order you will pass the device. Blank seats keep Player 1, 2…');
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
        txt('Seats go in passing order. Leave a box empty to keep the default name.', W / 2, 108, F_BODY(17), C.muted, 'center', 'middle');
        for (let i = 0; i < count; i++) {
          const s = nameSlot(i);
          txt('SEAT ' + (i + 1), s.x, s.y - 9, F_LABEL(13), seatColor(i), 'left', 'alphabetic');
        }
        button(150, 500, 160, 54, 'Back', {}, () => { hideInputs(); showNamesMenu(); });
        button(650, 500, 160, 54, 'Start', { color: C.violet }, confirmNames);
      }

      /* ---------- Game flow ---------- */
      function startGame(names) {
        players = names.slice();
        chains = players.map((_, i) => ({ owner: i, entries: [] }));
        step = 0;
        seat = 0;
        usedPrompts = new Set();
        hinted.draw = hinted.describe = hinted.reveal = false;
        api.sfx('power');
        showCover();
      }

      function showCover() {
        phase = 'cover';
        phaseT = 0;
        hideInputs();
        const name = players[seat];
        const kind = kindOf(step);
        const text = kind === 'write'
          ? name + ', write a prompt to start your own chain. Everyone else, look away.'
          : kind === 'draw'
            ? name + ', you will see a few words. Draw them before the ' + drawTime + ' s timer runs out. Everyone else, look away.'
            : name + ', you will see a drawing. Describe it in a few words. Everyone else, look away.';
        api.setScore(turnNo() + '/' + totalTurns());
        api.setStatus('Turn ' + turnNo() + ' of ' + totalTurns() + ': pass the device to ' + name + '.');
        api.sfx('flip');
        api.menu({
          title: 'Pass to ' + name,
          text,
          buttons: [{ label: "I'm " + name + ', start', primary: true, onClick: beginTurn }]
        });
      }

      function beginTurn() {
        phaseT = 0;
        toast = null;
        const kind = kindOf(step);
        const name = players[seat];
        if (kind === 'write') {
          phase = 'write';
          autoPicked = false;
          const r = getInput('text', 60);
          showInput(r, 180, 262, 600, 58, 'e.g. ' + U.pick(PROMPTS), '', submitWrite);
          focusInput(r);
          api.setStatus(name + ': write something fun to draw, or tap Give me one. Keep it short.');
        } else if (kind === 'draw') {
          phase = 'draw';
          strokes = [];
          undoStack = [];
          cur = null;
          curPointer = null;
          pointsUsed = 0;
          eraser = false;
          timeLeft = drawTime;
          lastSec = -1;
          paperDirty = true;
          api.setStatus(hinted.draw
            ? name + ': draw it! ' + drawTime + ' seconds.'
            : name + ': draw what the words say. No letters or numbers! Pick colors and sizes on the right; Z undoes.');
          hinted.draw = true;
        } else {
          phase = 'describe';
          emptyArmed = false;
          const r = getInput('text', 60);
          showInput(r, 150, 486, 470, 56, 'What does this drawing show?', '', submitDescribe);
          focusInput(r);
          api.setStatus(hinted.describe
            ? name + ': describe the drawing in a few words.'
            : name + ': describe what you see. The next player only gets your words, so the prompt starts to mutate.');
          hinted.describe = true;
        }
        api.sfx('blip');
      }

      function cleanText(s) {
        return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      }

      function randomPrompt() {
        const fresh = PROMPTS.filter((p) => !usedPrompts.has(p));
        const p = U.pick(fresh.length ? fresh : PROMPTS);
        usedPrompts.add(p);
        return p;
      }

      function giveMeOne() {
        if (phase !== 'write') return;
        const r = inputs.text;
        r.el.value = randomPrompt();
        autoPicked = true;
        focusInput(r, true);
        api.sfx('flip');
        say('Here is one. Edit it or submit it.', C.mint);
      }

      function submitWrite() {
        if (phase !== 'write') return;
        const text = cleanText(valueOf(inputs.text));
        if (!text) {
          giveMeOne();
          say('Empty! We picked one for you. Submit again to keep it.', C.gold);
          shakeT = 0.4;
          return;
        }
        usedPrompts.add(text);
        commit({ type: 'text', author: seat, text });
      }

      function submitDescribe() {
        if (phase !== 'describe') return;
        const text = cleanText(valueOf(inputs.text));
        if (!text) {
          if (!emptyArmed) {
            emptyArmed = true;
            shakeT = 0.4;
            api.sfx('hit');
            say('Type your best guess. Stuck? Submit again to pass on "???".', C.gold);
            return;
          }
          commit({ type: 'text', author: seat, text: '???' });
          return;
        }
        commit({ type: 'text', author: seat, text });
      }

      function submitDraw(auto) {
        if (phase !== 'draw') return;
        endStroke();
        if (!auto && !strokes.length) {
          shakeT = 0.4;
          api.sfx('hit');
          say('Draw something first!', C.gold);
          return;
        }
        if (auto) api.sfx('boom');
        commit({ type: 'draw', author: seat, strokes: strokes.slice() }, auto ? "Time's up! Drawing sent." : null);
      }

      function commit(entry, note) {
        const c = chainFor(seat, step);
        chains[c].entries[step] = entry;
        hideInputs();
        sentPreview = entry;
        phase = 'sent';
        phaseT = 0;
        api.sfx('score');
        say(note || 'Sent down the line!', C.mint);
      }

      function advance() {
        seat++;
        if (seat >= N()) {
          seat = 0;
          step++;
        }
        if (step >= N()) startRevealIntro();
        else showCover();
      }

      /* ---------- Drawing input ---------- */
      function toPaper(p) {
        return {
          x: U.clamp((p.x - PAPER_RECT.x) / PK, 0, PW),
          y: U.clamp((p.y - PAPER_RECT.y) / PK, 0, PH)
        };
      }

      function startStroke(e, p) {
        if (pointsUsed >= MAX_POINTS) {
          say('This page is full of ink. Undo or clear to keep drawing.', C.gold);
          return;
        }
        const q = toPaper(p);
        undoStack.push(strokes);
        if (undoStack.length > 80) undoStack.shift();
        strokes = strokes.slice();
        cur = {
          color: eraser ? PAPER : INK_COLORS[colorIdx],
          size: eraser ? ERASER_SIZE[sizeIdx] : SIZES[sizeIdx],
          pts: [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10]
        };
        pointsUsed++;
        curPointer = e.pointerId == null ? 0 : e.pointerId;
        try { if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      }

      function extendStroke(p) {
        if (!cur) return;
        const q = toPaper(p);
        const n = cur.pts.length;
        const dx = q.x - cur.pts[n - 2];
        const dy = q.y - cur.pts[n - 1];
        if (dx * dx + dy * dy < 2.25) return;
        if (pointsUsed >= MAX_POINTS) return;
        cur.pts.push(Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10);
        pointsUsed++;
      }

      function endStroke() {
        if (!cur) return;
        strokes.push(cur);
        if (paperCache && !paperDirty) {
          try {
            paperCache.c.save();
            paperCache.c.beginPath();
            paperCache.c.rect(0, 0, PAPER_RECT.w, PAPER_RECT.h);
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
        pointsUsed = totalPts(strokes);
        paperDirty = true;
        api.sfx('tick');
      }

      function clearPaper() {
        if (phase !== 'draw') return;
        endStroke();
        if (!strokes.length) return;
        undoStack.push(strokes);
        strokes = [];
        pointsUsed = 0;
        paperDirty = true;
        api.sfx('hit');
        say('Cleared. Undo brings it back.', C.muted);
      }

      function ensurePaperCache() {
        if (paperCache && !paperDirty) return paperCache;
        try {
          if (!paperCache) {
            const el = document.createElement('canvas');
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            el.width = Math.round(PAPER_RECT.w * dpr);
            el.height = Math.round(PAPER_RECT.h * dpr);
            const c = el.getContext('2d');
            if (!c) return null;
            paperCache = { el, c, dpr };
          }
          const c = paperCache.c;
          c.setTransform(paperCache.dpr, 0, 0, paperCache.dpr, 0, 0);
          c.fillStyle = PAPER;
          c.fillRect(0, 0, PAPER_RECT.w, PAPER_RECT.h);
          drawStrokes(c, strokes, 0, 0, PK);
          paperDirty = false;
          return paperCache;
        } catch (e) {
          paperCache = null;
          return null;
        }
      }

      /* ---------- Reveal ---------- */
      function startRevealIntro() {
        phase = 'revealIntro';
        phaseT = 0;
        hideInputs();
        api.setScore('Reveal');
        api.setStatus('Every chain is complete. Gather round!');
        api.sfx('win');
        api.menu({
          title: 'Every chain is done!',
          text: 'Gather round. Each chain plays back from its first prompt to its last step. Use Next or the → key.',
          buttons: [{ label: 'Start the reveal', primary: true, onClick: () => openReveal(0, false) }]
        });
      }

      function openReveal(chain, gallery) {
        phase = 'reveal';
        rc = chain;
        ri = 0;
        rT = 0;
        fromGallery = gallery;
        api.sfx('flip');
        api.setScore('Chain ' + (rc + 1) + '/' + N());
        if (!hinted.reveal) {
          hinted.reveal = true;
          api.setStatus('Watch each prompt mutate down the line. Next or → to continue, ← to go back.');
        }
      }

      function entryDuration(e) {
        if (!e) return 0.6;
        if (e.type === 'draw') return U.clamp(totalPts(e.strokes) / 260, 0.6, 3);
        return U.clamp(e.text.length / 30, 0.4, 1.6);
      }

      function revealNext() {
        if (phase !== 'reveal') return;
        const entries = chains[rc].entries;
        const dur = ri < entries.length ? entryDuration(entries[ri]) + 0.45 : 0.6;
        if (rT < dur) {
          rT = 99; // finish the current animation first
          return;
        }
        ri++;
        rT = 0;
        if (ri > entries.length) {
          if (fromGallery || rc + 1 >= N()) {
            openGallery(!fromGallery);
            return;
          }
          rc++;
          ri = 0;
          api.setScore('Chain ' + (rc + 1) + '/' + N());
        }
        api.sfx(ri === entries.length ? 'score' : 'flip');
      }

      function revealBack() {
        if (phase !== 'reveal') return;
        if (ri > 0) {
          ri--;
        } else if (rc > 0 && !fromGallery) {
          rc--;
          ri = chains[rc].entries.length;
          api.setScore('Chain ' + (rc + 1) + '/' + N());
        } else {
          return;
        }
        rT = 99;
        api.sfx('tick');
      }

      function openGallery(first) {
        phase = 'gallery';
        phaseT = 0;
        api.setScore('Gallery');
        api.setStatus('Tap a chain to watch it again.');
        if (first) {
          api.sfx('win');
          showEndMenu();
        }
      }

      function showEndMenu() {
        api.menu({
          title: 'Relay complete!',
          text: N() + ' chains, ' + totalTurns() + ' turns. Which prompt mutated the most?',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startGame(players) },
            { label: 'Change setup', onClick: showSetup },
            { label: 'See the gallery', onClick: () => openGallery(false) }
          ]
        });
      }

      /* ---------- Input handlers ---------- */
      function onDown(e) {
        if (api.menuOpen) return;
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
        for (let i = hits.length - 1; i >= 0; i--) {
          const h = hits[i];
          if (inside(p, h)) {
            if (!h.disabled && h.fn) h.fn();
            return;
          }
        }
        if (phase === 'draw' && !cur && (e.button == null || e.button === 0) && inside(p, PAPER_RECT) && timeLeft > 0) {
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
        if (list && list.length) list.forEach((ev) => extendStroke(api.toCanvas(ev, canvas)));
        else extendStroke(p);
      }

      function onUp(e) {
        const id = e.pointerId == null ? 0 : e.pointerId;
        if (cur && id === curPointer) {
          extendStroke(api.toCanvas(e, canvas));
          endStroke();
        }
      }

      function onLeave(e) {
        pointer.over = false;
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
        if (phase === 'draw') {
          if (code.startsWith('Digit')) {
            const n = Number(code.slice(5));
            if (n >= 1 && n <= INK_COLORS.length) { colorIdx = n - 1; eraser = false; api.sfx('tick'); }
          } else if (code === 'KeyX') {
            sizeIdx = (sizeIdx + 1) % SIZES.length;
            api.sfx('tick');
          } else if (code === 'KeyE') {
            eraser = !eraser;
            api.sfx('tick');
          } else if (code === 'KeyZ') {
            undo();
          }
        } else if (phase === 'reveal') {
          if (e.repeat) return;
          if (code === 'ArrowRight' || code === 'Enter' || code === 'Space' || code === 'NumpadEnter') revealNext();
          else if (code === 'ArrowLeft') revealBack();
        } else if (phase === 'write' || phase === 'describe') {
          // Typing anywhere goes to the box.
          if (inputs.text && inputs.text.visible && (e.key || '').length === 1) focusInput(inputs.text);
          if (code === 'Enter' || code === 'NumpadEnter') {
            if (phase === 'write') submitWrite();
            else submitDescribe();
          }
        } else if (phase === 'names') {
          if (code === 'Enter' || code === 'NumpadEnter') confirmNames();
        } else if (phase === 'gallery') {
          if (code === 'Enter' && !e.repeat) showEndMenu();
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        phaseT += dt;
        rT += dt;
        shakeT = Math.max(0, shakeT - dt);
        if (toast) {
          toast.t += dt;
          if (toast.t > 3) toast = null;
        }
        if (phase === 'draw' && !api.menuOpen) {
          timeLeft -= dt;
          const sec = Math.ceil(timeLeft);
          if (sec !== lastSec) {
            lastSec = sec;
            if (sec <= 5 && sec > 0) api.sfx('tick');
            if (sec === 10) say('10 seconds left!', C.p1);
          }
          if (timeLeft <= 0) {
            timeLeft = 0;
            submitDraw(true);
          }
        } else if (phase === 'sent' && phaseT > 1.1) {
          advance();
        }
      }

      /* ---------- Render ---------- */
      function header(label, color, title) {
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, 76);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, 76, W, 2);
        const name = players[seat] || '';
        ctx.font = F_LABEL(13);
        const chipW = Math.min(180, ctx.measureText(name.toUpperCase()).width + 28);
        ctx.fillStyle = color;
        U.roundRect(ctx, 20, 14, chipW, 24, 12);
        ctx.fill();
        txt(name.toUpperCase(), 20 + chipW / 2, 27, F_LABEL(13), INK, 'center', 'middle');
        txt(label, 20, 60, F_LABEL(13), C.muted, 'left', 'middle');
        if (title) {
          const fit = fitText(ctx, title, 560, 2, [28, 24, 21, 18], (s) => F_BODY(s, 800));
          const lh = fit.size * 1.15;
          const top = 38 - ((fit.lines.length - 1) * lh) / 2;
          fit.lines.forEach((ln, i) => txt(ln, 500, top + i * lh, F_BODY(fit.size, 800), C.text, 'center', 'middle'));
        }
      }

      function drawCover() {
        drawBackdrop();
        const name = players[seat] || '';
        const col = seatColor(seat);
        // A sealed envelope bobbing gently: nothing secret on screen.
        const bob = Math.sin(clock * 2) * 6;
        ctx.save();
        ctx.translate(W / 2, 250 + bob);
        ctx.rotate(Math.sin(clock * 1.3) * 0.04);
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        U.roundRect(ctx, -150, -90, 310, 190, 18);
        ctx.fill();
        ctx.fillStyle = col;
        U.roundRect(ctx, -155, -95, 310, 190, 18);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-150, -88);
        ctx.lineTo(0, 15);
        ctx.lineTo(150, -88);
        ctx.stroke();
        ctx.fillStyle = C.p1;
        ctx.beginPath();
        ctx.arc(0, 15, 18, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        txt('PASS TO', W / 2, 400, F_LABEL(15), C.muted, 'center', 'middle');
        const fit = fitText(ctx, name, 700, 1, [40, 34, 28], F_TITLE);
        txt(fit.lines[0], W / 2, 445, F_TITLE(fit.size), col, 'center', 'middle');
        // Progress through the relay.
        const total = totalTurns();
        const done = turnNo() - 1;
        const bw = Math.min(600, total * 22);
        const x0 = W / 2 - bw / 2;
        for (let i = 0; i < total; i++) {
          const x = x0 + (i + 0.5) * (bw / total);
          ctx.fillStyle = i < done ? C.violet : i === done ? col : C.line;
          ctx.beginPath();
          ctx.arc(x, 520, i === done ? 6 : 4, 0, TAU);
          ctx.fill();
        }
        txt('Turn ' + (done + 1) + ' of ' + total, W / 2, 552, F_LABEL(13), C.muted, 'center', 'middle');
      }

      function drawWrite() {
        drawBackdrop();
        const col = seatColor(seat);
        header('STEP 1 · WRITE A PROMPT', col, 'Start your chain');
        txt('Write something fun to draw. The next player has to draw it!', W / 2, 150, F_BODY(20), C.text, 'center', 'middle');
        txt('Short and silly works best: a who, doing what, where.', W / 2, 185, F_BODY(17), C.muted, 'center', 'middle');
        const sx = shakeT > 0 ? Math.sin(shakeT * 60) * 6 * (shakeT / 0.4) : 0;
        if (inputs.text) inputs.text.x = 180 + sx;
        txt('YOUR PROMPT', 180, 250, F_LABEL(13), col, 'left', 'alphabetic');
        button(180, 344, 270, 54, 'Give me one', {}, giveMeOne);
        button(510, 344, 270, 54, 'Submit', { color: C.violet }, submitWrite);
        txt('Enter submits · No one else sees this until the reveal', W / 2, 480, F_LABEL(13), C.muted, 'center', 'middle');
      }

      function drawTools() {
        const x0 = 790;
        txt('INK', x0, 100, F_LABEL(13), C.muted, 'left', 'alphabetic');
        INK_COLORS.forEach((c, i) => {
          const bx = x0 + (i % 2) * 78;
          const by = 110 + Math.floor(i / 2) * 46;
          const active = !eraser && colorIdx === i;
          ctx.fillStyle = 'rgba(0,0,0,.4)';
          U.roundRect(ctx, bx + 3, by + 4, 70, 38, 10);
          ctx.fill();
          ctx.fillStyle = c;
          U.roundRect(ctx, bx, by, 70, 38, 10);
          ctx.fill();
          ctx.strokeStyle = active ? C.text : c === INK ? C.line : 'rgba(0,0,0,.25)';
          ctx.lineWidth = active ? 4 : 2;
          ctx.stroke();
          if (active) {
            ctx.fillStyle = c === INK ? C.text : INK;
            ctx.beginPath();
            ctx.arc(bx + 35, by + 19, 5, 0, TAU);
            ctx.fill();
          }
          hits.push({ x: bx, y: by, w: 70, h: 38, fn: () => { colorIdx = i; eraser = false; api.sfx('tick'); } });
          txt(String(i + 1), bx + 6, by + 11, F_LABEL(10), c === INK || c === '#8A5A3B' || c === '#8E6BFF' ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.45)', 'left', 'middle');
        });
        txt('BRUSH', x0, 306, F_LABEL(13), C.muted, 'left', 'alphabetic');
        SIZES.forEach((s, i) => {
          const bx = x0 + i * 52;
          const by = 316;
          const active = sizeIdx === i;
          ctx.fillStyle = active ? C.panel2 : C.panel;
          U.roundRect(ctx, bx, by, 46, 46, 10);
          ctx.fill();
          ctx.strokeStyle = active ? C.text : C.line;
          ctx.lineWidth = active ? 3 : 2;
          ctx.stroke();
          ctx.fillStyle = eraser ? PAPER : INK_COLORS[colorIdx] === INK ? C.text : INK_COLORS[colorIdx];
          ctx.beginPath();
          ctx.arc(bx + 23, by + 23, Math.max(2, (eraser ? ERASER_SIZE[i] : s) * PK / 2 * (eraser ? 0.6 : 1)), 0, TAU);
          ctx.fill();
          hits.push({ x: bx, y: by, w: 46, h: 46, fn: () => { sizeIdx = i; api.sfx('tick'); } });
        });
        button(x0, 374, 150, 40, eraser ? 'Eraser on' : 'Eraser', { color: eraser ? C.gold : null, active: eraser, font: F_BODY(16, 800) },
          () => { eraser = !eraser; api.sfx('tick'); });
        button(x0, 424, 72, 40, 'Undo', { font: F_BODY(15, 800), disabled: !undoStack.length }, undo);
        button(x0 + 78, 424, 72, 40, 'Clear', { font: F_BODY(15, 800), disabled: !strokes.length && !cur }, clearPaper);
        button(x0, 494, 150, 60, 'Done', { color: C.mint, font: F_BODY(20, 800) }, () => submitDraw(false));
      }

      function timerRing(x, y, r) {
        const frac = U.clamp(timeLeft / drawTime, 0, 1);
        const secs = Math.ceil(timeLeft);
        const urgent = secs <= 10;
        const pulse = urgent ? 1 + Math.max(0, Math.sin(clock * 10)) * 0.08 : 1;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(pulse, pulse);
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(0, 0, r + 4, 0, TAU);
        ctx.fill();
        ctx.lineWidth = 7;
        ctx.strokeStyle = C.line;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = urgent ? C.p1 : frac < 0.5 ? C.gold : C.mint;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.stroke();
        ctx.lineCap = 'butt';
        txt(String(Math.max(0, secs)), 0, 1, F_TITLE(17), urgent ? C.p1 : C.text, 'center', 'middle');
        ctx.restore();
      }

      function drawDraw() {
        drawBackdrop();
        const c = chainFor(seat, step);
        const prev = chains[c].entries[step - 1];
        header('STEP ' + (step + 1) + ' OF ' + N() + ' · DRAW THIS', seatColor(seat), prev ? '“' + prev.text + '”' : '');
        timerRing(912, 38, 26);
        const P = PAPER_RECT;
        const sx = shakeT > 0 ? Math.sin(shakeT * 60) * 6 * (shakeT / 0.4) : 0;
        paperFrame(P.x + sx, P.y, P.w, P.h);
        const cache = ensurePaperCache();
        ctx.save();
        U.roundRect(ctx, P.x + sx, P.y, P.w, P.h, 14);
        ctx.clip();
        if (cache) ctx.drawImage(cache.el, P.x + sx, P.y, P.w, P.h);
        else drawStrokes(ctx, strokes, P.x + sx, P.y, PK);
        if (cur) drawStroke(ctx, cur, P.x + sx, P.y, PK);
        // Brush preview under the pointer.
        if (pointer.over && inside(pointer, P) && !api.isTouch) {
          const r = (eraser ? ERASER_SIZE[sizeIdx] : SIZES[sizeIdx]) * PK / 2;
          ctx.strokeStyle = eraser ? '#8A86B0' : INK_COLORS[colorIdx];
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, Math.max(2, r), 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 3;
        U.roundRect(ctx, P.x + sx, P.y, P.w, P.h, 14);
        ctx.stroke();
        if (!strokes.length && !cur) {
          txt(api.isTouch ? 'Draw here with your finger' : 'Draw here', P.x + P.w / 2, P.y + P.h / 2, F_BODY(22, 700), '#C9C6E0', 'center', 'middle');
        }
        drawTools();
        txt('No letters or numbers in your drawing!', P.x + 4, 580, F_LABEL(12), C.muted, 'left', 'middle');
      }

      function drawDescribe() {
        drawBackdrop();
        const c = chainFor(seat, step);
        const prev = chains[c].entries[step - 1];
        header('STEP ' + (step + 1) + ' OF ' + N() + ' · DESCRIBE THIS', seatColor(seat), 'What does this drawing show?');
        if (prev && prev.type === 'draw') drawEntryPaper(prev, 176, 96, 608, 380);
        const sx = shakeT > 0 ? Math.sin(shakeT * 60) * 6 * (shakeT / 0.4) : 0;
        if (inputs.text) inputs.text.x = 150 + sx;
        button(640, 486, 170, 56, 'Submit', { color: C.violet }, submitDescribe);
        txt('Enter submits · Your words are all the next player sees', W / 2, 568, F_LABEL(12), C.muted, 'center', 'middle');
      }

      function drawSent() {
        drawBackdrop();
        const k = U.clamp(phaseT / 0.8, 0, 1);
        const e = k * k;
        const x = U.lerp(W / 2, W + 260, e);
        const y = U.lerp(280, 120, e);
        const s = U.lerp(1, 0.4, e);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(e * 0.5);
        ctx.scale(s, s);
        ctx.fillStyle = seatColor(seat);
        U.roundRect(ctx, -170, -100, 340, 200, 18);
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-165, -95);
        ctx.lineTo(0, 20);
        ctx.lineTo(165, -95);
        ctx.stroke();
        ctx.restore();
        // Speed lines behind it.
        ctx.strokeStyle = U.alpha(C.text, 0.4 * (1 - k));
        ctx.lineWidth = 3;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(x - 220 - i * 18, y - 60 + i * 30);
          ctx.lineTo(x - 320 - i * 30, y - 60 + i * 30 + 20 * e);
          ctx.stroke();
        }
        txt('Sent!', W / 2, 470, F_TITLE(40), C.mint, 'center', 'middle');
        const nextName = seat + 1 < N() ? players[seat + 1] : step + 1 < N() ? players[0] : null;
        txt(nextName ? 'Next up: ' + nextName : 'That was the last turn!', W / 2, 520, F_BODY(20), C.muted, 'center', 'middle');
      }

      function entryLabel(e, after) {
        const who = players[e.author] || '';
        if (e.type === 'draw') return who + ' drew';
        return after ? who + ' guessed' : who + ' wrote';
      }

      function drawEntryBig(e, x, y, w, h, anim) {
        if (!e) return;
        if (e.type === 'draw') {
          const total = totalPts(e.strokes);
          const dur = entryDuration(e);
          const limit = anim ? total * U.clamp(rT / dur, 0, 1) : null;
          drawEntryPaper(e, x, y, w, h, limit != null && limit < total ? limit : null);
        } else {
          const typed = anim ? U.clamp(rT / entryDuration(e), 0, 1) * e.text.length : null;
          textCard(x, y, w, h, '“' + e.text + '”', { typed: typed == null ? null : typed + 1, maxLines: 4, sizes: w > 400 ? [38, 32, 28, 24, 20] : [24, 21, 18, 16, 14] });
        }
      }

      function drawMiniEntry(e, x, y, w, h, hidden) {
        if (hidden || !e) {
          ctx.fillStyle = C.panel;
          U.roundRect(ctx, x, y, w, h, 8);
          ctx.fill();
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          txt('?', x + w / 2, y + h / 2 + 1, F_TITLE(16), C.line, 'center', 'middle');
          return;
        }
        if (e.type === 'draw') {
          ctx.save();
          U.roundRect(ctx, x, y, w, h, 8);
          ctx.clip();
          const img = strokesImage(e, w, h);
          if (img) ctx.drawImage(img, x, y, w, h);
          else {
            ctx.fillStyle = PAPER;
            ctx.fillRect(x, y, w, h);
            drawStrokes(ctx, e.strokes, x, y, w / PW);
          }
          ctx.restore();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 2;
          U.roundRect(ctx, x, y, w, h, 8);
          ctx.stroke();
        } else {
          ctx.fillStyle = C.panel2;
          U.roundRect(ctx, x, y, w, h, 8);
          ctx.fill();
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
          const fit = fitText(ctx, e.text, w - 10, Math.max(1, Math.floor((h - 6) / 13)), [13, 12, 11, 10], (s) => F_BODY(s, 700));
          const lh = fit.size * 1.15;
          const top = y + h / 2 - ((fit.lines.length - 1) * lh) / 2;
          fit.lines.forEach((ln, i) => txt(ln, x + w / 2, top + i * lh, F_BODY(fit.size, 700), C.text, 'center', 'middle'));
        }
      }

      function drawArrow(x1, y1, x2, y2, color) {
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2 - 10, y2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - 16, y2 - 12);
        ctx.lineTo(x2 - 16, y2 + 12);
        ctx.closePath();
        ctx.fill();
        ctx.lineCap = 'butt';
      }

      function drawReveal() {
        drawBackdrop();
        const chain = chains[rc];
        const entries = chain.entries;
        const L = entries.length;
        const owner = players[chain.owner] || '';
        ctx.fillStyle = C.panel;
        ctx.fillRect(0, 0, W, 64);
        txt('CHAIN ' + (rc + 1) + ' OF ' + N(), 24, 24, F_LABEL(13), C.muted, 'left', 'middle');
        txt(owner + "'s chain", 24, 46, F_BODY(20, 800), seatColor(chain.owner), 'left', 'middle');
        // Progress dots: entries + summary.
        for (let i = 0; i <= L; i++) {
          const x = W - 30 - (L - i) * 22;
          ctx.fillStyle = i < ri ? C.violet : i === ri ? C.gold : C.line;
          ctx.beginPath();
          ctx.arc(x, 34, i === ri ? 7 : 5, 0, TAU);
          ctx.fill();
        }
        const slide = 1 - Math.pow(1 - U.clamp(rT / 0.45, 0, 1), 3);
        const animT = Math.max(0, rT - 0.35);
        const saveRT = rT;
        if (ri === 0) {
          const e = entries[0];
          txt(entryLabel(e, false).toUpperCase() + ' THE PROMPT', W / 2, 110, F_LABEL(15), seatColor(e.author), 'center', 'middle');
          ctx.globalAlpha = slide;
          rT = animT;
          drawEntryBig(e, 160, 140 + (1 - slide) * 40, 640, 270, true);
          rT = saveRT;
          ctx.globalAlpha = 1;
        } else if (ri < L) {
          const prev = entries[ri - 1];
          const e = entries[ri];
          txt(entryLabel(prev, ri - 1 > 0).toUpperCase(), 40, 112, F_LABEL(13), seatColor(prev.author), 'left', 'middle');
          drawEntryBig(prev, 40, 128, 290, 182, false);
          drawArrow(345, 220, 410, 220, U.alpha(C.text, 0.7));
          txt('became', 378, 250, F_LABEL(12), C.muted, 'center', 'middle');
          const lbl = e.type === 'draw' ? players[e.author] + ' drew' : players[e.author] + ' described it as';
          ctx.globalAlpha = slide;
          txt(lbl.toUpperCase(), 430, 100, F_LABEL(15), seatColor(e.author), 'left', 'middle');
          rT = animT;
          drawEntryBig(e, 430 + (1 - slide) * 60, 118, 500, 312, true);
          rT = saveRT;
          ctx.globalAlpha = 1;
        } else {
          // Summary: where it started vs where it ended.
          const first = entries[0];
          const last = entries[L - 1];
          txt('STARTED AS', 40, 112, F_LABEL(15), C.gold, 'left', 'middle');
          drawEntryBig(first, 40, 128, 400, 250, false);
          txt('ENDED AS', 520, 112, F_LABEL(15), C.mint, 'left', 'middle');
          const pop = 1 + Math.max(0, 1 - rT * 3) * 0.08;
          ctx.save();
          ctx.translate(720, 253);
          ctx.scale(pop, pop);
          drawEntryBig(last, -200, -125, 400, 250, false);
          ctx.restore();
          drawArrow(448, 253, 508, 253, C.gold);
          // Confetti burst.
          if (rT < 1.6) {
            for (let i = 0; i < 28; i++) {
              const a = i * 2.39;
              const d = 40 + rT * 260 * (0.5 + (i % 5) * 0.15);
              ctx.globalAlpha = U.clamp(1 - rT / 1.6, 0, 1);
              ctx.fillStyle = SEAT_COLORS[i % SEAT_COLORS.length];
              ctx.fillRect(480 + Math.cos(a) * d, 253 + Math.sin(a) * d + rT * rT * 80, 6, 6);
            }
            ctx.globalAlpha = 1;
          }
        }
        // Strip of the whole chain.
        const tileH = 54;
        const gap = 8;
        const tileW = Math.min(110, (W - 80 - gap * (L - 1)) / L);
        const total = tileW * L + gap * (L - 1);
        const x0 = W / 2 - total / 2;
        for (let i = 0; i < L; i++) {
          const x = x0 + i * (tileW + gap);
          drawMiniEntry(entries[i], x, 460, tileW, tileH, i > ri);
          if (i === ri) {
            ctx.strokeStyle = C.gold;
            ctx.lineWidth = 3;
            U.roundRect(ctx, x - 3, 457, tileW + 6, tileH + 6, 10);
            ctx.stroke();
          }
          txt(players[entries[i].author] || '', x + tileW / 2, 528, F_LABEL(10), U.alpha(C.text, i <= ri ? 0.75 : 0.3), 'center', 'middle');
        }
        button(24, 546, 140, 44, 'Back', { disabled: ri === 0 && (rc === 0 || fromGallery) }, revealBack);
        const lastScreen = ri >= L && (fromGallery || rc + 1 >= N());
        button(W - 164, 546, 140, 44, lastScreen ? 'Gallery' : 'Next', { color: C.violet }, revealNext);
        txt('→ / Space next · ← back', W / 2, 568, F_LABEL(12), C.muted, 'center', 'middle');
      }

      function drawGallery() {
        drawBackdrop();
        txt('Gallery', 24, 40, F_TITLE(28), C.text, 'left', 'middle');
        const gx = 24 + ctx.measureText('Gallery').width + 24;
        txt('Every chain, start to finish. Tap a row to watch it again.', gx, 42, F_BODY(17), C.muted, 'left', 'middle');
        const n = N();
        const top = 76;
        const avail = 460;
        const rowH = Math.min(96, avail / n);
        const labelW = 120;
        const gap = 6;
        const L = n;
        const tileH = rowH - 10;
        const tileW = Math.min(tileH * 1.6, (W - 48 - labelW - gap * (L - 1)) / L);
        for (let r = 0; r < n; r++) {
          const y = top + r * rowH;
          const rowRect = { x: 16, y, w: W - 32, h: rowH - 4 };
          const hot = pointer.over && inside(pointer, rowRect) && !api.menuOpen;
          ctx.fillStyle = hot ? C.panel2 : C.panel;
          U.roundRect(ctx, rowRect.x, rowRect.y, rowRect.w, rowRect.h, 10);
          ctx.fill();
          const owner = chains[r].owner;
          ctx.font = F_BODY(Math.min(16, rowH * 0.3), 800);
          const nm = fitText(ctx, players[owner], labelW - 16, 1, [16, 14, 12, 11], (s) => F_BODY(s, 800)).lines[0];
          txt(nm, 28, y + rowH / 2 - 2, F_BODY(Math.min(16, Math.max(11, rowH * 0.3)), 800), seatColor(owner), 'left', 'middle');
          for (let i = 0; i < L; i++) {
            drawMiniEntry(chains[r].entries[i], 16 + labelW + i * (tileW + gap), y + 3, tileW, tileH, false);
          }
          hits.push({ x: rowRect.x, y: rowRect.y, w: rowRect.w, h: rowRect.h, fn: () => openReveal(r, true) });
        }
        button(W / 2 - 230, 546, 210, 46, 'Play again', { color: C.violet }, () => startGame(players));
        button(W / 2 + 20, 546, 210, 46, 'Change setup', {}, showSetup);
      }

      function drawToast() {
        if (!toast) return;
        const a = U.clamp(Math.min(toast.t * 6, (3 - toast.t) * 3), 0, 1);
        if (a <= 0) return;
        ctx.globalAlpha = a;
        ctx.font = F_BODY(17, 800);
        const w = Math.min(W - 40, ctx.measureText(toast.text).width + 40);
        const y = phase === 'draw' ? 100 : phase === 'sent' ? 380 : phase === 'describe' ? 548 : phase === 'write' ? 416 : 214;
        const x = phase === 'draw' ? PAPER_RECT.x + PAPER_RECT.w / 2 : W / 2;
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
          case 'cover': drawCover(); break;
          case 'write': drawWrite(); break;
          case 'draw': drawDraw(); break;
          case 'describe': drawDescribe(); break;
          case 'sent': drawSent(); break;
          case 'reveal': drawReveal(); break;
          case 'gallery': drawGallery(); break;
          case 'revealIntro': setupBackdrop(); break;
          default: setupBackdrop();
        }
        drawToast();
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
