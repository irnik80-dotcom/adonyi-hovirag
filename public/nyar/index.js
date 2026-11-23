// Nyári munkabeosztás-készítő – felület. Külön modul: a fő alkalmazás csak a #/nyari-beosztas útvonalon tölti be.
import * as M from './model.js';
import { PROFILES, profileList, combine } from './solver.js';

let C;            // a fő alkalmazástól kapott segédek: api, toast, esc
const st = { id: null, version: 0, plan: null, ctx: null, holidays: [], cal: null, abs: null, val: null, dirty: false, saving: false, again: false, timer: null, running: false, importPreview: null, progress: null };
const esc = (s) => C.esc(s);
const $ = (id) => document.getElementById(id);
const BASE = '#/nyari-beosztas';
const TABS = [
  ['attekintes', 'Áttekintés'], ['beallitasok', 'Beállítások'], ['dolgozok', 'Dolgozók'], ['tavollet', 'Távollétek'],
  ['generalas', 'Generálás'], ['beosztas', 'Beosztás'], ['ellenorzes', 'Ellenőrzés'], ['nyomtatas', 'Nyomtatás'],
];
const CODE_LABEL = { DE: 'Délelőtti műszak', DU: 'Délutáni műszak', szabadsag: 'Szabadság', egyeb: 'Egyéb távollét', piheno: 'Pihenőnap', hetvege: 'Hétvége', zarva: 'Ünnepnap / zárva' };

function ensureCss() {
  if (document.getElementById('nyar-css')) return;
  const l = document.createElement('link'); l.id = 'nyar-css'; l.rel = 'stylesheet'; l.href = '/nyar/nyar.css'; document.head.append(l);
}
addEventListener('beforeunload', (e) => { if (st.dirty) { e.preventDefault(); e.returnValue = ''; } });

export async function mount($app, ctx) {
  // Mobilon a fülváltás előbb cseréli le az oldalt, mint hogy a szerkesztett mező „change” eseménye lefutna:
  // a fókuszban lévő mező elhagyása lefuttatja, így a beírt érték nem vész el.
  const act = document.activeElement;
  if (act && act !== document.body && act.closest?.('#nyv')) act.blur();
  C = ctx; ensureCss();
  const parts = ctx.path.split('/').filter(Boolean);
  if (parts.length === 1) { await flush(); st.id = null; st.plan = null; return viewPlans($app); }
  const id = Number(parts[1]);
  if (!Number.isInteger(id)) { location.hash = BASE; return; }
  if (st.id !== id || !st.plan) await loadPlan(id);
  renderPlan($app, ctx.q.get('t') || 'attekintes', ctx.q);
}

// ---------------- adatok ----------------
async function loadContext(years) {
  const [ctx, hol] = await Promise.all([C.api('/summer/context'), C.api(`/holidays?years=${[...new Set(years)].join(',')}`)]);
  st.ctx = ctx; st.holidays = hol.days || [];
}
async function loadPlan(id) {
  await flush();
  const r = await C.api(`/summer/plans/${id}`);
  st.id = r.id; st.version = r.version; st.plan = M.normalizePlan(r.data); st.importPreview = null;
  st.plan.locks ||= {};
  await loadContext(planYears());
  st.plan.staff = M.syncStaff(st.plan.staff, st.plan.roles, st.ctx.workers);
  recompute();
}
const planYears = () => { const a = Number(st.plan.period.from.slice(0, 4)), b = Number(st.plan.period.to.slice(0, 4)); return a && b ? Array.from({ length: Math.min(3, b - a + 1) }, (_, i) => a + i) : [new Date().getFullYear()]; };
function recompute() {
  const p = st.plan;
  st.cal = M.buildCalendar(p, st.holidays);
  st.abs = M.expandAbsences(p);
  st.val = p.schedule ? M.validate(p, st.cal, st.abs, p.schedule) : null;
}
function changed({ rerender } = {}) {
  recompute(); st.dirty = true; saveState('Mentés…');
  clearTimeout(st.timer); st.timer = setTimeout(save, 700);
  if (rerender) rerender();
}
async function save() {
  clearTimeout(st.timer);
  if (!st.dirty || !st.id) return;
  if (st.saving) { st.again = true; return; }
  st.saving = true;
  try {
    const r = await C.api(`/summer/plans/${st.id}`, { method: 'PUT', body: { data: st.plan, version: st.version } });
    st.version = r.version; st.dirty = false; saveState('Mentve');
  } catch (e) {
    saveState(`Nincs mentve: ${e.message}`, true);
    if (e.message !== 'login') C.toast(`Mentési hiba: ${e.message}`);
  } finally {
    st.saving = false;
    if (st.again) { st.again = false; save(); }
  }
}
async function flush() { if (st.dirty) await save(); }
function saveState(text, bad) { const el = $('nysave'); if (el) { el.textContent = text; el.classList.toggle('bad', Boolean(bad)); } }

