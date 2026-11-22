// HÓVIRÁG – egyoldalas felület (vanília JS, nincs build lépés)
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const openingDefault = () => (today() < OPENING_CUTOFF ? OPENING_START : today());
const dotted = (s) => s.replace(/-/g, '. ') + '.';

export function fmt(minutes, signed = false) {
  const m = Math.abs(minutes);
  const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
  return `${sign}${Math.floor(m / 60)} ó ${pad(m % 60)} p`;
}
const hm = (m, signed = false) => `${m < 0 ? '−' : signed && m > 0 ? '+' : ''}${Math.floor(Math.abs(m) / 60)}:${pad(Math.abs(m) % 60)}`;
const balClass = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero');
const hu = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' });
const huFull = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (s) => (s ? hu.format(new Date(s + 'T12:00:00')) : '');
const fullDate = (s) => huFull.format(new Date(s + 'T12:00:00'));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const isAct = (w) => w.active === 1;
// A nyitó egyenleg alapértelmezett dátuma: induláskor (2026. 12. 21-ig) a nevelési év kezdete, utána a mai nap.
const OPENING_START = '2026-09-01', OPENING_CUTOFF = '2026-12-21';
// Munkaszüneti napok (törvényi + kézzel megadott), évenként betöltve és gyorsítótárazva
const HOL = new Map(); const holYears = new Set();
async function loadHolidays(years) {
  const need = [...new Set(years)].filter((y) => !holYears.has(y));
  if (!need.length) return;
  const { days } = await api(`/holidays?years=${need.join(',')}`);
  days.forEach((d) => HOL.set(d.date, d)); need.forEach((y) => holYears.add(y));
}
const resetHolidays = () => { HOL.clear(); holYears.clear(); };
// Pihenőnap-e: törvényi/megadott nap, különben a hétvége; a ledolgozandó munkanap (work) hétvégén is munkanap
const isOffDay = (date) => { const h = HOL.get(date); if (h) return h.kind === 'off'; const dow = new Date(date + 'T12:00:00').getDay(); return dow === 0 || dow === 6; };
const gidsOf = (w) => (w.group_ids ? String(w.group_ids).split(',').map(Number) : []);
const bigTime = (m) => `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}<span>ó</span>${pad(Math.abs(m) % 60)}<span>p</span>`;

function toast(msg, action) {
  $toast.replaceChildren();
  const t = document.createElement('span'); t.textContent = msg; $toast.append(t);
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
    b.onclick = async () => { $toast.hidden = true; await action.run(); };
    $toast.append(b);
  }
  $toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.hidden = true), action ? 9000 : 2600);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const e = new Error('Nincs kapcsolat.'); e.offline = true; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { location.hash = '#/belepes'; throw new Error('login'); }
  if (!res.ok) {
    const e = new Error(data.error || 'Hiba történt.');
    if (data.needs_confirm) { e.needsConfirm = true; e.workers = data.workers; }
    throw e;
  }
  return data;
}

const ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  case: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2M3 13h18"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  flowerArt: '<svg class="art" viewBox="20 18 90 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M50 114C47 84 38 58 24 34C42 52 52 82 54 114Z" fill="currentColor"/><path d="M54 114C58 86 70 66 84 46C72 68 62 90 58 114Z" fill="currentColor" opacity=".6"/><path d="M54 114C52 76 54 44 64 30C70 22 80 22 80 36"/><path d="M80 40C72 52 68 66 72 82C80 70 84 54 80 40Z" fill="var(--petal)" stroke="none"/><path d="M80 40C66 46 56 62 56 78C68 72 78 58 80 40Z" fill="var(--petal)" stroke="none" opacity=".85"/><path d="M80 40C94 46 104 62 104 78C92 72 82 58 80 40Z" fill="var(--petal)" stroke="none" opacity=".85"/></svg>',
  flower: '<svg viewBox="20 18 90 100"><path d="M50 114C47 84 38 58 24 34C42 52 52 82 54 114Z" fill="currentColor"/><path d="M54 114C58 86 70 66 84 46C72 68 62 90 58 114Z" fill="currentColor" opacity=".7"/><path d="M54 114C52 76 54 44 64 30C70 22 80 22 80 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="80" cy="38" rx="3.6" ry="4.6" fill="currentColor"/><path d="M80 40C72 52 68 66 72 82C80 70 84 54 80 40Z" fill="currentColor"/><path d="M80 40C66 46 56 62 56 78C68 72 78 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M80 40C94 46 104 62 104 78C92 72 82 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M70 70C74 78 86 78 90 70C86 74 74 74 70 70Z" fill="currentColor" opacity=".55"/></svg>',
};

const nav = (on) => `<nav class="nav">
  <a href="#/" class="${on === 'list' ? 'on' : ''}">${ICONS.home}<span>Áttekintés</span></a>
  <a href="#/naptar" class="${on === 'cal' ? 'on' : ''}">${ICONS.cal}<span>Naptár</span></a>
  <a href="#/szabadsag" class="${on === 'leave' ? 'on' : ''}">${ICONS.case}<span>Szabadság</span></a>
  <a href="#/kimutatas" class="${on === 'rep' ? 'on' : ''}">${ICONS.doc}<span>Kimutatás</span></a>
  <a href="#/beallitasok" class="${on === 'set' ? 'on' : ''}">${ICONS.gear}<span>Beállítások</span></a></nav>`;

const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };

/* ---------- offline sor ---------- */

const QKEY = 'hovirag_queue';
const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const saveQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* tele a tárhely vagy tiltott */ } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
let flushing = false;

async function flushQueue() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const q = loadQ();
    for (const item of q) {
      if (item.blocked) continue;
      try { await api('/entries', { method: 'POST', body: item.body }); item.done = true; sent++; }
      catch (err) {
        if (err.offline) break;
        if (err.message === 'login') break;
        item.blocked = err.needsConfirm ? 'Már aláírt időszakba esik.' : err.message;
        item.needsConfirm = Boolean(err.needsConfirm);
      }
    }
    saveQ(q.filter((i) => !i.done));
  } finally { flushing = false; }
  if (sent) { toast(`${sent} offline rögzített tétel feltöltve`); route(); }
  return sent;
}

function queueBanner() {
  const q = loadQ();
  if (!q.length) return '';
  return `<div class="queue"><span class="label">Feltöltésre vár (${q.length})</span>${q.map((i, n) => `
    <div class="qi"><span>${esc(i.label)}${i.blocked ? `<br><em class="status warn">${esc(i.blocked)}</em>` : ''}</span>
    ${i.blocked ? `${i.needsConfirm ? `<button class="btn small" data-qok="${n}">Mégis rögzítem</button>` : ''}<button class="btn ghost small" data-qdrop="${n}">Elvetés</button>` : '<em class="status">vár…</em>'}</div>`).join('')}</div>`;
}
function bindQueue() {
  document.querySelectorAll('[data-qok]').forEach((b) => (b.onclick = () => {
    const q = loadQ(); const i = q[+b.dataset.qok]; i.body.confirm_signed = true; delete i.blocked; saveQ(q); flushQueue().then(() => route());
  }));
  document.querySelectorAll('[data-qdrop]').forEach((b) => (b.onclick = () => { const q = loadQ(); q.splice(+b.dataset.qdrop, 1); saveQ(q); route(); }));
}

/* ---------- belépés ---------- */

function viewLogin() {
  $app.innerHTML = `<form class="login" id="f">
    <div class="logo">${ICONS.flower}</div>
    <h1>HÓVIRÁG</h1><p>Adonyi Hóvirág Óvoda</p>
    <div class="field"><label for="pw">Jelszó</label>
    <input class="input" id="pw" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Belépés</button></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { password: document.getElementById('pw').value } }); location.hash = '#/'; }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; btn.disabled = false; }
  };
}

/* ---------- áttekintés ---------- */

function statusLine(w) {
  if (w.signed_to) {
    return w.unsigned
      ? `<span class="status warn">${w.unsigned} új tétel</span>`
      : `<span class="status ok">Aláírva: ${shortDate(w.signed_to)}-ig</span>`;
  }
  return w.last_date ? '<span class="status warn">Nincs aláírva</span>' : '';
}

const hmm = (m) => `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}:${pad(Math.abs(m) % 60)}`;
const pref = (k, d) => { try { return localStorage.getItem('hovirag_' + k) ?? d; } catch { return d; } };
const setPref = (k, v) => { try { localStorage.setItem('hovirag_' + k, v); } catch { /* nem baj */ } };

async function viewList() {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { workers, upcoming, today_off: todayOff, namedays = [], nameday_next: namedayNext = null, leave_today: leaveToday = [], groups, warn_high_min: warnHigh, prev_month_end: prevEnd } = await api('/workers');
  const active = workers.filter(isAct);
  const total = active.reduce((s, w) => s + w.balance, 0);
  const f = { g: 0, sort: pref('sort', 'bal'), dir: pref('dir', 'desc'), grp: pref('grp', '0') === '1' };
  const warns = [];
  const missing = active.filter((w) => w.unsigned_old > 0);
  if (missing.length) warns.push(`<a href="#/kimutatas?w=all&from=${prevEnd.slice(0, 8)}01&to=${prevEnd}"><b>${missing.length} dolgozónak</b> nincs aláírt kimutatása ${dotted(prevEnd)}-ig</a>`);
  if (warnHigh > 0) active.filter((w) => w.balance >= warnHigh).forEach((w) => warns.push(`<a href="#/dolgozo/${w.id}"><b>${esc(w.name)}</b>: magas egyenleg (${fmt(w.balance)}), érdemes szabadidőt kiadni</a>`));
  active.filter((w) => w.balance < 0).forEach((w) => warns.push(`<a href="#/dolgozo/${w.id}"><b>${esc(w.name)}</b>: előre kivett szabadidő (${fmt(w.balance)})</a>`));
  const parked = workers.filter((w) => w.active === 2);
  const soon = iso(new Date(Date.now() + 14 * 864e5));
  parked.filter((w) => w.park_until && w.park_until <= soon).forEach((w) => warns.push(`<a href="#/dolgozo/${w.id}"><b>${esc(w.name)}</b>: ${w.park_until < today() ? 'a parkoltatás lejárt' : 'hamarosan visszatér'} (${dotted(w.park_until)})</a>`));
  const usedGroups = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
  const groupName = (w) => groups.find((g) => g.id === gidsOf(w)[0])?.name || '';

  // munkakörök aránya a felhalmozott időben
  const pos = (ws) => ws.reduce((s, w) => s + Math.max(w.balance, 0), 0);
  const segs = usedGroups.map((g) => ({ name: g.name, v: pos(active.filter((w) => gidsOf(w).includes(g.id))) }));
  const rest = pos(active.filter((w) => !gidsOf(w).length));
  if (usedGroups.length && rest > 0) segs.push({ name: 'Nincs munkakör', v: rest });
  const segTotal = segs.reduce((s, x) => s + x.v, 0);
  const segHtml = usedGroups.length && segTotal > 0 ? `<div class="seg-bar">${segs.filter((x) => x.v > 0).map((x, i) => `<i style="width:${(x.v / segTotal) * 100}%;background:var(--s${(i % 5) + 1})"></i>`).join('')}</div>
    <div class="leg">${segs.filter((x) => x.v > 0).map((x, i) => `<span style="--c:var(--s${(i % 5) + 1})">${esc(x.name)} ${hmm(x.v)}</span>`).join('')}</div>` : '';

  $app.innerHTML = `
    <div class="head"><div><small>Adonyi Hóvirág Óvoda</small><h1>Áttekintés</h1></div>${ICONS.flowerArt}</div>
    <div class="hero"><div class="top"><span>Összesen felhalmozva</span><div class="big">${bigTime(total)}</div></div>
      ${segHtml}
      <div class="pills"><span class="pill">${active.length} dolgozó</span>${upcoming.length ? `<span class="pill">${upcoming.length} tervezett szabadidő</span>` : ''}</div></div>
    ${warns.length ? `<details class="warnlist" ${warns.length === 1 ? 'open' : ''}><summary>${warns.length} figyelmeztetés</summary>${warns.join('')}</details>` : ''}
    <div class="upcoming nameday"><span class="label">Névnapok · következő 7 nap</span>${namedays.length ? namedays.map((n) => `
      <a href="#/dolgozo/${n.worker_id}"><b>${n.in_days === 0 ? 'ma' : n.in_days === 1 ? 'holnap' : `${n.in_days} nap`}</b><span>${esc(n.name)}</span><em>${shortDate(n.date)}</em></a>`).join('')
      : `<p class="tabs-note" style="margin:4px 0 0">${namedayNext ? `Nincs névnap a következő héten. Legközelebb: <b>${esc(namedayNext.name)}</b>, ${shortDate(namedayNext.date)} (${namedayNext.in_days} nap múlva).` : 'Egyik dolgozóhoz sem találtam névnapot. A név második szavát használom keresztnévnek, vagy add meg a keresztnevet a dolgozó lapján (Név / névnap).'}</p>`}</div>
    ${leaveToday.length ? `<div class="upcoming todayoff"><span class="label">Ma szabadságon</span>${leaveToday.map((u) => `
      <a href="#/szabadsag/${u.worker_id}"><b>egész nap</b><span>${esc(u.name)}</span><em></em></a>`).join('')}</div>` : ''}
    ${todayOff.length ? `<div class="upcoming todayoff"><span class="label">Ma szabadidőn</span>${todayOff.map((u) => `
      <a href="#/dolgozo/${u.worker_id}"><b>${fmt(-u.minutes)}</b><span>${esc(u.name)}${u.note ? ` · ${esc(u.note)}` : ''}</span><em></em></a>`).join('')}</div>` : ''}
    ${upcoming.length ? `<div class="upcoming"><span class="label">Közelgő szabadidő</span>${upcoming.map((u) => `
      <a href="#/dolgozo/${u.worker_id}"><b>${shortDate(u.date)}</b><span>${esc(u.name)}</span><em>${fmt(-u.minutes)}</em></a>`).join('')}</div>` : ''}
    ${queueBanner()}
    <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Név keresése" aria-label="Név keresése"></label>
    ${usedGroups.length ? `<div class="quick chips" id="gf"><button type="button" data-g="0" aria-pressed="true">Mindenki</button>${usedGroups.map((g) => `<button type="button" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>` : ''}
    <div class="lab"><span>Egyenlegek${warnHigh > 0 ? ` · jelölő: ${Math.round(warnHigh / 60)} óra` : ''}</span></div>
    <div class="sortbar"><span class="sortseg"><button type="button" data-sort="name" aria-pressed="${f.sort === 'name'}"></button><button type="button" data-sort="bal" aria-pressed="${f.sort === 'bal'}"></button></span>
      <button type="button" class="grpbtn" id="grpbtn" aria-pressed="${f.grp}">Munkakör szerint</button></div>
    <div class="items" id="l"></div>
    ${parked.length ? `<details class="parked"><summary>Parkoltatottak (${parked.length})</summary><div class="items">${parked.map((w) => `
      <a class="item muted" href="#/dolgozo/${w.id}"><div class="h"><span>${esc(w.name)}</span><em>${fmt(w.balance)}</em></div>
      <div class="sub"><span>${esc(w.park_note || 'Parkoltatva')}${w.park_until ? ` · visszatér: ${dotted(w.park_until)}` : ''}</span></div></a>`).join('')}</div></details>` : ''}
    <a class="fab" href="#/uj">${ICONS.plus}Új tétel</a>${nav('list')}`;
  bindQueue();
  const scale = warnHigh > 0 ? warnHigh : Math.max(60, ...active.map((w) => Math.abs(w.balance)));
  const itemHtml = (w) => {
    const cls = w.balance < 0 ? 'neg' : warnHigh > 0 && w.balance >= warnHigh ? 'hi' : '';
    const width = w.balance === 0 ? 0 : Math.min(100, Math.max(3, (Math.abs(w.balance) / scale) * 100));
    const grp = groupName(w);
    return `<a class="item" href="#/dolgozo/${w.id}"><div class="h"><span>${esc(w.name)}</span><em class="${w.balance < 0 ? 'neg' : ''}">${fmt(w.balance)}</em></div>
      <div class="track"><s class="${cls}" style="width:${width}%"></s>${warnHigh > 0 ? '<u></u>' : ''}</div>
      <div class="sub"><span>${grp && !f.grp ? `${esc(grp)} · ` : ''}${w.last_date ? `utolsó: ${shortDate(w.last_date)}` : 'még nincs tétel'}</span>${statusLine(w)}</div></a>`;
  };
  const cmp = (x, y) => {
    const byName = x.name.localeCompare(y.name, 'hu');
    const r = f.sort === 'bal' ? x.balance - y.balance || byName : byName;
    return f.dir === 'asc' ? r : -r;
  };
  const labels = () => {
    const arrow = f.dir === 'asc' ? '▲' : '▼';
    document.querySelectorAll('[data-sort]').forEach((b) => {
      const on = f.sort === b.dataset.sort;
      b.setAttribute('aria-pressed', on);
      b.textContent = `${b.dataset.sort === 'name' ? 'Név' : 'Egyenleg'}${on ? ` ${arrow}` : ''}`;
      b.setAttribute('aria-label', `${b.textContent} rendezés${on ? ', koppints a sorrend megfordításához' : ''}`);
    });
    document.getElementById('grpbtn').setAttribute('aria-pressed', f.grp);
  };
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = active.filter((w) => w.name.toLowerCase().includes(q) && (!f.g || gidsOf(w).includes(f.g))).sort(cmp);
    labels();
    const el = document.getElementById('l');
    if (!rows.length) { el.innerHTML = `<p class="empty">${active.length ? 'Nincs találat.' : 'Még nincs dolgozó. A Beállításokban fel tudod venni őket.'}</p>`; return; }
    if (!f.grp) { el.innerHTML = rows.map(itemHtml).join(''); return; }
    // munkakör szerinti csoportosítás: a munkakörök sorrendben, végül a munkakör nélküliek
    const sections = [...groups.map((g) => ({ name: g.name, list: rows.filter((w) => gidsOf(w)[0] === g.id) })), { name: 'Nincs munkakör', list: rows.filter((w) => !groups.some((g) => g.id === gidsOf(w)[0])) }].filter((x) => x.list.length);
    el.innerHTML = sections.map((x) => `<section class="grp"><div class="grp-h"><b>${esc(x.name)}</b><span>${x.list.length} fő · ${hmm(x.list.reduce((a, w) => a + w.balance, 0))}</span></div><div class="items">${x.list.map(itemHtml).join('')}</div></section>`).join('');
  };
  document.getElementById('q').oninput = draw;
  document.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
    f.g = +b.dataset.g; document.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
  }));
  // ugyanarra a gombra koppintva megfordul a sorrend (növekvő / csökkenő)
  document.querySelectorAll('[data-sort]').forEach((b) => (b.onclick = () => {
    if (f.sort === b.dataset.sort) f.dir = f.dir === 'asc' ? 'desc' : 'asc';
    else { f.sort = b.dataset.sort; f.dir = f.sort === 'name' ? 'asc' : 'desc'; }
    setPref('sort', f.sort); setPref('dir', f.dir); draw();
  }));
  document.getElementById('grpbtn').onclick = () => { f.grp = !f.grp; setPref('grp', f.grp ? '1' : '0'); draw(); };
  draw();
}

