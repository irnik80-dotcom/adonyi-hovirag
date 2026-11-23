# Nyári munkabeosztás-készítő (`#/nyari-beosztas`)

Külön modul a HÓVIRÁG alkalmazáson belül. A fő alkalmazásból csak olvas (dolgozók, munkakör-csoportok,
ünnepnapok/speciális napok), saját adatait a `summer_plans` D1-táblában tárolja (egy terv = egy JSON-dokumentum,
verziózott mentéssel). Később a szabadságok a fő app Szabadság moduljából is jöhetnek; most Excel/CSV import.

| Fájl | Szerep |
| --- | --- |
| `model.js` | naptár, távollétek, előzetes ütközésvizsgálat, ellenőrzés, mutatók, import – tiszta függvények |
| `solver.js` | HiGHS MILP-modell munkakörönként, 3 profil + eltérési feltétel az alternatívákhoz |
| `solver-worker.js` | Web Worker: munkakörönként párhuzamosan számol, a felület nem akad meg |
| `pdf.js` | havi A3 fekvő PDF (pdf-lib + DejaVu Sans Condensed) |
| `index.js`, `nyar.css` | felület |
| `../../src/summer.js` | `/api/summer/*` végpontok |

**Kötelező feltételek:** saját munkakör, távollét napján nincs beosztás, naponta legfeljebb egy műszak,
munkakörönként és műszakonként a minimumlétszám, kézzel rögzített cellák.
**Preferenciák (súlyozva):** tervezett létszám, ötnapos H–P blokk, azonos műszak a héten, arányos napszám
(az elérhető napok arányában), kevés széttört szakasz, kevés többlet.

A megvalósíthatóságot a generálás előtt pontosan ellenőrzi (munkakörön belül a napok függetlenek, így egy nap akkor
teljesíthető, ha a szabad dolgozók száma ≥ a hiányzó DE + DU létszám), és hiány esetén dátum, műszak, munkakör,
szükséges/elérhető létszám és az ütköző távollétek szerint jelent.

Tesztek: `npm test` (a specifikáció 16. pontja, mesterséges adatokkal; a PDF-teszthez `pdftotext` kell).
