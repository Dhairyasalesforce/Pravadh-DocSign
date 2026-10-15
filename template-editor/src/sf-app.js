// Pravadh DocSign: visual template editor running inside the DocSignTemplateEditor
// Visualforce page. All Salesforce data arrives through the hosting docSignTemplateEditor
// LWC over postMessage (exact origin + one-time nonce); this frame makes no server calls.
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import { MergeField, SignTag, DsxTable, RepeatRow, EachBlock, IfBlock, IfThen, IfElse, PageBreak, SIGN_KINDS } from './extensions.js'
import { toTemplate, fromTemplate, pdfChecks } from './template.js'

const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const ROLE_COUNT = 6

const cfg = window.DocSignTemplateEditorConfig || {}
const PARENT = cfg.parentOrigin
const NONCE = cfg.nonce

// ---------------------------------------------------------------- messaging
let rpcSeq = 0
const pending = new Map()
function post(msg) {
  if (!PARENT || !NONCE) return
  window.parent.postMessage({ ...msg, nonce: NONCE }, PARENT)
}
function rpc(method, args) {
  const id = 'r' + ++rpcSeq
  post({ type: 'dstpl:rpc', id, method, args })
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id)
        reject(new Error('Salesforce did not answer in time.'))
      }
    }, 30000)
  })
}
window.addEventListener('message', (event) => {
  const d = event.data
  if (event.origin !== PARENT || !d || typeof d !== 'object' || d.nonce !== NONCE) return
  if (d.type === 'dstpl:rpc-result' && pending.has(d.id)) {
    const p = pending.get(d.id)
    pending.delete(d.id)
    if (d.ok) p.resolve(d.result)
    else p.reject(new Error(d.error || 'Request failed'))
  } else if (d.type === 'dstpl:load') {
    load(d)
  } else if (d.type === 'dstpl:insert') {
    if (d.kind === 'starter' && typeof d.html === 'string') insertHtml(d.html)
  }
})

// ---------------------------------------------------------------- schema
const describeCache = new Map()
async function describe(objectApiName) {
  if (!objectApiName) return []
  if (!describeCache.has(objectApiName)) {
    describeCache.set(
      objectApiName,
      rpc('describeObject', [objectApiName]).catch((e) => {
        describeCache.delete(objectApiName)
        throw e
      }),
    )
  }
  return describeCache.get(objectApiName)
}
let state = { objectApiName: '', rootFields: [], children: [], loaded: false }
const fieldTypes = new Map() // path -> TYPE (root-level and visited paths)

function defaultFilter(type) {
  switch (type) {
    case 'CURRENCY': return 'currency'
    case 'DATE': return 'date:"d MMM yyyy"'
    case 'DATETIME': return 'datetime:"d MMM yyyy HH:mm"'
    case 'PERCENT': return 'percent:1'
    case 'DOUBLE': return 'number:2'
    case 'INTEGER': return 'number:0'
  }
  return ''
}
const FORMAT_OPTIONS = {
  any: [['', 'As stored'], ['upper', 'UPPERCASE'], ['lower', 'lowercase'], ['title', 'Title Case']],
  BOOLEAN: [['yesno', 'Yes / No'], ['', 'As stored']],
  CURRENCY: [['currency', 'Currency'], ['number:2', 'Number, 2 decimals'], ['number:0', 'Number, no decimals'], ['', 'As stored']],
  DOUBLE: [['number:2', 'Number, 2 decimals'], ['number:0', 'Number, no decimals'], ['currency', 'Currency'], ['', 'As stored']],
  INTEGER: [['number:0', 'Number'], ['', 'As stored']],
  PERCENT: [['percent:1', '7.5%'], ['percent:0', '8%'], ['percent:2', '7.50%'], ['number:1', 'Number, 1 decimal'], ['', 'As stored']],
  DATE: [['date:"d MMM yyyy"', '14 Oct 2026'], ['date:"dd/MM/yyyy"', '14/10/2026'], ['date:"MM/dd/yyyy"', '10/14/2026'], ['date:"MMMM d, yyyy"', 'October 14, 2026'], ['date:"yyyy-MM-dd"', '2026-10-14'], ['', 'As stored']],
  DATETIME: [['datetime:"d MMM yyyy HH:mm"', '14 Oct 2026 17:45'], ['datetime:"d MMM yyyy h:mm a"', '14 Oct 2026 5:45 PM'], ['date:"d MMM yyyy"', '14 Oct 2026 (date only)'], ['', 'As stored']],
}
const TYPE_BADGE = { STRING: 'Aa', TEXTAREA: 'Aa', CURRENCY: '$', DATE: 'Date', DATETIME: 'Time', PICKLIST: 'List', MULTIPICKLIST: 'List', PERCENT: '%', DOUBLE: '#', INTEGER: '#', EMAIL: '@', PHONE: 'Tel', URL: 'Link', BOOLEAN: 'Y/N', REFERENCE: 'Id', ID: 'Id' }

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
const joinFilter = (format, fallback) => [format, fallback ? `default:"${fallback.replace(/"/g, "'")}"` : ''].filter(Boolean).join(' | ')

// ---------------------------------------------------------------- editor
const roleName = (r) => 'Signer ' + r
const relationLabel = (api) => {
  const c = state.children.find((x) => x.apiName === api)
  return c ? c.label.replace(/\s*\([^)]*\)$/, '') : api
}

