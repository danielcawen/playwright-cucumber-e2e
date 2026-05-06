@api
Feature: Login via API

  Scenario: Successful login returns a token and user
    When I log in via API with email "api-testuser@example.com" and password "Password123!"
    Then the response status should be 200
    And the response body should contain a token
    And the response body should contain user details

  Scenario Outline: Invalid login returns an error status
    When I log in via API with email "<email>" and password "<password>"
    Then the response status should be <status>

    Examples:
      | email                    | password      | status |
      | api-testuser@example.com | wrongpassword | 401    |
      | nobody@example.com       | Password123!  | 401    |
      | api-testuser@example.com |               | 400    |
      |                          | Password123!  | 400    |
