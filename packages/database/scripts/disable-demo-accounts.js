'use strict';

/**
 * Production Cutover Guard (F12):
 * Kiểm tra và vô hiệu hóa toàn bộ tài khoản demo/seed cũ (kèm thu hồi phiên đang mở)
 * khi đưa DB sẵn có lên môi trường Render production.
 *
 * Cách dùng:
 * - Kiểm tra (dry-run, không sửa DB): npm run db:disable-demo-accounts
 * - Áp dụng thật (yêu cầu đã có ít nhất 1 tài khoản ADMIN thực ngoài danh sách demo):
 *   npm run db:disable-demo-accounts -- --apply
 */

const path = require('node:path');
const { LEGACY_DEMO_ACCOUNT_EMAILS } = require('./seed');

const EXTRA_DEMO_EMAILS = ['admin2@toantrung.vn', 'admin3@toantrung.vn'];
const ALL_DEMO_EMAILS = Array.from(new Set([...LEGACY_DEMO_ACCOUNT_EMAILS, ...EXTRA_DEMO_EMAILS]));

const defaultDbFile = path.resolve(__dirname, '../prisma/independent_v2.db').replace(/\\/g, '/');
const defaultDbUrl = defaultDbFile.startsWith('/') ? `file://${defaultDbFile}` : `file:${defaultDbFile}`;

function createClient() {
  const explicitPg =
    process.env.DATABASE_URL && /^postgres(ql)?:\/\//i.test(process.env.DATABASE_URL)
      ? process.env.DATABASE_URL
      : process.env.USE_POSTGRES_TRIAL === '1' && process.env.PG_DATABASE_URL
        ? process.env.PG_DATABASE_URL
        : null;

  if (explicitPg) {
    process.env.PG_DATABASE_URL = explicitPg;
    const { PrismaClient } = require('../generated/postgres-client');
    return new PrismaClient({ datasources: { db: { url: explicitPg } } });
  }

  const targetDbUrl =
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL !== 'file:./independent_v2.db' &&
    process.env.DATABASE_URL !== 'file:./dev.db'
      ? process.env.DATABASE_URL
      : defaultDbUrl;

  process.env.DATABASE_URL = targetDbUrl;
  const { PrismaClient } = require('@prisma/client');
  return new PrismaClient({ datasources: { db: { url: targetDbUrl } } });
}

async function disableDemoAccounts({ apply = false, client } = {}) {
  const prisma = client || createClient();
  const shouldDisconnect = !client;

  try {
    const activeDemoUsers = await prisma.user.findMany({
      where: {
        email: { in: ALL_DEMO_EMAILS },
        deletedAt: null,
        isActive: true,
      },
      include: { role: true },
      orderBy: { id: 'asc' },
    });

    const nonDemoActiveAdmins = await prisma.user.findMany({
      where: {
        email: { notIn: ALL_DEMO_EMAILS },
        deletedAt: null,
        isActive: true,
        role: { roleCode: 'ADMIN' },
      },
      select: { id: true, email: true, fullName: true },
    });

    if (!apply) {
      return {
        mode: 'dry-run',
        activeDemoCount: activeDemoUsers.length,
        activeDemoEmails: activeDemoUsers.map((u) => u.email),
        nonDemoActiveAdminCount: nonDemoActiveAdmins.length,
        readyToApply: nonDemoActiveAdmins.length > 0,
      };
    }

    if (nonDemoActiveAdmins.length === 0) {
      throw new Error(
        'REFUSED_NO_REAL_ADMIN: Cần tạo ít nhất 1 tài khoản ADMIN thật (npm run db:provision:admin) trước khi khóa các tài khoản demo.',
      );
    }

    if (activeDemoUsers.length === 0) {
      return {
        mode: 'applied',
        disabledCount: 0,
        revokedSessionCount: 0,
        disabledEmails: [],
        nonDemoActiveAdminCount: nonDemoActiveAdmins.length,
      };
    }

    const demoIds = activeDemoUsers.map((u) => u.id);
    const now = new Date();

    const [disabledRes, revokedRes] = await prisma.$transaction([
      prisma.user.updateMany({
        where: { id: { in: demoIds } },
        data: { isActive: false, isReceivingLeads: false, isOnline: false },
      }),
      prisma.userSession.updateMany({
        where: { userId: { in: demoIds }, revokedAt: null },
        data: { revokedAt: now },
      }),
      prisma.auditLog.create({
        data: {
          actorUserId: nonDemoActiveAdmins[0].id,
          action: 'DEMO_ACCOUNTS_DISABLED_CUTOVER',
          targetType: 'User',
          targetId: demoIds.join(','),
          detailsJson: JSON.stringify({
            disabledEmails: activeDemoUsers.map((u) => u.email),
            retainedAdminEmail: nonDemoActiveAdmins[0].email,
          }),
        },
      }),
    ]);

    return {
      mode: 'applied',
      disabledCount: disabledRes.count,
      revokedSessionCount: revokedRes.count,
      disabledEmails: activeDemoUsers.map((u) => u.email),
      nonDemoActiveAdminCount: nonDemoActiveAdmins.length,
    };
  } finally {
    if (shouldDisconnect) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  disableDemoAccounts({ apply })
    .then((res) => {
      console.log('[db:disable-demo-accounts]', JSON.stringify(res, null, 2));
    })
    .catch((err) => {
      console.error(`[db:disable-demo-accounts] ERROR: ${err.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  ALL_DEMO_EMAILS,
  disableDemoAccounts,
};