let editor = null
let suppress = false
let changeTimer = null

function buildEditor(html) {
  editor = new Editor({
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
    content: html,
    editorProps: {
      attributes: { spellcheck: 'true', 'aria-label': 'Template body' },
      handleDrop(view, event, slice, moved) {
        if (moved) return false
        const raw = event.dataTransfer && event.dataTransfer.getData('application/x-dsx')
        if (!raw) return false
        const at = view.posAtCoords({ left: event.clientX, top: event.clientY })
        if (!at) return false
        event.preventDefault()
        editor.chain().focus().insertContentAt(at.pos, JSON.parse(raw)).run()
        return true
      },
      handleKeyDown(view, event) {
        if (!slash.open) return false
        if (event.key === 'ArrowDown') { slash.active = (slash.active + 1) % slash.items.length; drawSlash(); return true }
        if (event.key === 'ArrowUp') { slash.active = (slash.active - 1 + slash.items.length) % slash.items.length; drawSlash(); return true }
        if (event.key === 'Enter' || event.key === 'Tab') { runSlash(slash.items[slash.active]); return true }
        if (event.key === 'Escape') { hideSlash(); return true }
        return false
      },
    },
  })
  editor.on('selectionUpdate', () => { syncToolbar(); drawInspector(); checkSlash() })
  editor.on('update', () => {
    syncToolbar()
    if (!inspectorBusy) drawInspector()
    checkSlash()
    if (!suppress) emitChange()
  })
  editor.on('blur', () => setTimeout(() => { if (!editor.isFocused) hideSlash() }, 150))
}

function emitChange() {
  clearTimeout(changeTimer)
  changeTimer = setTimeout(() => post({ type: 'dstpl:change', body: toTemplate(editor.getJSON(), { salesforce: true }) }), 250)
}

async function load(d) {
  const html = fromTemplate(typeof d.body === 'string' ? d.body : '')
  if (!editor) buildEditor(html)
  else {
    suppress = true
    editor.commands.setContent(html, false)
    suppress = false
  }
  // Report the normalised body once, so the host saves the visual-editor form.
  emitChange()
  if (d.objectApiName !== state.objectApiName) {
    state = { objectApiName: d.objectApiName || '', rootFields: [], children: [], loaded: false }
    explorer.stack = d.objectApiName ? [{ objectApiName: d.objectApiName, prefix: '', label: d.objectApiName, kind: 'root' }] : []
    $('#objName').textContent = d.objectApiName || 'No object'
    await loadRoot()
  }
  syncToolbar()
  drawInspector()
}

async function loadRoot() {
  if (!state.objectApiName) {
    drawExplorer()
    return
  }
  try {
    const rows = await describe(state.objectApiName)
    state.rootFields = rows.filter((r) => r.kind === 'field')
    state.children = rows.filter((r) => r.kind === 'child')
    state.rootFields.forEach((f) => fieldTypes.set(f.apiName, f.type))
    state.loaded = true
  } catch (e) {
    toast(e.message)
  }
  await drawExplorer()
  drawInspector()
}

function insertHtml(tpl) {
  const json = fromTemplate(tpl)
  editor.chain().focus().insertContent(json).run()
}

// ---------------------------------------------------------------- insert helpers
const p = (...content) => ({ type: 'paragraph', content })
const t = (text, marks) => (marks ? { type: 'text', text, marks: marks.map((m) => ({ type: m })) } : { type: 'text', text })
const f = (path, filter = '') => ({ type: 'mergeField', attrs: { path, filter } })
const sg = (kind, role, label = '', optional = false) => ({ type: 'signTag', attrs: { kind, role, label, optional } })
const rp = (align, ...content) => ({ type: 'paragraph', attrs: { textAlign: align }, content })

function insert(content) {
  editor.chain().focus().insertContent(content).run()
}
function insideLoop() {
  const $f = editor.state.selection.$from
  for (let d = $f.depth; d > 0; d--) {
    const n = $f.node(d)
    if (n.type.name === 'eachBlock' || (n.type.name === 'tableRow' && n.attrs.each)) return true
  }
  return false
}

