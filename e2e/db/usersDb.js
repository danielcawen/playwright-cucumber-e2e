import bcrypt from 'bcryptjs'

export const usersDb = (pool) => ({
  create: async (email, password = 'Password123!') => {
    const hash = await bcrypt.hash(password, 10)
    return pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, hash, 'Test', 'User', true]
    )
  },

  createUnverified: async (email, password = 'Password123!') => {
    const hash = await bcrypt.hash(password, 10)
    const expires = new Date(Date.now() + 86400000)
    return pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified, magic_token, magic_token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [email, hash, 'Test', 'User', false, 'test-verification-token', expires]
    )
  },

  findByEmail: (email) =>
    pool.query('SELECT * FROM users WHERE email = $1', [email]),

  deleteByEmail: (email) =>
    pool.query('DELETE FROM users WHERE email = $1', [email]),
})
