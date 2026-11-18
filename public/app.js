// HÓVIRÁG – egyoldalas felület (vanília JS, nincs build lépés)
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
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
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { location.hash = '#/belepes'; throw new Error('login'); }
  if (!res.ok) throw new Error(data.error || 'Hiba történt.');
  return data;
}

const ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  flower: '<svg viewBox="20 18 90 100"><path d="M50 114C47 84 38 58 24 34C42 52 52 82 54 114Z" fill="currentColor"/><path d="M54 114C58 86 70 66 84 46C72 68 62 90 58 114Z" fill="currentColor" opacity=".7"/><path d="M54 114C52 76 54 44 64 30C70 22 80 22 80 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="80" cy="38" rx="3.6" ry="4.6" fill="currentColor"/><path d="M80 40C72 52 68 66 72 82C80 70 84 54 80 40Z" fill="currentColor"/><path d="M80 40C66 46 56 62 56 78C68 72 78 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M80 40C94 46 104 62 104 78C92 72 82 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M70 70C74 78 86 78 90 70C86 74 74 74 70 70Z" fill="currentColor" opacity=".55"/></svg>',
};

const nav = (on) => `<nav class="nav">
  <a href="#/" class="${on === 'list' ? 'on' : ''}">${ICONS.home}Áttekintés</a>
  <a href="#/kimutatas" class="${on === 'rep' ? 'on' : ''}">${ICONS.doc}Kimutatás</a>
  <a href="#/beallitasok" class="${on === 'set' ? 'on' : ''}">${ICONS.gear}Beállítások</a></nav>`;

const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };

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
      ? `<span class="status warn">${w.unsigned} új tétel az aláírás óta</span>`
      : `<span class="status ok">Aláírva: ${dotted(w.signed_to)}-ig</span>`;
  }
  return w.last_date ? '<span class="status warn">Még nincs aláírt kimutatás</span>' : '';
}

async function viewList() {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { workers, upcoming } = await api('/workers');
  const active = workers.filter((w) => w.active);
  const total = active.reduce((s, w) => s + w.balance, 0);
  $app.innerHTML = `
    <div class="hello"><div><small>Adonyi Hóvirág Óvoda</small><h1>Áttekintés</h1></div></div>
    <div class="hero"><small>Összes felhalmozott szabadidő</small>
      <div class="big">${bigTime(total)}</div>
      <div class="pills"><span class="pill">${active.length} dolgozó</span>${upcoming.length ? `<span class="pill">${upcoming.length} tervezett szabadidő</span>` : ''}</div>${ICONS.flower}</div>
    ${upcoming.length ? `<div class="upcoming"><span class="label">Közelgő szabadidő</span>${upcoming.map((u) => `
      <a href="#/dolgozo/${u.worker_id}"><b>${shortDate(u.date)}</b><span>${esc(u.name)}</span><em>${fmt(-u.minutes)}</em></a>`).join('')}</div>` : ''}
    <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Név keresése" aria-label="Név keresése"></label>
    <div class="list" id="l"></div>
    <a class="fab" href="#/uj">${ICONS.plus}Új tétel</a>${nav('list')}`;
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = active.filter((w) => w.name.toLowerCase().includes(q));
    document.getElementById('l').innerHTML = rows.length ? rows.map((w) => `
      <a class="card" href="#/dolgozo/${w.id}"><div class="ini">${esc(initials(w.name))}</div>
      <div class="who"><b>${esc(w.name)}</b><span>${w.last_date ? `Utolsó: ${fmt(w.last_minutes, true)} · ${shortDate(w.last_date)}` : 'Még nincs tétel'}</span>${statusLine(w)}</div>
      <div class="bal ${balClass(w.balance)}">${fmt(w.balance)}</div></a>`).join('')
      : `<p class="empty">${active.length ? 'Nincs találat.' : 'Még nincs dolgozó. A Beállításokban fel tudod venni őket.'}</p>`;
  };
  document.getElementById('q').oninput = draw; draw();
}

/* ---------- új tétel ---------- */

