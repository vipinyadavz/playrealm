/* Beat Tap — four-lane rhythm game where every lane is one instrument of a song synthesized live. */
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

  const LANE_KEYS = ['KeyD', 'KeyF', 'KeyJ', 'KeyK'];
  const LANE_LETTERS = ['D', 'F', 'J', 'K'];
  const LANE_NAMES = ['Drums', 'Bass', 'Chords', 'Lead'];
  const LANE_COLORS = [C.p1, C.gold, C.mint, C.p2];
  const LANE_NOTE = ['drum', 'bass', 'chord', 'lead'];
  const PLURAL = [true, false, true, false];
  const lc = (l) => LANE_NAMES[l].toLowerCase();
  const verb = (l, many, one) => (PLURAL[l] ? many : one);
  const CX = 480;
  const LANE_W = 96;          // lane width at the hit line
  const HIT_Y = 488;
  const TOP_Y = 66;
  const WIN_PERFECT = 0.045;  // judgement windows, seconds either side
  const WIN_GREAT = 0.09;
  const WIN_GOOD = 0.135;
  const WIN_CATCH = 0.18;     // taps this close still claim a note (as a miss)
  const MISS_DRAIN = 0.2;     // lane health lost per miss
  const STRAY_DRAIN = 0.03;
  const REVIVE = 8;           // hits in a row that bring a dropped lane back
  const COUNT_IN = 4;         // beats of clicks before bar 1
  const LEAD_IN = 0.8;        // seconds of quiet before the count-in
  const SCHED_AHEAD = 0.3;
  const JUDGE = [
    { name: 'Perfect', pts: 300, heal: 0.05, acc: 1, color: C.gold },
    { name: 'Great', pts: 200, heal: 0.04, acc: 0.7, color: C.mint },
    { name: 'Good', pts: 100, heal: 0.02, acc: 0.4, color: C.p2 },
    { name: 'Miss', pts: 0, heal: 0, acc: 0, color: C.p1 }
  ];
  const CHART = {
    easy: { grid: 1, minLane: 0.9, minGlobal: 0.55, maxSimul: 1, pDouble: 0, holdMin: 99, look: 1.6 },
    normal: { grid: 0.5, minLane: 0.3, minGlobal: 0.3, maxSimul: 2, pDouble: 0.3, holdMin: 2, look: 1.3 },
    hard: { grid: 0.25, minLane: 0.15, minGlobal: 0.12, maxSimul: 3, pDouble: 0.5, holdMin: 1, look: 1.05 }
  };
  const DIFF_NAMES = { easy: 'Easy', normal: 'Normal', hard: 'Hard' };

  /* ---------- Songs: composed procedurally from these recipes ----------
     Steps are 16ths within a bar; lead patterns span `len` steps and repeat.
     prog = [semitones above the key, 1 major / 0 minor] per bar. */
  const SONGS = [
    {
      id: 'lagoon', name: 'Lazy Lagoon', bpm: 96, mood: 'Warm and laid-back', key: 57, seed: 7,
      prog: [[0, 0], [8, 1], [3, 1], [10, 1]],
      lead: { base: 69, scale: [0, 3, 5, 7, 10] },
      form: [['I', 2], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['O', 2]],
      fill: true,
      voice: {
        bass: { wave: 'triangle', cutoff: 900, attack: 0.01, sustain: 0.75, decay: 0.25, release: 0.12, v: 0.5, sub: true },
        chord: { wave: 'sawtooth', detune: 7, cutoff: 1100, attack: 0.07, sustain: 0.8, decay: 0.4, release: 0.35, v: 0.06 },
        lead: { wave: 'triangle', cutoff: 3200, attack: 0.012, sustain: 0.8, decay: 0.2, release: 0.15, vib: true, v: 0.24 }
      },
      parts: {
        I: { k: [0], s: [], h: [0, 4, 8, 12], oh: [], bass: [], chords: [[0, 16]], lead: null },
        A: { k: [0, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12, 14], oh: [],
          bass: [[0, 6, 'r'], [6, 2, 'r'], [8, 4, '5'], [14, 2, 'o']],
          chords: [[0, 8], [8, 8]],
          lead: { len: 32, notes: [[0, 4], [4, 2], [6, 2], [8, 6], [16, 2], [18, 2], [20, 4], [24, 8]] } },
        B: { k: [0, 6, 8], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12], oh: [14],
          bass: [[0, 3, 'r'], [3, 3, 'r'], [6, 2, 'o'], [8, 3, '5'], [11, 3, '5'], [14, 2, 'o']],
          chords: [[0, 3], [6, 3], [12, 4]],
          lead: { len: 32, notes: [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4], [16, 2], [18, 2], [20, 2], [22, 2], [24, 8]] } },
        O: { k: [0], s: [], h: [0, 4, 8, 12], oh: [], bass: [[0, 16, 'r']], chords: [[0, 16]],
          lead: { len: 32, notes: [[0, 16]] } }
      }
    },
    {
      id: 'neon', name: 'Neon Jog', bpm: 120, mood: 'Bright and bouncy', key: 60, seed: 19,
      prog: [[0, 1], [7, 1], [9, 0], [5, 1]],
      lead: { base: 72, scale: [0, 2, 4, 7, 9] },
      form: [['I', 2], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['B', 8], ['O', 2]],
      fill: true,
      voice: {
        bass: { wave: 'square', cutoff: 650, cutEnv: 3, q: 5, attack: 0.004, sustain: 0.5, decay: 0.12, release: 0.06, v: 0.26 },
        chord: { wave: 'sawtooth', detune: 9, cutoff: 1700, cutEnv: 2, attack: 0.004, sustain: 0.35, decay: 0.15, release: 0.12, v: 0.055 },
        lead: { wave: 'square', cutoff: 2600, attack: 0.005, sustain: 0.7, decay: 0.1, release: 0.1, vib: true, v: 0.11 }
      },
      parts: {
        I: { k: [0, 4, 8, 12], s: [], h: [], oh: [2, 6, 10, 14],
          bass: [[2, 2, 'r'], [6, 2, 'r'], [10, 2, 'o'], [14, 2, 'r']], chords: [], lead: null },
        A: { k: [0, 4, 8, 12], s: [4, 12], h: [], oh: [2, 6, 10, 14],
          bass: [[2, 2, 'r'], [6, 2, 'r'], [10, 2, 'o'], [14, 2, 'r']],
          chords: [[0, 2], [3, 2], [8, 2], [11, 2]],
          lead: { len: 32, notes: [[0, 2], [2, 2], [4, 2], [6, 4], [12, 2], [14, 2], [16, 2], [18, 2], [20, 4], [24, 4], [28, 4]] } },
        B: { k: [0, 4, 8, 12], s: [4, 12], h: [0, 1, 3, 5, 7, 8, 9, 11, 13, 15], oh: [2, 6, 10, 14],
          bass: [[0, 2, 'r'], [2, 2, 'o'], [4, 2, 'r'], [6, 2, 'o'], [8, 2, 'r'], [10, 2, 'o'], [12, 2, '5'], [14, 2, 'o']],
          chords: [[0, 6], [8, 6]],
          lead: { len: 32, notes: [[0, 3], [3, 3], [6, 2], [8, 4], [12, 4], [16, 3], [19, 3], [22, 2], [24, 8]] } },
        O: { k: [0, 4, 8], s: [4], h: [], oh: [2, 6, 10], bass: [[0, 8, 'r']], chords: [[0, 12]],
          lead: { len: 32, notes: [[0, 12]] } }
      }
    },
    {
      id: 'comet', name: 'Comet Courier', bpm: 150, mood: 'Fast and fierce', key: 64, seed: 31,
      prog: [[0, 0], [8, 1], [10, 1], [7, 0]],
      lead: { base: 76, scale: [0, 3, 5, 7, 10] },
      form: [['I', 4], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['A', 8], ['B', 8], ['O', 2]],
      fill: true,
      voice: {
        bass: { wave: 'sawtooth', cutoff: 560, cutEnv: 4, q: 5, attack: 0.003, sustain: 0.6, decay: 0.1, release: 0.05, v: 0.26 },
        chord: { wave: 'sawtooth', detune: 12, cutoff: 1500, cutEnv: 2.2, attack: 0.006, sustain: 0.5, decay: 0.2, release: 0.15, v: 0.05 },
        lead: { wave: 'sawtooth', detune: 5, cutoff: 2200, cutEnv: 1.6, attack: 0.005, sustain: 0.75, decay: 0.1, release: 0.12, vib: true, v: 0.09 }
      },
      parts: {
        I: { k: [0, 8], s: [], h: [0, 2, 4, 6, 8, 10, 12, 14], oh: [],
          bass: [[0, 2, 'r'], [2, 2, 'r'], [4, 2, 'r'], [6, 2, 'r'], [8, 2, 'r'], [10, 2, 'r'], [12, 2, 'r'], [14, 2, 'r']],
          chords: [], lead: null },
        A: { k: [0, 6, 10], s: [4, 12], h: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], oh: [],
          bass: [[0, 2, 'r'], [2, 2, 'r'], [4, 2, 'r'], [6, 2, 'o'], [8, 2, 'r'], [10, 2, 'r'], [12, 2, '5'], [14, 2, 'o']],
          chords: [[0, 4], [6, 2], [10, 6]],
          lead: { len: 32, notes: [[0, 4], [4, 4], [8, 2], [10, 2], [12, 4], [16, 4], [20, 4], [24, 2], [26, 2], [28, 4]] } },
        B: { k: [0, 3, 6, 8, 10], s: [4, 12], h: [0, 2, 4, 6, 8, 10, 12], oh: [14],
          bass: [[0, 3, 'r'], [3, 3, 'r'], [6, 2, 'o'], [8, 3, '5'], [11, 3, '5'], [14, 2, 'o']],
          chords: [[0, 8], [8, 8]],
          lead: { len: 32, notes: [[0, 1], [1, 1], [2, 2], [4, 1], [5, 1], [6, 2], [8, 2], [10, 2], [12, 4], [16, 1], [17, 1],
            [18, 2], [20, 1], [21, 1], [22, 2], [24, 8]] } },
        O: { k: [0], s: [], h: [0, 4, 8, 12], oh: [], bass: [[0, 16, 'r']], chords: [[0, 16]],
          lead: { len: 32, notes: [[0, 16]] } }
      }
    }
  ];

  /* Calibration offset in ms, kept for this page session. Positive = you hear the music late. */
  let offsetMs = 0;
  const charts = {};

  /* ---------- Composition ---------- */
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
  const pc = (m) => ((m % 12) + 12) % 12;

  function chordTones(song, ch) {
    const iv = ch[1] ? [0, 4, 7] : [0, 3, 7];
    return iv.map((i) => pc(song.key + ch[0] + i));
  }

  function voicing(song, ch) {
    const root = song.key + ch[0];
    const iv = ch[1] ? [0, 4, 7] : [0, 3, 7];
    return iv.map((i) => {
      let m = root + i;
      while (m > song.key + 8) m -= 12;
      while (m < song.key - 4) m += 12;
      return m;
    }).sort((a, b) => a - b);
  }

  function makeLead(song, pat, bars, rnd) {
    const L = song.lead;
    const lo = L.base - 7;
    const hi = L.base + 14;
    const scaleTones = [];
    for (let m = lo; m <= hi; m++) if (L.scale.includes(pc(m - song.key))) scaleTones.push(m);
    const notes = [];
    let prev = L.base;
    const total = bars * 16;
    for (let r = 0; r * pat.len < total; r++) {
      for (const [st, ln] of pat.notes) {
        const abs = r * pat.len + st;
        if (abs >= total) break;
        const ch = song.prog[Math.floor(abs / 16) % song.prog.length];
        const tones = chordTones(song, ch);
        const strong = abs % 8 === 0 || ln >= 4;
        let cand;
        if (strong) {
          cand = [];
          for (let m = lo; m <= hi; m++) if (tones.includes(pc(m))) cand.push(m);
        } else {
          cand = scaleTones.filter((m) => Math.abs(m - prev) <= 4 && m !== prev);
        }
        if (!cand.length) cand = scaleTones;
        cand.sort((a, b) => Math.abs(a - prev) - Math.abs(b - prev));
        const pick = cand[Math.min(cand.length - 1, Math.floor(rnd() * 2))];
        // Drift back toward the middle of the range so the tune never wanders off.
        prev = pick > L.base + 9 && rnd() < 0.5 ? cand.find((m) => m <= pick - 2) || pick : pick;
        notes.push({ st: abs, len: ln, midi: prev, vel: strong ? 1 : 0.82 });
      }
    }
    if (notes.length && bars >= 2) {
      // Cadence: the phrase ends on the chord's root.
      const n = notes[notes.length - 1];
      const ch = song.prog[Math.floor(n.st / 16) % song.prog.length];
      let best = n.midi;
      let bd = Infinity;
      for (let m = lo; m <= hi; m++) {
        if (pc(m) === pc(song.key + ch[0]) && Math.abs(m - L.base) < bd) { bd = Math.abs(m - L.base); best = m; }
      }
      n.midi = best;
    }
    return notes;
  }

  /* Every audible event of the song: { t (beats), lane, type, midi | midis, dur (beats), vel }. */
  function compose(song) {
    if (song.cache) return song.cache;
    const rnd = mulberry(song.seed);
    const events = [];
    const leads = {};
    let bar0 = 0;
    for (const [type, bars] of song.form) {
      const P = song.parts[type];
      for (let b = 0; b < bars; b++) {
        const beat0 = (bar0 + b) * 4;
        const ch = song.prog[b % song.prog.length];
        P.k.forEach((st) => events.push({ t: beat0 + st / 4, lane: 0, type: 'kick', vel: st % 8 === 0 ? 1 : 0.8 }));
        P.s.forEach((st) => events.push({ t: beat0 + st / 4, lane: 0, type: 'snare', vel: 0.95 }));
        P.h.forEach((st) => events.push({ t: beat0 + st / 4, lane: 0, type: 'hat', vel: st % 4 === 0 ? 1 : 0.7 }));
        P.oh.forEach((st) => events.push({ t: beat0 + st / 4, lane: 0, type: 'ohat', vel: 0.9 }));
        if (song.fill && bars >= 8 && b === bars - 1) {
          [13, 14, 15].forEach((st, i) => events.push({ t: beat0 + st / 4, lane: 0, type: 'snare', vel: 0.55 + i * 0.15 }));
        }
        P.bass.forEach(([st, len, deg]) => events.push({
          t: beat0 + st / 4, lane: 1, type: 'bass', dur: len / 4, vel: st % 8 === 0 ? 1 : 0.85,
          midi: song.key - 24 + ch[0] + (deg === 'o' ? 12 : deg === '5' ? 7 : 0)
        }));
        P.chords.forEach(([st, len]) => events.push({
          t: beat0 + st / 4, lane: 2, type: 'chord', dur: len / 4, vel: 0.9, midis: voicing(song, ch)
        }));
      }
      if (P.lead) {
        const notes = leads[type] || (leads[type] = makeLead(song, P.lead, bars, rnd));
        notes.forEach((n) => events.push({ t: bar0 * 4 + n.st / 4, lane: 3, type: 'lead', midi: n.midi, dur: n.len / 4, vel: n.vel }));
      }
      bar0 += bars;
    }
    events.sort((a, b) => a.t - b.t || a.lane - b.lane);
    song.cache = { events, beats: bar0 * 4 };
    return song.cache;
  }

  /* The chart: a playable subset of real onsets, so every note you tap is a sound in that lane. */
  function buildChart(si, diff) {
    const key = si + ':' + diff;
    if (charts[key]) return charts[key];
    const song = SONGS[si];
    const D = CHART[diff];
    const spb = 60 / song.bpm;
    const rnd = mulberry(song.seed * 31 + diff.length * 7);
    const comp = compose(song);
    const groups = new Map();
    for (const e of comp.events) {
      if (e.type === 'hat' || e.type === 'ohat') continue;
      if (Math.abs(e.t / D.grid - Math.round(e.t / D.grid)) > 1e-6) continue;
      const k = Math.round(e.t * 1000);
      if (!groups.has(k)) groups.set(k, []);
      const g = groups.get(k);
      if (!g.some((x) => x.lane === e.lane)) g.push(e);
    }
    const times = [...groups.keys()].sort((a, b) => a - b);
    const lastT = [-9, -9, -9, -9];
    const busy = [-9, -9, -9, -9];
    const recent = [0, 0, 0, 0];
    const prio = [0, 3, 2, 1];
    let lastGlobal = -9;
    const notes = [];
    for (const k of times) {
      const ts = (k / 1000) * spb;
      if (ts - lastGlobal < D.minGlobal - 1e-6) continue;
      const opts = groups.get(k).filter((e) => ts - lastT[e.lane] >= D.minLane - 1e-6 && ts >= busy[e.lane] + 0.05);
      if (!opts.length) continue;
      // Spread notes across the band: lanes that played least recently go first.
      opts.sort((a, b) => recent[a.lane] - recent[b.lane] || prio[a.lane] - prio[b.lane]);
      let take = 1;
      while (take < Math.min(D.maxSimul, opts.length) && rnd() < D.pDouble) take++;
      for (let i = 0; i < take; i++) {
        const e = opts[i];
        const hold = e.lane > 0 && e.dur >= D.holdMin;
        const n = { lane: e.lane, t: ts, end: hold ? ts + e.dur * spb * 0.9 : 0, judged: false, grade: -1, hold: hold ? 0 : -1 };
        notes.push(n);
        lastT[e.lane] = ts;
        if (hold) busy[e.lane] = n.end;
        recent[e.lane] += 1;
      }
      lastGlobal = ts;
      for (let l = 0; l < 4; l++) recent[l] *= 0.8;
    }
    charts[key] = notes;
    return notes;
  }

  /* ---------- Drawing helpers shared with the thumbnail ---------- */
  function persp(y) {
    return 0.6 + 0.4 * (y - TOP_Y) / (HIT_Y - TOP_Y);
  }
  function laneEdge(l, y) {
    return CX + (l - 2) * LANE_W * persp(y);
  }

  function drawGem(ctx, x, y, w, h, color, dim) {
    ctx.fillStyle = dim ? U.alpha('#5A5488', 0.85) : color;
    U.roundRect(ctx, x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    if (!dim) {
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      U.roundRect(ctx, x - w / 2 + 5, y - h / 2 + 3, w - 10, h * 0.32, h * 0.16);
      ctx.fill();
    } else {
      ctx.strokeStyle = U.alpha(color, 0.7);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  Arcade.register({
    id: 'beat-tap',
    title: 'Beat Tap',
    category: 'combat',
    mode: 'solo',
    players: '1P',
    best: 'high',
    color: C.violet,
    tagline: 'Tap four lanes in time with a song built live from drums, bass, chords and lead.',
    hook: 'Every instrument lives in its own lane: miss too many and that part of the song drops out.',
    tags: ['rhythm', 'music', 'beat', 'timing', 'keyboard', 'touch', 'song', 'dance'],
    howTo: 'Notes fall down four lanes. Tap D, F, J or K (or touch the lane) as each note crosses the line; long ' +
      'notes on Normal and Hard must be held to the end. Timing earns Perfect, Great or Good, and every 10 hits in a ' +
      'row raise your multiplier. Each lane is one instrument: drums, bass, chords and lead. Misses drain that ' +
      'lane, and when it empties the instrument goes silent and the song sounds thinner. Hit 8 notes in a row in a ' +
      'silent lane to bring it back. If all four drop out, the song stops. Use Calibrate if taps feel early or late.',
    controls: [
      { keys: ['D', 'F', 'J', 'K'], label: 'Tap or hold the four lanes' },
      { keys: ['Tap'], label: 'Touch a lane' },
      { keys: ['+', '−'], label: 'Nudge the audio offset (in menus)' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.save();
      ctx.scale(w / 320, h / 200);
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, 320, 200);
      // Beat rings.
      const ph = (t * 1.6) % 1;
      for (let k = 0; k < 5; k++) {
        const r = ((k + ph) / 5) * 240;
        ctx.strokeStyle = U.alpha(C.violet, 0.22 * (1 - (k + ph) / 5));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(160, -10, r, 0, TAU);
        ctx.stroke();
      }
      // Highway in perspective.
      const top = 14;
      const bot = 168;
      const lw = 44;
      const pw = (y) => 0.55 + 0.45 * (y - top) / (bot - top);
      const ex = (l, y) => 160 + (l - 2) * lw * pw(y);
      for (let l = 0; l < 4; l++) {
        const muted = l === 1;
        ctx.fillStyle = muted ? U.alpha('#3A3470', 0.9) : U.alpha(LANE_COLORS[l], 0.12);
        ctx.beginPath();
        ctx.moveTo(ex(l, top), top);
        ctx.lineTo(ex(l + 1, top), top);
        ctx.lineTo(ex(l + 1, 200), 200);
        ctx.lineTo(ex(l, 200), 200);
        ctx.closePath();
        ctx.fill();
        if (muted) {
          ctx.save();
          ctx.clip();
          ctx.strokeStyle = U.alpha(C.ink, 0.6);
          ctx.lineWidth = 4;
          for (let k = -10; k < 20; k++) {
            ctx.beginPath();
            ctx.moveTo(60 + k * 14, 0);
            ctx.lineTo(60 + k * 14 + 60, 200);
            ctx.stroke();
          }
          ctx.restore();
        }
      }
      ctx.strokeStyle = U.alpha(C.text, 0.25);
      ctx.lineWidth = 1.5;
      for (let l = 0; l <= 4; l++) {
        ctx.beginPath();
        ctx.moveTo(ex(l, top), top);
        ctx.lineTo(ex(l, 200), 200);
        ctx.stroke();
      }
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex(0, bot), bot);
      ctx.lineTo(ex(4, bot), bot);
      ctx.stroke();
      // Notes.
      const fall = (t * 60) % 40;
      const gems = [[0, 30], [2, 62], [3, 92], [0, 120], [2, 150], [1, 70], [1, 132], [3, 40]];
      gems.forEach(([l, y0]) => {
        const y = top + ((y0 + fall - top) % (bot - top + 10));
        const s = pw(y);
        drawGem(ctx, (ex(l, y) + ex(l + 1, y)) / 2, y, lw * s * 0.78, 9 + 5 * s, LANE_COLORS[l], l === 1);
      });
      // Receptor glow on the drum lane.
      ctx.fillStyle = U.alpha(C.p1, 0.35);
      ctx.beginPath();
      ctx.ellipse((ex(0, bot) + ex(1, bot)) / 2, bot, 30, 12, 0, 0, TAU);
      ctx.fill();
      // Muted badge on the bass lane.
      const bx = (ex(1, 100) + ex(2, 100)) / 2;
      ctx.fillStyle = U.alpha(C.ink, 0.85);
      U.roundRect(ctx, bx - 30, 88, 60, 24, 12);
      ctx.fill();
      ctx.font = SMALL;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = C.gold;
      ctx.fillText('MUTED', bx, 100);
      ctx.fillStyle = C.text;
      ctx.font = '700 13px "JetBrains Mono", monospace';
      LANE_LETTERS.forEach((k, l) => ctx.fillText(k, (ex(l, 186) + ex(l + 1, 186)) / 2, 186));
      ctx.restore();
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let state = 'menu'; // 'menu' | 'play' | 'fail' | 'over' | 'calib' | 'calibDone'
      let songIdx = 0;
      let diff = 'normal';
      let song = SONGS[0];
      let spb = 0.5;
      let evs = [];          // audio events with .sec
      let notes = [];
      let laneNotes = [[], [], [], []];
      let laneIdx = [0, 0, 0, 0];
      let drawIdx = [0, 0, 0, 0];
      let holding = [null, null, null, null];
      let songEnd = 0;
      let look = 1.3;
      let schedIdx = 0;
      let visIdx = 0;
      let score = 0;
      let combo = 0;
      let maxCombo = 0;
      let counts = [0, 0, 0, 0];
      let holdsOk = 0;
      let holdsBad = 0;
      let health = [1, 1, 1, 1];
      let dropped = [false, false, false, false];
      let revive = [0, 0, 0, 0];
      let level = [0, 0, 0, 0];
      let glow = [0, 0, 0, 0];
      let press = [0, 0, 0, 0];
      let pops = [];
      let parts = [];
      let failT = 0;
      let clock = 0;
      let lastScore = null;
      let menuAgain = null;
      let calibTaps = [];
      let lastFrame = 0;
      let resultInfo = null;
      let frozenT = 0;
      let lastMuted = null;
      const told = {};
      const pointerLane = new Map();

      /* ---------- Audio ---------- */
      let ac = null;
      let master = null;
      let partGain = [];
      let echo = null;
      let noiseBuf = null;
      let live = [];
      let latency = 0;
      let mode = 'perf';      // which clock drives the song: 'audio' or 'perf'
      let zeroAc = 0;
      let zeroPerf = 0;
      let pausedAt = null;
      let suspended = false;

      const quiet = (p) => { if (p && typeof p.catch === 'function') p.catch(() => {}); };
      const perfNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;
      const isMuted = () => !!(Arcade.sound && Arcade.sound.muted);

      function ensureAudio() {
        if (ac) {
          if (ac.state === 'suspended' && !api.paused) {
            try { quiet(ac.resume()); } catch (e) { /* ignore */ }
          }
          return ac;
        }
        const AC = typeof AudioContext !== 'undefined' ? AudioContext
          : typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null; // eslint-disable-line no-undef
        if (!AC) return null;
        try {
          ac = new AC();
          master = ac.createGain();
          master.gain.value = isMuted() ? 0 : 0.75;
          const comp = ac.createDynamicsCompressor();
          comp.threshold.value = -16;
          comp.ratio.value = 4;
          master.connect(comp);
          comp.connect(ac.destination);
          partGain = [0, 1, 2, 3].map(() => {
            const g = ac.createGain();
            g.gain.value = 1;
            g.connect(master);
            return g;
          });
          // A soft echo on the lead; it sits after the lead's lane gain so a muted lead goes quiet too.
          const send = ac.createGain();
          send.gain.value = 0.3;
          const dl = ac.createDelay(1.5);
          const fb = ac.createGain();
          fb.gain.value = 0.3;
          const lp = ac.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.value = 2400;
          partGain[3].connect(send);
          send.connect(dl);
          dl.connect(lp);
          lp.connect(fb);
          fb.connect(dl);
          lp.connect(master);
          echo = dl;
          const len = Math.floor(ac.sampleRate * 1);
          noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
          const data = noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
          if (ac.state === 'suspended') quiet(ac.resume());
        } catch (e) {
          ac = null;
        }
        return ac;
      }

      function track(node, end) {
        live.push({ node, end });
      }

      function vKick(dest, t, v) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.9 * v, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + 0.34);
        track(o, t + 0.34);
      }

      function vNoise(dest, t, dur, v, type, freq) {
        const s = ac.createBufferSource();
        s.buffer = noiseBuf;
        const f = ac.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        const g = ac.createGain();
        g.gain.setValueAtTime(v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f);
        f.connect(g);
        g.connect(dest);
        s.start(t, Math.random() * 0.5);
        s.stop(t + dur + 0.02);
        track(s, t + dur + 0.02);
      }

      function vSnare(dest, t, v) {
        vNoise(dest, t, 0.17, 0.4 * v, 'highpass', 1500);
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(190, t);
        o.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        g.gain.setValueAtTime(0.32 * v, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.connect(g);
        g.connect(dest);
        o.start(t);
        o.stop(t + 0.12);
        track(o, t + 0.12);
      }

      function vTone(dest, t, midi, dur, v, o) {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const end = t + Math.max(dur, (o.attack || 0.005) + 0.02);
        const rel = o.release || 0.08;
        const g = ac.createGain();
        const f = ac.createBiquadFilter();
        f.type = 'lowpass';
        f.Q.value = o.q || 0.8;
        f.frequency.setValueAtTime(o.cutoff * (o.cutEnv || 1), t);
        if (o.cutEnv) f.frequency.exponentialRampToValueAtTime(o.cutoff, t + Math.min(dur, 0.25) + 0.01);
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.005));
        g.gain.setTargetAtTime(v * (o.sustain == null ? 1 : o.sustain), t + (o.attack || 0.005), (o.decay || 0.1) / 3);
        g.gain.setTargetAtTime(0, end, rel / 4);
        f.connect(g);
        g.connect(dest);
        const stopAt = end + rel + 0.05;
        const oscs = (o.detune ? [-o.detune, o.detune] : [0]).map((dt) => {
          const osc = ac.createOscillator();
          osc.type = o.wave;
          osc.frequency.value = freq;
          osc.detune.value = dt;
          osc.connect(f);
          osc.start(t);
          osc.stop(stopAt);
          track(osc, stopAt);
          return osc;
        });
        if (o.sub) {
          const s = ac.createOscillator();
          s.type = 'sine';
          s.frequency.value = freq / 2;
          s.connect(f);
          s.start(t);
          s.stop(stopAt);
          track(s, stopAt);
        }
        if (o.vib && dur > 0.35) {
          const lfo = ac.createOscillator();
          const lg = ac.createGain();
          lfo.frequency.value = 5.5;
          lg.gain.value = freq * 0.007;
          lfo.connect(lg);
          oscs.forEach((x) => lg.connect(x.frequency));
          lfo.start(t + 0.18);
          lfo.stop(stopAt);
          track(lfo, stopAt);
        }
      }

      function vClick(t, accent) {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'square';
        o.frequency.value = accent ? 1560 : 1040;
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + 0.06);
        track(o, t + 0.06);
      }

      function playEvent(e, at) {
        const V = song.voice;
        const dest = e.lane >= 0 ? partGain[e.lane] : master;
        const durS = (e.dur || 0) * spb;
        switch (e.type) {
          case 'kick': vKick(dest, at, e.vel); break;
          case 'snare': vSnare(dest, at, e.vel); break;
          case 'hat': vNoise(dest, at, 0.045, 0.09 * e.vel, 'highpass', 7600); break;
          case 'ohat': vNoise(dest, at, 0.22, 0.08 * e.vel, 'highpass', 7000); break;
          case 'bass': vTone(dest, at, e.midi, durS * 0.92, V.bass.v * e.vel, V.bass); break;
          case 'chord': e.midis.forEach((m) => vTone(dest, at, m, durS * 0.95, V.chord.v * e.vel, V.chord)); break;
          case 'lead': vTone(dest, at, e.midi, durS * 0.9, V.lead.v * e.vel, V.lead); break;
          case 'click': vClick(at, e.vel > 0.9); break;
          default: break;
        }
      }

      function setLaneMute(l, muted) {
        if (!ac || !partGain[l]) return;
        try {
          const g = partGain[l].gain;
          g.cancelScheduledValues(ac.currentTime);
          g.setTargetAtTime(muted ? 0 : 1, ac.currentTime, muted ? 0.04 : 0.08);
        } catch (e) { /* ignore */ }
      }

      function stopAllSources() {
        for (const s of live) {
          try { s.node.stop(0); } catch (e) { /* already stopped */ }
          try { s.node.disconnect(); } catch (e) { /* ignore */ }
        }
        live = [];
      }

      function fadeOut(sec) {
        if (!ac || !master) return;
        try {
          master.gain.cancelScheduledValues(ac.currentTime);
          master.gain.setTargetAtTime(0, ac.currentTime, sec / 4);
        } catch (e) { /* ignore */ }
      }

      /* ---------- Clock ---------- */
      function rawTime() {
        return mode === 'audio' && ac ? ac.currentTime - zeroAc : perfNow() - zeroPerf;
      }
      const totalOffset = () => offsetMs / 1000 + (mode === 'audio' ? latency : 0);
      const songTime = () => rawTime() - totalOffset();

      /* Full volume on every lane (respecting mute), echo timed to the song. */
      function resetMix() {
        const lat = typeof ac.outputLatency === 'number' && ac.outputLatency > 0 ? ac.outputLatency
          : typeof ac.baseLatency === 'number' ? ac.baseLatency : 0;
        latency = U.clamp(lat || 0, 0, 0.15);
        try {
          master.gain.cancelScheduledValues(ac.currentTime);
          lastMuted = isMuted();
          master.gain.setValueAtTime(lastMuted ? 0 : 0.75, ac.currentTime);
          partGain.forEach((g, l) => {
            g.gain.cancelScheduledValues(ac.currentTime);
            g.gain.setValueAtTime(dropped[l] ? 0 : 1, ac.currentTime);
          });
          echo.delayTime.setValueAtTime(spb * 0.75, ac.currentTime);
        } catch (e) { /* ignore */ }
      }

      function startClock(leadSec) {
        ensureAudio();
        pausedAt = null;
        suspended = false;
        if (ac && ac.state === 'running') {
          mode = 'audio';
          zeroAc = ac.currentTime + leadSec;
          resetMix();
        } else {
          mode = 'perf';
          zeroPerf = perfNow() + leadSec;
        }
        lastFrame = perfNow();
      }

      /* The audio context may only start running a moment after the click: hand over smoothly. */
      function upgradeClock() {
        if (mode === 'perf' && ac && ac.state === 'running' && !api.paused && pausedAt === null) {
          const now = rawTime();
          mode = 'audio';
          resetMix();
          // Keep the song position continuous across the switch (the audio clock adds output latency).
          zeroAc = ac.currentTime - now - latency;
          while (schedIdx < evs.length && evs[schedIdx].sec < now + latency) schedIdx++;
        }
      }

      function onPauseChange() {
        const active = state === 'play' || state === 'calib' || state === 'fail';
        if (api.paused) {
          if (!active) return;
          if (mode === 'audio' && ac && ac.state === 'running' && !suspended) {
            try { quiet(ac.suspend()); } catch (e) { /* ignore */ }
            suspended = true;
          }
          if (mode === 'perf' && pausedAt === null) pausedAt = perfNow();
        } else {
          resumeClock();
        }
      }

      function resumeClock() {
        if (suspended && ac) {
          try { quiet(ac.resume()); } catch (e) { /* ignore */ }
          suspended = false;
        }
        if (pausedAt !== null) {
          zeroPerf += perfNow() - pausedAt;
          pausedAt = null;
        }
      }

      // The shell tells us whenever it pauses (Escape, its pause button, a hidden tab).
      api.onPause(onPauseChange);

      function schedule() {
        if (!ac || mode !== 'audio') return;
        const horizon = rawTime() + SCHED_AHEAD;
        while (schedIdx < evs.length && evs[schedIdx].sec < horizon) {
          const e = evs[schedIdx++];
          const at = zeroAc + e.sec;
          if (at < ac.currentTime - 0.01) continue;
          try { playEvent(e, at); } catch (err) { /* audio is optional */ }
        }
      }

      /* ---------- Menus ---------- */
      const fmtOffset = () => (offsetMs > 0 ? '+' : offsetMs < 0 ? '−' : '±') + Math.abs(offsetMs) + ' ms';

      function showStartMenu() {
        state = 'menu';
        menuAgain = showStartMenu;
        api.setStatus('Each lane is one instrument. Miss too many and it drops out of the song.');
        api.menu({
          title: 'Beat Tap',
          text: 'Tap D F J K as notes cross the line. Lanes are drums, bass, chords and lead. Audio offset ' +
            fmtOffset() + ' (press + or − to nudge).',
          buttons: SONGS.map((s, i) => ({
            label: s.name + ' · ' + s.bpm + ' BPM', primary: i === songIdx, onClick: () => { ensureAudio(); songIdx = i; showDiffMenu(); }
          })).concat([{ label: 'Calibrate', onClick: startCalib }])
        });
      }

      function showDiffMenu() {
        const s = SONGS[songIdx];
        menuAgain = showDiffMenu;
        api.menu({
          title: s.name,
          text: s.mood + ', ' + s.bpm + ' BPM. Easy: one note at a time. Normal: pairs and held notes. ' +
            'Hard: fast runs and long holds.',
          buttons: [
            { label: 'Easy', onClick: () => startSong(songIdx, 'easy') },
            { label: 'Normal', primary: true, onClick: () => startSong(songIdx, 'normal') },
            { label: 'Hard', onClick: () => startSong(songIdx, 'hard') }
          ]
        });
      }

      function nudge(ms) {
        offsetMs = U.clamp(offsetMs + ms, -250, 350);
        api.sfx('tick');
        if (menuAgain) menuAgain();
      }

      /* ---------- Song flow ---------- */
      function resetStats() {
        score = 0;
        combo = 0;
        maxCombo = 0;
        counts = [0, 0, 0, 0];
        holdsOk = 0;
        holdsBad = 0;
        health = [1, 1, 1, 1];
        dropped = [false, false, false, false];
        revive = [0, 0, 0, 0];
        level = [0, 0, 0, 0];
        glow = [0, 0, 0, 0];
        press = [0, 0, 0, 0];
        holding = [null, null, null, null];
        pops = [];
        parts = [];
        failT = 0;
        lastScore = null;
        pointerLane.clear();
      }

      function startSong(i, d) {
        songIdx = i;
        diff = d;
        song = SONGS[i];
        spb = 60 / song.bpm;
        look = CHART[d].look;
        const comp = compose(song);
        evs = comp.events.map((e) => Object.assign({ sec: e.t * spb }, e));
        for (let b = 0; b < COUNT_IN; b++) {
          evs.push({ sec: (b - COUNT_IN) * spb, t: b - COUNT_IN, lane: -1, type: 'click', vel: b === 0 ? 1 : 0.6 });
        }
        evs.sort((a, b) => a.sec - b.sec);
        songEnd = comp.beats * spb;
        notes = buildChart(i, d).map((n) => Object.assign({}, n));
        laneNotes = [[], [], [], []];
        notes.forEach((n) => laneNotes[n.lane].push(n));
        laneIdx = [0, 0, 0, 0];
        drawIdx = [0, 0, 0, 0];
        schedIdx = 0;
        visIdx = 0;
        resetStats();
        menuAgain = null;
        state = 'play';
        startClock(LEAD_IN + COUNT_IN * spb);
        api.setScore(0);
        api.setStatus(song.name + ' · ' + DIFF_NAMES[d] + '. Each lane is an instrument: misses drain it, and an empty lane goes silent.');
      }

      function accuracy() {
        let num = 0;
        let den = 0;
        for (const n of notes) {
          if (!n.judged) continue;
          den += 1;
          num += JUDGE[n.grade].acc;
          if (n.hold >= 0) {
            den += 1;
            num += n.hold === 1 ? 1 : 0;
          }
        }
        return den ? (num / den) * 100 : 100;
      }

      function gradeFor(acc, cleared) {
        if (!cleared) return 'C';
        return acc >= 95 ? 'S' : acc >= 88 ? 'A' : acc >= 75 ? 'B' : 'C';
      }

      function finishSong(cleared) {
        state = 'over';
        fadeOut(cleared ? 1.2 : 0.4);
        const acc = accuracy();
        const grade = gradeFor(acc, cleared);
        const final = Math.round(score);
        const isBest = api.reportScore(final);
        api.sfx(cleared ? 'win' : 'lose');
        api.setScore(final);
        resultInfo = { grade, acc, cleared, final };
        api.setStatus(cleared ? 'Song clear with grade ' + grade + '.' : 'Every instrument dropped out, so the song stopped.');
        api.menu({
          title: isBest ? 'New best: ' + final + '!' : cleared ? 'Song clear: grade ' + grade : 'Song failed',
          text: song.name + ' (' + DIFF_NAMES[diff] + '). ' + acc.toFixed(1) + '% accuracy, best combo ' + maxCombo +
            '. Perfect ' + counts[0] + ', Great ' + counts[1] + ', Good ' + counts[2] + ', Miss ' + counts[3] +
            (holdsOk + holdsBad ? ', holds ' + holdsOk + '/' + (holdsOk + holdsBad) : '') + '.',
          buttons: [
            { label: 'Play again', primary: true, onClick: () => startSong(songIdx, diff) },
            { label: 'Change mode', onClick: showStartMenu }
          ]
        });
      }

      /* ---------- Judgement ---------- */
      const mult = () => Math.min(4, 1 + Math.floor(combo / 10));

      function pop(lane, text, color) {
        pops.push({ lane, text, color, t: 0 });
        if (pops.length > 12) pops.shift();
      }

      function sparks(lane, color, n) {
        const x = (laneEdge(lane, HIT_Y) + laneEdge(lane + 1, HIT_Y)) / 2;
        for (let i = 0; i < n && parts.length < 300; i++) {
          const a = -Math.PI / 2 + U.rand(-1.2, 1.2);
          const v = U.rand(120, 360);
          parts.push({ x, y: HIT_Y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: U.rand(0.25, 0.5), max: 0.5, color, size: U.rand(2, 4) });
        }
      }

      function dropLane(l) {
        dropped[l] = true;
        health[l] = 0;
        revive[l] = 0;
        setLaneMute(l, true);
        api.sfx('hit');
        pop(l, 'Muted', C.muted);
        if (!told.drop) {
          told.drop = true;
          api.setStatus('The ' + lc(l) + ' dropped out! Hit ' + REVIVE + ' ' + LANE_NOTE[l] +
            ' notes in a row to bring ' + verb(l, 'them', 'it') + ' back.');
        } else {
          api.setStatus(LANE_NAMES[l] + ' dropped out. ' + REVIVE + ' hits in a row bring ' + verb(l, 'them', 'it') + ' back.');
        }
        if (dropped.every((x) => x)) {
          state = 'fail';
          failT = 0;
          fadeOut(0.8);
        }
      }

      function restoreLane(l) {
        dropped[l] = false;
        health[l] = 0.5;
        revive[l] = 0;
        setLaneMute(l, false);
        api.sfx('power');
        pop(l, 'Back in!', C.mint);
        sparks(l, LANE_COLORS[l], 24);
        if (!told.restore) {
          told.restore = true;
          api.setStatus(LANE_NAMES[l] + ' ' + verb(l, 'are', 'is') + ' back in the mix. Every hit heals a lane a little.');
        }
      }

      function drain(l, amt) {
        if (dropped[l]) {
          revive[l] = 0;
          return;
        }
        const before = health[l];
        health[l] = Math.max(0, health[l] - amt);
        if (before > 0.5 && health[l] <= 0.5 && !told.warn) {
          told.warn = true;
          api.setStatus('The ' + lc(l) + ' lane is fading. Empty it and the ' + lc(l) + ' ' +
            verb(l, 'drop', 'drops') + ' out of the song.');
        }
        if (health[l] <= 1e-3) dropLane(l);
      }

      function miss(n) {
        n.judged = true;
        n.grade = 3;
        if (n.hold === 0) {
          n.hold = 2;
          holdsBad++;
        }
        counts[3]++;
        combo = 0;
        pop(n.lane, 'Miss', C.p1);
        drain(n.lane, MISS_DRAIN);
      }

      function judge(n, dt) {
        const ad = Math.abs(dt);
        if (ad > WIN_GOOD) {
          miss(n);
          return;
        }
        const g = ad <= WIN_PERFECT ? 0 : ad <= WIN_GREAT ? 1 : 2;
        n.judged = true;
        n.grade = g;
        counts[g]++;
        combo++;
        maxCombo = Math.max(maxCombo, combo);
        score += JUDGE[g].pts * mult();
        glow[n.lane] = 1;
        sparks(n.lane, LANE_COLORS[n.lane], g === 0 ? 14 : 8);
        pop(n.lane, JUDGE[g].name, JUDGE[g].color);
        if (dropped[n.lane]) {
          revive[n.lane]++;
          if (revive[n.lane] >= REVIVE) restoreLane(n.lane);
        } else {
          health[n.lane] = Math.min(1, health[n.lane] + JUDGE[g].heal);
        }
        if (n.hold === 0) holding[n.lane] = n;
        if (combo === 30 && !told.mult) {
          told.mult = true;
          api.setStatus('30 in a row: ×4 multiplier. Keep it going!');
        }
      }

      function tap(lane, t) {
        press[lane] = 1;
        if (state !== 'play') return;
        const list = laneNotes[lane];
        let best = null;
        let bd = Infinity;
        for (let i = laneIdx[lane]; i < list.length; i++) {
          const n = list[i];
          if (n.t - t > WIN_CATCH) break;
          if (n.judged) continue;
          const d = Math.abs(n.t - t);
          if (d < bd) {
            bd = d;
            best = n;
          }
        }
        if (!best || bd > WIN_CATCH) {
          // A stray tap costs a sliver of health but never breaks a revive streak.
          if (!dropped[lane]) drain(lane, STRAY_DRAIN);
          return;
        }
        judge(best, t - best.t);
      }

      const isHeld = (l) => api.keys.has(LANE_KEYS[l]) || [...pointerLane.values()].includes(l);

      function updateHolds(t, dt) {
        for (let l = 0; l < 4; l++) {
          const n = holding[l];
          if (!n) continue;
          if (t >= n.end) {
            n.hold = 1;
            holdsOk++;
            holding[l] = null;
            score += 100 * mult();
            pop(l, 'Hold!', C.violet);
            sparks(l, C.violet, 10);
          } else if (!isHeld(l)) {
            if (t >= n.end - 0.12) {
              n.hold = 1;
              holdsOk++;
              score += 100 * mult();
              pop(l, 'Hold!', C.violet);
            } else {
              n.hold = 2;
              holdsBad++;
              combo = 0;
              pop(l, 'Let go', C.muted);
              drain(l, MISS_DRAIN / 2);
              if (!told.hold) {
                told.hold = true;
                api.setStatus('Long notes need holding: keep the key down until the tail passes the line.');
              }
            }
            holding[l] = null;
          } else {
            score += dt * 120 * mult();
            glow[l] = Math.max(glow[l], 0.6);
          }
        }
      }

      /* ---------- Calibration ---------- */
      const CAL_BPM = 100;
      const CAL_BEATS = 16;

      function startCalib() {
        ensureAudio();
        state = 'calib';
        menuAgain = null;
        song = SONGS[0];
        spb = 60 / CAL_BPM;
        evs = [];
        for (let b = 0; b < CAL_BEATS; b++) evs.push({ sec: b * spb, t: b, lane: -1, type: 'click', vel: b % 4 === 0 ? 1 : 0.6 });
        schedIdx = 0;
        calibTaps = [];
        startClock(1);
        api.setStatus(ac ? 'Tap D, F, J, K or Space exactly on each click.' : 'No audio here: tap on each flash instead.');
      }

      function calibTap(raw) {
        const b = Math.round(raw / spb);
        if (b < 0 || b >= CAL_BEATS) return;
        const d = raw - b * spb;
        if (Math.abs(d) < 0.3) calibTaps.push(d);
        press[calibTaps.length % 4] = 1;
      }

      function finishCalib() {
        state = 'calibDone';
        let text;
        if (calibTaps.length >= 4) {
          const s = calibTaps.slice(2).sort((a, b) => a - b);
          const med = s.length ? s[Math.floor(s.length / 2)] : calibTaps[0];
          offsetMs = U.clamp(Math.round((med - (mode === 'audio' ? latency : 0)) * 1000 / 5) * 5, -250, 350);
          text = 'Your taps landed ' + Math.round(Math.abs(med) * 1000) + ' ms ' + (med >= 0 ? 'after' : 'before') +
            ' the click, so notes now shift by ' + fmtOffset() + '. Press + or − to fine-tune.';
        } else {
          text = 'Not enough taps to measure. The offset stays at ' + fmtOffset() + '. Press + or − to set it by hand.';
        }
        menuAgain = () => {
          api.menu({
            title: 'Offset ' + fmtOffset(),
            text: text.replace(/shift by [^.]+\./, 'shift by ' + fmtOffset() + '.').replace(/stays at [^.]+\./, 'is ' + fmtOffset() + '.'),
            buttons: [
              { label: 'Pick a song', primary: true, onClick: showStartMenu },
              { label: 'Try again', onClick: startCalib }
            ]
          });
        };
        menuAgain();
      }

      /* ---------- Input ---------- */
      function eventTime(e) {
        let lag = 0;
        if (e && typeof e.timeStamp === 'number' && e.timeStamp > 0 && typeof performance !== 'undefined') {
          const d = (performance.now() - e.timeStamp) / 1000;
          if (d > 0 && d < 0.1) lag = d;
        }
        return lag;
      }

      api.on(window, 'keydown', (e) => {
        if (e.repeat) return;
        const plus = e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+';
        const minus = e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-';
        if ((plus || minus) && (state === 'menu' || state === 'calibDone') && api.menuOpen) {
          nudge(plus ? 5 : -5);
          return;
        }
        const lane = LANE_KEYS.indexOf(e.code);
        if (state === 'calib') {
          if (lane >= 0 || e.code === 'Space') calibTap(rawTime() - eventTime(e));
          return;
        }
        if (lane >= 0 && state === 'play') tap(lane, songTime() - eventTime(e));
      });

      function laneAt(p) {
        if (p.y < TOP_Y || p.y > H) return -1;
        for (let l = 0; l < 4; l++) {
          if (p.x >= laneEdge(l, p.y) && p.x < laneEdge(l + 1, p.y)) return l;
        }
        return -1;
      }

      api.on(canvas, 'pointerdown', (e) => {
        const p = api.toCanvas(e, canvas);
        if (state === 'calib') {
          calibTap(rawTime() - eventTime(e));
          return;
        }
        if (state !== 'play') return;
        const l = laneAt(p);
        if (l < 0) return;
        pointerLane.set(e.pointerId == null ? 0 : e.pointerId, l);
        tap(l, songTime() - eventTime(e));
      });
      const lift = (e) => { pointerLane.delete(e.pointerId == null ? 0 : e.pointerId); };
      api.on(window, 'pointerup', lift);
      api.on(window, 'pointercancel', lift);

      /* ---------- Update ---------- */
      function update(dt) {
        clock += dt;
        const now = perfNow();
        if (suspended || pausedAt !== null) {
          resumeClock();
        } else if (mode === 'perf' && now - lastFrame > 0.3 && (state === 'play' || state === 'calib')) {
          // A long gap means the page stalled or was paused without us noticing: hold the song still.
          zeroPerf += now - lastFrame - 1 / 60;
        }
        lastFrame = now;
        const muted = isMuted();
        if (ac && master && (state === 'play' || state === 'calib') && muted !== lastMuted) {
          lastMuted = muted;
          try { master.gain.setTargetAtTime(muted ? 0 : 0.75, ac.currentTime, 0.03); } catch (e) { /* ignore */ }
        }
        if (ac) {
          const cut = ac.currentTime - 0.1;
          if (live.length > 64) live = live.filter((s) => s.end > cut);
        }
        for (let l = 0; l < 4; l++) {
          level[l] = Math.max(0, level[l] - dt * 3.5);
          glow[l] = Math.max(0, glow[l] - dt * 3);
          press[l] = Math.max(0, press[l] - dt * 6);
        }
        pops.forEach((p) => { p.t += dt; });
        pops = pops.filter((p) => p.t < 0.6);
        for (const p of parts) {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 600 * dt;
          p.life -= dt;
        }
        parts = parts.filter((p) => p.life > 0);

        if (state === 'calib') {
          upgradeClock();
          schedule();
          if (rawTime() > CAL_BEATS * spb + 0.3) finishCalib();
          return;
        }
        if (state === 'fail') {
          failT += dt;
          if (failT > 1.4) finishSong(false);
          return;
        }
        if (state !== 'play') return;
        upgradeClock();
        schedule();
        const t = songTime();
        // Light each instrument's meter as its sounds pass the line.
        while (visIdx < evs.length && evs[visIdx].sec <= t) {
          const e = evs[visIdx++];
          if (e.lane >= 0) level[e.lane] = Math.max(level[e.lane], e.vel * (e.type === 'hat' ? 0.5 : 1));
        }
        for (let l = 0; l < 4; l++) {
          const list = laneNotes[l];
          while (laneIdx[l] < list.length && (list[laneIdx[l]].judged || list[laneIdx[l]].t < t - WIN_GOOD)) {
            const n = list[laneIdx[l]];
            if (!n.judged) miss(n);
            laneIdx[l]++;
            if (state !== 'play') return;
          }
        }
        updateHolds(t, dt);
        if (state !== 'play') return;
        const s = Math.floor(score);
        if (s !== lastScore) {
          lastScore = s;
          api.setScore(s);
        }
        if (t > songEnd + 1 && holding.every((x) => !x)) finishSong(true);
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

      const noteY = (dtSec) => HIT_Y - (dtSec / look) * (HIT_Y - TOP_Y);

      function lanePath(l, y0, y1) {
        ctx.beginPath();
        ctx.moveTo(laneEdge(l, y0), y0);
        ctx.lineTo(laneEdge(l + 1, y0), y0);
        ctx.lineTo(laneEdge(l + 1, y1), y1);
        ctx.lineTo(laneEdge(l, y1), y1);
        ctx.closePath();
      }

      function drawBackground(t, playing) {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        const beat = playing ? t / spb : clock * 1.6;
        const ph = beat - Math.floor(beat);
        const pulse = playing && t < 0 && t < -COUNT_IN * spb ? 0 : Math.exp(-ph * 5);
        const live4 = dropped.filter((x) => !x).length / 4;
        for (let k = 0; k < 6; k++) {
          const f = (k + ph) / 6;
          ctx.strokeStyle = U.alpha(C.violet, 0.16 * (1 - f) * (0.4 + 0.6 * pulse) * (0.3 + 0.7 * live4));
          ctx.lineWidth = 3 + 6 * (1 - f);
          ctx.beginPath();
          ctx.arc(CX, TOP_Y - 30, 60 + f * 640, 0, TAU);
          ctx.stroke();
        }
        ctx.fillStyle = U.alpha(C.violet, 0.05 * pulse);
        ctx.fillRect(0, 0, W, H);
      }

      function drawHighway(t) {
        const bottom = H;
        // Lane bodies.
        for (let l = 0; l < 4; l++) {
          lanePath(l, TOP_Y, bottom);
          ctx.fillStyle = dropped[l] ? '#17142F' : U.alpha(C.panel, 0.92);
          ctx.fill();
          if (dropped[l]) {
            ctx.save();
            lanePath(l, TOP_Y, bottom);
            ctx.clip();
            ctx.strokeStyle = U.alpha(C.line, 0.55);
            ctx.lineWidth = 6;
            const off = (clock * 20) % 24;
            for (let x = 160; x < 820; x += 24) {
              ctx.beginPath();
              ctx.moveTo(x + off, TOP_Y);
              ctx.lineTo(x + off - 160, bottom);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            const g = Math.max(glow[l], press[l] * 0.6, level[l] * 0.25);
            if (g > 0.01) {
              lanePath(l, TOP_Y, bottom);
              ctx.fillStyle = U.alpha(LANE_COLORS[l], 0.16 * g);
              ctx.fill();
            }
            if (health[l] < 0.35 && Math.sin(clock * 10) > 0) {
              lanePath(l, TOP_Y, bottom);
              ctx.strokeStyle = U.alpha(C.p1, 0.7);
              ctx.lineWidth = 3;
              ctx.stroke();
            }
          }
        }
        // Beat lines scroll with the music.
        if (state === 'play' || state === 'fail' || state === 'over') {
          const b0 = Math.ceil((t - 0.2) / spb);
          const b1 = Math.floor((t + look) / spb);
          for (let b = b0; b <= b1; b++) {
            const y = noteY(b * spb - t);
            if (y < TOP_Y || y > HIT_Y + 30) continue;
            ctx.strokeStyle = U.alpha(C.text, b % 4 === 0 ? 0.2 : 0.07);
            ctx.lineWidth = b % 4 === 0 ? 2 : 1;
            ctx.beginPath();
            ctx.moveTo(laneEdge(0, y), y);
            ctx.lineTo(laneEdge(4, y), y);
            ctx.stroke();
          }
        }
        ctx.strokeStyle = U.alpha(C.text, 0.14);
        ctx.lineWidth = 1.5;
        for (let l = 1; l < 4; l++) {
          ctx.beginPath();
          ctx.moveTo(laneEdge(l, TOP_Y), TOP_Y);
          ctx.lineTo(laneEdge(l, bottom), bottom);
          ctx.stroke();
        }
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(laneEdge(0, TOP_Y), TOP_Y);
        ctx.lineTo(laneEdge(0, bottom), bottom);
        ctx.moveTo(laneEdge(4, TOP_Y), TOP_Y);
        ctx.lineTo(laneEdge(4, bottom), bottom);
        ctx.stroke();
        // Fade the far end into the background.
        ctx.fillStyle = U.alpha(C.ink, 0.6);
        ctx.fillRect(laneEdge(0, TOP_Y) - 4, TOP_Y - 2, laneEdge(4, TOP_Y) - laneEdge(0, TOP_Y) + 8, 18);
      }

      function drawReceptors() {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(laneEdge(0, HIT_Y), HIT_Y);
        ctx.lineTo(laneEdge(4, HIT_Y), HIT_Y);
        ctx.stroke();
        for (let l = 0; l < 4; l++) {
          const x0 = laneEdge(l, HIT_Y);
          const x1 = laneEdge(l + 1, HIT_Y);
          const cx = (x0 + x1) / 2;
          const col = dropped[l] ? C.muted : LANE_COLORS[l];
          const pr = press[l];
          ctx.fillStyle = U.alpha(col, 0.18 + 0.4 * Math.max(pr, glow[l]));
          U.roundRect(ctx, x0 + 8, HIT_Y - 15 + pr * 3, x1 - x0 - 16, 30, 15);
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = '800 16px Unbounded, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = dropped[l] ? C.muted : C.text;
          ctx.fillText(LANE_LETTERS[l], cx, HIT_Y + 1 + pr * 3);
          // Instrument name and lane health under the line.
          const y = HIT_Y + 40;
          ctx.font = SMALL;
          ctx.fillStyle = dropped[l] ? C.muted : col;
          ctx.fillText(dropped[l] ? 'MUTED ' + revive[l] + '/' + REVIVE : LANE_NAMES[l].toUpperCase(), cx, y);
          const bw = x1 - x0 - 24;
          ctx.fillStyle = U.alpha(C.ink, 0.8);
          U.roundRect(ctx, cx - bw / 2, y + 14, bw, 9, 4.5);
          ctx.fill();
          const frac = dropped[l] ? revive[l] / REVIVE : health[l];
          if (frac > 0) {
            ctx.fillStyle = dropped[l] ? C.violet : health[l] < 0.35 ? C.p1 : col;
            U.roundRect(ctx, cx - bw / 2, y + 14, Math.max(9, bw * frac), 9, 4.5);
            ctx.fill();
          }
        }
      }

      function drawNotes(t) {
        for (let l = 0; l < 4; l++) {
          const list = laneNotes[l];
          while (drawIdx[l] < list.length && Math.max(list[drawIdx[l]].t, list[drawIdx[l]].end) < t - 0.4) drawIdx[l]++;
          const col = LANE_COLORS[l];
          // Tails first.
          for (let i = drawIdx[l]; i < list.length; i++) {
            const n = list[i];
            if (n.t - t > look) break;
            if (n.hold < 0 || n.hold === 1) continue;
            const headY = n === holding[l] ? HIT_Y : noteY(n.t - t);
            const endY = Math.max(TOP_Y, noteY(n.end - t));
            if (endY >= headY) continue;
            const s0 = persp(headY);
            const s1 = persp(endY);
            const cx0 = (laneEdge(l, headY) + laneEdge(l + 1, headY)) / 2;
            const cx1 = (laneEdge(l, endY) + laneEdge(l + 1, endY)) / 2;
            const w0 = LANE_W * 0.3 * s0;
            const w1 = LANE_W * 0.3 * s1;
            ctx.fillStyle = n.hold === 2 || dropped[l] ? U.alpha('#5A5488', 0.6)
              : U.alpha(col, n === holding[l] ? 0.65 + 0.25 * Math.sin(clock * 20) : 0.5);
            ctx.beginPath();
            ctx.moveTo(cx0 - w0 / 2, headY);
            ctx.lineTo(cx1 - w1 / 2, endY);
            ctx.lineTo(cx1 + w1 / 2, endY);
            ctx.lineTo(cx0 + w0 / 2, headY);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = n.hold === 2 ? C.muted : col;
            U.roundRect(ctx, cx1 - w1, endY - 4, w1 * 2, 8, 4);
            ctx.fill();
          }
          for (let i = drawIdx[l]; i < list.length; i++) {
            const n = list[i];
            if (n.t - t > look) break;
            if (n.judged) continue;
            const y = noteY(n.t - t);
            if (y > H + 20) continue;
            const s = persp(y);
            const cx = (laneEdge(l, y) + laneEdge(l + 1, y)) / 2;
            drawGem(ctx, cx, y, LANE_W * 0.78 * s, 12 + 8 * s, col, dropped[l]);
          }
        }
      }

      function drawPanels(t) {
        // Left: score.
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, 20, 20, 236, 220, 16);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.fillText('SCORE', 38, 48);
        ctx.font = '800 30px Unbounded, sans-serif';
        ctx.fillStyle = C.text;
        ctx.fillText(String(Math.floor(score)), 38, 86);
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.fillText('COMBO', 38, 118);
        ctx.fillText('MULTIPLIER', 140, 118);
        ctx.font = '800 24px Unbounded, sans-serif';
        ctx.fillStyle = combo >= 10 ? C.gold : C.text;
        ctx.fillText(String(combo), 38, 148);
        ctx.fillStyle = mult() > 1 ? C.violet : U.alpha(C.text, 0.6);
        ctx.fillText('×' + mult(), 140, 148);
        // Multiplier progress pips.
        for (let k = 0; k < 10; k++) {
          ctx.fillStyle = mult() >= 4 || k < combo % 10 ? C.violet : U.alpha(C.line, 0.9);
          ctx.fillRect(140 + k * 9, 156, 6, 4);
        }
        ctx.font = HUD;
        ctx.fillStyle = C.text;
        ctx.fillText(accuracy().toFixed(1) + '%', 38, 188);
        ctx.fillStyle = C.muted;
        ctx.font = SMALL;
        ctx.fillText('ACCURACY', 140, 186);
        // Song progress.
        const prog = U.clamp(t / Math.max(1, songEnd), 0, 1);
        ctx.fillStyle = U.alpha(C.ink, 0.9);
        U.roundRect(ctx, 38, 206, 200, 10, 5);
        ctx.fill();
        ctx.fillStyle = C.violet;
        U.roundRect(ctx, 38, 206, Math.max(10, 200 * prog), 10, 5);
        ctx.fill();
        ctx.fillStyle = C.muted;
        ctx.fillText(song.name + ' · ' + DIFF_NAMES[diff], 38, 232);

        // Right: the band.
        const rx = 704;
        ctx.fillStyle = U.alpha(C.panel, 0.88);
        U.roundRect(ctx, rx, 20, 236, 262, 16);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.textAlign = 'left';
        ctx.fillText('THE BAND', rx + 18, 48);
        const liveN = dropped.filter((x) => !x).length;
        ctx.textAlign = 'right';
        ctx.fillStyle = liveN === 4 ? C.mint : liveN <= 1 ? C.p1 : C.gold;
        ctx.fillText(liveN + '/4 playing', rx + 218, 48);
        for (let l = 0; l < 4; l++) {
          const y = 66 + l * 56;
          const col = LANE_COLORS[l];
          // Speaker level meter.
          for (let k = 0; k < 5; k++) {
            const on = !dropped[l] && level[l] > k / 5;
            ctx.fillStyle = on ? col : U.alpha(C.line, 0.8);
            ctx.fillRect(rx + 18 + k * 7, y + 22 - k * 4, 5, 6 + k * 4);
          }
          ctx.textAlign = 'left';
          ctx.font = HUD;
          ctx.fillStyle = dropped[l] ? C.muted : C.text;
          ctx.fillText(LANE_NAMES[l], rx + 64, y + 14);
          ctx.font = SMALL;
          ctx.textAlign = 'right';
          ctx.fillStyle = dropped[l] ? C.p1 : C.muted;
          ctx.fillText(dropped[l] ? 'silent' : LANE_LETTERS[l] + ' key', rx + 218, y + 14);
          const bw = 154;
          ctx.fillStyle = U.alpha(C.ink, 0.9);
          U.roundRect(ctx, rx + 64, y + 22, bw, 8, 4);
          ctx.fill();
          const frac = dropped[l] ? revive[l] / REVIVE : health[l];
          if (frac > 0) {
            ctx.fillStyle = dropped[l] ? C.violet : health[l] < 0.35 ? C.p1 : col;
            U.roundRect(ctx, rx + 64, y + 22, Math.max(8, bw * frac), 8, 4);
            ctx.fill();
          }
          if (dropped[l]) {
            ctx.font = SMALL;
            ctx.textAlign = 'left';
            ctx.fillStyle = C.violet;
            ctx.fillText('revive ' + revive[l] + '/' + REVIVE + ' in a row', rx + 64, y + 46);
          }
        }
      }

      function drawPops() {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const p of pops) {
          const x = (laneEdge(p.lane, HIT_Y) + laneEdge(p.lane + 1, HIT_Y)) / 2;
          const a = Math.min(1, (0.6 - p.t) * 4);
          ctx.globalAlpha = a;
          ctx.font = '800 15px Unbounded, sans-serif';
          ctx.lineWidth = 5;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = C.ink;
          ctx.strokeText(p.text, x, HIT_Y - 44 - p.t * 50);
          ctx.fillStyle = p.color;
          ctx.fillText(p.text, x, HIT_Y - 44 - p.t * 50);
        }
        ctx.globalAlpha = 1;
        for (const p of parts) {
          ctx.globalAlpha = Math.max(0, p.life / p.max);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;
      }

      function drawCalib() {
        const raw = rawTime();
        const beat = raw / spb;
        const ph = beat - Math.floor(beat);
        const on = beat >= 0 && beat < CAL_BEATS;
        const pulse = on ? Math.exp(-ph * 7) : 0;
        ctx.fillStyle = U.alpha(C.violet, 0.15 + 0.5 * pulse);
        ctx.beginPath();
        ctx.arc(CX, 250, 70 + 30 * pulse, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = C.violet;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.font = '800 30px Unbounded, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = C.text;
        ctx.fillText(beat < 0 ? 'Ready' : String(Math.min(CAL_BEATS, Math.floor(beat) + 1)), CX, 250);
        ctx.font = HUD;
        ctx.fillStyle = C.muted;
        ctx.fillText('Tap D F J K or Space on every click (' + CAL_BEATS + ' clicks)', CX, 380);
        // Early / late scale with your taps.
        const x0 = CX - 200;
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x0, 440);
        ctx.lineTo(x0 + 400, 440);
        ctx.moveTo(CX, 426);
        ctx.lineTo(CX, 454);
        ctx.stroke();
        ctx.font = SMALL;
        ctx.fillStyle = C.muted;
        ctx.fillText('early', x0 + 20, 466);
        ctx.fillText('late', x0 + 380, 466);
        calibTaps.forEach((d, i) => {
          const x = CX + U.clamp(d / 0.3, -1, 1) * 200;
          ctx.fillStyle = U.alpha(C.gold, i === calibTaps.length - 1 ? 1 : 0.5);
          ctx.fillRect(x - 2, 428, 4, 24);
        });
      }

      function draw() {
        const playing = state === 'play' || state === 'fail' || state === 'over';
        const t = playing ? (state === 'over' ? frozenT : songTime()) : 0;
        drawBackground(t, playing);
        if (state === 'calib' || state === 'calibDone') {
          drawCalib();
          return;
        }
        drawHighway(t);
        if (playing) drawNotes(t);
        drawReceptors();
        drawPops();
        drawPanels(t);
        if (state === 'play' && t < 0) {
          const beatsLeft = Math.ceil(-t / spb);
          if (beatsLeft <= COUNT_IN) {
            const f = (-t / spb) - Math.floor(-t / spb);
            const label = beatsLeft === 1 ? 'Go!' : String(beatsLeft - 1);
            bigText(label, CX, 250, beatsLeft === 1 ? C.mint : C.text, 1 + f * 0.4, Math.min(1, 0.3 + f));
          }
        }
        if (state === 'fail') {
          ctx.fillStyle = U.alpha(C.ink, Math.min(0.6, failT));
          ctx.fillRect(0, 0, W, H);
          bigText('Silence…', CX, 250, C.p1, 1, Math.min(1, failT * 2));
        }
        if (state === 'over' && resultInfo) {
          ctx.fillStyle = U.alpha(C.ink, 0.55);
          ctx.fillRect(0, 0, W, H);
          ctx.font = SMALL;
          ctx.textAlign = 'center';
          ctx.fillStyle = C.muted;
          ctx.fillText('GRADE', 138, 300);
          bigText(resultInfo.grade, 138, 360, resultInfo.grade === 'S' ? C.gold : resultInfo.grade === 'A' ? C.mint : C.text, 2, 1);
        }
      }

      showStartMenu();
      api.loop((dt) => {
        update(dt);
        if (state === 'play' || state === 'fail') frozenT = songTime();
        draw();
      });

      return {
        destroy() {
          stopAllSources();
          if (ac) {
            try { master.disconnect(); } catch (e) { /* ignore */ }
            try { if (typeof ac.close === 'function') quiet(ac.close()); } catch (e) { /* ignore */ }
            ac = null;
          }
        }
      };
    }
  });
})();
