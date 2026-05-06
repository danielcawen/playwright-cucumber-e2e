@ui
Feature: Login via UI

  Scenario: Successful login with valid credentials
    Given I am on the login page
    When I log in with email "ui-testuser@example.com" and password "Password123!"
    Then I should be redirected to the chat page

  Scenario Outline: Login with invalid credentials shows an error
    Given I am on the login page
    When I log in with email "<email>" and password "<password>"
    Then I should see an error message

    Examples:
      | email                    | password      |
      | ui-testuser@example.com  | wrongpassword |
      | nobody@example.com       | password123   |