async function loopTable(rel) {
  const child = state.children.find((c) => c.apiName === rel)
  let cols = [{ label: 'Name', api: 'Name', type: 'STRING' }]
  if (child) {
    try {
      const rows = (await describe(child.childObject)).filter((r) => r.kind === 'field')
      const pick = (api) => rows.find((r) => r.apiName === api)
      const chosen = ['Product2Id', 'Name', 'Quantity', 'UnitPrice', 'TotalPrice', 'Amount', 'Status', 'CreatedDate'].map(pick).filter(Boolean)
      if (chosen[0] && chosen[0].apiName === 'Product2Id' && chosen[1] && chosen[1].apiName === 'Name') chosen.splice(1, 1)
      const fill = chosen.length >= 2 ? chosen : rows.filter((r) => !['Id', 'IsDeleted', 'SystemModstamp'].includes(r.apiName)).slice(0, 4)
      cols = fill.slice(0, 4).map((r) => (r.apiName === 'Product2Id' ? { label: 'Product', api: 'Product2.Name', type: 'STRING' } : { label: r.label, api: r.apiName, type: r.type }))
    } catch (e) {
      /* keep the Name column */
    }
  }
  const num = (ty) => ['CURRENCY', 'DOUBLE', 'INTEGER', 'PERCENT'].includes(ty)
  const th = (txt, align = 'left') => ({ type: 'tableHeader', content: [rp(align, t(txt))] })
  const td = (align, ...c) => ({ type: 'tableCell', content: [rp(align, ...c)] })
  return {
    type: 'table',
    attrs: { variant: 'grid' },
    content: [
      { type: 'tableRow', content: [th('#'), ...cols.map((c) => th(c.label, num(c.type) ? 'right' : 'left'))] },
      { type: 'tableRow', attrs: { each: rel, orderBy: '', limit: '' }, content: [td('left', f('$index')), ...cols.map((c) => td(num(c.type) ? 'right' : 'left', f(c.api, defaultFilter(c.type))))] },
    ],
  }
}
function nameField() {
  const n = state.rootFields.find((x) => x.apiName === 'Name')
  return n ? 'Name' : state.rootFields.length ? state.rootFields[0].apiName : 'Id'
}
function signatureBlock() {
  const col = (role) => ({ type: 'tableCell', content: [p(t('For ' + roleName(role), ['bold'])), p(sg('signature', role)), p(sg('name', role)), p(sg('date', role))] })
  return { type: 'table', attrs: { variant: 'plain' }, content: [{ type: 'tableRow', content: [col(1), col(2)] }] }
}
function conditionBlock() {
  const pick = state.rootFields.find((x) => /PICKLIST|STRING/.test(x.type) && x.apiName !== 'Name') || state.rootFields[0]
  const field = pick ? pick.apiName : 'Name'
  return {
    type: 'ifBlock',
    attrs: { condition: `${field} == "Value"` },
    content: [
      { type: 'ifThen', content: [p(t('Shown when the condition is true.'))] },
      { type: 'ifElse', content: [p(t('Shown otherwise.'))] },
    ],
  }
}
function repeatBlock(rel) {
  return { type: 'eachBlock', attrs: { relation: rel, orderBy: '', limit: '' }, content: [p(f('Name'))] }
}
const firstChild = () => (state.children[0] ? state.children[0].apiName : null)

const BLOCKS = [
  { id: 'lines', label: 'Related records table', hint: 'One row per child record', keys: 'table products lines items repeat related', run: async () => { const rel = explorer.childRel() || firstChild(); if (!rel) return toast('This object has no related lists.'); insert(await loopTable(rel)) } },
  { id: 'sigblock', label: 'Signature block', hint: 'Two signers, name and date', keys: 'signature sign block', run: () => insert(signatureBlock()) },
  { id: 'if', label: 'Show if…', hint: 'Content that depends on a field', keys: 'condition if show when', run: () => insert(conditionBlock()) },
  { id: 'each', label: 'Repeat block', hint: 'Paragraphs per related record', keys: 'repeat each loop', run: () => { const rel = explorer.childRel() || firstChild(); if (!rel) return toast('This object has no related lists.'); insert(repeatBlock(rel)) } },
  { id: 'h1', label: 'Heading 1', hint: 'Document title', keys: 'heading title h1', run: () => editor.chain().focus().setNode('heading', { level: 1 }).run() },
  { id: 'h2', label: 'Heading 2', hint: 'Section', keys: 'heading section h2', run: () => editor.chain().focus().setNode('heading', { level: 2 }).run() },
  { id: 'table', label: 'Table', hint: '3 × 3 with header', keys: 'table grid', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: 'list', label: 'Bulleted list', hint: '', keys: 'list bullet', run: () => editor.chain().focus().toggleBulletList().run() },
  { id: 'sig', label: 'Signature field', hint: 'Signer 1 signs here', keys: 'signature sign', run: () => insert(sg('signature', 1)) },
  { id: 'date', label: 'Date signed', hint: 'Filled when signer 1 signs', keys: 'date signed', run: () => insert(sg('date', 1)) },
  { id: 'today', label: 'Today’s date', hint: '{{$Today}}', keys: 'today date', run: () => insert(f('$Today', 'date:"d MMM yyyy"')) },
  { id: 'break', label: 'Page break', hint: 'Start a new PDF page', keys: 'page break new', run: () => insert({ type: 'pageBreak' }) },
  { id: 'field', label: 'Field…', hint: 'Search the record’s fields', keys: 'field merge value', run: () => { setPanel('fields'); $('#fieldSearch').focus() } },
]

