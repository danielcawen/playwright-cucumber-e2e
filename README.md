# playwright-cucumber-e2e
a brief example for: ui, api, db, ai and email

Run commands:
  npm run seed          # Seed the database manually (auto-runs via BeforeAll before each test run)
  npm test              # All layers
  npm run test:ui       # UI only
  npm run test:api      # API only
  npm run test:db       # DB only
  npm run test:chat     # Chat API only
  npm run test:judge    # AI response quality (requires Ollama running locally)

Rerunning failed tests:
  After any test run, failed scenarios are written to `@rerun.txt`. To rerun only those:

    npm run test:rerun

  This works across all profiles — run `test:ui`, `test:api`, `test:db`, or `test:judge`, then
  run `test:rerun` to retry only the failures. Results are saved to `reports/rerun-report.html`.

Viewport / window size (UI only):
  Pass VIEWPORT_WIDTH and VIEWPORT_HEIGHT to run at any size. Defaults to 1280×720.

    VIEWPORT_WIDTH=393 VIEWPORT_HEIGHT=852 npm run test:ui   # iPhone 14 Pro
    VIEWPORT_WIDTH=360 VIEWPORT_HEIGHT=800 npm run test:ui   # Samsung Galaxy S21

  Secrets are injected at runtime via Doppler — no .env files needed locally.
  Install the CLI and run `doppler setup` once before using the commands above:

    brew install dopplerhq/cli/doppler
    doppler login
    doppler setup   # select project: playwright-e2e, config: dev

Environments:
  Each environment maps to a Doppler config:

    dev   → local development (default)
    ci    → used by GitHub Actions
    prd   → production

  To run against a specific config:
    doppler run --config prd -- npx cucumber-js --profile ui

Dashboard:
  The dashboard is a single HTML file that aggregates results across all four
  test layers (API, DB, UI, Judge) and tracks history across runs.

  What it shows:
    - Pass / fail / skip / flaky counts overall and per layer
    - Pass rate and duration trend charts across recent runs
    - Failures & flaky count trend (stacked bar chart)
    - Slowest scenarios (top 10, colour-coded by duration)
    - Per-feature-file breakdown with inline progress bars
    - Sortable, filterable table of every scenario with click-to-expand details
      (step-by-step results, error messages, tags, flaky reason)
    - Shareable links: filters are encoded in the URL hash
    - Copy report button: exports the current filtered view as Markdown

  Generating locally:
    Run any combination of test profiles first — each one writes a JSON file
    to reports/. Then point the generator at those files:

      node dashboard/generate.js \
        --api reports/api-results.json \
        --db reports/db-results.json \
        --ui reports/ui-results.json \
        --judge reports/judge-results.json \
        --out reports/dashboard.html

    Open reports/dashboard.html in a browser. All flags except --out are
    optional — omit any layer you didn't run. History is kept in
    reports/runs.jsonl and accumulates across local runs automatically.

    To include rerun data for flaky detection, pass the rerun JSON too:

      node dashboard/generate.js \
        --api reports/api-results.json \
        --api-rerun reports/api-rerun-results.json \
        ... \
        --out reports/dashboard.html

    Note: rerun results use a different filename than the default rerun profile.
    After running npm run test:rerun, copy the file manually if needed:
      cp reports/rerun-results.json reports/<layer>-rerun-results.json

  GitHub Pages (CI):
    After the combined CI workflow (E2E All Tests) completes, the dashboard is
    automatically deployed to:

      https://danielcawen.github.io/playwright-cucumber-e2e/

    To trigger an update:
      1. Go to GitHub → Actions → E2E All Tests → Run workflow
      2. Wait for all four test layers + dashboard deploy to finish
      3. Open the URL above

    One-time setup (if not already configured):
      Repository Settings → Pages → Source → GitHub Actions

  Per-run HTML reports (no dashboard needed):
    Each test profile also writes a standalone Cucumber HTML report:
      reports/api-report.html
      reports/db-report.html
      reports/ui-report.html
      reports/judge-report.html

Folder structure:
```
e2e/
├── features/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.feature            @api tag
│   │   │   └── signup.feature           @api tag
│   │   └── chat/
│   │       └── chat.feature             @api tag
│   ├── db/
│   │   ├── auth/
│   │   │   └── signup.feature           @db tag
│   │   ├── users/
│   │   │   └── user-data.feature        @db tag
│   │   └── chat/
│   │       └── chat.feature             @db tag
│   ├── judge/
│   │   └── chat.feature                 @judge tag
│   └── ui/
│       ├── auth/
│       │   ├── login.feature            @ui tag
│       │   └── signup.feature           @ui tag
│       └── chat/
│           └── chat.feature             @ui tag
├── pages/
│   ├── loginPage.js                     Locators + action helpers (UI only)
│   ├── signupPage.js                    Locators + action helpers for signup UI
│   └── chatPage.js                      Locators + action helpers for chat UI
├── api/
│   ├── authClient.js                    Playwright request context wrappers
│   ├── chatClient.js                    Chat API wrappers (requires auth token)
│   └── judgeClient.js                   Calls Ollama directly to score AI responses
├── db/
│   ├── client.js                        Shared pg.Pool factory
│   ├── seed.js                          Seed script; auto-runs via BeforeAll, callable manually via npm run seed
│   ├── usersDb.js                       SQL query helpers for users
│   └── chatDb.js                        SQL query helpers for conversations/messages
├── steps/
│   ├── api/
│   │   ├── authSteps.js
│   │   └── chatSteps.js
│   ├── judge/
│   │   └── chatJudgeSteps.js
│   ├── db/
│   │   ├── userSteps.js
│   │   ├── signupSteps.js
│   │   └── chatSteps.js
│   ├── shared/
│   │   └── commonSteps.js
│   └── ui/
│       ├── loginSteps.js
│       ├── signupSteps.js
│       └── chatSteps.js
└── support/
    ├── env.js                           BASE_URL, FRONTEND_URL, DB_URL, MAIL_URL,
    │                                    LLM_API_KEY, LLM_BASE_URL, LLM_MODEL,
    │                                    VIEWPORT_WIDTH, VIEWPORT_HEIGHT
    ├── hooks.js                         BeforeAll seed + tag-based Before/After per layer
    └── world.js                         CustomWorld (browser/apiContext/db slots)
```