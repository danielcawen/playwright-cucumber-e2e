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