// ---------------- tervek listája ----------------
async function viewPlans($app) {
  const { plans } = await C.api('/summer/plans');
  const y = new Date().getFullYear() + 1;
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/beallitasok" aria-label="Vissza">${backIcon}</a><h2>Nyári beosztás</h2></div>
    <p class="tabs-note">Az óvoda nyári, váltott munkarendjének tervezése. A dolgozókat és munkaköröket a fő alkalmazásból veszi át, azokat nem módosítja.</p>
    <div class="field"><span class="label">Tervek</span>
      ${plans.length ? plans.map((p) => `<a class="set-item ny-plan" href="${BASE}/${p.id}"><span><b>${esc(p.name)}</b><small>Módosítva: ${esc(p.updated_at.slice(0, 16).replace('T', ' '))} UTC</small></span><em>${p.year}</em></a>`).join('') : '<p class="tabs-note">Még nincs terv.</p>'}
    </div>
    <form id="nf" class="field"><label for="ny">Új terv éve</label>
      <div class="row"><input class="input" id="ny" type="number" min="2024" max="2100" value="${y}" required><button class="btn small" type="submit">Új terv</button></div>
      <p class="tabs-note">Az időszak, a létszámigény és a munkakörök a létrehozás után a Beállításokban módosíthatók.</p></form>
    <form id="nfi" class="field"><span class="label">Visszatöltés mentett fájlból</span><input class="input" id="nfile" type="file" accept=".json,application/json"></form>`;
  $('nf').onsubmit = async (e) => {
    e.preventDefault();
    const year = Number($('ny').value);
    try {
      const ctx = await C.api('/summer/context');
      const plan = M.newPlan(year, ctx.groups, ctx.workers);
      plan.locks = {};
      const r = await C.api('/summer/plans', { method: 'POST', body: { name: plan.name, year, data: plan } });
      location.hash = `${BASE}/${r.id}?t=beallitasok`;
    } catch (err) { C.toast(err.message); }
  };
  $('nfile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const plan = data.plan || data;
      if (!plan.period || !plan.roles) throw new Error('Ez nem nyári beosztás mentés.');
      const r = await C.api('/summer/plans', { method: 'POST', body: { name: `${plan.name || 'Nyári beosztás'} (visszatöltve)`, year: Number(plan.period.from.slice(0, 4)), data: { ...plan, name: `${plan.name || 'Nyári beosztás'} (visszatöltve)` } } });
      location.hash = `${BASE}/${r.id}`;
    } catch (err) { C.toast(err.message); }
  };
}

// ---------------- terv nézet ----------------
function renderPlan($app, tab, q) {
  if (!TABS.some(([k]) => k === tab)) tab = 'attekintes';
  const p = st.plan;
  const badge = st.val ? (st.val.ok ? '<span class="ny-badge ok">Érvényes</span>' : `<span class="ny-badge bad">${st.val.errors.length} hiba</span>`) : '';
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="${BASE}" aria-label="Vissza a tervekhez">${backIcon}</a><h2>${esc(p.name)}</h2>${badge}</div>
    <div class="ny-sub"><span>${M.dotted(p.period.from)} – ${M.dotted(p.period.to)} · ${st.cal.workdays.length} munkanap</span><span id="nysave" class="ny-save">${st.dirty ? 'Mentés…' : 'Mentve'}</span></div>
    <nav class="ny-tabs" aria-label="Nyári beosztás részei">${TABS.map(([k, l]) => `<a href="${BASE}/${st.id}?t=${k}" class="${k === tab ? 'on' : ''}" ${k === tab ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
    <div id="nyv"></div>`;
  const el = $('nyv');
  const fn = { attekintes: tabOverview, beallitasok: tabSettings, dolgozok: tabStaff, tavollet: tabAbsences, generalas: tabGenerate, beosztas: tabSchedule, ellenorzes: tabCheck, nyomtatas: tabPrint }[tab];
  fn(el, q);
  document.querySelector('.ny-tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
}
const rerenderTab = () => { const h = location.hash.split('?'); const q = new URLSearchParams(h[1] || ''); renderPlan(document.getElementById('app'), q.get('t') || 'attekintes', q); };
const stale = () => st.plan.alternatives.length && st.plan.gen_fp && st.plan.gen_fp !== M.fingerprint(st.plan, st.holidays);

// ---------- Áttekintés ----------
function tabOverview(el) {
  const p = st.plan;
  const cap = M.capacitySummary(p, st.cal, st.abs);
  const nStaff = p.staff.filter((s) => s.include).length;
  const conflicts = M.precheck(p, st.cal, st.abs, p.locks);
  const steps = [
    ['beallitasok', 'Időszak és létszámigény', `${p.roles.length} munkakör, ${st.cal.workdays.length} munkanap`, p.roles.length > 0],
    ['dolgozok', 'Dolgozók', `${nStaff} dolgozó bevonva`, nStaff > 0],
    ['tavollet', 'Szabadságok', `${p.absences.length} távollét rögzítve`, p.absences.length > 0],
    ['generalas', 'Generálás', conflicts.length ? `${conflicts.length} létszámütközés – előbb rendezni kell` : p.alternatives.length ? `${p.alternatives.filter((a) => a.grid).length} változat${stale() ? ' · elavult, érdemes újragenerálni' : ''}` : 'még nincs', p.alternatives.length > 0 && !stale() && !conflicts.length],
    ['beosztas', 'Kiválasztott beosztás', p.schedule ? (st.val.ok ? `érvényes · ${Object.keys(p.locks).length} kézi módosítás` : `${st.val.errors.length} hiba`) : 'még nincs kiválasztva', Boolean(p.schedule && st.val.ok)],
    ['nyomtatas', 'Havi A3 PDF', `${st.cal.months.length} oldal`, false],
  ];
  el.innerHTML = `
    <ol class="ny-steps">${steps.map(([t, h, s, ok], i) => `<li class="${ok ? 'ok' : ''}"><a href="${BASE}/${st.id}?t=${t}"><i>${ok ? '✓' : i + 1}</i><span><b>${h}</b><small>${esc(s)}</small></span></a></li>`).join('')}</ol>
    <div class="field"><span class="label">Munkakörönkénti kapacitás</span>
      <div class="ny-scroll"><table class="ny-tbl"><thead><tr><th>Munkakör</th><th>Dolgozó</th><th title="munkanapok × (DE + DU minimum)">Szükséges dolgozói nap</th><th>Elérhető dolgozói nap</th><th title="tervezett létszám alapján">Átlag / fő</th></tr></thead>
      <tbody>${cap.map((c) => `<tr class="${c.avail < c.need ? 'bad' : ''}"><td>${esc(c.role)}</td><td>${c.workers}</td><td>${c.need}</td><td>${c.avail}</td><td>${c.perWorker} nap</td></tr>`).join('')}</tbody></table></div>
      <p class="tabs-note">Az átlag a szükséges munkanapok egyenletes elosztása; a szabadság miatt kevesebbet elérhető dolgozó arányosan kevesebb napot kap.</p></div>
    <div class="field"><span class="label">Terv</span>
      <div class="row"><input class="input" id="pname" maxlength="120" value="${esc(p.name)}" aria-label="A terv neve"><button class="btn small ghost" id="pren" type="button">Átnevezés</button></div>
      <div class="ny-btns"><button class="btn ghost small" id="pexp" type="button">Mentés fájlba (JSON)</button><button class="btn ghost small" id="pdel" type="button">Terv törlése</button></div>
      <p class="tabs-note">Minden módosítás automatikusan mentődik. A fájlba mentés biztonsági másolat; a tervek listájánál tölthető vissza.</p></div>`;
  $('pren').onclick = () => { p.name = $('pname').value.trim() || p.name; changed({ rerender: rerenderTab }); };
  $('pexp').onclick = () => download(new Blob([JSON.stringify({ kind: 'hovirag-nyari-beosztas', saved: new Date().toISOString(), plan: p }, null, 1)], { type: 'application/json' }), `${slug(p.name)}.json`);
  $('pdel').onclick = async () => {
    if (!confirm(`Biztosan törlöd a(z) „${p.name}” tervet? Ez nem vonható vissza (előtte érdemes fájlba menteni).`)) return;
    try { await C.api(`/summer/plans/${st.id}`, { method: 'DELETE' }); st.dirty = false; st.plan = null; st.id = null; location.hash = BASE; } catch (e) { C.toast(e.message); }
  };
}

// ---------- Beállítások ----------
function tabSettings(el) {
  const p = st.plan, s = p.settings;
  const groups = st.ctx.groups;
  const unused = groups.filter((g) => !p.roles.some((r) => r.group_id === g.id));
  const hol = st.holidays.filter((h) => h.date >= p.period.from && h.date <= p.period.to);
  const num = (id, v) => `<input class="input ny-num" type="number" min="0" max="20" id="${id}" value="${v}">`;
  el.innerHTML = `
    <section class="field"><span class="label">Tervezési időszak</span>
      <div class="row"><input class="input" type="date" id="pf" value="${p.period.from}" aria-label="Kezdőnap"><input class="input" type="date" id="pt" value="${p.period.to}" aria-label="Utolsó nap"></div>
      <p class="tabs-note">A hétvégék megjelennek, de nem munkanapok. Az augusztus utolsó hetét az intézmény külön kezeli, ezért alapból nincs benne.</p></section>
    <section class="field"><span class="label">Ünnepnapok és zárva tartás</span>
      ${hol.map((h) => `<div class="set-item"><span>${M.dotted(h.date)} · ${esc(h.label)}</span><em class="tabs-note">${h.kind === 'off' ? 'munkaszüneti nap' : 'ledolgozandó munkanap'} (fő app)</em></div>`).join('')}
      ${p.closed.map((c, i) => `<div class="set-item"><span>${M.dotted(c.date)} · ${esc(c.label || 'Zárva')}</span><button class="btn ghost small" data-delc="${i}" type="button">Törlés</button></div>`).join('')}
      <form id="cf" style="margin-top:8px"><div class="row"><input class="input" type="date" id="cd" min="${p.period.from}" max="${p.period.to}" required aria-label="Dátum"><input class="input" id="cl" maxlength="60" placeholder="Megnevezés (pl. nevelés nélküli munkanap)"></div><button class="btn small" type="submit" style="margin-top:8px">Zárva tartási nap hozzáadása</button></form>
      <p class="tabs-note">A törvényi ünnepeket és a fő alkalmazásban megadott speciális napokat automatikusan figyelembe veszi. Az itt megadott nap csak erre a tervre vonatkozik.</p></section>
    <section class="field"><span class="label">Napi létszámigény (munkakörönként, műszakonként)</span>
      <div class="ny-scroll"><table class="ny-tbl ny-roles"><thead><tr><th>Munkakör</th><th>Fő app csoport</th><th>DE min.</th><th>DU min.</th><th>DE terv.</th><th>DU terv.</th><th></th></tr></thead><tbody>
      ${p.roles.map((r, i) => `<tr><td><input class="input" data-rl="${i}" value="${esc(r.label)}" maxlength="40" aria-label="Munkakör neve"></td>
        <td>${esc(groups.find((g) => g.id === r.group_id)?.name || 'törölt csoport')}</td>
        <td>${num(`mde${i}`, r.min.DE)}</td><td>${num(`mdu${i}`, r.min.DU)}</td><td>${num(`ode${i}`, r.opt.DE)}</td><td>${num(`odu${i}`, r.opt.DU)}</td>
        <td class="ny-act"><button type="button" class="ny-ic" data-rup="${i}" aria-label="Feljebb" ${i ? '' : 'disabled'}>↑</button><button type="button" class="ny-ic" data-rdn="${i}" aria-label="Lejjebb" ${i < p.roles.length - 1 ? '' : 'disabled'}>↓</button><button type="button" class="ny-ic" data-rdel="${i}" aria-label="Eltávolítás">✕</button></td></tr>`).join('')}
      </tbody></table></div>
      ${unused.length ? `<div class="row" style="margin-top:8px"><select class="input" id="ra">${unused.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><button class="btn small ghost" id="rab" type="button">Munkakör hozzáadása</button></div>` : ''}
      <p class="tabs-note"><b>Minimum</b>: ez alatt a beosztás nem érvényes (kötelező feltétel). <b>Tervezett</b>: a megcélzott létszám; e fölött a beosztott fő <i>többlet</i>, amit jóvá lehet hagyni. A sorrend a riport csoportsorrendje.</p></section>
    <section class="field"><span class="label">Generálás</span>
      <div class="row"><label class="ny-inl" for="na">Alternatívák száma</label><input class="input ny-num" type="number" id="na" min="1" max="5" value="${s.alternatives}"></div></section>
    <section class="field"><span class="label">Jelölések (képernyő és PDF)</span>
      <div class="ny-codes">${Object.keys(CODE_LABEL).map((k) => `<div class="ny-code"><span class="ny-sw" style="background:${esc(s.colors[k])}">${esc(s.abbr[k])}</span><span>${CODE_LABEL[k]}</span>
        <input type="color" data-col="${k}" value="${esc(s.colors[k])}" aria-label="${CODE_LABEL[k]} színe"><input class="input ny-abbr" data-abbr="${k}" value="${esc(s.abbr[k])}" maxlength="4" aria-label="${CODE_LABEL[k]} rövidítése"></div>`).join('')}</div>
      <button class="btn ghost small" id="cres" type="button" style="margin-top:8px">Alapértelmezett jelölések</button></section>
    <section class="field"><span class="label">Nyomtatási riport</span>
      <input class="input" id="rt" maxlength="80" value="${esc(s.report.title)}" aria-label="Riport fejléce">
      <div class="row" style="margin-top:8px"><label class="ny-inl" for="rm">Margó (mm)</label><input class="input ny-num" type="number" id="rm" min="0" max="15" value="${s.report.margin_mm}"></div>
      <label class="ny-chk"><input type="checkbox" id="rc" ${s.report.show_counts ? 'checked' : ''}> Napi létszám sor munkakörönként</label>
      <label class="ny-chk"><input type="checkbox" id="rw" ${s.report.weekend_x ? 'checked' : ''}> Hétvége X-szel jelölve</label>
      <label class="ny-chk"><input type="checkbox" id="rp" ${s.report.period_only ? 'checked' : ''}> Csak a tervezési időszak napjai (különben a teljes hónap)</label>
      <p class="tabs-note">Nem minden nyomtató tud szegély nélkül nyomtatni; ha a széle lemarad, növeld a margót 5–8 mm-re.</p></section>`;
  const per = () => {
    const f = $('pf').value, t = $('pt').value;
    if (!M.isDate(f) || !M.isDate(t) || f > t) return C.toast('Hibás időszak: a kezdőnap nem lehet az utolsó nap után.');
    if ((Date.parse(t) - Date.parse(f)) / 864e5 > 200) return C.toast('Az időszak legfeljebb 200 nap lehet.');
    p.period = { from: f, to: t };
    loadContext(planYears()).then(() => changed({ rerender: rerenderTab }));
  };
  $('pf').onchange = per; $('pt').onchange = per;
  $('cf').onsubmit = (e) => { e.preventDefault(); const d = $('cd').value; if (!d) return; p.closed = p.closed.filter((c) => c.date !== d).concat({ date: d, label: $('cl').value.trim() }).sort((a, b) => a.date.localeCompare(b.date)); changed({ rerender: rerenderTab }); };
  el.querySelectorAll('[data-delc]').forEach((b) => (b.onclick = () => { p.closed.splice(+b.dataset.delc, 1); changed({ rerender: rerenderTab }); }));
  p.roles.forEach((r, i) => {
    el.querySelector(`[data-rl="${i}"]`).oninput = (e) => { if (e.target.value.trim()) { r.label = e.target.value.trim(); changed(); } };
    let prev = { ...r.min };
    for (const [id, a, k] of [[`mde${i}`, 'min', 'DE'], [`mdu${i}`, 'min', 'DU'], [`ode${i}`, 'opt', 'DE'], [`odu${i}`, 'opt', 'DU']]) {
      const optEl = $(`o${k.toLowerCase()}${i}`);
      const apply = (e, final) => {
        if (e.target.value === '' && !final) return;
        const v = Math.max(0, Math.min(20, Math.trunc(Number(e.target.value) || 0)));
        r[a][k] = v;
        // a minimum emelése a tervezettet is viszi; a csökkentése a tervezettet is csökkenti, ha addig egyeztek
        if (a === 'min') { if (r.opt[k] < v || prev[k] === r.opt[k]) { r.opt[k] = v; optEl.value = v; } }
        if (a === 'opt' && v < r.min[k] && final) { r.opt[k] = r.min[k]; e.target.value = r.min[k]; C.toast('A tervezett létszám nem lehet kisebb a minimumnál.'); }
        prev = { ...r.min };
        if (final) e.target.value = r[a][k];
        changed();
      };
      $(id).onfocus = () => { prev = { ...r.min }; };
      $(id).oninput = (e) => apply(e, false);
      $(id).onchange = (e) => apply(e, true);
    }
  });
  const mv = (i, d) => { const a = p.roles; [a[i], a[i + d]] = [a[i + d], a[i]]; changed({ rerender: rerenderTab }); };
  el.querySelectorAll('[data-rup]').forEach((b) => (b.onclick = () => mv(+b.dataset.rup, -1)));
  el.querySelectorAll('[data-rdn]').forEach((b) => (b.onclick = () => mv(+b.dataset.rdn, 1)));
  el.querySelectorAll('[data-rdel]').forEach((b) => (b.onclick = () => {
    const r = p.roles[+b.dataset.rdel];
    if (!confirm(`Eltávolítod a(z) „${r.label}” munkakört ebből a tervből? A dolgozói nem kerülnek be a beosztásba.`)) return;
    p.roles.splice(+b.dataset.rdel, 1); p.staff = M.syncStaff(p.staff, p.roles, st.ctx.workers); changed({ rerender: rerenderTab });
  }));
  if ($('rab')) $('rab').onclick = () => {
    const g = groups.find((x) => x.id === Number($('ra').value));
    p.roles.push({ group_id: g.id, label: g.name, min: { DE: 1, DU: 1 }, opt: { DE: 1, DU: 1 } });
    p.staff = M.syncStaff(p.staff, p.roles, st.ctx.workers); changed({ rerender: rerenderTab });
  };
  $('na').oninput = $('na').onchange = (e) => { s.alternatives = Math.max(1, Math.min(5, Math.trunc(Number(e.target.value) || 3))); changed(); };
  const sw = (k) => el.querySelector(`[data-col="${k}"]`).closest('.ny-code').querySelector('.ny-sw');
  el.querySelectorAll('[data-col]').forEach((i) => (i.oninput = i.onchange = () => { s.colors[i.dataset.col] = i.value; sw(i.dataset.col).style.background = i.value; changed(); }));
  el.querySelectorAll('[data-abbr]').forEach((i) => (i.oninput = i.onchange = () => { s.abbr[i.dataset.abbr] = i.value.trim(); sw(i.dataset.abbr).textContent = s.abbr[i.dataset.abbr]; changed(); }));
  $('cres').onclick = () => { s.colors = { ...M.DEFAULT_SETTINGS.colors }; s.abbr = { ...M.DEFAULT_SETTINGS.abbr }; changed({ rerender: rerenderTab }); };
  $('rt').oninput = (e) => { s.report.title = e.target.value.trim(); changed(); };
  $('rm').oninput = $('rm').onchange = (e) => { s.report.margin_mm = Math.max(0, Math.min(15, Number(e.target.value) || 0)); changed(); };
  $('rc').onchange = (e) => { s.report.show_counts = e.target.checked; changed(); };
  $('rw').onchange = (e) => { s.report.weekend_x = e.target.checked; changed(); };
  $('rp').onchange = (e) => { s.report.period_only = e.target.checked; changed(); };
}

// ---------- Dolgozók ----------
function tabStaff(el) {
  const p = st.plan;
  const groups = M.staffByRole(p, { all: true });
  const assigned = new Set(p.roles.map((r) => r.group_id));
  const outside = st.ctx.workers.filter((w) => w.active === 1 && !assigned.has(Number(w.group_ids)));
  el.innerHTML = `
    <p class="tabs-note">A dolgozók neve és munkaköre a fő alkalmazásból jön (Beállítások → Dolgozók), itt nem módosul. Itt azt adod meg, ki vesz részt a nyári beosztásban, és milyen sorrendben szerepeljen a riportban.</p>
    <button class="btn ghost small" id="sref" type="button">Frissítés a fő alkalmazásból</button>
    ${groups.map(({ role, workers }) => `<section class="field"><span class="label">${esc(role.label)} · ${workers.filter((w) => w.include).length} fő</span>
      ${workers.length ? workers.map((w, i) => `<div class="set-item ${w.include ? '' : 'off'}">
        <label class="ny-chk" style="margin:0;flex:1"><input type="checkbox" data-inc="${w.id}" ${w.include ? 'checked' : ''} ${w.active ? '' : 'disabled'}> <span>${esc(w.name)}${w.removed ? ' <small>(törölve a fő appból)</small>' : !w.active ? ' <small>(nem aktív)</small>' : ''}</span></label>
        <button type="button" class="ny-ic" data-up="${w.id}" aria-label="Feljebb" ${i ? '' : 'disabled'}>↑</button><button type="button" class="ny-ic" data-dn="${w.id}" aria-label="Lejjebb" ${i < workers.length - 1 ? '' : 'disabled'}>↓</button></div>`).join('') : '<p class="tabs-note">Ebben a munkakörben nincs dolgozó a fő alkalmazásban.</p>'}
      </section>`).join('')}
    ${outside.length ? `<section class="field"><span class="label">Nem nyári munkakörben (nem szerepelnek)</span><p class="tabs-note">${outside.map((w) => esc(w.name)).join(', ')}</p></section>` : ''}`;
  $('sref').onclick = async () => { try { await loadContext(planYears()); p.staff = M.syncStaff(p.staff, p.roles, st.ctx.workers); changed({ rerender: rerenderTab }); C.toast('Frissítve'); } catch (e) { C.toast(e.message); } };
  el.querySelectorAll('[data-inc]').forEach((c) => (c.onchange = () => { const s = p.staff.find((x) => x.id === Number(c.dataset.inc)); s.include = c.checked; changed({ rerender: rerenderTab }); }));
  const move = (id, d) => {
    const s = p.staff.find((x) => x.id === id);
    const list = M.staffByRole(p, { all: true }).find((g) => g.role.group_id === s.group_id).workers;
    list.forEach((w, i) => (w.order = i));
    const i = list.findIndex((w) => w.id === id), j = i + d;
    if (j < 0 || j >= list.length) return;
    [list[i].order, list[j].order] = [list[j].order, list[i].order];
    changed({ rerender: rerenderTab });
  };
  el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => move(Number(b.dataset.up), -1)));
  el.querySelectorAll('[data-dn]').forEach((b) => (b.onclick = () => move(Number(b.dataset.dn), 1)));
}

// ---------- Távollétek ----------
let xlsxP;
const loadXLSX = () => (xlsxP ??= new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/nyar/vendor/xlsx.mini.min.js'; s.onload = () => res(window.XLSX); s.onerror = () => { xlsxP = null; rej(new Error('Az Excel-olvasó nem töltődött be.')); }; document.head.append(s); }));

async function readTable(file) {
  const buf = await file.arrayBuffer();
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { text = new TextDecoder('windows-1250').decode(buf); }
    return M.parseCSV(text);
  }
  const XLSX = await loadXLSX();
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames.find((n) => !/útmutató|utmutato/i.test(n)) || wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

function tabAbsences(el) {
  const p = st.plan;
  const byW = new Map();
  for (const a of p.absences) { if (!byW.has(a.worker_id)) byW.set(a.worker_id, []); byW.get(a.worker_id).push(a); }
  const nameOf = new Map(p.staff.map((s) => [s.id, s.name]));
  const pv = st.importPreview;
  const opts = M.staffByRole(p).map(({ role, workers }) => `<optgroup label="${esc(role.label)}">${workers.map((w) => `<option value="${w.id}">${esc(w.name)}</option>`).join('')}</optgroup>`).join('');
  el.innerHTML = `
    <section class="field"><span class="label">Importálás Excelből vagy CSV-ből</span>
      <p class="tabs-note">Oszlopok: <b>Dolgozóazonosító</b> (vagy <b>Dolgozó neve</b>), <b>Szabadság kezdete</b>, <b>Szabadság vége</b>, és nem kötelezően Típus (szabadság / egyéb), Státusz (igényelt / jóváhagyott), Megjegyzés. Egynapos szabadságnál a kezdő és a záró dátum ugyanaz. A sablonban már benne vannak a dolgozók és az azonosítóik.</p>
      <div class="ny-btns"><button class="btn ghost small" id="tpl" type="button">Kitöltendő sablon letöltése (Excel)</button></div>
      <input class="input" id="if" type="file" accept=".xlsx,.xls,.csv,.txt" style="margin-top:8px" aria-label="Fájl kiválasztása">
      <div id="ipv">${pv ? importPreviewHtml(pv) : ''}</div></section>
    <section class="field"><span class="label">Távollét kézi felvétele</span>
      <form id="af"><select class="input" id="aw" required aria-label="Dolgozó">${opts}</select>
        <div class="row" style="margin-top:8px"><input class="input" type="date" id="afr" required aria-label="Kezdete" min="${p.period.from}" max="${p.period.to}"><input class="input" type="date" id="ato" required aria-label="Vége" min="${p.period.from}" max="${p.period.to}"></div>
        <div class="row" style="margin-top:8px"><select class="input" id="ak" aria-label="Típus"><option value="szabadsag">Szabadság</option><option value="egyeb">Egyéb távollét (pl. továbbképzés)</option></select><select class="input" id="as" aria-label="Státusz"><option value="igenyelt">Igényelt</option><option value="jovahagyott">Jóváhagyott</option></select></div>
        <input class="input" id="an" maxlength="200" placeholder="Megjegyzés" style="margin-top:8px"><button class="btn small" type="submit" style="margin-top:8px">Hozzáadás</button></form></section>
    <section class="field"><span class="label">Rögzített távollétek (${p.absences.length})</span>
      ${p.absences.length ? `<button class="btn ghost small" id="adelall" type="button">Összes importált törlése</button>` : ''}
      ${[...byW].sort((a, b) => (nameOf.get(a[0]) || '').localeCompare(nameOf.get(b[0]) || '', 'hu')).map(([wid, list]) => `
        <div class="ny-abs"><b>${esc(nameOf.get(wid) || `#${wid}`)}</b><small>${list.reduce((n, a) => n + M.workdaysIn(st.cal, a.from, a.to), 0)} munkanap az időszakban</small>
        ${list.sort((a, b) => a.from.localeCompare(b.from)).map((a) => `<div class="ny-absrow"><span class="ny-sw" style="background:${esc(p.settings.colors[a.kind])}">${esc(p.settings.abbr[a.kind])}</span>
          <span>${M.dotted(a.from)}${a.to !== a.from ? ` – ${M.dotted(a.to)}` : ''} <small>${M.ABSENCE_KINDS[a.kind]} · ${M.ABSENCE_STATUS[a.status] || ''} · ${M.workdaysIn(st.cal, a.from, a.to)} munkanap${a.note ? ' · ' + esc(a.note) : ''}${a.source === 'kezi' ? ' · kézi' : ''}</small></span>
          <button class="ny-ic" type="button" data-adel="${esc(a.id)}" aria-label="Törlés">✕</button></div>`).join('')}</div>`).join('') || '<p class="tabs-note">Még nincs távollét.</p>'}</section>`;
  $('tpl').onclick = () => downloadTemplate().catch((e) => C.toast(`A sablon nem készült el: ${errMsg(e)}`));
  $('if').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const rows = await readTable(f);
      st.importPreview = { file: f.name, ...M.parseAbsenceRows(rows, p) };
      $('ipv').innerHTML = importPreviewHtml(st.importPreview); bindImport();
    } catch (err) { C.toast(`A fájl nem olvasható: ${errMsg(err)}`); }
  };
  bindImport();
  $('af').onsubmit = (e) => {
    e.preventDefault();
    const from = $('afr').value, to = $('ato').value || from;
    if (to < from) return C.toast('A vége nem lehet a kezdet előtt.');
    p.absences.push({ id: M.uid(), worker_id: Number($('aw').value), from, to, kind: $('ak').value, status: $('as').value, note: $('an').value.trim(), source: 'kezi' });
    changed({ rerender: rerenderTab }); C.toast('Hozzáadva');
  };
  el.querySelectorAll('[data-adel]').forEach((b) => (b.onclick = () => { p.absences = p.absences.filter((a) => a.id !== b.dataset.adel); changed({ rerender: rerenderTab }); }));
  if ($('adelall')) $('adelall').onclick = () => { if (!confirm('Törlöd az összes importált távollétet? A kézzel felvettek megmaradnak.')) return; p.absences = p.absences.filter((a) => a.source === 'kezi'); changed({ rerender: rerenderTab }); };
}
function importPreviewHtml(pv) {
  const errs = pv.issues.filter((i) => i.level === 'error'), warns = pv.issues.filter((i) => i.level === 'warning');
  return `<div class="ny-card"><b>${esc(pv.file)}</b>: ${pv.records.length} érvényes sor${errs.length ? `, <span class="ny-red">${errs.length} hibás sor (kimarad)</span>` : ''}${warns.length ? `, ${warns.length} figyelmeztetés` : ''}
    ${pv.issues.length ? `<ul class="ny-issues">${pv.issues.map((i) => `<li class="${i.level}">${i.row ? `${i.row}. sor: ` : ''}${esc(i.msg)}</li>`).join('')}</ul>` : ''}
    ${pv.records.length ? `<div class="ny-scroll"><table class="ny-tbl"><thead><tr><th>Sor</th><th>Dolgozó</th><th>Kezdete</th><th>Vége</th><th>Típus</th><th>Státusz</th></tr></thead><tbody>
      ${pv.records.slice(0, 200).map((r) => `<tr><td>${r.row}</td><td>${esc(r.name)}</td><td>${M.dotted(r.from)}</td><td>${M.dotted(r.to)}</td><td>${M.ABSENCE_KINDS[r.kind]}</td><td>${M.ABSENCE_STATUS[r.status]}</td></tr>`).join('')}</tbody></table></div>
      <button class="btn small" id="iok" type="button" style="margin-top:8px">Importálás (${pv.records.length} távollét)</button>
      <p class="tabs-note">Az importálás lecseréli a korábban importált távolléteket; a kézzel felvettek megmaradnak. A dolgozói adatok nem változnak.</p>` : ''}
    <button class="btn ghost small" id="icancel" type="button" style="margin-top:8px">Mégse</button></div>`;
}
function bindImport() {
  const p = st.plan;
  if ($('iok')) $('iok').onclick = () => {
    const recs = st.importPreview.records;
    p.absences = p.absences.filter((a) => a.source === 'kezi').concat(recs.map((r) => ({ id: M.uid(), worker_id: r.worker_id, from: r.from, to: r.to, kind: r.kind, status: r.status, note: r.note, source: 'import' })));
    st.importPreview = null; changed({ rerender: rerenderTab }); C.toast(`${recs.length} távollét importálva`);
  };
  if ($('icancel')) $('icancel').onclick = () => { st.importPreview = null; $('ipv').innerHTML = ''; };
}
async function downloadTemplate() {
  const XLSX = await loadXLSX();
  const p = st.plan;
  const head = ['Dolgozóazonosító', 'Dolgozó neve', 'Munkakör', 'Szabadság kezdete', 'Szabadság vége', 'Típus', 'Státusz', 'Megjegyzés'];
  const rows = [head];
  for (const { role, workers } of M.staffByRole(p)) for (const w of workers) {
    const mine = p.absences.filter((a) => a.worker_id === w.id);
    if (!mine.length) rows.push([w.id, w.name, role.label, '', '', 'szabadság', 'igényelt', '']);
    for (const a of mine) rows.push([w.id, w.name, role.label, D(a.from), D(a.to), a.kind === 'szabadsag' ? 'szabadság' : 'egyéb', a.status === 'jovahagyott' ? 'jóváhagyott' : 'igényelt', a.note || '']);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true, dateNF: 'yyyy-mm-dd' });
  ws['!cols'] = [{ wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 13 }, { wch: 30 }];
  const help = XLSX.utils.aoa_to_sheet([
    ['Kitöltési útmutató'],
    ['Minden távollét egy sor. Ha valakinek több szabadsága van, másold le a sorát.'],
    ['A dátumokat ÉÉÉÉ.HH.NN formában írd (pl. 2027.07.05). Egynapos szabadságnál a kezdet és a vége ugyanaz.'],
    ['Típus: szabadság vagy egyéb (pl. továbbképzés). Státusz: igényelt vagy jóváhagyott.'],
    ['Ha valakinek nincs szabadsága, a sor dátumait hagyd üresen – az ilyen sor nem hiba.'],
    ['A Dolgozóazonosító oszlopot ne módosítsd; ez köti a sort a dolgozóhoz.'],
    [`Tervezési időszak: ${M.dotted(p.period.from)} – ${M.dotted(p.period.to)}`],
  ]);
  help['!cols'] = [{ wch: 100 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Szabadságok');
  XLSX.utils.book_append_sheet(wb, help, 'Útmutató');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellDates: true });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `szabadsag-sablon-${p.period.from.slice(0, 4)}.xlsx`);
}
const D = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

