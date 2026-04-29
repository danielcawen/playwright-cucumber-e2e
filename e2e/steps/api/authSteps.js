import { When, Then } from '@cucumber/cucumber'
import { authClient } from '../../api/authClient.js'

When('I POST to \\/api\\/auth\\/login with valid credentials', async function () {
  const client = authClient(this.apiContext)
  this.response = await client.login('test@example.com', 'password123')
})

When('I POST to \\/api\\/auth\\/login with invalid credentials', async function () {
  const client = authClient(this.apiContext)
  this.response = await client.login('test@example.com', 'wrongpassword')
})

Then('the response status should be {int}', async function (status) {
  if (this.response.status() !== status) {
    throw new Error(`Expected status ${status} but got ${this.response.status()}`)
  }
})

Then('the response body should contain a token', async function () {
  const body = await this.response.json()
  if (!body.token) throw new Error('Response body missing token field')
})
