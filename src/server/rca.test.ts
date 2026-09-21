import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDb } from '../db.ts'
import { buildOrigin, describeTiming, describeTopology, gatherCandidates, RANK_ORDER, rcaScope, serviceGraph, tiedRootCauses, upstreamOf } from './rca.ts'

// Same shape as data/sample.json: lb -> web -> app -> db -> vm -> esx -> san
function seed() {
  const db = openDb(':memory:')
  for (const id of ['lb-01', 'web-01', 'web-02', 'app-01', 'db-01', 'vm-03', 'esx-01', 'san-01', 'sw-01', 'backup-01'])
    db.prepare('INSERT INTO ci (id, name, type) VALUES (?, ?, ?)').run(id, id, 'x')
  const rel = db.prepare('INSERT INTO relation (from_ci, to_ci, label) VALUES (?, ?, ?)')
  rel.run('lb-01', 'web-01', 'routes_to')
  rel.run('lb-01', 'web-02', 'routes_to')
  rel.run('web-01', 'app-01', 'calls')
  rel.run('web-02', 'app-01', 'calls')
  rel.run('app-01', 'db-01', 'uses_db')
  rel.run('db-01', 'vm-03', 'hosted_on')
  rel.run('vm-03', 'esx-01', 'hosted_on')
  rel.run('esx-01', 'san-01', 'uses_storage')
  db.prepare("INSERT INTO service (id, name) VALUES ('shop-web', 'Shop')").run()
  for (const ci of ['lb-01', 'web-01', 'web-02', 'app-01', 'db-01'])
    db.prepare("INSERT INTO service_ci VALUES ('shop-web', ?)").run(ci)
  const ev = db.prepare('INSERT INTO event (ci_id, occurred_at, severity, message) VALUES (?, ?, ?, ?)')
  const T = Date.parse('2026-09-18T09:00:00Z')
  const at = (min: number) => new Date(T + min * 60_000).toISOString()
  ev.run('san-01', at(-8), 'critical', 'SAN latency spike')
  ev.run('web-02', at(-2), 'error', 'Upstream timeout 504')
  ev.run('web-01', at(-40), 'info', 'Log rotation')          // outside window
  ev.run('backup-01', at(-1), 'info', 'Backup finished')     // no path, no shared service
  ev.run('web-01', at(0), 'critical', 'HTTP 5xx rate 45%')   // target
  ev.run('lb-01', at(3), 'warning', 'Backend web-01 unhealthy')
  return db
}

test('upstreamOf walks dependency direction with hop count and path', () => {
  const up = upstreamOf(seed(), 'web-01', 5)
  assert.equal(up.get('web-01')?.hops, 0)
  assert.equal(up.get('app-01')?.hops, 1)
  assert.equal(up.get('san-01')?.hops, 5)
  assert.equal(up.get('san-01')?.path, 'web-01 --calls--> app-01 --uses_db--> db-01 --hosted_on--> vm-03 --hosted_on--> esx-01 --uses_storage--> san-01')
  assert.equal(up.has('lb-01'), false, 'downstream CI is not upstream')
  assert.equal(upstreamOf(seed(), 'web-01', 2).has('vm-03'), false, 'maxHops caps the walk')
})

test('gatherCandidates keeps window + topology/service scope, drops target itself', () => {
  const db = seed()
  const target = db.prepare("SELECT id FROM event WHERE message = 'HTTP 5xx rate 45%'").get() as { id: number }
  const { candidates } = gatherCandidates(db, target.id, 30)
  const msgs = candidates.map((c) => c.event.message)
  assert.deepEqual(msgs, ['Upstream timeout 504', 'Backend web-01 unhealthy', 'SAN latency spike'], 'sorted by |delta|')
  const san = candidates.find((c) => c.event.ci_id === 'san-01')!
  assert.equal(san.hops, 5)
  assert.equal(san.deltaSeconds, -480)
  const lb = candidates.find((c) => c.event.ci_id === 'lb-01')!
  assert.equal(lb.hops, null, 'same service but no upstream path')
  assert.deepEqual(lb.sharedServices, ['shop-web'])
})

