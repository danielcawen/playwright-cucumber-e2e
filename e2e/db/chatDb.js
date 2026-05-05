export const chatDb = (pool) => ({
  createConversation: (userId) =>
    pool.query('INSERT INTO conversations (user_id) VALUES ($1) RETURNING id', [userId]),

  insertMessage: (conversationId, senderType, content) =>
    pool.query(
      'INSERT INTO messages (conversation_id, sender_type, content) VALUES ($1, $2, $3)',
      [conversationId, senderType, content]
    ),

  getMessages: (conversationId) =>
    pool.query('SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC', [conversationId]),

  deleteConversation: (conversationId) =>
    pool.query('DELETE FROM conversations WHERE id = $1', [conversationId]),
})
