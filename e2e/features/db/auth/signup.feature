@db
Feature: Signup user data in database

  Scenario: Newly signed up user is stored as unverified with a verification token
    Given a user was created via signup with email "db-signup-test@example.com"
    Then the user record should exist
    And the user should not be verified
    And the password should be hashed
    And a verification token should be set for the user

  Scenario: Verified user has is_verified true and no token
    Given a user was verified with email "db-verified-test@example.com"
    Then the user record should exist
    And the user should be verified
    And the verification token should be cleared
