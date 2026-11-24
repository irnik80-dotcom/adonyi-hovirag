// Nyári beosztás – szerveroldal (külön modul, a fő alkalmazás tábláit csak olvassa).
// Egy terv egy JSON-dokumentum a summer_plans táblában; a version mező véd az egyidejű felülírás ellen.

const MAX_BYTES = 900 * 1024; // a D1 sorméret-korlátja 1 MB

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS summer_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    year INTEGER NOT NULL,
    data TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
];
let ready;
const ensure = (env) => (ready ??= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q))).catch((e) => { ready = undefined; throw e; }));

const clean = (s, max) => String(s ?? '').trim().slice(0, max);

export async function handleSummer(request, env, { path, method, json, fail, audit }) {
  await ensure(env);
  const body = async () => request.json().catch(() => ({}));

  // A fő alkalmazás dolgozói és munkakörei (csak olvasás)
  if (path === '/api/summer/context' && method === 'GET') {
    const workers = (await env.DB.prepare(
      `SELECT w.id, w.name, w.active, (SELECT group_id FROM staff_group_members g WHERE g.worker_id = w.id) AS group_ids
       FROM workers w ORDER BY w.name COLLATE NOCASE`).all()).results;
    const groups = (await env.DB.prepare('SELECT id, name FROM staff_groups ORDER BY id').all()).results;
    return json({ workers, groups });
  }

  // A fő alkalmazás Szabadság menüjének napjai egy időszakra (csak olvasás)
  if (path === '/api/summer/leaves' && method === 'GET') {
    const u = new URL(request.url);
    const from = u.searchParams.get('from') || '', to = u.searchParams.get('to') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return fail(400, 'Hibás időszak.');
    const leaves = (await env.DB.prepare('SELECT worker_id, date, note FROM leaves WHERE date BETWEEN ? AND ? ORDER BY worker_id, date').bind(from, to).all()).results;
    return json({ leaves });
  }

  if (path === '/api/summer/plans' && method === 'GET') {
    const plans = (await env.DB.prepare('SELECT id, name, year, version, created_at, updated_at, length(data) AS size FROM summer_plans ORDER BY year DESC, id DESC').all()).results;
    return json({ plans });
  }

  if (path === '/api/summer/plans' && method === 'POST') {
    const b = await body();
    const name = clean(b.name, 120) || 'Nyári beosztás';
    const year = Math.trunc(Number(b.year));
    if (!(year >= 2020 && year <= 2100)) return fail(400, 'Hibás év.');
    const data = JSON.stringify(b.data ?? {});
    if (data.length > MAX_BYTES) return fail(413, 'A terv túl nagy.');
    const row = await env.DB.prepare('INSERT INTO summer_plans (name, year, data) VALUES (?, ?, ?) RETURNING id, version').bind(name, year, data).first();
    await audit(env, 'summer.create', { id: row.id, name, year });
    return json(row);
  }

  const m = path.match(/^\/api\/summer\/plans\/(\d+)$/);
  if (m) {
    const id = Number(m[1]);
    if (method === 'GET') {
      const r = await env.DB.prepare('SELECT * FROM summer_plans WHERE id = ?').bind(id).first();
      if (!r) return fail(404, 'Nincs ilyen terv.');
      return json({ id: r.id, name: r.name, year: r.year, version: r.version, updated_at: r.updated_at, data: JSON.parse(r.data) });
    }
    if (method === 'PUT') {
      const b = await body();
      const data = JSON.stringify(b.data ?? {});
      if (data.length > MAX_BYTES) return fail(413, 'A terv túl nagy, nem menthető.');
      const name = clean(b.data?.name, 120) || 'Nyári beosztás';
      const year = Number(String(b.data?.period?.from || '').slice(0, 4)) || null;
      const r = await env.DB.prepare(
        `UPDATE summer_plans SET data = ?, name = ?, year = COALESCE(?, year), version = version + 1, updated_at = datetime('now')
         WHERE id = ? AND version = ? RETURNING version, updated_at`).bind(data, name, year, id, Math.trunc(Number(b.version))).first();
      if (!r) {
        const cur = await env.DB.prepare('SELECT version FROM summer_plans WHERE id = ?').bind(id).first();
        if (!cur) return fail(404, 'Nincs ilyen terv.');
        return json({ error: 'A tervet közben máshol módosították. Töltsd újra az oldalt.', conflict: true, version: cur.version }, 409);
      }
      return json(r);
    }
    if (method === 'DELETE') {
      const r = await env.DB.prepare('SELECT name FROM summer_plans WHERE id = ?').bind(id).first();
      if (!r) return fail(404, 'Nincs ilyen terv.');
      await env.DB.prepare('DELETE FROM summer_plans WHERE id = ?').bind(id).run();
      await audit(env, 'summer.delete', { id, name: r.name });
      return json({ ok: true });
    }
  }
  return fail(404, 'Nincs ilyen végpont.');
}
