import { hasBaPermission } from '@toantrung/contracts';
import { jsonError, jsonSuccess } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { bumpDomainRevisions } from '../../../../../core/cache/server-data-cache';
import {
  fetchGoogleVietnamSuggestions,
  getGoogleTrendsLiveSnapshot,
  importGoogleTrendsTimelineCsv,
  saveSerpApiTrendsKey,
  syncKeywordInterestViaSerpApi,
} from '../../../../../modules/03-keywords-ads/google-trends.service';

export async function GET(req: Request) {
  const auth = await requirePermissionSession(req, 'AI_MARKETING_SEO');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const query = (url.searchParams.get('q') || '').trim();
    const force = url.searchParams.get('refresh') === '1';

    if (query) {
      const suggestions = await fetchGoogleVietnamSuggestions(query);
      return jsonSuccess({
        query,
        suggestions,
        checkedAt: new Date().toISOString(),
      });
    }

    const snapshot = await getGoogleTrendsLiveSnapshot(force);
    return jsonSuccess(snapshot);
  } catch (err) {
    return jsonError(
      'TRENDS_FETCH_FAILED',
      err instanceof Error ? err.message : 'Không thể tải dữ liệu Google Trends.',
      500,
    );
  }
}

export async function POST(req: Request) {
  const auth = await requirePermissionSession(req, 'AI_MARKETING_SEO');
  if (!auth.ok) return auth.response;

  try {
    const raw = (await req.json()) as Record<string, unknown>;
    const action = String(raw.action || 'lookup_keyword');

    if (action === 'save_serpapi_key') {
      if (
        !hasBaPermission(auth.user.roleCode, 'SYSTEM_USER_ADMIN') &&
        auth.user.roleCode !== 'MKT_LEAD'
      ) {
        return jsonError(
          'FORBIDDEN_PERMISSION',
          'Chỉ Quản trị viên hoặc Trưởng phòng Marketing mới được cấu hình khóa SerpApi.',
          403,
        );
      }
      const key = String(raw.apiKey || '').trim();
      if (key.length < 12) {
        return jsonError('VALIDATION_ERROR', 'Khóa SerpApi không hợp lệ.', 400);
      }
      await saveSerpApiTrendsKey(key);
      return jsonSuccess({ ok: true });
    }

    if (action === 'sync_serpapi') {
      const keyword = String(raw.keyword || '').trim();
      const dateRange = typeof raw.dateRange === 'string' ? raw.dateRange : 'today 1-m';
      const result = await syncKeywordInterestViaSerpApi({ keyword, geo: 'VN', dateRange });
      bumpDomainRevisions(['ads', 'reports'], 'sync_serpapi_trends');
      return jsonSuccess(result);
    }

    if (action === 'import_csv') {
      const csvText = String(raw.csvText || '');
      if (!csvText.trim()) {
        return jsonError('VALIDATION_ERROR', 'Nội dung CSV trống.', 400);
      }
      const result = await importGoogleTrendsTimelineCsv(csvText);
      bumpDomainRevisions(['ads', 'reports'], 'import_trends_csv');
      return jsonSuccess(result);
    }

    const keyword = String(raw.keyword || '').trim();
    if (!keyword) {
      return jsonError('VALIDATION_ERROR', 'Vui lòng nhập từ khóa cần tra cứu.', 400);
    }
    const suggestions = await fetchGoogleVietnamSuggestions(keyword);
    return jsonSuccess({
      keyword,
      suggestions,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    return jsonError(
      'TRENDS_ACTION_FAILED',
      err instanceof Error ? err.message : 'Thao tác Google Trends thất bại.',
      400,
    );
  }
}
