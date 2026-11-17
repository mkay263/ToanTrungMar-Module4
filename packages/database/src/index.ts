import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

function toSqliteFileUrl(filePath: string): string {
  const norm = filePath.replace(/\\/g, '/');
  return norm.startsWith('/') ? `file://${norm}` : `file:${norm}`;
}

function resolveIndependentSqliteUrl(): string {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, 'packages', 'database', 'prisma', 'independent_v2.db'),
    path.resolve(cwd, '..', '..', 'packages', 'database', 'prisma', 'independent_v2.db'),
    path.resolve(cwd, 'prisma', 'independent_v2.db'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return toSqliteFileUrl(candidate);
    }
  }
  for (const candidate of candidates) {
    const parent = path.dirname(candidate);
    if (fs.existsSync(parent)) {
      return toSqliteFileUrl(candidate);
    }
  }
  return toSqliteFileUrl(candidates[0]);
}

const explicitPostgresUrl =
  process.env.USE_POSTGRES_TRIAL === '1' && process.env.PG_DATABASE_URL
    ? process.env.PG_DATABASE_URL
    : process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : null;

const resolvedDbUrl =
  explicitPostgresUrl ??
  (process.env.DATABASE_URL &&
  process.env.DATABASE_URL !== 'file:./independent_v2.db' &&
  process.env.DATABASE_URL !== 'file:./dev.db'
    ? process.env.DATABASE_URL
    : resolveIndependentSqliteUrl());

if (explicitPostgresUrl) {
  process.env.PG_DATABASE_URL = explicitPostgresUrl;
  process.env.DATABASE_PROVIDER = 'postgresql';
} else {
  process.env.DATABASE_URL = resolvedDbUrl;
  process.env.DATABASE_PROVIDER = 'sqlite';
}

function createActivePrismaClient(): PrismaClient {
  if (explicitPostgresUrl) {
    const cwd = process.cwd();
    const pgCandidates = [
      path.resolve(cwd, 'packages', 'database', 'generated', 'postgres-client'),
      path.resolve(cwd, '..', '..', 'packages', 'database', 'generated', 'postgres-client'),
      path.resolve(__dirname, '..', 'generated', 'postgres-client'),
    ];
    for (const candidate of pgCandidates) {
      if (fs.existsSync(candidate)) {
        const dynamicRequire = eval('require') as NodeRequire;
        const { PrismaClient: PgPrismaClient } = dynamicRequire(candidate);
        return new PgPrismaClient({
          datasources: {
            db: {
              url: explicitPostgresUrl,
            },
          },
          log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        }) as PrismaClient;
      }
    }
    throw new Error('Không tìm thấy generated/postgres-client cho cấu hình PostgreSQL.');
  }

  return new PrismaClient({
    datasources: {
      db: {
        url: resolvedDbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createActivePrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
export * from './operations';
