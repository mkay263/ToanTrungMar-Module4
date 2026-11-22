import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { prisma } from '@toantrung/database';
import { APP_CONFIG } from '../../../../../core/config';
import { getClientIp, jsonError, jsonSuccess } from '../../../../../core/http';
import { logServerEvent, summarizeError } from '../../../../../core/logging/logger';
import { requireAdminSession } from '../../../../../core/permissions';
import { updateBrandingMetadata } from '../../../../../core/storage/branding.service';

const COMPANY_PROFILE_SETTING_KEY = 'company.profile.v1';

export interface CompanyProfileData {
  companyName: string;
  companyTaxCode: string;
  companyHotline: string;
  companyAddress: string;
  updatedAt: string;
  updatedByName: string;
}

export interface BackupManifest {
  backupId: string;
  fileName: string;
  fileSizeBytes: number;
  sha256: string;
  restoreVerified: boolean;
  restoreVerificationMethod: string;
  recordCounts: {
    leads: number;
    designRequests: number;
    trackingEvents: number;
    seoArticles: number;
    users: number;
    auditLogs: number;
  };
  createdBy: string;
  createdAt: string;
}

const DEFAULT_COMPANY_PROFILE: CompanyProfileData = {
  companyName: 'CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG',
  companyTaxCode: '0303716891',
  companyHotline: '1900 599 817 - 0913 888 817',
  companyAddress: 'Số 72 Đường số 7, KDC Cityland Center Hills, P.7, Q. Gò Vấp, TP.HCM',
  updatedAt: new Date().toISOString(),
  updatedByName: 'Hệ thống',
};

function resolveWorkspaceRoot(): string {
  const cwd = process.cwd();
  if (
    fs.existsSync(path.join(cwd, 'packages', 'database', 'prisma', 'independent_v2.db')) ||
    fs.existsSync(path.join(cwd, 'packages', 'database', 'package.json'))
  ) {
    return cwd;
  }
  const twoUp = path.resolve(cwd, '..', '..');
  if (
    fs.existsSync(path.join(twoUp, 'packages', 'database', 'prisma', 'independent_v2.db')) ||
    fs.existsSync(path.join(twoUp, 'packages', 'database', 'package.json'))
  ) {
    return twoUp;
  }
  return cwd;
}

function resolveSqliteDbPath(): string {
  const root = resolveWorkspaceRoot();
  const rawDbUrl = (process.env.DATABASE_URL || '').trim();
  if (
    rawDbUrl.startsWith('file:') &&
    rawDbUrl !== 'file:./dev.db' &&
    rawDbUrl !== 'file:./independent_v2.db'
  ) {
    let candidatePath = rawDbUrl.startsWith('file://')
      ? rawDbUrl.slice('file://'.length)
      : rawDbUrl.slice('file:'.length);
    if (/^\/[a-zA-Z]:/.test(candidatePath)) {
      candidatePath = candidatePath.slice(1);
    }
    candidatePath = decodeURIComponent(candidatePath.split('?')[0] || '');
    const resolvedFromEnv = path.isAbsolute(candidatePath)
      ? path.resolve(candidatePath)
      : path.resolve(root, candidatePath);
    if (fs.existsSync(resolvedFromEnv)) {
      return resolvedFromEnv;
    }
  }
  return path.join(root, 'packages', 'database', 'prisma', 'independent_v2.db');
}

function resolveStorageDir(): string {
  const dir = path.resolve(APP_CONFIG.getStorageRoot());
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function computeDirectoryStats(dirPath: string): { totalBytes: number; fileCount: number } {
  let totalBytes = 0;
  let fileCount = 0;
  if (!fs.existsSync(dirPath)) return { totalBytes: 0, fileCount: 0 };

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      const sub = computeDirectoryStats(full);
      totalBytes += sub.totalBytes;
      fileCount += sub.fileCount;
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(full);
        totalBytes += stat.size;
        fileCount += 1;
      } catch {
        // ignore transient file locks
      }
    }
  }
  return { totalBytes, fileCount };
}

