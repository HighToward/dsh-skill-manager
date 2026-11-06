// Cascade check for the filled toolbar button: the generic hover rule used to
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
// win over the brand fill because it carried one more pseudo-class. Compare the
// specificity of every hover rule that targets .sc-btn and make sure the brand
// rule is the one that lands last and wins.
import { readFile } from 'node:fs/promises'

const source = await readFile(join(dirname(fileURLToPath(import.meta.url)), '..', 'client.js'), 'utf8')

const specificity = (selector) => {
  const pseudo = (selector.match(/::?[a-z-]+(\([^)]*\))?/gi) ?? []).filter((part) => !part.startsWith('::'))
  let classes = (selector.match(/(^|[^\\w-])\.[a-z-]+/gi) ?? []).length
  classes += (selector.match(/\[[^\]]+\]/g) ?? []).length
  // :not(X) contributes the specificity of X, so count the inner simple selector.
  for (const part of pseudo) {
    const inner = part.match(/\(([^)]*)\)/)
    if (inner) {
      classes += (inner[1].match(/(^|[^\\w-])\.[a-z-]+/gi) ?? []).length
      classes += (inner[1].match(/:[a-z-]+/gi) ?? []).length
      classes += (inner[1].match(/\[[^\]]+\]/g) ?? []).length
    } else {
      classes += 1
    }
  }
  return classes
}

const rules = (source.match(/'\.sc-btn[^']*\{[^}]*\}'/g) ?? []).map((rule) => {
  const selector = rule.slice(1, rule.indexOf('{'))
  const body = rule.slice(rule.indexOf('{') + 1, -1)
  return { selector, body, weight: specificity(selector) }
})

console.log('rules touching .sc-btn:')
for (const rule of rules) {
  const setsBg = /(^|;)background:/.test(rule.body)
  console.log(`  weight ${rule.weight}  bg ${setsBg ? 'yes' : 'no '}  ${rule.selector}`)
}

const genericHover = rules.find((rule) => rule.selector === '.sc-btn:hover:not(:disabled)')
const brandHover = rules.find((rule) => rule.selector === '.sc-btn[data-tone="brand"]:hover:not(:disabled)')
if (genericHover === undefined || brandHover === undefined) {
  console.log('FAIL: one of the two hover rules is missing')
  process.exit(1)
}
const wins = brandHover.weight > genericHover.weight
console.log('')
console.log(`generic hover weight ${genericHover.weight}, brand hover weight ${brandHover.weight}`)
console.log(wins ? 'ok    brand hover outranks the generic hover fill' : 'FAIL  generic hover still wins')
console.log(/color:var\(--dsw-alias-label-primary-inverted/.test(brandHover.body) ? 'ok    brand hover keeps an inverted text colour' : 'FAIL  brand hover drops its text colour')
process.exit(wins ? 0 : 1)
