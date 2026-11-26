(() => {
  const F = window.FFO;
  const { store, FB } = F;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

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
    questionsText: window.SAMPLE_QUESTIONS,
    room: F.randomRoom(),
    pin: F.randomPin(),
  }, saved);
  if (!F.validRoom(settings.room)) settings.room = F.randomRoom();
  if (!F.validPin(settings.pin)) settings.pin = F.randomPin();
  delete settings.fbConfig; // older versions kept the config here; it now lives in store 'fbConfig'
  if (saved.fbConfig && !store.get('fbConfig', '')) store.set('fbConfig', saved.fbConfig);

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

  const freshRound = () => ({ revealed: [], banked: [], strikes: 0, bank: 0, bankOpen: true, armed: false, armId: null, buzz: null, control: null });
  const newGame = () => Object.assign({ scores: [0, 0], round: 0, winner: null }, freshRound());
  let state = Object.assign(newGame(), store.get('state', {}));
  state.round = Math.min(state.round, Math.max(0, questions.length - 1));

  const mult = r => !settings.multipliers ? 1 : r < 3 ? 1 : r === 3 ? 2 : 3;
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

  let players = {}; // id -> {team, name}
  const teamPlayers = t => Object.values(players).filter(p => p && p.team === t);

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
      const n = teamPlayers(t).length;
      el.querySelector('.keys').textContent = fbOn
        ? (n ? `${n} BUZZER${n > 1 ? 'S' : ''} CONNECTED` : 'NO BUZZER CONNECTED')
        : (settings.localKeys ? (t === 0 ? 'BUZZ: LEFT SIDE OF KEYBOARD' : 'BUZZ: RIGHT SIDE OF KEYBOARD') : '');
      $$('.tn' + t).forEach(s => (s.textContent = settings.teamNames[t]));
      // lobby
      $('#lt' + t + ' .ltName').textContent = settings.teamNames[t];
      const box = $('#lt' + t + ' .ltPlayers');
      box.innerHTML = '';
      const list = teamPlayers(t);
      if (!list.length) box.innerHTML = '<div class="none">Waiting for a buzzer to join…</div>';
      list.forEach(p => { const d = document.createElement('div'); d.className = 'pl'; d.textContent = p.name || 'Buzzer'; box.appendChild(d); });
    });

    $$('#strikes span').forEach((s, i) => s.classList.toggle('on', i < state.strikes));

    const bs = $('#buzzStatus');
    bs.classList.toggle('armed', state.armed);
    if (state.armed) bs.textContent = '⚡ BUZZERS ARMED, BUZZ IN!';
    else if (state.buzz) {
      const who = state.buzz.player ? ` (${state.buzz.player})` : '';
      const late = state.buzz.lateBy != null ? ` · ${settings.teamNames[1 - state.buzz.team]} was ${(state.buzz.lateBy / 1000).toFixed(3)}s late` : '';
      bs.textContent = `${settings.teamNames[state.buzz.team].toUpperCase()}${who} BUZZED FIRST${late}`;
    } else bs.textContent = 'Buzzers locked. Click ⚡ Arm Buzzers for the face-off';

    if (state.winner != null) showWinner(state.winner); else $('#winOverlay').classList.remove('show');
    renderLobbyCodes();
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
  function showBuzz(team, player) {
    const o = $('#buzzBanner');
    o.style.setProperty('--c', `var(--team${team})`);
    o.querySelector('.who').textContent = settings.teamNames[team];
    o.querySelector('.player').textContent = player || '';
    o.classList.add('show');
    clearTimeout(bTimer);
    bTimer = setTimeout(() => o.classList.remove('show'), 2200);
  }
  let shownWinner = null;
  function showWinner(team) {
    const o = $('#winOverlay');
    o.querySelector('.who').textContent = settings.teamNames[team];
    if (o.classList.contains('show') && shownWinner === team) return;
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
  $('#winOverlay').addEventListener('click', () => exec({ t: 'dismissWin' }));

  // ---------------------------------------------------------------- game commands
  function arm() {
    state.armed = true;
    state.buzz = null;
    state.armId = F.randomId();
    presses = [];
    fbArm();
  }
  function lockBuzzers() {
    state.armed = false;
    if (fbOn) FB.ref('buzz').set({ armed: false, armId: state.armId || null }).catch(fbError);
  }
  function exec(c) {
    const q = questions[state.round];
    switch (c.t) {
      case 'arm': arm(); break;
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
        state.control = +c.team; if (state.armed) lockBuzzers(); break;
      case 'award': {
        const t = +c.team;
        state.scores[t] += state.bank;
        state.bank = 0; state.banked = []; state.bankOpen = false;
        if (state.armed) lockBuzzers();
        Sound.bank();
        if (settings.target > 0 && state.scores[t] >= settings.target) { state.winner = t; setTimeout(Sound.win, 700); }
        break;
      }
      case 'adjust':
        state.scores[+c.team] = Math.max(0, state.scores[+c.team] + (+c.d || 0)); break;
      case 'next':
        if (state.round >= questions.length - 1) return;
        state.round++; Object.assign(state, freshRound()); arm(); break;
      case 'prev':
        if (state.round <= 0) return;
        state.round--; Object.assign(state, freshRound()); arm(); break;
      case 'resetRound':
        Object.assign(state, freshRound()); arm(); break;
      case 'newGame':
        state = newGame(); shownWinner = null; arm(); break;
      case 'dismissWin':
        state.winner = null; break;
      default: return;
    }
    save(); render();
  }

  // ---------------------------------------------------------------- buzzing
  // With Firebase, the database decides who was first: every buzzer runs a transaction that only
  // succeeds while buzz/armed is true for the current armId, so exactly one team can claim it.
  // Without Firebase (offline), the TV keyboard decides locally.
  let presses = []; // {team, at} for the current armId (server timestamps)

  function winnerDecided(team, player) {
    if (!state.armed) return;
    state.armed = false;
    state.buzz = { team, player: player || '', lateBy: null };
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
  function localBuzz(team) {
    if (fbOn) {
      // Treat the TV keyboard like another buzzer so the database stays the referee.
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
    if ($('#setup').open || !settings.localKeys) return;
    const team = teamFor(e.code);
    if (team === null) return;
    e.preventDefault();
    if (!e.repeat) localBuzz(team);
  });

  // ---------------------------------------------------------------- controls
  $$('#controls [data-cmd]').forEach(b => b.addEventListener('click', () => { exec({ t: b.dataset.cmd, team: b.dataset.team }); b.blur(); }));
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
    if (!state.armed && !state.buzz) { arm(); save(); render(); }
  });
  $('#lobbyBtn').addEventListener('click', e => { e.target.blur(); $('#lobby').classList.remove('hidden'); });
  $('#lobbySetup').addEventListener('click', openSetup);
  $('#setupBtn').addEventListener('click', openSetup);

  // ---------------------------------------------------------------- lobby / join info
  const pageUrl = name => new URL(name, location.href).href.replace(/[?#].*$/, '');
  let pinVisible = false;
  $('#pinToggle').addEventListener('click', e => { pinVisible = !pinVisible; e.target.textContent = pinVisible ? 'hide' : 'show'; renderLobbyCodes(); });
  let lastQr = '';
  function renderLobbyCodes() {
    const url = pageUrl('buzzer.html');
    $('#joinUrl').textContent = url.replace(/^https?:\/\//, '');
    $('#roomCode').textContent = settings.room;
    $('#pinCode').textContent = pinVisible ? settings.pin : '••••';
    const qrUrl = url + '#room=' + settings.room;  // the PIN is never put in the QR code
    if (qrUrl !== lastQr && window.QRCode) {
      lastQr = qrUrl; $('#joinQr').innerHTML = '';
      new QRCode($('#joinQr'), { text: qrUrl, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.L });
    }
  }

  // ---------------------------------------------------------------- setup dialog
  function showKeys() {
    [0, 1].forEach(t => {
      const el = $('#keys' + t);
      el.innerHTML = settings.keys[t].length ? '' : '<i>no keys. Click Learn keys</i>';
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
  $('#newGameBtn').addEventListener('click', () => { if (confirm('Reset scores and go back to round 1?')) exec({ t: 'newGame' }); });
  $('#newCodesBtn').addEventListener('click', () => { $('#room').value = F.randomRoom(); $('#pin').value = F.randomPin(); updateHostQr(); });
  $('#room').addEventListener('input', e => { e.target.value = F.cleanRoom(e.target.value); updateHostQr(); });
  $('#pin').addEventListener('input', e => { e.target.value = F.cleanPin(e.target.value); updateHostQr(); });

  function updateHostQr() {
    const room = $('#room').value, pin = $('#pin').value;
    $('#hostUrl').textContent = pageUrl('host.html');
    $('#qr').innerHTML = '';
    if (!F.validRoom(room) || !F.validPin(pin) || !window.QRCode) return;
    // Host link carries room + PIN in the #fragment, which browsers never send to the web server.
    new QRCode($('#qr'), { text: pageUrl('host.html') + '#' + F.enc({ r: room, p: pin }), width: 150, height: 150, correctLevel: QRCode.CorrectLevel.L });
  }

  let atOpen = '';
  function openSetup() {
    $('#room').value = settings.room;
    $('#pin').value = settings.pin;
    $('#tName0').value = settings.teamNames[0];
    $('#tName1').value = settings.teamNames[1];
    $('#target').value = settings.target;
    $('#multipliers').checked = settings.multipliers;
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
    settings.localKeys = $('#localKeys').checked;
    if ($('#questionsText').value !== settings.questionsText) {
      settings.questionsText = $('#questionsText').value;
      questions = parseQuestions(settings.questionsText);
      state.round = Math.min(state.round, Math.max(0, questions.length - 1));
      Object.assign(state, freshRound());
      builtKey = '';
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
  function fbError(e) {
    const msg = F.friendlyError(e);
    setConn('err', msg);
    $('#lobbyMsg').textContent = '⚠ ' + msg;
  }
  function fbStart() {
    const err = FB.init(F.getConfig());
    if (err === 'NO_CONFIG') {
      setConn('err', 'Firebase not set up. Buzzer laptops can\'t join');
      $('#lobbyMsg').textContent = '⚠ This site has no Firebase project yet, so the buzzer laptops can\'t connect. See the README ("Firebase setup"), or paste a config in ⚙ Setup → Advanced.';
      return;
    }
    if (err) { fbError(err); return; }
    FB.join(settings.room, settings.pin);
    fbOn = true;
    setConn('', 'Connecting… room ' + settings.room);
    FB.onConnected(on => setConn(on ? 'on' : '', (on ? 'Live · room ' : 'Reconnecting… room ') + settings.room));

    // Who won the buzz (set by a buzzer laptop's transaction).
    FB.ref('buzz').on('value', s => {
      const b = s.val();
      if (b && b.armed === false && b.team != null && b.armId === state.armId) winnerDecided(+b.team, b.player);
    }, fbError);
    // Every press, with server timestamps, to show how close it was.
    FB.ref('presses').on('child_added', s => {
      const p = s.val();
      if (p && p.armId === state.armId && typeof p.at === 'number') { presses.push(p); computeLate(); }
    });
    // Connected buzzer laptops.
    let known = 0;
    FB.ref('players').on('value', s => {
      players = s.val() || {};
      const n = Object.keys(players).length;
      if (n > known) Sound.join();
      known = n; render();
    });
    // Commands from the phone remote.
    FB.ref('commands').on('child_added', snap => {
      const c = snap.val();
      snap.ref.remove();
      if (c && c.t && Date.now() - (c.ts || 0) < 60000) exec(c);
    });
    // Re-arm with a fresh id after a reload so a stale buzz can't count.
    if (state.armed) arm(); else lockBuzzers();
    save(); publish();
  }
  function publish() {
    if (!fbOn) return;
    const q = questions[state.round];
    const snapshot = F.clean({
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
      buzz: state.buzz,
      winner: state.winner,
    });
    snapshot.updated = FB.TS;
    FB.ref('state').set(snapshot).catch(fbError);
  }
  function fbArm() {
    if (!fbOn) return;
    FB.ref('presses').remove();
    FB.ref('buzz').set({ armed: true, armId: state.armId, round: state.round }).catch(fbError);
  }

  // ---------------------------------------------------------------- go
  fbStart();
  render();
})();
