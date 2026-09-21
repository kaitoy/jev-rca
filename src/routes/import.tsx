import { createFileRoute } from '@tanstack/react-router'
import { FileJson, Upload } from 'lucide-react'
import { useState } from 'react'
import { Button, ErrorText, Field, Input, SectionCard, PageHeader, Textarea, useAction } from '../components/ui.tsx'
import { importJson } from '../server/import.ts'

export const Route = createFileRoute('/import')({ component: ImportPage })

const SHAPE = `{
  "cis":        [{ "id": "web-01", "name": "Web Server 01", "type": "web_server", "description": "..." }],
  "relations":  [{ "from_ci": "web-01", "to_ci": "app-01", "label": "calls" }],
  "services":   [{ "id": "shop-web", "name": "Shop Web" }],
  "service_cis":[{ "service_id": "shop-web", "ci_id": "web-01" }],
  "events":     [{ "ci_id": "web-01", "occurred_at": "2026-09-18T09:00:00Z", "severity": "critical", "message": "HTTP 5xx rate 45%", "source": "nginx" }]
}`

function ImportPage() {
  const [json, setJson] = useState('')
  const [result, setResult] = useState<Record<string, number> | null>(null)
  const run = useAction(importJson, (r) => { setResult(r); setJson('') })
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader icon={Upload} title="Import" eyebrow="JSON" />
      <SectionCard icon={FileJson} title="Submit JSON">
        <p className="text-sm text-on-surface-variant">CIs and services with the same ID are overwritten; relations and members skip duplicates; events are always appended. See <code className="font-mono text-xs">data/sample.json</code> for a demo scenario.</p>
        <Field label="Choose a file" htmlFor="imp-file">
          <Input id="imp-file" type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0]?.text().then(setJson)} />
        </Field>
        <Field label="Or paste" htmlFor="imp-json">
          <Textarea id="imp-json" rows={14} value={json} onChange={(e) => setJson(e.target.value)} placeholder={SHAPE} spellCheck={false} />
        </Field>
        <div className="flex items-center gap-3">
          <Button pending={run.pending} pendingLabel="Submitting…" disabled={json.trim().length < 2} onClick={() => run.run({ data: { json } })}>Import</Button>
          <ErrorText>{run.error}</ErrorText>
          {result && !run.error && (
            <p className="rounded-xl border border-success/32 bg-success/14 px-3 py-2 font-mono text-xs text-on-surface animate-message-in">
              Imported: CIs {result.cis} / relations {result.relations} / services {result.services} / members {result.service_cis} / events {result.events}
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  )
}
