/**
 * Smoke test for the skill center's host half: exercise the scan and the
 * relation graph against this machine's real skill roots, and drive the two
 * read routes through a fake request/response pair.
 *
 * Run: node tests/smoke.mjs
 */

import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { apply } from '../index.js'

/** Collect the routes the plugin registers. */
const routes = new Map()

/**
 * Minimal host context: only what the plugin touches.
 *
 * The `web` shim mirrors the real service shape (a result object with a status
 * and a text body, never a throw on a bad status) so the registry path is
 * exercised for real instead of being stubbed out.
 */
const ctx = {
  get(name) {
    if (name === 'sessions') {
      return { list: () => [{ header: { cwd: process.cwd() } }] }
    }
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-v4.1-flash' }) }
    }
    if (name === 'web' && process.env.SKILL_CENTER_NO_NET !== '1') {
      return {
        async fetch({ url }, signal) {
          const response = await fetch(url, { signal })
          return {
            url,
            statusCode: response.status,
            body: { kind: 'text', content: await response.text() },
            truncated: false,
          }
        },
      }
    }
    return undefined
  },
  effect(callback) {
    return callback()
  },
  webServer: {
    register(route) {
      routes.set(route.path, route.handler)
      return () => {}
    },
  },
}

apply(ctx, {})
console.log('routes:', [...routes.keys()].join(', '))

/**
 * Call one route with a fake loopback request.
 * @param path - the route path, optionally with a query string.
 * @param method - the HTTP method.
 * @returns the parsed response body and status.
 */
async function call(path, method = 'GET') {
  const target = path.split('?')[0]
  const handler = routes.get(target)
  if (handler === undefined) throw new Error(`no route ${target}`)
  let status = 0
  let body = ''
  const response = {
    writeHead(next) { status = next },
    end(payload) { body = payload ?? '' },
  }
  const request = {
    method,
    url: path,
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {},
  }
  await handler(request, response)
  return { status, body: body === '' ? {} : JSON.parse(body) }
}

const health = await call('/api/dsh-skill-manager/health')
console.log('health:', health.status, JSON.stringify(health.body))

const list = await call('/api/dsh-skill-manager/list')
console.log('list status:', list.status)
if (list.status !== 200) {
  console.log('list body:', JSON.stringify(list.body))
  process.exit(1)
}
console.log('cwd:', list.body.cwd)
console.log('roots:', list.body.roots.map((root) => `${root.source}=${root.dir}${root.active ? '' : ' (inactive)'}`).join('\n       '))
console.log('skills:', list.body.skills.length)
console.log('duplicates:', list.body.duplicates.length)

const bySource = new Map()
for (const skill of list.body.skills) bySource.set(skill.source, (bySource.get(skill.source) ?? 0) + 1)
console.log('by source:', [...bySource].map(([key, count]) => `${key}:${count}`).join(' '))

console.log('\nfirst five:')
for (const skill of list.body.skills.slice(0, 5)) {
  console.log(`  ${skill.name}  [${skill.source}]  v${skill.version || '-'}  ${skill.bytes}B  ${skill.modelInvocable ? 'model' : ''}${skill.userInvocable ? '/user' : ''}`)
  console.log(`    ${skill.description.slice(0, 90)}`)
}

const withRelations = list.body.skills.filter((skill) => (list.body.relations[skill.name] ?? []).length > 0).length
console.log(`\nskills with relations: ${withRelations}/${list.body.skills.length}`)
const sorted = [...list.body.skills].sort((a, b) => (list.body.relations[b.name] ?? []).length - (list.body.relations[a.name] ?? []).length)
for (const skill of sorted.slice(0, 4)) {
  const rel = list.body.relations[skill.name] ?? []
  console.log(`  ${skill.name}: ${rel.map((entry) => `${entry.name}(${entry.score})`).join(', ')}`)
}

const insight = await call('/api/dsh-skill-manager/insight')
console.log('\ninsight status:', insight.status, 'entries:', Object.keys(insight.body.relations ?? {}).length)

const types = list.body.types ?? []
console.log('\ntypes:', types.length, 'shelves')
for (const shelf of types) {
  console.log(`  ${shelf.type} (${shelf.names.length}): ${shelf.names.slice(0, 8).join(', ')}${shelf.names.length > 8 ? ', …' : ''}`)
}
const shelved = types.reduce((total, shelf) => total + shelf.names.length, 0)
console.log('skills shelved:', shelved, 'of', list.body.skills.length)

const becauseCounts = new Map()
for (const entries of Object.values(list.body.relations ?? {})) {
  for (const entry of entries) becauseCounts.set(entry.because, (becauseCounts.get(entry.because) ?? 0) + 1)
}
console.log('relation signals:', [...becauseCounts].map(([key, count]) => `${key}:${count}`).join(' '))

const sample = list.body.skills[0]
const read = await call(`/api/dsh-skill-manager/read?name=${sample.name}&source=${sample.source}`)
console.log('read status:', read.status, 'chars:', (read.body.content ?? '').length, 'path:', read.body.path)

const updates = await call('/api/dsh-skill-manager/updates', 'POST')
console.log('\nupdates status:', updates.status, 'rows:', (updates.body.skills ?? []).length, 'registry answered:', updates.body.registry)
const interesting = (updates.body.skills ?? []).filter((row) => row.upstream !== 'unknown')
console.log('rows with a registry answer:', interesting.length)
for (const row of interesting.slice(0, 8)) {
  console.log(`  ${row.name}: local=${row.version || '-'} registry=${row.registryVersion || '-'} upstream=${row.upstream} latest=${row.latest || '-'}`)
}
const versioned = (updates.body.skills ?? []).filter((row) => row.registryVersion !== '')
console.log('skills carrying install metadata:', versioned.length)

const denied = await (async () => {
  let status = 0
  const handler = routes.get('/api/dsh-skill-manager/list')
  await handler(
    { method: 'GET', url: '/api/dsh-skill-manager/list', socket: { remoteAddress: '10.0.0.7' }, async *[Symbol.asyncIterator]() {} },
    { writeHead(next) { status = next }, end() {} },
  )
  return status
})()
console.log('remote request status (expect 403):', denied)
