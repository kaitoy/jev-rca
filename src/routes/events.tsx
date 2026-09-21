import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Activity, Inbox, Plus, Search, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { Badge, Button, DataTable, EmptyState, ErrorText, Field, Input, PageHeader, SectionCard, Select, Textarea, cx, fmtTime, formData, severityTone, useAction } from '../components/ui.tsx'
import { runAnalysis } from '../server/analysis.ts'
import { listCis } from '../server/cmdb.ts'
import { SEVERITIES, createEvent, deleteEvent, listEvents } from '../server/events.ts'

const search = z.object({ ci: z.string().optional(), severity: z.enum(SEVERITIES).optional() })

export const Route = createFileRoute('/events')({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [events, cis] = await Promise.all([listEvents({ data: deps }), listCis()])
    return { events, cis }
  },
  component: EventsPage,
})

function EventsPage() {
  const { events, cis } = Route.useLoaderData()
  const filters = Route.useSearch()
  const navigate = useNavigate({ from: '/events' })
  const [windowMinutes, setWindowMinutes] = useState(30)
  const [running, setRunning] = useState<number | null>(null)
  const analyze = useAction(runAnalysis, (id) => navigate({ to: '/analyses/$id', params: { id: String(id) } }))
  const create = useAction(createEvent)
  const remove = useAction(deleteEvent)

  const startAnalysis = async (eventId: number) => {
    setRunning(eventId)
    await analyze.run({ data: { eventId, windowMinutes } })
    setRunning(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Activity} title="Events" eyebrow="Events" />

      <SectionCard icon={Plus} title="Add event">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { const d = formData(e); const f = e.currentTarget; create.run({ data: { ci_id: d.ci_id, message: d.message, source: d.source, occurred_at: /^[0-9-]+T[0-9:]+$/.test(d.occurred_at) ? `${d.occurred_at}Z` : d.occurred_at, severity: d.severity as typeof SEVERITIES[number] } }).then(() => f.reset()) }}>
          <Field label="CI" htmlFor="ev-ci">
            <Select id="ev-ci" name="ci_id" required defaultValue="">
              <option value="" disabled>Select</option>
              {cis.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}
            </Select>
          </Field>
          <Field label="Occurred at (UTC)" htmlFor="ev-at"><Input id="ev-at" name="occurred_at" type="datetime-local" step={1} required className="font-mono text-xs" /></Field>
          <Field label="Severity" htmlFor="ev-sev">
            <Select id="ev-sev" name="severity" defaultValue="error">{SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}</Select>
          </Field>
          <Field label="Source (optional)" htmlFor="ev-src"><Input id="ev-src" name="source" placeholder="nginx, vcenter, ..." /></Field>
          <Field label="Message" htmlFor="ev-msg" className="sm:col-span-2"><Textarea id="ev-msg" name="message" rows={2} required placeholder="HTTP 5xx rate 45% (threshold 5%)" /></Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" pending={create.pending} pendingLabel="Adding…">Add</Button>
            <ErrorText>{create.error}</ErrorText>
          </div>
        </form>
      </SectionCard>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Filter by CI" htmlFor="f-ci" className="w-48">
          <Select id="f-ci" value={filters.ci ?? ''} onChange={(e) => navigate({ search: { ...filters, ci: e.target.value || undefined } })}>
            <option value="">All</option>
            {cis.map((c) => <option key={c.id} value={c.id}>{c.id}</option>)}
          </Select>
        </Field>
        <Field label="Severity" htmlFor="f-sev" className="w-36">
          <Select id="f-sev" value={filters.severity ?? ''} onChange={(e) => navigate({ search: { ...filters, severity: (e.target.value || undefined) as typeof filters.severity } })}>
            <option value="">All</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Analysis window (± min)" htmlFor="f-win" className="w-36">
          <Input id="f-win" type="number" min={1} max={1440} value={windowMinutes} onChange={(e) => setWindowMinutes(Number(e.target.value) || 30)} className="font-mono" />
        </Field>
        <div className="ml-auto flex items-center gap-3">
          <ErrorText>{analyze.error ?? remove.error}</ErrorText>
        </div>
      </div>

      <DataTable
        rows={events}
        rowKey={(e) => e.id}
        rowClass={(e) => cx(running === e.id && 'bg-accent-soft')}
        empty={<EmptyState icon={Inbox} title="No events" description="Add one with the form above, or import sample data" />}
        columns={[
          { key: 'at', header: 'Occurred at', cell: (e) => <span className="font-mono text-xs whitespace-nowrap">{fmtTime(e.occurred_at)}</span> },
          { key: 'ci', header: 'CI', cell: (e) => <Link to="/cis/$id" params={{ id: e.ci_id }} className="font-mono text-xs text-accent hover:underline whitespace-nowrap">{e.ci_id}</Link> },
          { key: 'sev', header: 'Severity', cell: (e) => <Badge tone={severityTone[e.severity]}>{e.severity}</Badge> },
          { key: 'msg', header: 'Message', className: 'w-full', cell: (e) => <span className="block max-w-sm truncate font-mono text-xs" title={e.message}>{e.message}</span> },
          { key: 'src', header: 'Source', cell: (e) => <span className="text-xs text-on-surface-variant whitespace-nowrap">{e.source ?? '—'}</span> },
          {
            key: 'act', header: '', className: 'whitespace-nowrap', cell: (e) => (
              <div className="flex items-center justify-end gap-1">
                <Button variant="secondary" className="px-3 py-1.5" live={running === e.id} pending={analyze.pending} pendingLabel={running === e.id ? 'Analyzing…' : 'Analyze'} onClick={() => startAnalysis(e.id)}>
                  <Search strokeWidth={1.8} aria-hidden className="h-4 w-4" />Analyze
                </Button>
                <Button variant="ghost" className="px-2 py-1.5" aria-label="Delete" onClick={() => confirm('Delete this event?') && remove.run({ data: { id: e.id } })}>
                  <Trash2 strokeWidth={1.8} aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  )
}
