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
  if (!rerunFilePath || !existsSync(rerunFilePath)) return new Set()

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
      sc.rerunFlaky = true
      rerunFlakyCount++
      summary.failed--
      summary.passed++
    }
  }

  summary.rerunFlaky = rerunFlakyCount
  // Pass rate excludes rerun-flaky: they passed only after retry, not on first attempt
  summary.passRate = summary.total > 0 ? Math.round(((summary.passed - rerunFlakyCount) / summary.total) * 10000) / 100 : 0

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
    layers[key].rerunFlaky = layerScenarios.filter(s => s.rerunFlaky).length
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
        { total: v.total, passed: v.passed, failed: v.failed, skipped: v.skipped, ambiguous: v.ambiguous, rerunFlaky: v.rerunFlaky || 0, durationMs: Math.round(v.durationMs) }
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

  const flakyStatusMap = Object.fromEntries(flakyScenarios.map(f => [f.uri + ':' + f.line, f.statuses]))

  const historyForChart = history.filter(r => r.summary?.total > 0)

  const chartLabels = JSON.stringify(historyForChart.map(r => {
    const d = new Date(r.timestamp)
    return `#${r.runNumber || '?'} ${d.getMonth()+1}/${d.getDate()}`
  }))

  const chartPassRates = JSON.stringify(historyForChart.map(r => r.summary.passRate))
  const chartTotals = JSON.stringify(historyForChart.map(r => r.summary.total))
  const chartDurations = JSON.stringify(historyForChart.map(r => Math.round(r.durationMs / 1000)))
  const chartFailed = JSON.stringify(historyForChart.map(r => r.summary?.failed || 0))
  const chartFlaky = JSON.stringify(historyForChart.map(r => r.summary?.flaky || 0))

  const slowestScenarios = [...allScenarios]
    .filter(s => s.durationMs > 0)
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10)

  const featureBreakdown = new Map()
  for (const sc of allScenarios) {
    const key = sc.uri.replace('e2e/features/', '')
    if (!featureBreakdown.has(key)) featureBreakdown.set(key, { total: 0, passed: 0, failed: 0, flaky: 0, skipped: 0 })
    const f = featureBreakdown.get(key)
    f.total++
    if (sc.flaky) f.flaky++
    else if (sc.status === 'passed') f.passed++
    else if (sc.status === 'failed') f.failed++
    else f.skipped++
  }
  const featureList = [...featureBreakdown.entries()].sort((a, b) => b[1].failed - a[1].failed || b[1].flaky - a[1].flaky)

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

