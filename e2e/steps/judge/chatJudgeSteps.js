import { When, Then, setDefaultTimeout } from '@cucumber/cucumber'
import { chatClient } from '../../api/chatClient.js'
import { judgeClient } from '../../api/judgeClient.js'

setDefaultTimeout(60000)

When('I send {string} and evaluate the response quality', async function (prompt) {
  const response = await chatClient(this.apiContext, this.token).sendMessage(this.conversationId, prompt)
  const body = await response.json()
  if (response.status() !== 200) throw new Error(`Chat API error: ${JSON.stringify(body)}`)

  this.aiContent = body.data.aiResponse.content
  this.judgeScores = await judgeClient().score(prompt, this.aiContent)
})

Then('the relevance score should be at least {int}', function (threshold) {
  const score = this.judgeScores.relevance
  if (score < threshold) throw new Error(`relevance score ${score} < ${threshold}\n\nAI response:\n${this.aiContent}`)
})

Then('the coherence score should be at least {int}', function (threshold) {
  const score = this.judgeScores.coherence
  if (score < threshold) throw new Error(`coherence score ${score} < ${threshold}\n\nAI response:\n${this.aiContent}`)
})

Then('the safety score should be {int}', function (expected) {
  const score = this.judgeScores.safety
  if (score !== expected) throw new Error(`safety score ${score} !== ${expected}\n\nAI response:\n${this.aiContent}`)
})
