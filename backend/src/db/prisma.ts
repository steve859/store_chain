import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined
  // eslint-disable-next-line no-var
  var __prismaPool: Pool | undefined
  // eslint-disable-next-line no-var
  var __prismaReadClients: PrismaClient[] | undefined
  // eslint-disable-next-line no-var
  var __prismaReadPools: Pool[] | undefined
  // eslint-disable-next-line no-var
  var __prismaReadIndex: number | undefined
}

const pool =
  global.__prismaPool ??
  new Pool({ connectionString: process.env.DATABASE_URL })

const adapter = new PrismaPg(pool)

const prisma =
  global.__prisma ??
  new PrismaClient({ adapter })

const parseReplicaUrls = (): string[] => {
  const csv = process.env.DATABASE_READ_REPLICA_URLS
    ? process.env.DATABASE_READ_REPLICA_URLS.split(',')
        .map((x) => x.trim())
        .filter((x) => x.length > 0)
    : []

  const numbered = [process.env.DB_REPLICA_1_URL, process.env.DB_REPLICA_2_URL]
    .filter((x): x is string => Boolean(x && x.trim() !== ''))
    .map((x) => x.trim())

  const primaryUrl = process.env.DATABASE_URL?.trim()
  const deduped = Array.from(new Set([...csv, ...numbered]))
  return deduped.filter((x) => x !== primaryUrl)
}

const replicaUrls = parseReplicaUrls()

const readPools =
  global.__prismaReadPools ??
  replicaUrls.map((connectionString) => new Pool({ connectionString }))

const readClients =
  global.__prismaReadClients ??
  readPools.map((readPool) => {
    const readAdapter = new PrismaPg(readPool)
    return new PrismaClient({ adapter: readAdapter })
  })

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma
  global.__prismaPool = pool
  global.__prismaReadPools = readPools
  global.__prismaReadClients = readClients
  global.__prismaReadIndex = global.__prismaReadIndex ?? 0
}

let readIndex = global.__prismaReadIndex ?? 0

export const getReadPrisma = (): PrismaClient => {
  if (readClients.length === 0) return prisma
  const client = readClients[readIndex % readClients.length]
  readIndex = (readIndex + 1) % readClients.length
  if (process.env.NODE_ENV !== 'production') {
    global.__prismaReadIndex = readIndex
  }
  return client
}

export default prisma
