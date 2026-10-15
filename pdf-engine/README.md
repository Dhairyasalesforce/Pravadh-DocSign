# DocSignPdfEngine static resource

`pravadh-docsign/main/default/staticresources/DocSignPdfEngine.resource` is a zip of:

| File | Source |
|---|---|
| `pdf.bundle.js` | `pdfjs-dist@4.10.38` (Apache-2.0) legacy build bundled with `entry.mjs` (IIFE, worker on main thread) |
| `standard_fonts/`, `cmaps/`, `LICENSE.txt` | copied from `pdfjs-dist@4.10.38` |
| `docsign-detect.js` | this folder: blank / signature / form-field detection and page rendering |
| `docsign-prep-ui.js` | this folder: the preparation editor used by `DocSignPdfPrep.page` |

Security: PDF.js ≥ 4.2.67 fixes CVE-2024-4367; the engine calls `getDocument` with `isEvalSupported: false`, `enableXfa: false`.
PDF scripts are never executed. The engine runs only on the internal `DocSignPdfPrep` page (never on the public signing site).

Rebuild:

```bash
npm i pdfjs-dist@4.10.38 esbuild@0.24
npx esbuild entry.mjs --bundle --format=iife --minify --target=es2020 --outfile=out/pdf.bundle.js
cp -r node_modules/pdfjs-dist/{standard_fonts,cmaps} out/ && cp node_modules/pdfjs-dist/LICENSE out/LICENSE.txt
cp docsign-detect.js docsign-prep-ui.js out/ && (cd out && zip -qr -9 ../DocSignPdfEngine.resource .)
```
