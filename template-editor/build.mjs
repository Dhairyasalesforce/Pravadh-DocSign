import { build } from 'esbuild'
import { readFileSync, writeFileSync, mkdirSync } from 'fs'
mkdirSync('dist', { recursive: true })
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, format: 'iife', target: 'es2019', outfile: 'dist/docsign-editor.js', legalComments: 'eof' })
// Editor-only bundle (no demo UI) for the Salesforce static resource
await build({ entryPoints: ['src/lib.js'], bundle: true, minify: true, format: 'iife', globalName: 'PravadhDocSignEditor', target: 'es2019', outfile: 'dist/docsign-editor-lib.js', legalComments: 'eof' })
const js = readFileSync('dist/docsign-editor.js', 'utf8')
if (js.includes('</script')) throw new Error('bundle contains </script')
const html = readFileSync('src/index.src.html', 'utf8').replace('/*BUNDLE*/', () => js)
writeFileSync('dist/docsign-template-editor.html', html)
console.log('html', (html.length / 1024).toFixed(0) + ' KB')
