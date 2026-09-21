import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/** Load .env into process.env. Unlike process.loadEnvFile(), fills keys that exist but are empty
 *  (Vite's dev server can pre-populate them from an earlier, blank .env). */
export function loadDotenv() {
  let text: string
  try { text = readFileSync('.env', 'utf8') } catch { return }
  for (const [k, v] of Object.entries(parseEnv(text))) if (!process.env[k]) process.env[k] = v
}
