import { Given, Then } from '@cucumber/cucumber'
import { usersDb } from '../../db/usersDb.js'

Given('a user was created via signup with email {string}', async function (email) {
  const db = usersDb(this.db)
  await db.deleteByEmail(email)
  await db.createUnverified(email)
  const result = await db.findByEmail(email)
  this.queryResult = result.rows
})

Given('a user was verified with email {string}', async function (email) {
  const db = usersDb(this.db)
  await db.deleteByEmail(email)
  await db.create(email)
  const result = await db.findByEmail(email)
  this.queryResult = result.rows
})

Then('the user should not be verified', async function () {
  const user = this.queryResult[0]
  if (user.is_verified) throw new Error('Expected user to not be verified, but is_verified is true')
})

Then('the user should be verified', async function () {
  const user = this.queryResult[0]
  if (!user.is_verified) throw new Error('Expected user to be verified, but is_verified is false')
})

Then('a verification token should be set for the user', async function () {
  const user = this.queryResult[0]
  if (!user.magic_token) throw new Error('Expected magic_token to be set but it is null')
})

Then('the verification token should be cleared', async function () {
  const user = this.queryResult[0]
  if (user.magic_token) throw new Error('Expected magic_token to be null but it is set')
})
