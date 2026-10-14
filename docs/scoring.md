# Suspect scoring

Given an alert on service **S** at time **T**, Change Radar scores every change that started in
`[T − window, T + 5 min]` from 0 to 100 and returns the top 10. The implementation is
[`SuspectScorer.java`](../backend/src/main/java/dev/clarkngo/changeradar/correlate/SuspectScorer.java), with an
identical TypeScript copy in [`scoring.ts`](../frontend/src/api/scoring.ts) for the static demo.

## The formula

```
score = round(100 × min(1, proximity × blast × type × risk))
```

Four factors, multiplied. Multiplying (rather than adding) means a change has to do reasonably on every factor to rank
high: a deploy to an unrelated service a minute before the alert still scores low.

### 1. Proximity: how recently it started

| When the change started | Factor |
|---|---|
| *m* minutes before the alert (*m* ≥ 0) | `0.5 ^ (m / 15)`: halves every 15 minutes |
| After the alert (up to 5 minutes, the clock-skew allowance) | fixed `0.3` |

| Minutes before | 0 | 5 | 15 | 30 | 60 | 120 |
|---|---|---|---|---|---|---|
| Proximity | 1.00 | 0.79 | 0.50 | 0.25 | 0.06 | 0.004 |

Most change-induced incidents show up within minutes. The 15-minute half-life puts heavy weight on that and lets
older changes fade without dropping them.

### 2. Blast radius: how close it is in the dependency graph

Distance is the number of `dependsOn` hops from the alerting service down to the changed service, using the shortest
path ([`ServiceCatalog.dependencyDistance`](../backend/src/main/java/dev/clarkngo/changeradar/catalog/ServiceCatalog.java)).

| Distance | Meaning | Factor |
|---|---|---|
| 0 | Same service as the alert | 1.0 |
| 1 | Direct dependency | 0.7 |
| 2 | Dependency of a dependency | 0.4 |
| 3 or more | Further upstream | 0.2 |
| not upstream (-1), infra change | Shared infrastructure might affect anything | 0.3 |
| not upstream (-1), anything else | No known path to the alert | 0.1 |

Direction matters: if `ads-serving` depends on `ads-bidder`, a change to `ads-bidder` can explain an `ads-serving`
alert, but a change to `ads-serving` can't explain an `ads-bidder` alert.

### 3. Change type

| Type | Factor |
|---|---|
| Deploy | 1.0 |
| Config | 0.9 |
| Infra | 0.9 |
| Feature flag | 0.85 |

Code deploys are the most common cause. The differences are small on purpose: a flag flip still ranks high if it's
close in time and in the graph.

### 4. Declared risk

| Risk | Factor |
|---|---|
| High | 1.2 |
| Medium | 1.0 |
| Low | 0.85 |

The author's own assessment is a useful prior. How each source's risk vocabulary maps to these three levels is in
[data sources](data-sources.md).

### Ranking

- Changes scoring 0 are dropped.
- Sorted by score, highest first. Ties go to the change closest to the alert.
- The top 10 are returned, along with how many changes were considered and how long it took.

### Reasons

Every suspect carries plain-English reasons so the ranking can be checked at a glance:

| Reason | When |
|---|---|
| "Started *N* min before the alert" | Always, for changes before the alert |
| "Started *N* min after the alert (possible clock skew)" | For changes in the 5 minutes after |
| "Same service as the alert" | Distance 0 |
| "*S* depends on *X*" | Distance 1 |
| "*X* is *N* hops upstream of *S*" | Distance 2 or more |
| "Shared infrastructure change" | Not upstream, infra type |
| "No known dependency" | Not upstream, other types |
| "Declared high risk" | Risk is high |
| "Missing ticket, rollbackPlan, owner" | Any guideline item is missing. **Informational only:** it doesn't change the score. |

## Worked examples: the three demo incidents

These are the planted incidents in [`DemoData`](../backend/src/main/java/dev/clarkngo/changeradar/demo/DemoData.java),
with the catalog from `application.yml`. The real culprit ranks first in each.

### Ads serving 5xx rate above 2% (`ads-serving`, 25 minutes before startup)

| Change | Minutes before | Distance | Proximity | Blast | Type | Risk | Score |
|---|---|---|---|---|---|---|---|
| **Flag `bidder.pacing-v2` rollout 10% → 100% on `ads-bidder`, no ticket** (culprit) | 6 | 1 | 0.758 | 0.7 | 0.85 | 1.2 (≥50% rollout = high) | **54** |
| Deploy ad-renderer 4.12 on `ads-serving` | 48 | 0 | 0.109 | 1.0 | 1.0 | 0.85 | 9 |
| Deploy copy tweak on `checkout` | 3 | -1 | 0.871 | 0.1 | 1.0 | 0.85 | 7 |

The flag flip is on a direct dependency and close in time. The same-service deploy is too old, and the checkout
deploy, though very recent, has no path to `ads-serving`.

### Search p99 latency above 800 ms (`search-api`, 6 hours before startup)

| Change | Minutes before | Distance | Proximity | Blast | Type | Risk | Score |
|---|---|---|---|---|---|---|---|
| **Rolling restart of `es-cluster` data nodes** (ServiceNow, Database category → infra) (culprit) | 12 | 2 (`search-api → search-index → es-cluster`) | 0.574 | 0.4 | 0.9 | 1.2 | **25** |
| Reindex job tuning on `ads-index` | 10 | -1 | 0.630 | 0.1 | 1.0 | 0.85 | 5 |
| Synonym expansion on `search-api` | 95 | 0 | 0.012 | 1.0 | 1.0 | 1.0 | 1 |

Two hops upstream still beats a change at almost the same time on an unrelated service.

### Checkout error rate above 5% (`checkout`, 20 hours before startup)

| Change | Minutes before | Distance | Proximity | Blast | Type | Risk | Score |
|---|---|---|---|---|---|---|---|
| **Migrate orders table to v2 schema on `checkout`, no ticket, irreversible** (culprit) | 4 | 0 | 0.831 | 1.0 | 1.0 | 1.0 | **83** |
| Enable `payments.3ds-challenge` flag on `payments` | 30 | 1 | 0.25 | 0.7 | 0.85 | 1.0 | 15 |

## Keeping Java and TypeScript in sync

[`shared/scoring-cases.json`](../shared/scoring-cases.json) holds 9 test vectors: a small catalog, an alert, and
changes with their expected score and distance. `SuspectScorerTest` (Java) and `scoring.test.ts` (TypeScript) both run
every vector, so a change to one scorer that isn't made to the other fails CI.

## Why a formula and not a model

During an incident an on-call engineer has to trust the ranking quickly. Four multiplied factors with written reasons
are easy to check and to argue with ("that's a dependency, but it's 90 minutes old"). A learned model could rank
better given labeled incident history (which changes actually caused which alerts), which this project doesn't have.
The factor values are judgment calls and are the obvious thing to tune against real incident data.
