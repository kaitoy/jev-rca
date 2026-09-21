import { choice } from '@typesafe-ai/sdk'
import type { Db } from '../db.ts'

export type Severity = 'info' | 'warning' | 'error' | 'critical'
export type EventRow = {
  id: number
  ci_id: string
  occurred_at: string
  severity: Severity
  message: string
  source: string | null
  ci_name: string
  ci_type: string
}
export type Candidate = {
  event: EventRow
  hops: number | null
  path: string | null
  deltaSeconds: number
  services: string[]
  sharedServices: string[]
}

const EVENT_SELECT = 'SELECT e.*, c.name AS ci_name, c.type AS ci_type FROM event e JOIN ci c ON c.id = e.ci_id'

/** BFS along relation.from_ci -> to_ci (the CIs `ciId` depends on). Includes ciId itself at hops 0. */
export function upstreamOf(db: Db, ciId: string, maxHops = 5): Map<string, { hops: number; path: string }> {
  // ponytail: loads every edge per call; swap for a recursive CTE if relations grow past ~10k rows
  const edges = db.prepare('SELECT from_ci, to_ci, label FROM relation').all() as { from_ci: string; to_ci: string; label: string }[]
  const out = new Map([[ciId, { hops: 0, path: ciId }]])
  let frontier = [ciId]
  for (let h = 1; h <= maxHops && frontier.length; h++) {
    const next: string[] = []
    for (const from of frontier)
      for (const e of edges)
        if (e.from_ci === from && !out.has(e.to_ci)) {
          out.set(e.to_ci, { hops: h, path: `${out.get(from)!.path} --${e.label}--> ${e.to_ci}` })
          next.push(e.to_ci)
        }
    frontier = next
  }
  return out
}

export function servicesOf(db: Db, ciId: string): string[] {
  return (db.prepare('SELECT service_id FROM service_ci WHERE ci_id = ? ORDER BY service_id').all(ciId) as { service_id: string }[]).map((r) => r.service_id)
}

/** Lays `ids` out top-down for drawing: longest-path rank, then column within the rank. */
export function layoutGraph(db: Db, ciIds: Iterable<string>) {
  const ids = new Set(ciIds)
  const edges = (db.prepare('SELECT from_ci, to_ci, label FROM relation ORDER BY from_ci, to_ci').all() as { from_ci: string; to_ci: string; label: string }[])
    .filter((e) => ids.has(e.from_ci) && ids.has(e.to_ci))
  // longest-path layering: rank(to) >= rank(from) + 1. Passes are bounded by node count so a cycle can't spin forever.
  const rank = new Map([...ids].map((id) => [id, 0]))
  for (let i = 0, changed = true; changed && i < ids.size; i++) {
    changed = false
    for (const e of edges) {
      const r = rank.get(e.from_ci)! + 1
      if (rank.get(e.to_ci)! < r) { rank.set(e.to_ci, r); changed = true }
    }
  }
  // ponytail: nodes sorted by id within a rank; add barycenter ordering if edge crossings get ugly
  const next = new Map<number, number>()
  const cis = ids.size
    ? db.prepare(`SELECT id, name, type FROM ci WHERE id IN (${[...ids].map(() => '?').join(',')}) ORDER BY id`).all(...ids) as { id: string; name: string; type: string }[]
    : []
  const nodes = cis.map((c) => {
    const r = rank.get(c.id)!, col = next.get(r) ?? 0
    next.set(r, col + 1)
    return { ...c, rank: r, col }
  })
  return { nodes, edges }
}

/** Member CIs plus the upstream CIs RCA can reach from them (same 5-hop horizon as gatherCandidates). Non-members are muted. */
export function serviceGraph(db: Db, serviceId: string) {
  const members = (db.prepare('SELECT ci_id FROM service_ci WHERE service_id = ? ORDER BY ci_id').all(serviceId) as { ci_id: string }[]).map((r) => r.ci_id)
  const g = layoutGraph(db, members.flatMap((m) => [...upstreamOf(db, m).keys()]))
  return { ...g, nodes: g.nodes.map((n) => ({ ...n, muted: !members.includes(n.id) })) }
}

/** Every CI gatherCandidates scans for `ciId`: its upstream chain plus the CIs sharing a service with it. */
export function rcaScope(db: Db, ciId: string) {
  const up = upstreamOf(db, ciId)
  const sameService = (db.prepare(
    'SELECT DISTINCT ci_id FROM service_ci WHERE service_id IN (SELECT service_id FROM service_ci WHERE ci_id = ?)',
  ).all(ciId) as { ci_id: string }[]).map((r) => r.ci_id)
  return { up, ciIds: [...new Set([...up.keys(), ...sameService])] }
}

