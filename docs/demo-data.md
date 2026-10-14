# Demo data and synthetic metrics

Change Radar ships with everything it needs to demonstrate itself: generated change history with planted incidents,
synthetic metrics for the charts and map, and a static build that runs without a backend. All of it is synthetic.

## Generated change history (backend, `demo` profile)

[`DemoData`](../backend/src/main/java/dev/clarkngo/changeradar/demo/DemoData.java) builds 72 hours of raw records in
each source's own format when the backend starts, anchored at the startup time (rounded down to the minute). The
random generator is seeded (`42`), so every start produces the same history relative to its anchor, with the same
ids. Restarting moves the timestamps forward and the upserts overwrite the old documents.

[`MockSourcesController`](../backend/src/main/java/dev/clarkngo/changeradar/demo/MockSourcesController.java) serves
those records under `/mock/**` with each source's paging style, and the demo profile's source URLs point there, so
the real ingestion pipeline runs end to end against them.

### The planted incidents

Three alerts with a known cause and deliberate decoys. Times are relative to backend startup.

| Incident | Alert | Fired | Service | Culprit | Decoys |
|---|---|---|---|---|---|
| `ads-5xx` | Ad serving 5xx rate above 2% | 25 min before startup | `ads-serving` | Flag `bidder.pacing-v2` on `ads-bidder` rolled out 10% → 100%, 6 min before, **no ticket** | An `ads-serving` deploy 48 min before (same service, too old); a `checkout` deploy 3 min before (unrelated) |
| `search-latency` | Search p99 latency above 800 ms | 6 h before startup | `search-api` | ServiceNow change: rolling restart of `es-cluster` data nodes, 12 min before, 2 hops upstream | An `ads-index` deploy 10 min before (not a dependency of search); a `search-api` deploy 95 min before (too old) |
| `checkout-errors` | Checkout error rate above 5% | 20 h before startup | `checkout` | `checkout` deploy migrating the orders table, 4 min before, **no ticket, irreversible** | A `payments` flag enabled 30 min before |

