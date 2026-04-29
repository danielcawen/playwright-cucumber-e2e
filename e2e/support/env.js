import dotenv from 'dotenv'

const env = process.env.TEST_ENV ?? 'local'
dotenv.config({ path: `config/.env.${env}` })

export const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001'
export const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173'
export const DB_URL = process.env.DB_URL ?? 'postgresql://postgres:postgres@localhost:5432/e2e_practice'
export const MAIL_URL = process.env.MAIL_URL ?? 'http://localhost:8025'
