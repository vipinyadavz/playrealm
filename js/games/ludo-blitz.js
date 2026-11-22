/* Ludo Blitz — the classic cross-board race for up to four, with power tiles on the track. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 920;
  const H = 640;
  const CELL = 40;
  const BX = 20;
  const BY = 20;
  const PX = 640;
  const PW = 260;
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const BIG = '800 44px Unbounded, sans-serif';
  const FINISH = 56;          // progress: -1 yard, 0..50 main track, 51..55 home column, 56 home
  const DIE = { x: PX + PW / 2, y: BY + 150, s: 92 };

  /* Main track: 52 cells clockwise, starting at coral's start square. [col, row] */
  const TRACK = [];
  for (let x = 1; x <= 5; x++) TRACK.push([x, 6]);
  for (let y = 5; y >= 0; y--) TRACK.push([6, y]);
  TRACK.push([7, 0], [8, 0]);
  for (let y = 1; y <= 5; y++) TRACK.push([8, y]);
  for (let x = 9; x <= 14; x++) TRACK.push([x, 6]);
  TRACK.push([14, 7], [14, 8]);
  for (let x = 13; x >= 9; x--) TRACK.push([x, 8]);
  for (let y = 9; y <= 14; y++) TRACK.push([8, y]);
  TRACK.push([7, 14], [6, 14]);
  for (let y = 13; y >= 9; y--) TRACK.push([6, y]);
  for (let x = 5; x >= 0; x--) TRACK.push([x, 8]);
  TRACK.push([0, 7], [0, 6]);

  const HOME = [
    [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
    [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
    [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]]
  ];
  const YARD = [[0, 0], [9, 0], [9, 9], [0, 9]];
  const CENTER = [[6.55, 7.5], [7.5, 6.55], [8.45, 7.5], [7.5, 8.45]];
  const STARTS = [0, 13, 26, 39];
  const STARS = [8, 21, 34, 47];
  const SAFE = new Set(STARTS.concat(STARS));
  const POWERS = { 4: 'double', 10: 'shield', 19: 'swap', 30: 'double', 36: 'shield', 45: 'swap' };
  const POWER_NAME = { double: 'Double', shield: 'Shield', swap: 'Swap' };
  const NAMES = ['Coral', 'Cyan', 'Gold', 'Mint'];
  const COLORS = [C.p1, C.p2, C.gold, C.mint];
  const ORD = ['1st', '2nd', '3rd', '4th'];

  const absOf = (pl, prog) => (STARTS[pl] + prog) % 52;

  /* ---------- Art ---------- */
  function drawToken(ctx, x, y, r, color, opts) {
    const o = opts || {};
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    if (o.glow) {
      ctx.fillStyle = U.alpha(C.text, 0.18 + 0.2 * o.glow);
      ctx.beginPath();
      ctx.arc(x, y, r * 1.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + r * 0.45, r * 0.95, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y + r * 0.16, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(15,13,36,0.55)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.75, Math.PI * 1.1, Math.PI * 1.5);
    ctx.stroke();
    if (o.shield) {
      ctx.strokeStyle = U.alpha(C.p2, 0.6 + 0.3 * Math.sin((o.t || 0) * 5));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.35, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = U.alpha(C.p2, 0.14);
      ctx.fill();
    }
    if (o.label) {
      ctx.fillStyle = C.ink;
      ctx.font = '700 ' + Math.round(r * 0.8) + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.label, x, y + 1);
    }
    ctx.restore();
  }

  function starPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
  }

  function drawPowerIcon(ctx, kind, x, y, s, t) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 3 + x * 0.05);
    const col = kind === 'double' ? C.gold : kind === 'shield' ? C.p2 : C.violet;
    ctx.save();
    ctx.fillStyle = U.alpha(col, 0.18 + 0.2 * pulse);
    ctx.beginPath();
    ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.fillStyle = col;
    ctx.lineWidth = Math.max(1.5, s * 0.08);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    if (kind === 'double') {
      ctx.font = '800 ' + Math.round(s * 0.5) + 'px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', x, y + 1);
    } else if (kind === 'shield') {
      const k = s * 0.36;
      ctx.beginPath();
      ctx.moveTo(x, y - k);
      ctx.lineTo(x + k * 0.85, y - k * 0.6);
      ctx.quadraticCurveTo(x + k * 0.8, y + k * 0.5, x, y + k);
      ctx.quadraticCurveTo(x - k * 0.8, y + k * 0.5, x - k * 0.85, y - k * 0.6);
      ctx.closePath();
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath();
      ctx.moveTo(x, y - k * 0.6);
      ctx.lineTo(x, y + k * 0.7);
      ctx.stroke();
    } else {
      const k = s * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - k, y - k * 0.4);
      ctx.lineTo(x + k, y - k * 0.4);
      ctx.moveTo(x + k * 0.5, y - k * 0.85);
      ctx.lineTo(x + k, y - k * 0.4);
      ctx.lineTo(x + k * 0.5, y + k * 0.05);
      ctx.moveTo(x + k, y + k * 0.45);
      ctx.lineTo(x - k, y + k * 0.45);
      ctx.moveTo(x - k * 0.5, y);
      ctx.lineTo(x - k, y + k * 0.45);
      ctx.lineTo(x - k * 0.5, y + k * 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDie(ctx, x, y, s, value, rot, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    U.roundRect(ctx, -s / 2 + 4, -s / 2 + 6, s, s, s * 0.2);
    ctx.fill();
    ctx.fillStyle = '#F6F1FF';
    U.roundRect(ctx, -s / 2, -s / 2, s, s, s * 0.2);
    ctx.fill();
    ctx.strokeStyle = color || C.line;
    ctx.lineWidth = Math.max(2, s * 0.05);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15,13,36,0.08)';
    U.roundRect(ctx, -s / 2 + s * 0.08, s * 0.1, s * 0.84, s * 0.32, s * 0.14);
    ctx.fill();
    const pips = {
      1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
      4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
      6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]]
    }[value] || [];
    ctx.fillStyle = value === 6 ? (color || C.ink) : C.ink;
    pips.forEach(([px, py]) => {
      ctx.beginPath();
      ctx.arc(px * s * 0.26, py * s * 0.26, s * 0.085, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  Arcade.register({
    id: 'ludo-blitz',
    title: 'Ludo Blitz',
    category: 'board',
    mode: 'together',
    players: '1–4P',
    best: false,
    color: C.gold,
    tagline: 'Race your four tokens around the cross and home before everyone else.',
    hook: 'Power tiles on the track hand out shields, double moves and swaps.',
    tags: ['board', 'race', 'dice', 'ludo', 'party', 'family', 'power-ups', 'hotseat', 'bots'],
    howTo: 'Roll a 6 to bring a token out of your yard onto your start square, then race clockwise around the board ' +
      'and up your colored home column. A 6 gives you another roll, but three 6s in a row lose the turn. Land on a rival ' +
      'to send it back to its yard, except on star and start squares, which are safe. You need the exact roll to reach home. ' +
      'The twist: six glowing power tiles. Shield protects that token for your next two turns, ×2 doubles your next roll, ' +
      'and Swap trades places with the nearest rival token up to 12 squares ahead. First home wins; play goes on for 2nd and 3rd.',
    controls: [
      { keys: ['Space', 'Enter'], label: 'Roll the die / move the picked token' },
      { keys: ['Click'], label: 'Roll (die) or pick a token' },
      { keys: ['1', '2', '3', '4'], label: 'Pick a token' },
      { keys: ['←', '→'], label: 'Cycle movable tokens' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 28;
      const ox = 26;
      const oy = (h - s * 7) / 2;
      // A slice of track: two arms meeting at a corner.
      for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 3; j++) {
          ctx.fillStyle = '#F1EDFF';
          ctx.fillRect(ox + i * s + 1, oy + (2 + j) * s + 1, s - 2, s - 2);
        }
      }
      for (let i = 1; i < 6; i++) {
        ctx.fillStyle = C.p1;
        ctx.fillRect(ox + i * s + 1, oy + 3 * s + 1, s - 2, s - 2);
      }
      ctx.fillStyle = C.gold;
      starPath(ctx, ox + 7.5 * s, oy + 2.5 * s, 9);
      ctx.fill();
      drawPowerIcon(ctx, 'double', ox + 3.5 * s, oy + 2.5 * s, s, t);
      drawPowerIcon(ctx, 'shield', ox + 6.5 * s, oy + 4.5 * s, s, t + 1);
      drawPowerIcon(ctx, 'swap', ox + 1.5 * s, oy + 4.5 * s, s, t + 2);
      const hop = Math.abs(Math.sin(t * 3)) * 8;
      drawToken(ctx, ox + 4.5 * s, oy + 2.5 * s - hop, 10, C.p1);
      drawToken(ctx, ox + 8.5 * s, oy + 4.5 * s, 10, C.p2, { shield: true, t });
      drawToken(ctx, ox + 0.5 * s, oy + 2.5 * s, 10, C.mint);
      drawDie(ctx, w - 62, h / 2, 64, 1 + (Math.floor(t * 2) % 6), Math.sin(t * 2) * 0.2, C.gold);
      ctx.fillStyle = C.gold;
      ctx.font = '800 20px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('×2', w - 62, h / 2 - 46);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let humans = 1;
      let duel = false;
      let players = [];
      let order = [];
      let cur = 0;
      let phase = 'menu';   // 'menu' | 'roll' | 'rolling' | 'choose' | 'move' | 'over'
      let dice = { value: 6, rot: 0, t: 0, rolling: false, doubled: false };
      let sixes = 0;
      let opts = [];
      let selIdx = 0;
      let anim = null;
      let ranks = [];
      let token = 0;
      let clock = 0;
      let particles = [];
      let flash = null;
      let log = [];
      let hinted = {};
      let lastRoll = 0;
      let pointer = { x: -1, y: -1 };
      let hoverTok = -1;

      const current = () => players[order[cur]];
      const px = (cx) => BX + cx * CELL;
      const py = (cy) => BY + cy * CELL;

      function label(pl) {
        if (pl.human) return humans === 1 ? 'You' : NAMES[pl.id];
        return NAMES[pl.id] + ' bot';
      }

      /* Centre (in cell units) of a token's square. */
      function cellOf(pl, ti) {
        const p = pl.tokens[ti].p;
        if (p < 0) {
          const y = YARD[pl.id];
          return [y[0] + (ti % 2 ? 4.2 : 1.8), y[1] + (ti < 2 ? 1.8 : 4.2)];
        }
        if (p <= 50) {
          const c = TRACK[absOf(pl.id, p)];
          return [c[0] + 0.5, c[1] + 0.5];
        }
        if (p < FINISH) {
          const c = HOME[pl.id][p - 51];
          return [c[0] + 0.5, c[1] + 0.5];
        }
        const c = CENTER[pl.id];
        const k = (ti - 1.5) * 0.28;
        return pl.id % 2 === 0 ? [c[0], c[1] + k] : [c[0] + k, c[1]];
      }
      function progCell(plId, p) {
        if (p <= 50) { const c = TRACK[absOf(plId, p)]; return [c[0] + 0.5, c[1] + 0.5]; }
        if (p < FINISH) { const c = HOME[plId][p - 51]; return [c[0] + 0.5, c[1] + 0.5]; }
        return CENTER[plId].slice();
      }

      function pushLog(text, color) {
        log.push({ text, color: color || C.text });
        if (log.length > 5) log.shift();
      }

      function showScore() {
        api.setScore(order.map((i) => NAMES[i] + ' ' + players[i].tokens.filter((t) => t.p === FINISH).length).join(' · '));
      }

      /* ---------- Menus ---------- */
      function showStartMenu() {
        token++;
        phase = 'menu';
        api.setStatus('Ludo Blitz: race four tokens home. Power tiles glow on the track.');
        api.menu({
          title: 'Ludo Blitz',
          text: 'How many people are playing on this screen? Bots take the other colors.',
          buttons: [1, 2, 3, 4].map((n) => ({
            label: n === 1 ? '1 player' : n + ' players',
            primary: n === 1,
            onClick: () => { humans = n; if (n <= 2) showBoardMenu(); else { duel = false; newGame(); } }
          }))
        });
      }
      function showBoardMenu() {
        api.menu({
          title: 'Pick a table',
          text: humans === 1 ? 'Race three bots, or duel one bot from the opposite corner.'
            : 'Add two bots, or duel each other from opposite corners.',
          buttons: [
            { label: humans === 1 ? '4 colors (3 bots)' : '4 colors (2 bots)', primary: true, onClick: () => { duel = false; newGame(); } },
            { label: 'Duel: opposite corners', onClick: () => { duel = true; newGame(); } }
          ]
        });
      }

      function newGame() {
        token++;
        const ids = duel ? [0, 2] : [0, 1, 2, 3];
        const humanIds = duel ? [0, 2].slice(0, humans) : [0, 2, 1, 3].slice(0, humans);
        players = [0, 1, 2, 3].map((id) => ({
          id,
          active: ids.indexOf(id) >= 0,
          human: humanIds.indexOf(id) >= 0,
          tokens: [0, 1, 2, 3].map(() => ({ p: -1, shield: 0, fresh: false, slide: null })),
          double: false,
          rank: 0
        }));
        order = ids;
        cur = 0;
        ranks = [];
        anim = null;
        particles = [];
        flash = null;
        log = [];
        opts = [];
        dice = { value: 6, rot: 0, t: 0, rolling: false, doubled: false };
        pushLog('Roll a 6 to leave the yard.', C.muted);
        showScore();
        startTurn();
      }

      /* ---------- Rules ---------- */
      function rivalsAt(abs, plId) {
        const out = [];
        for (const r of players) {
          if (!r.active || r.id === plId) continue;
          r.tokens.forEach((t, ti) => {
            if (t.p >= 0 && t.p <= 50 && absOf(r.id, t.p) === abs) out.push({ r, t, ti });
          });
        }
        return out;
      }

      /* Rivals that could land on abs with one roll (1–6 squares behind it). */
      function threatsAt(abs, plId) {
        if (SAFE.has(abs)) return 0;
        let n = 0;
        for (const r of players) {
          if (!r.active || r.id === plId) continue;
          for (const t of r.tokens) {
            if (t.p < 0 || t.p > 50) {
              if (t.p < 0 && abs === STARTS[r.id]) n++;
              continue;
            }
            const d = (abs - absOf(r.id, t.p) + 52) % 52;
            if (d >= 1 && d <= 6 && t.p + d <= 50) n++;
          }
        }
        return n;
      }

      function swapTarget(pl, prog) {
        const abs = absOf(pl.id, prog);
        for (let d = 1; d <= 12 && prog + d <= 50; d++) {
          const a2 = (abs + d) % 52;
          const found = rivalsAt(a2, pl.id).find((x) => !x.t.shield && x.t.p - d >= 0);
          if (found) return { d, ...found };
        }
        return null;
      }

      function options(pl, natural, steps) {
        const out = [];
        pl.tokens.forEach((t, ti) => {
          if (t.p < 0) {
            if (natural === 6) out.push({ ti, from: -1, np: 0 });
          } else if (t.p < FINISH && t.p + steps <= FINISH) out.push({ ti, from: t.p, np: t.p + steps });
        });
        return out;
      }

      function scoreOption(pl, o) {
        let s = 0;
        const np = o.np;
        if (o.from < 0) s += 12;
        if (np === FINISH) s += 70;
        else if (np > 50) s += 38;
        else {
          const abs = absOf(pl.id, np);
          const victims = rivalsAt(abs, pl.id).filter((x) => !x.t.shield);
          if (!SAFE.has(abs) && victims.length) victims.forEach((x) => { s += 95 + x.t.p * 0.8; });
          if (SAFE.has(abs)) s += 26;
          const power = POWERS[abs];
          let threats = threatsAt(abs, pl.id);
          if (power === 'shield') { s += 22 + threats * 14; threats = 0; }
          else if (power === 'double') s += 18;
          else if (power === 'swap') {
            const tg = swapTarget(pl, np);
            if (tg) { s += 14 + tg.d * 2 + tg.t.p * 0.2; threats = threatsAt((abs + tg.d) % 52, pl.id); }
          }
          if (!pl.tokens[o.ti].shield) s -= threats * 30;
        }
        const t = pl.tokens[o.ti];
        if (o.from >= 0 && o.from <= 50 && !t.shield) s += threatsAt(absOf(pl.id, o.from), pl.id) * 24;
        s += np * 0.25 + (o.from >= 0 ? 4 : 0);
        return s + Math.random() * 3;
      }

      /* ---------- Turn flow ---------- */
      function startTurn() {
        if (checkEnd()) return;
        sixes = 0;
        awaitRoll();
      }

      function awaitRoll() {
        phase = 'roll';
        opts = [];
        const pl = current();
        const my = token;
        if (!pl.human) {
          api.setStatus(label(pl) + ' is rolling…');
          api.after(480, () => { if (my === token && phase === 'roll') roll(); });
          return;
        }
        const who = humans === 1 ? 'Your turn' : NAMES[pl.id] + "'s turn";
        api.setStatus(who + ': press Space or click the die to roll.' + (pl.double ? ' This roll counts double!' : ''));
      }

      function roll() {
        if (phase !== 'roll') return;
        phase = 'rolling';
        const pl = current();
        const v = U.randInt(1, 6);
        dice.rolling = true;
        dice.t = 0;
        dice.doubled = false;
        api.sfx('shoot');
        const my = token;
        api.after(620, () => { if (my === token) rolled(pl, v); });
      }

      function rolled(pl, v) {
        dice.rolling = false;
        dice.value = v;
        dice.rot = U.rand(-0.15, 0.15);
        api.sfx(v === 6 ? 'power' : 'tick');
        lastRoll = v;
        if (v === 6) sixes++;
        let steps = v;
        if (pl.double) {
          pl.double = false;
          steps = v * 2;
          dice.doubled = true;
        }
        const my = token;
        if (sixes === 3) {
          phase = 'move';
          pushLog(NAMES[pl.id] + ' rolled three 6s and lost the turn.', COLORS[pl.id]);
          api.setStatus('Three 6s in a row: ' + label(pl) + ' loses the turn.');
          api.sfx('lose');
          api.after(1000, () => { if (my === token) endTurn(); });
          return;
        }
        opts = options(pl, v, steps);
        const rollText = steps !== v ? v + ' ×2 = ' + steps : String(v);
        if (!opts.length) {
          phase = 'move';
          api.setStatus(label(pl) + ' rolled ' + rollText + ': no token can move.' + (v === 6 ? ' Roll again.' : ''));
          api.after(900, () => {
            if (my !== token) return;
            if (v === 6) awaitRoll(); else endTurn();
          });
          return;
        }
        const distinct = [];
        opts.forEach((o) => { if (!distinct.some((d) => d.from === o.from && d.np === o.np)) distinct.push(o); });
        if (distinct.length === 1 || !pl.human) {
          phase = 'move';
          let pick = distinct[0];
          if (!pl.human && distinct.length > 1) {
            let best = -Infinity;
            distinct.forEach((o) => { const s = scoreOption(pl, o); if (s > best) { best = s; pick = o; } });
          }
          api.setStatus(label(pl) + ' rolled ' + rollText + '.');
          api.after(pl.human ? 380 : 520, () => { if (my === token) doMove(pl, pick, v); });
          return;
        }
        phase = 'choose';
        selIdx = 0;
        api.setStatus((humans === 1 ? 'You' : NAMES[pl.id]) + ' rolled ' + rollText + '. Pick a token: click it, or press 1–4.');
      }

      function doMove(pl, o, natural) {
        phase = 'move';
        opts = [];
        const path = [];
        if (o.from < 0) {
          path.push(cellOf(pl, o.ti));
          path.push(progCell(pl.id, 0));
        } else {
          for (let p = o.from; p <= o.np; p++) path.push(progCell(pl.id, p));
        }
        anim = {
          pl, ti: o.ti, path, i: 0, t: 0, step: o.from < 0 ? 0.25 : 0.12,
          done: () => land(pl, o, natural)
        };
      }

      function land(pl, o, natural) {
        const t = pl.tokens[o.ti];
        t.p = o.np;
        const my = token;
        let wait = 250;
        const here = cellOf(pl, o.ti);
        if (o.np <= 50) {
          const abs = absOf(pl.id, o.np);
          const victims = rivalsAt(abs, pl.id);
          if (victims.length && SAFE.has(abs)) {
            if (!hinted.safe) { hinted.safe = true; pushLog('Stars and start squares are safe.', C.muted); }
          } else {
            victims.forEach((x) => {
              if (x.t.shield) {
                pushLog(NAMES[x.r.id] + "'s shield held!", C.p2);
                api.sfx('flip');
                return;
              }
              const from = cellOf(x.r, x.ti);
              x.t.p = -1;
              x.t.shield = 0;
              x.t.slide = { from, t: 0, dur: 0.55 };
              burst(px(from[0]), py(from[1]), COLORS[x.r.id], 18);
              pushLog(NAMES[pl.id] + ' sent ' + NAMES[x.r.id] + ' home.', COLORS[pl.id]);
              api.sfx('hit');
              wait = 650;
            });
          }
          const power = POWERS[abs];
          if (power) wait = Math.max(wait, usePower(pl, o.ti, power));
        }
        if (t.p === FINISH) {
          burst(px(here[0]), py(here[1]), COLORS[pl.id], 24);
          api.sfx('score');
          pushLog(NAMES[pl.id] + ' brought a token home.', COLORS[pl.id]);
          if (pl.tokens.every((k) => k.p === FINISH)) {
            ranks.push(pl.id);
            pl.rank = ranks.length;
            flash = { text: NAMES[pl.id] + ' ' + ORD[pl.rank - 1], t: 0, color: COLORS[pl.id] };
            api.sfx('win');
          }
        }
        showScore();
        api.after(wait, () => {
          if (my !== token) return;
          const finishedAll = pl.tokens.every((k) => k.p === FINISH);
          if (natural === 6 && !finishedAll) {
            api.setStatus(label(pl) + ' rolled a 6: roll again.');
            awaitRoll();
          } else endTurn();
        });
      }

      function usePower(pl, ti, power) {
        const t = pl.tokens[ti];
        const at = cellOf(pl, ti);
        burst(px(at[0]), py(at[1]), power === 'double' ? C.gold : power === 'shield' ? C.p2 : C.violet, 16);
        const first = !hinted.power;
        hinted.power = true;
        if (power === 'double') {
          pl.double = true;
          api.sfx('power');
          pushLog(NAMES[pl.id] + ' grabbed ×2: next roll doubles.', C.gold);
          flash = { text: '×2', t: 0, color: C.gold };
          if (first || pl.human) api.setStatus('Power tile! ' + label(pl) + "'s next roll counts double.");
          return 500;
        }
        if (power === 'shield') {
          t.shield = 2;
          t.fresh = true;
          api.sfx('power');
          pushLog(NAMES[pl.id] + ' raised a shield.', C.p2);
          flash = { text: 'Shield', t: 0, color: C.p2 };
          if (first || pl.human) api.setStatus('Power tile! That token cannot be captured for ' + (pl.human && humans === 1 ? 'your' : NAMES[pl.id] + "'s") + ' next two turns.');
          return 500;
        }
        const tg = swapTarget(pl, t.p);
        if (!tg) {
          pushLog('Swap found no rival within 12 squares.', C.muted);
          if (first || pl.human) api.setStatus('Swap tile: no rival token within 12 squares ahead, so nothing happens.');
          return 300;
        }
        const myFrom = cellOf(pl, ti);
        const theirFrom = cellOf(tg.r, tg.ti);
        t.p += tg.d;
        tg.t.p -= tg.d;
        t.slide = { from: myFrom, t: 0, dur: 0.45 };
        tg.t.slide = { from: theirFrom, t: 0, dur: 0.45 };
        api.sfx('flip');
        pushLog(NAMES[pl.id] + ' swapped with ' + NAMES[tg.r.id] + ' (+' + tg.d + ').', C.violet);
        flash = { text: 'Swap', t: 0, color: C.violet };
        if (first || pl.human) api.setStatus('Swap! ' + label(pl) + ' trades places with ' + NAMES[tg.r.id] + ', ' + tg.d + ' squares ahead.');
        return 650;
      }

      function endTurn() {
        const pl = current();
        pl.tokens.forEach((t) => {
          if (t.shield > 0) {
            if (t.fresh) t.fresh = false;
            else t.shield--;
          }
        });
        if (checkEnd()) return;
        for (let k = 1; k <= order.length; k++) {
          const n = (cur + k) % order.length;
          if (!players[order[n]].rank) { cur = n; break; }
        }
        startTurn();
      }

      function progressOf(pl) {
        return pl.tokens.reduce((s, t) => s + Math.max(0, t.p + 1), 0);
      }

      function checkEnd() {
        if (phase === 'over') return true;
        const need = duel ? 1 : 3;
        const left = order.filter((i) => !players[i].rank);
        const humansLeft = left.some((i) => players[i].human);
        if (ranks.length < need && humansLeft) return false;
        // Rank whoever is left by how far they got.
        left.sort((a, b) => progressOf(players[b]) - progressOf(players[a])).forEach((i) => {
          ranks.push(i);
          players[i].rank = ranks.length;
        });
        gameOver(!humansLeft && left.length > 1);
        return true;
      }

      function gameOver(byProgress) {
        phase = 'over';
        const my = ++token;
        const winner = players[ranks[0]];
        const humanList = order.filter((i) => players[i].human);
        let title;
        if (humans === 1) {
          const me = players[humanList[0]];
          title = me.rank === 1 ? 'You win!' : 'You finished ' + ORD[me.rank - 1];
          api.sfx(me.rank === 1 ? 'win' : 'lose');
        } else {
          title = NAMES[winner.id] + ' wins!';
          api.sfx('win');
        }
        const lines = ranks.map((id, i) => ORD[i] + ' ' + NAMES[id] + (players[id].human ? (humans === 1 ? ' (you)' : '') : ' (bot)')).join('\n');
        const text = lines + (byProgress ? '\nThe bots’ places are set by how far they got.' : '');
        flash = { text: title, t: 0, color: COLORS[winner.id], stay: true };
        api.setStatus(title + ' ' + ranks.map((id, i) => ORD[i] + ' ' + NAMES[id]).join(', ') + '.');
        api.after(1500, () => {
          if (my !== token || phase !== 'over') return;
          api.menu({
            title,
            text,
            buttons: [
              { label: 'Play again', primary: true, onClick: newGame },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      function burst(x, y, color, n) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 40 + Math.random() * 150;
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.35, color });
        }
      }

      /* ---------- Input ---------- */
      const humanTurn = () => !api.menuOpen && players.length && current().human && !anim;

      function choose(o) {
        if (phase !== 'choose') return;
        doMove(current(), o, lastRoll);
      }

      function tokenAt(x, y) {
        const pl = current();
        let best = -1;
        let bd = 22;
        pl.tokens.forEach((t, ti) => {
          const c = drawPos(pl, ti);
          const d = Math.hypot(c[0] - x, c[1] - y);
          if (d < bd) { bd = d; best = ti; }
        });
        return best;
      }

      api.on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        pointer = p;
        if (!humanTurn()) return;
        if (phase === 'roll') {
          const onDie = Math.abs(p.x - DIE.x) < DIE.s * 0.7 && Math.abs(p.y - DIE.y) < DIE.s * 0.7;
          const onYard = (() => {
            const y = YARD[current().id];
            return p.x >= px(y[0]) && p.x < px(y[0] + 6) && p.y >= py(y[1]) && p.y < py(y[1] + 6);
          })();
          if (onDie || onYard) roll();
          return;
        }
        if (phase === 'choose') {
          const ti = tokenAt(p.x, p.y);
          const o = opts.find((x) => x.ti === ti);
          if (o) choose(o);
          else if (ti >= 0) api.setStatus('That token cannot move ' + (dice.doubled ? lastRoll * 2 : lastRoll) + '. Pick a glowing one.');
        }
      });
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        pointer = p;
        hoverTok = phase === 'choose' && players.length ? tokenAt(p.x, p.y) : -1;
      });

      api.on(window, 'keydown', (e) => {
        if (!humanTurn()) return;
        const code = e.code;
        if (phase === 'roll') {
          if (code === 'Space' || code === 'Enter') roll();
          return;
        }
        if (phase !== 'choose' || !opts.length) return;
        if (code === 'ArrowLeft' || code === 'ArrowUp') { selIdx = (selIdx + opts.length - 1) % opts.length; api.sfx('tick'); }
        else if (code === 'ArrowRight' || code === 'ArrowDown') { selIdx = (selIdx + 1) % opts.length; api.sfx('tick'); }
        else if (code === 'Space' || code === 'Enter') choose(opts[Math.min(selIdx, opts.length - 1)]);
        else if (/^Digit[1-4]$/.test(code) || /^Numpad[1-4]$/.test(code)) {
          const ti = +code.slice(-1) - 1;
          const o = opts.find((x) => x.ti === ti);
          if (o) choose(o);
          else api.setStatus('Token ' + (ti + 1) + ' cannot move. Pick a glowing one.');
        }
      });

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        if (dice.rolling) {
          dice.t += dt;
          if (Math.floor(dice.t * 18) !== Math.floor((dice.t - dt) * 18)) {
            dice.value = U.randInt(1, 6);
            if (Math.random() < 0.5) api.sfx('tick');
          }
          dice.rot += dt * 14;
        }
        if (anim) {
          anim.t += dt;
          if (anim.t >= anim.step) {
            anim.t -= anim.step;
            anim.i++;
            if (anim.i < anim.path.length - 1) api.sfx('tick');
            if (anim.i >= anim.path.length - 1) {
              const done = anim.done;
              anim = null;
              done();
            }
          }
        }
        players.forEach((pl) => pl.tokens.forEach((t) => {
          if (t.slide) {
            t.slide.t += dt;
            if (t.slide.t >= t.slide.dur) t.slide = null;
          }
        }));
        if (flash) {
          flash.t += dt;
          if (!flash.stay && flash.t > 1.1) flash = null;
        }
        for (const p of particles) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.92;
          p.vy *= 0.92;
          p.life -= dt;
        }
        particles = particles.filter((p) => p.life > 0);
      }

      /* ---------- Draw ---------- */
      function drawPos(pl, ti) {
        const t = pl.tokens[ti];
        if (anim && anim.pl === pl && anim.ti === ti) {
          const a = anim.path[anim.i];
          const b = anim.path[Math.min(anim.i + 1, anim.path.length - 1)];
          const k = U.clamp(anim.t / anim.step, 0, 1);
          return [px(U.lerp(a[0], b[0], k)), py(U.lerp(a[1], b[1], k)) - Math.sin(k * Math.PI) * 9];
        }
        const c = cellOf(pl, ti);
        let x = px(c[0]);
        let y = py(c[1]);
        if (t.p >= 0 && t.p < FINISH) {
          // Spread tokens that share a square.
          const same = [];
          players.forEach((q) => {
            if (!q.active) return;
            q.tokens.forEach((u, ui) => {
              if (u.p < 0 || u.p >= FINISH || (anim && anim.pl === q && anim.ti === ui)) return;
              const cc = cellOf(q, ui);
              if (Math.abs(cc[0] - c[0]) < 0.01 && Math.abs(cc[1] - c[1]) < 0.01) same.push(q.id * 4 + ui);
            });
          });
          if (same.length > 1) {
            const k = same.indexOf(pl.id * 4 + ti);
            const a = (k / same.length) * Math.PI * 2 - Math.PI / 4;
            x += Math.cos(a) * 7;
            y += Math.sin(a) * 7;
          }
        }
        if (t.slide) {
          const k = U.clamp(t.slide.t / t.slide.dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 3);
          x = U.lerp(px(t.slide.from[0]), x, e);
          y = U.lerp(py(t.slide.from[1]), y, e) - Math.sin(k * Math.PI) * 26;
        }
        return [x, y];
      }

      function cellRect(cx, cy, color) {
        ctx.fillStyle = color;
        ctx.fillRect(px(cx) + 1, py(cy) + 1, CELL - 2, CELL - 2);
      }

      function drawBoard() {
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX - 10, BY - 10, CELL * 15 + 20, CELL * 15 + 20, 16);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        const curId = players.length && phase !== 'over' && phase !== 'menu' ? current().id : -1;
        // Yards.
        YARD.forEach(([x0, y0], id) => {
          const col = COLORS[id];
          const live = !players.length || players[id].active;
          ctx.fillStyle = live ? U.alpha(col, id === curId ? 0.55 + 0.12 * Math.sin(clock * 4) : 0.38) : U.alpha(C.line, 0.4);
          U.roundRect(ctx, px(x0) + 2, py(y0) + 2, CELL * 6 - 4, CELL * 6 - 4, 14);
          ctx.fill();
          ctx.fillStyle = C.ink;
          U.roundRect(ctx, px(x0 + 0.8), py(y0 + 0.8), CELL * 4.4, CELL * 4.4, 16);
          ctx.fill();
          for (let k = 0; k < 4; k++) {
            const sx = x0 + (k % 2 ? 4.2 : 1.8);
            const sy = y0 + (k < 2 ? 1.8 : 4.2);
            ctx.strokeStyle = live ? U.alpha(col, 0.6) : U.alpha(C.line, 0.6);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px(sx), py(sy), 17, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (players.length && players[id].active) {
            ctx.fillStyle = U.alpha(C.text, 0.75);
            ctx.font = FONT_SM;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(players[id].rank ? ORD[players[id].rank - 1] : label(players[id]), px(x0 + 3), py(y0 + 3));
          }
        });
        // Track.
        TRACK.forEach(([x, y], i) => {
          cellRect(x, y, '#ECE7FF');
          const startOf = STARTS.indexOf(i);
          if (startOf >= 0) cellRect(x, y, COLORS[startOf]);
        });
        HOME.forEach((col, id) => col.forEach(([x, y]) => cellRect(x, y, U.alpha(COLORS[id], 0.85))));
        // Start arrows and stars.
        STARTS.forEach((i) => {
          const [x, y] = TRACK[i];
          const n = TRACK[(i + 1) % 52];
          const a = Math.atan2(n[1] - y, n[0] - x);
          ctx.save();
          ctx.translate(px(x + 0.5), py(y + 0.5));
          ctx.rotate(a);
          ctx.fillStyle = 'rgba(15,13,36,0.55)';
          ctx.beginPath();
          ctx.moveTo(10, 0);
          ctx.lineTo(-6, -8);
          ctx.lineTo(-6, 8);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        });
        STARS.forEach((i) => {
          const [x, y] = TRACK[i];
          ctx.fillStyle = U.alpha(C.violet, 0.85);
          starPath(ctx, px(x + 0.5), py(y + 0.5), 13);
          ctx.fill();
        });
        Object.keys(POWERS).forEach((k) => {
          const [x, y] = TRACK[+k];
          ctx.fillStyle = C.ink;
          ctx.fillRect(px(x) + 1, py(y) + 1, CELL - 2, CELL - 2);
          drawPowerIcon(ctx, POWERS[k], px(x + 0.5), py(y + 0.5), CELL * 0.92, clock);
        });
        // Centre triangles.
        const c0 = px(6);
        const c1 = px(9);
        const r0 = py(6);
        const r1 = py(9);
        const mx = px(7.5);
        const my = py(7.5);
        const tri = [[[c0, r0], [c0, r1]], [[c0, r0], [c1, r0]], [[c1, r0], [c1, r1]], [[c0, r1], [c1, r1]]];
        tri.forEach((pts, id) => {
          ctx.fillStyle = U.alpha(COLORS[id], 0.85);
          ctx.beginPath();
          ctx.moveTo(pts[0][0], pts[0][1]);
          ctx.lineTo(pts[1][0], pts[1][1]);
          ctx.lineTo(mx, my);
          ctx.closePath();
          ctx.fill();
        });
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(mx, my, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawBoard();
        const curPl = players.length ? current() : null;
        const choosing = phase === 'choose' && curPl && curPl.human;
        // Destination preview for the picked token.
        if (choosing && opts.length) {
          const o = opts.find((x) => x.ti === hoverTok) || opts[Math.min(selIdx, opts.length - 1)];
          const c = progCell(curPl.id, o.np);
          ctx.strokeStyle = COLORS[curPl.id];
          ctx.lineWidth = 3;
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = -clock * 18;
          ctx.strokeRect(px(c[0]) - CELL / 2 + 3, py(c[1]) - CELL / 2 + 3, CELL - 6, CELL - 6);
          ctx.setLineDash([]);
        }
        // Tokens (current player last so they sit on top).
        const ids = players.filter((p) => p.active).map((p) => p.id);
        if (curPl) ids.sort((a, b) => (a === curPl.id) - (b === curPl.id));
        ids.forEach((id) => {
          const pl = players[id];
          pl.tokens.forEach((t, ti) => {
            const [x, y] = drawPos(pl, ti);
            const movable = choosing && pl === curPl && opts.some((o) => o.ti === ti);
            const picked = movable && (hoverTok >= 0 ? hoverTok === ti : opts[Math.min(selIdx, opts.length - 1)].ti === ti);
            const small = t.p === FINISH;
            drawToken(ctx, x, y, small ? 9 : t.p < 0 ? 14 : 13, COLORS[id], {
              shield: t.shield > 0,
              t: clock,
              glow: movable ? (picked ? 1 : 0.4 + 0.4 * Math.sin(clock * 6)) : 0,
              label: choosing && pl === curPl && !small ? String(ti + 1) : ''
            });
          });
        });

        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life * 2, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;

        if (flash) {
          const k = flash.stay ? Math.min(1, flash.t * 4) : Math.max(0, 1 - Math.max(0, flash.t - 0.6) * 2);
          ctx.globalAlpha = k;
          ctx.fillStyle = U.alpha(C.ink, 0.7);
          U.roundRect(ctx, BX + 110, BY + 300 - 44, 380, 88, 18);
          ctx.fill();
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = flash.color;
          ctx.fillText(flash.text, BX + 300, BY + 302, 350);
          ctx.globalAlpha = 1;
        }
        drawPanel();
      }

      function drawPanel() {
        const x = PX;
        const y = BY - 10;
        const w = PW;
        const h = CELL * 15 + 20;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        const curPl = players.length && phase !== 'menu' ? current() : null;
        const col = curPl ? COLORS[curPl.id] : C.muted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.font = FONT;
        ctx.fillStyle = col;
        let head = 'Ludo Blitz';
        if (curPl) head = phase === 'over' ? 'Game over' : curPl.human && humans === 1 ? 'Your turn' : label(curPl) + '\u2019s turn';
        ctx.fillText(head, x + w / 2, y + 36);
        // Die.
        const canRoll = phase === 'roll' && curPl && curPl.human && !api.menuOpen;
        if (canRoll) {
          ctx.fillStyle = U.alpha(col, 0.18 + 0.12 * Math.sin(clock * 5));
          ctx.beginPath();
          ctx.arc(DIE.x, DIE.y, DIE.s * 0.78, 0, Math.PI * 2);
          ctx.fill();
        }
        const bounce = dice.rolling ? Math.abs(Math.sin(dice.t * 16)) * 10 : 0;
        drawDie(ctx, DIE.x, DIE.y - bounce, DIE.s * (dice.rolling ? 0.9 : 1), dice.value, dice.rolling ? dice.rot : dice.rot * 0.2, col);
        ctx.font = FONT_SM;
        ctx.fillStyle = C.muted;
        if (canRoll) ctx.fillText('Space or click to roll', x + w / 2, DIE.y + DIE.s / 2 + 26);
        else if (dice.doubled && !dice.rolling) {
          ctx.fillStyle = C.gold;
          ctx.font = FONT;
          ctx.fillText(dice.value + ' ×2 = ' + dice.value * 2, x + w / 2, DIE.y + DIE.s / 2 + 26);
        }
        if (curPl && curPl.double) {
          ctx.fillStyle = C.gold;
          ctx.font = '800 18px Unbounded, sans-serif';
          ctx.fillText('next ×2', DIE.x + DIE.s * 0.62, DIE.y - DIE.s * 0.55);
        }
        // Players.
        let yy = y + 252;
        ctx.textAlign = 'left';
        order.forEach((id) => {
          const pl = players[id];
          const active = curPl === pl && phase !== 'over';
          ctx.fillStyle = active ? U.alpha(COLORS[id], 0.18) : C.panel2;
          U.roundRect(ctx, x + 12, yy, w - 24, 44, 10);
          ctx.fill();
          if (active) {
            ctx.strokeStyle = COLORS[id];
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          drawToken(ctx, x + 32, yy + 22, 10, COLORS[id]);
          ctx.font = FONT;
          ctx.fillStyle = C.text;
          ctx.fillText(label(pl), x + 52, yy + 20);
          ctx.font = FONT_SM;
          ctx.fillStyle = C.muted;
          const home = pl.tokens.filter((t) => t.p === FINISH).length;
          const out = pl.tokens.filter((t) => t.p >= 0 && t.p < FINISH).length;
          ctx.fillText(home + ' home · ' + out + ' out' + (pl.double ? ' · ×2' : ''), x + 52, yy + 36);
          if (pl.rank) {
            ctx.textAlign = 'right';
            ctx.font = FONT;
            ctx.fillStyle = COLORS[id];
            ctx.fillText(ORD[pl.rank - 1], x + w - 22, yy + 28);
            ctx.textAlign = 'left';
          }
          yy += 50;
        });
        // Event log.
        yy = Math.max(yy + 6, y + 470);
        ctx.font = FONT_SM;
        log.forEach((l, i) => {
          ctx.fillStyle = i === log.length - 1 ? l.color : U.alpha(l.color, 0.55);
          ctx.fillText(l.text, x + 16, yy + i * 18, w - 30);
        });
        // Power legend.
        const ly = y + h - 30;
        ['double', 'shield', 'swap'].forEach((k, i) => {
          const lx = x + 30 + i * 80;
          drawPowerIcon(ctx, k, lx, ly, 26, clock);
          ctx.fillStyle = C.muted;
          ctx.font = FONT_SM;
          ctx.textAlign = 'left';
          ctx.fillText(POWER_NAME[k], lx + 16, ly + 4);
        });
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