test('describeTiming / describeTopology put the arithmetic into words for Jev', () => {
  assert.equal(describeTiming(-252), 'The candidate occurred 4 minutes 12 seconds BEFORE the target')
  assert.equal(describeTiming(60), 'The candidate occurred 1 minute AFTER the target')
  assert.equal(describeTiming(0), 'The candidate occurred at the same time as the target')
  assert.equal(describeTopology(0, 'web-01', []), 'The candidate occurred on the same CI as the target')
  assert.match(describeTopology(2, 'a --x--> b --y--> c', []), /2 hops upstream .*a --x--> b --y--> c/)
  assert.match(describeTopology(null, null, ['shop-web']), /No dependency path.*shop-web/)
})

test('serviceGraph: members + reachable upstream, layered top-down', () => {
  const g = serviceGraph(seed(), 'shop-web')
  const n = Object.fromEntries(g.nodes.map((x) => [x.id, x]))
  assert.equal(n['lb-01'].muted, false)
  assert.equal(n['san-01'].muted, true, 'external upstream included')
  assert.equal(n['backup-01'], undefined, 'unreachable CI excluded')
  assert.deepEqual(['lb-01', 'web-01', 'app-01', 'db-01', 'vm-03', 'esx-01', 'san-01'].map((id) => n[id].rank), [0, 1, 2, 3, 4, 5, 6])
  assert.deepEqual([n['web-01'].col, n['web-02'].col], [0, 1])
  assert.equal(g.edges.length, 8)
})

test('rcaScope: upstream chain plus service siblings, nothing else', () => {
  const { ciIds } = rcaScope(seed(), 'web-01')
  assert.ok(ciIds.includes('san-01'), 'upstream 5 hops')
  assert.ok(ciIds.includes('lb-01'), 'same service, downstream')
  assert.ok(!ciIds.includes('backup-01'), 'no path, no shared service')
})

const a = (root_cause: number, choice = 'root_cause') => ({ choice, probabilities: { root_cause } })

test('tiedRootCauses: top bucket with verdict root_cause, only when at least two tie', () => {
  assert.deepEqual(tiedRootCauses([a(1.0), a(0.98), a(0.97), a(0.3, 'unrelated')]), [0, 1, 2])
  assert.deepEqual(tiedRootCauses([a(1.0), a(0.6)]), [])
  assert.deepEqual(tiedRootCauses([]), [])
  assert.deepEqual(tiedRootCauses([a(1.0), a(0.98, 'co_symptom')]), [], 'verdict filter')
})

test('tiedRootCauses buckets like SQLite round(p, 1)', () => {
  assert.deepEqual(tiedRootCauses([a(1.0), a(0.96)]), [0, 1])
  assert.deepEqual(tiedRootCauses([a(1.0), a(0.95)]), [], '0.95 rounds to 0.9 in SQLite and toFixed')
})

test('buildOrigin: one option per tied candidate with topology/timing spelled out', () => {
  const db = seed()
  const targetId = (db.prepare("SELECT id FROM event WHERE message = 'HTTP 5xx rate 45%'").get() as { id: number }).id
  const { target, targetServices, candidates } = gatherCandidates(db, targetId, 30)
  const req = buildOrigin(target, targetServices, candidates)
  assert.equal(req.state.target.ci, 'web-01')
  assert.deepEqual(Object.keys(req.questions.origin.criteria), candidates.map((c) => `event_${c.event.id}`))
  const san = req.questions.origin.criteria[`event_${candidates.find((c) => c.event.ci_id === 'san-01')!.event.id}`] as { topology: string; timing: string }
  assert.match(san.topology, /5 hops upstream/)
  assert.match(san.timing, /8 minutes BEFORE/)
})

test('RANK_ORDER: origin beats hops inside the tied bucket, NULL origin sorts after', () => {
  const db = seed()
  db.prepare("INSERT INTO analysis (target_event_id, window_minutes, created_at, model) VALUES (5, 30, '', 'm')").run()
  const ins = db.prepare(`INSERT INTO analysis_candidate
    (analysis_id, event_id, p_root_cause, p_co_symptom, p_unrelated, confidence, verdict, hops, path, delta_seconds, p_origin)
    VALUES (1, ?, ?, 0, 0, 0, 'root_cause', ?, NULL, ?, ?)`)
  ins.run(1, 1.0, 5, -480, 0.15)
  ins.run(2, 0.97, null, -120, 0.8)
  ins.run(4, 0.96, null, -60, null)
  ins.run(6, 0.3, null, 180, null)
  const order = (db.prepare(`SELECT ac.event_id FROM analysis_candidate ac ORDER BY ${RANK_ORDER}`).all() as { event_id: number }[]).map((r) => r.event_id)
  assert.deepEqual(order, [2, 1, 4, 6])
})
