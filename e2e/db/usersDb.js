export const usersDb = (pool) => ({
  findByEmail: (email) =>
    pool.query('SELECT * FROM users WHERE email = $1', [email]),

  deleteByEmail: (email) =>
    pool.query('DELETE FROM users WHERE email = $1', [email]),
})
