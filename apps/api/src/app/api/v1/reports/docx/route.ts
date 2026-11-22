import { prisma } from '@toantrung/database';
import { jsonError } from '../../../../../core/http';
import { requirePermissionSession } from '../../../../../core/permissions';
import { generateScopedReportDocxBuffer } from '../../../../../modules/04-reports/docx-builder';

async function handleGenerateDocx(
  request: Request,
  customPayload?: {
    title?: string;
    docCode?: string;
    reportingPeriod?: string;
    contentHtml?: string;
    preset?: string;
    websiteId?: string;
    from?: string;
    to?: string;
  },
) {
  const auth = await requirePermissionSession(request, 'EXPORT_DATA');
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const websiteId = customPayload?.websiteId || url.searchParams.get('websiteId') || 'all';
    const preset = customPayload?.preset || url.searchParams.get('preset') || '30d';
    const fromDate =
      customPayload?.from || url.searchParams.get('from') || url.searchParams.get('fromDate') || undefined;
    const toDate =
      customPayload?.to || url.searchParams.get('to') || url.searchParams.get('toDate') || undefined;

    const { buffer: docxBuffer, docCode, reportTitle, dateStamp } =
      await generateScopedReportDocxBuffer(auth.user, {
        title: customPayload?.title,
        docCode: customPayload?.docCode,
        reportingPeriod: customPayload?.reportingPeriod,
        contentHtml: customPayload?.contentHtml,
        websiteId,
        preset,
        fromDate,
        toDate,
      });

    await prisma.auditLog.create({
      data: {
        actorUserId: auth.user.id,
        action: 'REPORT_DOCX_EXPORTED',
        targetType: 'ReportDocxExport',
        targetId: docCode,
        detailsJson: JSON.stringify({
          reportTitle,
          websiteId,
          preset,
          bytes: docxBuffer.length,
        }),
      },
    });

    const safeWebsiteSlug = websiteId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'all';
    const safeDateStamp = String(dateStamp || '').replace(/[^a-zA-Z0-9._-]/g, '_');

    return new Response(new Uint8Array(docxBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="BaoCao_ToanTrung_${safeWebsiteSlug}_${safeDateStamp}.docx"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return jsonError(
      'REPORT_DOCX_EXPORT_FAILED',
      err instanceof Error ? err.message : 'Không thể kết xuất tệp Word (.docx) chuẩn OpenXML.',
      400,
    );
  }
}

export async function GET(request: Request) {
  return handleGenerateDocx(request);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      docCode?: string;
      reportingPeriod?: string;
      contentHtml?: string;
      preset?: string;
      websiteId?: string;
      from?: string;
      to?: string;
    };
    return handleGenerateDocx(request, body);
  } catch {
    return handleGenerateDocx(request);
  }
}
