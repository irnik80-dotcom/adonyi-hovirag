// Nyári beosztás – a specifikáció 16. pontjának tesztesetei, mesterséges adatokkal.
// Futtatás: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import loadHighs from 'highs';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { makePlan, HOLIDAYS_2027, GROUPS, makeWorkers } from './fixtures.js';
import * as M from '../public/nyar/model.js';
import { generateAlternatives, solveRole } from '../public/nyar/solver.js';
import { makePdf } from '../public/nyar/pdf.js';

let highs;
const getHighs = async (force) => (highs && !force ? highs : (highs = await loadHighs()));
const TL = 4; // másodperc / megoldás a tesztekben
const ctx = (plan) => { plan.locks ||= {}; const cal = M.buildCalendar(plan, HOLIDAYS_2027); return { cal, abs: M.expandAbsences(plan) }; };
const abs = (worker_id, from, to, kind = 'szabadsag') => ({ id: M.uid(), worker_id, from, to, kind, status: 'jovahagyott', note: '', source: 'import' });
const roleOf = (plan, wid) => plan.staff.find((s) => s.id === wid).group_id;

// Közös, szabadságokkal terhelt eset (egyszer generálva, több teszt használja)
const loaded = (async () => {
  const plan = makePlan();
  plan.absences.push(
    abs(100, '2027-07-05', '2027-07-16'),           // pedagógus: két hét
    abs(101, '2027-07-07', '2027-07-08'),           // pedagógus: két nap (szerda–csütörtök)
    abs(104, '2027-06-25', '2027-06-25'),           // pedagógus: egy nap (péntek)
    abs(112, '2027-08-02', '2027-08-13'),           // asszisztens: két hét
    abs(117, '2027-07-19', '2027-07-30'),           // dajka: két hét
    abs(118, '2027-08-11', '2027-08-11', 'egyeb'),  // dajka: egynapos továbbképzés
  );
  const { cal, abs: am } = ctx(plan);
  const alts = await generateAlternatives(getHighs, plan, cal, am, { count: 3, timeLimit: TL });
  return { plan, cal, am, alts };
})();

test('naptár: hétvége és augusztus 20. nem munkanap, a hetek hétfőn kezdődnek', () => {
  const plan = makePlan();
  const { cal } = ctx(plan);
  assert.equal(plan.period.from, '2027-06-21');
  assert.equal(plan.period.to, '2027-08-27');
  assert.equal(cal.days.length, 68);
  assert.equal(cal.workdays.length, 49); // 10 hét × 5 nap − augusztus 20.
  assert.ok(!cal.workdays.includes('2027-08-20'));
  assert.ok(cal.workdays.every((d) => ![0, 6].includes(M.dowOf(d))));
  assert.ok(cal.days.some((d) => d.weekend) && cal.days.filter((d) => d.weekend).every((d) => !d.work));
  assert.ok(cal.weeks.every((w) => M.dowOf(w.key) === 1));
  assert.deepEqual(cal.months.map((m) => m.key), ['2027-06', '2027-07', '2027-08']);
  assert.equal(cal.months[0].days[0].date, '2027-06-21');
  assert.equal(cal.months[2].days.at(-1).date, '2027-08-27');
});

test('a fő app munkakörei alapján jönnek létre a munkakörök, az „Egyéb” csoport kimarad', () => {
  const plan = makePlan();
  assert.deepEqual(plan.roles.map((r) => r.label), ['Óvodapedagógus', 'Pedagógiai asszisztens', 'Dajka']);
  assert.deepEqual(plan.roles.map((r) => Boolean(r.single)), [false, true, false]);
  assert.deepEqual(plan.roles.map((r) => M.shiftsOf(r).map((s) => r.min[s])), [[2, 1], [3], [2, 2]]);
  assert.equal(plan.staff.length, 23);
  assert.ok(!plan.staff.some((s) => s.name === 'Karbantartó'));
});

test('1. normál eset: érvényes beosztás, nincs ütközés', async () => {
  const plan = makePlan();
  const { cal, abs: am } = ctx(plan);
  assert.equal(M.precheck(plan, cal, am).length, 0);
  const [a] = await generateAlternatives(getHighs, plan, cal, am, { count: 1, timeLimit: TL });
  const v = M.validate(plan, cal, am, { grid: a.grid });
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 3)));
  assert.equal(v.metrics.fullBlockRate, 100);
});

