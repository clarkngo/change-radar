# API reference

The backend serves JSON over HTTP on port 8080 (`PORT` to change it). There's no authentication. Times are ISO-8601
instants in UTC, such as `2026-10-05T02:25:00Z`, in both requests and responses.

| Method | Path | Purpose |
|---|---|---|
| GET | [`/api/changes`](#get-apichanges) | Search changes |
| GET | [`/api/correlate`](#get-apicorrelate) | Rank suspect changes for an alert |
| GET | [`/api/compliance`](#get-apicompliance) | Change-guideline compliance per team |
| GET | [`/api/catalog`](#get-apicatalog) | Services, teams and dependencies |
| POST | [`/api/webhooks/grafana`](#post-apiwebhooksgrafana) | Correlate firing Grafana alerts |
| POST | [`/api/ingest`](#post-apiingest) | Run ingestion now |
| GET | [`/api/ingest/status`](#get-apiingeststatus) | Last ingestion result per source |
| GET | [`/api/demo/scenarios`](#get-apidemoscenarios) | The planted demo incidents (demo profile only) |
| GET | [`/mock/**`](#mock-upstream-sources-demo-profile) | Mock ServiceNow, deploy and flag APIs (demo profile only) |
| GET | [`/actuator/health`, `/actuator/info`](#actuator) | Health and info |

Parameters with constraints (such as `size` and `windowMinutes`) are validated, and out-of-range values are rejected
with `400 Bad Request`.

---

## GET /api/changes

Search every change, newest first.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `q` | string | | Free text over summary, service, author, ticket and team. Every word must match. Supports Elasticsearch simple query syntax (quotes for phrases, `-` to exclude, `*` for prefixes). |
| `service` | string, repeatable | | Only these services: `service=checkout&service=payments` |
| `team` | string, repeatable | | Only these teams |
| `type` | `DEPLOY` · `CONFIG` · `INFRA` · `FEATURE_FLAG`, repeatable | | Only these change types |
| `from` | ISO instant | | Started at or after |
| `to` | ISO instant | | Started at or before |
| `compliant` | boolean | | `true`: only changes that follow the guidelines. `false`: only changes missing something. |
| `page` | int ≥ 0 | 0 | 0-based page |
| `size` | int 1–200 | 20 | Page size |

```bash
curl "localhost:8080/api/changes?q=migrate&service=checkout&compliant=false"
```

```json
{
  "items": [{
    "id": "deploys:1006",
    "source": "DEPLOYS",
    "externalId": "1006",
    "type": "DEPLOY",
    "service": "checkout",
    "team": "commerce",
    "summary": "Deploy f11059e: Migrate orders table to v2 schema",
    "author": "d.romero",
    "ticket": null,
    "risk": "MEDIUM",
    "hasRollbackPlan": false,
    "startedAt": "2026-10-05T02:21:00Z",
    "missingMetadata": ["ticket", "rollbackPlan"]
  }],
  "total": 1,
  "page": 0,
  "size": 20
}
```

Every field is explained in [Architecture: data model](architecture.md#data-model).

---

## GET /api/correlate

Rank the changes most likely to have caused an alert. See [Suspect scoring](scoring.md) for the algorithm.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `service` | string, required | | The alerting service |
| `at` | ISO instant | now | When the alert fired |
| `windowMinutes` | int 5–1440 | 120 | How far back to look. Changes up to 5 minutes after `at` are always included. |

```bash
curl "localhost:8080/api/correlate?service=ads-serving&at=2026-10-05T22:00:00Z"
```

```json
{
  "alertService": "ads-serving",
  "alertTime": "2026-10-05T22:00:00Z",
  "windowMinutes": 120,
  "changesConsidered": 6,
  "tookMs": 3,
  "suspects": [{
    "change": {
      "id": "feature_flags:fa_1000",
      "type": "FEATURE_FLAG",
      "service": "ads-bidder",
      "summary": "Flag bidder.pacing-v2 rollout changed (10% → 100%)",
      "risk": "HIGH",
      "startedAt": "2026-10-05T21:54:00Z",
      "missingMetadata": ["ticket"],
      "...": "every other ChangeEvent field"
    },
    "score": 54,
    "minutesBeforeAlert": 6.0,
    "dependencyDistance": 1,
    "reasons": [
      "Started 6 min before the alert",
      "ads-serving depends on ads-bidder",
      "Declared high risk",
      "Missing ticket"
    ]
  }]
}
```

| Field | Meaning |
|---|---|
| `changesConsidered` | Changes in the window before scoring (at most 5,000) |
| `tookMs` | Time to fetch and score, in milliseconds |
| `suspects` | Up to 10, highest score first; ties go to the change closest to the alert. Changes scoring 0 are left out. |
| `score` | 0–100 |
| `minutesBeforeAlert` | Fractional minutes; negative if the change started after the alert |
| `dependencyDistance` | Hops from the alerting service to the change's service; `-1` if it isn't upstream |
| `reasons` | Plain-English explanation of the score |

---

## GET /api/compliance

How many changes in a period follow the guidelines (ticket, owner, rollback plan), overall and per team.

| Parameter | Type | Default |
|---|---|---|
| `from` | ISO instant | `to` minus 7 days |
| `to` | ISO instant | now |

```bash
curl "localhost:8080/api/compliance"
```

```json
{
  "from": "2026-09-28T22:26:06Z",
  "to": "2026-10-05T22:26:06Z",
  "total": 271,
  "overallRate": 0.756,
  "teams": [{
    "team": "search",
    "total": 55,
    "compliant": 31,
    "rate": 0.564,
    "missing": { "rollbackPlan": 2, "ticket": 24 },
    "services": ["search-api", "search-index"]
  }]
}
```

| Field | Meaning |
|---|---|
| `overallRate`, `rate` | Share of changes with nothing missing, 0–1, rounded to 3 decimals. A period with no changes counts as `1.0`. |
| `teams` | Worst rate first, then by team name |
| `missing` | How many changes are missing each item: `ticket`, `rollbackPlan`, `owner` |

---

## GET /api/catalog

The service catalog from `application.yml`.

```json
{
  "services": {
    "ads-serving": { "team": "ads", "dependsOn": ["ads-bidder", "ads-index", "experiment-service"] },
    "ads-bidder": { "team": "ads", "dependsOn": ["budget-service"] },
    "es-cluster": { "team": "platform", "dependsOn": [] }
  }
}
```

---

## POST /api/webhooks/grafana

A Grafana unified-alerting webhook contact point. Every alert with status `firing` and a `service` label is
correlated with the default 120-minute window. Resolved alerts are ignored.

```bash
curl -X POST localhost:8080/api/webhooks/grafana -H 'Content-Type: application/json' -d '{
  "status": "firing",
  "alerts": [{
    "status": "firing",
    "labels": { "alertname": "CheckoutErrors", "service": "checkout" },
    "startsAt": "2026-10-05T02:25:00Z"
  }]
}'
```

```json
[{
  "alertname": "CheckoutErrors",
  "service": "checkout",
  "note": null,
  "result": { "alertService": "checkout", "suspects": ["..."], "...": "a CorrelationResult, as above" }
}]
```

| Situation | Response entry |
|---|---|
| Firing alert with a `service` label | `result` is the correlation; the top suspect is also logged |
| Firing alert without a `service` label | `service` and `result` are null; `note` is `"Alert has no 'service' label; cannot correlate"` |
| No `alertname` label | `alertname` is `"unnamed"` |
| No `startsAt` | Correlated at the current time |
| No `alerts` array | Empty list |

In Grafana, add a contact point of type **Webhook** with URL `http://<backend>:8080/api/webhooks/grafana`, and make
sure your alert rules carry a `service` label that matches a service name in the catalog.

---

## POST /api/ingest

Runs ingestion for every source now and returns when it's done. (The counts below are an example.) If a scheduled run is in progress, this waits for it
to finish first.

```bash
curl -X POST localhost:8080/api/ingest
```

```json
[
  { "source": "servicenow", "status": "COMPLETED", "read": 44, "written": 44, "skipped": 0, "durationMs": 312, "error": null },
  { "source": "deploys", "status": "COMPLETED", "read": 170, "written": 136, "skipped": 34, "durationMs": 410, "error": null },
  { "source": "feature-flags", "status": "FAILED", "read": 0, "written": 0, "skipped": 0, "durationMs": 25,
    "error": "ConnectException: Connection refused" }
]
```

| Field | Meaning |
|---|---|
| `status` | The Spring Batch status, usually `COMPLETED` or `FAILED` |
| `read` | Records read from the source |
| `written` | Changes written to Elasticsearch |
| `skipped` | Records deliberately left out (non-production deploys) |
| `error` | The root cause's class and message if the job failed |

## GET /api/ingest/status

The same list, from the most recent run (scheduled or manual). Empty before the first run.

---

## GET /api/demo/scenarios

**Demo profile only.** The three planted incidents. The frontend uses these for the Dashboard's incidents and health,
the alert markers on charts, and the Investigate page's incident cards. Without the demo profile this endpoint
doesn't exist, and the UI simply shows no incidents.

```json
[{
  "id": "ads-5xx",
  "title": "Ad serving 5xx rate above 2%",
  "service": "ads-serving",
  "alertTime": "2026-10-05T22:00:00Z",
  "culpritId": "feature_flags:fa_1000",
  "narrative": "A flag on a dependency went to 100% six minutes earlier, with no ticket. ..."
}]
```

`culpritId` is the `id` of the change that actually caused the incident.

---

## Mock upstream sources (demo profile)

The backend serves its own stand-ins for the three upstream systems, and in the demo profile the source URLs point
at them. Their formats are documented in [Change sources](data-sources.md).

| Path | Paging parameters | Defaults |
|---|---|---|
| `GET /mock/servicenow/api/now/table/change_request` | `sysparm_offset`, `sysparm_limit` | 0, 100 |
| `GET /mock/deploys/deployments` | `page` (1-based), `per_page` | 1, 30 |
| `GET /mock/flags/audit` | `page` (0-based), `size` | 0, 50 |

All three return records newest first. Pages past the end are empty.

## Actuator

| Path | Returns |
|---|---|
| `GET /actuator/health` | `{"status":"UP"}` when the app and Elasticsearch are reachable |
| `GET /actuator/info` | Application info |

No other actuator endpoints are exposed.
