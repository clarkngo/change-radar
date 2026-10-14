# Development and operations

## Prerequisites

| Tool | Needed for |
|---|---|
| Docker (with Compose) | Elasticsearch, the all-in-one stack, and the backend integration test |
| Java 21 | Running the backend outside Docker (Maven comes with the wrapper) |
| Node.js 20 or newer | Running the frontend outside Docker |

## Running it

### Everything in Docker

```bash
docker compose up --build
```

Open http://localhost:5173. The backend starts in the `demo` profile, generates its history and ingests it within a
few seconds. If a port is taken, override it:

```bash
BACKEND_PORT=8081 FRONTEND_PORT=5174 docker compose up --build
```

### For development

```bash
docker compose up -d elasticsearch
```

```bash
cd backend && ./mvnw spring-boot:run
```

```bash
cd frontend && npm install && npm run dev
```

The backend listens on http://localhost:8080 and the frontend on http://localhost:5173, proxying `/api` to the
backend. Frontend changes hot-reload; backend changes need a restart.

### The static demo, locally

```bash
cd frontend && VITE_DEMO=true npm run dev
```

No backend or Elasticsearch needed: it reads `public/demo/snapshot.json`.

### Ports

The frontend's Docker image is built from the repository root (`docker-compose.yml` sets the context), because the
Documentation page bundles `docs/`. Its ignore file is `frontend/Dockerfile.dockerignore`.

| Port | What |
|---|---|
| 9200 | Elasticsearch |
| 8080 | Backend (`PORT`, or `BACKEND_PORT` in Docker Compose) |
| 5173 | Frontend (`FRONTEND_PORT` in Docker Compose) |

## Configuration

### Environment variables

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `ELASTICSEARCH_URL` | backend | `http://localhost:9200` | Elasticsearch address |
| `PORT` | backend | `8080` | HTTP port |
| `SERVICENOW_URL` | backend | the backend's own `/mock/servicenow` | Base URL of the ServiceNow instance |
| `DEPLOYS_URL` | backend | the backend's own `/mock/deploys` | Base URL of the deployments API |
| `FLAGS_URL` | backend | the backend's own `/mock/flags` | Base URL of the flag audit API |
| `SPRING_PROFILES_ACTIVE` | backend | *(unset, so `demo` applies)* | Set to anything else (for example `prod`) to turn off the demo data and mock endpoints |
| `BACKEND_PORT` | Docker Compose; Vite dev proxy | `8080` | Host port for the backend; where `npm run dev` proxies `/api` |
| `FRONTEND_PORT` | Docker Compose | `5173` | Host port for the frontend |
| `VITE_DEMO` | frontend build | | `true` builds the static demo with the in-browser API |
| `VITE_BASE` | frontend build | `/` | Base path; `/change-radar/` for GitHub Pages |
| `BACKEND_URL` | `npm run snapshot` | `http://localhost:8080` | Backend to export the demo snapshot from |

### Application properties

Everything under `changeradar` in [`application.yml`](../backend/src/main/resources/application.yml):

| Property | Default | Purpose |
|---|---|---|
| `changeradar.index-name` | `changes` | Elasticsearch index |
| `changeradar.ingest.scheduled` | `true` | Run ingestion on a schedule. `false` leaves only `POST /api/ingest`. |
| `changeradar.ingest.interval` | `60s` | Delay between the end of one run and the start of the next. The first run starts 3 seconds after startup. |
| `changeradar.ingest.page-size` | `50` | Records requested per page from each source |
| `changeradar.ingest.chunk-size` | `100` | Records per Spring Batch chunk (one Elasticsearch bulk write) |
| `changeradar.sources.*-url` | see above | Source base URLs |
| `changeradar.catalog.services.<name>.team` | | Owning team |
| `changeradar.catalog.services.<name>.depends-on` | `[]` | Services this one depends on |

Only the `health` and `info` actuator endpoints are exposed.

### Editing the service catalog

The catalog is plain YAML. Add a service with its team and dependencies:

```yaml
changeradar:
  catalog:
    services:
      recommendations:
        team: discovery
        depends-on: [search-api, experiment-service]
```

Changes to services that aren't in the catalog are still ingested, with team `unknown`, and only score as "No known
dependency" (or "Shared infrastructure change" for infra) unless they're on the alerting service itself. Team is resolved at ingestion, so existing documents pick
up a new team on the next run.

### Connecting real sources

