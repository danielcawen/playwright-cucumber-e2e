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
