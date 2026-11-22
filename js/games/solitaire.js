/* Solitaire — Klondike with one wild card per game that can stand in for any card you need. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 780;
  const H = 660;
  const CW = 86;
  const CH = 120;
  const GAP = 16;
  const X0 = (W - (7 * CW + 6 * GAP)) / 2;
  const TOPY = 58;
  const TY = TOPY + CH + 22;
  const DOWN_OFF = 11;
  const UP_OFF = 28;
  const FAN = 20;
  const WILD_COST = 25;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const RANK_NAMES = ['', 'ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'];
  const SUIT_NAMES = ['spades', 'hearts', 'clubs', 'diamonds'];
  const RED = '#DE3350';
  const BLACK = '#211C3D';
  const STOCK = 0;
  const WASTE = 1;
  const PIP_LAYOUT = [
    null, null,
    [[0.5, 0], [0.5, 1]],
    [[0.5, 0], [0.5, 0.5], [0.5, 1]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0.5, 0.5], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0.5, 0.25], [0, 0.5], [1, 0.5], [0.5, 0.75], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0, 1 / 3], [1, 1 / 3], [0.5, 0.5], [0, 2 / 3], [1, 2 / 3], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [0.5, 1 / 6], [0, 1 / 3], [1, 1 / 3], [0, 2 / 3], [1, 2 / 3], [0.5, 5 / 6], [0, 1], [1, 1]]
  ];

  /* ---------- Rules (pure: they only look at the piles they are given) ----------
     Piles: 0 stock, 1 waste, 2–5 foundations, 6–12 tableau. Cards: { rank 1–13, suit 0–3, up }.
     Suits 0 spades, 1 hearts, 2 clubs, 3 diamonds: odd suits are red. */

  const isFound = (p) => p >= 2 && p <= 5;
  const isTab = (p) => p >= 6 && p <= 12;
  const isRed = (s) => s % 2 === 1;
  const top = (pile) => pile[pile.length - 1];
  const cardName = (rank, suit) => RANK_NAMES[rank] + ' of ' + SUIT_NAMES[suit];

  function fitsTableau(card, pile) {
    if (!pile.length) return card.rank === 13;
    const t = top(pile);
    return t.up && t.rank === card.rank + 1 && isRed(t.suit) !== isRed(card.suit);
  }

  function fitsFoundation(card, pile) {
    if (!pile.length) return card.rank === 1;
    const t = top(pile);
    return t.suit === card.suit && t.rank + 1 === card.rank;
  }

  /* Face-up, descending, alternating colours from idx to the top of the pile? */
  function runValid(pile, idx) {
    if (idx < 0 || idx >= pile.length) return false;
    for (let i = idx; i < pile.length; i++) {
      if (!pile[i].up) return false;
      if (i > idx) {
        const a = pile[i - 1];
        const b = pile[i];
        if (a.rank !== b.rank + 1 || isRed(a.suit) === isRed(b.suit)) return false;
      }
    }
    return true;
  }

  function canMove(piles, src, idx, dst) {
    if (src === dst || dst === STOCK || dst === WASTE || src === STOCK) return false;
    const from = piles[src];
    if (idx < 0 || idx >= from.length) return false;
    const single = idx === from.length - 1;
    if (!isTab(src) && !single) return false;
    if (!runValid(from, idx)) return false;
    const card = from[idx];
    if (isFound(dst)) return single && fitsFoundation(card, piles[dst]);
    return fitsTableau(card, piles[dst]);
  }

  function locate(piles, card) {
    for (let p = 0; p < piles.length; p++) {
      const i = piles[p].indexOf(card);
      if (i >= 0) return { pile: p, index: i };
    }
    return null;
  }

  /* How hidden a real card is: 0 face down (tableau or stock), 1 face up inside a run, 2 exposed (waste or a
     tableau top), 3 already on a foundation. */
  function exposure(piles, card) {
    const loc = locate(piles, card);
    if (!loc) return 3;
    if (isFound(loc.pile)) return 3;
    if (loc.pile === STOCK) return 0;
    if (loc.pile === WASTE) return 2;
    if (!card.up) return 0;
    return loc.index === piles[loc.pile].length - 1 ? 2 : 1;
  }

  /* The card the wild would become on pile `target`, or null if it cannot go there.
     findReal(rank, suit) returns that real card. Prefers a card that is still hidden. */
  function wildIdentity(piles, target, findReal) {
    let options = [];
    const pile = piles[target];
    if (isFound(target)) {
      if (!pile.length) {
        const started = [2, 3, 4, 5].filter((f) => piles[f].length).map((f) => piles[f][0].suit);
        options = [0, 1, 2, 3].filter((s) => !started.includes(s)).map((s) => ({ rank: 1, suit: s }));
      } else if (top(pile).rank < 13) {
        options = [{ rank: top(pile).rank + 1, suit: top(pile).suit }];
      }
    } else if (isTab(target)) {
      if (!pile.length) {
        options = [0, 1, 2, 3].map((s) => ({ rank: 13, suit: s }));
      } else {
        const t = top(pile);
        if (t.up && t.rank > 1) {
          options = [0, 1, 2, 3].filter((s) => isRed(s) !== isRed(t.suit)).map((s) => ({ rank: t.rank - 1, suit: s }));
        }
      }
    }
    let best = null;
    let bestE = 3;
    for (const o of options) {
      const e = exposure(piles, findReal(o.rank, o.suit));
      if (e < bestE) {
        bestE = e;
        best = o;
      }
    }
    return best;
  }

  /* If the real twin of the placed wild is exposed (anywhere in the waste, or the face-up top of a tableau
     pile), it takes the wild's place. Returns { from } describing where the real card came from, or null. */
  function swapWild(piles, wild, real) {
    const loc = locate(piles, real);
    const wl = locate(piles, wild);
    if (!loc || !wl) return null;
    const exposed = loc.pile === WASTE || (isTab(loc.pile) && real.up && loc.index === piles[loc.pile].length - 1);
    if (!exposed) return null;
    piles[loc.pile].splice(loc.index, 1);
    const w2 = locate(piles, wild);
    piles[w2.pile][w2.index] = real;
    real.up = true;
    return { from: loc.pile, to: w2.pile };
  }

  /* ---------- Drawing ---------- */

  function drawSuit(ctx, suit, cx, cy, s, color) {
    ctx.fillStyle = color || (isRed(suit) ? RED : BLACK);
    ctx.beginPath();
    if (suit === 1) {
      ctx.moveTo(cx, cy + s * 0.95);
      ctx.bezierCurveTo(cx - s * 0.4, cy + s * 0.55, cx - s * 1.05, cy + s * 0.15, cx - s, cy - s * 0.3);
      ctx.arc(cx - s * 0.5, cy - s * 0.3, s * 0.5, Math.PI, 0);
      ctx.arc(cx + s * 0.5, cy - s * 0.3, s * 0.5, Math.PI, 0);
      ctx.bezierCurveTo(cx + s * 1.05, cy + s * 0.15, cx + s * 0.4, cy + s * 0.55, cx, cy + s * 0.95);
      ctx.closePath();
      ctx.fill();
    } else if (suit === 3) {
      ctx.moveTo(cx, cy - s);
      ctx.quadraticCurveTo(cx + s * 0.22, cy - s * 0.22, cx + s * 0.78, cy);
      ctx.quadraticCurveTo(cx + s * 0.22, cy + s * 0.22, cx, cy + s);
      ctx.quadraticCurveTo(cx - s * 0.22, cy + s * 0.22, cx - s * 0.78, cy);
      ctx.quadraticCurveTo(cx - s * 0.22, cy - s * 0.22, cx, cy - s);
      ctx.closePath();
      ctx.fill();
    } else if (suit === 0) {
      ctx.moveTo(cx, cy - s);
      ctx.bezierCurveTo(cx - s * 0.4, cy - s * 0.55, cx - s * 1.05, cy - s * 0.2, cx - s, cy + s * 0.2);
      ctx.arc(cx - s * 0.5, cy + s * 0.2, s * 0.5, Math.PI, 0, true);
      ctx.arc(cx + s * 0.5, cy + s * 0.2, s * 0.5, Math.PI, 0, true);
      ctx.bezierCurveTo(cx + s * 1.05, cy - s * 0.2, cx + s * 0.4, cy - s * 0.55, cx, cy - s);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy + s * 0.2);
      ctx.quadraticCurveTo(cx - s * 0.08, cy + s * 0.75, cx - s * 0.36, cy + s);
      ctx.lineTo(cx + s * 0.36, cy + s);
      ctx.quadraticCurveTo(cx + s * 0.08, cy + s * 0.75, cx, cy + s * 0.2);
      ctx.fill();
    } else {
      const r = s * 0.37;
      for (const [ox, oy] of [[0, -0.46], [-0.44, 0.1], [0.44, 0.1]]) {
        ctx.moveTo(cx + ox * s + r, cy + oy * s);
        ctx.arc(cx + ox * s, cy + oy * s, r, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy - s * 0.05, r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cx - s * 0.08, cy + s * 0.75, cx - s * 0.36, cy + s);
      ctx.lineTo(cx + s * 0.36, cy + s);
      ctx.quadraticCurveTo(cx + s * 0.08, cy + s * 0.75, cx, cy);
      ctx.fill();
    }
  }

  function star(ctx, x, y, big, small, n, rot) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i * Math.PI) / n;
      const rr = i % 2 ? small : big;
      if (i) ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      else ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function drawIndex(ctx, rank, suit, x, y, w, h) {
    const col = isRed(suit) ? RED : BLACK;
    ctx.fillStyle = col;
    ctx.font = '700 16px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(RANKS[rank], x + 6, y + 6);
    drawSuit(ctx, suit, x + 12, y + 32, 6.5);
    drawSuit(ctx, suit, x + w - 14, y + 14, 7.5);
    ctx.save();
    ctx.translate(x + w, y + h);
    ctx.rotate(Math.PI);
    ctx.fillStyle = col;
    ctx.fillText(RANKS[rank], 6, 6);
    drawSuit(ctx, suit, 12, 32, 6.5);
    ctx.restore();
  }

  function drawCourt(ctx, rank, suit, x, y, w, h) {
    const col = isRed(suit) ? RED : BLACK;
    const px = x + 20;
    const py = y + 26;
    const pw = w - 40;
    const ph = h - 52;
    U.roundRect(ctx, px, py, pw, ph, 6);
    ctx.fillStyle = isRed(suit) ? '#FFE4E9' : '#E7E4F6';
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const ex = px + pw / 2;
    const ey = py + 20;
    ctx.fillStyle = C.gold;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (rank === 13) {
      ctx.moveTo(ex - 15, ey + 7);
      ctx.lineTo(ex - 15, ey - 6);
      ctx.lineTo(ex - 7, ey + 1);
      ctx.lineTo(ex, ey - 10);
      ctx.lineTo(ex + 7, ey + 1);
      ctx.lineTo(ex + 15, ey - 6);
      ctx.lineTo(ex + 15, ey + 7);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (rank === 12) {
      ctx.moveTo(ex - 14, ey + 6);
      ctx.quadraticCurveTo(ex, ey - 14, ex + 14, ey + 6);
      ctx.quadraticCurveTo(ex, ey - 2, ex - 14, ey + 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      for (const dx of [-8, 0, 8]) {
        ctx.beginPath();
        ctx.arc(ex + dx, ey - (dx ? 1 : 5), 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.moveTo(ex - 11, ey - 8);
      ctx.lineTo(ex + 11, ey - 8);
      ctx.lineTo(ex + 11, ey + 1);
      ctx.quadraticCurveTo(ex + 9, ey + 8, ex, ey + 11);
      ctx.quadraticCurveTo(ex - 9, ey + 8, ex - 11, ey + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawSuit(ctx, suit, ex, ey, 4.5);
    }
    ctx.font = '800 22px Unbounded, sans-serif';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(RANKS[rank], ex, py + ph * 0.7);
  }

  function drawFace(ctx, rank, suit, x, y, w, h) {
    U.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = '#FBF9FF';
    ctx.fill();
    ctx.strokeStyle = '#CDC6EC';
    ctx.lineWidth = 1;
    ctx.stroke();
    drawIndex(ctx, rank, suit, x, y, w, h);
    if (rank === 1) {
      drawSuit(ctx, suit, x + w / 2, y + h / 2, 20);
      ctx.strokeStyle = U.alpha(isRed(suit) ? RED : BLACK, 0.25);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, 29, 0, Math.PI * 2);
      ctx.stroke();
    } else if (rank <= 10) {
      const x0 = x + 28;
      const x1 = x + w - 28;
      const y0 = y + 26;
      const y1 = y + h - 26;
      for (const [fx, fy] of PIP_LAYOUT[rank]) {
        const px = U.lerp(x0, x1, fx);
        const py = U.lerp(y0, y1, fy);
        if (fy > 0.5) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(Math.PI);
          drawSuit(ctx, suit, 0, 0, 7.5);
          ctx.restore();
        } else drawSuit(ctx, suit, px, py, 7.5);
      }
    } else {
      drawCourt(ctx, rank, suit, x, y, w, h);
    }
  }

  function drawWildFace(ctx, rank, suit, x, y, w, h, t) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#FFF7DA');
    g.addColorStop(1, '#FFD978');
    U.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.save();
    U.roundRect(ctx, x, y, w, h, 8);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    const cx = x + w / 2;
    const cy = y + h / 2 + 2;
    for (let i = 0; i < 12; i++) {
      const a = t * 0.4 + (i * Math.PI) / 6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, w, a, a + 0.18);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    U.roundRect(ctx, x + 1.5, y + 1.5, w - 3, h - 3, 7);
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3;
    ctx.stroke();
    star(ctx, cx, cy - 4, 22, 9, 4, t * 0.6 - Math.PI / 4);
    ctx.fillStyle = C.violet;
    ctx.fill();
    star(ctx, cx, cy - 4, 11, 4, 4, -t * 0.6);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.font = '800 11px Unbounded, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#5636C4';
    ctx.fillText('WILD', cx, y + h - 22);
    if (rank) drawIndex(ctx, rank, suit, x, y, w, h);
  }

  function drawBack(ctx, x, y, w, h) {
    U.roundRect(ctx, x, y, w, h, 8);
    ctx.fillStyle = '#2B2560';
    ctx.fill();
    ctx.save();
    U.roundRect(ctx, x + 6, y + 6, w - 12, h - 12, 5);
    ctx.clip();
    ctx.strokeStyle = U.alpha(C.violet, 0.5);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let d = -h; d < w + h; d += 12) {
      ctx.moveTo(x + d, y);
      ctx.lineTo(x + d + h, y + h);
      ctx.moveTo(x + d + h, y);
      ctx.lineTo(x + d, y + h);
    }
    ctx.stroke();
    ctx.restore();
    U.roundRect(ctx, x + 4.5, y + 4.5, w - 9, h - 9, 6);
    ctx.strokeStyle = C.mint;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 20);
    ctx.lineTo(cx + 15, cy);
    ctx.lineTo(cx, cy + 20);
    ctx.lineTo(cx - 15, cy);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.mint;
    ctx.stroke();
    ctx.fillStyle = C.gold;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  /* A card at (x, y) top-left. f: 0 back up, 1 face up; the card squashes through the turn. */
  function drawCard(ctx, card, x, y, f, t) {
    const sx = Math.max(0.04, Math.abs(2 * f - 1));
    ctx.save();
    ctx.translate(x + CW / 2, y + CH / 2);
    ctx.scale(sx, 1);
    ctx.fillStyle = 'rgba(5,4,20,0.35)';
    U.roundRect(ctx, -CW / 2 + 1, -CH / 2 + 3, CW, CH, 8);
    ctx.fill();
    if (f < 0.5) drawBack(ctx, -CW / 2, -CH / 2, CW, CH);
    else if (card.wild) drawWildFace(ctx, card.rank, card.suit, -CW / 2, -CH / 2, CW, CH, t);
    else drawFace(ctx, card.rank, card.suit, -CW / 2, -CH / 2, CW, CH);
    ctx.restore();
  }

  const clock = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

  Arcade.register({
    id: 'solitaire',
    title: 'Solitaire',
    category: 'board',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.mint,
    tagline: 'Classic patience: sort the whole deck onto four suit piles.',
    hook: 'One wild card per game can stand in for any card you need.',
    tags: ['solitaire', 'klondike', 'patience', 'cards', 'card game', 'board', 'classic', 'wild card'],
    howTo: 'Build the four foundations up by suit from ace to king. On the seven tableau piles, stack cards down in ' +
      'alternating colours; only a king (or a run starting with one) can fill an empty pile. Click the stock to turn ' +
      'cards (one or three at a time). Drag cards or runs, click a card to send it to its best spot, double-click to ' +
      'send it home. The twist: once per game, press Use wild and drop the wild on any tableau card or foundation. It ' +
      'becomes exactly the card that fits there and plays as that card. When the real card turns up (in the waste, or ' +
      'face up on top of a pile), it takes the wild\'s place and the wild is gone. Using it costs 25 points.',
    controls: [
      { keys: ['Drag'], label: 'Move a card or a run' },
      { keys: ['Click'], label: 'Send a card to its best spot' },
      { keys: ['Double-click'], label: 'Send a card to a foundation' },
      { keys: ['←', '→', '↑', '↓'], label: 'Choose a pile' },
      { keys: ['Enter'], label: 'Pick up, then drop (twice on the same pile: best spot)' },
      { keys: ['Space'], label: 'Turn the stock' },
      { keys: ['W'], label: 'Use the wild card' },
      { keys: ['Z'], label: 'Undo' }
    ],
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
      g.addColorStop(0, U.alpha(C.mint, 0.12));
      g.addColorStop(1, U.alpha(C.mint, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const k = 0.6;
      ctx.save();
      ctx.scale(k, k);
      const U2 = 17;
      const col = (cx, list) => {
        let y = 34;
        list.forEach((c) => {
          if (c === 'back') {
            drawCard(ctx, { rank: 1, suit: 0 }, cx, y, 0, t);
            y += 12;
          } else {
            const glow = c.wild;
            if (glow) {
              ctx.shadowColor = C.gold;
              ctx.shadowBlur = 22 + 8 * Math.sin(t * 3);
            }
            drawCard(ctx, c, cx, y, 1, t);
            ctx.shadowBlur = 0;
            y += U2 * 1.7;
          }
        });
      };
      col(24, ['back', 'back', { rank: 9, suit: 2 }, { rank: 8, suit: 3 }, { rank: 7, suit: 0, wild: true }]);
      col(126, ['back', { rank: 13, suit: 1 }, { rank: 12, suit: 0 }]);
      // The real seven of spades waits, ghosted, for its turn.
      ctx.globalAlpha = 0.45;
      drawCard(ctx, { rank: 7, suit: 0 }, 228, 120, 1, t);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = U.alpha(C.gold, 0.8);
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(226, 178);
      ctx.quadraticCurveTo(176, 250, 116, 214);
      ctx.stroke();
      ctx.setLineDash([]);
      // Foundations.
      drawCard(ctx, { rank: 1, suit: 1 }, 400, 34, 1, t);
      drawCard(ctx, { rank: 2, suit: 3 }, 410, 176, 1, t);
      ctx.restore();
      for (let i = 0; i < 6; i++) {
        const a = t * 1.5 + (i * Math.PI) / 3;
        ctx.fillStyle = U.alpha(C.gold, 0.5 + 0.5 * Math.sin(t * 4 + i));
        star(ctx, 24 * k + CW * k / 2 + Math.cos(a) * 44, 34 * k + (24 + 2 * 17 * 1.7) * k + CH * k / 2 + Math.sin(a) * 50, 4, 1.5, 4, 0);
        ctx.fill();
      }
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      const cards = [];
      for (let s = 0; s < 4; s++) {
        for (let r = 1; r <= 13; r++) cards.push({ id: cards.length, rank: r, suit: s, up: false, wild: false });
      }
      const wildCard = { id: 52, rank: 0, suit: 0, up: true, wild: true };
      cards.push(wildCard);
      cards.forEach((c) => Object.assign(c, { x: X0, y: TOPY, tx: X0, ty: TOPY, f: 0, delay: 0, shake: 0 }));

      let piles = [];
      for (let i = 0; i < 13; i++) piles.push([]);
      let drawCount = 1;
      let state = 'menu'; // menu | play | auto | won
      let wildStatus = 'unused'; // unused | placed | spent
      let wildMode = false;
      let undo = [];
      let score = 0;
      let moves = 0;
      let time = 0;
      let timing = false;
      let recycles = 0;
      let press = null;
      let dragIds = null;
      let pending = null;
      let lastClick = null;
      let cursor = { row: 1, col: 0 };
      let keyMode = false;
      let selected = -1;
      let hoverDrop = -1;
      let autoT = 0;
      let autoNoProgress = 0;
      let autoFailed = false;
      let cascade = null;
      let trail = null;
      let trailCtx = null;
      let wildFx = null;
      let sparks = [];
      let tipsSeen = {};
      let tipText = '';
      let tipT = 0;
      let lastStatus = '';
      let pulse = 0;
      let round = 0;
      let clockT = 0;
      let stuck = false;

      const BTN = {
        undo: { x: W - 16 - 96, y: 9, w: 96, h: 32 },
        wild: { x: W - 16 - 96 - 10 - 124, y: 9, w: 124, h: 32 },
        deal: { x: W - 16 - 96 - 10 - 124 - 10 - 110, y: 9, w: 110, h: 32 }
      };
      const inRect = (p, x, y, w, h) => p.x >= x && p.x <= x + w && p.y >= y && p.y <= y + h;
      const inBtn = (p, b) => inRect(p, b.x, b.y, b.w, b.h);
      const colX = (i) => X0 + i * (CW + GAP);
      const pileX = (p) => (p === STOCK ? colX(0) : p === WASTE ? colX(1) : isFound(p) ? colX(p + 1) : colX(p - 6));
      const pileY = (p) => (isTab(p) ? TY : TOPY);
      const findReal = (rank, suit) => cards[suit * 13 + rank - 1];

      function tip(text, secs) {
        tipText = text;
        tipT = secs || 4;
      }

      function tipOnce(id, text, secs) {
        if (tipsSeen[id]) return;
        tipsSeen[id] = true;
        tip(text, secs || 5);
      }

      function addScore(n) {
        score = Math.max(0, score + n);
        api.setScore(score);
      }

      /* ---------- Layout ---------- */

      function tabOffsets(p) {
        const pile = piles[p];
        let downs = 0;
        let ups = 0;
        pile.forEach((c) => (c.up ? ups++ : downs++));
        const avail = H - 12 - TY - CH;
        let dOff = DOWN_OFF;
        let uOff = UP_OFF;
        if (downs * dOff + Math.max(0, ups - 1) * uOff > avail && ups > 1) {
          uOff = Math.max(18, (avail - downs * dOff) / (ups - 1));
        }
        return { dOff, uOff };
      }

      function layout() {
        for (let p = 0; p < 13; p++) {
          const pile = piles[p];
          const x0 = pileX(p);
          const y0 = pileY(p);
          if (isTab(p)) {
            const { dOff, uOff } = tabOffsets(p);
            let y = y0;
            pile.forEach((c) => {
              c.tx = x0;
              c.ty = y;
              y += c.up ? uOff : dOff;
            });
          } else if (p === WASTE) {
            const fan = drawCount === 3 ? Math.min(3, pile.length) : 1;
            pile.forEach((c, i) => {
              const k = i - (pile.length - fan);
              c.tx = x0 + (k > 0 ? k * FAN : 0);
              c.ty = y0;
            });
          } else {
            pile.forEach((c) => {
              c.tx = x0;
              c.ty = y0;
            });
          }
        }
      }

      /* ---------- Game flow ---------- */

      function snapshot() {
        return {
          piles: piles.map((p) => p.map((c) => c.id)),
          up: cards.map((c) => c.up),
          wildStatus, wildRank: wildCard.rank, wildSuit: wildCard.suit,
          score, moves, recycles
        };
      }

      function pushUndo() {
        undo.push(snapshot());
      }

      function doUndo() {
        if (state !== 'play' || !undo.length) {
          if (state === 'play') {
            api.sfx('hit');
            tip('Nothing to undo yet.', 2);
          }
          return;
        }
        const s = undo.pop();
        piles = s.piles.map((p) => p.map((id) => cards[id]));
        cards.forEach((c, i) => { c.up = s.up[i]; });
        wildStatus = s.wildStatus;
        wildCard.rank = s.wildRank;
        wildCard.suit = s.wildSuit;
        score = s.score;
        moves = s.moves;
        recycles = s.recycles;
        api.setScore(score);
        wildMode = false;
        selected = -1;
        pending = null;
        press = null;
        dragIds = null;
        autoFailed = false;
        wildFx = null;
        if (!locate(piles, wildCard)) {
          wildCard.x = BTN.wild.x + BTN.wild.w / 2 - CW / 2;
          wildCard.y = -CH;
        }
        api.sfx('flip');
        afterChange(false);
      }

      function showStartMenu() {
        state = 'menu';
        round++;
        api.setStatus('Klondike solitaire with one wild card per game.');
        api.menu({
          title: 'Solitaire',
          text: 'Sort every card onto the four foundations, ace to king. Once per game the wild card can stand in ' +
            'for any card you need, until the real one turns up.',
          buttons: [
            { label: 'Draw 1', primary: true, onClick: () => newGame(1) },
            { label: 'Draw 3 · harder', onClick: () => newGame(3) }
          ]
        });
      }

      function newGame(n) {
        round++;
        drawCount = n;
        const deck = U.shuffle(cards.slice(0, 52));
        piles = [];
        for (let i = 0; i < 13; i++) piles.push([]);
        cards.forEach((c) => {
          c.up = false;
          c.x = colX(0);
          c.y = TOPY;
          c.f = 0;
          c.delay = 0;
          c.shake = 0;
        });
        wildCard.rank = 0;
        wildCard.suit = 0;
        wildCard.up = true;
        let k = 0;
        for (let i = 0; i < 7; i++) {
          for (let j = i; j < 7; j++) {
            const c = deck[k++];
            c.delay = 0.12 + (i * 7 + j) * 0.028;
            piles[6 + j].push(c);
          }
        }
        for (let i = 0; i < 7; i++) top(piles[6 + i]).up = true;
        while (k < 52) piles[STOCK].push(deck[k++]);
        state = 'play';
        wildStatus = 'unused';
        wildMode = false;
        undo = [];
        score = 0;
        moves = 0;
        time = 0;
        timing = false;
        recycles = 0;
        press = null;
        dragIds = null;
        pending = null;
        lastClick = null;
        selected = -1;
        autoFailed = false;
        cascade = null;
        trail = null;
        trailCtx = null;
        wildFx = null;
        sparks = [];
        tipsSeen = {};
        stuck = false;
        api.setScore(0);
        tip('Build down in alternating colours and send aces up top. One wild card can stand in for any card you need.', 6);
        api.sfx('flip');
      }

      function flipTop(p) {
        if (!isTab(p)) return;
        const t = top(piles[p]);
        if (t && !t.up) {
          t.up = true;
          addScore(5);
          api.sfx('flip');
        }
      }

      function moveCards(src, idx, dst, quiet) {
        if (!canMove(piles, src, idx, dst)) return false;
        pushUndo();
        const run = piles[src].splice(idx);
        piles[dst].push(...run);
        if (isFound(dst)) addScore(10);
        else if (src === WASTE && isTab(dst)) addScore(5);
        else if (isFound(src) && isTab(dst)) addScore(-15);
        moves++;
        flipTop(src);
        if (!quiet) api.sfx(isFound(dst) ? 'score' : 'blip');
        if (isFound(dst)) {
          const c = run[0];
          for (let i = 0; i < 10; i++) {
            const a = Math.random() * Math.PI * 2;
            sparks.push({ x: pileX(dst) + CW / 2, y: pileY(dst) + CH / 2, vx: Math.cos(a) * U.rand(60, 200), vy: Math.sin(a) * U.rand(60, 200),
              life: U.rand(0.3, 0.6), color: isRed(c.suit) ? C.p1 : C.mint });
          }
        }
        afterChange(!quiet);
        return true;
      }

      function drawStock() {
        if (state !== 'play') return;
        wildMode = false;
        selected = -1;
        if (piles[STOCK].length) {
          pushUndo();
          const n = Math.min(drawCount, piles[STOCK].length);
          for (let i = 0; i < n; i++) {
            const c = piles[STOCK].pop();
            c.up = true;
            piles[WASTE].push(c);
          }
          api.sfx('flip');
        } else if (piles[WASTE].length) {
          pushUndo();
          piles[STOCK] = piles[WASTE].reverse();
          piles[WASTE] = [];
          piles[STOCK].forEach((c) => { c.up = false; });
          recycles++;
          api.sfx('tick');
          if (wildStatus === 'unused') {
            tipOnce('recycle', 'Back to the top of the stock. Stuck waiting on one card? Use wild can stand in for it (−25).', 6);
          }
        } else {
          api.sfx('hit');
          return;
        }
        moves++;
        afterChange(true);
      }

      /* Called after every change: wild swap, win, auto-finish, stuck check. */
      function afterChange(byPlayer) {
        if (byPlayer) {
          timing = true;
          autoFailed = false;
        }
        if (wildStatus === 'placed') {
          const real = findReal(wildCard.rank, wildCard.suit);
          const wl = locate(piles, wildCard);
          const wx = wildCard.x;
          const wy = wildCard.y;
          const res = swapWild(piles, wildCard, real);
          if (res) {
            wildStatus = 'spent';
            wildFx = { x: wx, y: wy, t: 0, rank: wildCard.rank, suit: wildCard.suit };
            flipTop(res.from);
            api.sfx('power');
            tip('The real ' + cardName(real.rank, real.suit) + ' turned up and took the wild\'s place. The wild is used up.', 6);
            if (wl) {
              for (let i = 0; i < 18; i++) {
                const a = Math.random() * Math.PI * 2;
                sparks.push({ x: wx + CW / 2, y: wy + CH / 2, vx: Math.cos(a) * U.rand(80, 260), vy: Math.sin(a) * U.rand(80, 260),
                  life: U.rand(0.4, 0.8), color: C.gold });
              }
            }
          }
        }
        const home = [2, 3, 4, 5].reduce((n, f) => n + piles[f].filter((c) => !c.wild).length, 0);
        if (home === 52 && !locate(piles, wildCard)) {
          win();
          return;
        }
        if (state === 'play' && !autoFailed && !piles[STOCK].length && [6, 7, 8, 9, 10, 11, 12].every((p) => piles[p].every((c) => c.up))) {
          state = 'auto';
          autoT = 0.35;
          autoNoProgress = 0;
          wildMode = false;
          selected = -1;
          tip('Every card is face up: finishing for you.', 3);
          return;
        }
        if (state === 'play') {
          stuck = !anyMove();
          if (stuck) {
            tip(wildStatus === 'unused'
              ? 'No moves left. Press Use wild to stand in for the card you need.'
              : 'No moves left. Undo (Z) or start a new deal.', 8);
          }
        }
      }

      /* Is there anything useful left to do (generous for draw 3)? */
      function anyMove() {
        for (let s = 6; s <= 12; s++) {
          const pile = piles[s];
          for (let i = 0; i < pile.length; i++) {
            if (!runValid(pile, i)) continue;
            for (let d = 2; d <= 12; d++) {
              if (!canMove(piles, s, i, d)) continue;
              if (isTab(d) && !piles[d].length && i === 0) continue; // king from one empty pile to another
              if (isTab(d) && i > 0 && pile[i - 1].up) {
                // moving between equal spots only helps if it frees a card for a foundation
                const under = pile[i - 1];
                if (![2, 3, 4, 5].some((f) => fitsFoundation(under, piles[f]))) continue;
              }
              return true;
            }
          }
        }
        const pool = piles[STOCK].concat(piles[WASTE]);
        for (const c of pool) {
          for (let d = 2; d <= 12; d++) {
            if (isFound(d) ? fitsFoundation(c, piles[d]) : fitsTableau(c, piles[d])) return true;
          }
        }
        return false;
      }

      function foundationFor(card) {
        let empty = -1;
        for (let f = 2; f <= 5; f++) {
          if (piles[f].length && fitsFoundation(card, piles[f])) return f;
          if (!piles[f].length && empty < 0) empty = f;
        }
        return card.rank === 1 ? empty : -1;
      }

      const fRank = (suit) => {
        for (let f = 2; f <= 5; f++) if (piles[f].length && top(piles[f]).suit === suit) return top(piles[f]).rank;
        return 0;
      };

      function bestMove(src, idx) {
        const pile = piles[src];
        const card = pile[idx];
        if (!card || !card.up || !runValid(pile, idx) || (!isTab(src) && idx !== pile.length - 1)) return null;
        const single = idx === pile.length - 1;
        const fTarget = single && !isFound(src) ? foundationFor(card) : -1;
        const revealing = isTab(src) && idx > 0 && !pile[idx - 1].up;
        const emptying = isTab(src) && idx === 0;
        let bestTab = -1;
        let bestScore = -Infinity;
        for (let t = 6; t <= 12; t++) {
          if (!canMove(piles, src, idx, t)) continue;
          if (!piles[t].length && emptying) continue;
          let s = piles[t].length ? 10 : 2;
          if (revealing) s += 5;
          s -= Math.abs(t - src) * 0.01;
          if (s > bestScore) {
            bestScore = s;
            bestTab = t;
          }
        }
        if (fTarget >= 0) {
          const opp = card.suit % 2 ? [0, 2] : [1, 3];
          const safe = card.rank <= 2 || opp.every((s) => fRank(s) >= card.rank - 1);
          if (safe || bestTab < 0) return { to: fTarget, alt: bestTab, f: fTarget };
        }
        if (bestTab >= 0) return { to: bestTab, alt: fTarget, f: fTarget };
        return null;
      }

      function clickCard(src, idx) {
        const pile = piles[src];
        const card = pile[idx];
        if (!card) return;
        if (pending && pending.id === card.id) {
          // Second click of a double-click: send it home.
          pending = null;
          const f = idx === pile.length - 1 ? foundationFor(card) : -1;
          if (f >= 0) moveCards(src, idx, f);
          lastClick = { id: card.id, t: clockT };
          return;
        }
        if (lastClick && clockT - lastClick.t < 0.35) {
          if (lastClick.id === card.id) {
            const f = idx === pile.length - 1 ? foundationFor(card) : -1;
            if (f >= 0) moveCards(src, idx, f);
            lastClick = null;
            return;
          }
          // The second half of a double-click whose first click already moved a card away.
          if (lastClick.moved) return;
        }
        const m = bestMove(src, idx);
        lastClick = { id: card.id, t: clockT, moved: false };
        if (!m) {
          card.shake = 0.35;
          api.sfx('hit');
          return;
        }
        if (isFound(m.to) || m.f < 0) {
          lastClick.moved = moveCards(src, idx, m.to);
          return;
        }
        pending = { id: card.id, src, idx, to: m.to, t: 0.26 };
      }

      /* ---------- Wild card ---------- */

      function toggleWild() {
        if (state !== 'play') return;
        if (wildStatus !== 'unused') {
          api.sfx('hit');
          tip(wildStatus === 'placed'
            ? 'The wild is in play as the ' + cardName(wildCard.rank, wildCard.suit) + '.'
            : 'The wild is used up for this game.', 3);
          return;
        }
        wildMode = !wildMode;
        selected = -1;
        api.sfx(wildMode ? 'power' : 'tick');
        if (wildMode) {
          const any = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].some((p) => wildIdentity(piles, p, findReal));
          tip(any
            ? 'Pick a glowing pile: the wild becomes the card that fits there. Press W again to cancel.'
            : 'There is nowhere for the wild to go right now.', 6);
        }
      }

      function placeWild(target) {
        const id = wildIdentity(piles, target, findReal);
        if (!id) {
          api.sfx('hit');
          tip('The wild cannot stand in there. Pick a glowing pile.', 3);
          return false;
        }
        pushUndo();
        wildCard.rank = id.rank;
        wildCard.suit = id.suit;
        wildCard.up = true;
        wildCard.f = 1;
        wildCard.x = BTN.wild.x + BTN.wild.w / 2 - CW / 2;
        wildCard.y = BTN.wild.y;
        piles[target].push(wildCard);
        wildStatus = 'placed';
        wildMode = false;
        moves++;
        addScore(-WILD_COST);
        api.sfx('power');
        tip('The wild now plays as the ' + cardName(id.rank, id.suit) + '. When the real one turns up, it takes over.', 6);
        afterChange(true);
        return true;
      }

      /* ---------- Win ---------- */

      function win() {
        state = 'won';
        timing = false;
        wildMode = false;
        selected = -1;
        const bonus = Math.max(0, Math.round((600 - time) * (drawCount === 3 ? 2 : 1.5)));
        addScore(bonus);
        api.sfx('win');
        const isBest = api.reportScore(score);
        lastStatus = 'Solved in ' + moves + ' moves and ' + clock(time) + '. Time bonus +' + bonus + '.';
        api.setStatus(lastStatus);
        cascade = { queue: [], live: [], t: 0 };
        for (let r = 13; r >= 1; r--) {
          for (let f = 2; f <= 5; f++) {
            const c = piles[f].find((x) => x.rank === r);
            if (c) cascade.queue.push(c);
          }
        }
        try {
          trail = document.createElement('canvas');
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          trail.width = Math.round(W * dpr);
          trail.height = Math.round(H * dpr);
          trailCtx = trail.getContext('2d');
          if (trailCtx) trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        } catch (e) {
          trail = null;
          trailCtx = null;
        }
        const token = round;
        api.after(2600, () => {
          if (token !== round) return;
          api.menu({
            title: isBest ? 'New best: ' + score + '!' : 'Solved!',
            text: 'Draw ' + drawCount + ': ' + moves + ' moves in ' + clock(time) + ', time bonus +' + bonus + '. ' +
              (wildStatus === 'unused' ? 'You never needed the wild.' : 'The wild cost you 25.') + ' Score ' + score + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => newGame(drawCount) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      function confirmNewDeal() {
        if (state !== 'play' && state !== 'auto') return;
        wildMode = false;
        api.menu({
          title: 'New deal?',
          text: 'This game ends without a score.',
          buttons: [
            { label: 'Deal again', primary: true, onClick: () => newGame(drawCount) },
            { label: 'Change mode', onClick: showStartMenu },
            { label: 'Keep playing', onClick: () => {} }
          ]
        });
      }

      /* ---------- Auto-finish ---------- */

      function autoStep() {
        let best = null;
        const sources = [WASTE, 6, 7, 8, 9, 10, 11, 12];
        for (const s of sources) {
          const pile = piles[s];
          if (!pile.length) continue;
          const c = top(pile);
          const f = foundationFor(c);
          if (f >= 0 && (!best || c.rank < best.rank)) best = { s, idx: pile.length - 1, f, rank: c.rank };
        }
        if (best) {
          moveCards(best.s, best.idx, best.f, true);
          api.sfx('tick');
          autoNoProgress = 0;
          return;
        }
        if (piles[STOCK].length) {
          const n = Math.min(drawCount, piles[STOCK].length);
          pushUndo();
          for (let i = 0; i < n; i++) {
            const c = piles[STOCK].pop();
            c.up = true;
            piles[WASTE].push(c);
          }
          moves++;
          afterChange(false);
          return;
        }
        if (piles[WASTE].length && autoNoProgress < 2) {
          autoNoProgress++;
          pushUndo();
          piles[STOCK] = piles[WASTE].reverse();
          piles[WASTE] = [];
          piles[STOCK].forEach((c) => { c.up = false; });
          moves++;
          afterChange(false);
          return;
        }
        state = 'play';
        autoFailed = true;
        tip('Auto-finish is stuck on the waste order. Move a card yourself to continue.', 5);
      }

      /* ---------- Input ---------- */

      function hitTest(p) {
        for (let t = 6; t <= 12; t++) {
          const pile = piles[t];
          for (let i = pile.length - 1; i >= 0; i--) {
            const c = pile[i];
            if (inRect(p, c.tx, c.ty, CW, CH)) return { pile: t, index: i };
          }
          if (!pile.length && inRect(p, pileX(t), TY, CW, CH)) return { pile: t, index: -1 };
        }
        if (inRect(p, pileX(STOCK), TOPY, CW, CH)) return { pile: STOCK, index: piles[STOCK].length - 1 };
        const w = piles[WASTE];
        if (w.length) {
          const c = top(w);
          if (inRect(p, c.tx, c.ty, CW, CH)) return { pile: WASTE, index: w.length - 1 };
        }
        for (let f = 2; f <= 5; f++) {
          if (inRect(p, pileX(f), TOPY, CW, CH)) return { pile: f, index: piles[f].length - 1 };
        }
        return null;
      }

      /* Pile whose area the dragged stack overlaps most, among legal targets. */
      function dropTarget() {
        if (!press || !dragIds) return -1;
        const lead = cards[dragIds[0]];
        let best = -1;
        let bestArea = 0;
        for (let p = 2; p <= 12; p++) {
          if (!canMove(piles, press.src, press.idx, p)) continue;
          const x = pileX(p);
          const y = isTab(p) && piles[p].length ? top(piles[p]).ty : pileY(p);
          const ox = Math.max(0, Math.min(lead.x + CW, x + CW) - Math.max(lead.x, x));
          const oy = Math.max(0, Math.min(lead.y + CH, y + CH) - Math.max(lead.y, y));
          const area = ox * oy;
          if (area > bestArea) {
            bestArea = area;
            best = p;
          }
        }
        return best;
      }

      const canPlay = () => state === 'play' && !api.menuOpen;

      api.on(canvas, 'contextmenu', (e) => e.preventDefault());
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        keyMode = false;
        if (state === 'auto' || state === 'won' || state === 'menu' || api.menuOpen) return;
        if (inBtn(p, BTN.undo)) {
          doUndo();
          return;
        }
        if (inBtn(p, BTN.wild)) {
          toggleWild();
          return;
        }
        if (inBtn(p, BTN.deal)) {
          confirmNewDeal();
          return;
        }
        const hit = hitTest(p);
        if (wildMode) {
          if (hit && hit.pile >= 2) placeWild(hit.pile);
          else {
            wildMode = false;
            tip('Wild cancelled.', 2);
          }
          return;
        }
        selected = -1;
        if (!hit) return;
        if (hit.pile === STOCK) {
          drawStock();
          return;
        }
        if (hit.index < 0) return;
        const pile = piles[hit.pile];
        const card = pile[hit.index];
        if (!card.up) {
          card.shake = 0.3;
          return;
        }
        if (!runValid(pile, hit.index)) {
          card.shake = 0.3;
          api.sfx('hit');
          return;
        }
        press = { src: hit.pile, idx: hit.index, x0: p.x, y0: p.y, id: card.id, dragging: false };
      });

      api.on(window, 'pointermove', (e) => {
        if (!press) return;
        const p = api.toCanvas(e, canvas);
        if (!press.dragging) {
          if (Math.hypot(p.x - press.x0, p.y - press.y0) < 6) return;
          const pile = piles[press.src];
          if (pile[press.idx] !== cards[press.id]) {
            press = null;
            return;
          }
          press.dragging = true;
          dragIds = pile.slice(press.idx).map((c) => c.id);
          press.offs = dragIds.map((id) => ({ dx: cards[id].tx - press.x0, dy: cards[id].ty - press.y0 }));
          pending = null;
          api.sfx('tick');
        }
        dragIds.forEach((id, i) => {
          cards[id].x = p.x + press.offs[i].dx;
          cards[id].y = p.y + press.offs[i].dy;
        });
        hoverDrop = dropTarget();
      });

      api.on(window, 'pointerup', () => {
        if (!press) return;
        const pr = press;
        const target = pr.dragging ? dropTarget() : -1;
        press = null;
        if (pr.dragging) {
          dragIds = null;
          hoverDrop = -1;
          if (target >= 0 && state === 'play' && piles[pr.src][pr.idx] === cards[pr.id]) moveCards(pr.src, pr.idx, target);
          else api.sfx('hit');
          return;
        }
        if (state === 'play' && piles[pr.src][pr.idx] === cards[pr.id]) clickCard(pr.src, pr.idx);
      });

      function cursorPile() {
        if (cursor.row === 0) return cursor.col === 0 ? STOCK : cursor.col === 1 ? WASTE : cursor.col - 1;
        return 6 + cursor.col;
      }

      function keyDrop(dst) {
        const src = selected;
        selected = -1;
        if (src === dst) {
          // Same pile twice: the longest run first, then the top card, then anything in between.
          const pile = piles[src];
          const first = pile.findIndex((c, i) => runValid(pile, i));
          const order = first < 0 ? [] : [first, pile.length - 1];
          for (let i = first + 1; i < pile.length - 1; i++) order.push(i);
          for (const i of order) {
            const m = bestMove(src, i);
            if (m) {
              moveCards(src, i, m.to);
              return;
            }
          }
          api.sfx('hit');
          tip('That pile has nowhere to go.', 2);
          return;
        }
        const pile = piles[src];
        for (let i = 0; i < pile.length; i++) {
          if (canMove(piles, src, i, dst)) {
            moveCards(src, i, dst);
            return;
          }
        }
        api.sfx('hit');
        tip('That does not fit there.', 2);
      }

      api.on(window, 'keydown', (e) => {
        if (api.menuOpen || state === 'menu' || press) return;
        if (state === 'won' || state === 'auto') return;
        const code = e.code;
        if (code === 'ArrowLeft' || code === 'ArrowRight') {
          keyMode = true;
          const d = code === 'ArrowLeft' ? -1 : 1;
          let col = U.clamp(cursor.col + d, 0, 6);
          if (cursor.row === 0 && col === 2) col = U.clamp(col + d, 0, 6);
          cursor.col = col;
        } else if (code === 'ArrowUp' || code === 'ArrowDown') {
          keyMode = true;
          cursor.row = code === 'ArrowUp' ? 0 : 1;
          if (cursor.row === 0 && cursor.col === 2) cursor.col = 1;
        } else if (code === 'Enter' || code === 'NumpadEnter') {
          keyMode = true;
          if (!canPlay()) return;
          const p = cursorPile();
          if (wildMode) {
            if (p >= 2) placeWild(p);
            return;
          }
          if (selected >= 0) {
            keyDrop(p);
            return;
          }
          if (p === STOCK) {
            drawStock();
            return;
          }
          const pile = piles[p];
          if (pile.length && top(pile).up) {
            selected = p;
            api.sfx('tick');
          } else api.sfx('hit');
        } else if (code === 'Space') {
          if (!canPlay()) return;
          drawStock();
        } else if (code === 'KeyZ') {
          if (!canPlay()) return;
          doUndo();
        } else if (code === 'KeyW') {
          if (!canPlay()) return;
          toggleWild();
        }
      });

      /* ---------- Update ---------- */

      function update(dt) {
        pulse += dt;
        clockT += dt;
        tipT = Math.max(0, tipT - dt);
        if ((state === 'play' || state === 'auto') && timing && !api.menuOpen) time += dt;
        layout();
        const dragging = dragIds ? new Set(dragIds) : null;
        for (const c of cards) {
          if (dragging && dragging.has(c.id)) continue;
          if (c.delay > 0) {
            c.delay -= dt;
            continue;
          }
          const k = Math.min(1, dt * 16);
          c.x += (c.tx - c.x) * k;
          c.y += (c.ty - c.y) * k;
          if (Math.abs(c.tx - c.x) < 0.3) c.x = c.tx;
          if (Math.abs(c.ty - c.y) < 0.3) c.y = c.ty;
          const want = c.up ? 1 : 0;
          c.f = want > c.f ? Math.min(1, c.f + dt * 7) : Math.max(0, c.f - dt * 7);
          c.shake = Math.max(0, c.shake - dt);
        }
        if (pending) {
          pending.t -= dt;
          if (pending.t <= 0) {
            const pd = pending;
            pending = null;
            if (state === 'play' && piles[pd.src][pd.idx] && piles[pd.src][pd.idx].id === pd.id) moveCards(pd.src, pd.idx, pd.to);
          }
        }
        if (state === 'auto' && !api.menuOpen) {
          autoT -= dt;
          if (autoT <= 0) {
            autoT = 0.085;
            autoStep();
          }
        }
        if (wildFx) {
          wildFx.t += dt;
          if (wildFx.t > 1) wildFx = null;
        }
        sparks.forEach((s) => {
          s.life -= dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vy += 300 * dt;
        });
        sparks = sparks.filter((s) => s.life > 0);
        if (cascade) {
          cascade.t -= dt;
          if (cascade.t <= 0 && cascade.queue.length) {
            cascade.t = 0.11;
            const c = cascade.queue.shift();
            const loc = locate(piles, c);
            if (loc) piles[loc.pile].splice(loc.index, 1);
            cascade.live.push({ c, x: c.x, y: c.y, vx: U.rand(140, 340) * (Math.random() < 0.5 ? -1 : 1), vy: U.rand(-320, -60) });
          }
          cascade.live.forEach((b) => {
            b.vy += 1300 * dt;
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.y > H - CH) {
              b.y = H - CH;
              b.vy = -Math.abs(b.vy) * 0.72;
            }
            if (trailCtx) drawCard(trailCtx, b.c, b.x, b.y, 1, pulse);
          });
          cascade.live = cascade.live.filter((b) => b.x > -CW - 10 && b.x < W + 10);
        }
        if (state === 'play' || state === 'auto') {
          const wildInfo = wildStatus === 'unused' ? 'wild ready' : wildStatus === 'placed'
            ? 'wild is the ' + cardName(wildCard.rank, wildCard.suit) : 'wild used';
          const base = 'Draw ' + drawCount + ' · ' + moves + ' moves · ' + clock(time) + ' · ' + wildInfo;
          const text = tipT > 0 ? tipText : base;
          if (text !== lastStatus) {
            lastStatus = text;
            api.setStatus(text);
          }
        }
      }

      /* ---------- Draw ---------- */

      function slot(x, y, label, color) {
        U.roundRect(ctx, x + 1, y + 1, CW - 2, CH - 2, 8);
        ctx.fillStyle = U.alpha(C.panel, 0.6);
        ctx.fill();
        ctx.strokeStyle = color || U.alpha(C.line, 0.9);
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.stroke();
        ctx.setLineDash([]);
        if (label) {
          ctx.font = '800 26px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.muted, 0.25);
          ctx.fillText(label, x + CW / 2, y + CH / 2);
        }
      }

      function button(b, label, opts) {
        const o = opts || {};
        U.roundRect(ctx, b.x, b.y, b.w, b.h, 10);
        ctx.fillStyle = o.fill || C.panel2;
        ctx.fill();
        ctx.strokeStyle = o.stroke || C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = FONT_SM;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = o.text || C.text;
        ctx.fillText(label, b.x + b.w / 2 + (o.icon ? 10 : 0), b.y + b.h / 2 + 1);
        if (o.icon) {
          ctx.save();
          ctx.translate(b.x + 18, b.y + b.h / 2);
          ctx.scale(0.2, 0.2);
          drawWildFace(ctx, 0, 0, -CW / 2, -CH / 2, CW, CH, pulse);
          ctx.restore();
        }
      }

      function drawHud() {
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        ctx.fillRect(0, 0, W, 50);
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.text;
        ctx.fillText(moves + ' moves', 18, 25);
        ctx.fillStyle = C.muted;
        ctx.fillText(clock(time), 140, 25);
        ctx.fillText('draw ' + drawCount, 214, 25);
        ctx.fillStyle = C.gold;
        ctx.fillText(score + ' pts', 306, 25);
        const playing = state === 'play';
        button(BTN.deal, 'New deal');
        if (wildStatus === 'unused') {
          const glow = wildMode || stuck;
          button(BTN.wild, wildMode ? 'Cancel' : 'Use wild', {
            fill: wildMode ? U.alpha(C.gold, 0.25) : C.panel2,
            stroke: glow ? U.alpha(C.gold, 0.6 + 0.4 * Math.sin(pulse * 6)) : U.alpha(C.gold, 0.6),
            text: C.gold, icon: true
          });
        } else {
          button(BTN.wild, wildStatus === 'placed' ? 'Wild in play' : 'Wild used', { text: C.muted, fill: C.panel });
        }
        button(BTN.undo, 'Undo  Z', { text: undo.length && playing ? C.text : C.muted });
      }

      function pileRect(p) {
        const pile = piles[p];
        if (isTab(p) && pile.length) {
          let i = pile.findIndex((c) => c.up);
          if (i < 0) i = pile.length - 1;
          const a = pile[i];
          const b = top(pile);
          return [a.tx, a.ty, CW, b.ty + CH - a.ty];
        }
        if (p === WASTE && pile.length) {
          const t = top(pile);
          return [t.tx, t.ty, CW, CH];
        }
        return [pileX(p), pileY(p), CW, CH];
      }

      function outline(r, color, width, dash) {
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (dash) ctx.setLineDash(dash);
        U.roundRect(ctx, r[0] - 4, r[1] - 4, r[2] + 8, r[3] + 8, 11);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(W / 2, H * 0.55, 40, W / 2, H * 0.55, W * 0.75);
        g.addColorStop(0, U.alpha(C.mint, 0.08));
        g.addColorStop(1, U.alpha(C.mint, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        if (state === 'menu' && !piles.some((p) => p.length)) {
          ctx.font = FONT_BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = U.alpha(C.mint, 0.3);
          ctx.fillText('Solitaire', W / 2, H / 2);
          return;
        }

        drawHud();
        // Empty slots.
        slot(pileX(STOCK), TOPY, '', null);
        if (!piles[STOCK].length && piles[WASTE].length) {
          // Recycle arrow.
          const cx = pileX(STOCK) + CW / 2;
          const cy = TOPY + CH / 2;
          ctx.strokeStyle = U.alpha(C.mint, 0.7);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(cx, cy, 18, -Math.PI * 0.2, Math.PI * 1.45);
          ctx.stroke();
          ctx.fillStyle = U.alpha(C.mint, 0.7);
          ctx.beginPath();
          const ax = cx + Math.cos(-Math.PI * 0.2) * 18;
          const ay = cy + Math.sin(-Math.PI * 0.2) * 18;
          ctx.moveTo(ax + 8, ay + 2);
          ctx.lineTo(ax - 6, ay + 6);
          ctx.lineTo(ax - 1, ay - 9);
          ctx.closePath();
          ctx.fill();
        }
        slot(pileX(WASTE), TOPY, '', null);
        for (let f = 2; f <= 5; f++) slot(pileX(f), TOPY, 'A', null);
        for (let t = 6; t <= 12; t++) slot(pileX(t), TY, 'K', null);

        if (cascade && trail && trailCtx) ctx.drawImage(trail, 0, 0, W, H);

        // Cards: resting first, then moving ones, then the dragged stack.
        const dragging = dragIds ? new Set(dragIds) : new Set();
        const moving = [];
        for (let p = 0; p < 13; p++) {
          const pile = piles[p];
          const stacked = p === STOCK || isFound(p) || (p === WASTE && drawCount === 1);
          const from = p === WASTE && drawCount === 3 ? Math.max(0, pile.length - 4) : stacked ? Math.max(0, pile.length - 2) : 0;
          for (let i = 0; i < pile.length; i++) {
            const c = pile[i];
            if (dragging.has(c.id)) continue;
            const away = Math.abs(c.x - c.tx) + Math.abs(c.y - c.ty) > 1.5 || c.delay > 0;
            if (away) {
              moving.push(c);
              continue;
            }
            if (i < from) continue;
            drawOne(c, p, i);
          }
        }
        moving.sort((a, b) => (b.delay || 0) - (a.delay || 0));
        moving.forEach((c) => drawOne(c, -1, -1));

        // Highlights.
        if (wildMode) {
          for (let p = 2; p <= 12; p++) {
            if (!wildIdentity(piles, p, findReal)) continue;
            const r = isTab(p) && piles[p].length ? [top(piles[p]).tx, top(piles[p]).ty, CW, CH] : [pileX(p), pileY(p), CW, CH];
            outline(r, U.alpha(C.gold, 0.55 + 0.45 * Math.sin(pulse * 6)), 3);
          }
        }
        if (selected >= 0 && state === 'play') outline(pileRect(selected), C.gold, 3);
        if (keyMode && (state === 'play')) outline(pileRect(cursorPile()), U.alpha(C.text, 0.9), 2.5, [7, 5]);
        if (hoverDrop >= 0 && dragIds) {
          const r = isTab(hoverDrop) && piles[hoverDrop].length
            ? [top(piles[hoverDrop]).tx, top(piles[hoverDrop]).ty, CW, CH] : [pileX(hoverDrop), pileY(hoverDrop), CW, CH];
          outline(r, U.alpha(C.mint, 0.9), 3);
        }
        if (dragIds) dragIds.forEach((id) => drawOne(cards[id], -1, -1, true));

        // Wild retiring: it floats up and fades.
        if (wildFx) {
          const k = wildFx.t;
          ctx.save();
          ctx.globalAlpha = Math.max(0, 1 - k);
          ctx.translate(wildFx.x + CW / 2, wildFx.y + CH / 2 - k * 60);
          ctx.rotate(k * 0.5);
          ctx.scale(1 + k * 0.3, 1 + k * 0.3);
          drawWildFace(ctx, wildFx.rank, wildFx.suit, -CW / 2, -CH / 2, CW, CH, pulse);
          ctx.restore();
        }
        sparks.forEach((s) => {
          ctx.globalAlpha = U.clamp(s.life * 2, 0, 1);
          ctx.fillStyle = s.color;
          star(ctx, s.x, s.y, 5, 2, 4, s.life * 6);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        if (cascade) cascade.live.forEach((b) => drawCard(ctx, b.c, b.x, b.y, 1, pulse));
      }

      function drawOne(c, p, i, lifted) {
        let x = c.x + (c.shake > 0 ? Math.sin(c.shake * 60) * c.shake * 12 : 0);
        let y = c.y;
        if (lifted) {
          x -= 2;
          y -= 3;
          ctx.fillStyle = 'rgba(5,4,20,0.35)';
          U.roundRect(ctx, x + 6, y + 10, CW, CH, 8);
          ctx.fill();
        }
        if (c.wild && c.f >= 0.5) {
          ctx.save();
          ctx.shadowColor = C.gold;
          ctx.shadowBlur = 14 + 6 * Math.sin(pulse * 3);
          drawCard(ctx, c, x, y, c.f, pulse);
          ctx.restore();
        } else drawCard(ctx, c, x, y, c.f, pulse);
        if (pending && pending.id === c.id) {
          ctx.strokeStyle = U.alpha(C.mint, 0.8);
          ctx.lineWidth = 2;
          U.roundRect(ctx, x - 2, y - 2, CW + 4, CH + 4, 10);
          ctx.stroke();
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
