import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

// Always persist the singleton — one connection pool for the whole process
globalForPrisma.prisma = db;