export function gatherCandidates(db: Db, targetEventId: number, windowMinutes: number, limit = 50) {
  const target = db.prepare(`${EVENT_SELECT} WHERE e.id = ?`).get(targetEventId) as EventRow | undefined
  if (!target) throw new Error(`event ${targetEventId} not found`)
  const { up, ciIds } = rcaScope(db, target.ci_id)
  const targetServices = servicesOf(db, target.ci_id)
  const t = Date.parse(target.occurred_at)
  const w = windowMinutes * 60_000
  const rows = db.prepare(
    `${EVENT_SELECT} WHERE e.id <> ? AND e.occurred_at BETWEEN ? AND ? AND e.ci_id IN (${ciIds.map(() => '?').join(',')})`,
  ).all(targetEventId, new Date(t - w).toISOString(), new Date(t + w).toISOString(), ...ciIds) as EventRow[]
  const candidates: Candidate[] = rows
    .map((event) => {
      const u = up.get(event.ci_id)
      const services = servicesOf(db, event.ci_id)
      return {
        event,
        hops: u?.hops ?? null,
        path: u?.path ?? null,
        deltaSeconds: Math.round((Date.parse(event.occurred_at) - t) / 1000),
        services,
        sharedServices: targetServices.filter((s) => services.includes(s)),
      }
    })
    .sort((a, b) => Math.abs(a.deltaSeconds) - Math.abs(b.deltaSeconds))
    .slice(0, limit)
  return { target, targetServices, candidates }
}

// Jev reads dates as text and cannot count, so time deltas and hop counts are spelled out in words here.
export function describeTiming(deltaSeconds: number): string {
  if (deltaSeconds === 0) return 'The candidate occurred at the same time as the target'
  const abs = Math.abs(deltaSeconds)
  const m = Math.floor(abs / 60)
  const s = abs % 60
  const dur = [m && `${m} minute${m === 1 ? '' : 's'}`, s && `${s} second${s === 1 ? '' : 's'}`].filter(Boolean).join(' ')
  return `The candidate occurred ${dur} ${deltaSeconds < 0 ? 'BEFORE' : 'AFTER'} the target`
}

export function describeTopology(hops: number | null, path: string | null, sharedServices: string[]): string {
  if (hops === 0) return 'The candidate occurred on the same CI as the target'
  if (hops != null) return `The candidate's CI is ${hops} hop${hops === 1 ? '' : 's'} upstream of the target's CI (the target depends on it): ${path}`
  return `No dependency path from the target's CI to the candidate's CI; both belong to service(s): ${sharedServices.join(', ') || 'none'}`
}

export const RELATION_QUESTION = choice(
  'How does `candidate` relate to `target`? Both are IT operations events from a monitored system. Judge using `topology` (the dependency relationship between their configuration items), `timing`, and the two event messages.',
  {
    root_cause:
      "The candidate is a plausible direct or upstream cause of the target: it happened before the target, on the same CI or on a CI the target depends on, and its message explains the target's symptom.",
    co_symptom:
      'The candidate and the target are both symptoms of the same underlying failure (e.g. sibling components failing at the same time), but the candidate did not cause the target.',
    unrelated:
      'The candidate has nothing to do with the target: different failure domain, wrong timing (after the target, or too far apart), or routine/informational noise.',
  },
)

const ev = (e: EventRow, services: string[]) => ({
  ci: e.ci_id, ci_name: e.ci_name, ci_type: e.ci_type, severity: e.severity, message: e.message, services,
})

export function buildState(target: EventRow, targetServices: string[], c: Candidate) {
  return {
    target: ev(target, targetServices),
    candidate: ev(c.event, c.services),
    topology: describeTopology(c.hops, c.path, c.sharedServices),
    timing: describeTiming(c.deltaSeconds),
  }
}

// Rank: P(root_cause) bucket, then Jev's origin pick among the tied bucket (NULL = not tied, sorts last under DESC), then upstream depth, then earliest.
export const RANK_ORDER = 'round(ac.p_root_cause, 1) DESC, ac.p_origin DESC, ac.hops DESC, ac.delta_seconds ASC'

/** Indices in the top P(root_cause) bucket with verdict root_cause; [] unless at least two tie.
 *  Bucket = toFixed(1), which matches SQLite round(p, 1) in RANK_ORDER (Math.round(p * 10) does not at x.x5). */
export function tiedRootCauses(answers: { choice: string; probabilities: { root_cause: number } }[]): number[] {
  const bucket = (x: (typeof answers)[number]) => Number(x.probabilities.root_cause.toFixed(1))
  const top = Math.max(...answers.map(bucket))
  const idx = answers.flatMap((x, i) => (x.choice === 'root_cause' && bucket(x) === top ? [i] : []))
  return idx.length > 1 ? idx : []
}

export const ORIGIN_QUESTION =
  'Which option is the ORIGIN of the incident behind `target`? Every option is an IT operations event already judged a plausible root cause of `target`, and together they most likely form one causal chain in which each failure propagated to the next. Choose the option that started the chain: the earliest, most upstream failure whose message explains the other options and is not itself explained by any of them. Use each option\'s topology (dependency distance to the target), timing (when it occurred relative to the target) and message. Messages about waiting on, timing out against, or being unable to reach another component describe consequences and point further upstream.'

/** Second-pass request: one choice option per tied candidate, keyed event_<id>. */
export function buildOrigin(target: EventRow, targetServices: string[], tied: Candidate[]) {
  return {
    state: { target: ev(target, targetServices) },
    questions: {
      origin: choice(ORIGIN_QUESTION, Object.fromEntries(tied.map((c) => [
        `event_${c.event.id}`,
        { ...ev(c.event, c.services), topology: describeTopology(c.hops, c.path, c.sharedServices), timing: describeTiming(c.deltaSeconds) },
      ]))),
    },
  }
}
