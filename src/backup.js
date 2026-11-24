// Automatikus biztonsági mentés: a teljes adatbázis pillanatképe tömörítve, magában a D1-ben.
// Naponta egyszer a cron készíti, de kézzel is indítható; letölthető és visszaállítható.
// A pillanatkép nem tartalmazza a titkokat (jelszó-hash, push-kulcs) és az eszköz-feliratkozásokat.

const CHUNK = 900 * 1024; // a D1 egy mezőben ~1 MB-ot enged
const SKIP_TABLES = new Set(['backups', 'backup_chunks', 'login_failures', 'client_requests', 'push_subs', 'sqlite_sequence', '_cf_KV', 'd1_migrations']);
const SECRET_KEYS = ['admin_pw', 'session_epoch', 'vapid_jwk', 'vapid_pub', 'push_sub'];
const KEEP = { auto: 30, manual: 10, restore: 5 }; // + havonta az első automatikus mentés 12 hónapig

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL DEFAULT (datetime('now')),
    day TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('auto','manual','restore')),
    tables INTEGER NOT NULL,
    rows INTEGER NOT NULL,
    bytes INTEGER NOT NULL,
    raw_bytes INTEGER NOT NULL,
    chunks INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS backup_chunks (
    backup_id INTEGER NOT NULL,
    n INTEGER NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (backup_id, n)
  )`,
];
let ready;
const ensure = (env) => (ready ??= env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q))).catch((e) => { ready = undefined; throw e; }));

const q = (name) => `"${String(name).replace(/"/g, '""')}"`;

// Táblák és oszlopaik (a Cloudflare belső _cf_ tábláit nem lehet olvasni, kihagyjuk)
async function tableColumns(env) {
  const names = (await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND substr(name, 1, 4) <> '_cf_' ORDER BY name").all()).results
    .map((r) => r.name).filter((t) => !SKIP_TABLES.has(t));
  const info = await env.DB.batch(names.map((t) => env.DB.prepare(`PRAGMA table_info(${q(t)})`)));
  const out = {};
  names.forEach((t, i) => { out[t] = info[i].results.map((c) => c.name); });
  return out;
}

async function pipe(bytes, stream) {
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}
const gzip = (b) => pipe(b, new CompressionStream('gzip'));
const gunzip = (b) => pipe(b, new DecompressionStream('gzip'));

export async function snapshot(env) {
  const cols = await tableColumns(env);
  const names = Object.keys(cols);
  const res = await env.DB.batch(names.map((t) => env.DB.prepare(`SELECT * FROM ${q(t)}`)));
  const tables = {};
  let rows = 0;
  names.forEach((t, i) => {
    let r = res[i].results;
    if (t === 'settings') r = r.filter((x) => !SECRET_KEYS.includes(x.key));
    tables[t] = { columns: cols[t], rows: r.map((x) => cols[t].map((c) => x[c])) };
    rows += r.length;
  });
  return { app: 'adonyi-hovirag', format: 1, created: new Date().toISOString(), tables, rowCount: rows };
}

const budapestDay = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date());

export async function createBackup(env, kind = 'manual') {
  await ensure(env);
  const snap = await snapshot(env);
  const raw = new TextEncoder().encode(JSON.stringify(snap));
  const gz = await gzip(raw);
  const parts = [];
  for (let i = 0; i < gz.length; i += CHUNK) parts.push(gz.slice(i, i + CHUNK));
  const row = await env.DB.prepare(
    'INSERT INTO backups (day, kind, tables, rows, bytes, raw_bytes, chunks) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id, at')
    .bind(budapestDay(), kind, Object.keys(snap.tables).length, snap.rowCount, gz.length, raw.length, parts.length).first();
  await env.DB.batch(parts.map((p, n) => env.DB.prepare("INSERT INTO backup_chunks (backup_id, n, data) VALUES (?, ?, ?)").bind(row.id, n, p.buffer.slice(p.byteOffset, p.byteOffset + p.byteLength))));
  await prune(env);
  return { id: row.id, at: row.at, rows: snap.rowCount, bytes: gz.length };
}

