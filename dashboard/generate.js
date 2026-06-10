#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'

// ── CLI args ──────────────────────────────────────────────────────

const args = {}
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i].replace(/^--/, '')
  args[key] = process.argv[i + 1]
}

const {
  api,
  'api-rerun': apiRerun,
  db: dbArg,
  'db-rerun': dbRerun,
  ui,
  'ui-rerun': uiRerun,
  judge,
  'judge-rerun': judgeRerun,
  history: historyArg,
  out,
  'run-id': runId,
  'run-number': runNumber,
  branch,
  commit
} = args

if (!out) {
  console.error('Usage: node dashboard/generate.js --api <json> [--api-rerun <json>] --db <json> [--db-rerun <json>] --ui <json> [--ui-rerun <json>] --judge <json> [--judge-rerun <json>] --history <jsonl> --out <html> --run-id <id> --run-number <n> --branch <b> --commit <c>')
  process.exit(1)
}

// ── Parse Cucumber JSON ────────────────────────────────────────────

function parseCucumberJson(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return { features: [], scenarios: [], durationMs: 0, total: 0, passed: 0, failed: 0, skipped: 0, ambiguous: 0 }
  }

  const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
  const features = Array.isArray(raw) ? raw : [raw]
  const scenarios = []

  for (const feature of features) {
    const featureTags = (feature.tags || []).map(t => (typeof t === 'string' ? t : t.name))
    const elements = feature.elements || []

    for (const element of elements) {
      if (element.type === 'background') continue

      const steps = (element.steps || []).map(s => ({
        keyword: s.keyword?.trim() || '',
        name: s.name || '',
        status: s.result?.status || 'skipped',
        duration: s.result?.duration || 0,
        errorMessage: s.result?.error_message || null
      }))

      const scenarioStatus = determineScenarioStatus(steps)
      const scenarioTags = [...featureTags, ...(element.tags || []).map(t => (typeof t === 'string' ? t : t.name))]

      scenarios.push({
        name: element.name || '',
        line: element.line || 0,
        uri: feature.uri || '',
        status: scenarioStatus,
        durationMs: steps.reduce((sum, s) => sum + (s.duration || 0), 0) / 1_000_000,
        errorMessage: getFirstError(steps),
        tags: scenarioTags,
        steps
      })
    }
  }

  const durationMs = scenarios.reduce((s, sc) => s + sc.durationMs, 0)
  const total = scenarios.length
  const passed = scenarios.filter(s => s.status === 'passed').length
  const failed = scenarios.filter(s => s.status === 'failed').length
  const skipped = scenarios.filter(s => s.status === 'skipped' || s.status === 'undefined' || s.status === 'pending').length
  const ambiguous = scenarios.filter(s => s.status === 'ambiguous').length

  return { features, scenarios, durationMs, total, passed, failed, skipped, ambiguous }
}

function determineScenarioStatus(steps) {
  const statuses = steps.map(s => s.status)
  if (statuses.some(s => s === 'failed')) return 'failed'
  if (statuses.some(s => s === 'ambiguous')) return 'ambiguous'
  if (statuses.every(s => s === 'passed')) return 'passed'
  return 'skipped'
}

function getFirstError(steps) {
  const failed = steps.find(s => s.status === 'failed')
  return failed?.errorMessage || null
}

// ── Flaky detection ────────────────────────────────────────────────

function detectFlaky(currentScenarios, history) {
  if (history.length < 2) return {}

  const flaky = {}
  const recentRuns = history.slice(-3)

  for (const sc of currentScenarios) {
    const key = `${sc.uri}:${sc.line}`
    const pastStatuses = recentRuns
      .map(r => r.scenarioStatuses?.[key])
      .filter(Boolean)

    const allStatuses = [...new Set([sc.status, ...pastStatuses])]
    if (allStatuses.length > 1) {
      flaky[key] = { name: sc.name, uri: sc.uri, line: sc.line, statuses: allStatuses }
    }
  }

  return flaky
}

// ── History management ─────────────────────────────────────────────

function loadHistory(filePath) {
  if (!filePath || !existsSync(filePath)) return []
  const lines = readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean)
  return lines.map(l => JSON.parse(l))
}

function saveHistory(filePath, history, maxEntries = 50) {
  const trimmed = history.slice(-maxEntries)
  const dir = dirname(filePath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, trimmed.map(r => JSON.stringify(r)).join('\n') + '\n')
}

