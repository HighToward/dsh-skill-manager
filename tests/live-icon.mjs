// Live probe for the shelf icon feature: talk to the running panel over its own
// HTTP route, with real UTF-8 bodies (PowerShell's console encoding mangles
// Chinese before it ever leaves the shell, so the request is made from node).
const BASE = GUI_URL + '/api/dsh-skill-manager'

const call = async (path, body) => {
  const response = await fetch(BASE + path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }
  return { status: response.status, body: parsed }
}

const ok = (label, condition, extra) => {
  console.log(condition ? 'ok   ' : 'MISS ', label, extra === undefined ? '' : JSON.stringify(extra))
  if (!condition) failures += 1
}
let failures = 0

// Clean up any shelf left behind by an earlier run, so this probe can be rerun.
const before = await call('/list')
for (const entry of before.body.types) {
  if (entry.custom === true && entry.label.startsWith('音效')) {
    await call('/types', { action: 'remove', type: entry.type })
  }
}

const created = await call('/types', { action: 'create', label: '音效库' })
ok('a shelf is created', created.status === 200 && created.body.ok === true)
const id = created.body.type

const list1 = await call('/list')
const shelf = list1.body.types.find((entry) => entry.type === id)
ok('the label survives a real round trip', shelf?.label === '音效库', shelf)
ok('a new shelf starts with no drawing', Array.isArray(shelf?.glyph) && shelf.glyph.length === 0)

const drawn = await call('/types', { action: 'icon', type: id })
ok('the icon route answers', drawn.status === 200 && drawn.body.ok === true, drawn.status === 200 ? drawn.body : drawn)
ok('something was drawn', Array.isArray(drawn.body.glyph) && drawn.body.glyph.length > 0, drawn.body?.glyph)
ok('the route names the model used', typeof drawn.body.model === 'string' && drawn.body.model.includes('/'), drawn.body?.model)

const list2 = await call('/list')
const painted = list2.body.types.find((entry) => entry.type === id)
ok('the drawing reaches the board', Array.isArray(painted?.glyph) && painted.glyph.length > 0, painted?.glyph)
ok('the label survives the drawing', painted?.label === '音效库')

const shapes = painted?.glyph ?? []
const allowedTags = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
const allowedAttrs = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points'])
ok('every shape uses an allowed tag', shapes.every((step) => Array.isArray(step) && allowedTags.has(step[0])))
ok('every attribute is allowed', shapes.every((step) => Object.keys(step[1] ?? {}).every((key) => allowedAttrs.has(key))))
ok('no shape is empty', shapes.every((step) => Object.keys(step[1] ?? {}).length > 0))

// The counts are only informational: the model is free to draw what it likes.
console.log('drawn shapes:', JSON.stringify(shapes))
console.log('model used:', painted !== undefined ? 'see store' : '-')

const removed = await call('/types', { action: 'remove', type: id })
ok('the test shelf is removed again', removed.status === 200)
const list3 = await call('/list')
ok('the board is back to its own shelves', list3.body.types.find((entry) => entry.type === id) === undefined)

console.log(failures === 0 ? 'all good' : `${failures} failed`)
process.exit(failures === 0 ? 0 : 1)