How each scores is worked through in [Suspect scoring](scoring.md#worked-examples-the-three-demo-incidents).

### Background changes

After planting the incidents, the generator adds background noise spread uniformly over the 72 hours:

| Source | Attempts | Details |
|---|---|---|
| Deploys | 160 | Any service except `es-cluster`; about 20% are to `staging` (and get skipped at ingestion); risk is low, medium (twice as likely) or high; non-compliant deploys are irreversible 30% of the time |
| ServiceNow | 45 | Weighted toward infrastructure-heavy services (`es-cluster` twice, `payments`, `inventory`, `budget-service`, `search-index`, `experiment-service`); category Software, Database or Network; risk Low, Moderate or High |
| Feature flags | 90 | Any service except `es-cluster`; enabled, disabled or a rollout change (twice as likely) between realistic percentages |

**Protected windows.** A background change is dropped if it would land between 90 minutes before and 10 minutes after
an incident on a service that's upstream of (or is) the alerting service. That keeps each incident's correct answer
checkable while still letting unrelated noise appear in the window.

**Team discipline.** Whether a background change follows the guidelines (gets a ticket, a rollback plan) depends on
its team, which is what makes the Change Guidelines page interesting:

| Team | Chance a change follows the guidelines |
|---|---|
| ads | 95% |
| commerce-payments | 92% |
| platform | 90% |
| ads-data | 85% |
| commerce | 72% |
| experimentation | 70% |
| search | 50% |

Authors are drawn from ten fictional engineers; tickets look like `ADS-2291` (the team name, up to four letters).

## Synthetic metrics

Change Radar has no metric source, so the charts, KPI cards and world map use deterministic series generated in the
browser by [`frontend/src/metrics.ts`](../frontend/src/metrics.ts). The same service, metric, region and minute always
produce the same value, so charts are stable across reloads. Changes and alerts drawn on top of them are real data.

### Metrics

| Key | Label | Unit | Bad direction | Base level per service |
|---|---|---|---|---|
| `revenue` | Revenue | $/min | down | 400–3,000 |
| `clicks` | Clicks | clicks/min | down | 2,000–12,000 |
| `errorRate` | Error rate | % | up | 0.15–0.50 |
| `latencyP99` | p99 latency | ms | up | 120–400 |

Each service gets a fixed base level within that range from a hash of its name.

### How a value is computed

```
value(service, metric, t, region?) =
    base(service, metric)
  × regionShare        (revenue and clicks only, when a region is selected)
  × daily(t)           1 + 0.35 × sin(2π × (UTC hour − 14) / 24): peaks around 20:00 UTC, lowest around 08:00 UTC.
                       Error rate and latency get 40% of this swing.
  × noise              ±4%, from a hash of service, metric, region and minute
  × impact(f)          the incident effect below
```

**Incident effect.** For each demo incident on the same service, a severity *f* ramps from 0 to 1 over the 5 minutes
before the alert, holds at 1 for 40 minutes after it, then recovers linearly to 0 by 75 minutes after.

| Metric | impact(f) | At full severity |
|---|---|---|
| Revenue | 1 − 0.38 *f* | −38% |
| Clicks | 1 − 0.30 *f* | −30% |
| Error rate | 1 + 7 *f* | ×8 |
| p99 latency | 1 + 2.2 *f* | ×3.2 |

Only the alerting service's own metrics move; dependent services don't.

**Week over week.** "Last week" is the same function evaluated 7 days earlier. Demo incidents are all within the last
72 hours, so last week is always a clean baseline.

**Resolution.** One point per minute for windows up to 6 hours, every 5 minutes up to 2 days, and hourly beyond.

### Regions

| Id | Region | Share of traffic | Countries drawn on the map |
|---|---|---|---|
| `us` | United States | 38% | United States |
| `ca` | Canada | 5% | Canada |
| `latam` | Latin America | 5% | Mexico, Brazil, Argentina, Chile, Colombia, Peru |
| `uki` | UK & Ireland | 10% | United Kingdom, Ireland |
| `dach` | Germany, Austria & Switzerland | 12% | Germany, Austria, Switzerland |
| `weu` | Western & Southern Europe | 9% | France, Spain, Italy, Netherlands, Belgium, Portugal |
| `in` | India | 3% | India |
| `jpkr` | Japan & Korea | 6% | Japan, South Korea |
| `gc` | Greater China | 4% | China, Taiwan |
| `sea` | Southeast Asia | 3% | Malaysia, Indonesia, Philippines, Thailand, Vietnam |
| `anz` | Australia & New Zealand | 5% | Australia, New Zealand |

- **Revenue and clicks** are split across regions by share. **Error rate and latency** are rates, so each region has
  the service's full level.
- **Epicentres.** Each incident hits two regions, chosen from a hash of the incident id, at 1.5× severity (so revenue
  can drop up to 57% there). Every other region gets 0.1× severity, a small ripple. With the current data, the
  ads-serving incident's epicentres are Greater China and Australia & New Zealand.
- **Not reconciled with the global series.** The global charts keep the original model, so regions don't add up to
  the global line exactly. Making them add up would spread every incident across all regions and defeat the point of
  the map.

## The static demo (GitHub Pages)

GitHub Pages can't run the backend, so the Pages build (`VITE_DEMO=true`) swaps the HTTP client for
[`demoApi`](../frontend/src/api/demo.ts), which implements the same `ChangeRadarApi` interface in the browser.

- **Data:** [`frontend/public/demo/snapshot.json`](../frontend/public/demo/snapshot.json): the catalog, the scenarios
  and every change (currently 271: 136 deploys, 91 flag changes, 44 change requests), exported from a real backend run.
- **Time shift:** on load, every `startedAt` and `alertTime` is shifted by *now − exportedAt*, so the data always
  looks like it just happened.
- **Search:** filters behave like the backend. Free text is a little simpler: each word must appear, case-insensitively,
  somewhere in the summary, service, author, ticket or team (a substring match, not Elasticsearch's tokenized match).
- **Correlation:** the TypeScript port of the scorer, tested against the same vectors as the Java one.
- **Compliance:** the same grouping, rates and ordering as the backend.

To refresh the snapshot from a running backend in the demo profile:

```bash
cd frontend && BACKEND_URL=http://localhost:8080 npm run snapshot
```

This pages through `/api/changes` 200 at a time and writes the file with the current time as `exportedAt`.
