/* PlayRealm hub: shelves, filters, search, router, play view and the playable hero headline. */
(function () {
  'use strict';

  const A = window.Arcade;
  const games = A.games;
  const C = A.colors;
  const U = A.util;
  const $ = (sel) => document.querySelector(sel);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HUB_TITLE = document.title;
  const THUMB_W = 320;
  const THUMB_H = 200;
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const SITE = { ink: '#0B0B1A', paper: '#FFFFFF', sun: '#FFD23F', blueDeep: '#1A2FD0' };

  const els = {
    hub: $('#hub'),
    play: $('#play'),
    shelvesRoot: $('#shelves'),
    filtersRoot: $('#filters'),
    search: $('#search'),
    empty: $('#empty'),
    emptyQ: $('#empty-q'),
    stage: $('#stage'),
    pause: $('#pause'),
    title: $('#play-title'),
    players: $('#play-players'),
    isNew: $('#play-new'),
    tagline: $('#play-tagline'),
    hook: $('#play-hook'),
    howto: $('#howto-text'),
    controls: $('#controls'),
    note: $('#howto-note'),
    score: $('#hud-score'),
    best: $('#hud-best'),
    bestCell: $('#hud-best-cell'),
    status: $('#hud-status'),
    btnPause: $('#btn-pause'),
    btnRestart: $('#btn-restart'),
    btnSound: $('#btn-sound'),
    btnFull: $('#btn-full'),
    btnShare: $('#btn-share'),
    btnResume: $('#btn-resume')
  };
  const Gate = window.LoungeGate || null;

  /* ============ Game boxes ============ */
  const cards = new Map(); // id -> { el, ctx, bestEl }

  const fmtBest = (def, n) => (n === null || n === undefined ? '—' : def.formatScore(n));

  function fallbackThumb(ctx, def) {
    ctx.fillStyle = C.ink;
    ctx.fillRect(0, 0, THUMB_W, THUMB_H);
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.arc(THUMB_W / 2, THUMB_H / 2, 46, 0, Math.PI * 2);
    ctx.fill();
  }

  function paintThumb(card, def, t) {
    const ctx = card.ctx;
    ctx.save();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    try {
      if (def.drawThumb) def.drawThumb(ctx, THUMB_W, THUMB_H, t);
      else fallbackThumb(ctx, def);
    } catch (err) {
      console.error('[PlayRealm] thumbnail for ' + def.id + ' failed:', err);
      fallbackThumb(ctx, def);
    }
    ctx.restore();
  }

  function buildCard(def) {
    const a = document.createElement('a');
    a.className = 'box';
    // Private games (def.adult) never appear in the address bar or the browser history.
    a.href = def.adult ? '#lounge' : '#/play/' + def.id;
    a.dataset.id = def.id;
    if (def.adult) {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openAdult(def);
      });
    }
    a.style.setProperty('--c', def.color);
    if (def.adult) a.classList.add('box--lounge');
    a.innerHTML =
      '<span class="box__art"><canvas aria-hidden="true"></canvas>' +
        (def.adult ? '<span class="box__stamp" data-stamp></span>' : def.original ? '<span class="box__stamp">New idea</span>' : '') +
      '</span>' +
      '<span class="box__title"></span>' +
      '<span class="box__token"></span>' +
      '<span class="box__tagline"></span>' +
      (def.hook ? '<span class="box__hook"><b>Twist</b><span></span></span>' : '') +
      '<span class="box__best" hidden></span>';
    if (def.adult) a.querySelector('[data-stamp]').textContent = Gate.text.stamp;
    a.querySelector('.box__title').textContent = def.title;
    a.querySelector('.box__token').textContent = def.players;
    a.querySelector('.box__tagline').textContent = def.tagline;
    if (def.hook) a.querySelector('.box__hook span').textContent = def.hook;

    const canvas = a.querySelector('canvas');
    canvas.width = THUMB_W * DPR;
    canvas.height = THUMB_H * DPR;

    // Slot = card + favorite toggle (a button can't live inside the link).
    const slot = document.createElement('div');
    slot.className = 'slot';
    const fav = document.createElement('button');
    fav.type = 'button';
    fav.className = 'fav';
    fav.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 5.8-8 11-8 11z"/></svg>';
    const syncFav = () => {
      const on = window.Profile && Profile.isFav(def.id);
      fav.setAttribute('aria-pressed', String(!!on));
      fav.setAttribute('aria-label', (on ? 'Remove ' : 'Add ') + def.title + (on ? ' from favorites' : ' to favorites'));
    };
    fav.addEventListener('click', () => {
      if (!window.Profile) return;
      Profile.toggleFav(def.id);
      syncFav();
      updateFavFilter();
      if (filter === 'favs') applyFilter();
    });
    syncFav();
    // Private games stay out of favorites, so nothing about them shows up elsewhere.
    if (def.adult) slot.append(a);
    else slot.append(a, fav);

    const card = { el: slot, link: a, ctx: canvas.getContext('2d'), bestEl: a.querySelector('.box__best') };
    paintThumb(card, def, 0);

    // Animate the box art while hovered or focused.
    let raf = 0;
    let t0 = 0;
    const frame = (now) => {
      paintThumb(card, def, (now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    const startAnim = () => {
      if (reducedMotion || raf) return;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    };
    const stopAnim = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    a.addEventListener('pointerenter', startAnim);
    a.addEventListener('pointerleave', stopAnim);
    a.addEventListener('focus', startAnim);
    a.addEventListener('blur', stopAnim);
    a.addEventListener('click', stopAnim);

    cards.set(def.id, card);
    return slot;
  }

  function updateBests() {
    for (const def of games) {
      const card = cards.get(def.id);
      if (!card) continue;
      const n = def.best ? A.getBest(def) : null;
      card.bestEl.hidden = n === null;
      card.bestEl.textContent = n === null ? '' : 'Your best: ' + fmtBest(def, n);
    }
  }

  /* ============ Sections ============ */
  const SECTIONS = [
    { id: 'fresh', label: 'Brand-new ideas', title: 'Brand-new ideas',
      blurb: 'Game concepts made for PlayRealm that you won’t find anywhere else.' },
    { id: 'io', label: 'Battle arenas', title: 'Battle arenas',
      blurb: 'Brawl against a lobby of bots: kart fights, snowball wars, land grabs and last one standing.' },
    { id: 'combat', label: 'Combat & skill', title: 'Combat & skill',
      blurb: 'Duels, puzzle battles and high-score chasers. Solo, versus the computer, or a friend on the same keyboard.' },
    { id: 'sports', label: 'Sports & racing', title: 'Sports & racing',
      blurb: 'Putts, hoops, penalties and lap records, alone or against a friend.' },
    { id: 'puzzle', label: 'Puzzle & brain', title: 'Puzzle & brain',
      blurb: 'Number slides, logic grids and match puzzles for a quiet ten minutes.' },
    { id: 'board', label: 'Board & cards', title: 'Board & cards',
      blurb: 'Table classics and card games against the computer or a friend, each with an optional twist.' },
    { id: 'party', label: 'Party & words', title: 'Party & words',
      blurb: 'Pass-and-play games for a room full of people sharing one screen.' },
    { id: 'arcade', label: 'Arcade', title: 'Arcade',
      blurb: 'Quick classics and new ideas. Solo high scores or two players on one keyboard.' }
  ];
  const sectionOf = (def) => (def.adult ? 'lounge' : SECTIONS.some((s) => s.id === def.category) ? def.category : 'arcade');

  const shelves = new Map(); // section id -> { el, grid }
  SECTIONS.forEach((sec) => {
    const members = games.filter((g) => sectionOf(g) === sec.id);
    if (!members.length) return;
    const el = document.createElement('section');
    el.className = 'shelf shelf--' + sec.id;
    el.setAttribute('aria-labelledby', 'shelf-' + sec.id);
    el.innerHTML = '<div class="shelf__head"><h2 id="shelf-' + sec.id + '"></h2><span class="shelf__count"></span><p></p></div>' +
      '<div class="grid"></div>';
    el.querySelector('h2').textContent = sec.title;
    el.querySelector('.shelf__count').textContent = members.length + (members.length === 1 ? ' game' : ' games');
    el.querySelector('p').textContent = sec.blurb;
    const grid = el.querySelector('.grid');
    // Arcade: solo games first, then two-player games.
    const ordered = sec.id === 'arcade'
      ? members.filter((g) => g.mode === 'solo').concat(members.filter((g) => g.mode !== 'solo'))
      : members;
    ordered.forEach((def) => grid.append(buildCard(def)));
    els.shelvesRoot.append(el);
    shelves.set(sec.id, { el, grid });
  });
  updateBests();

  /* ============ Filters + search ============ */
  const filterDefs = [{ id: 'all', label: 'All', n: games.length }].concat(
    SECTIONS.filter((s) => shelves.has(s.id)).map((s) => ({
      id: s.id, label: s.label, n: games.filter((g) => sectionOf(g) === s.id).length
    })));
  const filterButtons = filterDefs.map((f) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter';
    b.dataset.filter = f.id;
    b.innerHTML = '<span></span> <span class="filter__n"></span>';
    b.firstChild.textContent = f.label;
    b.lastChild.textContent = f.n;
    els.filtersRoot.append(b);
    return b;
  });
  $('#hero-count').textContent = games.length;

  // Favorites chip appears once something is starred.
  const favButton = document.createElement('button');
  favButton.type = 'button';
  favButton.className = 'filter filter--fav';
  favButton.dataset.filter = 'favs';
  favButton.innerHTML = '<span>Favorites</span> <span class="filter__n"></span>';
  els.filtersRoot.insertBefore(favButton, filterButtons[1] || null);
  filterButtons.splice(1, 0, favButton);
  function updateFavFilter() {
    const n = window.Profile ? Profile.favs.length : 0;
    favButton.hidden = n === 0;
    favButton.lastChild.textContent = n;
    if (n === 0 && filter === 'favs') {
      filter = 'all';
      applyFilter();
    }
  }

  let filter = 'all';
  let query = '';

  function matches(def) {
    if (filter === 'favs') {
      if (!(window.Profile && Profile.isFav(def.id))) return false;
    } else if (filter !== 'all' && sectionOf(def) !== filter) return false;
    if (!query) return true;
    const hay = [def.title, def.tagline, def.hook, def.players,
      def.mode === 'solo' ? 'solo single one player' : 'together multiplayer two players versus',
      def.original ? 'new idea original' : '', sectionOf(def), ...(def.tags || [])].join(' ').toLowerCase();
    return query.split(/\s+/).every((word) => hay.includes(word));
  }

  function applyFilter() {
    let shown = 0;
    cards.forEach((card, id) => {
      const ok = matches(A.get(id));
      card.el.hidden = !ok;
      if (ok) shown++;
    });
    shelves.forEach(({ el }) => {
      el.hidden = !el.querySelector('.slot:not([hidden])');
    });
    if (loungeShelf) loungeShelf.hidden = !loungeShelf.querySelector('.slot:not([hidden])');
    els.empty.hidden = shown > 0;
    els.emptyQ.textContent = query;
    filterButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === filter)));
  }

  filterButtons.forEach((b) => b.addEventListener('click', () => {
    filter = b.dataset.filter;
    applyFilter();
  }));
  els.filtersRoot.addEventListener('wheel', (e) => {
    const root = els.filtersRoot;
    if (root.scrollWidth <= root.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    e.preventDefault();
    root.scrollLeft += e.deltaY;
  }, { passive: false });

  /* ============ Private shelf (def.adult games): exists only while the gate script has it
     unlocked. All of its wording comes from the gate (Gate.text); without that script none
     of this runs. ============ */
  let loungeShelf = null;
  let loungeFilter = null;

  function mountLounge() {
    if (loungeShelf || !A.lounge.length) return;
    const el = document.createElement('section');
    el.className = 'shelf shelf--lounge';
    el.id = 'lounge';
    el.setAttribute('aria-labelledby', 'shelf-lounge');
    const T = Gate.text;
    el.innerHTML =
      '<div class="shelf__head"><h2 id="shelf-lounge"></h2><span class="shelf__count"></span><p></p>' +
        '<div class="lounge-bar">' +
          '<button type="button" class="btn btn--sm btn--primary" data-l="date"></button>' +
          '<button type="button" class="btn btn--sm" data-l="privacy"></button>' +
          '<button type="button" class="btn btn--sm" data-l="lock"></button>' +
        '</div></div><div class="grid"></div>';
    el.querySelector('h2').textContent = T.shelfTitle;
    el.querySelector('.shelf__head p').textContent = T.shelfBlurb;
    el.querySelector('[data-l="date"]').textContent = T.shelfDate;
    el.querySelector('[data-l="privacy"]').textContent = T.shelfPrivacy;
    el.querySelector('[data-l="lock"]').textContent = T.lock;
    el.querySelector('.shelf__count').textContent = T.shelfCount(A.lounge.length);
    const grid = el.querySelector('.grid');
    A.lounge.forEach((def) => grid.append(buildCard(def)));
    el.querySelector('[data-l="date"]').addEventListener('click', () => window.GameNight && GameNight.open({ stakes: 'spicy' }));
    el.querySelector('[data-l="privacy"]').addEventListener('click', () => Gate.privacy());
    el.querySelector('[data-l="lock"]').addEventListener('click', () => Gate.lock());
    els.shelvesRoot.append(el);
    loungeShelf = el;

    loungeFilter = document.createElement('button');
    loungeFilter.type = 'button';
    loungeFilter.className = 'filter filter--lounge';
    loungeFilter.dataset.filter = 'lounge';
    loungeFilter.innerHTML = '<span></span> <span class="filter__n"></span>';
    loungeFilter.firstChild.textContent = T.filter;
    loungeFilter.lastChild.textContent = A.lounge.length;
    loungeFilter.addEventListener('click', () => {
      filter = 'lounge';
      applyFilter();
    });
    els.filtersRoot.append(loungeFilter);
    filterButtons.push(loungeFilter);
    applyFilter();
  }

  function unmountLounge() {
    if (!loungeShelf) return;
    A.lounge.forEach((def) => cards.delete(def.id));
    loungeShelf.remove();
    loungeShelf = null;
    filterButtons.splice(filterButtons.indexOf(loungeFilter), 1);
    loungeFilter.remove();
    loungeFilter = null;
    if (filter === 'lounge') filter = 'all';
    applyFilter();
  }

  if (Gate) {
    Gate.onChange((open) => {
      if (open) mountLounge();
      else {
        if (current && current.def.adult) closeAdult();
        unmountLounge();
      }
    });
    // Came in through the gate's own footer link: show the shelf.
    Gate.onEnter(() => {
      filter = 'lounge';
      applyFilter();
      if (loungeShelf) loungeShelf.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }
  els.search.addEventListener('input', () => {
    query = els.search.value.trim().toLowerCase();
    applyFilter();
  });
  $('#clear-search').addEventListener('click', () => {
    els.search.value = '';
    query = '';
    filter = 'all';
    applyFilter();
    els.search.focus();
  });

  $('#surprise').addEventListener('click', () => {
    const def = U.pick(games);
    if (def) location.hash = '#/play/' + def.id;
  });

  $('#clear-bests').addEventListener('click', () => {
    if (window.confirm('Clear every best score saved in this browser? This cannot be undone.')) {
      A.store.clearBests();
      updateBests();
    }
  });

  /* ============ Play view ============ */
  let current = null; // { def, rt }
  let hubScroll = 0;

  function renderControls(def) {
    els.controls.innerHTML = '';
    def.controls.forEach((c) => {
      const li = document.createElement('li');
      const keys = document.createElement('span');
      keys.className = 'controls__keys';
      (c.keys || []).forEach((k) => {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        keys.append(kbd);
      });
      const label = document.createElement('span');
      label.className = 'controls__label';
      label.textContent = c.label;
      li.append(keys, label);
      els.controls.append(li);
    });
  }

  function uiFor(def) {
    return {
      setScore(v) {
        els.score.textContent = v === null || v === undefined || v === '' ? '—' : String(v);
      },
      setStatus(text) {
        els.status.textContent = text || '';
      },
      setBest(n) {
        els.best.textContent = fmtBest(def, n);
        if (window.Profile) Profile.newBest(def);
      }
    };
  }

  function setPaused(p) {
    if (!current) return;
    current.rt.setPaused(p);
    els.pause.hidden = !p;
    els.btnPause.textContent = p ? 'Resume' : 'Pause';
    if (window.Profile && !current.def.adult) Profile.setPaused(p);
    if (p) els.btnResume.focus({ preventScroll: true });
    else if (window.Input) Input.resume(); // keys still held on a controller or the touch pad
  }

  function startGame(def) {
    els.score.textContent = '—';
    els.status.textContent = '';
    els.pause.hidden = true;
    els.btnPause.textContent = 'Pause';
    // Games built from page elements (not a canvas) get a stage that grows and scrolls.
    els.stage.classList.toggle('stage--dom', !!def.dom);
    current = { def, rt: null };
    current.rt = A.start(def, els.stage, uiFor(def));
    if (window.Input) Input.attach(def);
  }

  function stopGame() {
    if (!current) return;
    if (window.Input) Input.detach();
    current.rt.destroy();
    els.stage.classList.remove('stage--dom');
    current = null;
  }

  function openGame(def) {
    if (current && current.def === def) return;
    if (current) stopGame();
    else hubScroll = window.scrollY;
    // Whatever was being timed stops here, so time in a private game never reaches the profile.
    if (window.Profile) Profile.stopGame();

    els.hub.hidden = true;
    els.play.hidden = false;
    els.play.style.setProperty('--c', def.color);
    els.play.classList.toggle('play--lounge', !!def.adult);
    els.btnShare.hidden = !!def.adult;
    // Private games keep a plain tab title.
    document.title = def.adult ? 'PlayRealm' : def.title + ' · PlayRealm';
    els.title.textContent = def.title;
    els.players.textContent = def.players;
    els.isNew.hidden = !def.original;
    els.tagline.textContent = def.tagline;
    els.hook.textContent = def.hook;
    els.hook.parentElement.hidden = !def.hook;
    els.howto.textContent = def.howTo;
    els.bestCell.hidden = !def.best;
    els.best.textContent = fmtBest(def, A.getBest(def));
    els.note.innerHTML = def.adult
      ? ''
      : def.best
        ? '<kbd>Esc</kbd> pauses. Your best score saves automatically in this browser.'
        : '<kbd>Esc</kbd> pauses. Player 1 sits on the left of the keyboard, player 2 on the right.';
    if (def.adult) els.note.textContent = Gate.text.playNote;
    renderControls(def);
    toy.stop();
    startGame(def);
    if (window.Profile) {
      if (!def.adult) Profile.startGame(def);
      if (Profile.autoFull && !isFull()) enterFull();
    }
  }

  function closeGame() {
    if (!current) return;
    const id = current.def.id;
    stopGame();
    if (window.Profile) Profile.stopGame();
    exitFull();
    els.play.hidden = true;
    els.play.classList.remove('play--lounge');
    els.hub.hidden = false;
    document.title = HUB_TITLE;
    updateBests();
    renderRecent();
    renderQuests();
    window.scrollTo(0, hubScroll);
    const card = cards.get(id);
    if (card) card.link.focus({ preventScroll: true });
    toy.start();
  }

  /* Private games open from memory, not from the URL: nothing lands in the address bar,
     the history list or autocomplete. One neutral history entry lets Back close the game. */
  let adultEntry = false;
  function cleanUrl() {
    if (location.hash) history.replaceState(history.state, '', location.pathname + location.search);
  }
  function openAdult(def) {
    if (!def || !Gate || !Gate.unlocked) return;
    cleanUrl();
    if (!adultEntry) {
      history.pushState({ playrealm: 'hub' }, '');
      adultEntry = true;
    }
    openGame(def);
  }
  function closeAdult() {
    closeGame();
    if (adultEntry) {
      adultEntry = false;
      history.back();
    }
  }
  window.addEventListener('popstate', () => {
    if (!adultEntry) return;
    adultEntry = false;
    if (current && current.def.adult) closeGame();
  });
  // "All games" and "Quit" are plain "#" links: fine for normal games, but there is no
  // hash to change when a private game is open.
  document.querySelectorAll('#back, #pause a.btn').forEach((link) => link.addEventListener('click', (e) => {
    if (!current || !current.def.adult) return;
    e.preventDefault();
    closeAdult();
  }));

  function route() {
    // App shortcuts (see manifest.webmanifest).
    if (location.hash === '#/random' || location.hash === '#/today') {
      const pick = location.hash === '#/today' && window.Profile ? Profile.dailyPick() : U.pick(games);
      if (pick) {
        location.replace('#/play/' + pick.id);
        return;
      }
    }
    const m = /^#\/play\/([\w-]+)$/.exec(location.hash);
    const id = m && m[1];
    const def = id && A.get(id);
    const gated = Gate && id && (Gate.has(id) || (def && def.adult));
    if (gated) {
      // A typed or saved link to a private game: wipe it from the address bar at once, then ask.
      cleanUrl();
      if (def && Gate.unlocked) openAdult(def);
      else {
        closeGame();
        Gate.request(() => openAdult(A.get(id)));
      }
    } else if (def) openGame(def);
    else if (!(current && current.def.adult)) closeGame();
  }

  els.btnPause.addEventListener('click', () => setPaused(!(current && current.rt.paused)));
  els.btnResume.addEventListener('click', () => setPaused(false));
  els.btnRestart.addEventListener('click', () => {
    if (!current) return;
    const def = current.def;
    stopGame();
    startGame(def);
  });

  function syncSound() {
    const on = !A.sound.muted;
    els.btnSound.textContent = on ? 'Sound on' : 'Sound off';
    els.btnSound.setAttribute('aria-pressed', String(on));
  }
  els.btnSound.addEventListener('click', () => {
    A.sound.setMuted(!A.sound.muted);
    syncSound();
  });
  syncSound();

  /* Share the game (and your best score) through the system share sheet, or copy the link. */
  els.btnShare.addEventListener('click', () => {
    if (!current || current.def.adult) return;
    const def = current.def;
    const best = def.best ? A.getBest(def) : null;
    const text = best !== null
      ? 'My best in ' + def.title + ' on PlayRealm is ' + fmtBest(def, best) + '. Can you beat it?'
      : 'Play ' + def.title + ' with me on PlayRealm.';
    const url = location.href;
    const copied = () => window.Profile && Profile.toast('Link copied', 'Paste it anywhere to share ' + def.title + '.', 'check');
    if (navigator.share) {
      navigator.share({ title: def.title + ' · PlayRealm', text, url }).catch(() => {});
    } else if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text + ' ' + url).then(copied, () => window.prompt('Copy this link:', url));
    } else {
      window.prompt('Copy this link:', url);
    }
  });

  /* Full screen: the real Fullscreen API where available, otherwise an immersive mode
     that pins the game to the whole viewport (e.g. iPhone Safari). */
  const canFullscreen = !!(els.play.requestFullscreen || els.play.webkitRequestFullscreen);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  function isFull() {
    return !!fsElement() || els.play.classList.contains('is-immersive');
  }
  function syncFull() {
    const on = isFull();
    els.btnFull.textContent = on ? 'Exit full screen' : 'Full screen';
    els.btnFull.setAttribute('aria-pressed', String(on));
    els.play.classList.toggle('is-full', on);
    if (on && window.Profile && current && !current.def.adult) Profile.markBigScreen();
    // Only the full-screen element is drawn in real full screen: bring the toasts inside it.
    const toasts = $('#toasts');
    const home = fsElement() === els.play ? els.play : document.body;
    if (toasts && toasts.parentElement !== home) home.append(toasts);
  }
  function enterImmersive() {
    if (!current) return; // the game was closed while full screen was still being requested
    els.play.classList.add('is-immersive');
    document.documentElement.classList.add('no-scroll');
    syncFull();
  }
  function enterFull() {
    if (!canFullscreen) {
      enterImmersive();
      return;
    }
    // Some embedded browsers refuse or never answer: fall back to immersive mode.
    let settled = false;
    let req = null;
    try {
      req = els.play.requestFullscreen ? els.play.requestFullscreen() : els.play.webkitRequestFullscreen();
    } catch (err) {
      req = null;
    }
    if (!req || !req.then) {
      setTimeout(() => { if (!fsElement()) enterImmersive(); }, 300);
      return;
    }
    req.then(() => { settled = true; syncFull(); }, () => { settled = true; enterImmersive(); });
    setTimeout(() => { if (!settled && !fsElement()) enterImmersive(); }, 700);
  }
  function exitFull() {
    if (fsElement()) {
      const ex = document.exitFullscreen ? document.exitFullscreen() : document.webkitExitFullscreen();
      if (ex && ex.catch) ex.catch(() => {});
    }
    els.play.classList.remove('is-immersive');
    document.documentElement.classList.remove('no-scroll');
    syncFull();
  }
  els.btnFull.addEventListener('click', () => (isFull() ? exitFull() : enterFull()));
  document.addEventListener('fullscreenchange', syncFull);
  document.addEventListener('webkitfullscreenchange', syncFull);

  // Mouse clicks shouldn't leave bar buttons focused, or Space would press them again mid-game.
  $('.playbar').addEventListener('click', (e) => {
    const b = e.target.closest('.btn');
    if (b && e.detail > 0) b.blur();
  });
  // A dialog hands focus back to the button that opened it: drop it, for the same reason.
  document.querySelectorAll('dialog').forEach((d) => d.addEventListener('close', () => {
    const a = document.activeElement;
    if (current && a && a.closest && a.closest('.playbar')) a.blur();
  }));

  const ARROWS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  window.addEventListener('keydown', (e) => {
    const tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (!current) {
      // On the hub, "/" jumps to search.
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !document.querySelector('dialog[open]')) {
        e.preventDefault();
        els.search.focus();
      }
      return;
    }
    // An open dialog (game night, profile) owns the keyboard, Escape included.
    if (document.querySelector('dialog[open]')) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      setPaused(!current.rt.paused);
      return;
    }
    // Games made of page elements scroll like a page: leave the arrow keys and Space alone.
    if (current.def.dom) return;
    // Keep the page still while playing; let Space/Enter still press a focused button or link.
    if (ARROWS.has(e.code) || (e.code === 'Space' && tag !== 'BUTTON' && tag !== 'A')) e.preventDefault();
  }, true);

  let shownDay = window.Profile ? Profile.today : '';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && current && !current.rt.paused) setPaused(true);
    // A tab left open past midnight: bring in the new game of the day and the new quests.
    if (!document.hidden && window.Profile && Profile.today !== shownDay) {
      shownDay = Profile.today;
      renderToday();
      renderQuests();
      syncProfileChip();
    }
  });

  /* ============ Hero toy: the word PLAY as a playable brick wall ============ */
  const toy = (function () {
    const canvas = $('#toy');
    const ctx = canvas.getContext('2d');
    const FONT = {
      P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
      L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
      A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
      Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100']
    };
    const WORD = 'PLAY';
    const LETTER_COLORS = [C.p1, SITE.sun, C.p2, C.mint];
    const COLS = WORD.length * 6 - 1;
    const MAX_BALLS = 4;

    let W = 0;
    let H = 0;
    let tile = 0;
    let bricks = [];
    let balls = [];
    let parts = [];
    let paddle = { x: 0, y: 0, w: 0, h: 0 };
    let pointerX = null;
    let broken = 0;
    let respawn = 0;
    let raf = 0;
    let last = 0;
    let visible = true;

    function layout() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, rect.width);
      H = Math.max(1, rect.height);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      tile = Math.floor((W * 0.84) / COLS);
      const ox = (W - COLS * tile) / 2;
      const oy = H * 0.12;
      bricks = [];
      [...WORD].forEach((ch, li) => {
        FONT[ch].forEach((row, ry) => {
          [...row].forEach((bit, rx) => {
            if (bit !== '1') return;
            bricks.push({
              x: ox + (li * 6 + rx) * tile,
              y: oy + ry * tile,
              color: LETTER_COLORS[li],
              alive: true,
              regrow: 0,
              pop: 1
            });
          });
        });
      });
      paddle = { x: W / 2, y: H - tile * 1.6, w: tile * 4.4, h: Math.max(8, tile * 0.6) };
      balls = [];
      addBall();
      parts = [];
    }

    function addBall() {
      if (balls.length >= MAX_BALLS || !tile) return;
      const speed = W * 0.6;
      const a = -Math.PI / 2 + U.rand(-0.6, 0.6);
      balls.push({
        x: paddle.x,
        y: paddle.y - tile,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        r: Math.max(5, tile * 0.34)
      });
    }

    function burst(x, y, color) {
      for (let i = 0; i < 7 && parts.length < 140; i++) {
        parts.push({ x, y, vx: U.rand(-160, 160), vy: U.rand(-220, 40), life: U.rand(0.4, 0.8), color, s: U.rand(3, 6) });
      }
    }

    function overlaps(b, br) {
      const nx = U.clamp(b.x, br.x, br.x + tile);
      const ny = U.clamp(b.y, br.y, br.y + tile);
      return (b.x - nx) ** 2 + (b.y - ny) ** 2 < b.r * b.r;
    }

    function stepBall(b, dt) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy); }

      // Paddle
      if (b.vy > 0 && b.y + b.r >= paddle.y && b.y - b.r <= paddle.y + paddle.h &&
          Math.abs(b.x - paddle.x) <= paddle.w / 2 + b.r) {
        const off = U.clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
        const speed = Math.hypot(b.vx, b.vy);
        const a = -Math.PI / 2 + off * 1.0;
        b.vx = Math.cos(a) * speed;
        b.vy = Math.sin(a) * speed;
        b.y = paddle.y - b.r;
      }

      // Bricks: one hit per substep, reflect on the shallower axis.
      for (const br of bricks) {
        if (!br.alive || !overlaps(b, br)) continue;
        const cx = br.x + tile / 2;
        const cy = br.y + tile / 2;
        const px = tile / 2 + b.r - Math.abs(b.x - cx);
        const py = tile / 2 + b.r - Math.abs(b.y - cy);
        if (px < py) {
          b.vx = Math.sign(b.x - cx) * Math.abs(b.vx);
          b.x += Math.sign(b.x - cx) * px;
        } else {
          b.vy = Math.sign(b.y - cy) * Math.abs(b.vy);
          b.y += Math.sign(b.y - cy) * py;
        }
        br.alive = false;
        br.regrow = U.rand(4, 7);
        broken++;
        burst(cx, cy, br.color);
        break;
      }
    }

    function update(dt) {
      // Paddle follows the pointer, or plays itself.
      let target;
      if (pointerX !== null) target = pointerX;
      else {
        const falling = balls.filter((b) => b.vy > 0).sort((a, b) => b.y - a.y)[0] || balls[0];
        target = falling ? falling.x + Math.sin(performance.now() / 700) * paddle.w * 0.3 : W / 2;
      }
      paddle.x += (target - paddle.x) * Math.min(1, dt * (pointerX !== null ? 20 : 7));
      paddle.x = U.clamp(paddle.x, paddle.w / 2, W - paddle.w / 2);

      for (const b of balls) {
        const steps = Math.ceil((Math.hypot(b.vx, b.vy) * dt) / (b.r * 0.5)) || 1;
        for (let i = 0; i < steps; i++) stepBall(b, dt / steps);
      }
      balls = balls.filter((b) => b.y - b.r < H);
      if (!balls.length) {
        respawn += dt;
        if (respawn > 0.6) {
          respawn = 0;
          addBall();
        }
      }

      for (const br of bricks) {
        if (br.alive) {
          br.pop = Math.min(1, br.pop + dt * 3);
          continue;
        }
        br.regrow -= dt;
        if (br.regrow <= 0) {
          if (balls.some((b) => overlaps(b, br))) br.regrow = 0.4;
          else {
            br.alive = true;
            br.pop = 0;
          }
        }
      }

      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 600 * dt;
        p.life -= dt;
      }
      parts = parts.filter((p) => p.life > 0);
    }

    function rr(x, y, w, h, r) {
      U.roundRect(ctx, x, y, w, h, r);
    }

    function draw() {
      ctx.fillStyle = SITE.blueDeep;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      const g = Math.max(14, tile);
      for (let x = g / 2; x < W; x += g) {
        for (let y = g / 2; y < H; y += g) ctx.fillRect(x - 1, y - 1, 2, 2);
      }

      const gap = Math.max(2, tile * 0.1);
      const sh = Math.max(2, tile * 0.12);
      for (const br of bricks) {
        if (!br.alive) continue;
        const s = br.pop < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - br.pop, 3)) * (1 + Math.sin(br.pop * Math.PI) * 0.25) : 1;
        const size = (tile - gap) * s;
        const x = br.x + (tile - size) / 2;
        const y = br.y + (tile - size) / 2;
        ctx.fillStyle = SITE.ink;
        rr(x + sh, y + sh, size, size, tile * 0.18);
        ctx.fill();
        ctx.fillStyle = br.color;
        rr(x, y, size, size, tile * 0.18);
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, tile * 0.08);
        ctx.strokeStyle = SITE.ink;
        ctx.stroke();
      }

      for (const p of parts) {
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
      }
      ctx.globalAlpha = 1;

      // Paddle
      ctx.fillStyle = SITE.ink;
      rr(paddle.x - paddle.w / 2 + sh, paddle.y + sh, paddle.w, paddle.h, paddle.h / 2);
      ctx.fill();
      ctx.fillStyle = SITE.sun;
      rr(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, paddle.h / 2);
      ctx.fill();
      ctx.lineWidth = Math.max(2, tile * 0.1);
      ctx.strokeStyle = SITE.ink;
      ctx.stroke();

      // Balls
      for (const b of balls) {
        ctx.fillStyle = SITE.paper;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = Math.max(2, b.r * 0.35);
        ctx.strokeStyle = SITE.ink;
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.font = '600 ' + Math.max(11, Math.round(tile * 0.5)) + 'px "JetBrains Mono", monospace';
      ctx.textBaseline = 'bottom';
      ctx.fillText('bricks broken ' + broken, tile * 0.6, H - tile * 0.35);
    }

    function frame(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(frame);
    }

    function start() {
      if (raf || reducedMotion || !visible || current) return;
      if (Math.abs(canvas.getBoundingClientRect().width - W) > 1) layout();
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(raf);
      raf = 0;
    }

    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      pointerX = ((e.clientX - r.left) / r.width) * W;
    });
    canvas.addEventListener('pointerleave', () => { pointerX = null; });
    canvas.addEventListener('click', () => {
      addBall();
      if (reducedMotion) draw();
    });

    layout();
    draw();

    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (current) return;
        layout();
        draw();
      }, 150);
    });
    new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
      else stop();
    }).observe(canvas);

    return { start, stop };
  })();

  /* ============ Profile chip, game of the day, recently played ============ */
  function paintInto(canvas, def, w, h, scale, t) {
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    try {
      if (def.drawThumb) def.drawThumb(ctx, w, h, t);
      else fallbackThumb(ctx, def);
    } catch (err) {
      fallbackThumb(ctx, def);
    }
  }

  function renderToday() {
    const root = $('#today');
    const def = window.Profile && Profile.dailyPick();
    if (!root || !def) return;
    root.style.setProperty('--c', def.color);
    root.innerHTML =
      '<div class="today__card">' +
        '<a class="today__art" tabindex="-1" aria-hidden="true"><canvas></canvas></a>' +
        '<div class="today__copy">' +
          '<p class="today__eyebrow">Game of the day · +50 XP bonus</p>' +
          '<h2 id="today-title"></h2>' +
          '<p class="today__tagline"></p>' +
          '<p class="today__hook"><b>Twist</b><span></span></p>' +
          '<a class="btn btn--primary btn--lg today__play">Play today’s pick</a>' +
        '</div>' +
      '</div>';
    const href = '#/play/' + def.id;
    root.querySelector('.today__art').href = href;
    root.querySelector('.today__play').href = href;
    root.querySelector('h2').textContent = def.title;
    root.querySelector('.today__tagline').textContent = def.tagline;
    root.querySelector('.today__hook span').textContent = def.hook || '';
    root.querySelector('.today__hook').hidden = !def.hook;
    const canvas = root.querySelector('canvas');
    paintInto(canvas, def, THUMB_W, THUMB_H, DPR * 1.6, 0);
    let raf = 0;
    let t0 = 0;
    const frame = (now) => {
      paintInto(canvas, def, THUMB_W, THUMB_H, DPR * 1.6, (now - t0) / 1000);
      raf = requestAnimationFrame(frame);
    };
    const card = root.querySelector('.today__card');
    card.addEventListener('pointerenter', () => {
      if (reducedMotion || raf) return;
      t0 = performance.now();
      raf = requestAnimationFrame(frame);
    });
    card.addEventListener('pointerleave', () => {
      cancelAnimationFrame(raf);
      raf = 0;
    });
  }

  function renderRecent() {
    const root = $('#recent');
    const row = $('#recent-row');
    if (!root || !window.Profile) return;
    const ids = Profile.recent.slice(0, 6);
    root.hidden = ids.length === 0;
    row.innerHTML = '';
    ids.forEach((id) => {
      const def = A.get(id);
      if (!def || def.adult) return;
      const a = document.createElement('a');
      a.className = 'mini';
      a.href = '#/play/' + id;
      a.style.setProperty('--c', def.color);
      a.innerHTML = '<canvas aria-hidden="true"></canvas><span class="mini__title"></span><span class="mini__meta"></span>';
      a.querySelector('.mini__title').textContent = def.title;
      const best = def.best ? A.getBest(def) : null;
      a.querySelector('.mini__meta').textContent = best !== null ? 'Best ' + fmtBest(def, best) : def.players;
      paintInto(a.querySelector('canvas'), def, THUMB_W, THUMB_H, DPR * 0.6, 0);
      row.append(a);
    });
  }

  /* Today's three quests and the day streak. */
  function renderQuests() {
    const root = $('#quests');
    if (!root || !window.Profile) return;
    const list = Profile.quests;
    root.hidden = !list.length;
    if (!list.length) return;
    const streak = Profile.streak;
    const left = list.filter((q) => !q.done).length;
    root.innerHTML =
      '<div class="quests__card">' +
        '<div class="quests__head"><h2 id="quests-title">Today’s quests</h2><p></p></div>' +
        '<ul class="quests__list"></ul>' +
        '<div class="quests__streak"><strong></strong><span></span></div>' +
      '</div>';
    root.querySelector('.quests__head p').textContent = left
      ? '+40 XP each, +60 for all three. New ones every day.'
      : 'All done. Come back tomorrow for three more.';
    const ul = root.querySelector('.quests__list');
    list.forEach((q) => {
      const li = document.createElement('li');
      li.className = 'quest' + (q.done ? ' is-done' : '');
      li.innerHTML = '<i aria-hidden="true"></i><span></span><b></b>';
      li.querySelector('span').textContent = q.text;
      li.querySelector('b').textContent = q.done ? 'Done' : q.goal > 1 ? q.progress + ' / ' + q.goal + (q.unit ? ' ' + q.unit : '') : '';
      ul.append(li);
    });
    root.querySelector('.quests__streak strong').textContent = streak;
    root.querySelector('.quests__streak span').textContent = streak ? 'day streak' : 'play today to start a streak';
    root.querySelector('.quests__streak').classList.toggle('is-cold', streak === 0);
  }

  function syncProfileChip() {
    if (!window.Profile) return;
    $('#profile-lvl').textContent = 'Lv ' + Profile.level;
    const chip = $('#profile-streak');
    if (chip) {
      chip.hidden = Profile.streak < 1;
      chip.querySelector('b').textContent = Profile.streak;
      chip.title = Profile.streak + '-day streak';
    }
    if (!current) renderQuests();
    syncSound();
  }
  $('#profile-btn').addEventListener('click', () => window.Profile && Profile.open());
  if (window.Profile) Profile.onChange(syncProfileChip);
  [syncProfileChip, renderToday, renderRecent, renderQuests, updateFavFilter].forEach((fn) => {
    try { fn(); } catch (err) { console.error('[PlayRealm] ' + fn.name + ' failed:', err); }
  });

  /* ============ Boot ============ */
  applyFilter();
  window.addEventListener('hashchange', route);
  route();
  if (!current) toy.start();
})();
