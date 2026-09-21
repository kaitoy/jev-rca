# jev-rca

A small CMDB + RCA tool that estimates the root cause of IT events with TypeSafe AI (Jev).

- Stores CIs (configuration items) with directed dependencies, service mappings, and events in SQLite
- Picking an event and running "Analyze" gathers nearby events within a time window (same CI, upstream CI, or CI in the same service), sends a `choice` question (`root_cause / co_symptom / unrelated`) to Jev per candidate, and ranks by P(root_cause)
- Time deltas and topology distance are computed in code and turned into text before being sent (Jev is weak at date comparisons and counting)

## Setup

```sh
mise install            # Node 24 (node:sqlite requires 24+) + pnpm
pnpm install
cp .env.example .env    # set TYPESAFE_API_KEY
pnpm dev                # http://localhost:3000
```

Submitting `data/sample.json` at `/import` loads a demo scenario (SAN failure → DB → App → Web 5xx).

## Commands

```sh
pnpm test           # node --test (candidate gathering, BFS, wording)
pnpm typecheck      # tsc --noEmit
pnpm build
pnpm preview        # serve the production build (after pnpm build)
```

## Structure

```
src/db.ts                node:sqlite connection + schema
src/server/rca.ts        candidate gathering (BFS, time window) and Jev state/question building
src/server/analysis.ts   runAnalysis (parallel requests → save) / history retrieval
src/server/cmdb.ts       CI / relation / service
src/server/events.ts     events
src/server/import.ts     bulk JSON import
src/components/ui.tsx    UI components following DESIGN.md
src/routes/              pages
```

See `DESIGN.md` for the design guidelines.
