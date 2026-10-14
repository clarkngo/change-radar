# Overview and concepts

## The problem

When an alert fires, an on-call engineer's first question is almost always *what changed?* Most incidents are caused
by a change: a code deploy, a config edit, an infrastructure operation, a feature flag being turned on. But the
record of those changes is usually scattered:

- **Change requests** live in a change-management system such as ServiceNow, mostly for infrastructure and planned
  operational work.
- **Deploys** live in the CI/CD system's deployment log.
- **Feature-flag flips** live in the flag service's audit log, and often bypass change management entirely.

Each of these has its own UI, its own search and its own idea of what a timestamp looks like. Answering "what changed
in the 30 minutes before this alert, in this service or anything it depends on?" means opening three tools and doing
the dependency reasoning in your head. During an incident that can take a long time.

## What Change Radar does

1. **One index.** It ingests all three sources into a single Elasticsearch index with one normalized shape
   ([`ChangeEvent`](../backend/src/main/java/dev/clarkngo/changeradar/change/ChangeEvent.java)), so every change can be
   searched and filtered the same way.
2. **Ranked suspects.** Given an alerting service and an alert time, it scores every recent change for how likely it is
   to be the cause, and explains each score in plain English. See [Suspect scoring](scoring.md).
3. **Changes in context.** It draws change markers on top of metric charts, so a step in a graph lines up visibly with
   the change that preceded it, and it maps metrics by region so a drop can be pinned to the markets it hit.
4. **Hygiene reporting.** It checks every change against a simple set of guidelines (it has a ticket, an owner and a
   rollback plan) and reports compliance per team, because undocumented changes are what make incidents slow to
   diagnose.
5. **Alert hook.** A Grafana webhook endpoint correlates every firing alert automatically.

## What it deliberately doesn't do

- **It doesn't ingest real metrics.** The charts and the map use deterministic synthetic data generated in the
  browser. Changes and alerts are real data from the index. See [Demo data and synthetic metrics](demo-data.md).
- **It doesn't learn.** Scoring is an explainable formula, not a trained model. An on-call engineer needs to trust and
  argue with a ranking quickly, and there's no labeled incident history to train on.
- **It doesn't treat missing metadata as suspicious.** An undocumented change isn't more likely to be the cause, just
  harder to investigate. Compliance is reported separately and only appears in a suspect's reasons as information.
- **It has no authentication.** It's a portfolio project, not hardened for production.

## Glossary

| Term | Meaning |
|---|---|
| **Change** | Anything that altered production: a deploy, a config change, an infrastructure operation or a feature-flag change. Stored as a `ChangeEvent`. |
| **ChangeEvent** | The normalized record every source is converted into. Fields: `id`, `source`, `externalId`, `type`, `service`, `team`, `summary`, `author`, `ticket`, `risk`, `hasRollbackPlan`, `startedAt`, `missingMetadata`. See [Architecture: data model](architecture.md#data-model). |
| **Source** | An upstream system that records changes. There are three: `SERVICENOW` (change requests), `DEPLOYS` (deployment events) and `FEATURE_FLAGS` (flag audit log). |
| **Change type** | `DEPLOY`, `CONFIG`, `INFRA` or `FEATURE_FLAG`. Deploys come from the deploy source and flags from the flag source; ServiceNow requests are `INFRA` for network, hardware, infrastructure and database categories and `CONFIG` otherwise. |
| **Risk** | The risk the change's author declared: `LOW`, `MEDIUM` or `HIGH`. Each source expresses this differently; see [normalization](data-sources.md). |
| **Service** | A deployable unit, such as `checkout` or `ads-serving`. Every change belongs to one service. |
| **Team** | The team that owns a service, looked up from the service catalog. Services not in the catalog belong to team `unknown`. |
| **Service catalog** | The list of services, their owning team and what each one depends on (`dependsOn`). Configured in [`application.yml`](../backend/src/main/resources/application.yml). |
| **Dependency / upstream** | If `ads-serving` depends on `ads-bidder`, then `ads-bidder` is *upstream* of `ads-serving`: a change to `ads-bidder` can break `ads-serving`, but not the other way round. |
| **Dependency distance (hops)** | How many `dependsOn` edges separate the alerting service from a change's service. 0 = same service, 1 = direct dependency, 2 = a dependency of a dependency, -1 = not upstream at all. Shortest path wins. |
| **Blast radius** | The scoring factor derived from dependency distance: a change is more suspicious the closer it sits to the alerting service. |
| **Alert** | A signal that a service is unhealthy at a point in time. In the UI an alert is a red marker on a chart; the backend receives real ones through the Grafana webhook. |
| **Incident / scenario** | In the demo, one of three planted alerts with a known cause, used to show and test that the right change ranks first. Exposed by `/api/demo/scenarios`. |
| **Culprit** | The change that actually caused a demo incident. The Investigate page marks it **Actual cause**. |
| **Decoy** | A change planted near a demo incident that looks plausible but isn't the cause, to prove the ranking separates the two. |
| **Correlation** | Running the scorer for one alert: fetch every change in the look-back window, score each one, return the top 10. |
| **Look-back window** | How far before the alert to search for changes. Default 120 minutes; the UI offers 30 min, 1 h, 2 h and 4 h; the API accepts 5–1440 minutes. |
| **Clock skew allowance** | Changes up to 5 minutes *after* the alert are still considered, because clocks drift and alerts lag. They get a fixed proximity of 0.3. |
| **Half-life** | 15 minutes. A change's proximity factor halves for every 15 minutes between the change and the alert. |
| **Suspect** | A change scored against an alert: the change, its 0–100 score, minutes before the alert, dependency distance, and a list of reasons. |
| **Change guidelines** | The rule that every site-impacting change needs a **ticket**, an **owner** (author) and a **rollback plan**. A change missing any of these is *non-compliant*; the missing items are stored in `missingMetadata`. |
| **Compliance rate** | The share of a team's changes, in a period, that follow the guidelines. Rounded to three decimal places. An empty period counts as 100%. |
| **Core Metrics** | The page that charts one metric for one service over time, with change markers and alerts drawn on top. See [Using the app](user-guide.md#core-metrics). |
| **Metric** | One of `revenue` ($/min), `clicks` (clicks/min), `errorRate` (%) and `latencyP99` (ms). All synthetic. |
| **Change marker** | A small colored square on a chart at the time a change started: **D** deploy (blue), **C** config (purple), **F** feature flag (cyan), **I** infra (gold). |
| **Week over week** | A value compared with the same window exactly 7 days earlier. Used by the KPI cards, the "Compare history" line and the regional map. |
| **Region** | One of 11 markets (United States, Canada, Latin America, UK & Ireland, Germany/Austria/Switzerland, Western & Southern Europe, India, Japan & Korea, Greater China, Southeast Asia, Australia & New Zealand) used by the world map and the Core Metrics region filter. |
| **Epicentre** | In the synthetic metrics, the two regions a demo incident hits hardest. Other regions only see a ripple. |
| **Ingestion run** | One pass over every source. Each source is its own Spring Batch job; a run reports per-source status, read, written and skipped counts. |
| **Demo profile** | The Spring profile (on by default) that serves mock sources with 72 hours of generated history and three planted incidents. |
| **Static demo / demo mode** | The GitHub Pages build (`VITE_DEMO=true`), which has no backend. It loads a JSON snapshot and runs search, scoring and compliance in the browser. |
| **Snapshot** | [`frontend/public/demo/snapshot.json`](../frontend/public/demo/snapshot.json): the catalog, scenarios and every change exported from a real backend run, used by the static demo. |