// ---------------------------------------------------------------- slash menu
const slash = { open: false, items: [], active: 0, from: 0, to: 0 }
function checkSlash() {
  const sel = editor.state.selection
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
  $('#slash').innerHTML = '<div class="slash-head">Insert</div>' + slash.items.map((b, i) => `<button type="button" class="slash-item${i === slash.active ? ' is-active' : ''}" data-i="${i}"><span class="slash-label">${esc(b.label)}</span><span class="slash-hint">${esc(b.hint)}</span></button>`).join('')
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

// ---------------------------------------------------------------- left panel
function setPanel(name) {
  $$('.ptab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.panel === name)))
  $$('.ppanel').forEach((el) => (el.hidden = el.id !== 'panel-' + name))
}

const explorer = {
  stack: [],
  filter: '',
  top() { return this.stack[this.stack.length - 1] },
  childRel() {
    const c = this.stack.find((s) => s.kind === 'child')
    return c ? c.rel : null
  },
}
const BUILTINS = [
  { api: '$Today', label: 'Today', type: 'DATE' },
  { api: '$Now', label: 'Now', type: 'STRING' },
  { api: '$User.Name', label: 'Current user', type: 'STRING' },
  { api: '$Org.Name', label: 'Company name', type: 'STRING' },
  { api: '$index', label: 'Row number (in a loop)', type: 'INTEGER' },
  { api: '$PageNumber', label: 'Page number', type: 'INTEGER' },
  { api: '$PageCount', label: 'Page count', type: 'INTEGER' },
]
let explorerRows = []
async function drawExplorer() {
  const list = $('#fieldList')
  const top = explorer.top()
  if (!top) {
    list.innerHTML = '<p class="empty">Choose an object for the template first.</p>'
    $('#crumbs').innerHTML = ''
    return
  }
  $('#crumbs').innerHTML = explorer.stack.map((s, i) => (i === explorer.stack.length - 1 ? `<span>${esc(i === 0 ? s.objectApiName : s.label)}</span>` : `<button type="button" class="crumb" data-i="${i}">${esc(i === 0 ? s.objectApiName : s.label)}</button>`)).join('<span class="sep">›</span>')
  list.innerHTML = '<p class="empty">Loading fields…</p>'
  try {
    explorerRows = await describe(top.objectApiName)
  } catch (e) {
    list.innerHTML = `<p class="empty">${esc(e.message)}</p>`
    return
  }
  renderExplorer()
}
function renderExplorer() {
  const top = explorer.top()
  const q = explorer.filter.trim().toLowerCase()
  const match = (r) => !q || r.label.toLowerCase().includes(q) || r.apiName.toLowerCase().includes(q)
  const rows = explorerRows.filter((r) => !(top.kind === 'child' && r.kind === 'child')).filter(match)
  const groups = [
    ['field', 'Fields'],
    ['parent', 'Parent records'],
    ['child', 'Related lists'],
  ]
  let html = ''
  if (top.kind === 'child') {
    html += `<div class="loopnote"><p>Fields here repeat once per <b>${esc(relationLabel(explorer.childRel()))}</b> record. Place them in a repeating row.</p><button type="button" class="ghost-btn" id="insLoopTable">Insert table for these records</button></div>`
  }
  for (const [kind, label] of groups) {
    const items = rows.filter((r) => r.kind === kind).sort((a, b) => a.label.localeCompare(b.label)).slice(0, 300)
    if (!items.length) continue
    html += `<section class="fgroup"><h3>${label}</h3><ul>${items
      .map((r) => {
        const badge = kind === 'field' ? TYPE_BADGE[r.type] || 'Aa' : kind === 'parent' ? '↑' : '↓'
        const meta = kind === 'field' ? top.prefix + r.apiName : kind === 'parent' ? '→ ' + r.referenceTo : 'list of ' + r.childObject
        return `<li><button type="button" class="fitem${kind !== 'field' ? ' is-nav' : ''}" ${kind === 'field' ? 'draggable="true"' : ''} data-kind="${kind}" data-api="${esc(r.apiName)}"><span class="fitem-type">${badge}</span><span class="fitem-text"><span class="fitem-label">${esc(r.label)}</span><code>${esc(meta)}</code></span></button></li>`
      })
      .join('')}</ul></section>`
  }
  if (explorer.stack.length === 1) {
    const b = BUILTINS.filter(match)
    if (b.length) html += `<section class="fgroup"><h3>Built-in values</h3><ul>${b.map((r) => `<li><button type="button" class="fitem" draggable="true" data-kind="builtin" data-api="${esc(r.api)}"><span class="fitem-type">${TYPE_BADGE[r.type]}</span><span class="fitem-text"><span class="fitem-label">${esc(r.label)}</span><code>${esc(r.api)}</code></span></button></li>`).join('')}</ul></section>`
  }
  $('#fieldList').innerHTML = html || '<p class="empty">No field matches. Try the API name.</p>'
}
function fieldNodeFor(btn) {
  const top = explorer.top()
  if (btn.dataset.kind === 'builtin') {
    const b = BUILTINS.find((x) => x.api === btn.dataset.api)
    return f(b.api, defaultFilter(b.type))
  }
  const r = explorerRows.find((x) => x.kind === 'field' && x.apiName === btn.dataset.api)
  const path = top.prefix + r.apiName
  fieldTypes.set(path, r.type)
  return f(path, defaultFilter(r.type))
}
async function navExplorer(btn) {
  const top = explorer.top()
  const r = explorerRows.find((x) => x.kind === btn.dataset.kind && x.apiName === btn.dataset.api)
  if (!r) return
  if (r.kind === 'parent') {
    if (explorer.stack.length >= 6) return toast('Salesforce supports up to 5 relationship levels.')
    explorer.stack.push({ objectApiName: r.referenceTo, prefix: top.prefix + r.relationshipName + '.', label: r.relationshipName, kind: top.kind === 'child' ? 'child' : 'parent', rel: top.rel })
  } else if (r.kind === 'child') {
    explorer.stack.push({ objectApiName: r.childObject, prefix: '', label: r.relationshipName, kind: 'child', rel: r.relationshipName })
  }
  explorer.filter = ''
  $('#fieldSearch').value = ''
  await drawExplorer()
}

function drawBlocks() {
  const main = BLOCKS.filter((b) => ['lines', 'sigblock', 'if', 'each', 'table', 'break'].includes(b.id))
  $('#blockList').innerHTML = main.map((b) => `<button type="button" class="bitem" data-id="${b.id}"><span class="bitem-label">${esc(b.label)}</span><span class="bitem-hint">${esc(b.hint)}</span></button>`).join('')
}
function drawSigners() {
  const kinds = Object.entries(SIGN_KINDS)
  let html = ''
  for (let r = 1; r <= ROLE_COUNT; r++) {
    html += `<section class="signer dsx-role-${((r - 1) % 4) + 1}"><div class="signer-head"><span class="signer-dot" aria-hidden="true"></span><b>Signer ${r}</b></div><div class="signer-kinds">${kinds.map(([k, label]) => `<button type="button" class="kind" data-role="${r}" data-kind="${k}" draggable="true">${label}</button>`).join('')}</div></section>`
  }
  $('#signerList').innerHTML = html
}

// ---------------------------------------------------------------- toolbar
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
function syncToolbar() {
  if (!editor) return
  const act = {
    bold: editor.isActive('bold'), italic: editor.isActive('italic'), underline: editor.isActive('underline'),
    left: editor.isActive({ textAlign: 'left' }), center: editor.isActive({ textAlign: 'center' }), right: editor.isActive({ textAlign: 'right' }),
    bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'),
  }
  $$('#toolbar [data-cmd]').forEach((b) => { if (b.dataset.cmd in act) b.setAttribute('aria-pressed', String(act[b.dataset.cmd])) })
  $('[data-cmd="undo"]').disabled = !editor.can().undo()
  $('[data-cmd="redo"]').disabled = !editor.can().redo()
  $('#styleSel').value = editor.isActive('heading', { level: 1 }) ? '1' : editor.isActive('heading', { level: 2 }) ? '2' : editor.isActive('heading', { level: 3 }) ? '3' : 'p'
}

// ---------------------------------------------------------------- inspector
let inspectorBusy = false
function context() {
  const sel = editor.state.selection
  const out = { node: null, ancestors: [] }
  if (sel.node && (sel.node.type.name === 'mergeField' || sel.node.type.name === 'signTag')) out.node = { node: sel.node, pos: sel.from }
  const $f = sel.$from
  for (let d = $f.depth; d > 0; d--) {
    const n = $f.node(d)
    if (['tableRow', 'table', 'eachBlock', 'ifBlock'].includes(n.type.name)) out.ancestors.push({ node: n, pos: $f.before(d) })
  }
  return out
}
function updateAt(pos, patch) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  inspectorBusy = true
  editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...patch }))
  inspectorBusy = false
}
const relOptions = (sel) => state.children.map((c) => `<option value="${esc(c.apiName)}"${c.apiName === sel ? ' selected' : ''}>${esc(c.label)}</option>`).join('') + (sel && !state.children.some((c) => c.apiName === sel) ? `<option selected>${esc(sel)}</option>` : '')