test('2. szabadságokkal terhelt eset: senki nincs beosztva a távolléte napjára', async () => {
  const { plan, cal, am, alts } = await loaded;
  for (const a of alts) {
    assert.ok(a.grid, a.notes.join());
    for (const ab of plan.absences) for (const d of M.eachDate(ab.from, ab.to)) assert.equal(a.grid[ab.worker_id]?.[d], undefined, `${ab.worker_id} ${d}`);
    assert.equal(M.validate(plan, cal, am, { grid: a.grid }).errors.length, 0);
  }
});

test('3. egy-két napos szabadság: csak azok a napok esnek ki, a hét többi napja beosztható', async () => {
  const { plan, cal, am } = await loaded;
  const m = am.get(101);
  assert.deepEqual([...m.keys()], ['2027-07-07', '2027-07-08']);
  assert.equal(am.get(104).size, 1);
  // a 101-es dolgozó: ha az adott héten dolgozik, a megmaradt 3 napja teljes blokknak számít
  const pr = M.roleProblem(plan, cal, am, plan.roles[0]);
  assert.equal(pr.avail.get(101).size, 47);
  const w = cal.weeks.find((x) => x.key === '2027-07-05').days.filter((d) => pr.avail.get(101).has(d));
  assert.deepEqual(w, ['2027-07-05', '2027-07-06', '2027-07-09']);
  // egynapos távollét a CSV-importból
  const rows = M.parseCSV('Dolgozóazonosító;Dolgozó neve;Szabadság kezdete;Szabadság vége\n104;Pedagógus 05;2027.06.25.;2027.06.25.');
  const r = M.parseAbsenceRows(rows, plan);
  assert.equal(r.records.length, 1);
  assert.equal(r.records[0].from, '2027-06-25');
  assert.equal(r.records[0].to, '2027-06-25');
});

test('4. létszámhiány: nincs érvényesnek látszó beosztás, részletes konfliktusjelentés készül', async () => {
  const plan = makePlan();
  // 5 dajka (115–119) ugyanazon a héten szabadságon → csak 3 marad a szükséges 2+2 helyett
  for (const id of [115, 116, 117, 118, 119]) plan.absences.push(abs(id, '2027-07-12', '2027-07-16'));
  const { cal, abs: am } = ctx(plan);
  const c = M.precheck(plan, cal, am).filter((x) => x.type === 'shortage');
  assert.equal(c.length, 5);
  const first = c[0];
  assert.equal(first.date, '2027-07-12');
  assert.equal(first.role, 'Dajka');
  assert.deepEqual(first.required, { DE: 2, DU: 2 });
  assert.equal(first.available, 3);
  assert.equal(first.missing, 1);
  assert.deepEqual(first.shifts, ['DU']);
  assert.equal(first.absent.length, 5);
  assert.ok(first.absent.every((a) => a.kind === 'szabadsag' && a.from === '2027-07-12' && a.to === '2027-07-16'));
  // a megoldó maga is megvalósíthatatlannak jelzi, tehát nem ad vissza beosztást
  const pr = M.roleProblem(plan, cal, am, plan.roles[2]);
  const r = solveRole(await getHighs(), pr, { opt: 1, block: 1, shift: 1, fair: 1, fairMax: 1, run: 1, surplus: 1 }, { timeLimit: TL });
  assert.equal(r.status, 'infeasible');
  assert.equal(r.grid, undefined);
});

test('5. létszámtöbblet: megjelenik a többlet és az érintett dolgozók neve', async () => {
  const { plan, cal, am, alts } = await loaded;
  const p = structuredClone(plan); p.schedule = { grid: structuredClone(alts[0].grid) };
  const d = '2027-06-22';
  const free = p.staff.filter((s) => s.group_id === 2 && !p.schedule.grid[s.id]?.[d]);
  assert.ok(free.length > 0);
  for (const s of free) M.setCell(p.schedule.grid, s.id, d, 'D');
  const v = M.validate(p, cal, am, p.schedule);
  const sur = v.surplus.find((s) => s.date === d && s.shift === 'D' && s.group_id === 2);
  assert.ok(sur);
  assert.equal(sur.required, 3);
  assert.equal(sur.assigned, 3 + free.length);
  assert.equal(sur.extra, free.length);
  for (const s of free) assert.ok(sur.names.includes(s.name));
  assert.ok(v.warnings.some((w) => w.type === 'surplus'));
  assert.equal(v.ok, true, 'a többlet önmagában nem hiba');
});

