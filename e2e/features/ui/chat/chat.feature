@ui
Feature: Chat UI

  Background:
    Given I am on the login page
    When I log in with email "testuser@example.com" and password "Password123!"
    And the chat page has loaded

  Scenario: Chat page renders with required elements
    Then the message input should be visible
    And the send button should be visible
    And the new chat button should be visible

  Scenario: Sending a message shows user and AI responses
    When I send the chat message "Hello"
    Then the message "Hello" should appear in the chat
    And an AI response should appear in the chat

  Scenario: Starting a new chat clears the conversation
    When I send the chat message "Hello"
    And an AI response should appear in the chat
    And I start a new chat
    Then the chat should be empty
