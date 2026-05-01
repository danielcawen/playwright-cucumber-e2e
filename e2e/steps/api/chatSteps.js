import { Given, When, Then } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { authClient } from '../../api/authClient.js'
import { chatClient } from '../../api/chatClient.js'

Given('I am logged in as {string} with password {string}', async function (email, password) {
  const response = await authClient(this.apiContext).login(email, password)
  const body = await response.json()
  if (response.status() !== 200) throw new Error(`Login failed (${response.status()}): ${JSON.stringify(body)}`)
  this.token = body.data.token
})

Given('I have an active conversation', async function () {
  const response = await chatClient(this.apiContext, this.token).createConversation()
  const body = await response.json()
  this.conversationId = body.data.conversationId
})

Given('I have sent the message {string}', async function (content) {
  const response = await chatClient(this.apiContext, this.token).sendMessage(this.conversationId, content)
  const body = await response.json()
  this.lastMessageId = body.data.aiResponse.id
})

When('I create a new conversation', async function () {
  this.response = await chatClient(this.apiContext, this.token).createConversation()
})

When('I send the message {string}', async function (content) {
  this.response = await chatClient(this.apiContext, this.token).sendMessage(this.conversationId, content)
})

When('I get the messages for the conversation', async function () {
  this.response = await chatClient(this.apiContext, this.token).getMessages(this.conversationId)
})

When('I delete the last AI message', async function () {
  this.response = await chatClient(this.apiContext, this.token).deleteMessage(this.lastMessageId)
})

When('I create a new conversation without authentication', async function () {
  this.response = await chatClient(this.apiContext, null).createConversation()
})

When('I send a message with conversationId {word} and content {string}', async function (conversationId, content) {
  const id = conversationId === 'null' ? null : Number(conversationId)
  this.response = await chatClient(this.apiContext, this.token).sendMessage(id, content)
})

Then('the response body should contain a conversation ID', async function () {
  const body = await this.response.json()
  expect(typeof body.data.conversationId).toBe('number')
})

Then('the response body should contain the user message {string}', async function (content) {
  const body = await this.response.json()
  expect(body.data.userMessage).toMatchObject({
    id: expect.any(Number),
    sender_type: 'user',
    content,
  })
})

Then('the response body should contain an AI response', async function () {
  const body = await this.response.json()
  expect(body.data.aiResponse).toMatchObject({
    id: expect.any(Number),
    sender_type: 'ai',
    content: expect.any(String),
  })
  expect(body.data.aiResponse.content.length).toBeGreaterThan(0)
})

Then('the messages list should have {int} messages', async function (count) {
  const body = await this.response.json()
  expect(body.data.messages).toHaveLength(count)
})
