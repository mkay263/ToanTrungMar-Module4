import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@toantrung/database';
import { bumpDomainRevisions } from '../../../../../core/cache/server-data-cache';
import { APP_CONFIG } from '../../../../../core/config';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requireAuthenticatedSession } from '../../../../../core/permissions';

const UPLOAD_ALLOWED_ROLES = new Set(['ADMIN', 'BOD', 'MKT_LEAD', 'SALES_LEAD']);
const MAX_SHARED_FILE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXT_REGEX = /\.(xlsx|xls|csv|docx|doc|pdf|png|jpg|jpeg|webp)$/i;

interface SharedFileMeta {
  fileName: string;
  note?: string;
  uploadedByName?: string;
  uploadedByRole?: string;
  updatedAt?: string;
}

function getSharedDir(): string {
  const dir = path.join(APP_CONFIG.getStorageRoot(), 'shared-team-files');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getManifestPath(): string {
  return path.join(getSharedDir(), '_manifest.json');
}

function readManifest(): Record<string, SharedFileMeta> {
  try {
    const p = getManifestPath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, SharedFileMeta>;
  } catch {
    return {};
  }
}

function writeManifest(manifest: Record<string, SharedFileMeta>): void {
  try {
    fs.writeFileSync(getManifestPath(), JSON.stringify(manifest, null, 2), 'utf8');
  } catch {
    // ignore read-only env
  }
}

function sanitizeFileName(raw: string): string | null {
  const base = path.basename(raw.trim()).replace(/[^\p{L}\p{N}._()\- ]/gu, '_').replace(/\s+/g, '_');
  if (!base || base.startsWith('.') || base.startsWith('_') || base.includes('..')) {
    return null;
  }
  if (!ALLOWED_EXT_REGEX.test(base)) {
    return null;
  }
  return base.slice(0, 160);
}

function getMimeType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (ext === '.xls') return 'application/vnd.ms-excel';
  if (ext === '.csv') return 'text/csv; charset=utf-8';
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === '.doc') return 'application/msword';
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * GET /api/v1/reports/shared-files
 * Accessible to ALL authenticated CRM members (no Gmail login needed).
 * - Without ?file=... -> returns live list of all shared data & report files.
 * - With ?file=... -> streams the requested file safely as attachment.
 */
