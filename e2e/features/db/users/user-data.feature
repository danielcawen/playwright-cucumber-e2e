@db
Feature: User data in database

  Scenario: Registered user exists in users table
    Given a user has registered with email "test@example.com"
    When I query the users table for "test@example.com"
    Then the user record should exist
    And the password should be hashed

  Scenario: Deleted user is removed from database
    Given a user exists with email "delete@example.com"
    When the user is deleted
    Then the user record should not exist in the database
