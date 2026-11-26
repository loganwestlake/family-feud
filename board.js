(() => {
  const { store, parseConfig, FB, enc } = window.FFO;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  // ---------------------------------------------------------------- keys
  // Left half / right half of a standard keyboard. Ctrl/Alt/Meta are never used.
  const DEFAULT_KEYS = [
    ['Backquote', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Tab', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
     'CapsLock', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG', 'ShiftLeft', 'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB'],
    ['Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal', 'Backspace', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP',
     'BracketLeft', 'BracketRight', 'Backslash', 'KeyH', 'KeyJ', 'KeyK', 'KeyL', 'Semicolon', 'Quote', 'Enter',
     'KeyN', 'KeyM', 'Comma', 'Period', 'Slash', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
     'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5', 'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9',
     'NumpadEnter', 'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadDecimal'],
  ];
  const keyLabel = c => c.replace(/^Key|^Digit/, '').replace('Numpad', 'Num ').replace('Arrow', '');

  // ---------------------------------------------------------------- settings / state
  const randomRoom = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  const settings = Object.assign({
    teamNames: ['Team One', 'Team Two'],
    keys: DEFAULT_KEYS.map(k => k.slice()),
    target: 300,
    multipliers: true,
    questionsText: window.SAMPLE_QUESTIONS,
    fbConfig: '',
    room: randomRoom(),
  }, store.get('settings', {}));

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

  const freshRound = () => ({ revealed: [], banked: [], strikes: 0, bank: 0, bankOpen: true, armed: true, buzz: null, control: null });
  const newGame = () => Object.assign({ scores: [0, 0], round: 0, winner: null }, freshRound());
  let state = Object.assign(newGame(), store.get('state', {}));
  state.round = Math.min(state.round, Math.max(0, questions.length - 1));

  const mult = r => !settings.multipliers ? 1 : r < 3 ? 1 : r === 3 ? 2 : 3;
  const save = () => { store.set('state', state); store.set('settings', settings); };

  // ---------------------------------------------------------------- sound (synthesized, no files)
  const Sound = (() => {
    let ctx;
    function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo) {
      try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
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
    };
  })();

  // ---------------------------------------------------------------- board rendering
  let builtKey = '';
  function buildBoard() {
    const q = questions[state.round];
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

  function bump(el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }

  let lastBank = null, lastScores = [null, null];
  function render() {
    const q = questions[state.round];
    buildBoard();
    $$('#board .tile').forEach((t, i) => t.classList.toggle('revealed', !!state.revealed[i]));

    $('#question span').textContent = q ? q.q : 'Add some questions in Setup ⚙';
    $('#roundInfo').textContent = `ROUND ${state.round + 1} / ${questions.length}`;
    const m = mult(state.round);
    $('#multInfo').textContent = ['', 'SINGLE', 'DOUBLE', 'TRIPLE'][m] + ' POINTS';
    $('#multInfo').classList.toggle('hot', m > 1);

    const bankEl = $('#bank');
    if (lastBank !== null && state.bank > lastBank) bump(bankEl);
    bankEl.textContent = state.bank; lastBank = state.bank;

    [0, 1].forEach(t => {
      const el = $('#team' + t);
      el.querySelector('.name').textContent = settings.teamNames[t];
      const sEl = el.querySelector('.score');
      if (lastScores[t] !== null && state.scores[t] !== lastScores[t]) bump(sEl);
      sEl.textContent = state.scores[t]; lastScores[t] = state.scores[t];
      el.classList.toggle('control', state.control === t);
      el.classList.toggle('buzzed', !!state.buzz && state.buzz.team === t);
      el.querySelector('.keys').textContent = settings.keys[t].length > 6
        ? (t === 0 ? 'BUZZ: LEFT SIDE OF KEYBOARD' : 'BUZZ: RIGHT SIDE OF KEYBOARD')
        : 'BUZZ: ' + settings.keys[t].map(keyLabel).join(' / ');
      $$('.tn' + t).forEach(s => (s.textContent = settings.teamNames[t]));
    });

    $$('#strikes span').forEach((s, i) => s.classList.toggle('on', i < state.strikes));

    const bs = $('#buzzStatus');
    bs.classList.toggle('armed', state.armed);
    if (state.armed) bs.textContent = '⚡ BUZZERS ARMED — HIT YOUR KEYS!';
    else if (state.buzz) {
      const late = state.buzz.lateBy != null ? ` · ${settings.teamNames[1 - state.buzz.team]} was ${(state.buzz.lateBy / 1000).toFixed(3)}s late` : '';
      bs.textContent = `${settings.teamNames[state.buzz.team].toUpperCase()} BUZZED FIRST${late}`;
    } else bs.textContent = 'Buzzers off';

    if (state.winner != null) showWinner(state.winner); else $('#winOverlay').classList.remove('show');
    publish();
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
  function showBuzz(team) {
    const o = $('#buzzBanner');
    o.style.setProperty('--c', `var(--team${team})`);
    o.querySelector('.who').textContent = settings.teamNames[team];
    o.classList.add('show');
    clearTimeout(bTimer);
    bTimer = setTimeout(() => o.classList.remove('show'), 2200);
  }
  let shownWinner = null;
  function showWinner(team) {
    const o = $('#winOverlay');
    o.querySelector('.who').textContent = settings.teamNames[team];
    if (!o.classList.contains('show') || shownWinner !== team) {
      shownWinner = team;
      o.classList.add('show');
      const colors = ['#ffcf3f', '#ff4d4d', '#25d0c4', '#ffffff', '#3b7cff'];
      for (let i = 0; i < 120; i++) {
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
  }
  $('#winOverlay').addEventListener('click', () => exec({ t: 'dismissWin' }));

  // ---------------------------------------------------------------- game commands
  function exec(c) {
    const q = questions[state.round];
    switch (c.t) {
      case 'arm':
        state.armed = true; state.buzz = null; fbArm(); break;
      case 'disarm':
        state.armed = false; break;
      case 'reveal': {
        const i = +c.i;
        if (!q || !q.a[i]) return;
        if (state.revealed[i]) {
          state.revealed[i] = false;
          if (state.banked[i]) { state.bank -= state.banked[i]; state.banked[i] = 0; }
        } else {
          state.revealed[i] = true;
          Sound.ding();
          if (state.bankOpen) { const p = q.a[i].pts * mult(state.round); state.banked[i] = p; state.bank += p; }
        }
        break;
      }
      case 'revealAll':
        if (!q) return;
        q.a.forEach((_, i) => { state.revealed[i] = true; });
        state.bankOpen = false; Sound.ding(); break;
      case 'strike':
        state.strikes = Math.min(3, state.strikes + 1); showX(state.strikes); Sound.strike(); break;
      case 'x1':
        showX(1); Sound.strike(); break;
      case 'clearStrikes':
        state.strikes = 0; break;
      case 'control':
        state.control = +c.team; state.armed = false; break;
      case 'award': {
        const t = +c.team;
        state.scores[t] += state.bank;
        state.bank = 0; state.banked = []; state.bankOpen = false; state.armed = false;
        Sound.bank();
        if (settings.target > 0 && state.scores[t] >= settings.target) { state.winner = t; setTimeout(Sound.win, 700); }
        break;
      }
      case 'adjust':
        state.scores[+c.team] = Math.max(0, state.scores[+c.team] + (+c.d || 0)); break;
      case 'next':
        if (state.round >= questions.length - 1) return;
        state.round++; Object.assign(state, freshRound()); fbArm(); break;
      case 'prev':
        if (state.round <= 0) return;
        state.round--; Object.assign(state, freshRound()); fbArm(); break;
      case 'resetRound':
        Object.assign(state, freshRound()); fbArm(); break;
      case 'newGame':
        state = newGame(); fbArm(); shownWinner = null; break;
      case 'dismissWin':
        state.winner = null; break;
      default: return;
    }
    save(); render();
  }

  function buzz(team) {
    const now = performance.now();
    if (state.armed) {
      state.armed = false;
      state.buzz = { team, at: now, lateBy: null };
      Sound.buzz(team);
      showBuzz(team);
      fbBuzz(team);
      save(); render();
    } else if (state.buzz && state.buzz.team !== team && state.buzz.lateBy == null && now - state.buzz.at < 3000) {
      state.buzz.lateBy = Math.round(now - state.buzz.at);
      fbLog(team, 'late', state.buzz.lateBy);
      save(); render();
    }
  }

  // ---------------------------------------------------------------- keyboard
  let learning = null; // team index while learning keys in setup
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
    if ($('#setup').open) return;
    const team = teamFor(e.code);
    if (team === null) return;
    e.preventDefault();
    if (!e.repeat) buzz(team);
  });
  window.addEventListener('beforeunload', e => { if (document.fullscreenElement) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- controls
  $$('#controls [data-cmd]').forEach(b => b.addEventListener('click', () => {
    exec({ t: b.dataset.cmd, team: b.dataset.team });
    b.blur(); // so Enter/Space from a player doesn't click it again
  }));
  async function goFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      // Lets the page capture keys like Esc/Tab that a palm-slam might hit.
      if (navigator.keyboard && navigator.keyboard.lock) await navigator.keyboard.lock();
    } catch {}
  }
  $('#fsBtn').addEventListener('click', e => { e.target.blur(); document.fullscreenElement ? document.exitFullscreen() : goFullscreen(); });
  $('#startBtn').addEventListener('click', () => { $('#splash').remove(); Sound.intro(); goFullscreen(); });
  $('#splashSetup').addEventListener('click', openSetup);
  $('#setupBtn').addEventListener('click', openSetup);

  // ---------------------------------------------------------------- setup dialog
  function showKeys() {
    [0, 1].forEach(t => {
      const el = $('#keys' + t);
      el.innerHTML = settings.keys[t].length ? '' : '<i>no keys — click Learn keys</i>';
      settings.keys[t].forEach(k => { const kb = document.createElement('kbd'); kb.textContent = keyLabel(k); el.appendChild(kb); });
      el.classList.toggle('learning', learning === t);
    });
    $$('[data-learn]').forEach(b => (b.textContent = learning === +b.dataset.learn ? 'Done' : 'Learn keys'));
  }
  $$('[data-learn]').forEach(b => b.addEventListener('click', () => {
    const t = +b.dataset.learn;
    if (learning === t) learning = null;
    else { learning = t; settings.keys[t] = []; }
    b.blur(); showKeys();
  }));
  $$('[data-defaults]').forEach(b => b.addEventListener('click', () => {
    settings.keys = DEFAULT_KEYS.map(k => k.slice()); learning = null; showKeys();
  }));
  $('#sampleBtn').addEventListener('click', () => { $('#questionsText').value = window.SAMPLE_QUESTIONS; });
  $('#newGameBtn').addEventListener('click', () => { if (confirm('Reset scores and go back to round 1?')) exec({ t: 'newGame' }); });

  let fbAtOpen = '';
  function openSetup() {
    $('#tName0').value = settings.teamNames[0];
    $('#tName1').value = settings.teamNames[1];
    $('#target').value = settings.target;
    $('#multipliers').checked = settings.multipliers;
    $('#questionsText').value = settings.questionsText;
    $('#fbConfig').value = settings.fbConfig;
    $('#room').value = settings.room;
    fbAtOpen = settings.fbConfig + '|' + settings.room;
    learning = null; showKeys(); updateHostLink();
    $('#setup').showModal();
  }
  function closeSetup() {
    learning = null;
    settings.teamNames = [$('#tName0').value.trim() || 'Team One', $('#tName1').value.trim() || 'Team Two'];
    settings.target = Math.max(0, parseInt($('#target').value, 10) || 0);
    settings.multipliers = $('#multipliers').checked;
    if ($('#questionsText').value !== settings.questionsText) {
      settings.questionsText = $('#questionsText').value;
      questions = parseQuestions(settings.questionsText);
      state.round = Math.min(state.round, Math.max(0, questions.length - 1));
      Object.assign(state, freshRound());
      builtKey = '';
    }
    settings.fbConfig = $('#fbConfig').value.trim();
    settings.room = ($('#room').value.trim() || randomRoom()).toUpperCase().replace(/[^A-Z0-9]/g, '');
    save();
    $('#setup').close();
    if (settings.fbConfig + '|' + settings.room !== fbAtOpen) {
      if (FB.db) location.reload(); else fbStart();
    }
    render();
  }
  $('#closeSetup').addEventListener('click', closeSetup);
  $('#setup').addEventListener('cancel', e => { e.preventDefault(); closeSetup(); });
  $('#fbConfig').addEventListener('input', updateHostLink);
  $('#room').addEventListener('input', updateHostLink);

  function updateHostLink() {
    const cfg = parseConfig($('#fbConfig').value);
    const room = ($('#room').value || settings.room).toUpperCase();
    const a = $('#hostLink'), qr = $('#qr');
    qr.innerHTML = '';
    if (!cfg) { a.textContent = '(paste a Firebase config first)'; a.removeAttribute('href'); return; }
    const url = new URL('host.html', location.href).href + '#' + enc({ c: cfg, r: room });
    a.textContent = url; a.href = url;
    if (window.QRCode) new QRCode(qr, { text: url, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.L });
  }

  // ---------------------------------------------------------------- firebase
  let fbOn = false;
  function setConn(cls, text) {
    const c = $('#conn');
    c.className = cls; c.querySelector('span').textContent = text;
    $('#fbStatus').textContent = text;
  }
  function fbStart() {
    const cfg = parseConfig(settings.fbConfig);
    if (!cfg) { setConn('', 'Firebase off (optional — see Setup)'); return; }
    const err = FB.init(cfg, settings.room);
    if (err) { setConn('err', 'Firebase error: ' + err); return; }
    fbOn = true;
    setConn('', 'Connecting… room ' + FB.room);
    FB.db.ref('.info/connected').on('value', s => setConn(s.val() ? 'on' : '', (s.val() ? 'Firebase live · room ' : 'Reconnecting… room ') + FB.room));
    // Commands from the host remote (phone).
    FB.ref('commands').on('child_added', snap => {
      const c = snap.val();
      snap.ref.remove();
      if (c && c.t && Date.now() - (c.ts || 0) < 60000) exec(c);
    }, e => setConn('err', 'Firebase: ' + e.message + ' (check database rules)'));
    if (state.armed) fbArm();
    publish();
  }
  function publish() {
    if (!fbOn) return;
    const q = questions[state.round];
    const snapshot = JSON.parse(JSON.stringify({
      teamNames: settings.teamNames,
      scores: state.scores,
      round: state.round,
      totalRounds: questions.length,
      multiplier: mult(state.round),
      target: settings.target,
      question: q ? q.q : '',
      answers: q ? q.a.map((a, i) => ({ text: a.text, pts: a.pts, revealed: !!state.revealed[i] })) : [],
      strikes: state.strikes,
      bank: state.bank,
      armed: state.armed,
      control: state.control,
      buzz: state.buzz ? { team: state.buzz.team, lateBy: state.buzz.lateBy } : null,
      winner: state.winner,
    }));
    snapshot.updated = firebase.database.ServerValue.TIMESTAMP;
    FB.ref('state').set(snapshot).catch(e => setConn('err', 'Firebase: ' + e.message + ' (check database rules)'));
  }
  function fbArm() {
    if (!fbOn) return;
    FB.ref('buzz').set({ armed: true, round: state.round, armedAt: firebase.database.ServerValue.TIMESTAMP });
  }
  function fbBuzz(team) {
    if (!fbOn) return;
    // First-writer-wins: only claims the buzzer if it is still armed in the database.
    FB.ref('buzz').transaction(cur => (!cur || cur.armed)
      ? { armed: false, team, name: settings.teamNames[team], round: state.round, at: Date.now() }
      : undefined);
    fbLog(team, 'first');
  }
  function fbLog(team, kind, lateBy) {
    if (!fbOn) return;
    FB.ref('buzzLog').push(JSON.parse(JSON.stringify({
      team, name: settings.teamNames[team], kind, lateBy, round: state.round + 1,
      question: questions[state.round] ? questions[state.round].q : '',
      at: firebase.database.ServerValue.TIMESTAMP,
    })));
  }

  // ---------------------------------------------------------------- go
  fbStart();
  render();
})();