function fieldSection(c) {
  const { path, filter } = c.node.node.attrs
  const type = fieldTypes.get(path) || (path === '$Today' ? 'DATE' : null)
  const { format, fallback } = splitFilter(filter)
  const opts = FORMAT_OPTIONS[type] || FORMAT_OPTIONS.any
  const known = opts.some(([v]) => v === format)
  return `<section class="isec"><p class="eyebrow">Merge field</p><h2 class="mono">${esc(path)}</h2>
    <label class="flabel" for="insPath">Field path</label><input id="insPath" class="mono" value="${esc(path)}" spellcheck="false">
    <label class="flabel" for="insFormat">Format</label><select id="insFormat">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === format ? ' selected' : ''}>${esc(l)}</option>`).join('')}${known ? '' : `<option value="${esc(format)}" selected>${esc(format)}</option>`}</select>
    <label class="flabel" for="insFallback">If empty, print</label><input id="insFallback" value="${esc(fallback)}" placeholder="Nothing">
    <p class="code-line"><code>${esc('{{' + path + (filter ? ' | ' + filter : '') + '}}')}</code></p>
    <button type="button" class="ghost-btn danger" id="insRemove">Remove field</button></section>`
}
function signSection(c) {
  const { kind, role, label, optional } = c.node.node.attrs
  const needsLabel = kind === 'text' || kind === 'checkbox'
  let roles = ''
  for (let r = 1; r <= ROLE_COUNT; r++) roles += `<option value="${r}"${r === Number(role) ? ' selected' : ''}>Signer ${r}</option>`
  return `<section class="isec"><p class="eyebrow">Signer field</p><h2>${esc(SIGN_KINDS[kind] || kind)} for Signer ${esc(role)}</h2>
    <label class="flabel" for="insRole">Who fills it</label><select id="insRole">${roles}</select>
    <label class="flabel" for="insKind">Field type</label><select id="insKind">${Object.entries(SIGN_KINDS).map(([k, l]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${l}</option>`).join('')}</select>
    ${needsLabel ? `<label class="flabel" for="insLabel">${kind === 'checkbox' ? 'Checkbox text' : 'Label'}</label><input id="insLabel" value="${esc(label)}">` : ''}
    <label class="check"><input type="checkbox" id="insOptional"${optional ? ' checked' : ''}> Signer may skip this field</label>
    <button type="button" class="ghost-btn danger" id="insRemove">Remove field</button></section>`
}
function rowSection(a) {
  const { each, orderBy, limit } = a.node.attrs
  return `<section class="isec" data-pos="${a.pos}"><p class="eyebrow">Table row</p><h2>${each ? 'Repeats for each ' + esc(relationLabel(each)) + ' record' : 'Static row'}</h2>
    <label class="check"><input type="checkbox" id="rowRepeat"${each ? ' checked' : ''}${state.children.length ? '' : ' disabled'}> Repeat this row for every related record</label>
    ${each ? `<label class="flabel" for="rowRel">Related list</label><select id="rowRel">${relOptions(each)}</select>
    <div class="two"><div><label class="flabel" for="rowOrder">Sort by</label><input id="rowOrder" class="mono" value="${esc(orderBy)}" placeholder="e.g. SortOrder"></div>
    <div><label class="flabel" for="rowLimit">Max rows</label><input id="rowLimit" type="number" min="1" max="2000" value="${esc(limit)}" placeholder="All"></div></div>` : `<p class="note">${state.children.length ? 'Turn on repeat to print one row per related record.' : 'This object has no related lists to repeat.'}</p>`}</section>`
}
function tableSection(a) {
  return `<section class="isec" data-pos="${a.pos}"><p class="eyebrow">Table</p>
    <div class="seg" role="group" aria-label="Table style"><button type="button" data-tvar="grid" aria-pressed="${a.node.attrs.variant !== 'plain'}">Grid lines</button><button type="button" data-tvar="plain" aria-pressed="${a.node.attrs.variant === 'plain'}">No lines</button></div>
    <div class="btn-grid"><button type="button" class="ghost-btn" data-tcmd="addRowAfter">Row below</button><button type="button" class="ghost-btn" data-tcmd="addColumnAfter">Column right</button>
    <button type="button" class="ghost-btn" data-tcmd="deleteRow">Delete row</button><button type="button" class="ghost-btn" data-tcmd="deleteColumn">Delete column</button>
    <button type="button" class="ghost-btn" data-tcmd="mergeOrSplit">Merge / split</button><button type="button" class="ghost-btn danger" data-tcmd="deleteTable">Delete table</button></div></section>`
}
function eachSection(a) {
  const { relation, orderBy, limit } = a.node.attrs
  return `<section class="isec" data-pos="${a.pos}"><p class="eyebrow">Repeat block</p><h2>Repeat for each ${esc(relationLabel(relation))} record</h2>
    <label class="flabel" for="eachRel">Related list</label><select id="eachRel">${relOptions(relation)}</select>
    <div class="two"><div><label class="flabel" for="eachOrder">Sort by</label><input id="eachOrder" class="mono" value="${esc(orderBy)}" placeholder="e.g. CreatedDate desc"></div>
    <div><label class="flabel" for="eachLimit">Max</label><input id="eachLimit" type="number" min="1" value="${esc(limit)}" placeholder="All"></div></div>
    <button type="button" class="ghost-btn danger" data-del="${a.pos}">Delete block</button></section>`
}
function ifSection(a) {
  const cond = a.node.attrs.condition
  const hasElse = a.node.childCount > 1
  const fields = state.rootFields.map((x) => x.apiName).sort()
  const m = /^\s*([\w.$]+)\s*(==|!=|>=|<=|>|<|contains|startsWith)\s*(.+?)\s*$/.exec(cond) || []
  const ops = [['==', 'is'], ['!=', 'is not'], ['>', 'is greater than'], ['<', 'is less than'], ['>=', 'is at least'], ['<=', 'is at most'], ['contains', 'contains'], ['startsWith', 'starts with']]
  const simple = m.length && !/\s(and|or)\s/.test(cond)
  return `<section class="isec" data-pos="${a.pos}"><p class="eyebrow">Show if</p><h2>Conditional content</h2>
    ${simple && fields.length ? `<div class="cond"><select id="condField" aria-label="Field">${fields.map((x) => `<option${x === m[1] ? ' selected' : ''}>${esc(x)}</option>`).join('')}${fields.includes(m[1]) ? '' : `<option selected>${esc(m[1])}</option>`}</select>
    <select id="condOp" aria-label="Comparison">${ops.map(([v, l]) => `<option value="${v}"${v === m[2] ? ' selected' : ''}>${l}</option>`).join('')}</select><input id="condVal" aria-label="Value" value="${esc(m[3])}"></div>` : ''}
    <label class="flabel" for="condRaw">Condition</label><input id="condRaw" class="mono" value="${esc(cond)}" spellcheck="false">
    <p class="hint">Combine with <code>and</code> / <code>or</code>, negate with <code>not</code>. Quote text values.</p>
    <label class="check"><input type="checkbox" id="condElse"${hasElse ? ' checked' : ''}> Include an “Otherwise” part</label>
    <button type="button" class="ghost-btn danger" data-del="${a.pos}">Delete block</button></section>`
}
function docSection() {
  const json = editor.getJSON()
  const tpl = toTemplate(json, { salesforce: true })
  const stats = { fields: 0, loops: 0, conds: 0, sign: {} }
  const walk = (n) => {
    if (n.type === 'mergeField') stats.fields++
    if (n.type === 'eachBlock' || (n.type === 'tableRow' && n.attrs && n.attrs.each)) stats.loops++
    if (n.type === 'ifBlock') stats.conds++
    if (n.type === 'signTag') {
      const r = n.attrs.role
      stats.sign[r] = stats.sign[r] || { total: 0, signature: false }
      stats.sign[r].total++
      if (n.attrs.kind === 'signature') stats.sign[r].signature = true
    }
    ;(n.content || []).forEach(walk)
  }
  walk(json)
  const checks = pdfChecks(tpl)
  checks.unshift({ level: 'ok', text: 'Layout uses tables and CSS the Salesforce PDF renderer supports.' })
  const roles = Object.keys(stats.sign).sort()
  if (!roles.length) checks.push({ level: 'info', text: 'No signer fields yet. DocSign adds a signature block for each signer when you send.' })
  for (const r of roles) if (!stats.sign[r].signature) checks.push({ level: 'warn', text: `Signer ${r} has fields but no Signature field.` })
  return `<section class="isec"><p class="eyebrow">Template body</p><dl class="stats"><div><dt>Fields</dt><dd>${stats.fields}</dd></div><div><dt>Repeats</dt><dd>${stats.loops}</dd></div><div><dt>Conditions</dt><dd>${stats.conds}</dd></div></dl></section>
    <section class="isec"><p class="eyebrow">PDF check</p><ul class="checks">${checks.map((c) => `<li class="is-${c.level}"><span class="check-dot" aria-hidden="true"></span>${esc(c.text)}</li>`).join('')}</ul></section>
    <section class="isec"><p class="eyebrow">Signers</p><ul class="roles">${roles.length ? roles.map((r) => `<li class="dsx-role-${((r - 1) % 4) + 1}"><span class="signer-dot" aria-hidden="true"></span><span>Signer ${r}</span><span class="muted">${stats.sign[r].total} field${stats.sign[r].total > 1 ? 's' : ''}</span></li>`).join('') : '<li class="muted">None placed</li>'}</ul></section>
    <section class="isec tips"><p class="eyebrow">Shortcuts</p><ul><li><kbd>/</kbd> insert a block</li><li>Drag a field onto the page</li><li>Click a chip to format it</li><li>Preview the real PDF with “Save &amp; Preview PDF” below the editor</li></ul></section>`
}
function drawInspector() {
  if (!editor || inspectorBusy) return
  const c = context()
  let html = ''
  if (c.node) html += c.node.node.type.name === 'mergeField' ? fieldSection(c) : signSection(c)
  else
    for (const a of c.ancestors) {
      const n = a.node.type.name
      if (n === 'tableRow') html += rowSection(a)
      if (n === 'table') html += tableSection(a)
      if (n === 'eachBlock') html += eachSection(a)
      if (n === 'ifBlock') html += ifSection(a)
    }
  if (!html) html = docSection()
  const ins = $('#inspector')
  const active = document.activeElement && ins.contains(document.activeElement) ? document.activeElement.id : null
  ins.innerHTML = html
  if (active && document.getElementById(active)) document.getElementById(active).focus()
}
function toggleElse(pos, on) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return
  const { schema } = editor.state
  if (on && node.childCount === 1) editor.view.dispatch(editor.state.tr.insert(pos + node.nodeSize - 1, schema.nodes.ifElse.create(null, schema.nodes.paragraph.create(null, schema.text('Shown otherwise.')))))
  else if (!on && node.childCount > 1) {
    const start = pos + 1 + node.child(0).nodeSize
    editor.view.dispatch(editor.state.tr.delete(start, start + node.child(1).nodeSize))
  }
}
const cleanLimit = (v) => (v ? String(Math.max(1, parseInt(v, 10) || 1)) : '')
const cleanOrder = (v) => v.replace(/[^\w.\s,]/g, '').trim()

// ---------------------------------------------------------------- toast
let toastTimer = null
function toast(msg) {
  const el = $('#toast')
  el.textContent = msg
  el.hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (el.hidden = true), 4500)
}

