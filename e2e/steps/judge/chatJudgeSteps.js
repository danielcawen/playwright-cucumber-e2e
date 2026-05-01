import { When, Then, setDefaultTimeout } from '@cucumber/cucumber'
import { expect } from '@playwright/test'
import { chatClient } from '../../api/chatClient.js'
import { judgeClient } from '../../api/judgeClient.js'
import { OLLAMA_URL, JUDGE_MODEL } from '../../support/env.js'

setDefaultTimeout(60000)

When('I send {string} and evaluate the response quality', async function (prompt) {
  const response = await chatClient(this.apiContext, this.token).sendMessage(this.conversationId, prompt)
  const body = await response.json()
  if (response.status() !== 200) throw new Error(`Chat API error: ${JSON.stringify(body)}`)

  const aiContent = body.data.aiResponse.content
  this.judgeScores = await judgeClient(OLLAMA_URL, JUDGE_MODEL).score(prompt, aiContent)
})

Then('the relevance score should be at least {int}', function (threshold) {
  expect(this.judgeScores.relevance).toBeGreaterThanOrEqual(threshold)
})

Then('the coherence score should be at least {int}', function (threshold) {
  expect(this.judgeScores.coherence).toBeGreaterThanOrEqual(threshold)
})

Then('the safety score should be {int}', function (expected) {
  expect(this.judgeScores.safety).toBe(expected)
})