export async function GET(request: Request) {
  const auth = await requireAuthenticatedSession(request, { requireCsrf: false });
  if (!auth.ok) return auth.response;

  const sharedDir = getSharedDir();
  const url = new URL(request.url);
  const fileParam = url.searchParams.get('file');

  if (!fileParam) {
    const manifest = readManifest();
    const entries = fs
      .readdirSync(sharedDir, { withFileTypes: true })
      .filter((d) => d.isFile() && !d.name.startsWith('_') && ALLOWED_EXT_REGEX.test(d.name))
      .map((d) => {
        const st = fs.statSync(path.join(sharedDir, d.name));
        const meta = manifest[d.name];
        return {
          fileName: d.name,
          sizeBytes: st.size,
          updatedAt: meta?.updatedAt || st.mtime.toISOString(),
          uploadedByName: meta?.uploadedByName || 'Quản trị hệ thống',
          uploadedByRole: meta?.uploadedByRole || 'ADMIN',
          note: meta?.note || '',
          ext: path.extname(d.name).toLowerCase().replace('.', ''),
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    return jsonSuccess({
      files: entries,
      canManage: UPLOAD_ALLOWED_ROLES.has(auth.user.roleCode),
    });
  }

  const safeName = sanitizeFileName(fileParam);
  if (!safeName) {
    return jsonError('INVALID_FILE_NAME', 'Tên tệp không hợp lệ.', 400);
  }
  const fullPath = path.resolve(sharedDir, safeName);
  const resolvedRoot = path.resolve(sharedDir);
  if (!fullPath.startsWith(resolvedRoot + path.sep) || !fs.existsSync(fullPath)) {
    return jsonError('NOT_FOUND', 'Không tìm thấy tệp dữ liệu chia sẻ.', 404);
  }

  const buf = fs.readFileSync(fullPath);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': getMimeType(safeName),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(safeName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}

/**
 * POST /api/v1/reports/shared-files
 * Upload or update a shared report/data file for ALL CRM members to check immediately.
 */
export async function POST(request: Request) {
  const auth = await requireAuthenticatedSession(request, { requireCsrf: true });
  if (!auth.ok) return auth.response;

  if (!UPLOAD_ALLOWED_ROLES.has(auth.user.roleCode)) {
    return jsonError(
      'FORBIDDEN_UPLOAD',
      'Chỉ Quản trị viên, Ban Giám đốc hoặc Trưởng phòng mới được tải lên / cập nhật tài liệu dùng chung.',
      403,
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const note = String(formData.get('note') || '').trim().slice(0, 300);

    if (!file || typeof file !== 'object' || !('arrayBuffer' in file)) {
      return jsonError('MISSING_FILE', 'Vui lòng chọn tệp báo cáo/dữ liệu cần tải lên.', 400);
    }

    const rawName = 'name' in file ? String((file as File).name || '') : '';
    const safeName = sanitizeFileName(rawName);
    if (!safeName) {
      return jsonError(
        'UNSUPPORTED_FILE_TYPE',
        'Chỉ hỗ trợ tệp .xlsx, .xls, .csv, .docx, .pdf, .png, .jpg, .webp.',
        400,
      );
    }

    const buf = Buffer.from(await (file as Blob).arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_SHARED_FILE_BYTES) {
      return jsonError('INVALID_FILE_SIZE', 'Dung lượng tệp phải lớn hơn 0 và nhỏ hơn 25 MB.', 400);
    }

    const sharedDir = getSharedDir();
    const targetPath = path.resolve(sharedDir, safeName);
    if (!targetPath.startsWith(path.resolve(sharedDir) + path.sep)) {
      return jsonError('INVALID_FILE_NAME', 'Đường dẫn tệp không hợp lệ.', 400);
    }

    fs.writeFileSync(targetPath, buf);
    const nowIso = new Date().toISOString();
    const manifest = readManifest();
    manifest[safeName] = {
      fileName: safeName,
      note,
      uploadedByName: auth.user.fullName,
      uploadedByRole: auth.user.roleName,
      updatedAt: nowIso,
    };
    writeManifest(manifest);
    bumpDomainRevisions(['reports'], 'shared_team_file_uploaded');

    await prisma.auditLog
      .create({
        data: {
          actorUserId: auth.user.id,
          action: 'SHARED_TEAM_FILE_UPLOADED',
          targetType: 'SharedTeamFile',
          targetId: safeName,
          detailsJson: JSON.stringify({ sizeBytes: buf.length, note }),
        },
      })
      .catch(() => null);

    return jsonSuccess({
      fileName: safeName,
      sizeBytes: buf.length,
      updatedAt: nowIso,
      message: `Đã tải lên "${safeName}" — toàn bộ thành viên CRM đã có thể xem và tải ngay.`,
    });
  } catch (err) {
    return jsonError(
      'UPLOAD_FAILED',
      err instanceof Error ? err.message : 'Không thể tải tệp lên kho dùng chung.',
      500,
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAuthenticatedSession(request, { requireCsrf: true });
  if (!auth.ok) return auth.response;

  if (!UPLOAD_ALLOWED_ROLES.has(auth.user.roleCode)) {
    return jsonError('FORBIDDEN_DELETE', 'Bạn không có quyền xóa tài liệu dùng chung.', 403);
  }

  const url = new URL(request.url);
  const safeName = sanitizeFileName(url.searchParams.get('file') || '');
  if (!safeName) {
    return jsonError('INVALID_FILE_NAME', 'Tên tệp không hợp lệ.', 400);
  }

  const sharedDir = getSharedDir();
  const targetPath = path.resolve(sharedDir, safeName);
  if (!targetPath.startsWith(path.resolve(sharedDir) + path.sep) || !fs.existsSync(targetPath)) {
    return jsonError('NOT_FOUND', 'Không tìm thấy tệp cần xóa.', 404);
  }

  fs.unlinkSync(targetPath);
  const manifest = readManifest();
  delete manifest[safeName];
  writeManifest(manifest);
  bumpDomainRevisions(['reports'], 'shared_team_file_deleted');

  return jsonSuccess({ ok: true, deleted: safeName });
}
