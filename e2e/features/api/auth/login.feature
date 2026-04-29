@api
Feature: Login via API

  Scenario: Successful login returns a token
    When I POST to /api/auth/login with valid credentials
    Then the response status should be 200
    And the response body should contain a token

  Scenario: Login with wrong password returns 401
    When I POST to /api/auth/login with invalid credentials
    Then the response status should be 401
