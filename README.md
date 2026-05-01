# playwright-cucumber-e2e
a brief example for: ui, api, db, ai and email

Run commands:
  npm test              # All layers
  npm run test:ui       # UI only
  npm run test:api      # API only
  npm run test:db       # DB only
  npm run seed          # Seed the database

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
│   │   └── auth/
│   │       └── login.feature            @api tag
│   ├── db/
│   │   └── users/
│   │       └── user-data.feature        @db tag
│   └── ui/
│       └── auth/
│           └── login.feature            @ui tag
├── pages/
│   └── loginPage.js                     Locators + action helpers (UI only)
├── api/
│   └── authClient.js                    Playwright request context wrappers
├── db/
│   ├── client.js                        Shared pg.Pool factory
│   ├── seed.js                          One-off seed script (npm run seed)
│   └── usersDb.js                       SQL query helpers
├── steps/
│   ├── api/
│   │   └── authSteps.js
│   ├── db/
│   │   └── userSteps.js
│   ├── shared/
│   │   └── commonSteps.js
│   └── ui/
│       └── loginSteps.js
└── support/
    ├── env.js                           BASE_URL, FRONTEND_URL, DB_URL, MAIL_URL
    ├── hooks.js                         Tag-based Before/After per layer
    └── world.js                         CustomWorld (browser/apiContext/db slots)
```