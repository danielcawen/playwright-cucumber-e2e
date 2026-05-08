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
    ├── hooks.js                         Tag-based Before/After per layer
    └── world.js                         CustomWorld (browser/apiContext/db slots)
```