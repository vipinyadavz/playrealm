/* PlayRealm Game Night: a 2–4 player tournament across a run of random versus games.
   PlayRealm picks the games, players tap the winner after each one, points stack up.
   State is kept in this browser (Arcade.store) so a night survives a reload. */
(function () {
  'use strict';

  const A = window.Arcade;
  const KEY = 'gamenight';
  const COLORS = ['#FF5D73', '#36C9F0', '#FFD23F', '#4BE3A0'];
  const $ = (sel) => document.querySelector(sel);

  /* A saved night from an older version or with damaged data is dropped, not trusted. */
  function validNight(n) {
    return !!n && typeof n === 'object' && Array.isArray(n.players) && n.players.length >= 2 &&
      n.players.every((p) => p && typeof p.name === 'string' && typeof p.pts === 'number' && typeof p.wins === 'number') &&
      Array.isArray(n.queue) && n.queue.length > 0 &&
      n.queue.every((r) => r && typeof r.id === 'string' && Array.isArray(r.who) && r.who.every((i) => n.players[i])) &&
      typeof n.idx === 'number' && n.idx >= 0 && Array.isArray(n.log);
  }
  let night = A.store.get(KEY, null);
  if (!validNight(night)) night = null;
  const save = () => A.store.set(KEY, night);

  const dialog = $('#gn-dialog');
  const body = $('#gn-body');
  const strip = $('#gn-strip');
  const startBtn = $('#night-start');
  const resumeBtn = $('#night-resume');
  if (!dialog || !body) return;

  /* ---------- Which games can a night use? ---------- */
  function range(def) {
    const m = /(\d+)\s*(?:[–-]\s*(\d+))?\s*P/.exec(def.players || '');
    if (!m) return [1, 1];
    return [Number(m[1]), Number(m[2] || m[1])];
  }
  /* 'all' = everyone plays together, 'pair' = two players face off, null = not usable */
  function slotFor(def, n) {
    const [lo, hi] = range(def);
    if (hi < 2) return null;
    if (lo <= n && n <= hi) return 'all';
    if (lo <= 2) return 'pair';
    return null;
  }

  function buildQueue(n, rounds) {
    const pool = A.util.shuffle(A.games.filter((g) => slotFor(g, n)));
    // Prefer variety: spread categories before repeating one.
    const seen = new Set();
    const first = [];
    const rest = [];
    pool.forEach((g) => {
      if (seen.has(g.category)) rest.push(g);
      else {
        seen.add(g.category);
        first.push(g);
      }
    });
    const picks = first.concat(rest).slice(0, rounds);
    const plays = new Array(n).fill(0);
    return picks.map((g) => {
      let who;
      if (slotFor(g, n) === 'all') who = plays.map((_, i) => i);
      else {
        // The two players who have sat out the most go next.
        who = plays.map((c, i) => ({ c, i, r: Math.random() }))
          .sort((a, b) => a.c - b.c || a.r - b.r)
          .slice(0, 2)
          .map((x) => x.i)
          .sort();
      }
      who.forEach((i) => { plays[i] += 1; });
      return { id: g.id, who };
    });
  }

  /* ---------- Small DOM helpers ---------- */
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }
  function button(label, cls, onClick) {
    const b = el('button', 'btn ' + (cls || ''), label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }
  function show(nodes) {
    body.innerHTML = '';
    nodes.forEach((n) => body.append(n));
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  }
  function close() {
    if (dialog.open) dialog.close();
  }
  const nameChip = (i) => {
    const c = el('span', 'gn-chip', night.players[i].name);
    c.style.background = night.players[i].color;
    return c;
  };
  function whoLine(round) {
    const p = el('p', 'gn-who');
    if (round.who.length === night.players.length && night.players.length > 2) {
      p.append('Everyone plays: ');
    }
    round.who.forEach((i, k) => {
      if (k) p.append(round.who.length === 2 ? ' vs ' : ' · ');
      p.append(nameChip(i));
    });
    return p;
  }

  /* ---------- Stakes: an optional add-on for two players ----------
     Another script can register a provider with GameNight.setStakes(). After each game the
     provider deals a card for the loser. Game night itself knows nothing about the cards:
     { available(), name, heading, help, note, options: [{ label, value }],
       card(level, loserName | null, winnerName | null) -> { eyebrow, title, text } } */
  let stakesProvider = null;
  const provider = () => (stakesProvider && stakesProvider.available() ? stakesProvider : null);
  const stakesOn = () => !!(night && night.stakes && provider());

  function showForfeit(round, winner, next) {
    const P = provider();
    const level = night.stakes;
    const loser = winner < 0 ? -1 : round.who.find((i) => i !== winner);
    const head = el('div', 'gn-head');
    const eyebrow = el('p', 'gn-eyebrow');
    const title = el('h2');
    head.append(eyebrow, title);
    const card = el('p', 'gn-forfeit');
    const deal = () => {
      const c = winner < 0 ? P.card(level, null, null) : P.card(level, night.players[loser].name, night.players[winner].name);
      eyebrow.textContent = c.eyebrow;
      title.textContent = c.title;
      card.textContent = c.text;
    };
    deal();
    const actions = el('div', 'gn-actions');
    actions.append(button('Done', 'btn--primary btn--lg', next), button('Draw another', '', deal), button('Skip', '', next));
    show([head, card, el('p', 'gn-stakes-note', P.note), actions]);
  }

  /* ---------- Screens ---------- */
  function openSetup(opts) {
    let count = 2;
    let rounds = 5;
    const P = provider();
    let stakes = P && opts && opts.stakes ? opts.stakes : '';
    const names = ['', '', '', ''];
    const head = el('div', 'gn-head');
    head.append(el('p', 'gn-eyebrow', stakes ? P.name : 'Game night'), el('h2', '', 'Who’s playing?'));

    const countRow = el('div', 'gn-seg');
    const roundRow = el('div', 'gn-seg');
    const stakeRow = el('div', 'gn-seg');
    const nameBox = el('div', 'gn-names');

    function renderNames() {
      nameBox.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const label = el('label', 'gn-name');
        const dot = el('span', 'gn-dot');
        dot.style.background = COLORS[i];
        const input = el('input');
        input.type = 'text';
        input.maxLength = 14;
        input.placeholder = 'Player ' + (i + 1);
        input.setAttribute('aria-label', 'Name of player ' + (i + 1));
        input.value = names[i];
        input.autocomplete = 'off';
        input.addEventListener('input', () => { names[i] = input.value; });
        label.append(dot, input);
        nameBox.append(label);
      }
    }
    function seg(row, options, get, set) {
      const paint = () => [...row.children].forEach((b, i) => {
        const on = get() === options[i].value;
        b.classList.toggle('btn--primary', on);
        b.setAttribute('aria-pressed', String(on));
      });
      row.innerHTML = '';
      options.forEach((o) => {
        row.append(button(o.label, '', () => {
          set(o.value);
          paint();
          renderNames();
        }));
      });
      paint();
    }
    seg(countRow, [{ label: '2 players', value: 2 }, { label: '3 players', value: 3 }, { label: '4 players', value: 4 }],
      () => count, (v) => { count = v; });
    seg(roundRow, [{ label: '3 games', value: 3 }, { label: '5 games', value: 5 }, { label: '7 games', value: 7 }],
      () => rounds, (v) => { rounds = v; });
    if (P) seg(stakeRow, P.options, () => stakes, (v) => { stakes = v; });
    renderNames();

    const rules = el('p', 'gn-note', 'A win is worth 3 points and a draw 1 point each. With 3 or 4 players, two-player games rotate who faces off, so everyone gets a turn.');
    const actions = el('div', 'gn-actions');
    actions.append(
      button('Start game night', 'btn--primary btn--lg', () => {
        const players = [];
        for (let i = 0; i < count; i++) {
          players.push({ name: (names[i] || '').trim() || 'Player ' + (i + 1), color: COLORS[i], pts: 0, wins: 0 });
        }
        const queue = buildQueue(count, rounds);
        if (!queue.length) {
          rules.textContent = 'No games fit that many players yet. Try fewer players.';
          return;
        }
        night = { players, queue, idx: 0, log: [], stakes: count === 2 ? stakes : '' };
        save();
        sync();
        showIntro();
      }),
      button('Cancel', '', close)
    );
    const nodes = [head, el('h3', '', 'Players'), countRow, nameBox, el('h3', '', 'Length'), roundRow];
    if (P) nodes.push(el('h3', '', P.heading), stakeRow, el('p', 'gn-stakes-note', P.help));
    show(nodes.concat([rules, actions]));
  }

  function standingsList() {
    const list = el('ol', 'gn-table');
    night.players
      .map((p, i) => Object.assign({ i }, p))
      .sort((a, b) => b.pts - a.pts || b.wins - a.wins)
      .forEach((p) => {
        const li = el('li');
        const chip = el('span', 'gn-chip', p.name);
        chip.style.background = p.color;
        li.append(chip, el('span', 'gn-pts', p.pts + ' pts'), el('span', 'gn-wins', p.wins + (p.wins === 1 ? ' win' : ' wins')));
        list.append(li);
      });
    return list;
  }

  function showIntro() {
    if (!night) return;
    const round = night.queue[night.idx];
    const def = A.get(round.id);
    if (!def) {
      night.idx += 1;
      save();
      return night.idx >= night.queue.length ? showFinal() : showIntro();
    }
    const head = el('div', 'gn-head');
    head.append(el('p', 'gn-eyebrow', 'Game ' + (night.idx + 1) + ' of ' + night.queue.length), el('h2', '', def.title));
    const nodes = [head, el('p', 'gn-tag', def.tagline), whoLine(round)];
    if (def.hook) {
      const tw = el('p', 'gn-twist');
      tw.append(el('b', '', 'Twist'), def.hook);
      nodes.push(tw);
    }
    nodes.push(el('p', 'gn-note', 'Play it, then press “Pick winner” in the bar above the game.'));
    if (night.idx > 0) nodes.push(standingsList());
    const actions = el('div', 'gn-actions');
    actions.append(
      button('Play ' + def.title, 'btn--primary btn--lg', () => {
        close();
        location.hash = '#/play/' + def.id;
        sync();
      }),
      button('Swap this game', '', () => {
        const used = new Set(night.queue.map((r) => r.id));
        const n = night.players.length;
        const alt = A.util.shuffle(A.games.filter((g) => !used.has(g.id) && slotFor(g, n) === slotFor(def, n)))[0];
        if (alt) {
          round.id = alt.id;
          save();
        }
        showIntro();
      })
    );
    nodes.push(actions);
    show(nodes);
  }

  function showPick() {
    if (!night) return;
    const round = night.queue[night.idx];
    if (!round) return;
    const def = A.get(round.id);
    const head = el('div', 'gn-head');
    head.append(el('p', 'gn-eyebrow', 'Game ' + (night.idx + 1) + ' of ' + night.queue.length), el('h2', '', 'Who won ' + (def ? def.title : 'this game') + '?'));
    const picks = el('div', 'gn-picks');
    round.who.forEach((i) => {
      const b = button(night.players[i].name, 'gn-pick', () => record(i));
      b.style.background = night.players[i].color;
      picks.append(b);
    });
    const actions = el('div', 'gn-actions');
    actions.append(button('It’s a draw', '', () => record(-1)), button('Back to the game', '', close));
    show([head, picks, actions]);
  }

  function record(winner) {
    const round = night.queue[night.idx];
    if (winner >= 0) {
      night.players[winner].pts += 3;
      night.players[winner].wins += 1;
    } else {
      round.who.forEach((i) => { night.players[i].pts += 1; });
    }
    night.log.push({ id: round.id, winner });
    night.idx += 1;
    save();
    sync(); // the strip above the game must stop offering "Pick winner" for a finished round
    A.sound.play(winner >= 0 ? 'score' : 'blip');
    const next = () => (night.idx >= night.queue.length ? showFinal() : showIntro());
    if (stakesOn() && round.who.length === 2) showForfeit(round, winner, next);
    else next();
  }

  function showFinal() {
    if (!night) return;
    const ranked = night.players.slice().sort((a, b) => b.pts - a.pts || b.wins - a.wins);
    const top = ranked.filter((p) => p.pts === ranked[0].pts && p.wins === ranked[0].wins);
    const head = el('div', 'gn-head gn-head--final');
    head.append(el('p', 'gn-eyebrow', 'Game night champion' + (top.length > 1 ? 's' : '')), el('h2', '', top.map((p) => p.name).join(' & ')));
    const nodes = [head, standingsList()];
    const actions = el('div', 'gn-actions');
    actions.append(
      button('New game night', 'btn--primary btn--lg', () => openSetup({ stakes })),
      button('Done', '', () => {
        close();
        location.hash = '#';
      })
    );
    nodes.push(actions);
    A.sound.play('win');
    if (window.Profile) Profile.toast('Game night over!', top.map((p) => p.name).join(' & ') + ' takes the crown.', 'crown');
    // The night ends here, however the dialog gets closed: nothing about it stays saved.
    const stakes = night.stakes;
    night = null;
    save();
    sync();
    show(nodes);
  }

  function endNight() {
    if (!window.confirm('End this game night? The scoreboard will be cleared.')) return;
    night = null;
    save();
    sync();
  }

  /* ---------- Strip in the play view + hub buttons ---------- */
  function sync() {
    const active = !!(night && night.idx < night.queue.length);
    if (resumeBtn) resumeBtn.hidden = !active;
    if (startBtn) startBtn.textContent = active ? 'Start a new night' : 'Set up game night';
    if (!strip) return;
    const m = /^#\/play\/([\w-]+)$/.exec(location.hash);
    const round = active ? night.queue[night.idx] : null;
    const onRound = !!(round && m && m[1] === round.id);
    strip.hidden = !onRound;
    if (!onRound) return;
    strip.innerHTML = '';
    const info = el('span', 'gn-strip__info');
    info.append(el('b', '', stakesOn() ? provider().name : 'Game night'), ' · Game ' + (night.idx + 1) + ' of ' + night.queue.length + ' · ');
    round.who.forEach((i, k) => {
      if (k) info.append(round.who.length === 2 ? ' vs ' : ' ');
      info.append(nameChip(i));
    });
    const actions = el('span', 'gn-strip__actions');
    actions.append(
      button('Pick winner', 'btn--primary btn--sm', showPick),
      button('Scores', 'btn--sm', () => show([el('h2', '', 'Scoreboard'), standingsList(), (() => {
        const a = el('div', 'gn-actions');
        a.append(button('Back to the game', '', close), button('End game night', '', () => { close(); endNight(); }));
        return a;
      })()]))
    );
    strip.append(info, actions);
  }

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      if (night && night.idx < night.queue.length &&
          !window.confirm('Start a new game night? The current scoreboard will be cleared.')) return;
      openSetup({});
    });
  }
  if (resumeBtn) resumeBtn.addEventListener('click', showIntro);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  window.addEventListener('hashchange', sync);
  sync();

  window.GameNight = {
    open: openSetup,
    sync,
    setStakes(p) { stakesProvider = p; },
    /* Drops the stakes from a saved night (used when the provider erases its data). */
    clearStakes() {
      if (!night || !night.stakes) return;
      night.stakes = '';
      save();
      sync();
    }
  };
})();