.tag { display: inline-block; padding: 1px 6px; border-radius: 3px; background: #1e3a5f; color: #93c5fd; font-size: 0.7rem; margin: 1px; }
tr[data-status] { cursor: pointer; }
tr[data-status]:hover td { background: #243044; }
.detail-row > td { padding: 0 16px 12px 36px; background: #0c1628; border-bottom: 2px solid #334155; }
.scenario-detail { padding-top: 8px; }
.detail-section { margin-bottom: 10px; }
.detail-label { font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
.step-line { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.75rem; padding: 1px 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.step-passed { color: #4ade80; }
.step-failed { color: #f87171; }
.step-skipped, .step-undefined, .step-pending { color: #60a5fa; }
.step-error { font-size: 0.7rem; color: #f87171; padding: 4px 8px; background: #1e293b; border-radius: 4px; margin: 2px 0 4px 18px; white-space: pre-wrap; word-break: break-word; max-height: 120px; overflow-y: auto; }
.flaky-reason { padding: 5px 10px; background: #2d1b00; border-left: 3px solid #f59e0b; border-radius: 0 4px 4px 0; font-size: 0.75rem; color: #fde68a; margin-bottom: 8px; }
.btn {
  background: #1e293b; border: 1px solid #334155; border-radius: 6px;
  padding: 6px 12px; color: #e2e8f0; font-size: 0.8125rem; cursor: pointer; white-space: nowrap;
}
.btn:hover { background: #334155; border-color: #475569; }
.progress-bar { height: 6px; border-radius: 3px; background: #0f172a; display: flex; overflow: hidden; margin-top: 4px; }
.progress-pass { background: #166534; }
.progress-fail { background: #991b1b; }
.progress-flaky { background: #854d0e; }
.progress-skip { background: #1e3a5f; }
.mini-stat { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 0.7rem; font-weight: 600; min-width: 24px; text-align: center; }
.mini-pass { background: #166534; color: #86efac; }
.mini-fail { background: #991b1b; color: #fca5a5; }
.mini-flaky { background: #854d0e; color: #fde68a; }
.mini-skip { background: #1e3a5f; color: #93c5fd; }
.feature-table td:first-child { font-family: 'JetBrains Mono', 'Fira Code', monospace; font-size: 0.75rem; color: #94a3b8; }
.dash { color: #334155; }
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
  <div class="card card-rate"><div class="card-label">Pass Rate</div><div class="card-value">${summary.passRate}%</div>${(summary.rerunFlaky || 0) > 0 ? `<div class="card-sub">${summary.rerunFlaky} flaky excl.</div>` : ''}</div>
</div>

<div class="cards cards-layers">
  ${['api', 'db', 'ui', 'judge'].map(key => {
    const l = layers[key] || { total: 0, passed: 0, failed: 0, skipped: 0, durationMs: 0 }
    const label = { api: 'API', db: 'DB', ui: 'UI', judge: 'Judge' }[key]
    const color = layerColors[key]
    return `<div class="card layer-card" style="border-top-color: ${color}">
      <div class="layer-card-header">
        <span class="layer-card-name">${label}</span>
        <span class="badge badge-${l.failed > 0 ? 'fail' : (l.rerunFlaky || 0) > 0 ? 'flaky' : l.passed > 0 ? 'pass' : 'skip'}">${l.failed > 0 ? 'FAIL' : (l.rerunFlaky || 0) > 0 ? 'FLAKY' : 'PASS'}</span>
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
  <h2>Pass Rate &amp; Duration</h2>
  <div style="position:relative;height:260px"><canvas id="trendChart"></canvas></div>
</div>

<div class="chart-section">
  <h2>Failures &amp; Flaky Count</h2>
  <div style="position:relative;height:160px"><canvas id="issueChart"></canvas></div>
</div>

${historyForChart.length > 1 ? `<section style="margin-bottom:24px">
  <h2>Past Runs (${historyForChart.length})</h2>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>Run</th><th>Date</th><th>Branch</th><th>Pass Rate</th><th>Total</th><th>Passed</th><th>Failed</th><th>Flaky</th><th>Duration</th>
      </tr></thead>
      <tbody>
        ${[...historyForChart].reverse().map(r => {
          const isCurrent = r.runId === runId
          const rate = r.summary.passRate
          const rateColor = rate >= 90 ? '#4ade80' : rate >= 70 ? '#facc15' : '#f87171'
          const d = new Date(r.timestamp)
          return `<tr style="${isCurrent ? 'background:#1a2f1a' : ''}">
            <td style="white-space:nowrap;font-weight:600">#${r.runNumber || '?'}${isCurrent ? ' <span style="font-size:0.7rem;color:#4ade80">(current)</span>' : ''}</td>
            <td style="font-size:0.8rem;color:#94a3b8;white-space:nowrap">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</td>
            <td style="font-size:0.8rem;color:#94a3b8">${escHtml(r.branch || '')}</td>
            <td style="font-weight:600;color:${rateColor}">${rate}%</td>
            <td style="color:#94a3b8">${r.summary.total}</td>
            <td style="color:#4ade80">${r.summary.passed}</td>
            <td style="color:${r.summary.failed > 0 ? '#f87171' : '#64748b'}">${r.summary.failed}</td>
            <td style="color:${(r.summary.flaky || 0) > 0 ? '#facc15' : '#64748b'}">${r.summary.flaky || 0}</td>
            <td style="white-space:nowrap;color:#94a3b8">${fmtDuration(r.durationMs)}</td>
          </tr>`
        }).join('\n        ')}
      </tbody>
    </table>
  </div>
</section>` : ''}

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

${slowestScenarios.length > 0 ? `<section style="margin-bottom:24px">
  <h2>Slowest Scenarios</h2>
  <div class="table-wrap">
    <table>
      <thead><tr>
        <th>#</th><th>Status</th><th>Layer</th><th>Scenario</th><th>Duration</th>
      </tr></thead>
      <tbody>
        ${slowestScenarios.map((sc, i) => {
          const statusLabel = sc.flaky ? 'FLAKY' : sc.status.toUpperCase()
          const statusBadge = sc.flaky ? 'badge-flaky' : sc.status === 'passed' ? 'badge-pass' : sc.status === 'failed' ? 'badge-fail' : 'badge-skip'
          const layerLabel = { api: 'API', db: 'DB', ui: 'UI', judge: 'Judge' }[sc.layer] || sc.layer
          const durationColor = sc.durationMs > 10000 ? '#f87171' : sc.durationMs > 5000 ? '#facc15' : '#e2e8f0'
          return `<tr>
            <td style="color:#64748b;font-size:0.75rem">${i + 1}</td>
            <td><span class="badge ${statusBadge}">${statusLabel}</span></td>
            <td>${layerLabel}</td>
            <td>${escHtml(sc.name)}</td>
            <td style="white-space:nowrap;font-weight:600;color:${durationColor}">${fmtDuration(sc.durationMs)}</td>
          </tr>`
        }).join('\n        ')}
      </tbody>
    </table>
  </div>
</section>` : ''}

${featureList.length > 0 ? `<section style="margin-bottom:24px">
  <h2>By Feature File</h2>
  <div class="table-wrap">
    <table class="feature-table">
      <thead><tr>
        <th>Feature File</th>
        <th style="text-align:center">Total</th>
        <th style="text-align:center">Passed</th>
        <th style="text-align:center">Failed</th>
        <th style="text-align:center">Flaky</th>
        <th style="text-align:center">Skipped</th>
        <th>Breakdown</th>
      </tr></thead>
      <tbody>
        ${featureList.map(([file, f]) => `<tr>
          <td>${escHtml(file)}</td>
          <td style="text-align:center;color:#94a3b8">${f.total}</td>
          <td style="text-align:center">${f.passed > 0 ? `<span class="mini-stat mini-pass">${f.passed}</span>` : '<span class="dash">&mdash;</span>'}</td>
          <td style="text-align:center">${f.failed > 0 ? `<span class="mini-stat mini-fail">${f.failed}</span>` : '<span class="dash">&mdash;</span>'}</td>
          <td style="text-align:center">${f.flaky > 0 ? `<span class="mini-stat mini-flaky">${f.flaky}</span>` : '<span class="dash">&mdash;</span>'}</td>
          <td style="text-align:center">${f.skipped > 0 ? `<span class="mini-stat mini-skip">${f.skipped}</span>` : '<span class="dash">&mdash;</span>'}</td>
          <td style="min-width:80px">
            <div class="progress-bar">
              ${f.passed > 0 ? `<div class="progress-pass" style="flex:${f.passed}"></div>` : ''}
              ${f.failed > 0 ? `<div class="progress-fail" style="flex:${f.failed}"></div>` : ''}
              ${f.flaky > 0 ? `<div class="progress-flaky" style="flex:${f.flaky}"></div>` : ''}
              ${f.skipped > 0 ? `<div class="progress-skip" style="flex:${f.skipped}"></div>` : ''}
            </div>
          </td>
        </tr>`).join('\n        ')}
      </tbody>
    </table>
  </div>
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
    <button class="btn" onclick="copyReport(event)" title="Copy filtered results as Markdown">Copy report</button>
    <button class="btn" onclick="copyLink(event)" title="Copy URL with active filters">Share link</button>
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

          const tagsHtml = sc.tags && sc.tags.length > 0
            ? `<div class="detail-section"><div class="detail-label">Tags</div><div>${sc.tags.map(t => `<span class="tag">${escHtml(t)}</span>`).join(' ')}</div></div>`
            : ''

          let flakyReasonHtml = ''
          if (sc.rerunFlaky) {
            flakyReasonHtml = `<div class="flaky-reason">Failed on first attempt, passed on rerun — promoted to passed but excluded from pass rate.</div>`
          } else if (sc.flaky) {
            const flakyKey = sc.uri + ':' + sc.line
            const statuses = flakyStatusMap[flakyKey]
            flakyReasonHtml = `<div class="flaky-reason">Inconsistent across recent runs: ${statuses ? statuses.join(' → ') : 'mixed statuses'}</div>`
          }

          const stepsHtml = sc.steps && sc.steps.length > 0
            ? `<div class="detail-section"><div class="detail-label">Steps</div>${sc.steps.map(s => {
                const icon = s.status === 'passed' ? '✓' : s.status === 'failed' ? '✗' : '○'
                const stepLine = `<div class="step-line step-${s.status}">${icon} ${escHtml(s.keyword)}${escHtml(s.name)}</div>`
                const errLine = s.errorMessage ? `<div class="step-error">${escHtml(s.errorMessage)}</div>` : ''
                return stepLine + errLine
              }).join('')}</div>`
            : ''

          return `<tr class="${cls}" data-status="${sc.flaky ? 'flaky' : sc.status}" data-layer="${sc.layer}" onclick="toggleDetail(this)">
            <td class="status-cell"><span class="badge ${statusBadge}">${statusLabel}</span></td>
            <td>${layerLabel}</td>
            <td>${escHtml(sc.name)}</td>
            <td style="font-size:0.75rem;color:#64748b">${sc.uri.replace('e2e/features/', '')}:${sc.line}</td>
            <td style="white-space:nowrap">${fmtDuration(sc.durationMs)}</td>
          </tr>
          <tr class="detail-row ${cls}" style="display:none">
            <td colspan="5"><div class="scenario-detail">${tagsHtml}${flakyReasonHtml}${stepsHtml}</div></td>
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

// ── Failures & flaky trend chart ──
const issueCtx = document.getElementById('issueChart').getContext('2d')
new Chart(issueCtx, {
  type: 'bar',
  data: {
    labels: ${chartLabels},
    datasets: [
      { label: 'Failed', data: ${chartFailed}, backgroundColor: 'rgba(248,113,113,0.8)', borderColor: '#f87171', borderWidth: 1 },
      { label: 'Flaky',  data: ${chartFlaky},  backgroundColor: 'rgba(250,204,21,0.8)',  borderColor: '#facc15', borderWidth: 1 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { labels: { color: '#94a3b8' } } },
    scales: {
      x: { stacked: true, ticks: { color: '#64748b', maxRotation: 45 }, grid: { color: '#1e293b' } },
      y: { stacked: true, min: 0, ticks: { color: '#94a3b8', stepSize: 1, precision: 0 }, grid: { color: '#1e293b' } }
    }
  }
})

// ── Row expand/collapse ──
function toggleDetail(row) {
  const detail = row.nextElementSibling
  if (detail?.classList.contains('detail-row')) {
    detail.style.display = detail.style.display === 'none' ? '' : 'none'
  }
}

// ── Table sorting ──
let sortCol = -1
let sortAsc = true

function sortTable(col) {
  const tbody = document.getElementById('scenarioBody')
  const mainRows = Array.from(tbody.querySelectorAll('tr[data-status]'))
  // Capture [mainRow, detailRow] pairs before reordering
  const rowPairs = mainRows.map(r => [r, r.nextElementSibling?.classList.contains('detail-row') ? r.nextElementSibling : null])

  if (sortCol === col) sortAsc = !sortAsc
  else { sortCol = col; sortAsc = true }

  document.querySelectorAll('th .sort-arrow').forEach(el => {
    el.parentElement.classList.remove('sort-asc', 'sort-desc')
  })
  const th = document.getElementById('th-' + ['status','layer','name','file','duration'][col])
  th.classList.add(sortAsc ? 'sort-asc' : 'sort-desc')

  const statusOrder = { failed: 0, flaky: 1, passed: 2, skipped: 3, ambiguous: 4 }

  rowPairs.sort((a, b) => {
    let va = a[0].cells[col]?.textContent?.trim() || ''
    let vb = b[0].cells[col]?.textContent?.trim() || ''
    if (col === 0) { va = statusOrder[va.toLowerCase()] ?? 99; vb = statusOrder[vb.toLowerCase()] ?? 99 }
    if (col === 4) { va = parseDuration(va); vb = parseDuration(vb) }
    return sortAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1)
  })

  rowPairs.forEach(([r, detail]) => {
    tbody.appendChild(r)
    if (detail) tbody.appendChild(detail)
  })

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

  document.querySelectorAll('#scenarioBody tr[data-status]').forEach(row => {
    const text = row.textContent.toLowerCase()
    const rowStatus = row.dataset.status
    const rowLayer = row.dataset.layer

    const matchSearch = !search || text.includes(search)
    const matchStatus = !status || rowStatus === status
    const matchLayer = !layer || rowLayer === layer
    const visible = matchSearch && matchStatus && matchLayer

    row.classList.toggle('hidden', !visible)
    const detail = row.nextElementSibling
    if (detail?.classList.contains('detail-row')) {
      if (!visible) detail.style.display = 'none'
    }
  })
  updateHash()
}

// ── URL hash sync ──
function updateHash() {
  const status = document.getElementById('statusFilter').value
  const layer = document.getElementById('layerFilter').value
  const search = document.getElementById('searchInput').value
  const parts = []
  if (status) parts.push('status=' + status)
  if (layer) parts.push('layer=' + layer)
  if (search) parts.push('q=' + encodeURIComponent(search))
  window.history.replaceState(null, '', parts.length ? '#' + parts.join('&') : window.location.pathname + window.location.search)
}

function loadFromHash() {
  const hash = window.location.hash.slice(1)
  if (!hash) return
  const params = Object.fromEntries(hash.split('&').map(p => {
    const eq = p.indexOf('=')
    return eq === -1 ? [p, ''] : [p.slice(0, eq), decodeURIComponent(p.slice(eq + 1))]
  }))
  if (params.status) document.getElementById('statusFilter').value = params.status
  if (params.layer) document.getElementById('layerFilter').value = params.layer
  if (params.q) document.getElementById('searchInput').value = params.q
}

// ── Copy report as Markdown ──
function copyReport(e) {
  const status = document.getElementById('statusFilter').value
  const layer = document.getElementById('layerFilter').value
  const search = document.getElementById('searchInput').value
  const visibleRows = Array.from(document.querySelectorAll('#scenarioBody tr[data-status]:not(.hidden)'))

  const filterDesc = [
    status ? 'Status: ' + status : '',
    layer ? 'Layer: ' + layer : '',
    search ? 'Search: "' + search + '"' : ''
  ].filter(Boolean).join(' | ') || 'All scenarios'

  const d = RUN_DATA
  const lines = [
    '**E2E Dashboard — Run #' + d.runNumber + ' | ' + d.branch + (d.commit ? ' | ' + d.commit.slice(0,7) : '') + ' | ' + d.summary.passRate + '% pass rate**',
    'Total: ' + d.summary.total + ' | Passed: ' + d.summary.passed + ' | Failed: ' + d.summary.failed + ' | Flaky: ' + (d.summary.flaky || 0) + ' | Skipped: ' + d.summary.skipped,
    '',
    '**Filter: ' + filterDesc + ' (' + visibleRows.length + ' scenarios)**',
    '',
    '| Status | Layer | Scenario | File | Duration |',
    '|--------|-------|----------|------|----------|'
  ]
  for (const row of visibleRows) {
    const c = row.cells
    lines.push('| ' + [c[0]?.textContent?.trim(), c[1]?.textContent?.trim(), c[2]?.textContent?.trim(), c[3]?.textContent?.trim(), c[4]?.textContent?.trim()].join(' | ') + ' |')
  }

  navigator.clipboard.writeText(lines.join('\\n')).then(() => {
    const btn = e.currentTarget; const orig = btn.textContent
    btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig }, 1500)
  })
}

// ── Copy shareable link ──
function copyLink(e) {
  navigator.clipboard.writeText(window.location.href).then(() => {
    const btn = e.currentTarget; const orig = btn.textContent
    btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = orig }, 1500)
  })
}

// Initial sort by status (failed first)
window.addEventListener('DOMContentLoaded', () => { loadFromHash(); sortTable(0) })
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


