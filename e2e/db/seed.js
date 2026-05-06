import bcrypt from 'bcryptjs'
import { createPool } from './client.js'

const PASSWORD = 'Password123!'
const USERS = [
  { email: 'testuser@example.com', firstName: 'Test', lastName: 'User' },
  { email: 'api-testuser@example.com', firstName: 'Api', lastName: 'User' },
  { email: 'ui-testuser@example.com', firstName: 'Ui', lastName: 'User' },
  { email: 'api-signup-existing@example.com', firstName: 'Existing', lastName: 'User' },
]

const pool = createPool()
const passwordHash = await bcrypt.hash(PASSWORD, 10)

for (const { email, firstName, lastName } of USERS) {
  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email])
  if (rows.length === 0) {
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5)`,
      [email, passwordHash, firstName, lastName, true]
    )
    console.log(`Seeded user: ${email}`)
  } else {
    console.log(`User already exists: ${email}`)
  }
}

await pool.end()
