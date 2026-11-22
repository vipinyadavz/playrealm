/* Switch Up: a shedding card game with PlayRealm's own deck.
   Match suit (color + shape), number or action; first to empty their hand wins the round.
   Twist: any 7 lets you swap your whole hand with a player of your choice. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const TAU = Math.PI * 2;
  const INK = '#0B0B1A';
  const F_TITLE = (s) => '800 ' + s + 'px Unbounded, sans-serif';
  const F_LABEL = (s) => '600 ' + s + 'px "JetBrains Mono", monospace';
  const F_BODY = (s, w) => (w || 600) + ' ' + s + 'px Figtree, sans-serif';
  const SUITS = [
    { name: 'coral circle', short: 'circle', color: C.p1, shape: 'circle' },
    { name: 'cyan triangle', short: 'triangle', color: C.p2, shape: 'triangle' },
    { name: 'gold square', short: 'square', color: C.gold, shape: 'square' },
    { name: 'mint diamond', short: 'diamond', color: C.mint, shape: 'diamond' }
  ];
  const HAND_SIZE = 7;
  const CW = 78; // hand card size
  const CH = 114;
  const PCW = 84; // pile card size
  const PCH = 122;
  const DECK_POS = { x: 405, y: 262 };
  const DISCARD_POS = { x: 535, y: 262 };
  const BOT_NAMES = ['Bot Nova', 'Bot Bolt', 'Bot Pip'];

  /* ---------- Deck ---------- */
  function buildDeck() {
    const deck = [];
    let id = 0;
    for (let s = 0; s < 4; s++) {
      for (let v = 0; v <= 9; v++) {
        deck.push({ id: id++, suit: s, kind: 'num', value: v });
        deck.push({ id: id++, suit: s, kind: 'num', value: v });
      }
      for (const k of ['skip', 'flip', 'plus2']) {
        deck.push({ id: id++, suit: s, kind: k, value: -1 });
        deck.push({ id: id++, suit: s, kind: k, value: -1 });
      }
    }
    for (let i = 0; i < 4; i++) {
      deck.push({ id: id++, suit: -1, kind: 'rainbow', value: -1 });
      deck.push({ id: id++, suit: -1, kind: 'plus4', value: -1 });
    }
    return deck;
  }

  const isWild = (c) => c.kind === 'rainbow' || c.kind === 'plus4';

  function cardName(c) {
    if (c.kind === 'rainbow') return 'Rainbow';
    if (c.kind === 'plus4') return '+4 Rainbow';
    const s = SUITS[c.suit].name;
    if (c.kind === 'num') return s + ' ' + c.value;
    return s + ' ' + (c.kind === 'skip' ? 'Skip' : c.kind === 'flip' ? 'Flip' : '+2');
  }

  /* ---------- Card art ---------- */
  function shapePath(ctx, shape, cx, cy, s) {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(cx, cy, s, 0, TAU);
    } else if (shape === 'triangle') {
      ctx.moveTo(cx, cy - s * 1.08);
      ctx.lineTo(cx + s * 1.02, cy + s * 0.78);
      ctx.lineTo(cx - s * 1.02, cy + s * 0.78);
      ctx.closePath();
    } else if (shape === 'square') {
      U.roundRect(ctx, cx - s * 0.85, cy - s * 0.85, s * 1.7, s * 1.7, s * 0.18);
    } else {
      ctx.moveTo(cx, cy - s * 1.12);
      ctx.lineTo(cx + s * 0.88, cy);
      ctx.lineTo(cx, cy + s * 1.12);
      ctx.lineTo(cx - s * 0.88, cy);
      ctx.closePath();
    }
  }

  function drawShape(ctx, shape, cx, cy, s, color, outline) {
    shapePath(ctx, shape, cx, cy, s);
    ctx.fillStyle = color;
    ctx.fill();
    if (outline) {
      ctx.strokeStyle = outline;
      ctx.lineWidth = Math.max(1.5, s * 0.1);
      ctx.stroke();
    }
  }

  function outlinedText(ctx, str, x, y, font, fill, stroke, lw) {
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.strokeText(str, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
  }

  function skipIcon(ctx, x, y, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = r * 0.28;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.7, y + r * 0.7);
    ctx.lineTo(x + r * 0.7, y - r * 0.7);
    ctx.stroke();
  }

  function flipIcon(ctx, x, y, r, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = r * 0.26;
    for (let k = 0; k < 2; k++) {
      const a0 = k ? Math.PI * 0.15 : Math.PI * 1.15;
      ctx.beginPath();
      ctx.arc(x, y, r, a0, a0 + Math.PI * 0.75);
      ctx.stroke();
      const a1 = a0 + Math.PI * 0.75;
      const ex = x + Math.cos(a1) * r;
      const ey = y + Math.sin(a1) * r;
      const tx = -Math.sin(a1);
      const ty = Math.cos(a1);
      ctx.beginPath();
      ctx.moveTo(ex + tx * r * 0.5, ey + ty * r * 0.5);
      ctx.lineTo(ex + Math.cos(a1) * r * 0.42, ey + Math.sin(a1) * r * 0.42);
      ctx.lineTo(ex - Math.cos(a1) * r * 0.42, ey - Math.sin(a1) * r * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  }

  function swapBadge(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.2, r * 0.22);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y - r * 0.25);
    ctx.lineTo(x + r * 0.5, y - r * 0.25);
    ctx.lineTo(x + r * 0.25, y - r * 0.5);
    ctx.moveTo(x + r * 0.5, y + r * 0.25);
    ctx.lineTo(x - r * 0.5, y + r * 0.25);
    ctx.lineTo(x - r * 0.25, y + r * 0.5);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  function cornerLabel(c) {
    if (c.kind === 'num') return String(c.value);
    if (c.kind === 'skip') return 'S';
    if (c.kind === 'flip') return 'F';
    if (c.kind === 'plus2') return '+2';
    if (c.kind === 'plus4') return '+4';
    return '★';
  }

  /* Card centred at the current origin. */
  function drawCardFace(ctx, c, w, h, chosen) {
    const r = w * 0.14;
    if (c.suit >= 0) {
      const s = SUITS[c.suit];
      ctx.fillStyle = '#FFFFFF';
      U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.fill();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = w * 0.09;
      U.roundRect(ctx, -w / 2 + w * 0.07, -h / 2 + w * 0.07, w - w * 0.14, h - w * 0.14, r * 0.7);
      ctx.stroke();
      drawShape(ctx, s.shape, 0, h * 0.02, w * 0.3, s.color, INK);
      const big = w * 0.36;
      if (c.kind === 'num') outlinedText(ctx, String(c.value), 0, h * 0.04, F_TITLE(Math.round(big)), '#FFFFFF', INK, Math.max(2, w * 0.06));
      else if (c.kind === 'plus2') outlinedText(ctx, '+2', 0, h * 0.04, F_TITLE(Math.round(big * 0.82)), '#FFFFFF', INK, Math.max(2, w * 0.06));
      else if (c.kind === 'skip') { skipIcon(ctx, 0, h * 0.03, w * 0.16, INK); skipIcon(ctx, 0, h * 0.03, w * 0.16 - 1, '#FFFFFF'); }
      else if (c.kind === 'flip') flipIcon(ctx, 0, h * 0.03, w * 0.16, '#FFFFFF');
      const cl = cornerLabel(c);
      const fs = Math.round(w * (cl.length > 1 ? 0.15 : 0.19));
      ctx.font = F_TITLE(fs);
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cl, -w / 2 + w * 0.23, -h / 2 + w * 0.25);
      ctx.save();
      ctx.rotate(Math.PI);
      ctx.fillText(cl, -w / 2 + w * 0.23, -h / 2 + w * 0.25);
      ctx.restore();
      if (c.kind === 'num' && c.value === 7) swapBadge(ctx, w / 2 - w * 0.23, -h / 2 + w * 0.25, w * 0.11, C.violet);
    } else {
      ctx.fillStyle = '#17142F';
      U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
      ctx.fill();
      // Four-color frame
      const inset = w * 0.07;
      const cols = [C.p1, C.p2, C.gold, C.mint];
      ctx.lineWidth = w * 0.07;
      const x0 = -w / 2 + inset;
      const y0 = -h / 2 + inset;
      const x1 = w / 2 - inset;
      const y1 = h / 2 - inset;
      [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]].forEach((s, i) => {
        ctx.strokeStyle = cols[i];
        ctx.beginPath();
        ctx.moveTo(s[0], s[1]);
        ctx.lineTo(s[2], s[3]);
        ctx.stroke();
      });
      const q = w * 0.14;
      const oy = c.kind === 'plus4' ? h * 0.1 : h * 0.02;
      drawShape(ctx, 'circle', -q, oy - q, q * 0.75, C.p1, INK);
      drawShape(ctx, 'triangle', q, oy - q, q * 0.75, C.p2, INK);
      drawShape(ctx, 'square', -q, oy + q, q * 0.75, C.gold, INK);
      drawShape(ctx, 'diamond', q, oy + q, q * 0.75, C.mint, INK);
      if (c.kind === 'plus4') outlinedText(ctx, '+4', 0, -h * 0.22, F_TITLE(Math.round(w * 0.26)), '#FFFFFF', INK, Math.max(2, w * 0.05));
      if (chosen != null && chosen >= 0) {
        ctx.strokeStyle = SUITS[chosen].color;
        ctx.lineWidth = w * 0.06;
        U.roundRect(ctx, -w / 2 - w * 0.08, -h / 2 - w * 0.08, w + w * 0.16, h + w * 0.16, r * 1.3);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.stroke();
  }

  function drawCardBack(ctx, w, h) {
    const r = w * 0.14;
    ctx.fillStyle = '#2A2456';
    U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.fill();
    ctx.save();
    U.roundRect(ctx, -w / 2 + 4, -h / 2 + 4, w - 8, h - 8, r * 0.7);
    ctx.clip();
    ctx.strokeStyle = U.alpha(C.violet, 0.35);
    ctx.lineWidth = Math.max(1.5, w * 0.05);
    for (let k = -h; k < w + h; k += w * 0.2) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + k, -h / 2);
      ctx.lineTo(-w / 2 + k - h, h / 2);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#1C1838';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.26, 0, TAU);
    ctx.fill();
    const q = w * 0.08;
    drawShape(ctx, 'circle', -q, -q, q * 0.7, C.p1);
    drawShape(ctx, 'triangle', q, -q, q * 0.7, C.p2);
    drawShape(ctx, 'square', -q, q, q * 0.7, C.gold);
    drawShape(ctx, 'diamond', q, q, q * 0.7, C.mint);
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    U.roundRect(ctx, -w / 2, -h / 2, w, h, r);
    ctx.stroke();
  }

  function drawCardAt(ctx, c, x, y, w, h, rot, faceUp, chosen) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    U.roundRect(ctx, -w / 2 + 3, -h / 2 + 4, w, h, w * 0.14);
    ctx.fill();
    if (faceUp && c) drawCardFace(ctx, c, w, h, chosen);
    else drawCardBack(ctx, w, h);
    ctx.restore();
  }

  Arcade.register({
    id: 'switch-up',
    title: 'Switch Up',
    category: 'party',
    mode: 'together',
    players: '1–4P',
    best: false,
    color: C.mint,
    tagline: 'Match suit, number or action and be the first to empty your hand.',
    hook: 'Play a 7 to swap your whole hand with another player.',
    tags: ['party', 'cards', 'card game', 'shedding', 'bots', 'hotseat', 'pass and play', 'family'],
    howTo: 'Everyone starts with 7 cards. On your turn, play one card that matches the top card by suit ' +
      '(color and shape), number or action, or play a Rainbow and pick the next suit. Can\'t play? Draw one; ' +
      'if it fits you may play it. Skip jumps the next player, Flip reverses the direction (with two players it works like Skip), ' +
      '+2 and +4 Rainbow make the next player draw and lose their turn. The twist: any 7 lets you swap your whole hand ' +
      'with a player of your choice. Going down to one card? Press Last card! before your turn ends, or draw 2 if someone ' +
      'calls you out first. Catch a player who forgot for the same penalty. First to empty their hand wins the round.',
    controls: [
      { keys: ['←', '→'], label: 'Select a card' },
      { keys: ['Enter', 'Space'], label: 'Play the selected card' },
      { keys: ['D'], label: 'Draw a card (or keep the drawn card)' },
      { keys: ['L'], label: 'Last card! (or catch someone who forgot)' },
      { keys: ['1–4'], label: 'Pick a suit after a Rainbow' },
      { keys: ['Mouse', 'Touch'], label: 'Tap a card, the pile or a button' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h * 0.6, 10, w / 2, h * 0.6, w * 0.6);
      g.addColorStop(0, U.alpha(C.mint, 0.25));
      g.addColorStop(1, U.alpha(C.mint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Two fans trading places around a big 7.
      const k = t === 0 ? 0 : (Math.sin(t * 1.6) + 1) / 2;
      const fan = (cx, cy, cards, faceUp, rot0) => {
        cards.forEach((c, i) => {
          const a = rot0 + (i - (cards.length - 1) / 2) * 0.16;
          drawCardAt(ctx, c, cx + Math.sin(a) * 60, cy - Math.cos(a) * 18 + 30, 44, 64, a, faceUp);
        });
      };
      const handA = [{ suit: 0, kind: 'num', value: 3 }, { suit: 1, kind: 'skip', value: -1 }, { suit: 2, kind: 'num', value: 9 }];
      const handB = [{ suit: 3, kind: 'num', value: 1 }, { suit: -1, kind: 'rainbow', value: -1 }];
      fan(U.lerp(70, 250, k), U.lerp(150, 60, k), handA, true, -0.2);
      fan(U.lerp(250, 70, k), U.lerp(60, 150, k), handB, true, 0.2);
      drawCardAt(ctx, { suit: 3, kind: 'num', value: 7 }, w / 2, h / 2 + 4, 74, 106, -0.08 + (t === 0 ? 0 : Math.sin(t * 2) * 0.04), true);
      // Swap arrows
      ctx.strokeStyle = C.violet;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + 4, 80, -2.6, -1.9);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w / 2, h / 2 + 4, 80, 0.55, 1.25);
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = C.violet;
      const arrowHead = (a, dirn) => {
        const x = w / 2 + Math.cos(a) * 80;
        const y = h / 2 + 4 + Math.sin(a) * 80;
        const tx = -Math.sin(a) * dirn;
        const ty = Math.cos(a) * dirn;
        ctx.beginPath();
        ctx.moveTo(x + tx * 10, y + ty * 10);
        ctx.lineTo(x - ty * 7, y + tx * 7);
        ctx.lineTo(x + ty * 7, y - tx * 7);
        ctx.closePath();
        ctx.fill();
      };
      arrowHead(-1.9, 1);
      arrowHead(1.25, 1);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      /* ---------- State ---------- */
      let phase = 'setup'; // setup | names | deal | turn | cover | chooseSuit | chooseSwap | roundOver
      let mode = 'bots';   // 'bots' | 'hotseat'
      let botCount = 2;
      let humanCount = 2;
      let extraBots = 0;
      let savedNames = [];
      let players = [];    // { name, bot, hand: [], wins, declared }
      let deck = [];
      let discard = [];
      let curSuit = 0;
      let current = 0;
      let dir = 1;
      let viewer = null;     // human whose hand is shown (hotseat)
      let lastViewer = null;
      let drawnCard = null;
      let selIdx = 0;
      let hoverIdx = -1;
      let botTimer = 0;
      let flights = [];
      let timers = [];
      let dealQueue = [];
      let dealAcc = 0;
      let windows = [];      // last-card windows: { pi, t, dur, catchAt, blocking, then, catcher }
      let banner = null;
      let shakeCard = null;
      let clock = 0;
      let hits = [];
      let pointer = { x: -999, y: -999, over: false };
      let pendingCard = null;
      let swapSel = 0;
      let suitSel = 0;
      let swapFx = null;
      let starter = 0;
      let busyN = 0;
      let turnId = 0;
      const hinted = { seven: false, two: false, start: false };

      const N = () => players.length;
      const humans = () => players.map((p, i) => (p.bot ? -1 : i)).filter((i) => i >= 0);
      const multiHuman = () => humans().length >= 2;
      const top = () => discard[discard.length - 1];
      const nextIdx = (from, k) => (((from + dir * k) % N()) + N()) % N();
      const persp = () => (viewer !== null ? viewer : lastViewer !== null ? lastViewer : humans()[0] || 0);
      const handFaceUp = () => mode === 'bots' || viewer !== null;
      const busy = () => flights.length > 0 || phase === 'deal' || busyN > 0;
      const hold = () => { busyN++; };
      const release = () => { busyN = Math.max(0, busyN - 1); };
      const isHumanTurn = () => phase === 'turn' && players[current] && !players[current].bot && viewer === current;

      function wait(sec, fn) {
        timers.push({ t: sec, fn });
      }

      /* ---------- Layout ---------- */
      function seatSlot(pi) {
        const rel = (((pi - persp()) % N()) + N()) % N();
        const n = N();
        if (rel === 0) return 'bottom';
        if (n === 2) return 'top';
        if (n === 3) return rel === 1 ? 'left' : 'right';
        return ['bottom', 'left', 'top', 'right'][rel];
      }

      const SLOT_CENTER = {
        bottom: { x: 480, y: 520 },
        left: { x: 86, y: 262 },
        top: { x: 480, y: 70 },
        right: { x: 874, y: 262 }
      };

      function handLayout(pi) {
        const p = players[pi];
        const n = p.hand.length;
        const slot = seatSlot(pi);
        const out = [];
        if (slot === 'bottom') {
          const spacing = n > 1 ? Math.min(60, 540 / (n - 1)) : 0;
          const total = spacing * (n - 1);
          for (let i = 0; i < n; i++) {
            const dx = i * spacing - total / 2;
            const norm = total ? dx / (total / 2 + 1) : 0;
            out.push({ x: 480 + dx, y: 528 + norm * norm * 12, rot: norm * 0.12, w: CW, h: CH });
          }
        } else if (slot === 'top') {
          const spacing = n > 1 ? Math.min(18, 240 / (n - 1)) : 0;
          const total = spacing * (n - 1);
          for (let i = 0; i < n; i++) out.push({ x: 480 - total / 2 + i * spacing, y: 74, rot: Math.PI, w: 42, h: 62 });
        } else {
          const spacing = n > 1 ? Math.min(14, 170 / (n - 1)) : 0;
          const total = spacing * (n - 1);
          const cx = slot === 'left' ? 64 : 896;
          for (let i = 0; i < n; i++) out.push({ x: cx, y: 270 - total / 2 + i * spacing, rot: slot === 'left' ? Math.PI / 2 : -Math.PI / 2, w: 42, h: 62 });
        }
        return out;
      }

      function nextSlotPos(pi) {
        const p = players[pi];
        p.hand.push(null);
        const lay = handLayout(pi);
        p.hand.pop();
        return lay[lay.length - 1] || { x: SLOT_CENTER[seatSlot(pi)].x, y: SLOT_CENTER[seatSlot(pi)].y, rot: 0, w: 42, h: 62 };
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

      function button(x, y, w, h, label, opts, fn) {
        const o = opts || {};
        const hot = !o.disabled && pointer.over && inside(pointer, { x, y, w, h }) && !api.menuOpen;
        const lift = hot ? 2 : 0;
        const glow = o.pulse ? 0.5 + 0.5 * Math.sin(clock * 8) : 0;
        ctx.globalAlpha = o.disabled ? 0.4 : 1;
        if (glow) {
          ctx.fillStyle = U.alpha(o.color || C.gold, 0.35 * glow);
          U.roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 16);
          ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        U.roundRect(ctx, x + 3, y + 4, w, h, 12);
        ctx.fill();
        ctx.fillStyle = o.color || C.panel2;
        U.roundRect(ctx, x, y - lift, w, h, 12);
        ctx.fill();
        if (!o.color) {
          ctx.strokeStyle = C.line;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        txt(label, x + w / 2, y + h / 2 - lift + (o.sub ? -7 : 1), o.font || F_BODY(17, 800), o.color ? INK : C.text, 'center', 'middle');
        if (o.sub) txt(o.sub, x + w / 2, y + h / 2 - lift + 12, F_LABEL(11), o.color ? INK : C.muted, 'center', 'middle');
        ctx.globalAlpha = 1;
        hits.push({ x, y, w, h, fn, disabled: !!o.disabled });
      }

      function showBanner(text, color) {
        banner = { text, color: color || C.gold, t: 0 };
      }

      function scoreText() {
        if (!players.length) return '—';
        if (mode === 'bots') {
          const bots = players.filter((p) => p.bot).reduce((a, p) => a + p.wins, 0);
          return 'You ' + players[0].wins + ' · Bots ' + bots;
        }
        return 'Wins ' + players.map((p) => p.wins).join('-');
      }

      /* ---------- Setup ---------- */
      function showSetup() {
        phase = 'setup';
        resetTable();
        players = [];
        api.setScore('—');
        api.setStatus('Switch Up: match suit, number or action. A 7 swaps hands!');
        api.menu({
          title: 'Switch Up',
          text: 'Shed your cards by matching suit, number or action. Any 7 lets you swap your whole hand with a player you choose.',
          buttons: [
            { label: 'Vs bots', primary: true, onClick: showBotsMenu },
            { label: 'Hotseat', onClick: showHumansMenu }
          ]
        });
      }

      function showBotsMenu() {
        api.menu({
          title: 'Vs bots',
          text: 'You against the computer. How many bots?',
          buttons: [1, 2, 3].map((n) => ({
            label: n + (n === 1 ? ' bot' : ' bots'),
            primary: n === botCount,
            onClick: () => {
              botCount = n;
              mode = 'bots';
              const list = [{ name: 'You', bot: false }];
              for (let i = 0; i < n; i++) list.push({ name: BOT_NAMES[i], bot: true });
              startMatch(list);
            }
          })).concat([{ label: 'Back', onClick: showSetup }])
        });
      }

      function showHumansMenu() {
        api.menu({
          title: 'Hotseat',
          text: 'Pass one device around. Hands stay hidden behind a cover screen between turns.\nHow many people?',
          buttons: [2, 3, 4].map((n) => ({
            label: n + ' people',
            primary: n === humanCount,
            onClick: () => { humanCount = n; extraBots = Math.min(extraBots, 4 - n); showFillMenu(); }
          })).concat([{ label: 'Back', onClick: showSetup }])
        });
      }

      function showFillMenu() {
        if (humanCount >= 4) {
          extraBots = 0;
          showNamesMenu();
          return;
        }
        const opts = [];
        for (let b = 0; b <= 4 - humanCount; b++) opts.push(b);
        api.menu({
          title: 'Add bots?',
          text: 'Bots can fill the empty seats at the table.',
          buttons: opts.map((b) => ({
            label: b === 0 ? 'No bots' : '+' + b + (b === 1 ? ' bot' : ' bots'),
            primary: b === extraBots,
            onClick: () => { extraBots = b; showNamesMenu(); }
          })).concat([{ label: 'Back', onClick: showHumansMenu }])
        });
      }

      function showNamesMenu() {
        const have = savedNames.slice(0, humanCount).some((n) => n);
        api.menu({
          title: 'Who is playing?',
          text: have
            ? 'Keep the names from last time, edit them, or go with Player 1 to Player ' + humanCount + '.'
            : 'Type everyone\'s name, or just play as Player 1 to Player ' + humanCount + '.',
          buttons: (have
            ? [{ label: 'Keep names', primary: true, onClick: () => startHotseat(namesFrom(savedNames)) },
              { label: 'Edit names', onClick: showNames }]
            : [{ label: 'Use Player 1–' + humanCount, primary: true, onClick: () => startHotseat(namesFrom([])) },
              { label: 'Type names', onClick: showNames }])
            .concat([{ label: 'Back', onClick: humanCount >= 4 ? showHumansMenu : showFillMenu }])
        });
      }

      function namesFrom(raw) {
        const out = [];
        for (let i = 0; i < humanCount; i++) {
          let n = String(raw[i] || '').replace(/\s+/g, ' ').trim().slice(0, 12);
          if (!n) n = 'Player ' + (i + 1);
          let name = n;
          let k = 2;
          while (out.concat(BOT_NAMES).some((o) => o.toLowerCase() === name.toLowerCase())) name = n + ' ' + k++;
          out.push(name);
        }
        return out;
      }

      function startHotseat(names) {
        mode = 'hotseat';
        const list = names.map((name) => ({ name, bot: false }));
        // Seat bots between people so play alternates where possible.
        for (let b = 0; b < extraBots; b++) list.splice(Math.min(list.length, 1 + b * 2), 0, { name: BOT_NAMES[b], bot: true });
        startMatch(list);
      }

      /* Name entry (DOM inputs over the canvas). */
      const inputs = {};

      function getInput(key) {
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
          el.maxLength = 12;
          el.setAttribute('maxlength', '12');
          el.className = 'switch-up-input';
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
        return r;
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

      function focusInput(r) {
        try {
          if (typeof r.el.focus === 'function') r.el.focus({ preventScroll: true });
          if (typeof r.el.select === 'function') r.el.select();
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

      function showNames() {
        phase = 'names';
        hideInputs();
        for (let i = 0; i < humanCount; i++) {
          const r = getInput('name' + i);
          r.x = 325;
          r.y = 150 + i * 74;
          r.w = 310;
          r.h = 48;
          r.el.placeholder = 'Player ' + (i + 1);
          r.el.setAttribute('placeholder', 'Player ' + (i + 1));
          r.el.value = savedNames[i] || '';
          r.visible = true;
          r.el.style.display = 'block';
          r.onEnter = () => {
            if (i + 1 < humanCount) focusInput(inputs['name' + (i + 1)]);
            else confirmNames();
          };
        }
        layoutInputs();
        focusInput(inputs.name0);
        api.setStatus('Type a name for each person. Blank boxes keep Player 1, 2…');
      }

      function confirmNames() {
        if (phase !== 'names') return;
        const raw = [];
        for (let i = 0; i < humanCount; i++) {
          const r = inputs['name' + i];
          raw.push(r && typeof r.el.value === 'string' ? r.el.value : '');
        }
        savedNames = raw;
        hideInputs();
        startHotseat(namesFrom(raw));
      }

      /* ---------- Match / round ---------- */
      function resetTable() {
        deck = [];
        discard = [];
        flights = [];
        timers = [];
        dealQueue = [];
        windows = [];
        drawnCard = null;
        pendingCard = null;
        banner = null;
        swapFx = null;
        busyN = 0;
        viewer = null;
        hideInputs();
      }

      function startMatch(list) {
        players = list.map((p) => ({ name: p.name, bot: p.bot, hand: [], wins: 0, declared: false }));
        lastViewer = null;
        hinted.seven = hinted.two = hinted.start = false;
        starter = U.randInt(0, players.length - 1);
        newRound();
      }

      function newRound() {
        resetTable();
        players.forEach((p) => { p.hand = []; p.declared = false; });
        deck = U.shuffle(buildDeck());
        dir = 1;
        starter = (starter + 1) % N();
        current = starter;
        selIdx = 0;
        viewer = mode === 'bots' ? 0 : null;
        if (mode === 'bots') lastViewer = 0;
        else if (lastViewer === null) lastViewer = humans()[0];
        phase = 'deal';
        dealAcc = 0;
        for (let r = 0; r < HAND_SIZE; r++) for (let k = 0; k < N(); k++) dealQueue.push((starter + k) % N());
        api.setScore(scoreText());
        api.setStatus('Dealing…');
        api.sfx('flip');
      }

      function refillDeck() {
        if (deck.length || discard.length <= 1) return;
        const t = discard.pop();
        deck = U.shuffle(discard);
        discard = [t];
        showBanner('Reshuffled', C.muted);
        api.sfx('flip');
      }

      function finishDeal() {
        // First discard: the first number card from the deck.
        let guard = 0;
        while (deck.length && deck[deck.length - 1].kind !== 'num' && guard++ < 200) deck.unshift(deck.pop());
        const first = deck.pop();
        hold();
        flights.push({
          card: first, x0: DECK_POS.x, y0: DECK_POS.y, x1: DISCARD_POS.x, y1: DISCARD_POS.y, r0: 0, r1: U.rand(-0.08, 0.08),
          w0: PCW, h0: PCH, w1: PCW, h1: PCH, t: 0, dur: 0.4, lift: 30, flip: true,
          done: () => {
            discard.push(first);
            first.rot = U.rand(-0.1, 0.1);
            curSuit = first.suit;
            release();
            phase = 'turn';
            if (!hinted.start) {
              hinted.start = true;
              api.setStatus('Match the suit (color and shape), the number or the action. A 7 lets you swap hands!');
            }
            startTurn();
          }
        });
      }

      /* ---------- Rules ---------- */
      function canPlay(c) {
        const t = top();
        if (!t) return true;
        if (isWild(c)) return true;
        if (c.suit === curSuit) return true;
        if (c.kind === 'num' && t.kind === 'num' && c.value === t.value) return true;
        if (c.kind !== 'num' && c.kind === t.kind) return true;
        return false;
      }

      function legalText() {
        const t = top();
        if (!t) return '';
        const s = SUITS[curSuit].name;
        let other = '';
        if (t.kind === 'num') other = (t.value === 8 ? ', an ' : ', a ') + t.value;
        else if (!isWild(t)) other = ', a ' + (t.kind === 'skip' ? 'Skip' : t.kind === 'flip' ? 'Flip' : '+2');
        return 'a ' + s + other + ' or a Rainbow';
      }

      /* ---------- Turns ---------- */
      function startTurn() {
        turnId++;
        drawnCard = null;
        const p = players[current];
        // A player's own turn closes any open window on them.
        windows = windows.filter((w) => w.pi !== current || w.blocking);
        if (p.bot) {
          phase = 'turn';
          if (mode === 'hotseat') viewer = null;
          botTimer = U.rand(0.75, 1.25);
          api.setStatus(p.name + ' is thinking…');
          return;
        }
        if (mode === 'hotseat' && multiHuman() && lastViewer !== current) {
          phase = 'cover';
          viewer = null;
          api.sfx('flip');
          api.setStatus('Pass the device to ' + p.name + '.');
          api.menu({
            title: 'Pass to ' + p.name,
            text: p.name + ', it is your turn. Everyone else, look away from the screen.',
            buttons: [{ label: "Show " + p.name + "'s hand", primary: true, onClick: () => beginHumanTurn() }]
          });
          return;
        }
        beginHumanTurn();
      }

      function beginHumanTurn() {
        const p = players[current];
        phase = 'turn';
        viewer = current;
        lastViewer = current;
        selIdx = Math.min(selIdx, Math.max(0, p.hand.length - 1));
        const legal = p.hand.filter(canPlay);
        const who = mode === 'bots' ? 'Your turn' : p.name + "'s turn";
        if (legal.some((c) => c.kind === 'num' && c.value === 7) && !hinted.seven) {
          hinted.seven = true;
          api.setStatus(who + ': you can play a 7! It lets you swap your whole hand with another player.');
        } else if (p.hand.length === 2 && legal.length && !hinted.two) {
          hinted.two = true;
          api.setStatus(who + ': two cards left! Press L (Last card!) before you play down to one.');
        } else if (legal.length) {
          api.setStatus(who + ': play ' + legalText() + '.');
        } else {
          api.setStatus(who + ': nothing matches. Draw a card (D or tap the pile).');
        }
        // Start the selection on a playable card.
        const first = p.hand.findIndex(canPlay);
        if (first >= 0 && !canPlay(p.hand[selIdx] || p.hand[0])) selIdx = first;
      }

      function humanPlay(idx) {
        if (!isHumanTurn() || busy() || api.menuOpen) return;
        const p = players[current];
        const c = p.hand[idx];
        if (!c) return;
        if (drawnCard && c !== drawnCard) {
          shakeCard = { card: c, t: 0.4 };
          api.sfx('hit');
          api.setStatus('You drew a card: play it or tap Keep.');
          return;
        }
        if (!canPlay(c)) {
          shakeCard = { card: c, t: 0.4 };
          api.sfx('hit');
          api.setStatus("That card doesn't match. Play " + legalText() + '.');
          return;
        }
        playCard(current, idx);
      }

      function playCard(pi, idx) {
        const p = players[pi];
        const c = p.hand[idx];
        const lay = handLayout(pi);
        const from = lay[idx] || { x: SLOT_CENTER[seatSlot(pi)].x, y: SLOT_CENTER[seatSlot(pi)].y, rot: 0, w: CW, h: CH };
        p.hand.splice(idx, 1);
        drawnCard = null;
        if (selIdx >= p.hand.length) selIdx = Math.max(0, p.hand.length - 1);
        hold();
        const faceVisible = !p.bot && handFaceUp() && seatSlot(pi) === 'bottom';
        c.rot = U.rand(-0.14, 0.14);
        flights.push({
          card: c, x0: from.x, y0: from.y, x1: DISCARD_POS.x, y1: DISCARD_POS.y, r0: from.rot, r1: c.rot,
          w0: from.w, h0: from.h, w1: PCW, h1: PCH, t: 0, dur: 0.38, lift: 60, flip: !faceVisible, faceStart: faceVisible,
          done: () => {
            discard.push(c);
            release();
            api.sfx('flip');
            resolvePlay(pi, c);
          }
        });
      }

      function resolvePlay(pi, c) {
        const p = players[pi];
        if (!p.hand.length) {
          roundWon(pi);
          return;
        }
        if (isWild(c)) {
          if (p.bot) {
            curSuit = botSuit(p);
            showBanner(p.name + ' picks ' + SUITS[curSuit].short, SUITS[curSuit].color);
            afterSuit(pi, c);
          } else {
            phase = 'chooseSuit';
            pendingCard = c;
            suitSel = 0;
            api.setStatus('Pick the next suit: tap one, or press 1–4.');
          }
          return;
        }
        curSuit = c.suit;
        afterSuit(pi, c);
      }

      function chooseSuit(s) {
        if (phase !== 'chooseSuit' || !pendingCard) return;
        curSuit = s;
        const c = pendingCard;
        pendingCard = null;
        phase = 'turn';
        api.sfx('power');
        showBanner(SUITS[s].short + '!', SUITS[s].color);
        afterSuit(current, c);
      }

      function afterSuit(pi, c) {
        const p = players[pi];
        if (c.kind === 'num' && c.value === 7 && p.hand.length > 0) {
          if (p.bot) {
            const target = botSwapTarget(pi);
            if (target >= 0) doSwap(pi, target, () => finishTurn(pi, c));
            else {
              showBanner(p.name + ' keeps their hand', C.muted);
              finishTurn(pi, c);
            }
          } else {
            phase = 'chooseSwap';
            pendingCard = c;
            swapSel = 0;
            api.setStatus('You played a 7: pick a player to swap whole hands with, or keep yours.');
          }
          return;
        }
        finishTurn(pi, c);
      }

      function swapOptions() {
        const out = [];
        for (let k = 1; k < N(); k++) out.push(nextIdx(current, k));
        out.push(-1);
        return out;
      }

      function chooseSwap(target) {
        if (phase !== 'chooseSwap' || !pendingCard) return;
        const c = pendingCard;
        pendingCard = null;
        phase = 'turn';
        if (target >= 0) doSwap(current, target, () => finishTurn(current, c));
        else {
          showBanner('No swap', C.muted);
          finishTurn(current, c);
        }
      }

      function doSwap(a, b, then) {
        const pa = players[a];
        const pb = players[b];
        hold();
        swapFx = { a, b, t: 0, dur: 0.8 };
        api.sfx('power');
        showBanner('Swap!', C.violet);
        wait(0.8, () => {
          const tmp = pa.hand;
          pa.hand = pb.hand;
          pb.hand = tmp;
          pa.declared = false;
          pb.declared = false;
          windows = windows.filter((w) => w.pi !== a && w.pi !== b);
          swapFx = null;
          release();
          selIdx = 0;
          const you = mode === 'bots' ? 0 : viewer;
          if (b === you && pa.bot) api.setStatus(pa.name + ' played a 7 and swapped hands with you!');
          else if (pb.bot && !pa.bot) api.setStatus('You swapped hands with ' + pb.name + '. They now hold your old cards.');
          else api.setStatus(pa.name + ' swapped hands with ' + pb.name + '.');
          then();
        });
      }

      function finishTurn(pi, c) {
        const p = players[pi];
        let steps = 1;
        let penalty = 0;
        if (c.kind === 'skip') {
          steps = 2;
          showBanner('Skip!', SUITS[c.suit].color);
        } else if (c.kind === 'flip') {
          if (N() === 2) steps = 2;
          else dir = -dir;
          showBanner('Flip!', SUITS[c.suit].color);
        } else if (c.kind === 'plus2') {
          penalty = 2;
          steps = 2;
        } else if (c.kind === 'plus4') {
          penalty = 4;
          steps = 2;
        }
        const go = () => {
          if (phase === 'roundOver' || phase === 'setup') return;
          if (penalty) {
            const victim = nextIdx(pi, 1);
            showBanner(players[victim].name + ' +' + penalty, C.p1);
            drawCards(victim, penalty, () => advanceFrom(pi, steps));
          } else {
            advanceFrom(pi, steps);
          }
        };
        if (p.hand.length === 1) {
          if (p.declared) {
            showBanner(p.name + ': Last card!', C.gold);
            api.sfx('blip');
            go();
          } else if (p.bot) {
            if (Math.random() < 0.85) {
              p.declared = true;
              showBanner(p.name + ': Last card!', C.gold);
              api.sfx('blip');
            } else {
              openWindow(pi, false, null);
            }
            go();
          } else {
            openWindow(pi, true, go);
          }
          return;
        }
        go();
      }

      function advanceFrom(pi, steps) {
        if (phase === 'roundOver' || phase === 'setup') return;
        current = nextIdx(pi, steps);
        startTurn();
      }

      /* ---------- Last card windows ---------- */
      function openWindow(pi, blocking, then) {
        const bots = players.map((p, i) => (p.bot && i !== pi ? i : -1)).filter((i) => i >= 0);
        let catchAt = Infinity;
        let catcher = -1;
        if (blocking) {
          // A human who played down to one: bots react, otherwise the table calls it after a moment.
          if (bots.length) {
            catcher = U.pick(bots);
            catchAt = U.rand(1.1, 2.0);
          } else {
            catchAt = 2.4;
          }
        } else if (bots.length && Math.random() < 0.5) {
          catcher = U.pick(bots);
          catchAt = U.rand(1.3, 2.4);
        }
        windows.push({ pi, t: 0, dur: blocking ? catchAt + 0.01 : 2.6, catchAt, catcher, blocking, then });
        if (blocking) {
          hold();
          api.setStatus('Down to one card! Press L or Last card! now, before someone calls you out.');
        } else {
          const anyHuman = humans().length > 0;
          if (anyHuman) api.setStatus(players[pi].name + ' forgot to call Last card! Press L to catch them.');
        }
      }

      function closeWindow(w) {
        windows = windows.filter((x) => x !== w);
        if (w.blocking) {
          release();
          if (w.then) w.then();
        }
      }

      function penalize(w, byName) {
        const p = players[w.pi];
        api.sfx('hit');
        showBanner((byName ? byName + ' caught ' : '') + p.name + '! +2', C.p1);
        api.setStatus(byName ? byName + ' called ' + p.name + ' out: draw 2.' : p.name + ' forgot to call Last card! Draw 2.');
        windows = windows.filter((x) => x !== w);
        const resume = () => {
          if (w.blocking) {
            release();
            if (w.then) w.then();
          }
        };
        drawCards(w.pi, 2, resume);
      }

      function pressLastCard() {
        if (api.menuOpen || phase === 'setup' || phase === 'names' || phase === 'roundOver') return;
        const me = mode === 'bots' ? 0 : viewer;
        // 1. My own open window: safe.
        const own = me !== null ? windows.find((w) => w.pi === me) : null;
        if (own) {
          players[me].declared = true;
          showBanner(players[me].name === 'You' ? 'Last card!' : players[me].name + ': Last card!', C.gold);
          api.sfx('score');
          api.setStatus('Safe! You called Last card in time.');
          closeWindow(own);
          return;
        }
        // 2. Catch someone else who forgot.
        const other = windows.find((w) => w.pi !== me && !players[w.pi].declared && players[w.pi].hand.length === 1);
        if (other) {
          penalize(other, me !== null ? players[me].name : 'Someone');
          return;
        }
        // 3. Pre-declare on my own turn.
        if (isHumanTurn() && me === current) {
          const p = players[me];
          if (p.hand.length <= 2) {
            p.declared = true;
            showBanner('Last card!', C.gold);
            api.sfx('blip');
            api.setStatus('Called it! Play down to one card safely.');
          } else {
            api.setStatus('Call Last card! when you are about to play down to one card.');
            api.sfx('hit');
          }
          return;
        }
        api.setStatus('Nobody to catch right now.');
      }

      /* ---------- Drawing cards ---------- */
      function drawCards(pi, n, done) {
        let left = n;
        const one = () => {
          if (left <= 0) {
            done();
            return;
          }
          refillDeck();
          if (!deck.length) {
            done();
            return;
          }
          left--;
          const c = deck.pop();
          const to = nextSlotPos(pi);
          const faceVisible = !players[pi].bot && handFaceUp() && seatSlot(pi) === 'bottom';
          hold();
          flights.push({
            card: c, x0: DECK_POS.x, y0: DECK_POS.y, x1: to.x, y1: to.y, r0: 0, r1: to.rot,
            w0: PCW, h0: PCH, w1: to.w, h1: to.h, t: 0, dur: 0.26, lift: 20, flip: faceVisible, faceStart: false,
            done: () => {
              players[pi].hand.push(c);
              players[pi].declared = false;
              release();
              api.sfx('tick');
              one();
            }
          });
        };
        one();
      }

      function humanDraw() {
        if (!isHumanTurn() || busy() || api.menuOpen) return;
        if (drawnCard) {
          keepDrawn();
          return;
        }
        refillDeck();
        if (!deck.length) {
          api.setStatus('The deck is empty. Your turn passes.');
          advanceFrom(current, 1);
          return;
        }
        const pi = current;
        const tid = turnId;
        drawCards(pi, 1, () => {
          if (tid !== turnId || phase !== 'turn') return;
          const p = players[pi];
          const c = p.hand[p.hand.length - 1];
          if (c && canPlay(c)) {
            drawnCard = c;
            selIdx = p.hand.length - 1;
            api.setStatus('You drew the ' + cardName(c) + '. It fits: play it, or tap Keep (D).');
          } else {
            api.setStatus('No match. Your turn passes.');
            hold();
            const tid = turnId;
            wait(0.7, () => {
              release();
              if (tid === turnId) advanceFrom(pi, 1);
            });
          }
        });
      }

      function keepDrawn() {
        if (!isHumanTurn() || !drawnCard) return;
        drawnCard = null;
        api.sfx('blip');
        advanceFrom(current, 1);
      }

      /* ---------- Bots ---------- */
      function suitCounts(hand) {
        const n = [0, 0, 0, 0];
        for (const c of hand) if (c.suit >= 0) n[c.suit]++;
        return n;
      }

      function botSuit(p) {
        const n = suitCounts(p.hand);
        const max = Math.max.apply(null, n);
        const best = [0, 1, 2, 3].filter((s) => n[s] === max);
        return U.pick(best);
      }

      function fewestOther(pi) {
        let best = -1;
        for (let i = 0; i < N(); i++) {
          if (i === pi) continue;
          if (best < 0 || players[i].hand.length < players[best].hand.length) best = i;
        }
        return best;
      }

      function botSwapTarget(pi) {
        const mine = players[pi].hand.length;
        const t = fewestOther(pi);
        if (t >= 0 && players[t].hand.length < mine) return t;
        return -1;
      }

      function botPick(pi) {
        const p = players[pi];
        const hand = p.hand;
        const nextP = players[nextIdx(pi, 1)];
        const nextCount = nextP.hand.length;
        const counts = suitCounts(hand);
        const fewest = fewestOther(pi);
        const fewCount = fewest >= 0 ? players[fewest].hand.length : 99;
        let best = -1;
        let bestScore = -Infinity;
        hand.forEach((c, i) => {
          if (!canPlay(c)) return;
          let s = Math.random() * 2;
          const after = hand.length - 1;
          if (c.kind === 'num') {
            s += 10 + c.value * 0.2;
            if (c.value === 7) s += fewCount < after - 1 ? 40 : -4;
          } else if (c.kind === 'skip' || c.kind === 'flip' || c.kind === 'plus2') {
            s += 14; // dump actions early
            if (c.kind === 'plus2' && nextCount <= 3) s += 18;
            if (c.kind === 'skip' && nextCount <= 2) s += 12;
            if (c.kind === 'flip' && N() === 2 && nextCount <= 2) s += 12;
          } else if (c.kind === 'rainbow') {
            s -= 25; // save Rainbows
            if (hand.length <= 2) s += 40;
          } else if (c.kind === 'plus4') {
            s -= 18;
            if (nextCount <= 2) s += 45;
            if (hand.length <= 2) s += 40;
          }
          if (c.suit >= 0) s += counts[c.suit] * 1.5;
          if (s > bestScore) {
            bestScore = s;
            best = i;
          }
        });
        return best;
      }

      function botAct() {
        const pi = current;
        const p = players[pi];
        if (!p || !p.bot) return;
        if (drawnCard) {
          const idx = p.hand.indexOf(drawnCard);
          const keep = drawnCard.kind === 'rainbow' && p.hand.length > 4;
          drawnCard = null;
          if (idx >= 0 && !keep && canPlay(p.hand[idx])) playCard(pi, idx);
          else advanceFrom(pi, 1);
          return;
        }
        const idx = botPick(pi);
        if (idx >= 0) {
          playCard(pi, idx);
          return;
        }
        refillDeck();
        if (!deck.length) {
          advanceFrom(pi, 1);
          return;
        }
        const tid = turnId;
        drawCards(pi, 1, () => {
          if (tid !== turnId || phase !== 'turn') return;
          const c = p.hand[p.hand.length - 1];
          if (c && canPlay(c)) {
            drawnCard = c;
            botTimer = 0.45;
          } else {
            hold();
            const tid = turnId;
            wait(0.45, () => {
              release();
              if (tid === turnId) advanceFrom(pi, 1);
            });
          }
        });
      }

      /* ---------- Round end ---------- */
      function roundWon(pi) {
        phase = 'roundOver';
        windows = [];
        busyN = 0;
        const p = players[pi];
        p.wins++;
        api.setScore(scoreText());
        const humanWon = !p.bot;
        api.sfx(humanWon ? 'win' : 'lose');
        showBanner(p.name === 'You' ? 'You win!' : p.name + ' wins!', C.gold);
        if (mode === 'hotseat') viewer = null;
        const tally = players.slice().sort((a, b) => b.wins - a.wins).map((x) => x.name + ': ' + x.wins).join('\n');
        api.setStatus((p.name === 'You' ? 'You emptied your hand' : p.name + ' emptied their hand') + ' and won the round.');
        wait(1.1, () => {
          if (phase !== 'roundOver') return;
          api.menu({
            title: p.name === 'You' ? 'You win the round!' : p.name + ' wins the round!',
            text: 'Round wins so far:\n' + tally,
            buttons: [
              { label: 'Play again', primary: true, onClick: newRound },
              { label: 'Change setup', onClick: showSetup }
            ]
          });
        });
      }

      /* ---------- Input ---------- */
      function handHit(p) {
        if (!players.length) return -1;
        const me = persp();
        if (seatSlot(me) !== 'bottom') return -1;
        const lay = handLayout(me);
        for (let i = lay.length - 1; i >= 0; i--) {
          const s = lay[i];
          const lift = i === hoverIdx ? 22 : 0;
          if (Math.abs(p.x - s.x) <= s.w / 2 && p.y >= s.y - s.h / 2 - lift && p.y <= s.y + s.h / 2 + 20) return i;
        }
        return -1;
      }

      api.on(canvas, 'pointerdown', (e) => {
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
        if (phase === 'turn' && isHumanTurn()) {
          const idx = handHit(p);
          if (idx >= 0) {
            selIdx = idx;
            humanPlay(idx);
            return;
          }
          if (Math.abs(p.x - DECK_POS.x) <= PCW / 2 + 6 && Math.abs(p.y - DECK_POS.y) <= PCH / 2 + 6) humanDraw();
        }
      });

      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        pointer = { x: p.x, y: p.y, over: true };
        hoverIdx = handFaceUp() ? handHit(p) : -1;
      });

      api.on(canvas, 'pointerleave', () => {
        pointer.over = false;
        hoverIdx = -1;
      });

      api.on(window, 'keydown', (e) => {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA' || api.menuOpen) return;
        const code = e.code || '';
        if (phase === 'names') {
          if (code === 'Enter' || code === 'NumpadEnter') confirmNames();
          return;
        }
        if (code === 'KeyL' && !e.repeat) {
          pressLastCard();
          return;
        }
        if (phase === 'chooseSuit') {
          const d = Number(code.replace('Digit', '').replace('Numpad', ''));
          if (code.startsWith('Digit') || code.startsWith('Numpad')) {
            if (d >= 1 && d <= 4) chooseSuit(d - 1);
          } else if (code === 'ArrowLeft') {
            suitSel = (suitSel + 3) % 4;
          } else if (code === 'ArrowRight') {
            suitSel = (suitSel + 1) % 4;
          } else if ((code === 'Enter' || code === 'Space') && !e.repeat) {
            chooseSuit(suitSel);
          }
          return;
        }
        if (phase === 'chooseSwap') {
          const opts = swapOptions();
          if (code === 'ArrowLeft') swapSel = (swapSel + opts.length - 1) % opts.length;
          else if (code === 'ArrowRight') swapSel = (swapSel + 1) % opts.length;
          else if ((code === 'Enter' || code === 'Space') && !e.repeat) chooseSwap(opts[swapSel]);
          return;
        }
        if (!isHumanTurn()) return;
        const hand = players[current].hand;
        if (code === 'ArrowLeft') {
          selIdx = Math.max(0, selIdx - 1);
          hoverIdx = -1;
          api.sfx('tick');
        } else if (code === 'ArrowRight') {
          selIdx = Math.min(hand.length - 1, selIdx + 1);
          hoverIdx = -1;
          api.sfx('tick');
        } else if ((code === 'Enter' || code === 'Space') && !e.repeat) {
          humanPlay(selIdx);
        } else if (code === 'KeyD' && !e.repeat) {
          humanDraw();
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        if (banner) {
          banner.t += dt;
          if (banner.t > 1.4) banner = null;
        }
        if (shakeCard) {
          shakeCard.t -= dt;
          if (shakeCard.t <= 0) shakeCard = null;
        }
        if (swapFx) swapFx.t += dt;
        // Flights (copy: callbacks may add more)
        const fl = flights.slice();
        for (const f of fl) {
          f.t += dt;
          if (f.t >= f.dur) {
            flights = flights.filter((x) => x !== f);
            if (f.done) f.done();
          }
        }
        // Timers
        const tm = timers.slice();
        for (const t of tm) {
          t.t -= dt;
          if (t.t <= 0) {
            timers = timers.filter((x) => x !== t);
            t.fn();
          }
        }
        if (api.menuOpen) return;
        // Dealing
        if (phase === 'deal') {
          dealAcc += dt;
          while (dealAcc >= 0.06 && dealQueue.length) {
            dealAcc -= 0.06;
            const pi = dealQueue.shift();
            const c = deck.pop();
            const to = nextSlotPos(pi);
            const faceVisible = !players[pi].bot && handFaceUp() && seatSlot(pi) === 'bottom';
            players[pi].hand.push(null); // reserve the slot so the next card lands beside it
            flights.push({
              card: c, x0: DECK_POS.x, y0: DECK_POS.y, x1: to.x, y1: to.y, r0: 0, r1: to.rot,
              w0: PCW, h0: PCH, w1: to.w, h1: to.h, t: 0, dur: 0.3, lift: 24, flip: faceVisible, faceStart: false,
              done: () => {
                const h = players[pi].hand;
                const slot = h.indexOf(null);
                if (slot >= 0) h[slot] = c;
                else h.push(c);
                if (dealQueue.length % 4 === 0) api.sfx('tick');
              }
            });
          }
          if (!dealQueue.length && !flights.length) {
            phase = 'turn';
            finishDeal();
          }
          return;
        }
        // Last-card windows
        for (const w of windows.slice()) {
          w.t += dt;
          const p = players[w.pi];
          if (!p || p.hand.length !== 1 || p.declared) {
            closeWindow(w);
            continue;
          }
          if (w.t >= w.catchAt) {
            penalize(w, w.catcher >= 0 ? players[w.catcher].name : null);
          } else if (!w.blocking && w.t >= w.dur) {
            closeWindow(w);
          }
        }
        // Bots
        if (phase === 'turn' && players[current] && players[current].bot && !busy()) {
          botTimer -= dt;
          if (botTimer <= 0) {
            botTimer = 99;
            botAct();
          }
        }
      }

      /* ---------- Render ---------- */
      function drawTable() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = U.alpha(C.line, 0.4);
        for (let x = 12; x < W; x += 24) for (let y = 12; y < H; y += 24) ctx.fillRect(x - 1, y - 1, 2, 2);
        // Felt
        ctx.fillStyle = C.panel;
        ctx.beginPath();
        ctx.ellipse(470, 266, 300, 170, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      function drawDirection() {
        const cx = 470;
        const cy = 266;
        const rx = 250;
        const ry = 122;
        const off = clock * 0.5 * dir;
        ctx.strokeStyle = U.alpha(C.violet, 0.75);
        ctx.fillStyle = U.alpha(C.violet, 0.75);
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        for (let k = 0; k < 3; k++) {
          const a0 = off + (k * TAU) / 3;
          const a1 = a0 + 1.2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, a0, a1);
          ctx.stroke();
          const tip = dir > 0 ? a1 : a0;
          const x = cx + Math.cos(tip) * rx;
          const y = cy + Math.sin(tip) * ry;
          const tx = -Math.sin(tip) * rx * dir;
          const ty = Math.cos(tip) * ry * dir;
          const l = Math.hypot(tx, ty) || 1;
          const ux = tx / l;
          const uy = ty / l;
          ctx.beginPath();
          ctx.moveTo(x + ux * 12, y + uy * 12);
          ctx.lineTo(x - uy * 8, y + ux * 8);
          ctx.lineTo(x + uy * 8, y - ux * 8);
          ctx.closePath();
          ctx.fill();
        }
        ctx.lineCap = 'butt';
        txt(dir > 0 ? '↻ CLOCKWISE' : '↺ COUNTER-CLOCKWISE', cx, cy + 90, F_LABEL(11), C.violet, 'center', 'middle');
      }

      function drawPiles() {
        // Draw pile
        const n = Math.min(6, Math.ceil(deck.length / 12));
        for (let i = 0; i < n; i++) drawCardAt(ctx, null, DECK_POS.x - i * 1.5, DECK_POS.y - i * 1.5, PCW, PCH, 0, false);
        if (!deck.length) {
          ctx.strokeStyle = C.line;
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = 2;
          U.roundRect(ctx, DECK_POS.x - PCW / 2, DECK_POS.y - PCH / 2, PCW, PCH, 12);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const canDraw = isHumanTurn() && !busy() && !drawnCard;
        if (canDraw) {
          const nothing = !players[current].hand.some(canPlay);
          ctx.strokeStyle = U.alpha(nothing ? C.gold : C.text, nothing ? 0.6 + 0.4 * Math.sin(clock * 6) : 0.25);
          ctx.lineWidth = 3;
          U.roundRect(ctx, DECK_POS.x - PCW / 2 - 9, DECK_POS.y - PCH / 2 - 9, PCW + 12, PCH + 12, 14);
          ctx.stroke();
        }
        txt(deck.length + ' left', DECK_POS.x, DECK_POS.y + PCH / 2 + 16, F_LABEL(11), C.muted, 'center', 'middle');
        // Discard: show the last few cards fanned slightly.
        const show = discard.slice(-4);
        // Active suit halo
        if (discard.length) {
          ctx.fillStyle = U.alpha(SUITS[curSuit].color, 0.22 + 0.06 * Math.sin(clock * 3));
          ctx.beginPath();
          ctx.arc(DISCARD_POS.x, DISCARD_POS.y, 82, 0, TAU);
          ctx.fill();
        }
        show.forEach((c, i) => {
          const last = i === show.length - 1;
          drawCardAt(ctx, c, DISCARD_POS.x, DISCARD_POS.y, PCW, PCH, c.rot || 0, true, last && isWild(c) ? curSuit : null);
        });
        if (discard.length) {
          drawShape(ctx, SUITS[curSuit].shape, DISCARD_POS.x + 58, DISCARD_POS.y - 70, 11, SUITS[curSuit].color, INK);
        }
      }

      function seatInfo(pi) {
        const p = players[pi];
        const slot = seatSlot(pi);
        const isCur = pi === current && (phase === 'turn' || phase === 'chooseSuit' || phase === 'chooseSwap' || phase === 'cover');
        let x;
        let y;
        let align = 'center';
        if (slot === 'bottom') { x = 20; y = 412; align = 'left'; }
        else if (slot === 'top') { x = 480; y = 130; }
        else if (slot === 'left') { x = 86; y = 378; }
        else { x = 874; y = 378; }
        const label = p.name + '  ' + p.hand.length + (p.hand.length === 1 ? ' card' : ' cards');
        ctx.font = F_BODY(16, 800);
        const tw = ctx.measureText(label).width + 30;
        const bx = align === 'left' ? x : x - tw / 2;
        ctx.fillStyle = isCur ? U.alpha(C.mint, 0.25 + 0.1 * Math.sin(clock * 5)) : 'rgba(15,13,36,.8)';
        U.roundRect(ctx, bx, y - 15, tw, 30, 15);
        ctx.fill();
        if (isCur) {
          ctx.strokeStyle = C.mint;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        txt(label, bx + tw / 2, y + 1, F_BODY(16, 800), isCur ? C.mint : C.text, 'center', 'middle');
        // Wins as stars under the name
        if (p.wins) txt('★ ' + p.wins, bx + tw / 2, y + 26, F_LABEL(12), C.gold, 'center', 'middle');
        if (p.hand.length === 1) {
          const safe = p.declared;
          txt(safe ? 'LAST CARD' : 'ONE CARD!', bx + tw / 2, y - 26, F_LABEL(11), safe ? C.gold : C.p1, 'center', 'middle');
        }
        // Swap target highlight
        if (phase === 'chooseSwap' && pi !== current) {
          const opts = swapOptions();
          const sel = opts[swapSel] === pi;
          const c = SLOT_CENTER[slot];
          const r = { x: c.x - 80, y: c.y - 70, w: 160, h: 140 };
          if (slot === 'top') { r.y = 20; r.h = 130; }
          ctx.strokeStyle = sel ? C.violet : U.alpha(C.violet, 0.5);
          ctx.lineWidth = sel ? 4 : 2;
          ctx.setLineDash([8, 6]);
          U.roundRect(ctx, r.x, r.y, r.w, r.h, 16);
          ctx.stroke();
          ctx.setLineDash([]);
          hits.push({ x: r.x, y: r.y, w: r.w, h: r.h, fn: () => chooseSwap(pi) });
        }
      }

      function drawHands() {
        const faceUp = handFaceUp();
        for (let pi = 0; pi < N(); pi++) {
          const p = players[pi];
          const slot = seatSlot(pi);
          const lay = handLayout(pi);
          const myTurn = isHumanTurn() && pi === current;
          const swapping = swapFx && (swapFx.a === pi || swapFx.b === pi);
          let sx = 0;
          let sy = 0;
          if (swapping) {
            // Hands slide toward each other's seats during a swap.
            const other = swapFx.a === pi ? swapFx.b : swapFx.a;
            const a = SLOT_CENTER[slot];
            const b = SLOT_CENTER[seatSlot(other)];
            const k = Math.sin(U.clamp(swapFx.t / swapFx.dur, 0, 1) * Math.PI);
            sx = (b.x - a.x) * 0.45 * k;
            sy = (b.y - a.y) * 0.45 * k;
          }
          lay.forEach((s, i) => {
            const c = p.hand[i];
            if (c === null) return; // slot reserved for a card in flight
            if (slot === 'bottom') {
              const show = faceUp && !p.bot && !swapping;
              let lift = 0;
              if (show && myTurn) {
                if (i === hoverIdx) lift = 22;
                else if (i === selIdx && hoverIdx < 0) lift = 14;
                if (drawnCard === c) lift = Math.max(lift, 18);
              }
              let dx = 0;
              if (shakeCard && shakeCard.card === c) dx = Math.sin(shakeCard.t * 60) * 6;
              const playable = show && myTurn && canPlay(c) && (!drawnCard || drawnCard === c);
              if (playable) {
                ctx.save();
                ctx.translate(s.x + dx + sx, s.y - lift + sy);
                ctx.rotate(s.rot);
                ctx.fillStyle = U.alpha(C.mint, 0.45);
                U.roundRect(ctx, -s.w / 2 - 5, -s.h / 2 - 5, s.w + 10, s.h + 10, 14);
                ctx.fill();
                ctx.restore();
              }
              drawCardAt(ctx, c, s.x + dx + sx, s.y - lift + sy, s.w, s.h, s.rot, show);
              if (show && myTurn && !playable) {
                ctx.save();
                ctx.translate(s.x + dx + sx, s.y - lift + sy);
                ctx.rotate(s.rot);
                ctx.fillStyle = 'rgba(15,13,36,.45)';
                U.roundRect(ctx, -s.w / 2, -s.h / 2, s.w, s.h, s.w * 0.14);
                ctx.fill();
                ctx.restore();
              }
              if (show && myTurn && i === selIdx && hoverIdx < 0) {
                txt('▲', s.x + sx, s.y + s.h / 2 - lift + 10 + sy, F_LABEL(12), C.gold, 'center', 'middle');
              }
            } else {
              drawCardAt(ctx, null, s.x + sx, s.y + sy, s.w, s.h, s.rot, false);
            }
          });
          seatInfo(pi);
        }
      }

      function drawFlights() {
        for (const f of flights) {
          const k = U.clamp(f.t / f.dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 3);
          const x = U.lerp(f.x0, f.x1, e);
          const y = U.lerp(f.y0, f.y1, e) - Math.sin(k * Math.PI) * f.lift;
          const w = U.lerp(f.w0, f.w1, e);
          const h = U.lerp(f.h0, f.h1, e);
          const r = U.lerp(f.r0, f.r1, e);
          // Flip mid-air: the card narrows and shows its other side.
          let faceUp = f.faceStart;
          let sxk = 1;
          if (f.flip) {
            sxk = Math.abs(Math.cos(k * Math.PI));
            faceUp = k >= 0.5 ? !f.faceStart : f.faceStart;
          }
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(r);
          ctx.scale(Math.max(0.05, sxk), 1);
          ctx.fillStyle = 'rgba(0,0,0,.3)';
          U.roundRect(ctx, -w / 2 + 4, -h / 2 + 6, w, h, w * 0.14);
          ctx.fill();
          if (faceUp && f.card) drawCardFace(ctx, f.card, w, h, null);
          else drawCardBack(ctx, w, h);
          ctx.restore();
        }
      }

      function drawButtons() {
        if (!players.length || phase === 'deal') return;
        const me = mode === 'bots' ? 0 : viewer;
        const own = me !== null ? windows.find((w) => w.pi === me) : null;
        const other = windows.find((w) => w.pi !== me && players[w.pi] && !players[w.pi].declared);
        let label = 'Last card!';
        let sub = 'L';
        let pulse = false;
        let color = null;
        if (own) {
          pulse = true;
          color = C.gold;
          sub = 'press now!';
        } else if (other) {
          label = 'Catch!';
          sub = shortName(players[other.pi].name) + ' · L';
          pulse = true;
          color = C.p1;
        } else if (isHumanTurn() && players[current].hand.length === 2 && !players[current].declared) {
          pulse = players[current].hand.some(canPlay);
          color = pulse ? C.gold : null;
        } else if (isHumanTurn() && players[current].declared && players[current].hand.length <= 2) {
          label = 'Called!';
          sub = 'safe';
          color = C.mint;
        }
        const enabled = !!(own || other || isHumanTurn());
        button(20, 532, 150, 54, label, { sub, pulse, color, disabled: !enabled }, pressLastCard);
        if (drawnCard && isHumanTurn()) {
          button(790, 532, 150, 54, 'Keep', { sub: 'D · end turn', color: C.p2 }, keepDrawn);
        } else {
          button(790, 532, 150, 54, 'Draw', { sub: 'D', disabled: !(isHumanTurn() && !busy()) }, humanDraw);
        }
      }

      function shortName(n) {
        return n.length > 10 ? n.slice(0, 9) + '…' : n;
      }

      function drawSuitChooser() {
        ctx.fillStyle = 'rgba(15,13,36,.7)';
        ctx.fillRect(0, 0, W, H);
        hits.push({ x: 0, y: 0, w: W, h: H, fn: null }); // swallow clicks outside the chooser
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, 250, 160, 460, 220, 22);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        txt('Pick the next suit', 480, 196, F_TITLE(22), C.text, 'center', 'middle');
        const n = suitCounts(players[current].hand);
        for (let s = 0; s < 4; s++) {
          const x = 274 + s * 106;
          const y = 228;
          const sel = s === suitSel;
          const r = { x, y, w: 94, h: 120 };
          const hot = pointer.over && inside(pointer, r);
          ctx.fillStyle = hot || sel ? C.panel2 : C.ink;
          U.roundRect(ctx, x, y, 94, 120, 16);
          ctx.fill();
          ctx.strokeStyle = sel ? SUITS[s].color : C.line;
          ctx.lineWidth = sel ? 4 : 2;
          ctx.stroke();
          drawShape(ctx, SUITS[s].shape, x + 47, y + 50, 26, SUITS[s].color, INK);
          txt(SUITS[s].short, x + 47, y + 92, F_BODY(15, 800), C.text, 'center', 'middle');
          txt(s + 1 + ' · ' + n[s] + ' held', x + 47, y + 110, F_LABEL(10), C.muted, 'center', 'middle');
          hits.push({ x, y, w: 94, h: 120, fn: () => chooseSuit(s) });
        }
      }

      function drawSwapChooser() {
        const opts = swapOptions();
        const bw = 150;
        const total = opts.length * bw + (opts.length - 1) * 12;
        const x0 = 480 - total / 2;
        ctx.fillStyle = 'rgba(15,13,36,.82)';
        U.roundRect(ctx, x0 - 20, 170, total + 40, 196, 22);
        ctx.fill();
        ctx.strokeStyle = C.violet;
        ctx.lineWidth = 3;
        ctx.stroke();
        txt('Swap hands with…', 480, 204, F_TITLE(22), C.text, 'center', 'middle');
        txt('You keep ' + players[current].hand.length + ' card' + (players[current].hand.length === 1 ? '' : 's') + ' if you skip the swap', 480, 232, F_LABEL(12), C.muted, 'center', 'middle');
        opts.forEach((pi, i) => {
          const x = x0 + i * (bw + 12);
          const sel = i === swapSel;
          if (pi < 0) {
            button(x, 262, bw, 76, 'No swap', { sub: 'keep my hand', color: sel ? C.text : null }, () => chooseSwap(-1));
          } else {
            const p = players[pi];
            const fewer = p.hand.length < players[current].hand.length;
            button(x, 262, bw, 76, shortName(p.name), { sub: p.hand.length + ' cards', color: sel ? C.violet : fewer ? C.mint : null }, () => chooseSwap(pi));
          }
          if (sel) {
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 3;
            U.roundRect(ctx, x - 4, 258, bw + 8, 84, 14);
            ctx.stroke();
          }
        });
      }

      function drawBanner() {
        if (!banner) return;
        const k = banner.t;
        const s = k < 0.2 ? 0.6 + (k / 0.2) * 0.5 : k < 0.3 ? 1.1 - ((k - 0.2) / 0.1) * 0.1 : 1;
        const a = U.clamp((1.4 - k) * 3, 0, 1);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(470, 168);
        ctx.scale(s, s);
        ctx.font = F_TITLE(26);
        const tw = Math.min(560, ctx.measureText(banner.text).width + 44);
        ctx.fillStyle = 'rgba(15,13,36,.85)';
        U.roundRect(ctx, -tw / 2, -26, tw, 52, 26);
        ctx.fill();
        ctx.strokeStyle = banner.color;
        ctx.lineWidth = 3;
        ctx.stroke();
        txt(banner.text, 0, 2, F_TITLE(26), banner.color, 'center', 'middle');
        ctx.restore();
      }

      function drawNames() {
        drawTable();
        txt("Who's playing?", W / 2, 70, F_TITLE(32), C.text, 'center', 'middle');
        txt('Seats go in turn order. Leave a box empty to keep the default name.', W / 2, 108, F_BODY(17), C.muted, 'center', 'middle');
        for (let i = 0; i < humanCount; i++) txt('PLAYER ' + (i + 1), 325, 150 + i * 74 - 9, F_LABEL(13), [C.p1, C.p2, C.gold, C.mint][i], 'left', 'alphabetic');
        button(150, 500, 160, 54, 'Back', {}, () => { hideInputs(); showNamesMenu(); });
        button(650, 500, 160, 54, 'Start', { color: C.mint }, confirmNames);
      }

      function drawSetupBackdrop() {
        drawTable();
        const t = clock;
        const cards = [
          { suit: 0, kind: 'num', value: 7 }, { suit: 1, kind: 'flip', value: -1 }, { suit: -1, kind: 'rainbow', value: -1 },
          { suit: 2, kind: 'plus2', value: -1 }, { suit: 3, kind: 'num', value: 4 }
        ];
        cards.forEach((c, i) => {
          const a = (i - 2) * 0.22 + Math.sin(t + i) * 0.02;
          drawCardAt(ctx, c, 480 + Math.sin(a) * 300, 560 - Math.cos(a) * 240, 96, 140, a, true);
        });
      }

      function draw() {
        hits = [];
        if (phase === 'setup' || !players.length) {
          if (phase === 'names') drawNames();
          else drawSetupBackdrop();
          return;
        }
        if (phase === 'names') {
          drawNames();
          return;
        }
        drawTable();
        drawDirection();
        drawPiles();
        drawHands();
        drawFlights();
        drawButtons();
        if (phase === 'turn' && players[current] && players[current].bot && !busy()) {
          const dots = '.'.repeat(1 + (Math.floor(clock * 3) % 3));
          txt(players[current].name + ' is thinking' + dots, 470, 404, F_BODY(16, 700), C.muted, 'center', 'middle');
        }
        if (isHumanTurn() && !busy()) {
          const who = mode === 'bots' ? 'Your turn' : players[current].name + ', your turn';
          txt(who, 470, 404, F_BODY(18, 800), C.mint, 'center', 'middle');
        }
        drawBanner();
        if (phase === 'chooseSuit') drawSuitChooser();
        if (phase === 'chooseSwap') drawSwapChooser();
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
