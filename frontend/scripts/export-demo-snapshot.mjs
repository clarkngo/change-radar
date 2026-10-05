// Exports a snapshot of a running backend for the static GitHub Pages demo.
// Usage: BACKEND_URL=http://localhost:8080 node scripts/export-demo-snapshot.mjs
import { writeFileSync } from 'node:fs'

const base = process.env.BACKEND_URL ?? 'http://localhost:8080'
const get = async (path) => {
  const response = await fetch(base + path)
  if (!response.ok) throw new Error(`${path}: ${response.status}`)
  return response.json()
}

const changes = []
for (let page = 0; ; page++) {
  const { items, total } = await get(`/api/changes?size=200&page=${page}`)
  changes.push(...items)
  if (changes.length >= total || items.length === 0) break
}

const snapshot = {
  exportedAt: new Date().toISOString(),
  catalog: await get('/api/catalog'),
  scenarios: await get('/api/demo/scenarios'),
  changes,
}
const out = new URL('../public/demo/snapshot.json', import.meta.url)
writeFileSync(out, JSON.stringify(snapshot))
console.log(`Wrote ${changes.length} changes and ${snapshot.scenarios.length} scenarios to ${out.pathname}`)
