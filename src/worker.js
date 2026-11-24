// Adonyi Hóvirág Óvoda – túlóra/szabadidő nyilvántartás (Cloudflare Worker + D1)
// Titkok (wrangler secret put): ADMIN_PASSWORD, SESSION_SECRET

import { NEVNAPOK } from './nevnapok.js';
import { handleSummer } from './summer.js';
import { SCHEMA, TEMPLATES_TABLE, DEFAULT_TEMPLATES, GROUPS_TABLE, DEFAULT_GROUPS } from './schema.js';

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

const PBKDF2_ITER = 100000;
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
async function getSetting(env, key) {
  return (await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first())?.value ?? null;
}
async function putSetting(env, key, value) {
  await env.DB.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();
}
// Ha a felületen már lecserélték a jelszót, az számít; különben a Cloudflare-ben megadott ADMIN_PASSWORD.
async function checkPassword(env, candidate) {
  const stored = await getSetting(env, 'admin_pw');
  if (stored) {
    const [salt, hash] = stored.split(':');
    return safeEqual(b64(await hashPassword(candidate, unb64(salt))), hash);
  }
  return Boolean(env.ADMIN_PASSWORD) && safeEqual(candidate, String(env.ADMIN_PASSWORD).trim());
}

async function makeToken(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const epoch = (await getSetting(env, 'session_epoch')) ?? '0';
  return `${exp}.${epoch}.${await hmac(env.SESSION_SECRET, `${exp}.${epoch}`)}`;
}

async function isLoggedIn(request, env) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`${COOKIE}=([^;]+)`));
  if (!m || !env.SESSION_SECRET) return false;
  const [exp, epoch, sig] = m[1].split('.');
  if (!exp || !epoch || !sig || Number(exp) < Date.now() / 1000) return false;
  if (!safeEqual(sig, await hmac(env.SESSION_SECRET, `${exp}.${epoch}`))) return false;
  return epoch === ((await getSetting(env, 'session_epoch')) ?? '0');
}

// 15 percen belül 5 hibás próbálkozás IP-nként (összesen 30) után átmeneti tiltás.
async function lockedOut(env, ip) {
  const mine = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE ip = ? AND at >= datetime('now', '-15 minutes')").bind(ip).first();
  const all = await env.DB.prepare("SELECT COUNT(*) AS n FROM login_failures WHERE at >= datetime('now', '-15 minutes')").first();
  return mine.n >= 5 || all.n >= 30;
}
async function recordFailure(env, ip) {
  await env.DB.prepare('INSERT INTO login_failures (ip) VALUES (?)').bind(ip).run();
  await env.DB.prepare("DELETE FROM login_failures WHERE at < datetime('now', '-1 day')").run();
  await audit(env, 'login.fail', { ip });
}
const LOCK_MSG = 'Túl sok hibás próbálkozás. Próbáld újra 15 perc múlva.';

