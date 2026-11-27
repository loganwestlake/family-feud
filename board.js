(() => {
  const F = window.FFO;
  const { store, FB } = F;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------- optional local keys
  const DEFAULT_KEYS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
     'CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'],
    ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
     'BracketLeft', 'BracketRight', 'Backslash', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter',
     'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
  ];
  const keyLabel = c => c.replace(/^Key|^Digit/, '').replace('Numpad', 'Num ').replace('Arrow', '');

  // ---------------------------------------------------------------- settings / state
  const saved = store.get('settings', {});
  const settings = Object.assign({
    teamNames: ['Team One', 'Team Two'],
    keys: DEFAULT_KEYS.map(k => k.slice()),
    localKeys: false,
    target: 300,
    multipliers: true,
    shuffle: true,
    questionsText: window.SAMPLE_QUESTIONS,
    room: F.randomRoom(),
    pin: F.randomPin(),
  }, saved);
  if (!F.validRoom(settings.room)) settings.room = F.randomRoom();
  if (!F.validPin(settings.pin)) settings.pin = F.randomPin();
  delete settings.fbConfig;
  if (saved.fbConfig && !store.get('fbConfig', '')) store.set('fbConfig', saved.fbConfig);
  // Pick up the bigger built-in question list if the host never edited the questions.
  if (!saved.questionsEdited) settings.questionsText = window.SAMPLE_QUESTIONS;

  function parseQuestions(txt) {
    return String(txt || '').split(/\n\s*\n/)
      .map(b => b.split('\n').map(s => s.trim()).filter(Boolean))
      .filter(lines => lines.length > 1)
      .map(lines => ({
        q: lines[0],
        a: lines.slice(1).map(l => {
          const m = l.match(/^(.*?)\s*[|,]\s*(\d+)\s*$/);
          return m ? { text: m[1], pts: +m[2] } : { text: l, pts: 0 };
        }).sort((x, y) => y.pts - x.pts).slice(0, 8),
      }));
  }
  let questions = parseQuestions(settings.questionsText);

  const makeOrder = () => {
    const o = questions.map((_, i) => i);
    if (settings.shuffle) for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
    return o;
  };
  const freshRound = () => ({ revealed: [], banked: [], strikes: [0, 0], bank: 0, bankOpen: true, armed: false, ready: false, armId: null, buzz: null, control: null });
  const newGame = () => Object.assign({ scores: [0, 0], round: 0, winner: null, order: makeOrder(), mode: 'main', lg: null }, freshRound());
  let state = Object.assign(newGame(), store.get('state', {}));
  if (!Array.isArray(state.order) || state.order.length !== questions.length) state.order = makeOrder();
  state.round = Math.min(state.round, Math.max(0, questions.length - 1));
  if (!Array.isArray(state.strikes)) state.strikes = [0, 0];
  const qAt = r => questions[state.order[r]];

  const mult = r => !settings.multipliers ? 1 : r < 3 ? 1 : r === 3 ? 2 : 3;
  const multName = m => ['', 'Single', 'Double', 'Triple'][m] + ' points';
  const save = () => { store.set('state', state); store.set('settings', settings); };

  // ---------------------------------------------------------------- sound (synthesized, no files)
  const Sound = (() => {
    let ctx;
    function tone(freq, dur, type = 'sine', vol = 0.3, when = 0) {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.05);
      } catch {}
    }
    return {
      ding() { tone(1568, 0.9, 'sine', 0.35); tone(2093, 1.1, 'sine', 0.2, 0.08); tone(784, 0.6, 'triangle', 0.15); },
      strike() { tone(98, 0.9, 'sawtooth', 0.35); tone(104, 0.9, 'square', 0.2); tone(147, 0.9, 'sawtooth', 0.12); },
      buzz(team) { const f = team ? 740 : 554; tone(f, 0.12, 'square', 0.25); tone(f, 0.35, 'square', 0.25, 0.14); },
      bank() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.3, i * 0.09)); tone(1319, 0.8, 'triangle', 0.3, 0.38); },
      win() { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, 'square', 0.15, i * 0.14)); tone(1047, 1.4, 'triangle', 0.3, 1.0); },
      intro() { [262, 330, 392, 523, 392, 523, 659, 784].forEach((f, i) => tone(f, 0.22, 'triangle', 0.25, i * 0.11)); },
      join() { tone(880, 0.15, 'sine', 0.2); tone(1320, 0.25, 'sine', 0.2, 0.1); },
      go() { tone(988, 0.12, 'square', 0.18); tone(1319, 0.2, 'square', 0.18, 0.1); },
      tick() { tone(1200, 0.06, 'square', 0.12); },
      timeUp() { tone(196, 1.1, 'sawtooth', 0.3); tone(201, 1.1, 'square', 0.18); },
      dup() { tone(160, 0.22, 'square', 0.3); tone(160, 0.3, 'square', 0.3, 0.28); },
      zero() { tone(130, 0.5, 'sawtooth', 0.25); },
    };
  })();

  // ---------------------------------------------------------------- ambient: marquee bulbs
  // Built once. Two layers of lit bulbs take turns via a CSS opacity animation, which the
  // graphics chip handles on its own, so it costs the (slow) TV processor almost nothing.
  function layBulbs(box) {
    const w = box.clientWidth, h = box.clientHeight, gap = Math.max(18, innerHeight * 0.026);
    const pts = [];
    const nx = Math.max(2, Math.round(w / gap)), ny = Math.max(2, Math.round(h / gap));
    for (let i = 0; i < nx; i++) pts.push([i / nx * w, 0]);
    for (let i = 0; i < ny; i++) pts.push([w, i / ny * h]);
    for (let i = 0; i < nx; i++) pts.push([w - i / nx * w, h]);
    for (let i = 0; i < ny; i++) pts.push([0, h - i / ny * h]);
    const layers = ['base', 'lit a', 'lit b'].map(c => { const d = document.createElement('div'); d.className = 'layer ' + c; return d; });
    pts.forEach(([x, y], i) => {
      const put = layer => { const el = document.createElement('i'); el.style.left = x + 'px'; el.style.top = y + 'px'; layer.appendChild(el); };
      put(layers[0]); put(layers[1 + (i % 2)]);
    });
    box.replaceChildren(...layers);
  }
  const layAllBulbs = () => $$('.bulbs').forEach(layBulbs);
  let flashTimer;
  function flashBulbs(ms) {
    document.body.classList.add('flash');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => document.body.classList.remove('flash'), ms);
  }
  let resizeTimer;
  addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layAllBulbs, 250); });

  // Smoothly count a number up/down to its new value.
  const shown = new WeakMap();
  function countTo(el, to) {
    const from = shown.has(el) ? shown.get(el) : to;
    shown.set(el, to);
    if (from === to) { el.textContent = to; return; }
    el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
    const t0 = performance.now(), dur = 450;
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (k < 1 && shown.get(el) === to) requestAnimationFrame(step);
    })(t0);
  }

  // ---------------------------------------------------------------- main board rendering
  let builtKey = '';
  function buildBoard() {
    const q = qAt(state.round);
    const key = state.round + '|' + JSON.stringify(q);
    if (key === builtKey) return;
    builtKey = key;
    const board = $('#board');
    board.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const a = q && q.a[i];
      const t = document.createElement('div');
      t.className = 'tile' + (a ? '' : ' empty');
      t.dataset.i = i;
      t.innerHTML = `<div class="inner"><div class="face front"><span class="no">${i + 1}</span></div>
        <div class="face back"><span class="txt"></span><span class="pts"></span></div></div>`;
      if (a) {
        t.querySelector('.txt').textContent = a.text;
        t.querySelector('.pts').textContent = a.pts;
        t.addEventListener('click', () => exec({ t: 'reveal', i }));
      }
      board.appendChild(t);
    }
  }

  let players = {};
  const teamPlayers = t => Object.values(players).filter(p => p && p.team === t);

  function render() {
    document.body.className = 'mode-' + state.mode;
    if (state.mode === 'lightning') renderLightning(); else renderMain();
    renderLobby();
    if (state.winner != null) showWinner(settings.teamNames[state.winner]);
    else if (!(state.lg && state.lg.won === true && state.mode === 'lightning')) $('#winOverlay').classList.remove('show');
    publish();
  }

  function renderMain() {
    const q = qAt(state.round);
    buildBoard();
    $$('#board .tile').forEach((t, i) => t.classList.toggle('revealed', !!state.revealed[i]));
    $('#question span').textContent = q ? q.q : 'Add some questions in Setup';
    $('#roundInfo').textContent = `Round ${state.round + 1} of ${questions.length}`;
    const m = mult(state.round);
    $('#multInfo').textContent = multName(m);
    $('#multInfo').classList.toggle('hot', m > 1);
    countTo($('#bank'), state.bank);

    [0, 1].forEach(t => {
      const el = $('#team' + t);
      el.querySelector('.name').textContent = settings.teamNames[t];
      countTo(el.querySelector('.score'), liveScore(t));
      el.querySelectorAll('.xs span').forEach((x, i) => x.classList.toggle('on', i < state.strikes[t]));
      el.classList.toggle('control', state.control === t);
      el.classList.toggle('buzzed', !!state.buzz && state.buzz.team === t);
      const n = teamPlayers(t).length;
      el.querySelector('.keys').textContent = fbOn
        ? (n ? `${n} buzzer${n > 1 ? 's' : ''} connected` : 'No buzzer connected')
        : (settings.localKeys ? (t === 0 ? 'Buzz: left side of keyboard' : 'Buzz: right side of keyboard') : '');
      $$('.tn' + t).forEach(s => (s.textContent = settings.teamNames[t]));
    });

    const bs = $('#buzzStatus');
    bs.classList.toggle('armed', state.armed || state.ready);
    if (state.ready) bs.textContent = 'Get ready… hands off!';
    else if (state.armed) bs.textContent = '⚡ BUZZ! Buzz in now!';
    else if (state.buzz) {
      const who = state.buzz.player ? ` (${state.buzz.player})` : '';
      const late = state.buzz.lateBy != null ? `. ${settings.teamNames[1 - state.buzz.team]} was ${(state.buzz.lateBy / 1000).toFixed(3)}s late` : '';
      bs.textContent = `${settings.teamNames[state.buzz.team]}${who} buzzed first${late}`;
    } else bs.textContent = state.control != null ? `${settings.teamNames[state.control]} has control` : 'Buzzers locked. Arm them for the face-off';
  }

  // Round points belong to whichever team has control; they lock in when the round changes.
  const liveScore = t => state.scores[t] + (state.control === t ? state.bank : 0);
  function commitRound() {
    if (state.control != null) state.scores[state.control] += state.bank;
    state.bank = 0; state.banked = []; state.bankOpen = false;
  }
  function checkWin() {
    if (settings.target > 0 && state.winner == null && state.control != null && liveScore(state.control) >= settings.target) {
      state.winner = state.control; setTimeout(Sound.win, 700);
    }
  }

  // ---------------------------------------------------------------- overlays
  let xTimer;
  function showX(n) {
    const o = $('#strikeOverlay');
    o.innerHTML = '<b>✕</b>'.repeat(n);
    o.classList.add('show');
    clearTimeout(xTimer);
    xTimer = setTimeout(() => o.classList.remove('show'), 1400);
  }
  let bTimer;
  function showBuzz(team, player) {
    const o = $('#buzzBanner');
    o.style.setProperty('--c', `var(--team${team})`);
    o.querySelector('.who').textContent = settings.teamNames[team];
    o.querySelector('.player').textContent = player || '';
    o.classList.add('show');
    flashBulbs(1500);
    clearTimeout(bTimer);
    bTimer = setTimeout(() => o.classList.remove('show'), 2200);
  }
  let rTimer;
  function showCard(big, small) {
    const o = $('#roundCard');
    o.querySelector('.r').textContent = big;
    o.querySelector('.m').textContent = small;
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
    flashBulbs(1200);
    clearTimeout(rTimer);
    rTimer = setTimeout(() => o.classList.remove('show'), 1900);
  }
  const showRoundCard = () => showCard(`Round ${state.round + 1}`, multName(mult(state.round)));
  let shownWinner = null;
  function showWinner(title, sub = 'And the winner is') {
    const o = $('#winOverlay');
    o.querySelector('.who').textContent = title;
    o.querySelector('.sub').textContent = sub;
    if (o.classList.contains('show') && shownWinner === title) return;
    shownWinner = title;
    o.classList.add('show');
    flashBulbs(4000);
    const colors = ['#f7c548', '#ff5a4e', '#1fd1c1', '#fff8e7', '#1f5bff'];
    for (let i = 0; i < 50; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[i % colors.length];
      c.style.animationDuration = 2 + Math.random() * 3 + 's';
      c.style.animationDelay = Math.random() * 1.5 + 's';
      o.appendChild(c);
      setTimeout(() => c.remove(), 7000);
    }
  }
  $('#winOverlay').addEventListener('click', () => exec({ t: 'dismissWin' }));

  // ---------------------------------------------------------------- Lightning Round
  // Two players answer the same 5 questions against the clock. Player 2 can't repeat
  // player 1's answers. Reveal each answer for points; together they need 200.
  const LG_GOAL = 200;
  const newLightning = () => {
    const pool = questions.map((_, i) => i).filter(i => i !== state.order[state.round]);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    return { qs: pool.slice(0, 5), player: 1, ans: { 1: [0, 0, 0, 0, 0].map(() => false), 2: [0, 0, 0, 0, 0].map(() => false) },
      rev: { 1: [false, false, false, false, false], 2: [false, false, false, false, false] }, showP1: true,
      timerLeft: 20, timerTotal: 20, running: false, dup: null, won: false };
  };
  const lgTotal = lg => [1, 2].reduce((sum, p) => sum + lg.ans[p].reduce((s, a, i) => s + (a && lg.rev[p][i] ? a.pts : 0), 0), 0);

  let lgBuilt = '';
  function renderLightning() {
    const lg = state.lg;
    if (!lg) return;
    const board = $('#lgBoard');
    if (lgBuilt !== JSON.stringify(lg.qs)) {
      lgBuilt = JSON.stringify(lg.qs);
      board.innerHTML = '';
      for (let i = 0; i < 5; i++) for (const p of [1, 2]) {
        const cell = document.createElement('div');
        cell.className = 'lg-cell'; cell.dataset.p = p; cell.dataset.i = i;
        cell.innerHTML = '<div class="ans"></div><div class="pts"></div>';
        board.appendChild(cell);
      }
      // rows alternate p1/p2 so the grid reads as two columns
    }
    $$('#lgBoard .lg-cell').forEach(cell => {
      const p = +cell.dataset.p, i = +cell.dataset.i, a = lg.ans[p][i], r = lg.rev[p][i];
      const covered = p === 1 && !lg.showP1;
      cell.classList.toggle('covered', covered);
      const ans = cell.querySelector('.ans'), pts = cell.querySelector('.pts');
      const txt = a && r ? a.text : '', pt = a && r ? String(a.pts) : '';
      if (ans.textContent !== txt) { ans.textContent = txt; if (txt) { ans.classList.remove('pop'); void ans.offsetWidth; ans.classList.add('pop'); } }
      if (pts.textContent !== pt) { pts.textContent = pt; if (pt) { pts.classList.remove('pop'); void pts.offsetWidth; pts.classList.add('pop'); } }
    });
    countTo($('#lgTotal'), lgTotal(lg));
    $('#lgGoal').textContent = `Goal: ${LG_GOAL}`;
    $('#lgPlayer').textContent = `Player ${lg.player}`;
    $('#lgTime').textContent = lg.timerLeft;
    const ring = $('#lgTimer .ring');
    ring.style.strokeDashoffset = String(276.5 * (1 - lg.timerLeft / (lg.timerTotal || 1)));
    $('#lgTimer').classList.toggle('low', lg.running && lg.timerLeft <= 5);
    if (lg.won === true) showWinner(`${lgTotal(lg)} points!`, 'Lightning Round winners');
  }

  let lgInterval = null;
  function lgTimer(seconds) {
    const lg = state.lg;
    clearInterval(lgInterval);
    if (!seconds) { lg.running = false; return; }
    lg.timerTotal = seconds; lg.timerLeft = seconds; lg.running = true;
    lgInterval = setInterval(() => {
      if (!state.lg || !state.lg.running) { clearInterval(lgInterval); return; }
      state.lg.timerLeft = Math.max(0, state.lg.timerLeft - 1);
      if (state.lg.timerLeft <= 5 && state.lg.timerLeft > 0) Sound.tick();
      if (state.lg.timerLeft === 0) { state.lg.running = false; clearInterval(lgInterval); Sound.timeUp(); flashBulbs(1500); }
      save(); render();
    }, 1000);
  }

  function lgCommand(c) {
    if (c.t === 'lgNew') {
      state.lg = newLightning(); state.mode = 'lightning'; lgBuilt = '';
      clearInterval(lgInterval); $('#winOverlay').classList.remove('show'); shownWinner = null;
      showCard('Lightning Round', `Two players, five questions, ${LG_GOAL} points to win`);
      Sound.intro();
      requestAnimationFrame(layAllBulbs);
      return true;
    }
    const lg = state.lg;
    if (!lg) return false;
    const p = +(c.p || lg.player), i = +c.q;
    switch (c.t) {
      case 'lgPlayer':
        lg.player = p; lg.showP1 = p === 1; clearInterval(lgInterval);
        lg.running = false; lg.timerTotal = lg.timerLeft = p === 1 ? 20 : 25; lg.dup = null;
        break;
      case 'lgTimer': lgTimer(+c.s); break;
      case 'lgAnswer': {
        if (!(i >= 0 && i < 5)) return false;
        const q = questions[lg.qs[i]];
        const a = +c.a;
        const rec = a >= 0 && q.a[a] ? { text: q.a[a].text, pts: q.a[a].pts, a } : { text: String(c.text || 'No answer').slice(0, 40), pts: 0, a: -1 };
        if (p === 2) {
          const first = lg.ans[1][i];
          if (first && ((rec.a >= 0 && first.a === rec.a) || (rec.a < 0 && first.text.toLowerCase() === rec.text.toLowerCase() && rec.text !== 'No answer'))) {
            lg.dup = { q: i, n: Date.now() }; Sound.dup();
            break;
          }
        }
        lg.dup = null;
        lg.ans[p][i] = rec; lg.rev[p][i] = false;
        break;
      }
      case 'lgClear': lg.ans[p][i] = false; lg.rev[p][i] = false; break;
      case 'lgReveal': {
        // Reveal the given row, or the next answered row that is still hidden.
        let k = c.q != null ? i : lg.ans[p].findIndex((a, j) => a && !lg.rev[p][j]);
        if (k < 0 || !lg.ans[p][k]) return false;
        if (p === 2) lg.showP1 = true;
        lg.rev[p][k] = true;
        lg.ans[p][k].pts > 0 ? Sound.ding() : Sound.zero();
        if (!lg.won && lgTotal(lg) >= LG_GOAL) { lg.won = true; setTimeout(Sound.win, 600); }
        break;
      }
      case 'lgShowP1': lg.showP1 = !!c.v; break;
      default: return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- game commands
  let readyTimer = null;
  function arm() {
    clearTimeout(readyTimer);
    state.armed = false;
    state.ready = true;
    state.buzz = null;
    state.armId = F.randomId();
    presses = [];
    fbReady();
    const armId = state.armId, wait = 1200 + Math.random() * 1600;
    readyTimer = setTimeout(() => {
      if (!state.ready || state.armId !== armId) return;
      state.ready = false; state.armed = true;
      fbArm(); Sound.go();
      save(); render();
    }, wait);
  }
  function lockBuzzers() {
    clearTimeout(readyTimer);
    state.ready = false;
    state.armed = false;
    if (fbOn) FB.ref('buzz').set({ armed: false, armId: state.armId || null }).catch(fbError);
  }
  function exec(c) {
    const q = qAt(state.round);
    if (c.t && c.t.startsWith('lg')) { if (!lgCommand(c)) return; save(); render(); return; }
    switch (c.t) {
      case 'mode':
        state.mode = c.m === 'lightning' && state.lg ? 'lightning' : 'main';
        clearInterval(lgInterval); if (state.lg) state.lg.running = false;
        $('#winOverlay').classList.remove('show'); shownWinner = null;
        if (state.mode === 'main') { showRoundCard(); requestAnimationFrame(layAllBulbs); }
        break;
      case 'arm': arm(); break;
      case 'reveal': {
        const i = +c.i;
        if (!q || !q.a[i]) return;
        if (state.revealed[i]) {
          state.revealed[i] = false;
          if (state.banked[i]) { state.bank -= state.banked[i]; state.banked[i] = 0; }
        } else {
          state.revealed[i] = true;
          Sound.ding(); flashBulbs(500);
          if (state.bankOpen) { const p = q.a[i].pts * mult(state.round); state.banked[i] = p; state.bank += p; }
        }
        checkWin();
        break;
      }
      case 'revealAll':
        if (!q) return;
        q.a.forEach((_, i) => { state.revealed[i] = true; });
        state.bankOpen = false; Sound.ding(); break;
      case 'strike': {
        const t = c.team != null && c.team !== '' ? +c.team : state.control;
        if (t !== 0 && t !== 1) { showX(1); Sound.strike(); break; }
        state.strikes[t] = Math.min(3, state.strikes[t] + 1);
        showX(state.strikes[t]); Sound.strike();
        if (state.strikes[t] === 3 && state.control === t) {
          const other = 1 - t;
          setTimeout(() => showCard('Steal!', `${settings.teamNames[other]}: one guess to steal ${state.bank} points`), 1500);
        }
        break;
      }
      case 'x1':
        showX(1); Sound.strike(); break;
      case 'clearStrikes':
        state.strikes = [0, 0]; break;
      case 'control': {
        // The round's points move with control (face-off won by the other team, or a steal).
        const t = +c.team;
        if (state.control !== t && state.bank > 0) { Sound.bank(); flashBulbs(900); }
        state.control = t; if (state.armed || state.ready) lockBuzzers();
        checkWin();
        break;
      }
      case 'award': {
        // Older remotes: give the round to this team right now.
        state.control = +c.team; commitRound();
        if (state.armed || state.ready) lockBuzzers();
        Sound.bank(); flashBulbs(1200); checkWin();
        break;
      }
      case 'adjust':
        state.scores[+c.team] = Math.max(0, state.scores[+c.team] + (+c.d || 0)); break;
      case 'next':
        if (state.round >= questions.length - 1) return;
        commitRound(); state.round++; Object.assign(state, freshRound()); arm(); showRoundCard(); break;
      case 'prev':
        if (state.round <= 0) return;
        commitRound(); state.round--; Object.assign(state, freshRound()); arm(); showRoundCard(); break;
      case 'resetRound':
        Object.assign(state, freshRound()); arm(); break;
      case 'newGame':
      case 'reset':
        clearInterval(lgInterval);
        state = newGame(); shownWinner = null; $('#winOverlay').classList.remove('show');
        arm(); showCard('New game', 'Scores reset. Good luck!'); break;
      case 'dismissWin':
        state.winner = null; if (state.lg) state.lg.won = state.lg.won ? 'seen' : false;
        $('#winOverlay').classList.remove('show'); shownWinner = null; break;
      default: return;
    }
    save(); render();
  }

  // ---------------------------------------------------------------- buzzing
  // With Firebase, the database decides who was first: every buzzer runs a transaction that only
  // succeeds while buzz/armed is true for the current armId, so exactly one team can claim it.
  let presses = [];
  function winnerDecided(team, player) {
    if (!state.armed) return;
    state.armed = false;
    state.buzz = { team, player: player || '', lateBy: null };
    state.control = team; // points from now on go to the team that buzzed in
    Sound.buzz(team);
    showBuzz(team, player);
    computeLate();
    save(); render();
  }
  function computeLate() {
    if (!state.buzz || state.buzz.lateBy != null) return;
    const first = t => Math.min(...presses.filter(p => p.team === t).map(p => p.at));
    const w = first(state.buzz.team), o = first(1 - state.buzz.team);
    if (isFinite(w) && isFinite(o)) { state.buzz.lateBy = Math.max(0, o - w); save(); render(); }
  }
  let localFirstAt = 0;
  const localLock = [0, 0];
  function localBuzz(team) {
    const t0 = Date.now();
    if (!state.armed && !state.buzz) { localLock[team] = t0 + 2000; return; } // pressed early: locked 2 s
    if (t0 < localLock[team]) { localLock[team] = t0 + 2000; return; }
    if (fbOn) {
      if (!state.armed) return;
      const armId = state.armId;
      FB.ref('presses').push({ team, armId, at: FB.TS }).catch(fbError);
      FB.ref('buzz').transaction(cur => (cur && cur.armed && cur.armId === armId)
        ? { armed: false, armId, team, player: 'TV keyboard', at: Date.now() }
        : undefined).catch(fbError);
      return;
    }
    const now = performance.now();
    if (state.armed) { localFirstAt = now; winnerDecided(team, ''); }
    else if (state.buzz && state.buzz.team !== team && state.buzz.lateBy == null && now - localFirstAt < 3000) {
      state.buzz.lateBy = Math.round(now - localFirstAt); save(); render();
    }
  }

  // ---------------------------------------------------------------- keyboard
  let learning = null;
  const teamFor = code => settings.keys[0].includes(code) ? 0 : settings.keys[1].includes(code) ? 1 : null;
  window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (learning !== null) {
      e.preventDefault();
      const other = 1 - learning;
      settings.keys[other] = settings.keys[other].filter(k => k !== e.code);
      if (!settings.keys[learning].includes(e.code)) settings.keys[learning].push(e.code);
      showKeys();
      return;
    }
    if ($('#setup').open || !settings.localKeys || state.mode !== 'main') return;
    const team = teamFor(e.code);
    if (team === null) return;
    e.preventDefault();
    if (!e.repeat) localBuzz(team);
  });

  // ---------------------------------------------------------------- controls
  $$('#controls [data-cmd]').forEach(b => b.addEventListener('click', () => {
    exec({ t: b.dataset.cmd, team: b.dataset.team, s: b.dataset.s, p: b.dataset.p, m: b.dataset.m });
    b.blur();
  }));
  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock();
    } catch {}
  }
  $('#fsBtn').addEventListener('click', e => { e.target.blur(); document.fullscreenElement ? document.exitFullscreen() : goFullscreen(); });
  $('#startBtn').addEventListener('click', () => {
    $('#lobby').classList.add('hidden');
    Sound.intro(); goFullscreen();
    requestAnimationFrame(layAllBulbs);
    if (state.mode === 'main') {
      if (!state.armed && !state.ready && !state.buzz) arm();
      showRoundCard();
    }
    save(); render();
  });
  const openRules = () => { const r = $('#rules'); if (!r.querySelector('iframe').src) r.querySelector('iframe').src = 'rules.html?v=9&embed=1'; r.classList.add('show'); };
  $('#rulesBtn').addEventListener('click', e => { e.target.blur(); openRules(); });
  $('#lobbyRules').addEventListener('click', openRules);
  $('#rulesClose').addEventListener('click', () => $('#rules').classList.remove('show'));
  $('#lobbyBtn').addEventListener('click', e => { e.target.blur(); $('#lobby').classList.remove('hidden'); });
  $('#lobbySetup').addEventListener('click', openSetup);
  $('#setupBtn').addEventListener('click', openSetup);

  // ---------------------------------------------------------------- lobby
  let pinVisible = false;
  $('#pinToggle').addEventListener('click', e => { pinVisible = !pinVisible; e.target.textContent = pinVisible ? 'Hide PIN' : 'Show PIN'; renderLobby(); });
  const qrCache = {};
  function qr(el, text, size) {
    if (!window.QRCode || qrCache[el.id] === text) return;
    qrCache[el.id] = text; el.innerHTML = '';
    new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.L });
  }
  function renderLobby() {
    const buzzUrl = F.siteUrl('buzzer.html'), remoteUrl = F.siteUrl('remote/');
    $('#joinUrl').textContent = buzzUrl.replace(/^https?:\/\//, '');
    $('#remoteUrl').textContent = remoteUrl.replace(/^https?:\/\//, '');
    $('#roomCode').textContent = settings.room;
    $('#pinCode').textContent = pinVisible ? settings.pin : '••••';
    $('#pinCode').classList.toggle('masked', !pinVisible);
    // QR codes on the TV carry only the room code; the PIN is typed.
    qr($('#joinQr'), buzzUrl + '#room=' + settings.room, 200);
    qr($('#remoteQr'), remoteUrl + '#room=' + settings.room, 200);
    [0, 1].forEach(t => {
      $('#lt' + t + ' .ltName').textContent = settings.teamNames[t];
      const box = $('#lt' + t + ' .ltPlayers');
      box.innerHTML = '';
      const list = teamPlayers(t);
      if (!list.length) box.innerHTML = '<div class="none">Waiting for a buzzer to join</div>';
      list.forEach(p => { const d = document.createElement('div'); d.className = 'pl'; d.textContent = p.name || 'Buzzer'; box.appendChild(d); });
    });
  }

  // ---------------------------------------------------------------- setup dialog
  function showKeys() {
    [0, 1].forEach(t => {
      const el = $('#keys' + t);
      el.innerHTML = settings.keys[t].length ? '' : '<i>No keys yet. Click Learn keys</i>';
      settings.keys[t].forEach(k => { const kb = document.createElement('kbd'); kb.textContent = keyLabel(k); el.appendChild(kb); });
      el.classList.toggle('learning', learning === t);
    });
    $$('[data-learn]').forEach(b => (b.textContent = learning === +b.dataset.learn ? 'Done' : 'Learn keys'));
  }
  $$('[data-learn]').forEach(b => b.addEventListener('click', () => {
    const t = +b.dataset.learn;
    if (learning === t) learning = null; else { learning = t; settings.keys[t] = []; }
    b.blur(); showKeys();
  }));
  $$('[data-defaults]').forEach(b => b.addEventListener('click', () => { settings.keys = DEFAULT_KEYS.map(k => k.slice()); learning = null; showKeys(); }));
  $('#sampleBtn').addEventListener('click', () => { $('#questionsText').value = window.SAMPLE_QUESTIONS; });
  const RESET_Q = 'Reset the whole game? Scores go back to 0 and the questions are reshuffled.';
  $('#newGameBtn').addEventListener('click', () => { if (confirm(RESET_Q)) exec({ t: 'reset' }); });
  $('#resetBtn').addEventListener('click', e => { e.target.blur(); if (confirm(RESET_Q)) exec({ t: 'reset' }); });
  $('#newCodesBtn').addEventListener('click', () => { $('#room').value = F.randomRoom(); $('#pin').value = F.randomPin(); updateHostQr(); });
  $('#room').addEventListener('input', e => { e.target.value = F.cleanRoom(e.target.value); updateHostQr(); });
  $('#pin').addEventListener('input', e => { e.target.value = F.cleanPin(e.target.value); updateHostQr(); });
  function updateHostQr() {
    const room = $('#room').value, pin = $('#pin').value;
    if (!F.validRoom(room) || !F.validPin(pin)) { $('#qr').innerHTML = ''; qrCache.qr = ''; return; }
    // Only shown inside Setup: this one carries the PIN (in the #fragment, never sent to a server).
    qr($('#qr'), F.siteUrl('remote/') + '#' + F.enc({ r: room, p: pin }), 150);
  }

  let atOpen = '';
  function openSetup() {
    $('#room').value = settings.room;
    $('#pin').value = settings.pin;
    $('#tName0').value = settings.teamNames[0];
    $('#tName1').value = settings.teamNames[1];
    $('#target').value = settings.target;
    $('#multipliers').checked = settings.multipliers;
    $('#shuffle').checked = settings.shuffle;
    $('#localKeys').checked = settings.localKeys;
    $('#questionsText').value = settings.questionsText;
    $('#fbConfig').value = store.get('fbConfig', '');
    atOpen = JSON.stringify([settings.room, settings.pin, store.get('fbConfig', '')]);
    learning = null; showKeys(); updateHostQr();
    $('#setup').showModal();
  }
  function closeSetup() {
    const room = F.cleanRoom($('#room').value), pin = F.cleanPin($('#pin').value);
    if (!F.validRoom(room) || !F.validPin(pin)) { alert('The room code needs 4 letters and the PIN needs 4 digits.'); return; }
    learning = null;
    settings.room = room; settings.pin = pin;
    settings.teamNames = [$('#tName0').value.trim() || 'Team One', $('#tName1').value.trim() || 'Team Two'];
    settings.target = Math.max(0, parseInt($('#target').value, 10) || 0);
    settings.multipliers = $('#multipliers').checked;
    settings.shuffle = $('#shuffle').checked;
    settings.localKeys = $('#localKeys').checked;
    if ($('#questionsText').value !== settings.questionsText) {
      settings.questionsText = $('#questionsText').value;
      settings.questionsEdited = settings.questionsText !== window.SAMPLE_QUESTIONS;
      questions = parseQuestions(settings.questionsText);
      state.order = makeOrder();
      state.round = Math.min(state.round, Math.max(0, questions.length - 1));
      Object.assign(state, freshRound());
      builtKey = ''; state.lg = null; state.mode = 'main';
    }
    store.set('fbConfig', $('#fbConfig').value.trim());
    save();
    $('#setup').close();
    if (JSON.stringify([settings.room, settings.pin, store.get('fbConfig', '')]) !== atOpen) { location.reload(); return; }
    render();
  }
  $('#closeSetup').addEventListener('click', closeSetup);
  $('#setup').addEventListener('cancel', e => { e.preventDefault(); closeSetup(); });

  // ---------------------------------------------------------------- firebase
  let fbOn = false;
  function setConn(cls, text) {
    const c = $('#conn');
    c.className = cls; c.querySelector('span').textContent = text;
    $('#fbStatus').textContent = text;
  }
  const RULES = JSON.stringify({ rules: { '.read': false, '.write': false, games: { $game: {
    '.read': '$game.matches(/^[A-Z]{4}-[0-9]{4}$/)', '.write': '$game.matches(/^[A-Z]{4}-[0-9]{4}$/)' } } } }, null, 2);
  let rulesHelpShown = false;
  function fbError(e) {
    const msg = F.friendlyError(e);
    setConn('err', msg);
    if (!/permission/i.test(msg)) { $('#lobbyMsg').textContent = '⚠ ' + msg; return; }
    if (rulesHelpShown) return;
    rulesHelpShown = true;
    const cfg = F.getConfig() || {};
    const url = `https://console.firebase.google.com/project/${cfg.projectId}/database/${cfg.projectId}-default-rtdb/rules`;
    const box = $('#lobbyMsg');
    box.innerHTML = `⚠ Firebase is blocking the game. One-time fix: <b>1.</b> <button class="mini" id="copyRules">Copy the rules</button>
      <b>2.</b> <a id="rulesLink" target="_blank">Open the Firebase rules page</a>, select everything there, paste, click <b>Publish</b>.
      <b>3.</b> Reload this page.`;
    $('#rulesLink').href = url;
    $('#copyRules').onclick = async ev => {
      try { await navigator.clipboard.writeText(RULES); ev.target.textContent = 'Copied ✓'; }
      catch { prompt('Copy these rules:', RULES); }
    };
    $('#lobby').classList.remove('hidden');
  }
  function fbStart() {
    const err = FB.init(F.getConfig());
    if (err === 'NO_CONFIG') { setConn('err', 'Firebase not set up'); return; }
    if (err) { fbError(err); return; }
    FB.join(settings.room, settings.pin);
    fbOn = true;
    setConn('', 'Connecting… room ' + settings.room);
    FB.onConnected(on => setConn(on ? 'on' : '', (on ? 'Live, room ' : 'Reconnecting… room ') + settings.room));
    FB.ref('buzz').on('value', s => {
      const b = s.val();
      if (b && b.armed === false && b.team != null && b.armId === state.armId) winnerDecided(+b.team, b.player);
    }, fbError);
    FB.ref('presses').on('child_added', s => {
      const p = s.val();
      if (p && p.armId === state.armId && typeof p.at === 'number') { presses.push(p); computeLate(); }
    });
    let known = 0;
    FB.ref('players').on('value', s => {
      players = s.val() || {};
      const n = Object.keys(players).length;
      if (n > known) Sound.join();
      known = n; render();
    });
    FB.ref('commands').on('child_added', snap => {
      const c = snap.val();
      snap.ref.remove();
      if (c && c.t && Date.now() - (c.ts || 0) < 60000) exec(c);
    });
    if (state.armed || state.ready) arm(); else lockBuzzers();
    save(); publish();
  }
  function publish() {
    if (!fbOn) return;
    const q = qAt(state.round);
    const lg = state.lg;
    const snapshot = F.clean({
      mode: state.mode,
      teamNames: settings.teamNames,
      scores: [liveScore(0), liveScore(1)],
      round: state.round,
      totalRounds: questions.length,
      multiplier: mult(state.round),
      target: settings.target,
      question: q ? q.q : '',
      answers: q ? q.a.map((a, i) => ({ text: a.text, pts: a.pts, revealed: !!state.revealed[i] })) : [],
      strikes: state.strikes,
      bank: state.bank,
      armed: state.armed,
      ready: !!state.ready,
      control: state.control,
      buzz: state.buzz,
      winner: state.winner,
      lightning: lg ? {
        player: lg.player, timerLeft: lg.timerLeft, running: lg.running, showP1: lg.showP1, goal: LG_GOAL, total: lgTotal(lg),
        dup: lg.dup || false, won: !!lg.won,
        rows: lg.qs.map((qi, i) => ({
          q: questions[qi].q,
          choices: questions[qi].a.map(a => ({ text: a.text, pts: a.pts })),
          p1: lg.ans[1][i] || false, p2: lg.ans[2][i] || false, r1: lg.rev[1][i], r2: lg.rev[2][i],
        })),
      } : false,
    });
    snapshot.updated = FB.TS;
    FB.ref('state').set(snapshot).catch(fbError);
  }
  function fbReady() {
    if (!fbOn) return;
    FB.ref('presses').remove();
    FB.ref('buzz').set({ armed: false, ready: true, armId: state.armId, round: state.round }).catch(fbError);
  }
  function fbArm() {
    if (!fbOn) return;
    FB.ref('buzz').set({ armed: true, armId: state.armId, round: state.round }).catch(fbError);
  }

  // ---------------------------------------------------------------- go
  F.keepAwake(on => { $('#awakeStatus').textContent = on ? '☀ Keeping the screen awake' : 'Screen keep-awake not active yet (click anywhere)'; });
  if (state.lg) { state.lg.running = false; }
  fbStart();
  render();
  requestAnimationFrame(layAllBulbs);
  if (document.fonts) document.fonts.ready.then(layAllBulbs);
})();
