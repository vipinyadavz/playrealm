/* Turbo Laps — top-down racing where a ghost of your best lap races beside you and beating it fills your nitro. */
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

  const LAPS = 3;
  const STEP = 10;            // track sample spacing (world units)
  const CURB = 9;
  const RUNOFF = 120;         // widest grass strip beyond the curb
  const CAR_R = 13;           // car collision radius
  const TOP = 430;            // top speed on asphalt
  const ACC = 560;
  const BRAKE = 850;
  const REV_TOP = 130;
  const REV_ACC = 320;
  const ROLL = 50;
  const GRIP = 780;           // lateral grip; push past it and the car slides
  const TURN = 2.7;           // yaw rate at full lock
  const A_LAT = 680;          // computer drivers' cornering budget
  const A_BRK = 600;          // computer drivers' braking budget
  const NITRO_BURN = 0.42;    // share of the bar burned per second
  const NITRO_TOP = 1.3;
  const BOOST_TOP = 1.22;
  const PAD_LEN = 64;
  const PAD_W = 40;
  const SUB = 1 / 120;
  const MAX_RACE = 300;
  const SKID_MAX = 1400;
  const ASPHALT = '#34324F';
  const BOT_NAMES = ['Captain Crumb', 'NoodleArm', 'Rusty Spoon', 'Madame Turbo', 'Pixel Pete', 'Gravel Gus', 'Lady Lugnut', 'Sir Skids'];
  const BOT_COLORS = [C.gold, C.mint, C.violet, '#FF9F43'];
  const KEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', nitro: 'Space' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', nitro: 'Enter' }
  ];
  const DIFF = {
    easy: { skill: [0.74, 0.82], top: 0.9, wander: 1, nitro: 0.5, draft: 0.3, delay: 0.5 },
    normal: { skill: [0.86, 0.93], top: 0.96, wander: 0.6, nitro: 0.8, draft: 0.6, delay: 0.3 },
    hard: { skill: [0.95, 1], top: 1, wander: 0.35, nitro: 1, draft: 0.9, delay: 0.15 }
  };

  /* Control points run clockwise; point 0 is the start line. walls = control-segment ranges
     with barriers right at the curb; pads = [control point, side of the road]. */
  const TRACKS = [
    {
      id: 'harbor', name: 'Harbor Loop', blurb: 'wide and flowing, with a walled dip by the docks',
      halfW: 68, seed: 11, deco: 'tree',
      ground: '#0C221C', runoff: '#18412F', runoff2: '#1C4936', barrier: ['#E9E6FF', '#FF5D73'],
      pts: [[800, 268], [1200, 250], [2000, 300], [2350, 600], [2300, 1050], [1900, 1250], [1500, 1050],
        [1100, 1200], [700, 1450], [350, 1300], [250, 800], [400, 300]],
      walls: [[4, 7]],
      pads: [[1, 0.42], [7, -0.42], [10, 0]]
    },
    {
      id: 'canyon', name: 'Canyon Switchback', blurb: 'tight rock walls and a hairpin',
      halfW: 57, seed: 23, deco: 'rock',
      ground: '#21160F', runoff: '#4A3222', runoff2: '#523828', barrier: ['#E2CFAF', '#9A6440'],
      pts: [[600, 266], [900, 250], [1300, 400], [1350, 750], [1030, 820], [770, 1050], [1030, 1280],
        [1600, 1250], [1900, 950], [1800, 600], [2100, 300], [2600, 350], [2700, 900], [2500, 1500],
        [1700, 1650], [800, 1650], [300, 1400], [200, 800], [300, 300]],
      walls: [[2, 7], [8, 10]],
      pads: [[1, -0.4], [12, 0], [14, 0.4]]
    },
    {
      id: 'skyline', name: 'Skyline Sprint', blurb: 'long straights and big braking zones',
      halfW: 62, seed: 37, deco: 'block',
      ground: '#100E26', runoff: '#1F1B45', runoff2: '#24204F', barrier: ['#36C9F0', '#9B7BFF'],
      pts: [[900, 320], [1500, 250], [2700, 350], [2950, 700], [2700, 1000], [2050, 950], [1700, 1060],
        [1680, 1290], [2100, 1450], [2800, 1500], [2900, 1850], [2400, 2050], [1200, 2000], [500, 1900],
        [280, 1460], [560, 1090], [330, 760], [300, 400]],
      walls: [[5, 8], [14, 16]],
      pads: [[1, 0.4], [9, -0.35], [12, 0]]
    }
  ];

  /* Best lap ghosts for this page session: key 'trackId:slot'. */
  const ghostBank = {};
  const built = {};

  /* ---------- Small helpers ---------- */
  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const wrapAngle = (a) => a - TAU * Math.round(a / TAU);
  const wrapS = (ds, L) => ds - L * Math.round(ds / L);
  function fmt(t) {
    if (!(t >= 0) || !isFinite(t)) return '-:--.--';
    const cs = Math.floor(t * 100);
    const m = Math.floor(cs / 6000);
    const s = (cs % 6000) / 100;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  function fmtDelta(d) {
    return (d < 0 ? '−' : '+') + Math.abs(d).toFixed(2);
  }
  const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');

  /* ---------- Track geometry (built once per page, cached) ---------- */
  function catmull(P) {
    const n = P.length;
    const out = [];
    for (let i = 0; i < n; i++) {
      const p0 = P[(i - 1 + n) % n];
      const p1 = P[i];
      const p2 = P[(i + 1) % n];
      const p3 = P[(i + 2) % n];
      // Centripetal Catmull-Rom: no loops or overshoot on uneven spacing.
      const t0 = 0;
      const t1 = t0 + Math.sqrt(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]));
      const t2 = t1 + Math.sqrt(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
      const t3 = t2 + Math.sqrt(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]));
      for (let k = 0; k < 40; k++) {
        const t = t1 + (t2 - t1) * (k / 40);
        const pt = [0, 0];
        for (let c = 0; c < 2; c++) {
          const a1 = (t1 - t) / (t1 - t0) * p0[c] + (t - t0) / (t1 - t0) * p1[c];
          const a2 = (t2 - t) / (t2 - t1) * p1[c] + (t - t1) / (t2 - t1) * p2[c];
          const a3 = (t3 - t) / (t3 - t2) * p2[c] + (t - t2) / (t3 - t2) * p3[c];
          const b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2;
          const b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3;
          pt[c] = (t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2;
        }
        out.push({ x: pt[0], y: pt[1], seg: i });
      }
    }
    return out;
  }

  /* Top speed at which a car can follow curvature k (turn radius and grip limits). */
  function cornerSpeed(k) {
    const ak = Math.abs(k);
    for (let v = TOP * 1.45; v > 60; v -= 5) {
      const omega = TURN * Math.min(1, v / 110) * (1 - 0.28 * Math.min(1, v / TOP)) * 0.92;
      if (v * ak <= omega && v * v * ak <= A_LAT) return v;
    }
    return 60;
  }

  function buildTrack(def) {
    const dense = catmull(def.pts);
    const cum = [0];
    let total = 0;
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1];
      const b = dense[i % dense.length];
      total += Math.hypot(b.x - a.x, b.y - a.y);
      cum.push(total);
    }
    const N = Math.round(total / STEP);
    const step = total / N;
    const L = total;
    const X = new Float32Array(N);
    const Y = new Float32Array(N);
    const SEG = new Uint8Array(N);
    let j = 0;
    for (let i = 0; i < N; i++) {
      const s = i * step;
      while (cum[j + 1] < s) j++;
      const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
      const a = dense[j];
      const b = dense[(j + 1) % dense.length];
      X[i] = a.x + (b.x - a.x) * f;
      Y[i] = a.y + (b.y - a.y) * f;
      SEG[i] = a.seg;
    }
    const TX = new Float32Array(N);
    const TY = new Float32Array(N);
    const NX = new Float32Array(N);
    const NY = new Float32Array(N);
    const K = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      const dx = X[b] - X[a];
      const dy = Y[b] - Y[a];
      const d = Math.hypot(dx, dy) || 1;
      TX[i] = dx / d;
      TY[i] = dy / d;
      NX[i] = -TY[i];      // +N is the driver's right
      NY[i] = TX[i];
    }
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N;
      const b = (i + 3) % N;
      const h1 = Math.atan2(Y[i] - Y[a], X[i] - X[a]);
      const h2 = Math.atan2(Y[b] - Y[i], X[b] - X[i]);
      K[i] = wrapAngle(h2 - h1) / (3 * step); // > 0: turning right
    }
    const hw = def.halfW;
    const maxF = hw + CURB + RUNOFF;
    const wallF = hw + CURB + 10;
    const minF = hw + CURB + 6;
    const FL = new Float32Array(N);
    const FR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const walled = def.walls.some((r) => SEG[i] >= r[0] && SEG[i] < r[1]);
      FL[i] = FR[i] = walled ? wallF : maxF;
    }
    // Where two parts of the track pass close, the fence sits halfway between them.
    const gap = Math.ceil(360 / step);
    const reach = (2 * maxF + 40) * (2 * maxF + 40);
    for (let i = 0; i < N; i++) {
      for (let k = 0; k < N; k++) {
        let ds = Math.abs(i - k);
        if (Math.min(ds, N - ds) < gap) continue;
        const dx = X[k] - X[i];
        const dy = Y[k] - Y[i];
        const d2 = dx * dx + dy * dy;
        if (d2 > reach) continue;
        const lim = Math.sqrt(d2) / 2 - 3;
        if (dx * NX[i] + dy * NY[i] > 0) FR[i] = Math.min(FR[i], lim);
        else FL[i] = Math.min(FL[i], lim);
      }
    }
    // Inside of a corner: keep the fence short of the corner's centre.
    for (let i = 0; i < N; i++) {
      if (K[i] > 1e-4) FR[i] = Math.min(FR[i], 0.9 / K[i]);
      if (K[i] < -1e-4) FL[i] = Math.min(FL[i], 0.9 / -K[i]);
      FL[i] = Math.max(FL[i], minF);
      FR[i] = Math.max(FR[i], minF);
    }
    // Taper fences so barriers funnel in instead of jumping.
    for (const F of [FL, FR]) {
      const src = Float32Array.from(F);
      for (let i = 0; i < N; i++) {
        let m = src[i];
        for (let o = -16; o <= 16; o++) m = Math.min(m, src[(i + o + N) % N] + Math.abs(o) * step * 0.7);
        F[i] = m;
      }
    }
    // Soften the steps left by the corner limits.
    for (const F of [FL, FR]) {
      const src = Float32Array.from(F);
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let o = -5; o <= 5; o++) sum += src[(i + o + N) % N];
        F[i] = Math.min(sum / 11, src[i] + 6);
      }
    }
    // A barrier is drawn where its offset line does not fold over itself.
    const okL = new Uint8Array(N);
    const okR = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      okL[i] = K[i] < 0 && FL[i] > 0.97 / -K[i] ? 0 : 1;
      okR[i] = K[i] > 0 && FR[i] > 0.97 / K[i] ? 0 : 1;
    }
    // Curbs on corners.
    const CB = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (Math.abs(K[i]) > 1 / 420) {
        for (let o = -5; o <= 5; o++) CB[(i + o + N) % N] = 1;
      }
    }
    // Racing line: relax lateral offsets toward the line with the least curvature.
    const lim = hw - 16;
    const lo = new Float32Array(N);
    const hi = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      // Never hug the inside of a hairpin so tightly that the line itself becomes a hairpin.
      const r = 1 / Math.max(1e-6, Math.abs(K[i]));
      lo[i] = K[i] < 0 ? -Math.min(lim, Math.max(0, r - 75)) : -lim;
      hi[i] = K[i] > 0 ? Math.min(lim, Math.max(0, r - 75)) : lim;
    }
    // Ease those limits in and out so the line has no kinks.
    const lo0 = Float32Array.from(lo);
    const hi0 = Float32Array.from(hi);
    for (let i = 0; i < N; i++) {
      for (let o = -20; o <= 20; o++) {
        const k = (i + o + N) % N;
        lo[i] = Math.max(lo[i], lo0[k] - Math.abs(o) * 2.5);
        hi[i] = Math.min(hi[i], hi0[k] + Math.abs(o) * 2.5);
      }
    }
    const RL = new Float32Array(N);
    const px = Float32Array.from(X);
    const py = Float32Array.from(Y);
    for (const [kk, iters] of [[8, 140], [4, 120], [2, 100], [1, 60]]) {
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < N; i++) {
          const a = (i - kk + N) % N;
          const b = (i + kk) % N;
          const a2 = (i - 2 * kk + N) % N;
          const b2 = (i + 2 * kk) % N;
          const mx = (4 * (px[a] + px[b]) - px[a2] - px[b2]) / 6;
          const my = (4 * (py[a] + py[b]) - py[a2] - py[b2]) / 6;
          const o = U.clamp((mx - X[i]) * NX[i] + (my - Y[i]) * NY[i], lo[i], hi[i]);
          px[i] = X[i] + NX[i] * o;
          py[i] = Y[i] + NY[i] * o;
          RL[i] = o;
        }
      }
    }
    // Speed profile along the racing line, with braking zones.
    const VP = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 6 + N) % N;
      const b = (i + 6) % N;
      const h1 = Math.atan2(py[i] - py[a], px[i] - px[a]);
      const h2 = Math.atan2(py[b] - py[i], px[b] - px[i]);
      const da = Math.hypot(px[i] - px[a], py[i] - py[a]) + Math.hypot(px[b] - px[i], py[b] - py[i]);
      VP[i] = cornerSpeed(wrapAngle(h2 - h1) / Math.max(1, da / 2));
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let i = N - 1; i >= 0; i--) {
        const nx = VP[(i + 1) % N];
        VP[i] = Math.min(VP[i], Math.sqrt(nx * nx + 2 * A_BRK * step));
      }
    }
    // Offset outlines used for drawing.
    const mk = () => new Float32Array(N);
    const o = { aLx: mk(), aLy: mk(), aRx: mk(), aRy: mk(), cLx: mk(), cLy: mk(), cRx: mk(), cRy: mk(),
      fLx: mk(), fLy: mk(), fRx: mk(), fRy: mk(), eLx: mk(), eLy: mk(), eRx: mk(), eRy: mk() };
    for (let i = 0; i < N; i++) {
      o.aLx[i] = X[i] - NX[i] * hw; o.aLy[i] = Y[i] - NY[i] * hw;
      o.aRx[i] = X[i] + NX[i] * hw; o.aRy[i] = Y[i] + NY[i] * hw;
      o.cLx[i] = X[i] - NX[i] * (hw + CURB); o.cLy[i] = Y[i] - NY[i] * (hw + CURB);
      o.cRx[i] = X[i] + NX[i] * (hw + CURB); o.cRy[i] = Y[i] + NY[i] * (hw + CURB);
      o.fLx[i] = X[i] - NX[i] * FL[i]; o.fLy[i] = Y[i] - NY[i] * FL[i];
      o.fRx[i] = X[i] + NX[i] * FR[i]; o.fRy[i] = Y[i] + NY[i] * FR[i];
      o.eLx[i] = X[i] - NX[i] * (hw - 5); o.eLy[i] = Y[i] - NY[i] * (hw - 5);
      o.eRx[i] = X[i] + NX[i] * (hw - 5); o.eRy[i] = Y[i] + NY[i] * (hw - 5);
    }
    // First sample of each control segment (pads sit on control points).
    const segStart = [];
    for (let i = 0; i < N; i++) if (segStart[SEG[i]] === undefined) segStart[SEG[i]] = i;
    const pads = def.pads.map(([cp, side]) => {
      const i = segStart[cp] || 0;
      const d = side * hw;
      return { i, s: i * step, d, x: X[i] + NX[i] * d, y: Y[i] + NY[i] * d, ang: Math.atan2(TY[i], TX[i]) };
    });
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i++) {
      x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]);
      y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]);
    }
    // Scenery outside the fences.
    const rnd = mulberry(def.seed);
    const decor = [];
    const tries = Math.round(((x1 - x0 + 700) * (y1 - y0 + 700)) / 9000);
    for (let n = 0; n < tries && decor.length < 420; n++) {
      const x = x0 - 350 + rnd() * (x1 - x0 + 700);
      const y = y0 - 350 + rnd() * (y1 - y0 + 700);
      const r = def.deco === 'block' ? 26 + rnd() * 34 : 12 + rnd() * 16;
      let best = 0;
      let bd = Infinity;
      for (let i = 0; i < N; i += 3) {
        const d2 = (X[i] - x) * (X[i] - x) + (Y[i] - y) * (Y[i] - y);
        if (d2 < bd) { bd = d2; best = i; }
      }
      const side = (x - X[best]) * NX[best] + (y - Y[best]) * NY[best];
      const f = side > 0 ? FR[best] : FL[best];
      if (Math.sqrt(bd) < f + r * 1.5 + 14) continue;
      decor.push({ x, y, r, v: rnd() });
    }
    return { def, N, L, step, hw, maxF, X, Y, TX, TY, NX, NY, K, FL, FR, okL, okR, CB, RL, VP, o, pads, decor,
      box: { x0, y0, x1, y1 }, vis: new Uint8Array(N) };
  }

  function getTrack(i) {
    if (!built[i]) built[i] = buildTrack(TRACKS[i]);
    return built[i];
  }

  /* ---------- Car physics (shared by people and computer drivers) ---------- */
  function stepCar(car, h, hw) {
    const ca = Math.cos(car.a);
    const sa = Math.sin(car.a);
    let vF = car.vx * ca + car.vy * sa;
    let vR = -car.vx * sa + car.vy * ca;
    const ad = Math.abs(car.d);
    const grass = ad > hw + CURB;
    const curb = !grass && ad > hw;
    car.surface = grass ? 2 : curb ? 1 : 0;
    let top = TOP * car.topMul * (grass ? 0.52 : curb ? 0.96 : 1);
    let acc = ACC;
    if (car.boostT > 0) { top *= BOOST_TOP; acc *= 1.6; }
    if (car.nitroOn) { top *= NITRO_TOP; acc *= 1.9; }
    if (car.draft > 0) { top *= 1 + 0.07 * car.draft; acc *= 1 + 0.5 * car.draft; }
    if (car.thr > 0 && vF < top) vF = Math.min(top, vF + acc * car.thr * Math.max(0.15, 1 - vF / top) * h);
    if (car.brk > 0) {
      if (vF > 8) vF -= BRAKE * car.brk * h;
      else if (vF > -REV_TOP) vF -= REV_ACC * car.brk * h;
    }
    if (vF > top) vF = Math.max(top, vF - ((vF - top) * 2.5 + 60) * h);
    if (car.thr <= 0 && car.brk <= 0) {
      const roll = (grass ? 230 : ROLL) * h;
      vF = Math.abs(vF) <= roll ? 0 : vF - Math.sign(vF) * roll;
    }
    const grip = GRIP * (grass ? 0.5 : curb ? 0.9 : 1) * (car.slide > 0.5 ? 0.8 : 1) * h;
    if (Math.abs(vR) > grip) {
      vR -= Math.sign(vR) * grip;
      car.slide = Math.min(1, car.slide + h * 8);
    } else {
      vR = 0;
      car.slide = Math.max(0, car.slide - h * 3);
    }
    car.vx = ca * vF - sa * vR;
    car.vy = sa * vF + ca * vR;
    const sp = Math.abs(vF);
    const gain = TURN * Math.min(1, sp / 110) * (1 - 0.28 * Math.min(1, sp / TOP)) * (grass ? 0.85 : 1);
    car.a = wrapAngle(car.a + car.steer * gain * (vF < 0 ? -1 : 1) * h);
    car.x += car.vx * h;
    car.y += car.vy * h;
  }

  /* Where the car is along the track; returns +1 / -1 when it crosses the start line. */
  function locate(car, T) {
    const N = T.N;
    let best = car.idx;
    let bd = Infinity;
    for (let o = -6; o <= 6; o++) {
      const i = (car.idx + o + N) % N;
      const dx = car.x - T.X[i];
      const dy = car.y - T.Y[i];
      const d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = i; }
    }
    car.idx = best;
    const dx = car.x - T.X[best];
    const dy = car.y - T.Y[best];
    let s = best * T.step + (dx * T.TX[best] + dy * T.TY[best]);
    s = ((s % T.L) + T.L) % T.L;
    car.d = dx * T.NX[best] + dy * T.NY[best];
    const prev = car.s;
    car.prevS = prev;
    car.s = s;
    if (prev > T.L * 0.7 && s < T.L * 0.3) return 1;
    if (prev < T.L * 0.3 && s > T.L * 0.7) return -1;
    return 0;
  }

  /* Computer driver (also the autopilot after a person finishes). */
  function botControl(car, dt, T, cars, D) {
    const ai = car.ai;
    const N = T.N;
    const hw = T.hw;
    if (ai.delay > 0) {
      ai.delay -= dt;
      car.thr = 0; car.brk = 0; car.steer = 0; car.nitroOn = false;
      return;
    }
    if (ai.revT > 0) {
      ai.revT -= dt;
      car.thr = 0; car.brk = 1; car.steer = -ai.revSteer; car.nitroOn = false;
      return;
    }
    const sp = Math.hypot(car.vx, car.vy);
    ai.wanderT -= dt;
    if (ai.wanderT <= 0) {
      ai.wanderT = U.rand(1.5, 3.5);
      ai.wander = U.rand(-1, 1) * hw * 0.22 * D.wander;
    }
    let target = T.RL[(car.idx + 8) % N] + ai.wander;
    let block = null;
    let blockDs = Infinity;
    let tow = null;
    for (const o of cars) {
      if (o === car) continue;
      const ds = wrapS(o.s - car.s, T.L);
      if (ds <= 0 || ds > 260) continue;
      const dd = Math.abs(o.d - car.d);
      if (ds < 85 && dd < 30) {
        if (ds < blockDs) { block = o; blockDs = ds; }
      } else if (ds >= 85 && dd < 70 && !tow) {
        tow = o;
      }
    }
    if (block) {
      const side = car.d >= block.d ? 1 : -1;
      let t = block.d + side * 34;
      if (Math.abs(t) > hw - 14) t = block.d - side * 34;
      target = t;
    } else if (tow && ai.drafty && T.VP[(car.idx + 20) % N] > TOP) {
      target = tow.d; // tuck into the slipstream
    }
    target = U.clamp(target, -(hw - 14), hw - 14);
    ai.off += (target - ai.off) * Math.min(1, dt * 2.2);
    const look = 50 + sp * 0.3;
    const ia = (car.idx + Math.round(look / T.step)) % N;
    const tx = T.X[ia] + T.NX[ia] * ai.off;
    const ty = T.Y[ia] + T.NY[ia] * ai.off;
    const err = wrapAngle(Math.atan2(ty - car.y, tx - car.x) - car.a);
    car.steer = U.clamp(err * 2.4, -1, 1);
    let vt = T.VP[(car.idx + 2) % N] * ai.skill;
    if (block && blockDs < 45 && Math.abs(block.d - car.d) < 24) vt = Math.min(vt, Math.hypot(block.vx, block.vy) * 0.98);
    if (Math.abs(err) > 1.2) vt = Math.min(vt, 160);
    const vF = car.vx * Math.cos(car.a) + car.vy * Math.sin(car.a);
    car.thr = vF < vt - 3 ? 1 : 0;
    car.brk = vF > vt + 22 ? 1 : 0;
    let straight = car.nitro > 0.02 && ai.useNitro && Math.abs(err) < 0.3;
    if (straight) {
      for (let k = 0; k < 36; k += 3) {
        if (T.VP[(car.idx + k) % N] < TOP * 1.2) { straight = false; break; }
      }
    }
    car.nitroOn = straight;
  }

  /* ---------- Drawing helpers ---------- */
  function drawCar(ctx, x, y, a, color, o) {
    const opt = o || {};
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    if (opt.ghost) ctx.globalAlpha = opt.alpha == null ? 0.4 : opt.alpha;
    if (!opt.ghost) {
      ctx.fillStyle = 'rgba(5,4,15,0.45)';
      U.roundRect(ctx, -14, -5.5, 32, 17, 6);
      ctx.fill();
    }
    if (opt.flame > 0) {
      const fl = 10 + opt.flame * 14 + Math.random() * 7;
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
    ctx.fillStyle = opt.ghost ? U.alpha(C.text, 0.6) : '#0B0A18';
    ctx.fillRect(-12, -10, 8, 4);
    ctx.fillRect(-12, 6, 8, 4);
    ctx.fillRect(6, -10, 8, 4);
    ctx.fillRect(6, 6, 8, 4);
    ctx.fillStyle = color;
    U.roundRect(ctx, -16, -8, 32, 16, 6);
    ctx.fill();
    if (opt.ghost) {
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
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
    if (opt.brake) {
      ctx.fillStyle = '#FF2E4D';
      ctx.fillRect(-16.5, -7, 2, 3);
      ctx.fillRect(-16.5, 4, 2, 3);
    }
    ctx.restore();
  }

  function bezierPt(p, u) {
    const v = 1 - u;
    const x = v * v * v * p[0] + 3 * v * v * u * p[2] + 3 * v * u * u * p[4] + u * u * u * p[6];
    const y = v * v * v * p[1] + 3 * v * v * u * p[3] + 3 * v * u * u * p[5] + u * u * u * p[7];
    const dx = 3 * v * v * (p[2] - p[0]) + 6 * v * u * (p[4] - p[2]) + 3 * u * u * (p[6] - p[4]);
    const dy = 3 * v * v * (p[3] - p[1]) + 6 * v * u * (p[5] - p[3]) + 3 * u * u * (p[7] - p[5]);
    return { x, y, a: Math.atan2(dy, dx) };
  }

  Arcade.register({
    id: 'turbo-laps',
    title: 'Turbo Laps',
    category: 'sports',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.p2,
    tagline: 'Race three laps of a twisty top-down track against four rivals.',
    hook: 'A ghost of your best lap races beside you, and beating it fills your nitro.',
    tags: ['racing', 'cars', 'driving', 'ghost', 'nitro', 'time trial', 'split screen', 'versus', 'sports',
      'keyboard', 'computer opponent'],
    howTo: 'Race three laps against four computer drivers. Hold forward to drive, back to brake or reverse, and steer ' +
      'with left and right; grass slows you down and gold pads give a quick boost. Your first lap sets a ghost car. ' +
      'From then on the ghost replays your best lap right beside you: cross the line ahead of it to fill your nitro ' +
      'bar and set a new ghost. Hold your action key to burn nitro on a straight. Tuck in behind another car to ' +
      'slipstream past it. With 2 players the screen splits and each player chases their own ghost.',
    controls: [
      { keys: ['W', 'A', 'S', 'D'], label: 'Coral: drive and steer' },
      { keys: ['Space'], label: 'Coral: nitro' },
      { keys: ['↑', '←', '↓', '→'], label: 'Cyan: drive and steer' },
      { keys: ['Enter'], label: 'Cyan: nitro' },
      { keys: ['Hold'], label: 'Drive toward the pointer (1 player)' },
      { keys: ['Tap bar'], label: 'Nitro burst (1 player)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = '#18412F';
      ctx.fillRect(0, 0, 320, 200);
      ctx.fillStyle = '#1C4936';
      for (let i = -4; i < 12; i++) {
        ctx.beginPath();
        ctx.moveTo(i * 40, 0);
        ctx.lineTo(i * 40 + 20, 0);
        ctx.lineTo(i * 40 + 80, 200);
        ctx.lineTo(i * 40 + 60, 200);
        ctx.fill();
      }
      const P = [-30, 178, 110, 196, 120, 40, 350, 52];
      const road = () => {
        ctx.beginPath();
        ctx.moveTo(P[0], P[1]);
        ctx.bezierCurveTo(P[2], P[3], P[4], P[5], P[6], P[7]);
      };
      ctx.lineCap = 'butt';
      road();
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 92;
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([12, 12]);
      road();
      ctx.strokeStyle = C.p1;
      ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      road();
      ctx.strokeStyle = ASPHALT;
      ctx.lineWidth = 78;
      ctx.stroke();
      // Start line.
      const sl = bezierPt(P, 0.3);
      ctx.save();
      ctx.translate(sl.x, sl.y);
      ctx.rotate(sl.a);
      for (let k = -39; k < 39; k += 6.5) {
        for (let r = 0; r < 2; r++) {
          ctx.fillStyle = (Math.round((k + 39) / 6.5) + r) % 2 ? C.text : C.ink;
          ctx.fillRect(r * 6.5 - 6.5, k, 6.5, 6.5);
        }
      }
      ctx.restore();
      // The ghost of your best lap, a nose behind; you pull ahead and nitro fires.
      const u = 0.5 + ((t * 0.08) % 0.3);
      const gp = bezierPt(P, u - 0.05);
      const g2 = { x: gp.x + Math.cos(gp.a + Math.PI / 2) * 18, y: gp.y + Math.sin(gp.a + Math.PI / 2) * 18 };
      ctx.save();
      ctx.translate(g2.x, g2.y);
      ctx.scale(1.25, 1.25);
      drawCar(ctx, 0, 0, gp.a, C.p1, { ghost: true, alpha: 0.42 });
      ctx.restore();
      const pp = bezierPt(P, u);
      const p2 = { x: pp.x - Math.cos(pp.a + Math.PI / 2) * 18, y: pp.y - Math.sin(pp.a + Math.PI / 2) * 18 };
      ctx.save();
      ctx.translate(p2.x, p2.y);
      ctx.scale(1.25, 1.25);
      drawCar(ctx, 0, 0, pp.a, C.p1, { flame: 1 });
      ctx.restore();
      // HUD bits: ghost delta and a full nitro bar.
      ctx.fillStyle = U.alpha(C.ink, 0.82);
      U.roundRect(ctx, 10, 10, 128, 30, 9);
      ctx.fill();
      ctx.font = HUD;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = C.muted;
      ctx.fillText('GHOST', 20, 26);
      ctx.fillStyle = C.mint;
      ctx.fillText('−0.42', 76, 26);
      ctx.fillStyle = U.alpha(C.ink, 0.82);
      U.roundRect(ctx, 10, 160, 150, 30, 9);
      ctx.fill();
      ctx.fillStyle = U.alpha(C.p2, 0.25);
      U.roundRect(ctx, 18, 168, 134, 14, 6);
      ctx.fill();
      const fill = 0.55 + 0.45 * Math.abs(Math.sin(t * 1.3 + 1.2));
      ctx.fillStyle = C.p2;
      U.roundRect(ctx, 18, 168, 134 * fill, 14, 6);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = SMALL;
      ctx.fillText('NITRO', 24, 176);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'count' | 'race' | 'done'
      let players = 1;
      let diff = 'normal';
      let trackIdx = 0;
      let T = getTrack(0);
      let cars = [];
      let humans = [];
      let views = [];
      let order = [];
      let raceT = 0;
      let countT = 0;
      let goT = 0;
      let endT = 0;
      let waitT = 0;
      let clock = 0;
      let finishCount = 0;
      let parts = [];
      let pointer = null;
      let hitSfxT = 0;
      let lastScore = '';
      const told = {};
      const skid = new Float32Array(SKID_MAX * 4);
      const skidKind = new Uint8Array(SKID_MAX);
      let skidN = 0;
      let skidHead = 0;

      function hint(key, text) {
        if (told[key]) return false;
        told[key] = true;
        api.setStatus(text);
        return true;
      }
      const who = (car) => (players > 1 ? car.name + ': ' : '');
      const ghostKey = (car) => T.def.id + ':' + car.slot;

      /* ---------- Setup ---------- */
      function gridPos(k) {
        const row = Math.floor(k / 2);
        const col = k % 2;
        const s = T.L - 34 - row * 54 - col * 27;
        const i = Math.floor(s / T.step) % T.N;
        const d = (col ? 1 : -1) * T.hw * 0.42;
        return { i, s, d, x: T.X[i] + T.NX[i] * d, y: T.Y[i] + T.NY[i] * d, a: Math.atan2(T.TY[i], T.TX[i]) };
      }

      function makeCar(name, color, slot, k) {
        const g = gridPos(k);
        return {
          name, color, slot, x: g.x, y: g.y, a: g.a, vx: 0, vy: 0,
          steer: 0, thr: 0, brk: 0, nitroOn: false, nitro: 0, burst: 0, boostT: 0, padCd: 0, topMul: 1,
          idx: g.i, s: g.s, d: g.d, c: 0, maxC: 0, prog: g.s - T.L, pos: k + 1,
          lapStart: 0, laps: [], best: null, finished: false, finishT: 0,
          slide: 0, draft: 0, surface: 0, slowT: 0, wrongT: 0,
          skid: null, rec: null, banner: null, flash: 0, auto: false, ai: null, view: null
        };
      }

      function makeAi(skill, D) {
        return { skill, off: 0, wander: 0, wanderT: 0, drafty: Math.random() < D.draft, useNitro: Math.random() < D.nitro,
          delay: U.rand(0.05, D.delay), revT: 0, revSteer: 1 };
      }

      const newRec = () => ({ t: [], x: [], y: [], a: [], p: [] });
      const lapP = (car) => (car.c >= 1 ? car.s : car.s - T.L);

      function startRace() {
        T = getTrack(trackIdx);
        const D = DIFF[diff];
        const names = U.shuffle(BOT_NAMES.slice()).slice(0, 4);
        const colors = U.shuffle(BOT_COLORS.slice());
        cars = [];
        humans = [];
        for (let b = 0; b < 4; b++) {
          const car = makeCar(names[b], colors[b], -1, b);
          // Front of the grid gets the gentler drivers so the field mixes.
          const skill = D.skill[0] + (D.skill[1] - D.skill[0]) * ((b + Math.random() * 0.8) / 3.8);
          car.ai = makeAi(skill, D);
          car.topMul = D.top;
          cars.push(car);
        }
        for (let p = 0; p < players; p++) {
          const car = makeCar(players === 1 ? 'You' : p === 0 ? 'Coral' : 'Cyan', p === 0 ? C.p1 : C.p2, p, 4 + p);
          car.ai = makeAi(0.86, DIFF.normal);
          car.ai.delay = 0;
          car.ai.useNitro = false;
          car.rec = newRec();
          humans.push(car);
          cars.push(car);
        }
        if (players === 1) {
          views = [{ x: 0, y: 0, w: W, h: H, car: humans[0], base: 0.95 }];
        } else {
          views = [
            { x: 0, y: 0, w: W / 2 - 3, h: H, car: humans[0], base: 0.72 },
            { x: W / 2 + 3, y: 0, w: W / 2 - 3, h: H, car: humans[1], base: 0.72 }
          ];
        }
        views.forEach((v) => {
          v.cam = { x: v.car.x, y: v.car.y, z: v.base, shake: 0 };
          v.car.view = v;
        });
        order = cars.slice();
        parts = [];
        skidN = 0;
        skidHead = 0;
        raceT = 0;
        countT = 3.2;
        goT = 0;
        endT = 0;
        waitT = 0;
        finishCount = 0;
        pointer = null;
        lastScore = '';
        state = 'count';
        api.sfx('tick');
        const ghosts = humans.map((hc) => ghostBank[ghostKey(hc)]);
        if (ghosts.some((g) => g)) {
          api.setStatus(players === 1
            ? 'Your ghost here: ' + fmt(ghosts[0].time) + '. Beat it on any lap to fill your nitro.'
            : 'Each player races their own ghost. Beat it on any lap to fill your nitro.');
        } else {
          api.setStatus('Lap 1 sets your ghost. Beat it on a later lap to fill your nitro.');
        }
        updateScore();
      }

      /* ---------- Menus ---------- */
      function showStartMenu() {
        state = 'menu';
        api.setStatus('A ghost of your best lap races beside you. Beat it to fill your nitro.');
        api.menu({
          title: 'Turbo Laps',
          text: 'Three laps against four computer drivers. Beat your own ghost lap to fill your nitro.',
          buttons: [
            { label: '1 player', primary: true, onClick: () => { players = 1; showTrackMenu(); } },
            { label: '2 players', onClick: () => { players = 2; showTrackMenu(); } }
          ]
        });
      }

      function showTrackMenu() {
        const lines = TRACKS.map((tr) => {
          const g = ghostBank[tr.id + ':0'];
          return tr.name + ': ' + tr.blurb + (g ? ' (ghost ' + fmt(g.time) + ')' : '') + '.';
        });
        api.menu({
          title: 'Pick a track',
          text: lines.join(' '),
          buttons: TRACKS.map((tr, i) => ({
            label: tr.name, primary: i === trackIdx, onClick: () => { trackIdx = i; showDiffMenu(); }
          }))
        });
      }

      function showDiffMenu() {
        api.menu({
          title: 'Rival speed',
          text: players === 1
            ? 'W A S D or arrows to drive, Space or Enter for nitro. You can also hold the mouse where you want to go.'
            : 'Coral: W A S D and Space. Cyan: arrows and Enter. Both of you start at the back.',
          buttons: [
            { label: 'Easy', onClick: () => { diff = 'easy'; startRace(); } },
            { label: 'Normal', primary: true, onClick: () => { diff = 'normal'; startRace(); } },
            { label: 'Hard', onClick: () => { diff = 'hard'; startRace(); } }
          ]
        });
      }

      function showResults() {
        state = 'done';
        humans.forEach((hc) => { hc.auto = true; });
        const fin = cars.filter((c) => c.finished).sort((a, b) => a.finishT - b.finishT);
        const rest = cars.filter((c) => !c.finished).sort((a, b) => b.prog - a.prog);
        const final = fin.concat(rest);
        final.forEach((c, i) => { c.pos = i + 1; });
        order = final;
        const list = final.map((c, i) => (i + 1) + '. ' + c.name + ' ' + (c.finished ? fmt(c.finishT) : '(still racing)')).join(' · ');
        let title;
        if (players === 1) {
          const me = humans[0];
          title = me.pos === 1 ? 'You win!' : 'You finished ' + ordinal(me.pos);
          api.sfx(me.pos <= 3 ? 'win' : 'lose');
        } else {
          const w = humans[0].pos < humans[1].pos ? humans[0] : humans[1];
          title = w.name + ' wins!';
          api.sfx('win');
        }
        const bests = humans.map((hc) => {
          const g = ghostBank[ghostKey(hc)];
          return (players > 1 ? hc.name + ' best lap ' : 'Best lap ') + fmt(hc.best) + (g ? ', ghost ' + fmt(g.time) : '');
        }).join('. ');
        api.setStatus(T.def.name + ': ' + bests + '.');
        api.menu({
          title,
          text: list + '. ' + bests + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: startRace },
            { label: 'Next track', onClick: () => { trackIdx = (trackIdx + 1) % TRACKS.length; startRace(); } },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n && parts.length < 420; i++) {
          const a = Math.random() * TAU;
          const v = speed * U.rand(0.2, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * U.rand(0.6, 1), max: life,
            color, size: size * U.rand(0.6, 1.3) });
        }
      }

      function addSkid(x1, y1, x2, y2, kind) {
        const k = skidHead;
        skid[k * 4] = x1;
        skid[k * 4 + 1] = y1;
        skid[k * 4 + 2] = x2;
        skid[k * 4 + 3] = y2;
        skidKind[k] = kind;
        skidHead = (skidHead + 1) % SKID_MAX;
        skidN = Math.min(SKID_MAX, skidN + 1);
      }

      function banner(car, text, sub, color) {
        car.banner = { text, sub, color, t: 0 };
      }

      function shake(car, amt) {
        if (car.view) car.view.cam.shake = Math.max(car.view.cam.shake, amt);
      }

      function bumpSound() {
        if (hitSfxT > 0) return;
        hitSfxT = 0.14;
        api.sfx('hit');
      }

      /* ---------- Race logic ---------- */
      function respawn(car) {
        const i = (car.idx + 2) % T.N;
        car.x = T.X[i];
        car.y = T.Y[i];
        car.a = Math.atan2(T.TY[i], T.TX[i]);
        car.vx = 0;
        car.vy = 0;
        car.slide = 0;
        car.slowT = 0;
        car.wrongT = 0;
        car.skid = null;
        const cross = locate(car, T);
        if (cross) onCross(car, cross, raceT);
        car.prog = (car.c - 1) * T.L + car.s;
        burst(car.x, car.y, C.text, 14, 120, 0.5, 3);
        if (car.slot >= 0 && !car.auto) banner(car, 'Back on track', '', C.text);
      }

      function finish(car, t) {
        car.finished = true;
        car.finishT = t;
        finishCount++;
        car.pos = finishCount;
        if (car.slot >= 0) {
          car.auto = true;
          car.nitroOn = false;
          banner(car, ordinal(finishCount) + ' place!', 'Finished in ' + fmt(t), finishCount === 1 ? C.gold : car.color);
          api.sfx(finishCount === 1 ? 'win' : 'score');
          burst(car.x, car.y, C.gold, 30, 220, 0.8, 4);
        }
      }

      function humanLap(car, lap, lapsDone) {
        const key = ghostKey(car);
        const ghost = ghostBank[key];
        pushRec(car, lap, T.L);
        const next = lapsDone >= LAPS ? '' : lapsDone === LAPS - 1 ? 'Final lap' : 'Lap ' + (lapsDone + 1);
        if (!ghost) {
          ghostBank[key] = saveRec(car.rec, lap);
          banner(car, next || 'Lap ' + fmt(lap), 'Ghost set: ' + fmt(lap), C.text);
          if (!hint('set' + car.slot, who(car) + 'Ghost set at ' + fmt(lap) + '. Finish your next lap ahead of it to fill your nitro.')) {
            api.setStatus(who(car) + 'Ghost set at ' + fmt(lap) + '.');
          }
        } else if (lap < ghost.time) {
          const gain = lap - ghost.time;
          ghostBank[key] = saveRec(car.rec, lap);
          car.nitro = 1;
          car.flash = 1;
          api.sfx('power');
          burst(car.x, car.y, C.p2, 28, 240, 0.7, 4);
          banner(car, 'Ghost beaten!', fmtDelta(gain) + ' s · nitro full', C.mint);
          if (!hint('beat' + car.slot, who(car) + 'Ghost beaten by ' + Math.abs(gain).toFixed(2) + ' s! Nitro is full: hold ' +
            (car.slot === 1 ? 'Enter' : 'Space') + ' to burn it on a straight.')) {
            api.setStatus(who(car) + 'New ghost: ' + fmt(lap) + '. Nitro full.');
          }
        } else {
          banner(car, next || 'Lap ' + fmt(lap), 'Ghost kept: ' + fmtDelta(lap - ghost.time) + ' s', C.p1);
          if (!hint('slow' + car.slot, who(car) + 'The ghost was ' + (lap - ghost.time).toFixed(2) +
            ' s faster. Watch the ghost delta in the corner: green means you are ahead.')) {
            api.setStatus(who(car) + 'Lap ' + fmt(lap) + ', ghost ' + fmt(ghost.time) + '.');
          }
        }
        car.best = car.best === null ? lap : Math.min(car.best, lap);
        car.rec = newRec();
      }

      function botLap(car, lap) {
        // Computer drivers chase their own best lap too: beating it fills their nitro.
        if (car.best !== null && lap < car.best) {
          car.nitro = 1;
          car.flash = 1;
        }
        car.best = car.best === null ? lap : Math.min(car.best, lap);
      }

      function onCross(car, dir, tCross) {
        if (dir < 0) {
          car.c--;
          return;
        }
        car.c++;
        if (car.c <= car.maxC) return;
        car.maxC = car.c;
        // The first crossing just after the start is part of lap 1; after the results nothing counts.
        if (car.c < 2 || state !== 'race') return;
        const lap = tCross - car.lapStart;
        car.lapStart = tCross;
        car.laps.push(lap);
        const done = car.c - 1;
        if (car.slot >= 0 && !car.finished) humanLap(car, lap, done);
        else if (car.slot < 0) botLap(car, lap);
        if (done >= LAPS && !car.finished) finish(car, tCross);
      }

      function pushRec(car, tau, p) {
        const r = car.rec;
        if (!r) return;
        r.t.push(tau);
        r.x.push(car.x);
        r.y.push(car.y);
        r.a.push(car.a);
        r.p.push(p);
      }

      function saveRec(rec, time) {
        const n = rec.t.length;
        const g = { time, n, t: Float32Array.from(rec.t), x: Float32Array.from(rec.x), y: Float32Array.from(rec.y),
          a: Float32Array.from(rec.a), p: new Float32Array(n) };
        let m = -Infinity;
        for (let i = 0; i < n; i++) {
          m = Math.max(m, rec.p[i]);
          g.p[i] = m;
        }
        return g;
      }

      function ghostAt(g, tau) {
        if (!g || !g.n) return null;
        const n = g.n;
        if (tau <= g.t[0]) return { x: g.x[0], y: g.y[0], a: g.a[0], end: false };
        if (tau >= g.t[n - 1]) return { x: g.x[n - 1], y: g.y[n - 1], a: g.a[n - 1], end: true };
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (g.t[mid] <= tau) lo = mid; else hi = mid;
        }
        const f = (tau - g.t[lo]) / ((g.t[hi] - g.t[lo]) || 1);
        return { x: g.x[lo] + (g.x[hi] - g.x[lo]) * f, y: g.y[lo] + (g.y[hi] - g.y[lo]) * f,
          a: g.a[lo] + wrapAngle(g.a[hi] - g.a[lo]) * f, end: false };
      }

      /* Seconds you are behind (+) or ahead (−) of your ghost at this point of the lap. */
      function ghostDelta(car) {
        const g = ghostBank[ghostKey(car)];
        if (!g || !g.n || car.finished) return null;
        const p = lapP(car);
        const tau = raceT - car.lapStart;
        if (p < 40 || tau < 1 || p > g.p[g.n - 1]) return null;
        let lo = 0;
        let hi = g.n - 1;
        if (p <= g.p[0]) return tau - g.t[0];
        while (hi - lo > 1) {
          const mid = (lo + hi) >> 1;
          if (g.p[mid] <= p) lo = mid; else hi = mid;
        }
        const f = (p - g.p[lo]) / ((g.p[hi] - g.p[lo]) || 1);
        return tau - (g.t[lo] + (g.t[hi] - g.t[lo]) * f);
      }

      /* ---------- Input ---------- */
      function humanControl(car, dt) {
        const k = api.keys;
        const maps = players === 1 ? KEYS : [KEYS[car.slot]];
        let up = false;
        let down = false;
        let left = false;
        let right = false;
        let nitro = false;
        maps.forEach((m) => {
          up = up || k.has(m.up);
          down = down || k.has(m.down);
          left = left || k.has(m.left);
          right = right || k.has(m.right);
          nitro = nitro || k.has(m.nitro);
        });
        const anyKey = up || down || left || right;
        if (pointer && players === 1 && !anyKey) {
          const v = views[0];
          const wx = v.cam.x + (pointer.x - (v.x + v.w / 2)) / v.cam.z;
          const wy = v.cam.y + (pointer.y - (v.y + v.h / 2)) / v.cam.z;
          const err = wrapAngle(Math.atan2(wy - car.y, wx - car.x) - car.a);
          car.steer = U.clamp(err * 2.2, -1, 1);
          const far = Math.hypot(wx - car.x, wy - car.y) > 40;
          car.thr = far && Math.abs(err) < 2.3 ? 1 : 0;
          car.brk = far && Math.abs(err) >= 2.3 ? 1 : 0;
        } else {
          car.thr = up ? 1 : 0;
          car.brk = down ? 1 : 0;
          const want = (right ? 1 : 0) - (left ? 1 : 0);
          car.steer += (want - car.steer) * Math.min(1, dt * 9);
        }
        car.burst = Math.max(0, car.burst - dt);
        car.nitroOn = car.nitro > 0 && (nitro || car.burst > 0);
      }

      const nitroRect = () => ({ x: 12, y: H - 56, w: 236, h: 44 });

      api.on(canvas, 'pointerdown', (e) => {
        if (players !== 1 || (state !== 'race' && state !== 'count') || !humans[0]) return;
        const p = api.toCanvas(e, canvas);
        const r = nitroRect();
        if (p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h) {
          if (humans[0].nitro > 0) humans[0].burst = 1.2;
          return;
        }
        pointer = p;
      });
      api.on(window, 'pointermove', (e) => {
        if (pointer) pointer = api.toCanvas(e, canvas);
      });
      api.on(window, 'pointerup', () => { pointer = null; });
      api.on(window, 'pointercancel', () => { pointer = null; });

      /* ---------- Update ---------- */
      function computeDraft() {
        for (const a of cars) {
          a.draft = 0;
          if (Math.hypot(a.vx, a.vy) < 180) continue;
          const fx = Math.cos(a.a);
          const fy = Math.sin(a.a);
          for (const b of cars) {
            if (b === a) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const along = dx * fx + dy * fy;
            if (along < 30 || along > 170) continue;
            if (Math.abs(-dx * fy + dy * fx) > 24) continue;
            a.draft = Math.max(a.draft, 1 - (along - 30) / 140);
          }
        }
      }

      function fence(car) {
        const i = car.idx;
        const fr = T.FR[i] - CAR_R;
        const fl = T.FL[i] - CAR_R;
        let nx = 0;
        let ny = 0;
        let pen = 0;
        if (car.d > fr) {
          pen = car.d - fr;
          nx = T.NX[i];
          ny = T.NY[i];
        } else if (car.d < -fl) {
          pen = -fl - car.d;
          nx = -T.NX[i];
          ny = -T.NY[i];
        }
        if (pen <= 0) return;
        car.x -= nx * pen;
        car.y -= ny * pen;
        car.d += car.d > 0 ? -pen : pen;
        const vn = car.vx * nx + car.vy * ny;
        if (vn > 0) {
          car.vx -= 1.3 * vn * nx;
          car.vy -= 1.3 * vn * ny;
          const k = 1 - 0.3 * Math.min(1, vn / 260);
          car.vx *= k;
          car.vy *= k;
          if (vn > 90) {
            burst(car.x + nx * CAR_R, car.y + ny * CAR_R, C.gold, Math.min(12, 3 + (vn / 40) | 0), 160, 0.35, 2.5);
            if (car.slot >= 0) {
              bumpSound();
              shake(car, Math.min(7, vn / 50));
            }
          }
        }
      }

      function pads(car, h) {
        car.padCd -= h;
        car.boostT = Math.max(0, car.boostT - h);
        if (car.padCd > 0) return;
        for (const p of T.pads) {
          if (Math.abs(wrapS(car.s - p.s, T.L)) < PAD_LEN / 2 && Math.abs(car.d - p.d) < PAD_W / 2 + 4) {
            car.boostT = 0.9;
            car.padCd = 0.6;
            car.vx += Math.cos(car.a) * 90;
            car.vy += Math.sin(car.a) * 90;
            if (car.slot >= 0 && !car.auto) {
              api.sfx('power');
              burst(car.x, car.y, C.gold, 14, 160, 0.4, 3);
              hint('pad', 'Boost pad! Gold chevrons give a short burst of speed.');
            }
            return;
          }
        }
      }

      function collideCars() {
        for (let i = 0; i < cars.length; i++) {
          for (let j = i + 1; j < cars.length; j++) {
            const a = cars[i];
            const b = cars[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const d2 = dx * dx + dy * dy;
            const min = CAR_R * 2;
            if (d2 >= min * min || d2 < 1e-6) continue;
            const d = Math.sqrt(d2);
            const nx = dx / d;
            const ny = dy / d;
            const push = (min - d) / 2;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
            if (rel < 0) {
              const imp = -1.3 * rel / 2;
              a.vx -= imp * nx;
              a.vy -= imp * ny;
              b.vx += imp * nx;
              b.vy += imp * ny;
              if (-rel > 70 && (a.slot >= 0 || b.slot >= 0)) {
                bumpSound();
                burst((a.x + b.x) / 2, (a.y + b.y) / 2, C.text, 6, 120, 0.3, 2);
                if (a.slot >= 0) shake(a, 3);
                if (b.slot >= 0) shake(b, 3);
              }
            }
          }
        }
      }

      function frameCar(car, dt) {
        const sp = Math.hypot(car.vx, car.vy);
        car.flash = Math.max(0, car.flash - dt * 1.5);
        if (car.banner) {
          car.banner.t += dt;
          if (car.banner.t > 2.2) car.banner = null;
        }
        if (car.nitroOn) {
          car.nitro = Math.max(0, car.nitro - NITRO_BURN * dt);
          if (car.nitro <= 0) car.nitroOn = false;
        }
        // Skid marks and smoke.
        const marking = (car.slide > 0.35 && sp > 60) || (car.surface === 2 && sp > 90);
        if (marking) {
          const ca = Math.cos(car.a);
          const sa = Math.sin(car.a);
          const rx = car.x - ca * 10;
          const ry = car.y - sa * 10;
          const lx = rx + sa * 7;
          const ly = ry - ca * 7;
          const qx = rx - sa * 7;
          const qy = ry + ca * 7;
          const kind = car.surface === 2 ? 1 : 0;
          if (car.skid) {
            addSkid(car.skid[0], car.skid[1], lx, ly, kind);
            addSkid(car.skid[2], car.skid[3], qx, qy, kind);
          }
          car.skid = [lx, ly, qx, qy];
          if (Math.random() < dt * 14 && parts.length < 420) {
            parts.push({ x: rx, y: ry, vx: U.rand(-20, 20), vy: U.rand(-20, 20), life: 0.6, max: 0.6,
              color: kind ? '#7A5A3A' : '#B8B3D9', size: U.rand(5, 9), puff: true });
          }
        } else {
          car.skid = null;
        }
        if (state === 'race' || state === 'done') {
          car.slowT = sp < 25 ? car.slowT + dt : 0;
          const along = car.vx * T.TX[car.idx] + car.vy * T.TY[car.idx];
          car.wrongT = along < -40 ? car.wrongT + dt : Math.max(0, car.wrongT - dt * 2);
          if (car.slot >= 0 && !car.auto) {
            if (car.slowT > 3.5) hint('stuck', 'Stuck? Hold S or ↓ to reverse. You get put back on the track after a few seconds.');
            if (car.slowT > 7) respawn(car);
            if (car.wrongT > 1 && (!car.banner || car.banner.text !== 'Wrong way!')) banner(car, 'Wrong way!', 'Turn around', C.p1);
          } else {
            if (car.slowT > 1.4 && car.ai.revT <= 0 && car.ai.delay <= 0) {
              car.ai.revT = 0.9;
              car.ai.revSteer = car.steer >= 0 ? 1 : -1;
              car.slowT = 0.5;
              car.ai.stuck = (car.ai.stuck || 0) + 1;
            }
            if (car.ai.stuck > 3 || car.wrongT > 3) {
              car.ai.stuck = 0;
              respawn(car);
            }
          }
        }
        if (sp > 100 && car.ai) car.ai.stuck = 0;
      }

      function updateCam(v, dt) {
        const car = v.car;
        const cam = v.cam;
        const sp = Math.hypot(car.vx, car.vy);
        const tx = car.x + car.vx * 0.33;
        const ty = car.y + car.vy * 0.33;
        const k = Math.min(1, dt * 3.5);
        cam.x += (tx - cam.x) * k;
        cam.y += (ty - cam.y) * k;
        const tz = v.base * (1 - 0.14 * Math.min(1.3, sp / TOP));
        cam.z += (tz - cam.z) * Math.min(1, dt * 1.5);
        cam.shake = Math.max(0, cam.shake - dt * 20);
      }

      function updateScore() {
        let s;
        if (players === 1 && humans[0]) {
          const me = humans[0];
          s = 'P' + me.pos + '/' + cars.length + '  Lap ' + U.clamp(me.c, 1, LAPS) + '/' + LAPS;
        } else if (humans.length === 2) {
          s = 'Coral P' + humans[0].pos + ' · Cyan P' + humans[1].pos;
        } else {
          s = '';
        }
        if (s !== lastScore) {
          lastScore = s;
          api.setScore(s);
        }
      }

      function update(dt) {
        clock += dt;
        hitSfxT -= dt;
        for (const p of parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - Math.min(1, dt * 3);
          p.vy *= 1 - Math.min(1, dt * 3);
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0);
        views.forEach((v) => updateCam(v, dt));
        if (state === 'count') {
          const prev = Math.ceil(countT);
          countT -= dt;
          if (countT <= 0) {
            state = 'race';
            goT = 0.9;
            api.sfx('blip');
          } else if (Math.ceil(countT) !== prev && Math.ceil(countT) <= 3) {
            api.sfx('tick');
          }
          return;
        }
        if (state !== 'race' && state !== 'done') return;
        goT = Math.max(0, goT - dt);
        const D = DIFF[diff];
        for (const car of cars) {
          if (car.slot >= 0 && !car.auto) humanControl(car, dt);
          else botControl(car, dt, T, cars, car.slot >= 0 ? DIFF.normal : D);
        }
        computeDraft();
        const n = Math.max(1, Math.ceil(dt / SUB));
        const h = dt / n;
        for (let k = 0; k < n; k++) {
          for (const car of cars) {
            stepCar(car, h, T.hw);
            const cross = locate(car, T);
            if (cross) {
              // Interpolate the moment the nose crossed the line inside this substep.
              let frac = 1;
              if (cross > 0) {
                const before = T.L - car.prevS;
                frac = U.clamp(before / Math.max(1e-6, before + car.s), 0, 1);
              }
              onCross(car, cross, raceT + h * frac);
            }
            car.prog = (car.c - 1) * T.L + car.s;
            fence(car);
            pads(car, h);
          }
          collideCars();
          raceT += h;
        }
        for (const car of cars) {
          frameCar(car, dt);
          if (car.rec && !car.finished && state === 'race') pushRec(car, raceT - car.lapStart, lapP(car));
          if (car.draft > 0.3 && car.slot >= 0 && !car.auto && car.c >= 2) hint('draft', 'Slipstream: tucked in behind a car you go faster. Pull out to pass.');
        }
        if (state === 'race') {
          order = cars.slice().sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished) return a.finishT - b.finishT;
            return b.prog - a.prog;
          });
          order.forEach((c, i) => { c.pos = i + 1; });
          updateScore();
          const allHumans = humans.every((hc) => hc.finished);
          if (allHumans) {
            endT += dt;
            if (endT > 4.5 || cars.every((c) => c.finished)) showResults();
          } else if (humans.some((hc) => hc.finished)) {
            waitT += dt;
            if (waitT > 30) showResults();
          }
          if (state === 'race' && raceT > MAX_RACE) showResults();
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

      function quad(ax, ay, bx, by, i, j) {
        ctx.moveTo(ax[i], ay[i]);
        ctx.lineTo(ax[j], ay[j]);
        ctx.lineTo(bx[j], by[j]);
        ctx.lineTo(bx[i], by[i]);
        ctx.closePath();
      }

      function drawDecor(d, kind) {
        if (kind === 'tree') {
          ctx.fillStyle = 'rgba(3,10,8,0.45)';
          ctx.beginPath();
          ctx.arc(d.x + 5, d.y + 6, d.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = d.v < 0.5 ? '#123A29' : '#164430';
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#1F5A3E';
          ctx.beginPath();
          ctx.arc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.5, 0, TAU);
          ctx.fill();
        } else if (kind === 'rock') {
          ctx.fillStyle = 'rgba(8,4,2,0.4)';
          ctx.beginPath();
          ctx.arc(d.x + 5, d.y + 5, d.r, 0, TAU);
          ctx.fill();
          ctx.fillStyle = d.v < 0.5 ? '#4A3427' : '#55402F';
          ctx.beginPath();
          for (let k = 0; k < 7; k++) {
            const a = (k / 7) * TAU + d.v * 3;
            const rr = d.r * (0.75 + 0.25 * Math.sin(k * 2.3 + d.v * 9));
            ctx.lineTo(d.x + Math.cos(a) * rr, d.y + Math.sin(a) * rr);
          }
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#6B513C';
          ctx.beginPath();
          ctx.arc(d.x - d.r * 0.25, d.y - d.r * 0.3, d.r * 0.35, 0, TAU);
          ctx.fill();
        } else {
          const s = d.r;
          ctx.fillStyle = 'rgba(0,0,0,0.4)';
          ctx.fillRect(d.x - s / 2 + 8, d.y - s / 2 + 8, s, s);
          ctx.fillStyle = '#1B1840';
          ctx.fillRect(d.x - s / 2, d.y - s / 2, s, s);
          ctx.strokeStyle = U.alpha(d.v < 0.5 ? C.p2 : C.violet, 0.55);
          ctx.lineWidth = 2;
          ctx.strokeRect(d.x - s / 2, d.y - s / 2, s, s);
          ctx.fillStyle = U.alpha(d.v < 0.33 ? C.gold : C.text, 0.35);
          for (let k = 0; k < 3; k++) ctx.fillRect(d.x - s / 2 + 6 + k * (s / 3), d.y - 2, 4, 4);
        }
      }

      function drawTrack(bx0, by0, bx1, by1) {
        const def = T.def;
        const o = T.o;
        const N = T.N;
        ctx.fillStyle = def.ground;
        ctx.fillRect(bx0 - 20, by0 - 20, bx1 - bx0 + 40, by1 - by0 + 40);
        for (const d of T.decor) {
          if (d.x + d.r < bx0 - 10 || d.x - d.r > bx1 + 10 || d.y + d.r < by0 - 10 || d.y - d.r > by1 + 10) continue;
          drawDecor(d, def.deco);
        }
        const m = T.maxF + 40;
        const vis = T.vis;
        let any = false;
        for (let i = 0; i < N; i++) {
          const v = T.X[i] > bx0 - m && T.X[i] < bx1 + m && T.Y[i] > by0 - m && T.Y[i] < by1 + m ? 1 : 0;
          vis[i] = v;
          if (v) any = true;
        }
        if (!any) return;
        const seg = (i) => vis[i] || vis[(i + 1) % N];
        // Run-off.
        ctx.fillStyle = def.runoff;
        ctx.beginPath();
        for (let i = 0; i < N; i++) if (seg(i)) quad(o.fLx, o.fLy, o.fRx, o.fRy, i, (i + 1) % N);
        ctx.fill();
        ctx.fillStyle = def.runoff2;
        ctx.beginPath();
        for (let i = 0; i < N; i++) if ((i >> 3) & 1 && seg(i)) quad(o.fLx, o.fLy, o.fRx, o.fRy, i, (i + 1) % N);
        ctx.fill();
        // Barriers along every fence, striped.
        ctx.lineWidth = 7;
        ctx.lineCap = 'butt';
        for (let pass = 0; pass < 2; pass++) {
          ctx.strokeStyle = def.barrier[pass];
          ctx.beginPath();
          for (let i = 0; i < N; i++) {
            if (((i >> 1) & 1) !== pass || !seg(i)) continue;
            const j = (i + 1) % N;
            if (T.okL[i] && T.okL[j]) {
              ctx.moveTo(o.fLx[i], o.fLy[i]);
              ctx.lineTo(o.fLx[j], o.fLy[j]);
            }
            if (T.okR[i] && T.okR[j]) {
              ctx.moveTo(o.fRx[i], o.fRy[i]);
              ctx.lineTo(o.fRx[j], o.fRy[j]);
            }
          }
          ctx.stroke();
        }
        // Curbs.
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? C.text : C.p1;
          ctx.beginPath();
          for (let i = 0; i < N; i++) {
            if (!T.CB[i] || ((i >> 1) & 1) !== pass || !seg(i)) continue;
            const j = (i + 1) % N;
            quad(o.aLx, o.aLy, o.cLx, o.cLy, i, j);
            quad(o.aRx, o.aRy, o.cRx, o.cRy, i, j);
          }
          ctx.fill();
        }
        // Asphalt.
        ctx.fillStyle = ASPHALT;
        ctx.beginPath();
        for (let i = 0; i < N; i++) if (seg(i)) quad(o.aLx, o.aLy, o.aRx, o.aRy, i, (i + 1) % N);
        ctx.fill();
        ctx.strokeStyle = 'rgba(233,230,255,0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          if (!seg(i)) continue;
          const j = (i + 1) % N;
          ctx.moveTo(o.eLx[i], o.eLy[i]);
          ctx.lineTo(o.eLx[j], o.eLy[j]);
          ctx.moveTo(o.eRx[i], o.eRy[i]);
          ctx.lineTo(o.eRx[j], o.eRy[j]);
        }
        ctx.stroke();
        // Start / finish line and grid boxes.
        if (vis[0] || vis[N - 1]) {
          ctx.save();
          ctx.translate(T.X[0], T.Y[0]);
          ctx.rotate(Math.atan2(T.TY[0], T.TX[0]));
          const sq = 8;
          for (let k = -T.hw, n = 0; k < T.hw; k += sq, n++) {
            for (let r = 0; r < 2; r++) {
              ctx.fillStyle = (n + r) % 2 ? C.text : C.ink;
              ctx.fillRect(r * sq - sq, k, sq, Math.min(sq, T.hw - k));
            }
          }
          ctx.restore();
        }
        ctx.strokeStyle = 'rgba(233,230,255,0.45)';
        ctx.lineWidth = 2;
        for (let k = 0; k < 6; k++) {
          const g = gridPos(k);
          if (!vis[g.i]) continue;
          ctx.save();
          ctx.translate(g.x, g.y);
          ctx.rotate(g.a);
          ctx.beginPath();
          ctx.moveTo(-6, -13);
          ctx.lineTo(20, -13);
          ctx.lineTo(20, 13);
          ctx.lineTo(-6, 13);
          ctx.stroke();
          ctx.restore();
        }
        // Boost pads.
        for (const p of T.pads) {
          if (!vis[p.i]) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.ang);
          ctx.fillStyle = U.alpha(C.gold, 0.2);
          U.roundRect(ctx, -PAD_LEN / 2, -PAD_W / 2, PAD_LEN, PAD_W, 6);
          ctx.fill();
          ctx.strokeStyle = U.alpha(C.gold, 0.8);
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.lineWidth = 4;
          ctx.lineJoin = 'round';
          for (let c = 0; c < 3; c++) {
            const ph = (clock * 2 + c / 3) % 1;
            const x = -PAD_LEN / 2 + 10 + ph * (PAD_LEN - 24);
            ctx.strokeStyle = U.alpha(C.gold, 0.25 + 0.75 * Math.sin(ph * Math.PI));
            ctx.beginPath();
            ctx.moveTo(x, -PAD_W / 2 + 8);
            ctx.lineTo(x + 9, 0);
            ctx.lineTo(x, PAD_W / 2 - 8);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      function drawSkids() {
        if (!skidN) return;
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        for (let kind = 0; kind < 2; kind++) {
          ctx.strokeStyle = kind ? 'rgba(70,46,24,0.5)' : 'rgba(8,6,18,0.5)';
          ctx.beginPath();
          for (let k = 0; k < skidN; k++) {
            if (skidKind[k] !== kind) continue;
            ctx.moveTo(skid[k * 4], skid[k * 4 + 1]);
            ctx.lineTo(skid[k * 4 + 2], skid[k * 4 + 3]);
          }
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }

      function drawGhost(car) {
        if (state !== 'race' || car.finished) return;
        const g = ghostBank[ghostKey(car)];
        if (!g) return;
        const gp = ghostAt(g, raceT - car.lapStart);
        if (!gp) return;
        const a = gp.end ? 0.15 : 0.42;
        drawCar(ctx, gp.x, gp.y, gp.a, car.color, { ghost: true, alpha: a });
      }

      function drawCarObj(car) {
        const sp = Math.hypot(car.vx, car.vy);
        if (car.draft > 0.15 && sp > 150) {
          ctx.strokeStyle = U.alpha(C.text, 0.35 * car.draft);
          ctx.lineWidth = 1.5;
          const ca = Math.cos(car.a);
          const sa = Math.sin(car.a);
          ctx.beginPath();
          for (let k = -1; k <= 1; k += 2) {
            const off = 12 * k + Math.sin(clock * 30 + k) * 2;
            const bx = car.x - sa * off;
            const by = car.y + ca * off;
            ctx.moveTo(bx + ca * 14, by + sa * 14);
            ctx.lineTo(bx - ca * 30, by - sa * 30);
          }
          ctx.stroke();
        }
        if (car.flash > 0) {
          ctx.fillStyle = U.alpha(C.p2, car.flash * 0.35);
          ctx.beginPath();
          ctx.arc(car.x, car.y, 24 + (1 - car.flash) * 20, 0, TAU);
          ctx.fill();
        }
        const flame = car.nitroOn ? 1 : car.boostT > 0 ? 0.5 : 0;
        drawCar(ctx, car.x, car.y, car.a, car.color, { flame, brake: car.brk > 0 && sp > 20 });
      }

      function drawWorld(v) {
        const cam = v.cam;
        const z = cam.z;
        const sx = cam.shake > 0 ? U.rand(-cam.shake, cam.shake) : 0;
        const sy = cam.shake > 0 ? U.rand(-cam.shake, cam.shake) : 0;
        ctx.save();
        ctx.beginPath();
        ctx.rect(v.x, v.y, v.w, v.h);
        ctx.clip();
        ctx.translate(v.x + v.w / 2 + sx, v.y + v.h / 2 + sy);
        ctx.scale(z, z);
        ctx.translate(-cam.x, -cam.y);
        const hx = v.w / 2 / z;
        const hy = v.h / 2 / z;
        drawTrack(cam.x - hx, cam.y - hy, cam.x + hx, cam.y + hy);
        drawSkids();
        if (v.car) drawGhost(v.car);
        for (const p of parts) {
          if (!p.puff) continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max) * 0.35;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - p.life / p.max), 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (const car of cars) drawCarObj(car);
        for (const p of parts) {
          if (p.puff) continue;
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        // Name tags in screen space.
        ctx.save();
        ctx.beginPath();
        ctx.rect(v.x, v.y, v.w, v.h);
        ctx.clip();
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const placed = [];
        for (const car of cars) {
          if (car === v.car || state === 'count') continue;
          const px = v.x + v.w / 2 + (car.x - cam.x) * z;
          let py = v.y + v.h / 2 + (car.y - cam.y) * z - 26;
          if (px < v.x - 60 || px > v.x + v.w + 60 || py < v.y - 20 || py > v.y + v.h + 20) continue;
          const label = car.nitroOn ? car.name + ' · nitro' : car.name;
          const tw = label.length * 7.4 + 12;
          // Stack tags that would overlap.
          for (let tries = 0; tries < 4; tries++) {
            const hit = placed.some((r) => Math.abs(r.x - px) < (r.w + tw) / 2 && Math.abs(r.y - py) < 19);
            if (!hit) break;
            py -= 20;
          }
          placed.push({ x: px, y: py, w: tw });
          ctx.fillStyle = U.alpha(C.ink, 0.7);
          U.roundRect(ctx, px - tw / 2, py - 9, tw, 18, 9);
          ctx.fill();
          ctx.fillStyle = car.nitroOn ? C.p2 : car.color;
          ctx.fillText(label, px, py);
        }
        ctx.restore();
      }

      function drawNitro(x, y, w, h, car) {
        ctx.fillStyle = U.alpha(C.ink, 0.8);
        U.roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.strokeStyle = car.nitro >= 1 && Math.sin(clock * 6) > 0 ? C.p2 : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = SMALL;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.p2;
        ctx.fillText('NITRO', x + 12, y + h / 2);
        const bx = x + 64;
        const bw = w - 76;
        ctx.fillStyle = U.alpha(C.p2, 0.16);
        U.roundRect(ctx, bx, y + 12, bw, h - 24, 6);
        ctx.fill();
        if (car.nitro > 0) {
          ctx.fillStyle = car.nitroOn ? C.text : C.p2;
          U.roundRect(ctx, bx, y + 12, Math.max(8, bw * car.nitro), h - 24, 6);
          ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.textAlign = 'center';
          ctx.fillText(car.nitroOn ? 'BURNING' : players === 1 ? 'HOLD SPACE' : car.slot === 0 ? 'HOLD SPACE' : 'HOLD ENTER', bx + bw / 2, y + h / 2);
        } else {
          ctx.fillStyle = C.muted;
          ctx.textAlign = 'center';
          ctx.fillText('beat your ghost', bx + bw / 2, y + h / 2);
        }
      }

      function drawMinimap(x, y, w, h) {
        ctx.fillStyle = U.alpha(C.ink, 0.78);
        U.roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        const b = T.box;
        const pad = 12;
        const s = Math.min((w - pad * 2) / (b.x1 - b.x0), (h - pad * 2) / (b.y1 - b.y0));
        const ox = x + w / 2 - ((b.x0 + b.x1) / 2) * s;
        const oy = y + h / 2 - ((b.y0 + b.y1) / 2) * s;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i <= T.N; i += 6) {
          const k = i % T.N;
          if (i === 0) ctx.moveTo(ox + T.X[k] * s, oy + T.Y[k] * s);
          else ctx.lineTo(ox + T.X[k] * s, oy + T.Y[k] * s);
        }
        ctx.closePath();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 6;
        ctx.stroke();
        ctx.strokeStyle = U.alpha(C.muted, 0.8);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = C.text;
        ctx.fillRect(ox + T.X[0] * s - 1.5, oy + T.Y[0] * s - 5, 3, 10);
        for (const hc of humans) {
          if (state !== 'race' || hc.finished) continue;
          const gp = ghostAt(ghostBank[ghostKey(hc)], raceT - hc.lapStart);
          if (!gp) continue;
          ctx.strokeStyle = U.alpha(C.text, 0.8);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(ox + gp.x * s, oy + gp.y * s, 4, 0, TAU);
          ctx.stroke();
        }
        for (let i = order.length - 1; i >= 0; i--) {
          const c = order[i];
          const r = c.slot >= 0 ? 5 : 3.5;
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(ox + c.x * s, oy + c.y * s, r, 0, TAU);
          ctx.fill();
          if (c.slot >= 0) {
            ctx.strokeStyle = C.text;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }
      }

      function drawBoard(x, y, w) {
        const rowH = 22;
        const h = order.length * rowH + 14;
        ctx.fillStyle = U.alpha(C.ink, 0.78);
        U.roundRect(ctx, x, y, w, h, 12);
        ctx.fill();
        ctx.font = SMALL;
        ctx.textBaseline = 'middle';
        const lead = order[0];
        order.forEach((c, i) => {
          const ry = y + 7 + i * rowH + rowH / 2;
          if (c.slot >= 0) {
            ctx.fillStyle = U.alpha(c.color, 0.18);
            U.roundRect(ctx, x + 4, ry - rowH / 2 + 1, w - 8, rowH - 2, 7);
            ctx.fill();
          }
          ctx.textAlign = 'left';
          ctx.fillStyle = C.muted;
          ctx.fillText(String(i + 1), x + 10, ry);
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(x + 30, ry, 4.5, 0, TAU);
          ctx.fill();
          ctx.fillStyle = c.slot >= 0 ? C.text : U.alpha(C.text, 0.85);
          ctx.fillText(c.name.length > 13 ? c.name.slice(0, 12) + '…' : c.name, x + 40, ry);
          ctx.textAlign = 'right';
          ctx.fillStyle = C.muted;
          let gap = '';
          if (c.finished) gap = fmt(c.finishT);
          else if (i > 0 && !lead.finished) gap = '+' + Math.max(0, (lead.prog - c.prog) / 330).toFixed(1);
          else if (i > 0) gap = 'lap ' + U.clamp(c.c, 1, LAPS);
          ctx.fillText(gap, x + w - 10, ry);
        });
      }

      function drawHud(v) {
        const car = v.car;
        const compact = views.length > 1;
        const pw = compact ? 214 : 250;
        // In split screen the right-hand player's panels mirror to the right edge.
        const x0 = compact && v.x > 0 ? v.x + v.w - 12 - pw : v.x + 12;
        const y0 = 12;
        ctx.fillStyle = U.alpha(C.ink, 0.8);
        U.roundRect(ctx, x0, y0, pw, 100, 12);
        ctx.fill();
        ctx.strokeStyle = U.alpha(car.color, 0.6);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        ctx.font = '800 28px Unbounded, sans-serif';
        ctx.fillStyle = car.color;
        const pos = ordinal(car.pos);
        ctx.fillText(pos, x0 + 12, y0 + 38);
        const posW = ctx.measureText(pos).width;
        ctx.font = HUD;
        ctx.fillStyle = C.muted;
        ctx.fillText('/ ' + cars.length, x0 + 18 + posW, y0 + 37);
        ctx.textAlign = 'right';
        ctx.fillStyle = C.text;
        const lap = car.finished ? LAPS : U.clamp(car.c, 1, LAPS);
        ctx.fillText('LAP ' + lap + '/' + LAPS, x0 + pw - 12, y0 + 22);
        ctx.fillStyle = C.muted;
        const lt = state === 'race' && !car.finished ? Math.max(0, raceT - car.lapStart) : car.finished ? car.finishT : 0;
        ctx.fillText(fmt(lt), x0 + pw - 12, y0 + 40);
        ctx.textAlign = 'left';
        const g = ghostBank[ghostKey(car)];
        ctx.fillStyle = C.muted;
        ctx.fillText('GHOST ' + (g ? fmt(g.time) : '-:--.--'), x0 + 12, y0 + 66);
        const dlt = ghostDelta(car);
        ctx.textAlign = 'right';
        if (dlt !== null) {
          ctx.fillStyle = dlt <= 0 ? C.mint : C.p1;
          ctx.fillText(fmtDelta(dlt), x0 + pw - 12, y0 + 66);
        }
        ctx.textAlign = 'left';
        ctx.fillStyle = U.alpha(C.text, 0.7);
        ctx.font = SMALL;
        ctx.fillText(!g ? 'this lap sets your ghost' : dlt !== null && dlt <= 0 ? 'ahead: on pace for nitro' : 'finish ahead to fill nitro',
          x0 + 12, y0 + 87);
        if (compact) drawNitro(x0, H - 56, pw, 44, car);
        else drawNitro(12, H - 56, 236, 44, car);
        if (!compact) {
          const sp = Math.hypot(car.vx, car.vy);
          ctx.fillStyle = U.alpha(C.ink, 0.8);
          U.roundRect(ctx, W - 132, H - 56, 120, 44, 12);
          ctx.fill();
          ctx.font = '800 22px Unbounded, sans-serif';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = car.nitroOn ? C.p2 : C.text;
          ctx.fillText(String(Math.round(sp * 0.5)), W - 62, H - 34);
          ctx.font = SMALL;
          ctx.fillStyle = C.muted;
          ctx.fillText('km/h', W - 20, H - 33);
        }
        // Banner and countdown.
        const cx = v.x + v.w / 2;
        if (state === 'count') {
          const n = Math.ceil(countT);
          for (let k = 0; k < 3; k++) {
            const lit = n <= 3 - k;
            ctx.fillStyle = U.alpha(C.ink, 0.85);
            ctx.beginPath();
            ctx.arc(cx - 40 + k * 40, 150, 16, 0, TAU);
            ctx.fill();
            ctx.fillStyle = lit ? C.p1 : U.alpha(C.line, 0.9);
            ctx.beginPath();
            ctx.arc(cx - 40 + k * 40, 150, 11, 0, TAU);
            ctx.fill();
          }
          if (n <= 3) {
            const f = countT - Math.floor(countT);
            bigText(String(n), cx, 230, C.text, 1 + f * 0.4, Math.min(1, 0.3 + f));
          }
        } else if (goT > 0) {
          for (let k = 0; k < 3; k++) {
            ctx.fillStyle = C.mint;
            ctx.beginPath();
            ctx.arc(cx - 40 + k * 40, 150, 11, 0, TAU);
            ctx.fill();
          }
          bigText('Go!', cx, 230, C.mint, 1 + (0.9 - goT) * 0.5, Math.min(1, goT * 2));
        } else if (car.banner) {
          const b = car.banner;
          const a = Math.min(1, b.t * 6, (2.2 - b.t) * 3);
          bigText(b.text, cx, 170, b.color, (compact ? 0.62 : 0.8) + Math.min(1, b.t * 6) * 0.15, a);
          if (b.sub) {
            ctx.globalAlpha = U.clamp(a, 0, 1);
            ctx.font = HUD;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const tw = b.sub.length * 9.2 + 24;
            ctx.fillStyle = U.alpha(C.ink, 0.8);
            U.roundRect(ctx, cx - tw / 2, 202, tw, 28, 14);
            ctx.fill();
            ctx.fillStyle = C.text;
            ctx.fillText(b.sub, cx, 216);
            ctx.globalAlpha = 1;
          }
        }
      }

      function draw() {
        if (!views.length) {
          // Menu backdrop: the first track from above.
          const b = getTrack(trackIdx).box;
          T = getTrack(trackIdx);
          const z = Math.min(W / (b.x1 - b.x0 + 500), H / (b.y1 - b.y0 + 500));
          ctx.save();
          ctx.fillStyle = C.ink;
          ctx.fillRect(0, 0, W, H);
          ctx.translate(W / 2, H / 2);
          ctx.scale(z, z);
          const cx = (b.x0 + b.x1) / 2;
          const cy = (b.y0 + b.y1) / 2;
          ctx.translate(-cx, -cy);
          drawTrack(cx - W / 2 / z, cy - H / 2 / z, cx + W / 2 / z, cy + H / 2 / z);
          ctx.restore();
          return;
        }
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        views.forEach((v) => drawWorld(v));
        views.forEach((v) => {
          ctx.save();
          ctx.beginPath();
          ctx.rect(v.x, v.y, v.w, v.h);
          ctx.clip();
          drawHud(v);
          ctx.restore();
        });
        if (views.length > 1) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(W / 2 - 3, 0, 6, H);
          ctx.fillStyle = C.line;
          ctx.fillRect(W / 2 - 1, 0, 2, H);
          drawMinimap(W / 2 - 95, H - 128, 190, 116);
        } else {
          drawMinimap(W - 212, 12, 200, 128);
          drawBoard(W - 212, 150, 200);
        }
        if (pointer && players === 1 && state === 'race') {
          ctx.strokeStyle = U.alpha(C.p1, 0.7);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pointer.x, pointer.y, 10, 0, TAU);
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
