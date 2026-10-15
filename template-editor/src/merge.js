// Browser-side preview of the DocSign merge engine (subset).
// In Salesforce the preview calls DocSignRenderService instead; this mirror
// lets the editor show real values while designing.

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function parseTree(tpl) {
  const root = { type: 'root', children: [] }
  const stack = [root]
  const add = (node) => {
    const top = stack[stack.length - 1]
    ;(top.inElse ? top.elseChildren : top.children).push(node)
  }
  for (const tok of tpl.split(/(\{\{[\s\S]*?\}\})/)) {
    if (!tok) continue
    if (!tok.startsWith('{{')) {
      add({ type: 'text', text: tok })
      continue
    }
    const body = tok.slice(2, -2).trim()
    if (body.startsWith('#each')) {
      const m = /^#each\s+([\w.$]+)(.*)$/s.exec(body) || []
      const node = { type: 'each', rel: m[1], args: m[2] || '', children: [], elseChildren: [] }
      add(node)
      stack.push(node)
    } else if (body.startsWith('#if')) {
      const node = { type: 'if', cond: body.slice(3).trim(), children: [], elseChildren: [] }
      add(node)
      stack.push(node)
    } else if (body === 'else') {
      stack[stack.length - 1].inElse = true
    } else if (body === '/each' || body === '/if') {
      if (stack.length > 1) stack.pop()
    } else if (body.startsWith('sign:')) {
      const [kind, role, label] = body.slice(5).split(':')
      add({ type: 'sign', kind, role: Number(role) || 1, label })
    } else if (body.startsWith('image:')) {
      add({ type: 'image' })
    } else {
      add({ type: 'field', body })
    }
  }
  return root
}

function splitFilters(s) {
  const out = []
  let cur = ''
  let q = false
  for (const ch of s) {
    if (ch === '"') q = !q
    if (ch === '|' && !q) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out.filter(Boolean)
}

function fmtDate(d, pattern) {
  if (!(d instanceof Date)) {
    if (!d) return ''
    const parts = String(d).slice(0, 10).split('-').map(Number)
    d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1)
  }
  if (isNaN(d)) return ''
  return pattern.replace(/yyyy|MMMM|MMM|MM|dd|d|HH|mm/g, (t) => {
    switch (t) {
      case 'yyyy': return String(d.getFullYear())
      case 'MMMM': return MONTHS[d.getMonth()]
      case 'MMM': return MONTHS[d.getMonth()].slice(0, 3)
      case 'MM': return String(d.getMonth() + 1).padStart(2, '0')
      case 'dd': return String(d.getDate()).padStart(2, '0')
      case 'd': return String(d.getDate())
      case 'HH': return String(d.getHours()).padStart(2, '0')
      case 'mm': return String(d.getMinutes()).padStart(2, '0')
    }
    return t
  })
}

function applyFilter(value, filter, ctx) {
  const i = filter.indexOf(':')
  const name = i < 0 ? filter : filter.slice(0, i)
  const arg = i < 0 ? '' : filter.slice(i + 1).trim().replace(/^"|"$/g, '')
  switch (name.trim()) {
    case 'currency': {
      const n = Number(value)
      if (value === '' || value == null || isNaN(n)) return value
      try {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: arg || ctx.root.CurrencyIsoCode || 'USD' }).format(n)
      } catch (e) {
        return n.toFixed(2)
      }
    }
    case 'date':
      return fmtDate(value, arg || 'd MMM yyyy')
    case 'number': {
      const n = Number(value)
      if (value === '' || value == null || isNaN(n)) return value
      const dp = Number(arg || 0)
      return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
    }
    case 'upper': return String(value ?? '').toUpperCase()
    case 'lower': return String(value ?? '').toLowerCase()
    case 'default': return value === '' || value == null ? arg : value
  }
  return value
}

function resolve(path, scope) {
  path = path.trim()
  if (path.startsWith('$')) {
    if (path === '$Today') return new Date(scope.env.today)
    if (path === '$Now') return fmtDate(new Date(scope.env.today), 'd MMM yyyy HH:mm')
    if (path === '$index') return scope.index
    if (path === '$PageNumber') return '1'
    if (path === '$PageCount') return String(scope.env.pageCount || 1)
    if (path.startsWith('$User.')) return walk(scope.env.user, path.slice(6))
    if (path.startsWith('$Org.')) return walk(scope.env.org, path.slice(5))
    if (path.startsWith('$root.')) return walk(scope.root, path.slice(6))
    return ''
  }
  const segs = path.split('.')
  if (segs[0] === scope.env.objectName && scope.rec === scope.root) segs.shift()
  const v = walk(scope.rec, segs.join('.'))
  if (v === undefined && scope.rec !== scope.root) return walk(scope.root, path)
  return v
}