test('6. jóváhagyott többlet: mentés (JSON) után is megmarad', async () => {
  const { plan, cal, am, alts } = await loaded;
  const p = structuredClone(plan); p.schedule = { grid: structuredClone(alts[0].grid) };
  const d = '2027-06-23';
  const extra = p.staff.find((s) => s.group_id === 3 && !p.schedule.grid[s.id]?.[d]);
  M.setCell(p.schedule.grid, extra.id, d, 'DU');
  const key = M.approvalKey(d, 'DU', 3);
  p.approvals[key] = { note: 'udvarrendezés', at: new Date().toISOString() };
  const saved = M.normalizePlan(JSON.parse(JSON.stringify(p)));
  const v = M.validate(saved, cal, am, saved.schedule);
  const sur = v.surplus.find((s) => s.key === key);
  assert.equal(sur.approved, true);
  assert.equal(sur.note, 'udvarrendezés');
  assert.ok(!v.warnings.some((w) => w.key === key));
  assert.equal(saved.schedule.grid[extra.id][d], 'DU');
});

test('7. kézi módosítás: újraellenőrzés, és a rögzített cella újrageneráláskor is megmarad', async () => {
  const { plan, cal, am, alts } = await loaded;
  const p = structuredClone(plan); p.schedule = { grid: structuredClone(alts[0].grid) };
  // egy délelőttös pedagógust pihenőre teszünk → hiány
  const d = '2027-07-20';
  const de = p.staff.filter((s) => s.group_id === 1 && p.schedule.grid[s.id]?.[d] === 'DE');
  M.setCell(p.schedule.grid, de[0].id, d, null);
  let v = M.validate(p, cal, am, p.schedule);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => e.type === 'shortage' && e.date === d && e.shift === 'DE' && e.missing === 1));
  // szabadság napjára beosztás → hiba
  M.setCell(p.schedule.grid, 100, '2027-07-06', 'DU');
  v = M.validate(p, cal, am, p.schedule);
  assert.ok(v.errors.some((e) => e.type === 'absent' && e.worker_id === 100));
  // rögzítés: a 110-es pedagógus 07.21-én délután, 07.22-én pihenő → az új generálás ezt megtartja
  const locks = { [M.lockKey(110, '2027-07-21')]: 'DU', [M.lockKey(110, '2027-07-22')]: 'P' };
  const [a] = await generateAlternatives(getHighs, plan, cal, am, { count: 1, locks, timeLimit: TL });
  assert.equal(a.grid[110]['2027-07-21'], 'DU');
  assert.equal(a.grid[110]?.['2027-07-22'], undefined);
  assert.equal(M.validate(plan, cal, am, { grid: a.grid }).errors.length, 0);
  // rögzítés távollét napjára → ütközésként jelenik meg
  const c = M.precheck(plan, cal, am, { [M.lockKey(100, '2027-07-06')]: 'DE' });
  assert.ok(c.some((x) => x.type === 'lock_absent' && x.worker_id === 100));
});

test('8. műszak: egy munkablokkon belül azonos műszak', async () => {
  const { alts, plan, cal, am } = await loaded;
  const m = M.validate(plan, cal, am, { grid: alts[0].grid }).metrics;
  assert.equal(m.shiftChanges, 0);
  assert.ok(m.fullBlockRate >= 95, `teljes blokk arány: ${m.fullBlockRate}`);
});

test('9. munkaterhelés: munkakörön belül arányos (a szabadság miatt kevesebbet elérhető kevesebbet kap)', async () => {
  const { alts, plan, cal, am } = await loaded;
  const m = M.validate(plan, cal, am, { grid: alts[2].grid }).metrics; // „Egyenletes terhelés” változat
  for (const r of m.perRole) assert.ok(r.maxDev <= 5, `${r.role}: max. eltérés ${r.maxDev}`);
  const asz = m.perWorker.filter((w) => w.group_id === 2);
  const away = asz.find((w) => w.id === 112), others = asz.filter((w) => w.id !== 112);
  assert.ok(away.available < others[0].available);
  assert.ok(away.days < Math.min(...others.map((w) => w.days)), 'a két hetet távol lévő asszisztens kevesebb napot kap');
  // minden munkakörben teljesül a szükséges összes munkanap
  for (const role of plan.roles) {
    const sum = m.perWorker.filter((w) => w.group_id === role.group_id).reduce((a, w) => a + w.days, 0);
    assert.ok(sum >= cal.workdays.length * (role.min.DE + role.min.DU));
  }
});

