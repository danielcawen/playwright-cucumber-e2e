# E2E Test Dashboard — Implementation Proposal

## Overview

Add a test results dashboard to this project that aggregates and visualizes
Cucumber test run data across all four test layers (UI, API, DB, Judge).
The dashboard lives in this repository and is deployed to **GitHub Pages**
after every CI run, providing a persistent, shareable view of test health
over time.

### Goals

- **See test health at a glance** — passing, failing, flaky, skipped counts
  per layer and overall.
- **Track trends over time** — line charts of pass rate, duration, flakiness
  across historical runs.
- **Drill into failures** — per-scenario breakdown with error messages,
  screenshots, and video links.
- **Zero maintenance infrastructure** — static site on GitHub Pages, no
  servers, no databases.
- **Leverage existing CI** — reuses the current `e2e-tests.yml` workflow;
  only adds a post-processing + deploy job.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  CI Run (e2e-tests.yml)                              │
│                                                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐ │
│  │ API Tests│  │ DB Tests │  │ UI Tests │  │Judge │ │
│  │          │  │          │  │          │  │Tests │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──┬───┘ │
│       │ JSON         │ JSON        │ JSON       │ JSON│
│       ▼              ▼             ▼            ▼     │
│  ┌─────────────────────────────────────────────────┐  │
│  │        Upload Artifacts (per-layer) │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ┌─────────────────────────────────────────────────┐  │
│  │  Dashboard Job (needs: all test jobs,           │  │
│  │                   if: always())                  │  │
│  │  ┌───────────────────────────────────────────┐  │  │
│  │  │ 1. Download all layer artifacts            │  │  │
│  │  │ 2. Merge + validate JSON reports           │  │  │
│  │  │ 3. Load historical data from gh-pages      │  │  │
│  │  │ 4. Append current run, trim old entries    │  │  │
│  │  │ 5. Generate dashboard HTML                 │  │  │
│  │  │ 6. Deploy to GitHub Pages                  │  │  │
│  │  └───────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                           │
                           ▼
              🌐 https://<user>.github.io/<repo>/
