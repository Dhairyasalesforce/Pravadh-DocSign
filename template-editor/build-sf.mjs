import { build } from 'esbuild'
import { mkdirSync, copyFileSync } from 'fs'
mkdirSync('dist/sf', { recursive: true })
await build({ entryPoints: ['src/sf-app.js'], bundle: true, minify: true, format: 'iife', target: 'es2019', outfile: 'dist/sf/editor.js', legalComments: 'eof' })
copyFileSync('src/sf-editor.css', 'dist/sf/editor.css')
console.log('ok')
