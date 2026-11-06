/**
 * Shows that a skill's shelf does not depend on the model-written summary.
 *
 * Points the plugin at an empty state directory, so no skill has a summary at
 * all, then lists the catalog and prints the shelves. If the shelves are still
 * full, typing is a property of SKILL.md and the file path, not of the summary.
 *
 * Run: node shelf-probe.mjs
 */
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'skill-manager-empty-'))
process.env.DSH_HOME = home

const { apply } = await import('../index.js')

const routes = new Map()
const ctx = {
  get(name) {
    if (name === 'sessions') {
      return { list: () => [{ header: { cwd: process.cwd() } }] }
    }
    if (name === 'agentDefaultModel') {
      return { currentSelection: () => ({ provider: 'workbuddy', model: 'deepseek-v4.1-flash' }) }
    }
    return undefined
  },
  effect: (callback) => callback(),
  webServer: { register: (route) => { routes.set(route.path, route.handler); return () => {} } },
}

apply(ctx, {})

const handler = routes.get('/api/dsh-skill-manager/list')
const request = { method: 'GET', url: '/api/dsh-skill-manager/list', headers: {}, socket: { remoteAddress: '::1' } }
const chunks = []
const response = {
  writeHead() {},
  end(payload) { chunks.push(payload) },
}
await handler(request, response)

const payload = JSON.parse(chunks.join(''))
const withSummary = payload.skills.filter((skill) => (skill.summary ?? '') !== '').length
console.log(`state dir (empty): ${home}`)
console.log(`skills: ${payload.skills.length}   summaries present: ${withSummary}`)
console.log(`shelves: ${payload.types.length}`)
for (const shelf of payload.types) console.log(`  ${shelf.type.padEnd(10)} ${String(shelf.names.length).padStart(3)}`)
const typed = payload.skills.filter((skill) => (skill.type ?? '') !== '').length
console.log(`skills carrying a type with zero summaries: ${typed} of ${payload.skills.length}`)