// Megtartás: az utolsó 30 napi automatikus, 10 kézi, 5 visszaállítás előtti, és 12 hónapig havonta egy
async function prune(env) {
  const all = (await env.DB.prepare('SELECT id, day, kind FROM backups ORDER BY day DESC, id DESC').all()).results;
  const keep = new Set();
  for (const [kind, n] of Object.entries(KEEP)) all.filter((b) => b.kind === kind).slice(0, n).forEach((b) => keep.add(b.id));
  const months = new Map();
  for (const b of all.filter((x) => x.kind === 'auto').reverse()) if (!months.has(b.day.slice(0, 7))) months.set(b.day.slice(0, 7), b.id);
  [...months.values()].slice(-12).forEach((id) => keep.add(id));
  const drop = all.filter((b) => !keep.has(b.id)).map((b) => b.id);
  if (!drop.length) return;
  const list = drop.join(',');
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM backup_chunks WHERE backup_id IN (${list})`),
    env.DB.prepare(`DELETE FROM backups WHERE id IN (${list})`),
  ]);
}

async function loadBackup(env, id) {
  const meta = await env.DB.prepare('SELECT * FROM backups WHERE id = ?').bind(id).first();
  if (!meta) return null;
  const parts = (await env.DB.prepare('SELECT data FROM backup_chunks WHERE backup_id = ? ORDER BY n').bind(id).all()).results;
  if (parts.length !== meta.chunks) throw new Error('A mentés sérült (hiányzó darab).');
  const bufs = parts.map((p) => new Uint8Array(p.data));
  const gz = new Uint8Array(bufs.reduce((a, b) => a + b.length, 0));
  let off = 0; for (const b of bufs) { gz.set(b, off); off += b.length; }
  return { meta, text: new TextDecoder().decode(await gunzip(gz)) };
}

// Visszaállítás egyetlen tranzakcióban (D1 batch): előtte automatikusan ment egyet a jelenlegi állapotról
export async function restore(env, snap) {
  if (!snap || snap.app !== 'adonyi-hovirag' || snap.format !== 1 || typeof snap.tables !== 'object') throw new Error('Ez nem az alkalmazás mentésfájlja.');
  const cols = await tableColumns(env);
  const stmts = [env.DB.prepare('PRAGMA defer_foreign_keys = on')];
  let rows = 0, tables = 0;
  for (const [t, data] of Object.entries(snap.tables)) {
    if (!cols[t] || SKIP_TABLES.has(t) || !Array.isArray(data?.columns) || !Array.isArray(data?.rows)) continue;
    const use = data.columns.map((c, i) => [c, i]).filter(([c]) => cols[t].includes(c));
    if (!use.length) continue;
    tables++;
    stmts.push(t === 'settings'
      ? env.DB.prepare(`DELETE FROM settings WHERE key NOT IN (${SECRET_KEYS.map(() => '?').join(',')})`).bind(...SECRET_KEYS)
      : env.DB.prepare(`DELETE FROM ${q(t)}`));
    let src = data.rows.map((r) => Object.fromEntries(use.map(([c, i]) => [c, r[i] ?? null])));
    if (t === 'settings') src = src.filter((r) => !SECRET_KEYS.includes(r.key));
    // Soronként külön utasítás helyett nagyobb JSON-csomagok (json_each), így kevés lekérdezés kell
    let batch = [], size = 0;
    const flush = () => {
      if (!batch.length) return;
      const colList = use.map(([c]) => q(c)).join(', ');
      const sel = use.map(([c]) => `value ->> ${sqlStr('$."' + c + '"')}`).join(', ');
      stmts.push(env.DB.prepare(`INSERT INTO ${q(t)} (${colList}) SELECT ${sel} FROM json_each(?)`).bind(JSON.stringify(batch)));
      batch = []; size = 0;
    };
    for (const r of src) {
      const s = JSON.stringify(r).length;
      if (size + s > 700 * 1024) flush();
      batch.push(r); size += s; rows++;
    }
    flush();
  }
  if (!tables) throw new Error('A mentés nem tartalmaz visszaállítható adatot.');
  await env.DB.batch(stmts);
  return { tables, rows };
}
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

export async function handleBackup(request, env, ctx) {
  try { return await route(request, env, ctx); }
  catch (e) {
    const msg = String(e?.message || e).slice(0, 300);
    try { await ctx.audit(env, 'backup.fail', { error: msg }); } catch {}
    return ctx.fail(500, `A mentés nem sikerült: ${msg}`);
  }
}

async function route(request, env, { path, method, json, fail, audit }) {
  await ensure(env);
  if (path === '/api/backups' && method === 'GET') {
    const list = (await env.DB.prepare('SELECT id, at, day, kind, tables, rows, bytes, raw_bytes FROM backups ORDER BY id DESC').all()).results;
    return json({ backups: list });
  }
  if (path === '/api/backups' && method === 'POST') {
    const r = await createBackup(env, 'manual');
    await audit(env, 'backup.create', { id: r.id, rows: r.rows });
    return json(r);
  }
  let m = path.match(/^\/api\/backups\/(\d+)\/download$/);
  if (m && method === 'GET') {
    const b = await loadBackup(env, Number(m[1]));
    if (!b) return fail(404, 'Nincs ilyen mentés.');
    return new Response(b.text, { headers: {
      'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
      'content-disposition': `attachment; filename="hovirag-mentes-${b.meta.day}-${b.meta.id}.json"` } });
  }
  m = path.match(/^\/api\/backups\/(\d+|file)\/restore$/);
  if (m && method === 'POST') {
    let snap, from;
    if (m[1] === 'file') {
      const text = await request.text();
      if (text.length > 50 * 1024 * 1024) return fail(413, 'A fájl túl nagy.');
      try { snap = JSON.parse(text); } catch { return fail(400, 'A fájl nem olvasható (nem JSON).'); }
      from = 'fájl';
    } else {
      const b = await loadBackup(env, Number(m[1]));
      if (!b) return fail(404, 'Nincs ilyen mentés.');
      snap = JSON.parse(b.text); from = `#${b.meta.id} (${b.meta.day})`;
    }
    if (snap?.app !== 'adonyi-hovirag' || snap?.format !== 1) return fail(400, 'Ez nem az alkalmazás mentésfájlja. (A régi „Teljes mentés” JSON nem tölthető vissza.)');
    const pre = await createBackup(env, 'restore');
    try {
      const r = await restore(env, snap);
      await audit(env, 'backup.restore', { from, created: snap.created, ...r, safety: pre.id });
      return json({ ok: true, ...r, safety: pre.id });
    } catch (e) {
      return fail(400, `A visszaállítás nem sikerült, semmi nem változott. (${e.message})`);
    }
  }
  return fail(404, 'Nincs ilyen végpont.');
}

// Cron: naponta egy automatikus mentés (ha ma még nem volt)
export async function dailyBackup(env, audit) {
  await ensure(env);
  if (await env.DB.prepare("SELECT 1 FROM backups WHERE kind = 'auto' AND day = ?").bind(budapestDay()).first()) return null;
  const r = await createBackup(env, 'auto');
  await audit(env, 'backup.auto', { id: r.id, rows: r.rows, bytes: r.bytes });
  return r;
}
