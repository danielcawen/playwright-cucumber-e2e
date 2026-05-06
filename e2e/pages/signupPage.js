import { expect } from "@playwright/test";

const signupTabLocator = '[data-testid="tab-signup"]';
const firstNameInputLocator = '[data-testid="first-name-input"]';
const lastNameInputLocator = '[data-testid="last-name-input"]';
const emailInputLocator = '[data-testid="email-input"]';
const passwordInputLocator = '[data-testid="password-input"]';
const confirmPasswordInputLocator = '[data-testid="confirm-password-input"]';
const submitButtonLocator = '[data-testid="submit-button"]';
const infoMessageLocator = '[data-testid="info-message"]';

export async function signup(page, email, firstName, lastName, password, confirmPassword = password) {
  const tab = page.locator(signupTabLocator);
  await tab.waitFor();
  await tab.click();

  await page.locator(firstNameInputLocator).fill(firstName);
  await page.locator(lastNameInputLocator).fill(lastName);
  await page.locator(emailInputLocator).fill(email);
  await page.locator(passwordInputLocator).fill(password);
  await page.locator(confirmPasswordInputLocator).fill(confirmPassword);
  await page.locator(submitButtonLocator).click();
}

export async function verifyConfirmationMessage(page) {
  const info = page.locator(infoMessageLocator);
  await info.waitFor();
  await expect(info).toContainText('Check your email');
}
