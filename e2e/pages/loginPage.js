import { expect } from "@playwright/test";

const usernameInputLocator = '[data-testid="email-input"]';
const passwordInputLocator = '[data-testid="password-input"]';
const submitButtonLocator = '[data-testid="submit-button"]';
const errorMessageLocator = '[data-testid="error-message"]';

export async function login(page, username, password) {
  const usernameInput = page.locator(usernameInputLocator);
  await usernameInput.waitFor();
  await usernameInput.fill(username);

  const passwordInput = page.locator(passwordInputLocator);
  await passwordInput.waitFor();
  await passwordInput.fill(password);

  const submitButton = page.locator(submitButtonLocator);
  await submitButton.waitFor();
  await submitButton.click();
}

export async function getErrorMessage(page) {
  const errorMessageElement = page.locator(errorMessageLocator);
  await errorMessageElement.waitFor();
  return await errorMessageElement.textContent();
}
