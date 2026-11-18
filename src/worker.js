// Adonyi Hóvirág Óvoda – túlóra/szabadidő nyilvántartás (Cloudflare Worker + D1)
// Titkok (wrangler secret put): ADMIN_PASSWORD, SESSION_SECRET

const COOKIE = 'hovirag_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const enc = new TextEncoder();

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
const fail = (status, message) => json({ error: message }, status);

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function safeEqual(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`;
}

async function isLoggedIn(request, env) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m || !env.SESSION_SECRET) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function audit(env, action, detail) {
  await env.DB.prepare('INSERT INTO audit (action, detail) VALUES (?, ?)').bind(action, JSON.stringify(detail)).run();
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const cleanText = (s, max) => String(s ?? '').trim().slice(0, max);

const BALANCES = `
  SELECT w.id, w.name, w.active,
         COALESCE(SUM(e.minutes), 0) AS balance,
         MAX(e.date) AS last_date,
         (SELECT minutes FROM entries x WHERE x.worker_id = w.id ORDER BY x.date DESC, x.id DESC LIMIT 1) AS last_minutes
  FROM workers w LEFT JOIN entries e ON e.worker_id = w.id`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (path === '/api/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail(500, 'A szerver még nincs beállítva.');
      if (!safeEqual(body.password ?? '', env.ADMIN_PASSWORD)) {
        await new Promise((r) => setTimeout(r, 600));
        return fail(401, 'Hibás jelszó.');
      }
      return json({ ok: true }, 200, { 'set-cookie': cookieHeader(await makeToken(env), SESSION_SECONDS) });
    }
    if (path === '/api/logout' && method === 'POST') {
      return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
    }

    if (!(await isLoggedIn(request, env))) return fail(401, 'Jelentkezz be.');
    if (path === '/api/me') return json({ ok: true });

    try {
      if (path === '/api/workers' && method === 'GET') {
        const { results } = await env.DB.prepare(`${BALANCES} GROUP BY w.id ORDER BY w.active DESC, w.name COLLATE NOCASE`).all();
        return json({ workers: results });
      }

      if (path === '/api/workers' && method === 'POST') {
        const b = await request.json();
        const name = cleanText(b.name, 80);
        if (!name) return fail(400, 'Add meg a dolgozó nevét.');
        const opening = Math.trunc(Number(b.opening_minutes) || 0);
        const w = await env.DB.prepare('INSERT INTO workers (name) VALUES (?) RETURNING id').bind(name).first();
        if (opening !== 0) {
          const date = isDate(b.date) ? b.date : new Date().toISOString().slice(0, 10);
          await env.DB.prepare("INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, 'opening', ?)")
            .bind(w.id, date, opening, 'Nyitó egyenleg a papír nyilvántartásból').run();
        }
        await audit(env, 'worker.create', { id: w.id, name, opening });
        return json({ id: w.id }, 201);
      }

      let m = path.match(/^\/api\/workers\/(\d+)$/);
      if (m && method === 'PATCH') {
        const b = await request.json();
        const id = Number(m[1]);
        const name = cleanText(b.name, 80);
        if (b.name !== undefined && !name) return fail(400, 'A név nem lehet üres.');
        const cur = await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(id).first();
        if (!cur) return fail(404, 'Nincs ilyen dolgozó.');
        if (b.name !== undefined) await env.DB.prepare('UPDATE workers SET name = ? WHERE id = ?').bind(name, id).run();
        if (b.active !== undefined) await env.DB.prepare('UPDATE workers SET active = ? WHERE id = ?').bind(b.active ? 1 : 0, id).run();
        await audit(env, 'worker.update', { id, name: b.name, active: b.active });
        return json({ ok: true });
      }

      m = path.match(/^\/api\/workers\/(\d+)\/entries$/);
      if (m && method === 'GET') {
        const id = Number(m[1]);
        const worker = await env.DB.prepare(`${BALANCES} WHERE w.id = ? GROUP BY w.id`).bind(id).first();
        if (!worker) return fail(404, 'Nincs ilyen dolgozó.');
        const { results } = await env.DB.prepare(
          `SELECT e.*, (SELECT 1 FROM entries r WHERE r.reverses_id = e.id) AS reversed
           FROM entries e WHERE e.worker_id = ? ORDER BY e.date DESC, e.id DESC`).bind(id).all();
        return json({ worker, entries: results });
      }

      if (path === '/api/entries' && method === 'POST') {
        const b = await request.json();
        const workerId = Number(b.worker_id);
        const minutes = Math.trunc(Number(b.minutes));
        const kind = b.kind === 'use' ? 'use' : 'credit';
        if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 60 * 24 * 31) return fail(400, 'Adj meg 0-nál nagyobb időtartamot.');
        if (!isDate(b.date)) return fail(400, 'Hibás dátum.');
        const w = await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(workerId).first();
        if (!w) return fail(404, 'Nincs ilyen dolgozó.');
        const signed = kind === 'use' ? -minutes : minutes;
        const row = await env.DB.prepare('INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, ?, ?) RETURNING id')
          .bind(workerId, b.date, signed, kind, cleanText(b.note, 300)).first();
        await audit(env, 'entry.create', { id: row.id, workerId, minutes: signed, kind });
        return json({ id: row.id }, 201);
      }

      m = path.match(/^\/api\/entries\/(\d+)\/reverse$/);
      if (m && method === 'POST') {
        const id = Number(m[1]);
        const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
        if (!e) return fail(404, 'Nincs ilyen tétel.');
        if (e.kind === 'reversal') return fail(400, 'Sztornó tételt nem lehet sztornózni.');
        const b = await request.json().catch(() => ({}));
        const today = new Date().toISOString().slice(0, 10);
        try {
          const row = await env.DB.prepare(
            "INSERT INTO entries (worker_id, date, minutes, kind, note, reverses_id) VALUES (?, ?, ?, 'reversal', ?, ?) RETURNING id")
            .bind(e.worker_id, isDate(b.date) ? b.date : today, -e.minutes, cleanText(b.note, 300) || `Sztornó: ${e.note}`.slice(0, 300), id).first();
          await audit(env, 'entry.reverse', { id: row.id, reverses: id });
          return json({ id: row.id }, 201);
        } catch {
          return fail(409, 'Ezt a tételt már sztornózták.');
        }
      }
    } catch (err) {
      console.error(err);
      return fail(500, 'Váratlan hiba történt.');
    }

    return fail(404, 'Nincs ilyen végpont.');
  },
};
