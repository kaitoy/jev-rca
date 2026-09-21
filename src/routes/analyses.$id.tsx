import { createFileRoute, Link } from '@tanstack/react-router'
import { Crosshair, Inbox, ListOrdered, Network, Search } from 'lucide-react'
import { CiGraph } from '../components/ci-graph.tsx'
import { Badge, DataTable, DetailItem, DetailList, EmptyState, PageHeader, SectionCard, cx, fmtDelta, fmtTime, pct, severityTone, verdictLabel, verdictTone } from '../components/ui.tsx'
import { getAnalysis } from '../server/analysis.ts'

export const Route = createFileRoute('/analyses/$id')({
  loader: ({ params }) => getAnalysis({ data: { id: Number(params.id) } }),
  component: AnalysisPage,
})

/** Meter: accent fill on a lighter accent track; the value stays in text ink beside the bar. */
function Meter({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-20 rounded-full bg-accent-soft" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(2, value * 100)}%` }} />
      </div>
      <span className="font-mono text-xs tabular-nums">{pct(value)}</span>
    </div>
  )
}

function AnalysisPage() {
  const { analysis, target, candidates, graph } = Route.useLoaderData()
  const topId = candidates[0]?.id
  // Ranked by p_origin within the tied bucket, so a non-null p_origin on the top row means it won the origin pass.
  const originCi = candidates[0]?.p_origin != null ? candidates[0].ci_id : undefined
  // candidates are ranked, so the first hit per CI is that CI's top verdict
  const nodes = graph.nodes.map((n) => {
    const c = candidates.find((c) => c.ci_id === n.id)
    return { ...n, target: n.id === target.ci_id, origin: n.id === originCi, muted: !c && n.id !== target.ci_id, badge: c && { tone: verdictTone[c.verdict], label: verdictLabel[c.verdict] } }
  })
  return (
    <div className="flex flex-col gap-6 animate-message-in">
      <PageHeader icon={Search} eyebrow={`Analysis #${analysis.id} · ${fmtTime(analysis.created_at)} · ${analysis.model} · ±${analysis.window_minutes}min`}
        title={<><span className="font-mono">{target.ci_id}</span>: {target.message}</>} />

      <SectionCard icon={Crosshair} title="Target event">
        <DetailList>
          <DetailItem label="CI"><Link to="/cis/$id" params={{ id: target.ci_id }} className="font-mono text-xs text-accent hover:underline">{target.ci_id}</Link> <span className="text-on-surface-variant">— {target.ci_name} ({target.ci_type})</span></DetailItem>
          <DetailItem label="Occurred at" mono>{fmtTime(target.occurred_at)}</DetailItem>
          <DetailItem label="Severity"><Badge tone={severityTone[target.severity]}>{target.severity}</Badge></DetailItem>
          <DetailItem label="Source" mono>{target.source ?? '—'}</DetailItem>
          <DetailItem label="Message" mono wide>{target.message}</DetailItem>
        </DetailList>
      </SectionCard>

      <section className="flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight"><ListOrdered strokeWidth={1.8} aria-hidden className="h-5 w-5 text-accent" />Candidate ranking <span className="font-mono text-xs font-normal text-on-surface-variant">{candidates.length} items</span></h2>
        <DataTable
          rows={candidates}
          rowKey={(c) => c.id}
          rowClass={(c) => cx(c.id === topId && 'bg-accent-soft ring-1 ring-inset ring-accent/50')}
          empty={<EmptyState icon={Inbox} title="No candidates" description="No events in the same CI, an upstream CI, or the same service within the time window" />}
          columns={[
            { key: 'rank', header: '#', cell: (c) => <span className="font-mono text-xs tabular-nums text-on-surface-variant">{candidates.indexOf(c) + 1}</span> },
            { key: 'p', header: 'P(root cause)', cell: (c) => <Meter value={c.p_root_cause} /> },
            { key: 'origin', header: 'P(origin)', cell: (c) => c.p_origin == null ? <span className="text-on-surface-variant">—</span> : <Meter value={c.p_origin} /> },
            { key: 'verdict', header: 'Verdict', cell: (c) => <Badge tone={verdictTone[c.verdict]} className="cursor-help" title={`root_cause ${pct(c.p_root_cause)} / co_symptom ${pct(c.p_co_symptom)} / unrelated ${pct(c.p_unrelated)} · confidence ${c.confidence.toFixed(2)}`}>{verdictLabel[c.verdict]}</Badge> },
            { key: 'ci', header: 'CI', cell: (c) => <Link to="/cis/$id" params={{ id: c.ci_id }} className="font-mono text-xs text-accent hover:underline whitespace-nowrap">{c.ci_id}</Link> },
            { key: 'sev', header: 'Severity', cell: (c) => <Badge tone={severityTone[c.severity]}>{c.severity}</Badge> },
            { key: 'msg', header: 'Message', cell: (c) => <span className="block max-w-[14rem] truncate font-mono text-xs" title={c.message}>{c.message}</span> },
            { key: 'dt', header: 'Time delta', cell: (c) => <span className="font-mono text-xs tabular-nums whitespace-nowrap">{fmtDelta(c.delta_seconds)}</span> },
            {
              key: 'topo', header: 'Topology', cell: (c) => (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs whitespace-nowrap">{c.hops === 0 ? 'same CI' : c.hops != null ? `upstream ${c.hops} hop(s)` : 'shared service only'}</span>
                  {c.path && c.hops !== 0 && <span className="max-w-[12rem] truncate font-mono text-[10px] leading-3 text-on-surface-variant" title={c.path}>{c.path}</span>}
                </div>
              ),
            },
          ]}
        />
      </section>

      <SectionCard icon={Network} title="Topology">
        <CiGraph nodes={nodes} edges={graph.edges} />
        <p className="text-xs text-on-surface-variant">Arrows point from a CI to what it depends on. The ringed node is the target's CI; the red-ringed node with the Origin badge is the one Jev picked among tied root causes; a badge shows the top verdict among that CI's candidate events. Dashed nodes had no events in the window.</p>
      </SectionCard>
    </div>
  )
}