1. Run without the demo profile and point the three URLs at your systems.
2. Make sure the service names match: ServiceNow's `cmdb_ci`, the part after `/` in the deploy repository, and the
   flag's `service` should all use the catalog's names.
3. Add authentication to the `RestClient`s in the source adapters if your systems need it. None is implemented.
4. Real sources hold far more history than the demo. Ingestion re-reads everything each run, so you'd want an
   incremental "since" parameter before pointing it at production.

## Tests

```bash
cd backend && ./mvnw verify
```

```bash
cd frontend && npm test
```

| Test | Where | What it checks |
|---|---|---|
| `ChangeRadarIntegrationTest` | backend | Boots the app against Elasticsearch 9 in Testcontainers, ingests from the mock sources over HTTP, then checks: every source completes and staging deploys are skipped; re-ingesting doesn't create duplicates; every planted culprit ranks first; search combines text with filters. |
| `DemoDataTest` | backend | Every planted culprit ranks first at three different anchor times, with no Elasticsearch involved. |
| `SuspectScorerTest` | backend | The 9 shared scoring vectors; that reasons explain the score; that closer changes outrank older ones. |
| `ServiceCatalogTest` | backend | Dependency hops, one-way direction, shortest path, cycles, unknown services. |
| `NormalizationTest` | backend | Each source's quirks: time formats, risk vocabularies, blank backout plans, staging deploys, irreversible migrations, flag risk by action, and the guidelines check. |
| `ComplianceServiceTest` | backend | Worst team first with missing-item counts; an empty period counts as fully compliant. |
| `scoring.test.ts` | frontend | The same 9 shared vectors against the TypeScript scorer. |
| `metrics.test.ts` | frontend | Region shares sum to 1; an incident concentrates in two regions; regions stay flat outside incidents; the "bad direction" logic. |

Other frontend checks:

```bash
cd frontend && npm run lint
```

```bash
cd frontend && npm run build
```

`npm run build` type-checks the whole app (`tsc -b`) before bundling.

## Continuous integration and deployment

| Workflow | Trigger | Steps |
|---|---|---|
| [`ci.yml`](../.github/workflows/ci.yml) | Every pull request; pushes to `main` | **backend:** Java 21, `./mvnw -B verify` (including the Testcontainers test). **frontend:** Node 20, `npm ci`, `npm test`, `npm run build`. |
| [`static.yml`](../.github/workflows/static.yml) | Pushes to `main`; manual | Builds the frontend with `VITE_DEMO=true` and `VITE_BASE=/<repo name>/`, then deploys `frontend/dist` to GitHub Pages. |

The backend isn't deployed anywhere; run it locally or with Docker Compose.

### Refreshing the static demo's data

Do this after changing the demo generator, the catalog or normalization, so the Pages demo matches:

```bash
docker compose up -d elasticsearch
```

```bash
cd backend && ./mvnw spring-boot:run
```

```bash
cd frontend && BACKEND_URL=http://localhost:8080 npm run snapshot
```

Wait for the first ingestion (a few seconds after startup) before exporting, then commit `snapshot.json`.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| Backend logs Elasticsearch connection errors, or fails to start | Elasticsearch isn't up yet. `docker compose up -d elasticsearch` and wait until `curl localhost:9200` responds. |
| Changes page is empty right after startup | The first ingestion runs 3 seconds after startup. Check `curl localhost:8080/api/ingest/status`, or trigger one with `curl -X POST localhost:8080/api/ingest`. |
| One source shows `FAILED` in the ingest status | Its `error` field has the root cause. Other sources keep working. Check that source's URL. |
| Dashboard shows no incidents, no alerts on charts, every service healthy | The backend isn't in the demo profile, so `/api/demo/scenarios` doesn't exist. Expected outside the demo; alerts arrive through the webhook instead. |
| Pages stay empty or show errors in development | The backend isn't running, or isn't on the port Vite proxies to. Set `BACKEND_PORT` to match. |
| Port 8080 or 5173 already in use | Set `BACKEND_PORT` / `FRONTEND_PORT` (Compose) or `PORT` (backend). |
| `./mvnw verify` fails in the integration test | Testcontainers needs a running Docker daemon. |
| The static demo's times look wrong | They're shifted relative to when the snapshot was exported, so "now" lines up with the newest data. Refresh the snapshot if the demo generator changed. |
| A chart or the map looks different after reload | It shouldn't: metrics are deterministic per minute. Moving to a new minute shifts the window, which changes the edges slightly. |
