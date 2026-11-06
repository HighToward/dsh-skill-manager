// Resolve playwright without hardcoding anyone's home directory.
// In a normal checkout: npm i -D playwright, then import('playwright') works.
// With a global CLI install, set PLAYWRIGHT_MODULE to its index.mjs path.
import { pathToFileURL } from 'node:url'

export async function getChromium() {
  const override = process.env.PLAYWRIGHT_MODULE
  if (override) {
    const mod = await import(pathToFileURL(override).href)
    return mod.chromium
  }
  try {
    const mod = await import('playwright')
    return mod.chromium
  } catch {
    throw new Error('Rendering scripts need playwright: run npm i -D playwright, or set PLAYWRIGHT_MODULE to its index.mjs path.')
  }
}

// Base URL of a running DSH Web GUI, overridable for a non-default port.
export const GUI_URL = process.env.DSH_GUI_URL ?? 'http://127.0.0.1:14523'
