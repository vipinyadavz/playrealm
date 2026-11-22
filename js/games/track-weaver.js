/* Track Weaver — a live rail-switching puzzle. Colored trains roll out of tunnels and never
   stop; flip junction switches so each one reaches the station of its own color.
   Original PlayRealm game. See docs/GAME_API.md. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 960;
  const H = 600;
  const FONT_BIG = '800 44px Unbounded, sans-serif';
  const FONT_HUD = '600 15px "JetBrains Mono", monospace';
  const FONT_SMALL = '700 12px "JetBrains Mono", monospace';
  const DEG = Math.PI / 180;
  const STEP = 4;          // arc-length spacing of the baked track samples (px)
  const CAR_LEN = 20;
  const CAR_W = 11;
  const CAR_GAP = 24;      // centre-to-centre spacing of cars
  const HEAD_BACK = 10;    // first car centre sits this far behind the train's nose
  const HIT = 15;          // two cars closer than this = crash
  const LOCK_R = 30;       // a switch is locked while any car centre is this close
  const MAX_STRIKES = 3;
  const PREVIEW = 2;       // seconds of warning before a train leaves its tunnel
  const COLOR_TIMES = [30, 70, 110]; // seconds into a run when colors 3, 4, 5 open
  const PALETTE = [
    { name: 'Coral', hex: C.p1 },
    { name: 'Cyan', hex: C.p2 },
    { name: 'Gold', hex: C.gold },
    { name: 'Mint', hex: C.mint },
    { name: 'Violet', hex: C.violet }
  ];

  /* ---------- Map building ----------
     A node has a position and a tangent angle `a`. Every edge leaves a node on its "+" side
     (along the tangent) or its "-" side (against it), so tracks meet nodes smoothly. A train
     arriving on one side leaves on the other: one option = plain track, two = a switch,
     none = a dead end (tunnel or station). */

  function builder() {
    const b = {
      nodes: [],
      edges: [],
      node(x, y, a, extra) {
        b.nodes.push(Object.assign({ x, y, a }, extra || {}));
        return b.nodes.length - 1;
      },
      edge(a, sa, z, sz, ka, kz) {
        b.edges.push([a, sa, z, sz, ka || 0, kz || 0]);
      },
      /* Clockwise ellipse through the given angles (degrees); returns node ids. */
      ring(cx, cy, rx, ry, phis) {
        const speed = (p) => Math.hypot(rx * Math.sin(p * DEG), ry * Math.cos(p * DEG));
        const ids = phis.map((p) => b.node(cx + rx * Math.cos(p * DEG), cy + ry * Math.sin(p * DEG),
          Math.atan2(ry * Math.cos(p * DEG), -rx * Math.sin(p * DEG)) / DEG));
        phis.forEach((p0, i) => {
          const p1 = i + 1 < phis.length ? phis[i + 1] : phis[0] + 360;
          const f = (4 / 3) * Math.tan(((p1 - p0) * DEG) / 4);
          b.edge(ids[i], 1, ids[(i + 1) % ids.length], -1, f * speed(p0), f * speed(p1));
        });
        return ids;
      }
    };
    return b;
  }

  const MAP_DEFS = [
    {
      name: 'Loop Line',
      blurb: 'One tunnel feeds a loop with three stations.',
      unlock: 120,
      cap: 4,
      build(b) {
        const [R, B, L, T] = b.ring(480, 330, 250, 150, [0, 90, 180, 270]);
        b.nodes[L].fixed = true;
        b.edge(b.node(0, 520, 0, { tunnel: true }), 1, L, -1, 120, 110);
        b.edge(T, 1, b.node(760, 72, 180, { station: 0 }), 1, 110, 110);
        b.edge(R, 1, b.node(900, 470, 180, { station: 1 }), 1, 90, 100);
        b.edge(B, 1, b.node(220, 565, 0, { station: 2 }), 1, 100, 100);
      }
    },
    {
      name: 'Figure Eight',
      blurb: 'Two tunnels, four stations, and a crossing in the middle.',
      unlock: 160,
      cap: 5,
      build(b) {
        const X1 = b.node(480, 320, -40);
        const RT = b.node(660, 165, 0);
        const RR = b.node(830, 320, 90);
        const RB = b.node(660, 475, 180, { fixed: true });
        const X2 = b.node(480, 320, 220);
        const LT = b.node(300, 165, 180);
        const LL = b.node(130, 320, 90);
        const LB = b.node(300, 475, 0, { fixed: true });
        b.edge(X1, 1, RT, -1, 100, 100);
        b.edge(RT, 1, RR, -1, 94, 86);
        b.edge(RR, 1, RB, -1, 86, 94);
        b.edge(RB, 1, X2, -1, 100, 100);
        b.edge(X2, 1, LT, -1, 100, 100);
        b.edge(LT, 1, LL, -1, 94, 86);
        b.edge(LL, 1, LB, -1, 86, 94);
        b.edge(LB, 1, X1, -1, 100, 100);
        b.edge(b.node(0, 560, 0, { tunnel: true }), 1, LB, -1, 110, 100);
        b.edge(b.node(960, 560, 180, { tunnel: true }), 1, RB, -1, 110, 100);
        b.edge(RT, 1, b.node(900, 82, 180, { station: 0 }), 1, 100, 90);
        b.edge(LT, 1, b.node(60, 82, 0, { station: 1 }), 1, 100, 90);
        b.edge(RR, 1, b.node(925, 415, 180, { station: 2 }), 1, 55, 60);
        b.edge(LL, 1, b.node(35, 415, 0, { station: 3 }), 1, 55, 60);
      }
    },
    {
      name: 'City',
      blurb: 'A ring road plus a two-way line through downtown. Watch for head-on trains.',
      unlock: 200,
      cap: 6,
      build(b) {
        const t1 = b.node(330, 130, 0);
        const t2 = b.node(630, 130, 0);
        const rgt = b.node(760, 310, 90);
        const b2 = b.node(630, 490, 180, { fixed: true });
        const b1 = b.node(330, 490, 180);
        const lft = b.node(200, 310, 270, { fixed: true });
        b.edge(t1, 1, t2, -1, 100, 100);
        b.edge(t2, 1, rgt, -1, 72, 99);
        b.edge(rgt, 1, b2, -1, 99, 72);
        b.edge(b2, 1, b1, -1, 100, 100);
        b.edge(b1, 1, lft, -1, 72, 99);
        b.edge(lft, 1, t1, -1, 99, 72);
        b.edge(b.node(0, 420, 0, { tunnel: true }), 1, lft, -1, 110, 80);
        b.edge(b.node(960, 560, 180, { tunnel: true }), 1, b2, -1, 110, 80);
        b.edge(t2, 1, b.node(880, 66, 180, { station: 0 }), 1, 80, 80);
        b.edge(rgt, 1, b.node(910, 420, 180, { station: 1 }), 1, 60, 70);
        b.edge(b1, 1, b.node(70, 560, 0, { station: 2 }), 1, 80, 80);
        // Two-way downtown line, crossing the ring top and bottom.
        const j1 = b.node(480, 240, 90);
        const j2 = b.node(480, 380, 90);
        b.edge(b.node(480, 0, 90, { tunnel: true }), 1, j1, -1, 80, 80);
        b.edge(j1, 1, j2, -1, 46, 46);
        b.edge(j2, 1, b.node(480, 600, 270, { tunnel: true }), 1, 73, 73);
        b.edge(j1, 1, b.node(640, 330, 180, { station: 3 }), 1, 50, 70);
        b.edge(j2, -1, b.node(320, 290, 0, { station: 0 }), 1, 50, 70);
      }
    },
    {
      name: 'Spaghetti',
      blurb: 'Two tangled loops, four tunnels, transfer tracks and five colors.',
      unlock: 0,
      cap: 7,
      build(b) {
        const PH = [0, 45, 90, 135, 180, 225, 270, 315];
        const A = b.ring(350, 300, 220, 185, PH);
        const B = b.ring(610, 300, 220, 185, PH);
        [A[4], A[5], B[0], B[1]].forEach((i) => { b.nodes[i].fixed = true; });
        b.edge(b.node(0, 200, 0, { tunnel: true }), 1, A[5], -1, 70, 60);
        b.edge(b.node(960, 400, 180, { tunnel: true }), 1, B[1], -1, 70, 60);
        b.edge(A[7], 1, B[0], -1, 120, 80);   // transfer: left loop -> right loop
        b.edge(B[3], 1, A[4], -1, 120, 80);   // transfer: right loop -> left loop
        b.edge(A[6], 1, b.node(520, 50, 180, { station: 0 }), 1, 70, 60);
        b.edge(A[3], 1, b.node(40, 360, 0, { station: 1 }), 1, 60, 60);
        b.edge(A[2], 1, b.node(150, 555, 0, { station: 2 }), 1, 70, 60);
        b.edge(B[6], 1, b.node(820, 72, 180, { station: 1 }), 1, 70, 60);
        b.edge(B[7], 1, b.node(920, 240, 180, { station: 3 }), 1, 60, 60);
        b.edge(B[2], 1, b.node(440, 555, 0, { station: 4 }), 1, 70, 60);
      }
    }
  ];

  /* Point at distance p travelled along edge e in direction d (+1 a->b, -1 b->a). */
  function sample(e, d, p, out) {
    const s = U.clamp(d > 0 ? p : e.len - p, 0, e.len);
    const f = s / e.step;
    let k = Math.floor(f);
    if (k >= e.n) k = e.n - 1;
    const r = f - k;
    const x0 = e.xs[k];
    const y0 = e.ys[k];
    const x1 = e.xs[k + 1];
    const y1 = e.ys[k + 1];
    out.x = x0 + (x1 - x0) * r;
    out.y = y0 + (y1 - y0) * r;
    out.ang = Math.atan2(y1 - y0, x1 - x0) + (d > 0 ? 0 : Math.PI);
    return out;
  }

  /* Station colors reachable from a starting (edge, direction), whatever the switches say. */
  function reachFrom(map, e0, d0) {
    const seen = new Set();
    const out = new Set();
    const stack = [[e0, d0]];
    while (stack.length) {
      const [e, d] = stack.pop();
      const key = e * 2 + (d > 0 ? 1 : 0);
      if (seen.has(key)) continue;
      seen.add(key);
      const E = map.edges[e];
      const n = map.nodes[d > 0 ? E.b : E.a];
      const opts = n.sides[-(d > 0 ? E.sb : E.sa)];
      if (!opts.length) {
        if (n.station >= 0) out.add(n.station);
        continue;
      }
      (n.fixed ? opts.slice(0, 1) : opts).forEach((o) => stack.push([o.e, o.d]));
    }
    return [...out];
  }

  /* Bakes the arrow paths and puts the number badge in the clearest spot next to the junction. */
  function layoutSwitch(map, n, placed) {
    const tmp = {};
    n.paths = n.sides[n.swSide].map((o) => {
      const e = map.edges[o.e];
      const pts = [];
      for (let s = 0; s <= 56; s += 4) {
        sample(e, o.d, Math.min(s, e.len), tmp);
        pts.push({ x: tmp.x, y: tmp.y, ang: tmp.ang });
      }
      return pts;
    });
    const fx = n.dx * n.swSide;
    const fy = n.dy * n.swSide;
    let best = null;
    let bestScore = -Infinity;
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const x = n.x + ux * 25;
      const y = n.y + uy * 25;
      if (x < 14 || x > W - 14 || y < 50 || y > H - 14) continue;
      let clear = 40;
      for (const e of map.edges) {
        for (let i = 0; i <= e.n; i += 2) {
          const d = Math.hypot(e.xs[i] - x, e.ys[i] - y);
          if (d < clear) clear = d;
        }
      }
      for (const p of placed) clear = Math.min(clear, Math.hypot(p.lx - x, p.ly - y) - 12);
      for (const s of map.stations) clear = Math.min(clear, Math.hypot(s.x - s.dx * 17 - x, s.y - s.dy * 17 - y) - 20);
      // Prefer spots beside the junction over spots ahead of or behind it.
      const score = clear + 3 * Math.abs(fx * uy - fy * ux);
      if (score > bestScore) {
        bestScore = score;
        best = { x, y };
      }
    }
    n.lx = best ? best.x : n.x;
    n.ly = best ? best.y : n.y - 25;
  }

  function buildMap(def) {
    const b = builder();
    def.build(b);
    const nodes = b.nodes.map((n, i) => ({
      i, x: n.x, y: n.y, a: n.a * DEG, dx: Math.cos(n.a * DEG), dy: Math.sin(n.a * DEG),
      tunnel: !!n.tunnel, station: n.station === undefined ? -1 : n.station, fixed: !!n.fixed,
      sides: { 1: [], '-1': [] }, swSide: 0, state: 0, key: 0, lx: 0, ly: 0, paths: null,
      deny: 0, pulse: 0, glow: 0
    }));
    const N = 96;
    const edges = b.edges.map(([ia, sa, ib, sb, ka, kb], i) => {
      const A = nodes[ia];
      const B = nodes[ib];
      const chord = Math.hypot(B.x - A.x, B.y - A.y);
      const k1 = ka || chord * 0.38;
      const k2 = kb || chord * 0.38;
      const px = [A.x, A.x + sa * A.dx * k1, B.x + sb * B.dx * k2, B.x];
      const py = [A.y, A.y + sa * A.dy * k1, B.y + sb * B.dy * k2, B.y];
      const rx = [];
      const ry = [];
      const rs = [];
      let acc = 0;
      for (let k = 0; k <= N; k++) {
        const t = k / N;
        const u = 1 - t;
        const x = u * u * u * px[0] + 3 * u * u * t * px[1] + 3 * u * t * t * px[2] + t * t * t * px[3];
        const y = u * u * u * py[0] + 3 * u * u * t * py[1] + 3 * u * t * t * py[2] + t * t * t * py[3];
        if (k) acc += Math.hypot(x - rx[k - 1], y - ry[k - 1]);
        rx.push(x);
        ry.push(y);
        rs.push(acc);
      }
      const n = Math.max(2, Math.ceil(acc / STEP));
      const step = acc / n;
      const xs = new Float32Array(n + 1);
      const ys = new Float32Array(n + 1);
      const nx = new Float32Array(n + 1);
      const ny = new Float32Array(n + 1);
      let j = 0;
      for (let k = 0; k <= n; k++) {
        const s = k * step;
        while (j < N - 1 && rs[j + 1] < s) j++;
        const span = rs[j + 1] - rs[j];
        const f = span > 0 ? U.clamp((s - rs[j]) / span, 0, 1) : 0;
        xs[k] = rx[j] + (rx[j + 1] - rx[j]) * f;
        ys[k] = ry[j] + (ry[j + 1] - ry[j]) * f;
      }
      for (let k = 0; k <= n; k++) {
        const tx = xs[Math.min(n, k + 1)] - xs[Math.max(0, k - 1)];
        const ty = ys[Math.min(n, k + 1)] - ys[Math.max(0, k - 1)];
        const l = Math.hypot(tx, ty) || 1;
        nx[k] = -ty / l;
        ny[k] = tx / l;
      }
      return { i, a: ia, b: ib, sa, sb, len: acc, n, step, xs, ys, nx, ny };
    });
    edges.forEach((e) => {
      nodes[e.a].sides[e.sa].push({ e: e.i, d: 1 });
      nodes[e.b].sides[e.sb].push({ e: e.i, d: -1 });
    });
    const map = { def, name: def.name, nodes, edges, switches: [], tunnels: [], stations: [], colors: [] };
    nodes.forEach((n) => {
      if (n.sides[1].length >= 2) n.swSide = 1;
      else if (n.sides[-1].length >= 2) n.swSide = -1;
      if (n.swSide && !n.fixed) map.switches.push(n);
      if (n.station >= 0) map.stations.push(n);
      if (n.tunnel) {
        const o = (n.sides[1].length ? n.sides[1] : n.sides[-1])[0];
        map.tunnels.push({ node: n, e: o.e, d: o.d, reach: [] });
      }
    });
    map.switches.sort((p, q) => p.x - q.x || p.y - q.y);
    map.switches.forEach((n, k) => {
      n.key = k + 1;
      layoutSwitch(map, n, map.switches.slice(0, k));
    });
    map.tunnels.forEach((tn) => { tn.reach = reachFrom(map, tn.e, tn.d); });
    map.colors = [...new Set(map.stations.map((s) => s.station))].sort((p, q) => p - q);
    return map;
  }

  /* ---------- Drawing (shared by the game and the card art) ---------- */

  function drawBackdrop(ctx) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = U.alpha(C.line, 0.45);
    for (let x = 20; x < W; x += 40) {
      for (let y = 20; y < H; y += 40) ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }

  function tracePath(ctx, e, off) {
    for (let k = 0; k <= e.n; k++) {
      const x = e.xs[k] + e.nx[k] * off;
      const y = e.ys[k] + e.ny[k] * off;
      if (k) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
  }

  function drawTracks(ctx, map, m) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = U.alpha(C.panel2, 0.9);
    ctx.lineWidth = 17 * m;
    ctx.beginPath();
    map.edges.forEach((e) => tracePath(ctx, e, 0));
    ctx.stroke();
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 3 * m;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    map.edges.forEach((e) => {
      for (let k = 1; k < e.n; k += 3) {
        ctx.moveTo(e.xs[k] + e.nx[k] * 7 * m, e.ys[k] + e.ny[k] * 7 * m);
        ctx.lineTo(e.xs[k] - e.nx[k] * 7 * m, e.ys[k] - e.ny[k] * 7 * m);
      }
    });
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = U.alpha(C.muted, 0.85);
    ctx.lineWidth = 1.7 * m;
    ctx.beginPath();
    map.edges.forEach((e) => {
      tracePath(ctx, e, 4 * m);
      tracePath(ctx, e, -4 * m);
    });
    ctx.stroke();
  }

  /* Gold arrow along the open branch, dark veil over the closed one. */
  function drawSwitchArrows(ctx, map, sz) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const n of map.switches) {
      n.paths.forEach((path, i) => {
        if (i === n.state) return;
        ctx.strokeStyle = U.alpha(C.ink, 0.75);
        ctx.lineWidth = 9 * sz;
        ctx.beginPath();
        for (let k = 2; k < path.length; k++) {
          if (k === 2) ctx.moveTo(path[k].x, path[k].y);
          else ctx.lineTo(path[k].x, path[k].y);
        }
        ctx.stroke();
      });
      const path = n.paths[n.state];
      if (!path) continue;
      ctx.strokeStyle = C.gold;
      ctx.lineWidth = 3.5 * sz;
      ctx.beginPath();
      for (let k = 0; k < path.length - 1; k++) {
        if (k) ctx.lineTo(path[k].x, path[k].y);
        else ctx.moveTo(path[k].x, path[k].y);
      }
      ctx.stroke();
      const end = path[path.length - 1];
      ctx.save();
      ctx.translate(end.x, end.y);
      ctx.rotate(end.ang);
      ctx.fillStyle = C.gold;
      ctx.beginPath();
      ctx.moveTo(6 * sz, 0);
      ctx.lineTo(-5 * sz, -6 * sz);
      ctx.lineTo(-5 * sz, 6 * sz);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawSwitchBadges(ctx, map, sz, hot, clock) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = FONT_SMALL;
    for (const n of map.switches) {
      const wob = n.deny > 0 ? Math.sin(clock * 60) * 2.5 * sz : 0;
      const x = n.lx + wob;
      const y = n.ly;
      if (n.pulse > 0) {
        ctx.strokeStyle = U.alpha(C.gold, n.pulse / 0.35);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(n.x, n.y, (14 + (1 - n.pulse / 0.35) * 22) * sz, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = n.deny > 0 ? C.p1 : C.panel2;
      ctx.beginPath();
      ctx.arc(x, y, 10.5 * sz, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = n.deny > 0 ? C.text : n === hot ? C.text : C.gold;
      ctx.lineWidth = (n === hot ? 2.5 : 1.6) * sz;
      ctx.stroke();
      ctx.fillStyle = C.text;
      if (sz !== 1) ctx.font = '700 ' + Math.round(12 * sz) + 'px "JetBrains Mono", monospace';
      ctx.fillText(String(n.key), x, y + 0.5);
    }
  }

  function drawStations(ctx, map, open, sz, clock) {
    for (const n of map.stations) {
      const hex = PALETTE[n.station].hex;
      const on = open(n.station);
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.a); // local +x points back along the track
      const bw = 22 * sz;
      const bh = 40 * sz;
      const bx = -6 * sz - bw;
      if (on && n.glow > 0) {
        ctx.fillStyle = U.alpha(hex, Math.min(0.5, n.glow * 0.4));
        U.roundRect(ctx, bx - 8 * sz, -bh / 2 - 8 * sz, bw + 16 * sz, bh + 16 * sz, 10 * sz);
        ctx.fill();
      }
      ctx.fillStyle = on ? hex : C.line;
      ctx.fillRect(-4 * sz, -9 * sz, 4 * sz, 18 * sz); // buffer stop
      if (on) {
        ctx.fillStyle = U.alpha(hex, 0.2 + 0.08 * Math.sin(clock * 3 + n.i));
        U.roundRect(ctx, bx, -bh / 2, bw, bh, 5 * sz);
        ctx.fill();
        ctx.strokeStyle = hex;
        ctx.lineWidth = 2.5 * sz;
        ctx.stroke();
        ctx.fillStyle = hex;
        U.roundRect(ctx, bx + 5 * sz, -bh / 2 + 5 * sz, bw - 10 * sz, bh - 10 * sz, 3 * sz);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.ink, 0.55);
        ctx.fillRect(bx + bw / 2 - 2 * sz, -bh / 2 + 9 * sz, 4 * sz, bh - 18 * sz);
      } else {
        ctx.setLineDash([4 * sz, 4 * sz]);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2 * sz;
        U.roundRect(ctx, bx, -bh / 2, bw, bh, 5 * sz);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = U.alpha(C.muted, 0.6);
        ctx.lineWidth = 2 * sz;
        ctx.beginPath();
        ctx.moveTo(bx + 6 * sz, -6 * sz);
        ctx.lineTo(bx + bw - 6 * sz, 6 * sz);
        ctx.moveTo(bx + bw - 6 * sz, -6 * sz);
        ctx.lineTo(bx + 6 * sz, 6 * sz);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawTunnels(ctx, map, sz) {
    for (const tn of map.tunnels) {
      const n = tn.node;
      ctx.save();
      ctx.translate(n.x, n.y);
      ctx.rotate(n.a); // local +x points into the map
      ctx.fillStyle = C.panel2;
      U.roundRect(ctx, -16 * sz, -21 * sz, 30 * sz, 42 * sz, 7 * sz);
      ctx.fill();
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 2 * sz;
      ctx.stroke();
      ctx.fillStyle = '#07060F';
      U.roundRect(ctx, -16 * sz, -13 * sz, 26 * sz, 26 * sz, 11 * sz);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawCar(ctx, pt, hex, loco, express, sz, alpha) {
    const l = CAR_LEN * sz;
    const w = CAR_W * sz;
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(pt.ang);
    ctx.globalAlpha = alpha;
    if (loco && alpha > 0.9) {
      ctx.fillStyle = U.alpha('#FFF6D8', 0.09);
      ctx.beginPath();
      ctx.moveTo(l / 2, -3 * sz);
      ctx.lineTo(l / 2 + 34 * sz, -13 * sz);
      ctx.lineTo(l / 2 + 34 * sz, 13 * sz);
      ctx.lineTo(l / 2, 3 * sz);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    U.roundRect(ctx, -l / 2 + 1.5 * sz, -w / 2 + 2.5 * sz, l, w, 3 * sz);
    ctx.fill();
    ctx.fillStyle = hex;
    U.roundRect(ctx, -l / 2, -w / 2, l, w, (loco ? 4.5 : 2.5) * sz);
    ctx.fill();
    if (express) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(-l / 2 + 2 * sz, -1.2 * sz, l - 4 * sz, 2.4 * sz);
    }
    if (loco) {
      ctx.fillStyle = U.alpha(C.ink, 0.75);
      U.roundRect(ctx, l / 2 - 8 * sz, -w / 2 + 2 * sz, 4 * sz, w - 4 * sz, 1.5 * sz);
      ctx.fill();
      ctx.fillStyle = '#FFF6D8';
      ctx.beginPath();
      ctx.arc(l / 2 - 1 * sz, 0, 1.6 * sz, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = U.alpha(C.ink, 0.28);
      ctx.fillRect(-l / 2 + 3 * sz, -w / 2 + 2 * sz, l - 6 * sz, 2 * sz);
    }
    ctx.restore();
  }

  function drawTrainCars(ctx, pts, count, hex, express, sz, alpha) {
    for (let i = count - 1; i >= 0; i--) {
      const pt = pts[i];
      if (pt && pt.on) drawCar(ctx, pt, hex, i === 0, express, sz, alpha);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- Card art ---------- */

  let thumbMap = null;
  function loopPoint(map, ids, s, out) {
    let total = 0;
    ids.forEach((i) => { total += map.edges[i].len; });
    let r = ((s % total) + total) % total;
    for (const i of ids) {
      const e = map.edges[i];
      if (r <= e.len) return sample(e, 1, r, out);
      r -= e.len;
    }
    return sample(map.edges[ids[0]], 1, 0, out);
  }

  Arcade.register({
    id: 'track-weaver',
    title: 'Track Weaver',
    category: 'fresh',
    mode: 'solo',
    players: '1P',
    original: true,
    color: C.gold,
    tagline: 'Run a busy little railway and route every colored train home without a crash.',
    hook: 'Flip track switches live to send every colored train to its matching station.',
    tags: ['trains', 'strategy', 'puzzle', 'reflex', 'railway', 'switches', 'routing', 'mouse', 'touch', 'keyboard'],
    howTo: 'Trains roll out of the tunnels at the edge of the map and never stop. Every junction has a numbered switch, ' +
      'and its gold arrow shows where the next train will go. Click or tap a junction, or press its number, to flip it, ' +
      'but you cannot flip it while a train is on top of it. Send each train to the station of its own color: longer and ' +
      'faster trains (white stripe = express) score more. A wrong station or a crash is a strike, and three strikes end ' +
      'the run. Trains that slip into a tunnel come back later. A marker at a tunnel mouth shows the next train two ' +
      'seconds early. New colors open as the run goes on, and a good score on a map unlocks the next one this session.',
    controls: [
      { keys: ['Click', 'Tap'], label: 'Flip the junction under the pointer' },
      { keys: ['1', '–', '9'], label: 'Flip the junction with that number' }
    ],
    best: 'high',
    formatScore: (n) => n + ' pts',

    drawThumb(ctx, w, h, t) {
      if (!thumbMap) {
        thumbMap = buildMap(MAP_DEFS[0]);
        thumbMap.switches.forEach((n) => { n.state = n.x > 600 ? 1 : 0; });
      }
      const map = thumbMap;
      ctx.save();
      ctx.scale(w / W, h / H);
      drawBackdrop(ctx);
      drawTracks(ctx, map, 1.9);
      drawSwitchArrows(ctx, map, 1.8);
      drawStations(ctx, map, () => true, 1.5, t);
      const loop = [0, 1, 2, 3];
      const trains = [
        { hex: C.p1, cars: 3, s: 260 },
        { hex: C.p2, cars: 2, s: 800 },
        { hex: C.gold, cars: 3, s: 1180, express: true }
      ];
      for (const tr of trains) {
        const pts = [];
        for (let i = 0; i < tr.cars; i++) {
          const pt = loopPoint(map, loop, tr.s + t * 70 - 18 - i * 40, {});
          pt.on = true;
          pts.push(pt);
        }
        drawTrainCars(ctx, pts, tr.cars, tr.hex, tr.express, 1.8, 1);
      }
      drawTunnels(ctx, map, 1.7);
      drawSwitchBadges(ctx, map, 1.8, null, t);
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);
      const maps = MAP_DEFS.map(buildMap);
      let unlocked = 1;       // maps open this session (kept across Play again)
      let mapIdx = 0;
      let map = maps[0];
      let state = 'menu';      // 'menu' | 'play' | 'ending' | 'over'
      let trains = [];
      let particles = [];
      let floats = [];
      let scorches = [];
      let backlog = [];        // trains that slipped into a tunnel and will return
      let plan = null;         // next train: { tunnel, spec, t }
      let score = 0;
      let delivered = 0;
      let strikes = 0;
      let runTime = 0;
      let clock = 0;
      let activeCount = 2;
      let banner = null;
      let shake = 0;
      let flash = 0;
      let endT = 0;
      let uid = 0;
      let hot = null;
      let newUnlock = -1;
      let lastHint = '';
      const seen = {};

      function hint(text) {
        if (text === lastHint) return;
        lastHint = text;
        api.setStatus(text);
      }
      const colorName = (c) => PALETTE[c].name;
      const isActive = (c) => map.colors.indexOf(c) >= 0 && map.colors.indexOf(c) < activeCount;

      function setBanner(text, sub, color) {
        banner = { text, sub, color, t: 2.6 };
      }

      function addFloat(x, y, text, color) {
        floats.push({ x: U.clamp(x, 40, W - 40), y: U.clamp(y, 60, H - 20), text, color, t: 1.3 });
      }

      function burst(x, y, colors, n, speed) {
        for (let k = 0; k < n && particles.length < 600; k++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.25, 1);
          particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.4, 1), max: 1,
            size: U.rand(2, 4.5), color: U.pick(colors) });
        }
      }

      /* ---------- Trains ---------- */

      function pointBack(t, back, out) {
        let e = map.edges[t.e];
        let d = t.d;
        let p = t.p;
        let rem = back;
        let k = -1;
        while (rem > p) {
          rem -= p;
          k += 1;
          if (k >= t.hist.length) return null; // still inside the tunnel
          const h = t.hist[k];
          e = map.edges[h.e];
          d = h.d;
          p = e.len;
        }
        return sample(e, d, p - rem, out);
      }

      function computePts(t) {
        for (let i = 0; i < t.cars; i++) {
          const pt = t.pts[i] || (t.pts[i] = { x: 0, y: 0, ang: 0, on: false });
          pt.on = !!pointBack(t, HEAD_BACK + i * CAR_GAP, pt);
        }
      }

      function advance(t, dist) {
        t.p += dist;
        let guard = 0;
        while (!t.dead && t.p >= map.edges[t.e].len && guard++ < 10) {
          const e = map.edges[t.e];
          const over = t.p - e.len;
          const node = map.nodes[t.d > 0 ? e.b : e.a];
          const opts = node.sides[-(t.d > 0 ? e.sb : e.sa)];
          if (!opts.length) {
            t.p = e.len;
            arrive(t, node);
            return;
          }
          const pick = opts.length === 1 ? opts[0] : opts[node.state % opts.length];
          t.hist.unshift({ e: t.e, d: t.d });
          if (t.hist.length > 10) t.hist.length = 10;
          t.e = pick.e;
          t.d = pick.d;
          t.p = over;
        }
      }

      /* Turn a train around in place: its last car becomes the front. */
      function reverseTrain(t) {
        let rem = HEAD_BACK * 2 + (t.cars - 1) * CAR_GAP;
        let e = t.e;
        let d = t.d;
        let p = t.p;
        let k = -1;
        const passed = [{ e, d }];
        while (rem > p) {
          if (k + 1 >= t.hist.length) { rem = p; break; }
          rem -= p;
          k += 1;
          e = t.hist[k].e;
          d = t.hist[k].d;
          p = map.edges[e].len;
          passed.push({ e, d });
        }
        const q = p - rem;
        const hist = [];
        for (let i = passed.length - 2; i >= 0; i--) hist.push({ e: passed[i].e, d: -passed[i].d });
        t.e = e;
        t.d = -d;
        t.p = map.edges[e].len - q;
        t.hist = hist;
      }

      function strike(x, y, label) {
        strikes += 1;
        flash = 0.5;
        addFloat(x, y - 22, label, C.p1);
        if (strikes >= MAX_STRIKES && state === 'play') {
          state = 'ending';
          endT = 1.6;
        }
      }

      function arrive(t, n) {
        const hex = PALETTE[t.color].hex;
        if (t.ghost) {
          t.dead = true;
          burst(n.x, n.y, [U.alpha(hex, 0.6), C.muted], 8, 50);
          return;
        }
        if (n.tunnel) {
          t.dead = true;
          backlog.push({ color: t.color, cars: t.cars, speed: t.speed, express: t.express });
          api.sfx('tick');
          addFloat(n.x + n.dx * 60, n.y + n.dy * 60, 'back soon', C.muted);
          hint('A ' + colorName(t.color).toLowerCase() + ' train slipped into a tunnel. It will come back around.');
          return;
        }
        if (n.station < 0) { t.dead = true; return; }
        const sx = n.x - n.dx * 18;
        const sy = n.y - n.dy * 18;
        if (n.station === t.color) {
          t.dead = true;
          const pts = Math.round((t.cars * t.speed) / 8) + (t.express ? 10 : 0);
          score += pts;
          delivered += 1;
          api.setScore(score);
          api.sfx('score');
          n.glow = 1;
          burst(sx, sy, [hex, C.text], 24, 150);
          addFloat(sx, sy - 30, '+' + pts, hex);
          hint(colorName(t.color) + ' train delivered: +' + pts + (t.express ? ' (express bonus)' : '') + '.');
          checkUnlock();
        } else {
          strike(sx, sy, 'Wrong station!');
          api.sfx('hit');
          reverseTrain(t);
          t.ghost = true;
          t.life = 0;
          t.speed = Math.max(t.speed, 70) * 1.2;
          hint('Wrong station! Strike ' + Math.min(strikes, MAX_STRIKES) + ' of 3. The ' +
            colorName(t.color).toLowerCase() + ' train backs out toward a tunnel.');
        }
      }

      function crash(a, b, x, y) {
        a.dead = true;
        b.dead = true;
        const ca = PALETTE[a.color].hex;
        const cb = PALETTE[b.color].hex;
        [a, b].forEach((t) => t.pts.forEach((pt) => {
          if (pt.on) burst(pt.x, pt.y, [PALETTE[t.color].hex, C.ink], 6, 120);
        }));
        burst(x, y, [C.gold, C.p1, '#FFFFFF', ca, cb], 46, 260);
        scorches.push({ x, y, t: 8, r: 0 });
        shake = 0.6;
        api.sfx('boom');
        strike(x, y, 'CRASH!');
        hint('Crash! Strike ' + Math.min(strikes, MAX_STRIKES) + ' of 3. Keep trains apart at crossings and merges.');
      }

      function checkCrashes() {
        for (let i = 0; i < trains.length; i++) {
          const a = trains[i];
          if (a.ghost || a.dead) continue;
          for (let j = i + 1; j < trains.length; j++) {
            const b = trains[j];
            if (b.ghost || b.dead || a.dead) continue;
            hit: for (let p = 0; p < a.cars; p++) {
              const pa = a.pts[p];
              if (!pa || !pa.on) continue;
              for (let q = 0; q < b.cars; q++) {
                const pb = b.pts[q];
                if (!pb || !pb.on) continue;
                const dx = pa.x - pb.x;
                const dy = pa.y - pb.y;
                if (dx * dx + dy * dy < HIT * HIT) {
                  crash(a, b, (pa.x + pb.x) / 2, (pa.y + pb.y) / 2);
                  break hit;
                }
              }
            }
          }
        }
      }

      /* ---------- Spawning ---------- */

      const activeColors = () => map.colors.slice(0, activeCount);
      const spawnGap = () => U.clamp(6.2 - runTime * 0.028, 2.3, 6.2) * U.rand(0.85, 1.15);
      const trainCap = () => Math.min(map.def.cap, 2 + Math.floor(runTime / 22));

      function makeSpec(color) {
        const maxCars = Math.min(4, 1 + Math.floor(runTime / 30));
        const cars = U.randInt(Math.max(1, maxCars - 2), maxCars);
        let speed = 56 + Math.min(40, runTime * 0.25) + U.rand(-8, 8);
        const express = runTime > 55 && Math.random() < 0.22;
        if (express) speed *= 1.4;
        return { color, cars, speed, express };
      }

      function makePlan(delay) {
        const act = activeColors();
        let spec = null;
        let tunnel = null;
        while (backlog.length && !spec) {
          const s = backlog.shift();
          const ok = map.tunnels.filter((tn) => tn.reach.indexOf(s.color) >= 0);
          if (ok.length) {
            spec = s;
            tunnel = U.pick(ok);
          }
        }
        if (!spec) {
          const ok = map.tunnels.filter((tn) => tn.reach.some((c) => act.indexOf(c) >= 0));
          if (!ok.length) return null;
          tunnel = U.pick(ok);
          const cols = tunnel.reach.filter((c) => act.indexOf(c) >= 0);
          const fresh = act[act.length - 1];
          spec = makeSpec(cols.indexOf(fresh) >= 0 && Math.random() < 0.35 ? fresh : U.pick(cols));
        }
        return { tunnel, spec, t: delay === undefined ? spawnGap() : delay };
      }

      function tunnelClear(tn) {
        const n = tn.node;
        for (const t of trains) {
          if (t.e === tn.e) return false;
          for (const pt of t.pts) {
            if (pt.on && (pt.x - n.x) * (pt.x - n.x) + (pt.y - n.y) * (pt.y - n.y) < 90 * 90) return false;
          }
        }
        return true;
      }

      function spawn(p) {
        const s = p.spec;
        const t = {
          id: ++uid, color: s.color, cars: s.cars, speed: s.speed, express: s.express,
          e: p.tunnel.e, d: p.tunnel.d, p: 0, hist: [], ghost: false, dead: false, life: 0, pts: []
        };
        computePts(t);
        trains.push(t);
      }

      function updateSpawner(dt) {
        if (!plan) {
          plan = makePlan();
          if (!plan) return;
        }
        let live = 0;
        trains.forEach((t) => { if (!t.ghost) live += 1; });
        if (live >= trainCap() && plan.t > PREVIEW && plan.t - dt <= PREVIEW) return; // hold until there is room
        plan.t -= dt;
        if (plan.t <= PREVIEW && !seen.preview && trains.length) {
          seen.preview = true;
          hint('A marker at the tunnel shows the next train. Set the switches before it arrives.');
        }
        if (plan.t > 0) return;
        if (tunnelClear(plan.tunnel)) {
          spawn(plan);
          plan = null;
          return;
        }
        const alt = map.tunnels.filter((tn) => tn !== plan.tunnel && tn.reach.indexOf(plan.spec.color) >= 0 && tunnelClear(tn));
        if (alt.length) {
          plan.tunnel = U.pick(alt);
          plan.t = 1;
        } else {
          plan.t = 0.5;
        }
      }

      /* ---------- Switches ---------- */

      function switchBusy(n) {
        for (const t of trains) {
          for (const pt of t.pts) {
            if (pt.on && (pt.x - n.x) * (pt.x - n.x) + (pt.y - n.y) * (pt.y - n.y) < LOCK_R * LOCK_R) return true;
          }
        }
        return false;
      }

      function flip(n) {
        if (state !== 'play' || !n) return;
        if (switchBusy(n)) {
          n.deny = 0.45;
          api.sfx('tick');
          hint('Switch ' + n.key + ' is locked while a train is on it.');
          return;
        }
        n.state = (n.state + 1) % n.sides[n.swSide].length;
        n.pulse = 0.35;
        api.sfx('flip');
        if (!seen.flip) {
          seen.flip = true;
          hint('The gold arrow shows where switch ' + n.key + ' sends the next train.');
        }
      }

      function switchAt(p) {
        let best = null;
        let bd = 34 * 34;
        for (const n of map.switches) {
          const d = Math.min((p.x - n.x) ** 2 + (p.y - n.y) ** 2, (p.x - n.lx) ** 2 + (p.y - n.ly) ** 2);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
        return best;
      }

      /* ---------- Run flow ---------- */

      function checkUnlock() {
        if (mapIdx === unlocked - 1 && unlocked < maps.length && score >= map.def.unlock) {
          unlocked += 1;
          newUnlock = unlocked - 1;
          setBanner(maps[newUnlock].name + ' unlocked!', 'Pick it from the map menu after this run', C.mint);
          api.sfx('win');
        }
      }

      function resetRun(i) {
        mapIdx = i;
        map = maps[i];
        map.nodes.forEach((n) => {
          n.state = 0;
          n.deny = 0;
          n.pulse = 0;
          n.glow = 0;
        });
        trains = [];
        particles = [];
        floats = [];
        scorches = [];
        backlog = [];
        plan = null;
        score = 0;
        delivered = 0;
        strikes = 0;
        runTime = 0;
        activeCount = Math.min(2, map.colors.length);
        banner = null;
        shake = 0;
        flash = 0;
        newUnlock = -1;
        hot = null;
        api.setScore(0);
      }

      function startRun(i) {
        resetRun(i);
        state = 'play';
        plan = makePlan(PREVIEW + 0.8);
        setBanner(map.name, map.def.blurb, C.gold);
        lastHint = '';
        hint((api.isTouch ? 'Tap' : 'Click') + ' a junction or press its number to flip it. ' +
          'Send each train to the station of its own color.');
      }

      function unlockText() {
        if (unlocked >= maps.length) return 'All four maps are open.';
        const cur = maps[unlocked - 1];
        return 'Score ' + cur.def.unlock + ' on ' + cur.name + ' to open ' + maps[unlocked].name + '.';
      }

      function showStartMenu() {
        state = 'menu';
        hot = null;
        api.menu({
          title: 'Track Weaver',
          text: (api.isTouch ? 'Tap' : 'Click') + ' a junction or press its number to flip it, and send every ' +
            'train to the station of its color. Crashes and wrong stations are strikes; three ends the run. ' +
            unlockText(),
          buttons: maps.slice(0, unlocked).map((m, i) => ({
            label: m.name,
            primary: i === Math.min(mapIdx, unlocked - 1),
            onClick: () => startRun(i)
          }))
        });
      }

      function gameOver() {
        state = 'over';
        api.sfx('lose');
        const isBest = api.reportScore(score);
        let text = 'You delivered ' + delivered + ' train' + (delivered === 1 ? '' : 's') + ' on ' + map.name +
          ' for ' + score + ' point' + (score === 1 ? '' : 's') + '.';
        if (newUnlock >= 0) text += ' ' + maps[newUnlock].name + ' is now open!';
        else text += ' ' + unlockText();
        hint(text);
        const buttons = [{ label: 'Play again', primary: true, onClick: () => startRun(mapIdx) }];
        if (newUnlock >= 0) {
          const k = newUnlock;
          buttons.push({ label: 'Try ' + maps[k].name, onClick: () => startRun(k) });
        }
        buttons.push({ label: 'Change map', onClick: showStartMenu });
        api.menu({ title: isBest ? 'New best: ' + score + '!' : 'Game over', text, buttons });
      }

      /* ---------- Update ---------- */

      function update(dt) {
        clock += dt;
        shake = Math.max(0, shake - dt);
        flash = Math.max(0, flash - dt);
        if (banner) {
          banner.t -= dt;
          if (banner.t <= 0) banner = null;
        }
        for (const n of map.nodes) {
          if (n.deny > 0) n.deny -= dt;
          if (n.pulse > 0) n.pulse -= dt;
          if (n.glow > 0) n.glow -= dt;
        }
        particles = particles.filter((q) => {
          q.life -= dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.vx *= 1 - 2.5 * dt;
          q.vy *= 1 - 2.5 * dt;
          return q.life > 0;
        });
        floats = floats.filter((f) => {
          f.t -= dt;
          f.y -= 28 * dt;
          return f.t > 0;
        });
        scorches = scorches.filter((s) => {
          s.t -= dt;
          s.r = Math.min(1, s.r + dt * 6);
          return s.t > 0;
        });

        if (state === 'ending') {
          endT -= dt;
          if (endT <= 0) gameOver();
          return;
        }
        if (state !== 'play') return;

        runTime += dt;
        const want = Math.min(map.colors.length, 2 + COLOR_TIMES.filter((x) => runTime >= x).length);
        if (want > activeCount) {
          activeCount = want;
          const c = map.colors[want - 1];
          const nm = colorName(c);
          setBanner('New color: ' + nm, 'The ' + nm.toLowerCase() + ' station is open', PALETTE[c].hex);
          map.stations.forEach((s) => { if (s.station === c) s.glow = 2.5; });
          api.sfx('power');
          hint('New color: ' + nm + '. ' + nm + ' trains are on the way and the ' + nm.toLowerCase() + ' station just opened.');
        }

        updateSpawner(dt);

        // Small substeps so fast trains can't pass through each other on a slow frame.
        const steps = Math.max(1, Math.ceil(dt / 0.017));
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          for (const t of trains) {
            if (t.dead) continue;
            t.life += h;
            if (t.ghost && t.life > 6) {
              t.dead = true;
              continue;
            }
            advance(t, t.speed * h);
          }
          trains = trains.filter((t) => !t.dead);
          trains.forEach(computePts);
          checkCrashes();
          trains = trains.filter((t) => !t.dead);
          if (state !== 'play') break;
        }
      }

      /* ---------- Draw ---------- */

      function pill(x, y, text, color, alignRight) {
        ctx.font = FONT_HUD;
        const w = ctx.measureText(text).width + 22;
        const px = alignRight ? x - w : x;
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, px, y, w, 28, 14);
        ctx.fill();
        ctx.strokeStyle = U.alpha(C.line, 0.9);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, px + 11, y + 14.5);
        return w;
      }

      function drawPreview() {
        if (!plan || plan.t > PREVIEW || state !== 'play') return;
        const n = plan.tunnel.node;
        const hex = PALETTE[plan.spec.color].hex;
        const k = U.clamp(1 - plan.t / PREVIEW, 0, 1);
        // Glow in the tunnel mouth.
        ctx.fillStyle = U.alpha(hex, 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(clock * 12)));
        ctx.beginPath();
        ctx.arc(n.x + n.dx * 8, n.y + n.dy * 8, 26, 0, Math.PI * 2);
        ctx.fill();
        // Marker: one chip per car, plus a countdown bar.
        const cars = plan.spec.cars;
        const bw = 16 + cars * 12;
        const bh = 26;
        let x = n.x + n.dx * 52 - n.dy * 34 - bw / 2;
        let y = n.y + n.dy * 52 + n.dx * 34 - bh / 2;
        x = U.clamp(x, 6, W - bw - 6);
        y = U.clamp(y, 46, H - bh - 6);
        ctx.fillStyle = U.alpha(C.panel, 0.95);
        U.roundRect(ctx, x, y, bw, bh, 7);
        ctx.fill();
        ctx.strokeStyle = hex;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = hex;
        for (let i = 0; i < cars; i++) {
          U.roundRect(ctx, x + 8 + i * 12, y + 6, 10, 9, i === 0 ? 4 : 2);
          ctx.fill();
        }
        if (plan.spec.express) {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(x + 8, y + 9.5, cars * 12 - 2, 2);
        }
        ctx.fillStyle = U.alpha(hex, 0.35);
        ctx.fillRect(x + 6, y + bh - 7, bw - 12, 3);
        ctx.fillStyle = hex;
        ctx.fillRect(x + 6, y + bh - 7, (bw - 12) * k, 3);
      }

      function draw() {
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-1, 1) * shake * 10, U.rand(-1, 1) * shake * 10);
        drawBackdrop(ctx);
        for (const s of scorches) {
          ctx.fillStyle = U.alpha('#000000', 0.45 * Math.min(1, s.t / 2));
          ctx.beginPath();
          ctx.arc(s.x, s.y, 26 * s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        drawTracks(ctx, map, 1);
        drawSwitchArrows(ctx, map, 1);
        const open = state === 'menu' ? () => true : isActive;
        drawStations(ctx, map, open, 1, clock);
        for (const t of trains) {
          drawTrainCars(ctx, t.pts, t.cars, PALETTE[t.color].hex, t.express, 1,
            t.ghost ? 0.35 * Math.max(0, 1 - t.life / 6) + 0.1 : 1);
        }
        drawTunnels(ctx, map, 1);
        drawPreview();
        drawSwitchBadges(ctx, map, 1, hot, clock);
        for (const q of particles) {
          ctx.globalAlpha = U.clamp(q.life / q.max, 0, 1);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        ctx.font = '800 18px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const f of floats) {
          ctx.globalAlpha = U.clamp(f.t / 0.5, 0, 1);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // HUD
        const lw = pill(10, 10, map.name.toUpperCase(), C.text, false);
        for (let i = 0; i < MAX_STRIKES; i++) {
          const cx = 10 + lw + 18 + i * 22;
          const used = i < strikes;
          ctx.fillStyle = used ? C.p1 : U.alpha(C.panel, 0.88);
          ctx.beginPath();
          ctx.arc(cx, 24, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = used ? C.p1 : C.line;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          if (used) {
            ctx.strokeStyle = C.ink;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx - 4, 20);
            ctx.lineTo(cx + 4, 28);
            ctx.moveTo(cx + 4, 20);
            ctx.lineTo(cx - 4, 28);
            ctx.stroke();
          }
        }
        if (state !== 'menu') {
          const goal = mapIdx === unlocked - 1 && unlocked < maps.length
            ? 'NEXT MAP ' + Math.min(score, map.def.unlock) + '/' + map.def.unlock
            : 'DELIVERED ' + delivered;
          pill(W - 10, 10, goal, mapIdx === unlocked - 1 && unlocked < maps.length ? C.gold : C.mint, true);
        }

        if (banner) {
          const a = U.clamp(Math.min(banner.t / 0.5, (2.6 - banner.t) / 0.25), 0, 1);
          ctx.globalAlpha = a;
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          ctx.fillRect(0, H * 0.4 - 52, W, 104);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = FONT_BIG;
          ctx.fillStyle = banner.color;
          ctx.fillText(banner.text, W / 2, H * 0.4 - 10);
          ctx.font = FONT_HUD;
          ctx.fillStyle = C.text;
          ctx.fillText(banner.sub, W / 2, H * 0.4 + 30);
          ctx.globalAlpha = 1;
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(C.p1, flash * 0.35);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Input ---------- */

      api.on(canvas, 'pointerdown', (e) => {
        if (state !== 'play') return;
        const n = switchAt(api.toCanvas(e, canvas));
        if (n) flip(n);
      });
      api.on(canvas, 'pointermove', (e) => {
        hot = state === 'play' ? switchAt(api.toCanvas(e, canvas)) : null;
        canvas.style.cursor = hot ? 'pointer' : 'default';
      });
      api.on(canvas, 'pointerleave', () => { hot = null; });
      api.on(window, 'keydown', (e) => {
        if (state !== 'play' || e.repeat) return;
        const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
        if (!m) return;
        const n = map.switches[Number(m[1]) - 1];
        if (n) flip(n);
      });

      resetRun(0);
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
