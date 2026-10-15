// Converts between the editor document and DocSign template HTML.
// The output is deliberately plain: tables for layout and CSS 2.1 only, because
// Salesforce Blob.toPdf (Flying Saucer) ignores flexbox, grid and data: images.

export const PDF_STYLE = `<style>
body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; color: #1b2333; line-height: 1.45; }
h1 { font-size: 20pt; margin: 0 0 8pt 0; }
h2 { font-size: 14pt; margin: 14pt 0 6pt 0; }
h3 { font-size: 11.5pt; margin: 12pt 0 4pt 0; }
p { margin: 0 0 6pt 0; }
table { width: 100%; border-collapse: collapse; margin: 0 0 10pt 0; }
table.dsx-grid td, table.dsx-grid th { border: 1px solid #c9ced8; padding: 4pt 6pt; vertical-align: top; text-align: left; }
table.dsx-grid th { background-color: #eef1f6; }
table.dsx-plain td, table.dsx-plain th { border: none; padding: 4pt 8pt 4pt 0; vertical-align: top; text-align: left; }
td p, th p { margin: 0; }
hr { border: none; border-top: 1px solid #c9ced8; margin: 10pt 0; }
</style>`

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const escAttr = (s) => esc(s).replace(/"/g, '&quot;')

const MARK_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' }

function alignAttr(node) {
  const a = node.attrs && node.attrs.textAlign
  return a && a !== 'left' ? ` style="text-align: ${a}"` : ''
}

function wrapMarks(out, marks) {
  for (const m of marks || []) {
    const t = MARK_TAGS[m.type]
    if (t) out = `<${t}>${out}</${t}>`
  }
  return out
}

function inlineOne(n) {
  if (n.type === 'text') return esc(n.text)
  if (n.type === 'hardBreak') return '<br/>'
  if (n.type === 'mergeField') return '{{' + n.attrs.path + (n.attrs.filter ? ' | ' + n.attrs.filter : '') + '}}'
  if (n.type === 'signTag') {
    const { kind, role, label, optional } = n.attrs
    return '{{sign:' + kind + ':' + role + (label || optional ? ':' + label : '') + (optional ? ':optional' : '') + '}}'
  }
  return ''
}

// Adjacent nodes sharing a mark are wrapped once: <strong>For {{Account.Name}}</strong>
function inline(nodes = []) {
  let out = ''
  let i = 0
  while (i < nodes.length) {
    const key = JSON.stringify((nodes[i].marks || []).map((m) => m.type))
    let j = i
    let run = ''
    while (j < nodes.length && JSON.stringify((nodes[j].marks || []).map((m) => m.type)) === key) {
      run += inlineOne(nodes[j])
      j++
    }
    out += wrapMarks(run, nodes[i].marks)
    i = j
  }
  return out
}

function loopOpen(rel, orderBy, limit) {
  return '{{#each ' + rel + (orderBy ? ` orderBy="${orderBy}"` : '') + (limit ? ` limit="${limit}"` : '') + '}}'
}

function block(n, ind = '', opts = {}) {
  const kids = (list, i) => (list || []).map((c) => block(c, i, opts)).join('\n')
  switch (n.type) {
    case 'paragraph':
      return `${ind}<p${alignAttr(n)}>${inline(n.content) || '&#160;'}</p>`
    case 'heading':
      return `${ind}<h${n.attrs.level}${alignAttr(n)}>${inline(n.content)}</h${n.attrs.level}>`
    case 'bulletList':
      return `${ind}<ul>\n${kids(n.content, ind + '  ')}\n${ind}</ul>`
    case 'orderedList':
      return `${ind}<ol>\n${kids(n.content, ind + '  ')}\n${ind}</ol>`
    case 'listItem': {
      const inner = (n.content || []).map((c) => (c.type === 'paragraph' ? inline(c.content) : '\n' + block(c, ind + '  ', opts))).join('<br/>')
      return `${ind}<li>${inner}</li>`
    }
    case 'blockquote':
      return `${ind}<blockquote>\n${kids(n.content, ind + '  ')}\n${ind}</blockquote>`
    case 'horizontalRule':
      return `${ind}<hr/>`
    case 'pageBreak':
      return `${ind}<div style="page-break-after: always"></div>`
    case 'table': {
      const plain = n.attrs.variant === 'plain'
      const cls = plain ? 'dsx-plain' : 'dsx-grid'
      const cellStyle = (tag) => (plain ? ' style="border: none; padding: 4pt 8pt 4pt 0"' : ` style="border: 1px solid #c9ced8${tag === 'th' ? '; background: #eef1f6' : ''}"`)
      const rows = (n.content || []).map((r) => {
        const cells = (r.content || [])
          .map((c) => {
            const tag = c.type === 'tableHeader' ? 'th' : 'td'
            const span = (c.attrs.colspan > 1 ? ` colspan="${c.attrs.colspan}"` : '') + (c.attrs.rowspan > 1 ? ` rowspan="${c.attrs.rowspan}"` : '')
            const body = (c.content || []).map((p) => (p.type === 'paragraph' ? `<p${alignAttr(p)}>${inline(p.content)}</p>` : block(p, '', opts))).join('')
            return `<${tag}${span}${opts.inline ? cellStyle(tag) : ''}>${body}</${tag}>`
          })
          .join('')
        const tr = `<tr>${cells}</tr>`
        return r.attrs.each ? `${ind}  ${loopOpen(r.attrs.each, r.attrs.orderBy, r.attrs.limit)}${tr}{{/each}}` : `${ind}  ${tr}`
      })
      return `${ind}<table class="${cls}">\n${rows.join('\n')}\n${ind}</table>`
    }
    case 'eachBlock':
      return `${ind}${loopOpen(n.attrs.relation, n.attrs.orderBy, n.attrs.limit)}\n${kids(n.content, ind + '  ')}\n${ind}{{/each}}`
    case 'ifBlock': {
      const [thenPart, elsePart] = n.content || []
      let out = `${ind}{{#if ${n.attrs.condition}}}\n${kids(thenPart && thenPart.content, ind + '  ')}`
      if (elsePart) out += `\n${ind}{{else}}\n${kids(elsePart.content, ind + '  ')}`
      return out + `\n${ind}{{/if}}`
    }
    default:
      return n.content ? kids(n.content, ind) : ''
  }
}

// Editor JSON → DocSign template HTML
export const DSX_MARKER = '<!--dsx:1-->'

// opts.salesforce: no <style> block, inline table styles, visual-editor marker first line
export function toTemplate(docJson, opts = {}) {
  const body = (docJson.content || []).map((n) => block(n, '', { inline: !!opts.salesforce })).join('\n') + '\n'
  return opts.salesforce ? DSX_MARKER + '\n' + body : PDF_STYLE + '\n' + body
}

// {{…}} tokens, whitespace-normalised, for round-trip checks
export function tokens(tpl) {
  return (String(tpl).match(/\{\{[\s\S]*?\}\}/g) || []).map((t) => t.replace(/\s+/g, ' ').replace(/&quot;/g, '"'))
}

// Can this template be opened in the visual editor without losing logic?
export function visualCompatible(tpl) {
  const src = String(tpl || '')
  if (!src.trim() || src.startsWith(DSX_MARKER)) return { ok: true }
  // {{else}} inside {{#each}} and nested loops are not modelled yet
  let depth = 0
  const stack = []
  for (const t of tokens(src)) {
    if (t.startsWith('{{#each')) { stack.push('each'); depth++; if (depth > 1) return { ok: false, reason: 'nested loops' } }
    else if (t.startsWith('{{#if')) stack.push('if')
    else if (t === '{{else}}' && stack[stack.length - 1] === 'each') return { ok: false, reason: '{{else}} inside a loop' }
    else if (t === '{{/each}}') { stack.pop(); depth-- }
    else if (t === '{{/if}}') stack.pop()
  }
  // A loop that touches table markup must wrap exactly one whole row
  const re = /\{\{#each[^}]*\}\}([\s\S]*?)\{\{\/each\}\}/g
  let m
  while ((m = re.exec(src))) {
    const inner = m[1].trim()
    if (/<\/?t[dhr][\s>]/i.test(inner) && !(/^<tr[\s>]/i.test(inner) && /<\/tr>$/i.test(inner) && (inner.match(/<tr[\s>]/gi) || []).length === 1)) {
      return { ok: false, reason: 'a loop inside a table that is not exactly one row' }
    }
  }
  return { ok: true }
}

function loopArgAttrs(args) {
  let out = ''
  const ob = /orderBy\s*=\s*"([^"]*)"/.exec(args || '')
  const lim = /limit\s*=\s*"([^"]*)"/.exec(args || '')
  if (ob) out += ` data-orderby="${escAttr(ob[1])}"`
  if (lim) out += ` data-limit="${escAttr(lim[1])}"`
  return out
}

