import { Before, After, AfterStep, setDefaultTimeout } from '@cucumber/cucumber'

setDefaultTimeout(20000)
import { chromium, request } from '@playwright/test'
import pg from 'pg'
import fs from 'fs'
import { BASE_URL, DB_URL, VIEWPORT_WIDTH, VIEWPORT_HEIGHT } from './env.js'

Before({ tags: '@ui' }, async function () {
  this.browser = await chromium.launch()
  this.context = await this.browser.newContext({
    recordVideo: { dir: 'reports/videos/' },
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT }
  })
  this.page = await this.context.newPage()
})

AfterStep({ tags: '@ui' }, async function ({ result }) {
  if (result?.status === 'FAILED') {
    const screenshot = await this.page?.screenshot()
    if (screenshot) await this.attach(screenshot, { mediaType: 'image/png', fileName: 'screenshot.png' })

    const video = this.page?.video()
    await this.page?.close()
    await this.context?.close()
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

Before({ tags: '@judge' }, async function () {
  this.apiContext = await request.newContext({ baseURL: BASE_URL })
})

After({ tags: '@judge' }, async function () {
  await this.apiContext?.dispose()
})
