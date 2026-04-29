import bcrypt from 'bcryptjs'
import { createPool } from './client.js'

const EMAIL = 'testuser@example.com'
const PASSWORD = 'Password123!'

const pool = createPool()

const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [EMAIL])

if (rows.length === 0) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  await pool.query(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
     VALUES ($1, $2, $3, $4, $5)`,
    [EMAIL, passwordHash, 'Test', 'User', true]
  )
  console.log(`Seeded user: ${EMAIL}`)
} else {
  console.log(`User already exists: ${EMAIL}`)
}

await pool.end()
