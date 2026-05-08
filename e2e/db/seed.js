import bcrypt from 'bcryptjs'
import { fileURLToPath } from 'url'
import { resolve } from 'path'
import { createPool } from './client.js'

const PASSWORD = 'Password123!'
const USERS = [
  { email: 'testuser@example.com', firstName: 'Test', lastName: 'User' },
  { email: 'api-testuser@example.com', firstName: 'Api', lastName: 'User' },
  { email: 'ui-testuser@example.com', firstName: 'Ui', lastName: 'User' },
  { email: 'api-signup-existing@example.com', firstName: 'Existing', lastName: 'User' },
]

export async function seed(pool) {
  const passwordHash = await bcrypt.hash(PASSWORD, 10)
  for (const { email, firstName, lastName } of USERS) {
    await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
      [email, passwordHash, firstName, lastName, true]
    )
  }
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  ;(async () => {
    const pool = createPool()
    await seed(pool)
    await pool.end()
    console.log('Seed complete')
  })()
}
