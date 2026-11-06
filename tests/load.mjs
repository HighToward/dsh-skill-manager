import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Minimal React stand-in: enough to run the component tree as plain functions
// and catch undefined references, bad hooks and broken element shapes.
const cells = []
const effects = []
function createElement(type, props, ...children) {
  return { type, props: { ...(props ?? {}), children: children.length <= 1 ? children[0] : children } }
}
const React = {
  createElement,
  Fragment: Symbol('Fragment'),
  useState(initial) {
    const index = cells.length
    if (!(index in store)) store[index] = typeof initial === 'function' ? initial() : initial
    cells.push(1)
    return [store[index], (next) => { store[index] = typeof next === 'function' ? next(store[index]) : next }]
  },
  useMemo(factory) { const index = cells.length; if (!(index in memo)) memo[index] = factory(); cells.push(1); return memo[index] },
  useEffect(fn) { effects.push(fn); cells.push(1) },
  useCallback(fn) { cells.push(1); return fn },
  useRef(v) { const index = cells.length; if (!(index in memo)) memo[index] = { current: v }; cells.push(1); return memo[index] },
}
let store = {}
let memo = {}

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')
let registered
globalThis.window = { __ModuleLoader__: { load: (def) => { registered = def } }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { baseURI: 'http://localhost/', documentElement: { lang: 'zh' }, querySelector: () => null, addEventListener() {}, removeEventListener() {} }
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN', clipboard: { writeText: async () => {} } } })
new Function('require', source)((id) => {
  if (id === 'react') return React
  throw new Error('unexpected require: ' + id)
})
const factory = registered.factory
const slots = []
const ctx = {
  get: () => undefined,
  effect: (fn) => fn(),
  on: () => () => {},
  slots: { inject: (name, fn) => fn(), register: (decl) => { slots.push(decl); return () => {} } },
}
const mod = factory((id) => { if (id === 'react') return React; throw new Error('require ' + id) })
mod.apply(ctx)
console.log('client loaded; slots registered:', slots.map((s) => `${s.name}#${s.id ?? s.key}`).join(', '))

