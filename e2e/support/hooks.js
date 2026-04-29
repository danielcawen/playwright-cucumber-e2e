import { Before, After, setDefaultTimeout } from '@cucumber/cucumber'

setDefaultTimeout(20000)
import { chromium, request } from '@playwright/test'
import pg from 'pg'
import { BASE_URL, DB_URL } from './env.js'

Before({ tags: '@ui' }, async function () {
  this.browser = await chromium.launch()
  this.page = await this.browser.newPage()
})

After({ tags: '@ui' }, async function () {
  await this.page?.close()
  await this.browser?.close()
})

Before({ tags: '@api' }, async function () {
  this.apiContext = await request.newContext({ baseURL: BASE_URL })
})

After({ tags: '@api' }, async function () {
  await this.apiContext?.dispose()
})

Before({ tags: '@db' }, async function () {
  this.db = new pg.Pool({ connectionString: DB_URL })
})

After({ tags: '@db' }, async function () {
  await this.db?.end()
})
