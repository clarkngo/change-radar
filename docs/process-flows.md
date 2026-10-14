# Process flows

Step by step, what happens for each thing Change Radar does.

## 1. Backend startup

```mermaid
sequenceDiagram
  autonumber
  participant Boot as Spring Boot
  participant Demo as DemoData (demo profile)
  participant ES as Elasticsearch
  participant Sch as IngestScheduler

  Boot->>Boot: Bind changeradar.* properties (catalog, sources, ingest)
  Boot->>Demo: Generate 72 h of raw records anchored at "now" (seeded, deterministic)
  Note over Demo: Plants 3 incidents with culprits and decoys,<br/>then ~300 background changes outside their windows
  Boot->>ES: Create the "changes" index from ChangeEvent's mapping if missing
  Boot->>Sch: Start scheduler
  Sch-->>Sch: First ingestion run 3 s after startup, then every 60 s after the previous run ends
```

Without the demo profile, steps 2 and the `/mock/**` endpoints are skipped, and the source URLs must point at real
systems (`SERVICENOW_URL`, `DEPLOYS_URL`, `FLAGS_URL`).

## 2. Ingestion run

Triggered by the scheduler, or on demand with `POST /api/ingest`. Runs are serialized: a run started while another
is in progress waits for it.

```mermaid
sequenceDiagram
  autonumber
  participant IS as IngestService
  participant Job as Spring Batch job (one per source)
  participant R as PagedSourceReader
  participant Src as ChangeSource (e.g. DeploySource)
  participant Up as Upstream API
  participant P as Processor
  participant ES as Elasticsearch

  loop for each source: servicenow, deploys, feature-flags
    IS->>Job: start(run.ts = now)
    loop until a page comes back empty
      R->>Src: fetchPage(page, pageSize = 50)
      Src->>Up: GET with the source's own paging params
      Up-->>Src: raw JSON in the source's own shape
      Src-->>R: a page of SourceRecords
      loop for each record (chunks of 100)
        R->>P: record
        P->>P: record.normalize(catalog) → ChangeEvent or null (skip)
        P->>P: ComplianceChecker.check() → fills missingMetadata
        P-->>Job: ChangeEvent
      end
      Job->>ES: saveAll(chunk) (upsert by id)
    end
    Job-->>IS: status, read / written / filtered counts, failure
    IS->>IS: Record SourceRunResult (FAILED with the root cause if it couldn't start or threw)
  end
  IS->>IS: Keep the results for GET /api/ingest/status
```

Key behaviors:

- **Each source is isolated.** If one source's API is down, its job fails and the others still run.
- **Paging is hidden behind `fetchPage(page, size)`** with a 0-based page. Each adapter translates: ServiceNow uses
  `sysparm_offset = page × size`, deploys use a 1-based `page`, flags use a 0-based `page`.
- **Skipped records** (non-production deploys) are counted as `skipped`.
- **Upserts make it idempotent.** Re-reading the same records overwrites the same documents.

## 3. Searching changes

The Changes page, the chart markers and the dashboard's recent changes all use this path.

```mermaid
sequenceDiagram
  autonumber
  participant UI as Changes page
  participant API as GET /api/changes
  participant S as ChangeSearchService
  participant ES as Elasticsearch

  UI->>API: q, service[], team[], type[], from, to, compliant, page, size
  API->>S: ChangeQuery + PageRequest
  S->>ES: bool query (simple_query_string AND, terms filters, startedAt range, exists missingMetadata), sort startedAt desc
  ES-->>S: hits + total
  S-->>API: a page of ChangeEvents
  API-->>UI: { items, total, page, size }
```

## 4. Correlating an alert

From the Investigate page, a chart alert click, an incident card, or the webhook.