async function viewNew(preselect) {
  const [{ workers, today: srvToday }, { templates }] = await Promise.all([api('/workers'), api('/templates')]);
  const active = workers.filter((w) => w.active);
  if (!active.length) { $app.innerHTML = `<p class="empty">Előbb vegyél fel dolgozót a Beállításokban.</p>${nav('set')}`; return; }
  const st = { kind: 'credit', h: 0, m: 30, multi: false, w: preselect && active.some((w) => w.id === +preselect) ? +preselect : active[0].id, picked: new Set() };
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>Új tétel</h2></div>
    <form id="f">
    <div class="field"><label for="w">Dolgozó</label>
      <select class="input" id="w">${active.map((w) => `<option value="${w.id}">${esc(w.name)} (${fmt(w.balance)})</option>`).join('')}</select>
      <div id="many" class="checks" hidden>${active.map((w) => `<label class="check"><input type="checkbox" value="${w.id}"><span>${esc(w.name)}</span></label>`).join('')}</div>
      <label class="check multi"><input type="checkbox" id="multi"><span>Több dolgozónak egyszerre</span></label></div>
    <div class="field"><span class="label">Mi történt?</span><div class="seg">
      <button type="button" data-kind="credit" aria-pressed="true">+ Túlóra jóváírása</button>
      <button type="button" data-kind="use" aria-pressed="false">− Szabadidő kivétele</button></div></div>
    <div class="field"><span class="label">Mennyi időt?</span><div class="stepper">
      <div class="step"><input id="h" type="number" inputmode="numeric" min="0" max="999" aria-label="Óra"><div class="u">óra</div>
        <div class="pm"><button type="button" data-d="h-1" aria-label="Óra csökkentése">−</button><button type="button" data-d="h+1" aria-label="Óra növelése">+</button></div></div>
      <div class="step"><input id="m" type="number" inputmode="numeric" min="0" max="59" aria-label="Perc"><div class="u">perc</div>
        <div class="pm"><button type="button" data-d="m-5" aria-label="Perc csökkentése">−</button><button type="button" data-d="m+5" aria-label="Perc növelése">+</button></div></div></div>
      <div class="quick"><button type="button" data-add="15">+15 p</button><button type="button" data-add="30">+30 p</button><button type="button" data-add="60">+1 ó</button><button type="button" data-add="120">+2 ó</button><button type="button" data-add="480">+8 ó</button></div></div>
    <div class="field"><label for="d">Dátum</label><input class="input" id="d" type="date" value="${srvToday}" required>
      <p class="tabs-note" id="dnote" hidden></p></div>
    <div class="field"><label for="n">Megjegyzés</label>
      ${templates.length ? `<div class="quick" id="tpl" style="margin:0 0 8px">${templates.map((t) => `<button type="button" data-t="${esc(t.text)}">${esc(t.text)}</button>`).join('')}</div>` : ''}
      <textarea class="input" id="n" maxlength="300" placeholder="Pl. szülői értekezlet, rendezvény…"></textarea></div>
    <div class="preview"><span id="pl">Új egyenleg</span><span id="pv"></span></div>
    <div id="msg"></div>
    </form><div class="savebar"><button class="btn" id="save" type="submit" form="f">Mentés</button></div>`;
  const $ = (id) => document.getElementById(id);
  $('w').value = st.w;
  const minutes = () => st.h * 60 + st.m;
  const targets = () => (st.multi ? [...st.picked] : [+$('w').value]);
  const sync = () => {
    $('h').value = st.h; $('m').value = st.m;
    const future = st.kind === 'use' && $('d').value > srvToday;
    $('d').max = st.kind === 'credit' ? srvToday : '';
    if (st.kind === 'credit' && $('d').value > srvToday) $('d').value = srvToday;
    $('dnote').hidden = !future; $('dnote').textContent = 'Tervezett szabadidő: az egyenleget csak a kivétel napjától csökkenti.';
    if (st.multi) {
      $('pl').textContent = 'Összesen';
      $('pv').innerHTML = `<b>${st.picked.size} dolgozó × ${fmt(minutes())}</b>`;
      $('save').disabled = minutes() <= 0 || !st.picked.size;
    } else {
      const w = active.find((x) => x.id === +$('w').value);
      const delta = st.kind === 'use' ? -minutes() : minutes();
      const next = future ? w.balance : w.balance + delta;
      $('pl').textContent = future ? 'Egyenleg (nem változik)' : 'Új egyenleg';
      $('pv').innerHTML = future ? `<b>${fmt(w.balance)}</b>` : `<span style="opacity:.6;text-decoration:line-through">${fmt(w.balance)}</span> → <b>${fmt(next)}</b>`;
      $('save').disabled = minutes() <= 0;
    }
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === st.kind));
  };
  const setMin = (total) => { total = Math.max(0, total); st.h = Math.floor(total / 60); st.m = total % 60; };
  $('h').oninput = () => { st.h = Math.max(0, Math.floor(+$('h').value) || 0); sync(); };
  $('m').oninput = () => { setMin(st.h * 60 + Math.max(0, Math.floor(+$('m').value) || 0)); sync(); };
  $('w').onchange = sync; $('d').onchange = sync;
  $('multi').onchange = () => {
    st.multi = $('multi').checked; $('many').hidden = !st.multi; $('w').hidden = st.multi;
    if (st.multi && !st.picked.size) { st.picked.add(+$('w').value); $('many').querySelector(`input[value="${$('w').value}"]`).checked = true; }
    sync();
  };
  $('many').onchange = (e) => { const v = +e.target.value; e.target.checked ? st.picked.add(v) : st.picked.delete(v); sync(); };
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { st.kind = b.dataset.kind; sync(); }));
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { setMin(minutes() + +b.dataset.add); sync(); }));
  document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { $('n').value = $('n').value.trim() ? `${$('n').value.trim()}, ${b.dataset.t}` : b.dataset.t; }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    const [f, d] = [b.dataset.d[0], +b.dataset.d.slice(1)];
    if (f === 'h') st.h = Math.max(0, st.h + d); else setMin(minutes() + d);
    sync();
  }));
  sync();
  $('f').onsubmit = async (e) => {
    e.preventDefault(); $('save').disabled = true;
    const ids = targets();
    try {
      const { ids: created } = await api('/entries', { method: 'POST', body: { worker_ids: ids, kind: st.kind, minutes: minutes(), date: $('d').value, note: $('n').value } });
      location.hash = ids.length === 1 ? `#/dolgozo/${ids[0]}` : '#/';
      toast(ids.length === 1 ? 'Rögzítve' : `Rögzítve ${ids.length} dolgozónak`, {
        label: 'Visszavonás',
        run: async () => { try { await api('/entries/undo', { method: 'POST', body: { ids: created } }); toast('Visszavonva'); route(); } catch (err) { toast(err.message); } },
      });
    } catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; $('save').disabled = false; }
  };
}

