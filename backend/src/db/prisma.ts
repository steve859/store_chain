import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
  // eslint-disable-next-line no-var
  var __prismaPool: Pool | undefined
}

const pool =
  global.__prismaPool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

const adapter = new PrismaPg(pool)

const prisma =
  global.__prisma ??
  new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
  global.__prismaPool = pool
}

export default prisma
