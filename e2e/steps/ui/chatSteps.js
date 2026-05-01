import { Given, When, Then } from '@cucumber/cucumber'
import { FRONTEND_URL } from '../../support/env.js'
import {
  waitForChatPage,
  sendMessage,
  startNewChat,
  verifyMessageVisible,
  verifyAiResponseVisible,
  verifyEmptyChat,
  verifyInputVisible,
  verifySendButtonVisible,
  verifyNewChatButtonVisible,
} from '../../pages/chatPage.js'

Given('the chat page has loaded', async function () {
  await waitForChatPage(this.page, FRONTEND_URL)
})

When('I send the chat message {string}', async function (text) {
  await sendMessage(this.page, text)
})

When('I start a new chat', async function () {
  await startNewChat(this.page)
})

Then('the message input should be visible', async function () {
  await verifyInputVisible(this.page)
})

Then('the send button should be visible', async function () {
  await verifySendButtonVisible(this.page)
})

Then('the new chat button should be visible', async function () {
  await verifyNewChatButtonVisible(this.page)
})

Then('the message {string} should appear in the chat', async function (content) {
  await verifyMessageVisible(this.page, content)
})

Then('an AI response should appear in the chat', async function () {
  await verifyAiResponseVisible(this.page)
})

Then('the chat should be empty', async function () {
  await verifyEmptyChat(this.page)
})