/* ---------- dolgozó lapja ---------- */

async function viewWorker(id) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { worker, entries, signatures, today: srvToday } = await api(`/workers/${id}/entries`);
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>${esc(worker.name)}</h2></div>
    <div class="hero"><small>Aktuális egyenleg</small>
      <div class="big">${bigTime(worker.balance)}</div>
      ${worker.planned ? `<div class="pills"><span class="pill">Tervezett: ${fmt(worker.planned, true)}</span></div>` : ''}${ICONS.flower}</div>
    <a class="btn" href="#/uj?w=${worker.id}" style="text-decoration:none">+ Új tétel ennek a dolgozónak</a>
    <div class="row" style="margin-top:10px"><a class="btn ghost small" style="flex:1;text-align:center;text-decoration:none" href="#/kimutatas?w=${worker.id}">Kimutatás</a>
      <button class="btn ghost small" style="flex:1" id="ren" type="button">Átnevezés</button></div>
    <form id="renf" class="row" style="margin-top:10px" hidden><input class="input" id="newname" maxlength="80" value="${esc(worker.name)}" aria-label="Új név" required>
      <button class="btn small" type="submit">Mentés</button></form>
    ${signatures.length ? `<div class="field"><span class="label">Aláírt kimutatások</span>${signatures.slice(0, 5).map((s) => `<div class="set-item"><span>${dotted(s.from_date)} – ${dotted(s.to_date)}</span><em class="status ok">Aláírva: ${dotted(s.signed_on)}</em></div>`).join('')}</div>` : ''}
    <div class="entries" id="e">${entries.length ? entries.map((e) => {
      const planned = e.date > srvToday && !e.reversed && e.kind === 'use';
      return `<div class="entry ${e.kind === 'reversal' || e.reversed ? 'dim' : ''} ${planned ? 'planned' : ''}">
        <div class="bal ${balClass(e.minutes)}">${fmt(e.minutes, true)}</div>
        <div class="meta"><b>${esc(e.note || KIND[e.kind])}</b><span>${fullDate(e.date)} · ${planned ? 'Tervezett szabadidő' : KIND[e.kind]}${e.reversed ? ' · sztornózva' : ''}</span></div>
        ${e.kind !== 'reversal' && !e.reversed ? `<button class="undo" data-rev="${e.id}">${planned ? 'Lemondás' : 'Sztornó'}</button>` : ''}
      </div>`; }).join('') : '<p class="empty">Még nincs tétel.</p>'}</div>
    <p class="tabs-note">A tételek nem törölhetők, hibát sztornóval lehet javítani.</p>${nav('')}`;
  document.getElementById('ren').onclick = () => { const f = document.getElementById('renf'); f.hidden = !f.hidden; if (!f.hidden) document.getElementById('newname').focus(); };
  document.getElementById('renf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/workers/${id}`, { method: 'PATCH', body: { name: document.getElementById('newname').value } }); toast('Átnevezve'); viewWorker(id); }
    catch (err) { toast(err.message); }
  };
  document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
    const label = b.textContent;
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = label; }, 3000); return; }
    try { await api(`/entries/${b.dataset.rev}/reverse`, { method: 'POST', body: {} }); toast('Sztornózva'); viewWorker(id); }
    catch (err) { toast(err.message); }
  }));
}

