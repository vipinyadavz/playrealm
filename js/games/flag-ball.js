/* Flag Ball — top-down capture the flag with rolling balls. Coral vs cyan, 3 v 3.
   The twist: whoever carries the flag gets heavier and slower the longer they hold it. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;

  const VW = 960;            // canvas (view) size
  const VH = 560;
  const WW = 1200;           // world size
  const WH = 700;
  const R = 17;              // ball radius
  const STEP = 1 / 120;      // physics step
  const ACCEL = 780;
  const DAMP = 2.4;          // top speed ≈ ACCEL / DAMP
  const WALL_E = 0.55;
  const BALL_E = 0.9;
  const DASH_V = 290;
  const DASH_CD = 2.2;
  const BOOST_V = 610;
  const WEIGHT_FULL = 16;    // seconds of carrying until the flag is at full weight
  /* Weight w fills linearly with carry time; its drag ramps up with w², so a quick
     dash home barely hurts but a long hold leaves you crawling. */
  const loadOf = (w) => w * w;
  const speedFactor = (w) => 1 - 0.58 * w * w;
  const RESPAWN = 3;
  const DAZE = 1.1;          // seconds an enemy is stunned after a dash hit
  const GRACE = 0.5;         // fresh carriers can't be tagged for this long
  const MATCH_TIME = 300;
  const OVERTIME = 120;
  const WIN_CAPS = 3;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 11px "JetBrains Mono", monospace';
  const TEAM_COLOR = [C.p1, C.p2];
  const TEAM_NAME = ['Coral', 'Cyan'];
  const TAU = Math.PI * 2;

  /* ---------- Map: left half mirrored to the right ---------- */
  const walls = [];
  function mirrorWall(x, y, w, h) {
    walls.push({ x, y, w, h });
    walls.push({ x: WW - x - w, y, w, h });
  }
  mirrorWall(196, 214, 22, 92);   // base shields
  mirrorWall(196, 394, 22, 92);
  mirrorWall(330, 228, 130, 22);  // mid bars
  mirrorWall(330, 450, 130, 22);
  walls.push({ x: 589, y: 140, w: 22, h: 158 });   // center wall, top section
  walls.push({ x: 589, y: 402, w: 22, h: 158 });   // center wall, bottom section
  const GATE = { x: 589, y: 298, w: 22, h: 104 };
  const bumpers = [
    { x: 470, y: 168, r: 22, flash: 0 }, { x: 730, y: 168, r: 22, flash: 0 },
    { x: 470, y: 532, r: 22, flash: 0 }, { x: 730, y: 532, r: 22, flash: 0 }
  ];
  const spikes = [{ x: 410, y: 350, s: 36 }, { x: 790, y: 350, s: 36 }, { x: 600, y: 630, s: 36 }];
  const PAD_W = 74;
  const PAD_H = 46;
  const pads = [
    { x: 330, y: 64, dx: 1, dy: 0 }, { x: 870, y: 64, dx: -1, dy: 0 },
    { x: 330, y: 636, dx: -1, dy: 0 }, { x: 870, y: 636, dx: 1, dy: 0 }
  ];
  const BUTTON = { x: 600, y: 66, r: 30 };
  const BASES = [{ x: 100, y: 350 }, { x: 1100, y: 350 }];
  const BASE_R = 62;
  const SPAWNS = [
    [{ x: 60, y: 282 }, { x: 60, y: 418 }, { x: 156, y: 350 }],
    [{ x: 1140, y: 282 }, { x: 1140, y: 418 }, { x: 1044, y: 350 }]
  ];

  /* ---------- Navigation grid for bots ---------- */
  const CELL = 20;
  const GW = WW / CELL;
  const GH = WH / CELL;
  const NCELL = GW * GH;
  const blocked = new Uint8Array(NCELL);
  const gateCell = new Uint8Array(NCELL);
  const queue = new Int16Array(NCELL);
  const NDX = [1, -1, 0, 0, 1, 1, -1, -1];
  const NDY = [0, 0, 1, -1, 1, -1, 1, -1];

  function circleRect(cx, cy, r, x, y, w, h) {
    const px = cx < x ? x : cx > x + w ? x + w : cx;
    const py = cy < y ? y : cy > y + h ? y + h : cy;
    const dx = cx - px;
    const dy = cy - py;
    return dx * dx + dy * dy < r * r;
  }

  (function buildGrid() {
    const rr = R + 3;
    for (let gy = 0; gy < GH; gy++) {
      for (let gx = 0; gx < GW; gx++) {
        const i = gy * GW + gx;
        const cx = gx * CELL + CELL / 2;
        const cy = gy * CELL + CELL / 2;
        if (cx < rr || cy < rr || cx > WW - rr || cy > WH - rr) { blocked[i] = 1; continue; }
        for (let k = 0; k < walls.length; k++) {
          const w = walls[k];
          if (circleRect(cx, cy, rr, w.x, w.y, w.w, w.h)) blocked[i] = 1;
        }
        for (let k = 0; k < bumpers.length; k++) {
          const b = bumpers[k];
          if (Math.hypot(cx - b.x, cy - b.y) < b.r + rr) blocked[i] = 1;
        }
        for (let k = 0; k < spikes.length; k++) {
          const s = spikes[k];
          if (circleRect(cx, cy, rr + 2, s.x - s.s / 2, s.y - s.s / 2, s.s, s.s)) blocked[i] = 1;
        }
        if (circleRect(cx, cy, rr, GATE.x, GATE.y, GATE.w, GATE.h)) gateCell[i] = 1;
      }
    }
  })();

  function cellAt(x, y) {
    let gx = Math.floor(x / CELL);
    let gy = Math.floor(y / CELL);
    gx = gx < 0 ? 0 : gx >= GW ? GW - 1 : gx;
    gy = gy < 0 ? 0 : gy >= GH ? GH - 1 : gy;
    return gy * GW + gx;
  }

  function passable(i, gateTeam, team) {
    return !blocked[i] && !(gateCell[i] && gateTeam !== team);
  }

  /* Breadth-first distance field from (tx, ty) over cells this team can roll through. */
  function buildField(field, tx, ty, gateTeam, team) {
    field.fill(-1);
    const s = cellAt(tx, ty);
    let head = 0;
    let tail = 0;
    field[s] = 0;
    queue[tail++] = s;
    while (head < tail) {
      const c = queue[head++];
      const cx = c % GW;
      const cy = (c / GW) | 0;
      const d = field[c] + 1;
      for (let k = 0; k < 8; k++) {
        const nx = cx + NDX[k];
        const ny = cy + NDY[k];
        if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
        const n = ny * GW + nx;
        if (field[n] !== -1 || !passable(n, gateTeam, team)) continue;
        if (k >= 4 && (!passable(cy * GW + nx, gateTeam, team) || !passable(ny * GW + cx, gateTeam, team))) continue;
        field[n] = d;
        queue[tail++] = n;
      }
    }
  }

  function lineClear(ax, ay, bx, by, gateTeam, team) {
    const dx = bx - ax;
    const dy = by - ay;
    const n = Math.ceil(Math.hypot(dx, dy) / 10);
    for (let i = 1; i <= n; i++) {
      if (!passable(cellAt(ax + (dx * i) / n, ay + (dy * i) / n), gateTeam, team)) return false;
    }
    return true;
  }

  /* ---------- Shared drawing ---------- */
  function drawFlag(ctx, x, y, color, t, s) {
    const top = y - 34 * s;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, top);
    ctx.stroke();
    const w1 = Math.sin(t * 6) * 3 * s;
    const w2 = Math.sin(t * 6 + 1.3) * 3 * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + 11 * s, top - 2 * s + w1, x + 24 * s, top + 3 * s + w2);
    ctx.lineTo(x + 22 * s, top + 15 * s + w2);
    ctx.quadraticCurveTo(x + 11 * s, top + 13 * s + w1, x, top + 16 * s);
    ctx.closePath();
    ctx.fill();
  }

  function drawBall(ctx, x, y, r, color, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x + 3, y + 5, r, r * 0.86, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    // Two seam dots that orbit with the roll, so motion reads as rolling.
    ctx.fillStyle = 'rgba(15,13,36,0.38)';
    for (let k = 0; k < 2; k++) {
      const ax = rx + k * Math.PI;
      const ay = ry + k * Math.PI;
      if (Math.cos(ax) + Math.cos(ay) > -0.3) {
        ctx.beginPath();
        ctx.arc(x + Math.sin(ax) * r * 0.55, y + Math.sin(ay) * r * 0.55, r * 0.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.34, 0, TAU);
    ctx.fill();
  }

  function weightColor(w) {
    return w < 0.45 ? C.gold : w < 0.8 ? '#FF9F43' : C.p1;
  }

  function drawWeightRing(ctx, x, y, w, t) {
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(15,13,36,0.7)';
    ctx.beginPath();
    ctx.arc(x, y, R + 7, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = weightColor(w);
    ctx.beginPath();
    ctx.arc(x, y, R + 7, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.03, w));
    ctx.stroke();
    if (w > 0.8 && Math.sin(t * 14) > 0) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = U.alpha(C.p1, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, R + 12, 0, TAU);
      ctx.stroke();
    }
  }

  const SKILL = {
    easy: { accel: 0.8, think: 0.5, lead: 0, dash: 0.15, wobble: 0.5, pads: false },
    normal: { accel: 0.92, think: 0.22, lead: 0.6, dash: 0.5, wobble: 0.15, pads: true },
    hard: { accel: 1, think: 0.12, lead: 1, dash: 0.9, wobble: 0, pads: true }
  };
  const BOT_NAMES = [['Pip', 'Rook', 'Moss'], ['Juno', 'Kit', 'Bolt']];

  Arcade.register({
    id: 'flag-ball',
    title: 'Flag Ball',
    category: 'combat',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.p2,
    tagline: 'Roll into the rival base, steal their flag and haul it home before they bump you.',
    hook: 'The flag carrier gets heavier and slower the longer they hold the flag.',
    tags: ['capture the flag', 'team', 'physics', 'balls', 'bots', 'versus', 'co-op', 'arena', 'keyboard'],
    howTo: 'Coral and cyan teams of three rolling balls. Touch the enemy flag in their base to grab it, then roll ' +
      'it back to your own base while your flag is home to score. Any bump from an enemy pops the carrier and ' +
      'sends the flag back. Dash into an enemy to daze them for a second. Spikes pop anyone for 3 seconds. Speed pads fling you along their arrows, and a ball ' +
      'sitting on the top-lane button opens the center gate for its team only. The twist: the flag is heavy. ' +
      'The gold ring around a carrier fills as they hold it, and the fuller it gets the slower they roll and ' +
      'the less pads and dashes help. First to 3 captures, or the most after 5 minutes, wins.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'P1 roll' },
      { keys: ['Space'], label: 'P1 dash (dazes enemies you hit)' },
      { keys: ['↑', '↓', '←', '→'], label: 'P2 roll' },
      { keys: ['Enter'], label: 'P2 dash (dazes enemies you hit)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.p1, 0.08);
      ctx.fillRect(0, 0, w / 2, h);
      ctx.fillStyle = U.alpha(C.p2, 0.08);
      ctx.fillRect(w / 2, 0, w / 2, h);
      ctx.strokeStyle = U.alpha(C.line, 0.55);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 20) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
      for (let y = 0; y <= h; y += 20) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
      ctx.stroke();
      // Walls and the cyan base.
      ctx.fillStyle = C.panel2;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2;
      [[150, 18, 12, 54], [150, 128, 12, 54], [44, 22, 70, 12], [44, 166, 70, 12]].forEach(([x, y, ww, hh]) => {
        ctx.fillRect(x, y, ww, hh);
        ctx.strokeRect(x, y, ww, hh);
      });
      ctx.fillStyle = U.alpha(C.p2, 0.14);
      ctx.beginPath();
      ctx.arc(268, 100, 40, 0, TAU);
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = U.alpha(C.p2, 0.7);
      ctx.stroke();
      ctx.setLineDash([]);
      // Speed pad.
      ctx.fillStyle = U.alpha(C.mint, 0.15);
      U.roundRect(ctx, 196, 156, 54, 30, 6);
      ctx.fill();
      ctx.strokeStyle = C.mint;
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const cx = 228 - k * 12 - ((t * 20) % 12);
        ctx.beginPath();
        ctx.moveTo(cx + 5, 164);
        ctx.lineTo(cx - 3, 171);
        ctx.lineTo(cx + 5, 178);
        ctx.stroke();
      }
      // Heavy coral carrier with a dust trail.
      const bob = Math.sin(t * 3) * 2;
      const cx = 110 + Math.sin(t * 0.8) * 6;
      const cy = 104 + bob;
      ctx.fillStyle = U.alpha(C.muted, 0.35);
      for (let k = 1; k < 6; k++) {
        ctx.beginPath();
        ctx.arc(cx + 18 + k * 12, cy + 10 + Math.sin(k * 1.7) * 6, 5 - k * 0.6, 0, TAU);
        ctx.fill();
      }
      drawBall(ctx, cx, cy, 22, C.p1, t * 2, t * 1.3);
      drawFlag(ctx, cx + 4, cy - 10, C.p2, t, 0.8);
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(15,13,36,0.7)';
      ctx.beginPath();
      ctx.arc(cx, cy, 31, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = '#FF9F43';
      ctx.beginPath();
      ctx.arc(cx, cy, 31, -Math.PI / 2, -Math.PI / 2 + TAU * (0.68 + Math.sin(t * 2) * 0.04));
      ctx.stroke();
      // Cyan chaser with speed lines.
      const px = 206 - Math.sin(t * 0.8) * 4;
      ctx.strokeStyle = U.alpha(C.p2, 0.55);
      ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(px + 26 + k * 4, 86 + k * 9);
        ctx.lineTo(px + 48 + k * 8, 86 + k * 9);
        ctx.stroke();
      }
      drawBall(ctx, px, 96, 18, C.p2, t * 4, t * 2);
      ctx.font = '700 15px "JetBrains Mono", monospace';
      ctx.fillStyle = C.gold;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('heavy!', 82, 160);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(VW, VH);
      void canvas;

      let state = 'menu';     // 'menu' | 'count' | 'play' | 'over'
      let mode = 'solo';      // 'solo' | 'coop' | 'versus'
      let diff = 'normal';
      const balls = [];
      const flags = [{ carrier: null, back: 0 }, { carrier: null, back: 0 }]; // flags[t] lives in BASES[t]
      const caps = [0, 0];
      let clock = MATCH_TIME;
      let overtime = false;
      let countT = 0;
      let acc = 0;
      let time = 0;
      let hitStop = 0;
      let shake = 0;
      let gateTeam = -1;
      let gateGrace = 0;
      let buttonTeam = -1;
      let blockedHintT = 0;
      let matchT = 0;
      let bumpSfxT = 0;
      const banner = { text: '', color: C.text, t: 0 };
      const cam = { x: WW / 2, y: WH / 2, z: 0.8 };
      let hints = {};

      /* ---------- Particles (pooled) ---------- */
      const PMAX = 360;
      const parts = [];
      for (let i = 0; i < PMAX; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: C.text, size: 2 });
      let pNext = 0;
      function spark(x, y, vx, vy, life, color, size) {
        const p = parts[pNext];
        pNext = (pNext + 1) % PMAX;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.color = color; p.size = size;
      }
      function burst(x, y, color, n, speed) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = speed * (0.3 + Math.random() * 0.7);
          spark(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, color, 2 + Math.random() * 3);
        }
      }
      function updateParticles(dt) {
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          const f = Math.max(0, 1 - 3 * dt);
          p.vx *= f;
          p.vy *= f;
        }
      }

      function hint(key, text) {
        if (hints[key]) return;
        hints[key] = true;
        api.setStatus(text);
      }

      function say(text, color, dur) {
        banner.text = text;
        banner.color = color || C.text;
        banner.t = dur || 1.6;
      }

      /* ---------- Teams ---------- */
      function makeBall(team, slot, human, name, role, skill) {
        return {
          team, slot, human, name, role, skill,
          accelScale: human ? 1 : skill.accel,
          x: SPAWNS[team][slot].x, y: SPAWNS[team][slot].y, vx: 0, vy: 0,
          alive: true, respawn: 0, dashCd: 0, padCd: 0, carryT: 0, mass: 1, dustT: 0, daze: 0, dashT: 0, grace: 0, hunt: false,
          rollX: Math.random() * 6, rollY: Math.random() * 6, ix: 0, iy: 0, pop: false,
          field: human ? null : new Int16Array(NCELL),
          think: Math.random() * 0.3, tx: 0, ty: 0, arrive: false, chase: null, avoid: false,
          wx: 0, wy: 0, padGoal: null, padT: 0, stuckT: 0, jiggle: 0, jx: 0, jy: 0,
          seed: Math.random() * 10
        };
      }

      function setupTeams() {
        balls.length = 0;
        const humans = mode === 'coop' ? [[1, 2], []] : mode === 'versus' ? [[1], [2]] : [[1], []];
        for (let team = 0; team < 2; team++) {
          const hs = humans[team];
          const botCount = 3 - hs.length;
          const roles = botCount === 3 ? ['attacker', 'defender', 'support']
            : botCount === 2 ? ['defender', 'support'] : ['defender'];
          const allyBots = mode !== 'versus' && team === 0;
          const skill = SKILL[allyBots ? 'normal' : diff];
          let slot = 0;
          for (let k = 0; k < hs.length; k++) {
            balls.push(makeBall(team, slot, hs[k], 'P' + hs[k], 'attacker', SKILL.hard));
            slot++;
          }
          for (let k = 0; k < botCount; k++) {
            balls.push(makeBall(team, slot, 0, BOT_NAMES[team][k], roles[k], skill));
            slot++;
          }
        }
      }

      const isCarrier = (b) => flags[1 - b.team].carrier === b;
      const weightOf = (b) => (isCarrier(b) ? Math.min(1, b.carryT / WEIGHT_FULL) : 0);

      /* ---------- Match flow ---------- */
      function resetMatch() {
        setupTeams();
        flags[0].carrier = null;
        flags[1].carrier = null;
        flags[0].back = 0;
        flags[1].back = 0;
        caps[0] = 0;
        caps[1] = 0;
        clock = MATCH_TIME;
        overtime = false;
        gateTeam = -1;
        gateGrace = 0;
        buttonTeam = -1;
        hitStop = 0;
        acc = 0;
        matchT = 0;
        hints = {};
        banner.t = 0;
        for (let i = 0; i < PMAX; i++) parts[i].life = 0;
        api.setScore('0 – 0');
      }

      function startMatch() {
        resetMatch();
        state = 'count';
        countT = 3;
        api.sfx('tick');
        if (mode === 'versus') {
          api.setStatus('P1 coral vs P2 cyan. Grab the rival flag and bring it home. The carrier gets heavier over time.');
        } else if (mode === 'coop') {
          api.setStatus('P1 and P2 are coral. Grab the cyan flag on the right and roll it home before it gets too heavy.');
        } else {
          api.setStatus('You are coral (P1). Grab the cyan flag on the right and roll it home before it gets too heavy.');
        }
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Flag Ball',
          text: 'Steal the rival flag and roll it home. The carrier gets heavier every second, so be quick.',
          buttons: [
            { label: '1 player + bots', primary: true, onClick: () => pickDiff('solo') },
            { label: '2 players on one team', onClick: () => pickDiff('coop') },
            { label: '2 players head-to-head (each with bots)', onClick: () => pickDiff('versus') }
          ]
        });
      }

      function pickDiff(m) {
        mode = m;
        setupTeams();
        api.menu({
          title: 'Bot skill',
          text: m === 'versus' ? 'How sharp should both teams’ bots be?' : 'How sharp should the cyan bots be?',
          buttons: [
            { label: 'Easy', onClick: () => { diff = 'easy'; startMatch(); } },
            { label: 'Normal', primary: true, onClick: () => { diff = 'normal'; startMatch(); } },
            { label: 'Hard', onClick: () => { diff = 'hard'; startMatch(); } },
            { label: 'Back', onClick: showStartMenu }
          ]
        });
      }

      function fmtClock(s) {
        const v = Math.max(0, Math.ceil(s));
        const m = Math.floor(v / 60);
        const r = v % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
      }

      function endMatch() {
        state = 'over';
        const winner = caps[0] > caps[1] ? 0 : caps[1] > caps[0] ? 1 : -1;
        let title;
        if (winner < 0) title = 'Draw';
        else if (mode === 'versus') title = (winner === 0 ? 'P1 coral' : 'P2 cyan') + ' wins!';
        else title = winner === 0 ? 'You win!' : 'You lose';
        api.sfx(winner < 0 ? 'blip' : (mode === 'versus' || winner === 0) ? 'win' : 'lose');
        const took = fmtClock(Math.floor(matchT));
        api.menu({
          title,
          text: 'Coral ' + caps[0] + ' – ' + caps[1] + ' Cyan after ' + took + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: startMatch },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
        api.setStatus(winner < 0 ? 'A draw. Nobody could haul the flag home in time.' : TEAM_NAME[winner] + ' takes the match.');
      }

      /* ---------- Events ---------- */
      function pop(b) {
        if (!b.alive) return;
        const carried = isCarrier(b);
        b.alive = false;
        b.respawn = RESPAWN;
        b.pop = false;
        burst(b.x, b.y, TEAM_COLOR[b.team], 26, 320);
        burst(b.x, b.y, C.text, 8, 200);
        if (carried) {
          const f = flags[1 - b.team];
          f.carrier = null;
          f.back = 1;
          b.carryT = 0;
          hitStop = 0.09;
          shake = 11;
          api.sfx('boom');
          say(TEAM_NAME[1 - b.team] + ' flag returned', TEAM_COLOR[1 - b.team], 1.4);
          hint('tag', 'Carrier popped! Any bump from an enemy pops the carrier and sends the flag home.');
        } else {
          shake = Math.max(shake, 5);
          api.sfx('hit');
        }
      }

      function respawn(b) {
        const s = SPAWNS[b.team][b.slot];
        b.x = s.x;
        b.y = s.y;
        b.vx = 0;
        b.vy = 0;
        b.alive = true;
        b.carryT = 0;
        b.daze = 0;
        b.dashT = 0;
        b.dashCd = 0.5;
        burst(b.x, b.y, TEAM_COLOR[b.team], 10, 120);
      }

      function capture(b) {
        const team = b.team;
        caps[team]++;
        flags[1 - team].carrier = null;
        flags[1 - team].back = 1;
        b.carryT = 0;
        burst(BASES[team].x, BASES[team].y, TEAM_COLOR[team], 40, 380);
        burst(BASES[team].x, BASES[team].y, C.gold, 20, 260);
        shake = 9;
        hitStop = 0.12;
        api.sfx('score');
        api.setScore(caps[0] + ' – ' + caps[1]);
        const who = b.human ? 'P' + b.human : b.name;
        say(TEAM_NAME[team] + ' captures!', TEAM_COLOR[team], 2);
        api.setStatus(who + ' captured for ' + TEAM_NAME[team].toLowerCase() + '. ' +
          'Coral ' + caps[0] + ' – ' + caps[1] + ' Cyan.');
        if (caps[team] >= WIN_CAPS || overtime) endMatch();
      }

      function tryDash(b, dx, dy) {
        if (!b.alive || b.dashCd > 0 || b.daze > 0) return;
        let l = Math.hypot(dx, dy);
        if (l < 0.1) {
          dx = b.vx; dy = b.vy;
          l = Math.hypot(dx, dy);
          if (l < 5) { dx = b.team === 0 ? 1 : -1; dy = 0; l = 1; }
        }
        dx /= l;
        dy /= l;
        const k = DASH_V / b.mass;
        b.vx += dx * k;
        b.vy += dy * k;
        b.dashCd = DASH_CD;
        b.dashT = 0.45;
        for (let i = 0; i < 8; i++) {
          spark(b.x - dx * R, b.y - dy * R, -dx * 140 + (Math.random() - 0.5) * 80,
            -dy * 140 + (Math.random() - 0.5) * 80, 0.35, U.alpha(TEAM_COLOR[b.team], 0.8), 3);
        }
        api.sfx('shoot');
      }

      /* ---------- Physics ---------- */
      function collideRect(b, x, y, w, h) {
        const px = b.x < x ? x : b.x > x + w ? x + w : b.x;
        const py = b.y < y ? y : b.y > y + h ? y + h : b.y;
        const dx = b.x - px;
        const dy = b.y - py;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) return;
        let d = Math.sqrt(d2);
        let nx;
        let ny;
        if (d < 0.0001) {
          // Centre inside the rectangle (a gate closed on us): leave by the nearest side.
          const l = b.x - x;
          const r = x + w - b.x;
          const t = b.y - y;
          const bt = y + h - b.y;
          const m = Math.min(l, r, t, bt);
          if (m === l) { nx = -1; ny = 0; d = -l; } else if (m === r) { nx = 1; ny = 0; d = -r; } else if (m === t) { nx = 0; ny = -1; d = -t; } else { nx = 0; ny = 1; d = -bt; }
        } else {
          nx = dx / d;
          ny = dy / d;
        }
        const pen = R - d;
        b.x += nx * pen;
        b.y += ny * pen;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= (1 + WALL_E) * vn * nx;
          b.vy -= (1 + WALL_E) * vn * ny;
          if (vn < -200 && bumpSfxT <= 0) { api.sfx('tick'); bumpSfxT = 0.08; }
        }
      }

      function onButton(b) {
        const dx = b.x - BUTTON.x;
        const dy = b.y - BUTTON.y;
        return dx * dx + dy * dy < BUTTON.r * BUTTON.r;
      }

      function updateButton(dt) {
        let red = 0;
        let blue = 0;
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (b.alive && onButton(b)) { if (b.team === 0) red++; else blue++; }
        }
        const holder = red && !blue ? 0 : blue && !red ? 1 : red && blue ? -2 : -1;
        buttonTeam = holder;
        const before = gateTeam;
        if (holder >= 0) {
          gateTeam = holder;
          gateGrace = 1.2;
        } else if (holder === -2) {
          gateTeam = -1;
          gateGrace = 0;
        } else if (gateTeam >= 0) {
          gateGrace -= dt;
          if (gateGrace <= 0) gateTeam = -1;
        }
        if (gateTeam !== before) {
          api.sfx('flip');
          if (gateTeam >= 0) {
            hint('gate', TEAM_NAME[gateTeam] + ' holds the top button: the center gate is open for ' +
              TEAM_NAME[gateTeam].toLowerCase() + ' only.');
          }
        }
      }

      function moveBall(b, dt) {
        const carrying = isCarrier(b);
        if (carrying) {
          const wBefore = Math.min(1, b.carryT / WEIGHT_FULL);
          b.carryT += dt;
          const w = Math.min(1, b.carryT / WEIGHT_FULL);
          if (wBefore < 0.55 && w >= 0.55) hint('heavy', 'The carrier is half-loaded and rolling slower. Speed pads and dashes help less as the ring fills.');
        }
        const w = carrying ? Math.min(1, b.carryT / WEIGHT_FULL) : 0;
        b.mass = 1 + 2 * loadOf(w);
        b.dashCd = Math.max(0, b.dashCd - dt);
        b.padCd = Math.max(0, b.padCd - dt);
        b.dashT -= dt;
        b.grace -= dt;
        if (b.daze > 0) b.daze -= dt;
        else {
          const a = ACCEL * b.accelScale * speedFactor(w);
          b.vx += b.ix * a * dt;
          b.vy += b.iy * a * dt;
        }
        const damp = onButton(b) ? DAMP + 3 : DAMP;
        const f = Math.max(0, 1 - damp * dt);
        b.vx *= f;
        b.vy *= f;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rollX += (b.vx * dt) / R;
        b.rollY += (b.vy * dt) / R;
        // World edge.
        if (b.x < R) { b.x = R; if (b.vx < 0) b.vx = -b.vx * WALL_E; }
        if (b.x > WW - R) { b.x = WW - R; if (b.vx > 0) b.vx = -b.vx * WALL_E; }
        if (b.y < R) { b.y = R; if (b.vy < 0) b.vy = -b.vy * WALL_E; }
        if (b.y > WH - R) { b.y = WH - R; if (b.vy > 0) b.vy = -b.vy * WALL_E; }
        for (let k = 0; k < walls.length; k++) {
          const wl = walls[k];
          collideRect(b, wl.x, wl.y, wl.w, wl.h);
        }
        if (gateTeam !== b.team) collideRect(b, GATE.x, GATE.y, GATE.w, GATE.h);
        for (let k = 0; k < bumpers.length; k++) {
          const p = bumpers[k];
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d < p.r + R && d > 0.0001) {
            const nx = dx / d;
            const ny = dy / d;
            b.x = p.x + nx * (p.r + R);
            b.y = p.y + ny * (p.r + R);
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) {
              b.vx -= 2 * vn * nx;
              b.vy -= 2 * vn * ny;
            }
            const out = b.vx * nx + b.vy * ny;
            if (out < 260) {
              b.vx += nx * (260 - out);
              b.vy += ny * (260 - out);
            }
            if (p.flash < 0.15) api.sfx('blip');
            p.flash = 0.3;
          }
        }
        // Speed pads push along their arrow if you roll onto them going that way.
        for (let k = 0; k < pads.length; k++) {
          const p = pads[k];
          if (b.padCd > 0 || Math.abs(b.x - p.x) > PAD_W / 2 || Math.abs(b.y - p.y) > PAD_H / 2) continue;
          const along = b.vx * p.dx + b.vy * p.dy;
          if (along > 30 && along < BOOST_V) {
            const add = (BOOST_V - along) / b.mass;
            b.vx += p.dx * add;
            b.vy += p.dy * add;
            // Damp sideways drift so the burst feels directional.
            if (p.dx) b.vy *= 0.6; else b.vx *= 0.6;
            b.padCd = 0.5;
            for (let i = 0; i < 10; i++) {
              spark(b.x, b.y + (Math.random() - 0.5) * 20, -p.dx * (80 + Math.random() * 120),
                (Math.random() - 0.5) * 40, 0.4, C.mint, 2.5);
            }
            api.sfx('power');
            if (carrying && w > 0.3) hint('padheavy', 'Pads push a heavy carrier less. Grab them early, before the flag gets heavy.');
          }
        }
        for (let k = 0; k < spikes.length; k++) {
          const s = spikes[k];
          const half = s.s / 2 - 4;
          if (circleRect(b.x, b.y, R - 2, s.x - half, s.y - half, half * 2, half * 2)) {
            b.pop = true;
            hint('spike', 'Spikes pop any ball. It comes back at its base after 3 seconds.');
          }
        }
        // Heavy carriers kick up dust.
        if (w > 0.4) {
          b.dustT -= dt;
          const sp = Math.hypot(b.vx, b.vy);
          if (b.dustT <= 0 && sp > 30) {
            b.dustT = 0.12 - w * 0.06;
            spark(b.x - (b.vx / sp) * R, b.y - (b.vy / sp) * R + 6, (Math.random() - 0.5) * 30,
              (Math.random() - 0.5) * 30, 0.6, U.alpha(C.muted, 0.6), 3 + w * 3);
          }
        }
      }

      function collidePair(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 4 * R * R) return;
        let d = Math.sqrt(d2);
        let nx = 1;
        let ny = 0;
        if (d > 0.0001) { nx = dx / d; ny = dy / d; } else d = 0;
        const pen = 2 * R - d;
        const tot = a.mass + b.mass;
        a.x -= nx * pen * (b.mass / tot);
        a.y -= ny * pen * (b.mass / tot);
        b.x += nx * pen * (a.mass / tot);
        b.y += ny * pen * (a.mass / tot);
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const j = (-(1 + BALL_E) * vn) / (1 / a.mass + 1 / b.mass);
          a.vx -= (j / a.mass) * nx;
          a.vy -= (j / a.mass) * ny;
          b.vx += (j / b.mass) * nx;
          b.vy += (j / b.mass) * ny;
          if (vn < -150 && bumpSfxT <= 0) {
            api.sfx('tick');
            bumpSfxT = 0.08;
            for (let i = 0; i < 4; i++) {
              spark(a.x + nx * R, a.y + ny * R, (Math.random() - 0.5) * 160, (Math.random() - 0.5) * 160, 0.25, C.text, 2);
            }
          }
        }
        if (a.team !== b.team) {
          if (isCarrier(a) && a.grace <= 0) a.pop = true;
          if (isCarrier(b) && b.grace <= 0) b.pop = true;
          // A dash that slams into an enemy dazes them.
          if (vn < -170) {
            if (a.dashT > 0 && !isCarrier(b)) dazeBall(b);
            if (b.dashT > 0 && !isCarrier(a)) dazeBall(a);
          }
        }
      }

      function dazeBall(b) {
        if (b.daze > 0.3) return;
        b.daze = DAZE;
        b.dashT = 0;
        shake = Math.max(shake, 5);
        api.sfx('hit');
        for (let i = 0; i < 8; i++) {
          spark(b.x, b.y, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 220, 0.4, C.gold, 3);
        }
        hint('daze', 'Dazed! Dashing into an enemy stuns them for a second: handy for clearing a defender off the flag.');
      }

      function physStep(dt) {
        bumpSfxT -= dt;
        updateButton(dt);
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.alive) {
            b.respawn -= dt;
            if (b.respawn <= 0) respawn(b);
            continue;
          }
          moveBall(b, dt);
        }
        for (let i = 0; i < balls.length; i++) {
          const a = balls[i];
          if (!a.alive) continue;
          for (let j = i + 1; j < balls.length; j++) {
            const b = balls[j];
            if (b.alive) collidePair(a, b);
          }
        }
        // Re-resolve walls after ball pushes so nobody is shoved through one.
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.alive) continue;
          for (let k = 0; k < walls.length; k++) {
            const wl = walls[k];
            collideRect(b, wl.x, wl.y, wl.w, wl.h);
          }
          if (gateTeam !== b.team) collideRect(b, GATE.x, GATE.y, GATE.w, GATE.h);
          b.x = U.clamp(b.x, R, WW - R);
          b.y = U.clamp(b.y, R, WH - R);
        }
        for (let i = 0; i < balls.length; i++) if (balls[i].pop) pop(balls[i]);
        // Grabs and captures.
        for (let i = 0; i < balls.length && state === 'play'; i++) {
          const b = balls[i];
          if (!b.alive) continue;
          const foe = 1 - b.team;
          const f = flags[foe];
          if (f.carrier === b) {
            const home = BASES[b.team];
            const dx = b.x - home.x;
            const dy = b.y - home.y;
            if (dx * dx + dy * dy < (BASE_R - 6) * (BASE_R - 6)) {
              if (!flags[b.team].carrier) capture(b);
              else if (blockedHintT <= 0) {
                blockedHintT = 4;
                if (b.human || (mode !== 'versus' && b.team === 0)) {
                  api.setStatus('Your flag must be home to score. Tag their carrier to bring it back.');
                }
              }
            }
          } else if (!f.carrier) {
            const s = BASES[foe];
            const dx = b.x - s.x;
            const dy = b.y - s.y;
            if (dx * dx + dy * dy < (R + 16) * (R + 16)) {
              f.carrier = b;
              b.carryT = 0;
              b.grace = GRACE;
              api.sfx('power');
              burst(s.x, s.y - 20, TEAM_COLOR[foe], 16, 200);
              say((b.human ? 'P' + b.human : b.name) + ' has the ' + TEAM_NAME[foe].toLowerCase() + ' flag', TEAM_COLOR[b.team], 1.4);
              hint('grab', 'Flag taken! The carrier gets heavier and slower every second. Watch the ring fill and hurry home.');
            }
          }
        }
      }

      /* ---------- Bots ---------- */
      function nearestEnemy(team, x, y, maxD) {
        let best = null;
        let bd = maxD * maxD;
        for (let i = 0; i < balls.length; i++) {
          const e = balls[i];
          if (!e.alive || e.team === team) continue;
          const d = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
          if (d < bd) { bd = d; best = e; }
        }
        return best;
      }

      function escort(b, carrier) {
        const e = nearestEnemy(b.team, carrier.x, carrier.y, 320);
        if (e) {
          const dd = Math.hypot(e.x - carrier.x, e.y - carrier.y);
          if (dd < 170) { b.chase = e; return; }
          b.tx = carrier.x + (e.x - carrier.x) * 0.5;
          b.ty = carrier.y + (e.y - carrier.y) * 0.5;
        } else {
          const home = BASES[b.team];
          const dx = home.x - carrier.x;
          const dy = home.y - carrier.y;
          const d = Math.hypot(dx, dy) || 1;
          b.tx = carrier.x + (dx / d) * 70;
          b.ty = carrier.y + (dy / d) * 70;
        }
      }

      function decide(b) {
        const me = b.team;
        const foe = 1 - me;
        const enemyCarrier = flags[me].carrier;
        const allyCarrier = flags[foe].carrier;
        const home = BASES[me];
        b.chase = null;
        b.arrive = false;
        b.avoid = false;
        b.hunt = false;
        if (allyCarrier === b) {
          b.tx = home.x;
          b.ty = home.y;
          b.avoid = true;
          b.arrive = !!enemyCarrier;  // own flag is out: wait in the base
        } else if (b.role === 'defender') {
          if (enemyCarrier) b.chase = enemyCarrier;
          else {
            const e = nearestEnemy(me, home.x, home.y, 300);
            if (e && Math.hypot(e.x - b.x, e.y - b.y) < 110) b.chase = e;
            else if (e) {
              b.tx = home.x + (e.x - home.x) * 0.6;
              b.ty = home.y + (e.y - home.y) * 0.6;
            } else {
              b.tx = home.x + (me === 0 ? 115 : -115);
              b.ty = home.y;
              b.arrive = true;
            }
          }
        } else if (b.role === 'support') {
          if (enemyCarrier && (weightOf(enemyCarrier) > 0.2 || Math.hypot(enemyCarrier.x - b.x, enemyCarrier.y - b.y) < 380)) {
            b.chase = enemyCarrier;
          } else if (allyCarrier) escort(b, allyCarrier);
          else if (buttonTeam === foe || buttonTeam === -2) {
            b.chase = nearestEnemy(me, BUTTON.x, BUTTON.y, 60);
            if (!b.chase) { b.tx = BUTTON.x; b.ty = BUTTON.y; b.arrive = true; }
          } else {
            b.tx = BUTTON.x;
            b.ty = BUTTON.y;
            b.arrive = true;
          }
        } else {
          // Attacker.
          if (enemyCarrier && (allyCarrier || Math.hypot(enemyCarrier.x - b.x, enemyCarrier.y - b.y) < 260 ||
            weightOf(enemyCarrier) > 0.6)) {
            b.chase = enemyCarrier;
          } else if (allyCarrier) escort(b, allyCarrier);
          else {
            const fx = BASES[foe].x;
            const fy = BASES[foe].y;
            const guard = nearestEnemy(me, fx, fy, 170);
            // Clear a guard off the flag with a dash before grabbing.
            if (guard && guard.daze <= 0 && b.dashCd < 0.4 && Math.hypot(fx - b.x, fy - b.y) < 420 && Math.random() < b.skill.dash + 0.2) {
              b.chase = guard;
              b.hunt = true;
            } else {
              b.tx = fx;
              b.ty = fy;
            }
          }
        }
        if (b.chase) {
          b.tx = b.chase.x;
          b.ty = b.chase.y;
        }
        buildField(b.field, b.tx, b.ty, gateTeam, me);
        b.padGoal = null;
        if (b.skill.pads && !b.arrive) {
          const dT = Math.hypot(b.tx - b.x, b.ty - b.y);
          for (let k = 0; k < pads.length; k++) {
            const p = pads[k];
            const dp = Math.hypot(p.x - b.x, p.y - b.y);
            if (dp > 230 || dp < 30) continue;
            const ptx = b.tx - p.x;
            const pty = b.ty - p.y;
            const pd = Math.hypot(ptx, pty) || 1;
            const behind = (b.x - p.x) * p.dx + (b.y - p.y) * p.dy < -20;
            if (behind && (ptx * p.dx + pty * p.dy) / pd > 0.6 && pd + 40 < dT &&
              lineClear(b.x, b.y, p.x, p.y, gateTeam, me)) {
              b.padGoal = p;
              b.padT = 1.5;
              break;
            }
          }
        }
      }

      function nav(b, tx, ty) {
        const me = b.team;
        if (lineClear(b.x, b.y, tx, ty, gateTeam, me)) { b.wx = tx; b.wy = ty; return; }
        const f = b.field;
        let c = cellAt(b.x, b.y);
        if (f[c] < 0) {
          // Hugging a wall: look around for the nearest charted cell.
          const cx = c % GW;
          const cy = (c / GW) | 0;
          let best = -1;
          let bv = 32767;
          for (let oy = -2; oy <= 2; oy++) {
            for (let ox = -2; ox <= 2; ox++) {
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
              const v = f[ny * GW + nx];
              if (v >= 0 && v < bv) { bv = v; best = ny * GW + nx; }
            }
          }
          if (best < 0) { b.wx = tx; b.wy = ty; return; }
          b.wx = (best % GW) * CELL + CELL / 2;
          b.wy = ((best / GW) | 0) * CELL + CELL / 2;
          return;
        }
        let cur = c;
        let pick = c;
        for (let step = 0; step < 8; step++) {
          const cx = cur % GW;
          const cy = (cur / GW) | 0;
          let next = -1;
          let nv = f[cur];
          for (let k = 0; k < 8; k++) {
            const nx = cx + NDX[k];
            const ny = cy + NDY[k];
            if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
            const v = f[ny * GW + nx];
            if (v >= 0 && v < nv) { nv = v; next = ny * GW + nx; }
          }
          if (next < 0) break;
          cur = next;
          const px = (cur % GW) * CELL + CELL / 2;
          const py = ((cur / GW) | 0) * CELL + CELL / 2;
          if (step < 2 || lineClear(b.x, b.y, px, py, gateTeam, me)) pick = cur;
          else break;
        }
        b.wx = (pick % GW) * CELL + CELL / 2;
        b.wy = ((pick / GW) | 0) * CELL + CELL / 2;
      }

      function botFrame(b, dt) {
        if (!b.alive || b.daze > 0) { b.ix = 0; b.iy = 0; return; }
        b.think -= dt;
        if (b.think <= 0) {
          b.think = b.skill.think * (0.8 + Math.random() * 0.4);
          decide(b);
        }
        if (b.jiggle > 0) {
          b.jiggle -= dt;
          b.ix = b.jx;
          b.iy = b.jy;
          return;
        }
        const carrying = isCarrier(b);
        let tx = b.tx;
        let ty = b.ty;
        const ch = b.chase;
        if (ch) {
          if (!ch.alive) b.chase = null;
          else {
            const d = Math.hypot(ch.x - b.x, ch.y - b.y);
            const lead = Math.min(0.8, d / 380) * b.skill.lead;
            tx = ch.x + ch.vx * lead;
            ty = ch.y + ch.vy * lead;
          }
        }
        if (b.padGoal) {
          const p = b.padGoal;
          b.padT -= dt;
          if (b.padT <= 0 || (b.x - p.x) * p.dx + (b.y - p.y) * p.dy > 0) b.padGoal = null;
          else { tx = p.x; ty = p.y; }
        }
        nav(b, tx, ty);
        let dx = b.wx - b.x;
        let dy = b.wy - b.y;
        let d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        if (b.avoid) {
          for (let i = 0; i < balls.length; i++) {
            const e = balls[i];
            if (!e.alive || e.team === b.team) continue;
            const ex = b.x - e.x;
            const ey = b.y - e.y;
            const ed = Math.hypot(ex, ey);
            if (ed < 140 && ed > 1) {
              const k = ((140 - ed) / 140) * 1.6;
              dx += (ex / ed) * k;
              dy += (ey / ed) * k;
            }
          }
          d = Math.hypot(dx, dy) || 1;
          dx /= d;
          dy /= d;
        }
        const w = carrying ? Math.min(1, b.carryT / WEIGHT_FULL) : 0;
        const vmax = ((ACCEL * b.accelScale) / DAMP) * speedFactor(w);
        let sp = vmax;
        const fd = Math.hypot(b.tx - b.x, b.ty - b.y);
        if (b.arrive && !b.chase && fd < 90) sp = (vmax * fd) / 90;
        const sx = dx * sp - b.vx;
        const sy = dy * sp - b.vy;
        const sl = Math.hypot(sx, sy);
        if (sl > 1) {
          const k = Math.min(1, sl / 50);
          b.ix = (sx / sl) * k;
          b.iy = (sy / sl) * k;
        } else {
          b.ix = 0;
          b.iy = 0;
        }
        if (b.skill.wobble) {
          const a = Math.sin(time * 1.7 + b.seed) * b.skill.wobble;
          const ca = Math.cos(a);
          const sa = Math.sin(a);
          const ix = b.ix * ca - b.iy * sa;
          b.iy = b.ix * sa + b.iy * ca;
          b.ix = ix;
        }
        // Dashes: to close on a carrier, or to sprint home with the flag.
        if (b.dashCd <= 0 && state === 'play') {
          const spd = Math.hypot(b.vx, b.vy) || 1;
          if (b.chase && (isCarrier(b.chase) || b.hunt)) {
            const cx = b.chase.x - b.x;
            const cy = b.chase.y - b.y;
            const cd = Math.hypot(cx, cy) || 1;
            if (cd < 170 && cd > 40 && (b.vx * cx + b.vy * cy) / (spd * cd) > 0.8 && Math.random() < b.skill.dash * dt * 6) {
              tryDash(b, cx, cy);
            }
          } else if (carrying) {
            const home = BASES[b.team];
            const hd = Math.hypot(home.x - b.x, home.y - b.y);
            if (hd > 220 && !nearestEnemy(b.team, b.x, b.y, 150) && Math.random() < b.skill.dash * dt * 2 &&
              lineClear(b.x, b.y, home.x, home.y, gateTeam, b.team)) {
              tryDash(b, home.x - b.x, home.y - b.y);
            }
          }
        }
        // Unstick if pinned against something.
        const spd = Math.hypot(b.vx, b.vy);
        if (spd < 25 && b.ix * b.ix + b.iy * b.iy > 0.25 && !(b.arrive && fd < 40)) {
          b.stuckT += dt;
          if (b.stuckT > 1) {
            b.stuckT = 0;
            b.jiggle = 0.45;
            const a = Math.random() * TAU;
            b.jx = Math.cos(a);
            b.jy = Math.sin(a);
          }
        } else b.stuckT = 0;
      }

      function readHumans() {
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.human) continue;
          const k = api.keys;
          let x;
          let y;
          if (b.human === 1) {
            x = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
            y = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
          } else {
            x = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
            y = (k.has('ArrowDown') ? 1 : 0) - (k.has('ArrowUp') ? 1 : 0);
          }
          if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
          b.ix = x;
          b.iy = y;
        }
      }

      function humanBall(n) {
        for (let i = 0; i < balls.length; i++) if (balls[i].human === n) return balls[i];
        return null;
      }

      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        if (e.code === 'Space') {
          const b = humanBall(1);
          if (b) tryDash(b, b.ix, b.iy);
        } else if (e.code === 'Enter') {
          const b = humanBall(2);
          if (b) tryDash(b, b.ix, b.iy);
        }
      });

      /* ---------- Update ---------- */
      function updateCamera(dt) {
        let tx = WW / 2;
        let ty = WH / 2;
        let tz = 0.8;
        if (state !== 'menu') {
          let n = 0;
          let minX = 1e9;
          let maxX = -1e9;
          let minY = 1e9;
          let maxY = -1e9;
          for (let i = 0; i < balls.length; i++) {
            const b = balls[i];
            if (!b.human) continue;
            const s = SPAWNS[b.team][b.slot];
            const px = b.alive ? b.x + b.vx * 0.2 : s.x;
            const py = b.alive ? b.y + b.vy * 0.2 : s.y;
            minX = Math.min(minX, px); maxX = Math.max(maxX, px);
            minY = Math.min(minY, py); maxY = Math.max(maxY, py);
            n++;
          }
          if (n) {
            tx = (minX + maxX) / 2;
            ty = (minY + maxY) / 2;
            tz = n === 1 ? 1 : U.clamp(Math.min(VW / (maxX - minX + 380), VH / (maxY - minY + 280)), 0.8, 1);
          }
        }
        const kz = Math.min(1, dt * 2.5);
        const kp = Math.min(1, dt * 5);
        cam.z += (tz - cam.z) * kz;
        cam.x += (tx - cam.x) * kp;
        cam.y += (ty - cam.y) * kp;
        const hw = VW / 2 / cam.z;
        const hh = VH / 2 / cam.z;
        cam.x = hw * 2 >= WW ? WW / 2 : U.clamp(cam.x, hw, WW - hw);
        cam.y = hh * 2 >= WH ? WH / 2 : U.clamp(cam.y, hh, WH - hh);
      }

      function update(dt) {
        time += dt;
        updateParticles(dt);
        shake = Math.max(0, shake - dt * 30);
        banner.t -= dt;
        blockedHintT -= dt;
        for (let k = 0; k < bumpers.length; k++) bumpers[k].flash = Math.max(0, bumpers[k].flash - dt);
        for (let k = 0; k < 2; k++) flags[k].back = Math.max(0, flags[k].back - dt * 1.5);
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'play';
            api.sfx('power');
            say('Roll!', C.mint, 0.8);
          } else if (Math.ceil(countT) !== prev) api.sfx('tick');
          updateCamera(dt);
          return;
        }
        if (state !== 'play') { updateCamera(dt); return; }
        if (hitStop > 0) { hitStop -= dt; updateCamera(dt); return; }
        matchT += dt;
        if (!overtime) {
          clock -= dt;
          if (clock <= 0) {
            clock = 0;
            if (caps[0] !== caps[1]) { endMatch(); return; }
            overtime = true;
            clock = OVERTIME;
            say('Overtime', C.gold, 2);
            api.sfx('power');
            api.setStatus('Tied after 5 minutes. Overtime: the next capture wins.');
          }
        } else {
          clock -= dt;
          if (clock <= 0) { clock = 0; endMatch(); return; }
        }
        readHumans();
        for (let i = 0; i < balls.length; i++) if (!balls[i].human) botFrame(balls[i], dt);
        acc += dt;
        while (acc >= STEP) {
          acc -= STEP;
          physStep(STEP);
          if (state !== 'play' || hitStop > 0) { acc = 0; break; }
        }
        updateCamera(dt);
      }

      /* ---------- Drawing ---------- */
      function drawWorld() {
        // Floor.
        ctx.fillStyle = U.alpha(C.p1, 0.05);
        ctx.fillRect(0, 0, WW / 2, WH);
        ctx.fillStyle = U.alpha(C.p2, 0.05);
        ctx.fillRect(WW / 2, 0, WW / 2, WH);
        ctx.strokeStyle = U.alpha(C.line, 0.35);
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 50; x < WW; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, WH); }
        for (let y = 50; y < WH; y += 50) { ctx.moveTo(0, y); ctx.lineTo(WW, y); }
        ctx.stroke();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 6;
        ctx.strokeRect(-3, -3, WW + 6, WH + 6);
        // Bases.
        for (let t = 0; t < 2; t++) {
          const base = BASES[t];
          ctx.fillStyle = U.alpha(TEAM_COLOR[t], 0.12);
          ctx.beginPath();
          ctx.arc(base.x, base.y, BASE_R, 0, TAU);
          ctx.fill();
          ctx.setLineDash([8, 7]);
          ctx.lineDashOffset = -time * 12;
          ctx.strokeStyle = U.alpha(TEAM_COLOR[t], 0.7);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          ctx.fillStyle = C.panel2;
          ctx.beginPath();
          ctx.arc(base.x, base.y, 12, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = TEAM_COLOR[t];
          ctx.lineWidth = 2;
          ctx.stroke();
          const f = flags[t];
          if (f.back > 0) {
            ctx.strokeStyle = U.alpha(TEAM_COLOR[t], f.back);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(base.x, base.y, 14 + (1 - f.back) * 50, 0, TAU);
            ctx.stroke();
          }
        }
        // Speed pads.
        for (let k = 0; k < pads.length; k++) {
          const p = pads[k];
          ctx.fillStyle = U.alpha(C.mint, 0.12);
          U.roundRect(ctx, p.x - PAD_W / 2, p.y - PAD_H / 2, PAD_W, PAD_H, 8);
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.mint, 0.75);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          for (let c = 0; c < 3; c++) {
            const ph = ((time * 1.6 + c / 3) % 1);
            const ox = (ph - 0.5) * (PAD_W - 26) * p.dx;
            ctx.strokeStyle = U.alpha(C.mint, Math.sin(ph * Math.PI));
            ctx.beginPath();
            ctx.moveTo(p.x + ox - 6 * p.dx, p.y - 9);
            ctx.lineTo(p.x + ox + 4 * p.dx, p.y);
            ctx.lineTo(p.x + ox - 6 * p.dx, p.y + 9);
            ctx.stroke();
          }
        }
        // Spikes.
        for (let k = 0; k < spikes.length; k++) {
          const s = spikes[k];
          const x0 = s.x - s.s / 2;
          const y0 = s.y - s.s / 2;
          ctx.fillStyle = '#2B1D3C';
          U.roundRect(ctx, x0, y0, s.s, s.s, 5);
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.p1, 0.55);
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.fillStyle = C.muted;
          const n = 3;
          const cw = s.s / n;
          ctx.beginPath();
          for (let a = 0; a < n; a++) {
            for (let c = 0; c < n; c++) {
              const cx = x0 + a * cw + cw / 2;
              const cy = y0 + c * cw + cw / 2;
              ctx.moveTo(cx, cy - cw * 0.38);
              ctx.lineTo(cx + cw * 0.32, cy + cw * 0.3);
              ctx.lineTo(cx - cw * 0.32, cy + cw * 0.3);
              ctx.closePath();
            }
          }
          ctx.fill();
        }
        // Button.
        const bc = buttonTeam >= 0 ? TEAM_COLOR[buttonTeam] : buttonTeam === -2 ? C.gold : C.muted;
        ctx.fillStyle = U.alpha(bc, 0.16 + (buttonTeam >= 0 ? 0.1 * Math.sin(time * 6) : 0));
        ctx.beginPath();
        ctx.arc(BUTTON.x, BUTTON.y, BUTTON.r, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = bc;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(BUTTON.x, BUTTON.y, BUTTON.r - 9, 0, TAU);
        ctx.stroke();
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = U.alpha(C.text, 0.7);
        ctx.fillText('GATE', BUTTON.x, BUTTON.y + BUTTON.r + 12);
        // Walls.
        ctx.fillStyle = C.panel2;
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        for (let k = 0; k < walls.length; k++) {
          const w = walls[k];
          ctx.fillRect(w.x, w.y, w.w, w.h);
          ctx.strokeRect(w.x, w.y, w.w, w.h);
        }
        ctx.fillStyle = U.alpha(C.text, 0.07);
        for (let k = 0; k < walls.length; k++) {
          const w = walls[k];
          ctx.fillRect(w.x + 2, w.y + 2, w.w - 4, 4);
        }
        // Gate.
        if (gateTeam >= 0) {
          const gc = TEAM_COLOR[gateTeam];
          ctx.fillStyle = U.alpha(gc, 0.18);
          ctx.fillRect(GATE.x, GATE.y, GATE.w, GATE.h);
          ctx.setLineDash([6, 6]);
          ctx.lineDashOffset = -time * 20;
          ctx.strokeStyle = gc;
          ctx.lineWidth = 2;
          ctx.strokeRect(GATE.x, GATE.y, GATE.w, GATE.h);
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
          if (gateGrace < 1.2 && buttonTeam < 0 && Math.sin(time * 20) > 0) {
            ctx.fillStyle = U.alpha(C.text, 0.25);
            ctx.fillRect(GATE.x, GATE.y, GATE.w, GATE.h);
          }
        } else {
          ctx.fillStyle = '#2E2860';
          ctx.fillRect(GATE.x, GATE.y, GATE.w, GATE.h);
          ctx.fillStyle = C.muted;
          for (let y = GATE.y + 6; y < GATE.y + GATE.h - 4; y += 14) ctx.fillRect(GATE.x + 3, y, GATE.w - 6, 5);
        }
        // Bumpers.
        for (let k = 0; k < bumpers.length; k++) {
          const p = bumpers[k];
          ctx.fillStyle = p.flash > 0 ? U.alpha(C.violet, 0.5 + p.flash) : C.panel2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = C.violet;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = C.violet;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5, 0, TAU);
          ctx.fill();
        }
        // Flags at home.
        for (let t = 0; t < 2; t++) {
          if (!flags[t].carrier) drawFlag(ctx, BASES[t].x - 2, BASES[t].y + 4, TEAM_COLOR[t], time + t, 1);
        }
        // Respawn timers.
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (b.alive) continue;
          const s = SPAWNS[b.team][b.slot];
          ctx.strokeStyle = U.alpha(TEAM_COLOR[b.team], 0.35);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(s.x, s.y, R, 0, TAU);
          ctx.stroke();
          ctx.strokeStyle = TEAM_COLOR[b.team];
          ctx.beginPath();
          ctx.arc(s.x, s.y, R, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - b.respawn / RESPAWN));
          ctx.stroke();
          ctx.font = SMALL;
          ctx.fillStyle = C.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.ceil(b.respawn)), s.x, s.y);
        }
        // Particles under balls.
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, p.life / p.max * 1.5);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        // Balls.
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.alive) continue;
          const carrying = isCarrier(b);
          drawBall(ctx, b.x, b.y, R, TEAM_COLOR[b.team], b.rollX, b.rollY);
          if (b.human) {
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(b.x, b.y, R + 1, 0, TAU);
            ctx.stroke();
            if (b.dashCd > 0 && !carrying) {
              ctx.strokeStyle = U.alpha(C.text, 0.4);
              ctx.beginPath();
              ctx.arc(b.x, b.y, R + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - b.dashCd / DASH_CD));
              ctx.stroke();
            }
          }
          if (b.daze > 0) {
            ctx.fillStyle = C.gold;
            for (let k = 0; k < 3; k++) {
              const a = time * 7 + (k * TAU) / 3;
              const sx = b.x + Math.cos(a) * (R + 4);
              const sy = b.y - R * 0.6 + Math.sin(a) * 5;
              ctx.beginPath();
              ctx.arc(sx, sy, 3, 0, TAU);
              ctx.fill();
            }
          }
          if (carrying) {
            const w = Math.min(1, b.carryT / WEIGHT_FULL);
            if (b.grace > 0 && Math.sin(time * 40) > 0) {
              ctx.strokeStyle = C.text;
              ctx.lineWidth = 3;
              ctx.beginPath();
              ctx.arc(b.x, b.y, R + 2, 0, TAU);
              ctx.stroke();
            }
            drawWeightRing(ctx, b.x, b.y, w, time);
            drawFlag(ctx, b.x + 2, b.y - 4, TEAM_COLOR[1 - b.team], time * 1.5, 0.7);
          }
        }
        // Labels.
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        for (let i = 0; i < balls.length; i++) {
          const b = balls[i];
          if (!b.alive) continue;
          const carrying = isCarrier(b);
          const ly = b.y - R - (carrying ? 36 : 6);
          ctx.font = b.human ? '700 13px "JetBrains Mono", monospace' : SMALL;
          ctx.fillStyle = b.human ? C.text : U.alpha(C.text, 0.6);
          ctx.fillText(b.name, b.x, ly);
          if (carrying) {
            const w = Math.min(1, b.carryT / WEIGHT_FULL);
            ctx.font = SMALL;
            ctx.fillStyle = weightColor(w);
            ctx.fillText('×' + (1 + 2 * loadOf(w)).toFixed(1) + ' weight', b.x, b.y + R + 26);
          }
        }
      }

      function drawEdgeMarkers() {
        // Point at off-screen flag carriers.
        for (let t = 0; t < 2; t++) {
          const c = flags[t].carrier;
          if (!c || !c.alive) continue;
          const sx = (c.x - cam.x) * cam.z + VW / 2;
          const sy = (c.y - cam.y) * cam.z + VH / 2;
          if (sx > 10 && sx < VW - 10 && sy > 60 && sy < VH - 10) continue;
          const mx = U.clamp(sx, 26, VW - 26);
          const my = U.clamp(sy, 76, VH - 26);
          const a = Math.atan2(sy - my, sx - mx);
          ctx.save();
          ctx.translate(mx, my);
          ctx.rotate(a);
          ctx.fillStyle = TEAM_COLOR[c.team];
          ctx.beginPath();
          ctx.moveTo(14, 0);
          ctx.lineTo(-6, -10);
          ctx.lineTo(-6, 10);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          ctx.fillStyle = TEAM_COLOR[t];
          ctx.fillRect(mx - 4, my - 4, 8, 8);
        }
      }

      function drawHud() {
        const cx = VW / 2;
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, cx - 130, 10, 260, 46, 12);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.textBaseline = 'middle';
        ctx.font = '800 26px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = C.p1;
        ctx.fillText(String(caps[0]), cx - 96, 34);
        ctx.fillStyle = C.p2;
        ctx.fillText(String(caps[1]), cx + 96, 34);
        ctx.font = HUD;
        ctx.fillStyle = overtime ? C.gold : clock < 30 && state === 'play' ? C.p1 : C.text;
        ctx.fillText((overtime ? 'OT ' : '') + fmtClock(clock), cx, 34);
        // Flag status pips.
        for (let t = 0; t < 2; t++) {
          const x = cx + (t === 0 ? -60 : 60);
          const home = !flags[t].carrier;
          ctx.fillStyle = home ? TEAM_COLOR[t] : (Math.sin(time * 10) > 0 ? TEAM_COLOR[t] : C.panel2);
          ctx.globalAlpha = home ? 0.9 : 1;
          ctx.beginPath();
          ctx.moveTo(x - 5, 42);
          ctx.lineTo(x - 5, 24);
          ctx.lineTo(x + 7, 28);
          ctx.lineTo(x - 5, 33);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          if (!home) {
            ctx.font = SMALL;
            ctx.fillStyle = TEAM_COLOR[t];
            ctx.fillText('taken', x, 50);
          }
        }
        drawEdgeMarkers();
        if (state === 'count') {
          ctx.font = '800 64px Unbounded, sans-serif';
          ctx.fillStyle = C.text;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(Math.max(1, Math.ceil(countT))), cx, VH / 2);
        }
        if (banner.t > 0) {
          ctx.globalAlpha = Math.min(1, banner.t * 2);
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(15,13,36,0.6)';
          ctx.fillText(banner.text, cx + 3, VH / 2 - 87);
          ctx.fillStyle = banner.color;
          ctx.fillText(banner.text, cx, VH / 2 - 90);
          ctx.globalAlpha = 1;
        }
        if (state === 'play' && matchT < 6 && !overtime) {
          ctx.font = SMALL;
          ctx.textAlign = 'center';
          ctx.fillStyle = U.alpha(C.text, Math.min(1, (6 - matchT) / 2));
          ctx.fillText(mode === 'versus' ? 'P1: WASD + Space dash    P2: arrows + Enter dash'
            : mode === 'coop' ? 'P1: WASD + Space dash    P2: arrows + Enter dash' : 'WASD to roll, Space to dash', cx, VH - 18);
        }
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, VW, VH);
        ctx.save();
        const sx = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
        const sy = shake > 0 ? (Math.random() * 2 - 1) * shake : 0;
        ctx.translate(VW / 2 + sx, VH / 2 + sy);
        ctx.scale(cam.z, cam.z);
        ctx.translate(-cam.x, -cam.y);
        drawWorld();
        ctx.restore();
        drawHud();
      }

      setupTeams();
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
