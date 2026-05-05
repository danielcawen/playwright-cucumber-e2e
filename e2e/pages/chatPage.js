import { expect } from '@playwright/test'

const messageInput = '[data-testid="message-input"]'
const sendButton = '[data-testid="send-button"]'
const newChatButton = '[data-testid="new-chat-button"]'
const emptyChat = '[data-testid="empty-chat"]'
const aiMessage = '[data-testid="chat-message"][data-sender="ai"]'
const messageContent = '[data-testid="message-content"]'

export async function waitForChatPage(page, frontendUrl) {
  await page.waitForURL(`${frontendUrl}/chat`, { timeout: 5000 })
  await page.locator(messageInput).waitFor()
}

export async function sendMessage(page, text) {
  await page.locator(messageInput).fill(text)
  await page.locator(sendButton).click()
}

export async function startNewChat(page) {
  await page.locator(newChatButton).click()
}

export async function verifyMessageVisible(page, content) {
  await expect(page.locator(messageContent).filter({ hasText: content })).toBeVisible({ timeout: 10000 })
}

export async function verifyAiResponseVisible(page) {
  await expect(page.locator(aiMessage).last()).toBeVisible({ timeout: 10000 })
}

export async function verifyEmptyChat(page) {
  await expect(page.locator(emptyChat)).toBeVisible({ timeout: 5000 })
}

export async function verifyInputVisible(page) {
  await expect(page.locator(messageInput)).toBeVisible()
}

export async function verifySendButtonVisible(page) {
  await expect(page.locator(sendButton)).toBeVisible()
}

export async function verifyNewChatButtonVisible(page) {
  await expect(page.locator(newChatButton)).toBeVisible()
}