/* ---------- új tétel ---------- */

async function viewNew(preselect) {
  const [{ workers, today: srvToday, groups }, { templates }, { presets }] = await Promise.all([api('/workers'), api('/templates'), api('/presets')]);
  const ty = Number(today().slice(0, 4)); await loadHolidays([ty - 1, ty, ty + 1]);
  const active = workers.filter(isAct);
  if (!active.length) { $app.innerHTML = `<p class="empty">Előbb vegyél fel dolgozót a Beállításokban.</p>${nav('set')}`; return; }
  const st = { kind: 'credit', h: 0, m: 30, mode: 'dur', t1: '16:00', t2: '18:00', from: srvToday, to: srvToday, wait: false, cal: srvToday.slice(0, 7), excl: new Set(), multi: false, w: preselect && active.some((w) => w.id === +preselect) ? +preselect : active[0].id, picked: new Set() };
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>Új tétel</h2></div>
    <form id="f">
    <div class="field"><label for="w">Dolgozó</label>
      <select class="input" id="w">${active.map((w) => `<option value="${w.id}">${esc(w.name)} (${fmt(w.balance)})</option>`).join('')}</select>
      <div id="many" hidden>
      <div class="quick chips" id="gch" style="margin:0 0 8px">${groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id))).map((g) => `<button type="button" data-gp="${g.id}">${esc(g.name)} (${active.filter((w) => gidsOf(w).includes(g.id)).length})</button>`).join('')}<button type="button" data-gp="all">Mindenki</button><button type="button" data-gp="none">Törlés</button></div>
      <div class="checks">${active.map((w) => `<label class="check"><input type="checkbox" value="${w.id}"><span>${esc(w.name)}</span></label>`).join('')}</div></div>
      <label class="check multi"><input type="checkbox" id="multi"><span>Több dolgozónak egyszerre</span></label></div>
    <div class="field" id="prewrap"><span class="label">Gyors tételek</span><div class="quick chips" id="pre" style="margin-top:0"></div></div>
    <div class="field"><span class="label">Mi történt?</span><div class="seg">
      <button type="button" data-kind="credit" aria-pressed="true">+ Túlóra jóváírása</button>
      <button type="button" data-kind="use" aria-pressed="false">− Szabadidő kivétele</button></div></div>
    <div class="field"><span class="label">Mennyi időt?</span>
      <div class="seg slim" style="margin-bottom:10px"><button type="button" data-mode="dur" aria-pressed="true">Időtartam</button><button type="button" data-mode="time" aria-pressed="false">Kezdés–vége</button></div>
      <div id="tm" hidden><div class="row"><div style="flex:1;min-width:0"><label class="label" for="t1">Kezdés</label><input class="input" id="t1" type="time" value="16:00"></div>
        <div style="flex:1;min-width:0"><label class="label" for="t2">Vége</label><input class="input" id="t2" type="time" value="18:00"></div></div>
        <p class="tabs-note" id="tmres"></p></div>
      <div id="dur"><div class="stepper">
      <div class="step"><input id="h" type="number" inputmode="numeric" min="0" max="999" aria-label="Óra"><div class="u">óra</div>
        <div class="pm"><button type="button" data-d="h-1" aria-label="Óra csökkentése">−</button><button type="button" data-d="h+1" aria-label="Óra növelése">+</button></div></div>
      <div class="step"><input id="m" type="number" inputmode="numeric" min="0" max="59" aria-label="Perc"><div class="u">perc</div>
        <div class="pm"><button type="button" data-d="m-5" aria-label="Perc csökkentése">−</button><button type="button" data-d="m+5" aria-label="Perc növelése">+</button></div></div></div>
      <div class="quick"><button type="button" data-add="15">+15 p</button><button type="button" data-add="30">+30 p</button><button type="button" data-add="60">+1 ó</button><button type="button" data-add="120">+2 ó</button><button type="button" data-add="480">+8 ó</button></div></div></div>
    <div class="field"><span class="label">Melyik nap(ok)?</span>
      <div class="calhead" style="margin-top:0"><button type="button" class="back" data-cm="-1" aria-label="Előző hónap">${ICONS.back}</button><b id="cmt"></b>
        <button type="button" class="back" data-cm="1" aria-label="Következő hónap" style="transform:scaleX(-1)">${ICONS.back}</button></div>
      <div class="calgrid pick" id="cpick"></div>
      <p class="tabs-note" id="dsum"></p>
      <label class="check"><input type="checkbox" id="wk" checked><span>Hétvégék és munkaszüneti napok kihagyása</span></label>
      <div class="quick chips" id="days" style="margin-top:0" hidden></div>
      <p class="tabs-note" id="dnote" hidden></p></div>
    <div class="field"><label for="n">Megjegyzés</label>
      ${templates.length ? `<div class="quick" id="tpl" style="margin:0 0 8px">${templates.map((t) => `<button type="button" data-t="${esc(t.text)}">${esc(t.text)}</button>`).join('')}</div>` : ''}
      <textarea class="input" id="n" maxlength="300" placeholder="Pl. szülői értekezlet, rendezvény…"></textarea></div>
    <div class="preview"><span id="pl">Új egyenleg</span><span id="pv"></span></div>
    <button type="button" class="btn ghost small" id="savepre" style="margin-top:10px">Mentés gyors tételként</button><div id="prepanel"></div>
    <div id="msg"></div>
    </form><div class="savebar"><button class="btn" id="save" type="submit" form="f">Mentés</button></div>`;
  const $ = (id) => document.getElementById(id);
  $('w').value = st.w;
  const toMin = (t) => { const [h, m] = (t || '').split(':').map(Number); return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN; };
  const timeMinutes = () => { const d = toMin($('t2').value) - toMin($('t1').value); return Number.isFinite(d) && d > 0 ? d : 0; };
  const minutes = () => (st.mode === 'time' ? timeMinutes() : st.h * 60 + st.m);
  const targets = () => (st.multi ? [...st.picked] : [+$('w').value]);
  const WD = ['v', 'h', 'k', 'sze', 'cs', 'p', 'szo'];
  // A kijelölt tartomány napjai (legfeljebb 62). Több napnál a hétvégék kihagyhatók; egyetlen kijelölt nap mindig számít.
  const rangeDays = () => {
    if (!st.from || !st.to || st.from > st.to) return [];
    const skip = $('wk').checked && st.from !== st.to;
    const out = []; const d = new Date(st.from + 'T12:00:00');
    while (iso(d) <= st.to && out.length < 62) { if (!(skip && isOffDay(iso(d)))) out.push(iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  };
  const dates = () => rangeDays().filter((x) => !st.excl.has(x));
  const renderDays = () => {
    const ds = rangeDays();
    $('days').hidden = ds.length < 2;
    $('days').innerHTML = ds.length < 2 ? '' : '<span class="tabs-note" style="flex:1 1 100%;margin:0">Koppints egy napra, ha az kimarad:</span>' + ds.map((x) => { const d = new Date(x + 'T12:00:00'); return `<button type="button" data-day="${x}" aria-pressed="${!st.excl.has(x)}">${d.getMonth() + 1}. ${d.getDate()}. ${WD[d.getDay()]}</button>`; }).join('');
    $('days').querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.excl.has(b.dataset.day) ? st.excl.delete(b.dataset.day) : st.excl.add(b.dataset.day); sync(); }));
  };
  // Naptár a tól–ig kijelöléséhez: első koppintás a kezdő nap, második a záró nap (vagy marad egy nap).
  const renderCal = () => {
    const [y, mo] = st.cal.split('-').map(Number);
    const first = new Date(y, mo - 1, 1, 12), count = new Date(y, mo, 0).getDate(), lead = (first.getDay() + 6) % 7;
    $('cmt').textContent = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(first);
    const cap = st.kind === 'credit' ? srvToday : '9999-12-31';
    const cells = [...WD.slice(1), WD[0]].map((x) => `<span>${x}</span>`);
    for (let i = 0; i < lead; i++) cells.push('<div class="day empty"></div>');
    const skipOn = $('wk').checked && st.from !== st.to;
    for (let d = 1; d <= count; d++) {
      const date = `${st.cal}-${pad(d)}`; const dow = new Date(y, mo - 1, d, 12).getDay(); const wkend = dow === 0 || dow === 6; const hol = HOL.get(date); const off = isOffDay(date);
      const inRange = date >= st.from && date <= st.to; const edge = date === st.from || date === st.to;
      const skipped = inRange && ((skipOn && off) || st.excl.has(date));
      cells.push(`<button type="button" class="day${date === srvToday ? ' today' : ''}${edge && !skipped ? ' sel' : inRange ? ' inr' : ''}${skipped ? ' skip' : ''}${hol?.kind === 'off' ? ' hol' : wkend && hol?.kind !== 'work' ? ' wkd' : hol?.kind === 'work' ? ' wrk' : ''}" data-cd="${date}"${hol ? ` title="${esc(hol.label)}"` : ''}${date > cap ? ' disabled' : ''}>${d}</button>`);
    }
    $('cpick').innerHTML = cells.join('');
    $('cpick').querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => {
      const date = b.dataset.cd; st.excl.clear();
      if (!st.wait) { st.from = date; st.to = date; st.wait = true; }
      else { if (date >= st.from) st.to = date; else { st.to = st.from; st.from = date; } st.wait = false; }
      sync();
    }));
  };
  const sync = () => {
    $('h').value = st.h; $('m').value = st.m;
    $('tm').hidden = st.mode !== 'time'; $('dur').hidden = st.mode === 'time';
    document.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mode === st.mode));
    if (st.mode === 'time') $('tmres').textContent = minutes() > 0 ? `Ez ${fmt(minutes())}.` : 'A vége legyen később, mint a kezdés.';
    const cap = st.kind === 'credit' ? srvToday : '';
    if (cap && st.from > cap) st.from = cap;
    if (cap && st.to > cap) st.to = cap;
    if (st.to < st.from) st.to = st.from;
    renderCal(); renderDays();
    const ds = dates(); const n = ds.length;
    const now = ds.filter((x) => x <= srvToday).length;
    const future = st.kind === 'use' && ds.some((x) => x > srvToday);
    $('dnote').hidden = !future; $('dnote').textContent = 'A jövőbeli napok tervezett szabadidők: az egyenleget csak a kivétel napjától csökkentik.';
    const span = st.from === st.to ? dotted(st.from) : `${dotted(st.from)} – ${dotted(st.to)}`;
    $('dsum').innerHTML = st.wait ? `<b>${dotted(st.from)}</b> · koppints a záró napra, vagy maradjon egy nap.` : n ? `<b>${span}</b> · ${n} nap${n > 1 ? ` × ${fmt(minutes())} = ${fmt(n * minutes())}` : ''}` : 'Nincs kijelölt nap.';
    const per = st.kind === 'use' ? -minutes() : minutes();
    if (st.multi) {
      $('pl').textContent = 'Összesen';
      $('pv').innerHTML = `<b>${st.picked.size} dolgozó × ${n || 1} nap × ${fmt(minutes())}</b>`;
      $('save').disabled = minutes() <= 0 || !st.picked.size || !n;
    } else {
      const w = active.find((x) => x.id === +$('w').value);
      const next = w.balance + per * now;
      $('pl').textContent = now === 0 ? 'Egyenleg (nem változik)' : n > 1 ? `Új egyenleg (${now} nap)` : 'Új egyenleg';
      $('pv').innerHTML = now === 0 ? `<b>${fmt(w.balance)}</b>` : `<span style="opacity:.6;text-decoration:line-through">${fmt(w.balance)}</span> → <b>${fmt(next)}</b>`;
      $('save').disabled = minutes() <= 0 || !n;
    }
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === st.kind));
  };
  const setMin = (total) => { total = Math.max(0, total); st.h = Math.floor(total / 60); st.m = total % 60; };
  $('h').oninput = () => { st.h = Math.max(0, Math.floor(+$('h').value) || 0); sync(); };
  $('m').oninput = () => { setMin(st.h * 60 + Math.max(0, Math.floor(+$('m').value) || 0)); sync(); };
  $('w').onchange = sync; $('t1').oninput = sync; $('t2').oninput = sync;
  $('wk').onchange = () => { st.excl.clear(); sync(); };
  document.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = async () => { const [y, mo] = st.cal.split('-').map(Number); const d = new Date(y, mo - 1 + +b.dataset.cm, 1, 12); st.cal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; try { await loadHolidays([d.getFullYear()]); } catch { /* nem baj */ } renderCal(); }));
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; sync(); }));
  $('multi').onchange = () => {
    st.multi = $('multi').checked; $('many').hidden = !st.multi; $('w').hidden = st.multi;
    if (st.multi && !st.picked.size) { st.picked.add(+$('w').value); $('many').querySelector(`input[value="${$('w').value}"]`).checked = true; }
    sync();
  };
  $('many').onchange = (e) => { if (e.target.type !== 'checkbox') return; const v = +e.target.value; e.target.checked ? st.picked.add(v) : st.picked.delete(v); sync(); };
  const syncChecks = () => document.querySelectorAll('#many input[type=checkbox]').forEach((c) => { c.checked = st.picked.has(+c.value); });
  document.querySelectorAll('[data-gp]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.gp;
    if (k === 'none') st.picked.clear();
    else {
      const members = k === 'all' ? active : active.filter((w) => gidsOf(w).includes(+k));
      const all = members.every((w) => st.picked.has(w.id));
      members.forEach((w) => (all ? st.picked.delete(w.id) : st.picked.add(w.id)));
    }
    syncChecks(); sync();
  }));
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { st.kind = b.dataset.kind; st.excl.clear(); sync(); }));
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { setMin(minutes() + +b.dataset.add); sync(); }));
  document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { $('n').value = $('n').value.trim() ? `${$('n').value.trim()}, ${b.dataset.t}` : b.dataset.t; }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    const [f, d] = [b.dataset.d[0], +b.dataset.d.slice(1)];
    if (f === 'h') st.h = Math.max(0, st.h + d); else setMin(minutes() + d);
    sync();
  }));
  const drawPresets = () => {
    $('prewrap').hidden = !presets.length;
    $('pre').innerHTML = presets.map((x) => `<button type="button" data-pr="${x.id}">${esc(x.name)} · ${x.kind === 'use' ? '−' : '+'}${hmm(x.minutes)}</button>`).join('');
    $('pre').querySelectorAll('[data-pr]').forEach((b) => (b.onclick = () => applyPreset(presets.find((x) => x.id === +b.dataset.pr))));
  };
  const applyPreset = (x) => {
    st.kind = x.kind; st.mode = 'dur'; setMin(x.minutes); $('n').value = x.note || '';
    if (x.target) {
      const members = x.target === 'all' ? active : active.filter((w) => gidsOf(w).includes(+x.target.slice(1)));
      if (members.length) { if (!st.multi) { $('multi').checked = true; $('multi').onchange(); } st.picked.clear(); members.forEach((w) => st.picked.add(w.id)); syncChecks(); }
    }
    st.excl.clear(); sync(); toast(`Betöltve: ${x.name}. Most válaszd ki a napot!`);
  };
  $('savepre').onclick = () => {
    if (minutes() <= 0) { toast('Előbb add meg az időtartamot.'); return; }
    $('prepanel').innerHTML = `<div class="bulk" style="margin-top:10px"><label class="label" for="pn1">Sablon neve</label><input class="input" id="pn1" maxlength="40" value="${esc($('n').value.trim().slice(0, 40))}" placeholder="Pl. Szülői értekezlet">
      <label class="label" for="pt1" style="margin-top:10px">Kinek</label><select class="input" id="pt1"><option value="">Nincs megadva (a dolgozót magad választod)</option><option value="all">Mindenki</option>${groups.map((g) => `<option value="g${g.id}">${esc(g.name)}</option>`).join('')}</select>
      <div class="row" style="margin-top:10px"><button class="btn small" type="button" id="pgo">Mentés</button><button class="btn ghost small" type="button" id="pno">Mégsem</button></div></div>`;
    $('pno').onclick = () => { $('prepanel').innerHTML = ''; };
    $('pgo').onclick = async () => {
      try {
        const body = { name: $('pn1').value, kind: st.kind, minutes: minutes(), note: $('n').value, target: $('pt1').value };
        const { id } = await api('/presets', { method: 'POST', body });
        presets.push({ id, ...body }); drawPresets(); $('prepanel').innerHTML = ''; toast('Gyors tétel elmentve');
      } catch (err) { toast(err.message); }
    };
  };
  drawPresets();
  sync();
  const submit = async (confirm) => {
    const ids = targets();
    const range = st.mode === 'time' ? `${$('t1').value}–${$('t2').value}` : '';
    const ds = dates();
    const body = { worker_ids: ids, kind: st.kind, minutes: minutes(), date: ds[0], note: [range, $('n').value.trim()].filter(Boolean).join(' · '), client_id: uuid() };
    if (ds.length > 1) body.dates = ds;
    const hits = ids.map((id) => active.find((w) => w.id === id)).filter((w) => w && w.signed_to && ds[0] <= w.signed_to);
    if (hits.length && !confirm) return warnSigned(hits.map((w) => ({ name: w.name, signed_to: w.signed_to })));
    if (confirm) body.confirm_signed = true;
    $('save').disabled = true; $('msg').innerHTML = '';
    try {
      const { ids: created } = await api('/entries', { method: 'POST', body });
      location.hash = ids.length === 1 ? `#/dolgozo/${ids[0]}` : '#/';
      toast(`Rögzítve${ids.length > 1 ? ` ${ids.length} dolgozónak` : ''}${ds.length > 1 ? `, ${ds.length} napra` : ''}`, {
        label: 'Visszavonás',
        run: async () => { try { await api('/entries/undo', { method: 'POST', body: { ids: created } }); toast('Visszavonva'); route(); } catch (err) { toast(err.message); } },
      });
    } catch (err) {
      if (err.needsConfirm) { $('save').disabled = false; return warnSigned(err.workers); }
      if (err.offline) {
        const names = ids.map((id) => active.find((w) => w.id === id)?.name).filter(Boolean).join(', ');
        body.offline = true;
        const q = loadQ(); q.push({ body, label: `${names} · ${fmt(st.kind === 'use' ? -minutes() : minutes(), true)} · ${ds.length > 1 ? `${ds.length} nap (${shortDate(ds[0])}–${shortDate(ds[ds.length - 1])})` : shortDate(body.date)}` }); saveQ(q);
        toast('Nincs kapcsolat: a tétel a telefonon van, a net visszatérésekor feltöltődik.'); location.hash = '#/';
        return;
      }
      $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; $('save').disabled = false;
    }
  };
  const warnSigned = (list) => {
    $('msg').innerHTML = `<div class="warnbox"><b>Ez az időszak már alá van írva.</b><br>${list.map((x) => `${esc(x.name)}: ${dotted(x.signed_to)}-ig`).join('<br>')}
      <br>A mostani tétel az aláírt papír tartalmát megváltoztatná.<div class="row" style="margin-top:10px"><button class="btn small" type="button" id="go">Mégis rögzítem</button><button class="btn ghost small" type="button" id="no">Mégsem</button></div></div>`;
    $('go').onclick = () => submit(true); $('no').onclick = () => { $('msg').innerHTML = ''; };
    $('msg').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  $('f').onsubmit = (e) => { e.preventDefault(); submit(false); };
}

