import { PrismaClient } from '@prisma/client'

// Prevent multiple instances of Prisma Client in development
declare global {
  var prisma: PrismaClient | undefined
}

export const prisma = globalThis.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  globalThis.prisma = prisma
}

export default prisma
