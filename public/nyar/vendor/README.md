# Külső könyvtárak (változatlan másolatok az npm-csomagokból)

| Fájl | Csomag | Licenc |
| --- | --- | --- |
| highs.mjs, highs.wasm | highs 1.16.0 (HiGHS optimalizáló, WebAssembly) | MIT – LICENSE-highs |
| xlsx.mini.min.js | xlsx 0.18.5 (SheetJS Community Edition) | Apache-2.0 – LICENSE-sheetjs |
| pdf-lib.min.js | pdf-lib 1.17.1 | MIT – LICENSE-pdf-lib |
| fontkit.umd.min.js | @pdf-lib/fontkit 1.1.1 | MIT (a csomag package.json-ja szerint) |
| DejaVuSansCondensed*.ttf | DejaVu Fonts 2.37 | Bitstream Vera / DejaVu (szabad) – LICENSE-dejavu |

Frissítés: `npm i -D <csomag>@<verzió>`, majd a fájl újramásolása a `node_modules`-ból.
Mindegyik csak akkor töltődik be, amikor az adott funkciót használják (generálás, import, PDF).
