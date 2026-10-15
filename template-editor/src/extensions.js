// Pravadh DocSign — Tiptap nodes for DocSign template syntax.
// Each node maps 1:1 to a construct in the DocSign merge engine, so templates
// round-trip without the editor mangling {{#each}} / {{#if}} / {{sign:…}} tags.
import { Node, mergeAttributes } from '@tiptap/core'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'

export const SIGN_KINDS = {
  signature: 'Signature',
  initial: 'Initials',
  date: 'Date signed',
  name: 'Full name',
  email: 'Email',
  text: 'Text',
  checkbox: 'Checkbox',
}

// Short badge shown on a merge-field chip for its format.
export function formatBadge(filter) {
  if (!filter) return ''
  const first = filter.split('|')[0].trim()
  if (first.startsWith('currency')) return '$'
  if (first.startsWith('datetime')) return 'time'
  if (first.startsWith('date')) return 'date'
  if (first.startsWith('percent')) return '%'
  if (first === 'yesno') return 'Y/N'
  if (first === 'title') return 'Aa'
  if (first.startsWith('number')) {
    const n = Number((first.split(':')[1] || '0').replace(/"/g, ''))
    return n > 0 ? '0.' + '0'.repeat(n) : '0'
  }
  if (first === 'upper') return 'AA'
  if (first === 'lower') return 'aa'
  if (first.startsWith('default')) return '…'
  return 'fx'
}

// {{Path | filter}}
export const MergeField = Node.create({
  name: 'mergeField',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      path: {
        default: 'Name',
        parseHTML: (el) => el.getAttribute('data-merge') || 'Name',
        renderHTML: (a) => ({ 'data-merge': a.path }),
      },
      filter: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-filter') || '',
        renderHTML: (a) => (a.filter ? { 'data-filter': a.filter } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-merge]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const badge = formatBadge(node.attrs.filter)
    const parts = ['span', mergeAttributes(HTMLAttributes, { class: 'dsx-chip', title: '{{' + node.attrs.path + (node.attrs.filter ? ' | ' + node.attrs.filter : '') + '}}' }),
      ['span', { class: 'dsx-chip-path' }, node.attrs.path]]
    if (badge) parts.push(['span', { class: 'dsx-chip-fmt' }, badge])
    return parts
  },

  renderText({ node }) {
    return '{{' + node.attrs.path + (node.attrs.filter ? ' | ' + node.attrs.filter : '') + '}}'
  },
})

// {{sign:kind:role[:label][:optional]}}
export const SignTag = Node.create({
  name: 'signTag',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addOptions() {
    return { roleName: (r) => 'Signer ' + r }
  },

  addAttributes() {
    return {
      kind: { default: 'signature', parseHTML: (el) => el.getAttribute('data-sign') || 'signature', renderHTML: (a) => ({ 'data-sign': a.kind }) },
      role: { default: 1, parseHTML: (el) => Number(el.getAttribute('data-role') || 1), renderHTML: (a) => ({ 'data-role': String(a.role) }) },
      label: { default: '', parseHTML: (el) => el.getAttribute('data-label') || '', renderHTML: (a) => (a.label ? { 'data-label': a.label } : {}) },
      optional: { default: false, parseHTML: (el) => el.getAttribute('data-optional') === 'true', renderHTML: (a) => (a.optional ? { 'data-optional': 'true' } : {}) },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-sign]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { kind, role, label, optional } = node.attrs
    const r = Math.min(Math.max(Number(role) || 1, 1), 4)
    const text = (SIGN_KINDS[kind] || kind) + (label ? ' · ' + label : '') + (optional ? ' (optional)' : '')
    return ['span', mergeAttributes(HTMLAttributes, { class: 'dsx-sign dsx-role-' + r + ' dsx-kind-' + kind }),
      ['span', { class: 'dsx-sign-who' }, this.options.roleName(r)],
      ['span', { class: 'dsx-sign-what' }, text]]
  },

  renderText({ node }) {
    const { kind, role, label, optional } = node.attrs
    return '{{sign:' + kind + ':' + role + (label || optional ? ':' + label : '') + (optional ? ':optional' : '') + '}}'
  },
})

// Table with a grid / plain variant (plain = signature blocks, no borders).
export const DsxTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      variant: {
        default: 'grid',
        parseHTML: (el) => (el.classList.contains('dsx-plain') ? 'plain' : 'grid'),
        renderHTML: (a) => ({ class: a.variant === 'plain' ? 'dsx-plain' : 'dsx-grid' }),
      },
    }
  },
})

// Table row that can repeat once per child record: {{#each Rel}}<tr>…</tr>{{/each}}
export const RepeatRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      each: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-each') || null,
        renderHTML: (a) => (a.each ? { 'data-each': a.each, class: 'dsx-repeat' } : {}),
      },
      orderBy: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-orderby') || '',
        renderHTML: (a) => (a.orderBy ? { 'data-orderby': a.orderBy } : {}),
      },
      limit: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-limit') || '',
        renderHTML: (a) => (a.limit ? { 'data-limit': a.limit } : {}),
      },
    }
  },
})

const loopAttrs = {
  relation: { default: 'OpportunityLineItems', parseHTML: (el) => el.getAttribute('data-each-block'), renderHTML: (a) => ({ 'data-each-block': a.relation }) },
  orderBy: { default: '', parseHTML: (el) => el.getAttribute('data-orderby') || '', renderHTML: (a) => (a.orderBy ? { 'data-orderby': a.orderBy } : {}) },
  limit: { default: '', parseHTML: (el) => el.getAttribute('data-limit') || '', renderHTML: (a) => (a.limit ? { 'data-limit': a.limit } : {}) },
}

// {{#each Rel}} … {{/each}} around ordinary blocks
export const EachBlock = Node.create({
  name: 'eachBlock',
  group: 'block',
  content: 'block+',
  defining: true,
  addOptions() {
    return { relationLabel: (r) => r }
  },
  addAttributes() {
    return loopAttrs
  },
  parseHTML() {
    return [{ tag: 'div[data-each-block]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'dsx-each', 'data-label': 'Repeat for each ' + this.options.relationLabel(node.attrs.relation) }), 0]
  },
})

// {{#if cond}} then {{else}} otherwise {{/if}}
export const IfBlock = Node.create({
  name: 'ifBlock',
  group: 'block',
  content: 'ifThen ifElse?',
  defining: true,
  addAttributes() {
    return {
      condition: { default: 'StageName == "Closed Won"', parseHTML: (el) => el.getAttribute('data-if') || '', renderHTML: (a) => ({ 'data-if': a.condition }) },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-if]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { class: 'dsx-if', 'data-label': 'Show if  ' + node.attrs.condition }), 0]
  },
})

export const IfThen = Node.create({
  name: 'ifThen',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-if-then]' }]
  },
  renderHTML() {
    return ['div', { 'data-if-then': '', class: 'dsx-then' }, 0]
  },
})

export const IfElse = Node.create({
  name: 'ifElse',
  content: 'block+',
  defining: true,
  parseHTML() {
    return [{ tag: 'div[data-if-else]' }]
  },
  renderHTML() {
    return ['div', { 'data-if-else': '', class: 'dsx-else', 'data-label': 'Otherwise' }, 0]
  },
})

export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() {
    return [{ tag: 'div[data-page-break]' }]
  },
  renderHTML() {
    return ['div', { 'data-page-break': '', class: 'dsx-break' }, ['span', {}, 'Page break']]
  },
})
