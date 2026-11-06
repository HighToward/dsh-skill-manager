// Ask the live panel to draw icons for several shelves at once, so the drawings
// can be judged against the names they are supposed to stand for rather than
// against one lucky example.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { getChromium, GUI_URL } from './_browser.mjs'
const chromium = await getChromium()

const BASE = GUI_URL + '/api/dsh-skill-manager'
const out = join(dirname(fileURLToPath(import.meta.url)), 'out', 'shelf-icons.png')

const call = async (path, body) => {
  const response = await fetch(BASE + path, body === undefined
    ? {}
    : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { status: response.status, body: await response.json() }
}

const LABELS = ['音效库', '剪辑素材', '客户合同', '我的博客']

const FALLBACK = {
  custom: [['path', { d: 'M11.4 3.2H20v8.6l-9 9-8.6-8.6z' }], ['circle', { cx: 16.2, cy: 6.9, r: 1.15 }]],
}

const svg = (shapes, size) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  ${shapes.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ')} />`).join('')}
</svg>`

const cell = (shapes, label, size = 22, slot = 42) => `
  <div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:120px">
    <div style="display:flex;align-items:center;justify-content:center;width:${slot}px;height:${slot}px;
                border:1px solid rgba(128,128,128,.35);border-radius:8px">${svg(shapes, size)}</div>
    <span style="font:12.5px 'Microsoft YaHei';opacity:.85;text-align:center">${label}</span>
  </div>`

// Start from a clean slate: drop any shelf this probe made on an earlier run.
const before = await call('/list')
for (const entry of before.body.types) {
  if (entry.custom === true && LABELS.includes(entry.label)) await call('/types', { action: 'remove', type: entry.type })
}

const made = []
for (const label of LABELS) {
  const created = await call('/types', { action: 'create', label })
  const id = created.body.type
  const drawn = await call('/types', { action: 'icon', type: id })
  const shapes = Array.isArray(drawn.body.glyph) ? drawn.body.glyph : []
  console.log(`${label.padEnd(6)} ${drawn.status} ${drawn.body.model ?? ''} ${JSON.stringify(shapes)}`)
  made.push({ id, label, shapes })
}

const row = (bg, fg, title) => `
  <div style="padding:16px;border-radius:12px;background:${bg};color:${fg}">
    <div style="font:12px 'Microsoft YaHei';opacity:.6;margin:0 0 10px 2px">${title}</div>
    <div style="display:flex;align-items:flex-start;gap:12px">
      ${cell(FALLBACK.custom, '兜底：自定义')}
      ${made.map((entry) => cell(entry.shapes, entry.label)).join('')}
    </div>
  </div>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 720, height: 360 }, deviceScaleFactor: 2 })
await page.setContent(`<html><body style="margin:0;padding:16px;display:flex;flex-direction:column;gap:12px;background:#eeeef0">
  ${row('#ffffff', '#1b1b1f', '22px，卡片墙上的实际尺寸')}
  ${row('#1b1b1f', '#f1f1f3', '22px，深色主题')}
  <div style="padding:16px;border-radius:12px;background:#ffffff;color:#1b1b1f">
    <div style="font:12px 'Microsoft YaHei';opacity:.6;margin:0 0 10px 2px">15px，进到架子里面包屑上的尺寸</div>
    <div style="display:flex;align-items:flex-end;gap:12px">
      ${made.map((entry) => cell(entry.shapes, entry.label, 15, 26)).join('')}
    </div>
  </div>
</body></html>`)
await page.waitForTimeout(200)
await page.screenshot({ path: out, fullPage: true })
await browser.close()

for (const entry of made) await call('/types', { action: 'remove', type: entry.id })
const after = await call('/list')
console.log('cleaned up:', after.body.types.every((entry) => entry.custom !== true), 'wrote', out)
