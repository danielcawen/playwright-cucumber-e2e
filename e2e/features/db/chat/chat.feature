@db
Feature: Chat data in database

  Background:
    Given a user exists with email "chatdb@example.com"
    And the user has a conversation

  Scenario: Messages are stored with correct sender types and order
    When a user message "Hello" and an AI message "Hi there!" are inserted
    Then the conversation has 2 messages
    And the first message has sender_type "user" and content "Hello"
    And the second message has sender_type "ai" and content "Hi there!"

  Scenario: Deleting a conversation removes its messages
    When a user message "Hello" and an AI message "Hi there!" are inserted
    And the conversation is deleted
    Then the conversation has 0 messages
