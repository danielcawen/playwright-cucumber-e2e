import { When, Then } from '@cucumber/cucumber'
import { request } from '@playwright/test'
import { signup, verifyConfirmationMessage } from '../../pages/signupPage.js'
import { MAIL_URL } from '../../support/env.js'

When('I sign up via UI with a unique email, first name {string}, last name {string}, and password {string}', async function (firstName, lastName, password) {
  this.signupEmail = `testuser+${Date.now()}@example.com`
  await signup(this.page, this.signupEmail, firstName, lastName, password)
})

When('I attempt signup with email {string}, first name {string}, last name {string}, password {string}, and confirm password {string}', async function (email, firstName, lastName, password, confirmPassword) {
  await signup(this.page, email, firstName, lastName, password, confirmPassword)
})

Then('I should see a signup confirmation message', async function () {
  await verifyConfirmationMessage(this.page)
})

Then('I receive a verification email', async function () {
  const mailContext = await request.newContext({ baseURL: MAIL_URL })
  let emailBody

  for (let i = 0; i < 10; i++) {
    const res = await mailContext.get('/api/v1/messages')
    const messages = await res.json()
    const match = (Array.isArray(messages) ? messages : []).find(m =>
      m.To?.some(t => `${t.Mailbox}@${t.Domain}` === this.signupEmail)
    )
    if (match) { emailBody = match.Content?.Body; break }
    await new Promise(r => setTimeout(r, 1000))
  }

  await mailContext.dispose()
  if (!emailBody) throw new Error(`No verification email received for ${this.signupEmail}`)
  const decoded = emailBody
    .replace(/=\r\n/g, '')
    .replace(/=\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
  const urlMatch = decoded.match(/https?:\/\/[^\s"'<>]+\/auth\/verify\?token=[^\s"'<>]+/)
  if (!urlMatch) throw new Error('Verification link not found in email body')
  this.verificationLink = urlMatch[0]
})

When('I click the verification link from the email', async function () {
  await this.page.goto(this.verificationLink)
})