function walk(obj, path) {
  let cur = obj
  for (const s of path.split('.')) {
    if (cur == null) return undefined
    cur = cur[s]
  }
  return cur
}

function operand(tok, scope) {
  tok = tok.trim()
  if (/^".*"$/.test(tok) || /^'.*'$/.test(tok)) return tok.slice(1, -1)
  if (/^-?\d+(\.\d+)?$/.test(tok)) return Number(tok)
  if (tok === 'true') return true
  if (tok === 'false') return false
  if (tok === 'null') return null
  return resolve(tok, scope)
}

function evalClause(clause, scope) {
  clause = clause.trim()
  let neg = false
  if (/^not\s+/.test(clause)) {
    neg = true
    clause = clause.replace(/^not\s+/, '')
  }
  const m = /^(.+?)\s*(==|!=|>=|<=|>|<|\bcontains\b|\bstartsWith\b)\s*(.+)$/.exec(clause)
  let r
  if (!m) {
    const v = operand(clause, scope)
    r = !(v === undefined || v === null || v === '' || v === false || v === 0)
  } else {
    const a = operand(m[1], scope)
    const b = operand(m[3], scope)
    switch (m[2]) {
      case '==': r = a == b; break
      case '!=': r = a != b; break
      case '>': r = Number(a) > Number(b); break
      case '<': r = Number(a) < Number(b); break
      case '>=': r = Number(a) >= Number(b); break
      case '<=': r = Number(a) <= Number(b); break
      case 'contains': r = String(a ?? '').includes(String(b)); break
      case 'startsWith': r = String(a ?? '').startsWith(String(b)); break
    }
  }
  return neg ? !r : r
}

function evalCond(cond, scope) {
  return cond.split(/\s+or\s+/).some((part) => part.split(/\s+and\s+/).every((c) => evalClause(c, scope)))
}

function run(children, scope) {
  let out = ''
  for (const n of children) {
    if (n.type === 'text') out += n.text
    else if (n.type === 'field') {
      const [path, ...filters] = splitFilters(n.body)
      let v = resolve(path, scope)
      if (v instanceof Date) v = fmtDate(v, 'd MMM yyyy')
      for (const f of filters) v = applyFilter(v, f, scope)
      out += v == null ? '' : escHtml(v)
    } else if (n.type === 'each') {
      let list = resolve(n.rel, scope)
      list = Array.isArray(list) ? list.slice() : []
      const ob = /orderBy\s*=\s*"([^"]*)"/.exec(n.args)
      const lim = /limit\s*=\s*"([^"]*)"/.exec(n.args)
      if (ob) {
        const [field, dir] = ob[1].split(/\s+/)
        list.sort((a, b) => ((walk(a, field) > walk(b, field) ? 1 : -1) * (/desc/i.test(dir || '') ? -1 : 1)))
      }
      if (lim) list = list.slice(0, Number(lim[1]) || list.length)
      if (!list.length) out += run(n.elseChildren, scope)
      list.forEach((item, i) => {
        out += run(n.children, { ...scope, rec: item, index: i + 1 })
      })
    } else if (n.type === 'if') {
      out += run(evalCond(n.cond, scope) ? n.children : n.elseChildren, scope)
    } else if (n.type === 'sign') {
      const name = (scope.env.roleNames && scope.env.roleNames[n.role]) || 'Signer ' + n.role
      const what = { signature: 'Sign here', initial: 'Initial', date: 'Date signed', name: 'Full name', email: 'Email', text: n.label || 'Text', checkbox: n.label || 'Check' }[n.kind] || n.kind
      out += `<span class="pv-sign pv-role-${Math.min(n.role, 4)} pv-kind-${escHtml(n.kind)}"><b>${escHtml(name)}</b> ${escHtml(what)}</span>`
    } else if (n.type === 'image') {
      out += '<span class="pv-image">Image from Salesforce Files</span>'
    }
  }
  return out
}

export function renderPreview(tpl, record, env) {
  const tree = parseTree(tpl)
  return run(tree.children, { rec: record, root: record, index: 0, env })
}