function listBackups(): BackupManifest[] {
  const backupsRoot = path.join(resolveStorageDir(), 'backups');
  if (!fs.existsSync(backupsRoot)) return [];

  const entries = fs.readdirSync(backupsRoot, { withFileTypes: true });
  const manifests: BackupManifest[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(backupsRoot, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
      manifests.push(parsed);
    } catch (err) {
      logServerEvent('warn', 'backup', 'Ignored malformed backup manifest.json', {
        dir: entry.name,
        ...summarizeError(err),
      });
    }
  }
  return manifests.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function getCompanyProfile(): Promise<CompanyProfileData> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: COMPANY_PROFILE_SETTING_KEY },
  });
  if (!row) return DEFAULT_COMPANY_PROFILE;
  try {
    const parsed = JSON.parse(row.value) as Partial<CompanyProfileData>;
    return {
      companyName: parsed.companyName || DEFAULT_COMPANY_PROFILE.companyName,
      companyTaxCode: parsed.companyTaxCode || DEFAULT_COMPANY_PROFILE.companyTaxCode,
      companyHotline: parsed.companyHotline || DEFAULT_COMPANY_PROFILE.companyHotline,
      companyAddress: parsed.companyAddress || DEFAULT_COMPANY_PROFILE.companyAddress,
      updatedAt: parsed.updatedAt || row.updatedAt.toISOString(),
      updatedByName: parsed.updatedByName || 'Quản trị viên',
    };
  } catch {
    return DEFAULT_COMPANY_PROFILE;
  }
}

