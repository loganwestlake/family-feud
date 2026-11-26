// Shared helpers for the TV board (index.html), the buzzer laptops (buzzer.html) and the host remote (host.html).
//
// Data lives in the Realtime Database at games/<ROOM>-<PIN>/...
// The database rules (database.rules.json) don't let anyone list games/, so a game can only be
// opened by someone who knows both the room code and the 4-digit PIN.
window.FFO = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ffo_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ffo_' + k, JSON.stringify(v)); } catch {} },
  };

  // Configs copied before a Realtime Database existed have no databaseURL; use the default one.
  function withDbUrl(o) {
    if (o && !o.databaseURL && o.projectId) o.databaseURL = `https://${o.projectId}-default-rtdb.firebaseio.com`;
    return o;
  }
  // Accepts JSON, an object, or the JS snippet Firebase gives you (const firebaseConfig = {...}).
  function parseConfig(txt) {
    if (!txt) return null;
    if (typeof txt === 'object') return txt.apiKey ? withDbUrl({ ...txt }) : null;
    txt = String(txt).trim();
    if (!txt) return null;
    try { return parseConfig(JSON.parse(txt)); } catch {}
    const o = {};
    const re = /(\w+)\s*:\s*["'`]([^"'`]*)["'`]/g;
    let m;
    while ((m = re.exec(txt))) o[m[1]] = m[2];
    return o.apiKey ? withDbUrl(o) : null;
  }
  // A config pasted on this device wins; otherwise the one the website was deployed with
  // (firebase-config.js, or a FIREBASE_CONFIG repository secret injected by the Pages workflow).
  // Built-in fallback so the game works even if firebase-config.js is missing or a stale copy is cached.
  const BUILT_IN = {
    apiKey: "AIzaSyBQefWXFh1yor0beawArJ0rnVNHd4v3KFY",
    authDomain: "family-face-off-3b730.firebaseapp.com",
    databaseURL: "https://family-face-off-3b730-default-rtdb.firebaseio.com",
    projectId: "family-face-off-3b730",
    storageBucket: "family-face-off-3b730.firebasestorage.app",
    messagingSenderId: "266783159220",
    appId: "1:266783159220:web:acae1d3698af9e1ab878e1",
  };
  const getConfig = () => parseConfig(store.get('fbConfig', '')) || parseConfig(window.FIREBASE_CONFIG) || parseConfig(BUILT_IN);

  const cleanRoom = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const cleanPin = s => String(s || '').replace(/\D/g, '').slice(0, 4);
  const validRoom = r => /^[A-Z]{4}$/.test(r);
  const validPin = p => /^\d{4}$/.test(p);
  const randomRoom = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
  const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const randomId = () => Math.random().toString(36).slice(2, 10);

  const FB = {
    db: null, key: null,
    // Returns null on success, 'NO_CONFIG', or an error message.
    init(cfg) {
      if (!cfg) return 'NO_CONFIG';
      if (!window.firebase) return 'Could not load Firebase. Check the internet connection.';
      try {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
        this.db = firebase.database(app);
        return null;
      } catch (e) { return e.message; }
    },
    join(room, pin) { this.key = room + '-' + pin; },
    ref(p) { return this.db.ref('games/' + this.key + (p ? '/' + p : '')); },
    get TS() { return firebase.database.ServerValue.TIMESTAMP; },
    onConnected(cb) { this.db.ref('.info/connected').on('value', s => cb(!!s.val())); },
  };

  const friendlyError = e => {
    const msg = (e && (e.message || e.code)) || String(e);
    return /permission/i.test(msg)
      ? 'Firebase said "permission denied". Publish the database rules from the README.'
      : msg;
  };

  const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  // Turns undefined into "missing", because Firebase rejects undefined values.
  const clean = o => JSON.parse(JSON.stringify(o));

  return { store, parseConfig, getConfig, cleanRoom, cleanPin, validRoom, validPin, randomRoom, randomPin, randomId, FB, friendlyError, enc, dec, clean };
})();
