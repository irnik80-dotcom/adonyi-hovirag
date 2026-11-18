// Adonyi Hóvirág Óvoda – túlóra/szabadidő nyilvántartás (Cloudflare Worker + D1)
// Titkok (wrangler secret put): ADMIN_PASSWORD, SESSION_SECRET

import { SCHEMA, TEMPLATES_TABLE, DEFAULT_TEMPLATES } from './schema.js';

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

const todayBudapest = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date());

// ?1 = a mai nap. Az egyenleg csak a mai napig (és azt is beleértve) rögzített tételeket számolja,
// a jövőbeli, tervezett szabadidő külön oszlop.
const BALANCES = `
  SELECT w.id, w.name, w.active,
    COALESCE((SELECT SUM(minutes) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1), 0) AS balance,
    COALESCE((SELECT SUM(minutes) FROM entries e WHERE e.worker_id = w.id AND e.date > ?1), 0) AS planned,
    (SELECT MAX(date) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1) AS last_date,
    (SELECT minutes FROM entries x WHERE x.worker_id = w.id AND x.date <= ?1 ORDER BY x.date DESC, x.id DESC LIMIT 1) AS last_minutes,
    (SELECT MAX(to_date) FROM signatures s WHERE s.worker_id = w.id) AS signed_to,
    (SELECT signed_on FROM signatures s WHERE s.worker_id = w.id ORDER BY to_date DESC, id DESC LIMIT 1) AS signed_on,
    (SELECT COUNT(*) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1
       AND e.date > COALESCE((SELECT MAX(to_date) FROM signatures s WHERE s.worker_id = w.id), '0000-00-00')) AS unsigned
  FROM workers w`;