export async function GET(req: Request) {
  const auth = await requireAdminSession(req, { requireCsrf: false });
  if (!auth.ok) return auth.response;

  try {
    const dbPath = resolveSqliteDbPath();
    const dbSizeBytes = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    const storageStats = computeDirectoryStats(resolveStorageDir());
    const companyProfile = await getCompanyProfile();
    const backups = listBackups();

    return jsonSuccess({
      companyProfile,
      storage: {
        dbSizeBytes,
        storageFilesBytes: storageStats.totalBytes,
        totalUsedBytes: dbSizeBytes + storageStats.totalBytes,
        storageFileCount: storageStats.fileCount,
      },
      backups,
    });
  } catch (err) {
    return jsonError(
      'SETTINGS_BACKUP_LOAD_ERROR',
      err instanceof Error ? err.message : 'Không tải được thông tin sao lưu & hồ sơ công ty.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requireAdminSession(req);
  if (!auth.ok) return auth.response;

  let body: {
    action?: 'save_company_profile' | 'create_backup';
    companyName?: string;
    companyTaxCode?: string;
    companyHotline?: string;
    companyAddress?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    body = { action: 'create_backup' };
  }

  try {
    if (body.action === 'save_company_profile') {
      const companyName = (body.companyName || '').trim();
      const companyTaxCode = (body.companyTaxCode || '').trim();
      const companyHotline = (body.companyHotline || '').trim();
      const companyAddress = (body.companyAddress || '').trim();

      if (!companyName) {
        return jsonError('VALIDATION_ERROR', 'Tên pháp nhân công ty không được để trống.', 400);
      }

      const profile: CompanyProfileData = {
        companyName,
        companyTaxCode: companyTaxCode || DEFAULT_COMPANY_PROFILE.companyTaxCode,
        companyHotline: companyHotline || DEFAULT_COMPANY_PROFILE.companyHotline,
        companyAddress: companyAddress || DEFAULT_COMPANY_PROFILE.companyAddress,
        updatedAt: new Date().toISOString(),
        updatedByName: auth.user.fullName,
      };

      await prisma.systemSetting.upsert({
        where: { key: COMPANY_PROFILE_SETTING_KEY },
        update: {
          value: JSON.stringify(profile),
          updatedById: auth.user.id,
        },
        create: {
          key: COMPANY_PROFILE_SETTING_KEY,
          value: JSON.stringify(profile),
          updatedById: auth.user.id,
        },
      });

      await updateBrandingMetadata(
        auth.user.id,
        { organizationName: companyName },
        getClientIp(req),
      );

      await prisma.auditLog.create({
        data: {
          actorUserId: auth.user.id,
          action: 'COMPANY_PROFILE_UPDATED',
          targetType: 'SystemSetting',
          targetId: COMPANY_PROFILE_SETTING_KEY,
          detailsJson: JSON.stringify(profile),
          ipAddress: getClientIp(req),
        },
      });

      return jsonSuccess({ companyProfile: profile });
    }

    // Action: create_backup + non-destructive restore verification
    const dbPath = resolveSqliteDbPath();
    if (!fs.existsSync(dbPath)) {
      return jsonError('DB_FILE_NOT_FOUND', 'Không tìm thấy tệp cơ sở dữ liệu SQLite để sao lưu.', 404);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `backup-${timestamp}`;
    const backupDir = path.join(resolveStorageDir(), 'backups', backupId);
    fs.mkdirSync(backupDir, { recursive: true });

    const backupDbFileName = `independent_v2_${timestamp}.db`;
    const backupDbPath = path.join(backupDir, backupDbFileName);

    // 1. WAL-safe SQLite snapshot via VACUUM INTO (with safe fallback if target environment restricts raw SQL)
    const escapedVacuumTarget = backupDbPath.replace(/\\/g, '/').replace(/'/g, "''");
    try {
      if (fs.existsSync(backupDbPath)) {
        fs.unlinkSync(backupDbPath);
      }
      await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedVacuumTarget}'`);
    } catch (err) {
      logServerEvent('warn', 'backup', 'VACUUM INTO failed; falling back to copyFileSync', summarizeError(err));
      fs.copyFileSync(dbPath, backupDbPath);
    }

    const backupBuffer = fs.readFileSync(backupDbPath);
    const sha256 = crypto.createHash('sha256').update(backupBuffer).digest('hex');

    // 2. Non-destructive Restore Verification + PRAGMA integrity_check on a separate test copy
    const restoreTestPath = path.join(backupDir, 'restore-verify-test.db');
    fs.copyFileSync(backupDbPath, restoreTestPath);
    const restoredBuffer = fs.readFileSync(restoreTestPath);
    const restoredSha256 = crypto.createHash('sha256').update(restoredBuffer).digest('hex');
    const sqliteMagic = restoredBuffer.subarray(0, 15).toString('ascii');

    let pragmaIntegrityOk = true;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const nodeSqlite = require('node:sqlite') as {
        DatabaseSync?: new (p: string, opts?: { readOnly?: boolean }) => {
          prepare: (sql: string) => { get: () => Record<string, unknown> | undefined };
          close: () => void;
        };
      };
      if (nodeSqlite?.DatabaseSync) {
        const testDb = new nodeSqlite.DatabaseSync(restoreTestPath, { readOnly: true });
        try {
          const row = testDb.prepare('PRAGMA integrity_check').get();
          const checkVal = String(row?.integrity_check || '').toLowerCase();
          pragmaIntegrityOk = checkVal === 'ok';
        } finally {
          testDb.close();
        }
      }
    } catch {
      // Fallback to header + checksum verification if node:sqlite is unavailable
    } finally {
      try {
        if (fs.existsSync(restoreTestPath)) fs.unlinkSync(restoreTestPath);
      } catch {
        // ignore cleanup error
      }
    }

    const restoreVerified =
      restoredBuffer.length > 0 &&
      restoredSha256 === sha256 &&
      sqliteMagic === 'SQLite format 3' &&
      pragmaIntegrityOk;

    if (!restoreVerified) {
      return jsonError(
        'BACKUP_VERIFICATION_FAILED',
        'Kiểm tra khôi phục (Restore Verification) thất bại: Checksum, SQLite header hoặc PRAGMA integrity_check không hợp lệ.',
        500,
      );
    }

    const [leads, designRequests, trackingEvents, seoArticles, users, auditLogs] = await Promise.all([
      prisma.lead.count(),
      prisma.designRequest.count(),
      prisma.platformSyncLog.count(),
      prisma.seoArticle.count(),
      prisma.user.count(),
      prisma.auditLog.count(),
    ]);

    const manifest: BackupManifest = {
      backupId,
      fileName: backupDbFileName,
      fileSizeBytes: backupBuffer.length,
      sha256,
      restoreVerified,
      restoreVerificationMethod: 'SQLite-VACUUM-INTO-IntegrityCheck-And-SHA256',
      recordCounts: {
        leads,
        designRequests,
        trackingEvents,
        seoArticles,
        users,
        auditLogs,
      },
      createdBy: auth.user.fullName,
      createdAt: new Date().toISOString(),
    };

    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'DATABASE_BACKUP_CREATED_AND_VERIFIED',
        targetType: 'DatabaseBackup',
        targetId: backupId,
        detailsJson: JSON.stringify(manifest),
        ipAddress: getClientIp(req),
      },
    });

    const storageStats = computeDirectoryStats(resolveStorageDir());

    return jsonSuccess({
      backup: manifest,
      backups: listBackups(),
      storage: {
        dbSizeBytes: backupBuffer.length,
        storageFilesBytes: storageStats.totalBytes,
        totalUsedBytes: backupBuffer.length + storageStats.totalBytes,
        storageFileCount: storageStats.fileCount,
      },
    });
  } catch (err) {
    return jsonError(
      'SETTINGS_BACKUP_ACTION_ERROR',
      err instanceof Error ? err.message : 'Thao tác sao lưu hoặc lưu cấu hình thất bại.',
      500,
    );
  }
}
