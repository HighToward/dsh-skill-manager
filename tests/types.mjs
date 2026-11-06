/**
 * Exercise the custom-shelf routes against a throwaway DSH_HOME, so the real
 * store keeps its summaries.
 *
 * Run: node tests/types.mjs
 */

import { fileURLToPath } from 'node:url'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The store path is resolved from DSH_HOME at call time, so pointing it at a
// temp directory before the module loads is enough to sandbox every write.
const home = mkdtempSync(join(tmpdir(), 'skill-manager-types-'))
process.env.DSH_HOME = home

const skillsRoot = join(home, 'skills')
mkdirSync(join(skillsRoot, 'cut-a-clip'), { recursive: true })
writeFileSync(join(skillsRoot, 'cut-a-clip', 'SKILL.md'), [
  '---',
  'name: cut-a-clip',
  'description: Cut a long clip into short vertical ones and burn captions.',
  '---',
  '',
  'Body text that mentions `sound-polish` so the relation graph has something.',
].join('\n'))
mkdirSync(join(skillsRoot, 'sound-polish'), { recursive: true })
writeFileSync(join(skillsRoot, 'sound-polish', 'SKILL.md'), [
  '---',
  'name: sound-polish',
  'description: Clean up recorded voice and lift it above the music bed.',
  '---',
  '',
  'Body.',
].join('\n'))

const { apply } = await import('../index.js')

const routes = new Map()
// A stand-in model whose answer the test controls, so the icon route is tested
// against markup that must be refused rather than only against markup that
// happens to be clean.
let answer = [
  '{"shapes":[{"tag":"path","d":"M3 12h18"},',
  '{"tag":"circle","cx":12,"cy":12,"r":3,"onclick":"alert(1)"},',
  '{"tag":"script","d":"M0 0"}]}',
].join('')
const fakeLlm = {
  async resolveModelInfo() {
    return { reasoning: { efforts: [{ id: 'low' }] } }
  },
  stream() {
    return (async function* chunks() {
      yield { type: 'text-delta', text: answer }
    })()
  },
}
const ctx = {
  get(name) {
    if (name === 'sessions') return { list: () => [{ header: { cwd: join(home, 'workspace') } }] }
    if (name === 'agentDefaultModel') return { currentSelection: () => ({ provider: 'p', model: 'm' }) }
    if (name === 'llm') return fakeLlm
    return undefined
  },
  effect(callback) { return callback() },
  webServer: {
    register(route) {
      routes.set(route.path, route.handler)
      return () => {}
    },
  },
}
apply(ctx, {})

let failures = 0
function ok(label, condition) {
  if (condition) {
    console.log(`ok ${label}`)
  } else {
    failures += 1
    console.log(`MISS ${label}`)
  }
}

async function call(path, method = 'GET', payload) {
  const target = path.split('?')[0]
  const handler = routes.get(target)
  if (handler === undefined) throw new Error(`no route ${target}`)
  let status = 0
  let body = ''
  const response = {
    writeHead(next) { status = next },
    end(chunk) { body = chunk ?? '' },
  }
  const encoded = payload === undefined ? [] : [Buffer.from(JSON.stringify(payload), 'utf8')]
  const request = {
    method,
    url: path,
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield* encoded },
  }
  await handler(request, response)
  return { status, body: body === '' ? {} : JSON.parse(body) }
}

const before = await call('/api/dsh-skill-manager/list')
console.log('baseline:', before.status, 'skills', before.body.skills.length, 'shelves', before.body.types.length)
const cut = before.body.skills.find((skill) => skill.name === 'cut-a-clip')
ok('auto shelf is video', cut !== undefined && cut.type === 'video')
ok('auto type is remembered', cut !== undefined && cut.autoType === 'video')

const created = await call('/api/dsh-skill-manager/types', 'POST', { action: 'create', label: '我的剪辑' })
console.log('create:', created.status, JSON.stringify(created.body))
ok('create succeeds', created.status === 200 && created.body.ok === true)
const made = created.body.type
ok('custom id is prefixed', typeof made === 'string' && made.startsWith('x-'))

const empty = await call('/api/dsh-skill-manager/list')
const emptyShelf = empty.body.types.find((entry) => entry.type === made)
ok('empty shelf stays on the board', emptyShelf !== undefined)
ok('empty shelf keeps the label', emptyShelf !== undefined && emptyShelf.label === '我的剪辑')
ok('empty shelf is marked custom', emptyShelf !== undefined && emptyShelf.custom === true)

const assigned = await call('/api/dsh-skill-manager/types', 'POST', { action: 'assign', names: ['cut-a-clip'], type: made })
ok('assign succeeds', assigned.status === 200 && assigned.body.ok === true)

