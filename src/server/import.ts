import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb, transaction } from '../db.ts'
import { eventInput } from './events.ts'

const slug = z.string().trim().min(1).max(64)
export const importSchema = z.object({
  cis: z.array(z.object({ id: slug, name: z.string().min(1), type: z.string().min(1), description: z.string().optional() })).default([]),
  relations: z.array(z.object({ from_ci: slug, to_ci: slug, label: z.string().min(1).default('depends_on') })).default([]),
  services: z.array(z.object({ id: slug, name: z.string().min(1), description: z.string().optional() })).default([]),
  service_cis: z.array(z.object({ service_id: slug, ci_id: slug })).default([]),
  events: z.array(eventInput).default([]),
})

export const importJson = createServerFn({ method: 'POST' })
  .validator(z.object({ json: z.string().min(2) }))
  .handler(({ data }) => {
    let parsed: unknown
    try { parsed = JSON.parse(data.json) } catch { throw new Error('Could not parse as JSON') }
    const r = importSchema.safeParse(parsed)
    if (!r.success) throw new Error(`Validation error: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    const d = r.data
    const db = getDb()
    return transaction(db, () => {
      const ci = db.prepare('INSERT INTO ci (id, name, type, description) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, description = excluded.description')
      for (const c of d.cis) ci.run(c.id, c.name, c.type, c.description ?? null)
      const rel = db.prepare('INSERT OR IGNORE INTO relation (from_ci, to_ci, label) VALUES (?, ?, ?)')
      for (const x of d.relations) rel.run(x.from_ci, x.to_ci, x.label)
      const svc = db.prepare('INSERT INTO service (id, name, description) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description')
      for (const s of d.services) svc.run(s.id, s.name, s.description ?? null)
      const sc = db.prepare('INSERT OR IGNORE INTO service_ci (service_id, ci_id) VALUES (?, ?)')
      for (const x of d.service_cis) sc.run(x.service_id, x.ci_id)
      const ev = db.prepare('INSERT INTO event (ci_id, occurred_at, severity, message, source) VALUES (?, ?, ?, ?, ?)')
      for (const e of d.events) ev.run(e.ci_id, new Date(e.occurred_at).toISOString(), e.severity, e.message, e.source ?? null)
      return { cis: d.cis.length, relations: d.relations.length, services: d.services.length, service_cis: d.service_cis.length, events: d.events.length }
    })
  })
