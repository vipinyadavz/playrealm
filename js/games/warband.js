/* Warband: ride a mounted lord, hire an army, and fight four rival lords for gold and land.
   Hook: your army follows your banner in formation; switch between wedge, ring and line on the fly. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const WW = 2200;
  const WH = 1500;
  const TAU = Math.PI * 2;
  const MATCH_T = 480;
  const MAX_ARMY = 40;
  const MAX_UNITS = 300;
  const MAX_ARROWS = 320;
  const MAX_PARTS = 420;
  const GCELL = 64;
  const GCOLS = Math.ceil(WW / GCELL);
  const GROWS = Math.ceil(WH / GCELL);
  const S = 22;
  const LEASH = 280;
  const LORD_R = 13;
  const LORD_SPEED = 150;
  const LORD_HP = 240;
  const WEDGE = 0;
  const RING = 1;
  const LINE = 2;
  const FORM_NAMES = ['Wedge', 'Ring', 'Line'];
  const FORM_TIPS = ['+60% melee damage while you gallop', 'Units take 40% less damage, you 25% less',
    'Archers fire volleys: +30% range, +25% damage'];
  const FORM_COLS = [C.gold, C.mint, C.p2];
  const TYPES = [
    { name: 'Soldier', cost: 10, hp: 45, dmg: 7, cd: 0.8, speed: 105, r: 7, reach: 7, aggro: 120, loot: 3 },
    { name: 'Archer', cost: 15, hp: 28, dmg: 6, cd: 1.5, speed: 100, r: 6, reach: 0, aggro: 230, loot: 4, range: 230 },
    { name: 'Knight', cost: 30, hp: 90, dmg: 11, cd: 1.0, speed: 140, r: 9, reach: 8, aggro: 160, loot: 9 }
  ];
  const POWER = [1, 1.1, 2.6];
  const SPAWNS = [{ x: 260, y: 250 }, { x: 1940, y: 250 }, { x: 260, y: 1250 }, { x: 1940, y: 1250 }, { x: 1100, y: 1360 }];
  const MINES = [{ x: 1100, y: 720, rate: 3 }, { x: 640, y: 470, rate: 2 }, { x: 1560, y: 470, rate: 2 },
    { x: 640, y: 1030, rate: 2 }, { x: 1560, y: 1030, rate: 2 }];
  const MINE_R = 52;
  const VOLLEY_T = 1.6;
  const LORD_NAMES = ['Baron Biscuit', 'Lady Thimble', 'Duke Puddle', 'Count Nibbles', 'Sir Wobble', 'Dame Crumpet',
    'Earl Grumble', 'Marquis Muffin', 'Lady Pockets', 'Captain Crumb'];
  const LORD_COLS = [C.gold, C.p2, C.mint, '#FF9A3C', '#FF6FD8', '#5B8CFF'];
  const LEVELS = {
    easy: { think: 0.6, aggr: 0.75, fear: 1.5, cap: 24, recruitT: 1.6, smart: false },
    normal: { think: 0.4, aggr: 1, fear: 1.15, cap: 34, recruitT: 0.7, smart: true },
    hard: { think: 0.25, aggr: 1.15, fear: 1, cap: 40, recruitT: 0.25, smart: true }
  };
  const MONO = '"JetBrains Mono", monospace';

  function drawBanner(ctx, x, y, color, t, s) {
    ctx.strokeStyle = '#E6E1FF';
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 34 * s); ctx.stroke();
    const wave = Math.sin(t * 6) * 3 * s;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - 34 * s);
    ctx.quadraticCurveTo(x + 10 * s, y - 36 * s + wave, x + 20 * s, y - 32 * s);
    ctx.lineTo(x + 20 * s, y - 20 * s);
    ctx.quadraticCurveTo(x + 10 * s, y - 24 * s + wave, x, y - 22 * s);
    ctx.closePath();
    ctx.fill();
  }

  function drawLordBody(ctx, x, y, face, color, s, flash) {
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(x + 2 * s, y + 4 * s, 16 * s, 10 * s, face, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#FFFFFF' : '#5A4632';
    ctx.beginPath(); ctx.ellipse(x, y, 16 * s, 8 * s, face, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(face) * 15 * s, y + Math.sin(face) * 15 * s, 5 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = flash ? '#FFFFFF' : color;
    ctx.beginPath(); ctx.arc(x, y, 8 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2 * s;
    ctx.stroke();
  }

  function drawUnitShape(ctx, x, y, type, color, face, r) {
    ctx.fillStyle = color;
    if (type === 0) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    } else if (type === 1) {
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(face) * r * 1.3, y + Math.sin(face) * r * 1.3);
      ctx.lineTo(x + Math.cos(face + 2.4) * r, y + Math.sin(face + 2.4) * r);
      ctx.lineTo(x + Math.cos(face - 2.4) * r, y + Math.sin(face - 2.4) * r);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = face + k * Math.PI / 2;
        ctx.lineTo(x + Math.cos(a) * r * 1.2, y + Math.sin(a) * r * 1.2);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  Arcade.register({
    id: 'warband',
    title: 'Warband',
    category: 'io',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.violet,
    tagline: 'Gather gold, hire soldiers, archers and knights, and outlast four rival lords.',
    hook: 'Your army follows your banner in formation: switch between wedge, ring and line on the fly.',
    tags: ['io', 'strategy', 'army', 'battle', 'rts', 'formation', 'medieval', 'bots'],
    howTo: 'Ride your lord around the map to scoop up coins and stand in gold mines to capture them; mines pay out every second. ' +
      'Spend gold to hire soldiers (10), archers (15) and knights (30), up to 40. They march behind your banner and fight any enemy that comes close. ' +
      'The twist: press Q to switch formation. Wedge hits 60% harder while you gallop, ring shields your army and you, ' +
      'and line makes archers fire long-range volleys. Defeat a rival lord and their army scatters. ' +
      'If your lord falls, the game ends. Score is gold earned, plus 10 per kill and 500 per lord defeated.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Ride' },
      { keys: ['Mouse', 'Touch'], label: 'Hold to ride toward the pointer' },
      { keys: ['Q'], label: 'Switch formation' },
      { keys: ['1', '2', '3'], label: 'Hire soldier, archer, knight' }
    ],

    drawThumb(ctx, w, h, t) {
      const s = w / 320;
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = U.alpha(C.violet, 0.07);
      for (let i = 0; i < 30; i++) ctx.fillRect(((i * 97) % 320) * s, ((i * 61) % 200) * s, 4 * s, 2 * s);
      // Gold mine.
      ctx.fillStyle = U.alpha(C.gold, 0.18);
      ctx.beginPath(); ctx.arc(268 * s, 46 * s, 26 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = C.gold;
      ctx.beginPath(); ctx.arc(268 * s, 46 * s, 8 * s, 0, TAU); ctx.fill();
      // Violet wedge charging right.
      const lx = (120 + Math.sin(t * 1.5) * 6) * s;
      const ly = 112 * s;
      for (let r = 0; r < 5; r++) {
        for (let j = 0; j <= r; j++) {
          const fx = (3 - r * 0.85) * 14 * s;
          const sx = (j - r / 2) * 14 * s;
          if (fx * fx + sx * sx < (14 * s) * (14 * s)) continue;
          drawUnitShape(ctx, lx + fx, ly + sx, r < 2 ? 2 : r < 4 ? 0 : 1, C.violet, 0, 5 * s);
        }
      }
      drawLordBody(ctx, lx, ly, 0, C.violet, s * 0.9, false);
      drawBanner(ctx, lx - 4 * s, ly - 6 * s, C.violet, t, s);
      // Gold ring formation on the right.
      const rx = 240 * s;
      const ry = 128 * s;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * TAU + t * 0.3;
        drawUnitShape(ctx, rx + Math.cos(a) * 30 * s, ry + Math.sin(a) * 30 * s, i % 3 === 0 ? 1 : 0, C.gold, a, 5 * s);
      }
      ctx.strokeStyle = U.alpha(C.mint, 0.4);
      ctx.lineWidth = 2 * s;
      ctx.beginPath(); ctx.arc(rx, ry, 40 * s, 0, TAU); ctx.stroke();
      drawLordBody(ctx, rx, ry, Math.PI, C.gold, s * 0.9, false);
      // Arrows in flight.
      ctx.strokeStyle = U.alpha(C.text, 0.8);
      ctx.lineWidth = 1.5 * s;
      for (let i = 0; i < 4; i++) {
        const ax = (170 + ((t * 60 + i * 13) % 40)) * s;
        const ay = (96 + i * 10) * s;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + 9 * s, ay + 1 * s); ctx.stroke();
      }
      ctx.font = '800 ' + Math.round(13 * s) + 'px ' + MONO;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = C.violet;
      ctx.fillText('WEDGE · RING · LINE', 12 * s, 12 * s);
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | count | play | over
      let diff = 'normal';
      let L = LEVELS.normal;
      let lords = [];
      let me = null;
      const units = [];
      let uidN = 0;
      let rocks = [];
      let coins = [];
      let mines = [];
      let decor = [];
      let clock = 0;
      let timeLeft = MATCH_T;
      let countT = 0;
      let goT = 0;
      let shake = 0;
      let hurtFx = 0;
      let banner = null;
      let hinted = {};
      let hitSfxT = 0;
      let coinT = 0;
      let formFx = 0;
      const floats = [];
      const cam = { x: 0, y: 0 };
      const ptr = { x: 0, y: 0, down: false };

      const gHead = new Int32Array(GCOLS * GROWS);
      const gNext = new Int32Array(MAX_UNITS);

      const ax = new Float32Array(MAX_ARROWS);
      const ay = new Float32Array(MAX_ARROWS);
      const avx = new Float32Array(MAX_ARROWS);
      const avy = new Float32Array(MAX_ARROWS);
      const alife = new Float32Array(MAX_ARROWS);
      const admg = new Float32Array(MAX_ARROWS);
      const aown = new Int8Array(MAX_ARROWS);
      let an = 0;

      const px = new Float32Array(MAX_PARTS);
      const py = new Float32Array(MAX_PARTS);
      const pvx = new Float32Array(MAX_PARTS);
      const pvy = new Float32Array(MAX_PARTS);
      const pl = new Float32Array(MAX_PARTS);
      const pm = new Float32Array(MAX_PARTS);
      const ps = new Float32Array(MAX_PARTS);
      const pc = new Array(MAX_PARTS).fill('#fff');
      let pNext = 0;
      function part(x, y, vx, vy, life, size, color) {
        const i = pNext;
        pNext = (pNext + 1) % MAX_PARTS;
        px[i] = x; py[i] = y; pvx[i] = vx; pvy[i] = vy; pl[i] = life; pm[i] = life; ps[i] = size; pc[i] = color;
      }
      function burst(x, y, color, n, speed, life, size) {
        if (!onCam(x, y, 60)) return;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * TAU;
          const v = speed * (0.3 + Math.random() * 0.7);
          part(x, y, Math.cos(a) * v, Math.sin(a) * v, life * (0.6 + Math.random() * 0.4), size, color);
        }
      }
      const onCam = (x, y, m) => x > cam.x - m && x < cam.x + W + m && y > cam.y - m && y < cam.y + H + m;
      function say(x, y, text, color) {
        if (floats.length > 12) floats.shift();
        floats.push({ x, y, text, color, t: 0 });
      }
      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }
      const score = (l) => Math.floor(l.earned) + l.kills * 10 + l.lordKills * 500;

      /* ---------- World ---------- */
      function buildWorld() {
        rocks = [];
        for (let tries = 0; rocks.length < 18 && tries < 500; tries++) {
          const r = U.rand(22, 46);
          const x = U.rand(100, WW - 100);
          const y = U.rand(100, WH - 100);
          if (SPAWNS.some((s) => U.dist(s.x, s.y, x, y) < 220)) continue;
          if (MINES.some((m) => U.dist(m.x, m.y, x, y) < MINE_R + r + 60)) continue;
          if (rocks.some((o) => U.dist(o.x, o.y, x, y) < o.r + r + 70)) continue;
          rocks.push({ x, y, r });
        }
        mines = MINES.map((m) => ({ x: m.x, y: m.y, rate: m.rate, owner: -1, cap: 0, capBy: -1, payT: 1 }));
        coins = [];
        for (let i = 0; i < 30; i++) spawnCoin();
        decor = [];
        for (let i = 0; i < 380; i++) decor.push({ x: Math.random() * WW, y: Math.random() * WH, k: Math.random() < 0.7 });
      }

      function freeSpot(x, y, r) {
        if (x < r || y < r || x > WW - r || y > WH - r) return false;
        for (const o of rocks) if (U.dist(o.x, o.y, x, y) < o.r + r) return false;
        return true;
      }

      function spawnCoin(x, y, value) {
        if (coins.length >= 70) return;
        if (x === undefined) {
          for (let tries = 0; tries < 30; tries++) {
            const cx = U.rand(60, WW - 60);
            const cy = U.rand(60, WH - 60);
            if (freeSpot(cx, cy, 20)) { x = cx; y = cy; break; }
          }
          if (x === undefined) return;
          value = U.randInt(5, 14);
        }
        coins.push({ x, y, v: value, t: 0 });
      }

      /* ---------- Lords and units ---------- */
      function makeLord(id, name, color, human) {
        return {
          id, name, color, human, isLord: true, x: 0, y: 0, vx: 0, vy: 0, face: 0, speed: 0, r: LORD_R,
          hp: LORD_HP, maxHp: LORD_HP, alive: true, gold: 30, earned: 0, kills: 0, lordKills: 0, army: [],
          formation: WEDGE, slotT: 0, volleyT: VOLLEY_T, cd: 0, flash: 0, hurtT: -99, lastHit: -1,
          ai: { think: Math.random() * 0.4, mode: 'eco', gx: 0, gy: 0, target: null, recruitT: 0, mix: [0.5, 0.3, 0.2],
            stuckT: 0, sx: 0, sy: 0, detourA: 0, detourT: 0 }
        };
      }

      function spawnUnit(lord, type) {
        let u = null;
        for (let i = 0; i < units.length; i++) if (!units[i].alive && units[i].dieT <= 0) { u = units[i]; break; }
        if (!u) {
          if (units.length >= MAX_UNITS) return null;
          u = {};
          units.push(u);
        }
        const T = TYPES[type];
        let x = lord.x - Math.cos(lord.face) * 26 + U.rand(-14, 14);
        let y = lord.y - Math.sin(lord.face) * 26 + U.rand(-14, 14);
        if (!freeSpot(x, y, T.r)) { x = lord.x; y = lord.y; }
        Object.assign(u, {
          uid: uidN++, type, owner: lord.id, x, y, hp: T.hp, maxHp: T.hp, r: T.r, alive: true, dieT: 0, fade: 0,
          fx: -S, fs: 0, target: null, retT: Math.random() * 0.3, cd: Math.random() * 0.5, charge: 0, flash: 0,
          face: lord.face, isLord: false, mv: 0
        });
        lord.army.push(u);
        lord.slotT = 0;
        return u;
      }

      function recruit(lord, type) {
        const T = TYPES[type];
        if (!lord.alive || state !== 'play') return false;
        if (lord.army.length >= MAX_ARMY) {
          if (lord.human) { api.sfx('tick'); api.setStatus('Your army is full: 40 units is the limit.'); }
          return false;
        }
        if (lord.gold < T.cost) {
          if (lord.human) { api.sfx('tick'); say(lord.x, lord.y - 30, 'need ' + T.cost + 'g', C.muted); }
          return false;
        }
        lord.gold -= T.cost;
        const u = spawnUnit(lord, type);
        if (u && lord.human) {
          api.sfx('blip');
          burst(u.x, u.y, lord.color, 6, 60, 0.4, 2.5);
          if (lord.army.length >= 6) hint('form', 'Press Q to switch formation. Wedge charges, ring defends, line lets archers volley.');
        }
        return !!u;
      }

      function setFormation(lord, f) {
        if (lord.formation === f) return;
        lord.formation = f;
        lord.slotT = 0;
        lord.volleyT = Math.min(lord.volleyT, 1.2);
        if (lord.human) {
          formFx = 1.6;
          api.sfx('flip');
          banner = { text: FORM_NAMES[f], sub: FORM_TIPS[f], color: FORM_COLS[f], t: 0 };
          api.setStatus(FORM_NAMES[f] + ' formation: ' + FORM_TIPS[f].toLowerCase() + '.');
        }
      }

      const ORDERS = [[1, 2, 0], [2, 0, 1], [1, 2, 0]]; // per formation: sort key by unit type (soldier, archer, knight)
      /* Assign each unit a local slot (forward, side) relative to its lord's facing. */
      function layout(lord) {
        const army = lord.army;
        const ord = ORDERS[lord.formation];
        army.sort((a, b) => ord[a.type] - ord[b.type] || a.uid - b.uid);
        const n = army.length;
        if (lord.formation === WEDGE) {
          let r = 0;
          let j = 0;
          for (let i = 0; i < n; i++) {
            let fx;
            let sx;
            do {
              fx = 3 * S - r * S * 0.85;
              sx = (j - r / 2) * S;
              j++;
              if (j > r) { r++; j = 0; }
            } while (fx * fx + sx * sx < 26 * 26);
            army[i].fx = fx;
            army[i].fs = sx;
          }
        } else if (lord.formation === RING) {
          const caps = [8, 14, 20];
          const radii = [42, 68, 94];
          let i = 0;
          for (let k = 0; k < 3 && i < n; k++) {
            const cnt = Math.min(caps[k], n - i);
            for (let j = 0; j < cnt; j++, i++) {
              const a = (j / cnt) * TAU + k * 0.3;
              army[i].fx = Math.cos(a) * radii[k];
              army[i].fs = Math.sin(a) * radii[k];
            }
          }
        } else {
          let melee = 0;
          for (let i = 0; i < n; i++) if (army[i].type !== 1) melee++;
          const archers = n - melee;
          const row = (count, idx, perRow) => {
            const r = Math.floor(idx / perRow);
            const inRow = Math.min(perRow, count - r * perRow);
            return { r, j: idx % perRow, inRow };
          };
          let mi = 0;
          let ai = 0;
          for (let i = 0; i < n; i++) {
            const u = army[i];
            if (u.type !== 1) {
              const q = row(melee, mi++, 13);
              u.fx = 2.2 * S - q.r * S * 0.9;
              u.fs = (q.j - (q.inRow - 1) / 2) * S;
            } else {
              const q = row(archers, ai++, 13);
              u.fx = -1.6 * S - q.r * S * 0.9;
              u.fs = (q.j - (q.inRow - 1) / 2) * S;
            }
          }
        }
      }

      /* ---------- Combat ---------- */
      function hurt(t, amount, by) {
        if (!t.alive || (!t.isLord && t.owner < 0)) return;
        const lord = t.isLord ? t : lords[t.owner];
        let dmg = amount;
        if (lord && lord.formation === RING) dmg *= t.isLord ? 0.75 : 0.6;
        t.hp -= dmg;
        t.flash = 0.12;
        if (t.isLord) {
          t.hurtT = clock;
          if (by >= 0) t.lastHit = by;
          if (t.human) {
            hurtFx = 0.4;
            shake = Math.max(shake, 3);
            if (hitSfxT <= 0) { api.sfx('hit'); hitSfxT = 0.15; }
            if (t.hp < t.maxHp * 0.4) hint('lowhp', 'Your lord is badly hurt. Pull back and try ring formation: it soaks damage.');
          }
        } else if ((t.owner === 0 || by === 0) && hitSfxT <= 0 && onCam(t.x, t.y, 0)) {
          api.sfx('tick');
          hitSfxT = 0.09;
        }
        if (t.hp <= 0) {
          if (t.isLord) killLord(t, by);
          else killUnit(t, by);
        }
      }

      function killUnit(u, by) {
        u.alive = false;
        u.dieT = 0.4;
        u.target = null;
        const lord = lords[u.owner];
        if (lord) {
          const i = lord.army.indexOf(u);
          if (i >= 0) lord.army.splice(i, 1);
          lord.slotT = 0;
        }
        if (by >= 0 && lords[by]) lords[by].kills++;
        burst(u.x, u.y, lord ? lord.color : C.muted, 6, 90, 0.4, 2.5);
        if (Math.random() < 0.55) spawnCoin(u.x + U.rand(-6, 6), u.y + U.rand(-6, 6), TYPES[u.type].loot);
      }

      function killLord(l, by) {
        l.alive = false;
        l.hp = 0;
        const killer = by >= 0 && by !== l.id ? lords[by] : null;
        if (killer) killer.lordKills++;
        for (const u of l.army) {
          u.owner = -1;
          u.fade = U.rand(2.2, 3.4);
          u.target = null;
          u.scatter = Math.atan2(u.y - l.y, u.x - l.x) + U.rand(-0.6, 0.6);
        }
        l.army = [];
        for (const m of mines) if (m.owner === l.id) { m.owner = -1; m.cap = 0; }
        const pile = 40 + Math.floor(l.gold * 0.5);
        for (let k = 0; k < 4; k++) spawnCoin(l.x + U.rand(-30, 30), l.y + U.rand(-30, 30), Math.ceil(pile / 4));
        l.gold = 0;
        burst(l.x, l.y, l.color, 30, 220, 0.9, 4);
        burst(l.x, l.y, '#FFFFFF', 12, 160, 0.6, 3);
        shake = Math.max(shake, onCam(l.x, l.y, 0) ? 10 : 0);
        if (l === me) {
          api.sfx('boom');
          endGame('dead');
          return;
        }
        if (killer === me) {
          api.sfx('win');
          banner = { text: l.name + ' defeated!', sub: '+500 points. Their army scatters.', color: C.gold, t: 0 };
        } else if (onCam(l.x, l.y, 0)) {
          api.sfx('boom');
        }
        if (killer) say(killer.x, killer.y - 34, '+500', killer.color);
        if (me.alive && lords.every((o) => o === me || !o.alive)) endGame('last');
      }

      function fireArrow(u, t, dmg, rangeMul) {
        if (an >= MAX_ARROWS) return;
        const d = U.dist(u.x, u.y, t.x, t.y);
        const tt = d / 380;
        const tx = t.x + (t.vx || 0) * tt * 0.7;
        const ty = t.y + (t.vy || 0) * tt * 0.7;
        const a = Math.atan2(ty - u.y, tx - u.x) + U.rand(-0.06, 0.06);
        const i = an++;
        ax[i] = u.x; ay[i] = u.y; avx[i] = Math.cos(a) * 380; avy[i] = Math.sin(a) * 380;
        alife[i] = (TYPES[1].range * rangeMul + 30) / 380;
        admg[i] = dmg;
        aown[i] = u.owner;
        u.face = a;
      }

      /* ---------- Spatial grid of units ---------- */
      function buildGrid() {
        gHead.fill(-1);
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (!u.alive || u.owner < 0) continue;
          const c = U.clamp(Math.floor(u.x / GCELL), 0, GCOLS - 1);
          const r = U.clamp(Math.floor(u.y / GCELL), 0, GROWS - 1);
          const k = r * GCOLS + c;
          gNext[i] = gHead[k];
          gHead[k] = i;
        }
      }

      function findTarget(u, radius) {
        const lord = lords[u.owner];
        let best = null;
        let bd = radius * radius;
        const c0 = Math.max(0, Math.floor((u.x - radius) / GCELL));
        const c1 = Math.min(GCOLS - 1, Math.floor((u.x + radius) / GCELL));
        const r0 = Math.max(0, Math.floor((u.y - radius) / GCELL));
        const r1 = Math.min(GROWS - 1, Math.floor((u.y + radius) / GCELL));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            for (let i = gHead[r * GCOLS + c]; i >= 0; i = gNext[i]) {
              const o = units[i];
              if (o.owner === u.owner) continue;
              const dx = o.x - u.x;
              const dy = o.y - u.y;
              const d = dx * dx + dy * dy;
              if (d < bd && (!lord || U.dist(o.x, o.y, lord.x, lord.y) < LEASH + 40)) { bd = d; best = o; }
            }
          }
        }
        for (const l of lords) {
          if (!l.alive || l.id === u.owner) continue;
          const dx = l.x - u.x;
          const dy = l.y - u.y;
          const d = dx * dx + dy * dy;
          if (d < bd && (!lord || U.dist(l.x, l.y, lord.x, lord.y) < LEASH + 40)) { bd = d; best = l; }
        }
        return best;
      }

      function pushFromRocks(o) {
        for (const k of rocks) {
          const dx = o.x - k.x;
          const dy = o.y - k.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < k.r + o.r) {
            o.x = k.x + dx / d * (k.r + o.r);
            o.y = k.y + dy / d * (k.r + o.r);
          }
        }
        o.x = U.clamp(o.x, o.r, WW - o.r);
        o.y = U.clamp(o.y, o.r, WH - o.r);
      }

      function updateUnits(dt) {
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (!u.alive) {
            if (u.dieT > 0) u.dieT -= dt;
            continue;
          }
          u.flash = Math.max(0, u.flash - dt);
          if (u.owner < 0) {
            // Scattered: run off and fade.
            u.fade -= dt;
            u.x += Math.cos(u.scatter) * 70 * dt;
            u.y += Math.sin(u.scatter) * 70 * dt;
            pushFromRocks(u);
            if (u.fade <= 0) { u.alive = false; u.dieT = 0; }
            continue;
          }
          const lord = lords[u.owner];
          const T = TYPES[u.type];
          const ca = Math.cos(lord.face);
          const sa = Math.sin(lord.face);
          const slx = lord.x + ca * u.fx - sa * u.fs;
          const sly = lord.y + sa * u.fx + ca * u.fs;
          const volley = lord.formation === LINE;
          const rangeMul = volley ? 1.3 : 1;
          u.cd -= dt;
          u.retT -= dt;
          if (u.retT <= 0) {
            u.retT = 0.25 + Math.random() * 0.15;
            u.target = findTarget(u, u.type === 1 ? T.range * rangeMul : T.aggro);
          }
          let t = u.target;
          if (t && (!t.alive || (t.isLord ? t.id === u.owner : t.owner === u.owner || t.owner < 0) ||
            U.dist(t.x, t.y, lord.x, lord.y) > LEASH + 80)) { t = null; u.target = null; }
          let mx = slx;
          let my = sly;
          let spd = T.speed;
          let hold = false;
          if (t) {
            const d = U.dist(u.x, u.y, t.x, t.y);
            if (u.type === 1) {
              if (d <= T.range * rangeMul) {
                hold = true;
                u.face = Math.atan2(t.y - u.y, t.x - u.x);
                if (!volley && u.cd <= 0) {
                  u.cd = T.cd * U.rand(0.9, 1.1);
                  fireArrow(u, t, T.dmg, 1);
                }
              }
            } else {
              const reach = u.r + t.r + T.reach;
              mx = t.x;
              my = t.y;
              spd *= 1.1;
              if (d <= reach) {
                hold = true;
                u.face = Math.atan2(t.y - u.y, t.x - u.x);
                if (u.cd <= 0) {
                  u.cd = T.cd * U.rand(0.9, 1.1);
                  let dmg = T.dmg;
                  if (lord.formation === WEDGE && lord.speed > 110) dmg *= 1.6;
                  if (u.type === 2 && u.charge > 0.5) {
                    dmg *= 2;
                    const kx = (t.x - u.x) / (d || 1);
                    const ky = (t.y - u.y) / (d || 1);
                    if (!t.isLord) { t.x += kx * 14; t.y += ky * 14; }
                    burst(t.x, t.y, C.gold, 5, 100, 0.3, 2.5);
                  }
                  u.charge = 0;
                  hurt(t, dmg, u.owner);
                }
              }
            }
          }
          if (!hold) {
            const dx = mx - u.x;
            const dy = my - u.y;
            const d = Math.hypot(dx, dy);
            if (d > 2) {
              const catchUp = t ? 1 : 1 + Math.min(1, d / 160) * 0.7;
              const v = Math.min(spd * catchUp, d * 6);
              u.x += dx / d * v * dt;
              u.y += dy / d * v * dt;
              u.mv = v;
              if (v > 30) u.face = Math.atan2(dy, dx);
            } else {
              u.mv = 0;
              u.face += Math.atan2(Math.sin(lord.face - u.face), Math.cos(lord.face - u.face)) * Math.min(1, dt * 4);
            }
          } else {
            u.mv = 0;
          }
          u.charge = u.type === 2 && u.mv > 110 ? u.charge + dt : Math.max(0, u.charge - dt * 2);
        }
        // Separation between nearby units, then rocks.
        for (let i = 0; i < units.length; i++) {
          const u = units[i];
          if (!u.alive || u.owner < 0) continue;
          const c0 = Math.max(0, Math.floor(u.x / GCELL) - 1);
          const c1 = Math.min(GCOLS - 1, Math.floor(u.x / GCELL) + 1);
          const r0 = Math.max(0, Math.floor(u.y / GCELL) - 1);
          const r1 = Math.min(GROWS - 1, Math.floor(u.y / GCELL) + 1);
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              for (let j = gHead[r * GCOLS + c]; j >= 0; j = gNext[j]) {
                if (j <= i) continue;
                const o = units[j];
                const dx = o.x - u.x;
                const dy = o.y - u.y;
                const min = u.r + o.r;
                const d2 = dx * dx + dy * dy;
                if (d2 < min * min && d2 > 0.0001) {
                  const d = Math.sqrt(d2);
                  const push = (min - d) / 2;
                  u.x -= dx / d * push; u.y -= dy / d * push;
                  o.x += dx / d * push; o.y += dy / d * push;
                }
              }
            }
          }
          for (const l of lords) {
            if (!l.alive) continue;
            const dx = u.x - l.x;
            const dy = u.y - l.y;
            const min = u.r + l.r;
            const d2 = dx * dx + dy * dy;
            if (d2 < min * min && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              u.x = l.x + dx / d * min;
              u.y = l.y + dy / d * min;
            }
          }
          pushFromRocks(u);
        }
      }

      function volleys(dt) {
        for (const l of lords) {
          if (!l.alive || l.formation !== LINE) continue;
          l.volleyT -= dt;
          if (l.volleyT > 0) continue;
          l.volleyT = VOLLEY_T;
          let fired = 0;
          for (const u of l.army) {
            if (u.type !== 1 || !u.target || !u.target.alive) continue;
            if (U.dist(u.x, u.y, u.target.x, u.target.y) > TYPES[1].range * 1.3) continue;
            fireArrow(u, u.target, TYPES[1].dmg * 1.25, 1.3);
            fired++;
          }
          if (fired && l.human) {
            api.sfx('shoot');
            if (fired >= 3) hint('volley', 'Volley! In line formation all your archers fire together at long range.');
          } else if (fired >= 3 && onCam(l.x, l.y, 0)) {
            api.sfx('shoot');
          }
        }
      }

      function updateArrows(dt) {
        for (let i = an - 1; i >= 0; i--) {
          alife[i] -= dt;
          const steps = Math.max(1, Math.ceil(380 * dt / 8));
          const sdt = dt / steps;
          let hit = false;
          for (let s = 0; s < steps && !hit; s++) {
            ax[i] += avx[i] * sdt;
            ay[i] += avy[i] * sdt;
            const c = U.clamp(Math.floor(ax[i] / GCELL), 0, GCOLS - 1);
            const r = U.clamp(Math.floor(ay[i] / GCELL), 0, GROWS - 1);
            for (let j = gHead[r * GCOLS + c]; j >= 0; j = gNext[j]) {
              const o = units[j];
              if (!o.alive || o.owner === aown[i] || o.owner < 0) continue;
              const dx = o.x - ax[i];
              const dy = o.y - ay[i];
              if (dx * dx + dy * dy < (o.r + 2) * (o.r + 2)) {
                hurt(o, admg[i], aown[i]);
                hit = true;
                break;
              }
            }
            if (!hit) {
              for (const l of lords) {
                if (!l.alive || l.id === aown[i]) continue;
                const dx = l.x - ax[i];
                const dy = l.y - ay[i];
                if (dx * dx + dy * dy < (l.r + 2) * (l.r + 2)) {
                  hurt(l, admg[i], aown[i]);
                  hit = true;
                  break;
                }
              }
            }
          }
          if (!hit) {
            for (const k of rocks) {
              const dx = ax[i] - k.x;
              const dy = ay[i] - k.y;
              if (dx * dx + dy * dy < k.r * k.r) { hit = true; break; }
            }
          }
          if (hit || alife[i] <= 0 || state !== 'play') {
            an--;
            ax[i] = ax[an]; ay[i] = ay[an]; avx[i] = avx[an]; avy[i] = avy[an];
            alife[i] = alife[an]; admg[i] = admg[an]; aown[i] = aown[an];
          }
        }
      }

      /* ---------- Lords ---------- */
      const power = (l) => l.army.reduce((s, u) => s + POWER[u.type], 0) + 5 * (l.hp / l.maxHp);

      function moveLord(l, mx, my, dt) {
        const m = Math.hypot(mx, my);
        const tvx = m > 0.01 ? mx / m * LORD_SPEED : 0;
        const tvy = m > 0.01 ? my / m * LORD_SPEED : 0;
        const k = Math.min(1, dt * 6);
        l.vx += (tvx - l.vx) * k;
        l.vy += (tvy - l.vy) * k;
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        l.speed = Math.hypot(l.vx, l.vy);
        if (l.speed > 25) {
          const want = Math.atan2(l.vy, l.vx);
          l.face += Math.atan2(Math.sin(want - l.face), Math.cos(want - l.face)) * Math.min(1, dt * 5);
        }
        pushFromRocks(l);
        if (l.formation === WEDGE && l.speed > 110 && l.army.length && Math.random() < 0.5) {
          const u = U.pick(l.army);
          if (u && onCam(u.x, u.y, 20)) part(u.x, u.y, U.rand(-20, 20), U.rand(-20, 20), 0.4, 3, 'rgba(255,197,61,.35)');
        }
      }

      function lordFight(l, dt) {
        l.cd -= dt;
        if (l.cd > 0) return;
        let best = null;
        let bd = (l.r + 24) * (l.r + 24);
        const c0 = Math.max(0, Math.floor((l.x - 40) / GCELL));
        const c1 = Math.min(GCOLS - 1, Math.floor((l.x + 40) / GCELL));
        const r0 = Math.max(0, Math.floor((l.y - 40) / GCELL));
        const r1 = Math.min(GROWS - 1, Math.floor((l.y + 40) / GCELL));
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            for (let i = gHead[r * GCOLS + c]; i >= 0; i = gNext[i]) {
              const o = units[i];
              if (o.owner === l.id) continue;
              const d = (o.x - l.x) * (o.x - l.x) + (o.y - l.y) * (o.y - l.y);
              if (d < bd) { bd = d; best = o; }
            }
          }
        }
        for (const o of lords) {
          if (o === l || !o.alive) continue;
          const d = (o.x - l.x) * (o.x - l.x) + (o.y - l.y) * (o.y - l.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best) {
          l.cd = 0.7;
          hurt(best, 12 * (l.formation === WEDGE && l.speed > 110 ? 1.6 : 1), l.id);
          burst(best.x, best.y, '#FFFFFF', 4, 80, 0.25, 2);
        }
      }

      function collect(l, dt) {
        for (let i = coins.length - 1; i >= 0; i--) {
          const c = coins[i];
          if (Math.abs(c.x - l.x) < 22 && Math.abs(c.y - l.y) < 22) {
            l.gold += c.v;
            l.earned += c.v;
            coins.splice(i, 1);
            if (l.human) {
              api.sfx('score');
              say(l.x, l.y - 30, '+' + c.v + 'g', C.gold);
              hint('coin', 'Gold! Press 1 for a soldier (10g), 2 for an archer (15g), 3 for a knight (30g).');
            }
          }
        }
      }

      function updateMines(dt) {
        for (const m of mines) {
          let inside = null;
          let count = 0;
          for (const l of lords) {
            if (l.alive && U.dist(l.x, l.y, m.x, m.y) < MINE_R) { inside = l; count++; }
          }
          if (count === 1 && m.owner !== inside.id) {
            if (m.capBy !== inside.id) { m.capBy = inside.id; m.cap = 0; }
            m.cap += dt / 3;
            if (m.cap >= 1) {
              m.owner = inside.id;
              m.cap = 0;
              burst(m.x, m.y, inside.color, 18, 140, 0.6, 3);
              if (inside.human) {
                api.sfx('power');
                say(m.x, m.y - 50, 'Mine captured', C.gold);
                hint('mine', 'This mine now pays you ' + m.rate + ' gold every second until someone takes it.');
              }
            }
          } else if (count === 0) {
            m.cap = Math.max(0, m.cap - dt / 6);
          }
          m.payT -= dt;
          if (m.payT <= 0) {
            m.payT = 1;
            const o = lords[m.owner];
            if (o && o.alive) {
              o.gold += m.rate;
              o.earned += m.rate;
              if (o.human && onCam(m.x, m.y, 0)) say(m.x + U.rand(-10, 10), m.y - 30, '+' + m.rate, C.gold);
            }
          }
        }
      }

      /* ---------- Bot lords ---------- */
      function botThink(b) {
        const ai = b.ai;
        ai.think = L.think * U.rand(0.8, 1.2);
        const myP = power(b);
        let prey = null;
        let preyS = 0;
        let threat = null;
        let threatD = 1e9;
        for (const o of lords) {
          if (o === b || !o.alive) continue;
          const d = U.dist(b.x, b.y, o.x, o.y);
          if (d > 650) continue;
          const op = power(o) * (o.human ? L.fear : 1);
          const coming = o.ai.target === b || (o.human && o.speed > 60 && (o.vx * (b.x - o.x) + o.vy * (b.y - o.y)) > 0);
          if (op > myP * 1.15 && (d < 230 || (coming && d < 420))) {
            if (d < threatD) { threatD = d; threat = o; }
          } else if (myP * L.aggr > op * 1.25) {
            const s = (myP - op) / (d + 200);
            if (s > preyS) { preyS = s; prey = o; }
          }
        }
        const archers = b.army.filter((u) => u.type === 1).length;
        if (threat && (b.hp < b.maxHp * 0.9 || myP < power(threat) * 0.85)) {
          ai.mode = 'flee';
          let a = Math.atan2(b.y - threat.y, b.x - threat.x);
          // Pinned against an edge: slide sideways instead of pressing into it.
          for (let k = 0; k < 4; k++) {
            const fx = b.x + Math.cos(a) * 320;
            const fy = b.y + Math.sin(a) * 320;
            if (fx > 80 && fx < WW - 80 && fy > 80 && fy < WH - 80) break;
            a += (k % 2 ? -1 : 1) * (k + 1) * 0.8;
          }
          ai.gx = U.clamp(b.x + Math.cos(a) * 320, 80, WW - 80);
          ai.gy = U.clamp(b.y + Math.sin(a) * 320, 80, WH - 80);
          setFormation(b, RING);
        } else if (prey) {
          ai.mode = 'attack';
          ai.target = prey;
          const d = U.dist(b.x, b.y, prey.x, prey.y);
          if (!L.smart) setFormation(b, WEDGE);
          else if (b.hp < b.maxHp * 0.35) setFormation(b, RING);
          else if (archers >= b.army.length * 0.4 && d > 140) setFormation(b, LINE);
          else setFormation(b, WEDGE);
        } else {
          ai.mode = 'eco';
          let best = null;
          let bs = 0;
          for (const m of mines) {
            if (m.owner === b.id) continue;
            const d = U.dist(b.x, b.y, m.x, m.y);
            const own = lords[m.owner];
            let s = m.rate * 30 / (d + 150);
            if (own && own.alive && power(own) > myP && U.dist(own.x, own.y, m.x, m.y) < 300) s *= 0.2;
            if (s > bs) { bs = s; best = m; }
          }
          for (const c of coins) {
            const d = U.dist(b.x, b.y, c.x, c.y);
            const s = c.v / (d + 80);
            if (s > bs) { bs = s; best = c; }
          }
          if (best) { ai.gx = best.x; ai.gy = best.y; }
          else if (U.dist(b.x, b.y, ai.gx, ai.gy) < 40) { ai.gx = U.rand(200, WW - 200); ai.gy = U.rand(200, WH - 200); }
          if (L.smart && archers >= 6 && archers >= b.army.length * 0.4) setFormation(b, LINE);
          else if (b.hp < b.maxHp * 0.5) setFormation(b, RING);
          else setFormation(b, WEDGE);
        }
        // Hire: fill toward a preferred mix.
        ai.recruitT -= ai.think + 0.01;
        if (ai.recruitT <= 0 && b.army.length < L.cap) {
          const counts = [0, 0, 0];
          for (const u of b.army) counts[u.type]++;
          const n = b.army.length + 1;
          let want = 0;
          let gap = -1e9;
          for (let k = 0; k < 3; k++) {
            const g = ai.mix[k] - counts[k] / n;
            if (g > gap) { gap = g; want = k; }
          }
          if (b.gold >= TYPES[want].cost) {
            recruit(b, want);
            ai.recruitT = L.recruitT;
          } else if (b.gold >= TYPES[0].cost && b.army.length < 6) {
            recruit(b, 0);
            ai.recruitT = L.recruitT;
          }
        }
      }

      function botUpdate(b, dt) {
        const ai = b.ai;
        ai.think -= dt;
        if (ai.think <= 0) botThink(b);
        let gx = ai.gx;
        let gy = ai.gy;
        if (ai.mode === 'attack' && ai.target && ai.target.alive) {
          const t = ai.target;
          const d = U.dist(b.x, b.y, t.x, t.y);
          // Lead with the army: ride in close only while healthy and backed by troops.
          const keep = b.hp > b.maxHp * 0.6 && b.army.length >= 4 ? 55 : 140;
          if (d > keep) { gx = t.x; gy = t.y; }
          else { gx = b.x; gy = b.y; }
        } else if (ai.mode === 'attack') {
          ai.think = 0;
        }
        let mx = gx - b.x;
        let my = gy - b.y;
        const d = Math.hypot(mx, my);
        if (d < 6) { mx = 0; my = 0; }
        // Steer around rocks.
        if (d >= 6) {
          let a = Math.atan2(my, mx);
          if (ai.detourT > 0) { ai.detourT -= dt; a = ai.detourA; }
          for (const off of [0, 0.5, -0.5, 1, -1, 1.6, -1.6]) {
            const aa = a + off;
            if (freeSpot(b.x + Math.cos(aa) * 34, b.y + Math.sin(aa) * 34, LORD_R)) { a = aa; break; }
          }
          mx = Math.cos(a);
          my = Math.sin(a);
        }
        ai.stuckT += dt;
        if (ai.stuckT > 1.2) {
          if ((mx || my) && U.dist(b.x, b.y, ai.sx, ai.sy) < 25) { ai.detourA = Math.random() * TAU; ai.detourT = 0.7; }
          ai.stuckT = 0;
          ai.sx = b.x;
          ai.sy = b.y;
        }
        moveLord(b, mx, my, dt);
      }

      /* ---------- Game flow ---------- */
      function startGame(d) {
        diff = d;
        L = LEVELS[d];
        buildWorld();
        units.length = 0;
        an = 0;
        pl.fill(0);
        floats.length = 0;
        const names = U.shuffle(LORD_NAMES.slice());
        const cols = U.shuffle(LORD_COLS.slice());
        const spawns = U.shuffle(SPAWNS.slice());
        lords = [];
        for (let i = 0; i < 5; i++) {
          const l = i === 0 ? makeLord(0, 'You', C.violet, true) : makeLord(i, names[i], cols[i - 1], false);
          l.x = spawns[i].x;
          l.y = spawns[i].y;
          l.face = Math.atan2(WH / 2 - l.y, WW / 2 - l.x);
          if (!l.human) {
            const m = U.pick([[0.5, 0.3, 0.2], [0.35, 0.45, 0.2], [0.4, 0.2, 0.4], [0.6, 0.25, 0.15]]);
            l.ai.mix = m;
            l.ai.gx = l.x;
            l.ai.gy = l.y;
          }
          lords.push(l);
          for (let k = 0; k < 4; k++) spawnUnit(l, 0);
          layout(l);
        }
        me = lords[0];
        clock = 0;
        timeLeft = MATCH_T;
        countT = 3;
        goT = 0;
        shake = 0;
        hurtFx = 0;
        banner = null;
        hinted = {};
        formFx = 0;
        coinT = 0;
        cam.x = me.x - W / 2;
        cam.y = me.y - H / 2;
        ptr.down = false;
        state = 'count';
        api.sfx('tick');
        updateScore();
        api.setStatus('Ride with WASD or hold the pointer. Grab coins and capture mines, then hire with 1, 2 and 3.');
      }

      function showStartMenu() {
        state = 'menu';
        api.menu({
          title: 'Warband',
          text: 'Five lords, eight minutes. Gather gold, hire an army, and switch formations with Q to win your battles.',
          buttons: [
            { label: 'Easy', onClick: () => startGame('easy') },
            { label: 'Normal', primary: true, onClick: () => startGame('normal') },
            { label: 'Hard', onClick: () => startGame('hard') }
          ]
        });
      }

      function updateScore() {
        if (me) api.setScore(score(me));
      }

      function endGame(why) {
        if (state === 'over') return;
        state = 'over';
        an = 0;
        const sc = score(me);
        const isBest = api.reportScore(sc);
        const ranked = lords.slice().sort((a, b) => score(b) - score(a));
        const rank = ranked.indexOf(me) + 1;
        api.setScore(sc);
        api.sfx(why === 'dead' ? 'lose' : 'win');
        const parts = 'Score ' + sc + ': ' + Math.floor(me.earned) + ' gold earned, ' + me.kills + ' kills, ' +
          me.lordKills + ' lord' + (me.lordKills === 1 ? '' : 's') + ' defeated.';
        let title;
        let text;
        if (why === 'dead') {
          title = 'Your lord has fallen';
          text = parts;
        } else if (why === 'last') {
          title = 'Last lord standing!';
          text = 'Every rival is beaten. ' + parts;
        } else {
          title = 'Time\'s up';
          text = 'You finished #' + rank + ' of 5 by score. ' + parts;
        }
        if (isBest) {
          text = title + '. ' + text;
          title = 'New best: ' + sc + '!';
        }
        api.setStatus(why === 'dead' ? 'Your lord fell after ' + Math.floor(clock / 60) + ' min ' + Math.floor(clock % 60) + ' s.' : 'Match over.');
        api.after(why === 'dead' ? 1300 : 800, () => {
          api.menu({
            title,
            text,
            buttons: [
              { label: 'Play again', primary: true, onClick: () => startGame(diff) },
              { label: 'Change mode', onClick: showStartMenu }
            ]
          });
        });
      }

      /* ---------- Input ---------- */
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || !me || !me.alive) return;
        if (e.code === 'KeyQ') setFormation(me, (me.formation + 1) % 3);
        else if (e.code === 'Digit1') recruit(me, 0);
        else if (e.code === 'Digit2') recruit(me, 1);
        else if (e.code === 'Digit3') recruit(me, 2);
      });

      /* Bottom bar buttons, also used for touch: formation + three hire buttons. */
      const BTN_Y = H - 50;
      const BTNS = [
        { x: 16, w: 150, act: () => setFormation(me, (me.formation + 1) % 3) },
        { x: W / 2 - 190, w: 120, act: () => recruit(me, 0) },
        { x: W / 2 - 60, w: 120, act: () => recruit(me, 1) },
        { x: W / 2 + 70, w: 120, act: () => recruit(me, 2) }
      ];
      function buttonAt(x, y) {
        if (y < BTN_Y || y > BTN_Y + 38) return null;
        for (const b of BTNS) if (x >= b.x && x <= b.x + b.w) return b;
        return null;
      }
      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        ptr.x = p.x;
        ptr.y = p.y;
        if (state !== 'play' || !me || !me.alive) return;
        const b = buttonAt(p.x, p.y);
        if (b) { b.act(); return; }
        ptr.down = true;
      });
      api.on(canvas, 'pointermove', (e) => {
        const p = api.toCanvas(e, canvas);
        ptr.x = p.x;
        ptr.y = p.y;
      });
      api.on(canvas, 'pointerup', () => { ptr.down = false; });
      api.on(canvas, 'pointerleave', () => { ptr.down = false; });

      function humanUpdate(dt) {
        const k = api.keys;
        let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        let my = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        if (!mx && !my && ptr.down) {
          const wx = ptr.x + cam.x;
          const wy = ptr.y + cam.y;
          const d = U.dist(wx, wy, me.x, me.y);
          if (d > 14) { mx = (wx - me.x) / d; my = (wy - me.y) / d; }
        }
        moveLord(me, mx, my, dt);
      }

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt * 25);
        hurtFx = Math.max(0, hurtFx - dt);
        goT = Math.max(0, goT - dt);
        hitSfxT -= dt;
        formFx = Math.max(0, formFx - dt);
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          pl[i] -= dt;
          px[i] += pvx[i] * dt;
          py[i] += pvy[i] * dt;
          pvx[i] *= 0.93;
          pvy[i] *= 0.93;
        }
        for (let i = floats.length - 1; i >= 0; i--) {
          floats[i].t += dt;
          if (floats[i].t > 1.2) floats.splice(i, 1);
        }
        if (banner) {
          banner.t += dt;
          if (banner.t > 2.2) banner = null;
        }
        for (const c of coins) c.t += dt;
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) { state = 'play'; goT = 0.8; api.sfx('blip'); }
          else if (Math.ceil(countT) !== prev) api.sfx('tick');
        } else if (state === 'play') {
          timeLeft -= dt;
          coinT -= dt;
          if (coinT <= 0) { coinT = 1.1; if (coins.length < 40) spawnCoin(); }
          buildGrid();
          for (const l of lords) {
            if (!l.alive) continue;
            l.flash = Math.max(0, l.flash - dt);
            if (clock - l.hurtT > 4) l.hp = Math.min(l.maxHp, l.hp + 4 * dt);
            if (l.human) humanUpdate(dt);
            else botUpdate(l, dt);
            collect(l, dt);
            l.slotT -= dt;
            if (l.slotT <= 0) { l.slotT = 0.5; layout(l); }
          }
          // Lords bump each other.
          for (let i = 0; i < lords.length; i++) {
            for (let j = i + 1; j < lords.length; j++) {
              const a = lords[i];
              const b = lords[j];
              if (!a.alive || !b.alive) continue;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const d = Math.hypot(dx, dy);
              if (d > 0.01 && d < a.r + b.r) {
                const o = (a.r + b.r - d) / 2;
                a.x -= dx / d * o; a.y -= dy / d * o;
                b.x += dx / d * o; b.y += dy / d * o;
              }
            }
          }
          updateUnits(dt);
          buildGrid();
          for (const l of lords) if (l.alive && state === 'play') lordFight(l, dt);
          volleys(dt);
          updateArrows(dt);
          updateMines(dt);
          if (state === 'play' && Math.floor(clock * 4) !== Math.floor((clock - dt) * 4)) updateScore();
          if (state === 'play' && timeLeft <= 60 && !hinted.minute) {
            hinted.minute = true;
            banner = { text: 'One minute left', sub: 'Score is locked in when time runs out.', color: C.gold, t: 0 };
            api.sfx('tick');
          }
          if (state === 'play' && timeLeft <= 0) { timeLeft = 0; endGame('time'); }
        } else if (state === 'over') {
          for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (!u.alive && u.dieT > 0) u.dieT -= dt;
          }
        }
        if (me) {
          const tx = U.clamp(me.x - W / 2, -40, WW - W + 40);
          const ty = U.clamp(me.y - H / 2, -40, WH - H + 40);
          const k = Math.min(1, dt * 5);
          cam.x += (tx - cam.x) * k;
          cam.y += (ty - cam.y) * k;
        }
      }

      /* ---------- Drawing ---------- */
      function drawWorld() {
        ctx.fillStyle = '#090818';
        ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, WW, WH);
        for (const d of decor) {
          if (!onCam(d.x, d.y, 10)) continue;
          ctx.fillStyle = d.k ? 'rgba(155,123,255,.08)' : 'rgba(75,227,160,.06)';
          ctx.fillRect(d.x, d.y, 5, 2);
          ctx.fillRect(d.x + 1, d.y - 2, 2, 2);
        }
        ctx.strokeStyle = U.alpha(C.violet, 0.45);
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, WW, WH);
        for (const m of mines) {
          if (!onCam(m.x, m.y, MINE_R + 20)) continue;
          const o = lords[m.owner];
          ctx.fillStyle = U.alpha(o ? o.color : C.gold, 0.12);
          ctx.beginPath(); ctx.arc(m.x, m.y, MINE_R, 0, TAU); ctx.fill();
          ctx.strokeStyle = U.alpha(o ? o.color : C.gold, 0.6);
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 6]);
          ctx.beginPath(); ctx.arc(m.x, m.y, MINE_R, 0, TAU); ctx.stroke();
          ctx.setLineDash([]);
          if (m.cap > 0 && m.capBy >= 0 && lords[m.capBy]) {
            ctx.strokeStyle = lords[m.capBy].color;
            ctx.lineWidth = 5;
            ctx.beginPath(); ctx.arc(m.x, m.y, MINE_R - 6, -Math.PI / 2, -Math.PI / 2 + m.cap * TAU); ctx.stroke();
          }
          ctx.fillStyle = C.panel2;
          ctx.beginPath(); ctx.arc(m.x, m.y, 18, 0, TAU); ctx.fill();
          ctx.fillStyle = C.gold;
          for (let k = 0; k < 4; k++) {
            ctx.beginPath(); ctx.arc(m.x - 6 + (k % 2) * 12, m.y - 4 + Math.floor(k / 2) * 9, 4.5, 0, TAU); ctx.fill();
          }
          ctx.font = '600 11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = o ? o.color : C.muted;
          ctx.fillText((o ? (o.human ? 'yours' : o.name) : 'mine') + ' · ' + m.rate + 'g/s', m.x, m.y + 22);
        }
        for (const c of coins) {
          if (!onCam(c.x, c.y, 20)) continue;
          const bob = Math.sin(clock * 4 + c.x) * 1.5;
          const r = 4 + Math.min(6, c.v / 3);
          ctx.fillStyle = U.alpha(C.gold, 0.2);
          ctx.beginPath(); ctx.arc(c.x, c.y + bob, r + 4, 0, TAU); ctx.fill();
          ctx.fillStyle = C.gold;
          ctx.beginPath(); ctx.arc(c.x, c.y + bob, r, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.6)';
          ctx.fillRect(c.x - r * 0.4, c.y + bob - r * 0.5, r * 0.5, r * 0.3);
        }
        for (const k of rocks) {
          if (!onCam(k.x, k.y, k.r + 10)) continue;
          ctx.fillStyle = 'rgba(0,0,0,.3)';
          ctx.beginPath(); ctx.arc(k.x + 4, k.y + 5, k.r, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3F3A72';
          ctx.beginPath(); ctx.arc(k.x, k.y, k.r, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.07)';
          ctx.beginPath(); ctx.arc(k.x - k.r * 0.3, k.y - k.r * 0.3, k.r * 0.5, 0, TAU); ctx.fill();
        }
        // Your formation slots, shown briefly after a switch.
        if (formFx > 0 && me && me.alive) {
          const ca = Math.cos(me.face);
          const sa = Math.sin(me.face);
          ctx.strokeStyle = U.alpha(FORM_COLS[me.formation], Math.min(1, formFx) * 0.6);
          ctx.lineWidth = 1.5;
          for (const u of me.army) {
            const sx = me.x + ca * u.fx - sa * u.fs;
            const sy = me.y + sa * u.fx + ca * u.fs;
            ctx.beginPath(); ctx.arc(sx, sy, u.r + 3, 0, TAU); ctx.stroke();
          }
        }
        for (const l of lords) {
          if (!l.alive || l.formation !== RING || !l.army.length || !onCam(l.x, l.y, 140)) continue;
          ctx.strokeStyle = U.alpha(C.mint, 0.18 + 0.06 * Math.sin(clock * 4));
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(l.x, l.y, l.army.length > 22 ? 110 : l.army.length > 8 ? 84 : 58, 0, TAU); ctx.stroke();
        }
        for (const u of units) {
          if (!u.alive && u.dieT <= 0) continue;
          if (!onCam(u.x, u.y, 20)) continue;
          const lord = lords[u.owner];
          let col = lord ? lord.color : C.muted;
          let a = 1;
          if (!u.alive) a = Math.max(0, u.dieT / 0.4);
          else if (u.owner < 0) a = Math.min(1, u.fade / 1.5) * 0.7;
          if (u.flash > 0) col = '#FFFFFF';
          ctx.globalAlpha = a;
          if (u.alive && u.owner >= 0 && lord.formation === WEDGE && lord.speed > 110) {
            ctx.fillStyle = U.alpha(C.gold, 0.35);
            ctx.beginPath(); ctx.arc(u.x, u.y, u.r + 3, 0, TAU); ctx.fill();
          }
          drawUnitShape(ctx, u.x, u.y, u.type, col, u.face, u.r);
          if (u.alive && u.owner >= 0 && u.hp < u.maxHp) {
            ctx.fillStyle = 'rgba(15,13,36,.7)';
            ctx.fillRect(u.x - 6, u.y - u.r - 5, 12, 2);
            ctx.fillStyle = C.text;
            ctx.fillRect(u.x - 6, u.y - u.r - 5, 12 * u.hp / u.maxHp, 2);
          }
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = U.alpha(C.text, 0.85);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < an; i++) {
          const sp = Math.hypot(avx[i], avy[i]) || 1;
          ctx.moveTo(ax[i], ay[i]);
          ctx.lineTo(ax[i] - avx[i] / sp * 9, ay[i] - avy[i] / sp * 9);
        }
        ctx.stroke();
        for (const l of lords) {
          if (!l.alive || !onCam(l.x, l.y, 60)) continue;
          drawLordBody(ctx, l.x, l.y, l.face, l.color, 1, l.flash > 0);
          drawBanner(ctx, l.x - 3, l.y - 4, l.color, clock + l.id, 1);
          ctx.font = '600 11px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = l.human ? C.text : U.alpha(C.text, 0.8);
          ctx.fillText(l.human ? 'You' : l.name + ' · ' + l.army.length, l.x, l.y - 42);
          ctx.fillStyle = 'rgba(15,13,36,.7)';
          ctx.fillRect(l.x - 18, l.y + 14, 36, 4);
          ctx.fillStyle = l.hp > l.maxHp * 0.4 ? C.mint : C.p1;
          ctx.fillRect(l.x - 18, l.y + 14, 36 * l.hp / l.maxHp, 4);
          if (!l.human) {
            ctx.fillStyle = FORM_COLS[l.formation];
            ctx.font = '600 10px ' + MONO;
            ctx.textBaseline = 'top';
            ctx.fillText(FORM_NAMES[l.formation].toLowerCase(), l.x, l.y + 20);
          }
        }
        for (let i = 0; i < MAX_PARTS; i++) {
          if (pl[i] <= 0) continue;
          ctx.globalAlpha = pl[i] / pm[i];
          ctx.fillStyle = pc[i];
          ctx.fillRect(px[i] - ps[i] / 2, py[i] - ps[i] / 2, ps[i], ps[i]);
        }
        ctx.globalAlpha = 1;
        for (const f of floats) {
          ctx.globalAlpha = Math.max(0, 1 - f.t / 1.2);
          ctx.font = '800 14px ' + MONO;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y - f.t * 28);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      function drawHud() {
        // Gold, army, lord health.
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, 14, 14, 220, 84, 12); ctx.fill();
        ctx.font = '800 24px ' + MONO;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.gold;
        ctx.fillText(Math.floor(me.gold) + 'g', 26, 20);
        const cnt = [0, 0, 0];
        for (const u of me.army) cnt[u.type]++;
        ctx.font = '600 12px ' + MONO;
        ctx.fillStyle = C.text;
        ctx.fillText('army ' + me.army.length + '/' + MAX_ARMY, 120, 22);
        ctx.fillStyle = C.muted;
        ctx.fillText(cnt[0] + 's ' + cnt[1] + 'a ' + cnt[2] + 'k', 120, 38);
        ctx.fillStyle = 'rgba(15,13,36,.8)';
        ctx.fillRect(26, 58, 196, 10);
        ctx.fillStyle = me.hp > me.maxHp * 0.4 ? C.mint : C.p1;
        ctx.fillRect(26, 58, 196 * Math.max(0, me.hp) / me.maxHp, 10);
        ctx.fillStyle = C.muted;
        ctx.font = '600 11px ' + MONO;
        ctx.fillText('lord ' + Math.ceil(Math.max(0, me.hp)) + ' hp  ·  score ' + score(me), 26, 74);
        // Clock.
        const tl = Math.max(0, Math.ceil(timeLeft));
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, W / 2 - 70, 14, 140, 44, 10); ctx.fill();
        ctx.font = '800 22px ' + MONO;
        ctx.textAlign = 'center';
        ctx.fillStyle = tl <= 60 ? C.gold : C.text;
        ctx.fillText(Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0'), W / 2, 19);
        ctx.font = '600 10px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.fillText(lords.filter((l) => l.alive).length + ' lords left', W / 2, 44);
        // Leaderboard.
        const ranked = lords.slice().sort((a, b) => (b.alive - a.alive) || score(b) - score(a));
        const lx = W - 220;
        const ly = 14;
        ctx.fillStyle = U.alpha(C.panel, 0.85);
        U.roundRect(ctx, lx, ly, 206, 26 + ranked.length * 18, 12); ctx.fill();
        ctx.font = '600 11px ' + MONO;
        ctx.textAlign = 'left';
        ctx.fillStyle = C.muted;
        ctx.fillText('lord', lx + 10, ly + 8);
        ctx.textAlign = 'right';
        ctx.fillText('army', lx + 146, ly + 8);
        ctx.fillText('score', lx + 198, ly + 8);
        ranked.forEach((l, i) => {
          const y = ly + 26 + i * 18;
          if (l === me) {
            ctx.fillStyle = U.alpha(C.violet, 0.22);
            ctx.fillRect(lx + 4, y - 2, 198, 17);
          }
          ctx.fillStyle = l.alive ? l.color : U.alpha(C.muted, 0.4);
          ctx.fillRect(lx + 10, y + 3, 8, 8);
          ctx.fillStyle = l.alive ? C.text : U.alpha(C.text, 0.35);
          ctx.textAlign = 'left';
          ctx.fillText((l === me ? 'You' : l.name).slice(0, 13), lx + 22, y);
          ctx.textAlign = 'right';
          ctx.fillText(l.alive ? String(l.army.length) : '—', lx + 146, y);
          ctx.fillText(String(score(l)), lx + 198, y);
        });
        // Minimap.
        const mw = 180;
        const mh = mw * WH / WW;
        const mx = W - mw - 14;
        const my = H - mh - 14;
        const k = mw / WW;
        ctx.fillStyle = U.alpha(C.panel, 0.9);
        ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
        ctx.fillStyle = C.ink;
        ctx.fillRect(mx, my, mw, mh);
        ctx.fillStyle = '#3F3A72';
        for (const r of rocks) ctx.fillRect(mx + r.x * k - 1.5, my + r.y * k - 1.5, 3, 3);
        for (const m of mines) {
          const o = lords[m.owner];
          ctx.fillStyle = o ? o.color : C.gold;
          ctx.fillRect(mx + m.x * k - 3, my + m.y * k - 3, 6, 6);
          if (!o) {
            ctx.fillStyle = C.ink;
            ctx.fillRect(mx + m.x * k - 1.5, my + m.y * k - 1.5, 3, 3);
          }
        }
        for (const l of lords) {
          if (!l.alive) continue;
          ctx.fillStyle = l.color;
          ctx.beginPath(); ctx.arc(mx + l.x * k, my + l.y * k, l.human ? 4 : 3 + Math.min(3, l.army.length / 12), 0, TAU); ctx.fill();
          if (l.human) {
            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
        ctx.strokeStyle = U.alpha(C.text, 0.5);
        ctx.lineWidth = 1;
        ctx.strokeRect(mx + cam.x * k, my + cam.y * k, W * k, H * k);
        // Formation and hire buttons.
        const f = me.formation;
        const fb = BTNS[0];
        ctx.fillStyle = U.alpha(C.panel, 0.92);
        U.roundRect(ctx, fb.x, BTN_Y, fb.w, 38, 10); ctx.fill();
        ctx.strokeStyle = FORM_COLS[f];
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = '600 10px ' + MONO;
        ctx.fillStyle = C.muted;
        ctx.fillText('Q formation', fb.x + 10, BTN_Y + 11);
        ctx.font = '800 15px ' + MONO;
        ctx.fillStyle = FORM_COLS[f];
        ctx.fillText(FORM_NAMES[f], fb.x + 10, BTN_Y + 26);
        // Tiny formation glyph.
        ctx.fillStyle = FORM_COLS[f];
        const gx = fb.x + fb.w - 28;
        const gy = BTN_Y + 19;
        if (f === WEDGE) {
          for (let r = 0; r < 3; r++) for (let j = 0; j <= r; j++) ctx.fillRect(gx + 8 - r * 6, gy - r * 4 + j * 8 - 1, 3, 3);
        } else if (f === RING) {
          for (let j = 0; j < 8; j++) ctx.fillRect(gx + Math.cos(j / 8 * TAU) * 9 - 1, gy + Math.sin(j / 8 * TAU) * 9 - 1, 3, 3);
        } else {
          for (let j = 0; j < 5; j++) { ctx.fillRect(gx + 4, gy - 10 + j * 5, 3, 3); ctx.fillRect(gx - 6, gy - 10 + j * 5, 3, 3); }
        }
        ctx.font = '600 10px ' + MONO;
        ctx.fillStyle = U.alpha(C.text, 0.6);
        ctx.fillText(FORM_TIPS[f], fb.x, BTN_Y - 10);
        if (f === WEDGE && me.speed > 110 && me.army.length) {
          ctx.fillStyle = C.gold;
          ctx.font = '800 12px ' + MONO;
          ctx.fillText('CHARGE!', fb.x + fb.w + 10, BTN_Y + 19);
        } else if (f === LINE && cnt[1] > 0) {
          ctx.fillStyle = U.alpha(C.p2, 0.25);
          ctx.fillRect(fb.x + fb.w + 10, BTN_Y + 16, 50, 6);
          ctx.fillStyle = C.p2;
          ctx.fillRect(fb.x + fb.w + 10, BTN_Y + 16, 50 * U.clamp(1 - me.volleyT / VOLLEY_T, 0, 1), 6);
        }
        for (let t = 0; t < 3; t++) {
          const b = BTNS[t + 1];
          const T = TYPES[t];
          const ok = me.gold >= T.cost && me.army.length < MAX_ARMY;
          ctx.fillStyle = U.alpha(ok ? C.panel2 : C.panel, 0.92);
          U.roundRect(ctx, b.x, BTN_Y, b.w, 38, 10); ctx.fill();
          if (ok) {
            ctx.strokeStyle = U.alpha(C.gold, 0.7);
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
          drawUnitShape(ctx, b.x + 18, BTN_Y + 19, t, ok ? C.violet : C.muted, -Math.PI / 2, 7);
          ctx.textAlign = 'left';
          ctx.font = '600 12px ' + MONO;
          ctx.fillStyle = ok ? C.text : C.muted;
          ctx.fillText((t + 1) + ' ' + T.name, b.x + 32, BTN_Y + 13);
          ctx.fillStyle = ok ? C.gold : U.alpha(C.gold, 0.4);
          ctx.fillText(T.cost + 'g', b.x + 32, BTN_Y + 28);
        }
      }

      function announce(text, sub, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(W / 2, H / 2 - 50);
        ctx.scale(scale, scale);
        ctx.font = '800 44px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(15,13,36,.7)';
        ctx.fillText(text, 3, 4);
        ctx.fillStyle = color;
        ctx.fillText(text, 0, 0);
        if (sub) {
          ctx.font = '600 15px ' + MONO;
          ctx.fillStyle = C.text;
          ctx.fillText(sub, 0, 46 / scale * 0.8);
        }
        ctx.restore();
      }

      function draw() {
        if (state === 'menu' || !me) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(0, 0, W, H);
          for (let i = 0; i < 9; i++) {
            const a = clock * 0.4 + i / 9 * TAU;
            drawUnitShape(ctx, W / 2 + Math.cos(a) * 120, H / 2 + Math.sin(a) * 120, i % 3, U.alpha(C.violet, 0.5), a + Math.PI / 2, 9);
          }
          return;
        }
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawWorld();
        ctx.restore();
        if (hurtFx > 0) {
          ctx.strokeStyle = U.alpha(C.p1, Math.min(0.45, hurtFx));
          ctx.lineWidth = 26;
          ctx.strokeRect(0, 0, W, H);
        }
        drawHud();
        if (state === 'count') announce(String(Math.ceil(countT)), '', C.violet, 1 + (countT % 1) * 0.4, 1);
        else if (goT > 0) announce('Ride!', '', C.mint, 1 + (0.8 - goT) * 0.5, Math.min(1, goT * 2));
        else if (banner) announce(banner.text, banner.sub, banner.color, 0.6, Math.min(1, (2.2 - banner.t) * 2));
        if (state === 'over' && !me.alive) announce('Your lord has fallen', '', C.p1, 0.6, 1);
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
