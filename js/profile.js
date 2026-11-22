/* PlayRealm profile: XP + levels, badges, favorites, recently played, game of the day,
   settings and toasts. Everything lives in this browser (Arcade.store). Loaded before app.js. */
(function () {
  'use strict';

  const A = window.Arcade;
  const KEY = 'profile';
  const blank = () => ({
    xp: 0,
    plays: {},        // game id -> times opened
    time: 0,          // seconds played in total
    bests: 0,         // personal bests set
    recent: [],       // game ids, most recent first
    favs: [],         // favorite game ids
    badges: [],       // unlocked badge ids
    dailyDays: [],    // dates the game of the day was played
    bigScreen: false, // played in full screen at least once
    nightOwl: false,
    autoFull: false,  // setting: open games in full screen
    streak: 0,        // days in a row with at least one game
    streakBest: 0,
    lastDay: '',      // last day a game was played (YYYY-MM-DD)
    daily: null,      // today's quests: { day, quests, done, games, fresh, bests, secs, swept }
    sweeps: 0,        // days with all three quests done
    usedPad: false    // played with a controller
  });

  /* Saved data may come from an older version or be damaged: keep only fields of the right type. */
  function sanitize(raw) {
    const base = blank();
    const out = blank();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
    const count = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
    Object.keys(base).forEach((k) => {
      const v = raw[k];
      const b = base[k];
      if (v === undefined || v === null) return;
      if (Array.isArray(b)) out[k] = strings(v);
      else if (typeof b === 'number') out[k] = count(v);
      else if (typeof b === 'boolean') out[k] = v === true;
      else if (typeof b === 'string') out[k] = typeof v === 'string' ? v : b;
    });
    if (raw.plays && typeof raw.plays === 'object' && !Array.isArray(raw.plays)) {
      Object.keys(raw.plays).forEach((id) => {
        if (count(raw.plays[id]) > 0) out.plays[id] = Math.floor(raw.plays[id]);
      });
    }
    const d = raw.daily;
    if (d && typeof d === 'object' && typeof d.day === 'string' && Array.isArray(d.quests)) {
      out.daily = {
        day: d.day, quests: strings(d.quests).slice(0, 3), done: strings(d.done), games: strings(d.games),
        fresh: count(d.fresh), bests: count(d.bests), secs: count(d.secs), swept: d.swept === true
      };
    }
    return out;
  }

  let data = sanitize(A.store.get(KEY, null));
  const listeners = new Set();
  let session = null; // { id, started }

  function save() {
    A.store.set(KEY, data);
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  /* ---------- Levels ---------- */
  const levelFor = (xp) => Math.floor(Math.sqrt(xp / 40)) + 1; // L2 at 40 XP, L3 at 160, L5 at 640, L10 at 3240
  const xpForLevel = (lvl) => 40 * (lvl - 1) * (lvl - 1);

  /* ---------- Game of the day ---------- */
  function todayKey(offset) {
    const d = new Date();
    if (offset) d.setDate(d.getDate() + offset);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function hash(str) {
    let h = 2166136261;
    for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    return h;
  }
  function dailyPick() {
    if (!A.games.length) return null;
    return A.games[hash('playrealm' + todayKey()) % A.games.length];
  }

  /* ---------- Streak ---------- */
  // A streak is alive if the last play was today or yesterday.
  // (A last day "in the future" means the clock or time zone moved back: count it as today.)
  const streakNow = () => (data.lastDay >= todayKey(-1) ? data.streak : 0);
  /* Marks today as played. Returns the streak bonus XP when this is the first play of a new day. */
  function touchDay() {
    const day = todayKey();
    if (data.lastDay >= day) return 0;
    data.streak = data.lastDay === todayKey(-1) ? data.streak + 1 : 1;
    data.lastDay = day;
    data.streakBest = Math.max(data.streakBest, data.streak);
    if (data.streak < 2) return 0;
    const bonus = Math.min(50, data.streak * 5);
    toast(data.streak + '-day streak!', 'Play again tomorrow to keep it going. +' + bonus + ' XP', 'flame');
    return bonus;
  }

  /* ---------- Daily quests: three per day, picked from the date ---------- */
  const CAT_LABEL = {
    fresh: 'brand-new idea', io: 'battle arena', combat: 'combat & skill', sports: 'sports & racing',
    puzzle: 'puzzle & brain', board: 'board & cards', party: 'party & words', arcade: 'arcade'
  };
  const maxPlayers = (def) => {
    const m = /(\d+)\s*(?:[–-]\s*(\d+))?\s*P/.exec((def && def.players) || '');
    return m ? Number(m[2] || m[1]) : 1;
  };
  const QUESTS = {
    three: { text: 'Play 3 different games', goal: 3, progress: (d) => d.games.length },
    best: { text: 'Set a new personal best', goal: 1, progress: (d) => d.bests },
    time: { text: 'Play for 10 minutes', goal: 600, progress: (d) => d.secs, unit: 'min' },
    versus: { text: 'Play a game for two or more players', goal: 1,
      progress: (d) => d.games.filter((id) => maxPlayers(A.get(id)) >= 2).length },
    fresh: { text: 'Try a game you have never played', goal: 1, progress: (d) => d.fresh },
    idea: { text: 'Play a “New idea” game', goal: 1, progress: (d) => d.games.filter((id) => (A.get(id) || {}).original).length },
    gotd: { text: 'Play the game of the day', goal: 1, progress: (d) => (data.dailyDays.includes(d.day) ? 1 : 0) }
  };
  function questDef(id) {
    if (QUESTS[id]) return QUESTS[id];
    const cat = id.startsWith('cat:') ? id.slice(4) : '';
    if (!CAT_LABEL[cat]) return null;
    return {
      text: 'Play a ' + CAT_LABEL[cat] + ' game', goal: 1,
      progress: (d) => d.games.filter((id2) => ((A.get(id2) || {}).category || 'arcade') === cat).length
    };
  }
  function ensureDaily() {
    const day = todayKey();
    if (data.daily && data.daily.day === day) return data.daily;
    const cats = [...new Set(A.games.map((g) => g.category || 'arcade'))].filter((c) => CAT_LABEL[c]);
    const pool = ['three', 'best', 'time', 'versus', 'idea', 'gotd'];
    if (A.games.some((g) => !data.plays[g.id])) pool.push('fresh');
    if (cats.length) pool.push('cat:' + cats[hash('cat' + day) % cats.length]);
    // Seeded shuffle, so everyone on this device gets the same three all day.
    const ranked = pool.map((id) => ({ id, r: hash(day + id) })).sort((a, b) => a.r - b.r).map((x) => x.id);
    data.daily = { day, quests: ranked.slice(0, 3), done: [], games: [], fresh: 0, bests: 0, secs: 0, swept: false };
    return data.daily;
  }
  /* Marks finished quests, returns the XP they earned. */
  function checkQuests() {
    const d = ensureDaily();
    let xp = 0;
    d.quests.forEach((id) => {
      const q = questDef(id);
      if (!q || d.done.includes(id) || q.progress(d) < q.goal) return;
      d.done.push(id);
      xp += 40;
      toast('Daily quest done', q.text + '. +40 XP', 'check');
    });
    if (!d.swept && d.quests.length && d.quests.every((id) => d.done.includes(id))) {
      d.swept = true;
      data.sweeps += 1;
      xp += 60;
      toast('Daily sweep!', 'All three quests done today. +60 XP', 'trophy');
    }
    return xp;
  }
  function questList() {
    const d = ensureDaily();
    return d.quests.map((id) => {
      const q = questDef(id);
      if (!q) return null;
      const done = d.done.includes(id);
      const raw = Math.min(q.goal, q.progress(d));
      const div = q.unit === 'min' ? 60 : 1;
      return { id, text: q.text, done, progress: done ? q.goal / div : Math.floor(raw / div), goal: q.goal / div, unit: q.unit || '' };
    }).filter(Boolean);
  }

  /* ---------- Badges ---------- */
  const triedIds = () => Object.keys(data.plays).filter((id) => A.get(id));
  const playsIn = (cat) => triedIds().filter((id) => (A.get(id).category || 'arcade') === cat)
    .reduce((n, id) => n + data.plays[id], 0);
  const categories = () => [...new Set(A.games.map((g) => g.category || 'arcade'))];

  const ICONS = {
    play: 'M8 5v14l11-7z',
    compass: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm3.5 6.5-2 5-5 2 2-5z',
    map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
    crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
    clock: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 5h-2v6l5 3 1-1.7-4-2.3z',
    star: 'M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z',
    trophy: 'M7 3h10v4a5 5 0 0 1-10 0zM5 4H2v2a4 4 0 0 0 4 4M19 4h3v2a4 4 0 0 1-4 4M10 13h4v4h3v4H7v-4h3z',
    sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 1v3M12 20v3M1 12h3M20 12h3M4 4l2 2M18 18l2 2M4 20l2-2M18 6l2-2',
    moon: 'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11z',
    swords: 'M3 3l9 9M3 3v4M3 3h4M21 3l-9 9M21 3v4M21 3h-4M8 14l-4 4 2 2 4-4M16 14l4 4-2 2-4-4',
    party: 'M3 21l5-14 9 9zM14 3v3M19 6l-2 2M21 11h-3M10 5l1 2',
    heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 5.8-8 11-8 11z',
    screen: 'M3 4h18v12H3zM8 20h8M12 16v4',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    flame: 'M12 2c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-1.5.5-2.5 1.5-3.5C9 11 10 11 10 9c0-2 1-4.5 2-7z',
    check: 'M4 12.5l5 5L20 6.5',
    pad: 'M6 8h12a4 4 0 0 1 4 4v3a3 3 0 0 1-5.4 1.8L15 15H9l-1.6 1.8A3 3 0 0 1 2 15v-3a4 4 0 0 1 4-4zM7 11v3M5.5 12.5h3M16 11.5h.01M18 13.5h.01'
  };

  const BADGES = [
    { id: 'first', icon: 'play', title: 'Press start', desc: 'Play your first game.', test: () => triedIds().length >= 1 },
    { id: 'explorer', icon: 'compass', title: 'Explorer', desc: 'Try 10 different games.', test: () => triedIds().length >= 10 },
    { id: 'tour', icon: 'map', title: 'Tour guide', desc: 'Play a game from every section.',
      test: () => categories().every((c) => playsIn(c) > 0) },
    { id: 'all', icon: 'crown', title: 'Completionist', desc: 'Try every game on PlayRealm.',
      test: () => A.games.length > 0 && A.games.every((g) => data.plays[g.id]) },
    { id: 'marathon', icon: 'clock', title: 'Marathon', desc: 'Play for 30 minutes in total.', test: () => data.time >= 1800 },
    { id: 'best5', icon: 'star', title: 'Personal best', desc: 'Set 5 personal bests.', test: () => data.bests >= 5 },
    { id: 'best20', icon: 'trophy', title: 'Record breaker', desc: 'Set 20 personal bests.', test: () => data.bests >= 20 },
    { id: 'daily3', icon: 'sun', title: 'Daily habit', desc: 'Play the game of the day on 3 different days.',
      test: () => data.dailyDays.length >= 3 },
    { id: 'owl', icon: 'moon', title: 'Night owl', desc: 'Play between midnight and 5 am.', test: () => data.nightOwl },
    { id: 'arena', icon: 'swords', title: 'Arena regular', desc: 'Play 10 battle arena matches.', test: () => playsIn('io') >= 10 },
    { id: 'party', icon: 'party', title: 'Life of the party', desc: 'Play 3 party games.', test: () => playsIn('party') >= 3 },
    { id: 'favs', icon: 'heart', title: 'Collector', desc: 'Add 5 games to your favorites.', test: () => data.favs.length >= 5 },
    { id: 'big', icon: 'screen', title: 'Big screen', desc: 'Play a game in full screen.', test: () => data.bigScreen },
    { id: 'lvl5', icon: 'bolt', title: 'Rising star', desc: 'Reach level 5.', test: () => levelFor(data.xp) >= 5 },
    { id: 'streak3', icon: 'flame', title: 'On a roll', desc: 'Play 3 days in a row.', test: () => data.streakBest >= 3 },
    { id: 'streak7', icon: 'flame', title: 'Full week', desc: 'Play 7 days in a row.', test: () => data.streakBest >= 7 },
    { id: 'sweep', icon: 'check', title: 'Clean sweep', desc: 'Finish all three daily quests in one day.', test: () => data.sweeps >= 1 },
    { id: 'pad', icon: 'pad', title: 'Plugged in', desc: 'Play a game with a controller.', test: () => data.usedPad }
  ];

  /* ---------- Toasts ---------- */
  const toastRoot = document.getElementById('toasts');
  function toast(title, text, icon) {
    if (!toastRoot) return;
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path></path></svg><div><strong></strong><span></span></div>';
    el.querySelector('path').setAttribute('d', ICONS[icon] || ICONS.star);
    el.querySelector('strong').textContent = title;
    el.querySelector('span').textContent = text || '';
    toastRoot.append(el);
    setTimeout(() => el.classList.add('is-leaving'), 3600);
    setTimeout(() => el.remove(), 4000);
  }

  /* Award XP, then announce level-ups and newly unlocked badges. */
  function award(xp) {
    const before = levelFor(data.xp);
    data.xp += Math.max(0, Math.round(xp)) + checkQuests();
    const after = levelFor(data.xp);
    if (after > before) toast('Level ' + after + '!', 'Keep playing to reach level ' + (after + 1) + '.', 'bolt');
    for (const b of BADGES) {
      if (data.badges.includes(b.id)) continue;
      let ok = false;
      try { ok = b.test(); } catch (e) { ok = false; }
      if (ok) {
        data.badges.push(b.id);
        data.xp += 30;
        toast('Badge unlocked: ' + b.title, b.desc + ' +30 XP', b.icon);
      }
    }
    save();
  }

  /* ---------- Session hooks (called by app.js) ---------- */
  function startGame(def) {
    if (session && session.id === def.id) return;
    if (session) stopGame();
    session = { id: def.id, from: Date.now(), secs: 0 };
    const daily = ensureDaily();
    if (!daily.games.includes(def.id)) daily.games.push(def.id);
    if (!data.plays[def.id]) daily.fresh += 1;
    data.plays[def.id] = (data.plays[def.id] || 0) + 1;
    data.recent = [def.id].concat(data.recent.filter((id) => id !== def.id)).slice(0, 8);
    const hour = new Date().getHours();
    if (hour < 5) data.nightOwl = true;
    let xp = 10;
    const pick = dailyPick();
    const day = todayKey();
    xp += touchDay();
    if (pick && pick.id === def.id && !data.dailyDays.includes(day)) {
      data.dailyDays.push(day);
      xp += 50;
      toast('Game of the day!', 'Bonus +50 XP for playing ' + def.title + ' today.', 'sun');
    }
    award(xp);
  }

  /* Time only counts while the game is actually running: pausing closes the current stretch. */
  function creditStretch() {
    if (!session || !session.from) return;
    const now = Date.now();
    const secs = Math.max(0, Math.min(3 * 3600, (now - session.from) / 1000));
    session.from = now;
    session.secs += secs;
    data.time += secs;
    const daily = ensureDaily();
    daily.secs += secs;
    // A session that runs past midnight belongs to the new day too.
    if (!daily.games.includes(session.id)) daily.games.push(session.id);
  }

  function setPaused(paused) {
    if (!session) return;
    if (paused) {
      creditStretch();
      session.from = 0;
      save();
    } else {
      session.from = Date.now();
    }
  }

  function stopGame() {
    if (!session) return;
    creditStretch();
    const total = session.secs;
    session = null;
    award(Math.min(60, Math.floor(total / 10)) + touchDay());
  }

  // Closing the tab mid-game must not lose the time played.
  window.addEventListener('pagehide', () => {
    if (!session) return;
    creditStretch();
    A.store.set(KEY, data);
  });

  function newBest(def) {
    data.bests += 1;
    ensureDaily().bests += 1;
    data.xp += touchDay();
    toast('New best in ' + def.title + '!', '+25 XP', 'star');
    award(25);
  }

  function toggleFav(id) {
    const on = !data.favs.includes(id);
    data.favs = on ? data.favs.concat(id) : data.favs.filter((x) => x !== id);
    award(0);
    return on;
  }

  function markBigScreen() {
    if (data.bigScreen) return;
    data.bigScreen = true;
    award(0);
  }

  function markPad() {
    if (data.usedPad) return;
    data.usedPad = true;
    award(0);
  }

  /* ---------- Profile dialog ---------- */
  const dialog = document.getElementById('profile');

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }

  function render() {
    if (!dialog) return;
    const lvl = levelFor(data.xp);
    const lo = xpForLevel(lvl);
    const hi = xpForLevel(lvl + 1);
    const pct = Math.round(((data.xp - lo) / (hi - lo)) * 100);
    const tried = triedIds().length;
    const totalPlays = Object.values(data.plays).reduce((a, b) => a + b, 0);
    dialog.querySelector('[data-p="level"]').textContent = lvl;
    dialog.querySelector('[data-p="xp"]').textContent = data.xp + ' XP · ' + (hi - data.xp) + ' to level ' + (lvl + 1);
    dialog.querySelector('[data-p="bar"]').style.width = pct + '%';
    dialog.querySelector('[data-p="plays"]').textContent = totalPlays;
    const streakEl = dialog.querySelector('[data-p="streak"]');
    if (streakEl) streakEl.textContent = streakNow() + (data.streakBest > streakNow() ? ' (best ' + data.streakBest + ')' : '');
    const padSwitch = dialog.querySelector('[data-p="touchpad"]');
    if (padSwitch && window.Input) padSwitch.checked = Input.touchOn;
    dialog.querySelector('[data-p="tried"]').textContent = tried + ' / ' + A.games.length;
    dialog.querySelector('[data-p="time"]').textContent = fmtTime(data.time);
    dialog.querySelector('[data-p="bests"]').textContent = data.bests;
    dialog.querySelector('[data-p="badge-count"]').textContent = data.badges.length + ' of ' + BADGES.length;
    const grid = dialog.querySelector('[data-p="badges"]');
    grid.innerHTML = '';
    BADGES.forEach((b) => {
      const on = data.badges.includes(b.id);
      const li = document.createElement('li');
      li.className = 'badge' + (on ? ' is-on' : '');
      li.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path></path></svg><strong></strong><span></span>';
      li.querySelector('path').setAttribute('d', ICONS[b.icon]);
      li.querySelector('strong').textContent = b.title;
      li.querySelector('span').textContent = on ? b.desc : 'Locked · ' + b.desc;
      grid.append(li);
    });
    const auto = dialog.querySelector('[data-p="autofull"]');
    auto.checked = !!data.autoFull;
    const sound = dialog.querySelector('[data-p="sound"]');
    sound.checked = !A.sound.muted;
  }

  if (dialog) {
    dialog.querySelector('[data-p="autofull"]').addEventListener('change', (e) => {
      data.autoFull = e.target.checked;
      save();
    });
    const padSwitch = dialog.querySelector('[data-p="touchpad"]');
    if (padSwitch) {
      padSwitch.addEventListener('change', (e) => {
        if (window.Input) Input.setTouch(e.target.checked);
      });
    }
    dialog.querySelector('[data-p="sound"]').addEventListener('change', (e) => {
      A.sound.setMuted(!e.target.checked);
      save();
    });
    dialog.querySelector('[data-p="reset"]').addEventListener('click', () => {
      if (window.confirm('Reset your level, badges, favorites and history in this browser? This cannot be undone.')) {
        data = blank();
        session = null;
        A.store.set(KEY, data);
        // Hearts, the favorites chip and "Jump back in" all hang off the old data: start clean.
        window.location.reload();
      }
    });
    dialog.querySelector('[data-p="close"]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) dialog.close(); // click on the backdrop
    });
  }

  window.Profile = {
    get level() { return levelFor(data.xp); },
    get xp() { return data.xp; },
    get recent() { return data.recent.filter((id) => A.get(id)); },
    get favs() { return data.favs.filter((id) => A.get(id)); },
    get autoFull() { return !!data.autoFull; },
    get streak() { return streakNow(); },
    get quests() { return questList(); },
    get today() { return todayKey(); },
    setPaused,
    markPad,
    isFav: (id) => data.favs.includes(id),
    toggleFav,
    startGame,
    stopGame,
    newBest,
    markBigScreen,
    dailyPick,
    toast,
    open() {
      if (!dialog) return;
      render();
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    },
    onChange(fn) { listeners.add(fn); }
  };
})();
