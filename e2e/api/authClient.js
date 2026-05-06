export const authClient = (apiContext) => ({
  login: (email, password) =>
    apiContext.post('/api/auth/login', { data: { email, password } }),

  signup: (email, password, firstName, lastName) =>
    apiContext.post('/api/auth/signup', { data: { email, password, firstName, lastName } }),

  register: (email, password, name) =>
    apiContext.post('/api/auth/register', { data: { email, password, name } }),
})
