// Render the SVG app icon to a 256x256 PNG for the dsh-market `icon` field.
import { readFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getChromium, GUI_URL } from './_browser.mjs'
const chromium = await getChromium()

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'icon.svg'), 'utf8')
const out = join(root, 'docs', 'icon-256.png')
mkdirSync(dirname(out), { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 })
await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;width:256px;height:256px">${svg.replace(/width="64" height="64"/, 'width="256" height="256"')}</body></html>`, { waitUntil: 'load' })
await page.screenshot({ path: out, omitBackground: false })
await browser.close()
console.log('wrote', out)