// ── Rerun-based flaky detection ─────────────────────────────────────

function detectFlakyFromRerun(firstRunScenarios, rerunFilePath) {
  if (!rerunFilePath || !existsSync(rerunFilePath)) return {}

  const rerunData = parseCucumberJson(rerunFilePath)
  const rerunScenarios = rerunData.scenarios || []

  const rerunResults = {}
  for (const sc of rerunScenarios) {
    rerunResults[`${sc.uri}:${sc.line}`] = sc.status
  }

  const flakyKeys = new Set()
  for (const sc of firstRunScenarios) {
    const key = `${sc.uri}:${sc.line}`
    if (sc.status === 'failed' && rerunResults[key] === 'passed') {
      flakyKeys.add(key)
    }
  }

  return flakyKeys
}

// ── Build run object ────────────────────────────────────────────────

function buildRun() {
  const layers = {}
  const layerConfigs = {
    api: { file: api, label: 'API' },
    db: { file: dbArg, label: 'DB' },
    ui: { file: ui, label: 'UI' },
    judge: { file: judge, label: 'Judge' }
  }

  let overallDurationMs = 0
  let summary = { total: 0, passed: 0, failed: 0, skipped: 0, ambiguous: 0 }
  const allScenarios = []

  const rerunFiles = {
    api: apiRerun,
    db: dbRerun,
    ui: uiRerun,
    judge: judgeRerun
  }

  for (const [key, cfg] of Object.entries(layerConfigs)) {
    const parsed = parseCucumberJson(cfg.file)
    layers[key] = parsed
    overallDurationMs += parsed.durationMs
    summary.total += parsed.total
    summary.passed += parsed.passed
    summary.failed += parsed.failed
    summary.skipped += parsed.skipped
    summary.ambiguous += parsed.ambiguous
    for (const sc of parsed.scenarios) {
      allScenarios.push({ ...sc, layer: key })
    }
  }

  // ── Apply rerun-based flaky detection ──
  // Scenarios that failed on first attempt but passed on rerun are flaky.
  // Their status is changed to "passed" so they don't count as failures.
  const rerunFlakyKeys = new Set()
  for (const [key, rerunFile] of Object.entries(rerunFiles)) {
    const layerScenarios = allScenarios.filter(s => s.layer === key)
    for (const key of detectFlakyFromRerun(layerScenarios, rerunFile)) {
      rerunFlakyKeys.add(key)
    }
  }

  let rerunFlakyCount = 0
  for (const sc of allScenarios) {
    const key = `${sc.uri}:${sc.line}`
    if (rerunFlakyKeys.has(key) && sc.status === 'failed') {
      sc.status = 'passed'
      sc.flaky = true
      rerunFlakyCount++
      summary.failed--
      summary.passed++
    }
  }

  summary.passRate = summary.total > 0 ? Math.round((summary.passed / summary.total) * 10000) / 100 : 0

  // Build scenario key map for history-based flaky detection
  const scenarioStatuses = {}
  for (const sc of allScenarios) {
    scenarioStatuses[`${sc.uri}:${sc.line}`] = sc.status
  }

  // Load history and detect flaky (uses corrected statuses)
  const historyFile = historyArg || resolve(dirname(out), 'runs.jsonl')
  const history = loadHistory(historyFile)

  const historyFlakyMap = detectFlaky(allScenarios, history)

  // Tag history-flaky scenarios (don't override rerun-based flaky)
  for (const sc of allScenarios) {
    if (!sc.flaky) {
      sc.flaky = !!historyFlakyMap[`${sc.uri}:${sc.line}`]
    }
  }

  // Recalculate per-layer stats to reflect rerun adjustments
  for (const [key, cfg] of Object.entries(layerConfigs)) {
    const layerScenarios = allScenarios.filter(s => s.layer === key)
    layers[key].passed = layerScenarios.filter(s => s.status === 'passed').length
    layers[key].failed = layerScenarios.filter(s => s.status === 'failed').length
    layers[key].skipped = layerScenarios.filter(s => s.status === 'skipped' || s.status === 'undefined' || s.status === 'pending').length
    layers[key].ambiguous = layerScenarios.filter(s => s.status === 'ambiguous').length
  }

  // Build combined flaky scenarios list
  const flakyScenariosList = allScenarios.filter(s => s.flaky).map(sc => ({
    name: sc.name,
    uri: sc.uri,
    line: sc.line,
    statuses: [...new Set([sc.status, ...(historyFlakyMap[`${sc.uri}:${sc.line}`]?.statuses || [])])]
  }))

  summary.flaky = flakyScenariosList.length

  const run = {
    runId: runId || 'local',
    runNumber: runNumber ? parseInt(runNumber, 10) : 0,
    branch: branch || 'local',
    commit: commit || '',
    timestamp: new Date().toISOString(),
    durationMs: Math.round(overallDurationMs),
    summary,
    layers: Object.fromEntries(
      Object.entries(layers).map(([k, v]) => [
        k,
        { total: v.total, passed: v.passed, failed: v.failed, skipped: v.skipped, ambiguous: v.ambiguous, durationMs: Math.round(v.durationMs) }
      ])
    ),
    allScenarios,
    flakyScenarios: flakyScenariosList
  }

  // Append to history
  history.push({
    runId: run.runId,
    runNumber: run.runNumber,
    branch: run.branch,
    commit: run.commit,
    timestamp: run.timestamp,
    durationMs: run.durationMs,
    summary: run.summary,
    layers: run.layers,
    scenarioStatuses
  })

  saveHistory(historyFile, history)

  return { run, history }
}

