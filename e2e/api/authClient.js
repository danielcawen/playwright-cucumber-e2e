export const authClient = (apiContext) => ({
  login: (email, password) =>
    apiContext.post('/api/auth/login', { data: { email, password } }),

  register: (email, password, name) =>
    apiContext.post('/api/auth/register', { data: { email, password, name } }),
})
