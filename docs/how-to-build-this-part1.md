# How I Test the Same Feature Three Ways: UI, API, and DB

**Tags:** `testing` · `playwright` · `cucumber` · `javascript` · `end-to-end-testing` · `bdd` · `test-automation` · `postgresql`

---

## Table of contents

- [The problem with testing one layer at a time](#the-problem-with-testing-one-layer-at-a-time)
- [About the app](#about-the-app)
- [Getting started](#getting-started)
- [Cucumber support files](#cucumber-support-files)
- [Layer 1: UI](#layer-1-ui)
- [Layer 2: API](#layer-2-api)
- [Layer 3: DB](#layer-3-db)
- [Going further](#going-further)
- [CI/CD with GitHub Actions](#cicd-with-github-actions)

---

## The problem with testing one layer at a time

Most tutorials test a feature once — usually at the UI layer. That's fine until something breaks and you spend 30 minutes figuring out whether the browser interaction failed, the API returned an unexpected shape, or a database row was never written.

The approach in this guide covers the same feature from three angles: UI, API, and DB. The UI test confirms what the user sees. The API test validates the server contract. The DB test checks that the right data landed in the right place. When something fails, the failure is isolated. Together the three tests give you more confidence than any single layer alone.

By the end of this article you'll have a working Cucumber BDD suite with all three layers for a login feature: a Playwright browser test that fills out a form, an HTTP test that validates the JWT response, and a PostgreSQL query that confirms the user row exists. Each layer reuses the same infrastructure — one world object, one hooks file, one config. Adding a new feature area later is a checklist, not a rewrite.

> This is not the only way to structure e2e tests. It's one approach that has been easy to understand, explain, and maintain. Part 2 extends this foundation with chat flows, AI quality scoring, and email verification.

```mermaid
graph LR
  CW["CustomWorld (shared state)"]

  UI["@ui test"] --> Chromium --> Frontend --> Backend
  API["@api test"] -->|HTTP| Backend
  DB["@db test"] -->|pg query| PostgreSQL

  UI -.-> CW
  API -.-> CW
  DB -.-> CW
```

---

## About the app

The tests in this project run against **[app-for-e2e](https://github.com/danielcawen/app-for-e2e)** — a full-stack practice app built specifically for this example. To run the tests locally, follow the setup steps in that repository's README to get the app running before executing any test commands.

---

## Getting started

### What you should already know

This guide assumes familiarity with **async/await**, **ES modules** (`import`/`export`), and basic Node.js. The table below links to the specific docs you'll be reading from most.

| Topic | Resource |
|-------|----------|
| **Cucumber JS** | [Cucumber JS docs](https://github.com/cucumber/cucumber-js/blob/main/docs/support_files/api_reference.md) — step definitions, hooks, world, and profiles |
| **Playwright** | [Playwright docs](https://playwright.dev/docs/intro) — browser automation, locators, assertions, and the request API |
| **REST API** | [MDN HTTP docs](https://developer.mozilla.org/en-US/docs/Web/HTTP) — HTTP methods, status codes, and headers |
| **node-postgres (pg)** | [node-postgres docs](https://node-postgres.com/) — connecting, querying, and pooling with PostgreSQL from Node.js |
| **PostgreSQL** | [PostgreSQL docs](https://www.postgresql.org/docs/current/) — SQL reference, data types, and query syntax |

### Install

```bash
npm i -D @playwright/test @cucumber/cucumber dotenv prettier
npx playwright install
```

| Package | Why |
|---------|-----|
| `@playwright/test` | Browser automation (UI layer) and HTTP request client (API layer) |
| `@cucumber/cucumber` | BDD runner — parses `.feature` files and maps Gherkin steps to JS functions |
| `dotenv` | Loads `.env.*` files into `process.env` so env vars work locally without a secrets manager |
| `prettier` | Code formatter — no functional role, just keeps the codebase consistent |

`npx playwright install` downloads the Chromium browser binary that Playwright drives.

**Node.js 18 or later is required.** The seed script uses top-level `await`, which needs at minimum Node 14.8; Node 18 LTS is recommended.

> `pg` and `bcryptjs` are added in Layer 3 when the DB layer is introduced.

**Important:** add `"type": "module"` to `package.json`. This tells Node to treat every `.js` file as an ES module, which lets you use `import`/`export` syntax throughout. Without it, you'd need `.mjs` extensions or `require()` calls everywhere.

### Project config

`.gitignore`:

```
node_modules
.env.*
```

`config/.env.local`:

```
BASE_URL=http://localhost:3001
FRONTEND_URL=http://localhost:5173
```

These defaults point at the local Docker stack. The `TEST_ENV` variable (explained in the next section) controls which file is loaded, so running against a staging environment is just `TEST_ENV=staging npx cucumber-js`.

### Folder structure

Start with only what Layer 1 (UI) needs:

```
root-folder/
├── e2e/
│   ├── features/
│   │   └── ui/auth/login.feature
│   ├── steps/
│   │   └── ui/loginSteps.js
│   ├── pages/
│   │   └── loginPage.js
│   └── support/
│       ├── env.js
│       ├── hooks.js
│       └── world.js
├── config/
│   └── .env.local
├── cucumber.json
├── package.json
└── .gitignore
```

### package.json

```json
{
  "name": "your-project-name",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test":    "npx cucumber-js",
    "test:ui": "npx cucumber-js --profile ui"
  },
  "devDependencies": { ... }
}
```

### cucumber.json

Start with `default` and `ui` only. Profiles are added as new layers are introduced.

```json
{
  "default": {
    "require": ["e2e/steps/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/**/*.feature"],
    "parallel": 0,
    "format": ["progress", "html:reports/cucumber-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  },
  "ui": {
    "require": ["e2e/steps/ui/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/ui/**/*.feature"],
    "parallel": 0,
    "format": ["progress", "html:reports/ui-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  }
}
```

Each profile scopes both `paths` (which feature files to run) and `require` (which step files to load). This prevents step definitions from different layers being accidentally shared — for example, a DB step with the same wording as an API step won't conflict because they're never loaded together.

`snippetInterface: "async-await"` tells Cucumber to generate `async function` snippets when it prints undefined step stubs, matching the style used throughout this project.

---

## Cucumber support files

These three files are the backbone of every layer. They're written once and never change shape — you just add to them as new layers appear.

### e2e/support/env.js

Loads from `config/.env.{TEST_ENV}`. Defaults to `local`.

```js
import dotenv from 'dotenv'

const env = process.env.TEST_ENV ?? 'local'
dotenv.config({ path: `config/.env.${env}` })

export const BASE_URL     = process.env.BASE_URL
export const FRONTEND_URL = process.env.FRONTEND_URL
```

To run against a different environment:

```bash
TEST_ENV=staging npx cucumber-js --profile ui
```

### e2e/support/world.js

`CustomWorld` is the shared state container for each scenario. Cucumber creates a fresh instance before every scenario and discards it afterwards, so state never leaks between tests. Steps access infrastructure and transient data through `this` (e.g. `this.page`, `this.response`).

Fields are initialised to `null` in the constructor so it's always clear what state exists — any field left `null` at the end of a scenario means a step that was supposed to set it didn't run.

```js
import { setWorldConstructor } from '@cucumber/cucumber'

class CustomWorld {
  constructor({ attach, parameters }) {
    this.attach = attach
    this.parameters = parameters

    this.browser = null
    this.page = null
  }
}

setWorldConstructor(CustomWorld)
```

### e2e/support/hooks.js

```js
import { Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from '@playwright/test'

setDefaultTimeout(20000)

Before({ tags: '@ui' }, async function () {
  this.browser = await chromium.launch()
  this.page = await this.browser.newPage()
})

After({ tags: '@ui' }, async function () {
  await this.page?.close()
  await this.browser?.close()
})
```

> Rule: adding a new layer = adding one Before + one After block here, nothing else changes.

---

## Layer 1: UI

Start with what users experience. The UI test drives a real Chromium browser, fills in the login form, clicks submit, and confirms the redirect. If this test fails, something broke at the level users can actually feel.

> **Prerequisite for all layers:** The `app-for-e2e` backend must be running at `BASE_URL` (default: `http://localhost:3001`) and the frontend at `FRONTEND_URL` (default: `http://localhost:5173`) before running any tests.

### e2e/features/ui/auth/login.feature

```gherkin
@ui
Feature: Login via UI

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I log in with email "testuser@example.com" and password "Password123!"
    Then I should be redirected to the chat page
```

### e2e/pages/loginPage.js

Locators are module-level constants. Each action is a named async export — no classes.

```js
const usernameInputLocator = '[data-testid="email-input"]'
const passwordInputLocator = '[data-testid="password-input"]'
const submitButtonLocator  = '[data-testid="submit-button"]'

export async function login(page, username, password) {
  const usernameInput = page.locator(usernameInputLocator)
  await usernameInput.waitFor()
  await usernameInput.fill(username)

  const passwordInput = page.locator(passwordInputLocator)
  await passwordInput.waitFor()
  await passwordInput.fill(password)

  const submitButton = page.locator(submitButtonLocator)
  await submitButton.waitFor()
  await submitButton.click()
}
```

### e2e/steps/ui/loginSteps.js

```js
import { Given, When, Then } from '@cucumber/cucumber'
import { login } from '../../pages/loginPage.js'
import { FRONTEND_URL } from '../../support/env.js'

Given('I am on the login page', async function () {
  await this.page.goto(`${FRONTEND_URL}/login`)
})

When('I log in with email {string} and password {string}', async function (email, password) {
  await login(this.page, email, password)
})

Then('I should be redirected to the chat page', async function () {
  await this.page.waitForURL(`${FRONTEND_URL}/chat`, { timeout: 5000 })
})
```

> **Before running:** The DB layer (Layer 3) must be complete, as `hooks.js` seeds the database automatically via `BeforeAll` before any scenario runs.

Run it:

```bash
npx cucumber-js --profile ui
```

---

## Layer 2: API

The UI test confirms the form works. But it says nothing about *what the server returned* — the status code, the token structure, or the shape of the user object. The API layer tests the HTTP contract directly. If the frontend ever changes how it calls the API, this test catches the mismatch before users do.

No new packages needed — `@playwright/test` already includes the request API client.

### Folder additions

```
e2e/
├── features/
│   └── api/auth/login.feature      ← new
├── api/
│   └── authClient.js               ← new
└── steps/
    ├── api/authSteps.js            ← new
    └── shared/                     ← new (steps shared across layers)
```

### Update package.json

Add:

```json
"test:api": "npx cucumber-js --profile api"
```

### Update cucumber.json

Add the `api` profile. Also add `shared` steps to `ui` now that the shared folder exists:

```json
{
  "default": {
    "require": ["e2e/steps/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/**/*.feature"],
    "parallel": 0,
    "format": ["progress", "html:reports/cucumber-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  },
  "ui": {
    "require": ["e2e/steps/ui/**/*.js", "e2e/steps/shared/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/ui/**/*.feature"],
    "parallel": 0,
    "format": ["progress", "html:reports/ui-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  },
  "api": {
    "require": ["e2e/steps/api/**/*.js", "e2e/steps/shared/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/api/**/*.feature"],
    "parallel": 2,
    "format": ["progress", "html:reports/api-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  }
}
```

> `parallel: 2` for the API profile — API scenarios are stateless HTTP calls, so two workers can run simultaneously without interfering. UI scenarios are serial (`parallel: 0`) because each one launches a real browser, and DB scenarios are serial to avoid concurrent transactions hitting the same rows.

### Update e2e/support/world.js

Add to the `CustomWorld` constructor:

```js
this.apiContext = null
this.response = null
this.lastEmail = null
this.token = null
```

### Update e2e/support/hooks.js

Add the import and the `@api` Before/After pair:

```js
import { request } from '@playwright/test'
import { BASE_URL } from './env.js'

// ...existing @ui hooks above...

Before({ tags: '@api' }, async function () {
  this.apiContext = await request.newContext({ baseURL: BASE_URL })
})

After({ tags: '@api' }, async function () {
  await this.apiContext?.dispose()
})
```

### e2e/api/authClient.js

Thin wrapper around `apiContext` for one resource.

```js
export const authClient = (apiContext) => ({
  login: (email, password) =>
    apiContext.post('/api/auth/login', { data: { email, password } }),
})
```

### e2e/features/api/auth/login.feature

```gherkin
@api
Feature: Login via API

  Scenario: Successful login returns a token and user
    When I log in via API with email "testuser@example.com" and password "Password123!"
    Then the response status should be 200
    And the response body should contain a token
    And the response body should contain user details
```

### e2e/steps/api/authSteps.js

```js
import { When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { authClient } from '../../api/authClient.js'

When('I log in via API with email {string} and password {string}', async function (email, password) {
  this.lastEmail = email
  this.response = await authClient(this.apiContext).login(email, password)
})

Then('the response status should be {int}', async function (status) {
  expect(this.response.status()).toBe(status)
})

Then('the response body should contain a token', async function () {
  const body = await this.response.json()
  expect(typeof body.data.token).toBe('string')
  expect(body.data.token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
})

Then('the response body should contain user details', async function () {
  const body = await this.response.json()
  const user = body.data.user
  expect(user).toMatchObject({
    id: expect.any(Number),
    email: this.lastEmail,
    is_verified: expect.any(Boolean),
  })
  expect(user).toHaveProperty('first_name')
  expect(user).toHaveProperty('last_name')
})
```

Run it:

```bash
npx cucumber-js --profile api
```

---

## Layer 3: DB

The API test confirms the server responds correctly to valid credentials. But it says nothing about what's actually in the database. The DB layer queries PostgreSQL directly — no browser, no HTTP — and checks that the right rows exist with the right values. This is especially useful for testing writes: registrations, updates, deletes. The API can return 201 and still have written bad data.

### Install

```bash
npm i -D pg bcryptjs
```

| Package | Why |
|---------|-----|
| `pg` | Official PostgreSQL client for Node.js — used in `hooks.js` (per-scenario pool and BeforeAll seed) and in `seed.js` (standalone script) |
| `bcryptjs` | Hashes passwords using the bcrypt algorithm. The seed script uses it to create a test user with a properly hashed password, matching what the real app would store |

### Folder additions

```
e2e/
├── features/
│   └── db/users/user-data.feature  ← new
├── db/
│   ├── client.js                   ← new
│   ├── usersDb.js                  ← new
│   └── seed.js                     ← new
└── steps/
    └── db/userSteps.js             ← new
```

Naming conventions:
- Feature files → kebab-case (`user-data.feature`) — reads like documentation
- JS files → camelCase (`userSteps.js`, `usersDb.js`) — standard JS

### Update config/.env.local

Add:

```
DB_URL=postgresql://postgres:postgres@localhost:5432/e2e_practice
```

### Update e2e/support/env.js

Add:

```js
export const DB_URL = process.env.DB_URL
```

### Update package.json

Add:

```json
"test:db": "npx cucumber-js --profile db"
```

### Update cucumber.json

Add the `db` profile:

```json
{
  "default": { ... },
  "ui": { ... },
  "api": { ... },
  "db": {
    "require": ["e2e/steps/db/**/*.js", "e2e/steps/shared/**/*.js", "e2e/support/**/*.js"],
    "paths": ["e2e/features/db/**/*.feature"],
    "parallel": 0,
    "format": ["progress", "html:reports/db-report.html"],
    "formatOptions": { "snippetInterface": "async-await" }
  }
}
```

### Update e2e/support/world.js

Add to the `CustomWorld` constructor:

```js
this.db = null
this.testEmail = null
this.queryResult = null
```

### Update e2e/support/hooks.js

Add the import and the `@db` Before/After pair:

```js
import pg from 'pg'
import { DB_URL } from './env.js'

// ...existing hooks above...

Before({ tags: '@db' }, async function () {
  this.db = new pg.Pool({ connectionString: DB_URL })
})

After({ tags: '@db' }, async function () {
  await this.db?.end()
})
```

### e2e/db/client.js

```js
import pg from 'pg'
import { DB_URL } from '../support/env.js'

export const createPool = () => new pg.Pool({ connectionString: DB_URL })
```

### e2e/db/usersDb.js

The `create` helper inserts a user directly into the DB for DB-layer tests. It uses a fake `$2b$10$placeholder` hash — valid bcrypt format so the column constraint passes, but this user is never logged in through the UI or API. For the test user that needs to actually authenticate (UI/API tests), use `seed.js` instead, which generates a real hash.

```js
export const usersDb = (pool) => ({
  findByEmail: (email) =>
    pool.query('SELECT * FROM users WHERE email = $1', [email]),

  deleteByEmail: (email) =>
    pool.query('DELETE FROM users WHERE email = $1', [email]),

  create: (email) =>
    pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, '$2b$10$placeholder', 'Test', 'User', true]
    ),
})
```

### e2e/features/db/users/user-data.feature

```gherkin
@db
Feature: User data in database

  Scenario: Registered user exists in users table
    Given a user has registered with email "test@example.com"
    When I query the users table for "test@example.com"
    Then the user record should exist
    And the password should be hashed
```

### e2e/steps/db/userSteps.js

```js
import { Given, When, Then } from '@cucumber/cucumber'
import { usersDb } from '../../db/usersDb.js'

Given('a user has registered with email {string}', async function (email) {
  const db = usersDb(this.db)
  await db.deleteByEmail(email)
  await db.create(email)
  this.testEmail = email
})

When('I query the users table for {string}', async function (email) {
  const db = usersDb(this.db)
  const result = await db.findByEmail(email)
  this.queryResult = result.rows
})

Then('the user record should exist', async function () {
  if (this.queryResult.length === 0) throw new Error('User not found in database')
})

Then('the password should be hashed', async function () {
  const user = this.queryResult[0]
  if (!user.password_hash.startsWith('$2')) throw new Error('Password is not bcrypt-hashed')
})
```

### e2e/db/seed.js

Upserts all test users before each test run. Called automatically by the `BeforeAll` hook in `hooks.js` — no manual step needed.

The seed uses `ON CONFLICT DO UPDATE` so existing users with a stale password hash are corrected on every run. The password is hashed with bcrypt (cost factor 10) so the stored hash matches exactly what the real app produces during registration. This means UI and API login tests work against a real hash, not a placeholder.

```js
import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import { createPool } from './client.js'

const PASSWORD = 'Password123!'
const USERS = [
  { email: 'testuser@example.com', firstName: 'Test', lastName: 'User' },
  { email: 'api-testuser@example.com', firstName: 'Api', lastName: 'User' },
  { email: 'ui-testuser@example.com', firstName: 'Ui', lastName: 'User' },
  { email: 'api-signup-existing@example.com', firstName: 'Existing', lastName: 'User' },
]

export async function seed(pool) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  for (const { email, firstName, lastName } of USERS) {
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, passwordHash, firstName, lastName, true]
    )
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  ;(async () => {
    const pool = createPool()
    await seed(pool)
    await pool.end()
    console.log('Seed complete')
  })()
}
```

Run DB tests (seed runs automatically via BeforeAll):

```bash
npx cucumber-js --profile db
```

To seed manually:

```bash
node e2e/db/seed.js
```

### Update e2e/support/hooks.js

Add `BeforeAll` to seed the database automatically before any scenario runs:

```js
import { BeforeAll, Before, After, setDefaultTimeout } from '@cucumber/cucumber'
import { seed } from '../db/seed.js'
import { createPool } from '../db/client.js'

BeforeAll(async function () {
  const pool = createPool()
  await seed(pool)
  await pool.end()
})
```

> `BeforeAll` runs once per test run, before any `Before` hooks fire. Placing it here means every profile (ui, api, db) gets fresh seed data without any manual step.

---

## Going further

### Secrets with Doppler (optional)

Once you have multiple scripts and want to manage secrets centrally rather than via `.env` files, Doppler is a clean option.

```bash
brew install dopplerhq/cli/doppler
doppler login
doppler setup   # select your project and config (e.g. dev)
```

Update `package.json` scripts to inject secrets via `doppler run --`:

```json
{
  "scripts": {
    "seed":      "doppler run -- node e2e/db/seed.js",
    "test":      "doppler run -- npx cucumber-js",
    "test:ui":   "doppler run -- npx cucumber-js --profile ui",
    "test:api":  "doppler run -- npx cucumber-js --profile api",
    "test:db":   "doppler run -- npx cucumber-js --profile db"
  }
}
```

Without Doppler, keep running directly — the `.env.local` file and `env.js` still work.

### Screenshots and video in reports

On failure, Playwright can capture a screenshot and a video of the browser session and embed them directly in the HTML report on the failing step.

Three changes from the basic UI hooks: import `AfterStep` and `fs`, pass `recordVideo` when creating the context, and add an `AfterStep` hook that fires after the failing step.

```js
import { Before, After, AfterStep, setDefaultTimeout } from '@cucumber/cucumber'
import { chromium } from '@playwright/test'
import fs from 'fs'

setDefaultTimeout(20000)

Before({ tags: '@ui' }, async function () {
  this.browser = await chromium.launch()
  this.context = await this.browser.newContext({
    recordVideo: { dir: 'reports/videos/' }
  })
  this.page = await this.context.newPage()
})

AfterStep({ tags: '@ui' }, async function ({ result }) {
  if (result?.status === 'FAILED') {
    const screenshot = await this.page?.screenshot()
    if (screenshot) await this.attach(screenshot, { mediaType: 'image/png', fileName: 'screenshot.png' })

    const video = this.page?.video()
    await this.page?.close()
    await this.context?.close()   // finalises the video file
    this._uiTornDown = true

    if (video) {
      const videoPath = await video.path()
      if (videoPath) {
        await this.attach(fs.readFileSync(videoPath), { mediaType: 'video/webm', fileName: 'video.webm' })
        fs.unlinkSync(videoPath)
      }
    }
  }
})

After({ tags: '@ui' }, async function () {
  if (this._uiTornDown) {
    await this.browser?.close()
    return
  }

  const video = this.page?.video()
  await this.page?.close()
  await this.context?.close()

  if (video) {
    const videoPath = await video.path()
    if (videoPath) fs.unlinkSync(videoPath)
  }

  await this.browser?.close()
})
```

**Why `AfterStep` and not `After`**: The `After` hook always passes — Cucumber renders it as a collapsed green row in the report. Attachments inside it are hidden. `AfterStep` fires immediately after the failing step, so both files appear directly on that step where the failure is already visible.

Add to `.gitignore`:

```
reports/videos/
```

### Viewport / window size

By default the browser opens at 1280×720. Pass `VIEWPORT_WIDTH` and `VIEWPORT_HEIGHT` as environment variables to run UI tests at any size without changing any code.

Add to `e2e/support/env.js`:

```js
export const VIEWPORT_WIDTH = process.env.VIEWPORT_WIDTH ? parseInt(process.env.VIEWPORT_WIDTH) : 1280
export const VIEWPORT_HEIGHT = process.env.VIEWPORT_HEIGHT ? parseInt(process.env.VIEWPORT_HEIGHT) : 720
```

Import the two new exports and pass `viewport` to `newContext` in `hooks.js`:

```js
import { BASE_URL, DB_URL, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './env.js'

Before({ tags: '@ui' }, async function () {
  this.browser = await chromium.launch()
  this.context = await this.browser.newContext({
    recordVideo: { dir: 'reports/videos/' },
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }
  })
  this.page = await this.context.newPage()
})
```

Usage:

```bash
# desktop — default, no variables needed
npx cucumber-js --profile ui

# iPhone 14 Pro
VIEWPORT_WIDTH=393 VIEWPORT_HEIGHT=852 npx cucumber-js --profile ui

# Samsung Galaxy S21
VIEWPORT_WIDTH=360 VIEWPORT_HEIGHT=800 npx cucumber-js --profile ui
```

### How to add a new feature area

This is the repeatable pattern for adding a new domain (e.g. "settings", "notifications"):

```
1. Feature file  →  e2e/features/{ui|api|db}/settings/settings.feature
                    Add the matching tag: @ui, @api, or @db

2. Page module   →  e2e/pages/settingsPage.js          (UI only)
   API client    →  e2e/api/settingsClient.js           (API only)
   DB helper     →  e2e/db/settingsDb.js                (DB only)

3. Steps file    →  e2e/steps/{ui|api|db}/settingsSteps.js
                    Import from page/api/db helper and call via:
                      this.page        (UI)
                      this.apiContext  (API)
                      this.db          (DB)

4. Shared state  →  If new scenario-level variables are needed,
                    add null slots to world.js constructor.

5. Run it        →  npx cucumber-js e2e/features/api/settings/settings.feature
```

What you do **not** need to change: `hooks.js` (the existing tag-based hooks handle any new feature automatically), `cucumber.json` (existing profile globs pick up new files), and `env.js` (only if the new feature needs a new environment variable).

---

## CI/CD with GitHub Actions

GitHub Actions runs your tests automatically on every push or pull request. The workflow file lives at `.github/workflows/e2e-tests.yml`.

```yaml
name: E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: e2e_practice
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    env:
      BASE_URL: ${{ secrets.BASE_URL }}
      FRONTEND_URL: ${{ secrets.FRONTEND_URL }}
      DB_URL: postgresql://postgres:postgres@localhost:5432/e2e_practice

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - run: npm ci

      - run: npx playwright install --with-deps chromium

      - run: npx cucumber-js --profile api

      - run: npx cucumber-js --profile db

      - run: npx cucumber-js --profile ui

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: reports
          path: reports/
```

| Piece | Why |
|-------|-----|
| `services.postgres` | Runs a real Postgres container so DB tests have a database to connect to |
| `BASE_URL` / `FRONTEND_URL` secrets | Point at your deployed app — set these under **Settings → Secrets → Actions** in GitHub |
| `DB_URL` | Hardcoded to the local service container; no secret needed |
| `npx playwright install --with-deps chromium` | Downloads Chromium and its OS-level dependencies on the runner |
| `upload-artifact` | Saves HTML reports so you can inspect failures without re-running locally |

> `BASE_URL` and `FRONTEND_URL` must point at a live backend and frontend. If you don't have a deployed environment yet, skip the `ui` step and only run `api` and `db` until the app is deployed somewhere CI can reach.

---

## Running tests

```bash
npm run test          # all layers (via Doppler)
npm run test:ui       # UI only
npm run test:api      # API only
npm run test:db       # DB only

# without Doppler (direct):
npx cucumber-js --profile ui
npx cucumber-js --profile api

# single feature file:
npx cucumber-js e2e/features/api/auth/login.feature

# single scenario by name:
npx cucumber-js --name "Successful login"

# seed runs automatically via BeforeAll — to seed manually:
node e2e/db/seed.js
```

Reports are written to `reports/` as HTML after each run.

---

## Final thoughts

After setting this up across several projects, the principle I keep coming back to is: test at the right layer. The DB layer is for data integrity, the API layer is for business logic and contracts, and the UI layer is only for what genuinely requires a browser. Avoid duplicating the same assertion across all three layers — pick the one where the failure signal is clearest.

A few more principles worth carrying forward:

- **Keep infrastructure in hooks, not steps.** Steps should describe behaviour, not manage connections. The `Before`/`After` pattern in `hooks.js` means every new feature area gets setup and teardown for free.
- **Seed data is part of the test suite.** A test that depends on manually created data is fragile. Treat `seed.js` and the `usersDb` helpers as first-class code.
- **CI is the source of truth.** A test that only passes locally isn't a passing test. The GitHub Actions workflow is the canonical run; everything else is development convenience.

Part 2 extends this foundation with multi-layer chat tests, AI response quality scoring via a local LLM, and signup with email verification through MailHog — all using the same world, the same hooks, and the same patterns introduced here.

---

*Daniel Cawen - SDET. The full project is at https://github.com/danielcawen/playwright-cucumber-e2e.*