const cookieHeader = (value, maxAge) =>
  `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

async function audit(env, action, detail) {
  await env.DB.prepare('INSERT INTO audit (action, detail) VALUES (?, ?)').bind(action, JSON.stringify(detail)).run();
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const cleanText = (s, max) => String(s ?? '').trim().slice(0, max);

// ---------- névnapok ----------
const normName = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// A névnaphoz használt keresztnevek: a „keresztnév” mező, ennek hiányában a név második szavától.
const firstNamesOf = (w) => {
  const src = w.first_name && w.first_name.trim() ? w.first_name : String(w.name).split(/\s+/).slice(1).join(' ');
  return src.split(/[,;\s]+/).map(normName).filter(Boolean);
};
// A dolgozó névnapjai az évben: [{ mm, dd, name }]
const nameDaysOf = (w) => {
  const fn = firstNamesOf(w); const out = [];
  if (!fn.length) return out;
  NEVNAPOK.forEach((month, mi) => month.forEach((day, di) => day.split(',').forEach((n) => { if (fn.includes(normName(n))) out.push({ mm: mi + 1, dd: di + 1, name: n.trim() }); })));
  return out;
};
// A keresztnév sosem hagyja el a szervert: kifelé csak az látszik, hogy meg van-e adva.
const hideFirstName = (w) => { const { first_name: fn, ...rest } = w; return { ...rest, has_first_name: fn && fn.trim() ? 1 : 0 }; };
const dayDiff = (isoA, isoB) => Math.round((Date.parse(isoB + 'T00:00:00Z') - Date.parse(isoA + 'T00:00:00Z')) / 864e5);
// Az aktív dolgozók következő névnapjai a mai naptól számított `days` napon belül (a mai nap is).
function upcomingNameDays(workers, todayStr, days) {
  const [ty] = todayStr.split('-').map(Number); const out = [];
  for (const w of workers) for (const nd of nameDaysOf(w)) {
    let date = `${ty}-${String(nd.mm).padStart(2, '0')}-${String(nd.dd).padStart(2, '0')}`;
    if (date < todayStr) date = `${ty + 1}-${date.slice(5)}`;
    const inDays = dayDiff(todayStr, date);
    if (inDays <= days) out.push({ worker_id: w.id, name: w.name, date, in_days: inDays });
  }
  return out.sort((a, b) => a.in_days - b.in_days || a.name.localeCompare(b.name, 'hu'));
}

// ---------- munkaszüneti napok ----------
// Húsvétvasárnap (gergely-naptár, Meeus/Jones/Butcher)
function easterSunday(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}
const addDays = (d, n) => new Date(d.getTime() + n * 864e5).toISOString().slice(0, 10);
// Törvényi munkaszüneti napok. Az áthelyezett pihenő- és munkanapokat (évente rendelet) kézzel lehet megadni.
function holidaysOf(y) {
  const e = easterSunday(y);
  return [[`${y}-01-01`, 'Újév'], [`${y}-03-15`, 'Nemzeti ünnep (március 15.)'], [addDays(e, -2), 'Nagypéntek'], [addDays(e, 0), 'Húsvétvasárnap'], [addDays(e, 1), 'Húsvéthétfő'],
    [`${y}-05-01`, 'A munka ünnepe'], [addDays(e, 49), 'Pünkösdvasárnap'], [addDays(e, 50), 'Pünkösdhétfő'], [`${y}-08-20`, 'Államalapítás ünnepe'],
    [`${y}-10-23`, 'Nemzeti ünnep (október 23.)'], [`${y}-11-01`, 'Mindenszentek'], [`${y}-12-25`, 'Karácsony'], [`${y}-12-26`, 'Karácsony másnapja']]
    .map(([date, label]) => ({ date, label, kind: 'off', custom: false }));
}

// ---------- Web Push (VAPID, tartalom nélküli értesítés) ----------
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function vapidKeys(env) {
  const pub = await getSetting(env, 'vapid_pub'); const jwk = await getSetting(env, 'vapid_jwk');
  if (pub && jwk) return { pub, jwk: JSON.parse(jwk) };
  const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pubRaw = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
  const privJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
  await putSetting(env, 'vapid_pub', pubRaw); await putSetting(env, 'vapid_jwk', JSON.stringify(privJwk));
  return { pub: pubRaw, jwk: privJwk };
}
async function vapidHeader(env, endpoint) {
  const { pub, jwk } = await vapidKeys(env);
  const sub = (await getSetting(env, 'push_sub')) || 'https://adonyi-hovirag.workers.dev';
  const part = (o) => b64u(enc.encode(JSON.stringify(o)));
  const head = part({ typ: 'JWT', alg: 'ES256' });
  const body = part({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub });
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)));
  return `vapid t=${head}.${body}.${sig}, k=${pub}`;
}
// Minden feliratkozott eszköznek tartalom nélküli értesítést küld; az eszköz a szövegét az /api/push/last végponton kéri le.
async function pushAll(env) {
  const subs = (await env.DB.prepare('SELECT endpoint FROM push_subs').all()).results;
  let sent = 0, removed = 0, failed = 0;
  for (const s of subs) {
    try {
      const res = await fetch(s.endpoint, { method: 'POST', headers: { Authorization: await vapidHeader(env, s.endpoint), TTL: '86400', Urgency: 'normal' } });
      if (res.ok) sent++;
      else if (res.status === 404 || res.status === 410) { await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run(); removed++; }
      else failed++;
    } catch { failed++; }
  }
  return { sent, removed, failed, total: subs.length };
}
const shortHu = (iso) => new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z'));

const todayBudapest = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date());

// ?1 = a mai nap, ?2 = az előző hónap utolsó napja. Az egyenleg csak a mai napig (és azt is beleértve) rögzített tételeket számolja,
// a jövőbeli, tervezett szabadidő külön oszlop.
const BALANCES = `
  SELECT w.id, w.name, w.first_name, w.active,
    COALESCE((SELECT SUM(minutes) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1), 0) AS balance,
    COALESCE((SELECT SUM(minutes) FROM entries e WHERE e.worker_id = w.id AND e.date > ?1), 0) AS planned,
    (SELECT MAX(date) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1) AS last_date,
    (SELECT minutes FROM entries x WHERE x.worker_id = w.id AND x.date <= ?1 ORDER BY x.date DESC, x.id DESC LIMIT 1) AS last_minutes,
    (SELECT MAX(to_date) FROM signatures s WHERE s.worker_id = w.id) AS signed_to,
    (SELECT signed_on FROM signatures s WHERE s.worker_id = w.id ORDER BY to_date DESC, id DESC LIMIT 1) AS signed_on,
    (SELECT COUNT(*) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?1
       AND e.date > COALESCE((SELECT MAX(to_date) FROM signatures s WHERE s.worker_id = w.id), '0000-00-00')) AS unsigned,
    (SELECT COUNT(*) FROM entries e WHERE e.worker_id = w.id AND e.date <= ?2
       AND e.date > COALESCE((SELECT MAX(to_date) FROM signatures s WHERE s.worker_id = w.id), '0000-00-00')) AS unsigned_old,
    (SELECT GROUP_CONCAT(group_id) FROM staff_group_members g WHERE g.worker_id = w.id) AS group_ids,
    (SELECT MAX(at) FROM audit a WHERE a.action = 'worker.update' AND (a.detail LIKE '%"active":false%' OR a.detail LIKE '%"status":"left"%')
       AND (a.detail LIKE '{"id":' || w.id || ',%' OR a.detail LIKE '{"id":' || w.id || '}')) AS inactive_since,
    (SELECT note FROM worker_park p WHERE p.worker_id = w.id) AS park_note,
    (SELECT since FROM worker_park p WHERE p.worker_id = w.id) AS park_since,
    (SELECT until FROM worker_park p WHERE p.worker_id = w.id) AS park_until
  FROM workers w`;
const prevMonthEnd = (todayStr) => { const [y, m] = todayStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10); };
const getGroups = async (env) => (await env.DB.prepare('SELECT id, name FROM staff_groups ORDER BY id').all()).results;

let schemaReady;
async function runSchema(env) {
  await env.DB.batch(SCHEMA.map((q) => env.DB.prepare(q)));
  // Keresztnév a névnapokhoz (nem jelenik meg a listákban)
  try { await env.DB.prepare('SELECT first_name FROM workers LIMIT 1').first(); }
  catch { await env.DB.prepare("ALTER TABLE workers ADD COLUMN first_name TEXT NOT NULL DEFAULT ''").run(); }
  const had = await env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'note_templates'").first();
  await env.DB.prepare(TEMPLATES_TABLE).run();
  if (!had) {
    await env.DB.batch(DEFAULT_TEMPLATES.map((t) => env.DB.prepare('INSERT INTO note_templates (text) VALUES (?)').bind(t)));
  }
  // Egy dolgozónak egy munkaköre lehet: a korábbi többszörös hozzárendelésből a legkisebb azonosítójú marad.
  await env.DB.prepare('DELETE FROM staff_group_members WHERE group_id > (SELECT MIN(m.group_id) FROM staff_group_members m WHERE m.worker_id = staff_group_members.worker_id)').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS member_one_group ON staff_group_members(worker_id)').run();
  const hadGroups = await env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type = 'table' AND name = 'staff_groups'").first();
  await env.DB.prepare(GROUPS_TABLE).run();
  if (!hadGroups) {
    await env.DB.batch(DEFAULT_GROUPS.map((t) => env.DB.prepare('INSERT INTO staff_groups (name) VALUES (?)').bind(t)));
    await putSetting(env, 'seed_egyeb', '1');
  } else if (!(await getSetting(env, 'seed_egyeb'))) {
    // Meglévő adatbázisban az „Egyéb” (nem nevelő munka) munkakört egyszer vesszük fel; ha később törlik, nem kerül vissza.
    if (!(await env.DB.prepare("SELECT 1 AS x FROM staff_groups WHERE name = 'Egyéb'").first())) await env.DB.prepare("INSERT INTO staff_groups (name) VALUES ('Egyéb')").run();
    await putSetting(env, 'seed_egyeb', '1');
  }
  // Egyszeri javítás: minden nyitó egyenleg dátuma a nevelési év kezdete (2026. 09. 01.), és a korábbi aláírás-jelölések visszavonva.
  // A papírról átvett egyenleg így az első valódi tétel elé kerül. A flag miatt csak egyszer fut le.
  if (!(await getSetting(env, 'mig_opening_sep1'))) {
    await putSetting(env, 'mig_opening_sep1', '1');
    const upd = await env.DB.prepare("UPDATE entries SET date = '2026-09-01' WHERE kind = 'opening' AND date <> '2026-09-01'").run();
    const sig = await env.DB.prepare('DELETE FROM signatures').run();
    const early = (await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE kind <> 'opening' AND date < '2026-09-01'").first()).n;
    await audit(env, 'migration.opening', { date: '2026-09-01', opening: upd.meta?.changes ?? 0, signatures: sig.meta?.changes ?? 0, earlier: early });
  }
}
const ensureSchema = (env) => (schemaReady ??= runSchema(env).catch((e) => { schemaReady = undefined; throw e; }));

async function buildReport(env, url, today) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  const only = url.searchParams.get('worker');
  if (!isDate(from) || !isDate(to) || from > to) return { error: 'Hibás időszak.' };
  if (Date.parse(to) - Date.parse(from) > 1000 * 60 * 60 * 24 * 800) return { error: 'Az időszak legfeljebb 2 év lehet.' };
  const grp = /^g\d+$/.test(only || '');
  const one = only && only !== 'all' && !grp;
  const workers = (await env.DB.prepare(
    one ? 'SELECT id, name FROM workers WHERE id = ?'
      : grp ? 'SELECT w.id, w.name FROM workers w JOIN staff_group_members g ON g.worker_id = w.id WHERE w.active = 1 AND g.group_id = ? ORDER BY w.name COLLATE NOCASE'
      : 'SELECT id, name FROM workers WHERE active = 1 ORDER BY name COLLATE NOCASE')
    .bind(...(one ? [Number(only)] : grp ? [Number(only.slice(1))] : [])).all()).results;
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
  let scope = { type: 'all', name: 'Mindenki' };
  if (grp) scope = { type: 'group', name: (await env.DB.prepare('SELECT name FROM staff_groups WHERE id = ?').bind(Number(only.slice(1))).first())?.name || 'Csoport' };
  else if (one) scope = { type: 'worker', name: workers[0]?.name || '' };
  return { today, from, to, generated: today, scope, sheets };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    await ensureSchema(env);
    const ip = request.headers.get('cf-connecting-ip') || 'ismeretlen';

    if (path === '/api/login' && method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return fail(500, 'A szerver még nincs beállítva.');
      if (await lockedOut(env, ip)) return fail(429, LOCK_MSG);
      if (!(await checkPassword(env, String(body.password ?? '').trim()))) {
        await recordFailure(env, ip);
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

    const today = todayBudapest();
    const prevEnd = prevMonthEnd(today);

    try {
      // Nyári beosztás: külön modul (src/summer.js)
      if (path.startsWith('/api/summer/')) return await handleSummer(request, env, { path, method, json, fail, audit });

      if (path === '/api/workers' && method === 'GET') {
        const { results } = await env.DB.prepare(`${BALANCES} ORDER BY w.active DESC, w.name COLLATE NOCASE`).bind(today, prevEnd).all();
        const upcoming = (await env.DB.prepare(
          `SELECT e.id, e.date, e.minutes, e.note, w.id AS worker_id, w.name
           FROM entries e JOIN workers w ON w.id = e.worker_id
           WHERE e.date > ? AND e.kind = 'use' AND w.active = 1
             AND NOT EXISTS (SELECT 1 FROM entries r WHERE r.reverses_id = e.id)
           ORDER BY e.date, e.id LIMIT 12`).bind(today).all()).results;
        const todayOff = (await env.DB.prepare(
          `SELECT e.id, e.minutes, e.note, w.id AS worker_id, w.name
           FROM entries e JOIN workers w ON w.id = e.worker_id
           WHERE e.date = ? AND e.kind = 'use' AND w.active = 1
             AND NOT EXISTS (SELECT 1 FROM entries r WHERE r.reverses_id = e.id)
           ORDER BY w.name COLLATE NOCASE`).bind(today).all()).results;
        const leaveToday = (await env.DB.prepare(
          `SELECT l.id, w.id AS worker_id, w.name FROM leaves l JOIN workers w ON w.id = l.worker_id WHERE l.date = ? AND w.active = 1 ORDER BY w.name COLLATE NOCASE`).bind(today).all()).results;
        const warnHigh = Number((await getSetting(env, 'warn_high_min')) ?? 2400);
        return json({ today, prev_month_end: prevEnd, workers: results.map(hideFirstName), upcoming, today_off: todayOff, leave_today: leaveToday, namedays: upcomingNameDays(results.filter((x) => x.active === 1), today, 7), nameday_next: upcomingNameDays(results.filter((x) => x.active === 1), today, 366)[0] || null, groups: await getGroups(env), warn_high_min: warnHigh });
      }

      if (path === '/api/workers' && method === 'POST') {
        const b = await request.json();
        const name = cleanText(b.name, 80);
        if (!name) return fail(400, 'Add meg a dolgozó nevét.');
        if (b.date !== undefined && (!isDate(b.date) || b.date > today)) return fail(400, 'A nyitó egyenleg dátuma nem lehet jövőbeli vagy hibás.');
        const opening = Math.trunc(Number(b.opening_minutes) || 0);
        const wantGroups = (Array.isArray(b.group_ids) ? b.group_ids : []).map(Number).filter(Number.isInteger).slice(0, 1);
        const groupCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM staff_groups').first()).n;
        if (groupCount > 0) {
          if (!wantGroups.length) return fail(400, 'Válassz munkakört a dolgozónak.');
          if (!(await env.DB.prepare('SELECT id FROM staff_groups WHERE id = ?').bind(wantGroups[0]).first())) return fail(400, 'Nincs ilyen munkakör.');
        }
        const w = await env.DB.prepare('INSERT INTO workers (name, first_name) VALUES (?, ?) RETURNING id').bind(name, cleanText(b.first_name, 60)).first();
        if (opening !== 0) {
          const date = isDate(b.date) ? b.date : today;
          await env.DB.prepare("INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, 'opening', ?)")
            .bind(w.id, date, opening, 'Nyitó egyenleg a papír nyilvántartásból').run();
        }
        const gids = (Array.isArray(b.group_ids) ? b.group_ids : []).map(Number).filter(Number.isInteger).slice(0, 1);
        if (gids.length) await env.DB.batch(gids.map((g) => env.DB.prepare('INSERT OR IGNORE INTO staff_group_members (worker_id, group_id) VALUES (?, ?)').bind(w.id, g)));
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
        if (b.first_name !== undefined) await env.DB.prepare('UPDATE workers SET first_name = ? WHERE id = ?').bind(cleanText(b.first_name, 60), id).run();
        // Állapot: active (aktív), parked (parkoltatott, pl. GYES), left (kilépett)
        const status = b.status ?? (b.active !== undefined ? (b.active ? 'active' : 'left') : undefined);
        let note;
        if (status !== undefined) {
          const code = { active: 1, left: 0, parked: 2 }[status];
          if (code === undefined) return fail(400, 'Hibás állapot.');
          await env.DB.prepare('UPDATE workers SET active = ? WHERE id = ?').bind(code, id).run();
          if (status === 'parked') {
            note = cleanText(b.park_note, 80);
            const until = isDate(b.park_until) ? b.park_until : null;
            await env.DB.prepare('INSERT INTO worker_park (worker_id, note, since, until) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(worker_id) DO UPDATE SET note = ?2, until = ?4')
              .bind(id, note, today, until).run();
          } else {
            await env.DB.prepare('DELETE FROM worker_park WHERE worker_id = ?').bind(id).run();
          }
        }
        await audit(env, 'worker.update', { id, name: b.name, status, note: note || undefined, fn: b.first_name !== undefined ? true : undefined });
        return json({ ok: true });
      }

      m = path.match(/^\/api\/workers\/(\d+)$/);
      if (m && method === 'DELETE') {
        const id = Number(m[1]);
        const cur = await env.DB.prepare('SELECT id, active FROM workers WHERE id = ?').bind(id).first();
        if (!cur) return fail(404, 'Nincs ilyen dolgozó.');
        if (cur.active) return fail(409, 'Előbb jelöld kilépettnek a dolgozót, utána törölhető.');
        const count = (await env.DB.prepare('SELECT COUNT(*) AS n FROM entries WHERE worker_id = ?').bind(id).first()).n;
        // A naplóból eltávolítjuk a dolgozó nevét és a megjegyzések szövegét; csak a név nélküli azonosító marad.
        const rows = (await env.DB.prepare('SELECT id, action, detail FROM audit').all()).results;
        const scrub = [];
        for (const r of rows) {
          let d; try { d = JSON.parse(r.detail); } catch { continue; }
          const own = r.action.startsWith('worker.') && d.id === id;
          const note = r.action === 'entry.note' && d.workerId === id;
          if (own || note) {
            delete d.name; delete d.from; delete d.to; delete d.note; d.deleted = true;
            scrub.push(env.DB.prepare('UPDATE audit SET detail = ? WHERE id = ?').bind(JSON.stringify(d), r.id));
          }
        }
        await env.DB.batch([
          env.DB.prepare('DELETE FROM entries WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM signatures WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM staff_group_members WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM worker_park WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM leaves WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM leave_budget WHERE worker_id = ?').bind(id),
          env.DB.prepare('DELETE FROM workers WHERE id = ?').bind(id),
          ...scrub,
        ]);
        await audit(env, 'worker.delete', { id, entries: count });
        return json({ ok: true, deleted_entries: count });
      }

      // Dolgozók tömeges felvétele (induláskor a papír nyilvántartásból): név, munkakör, nyitó egyenleg
      if (path === '/api/workers/bulk' && method === 'POST') {
        const b = await request.json();
        const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 100)
          .map((r) => ({ name: cleanText(r.name, 80), fn: cleanText(r.first_name, 60), gid: Number(r.group_id), open: Math.trunc(Number(r.opening_minutes) || 0) }));
        if (!rows.length) return fail(400, 'Nincs felvehető dolgozó.');
        const groupIds = new Set((await getGroups(env)).map((g) => g.id));
        for (const r of rows) {
          if (!r.name) return fail(400, 'Üres név a listában.');
          if (groupIds.size && !groupIds.has(r.gid)) return fail(400, `${r.name}: válassz munkakört.`);
          if (Math.abs(r.open) > 60 * 24 * 365) return fail(400, `${r.name}: túl nagy nyitó egyenleg.`);
        }
        if (b.date !== undefined && (!isDate(b.date) || b.date > today)) return fail(400, 'A nyitó egyenleg dátuma nem lehet jövőbeli vagy hibás.');
        const date = isDate(b.date) ? b.date : today;
        const ins = await env.DB.batch(rows.map((r) => env.DB.prepare('INSERT INTO workers (name, first_name) VALUES (?, ?) RETURNING id').bind(r.name, r.fn)));
        const ids = ins.map((x) => x.results[0].id);
        const stmts = [];
        rows.forEach((r, i) => {
          if (r.open !== 0) stmts.push(env.DB.prepare("INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, 'opening', ?)").bind(ids[i], date, r.open, 'Nyitó egyenleg a papír nyilvántartásból'));
          if (groupIds.size) stmts.push(env.DB.prepare('INSERT INTO staff_group_members (worker_id, group_id) VALUES (?, ?)').bind(ids[i], r.gid));
        });
        if (stmts.length) await env.DB.batch(stmts);
        await audit(env, 'worker.bulk', { count: ids.length });
        return json({ added: ids.length }, 201);
      }

      m = path.match(/^\/api\/workers\/(\d+)\/groups$/);
      if (m && method === 'PUT') {
        const id = Number(m[1]);
        const b = await request.json();
        const gids = [...new Set((Array.isArray(b.group_ids) ? b.group_ids : []).map(Number).filter(Number.isInteger))];
        if (gids.length > 1) return fail(400, 'Egy dolgozónak egy munkaköre lehet.');
        if (!(await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(id).first())) return fail(404, 'Nincs ilyen dolgozó.');
        await env.DB.batch([env.DB.prepare('DELETE FROM staff_group_members WHERE worker_id = ?').bind(id),
          ...gids.map((g) => env.DB.prepare('INSERT INTO staff_group_members (worker_id, group_id) VALUES (?, ?)').bind(id, g))]);
        await audit(env, 'worker.groups', { id, gids });
        return json({ ok: true });
      }

      if (path === '/api/groups' && method === 'POST') {
        const name = cleanText((await request.json()).name, 60);
        if (!name) return fail(400, 'Add meg a munkakör nevét.');
        const row = await env.DB.prepare('INSERT INTO staff_groups (name) VALUES (?) RETURNING id').bind(name).first();
        await audit(env, 'group.create', { id: row.id, name });
        return json({ id: row.id }, 201);
      }
      m = path.match(/^\/api\/groups\/(\d+)$/);
      if (m && method === 'DELETE') {
        const id = Number(m[1]);
        await env.DB.batch([env.DB.prepare('DELETE FROM staff_group_members WHERE group_id = ?').bind(id), env.DB.prepare('DELETE FROM staff_groups WHERE id = ?').bind(id)]);
        await audit(env, 'group.delete', { id });
        return json({ ok: true });
      }

      if (path === '/api/settings' && method === 'PUT') {
        const b = await request.json();
        if (b.warn_high_hours !== undefined) {
          const h = Math.max(0, Math.min(1000, Math.trunc(Number(b.warn_high_hours) || 0)));
          await putSetting(env, 'warn_high_min', String(h * 60));
          await audit(env, 'settings.warn', { hours: h });
        }
        return json({ ok: true });
      }

      // Tétel javítása: a megjegyzés és a dátum módosítható. Az időtartamot sztornóval kell javítani.
      m = path.match(/^\/api\/entries\/(\d+)$/);
      if (m && method === 'PATCH') {
        const id = Number(m[1]);
        const b = await request.json();
        const e = await env.DB.prepare('SELECT * FROM entries WHERE id = ?').bind(id).first();
        if (!e) return fail(404, 'Nincs ilyen tétel.');
        const newNote = b.note !== undefined ? cleanText(b.note, 300) : e.note;
        const newDate = b.date !== undefined ? String(b.date) : e.date;
        if (!isDate(newDate)) return fail(400, 'Hibás dátum.');
        // Az időtartam pozitív egészként érkezik; az előjelet a tétel típusa adja (szabadidő: negatív, nyitó: marad).
        let newMin = e.minutes;
        if (b.minutes !== undefined) {
          const m = Math.trunc(Number(b.minutes));
          if (!Number.isInteger(m) || m <= 0 || m > 60 * 24 * 31) return fail(400, 'Adj meg 0-nál nagyobb időtartamot.');
          newMin = e.kind === 'use' ? -m : e.kind === 'opening' ? Math.sign(e.minutes) * m : m;
        }
        const dateChanged = newDate !== e.date;
        const noteChanged = newNote !== e.note;
        const minChanged = newMin !== e.minutes;
        if (!dateChanged && !noteChanged && !minChanged) return json({ ok: true });
        if (dateChanged || minChanged) {
          if (e.kind === 'reversal') return fail(400, 'A sztornó tétel nem módosítható, csak a megjegyzése.');
          if (await env.DB.prepare('SELECT 1 AS x FROM entries WHERE reverses_id = ?').bind(id).first()) return fail(409, 'A sztornózott tétel dátuma és időtartama nem módosítható, csak a megjegyzése.');
        }
        if (dateChanged && e.kind === 'credit' && newDate > today) return fail(400, 'Túlórát csak már megtörtént napra lehet rögzíteni.');
        const sig = await env.DB.prepare('SELECT MAX(to_date) AS t FROM signatures WHERE worker_id = ?').bind(e.worker_id).first();
        const touchesSigned = Boolean(sig?.t) && (e.date <= sig.t || (dateChanged && newDate <= sig.t));
        if (touchesSigned && !b.confirm_signed) {
          return json({ error: 'Az időszak már alá van írva.', needs_confirm: true, workers: [{ name: '', signed_to: sig.t }] }, 409);
        }
        await env.DB.prepare('UPDATE entries SET note = ?, date = ?, minutes = ? WHERE id = ?').bind(newNote, newDate, newMin, id).run();
        if (noteChanged) await audit(env, 'entry.note', { id, workerId: e.worker_id, from: e.note, to: newNote, overrideSigned: touchesSigned || undefined });
        if (minChanged) await audit(env, 'entry.minutes', { id, workerId: e.worker_id, from: e.minutes, to: newMin, overrideSigned: touchesSigned || undefined });
        if (dateChanged) await audit(env, 'entry.date', { id, workerId: e.worker_id, from: e.date, to: newDate, overrideSigned: touchesSigned || undefined });
        return json({ ok: true });
      }

      if (path === '/api/signatures/bulk' && method === 'POST') {
        const b = await request.json();
        const ids = [...new Set((Array.isArray(b.worker_ids) ? b.worker_ids : []).map(Number).filter(Number.isInteger))].slice(0, 200);
        if (!ids.length || !isDate(b.from) || !isDate(b.to) || b.from > b.to || !isDate(b.signed_on)) return fail(400, 'Hibás adat.');
        const stmts = ids.map((wid) => env.DB.prepare(
          `INSERT INTO signatures (worker_id, from_date, to_date, signed_on)
           SELECT ?1, ?2, ?3, ?4 WHERE EXISTS (SELECT 1 FROM workers WHERE id = ?1)
             AND NOT EXISTS (SELECT 1 FROM signatures WHERE worker_id = ?1 AND from_date = ?2 AND to_date = ?3)`).bind(wid, b.from, b.to, b.signed_on));
        const out = await env.DB.batch(stmts);
        const added = out.reduce((s, r) => s + (r.meta?.changes || 0), 0);
        await audit(env, 'signature.bulk', { from: b.from, to: b.to, count: added });
        return json({ added });
      }

      m = path.match(/^\/api\/workers\/(\d+)\/entries$/);
      if (m && method === 'GET') {
        const id = Number(m[1]);
        const worker = await env.DB.prepare(`${BALANCES} WHERE w.id = ?3`).bind(today, prevEnd, id).first();
        if (!worker) return fail(404, 'Nincs ilyen dolgozó.');
        const { results } = await env.DB.prepare(
          `SELECT e.*, (SELECT 1 FROM entries r WHERE r.reverses_id = e.id) AS reversed
           FROM entries e WHERE e.worker_id = ? ORDER BY e.date DESC, e.id DESC`).bind(id).all();
        const signatures = (await env.DB.prepare('SELECT * FROM signatures WHERE worker_id = ? ORDER BY to_date DESC, id DESC').bind(id).all()).results;
        return json({ today, worker: hideFirstName(worker), entries: results, signatures, namedays: nameDaysOf(worker).map(({ mm, dd }) => ({ mm, dd })), groups: await getGroups(env) });
      }

      if (path === '/api/entries' && method === 'POST') {
        const b = await request.json();
        const clientId = cleanText(b.client_id, 64);
        if (clientId) {
          const done = await env.DB.prepare('SELECT ids FROM client_requests WHERE client_id = ?').bind(clientId).first();
          if (done) return json({ ids: JSON.parse(done.ids), duplicate: true });
        }
        const ids = [...new Set((Array.isArray(b.worker_ids) ? b.worker_ids : [b.worker_id]).map(Number))].filter(Number.isInteger);
        const minutes = Math.trunc(Number(b.minutes));
        const kind = b.kind === 'use' ? 'use' : 'credit';
        if (!ids.length) return fail(400, 'Válassz legalább egy dolgozót.');
        if (ids.length > 100) return fail(400, 'Túl sok dolgozó.');
        if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 60 * 24 * 31) return fail(400, 'Adj meg 0-nál nagyobb időtartamot.');
        // Egy vagy több nap (dates), minden naphoz külön tétel készül.
        const dates = [...new Set((Array.isArray(b.dates) && b.dates.length ? b.dates : [b.date]).map(String))].sort();
        if (!dates.length || dates.some((d) => !isDate(d))) return fail(400, 'Hibás dátum.');
        if (dates.length > 62) return fail(400, 'Legfeljebb 62 nap jelölhető ki egyszerre.');
        if (ids.length * dates.length > 120) return fail(400, 'Túl sok tétel egyszerre (legfeljebb 120).');
        if (kind === 'credit' && dates.some((d) => d > today)) return fail(400, 'Túlórát csak már megtörtént napra lehet rögzíteni.');
        const ph = ids.map(() => '?').join(',');
        const found = (await env.DB.prepare(`SELECT id FROM workers WHERE id IN (${ph})`).bind(...ids).all()).results;
        if (found.length !== ids.length) return fail(404, 'Nincs ilyen dolgozó.');
        // Már aláírt időszakba eső tétel megváltoztatná az aláírt papír tartalmát: csak megerősítéssel.
        const signedHits = (await env.DB.prepare(
          `SELECT w.name, MAX(s.to_date) AS signed_to FROM signatures s JOIN workers w ON w.id = s.worker_id
           WHERE s.worker_id IN (${ph}) GROUP BY s.worker_id`).bind(...ids).all()).results.filter((r) => dates[0] <= r.signed_to);
        if (signedHits.length && !b.confirm_signed) {
          return json({ error: 'Az időszak már alá van írva.', needs_confirm: true, workers: signedHits }, 409);
        }
        const signed = kind === 'use' ? -minutes : minutes;
        const note = cleanText(b.note, 300);
        const out = await env.DB.batch(ids.flatMap((wid) => dates.map((d) =>
          env.DB.prepare('INSERT INTO entries (worker_id, date, minutes, kind, note) VALUES (?, ?, ?, ?, ?) RETURNING id').bind(wid, d, signed, kind, note))));
        const created = out.map((r) => r.results[0].id);
        if (clientId) await env.DB.prepare('INSERT OR IGNORE INTO client_requests (client_id, ids) VALUES (?, ?)').bind(clientId, JSON.stringify(created)).run();
        await audit(env, 'entry.create', { ids: created, workerIds: ids, minutes: signed, kind, date: dates[0], dates: dates.length > 1 ? dates : undefined, overrideSigned: signedHits.length > 0 || undefined, offline: b.offline ? true : undefined });
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

      if (path === '/api/password' && method === 'POST') {
        const b = await request.json();
        if (await lockedOut(env, ip)) return fail(429, LOCK_MSG);
        const next = String(b.next ?? '').trim();
        if (!(await checkPassword(env, String(b.current ?? '').trim()))) {
          await recordFailure(env, ip);
          return fail(403, 'A jelenlegi jelszó hibás.');
        }
        if (next.length < 8) return fail(400, 'Az új jelszó legalább 8 karakter legyen.');
        if (next.length > 200) return fail(400, 'Az új jelszó túl hosszú.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        await putSetting(env, 'admin_pw', `${b64(salt)}:${b64(await hashPassword(next, salt))}`);
        // A többi eszköz munkamenete lejár, ez az eszköz új munkamenetet kap.
        await putSetting(env, 'session_epoch', String(Number((await getSetting(env, 'session_epoch')) ?? '0') + 1));
        await audit(env, 'password.change', {});
        return json({ ok: true }, 200, { 'set-cookie': cookieHeader(await makeToken(env), SESSION_SECONDS) });
      }

      if (path === '/api/audit' && method === 'GET') {
        const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 200));
        const log = (await env.DB.prepare('SELECT id, at, action, detail FROM audit ORDER BY id DESC LIMIT ?').bind(limit).all()).results
          .map((r) => ({ ...r, detail: (() => { try { return JSON.parse(r.detail); } catch { return {}; } })() }));
        const workers = Object.fromEntries((await env.DB.prepare('SELECT id, name FROM workers').all()).results.map((x) => [x.id, x.name]));
        return json({ log, workers });
      }

      if (path === '/api/calendar' && method === 'GET') {
        const month = url.searchParams.get('month') || today.slice(0, 7);
        if (!/^\d{4}-\d{2}$/.test(month)) return fail(400, 'Hibás hónap.');
        const entries = (await env.DB.prepare(
          `SELECT e.id, e.date, e.minutes, e.note, e.kind, w.id AS worker_id, w.name
           FROM entries e JOIN workers w ON w.id = e.worker_id
           WHERE e.kind IN ('use', 'credit') AND w.active = 1 AND e.date >= ? AND e.date <= ?
             AND NOT EXISTS (SELECT 1 FROM entries r WHERE r.reverses_id = e.id)
           ORDER BY e.date, w.name COLLATE NOCASE`).bind(`${month}-01`, `${month}-31`).all()).results;
        const leaves = (await env.DB.prepare(
          `SELECT l.id, l.date, w.id AS worker_id, w.name FROM leaves l JOIN workers w ON w.id = l.worker_id
           WHERE w.active = 1 AND l.date >= ? AND l.date <= ? ORDER BY l.date, w.name COLLATE NOCASE`).bind(`${month}-01`, `${month}-31`).all()).results;
        return json({ today, month, entries, leaves });
      }

      if (path === '/api/push/key' && method === 'GET') {
        const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subs').first()).n;
        return json({ key: (await vapidKeys(env)).pub, subscribed: n });
      }
      if (path === '/api/push/subscribe' && method === 'POST') {
        const b = await request.json();
        const endpoint = String(b.endpoint || '');
        if (!/^https?:\/\//.test(endpoint) || endpoint.length > 1000) return fail(400, 'Hibás feliratkozás.');
        await env.DB.prepare('INSERT INTO push_subs (endpoint, p256dh, auth) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth')
          .bind(endpoint, String(b.keys?.p256dh || ''), String(b.keys?.auth || '')).run();
        await putSetting(env, 'push_sub', url.origin);
        await audit(env, 'push.subscribe', {});
        return json({ ok: true });
      }
      if (path === '/api/push/unsubscribe' && method === 'POST') {
        await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(String((await request.json()).endpoint || '')).run();
        return json({ ok: true });
      }
      if (path === '/api/push/last' && method === 'GET') {
        return json({ text: (await getSetting(env, 'push_last_text')) || '' });
      }
      if (path === '/api/push/test' && method === 'POST') {
        await putSetting(env, 'push_last_text', 'Teszt értesítés: az értesítések működnek ezen az eszközön.');
        const r = await pushAll(env);
        await audit(env, 'push.test', r);
        return json(r);
      }

      // ---------- szabadságok ----------
      const yearOf = (v) => { const y = Number(v); return Number.isInteger(y) && y >= 2000 && y <= 2100 ? y : Number(today.slice(0, 4)); };
      if (path === '/api/leave/overview' && method === 'GET') {
        const year = yearOf(url.searchParams.get('year'));
        const ws = (await env.DB.prepare(
          `SELECT w.id, w.name, (SELECT group_id FROM staff_group_members g WHERE g.worker_id = w.id) AS group_id FROM workers w WHERE w.active = 1 ORDER BY w.name COLLATE NOCASE`).all()).results;
        const budgets = (await env.DB.prepare('SELECT * FROM leave_budget WHERE year IN (?1, ?2)').bind(year, year - 1).all()).results;
        const used = (await env.DB.prepare(
          `SELECT worker_id, CAST(substr(date, 1, 4) AS INTEGER) AS y, COUNT(*) AS n, SUM(CASE WHEN date <= ?3 THEN 1 ELSE 0 END) AS past
           FROM leaves WHERE substr(date, 1, 4) IN (?1, ?2) GROUP BY worker_id, y`).bind(String(year), String(year - 1), today).all()).results;
        const out = ws.map((x) => {
          const b = budgets.find((r) => r.worker_id === x.id && r.year === year) || { entitlement: 0, carry: 0 };
          const pb = budgets.find((r) => r.worker_id === x.id && r.year === year - 1) || { entitlement: 0, carry: 0 };
          const u = used.find((r) => r.worker_id === x.id && r.y === year) || { n: 0, past: 0 };
          const pu = used.find((r) => r.worker_id === x.id && r.y === year - 1) || { n: 0 };
          return { worker_id: x.id, name: x.name, group_id: x.group_id, entitlement: b.entitlement, carry: b.carry, used: u.past, planned: u.n - u.past,
            remaining: b.entitlement + b.carry - u.n, prev_remaining: pb.entitlement + pb.carry - pu.n, has_prev: Boolean(budgets.find((r) => r.worker_id === x.id && r.year === year - 1)) };
        });
        return json({ year, today, workers: out, groups: await getGroups(env) });
      }
      m = path.match(/^\/api\/leave\/worker\/(\d+)$/);
      if (m && method === 'GET') {
        const id = Number(m[1]); const year = yearOf(url.searchParams.get('year'));
        const wk = await env.DB.prepare('SELECT id, name, active FROM workers WHERE id = ?').bind(id).first();
        if (!wk) return fail(404, 'Nincs ilyen dolgozó.');
        const b = (await env.DB.prepare('SELECT entitlement, carry FROM leave_budget WHERE worker_id = ? AND year = ?').bind(id, year).first()) || { entitlement: 0, carry: 0 };
        const pb = await env.DB.prepare('SELECT entitlement, carry FROM leave_budget WHERE worker_id = ? AND year = ?').bind(id, year - 1).first();
        const pu = (await env.DB.prepare("SELECT COUNT(*) AS n FROM leaves WHERE worker_id = ? AND substr(date, 1, 4) = ?").bind(id, String(year - 1)).first()).n;
        const leaves = (await env.DB.prepare('SELECT id, date, note FROM leaves WHERE worker_id = ? AND substr(date, 1, 4) = ? ORDER BY date').bind(id, String(year)).all()).results;
        return json({ year, today, worker: wk, budget: b, prev_remaining: pb ? pb.entitlement + pb.carry - pu : null, leaves });
      }
      if (path === '/api/leave' && method === 'POST') {
        const b = await request.json();
        const wid = Number(b.worker_id);
        const dates = [...new Set((Array.isArray(b.dates) ? b.dates : []).map(String))].sort();
        if (!dates.length || dates.some((d) => !isDate(d))) return fail(400, 'Hibás dátum.');
        if (dates.length > 62) return fail(400, 'Legfeljebb 62 nap rögzíthető egyszerre.');
        if (!(await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(wid).first())) return fail(404, 'Nincs ilyen dolgozó.');
        const note = cleanText(b.note, 120);
        const out = await env.DB.batch(dates.map((d) => env.DB.prepare('INSERT OR IGNORE INTO leaves (worker_id, date, note) VALUES (?, ?, ?) RETURNING id').bind(wid, d, note)));
        const ids = out.flatMap((r) => (r.results || []).map((x) => x.id));
        await audit(env, 'leave.add', { workerId: wid, count: ids.length, from: dates[0], to: dates[dates.length - 1] });
        return json({ added: ids.length, skipped: dates.length - ids.length, ids }, 201);
      }
      if (path === '/api/leave/delete' && method === 'POST') {
        const ids = ((await request.json()).ids || []).map(Number).filter(Number.isInteger).slice(0, 100);
        if (!ids.length) return fail(400, 'Nincs törölendő nap.');
        const ph = ids.map(() => '?').join(',');
        const rows = (await env.DB.prepare(`SELECT worker_id, date FROM leaves WHERE id IN (${ph}) ORDER BY date`).bind(...ids).all()).results;
        await env.DB.prepare(`DELETE FROM leaves WHERE id IN (${ph})`).bind(...ids).run();
        if (rows.length) await audit(env, 'leave.delete', { workerId: rows[0].worker_id, count: rows.length, from: rows[0].date, to: rows[rows.length - 1].date });
        return json({ ok: true, deleted: rows.length });
      }
      if (path === '/api/leave/budget' && method === 'PUT') {
        const b = await request.json();
        const wid = Number(b.worker_id), year = yearOf(b.year);
        const ent = Math.trunc(Number(b.entitlement)), carry = Math.trunc(Number(b.carry) || 0);
        if (!Number.isInteger(ent) || ent < 0 || ent > 366 || !Number.isInteger(carry) || carry < -366 || carry > 366) return fail(400, 'Hibás napszám.');
        if (!(await env.DB.prepare('SELECT id FROM workers WHERE id = ?').bind(wid).first())) return fail(404, 'Nincs ilyen dolgozó.');
        await env.DB.prepare('INSERT INTO leave_budget (worker_id, year, entitlement, carry) VALUES (?, ?, ?, ?) ON CONFLICT(worker_id, year) DO UPDATE SET entitlement = excluded.entitlement, carry = excluded.carry')
          .bind(wid, year, ent, carry).run();
        await audit(env, 'leave.budget', { workerId: wid, year, entitlement: ent, carry });
        return json({ ok: true });
      }
      if (path === '/api/leave/report' && method === 'GET') {
        const year = yearOf(url.searchParams.get('year'));
        const mq = Number(url.searchParams.get('month'));
        const month = Number.isInteger(mq) && mq >= 1 && mq <= 12 ? mq : null;
        const only = url.searchParams.get('worker');
        const grp = /^g\d+$/.test(only || ''); const one = only && only !== 'all' && !grp;
        const ws = (await env.DB.prepare(
          one ? 'SELECT id, name FROM workers WHERE id = ?'
            : grp ? 'SELECT w.id, w.name FROM workers w JOIN staff_group_members g ON g.worker_id = w.id WHERE w.active = 1 AND g.group_id = ? ORDER BY w.name COLLATE NOCASE'
            : 'SELECT id, name FROM workers WHERE active = 1 ORDER BY name COLLATE NOCASE')
          .bind(...(one ? [Number(only)] : grp ? [Number(only.slice(1))] : [])).all()).results;
        const budgets = (await env.DB.prepare('SELECT * FROM leave_budget WHERE year = ?').bind(year).all()).results;
        const leaves = (await env.DB.prepare('SELECT worker_id, date FROM leaves WHERE substr(date, 1, 4) = ? ORDER BY date').bind(String(year)).all()).results;
        const mm = month ? String(month).padStart(2, '0') : null;
        const periodEnd = month ? `${year}-${mm}-31` : `${year}-12-31`;
        const rows = ws.map((x) => {
          const b = budgets.find((r) => r.worker_id === x.id) || { entitlement: 0, carry: 0 };
          const mine = leaves.filter((l) => l.worker_id === x.id).map((l) => l.date);
          const ytd = mine.filter((d) => d <= periodEnd);
          const inPeriod = month ? mine.filter((d) => d.slice(5, 7) === mm) : mine;
          const byMonth = Array.from({ length: 12 }, (_, i) => mine.filter((d) => Number(d.slice(5, 7)) === i + 1).length);
          return { worker: x, entitlement: b.entitlement, carry: b.carry, total: b.entitlement + b.carry, used_ytd: ytd.length, used_period: inPeriod.length,
            planned_after: mine.length - ytd.length, remaining: b.entitlement + b.carry - ytd.length, dates: inPeriod, by_month: byMonth };
        });
        let scope = { type: 'all', name: 'Mindenki' };
        if (grp) scope = { type: 'group', name: (await env.DB.prepare('SELECT name FROM staff_groups WHERE id = ?').bind(Number(only.slice(1))).first())?.name || 'Munkakör' };
        else if (one) scope = { type: 'worker', name: ws[0]?.name || '' };
        return json({ year, month, today, generated: today, scope, rows });
      }

      if (path === '/api/holidays' && method === 'GET') {
        const years = [...new Set((url.searchParams.get('years') || today.slice(0, 4)).split(',').map(Number).filter((y) => y >= 2000 && y <= 2100))].slice(0, 6);
        const special = (await env.DB.prepare('SELECT date, kind, label FROM special_days ORDER BY date').all()).results;
        const map = new Map(years.flatMap((y) => holidaysOf(y)).map((h) => [h.date, h]));
        for (const s of special) if (years.includes(Number(s.date.slice(0, 4)))) map.set(s.date, { date: s.date, label: s.label, kind: s.kind, custom: true });
        return json({ days: [...map.values()].sort((a, b) => a.date.localeCompare(b.date)) });
      }
      if (path === '/api/holidays' && method === 'POST') {
        const b = await request.json();
        if (!isDate(b.date)) return fail(400, 'Hibás dátum.');
        if (!['off', 'work'].includes(b.kind)) return fail(400, 'Hibás típus.');
        await env.DB.prepare('INSERT INTO special_days (date, kind, label) VALUES (?, ?, ?) ON CONFLICT(date) DO UPDATE SET kind = excluded.kind, label = excluded.label')
          .bind(b.date, b.kind, cleanText(b.label, 60)).run();
        await audit(env, 'holiday.set', { date: b.date, kind: b.kind });
        return json({ ok: true });
      }
      m = path.match(/^\/api\/holidays\/(\d{4}-\d{2}-\d{2})$/);
      if (m && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM special_days WHERE date = ?').bind(m[1]).run();
        await audit(env, 'holiday.delete', { date: m[1] });
        return json({ ok: true });
      }

      if (path === '/api/presets' && method === 'GET') {
        return json({ presets: (await env.DB.prepare('SELECT id, name, kind, minutes, note, target FROM entry_presets ORDER BY name COLLATE NOCASE').all()).results });
      }
      if (path === '/api/presets' && method === 'POST') {
        const b = await request.json();
        const name = cleanText(b.name, 40), minutes = Math.trunc(Number(b.minutes));
        if (!name) return fail(400, 'Adj nevet a sablonnak.');
        if (!['credit', 'use'].includes(b.kind)) return fail(400, 'Hibás típus.');
        if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 60 * 24) return fail(400, 'Adj meg 0-nál nagyobb időtartamot.');
        const target = /^(all|g\d+)$/.test(b.target || '') ? b.target : '';
        const row = await env.DB.prepare('INSERT INTO entry_presets (name, kind, minutes, note, target) VALUES (?, ?, ?, ?, ?) RETURNING id')
          .bind(name, b.kind, minutes, cleanText(b.note, 300), target).first();
        return json({ id: row.id }, 201);
      }
      m = path.match(/^\/api\/presets\/(\d+)$/);
      if (m && method === 'DELETE') {
        await env.DB.prepare('DELETE FROM entry_presets WHERE id = ?').bind(Number(m[1])).run();
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
        const specialDays = (await env.DB.prepare('SELECT * FROM special_days').all()).results;
        const presets = (await env.DB.prepare('SELECT * FROM entry_presets').all()).results;
        const leaves = (await env.DB.prepare('SELECT * FROM leaves ORDER BY id').all()).results;
        const leaveBudget = (await env.DB.prepare('SELECT * FROM leave_budget').all()).results;
        const groups = await getGroups(env);
        const parked = (await env.DB.prepare('SELECT * FROM worker_park').all()).results;
        const members = (await env.DB.prepare('SELECT * FROM staff_group_members').all()).results;
        return new Response(JSON.stringify({ exported: new Date().toISOString(), workers, entries, signatures, templates, groups, members, parked, specialDays, presets, leaves, leaveBudget, audit: audit_ }, null, 1), { headers: {
          'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
          'content-disposition': `attachment; filename="hovirag-mentes-${today}.json"` } });
      }

      if (path === '/api/report' && method === 'GET') {
        const r = await buildReport(env, url, today);
        return r.error ? fail(400, r.error) : json(r);
      }

      if (path === '/api/report.csv' && method === 'GET') {
        const r = await buildReport(env, url, today);
        if (r.error) return fail(400, r.error);
        const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const hm = (m) => `${m < 0 ? '-' : ''}${Math.floor(Math.abs(m) / 60)}:${String(Math.abs(m) % 60).padStart(2, '0')}`;
        const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };
        let lines;
        if (url.searchParams.get('kind') === 'entries') {
          lines = [['Dolgozó', 'Dátum', 'Típus', 'Megjegyzés', 'Perc', 'Változás (ó:pp)'].map(cell).join(';')];
          r.sheets.forEach((s) => s.entries.forEach((e) => lines.push([s.worker.name, e.date, KIND[e.kind], e.note, e.minutes, hm(e.minutes)].map(cell).join(';'))));
        } else {
          lines = [['Dolgozó', 'Nyitó (perc)', 'Jóváírás (perc)', 'Kivétel (perc)', 'Záró (perc)', 'Nyitó', 'Jóváírás', 'Kivétel', 'Záró'].map(cell).join(';')];
          r.sheets.forEach((s) => {
            const credit = s.entries.reduce((x, e) => x + Math.max(e.minutes, 0), 0);
            const used = s.entries.reduce((x, e) => x + Math.max(-e.minutes, 0), 0);
            lines.push([s.worker.name, s.opening, credit, used, s.closing, hm(s.opening), hm(credit), hm(-used), hm(s.closing)].map(cell).join(';'));
          });
        }
        return new Response('﻿' + lines.join('\r\n'), { headers: {
          'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
          'content-disposition': `attachment; filename="hovirag-${url.searchParams.get('kind') === 'entries' ? 'tetelek' : 'osszesito'}-${r.from}_${r.to}.csv"` } });
      }

      if (path === '/api/version' && method === 'GET') {
        const v = env.CF_VERSION_METADATA;
        return json({ id: v?.id ? String(v.id).slice(0, 8) : null, timestamp: v?.timestamp || null });
      }

    } catch (err) {
      console.error(err);
      return fail(500, 'Váratlan hiba történt.');
    }

    return fail(404, 'Nincs ilyen végpont.');
  },

  // Naponta egyszer (wrangler.toml cron): ha egy hét múlva valakinek névnapja van, értesítést küld a feliratkozott eszközöknek.
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await ensureSchema(env);
      const today = todayBudapest();
      const workers = (await env.DB.prepare('SELECT id, name, first_name FROM workers WHERE active = 1').all()).results;
      const due = upcomingNameDays(workers, today, 7).filter((x) => x.in_days === 7);
      if (!due.length) return;
      const target = due[0].date;
      if ((await getSetting(env, 'push_last_target')) === target) return;
      await putSetting(env, 'push_last_target', target);
      await putSetting(env, 'push_last_text', `Egy hét múlva névnapja van: ${due.map((x) => x.name).join(', ')} (${shortHu(target)}).`);
      const r = await pushAll(env);
      await audit(env, 'push.sent', { date: target, count: due.length, ...r });
    })());
  },
};
