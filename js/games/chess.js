/* Chess — full legal chess against the computer or a friend, plus a two-player fog mode. */
(function () {
  'use strict';

  const C = Arcade.colors;
  const U = Arcade.util;
  const W = 940;
  const H = 640;
  const SQ = 75;
  const BX = 20;
  const BY = 20;
  const PX = 640;
  const PW = 280;
  const FONT = '600 15px "JetBrains Mono", monospace';
  const FONT_SM = '600 12px "JetBrains Mono", monospace';
  const BIG = '800 44px Unbounded, sans-serif';
  const now = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

  /* ===== ENGINE START ===== */
  /* 0x88 board: square = rank * 16 + file, rank 0 is White's back rank.
     Pieces: color (0 white, 8 black) | type (1 pawn … 6 king). */
  const PAWN = 1, KNIGHT = 2, BISHOP = 3, ROOK = 4, QUEEN = 5, KING = 6;
  const WHITE = 0, BLACK = 8;
  const F_EP = 1, F_CASTLE = 2, F_DOUBLE = 4;
  const N_OFF = [33, 31, 18, 14, -33, -31, -18, -14];
  const B_DIR = [17, 15, -17, -15];
  const R_DIR = [16, -16, 1, -1];
  const K_DIR = [17, 15, -17, -15, 16, -16, 1, -1];
  const VALUE = [0, 100, 320, 330, 500, 900, 2000];
  const EG_VALUE = [0, 120, 300, 320, 520, 920, 0];
  const PHASE_W = [0, 0, 1, 1, 2, 4, 0];
  const MATE = 30000;
  const INF = 32000;
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';
  const LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];

  const mv = (from, to, promo, flag) => from | (to << 7) | (promo << 14) | (flag << 17);
  const mFrom = (m) => m & 127;
  const mTo = (m) => (m >> 7) & 127;
  const mPromo = (m) => (m >> 14) & 7;
  const mFlag = (m) => (m >> 17) & 7;
  const sqName = (sq) => FILES[sq & 7] + ((sq >> 4) + 1);

  /* Zobrist keys from a fixed-seed generator (two 32-bit halves). */
  let zseed = 0x2545F491;
  function rnd32() {
    zseed = (zseed + 0x6D2B79F5) | 0;
    let t = zseed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) | 0;
  }
  const ZA = new Int32Array(16 * 128);
  const ZB = new Int32Array(16 * 128);
  for (let i = 0; i < ZA.length; i++) { ZA[i] = rnd32(); ZB[i] = rnd32(); }
  const ZSIDE_A = rnd32();
  const ZSIDE_B = rnd32();
  const ZC_A = new Int32Array(16);
  const ZC_B = new Int32Array(16);
  for (let i = 0; i < 16; i++) { ZC_A[i] = rnd32(); ZC_B[i] = rnd32(); }
  const ZE_A = new Int32Array(8);
  const ZE_B = new Int32Array(8);
  for (let i = 0; i < 8; i++) { ZE_A[i] = rnd32(); ZE_B[i] = rnd32(); }

  /* Castling rights: 1 = white short, 2 = white long, 4 = black short, 8 = black long. */
  const CMASK = new Int8Array(128).fill(15);
  CMASK[0] = 13; CMASK[7] = 14; CMASK[4] = 12;
  CMASK[112] = 7; CMASK[119] = 11; CMASK[116] = 3;

  /* Piece-square tables, written from White's side with rank 8 on the first row. */
  const T_PAWN = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0];
  const T_PAWN_EG = [
    0, 0, 0, 0, 0, 0, 0, 0,
    90, 90, 90, 90, 90, 90, 90, 90,
    55, 55, 55, 55, 55, 55, 55, 55,
    32, 32, 32, 32, 32, 32, 32, 32,
    18, 18, 18, 18, 18, 18, 18, 18,
    8, 8, 8, 8, 8, 8, 8, 8,
    0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 0, 0, 0];
  const T_KNIGHT = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50];
  const T_BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20];
  const T_ROOK = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0];
  const T_QUEEN = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20];
  const T_KING = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20];
  const T_KING_EG = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50];
  const MG_T = [null, T_PAWN, T_KNIGHT, T_BISHOP, T_ROOK, T_QUEEN, T_KING];
  const EG_T = [null, T_PAWN_EG, T_KNIGHT, T_BISHOP, T_ROOK, T_QUEEN, T_KING_EG];
  const PMG = [];
  const PEG = [];
  for (let p = 0; p < 16; p++) { PMG.push(new Int16Array(128)); PEG.push(new Int16Array(128)); }
  [WHITE, BLACK].forEach((color) => {
    for (let t = 1; t <= 6; t++) {
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) continue;
        const r = sq >> 4;
        const f = sq & 7;
        const idx = color === WHITE ? (7 - r) * 8 + f : r * 8 + f;
        const sign = color === WHITE ? 1 : -1;
        PMG[color | t][sq] = sign * ((t === KING ? 0 : VALUE[t]) + MG_T[t][idx]);
        PEG[color | t][sq] = sign * (EG_VALUE[t] + EG_T[t][idx]);
      }
    }
  });

  class Pos {
    constructor() {
      this.b = new Int8Array(128);
      this.side = WHITE;
      this.castle = 0;
      this.ep = -1;
      this.epf = -1;
      this.half = 0;
      this.full = 1;
      this.kings = [-1, -1];
      this.np = [0, 0];
      this.h1 = 0;
      this.h2 = 0;
      this.mg = 0;
      this.eg = 0;
      this.phase = 0;
      this.undo = [];
      this.up = 0;
      this.hist1 = [];
      this.hist2 = [];
      this.fog = false;
    }

    put(sq, p) {
      this.b[sq] = p;
      const k = p * 128 + sq;
      this.h1 ^= ZA[k];
      this.h2 ^= ZB[k];
      this.mg += PMG[p][sq];
      this.eg += PEG[p][sq];
      const t = p & 7;
      this.phase += PHASE_W[t];
      if (t === KING) this.kings[p >> 3] = sq;
      else if (t !== PAWN) this.np[p >> 3]++;
    }

    take(sq) {
      const p = this.b[sq];
      if (!p) return 0;
      this.b[sq] = 0;
      const k = p * 128 + sq;
      this.h1 ^= ZA[k];
      this.h2 ^= ZB[k];
      this.mg -= PMG[p][sq];
      this.eg -= PEG[p][sq];
      const t = p & 7;
      this.phase -= PHASE_W[t];
      if (t !== KING && t !== PAWN) this.np[p >> 3]--;
      return p;
    }

    /* File of the en passant square if a capture is actually possible (for the hash), else -1. */
    epHashFile() {
      if (this.ep < 0) return -1;
      const b = this.b;
      const pawn = this.side | PAWN;
      const base = this.side === WHITE ? this.ep - 16 : this.ep + 16;
      if ((!((base - 1) & 0x88) && b[base - 1] === pawn) || (!((base + 1) & 0x88) && b[base + 1] === pawn)) return this.ep & 7;
      return -1;
    }

    load(fen) {
      this.b.fill(0);
      this.kings = [-1, -1];
      this.np = [0, 0];
      this.h1 = 0; this.h2 = 0; this.mg = 0; this.eg = 0; this.phase = 0;
      this.up = 0;
      this.hist1 = [];
      this.hist2 = [];
      const parts = fen.trim().split(/\s+/);
      let r = 7;
      let f = 0;
      for (const ch of parts[0]) {
        if (ch === '/') { r--; f = 0; } else if (ch >= '1' && ch <= '8') f += +ch;
        else {
          const t = 'pnbrqk'.indexOf(ch.toLowerCase()) + 1;
          if (t > 0) this.put(r * 16 + f, (ch === ch.toUpperCase() ? WHITE : BLACK) | t);
          f++;
        }
      }
      this.side = parts[1] === 'b' ? BLACK : WHITE;
      if (this.side === BLACK) { this.h1 ^= ZSIDE_A; this.h2 ^= ZSIDE_B; }
      this.castle = 0;
      const cs = parts[2] || '-';
      if (cs.indexOf('K') >= 0) this.castle |= 1;
      if (cs.indexOf('Q') >= 0) this.castle |= 2;
      if (cs.indexOf('k') >= 0) this.castle |= 4;
      if (cs.indexOf('q') >= 0) this.castle |= 8;
      this.h1 ^= ZC_A[this.castle];
      this.h2 ^= ZC_B[this.castle];
      const eps = parts[3] || '-';
      this.ep = eps === '-' ? -1 : (+eps[1] - 1) * 16 + FILES.indexOf(eps[0]);
      this.epf = this.epHashFile();
      if (this.epf >= 0) { this.h1 ^= ZE_A[this.epf]; this.h2 ^= ZE_B[this.epf]; }
      this.half = +(parts[4] || 0) || 0;
      this.full = +(parts[5] || 1) || 1;
    }

    clone() {
      const p = new Pos();
      p.b.set(this.b);
      p.side = this.side; p.castle = this.castle; p.ep = this.ep; p.epf = this.epf;
      p.half = this.half; p.full = this.full;
      p.kings = this.kings.slice();
      p.np = this.np.slice();
      p.h1 = this.h1; p.h2 = this.h2; p.mg = this.mg; p.eg = this.eg; p.phase = this.phase;
      p.hist1 = this.hist1.slice();
      p.hist2 = this.hist2.slice();
      p.fog = this.fog;
      return p;
    }

    record(m) {
      let u = this.undo[this.up];
      if (!u) u = this.undo[this.up] = {};
      this.up++;
      u.m = m; u.cap = 0; u.capSq = 0;
      u.castle = this.castle; u.ep = this.ep; u.epf = this.epf; u.half = this.half;
      u.h1 = this.h1; u.h2 = this.h2; u.mg = this.mg; u.eg = this.eg; u.phase = this.phase;
      u.k0 = this.kings[0]; u.k1 = this.kings[1]; u.n0 = this.np[0]; u.n1 = this.np[1];
      this.hist1.push(this.h1);
      this.hist2.push(this.h2);
      return u;
    }

    make(m) {
      const from = mFrom(m);
      const to = mTo(m);
      const promo = mPromo(m);
      const flag = mFlag(m);
      const us = this.side;
      const u = this.record(m);
      this.h1 ^= ZC_A[this.castle]; this.h2 ^= ZC_B[this.castle];
      if (this.epf >= 0) { this.h1 ^= ZE_A[this.epf]; this.h2 ^= ZE_B[this.epf]; }
      const capSq = (flag & F_EP) ? (us === WHITE ? to - 16 : to + 16) : to;
      const cap = this.take(capSq);
      u.cap = cap;
      u.capSq = capSq;
      const p = this.take(from);
      this.put(to, promo ? (us | promo) : p);
      if (flag & F_CASTLE) {
        if (to > from) this.put(from + 1, this.take(from + 3));
        else this.put(from - 1, this.take(from - 4));
      }
      this.castle &= CMASK[from] & CMASK[to];
      this.ep = (flag & F_DOUBLE) ? (from + to) >> 1 : -1;
      this.half = (cap || (p & 7) === PAWN) ? 0 : this.half + 1;
      if (us === BLACK) this.full++;
      this.side = us ^ 8;
      this.h1 ^= ZSIDE_A ^ ZC_A[this.castle];
      this.h2 ^= ZSIDE_B ^ ZC_B[this.castle];
      this.epf = this.epHashFile();
      if (this.epf >= 0) { this.h1 ^= ZE_A[this.epf]; this.h2 ^= ZE_B[this.epf]; }
    }

    makeNull() {
      this.record(0);
      if (this.epf >= 0) { this.h1 ^= ZE_A[this.epf]; this.h2 ^= ZE_B[this.epf]; }
      this.ep = -1;
      this.epf = -1;
      this.half++;
      this.side ^= 8;
      this.h1 ^= ZSIDE_A;
      this.h2 ^= ZSIDE_B;
    }

    unmake() {
      const u = this.undo[--this.up];
      this.hist1.pop();
      this.hist2.pop();
      this.side ^= 8;
      const m = u.m;
      if (m) {
        const b = this.b;
        const from = mFrom(m);
        const to = mTo(m);
        const us = this.side;
        b[from] = mPromo(m) ? (us | PAWN) : b[to];
        b[to] = 0;
        if (u.cap) b[u.capSq] = u.cap;
        if (mFlag(m) & F_CASTLE) {
          if (to > from) { b[from + 3] = b[from + 1]; b[from + 1] = 0; } else { b[from - 4] = b[from - 1]; b[from - 1] = 0; }
        }
        if (us === BLACK) this.full--;
      }
      this.castle = u.castle; this.ep = u.ep; this.epf = u.epf; this.half = u.half;
      this.h1 = u.h1; this.h2 = u.h2; this.mg = u.mg; this.eg = u.eg; this.phase = u.phase;
      this.kings[0] = u.k0; this.kings[1] = u.k1; this.np[0] = u.n0; this.np[1] = u.n1;
    }

    attacked(sq, by) {
      const b = this.b;
      if (by === WHITE) {
        if (!((sq - 15) & 0x88) && b[sq - 15] === PAWN) return true;
        if (!((sq - 17) & 0x88) && b[sq - 17] === PAWN) return true;
      } else {
        if (!((sq + 15) & 0x88) && b[sq + 15] === (BLACK | PAWN)) return true;
        if (!((sq + 17) & 0x88) && b[sq + 17] === (BLACK | PAWN)) return true;
      }
      const kn = by | KNIGHT;
      const kg = by | KING;
      for (let i = 0; i < 8; i++) {
        let s = sq + N_OFF[i];
        if (!(s & 0x88) && b[s] === kn) return true;
        s = sq + K_DIR[i];
        if (!(s & 0x88) && b[s] === kg) return true;
      }
      const bi = by | BISHOP;
      const ro = by | ROOK;
      const qu = by | QUEEN;
      for (let i = 0; i < 4; i++) {
        let d = B_DIR[i];
        let s = sq + d;
        while (!(s & 0x88)) {
          const p = b[s];
          if (p) { if (p === bi || p === qu) return true; break; }
          s += d;
        }
        d = R_DIR[i];
        s = sq + d;
        while (!(s & 0x88)) {
          const p = b[s];
          if (p) { if (p === ro || p === qu) return true; break; }
          s += d;
        }
      }
      return false;
    }

    inCheck() {
      const k = this.kings[this.side >> 3];
      return k >= 0 && this.b[k] === (this.side | KING) && this.attacked(k, this.side ^ 8);
    }

    /* Pseudo-legal moves (captures and queen promotions only when caps is true). */
    gen(list, caps) {
      const b = this.b;
      const us = this.side;
      const them = us ^ 8;
      const fwd = us === WHITE ? 16 : -16;
      const startRank = us === WHITE ? 1 : 6;
      const lastRank = us === WHITE ? 7 : 0;
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = b[sq];
        if (!p || (p & 8) !== us) continue;
        const t = p & 7;
        if (t === PAWN) {
          const one = sq + fwd;
          const promote = (one >> 4) === lastRank;
          if (!b[one]) {
            if (promote) {
              list.push(mv(sq, one, QUEEN, 0));
              if (!caps) list.push(mv(sq, one, ROOK, 0), mv(sq, one, BISHOP, 0), mv(sq, one, KNIGHT, 0));
            } else if (!caps) {
              list.push(mv(sq, one, 0, 0));
              if ((sq >> 4) === startRank && !b[one + fwd]) list.push(mv(sq, one + fwd, 0, F_DOUBLE));
            }
          }
          for (let k = -1; k <= 1; k += 2) {
            const to = one + k;
            if (to & 0x88) continue;
            const q = b[to];
            if (q && (q & 8) === them) {
              if (promote) {
                list.push(mv(sq, to, QUEEN, 0));
                if (!caps) list.push(mv(sq, to, ROOK, 0), mv(sq, to, BISHOP, 0), mv(sq, to, KNIGHT, 0));
              } else list.push(mv(sq, to, 0, 0));
            } else if (to === this.ep && !q) list.push(mv(sq, to, 0, F_EP));
          }
        } else if (t === KNIGHT || t === KING) {
          const offs = t === KNIGHT ? N_OFF : K_DIR;
          for (let i = 0; i < 8; i++) {
            const to = sq + offs[i];
            if (to & 0x88) continue;
            const q = b[to];
            if (!q) { if (!caps) list.push(mv(sq, to, 0, 0)); } else if ((q & 8) === them) list.push(mv(sq, to, 0, 0));
          }
          if (t === KING && !caps) this.genCastle(list, sq);
        } else {
          const dirs = t === BISHOP ? B_DIR : t === ROOK ? R_DIR : K_DIR;
          for (let i = 0; i < dirs.length; i++) {
            const d = dirs[i];
            let to = sq + d;
            while (!(to & 0x88)) {
              const q = b[to];
              if (!q) { if (!caps) list.push(mv(sq, to, 0, 0)); } else {
                if ((q & 8) === them) list.push(mv(sq, to, 0, 0));
                break;
              }
              to += d;
            }
          }
        }
      }
    }

    genCastle(list, k) {
      const b = this.b;
      const us = this.side;
      const them = us ^ 8;
      const home = us === WHITE ? 4 : 116;
      if (k !== home) return;
      const shortBit = us === WHITE ? 1 : 4;
      const longBit = us === WHITE ? 2 : 8;
      const rook = us | ROOK;
      const safe = (s) => this.fog || !this.attacked(s, them);
      if ((this.castle & shortBit) && !b[k + 1] && !b[k + 2] && b[k + 3] === rook &&
        safe(k) && safe(k + 1) && safe(k + 2)) list.push(mv(k, k + 2, 0, F_CASTLE));
      if ((this.castle & longBit) && !b[k - 1] && !b[k - 2] && !b[k - 3] && b[k - 4] === rook &&
        safe(k) && safe(k - 1) && safe(k - 2)) list.push(mv(k, k - 2, 0, F_CASTLE));
    }

    /* Did the side that just moved leave its own king attacked? (Never true in fog.) */
    leftInCheck() {
      if (this.fog) return false;
      const mover = this.side ^ 8;
      const k = this.kings[mover >> 3];
      return this.attacked(k, this.side);
    }

    legal() {
      const list = [];
      this.gen(list, false);
      if (this.fog) return list;
      const out = [];
      for (let i = 0; i < list.length; i++) {
        this.make(list[i]);
        if (!this.leftInCheck()) out.push(list[i]);
        this.unmake();
      }
      return out;
    }

    isRepeat() {
      const n = this.hist1.length;
      for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) {
        if (this.hist1[i] === this.h1 && this.hist2[i] === this.h2) return true;
      }
      return false;
    }

    repCount() {
      const n = this.hist1.length;
      let c = 1;
      for (let i = n - 2; i >= 0 && i >= n - this.half; i -= 2) {
        if (this.hist1[i] === this.h1 && this.hist2[i] === this.h2) c++;
      }
      return c;
    }

    insufficient() {
      const minors = [];
      for (let sq = 0; sq < 128; sq++) {
        if (sq & 0x88) { sq += 7; continue; }
        const p = this.b[sq];
        if (!p) continue;
        const t = p & 7;
        if (t === KING) continue;
        if (t === PAWN || t === ROOK || t === QUEEN) return false;
        minors.push({ t, shade: ((sq >> 4) + (sq & 7)) & 1 });
      }
      if (this.fog) return minors.length === 0;
      if (minors.length <= 1) return true;
      return minors.every((m) => m.t === BISHOP && m.shade === minors[0].shade);
    }

    evaluate() {
      const ph = this.phase > 24 ? 24 : this.phase;
      let s = ((this.mg * ph + this.eg * (24 - ph)) / 24) | 0;
      if (ph <= 6 && (this.eg > 250 || this.eg < -250)) {
        // Mop-up: the stronger side walks its king toward the lonely enemy king.
        const a = this.kings[0];
        const c = this.kings[1];
        const d = Math.max(Math.abs((a >> 4) - (c >> 4)), Math.abs((a & 7) - (c & 7)));
        s += (this.eg > 0 ? 1 : -1) * (7 - d) * 8;
      }
      return (this.side === WHITE ? s : -s) + 8;
    }
  }

  function sanOf(pos, m, legalList) {
    const from = mFrom(m);
    const to = mTo(m);
    const p = pos.b[from];
    const t = p & 7;
    const flag = mFlag(m);
    let s;
    if (flag & F_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
    else {
      const cap = pos.b[to] || (flag & F_EP);
      if (t === PAWN) {
        s = (cap ? FILES[from & 7] + 'x' : '') + sqName(to) + (mPromo(m) ? '=' + LETTER[mPromo(m)] : '');
      } else {
        let dis = '';
        const others = legalList.filter((o) => o !== m && mTo(o) === to && mFrom(o) !== from && pos.b[mFrom(o)] === p);
        if (others.length) {
          const sameFile = others.some((o) => (mFrom(o) & 7) === (from & 7));
          const sameRank = others.some((o) => (mFrom(o) >> 4) === (from >> 4));
          if (!sameFile) dis = FILES[from & 7];
          else if (!sameRank) dis = String((from >> 4) + 1);
          else dis = sqName(from);
        }
        s = LETTER[t] + dis + (cap ? 'x' : '') + sqName(to);
      }
    }
    if (!pos.fog) {
      pos.make(m);
      if (pos.inCheck()) s += pos.legal().length ? '+' : '#';
      pos.unmake();
    }
    return s;
  }

  /* Result for the side to move, or null while the game goes on. */
  function outcome(pos, legalList) {
    if (!legalList.length) {
      if (!pos.fog && pos.inCheck()) return { winner: pos.side ^ 8, reason: 'mate' };
      return { winner: -1, reason: 'stalemate' };
    }
    if (pos.half >= 100) return { winner: -1, reason: 'fifty' };
    if (pos.repCount() >= 3) return { winner: -1, reason: 'repetition' };
    if (pos.insufficient()) return { winner: -1, reason: 'material' };
    return null;
  }

  /* ---------- Search: negamax alpha-beta with PVS, TT, killers, quiescence. ---------- */
  const TT_BITS = 18;
  const TT_MASK = (1 << TT_BITS) - 1;
  let TT = null;
  function ensureTT() {
    if (TT) return;
    const n = 1 << TT_BITS;
    TT = { key: new Int32Array(n), move: new Int32Array(n), score: new Int16Array(n), depth: new Int8Array(n), flag: new Uint8Array(n) };
  }
  const TT_EXACT = 1, TT_LOWER = 2, TT_UPPER = 3;
  const SLICE_MS = 14;
  const SLICE_NODES = 20000;

  function orderScores(S, list, ttMove, ply) {
    const b = S.pos.b;
    const sc = new Int32Array(list.length);
    const k1 = S.killers[ply * 2];
    const k2 = S.killers[ply * 2 + 1];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      if (m === ttMove) { sc[i] = 10000000; continue; }
      const victim = (mFlag(m) & F_EP) ? PAWN : (b[mTo(m)] & 7);
      const promo = mPromo(m);
      if (victim || promo === QUEEN) {
        sc[i] = 1000000 + victim * 100 - (b[mFrom(m)] & 7) + (promo === QUEEN ? 800 : 0);
      } else if (m === k1) sc[i] = 900000;
      else if (m === k2) sc[i] = 890000;
      else sc[i] = S.hist[mFrom(m) * 128 + mTo(m)];
    }
    return sc;
  }

  function pickNext(list, sc, i) {
    let bi = i;
    for (let j = i + 1; j < list.length; j++) if (sc[j] > sc[bi]) bi = j;
    if (bi !== i) {
      const tm = list[i]; list[i] = list[bi]; list[bi] = tm;
      const ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts;
    }
    return list[i];
  }

  function quiesce(S, alpha, beta, ply) {
    const pos = S.pos;
    S.nodes++;
    if ((S.nodes & 1023) === 0 && S.depthDone >= 1 && now() > S.deadline) S.stop = true;
    if (S.stop) return 0;
    const stand = pos.evaluate();
    if (ply >= 90 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const list = [];
    pos.gen(list, true);
    const sc = orderScores(S, list, 0, Math.min(ply, 127));
    let best = stand;
    for (let i = 0; i < list.length; i++) {
      const m = pickNext(list, sc, i);
      const victim = (mFlag(m) & F_EP) ? PAWN : (pos.b[mTo(m)] & 7);
      if (!mPromo(m) && stand + VALUE[victim] + 200 < alpha) continue; // delta pruning
      pos.make(m);
      if (pos.leftInCheck()) { pos.unmake(); continue; }
      const v = -quiesce(S, -beta, -alpha, ply + 1);
      pos.unmake();
      if (S.stop) return 0;
      if (v > best) {
        best = v;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) return v;
        }
      }
    }
    return best;
  }

  function* nega(S, depth, alpha, beta, ply, nullOk) {
    const pos = S.pos;
    if (S.nodes - S.lastCheck >= 256) {
      S.lastCheck = S.nodes;
      const t = now();
      if (S.depthDone >= 1 && t > S.deadline) S.stop = true;
      else if (t - S.sliceT > SLICE_MS || S.nodes - S.sliceNodes > SLICE_NODES) {
        yield 0;
        S.sliceT = now();
        S.sliceNodes = S.nodes;
      }
    }
    if (S.stop) return 0;
    if (ply > 0 && (pos.half >= 100 || pos.isRepeat())) return 0;
    if (ply >= 90) return pos.evaluate();
    const inCheck = pos.inCheck();
    if (inCheck) depth++;
    if (depth <= 0) return quiesce(S, alpha, beta, ply);
    S.nodes++;

    const idx = pos.h1 & TT_MASK;
    let ttMove = 0;
    if (TT.key[idx] === pos.h2 && TT.flag[idx]) {
      ttMove = TT.move[idx];
      if (ply > 0 && TT.depth[idx] >= depth) {
        let s = TT.score[idx];
        if (s > MATE - 256) s -= ply; else if (s < -MATE + 256) s += ply;
        const f = TT.flag[idx];
        if (f === TT_EXACT || (f === TT_LOWER && s >= beta) || (f === TT_UPPER && s <= alpha)) return s;
      }
    }

    if (nullOk && !inCheck && depth >= 3 && ply > 0 && beta < MATE - 256 && pos.np[pos.side >> 3] > 0 && pos.evaluate() >= beta) {
      pos.makeNull();
      const v = -(yield* nega(S, depth - 3, -beta, -beta + 1, ply + 1, false));
      pos.unmake();
      if (S.stop) return 0;
      if (v >= beta) return beta;
    }

    const list = [];
    pos.gen(list, false);
    const kp = Math.min(ply, 127);
    const sc = orderScores(S, list, ttMove, kp);
    const a0 = alpha;
    let best = -INF;
    let bestMove = 0;
    let legal = 0;
    for (let i = 0; i < list.length; i++) {
      const m = pickNext(list, sc, i);
      pos.make(m);
      if (pos.leftInCheck()) { pos.unmake(); continue; }
      legal++;
      let v;
      if (legal === 1) v = -(yield* nega(S, depth - 1, -beta, -alpha, ply + 1, true));
      else {
        v = -(yield* nega(S, depth - 1, -alpha - 1, -alpha, ply + 1, true));
        if (v > alpha && v < beta && !S.stop) v = -(yield* nega(S, depth - 1, -beta, -alpha, ply + 1, true));
      }
      pos.unmake();
      if (S.stop) return 0;
      if (v > best) {
        best = v;
        bestMove = m;
        if (v > alpha) {
          alpha = v;
          if (v >= beta) {
            const quiet = !pos.b[mTo(m)] && !(mFlag(m) & F_EP) && !mPromo(m);
            if (quiet) {
              if (S.killers[kp * 2] !== m) { S.killers[kp * 2 + 1] = S.killers[kp * 2]; S.killers[kp * 2] = m; }
              S.hist[mFrom(m) * 128 + mTo(m)] += depth * depth;
            }
            break;
          }
        }
      }
    }
    if (!legal) return inCheck ? -MATE + ply : 0;
    let store = best;
    if (store > MATE - 256) store += ply; else if (store < -MATE + 256) store -= ply;
    TT.key[idx] = pos.h2;
    TT.move[idx] = bestMove;
    TT.score[idx] = store;
    TT.depth[idx] = depth;
    TT.flag[idx] = best >= beta ? TT_LOWER : best > a0 ? TT_EXACT : TT_UPPER;
    return best;
  }

  /* Iterative deepening. A generator: each next() runs one short slice of the search.
     opts: { time ms, depth, noise (centipawns, Easy only) }. Returns { move, score, depth }. */
  function* think(src, opts) {
    ensureTT();
    const pos = src.clone();
    const start = now();
    const S = {
      pos, nodes: 0, lastCheck: 0, sliceT: start, sliceNodes: 0, stop: false, depthDone: 0,
      deadline: start + opts.time, killers: new Int32Array(256), hist: new Int32Array(128 * 128)
    };
    const root = pos.legal();
    if (!root.length) return null;
    U.shuffle(root);
    if (root.length === 1) return { move: root[0], score: 0, depth: 0 };
    const multi = opts.noise > 0;
    let best = root[0];
    let bestScore = -INF;
    let scores = null;
    for (let depth = 1; depth <= opts.depth; depth++) {
      let alpha = -INF;
      let iterBest = 0;
      let iterScore = -INF;
      const sc = root.map(() => -INF);
      for (let i = 0; i < root.length; i++) {
        const m = root[i];
        pos.make(m);
        let v;
        if (multi || i === 0) v = -(yield* nega(S, depth - 1, -INF, multi ? INF : -alpha, 1, true));
        else {
          v = -(yield* nega(S, depth - 1, -alpha - 1, -alpha, 1, true));
          if (v > alpha && !S.stop) v = -(yield* nega(S, depth - 1, -INF, -alpha, 1, true));
        }
        pos.unmake();
        if (S.stop) break;
        sc[i] = v;
        if (v > iterScore) { iterScore = v; iterBest = m; }
        if (v > alpha) alpha = v;
      }
      if (iterBest) { best = iterBest; bestScore = iterScore; }
      if (S.stop) break;
      S.depthDone = depth;
      scores = root.map((m, i) => ({ m, s: sc[i] }));
      // Best move first next time; the rest by score.
      const order = root.map((m, i) => ({ m, s: m === best ? INF + 1 : sc[i] }));
      order.sort((a, b) => b.s - a.s);
      for (let i = 0; i < root.length; i++) root[i] = order[i].m;
      if (Math.abs(bestScore) > MATE - 256) break;
      if (now() - start > opts.time * 0.5) break;
    }
    if (multi && scores) {
      // Easy: pick the best-looking move after adding noise; sometimes a near-best one.
      let pickM = best;
      let pickS = -Infinity;
      for (const e of scores) {
        const s = e.s + (Math.random() * 2 - 1) * opts.noise;
        if (e.s > -INF && s > pickS) { pickS = s; pickM = e.m; }
      }
      return { move: pickM, score: bestScore, depth: S.depthDone };
    }
    return { move: best, score: bestScore, depth: S.depthDone };
  }
  /* ===== ENGINE END ===== */

  const LEVELS = {
    easy: { time: 150, depth: 2, noise: 85 },
    normal: { time: 600, depth: 6, noise: 0 },
    hard: { time: 1500, depth: 40, noise: 0 }
  };
  const PIECE_NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

  /* Squares a side can see in fog: its own squares plus everything its pieces attack or can move to. */
  function visibility(pos, color) {
    const v = new Uint8Array(128);
    const b = pos.b;
    for (let sq = 0; sq < 128; sq++) {
      if (sq & 0x88) { sq += 7; continue; }
      const p = b[sq];
      if (!p || (p & 8) !== color) continue;
      v[sq] = 1;
      const t = p & 7;
      if (t === PAWN) {
        const fwd = color === WHITE ? 16 : -16;
        const one = sq + fwd;
        if (one & 0x88) continue;
        v[one] = 1;
        if (!b[one] && (sq >> 4) === (color === WHITE ? 1 : 6)) v[one + fwd] = 1;
        if (!((one - 1) & 0x88)) v[one - 1] = 1;
        if (!((one + 1) & 0x88)) v[one + 1] = 1;
      } else if (t === KNIGHT || t === KING) {
        const offs = t === KNIGHT ? N_OFF : K_DIR;
        for (const o of offs) if (!((sq + o) & 0x88)) v[sq + o] = 1;
      } else {
        const dirs = t === BISHOP ? B_DIR : t === ROOK ? R_DIR : K_DIR;
        for (const d of dirs) {
          let s = sq + d;
          while (!(s & 0x88)) {
            v[s] = 1;
            if (b[s]) break;
            s += d;
          }
        }
      }
    }
    return v;
  }

  /* ---------- Piece art: vector shapes in a unit box, base at y = +0.37 ---------- */
  function pieceShape(ctx, t, fill, edge, accent) {
    const body = () => { ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke(); };
    const band = (x, y, w, h) => {
      U.roundRect(ctx, x, y, w, h, 0.03);
      ctx.fillStyle = accent; ctx.fill(); ctx.strokeStyle = edge; ctx.stroke();
    };
    // Base plinth shared by every piece.
    const bw = t === PAWN ? 0.25 : 0.29;
    ctx.beginPath();
    ctx.moveTo(-bw, 0.37);
    ctx.lineTo(bw, 0.37);
    ctx.quadraticCurveTo(bw, 0.27, bw - 0.07, 0.26);
    ctx.lineTo(-bw + 0.07, 0.26);
    ctx.quadraticCurveTo(-bw, 0.27, -bw, 0.37);
    ctx.closePath();
    body();
    ctx.beginPath();
    if (t === PAWN) {
      ctx.moveTo(-0.16, 0.27);
      ctx.quadraticCurveTo(-0.07, 0.14, -0.08, 0.0);
      ctx.lineTo(0.08, 0.0);
      ctx.quadraticCurveTo(0.07, 0.14, 0.16, 0.27);
      ctx.closePath();
      body();
      band(-0.14, -0.05, 0.28, 0.07);
      ctx.beginPath();
      ctx.arc(0, -0.17, 0.13, 0, Math.PI * 2);
      body();
    } else if (t === ROOK) {
      ctx.moveTo(-0.18, 0.27);
      ctx.lineTo(-0.15, -0.12);
      ctx.lineTo(0.15, -0.12);
      ctx.lineTo(0.18, 0.27);
      ctx.closePath();
      body();
      ctx.beginPath();
      const pts = [[-0.24, -0.1], [-0.24, -0.36], [-0.13, -0.36], [-0.13, -0.27], [-0.055, -0.27], [-0.055, -0.36],
        [0.055, -0.36], [0.055, -0.27], [0.13, -0.27], [0.13, -0.36], [0.24, -0.36], [0.24, -0.1]];
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      body();
      band(-0.16, 0.07, 0.32, 0.07);
    } else if (t === KNIGHT) {
      ctx.moveTo(-0.2, 0.27);
      ctx.lineTo(0.24, 0.27);
      ctx.quadraticCurveTo(0.29, -0.05, 0.17, -0.22);
      ctx.lineTo(0.13, -0.41);
      ctx.lineTo(0.03, -0.3);
      ctx.quadraticCurveTo(-0.14, -0.28, -0.24, -0.1);
      ctx.lineTo(-0.29, 0.0);
      ctx.quadraticCurveTo(-0.3, 0.09, -0.19, 0.08);
      ctx.quadraticCurveTo(-0.1, 0.06, -0.03, 0.02);
      ctx.quadraticCurveTo(-0.16, 0.14, -0.2, 0.27);
      ctx.closePath();
      body();
      ctx.beginPath();
      ctx.moveTo(0.15, -0.2);
      ctx.quadraticCurveTo(0.24, -0.02, 0.2, 0.2);
      ctx.lineWidth *= 1.8;
      ctx.strokeStyle = accent;
      ctx.stroke();
      ctx.lineWidth /= 1.8;
      ctx.beginPath();
      ctx.arc(-0.1, -0.15, 0.03, 0, Math.PI * 2);
      ctx.fillStyle = edge;
      ctx.fill();
    } else if (t === BISHOP) {
      ctx.moveTo(-0.15, 0.27);
      ctx.quadraticCurveTo(-0.06, 0.15, -0.08, 0.05);
      ctx.lineTo(0.08, 0.05);
      ctx.quadraticCurveTo(0.06, 0.15, 0.15, 0.27);
      ctx.closePath();
      body();
      band(-0.15, 0.0, 0.3, 0.07);
      ctx.beginPath();
      ctx.moveTo(0, -0.35);
      ctx.bezierCurveTo(0.21, -0.22, 0.2, -0.05, 0.12, 0.0);
      ctx.lineTo(-0.12, 0.0);
      ctx.bezierCurveTo(-0.2, -0.05, -0.21, -0.22, 0, -0.35);
      ctx.closePath();
      body();
      ctx.beginPath();
      ctx.moveTo(0.02, -0.21);
      ctx.lineTo(0.1, -0.09);
      ctx.strokeStyle = accent;
      ctx.lineWidth *= 1.6;
      ctx.stroke();
      ctx.lineWidth /= 1.6;
      ctx.beginPath();
      ctx.arc(0, -0.39, 0.05, 0, Math.PI * 2);
      body();
    } else if (t === QUEEN) {
      ctx.moveTo(-0.2, 0.27);
      ctx.quadraticCurveTo(-0.1, 0.15, -0.14, 0.02);
      ctx.lineTo(0.14, 0.02);
      ctx.quadraticCurveTo(0.1, 0.15, 0.2, 0.27);
      ctx.closePath();
      body();
      ctx.beginPath();
      const crown = [[-0.15, 0.02], [-0.27, -0.22], [-0.19, -0.1], [-0.13, -0.3], [-0.065, -0.13], [0, -0.34],
        [0.065, -0.13], [0.13, -0.3], [0.19, -0.1], [0.27, -0.22], [0.15, 0.02]];
      crown.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      body();
      [[-0.27, -0.22], [-0.13, -0.3], [0, -0.34], [0.13, -0.3], [0.27, -0.22]].forEach((p) => {
        ctx.beginPath();
        ctx.arc(p[0], p[1] - 0.02, 0.04, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.fill();
        ctx.strokeStyle = edge;
        ctx.stroke();
      });
      band(-0.17, -0.02, 0.34, 0.07);
    } else if (t === KING) {
      ctx.moveTo(-0.19, 0.27);
      ctx.quadraticCurveTo(-0.1, 0.12, -0.21, -0.12);
      ctx.quadraticCurveTo(0, -0.25, 0.21, -0.12);
      ctx.quadraticCurveTo(0.1, 0.12, 0.19, 0.27);
      ctx.closePath();
      body();
      band(-0.16, 0.0, 0.32, 0.07);
      U.roundRect(ctx, -0.04, -0.45, 0.08, 0.27, 0.015);
      body();
      U.roundRect(ctx, -0.11, -0.37, 0.22, 0.07, 0.015);
      body();
    }
  }

  function drawPiece(ctx, p, x, y, size, alpha) {
    const white = (p & 8) === 0;
    ctx.save();
    if (alpha != null) ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(size, size);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(0.03, 0.38, 0.3, 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 0.038;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    pieceShape(ctx, p & 7, white ? '#F6F1FF' : '#241E46', white ? '#17132F' : '#9BE6FA', white ? C.p1 : C.p2);
    ctx.restore();
  }

  Arcade.register({
    id: 'chess',
    title: 'Chess',
    category: 'board',
    mode: 'together',
    players: '1–2P',
    best: false,
    color: C.violet,
    tagline: 'The classic battle of kings, against the computer or a friend.',
    hook: 'Fog mode for two players: you only see the squares your pieces can reach.',
    tags: ['board', 'strategy', 'classic', 'chess', 'fog', 'hotseat', 'ai', 'turn-based'],
    howTo: 'Checkmate the enemy king: attack it so it has no safe move. All the usual rules apply: castling, ' +
      'en passant, promotion (pick the new piece), stalemate, the 50-move rule, threefold repetition and ' +
      'insufficient material. Play the computer at three levels or a friend on this screen. ' +
      'The twist is fog mode for two players: you see only your own pieces and the squares they can attack or ' +
      'move to. There is no check in the fog, so you may move into danger, and capturing the enemy king wins. ' +
      'Pass the device when the cover asks, so your opponent cannot peek.',
    controls: [
      { keys: ['Click', 'Drag'], label: 'Pick a piece and move it' },
      { keys: ['←', '↑', '→', '↓'], label: 'Move the cursor' },
      { keys: ['Enter', 'Space'], label: 'Select / move' },
      { keys: ['Q', 'R', 'B', 'N'], label: 'Choose a promotion piece' },
      { keys: ['F'], label: 'Flip the board' }
    ],

    drawThumb(ctx, w, h, t) {
      ctx.fillStyle = C.ink;
      ctx.fillRect(0, 0, w, h);
      const s = 40;
      const ox = (w - s * 8) / 2;
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 8; f++) {
          ctx.fillStyle = (r + f) % 2 ? '#2C275E' : '#4A4290';
          ctx.fillRect(ox + f * s, r * s, s, s);
        }
      }
      drawPiece(ctx, KING, ox + 1.5 * s, 4.5 * s, s * 0.95);
      drawPiece(ctx, KNIGHT, ox + 3.5 * s, 3.5 * s, s * 0.95);
      drawPiece(ctx, ROOK, ox + 0.5 * s, 4.5 * s, s * 0.95);
      drawPiece(ctx, BLACK | QUEEN, ox + 2.5 * s, 1.5 * s, s * 0.95);
      drawPiece(ctx, BLACK | PAWN, ox + 4.5 * s, 2.5 * s, s * 0.95);
      // Fog rolls over the far side of the board.
      for (let r = 0; r < 5; r++) {
        for (let f = 0; f < 8; f++) {
          const seen = (f <= 4 && r >= 1) || (f <= 5 && r >= 3) || f + r >= 9;
          if (seen) continue;
          ctx.fillStyle = 'rgba(15,13,36,0.86)';
          ctx.fillRect(ox + f * s, r * s, s, s);
          for (let k = 0; k < 2; k++) {
            const a = t * 0.6 + f * 1.7 + r * 2.3 + k * 2;
            ctx.fillStyle = U.alpha(C.muted, 0.1);
            ctx.beginPath();
            ctx.arc(ox + f * s + s / 2 + Math.cos(a) * 9, r * s + s / 2 + Math.sin(a * 0.8) * 7, 13 + k * 4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.fillStyle = U.alpha(C.violet, 0.9);
      ctx.font = '800 26px Unbounded, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText('?', w - 26, 14);
      ctx.fillText('?', w - 78, 60);
      ctx.textAlign = 'left';
    },

    create(stage, api) {
      const { canvas, ctx } = api.canvas(W, H);

      let mode = 'cpu';          // 'cpu' | 'duo' | 'fog'
      let colorPick = 'white';   // 'white' | 'black' | 'random'
      let human = WHITE;
      let level = 'normal';
      let autoFlip = true;
      let manualFlip = false;
      let pos = null;
      let legal = [];
      let sans = [];
      let caps = { 0: [], 8: [] };
      let lastMove = 0;
      let lastCapSq = -1;
      let lastCapPiece = 0;
      let result = null;
      let phase = 'menu';        // 'menu' | 'cover' | 'play' | 'think' | 'anim' | 'over'
      let viewer = WHITE;
      let sel = -1;
      let drag = null;
      let cursor = 12;
      let kb = false;
      let promo = null;
      let anim = null;
      let particles = [];
      let flash = null;
      let token = 0;
      let tally = { a: 0, b: 0 };
      let clock = 0;
      let fogHinted = false;
      let pointer = { x: -1, y: -1 };

      const flipped = () => (viewer === BLACK) !== manualFlip;
      const nameOf = (c) => (mode === 'cpu' ? (c === human ? 'You' : 'Computer') : c === WHITE ? 'White' : 'Black');
      const colorName = (c) => (c === WHITE ? 'White' : 'Black');
      const accentOf = (c) => (c === WHITE ? C.p1 : C.p2);

      function sqXY(sq) {
        const f = sq & 7;
        const r = sq >> 4;
        const fx = flipped() ? 7 - f : f;
        const fy = flipped() ? r : 7 - r;
        return { x: BX + fx * SQ, y: BY + fy * SQ };
      }
      function squareAt(x, y) {
        const fx = Math.floor((x - BX) / SQ);
        const fy = Math.floor((y - BY) / SQ);
        if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return -1;
        const f = flipped() ? 7 - fx : fx;
        const r = flipped() ? fy : 7 - fy;
        return r * 16 + f;
      }
      const movesFrom = (sq) => legal.filter((m) => mFrom(m) === sq);
      const isTarget = (from, to) => legal.some((m) => mFrom(m) === from && mTo(m) === to);

      function fmt(n) {
        const whole = Math.floor(n);
        const half = n - whole >= 0.5;
        return (whole || !half ? String(whole) : '') + (half ? '½' : '');
      }
      function showTally() {
        if (mode === 'cpu') api.setScore('You ' + fmt(tally.a) + ' – ' + fmt(tally.b) + ' CPU');
        else api.setScore('White ' + fmt(tally.a) + ' – ' + fmt(tally.b) + ' Black');
      }

      /* ---------- Menus ---------- */
      function showStartMenu() {
        token++;
        phase = 'menu';
        anim = null;
        promo = null;
        api.setStatus('Chess: play the computer, a friend, or the two-player fog mode.');
        api.menu({
          title: 'Chess',
          text: 'Play the computer or a friend on this screen. In fog mode you only see what your pieces can reach.',
          buttons: [
            { label: 'vs computer', primary: true, onClick: showColorMenu },
            { label: '2 players', onClick: showFlipMenu },
            { label: 'Fog mode (2 players)', onClick: () => startMatch('fog') }
          ]
        });
      }
      function showColorMenu() {
        api.menu({
          title: 'Pick your side',
          text: 'White moves first.',
          buttons: [
            { label: 'White', primary: true, onClick: () => { colorPick = 'white'; showLevelMenu(); } },
            { label: 'Black', onClick: () => { colorPick = 'black'; showLevelMenu(); } },
            { label: 'Random', onClick: () => { colorPick = 'random'; showLevelMenu(); } }
          ]
        });
      }
      function showLevelMenu() {
        api.menu({
          title: 'Pick a difficulty',
          text: 'Easy makes mistakes. Normal thinks for about half a second, Hard for about a second and a half.',
          buttons: [
            { label: 'Easy', onClick: () => { level = 'easy'; startMatch('cpu'); } },
            { label: 'Normal', primary: true, onClick: () => { level = 'normal'; startMatch('cpu'); } },
            { label: 'Hard', onClick: () => { level = 'hard'; startMatch('cpu'); } }
          ]
        });
      }
      function showFlipMenu() {
        api.menu({
          title: '2 players',
          text: 'Share this screen. The board can turn to face whoever is moving. Press F any time to flip it.',
          buttons: [
            { label: 'Flip each turn', primary: true, onClick: () => { autoFlip = true; startMatch('duo'); } },
            { label: 'Keep White at the bottom', onClick: () => { autoFlip = false; startMatch('duo'); } }
          ]
        });
      }

      function startMatch(m) {
        if (m !== mode) tally = { a: 0, b: 0 };
        mode = m;
        manualFlip = false;
        showTally();
        newGame();
      }

      function newGame() {
        token++;
        pos = new Pos();
        pos.load(START_FEN);
        pos.fog = mode === 'fog';
        if (mode === 'cpu') human = colorPick === 'random' ? (Math.random() < 0.5 ? WHITE : BLACK) : colorPick === 'black' ? BLACK : WHITE;
        sans = [];
        caps = { 0: [], 8: [] };
        lastMove = 0;
        lastCapSq = -1;
        lastCapPiece = 0;
        result = null;
        sel = -1;
        drag = null;
        promo = null;
        anim = null;
        particles = [];
        flash = null;
        legal = pos.legal();
        beginTurn();
      }

      function turnStatus() {
        const check = !pos.fog && pos.inCheck();
        if (mode === 'cpu') return (check ? 'Check! ' : '') + 'Your move (' + colorName(human).toLowerCase() + ').';
        if (mode === 'duo') return (check ? 'Check! ' : '') + colorName(pos.side) + ' to move.';
        let s = colorName(pos.side) + ' to move.';
        if (lastCapSq >= 0 && lastCapPiece) {
          s += ' Your ' + PIECE_NAME[lastCapPiece & 7] + ' on ' + sqName(lastCapSq) + ' was taken from the fog.';
        }
        if (!fogHinted) {
          fogHinted = true;
          s = 'Fog: you only see squares your pieces can reach. No check here: capture the king to win. ' + s;
        }
        return s;
      }

      function beginTurn() {
        sel = -1;
        drag = null;
        if (mode === 'cpu') viewer = human;
        else if (mode === 'fog') viewer = pos.side;
        else viewer = autoFlip ? pos.side : WHITE;
        const k = pos.kings[pos.side >> 3];
        if (k >= 0 && pos.b[k] === (pos.side | KING)) cursor = k;
        if (mode === 'fog') {
          phase = 'cover';
          const first = !sans.length;
          api.setStatus('Pass the device to ' + colorName(pos.side) + '.');
          api.menu({
            title: 'Pass to ' + colorName(pos.side),
            text: first ? 'White moves first. Hand over the device, then press Ready.'
              : colorName(pos.side ^ 8) + ' has moved. Hand over the device, then press Ready.',
            buttons: [{ label: 'Ready', primary: true, onClick: () => { phase = 'play'; api.setStatus(turnStatus()); } }]
          });
          return;
        }
        if (mode === 'cpu' && pos.side !== human) {
          startThink();
          return;
        }
        phase = 'play';
        api.setStatus(turnStatus());
      }

      /* ---------- Computer ---------- */
      function startThink() {
        phase = 'think';
        api.setStatus('Computer is thinking…');
        const my = token;
        const cfg = LEVELS[level];
        const started = now();
        let gen = null;
        const finish = (m) => {
          if (!m || legal.indexOf(m) < 0) m = U.pick(legal);
          const wait = Math.max(0, 380 - (now() - started));
          api.after(wait, () => {
            if (my === token && phase === 'think') commit(m, null);
          });
        };
        const step = () => {
          if (my !== token || phase !== 'think') return;
          let r;
          try {
            if (!gen) gen = think(pos, cfg);
            r = gen.next();
          } catch (err) {
            finish(0);
            return;
          }
          if (!r.done) { api.after(0, step); return; }
          finish(r.value ? r.value.move : 0);
        };
        api.after(30, step);
      }

      /* ---------- Moves ---------- */
      const canAct = () => phase === 'play' && !anim && !promo && !api.menuOpen && (mode !== 'cpu' || pos.side === human);

      function tryMove(from, to, dropXY) {
        const opts = legal.filter((m) => mFrom(m) === from && mTo(m) === to);
        if (!opts.length) return false;
        if (opts.length > 1) {
          promo = { from, to, idx: 0, opts, drop: dropXY || null };
          sel = from;
          api.sfx('blip');
          api.setStatus('Promote: pick a queen, rook, bishop or knight (Q, R, B, N).');
          return true;
        }
        commit(opts[0], dropXY);
        return true;
      }

      function commit(m, dropXY) {
        const from = mFrom(m);
        const to = mTo(m);
        const flag = mFlag(m);
        const mover = pos.side;
        const piece = pos.b[from];
        const capSq = (flag & F_EP) ? (mover === WHITE ? to - 16 : to + 16) : to;
        const captured = pos.b[capSq];
        const san = sanOf(pos, m, legal);
        const a = sqXY(from);
        const movers = [{ p: piece, to, sx: dropXY ? dropXY.x : a.x + SQ / 2, sy: dropXY ? dropXY.y : a.y + SQ / 2, promo: mPromo(m) ? (mover | mPromo(m)) : 0 }];
        if (flag & F_CASTLE) {
          const rf = to > from ? from + 3 : from - 4;
          const rt = to > from ? from + 1 : from - 1;
          const rxy = sqXY(rf);
          movers.push({ p: mover | ROOK, to: rt, sx: rxy.x + SQ / 2, sy: rxy.y + SQ / 2, promo: 0 });
        }
        pos.make(m);
        sans.push(san);
        lastMove = m;
        lastCapSq = captured ? capSq : -1;
        lastCapPiece = captured;
        if (captured) caps[mover].push(captured);
        sel = -1;
        drag = null;
        promo = null;
        const dx = (to & 7) - (from & 7);
        const dy = (to >> 4) - (from >> 4);
        const dist = Math.sqrt(dx * dx + dy * dy);
        anim = { movers, cap: captured ? { p: captured, sq: capSq } : null, t: 0, dur: dropXY ? 0.08 : 0.16 + dist * 0.035, mover, captured };
        phase = 'anim';
        api.sfx(captured ? 'hit' : (flag & F_CASTLE) ? 'flip' : 'tick');
      }

      function afterMove() {
        const { mover, captured } = anim;
        if (anim.cap) burst(anim.cap.sq, (anim.cap.p & 8) ? C.p2 : C.p1);
        anim = null;
        if (pos.fog && captured && (captured & 7) === KING) {
          endGame({ winner: mover, reason: 'king' });
          return;
        }
        legal = pos.legal();
        const out = outcome(pos, legal);
        if (out) { endGame(out); return; }
        if (!pos.fog && pos.inCheck()) {
          flash = { text: 'Check', t: 0, color: C.p1 };
          api.sfx('power');
        }
        beginTurn();
      }

      function endGame(out) {
        result = out;
        phase = 'over';
        sel = -1;
        promo = null;
        const my = ++token;
        let title;
        let text;
        const w = out.winner;
        if (w >= 0) {
          if (mode === 'cpu') { if (w === human) tally.a += 1; else tally.b += 1; } else if (w === WHITE) tally.a += 1; else tally.b += 1;
        } else {
          tally.a += 0.5;
          tally.b += 0.5;
        }
        showTally();
        const winnerName = w >= 0 ? (mode === 'cpu' ? (w === human ? 'You win' : 'The computer wins') : colorName(w) + ' wins') : '';
        if (out.reason === 'mate') { title = 'Checkmate'; text = winnerName + ' by checkmate.'; }
        else if (out.reason === 'king') { title = 'King captured'; text = winnerName + ': the ' + colorName(w ^ 8).toLowerCase() + ' king fell in the fog.'; }
        else if (out.reason === 'stalemate') { title = 'Stalemate'; text = 'No legal moves and no check, so it is a draw.'; }
        else if (out.reason === 'fifty') { title = 'Draw'; text = 'Fifty moves each without a capture or a pawn move.'; }
        else if (out.reason === 'repetition') { title = 'Draw by repetition'; text = 'The same position came up three times.'; }
        else { title = 'Draw'; text = 'Neither side has enough material left to checkmate.'; }
        if (w >= 0) api.sfx(mode === 'cpu' && w !== human ? 'lose' : 'win');
        else api.sfx('flip');
        flash = { text: title, t: 0, color: w < 0 ? C.gold : accentOf(w), stay: true };
        api.setStatus(title + '. ' + text);
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

      function burst(sq, color) {
        const p = sqXY(sq);
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          const v = 60 + Math.random() * 160;
          particles.push({ x: p.x + SQ / 2, y: p.y + SQ / 2, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.3, color });
        }
      }

      /* Select / move on a square (shared by click and keyboard). */
      function activate(sq) {
        if (sq < 0) { sel = -1; return; }
        if (sel >= 0 && sq !== sel && isTarget(sel, sq)) { tryMove(sel, sq, null); return; }
        const p = pos.b[sq];
        if (p && (p & 8) === pos.side && movesFrom(sq).length) {
          if (sel === sq) { sel = -1; return; }
          sel = sq;
          api.sfx('blip');
          return;
        }
        if (p && (p & 8) === pos.side) {
          sel = -1;
          api.setStatus('That ' + PIECE_NAME[p & 7] + ' has no legal moves.');
          return;
        }
        sel = -1;
      }

      function promoRect(i) {
        const a = sqXY(promo.to);
        const dir = a.y < BY + 4 * SQ ? 1 : -1;
        return { x: a.x, y: a.y + dir * i * SQ };
      }
      const PROMO_TYPES = [QUEEN, ROOK, BISHOP, KNIGHT];
      function choosePromo(i) {
        const want = PROMO_TYPES[i];
        const m = promo.opts.find((o) => mPromo(o) === want);
        const drop = promo.drop;
        promo = null;
        if (m) commit(m, drop);
      }
      function cancelPromo() {
        promo = null;
        sel = -1;
        api.setStatus(turnStatus());
      }

      /* ---------- Input ---------- */
      api.on(canvas, 'contextmenu', (e) => { if (e.preventDefault) e.preventDefault(); });

      api.on(canvas, 'pointerdown', (e) => {
        if (e.button != null && e.button !== 0) return;
        const p = api.toCanvas(e, canvas);
        pointer = p;
        if (!pos || api.menuOpen) return;
        if (promo) {
          for (let i = 0; i < 4; i++) {
            const r = promoRect(i);
            if (p.x >= r.x && p.x < r.x + SQ && p.y >= r.y && p.y < r.y + SQ) { choosePromo(i); return; }
          }
          cancelPromo();
          return;
        }
        if (!canAct()) return;
        kb = false;
        const sq = squareAt(p.x, p.y);
        if (sq < 0) { sel = -1; return; }
        cursor = sq;
        if (sel >= 0 && sq !== sel && isTarget(sel, sq)) { tryMove(sel, sq, null); return; }
        const pc = pos.b[sq];
        if (pc && (pc & 8) === pos.side && movesFrom(sq).length) {
          const was = sel === sq;
          sel = sq;
          drag = { sq, x: p.x, y: p.y, sx: p.x, sy: p.y, moved: false, was };
          if (!was) api.sfx('blip');
          try { if (canvas.setPointerCapture && e.pointerId != null) canvas.setPointerCapture(e.pointerId); } catch (err) { /* optional */ }
        } else activate(sq);
      });

      api.on(window, 'pointermove', (e) => {
        if (!pos) return;
        const p = api.toCanvas(e, canvas);
        pointer = p;
        if (drag) {
          drag.x = p.x;
          drag.y = p.y;
          if (Math.abs(p.x - drag.sx) + Math.abs(p.y - drag.sy) > 8) drag.moved = true;
        }
      });

      api.on(window, 'pointerup', (e) => {
        if (!drag || !pos) return;
        const p = api.toCanvas(e, canvas);
        const d = drag;
        drag = null;
        if (!canAct()) return;
        if (d.moved) {
          const sq = squareAt(p.x, p.y);
          if (sq >= 0 && sq !== d.sq && isTarget(d.sq, sq)) tryMove(d.sq, sq, { x: p.x, y: p.y });
        } else if (d.was) sel = -1;
      });
      api.on(window, 'pointercancel', () => { drag = null; });

      api.on(window, 'keydown', (e) => {
        if (api.menuOpen || !pos) return;
        const code = e.code;
        if (promo) {
          if (code === 'ArrowUp' || code === 'ArrowLeft') promo.idx = (promo.idx + 3) % 4;
          else if (code === 'ArrowDown' || code === 'ArrowRight') promo.idx = (promo.idx + 1) % 4;
          else if (code === 'Enter' || code === 'Space') choosePromo(promo.idx);
          else if (code === 'KeyQ') choosePromo(0);
          else if (code === 'KeyR') choosePromo(1);
          else if (code === 'KeyB') choosePromo(2);
          else if (code === 'KeyN') choosePromo(3);
          else if (code === 'Backspace') cancelPromo();
          return;
        }
        if (code === 'KeyF' && mode !== 'fog' && phase !== 'menu') {
          manualFlip = !manualFlip;
          api.sfx('flip');
          return;
        }
        if (!canAct()) return;
        const fl = flipped() ? -1 : 1;
        let f = cursor & 7;
        let r = cursor >> 4;
        if (code === 'ArrowUp') r += fl;
        else if (code === 'ArrowDown') r -= fl;
        else if (code === 'ArrowLeft') f -= fl;
        else if (code === 'ArrowRight') f += fl;
        else if (code === 'Enter' || code === 'Space') { kb = true; activate(cursor); return; }
        else if (code === 'Backspace') { sel = -1; return; }
        else return;
        kb = true;
        cursor = U.clamp(r, 0, 7) * 16 + U.clamp(f, 0, 7);
        api.sfx('tick');
      });

      /* ---------- Update + draw ---------- */
      function update(dt) {
        clock += dt;
        if (anim) {
          anim.t += dt;
          if (anim.t >= anim.dur) afterMove();
        }
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

      function drawFogSquare(x, y, seed) {
        ctx.fillStyle = 'rgba(12,10,30,0.9)';
        ctx.fillRect(x, y, SQ, SQ);
        for (let k = 0; k < 3; k++) {
          const a = clock * 0.45 + seed * 1.37 + k * 2.1;
          ctx.fillStyle = U.alpha(C.muted, 0.07);
          ctx.beginPath();
          ctx.arc(x + SQ / 2 + Math.cos(a) * 14, y + SQ / 2 + Math.sin(a * 0.8) * 12, 20 + k * 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      function drawBoard() {
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, BX - 10, BY - 10, SQ * 8 + 20, SQ * 8 + 20, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let r = 0; r < 8; r++) {
          for (let f = 0; f < 8; f++) {
            const sq = r * 16 + f;
            const a = sqXY(sq);
            ctx.fillStyle = (r + f) % 2 ? '#4A4290' : '#2C275E';
            ctx.fillRect(a.x, a.y, SQ, SQ);
          }
        }
        ctx.font = FONT_SM;
        for (let i = 0; i < 8; i++) {
          const fileSq = sqXY(i);
          ctx.fillStyle = U.alpha(C.text, 0.45);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText(FILES[i], fileSq.x + SQ - 4, BY + 8 * SQ - 15);
          const rankSq = sqXY(i * 16);
          ctx.textAlign = 'left';
          ctx.fillText(String(i + 1), BX + 4, rankSq.y + 4);
        }
      }

      function highlight(sq, color) {
        const a = sqXY(sq);
        ctx.fillStyle = color;
        ctx.fillRect(a.x, a.y, SQ, SQ);
      }

      function draw() {
        ctx.fillStyle = C.ink;
        ctx.fillRect(0, 0, W, H);
        drawBoard();
        if (!pos) { drawPanel(); return; }
        const fogOn = pos.fog && phase !== 'over';
        const covered = fogOn && (phase === 'cover' || phase === 'menu');
        const vis = fogOn && !covered ? visibility(pos, viewer) : null;
        const seen = (sq) => !fogOn || (!covered && vis[sq]);

        // Last move (in fog only what the viewer can see).
        if (lastMove && phase !== 'anim' && !covered) {
          const lf = mFrom(lastMove);
          const lt = mTo(lastMove);
          const own = (pos.b[lt] & 8) === viewer;
          if (!fogOn || own) {
            highlight(lf, U.alpha(C.gold, 0.22));
            highlight(lt, U.alpha(C.gold, 0.3));
          } else if (!covered && seen(lt)) highlight(lt, U.alpha(C.gold, 0.3));
        }
        if (fogOn && !covered && lastCapSq >= 0 && pos.side === viewer && phase !== 'anim') {
          const a = sqXY(lastCapSq);
          ctx.strokeStyle = U.alpha(C.p1, 0.8);
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(a.x + 18, a.y + 18); ctx.lineTo(a.x + SQ - 18, a.y + SQ - 18);
          ctx.moveTo(a.x + SQ - 18, a.y + 18); ctx.lineTo(a.x + 18, a.y + SQ - 18);
          ctx.stroke();
        }
        // Check glow on the king.
        if (!pos.fog && phase !== 'anim' && pos.inCheck()) {
          const k = sqXY(pos.kings[pos.side >> 3]);
          const pulse = 0.45 + 0.25 * Math.sin(clock * 8);
          ctx.fillStyle = U.alpha(C.p1, pulse);
          ctx.beginPath();
          ctx.arc(k.x + SQ / 2, k.y + SQ / 2, SQ * 0.48, 0, Math.PI * 2);
          ctx.fill();
        }
        if (sel >= 0) highlight(sel, U.alpha(C.violet, 0.55));
        if (drag && drag.moved) {
          const hs = squareAt(drag.x, drag.y);
          if (hs >= 0 && isTarget(drag.sq, hs)) {
            const a = sqXY(hs);
            ctx.strokeStyle = U.alpha(C.mint, 0.9);
            ctx.lineWidth = 3;
            ctx.strokeRect(a.x + 2, a.y + 2, SQ - 4, SQ - 4);
          }
        }

        // Pieces.
        const hidden = new Set();
        if (anim) anim.movers.forEach((m) => hidden.add(m.to));
        if (drag && drag.moved) hidden.add(drag.sq);
        if (promo) hidden.add(promo.from);
        for (let sq = 0; sq < 128; sq++) {
          if (sq & 0x88) { sq += 7; continue; }
          const p = pos.b[sq];
          if (!p || hidden.has(sq) || covered) continue;
          if (fogOn && (p & 8) !== viewer && !vis[sq]) continue;
          const a = sqXY(sq);
          drawPiece(ctx, p, a.x + SQ / 2, a.y + SQ / 2, SQ * 0.9);
        }
        // Captured piece fading out under the attacker.
        if (anim && anim.cap) {
          const a = sqXY(anim.cap.sq);
          const k = U.clamp(anim.t / anim.dur, 0, 1);
          drawPiece(ctx, anim.cap.p, a.x + SQ / 2, a.y + SQ / 2, SQ * 0.9 * (1 - k * 0.3), 1 - k);
        }

        // Legal move markers.
        if (sel >= 0 && (phase === 'play') && !promo) {
          for (const m of movesFrom(sel)) {
            const t = mTo(m);
            const a = sqXY(t);
            const enemy = pos.b[t] && (!fogOn || vis[t]);
            ctx.fillStyle = U.alpha(C.text, 0.32);
            ctx.strokeStyle = U.alpha(C.text, 0.38);
            if (enemy || (mFlag(m) & F_EP)) {
              ctx.lineWidth = 5;
              ctx.beginPath();
              ctx.arc(a.x + SQ / 2, a.y + SQ / 2, SQ * 0.42, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.arc(a.x + SQ / 2, a.y + SQ / 2, SQ * 0.14, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }

        // Fog.
        if (fogOn) {
          for (let sq = 0; sq < 128; sq++) {
            if (sq & 0x88) { sq += 7; continue; }
            if (!covered && vis[sq]) continue;
            const a = sqXY(sq);
            drawFogSquare(a.x, a.y, sq);
          }
        }

        // Sliding pieces.
        if (anim) {
          const k = U.clamp(anim.t / anim.dur, 0, 1);
          const e = 1 - Math.pow(1 - k, 3);
          for (const m of anim.movers) {
            const a = sqXY(m.to);
            const x = U.lerp(m.sx, a.x + SQ / 2, e);
            const y = U.lerp(m.sy, a.y + SQ / 2, e) - Math.sin(k * Math.PI) * 8;
            drawPiece(ctx, m.promo && k > 0.7 ? m.promo : m.p, x, y, SQ * 0.9 * (1 + Math.sin(k * Math.PI) * 0.08));
          }
        }
        if (drag && drag.moved && pos.b[drag.sq]) drawPiece(ctx, pos.b[drag.sq], drag.x, drag.y, SQ * 1.0);

        if (kb && phase === 'play' && !covered) {
          const a = sqXY(cursor);
          ctx.strokeStyle = C.mint;
          ctx.lineWidth = 3;
          ctx.setLineDash([8, 6]);
          ctx.lineDashOffset = -clock * 20;
          ctx.strokeRect(a.x + 3, a.y + 3, SQ - 6, SQ - 6);
          ctx.setLineDash([]);
        }

        if (promo) drawPromo();

        for (const p of particles) {
          ctx.globalAlpha = U.clamp(p.life * 2, 0, 1);
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
        }
        ctx.globalAlpha = 1;

        if (flash) {
          const k = flash.stay ? Math.min(1, flash.t * 4) : Math.max(0, 1 - Math.max(0, flash.t - 0.6) * 2);
          ctx.globalAlpha = k;
          ctx.fillStyle = U.alpha(C.ink, 0.6);
          U.roundRect(ctx, BX + 80, BY + 4 * SQ - 46, SQ * 8 - 160, 92, 18);
          ctx.fill();
          ctx.font = BIG;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = flash.color;
          ctx.fillText(flash.text, BX + 4 * SQ, BY + 4 * SQ + 2, SQ * 8 - 190);
          ctx.globalAlpha = 1;
        }
        drawPanel();
      }

      function drawPromo() {
        const color = pos.side;
        const r0 = promoRect(0);
        const r3 = promoRect(3);
        const top = Math.min(r0.y, r3.y);
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(BX, BY, SQ * 8, SQ * 8);
        ctx.fillStyle = C.panel2;
        U.roundRect(ctx, r0.x - 4, top - 4, SQ + 8, SQ * 4 + 8, 12);
        ctx.fill();
        ctx.strokeStyle = C.violet;
        ctx.lineWidth = 2;
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          const r = promoRect(i);
          const hot = i === promo.idx || (pointer.x >= r.x && pointer.x < r.x + SQ && pointer.y >= r.y && pointer.y < r.y + SQ);
          if (hot) {
            ctx.fillStyle = U.alpha(C.violet, 0.45);
            U.roundRect(ctx, r.x + 3, r.y + 3, SQ - 6, SQ - 6, 10);
            ctx.fill();
          }
          drawPiece(ctx, color | PROMO_TYPES[i], r.x + SQ / 2, r.y + SQ / 2, SQ * 0.85);
          ctx.font = FONT_SM;
          ctx.fillStyle = U.alpha(C.text, 0.6);
          ctx.textAlign = 'right';
          ctx.textBaseline = 'top';
          ctx.fillText('QRBN'[i], r.x + SQ - 6, r.y + 4);
        }
      }

      function drawPlayer(color, x, y, w) {
        const active = pos && (phase === 'play' || phase === 'think' || phase === 'anim' || phase === 'cover') &&
          (phase === 'anim' ? anim && anim.mover === color : pos.side === color);
        ctx.fillStyle = active ? U.alpha(accentOf(color), 0.16) : C.panel2;
        U.roundRect(ctx, x, y, w, 84, 10);
        ctx.fill();
        ctx.strokeStyle = active ? accentOf(color) : C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        drawPiece(ctx, color | KING, x + 26, y + 30, 40);
        ctx.font = FONT;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = C.text;
        ctx.fillText(nameOf(color), x + 52, y + 26);
        ctx.font = FONT_SM;
        ctx.fillStyle = active ? accentOf(color) : C.muted;
        let sub = colorName(color);
        if (active) sub += phase === 'think' ? ' · thinking' : ' · to move';
        ctx.fillText(sub, x + 52, y + 44);
        if (!pos) return;
        const list = caps[color].slice().sort((a, b) => VALUE[b & 7] - VALUE[a & 7]);
        let mat = 0;
        caps[color].forEach((p) => { mat += VALUE[p & 7]; });
        caps[color ^ 8].forEach((p) => { mat -= VALUE[p & 7]; });
        let cx = x + 14;
        list.forEach((p) => {
          if ((p & 7) === KING) return;
          drawPiece(ctx, p, cx, y + 66, 20);
          cx += 13;
        });
        if (mat > 0) {
          ctx.fillStyle = C.gold;
          ctx.font = FONT_SM;
          ctx.textAlign = 'right';
          ctx.fillText('+' + Math.round(mat / 100), x + w - 10, y + 26);
          ctx.textAlign = 'left';
        }
      }

      function drawPanel() {
        const x = PX;
        const y = BY - 10;
        const w = PW;
        const h = SQ * 8 + 20;
        ctx.fillStyle = C.panel;
        U.roundRect(ctx, x, y, w, h, 14);
        ctx.fill();
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 2;
        ctx.stroke();
        const topColor = flipped() ? WHITE : BLACK;
        drawPlayer(topColor, x + 12, y + 12, w - 24);
        drawPlayer(topColor ^ 8, x + 12, y + h - 96, w - 24);
        // Move list.
        const lx = x + 16;
        const ly = y + 112;
        const lh = h - 224;
        ctx.font = FONT_SM;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillStyle = C.muted;
        ctx.fillText('Moves', lx, ly);
        ctx.textAlign = 'right';
        const tag = mode === 'fog' ? 'Fog mode' : mode === 'cpu' ? 'vs computer · ' + level : '2 players';
        ctx.fillStyle = mode === 'fog' ? C.violet : C.muted;
        ctx.fillText(tag, x + w - 16, ly);
        ctx.strokeStyle = C.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, ly + 20);
        ctx.lineTo(x + w - 16, ly + 20);
        ctx.stroke();
        const rowH = 21;
        const maxRows = Math.floor((lh - 30) / rowH);
        const rows = Math.ceil(sans.length / 2);
        const first = Math.max(0, rows - maxRows);
        const masked = mode === 'fog' && phase !== 'over';
        ctx.font = FONT;
        ctx.textAlign = 'left';
        for (let r = first; r < rows; r++) {
          const yy = ly + 28 + (r - first) * rowH;
          ctx.fillStyle = U.alpha(C.muted, 0.8);
          ctx.fillText((r + 1) + '.', lx, yy);
          for (let c = 0; c < 2; c++) {
            const i = r * 2 + c;
            if (i >= sans.length) continue;
            const moverColor = c === 0 ? WHITE : BLACK;
            const hide = masked && (moverColor !== viewer || phase === 'cover');
            ctx.fillStyle = i === sans.length - 1 ? C.gold : C.text;
            ctx.fillText(hide ? '···' : sans[i], lx + 46 + c * 104, yy);
          }
        }
        if (!sans.length) {
          ctx.fillStyle = U.alpha(C.muted, 0.7);
          ctx.font = FONT_SM;
          ctx.fillText(mode === 'fog' ? 'Your opponent’s moves stay hidden.' : 'No moves yet.', lx, ly + 30);
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