// ── Generate HTML ──────────────────────────────────────────────────

function generateHtml(run, history) {
  const { summary, layers, allScenarios, flakyScenarios, runNumber, branch, commit, timestamp, durationMs, runId } = run

  const historyForChart = history.filter(r => r.summary?.total > 0)

  const chartLabels = JSON.stringify(historyForChart.map(r => {
    const d = new Date(r.timestamp)
    return `#${r.runNumber || '?'} ${d.getMonth()+1}/${d.getDate()}`
  }))

  const chartPassRates = JSON.stringify(historyForChart.map(r => r.summary.passRate))
  const chartTotals = JSON.stringify(historyForChart.map(r => r.summary.total))
  const chartDurations = JSON.stringify(historyForChart.map(r => Math.round(r.durationMs / 1000)))

  const failedScenarios = allScenarios.filter(s => s.status === 'failed')
  const flakyList = flakyScenarios.filter(f => {
    const sc = allScenarios.find(s => `${s.uri}:${s.line}` === `${f.uri}:${f.line}`)
    return sc?.status === 'passed'
  })

  const layerColors = { api: '#3b82f6', db: '#22c55e', ui: '#f59e0b', judge: '#a855f7' }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>E2E Test Dashboard - Run #${runNumber}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a; color: #e2e8f0; padding: 24px; line-height: 1.5;
}
h1 { font-size: 1.5rem; font-weight: 700; }
h2 { font-size: 1.125rem; font-weight: 600; margin-bottom: 12px; }
a { color: #60a5fa; }
.header {
  display: flex; justify-content: space-between; align-items: center;
  flex-wrap: wrap; gap: 12px; margin-bottom: 24px;
  padding-bottom: 16px; border-bottom: 1px solid #1e293b;
}
.run-info {
  font-size: 0.875rem; color: #94a3b8;
  display: flex; gap: 16px; flex-wrap: wrap;
}
.run-info span { white-space: nowrap; }
.badge {
  display: inline-block; padding: 2px 8px; border-radius: 4px;
  font-size: 0.75rem; font-weight: 600;
}
.badge-pass { background: #166534; color: #86efac; }
.badge-fail { background: #991b1b; color: #fca5a5; }
.badge-skip { background: #1e3a5f; color: #93c5fd; }
.badge-flaky { background: #854d0e; color: #fde68a; }

.cards { display: grid; gap: 12px; margin-bottom: 24px; }
.cards-summary { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); }
.cards-layers { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
.card {
  background: #1e293b; border-radius: 8px; padding: 16px;
  border: 1px solid #334155;
}
.card-label { font-size: 0.75rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
.card-value { font-size: 1.75rem; font-weight: 700; margin-top: 4px; }
.card-sub { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
.card-pass .card-value { color: #4ade80; }
.card-fail .card-value { color: #f87171; }
.card-skip .card-value { color: #60a5fa; }
.card-flaky .card-value { color: #facc15; }
.card-rate .card-value { color: #c084fc; }

.layer-card { border-top: 3px solid #334155; }
.layer-card-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 8px;
}
.layer-card-name { font-weight: 600; font-size: 0.875rem; }
.layer-card-stats { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; font-size: 0.8125rem; }
.layer-card-stats div { display: flex; justify-content: space-between; }
.layer-card-stats .num { font-weight: 600; }

.chart-section { background: #1e293b; border-radius: 8px; padding: 16px; border: 1px solid #334155; margin-bottom: 24px; }
.chart-section canvas { max-height: 300px; }

.controls { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.controls input, .controls select {
  background: #1e293b; border: 1px solid #334155; border-radius: 6px;
  padding: 6px 12px; color: #e2e8f0; font-size: 0.8125rem;
}
.controls input { flex: 1; min-width: 180px; }

.table-wrap { overflow-x: auto; margin-bottom: 24px; }
table { width: 100%; border-collapse: collapse; font-size: 0.8125rem; }
th {
  text-align: left; padding: 8px 12px; border-bottom: 2px solid #334155;
  color: #94a3b8; font-weight: 600; cursor: pointer; user-select: none; white-space: nowrap;
}
th:hover { color: #e2e8f0; }
th .sort-arrow { margin-left: 4px; opacity: 0.4; }
th.sort-asc .sort-arrow, th.sort-desc .sort-arrow { opacity: 1; }
th.sort-desc .sort-arrow { transform: rotate(180deg); display: inline-block; }
td { padding: 8px 12px; border-bottom: 1px solid #1e293b; vertical-align: top; }
tr:hover td { background: #1e293b; }
tr.flaky-row td { background: #422006; }
td.status-cell { white-space: nowrap; }

.failure-detail {
  background: #1e293b; border-radius: 8px; padding: 12px; margin-top: 4px;
  border: 1px solid #334155;
}
.failure-detail pre {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.75rem; color: #f87171; white-space: pre-wrap;
  word-break: break-word; max-height: 200px; overflow-y: auto; margin-top: 4px;
}

@media (max-width: 640px) {
  body { padding: 12px; }
  .cards-summary { grid-template-columns: repeat(2, 1fr); }
  .cards-layers { grid-template-columns: 1fr 1fr; }
}

.hidden { display: none; }
</style>
</head>
<body>

<header class="header">
  <h1>E2E Test Dashboard</h1>
  <div class="run-info">
    <span>Run #${runNumber}</span>
    <span>${branch}</span>
    <span>${commit ? commit.slice(0, 7) : ''}</span>
    <span>${new Date(timestamp).toLocaleString()}</span>
    <span>${fmtDuration(durationMs)}</span>
  </div>
</header>

<div class="cards cards-summary">
  <div class="card"><div class="card-label">Total</div><div class="card-value">${summary.total}</div></div>
  <div class="card card-pass"><div class="card-label">Passed</div><div class="card-value">${summary.passed}</div><div class="card-sub">${summary.total > 0 ? Math.round(summary.passed / summary.total * 100) : 0}%</div></div>
  <div class="card card-fail"><div class="card-label">Failed</div><div class="card-value">${summary.failed}</div></div>
  <div class="card card-skip"><div class="card-label">Skipped</div><div class="card-value">${summary.skipped}</div></div>
  <div class="card card-flaky"><div class="card-label">Flaky</div><div class="card-value">${summary.flaky || 0}</div></div>
  <div class="card card-rate"><div class="card-label">Pass Rate</div><div class="card-value">${summary.passRate}%</div></div>
</div>

<div class="cards cards-layers">
  ${['api', 'db', 'ui', 'judge'].map(key => {
    const l = layers[key] || { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 }
    const label = { api: 'API', db: 'DB', ui: 'UI', judge: 'Judge' }[key]
    const color = layerColors[key]
    return `<div class="card layer-card" style="border-top-color: ${color}">
      <div class="layer-card-header">
        <span class="layer-card-name">${label}</span>
        <span class="badge badge-${l.failed > 0 ? 'fail' : l.passed > 0 ? 'pass' : 'skip'}">${l.failed > 0 ? 'FAIL' : 'PASS'}</span>
      </div>
      <div class="layer-card-stats">
        <div><span>Total</span><span class="num">${l.total}</span></div>
        <div><span>Passed</span><span class="num" style="color:#4ade80">${l.passed}</span></div>
        <div><span>Failed</span><span class="num" style="color:#f87171">${l.failed}</span></div>
        <div><span>Skipped</span><span class="num" style="color:#60a5fa">${l.skipped}</span></div>
      </div>
      <div class="card-sub" style="margin-top:6px">${fmtDuration(l.durationMs)}</div>
    </div>`
  }).join('\n  ')}
</div>

<div class="chart-section">
  <h2>Trends</h2>
  <canvas id="trendChart"></canvas>
</div>

${failedScenarios.length > 0 ? `<section style="margin-bottom:24px">
  <h2>Failures (${failedScenarios.length})</h2>
  ${failedScenarios.map(sc => {
    const layerLabel = { api: 'API', db: 'DB', ui: 'UI', judge: 'Judge' }[sc.layer]
    return `<div class="failure-detail" style="margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><span class="badge badge-fail">FAIL</span> <strong>${escHtml(sc.name)}</strong></div>
        <div style="font-size:0.75rem;color:#64748b">${layerLabel} &middot; ${sc.uri}:${sc.line}</div>
      </div>
      ${sc.errorMessage ? `<pre>${escHtml(sc.errorMessage)}</pre>` : ''}
      <div style="margin-top:4px;font-size:0.75rem;color:#64748b">${sc.steps.filter(s => s.status === 'failed').map(s => `! ${s.keyword} ${s.name}`).join('<br>')}</div>
    </div>`
  }).join('\n  ')}
</section>` : ''}

${flakyList.length > 0 ? `<section style="margin-bottom:24px">
  <h2>Flaky Scenarios (${flakyList.length})</h2>
  ${flakyList.map(f => `<div class="failure-detail" style="margin-bottom:8px;border-color:#854d0e">
    <div><span class="badge badge-flaky">FLAKY</span> <strong>${escHtml(f.name)}</strong></div>
    <div style="font-size:0.75rem;color:#64748b">${f.uri}:${f.line}</div>
    <div style="font-size:0.75rem;color:#facc15;margin-top:4px">Statuses: ${f.statuses.join(' > ')}</div>
  </div>`).join('\n  ')}
</section>` : ''}

<section>
  <h2>All Scenarios (${allScenarios.length})</h2>

  <div class="controls">
    <input type="text" id="searchInput" placeholder="Search scenarios..." oninput="filterTable()">
    <select id="statusFilter" onchange="filterTable()">
      <option value="">All statuses</option>
      <option value="passed">Passed</option>
      <option value="failed">Failed</option>
      <option value="skipped">Skipped</option>
      <option value="flaky">Flaky</option>
    </select>
    <select id="layerFilter" onchange="filterTable()">
      <option value="">All layers</option>
      <option value="api">API</option>
      <option value="db">DB</option>
      <option value="ui">UI</option>
      <option value="judge">Judge</option>
    </select>
  </div>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th onclick="sortTable(0)" id="th-status">Status <span class="sort-arrow">\u25b2</span></th>
          <th onclick="sortTable(1)" id="th-layer">Layer <span class="sort-arrow">\u25b2</span></th>
          <th onclick="sortTable(2)" id="th-name">Scenario <span class="sort-arrow">\u25b2</span></th>
          <th onclick="sortTable(3)" id="th-file">File <span class="sort-arrow">\u25b2</span></th>
          <th onclick="sortTable(4)" id="th-duration">Duration <span class="sort-arrow">\u25b2</span></th>
        </tr>
      </thead>
      <tbody id="scenarioBody">
        ${allScenarios.map(sc => {
          const cls = sc.flaky ? 'flaky-row' : ''
          const statusLabel = sc.flaky ? 'FLAKY' : sc.status.toUpperCase()
          const statusBadge = sc.flaky ? 'badge-flaky' : sc.status === 'passed' ? 'badge-pass' : sc.status === 'failed' ? 'badge-fail' : 'badge-skip'
          const layerLabel = { api: 'API', db: 'DB', ui: 'UI', judge: 'Judge' }[sc.layer] || sc.layer
          return `<tr class="${cls}" data-status="${sc.flaky ? 'flaky' : sc.status}" data-layer="${sc.layer}">
            <td class="status-cell"><span class="badge ${statusBadge}">${statusLabel}</span></td>
            <td>${layerLabel}</td>
            <td>${escHtml(sc.name)}</td>
            <td style="font-size:0.75rem;color:#64748b">${sc.uri.replace('e2e/features/', '')}:${sc.line}</td>
            <td style="white-space:nowrap">${fmtDuration(sc.durationMs)}</td>
          </tr>`
        }).join('\n          ')}
      </tbody>
    </table>
  </div>
</section>

<script>
// ── Embedded data ──
const RUN_DATA = ${JSON.stringify(run)}

// ── Trend chart ──
const ctx = document.getElementById('trendChart').getContext('2d')
new Chart(ctx, {
  type: 'line',
  data: {
    labels: ${chartLabels},
    datasets: [
      {
        label: 'Pass Rate (%)',
        data: ${chartPassRates},
        borderColor: '#4ade80',
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y'
      },
      {
        label: 'Duration (s)',
        data: ${chartDurations},
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.1)',
        fill: true,
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8' } }
    },
    scales: {
      x: {
        ticks: { color: '#64748b', maxRotation: 45 },
        grid: { color: '#1e293b' }
      },
      y: {
        type: 'linear',
        display: true,
        position: 'left',
        min: 0,
        max: 100,
        ticks: { color: '#4ade80' },
        grid: { color: '#1e293b' },
        title: { display: true, text: 'Pass Rate %', color: '#4ade80' }
      },
      y1: {
        type: 'linear',
        display: true,
        position: 'right',
        ticks: { color: '#60a5fa' },
        grid: { drawOnChartArea: false },
        title: { display: true, text: 'Duration (s)', color: '#60a5fa' }
      }
    }
  }
})

// ── Table sorting ──
let sortCol = -1
let sortAsc = true

function sortTable(col) {
  const tbody = document.getElementById('scenarioBody')
  const rows = Array.from(tbody.querySelectorAll('tr'))

  if (sortCol === col) sortAsc = !sortAsc
  else { sortCol = col; sortAsc = true }

  document.querySelectorAll('th .sort-arrow').forEach(el => {
    el.parentElement.classList.remove('sort-asc', 'sort-desc')
  })
  const th = document.getElementById('th-' + ['status','layer','name','file','duration'][col])
  th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc')

  const statusOrder = { failed: 0, flaky: 1, passed: 2, skipped: 3, ambiguous: 4 }

  rows.sort((a, b) => {
    let va = a.cells[col]?.textContent?.trim() || ''
    let vb = b.cells[col]?.textContent?.trim() || ''
    if (col === 0) { va = statusOrder[va.toLowerCase()] ?? 99; vb = statusOrder[vb.toLowerCase()] ?? 99 }
    if (col === 4) { va = parseDuration(va); vb = parseDuration(vb) }
    return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })

  rows.forEach(r => tbody.appendChild(r))

  filterTable()
}

function parseDuration(s) {
  if (s.endsWith('ms')) return parseFloat(s) || 0
  if (s.endsWith('s')) return (parseFloat(s) || 0) * 1000
  return 0
}

// ── Table filtering ──
function filterTable() {
  const search = document.getElementById('searchInput').value.toLowerCase()
  const status = document.getElementById('statusFilter').value
  const layer = document.getElementById('layerFilter').value

  document.querySelectorAll('#scenarioBody tr').forEach(row => {
    const text = row.textContent.toLowerCase()
    const rowStatus = row.dataset.status
    const rowLayer = row.dataset.layer

    const matchSearch = !search || text.includes(search)
    const matchStatus = !status || rowStatus === status
    const matchLayer = !layer || rowLayer === layer

    row.classList.toggle('hidden', !(matchSearch && matchStatus && matchLayer))
  })
}

// Initial sort by status (failed first)
window.addEventListener('DOMContentLoaded', () => sortTable(0))
</script>
</body>
</html>`
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmtDuration(ms) {
  if (!ms) return '0ms'
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return `${m}m ${s}s`
}

function escHtml(s) {
  if (!s) return ''
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── Main ────────────────────────────────────────────────────────────

const { run, history } = buildRun()
const html = generateHtml(run, history)

const outDir = dirname(resolve(out))
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
writeFileSync(resolve(out), html, 'utf-8')

console.log(`Dashboard generated: ${out}`)
console.log(`  Run #${run.runNumber} | ${run.summary.total} scenarios | ${run.summary.passed} passed | ${run.summary.failed} failed | ${run.summary.passRate}% pass rate`)
console.log(`  History: ${history.length - 1} previous runs`)


