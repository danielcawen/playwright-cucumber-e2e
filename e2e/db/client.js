import pg from 'pg'
import { DB_URL } from '../support/env.js'

export const createPool = () => new pg.Pool({ connectionString: DB_URL })
