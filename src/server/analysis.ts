import { createServerFn } from '@tanstack/react-start'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import { z } from 'zod'
import { getDb, transaction } from '../db.ts'
import { loadDotenv } from './env.ts'
import { buildOrigin, buildState, gatherCandidates, layoutGraph, RANK_ORDER, rcaScope, RELATION_QUESTION, tiedRootCauses, type EventRow } from './rca.ts'

let client: TypeSafeClient | undefined
function getClient() {
  if (!client) {
    loadDotenv()
    if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is not set (check .env)')
    client = new TypeSafeClient()
  }
  return client
}

export type Verdict = 'root_cause' | 'co_symptom' | 'unrelated'
export type AnalysisRow = { id: number; target_event_id: number; window_minutes: number; created_at: string; model: string }
export type CandidateRow = EventRow & {
  p_root_cause: number; p_co_symptom: number; p_unrelated: number; confidence: number
  verdict: Verdict; hops: number | null; path: string | null; delta_seconds: number; p_origin: number | null
}

export const runAnalysis = createServerFn({ method: 'POST' })
  .validator(z.object({ eventId: z.number().int(), windowMinutes: z.number().int().min(1).max(1440) }))
  .handler(async ({ data }) => {
    const db = getDb()
    const { target, targetServices, candidates } = gatherCandidates(db, data.eventId, data.windowMinutes)
    const ts = getClient()
    // One request per candidate (rerank-cookbook style): a focused judgment per pair keeps Jev clear of context overload.
    const results = await Promise.all(
      candidates.map((c) => ts.systemOne({ state: buildState(target, targetServices, c), questions: { relation: RELATION_QUESTION } })),
    )
    // Second pass only when the chain ties at the top: ask Jev which tied event is the origin. Must stay outside the sync transaction.
    const tied = tiedRootCauses(results.map((r) => r.answers.relation)).map((i) => candidates[i])
    const origin: Record<string, number> = tied.length
      ? (await ts.systemOne(buildOrigin(target, targetServices, tied))).answers.origin.probabilities
      : {}
    return transaction(db, () => {
      const id = Number(
        db.prepare('INSERT INTO analysis (target_event_id, window_minutes, created_at, model) VALUES (?, ?, ?, ?)')
          .run(data.eventId, data.windowMinutes, new Date().toISOString(), results[0]?.model ?? ts.defaultModel).lastInsertRowid,
      )
      const ins = db.prepare(`INSERT INTO analysis_candidate
        (analysis_id, event_id, p_root_cause, p_co_symptom, p_unrelated, confidence, verdict, hops, path, delta_seconds, p_origin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      candidates.forEach((c, i) => {
        const a = results[i].answers.relation
        ins.run(id, c.event.id, a.probabilities.root_cause, a.probabilities.co_symptom, a.probabilities.unrelated, a.confidence, a.choice, c.hops, c.path, c.deltaSeconds, origin[`event_${c.event.id}`] ?? null)
      })
      return id
    })
  })

export const listAnalyses = createServerFn({ method: 'GET' }).handler(() =>
  getDb().prepare(`SELECT a.*, e.message AS target_message, e.ci_id AS target_ci, e.severity AS target_severity,
      (SELECT count(*) FROM analysis_candidate ac WHERE ac.analysis_id = a.id) AS candidates,
      (SELECT e2.ci_id || ': ' || e2.message FROM analysis_candidate ac JOIN event e2 ON e2.id = ac.event_id
         WHERE ac.analysis_id = a.id ORDER BY ${RANK_ORDER} LIMIT 1) AS top
    FROM analysis a JOIN event e ON e.id = a.target_event_id ORDER BY a.id DESC`).all() as
    (AnalysisRow & { target_message: string; target_ci: string; target_severity: string; candidates: number; top: string | null })[],
)

export const getAnalysis = createServerFn({ method: 'GET' }).validator(z.object({ id: z.number().int() })).handler(({ data }) => {
  const db = getDb()
  const analysis = db.prepare('SELECT * FROM analysis WHERE id = ?').get(data.id) as AnalysisRow | undefined
  if (!analysis) throw new Error(`Analysis ${data.id} not found`)
  const target = db.prepare('SELECT e.*, c.name AS ci_name, c.type AS ci_type FROM event e JOIN ci c ON c.id = e.ci_id WHERE e.id = ?').get(analysis.target_event_id) as EventRow
  const candidates = db.prepare(`SELECT e.*, c.name AS ci_name, c.type AS ci_type, ac.p_root_cause, ac.p_co_symptom, ac.p_unrelated,
      ac.confidence, ac.verdict, ac.hops, ac.path, ac.delta_seconds, ac.p_origin
    FROM analysis_candidate ac JOIN event e ON e.id = ac.event_id JOIN ci c ON c.id = e.ci_id
    WHERE ac.analysis_id = ? ORDER BY ${RANK_ORDER}`).all(data.id) as CandidateRow[]
  // Drawn from the current CMDB, like the service page — the same CIs gatherCandidates scanned.
  return { analysis, target, candidates, graph: layoutGraph(db, rcaScope(db, target.ci_id).ciIds) }
})
