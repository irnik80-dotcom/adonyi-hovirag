// Havi A3 (fekvő) PDF a kiválasztott beosztásból. Minden hónap egy oldal, az összes dolgozóval.
// A pdf-lib és a betűkészlet csak a PDF készítésekor töltődik be.
import { staffByRole, WEEKDAY_SHORT, MONTH_NAMES, dotted } from './model.js';

const MM = 72 / 25.4;
const A3 = [420 * MM, 297 * MM];

// A pdf-lib és a fontkit önálló (UMD) változata globális változót hoz létre: PDFLib, fontkit
const script = (src) => new Promise((res, rej) => {
  if (document.querySelector(`script[src="${src}"]`)) return res();
  const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(`Nem tölthető be: ${src}`)); document.head.append(s);
});
async function loadDeps() {
  const base = new URL('./vendor/', import.meta.url);
  const [, , reg, bold] = await Promise.all([
    script(new URL('pdf-lib.min.js', base).pathname), script(new URL('fontkit.umd.min.js', base).pathname),
    fetch(new URL('DejaVuSansCondensed.ttf', base)).then((r) => r.arrayBuffer()),
    fetch(new URL('DejaVuSansCondensed-Bold.ttf', base)).then((r) => r.arrayBuffer()),
  ]);
  return { PDFDocument: window.PDFLib.PDFDocument, rgb: window.PDFLib.rgb, fontkit: window.fontkit, fonts: { reg, bold } };
}

const hex = (rgb, h) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '') || [0, 'ff', 'ff', 'ff'];
  return rgb(parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255);
};

