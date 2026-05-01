# playwright-cucumber-e2e
a brief example for: ui, api, db, ai and email

Run commands:
  npm run seed          # Seed the database (run once before tests)
  npm test              # All layers
  npm run test:ui       # UI only
  npm run test:api      # API only
  npm run test:db       # DB only
  npm run test:chat     # Chat API only
  npm run test:judge    # AI response quality (requires Ollama running locally)

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

Folder structure:
```
e2e/
├── features/
│   ├── api/
│   │   ├── auth/
│   │   │   └── login.feature            @api tag
│   │   └── chat/
│   │       └── chat.feature             @api tag
│   ├── db/
│   │   ├── users/
│   │   │   └── user-data.feature        @db tag
│   │   └── chat/
│   │       └── chat.feature             @db tag
│   ├── judge/
│   │   └── chat.feature                 @judge tag
│   └── ui/
│       ├── auth/
│       │   └── login.feature            @ui tag
│       └── chat/
│           └── chat.feature             @ui tag
├── pages/
│   ├── loginPage.js                     Locators + action helpers (UI only)
│   └── chatPage.js                      Locators + action helpers for chat UI
├── api/
│   ├── authClient.js                    Playwright request context wrappers
│   ├── chatClient.js                    Chat API wrappers (requires auth token)
│   └── judgeClient.js                   Calls Ollama directly to score AI responses
├── db/
│   ├── client.js                        Shared pg.Pool factory
│   ├── seed.js                          One-off seed script (npm run seed)
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
│   │   └── chatSteps.js
│   ├── shared/
│   │   └── commonSteps.js
│   └── ui/
│       ├── loginSteps.js
│       └── chatSteps.js
└── support/
    ├── env.js                           BASE_URL, FRONTEND_URL, DB_URL, MAIL_URL
    ├── hooks.js                         Tag-based Before/After per layer
    └── world.js                         CustomWorld (browser/apiContext/db slots)
```