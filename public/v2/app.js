// HÓVIRÁG v2 – egyszerűsített felület ugyanarra az adatbázisra és API-ra.
// Elv: rögzítés bárhonnan pár koppintással (+ gomb), áttekintés egy helyen (Ma), dolgozónként minden egy oldalon (Emberek).
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

/* ---------- segédek ---------- */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
const fmt = (m, signed = false) => {
  const a = Math.abs(m), h = Math.floor(a / 60), mm = a % 60;
  const sign = m < 0 ? '−' : signed && m > 0 ? '+' : '';
  return `${sign}${h ? `${h} ó` : ''}${h && mm ? ' ' : ''}${mm || !h ? `${mm} p` : ''}`;
};
const balClass = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero');
const fmtD = (o) => new Intl.DateTimeFormat('hu-HU', o);
const dShort = (s) => fmtD({ month: 'short', day: 'numeric' }).format(new Date(s + 'T12:00:00'));
const dLong = (s) => fmtD({ month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(s + 'T12:00:00'));
const dWeek = (s) => fmtD({ weekday: 'long' }).format(new Date(s + 'T12:00:00'));
const monthTitle = (ym) => fmtD({ year: 'numeric', month: 'long' }).format(new Date(ym + '-15T12:00:00'));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const gidsOf = (w) => (w.group_ids ? String(w.group_ids).split(',').map(Number) : []);
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
const LEAVE_START_YEAR = 2027;
const leaveYear = () => Math.max(new Date().getFullYear(), LEAVE_START_YEAR);
const ls = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } } };

function toast(msg, action) {
  $toast.innerHTML = ''; $toast.hidden = false;
  const t = document.createElement('span'); t.textContent = msg; $toast.append(t);
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
    b.onclick = () => { $toast.hidden = true; action.run(); }; $toast.append(b);
  }
  clearTimeout(toast.t); toast.t = setTimeout(() => { $toast.hidden = true; }, action ? 7000 : 3000);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET', credentials: 'same-origin',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch { throw new Error('Nincs kapcsolat.'); }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { location.hash = '#/belepes'; throw new Error('login'); }
  if (!res.ok) { const e = new Error(data.error || 'Hiba történt.'); if (data.needs_confirm) { e.needsConfirm = true; e.workers = data.workers; } throw e; }
  return data;
}

// munkaszüneti napok
const HOL = new Map(); const holYears = new Set();
async function loadHolidays(years) {
  const need = [...new Set(years)].filter((y) => !holYears.has(y));
  if (!need.length) return;
  const { days } = await api(`/holidays?years=${need.join(',')}`);
  days.forEach((d) => HOL.set(d.date, d)); need.forEach((y) => holYears.add(y));
}
const isOff = (s) => { const h = HOL.get(s); if (h) return h.kind === 'off'; const w = new Date(s + 'T12:00:00').getDay(); return w === 0 || w === 6; };
const nextWorkday = (s) => { let d = addDays(s, 1); while (isOff(d)) d = addDays(d, 1); return d; };
const workdays = (from, to) => { const out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) if (!isOff(d)) out.push(d); return out; };
// egymást követő munkanapok tól–ig sorozatokba (a hétvége nem szakítja meg)
function ranges(dates) {
  const out = [];
  for (const d of [...dates].sort()) { const l = out[out.length - 1]; if (l && nextWorkday(l.to) === d) { l.to = d; l.n++; } else out.push({ from: d, to: d, n: 1 }); }
  return out;
}
const rangeText = (r) => (r.from === r.to ? dShort(r.from) : `${dShort(r.from)} – ${dShort(r.to)}`);

