import { Given, When, Then } from '@cucumber/cucumber'
import { usersDb } from '../../db/usersDb.js'
import { chatDb } from '../../db/chatDb.js'

Given('the user has a conversation', async function () {
  const { rows } = await usersDb(this.db).findByEmail(this.testEmail)
  const result = await chatDb(this.db).createConversation(rows[0].id)
  this.conversationId = result.rows[0].id
})

When('a user message {string} and an AI message {string} are inserted', async function (userContent, aiContent) {
  const chat = chatDb(this.db)
  await chat.insertMessage(this.conversationId, 'user', userContent)
  await chat.insertMessage(this.conversationId, 'ai', aiContent)
})

When('the conversation is deleted', async function () {
  await chatDb(this.db).deleteConversation(this.conversationId)
})

Then('the conversation has {int} messages', async function (count) {
  const { rows } = await chatDb(this.db).getMessages(this.conversationId)
  if (rows.length !== count) throw new Error(`Expected ${count} messages but found ${rows.length}`)
})

Then('the first message has sender_type {string} and content {string}', async function (senderType, content) {
  const { rows } = await chatDb(this.db).getMessages(this.conversationId)
  const msg = rows[0]
  if (msg.sender_type !== senderType) throw new Error(`Expected sender_type "${senderType}" but got "${msg.sender_type}"`)
  if (msg.content !== content) throw new Error(`Expected content "${content}" but got "${msg.content}"`)
})

Then('the second message has sender_type {string} and content {string}', async function (senderType, content) {
  const { rows } = await chatDb(this.db).getMessages(this.conversationId)
  const msg = rows[1]
  if (msg.sender_type !== senderType) throw new Error(`Expected sender_type "${senderType}" but got "${msg.sender_type}"`)
  if (msg.content !== content) throw new Error(`Expected content "${content}" but got "${msg.content}"`)
})
