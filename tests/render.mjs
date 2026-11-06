import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// One-shot render harness: drive the real component tree with a tiny React
// stand-in and a stubbed fetch, then walk the produced element tree looking for
// text we expect to see on screen.
let cells = []
let store = {}
let memo = {}
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
  useMemo(factory) { const index = cells.length; cells.push(1); if (!(index in memo)) memo[index] = factory(); return memo[index] },
  useEffect(fn) { cells.push(1); void fn },
  useCallback(fn) { cells.push(1); return fn },
  useRef(v) { const index = cells.length; cells.push(1); if (!(index in memo)) memo[index] = { current: v }; return memo[index] },
}

const skills = [
  { name: 'agent-browser', displayName: '', description: 'Browser automation.', descriptionAlt: '', summary: '自动打开网页并截图', category: 'dev', type: 'browser', source: 'user-dsh', active: true, version: '1.0.0', hash: 'a', path: 'x', displayPath: 'x', dir: 'x', rootDir: 'x', mtime: 0, bytes: 1, fileCount: 1, bodyChars: 10, author: '', gitUrl: '', level: 'user', slug: '', registry: '', namespace: '', canonicalName: '', skillId: '', registryVersion: '', installedContentHash: '', iconPath: '', whenToUse: '', modelInvocable: true, userInvocable: true },
  { name: 'library', displayName: '', description: 'Library skill.', descriptionAlt: '', summary: '', category: 'office', type: 'office', source: 'library', active: false, version: '', hash: 'b', path: 'x', displayPath: 'x', dir: 'x', rootDir: 'x', mtime: 0, bytes: 1, fileCount: 1, bodyChars: 10, author: '', gitUrl: '', level: 'library', slug: '', registry: '', namespace: '', canonicalName: '', skillId: '', registryVersion: '', installedContentHash: '', iconPath: '', whenToUse: '', modelInvocable: true, userInvocable: true },
]
const payload = {
  skills,
  types: [ { type: 'browser', names: ['agent-browser'] }, { type: 'office', names: ['library'] } ],
  relations: { 'agent-browser': [{ name: 'library', score: 0.4, because: 'type', shared: [] }], library: [] },
  roots: [{ source: 'user-dsh' }, { source: 'library' }],
  duplicates: 0,
  model: 'workbuddy/deepseek-v4.1-flash',
  describedBy: 'qoder/dfmodel',
}
const catalog = {
  providers: [{ id: 'workbuddy', name: 'WorkBuddy', models: [{ id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' }] }],
  default: { provider: 'workbuddy', model: 'deepseek-v4.1-flash' },
}

globalThis.window = { __ModuleLoader__: { load: (def) => { globalThis.__def = def } }, addEventListener() {}, removeEventListener() {} }
globalThis.document = { baseURI: 'http://localhost/', documentElement: { lang: 'zh' } }
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { language: 'zh-CN' } })
globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => (String(url).includes('/models') ? catalog : payload),
})

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')
new Function('require', source)((id) => { if (id === 'react') return React; throw new Error('require ' + id) })

const slots = []
const ctx = { get: () => undefined, effect: (fn) => fn(), on: () => () => {}, slots: { inject: (n, fn) => fn(), register: (d, component) => { slots.push({ ...d, component }); return () => {} } } }
globalThis.__def.factory((id) => { if (id === 'react') return React; throw new Error('require ' + id) }).apply(ctx)

console.log('slot decls:', slots.map((s) => JSON.stringify({ name: s.name, key: s.key, id: s.id, hasComponent: typeof s.component })).join('\n'))
const page = slots.find((s) => s.name === 'main').component
const render = (props = {}) => { cells = []; return page(props) }
const collect = (tree) => {
  const texts = []
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return
    if (typeof node === 'string' || typeof node === 'number') { texts.push(String(node)); return }
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node === 'object' && node.props) walk(node.props.children)
  }
  walk(tree)
  return texts
}

// Collect the svg shapes in a tree. Function components are invoked so their
// output can be inspected; the hook-cell stack is saved and restored around the
// detour so the page's own element order is left alone.
const findShapes = (tree) => {
  const found = []
  const walk = (node) => {
    if (node === null || node === undefined || node === false) return
    if (typeof node === 'string' || typeof node === 'number') return
    if (Array.isArray(node)) { node.forEach(walk); return }
    if (typeof node !== 'object' || !node.props) return
    if (typeof node.type === 'string' && node.type in { path: 1, circle: 1, rect: 1, ellipse: 1, line: 1, polyline: 1, polygon: 1 }) {
      found.push({ tag: node.type, ...node.props })
    }
    if (typeof node.type === 'function') {
      const saved = cells
      cells = []
      walk(node.type(node.props))
      cells = saved
      return
    }
    walk(node.props.children)
  }
  walk(tree)
  return found
}

// Pass 1: the loading frame, so every useState slot is allocated in order.
render()
// Slot 2 data, 3 phase, 8 typeFilter, 13 model, 14 catalog.
store[0] = 'zh'
store[2] = payload
store[3] = 'ready'
store[13] = 'workbuddy/deepseek-v4.1-flash'
store[14] = catalog
memo = {}

const check = (label, texts, expected) => {
  const joined = texts.join('|')
  console.log(joined.includes(expected) ? 'ok   ' : 'MISS ', `${label}: ${expected}`)
}

// Pass 2: the type board, which is what the page opens on.
const board = collect(render())
console.log('board texts:', JSON.stringify(board))
check('board', board, '浏览器与桌面')
check('board', board, '文档与表格')
check('board', board, '点一格类型')
check('board', board, 'WorkBuddy · DeepSeek V4.1 Flash')