test('10. több alternatíva: mind érvényes és érdemben eltérő', async () => {
  const { alts, plan, cal, am } = await loaded;
  assert.equal(alts.length, 3);
  assert.deepEqual(alts.map((a) => a.profile), ['ajanlott', 'blokk', 'egyenletes']);
  for (const a of alts) assert.equal(M.validate(plan, cal, am, { grid: a.grid }).errors.length, 0);
  for (let i = 0; i < alts.length; i++) for (let j = i + 1; j < alts.length; j++) {
    const d = M.gridDiff(alts[i].grid, alts[j].grid);
    assert.ok(d >= 10, `${i + 1}. és ${j + 1}. változat eltérése csak ${d}%`);
  }
});

test('11–12. havi A3 PDF: három oldal, minden dolgozó szerepel, a hétvége külön jelölt', async (t) => {
  const { plan, cal, am, alts } = await loaded;
  const p = structuredClone(plan);
  p.alternatives = [{ ...alts[0], id: 'x' }]; p.selected = 'x'; p.schedule = { grid: alts[0].grid };
  const v = M.validate(p, cal, am, p.schedule);
  const fonts = { reg: fs.readFileSync('public/nyar/vendor/DejaVuSansCondensed.ttf'), bold: fs.readFileSync('public/nyar/vendor/DejaVuSansCondensed-Bold.ttf') };
  const bytes = await makePdf(p, cal, am, v, cal.months.map((m) => m.key), { PDFDocument, rgb, fontkit, fonts });
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 3);
  for (const pg of doc.getPages()) {
    const { width, height } = pg.getSize();
    assert.ok(Math.abs(width - 1190.55) < 1 && Math.abs(height - 841.89) < 1, 'A3 fekvő');
  }
  let pdftotext = true;
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch { pdftotext = false; }
  if (!pdftotext) return t.skip('pdftotext nincs telepítve');
  const f = path.join(os.tmpdir(), `nyar-${process.pid}.pdf`);
  fs.writeFileSync(f, bytes);
  const pages = execFileSync('pdftotext', ['-layout', f, '-']).toString('utf8').split('\f');
  fs.unlinkSync(f);
  for (const [i, txt] of pages.slice(0, 3).entries()) {
    for (const s of p.staff.filter((x) => x.include)) assert.ok(txt.includes(s.name), `${i + 1}. oldal: hiányzik ${s.name}`);
    assert.ok(txt.includes('Óvodapedagógus') && txt.includes('Pedagógiai asszisztens') && txt.includes('Dajka'));
    assert.ok(txt.indexOf('Óvodapedagógus') < txt.indexOf('Pedagógiai asszisztens') && txt.indexOf('Pedagógiai asszisztens') < txt.indexOf('Dajka'), 'munkakörök sorrendje');
    assert.ok(txt.includes('Szo') && txt.includes('Hétvége') && txt.includes('Jelmagyarázat'));
  }
  assert.ok(pages[0].includes('június') && pages[1].includes('július') && pages[2].includes('augusztus'));
  assert.ok(pages[2].includes('Ünnepnap'));
});

