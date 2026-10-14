# Change sources and normalization

Change Radar reads from three kinds of systems. Each has its own API shape, paging style and time format, just like
the real ones, and each record type maps itself onto the common [`ChangeEvent`](architecture.md#data-model).

| Source | Adapter | Name in ingest status | Paging | Time format | Response shape |
|---|---|---|---|---|---|
| ServiceNow change requests | `ServiceNowSource` | `servicenow` | `sysparm_offset` / `sysparm_limit` | `yyyy-MM-dd HH:mm:ss`, UTC | `{"result": [...]}` |
| Deploy events (GitHub-style) | `DeploySource` | `deploys` | 1-based `page` / `per_page` | ISO-8601 | bare JSON array |
| Feature-flag audit log | `FlagAuditSource` | `feature-flags` | 0-based `page` / `size` | epoch milliseconds | `{"items": [...], "hasMore": bool}` |

The reader stops paging when a source returns an empty page. Unknown JSON fields are ignored.

## ServiceNow change requests

**Endpoint:** `GET {SERVICENOW_URL}/api/now/table/change_request?sysparm_offset=0&sysparm_limit=50`

```json
{
  "result": [{
    "sys_id": "0000026be359c87b",
    "number": "CHG0032003",
    "short_description": "Rolling restart of es-cluster data nodes for JVM upgrade",
    "cmdb_ci": "es-cluster",
    "assigned_to": "r.okafor",
    "category": "Database",
    "risk": "High",
    "backout_plan": "Restart nodes on previous JVM image",
    "start_date": "2026-10-05 16:13:00"
  }]
}
```

| ChangeEvent field | From | Rule |
|---|---|---|
| `externalId` | `sys_id` | 16 hex characters in the demo |
| `type` | `category` | `network`, `hardware`, `infrastructure`, `database` → `INFRA`; anything else, or missing → `CONFIG` (case-insensitive) |
| `service` | `cmdb_ci` | The configuration item is the service |
| `summary` | `number`, `short_description` | `"CHG0032003: Rolling restart of ..."` |
| `author` | `assigned_to` | |
| `ticket` | `number` | A change request is its own ticket |
| `risk` | `risk` | `high`, `very high` → `HIGH`; `low` → `LOW`; anything else (including `moderate`) or missing → `MEDIUM` |
| `hasRollbackPlan` | `backout_plan` | true if not blank |
| `startedAt` | `start_date` | Parsed as UTC |

## Deploy events

**Endpoint:** `GET {DEPLOYS_URL}/deployments?page=1&per_page=50`

```json
[{
  "id": 1006,
  "repository": "commerce/checkout",
  "environment": "production",
  "sha": "f11059e...",
  "creator": "d.romero",
  "created_at": "2026-10-05T02:21:00Z",
  "description": "Migrate orders table to v2 schema",
  "payload": { "risk": "medium", "irreversible": "true" }
}]
```

| ChangeEvent field | From | Rule |
|---|---|---|
| *(skip)* | `environment` | Anything other than `production` (case-insensitive) is skipped and counted as `skipped` |
| `externalId` | `id` | |
| `type` | | always `DEPLOY` |
| `service` | `repository` | The part after the `/`: `commerce/checkout` → `checkout` |
| `summary` | `sha`, `description` | `"Deploy f11059e: Migrate orders table to v2 schema"` (first 7 characters of the sha) |
| `author` | `creator` | |
| `ticket` | `payload.ticket` | Missing if not set |
| `risk` | `payload.risk` | `low`, `medium`, `high` (any case); missing or unrecognized → `MEDIUM` |
| `hasRollbackPlan` | `payload.irreversible` | true unless `irreversible` is `"true"`: a deploy can always go back to the previous build, except something like a schema migration |
| `startedAt` | `created_at` | ISO-8601 |

## Feature-flag audit log

**Endpoint:** `GET {FLAGS_URL}/audit?page=0&size=50`

```json
{
  "items": [{
    "id": "fa_1000",
    "flagKey": "bidder.pacing-v2",
    "service": "ads-bidder",
    "action": "ROLLOUT_CHANGED",
    "fromValue": "10%",
    "toValue": "100%",
    "actor": "j.patel",
    "timestamp": 1791237240000,
    "ticket": null
  }],
  "hasMore": true
}
```

| ChangeEvent field | From | Rule |
|---|---|---|
| `externalId` | `id` | |
| `type` | | always `FEATURE_FLAG` |
| `service` | `service` | |
| `summary` | `flagKey`, `action`, `fromValue`, `toValue` | `"Flag bidder.pacing-v2 rollout changed (10% → 100%)"`: the action in lower case with underscores as spaces |
| `author` | `actor` | |
| `ticket` | `ticket` | |
| `risk` | `action`, `toValue` | `DISABLED` → `LOW`; `ROLLOUT_CHANGED` to 50% or more → `HIGH`, below 50% → `LOW`; anything else (such as `ENABLED`) → `MEDIUM` |
| `hasRollbackPlan` | | always true: flipping the flag back is the rollback |
| `startedAt` | `timestamp` | epoch milliseconds |

## Common to every source

| ChangeEvent field | Rule |
|---|---|
| `id` | `source` in lower case + `:` + `externalId`, e.g. `servicenow:0000026be359c87b`, `deploys:1006`, `feature_flags:fa_1000` |
| `source` | `SERVICENOW`, `DEPLOYS` or `FEATURE_FLAGS` |
| `team` | `catalog.teamOf(service)`, or `unknown` if the service isn't in the catalog |
| `missingMetadata` | Set by the change guidelines check below |

## Change guidelines

[`ComplianceChecker`](../backend/src/main/java/dev/clarkngo/changeradar/ingest/ComplianceChecker.java) runs on every
change during ingestion. Every site-impacting change needs:

| Item | Stored as | Missing when |
|---|---|---|
| A ticket | `ticket` | `ticket` is null or blank |
| A rollback plan | `rollbackPlan` | `hasRollbackPlan` is false |
| An owner | `owner` | `author` is null or blank |

A change with an empty `missingMetadata` list follows the guidelines. The [Change Guidelines page](user-guide.md#change-guidelines)
and `GET /api/compliance` report this per team. Missing items appear in a suspect's reasons but never change its score.

## Adding a source

1. Create a record type implementing `SourceRecord` with Jackson annotations for the raw JSON, and implement
   `normalize(catalog)`. Return `null` for records to skip.
2. Create a `@Component` implementing `ChangeSource`: `name()` and `fetchPage(page, pageSize)`, translating the
   0-based page into whatever the API uses, and returning an empty list when there's nothing left.
3. Add a value to `ChangeSourceType`, a base URL to `SourcesProperties` and `application.yml`, the value to the
   `ChangeSource` type in the frontend's `api/types.ts`, and its label to `SOURCE_LABEL` in `ChangesView`.
4. Add normalization tests to `NormalizationTest`.

`IngestService` receives every `ChangeSource` bean, so the new source gets its own Spring Batch job automatically.
