@api
Feature: Chat via API

  Background:
    Given I am logged in as "testuser@example.com" with password "Password123!"

  Scenario: Create a new conversation
    When I create a new conversation
    Then the response status should be 201
    And the response body should contain a conversation ID

  Scenario: Send a message and receive an AI response
    Given I have an active conversation
    When I send the message "Hello"
    Then the response status should be 200
    And the response body should contain the user message "Hello"
    And the response body should contain an AI response

  Scenario: Retrieve conversation messages
    Given I have an active conversation
    And I have sent the message "Hello"
    When I get the messages for the conversation
    Then the response status should be 200
    And the messages list should have 2 messages

  Scenario: Delete a message
    Given I have an active conversation
    And I have sent the message "Hello"
    When I delete the last AI message
    Then the response status should be 200

  Scenario: Unauthenticated request is rejected
    When I create a new conversation without authentication
    Then the response status should be 401

  Scenario Outline: Send a message with missing fields returns 400
    Given I have an active conversation
    When I send a message with conversationId <conversationId> and content "<content>"
    Then the response status should be 400

    Examples:
      | conversationId | content |
      | null           | Hello   |
      | 1              |         |
