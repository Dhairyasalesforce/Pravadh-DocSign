import { chromium } from 'playwright-core'; import http from 'http'; import fs from 'fs'; import path from 'path';
const root='/home/claude/pdfb/work';
const srv = http.createServer((q, s) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (!fs.existsSync(f)) { s.writeHead(404); return s.end(); } s.writeHead(200,{'Content-Type': f.endsWith('.html')?'text/html':f.endsWith('.js')?'text/javascript':'application/octet-stream'}); s.end(fs.readFileSync(f)); }).listen(8770);
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const p = await b.newPage(); const errs=[]; p.on('pageerror', e => errs.push(e.message));
await p.goto('http://localhost:8770/detect.html');
for (const file of process.argv.slice(2)) {
  const out = await p.evaluate(async (file) => {
    const buf = new Uint8Array(await (await fetch(file)).arrayBuffer());
    const r = await DocSignDetect.analyze(buf, { assetBase: './' });
    const data = { today: '25 Sep 2026', people: r.roles.map(x => x.label).filter(l => !/^Signer \d+$/.test(l)), fields: [{ label: 'My Name', value: 'Dhairya Shah' }, { label: 'My Email', value: 'dhairya@example.com' }, { label: 'Company Legal Name', value: 'Pravadh Labs' }, { label: 'Account Name', value: 'Acme Corporation', type: 'STRING' }] };
    return { roles: r.roles.map(x => x.role + ':' + x.label).join(' | '), fields: r.fields.map(f => { const e = f.role === 0 ? DocSignDetect.expect(f, data) : null; const sg = f.role === 0 ? DocSignDetect.suggestAll(f, data).map(x => x.value).join(' / ') : ''; return (f.role === 0 ? 'YOU ' : 'S' + f.role + '  ') + f.type.padEnd(11) + ' ' + JSON.stringify(f.label) + (e ? '  → ' + e.hint + (e.example ? ' [e.g. ' + e.example + ']' : '') + (sg ? '  ⇢ ' + sg : '') : ''); }) };
  }, file);
  console.log('\n=== ' + file + '\nSIGNERS: ' + out.roles); out.fields.forEach(l => console.log('  ' + l));
}
console.log('ERRORS', errs); await b.close(); srv.close();