```mermaid
sequenceDiagram
  autonumber
  participant UI as Investigate page
  participant API as GET /api/correlate
  participant CS as CorrelationService
  participant S as ChangeSearchService
  participant SC as SuspectScorer
  participant Cat as ServiceCatalog

  UI->>API: service, at, windowMinutes (default 120)
  API->>CS: correlate(service, at, window)
  CS->>S: findAll(startedAt between at − window and at + 5 min), up to 5,000
  S-->>CS: candidate changes
  loop each candidate
    CS->>SC: score(change, service, at, catalog)
    SC->>Cat: dependencyDistance(alertService, change.service)
    SC-->>CS: Suspect(score 0–100, minutesBeforeAlert, distance, reasons)
  end
  CS->>CS: Drop score 0, sort by score desc then closest to the alert, keep top 10
  CS-->>API: CorrelationResult (+ changesConsidered, tookMs)
  API-->>UI: JSON
  UI->>UI: Draw the timeline and the suspect list
```

The scoring formula is explained in [Suspect scoring](scoring.md).

## 5. Grafana webhook

Point a Grafana alerting contact point (type: webhook) at `/api/webhooks/grafana`.

```mermaid
sequenceDiagram
  autonumber
  participant G as Grafana
  participant W as GrafanaWebhookController
  participant CS as CorrelationService

  G->>W: POST { status, alerts: [{ status, labels, startsAt }] }
  loop each alert with status "firing"
    alt labels.service is missing or blank
      W-->>W: note "Alert has no 'service' label, cannot correlate"
    else
      W->>CS: correlate(labels.service, startsAt or now, 120)
      CS-->>W: CorrelationResult
      W-->>W: Log "Alert X on S: top suspect ... (score N)"
    end
  end
  W-->>G: [{ alertname, service, note, result }]
```

Resolved alerts are ignored. The result is returned in the response and logged; nothing is stored, and nothing is
posted back to a chat tool. Wiring the response into Slack or an incident tool would be the next step.

## 6. An on-call investigation, end to end

How the pieces fit together when someone is actually paged.

```mermaid
flowchart TD
  A["Alert fires<br/>(Grafana → webhook logs the top suspect)"] --> B["Dashboard"]
  B --> C{"Where is it?"}
  C -->|"Regional impact map:<br/>which regions moved"| D["Click the worst region"]
  C -->|"KPI card or<br/>service health tile"| E["Core Metrics"]
  D --> E
  E --> F{"A marker right before the step?"}
  F -->|"Hover it"| G["See the change: summary, owner, ticket"]
  G -->|"Click it"| H["Changes page:<br/>full record, rollback plan, what's missing"]
  F -->|"Not obvious: click the alert dot"| I["Investigate:<br/>top 10 suspects with reasons"]
  B -->|"Active incident → What changed?"| I
  I --> J["Top suspect: owner and ticket<br/>→ roll back or page the owner"]
  H --> J
```

## 7. The static demo

How the GitHub Pages build gets realistic data without a backend.

```mermaid
sequenceDiagram
  autonumber
  participant Dev as Developer
  participant BE as Running backend (demo profile)
  participant Script as npm run snapshot
  participant Repo as frontend/public/demo/snapshot.json
  participant Pages as GitHub Pages
  participant Br as Browser

  Dev->>Script: BACKEND_URL=... npm run snapshot
  Script->>BE: GET /api/changes (all pages), /api/catalog, /api/demo/scenarios
  Script->>Repo: write { exportedAt, catalog, scenarios, changes }
  Dev->>Pages: push to main → static.yml builds with VITE_DEMO=true
  Br->>Pages: load the app
  Br->>Repo: fetch snapshot.json (once)
  Br->>Br: shift every timestamp by (now − exportedAt)
  Br->>Br: answer searchChanges / correlate / compliance in TypeScript
```

The timestamp shift keeps "26 minutes ago" true no matter when you open the demo.

## 8. CI and deployment

```mermaid
flowchart LR
  PR["Pull request or push to main"] --> CI["ci.yml"]
  CI --> BJ["backend job:<br/>./mvnw -B verify<br/>(unit tests + Testcontainers ES)"]
  CI --> FJ["frontend job:<br/>npm ci → npm test → npm run build"]
  Main["Push to main"] --> ST["static.yml"]
  ST --> SB["npm run build<br/>VITE_DEMO=true<br/>VITE_BASE=/change-radar/"]
  SB --> DP["Deploy to GitHub Pages"]
```

There's no deployment for the backend; it runs locally or in Docker Compose.