/* ---------- dolgozó lapja ---------- */

const eduYearStart = (d = new Date()) => `${d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1}-09-01`;

async function viewWorker(id) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { worker, entries, signatures, groups, namedays = [], today: srvToday } = await api(`/workers/${id}/entries`);
  const myGroups = groups.filter((g) => gidsOf(worker).includes(g.id));
  const f = { type: 'all', range: 'all', year: 'edu' };
  const isPlanned = (e) => e.date > srvToday && !e.reversed && e.kind === 'use';
  $app.innerHTML = `
    <div class="topbar withart"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>${esc(worker.name)}</h2></div>${ICONS.flowerArt}
    ${myGroups.length ? `<div class="quick" style="margin:8px 0 0">${myGroups.map((g) => `<span class="gtag">${esc(g.name)}</span>`).join('')}</div>` : ''}
    ${worker.active === 2 ? `<div class="banner park"><b>Parkoltatva</b>${worker.park_note ? `: ${esc(worker.park_note)}` : ''}<br><small>${dotted(worker.park_since)} óta${worker.park_until ? ` · várható visszatérés: ${dotted(worker.park_until)}` : ''} A listákban és kimutatásokban nem szerepel.</small>
      <button class="btn small" id="unpark" type="button" style="margin-top:8px">Visszahozás aktívként</button></div>` : ''}
    ${worker.active === 0 ? '<div class="banner park"><b>Kilépett dolgozó</b><br><small>A listákban és kimutatásokban nem szerepel. Törölni a Beállításokban lehet.</small></div>' : ''}
    <div class="hero"><div class="top"><span>Aktuális egyenleg</span><div class="big">${bigTime(worker.balance)}</div></div>
      ${worker.planned ? `<div class="pills"><span class="pill">Tervezett: ${fmt(worker.planned, true)}</span></div>` : ''}</div>
    ${worker.active === 1 ? `<a class="btn" href="#/uj?w=${worker.id}" style="text-decoration:none">+ Új tétel ennek a dolgozónak</a>` : ''}
    <div class="row" style="margin-top:10px"><a class="btn ghost small" style="flex:1;text-align:center;text-decoration:none" href="#/kimutatas?w=${worker.id}">Kimutatás</a>
      <button class="btn ghost small" style="flex:1" id="ren" type="button">Név / névnap</button></div>
    <form id="renf" style="margin-top:10px" hidden><label class="label" for="newname">Név</label><input class="input" id="newname" maxlength="80" value="${esc(worker.name)}" required>
      <label class="label" for="newfn" style="margin-top:10px">Keresztnév a névnaphoz (nem kötelező)</label>
      <input class="input" id="newfn" maxlength="60" autocomplete="off" value="" placeholder="${worker.has_first_name ? 'Megadva (nem látszik). Új beírása felülírja.' : 'Pl. Ágnes'}">
      <p class="tabs-note" style="margin:6px 0 0">A megadott keresztnév sehol nem jelenik meg (sem a felületen, sem a kimutatásokban), csak a névnapokhoz használjuk. Ha nincs megadva, a név második szavát vesszük. Több keresztnév vesszővel vagy szóközzel elválasztható.</p>
      ${worker.has_first_name ? '<label class="check"><input type="checkbox" id="clearfn"><span>Megadott keresztnév törlése</span></label>' : ''}
      <button class="btn small" type="submit" style="margin-top:10px">Mentés</button></form>
    ${namedays.length ? `<p class="tabs-note" style="margin:10px 0 0">Névnap: ${namedays.map((n) => shortDate(`2026-${pad(n.mm)}-${pad(n.dd)}`)).join(', ')}</p>` : ''}
    <div class="yearcard" id="yc"></div>
    ${signatures.length ? `<div class="field"><span class="label">Aláírt kimutatások</span>${signatures.slice(0, 5).map((s) => `<div class="set-item"><span>${dotted(s.from_date)} – ${dotted(s.to_date)}</span><em class="status ok">Aláírva: ${dotted(s.signed_on)}</em></div>`).join('')}</div>` : ''}
    <div class="field"><span class="label">Tételek</span>
      <div class="quick chips" id="ft" style="margin-top:0"><button type="button" data-ft="all" aria-pressed="true">Mind</button><button type="button" data-ft="credit">Túlóra</button><button type="button" data-ft="use">Szabadidő</button><button type="button" data-ft="planned">Tervezett</button></div>
      <div class="quick chips" id="fr"><button type="button" data-fr="all" aria-pressed="true">Mindig</button><button type="button" data-fr="edu">Nevelési év</button><button type="button" data-fr="90">Utolsó 90 nap</button></div></div>
    <div class="entries" id="e"></div>
    <p class="tabs-note">A tételek nem törölhetők, hibát sztornóval lehet javítani.</p>${nav('')}`;

  const drawYear = () => {
    const d = new Date();
    const start = f.year === 'edu' ? eduYearStart(d) : `${d.getFullYear()}-01-01`;
    const live = entries.filter((e) => e.date <= srvToday);
    const before = live.filter((e) => e.date < start || (e.kind === 'opening' && e.date >= start)).reduce((s, e) => s + e.minutes, 0);
    const inRange = live.filter((e) => e.date >= start && e.kind !== 'opening');
    const gained = inRange.reduce((s, e) => s + Math.max(e.minutes, 0), 0);
    const used = inRange.reduce((s, e) => s + Math.max(-e.minutes, 0), 0);
    document.getElementById('yc').innerHTML = `<div class="yhead"><span class="label" style="margin:0">${f.year === 'edu' ? 'Nevelési év' : 'Naptári év'} (${dotted(start)}-tól)</span>
      <span class="quick chips" style="margin:0"><button type="button" data-yr="edu" aria-pressed="${f.year === 'edu'}">Nevelési</button><button type="button" data-yr="cal" aria-pressed="${f.year === 'cal'}">Naptári</button></span></div>
      <div class="ygrid"><div><small>Nyitó</small><b>${fmt(before)}</b></div><div><small>Gyűjtött</small><b class="plus-c">${fmt(gained, true)}</b></div>
      <div><small>Felhasznált</small><b class="minus-c">${used ? fmt(-used) : '0 ó 00 p'}</b></div><div><small>Egyenleg</small><b>${fmt(before + gained - used)}</b></div></div>`;
    document.querySelectorAll('[data-yr]').forEach((b) => (b.onclick = () => { f.year = b.dataset.yr; drawYear(); }));
  };
  const drawEntries = () => {
    const d = new Date();
    const from = f.range === 'edu' ? eduYearStart(d) : f.range === '90' ? iso(new Date(d.getTime() - 90 * 864e5)) : '0000-00-00';
    const rows = entries.filter((e) => e.date >= from && (f.type === 'all' || (f.type === 'credit' && e.kind === 'credit') || (f.type === 'use' && e.kind === 'use' && !isPlanned(e)) || (f.type === 'planned' && isPlanned(e))));
    document.getElementById('e').innerHTML = rows.length ? rows.map((e) => {
      const planned = isPlanned(e);
      return `<div class="entry ${e.kind === 'reversal' || e.reversed ? 'dim' : ''} ${planned ? 'planned' : ''}">
        <div class="bal ${balClass(e.minutes)}">${fmt(e.minutes, true)}</div>
        <div class="meta"><b>${esc(e.note || KIND[e.kind])}</b><span>${fullDate(e.date)} · ${planned ? 'Tervezett szabadidő' : KIND[e.kind]}${e.reversed ? ' · sztornózva' : ''}</span></div>
        <div class="eb"><button class="undo" data-edit="${e.id}" aria-label="Tétel szerkesztése (dátum, időtartam, megjegyzés)">✎</button>${e.kind !== 'reversal' && !e.reversed ? `<button class="undo" data-rev="${e.id}">${planned ? 'Lemondás' : 'Sztornó'}</button>` : ''}</div>
      </div>`; }).join('') : `<p class="empty">${entries.length ? 'Nincs a szűrésnek megfelelő tétel.' : 'Még nincs tétel.'}</p>`;
    document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
      const e = entries.find((x) => x.id === +b.dataset.edit); const row = b.closest('.entry');
      const dateLocked = e.kind === 'reversal' || e.reversed;
      row.innerHTML = `<form class="editf"><label class="label" for="ed">Dátum</label>
        <input class="input" id="ed" type="date" name="date" value="${e.date}" ${e.kind === 'credit' ? `max="${srvToday}"` : ''} ${dateLocked ? 'disabled' : ''} required>
        ${dateLocked ? '<p class="tabs-note" style="margin:4px 0 0">Sztornózott vagy sztornó tétel dátuma és időtartama nem módosítható, csak a megjegyzése.</p>' : ''}
        <span class="label" style="margin-top:10px;display:block">Időtartam</span>
        <div class="row"><input class="input" type="number" inputmode="numeric" min="0" max="999" name="h" value="${Math.floor(Math.abs(e.minutes) / 60)}" aria-label="Óra" ${dateLocked ? 'disabled' : ''}>
          <input class="input" type="number" inputmode="numeric" min="0" max="59" name="m" value="${Math.abs(e.minutes) % 60}" aria-label="Perc" ${dateLocked ? 'disabled' : ''}></div>
        <p class="tabs-note" style="margin:4px 0 0">óra · perc</p>
        <label class="label" for="en" style="margin-top:10px">Megjegyzés</label>
        <input class="input" id="en" name="note" maxlength="300" value="${esc(e.note)}" aria-label="Megjegyzés"><div class="ew"></div>
        <div class="row" style="margin-top:8px"><button class="btn small" type="submit">Mentés</button><button class="btn ghost small" type="button" data-cancel>Mégsem</button></div></form>`;
      const form = row.querySelector('form'); let confirm = false;
      row.querySelector('[data-cancel]').onclick = () => drawEntries();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const body = { note: form.note.value, confirm_signed: confirm };
        if (!dateLocked) {
          body.date = form.date.value;
          const total = (+form.h.value || 0) * 60 + (+form.m.value || 0);
          if (total <= 0) { toast('Adj meg 0-nál nagyobb időtartamot.'); return; }
          body.minutes = total;
        }
        try { await api(`/entries/${e.id}`, { method: 'PATCH', body }); toast('Módosítva'); viewWorker(id); }
        catch (err) {
          if (err.needsConfirm) { confirm = true; form.querySelector('.ew').innerHTML = '<div class="warnbox">Ez az időszak már alá van írva, a papír tartalma megváltozna.</div>'; form.querySelector('button[type=submit]').textContent = 'Mégis módosítom'; }
          else toast(err.message);
        }
      };
      form.querySelector(dateLocked ? 'input[name=note]' : 'input[name=date]').focus();
    }));
    document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
      const label = b.textContent;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = label; }, 3000); return; }
      try { await api(`/entries/${b.dataset.rev}/reverse`, { method: 'POST', body: {} }); toast('Sztornózva'); viewWorker(id); }
      catch (err) { toast(err.message); }
    }));
  };
  const chips = (sel, attr, key) => document.querySelectorAll(sel).forEach((b) => (b.onclick = () => {
    f[key] = b.dataset[attr]; document.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', x === b)); drawEntries();
  }));
  chips('[data-ft]', 'ft', 'type'); chips('[data-fr]', 'fr', 'range');
  drawYear(); drawEntries();
  const up = document.getElementById('unpark');
  if (up) up.onclick = async () => { await api(`/workers/${id}`, { method: 'PATCH', body: { status: 'active' } }); toast('Visszahozva'); viewWorker(id); };
  document.getElementById('ren').onclick = () => { const fm = document.getElementById('renf'); fm.hidden = !fm.hidden; if (!fm.hidden) document.getElementById('newname').focus(); };
  document.getElementById('renf').onsubmit = async (e) => {
    e.preventDefault();
    try { const nm = document.getElementById('newname').value;
      await api(`/workers/${id}`, { method: 'PATCH', body: { ...(nm !== worker.name ? { name: nm } : {}), ...(document.getElementById('clearfn')?.checked ? { first_name: '' } : document.getElementById('newfn').value.trim() ? { first_name: document.getElementById('newfn').value } : {}) } }); toast('Mentve'); viewWorker(id); }
    catch (err) { toast(err.message); }
  };
}

