import { Given, When, Then } from '@cucumber/cucumber'
import { login, getErrorMessage } from '../../pages/loginPage.js'
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

Then('I should see an error message', async function () {
  await getErrorMessage(this.page)
})
