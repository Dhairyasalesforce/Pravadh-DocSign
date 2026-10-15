import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import { MergeField, SignTag, DsxTable, RepeatRow, EachBlock, IfBlock, IfThen, IfElse, PageBreak, SIGN_KINDS } from './extensions.js'
import { toTemplate, fromTemplate, pdfChecks } from './template.js'
import { renderPreview } from './merge.js'
import { FIELD_GROUPS, RELATIONS, SAMPLE_RECORD, SAMPLE_ENV, SAMPLE_TEMPLATE, DEFAULT_ROLES, OBJECT_NAME } from './sample.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const STORE_KEY = 'pravadh-docsign-editor-v1'
const RELATED_PATHS = new Set(FIELD_GROUPS.find((g) => g.id === 'lines').fields.map((f) => f.api))
const ROLE_MAX = 4

let roles = { ...DEFAULT_ROLES }
let saved = null
try {
  saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null')
} catch (e) {
  saved = null
}
if (saved && saved.roles) roles = saved.roles

const env = () => ({ ...SAMPLE_ENV, today: new Date().toISOString(), roleNames: roles })
const roleName = (r) => roles[r] || 'Signer ' + r

// ---------- field metadata ----------
function fieldMeta(path) {
  for (const g of FIELD_GROUPS) {
    for (const f of g.fields) {
      if ((g.prefix || '') + f.api === path) return { ...f, group: g }
    }
  }
  return null
}
function defaultFilter(type) {
  if (type === 'currency') return 'currency'
  if (type === 'date') return 'date:"d MMM yyyy"'
  if (type === 'percent') return 'number:1'
  return ''
}
const FORMAT_OPTIONS = {
  any: [['', 'As stored'], ['upper', 'UPPERCASE'], ['lower', 'lowercase']],
  currency: [['currency', 'Currency ($1,234.50)'], ['number:2', 'Number, 2 decimals'], ['number:0', 'Number, no decimals'], ['', 'As stored']],
  number: [['number:0', 'Number, no decimals'], ['number:2', 'Number, 2 decimals'], ['currency', 'Currency'], ['', 'As stored']],
  percent: [['number:1', 'Number, 1 decimal'], ['number:2', 'Number, 2 decimals'], ['number:0', 'Number, no decimals'], ['', 'As stored']],
  date: [['date:"d MMM yyyy"', '14 Oct 2026'], ['date:"dd/MM/yyyy"', '14/10/2026'], ['date:"MMMM d, yyyy"', 'October 14, 2026'], ['date:"yyyy-MM-dd"', '2026-10-14'], ['', 'As stored']],
}
function splitFilter(filter) {
  const parts = (filter || '').split(/\s*\|\s*(?=(?:[^"]*"[^"]*")*[^"]*$)/).filter(Boolean)
  let fallback = ''
  const rest = []
  for (const p of parts) {
    const m = /^default\s*:\s*"(.*)"$/.exec(p)
    if (m) fallback = m[1]
    else rest.push(p)
  }
  return { format: rest.join(' | '), fallback }
}
function joinFilter(format, fallback) {
  return [format, fallback ? `default:"${fallback.replace(/"/g, "'")}"` : ''].filter(Boolean).join(' | ')
}

// ---------- editor ----------
const relationLabel = (api) => (RELATIONS.find((r) => r.api === api) || { label: api }).label

const editor = new Editor({
  element: $('#editor'),
  extensions: [
    StarterKit.configure({ code: false, codeBlock: false, heading: { levels: [1, 2, 3] } }),
    Underline,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    DsxTable.configure({ resizable: false }),
    RepeatRow,
    TableHeader,
    TableCell,
    MergeField,
    SignTag.configure({ roleName }),
    EachBlock.configure({ relationLabel }),
    IfBlock,
    IfThen,
    IfElse,
    PageBreak,
    Placeholder.configure({ placeholder: 'Type / to add a block, or click a field on the left' }),
  ],
  content: fromTemplate((saved && saved.tpl) || SAMPLE_TEMPLATE),
  editorProps: {
    attributes: { spellcheck: 'true', 'aria-label': 'Template body' },
    handleDrop(view, event, slice, moved) {
      if (moved) return false
      const raw = event.dataTransfer && event.dataTransfer.getData('application/x-dsx')
      if (!raw) return false
      const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (!at) return false
      event.preventDefault()
      const content = JSON.parse(raw)
      editor.chain().focus().insertContentAt(at.pos, content).run()
      afterInsert(content)
      return true
    },
    handleKeyDown(view, event) {
      if (!slash.open) return false
      if (event.key === 'ArrowDown') {
        slash.active = (slash.active + 1) % slash.items.length
        drawSlash()
        return true
      }
      if (event.key === 'ArrowUp') {
        slash.active = (slash.active - 1 + slash.items.length) % slash.items.length
        drawSlash()
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        runSlash(slash.items[slash.active])
        return true
      }
      if (event.key === 'Escape') {
        hideSlash()
        return true
      }
      return false
    },
  },
})

$('#tplName').value = (saved && saved.name) || 'Sales Quote'

// ---------- insert helpers ----------
const p = (...content) => ({ type: 'paragraph', content })
const t = (text, marks) => (marks ? { type: 'text', text, marks: marks.map((m) => ({ type: m })) } : { type: 'text', text })
const f = (path, filter = '') => ({ type: 'mergeField', attrs: { path, filter } })
const sg = (kind, role, label = '', optional = false) => ({ type: 'signTag', attrs: { kind, role, label, optional } })
const cell = (type, ...content) => ({ type, content: [p(...content)] })
const rp = (align, ...content) => ({ type: 'paragraph', attrs: { textAlign: align }, content })

function lineItemsTable() {
  const th = (txt, align = 'left') => ({ type: 'tableHeader', content: [rp(align, t(txt))] })
  const td = (align, ...c) => ({ type: 'tableCell', content: [rp(align, ...c)] })
  return {
    type: 'table',
    attrs: { variant: 'grid' },
    content: [
      { type: 'tableRow', content: [th('#'), th('Product'), th('Qty', 'right'), th('Unit price', 'right'), th('Total', 'right')] },
      {
        type: 'tableRow',
        attrs: { each: 'OpportunityLineItems', orderBy: 'SortOrder', limit: '200' },
        content: [td('left', f('$index')), td('left', f('Product2.Name')), td('right', f('Quantity', 'number:0')), td('right', f('UnitPrice', 'currency')), td('right', f('TotalPrice', 'currency'))],
      },
    ],
  }
}
function signatureBlock() {
  const col = (role, heading) => ({ type: 'tableCell', content: [p(t(heading[0], ['bold']), ...(heading[1] ? [heading[1]] : [])), p(sg('signature', role)), p(sg('name', role)), p(sg('date', role))] })
  return {
    type: 'table',
    attrs: { variant: 'plain' },
    content: [{ type: 'tableRow', content: [col(1, ['For ', { ...f('Account.Name'), marks: [{ type: 'bold' }] }]), col(2, ['For ', { ...f('$Org.Name'), marks: [{ type: 'bold' }] }])] }],
  }
}
function conditionBlock() {
  return {
    type: 'ifBlock',
    attrs: { condition: 'StageName == "Closed Won"' },
    content: [
      { type: 'ifThen', content: [p(t('This order is confirmed.'))] },
      { type: 'ifElse', content: [p(t('This quotation is valid until '), f('CloseDate', 'date:"d MMM yyyy"'), t('.'))] },
    ],
  }
}
function repeatBlock() {
  return { type: 'eachBlock', attrs: { relation: 'OpportunityLineItems', orderBy: 'SortOrder', limit: '' }, content: [p(f('Product2.Name'), t(' × '), f('Quantity', 'number:0'), t(': '), f('TotalPrice', 'currency'))] }
}

function insert(content) {
  editor.chain().focus().insertContent(content).run()
  afterInsert(content)
}
function insideLoop() {
  const $f = editor.state.selection.$from
  for (let d = $f.depth; d > 0; d--) {
    const n = $f.node(d)
    if (n.type.name === 'eachBlock' || (n.type.name === 'tableRow' && n.attrs.each)) return true
  }
  return false
}
function afterInsert(content) {
  if (content && content.type === 'mergeField' && RELATED_PATHS.has(content.attrs.path) && !insideLoop()) {
    toast('Product fields need a repeating row. Put this field in a row of a line-items table, or inside a repeat block.')
  }
}

const BLOCKS = [
  { id: 'lines', label: 'Line items table', hint: 'One row per product', keys: 'table products lines items repeat', run: () => insert(lineItemsTable()) },
  { id: 'sigblock', label: 'Signature block', hint: 'Both signers, name and date', keys: 'signature sign block', run: () => insert(signatureBlock()) },
  { id: 'if', label: 'Show if…', hint: 'Content that depends on a field', keys: 'condition if show when', run: () => insert(conditionBlock()) },
  { id: 'each', label: 'Repeat block', hint: 'Paragraphs per related record', keys: 'repeat each loop', run: () => insert(repeatBlock()) },
  { id: 'h1', label: 'Heading 1', hint: 'Document title', keys: 'heading title h1', run: () => editor.chain().focus().setNode('heading', { level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', hint: 'Section', keys: 'heading section h2', run: () => editor.chain().focus().setNode('heading', { level: 2 }).run() },
  { id: 'table', label: 'Table', hint: '3 × 3 with header', keys: 'table grid', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'list', label: 'Bulleted list', hint: '', keys: 'list bullet', run: () => editor.chain().focus().toggleBulletList().run() },
  { id: 'sig', label: 'Signature field', hint: 'Signer 1 signs here', keys: 'signature sign', run: () => insert(sg('signature', 1)) },
  { id: 'date', label: 'Date signed', hint: 'Filled when signer 1 signs', keys: 'date signed', run: () => insert(sg('date', 1)) },
  { id: 'break', label: 'Page break', hint: 'Start a new PDF page', keys: 'page break new', run: () => editor.chain().focus().insertContent({ type: 'pageBreak' }).run() },
  { id: 'field', label: 'Field…', hint: 'Search the record’s fields', keys: 'field merge value', run: () => { setPanel('fields'); $('#fieldSearch').focus() } },
]

// ---------- slash menu ----------
const slash = { open: false, items: [], active: 0, from: 0, to: 0 }
function checkSlash() {
  const { state } = editor
  const sel = state.selection
  if (!sel.empty || !editor.isFocused) return hideSlash()
  const $p = sel.$from
  if (!$p.parent.isTextblock) return hideSlash()
  const before = $p.parent.textBetween(0, $p.parentOffset, '\n', '￼')
  const m = /(?:^|\s)\/(\w{0,20})$/.exec(before)
  if (!m) return hideSlash()
  const q = m[1].toLowerCase()
  const items = BLOCKS.filter((b) => !q || b.label.toLowerCase().includes(q) || b.keys.includes(q))
  if (!items.length) return hideSlash()
  slash.items = items
  slash.from = sel.from - m[1].length - 1
  slash.to = sel.from
  if (!slash.open) slash.active = 0
  slash.active = Math.min(slash.active, items.length - 1)
  slash.open = true
  const c = editor.view.coordsAtPos(sel.from)
  const menu = $('#slash')
  menu.hidden = false
  const w = Math.min(300, window.innerWidth - 24)
  menu.style.left = Math.max(12, Math.min(c.left, window.innerWidth - w - 12)) + 'px'
  const below = c.bottom + 6
  menu.style.top = (below + 320 > window.innerHeight ? Math.max(12, c.top - 326) : below) + 'px'
  drawSlash()
}
function drawSlash() {
  $('#slash').innerHTML =
    '<div class="slash-head">Insert</div>' +
    slash.items
      .map((b, i) => `<button type="button" class="slash-item${i === slash.active ? ' is-active' : ''}" data-i="${i}"><span class="slash-label">${esc(b.label)}</span><span class="slash-hint">${esc(b.hint)}</span></button>`)
      .join('')
  const act = $('.slash-item.is-active')
  if (act) act.scrollIntoView({ block: 'nearest' })
}
function hideSlash() {
  slash.open = false
  $('#slash').hidden = true
}
function runSlash(item) {
  if (!item) return
  editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run()
  hideSlash()
  item.run()
}
$('#slash').addEventListener('mousedown', (e) => {
  const b = e.target.closest('.slash-item')
  if (!b) return
  e.preventDefault()
  runSlash(slash.items[Number(b.dataset.i)])
})

// ---------- left panel ----------
function setPanel(name) {
  $$('.ptab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === name)))
  $$('.ppanel').forEach((p) => (p.hidden = p.id !== 'panel-' + name))
}
$$('.ptab').forEach((b) => b.addEventListener('click', () => setPanel(b.dataset.panel)))

const TYPE_BADGE = { text: 'Aa', currency: '$', date: 'Date', picklist: 'List', percent: '%', number: '#', email: '@', phone: 'Tel' }
function drawFields(q = '') {
  q = q.trim().toLowerCase()
  const html = FIELD_GROUPS.map((g) => {
    const items = g.fields.filter((fl) => !q || fl.label.toLowerCase().includes(q) || ((g.prefix || '') + fl.api).toLowerCase().includes(q))
    if (!items.length) return ''
    const note = g.related ? `<p class="fgroup-note">Related list <code>${g.related}</code>. Use inside a repeating row.</p>` : ''
    return `<section class="fgroup${g.related ? ' is-related' : ''}"><h3>${esc(g.label)}</h3>${note}<ul>${items
      .map((fl) => {
        const path = (g.prefix || '') + fl.api
        return `<li><button type="button" class="fitem" draggable="true" data-path="${esc(path)}" data-type="${fl.type}"><span class="fitem-type">${TYPE_BADGE[fl.type] || 'Aa'}</span><span class="fitem-text"><span class="fitem-label">${esc(fl.label)}</span><code>${esc(path)}</code></span></button></li>`
      })
      .join('')}</ul></section>`
  }).join('')
  $('#fieldList').innerHTML = html || '<p class="empty">No field matches. Try the API name, like <code>BillingCity</code>.</p>'
}
drawFields()
$('#fieldSearch').addEventListener('input', (e) => drawFields(e.target.value))
$('#fieldList').addEventListener('click', (e) => {
  const b = e.target.closest('.fitem')
  if (!b) return
  insert(f(b.dataset.path, defaultFilter(b.dataset.type)))
})
$('#fieldList').addEventListener('dragstart', (e) => {
  const b = e.target.closest('.fitem')
  if (!b) return
  e.dataTransfer.setData('application/x-dsx', JSON.stringify(f(b.dataset.path, defaultFilter(b.dataset.type))))
  e.dataTransfer.setData('text/plain', '{{' + b.dataset.path + '}}')
  e.dataTransfer.effectAllowed = 'copy'
})

function drawBlocks() {
  const main = BLOCKS.filter((b) => ['lines', 'sigblock', 'if', 'each', 'table', 'break'].includes(b.id))
  $('#blockList').innerHTML = main
    .map((b) => `<button type="button" class="bitem" data-id="${b.id}" draggable="true"><span class="bitem-label">${esc(b.label)}</span><span class="bitem-hint">${esc(b.hint)}</span></button>`)
    .join('')
}
drawBlocks()
const BLOCK_JSON = { lines: lineItemsTable, sigblock: signatureBlock, if: conditionBlock, each: repeatBlock, break: () => ({ type: 'pageBreak' }) }
$('#blockList').addEventListener('click', (e) => {
  const b = e.target.closest('.bitem')
  if (b) BLOCKS.find((x) => x.id === b.dataset.id).run()
})
$('#blockList').addEventListener('dragstart', (e) => {
  const b = e.target.closest('.bitem')
  if (!b || !BLOCK_JSON[b.dataset.id]) return
  e.dataTransfer.setData('application/x-dsx', JSON.stringify(BLOCK_JSON[b.dataset.id]()))
  e.dataTransfer.effectAllowed = 'copy'
})

function drawSigners() {
  const kinds = Object.entries(SIGN_KINDS)
  $('#signerList').innerHTML =
    Object.keys(roles)
      .map(Number)
      .sort()
      .map(
        (r) => `<section class="signer dsx-role-${r}">
      <div class="signer-head"><span class="signer-dot" aria-hidden="true"></span><label class="sr-only" for="role-${r}">Signer ${r} name</label><input id="role-${r}" class="signer-name" data-role="${r}" value="${esc(roles[r])}"><span class="signer-num">Signer ${r}</span></div>
      <div class="signer-kinds">${kinds.map(([k, label]) => `<button type="button" class="kind" data-role="${r}" data-kind="${k}" draggable="true">${label}</button>`).join('')}</div>
    </section>`,
      )
      .join('') + (Object.keys(roles).length < ROLE_MAX ? '<button type="button" id="addSigner" class="ghost-btn">Add a signer</button>' : '')
}
drawSigners()
$('#signerList').addEventListener('click', (e) => {
  const k = e.target.closest('.kind')
  if (k) {
    const kind = k.dataset.kind
    insert(sg(kind, Number(k.dataset.role), kind === 'text' ? 'Company' : kind === 'checkbox' ? 'I agree' : ''))
    return
  }
  if (e.target.id === 'addSigner') {
    const next = Math.max(...Object.keys(roles).map(Number)) + 1
    roles[next] = 'Signer ' + next
    drawSigners()
    persist()
  }
})
$('#signerList').addEventListener('dragstart', (e) => {
  const k = e.target.closest('.kind')
  if (!k) return
  e.dataTransfer.setData('application/x-dsx', JSON.stringify(sg(k.dataset.kind, Number(k.dataset.role))))
})
$('#signerList').addEventListener('change', (e) => {
  if (!e.target.classList.contains('signer-name')) return
  roles[e.target.dataset.role] = e.target.value.trim() || 'Signer ' + e.target.dataset.role
  refreshNodeViews()
  persist()
})
function refreshNodeViews() {
  const { from, to } = editor.state.selection
  editor.commands.setContent(editor.getJSON(), false)
  try {
    editor.commands.setTextSelection({ from, to })
  } catch (e) {}
}

// ---------- toolbar ----------
const TOOL = {
  undo: () => editor.chain().focus().undo().run(),
  redo: () => editor.chain().focus().redo().run(),
  bold: () => editor.chain().focus().toggleBold().run(),
  italic: () => editor.chain().focus().toggleItalic().run(),
  underline: () => editor.chain().focus().toggleUnderline().run(),
  left: () => editor.chain().focus().setTextAlign('left').run(),
  center: () => editor.chain().focus().setTextAlign('center').run(),
  right: () => editor.chain().focus().setTextAlign('right').run(),
  bullet: () => editor.chain().focus().toggleBulletList().run(),
  ordered: () => editor.chain().focus().toggleOrderedList().run(),
  table: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  break: () => editor.chain().focus().insertContent({ type: 'pageBreak' }).run(),
}
$('#toolbar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cmd]')
  if (b && TOOL[b.dataset.cmd]) TOOL[b.dataset.cmd]()
})
$('#styleSel').addEventListener('change', (e) => {
  const v = e.target.value
  if (v === 'p') editor.chain().focus().setParagraph().run()
  else editor.chain().focus().setNode('heading', { level: Number(v) }).run()
})
function syncToolbar() {
  const act = {
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    left: editor.isActive({ textAlign: 'left' }),
    center: editor.isActive({ textAlign: 'center' }),
    right: editor.isActive({ textAlign: 'right' }),
    bullet: editor.isActive('bulletList'),
    ordered: editor.isActive('orderedList'),
  }
  $$('#toolbar [data-cmd]').forEach((b) => {
    if (b.dataset.cmd in act) b.setAttribute('aria-pressed', String(act[b.dataset.cmd]))
  })
  $('[data-cmd="undo"]').disabled = !editor.can().undo()
  $('[data-cmd="redo"]').disabled = !editor.can().redo()
  $('#styleSel').value = editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'
}

// ---------- inspector ----------
let inspectorBusy = false

function context() {
  const sel = editor.state.selection
  const out = { node: null, ancestors: [] }
  if (sel.node && (sel.node.type.name === 'mergeField' || sel.node.type.name === 'signTag')) out.node = { node: sel.node, pos: sel.from }
  const $f = sel.$from
  for (let d = $f.depth; d > 0; d--) {
    const n = $f.node(d)
    if (['tableRow', 'table', 'eachBlock', 'ifBlock'].includes(n.type.name)) out.ancestors.push({ node: n, pos: $f.before(d), depth: d })
  }
  return out
}
function updateAt(pos, patch) {
  inspectorBusy = true
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const tr = editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch })
  editor.view.dispatch(tr)
  inspectorBusy = false
}
function sampleValue(tplSnippet, inLoop) {
  const rec = inLoop ? { ...SAMPLE_RECORD, __line: SAMPLE_RECORD.OpportunityLineItems[0] } : SAMPLE_RECORD
  try {
    if (inLoop) return renderPreview(`{{#each OpportunityLineItems limit="1"}}${tplSnippet}{{/each}}`, rec, env())
    return renderPreview(tplSnippet, rec, env())
  } catch (e) {
    return ''
  }
}

function fieldSection(c) {
  const { path, filter } = c.node.node.attrs
  const meta = fieldMeta(path)
  const type = meta ? meta.type : 'text'
  const { format, fallback } = splitFilter(filter)
  const opts = FORMAT_OPTIONS[type] || FORMAT_OPTIONS.any
  const known = opts.some(([v]) => v === format)
  const loop = insideLoop() || RELATED_PATHS.has(path)
  const value = sampleValue('{{' + path + (filter ? ' | ' + filter : '') + '}}', RELATED_PATHS.has(path))
  const warn = RELATED_PATHS.has(path) && !insideLoop() ? '<p class="note is-warn">This product field is outside a repeating row, so it will print empty. Move it into a line-items row.</p>' : ''
  return `<section class="isec">
    <p class="eyebrow">Merge field</p>
    <h2>${esc(meta ? meta.label : 'Custom path')}</h2>
    ${warn}
    <label class="flabel" for="insPath">Field path</label>
    <input id="insPath" class="mono" value="${esc(path)}" spellcheck="false">
    <label class="flabel" for="insFormat">Format</label>
    <select id="insFormat">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === format ? ' selected' : ''}>${esc(l)}</option>`).join('')}${known ? '' : `<option value="${esc(format)}" selected>${esc(format)}</option>`}</select>
    <label class="flabel" for="insFallback">If empty, print</label>
    <input id="insFallback" value="${esc(fallback)}" placeholder="Nothing">
    <div class="sample"><span>With the sample record</span><output>${value || '<em>empty</em>'}</output></div>
    <p class="code-line"><code>${esc('{{' + path + (filter ? ' | ' + filter : '') + '}}')}</code></p>
    <button type="button" class="ghost-btn danger" id="insRemove">Remove field</button>
  </section>`
}
function signSection(c) {
  const { kind, role, label, optional } = c.node.node.attrs
  const needsLabel = kind === 'text' || kind === 'checkbox'
  return `<section class="isec">
    <p class="eyebrow">Signer field</p>
    <h2>${esc(SIGN_KINDS[kind] || kind)} for ${esc(roleName(role))}</h2>
    <label class="flabel" for="insRole">Who fills it</label>
    <select id="insRole">${Object.keys(roles).map((r) => `<option value="${r}"${Number(r) === Number(role) ? ' selected' : ''}>Signer ${r} · ${esc(roles[r])}</option>`).join('')}</select>
    <label class="flabel" for="insKind">Field type</label>
    <select id="insKind">${Object.entries(SIGN_KINDS).map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
    ${needsLabel ? `<label class="flabel" for="insLabel">${kind === 'checkbox' ? 'Checkbox text' : 'Label'}</label><input id="insLabel" value="${esc(label)}">` : ''}
    <label class="check"><input type="checkbox" id="insOptional"${optional ? ' checked' : ''}> Signer may skip this field</label>
    <p class="code-line"><code>${esc('{{sign:' + kind + ':' + role + (label || optional ? ':' + label : '') + (optional ? ':optional' : '') + '}}')}</code></p>
    <button type="button" class="ghost-btn danger" id="insRemove">Remove field</button>
  </section>`
}
function rowSection(a) {
  const { each, orderBy, limit } = a.node.attrs
  const rel = RELATIONS.find((r) => r.api === each) || RELATIONS[0]
  return `<section class="isec" data-pos="${a.pos}">
    <p class="eyebrow">Table row</p>
    <h2>${each ? 'Repeats for each ' + esc(relationLabel(each).toLowerCase().replace(/s$/, '')) : 'Static row'}</h2>
    <label class="check"><input type="checkbox" id="rowRepeat"${each ? ' checked' : ''}> Repeat this row for every related record</label>
    ${each ? `
    <label class="flabel" for="rowRel">Related list</label>
    <select id="rowRel">${RELATIONS.map((r) => `<option value="${r.api}"${r.api === each ? ' selected' : ''}>${esc(r.label)} (${r.api})</option>`).join('')}</select>
    <div class="two">
      <div><label class="flabel" for="rowOrder">Sort by</label><select id="rowOrder"><option value="">Record order</option>${rel.orderFields.map((o) => `<option${o === orderBy ? ' selected' : ''}>${o}</option>`).join('')}</select></div>
      <div><label class="flabel" for="rowLimit">Max rows</label><input id="rowLimit" type="number" min="1" max="1000" value="${esc(limit)}" placeholder="All"></div>
    </div>` : '<p class="note">Turn on repeat to print one row per product. Fields from the Products list only fill inside a repeating row.</p>'}
  </section>`
}
function tableSection(a) {
  return `<section class="isec" data-pos="${a.pos}">
    <p class="eyebrow">Table</p>
    <div class="seg" role="group" aria-label="Table style">
      <button type="button" data-tvar="grid" aria-pressed="${a.node.attrs.variant !== 'plain'}">Grid lines</button>
      <button type="button" data-tvar="plain" aria-pressed="${a.node.attrs.variant === 'plain'}">No lines</button>
    </div>
    <div class="btn-grid">
      <button type="button" class="ghost-btn" data-tcmd="addRowAfter">Row below</button>
      <button type="button" class="ghost-btn" data-tcmd="addColumnAfter">Column right</button>
      <button type="button" class="ghost-btn" data-tcmd="deleteRow">Delete row</button>
      <button type="button" class="ghost-btn" data-tcmd="deleteColumn">Delete column</button>
      <button type="button" class="ghost-btn" data-tcmd="mergeOrSplit">Merge / split</button>
      <button type="button" class="ghost-btn danger" data-tcmd="deleteTable">Delete table</button>
    </div>
  </section>`
}
function eachSection(a) {
  const { relation, orderBy, limit } = a.node.attrs
  const rel = RELATIONS.find((r) => r.api === relation) || RELATIONS[0]
  return `<section class="isec" data-pos="${a.pos}">
    <p class="eyebrow">Repeat block</p>
    <h2>Repeat for each ${esc(rel.label.toLowerCase().replace(/s$/, ''))}</h2>
    <label class="flabel" for="eachRel">Related list</label>
    <select id="eachRel">${RELATIONS.map((r) => `<option value="${r.api}"${r.api === relation ? ' selected' : ''}>${esc(r.label)} (${r.api})</option>`).join('')}</select>
    <div class="two">
      <div><label class="flabel" for="eachOrder">Sort by</label><select id="eachOrder"><option value="">Record order</option>${rel.orderFields.map((o) => `<option${o === orderBy ? ' selected' : ''}>${o}</option>`).join('')}</select></div>
      <div><label class="flabel" for="eachLimit">Max</label><input id="eachLimit" type="number" min="1" value="${esc(limit)}" placeholder="All"></div>
    </div>
    <button type="button" class="ghost-btn danger" data-del="${a.pos}">Delete block</button>
  </section>`
}
function ifSection(a) {
  const cond = a.node.attrs.condition
  const hasElse = a.node.childCount > 1
  const res = sampleValue(`{{#if ${cond}}}TRUE{{else}}FALSE{{/if}}`) === 'TRUE'
  const fields = FIELD_GROUPS.filter((g) => !g.related && g.id !== 'builtins').flatMap((g) => g.fields.map((fl) => (g.prefix || '') + fl.api))
  const m = /^\s*([\w.$]+)\s*(==|!=|>=|<=|>|<|contains|startsWith)\s*(.+?)\s*$/.exec(cond) || []
  const ops = [['==', 'is'], ['!=', 'is not'], ['>', 'is greater than'], ['<', 'is less than'], ['>=', 'is at least'], ['<=', 'is at most'], ['contains', 'contains'], ['startsWith', 'starts with']]
  const simple = m.length && !/\s(and|or)\s/.test(cond)
  return `<section class="isec" data-pos="${a.pos}">
    <p class="eyebrow">Show if</p>
    <h2>Conditional content</h2>
    ${simple ? `<div class="cond">
      <select id="condField" aria-label="Field">${fields.map((x) => `<option${x === m[1] ? ' selected' : ''}>${x}</option>`).join('')}${fields.includes(m[1]) ? '' : `<option selected>${esc(m[1])}</option>`}</select>
      <select id="condOp" aria-label="Comparison">${ops.map(([v, l]) => `<option value="${v}"${v === m[2] ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input id="condVal" aria-label="Value" value="${esc(m[3])}">
    </div>` : ''}
    <label class="flabel" for="condRaw">Condition</label>
    <input id="condRaw" class="mono" value="${esc(cond)}" spellcheck="false">
    <p class="hint">Combine with <code>and</code> / <code>or</code>, negate with <code>not</code>. Quote text values.</p>
    <div class="sample"><span>With the sample record</span><output class="${res ? 'is-true' : 'is-false'}">${res ? 'Shown' : hasElse ? 'Hidden, “Otherwise” shown' : 'Hidden'}</output></div>
    <label class="check"><input type="checkbox" id="condElse"${hasElse ? ' checked' : ''}> Include an “Otherwise” part</label>
    <button type="button" class="ghost-btn danger" data-del="${a.pos}">Delete block</button>
  </section>`
}
function docSection() {
  const tpl = toTemplate(editor.getJSON())
  const json = editor.getJSON()
  const stats = { fields: 0, loops: 0, conds: 0, sign: {} }
  let strayProducts = 0
  const walkDoc = (n, inLoop) => {
    const loopHere = inLoop || n.type === 'eachBlock' || (n.type === 'tableRow' && n.attrs && n.attrs.each)
    if (n.type === 'mergeField') {
      stats.fields++
      if (RELATED_PATHS.has(n.attrs.path) && !loopHere) strayProducts++
    }
    if (n.type === 'eachBlock' || (n.type === 'tableRow' && n.attrs && n.attrs.each)) stats.loops++
    if (n.type === 'ifBlock') stats.conds++
    if (n.type === 'signTag') {
      const r = n.attrs.role
      stats.sign[r] = stats.sign[r] || { total: 0, signature: false }
      stats.sign[r].total++
      if (n.attrs.kind === 'signature') stats.sign[r].signature = true
    }
    ;(n.content || []).forEach((c) => walkDoc(c, loopHere))
  }
  walkDoc(json, false)
  const checks = pdfChecks(tpl).map((i) => ({ ...i }))
  checks.unshift({ level: 'ok', text: 'Layout uses tables and CSS the Salesforce PDF renderer supports.' })
  if (strayProducts) checks.push({ level: 'warn', text: `${strayProducts} product field${strayProducts > 1 ? 's are' : ' is'} outside a repeating row and will print empty.` })
  const signRoles = Object.keys(stats.sign)
  if (!signRoles.length) checks.push({ level: 'info', text: 'No signer fields yet. DocSign adds a signature block for each signer when you send.' })
  for (const r of Object.keys(roles)) {
    const s = stats.sign[r]
    if (s && !s.signature) checks.push({ level: 'warn', text: `${roleName(r)} has fields but no Signature field.` })
  }
  const roleRows = Object.keys(roles)
    .map((r) => {
      const s = stats.sign[r]
      return `<li class="dsx-role-${r}"><span class="signer-dot" aria-hidden="true"></span><span>${esc(roleName(r))}</span><span class="muted">${s ? s.total + ' field' + (s.total > 1 ? 's' : '') : 'no fields'}</span></li>`
    })
    .join('')
  return `<section class="isec">
    <p class="eyebrow">Template</p>
    <h2>${esc($('#tplName').value || 'Untitled template')}</h2>
    <dl class="stats">
      <div><dt>Fields</dt><dd>${stats.fields}</dd></div>
      <div><dt>Repeats</dt><dd>${stats.loops}</dd></div>
      <div><dt>Conditions</dt><dd>${stats.conds}</dd></div>
    </dl>
  </section>
  <section class="isec">
    <p class="eyebrow">PDF check</p>
    <ul class="checks">${checks.map((c) => `<li class="is-${c.level}"><span class="check-dot" aria-hidden="true"></span>${esc(c.text)}</li>`).join('')}</ul>
  </section>
  <section class="isec">
    <p class="eyebrow">Signing order</p>
    <ol class="roles">${roleRows}</ol>
  </section>
  <section class="isec tips">
    <p class="eyebrow">Shortcuts</p>
    <ul>
      <li><kbd>/</kbd> insert a block</li>
      <li>Drag a field onto the page</li>
      <li>Click a chip to format it</li>
      <li><kbd>Ctrl</kbd> <kbd>Z</kbd> undo</li>
    </ul>
  </section>`
}

function drawInspector() {
  if (inspectorBusy) return
  const c = context()
  let html = ''
  if (c.node) html += c.node.node.type.name === 'mergeField' ? fieldSection(c) : signSection(c)
  for (const a of c.ancestors) {
    if (a.node.type.name === 'tableRow' && !c.node) html += rowSection(a)
    if (a.node.type.name === 'table' && !c.node) html += tableSection(a)
    if (a.node.type.name === 'eachBlock' && !c.node) html += eachSection(a)
    if (a.node.type.name === 'ifBlock' && !c.node) html += ifSection(a)
  }
  if (!html) html = docSection()
  const ins = $('#inspector')
  const active = document.activeElement && ins.contains(document.activeElement) ? document.activeElement.id : null
  ins.innerHTML = html
  if (active && $('#' + active)) $('#' + active).focus()
  ins.dataset.ctx = c.node ? 'node' : c.ancestors.length ? 'block' : 'doc'
}

const ins = $('#inspector')
ins.addEventListener('change', (e) => {
  const c = context()
  const id = e.target.id
  if (c.node && c.node.node.type.name === 'mergeField') {
    const { format, fallback } = splitFilter(c.node.node.attrs.filter)
    if (id === 'insPath') updateAt(c.node.pos, { path: e.target.value.trim() || 'Name' })
    if (id === 'insFormat') updateAt(c.node.pos, { filter: joinFilter(e.target.value, fallback) })
    if (id === 'insFallback') updateAt(c.node.pos, { filter: joinFilter(format, e.target.value.trim()) })
  } else if (c.node && c.node.node.type.name === 'signTag') {
    if (id === 'insRole') updateAt(c.node.pos, { role: Number(e.target.value) })
    if (id === 'insKind') {
      const kind = e.target.value
      const label = kind === 'text' ? 'Company' : kind === 'checkbox' ? 'I agree' : ''
      updateAt(c.node.pos, { kind, label })
    }
    if (id === 'insLabel') updateAt(c.node.pos, { label: e.target.value.replace(/[:{}]/g, ' ').trim() })
    if (id === 'insOptional') updateAt(c.node.pos, { optional: e.target.checked })
  }
  const sec = e.target.closest('[data-pos]')
  if (sec) {
    const pos = Number(sec.dataset.pos)
    if (id === 'rowRepeat') updateAt(pos, e.target.checked ? { each: 'OpportunityLineItems', orderBy: 'SortOrder', limit: '200' } : { each: null, orderBy: '', limit: '' })
    if (id === 'rowRel') updateAt(pos, { each: e.target.value })
    if (id === 'rowOrder') updateAt(pos, { orderBy: e.target.value })
    if (id === 'rowLimit') updateAt(pos, { limit: e.target.value ? String(Math.max(1, parseInt(e.target.value, 10) || 1)) : '' })
    if (id === 'eachRel') updateAt(pos, { relation: e.target.value })
    if (id === 'eachOrder') updateAt(pos, { orderBy: e.target.value })
    if (id === 'eachLimit') updateAt(pos, { limit: e.target.value ? String(Math.max(1, parseInt(e.target.value, 10) || 1)) : '' })
    if (id === 'condRaw') updateAt(pos, { condition: e.target.value.replace(/[{}]/g, '').trim() || 'true' })
    if (id === 'condField' || id === 'condOp' || id === 'condVal') {
      let v = $('#condVal').value.trim()
      if (v && !/^-?\d+(\.\d+)?$/.test(v) && !/^".*"$/.test(v) && !['true', 'false', 'null'].includes(v)) v = '"' + v.replace(/"/g, '') + '"'
      updateAt(pos, { condition: `${$('#condField').value} ${$('#condOp').value} ${v || '""'}` })
    }
    if (id === 'condElse') toggleElse(pos, e.target.checked)
  }
  drawInspector()
  persistSoon()
})
ins.addEventListener('click', (e) => {
  const c = context()
  if (e.target.id === 'insRemove' && c.node) {
    editor.chain().focus().deleteSelection().run()
    return
  }
  const tv = e.target.closest('[data-tvar]')
  if (tv) {
    const sec = tv.closest('[data-pos]')
    updateAt(Number(sec.dataset.pos), { variant: tv.dataset.tvar })
    drawInspector()
    return
  }
  const tc = e.target.closest('[data-tcmd]')
  if (tc) {
    editor.chain().focus()[tc.dataset.tcmd]().run()
    return
  }
  const del = e.target.closest('[data-del]')
  if (del) {
    const pos = Number(del.dataset.del)
    const node = editor.state.doc.nodeAt(pos)
    if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
  }
})
function toggleElse(pos, on) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const { schema } = editor.state
  inspectorBusy = true
  if (on && node.childCount === 1) {
    editor.view.dispatch(editor.state.tr.insert(pos + node.nodeSize - 1, schema.nodes.ifElse.create(null, schema.nodes.paragraph.create(null, schema.text('Otherwise, this text prints.')))))
  } else if (!on && node.childCount > 1) {
    const first = node.child(0)
    const start = pos + 1 + first.nodeSize
    editor.view.dispatch(editor.state.tr.delete(start, start + node.child(1).nodeSize))
  }
  inspectorBusy = false
}

// ---------- modes ----------
let mode = 'design'
const PREVIEW_CSS = `<style>
html { background: #fff; }
body { margin: 0; padding: 56px 60px; }
.pv-sign { display: inline-block; min-width: 180px; padding: 6px 10px 4px 10px; border: 1px dashed #b45309; background: #fff7ed; color: #7c2d12; font-size: 9pt; border-radius: 3px; }
.pv-sign b { font-weight: 600; margin-right: 4px; }
.pv-kind-signature { min-height: 30px; min-width: 220px; }
.pv-kind-checkbox { min-width: 0; }
.pv-role-2 { border-color: #0f766e; background: #f0fdfa; color: #134e4a; }
.pv-role-3 { border-color: #6d28d9; background: #f5f3ff; color: #4c1d95; }
.pv-role-4 { border-color: #be185d; background: #fdf2f8; color: #831843; }
@media (max-width: 600px) { body { padding: 20px; } }
</style>`
function setMode(m) {
  mode = m
  $$('.mode').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === m)))
  $('#paper').hidden = m !== 'design'
  $('#toolbar').hidden = m !== 'design'
  $('#previewWrap').hidden = m !== 'preview'
  $('#codeWrap').hidden = m !== 'code'
  document.body.dataset.mode = m
  const tpl = toTemplate(editor.getJSON())
  if (m === 'preview') {
    const frame = $('#previewFrame')
    const html = renderPreview(tpl, SAMPLE_RECORD, env())
    frame.onload = () => {
      try {
        frame.style.height = frame.contentDocument.documentElement.scrollHeight + 'px'
      } catch (e) {}
    }
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${PREVIEW_CSS}</head><body>${html}</body></html>`
  }
  if (m === 'code') {
    $('#codeArea').value = tpl
    drawCodeIssues()
  }
}
$$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)))

function drawCodeIssues() {
  const issues = pdfChecks($('#codeArea').value)
  $('#codeIssues').innerHTML = issues.length ? issues.map((i) => `<li class="is-${i.level}"><span class="check-dot" aria-hidden="true"></span>${esc(i.text)}</li>`).join('') : '<li class="is-ok"><span class="check-dot" aria-hidden="true"></span>Ready for the PDF renderer.</li>'
}
$('#codeArea').addEventListener('input', drawCodeIssues)
$('#codeApply').addEventListener('click', () => {
  editor.commands.setContent(fromTemplate($('#codeArea').value), true)
  toast('Template applied to the design view.')
  setMode('design')
})
$('#codeCopy').addEventListener('click', () => {
  const ta = $('#codeArea')
  const done = () => toast('Template copied.')
  try {
    navigator.clipboard.writeText(ta.value).then(done, () => {
      ta.select()
      toast('Text selected. Press Ctrl+C to copy.')
    })
  } catch (e) {
    ta.select()
    toast('Text selected. Press Ctrl+C to copy.')
  }
})

// ---------- persistence ----------
let persistTimer = null
function persist() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ name: $('#tplName').value, tpl: toTemplate(editor.getJSON()), roles }))
    $('#saveState').textContent = 'Draft saved in this browser'
  } catch (e) {
    $('#saveState').textContent = 'Draft not saved (browser storage is off)'
  }
}
function persistSoon() {
  $('#saveState').textContent = 'Saving…'
  clearTimeout(persistTimer)
  persistTimer = setTimeout(persist, 700)
}
$('#tplName').addEventListener('input', persistSoon)
$('#resetBtn').addEventListener('click', () => {
  const btn = $('#resetBtn')
  if (btn.dataset.confirm !== '1') {
    btn.dataset.confirm = '1'
    btn.textContent = 'Click again to reset'
    setTimeout(() => {
      btn.dataset.confirm = ''
      btn.textContent = 'Reset sample'
    }, 3000)
    return
  }
  btn.dataset.confirm = ''
  btn.textContent = 'Reset sample'
  roles = { ...DEFAULT_ROLES }
  $('#tplName').value = 'Sales Quote'
  editor.commands.setContent(fromTemplate(SAMPLE_TEMPLATE), true)
  drawSigners()
  refreshNodeViews()
  setMode('design')
  persist()
  toast('Sample template restored.')
})

// ---------- toast ----------
let toastTimer = null
function toast(msg) {
  const el = $('#toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), 4200)
}

// ---------- wiring ----------
editor.on('selectionUpdate', () => {
  syncToolbar()
  drawInspector()
  checkSlash()
})
editor.on('update', () => {
  syncToolbar()
  if (!inspectorBusy) drawInspector()
  checkSlash()
  persistSoon()
})
editor.on('blur', () => setTimeout(() => { if (!editor.isFocused) hideSlash() }, 150))
window.addEventListener('resize', hideSlash)
$('.desk').addEventListener('scroll', hideSlash, { passive: true })

syncToolbar()
drawInspector()
$('#objName').textContent = OBJECT_NAME
window.__dsx = { editor, toTemplate, fromTemplate, renderPreview }
