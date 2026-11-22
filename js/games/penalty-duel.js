/* Penalty Duel — front-view penalty shootout where each keeper has one fake dive to bait the kicker. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 900;
  const H = 560;
  const POST_L = 200;
  const POST_R = 700;
  const BAR = 170;
  const GROUND = 360;
  const KX = 450;
  const SPOT = { x: 450, y: 505 };
  const POST_W = 8;
  const BALL_R0 = 15;        // ball radius on the spot
  const BALL_RG = 9;         // ball radius at the goal line
  const RUN_T = 0.55;
  const REACH = 265;
  const DIVE_T = 0.74;
  const BAIT = 0.8;          // dive time multiplier when diving away from your own fake
  const CURVE_PX = 95;
  const REGULATION = 5;
  const BIG = '800 44px Unbounded, sans-serif';
  const HUD = '600 15px "JetBrains Mono", monospace';
  const SMALL = '600 12px "JetBrains Mono", monospace';
  const GRASS = '#2E9E55';
  const GRASS2 = '#33A95C';
  const SKIN = '#E9C29A';
  const DIFF = {
    easy: { react: 0.32, err: 90, wrong: 0.25, antic: 0, aimErr: 50, power: [0.64, 0.14], away: 0.75, curve: 0.2, bait: 0.55, wide: [110, 195] },
    normal: { react: 0.22, err: 55, wrong: 0.12, antic: 0.1, aimErr: 32, power: [0.72, 0.08], away: 0.55, curve: 0.6, bait: 0.65, wide: [150, 218] },
    hard: { react: 0.15, err: 34, wrong: 0.06, antic: 0.2, aimErr: 20, power: [0.78, 0.05], away: 0.35, curve: 0.95, bait: 0.75, wide: [175, 228] }
  };
  const KEYS = [
    { act: 'Space', left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' },
    { act: 'Enter', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }
  ];

  /* ---------- Keeper pose ---------- */
  const lerpP = (a, b, t) => ({ x: U.lerp(a.x, b.x, t), y: U.lerp(a.y, b.y, t) });

  /* Body points for a keeper with lean in [-1, 1] and an optional dive at time kt (seconds after the strike). */
  function keeperPose(K, kt) {
    const lean = K.lean;
    let hip = { x: KX + lean * 16, y: 318 };
    let sh = { x: KX + lean * 34, y: 264 + Math.abs(lean) * 4 };
    let hands = [{ x: KX - 50 + lean * 44, y: 272 - lean * 10 }, { x: KX + 50 + lean * 44, y: 272 + lean * 10 }];
    let feet = [{ x: KX - 24 + lean * 4, y: GROUND - 2 }, { x: KX + 24 + lean * 4, y: GROUND - 2 }];
    const d = K.dive;
    if (d && kt >= d.at) {
      const q = U.clamp((kt - d.at) / d.dur, 0, 1);
      const p = 1 - (1 - q) * (1 - q);
      if (d.spread) {
        hip = lerpP(hip, { x: KX, y: 334 }, p);
        sh = lerpP(sh, { x: KX, y: 292 }, p);
        hands = [lerpP(hands[0], { x: KX - 92, y: 330 }, p), lerpP(hands[1], { x: KX + 92, y: 330 }, p)];
        feet = [lerpP(feet[0], { x: KX - 66, y: GROUND - 2 }, p), lerpP(feet[1], { x: KX + 66, y: GROUND - 2 }, p)];
      } else {
        const S0 = { x: KX, y: 264 };
        let dx = d.tx - S0.x;
        let dy = d.ty - S0.y;
        const L = Math.hypot(dx, dy) || 1;
        if (L > REACH) {
          dx *= REACH / L;
          dy *= REACH / L;
        }
        const ux = dx / (Math.hypot(dx, dy) || 1);
        const uy = dy / (Math.hypot(dx, dy) || 1);
        const px = -uy;
        const py = ux;
        const tgt = { x: S0.x + dx, y: S0.y + dy };
        const nsh = { x: S0.x + dx * 0.55, y: Math.min(GROUND - 14, S0.y + dy * 0.55) };
        const nhip = { x: nsh.x - ux * 52, y: Math.min(GROUND - 10, nsh.y - uy * 52 + 22) };
        sh = lerpP(sh, nsh, p);
        hip = lerpP(hip, nhip, p);
        hands = [lerpP(hands[0], { x: tgt.x + px * 12, y: tgt.y + py * 12 }, p), lerpP(hands[1], { x: tgt.x - px * 12, y: tgt.y - py * 12 }, p)];
        const fb = { x: nhip.x - ux * 52, y: Math.min(GROUND - 2, nhip.y - uy * 52 + 10) };
        feet = [lerpP(feet[0], { x: fb.x + px * 14, y: Math.min(GROUND - 2, fb.y + py * 14) }, p * 0.95),
          lerpP(feet[1], { x: fb.x - px * 14, y: Math.min(GROUND - 2, fb.y - py * 14) }, p * 0.95)];
      }
    }
    const ax = sh.x - hip.x;
    const ay = sh.y - hip.y;
    const al = Math.hypot(ax, ay) || 1;
    const head = { x: sh.x + (ax / al) * 25, y: sh.y + (ay / al) * 25 };
    return { hip, sh, hands, feet, head };
  }

  function segDist(px, py, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy || 1;
    const t = U.clamp(((px - a.x) * dx + (py - a.y) * dy) / l2, 0, 1);
    return Math.hypot(px - a.x - dx * t, py - a.y - dy * t);
  }

  /* Does a ball (radius r) at (x, y) touch the keeper? */
  function touchesKeeper(P, x, y, r) {
    if (segDist(x, y, P.hip, P.sh) < 22 + r) return true;
    if (Math.hypot(x - P.head.x, y - P.head.y) < 15 + r) return true;
    for (let i = 0; i < 2; i++) {
      if (segDist(x, y, P.sh, P.hands[i]) < 10 + r) return true;
      if (Math.hypot(x - P.hands[i].x, y - P.hands[i].y) < 17 + r) return true;
      if (segDist(x, y, P.hip, P.feet[i]) < 11 + r) return true;
    }
    return false;
  }

  function drawKeeper(ctx, P, shirt, glove) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Shadow on the grass.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse((P.hip.x + P.feet[0].x + P.feet[1].x) / 3, GROUND + 2, 46, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1E2238';
    ctx.lineWidth = 15;
    ctx.beginPath();
    ctx.moveTo(P.hip.x, P.hip.y);
    ctx.lineTo(P.feet[0].x, P.feet[0].y);
    ctx.moveTo(P.hip.x, P.hip.y);
    ctx.lineTo(P.feet[1].x, P.feet[1].y);
    ctx.stroke();
    ctx.fillStyle = '#F3F0FF';
    for (const f of P.feet) {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = shirt;
    ctx.lineWidth = 13;
    ctx.beginPath();
    ctx.moveTo(P.sh.x, P.sh.y);
    ctx.lineTo(P.hands[0].x, P.hands[0].y);
    ctx.moveTo(P.sh.x, P.sh.y);
    ctx.lineTo(P.hands[1].x, P.hands[1].y);
    ctx.stroke();
    ctx.lineWidth = 40;
    ctx.beginPath();
    ctx.moveTo(P.hip.x, P.hip.y);
    ctx.lineTo(P.sh.x, P.sh.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(15,13,36,0.25)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(U.lerp(P.hip.x, P.sh.x, 0.2) - 8, U.lerp(P.hip.y, P.sh.y, 0.2));
    ctx.lineTo(U.lerp(P.hip.x, P.sh.x, 0.8) - 8, U.lerp(P.hip.y, P.sh.y, 0.8));
    ctx.stroke();
    ctx.fillStyle = SKIN;
    ctx.beginPath();
    ctx.arc(P.head.x, P.head.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3A2A20';
    ctx.beginPath();
    ctx.arc(P.head.x, P.head.y - 3, 14, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    ctx.fillStyle = glove;
    for (const hnd of P.hands) {
      ctx.beginPath();
      ctx.arc(hnd.x, hnd.y, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(15,13,36,0.5)';
    ctx.lineWidth = 2;
    for (const hnd of P.hands) {
      ctx.beginPath();
      ctx.arc(hnd.x, hnd.y, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
  }

  function drawBall(ctx, x, y, r, rot, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = '#F7F7FB';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.fillStyle = '#26243F';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      ctx.lineTo(Math.cos(a) * r * 0.38, Math.sin(a) * r * 0.38);
    }
    ctx.closePath();
    ctx.fill();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2 + Math.PI / 5;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.92, r * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(15,13,36,0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* Goal frame and net. ripple: { x, y, t } or null. */
  function drawGoal(ctx, ripple) {
    // Back of the net.
    ctx.fillStyle = 'rgba(15,13,36,0.55)';
    ctx.beginPath();
    ctx.moveTo(POST_L, BAR);
    ctx.lineTo(POST_R, BAR);
    ctx.lineTo(POST_R - 30, GROUND - 40);
    ctx.lineTo(POST_R, GROUND);
    ctx.lineTo(POST_L, GROUND);
    ctx.lineTo(POST_L + 30, GROUND - 40);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(240,240,255,0.32)';
    ctx.lineWidth = 1.2;
    const off = (x, y) => {
      if (!ripple) return 0;
      const d = Math.hypot(x - ripple.x, y - ripple.y);
      return Math.sin(d * 0.09 - ripple.t * 16) * 9 * Math.exp(-d / 90) * Math.exp(-ripple.t * 2.2);
    };
    ctx.beginPath();
    for (let x = POST_L + 6; x < POST_R; x += 18) {
      ctx.moveTo(x, BAR + 4);
      for (let y = BAR + 4; y <= GROUND; y += 12) ctx.lineTo(x + off(x, y), y + off(x, y) * 0.6);
    }
    for (let y = BAR + 10; y < GROUND; y += 16) {
      ctx.moveTo(POST_L + 4, y);
      for (let x = POST_L + 4; x <= POST_R - 4; x += 12) ctx.lineTo(x + off(x, y), y + off(x, y) * 0.6);
    }
    ctx.stroke();
    // Side nets.
    ctx.strokeStyle = 'rgba(240,240,255,0.2)';
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const y = BAR + ((GROUND - BAR) * i) / 6;
      ctx.moveTo(POST_L, y);
      ctx.lineTo(POST_L - 26, y + 12);
      ctx.moveTo(POST_R, y);
      ctx.lineTo(POST_R + 26, y + 12);
    }
    ctx.stroke();
    // Frame.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(POST_L - POST_W / 2 + 4, BAR - POST_W / 2 + 5, POST_R - POST_L + POST_W, POST_W);
    ctx.fillStyle = '#F4F4FA';
    ctx.fillRect(POST_L - POST_W / 2, BAR - POST_W / 2, POST_W, GROUND - BAR + POST_W / 2);
    ctx.fillRect(POST_R - POST_W / 2, BAR - POST_W / 2, POST_W, GROUND - BAR + POST_W / 2);
    ctx.fillRect(POST_L - POST_W / 2, BAR - POST_W / 2, POST_R - POST_L + POST_W, POST_W);
    ctx.fillStyle = 'rgba(15,13,36,0.18)';
    ctx.fillRect(POST_L + 1, BAR, 3, GROUND - BAR);
    ctx.fillRect(POST_R + 1, BAR, 3, GROUND - BAR);
  }

  Arcade.register({
    id: 'penalty-duel',
    title: 'Penalty Duel',
    category: 'sports',
    mode: 'together',
    players: '1–2P',
    color: C.p1,
    best: false,
    tagline: 'Take turns shooting and saving in a five-kick penalty shootout.',
    hook: 'Keepers can fake a dive to bait the kicker, but only once per round.',
    tags: ['sports', 'soccer', 'football', 'penalty', 'shootout', 'goalkeeper', 'versus', 'computer opponent', 'timing'],
    howTo: 'Each side takes five penalties, then it goes to sudden death. As the kicker, stop the moving target where you want ' +
      'the ball to go, then stop the power meter: green is good, red sails over the bar. Hold left or right during the run-up ' +
      'and flight to curve the shot. As the keeper, dive with your direction keys once the ball is struck (add up for a high dive); ' +
      'the sooner you react, the further you reach, but dive before the kick and the kicker can bend it away. ' +
      'The twist: before the kick each keeper may fake once per round. You lean one way where the kicker can see it, and a dive ' +
      'the other way gets a burst of speed. Roles swap every kick.',
    controls: [
      { keys: ['Space'], label: 'Coral kicker: stop aim, then power' },
      { keys: ['A', 'D'], label: 'Coral: curve the shot, or fake and dive as keeper' },
      { keys: ['W', 'S'], label: 'Coral keeper: high dive / stay big' },
      { keys: ['Enter'], label: 'Cyan kicker: stop aim, then power' },
      { keys: ['←', '→', '↑', '↓'], label: 'Cyan: curve, or fake and dive as keeper' },
      { keys: ['Tap'], label: 'vs computer: tap to stop aim and power, or tap where to dive' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      // Crowd.
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 24; i++) {
          ctx.fillStyle = [C.panel2, U.alpha(C.p1, 0.55), U.alpha(C.p2, 0.55), C.panel][(i + r * 2) % 4];
          ctx.beginPath();
          ctx.arc(6 + i * 13.5 + r * 4, 14 + r * 13 + Math.sin(t * 5 + i) * 1.2, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.fillStyle = GRASS;
      ctx.fillRect(0, 60, 320, 140);
      ctx.fillStyle = GRASS2;
      for (let i = 0; i < 6; i++) ctx.fillRect(i * 64, 60, 32, 140);
      ctx.save();
      ctx.translate(160, 0);
      ctx.scale(0.5, 0.5);
      ctx.translate(-KX, -20);
      drawGoal(ctx, null);
      // Keeper leaning left: the fake.
      const lean = -0.6 - 0.4 * Math.max(0, Math.sin(t * 2));
      const P = keeperPose({ lean, dive: null }, 0);
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawKeeper(ctx, keeperPose({ lean: 0, dive: { tx: POST_R - 30, ty: BAR + 40, at: 0, dur: 1 } }, 1), C.p2, C.gold);
      ctx.restore();
      drawKeeper(ctx, P, C.p2, C.gold);
      ctx.restore();
      // The ball bending into the far corner.
      ctx.fillStyle = U.alpha('#FFFFFF', 0.7);
      for (let f = 0.1; f < 0.9; f += 0.08) {
        const x = U.lerp(160, 272, f) + Math.sin(f * Math.PI) * -14;
        const y = U.lerp(186, 112, f) - Math.sin(f * Math.PI) * 20;
        ctx.beginPath();
        ctx.arc(x, y, 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
      drawBall(ctx, 268, 114, 6, t * 4, 1);
      ctx.fillStyle = C.p1;
      U.roundRect(ctx, 12, 150, 96, 34, 10);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.font = '800 16px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FAKE?', 60, 167);
      ctx.strokeStyle = C.p1;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(108, 160);
      ctx.quadraticCurveTo(122, 140, 128, 120);
      ctx.stroke();
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // menu | intro | aim | power | runup | flight | result | replay | over
      let mode = 'duo';   // duo | cpu
      let diff = 'normal';
      let players = [];
      let kickNo = 0;
      let sudden = false;
      let stateT = 0;
      let clock = 0;
      let reticle = { x: KX, y: 265 };
      let aim = null;
      let power = 0;
      let curve = 0;
      let kt = 0;
      let flightT = 0.6;
      let lift = 0;
      let K = null;          // keeper state for the current kick
      let ball = { x: SPOT.x, y: SPOT.y, r: BALL_R0, rot: 0, alpha: 1 };
      let after = null;      // ball motion after the outcome
      let outcome = null;
      let ripple = null;
      let banner = null;
      let parts = [];
      let shake = 0;
      let flash = 0;
      let flashColor = C.text;
      let crowdJump = 0;
      let crowdSide = 0;
      let rec = [];
      let replayT = 0;
      let pointer = null;
      let told = {};
      let cpuK = null;       // computer kicker plan
      let cpuG = null;       // computer keeper plan
      let tend = null;       // computer kicker tendencies for this match

      const kicker = () => kickNo % 2;
      const keeper = () => 1 - (kickNo % 2);
      const isHuman = (i) => mode === 'duo' || i === 0;
      const goals = (i) => players[i].kicks.filter(Boolean).length;
      const keyset = (i) => (mode === 'cpu' ? KEYS : [KEYS[i]]);
      const held = (i, name) => keyset(i).some((k) => api.keys.has(k[name]));
      const preKick = () => state === 'intro' || state === 'aim' || state === 'power';
      const live = () => state === 'runup' || state === 'flight';

      function updateScore() {
        if (players.length) api.setScore(goals(0) + ' – ' + goals(1));
      }

      /* ---------- Effects ---------- */
      function burst(x, y, color, n, speed, life, size) {
        for (let i = 0; i < n && parts.length < 400; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = speed * U.rand(0.25, 1);
          parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: life * U.rand(0.6, 1), max: life, color,
            size: size * U.rand(0.6, 1.3) });
        }
      }

      function hint(key, text) {
        if (told[key]) return;
        told[key] = true;
        api.setStatus(text);
      }

      /* ---------- Match flow ---------- */
      function startMatch(m, d) {
        mode = m;
        diff = d || diff;
        players = (m === 'cpu' ? ['You', 'Computer'] : ['Coral', 'Cyan']).map((name, i) => ({
          name, color: i === 0 ? C.p1 : C.p2, kicks: [], fakeUsed: false
        }));
        kickNo = 0;
        sudden = false;
        told = {};
        tend = { side: Math.random() < 0.5 ? -1 : 1, low: U.rand(0.45, 0.7) };
        updateScore();
        startIntro();
      }

      function startIntro() {
        state = 'intro';
        stateT = 0;
        aim = null;
        power = 0;
        curve = 0;
        kt = -RUN_T;
        lift = 0;
        outcome = null;
        after = null;
        ripple = null;
        banner = null;
        rec = [];
        pointer = null;
        ball = { x: SPOT.x, y: SPOT.y, r: BALL_R0, rot: 0, alpha: 1 };
        reticle = { x: KX, y: 265 };
        K = { lean: 0, leanTarget: 0, fakeSide: 0, dive: null, pending: null };
        cpuK = null;
        cpuG = null;
        const ki = kicker();
        const gi = keeper();
        const kp = players[ki];
        const gp = players[gi];
        if (!isHuman(ki)) planCpuKick();
        if (!isHuman(gi)) planCpuKeeper();
        const round = Math.floor(kickNo / 2) + 1;
        if (mode === 'cpu') {
          api.setStatus(isHuman(ki)
            ? 'Round ' + round + ': you kick. Space or tap stops the target, then the power. Hold ←/→ to curve.'
            : 'Round ' + round + ': you keep. ' + (gp.fakeUsed ? '' : '←/→ before the kick fakes a lean (once per round). ') +
              'Dive with ←/→ (↑ for high) or tap where to dive.');
        } else {
          api.setStatus('Round ' + round + ': ' + kp.name + ' kicks (' + (ki === 0 ? 'Space, A/D curve' : 'Enter, ←/→ curve') + '), ' +
            gp.name + ' keeps (' + (gi === 0 ? 'A/D dive, W high' : '←/→ dive, ↑ high') + ').' +
            (gp.fakeUsed ? '' : ' The keeper can fake once.'));
        }
      }

      function startAim() {
        state = 'aim';
        stateT = 0;
        api.sfx('blip');
      }

      function lockAim() {
        if (state !== 'aim') return;
        aim = { x: reticle.x, y: reticle.y };
        state = 'power';
        stateT = 0;
        api.sfx('tick');
      }

      function lockPower() {
        if (state !== 'power') return;
        state = 'runup';
        stateT = 0;
        kt = -RUN_T;
        api.sfx('tick');
        if (power > 0.88) hint('over', 'That is a lot of power: anything in the red rises and can sail over the bar.');
      }

      function strike() {
        state = 'flight';
        kt = 0;
        flightT = 0.95 - 0.5 * power;
        lift = power > 0.88 ? ((power - 0.88) / 0.12) * 135 : 0;
        api.sfx('hit');
        burst(SPOT.x, SPOT.y + 6, '#9EE6B0', 10, 140, 0.4, 3);
        if (!isHuman(keeper())) cpuKeeperAtStrike();
        if (K.dive && K.dive.at < 0) {
          hint('early', 'The keeper went early, so the kicker can still curve the ball away from the dive.');
        }
      }

      function finalPoint() {
        return { x: aim.x + curve * CURVE_PX, y: aim.y - lift };
      }

      function resolve() {
        const P = finalPoint();
        const r = BALL_RG;
        const pose = keeperPose(K, kt);
        let res;
        const inX = P.x > POST_L && P.x < POST_R;
        const nearPost = Math.min(Math.abs(P.x - POST_L), Math.abs(P.x - POST_R)) < r + POST_W / 2 && P.y > BAR - r;
        const nearBar = Math.abs(P.y - BAR) < r + POST_W / 2 && P.x > POST_L - r && P.x < POST_R + r;
        if (P.y < BAR - r - POST_W / 2) res = 'over';
        else if (P.x < POST_L - r - POST_W / 2 || P.x > POST_R + r + POST_W / 2) res = 'wide';
        else if (touchesKeeper(pose, P.x, P.y, r)) res = 'save';
        else if (nearPost || nearBar) res = inX && P.y > BAR ? 'postin' : 'post';
        else res = 'goal';
        outcome = { res, x: P.x, y: P.y };
        const ki = kicker();
        const scored = res === 'goal' || res === 'postin';
        players[ki].kicks.push(scored);
        updateScore();
        state = 'result';
        stateT = 0;
        const kp = players[ki];
        const gp = players[keeper()];
        if (scored) {
          ripple = { x: P.x, y: P.y, t: 0 };
          after = { x0: P.x, y0: P.y, vx: (P.x - KX) * 0.15, vy: 30, g: 500, r0: r, dr: -3, floor: GROUND - 6 };
          banner = { text: res === 'postin' ? 'In off the post!' : 'Goal!', color: kp.color, t: 0 };
          api.sfx('score');
          crowdJump = 1;
          crowdSide = ki;
          flash = 0.5;
          flashColor = kp.color;
          burst(P.x, P.y, kp.color, 26, 220, 0.8, 4);
        } else if (res === 'save') {
          const dir = P.x < KX ? -1 : 1;
          after = { x0: P.x, y0: P.y, vx: dir * 260, vy: -160, g: 900, r0: r, dr: 9, floor: 9999 };
          banner = { text: 'Saved!', color: gp.color, t: 0 };
          api.sfx('power');
          shake = 6;
          crowdJump = 0.8;
          crowdSide = keeper();
          burst(P.x, P.y, gp.color, 20, 200, 0.6, 4);
          burst(P.x, P.y, C.text, 8, 160, 0.4, 3);
        } else if (res === 'post') {
          after = { x0: P.x, y0: P.y, vx: (P.x < KX ? 1 : -1) * 120, vy: 140, g: 600, r0: r, dr: 8, floor: 9999 };
          banner = { text: 'Off the woodwork!', color: C.gold, t: 0 };
          api.sfx('hit');
          shake = 5;
        } else {
          after = res === 'over'
            ? { x0: P.x, y0: P.y, vx: (P.x - KX) * 0.4, vy: -220, g: 200, r0: r, dr: -4, floor: 9999 }
            : { x0: P.x, y0: P.y, vx: (P.x < KX ? -1 : 1) * 260, vy: -40, g: 200, r0: r, dr: -3, floor: 9999 };
          banner = { text: res === 'over' ? 'Over the bar!' : 'Wide!', color: C.muted, t: 0 };
          api.sfx('lose');
        }
        if (res === 'save' && K.dive && K.dive.baited) {
          hint('baited', 'The fake worked: the keeper leaned one way and sprang the other.');
        }
      }

      /* Is the shootout decided? */
      function decided() {
        const a = goals(0);
        const b = goals(1);
        const ta = players[0].kicks.length;
        const tb = players[1].kicks.length;
        if (!sudden) {
          const ra = REGULATION - ta;
          const rb = REGULATION - tb;
          if (a > b + rb || b > a + ra) return true;
          if (ta === REGULATION && tb === REGULATION) {
            if (a !== b) return true;
            sudden = true;
            players.forEach((p) => { p.fakeUsed = false; });
          }
          return false;
        }
        return ta === tb && a !== b;
      }

      function nextKick() {
        kickNo++;
        const wasSudden = sudden;
        if (decided()) {
          finish();
          return;
        }
        startIntro();
        if (sudden && !wasSudden) {
          banner = { text: 'Sudden death!', color: C.gold, t: 0 };
          stateT = -1;
          api.sfx('power');
          api.setStatus('Sudden death: one kick each until someone misses. Both keepers get a fresh fake.');
        }
      }

      function finish() {
        state = 'over';
        const a = goals(0);
        const b = goals(1);
        const w = a > b ? 0 : 1;
        api.sfx(mode === 'cpu' && w === 1 ? 'lose' : 'win');
        const title = mode === 'cpu' ? (w === 0 ? 'You win the shootout!' : 'The computer wins') : players[w].name + ' wins!';
        const line = (p) => p.name + ': ' + p.kicks.map((k) => (k ? '●' : '○')).join(' ');
        api.setStatus('Shootout over: ' + a + ' – ' + b + '.');
        api.menu({
          title,
          text: 'Final score ' + a + ' – ' + b + (sudden ? ' after sudden death.' : '.') + '\n' + line(players[0]) + '\n' + line(players[1]),
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startMatch(mode, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      function showStartMenu() {
        state = 'menu';
        players = [];
        K = { lean: 0, leanTarget: 0, fakeSide: 0, dive: null, pending: null };
        api.setScore('—');
        api.setStatus('Five kicks each, then sudden death. Keepers get one fake lean per round.');
        api.menu({
          title: 'Penalty Duel',
          text: 'Take turns kicking and keeping. Each keeper can fake a dive once to bait the kicker.',
          buttons: [
            { label: '2 players', primary: true, onClick: () => startMatch('duo') },
            { label: 'vs computer', onClick: showDifficultyMenu }
          ]
        });
      }

      function showDifficultyMenu() {
        api.menu({
          title: 'Computer skill',
          text: 'You kick first, then keep. Space or Enter stops the target and the power; arrows or A/D curve and dive. You can also tap.',
          buttons: [
            { label: 'Easy', onClick: () => startMatch('cpu', 'easy') },
            { label: 'Normal', primary: true, onClick: () => startMatch('cpu', 'normal') },
            { label: 'Hard', onClick: () => startMatch('cpu', 'hard') }
          ]
        });
      }

      /* ---------- Keeper actions ---------- */
      function fake(side) {
        const gp = players[keeper()];
        if (!preKick() || gp.fakeUsed || !side) return false;
        gp.fakeUsed = true;
        K.fakeSide = side;
        K.leanTarget = side;
        api.sfx('flip');
        hint('fake', mode === 'cpu' && keeper() === 0
          ? 'Fake used: you lean that way, and a dive the other way now gets a burst of speed.'
          : 'The keeper is leaning. It might be a fake: a keeper who fakes one way dives faster the other way.');
        return true;
      }

      function dive(tx, ty, spread) {
        if (!live() || K.dive) return;
        const horiz = spread ? 0 : Math.sign(tx - KX);
        const baited = K.fakeSide && horiz === -K.fakeSide;
        K.dive = { tx: U.clamp(tx, POST_L - 40, POST_R + 40), ty: U.clamp(ty, BAR - 30, GROUND), at: kt, dur: DIVE_T * (baited ? BAIT : 1),
          spread: !!spread, baited };
        K.leanTarget = 0;
        api.sfx('shoot');
      }

      /* Turn held keys into a dive target a moment after the first press, so diagonals register. */
      function diveFromKeys(gi) {
        const l = held(gi, 'left');
        const r = held(gi, 'right');
        const up = held(gi, 'up');
        const down = held(gi, 'down');
        const hdir = (r ? 1 : 0) - (l ? 1 : 0);
        if (!hdir && !up && !down) return;
        if (!hdir && down) {
          dive(KX, GROUND, true);
          return;
        }
        const tx = hdir ? (hdir < 0 ? POST_L + 34 : POST_R - 34) : KX;
        const ty = up ? BAR + 26 : down ? GROUND - 18 : hdir ? 300 : BAR + 20;
        dive(tx, ty, false);
      }

      /* ---------- Computer ---------- */
      function planCpuKick() {
        cpuK = { wander: U.rand(0.7, 1.4), glide: 0.35, target: null, powerAt: 0, power: 0, curveDir: 0 };
      }

      function cpuChooseTarget() {
        const D = DIFF[diff];
        let side = Math.random() < 0.62 ? tend.side : -tend.side;
        if (K.fakeSide) {
          // Reacting to a fake lean: easy computers shoot away from it, hard ones see through it.
          side = Math.random() < D.away ? -K.fakeSide : K.fakeSide;
        }
        const r = Math.random();
        const high = r > tend.low + 0.15;
        const middle = r > tend.low && !high;
        const x = middle ? KX + side * U.rand(40, 110) : KX + side * U.rand(D.wide[0], D.wide[1]);
        const y = high ? U.rand(BAR + 18, BAR + 55) : middle ? U.rand(230, 300) : U.rand(300, GROUND - 14);
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        return { x: x + g() * D.aimErr, y: y + g() * D.aimErr * 0.6 };
      }

      function cpuKickUpdate(dt) {
        if (!cpuK) return;
        const D = DIFF[diff];
        if (state === 'aim') {
          if (stateT > cpuK.wander) {
            if (!cpuK.target) cpuK.target = cpuChooseTarget();
            const f = Math.min(1, dt * 7);
            reticle.x = U.lerp(reticle.x, cpuK.target.x, f);
            reticle.y = U.lerp(reticle.y, cpuK.target.y, f);
            if (stateT > cpuK.wander + cpuK.glide) {
              reticle.x = cpuK.target.x;
              reticle.y = cpuK.target.y;
              lockAim();
              const g = (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
              cpuK.power = U.clamp(D.power[0] + g * D.power[1] * 2, 0.3, 1);
            }
          }
        } else if (state === 'power') {
          if (power >= cpuK.power - 0.02 && stateT > 0.25) {
            power = cpuK.power;
            lockPower();
          }
        } else if (live()) {
          // Bend the ball away from a keeper who committed early.
          if (K.dive && !K.dive.spread && kt < 0.12 && !cpuK.curveDir && cpuK.curveRolled !== true) {
            cpuK.curveRolled = true;
            const diveSide = Math.sign(K.dive.tx - KX);
            const shotSide = Math.sign(aim.x - KX);
            if (diveSide === shotSide && Math.random() < D.curve) cpuK.curveDir = -diveSide;
          }
          if (cpuK.curveDir) curve = U.clamp(curve + cpuK.curveDir * 2.4 * dt, -1, 1);
        }
      }

      function planCpuKeeper() {
        const D = DIFF[diff];
        const gp = players[keeper()];
        const faced = players[kicker()].kicks.length;
        let willFake = false;
        if (!gp.fakeUsed) {
          const left = sudden ? 2 : Math.max(1, REGULATION - faced);
          willFake = Math.random() < 1 / left;
        }
        cpuG = { fakeAt: willFake ? U.rand(0.3, 1.2) : -1, fakeSide: Math.random() < 0.5 ? -1 : 1, bait: Math.random() < D.bait };
      }

      function cpuKeeperPre() {
        if (!cpuG || cpuG.fakeAt < 0 || players[keeper()].fakeUsed) return;
        if (state === 'aim' && stateT > cpuG.fakeAt) fake(cpuG.fakeSide);
      }

      function cpuKeeperAtStrike() {
        const D = DIFF[diff];
        const P = finalPoint();
        const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
        let tx = P.x + g() * D.err;
        const ty = U.clamp(P.y + g() * D.err * 0.6, BAR + 10, GROUND - 10);
        if (Math.random() < D.wrong) tx = KX - (tx - KX);
        // After its fake, the computer usually springs the other way (the bait), unless a hard one reads the shot clearly.
        if (K.fakeSide && cpuG.bait) {
          const strong = Math.abs(tx - KX) > 130 && Math.sign(tx - KX) === K.fakeSide;
          if (!(strong && diff === 'hard')) tx = KX - K.fakeSide * Math.max(150, Math.abs(tx - KX));
        }
        let at = D.react * U.rand(0.8, 1.25);
        if (Math.random() < D.antic) at = 0;
        cpuG.diveAt = at;
        cpuG.tx = tx;
        cpuG.ty = ty;
        cpuG.spread = Math.abs(tx - KX) < 45 && ty > 290;
      }

      function cpuKeeperUpdate() {
        if (!cpuG || K.dive || state !== 'flight' || cpuG.diveAt === undefined) return;
        if (kt >= cpuG.diveAt) {
          if (Math.abs(cpuG.tx - KX) < 45 && cpuG.ty < 290) dive(KX, BAR + 20, false);
          else if (cpuG.spread) dive(KX, GROUND, true);
          else dive(cpuG.tx, cpuG.ty, false);
        }
      }

      /* ---------- Update ---------- */
      function recordFrame() {
        rec.push({ kt, bx: ball.x, by: ball.y, br: ball.r, rot: ball.rot, pose: keeperPose(K, kt), alpha: ball.alpha });
        if (rec.length > 240) rec.shift();
      }

      function update(dt) {
        clock += dt;
        stateT += dt;
        shake = Math.max(0, shake - dt * 25);
        flash = Math.max(0, flash - dt * 2);
        crowdJump = Math.max(0, crowdJump - dt * 0.7);
        if (banner) banner.t += dt;
        if (ripple) ripple.t += dt;
        for (const q of parts) {
          q.vy += 400 * dt;
          q.x += q.vx * dt;
          q.y += q.vy * dt;
          q.life -= dt;
        }
        parts = parts.filter((q) => q.life > 0);
        if (K) K.lean += (K.leanTarget - K.lean) * Math.min(1, dt * 9);
        if (state === 'menu' || state === 'over') {
          if (state === 'menu' && K) K.leanTarget = Math.sin(clock * 0.9) > 0.6 ? 0.7 : Math.sin(clock * 0.9) < -0.6 ? -0.7 : 0;
          return;
        }
        const ki = kicker();
        const gi = keeper();

        if (state === 'intro') {
          if (stateT > 1.5) startAim();
          if (!isHuman(gi)) cpuKeeperPre();
          return;
        }
        if (state === 'aim') {
          if (isHuman(ki)) {
            const s = 1 + (sudden ? 0.15 : 0);
            reticle.x = KX + 285 * Math.sin(clock * 1.65 * s);
            reticle.y = 262 + 100 * Math.sin(clock * 2.45 * s + 0.8);
            if (stateT > 7) lockAim();
          } else {
            if (!cpuK.target) {
              reticle.x = KX + 285 * Math.sin(clock * 1.65);
              reticle.y = 262 + 100 * Math.sin(clock * 2.45 + 0.8);
            }
            cpuKickUpdate(dt);
          }
          if (!isHuman(gi)) cpuKeeperPre();
          return;
        }
        if (state === 'power') {
          const ph = (stateT / 0.85) % 2;
          power = ph < 1 ? ph : 2 - ph;
          if (isHuman(ki)) {
            if (stateT > 5) lockPower();
          } else {
            cpuKickUpdate(dt);
          }
          return;
        }
        if (state === 'runup' || state === 'flight') {
          kt += dt;
          // Curve: the kicker holds a direction (or a finger on one side of the screen).
          if (isHuman(ki)) {
            let c = (held(ki, 'right') ? 1 : 0) - (held(ki, 'left') ? 1 : 0);
            if (!c && pointer && (mode === 'duo' || ki === 0)) c = pointer.x < W / 2 - 90 ? -1 : pointer.x > W / 2 + 90 ? 1 : 0;
            if (c) {
              curve = U.clamp(curve + c * 2.4 * dt, -1, 1);
              if (Math.abs(curve) > 0.3) hint('curve', 'Holding a direction bends the ball. Use it to beat a keeper who dives early.');
            }
          } else {
            cpuKickUpdate(dt);
          }
          if (K.pending !== null && kt >= K.pending) {
            K.pending = null;
            diveFromKeys(gi);
          }
          if (!isHuman(gi)) cpuKeeperUpdate();
          if (state === 'runup') {
            if (kt >= 0) strike();
          } else {
            const f = Math.min(1, kt / flightT);
            const P = { x: aim.x + curve * CURVE_PX * f * f, y: aim.y - lift };
            const arc = 34 + (1 - power) * 50;
            ball.x = U.lerp(SPOT.x, P.x, f);
            ball.y = U.lerp(SPOT.y, P.y, f) - arc * 4 * f * (1 - f);
            ball.r = U.lerp(BALL_R0, BALL_RG, f);
            ball.rot += dt * (10 + curve * 8);
            if (f >= 1) resolve();
          }
          recordFrame();
          return;
        }
        if (state === 'result') {
          kt += dt;
          const t = stateT;
          if (after) {
            ball.x = after.x0 + after.vx * t;
            ball.y = Math.min(after.floor, after.y0 + after.vy * t + 0.5 * after.g * t * t);
            ball.r = Math.max(4, after.r0 + after.dr * t);
            ball.rot += dt * 6;
            if (outcome.res === 'over' || outcome.res === 'wide') ball.alpha = Math.max(0, 1 - t * 1.2);
          }
          if (t < 0.25) recordFrame();
          const scored = outcome.res === 'goal' || outcome.res === 'postin';
          if (t > (scored ? 1.1 : 1.6)) {
            if (scored && rec.length > 4) {
              state = 'replay';
              stateT = 0;
              replayT = 0;
            } else {
              nextKick();
            }
          }
          return;
        }
        if (state === 'replay') {
          replayT += dt;
          if (replayT > 0.8) nextKick();
        }
      }

      /* ---------- Drawing ---------- */
      function bigText(text, x, y, color, scale, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
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

      function drawStadium() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        // Stands with a crowd in both players' colours.
        for (let r = 0; r < 5; r++) {
          const y = 76 + r * 26;
          ctx.fillStyle = r % 2 ? C.panel : '#191536';
          ctx.fillRect(0, y - 14, W, 26);
          for (let i = 0, x = 8 + (r % 2) * 11; x < W; i++, x += 22) {
            const side = x < W / 2 ? 0 : 1;
            const col = (i + r) % 3 === 0 ? (side ? C.p2 : C.p1) : (i + r) % 3 === 1 ? '#3A3470' : '#2B2558';
            const jump = crowdJump > 0 && side === crowdSide ? Math.max(0, Math.sin(clock * 14 + i * 1.3)) * crowdJump * 8 : 0;
            ctx.fillStyle = (i + r) % 3 === 0 ? U.alpha(col, 0.75) : col;
            ctx.beginPath();
            ctx.arc(x, y - jump, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(x - 8, y - jump + 5, 16, 10);
          }
        }
        // Advertising boards.
        ctx.fillStyle = C.panel2;
        ctx.fillRect(0, 196, W, 26);
        ctx.font = '800 14px "JetBrains Mono", monospace';
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = [C.gold, C.mint, C.violet][i % 3];
          ctx.fillText(['PLAYREALM', 'PENALTY DUEL', 'ONE FAKE ONLY'][i % 3], 75 + i * 150, 209);
        }
        // Pitch with mowing stripes.
        ctx.fillStyle = GRASS;
        ctx.fillRect(0, 222, W, H - 222);
        ctx.fillStyle = GRASS2;
        for (let i = 0; i < 9; i++) {
          ctx.beginPath();
          const x0 = i * 100;
          ctx.moveTo(x0 + 25, 222);
          ctx.lineTo(x0 + 75, 222);
          ctx.lineTo(KX + (x0 + 75 - KX) * 1.6, H);
          ctx.lineTo(KX + (x0 + 25 - KX) * 1.6, H);
          ctx.closePath();
          ctx.fill();
        }
        // Lines: goal line, six-yard box, penalty spot.
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, GROUND);
        ctx.lineTo(W, GROUND);
        ctx.moveTo(POST_L - 70, GROUND);
        ctx.lineTo(POST_L - 100, GROUND + 52);
        ctx.lineTo(POST_R + 100, GROUND + 52);
        ctx.lineTo(POST_R + 70, GROUND);
        ctx.moveTo(60, GROUND);
        ctx.lineTo(-20, H);
        ctx.moveTo(W - 60, GROUND);
        ctx.lineTo(W + 20, H);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(SPOT.x, SPOT.y + 12, 12, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      function drawKicker() {
        if (!players.length) return;
        const ki = kicker();
        const col = players[ki].color;
        let x = 380;
        let y = 556;
        let swing = 0;
        if (state === 'runup') {
          const f = U.clamp(1 + kt / RUN_T, 0, 1);
          x = U.lerp(372, 420, f);
          y = U.lerp(560, 538, f);
          swing = Math.sin(f * Math.PI * 4) * 0.5;
        } else if (state === 'flight' || state === 'result' || state === 'replay') {
          x = 422;
          y = 538;
          swing = 1;
        }
        ctx.lineCap = 'round';
        // Legs.
        ctx.strokeStyle = '#1E2238';
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 40);
        ctx.lineTo(x - 14 - swing * 6, y + 10);
        ctx.moveTo(x + 10, y - 40);
        ctx.lineTo(x + 18 + swing * 22, y + 4 - swing * 26);
        ctx.stroke();
        // Shirt from behind with a number.
        ctx.fillStyle = col;
        U.roundRect(ctx, x - 30, y - 118, 60, 82, 18);
        ctx.fill();
        ctx.fillStyle = U.alpha(C.ink, 0.35);
        ctx.font = '800 28px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String((kickNo % 10) + 1), x, y - 80);
        // Arms.
        ctx.strokeStyle = SKIN;
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(x - 26, y - 108);
        ctx.lineTo(x - 46 - swing * 10, y - 70 + swing * 10);
        ctx.moveTo(x + 26, y - 108);
        ctx.lineTo(x + 44, y - 74 - swing * 12);
        ctx.stroke();
        // Head from behind.
        ctx.fillStyle = '#3A2A20';
        ctx.beginPath();
        ctx.arc(x, y - 134, 17, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineCap = 'butt';
      }

      function drawReticle() {
        if (!players.length) return;
        const kp = players[kicker()];
        if (state === 'aim' || state === 'power' || state === 'runup') {
          const p = state === 'aim' ? reticle : aim;
          const locked = state !== 'aim';
          const r = 20 + (locked ? 0 : Math.sin(clock * 10) * 2);
          ctx.strokeStyle = kp.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.moveTo(p.x - r - 8, p.y);
          ctx.lineTo(p.x - r + 8, p.y);
          ctx.moveTo(p.x + r - 8, p.y);
          ctx.lineTo(p.x + r + 8, p.y);
          ctx.moveTo(p.x, p.y - r - 8);
          ctx.lineTo(p.x, p.y - r + 8);
          ctx.moveTo(p.x, p.y + r - 8);
          ctx.lineTo(p.x, p.y + r + 8);
          ctx.stroke();
          if (locked) {
            ctx.fillStyle = U.alpha(kp.color, 0.35);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
            ctx.fill();
          }
          // Show where curve is bending the shot.
          if (state === 'runup' && Math.abs(curve) > 0.05) {
            ctx.strokeStyle = U.alpha(kp.color, 0.6);
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(p.x + curve * CURVE_PX, p.y, 12, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      function drawPowerMeter() {
        if (!players.length) return;
        if (state !== 'power' && state !== 'runup' && state !== 'flight') return;
        const x = 836;
        const y0 = 250;
        const hgt = 230;
        ctx.fillStyle = U.alpha(C.ink, 0.85);
        U.roundRect(ctx, x - 6, y0 - 26, 44, hgt + 52, 12);
        ctx.fill();
        // Zones: weak, good, risky, over the bar.
        const zones = [[0, 0.45, '#5A6A9E'], [0.45, 0.8, C.mint], [0.8, 0.88, C.gold], [0.88, 1, C.p1]];
        zones.forEach(([a, b, col]) => {
          ctx.fillStyle = U.alpha(col, 0.8);
          ctx.fillRect(x + 4, y0 + hgt * (1 - b), 24, hgt * (b - a));
        });
        ctx.fillStyle = C.text;
        const py = y0 + hgt * (1 - power);
        ctx.beginPath();
        ctx.moveTo(x - 2, py);
        ctx.lineTo(x - 12, py - 7);
        ctx.lineTo(x - 12, py + 7);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(x + 2, py - 2, 28, 4);
        ctx.font = SMALL;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.muted;
        ctx.fillText('POWER', x + 16, y0 - 12);
        ctx.fillStyle = C.p1;
        ctx.fillText('OVER', x + 16, y0 + hgt + 14);
      }

      function drawHud() {
        ctx.fillStyle = U.alpha(C.ink, 0.85);
        ctx.fillRect(0, 0, W, 50);
        ctx.fillStyle = C.line;
        ctx.fillRect(0, 48, W, 2);
        if (!players.length) {
          ctx.font = HUD;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = C.muted;
          ctx.fillText('Five kicks each · one fake per keeper', W / 2, 25);
          return;
        }
        ctx.font = HUD;
        ctx.textBaseline = 'middle';
        const total = Math.max(REGULATION, players[0].kicks.length, players[1].kicks.length);
        const n = Math.min(7, total);
        const first = total - n;
        players.forEach((p, i) => {
          const right = i === 1;
          const x0 = right ? W - 18 : 18;
          ctx.textAlign = right ? 'right' : 'left';
          ctx.fillStyle = p.color;
          const role = state !== 'over' ? (kicker() === i ? ' · kicking' : ' · keeping') : '';
          ctx.fillText(p.name + role, x0, 16);
          // Kick markers.
          for (let k = 0; k < n; k++) {
            const cx = right ? x0 - 8 - k * 22 : x0 + 8 + k * 22;
            const v = p.kicks[first + k];
            ctx.beginPath();
            ctx.arc(cx, 36, 7, 0, Math.PI * 2);
            if (v === true) {
              ctx.fillStyle = C.mint;
              ctx.fill();
            } else if (v === false) {
              ctx.fillStyle = C.p1;
              ctx.fill();
              ctx.strokeStyle = C.ink;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(cx - 3, 33);
              ctx.lineTo(cx + 3, 39);
              ctx.moveTo(cx + 3, 33);
              ctx.lineTo(cx - 3, 39);
              ctx.stroke();
            } else {
              ctx.strokeStyle = first + k >= REGULATION ? C.gold : C.line;
              ctx.lineWidth = 2;
              ctx.stroke();
            }
          }
          // Fake token.
          const fx = right ? x0 - n * 22 - 40 : x0 + n * 22 + 40;
          ctx.fillStyle = p.fakeUsed ? U.alpha(C.muted, 0.3) : C.gold;
          ctx.font = SMALL;
          ctx.fillText(p.fakeUsed ? 'fake used' : 'fake ready', fx + (right ? 0 : -20), 36);
          ctx.font = HUD;
        });
        ctx.textAlign = 'center';
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(goals(0) + ' – ' + goals(1), W / 2, 22);
        ctx.font = SMALL;
        ctx.fillStyle = sudden ? C.gold : C.muted;
        ctx.fillText(sudden ? 'SUDDEN DEATH' : 'ROUND ' + Math.min(REGULATION, Math.floor(kickNo / 2) + 1) + ' OF ' + REGULATION, W / 2, 41);
      }

      function drawIntroCard() {
        const ki = kicker();
        const gi = keeper();
        const a = Math.min(1, stateT * 5) * Math.min(1, Math.max(0, (1.5 - stateT) * 4));
        if (a <= 0) return;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = U.alpha(C.panel, 0.94);
        U.roundRect(ctx, W / 2 - 230, 236, 460, 110, 18);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.font = '800 22px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = players[ki].color;
        const kickText = mode === 'cpu' ? (ki === 0 ? 'You kick' : 'Computer kicks') : players[ki].name + ' kicks';
        ctx.fillText(kickText, W / 2, 270);
        ctx.font = HUD;
        ctx.fillStyle = players[gi].color;
        const keepText = mode === 'cpu' ? (gi === 0 ? 'you keep' : 'computer keeps') : players[gi].name + ' keeps';
        ctx.fillText(keepText + (players[gi].fakeUsed ? '' : ' · fake ready'), W / 2, 304);
        ctx.fillStyle = C.muted;
        ctx.font = SMALL;
        ctx.fillText(isHuman(ki) ? 'Press ' + (mode === 'cpu' ? 'Space' : KEYS[ki].act) + ' to start' : 'Get ready…', W / 2, 328);
        ctx.restore();
      }

      function draw() {
        const replaying = state === 'replay';
        let frame = null;
        if (replaying && rec.length) {
          // Slow motion: the last 0.4 s before the goal at half speed.
          const goalT = outcome ? rec.reduce((m, r) => (r.kt <= flightT + 0.0001 ? r.kt : m), rec[0].kt) : rec[rec.length - 1].kt;
          const want = goalT - 0.32 + replayT * 0.5;
          frame = rec[0];
          for (const r of rec) if (r.kt <= want) frame = r;
        }
        ctx.save();
        if (shake > 0) ctx.translate(U.rand(-shake, shake) * 0.5, U.rand(-shake, shake) * 0.5);
        drawStadium();
        drawGoal(ctx, replaying ? (frame && frame.kt >= flightT ? { x: outcome.x, y: outcome.y, t: frame.kt - flightT } : null) : ripple);
        const pose = frame ? frame.pose : keeperPose(K || { lean: 0, dive: null }, kt);
        const gcol = players.length ? players[keeper()].color : C.p2;
        const glove = C.gold;
        // A ball in the net is behind the keeper; one in flight is in front.
        const b = frame ? { x: frame.bx, y: frame.by, r: frame.br, rot: frame.rot, alpha: frame.alpha } : ball;
        const behind = outcome && (outcome.res === 'goal' || outcome.res === 'postin' || outcome.res === 'over' || outcome.res === 'wide') &&
          (frame ? frame.kt >= flightT : true);
        if (behind && (state === 'result' || replaying)) drawBall(ctx, b.x, b.y, b.r, b.rot, b.alpha);
        // Fake telegraph: an arrow over the leaning keeper.
        if (K && Math.abs(K.lean) > 0.2 && !K.dive && !replaying) {
          const s = Math.sign(K.lean);
          ctx.fillStyle = U.alpha(gcol, 0.8);
          ctx.beginPath();
          ctx.moveTo(KX + s * 60, 196);
          ctx.lineTo(KX + s * 40, 186);
          ctx.lineTo(KX + s * 40, 206);
          ctx.closePath();
          ctx.fill();
          ctx.fillRect(Math.min(KX + s * 40, KX + s * 14), 193, 26, 6);
        }
        drawKeeper(ctx, pose, gcol, glove);
        drawKicker();
        if (!(behind && (state === 'result' || replaying)) && players.length) {
          if (state === 'flight' || state === 'result' || replaying) {
            // Shadow on the grass under the flying ball.
            const f = U.clamp((b.y - SPOT.y) / (GROUND - SPOT.y), 0, 1);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.beginPath();
            ctx.ellipse(b.x, U.lerp(SPOT.y + 12, GROUND, f), b.r, b.r * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          drawBall(ctx, b.x, b.y, b.r, b.rot, b.alpha);
        }
        drawReticle();
        drawPowerMeter();
        for (const q of parts) {
          ctx.globalAlpha = Math.max(0, q.life / q.max);
          ctx.fillStyle = q.color;
          ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
        if (replaying) {
          ctx.fillStyle = C.ink;
          ctx.fillRect(0, 50, W, 26);
          ctx.fillRect(0, H - 26, W, 26);
          ctx.font = '800 16px "JetBrains Mono", monospace';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = Math.sin(clock * 8) > 0 ? C.p1 : C.text;
          ctx.beginPath();
          ctx.arc(24, 63, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.text;
          ctx.fillText('REPLAY', 36, 63);
        }
        drawHud();
        if (state === 'intro' && players.length) drawIntroCard();
        if (banner && !replaying) {
          const a = Math.min(1, banner.t * 6) * Math.min(1, Math.max(0, 1.6 - banner.t) * 3);
          if (a > 0) bigText(banner.text, W / 2, 128, banner.color, 0.85 + Math.min(1, banner.t * 6) * 0.15, a);
        }
        if (flash > 0) {
          ctx.fillStyle = U.alpha(flashColor, flash * 0.18);
          ctx.fillRect(0, 0, W, H);
        }
      }

      /* ---------- Input ---------- */
      function sideOf(code, set) {
        if (code === set.left) return -1;
        if (code === set.right) return 1;
        return 0;
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat || !players.length) return;
        const ki = kicker();
        const gi = keeper();
        // Kicker.
        if (isHuman(ki) && keyset(ki).some((k) => k.act === e.code)) {
          if (state === 'intro' && stateT > 0.3) startAim();
          else if (state === 'aim' && stateT > 0.2) lockAim();
          else if (state === 'power') lockPower();
        }
        // Keeper.
        if (isHuman(gi)) {
          for (const set of keyset(gi)) {
            const isDir = e.code === set.left || e.code === set.right || e.code === set.up || e.code === set.down;
            if (!isDir) continue;
            if (preKick()) {
              const s = sideOf(e.code, set);
              if (s) fake(s);
            } else if (live() && !K.dive && K.pending === null) {
              K.pending = kt + 0.05;
            }
            break;
          }
        }
      });

      api.on(canvas, 'pointerdown', (e) => {
        if (!players.length) return;
        const p = api.toCanvas(e, canvas);
        const ki = kicker();
        const gi = keeper();
        // In 2-player games the pointer belongs to the kicker; against the computer it follows your role.
        const asKicker = mode === 'duo' || ki === 0;
        if (asKicker && isHuman(ki)) {
          pointer = p;
          if (state === 'intro' && stateT > 0.3) startAim();
          else if (state === 'aim' && stateT > 0.2) lockAim();
          else if (state === 'power') lockPower();
          return;
        }
        if (mode === 'cpu' && gi === 0) {
          if (preKick()) {
            if (Math.abs(p.x - KX) > 30 && p.y > BAR - 40 && p.y < GROUND + 40) fake(p.x < KX ? -1 : 1);
          } else if (live()) {
            if (Math.abs(p.x - KX) < 45 && p.y > 300) dive(KX, GROUND, true);
            else dive(p.x, p.y, false);
          }
        }
      });
      api.on(window, 'pointermove', (e) => {
        if (pointer) pointer = api.toCanvas(e, canvas);
      });
      api.on(window, 'pointerup', () => { pointer = null; });
      api.on(window, 'pointercancel', () => { pointer = null; });

      if (api.onPause) api.onPause(() => { pointer = null; });
      showStartMenu();
      api.loop((dt) => {
        update(dt);
        draw();
      });
    }
  });
})();