test('import: hibás dátum, ismeretlen azonosító, hiányzó mező, duplikáció, fordított tartomány', () => {
  const plan = makePlan();
  const rows = [
    ['Dolgozóazonosító', 'Dolgozó neve', 'Szabadság kezdete', 'Szabadság vége', 'Státusz', 'Megjegyzés'],
    [100, 'Pedagógus 01', '2027.07.05', '2027.07.09', 'jóváhagyott', ''],
    [100, 'Pedagógus 01', '2027.07.05', '2027.07.09', 'jóváhagyott', ''], // duplikált
    [555, 'Valaki', '2027.07.05', '2027.07.09', '', ''],                // ismeretlen azonosító
    ['', 'Dajka 03', '2027-08-02', '', '', ''],                         // hiányzó záró dátum
    ['', 'Dajka 04', '2027.02.30', '2027.03.01', '', ''],               // nem létező dátum
    [101, '', '2027.07.20', '2027.07.10', '', ''],                      // fordított tartomány
    [102, '', new Date(2027, 6, 26), 46598, 'igényelt', 'Excel-dátumok'], // Date és sorszám (2027.07.30.)
    [103, 'Pedagógus 99', '2027. 06. 28.', '2027. 06. 28.', '', ''],    // név eltér az azonosítótól → figyelmeztetés
    [104, 'Pedagógus 05', '', '', '', ''],                              // kitöltetlen sablonsor: nem hiba
    ['', 'pedagogus 06', '2027.09.01', '2027.09.05', '', ''],           // ékezet nélküli név; időszakon kívül
  ];
  const r = M.parseAbsenceRows(rows, plan);
  const err = r.issues.filter((i) => i.level === 'error').map((i) => i.row);
  assert.deepEqual(err.sort((a, b) => a - b), [4, 5, 6, 7]);
  assert.ok(r.issues.some((i) => i.row === 3 && /már szerepel/.test(i.msg)));
  assert.ok(r.issues.some((i) => i.row === 9 && i.level === 'warning'));
  assert.ok(r.issues.some((i) => i.row === 11 && /kívül/.test(i.msg)));
  assert.deepEqual(r.records.map((x) => [x.worker_id, x.from, x.to]), [[100, '2027-07-05', '2027-07-09'], [102, '2027-07-26', '2027-07-30'], [103, '2027-06-28', '2027-06-28'], [105, '2027-09-01', '2027-09-05']]);
  assert.equal(r.records[0].status, 'jovahagyott');
  assert.equal(r.records[1].status, 'igenyelt');
  // névegyeztetés: kötőjel, pont, dupla szóköz nem számít
  const p2 = makePlan(); p2.staff.find((x) => x.id === 100).name = 'Kárászné Ihos Krisztina';
  const r2 = M.parseAbsenceRows([['Dolgozó neve', 'Szabadság kezdete', 'Szabadság vége'], ['Kárászné-Ihos  Krisztina', '2027.07.05', '2027.07.05']], p2);
  assert.equal(r2.records[0]?.worker_id, 100);
  // hiányzó oszlop
  const bad = M.parseAbsenceRows([['Név', 'Kezdete']], plan);
  assert.ok(bad.issues.some((i) => /Vége|vége/.test(i.msg)));
  // az import nem módosítja a dolgozói törzsadatokat
  assert.equal(plan.staff.find((s) => s.id === 103).name, 'Pedagógus 04');
});

test('dolgozólista szinkron: új, inaktív és törölt dolgozó kezelése, a beállítás megmarad', () => {
  const plan = makePlan();
  plan.staff.find((s) => s.id === 100).include = false;
  const ws = makeWorkers().filter((w) => w.id !== 101).map((w) => (w.id === 102 ? { ...w, active: 0 } : w));
  ws.push({ id: 500, name: 'Új Dajka', active: 1, group_ids: '3' });
  const s = M.syncStaff(plan.staff, plan.roles, ws);
  assert.equal(s.find((x) => x.id === 100).include, false);
  assert.equal(s.find((x) => x.id === 101).removed, true);
  assert.equal(s.find((x) => x.id === 102).include, false);
  assert.equal(s.find((x) => x.id === 500).include, true);
  assert.equal(roleOf({ staff: s }, 500), 3);
  assert.equal(GROUPS.length, 4);
});

test('beállítás: a létszámigény módosítható, a magasabb minimum hiányt okoz a régi beosztásban', async () => {
  const { plan, cal, am, alts } = await loaded;
  const p = structuredClone(plan);
  p.roles[2].min.DU = 3; p.roles[2].opt.DU = 3;
  const v = M.validate(p, cal, am, { grid: alts[0].grid });
  assert.ok(v.errors.filter((e) => e.type === 'shortage' && e.group_id === 3).length >= 40);
});

