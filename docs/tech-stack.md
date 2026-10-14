# Tech stack

Versions are the ones the project currently resolves to (from `pom.xml`, `package-lock.json` and `docker-compose.yml`).

## Backend

| Technology | Version | What it's used for |
|---|---|---|
| Java | 21 | Language. Uses records for every data type, switch expressions in the scorer and normalizers, and `List.getFirst()`. |
| Spring Boot | 4.1.1 | Application framework, configuration binding (`@ConfigurationProperties` records), scheduling, actuator. |
| Spring Framework / Spring MVC | 7.0.9 | REST controllers, `RestClient` for calling the change sources, built-in method validation of request parameters. |
| Embedded Tomcat | 11.0.24 | HTTP server. |
| Spring Batch | 6.0.5 | Ingestion: one job per source, a chunk-oriented step (paged reader → processor → writer). No database: Batch uses its in-memory job repository. |
| Spring Data Elasticsearch | 6.1.1 | `ChangeEventRepository` for upserts, `ElasticsearchOperations` + `NativeQuery` for search, index creation from annotations. |
| Elasticsearch Java client | 9.4.5 | The typed query DSL (`BoolQuery`, `simple_query_string`, terms and range filters). |
| Jakarta Validation (Hibernate Validator) | via Spring Boot | `@Min`, `@Max`, `@NotBlank` on request parameters. |
| Jackson | 3 (via Spring Boot) | JSON for the API and for parsing each source's raw format (`@JsonProperty`, `@JsonIgnoreProperties`). |
| SLF4J / Logback | via Spring Boot | Logging of ingestion runs and webhook correlations. |
| Maven | 3.9.16 (wrapper) | Build. `./mvnw` needs no local Maven install. |

### Backend tests

| Technology | What it's used for |
|---|---|
| JUnit 5 (Jupiter) | Unit tests, including parameterized tests over the shared scoring vectors and several demo start times. |
| Spring Boot Test | The integration test boots the full application. |
| Testcontainers (Elasticsearch, JUnit Jupiter) | Starts a real Elasticsearch 9 container for the integration test. Needs Docker. |

## Datastore

| Technology | Version | What it's used for |
|---|---|---|
| Elasticsearch | 9.4.6 (Docker image) | The single `changes` index: full-text search over summaries, keyword filters, time ranges, sorting. Single node, security disabled, 512 MB heap in Docker Compose. |

## Frontend

| Technology | Version | What it's used for |
|---|---|---|
| TypeScript | 6.0.3 | Language, strict settings with no unused locals or parameters. |
| React | 19.3.0 | UI. Function components and hooks only; no state library. |
| Ant Design | 6.6.5 | Layout, menus, tables, forms, date pickers, tags, cards and the light/dark theme algorithm. |
| @ant-design/icons | 6.3.4 | Icons. |
| Day.js | 1.11.23 | Date parsing, formatting and "x minutes ago" (`relativeTime` plugin). |
| d3-geo | 3.1.1 | The Natural Earth map projection and SVG path generation for the world map. |
| topojson-client | 3.1.0 | Converts the TopoJSON world atlas into GeoJSON country shapes. |
| world-atlas | 2.0.2 | Country outlines from Natural Earth at 1:110m, keyed by ISO 3166-1 numeric codes. |
| react-markdown | 10.1.0 | Renders the docs on the in-app Documentation page. |
| remark-gfm | 4.0.1 | GitHub-flavored markdown (tables, strikethrough, autolinks) for the docs. |
| rehype-slug | 6.0.0 | GitHub-style heading anchors, so `#section` links work the same in the app and on GitHub. |
| Mermaid | 11.17.2 | Draws the docs' diagrams in the app, in the current theme. Loaded on first use. |
| Custom SVG charts | | The metric chart and the investigation timeline are hand-written SVG, so change markers, alerts and tooltips can behave exactly as needed. |

### Frontend tooling

| Technology | Version | What it's used for |
|---|---|---|
| Vite | 8.3.2 | Dev server with hot reload and the `/api` proxy, and the production build. `VITE_DEMO` and `VITE_BASE` select the static demo build and its base path. |
| @vitejs/plugin-react | 6.1.2 | React support in Vite. |
| Vitest | 4.1.11 | Unit tests (`src/**/*.test.ts`). |
| oxlint | 1.87.0 | Linting. |
| Node.js | 20 | Used in CI, the Docker build and the snapshot script. |

## Infrastructure and delivery

| Technology | What it's used for |
|---|---|
| Docker / Docker Compose | Runs Elasticsearch, the backend and the frontend together. Multi-stage builds for both apps. |
| eclipse-temurin 21 | JDK image to build the backend, JRE image to run it. |
| node:20-alpine + nginx:alpine | Builds the frontend, then serves the static files and proxies `/api/` to the backend. |
| GitHub Actions | `ci.yml` runs backend and frontend tests and the frontend build on every pull request and push to main. `static.yml` builds and deploys the static demo. |
| GitHub Pages | Hosts the static demo at https://clarkngo.github.io/change-radar/. |
| Grafana (optional) | Sends alerts to the webhook endpoint. Not included in the repo. |
| Mermaid | Diagrams in these docs, rendered by GitHub and by the app's Documentation page. |
