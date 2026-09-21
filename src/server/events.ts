import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getDb } from '../db.ts'
import type { EventRow } from './rca.ts'

export const SEVERITIES = ['info', 'warning', 'error', 'critical'] as const
const severity = z.enum(SEVERITIES)

export const eventInput = z.object({
  ci_id: z.string().trim().min(1),
  occurred_at: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date/time format'),
  severity,
  message: z.string().trim().min(1).max(4000),
  source: z.string().trim().max(200).optional(),
})

export const listEvents = createServerFn({ method: 'GET' })
  .validator(z.object({ ci: z.string().optional(), severity: severity.optional() }).optional())
  .handler(({ data }) => {
    const where: string[] = []
    const args: string[] = []
    if (data?.ci) { where.push('e.ci_id = ?'); args.push(data.ci) }
    if (data?.severity) { where.push('e.severity = ?'); args.push(data.severity) }
    const sql = `SELECT e.*, c.name AS ci_name, c.type AS ci_type FROM event e JOIN ci c ON c.id = e.ci_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY e.occurred_at DESC LIMIT 500`
    return getDb().prepare(sql).all(...args) as EventRow[]
  })

export const createEvent = createServerFn({ method: 'POST' }).validator(eventInput).handler(({ data }) => {
  const r = getDb().prepare('INSERT INTO event (ci_id, occurred_at, severity, message, source) VALUES (?, ?, ?, ?, ?)')
    .run(data.ci_id, new Date(data.occurred_at).toISOString(), data.severity, data.message, data.source || null)
  return Number(r.lastInsertRowid)
})

export const deleteEvent = createServerFn({ method: 'POST' }).validator(z.object({ id: z.number().int() })).handler(({ data }) => {
  getDb().prepare('DELETE FROM event WHERE id = ?').run(data.id)
})
