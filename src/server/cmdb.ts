import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '../db.ts'
import { serviceGraph } from './rca.ts'

export type Ci = { id: string; name: string; type: string; description: string | null }
export type Service = { id: string; name: string; description: string | null }
export type Relation = { from_ci: string; to_ci: string; label: string; name: string }

const slug = z.string().trim().min(1).max(64).regex(/^[a-zA-Z0-9._-]+$/, 'alphanumeric, ., _, - only')
const ciInput = z.object({ id: slug, name: z.string().trim().min(1).max(200), type: z.string().trim().min(1).max(64), description: z.string().trim().max(2000).optional() })
const serviceInput = z.object({ id: slug, name: z.string().trim().min(1).max(200), description: z.string().trim().max(2000).optional() })
const byId = z.object({ id: slug })

export const listCis = createServerFn({ method: 'GET' }).handler(() =>
  getDb().prepare('SELECT * FROM ci ORDER BY id').all() as Ci[],
)

export const getCi = createServerFn({ method: 'GET' }).validator(byId).handler(({ data }) => {
  const db = getDb()
  const ci = db.prepare('SELECT * FROM ci WHERE id = ?').get(data.id) as Ci | undefined
  if (!ci) throw new Error(`CI ${data.id} not found`)
  return {
    ci,
    upstream: db.prepare('SELECT r.*, c.name FROM relation r JOIN ci c ON c.id = r.to_ci WHERE r.from_ci = ? ORDER BY r.to_ci').all(data.id) as Relation[],
    downstream: db.prepare('SELECT r.*, c.name FROM relation r JOIN ci c ON c.id = r.from_ci WHERE r.to_ci = ? ORDER BY r.from_ci').all(data.id) as Relation[],
    services: db.prepare('SELECT s.* FROM service s JOIN service_ci sc ON sc.service_id = s.id WHERE sc.ci_id = ? ORDER BY s.id').all(data.id) as Service[],
    events: db.prepare('SELECT * FROM event WHERE ci_id = ? ORDER BY occurred_at DESC LIMIT 10').all(data.id) as { id: number; occurred_at: string; severity: string; message: string }[],
    allCis: db.prepare('SELECT id, name FROM ci WHERE id <> ? ORDER BY id').all(data.id) as Pick<Ci, 'id' | 'name'>[],
  }
})

export const upsertCi = createServerFn({ method: 'POST' }).validator(ciInput).handler(({ data }) => {
  getDb().prepare('INSERT INTO ci (id, name, type, description) VALUES (?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, type = excluded.type, description = excluded.description')
    .run(data.id, data.name, data.type, data.description || null)
  return data.id
})

export const deleteCi = createServerFn({ method: 'POST' }).validator(byId).handler(({ data }) => {
  getDb().prepare('DELETE FROM ci WHERE id = ?').run(data.id)
})

const relationInput = z.object({ from_ci: slug, to_ci: slug, label: z.string().trim().min(1).max(64).default('depends_on') })

export const addRelation = createServerFn({ method: 'POST' }).validator(relationInput).handler(({ data }) => {
  if (data.from_ci === data.to_ci) throw new Error('Cannot depend on itself')
  getDb().prepare('INSERT OR IGNORE INTO relation (from_ci, to_ci, label) VALUES (?, ?, ?)').run(data.from_ci, data.to_ci, data.label)
})

export const deleteRelation = createServerFn({ method: 'POST' }).validator(relationInput).handler(({ data }) => {
  getDb().prepare('DELETE FROM relation WHERE from_ci = ? AND to_ci = ? AND label = ?').run(data.from_ci, data.to_ci, data.label)
})

export const listServices = createServerFn({ method: 'GET' }).handler(() =>
  getDb().prepare('SELECT s.*, (SELECT count(*) FROM service_ci sc WHERE sc.service_id = s.id) AS members FROM service s ORDER BY s.id').all() as (Service & { members: number })[],
)

export const getService = createServerFn({ method: 'GET' }).validator(byId).handler(({ data }) => {
  const db = getDb()
  const service = db.prepare('SELECT * FROM service WHERE id = ?').get(data.id) as Service | undefined
  if (!service) throw new Error(`Service ${data.id} not found`)
  return {
    service,
    members: db.prepare('SELECT c.* FROM ci c JOIN service_ci sc ON sc.ci_id = c.id WHERE sc.service_id = ? ORDER BY c.id').all(data.id) as Ci[],
    others: db.prepare('SELECT id, name FROM ci WHERE id NOT IN (SELECT ci_id FROM service_ci WHERE service_id = ?) ORDER BY id').all(data.id) as Pick<Ci, 'id' | 'name'>[],
    graph: serviceGraph(db, data.id),
  }
})

export const upsertService = createServerFn({ method: 'POST' }).validator(serviceInput).handler(({ data }) => {
  getDb().prepare('INSERT INTO service (id, name, description) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description')
    .run(data.id, data.name, data.description || null)
  return data.id
})

export const deleteService = createServerFn({ method: 'POST' }).validator(byId).handler(({ data }) => {
  getDb().prepare('DELETE FROM service WHERE id = ?').run(data.id)
})

const membership = z.object({ service_id: slug, ci_id: slug })

export const addServiceCi = createServerFn({ method: 'POST' }).validator(membership).handler(({ data }) => {
  getDb().prepare('INSERT OR IGNORE INTO service_ci (service_id, ci_id) VALUES (?, ?)').run(data.service_id, data.ci_id)
})

export const removeServiceCi = createServerFn({ method: 'POST' }).validator(membership).handler(({ data }) => {
  getDb().prepare('DELETE FROM service_ci WHERE service_id = ? AND ci_id = ?').run(data.service_id, data.ci_id)
})
