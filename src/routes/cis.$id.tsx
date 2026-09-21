import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Activity, ArrowDownToLine, ArrowUpFromLine, Boxes, Layers, Pencil, Trash2 } from 'lucide-react'
import { Badge, Button, ErrorText, Field, Input, PageHeader, SectionCard, Select, fmtTime, formData, severityTone, useAction } from '../components/ui.tsx'
import { addRelation, deleteCi, deleteRelation, getCi, upsertCi } from '../server/cmdb.ts'

export const Route = createFileRoute('/cis/$id')({
  loader: ({ params }) => getCi({ data: { id: params.id } }),
  component: CiPage,
})

function CiPage() {
  const { ci, upstream, downstream, services, events, allCis } = Route.useLoaderData()
  const navigate = useNavigate()
  const save = useAction(upsertCi)
  const remove = useAction(deleteCi, () => navigate({ to: '/cis' }))
  const link = useAction(addRelation)
  const unlink = useAction(deleteRelation)
  const relRow = (r: { from_ci: string; to_ci: string; label: string; name: string }, other: string) => (
    <li key={`${r.from_ci}-${r.to_ci}-${r.label}`} className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-dim/40 px-3 py-1.5 text-sm">
      <Link to="/cis/$id" params={{ id: other }} className="font-mono text-xs text-accent hover:underline">{other}</Link>
      <span className="text-on-surface-variant">{r.name}</span>
      <Badge>{r.label}</Badge>
      <Button variant="ghost" className="ml-auto px-2 py-1" aria-label="Remove relation" onClick={() => unlink.run({ data: r })}><Trash2 strokeWidth={1.8} aria-hidden className="h-4 w-4" /></Button>
    </li>
  )
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Boxes} eyebrow={`CI · ${ci.type}`} title={ci.name}
        actions={<Button variant="ghost" pending={remove.pending} pendingLabel="Deleting…" onClick={() => confirm(`Delete ${ci.id}? Its relations and events will be removed too.`) && remove.run({ data: { id: ci.id } })}><Trash2 strokeWidth={1.8} aria-hidden className="h-4 w-4" />Delete</Button>} />
      <ErrorText>{remove.error}</ErrorText>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={Pencil} title="Basic info">
          <form className="flex flex-col gap-4" onSubmit={(e) => { const d = formData(e); save.run({ data: { id: ci.id, name: d.name, type: d.type, description: d.description } }) }}>
            <Field label="ID" htmlFor="ci-id"><Input id="ci-id" value={ci.id} readOnly className="font-mono opacity-70" /></Field>
            <Field label="Name" htmlFor="ci-name"><Input id="ci-name" name="name" defaultValue={ci.name} required /></Field>
            <Field label="Type" htmlFor="ci-type"><Input id="ci-type" name="type" defaultValue={ci.type} required className="font-mono" /></Field>
            <Field label="Description" htmlFor="ci-desc"><Input id="ci-desc" name="description" defaultValue={ci.description ?? ''} /></Field>
            <div className="flex items-center gap-3"><Button type="submit" pending={save.pending} pendingLabel="Saving…">Save</Button><ErrorText>{save.error}</ErrorText></div>
          </form>
        </SectionCard>

        <SectionCard icon={Layers} title="Services">
          {services.length === 0 ? <p className="text-sm text-on-surface-variant">None (add as a member from the service page)</p> : (
            <ul className="flex flex-wrap gap-2">
              {services.map((s) => <li key={s.id}><Link to="/services/$id" params={{ id: s.id }} className="inline-flex items-center gap-2 rounded-xl glass-panel px-3 py-1.5 text-sm hover:text-accent"><span className="font-mono text-xs">{s.id}</span>{s.name}</Link></li>)}
            </ul>
          )}
        </SectionCard>

        <SectionCard icon={ArrowUpFromLine} title="Depends on (upstream)">
          <p className="text-xs text-on-surface-variant">CIs this CI depends on. Upstream failures become root-cause candidates.</p>
          <ul className="flex flex-col gap-2">{upstream.map((r) => relRow(r, r.to_ci))}</ul>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { const d = formData(e); const f = e.currentTarget; link.run({ data: { from_ci: ci.id, to_ci: d.to_ci, label: d.label || 'depends_on' } }).then(() => f.reset()) }}>
            <Field label="Depends on CI" htmlFor="rel-to" className="min-w-48 flex-1">
              <Select id="rel-to" name="to_ci" required defaultValue=""><option value="" disabled>Select</option>{allCis.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}</Select>
            </Field>
            <Field label="Label" htmlFor="rel-label" className="w-40"><Input id="rel-label" name="label" placeholder="depends_on" className="font-mono" /></Field>
            <Button type="submit" variant="secondary" pending={link.pending} pendingLabel="Adding…">Add</Button>
            <ErrorText>{link.error ?? unlink.error}</ErrorText>
          </form>
        </SectionCard>

        <SectionCard icon={ArrowDownToLine} title="Depended on by (downstream)">
          <p className="text-xs text-on-surface-variant">CIs that depend on this CI. Failures here can surface as symptoms of this CI.</p>
          {downstream.length === 0 ? <p className="text-sm text-on-surface-variant">None</p> : <ul className="flex flex-col gap-2">{downstream.map((r) => relRow(r, r.from_ci))}</ul>}
        </SectionCard>
      </div>

      <SectionCard icon={Activity} title="Recent events">
        {events.length === 0 ? <p className="text-sm text-on-surface-variant">None</p> : (
          <ul className="flex flex-col divide-y divide-divider/60">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <span className="font-mono text-xs whitespace-nowrap">{fmtTime(e.occurred_at)}</span>
                <Badge tone={severityTone[e.severity]}>{e.severity}</Badge>
                <span className="truncate font-mono text-xs" title={e.message}>{e.message}</span>
              </li>
            ))}
          </ul>
        )}
        <Link to="/events" search={{ ci: ci.id }} className="text-sm text-accent hover:underline">View all events →</Link>
      </SectionCard>
    </div>
  )
}