let schemaReady;
async function runSchema(env) {
  await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
  const had = await env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'note_templates'").first();
  await env.DB.prepare(TEMPLATES_TABLE).run();
  if (!had) {
    await env.DB.batch(DEFAULT_TEMPLATES.map((t) => env.DB.prepare('INSERT INTO note_templates (text) VALUES (?)').bind(t)));
  }
}
const ensureSchema = (env) => (schemaReady ??= runSchema(env).catch((e) => { schemaReady = undefined; throw e; }));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (path === '/api/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail(500, 'A szerver még nincs beállítva.');
      if (!safeEqual(String(body.password ?? '').trim(), String(env.ADMIN_PASSWORD).trim())) {
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
    await ensureSchema(env);

    const today = todayBudapest();

    try {
      if (path === '/api/workers' && method === 'GET') {
        const { results } = await env.DB.prepare(`${BALANCES} ORDER BY w.active DESC, w.name COLLATE NOCASE`).bind(today).all();
        const upcoming = (await env.DB.prepare(
          `SELECT e.id, e.date, e.minutes, e.note, w.id AS worker_id, w.name
           FROM entries e JOIN workers w ON w.id = e.worker_id
           WHERE e.date > ? AND e.kind = 'use' AND w.active = 1
             AND NOT EXISTS (SELECT 1 FROM entries r WHERE r.reverses_id = e.id)
           ORDER BY e.date, e.id LIMIT 12`).bind(today).all()).results;
        return json({ today, workers: results, upcoming });
      }

      if (path === '/api/workers' && method === 'POST') {
        const b = await request.json();
        const name = cleanText(b.name, 80);
        if (!name) return fail(400, 'Add meg a dolgozó nevét.');
        const opening = Math.trunc(Number(b.opening_minutes) || 0);
        const w = await env.DB.prepare('INSERT INTO workers (name) VALUES (?) RETURNING id').bind(name).first();
        if (opening !== 0) {
          const date = isDate(b.date) ? b.date : today;
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
        const worker = await env.DB.prepare(`${BALANCES} WHERE w.id = ?2`).bind(today, id).first();
        if (!worker) return fail(404, 'Nincs ilyen dolgozó.');
        const { results } = await env.DB.prepare(
          `SELECT e.*, (SELECT 1 FROM entries r WHERE r.reverses_id = e.id) AS reversed
           FROM entries e WHERE e.worker_id = ? ORDER BY e.date DESC, e.id DESC`).bind(id).all();
        const signatures = (await env.DB.prepare('SELECT * FROM signatures WHERE worker_id = ? ORDER BY to_date DESC, id DESC').bind(id).all()).results;
        return json({ today, worker, entries: results, signatures });
      }

      if (path === '/api/entries' && method === 'POST') {
        const b = await request.json();
        const ids = [...new Set((Array.isArray(b.worker_ids) ? b.worker_ids : [b.worker_id]).map(Number))].filter(Number.isInteger);
        const minutes = Math.trunc(Number(b.minutes));
        const kind = b.kind === 'use' ? 'use' : 'credit';
        if (!ids.length) return fail(400, 'Válassz legalább egy dolgozót.');
        if (ids.length > 100) return fail(400, 'Túl sok dolgozó.');
        if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 60 * 24 * 31) return fail(400, 'Adj meg 0-nál nagyobb időtartamot.');
        if (!isDate(b.date)) return fail(400, 'Hibás dátum.');
        if (kind === 'credit' && b.date > today) return fail(400, 'Túlórát csak már megtörtént napra lehet rögzíteni.');
        const found = (await env.DB.prepare(`SELECT id FROM workers WHERE id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
        if (found.length !== ids.length) return fail(404, 'Nincs ilyen dolgozó.');
        const signed = kind === 'use' ? -minutes : minutes;
        const note = cleanText(b.note, 300);
        const out = await env.DB.batch(ids.map((wid) =>
          env.DB.prepare('INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(wid, b.date, signed, kind, note)));
        const created = out.map((r) => r.results[0].id);
        await audit(env, 'entry.create', { ids: created, workerIds: ids, minutes: signed, kind, date: b.date });
        return json({ ids: created }, 201);
      }

      // Azonnali visszavonás: csak az imént (2 percen belül) rögzített, még nem sztornózott tétel törölhető.
      if (path === '/api/entries/undo' && method === 'POST') {
        const b = await request.json();
        const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(Number.isInteger).slice(0, 100);
        if (!ids.length) return fail(400, 'Nincs visszavonandó tétel.');
        const ph = ids.map(() => '?').join(',');
        const rows = (await env.DB.prepare(
          `SELECT id FROM entries WHERE id IN (${ph}) AND kind <> 'reversal' AND created_at >= datetime('now', '-120 seconds')
             AND NOT EXISTS (SELECT 1 FROM entries r WHERE r.reverses_id = entries.id)`).bind(...ids).all()).results;
        if (rows.length !== ids.length) return fail(409, 'Már nem vonható vissza (több mint 2 perc telt el). Használd a sztornót.');
        await env.DB.prepare(`DELETE FROM entries WHERE id IN (${ph})`).bind(...ids).run();
        await audit(env, 'entry.undo', { ids });
        return json({ ok: true });
      }

      m = path.match(/^\/api\/entries\/(\d+)\/reverse$/);
      if (m && method === 'POST') {
        const id = Number(m[1]);
        const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
        if (!e) return fail(404, 'Nincs ilyen tétel.');
        if (e.kind === 'reversal') return fail(400, 'Sztornó tételt nem lehet sztornózni.');
        const b = await request.json().catch(() => ({}));
        // Tervezett (jövőbeli) tételnél a sztornó ugyanarra a napra esik, így az egyenleget soha nem mozgatja.
        const date = e.date > today ? e.date : isDate(b.date) ? b.date : today;
        try {
          const row = await env.DB.prepare(
            "INSERT INTO entries (worker_id, date, minutes, kind, note, reverses_id) VALUES (?, ?, ?, 'reversal', ?, ?) RETURNING id")
            .bind(e.worker_id, date, -e.minutes, cleanText(b.note, 300) || `Sztornó: ${e.note}`.slice(0, 300), id).first();
          await audit(env, 'entry.reverse', { id: row.id, reverses: id });
          return json({ id: row.id }, 201);
        } catch {
          return fail(409, 'Ezt a tételt már sztornózták.');
        }
      }

      if (path === '/api/templates' && method === 'GET') {
        return json({ templates: (await env.DB.prepare('SELECT id, text FROM note_templates ORDER BY id').all()).results });
      }
      if (path === '/api/templates' && method === 'POST') {
        const text = cleanText((await request.json()).text, 60);
        if (!text) return fail(400, 'Írd be a megjegyzést.');
        const row = await env.DB.prepare('INSERT INTO note_templates (text) VALUES (?) RETURNING id').bind(text).first();
        return json({ id: row.id }, 201);
      }
      m = path.match(/^\/api\/templates\/(\d+)$/);
      if (m && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM note_templates WHERE id = ?').bind(Number(m[1])).run();
        return json({ ok: true });
      }

      if (path === '/api/signatures' && method === 'POST') {
        const b = await request.json();
        const wid = Number(b.worker_id);
        if (!isDate(b.from) || !isDate(b.to) || b.from > b.to || !isDate(b.signed_on)) return fail(400, 'Hibás dátum.');
        const w = await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(wid).first();
        if (!w) return fail(404, 'Nincs ilyen dolgozó.');
        const dup = await env.DB.prepare('SELECT id FROM signatures WHERE worker_id = ? AND from_date = ? AND to_date = ?').bind(wid, b.from, b.to).first();
        if (dup) return fail(409, 'Ez a kimutatás már alá van írva.');
        const row = await env.DB.prepare('INSERT INTO signatures (worker_id, from_date, to_date, signed_on) VALUES (?, ?, ?, ?) RETURNING id')
          .bind(wid, b.from, b.to, b.signed_on).first();
        await audit(env, 'signature.create', { id: row.id, wid, from: b.from, to: b.to });
        return json({ id: row.id }, 201);
      }
      m = path.match(/^\/api\/signatures\/(\d+)$/);
      if (m && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM signatures WHERE id = ?').bind(Number(m[1])).run();
        await audit(env, 'signature.delete', { id: Number(m[1]) });
        return json({ ok: true });
      }

      if (path === '/api/backup' && method === 'GET') {
        const workers = (await env.DB.prepare('SELECT * FROM workers ORDER BY id').all()).results;
        const entries = (await env.DB.prepare('SELECT * FROM entries ORDER BY id').all()).results;
        if (url.searchParams.get('format') === 'csv') {
          const names = Object.fromEntries(workers.map((w) => [w.id, w.name]));
          const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
          const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };
          const lines = [['Dolgozó', 'Dátum', 'Perc', 'Típus', 'Megjegyzés', 'Rögzítve'].map(cell).join(';')].concat(
            entries.map((e) => [names[e.worker_id], e.date, e.minutes, KIND[e.kind], e.note, e.created_at].map(cell).join(';')));
          return new Response('﻿' + lines.join('\r\n'), { headers: {
            'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
            'content-disposition': `attachment; filename="hovirag-tetelek-${today}.csv"` } });
        }
        const audit_ = (await env.DB.prepare('SELECT * FROM audit ORDER BY id').all()).results;
        const signatures = (await env.DB.prepare('SELECT * FROM signatures ORDER BY id').all()).results;
        const templates = (await env.DB.prepare('SELECT * FROM note_templates ORDER BY id').all()).results;
        return new Response(JSON.stringify({ exported: new Date().toISOString(), workers, entries, signatures, templates, audit: audit_ }, null, 1), { headers: {
          'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
          'content-disposition': `attachment; filename="hovirag-mentes-${today}.json"` } });
      }

      if (path === '/api/report' && method === 'GET') {
        const from = url.searchParams.get('from'), to = url.searchParams.get('to');
        const only = url.searchParams.get('worker');
        if (!isDate(from) || !isDate(to) || from > to) return fail(400, 'Hibás időszak.');
        if (Date.parse(to) - Date.parse(from) > 1000 * 60 * 60 * 24 * 800) return fail(400, 'Az időszak legfeljebb 2 év lehet.');
        const one = only && only !== 'all';
        const workers = (await env.DB.prepare(
          one ? 'SELECT id, name FROM workers WHERE id = ?' : 'SELECT id, name FROM workers WHERE active = 1 ORDER BY name COLLATE NOCASE')
          .bind(...(one ? [Number(only)] : [])).all()).results;
        const rows = (await env.DB.prepare(
          'SELECT id, worker_id, date, minutes, kind, note FROM entries WHERE date <= ? ORDER BY date, id').bind(to).all()).results;
        const sigs = (await env.DB.prepare('SELECT id, worker_id, signed_on FROM signatures WHERE from_date = ? AND to_date = ?').bind(from, to).all()).results;
        const sheets = workers.map((w) => {
          const mine = rows.filter((r) => r.worker_id === w.id);
          const opening = mine.filter((r) => r.date < from).reduce((a, r) => a + r.minutes, 0);
          const entries = mine.filter((r) => r.date >= from);
          const sig = sigs.find((x) => x.worker_id === w.id);
          return { worker: w, opening, entries, closing: opening + entries.reduce((a, r) => a + r.minutes, 0), signed: sig ? { id: sig.id, signed_on: sig.signed_on } : null };
        });
        return json({ today, from, to, generated: today, sheets });
      }
    } catch (err) {
      console.error(err);
      return fail(500, 'Váratlan hiba történt.');
    }

    return fail(404, 'Nincs ilyen végpont.');
  },
};