/* ---------- ikonok ---------- */
const sv = (p, w = 22) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const I = {
  today: sv('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/>'),
  cal: sv('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  people: sv('<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.8 14.2c2.3.1 4 1.6 4.6 4.3"/>'),
  more: sv('<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'),
  plus: sv('<path d="M12 5v14M5 12h14"/>', 26),
  back: sv('<path d="M15 5l-7 7 7 7"/>', 18),
  next: sv('<path d="M9 5l7 7-7 7"/>', 18),
  search: sv('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>', 18),
  check: sv('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 18),
  flower: '<svg class="art" viewBox="20 18 90 100" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M50 114C47 84 38 58 24 34C42 52 52 82 54 114Z" fill="currentColor"/><path d="M54 114C58 86 70 66 84 46C72 68 62 90 58 114Z" fill="currentColor" opacity=".6"/><path d="M54 114C52 76 54 44 64 30C70 22 80 22 80 36"/><path d="M80 40C72 52 68 66 72 82C80 70 84 54 80 40Z" fill="var(--petal)" stroke="none"/><path d="M80 40C66 46 56 62 56 78C68 72 78 58 80 40Z" fill="var(--petal)" stroke="none" opacity=".85"/><path d="M80 40C94 46 104 62 104 78C92 72 82 58 80 40Z" fill="var(--petal)" stroke="none" opacity=".85"/></svg>',
};
const KIND = { credit: { t: 'Túlóra', s: '+ Túlóra', c: 'k-credit', d: 'Plusz órát dolgozott' }, use: { t: 'Szabadidő', s: '− Szabadidő', c: 'k-use', d: 'Túlórát vesz ki (mínusz óra)' }, leave: { t: 'Szabadság', s: 'Szabadság', c: 'k-leave', d: 'Szabadságnap(ok) az éves keretből' } };

const nav = (on) => `<nav class="v2nav" aria-label="Fő menü">
  <a href="#/" class="${on === 'ma' ? 'on' : ''}">${I.today}<span>Ma</span></a>
  <a href="#/naptar" class="${on === 'cal' ? 'on' : ''}">${I.cal}<span>Naptár</span></a>
  <a href="#/uj" class="add" aria-label="Új rögzítése">${I.plus}<span>Rögzítés</span></a>
  <a href="#/emberek" class="${on === 'ppl' ? 'on' : ''}">${I.people}<span>Emberek</span></a>
  <a href="#/tobb" class="${on === 'more' ? 'on' : ''}">${I.more}<span>Továbbiak</span></a></nav>`;
const head = (title, sub = 'Adonyi Hóvirág Óvoda', extra = '') => `<div class="head"><div><small>${esc(sub)}</small><h1>${esc(title)}</h1>${extra}</div>${I.flower}</div>`;
const topbar = (title, back = '#/') => `<div class="topbar"><a class="back" href="${back}" aria-label="Vissza">${I.back}</a><h2>${esc(title)}</h2></div>`;
const absRow = (a) => `<a class="v-row" href="#/ember/${a.worker_id}"><span class="ini">${esc(initials(a.name))}</span><b>${esc(a.name)}</b><em class="tag ${KIND[a.k].c}">${a.k === 'leave' ? 'szabadság' : `${KIND[a.k].t.toLowerCase()} ${fmt(Math.abs(a.minutes))}`}</em></a>`;

// egy nap távollétei a naptár-adatokból
function absOn(cal, date) {
  const out = [];
  for (const l of cal.leaves) if (l.date === date) out.push({ k: 'leave', worker_id: l.worker_id, name: l.name });
  for (const e of cal.entries) if (e.date === date && e.kind === 'use') out.push({ k: 'use', worker_id: e.worker_id, name: e.name, minutes: e.minutes });
  return out.sort((a, b) => a.name.localeCompare(b.name, 'hu'));
}
async function calRange(from, to) {
  const months = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(m + '-28', 5).slice(0, 7)) months.push(m);
  const res = await Promise.all(months.map((m) => api(`/calendar?month=${m}`)));
  return { entries: res.flatMap((r) => r.entries), leaves: res.flatMap((r) => r.leaves) };
}

/* ---------- belépés ---------- */
function viewLogin() {
  $app.innerHTML = `<div class="login"><div class="logo">${I.flower}</div><h1>HÓVIRÁG</h1><p>Lépj be a közös jelszóval.</p>
    <form id="f"><input class="input" id="pw" type="password" autocomplete="current-password" placeholder="Jelszó" required>
    <button class="btn mt-12" type="submit">Belépés</button><p class="err" id="err"></p></form></div>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/login', { method: 'POST', body: { password: document.getElementById('pw').value } }); location.hash = '#/'; }
    catch (err) { document.getElementById('err').textContent = err.message; }
  };
}

/* ---------- Ma ---------- */
async function viewToday() {
  const t = today(); const y = Number(t.slice(0, 4));
  await loadHolidays([y, y + 1]);
  const tomorrow = nextWorkday(t); const horizon = addDays(t, 14);
  const ly = y >= LEAVE_START_YEAR ? y : null;
  const [w, cal, lo] = await Promise.all([api('/workers'), calRange(t, horizon), ly ? api(`/leave/overview?year=${ly}`) : Promise.resolve(null)]);
  const active = w.workers.filter((x) => x.active === 1);
  const offToday = absOn(cal, t);
  const offTomorrow = absOn(cal, tomorrow);
  // teendők
  const todo = [];
  const unsigned = active.filter((x) => x.unsigned_old > 0);
  if (unsigned.length) todo.push({ c: 'warn', t: `${unsigned.length} dolgozónak aláíratlan az előző havi túlóralapja`, s: unsigned.map((x) => x.name).join(', '), href: '#/emberek?f=alairatlan' });
  const high = active.filter((x) => x.balance >= w.warn_high_min);
  if (high.length) todo.push({ c: 'info', t: `${high.length} főnek ${fmt(w.warn_high_min)} fölött van a túlórája`, s: high.map((x) => `${x.name} (${fmt(x.balance)})`).join(', '), href: '#/emberek?f=magas' });
  const neg = active.filter((x) => x.balance < 0);
  if (neg.length) todo.push({ c: 'warn', t: `${neg.length} főnek mínuszban van a túlórája`, s: neg.map((x) => `${x.name} (${fmt(x.balance)})`).join(', '), href: '#/emberek?f=minusz' });
  if (lo) {
    const over = lo.workers.filter((x) => x.remaining < 0);
    if (over.length) todo.push({ c: 'warn', t: `${over.length} fő túllépte a szabadságkeretét`, s: over.map((x) => `${x.name} (${x.remaining} nap)`).join(', '), href: '#/emberek?f=keret' });
  }
  for (const n of w.namedays || []) todo.push({ c: 'ok', t: `${n.name} névnapja ${n.in_days === 0 ? 'ma' : n.in_days === 1 ? 'holnap' : `${dWeek(n.date)} (${dShort(n.date)})`}`, href: `#/ember/${n.worker_id}` });
  // következő két hét (holnaputántól)
  const days = [];
  for (let d = addDays(tomorrow, 1); d <= horizon; d = addDays(d, 1)) { const a = absOn(cal, d); if (a.length && !isOff(d)) days.push({ d, a }); }
  const total = active.reduce((s, x) => s + x.balance, 0);
  const tomorrowLabel = tomorrow === addDays(t, 1) ? 'Holnap' : `${dWeek(tomorrow)[0].toUpperCase()}${dWeek(tomorrow).slice(1)}`;
  $app.innerHTML = `${head('Ma', 'Adonyi Hóvirág Óvoda', `<p class="v-date">${esc(dLong(t))}${isOff(t) ? ' · <b>szünnap</b>' : ''}</p>`)}
    <section class="v-card"><div class="v-h"><b>Ma nincs bent</b><span>${offToday.length ? `${offToday.length} fő` : ''}</span></div>
      ${offToday.length ? `<div class="v-rows">${offToday.map(absRow).join('')}</div>` : `<p class="v-empty">${isOff(t) ? 'Ma nincs munkanap.' : 'Ma mindenki bent van.'}</p>`}</section>
    <section class="v-card"><div class="v-h"><b>${esc(tomorrowLabel)}</b><span>${dShort(tomorrow)}${offTomorrow.length ? ` · ${offTomorrow.length} fő hiányzik` : ''}</span></div>
      ${offTomorrow.length ? `<div class="v-rows">${offTomorrow.map(absRow).join('')}</div>` : '<p class="v-empty">Mindenki bent lesz.</p>'}</section>
    ${todo.length ? `<section class="v-card"><div class="v-h"><b>Figyelj rá</b></div><div class="v-todo">${todo.map((x) => `<a href="${x.href}" class="${x.c}"><i></i><div><b>${esc(x.t)}</b>${x.s ? `<span>${esc(x.s)}</span>` : ''}</div>${I.next}</a>`).join('')}</div></section>` : ''}
    <section class="v-card"><div class="v-h"><b>Következő két hét</b><a href="#/naptar">Naptár</a></div>
      ${days.length ? `<div class="v-days">${days.map((x) => `<a href="#/naptar?d=${x.d}"><b>${esc(dShort(x.d))}</b><em>${esc(dWeek(x.d).slice(0, 3))}</em><span>${x.a.map((a) => `<i class="${KIND[a.k].c}"></i>${esc(a.name.split(' ').slice(-1)[0])}`).join(', ')}</span></a>`).join('')}</div>` : '<p class="v-empty">Nincs rögzített távollét.</p>'}</section>
    <div class="v-stats"><div><small>Összes túlóra</small><b>${fmt(total)}</b></div><div><small>Aktív dolgozó</small><b>${active.length} fő</b></div></div>
    ${nav('ma')}`;
}

/* ---------- Naptár (minden távollét és túlóra egy helyen) ---------- */
async function viewCalendar(q) {
  const t = today();
  const pick = q.get('d') || t; const month = q.get('m') || pick.slice(0, 7);
  const f = q.get('f') || 'all';
  const y = Number(month.slice(0, 4)); await loadHolidays([y]);
  const cal = await api(`/calendar?month=${month}`);
  const show = { all: ['leave', 'use', 'credit'], tav: ['leave', 'use'], leave: ['leave'], use: ['use'], credit: ['credit'] }[f] || ['leave', 'use', 'credit'];
  const items = (d) => [
    ...cal.leaves.filter((l) => l.date === d).map((l) => ({ k: 'leave', ...l })),
    ...cal.entries.filter((e) => e.date === d).map((e) => ({ k: e.kind, ...e })),
  ].filter((x) => show.includes(x.k));
  const first = new Date(month + '-01T12:00:00'); const lead = (first.getDay() + 6) % 7;
  const nDays = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = []; for (let i = 0; i < lead; i++) cells.push('<span class="vd empty"></span>');
  for (let i = 1; i <= nDays; i++) {
    const d = `${month}-${pad(i)}`; const it = items(d); const h = HOL.get(d);
    const cnt = (k) => it.filter((x) => x.k === k).length;
    const marks = ['leave', 'use', 'credit'].map((k) => (cnt(k) ? `<i class="${KIND[k].c}">${cnt(k)}</i>` : '')).join('');
    cells.push(`<button type="button" class="vd${isOff(d) ? ' off' : ''}${d === t ? ' today' : ''}${d === pick ? ' sel' : ''}${h?.kind === 'work' ? ' wrk' : ''}" data-d="${d}" title="${esc(h?.label || '')}"><span>${i}</span><div>${marks}</div></button>`);
  }
  const mv = (n) => { const d = new Date(month + '-15T12:00:00'); d.setMonth(d.getMonth() + n); return iso(d).slice(0, 7); };
  const link = (o) => { const p = new URLSearchParams({ m: o.m ?? month, f: o.f ?? f }); if (o.d ?? (o.m ? null : pick)) p.set('d', o.d ?? pick); return `#/naptar?${p}`; };
  const F = [['all', 'Mind'], ['tav', 'Távollét'], ['leave', 'Szabadság'], ['use', 'Szabadidő'], ['credit', 'Túlóra']];
  $app.innerHTML = `${head('Naptár')}
    <div class="v-chips">${F.map(([k, l]) => `<a href="${link({ f: k })}" class="${f === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <div class="calhead"><a class="back" href="${link({ m: mv(-1) })}" aria-label="Előző hónap">${I.back}</a><b>${esc(monthTitle(month))}</b><a class="back" href="${link({ m: mv(1) })}" aria-label="Következő hónap">${I.next}</a></div>
    <div class="vcal">${['H', 'K', 'Sze', 'Cs', 'P', 'Szo', 'V'].map((x) => `<em>${x}</em>`).join('')}${cells.join('')}</div>
    <div class="v-leg"><span><i class="k-leave"></i>szabadság</span><span><i class="k-use"></i>szabadidő (− óra)</span><span><i class="k-credit"></i>túlóra (+ óra)</span></div>
    <section class="v-card" id="dbox"></section>${nav('cal')}`;
  const showDay = (d) => {
    document.querySelectorAll('.vd.sel').forEach((b) => b.classList.remove('sel'));
    document.querySelector(`.vd[data-d="${d}"]`)?.classList.add('sel');
    const it = items(d); const h = HOL.get(d);
    const grp = (k) => it.filter((x) => x.k === k);
    const block = (k, title) => (grp(k).length ? `<div class="v-sub">${title}</div><div class="v-rows">${grp(k).map((x) => `<a class="v-row" href="#/ember/${x.worker_id}"><span class="ini">${esc(initials(x.name))}</span><b>${esc(x.name)}</b><em class="tag ${KIND[k].c}">${k === 'leave' ? (x.date <= t || x.taken ? 'kivett' : 'tervezett') : fmt(x.minutes, true)}</em></a>`).join('')}</div>` : '');
    document.getElementById('dbox').innerHTML = `<div class="v-h"><b>${esc(dLong(d))}</b><a href="#/uj?d=${d}">+ Rögzítés erre a napra</a></div>
      ${h ? `<p class="v-note">${esc(h.label)}</p>` : ''}
      ${it.length ? block('leave', 'Szabadság') + block('use', 'Szabadidő') + block('credit', 'Túlóra') : `<p class="v-empty">${isOff(d) && !h ? 'Hétvége.' : 'Nincs rögzített tétel.'}</p>`}`;
  };
  document.querySelectorAll('.vd[data-d]').forEach((b) => (b.onclick = () => { history.replaceState(null, '', link({ d: b.dataset.d })); showDay(b.dataset.d); }));
  showDay(pick.startsWith(month) ? pick : `${month}-01`);
  // lapozás oldalra húzással
  let x0 = null; const g = document.querySelector('.vcal');
  g.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  g.addEventListener('touchend', (e) => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 60) location.hash = link({ m: mv(dx < 0 ? 1 : -1) }).slice(1); }, { passive: true });
}

/* ---------- + Rögzítés ---------- */
async function viewAdd(q) {
  const t = today(); const y = Number(t.slice(0, 4));
  const [{ workers, groups }, { templates }, { presets }] = await Promise.all([api('/workers'), api('/templates'), api('/presets'), loadHolidays([y - 1, y, y + 1])]);
  const active = workers.filter((w) => w.active === 1);
  if (!active.length) { $app.innerHTML = `${topbar('Rögzítés')}<p class="v-empty">Még nincs dolgozó. Vedd fel őket a Továbbiak → Beállítások alatt.</p>${nav('')}`; return; }
  const recent = ls.get('v2_recent', []).filter((id) => active.some((w) => w.id === id));
  const preW = active.find((w) => w.id === Number(q.get('w')));
  const st = {
    kind: KIND[q.get('k')] ? q.get('k') : null,
    ids: new Set(preW ? [preW.id] : []), multi: false, g: 'all', search: '',
    minutes: 30, date: q.get('d') || t, to: q.get('d') || t, many: false, note: '', confirm: false, busy: false,
  };
  const back = q.get('vissza') || (preW ? `#/ember/${preW.id}` : '#/');
  const step = () => (!st.kind ? 1 : !st.ids.size || st.choosing ? 2 : 3);
  const sel = () => active.filter((w) => st.ids.has(w.id));

  const render = () => {
    const s = step();
    if (s === 1) {
      $app.innerHTML = `${topbar('Mit rögzítesz?', back)}
        <div class="v-kinds">${['credit', 'use', 'leave'].map((k) => `<button type="button" class="v-kind ${KIND[k].c}" data-k="${k}"><b>${KIND[k].s}</b><span>${KIND[k].d}</span></button>`).join('')}</div>${nav('')}`;
      document.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { st.kind = b.dataset.k; if (st.kind === 'credit' && st.date > t) st.date = st.to = t; render(); }));
      return;
    }
    if (s === 2) {
      const gs = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
      $app.innerHTML = `${topbar(`${KIND[st.kind].t}: kinek?`, back)}
        <div class="search">${I.search}<input id="sq" type="search" placeholder="Név keresése" value="${esc(st.search)}" autocomplete="off"></div>
        <div class="v-chips">${[['all', 'Mindenki'], ...gs.map((g) => [String(g.id), g.name])].map(([k, l]) => `<button type="button" data-g="${k}" class="${st.g === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
        <label class="check multi"><input type="checkbox" id="multi" ${st.multi ? 'checked' : ''}><span>Több dolgozó egyszerre</span></label>
        <div class="v-pick" id="pl"></div>
        ${st.multi ? `<div class="savebar"><button class="btn" id="go" type="button" ${st.ids.size ? '' : 'disabled'}>Tovább (${st.ids.size} fő)</button></div>` : ''}${st.multi ? '' : nav('')}`;
      const list = () => {
        const sq = st.search.trim().toLowerCase();
        let ws = active.filter((w) => (st.g === 'all' || gidsOf(w).includes(Number(st.g))) && (!sq || w.name.toLowerCase().includes(sq)));
        const rec = !sq && st.g === 'all' ? recent.slice(0, 4).map((id) => ws.find((w) => w.id === id)).filter(Boolean) : [];
        const row = (w) => `<button type="button" class="v-row${st.ids.has(w.id) ? ' on' : ''}" data-w="${w.id}"><span class="ini">${st.multi && st.ids.has(w.id) ? I.check : esc(initials(w.name))}</span><b>${esc(w.name)}</b><em class="bal ${balClass(w.balance)}">${fmt(w.balance)}</em></button>`;
        document.getElementById('pl').innerHTML = (rec.length ? `<div class="v-sub">Legutóbb</div>${rec.map(row).join('')}<div class="v-sub">Mindenki</div>` : '')
          + (ws.map(row).join('') || '<p class="v-empty">Nincs találat.</p>')
          + (st.multi && ws.length ? `<button type="button" class="btn ghost small mt-10" id="allg">Mind kijelölése (${ws.length})</button>` : '');
        document.querySelectorAll('[data-w]').forEach((b) => (b.onclick = () => {
          const id = Number(b.dataset.w);
          if (!st.multi) { st.ids = new Set([id]); st.choosing = false; render(); return; }
          st.ids.has(id) ? st.ids.delete(id) : st.ids.add(id); render();
        }));
        const allg = document.getElementById('allg'); if (allg) allg.onclick = () => { ws.forEach((w) => st.ids.add(w.id)); render(); };
      };
      list();
      const sq = document.getElementById('sq'); sq.oninput = () => { st.search = sq.value; list(); };
      document.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => { st.g = b.dataset.g; render(); }));
      document.getElementById('multi').onchange = (e) => { st.multi = e.target.checked; if (!st.multi && st.ids.size > 1) st.ids = new Set(); render(); };
      const go = document.getElementById('go'); if (go) go.onclick = () => { st.choosing = false; render(); };
      if (!st.multi && !matchMedia('(pointer:coarse)').matches) sq.focus();
      return;
    }
    // 3. lépés: részletek
    const k = st.kind; const ppl = sel();
    const kp = presets.filter((p) => p.kind === k);
    const quickMin = k === 'credit' ? [30, 60, 90, 120, 180, 240] : [60, 120, 240, 480];
    $app.innerHTML = `${topbar(KIND[k].t, back)}
      <div class="v-sum"><button type="button" data-to="1" class="tag ${KIND[k].c}">${KIND[k].s}</button><button type="button" data-to="2" class="who">${ppl.length === 1 ? esc(ppl[0].name) : `${ppl.length} dolgozó`}<small>módosít</small></button></div>
      <form id="f">
      ${k !== 'leave' ? `<div class="field"><span class="label">Mennyi?</span>
        <div class="v-amount"><button type="button" data-a="-15" aria-label="15 perccel kevesebb">−</button><b id="amt">${fmt(st.minutes)}</b><button type="button" data-a="15" aria-label="15 perccel több">+</button></div>
        <div class="v-chips wrap">${quickMin.map((m) => `<button type="button" data-m="${m}" class="${st.minutes === m ? 'on' : ''}">${fmt(m)}</button>`).join('')}</div>
        ${kp.length ? `<div class="v-sub">Gyors tételek</div><div class="v-chips wrap">${kp.map((p) => `<button type="button" data-p="${p.id}">${esc(p.name)} · ${fmt(p.minutes)}</button>`).join('')}</div>` : ''}</div>` : ''}
      <div class="field"><span class="label">${k === 'leave' ? 'Melyik napoktól meddig?' : 'Melyik nap?'}</span>
        ${k === 'leave' ? '' : `<div class="v-chips wrap">${(k === 'credit' ? [[t, 'Ma'], [addDays(t, -1), 'Tegnap']] : [[t, 'Ma'], [nextWorkday(t), dWeek(nextWorkday(t)) === dWeek(addDays(t, 1)) ? 'Holnap' : dWeek(nextWorkday(t))]]).map(([d, l]) => `<button type="button" data-day="${d}" class="${!st.many && st.date === d ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`}
        <div class="row v-dates"><input class="input" type="date" id="d1" value="${st.date}" ${k === 'credit' ? `max="${t}"` : ''} aria-label="Kezdő nap">
          ${k === 'leave' || st.many ? `<span>–</span><input class="input" type="date" id="d2" value="${st.to}" min="${st.date}" ${k === 'credit' ? `max="${t}"` : ''} aria-label="Utolsó nap">` : ''}</div>
        ${k !== 'leave' ? `<label class="check"><input type="checkbox" id="many" ${st.many ? 'checked' : ''}><span>Több napra (hétvégék, ünnepek nélkül)</span></label>` : ''}
        <p class="v-note" id="dsum"></p></div>
      <div class="field"><label class="label" for="n">Megjegyzés <span class="v-opt">(nem kötelező)</span></label>
        ${templates.length && k !== 'leave' ? `<div class="v-chips wrap">${templates.slice(0, 8).map((x) => `<button type="button" data-t="${esc(x.text)}">${esc(x.text)}</button>`).join('')}</div>` : ''}
        <input class="input" id="n" maxlength="${k === 'leave' ? 120 : 300}" value="${esc(st.note)}" placeholder="${k === 'leave' ? 'Pl. nyári szabadság' : 'Pl. szülői értekezlet'}"></div>
      <div id="msg"></div>
      </form>
      <div class="savebar"><button class="btn" id="save" type="submit" form="f">Mentés</button></div>`;
    const $ = (id) => document.getElementById(id);
    const dates = () => (k === 'leave' || st.many ? workdays(st.date, st.to < st.date ? st.date : st.to) : [st.date]);
    const summary = () => {
      const ds = dates(); const p = $('dsum'); const b = $('save');
      if (k === 'leave' || st.many) p.textContent = ds.length ? `${ds.length} munkanap: ${ranges(ds).map(rangeText).join(', ')}` : 'A kijelölt időszakban nincs munkanap.';
      else p.textContent = isOff(st.date) ? `${dLong(st.date)} – ez pihenőnap.` : dLong(st.date);
      const per = k === 'leave' ? `${ds.length} nap szabadság` : `${fmt(st.minutes * ds.length)} ${k === 'credit' ? 'túlóra' : 'szabadidő'}`;
      let extra = '';
      if (k !== 'leave' && ppl.length === 1) {
        const w = ppl[0]; const delta = ds.filter((d) => d <= t).length * st.minutes * (k === 'use' ? -1 : 1);
        extra = ` · új egyenleg: ${fmt(w.balance + delta)}`;
      }
      b.textContent = `Mentés · ${per}${ppl.length > 1 ? ` × ${ppl.length} fő` : ''}`;
      b.disabled = !ds.length || (k !== 'leave' && st.minutes <= 0) || st.busy;
      b.title = extra;
      $('msg').innerHTML = extra && ds.length ? `<p class="v-note">${esc(extra.slice(3))}</p>` : '';
    };
    const setAmt = (m) => { st.minutes = Math.max(0, Math.min(24 * 60, m)); $('amt').textContent = fmt(st.minutes); document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', Number(b.dataset.m) === st.minutes)); summary(); };
    document.querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => setAmt(st.minutes + Number(b.dataset.a))));
    document.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => setAmt(Number(b.dataset.m))));
    document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => { const p = presets.find((x) => x.id === Number(b.dataset.p)); st.note = p.note || p.name; $('n').value = st.note; setAmt(p.minutes); }));
    document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { st.note = b.dataset.t; $('n').value = st.note; }));
    document.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { st.date = st.to = b.dataset.day; st.many = false; render(); }));
    document.querySelectorAll('[data-to]').forEach((b) => (b.onclick = () => { if (b.dataset.to === '1') st.kind = null; else st.choosing = true; render(); }));
    $('n').oninput = () => { st.note = $('n').value; };
    $('d1').onchange = () => { st.date = $('d1').value || t; if (st.to < st.date) st.to = st.date; if ($('d2')) { $('d2').min = st.date; $('d2').value = st.to; } document.querySelectorAll('[data-day]').forEach((b) => b.classList.toggle('on', !st.many && b.dataset.day === st.date)); summary(); };
    if ($('d2')) $('d2').onchange = () => { st.to = $('d2').value || st.date; summary(); };
    if ($('many')) $('many').onchange = (e) => { st.many = e.target.checked; if (st.many && st.to < st.date) st.to = st.date; render(); };
    summary();
    $('f').onsubmit = async (e) => {
      e.preventDefault(); if (st.busy) return;
      const ds = dates(); if (!ds.length) return;
      st.busy = true; summary();
      try {
        if (k === 'leave') {
          const done = [];
          for (const w of ppl) { const r = await api('/leave', { method: 'POST', body: { worker_id: w.id, dates: ds, note: st.note } }); done.push(...r.ids); }
          finish(`Szabadság rögzítve (${ds.length} nap${ppl.length > 1 ? ` × ${ppl.length} fő` : ''})`, () => api('/leave/delete', { method: 'POST', body: { ids: done } }));
        } else {
          const r = await api('/entries', { method: 'POST', body: { worker_ids: [...st.ids], minutes: st.minutes, kind: k, dates: ds, note: st.note, client_id: uuid(), confirm_signed: st.confirm } });
          finish(`${KIND[k].t} rögzítve`, () => api('/entries/undo', { method: 'POST', body: { ids: r.ids } }));
        }
      } catch (err) {
        st.busy = false;
        if (err.needsConfirm) {
          $('msg').innerHTML = `<div class="box-warn note-box mt-10"><b>Már aláírt időszak.</b> ${esc(err.workers.map((x) => `${x.name} (aláírva: ${x.signed_to})`).join(', '))}. Ha most rögzíted, a túlóralapot újra alá kell íratni.<button type="button" class="btn small mt-10" id="cf">Mégis rögzítem</button></div>`;
          $('cf').onclick = () => { st.confirm = true; $('f').requestSubmit(); };
          summary();
        } else { toast(err.message); summary(); }
      }
    };
  };
  const finish = (msg, undo) => {
    ls.set('v2_recent', [...st.ids, ...recent.filter((id) => !st.ids.has(id))].slice(0, 8));
    toast(msg, { label: 'Visszavonás', run: async () => { try { await undo(); toast('Visszavonva'); route(); } catch (err) { toast(err.message); } } });
    location.hash = back;
  };
  render();
}

/* ---------- Emberek ---------- */
async function viewPeople(q) {
  const ly = leaveYear();
  const [w, lo] = await Promise.all([api('/workers'), api(`/leave/overview?year=${ly}`)]);
  const leave = new Map(lo.workers.map((x) => [x.worker_id, x]));
  const f = q.get('f') || ''; const g = q.get('g') || 'all';
  const FILT = { alairatlan: ['Aláíratlan előző hónap', (x) => x.unsigned_old > 0], magas: ['Magas túlóra', (x) => x.balance >= w.warn_high_min], minusz: ['Mínuszos túlóra', (x) => x.balance < 0], keret: ['Túllépett szabadságkeret', (x) => (leave.get(x.id)?.remaining ?? 0) < 0] };
  const groupName = (x) => gidsOf(x).map((id) => w.groups.find((gg) => gg.id === id)?.name).filter(Boolean).join(', ');
  const all = w.workers.filter((x) => x.active === 1);
  const others = w.workers.filter((x) => x.active !== 1);
  const gs = w.groups.filter((gg) => all.some((x) => gidsOf(x).includes(gg.id)));
  $app.innerHTML = `${head('Emberek')}
    <div class="search">${I.search}<input id="sq" type="search" placeholder="Név keresése" autocomplete="off"></div>
    ${FILT[f] ? `<div class="v-filter">Szűrő: <b>${FILT[f][0]}</b><a href="#/emberek">× mind</a></div>` : `<div class="v-chips">${[['all', 'Mindenki'], ...gs.map((gg) => [String(gg.id), gg.name])].map(([k, l]) => `<a href="#/emberek?g=${k}" class="${g === k ? 'on' : ''}">${esc(l)}</a>`).join('')}</div>`}
    <div class="v-colh"><span></span><span>Túlóra</span><span>Szabi ${ly}</span></div>
    <div class="v-people" id="pl"></div>
    ${others.length ? `<details class="v-more"><summary>Nem aktív dolgozók (${others.length})</summary><div class="v-people">${others.map((x) => `<a class="v-person muted" href="#/ember/${x.id}"><span class="ini">${esc(initials(x.name))}</span><div><b>${esc(x.name)}</b><small>${x.active === 2 ? 'parkoltatva' : 'kilépett'}</small></div></a>`).join('')}</div></details>` : ''}
    ${nav('ppl')}`;
  const draw = (sq = '') => {
    const s = sq.trim().toLowerCase();
    const list = all.filter((x) => (FILT[f] ? FILT[f][1](x) : g === 'all' || gidsOf(x).includes(Number(g))) && (!s || x.name.toLowerCase().includes(s)));
    document.getElementById('pl').innerHTML = list.map((x) => {
      const l = leave.get(x.id);
      return `<a class="v-person" href="#/ember/${x.id}"><span class="ini">${esc(initials(x.name))}</span><div><b>${esc(x.name)}</b><small>${esc(groupName(x) || '–')}${x.unsigned_old > 0 ? ' · <em class="warn">aláíratlan</em>' : ''}</small></div>
        <em class="bal ${balClass(x.balance)}">${fmt(x.balance)}</em><em class="v-lv${l && l.remaining < 0 ? ' neg' : ''}">${l ? `${l.remaining} nap` : '–'}</em></a>`;
    }).join('') || '<p class="v-empty">Nincs találat.</p>';
  };
  draw();
  document.getElementById('sq').oninput = (e) => draw(e.target.value);
}

async function viewPerson(id) {
  const t = today(); const ly = leaveYear();
  const [d, lv] = await Promise.all([api(`/workers/${id}/entries`), api(`/leave/worker/${id}?year=${ly}`), loadHolidays([ly - 1, ly, ly + 1])]);
  const w = d.worker; const groupName = gidsOf(w).map((g) => d.groups.find((x) => x.id === g)?.name).filter(Boolean).join(', ');
  const live = d.entries.filter((e) => e.kind !== 'reversal' && !e.reversed);
  const future = live.filter((e) => e.date > t && e.kind === 'use').sort((a, b) => (a.date < b.date ? -1 : 1));
  const past = live.filter((e) => e.date <= t);
  const total = lv.budget.entitlement + lv.budget.carry;
  const taken = lv.leaves.filter((l) => l.date <= t || l.taken).length;
  const planned = lv.leaves.length - taken;
  const futLeave = ranges(lv.leaves.filter((l) => l.date > t).map((l) => l.date));
  const ent = (e) => `<div class="v-ent"><b class="${e.minutes < 0 ? 'c-neg' : 'c-pos'}">${fmt(e.minutes, true)}</b><div><span>${esc(dShort(e.date))} · ${e.kind === 'opening' ? 'Nyitó egyenleg' : e.kind === 'credit' ? 'Túlóra' : 'Szabadidő'}</span>${e.note ? `<small>${esc(e.note)}</small>` : ''}</div></div>`;
  const status = w.active === 2 ? `<span class="tag">parkoltatva${w.park_note ? `: ${esc(w.park_note)}` : ''}</span>` : w.active === 0 ? '<span class="tag">kilépett</span>' : '';
  $app.innerHTML = `${topbar(w.name, '#/emberek')}
    <p class="v-date">${esc(groupName || 'nincs munkakör')} ${status}</p>
    <div class="v-tiles">
      <div class="v-tile"><small>Túlóra egyenleg</small><b class="${w.balance < 0 ? 'c-neg' : ''}">${fmt(w.balance)}</b><span>${w.planned ? `tervezett: ${fmt(w.planned, true)}` : w.signed_to ? `aláírva: ${dShort(w.signed_to)}-ig` : 'még nincs aláírva'}</span></div>
      <div class="v-tile"><small>Szabadság ${ly}</small><b class="${total - lv.leaves.length < 0 ? 'c-neg' : ''}">${total - lv.leaves.length} nap</b><span>keret ${total} · kivett ${taken}${planned ? ` · tervezett ${planned}` : ''}</span></div>
    </div>
    ${w.active === 1 ? `<div class="v-actions">${['credit', 'use', 'leave'].map((k) => `<a class="${KIND[k].c}" href="#/uj?w=${id}&k=${k}">${KIND[k].s}</a>`).join('')}</div>` : ''}
    ${future.length || futLeave.length ? `<section class="v-card"><div class="v-h"><b>Közelgő távollét</b></div><div class="v-rows">
      ${futLeave.map((r) => `<div class="v-row"><span class="dot k-leave"></span><b>${esc(rangeText(r))}</b><em class="tag k-leave">${r.n} nap szabadság</em></div>`).join('')}
      ${future.map((e) => `<div class="v-row"><span class="dot k-use"></span><b>${esc(dShort(e.date))}</b><em class="tag k-use">${fmt(Math.abs(e.minutes))} szabadidő</em></div>`).join('')}</div></section>` : ''}
    <section class="v-card"><div class="v-h"><b>Legutóbbi tételek</b></div>
      ${past.length ? `<div class="v-ents">${past.slice(0, 5).map(ent).join('')}</div>${past.length > 5 ? `<details class="v-more"><summary>Mind a ${past.length} tétel</summary><div class="v-ents">${past.slice(5).map(ent).join('')}</div></details>` : ''}` : '<p class="v-empty">Még nincs tétel.</p>'}</section>
    <details class="v-more v-card"><summary>Szabadságok ${ly} (${lv.leaves.length} nap)</summary>
      ${lv.leaves.length ? `<div class="v-rows">${ranges(lv.leaves.map((l) => l.date)).map((r) => { const ids = lv.leaves.filter((l) => l.date >= r.from && l.date <= r.to); const tk = ids.every((l) => l.date <= t || l.taken); return `<div class="v-row"><span class="dot k-leave${tk ? '' : ' plan'}"></span><b>${esc(rangeText(r))}</b><em class="tag k-leave">${r.n} nap · ${tk ? 'kivett' : 'tervezett'}</em></div>`; }).join('')}</div>` : '<p class="v-empty">Ebben az évben még nincs szabadság.</p>'}</details>
    <details class="v-more v-card"><summary>Szerkesztés és egyebek</summary>
      <div class="v-links">
        <a href="/#/dolgozo/${id}">Tételek javítása, sztornó, aláírás</a>
        <a href="/#/szabadsag/${id}?y=${ly}">Szabadságkeret, kivettre állítás, törlés</a>
        <a href="/#/kimutatas?w=${id}">Túlóralap nyomtatása</a>
      </div><p class="v-note">Ezek egyelőre a régi felületen nyílnak meg.</p></details>
    ${nav('ppl')}`;
}

/* ---------- Továbbiak ---------- */
function viewMore() {
  const L = [
    ['Kimutatások', 'Túlóralapok, összesítő, szabadság-kimutatás', '/#/kimutatas'],
    ['Nyári beosztás', 'Műszakterv a nyári hetekre', '/#/nyari-beosztas'],
    ['Szabadság áttekintés', 'Mindenki kerete egy táblázatban', '/#/szabadsag'],
    ['Beállítások', 'Dolgozók, munkakörök, ünnepnapok, gyors tételek', '/#/beallitasok'],
    ['Biztonsági mentések', 'Napi mentés, letöltés, visszaállítás', '/#/mentesek'],
    ['Napló', 'Ki mit változtatott', '/#/naplo'],
  ];
  $app.innerHTML = `${head('Továbbiak')}
    <div class="v-links big">${L.map(([t, s, h]) => `<a href="${h}"><b>${t}</b><span>${s}</span>${I.next}</a>`).join('')}</div>
    <section class="v-card"><div class="v-h"><b>Új felület (v2, próba)</b></div>
      <p class="v-note">Ugyanazokat az adatokat látod, mint a régi felületen. A fenti pontok egyelőre a régi felületen nyílnak meg.</p>
      <div class="v-links"><a href="/#/">Vissza a régi felületre</a><a href="#/belepes" id="lo">Kijelentkezés</a></div></section>
    ${nav('more')}`;
  document.getElementById('lo').onclick = async (e) => { e.preventDefault(); try { await api('/logout', { method: 'POST' }); } catch { /* */ } location.hash = '#/belepes'; };
}

/* ---------- útvonalak ---------- */
async function route() {
  const [path, qs = ''] = (location.hash.slice(1) || '/').split('?');
  const q = new URLSearchParams(qs);
  window.scrollTo(0, 0);
  try {
    if (path === '/belepes') return viewLogin();
    if (path === '/' || path === '') return await viewToday();
    if (path === '/naptar') return await viewCalendar(q);
    if (path === '/uj') return await viewAdd(q);
    if (path === '/emberek') return await viewPeople(q);
    if (path === '/tobb') return viewMore();
    const m = path.match(/^\/ember\/(\d+)$/); if (m) return await viewPerson(Number(m[1]));
    location.hash = '#/';
  } catch (err) {
    if (err.message === 'login') return;
    $app.innerHTML = `<p class="v-empty">${esc(err.message)}</p><button class="btn ghost" onclick="location.reload()">Újratöltés</button>${nav('')}`;
  }
}
window.addEventListener('hashchange', route);
route();
