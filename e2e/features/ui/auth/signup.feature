@ui
Feature: Signup via UI

  Scenario: Successful signup shows a confirmation message
    Given I am on the login page
    When I sign up via UI with a unique email, first name "Test", last name "User", and password "Password123!"
    Then I should see a signup confirmation message

  Scenario: Verification email contains a working link
    Given I am on the login page
    When I sign up via UI with a unique email, first name "Test", last name "User", and password "Password123!"
    Then I should see a signup confirmation message
    And I receive a verification email
    When I click the verification link from the email
    Then I should be redirected to the chat page

  Scenario: Signup with mismatched passwords shows an error
    Given I am on the login page
    When I attempt signup with email "mismatch@example.com", first name "Test", last name "User", password "Password123!", and confirm password "Different1!"
    Then I should see an error message