/* ---------- beállítások ---------- */

async function viewSettings() {
  const [{ workers }, { templates }] = await Promise.all([api('/workers'), api('/templates')]);
  $app.innerHTML = `
    <div class="topbar"><h2>Beállítások</h2></div>
    <form id="f"><div class="field"><label for="nm">Új dolgozó</label>
      <input class="input" id="nm" placeholder="Teljes név" maxlength="80" required></div>
      <div class="field"><span class="label">Nyitó egyenleg a papírról</span><div class="row">
        <input class="input" id="oh" type="number" inputmode="numeric" min="0" placeholder="óra" aria-label="Nyitó óra">
        <input class="input" id="om" type="number" inputmode="numeric" min="0" max="59" placeholder="perc" aria-label="Nyitó perc"></div></div>
      <div id="msg"></div><button class="btn" type="submit">Dolgozó felvétele</button></form>
    <div class="field"><span class="label">Dolgozók</span>${workers.map((w) => `
      <div class="set-item ${w.active ? '' : 'off'}"><span>${esc(w.name)}</span>
      <button class="btn ghost small" data-toggle="${w.id}" data-active="${w.active ? 0 : 1}">${w.active ? 'Inaktívvá tesz' : 'Aktiválás'}</button></div>`).join('')}</div>
    <div class="field"><span class="label">Gyakori megjegyzések</span>
      ${templates.map((t) => `<div class="set-item"><span>${esc(t.text)}</span><button class="btn ghost small" data-deltpl="${t.id}" aria-label="Törlés: ${esc(t.text)}">Törlés</button></div>`).join('')}
      <form id="tf" class="row" style="margin-top:8px"><input class="input" id="tt" maxlength="60" placeholder="Új gyors megjegyzés" required><button class="btn small" type="submit">Hozzáad</button></form></div>
    <div class="field"><span class="label">Adatok mentése</span>
      <a class="btn ghost" style="text-decoration:none;margin-top:0" href="/api/backup?format=csv" download>Táblázat letöltése (Excel, CSV)</a>
      <a class="btn ghost" style="text-decoration:none" href="/api/backup" download>Teljes mentés letöltése (JSON)</a>
      <p class="tabs-note">Havonta egyszer érdemes letölteni és egy biztonságos helyre menteni.</p></div>
    <div class="field"><span class="label">Telepítés a telefonra</span>
      <p class="tabs-note" style="margin:0">iPhone: Safari → Megosztás → <b>Főképernyőhöz adás</b>. Android: Chrome → ⋮ menü → <b>Alkalmazás telepítése</b>.</p></div>
    <div class="field"><button class="btn ghost" id="out" type="button">Kijelentkezés</button></div>${nav('set')}`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const min = (+document.getElementById('oh').value || 0) * 60 + (+document.getElementById('om').value || 0);
    try { await api('/workers', { method: 'POST', body: { name: document.getElementById('nm').value, opening_minutes: min, date: today() } }); toast('Felvéve'); viewSettings(); }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  document.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => {
    await api(`/workers/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active === '1' } }); viewSettings();
  }));
  document.querySelectorAll('[data-deltpl]').forEach((b) => (b.onclick = async () => { await api(`/templates/${b.dataset.deltpl}`, { method: 'DELETE' }); viewSettings(); }));
  document.getElementById('tf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/templates', { method: 'POST', body: { text: document.getElementById('tt').value } }); viewSettings(); } catch (err) { toast(err.message); }
  };
  document.getElementById('out').onclick = async () => { await api('/logout', { method: 'POST' }); location.hash = '#/belepes'; };
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
  const { workers } = await api('/workers');
  const active = workers.filter((w) => w.active);
  const [f0, t0] = presetRange('month');
  const pre = q && q.get('w');
  const st = { mode: 'sheets' };
  $app.innerHTML = `
    <div class="topbar"><h2>Kimutatás</h2></div>
    <form id="f">
    <div class="field"><span class="label">Forma</span><div class="seg">
      <button type="button" data-mode="sheets" aria-pressed="true">Dolgozónként (aláírásra)</button>
      <button type="button" data-mode="summary" aria-pressed="false">Összesítő lista</button></div></div>
    <div class="field" id="wf"><label for="w">Dolgozó</label><select class="input" id="w"><option value="all">Mindenki (${active.length} oldal)</option>${active.map((w) => `<option value="${w.id}"${String(w.id) === pre ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><span class="label">Időszak</span><div class="quick" style="margin-top:0">
      <button type="button" data-p="week">Ez a hét</button><button type="button" data-p="lastweek">Múlt hét</button>
      <button type="button" data-p="month">Ez a hónap</button><button type="button" data-p="lastmonth">Múlt hónap</button></div></div>
    <div class="field"><div class="row">
      <div style="flex:1;min-width:0"><label class="label" for="from">Ettől</label><input class="input" id="from" type="date" value="${f0}" required></div>
      <div style="flex:1;min-width:0"><label class="label" for="to">Eddig</label><input class="input" id="to" type="date" value="${t0}" required></div></div></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Kimutatás megnyitása</button></form>
    <p class="tabs-note">A következő oldalon nyomtathatod vagy PDF-be mentheted. Az aláírt példányt itt jelölheted meg.</p>${nav('rep')}`;
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    st.mode = b.dataset.mode; document.getElementById('wf').hidden = st.mode === 'summary';
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.mode === st.mode));
  }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const [f, t] = presetRange(b.dataset.p); document.getElementById('from').value = f; document.getElementById('to').value = t;
  }));
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const from = document.getElementById('from').value, to = document.getElementById('to').value;
    if (from > to) { document.getElementById('msg').innerHTML = '<div class="err">Az „Ettől” dátum nem lehet későbbi, mint az „Eddig”.</div>'; return; }
    location.hash = st.mode === 'summary' ? `#/kimutatas/osszesito?from=${from}&to=${to}` : `#/kimutatas/nyomtatas?from=${from}&to=${to}&w=${document.getElementById('w').value}`;
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
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>${r.sheets.length} oldal</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:16px">Nyomtatás / PDF mentése</button></div>
    ${r.sheets.length ? r.sheets.map(sheet).join('') : '<p class="empty">Nincs dolgozó a kimutatáshoz.</p>'}`;
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
  const r = await api(`/report?from=${q.get('from')}&to=${q.get('to')}&worker=all`);
  const rows = r.sheets.map((s) => {
    const credit = s.entries.reduce((a, e) => a + Math.max(e.minutes, 0), 0);
    const used = s.entries.reduce((a, e) => a + Math.max(-e.minutes, 0), 0);
    return { name: s.worker.name, opening: s.opening, credit, used, closing: s.closing };
  });
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const when = stamp();
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>Összesítő</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:16px">Nyomtatás / PDF mentése</button></div>
    <section class="sheet">${sheetHead(when)}
      <h3>Összesítő kimutatás</h3>
      <div class="facts"><div><small>Időszak</small><b>${dotted(r.from)} – ${dotted(r.to)}</b></div></div>
      <p class="unit">Az értékek óra:perc formában szerepelnek.</p>
      <table class="sum"><thead><tr><th>Dolgozó</th><th class="r">Nyitó</th><th class="r">Jóváírás</th><th class="r">Kivétel</th><th class="r">Záró</th></tr></thead>
        <tbody>${rows.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${hm(x.opening)}</td><td class="r plus">${x.credit ? hm(x.credit, true) : '–'}</td><td class="r minus">${x.used ? hm(-x.used) : '–'}</td><td class="r"><b>${hm(x.closing)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Összesen</td><td class="r">${hm(sum('opening'))}</td><td class="r">${hm(sum('credit'), true)}</td><td class="r">${hm(-sum('used'))}</td><td class="r">${hm(sum('closing'))}</td></tr></tfoot></table>
      <div class="sig"><div>Készítette</div><div>Óvodavezető</div></div>
      <div class="foot"><span>Az egyenleg szabadidőben értendő.</span><span>Kelt: ………………………</span></div></section>`;
  document.getElementById('print').onclick = () => window.print();
}

/* ---------- útvonalak ---------- */

async function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const q = new URLSearchParams(query);
  try {
    if (path === '/belepes') return viewLogin();
    $app.classList.toggle('wide', path.startsWith('/kimutatas/'));
    if (path === '/uj') return await viewNew(q.get('w'));
    if (path === '/kimutatas') return await viewReportForm(q);
    if (path === '/kimutatas/nyomtatas') return await viewReportPrint(q);
    if (path === '/kimutatas/osszesito') return await viewReportSummary(q);
    if (path === '/beallitasok') return await viewSettings();
    const m = path.match(/^\/dolgozo\/(\d+)$/);
    if (m) return await viewWorker(m[1]);
    return await viewList();
  } catch (err) {
    if (err.message !== 'login') $app.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', route);
route();
