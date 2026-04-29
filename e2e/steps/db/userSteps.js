import { Given, When, Then } from '@cucumber/cucumber'
import { usersDb } from '../../db/usersDb.js'

Given('a user has registered with email {string}', async function (email) {
  this.testEmail = email
})

Given('a user exists with email {string}', async function (email) {
  this.testEmail = email
})

When('I query the users table for {string}', async function (email) {
  const db = usersDb(this.db)
  const result = await db.findByEmail(email)
  this.queryResult = result.rows
})

When('the user is deleted', async function () {
  const db = usersDb(this.db)
  await db.deleteByEmail(this.testEmail)
})

Then('the user record should exist', async function () {
  if (this.queryResult.length === 0) throw new Error('User not found in database')
})

Then('the password should be hashed', async function () {
  const user = this.queryResult[0]
  if (!user.password.startsWith('$2')) throw new Error('Password is not bcrypt-hashed')
})

Then('the user record should not exist in the database', async function () {
  const db = usersDb(this.db)
  const result = await db.findByEmail(this.testEmail)
  if (result.rows.length > 0) throw new Error('User still exists after deletion')
})