// The summary line credits the model that wrote the descriptions, not the
// one currently picked in the dropdown. Slot 13 is the dropdown selection;
// the payload says a different model wrote them. Changing the selection must
// leave the credit line exactly where it was.
check('summary credits the writer', board, '说明由 qoder/dfmodel 生成')
console.log(board.join('|').includes('说明由 workbuddy/deepseek-v4.1-flash 生成') ? 'MISS ' : 'ok   ', 'summary ignores the picked model: workbuddy/deepseek-v4.1-flash')
store[13] = 'x/some-other-model'
memo = {}
const switched = collect(render())
check('summary stays put after a model switch', switched, '说明由 qoder/dfmodel 生成')
console.log(switched.join('|').includes('说明由 x/some-other-model 生成') ? 'MISS ' : 'ok   ', 'summary ignores the newly switched model: x/some-other-model')
store[13] = 'workbuddy/deepseek-v4.1-flash'
memo = {}

// Pass 3: drilled into one type. Slot 8 is the type filter.
store[8] = 'browser'
memo = {}
const drilled = collect(render())
console.log('drilled texts:', JSON.stringify(drilled))
check('drilled', drilled, 'agent-browser')
check('drilled', drilled, '全部类型')
check('drilled', drilled, '自动打开网页并截图')
console.log(drilled.join('|').includes('文档与表格') ? 'MISS ' : 'ok   ', 'drilled hides the other shelf: 文档与表格')

// Pass 4: a shelf the user made themselves shows its own name, and offers the
// delete action that a built-in shelf must never show.
store[8] = 'x-my-cut'
store[2] = {
  ...payload,
  skills: [{ ...skills[0], type: 'x-my-cut', autoType: 'browser' }],
  types: [
    { type: 'browser', names: [] },
    { type: 'x-my-cut', names: ['agent-browser'], custom: true, label: '我的剪辑' },
  ],
}
memo = {}
const custom = collect(render())
console.log('custom texts:', JSON.stringify(custom))
check('custom', custom, '我的剪辑')
check('custom', custom, '删除这个类型')
check('custom', custom, 'agent-browser')
// A shelf with no drawing yet offers to have one drawn; once it has one the
// same button offers to draw it again instead.
check('custom', custom, '生成图标')
console.log(custom.join('|').includes('重画图标') ? 'MISS ' : 'ok   ', 'a bare shelf offers to draw, not to redraw')

store[2] = {
  ...payload,
  skills: [{ ...skills[0], type: 'x-my-cut', autoType: 'browser' }],
  types: [
    { type: 'browser', names: [] },
    { type: 'x-my-cut', names: ['agent-browser'], custom: true, label: '我的剪辑', glyph: [['path', { d: 'M4 12h16' }]] },
  ],
}
memo = {}
const redraw = collect(render())
check('redraw', redraw, '重画图标')
console.log(redraw.join('|').includes('生成图标') ? 'MISS ' : 'ok   ', 'a drawn shelf offers to redraw, not to draw')

// Pass 5: back to the board, which must carry the add-a-shelf tile and the
// user's own shelf, while an empty built-in shelf stays hidden.
store[8] = 'all'
memo = {}
const withAdd = collect(render())
console.log('board+add texts:', JSON.stringify(withAdd))
check('board+add', withAdd, '新建类型')
check('board+add', withAdd, '我的剪辑')
console.log(withAdd.join('|').includes('浏览器与桌面') ? 'MISS ' : 'ok   ', 'an empty builtin shelf stays off the board: 浏览器与桌面')

// A built-in shelf offers no delete action.
store[8] = 'browser'
store[2] = payload
memo = {}
const builtin = collect(render())
console.log(builtin.join('|').includes('删除这个类型') ? 'MISS ' : 'ok   ', 'builtin shelf offers no delete: 删除这个类型')

// Pass 6: a shelf with no drawing falls back to the tag shape, and once the
// model has drawn one the drawn shapes replace it. This is the whole point of
// the feature, so it is checked on the rendered board rather than in the source.
const drawnShapes = [['path', { d: 'M4 12h16' }], ['circle', { cx: 12, cy: 12, r: 2 }]]
const withShelf = (glyph) => ({
  ...payload,
  types: [{ type: 'x-my-cut', names: [], custom: true, label: '我的剪辑', glyph }],
})
store[8] = 'all'
store[2] = withShelf([])
memo = {}
const bareShapes = findShapes(render())
const tagShape = bareShapes.find((s) => s.tag === 'path' && String(s.d).startsWith('M11.4 3.2'))
console.log(tagShape === undefined ? 'MISS ' : 'ok   ', 'a shelf with no drawing falls back to the tag shape')

store[2] = withShelf(drawnShapes)
memo = {}
const paintedShapes = findShapes(render())
const drawnPath = paintedShapes.find((s) => s.tag === 'path' && s.d === 'M4 12h16')
const drawnDot = paintedShapes.find((s) => s.tag === 'circle' && s.r === 2)
console.log(drawnPath !== undefined ? 'ok   ' : 'MISS ', 'the model drawing is what gets rendered')
console.log(drawnDot !== undefined ? 'ok   ' : 'MISS ', 'every drawn shape is rendered, not just the first')
const leakedTag = paintedShapes.find((s) => s.tag === 'path' && String(s.d).startsWith('M11.4 3.2'))
console.log(leakedTag === undefined ? 'ok   ' : 'MISS ', 'the fallback steps aside once a drawing exists')
