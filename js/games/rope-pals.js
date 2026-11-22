/* Rope Pals — co-op physics platformer: two blobs tied by a stretchy rope.
   One grips a surface and becomes an anchor; the other swings, pumps and flings. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const T = 40;               // tile size
  const BR = 15;              // blob radius
  const ROPE = 170;           // rope rest length
  const ROPE_MIN = 40;        // fully reeled in
  const ROPE_SLACK = 16;      // stretch allowed before the rope goes rigid
  const GRAV = 1500;
  const STEP = 1 / 120;       // fixed physics step
  const ROLL = 230;
  const ROLL_ACC = 2100;
  const ROLL_FRIC = 1600;
  const AIR_ACC = 540;
  const AIR_MAX = 250;
  const PUMP = 600;           // push along the swing while hanging from an anchored pal
  const JUMP = 450;           // a weak hop (about 1.5 tiles)
  const KICK = 300;           // push off a wall while swinging (press away from it)
  const BOOST = 610;          // hop off a gripping pal you are reeled in close to
  const MAXV = 1150;
  const K = 600;              // rope spring (stretchy, well damped)
  const KD = 25;              // rope damping
  const REEL_IN = 320;
  const REEL_OUT = 240;
  const RN = 14;              // rope render segments
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 13px "JetBrains Mono", monospace';
  const KEYS = [
    { left: ['KeyA'], right: ['KeyD'], jump: ['KeyW'], grip: ['Space'] },
    { left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'], grip: ['Enter', 'NumpadEnter'] }
  ];
  const NAMES = ['Coral', 'Cyan'];

  /* Levels are built from rectangles in tile units: [char, x0, y0, x1, y1] (inclusive).
     '#' ground, '^' spikes (point away from the ground they sit on), '~' water, '.' carve.
     'A' start, 'C' checkpoint flag, 'G' finish gate. Off the left/right edge counts as wall,
     below the bottom is a bottomless drop. Movers: {x, y, w, h, dx, dy, t (period), p (phase)}.
     Windmills: {x, y, r, n (blades), s (rad/s)}. Signs: [x, y, text]. */
  const LEVELS = [
    {
      name: 'Tied Together', w: 60, h: 18,
      hint: 'Roll to the gate together. Hold grip by any surface to stick to it; your pal swings from you.',
      b: [
        ['#', 0, 13, 26, 17], ['#', 9, 12, 10, 12], ['#', 16, 11, 26, 17],
        ['#', 30, 11, 39, 17], ['#', 37, 7, 51, 8], ['#', 46, 11, 59, 17],
        ['A', 3, 12], ['C', 21, 10], ['C', 34, 10], ['G', 55, 8, 56, 10]
      ],
      signs: [
        [5, 8.6, 'A/D and ←/→ roll. W/↑ hops (weakly).'],
        [5, 9.3, 'R sends you both back to the last flag.'],
        [12, 6.6, 'Too tall? One pal holds GRIP (Space / Enter),'],
        [12, 7.2, 'the other hops off them for a BOOST.'],
        [21.5, 7.6, 'Gripping + hold W/↑ reels your pal in.'],
        [28.5, 2.6, 'Gap! Grip the lip. Your pal drops in, pumps ←/→,'],
        [28.5, 3.2, 'kicks off the walls and grips the far side.'],
        [28.5, 3.8, 'Then reel in, boost up, swap. Inchworm!'],
        [44, 5.4, 'Hop up, grip the ceiling,'],
        [44, 6, 'swing hand over hand.'],
        [55.5, 6.2, 'Both pals in the gate']
      ]
    },
    {
      name: 'Monkey Bars', w: 72, h: 18,
      hint: 'Spikes below, bars above. Hop up and grip a bar; your pal swings to the next grip. Swap and repeat.',
      b: [
        ['#', 0, 11, 8, 17], ['#', 9, 17, 71, 17], ['^', 9, 16, 60, 16],
        ['#', 5, 8, 18, 8], ['#', 22, 8, 34, 8], ['#', 38, 8, 50, 8], ['#', 54, 8, 62, 8],
        ['#', 26, 11, 28, 17], ['#', 44, 11, 46, 17],
        ['#', 61, 11, 71, 17],
        ['A', 3, 10], ['C', 27, 10], ['C', 45, 10], ['G', 67, 8, 68, 10]
      ],
      signs: [[3.5, 7, 'Hop and grip the bar!']]
    },
    {
      name: 'Lazy River', w: 80, h: 20,
      hint: 'Water is safe but slow (hop to paddle). Swinging along the ceiling is faster.',
      b: [
        ['#', 0, 8, 12, 19], ['#', 10, 4, 46, 5],
        ['#', 13, 15, 40, 19], ['~', 13, 12, 40, 14],
        ['#', 41, 12, 52, 19],
        ['#', 53, 17, 79, 19], ['#', 53, 16, 57, 16], ['~', 58, 16, 70, 17], ['#', 71, 16, 79, 16],
        ['#', 56, 10, 72, 11], ['^', 56, 12, 72, 12],
        ['A', 3, 7], ['C', 44, 11], ['C', 54, 15], ['G', 76, 13, 77, 15]
      ],
      signs: [
        [5, 6.4, 'Hop and grip the ceiling,'],
        [5, 7, 'or take the slow swim.'],
        [64, 14.6, 'Thorny roof: swim it!']
      ]
    },
    {
      name: 'Lift Line', w: 84, h: 19,
      hint: 'Ride the lifts. Grip a moving platform and it carries you, rope and all.',
      b: [
        ['#', 0, 11, 9, 18], ['#', 28, 11, 35, 18], ['#', 39, 5, 45, 18], ['#', 72, 8, 83, 18],
        ['A', 3, 10], ['C', 30, 10], ['C', 42, 4], ['G', 79, 5, 80, 7]
      ],
      movers: [
        { x: 10, y: 11, w: 3, dx: 15, dy: 0, t: 5 },
        { x: 36, y: 11, w: 3, dx: 0, dy: -6, t: 6 },
        { x: 46, y: 8, w: 3, dx: 10, dy: 0, t: 4 },
        { x: 60, y: 8, w: 3, dx: 9, dy: 0, t: 4, p: 0.5 }
      ],
      signs: [[5, 8.4, 'Hop on and ride. Do not fall behind!']]
    },
    {
      name: 'Windmill Hill', w: 90, h: 19,
      hint: 'Grip a windmill blade to ride it, then let go near the top to fling across.',
      b: [
        ['#', 0, 12, 10, 18], ['#', 23, 12, 34, 18], ['#', 53, 12, 63, 18],
        ['#', 61, 10, 71, 10], ['#', 64, 18, 70, 18], ['^', 64, 17, 70, 17],
        ['#', 71, 12, 89, 18],
        ['A', 3, 11], ['C', 26, 11], ['C', 56, 11], ['G', 85, 9, 86, 11]
      ],
      mills: [
        { x: 16.5, y: 11, r: 3, n: 2, s: 1.6 },
        { x: 40, y: 10, r: 3, n: 2, s: -1.8 },
        { x: 48, y: 10, r: 3, n: 2, s: 1.8 }
      ],
      signs: [
        [5, 9.4, 'Hop toward a blade holding grip. Ride it. Let go to fling!'],
        [62, 8.4, 'Low bar: hop, grip, swing.']
      ]
    },
    {
      name: 'Lift Shaft', w: 40, h: 34,
      hint: 'Ride the lifts up. Too tall to hop? One pal grips, the other hops off them for a boost.',
      b: [
        ['#', 0, 0, 39, 0], ['#', 0, 0, 1, 33], ['#', 38, 0, 39, 33], ['#', 0, 32, 39, 33],
        ['.', 8, 32, 10, 32],
        ['#', 11, 24, 18, 24], ['#', 22, 16, 30, 16], ['#', 26, 13, 37, 15],
        ['#', 2, 8, 20, 9],
        ['A', 4, 31], ['C', 14, 23], ['C', 33, 12], ['G', 4, 5, 5, 7]
      ],
      movers: [
        { x: 8, y: 32, w: 3, dx: 0, dy: -8, t: 6 },
        { x: 19, y: 24, w: 3, dx: 0, dy: -8, t: 6, p: 0.5 },
        { x: 22, y: 13, w: 3, dx: 0, dy: -5, t: 5 }
      ],
      signs: [
        [5, 28.6, 'Ride the lift up.'],
        [24, 11.4, 'Three tiles? Grip,'],
        [24, 12, 'then boost off your pal.']
      ]
    },
    {
      name: 'Thorn Garden', w: 86, h: 19,
      hint: 'Thorns on every bar top. Hang underneath and never land on the spikes.',
      b: [
        ['#', 0, 11, 7, 18], ['#', 8, 18, 85, 18], ['^', 8, 17, 85, 17],
        ['#', 4, 8, 20, 8], ['^', 4, 7, 20, 7],
        ['#', 25, 11, 27, 18],
        ['#', 24, 8, 40, 8], ['^', 24, 7, 40, 7],
        ['#', 44, 11, 56, 18], ['#', 44, 0, 56, 3], ['^', 44, 4, 56, 4],
        ['#', 55, 8, 71, 8], ['^', 55, 7, 71, 7],
        ['#', 73, 11, 85, 18],
        ['A', 2, 10], ['C', 26, 10], ['C', 50, 10], ['G', 81, 8, 82, 10]
      ],
      signs: [[3, 5.4, 'Bar tops are thorny. Hang below!']]
    },
    {
      name: 'Grand Tour', w: 110, h: 22,
      hint: 'Everything at once: swim or swing, ride the lift, fling off the windmill, mind the thorns.',
      b: [
        ['#', 0, 14, 9, 21], ['#', 6, 10, 22, 11],
        ['#', 10, 19, 24, 21], ['~', 10, 17, 24, 18], ['#', 21, 16, 24, 18], ['#', 23, 15, 24, 15],
        ['#', 25, 14, 40, 21],
        ['#', 56, 14, 66, 21],
        ['#', 78, 14, 90, 21],
        ['#', 89, 12, 100, 12], ['^', 89, 11, 100, 11],
        ['#', 91, 21, 101, 21], ['^', 91, 20, 101, 20],
        ['#', 102, 14, 109, 21],
        ['A', 3, 13], ['C', 28, 13], ['C', 60, 13], ['C', 84, 13], ['G', 106, 11, 107, 13]
      ],
      movers: [{ x: 41, y: 14, w: 3, dx: 12, dy: 0, t: 4.5 }],
      mills: [{ x: 71.5, y: 13, r: 3, n: 2, s: 1.7 }],
      signs: [[4, 9.2, 'Last run. Swim, swing or fling!']]
    }
  ];

  function buildLevel(def) {
    const w = def.w;
    const h = def.h;
    const grid = new Uint8Array(w * h); // 0 empty, 1 ground, 2 spikes, 3 water
    const flags = [];
    let start = { x: 2, y: 2 };
    let goal = { x: (w - 3) * T, y: (h - 4) * T, w: 2 * T, h: 3 * T };
    for (const cmd of def.b) {
      const ch = cmd[0];
      const x0 = cmd[1];
      const y0 = cmd[2];
      const x1 = cmd.length > 3 ? cmd[3] : x0;
      const y1 = cmd.length > 4 ? cmd[4] : y0;
      if (ch === 'A') { start = { x: x0, y: y0 }; continue; }
      if (ch === 'C') { flags.push({ x: x0, y: y0, on: false, cur: false, wave: 0 }); continue; }
      if (ch === 'G') { goal = { x: x0 * T, y: y0 * T, w: (x1 - x0 + 1) * T, h: (y1 - y0 + 1) * T }; continue; }
      const v = ch === '#' ? 1 : ch === '^' ? 2 : ch === '~' ? 3 : 0;
      for (let y = Math.max(0, y0); y <= Math.min(h - 1, y1); y++) {
        for (let x = Math.max(0, x0); x <= Math.min(w - 1, x1); x++) grid[y * w + x] = v;
      }
    }
    const lv = { def, w, h, pw: w * T, ph: h * T, grid, flags, start, goal, sd: new Int8Array(w * h) };
    // Spikes point away from the ground they sit on: 0 up, 1 down, 2 right, 3 left.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (grid[y * w + x] !== 2) continue;
        let d = 0;
        if (tileOf(lv, x, y + 1) === 1) d = 0;
        else if (tileOf(lv, x, y - 1) === 1) d = 1;
        else if (tileOf(lv, x - 1, y) === 1) d = 2;
        else if (tileOf(lv, x + 1, y) === 1) d = 3;
        lv.sd[y * w + x] = d;
      }
    }
    return lv;
  }

  function tileOf(lv, x, y) {
    if (x < 0 || x >= lv.w) return 1;
    if (y < 0 || y >= lv.h) return 0;
    return lv.grid[y * lv.w + x];
  }

  function spikeBox(x, y, d) {
    const px = x * T;
    const py = y * T;
    if (d === 0) return [px + 5, py + T * 0.45, T - 10, T * 0.55];
    if (d === 1) return [px + 5, py, T - 10, T * 0.55];
    if (d === 2) return [px, py + 5, T * 0.55, T - 10];
    return [px + T * 0.45, py + 5, T * 0.55, T - 10];
  }

  function circleRect(cx, cy, r, b) {
    const nx = U.clamp(cx, b[0], b[0] + b[2]);
    const ny = U.clamp(cy, b[1], b[1] + b[3]);
    return (cx - nx) * (cx - nx) + (cy - ny) * (cy - ny) < r * r;
  }

  function seeded(seed) {
    let s = (seed % 2147483646) + 1;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  const fmt = (n) => n.toFixed(1) + ' s';

  /* A round, squishy blob with a face. o: {sq, ang, lx, ly, happy, blink, oh} */
  function paintBlob(ctx, x, y, r, color, o) {
    const sq = o.sq || 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.ang || 0);
    ctx.scale(1 - sq, 1 + sq * 0.75);
    ctx.fillStyle = U.alpha(C.ink, 0.45);
    ctx.beginPath();
    ctx.arc(0, 0, r + 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x - r * 0.4, y - r * 0.45, r * 0.24, 0, Math.PI * 2);
    ctx.fill();
    const lx = (o.lx || 0) * r * 0.18;
    const ly = (o.ly || 0) * r * 0.18;
    const ey = y - r * 0.12 + ly;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      const cx = x + s * r * 0.34 + lx;
      if (o.happy) {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = Math.max(1.6, r * 0.13);
        ctx.beginPath();
        ctx.arc(cx, ey + r * 0.12, r * 0.19, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.ellipse(cx, ey, r * 0.26, r * 0.29 * (o.blink ? 0.15 : 1), 0, 0, Math.PI * 2);
        ctx.fill();
        if (!o.blink) {
          ctx.fillStyle = C.ink;
          ctx.beginPath();
          ctx.arc(cx + lx * 0.6, ey + ly * 0.6, r * 0.14, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = Math.max(1.3, r * 0.09);
    ctx.beginPath();
    if (o.oh) ctx.arc(x + lx, y + r * 0.4 + ly, r * 0.13, 0, Math.PI * 2);
    else ctx.arc(x + lx, y + r * 0.2 + ly, r * 0.2, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }

  function ropePath(ctx, pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length - 1; k++) {
      const p = pts[k];
      const q = pts[k + 1];
      ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
  }

  function strokeRope(ctx, pts, strain) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ropePath(ctx, pts);
    ctx.strokeStyle = U.alpha(C.ink, 0.85);
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = C.gold;
    ctx.lineWidth = 3.5 - strain * 1.2;
    ctx.stroke();
    if (strain > 0.05) {
      ctx.strokeStyle = 'rgba(255,255,255,' + (strain * 0.6).toFixed(3) + ')';
      ctx.stroke();
    }
  }

  function drawSpikeTile(ctx, px, py, d) {
    ctx.fillStyle = U.alpha(C.p1, 0.28);
    if (d === 0) ctx.fillRect(px + 2, py + T * 0.7, T - 4, T * 0.3);
    else if (d === 1) ctx.fillRect(px + 2, py, T - 4, T * 0.3);
    else if (d === 2) ctx.fillRect(px, py + 2, T * 0.3, T - 4);
    else ctx.fillRect(px + T * 0.7, py + 2, T * 0.3, T - 4);
    ctx.fillStyle = U.alpha(C.text, 0.88);
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = k / 3;
      const b = (k + 1) / 3;
      const m = (k + 0.5) / 3;
      if (d === 0) {
        ctx.moveTo(px + a * T, py + T); ctx.lineTo(px + m * T, py + T * 0.42); ctx.lineTo(px + b * T, py + T);
      } else if (d === 1) {
        ctx.moveTo(px + a * T, py); ctx.lineTo(px + m * T, py + T * 0.58); ctx.lineTo(px + b * T, py);
      } else if (d === 2) {
        ctx.moveTo(px, py + a * T); ctx.lineTo(px + T * 0.58, py + m * T); ctx.lineTo(px, py + b * T);
      } else {
        ctx.moveTo(px + T, py + a * T); ctx.lineTo(px + T * 0.42, py + m * T); ctx.lineTo(px + T, py + b * T);
      }
    }
    ctx.fill();
  }

  function drawFlag(ctx, fx, fy, on, wave, t) {
    ctx.fillStyle = C.muted;
    ctx.fillRect(fx - 2, fy - 58, 4, 58);
    const col = on ? C.gold : C.line;
    if (on) {
      ctx.fillStyle = U.alpha(C.gold, 0.18 + 0.08 * Math.sin(t * 4));
      ctx.beginPath();
      ctx.arc(fx + 12, fy - 46, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(fx + 2, fy - 58);
    const flap = Math.sin(t * 6 + wave) * (on ? 4 : 1.5);
    ctx.quadraticCurveTo(fx + 16, fy - 56 + flap, fx + 30, fy - 49 + flap);
    ctx.quadraticCurveTo(fx + 16, fy - 42 - flap, fx + 2, fy - 38);
    ctx.closePath();
    ctx.fill();
  }

  Arcade.register({
    id: 'rope-pals',
    title: 'Rope Pals',
    category: 'fresh',
    mode: 'together',
    players: '1–2P',
    original: true,
    color: C.p1,
    best: 'low',
    formatScore: (n) => n.toFixed(1) + ' s',
    tagline: 'Two squishy blobs, one stretchy rope: grip, swing and fling through 8 courses.',
    hook: 'Two blobs tied by a stretchy rope: one grips the wall while the other swings and flings.',
    tags: ['co-op', 'physics', 'platformer', 'rope', 'swing', 'puzzle', 'keyboard', 'speedrun', 'original'],
    howTo: 'Coral and Cyan are tied together by a stretchy rope. Each blob rolls, hops (weakly) and can GRIP: hold the grip key ' +
      'while touching any wall, floor, ceiling, lift or windmill blade and that blob sticks fast. The other blob then swings ' +
      'from it like a pendulum: push the way you are swinging to pump it higher (press away from a wall you bump to kick off it), ' +
      'grip something new, and swap roles hand over hand. Let go of a grip mid-swing to fling. While gripping, hold jump to reel ' +
      'your pal in; a pal right next to a gripping pal hops off them for a big boost, so you can inchworm up walls. ' +
      'Water is safe but slow, lifts and windmill blades carry whoever grips them. Spikes and falls send you both back ' +
      'to the last flag (R does it on purpose). Get both blobs into the gate. Your time is the total for all 8 courses. ' +
      'Solo? Play both blobs at once: left hand drives Coral, right hand drives Cyan.',
    controls: [
      { keys: ['A', 'D'], label: 'Coral: roll' },
      { keys: ['W'], label: 'Coral: hop / boost off a gripping pal (while gripping: reel in)' },
      { keys: ['Space'], label: 'Coral: hold to grip' },
      { keys: ['←', '→'], label: 'Cyan: roll' },
      { keys: ['↑'], label: 'Cyan: hop / boost off a gripping pal (while gripping: reel in)' },
      { keys: ['Enter'], label: 'Cyan: hold to grip' },
      { keys: ['R'], label: 'Back to last flag' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const rnd = seeded(7);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = U.alpha(C.text, 0.15 + rnd() * 0.3);
        ctx.fillRect(rnd() * w, rnd() * h * 0.7, 1.5, 1.5);
      }
      ctx.fillStyle = U.alpha(C.panel, 0.9);
      ctx.beginPath();
      ctx.arc(w * 0.72, h * 1.15, h * 0.75, 0, Math.PI * 2);
      ctx.fill();
      // Ground blocks either side of a spike pit.
      const blocks = [[0, 104, 96, 96], [228, 128, 92, 72]];
      for (const bk of blocks) {
        ctx.fillStyle = C.panel2;
        ctx.fillRect(bk[0], bk[1], bk[2], bk[3]);
        ctx.fillStyle = U.alpha(C.violet, 0.7);
        ctx.fillRect(bk[0], bk[1], bk[2], 4);
      }
      ctx.fillStyle = C.panel2;
      ctx.fillRect(96, 188, 132, 12);
      for (let x = 96; x < 228; x += 12) {
        ctx.fillStyle = U.alpha(C.text, 0.85);
        ctx.beginPath();
        ctx.moveTo(x, 188); ctx.lineTo(x + 6, 174); ctx.lineTo(x + 12, 188);
        ctx.fill();
      }
      drawFlag(ctx, 290, 128, true, 0, t);
      // Coral grips the ledge corner; Cyan swings below.
      const ax = 86;
      const ay = 92;
      const ang = 0.85 * Math.cos(t * 2.4) - 0.05;
      const len = 82;
      const bx = ax + Math.sin(ang) * len;
      const by = ay + Math.cos(ang) * len;
      const sag = 6 * (1 - Math.abs(Math.cos(t * 2.4)));
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const f = k / 8;
        pts.push({ x: U.lerp(ax, bx, f), y: U.lerp(ay, by, f) + Math.sin(f * Math.PI) * sag });
      }
      strokeRope(ctx, pts, 0.2);
      ctx.fillStyle = U.alpha(C.ink, 0.6);
      ctx.beginPath();
      ctx.arc(ax - 5, ay + 12, 3.5, 0, Math.PI * 2);
      ctx.arc(ax + 5, ay + 12, 3.5, 0, Math.PI * 2);
      ctx.fill();
      paintBlob(ctx, ax, ay, 14, C.p1, { sq: 0.18, ang: Math.PI / 2, happy: true });
      const swingV = -Math.sin(t * 2.4);
      paintBlob(ctx, bx, by, 14, C.p2, { lx: swingV, ly: 0.3, oh: Math.abs(swingV) > 0.6, sq: -0.08, ang: ang });
      // Motion swoosh.
      ctx.strokeStyle = U.alpha(C.p2, 0.35);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ax, ay, len, Math.PI / 2 - 0.9, Math.PI / 2 + 0.9);
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.font = '800 20px Unbounded, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Rope Pals', 14, 14);
      ctx.fillStyle = C.gold;
      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillText('grip · swing · fling', 16, 42);
    },

    create(stage, api) {
      const { ctx } = api.canvas(W, H);

      let mode = 2;               // 2 = co-op, 1 = one player drives both blobs
      let state = 'menu';         // menu | play | dead | clear | wait
      let li = 0;
      let L = null;
      let movers = [];
      let mills = [];
      let blobs = [];
      let rope = null;
      let cp = null;
      let simT = 0;
      let acc = 0;
      let levelTime = 0;
      let times = [];
      let respawns = 0;
      let clock = 0;
      let deadT = 0;
      let clearT = 0;
      let introT = 0;
      let scoreTick = 0;
      let shake = 0;
      let goalCount = 0;
      let reelBlock = 0;
      let parts = [];
      let stars = [];
      const cam = { x: 0, y: 0 };
      const jumpBuf = [0, 0];
      const hinted = {};

      function hint(key, text) {
        if (hinted[key]) return;
        hinted[key] = true;
        api.setStatus(text);
      }

      const tile = (x, y) => tileOf(L, x, y);

      function makeBlob(i, x, y) {
        return {
          i, x, y, vx: 0, vy: 0, grip: null, touch: 0, cn: null, ground: 0, pvx: 0, pvy: 0,
          water: false, stuck: 0, sq: 0, sqv: 0, ax: 0, ay: -1, blink: 1.5 + Math.random() * 3,
          hitCd: 0, gripFx: 0, alive: true, reel: false, swing: false, dir: 0, kickCd: 0, wallT: 0, wallN: 0
        };
      }

      function spawn() {
        blobs = [makeBlob(0, cp.x - 18, cp.y - BR - 1), makeBlob(1, cp.x + 18, cp.y - BR - 1)];
        rope = { len: ROPE, pts: [] };
        for (let k = 0; k <= RN; k++) {
          const x = U.lerp(blobs[0].x, blobs[1].x, k / RN);
          const y = blobs[0].y + Math.sin((k / RN) * Math.PI) * 30;
          rope.pts.push({ x, y, ox: x, oy: y });
        }
        jumpBuf[0] = 0;
        jumpBuf[1] = 0;
      }

      function setMovers(t) {
        for (const m of movers) {
          const ph = Math.PI * 2 * (t / m.per + m.ph);
          const s = (1 - Math.cos(ph)) / 2;
          const ds = (Math.PI / m.per) * Math.sin(ph);
          m.x = m.x0 + m.dx * s;
          m.y = m.y0 + m.dy * s;
          m.vx = m.dx * ds;
          m.vy = m.dy * ds;
        }
      }

      function snapCamera() {
        const mx = (blobs[0].x + blobs[1].x) / 2;
        const my = (blobs[0].y + blobs[1].y) / 2;
        cam.x = clampCamX(mx - W / 2);
        cam.y = clampCamY(my - H / 2 - 30);
      }
      const clampCamX = (x) => (L.pw <= W ? (L.pw - W) / 2 : U.clamp(x, 0, L.pw - W));
      const clampCamY = (y) => (L.ph <= H ? L.ph - H : U.clamp(y, 0, L.ph - H));

      function loadLevel(i) {
        li = i;
        const def = LEVELS[i];
        L = buildLevel(def);
        movers = (def.movers || []).map((m) => ({
          x0: m.x * T, y0: m.y * T, w: m.w * T, h: (m.h || 0.5) * T, dx: (m.dx || 0) * T, dy: (m.dy || 0) * T,
          per: m.t || 5, ph: m.p || 0, x: 0, y: 0, vx: 0, vy: 0
        }));
        mills = (def.mills || []).map((m) => ({ cx: m.x * T, cy: m.y * T, r: m.r * T, n: m.n || 2, w: m.s || 1.5, a: m.a || 0 }));
        simT = 0;
        acc = 0;
        levelTime = 0;
        parts = [];
        goalCount = 0;
        setMovers(0);
        cp = { x: L.start.x * T + T / 2, y: (L.start.y + 1) * T };
        spawn();
        const rnd = seeded(i * 977 + 13);
        stars = [];
        for (let k = 0; k < 110; k++) {
          stars.push({ x: rnd() * (L.pw * 0.4 + W), y: rnd() * (L.ph * 0.4 + H), r: 0.6 + rnd() * 1.4, tw: rnd() * 6 });
        }
        snapCamera();
        introT = 3;
      }

      /* ---------- anchors (what a gripping blob is stuck to) ---------- */
      function anchorPos(a) {
        if (a.k === 1) return { x: a.m.x + a.ox, y: a.m.y + a.oy };
        if (a.k === 2) {
          const ang = a.m.a + a.phi;
          return { x: a.m.cx + Math.cos(ang) * a.d, y: a.m.cy + Math.sin(ang) * a.d };
        }
        return { x: a.x, y: a.y };
      }
      function anchorVel(a) {
        if (a.k === 1) return { x: a.m.vx, y: a.m.vy };
        if (a.k === 2) {
          const ang = a.m.a + a.phi;
          return { x: -Math.sin(ang) * a.d * a.m.w, y: Math.cos(ang) * a.d * a.m.w };
        }
        return { x: 0, y: 0 };
      }
      function anchorNormal(a) {
        if (a.k === 2) {
          const ang = a.m.a + a.nphi;
          return { x: Math.cos(ang), y: Math.sin(ang) };
        }
        return { x: a.nx, y: a.ny };
      }

      function attach(b) {
        const c = b.cn;
        let a;
        if (c.kind === 1) {
          a = { k: 1, m: c.ref, ox: b.x - c.ref.x, oy: b.y - c.ref.y };
        } else if (c.kind === 2) {
          const m = c.ref;
          a = {
            k: 2, m, d: Math.hypot(b.x - m.cx, b.y - m.cy),
            phi: Math.atan2(b.y - m.cy, b.x - m.cx) - m.a,
            nphi: Math.atan2(c.ny, c.nx) - m.a
          };
        } else {
          a = { k: 0, x: b.x, y: b.y };
        }
        a.nx = c.nx;
        a.ny = c.ny;
        b.grip = a;
        const v = anchorVel(a);
        b.vx = v.x;
        b.vy = v.y;
        b.gripFx = 1;
        b.sqv += 5;
        b.ax = -c.nx;
        b.ay = -c.ny;
        api.sfx('tick');
        const o = blobs[1 - b.i];
        if (c.kind === 2) {
          hint('mill', NAMES[b.i] + ' is riding the windmill. Let go near the top of the spin to fling!');
        } else if (c.kind === 1) {
          hint('moverGrip', NAMES[b.i] + ' is stuck to the lift and rides along.');
        } else {
          hint('grip', NAMES[b.i] + ' is anchored. ' + NAMES[o.i] + ' can swing now: tap ' +
            (o.i ? '←/→' : 'A/D') + ' in rhythm to pump, then grip something.');
        }
      }

      function release(b) {
        const v = anchorVel(b.grip);
        b.vx = v.x;
        b.vy = v.y;
        b.grip = null;
        b.touch = 0;
        const o = blobs[1 - b.i];
        if (Math.hypot(o.vx, o.vy) > 380 || Math.hypot(v.x, v.y) > 200) {
          api.sfx('flip');
          hint('fling', 'Fling! Letting go mid-swing carries the momentum to both of you.');
        }
      }

      /* ---------- input ---------- */
      function heldAny(list) {
        for (const c of list) if (api.keys.has(c)) return true;
        return false;
      }
      function input(i) {
        const k = KEYS[i];
        return {
          dir: (heldAny(k.right) ? 1 : 0) - (heldAny(k.left) ? 1 : 0),
          jump: heldAny(k.jump),
          grip: heldAny(k.grip)
        };
      }

      /* ---------- physics ---------- */
      function contact(b, nx, ny, pen, kind, ref, svx, svy) {
        b.x += nx * pen;
        b.y += ny * pen;
        const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
        if (vn < 0) {
          // Swinging blobs bounce off walls so a pendulum hung beside a wall can still build up.
          const e = b.swing && Math.abs(nx) > 0.5 ? 0.75 : vn < -450 ? 0.22 : 0;
          b.vx -= (1 + e) * vn * nx;
          b.vy -= (1 + e) * vn * ny;
          if (vn < -200) {
            b.sqv += Math.min(10, -vn * 0.012);
            b.ax = nx;
            b.ay = ny;
          }
          if (vn < -480 && b.hitCd <= 0) {
            api.sfx('hit');
            b.hitCd = 0.25;
            dust(b.x - nx * BR, b.y - ny * BR, 6);
          }
          if (ny > -0.55) {
            // Walls and ceilings are a little grabby even without grip.
            const tx = -ny;
            const ty = nx;
            const vt = (b.vx - svx) * tx + (b.vy - svy) * ty;
            b.vx -= tx * vt * 0.02;
            b.vy -= ty * vt * 0.02;
          }
        }
        b.touch = 0.07;
        b.cn = { kind, ref, nx, ny };
        if (Math.abs(nx) > 0.6) { b.wallT = 0.16; b.wallN = Math.sign(nx); }
        if (ny < -0.55) {
          b.ground = 0.09;
          b.pvx = svx;
          b.pvy = svy;
        }
      }

      function rectHit(b, rx, ry, rw, rh, kind, ref, svx, svy) {
        const cx = U.clamp(b.x, rx, rx + rw);
        const cy = U.clamp(b.y, ry, ry + rh);
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= BR * BR) return;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          contact(b, dx / d, dy / d, BR - d, kind, ref, svx, svy);
          return;
        }
        // Centre inside the box: leave by the shortest side.
        const l = b.x - rx;
        const r = rx + rw - b.x;
        const t = b.y - ry;
        const bo = ry + rh - b.y;
        const m = Math.min(l, r, t, bo);
        if (m === t) contact(b, 0, -1, t + BR, kind, ref, svx, svy);
        else if (m === bo) contact(b, 0, 1, bo + BR, kind, ref, svx, svy);
        else if (m === l) contact(b, -1, 0, l + BR, kind, ref, svx, svy);
        else contact(b, 1, 0, r + BR, kind, ref, svx, svy);
      }

      function millHit(b, m) {
        const reach = m.r + BR + 10;
        if ((b.x - m.cx) * (b.x - m.cx) + (b.y - m.cy) * (b.y - m.cy) > reach * reach) return;
        for (let k = 0; k < m.n; k++) {
          const ang = m.a + (k * Math.PI * 2) / m.n;
          const ex = Math.cos(ang);
          const ey = Math.sin(ang);
          const s = U.clamp((b.x - m.cx) * ex + (b.y - m.cy) * ey, 0, m.r);
          const px = m.cx + ex * s;
          const py = m.cy + ey * s;
          let nx = b.x - px;
          let ny = b.y - py;
          const d = Math.hypot(nx, ny);
          const rad = BR + 7;
          if (d >= rad) continue;
          if (d < 1e-4) { nx = -ey; ny = ex; } else { nx /= d; ny /= d; }
          contact(b, nx, ny, rad - d, 2, m, -m.w * (py - m.cy), m.w * (px - m.cx));
        }
      }

      function collideWorld(b) {
        const x0 = Math.floor((b.x - BR) / T);
        const x1 = Math.floor((b.x + BR) / T);
        const y0 = Math.floor((b.y - BR) / T);
        const y1 = Math.floor((b.y + BR) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (tile(tx, ty) === 1) rectHit(b, tx * T, ty * T, T, T, 0, null, 0, 0);
          }
        }
        for (const m of movers) {
          if (b.x + BR > m.x && b.x - BR < m.x + m.w && b.y + BR > m.y && b.y - BR < m.y + m.h) {
            rectHit(b, m.x, m.y, m.w, m.h, 1, m, m.vx, m.vy);
          }
        }
        for (const m of mills) millHit(b, m);
      }

      function collideBlobs() {
        const a = blobs[0];
        const b = blobs[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= BR * 2 || d < 1e-4) return;
        const ia = a.grip ? 0 : 1;
        const ib = b.grip ? 0 : 1;
        const tot = ia + ib;
        if (!tot) return;
        const nx = dx / d;
        const ny = dy / d;
        const pen = BR * 2 - d;
        a.x -= (nx * pen * ia) / tot;
        a.y -= (ny * pen * ia) / tot;
        b.x += (nx * pen * ib) / tot;
        b.y += (ny * pen * ib) / tot;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv < 0) {
          const j = -rv / tot;
          a.vx -= nx * j * ia;
          a.vy -= ny * j * ia;
          b.vx += nx * j * ib;
          b.vy += ny * j * ib;
        }
        // Standing on your pal counts as ground (that is how you climb a two-tile step).
        if (ny < -0.55) { b.ground = 0.09; b.pvx = a.vx; b.pvy = a.vy; }
        if (ny > 0.55) { a.ground = 0.09; a.pvx = b.vx; a.pvy = b.vy; }
      }

      function ropeForce(dt) {
        const a = blobs[0];
        const b = blobs[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d <= rope.len || d < 1e-4) return;
        const nx = dx / d;
        const ny = dy / d;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        const f = Math.max(0, K * (d - rope.len) + KD * rv);
        const ia = a.grip ? 0 : 1;
        const ib = b.grip ? 0 : 1;
        a.vx += nx * f * dt * ia;
        a.vy += ny * f * dt * ia;
        b.vx -= nx * f * dt * ib;
        b.vy -= ny * f * dt * ib;
      }

      function ropeCap() {
        const a = blobs[0];
        const b = blobs[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const max = rope.len + ROPE_SLACK;
        if (d <= max || d < 1e-4) return;
        const ia = a.grip ? 0 : 1;
        const ib = b.grip ? 0 : 1;
        const tot = ia + ib;
        if (!tot) return;
        const nx = dx / d;
        const ny = dy / d;
        const ex = Math.min(6, d - max);
        a.x += (nx * ex * ia) / tot;
        a.y += (ny * ex * ia) / tot;
        b.x -= (nx * ex * ib) / tot;
        b.y -= (ny * ex * ib) / tot;
        const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rv > 0) {
          const j = rv / tot;
          a.vx += nx * j * ia;
          a.vy += ny * j * ia;
          b.vx -= nx * j * ib;
          b.vy -= ny * j * ib;
        }
      }

      function hitSpike(b) {
        const x0 = Math.floor((b.x - BR) / T);
        const x1 = Math.floor((b.x + BR) / T);
        const y0 = Math.floor((b.y - BR) / T);
        const y1 = Math.floor((b.y + BR) / T);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (tile(tx, ty) !== 2) continue;
            if (circleRect(b.x, b.y, BR - 2, spikeBox(tx, ty, L.sd[ty * L.w + tx]))) return true;
          }
        }
        return false;
      }

      /* Pump along the swing: pushing the way you swing adds speed, pushing against it brakes. */
      function pump(b, o, d, dir, dt) {
        const nx = (b.x - o.x) / d;
        const ny = (b.y - o.y) / d;
        let tx = -ny;
        let ty = nx;
        let vt = b.vx * tx + b.vy * ty;
        if (vt < 0) { tx = -tx; ty = -ty; vt = -vt; }
        let sgn;
        if (vt < 40) sgn = tx * dir >= 0 ? 1 : -1;
        else if (Math.abs(tx) < 0.3) sgn = 1;
        else sgn = Math.sign(tx) === dir ? 1 : -1;
        b.vx += tx * sgn * PUMP * dt;
        b.vy += ty * sgn * PUMP * dt;
        hint('pump', 'Pump! Push the way you are swinging to go higher; push against it to brake.');
      }

      function jump(b, o, d, dir) {
        if (!b.water && o.grip && d <= ROPE_MIN + 12) {
          // Boost: push off your anchored pal. Grip, reel in, boost, repeat = inchworm up any wall.
          b.vy = -BOOST;
          b.vx += dir * 120;
          rope.len = ROPE;      // the anchor lets the rope slip so the boost is not yanked back
          reelBlock = 0.45;
          jumpBuf[b.i] = 0;
          b.ground = 0;
          b.sqv -= 5;
          b.ax = 0;
          b.ay = -1;
          api.sfx('flip');
          hint('boost', 'Boost! Hop off your gripping pal, grip higher, swap and repeat to climb any wall.');
        } else if (b.ground > 0) {
          b.vy = Math.min(0, b.pvy) - JUMP;
          b.ground = 0;
          jumpBuf[b.i] = 0;
          b.sqv -= 4;
          b.ax = 0;
          b.ay = -1;
          api.sfx('blip');
        } else if (b.water && b.vy > -200) {
          b.vy = -JUMP * 0.85;
          jumpBuf[b.i] = 0;
          api.sfx('blip');
        }
      }

      function step(dt) {
        simT += dt;
        setMovers(simT);
        for (const m of mills) m.a += m.w * dt;
        const inp = [input(0), input(1)];

        for (const b of blobs) {
          const want = inp[b.i].grip;
          if (want && !b.grip && b.touch > 0 && b.cn) attach(b);
          else if (!want && b.grip) release(b);
        }

        // Reel: a gripping blob holding jump shortens the rope; it pays back out otherwise.
        reelBlock -= dt;
        const reeling = reelBlock <= 0 && blobs.some((b) => b.grip && inp[b.i].jump);
        if (reeling) {
          const d = Math.hypot(blobs[1].x - blobs[0].x, blobs[1].y - blobs[0].y);
          // Never reel faster than the pal can follow: a snagged pal gets a firm tug, not a yank through a wall.
          rope.len = Math.max(ROPE_MIN, d - 14, Math.min(rope.len, d) - REEL_IN * dt);
          hint('reel', 'Reeling in! Once your pal is reeled close, they can hop off you (boost) to climb higher.');
        } else {
          rope.len = Math.min(ROPE, rope.len + REEL_OUT * dt);
        }
        for (const b of blobs) b.reel = !!(b.grip && inp[b.i].jump);

        for (const b of blobs) {
          b.swing = false;
          b.dir = inp[b.i].dir;
          b.kickCd -= dt;
          b.wallT -= dt;
          if (b.grip) { jumpBuf[b.i] = 0; continue; }
          const o = blobs[1 - b.i];
          const ip = inp[b.i];
          const d = Math.hypot(b.x - o.x, b.y - o.y);
          const swinging = o.grip && b.ground <= 0 && !b.water && d > rope.len * 0.85;
          b.swing = swinging;
          if (b.water) {
            b.vx += ip.dir * 700 * dt;
            b.vy -= 380 * dt; // floats up
            const f = Math.exp(-3.2 * dt);
            b.vx *= f;
            b.vy *= f;
          } else if (b.ground > 0) {
            const target = ip.dir * ROLL + b.pvx;
            const lim = (ip.dir ? ROLL_ACC : ROLL_FRIC) * dt;
            b.vx += U.clamp(target - b.vx, -lim, lim);
            b.vy += GRAV * dt;
          } else {
            if (swinging && b.wallT > 0 && ip.dir === b.wallN && b.kickCd <= 0) {
              // Kick off a wall you just touched: how a pal hanging beside a cliff builds a swing.
              b.vx = b.wallN * Math.max(KICK, b.vx * b.wallN + KICK * 0.5);
              b.kickCd = 0.3;
              b.wallT = 0;
              b.sqv += 3;
              hint('kick', 'Wall kick! Press away from a wall while swinging to push off it.');
            }
            if (swinging) {
              if (ip.dir) pump(b, o, d, ip.dir, dt);
            } else if (ip.dir && b.vx * ip.dir < AIR_MAX) {
              b.vx += ip.dir * AIR_ACC * dt;
            }
            b.vy += GRAV * dt;
          }
          if (jumpBuf[b.i] > 0) jump(b, o, d, ip.dir);
        }

        ropeForce(dt);

        for (const b of blobs) {
          if (b.grip) {
            const p = anchorPos(b.grip);
            const v = anchorVel(b.grip);
            b.x = p.x;
            b.y = p.y;
            b.vx = v.x;
            b.vy = v.y;
            continue;
          }
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > MAXV) {
            b.vx *= MAXV / sp;
            b.vy *= MAXV / sp;
          }
          b.x += b.vx * dt;
          b.y += b.vy * dt;
        }

        ropeCap();
        collideBlobs();
        for (const b of blobs) {
          b.ground -= dt;
          b.touch -= dt;
          if (!b.grip) collideWorld(b);
        }

        for (const b of blobs) {
          const wasWater = b.water;
          b.water = tile(Math.floor(b.x / T), Math.floor(b.y / T)) === 3;
          if (b.water && !wasWater) {
            if (b.vy > 150) splash(b.x, b.y);
            hint('water', 'Splash! Water is slow but safe. Tap jump to paddle up and hop out.');
          }
          if (hitSpike(b)) { die(b, 'spike'); return; }
          if (b.y > L.ph + 160) { die(b, 'fall'); return; }
          if (!b.grip && tile(Math.floor(b.x / T), Math.floor(b.y / T)) === 1) {
            b.stuck += dt;
            if (b.stuck > 0.2) { die(b, 'crush'); return; }
          } else {
            b.stuck = 0;
          }
        }

        for (const f of L.flags) {
          if (f.on) continue;
          const fx = f.x * T + T / 2;
          const fy = (f.y + 1) * T;
          if (blobs.some((b) => Math.abs(b.x - fx) < 36 && b.y < fy + 6 && b.y > fy - 90)) {
            L.flags.forEach((g) => { g.cur = false; });
            f.on = true;
            f.cur = true;
            cp = { x: fx, y: fy };
            api.sfx('power');
            burst(fx + 14, fy - 48, C.gold, 14, 160);
            api.setStatus('Checkpoint! Spikes or a fall now send you both back to this flag.');
          }
        }

        const g = L.goal;
        const inside = (b) => b.x > g.x - 4 && b.x < g.x + g.w + 4 && b.y > g.y - 10 && b.y < g.y + g.h + 6;
        goalCount = blobs.filter(inside).length;
        if (goalCount === 2) levelClear();
        else if (goalCount === 1) hint('goal' + li, 'One pal is in the gate. Bring the other one in too!');
      }

      /* ---------- game flow ---------- */
      function die(b, why) {
        if (state !== 'play') return;
        state = 'dead';
        deadT = 0.9;
        respawns++;
        b.alive = false;
        burst(b.x, b.y, b.i ? C.p2 : C.p1, 26, 320);
        shake = 9;
        api.sfx('lose');
        const msg = why === 'spike' ? 'Pop! Spikes send you both back to the last flag.'
          : why === 'crush' ? 'Squished! Back to the last flag.'
            : 'Into the void! You both respawn at the last flag.';
        if (!hinted.die) {
          hinted.die = true;
          api.setStatus(msg + ' The clock keeps running.');
        }
      }

      function manualRespawn() {
        if (state !== 'play') return;
        state = 'dead';
        deadT = 0.4;
        respawns++;
        for (const b of blobs) {
          b.alive = false;
          burst(b.x, b.y, b.i ? C.p2 : C.p1, 10, 160);
        }
        api.sfx('blip');
      }

      function levelClear() {
        state = 'clear';
        clearT = 1.2;
        times[li] = levelTime;
        api.sfx('win');
        const g = L.goal;
        for (let k = 0; k < 4; k++) burst(g.x + g.w / 2, g.y + g.h / 2, [C.gold, C.mint, C.p1, C.p2][k], 10, 380);
        api.setScore(fmt(totalSoFar()));
      }

      function totalSoFar() {
        let s = 0;
        for (let k = 0; k < li; k++) s += times[k] || 0;
        return s + (state === 'clear' || state === 'wait' ? times[li] || 0 : levelTime);
      }

      function showClear() {
        state = 'wait';
        let total = 0;
        for (let k = 0; k <= li; k++) total += times[k] || 0;
        if (li >= LEVELS.length - 1) { finish(total); return; }
        api.setStatus('Course ' + (li + 1) + ' of ' + LEVELS.length + ' cleared.');
        api.menu({
          title: 'Course ' + (li + 1) + ' cleared!',
          text: L.def.name + ' took ' + fmt(times[li]) + ' (running total ' + fmt(total) + '). Next up: ' +
            LEVELS[li + 1].name + '. Play again retries this course; the new time replaces this one.',
          buttons: [
            { label: 'Next level', primary: true, onClick: () => begin(li + 1) },
            { label: 'Play again', onClick: () => begin(li) }
          ]
        });
      }

      function finish(total) {
        state = 'wait';
        const rounded = Math.round(total * 10) / 10;
        const prev = api.best();
        const isBest = api.reportScore(rounded);
        api.setScore(fmt(rounded));
        api.setStatus('All ' + LEVELS.length + ' courses cleared in ' + fmt(rounded) + '.');
        api.menu({
          title: isBest ? 'New best: ' + fmt(rounded) + '!' : 'All ' + LEVELS.length + ' courses cleared!',
          text: 'Total time ' + fmt(rounded) + ' with ' + respawns + ' respawn' + (respawns === 1 ? '' : 's') + '.' +
            (!isBest && prev !== null ? ' Your best is ' + fmt(prev) + '.' : ' The rope held!'),
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startRun(mode) },
            { label: 'Change mode', onClick: showStart }
          ]
        });
      }

      function begin(i) {
        loadLevel(i);
        state = 'play';
        const def = LEVELS[i];
        if (i === 0) {
          api.setStatus(mode === 1
            ? 'Solo: left hand drives Coral (A/D, W, Space), right hand drives Cyan (←/→, ↑, Enter).'
            : 'Co-op: P1 is Coral (A/D, W, Space), P2 is Cyan (←/→, ↑, Enter). ' + def.hint);
        } else {
          api.setStatus(def.hint);
        }
      }

      function startRun(m) {
        mode = m;
        times = [];
        respawns = 0;
        begin(0);
      }

      function showStart() {
        loadLevel(0);
        state = 'menu';
        api.setScore(fmt(0));
        api.setStatus('Hold grip to stick to any surface. Your pal swings from you. Clear 8 courses as fast as you can.');
        api.menu({
          title: 'Rope Pals',
          text: 'Two blobs, one stretchy rope. Hold grip to stick to a wall, ceiling or windmill; the other blob swings, ' +
            'pumps and flings. Solo? Same keys: your left hand plays Coral and your right hand plays Cyan.',
          buttons: [
            { label: '2 players (co-op)', primary: true, onClick: () => startRun(2) },
            { label: '1 player (both blobs)', onClick: () => startRun(1) }
          ]
        });
      }

      /* ---------- particles ---------- */
      function burst(x, y, col, n, spd) {
        for (let k = 0; k < n && parts.length < 500; k++) {
          const a = Math.random() * Math.PI * 2;
          const s = spd * (0.3 + Math.random() * 0.7);
          const life = 0.4 + Math.random() * 0.5;
          parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life, max: life, col, r: 2 + Math.random() * 3, g: 900 });
        }
      }
      function dust(x, y, n) {
        for (let k = 0; k < n && parts.length < 500; k++) {
          const life = 0.3 + Math.random() * 0.3;
          parts.push({ x, y, vx: U.rand(-90, 90), vy: U.rand(-90, -20), life, max: life, col: C.muted, r: 1.5 + Math.random() * 2, g: 200 });
        }
      }
      function splash(x, y) {
        api.sfx('tick');
        for (let k = 0; k < 14 && parts.length < 500; k++) {
          const life = 0.4 + Math.random() * 0.4;
          parts.push({ x: x + U.rand(-10, 10), y, vx: U.rand(-120, 120), vy: U.rand(-320, -120), life, max: life, col: C.p2, r: 2 + Math.random() * 2, g: 1200 });
        }
      }

      /* ---------- per-frame update ---------- */
      function updateRope(dt) {
        const pts = rope.pts;
        const a = blobs[0];
        const b = blobs[1];
        const seg = rope.len / RN;
        const g = 900 * dt * dt;
        for (let k = 1; k < RN; k++) {
          const p = pts[k];
          const vx = (p.x - p.ox) * 0.96;
          const vy = (p.y - p.oy) * 0.96;
          p.ox = p.x;
          p.oy = p.y;
          p.x += vx;
          p.y += vy + g;
        }
        for (let it = 0; it < 10; it++) {
          pts[0].x = a.x; pts[0].y = a.y;
          pts[RN].x = b.x; pts[RN].y = b.y;
          for (let k = 0; k < RN; k++) {
            const p = pts[k];
            const q = pts[k + 1];
            const dx = q.x - p.x;
            const dy = q.y - p.y;
            const d = Math.hypot(dx, dy);
            if (d <= seg || d < 1e-6) continue;
            const diff = (d - seg) / d;
            if (k === 0) { q.x -= dx * diff; q.y -= dy * diff; } else if (k + 1 === RN) { p.x += dx * diff; p.y += dy * diff; } else {
              p.x += dx * diff * 0.5; p.y += dy * diff * 0.5;
              q.x -= dx * diff * 0.5; q.y -= dy * diff * 0.5;
            }
          }
        }
        pts[0].x = a.x; pts[0].y = a.y;
        pts[RN].x = b.x; pts[RN].y = b.y;
      }

      function update(dt) {
        clock += dt;
        if (state === 'play') {
          levelTime += dt;
          acc += dt;
          let n = 0;
          while (acc >= STEP && state === 'play' && n < 8) {
            step(STEP);
            acc -= STEP;
            n++;
          }
          if (n >= 8) acc = 0;
        } else if (state === 'dead') {
          levelTime += dt;
          deadT -= dt;
          if (deadT <= 0) {
            spawn();
            state = 'play';
            acc = 0;
          }
        } else if (state === 'clear') {
          clearT -= dt;
          if (clearT <= 0) showClear();
        }
        jumpBuf[0] = Math.max(0, jumpBuf[0] - dt);
        jumpBuf[1] = Math.max(0, jumpBuf[1] - dt);
        introT = Math.max(0, introT - dt);
        shake = Math.max(0, shake - dt * 30);

        for (const b of blobs) {
          // Jelly wobble around a target squash: flattened while gripping, stretched when flying.
          const sp = Math.hypot(b.vx, b.vy);
          let target = 0;
          if (b.grip) target = 0.2;
          else if (b.ground <= 0 && sp > 300) {
            target = -Math.min(0.18, sp / 5000);
            b.ax = b.vx / sp;
            b.ay = b.vy / sp;
          }
          b.sqv += (-(b.sq - target) * 320 - b.sqv * 11) * dt;
          b.sq += b.sqv * dt;
          b.sq = U.clamp(b.sq, -0.35, 0.45);
          b.blink -= dt;
          if (b.blink < -0.12) b.blink = 1.8 + Math.random() * 3.5;
          b.gripFx = Math.max(0, b.gripFx - dt * 3);
          b.hitCd -= dt;
        }
        if (state !== 'menu') updateRope(dt);

        for (const p of parts) {
          p.vy += p.g * dt;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0);

        // Camera follows the pair's midpoint.
        const mx = (blobs[0].x + blobs[1].x) / 2;
        const my = (blobs[0].y + blobs[1].y) / 2;
        const k = 1 - Math.exp(-5 * dt);
        cam.x += (clampCamX(mx - W / 2) - cam.x) * k;
        cam.y += (clampCamY(my - H / 2 - 30) - cam.y) * k;

        if (state === 'play' || state === 'dead') {
          scoreTick -= dt;
          if (scoreTick <= 0) {
            scoreTick = 0.1;
            api.setScore(fmt(totalSoFar()));
          }
        }
      }

      /* ---------- drawing ---------- */
      function drawBackground() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        for (const s of stars) {
          const sx = s.x - cam.x * 0.35;
          const sy = s.y - cam.y * 0.35;
          if (sx < -4 || sx > W + 4 || sy < -4 || sy > H + 4) continue;
          ctx.fillStyle = U.alpha(C.text, 0.18 + 0.14 * Math.sin(clock * 1.3 + s.tw));
          ctx.fillRect(sx, sy, s.r, s.r);
        }
        const span = 380;
        const off = cam.x * 0.45;
        const first = Math.floor(off / span) - 1;
        ctx.fillStyle = U.alpha(C.panel, 0.75);
        for (let k = first; k < first + 5; k++) {
          const hx = k * span - off;
          const r = 170 + (((k * 73) % 5) + 5) % 5 * 28;
          const hy = H + 90 - (cam.y - (L.ph - H)) * 0.2;
          ctx.beginPath();
          ctx.arc(hx, hy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function drawTiles(x0, y0, x1, y1) {
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            const v = tile(tx, ty);
            if (v !== 1) continue;
            const px = tx * T;
            const py = ty * T;
            ctx.fillStyle = C.panel2;
            ctx.fillRect(px, py, T + 0.5, T + 0.5);
            if (((tx * 7 + ty * 13) % 5 + 5) % 5 === 0) {
              ctx.fillStyle = U.alpha(C.line, 0.9);
              ctx.fillRect(px + 13, py + 19, 3, 3);
            }
            if (tile(tx, ty - 1) !== 1) {
              ctx.fillStyle = U.alpha(C.violet, 0.6);
              ctx.fillRect(px, py, T, 4);
            }
            ctx.fillStyle = C.line;
            if (tile(tx, ty + 1) !== 1) ctx.fillRect(px, py + T - 3, T, 3);
            if (tile(tx - 1, ty) !== 1) ctx.fillRect(px, py, 3, T);
            if (tile(tx + 1, ty) !== 1) ctx.fillRect(px + T - 3, py, 3, T);
          }
        }
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (tile(tx, ty) === 2) drawSpikeTile(ctx, tx * T, ty * T, L.sd[ty * L.w + tx]);
          }
        }
      }

      function drawWater(x0, y0, x1, y1) {
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (tile(tx, ty) !== 3) continue;
            const px = tx * T;
            const py = ty * T;
            const top = tile(tx, ty - 1) !== 3;
            ctx.fillStyle = U.alpha(C.p2, 0.22);
            if (top) {
              ctx.beginPath();
              ctx.moveTo(px, py + T);
              for (let s = 0; s <= 4; s++) {
                const wx = px + (s / 4) * T;
                ctx.lineTo(wx, py + 3 + Math.sin(wx * 0.06 + clock * 3) * 2.5);
              }
              ctx.lineTo(px + T, py + T);
              ctx.closePath();
              ctx.fill();
              ctx.strokeStyle = U.alpha(C.p2, 0.75);
              ctx.lineWidth = 2;
              ctx.beginPath();
              for (let s = 0; s <= 4; s++) {
                const wx = px + (s / 4) * T;
                const wy = py + 3 + Math.sin(wx * 0.06 + clock * 3) * 2.5;
                if (s === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
              }
              ctx.stroke();
            } else {
              ctx.fillRect(px, py, T + 0.5, T + 0.5);
            }
          }
        }
      }

      function drawProps() {
        for (const m of movers) {
          ctx.strokeStyle = U.alpha(C.line, 0.8);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(m.x0 + m.w / 2, m.y0 + m.h / 2);
          ctx.lineTo(m.x0 + m.dx + m.w / 2, m.y0 + m.dy + m.h / 2);
          ctx.stroke();
          ctx.fillStyle = C.violet;
          U.roundRect(ctx, m.x, m.y, m.w, m.h, 6);
          ctx.fill();
          ctx.fillStyle = U.alpha(C.text, 0.35);
          ctx.fillRect(m.x + 6, m.y + 3, m.w - 12, 3);
          ctx.fillStyle = U.alpha(C.ink, 0.35);
          for (let x = m.x + 14; x < m.x + m.w - 8; x += 18) ctx.fillRect(x, m.y + 9, 8, 4);
        }
        for (const m of mills) {
          ctx.strokeStyle = U.alpha(C.muted, 0.12);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, m.r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineCap = 'round';
          for (let k = 0; k < m.n; k++) {
            const ang = m.a + (k * Math.PI * 2) / m.n;
            const ex = m.cx + Math.cos(ang) * m.r;
            const ey = m.cy + Math.sin(ang) * m.r;
            ctx.strokeStyle = U.alpha(C.ink, 0.6);
            ctx.lineWidth = 17;
            ctx.beginPath();
            ctx.moveTo(m.cx, m.cy);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.strokeStyle = C.muted;
            ctx.lineWidth = 13;
            ctx.stroke();
            ctx.strokeStyle = U.alpha(C.violet, 0.8);
            ctx.lineWidth = 3;
            ctx.stroke();
          }
          ctx.fillStyle = C.violet;
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.gold;
          ctx.beginPath();
          ctx.arc(m.cx, m.cy, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const f of L.flags) drawFlag(ctx, f.x * T + T / 2, (f.y + 1) * T, f.on, f.x, clock);

        const g = L.goal;
        const pulse = 0.5 + 0.5 * Math.sin(clock * 3);
        ctx.fillStyle = U.alpha(C.mint, 0.08 + 0.08 * pulse + goalCount * 0.06);
        ctx.fillRect(g.x, g.y, g.w, g.h);
        ctx.fillStyle = C.mint;
        ctx.fillRect(g.x - 6, g.y - 8, 7, g.h + 8);
        ctx.fillRect(g.x + g.w - 1, g.y - 8, 7, g.h + 8);
        U.roundRect(ctx, g.x - 12, g.y - 26, g.w + 24, 20, 7);
        ctx.fill();
        ctx.fillStyle = C.ink;
        ctx.font = '700 12px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('GOAL', g.x + g.w / 2, g.y - 16);
        for (let k = 0; k < 2; k++) {
          ctx.fillStyle = k < goalCount ? C.gold : U.alpha(C.mint, 0.35);
          ctx.beginPath();
          ctx.arc(g.x + g.w / 2 + (k ? 9 : -9), g.y + 12, 5, 0, Math.PI * 2);
          ctx.fill();
        }

        const signs = L.def.signs || [];
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const s of signs) {
          const sx = s[0] * T;
          if (sx < cam.x - 400 || sx > cam.x + W + 400) continue;
          ctx.fillStyle = U.alpha(C.muted, 0.85);
          ctx.fillText(s[2], sx, s[1] * T);
        }
      }

      function drawBlobs() {
        const inp = state === 'play' ? [input(0), input(1)] : null;
        for (const b of blobs) {
          if (!b.alive) continue;
          const col = b.i ? C.p2 : C.p1;
          const o = blobs[1 - b.i];
          if (b.grip) {
            const n = anchorNormal(b.grip);
            const cx = b.x - n.x * (BR - 1);
            const cy = b.y - n.y * (BR - 1);
            ctx.fillStyle = U.alpha(C.ink, 0.65);
            ctx.beginPath();
            ctx.arc(cx - n.y * 7, cy + n.x * 7, 4, 0, Math.PI * 2);
            ctx.arc(cx + n.y * 7, cy - n.x * 7, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          const sp = Math.hypot(b.vx, b.vy);
          let lx;
          let ly;
          if (sp > 60) {
            lx = b.vx / Math.max(sp, 300);
            ly = b.vy / Math.max(sp, 300);
          } else {
            const dx = o.x - b.x;
            const dy = o.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            lx = dx / d * 0.7;
            ly = dy / d * 0.7;
          }
          paintBlob(ctx, b.x, b.y, BR, col, {
            sq: b.sq, ang: Math.atan2(b.ay, b.ax), lx, ly,
            happy: !!b.grip, blink: b.blink < 0, oh: !b.grip && sp > 520
          });
          if (b.gripFx > 0) {
            ctx.strokeStyle = U.alpha(C.gold, b.gripFx);
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BR + 4 + (1 - b.gripFx) * 14, 0, Math.PI * 2);
            ctx.stroke();
          }
          if (inp && inp[b.i].grip && !b.grip) {
            // Grip is held but nothing is touching yet: show a ready ring.
            ctx.strokeStyle = U.alpha(col, 0.85);
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.lineDashOffset = -clock * 20;
            ctx.beginPath();
            ctx.arc(b.x, b.y, BR + 6, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (b.reel) {
            ctx.fillStyle = C.gold;
            ctx.font = '700 12px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('reel', b.x, b.y - BR - 6);
          }
          const showKeys = (li === 0 && levelTime < 8) || introT > 1.2;
          if (showKeys && state !== 'menu') {
            ctx.font = '600 11px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillStyle = U.alpha(col, 0.95);
            ctx.fillText(b.i ? '←→ ↑ Enter' : 'A D W Space', b.x, b.y - BR - (b.reel ? 22 : 8));
          }
        }
      }

      function drawHud() {
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = U.alpha(C.ink, 0.7);
        U.roundRect(ctx, 10, 10, 330, 32, 8);
        ctx.fill();
        ctx.fillStyle = C.text;
        ctx.textAlign = 'left';
        ctx.fillText((li + 1) + '/' + LEVELS.length + '  ' + L.def.name, 22, 27);
        ctx.fillStyle = U.alpha(C.ink, 0.7);
        U.roundRect(ctx, W - 200, 10, 190, 50, 8);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = C.gold;
        ctx.fillText(fmt(state === 'wait' || state === 'clear' ? times[li] || levelTime : levelTime), W - 22, 26);
        ctx.fillStyle = C.muted;
        ctx.font = SMALL;
        ctx.fillText('total ' + fmt(totalSoFar()), W - 22, 46);
        ctx.textAlign = 'left';
        ctx.fillStyle = U.alpha(C.muted, 0.7);
        ctx.fillText((mode === 1 ? 'solo' : 'co-op') + ' · R: back to flag', 14, H - 16);

        if (introT > 0 && state !== 'menu') {
          const a = Math.min(1, introT / 0.6);
          ctx.textAlign = 'center';
          ctx.fillStyle = U.alpha(C.muted, a);
          ctx.font = HUD;
          ctx.fillText('Course ' + (li + 1), W / 2, H * 0.3 - 44);
          ctx.fillStyle = U.alpha(C.text, a);
          ctx.font = BIG;
          ctx.fillText(L.def.name, W / 2, H * 0.3);
        }
        if (state === 'clear' || state === 'wait') {
          ctx.textAlign = 'center';
          ctx.fillStyle = C.mint;
          ctx.font = BIG;
          if (state === 'clear') ctx.fillText('Cleared!', W / 2, H * 0.3);
        }
        if (state === 'dead') {
          ctx.fillStyle = U.alpha(C.p1, Math.min(0.25, deadT * 0.3));
          ctx.fillRect(0, 0, W, H);
        }
      }

      function draw() {
        drawBackground();
        const sx = shake > 0 ? U.rand(-shake, shake) : 0;
        const sy = shake > 0 ? U.rand(-shake, shake) : 0;
        const ox = Math.round(cam.x - sx);
        const oy = Math.round(cam.y - sy);
        ctx.save();
        ctx.translate(-ox, -oy);
        const x0 = Math.floor(ox / T) - 1;
        const x1 = Math.floor((ox + W) / T) + 1;
        const y0 = Math.max(0, Math.floor(oy / T) - 1);
        const y1 = Math.min(L.h - 1, Math.floor((oy + H) / T) + 1);
        drawProps();
        drawTiles(x0, y0, x1, y1);
        if (blobs[0].alive || blobs[1].alive) {
          const d = Math.hypot(blobs[1].x - blobs[0].x, blobs[1].y - blobs[0].y);
          strokeRope(ctx, rope.pts, U.clamp((d - rope.len) / ROPE_SLACK, 0, 1));
        }
        drawBlobs();
        drawWater(x0, y0, x1, y1);
        for (const p of parts) {
          ctx.fillStyle = U.alpha(p.col, Math.max(0, p.life / p.max));
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        drawHud();
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || state !== 'play') return;
        for (let i = 0; i < 2; i++) {
          if (KEYS[i].jump.includes(e.code)) jumpBuf[i] = 0.13;
        }
        if (e.code === 'KeyR') manualRespawn();
      });

      showStart();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