/* ---------- beállítások ---------- */

async function viewSettings() {
  const hy = Number(today().slice(0, 4));
  const [{ workers, groups, warn_high_min: warnHigh }, { templates }, { presets: presetsList }, { days: holDays }] = await Promise.all([api('/workers'), api('/templates'), api('/presets'), api(`/holidays?years=${hy},${hy + 1}`)]);
  const newGroups = new Set();
  $app.innerHTML = `
    <div class="topbar"><h2>Beállítások</h2></div>
    <form id="f"><div class="field"><label for="nm">Új dolgozó</label>
      <input class="input" id="nm" placeholder="Teljes név" maxlength="80" required></div>
      ${groups.length ? `<div class="field"><span class="label">Munkakör (kötelező)</span><div class="quick chips" id="ng" style="margin-top:0">${groups.map((g) => `<button type="button" data-ng="${g.id}" aria-pressed="false">${esc(g.name)}</button>`).join('')}</div>
        <p class="tabs-note" style="margin:6px 0 0">Az <b>Egyéb</b> a nem nevelő munkát végző kollégák (például konyhai, takarító vagy karbantartó dolgozó) munkaköre.</p></div>` : ''}
      <div class="field"><span class="label">Nyitó egyenleg a papírról</span><div class="row">
        <input class="input" id="oh" type="number" inputmode="numeric" min="0" placeholder="óra" aria-label="Nyitó óra">
        <input class="input" id="om" type="number" inputmode="numeric" min="0" max="59" placeholder="perc" aria-label="Nyitó perc"></div></div>
      <div class="field"><label for="fn">Keresztnév a névnaphoz (nem kötelező)</label><input class="input" id="fn" maxlength="60" placeholder="Pl. Ágnes (ha a név „-né” végű)">
        <p class="tabs-note" style="margin:6px 0 0">Nem jelenik meg a listákban, csak a névnapokhoz használjuk. Ha üres, a név második szavát vesszük.</p></div>
      <div class="field"><label for="od">Nyitó egyenleg dátuma</label><input class="input" id="od" type="date" value="${openingDefault()}" max="${today()}" required>
        <p class="tabs-note" style="margin:6px 0 0">Ettől a naptól számít az átvett egyenleg. Induláskor szeptember 1., később a mai nap az alapérték.</p></div>
      <div id="msg"></div><button class="btn" type="submit">Dolgozó felvétele</button></form>
    <details class="field bulkimp"><summary class="label" style="cursor:pointer">Dolgozók tömeges felvétele (induláshoz)</summary>
      <p class="tabs-note" style="margin:6px 0 8px">Soronként egy dolgozó: <b>Név; Munkakör; Nyitó egyenleg; Keresztnév</b> (a negyedik nem kötelező, a névnaphoz kell, ha a név „-né” végű). Excelből is beilleszthető (tabulátorral elválasztva). Nyitó egyenleg: <b>12:30</b>, <b>12 ó 30 p</b> vagy <b>12,5</b> (óra). Munkakör például: Pedagógus, Asszisztens, Dajka, Egyéb.</p>
      <label class="label" for="bdate">Nyitó egyenleg dátuma (mindenkinél)</label>
      <input class="input" id="bdate" type="date" value="${openingDefault()}" max="${today()}" style="margin-bottom:10px">
      <textarea class="input" id="bulk" rows="6" placeholder="Kovács Ágnes; Pedagógus; 12:30&#10;Tóth Mária; Dajka; 7:10&#10;Nagy Zsuzsanna; Asszisztens; 0"></textarea>
      <button class="btn ghost" type="button" id="bchk">Ellenőrzés</button><div id="bprev"></div></details>
    <div class="field"><span class="label">Dolgozók</span>${workers.map((w) => `
      <div class="set-item col ${w.active === 0 ? 'off' : ''}"><div class="top"><span>${esc(w.name)}</span><em class="stl st${w.active}">${['Kilépett', 'Aktív', 'Parkoltatva'][w.active]}</em></div>
      ${w.active === 2 ? `<span class="status warn" style="font-size:12.5px">${esc(w.park_note || 'Parkoltatva')} · ${dotted(w.park_since)} óta${w.park_until ? ` · visszatér: ${dotted(w.park_until)}` : ''}</span>` : ''}
      ${w.active === 0 && w.inactive_since ? `<span class="status warn" style="font-size:12.5px">Kilépett: ${dotted(w.inactive_since.slice(0, 10))} óta</span>` : ''}
      <div class="inact" data-act="${w.id}">${w.active === 1 ? `<button class="btn ghost small" data-st="parked" data-id="${w.id}" data-name="${esc(w.name)}">Parkoltatás…</button><button class="btn ghost small" data-st="left" data-id="${w.id}">Kilépett</button>`
        : w.active === 2 ? `<button class="btn ghost small" data-st="active" data-id="${w.id}">Visszahozás</button><button class="btn ghost small" data-st="left" data-id="${w.id}">Kilépett</button>`
        : `<button class="btn ghost small" data-st="active" data-id="${w.id}">Aktiválás</button><button class="btn ghost small danger" data-delw="${w.id}" data-name="${esc(w.name)}">Végleges törlés…</button>`}</div>
      ${groups.length ? `<div class="quick chips" data-wg="${w.id}">${groups.map((g) => `<button type="button" data-g="${g.id}" aria-pressed="${gidsOf(w).includes(g.id)}">${esc(g.name)}</button>`).join('')}</div>` : ''}</div>`).join('')}</div>
    <div class="field"><span class="label">Munkakörök</span>
      ${groups.map((g) => `<div class="set-item"><span>${esc(g.name)}</span><button class="btn ghost small" data-delgrp="${g.id}">Törlés</button></div>`).join('')}
      <form id="gf2" class="row" style="margin-top:8px"><input class="input" id="gn" maxlength="60" placeholder="Új munkakör (pl. Konyhai dolgozó)" required><button class="btn small" type="submit">Hozzáad</button></form>
      <p class="tabs-note">Egy dolgozónak egy munkaköre van, ami bármikor átállítható. A munkakör törlése a dolgozókat nem törli. A korábbi kimutatásokat nem érinti, az új kimutatások mindig a jelenlegi munkakört veszik alapul.</p></div>
    <div class="field"><span class="label">Figyelmeztetés magas egyenlegre</span>
      <form id="wf" class="row"><input class="input" id="wh" type="number" inputmode="numeric" min="0" max="1000" value="${Math.round(warnHigh / 60)}" aria-label="Óra"><button class="btn small" type="submit">Mentés</button></form>
      <p class="tabs-note">Ennyi óra felett az Áttekintésen figyelmeztetést látsz. 0 = kikapcsolva.</p></div>
    <div class="field"><span class="label">Gyors tételek</span>
      ${presetsList.length ? presetsList.map((x) => `<div class="set-item"><span>${esc(x.name)} · ${x.kind === 'use' ? '−' : '+'}${hmm(x.minutes)}${x.target === 'all' ? ' · mindenki' : x.target ? ` · ${esc(groups.find((g) => 'g' + g.id === x.target)?.name || 'munkakör')}` : ''}</span><button class="btn ghost small" data-delpre="${x.id}">Törlés</button></div>`).join('') : '<p class="tabs-note" style="margin:0">Még nincs. Az Új tétel oldalon a „Mentés gyors tételként” gombbal hozhatsz létre.</p>'}</div>
    <details class="field bulkimp"><summary class="label" style="cursor:pointer">Munkaszüneti napok és áthelyezett munkanapok</summary>
      <p class="tabs-note" style="margin:6px 0 8px">A törvényi ünnepnapok (húsvét, pünkösd is) magától benne vannak a naptárban. Az áthelyezett pihenő- és munkanapokat, valamint az egyéb szabadnapokat (például december 24.) évente rendelet állapítja meg, ezeket itt adhatod meg.</p>
      <form id="hf"><div class="row"><input class="input" id="hd" type="date" required aria-label="Dátum"><select class="input" id="hk" aria-label="Típus"><option value="off">Szabadnap</option><option value="work">Ledolgozandó munkanap</option></select></div>
        <input class="input" id="hl" maxlength="60" placeholder="Megnevezés (pl. áthelyezett pihenőnap)" style="margin-top:8px"><button class="btn small" type="submit" style="margin-top:8px">Hozzáadás</button></form>
      <div id="hlist" style="margin-top:10px"></div></details>
    <div class="field"><span class="label">Gyakori megjegyzések</span>
      ${templates.map((t) => `<div class="set-item"><span>${esc(t.text)}</span><button class="btn ghost small" data-deltpl="${t.id}" aria-label="Törlés: ${esc(t.text)}">Törlés</button></div>`).join('')}
      <form id="tf" class="row" style="margin-top:8px"><input class="input" id="tt" maxlength="60" placeholder="Új gyors megjegyzés" required><button class="btn small" type="submit">Hozzáad</button></form></div>
    <div class="field"><span class="label">Adatok mentése</span>
      <a class="btn ghost" style="text-decoration:none;margin-top:0" href="/api/backup?format=csv" download>Táblázat letöltése (Excel, CSV)</a>
      <a class="btn ghost" style="text-decoration:none" href="/api/backup" download>Teljes mentés letöltése (JSON)</a>
      <p class="tabs-note">Havonta egyszer érdemes letölteni és egy biztonságos helyre menteni.</p></div>
    <div class="field"><span class="label">Jelszó módosítása</span>
      <form id="pf"><input class="input" id="pc" type="password" autocomplete="current-password" autocapitalize="off" placeholder="Jelenlegi jelszó" required>
      <input class="input" id="pn" type="password" autocomplete="new-password" autocapitalize="off" placeholder="Új jelszó (legalább 8 karakter)" minlength="8" required style="margin-top:8px">
      <input class="input" id="pn2" type="password" autocomplete="new-password" autocapitalize="off" placeholder="Új jelszó mégegyszer" required style="margin-top:8px">
      <div id="pmsg"></div><button class="btn ghost" type="submit">Jelszó módosítása</button></form></div>
    <div class="field"><a class="btn ghost" style="text-decoration:none;margin-top:0" href="#/naplo">Napló megtekintése</a></div>
    <div class="field"><span class="label">Értesítések (névnapok)</span>
      <p class="tabs-note" style="margin:0 0 8px">Egy héttel a névnap előtt értesítést kapsz ezen az eszközön. Eszközönként külön kell bekapcsolni.</p>
      <div id="pstat" class="tabs-note" style="margin:0 0 8px"></div>
      <div class="row"><button class="btn small" type="button" id="pon">Bekapcsolás</button><button class="btn ghost small" type="button" id="ptest" hidden>Teszt értesítés</button><button class="btn ghost small" type="button" id="poff" hidden>Kikapcsolás</button></div></div>
    <div class="field"><span class="label">Verzió</span><p class="tabs-note" id="ver" style="margin:0">Betöltés…</p></div>
    <div class="field"><span class="label">Telepítés a telefonra</span>
      <p class="tabs-note" style="margin:0">iPhone: Safari → Megosztás → <b>Főképernyőhöz adás</b>. Android: Chrome → ⋮ menü → <b>Alkalmazás telepítése</b>.</p></div>
    <div class="field"><button class="btn ghost" id="out" type="button">Kijelentkezés</button></div>${nav('set')}`;
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll('[data-ng]').forEach((b) => (b.onclick = () => {
    const v = +b.dataset.ng; const was = newGroups.has(v); newGroups.clear(); if (!was) newGroups.add(v);
    document.querySelectorAll('[data-ng]').forEach((x) => x.setAttribute('aria-pressed', newGroups.has(+x.dataset.ng)));
  }));
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    if (groups.length && newGroups.size !== 1) { $('msg').innerHTML = '<div class="err">Válassz munkakört a dolgozónak.</div>'; $('ng').scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    const min = (+$('oh').value || 0) * 60 + (+$('om').value || 0);
    try { await api('/workers', { method: 'POST', body: { name: $('nm').value, opening_minutes: min, date: $('od').value || openingDefault(), first_name: $('fn').value, group_ids: [...newGroups] } }); toast('Felvéve'); viewSettings(); }
    catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  document.querySelectorAll('[data-st]').forEach((b) => (b.onclick = async () => {
    const st = b.dataset.st;
    if (st === 'parked') {
      const row = b.closest('.set-item');
      row.querySelector('.inact').outerHTML = `<form class="parkf"><span class="label">Miért parkoltatod?</span>
        <div class="quick chips" style="margin-top:0">${['GYES', 'GYED', 'Tartós betegség', 'Fizetés nélküli szabadság'].map((t) => `<button type="button" data-pr="${t}">${t}</button>`).join('')}</div>
        <input class="input" name="note" maxlength="80" placeholder="Megjegyzés (pl. GYES)" style="margin-top:8px">
        <label class="label" style="margin-top:8px">Várható visszatérés (nem kötelező)</label><input class="input" type="date" name="until">
        <div class="row" style="margin-top:8px"><button class="btn small" type="submit">Parkoltatás</button><button class="btn ghost small" type="button" data-no>Mégsem</button></div></form>`;
      const f = row.querySelector('.parkf');
      f.querySelectorAll('[data-pr]').forEach((c) => (c.onclick = () => { f.note.value = c.dataset.pr; }));
      f.querySelector('[data-no]').onclick = () => viewSettings();
      f.onsubmit = async (e) => { e.preventDefault(); await api(`/workers/${b.dataset.id}`, { method: 'PATCH', body: { status: 'parked', park_note: f.note.value, park_until: f.until.value || null } }); toast('Parkoltatva'); viewSettings(); };
      return;
    }
    await api(`/workers/${b.dataset.id}`, { method: 'PATCH', body: { status: st } }); viewSettings();
  }));
  document.querySelectorAll('[data-wg] [data-g]').forEach((b) => (b.onclick = async () => {
    const wrap = b.closest('[data-wg]');
    const was = b.getAttribute('aria-pressed') === 'true';
    wrap.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b && !was));
    const group_ids = [...wrap.querySelectorAll('[aria-pressed=true]')].map((x) => +x.dataset.g);
    try { await api(`/workers/${wrap.dataset.wg}/groups`, { method: 'PUT', body: { group_ids } }); } catch (err) { toast(err.message); viewSettings(); }
  }));
  document.querySelectorAll('[data-delgrp]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Törlés'; }, 3000); return; }
    await api(`/groups/${b.dataset.delgrp}`, { method: 'DELETE' }); viewSettings();
  }));
  $('gf2').onsubmit = async (e) => { e.preventDefault(); try { await api('/groups', { method: 'POST', body: { name: $('gn').value } }); viewSettings(); } catch (err) { toast(err.message); } };
  $('wf').onsubmit = async (e) => { e.preventDefault(); await api('/settings', { method: 'PUT', body: { warn_high_hours: +$('wh').value } }); toast('Mentve'); };
  document.querySelectorAll('[data-deltpl]').forEach((b) => (b.onclick = async () => { await api(`/templates/${b.dataset.deltpl}`, { method: 'DELETE' }); viewSettings(); }));
  $('tf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/templates', { method: 'POST', body: { text: $('tt').value } }); viewSettings(); } catch (err) { toast(err.message); }
  };
  const norm = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const parseOpen = (t) => {
    t = t.trim(); if (!t) return 0;
    let m = t.match(/^(-?)(\d+):(\d{1,2})$/); if (m) return (m[1] ? -1 : 1) * (+m[2] * 60 + +m[3]);
    m = t.match(/^(-?)(\d+)\s*ó\w*\s*(?:(\d+)\s*p\w*)?$/i); if (m) return (m[1] ? -1 : 1) * (+m[2] * 60 + (+m[3] || 0));
    m = t.match(/^(-?)(\d+(?:[.,]\d+)?)$/); if (m) return (m[1] ? -1 : 1) * Math.round(parseFloat(m[2].replace(',', '.')) * 60);
    return null;
  };
  const matchGroup = (tok) => {
    const n = norm(tok); if (!n) return null;
    let best = null, score = 0, tie = false;
    for (const g of groups) {
      const gn = norm(g.name); let sc = gn.includes(n) && n.length >= 4 ? 100 + n.length : 0;
      if (!sc) { let i = 0; while (i < n.length && i < gn.length && n[i] === gn[i]) i++; sc = i >= 4 ? i : 0; }
      if (sc > score) { best = g; score = sc; tie = false; } else if (sc === score && sc > 0) tie = true;
    }
    return tie ? null : best;
  };
  let parsed = [];
  $('bchk').onclick = () => {
    const existing = new Set(workers.map((w) => norm(w.name)));
    const seen = new Set();
    parsed = $('bulk').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
      const [name = '', grp = '', open = '', fnm = ''] = line.split(/;|\t/).map((x) => x.trim());
      const g = matchGroup(grp), min = parseOpen(open);
      const err = !name ? 'hiányzik a név' : existing.has(norm(name)) ? 'már van ilyen nevű dolgozó' : seen.has(norm(name)) ? 'kétszer szerepel' : groups.length && !g ? `ismeretlen munkakör: „${grp}”` : min === null ? `érthetetlen nyitó egyenleg: „${open}”` : '';
      seen.add(norm(name));
      return { name, g, min, err, fnm };
    });
    const ok = parsed.filter((r) => !r.err);
    $('bprev').innerHTML = `<div class="entries" style="margin-top:10px">${parsed.map((r) => `<div class="entry ${r.err ? 'dim' : ''}"><div class="meta"><b>${esc(r.name || '—')}</b><span>${r.err ? `<em class="status warn">${esc(r.err)}</em>` : `${esc(r.g?.name || '')} · nyitó: ${fmt(r.min || 0)}`}</span></div></div>`).join('')}</div>
      <p class="tabs-note">${ok.length} felvehető, ${parsed.length - ok.length} hibás (kimarad).</p>
      ${ok.length ? `<button class="btn" type="button" id="bgo">${ok.length} dolgozó felvétele</button>` : ''}`;
    const go = document.getElementById('bgo');
    if (go) go.onclick = async () => {
      go.disabled = true;
      try { const r = await api('/workers/bulk', { method: 'POST', body: { date: $('bdate').value || openingDefault(), rows: ok.map((x) => ({ name: x.name, first_name: x.fnm, group_id: x.g?.id, opening_minutes: x.min })) } }); toast(`${r.added} dolgozó felvéve`); viewSettings(); }
      catch (err) { toast(err.message); go.disabled = false; }
    };
  };
  // ---- értesítések (Web Push)
  const b64uToBytes = (str) => Uint8Array.from(atob(str.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  const pushOk = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const pushState = async () => {
    if (!pushOk) { $('pstat').textContent = ios && !standalone ? 'iPhone-on az értesítéshez előbb add a főképernyőhöz az alkalmazást (Megosztás → Főképernyőhöz adás), és onnan nyisd meg.' : 'Ez a böngésző nem támogatja az értesítéseket.'; $('pon').hidden = true; return; }
    if (Notification.permission === 'denied') { $('pstat').textContent = 'Az értesítések le vannak tiltva. A telefon beállításaiban engedélyezheted az alkalmazásnak.'; $('pon').hidden = true; return; }
    let sub = null; try { sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); } catch { /* nincs */ }
    $('pstat').textContent = sub ? 'Bekapcsolva ezen az eszközön.' : 'Kikapcsolva ezen az eszközön.';
    $('pon').hidden = Boolean(sub); $('poff').hidden = !sub; $('ptest').hidden = !sub;
  };
  pushState();
  $('pon').onclick = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Az értesítés nincs engedélyezve.'); return pushState(); }
      const { key } = await api('/push/key');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uToBytes(key) });
      await api('/push/subscribe', { method: 'POST', body: sub.toJSON() });
      toast('Értesítések bekapcsolva'); pushState();
    } catch (err) { toast(err.message || 'Nem sikerült bekapcsolni.'); }
  };
  $('poff').onclick = async () => {
    try { const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription(); if (sub) { await api('/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); } toast('Kikapcsolva'); pushState(); }
    catch (err) { toast(err.message); }
  };
  $('ptest').onclick = async () => { try { const r = await api('/push/test', { method: 'POST', body: {} }); toast(r.sent ? `Elküldve (${r.sent} eszköz)` : 'Nem sikerült elküldeni.'); } catch (err) { toast(err.message); } };
  document.querySelectorAll('[data-delpre]').forEach((b) => (b.onclick = async () => { await api(`/presets/${b.dataset.delpre}`, { method: 'DELETE' }); viewSettings(); }));
  $('hlist').innerHTML = holDays.map((h) => `<div class="set-item"><span>${dotted(h.date)} · ${esc(h.label || (h.kind === 'work' ? 'Munkanap' : 'Szabadnap'))}${h.kind === 'work' ? ' <em class="status ok">ledolgozandó munkanap</em>' : ''}</span>${h.custom ? `<button class="btn ghost small" data-delhol="${h.date}">Törlés</button>` : ''}</div>`).join('');
  document.querySelectorAll('[data-delhol]').forEach((b) => (b.onclick = async () => { await api(`/holidays/${b.dataset.delhol}`, { method: 'DELETE' }); resetHolidays(); toast('Törölve'); viewSettings(); }));
  $('hf').onsubmit = async (e) => { e.preventDefault(); try { await api('/holidays', { method: 'POST', body: { date: $('hd').value, kind: $('hk').value, label: $('hl').value } }); resetHolidays(); toast('Hozzáadva'); viewSettings(); } catch (err) { toast(err.message); } };
  api('/version').then((v) => {
    $('ver').textContent = v.id ? `${v.id}${v.timestamp ? ' · telepítve: ' + new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(v.timestamp)) : ''}` : 'Nem elérhető (helyi futtatás).';
  }).catch(() => { $('ver').textContent = 'Nem elérhető.'; });
  document.querySelectorAll('[data-delw]').forEach((b) => (b.onclick = () => {
    const box = b.closest('.set-item');
    box.querySelector('.inact').outerHTML = `<div class="warnbox"><b>${esc(b.dataset.name)} végleges törlése</b><br>A dolgozó <b>összes tétele, aláírás-jelölése és munkaköre törlődik</b>, a naplóból a neve is eltűnik. Ez nem vonható vissza.
      <label class="check"><input type="checkbox" class="ok"><span>Letöltöttem a mentést, és tudom, hogy ez végleges.</span></label>
      <div class="row"><button class="btn small danger" type="button" data-go disabled>Igen, véglegesen törlöm</button><button class="btn ghost small" type="button" data-no>Mégsem</button></div></div>`;
    const ok = box.querySelector('.ok'), go = box.querySelector('[data-go]');
    ok.onchange = () => { go.disabled = !ok.checked; };
    box.querySelector('[data-no]').onclick = () => viewSettings();
    go.onclick = async () => {
      go.disabled = true;
      try { const r = await api(`/workers/${b.dataset.delw}`, { method: 'DELETE' }); toast(`Törölve (${r.deleted_entries} tétel)`); viewSettings(); }
      catch (err) { toast(err.message); go.disabled = false; }
    };
  }));
  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('pmsg');
    if ($('pn').value !== $('pn2').value) { msg.innerHTML = '<div class="err">A két új jelszó nem egyezik.</div>'; return; }
    try {
      await api('/password', { method: 'POST', body: { current: $('pc').value, next: $('pn').value } });
      e.target.reset(); msg.innerHTML = ''; toast('Jelszó módosítva. A többi eszközön újra be kell lépni.');
    } catch (err) { msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  $('out').onclick = async () => {
    await api('/logout', { method: 'POST' });
    try { await caches.delete('hovirag-v1'); localStorage.removeItem(QKEY); } catch { /* nincs gyorsítótár */ }
    location.hash = '#/belepes';
  };
}

/* ---------- kimutatás ---------- */

function presetRange(name) {
  const now = new Date(); now.setHours(12);
  if (name === 'month' || name === 'lastmonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - (name === 'lastmonth' ? 1 : 0), 1, 12);
    return [iso(first), iso(new Date(first.getFullYear(), first.getMonth() + 1, 0, 12))];
  }
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) - (name === 'lastweek' ? 7 : 0));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
}

async function viewReportForm(q) {
  const { workers, groups } = await api('/workers');
  const active = workers.filter(isAct);
  const [f0, t0] = presetRange('month');
  const pre = q && q.get('w');
  const st = { mode: 'sheets' };
  const useGroups = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
  $app.innerHTML = `
    <div class="topbar"><h2>Kimutatás</h2></div>
    <div class="seg" style="margin-top:10px"><a class="segl on" href="#/kimutatas">Túlóra</a><a class="segl" href="#/kimutatas/szabadsag">Szabadság</a></div>
    <form id="f">
    <div class="field"><span class="label">Forma</span><div class="seg">
      <button type="button" data-mode="sheets" aria-pressed="true">Dolgozónként (aláírásra)</button>
      <button type="button" data-mode="summary" aria-pressed="false">Összesítő lista</button></div></div>
    <div class="field"><label for="w">Kiknek</label><select class="input" id="w"><option value="all">Mindenki (${active.length} dolgozó)</option>
      ${useGroups.length ? `<optgroup label="Munkakör">${useGroups.map((g) => `<option value="g${g.id}"${pre === `g${g.id}` ? ' selected' : ''}>${esc(g.name)} (${active.filter((w) => gidsOf(w).includes(g.id)).length})</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Dolgozó">${active.map((w) => `<option value="${w.id}"${String(w.id) === pre ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup>
      ${workers.some((w) => w.active === 2) ? `<optgroup label="Parkoltatott">${workers.filter((w) => w.active === 2).map((w) => `<option value="${w.id}"${String(w.id) === pre ? ' selected' : ''}>${esc(w.name)} (${esc(w.park_note || 'parkoltatva')})</option>`).join('')}</optgroup>` : ''}</select></div>
    <div class="field"><span class="label">Időszak</span><div class="quick" style="margin-top:0">
      <button type="button" data-p="week">Ez a hét</button><button type="button" data-p="lastweek">Múlt hét</button>
      <button type="button" data-p="month">Ez a hónap</button><button type="button" data-p="lastmonth">Múlt hónap</button></div></div>
    <div class="field"><div class="row">
      <div style="flex:1;min-width:0"><label class="label" for="from">Ettől</label><input class="input" id="from" type="date" value="${(q && q.get('from')) || f0}" required></div>
      <div style="flex:1;min-width:0"><label class="label" for="to">Eddig</label><input class="input" id="to" type="date" value="${(q && q.get('to')) || t0}" required></div></div></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Kimutatás megnyitása</button></form>
    <p class="tabs-note">A következő oldalon nyomtathatod vagy PDF-be mentheted. Az aláírt példányokat ott jelölheted meg.</p>${nav('rep')}`;
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    st.mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.mode === st.mode));
  }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const [f, t] = presetRange(b.dataset.p); document.getElementById('from').value = f; document.getElementById('to').value = t;
  }));
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const from = document.getElementById('from').value, to = document.getElementById('to').value, w = document.getElementById('w').value;
    if (from > to) { document.getElementById('msg').innerHTML = '<div class="err">Az „Ettől” dátum nem lehet későbbi, mint az „Eddig”.</div>'; return; }
    location.hash = `#/kimutatas/${st.mode === 'summary' ? 'osszesito' : 'nyomtatas'}?from=${from}&to=${to}&w=${w}`;
  };
}

const stamp = () => new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());

const sheetHead = (when) => `<div class="ph-head"><div class="org">${ICONS.flower.replace('<svg', '<svg width="38" height="38" style="color:#1E4D3B"')}
  <div><b>Adonyi Hóvirág Óvoda</b><span>Túlóra és szabadidő nyilvántartás</span></div></div>
  <div class="meta">Készült<br><b>${when}</b></div></div>`;

async function viewReportPrint(q) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const r = await api(`/report?from=${q.get('from')}&to=${q.get('to')}&worker=${encodeURIComponent(q.get('w') || 'all')}`);
  const when = stamp();
  const sheet = (s) => {
    let run = s.opening;
    const rows = s.entries.map((e) => { run += e.minutes; return `<tr><td>${dotted(e.date)}</td><td>${esc(e.note || KIND[e.kind])}<br><small>${KIND[e.kind]}</small></td>
      <td class="r ${e.minutes < 0 ? 'minus' : 'plus'}">${fmt(e.minutes, true)}</td><td class="r">${fmt(run)}</td></tr>`; }).join('');
    return `<section class="sheet">${sheetHead(when)}
      <h3>Túlóra-kimutatás</h3>
      <div class="facts"><div><small>Dolgozó</small><b>${esc(s.worker.name)}</b></div><div><small>Időszak</small><b>${dotted(r.from)} – ${dotted(r.to)}</b></div>
        <div><small>Nyitó egyenleg</small><b>${fmt(s.opening)}</b></div></div>
      <table><thead><tr><th>Dátum</th><th>Megjegyzés</th><th class="r">Változás</th><th class="r">Egyenleg</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="none">Az időszakban nem volt tétel.</td></tr>'}</tbody></table>
      <div class="total"><span>Záró egyenleg</span><b>${fmt(s.closing)}</b></div>
      <div class="sig"><div>Dolgozó aláírása</div><div>Munkáltató képviselője</div></div>
      <div class="foot"><span>Az egyenleg szabadidőben értendő.</span><span>Kelt: ………………………</span></div></section>
      <div class="noprint signrow">${s.signed
        ? `<span class="status ok">${esc(s.worker.name)}: aláírva ${dotted(s.signed.signed_on)}</span><button class="btn ghost small" data-unsign="${s.signed.id}">Visszavonás</button>`
        : `<label class="label" for="sd${s.worker.id}">${esc(s.worker.name)}: aláírva</label><input class="input" type="date" id="sd${s.worker.id}" value="${r.today}">
           <button class="btn small" data-sign="${s.worker.id}">Aláírt példány megvan</button>`}</div>`;
  };
  const unsigned = r.sheets.filter((s) => !s.signed);
  const bulk = r.sheets.length > 1 ? `<div class="bulk"><span class="label">Aláírások jelölése</span>${unsigned.length ? `
      <div class="checks">${unsigned.map((s) => `<label class="check"><input type="checkbox" data-bw="${s.worker.id}" checked><span>${esc(s.worker.name)}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><input class="input" type="date" id="bd" value="${r.today}"><button class="btn small" id="bgo" type="button">Kijelöltek aláírva</button></div>
      <p class="tabs-note" style="margin-top:6px">Vedd ki a pipát attól, aki még nem írta alá.</p>` : '<p class="tabs-note" style="margin:0">Mindenki aláírta ezt a kimutatást.</p>'}</div>` : '';
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>${r.sheets.length} oldal · ${esc(r.scope.name)}</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:10px">Nyomtatás / PDF mentése</button>
    <a class="btn ghost" style="text-decoration:none;margin:0 0 16px" href="/api/report.csv?kind=entries&from=${r.from}&to=${r.to}&worker=${encodeURIComponent(q.get('w') || 'all')}" download>Tételek táblázata (Excel, CSV)</a>${bulk}</div>
    ${r.sheets.length ? r.sheets.map(sheet).join('') : '<p class="empty">Nincs dolgozó a kimutatáshoz.</p>'}`;
  const go = document.getElementById('bgo');
  if (go) go.onclick = async () => {
    const ids = [...document.querySelectorAll('[data-bw]:checked')].map((c) => +c.dataset.bw);
    if (!ids.length) { toast('Jelölj ki legalább egy dolgozót.'); return; }
    try { const { added } = await api('/signatures/bulk', { method: 'POST', body: { worker_ids: ids, from: r.from, to: r.to, signed_on: document.getElementById('bd').value } }); toast(`${added} aláírás rögzítve`); viewReportPrint(q); }
    catch (err) { toast(err.message); }
  };
  document.getElementById('print').onclick = () => window.print();
  document.querySelectorAll('[data-sign]').forEach((b) => (b.onclick = async () => {
    try { await api('/signatures', { method: 'POST', body: { worker_id: +b.dataset.sign, from: r.from, to: r.to, signed_on: document.getElementById('sd' + b.dataset.sign).value } }); toast('Aláírás rögzítve'); viewReportPrint(q); }
    catch (err) { toast(err.message); }
  }));
  document.querySelectorAll('[data-unsign]').forEach((b) => (b.onclick = async () => {
    await api(`/signatures/${b.dataset.unsign}`, { method: 'DELETE' }); toast('Aláírás visszavonva'); viewReportPrint(q);
  }));
}

async function viewReportSummary(q) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const r = await api(`/report?from=${q.get('from')}&to=${q.get('to')}&worker=${encodeURIComponent(q.get('w') || 'all')}`);
  const rows = r.sheets.map((s) => {
    const credit = s.entries.reduce((a, e) => a + Math.max(e.minutes, 0), 0);
    const used = s.entries.reduce((a, e) => a + Math.max(-e.minutes, 0), 0);
    return { name: s.worker.name, opening: s.opening, credit, used, closing: s.closing };
  });
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const when = stamp();
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>Összesítő</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:10px">Nyomtatás / PDF mentése</button>
    <a class="btn ghost" style="text-decoration:none;margin:0 0 16px" href="/api/report.csv?kind=summary&from=${r.from}&to=${r.to}&worker=${encodeURIComponent(q.get('w') || 'all')}" download>Összesítő táblázata (Excel, CSV)</a></div>
    <section class="sheet">${sheetHead(when)}
      <h3>Összesítő kimutatás</h3>
      <div class="facts"><div><small>Időszak</small><b>${dotted(r.from)} – ${dotted(r.to)}</b></div><div><small>Kiknek</small><b>${esc(r.scope.name)}</b></div></div>
      <p class="unit">Az értékek óra:perc formában szerepelnek.</p>
      <table class="sum"><thead><tr><th>Dolgozó</th><th class="r">Nyitó</th><th class="r">Jóváírás</th><th class="r">Kivétel</th><th class="r">Záró</th></tr></thead>
        <tbody>${rows.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${hm(x.opening)}</td><td class="r plus">${x.credit ? hm(x.credit, true) : '–'}</td><td class="r minus">${x.used ? hm(-x.used) : '–'}</td><td class="r"><b>${hm(x.closing)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Összesen</td><td class="r">${hm(sum('opening'))}</td><td class="r">${hm(sum('credit'), true)}</td><td class="r">${hm(-sum('used'))}</td><td class="r">${hm(sum('closing'))}</td></tr></tfoot></table>
      <div class="sig"><div>Készítette</div><div>Óvodavezető</div></div>
      <div class="foot"><span>Az egyenleg szabadidőben értendő.</span><span>Kelt: ………………………</span></div></section>`;
  document.getElementById('print').onclick = () => window.print();
}

/* ---------- naptár ---------- */

async function viewCalendar(q) {
  const now = new Date();
  let month = q.get('m') || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, mo] = month.split('-').map(Number);
  const [{ entries, leaves = [], today: srvToday }] = await Promise.all([api(`/calendar?month=${month}`), loadHolidays([y])]);
  const first = new Date(y, mo - 1, 1, 12);
  const days = new Date(y, mo, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const byDay = {};
  entries.forEach((e) => { (byDay[e.date] ||= []).push(e); });
  const byLeave = {}; leaves.forEach((l) => { (byLeave[l.date] ||= []).push(l); });
  const prev = new Date(y, mo - 2, 1, 12), next = new Date(y, mo, 1, 12);
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const title = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(first);
  const cells = [...Array(lead).fill('<div class="day empty"></div>')];
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${pad(d)}`; const n = (byDay[date] || []).length;
    const h = HOL.get(date); const dow = new Date(y, mo - 1, d, 12).getDay(); const wkend = dow === 0 || dow === 6;
    const kind = h ? (h.kind === 'off' ? ' hol' : ' wrk') : wkend ? ' wkd' : '';
    cells.push(`<button type="button" class="day ${date === srvToday ? 'today' : ''} ${date > srvToday ? 'future' : ''}${kind}" data-day="${date}"${h ? ` title="${esc(h.label)}"` : ''}><span>${d}</span>${n ? `<i>${n}</i>` : ''}${(byLeave[date] || []).length ? `<i class="lv">${byLeave[date].length}</i>` : ''}</button>`);
  }
  $app.innerHTML = `
    <div class="topbar"><h2>Naptár</h2></div>
    <div class="calhead"><a class="back" href="#/naptar?m=${key(prev)}" aria-label="Előző hónap">${ICONS.back}</a><b>${title}</b>
      <a class="back" href="#/naptar?m=${key(next)}" aria-label="Következő hónap" style="transform:scaleX(-1)">${ICONS.back}</a></div>
    <div class="calgrid"><span>H</span><span>K</span><span>Sze</span><span>Cs</span><span>P</span><span>Szo</span><span>V</span>${cells.join('')}</div>
    <p class="tabs-note"><b style="color:var(--bar)">Zöld szám</b> (bal oldalon): szabadságon lévők, <b style="color:var(--coral)">piros szám</b> (jobb oldalon): szabadidőt kivevők. <b style="color:var(--neg)">Piros szám</b>: munkaszüneti nap, keretes: ledolgozandó munkanap. Az áthelyezett napokat a Beállításokban adhatod meg.</p>
    <div id="dd" class="upcoming" hidden></div>${nav('cal')}`;
  const show = (date) => {
    document.querySelectorAll('.day[data-day]').forEach((c) => { const on = c.dataset.day === date; c.classList.toggle('sel', on); c.setAttribute('aria-pressed', on); });
    const list = byDay[date] || [];
    const box = document.getElementById('dd'); box.hidden = false;
    const h = HOL.get(date); const dow = new Date(date + 'T12:00:00').getDay();
    const dayNote = h ? `<p class="holnote"><b>${esc(h.label || (h.kind === 'off' ? 'Szabadnap' : 'Munkanap'))}</b>${h.kind === 'work' ? ' · ledolgozandó munkanap' : ' · munkaszüneti nap'}</p>` : dow === 0 || dow === 6 ? '<p class="holnote">Hétvége</p>' : '';
    const lv = byLeave[date] || [];
    const lvHtml = lv.length ? `<span class="label" style="margin-top:6px">Szabadságon</span>${lv.map((e) => `<a href="#/szabadsag/${e.worker_id}"><b>egész nap</b><span>${esc(e.name)}</span><em></em></a>`).join('')}` : '';
    const stHtml = list.length ? `<span class="label" style="margin-top:6px">Szabadidő</span>${list.map((e) => `<a href="#/dolgozo/${e.worker_id}"><b>${fmt(-e.minutes)}</b><span>${esc(e.name)}${e.note ? ` · ${esc(e.note)}` : ''}</span><em></em></a>`).join('')}` : '';
    box.innerHTML = `<span class="label">${fullDate(date)}</span>${dayNote}${lvHtml}${stHtml}${!lv.length && !list.length ? '<p class="tabs-note" style="margin:0">Ezen a napon senki nincs távol.</p>' : ''}`;
  };
  document.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => show(b.dataset.day)));
  if (byDay[srvToday] || byLeave[srvToday]) show(srvToday);
}

