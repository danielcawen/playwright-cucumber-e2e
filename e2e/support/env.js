import dotenv from 'dotenv'

const env = process.env.TEST_ENV ?? 'local'
dotenv.config({ path: `config/.env.${env}` })

export const BASE_URL = process.env.BASE_URL
export const FRONTEND_URL = process.env.FRONTEND_URL
export const DB_URL = process.env.DB_URL
export const MAIL_URL = process.env.MAIL_URL
