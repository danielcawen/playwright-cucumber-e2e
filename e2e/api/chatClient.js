export const chatClient = (apiContext, token) => {
  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  return {
    createConversation: () =>
      apiContext.post('/api/chat/conversations', { headers }),

    sendMessage: (conversationId, content) =>
      apiContext.post('/api/chat/messages', { data: { conversationId, content }, headers }),

    getMessages: (conversationId) =>
      apiContext.get(`/api/chat/messages/${conversationId}`, { headers }),

    deleteMessage: (messageId) =>
      apiContext.delete(`/api/chat/messages/${messageId}`, { headers }),
  }
}