// ---------------------------------------------------------------- wiring
function wire() {
  $$('.ptab').forEach((b) => b.addEventListener('click', () => setPanel(b.dataset.panel)))
  $('#slash').addEventListener('mousedown', (e) => {
    const b = e.target.closest('.slash-item')
    if (!b) return
    e.preventDefault()
    runSlash(slash.items[Number(b.dataset.i)])
  })
  $('#fieldSearch').addEventListener('input', (e) => { explorer.filter = e.target.value; if (explorer.top()) renderExplorer() })
  $('#crumbs').addEventListener('click', (e) => {
    const b = e.target.closest('.crumb')
    if (!b) return
    explorer.stack = explorer.stack.slice(0, Number(b.dataset.i) + 1)
    drawExplorer()
  })
  $('#fieldList').addEventListener('click', async (e) => {
    if (e.target.id === 'insLoopTable') return insert(await loopTable(explorer.childRel()))
    const b = e.target.closest('.fitem')
    if (!b || !editor) return
    if (b.dataset.kind === 'parent' || b.dataset.kind === 'child') return navExplorer(b)
    insert(fieldNodeFor(b))
    if (explorer.top().kind === 'child' && !insideLoop()) toast('This field belongs to a related list. Put it in a repeating row or repeat block, or it prints empty.')
  })
  $('#fieldList').addEventListener('dragstart', (e) => {
    const b = e.target.closest('.fitem')
    if (!b || b.classList.contains('is-nav')) return
    e.dataTransfer.setData('application/x-dsx', JSON.stringify(fieldNodeFor(b)))
    e.dataTransfer.effectAllowed = 'copy'
  })
  $('#blockList').addEventListener('click', (e) => {
    const b = e.target.closest('.bitem')
    if (b && editor) BLOCKS.find((x) => x.id === b.dataset.id).run()
  })
  $('#signerList').addEventListener('click', (e) => {
    const k = e.target.closest('.kind')
    if (!k || !editor) return
    const kind = k.dataset.kind
    insert(sg(kind, Number(k.dataset.role), kind === 'text' ? 'Company' : kind === 'checkbox' ? 'I agree' : ''))
  })
  $('#signerList').addEventListener('dragstart', (e) => {
    const k = e.target.closest('.kind')
    if (k) e.dataTransfer.setData('application/x-dsx', JSON.stringify(sg(k.dataset.kind, Number(k.dataset.role))))
  })
  $('#toolbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cmd]')
    if (b && editor && TOOL[b.dataset.cmd]) TOOL[b.dataset.cmd]()
  })
  $('#styleSel').addEventListener('change', (e) => {
    const v = e.target.value
    if (v === 'p') editor.chain().focus().setParagraph().run()
    else editor.chain().focus().setNode('heading', { level: Number(v) }).run()
  })
  const ins = $('#inspector')
  ins.addEventListener('change', (e) => {
    const c = context()
    const id = e.target.id
    if (c.node && c.node.node.type.name === 'mergeField') {
      const { format, fallback } = splitFilter(c.node.node.attrs.filter)
      if (id === 'insPath') updateAt(c.node.pos, { path: e.target.value.replace(/[{}|]/g, '').trim() || 'Id' })
      if (id === 'insFormat') updateAt(c.node.pos, { filter: joinFilter(e.target.value, fallback) })
      if (id === 'insFallback') updateAt(c.node.pos, { filter: joinFilter(format, e.target.value.replace(/[{}]/g, '').trim()) })
    } else if (c.node && c.node.node.type.name === 'signTag') {
      if (id === 'insRole') updateAt(c.node.pos, { role: Number(e.target.value) })
      if (id === 'insKind') updateAt(c.node.pos, { kind: e.target.value, label: e.target.value === 'text' ? 'Company' : e.target.value === 'checkbox' ? 'I agree' : '' })
      if (id === 'insLabel') updateAt(c.node.pos, { label: e.target.value.replace(/[:{}]/g, ' ').trim() })
      if (id === 'insOptional') updateAt(c.node.pos, { optional: e.target.checked })
    }
    const sec = e.target.closest('[data-pos]')
    if (sec) {
      const pos = Number(sec.dataset.pos)
      if (id === 'rowRepeat') updateAt(pos, e.target.checked ? { each: explorer.childRel() || firstChild(), orderBy: '', limit: '' } : { each: null, orderBy: '', limit: '' })
      if (id === 'rowRel') updateAt(pos, { each: e.target.value })
      if (id === 'rowOrder') updateAt(pos, { orderBy: cleanOrder(e.target.value) })
      if (id === 'rowLimit') updateAt(pos, { limit: cleanLimit(e.target.value) })
      if (id === 'eachRel') updateAt(pos, { relation: e.target.value })
      if (id === 'eachOrder') updateAt(pos, { orderBy: cleanOrder(e.target.value) })
      if (id === 'eachLimit') updateAt(pos, { limit: cleanLimit(e.target.value) })
      if (id === 'condRaw') updateAt(pos, { condition: e.target.value.replace(/[{}]/g, '').trim() || 'true' })
      if (id === 'condField' || id === 'condOp' || id === 'condVal') {
        let v = $('#condVal').value.trim()
        if (v && !/^-?\d+(\.\d+)?$/.test(v) && !/^".*"$/.test(v) && !['true', 'false', 'null'].includes(v)) v = '"' + v.replace(/"/g, '') + '"'
        updateAt(pos, { condition: `${$('#condField').value} ${$('#condOp').value} ${v || '""'}` })
      }
      if (id === 'condElse') toggleElse(pos, e.target.checked)
    }
    drawInspector()
  })
  ins.addEventListener('click', (e) => {
    const c = context()
    if (e.target.id === 'insRemove' && c.node) return editor.chain().focus().deleteSelection().run()
    const tv = e.target.closest('[data-tvar]')
    if (tv) {
      updateAt(Number(tv.closest('[data-pos]').dataset.pos), { variant: tv.dataset.tvar })
      return drawInspector()
    }
    const tc = e.target.closest('[data-tcmd]')
    if (tc) return editor.chain().focus()[tc.dataset.tcmd]().run()
    const del = e.target.closest('[data-del]')
    if (del) {
      const pos = Number(del.dataset.del)
      const node = editor.state.doc.nodeAt(pos)
      if (node) editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
    }
  })
  window.addEventListener('resize', hideSlash)
  $('.desk').addEventListener('scroll', hideSlash, { passive: true })
}

drawBlocks()
drawSigners()
wire()
drawExplorer()
post({ type: 'dstpl:ready' })