// plan, cal, abs: a modell objektumai; val: validate() eredménye; months: ['2027-06', ...]
// sheets (nem kötelező): több beosztás egy fájlban, pl. az összes változat: [{ grid, val, label, sub }]
export async function makePdf(plan, cal, abs, val, months, deps = null, sheets = null) {
  deps ||= await loadDeps();
  const { PDFDocument, rgb, fontkit } = deps;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const F = await doc.embedFont(deps.fonts.reg, { subset: true });
  const B = await doc.embedFont(deps.fonts.bold, { subset: true });
  doc.setTitle(`${plan.name}`); doc.setAuthor(plan.settings.report.title || ''); doc.setCreator('HÓVIRÁG – nyári beosztás');
  const s = plan.settings, rep = s.report;
  const ink = rgb(0.09, 0.15, 0.12), grey = rgb(0.36, 0.42, 0.38), line = rgb(0.55, 0.6, 0.57), red = rgb(0.7, 0.1, 0.05);
  const groups = staffByRole(plan);
  const selAlt = plan.alternatives.find((a) => a.id === plan.selected);
  sheets ||= [{ grid: plan.schedule?.grid || {}, val, label: selAlt?.label || '' }];
  const made = new Date();
  const madeS = `${made.getFullYear()}. ${String(made.getMonth() + 1).padStart(2, '0')}. ${String(made.getDate()).padStart(2, '0')}.`;

  for (const sheet of sheets) for (const mk of months) {
    const { grid = {}, val: sv, label = '', sub = '' } = sheet;
    val = sv;
    const month = cal.months.find((m) => m.key === mk);
    if (!month) continue;
    let days = month.days;
    if (!rep.period_only) {
      // teljes hónap: az időszakon kívüli napok üresen, szürkén
      const y = Number(mk.slice(0, 4)), mo = Number(mk.slice(5, 7));
      const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      days = Array.from({ length: n }, (_, i) => {
        const date = `${mk}-${String(i + 1).padStart(2, '0')}`;
        return cal.byDate.get(date) || { date, dow: new Date(date + 'T00:00:00Z').getUTCDay(), weekend: [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay()), work: false, outside: true };
      });
    }
    const page = doc.addPage(A3);
    const [W, H] = A3;
    const m = Math.max(0, Number(rep.margin_mm) || 0) * MM + 4; // +4 pt, hogy a vonal ne a lap legszélén legyen
    const left = m, right = W - m, top = H - m, bottom = m;
    const text = (t, x, y, size, font = F, color = ink) => page.drawText(String(t), { x, y, size, font, color });
    const fit = (t, font, size, maxW) => { t = String(t); if (font.widthOfTextAtSize(t, size) <= maxW) return t; while (t.length > 1 && font.widthOfTextAtSize(t + '…', size) > maxW) t = t.slice(0, -1); return t + '…'; };
    const centered = (t, x, w, y, size, font = F, color = ink) => { t = fit(t, font, size, w - 2); text(t, x + (w - font.widthOfTextAtSize(t, size)) / 2, y, size, font, color); };
    const rect = (x, y, w, h, fill) => page.drawRectangle({ x, y, width: w, height: h, color: fill });

    // fejléc
    const title = `${sheets.length > 1 && label ? label + ' · ' : rep.title ? rep.title + ' – ' : ''}Nyári munkabeosztás · ${mk.slice(0, 4)}. ${MONTH_NAMES[Number(mk.slice(5, 7)) - 1]}`;
    text(fit(title, B, 17, (right - left) * 0.62), left, top - 17, 17, B);
    const meta = `Időszak: ${dotted(plan.period.from)} – ${dotted(plan.period.to)} · Készült: ${madeS}${label ? ' · Változat: ' + label : ''}`;
    text(meta, right - F.widthOfTextAtSize(meta, 9), top - 10, 9, F, grey);
    const status = val.ok ? 'Érvényes beosztás' : `NEM VÉGLEGES – ${val.errors.length} hiba`;
    text(status, right - B.widthOfTextAtSize(status, 10), top - 23, 10, B, val.ok ? grey : red);
    if (sub) text(fit(sub, F, 9, (right - left) * 0.62), left, top - 29, 9, F, grey);

    // méretek
    const headH = 26, legendH = 34, gap = 8;
    const nRows = groups.reduce((a, g) => a + 1 + g.workers.length, 0);
    const tableTop = top - (sub ? 40 : 32);
    const availH = tableTop - headH - (bottom + legendH + gap);
    const rowH = Math.max(8, Math.min(22, availH / Math.max(1, nRows)));
    const grpH = rowH;
    const fs = Math.max(5.5, Math.min(10, rowH * 0.5));
    const longest = Math.max(80, ...groups.flatMap((g) => [...g.workers.map((w) => F.widthOfTextAtSize(w.name, fs)), B.widthOfTextAtSize(g.role.label, fs)]), F.widthOfTextAtSize('Délután (min. 0)', fs - 1));
    const nameW = Math.min(190, longest + 12);
    const colW = (right - left - nameW) / days.length;
    const x0 = left + nameW;
    const colX = (i) => x0 + i * colW;

    // oszlopfej
    let y = tableTop - headH;
    rect(left, y, right - left, headH, rgb(0.93, 0.95, 0.93));
    text('Dolgozó', left + 4, y + headH / 2 - 3, fs, B);
    days.forEach((d, i) => {
      if (!d.work) rect(colX(i), y, colW, headH, hex(rgb, d.weekend ? s.colors.hetvege : s.colors.zarva));
      centered(Number(d.date.slice(8)), colX(i), colW, y + headH - 12, Math.min(11, fs + 1), B);
      centered(WEEKDAY_SHORT[d.dow], colX(i), colW, y + 4, Math.min(8, fs - 1), F, grey);
    });

    const hLines = [tableTop, y];
    for (const { role, workers } of groups) {
      y -= grpH;
      rect(left, y, right - left, grpH, rgb(0.85, 0.9, 0.86));
      text(role.label, left + 4, y + grpH / 2 - fs / 2.8, fs, B);
      hLines.push(y);
      for (const w of workers) {
        y -= rowH;
        text(fit(w.name, F, fs, nameW - 8), left + 4, y + rowH / 2 - fs / 2.8, fs);
        days.forEach((d, i) => {
          const x = colX(i);
          const a = abs.get(w.id)?.get(d.date);
          const code = grid[w.id]?.[d.date];
          let bg, t = '';
          if (d.outside) { bg = rgb(0.96, 0.96, 0.96); }
          else if (!d.work) { bg = hex(rgb, d.weekend ? s.colors.hetvege : s.colors.zarva); t = d.weekend ? s.abbr.hetvege : s.abbr.zarva; }
          else if (code) { bg = hex(rgb, s.colors[code]); t = s.abbr[code]; }
          else if (a) { bg = hex(rgb, s.colors[a.kind]); t = s.abbr[a.kind]; }
          else { bg = hex(rgb, s.colors.piheno); t = s.abbr.piheno; }
          rect(x, y, colW, rowH, bg);
          if (code && a) page.drawRectangle({ x: x + 0.8, y: y + 0.8, width: colW - 1.6, height: rowH - 1.6, borderColor: red, borderWidth: 1.2 });
          if (d.weekend && rep.weekend_x && !d.outside) {
            page.drawLine({ start: { x: x + 2, y: y + 2 }, end: { x: x + colW - 2, y: y + rowH - 2 }, thickness: 0.5, color: line });
            page.drawLine({ start: { x: x + 2, y: y + rowH - 2 }, end: { x: x + colW - 2, y: y + 2 }, thickness: 0.5, color: line });
          }
          if (t) centered(t, x, colW, y + rowH / 2 - fs / 2.8, fs, code ? B : F);
        });
        hLines.push(y);
      }
    }
    const tableBottom = y;
    for (const yy of hLines) page.drawLine({ start: { x: left, y: yy }, end: { x: right, y: yy }, thickness: 0.4, color: line });
    page.drawLine({ start: { x: left, y: tableTop }, end: { x: left, y: tableBottom }, thickness: 0.6, color: line });
    page.drawLine({ start: { x: x0, y: tableTop }, end: { x: x0, y: tableBottom }, thickness: 0.6, color: line });
    days.forEach((d, i) => {
      // hétfő előtt vastagabb vonal: jól látszanak a hetek
      const th = d.dow === 1 ? 1.1 : 0.3;
      if (i) page.drawLine({ start: { x: colX(i), y: tableTop }, end: { x: colX(i), y: tableBottom }, thickness: th, color: line });
    });
    page.drawLine({ start: { x: right, y: tableTop }, end: { x: right, y: tableBottom }, thickness: 0.6, color: line });

    // jelmagyarázat
    let lx = left; const ly = Math.max(bottom + 14, tableBottom - gap - 16);
    text('Jelmagyarázat:', lx, ly + 4, 9, B); lx += B.widthOfTextAtSize('Jelmagyarázat:', 9) + 10;
    const usedKinds = new Set((plan.absences || []).map((a) => a.kind));
    const allW = (plan.mode || 'mindenki') === 'mindenki';
    const items = [['DE', 'Délelőtti műszak'], ['DU', 'Délutáni műszak'], ...(groups.some((g) => g.role.single) ? [['D', 'Napi beosztás']] : []),
      ['szabadsag', 'Szabadság'], ['hetvege', 'Hétvége'], ['zarva', 'Ünnepnap / zárva'], ['piheno', allW ? 'Nem dolgozik' : 'Pihenőnap'],
      ...[['beteg', 'Betegállomány'], ['pluszora', 'Plusz órás szabadnap'], ['egyeb', 'Egyéb távollét']].filter(([k]) => usedKinds.has(k))];
    for (const [k, label] of items) {
      const sw = 26, sh2 = 14;
      const need = sw + 4 + F.widthOfTextAtSize(label, 9) + 14;
      if (lx + need > right) break; // nem fér ki: a ritkábbak maradnak le
      rect(lx, ly, sw, sh2, hex(rgb, s.colors[k]));
      page.drawRectangle({ x: lx, y: ly, width: sw, height: sh2, borderColor: line, borderWidth: 0.4 });
      if (s.abbr[k]) centered(s.abbr[k], lx, sw, ly + 4, 8, B);
      text(label, lx + sw + 4, ly + 4, 9);
      lx += need;
    }
    const note = 'Hétvégén és ünnepnapon nincs munkavégzés.';
    text(note, left, ly - 11, 8, F, grey);
    if (!val.ok) text('A beosztás ellenőrzése hibát talált – ez a lap nem végleges.', left + F.widthOfTextAtSize(note, 8) + 16, ly - 11, 8, B, red);
  }
  return doc.save();
}
