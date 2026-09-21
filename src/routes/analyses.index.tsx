import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox, Search } from 'lucide-react'
import { Badge, DataTable, EmptyState, PageHeader, fmtTime, severityTone } from '../components/ui.tsx'
import { listAnalyses } from '../server/analysis.ts'

export const Route = createFileRoute('/analyses/')({
  loader: () => listAnalyses(),
  component: AnalysesPage,
})

function AnalysesPage() {
  const rows = Route.useLoaderData()
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Search} title="Analysis history" eyebrow="Analyses" />
      <DataTable
        rows={rows}
        rowKey={(a) => a.id}
        empty={<EmptyState icon={Inbox} title="No analyses yet" description="Run one from the 'Analyze' button on the events list" />}
        columns={[
          { key: 'id', header: '#', cell: (a) => <Link to="/analyses/$id" params={{ id: String(a.id) }} className="font-mono text-xs text-accent hover:underline">{a.id}</Link> },
          { key: 'at', header: 'Run at', cell: (a) => <span className="font-mono text-xs whitespace-nowrap">{fmtTime(a.created_at)}</span> },
          { key: 'target', header: 'Target', cell: (a) => (
            <Link to="/analyses/$id" params={{ id: String(a.id) }} className="flex items-center gap-2 hover:underline">
              <Badge tone={severityTone[a.target_severity]}>{a.target_severity}</Badge>
              <span className="font-mono text-xs whitespace-nowrap">{a.target_ci}</span>
              <span className="max-w-[14rem] truncate text-xs" title={a.target_message}>{a.target_message}</span>
            </Link>
          ) },
          { key: 'top', header: 'Top candidate', cell: (a) => <span className="block max-w-xs truncate font-mono text-xs" title={a.top ?? ''}>{a.top ?? '—'}</span> },
          { key: 'n', header: 'Candidates', cell: (a) => <span className="font-mono text-xs tabular-nums">{a.candidates}</span> },
          { key: 'win', header: 'Window', cell: (a) => <span className="font-mono text-xs tabular-nums whitespace-nowrap">±{a.window_minutes}min</span> },
        ]}
      />
    </div>
  )
}
