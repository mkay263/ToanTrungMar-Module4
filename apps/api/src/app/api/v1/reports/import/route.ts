import { enforceMutationRateLimit, jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import {
  M04_MAX_IMPORT_FILE_BYTES,
  commitReportExcelImport,
  deleteReportExcelImportBatch,
  listReportExcelImportBatches,
  previewReportExcelImport,
} from '../../../../../modules/04-reports/excel-import.service';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'DASHBOARD_VIEW');
  if (!auth.ok) return auth.response;

  try {
    const batches = await listReportExcelImportBatches(auth.user);
    return jsonSuccess({ batches });
  } catch (err) {
    return jsonError(
      'REPORT_IMPORT_LIST_FAILED',
      err instanceof Error ? err.message : 'Không thể tải danh sách bản đối soát Excel.',
      500,
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;
  const limited = enforceMutationRateLimit(request, 'reports_import_post', auth.user.id, 20, 60_000);
  if (limited) return limited;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return jsonError(
        'INVALID_CONTENT_TYPE',
        'Vui lòng gửi tệp Excel (.xlsx) hoặc CSV (.csv) dưới dạng multipart/form-data.',
        400,
      );
    }

    const formData = await request.formData();
    const fileField = formData.get('file');
    if (!(fileField instanceof File)) {
      return jsonError('MISSING_FILE', 'Vui lòng chọn tệp Excel (.xlsx) hoặc CSV (.csv).', 400);
    }
    if (fileField.size === 0) {
      return jsonError('EMPTY_FILE', 'Tệp tải lên đang trống.', 400);
    }
    if (fileField.size > M04_MAX_IMPORT_FILE_BYTES) {
      return jsonError('FILE_TOO_LARGE', 'Tệp vượt quá giới hạn tối đa 10 MB.', 400);
    }

    const fileName = fileField.name || 'import.xlsx';
    const lowerName = fileName.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.csv') && !lowerName.endsWith('.txt')) {
      return jsonError(
        'UNSUPPORTED_FILE_TYPE',
        'Chỉ hỗ trợ định dạng tệp .xlsx hoặc .csv.',
        400,
      );
    }

    const mode = String(formData.get('mode') || 'preview').trim().toLowerCase();
    const granularity = String(formData.get('granularity') || 'month');
    const websiteId = String(formData.get('websiteId') || 'all');
    const preset = String(formData.get('preset') || '30D');
    const from = String(formData.get('from') || formData.get('fromDate') || '').trim() || undefined;
    const to = String(formData.get('to') || formData.get('toDate') || '').trim() || undefined;

    const arrayBuf = await fileField.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (mode === 'commit') {
      const batch = await commitReportExcelImport(auth.user, {
        buffer,
        fileName,
        granularity,
        websiteId,
        preset,
        from,
        to,
      });
      return jsonSuccess({ mode: 'commit', batch }, 201);
    }

    const preview = await previewReportExcelImport(auth.user, {
      buffer,
      fileName,
      granularity,
      websiteId,
      preset,
      from,
      to,
    });
    return jsonSuccess({ mode: 'preview', preview }, 200);
  } catch (err) {
    return jsonError(
      'REPORT_EXCEL_IMPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể đọc hoặc đối chiếu tệp Excel.',
      400,
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    const result = await deleteReportExcelImportBatch(auth.user, id);
    return jsonSuccess(result, 200);
  } catch (err) {
    return jsonError(
      'REPORT_IMPORT_DELETE_FAILED',
      err instanceof Error ? err.message : 'Không thể xóa bản đối soát Excel.',
      400,
    );
  }
}
