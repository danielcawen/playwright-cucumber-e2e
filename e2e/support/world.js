import { setWorldConstructor } from '@cucumber/cucumber'

class CustomWorld {
  constructor({ attach, parameters }) {
    this.attach = attach
    this.parameters = parameters

    // UI
    this.browser = null
    this.page = null

    // API
    this.apiContext = null
    this.response = null

    // DB
    this.db = null

    // shared transient state
    this.testEmail = null
    this.queryResult = null
  }
}

setWorldConstructor(CustomWorld)