test('egy műszakos munkakör (pedagógiai asszisztens): csak napi „D” beosztás, régi terv átalakítása', async () => {
  const { alts, plan, cal, am } = await loaded;
  const asz = plan.staff.filter((x) => x.group_id === 2).map((x) => x.id);
  for (const a of alts) for (const id of asz) for (const v of Object.values(a.grid[id] || {})) assert.equal(v, 'D');
  const v = M.validate(plan, cal, am, { grid: alts[0].grid });
  for (const d of cal.workdays) assert.ok(v.counts[`${d}|D|2`] >= 3);
  assert.equal(v.counts[`${cal.workdays[0]}|DE|2`], undefined);
  // DE beírása egy egy műszakos dolgozónak → hiba
  const g = structuredClone(alts[0].grid); M.setCell(g, asz[0], '2027-06-21', 'DE');
  assert.ok(M.validate(plan, cal, am, { grid: g }).errors.some((e) => e.type === 'shift'));
  // régi (1-es) terv: az asszisztens DE/DU beosztása D lesz, a minimum összeadódik
  const old = makePlan();
  for (const r of old.roles) { delete r.single; delete r.min.D; delete r.opt.D; }
  old.roles[1].min = { DE: 2, DU: 1 }; old.roles[1].opt = { DE: 2, DU: 1 };
  old.schedule = { grid: { 111: { '2027-06-21': 'DE' }, 100: { '2027-06-21': 'DU' } } }; old.locks = { '112|2027-06-22': 'DU' };
  M.normalizePlan(old);
  assert.equal(old.roles[1].single, true); assert.equal(old.roles[1].min.D, 3);
  assert.equal(old.roles[0].single, false);
  assert.equal(old.schedule.grid[111]['2027-06-21'], 'D'); assert.equal(old.schedule.grid[100]['2027-06-21'], 'DU');
  assert.equal(old.locks['112|2027-06-22'], 'D');
});

test('összes változat egy PDF-ben: változatonként havi oldalak, a fejlécben a változat neve', async (t) => {
  const { plan, cal, am, alts } = await loaded;
  const fonts = { reg: fs.readFileSync('public/nyar/vendor/DejaVuSansCondensed.ttf'), bold: fs.readFileSync('public/nyar/vendor/DejaVuSansCondensed-Bold.ttf') };
  const sheets = alts.map((a, i) => ({ grid: a.grid, val: M.validate(plan, cal, am, { grid: a.grid }), label: `${i + 1}. ${a.label}`, sub: 'mutatók' }));
  const bytes = await makePdf(plan, cal, am, sheets[0].val, cal.months.map((m) => m.key), { PDFDocument, rgb, fontkit, fonts }, sheets);
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 9);
  try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); } catch { return t.skip('nincs pdftotext'); }
  const f = path.join(os.tmpdir(), `nyar-alt-${process.pid}.pdf`); fs.writeFileSync(f, bytes);
  const pages = execFileSync('pdftotext', ['-layout', f, '-']).toString('utf8').split('\f'); fs.unlinkSync(f);
  assert.ok(pages[0].includes('1. Ajánlott') && pages[3].includes('2. Erős blokkok') && pages[6].includes('3. Egyenletes terhelés'));
});

test('pihenőnap nélküli mód (alapértelmezés): aki nincs távol, dolgozik; heti azonos műszak; kiegyenlített DE/DU arány', async () => {
  assert.equal(M.newPlan(2027, GROUPS, makeWorkers()).mode, 'mindenki');
  const plan = makePlan({ mode: 'mindenki' });
  plan.absences.push(abs(100, '2027-07-05', '2027-07-16'), abs(101, '2027-07-07', '2027-07-08', 'beteg'), abs(115, '2027-08-02', '2027-08-04', 'pluszora'));
  plan.roles[0].opt = { DE: 3, DU: 2, D: 0 };
  const { cal, abs: am } = ctx(plan);
  const alts = await generateAlternatives(getHighs, plan, cal, am, { count: 3, timeLimit: TL });
  for (const a of alts) {
    assert.ok(a.grid, a.notes.join());
    const v = M.validate(plan, cal, am, { grid: a.grid });
    assert.equal(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 2)));
    assert.equal(v.warnings.filter((w) => w.type === 'idle').length, 0, 'mindenki dolgozik, aki nincs távol');
    for (const s of plan.staff.filter((x) => x.include)) for (const d of cal.workdays) {
      assert.equal(Boolean(a.grid[s.id]?.[d]), !M.isAbsent(am, s.id, d), `${s.name} ${d}`);
    }
  }
  const m = M.validate(plan, cal, am, { grid: alts[0].grid }).metrics;
  assert.ok(m.shiftChanges <= 2, `műszakváltás: ${m.shiftChanges}`);
  const m3 = M.validate(plan, cal, am, { grid: alts[2].grid }).metrics;
  assert.ok(m3.deShareSpread <= 25, `DE-arány szórása: ${m3.deShareSpread}`);
  // a pedagógusoknál a délelőtt-arány a tervezett 3:2 körül van
  const ped = m.perWorker.filter((w) => w.group_id === 1);
  const share = ped.reduce((a, w) => a + w.de, 0) / ped.reduce((a, w) => a + w.de + w.du, 0);
  assert.ok(share > 0.5 && share < 0.7, `DE-arány: ${share}`);
  // a változatok a műszakokban eltérnek
  assert.ok(M.gridDiff(alts[0].grid, alts[1].grid) >= 10);
  // egy nap kivétele → figyelmeztetés (nem hiba, ha a minimum megvan)
  const g = structuredClone(alts[0].grid); const wid = 105; const d = Object.keys(g[wid])[0]; M.setCell(g, wid, d, null);
  assert.ok(M.validate(plan, cal, am, { grid: g }).warnings.some((w) => w.type === 'idle' && w.worker_id === wid));
});