// ---------- Generálás ----------
function conflictHtml(conflicts) {
  const short = conflicts.filter((c) => c.type === 'shortage');
  const locks = conflicts.filter((c) => c.type === 'lock_absent');
  const none = conflicts.filter((c) => c.type === 'no_staff');
  return `<div class="ny-card bad"><b>Nem készíthető érvényes beosztás.</b> A szabadságok és a rögzített cellák mellett az alábbi napokon nem jön ki a minimumlétszám. A programnak nem dolga eldönteni, kinek kell módosítania a szabadságát: egyeztessetek, módosítsátok a távolléteket (vagy a létszámigényt), és generáld újra.</div>
    ${none.map((c) => `<div class="ny-conf"><b>${esc(c.role)}</b>: nincs bevont dolgozó, de a létszámigény nem nulla.</div>`).join('')}
    ${locks.map((c) => `<div class="ny-conf"><b>${M.dotted(c.date)} · ${esc(c.worker)}</b>: kézzel rögzített ${M.SHIFT_LABEL[c.shift].toLowerCase()} műszak, de távollét van erre a napra. Oldd fel a rögzítést vagy módosítsd a távollétet.</div>`).join('')}
    ${short.length ? `<div class="ny-scroll"><table class="ny-tbl"><thead><tr><th>Dátum</th><th>Műszak</th><th>Munkakör</th><th>Szükséges</th><th>Rendelkezésre áll</th><th>Hiány</th><th>Távollévők (ütköző távollét)</th></tr></thead><tbody>
      ${short.map((c) => `<tr><td>${M.dotted(c.date)}<br><small>${M.WEEKDAY_SHORT[M.dowOf(c.date)]}</small></td><td>${c.shifts.map((s) => M.SHIFT_LABEL[s]).join(', ')}</td><td>${esc(c.role)}</td><td>DE ${c.required.DE} + DU ${c.required.DU}</td><td>${c.available} fő</td><td class="ny-red"><b>${c.missing} fő</b></td>
        <td>${c.absent.map((a) => `${esc(a.name)} <small>(${a.kind ? M.ABSENCE_KINDS[a.kind].toLowerCase() : 'távol'}${a.from ? ` ${M.shortHu(a.from)}–${M.shortHu(a.to)}` : ''}${a.status ? ', ' + M.ABSENCE_STATUS[a.status].toLowerCase() : ''})</small>`).join('<br>') || '–'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
}
function altMetricsHtml(a, best) {
  const m = a.metrics;
  const cls = (k, better) => (best && best[k] === m[k] && better ? 'best' : '');
  return `<dl class="ny-met">
    <div class="${cls('fullBlockRate', true)}"><dt>Teljes heti blokk</dt><dd>${m.fullBlockRate}%</dd></div>
    <div class="${cls('shiftChanges', true)}"><dt>Műszakváltás a héten belül</dt><dd>${m.shiftChanges}</dd></div>
    <div class="${cls('maxSpread', true)}"><dt>Napszám-szórás (max. – min.)</dt><dd>${m.maxSpread} nap</dd></div>
    <div class="${cls('isolated', true)}"><dt>Elszigetelt (1–2 napos) munkanap</dt><dd>${m.isolated}</dd></div>
    <div class="${cls('surplusPersons', true)}"><dt>Többlet (fő × műszak)</dt><dd>${m.surplusPersons}</dd></div>
    ${m.diffFirst != null ? `<div><dt>Eltérés az 1. változattól</dt><dd>${m.diffFirst}%</dd></div>` : ''}</dl>`;
}
function tabGenerate(el) {
  const p = st.plan;
  const conflicts = M.precheck(p, st.cal, st.abs, p.locks);
  const alts = p.alternatives.filter((a) => a.grid);
  const best = alts.length ? {
    fullBlockRate: Math.max(...alts.map((a) => a.metrics.fullBlockRate)), shiftChanges: Math.min(...alts.map((a) => a.metrics.shiftChanges)),
    maxSpread: Math.min(...alts.map((a) => a.metrics.maxSpread)), isolated: Math.min(...alts.map((a) => a.metrics.isolated)), surplusPersons: Math.min(...alts.map((a) => a.metrics.surplusPersons)) } : null;
  const nLocks = Object.keys(p.locks).length;
  el.innerHTML = `
    ${conflicts.length ? conflictHtml(conflicts) : `<div class="ny-card ok">A minimumlétszám minden munkanapon biztosítható a megadott távollétek mellett.</div>`}
    <section class="field">
      <button class="btn" id="gen" type="button" ${conflicts.length || st.running ? 'disabled' : ''}>${st.running ? 'Számolás…' : `${p.settings.alternatives} változat generálása`}</button>
      <div id="gprog" class="tabs-note">${st.running && st.progress ? esc(st.progress) : ''}</div>
      <p class="tabs-note">Kötelező: minimumlétszám, távollétek, egy műszak naponta, saját munkakör${nLocks ? `, és a(z) <b>${nLocks} kézzel rögzített cella</b>` : ''}. Utána, fontossági sorrendben: ötnapos (hétfő–péntek) blokkok, azonos műszak a héten, a munkanapok arányos elosztása, kevés elszigetelt nap. Néhány tíz másodperc is lehet.</p></section>
    ${stale() ? '<div class="ny-card warn">A változatok elkészülte óta megváltoztak a bemenetek (időszak, létszám, dolgozók vagy távollétek). Érdemes újragenerálni.</div>' : ''}
    ${p.alternatives.map((a, i) => a.grid ? `<article class="ny-alt ${p.selected === a.id ? 'sel' : ''}">
      <header><b>${i + 1}. ${esc(a.label)}</b>${p.selected === a.id ? '<span class="ny-badge ok">kiválasztva</span>' : ''}</header>
      <p class="tabs-note">${esc(a.desc)}</p>${altMetricsHtml(a, best)}
      ${a.notes?.length ? `<details><summary class="tabs-note">Megjegyzések (${a.notes.length})</summary><ul class="ny-issues">${a.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>` : ''}
      <div class="ny-btns"><button class="btn small" data-pick="${esc(a.id)}" type="button">${p.selected === a.id ? 'Újra betöltés' : 'Ezt választom'}</button><a class="btn ghost small" href="${BASE}/${st.id}?t=beosztas&alt=${esc(a.id)}">Megnézem</a></div></article>`
      : `<article class="ny-alt"><b>${i + 1}. ${esc(PROFILES[a.profile]?.label || '')}</b><p class="ny-red">Nem sikerült: ${esc((a.notes || []).join('; '))}</p></article>`).join('')}`;
  $('gen').onclick = () => runGenerate(el);
  el.querySelectorAll('[data-pick]').forEach((b) => (b.onclick = () => pickAlt(b.dataset.pick)));
}
function pickAlt(id) {
  const p = st.plan;
  const a = p.alternatives.find((x) => x.id === id);
  if (!a) return;
  if (p.schedule && p.schedule.manual && p.selected && !confirm('A jelenlegi beosztás helyére ez a változat kerül. A kézzel rögzített cellák megmaradnak (a generálás is figyelembe vette őket). Folytatod?')) return;
  const grid = structuredClone(a.grid);
  for (const [k, v] of Object.entries(p.locks)) { const [w, d] = k.split('|'); M.setCell(grid, Number(w), d, v); }
  p.schedule = { grid, base: a.id, manual: 0, picked_at: new Date().toISOString() };
  p.selected = a.id;
  changed();
  location.hash = `${BASE}/${st.id}?t=beosztas`;
}

async function runGenerate(el) {
  const p = st.plan;
  if (st.running) return;
  st.running = true;
  const t0 = Date.now();
  const btn = $('gen'); if (btn) { btn.disabled = true; btn.textContent = 'Számolás…'; }
  const profiles = profileList(p.settings.alternatives);
  const problems = p.roles.map((role) => M.roleProblem(p, st.cal, st.abs, role, p.locks));
  const prog = problems.map(() => 0);
  const show = () => { st.progress = `${problems.map((pr, i) => `${pr.role.label}: ${Math.min(prog[i], profiles.length)}/${profiles.length}`).join(' · ')} · ${Math.round((Date.now() - t0) / 1000)} mp`; const g = $('gprog'); if (g) g.textContent = st.progress; };
  const tick = setInterval(show, 1000); show();
  try {
    const perRole = await Promise.all(problems.map((pr, i) => solveInWorker(pr, profiles, (ai) => { prog[i] = ai; show(); }).then((r) => { prog[i] = profiles.length; show(); return r; })));
    const alts = combine(profiles, perRole).map((a) => ({ ...a, id: M.uid(), created_at: new Date().toISOString() }));
    const first = alts.find((a) => a.grid);
    for (const a of alts) if (a.grid) {
      const v = M.validate(p, st.cal, st.abs, { grid: a.grid });
      const { perWorker, perRole: pr2, ...m } = v.metrics;
      a.metrics = m; a.valid = v.errors.length === 0;
      if (a !== first) a.metrics.diffFirst = M.gridDiff(first.grid, a.grid);
    }
    p.alternatives = alts;
    p.gen_fp = M.fingerprint(p, st.holidays);
    changed();
    C.toast(`${alts.filter((a) => a.grid).length} változat elkészült (${Math.round((Date.now() - t0) / 1000)} mp)`);
  } catch (e) {
    C.toast(`A generálás nem sikerült: ${errMsg(e)}`);
  } finally {
    clearInterval(tick); st.running = false; st.progress = null;
    if (location.hash.includes('t=generalas')) rerenderTab();
  }
}
function solveInWorker(pr, profiles, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker('/nyar/solver-worker.js', { type: 'module' }); } catch (e) { return solveHere(pr, profiles, onProgress).then(resolve, reject); }
    const id = M.uid();
    w.onmessage = (e) => {
      const d = e.data; if (d.id !== id) return;
      if (d.progress != null) onProgress(d.progress);
      if (d.done) { w.terminate(); resolve(d.done); }
      if (d.error) { w.terminate(); reject(new Error(d.error)); }
    };
    w.onerror = (e) => { w.terminate(); e.preventDefault?.(); solveHere(pr, profiles, onProgress).then(resolve, reject); };
    w.postMessage({ id, pr, profiles, timeLimit: 10 });
  });
}
// Tartalék: ha a böngésző nem indít modul-workert, a fő szálon számol (a felület addig lassabb)
async function solveHere(pr, profiles, onProgress) {
  const [{ default: loadHighs }, { generateRoleAlternatives }] = await Promise.all([import('./vendor/highs.mjs'), import('./solver.js')]);
  let h = null;
  const get = async (force) => (h && !force ? h : (h = await loadHighs({ locateFile: (f) => '/nyar/vendor/' + f })));
  return generateRoleAlternatives(get, pr, profiles, { onProgress, timeLimit: 10 });
}

// ---------- Beosztás (rács + kézi szerkesztés) ----------
function cellView(p, wid, day, code) {
  const s = p.settings;
  const a = st.abs.get(wid)?.get(day.date);
  if (!day.work) {
    if (day.weekend) return { cls: 'we', bg: s.colors.hetvege, t: a ? '' : s.abbr.hetvege };
    return { cls: 'cl', bg: s.colors.zarva, t: s.abbr.zarva };
  }
  if (code && a) return { cls: 'err', bg: s.colors[code], t: s.abbr[code] };
  if (a) return { cls: 'ab', bg: s.colors[a.kind], t: s.abbr[a.kind] };
  if (code) return { cls: code.toLowerCase(), bg: s.colors[code], t: s.abbr[code] };
  return { cls: 'pi', bg: s.colors.piheno, t: s.abbr.piheno };
}
function gridHtml(p, grid, month, { editable, counts }) {
  const days = month.days;
  const cnt = (gid, d, sh) => counts?.[`${d}|${sh}|${gid}`];
  return `<div class="ny-gridwrap"><table class="ny-grid"><thead><tr><th class="nm">Dolgozó</th>${days.map((d) => `<th class="${d.work ? '' : d.weekend ? 'we' : 'cl'}" title="${d.off ? esc(d.off) : ''}"><span>${Number(d.date.slice(8))}</span><small>${M.WEEKDAY_SHORT[d.dow]}</small></th>`).join('')}</tr></thead>
    <tbody>${M.staffByRole(p).map(({ role, workers }) => `<tr class="grp"><th class="nm" colspan="${days.length + 1}">${esc(role.label)}</th></tr>
      ${workers.map((w) => `<tr><th class="nm">${esc(w.name)}</th>${days.map((d) => {
        const code = grid?.[w.id]?.[d.date] || null;
        const v = cellView(p, w.id, d, code);
        const lk = p.locks[M.lockKey(w.id, d.date)];
        return `<td class="${v.cls}${lk ? ' lk' : ''}" style="background:${esc(v.bg)}" ${editable && d.work ? `data-w="${w.id}" data-d="${d.date}" tabindex="0" role="button" aria-label="${esc(w.name)}, ${M.dotted(d.date)}: ${v.t || 'pihenő'}"` : ''}>${esc(v.t)}</td>`;
      }).join('')}</tr>`).join('')}
      ${counts ? M.SHIFTS.map((sh) => `<tr class="cnt"><th class="nm">${sh === 'DE' ? 'Délelőtt' : 'Délután'} (min. ${role.min[sh]})</th>${days.map((d) => {
        if (!d.work) return '<td class="we"></td>';
        const n = cnt(role.group_id, d.date, sh); const opt = role.opt[sh];
        const ap = p.approvals[M.approvalKey(d.date, sh, role.group_id)];
        return `<td class="${n < role.min[sh] ? 'short' : n > opt ? (ap ? 'apr' : 'over') : ''}">${n}</td>`;
      }).join('')}</tr>`).join('') : ''}`).join('')}</tbody></table></div>`;
}
function legendHtml(p) {
  const s = p.settings;
  return `<div class="ny-legend">${Object.keys(CODE_LABEL).map((k) => `<span><i class="ny-sw" style="background:${esc(s.colors[k])}">${esc(s.abbr[k])}</i>${CODE_LABEL[k]}</span>`).join('')}<span><i class="ny-sw lkdemo"></i>Kézzel rögzített</span></div>`;
}
function tabSchedule(el, q) {
  const p = st.plan;
  const altId = q.get('alt');
  const alt = altId ? p.alternatives.find((a) => a.id === altId) : null;
  const months = st.cal.months;
  const mk = months.some((m) => m.key === q.get('m')) ? q.get('m') : months[0]?.key;
  const month = months.find((m) => m.key === mk);
  if (!month) { el.innerHTML = '<p class="empty">Nincs nap a tervezési időszakban.</p>'; return; }
  const link = (m) => `${BASE}/${st.id}?t=beosztas&m=${m}${altId ? `&alt=${encodeURIComponent(altId)}` : ''}`;
  const chips = `<div class="ny-chips">${months.map((m) => `<a href="${link(m.key)}" class="${m.key === mk ? 'on' : ''}">${M.MONTH_NAMES[Number(m.key.slice(5)) - 1]}</a>`).join('')}</div>`;
  if (alt) {
    const v = M.validate(p, st.cal, st.abs, { grid: alt.grid });
    el.innerHTML = `<div class="ny-card">Előnézet: <b>${esc(alt.label)}</b> (csak megtekintés). <button class="btn small" id="pk" type="button">Ezt választom</button> <a class="btn ghost small" href="${BASE}/${st.id}?t=generalas">Vissza</a></div>
      ${chips}${gridHtml(p, alt.grid, month, { editable: false, counts: v.counts })}${legendHtml(p)}`;
    $('pk').onclick = () => pickAlt(alt.id);
    return;
  }
  if (!p.schedule) {
    el.innerHTML = `<div class="ny-card">Még nincs kiválasztott beosztás. <a href="${BASE}/${st.id}?t=generalas">Generálj változatokat</a>, majd válaszd ki a legmegfelelőbbet.</div>
      <button class="btn ghost small" id="empty" type="button">Vagy: üres beosztás indítása kézi kitöltéshez</button>`;
    $('empty').onclick = () => { p.schedule = { grid: {}, base: null, manual: 0 }; for (const [k, v] of Object.entries(p.locks)) { const [w, d] = k.split('|'); M.setCell(p.schedule.grid, Number(w), d, v); } changed({ rerender: rerenderTab }); };
    return;
  }
  const v = st.val;
  const nLocks = Object.keys(p.locks).length;
  el.innerHTML = `
    <div class="ny-status ${v.ok ? 'ok' : 'bad'}"><b>${v.ok ? '✓ Érvényes beosztás' : `✗ ${v.errors.length} hiba`}</b>
      <span>${v.warnings.length ? `${v.warnings.length} jóvá nem hagyott többlet` : 'nincs jóváhagyásra váró többlet'}</span><a href="${BASE}/${st.id}?t=ellenorzes">Részletek</a></div>
    ${chips}
    <p class="tabs-note ny-hint">Koppints egy cellára a módosításhoz. A módosított cella rögzített (●): újrageneráláskor is megmarad.</p>
    ${gridHtml(p, p.schedule.grid, month, { editable: true, counts: v.counts })}
    ${legendHtml(p)}
    ${nLocks ? `<button class="btn ghost small" id="unl" type="button" style="margin-top:10px">Összes rögzítés feloldása (${nLocks})</button>` : ''}`;
  el.querySelector('.ny-grid').addEventListener('click', (e) => { const td = e.target.closest('td[data-w]'); if (td) openCell(Number(td.dataset.w), td.dataset.d); });
  el.querySelector('.ny-grid').addEventListener('keydown', (e) => { if (e.key !== 'Enter' && e.key !== ' ') return; const td = e.target.closest('td[data-w]'); if (td) { e.preventDefault(); openCell(Number(td.dataset.w), td.dataset.d); } });
  if ($('unl')) $('unl').onclick = () => { if (!confirm('Feloldod az összes kézi rögzítést? A beosztás nem változik, de a következő generálás már szabadon módosíthatja ezeket a cellákat.')) return; p.locks = {}; changed({ rerender: rerenderTab }); };
}
function openCell(wid, date) {
  const p = st.plan;
  const w = p.staff.find((s) => s.id === wid);
  const role = p.roles.find((r) => r.group_id === w.group_id);
  const cur = p.schedule.grid[wid]?.[date] || 'P';
  const key = M.lockKey(wid, date);
  const a = st.abs.get(wid)?.get(date);
  const mates = M.staffByRole(p).find((g) => g.role.group_id === w.group_id).workers.filter((x) => x.id !== wid && !M.isAbsent(st.abs, x.id, date));
  const valOf = (id) => p.schedule.grid[id]?.[date] || 'P';
  const lbl = { DE: 'Délelőtt', DU: 'Délután', P: 'Pihenőnap' };
  const dlg = document.createElement('div');
  dlg.className = 'ny-sheet';
  dlg.innerHTML = `<div class="ny-sheet-in" role="dialog" aria-modal="true" aria-labelledby="nyst">
    <h3 id="nyst">${esc(w.name)}</h3><p class="tabs-note">${M.dotted(date)}, ${['vasárnap', 'hétfő', 'kedd', 'szerda', 'csütörtök', 'péntek', 'szombat'][M.dowOf(date)]} · ${esc(role?.label || '')}</p>
    ${a ? `<div class="ny-card bad">${M.ABSENCE_KINDS[a.kind]}: ${M.dotted(a.from)} – ${M.dotted(a.to)}. Erre a napra nem osztható be; ha mégis, az hibaként jelenik meg.</div>` : ''}
    <div class="seg ny-seg3">${['DE', 'DU', 'P'].map((c) => `<button type="button" data-set="${c}" aria-pressed="${cur === c}">${lbl[c]}</button>`).join('')}</div>
    ${p.locks[key] ? '<button class="btn ghost small" type="button" id="cunl" style="margin-top:10px">Rögzítés feloldása (érték marad)</button>' : ''}
    ${mates.length ? `<div class="field"><label for="cswap">Csere egy kolléganővel ezen a napon</label><div class="row"><select class="input" id="cswap">${mates.map((m) => `<option value="${m.id}">${esc(m.name)} – ${lbl[valOf(m.id)]}</option>`).join('')}</select><button class="btn small" type="button" id="cswb">Csere</button></div></div>` : ''}
    <button class="btn ghost" type="button" id="ccl">Bezárás</button></div>`;
  document.body.append(dlg);
  const close = () => { dlg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  const setVal = (id, v) => { M.setCell(p.schedule.grid, id, date, v); p.locks[M.lockKey(id, date)] = v; p.schedule.manual = (p.schedule.manual || 0) + 1; };
  dlg.querySelectorAll('[data-set]').forEach((b) => (b.onclick = () => {
    if (a && b.dataset.set !== 'P' && !confirm(`${w.name} erre a napra távollétet jelzett. Mégis beosztod?`)) return;
    setVal(wid, b.dataset.set); close(); changed({ rerender: rerenderTab });
  }));
  if (dlg.querySelector('#cunl')) dlg.querySelector('#cunl').onclick = () => { delete p.locks[key]; close(); changed({ rerender: rerenderTab }); };
  if (dlg.querySelector('#cswb')) dlg.querySelector('#cswb').onclick = () => {
    const other = Number(dlg.querySelector('#cswap').value);
    const mine = cur, theirs = valOf(other);
    if (a && theirs !== 'P') { C.toast('Távollét napján nem lehet beosztani.'); return; }
    setVal(wid, theirs); setVal(other, mine); close(); changed({ rerender: rerenderTab });
  };
  dlg.querySelector('[aria-pressed="true"]')?.focus();
}

// ---------- Ellenőrzés ----------
function tabCheck(el) {
  const p = st.plan;
  if (!p.schedule) { el.innerHTML = `<div class="ny-card">Még nincs kiválasztott beosztás. <a href="${BASE}/${st.id}?t=generalas">Generálás</a></div>`; return; }
  const v = st.val;
  const mw = v.metrics.perWorker;
  const byType = (t) => v.errors.filter((e) => e.type === t);
  const others = v.errors.filter((e) => !['shortage', 'absent'].includes(e.type));
  const suggest = (s) => {
    const cands = mw.filter((m) => s.names.includes(m.name)).sort((a, b) => (b.days - b.target) - (a.days - a.target));
    return cands.length ? `Lehetőség: ${esc(cands[0].name)} pihenőnapot kaphat (${cands[0].days - cands[0].target > 0 ? `+${Math.round((cands[0].days - cands[0].target) * 10) / 10} nap a cél fölött` : 'a cél körül'}), vagy szabadságot vehet ki. A program nem módosít magától.` : '';
  };
  el.innerHTML = `
    <div class="ny-status ${v.ok ? 'ok' : 'bad'}"><b>${v.ok ? '✓ Érvényes beosztás' : `✗ ${v.errors.length} hiba – így nem végleges`}</b></div>
    ${byType('shortage').length ? `<section class="field"><span class="label">Létszámhiány (${byType('shortage').length})</span><div class="ny-scroll"><table class="ny-tbl"><thead><tr><th>Dátum</th><th>Műszak</th><th>Munkakör</th><th>Szükséges</th><th>Beosztva</th><th>Hiány</th><th>Beosztottak</th></tr></thead><tbody>
      ${byType('shortage').map((s) => `<tr><td>${M.dotted(s.date)}</td><td>${M.SHIFT_LABEL[s.shift]}</td><td>${esc(s.role)}</td><td>${s.required}</td><td>${s.assigned}</td><td class="ny-red"><b>${s.missing}</b></td><td>${s.names.map(esc).join(', ') || '–'}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
    ${byType('absent').length ? `<section class="field"><span class="label">Távollét napjára beosztva (${byType('absent').length})</span>${byType('absent').map((e) => `<div class="ny-conf">${esc(e.msg)}</div>`).join('')}</section>` : ''}
    ${others.length ? `<section class="field"><span class="label">Egyéb hiba</span>${others.map((e) => `<div class="ny-conf">${esc(e.msg)}</div>`).join('')}</section>` : ''}
    <section class="field"><span class="label">Létszámtöbblet (${v.surplus.length})</span>
      ${v.surplus.length ? v.surplus.map((s) => `<div class="ny-sur ${s.approved ? 'ok' : ''}">
        <div><b>${M.dotted(s.date)} · ${M.SHIFT_LABEL[s.shift]} · ${esc(s.role)}</b><small>Tervezett ${s.required} fő, beosztva ${s.assigned} fő (+${s.extra}): ${s.names.map(esc).join(', ')}</small>
        ${s.approved ? `<small>Jóváhagyva${s.note ? ': ' + esc(s.note) : ''}</small>` : `<small class="tabs-note">${suggest(s)}</small>`}</div>
        ${s.approved ? `<button class="btn ghost small" type="button" data-unap="${esc(s.key)}">Visszavonás</button>` : `<div class="row ny-apr"><input class="input" data-note="${esc(s.key)}" maxlength="120" placeholder="Indoklás (nem kötelező)"><button class="btn small" type="button" data-ap="${esc(s.key)}">Jóváhagyom</button></div>`}</div>`).join('') : '<p class="tabs-note">Nincs többlet.</p>'}
      ${v.staleApprovals.length ? `<p class="tabs-note">${v.staleApprovals.length} korábbi jóváhagyás már nem tartozik többlethez (a beosztás változott). <button class="btn ghost small" id="clst" type="button">Ezek törlése</button></p>` : ''}</section>
    <section class="field"><span class="label">Dolgozónként</span>
      <div class="ny-scroll"><table class="ny-tbl"><thead><tr><th>Dolgozó</th><th title="munkanapok a szabadság nélkül">Elérhető</th><th>Beosztva</th><th title="arányos cél az elérhető napok szerint">Cél</th><th>DE / DU</th><th title="teljes hetek / dolgozott hetek">Teljes hét</th><th>Műszakváltás</th><th title="1–2 napos szakasz">Elszigetelt</th></tr></thead><tbody>
      ${M.staffByRole(p).map(({ role, workers }) => `<tr class="grp"><th colspan="8">${esc(role.label)}</th></tr>${workers.map((w) => { const m = mw.find((x) => x.id === w.id) || {}; const d = Math.round((m.days - m.target) * 10) / 10;
        return `<tr><td>${esc(w.name)}</td><td>${m.available}</td><td><b>${m.days}</b></td><td>${m.target} <small class="${Math.abs(d) >= 3 ? 'ny-red' : ''}">(${d > 0 ? '+' : ''}${d})</small></td><td>${m.de} / ${m.du}</td><td>${m.fullWeeks} / ${m.weeks}</td><td class="${m.shiftChanges ? 'ny-warn' : ''}">${m.shiftChanges}</td><td class="${m.isolated ? 'ny-warn' : ''}">${m.isolated}</td></tr>`; }).join('')}`).join('')}
      </tbody></table></div>
      <p class="tabs-note">Teljes heti blokk: ${v.metrics.fullBlockRate}% · műszakváltás: ${v.metrics.shiftChanges} · elszigetelt nap: ${v.metrics.isolated}. A plusz-mínusz órákat ez az alkalmazás nem kezeli.</p></section>`;
  el.querySelectorAll('[data-ap]').forEach((b) => (b.onclick = () => { const k = b.dataset.ap; p.approvals[k] = { note: el.querySelector(`[data-note="${CSS.escape(k)}"]`).value.trim(), at: new Date().toISOString() }; changed({ rerender: rerenderTab }); }));
  el.querySelectorAll('[data-unap]').forEach((b) => (b.onclick = () => { delete p.approvals[b.dataset.unap]; changed({ rerender: rerenderTab }); }));
  if ($('clst')) $('clst').onclick = () => { for (const k of v.staleApprovals) delete p.approvals[k]; changed({ rerender: rerenderTab }); };
}

// ---------- Nyomtatás ----------
function tabPrint(el) {
  const p = st.plan;
  if (!p.schedule) { el.innerHTML = `<div class="ny-card">Előbb válassz ki egy beosztást a <a href="${BASE}/${st.id}?t=generalas">Generálás</a> fülön.</div>`; return; }
  const v = st.val;
  el.innerHTML = `
    ${v.ok ? '' : `<div class="ny-card bad">A beosztás jelenleg <b>nem érvényes</b> (${v.errors.length} hiba). A PDF elkészíthető, de a lapon „NEM VÉGLEGES” jelzés lesz. <a href="${BASE}/${st.id}?t=ellenorzes">Hibák</a></div>`}
    ${v.warnings.length ? `<div class="ny-card warn">${v.warnings.length} többlet nincs jóváhagyva. A PDF-en minden beosztott dolgozó szerepel.</div>` : ''}
    <section class="field"><span class="label">A3 fekvő, havonta egy oldal</span>
      <button class="btn" id="pall" type="button">PDF letöltése (${st.cal.months.length} oldal)</button>
      <div class="ny-btns">${st.cal.months.map((m) => `<button class="btn ghost small" type="button" data-pm="${m.key}">${M.MONTH_NAMES[Number(m.key.slice(5)) - 1]}</button>`).join('')}</div>
      <p class="tabs-note">Margó: ${p.settings.report.margin_mm} mm · ${p.settings.report.show_counts ? 'napi létszám sorral' : 'létszám sor nélkül'}. A színek, rövidítések és a margó a Beállításokban módosíthatók. Nyomtatáskor válaszd az A3 papírt és a „tényleges méret” (100%) beállítást.</p></section>`;
  const go = async (months, btn) => {
    btn.disabled = true; const t = btn.textContent; btn.textContent = 'Készül…';
    try {
      const { makePdf } = await import('./pdf.js');
      const bytes = await makePdf(p, st.cal, st.abs, v, months);
      download(new Blob([bytes], { type: 'application/pdf' }), `${slug(p.name)}${months.length === 1 ? '-' + months[0] : ''}.pdf`);
    } catch (e) { console.error(e); C.toast(`A PDF nem készült el: ${errMsg(e)}`); }
    btn.disabled = false; btn.textContent = t;
  };
  $('pall').onclick = (e) => go(st.cal.months.map((m) => m.key), e.currentTarget);
  el.querySelectorAll('[data-pm]').forEach((b) => (b.onclick = () => go([b.dataset.pm], b)));
}

// ---------------- segédek ----------------
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
const errMsg = (e) => String(e?.message || e || 'ismeretlen hiba');
const slug = (s) => M.norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'nyari-beosztas';
const backIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
