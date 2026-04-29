# playwright-cucumber-e2e
a brief example for: ui, api, db, ai and email

Run commands:
  npx cucumber-js --profile ui    # UI only
  npx cucumber-js --profile api   # API only
  npx cucumber-js --profile db    # DB only
  npx cucumber-js                 # All layers

Environments:
  Tests default to local. Set TEST_ENV to target a different environment:

  TEST_ENV=local   npx cucumber-js --profile ui   # uses .env.local (default)
  TEST_ENV=staging npx cucumber-js --profile ui   # uses .env.staging
  TEST_ENV=prod    npx cucumber-js --profile ui   # uses .env.prod

  Env files live in config/. Copy config/.env.example to config/.env.<environment> and fill in real credentials before running against staging or prod.

Folder structure:
  e2e/
  ├── features/
  │   ├── ui/auth/login.feature          @ui tag
  │   ├── api/auth/login.feature         @api tag
  │   └── db/users/user-data.feature     @db tag
  ├── pages/
  │   └── loginPage.js                   Page Object (locators + actions)
  ├── api/
  │   └── authClient.js                  Playwright request context wrappers
  ├── db/
  │   ├── client.js                      Shared pg.Pool factory
  │   └── usersDb.js                     SQL query helpers
  ├── steps/
  │   ├── ui/loginSteps.js
  │   ├── api/authSteps.js
  │   ├── db/userSteps.js
  │   └── shared/commonSteps.js
  └── support/
      ├── env.js                         BASE_URL, FRONTEND_URL, DB_URL, MAIL_URL
      ├── world.js                       CustomWorld (browser/apiContext/db slots)
      └── hooks.js                       Tag-based Before/After per layer