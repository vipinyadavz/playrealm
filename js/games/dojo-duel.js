/* Dojo Duel — a minimal side-view fighting game with jointed geometric fighters.
   The twist: tap block at the last instant to parry and leave the attacker stunned. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;

  const W = 960;
  const H = 540;
  const FLOOR = 452;
  const LEFT = 60;
  const RIGHT = 900;
  const STEP = 1 / 60;
  const GRAV = 2700;
  const JUMP_V = 880;
  const JUMP_X = 250;
  const WALK_F = 230;
  const WALK_B = 175;
  const DASH_T = 0.18;
  const DASH_V = 650;
  const BDASH_V = 520;
  const TAP_GAP = 0.22;
  const PARRY_WIN = 0.12;
  const PARRY_STUN = 0.6;
  const PARRY_REARM = 0.35;
  const ROUND_TIME = 60;
  const MAX_HP = 100;
  const BUF = 0.13;
  const PUSH_W = 26;
  const SPECIAL_COST = 50;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const TAU = Math.PI * 2;

  /* Frame data in seconds. Hitboxes are relative to the feet, x along facing. */
  const MOVES = {
    light: { startup: 0.07, active: 0.06, recovery: 0.14, dmg: 5, x0: 18, x1: 84, y0: -132, y1: -100, hitstun: 0.28, blockstun: 0.16, push: 22, meter: 6, stop: 0.05 },
    clight: { startup: 0.08, active: 0.06, recovery: 0.16, dmg: 4, x0: 18, x1: 86, y0: -50, y1: -16, hitstun: 0.26, blockstun: 0.15, push: 22, meter: 5, stop: 0.05, crouch: true },
    heavy: { startup: 0.22, active: 0.08, recovery: 0.32, dmg: 12, x0: 24, x1: 106, y0: -116, y1: -66, hitstun: 0.4, blockstun: 0.24, push: 46, meter: 12, stop: 0.1, knock: true },
    sweep: { startup: 0.2, active: 0.08, recovery: 0.38, dmg: 10, x0: 24, x1: 114, y0: -32, y1: -2, hitstun: 0.4, blockstun: 0.22, push: 40, meter: 10, stop: 0.09, knock: true, crouch: true },
    air: { startup: 0.07, active: 0.6, recovery: 0.08, dmg: 8, x0: 8, x1: 72, y0: -70, y1: -6, hitstun: 0.32, blockstun: 0.18, push: 30, meter: 8, stop: 0.07 },
    special: { startup: 0.12, active: 0.22, recovery: 0.42, dmg: 18, x0: 8, x1: 78, y0: -128, y1: -48, hitstun: 0.5, blockstun: 0.3, push: 70, meter: 0, stop: 0.13, knock: true, lunge: 720 }
  };
  const NEUTRAL = { stand: true, crouch: true };

  const AI_CFG = {
    easy: { think: 0.32, react: 0.2, block: 0.3, parry: 0, preblock: 0.05, combo: 0.35, punish: 0.3, aa: 0.1, special: 0.3, dash: 0.05, duck: 0.05, aggro: 0.35, adapt: 0.2 },
    normal: { think: 0.13, react: 0.09, block: 0.45, parry: 0.12, preblock: 0.16, combo: 0.8, punish: 0.8, aa: 0.45, special: 0.65, dash: 0.2, duck: 0.3, aggro: 0.55, adapt: 1.0 },
    hard: { think: 0.1, react: 0.07, block: 0.42, parry: 0.42, preblock: 0.2, combo: 0.95, punish: 0.95, aa: 0.7, special: 0.85, dash: 0.3, duck: 0.35, aggro: 0.6, adapt: 1.2 }
  };

  const KEYS = [
    { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', light: 'KeyF', heavy: 'KeyG', block: 'Space', special: 'KeyR' },
    { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', light: 'Period', heavy: 'Slash', block: 'Enter', special: 'ShiftRight' }
  ];

  function shade(hex, t) {
    const a = parseInt(hex.slice(1), 16);
    const k = 1 - t;
    return 'rgb(' + Math.round(((a >> 16) & 255) * k + 15 * t) + ',' + Math.round(((a >> 8) & 255) * k + 13 * t) + ',' +
      Math.round((a & 255) * k + 36 * t) + ')';
  }

  /* ---------- Skeleton ---------- */
  const THIGH = 34;
  const SHIN = 34;
  const UPPER = 28;
  const FORE = 27;
  const TORSO = 52;
  // Pose slots: 0 lean, 1-2 front shoulder/elbow, 3-4 back shoulder/elbow, 5-6 front hip/knee, 7-8 back hip/knee, 9 body roll.
  const P = {
    stand: [0.06, 0.55, 2.0, 0.35, 2.2, 0.3, -0.42, -0.25, -0.3, 0],
    crouch: [0.25, 0.7, 1.9, 0.45, 2.1, 1.25, -2.1, 0.5, -1.9, 0],
    jump: [0.1, 0.9, 1.6, 0.6, 1.8, 1.0, -1.7, 0.2, -1.4, 0],
    block: [-0.08, 0.35, 2.75, 0.75, 2.35, 0.32, -0.5, -0.3, -0.3, 0],
    cblock: [0.1, 0.4, 2.7, 0.8, 2.3, 1.25, -2.1, 0.5, -1.9, 0],
    lightS: [0.1, 0.9, 1.9, 0.2, 2.2, 0.35, -0.45, -0.3, -0.25, 0],
    lightA: [0.22, 1.55, 0.05, -0.2, 2.3, 0.4, -0.4, -0.45, -0.1, 0],
    clightA: [0.35, 1.25, 0.05, 0.3, 2.1, 1.3, -2.1, 0.6, -1.9, 0],
    heavyS: [-0.2, 0.3, 2.1, 0.7, 1.9, 1.35, -1.9, -0.1, -0.2, 0],
    heavyA: [-0.3, 0.1, 1.6, 0.9, 1.5, 1.6, -0.08, -0.15, -0.15, 0],
    sweepA: [0.45, 0.9, 1.4, 0.2, 1.6, 1.5, -0.05, 0.9, -2.2, 0],
    airA: [0.0, 0.7, 1.5, 0.3, 1.8, 1.05, -0.2, 0.3, -1.6, 0],
    specialS: [-0.15, 0.2, 2.4, 0.15, 2.4, 0.4, -0.6, -0.3, -0.4, 0],
    specialA: [0.35, 1.5, 0.15, 1.45, 0.25, 0.6, -0.3, -0.6, -0.2, 0],
    hit: [-0.45, -0.3, 0.7, -0.5, 0.9, 0.1, -0.2, -0.45, -0.3, 0],
    dazed: [-0.25, 0.9, 0.3, -0.7, 0.4, 0.3, -0.5, -0.25, -0.35, 0],
    down: [0, 0.2, 0.4, -0.2, 0.6, 0.2, -0.1, -0.1, -0.2, -1.5],
    getup: [0.3, 0.6, 1.0, 0.3, 1.2, 1.2, -2.0, 0.4, -1.8, 0],
    win: [0.0, 2.9, 0.2, 0.3, 2.2, 0.3, -0.4, -0.25, -0.3, 0]
  };

  /* Draws one fighter from a pose. fx = facing (1 right, -1 left). Writes limb ends into `out` if given. */
  function drawFighter(ctx, x, y, fx, pose, base, dark, band, alpha) {
    const lean = pose[0];
    const roll = pose[9];
    const vy = (a, l) => Math.cos(a) * l;
    const fd = vy(pose[5], THIGH) + vy(pose[5] + pose[6], SHIN);
    const bd = vy(pose[7], THIGH) + vy(pose[7] + pose[8], SHIN);
    const hipH = Math.max(18, Math.max(fd, bd));
    const lying = Math.min(1, Math.abs(roll) / 1.5);
    ctx.save();
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.translate(x, y - hipH + (hipH - 16) * lying);
    ctx.rotate(roll * fx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const limb = (ox, oy, a1, l1, a2, l2, w, col) => {
      const kx = ox + Math.sin(a1) * l1 * fx;
      const ky = oy + Math.cos(a1) * l1;
      const ex = kx + Math.sin(a1 + a2) * l2 * fx;
      const ey = ky + Math.cos(a1 + a2) * l2;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      return ex;
    };
    const nx = Math.sin(lean) * TORSO * fx;
    const ny = -Math.cos(lean) * TORSO;
    // Back limbs first.
    limb(0, 0, pose[7], THIGH, pose[8], SHIN, 12, dark);
    limb(nx * 0.92, ny * 0.92, pose[3], UPPER, pose[4], FORE, 10, dark);
    // Torso.
    ctx.strokeStyle = base;
    ctx.lineWidth = 20;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(nx, ny);
    ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(-9, -4);
    ctx.lineTo(9, -4);
    ctx.stroke();
    // Head with a headband.
    const hx = nx + Math.sin(lean) * 18 * fx;
    const hy = ny - Math.cos(lean) * 18;
    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(hx, hy, 15, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = band;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(hx, hy, 15, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(hx - 13 * fx, hy - 6);
    ctx.lineTo(hx - 24 * fx, hy - 2 + Math.sin(x * 0.05) * 3);
    ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.fillRect(hx + 5 * fx - 2, hy - 3, 4, 4);
    // Front limbs.
    limb(0, 0, pose[5], THIGH, pose[6], SHIN, 12, base);
    limb(nx * 0.92, ny * 0.92, pose[1], UPPER, pose[2], FORE, 10, base);
    ctx.restore();
  }

  function drawDojo(ctx, w, h, floorY, t) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, w, h);
    // Back wall panels.
    const pw = w / 6;
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? '#1A1636' : '#1E1A3E';
      ctx.fillRect(i * pw, 0, pw, floorY);
      ctx.strokeStyle = U.alpha(C.line, 0.5);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let gx = 1; gx < 3; gx++) { ctx.moveTo(i * pw + (gx * pw) / 3, floorY * 0.12); ctx.lineTo(i * pw + (gx * pw) / 3, floorY * 0.78); }
      for (let gy = 1; gy < 5; gy++) { ctx.moveTo(i * pw + 6, floorY * (0.12 + gy * 0.13)); ctx.lineTo(i * pw + pw - 6, floorY * (0.12 + gy * 0.13)); }
      ctx.stroke();
    }
    // Pillars and beam.
    ctx.fillStyle = '#2B2350';
    for (let i = 0; i <= 6; i++) ctx.fillRect(i * pw - 7, 0, 14, floorY);
    ctx.fillRect(0, floorY * 0.08, w, 12);
    // Moon window.
    ctx.fillStyle = U.alpha(C.gold, 0.12);
    ctx.beginPath();
    ctx.arc(w / 2, floorY * 0.36, floorY * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = U.alpha(C.gold, 0.2);
    ctx.beginPath();
    ctx.arc(w / 2, floorY * 0.36, floorY * 0.15, 0, TAU);
    ctx.fill();
    // Hanging banners.
    for (let k = 0; k < 2; k++) {
      const bx = k ? w * 0.82 : w * 0.18;
      const sway = Math.sin(t * 1.3 + k) * 2;
      ctx.fillStyle = k ? U.alpha(C.p2, 0.35) : U.alpha(C.p1, 0.35);
      ctx.beginPath();
      ctx.moveTo(bx - 22, floorY * 0.1);
      ctx.lineTo(bx + 22, floorY * 0.1);
      ctx.lineTo(bx + 22 + sway, floorY * 0.48);
      ctx.lineTo(bx + sway, floorY * 0.42);
      ctx.lineTo(bx - 22 + sway, floorY * 0.48);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = U.alpha(C.text, 0.4);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(bx + sway / 2, floorY * 0.26, 9, 0, TAU);
      ctx.stroke();
    }
    // Floor planks.
    ctx.fillStyle = '#2A2148';
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.fillStyle = '#342A58';
    ctx.fillRect(0, floorY, w, 5);
    ctx.strokeStyle = U.alpha(C.ink, 0.6);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let r = 1; r < 4; r++) {
      const yy = floorY + ((h - floorY) * r) / 4;
      ctx.moveTo(0, yy);
      ctx.lineTo(w, yy);
      for (let x = (r * 97) % 160; x < w; x += 160) { ctx.moveTo(x, yy - (h - floorY) / 4); ctx.lineTo(x, yy); }
    }
    ctx.stroke();
  }

  Arcade.register({
    id: 'dojo-duel',
    title: 'Dojo Duel',
    category: 'combat',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.p1,
    tagline: 'A tight one-on-one fighter where perfect timing beats big damage.',
    hook: 'Block at the last instant to parry and leave your rival wide open.',
    tags: ['fighting', 'versus', 'martial arts', 'parry', 'combo', 'computer opponent', 'keyboard'],
    howTo: 'Knock your rival’s health to zero or have more left when the 60-second timer runs out. Best of 3 rounds. ' +
      'Light attacks are quick, heavies are slow but knock down, and light, light, heavy chains into a combo. ' +
      'Standing lights fly over a crouching rival; crouching heavy sweeps the legs. Double-tap a direction to dash. ' +
      'Hitting and getting hit fill your meter; at half a bar you can fire a lunging special. Hold block to guard. ' +
      'The twist: tap block in the last moment before a hit lands (within about a tenth of a second) to parry. ' +
      'You take nothing, and the attacker is stunned for over half a second, wide open for your best combo.',
    controls: [
      { keys: ['A', 'D'], label: 'P1 walk (double-tap to dash)' },
      { keys: ['W', 'S'], label: 'P1 jump / crouch' },
      { keys: ['F', 'G'], label: 'P1 light / heavy' },
      { keys: ['Space'], label: 'P1 block (tap late to parry)' },
      { keys: ['R'], label: 'P1 special' },
      { keys: ['←', '→'], label: 'P2 walk (double-tap to dash)' },
      { keys: ['↑', '↓'], label: 'P2 jump / crouch' },
      { keys: ['.', '/'], label: 'P2 light / heavy' },
      { keys: ['Enter'], label: 'P2 block (tap late to parry)' },
      { keys: ['Right Shift'], label: 'P2 special' }
    ],

    drawThumb(ctx, w, h, t) {
      const fy = h - 34;
      drawDojo(ctx, w, h, fy, t);
      const s = 0.62;
      ctx.save();
      ctx.translate(0, fy);
      ctx.scale(s, s);
      // Coral parries a cyan heavy kick.
      drawFighter(ctx, (w * 0.4) / s, 0, 1, P.block, C.p1, shade(C.p1, 0.35), C.gold);
      drawFighter(ctx, (w * 0.62) / s, 0, -1, P.heavyA, C.p2, shade(C.p2, 0.35), C.violet);
      ctx.restore();
      // Parry flash.
      const px = w * 0.47;
      const py = fy - 62;
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.strokeStyle = U.alpha('#FFFFFF', 0.5 + pulse * 0.4);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(px, py, 16 + pulse * 6, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        const r = i % 2 ? 6 : 15;
        ctx.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.font = '800 22px Unbounded, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText('Parry!', w / 2, 34);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      void canvas;

      let state = 'menu';   // 'menu' | 'count' | 'fight' | 'ko' | 'roundEnd' | 'over'
      let vsCpu = false;
      let diff = 'normal';
      let simT = 0;         // simulation clock (frozen during hit-stop)
      let time = 0;         // real clock for cosmetics
      let acc = 0;
      let hitStop = 0;
      let slowMo = 0;
      let shake = 0;
      let flash = 0;
      let countT = 0;
      let clock = ROUND_TIME;
      let round = 1;
      let stateT = 0;
      let banner = '';
      let bannerColor = C.text;
      let bannerT = 0;
      let hints = {};
      const fighters = [makeFighter(0), makeFighter(1)];

      function makeFighter(i) {
        return {
          i, x: 0, y: FLOOR, vx: 0, vy: 0, face: 1, pushV: 0, hp: MAX_HP, hpLag: MAX_HP, lagT: 0, meter: 0,
          state: 'stand', st: 0, stun: 0, move: null, moveName: '', hitDone: false, connected: false, chain: 0,
          air: false, airAtk: false, airT: 0, airUsed: false, taken: 0, wins: 0, cpu: false,
          held: { l: false, r: false, u: false, d: false, blk: false },
          press: { light: -9, heavy: -9, special: -9, jump: -9 },
          parryAt: -9, lastBlock: -9, tapL: -9, tapR: -9, dashDir: 0, dashAt: -9,
          pose: new Float64Array(10), target: new Float64Array(10), walkPh: 0,
          color: i === 0 ? C.p1 : C.p2, dark: shade(i === 0 ? C.p1 : C.p2, 0.38), band: i === 0 ? C.gold : C.violet,
          ai: { t: 0, reacted: false, blockT: 0, parryPress: -1, comboGo: false, crouchT: 0, heat: 0 },
          stats: { parries: 0, hits: 0 }
        };
      }

      /* ---------- Effects (pooled) ---------- */
      const PMAX = 220;
      const parts = [];
      for (let i = 0; i < PMAX; i++) parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, color: C.text, size: 3 });
      let pNext = 0;
      function spark(x, y, vx, vy, life, color, size) {
        const p = parts[pNext];
        pNext = (pNext + 1) % PMAX;
        p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.color = color; p.size = size;
      }
      function burst(x, y, color, n, sp) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const s = sp * (0.35 + Math.random() * 0.65);
          spark(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.3, color, 2 + Math.random() * 3);
        }
      }
      const rings = [];
      for (let i = 0; i < 6; i++) rings.push({ x: 0, y: 0, t: 0, max: 1, color: C.text, r: 20 });
      function ring(x, y, color, r, dur) {
        let best = rings[0];
        for (let i = 1; i < rings.length; i++) if (rings[i].t < best.t) best = rings[i];
        best.x = x; best.y = y; best.color = color; best.r = r; best.t = dur; best.max = dur;
      }
      const pops = [];
      for (let i = 0; i < 4; i++) pops.push({ t: 0, text: '', color: C.text, x: 0, y: 0 });
      function popup(text, color, x, y) {
        let best = pops[0];
        for (let i = 1; i < pops.length; i++) if (pops[i].t < best.t) best = pops[i];
        best.t = 0.9; best.text = text; best.color = color; best.x = x; best.y = y;
      }
      function say(text, color, dur) {
        banner = text;
        bannerColor = color || C.text;
        bannerT = dur || 1;
      }
      function hint(key, text) {
        if (hints[key]) return;
        hints[key] = true;
        api.setStatus(text);
      }
      const nameOf = (i) => (vsCpu ? (i === 0 ? 'You' : 'CPU') : 'P' + (i + 1));

      /* ---------- Fighter logic ---------- */
      const pressed = (f, k) => simT - f.press[k] <= BUF;
      const consume = (f, k) => { f.press[k] = -9; };
      const airborne = (f) => f.state === 'jump' || f.state === 'knock';
      const invuln = (f) => f.state === 'knock' || f.state === 'down' || f.state === 'getup' || f.state === 'ko';

      function setState(f, s) {
        f.state = s;
        f.st = 0;
      }

      function startMove(f, name) {
        const m = MOVES[name];
        if (name === 'special') {
          if (f.meter < SPECIAL_COST) return false;
          f.meter -= SPECIAL_COST;
          api.sfx('power');
          ring(f.x, f.y - 90, f.color, 30, 0.35);
        }
        f.move = m;
        f.moveName = name;
        f.hitDone = false;
        f.connected = false;
        f.vx = 0;
        f.ai.comboGo = Math.random() < (f.cpu ? AI_CFG[diff].combo : 0);
        setState(f, 'attack');
        return true;
      }

      function tryAttack(f) {
        const crouch = f.held.d;
        if (pressed(f, 'special') && f.meter >= SPECIAL_COST) { consume(f, 'special'); f.chain = 0; return startMove(f, 'special'); }
        if (pressed(f, 'heavy')) { consume(f, 'heavy'); f.chain = 0; return startMove(f, crouch ? 'sweep' : 'heavy'); }
        if (pressed(f, 'light')) { consume(f, 'light'); f.chain = 1; return startMove(f, crouch ? 'clight' : 'light'); }
        return false;
      }

      function toNeutral(f) {
        setState(f, f.held.d ? 'crouch' : 'stand');
        f.move = null;
        f.vx = 0;
      }

      function faceOpponent(f, o) {
        if (Math.abs(o.x - f.x) > 4) f.face = o.x > f.x ? 1 : -1;
      }

      function stepFighter(f, o, dt) {
        f.st += dt;
        const h = f.held;
        switch (f.state) {
          case 'stand':
          case 'crouch': {
            faceOpponent(f, o);
            if (tryAttack(f)) break;
            if (simT - f.dashAt <= BUF && f.dashDir) {
              setState(f, 'dash');
              f.vx = f.dashDir * (f.dashDir === f.face ? DASH_V : BDASH_V);
              f.dashAt = -9;
              spark(f.x, f.y - 6, -f.dashDir * 120, -20, 0.3, U.alpha(C.text, 0.5), 5);
              break;
            }
            if (pressed(f, 'jump') && !h.blk) {
              consume(f, 'jump');
              setState(f, 'jump');
              const dir = (h.r ? 1 : 0) - (h.l ? 1 : 0);
              f.vx = dir * JUMP_X;
              f.vy = -JUMP_V;
              f.airAtk = false;
              f.airUsed = false;
              break;
            }
            const want = h.d ? 'crouch' : 'stand';
            if (f.state !== want) setState(f, want);
            const dir = (h.r ? 1 : 0) - (h.l ? 1 : 0);
            if (h.blk || h.d) f.vx = 0;
            else f.vx = dir * (dir === f.face ? WALK_F : WALK_B);
            break;
          }
          case 'dash':
            if (f.st > 0.08 && tryAttack(f)) break;
            if (f.st >= DASH_T) toNeutral(f);
            break;
          case 'attack': {
            const m = f.move;
            const total = m.startup + m.active + m.recovery;
            const activeNow = f.st >= m.startup && f.st < m.startup + m.active;
            if (m.lunge) f.vx = activeNow ? f.face * m.lunge : f.st < m.startup ? 0 : f.vx * 0.85;
            // Cancels after contact: light → light → heavy, and heavies into the special.
            if (f.connected && f.st >= m.startup) {
              if ((f.moveName === 'light' || f.moveName === 'clight') && f.chain < 2 && pressed(f, 'light')) {
                consume(f, 'light'); f.chain++; startMove(f, f.held.d ? 'clight' : 'light'); break;
              }
              if ((f.moveName === 'light' || f.moveName === 'clight') && pressed(f, 'heavy')) {
                consume(f, 'heavy'); f.chain = 0; startMove(f, f.held.d ? 'sweep' : 'heavy'); break;
              }
              if (f.moveName !== 'special' && pressed(f, 'special') && f.meter >= SPECIAL_COST) {
                consume(f, 'special'); f.chain = 0; startMove(f, 'special'); break;
              }
            }
            if (f.st >= total) toNeutral(f);
            break;
          }
          case 'jump':
            f.vy += GRAV * dt;
            if (!f.airUsed && (pressed(f, 'light') || pressed(f, 'heavy'))) {
              consume(f, 'light');
              consume(f, 'heavy');
              f.airUsed = true;
              f.airAtk = true;
              f.airT = 0;
              f.move = MOVES.air;
              f.moveName = 'air';
              f.hitDone = false;
              f.connected = false;
            }
            if (f.airAtk) f.airT += dt;
            if (f.y + f.vy * dt >= FLOOR && f.vy > 0) {
              f.y = FLOOR;
              f.vy = 0;
              f.airAtk = false;
              f.move = null;
              setState(f, 'land');
              f.vx = 0;
              spark(f.x - 10, FLOOR, -60, -30, 0.25, U.alpha(C.muted, 0.6), 4);
              spark(f.x + 10, FLOOR, 60, -30, 0.25, U.alpha(C.muted, 0.6), 4);
            }
            break;
          case 'land':
            if (f.st >= 0.06) { faceOpponent(f, o); toNeutral(f); }
            break;
          case 'hitstun':
          case 'blockstun':
            if (f.st >= f.stun) toNeutral(f);
            break;
          case 'parried':
            f.vx = 0;
            if (f.st >= PARRY_STUN) toNeutral(f);
            break;
          case 'knock':
            f.vy += GRAV * dt;
            if (f.y + f.vy * dt >= FLOOR && f.vy > 0) {
              f.y = FLOOR;
              f.vy = 0;
              f.vx = 0;
              shake = Math.max(shake, 5);
              burst(f.x, FLOOR - 4, U.alpha(C.muted, 0.7), 8, 160);
              api.sfx('hit');
              setState(f, f.hp <= 0 ? 'ko' : 'down');
            }
            break;
          case 'down':
            if (f.st >= 0.55) setState(f, 'getup');
            break;
          case 'getup':
            if (f.st >= 0.32) { faceOpponent(f, o); toNeutral(f); }
            break;
          default:
            f.vx = 0;
        }
        // Integrate.
        if (airborne(f)) f.y += f.vy * dt;
        f.x += (f.vx + f.pushV) * dt;
        f.pushV *= Math.exp(-9 * dt);
        if (Math.abs(f.pushV) < 2) f.pushV = 0;
        if (f.x < LEFT) { f.x = LEFT; if (f.pushV < 0) { o.pushV -= f.pushV * 0.7; f.pushV = 0; } }
        if (f.x > RIGHT) { f.x = RIGHT; if (f.pushV > 0) { o.pushV -= f.pushV * 0.7; f.pushV = 0; } }
      }

      function hurtTop(f) {
        if (f.state === 'crouch' || (f.state === 'attack' && f.move && f.move.crouch) ||
          (f.state === 'blockstun' && f.held.d)) return f.y - 96;
        if (f.state === 'jump') return f.y - 124;
        return f.y - 150;
      }

      function checkHit(f, o) {
        const m = f.move;
        if (!m || f.hitDone) return;
        let active = false;
        if (f.state === 'attack') active = f.st >= m.startup && f.st < m.startup + m.active;
        else if (f.state === 'jump' && f.airAtk) active = f.airT >= m.startup && f.airT < m.startup + m.active;
        if (!active || invuln(o)) return;
        const ax0 = f.x + f.face * m.x0;
        const ax1 = f.x + f.face * m.x1;
        const lx = Math.min(ax0, ax1);
        const rx = Math.max(ax0, ax1);
        const ty = f.y + m.y0;
        const by = f.y + m.y1;
        const top = hurtTop(o);
        const bottom = o.state === 'jump' ? o.y - 16 : o.y;
        if (rx < o.x - PUSH_W || lx > o.x + PUSH_W || by < top || ty > bottom) return;
        resolveHit(f, o, m, (Math.max(lx, o.x - PUSH_W) + Math.min(rx, o.x + PUSH_W)) / 2, (Math.max(ty, top) + Math.min(by, bottom)) / 2);
      }

      function resolveHit(f, o, m, cx, cy) {
        f.hitDone = true;
        f.connected = true;
        const canGuard = o.state === 'stand' || o.state === 'crouch' || o.state === 'blockstun';
        if (canGuard && simT - o.parryAt <= PARRY_WIN) {
          // Parry: no damage, attacker stunned and wide open.
          o.parryAt = -9;
          o.meter = Math.min(100, o.meter + 20);
          o.stats.parries++;
          setState(o, o.held.d ? 'crouch' : 'stand');
          o.move = null;
          f.move = null;
          f.airAtk = false;
          if (airborne(f)) { setState(f, 'knock'); f.vy = -300; f.vx = -f.face * 120; }
          else { setState(f, 'parried'); f.pushV = -f.face * 160; }
          hitStop = 0.16;
          flash = 0.22;
          shake = 6;
          ring(cx, cy, '#FFFFFF', 18, 0.4);
          ring(cx, cy, C.gold, 34, 0.55);
          burst(cx, cy, '#FFFFFF', 18, 380);
          popup('Parry!', C.gold, o.x, o.y - 190);
          api.sfx('power');
          hint('parry', nameOf(o.i) + ' parried! The attacker is stunned for 0.6 s. Punish with light, light, heavy.');
          return;
        }
        if (canGuard && o.held.blk) {
          setState(o, 'blockstun');
          o.stun = m.blockstun;
          o.vx = 0;
          o.pushV = f.face * m.push * 1.3 * 9;
          const chip = f.moveName === 'special' ? 3 : m.knock ? 1 : 0;
          if (chip) o.hp = Math.max(1, o.hp - chip);
          f.meter = Math.min(100, f.meter + 3);
          o.meter = Math.min(100, o.meter + 4);
          hitStop = 0.04;
          ring(cx, cy, C.mint, 14, 0.2);
          burst(cx, cy, C.mint, 6, 200);
          api.sfx('tick');
          if (!hints.parry) hint('blocked', 'Blocked. Tap block a split second before the hit instead to parry it.');
          return;
        }
        // Clean hit.
        const scale = Math.max(0.45, 1 - 0.14 * o.taken);
        const dmg = Math.max(1, Math.round(m.dmg * scale));
        o.hp = Math.max(0, o.hp - dmg);
        o.lagT = 0.5;
        o.taken++;
        f.stats.hits++;
        f.meter = Math.min(100, f.meter + m.meter);
        o.meter = Math.min(100, o.meter + 6);
        if (m.knock || o.hp <= 0 || airborne(o)) {
          setState(o, 'knock');
          o.vy = o.hp <= 0 ? -760 : -620;
          o.vx = f.face * (o.hp <= 0 ? 320 : 240);
          o.y = Math.min(o.y, FLOOR - 1);
          o.move = null;
          o.airAtk = false;
          shake = o.hp <= 0 ? 14 : 8;
          api.sfx(o.hp <= 0 || f.moveName === 'special' ? 'boom' : 'hit');
        } else {
          setState(o, 'hitstun');
          o.stun = m.hitstun;
          o.move = null;
          o.pushV = f.face * m.push * 9;
          shake = Math.max(shake, 3);
          api.sfx('hit');
        }
        hitStop = o.hp <= 0 ? 0.25 : m.stop;
        burst(cx, cy, '#FFFFFF', 10, 300);
        burst(cx, cy, f.color, 8, 220);
        ring(cx, cy, f.color, 12 + m.dmg, 0.25);
        if (o.taken >= 2) popup(o.taken + ' hits', f.color, f.x, f.y - 180);
        if (o.hp <= 0) koRound(f, o);
      }

      function pushApart() {
        const a = fighters[0];
        const b = fighters[1];
        if (invuln(a) && a.state !== 'getup') return;
        if (invuln(b) && b.state !== 'getup') return;
        const vOverlap = a.y > b.y - 110 && b.y > a.y - 110;
        if (!vOverlap) return;
        const dx = b.x - a.x;
        const ov = 2 * PUSH_W - Math.abs(dx);
        if (ov <= 0) return;
        const dir = dx === 0 ? (a.face === 1 ? 1 : -1) : Math.sign(dx);
        a.x -= (dir * ov) / 2;
        b.x += (dir * ov) / 2;
        if (a.x < LEFT) { b.x += LEFT - a.x; a.x = LEFT; }
        if (b.x < LEFT) { a.x += LEFT - b.x; b.x = LEFT; }
        if (a.x > RIGHT) { b.x -= a.x - RIGHT; a.x = RIGHT; }
        if (b.x > RIGHT) { a.x -= b.x - RIGHT; b.x = RIGHT; }
      }

      /* ---------- Input ---------- */
      function readHeld(f) {
        if (f.cpu) return;
        const k = api.keys;
        const ks = KEYS[vsCpu ? 0 : f.i];
        const alt = vsCpu ? KEYS[1] : null;
        const has = (name) => k.has(ks[name]) || (alt !== null && k.has(alt[name]));
        f.held.l = has('left');
        f.held.r = has('right');
        f.held.u = has('up');
        f.held.d = has('down');
        f.held.blk = has('block');
      }

      function pressBlock(f) {
        if (simT - f.lastBlock > PARRY_REARM) f.parryAt = simT;
        f.lastBlock = simT;
      }

      function tapDir(f, dir) {
        const last = dir < 0 ? f.tapL : f.tapR;
        if (simT - last <= TAP_GAP) { f.dashDir = dir; f.dashAt = simT; }
        if (dir < 0) f.tapL = simT; else f.tapR = simT;
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || (state !== 'fight' && state !== 'count')) return;
        for (let s = 0; s < 2; s++) {
          const ks = KEYS[s];
          const f = vsCpu ? fighters[0] : fighters[s];
          if (f.cpu) continue;
          const c = e.code;
          if (c === ks.left) tapDir(f, -1);
          else if (c === ks.right) tapDir(f, 1);
          else if (c === ks.up) f.press.jump = simT;
          else if (c === ks.light) f.press.light = simT;
          else if (c === ks.heavy) f.press.heavy = simT;
          else if (c === ks.special) f.press.special = simT;
          else if (c === ks.block) pressBlock(f);
        }
      });

      /* ---------- Computer opponent ---------- */
      function phaseOf(f) {
        if (f.state !== 'attack' || !f.move) return '';
        const m = f.move;
        return f.st < m.startup ? 'startup' : f.st < m.startup + m.active ? 'active' : 'recovery';
      }

      function aiStep(f, o, dt) {
        const cfg = AI_CFG[diff];
        const ai = f.ai;
        const h = f.held;
        const dx = o.x - f.x;
        const dist = Math.abs(dx);
        const toward = dx >= 0 ? 1 : -1;
        ai.t -= dt;
        ai.heat *= Math.exp(-dt / 3);
        ai.blockT -= dt;
        ai.crouchT -= dt;
        // React to an incoming attack.
        const oph = phaseOf(o);
        if (oph !== 'startup' && !(o.state === 'jump' && o.airAtk)) ai.reacted = false;
        if (!ai.reacted && (oph === 'startup' || (o.state === 'jump' && o.airAtk && o.airT < 0.05)) && o.move) {
          ai.reacted = true;
          if (dist < 150) ai.heat += 1;  // remember how pushy the rival is up close
          const m = o.move;
          const reach = m.x1 + PUSH_W + 30 + (m.lunge ? 170 : 0);
          const remaining = m.startup - (o.state === 'jump' ? o.airT : o.st);
          if (dist < reach || o.state === 'jump') {
            const r = Math.random();
            const canReact = remaining + 0.02 >= cfg.react;
            if (!canReact) {
              // Too quick to see coming: only a guard that was already up helps.
            } else if (r < cfg.parry && NEUTRAL[f.state]) {
              // Time the block tap to land inside the parry window.
              ai.parryPress = simT + Math.max(0, remaining - 0.05 - Math.random() * 0.04);
            } else if (r < cfg.parry + cfg.block) {
              ai.blockT = cfg.react + m.active + remaining + 0.12;
            } else if (o.moveName === 'light' && Math.random() < cfg.duck) {
              ai.crouchT = 0.35;
            }
          }
        }
        if (ai.parryPress > 0 && simT >= ai.parryPress) {
          ai.parryPress = -1;
          pressBlock(f);
          ai.blockT = Math.max(ai.blockT, 0.2);
        }
        h.blk = ai.blockT > 0;
        h.d = ai.crouchT > 0;
        // Combo follow-ups after a hit.
        if (f.state === 'attack' && f.connected && ai.comboGo && f.st >= f.move.startup) {
          if ((f.moveName === 'light' || f.moveName === 'clight') && f.chain < 2) f.press.light = simT;
          else if (f.moveName === 'light' || f.moveName === 'clight') f.press.heavy = simT;
          else if (f.moveName === 'heavy' && f.meter >= SPECIAL_COST && Math.random() < cfg.special * 0.5) f.press.special = simT;
        }
        if (ai.t > 0) return;
        ai.t = cfg.think * (0.75 + Math.random() * 0.5);
        if (!NEUTRAL[f.state] && f.state !== 'dash') return;
        h.l = false;
        h.r = false;
        h.u = false;
        const r = Math.random();
        const oRec = oph === 'recovery' && !o.connected;
        const open = o.state === 'parried' || oRec || (o.state === 'getup' && o.st > 0.15) || o.state === 'land';
        if (open && Math.random() < cfg.punish) {
          // Punish: get in and hit hard.
          h.blk = false;
          ai.blockT = 0;
          if (dist > 112) {
            if (Math.random() < cfg.dash + 0.3 && dist > 150) { f.dashDir = toward; f.dashAt = simT; } else if (toward > 0) h.r = true; else h.l = true;
            if (f.meter >= SPECIAL_COST && dist < 260 && Math.random() < cfg.special) f.press.special = simT;
          } else if (o.state === 'parried' || dist < 90) {
            f.press.light = simT;
            ai.comboGo = true;
          } else f.press.heavy = simT;
          return;
        }
        if (o.state === 'jump' && dist < 190 && o.vy > -200 && Math.random() < cfg.aa) {
          f.press.heavy = simT;
          return;
        }
        if (ai.blockT > 0) return;
        if (o.state === 'down' || o.state === 'knock') {
          // Wait at a safe distance while they get up.
          if (dist < 140) { if (toward > 0) h.l = true; else h.r = true; }
          return;
        }
        if (dist > 220) {
          if (Math.random() < cfg.dash) { f.dashDir = toward; f.dashAt = simT; } else if (r < 0.08) f.press.jump = simT;
          if (toward > 0) h.r = true; else h.l = true;
          return;
        }
        if (f.meter >= SPECIAL_COST && dist < 230 && Math.random() < cfg.special * 0.25) {
          f.press.special = simT;
          return;
        }
        if (dist > 125) {
          // Footsies: drift in and out, sometimes stick out a heavy at its tip range.
          if (r < cfg.aggro) {
            if (toward > 0) h.r = true; else h.l = true;
          } else if (r < cfg.aggro + 0.2) {
            if (toward > 0) h.l = true; else h.r = true;
          } else if (r < cfg.aggro + 0.27 && dist < 150) {
            f.press.heavy = simT;
          } else if (r < cfg.aggro + 0.32) {
            f.press.jump = simT;
            if (toward > 0) h.r = true; else h.l = true;
          }
          return;
        }
        // Close range: the more the rival has been attacking here, the more we guard or duck their jabs.
        const wary = Math.min(0.4, ai.heat * 0.08) * cfg.adapt;
        if (Math.random() < wary) {
          if (Math.random() < cfg.duck + 0.2) { ai.crouchT = 0.3; if (Math.random() < 0.5) f.press.light = simT; } else ai.blockT = 0.35;
          return;
        }
        if (r < cfg.preblock) ai.blockT = 0.3;
        else if (r < cfg.preblock + cfg.aggro * 0.6) { f.press.light = simT; }
        else if (r < cfg.preblock + cfg.aggro * 0.6 + 0.12) { h.d = true; ai.crouchT = 0.2; f.press.light = simT; }
        else if (r < cfg.preblock + cfg.aggro * 0.6 + 0.22) f.press.heavy = simT;
        else if (r < cfg.preblock + cfg.aggro * 0.6 + 0.28) { ai.crouchT = 0.25; f.press.heavy = simT; }
        else if (toward > 0) h.l = true;
        else h.r = true;
      }

      /* ---------- Rounds ---------- */
      function resetFighters() {
        for (let i = 0; i < 2; i++) {
          const f = fighters[i];
          f.x = i === 0 ? 330 : 630;
          f.y = FLOOR;
          f.vx = 0;
          f.vy = 0;
          f.pushV = 0;
          f.face = i === 0 ? 1 : -1;
          f.hp = MAX_HP;
          f.hpLag = MAX_HP;
          f.taken = 0;
          f.move = null;
          f.airAtk = false;
          f.cpu = vsCpu && i === 1;
          f.held.l = f.held.r = f.held.u = f.held.d = f.held.blk = false;
          f.press.light = f.press.heavy = f.press.special = f.press.jump = -9;
          f.parryAt = -9;
          f.dashAt = -9;
          f.ai.parryPress = -1;
          f.ai.blockT = 0;
          f.ai.crouchT = 0;
          setState(f, 'stand');
          f.pose.set(P.stand);
        }
      }

      function startRound() {
        resetFighters();
        clock = ROUND_TIME;
        state = 'count';
        countT = 3;
        hitStop = 0;
        slowMo = 0;
        api.sfx('tick');
        api.setScore(fighters[0].wins + ' – ' + fighters[1].wins);
      }

      function startMatch(cpu, d) {
        vsCpu = cpu;
        if (d) diff = d;
        fighters[0].wins = 0;
        fighters[1].wins = 0;
        for (let i = 0; i < 2; i++) {
          fighters[i].meter = 0;
          fighters[i].stats.parries = 0;
          fighters[i].stats.hits = 0;
        }
        round = 1;
        hints = {};
        startRound();
        api.setStatus(vsCpu
          ? 'Tap Space just before a hit lands to parry. F light, G heavy, R special, W jump, S crouch.'
          : 'Tap block (Space / Enter) just before a hit lands to parry and leave your rival stunned.');
      }

      function showStartMenu() {
        state = 'menu';
        resetFighters();
        api.menu({
          title: 'Dojo Duel',
          text: 'Best of 3 rounds. Tap block at the last instant to parry and stun your rival.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch(false) },
            { label: 'vs computer', onClick: showDiffMenu }
          ]
        });
      }

      function showDiffMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'Hard reads your attacks and parries them.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch(true, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch(true, 'normal') },
            { label: 'Hard', onClick: () => startMatch(true, 'hard') },
            { label: 'Back', onClick: showStartMenu }
          ]
        });
      }

      function releaseAll() {
        for (let i = 0; i < 2; i++) {
          const h = fighters[i].held;
          h.l = h.r = h.u = h.d = h.blk = false;
        }
      }

      function koRound(f, o) {
        if (state !== 'fight') return;
        releaseAll();
        state = 'ko';
        stateT = 0;
        slowMo = 1.2;
        f.wins++;
        say('KO', C.gold, 1.6);
        api.setStatus(nameOf(f.i) + (vsCpu && f.i === 0 ? ' win' : ' wins') + ' round ' + round + '. ' + nameOf(0) + ' ' + fighters[0].wins + ' – ' + fighters[1].wins + ' ' + nameOf(1) + '.');
        api.setScore(fighters[0].wins + ' – ' + fighters[1].wins);
        void o;
      }

      function timeUp() {
        const a = fighters[0];
        const b = fighters[1];
        releaseAll();
        state = 'ko';
        stateT = 0;
        if (a.hp === b.hp) {
          say('Time · draw', C.gold, 1.6);
          api.setStatus('Time! Equal health, so nobody takes round ' + round + '.');
        } else {
          const w = a.hp > b.hp ? a : b;
          w.wins++;
          say('Time', C.gold, 1.6);
          api.setStatus('Time! ' + nameOf(w.i) + ' had more health and ' + (vsCpu && w.i === 0 ? 'win' : 'wins') + ' round ' + round + '.');
        }
        api.sfx('lose');
        api.setScore(a.wins + ' – ' + b.wins);
      }

      function afterRound() {
        const a = fighters[0];
        const b = fighters[1];
        round++;
        if (a.wins >= 2 || b.wins >= 2 || round > 5) {
          state = 'over';
          const winner = a.wins > b.wins ? 0 : b.wins > a.wins ? 1 : -1;
          let title = 'Draw';
          if (winner >= 0) title = vsCpu ? (winner === 0 ? 'You win!' : 'The computer wins') : 'P' + (winner + 1) + ' wins!';
          api.sfx(vsCpu && winner === 1 ? 'lose' : 'win');
          if (winner >= 0) setState(fighters[winner], 'win');
          api.menu({
            title,
            text: 'Rounds ' + a.wins + ' – ' + b.wins + '. Parries: ' + nameOf(0) + ' ' + a.stats.parries + ', ' +
              nameOf(1) + ' ' + b.stats.parries + '.',
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startMatch(vsCpu) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        } else {
          startRound();
        }
      }

      /* ---------- Update ---------- */
      function simStep(dt) {
        simT += dt;
        const a = fighters[0];
        const b = fighters[1];
        if (state === 'fight') {
          if (a.cpu) aiStep(a, b, dt);
          if (b.cpu) aiStep(b, a, dt);
        }
        stepFighter(a, b, dt);
        stepFighter(b, a, dt);
        pushApart();
        if (state === 'fight') {
          checkHit(a, b);
          if (state === 'fight') checkHit(b, a);
        }
        // Reset combo counters once the victim recovers.
        for (let i = 0; i < 2; i++) {
          const f = fighters[i];
          if (f.state !== 'hitstun' && f.state !== 'knock' && f.state !== 'down') f.taken = 0;
        }
      }

      function targetPose(f, out) {
        const tgt = (arr) => { for (let k = 0; k < 10; k++) out[k] = arr[k]; };
        switch (f.state) {
          case 'stand': {
            if (f.held.blk) { tgt(P.block); break; }
            tgt(P.stand);
            const moving = Math.abs(f.vx) > 1;
            const sw = moving ? Math.sin(f.walkPh) * 0.55 : 0;
            out[5] += sw;
            out[7] -= sw;
            out[6] -= moving ? Math.max(0, Math.cos(f.walkPh)) * 0.6 : 0;
            out[8] -= moving ? Math.max(0, -Math.cos(f.walkPh)) * 0.6 : 0;
            out[1] += Math.sin(time * 3 + f.i) * 0.05;
            break;
          }
          case 'crouch': tgt(f.held.blk ? P.cblock : P.crouch); break;
          case 'blockstun': tgt(f.held.d ? P.cblock : P.block); out[0] -= 0.12; break;
          case 'dash': tgt(P.stand); out[0] = f.vx * f.face > 0 ? 0.4 : -0.3; out[5] = 0.9; out[6] = -0.9; out[7] = -0.7; break;
          case 'jump':
            tgt(f.airAtk && f.airT >= MOVES.air.startup ? P.airA : P.jump);
            break;
          case 'land': tgt(P.crouch); break;
          case 'attack': {
            const m = f.move;
            const ph = phaseOf(f);
            const n = f.moveName;
            if (n === 'light') tgt(ph === 'startup' ? P.lightS : ph === 'active' ? P.lightA : P.lightA);
            else if (n === 'clight') tgt(ph === 'startup' ? P.crouch : P.clightA);
            else if (n === 'heavy') tgt(ph === 'startup' ? P.heavyS : P.heavyA);
            else if (n === 'sweep') tgt(ph === 'startup' ? P.crouch : P.sweepA);
            else tgt(ph === 'startup' ? P.specialS : P.specialA);
            if (ph === 'recovery') {
              // Ease back toward guard during recovery.
              const k = (f.st - m.startup - m.active) / m.recovery;
              const base = m.crouch ? P.crouch : P.stand;
              for (let j = 0; j < 10; j++) out[j] += (base[j] - out[j]) * k * 0.7;
            }
            break;
          }
          case 'hitstun': tgt(P.hit); break;
          case 'parried':
            tgt(P.dazed);
            out[0] += Math.sin(f.st * 18) * 0.12;
            break;
          case 'knock':
            tgt(P.hit);
            out[9] = -Math.min(1.5, f.st * 3.2);
            break;
          case 'down':
          case 'ko': tgt(P.down); break;
          case 'getup': tgt(P.getup); break;
          case 'win': tgt(P.win); out[1] += Math.sin(time * 6) * 0.15; break;
          default: tgt(P.stand);
        }
      }

      function animate(f, dt) {
        if (Math.abs(f.vx) > 1 && f.state === 'stand') f.walkPh += dt * Math.abs(f.vx) * 0.045;
        targetPose(f, f.target);
        const snap = f.state === 'attack' || f.state === 'hitstun' || f.state === 'parried';
        const k = Math.min(1, dt * (snap ? 34 : 16));
        for (let j = 0; j < 10; j++) f.pose[j] += (f.target[j] - f.pose[j]) * k;
        if (f.lagT > 0) f.lagT -= dt;
        else f.hpLag += (f.hp - f.hpLag) * Math.min(1, dt * 4);
        if (f.hpLag < f.hp) f.hpLag = f.hp;
      }

      function update(dt) {
        time += dt;
        shake = Math.max(0, shake - dt * 40);
        flash = Math.max(0, flash - dt);
        bannerT -= dt;
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          p.life -= dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 600 * dt;
        }
        for (let i = 0; i < rings.length; i++) rings[i].t -= dt;
        for (let i = 0; i < pops.length; i++) pops[i].t -= dt;
        if (state === 'menu' || state === 'over') {
          for (let i = 0; i < 2; i++) animate(fighters[i], dt);
          return;
        }
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          for (let i = 0; i < 2; i++) { readHeld(fighters[i]); animate(fighters[i], dt); }
          if (countT <= 0) {
            state = 'fight';
            say('Fight!', C.mint, 0.7);
            api.sfx('power');
            if (round === 1) hint('start', 'Tap block just before a hit lands to parry. Hold it to simply guard.');
          } else if (Math.ceil(countT) !== prev) api.sfx('tick');
          return;
        }
        if (state === 'fight') {
          clock -= dt;
          if (clock <= 0) { clock = 0; timeUp(); }
          for (let i = 0; i < 2; i++) {
            const f = fighters[i];
            readHeld(f);
            if (f.meter >= SPECIAL_COST && !f.cpu) {
              hint('meter', nameOf(f.i) + ' has meter for a special: ' + (vsCpu || f.i === 0 ? 'R' : 'Right Shift') + ' lunges in for heavy damage.');
            }
          }
        }
        if (state === 'ko' || state === 'roundEnd') {
          stateT += dt;
          if (state === 'ko' && stateT > 1.6) {
            state = 'roundEnd';
            stateT = 0;
            for (let i = 0; i < 2; i++) {
              const f = fighters[i];
              if (f.hp > 0 && NEUTRAL[f.state]) setState(f, 'win');
            }
          } else if (state === 'roundEnd' && stateT > 1.4) {
            afterRound();
            return;
          }
        }
        let sdt = dt;
        if (slowMo > 0) {
          slowMo -= dt;
          sdt = dt * 0.35;
        }
        if (hitStop > 0) {
          hitStop -= dt;
        } else {
          acc += sdt;
          let n = 0;
          while (acc >= STEP && n < 4) {
            acc -= STEP;
            n++;
            simStep(STEP);
            if (hitStop > 0) { acc = 0; break; }
          }
        }
        for (let i = 0; i < 2; i++) animate(fighters[i], dt);
      }

      /* ---------- Drawing ---------- */
      function drawBar(x, y, w, h, frac, lag, color, rightAnchor) {
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 6);
        ctx.fill();
        const lw = w * Math.max(0, lag);
        const fw = w * Math.max(0, frac);
        ctx.fillStyle = U.alpha('#FFFFFF', 0.7);
        ctx.fillRect(rightAnchor ? x + w - lw : x, y, lw, h);
        ctx.fillStyle = frac < 0.25 && Math.sin(time * 10) > 0 ? '#FFFFFF' : color;
        ctx.fillRect(rightAnchor ? x + w - fw : x, y, fw, h);
      }

      function drawHud() {
        const a = fighters[0];
        const b = fighters[1];
        drawBar(30, 22, 370, 18, a.hp / MAX_HP, a.hpLag / MAX_HP, C.p1, false);
        drawBar(560, 22, 370, 18, b.hp / MAX_HP, b.hpLag / MAX_HP, C.p2, true);
        ctx.font = HUD;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'left';
        ctx.fillStyle = C.p1;
        ctx.fillText(nameOf(0), 30, 48);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.p2;
        ctx.fillText(nameOf(1) + (vsCpu ? ' · ' + diff : ''), 930, 48);
        for (let k = 0; k < 2; k++) {
          for (let i = 0; i < 2; i++) {
            const f = fighters[i];
            const px = i === 0 ? 392 - k * 18 : 568 + k * 18;
            ctx.beginPath();
            ctx.arc(px, 56, 6, 0, TAU);
            ctx.fillStyle = f.wins > k ? f.color : C.panel2;
            ctx.fill();
          }
        }
        // Timer.
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, W / 2 - 34, 12, 68, 46, 10);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = '800 24px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = clock < 10 && state === 'fight' ? C.p1 : C.text;
        ctx.fillText(String(Math.ceil(clock)), W / 2, 36);
        // Meters.
        for (let i = 0; i < 2; i++) {
          const f = fighters[i];
          const x = i === 0 ? 30 : W - 30 - 200;
          const y = H - 26;
          ctx.fillStyle = C.panel2;
          U.roundRect(ctx, x - 2, y - 2, 204, 12, 5);
          ctx.fill();
          const full = f.meter >= SPECIAL_COST;
          const fw = (200 * f.meter) / 100;
          ctx.fillStyle = full ? (Math.sin(time * 8) > 0 ? C.gold : '#FFE08A') : U.alpha(C.gold, 0.6);
          ctx.fillRect(i === 0 ? x : x + 200 - fw, y, fw, 8);
          ctx.fillStyle = C.ink;
          ctx.fillRect(x + 99, y - 2, 2, 12);
          ctx.font = SMALL;
          ctx.textBaseline = 'bottom';
          ctx.textAlign = i === 0 ? 'left' : 'right';
          ctx.fillStyle = full ? C.gold : C.muted;
          ctx.fillText(full ? 'SPECIAL READY' : 'METER', i === 0 ? x : x + 200, y - 4);
        }
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        drawDojo(ctx, W, H, FLOOR, time);
        // Shadows.
        for (let i = 0; i < 2; i++) {
          const f = fighters[i];
          const hgt = Math.max(0, FLOOR - f.y);
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.beginPath();
          ctx.ellipse(f.x, FLOOR + 4, Math.max(14, 40 - hgt * 0.1), 7, 0, 0, TAU);
          ctx.fill();
        }
        // Fighters: the attacker draws on top.
        const first = fighters[0].state === 'attack' ? 1 : 0;
        for (let n = 0; n < 2; n++) {
          const f = fighters[n === 0 ? first : 1 - first];
          if (f.state === 'attack' && f.moveName === 'special' && phaseOf(f) === 'active') {
            for (let g = 3; g >= 1; g--) drawFighter(ctx, f.x - f.face * g * 26, f.y, f.face, f.pose, f.color, f.dark, f.band, 0.12 * (4 - g));
          }
          let col = f.color;
          if (f.state === 'parried' && Math.sin(time * 30) > 0) col = '#FFFFFF';
          if (f.state === 'hitstun' && f.st < 0.06) col = '#FFFFFF';
          drawFighter(ctx, f.x, f.y, f.face, f.pose, col, f.dark, f.band);
          if (f.state === 'parried') {
            ctx.fillStyle = C.gold;
            for (let k = 0; k < 3; k++) {
              const ang = time * 6 + (k * TAU) / 3;
              ctx.beginPath();
              ctx.arc(f.x + Math.cos(ang) * 22, f.y - 178 + Math.sin(ang) * 6, 4, 0, TAU);
              ctx.fill();
            }
          }
          if ((f.state === 'blockstun' || (NEUTRAL[f.state] && f.held.blk)) && state !== 'menu') {
            const top = f.held.d ? f.y - 100 : f.y - 150;
            ctx.strokeStyle = U.alpha(C.mint, f.state === 'blockstun' ? 0.8 : 0.35);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(f.x + f.face * 6, (top + f.y) / 2, (f.y - top) / 2 + 6, -Math.PI / 2.6, Math.PI / 2.6);
            if (f.face < 0) {
              ctx.beginPath();
              ctx.arc(f.x + f.face * 6, (top + f.y) / 2, (f.y - top) / 2 + 6, Math.PI - Math.PI / 2.6, Math.PI + Math.PI / 2.6);
            }
            ctx.stroke();
          }
          // Parry window glint right after a tap.
          if (simT - f.parryAt <= PARRY_WIN && state === 'fight') {
            ctx.strokeStyle = U.alpha('#FFFFFF', 0.8);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(f.x, f.y - 90, 70, 0, TAU);
            ctx.stroke();
          }
        }
        // Rings and particles.
        for (let i = 0; i < rings.length; i++) {
          const r = rings[i];
          if (r.t <= 0) continue;
          const k = 1 - r.t / r.max;
          ctx.strokeStyle = U.alpha(r.color === '#FFFFFF' ? '#FFFFFF' : r.color, 1 - k);
          ctx.lineWidth = 4 * (1 - k) + 1;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.r * (0.4 + k * 1.6), 0, TAU);
          ctx.stroke();
        }
        for (let i = 0; i < PMAX; i++) {
          const p = parts[i];
          if (p.life <= 0) continue;
          ctx.globalAlpha = Math.min(1, (p.life / p.max) * 1.4);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < pops.length; i++) {
          const pp = pops[i];
          if (pp.t <= 0) continue;
          ctx.globalAlpha = Math.min(1, pp.t * 2.5);
          ctx.font = '800 22px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = pp.color;
          ctx.fillText(pp.text, U.clamp(pp.x, 80, W - 80), pp.y - (0.9 - pp.t) * 40);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (flash > 0) {
          ctx.fillStyle = U.alpha('#FFFFFF', flash * 1.2);
          ctx.fillRect(0, 0, W, H);
        }
        drawHud();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (state === 'count') {
          ctx.font = BIG;
          ctx.fillStyle = C.text;
          ctx.fillText(String(Math.max(1, Math.ceil(countT))), W / 2, H / 2 - 60);
          ctx.font = HUD;
          ctx.fillStyle = C.muted;
          ctx.fillText('Round ' + round, W / 2, H / 2 - 16);
        }
        if (bannerT > 0) {
          ctx.globalAlpha = Math.min(1, bannerT * 3);
          ctx.font = BIG;
          ctx.fillStyle = 'rgba(15,13,36,0.6)';
          ctx.fillText(banner, W / 2 + 3, H / 2 - 57);
          ctx.fillStyle = bannerColor;
          ctx.fillText(banner, W / 2, H / 2 - 60);
          ctx.globalAlpha = 1;
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