/* ---------- napló ---------- */

async function viewAudit() {
  const { log, workers } = await api('/audit?limit=1000');
  const name = (id) => workers[id] || `törölt dolgozó (#${id})`;
  const when = (s) => new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s.replace(' ', 'T') + 'Z'));
  const text = (r) => {
    const d = r.detail || {};
    switch (r.action) {
      case 'worker.create': return `Dolgozó felvéve: ${d.name ? esc(d.name) : `törölt dolgozó (#${d.id})`}${d.opening ? ` (nyitó: ${fmt(d.opening)})` : ''}`;
      case 'migration.opening': return `Nyitó egyenlegek dátuma ${dotted(d.date)}-ra állítva (${d.opening} tétel), ${d.signatures} aláírás-jelölés visszavonva${d.earlier ? `. Figyelem: ${d.earlier} nem nyitó tétel dátuma korábbi, mint ${dotted(d.date)}` : ''}`;
      case 'leave.add': return `Szabadság rögzítve: ${esc(name(d.workerId))} · ${d.count} nap (${dotted(d.from)} – ${dotted(d.to)})`;
      case 'leave.delete': return `Szabadság törölve: ${esc(name(d.workerId))} · ${d.count} nap`;
      case 'leave.budget': return `Szabadság-keret: ${esc(name(d.workerId))} · ${d.year}: ${d.entitlement} nap${d.carry ? ` + ${d.carry} átvitt` : ''}`;
      case 'holiday.set': return `Speciális nap: ${dotted(d.date)} (${d.kind === 'off' ? 'szabadnap' : 'ledolgozandó munkanap'})`;
      case 'holiday.delete': return `Speciális nap törölve: ${dotted(d.date)}`;
      case 'push.sent': return `Névnap-értesítés elküldve (${d.sent} eszköz)`;
      case 'push.test': return `Teszt értesítés (${d.sent} eszköz)`;
      case 'push.subscribe': return 'Értesítés bekapcsolva egy eszközön';
      case 'worker.bulk': return `Dolgozók tömeges felvétele: ${d.count} fő`;
      case 'worker.delete': return `Dolgozó véglegesen törölve (#${d.id}, ${d.entries} tétel)`;
      case 'worker.update': return d.deleted ? `Dolgozó módosítva (törölt dolgozó, #${d.id})` : d.fn && d.name === undefined && !d.status ? `Keresztnév (névnap) módosítva: ${esc(name(d.id))}` : d.name !== undefined ? `Átnevezve: ${esc(d.name)}` : d.status === 'parked' ? `Parkoltatva: ${esc(name(d.id))}${d.note ? ` (${esc(d.note)})` : ''}` : d.status === 'left' || d.active === false ? `Kilépettnek jelölve: ${esc(name(d.id))}` : `Aktiválva: ${esc(name(d.id))}`;
      case 'entry.create': return `Rögzítve: ${(d.workerIds || []).map((x) => esc(name(x))).join(', ')} · ${fmt(d.minutes, true)} · ${d.dates ? `${d.dates.length} nap (${dotted(d.dates[0])} – ${dotted(d.dates[d.dates.length - 1])})` : dotted(d.date)}${d.overrideSigned ? ' · <b>aláírt időszakba</b>' : ''}${d.offline ? ' · offline rögzítve' : ''}`;
      case 'entry.undo': return `Visszavonva (törölve): ${(d.ids || []).length} tétel`;
      case 'entry.reverse': return `Sztornó rögzítve (#${d.reverses} tételhez)`;
      case 'signature.create': return `Aláírás rögzítve: ${esc(name(d.wid))} · ${dotted(d.from)} – ${dotted(d.to)}`;
      case 'signature.delete': return 'Aláírás visszavonva';
      case 'signature.bulk': return `Aláírások rögzítve: ${d.count} dolgozó · ${dotted(d.from)} – ${dotted(d.to)}`;
      case 'entry.date': return d.deleted ? `Tétel dátuma módosítva (törölt dolgozó, #${d.workerId})` : `Tétel dátuma módosítva: ${esc(name(d.workerId))} · ${dotted(d.from)} → ${dotted(d.to)}${d.overrideSigned ? ' · <b>aláírt időszakban</b>' : ''}`;
      case 'entry.minutes': return d.deleted ? `Tétel időtartama módosítva (törölt dolgozó, #${d.workerId})` : `Időtartam módosítva: ${esc(name(d.workerId))} · ${fmt(d.from, true)} → ${fmt(d.to, true)}${d.overrideSigned ? ' · <b>aláírt időszakban</b>' : ''}`;
      case 'entry.note': return d.deleted ? `Megjegyzés módosítva (törölt dolgozó, #${d.workerId})` : `Megjegyzés módosítva: ${esc(name(d.workerId))} · „${esc(d.from)}” → „${esc(d.to)}”${d.overrideSigned ? ' · <b>aláírt időszakban</b>' : ''}`;
      case 'worker.groups': return `Munkakör módosítva: ${esc(name(d.id))}`;
      case 'group.create': return `Munkakör létrehozva: ${esc(d.name)}`;
      case 'group.delete': return 'Munkakör törölve';
      case 'settings.warn': return `Magas egyenleg jelzése: ${d.hours} óra`;
      case 'password.change': return 'Jelszó módosítva';
      case 'login.fail': return `Sikertelen belépés (${esc(d.ip)})`;
      default: return esc(r.action);
    }
  };
  const TYPE = { all: 'Mind', entry: 'Tételek', worker: 'Dolgozók', sign: 'Aláírások', sec: 'Biztonság' };
  const typeOf = (r) => (r.action.startsWith('entry.') ? 'entry' : r.action.startsWith('worker.') || r.action.startsWith('group.') ? 'worker' : r.action.startsWith('signature.') ? 'sign' : 'sec');
  const f = { t: 'all', q: '' };
  $app.innerHTML = `<div class="topbar"><a class="back" href="#/beallitasok" aria-label="Vissza">${ICONS.back}</a><h2>Napló</h2></div>
    <label class="search">${ICONS.search}<input id="aq" type="search" placeholder="Keresés a naplóban" aria-label="Keresés a naplóban"></label>
    <div class="quick chips" id="at">${Object.entries(TYPE).map(([k, v]) => `<button type="button" data-at="${k}" aria-pressed="${k === 'all'}">${v}</button>`).join('')}</div>
    <p class="tabs-note" id="acount"></p><div class="entries" id="al"></div>${nav('set')}`;
  const plain = (s) => s.replace(/<[^>]+>/g, '').toLowerCase();
  const draw = () => {
    const rows = log.filter((r) => (f.t === 'all' || typeOf(r) === f.t) && (!f.q || plain(text(r)).includes(f.q) || when(r.at).includes(f.q)));
    document.getElementById('acount').textContent = `${rows.length} esemény (az utolsó ${log.length}-ból)`;
    document.getElementById('al').innerHTML = rows.map((r) => `<div class="entry ${r.action === 'login.fail' ? 'dim' : ''}"><div class="meta"><b>${text(r)}</b><span>${when(r.at)}</span></div></div>`).join('') || '<p class="empty">Nincs találat.</p>';
  };
  document.getElementById('aq').oninput = (e) => { f.q = e.target.value.trim().toLowerCase(); draw(); };
  document.querySelectorAll('[data-at]').forEach((b) => (b.onclick = () => { f.t = b.dataset.at; document.querySelectorAll('[data-at]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw();
}


/* ---------- szabadságok ---------- */

const LEAVE_START_YEAR = 2027;
const leaveYearDefault = () => Math.max(new Date().getFullYear(), LEAVE_START_YEAR);
const nextWorkday = (isoDate) => { const d = new Date(isoDate + 'T12:00:00'); do { d.setDate(d.getDate() + 1); } while (isOffDay(iso(d))); return iso(d); };
// Összefüggő munkanapok egy sorozatba (a hétvége és az ünnepnap nem szakítja meg)
function leaveRanges(list) {
  const out = [];
  for (const l of list) {
    const last = out[out.length - 1];
    if (last && nextWorkday(last.to) === l.date) { last.to = l.date; last.days++; last.ids.push(l.id); }
    else out.push({ from: l.date, to: l.date, days: 1, ids: [l.id], note: l.note || '' });
  }
  return out;
}
const rangeText = (r) => (r.from === r.to ? dotted(r.from) : `${dotted(r.from)} – ${dotted(r.to)}`);
const nap = (n) => `${n} nap`;
const yearNav = (y, base) => `<div class="calhead" style="margin:6px 0 0"><a class="back" href="#${base}?y=${y - 1}" aria-label="Előző év">${ICONS.back}</a><b>${y}</b>
  <a class="back" href="#${base}?y=${y + 1}" aria-label="Következő év" style="transform:scaleX(-1)">${ICONS.back}</a></div>`;

async function viewLeave(q) {
  const year = +q.get('y') || leaveYearDefault();
  const { workers, groups } = await api(`/leave/overview?year=${year}`);
  const f = { g: 0 };
  const noBudget = workers.filter((w) => !w.entitlement && !w.carry).length;
  const totalUsed = workers.reduce((a, w) => a + w.used, 0), totalPlanned = workers.reduce((a, w) => a + w.planned, 0);
  const usedGroups = groups.filter((g) => workers.some((w) => w.group_id === g.id));
  $app.innerHTML = `
    <div class="head"><div><small>Adonyi Hóvirág Óvoda</small><h1>Szabadság</h1></div>${ICONS.flowerArt}</div>
    <div class="hero"><div class="top"><span>${year}. év · kivett szabadság összesen</span><div class="big">${totalUsed}<span>nap</span></div></div>
      <div class="pills"><span class="pill">${workers.length} dolgozó</span>${totalPlanned ? `<span class="pill">${totalPlanned} tervezett nap</span>` : ''}</div></div>
    ${yearNav(year, '/szabadsag')}
    ${noBudget ? `<p class="tabs-note">${noBudget} dolgozónál még nincs megadva a ${year}. évi szabadság-keret. Koppints a dolgozóra, és add meg.</p>` : ''}
    <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Név keresése" aria-label="Név keresése"></label>
    ${usedGroups.length ? `<div class="quick chips" id="gf"><button type="button" data-g="0" aria-pressed="true">Mindenki</button>${usedGroups.map((g) => `<button type="button" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>` : ''}
    <div class="items" id="l" style="margin-top:12px"></div>
    <a class="fab" href="#/szabadsag/uj?y=${year}">${ICONS.plus}Szabadság</a>${nav('leave')}`;
  const draw = () => {
    const qv = document.getElementById('q').value.trim().toLowerCase();
    const rows = workers.filter((w) => w.name.toLowerCase().includes(qv) && (!f.g || w.group_id === f.g));
    document.getElementById('l').innerHTML = rows.length ? rows.map((w) => {
      const total = w.entitlement + w.carry; const usedPct = total > 0 ? Math.min(100, (w.used / total) * 100) : 0; const planPct = total > 0 ? Math.min(100 - usedPct, (w.planned / total) * 100) : 0;
      const over = total > 0 && w.remaining < 0;
      return `<a class="item" href="#/szabadsag/${w.worker_id}?y=${year}"><div class="h"><span>${esc(w.name)}</span><em class="${over ? 'neg' : ''}">${total ? `maradék ${nap(w.remaining)}` : 'nincs keret'}</em></div>
        <div class="track"><s class="${over ? 'neg' : ''}" style="width:${usedPct}%"></s><s class="pl" style="left:${usedPct}%;width:${planPct}%"></s></div>
        <div class="sub"><span>${total ? `keret ${w.entitlement}${w.carry ? ` + átvitt ${w.carry}` : ''}` : 'a keret nincs megadva'}</span><span>kivett ${w.used}${w.planned ? ` · tervezett ${w.planned}` : ''}</span></div></a>`;
    }).join('') : '<p class="empty">Nincs találat.</p>';
  };
  document.getElementById('q').oninput = draw;
  document.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { f.g = +b.dataset.g; document.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(); }));
  draw();
}

async function viewLeaveWorker(id, q) {
  const year = +q.get('y') || leaveYearDefault();
  const { worker, budget, prev_remaining: prevRem, leaves } = await api(`/leave/worker/${id}?year=${year}`);
  await loadHolidays([year, year + 1]);
  const total = budget.entitlement + budget.carry; const used = leaves.length;
  const ranges = leaveRanges(leaves);
  const t = today(); const pastN = leaves.filter((l) => l.date <= t).length;
  $app.innerHTML = `
    <div class="topbar withart"><a class="back" href="#/szabadsag?y=${year}" aria-label="Vissza">${ICONS.back}</a><h2>${esc(worker.name)}</h2></div>${ICONS.flowerArt}
    <div class="hero"><div class="top"><span>${year}. év · maradék szabadság</span><div class="big">${total - used}<span>nap</span></div></div>
      <div class="pills"><span class="pill">keret ${total} nap</span><span class="pill">kivett ${pastN}</span>${used - pastN ? `<span class="pill">tervezett ${used - pastN}</span>` : ''}</div></div>
    ${yearNav(year, `/szabadsag/${id}`)}
    <a class="btn" href="#/szabadsag/uj?w=${id}&y=${year}" style="text-decoration:none;margin-top:14px">+ Szabadság rögzítése</a>
    <form id="bf" class="yearcard"><span class="label">Éves keret (nap)</span>
      <div class="row"><div style="flex:1;min-width:0"><label class="label" for="be">Alapkeret</label><input class="input" id="be" type="number" inputmode="numeric" min="0" max="366" value="${budget.entitlement}"></div>
        <div style="flex:1;min-width:0"><label class="label" for="bc">Átvitt az előző évből</label><input class="input" id="bc" type="number" inputmode="numeric" min="-366" max="366" value="${budget.carry}"></div></div>
      ${prevRem !== null && prevRem > 0 && !budget.carry ? `<button type="button" class="btn ghost small" id="carry" style="margin-top:8px">Átvitel az előző évből (${prevRem} nap)</button>` : ''}
      <button class="btn small" type="submit" style="margin-top:10px">Keret mentése</button></form>
    <div class="field"><span class="label">Kivett szabadságok</span>${ranges.length ? `<div class="entries">${ranges.map((r) => `<div class="entry"><div class="bal pos">${nap(r.days)}</div>
      <div class="meta"><b>${rangeText(r)}</b><span>${r.note ? esc(r.note) : r.to > t ? 'tervezett' : 'kivett'}</span></div><button class="undo" data-delr="${r.ids.join(',')}">Törlés</button></div>`).join('')}</div>` : '<p class="tabs-note" style="margin:0">Ebben az évben még nincs rögzített szabadság.</p>'}</div>${nav('leave')}`;
  const $ = (x) => document.getElementById(x);
  $('bf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/leave/budget', { method: 'PUT', body: { worker_id: id, year, entitlement: +$('be').value || 0, carry: +$('bc').value || 0 } }); toast('Keret mentve'); viewLeaveWorker(id, q); }
    catch (err) { toast(err.message); }
  };
  const carry = $('carry'); if (carry) carry.onclick = () => { $('bc').value = prevRem; };
  document.querySelectorAll('[data-delr]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Törlés'; }, 3000); return; }
    try { await api('/leave/delete', { method: 'POST', body: { ids: b.dataset.delr.split(',').map(Number) } }); toast('Törölve'); viewLeaveWorker(id, q); } catch (err) { toast(err.message); }
  }));
}

async function viewLeaveNew(q) {
  const { workers } = await api('/workers');
  const active = workers.filter(isAct);
  if (!active.length) { $app.innerHTML = `<p class="empty">Előbb vegyél fel dolgozót a Beállításokban.</p>${nav('set')}`; return; }
  const ty = new Date().getFullYear(); await loadHolidays([ty - 1, ty, ty + 1, ty + 2]);
  const year0 = +q.get('y') || leaveYearDefault(); const t = today();
  const start = String(year0) === t.slice(0, 4) ? t : `${year0}-01-01`;
  const st = { w: active.some((w) => w.id === +q.get('w')) ? +q.get('w') : active[0].id, from: start, to: start, wait: false, cal: start.slice(0, 7), excl: new Set() };
  const WD = ['v', 'h', 'k', 'sze', 'cs', 'p', 'szo'];
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/szabadsag?y=${year0}" aria-label="Vissza">${ICONS.back}</a><h2>Szabadság rögzítése</h2></div>
    <form id="f">
    <div class="field"><label for="w">Dolgozó</label><select class="input" id="w">${active.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span class="label">Melyik napokra? (tól–ig)</span>
      <div class="calhead" style="margin-top:0"><button type="button" class="back" data-cm="-1" aria-label="Előző hónap">${ICONS.back}</button><b id="cmt"></b>
        <button type="button" class="back" data-cm="1" aria-label="Következő hónap" style="transform:scaleX(-1)">${ICONS.back}</button></div>
      <div class="calgrid pick" id="cpick"></div>
      <p class="tabs-note" id="dsum"></p>
      <label class="check"><input type="checkbox" id="wk" checked><span>Hétvégék és munkaszüneti napok kihagyása</span></label>
      <div class="quick chips" id="days" style="margin-top:0" hidden></div></div>
    <div class="field"><label for="n">Megjegyzés (nem kötelező)</label><input class="input" id="n" maxlength="120" placeholder="Pl. téli szünet"></div>
    <div class="preview"><span id="pl">Maradék</span><span id="pv"></span></div>
    <div id="msg"></div></form><div class="savebar"><button class="btn" id="save" type="submit" form="f">Mentés</button></div>`;
  const $ = (x) => document.getElementById(x);
  $('w').value = st.w;
  const ovCache = {};
  const getOv = async (y) => (ovCache[y] ??= (await api(`/leave/overview?year=${y}`)).workers);
  const rangeDays = () => {
    if (!st.from || !st.to || st.from > st.to) return [];
    const skip = $('wk').checked && st.from !== st.to; const out = []; const d = new Date(st.from + 'T12:00:00');
    while (iso(d) <= st.to && out.length < 62) { if (!(skip && isOffDay(iso(d)))) out.push(iso(d)); d.setDate(d.getDate() + 1); }
    return out;
  };
  const dates = () => rangeDays().filter((x) => !st.excl.has(x));
  const renderDays = () => {
    const ds = rangeDays(); $('days').hidden = ds.length < 2;
    $('days').innerHTML = ds.length < 2 ? '' : '<span class="tabs-note" style="flex:1 1 100%;margin:0">Koppints egy napra, ha az kimarad:</span>' + ds.map((x) => { const d = new Date(x + 'T12:00:00'); return `<button type="button" data-day="${x}" aria-pressed="${!st.excl.has(x)}">${d.getMonth() + 1}. ${d.getDate()}. ${WD[d.getDay()]}</button>`; }).join('');
    $('days').querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.excl.has(b.dataset.day) ? st.excl.delete(b.dataset.day) : st.excl.add(b.dataset.day); sync(); }));
  };
  const renderCal = () => {
    const [y, mo] = st.cal.split('-').map(Number);
    const first = new Date(y, mo - 1, 1, 12), count = new Date(y, mo, 0).getDate(), lead = (first.getDay() + 6) % 7;
    $('cmt').textContent = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(first);
    const cells = [...WD.slice(1), WD[0]].map((x) => `<span>${x}</span>`);
    for (let i = 0; i < lead; i++) cells.push('<div class="day empty"></div>');
    const skipOn = $('wk').checked && st.from !== st.to;
    for (let d = 1; d <= count; d++) {
      const date = `${st.cal}-${pad(d)}`; const dow = new Date(y, mo - 1, d, 12).getDay(); const wkend = dow === 0 || dow === 6; const hol = HOL.get(date); const off = isOffDay(date);
      const inRange = date >= st.from && date <= st.to; const edge = date === st.from || date === st.to; const skipped = inRange && ((skipOn && off) || st.excl.has(date));
      cells.push(`<button type="button" class="day${date === t ? ' today' : ''}${edge && !skipped ? ' sel' : inRange ? ' inr' : ''}${skipped ? ' skip' : ''}${hol?.kind === 'off' ? ' hol' : hol?.kind === 'work' ? ' wrk' : wkend ? ' wkd' : ''}" data-cd="${date}"${hol ? ` title="${esc(hol.label)}"` : ''}>${d}</button>`);
    }
    $('cpick').innerHTML = cells.join('');
    $('cpick').querySelectorAll('[data-cd]').forEach((b) => (b.onclick = () => {
      const date = b.dataset.cd; st.excl.clear();
      if (!st.wait) { st.from = date; st.to = date; st.wait = true; } else { if (date >= st.from) st.to = date; else { st.to = st.from; st.from = date; } st.wait = false; }
      sync();
    }));
  };
  const sync = async () => {
    if (st.to < st.from) st.to = st.from;
    renderCal(); renderDays();
    const ds = dates(); const n = ds.length;
    const span = st.from === st.to ? dotted(st.from) : `${dotted(st.from)} – ${dotted(st.to)}`;
    $('dsum').innerHTML = st.wait ? `<b>${dotted(st.from)}</b> · koppints a záró napra, vagy maradjon egy nap.` : n ? `<b>${span}</b> · ${n} nap` : 'Nincs kijelölt nap.';
    $('save').disabled = !n;
    if (!n) { $('pv').textContent = ''; return; }
    const y = Number(ds[0].slice(0, 4)); const ov = (await getOv(y)).find((x) => x.worker_id === +$('w').value);
    const inYear = ds.filter((x) => x.startsWith(String(y))).length;
    if (!ov || (!ov.entitlement && !ov.carry)) { $('pl').textContent = `${y}. évi keret`; $('pv').innerHTML = '<b>nincs megadva</b>'; return; }
    const after = ov.remaining - inYear;
    $('pl').textContent = `Maradék (${y})`; $('pv').innerHTML = `<span style="opacity:.6;text-decoration:line-through">${nap(ov.remaining)}</span> → <b style="${after < 0 ? 'color:var(--neg)' : ''}">${nap(after)}</b>${after < 0 ? ' · a keret nem fedezi' : ''}`;
  };
  $('w').onchange = sync; $('wk').onchange = () => { st.excl.clear(); sync(); };
  document.querySelectorAll('[data-cm]').forEach((b) => (b.onclick = async () => { const [y, mo] = st.cal.split('-').map(Number); const d = new Date(y, mo - 1 + +b.dataset.cm, 1, 12); st.cal = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; try { await loadHolidays([d.getFullYear()]); } catch { /* nem baj */ } renderCal(); }));
  sync();
  $('f').onsubmit = async (e) => {
    e.preventDefault(); $('save').disabled = true; $('msg').innerHTML = '';
    const ds = dates();
    try {
      const r = await api('/leave', { method: 'POST', body: { worker_id: +$('w').value, dates: ds, note: $('n').value } });
      toast(`Rögzítve: ${r.added} nap${r.skipped ? ` (${r.skipped} már szerepelt)` : ''}`);
      location.hash = `#/szabadsag/${$('w').value}?y=${ds[0].slice(0, 4)}`;
    } catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; $('save').disabled = false; }
  };
}

/* ----- szabadság-kimutatások (havi / éves, összesítő / dolgozónként, aláírás nélkül) ----- */

async function viewLeaveReportForm() {
  const { workers, groups } = await api('/workers');
  const active = workers.filter(isAct);
  const now = new Date(); const y0 = leaveYearDefault(); const st = { mode: 'sum', per: 'month' };
  const useGroups = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
  const months = Array.from({ length: 12 }, (_, i) => new Intl.DateTimeFormat('hu-HU', { month: 'long' }).format(new Date(2000, i, 1)));
  const selMonth = y0 === now.getFullYear() ? now.getMonth() : 0;
  $app.innerHTML = `
    <div class="topbar"><h2>Kimutatás</h2></div>
    <div class="seg" style="margin-top:10px"><a class="segl" href="#/kimutatas">Túlóra</a><a class="segl on" href="#/kimutatas/szabadsag">Szabadság</a></div>
    <form id="f">
    <div class="field"><span class="label">Forma</span><div class="seg"><button type="button" data-mode="sum" aria-pressed="true">Összesítő (mindenki egyben)</button><button type="button" data-mode="each" aria-pressed="false">Dolgozónként</button></div></div>
    <div class="field"><label for="w">Kiknek</label><select class="input" id="w"><option value="all">Mindenki (${active.length} dolgozó)</option>
      ${useGroups.length ? `<optgroup label="Munkakör">${useGroups.map((g) => `<option value="g${g.id}">${esc(g.name)}</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Dolgozó">${active.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</optgroup></select></div>
    <div class="field"><span class="label">Időszak</span><div class="seg"><button type="button" data-per="month" aria-pressed="true">Havi</button><button type="button" data-per="year" aria-pressed="false">Éves</button></div></div>
    <div class="field"><div class="row"><div style="flex:1;min-width:0"><label class="label" for="yr">Év</label><input class="input" id="yr" type="number" inputmode="numeric" min="2000" max="2100" value="${y0}"></div>
      <div style="flex:1;min-width:0" id="mwrap"><label class="label" for="mo">Hónap</label><select class="input" id="mo">${months.map((m, i) => `<option value="${i + 1}"${i === selMonth ? ' selected' : ''}>${m}</option>`).join('')}</select></div></div></div>
    <button class="btn" type="submit">Kimutatás megnyitása</button></form>
    <p class="tabs-note">Ez a kimutatás aláírás nélküli, nyomtatható vagy PDF-be menthető.</p>${nav('rep')}`;
  const $ = (x) => document.getElementById(x);
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => { st.mode = b.dataset.mode; document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x === b)); }));
  document.querySelectorAll('[data-per]').forEach((b) => (b.onclick = () => { st.per = b.dataset.per; document.querySelectorAll('[data-per]').forEach((x) => x.setAttribute('aria-pressed', x === b)); $('mwrap').hidden = st.per === 'year'; }));
  $('f').onsubmit = (e) => { e.preventDefault(); location.hash = `#/kimutatas/szabadsag/nyomtatas?mode=${st.mode}&year=${$('yr').value}${st.per === 'month' ? `&month=${$('mo').value}` : ''}&w=${$('w').value}`; };
}

