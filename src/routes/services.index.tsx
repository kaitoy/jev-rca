import { createFileRoute, Link } from '@tanstack/react-router'
import { Inbox, Layers, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, ErrorText, Field, Input, PageHeader, SectionCard, formData, useAction } from '../components/ui.tsx'
import { listServices, upsertService } from '../server/cmdb.ts'

export const Route = createFileRoute('/services/')({
  loader: () => listServices(),
  component: ServicesPage,
})

function ServicesPage() {
  const services = Route.useLoaderData()
  const create = useAction(upsertService)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Layers} title="Services" eyebrow="Service mapping" />
      <SectionCard icon={Plus} title="Add service">
        <form className="grid gap-4 sm:grid-cols-3" onSubmit={(e) => { const d = formData(e); const f = e.currentTarget; create.run({ data: d as Parameters<typeof upsertService>[0]['data'] }).then(() => f.reset()) }}>
          <Field label="ID (alphanumeric . _ -)" htmlFor="s-id"><Input id="s-id" name="id" required pattern="[a-zA-Z0-9._-]+" placeholder="shop-web" className="font-mono" /></Field>
          <Field label="Name" htmlFor="s-name"><Input id="s-name" name="name" required placeholder="Shop Web" /></Field>
          <Field label="Description (optional)" htmlFor="s-desc"><Input id="s-desc" name="description" /></Field>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" pending={create.pending} pendingLabel="Adding…">Add</Button>
            <ErrorText>{create.error}</ErrorText>
          </div>
        </form>
      </SectionCard>
      <DataTable
        rows={services}
        rowKey={(s) => s.id}
        empty={<EmptyState icon={Inbox} title="No services" description="Add one with the form above, or import sample data" />}
        columns={[
          { key: 'id', header: 'ID', cell: (s) => <Link to="/services/$id" params={{ id: s.id }} className="font-mono text-xs text-accent hover:underline">{s.id}</Link> },
          { key: 'name', header: 'Name', cell: (s) => s.name },
          { key: 'n', header: 'Members', cell: (s) => <span className="font-mono text-xs tabular-nums">{s.members}</span> },
          { key: 'desc', header: 'Description', className: 'w-full', cell: (s) => <span className="text-on-surface-variant">{s.description ?? '—'}</span> },
        ]}
      />
    </div>
  )
}