```

---

## Task Breakdown

---

### Task 1 — Add JSON formatter to all Cucumber profiles

**Description**

Add `json:reports/<profile>-results.json` to every profile in
`cucumber.json` so Cucumber writes structured JSON alongside the existing
HTML reports. This JSON is the data source for every downstream task.

**Files to modify**

- `cucumber.json`

**Implementation details**

For each of the six profiles (`default`, `ui`, `api`, `db`, `judge`,
`rerun`), add a `json` format entry:

```json
"format": ["progress", "html:reports/ui-report.html", "json:reports/ui-results.json", "rerun:@rerun.txt"]
```

Profile → output file mapping:

| Profile | File |
|---------|------|
| `default` | `reports/cucumber-results.json` |
| `ui` | `reports/ui-results.json` |
| `api` | `reports/api-results.json` |
| `db` | `reports/db-results.json` |
| `judge` | `reports/judge-results.json` |
| `rerun` | `reports/rerun-results.json` |

The `json` formatter is built into `@cucumber/cucumber` — no new
dependencies are needed.

**Definition of Done**

- [ ] Every profile in `cucumber.json` includes a `json:` format entry
- [ ] Running `npx cucumber-js --profile ui` produces
      `reports/ui-results.json` alongside `reports/ui-report.html`
- [ ] The JSON file is valid and contains the top-level keys:
      `[version, keyword, name, line, id, tags, uri, elements]`
- [ ] Each scenario element includes `steps`, `tags`, `line`, `name`, and
      a `result` with `status` (passed / failed / skipped / ambiguous)
- [ ] `npm test` (runs `default` profile) produces `reports/cucumber-results.json`
- [ ] Git ignores `reports/*-results.json` via the existing `reports/*`
      rule in `.gitignore`

---

### Task 2 — Upload JSON artifacts from all CI jobs

**Description**

The current `e2e-tests.yml` only uploads reports for the UI job. Extend it
so that **every** test layer (API, DB, UI, Judge) uploads its JSON results
as a named artifact. This makes the data available to a downstream dashboard
job.

**Files to modify**

- `.github/workflows/e2e-tests.yml`

**Implementation details**

Add an artifact upload step at the end of each job (`test-api`, `test-db`,
`test-ui`, `test-judge`), conditional on `if: always()`:

```yaml
- name: Upload API results
  if: always()
  uses: actions/upload-artifact@v4
  with:
    name: api-results
    path: reports/api-results.json
```

Naming convention:

| Job | Artifact name |
|-----|---------------|
| `test-api` | `api-results` |
| `test-db` | `db-results` |
| `test-ui` | `ui-results` |
| `test-judge` | `judge-results` |

Also remove the existing generic `e2e-reports` upload from the UI job since
the dashboard job only needs the JSON.

Optionally, also upload the HTML reports and screenshots/videos separately
as a debugging artifact (name: `e2e-html-reports`). This is not required for
the dashboard but is helpful for manual inspection.

**Note on e2e-api.yml, e2e-db.yml, e2e-ui.yml, e2e-judge.yml:**

These single-layer workflow files do **not** need artifact uploads since
they run independently. The dashboard deployment only happens via
`e2e-tests.yml` (the combined workflow). However, adding uploads to
individual workflows is harmless and enables manual runs to also feed the
dashboard if desired.

**Definition of Done**

- [ ] `e2e-tests.yml` uploads `api-results` artifact in `test-api` job
- [ ] `e2e-tests.yml` uploads `db-results` artifact in `test-db` job
- [ ] `e2e-tests.yml` uploads `ui-results` artifact in `test-ui` job
- [ ] `e2e-tests.yml` uploads `judge-results` artifact in `test-judge` job
- [ ] All uploads use `if: always()` so results are captured even on failure
- [ ] Each artifact contains exactly one JSON file matching its name
- [ ] The old `e2e-reports` bulk upload is removed (or kept separately for
      HTML/screenshot debugging)

---

### Task 3 — Create dashboard build script

**Description**

Write a Node.js script at `dashboard/generate.js` that:

1. Reads one or more Cucumber JSON result files
2. Merges them into a single dataset
3. Computes summary statistics per layer and overall
4. Loads historical data (if available) from a JSON lines file
5. Appends the current run to history
6. Writes an `index.html` file with an embedded single-page application

The script is run in CI as part of the dashboard deployment job.

**Files to create**

- `dashboard/generate.js`
- `dashboard/template.html` (optional — the HTML skeleton that gets filled)

**Implementation details**

The script should accept these CLI arguments:

```
node dashboard/generate.js \
  --api reports/api-results.json \
  --db reports/db-results.json \
  --ui reports/ui-results.json \
  --judge reports/judge-results.json \
  --history _history/runs.jsonl \
  --out _site/index.html \
  --run-id <github-run-id> \
  --run-number <github-run-number> \
  --branch <branch-name> \
  --commit <commit-sha>
```

**Data model for a single run:**

```js
{
  runId: "1234567890",
  runNumber: 42,
  branch: "main",
  commit: "abc123def",
  timestamp: "2026-05-21T14:30:00Z",
  durationMs: 125000,
  layers: {
    api: {
      total: 12,
      passed: 10,
      failed: 1,
      skipped: 1,
      ambiguous: 0,
      durationMs: 45000,
      scenarios: [
        {
          name: "User can log in with valid credentials",
          line: 5,
          uri: "e2e/features/api/auth/login.feature",
          status: "passed",
          durationMs: 3200,
          errorMessage: null,
          tags: ["@api", "@smoke"]
        },
        // ...
      ]
    },
    db: { /* same structure */ },
    ui: { /* same structure */ },
    judge: { /* same structure */ }
  },
  summary: {
    total: 48,
    passed: 42,
    failed: 3,
    skipped: 3,
    ambiguous: 0,
    passRate: 87.5,
    flaky: 0
  }
}
```

**Flaky detection logic:**

Compare scenarios in the current run against the last 3 historical runs. A
scenario is flagged as **flaky** if its status differs across those runs
(e.g., passed → failed → passed, or failed → passed).

```
flaky if: |{status across last N runs}| > 1
```

Initially this will produce no flaky results; it becomes meaningful after
3+ runs.

**Dashboard HTML output:**

Generate a self-contained HTML file (no build tools, no bundler). Use:

- **Chart.js** (from CDN) for charts — pass rate donut, duration bar chart,
  trend line chart over time
- **Plain CSS** for layout — no framework, keep it lightweight
- **JSON embedded in a `<script>` tag** — the merged data for the current
  run plus historical trends

Sections in the dashboard:

1. **Header** — run number, branch, commit, timestamp
2. **Summary cards** — total / passed / failed / skipped / flaky / pass rate
3. **Per-layer breakdown** — four columns/cards with the same metrics
4. **Trend chart** — pass rate and duration over last N runs
5. **Scenario table** — sortable/filterable list of all scenarios with
   status, layer, duration, error message
6. **Failures section** — only failed scenarios, with full error messages

**Definition of Done**

- [ ] `dashboard/generate.js` exists and runs without errors
- [ ] It accepts all CLI arguments listed above
- [ ] It correctly parses Cucumber JSON format (from `@cucumber/cucumber` v12)
- [ ] It computes per-layer and summary statistics correctly
- [ ] It loads historical data from a JSONL file if it exists
- [ ] It appends the current run to history and writes it back
- [ ] It generates a valid `index.html` that renders in a browser
- [ ] The HTML page loads Chart.js from CDN and renders all sections
- [ ] Running with missing layer files (e.g., no `--judge`) does not crash
- [ ] The history file is trimmed to the last 50 runs to keep size manageable

---

### Task 4 — Create dashboard CI job and deploy to GitHub Pages

**Description**

Add a `dashboard-deploy` job to `e2e-tests.yml` that:

1. Runs after **all** test jobs complete (success or failure)
2. Downloads all per-layer JSON artifacts
3. Checks out the `gh-pages` branch to get the historical data file
4. Runs the dashboard generation script
5. Deploys the result to GitHub Pages

**Files to modify**

- `.github/workflows/e2e-tests.yml`
- `.github/workflows/*.yml` (add `workflow_run` or similar as needed)

**GitHub Pages setup (one-time, done by you):**

1. Go to repo Settings → Pages
2. Source: **GitHub Actions** (not a branch)
3. The `actions/deploy-pages` action will use the artifact named
   `github-pages`

**Implementation details**

```yaml
dashboard:
  name: Generate and Deploy Dashboard
  needs: [test-api, test-db, test-ui, test-judge]
  if: always()
  runs-on: ubuntu-latest
  permissions:
    contents: read
    pages: write
    id-token: write
  environment:
    name: github-pages
    url: ${{ steps.deployment.outputs.page_url }}
  steps:
    - uses: actions/checkout@v6

    - uses: actions/setup-node@v6
      with:
        node-version: 24
        cache: npm

    - run: npm ci

    # Download per-layer JSON artifacts
    - uses: actions/download-artifact@v4
      with:
        name: api-results
        path: _reports/
    - uses: actions/download-artifact@v4
      with:
        name: db-results
        path: _reports/
    - uses: actions/download-artifact@v4
      with:
        name: ui-results
        path: _reports/
    - uses: actions/download-artifact@v4
      with:
        name: judge-results
        path: _reports/

    # Fetch historical data from gh-pages branch
    - uses: actions/checkout@v6
      with:
        ref: gh-pages
        path: _history-checkout
      continue-on-error: true  # first run: no gh-pages branch yet

    - name: Prepare history file
      run: |
        mkdir -p _site
        if [ -f _history-checkout/_history/runs.jsonl ]; then
          cp _history-checkout/_history/runs.jsonl _site/runs.jsonl
        fi

    - name: Generate dashboard
      run: |
        node dashboard/generate.js \
          --api _reports/api-results.json \
          --db _reports/db-results.json \
          --ui _reports/ui-results.json \
          --judge _reports/judge-results.json \
          --history _site/runs.jsonl \
          --out _site/index.html \
          --run-id ${{ github.run_id }} \
          --run-number ${{ github.run_number }} \
          --branch ${{ github.ref_name }} \
          --commit ${{ github.sha }}

    - name: Upload Pages artifact
      uses: actions/upload-pages-artifact@v3
      with:
        path: _site/

    - name: Deploy to GitHub Pages
      id: deployment
      uses: actions/deploy-pages@v4
```

**Handling the first run:**

On the very first CI run, there is no `gh-pages` branch. The
`_history-checkout` step uses `continue-on-error: true` so the workflow
continues. The `runs.jsonl` file won't exist, so the dashboard script
starts with an empty history. The first deploy creates the `gh-pages`
branch automatically (done by `actions/deploy-pages`).

**Permission notes:**

The job needs `pages: write` and `id-token: write` permissions to deploy.
Add these at the job level (as shown above) or at the workflow top level.

**Definition of Done**

- [ ] `e2e-tests.yml` has a `dashboard` job that depends on all four test
      jobs and runs `if: always()`
- [ ] The job downloads all four per-layer artifacts
- [ ] It checks out the `gh-pages` branch (or gracefully skips on first run)
- [ ] It runs `dashboard/generate.js` with correct arguments
- [ ] It uploads the `_site/` directory as a Pages artifact
- [ ] It deploys to GitHub Pages
- [ ] The dashboard is accessible at
      `https://<user>.github.io/<repo>/`
- [ ] After 2+ runs, the trend chart shows historical data
- [ ] The CI run status shows a Pages deployment URL in the job output

---

### Task 5 — Add scheduled CI trigger for regular data collection

**Description**

Add a `schedule` trigger to `e2e-tests.yml` so the tests (and dashboard)
run automatically on a recurring basis, not only on manual dispatch. This
ensures the dashboard has fresh data even without human action.

**Files to modify**

- `.github/workflows/e2e-tests.yml`

**Implementation details**

Add to the `on:` block:

```yaml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * 1-5'   # 06:00 UTC, Monday through Friday
```

Adjust the cron to match your team's schedule. The current workflow already
has `workflow_dispatch`; this just adds scheduled runs.

Note: GitHub Actions scheduled workflows run on the **default branch** (usually
`main`). If the app under test (`app-for-e2e`) changes independently, the test
results may vary — this is expected and actually desirable for tracking real
test health over time.

**Definition of Done**

- [ ] `e2e-tests.yml` has a `schedule` trigger with a cron expression
- [ ] The workflow runs automatically at the scheduled time
- [ ] The dashboard receives fresh data from each scheduled run

---

### Task 6 — (Optional) Add retry-based flaky detection in hooks

**Description**

Modify the Cucumber hooks to automatically retry a scenario once if it
fails. If the retry passes, mark that scenario's final status as `passed`
but record it in a separate `flaky` counter. This gives the dashboard a
reliable flaky signal on every run (rather than needing 3+ historical runs
for comparison).

**Files to modify**

- `e2e/support/hooks.js`

**Implementation details**

The approach:

1. In `After` hook, if `this.testResult?.status === 'FAILED'`:
   - Re-run the scenario by calling `this.runScenario()` (or however
     Cucumber exposes retry in v12)
   - If the retry passes, keep the final result as `PASSED` but emit a
     custom message or tag that the dashboard can recognise as flaky

Unfortunately, `@cucumber/cucumber` v12 has no built-in retry mechanism for
individual scenarios within a single run. Two practical alternatives:

**Option A — Pre-run + rerun (Cucumber-native, no extra deps):**

1. Run tests with `--profile api` (no rerun)
2. Collect failures in `@rerun.txt` (already done via the `rerun:@rerun.txt`
   formatter)
3. Run `npx cucumber-js @rerun.txt --profile rerun` to retry only failures
4. Scenarios that pass on rerun are flaky; scenarios that fail again are
   hard failures
5. The dashboard script compares both runs' results to classify scenarios

This is how many teams do it. The CI workflow would have two sequential
steps:

```yaml
- name: Run API tests (first attempt)
  run: npx cucumber-js --profile api
  continue-on-error: true

- name: Rerun failed scenarios
  run: |
    if [ -f @rerun.txt ] && [ -s @rerun.txt ]; then
      npx cucumber-js @rerun.txt --profile rerun
    fi
  continue-on-error: true
```

Then the dashboard script marks any scenario that passes on rerun as flaky.

**Option B — Custom retry wrapper:**

Wrap each scenario execution in a try/catch that retries once. This is more
fragile and not recommended unless you control the CustomWorld lifecycle
precisely.

**Recommendation:**

Implement Option A. It uses Cucumber's own rerun mechanism, requires no new
dependencies, and the rerun results feed naturally into the dashboard's JSON
data.

**Definition of Done**

- [ ] The dashboard script recognises a scenario as `flaky` when it passes
      on rerun after failing on first attempt
- [ ] (If Option A) The CI workflow runs tests twice: first attempt + rerun
- [ ] Rerun results are included in the merged dashboard data
- [ ] The dashboard displays a "flaky" count and lists flaky scenarios
- [ ] A scenario that fails both attempts is counted as `failed`, not flaky

---

### Task 7 — (Optional) Standalone dashboard variant

**Description**

If a standalone dashboard (separate repo) is preferred over the in-repo
approach, this task documents the alternative architecture with concrete
implementation steps, a complete CI workflow, and an SPA scaffold.

**When to choose this path**

- You have **multiple test repos** that should feed a single dashboard
- You want to use a **framework** (React, Svelte, Vue) for a richer UI
- You need **role-based access** or authentication on the dashboard
- You want the dashboard to be maintained and deployed **independently**
  of any test repo's CI health

---

#### Architecture

```
┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐
│ Test Repo A         │   │ Test Repo B         │   │ Test Repo C         │
│ (this repo)         │   │ (other project)     │   │ (other project)     │
│                     │   │                     │   │                     │
│ CI run produces     │   │ CI run produces     │   │ CI run produces     │
│ api-results.json    │   │ api-results.json    │   │ api-results.json    │
│ db-results.json     │   │ ...                 │   │ ...                 │
│ ui-results.json     │   │                     │   │                     │
│ judge-results.json  │   │                     │   │                     │
└──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘
           │ upload-artifact         │ upload-artifact         │ upload-artifact
           ▼                         ▼                         ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  Dashboard Repo (e.g. my-org/e2e-dashboard)                             │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  CI Workflow (scheduled: daily, or triggered by test repo CI)    │   │
│  │                                                                  │   │
│  │  1. Fetch artifacts from all test repos via gh CLI + API         │   │
│  │  2. Merge all per-layer JSON files into one dataset              │   │
│  │  3. Load historical data from previous runs (in-repo data/)      │   │
│  │  4. Append current run, compute trends, detect flaky             │   │
│  │  5. Build SPA (Vite + React / Svelte / Vue)                     │   │
│  │  6. Deploy to GitHub Pages, Vercel, or Netlify                   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
                       🌐 https://e2e-dashboard.example.com
```

---

#### Step-by-step implementation

##### Step 1 — Create the dashboard repo

Create `my-org/e2e-dashboard` (or whatever name you prefer). This repo
contains:

- `src/` — SPA source code (React, Svelte, Vue, or plain HTML/JS)
- `data/` — historical run data committed by CI
- `generate.js` — the data merging script (adapted from `dashboard/generate.js`)
- `.github/workflows/build.yml` — the CI pipeline
- `package.json` — dependencies

Copy `dashboard/generate.js` from this repo into the new repo. Remove the
HTML generation part and instead output a JSON data file that the SPA can
fetch at runtime.

> **Alternative**: Keep the static HTML generation approach from the in-repo
> dashboard. The standalone variant still works — the CI just generates the
> HTML and deploys it to Pages. The advantage of an SPA is richer interactivity
> and code-splitting for large datasets.

##### Step 2 — Define the data contract

The dashboard expects JSON data in this shape. Each test repo must produce
this format (which `dashboard/generate.js` already outputs):

```typescript
interface RunData {
  runId: string
  runNumber: number
  branch: string
  commit: string
  timestamp: string        // ISO 8601
  durationMs: number
  summary: {
    total: number
    passed: number
    failed: number
    skipped: number
    ambiguous: number
    passRate: number
    flaky: number
  }
  layers: Record<string, {   // key: "api" | "db" | "ui" | "judge"
    total: number
    passed: number
    failed: number
    skipped: number
    ambiguous: number
    durationMs: number
  }>
  allScenarios: Scenario[]
  flakyScenarios: { name: string; uri: string; line: number; statuses: string[] }[]
}

interface Scenario {
  name: string
  line: number
  uri: string
  status: "passed" | "failed" | "skipped" | "ambiguous"
  durationMs: number
  errorMessage: string | null
  tags: string[]
  steps: Step[]
  layer: string
  flaky: boolean
}

interface Step {
  keyword: string
  name: string
  status: string
  duration: number
  errorMessage: string | null
}
```

Each test repo uploads this as `run-data.json` to CI artifacts. The
dashboard repo then collects them from all repos.

##### Step 3 — Add artifact upload to each test repo

Each test repo (including this one) needs a CI job step that uploads the
merged run data. For this repo, add to `e2e-tests.yml`:

```yaml
      - name: Upload dashboard data
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: dashboard-data
          path: _site/index.html    # the static dashboard
```

If you're using the SPA approach instead of static HTML, upload the JSON:

```yaml
      - name: Upload run data for external dashboard
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: run-data
          path: _site/run-data.json
```

##### Step 4 — Dashboard repo CI workflow (GitHub Pages)

Create `.github/workflows/build.yml` in the dashboard repo:

```yaml
name: Build and Deploy Dashboard

on:
  schedule:
    - cron: '0 7 * * 1-5'   # 07:00 UTC weekdays
  workflow_dispatch:          # manual trigger

jobs:
  collect-and-build:
    runs-on: ubuntu-latest
    permissions:
      contents: write        # to push data/ updates
      pages: write           # to deploy Pages
      id-token: write
      actions: read          # to download artifacts from other repos
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}

    steps:
      - uses: actions/checkout@v6

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: npm

      - run: npm ci

      # ── Download artifacts from each test repo ──
      # Uses gh CLI to list and download artifacts from external repos.
      # Requires a PAT (classic) with `repo` scope stored as
      # secrets.ORG_GH_PAT (or per-repo secrets).

      - name: Download artifacts from playwright-cucumber-e2e (this repo)
        env:
          GH_TOKEN: ${{ secrets.ORG_GH_PAT }}
        run: |
          REPO="danielcawen/playwright-cucumber-e2e"
          RUN_ID=$(gh run list --repo "$REPO" --branch main --workflow "E2E All Tests" --status success --limit 1 --json databaseId --jq '.[0].databaseId')
          if [ -n "$RUN_ID" ]; then
            gh run download "$RUN_ID" --repo "$REPO" --name run-data --dir _incoming/repo-a
          fi
          ls -la _incoming/repo-a/ 2>/dev/null || echo "No artifacts from repo A"

      - name: Download artifacts from other-test-repo
        env:
          GH_TOKEN: ${{ secrets.ORG_GH_PAT }}
        run: |
          REPO="my-org/other-e2e-suite"
          RUN_ID=$(gh run list --repo "$REPO" --branch main --workflow "E2E Tests" --status success --limit 1 --json databaseId --jq '.[0].databaseId')
          if [ -n "$RUN_ID" ]; then
            gh run download "$RUN_ID" --repo "$REPO" --name run-data --dir _incoming/repo-b
          fi
          ls -la _incoming/repo-b/ 2>/dev/null || echo "No artifacts from repo B"

      # ── Merge and generate ──
      - name: Merge data and build dashboard
        run: |
          node scripts/merge-data.js \
            --sources _incoming/repo-a,repo-a _incoming/repo-b,repo-b \
            --history data/history.jsonl \
            --out dist/data.json

      - name: Build SPA
        run: npm run build

      # ── Deploy ──
      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Notes on cross-repo artifact downloads:**

- The `gh run list` command finds the latest successful run on `main`.
- You need a **PAT** (classic, with `repo` scope) stored as a secret.
- If you use a GitHub App instead, set `GH_TOKEN` to an installation access
  token.
- An alternative is to use [`actions/download-artifact`](https://github.com/actions/download-artifact)
  with `repository:` (requires `actions: read` permission and a token):

```yaml
      - uses: actions/download-artifact@v4
        with:
          name: run-data
          path: _incoming/repo-a/
          repository: danielcawen/playwright-cucumber-e2e
          github-token: ${{ secrets.ORG_GH_PAT }}
```

##### Step 5 — SPA scaffold (optional, replaces static HTML)

If you want a richer UI with a framework, here's a minimal Vite + React
setup:

**`package.json`:**

```json
{
  "name": "e2e-dashboard",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "recharts": "^2.15.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.4.0",
    "vite": "^6.3.0"
  }
}
```

**`vite.config.js`:**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './'    # needed for GitHub Pages
})
```

**`src/App.jsx`:**

```jsx
import { useEffect, useState } from 'react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

function App() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('data.json')
      .then(r => r.json())
      .then(setData)
  }, [])

  if (!data) return <div>Loading...</div>

  const { currentRun, history } = data

  return (
    <div>
      <h1>E2E Test Dashboard</h1>

      <div className="summary-cards">
        <Card label="Total" value={currentRun.summary.total} />
        <Card label="Passed" value={currentRun.summary.passed} color="#4ade80" />
        <Card label="Failed" value={currentRun.summary.failed} color="#f87171" />
        <Card label="Flaky" value={currentRun.summary.flaky} color="#facc15" />
        <Card label="Pass Rate" value={`${currentRun.summary.passRate}%`} color="#c084fc" />
      </div>

      <h2>Pass Rate Trend</h2>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={history}>
          <Line type="monotone" dataKey="summary.passRate" stroke="#4ade80" />
          <XAxis dataKey="runNumber" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
        </LineChart>
      </ResponsiveContainer>

      <h2>Failures</h2>
      {currentRun.allScenarios
        .filter(s => s.status === 'failed')
        .map(s => (
          <div key={`${s.uri}:${s.line}`} className="failure">
            <strong>{s.name}</strong>
            <pre>{s.errorMessage}</pre>
          </div>
        ))}
    </div>
  )
}

function Card({ label, value, color }) {
  return (
    <div className="card">
      <div className="card-label">{label}</div>
      <div className="card-value" style={{ color }}>{value}</div>
    </div>
  )
}

export default App
```

**`src/merge-data.js`** (runs at build time, not in the browser):

```js
// Read incoming data from all test repos (passed via --sources),
// merge into currentRun + history, write dist/data.json.
// Adapted from dashboard/generate.js.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  args[process.argv[i].replace(/^--/, '')] = process.argv[i + 1]
}

const sources = (args.sources || '').split(' ').filter(Boolean).map(s => {
  const [dir, label] = s.split(',')
  return { dir, label }
})

const historyFile = args.history || 'data/history.jsonl'
const outFile = args.out || 'dist/data.json'

// Read history
let history = []
if (existsSync(historyFile)) {
  history = readFileSync(historyFile, 'utf-8')
    .trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
}

// Read current data from each source
const allScenarios = []
const runData = []

for (const { dir, label } of sources) {
  const dataFile = resolve(dir, 'run-data.json')
  if (!existsSync(dataFile)) continue
  const data = JSON.parse(readFileSync(dataFile, 'utf-8'))
  runData.push({ ...data, source: label })
  for (const sc of data.allScenarios || []) {
    allScenarios.push({ ...sc, source: label })
  }
}

// Merge into a single currentRun
const currentRun = {
  timestamp: new Date().toISOString(),
  sources: runData.map(r => ({ name: r.source, runNumber: r.runNumber, branch: r.branch })),
  summary: {
    total: runData.reduce((s, r) => s + (r.summary?.total || 0), 0),
    passed: runData.reduce((s, r) => s + (r.summary?.passed || 0), 0),
    failed: runData.reduce((s, r) => s + (r.summary?.failed || 0), 0),
    skipped: runData.reduce((s, r) => s + (r.summary?.skipped || 0), 0),
    passRate: 0,
    flaky: runData.reduce((s, r) => s + (r.summary?.flaky || 0), 0)
  },
  allScenarios
}
currentRun.summary.passRate = currentRun.summary.total > 0
  ? Math.round((currentRun.summary.passed / currentRun.summary.total) * 10000) / 100
  : 0

// Append to history
history.push({
  timestamp: currentRun.timestamp,
  summary: currentRun.summary,
  sources: currentRun.sources
})

// Trim history to last 100 runs
const trimmed = history.slice(-100)

const outDir = dirname(resolve(outFile))
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })

writeFileSync(outFile, JSON.stringify({ currentRun, history: trimmed }, null, 2))
writeFileSync(historyFile, trimmed.map(r => JSON.stringify(r)).join('\n') + '\n')

console.log(`Merged ${runData.length} source(s), ${currentRun.summary.total} scenarios`)
```

---

#### Deployment options

| Platform | Pros | Cons | Setup effort |
|----------|------|------|-------------|
| **GitHub Pages** | Free, built-in actions, same auth as repos | Public only (unless GitHub Enterprise), no custom auth | Low |
| **Vercel** | Free tier, auto-deploys from GitHub, can add password-protection | Needs Vercel account, slightly more setup | Medium |
| **Netlify** | Free tier, form handling, branch deploys | Same as Vercel | Medium |
| **Cloudflare Pages** | Free tier, fast CDN, Workers for auth | Smaller ecosystem | Medium |
| **Private server (Docker)** | Full control, auth, DB | Maintenance cost, security overhead | High |

**Recommendation**: Start with GitHub Pages. If you later need auth or
higher reliability, migrate to Vercel (password-protect with their
built-in feature).

---

#### Trade-offs vs in-repo approach

| Factor | In-repo (what we built) | Standalone (this task) |
|--------|------------------------|------------------------|
| Setup complexity | **Low** — one repo, one CI | Medium — two repos, cross-repo artifact fetch |
| Cross-repo support | No — one test suite only | **Yes** — aggregate multiple projects |
| Framework choice | Static HTML/Chart.js only | **Any** — React, Svelte, Vue, etc. |
| UI richness | Good (sortable table, charts) | **Better** — SPA can have tabs, drill-down, search |
| Maintenance | **One repo** to maintain | Two repos to maintain |
| Deployment | **Built-in** (Pages via same CI) | Pages / Vercel / Netlify — separate CI |
| Historical data | Stored on `gh-pages` branch | Stored in dashboard repo `data/` |
| Dashboard availability | Only updates when test CI runs | **Independent** — can deploy on schedule |
| Auth / access control | None (public Pages) | **Possible** with Vercel/Netlify auth |
| Flaky detection | Rerun + history-based | Same logic, but across repos |
| Cost | Free | Free (unless using private server) |

---

#### Migration guide: from in-repo to standalone

If you've already implemented the in-repo dashboard (Tasks 1-4) and later
decide to switch to standalone:

1. **Create the dashboard repo** with the SPA scaffold above
2. **In the dashboard repo CI**, add steps to download artifacts from this
   test repo (Step 4 above)
3. **In this repo's `e2e-tests.yml`**, upload `_site/index.html` and
   `_site/run-data.json` as artifacts (Step 3 above)
4. **Optionally remove** the dashboard deploy job from `e2e-tests.yml`
   (the in-repo `dashboard` job) — or keep it for redundancy
5. **Verify** the standalone dashboard shows the same data as the in-repo
   one
6. **Update any bookmarks** to point to the new dashboard URL

---

#### When NOT to use a standalone dashboard

- You only have **one test repo** — the in-repo approach is strictly simpler
- Your team is **small** (< 5 people) — the overhead of two repos isn't
  worth it
- You need **zero infrastructure maintenance** — the in-repo Pages setup
  is fire-and-forget
- Your **test structure changes frequently** — keeping the dashboard schema
  in sync across two repos adds friction

**Bottom line**: Start in-repo. Move to standalone only when you have a
concrete need for cross-repo aggregation or authentication.

---

#### Definition of Done

- [ ] This proposal document exists to guide the decision
- [ ] If chosen: a separate GitHub repo is created for the dashboard
- [ ] The dashboard repo has a CI workflow that fetches artifacts from
      all test repos using `gh run download` or `actions/download-artifact`
- [ ] The dashboard repo contains a `merge-data.js` script that combines
      data from multiple sources into a single dataset
- [ ] Historical data persists across runs (stored in `data/history.jsonl`
      within the dashboard repo)
- [ ] The dashboard is deployed to a stable URL (GitHub Pages / Vercel / Netlify)
- [ ] The dashboard shows aggregate data from all configured test repos
- [ ] A migration path from in-repo to standalone is documented (above)

---

## Data Flow Summary

```
Cucumber JSON
  (per layer, per run)
       │
       ▼
dashboard/generate.js
  - Parse Cucumber JSON
  - Compute per-layer stats
  - Detect flaky (via rerun or history)
  - Load/append runs.jsonl
  - Build trend data
       │
       ▼
_site/index.html
  - Embedded run data (JSON in <script>)
  - Chart.js visualizations
  - Scenario table with filter/sort
  - Historical trend charts
       │
       ▼
GitHub Pages
  - Always the latest run's dashboard
  - Historical data persists in _history/runs.jsonl
  - URL: https://<user>.github.io/<repo>/
```

## Files summary

| File | Action | Purpose |
|------|--------|---------|
| `cucumber.json` | Edit | Add JSON formatter to all profiles |
| `.github/workflows/e2e-tests.yml` | Edit | Add per-layer artifact uploads + dashboard deploy job |
| `.github/workflows/e2e-api.yml` | Optional edit | Add artifact upload for standalone runs |
| `.github/workflows/e2e-db.yml` | Optional edit | Same |
| `.github/workflows/e2e-ui.yml` | Optional edit | Same |
| `.github/workflows/e2e-judge.yml` | Optional edit | Same |
| `dashboard/generate.js` | Create | Dashboard build script |
| `_site/index.html` | Generated | Dashboard output (gitignored) |
| `_site/runs.jsonl` | Generated | Historical data (on gh-pages branch) |
| `e2e/support/hooks.js` | Optional edit | Retry/flaky detection |

## Non-goals

- **No real-time updates** — the dashboard updates when CI runs. Live
  WebSocket or SSE updates are not supported.
- **No authentication** — GitHub Pages is public. If you need private
  dashboards, use a standalone app with auth.
- **No database** — all data lives in a JSONL file on the `gh-pages`
  branch. This is fine for up to ~500 runs (each run is ~10-20 KB).
- **No Slack/email notifications** — those can be added separately via
  the GitHub API or a status check action.