async function viewLeaveReport(q) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const year = +q.get('year'), month = +q.get('month') || null, mode = q.get('mode') || 'sum';
  const [r] = await Promise.all([api(`/leave/report?year=${year}${month ? `&month=${month}` : ''}&worker=${encodeURIComponent(q.get('w') || 'all')}`), loadHolidays([year, year + 1])]);
  const when = stamp(); const mname = (i) => new Intl.DateTimeFormat('hu-HU', { month: 'long' }).format(new Date(2000, i - 1, 1));
  const period = month ? `${year}. ${mname(month)}` : `${year}. év`;
  const head = `<div class="ph-head"><div class="org">${ICONS.flower.replace('<svg', '<svg width="38" height="38" style="color:#1E4D3B"')}
    <div><b>Adonyi Hóvirág Óvoda</b><span>Szabadság nyilvántartás</span></div></div><div class="meta">Készült<br><b>${when}</b></div></div>`;
  const MS = Array.from({ length: 12 }, (_, i) => mname(i + 1).slice(0, 3));
  let body;
  if (mode === 'sum') {
    const cols = month
      ? '<th class="r">Keret</th><th class="r">A hónapban</th><th class="r">Év eleje óta</th><th class="r">Maradék</th>'
      : `<th class="r">Keret</th>${MS.map((m) => `<th class="r">${m}</th>`).join('')}<th class="r">Kivett</th><th class="r">Maradék</th>`;
    const rows = r.rows.map((x) => `<tr><td>${esc(x.worker.name)}</td><td class="r">${x.total}</td>${month
      ? `<td class="r">${x.used_period}</td><td class="r">${x.used_ytd}</td><td class="r"><b>${x.remaining}</b></td>`
      : `${x.by_month.map((n) => `<td class="r">${n || '–'}</td>`).join('')}<td class="r">${x.used_ytd}</td><td class="r"><b>${x.remaining}</b></td>`}</tr>`).join('');
    const sum = (k) => r.rows.reduce((a, x) => a + x[k], 0);
    const foot = `<tr><td>Összesen</td><td class="r">${sum('total')}</td>${month ? `<td class="r">${sum('used_period')}</td><td class="r">${sum('used_ytd')}</td>` : `${MS.map((_, i) => `<td class="r">${r.rows.reduce((a, x) => a + x.by_month[i], 0) || '–'}</td>`).join('')}<td class="r">${sum('used_ytd')}</td>`}<td class="r">${sum('remaining')}</td></tr>`;
    body = `<section class="sheet">${head}<h3>Szabadság-kimutatás</h3>
      <div class="facts"><div><small>Időszak</small><b>${period}</b></div><div><small>Kiknek</small><b>${esc(r.scope.name)}</b></div></div>
      <p class="unit">Az értékek napokban szerepelnek. A keret az alapkeretet és az átvitt napokat tartalmazza.</p>
      <div class="tw"><table class="sum leave"><thead><tr><th>Dolgozó</th>${cols}</tr></thead><tbody>${rows || '<tr><td colspan="6" class="none">Nincs dolgozó.</td></tr>'}</tbody><tfoot>${foot}</tfoot></table></div>
      <div class="foot"><span>Maradék: keret mínusz a ${month ? 'hónap végéig' : 'évben'} kivett napok.</span><span></span></div></section>`;
  } else {
    body = r.rows.map((x) => {
      const list = x.dates.map((d, i) => ({ id: i, date: d })); const ranges = leaveRanges(list);
      const trs = ranges.map((g) => `<tr><td>${rangeText(g)}</td><td class="r">${g.days}</td></tr>`).join('');
      const monthly = month ? '' : `<div class="tw"><table class="sum leave" style="margin-top:12px"><thead><tr>${MS.map((m) => `<th class="r">${m}</th>`).join('')}</tr></thead><tbody><tr>${x.by_month.map((n) => `<td class="r">${n || '–'}</td>`).join('')}</tr></tbody></table></div>`;
      return `<section class="sheet">${head}<h3>Szabadság-kimutatás</h3>
        <div class="facts"><div><small>Dolgozó</small><b>${esc(x.worker.name)}</b></div><div><small>Időszak</small><b>${period}</b></div>
          <div><small>Éves keret</small><b>${x.entitlement}${x.carry ? ` + ${x.carry} átvitt` : ''} = ${x.total} nap</b></div><div><small>Maradék${month ? ' (hónap végén)' : ''}</small><b>${x.remaining} nap</b></div></div>
        <table><thead><tr><th>Időszak</th><th class="r">Napok</th></tr></thead><tbody>${trs || '<tr><td colspan="2" class="none">Az időszakban nem volt szabadság.</td></tr>'}</tbody></table>
        ${monthly}
        <div class="total"><span>${month ? 'Kivett a hónapban' : 'Kivett az évben'}</span><b>${x.used_period} nap</b></div>
        ${month ? `<p class="unit" style="margin-top:8px">Év eleje óta összesen: ${x.used_ytd} nap${x.planned_after ? ` · a hónap után tervezett: ${x.planned_after} nap` : ''}.</p>` : ''}
        <div class="foot"><span>Az értékek napokban szerepelnek.</span><span></span></div></section>`;
    }).join('') || '<p class="empty">Nincs dolgozó a kimutatáshoz.</p>';
  }
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas/szabadsag" aria-label="Vissza">${ICONS.back}</a><h2>${esc(r.scope.name)} · ${period}</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:16px">Nyomtatás / PDF mentése</button></div>${body}`;
  document.getElementById('print').onclick = () => window.print();
}

/* ---------- útvonalak ---------- */

async function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const q = new URLSearchParams(query);
  try {
    if (path === '/belepes') return viewLogin();
    $app.classList.toggle('wide', path.startsWith('/kimutatas/') && path !== '/kimutatas/szabadsag');
    if (path === '/uj') return await viewNew(q.get('w'));
    if (path === '/szabadsag') return await viewLeave(q);
    if (path === '/szabadsag/uj') return await viewLeaveNew(q);
    const lm = path.match(/^\/szabadsag\/(\d+)$/); if (lm) return await viewLeaveWorker(lm[1], q);
    if (path === '/kimutatas/szabadsag') return await viewLeaveReportForm();
    if (path === '/kimutatas/szabadsag/nyomtatas') return await viewLeaveReport(q);
    if (path === '/kimutatas') return await viewReportForm(q);
    if (path === '/kimutatas/nyomtatas') return await viewReportPrint(q);
    if (path === '/kimutatas/osszesito') return await viewReportSummary(q);
    if (path === '/beallitasok') return await viewSettings();
    if (path === '/naptar') return await viewCalendar(q);
    if (path === '/naplo') return await viewAudit();
    const m = path.match(/^\/dolgozo\/(\d+)$/);
    if (m) return await viewWorker(m[1]);
    return await viewList();
  } catch (err) {
    if (err.message !== 'login') $app.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', route);

const $net = document.getElementById('net');
const setNet = () => { if ($net) $net.hidden = navigator.onLine; };
addEventListener('online', () => { setNet(); flushQueue(); });
addEventListener('offline', setNet);
setNet();
route().then(() => flushQueue());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* nem baj, online továbbra is működik */ });
