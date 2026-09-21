import { createFileRoute, Link } from '@tanstack/react-router'
import { Boxes, Inbox, Plus } from 'lucide-react'
import { Button, DataTable, EmptyState, ErrorText, Field, Input, PageHeader, SectionCard, formData, useAction } from '../components/ui.tsx'
import { listCis, upsertCi } from '../server/cmdb.ts'

export const Route = createFileRoute('/cis/')({
  loader: () => listCis(),
  component: CisPage,
})

function CisPage() {
  const cis = Route.useLoaderData()
  const create = useAction(upsertCi)
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Boxes} title="Configuration items (CI)" eyebrow="CMDB" />
      <SectionCard icon={Plus} title="Add CI">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { const d = formData(e); const f = e.currentTarget; create.run({ data: d as Parameters<typeof upsertCi>[0]['data'] }).then(() => f.reset()) }}>
          <Field label="ID (alphanumeric . _ -)" htmlFor="ci-id"><Input id="ci-id" name="id" required pattern="[a-zA-Z0-9._-]+" placeholder="web-01" className="font-mono" /></Field>
          <Field label="Name" htmlFor="ci-name"><Input id="ci-name" name="name" required placeholder="Web Server 01" /></Field>
          <Field label="Type" htmlFor="ci-type"><Input id="ci-type" name="type" required list="ci-types" placeholder="web_server" className="font-mono" /></Field>
          <datalist id="ci-types">{[...new Set(cis.map((c) => c.type))].map((t) => <option key={t} value={t} />)}</datalist>
          <Field label="Description (optional)" htmlFor="ci-desc"><Input id="ci-desc" name="description" /></Field>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" pending={create.pending} pendingLabel="Adding…">Add</Button>
            <ErrorText>{create.error}</ErrorText>
          </div>
        </form>
      </SectionCard>
      <DataTable
        rows={cis}
        rowKey={(c) => c.id}
        empty={<EmptyState icon={Inbox} title="No CIs" description="Add one with the form above, or import sample data" />}
        columns={[
          { key: 'id', header: 'ID', cell: (c) => <Link to="/cis/$id" params={{ id: c.id }} className="font-mono text-xs text-accent hover:underline">{c.id}</Link> },
          { key: 'name', header: 'Name', cell: (c) => c.name },
          { key: 'type', header: 'Type', cell: (c) => <span className="font-mono text-xs">{c.type}</span> },
          { key: 'desc', header: 'Description', className: 'w-full', cell: (c) => <span className="text-on-surface-variant">{c.description ?? '—'}</span> },
        ]}
      />
    </div>
  )
}
