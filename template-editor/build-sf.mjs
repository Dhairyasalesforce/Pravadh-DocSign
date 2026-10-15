import { build } from 'esbuild'
import { mkdirSync, copyFileSync } from 'fs'
mkdirSync('dist/sf', { recursive: true })
// MIT requires the copyright + permission notice to travel with every copy of Tiptap and
// ProseMirror. Their packages carry no inline licence comments, so add it here, and ship the
// full texts in the static resource next to editor.js.
const BANNER = `/*! Pravadh DocSign template editor. Apache-2.0, Copyright 2026 Pravadh Labs Private Limited.
 * Includes Tiptap 2.27.2 (MIT, Copyright (c) 2025 Tiptap GmbH) and ProseMirror (MIT, Copyright (C) 2015-2017
 * Marijn Haverbeke and others). Full licence texts: THIRD-PARTY-NOTICES.txt in this static resource. */`
await build({ entryPoints: ['src/sf-app.js'], bundle: true, minify: true, format: 'iife', target: 'es2019', outfile: 'dist/sf/editor.js', legalComments: 'eof', banner: { js: BANNER } })
copyFileSync('src/sf-editor.css', 'dist/sf/editor.css')
copyFileSync('../THIRD_PARTY_NOTICES.md', 'dist/sf/THIRD-PARTY-NOTICES.txt')
console.log('ok')