test('import: betegállomány és plusz órás szabadnap típus', () => {
  const plan = makePlan();
  const r = M.parseAbsenceRows([['Dolgozóazonosító', 'Szabadság kezdete', 'Szabadság vége', 'Típus'],
    [100, '2027.07.05', '2027.07.05', 'betegállomány'], [101, '2027.07.06', '2027.07.06', 'plusz óra'], [102, '2027.07.07', '2027.07.07', 'Szabadnap plusz órából'], [103, '2027.07.08', '2027.07.08', 'szabadság'], [104, '2027.07.09', '2027.07.09', 'továbbképzés']], plan);
  assert.deepEqual(r.records.map((x) => x.kind), ['beteg', 'pluszora', 'pluszora', 'szabadsag', 'egyeb']);
});

test('helyettesítés: az asszisztens beszámít az óvónői létszámba, de műszakonként 1 óvónő kell', async () => {
  const base = M.newPlan(2027, GROUPS, makeWorkers());
  assert.equal(base.roles[0].subBy, 2); assert.equal(base.roles[0].minOwn, 1); assert.equal(base.roles[2].subBy, null);
  // 11 pedagógusból 9 szabadságon egy héten → 2 óvónő marad a 2+1-es igényre; asszisztensek bent vannak
  const plan = makePlan({ mode: 'mindenki', sub: true });
  for (const id of [100, 101, 102, 103, 104, 105, 106, 107, 108]) plan.absences.push(abs(id, '2027-07-12', '2027-07-16'));
  let { cal, abs: am } = ctx(plan);
  assert.equal(M.precheck(plan, cal, am).length, 0, 'asszisztensekkel kijön');
  const [a] = await generateAlternatives(getHighs, plan, cal, am, { count: 1, timeLimit: TL });
  const v = M.validate(plan, cal, am, { grid: a.grid });
  assert.equal(v.errors.length, 0, JSON.stringify(v.errors.slice(0, 2)));
  assert.equal(v.counts['2027-07-12|DE|1'] + v.counts['2027-07-12|DU|1'], 2);
  assert.ok(v.counts['2027-07-12|DE|1'] >= 1 && v.counts['2027-07-12|DU|1'] >= 1, 'mindkét műszakban van óvónő');
  assert.ok(v.counts['cov|2027-07-12|DE|1'] >= 3);
  // ha csak 1 óvónő marad: az egyik műszakban nincs óvónő → ütközés, akkor is, ha asszisztens van bőven
  plan.absences.push(abs(109, '2027-07-12', '2027-07-16'));
  ({ cal, abs: am } = ctx(plan));
  const c = M.precheck(plan, cal, am).filter((x) => x.type === 'shortage' && x.group_id === 1);
  assert.equal(c.length, 5);
  assert.deepEqual(c[0].required, { DE: 1, DU: 1 });
  // kézi beosztás: 0 óvónő délután, asszisztens van → hiba „nincs bent óvónő”
  const g = structuredClone(a.grid);
  for (const id of [109, 110]) M.setCell(g, id, '2027-07-12', 'DE');
  const v2 = M.validate(makePlanWithAbs(plan, 100), cal, am, { grid: g });
  assert.ok(v2.errors.some((e) => e.type === 'shortage' && e.shift === 'DU' && e.group_id === 1 && /nincs bent/.test(e.msg)));
});
function makePlanWithAbs(plan, _) { const p = structuredClone(plan); p.absences = p.absences.filter((x) => x.worker_id !== 109); return p; }
