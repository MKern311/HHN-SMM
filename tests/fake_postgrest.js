// Fake PostgREST for sostac_plans, kept in localStorage so it survives reloads
// like a real server. Config in localStorage '__fake_cfg__': {delay, offline}.
(function () {
  const realFetch = window.fetch.bind(window);
  window.__realFetch = realFetch;
  const DB = '__fake_db__', LOG = '__fake_log__', CFG = '__fake_cfg__';
  const load = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const pgStamp = ms => new Date(ms).toISOString().replace(/\.?0+Z$/, '').replace('Z', '') + '+00:00';
  const reply = (status, body) => ({
    ok: status < 300, status,
    json: async () => body, text: async () => JSON.stringify(body)
  });
  window.__fake = {
    db: () => load(DB) || {},
    setRow: (code, data, ms) => { const db = load(DB) || {}; db[code] = { group_id: code, data, ms: ms || Date.now() }; save(DB, db); },
    log: () => load(LOG) || [],
    clearLog: () => save(LOG, []),
    cfg: c => { save(CFG, Object.assign(load(CFG) || {}, c)); },
  };
  window.fetch = async (url, opt) => {
    url = String(url);
    if (!url.startsWith('https://fake.invalid/')) return realFetch(url, opt);
    opt = opt || {};
    const cfg = load(CFG) || {};
    const m = opt.method || 'GET';
    const u = new URL(url);
    const entry = { m, path: u.pathname + u.search, keepalive: !!opt.keepalive, t: Date.now() };
    const log = load(LOG) || []; log.push(entry); save(LOG, log);
    if (cfg.delay) await new Promise(r => setTimeout(r, cfg.delay));
    if (cfg.offline) throw new TypeError('Failed to fetch (fake offline)');
    if (!u.pathname.includes('sostac_plans')) return reply(200, []);
    const db = load(DB) || {};
    const q = u.searchParams;
    const eq = k => (q.get(k) || '').replace(/^eq\./, '');
    const out = r => ({ group_id: r.group_id, data: r.data, last_saved: pgStamp(r.ms) });
    if (m === 'GET') {
      const code = eq('group_id');
      const rows = code ? (db[code] ? [db[code]] : []) : Object.values(db).slice(0, Number(q.get('limit')) || 999);
      return reply(200, rows.map(out));
    }
    const body = JSON.parse(opt.body);
    const ms = Date.parse(body.last_saved);
    if (m === 'PATCH') {
      const code = eq('group_id'), want = Date.parse(eq('last_saved'));
      const row = db[code];
      if (!row || row.ms !== want) return reply(200, []);   // filter matched nothing
      db[code] = { group_id: code, data: body.data, ms };
      save(DB, db); return reply(200, [out(db[code])]);
    }
    if (m === 'POST') {
      const upsert = (q.get('on_conflict') || '') === 'group_id';
      if (db[body.group_id] && !upsert) return reply(409, { code: '23505', message: 'duplicate key value' });
      db[body.group_id] = { group_id: body.group_id, data: body.data, ms };
      save(DB, db); return reply(201, [out(db[body.group_id])]);
    }
    return reply(405, {});
  };
})();
