import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Boxes, Layers, Network, Pencil, Trash2 } from 'lucide-react'
import { CiGraph } from '../components/ci-graph.tsx'
import { Button, ErrorText, Field, Input, PageHeader, SectionCard, Select, formData, useAction } from '../components/ui.tsx'
import { addServiceCi, deleteService, getService, removeServiceCi, upsertService } from '../server/cmdb.ts'

export const Route = createFileRoute('/services/$id')({
  loader: ({ params }) => getService({ data: { id: params.id } }),
  component: ServicePage,
})

function ServicePage() {
  const { service, members, others, graph } = Route.useLoaderData()
  const navigate = useNavigate()
  const save = useAction(upsertService)
  const remove = useAction(deleteService, () => navigate({ to: '/services' }))
  const add = useAction(addServiceCi)
  const drop = useAction(removeServiceCi)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Layers} eyebrow="Service" title={service.name}
        actions={<Button variant="ghost" pending={remove.pending} pendingLabel="Deleting…" onClick={() => confirm(`Delete ${service.id}?`) && remove.run({ data: { id: service.id } })}><Trash2 strokeWidth={1.8} aria-hidden className="h-4 w-4" />Delete</Button>} />
      <ErrorText>{remove.error}</ErrorText>
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard icon={Pencil} title="Basic info">
          <form className="flex flex-col gap-4" onSubmit={(e) => { const d = formData(e); save.run({ data: { id: service.id, name: d.name, description: d.description } }) }}>
            <Field label="ID" htmlFor="s-id"><Input id="s-id" value={service.id} readOnly className="font-mono opacity-70" /></Field>
            <Field label="Name" htmlFor="s-name"><Input id="s-name" name="name" defaultValue={service.name} required /></Field>
            <Field label="Description" htmlFor="s-desc"><Input id="s-desc" name="description" defaultValue={service.description ?? ''} /></Field>
            <div className="flex items-center gap-3"><Button type="submit" pending={save.pending} pendingLabel="Saving…">Save</Button><ErrorText>{save.error}</ErrorText></div>
          </form>
        </SectionCard>
        <SectionCard icon={Boxes} title="Member CIs">
          {members.length === 0 ? <p className="text-sm text-on-surface-variant">None</p> : (
            <ul className="flex flex-col gap-2">
              {members.map((c) => (
                <li key={c.id} className="flex items-center gap-2 rounded-xl border border-outline-variant bg-surface-dim/40 px-3 py-1.5 text-sm">
                  <Link to="/cis/$id" params={{ id: c.id }} className="font-mono text-xs text-accent hover:underline">{c.id}</Link>
                  <span>{c.name}</span>
                  <span className="font-mono text-[11px] text-on-surface-variant">{c.type}</span>
                  <Button variant="ghost" className="ml-auto px-2 py-1" aria-label="Remove from members" onClick={() => drop.run({ data: { service_id: service.id, ci_id: c.id } })}><Trash2 strokeWidth={1.8} aria-hidden className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          )}
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { const d = formData(e); const f = e.currentTarget; add.run({ data: { service_id: service.id, ci_id: d.ci_id } }).then(() => f.reset()) }}>
            <Field label="Add CI" htmlFor="m-ci" className="min-w-48 flex-1">
              <Select id="m-ci" name="ci_id" required defaultValue=""><option value="" disabled>Select</option>{others.map((c) => <option key={c.id} value={c.id}>{c.id} — {c.name}</option>)}</Select>
            </Field>
            <Button type="submit" variant="secondary" pending={add.pending} pendingLabel="Adding…">Add</Button>
            <ErrorText>{add.error ?? drop.error}</ErrorText>
          </form>
        </SectionCard>
      </div>
      <SectionCard icon={Network} title="Topology">
        {graph.nodes.length === 0 ? <p className="text-sm text-on-surface-variant">None</p> : <CiGraph {...graph} />}
        <p className="text-xs text-on-surface-variant">Arrows point from a CI to what it depends on. Dashed nodes are outside this service but upstream of a member — the same CIs RCA considers.</p>
      </SectionCard>
    </div>
  )
}
