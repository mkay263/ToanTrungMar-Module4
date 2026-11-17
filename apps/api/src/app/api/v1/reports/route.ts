import { jsonError, jsonSuccess } from '../../../../core/http';
import {
  createDispatchNotification,
  listDispatchedExecutiveReports,
  saveReportDraftForUser,
} from '../../../../core/notifications/service';
import { requirePermissionSession } from '../../../../core/permissions';
import { getScopedReportsDashboard } from '../../../../modules/04-reports/service';
import { getM04ResultsReportSpec } from '../../../../modules/04-reports/m04-spec.service';

export async function GET(request: Request) {
  const auth = await requirePermissionSession(request, 'DASHBOARD_VIEW');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    if (url.searchParams.get('view') === 'spec') {
      const m04 = await getM04ResultsReportSpec(auth.user, {
        websiteId: url.searchParams.get('websiteId'),
        preset: url.searchParams.get('preset'),
        from: url.searchParams.get('from') || url.searchParams.get('fromDate'),
        to: url.searchParams.get('to') || url.searchParams.get('toDate'),
        page: Number(url.searchParams.get('page') || 1),
        pageSize: Number(url.searchParams.get('pageSize') || 20),
      });
      return jsonSuccess(m04);
    }
    const preset = url.searchParams.get('preset') ?? '30d';
    const fromDate = url.searchParams.get('fromDate') ?? undefined;
    const toDate = url.searchParams.get('toDate') ?? undefined;

    const [data, dispatchedReports] = await Promise.all([
      getScopedReportsDashboard(auth.user, {
        preset,
        fromDate,
        toDate,
      }),
      listDispatchedExecutiveReports(25, auth.user.id),
    ]);
    return jsonSuccess({
      ...data,
      dispatchedReports,
    });
  } catch (err) {
    return jsonError(
      'REPORTS_FETCH_FAILED',
      err instanceof Error ? err.message : 'Không thể tải báo cáo phân quyền.',
      500
    );
  }
}

export async function POST(request: Request) {
  const auth = await requirePermissionSession(request, 'DASHBOARD_VIEW');
  if (!auth.ok) return auth.response;

  try {
    const raw = (await request.json()) as Record<string, unknown>;
    const action = String(raw.action || 'save_draft');
    const title = String(raw.title || 'Báo cáo điều hành nội bộ Toàn Trung').trim();
    const summary = String(raw.summary || '').trim();
    const contentHtml = String(raw.contentHtml || '');
    const reportingPeriod = String(raw.reportingPeriod || '30 ngày gần nhất');
    const targetDepartments = Array.isArray(raw.targetDepartments)
      ? raw.targetDepartments.map((d) => String(d))
      : [];

    if (action === 'issue_report') {
      const issued = await createDispatchNotification(auth.user.id, auth.user.roleCode, {
        title,
        summary: summary || title,
        category: 'Báo cáo & Điều hành',
        actionLabel: 'Mở đọc toàn văn báo cáo',
        contentHtml,
        targetDepartments,
        authorName: auth.user.fullName,
        authorRole: auth.user.roleName,
      });
      return jsonSuccess(
        {
          id: issued.savedReportId,
          status: 'ISSUED',
          savedReportId: issued.savedReportId,
          unreadCount: issued.unreadCount,
        },
        201
      );
    }

    const draft = await saveReportDraftForUser(auth.user.id, auth.user.roleCode, {
      draftId: raw.draftId ? Number(raw.draftId) : null,
      title,
      summary,
      contentHtml,
      targetDepartments,
      authorName: auth.user.fullName,
      authorRole: auth.user.roleName,
      reportingPeriod,
    });

    return jsonSuccess(draft, 200);
  } catch (err) {
    return jsonError(
      'REPORT_SAVE_FAILED',
      err instanceof Error ? err.message : 'Không thể lưu bản nháp hoặc phát hành báo cáo.',
      400
    );
  }
}
