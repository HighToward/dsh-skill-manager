// Drives the real panel component tree with a small React stand-in, then walks
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// the element tree (invoking function components) so text rendered inside the
// detail drawer can be asserted without a browser.
import { readFile } from 'node:fs/promises'

let cells = []
let store = {}
function createElement(type, props, ...children) {
  const flat = children.length <= 1 ? children[0] : children
  return { type, props: { ...(props ?? {}), children: flat } }
}
const React = {
  createElement,
  Fragment: Symbol('Fragment'),
  useState(initial) {
    const index = cells.length
    cells.push(1)
    if (!(index in store)) store[index] = typeof initial === 'function' ? initial() : initial
    return [store[index], (next) => { store[index] = typeof next === 'function' ? next(store[index]) : next }]
  },
  useMemo(factory) { cells.push(1); return factory() },
  useEffect(fn) { cells.push(1); void fn },
  useCallback(fn) { cells.push(1); return fn },
  useRef(v) { cells.push(1); return { current: v } },
}

const base = {
  displayName: '', descriptionAlt: '', category: 'dev', source: 'user-dsh', active: true,
  version: '1.0.0', hash: 'a', path: 'x', displayPath: 'x', dir: 'x', rootDir: 'x', mtime: 0,
  bytes: 1, fileCount: 1, bodyChars: 10, author: '', gitUrl: '', level: 'user', slug: '',
  registry: '', namespace: '', canonicalName: '', skillId: '', registryVersion: '',
  installedContentHash: '', iconPath: '', whenToUse: '', modelInvocable: true, userInvocable: true,
}
const skills = [
  { ...base, name: 'agent-browser', description: 'Browser automation.', summary: '自动打开网页并截图', type: 'browser', autoType: 'browser' },
  { ...base, name: 'playwright-cli', description: 'Playwright.', summary: '用脚本驱动浏览器', type: 'browser' },
]
const payload = {
  skills,
  types: [
    { type: 'browser', names: ['agent-browser', 'playwright-cli'] },
    { type: 'x-my-cut', names: [], custom: true, label: '我的剪辑' },
  ],
  relations: {
    'agent-browser': [{ name: 'playwright-cli', score: 0.51, because: 'mentions', shared: ['browser', 'page'] }],
    'playwright-cli': [],
  },
  roots: [{ source: 'user-dsh' }],
  duplicates: 0,
  model: 'workbuddy/deepseek-v4.1-flash',
}

globalThis.window = { __ModuleLoader__: { load: (def) => { globalThis.__def = def } }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { baseURI: 'http://localhost/', documentElement: { lang: 'zh' } }
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN' } })
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => payload, text: async () => '# Skill' })

new Function('require', await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8'))((id) => {
  if (id === 'react') return React
  throw new Error('require ' + id)
})
const slots = []
const ctx = {
  get: () => undefined,
  effect: (fn) => fn(),
  on: () => () => {},
  slots: { inject: (n, fn) => fn(), register: (d, c) => { slots.push({ ...d, component: c }); return () => {} } },
}
globalThis.__def.factory((id) => { if (id === 'react') return React; throw new Error('require ' + id) }).apply(ctx)
const page = slots.find((s) => s.name === 'main').component

const render = () => { cells = []; return page({}) }
render()
store[2] = payload
store[3] = 'ready'
store[9] = 'agent-browser'

const texts = []
const walk = (node) => {
  if (node === null || node === undefined || node === false) return
  if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
  if (Array.isArray(node)) { node.forEach(walk); return }
  if (typeof node !== 'object' || !node.props) return
  if (typeof node.type === 'function') {
    // Function components (DetailDrawer among them) only produce text when run.
    const saved = cells
    cells = []
    const inner = node.type(node.props)
    cells = saved
    walk(inner)
    return
  }
  walk(node.props.children)
}

cells = []
walk(page({}))
const joined = texts.join('|')
for (const expected of ['playwright-cli', '正文点名', '51%', 'browser · page', '归属类型', '自动分类（浏览器与桌面）', '我的剪辑']) {
  console.log(joined.includes(expected) ? 'ok   ' : 'MISS ', expected)
}
