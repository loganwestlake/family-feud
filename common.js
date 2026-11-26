// Shared helpers for the board (index.html) and host remote (host.html).
window.FFO = (() => {
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ffo_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ffo_' + k, JSON.stringify(v)); } catch {} },
  };

  // Accepts either JSON or the JS snippet Firebase gives you (const firebaseConfig = {...}).
  function parseConfig(txt) {
    if (!txt) return null;
    if (typeof txt === 'object') return txt;
    txt = String(txt).trim();
    if (!txt) return null;
    try { return JSON.parse(txt); } catch {}
    const o = {};
    const re = /(\w+)\s*:\s*["'`]([^"'`]*)["'`]/g;
    let m;
    while ((m = re.exec(txt))) o[m[1]] = m[2];
    return o.apiKey ? o : null;
  }

  const FB = {
    db: null, room: null,
    init(cfg, room) {
      if (!window.firebase || !cfg) return 'Firebase SDK not loaded (are you offline?)';
      if (!cfg.databaseURL) return 'Config is missing "databaseURL" — create a Realtime Database first, then copy the config again.';
      try {
        const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
        this.db = firebase.database(app);
        this.room = String(room || 'GAME').toUpperCase();
        return null;
      } catch (e) { return e.message; }
    },
    ref(p) { return this.db.ref('rooms/' + this.room + (p ? '/' + p : '')); },
  };

  const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

  return { store, parseConfig, FB, enc, dec };
})();
