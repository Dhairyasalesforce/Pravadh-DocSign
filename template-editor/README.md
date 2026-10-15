# DocSign visual template editor (source)

Unminified source of the `DocSignTemplateEditor` static resource (kept for security review and so anyone can rebuild it).
Not part of any package directory, so it is never deployed.

* `src/extensions.js` Tiptap nodes for DocSign syntax (merge fields, signer fields, repeating rows, repeat/if blocks, page break)
* `src/template.js` editor JSON ↔ DocSign template HTML (`toTemplate(json, { salesforce: true })` adds the `<!--dsx:1-->` marker and inline table styles)
* `src/sf-app.js` the editor that runs in `DocSignTemplateEditor.page`; all data comes over postMessage from the `docSignTemplateEditor` LWC
* `src/sf-editor.css` editor styles
* `sf/body.html` markup used in the Visualforce page
* `src/app.js`, `src/index.src.html`, `src/merge.js`, `src/sample.js` the standalone website demo

Build: `npm install && npm run build:salesforce` then
`cd dist/sf && zip -j ../../../pravadh-docsign/main/default/staticresources/DocSignTemplateEditor.resource editor.js editor.css`

Third-party: Tiptap 2.27.2 and ProseMirror (MIT). No eval / new Function in the bundle.
