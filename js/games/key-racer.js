/* Key Racer — typing race where every correct letter drives your car toward the finish line. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TEXT_FONT = '600 20px "JetBrains Mono", monospace';
  const INK = '#0B0B1A';

  const START_X = 176;
  const FINISH_X = 904;
  const LANE_Y0 = 58;
  const LANE_H = 52;
  const PANEL = { x: 40, y: 318, w: 880, h: 188 };
  const INPUT = { x: 150, y: 522, w: 660, h: 50 };
  const LINE_H = 34;
  const STREAK_FOR_NITRO = 15;
  const NITRO_WORDS = 5;
  const NITRO_BONUS = 3;
  const DIFF = {
    easy: { wpm: 25, typo: 0.08, label: 'Easy' },
    normal: { wpm: 45, typo: 0.05, label: 'Normal' },
    hard: { wpm: 70, typo: 0.03, label: 'Hard' }
  };
  const BOT_NAMES = ['Captain Crumb', 'NoodleArm', 'Professor Paws', 'Turbo Tilly', 'Duchess Dash', 'Baron Backspace',
    'Sir Typesalot', 'Madame Margins'];
  const BOT_COLORS = [C.p2, C.mint, C.violet];

  /* Original passages: fun facts and tiny stories, 20 to 45 words each. */
  const PASSAGES = [
    'Octopuses have three hearts and blue blood. Two of the hearts pump blood to the gills, while the third keeps it moving through the rest of the body.',
    'Honey never really spoils. Its low water content and natural acidity make it a poor home for bacteria, so a sealed jar can stay good for many years.',
    'A day on Venus lasts longer than its year. The planet spins so slowly that it finishes a trip around the Sun before it turns once on its axis.',
    'Sea otters often hold paws while they sleep so the current does not carry them apart. Some also wrap themselves in kelp to stay in one place.',
    'The old lighthouse keeper painted every step of the spiral stairs a different color. On foggy nights he counted them aloud, and the rainbow always led him safely to the lamp.',
    'Bananas are berries, but strawberries are not. In botany a berry grows from a single flower with one ovary, and the strawberry breaks that rule in a messy way.',
    'Lightning is about five times hotter than the surface of the Sun. The air around a bolt heats so fast that it bursts outward, and that blast is the thunder we hear.',
    'Mira found a tiny robot in the park that only spoke in beeps. By the end of summer she understood every beep, and the robot had learned how to laugh.',
    'A group of flamingos is called a flamboyance. They turn pink from the shrimp and algae they eat, and their chicks hatch covered in soft gray fluff.',
    'You cannot see the Great Wall of China from the Moon with your own eyes. Astronauts say it is hard to spot even from low orbit without a camera.',
    'Cats spend around two thirds of their lives asleep. That means a nine year old cat has only been awake for about three of those years.',
    'Every evening the baker left one warm roll on the windowsill. Nobody ever saw who took it, but each morning a shiny button waited in its place.',
    'Smells are closely linked to memory. That is why the scent of sunscreen or fresh bread can carry you straight back to a moment from years ago.',
    'Snails can sleep through long dry spells. They seal the opening of their shells with a thin layer of mucus and wait for the rain before waking up.',
    'The tallest known tree is a coast redwood in California. It stands well over one hundred meters high, taller than a thirty story building.',
    'Captain Juniper steered her paper boat down the gutter river after the storm. She dodged two leaves, one sleepy beetle, and a waterfall made of drainpipe.',
    'Hummingbirds can fly backward and even upside down for a moment. Their wings beat so quickly that they hum, which is how the birds got their name.',
    'Wombats leave cube shaped droppings. Scientists think the shape helps them stay put on rocks and logs, where they work as smelly signposts for other wombats.',
    'Sound travels about four times faster in water than in air. Whales use this to call to each other across huge stretches of the ocean.',
    'The robot chef tried to make pancakes for the very first time. It flipped one so hard that it stuck to the ceiling, and everyone agreed it was the best one yet.',
    'Butterflies taste with their feet. When one lands on a leaf, sensors on its legs tell it whether the plant is a good place to lay eggs.',
    'There are more ways to shuffle a deck of cards than there are stars in our galaxy. Every good shuffle is almost certainly an order nobody has ever held before.',
    'On the first day of spring the town held a kite race. The winner was a small boy whose kite was made from his grandmother\'s old green umbrella.',
    'Lightning can strike the same place more than once. Tall buildings with lightning rods are hit again and again, sometimes many times in a single year.',
    'Koalas sleep up to twenty hours a day. Their diet of eucalyptus leaves gives them very little energy, so they rest as much as they possibly can.',
    'The Moon is slowly drifting away from Earth, a few centimeters every year. Long ago it looked much bigger in the night sky than it does today.',
    'Leo built a fort out of couch cushions and declared it a castle. His dog was named the royal guard, and the cat refused every offer to become queen.',
    'Penguins cannot fly through the air, but they are superb swimmers. Emperor penguins can dive more than five hundred meters deep to hunt for fish and squid.',
    'Water can boil and freeze at the same time. At one special mix of low pressure and cold, it bubbles and turns to ice all at once.',
    'The tiny dragon was afraid of fire, so it learned to breathe soap bubbles instead. Now the village children follow it everywhere on hot afternoons.',
    'Ants do not have lungs. Air moves through tiny holes along their bodies, and that is one reason an ant could never grow as large as a dog.',
    'A single puffy cloud can weigh as much as a hundred elephants. The water is spread across countless tiny droplets, so the cloud still floats on rising air.',
    'Grandpa kept a jar of buttons that each came with a story. The blue one, he said, fell off his coat during a snowball fight with a retired astronaut.',
    'Some turtles can take in oxygen through their back ends. In winter a few freshwater turtles stay under the ice and soak up what they need from the water.',
    'Saturn would float if you could find a bathtub big enough. The giant planet is made mostly of gas and is less dense than water.',
    'Every night the lamplighter\'s cat walked the same route along the rooftops. The neighbors set their clocks by her, and she was never once late.',
    'Giraffes have the same number of neck bones as people, just seven. Each one is simply much longer, and some measure more than twenty centimeters.',
    'Rain has a smell, and it even has a name: petrichor. It comes from plant oils and soil bacteria that rise into the air when the first drops fall.',
    'The tortoise and the snail agreed to race to the old oak tree. They both stopped for lunch halfway, laughed about it, and called the race a draw.',
    'Bees can learn to recognize human faces. They remember the pattern of eyes, nose and mouth the same way they learn the shapes of their favorite flowers.',
    'The blue whale is the largest animal known to have ever lived. Its tongue alone can weigh about as much as an elephant.',
    'Nina planted a single sunflower seed by the fence. By August the flower was taller than the house, and the bees lined up for it every morning.',
    'Stars twinkle because their light passes through moving layers of air. Planets shine more steadily, since they appear as tiny disks rather than single points.',
    'Mr. Patel\'s parrot learned to copy the doorbell. For a whole month the family kept running to the front door, and the parrot looked very pleased each time.',
    'Thousands of rubber ducks once spilled from a cargo ship into the Pacific Ocean. For years afterward, some of them washed up on beaches far across the world.'
  ];
  const recent = [];

  function drawRacer(ctx, x, y, a, color, scale, flame, wobble) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + (wobble || 0));
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(5,4,15,0.45)';
    U.roundRect(ctx, -13, -5.5, 32, 17, 6);
    ctx.fill();
    if (flame > 0) {
      const fl = 10 + flame * 14 + Math.random() * 6;
      ctx.fillStyle = U.alpha(C.p2, 0.85);
      ctx.beginPath();
      ctx.moveTo(-16, -5);
      ctx.lineTo(-16 - fl, 0);
      ctx.lineTo(-16, 5);
      ctx.fill();
      ctx.fillStyle = C.text;
      ctx.beginPath();
      ctx.moveTo(-16, -2.5);
      ctx.lineTo(-16 - fl * 0.55, 0);
      ctx.lineTo(-16, 2.5);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    ctx.fillRect(-12, -10, 8, 4);
    ctx.fillRect(-12, 6, 8, 4);
    ctx.fillRect(6, -10, 8, 4);
    ctx.fillRect(6, 6, 8, 4);
    ctx.fillStyle = color;
    U.roundRect(ctx, -16, -8, 32, 16, 6);
    ctx.fill();
    ctx.fillStyle = 'rgba(15,13,36,0.75)';
    U.roundRect(ctx, -5, -5.5, 12, 11, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(5, -4.5, 2, 9);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(9, -1.5, 6, 3);
    ctx.fillRect(-14, -1.5, 8, 3);
    ctx.fillStyle = 'rgba(15,13,36,0.9)';
    ctx.fillRect(-17.5, -8.5, 3, 17);
    ctx.restore();
  }

  const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  Arcade.register({
    id: 'key-racer',
    title: 'Key Racer',
    category: 'combat',
    mode: 'solo',
    players: '1P',
    best: 'high',
    formatScore: (n) => n + ' wpm',
    color: C.gold,
    tagline: 'Type a short passage as fast as you can to race three rival cars.',
    hook: 'Typos make your car skid, and clean streaks charge a nitro burst.',
    tags: ['typing', 'keyboard', 'racing', 'words', 'speed', 'wpm', 'education', 'computer opponent'],
    howTo: 'Type the highlighted word and press Space to move on. Every correct letter pushes your car toward the ' +
      'finish line, while three rivals type at their own pace. A typo makes your car skid to a stop until you fix it ' +
      'with Backspace. Type 15 words in a row without a mistake and nitro fires on its own: each of your next 5 ' +
      'words pushes your car 3 extra letters. Your score is your typing speed in words per minute.',
    controls: [
      { keys: ['A–Z'], label: 'Type the highlighted word' },
      { keys: ['Space'], label: 'Finish the word' },
      { keys: ['Backspace'], label: 'Fix a typo and stop skidding' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      // Three lanes of track.
      ctx.fillStyle = '#2A2748';
      ctx.fillRect(0, 18, 320, 108);
      ctx.strokeStyle = U.alpha(C.text, 0.25);
      ctx.lineWidth = 2;
      if (ctx.setLineDash) ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(0, 54);
      ctx.lineTo(320, 54);
      ctx.moveTo(0, 90);
      ctx.lineTo(320, 90);
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = k % 2 ? C.text : INK;
        ctx.fillRect(292, 18 + k * 18, 9, 18);
        ctx.fillStyle = k % 2 ? INK : C.text;
        ctx.fillRect(301, 18 + k * 18, 9, 18);
      }
      // Your car on nitro, a rival skidding.
      const run = (t * 14) % 26;
      drawRacer(ctx, 196 + run, 36, 0, C.gold, 1.15, 1, 0);
      ctx.strokeStyle = U.alpha(INK, 0.8);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(60, 66);
      ctx.quadraticCurveTo(90, 76, 112, 68);
      ctx.moveTo(60, 80);
      ctx.quadraticCurveTo(90, 88, 112, 82);
      ctx.stroke();
      drawRacer(ctx, 132, 74, 0, C.p2, 1.15, 0, 0.35 * Math.sin(t * 9 + 0.6));
      drawRacer(ctx, 150, 108, 0, C.mint, 1.15, 0, 0);
      ctx.font = '800 16px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText('+3', 240 + run, 36);
      // A line of typed text with one typo.
      ctx.fillStyle = C.panel;
      U.roundRect(ctx, 12, 140, 296, 48, 12);
      ctx.fill();
      ctx.font = '700 17px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      const parts = [['nitro ', C.mint], ['fir', C.mint], ['w', C.p1], ['s on', U.alpha(C.text, 0.7)]];
      let x = 26;
      parts.forEach(([s, col]) => {
        if (col === C.p1) {
          ctx.fillStyle = U.alpha(C.p1, 0.3);
          ctx.fillRect(x - 1, 152, s.length * 10.2 + 2, 26);
        }
        ctx.fillStyle = col;
        ctx.fillText(s, x, 165);
        x += s.length * 10.2;
      });
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const hasDom = typeof document !== 'undefined' && document && typeof document.createElement === 'function';

      let state = 'menu'; // 'menu' | 'count' | 'race' | 'done'
      let diff = 'normal';
      let passage = '';
      let words = [];
      let wordStart = [];
      let total = 1;
      let wi = 0;
      let doneChars = 0;
      let typedOk = 0;
      let inputVal = '';
      let errorNow = false;
      let wordErr = false;
      let streak = 0;
      let keysTyped = 0;
      let keysGood = 0;
      let typos = 0;
      let nitroFired = 0;
      let raceT = 0;
      let countT = 0;
      let goT = 0;
      let endT = 0;
      let clock = 0;
      let finishCount = 0;
      let me = null;
      let cars = [];
      let layout = null;
      let marks = [];
      let parts = [];
      let floats = [];
      let flash = 0;
      let lastScore = '';
      let toldAllHome = false;
      const told = {};

      /* ---------- The text box ---------- */
      let input = null;
      if (hasDom) {
        try {
          input = document.createElement('input');
          input.type = 'text';
          input.value = '';
          ['autocomplete', 'autocorrect', 'autocapitalize'].forEach((k) => input.setAttribute(k, 'off'));
          input.setAttribute('spellcheck', 'false');
          input.setAttribute('aria-label', 'Type the passage here');
          input.spellcheck = false;
          input.className = 'key-racer-input';
          const s = input.style;
          s.position = 'absolute';
          s.boxSizing = 'border-box';
          s.margin = '0';
          s.padding = '0 14px';
          s.background = '#FFFFFF';
          s.color = INK;
          s.border = '3px solid ' + INK;
          s.borderRadius = '12px';
          s.font = "700 18px 'Figtree', sans-serif";
          s.outline = 'none';
          s.boxShadow = '4px 4px 0 rgba(0,0,0,.45)';
          s.zIndex = '1';
          s.display = 'none';
          stage.appendChild(input);
        } catch (e) {
          input = null;
        }
      }

      function showInput(on) {
        if (!input) return;
        input.style.display = on ? 'block' : 'none';
        if (!on) {
          try { if (typeof input.blur === 'function') input.blur(); } catch (e) { /* ignore */ }
        }
        layoutInput();
      }

      function focusInput() {
        if (!input) return;
        try { if (typeof input.focus === 'function') input.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
      }

      function setInputValue(v) {
        inputVal = v;
        if (input) input.value = v;
      }

      /* Keeps the text box glued to its spot on the scaled canvas. */
      function layoutInput() {
        if (!input || input.style.display === 'none') return;
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
        const s = input.style;
        s.left = ((ox + INPUT.x * k) / sw * 100).toFixed(3) + '%';
        s.top = ((oy + INPUT.y * k) / sh * 100).toFixed(3) + '%';
        s.width = (INPUT.w * k / sw * 100).toFixed(3) + '%';
        s.height = (INPUT.h * k / sh * 100).toFixed(3) + '%';
        s.fontSize = Math.round(U.clamp(INPUT.h * k * 0.38, 12, 18)) + 'px';
        s.color = errorNow ? '#E0304A' : INK;
      }

      /* ---------- Passage ---------- */
      function pickPassage() {
        const pool = PASSAGES.map((p, i) => i).filter((i) => !recent.includes(i));
        const i = U.pick(pool.length ? pool : PASSAGES.map((p, k) => k));
        recent.push(i);
        while (recent.length > 12) recent.shift();
        return PASSAGES[i];
      }

      function setPassage(text) {
        passage = text;
        words = text.split(' ').filter((w) => w.length);
        wordStart = [];
        let c = 0;
        words.forEach((w) => {
          wordStart.push(c);
          c += w.length + 1;
        });
        total = text.length;
        layout = null;
      }

      const wordEnd = (i) => (i < words.length - 1 ? wordStart[i + 1] : total);
      const targetOf = (i) => (i < words.length - 1 ? words[i] + ' ' : words[i]);

      function buildLayout(charW) {
        const cols = Math.max(20, Math.floor((PANEL.w - 44) / charW));
        const lines = [];
        let lineStart = 0;
        let col = 0;
        for (let i = 0; i < words.length; i++) {
          if (col > 0 && col + words[i].length > cols) {
            lines.push({ start: lineStart, end: wordStart[i] });
            lineStart = wordStart[i];
            col = 0;
          }
          col += words[i].length + 1;
        }
        lines.push({ start: lineStart, end: total });
        return { charW, cols, lines };
      }

      /* ---------- Cars ---------- */
      function makeCar(name, color, human, wpm) {
        return {
          name, color, human, wpm, pos: 0, target: 0, typed: 0, bonus: 0, skidT: 0, slowT: 0, nitroT: 0,
          nitroLeft: 0, streak: 0, finished: false, finishT: 0, place: 0,
          // computer typing state
          rate: (wpm * 5) / 60, acc: 0, word: 0, wordMul: 1, pauseT: 0, typoAt: -1, wordErr: false
        };
      }

      function botNewWord(b) {
        const D = DIFF[diff];
        b.wordMul = U.rand(0.78, 1.22);
        b.typoAt = -1;
        if (b.word < words.length && Math.random() < D.typo) {
          b.typoAt = wordStart[b.word] + U.randInt(0, Math.max(0, words[b.word].length - 1));
        }
      }

      function skid(c) {
        c.skidT = 0.9;
        c.streak = 0;
        const y = laneY(cars.indexOf(c));
        const x = carX(c);
        marks.push({ x1: x - 30, y1: y - 7, x2: x - 6, y2: y - 4, life: 3 });
        marks.push({ x1: x - 30, y1: y + 7, x2: x - 6, y2: y + 4, life: 3 });
        for (let i = 0; i < 8; i++) {
          parts.push({ x: x - 16, y: y + U.rand(-8, 8), vx: U.rand(-80, -20), vy: U.rand(-40, 40), life: 0.5, max: 0.5,
            color: '#B8B3D9', size: U.rand(4, 8), puff: true });
        }
      }

      /* A word finished cleanly or not; handles streaks and nitro for anyone. */
      function wordDone(c, clean) {
        if (c.nitroLeft > 0) {
          c.nitroLeft--;
          c.bonus += NITRO_BONUS;
          c.nitroT = 0.6;
          if (c.human) floats.push({ text: '+' + NITRO_BONUS, x: carX(c) + 20, y: laneY(0) - 10, t: 0, color: C.p2 });
        }
        if (clean) c.streak++;
        else c.streak = 0;
        if (c.streak >= STREAK_FOR_NITRO) {
          c.streak = 0;
          c.nitroLeft = NITRO_WORDS;
          c.nitroT = 0.8;
          if (c.human) {
            nitroFired++;
            flash = 0.6;
            api.sfx('power');
            if (!told.nitro) {
              told.nitro = true;
              api.setStatus('Nitro! ' + STREAK_FOR_NITRO + ' clean words in a row: your next ' + NITRO_WORDS +
                ' words each push your car ' + NITRO_BONUS + ' extra letters.');
            }
          }
        }
      }

      function botStep(b, dt) {
        if (b.finished || b.typed >= total) return;
        if (b.pauseT > 0) {
          b.pauseT -= dt;
          if (b.pauseT <= 0) b.slowT = 0.6;
          b.skidT = Math.max(b.skidT, 0.2);
          return;
        }
        b.acc += dt * b.rate * b.wordMul;
        while (b.acc >= 1 && b.typed < total) {
          if (b.typoAt === b.typed) {
            // A computer typo: skid, fix it, carry on.
            b.typoAt = -1;
            b.wordErr = true;
            b.pauseT = U.rand(0.5, 1.0);
            b.acc = 0;
            skid(b);
            break;
          }
          b.acc -= 1;
          b.typed++;
          if (b.typed >= wordEnd(b.word)) {
            const endsSentence = /[.!?]$/.test(words[b.word]);
            wordDone(b, !b.wordErr);
            b.wordErr = false;
            b.word++;
            botNewWord(b);
            if (endsSentence) b.acc -= U.rand(0.5, 1.5) * b.rate * 0.25;
          }
        }
        b.target = b.typed + b.bonus;
      }

      function finishCar(c) {
        c.finished = true;
        c.finishT = raceT;
        finishCount++;
        c.place = finishCount;
        c.pos = total;
        for (let i = 0; i < 16; i++) {
          parts.push({ x: FINISH_X, y: laneY(cars.indexOf(c)) + U.rand(-14, 14), vx: U.rand(-60, 120), vy: U.rand(-120, 120),
            life: 0.7, max: 0.7, color: c.place === 1 ? C.gold : c.color, size: U.rand(2, 4) });
        }
        if (c.human) {
          showInput(false);
          state = 'done';
          endT = 0;
          api.sfx(c.place === 1 ? 'win' : 'score');
        }
      }

      function moveCar(c, dt) {
        c.skidT = Math.max(0, c.skidT - dt);
        c.slowT = Math.max(0, c.slowT - dt);
        c.nitroT = Math.max(0, c.nitroT - dt);
        if (c.finished) return;
        const goal = Math.min(total, c.target);
        const d = goal - c.pos;
        const vmax = c.slowT > 0 ? 4 : c.nitroT > 0 || c.nitroLeft > 0 ? 70 : 40;
        if (d > 0) {
          c.pos += Math.min(d, vmax * dt, Math.max(d * Math.min(1, dt * 9), 3 * dt));
          if (goal - c.pos < 0.01) c.pos = goal;
        } else if (d < 0) {
          c.pos = Math.max(goal, c.pos - 12 * dt);
        }
        if (c.pos >= total - 1e-6) finishCar(c);
      }

      const laneY = (i) => LANE_Y0 + LANE_H * (i + 0.5);
      const carX = (c) => START_X + (Math.min(total, c.pos) / Math.max(1, total)) * (FINISH_X - START_X);

      /* ---------- Typing ---------- */
      function recompute() {
        const target = targetOf(wi);
        let k = 0;
        while (k < inputVal.length && k < target.length && inputVal[k] === target[k]) k++;
        const ok = k === inputVal.length;
        typedOk = k;
        if (!ok && !errorNow) {
          // Typo: skid until it is fixed.
          typos++;
          wordErr = true;
          skid(me);
          me.streak = 0;
          api.sfx('hit');
          if (!told.typo) {
            told.typo = true;
            api.setStatus('Typo! Your car skids until you fix it with Backspace, and your clean streak resets.');
          }
        }
        if (ok && errorNow) me.slowT = 0.5;
        errorNow = !ok;
        me.target = doneChars + typedOk + me.bonus;
      }

      function onInput() {
        const raw = input ? String(input.value || '') : inputVal;
        if (state !== 'race') {
          if (raw) setInputValue('');
          return;
        }
        // Phones may swap in curly quotes; the passages use plain ones.
        let v = raw.replace(/[\r\n\t]/g, ' ').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
        // Count keystrokes that were added at the end, and whether each was right.
        if (v.length > inputVal.length && v.startsWith(inputVal)) {
          const target = targetOf(wi);
          let prefixOk = inputVal === target.slice(0, inputVal.length);
          for (let i = inputVal.length; i < v.length; i++) {
            keysTyped++;
            if (prefixOk && v[i] === target[i]) keysGood++;
            else prefixOk = false;
          }
        }
        // Complete words (more than one if the text arrived in a batch).
        let changed = false;
        while (wi < words.length) {
          const target = targetOf(wi);
          if (!v.startsWith(target)) break;
          doneChars += target.length;
          wordDone(me, !wordErr);
          wordErr = false;
          errorNow = false;
          wi++;
          v = v.slice(target.length);
          changed = true;
          if (me.streak >= 10 && !told.streak) {
            told.streak = true;
            api.setStatus((STREAK_FOR_NITRO - me.streak) + ' more clean words for nitro.');
          }
        }
        inputVal = v;
        if (input && (changed || input.value !== v)) input.value = v;
        if (wi >= words.length) {
          typedOk = 0;
          errorNow = false;
          me.target = total + me.bonus;
          setInputValue('');
          return;
        }
        recompute();
        updateScore();
      }

      /* ---------- Flow ---------- */
      function startRace() {
        setPassage(pickPassage());
        const D = DIFF[diff];
        const names = U.shuffle(BOT_NAMES.slice()).slice(0, 3);
        const muls = U.shuffle([0.86, 1, 1.12]);
        me = makeCar('You', C.gold, true, 0);
        cars = [me];
        names.forEach((n, i) => {
          const b = makeCar(n, BOT_COLORS[i], false, Math.round(D.wpm * muls[i] * U.rand(0.95, 1.05)));
          botNewWord(b);
          cars.push(b);
        });
        wi = 0;
        doneChars = 0;
        typedOk = 0;
        errorNow = false;
        wordErr = false;
        keysTyped = 0;
        keysGood = 0;
        typos = 0;
        nitroFired = 0;
        raceT = 0;
        countT = 3;
        goT = 0;
        endT = 0;
        finishCount = 0;
        marks = [];
        parts = [];
        floats = [];
        flash = 0;
        lastScore = '';
        toldAllHome = false;
        state = 'count';
        setInputValue('');
        if (input) {
          input.readOnly = true;
          input.setAttribute('placeholder', 'Get ready…');
        }
        showInput(true);
        focusInput();
        api.sfx('tick');
        api.setStatus('Type the highlighted word, then Space. Typos skid your car; ' + STREAK_FOR_NITRO +
          ' clean words in a row fire nitro.');
        updateScore();
      }

      function wpmNow() {
        const typed = doneChars + typedOk;
        return raceT > 0.5 ? Math.round((typed / 5) / (raceT / 60)) : 0;
      }
      const accNow = () => (keysTyped ? Math.round((keysGood / keysTyped) * 1000) / 10 : 100);

      function updateScore() {
        const s = wpmNow() + ' wpm';
        if (s !== lastScore) {
          lastScore = s;
          api.setScore(s);
        }
      }

      function showResults() {
        const wpm = Math.round(((doneChars + typedOk) / 5) / (Math.max(1, me.finishT) / 60));
        const isBest = api.reportScore(wpm);
        api.setScore(wpm + ' wpm');
        const title = isBest ? 'New best: ' + wpm + ' wpm!' : me.place === 1 ? 'You win!' : 'You finished ' + ordinal(me.place);
        const rivals = cars.filter((c) => !c.human).map((c) => c.name + ' ' + c.wpm + ' wpm').join(', ');
        api.setStatus(wpm + ' wpm at ' + accNow() + '% accuracy, ' + ordinal(me.place) + ' of ' + cars.length + '.');
        api.menu({
          title,
          text: wpm + ' wpm, ' + accNow() + '% accuracy, ' + ordinal(me.place) + ' of ' + cars.length + '. Typos ' + typos +
            ', nitro bursts ' + nitroFired + '. Rivals: ' + rivals + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: startRace },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        showInput(false);
        api.setStatus('Typos make your car skid, and ' + STREAK_FOR_NITRO + ' clean words in a row charge a nitro burst.');
        api.menu({
          title: 'Key Racer',
          text: 'Type the passage to drive your car. Pick how fast your three rivals type.',
          buttons: [
            { label: 'Easy · 25 wpm', onClick: () => { diff = 'easy'; startRace(); } },
            { label: 'Normal · 45 wpm', primary: true, onClick: () => { diff = 'normal'; startRace(); } },
            { label: 'Hard · 70 wpm', onClick: () => { diff = 'hard'; startRace(); } }
          ]
        });
      }

      /* ---------- Input listeners ---------- */
      if (input) {
        api.on(input, 'input', onInput);
        api.on(input, 'keydown', (e) => {
          // Inside our own box only: Enter has nothing to submit.
          if (e.key === 'Enter') e.preventDefault();
        });
        api.on(input, 'paste', (e) => { e.preventDefault(); });
        api.on(input, 'drop', (e) => { e.preventDefault(); });
      }
      api.on(canvas, 'pointerdown', () => {
        if (state === 'race' || state === 'count') focusInput();
      });
      api.on(window, 'keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || api.menuOpen) return;
        // Typing anywhere goes into the box.
        if ((state === 'race' || state === 'count') && (e.key || '').length === 1) focusInput();
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        flash = Math.max(0, flash - dt * 1.5);
        layoutInput();
        for (const m of marks) m.life -= dt;
        marks = marks.filter((m) => m.life > 0);
        for (const p of parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0);
        floats.forEach((f) => { f.t += dt; });
        floats = floats.filter((f) => f.t < 1);
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'race';
            goT = 0.8;
            api.sfx('blip');
            if (input) {
              input.readOnly = false;
              input.setAttribute('placeholder', 'Type the highlighted word, then Space');
            }
            setInputValue('');
            focusInput();
          } else if (Math.ceil(countT) !== prev) {
            api.sfx('tick');
          }
          return;
        }
        if (state !== 'race' && state !== 'done') return;
        goT = Math.max(0, goT - dt);
        if (state === 'race') raceT += dt;
        // Keep reading the box in case an input event was missed.
        if (state === 'race' && input && typeof input.value === 'string' && input.value !== inputVal) onInput();
        if (errorNow) me.skidT = Math.max(me.skidT, 0.25); // skid until the typo is fixed
        for (const c of cars) {
          if (!c.human) botStep(c, dt);
          moveCar(c, dt);
        }
        if (state === 'race') {
          updateScore();
          if (!toldAllHome && cars.every((c) => c.human || c.finished)) {
            toldAllHome = true;
            api.setStatus('Everyone else is home. Finish the passage to see your result.');
          }
        } else {
          endT += dt;
          if (endT > 1.4 && !api.menuOpen && state === 'done' && endT < 99) {
            endT = 100;
            showResults();
          }
        }
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = U.clamp(alpha, 0, 1);
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

      function drawTopBar() {
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        U.roundRect(ctx, 16, 10, W - 32, 38, 12);
        ctx.fill();
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const live = state === 'race' || state === 'done';
        const items = [
          ['WPM', live ? String(state === 'done' ? Math.round(((doneChars + typedOk) / 5) / (Math.max(1, me.finishT) / 60)) : wpmNow()) : '0', C.gold],
          ['ACCURACY', accNow() + '%', C.text],
          ['PLACE', me ? ordinal(placeOf(me)) + ' / ' + cars.length : '-', C.text],
          ['TIME', raceT.toFixed(1) + 's', C.text],
          ['LEVEL', DIFF[diff].label, C.muted]
        ];
        items.forEach(([k, v, col], i) => {
          const x = 34 + i * 184;
          ctx.fillStyle = C.muted;
          ctx.font = SMALL;
          ctx.fillText(k, x, 29);
          const kw = ctx.measureText(k).width;
          ctx.font = HUD;
          ctx.fillStyle = col;
          ctx.fillText(v, x + kw + 10, 29);
        });
      }

      function placeOf(c) {
        if (c.finished) return c.place;
        let p = finishCount + 1;
        for (const o of cars) if (o !== c && !o.finished && o.pos > c.pos) p++;
        return p;
      }

      function drawTrack() {
        const y0 = LANE_Y0;
        const y1 = LANE_Y0 + LANE_H * cars.length;
        // Grass verges and asphalt.
        ctx.fillStyle = '#16302A';
        ctx.fillRect(0, y0 - 6, W, y1 - y0 + 12);
        ctx.fillStyle = '#2A2748';
        ctx.fillRect(START_X - 30, y0, W - START_X + 30, y1 - y0);
        // Curbs.
        for (let x = START_X - 30; x < W; x += 20) {
          ctx.fillStyle = (Math.floor(x / 20) % 2) ? C.p1 : C.text;
          ctx.fillRect(x, y0 - 6, 20, 6);
          ctx.fillRect(x, y1, 20, 6);
        }
        // Lane lines.
        ctx.strokeStyle = U.alpha(C.text, 0.22);
        ctx.lineWidth = 2;
        if (ctx.setLineDash) ctx.setLineDash([14, 12]);
        ctx.beginPath();
        for (let i = 1; i < cars.length; i++) {
          ctx.moveTo(START_X - 30, y0 + i * LANE_H);
          ctx.lineTo(W, y0 + i * LANE_H);
        }
        ctx.stroke();
        if (ctx.setLineDash) ctx.setLineDash([]);
        // Distance markers.
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const q of [0.25, 0.5, 0.75]) {
          const x = START_X + q * (FINISH_X - START_X);
          ctx.strokeStyle = U.alpha(C.text, 0.1);
          ctx.beginPath();
          ctx.moveTo(x, y0);
          ctx.lineTo(x, y1);
          ctx.stroke();
        }
        // Start and finish.
        ctx.fillStyle = U.alpha(C.text, 0.6);
        ctx.fillRect(START_X - 2, y0, 4, y1 - y0);
        const sq = 9;
        for (let y = y0, n = 0; y < y1; y += sq, n++) {
          ctx.fillStyle = n % 2 ? C.text : INK;
          ctx.fillRect(FINISH_X, y, sq, Math.min(sq, y1 - y));
          ctx.fillStyle = n % 2 ? INK : C.text;
          ctx.fillRect(FINISH_X + sq, y, sq, Math.min(sq, y1 - y));
        }
        // Names on the left.
        cars.forEach((c, i) => {
          const y = laneY(i);
          ctx.fillStyle = c.human ? U.alpha(C.gold, 0.18) : U.alpha(C.panel, 0.9);
          U.roundRect(ctx, 12, y - 20, START_X - 52, 40, 10);
          ctx.fill();
          ctx.textAlign = 'left';
          ctx.font = c.human ? HUD : SMALL;
          ctx.fillStyle = c.color;
          ctx.fillText(c.name.length > 14 ? c.name.slice(0, 13) + '…' : c.name, 22, y - 6);
          ctx.font = SMALL;
          ctx.fillStyle = C.muted;
          const sub = c.human ? (c.nitroLeft > 0 ? 'nitro ×' + c.nitroLeft : 'streak ' + c.streak + '/' + STREAK_FOR_NITRO)
            : c.wpm + ' wpm' + (c.nitroLeft > 0 ? ' · nitro' : '');
          ctx.fillStyle = c.nitroLeft > 0 ? C.p2 : C.muted;
          ctx.fillText(sub, 22, y + 10);
        });
        // Skid marks.
        ctx.strokeStyle = U.alpha(INK, 0.75);
        ctx.lineWidth = 3;
        for (const m of marks) {
          ctx.globalAlpha = Math.min(1, m.life);
          ctx.beginPath();
          ctx.moveTo(m.x1, m.y1);
          ctx.quadraticCurveTo((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2 + 3, m.x2, m.y2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        for (const p of parts) {
          if (!p.puff) continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.4;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - p.life / p.max), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Cars.
        cars.forEach((c, i) => {
          const x = carX(c);
          const y = laneY(i);
          const wob = c.skidT > 0 ? Math.sin(clock * 38) * 0.3 * Math.min(1, c.skidT * 2) : 0;
          const flame = c.nitroT > 0 ? 1 : c.nitroLeft > 0 ? 0.55 : 0;
          if (flame > 0) {
            ctx.strokeStyle = U.alpha(C.p2, 0.4);
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let k = -1; k <= 1; k++) {
              const off = ((clock * 300 + k * 37) % 60);
              ctx.moveTo(x - 30 - off, y + k * 8);
              ctx.lineTo(x - 50 - off, y + k * 8);
            }
            ctx.stroke();
          }
          drawRacer(ctx, x, y, 0, c.color, 1.3, flame, wob);
          if (c.finished) {
            ctx.font = '800 14px Unbounded, sans-serif';
            ctx.textAlign = 'right';
            ctx.fillStyle = c.place === 1 ? C.gold : C.text;
            ctx.fillText(ordinal(c.place), FINISH_X - 30, y - 1);
          }
        });
        for (const p of parts) {
          if (p.puff) continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = '800 16px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        floats.forEach((f) => {
          ctx.globalAlpha = 1 - f.t;
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y - f.t * 24);
        });
        ctx.globalAlpha = 1;
      }

      function drawStreak() {
        const y = 292;
        const x0 = 176;
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const on = me && me.nitroLeft > 0;
        ctx.fillStyle = on ? C.p2 : C.muted;
        ctx.fillText(on ? 'NITRO' : 'CLEAN STREAK', 40, y);
        for (let k = 0; k < STREAK_FOR_NITRO; k++) {
          const lit = on ? true : me && k < me.streak;
          ctx.fillStyle = on ? (k < me.nitroLeft * 3 ? C.p2 : U.alpha(C.p2, 0.25)) : lit ? C.gold : U.alpha(C.line, 0.9);
          U.roundRect(ctx, x0 + k * 30, y - 6, 24, 12, 6);
          ctx.fill();
        }
        ctx.fillStyle = on ? C.p2 : C.muted;
        ctx.textAlign = 'right';
        ctx.fillText(on ? me.nitroLeft + ' boosted words left' : (me ? me.streak : 0) + '/' + STREAK_FOR_NITRO + ' for nitro', W - 40, y);
      }

      function drawPassage() {
        ctx.fillStyle = U.alpha(C.panel, 0.92);
        U.roundRect(ctx, PANEL.x, PANEL.y, PANEL.w, PANEL.h, 16);
        ctx.fill();
        ctx.strokeStyle = errorNow ? U.alpha(C.p1, 0.8) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        if (!words.length) {
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.muted;
          ctx.fillText('Pick a level to get a passage.', W / 2, PANEL.y + PANEL.h / 2);
          return;
        }
        ctx.font = TEXT_FONT;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        const cw = ctx.measureText('M').width || 12;
        if (!layout || Math.abs(layout.charW - cw) > 0.01) layout = buildLayout(cw);
        const L = layout.lines;
        const cur = Math.min(wi, words.length - 1);
        const ws = wordStart[cur];
        const we = wordEnd(cur);
        let curLine = 0;
        L.forEach((ln, i) => { if (ws >= ln.start) curLine = i; });
        const maxLines = Math.floor((PANEL.h - 20) / LINE_H);
        const first = Math.max(0, Math.min(curLine - 1, L.length - maxLines));
        const typing = state === 'race' && wi < words.length;
        const inLen = inputVal.length;
        for (let li = first; li < L.length && li < first + maxLines; li++) {
          const ln = L[li];
          const y = PANEL.y + 28 + (li - first) * LINE_H;
          const x0 = PANEL.x + 22;
          // Current word highlight.
          if (typing && ws >= ln.start && ws < ln.end) {
            const wx = x0 + (ws - ln.start) * cw;
            const wl = words[cur].length;
            ctx.fillStyle = U.alpha(errorNow ? C.p1 : C.gold, 0.16);
            U.roundRect(ctx, wx - 4, y - 15, wl * cw + 8, 30, 7);
            ctx.fill();
            ctx.fillStyle = errorNow ? C.p1 : C.gold;
            ctx.fillRect(wx, y + 13, wl * cw, 2);
          }
          for (let c = ln.start; c < ln.end; c++) {
            const ch = passage[c];
            const x = x0 + (c - ln.start) * cw;
            let col;
            if (c < doneChars || (!typing && wi >= words.length)) {
              col = U.alpha(C.mint, 0.75);
            } else if (typing && c >= ws && c < we) {
              const k = c - ws;
              if (k < typedOk) col = C.mint;
              else if (k < inLen) {
                col = C.p1;
                ctx.fillStyle = U.alpha(C.p1, 0.3);
                ctx.fillRect(x, y - 13, cw, 26);
              } else col = C.text;
            } else {
              col = U.alpha(C.text, 0.62);
            }
            if (ch !== ' ') {
              ctx.fillStyle = col;
              ctx.fillText(ch, x, y);
            }
          }
          // Extra letters typed past the end of the word.
          if (typing && inLen > we - ws && we > ln.start && we <= ln.end) {
            const x = x0 + (we - ln.start) * cw;
            ctx.fillStyle = U.alpha(C.p1, 0.5);
            ctx.fillRect(x, y - 13, Math.min(4, inLen - (we - ws)) * 4, 26);
          }
          // Caret.
          if (typing && Math.sin(clock * 8) > -0.2) {
            const cpos = ws + Math.min(inLen, we - ws);
            if (cpos >= ln.start && (cpos < ln.end || (cpos === ln.end && li === L.length - 1))) {
              ctx.fillStyle = errorNow ? C.p1 : C.gold;
              ctx.fillRect(x0 + (cpos - ln.start) * cw - 1, y - 13, 2, 26);
            }
          }
        }
        if (L.length > first + maxLines) {
          ctx.font = SMALL;
          ctx.textAlign = 'right';
          ctx.fillStyle = C.muted;
          ctx.fillText('more below', PANEL.x + PANEL.w - 16, PANEL.y + PANEL.h - 12);
        }
      }

      function drawBottom() {
        ctx.font = SMALL;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('Space: next word', 26, INPUT.y + INPUT.h / 2);
        ctx.textAlign = 'right';
        ctx.fillText('Backspace: fix', W - 26, INPUT.y + INPUT.h / 2);
        if (!input || state === 'menu') {
          // Without a DOM box (or before a race) show where typing goes.
          ctx.fillStyle = U.alpha('#FFFFFF', state === 'menu' ? 0.12 : 1);
          U.roundRect(ctx, INPUT.x, INPUT.y, INPUT.w, INPUT.h, 12);
          ctx.fill();
          if (state !== 'menu') {
            ctx.textAlign = 'left';
            ctx.font = HUD;
            ctx.fillStyle = INK;
            ctx.fillText(inputVal, INPUT.x + 16, INPUT.y + INPUT.h / 2);
          }
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawTopBar();
        if (cars.length) drawTrack();
        else {
          ctx.fillStyle = '#16302A';
          ctx.fillRect(0, LANE_Y0 - 6, W, LANE_H * 4 + 12);
          ctx.fillStyle = '#2A2748';
          ctx.fillRect(0, LANE_Y0, W, LANE_H * 4);
          drawRacer(ctx, START_X - 10, laneY(1), 0, C.gold, 1.3, 0, 0);
        }
        drawStreak();
        drawPassage();
        drawBottom();
        if (state === 'count') {
          const n = Math.ceil(countT);
          const f = countT - Math.floor(countT);
          bigText(String(n), W / 2, 162, C.text, 1 + f * 0.4, Math.min(1, 0.3 + f));
        } else if (goT > 0) {
          bigText('Go!', W / 2, 162, C.mint, 1 + (0.8 - goT) * 0.5, Math.min(1, goT * 2));
        } else if (state === 'done' && me) {
          bigText(me.place === 1 ? 'You win!' : ordinal(me.place) + ' place', W / 2, 162, me.place === 1 ? C.gold : C.text, 0.9, Math.min(1, endT * 3));
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.p2, flash * 0.18);
          ctx.fillRect(0, 0, W, H);
        }
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
