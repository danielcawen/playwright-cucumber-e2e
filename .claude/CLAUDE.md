# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

End-to-end test suite for the **E2E Practice App** (a full-stack app at `D:/Documents/GitHub/app-for-e2e`). Covers three test layers: UI (Playwright browser automation), API (HTTP), and DB (PostgreSQL direct queries). Uses Cucumber BDD with ESM (`.js`, `"type": "module"`).

**Stack**: `@cucumber/cucumber` · `@playwright/test` · `pg` · `dotenv`

---

## Running Tests

```bash
npx cucumber-js                      # all layers
npx cucumber-js --profile ui         # UI only (launches Chromium)
npx cucumber-js --profile api        # API only (no browser)
npx cucumber-js --profile db         # DB only (pg queries)
```

Run a single feature file:
```bash
npx cucumber-js e2e/features/api/auth/login.feature
```

Run scenarios matching a name:
```bash
npx cucumber-js --name "Successful login"
```

Reports are written to `reports/` as HTML after each run.

---

## Architecture

### How the three layers connect

Each Cucumber scenario is tagged `@ui`, `@api`, or `@db`. The tag drives which infrastructure is set up per scenario:

- `@ui` → `hooks.js` launches a Chromium browser and opens a new page (`this.browser`, `this.page`)
- `@api` → `hooks.js` creates a Playwright `request.newContext` pointing at `BASE_URL` (`this.apiContext`)
- `@db` → `hooks.js` opens a `pg.Pool` connection (`this.db`)

All three share state via `support/world.js` — a `CustomWorld` class registered with `setWorldConstructor`. Steps access infrastructure through `this` (e.g. `this.page`, `this.apiContext`, `this.db`). Transient per-scenario state (last response, query results) also lives on `this`.

### Directory roles

| Path | Purpose |
|------|---------|
| `e2e/features/{ui,api,db}/` | Gherkin scenarios, one subdirectory per layer |
| `e2e/steps/{ui,api,db,shared}/` | Step definitions mirroring the features structure |
| `e2e/pages/` | Page module functions — locators (module-level `const`) and named async function exports, no assertions except `verifyX` helpers |
| `e2e/api/` | Thin `apiContext` wrappers, one file per backend resource |
| `e2e/db/` | Raw SQL helpers; `db/client.js` exports `createPool()` for direct use |
| `e2e/support/` | `world.js` (shared state), `hooks.js` (tag-based setup/teardown), `env.js` (config) |

### cucumber.json profiles

Each profile scopes both `paths` and `require` to its layer, so step files from other layers are never loaded. The `default` profile loads everything. `api` runs with `parallel: 2`; `ui` and `db` run serially.

### Environment variables (`support/env.js`)

Defaults point at the local Docker stack. Override with a `.env` file:

| Variable | Default |
|----------|---------|
| `FRONTEND_URL` | `http://localhost:5173` |
| `BASE_URL` | `http://localhost:3001` |
| `DB_URL` | `postgresql://postgres:postgres@localhost:5432/e2e_practice` |
| `MAIL_URL` | `http://localhost:8025` |

---

## Adding a New Test

1. **Feature file** — create under `e2e/features/{ui|api|db}/` and tag with `@ui`, `@api`, or `@db`.
2. **Steps** — add to `e2e/steps/{ui|api|db}/`. Steps shared across layers go in `e2e/steps/shared/`.
3. **Page module** (UI only) — add to `e2e/pages/` as named ESM exports (not a class). Locators are module-level `const` strings. Each action is an `export async function(page, ...)`. Steps import and call these functions directly, passing `this.page`. Example structure:
   ```js
   import { expect } from "@playwright/test";
   const myLocator = '[data-testid="my-element"]';
   export async function doAction(page) { ... }
   export async function verifyState(page, expected) { await expect(...).toContainText(expected); }
   ```
4. **API client** (API only) — add to `e2e/api/`, wrap `this.apiContext` calls for one resource.
5. **DB helper** (DB only) — add to `e2e/db/`, accept a `pool` argument and return query functions.

---

## Behavioral Guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