// DocSign template HTML → HTML the editor schema can parse
export function fromTemplate(tpl) {
  let s = String(tpl).replace(/<style[\s\S]*?<\/style>/gi, '')
  s = s.replace(/<div style="page-break-after:\s*always;?"\s*><\/div>/gi, '<div data-page-break></div>')
  // Tables whose cells say border:none are signature-style "plain" tables
  s = s.replace(/<table(?![^>]*dsx-)([^>]*)>([\s\S]*?)<\/table>/gi, (m, attrs, inner) => (/<t[dh][^>]*border\s*:\s*none/i.test(inner) ? `<table class="dsx-plain"${attrs}>${inner}</table>` : m))
  s = s.replace(/<\/?(thead|tbody|tfoot)[^>]*>/gi, '')
  s = s.replace(/^\s*<!--dsx:1-->\s*/, '')
  // Repeating table rows
  s = s.replace(/\{\{#each\s+([\w.$]+)([^}]*)\}\}\s*<tr([^>]*)>([\s\S]*?)<\/tr>\s*\{\{\/each\}\}/g, (m, rel, args, trAttrs, inner) => `<tr${trAttrs} data-each="${escAttr(rel)}"${loopArgAttrs(args)}>${inner}</tr>`)
  // Repeating blocks
  s = s.replace(/\{\{#each\s+([\w.$]+)([^}]*)\}\}/g, (m, rel, args) => `<div data-each-block="${escAttr(rel)}"${loopArgAttrs(args)}>`).replace(/\{\{\/each\}\}/g, '</div>')
  // Conditions
  s = s
    .replace(/\{\{#if\s+([^}]*)\}\}/g, (m, c) => `<div data-if="${escAttr(c.trim())}"><div data-if-then>`)
    .replace(/\{\{else\}\}/g, '</div><div data-if-else>')
    .replace(/\{\{\/if\}\}/g, '</div></div>')
  // Signature tags
  s = s.replace(/\{\{\s*sign:([^}]*)\}\}/g, (m, body) => {
    const [kind = 'signature', role = '1', label = '', opt = ''] = body.split(':')
    return `<span data-sign="${escAttr(kind.trim())}" data-role="${escAttr(role.trim() || '1')}"${label ? ` data-label="${escAttr(label)}"` : ''}${opt.trim() === 'optional' || label.trim() === 'optional' ? ' data-optional="true"' : ''}></span>`
  })
  // Merge fields (decode &quot; that HTML escaping may have introduced)
  s = s.replace(/\{\{\s*([^#/{}][^}]*?)\s*\}\}/g, (m, body) => {
    body = body.replace(/&quot;/g, '"')
    const i = body.indexOf('|')
    const path = (i < 0 ? body : body.slice(0, i)).trim()
    const filter = i < 0 ? '' : body.slice(i + 1).trim()
    return `<span data-merge="${escAttr(path)}"${filter ? ` data-filter="${escAttr(filter)}"` : ''}></span>`
  })
  return s
}

// PDF-readiness checks on the produced template
export function pdfChecks(tpl) {
  const issues = []
  if (/display\s*:\s*(flex|grid|inline-flex)/i.test(tpl)) issues.push({ level: 'bad', text: 'Uses flexbox or grid. The PDF renderer ignores both, so use a table for layout.' })
  if (/position\s*:\s*(absolute|fixed|sticky)/i.test(tpl)) issues.push({ level: 'bad', text: 'Uses absolute positioning, which renders unpredictably in the PDF.' })
  if (/data:image\//i.test(tpl)) issues.push({ level: 'bad', text: 'Embeds a data: image. Upload it to Salesforce Files and use {{image:<ContentVersionId>}}.' })
  if (/var\(--|calc\(/i.test(tpl)) issues.push({ level: 'warn', text: 'CSS variables or calc() are not supported by the PDF renderer.' })
  return issues
}
