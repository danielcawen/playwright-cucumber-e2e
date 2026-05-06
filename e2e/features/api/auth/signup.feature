@api
Feature: Signup via API

  Scenario: Successful signup creates an account
    When I sign up with a unique email, first name "Test", last name "User", and password "Password123!"
    Then the response status should be 201
    And the response body should confirm account creation

  Scenario: Duplicate email returns 400
    When I sign up with email "api-signup-existing@example.com", first name "Test", last name "User", and password "Password123!"
    Then the response status should be 400

  Scenario Outline: Missing required fields return 400
    When I sign up with email "<email>", first name "<firstName>", last name "<lastName>", and password "<password>"
    Then the response status should be 400

    Examples:
      | email           | firstName | lastName | password     |
      |                 | Test      | User     | Password123! |
      | new@example.com |           | User     | Password123! |
      | new@example.com | Test      |          | Password123! |
      | new@example.com | Test      | User     |              |