const after = await call('/api/dsh-skill-manager/list')
const moved = after.body.skills.find((skill) => skill.name === 'cut-a-clip')
ok('skill moved to the custom shelf', moved !== undefined && moved.type === made)
ok('auto type survives the move', moved !== undefined && moved.autoType === 'video')
const movedShelf = after.body.types.find((entry) => entry.type === made)
ok('custom shelf now holds it', movedShelf !== undefined && movedShelf.names.includes('cut-a-clip'))

const cleared = await call('/api/dsh-skill-manager/types', 'POST', { action: 'assign', names: ['cut-a-clip'], type: '' })
ok('clearing the assignment succeeds', cleared.status === 200)
const restored = await call('/api/dsh-skill-manager/list')
const back = restored.body.skills.find((skill) => skill.name === 'cut-a-clip')
ok('skill falls back to its auto shelf', back !== undefined && back.type === 'video')

await call('/api/dsh-skill-manager/types', 'POST', { action: 'assign', names: ['cut-a-clip'], type: made })
const removed = await call('/api/dsh-skill-manager/types', 'POST', { action: 'remove', type: made })
ok('remove succeeds', removed.status === 200)
const final = await call('/api/dsh-skill-manager/list')
const goneShelf = final.body.types.find((entry) => entry.type === made)
ok('removed shelf is gone from the board', goneShelf === undefined)
const settled = final.body.skills.find((skill) => skill.name === 'cut-a-clip')
ok('its skills went back to auto', settled !== undefined && settled.type === 'video')

const blank = await call('/api/dsh-skill-manager/types', 'POST', { action: 'create', label: '   ' })
ok('blank label is refused', blank.status === 400)
const long = await call('/api/dsh-skill-manager/types', 'POST', { action: 'create', label: 'x'.repeat(30) })
ok('a too long label is refused', long.status === 400)
const unknown = await call('/api/dsh-skill-manager/types', 'POST', { action: 'rename', type: 'x-nope', label: 'nope' })
ok('renaming an unknown shelf is refused', unknown.status === 404)
const badAction = await call('/api/dsh-skill-manager/types', 'POST', { action: 'wat' })
ok('an unknown action is refused', badAction.status === 400)

const storePath = join(home, 'dsh-skill-manager', 'store.json')
const stored = existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')) : {}
ok('store keeps the two new maps', typeof stored.types === 'object' && typeof stored.assignments === 'object')

// ── icons ────────────────────────────────────────────────────────────────
// A fresh shelf, so the icon assertions do not depend on the one above that
// was just deleted.
const iconShelf = await call('/api/dsh-skill-manager/types', 'POST', { action: 'create', label: '音效库' })
const iconId = iconShelf.body.type
const beforeIcon = await call('/api/dsh-skill-manager/list')
const bare = beforeIcon.body.types.find((entry) => entry.type === iconId)
ok('a new shelf starts with no drawing', bare !== undefined && Array.isArray(bare.glyph) && bare.glyph.length === 0)

const made2 = await call('/api/dsh-skill-manager/types', 'POST', { action: 'icon', type: iconId })
ok('the icon route answers', made2.status === 200 && made2.body.ok === true)
const drawn = Array.isArray(made2.body.glyph) ? made2.body.glyph : []
ok('only the allowed shapes survive', drawn.length === 2)
ok('the path is kept', drawn[0]?.[0] === 'path' && drawn[0]?.[1]?.d === 'M3 12h18')
ok('an unknown attribute is dropped', drawn[1]?.[0] === 'circle' && drawn[1]?.[1]?.onclick === undefined)
ok('geometry on that shape is kept', drawn[1]?.[1]?.r === '3')
ok('an unknown tag is refused', drawn.every((step) => step[0] !== 'script'))
ok('the route names the model used', made2.body.model === 'p/m')

const afterIcon = await call('/api/dsh-skill-manager/list')
const painted = afterIcon.body.types.find((entry) => entry.type === iconId)
ok('the drawing reaches the board', painted !== undefined && Array.isArray(painted.glyph) && painted.glyph.length === 2)
ok('the label survives an icon', painted !== undefined && painted.label === '音效库')

const storedIcon = JSON.parse(readFileSync(storePath, 'utf8'))
ok('the store keeps the drawing as text', typeof storedIcon.types[iconId].glyph === 'string')

answer = 'not json at all'
const refused = await call('/api/dsh-skill-manager/types', 'POST', { action: 'icon', type: iconId })
ok('an unusable answer is refused', refused.status === 502)
const stillThere = await call('/api/dsh-skill-manager/list')
const survived = stillThere.body.types.find((entry) => entry.type === iconId)
ok('a failed redraw keeps the old drawing', survived !== undefined && survived.glyph.length === 2)

const noShelf = await call('/api/dsh-skill-manager/types', 'POST', { action: 'icon', type: 'x-nope' })
ok('drawing for an unknown shelf is refused', noShelf.status === 404)

console.log(`\n${failures === 0 ? 'all good' : `${failures} failed`}`)
process.exit(failures === 0 ? 0 : 1)
