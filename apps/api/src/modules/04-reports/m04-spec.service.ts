import { prisma } from '@toantrung/database';
import {
  PIPELINE_STATUS_LABELS,
  formatContactChannelClean,
  isL2Valid,
  isL3Effective,
  normalizeMarketingChannelDisplay,
  sanitizeProjectOrSubjectText,
  sanitizeWebsiteSourceDisplay,
  type ContactChannel,
  type M04PeriodBreakdownDto,
  type M04PeriodBucketRowDto,
  type M04ProductCatalogRowDto,
  type M04ProductCategoryGroup,
  type M04ProductCategorySummaryDto,
  type M04ReportGranularity,
  type M04ResultsReportDto,
  type M04UnclassifiedProductHintDto,
  type PipelineStatus,
  type SessionUserDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
} from '../../core/website-catalog';
import { getOrComputeScopedCache } from '../../core/cache/server-data-cache';
import { getVietnamDateParts } from '../../core/reporting-dates';
import {
  shouldAnonymizeLeadForRole,
} from '../01-leads/service';
import { computeCostPerValidAdLead } from '../03-keywords-ads/m03-spec.service';
import { listSeoAiReports } from '../03-keywords-ads/seo-report.service';
import {
  classifyCampaignWebsiteAttribution,
  getCampaignFinalUrlsMapNonBlocking,
  getGoogleAdsApiConfig,
  getGoogleConnection,
} from '../02-tracking-sync/google-oauth.service';
import { getGoogleAdsLiveSnapshotNonBlocking } from '../02-tracking-sync/gads-live-cache.service';
import { mergeCanonicalAdsCampaignDailyMetrics } from '../../core/unified-ads-metrics';

function maskPhoneForReportSpec(phone: string | null): string {
  if (!phone || phone.length < 7) return '***';
  return `${phone.slice(0, 4)}***${phone.slice(-3)}`;
}

const CATEGORY_GROUP_LABELS: Record<M04ProductCategoryGroup, string> = {
  led_screen: 'Màn hình LED',
  electronic_board: 'Bảng điện tử',
  other: 'Nhu cầu khác',
  unclassified: 'Chưa gắn mã sản phẩm',
};

const GRANULARITY_LABELS: Record<M04ReportGranularity, string> = {
  day: 'Theo Ngày',
  week: 'Theo Tuần',
  month: 'Theo Tháng',
  year: 'Theo Năm',
};

function normalizeProductCategoryGroup(raw?: string | null): M04ProductCategoryGroup {
  if (raw === 'led_screen') return 'led_screen';
  if (raw === 'electronic_board') return 'electronic_board';
  if (raw === 'other') return 'other';
  return 'unclassified';
}

function resolveEffectiveGranularity(
  rawGranularity: string | null | undefined,
  totalCalendarDays: number,
): M04ReportGranularity {
  const clean = String(rawGranularity || '').trim().toLowerCase();
  if (clean === 'day' || clean === 'week' || clean === 'month' || clean === 'year') {
    return clean;
  }
  if (totalCalendarDays <= 31) return 'day';
  if (totalCalendarDays <= 120) return 'week';
  if (totalCalendarDays <= 730) return 'month';
  return 'year';
}

function getIsoWeekBucket(ymd: string): { key: string; start: string; end: string; label: string } {
  const dt = new Date(`${ymd}T00:00:00Z`);
  const dow = dt.getUTCDay() || 7; // 1=Mon..7=Sun
  const mon = new Date(dt.getTime() - (dow - 1) * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  const thu = new Date(mon.getTime() + 3 * 86_400_000);
  const isoYear = thu.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const weekNo = Math.ceil(((thu.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  const startStr = mon.toISOString().slice(0, 10);
  const endStr = sun.toISOString().slice(0, 10);
  const ww = String(weekNo).padStart(2, '0');
  return {
    key: `${isoYear}-W${ww}`,
    start: startStr,
    end: endStr,
    label: `Tuần ${ww}/${isoYear} (${startStr.slice(8, 10)}/${startStr.slice(5, 7)} – ${endStr.slice(8, 10)}/${endStr.slice(5, 7)})`,
  };
}

function getBucketMetaForYmd(
  ymd: string,
  granularity: M04ReportGranularity,
): { key: string; start: string; end: string; label: string } {
  if (granularity === 'day') {
    return {
      key: ymd,
      start: ymd,
      end: ymd,
      label: `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`,
    };
  }
  if (granularity === 'week') {
    return getIsoWeekBucket(ymd);
  }
  if (granularity === 'month') {
    const ym = ymd.slice(0, 7);
    const y = Number(ym.slice(0, 4));
    const m = Number(ym.slice(5, 7));
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
      key: ym,
      start: `${ym}-01`,
      end: `${ym}-${String(lastDay).padStart(2, '0')}`,
      label: `Tháng ${ym.slice(5, 7)}/${ym.slice(0, 4)}`,
    };
  }
  const yr = ymd.slice(0, 4);
  return {
    key: yr,
    start: `${yr}-01-01`,
    end: `${yr}-12-31`,
    label: `Năm ${yr}`,
  };
}

function enumeratePeriodBuckets(
  startDateStr: string,
  endDateStr: string,
  granularity: M04ReportGranularity,
): Array<{ key: string; start: string; end: string; label: string }> {
  const ordered: Array<{ key: string; start: string; end: string; label: string }> = [];
  const seen = new Set<string>();
  const cursor = new Date(`${startDateStr}T00:00:00Z`);
  const endDt = new Date(`${endDateStr}T00:00:00Z`);
  let safety = 0;
  const maxSteps = granularity === 'day' ? 400 : 1850;
  while (cursor <= endDt && safety < maxSteps) {
    safety += 1;
    const ymd = cursor.toISOString().slice(0, 10);
    const meta = getBucketMetaForYmd(ymd, granularity);
    if (!seen.has(meta.key)) {
      seen.add(meta.key);
      ordered.push({
        key: meta.key,
        start: meta.start < startDateStr ? startDateStr : meta.start,
        end: meta.end > endDateStr ? endDateStr : meta.end,
        label: meta.label,
      });
    }
    if (granularity === 'year') {
      cursor.setUTCFullYear(cursor.getUTCFullYear() + 1, 0, 1);
    } else if (granularity === 'month') {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    } else if (granularity === 'week') {
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    } else {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }
  // Ensure the final boundary date's bucket is always present
  const endMeta = getBucketMetaForYmd(endDateStr, granularity);
  if (!seen.has(endMeta.key)) {
    ordered.push({
      key: endMeta.key,
      start: endMeta.start < startDateStr ? startDateStr : endMeta.start,
      end: endMeta.end > endDateStr ? endDateStr : endMeta.end,
      label: endMeta.label,
    });
  }
  return ordered;
}

function inferUnclassifiedProductHint(projectName: string | null | undefined): {
  hintKey: string;
  suggestedProductCode: string | null;
  suggestedProductName: string;
} {
  const clean = (projectName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
  if (!clean || clean === 'xxxx' || clean.length <= 3) {
    return {
      hintKey: 'NO_PROJECT_TEXT',
      suggestedProductCode: null,
      suggestedProductName: 'Chưa có mô tả dự án (cần Sales gọi xác minh)',
    };
  }
  if (clean.includes('marathon')) {
    return { hintKey: 'BOARD_MARATHON', suggestedProductCode: 'BOARD_MARATHON', suggestedProductName: 'Bảng Marathon' };
  }
  if (clean.includes('nang suat') || clean.includes('dem so') || clean.includes('thu tu')) {
    return { hintKey: 'BOARD_PRODUCTIVITY', suggestedProductCode: 'BOARD_PRODUCTIVITY', suggestedProductName: 'Bảng Năng suất' };
  }
  if (clean.includes('dong ho')) {
    return { hintKey: 'BOARD_CLOCK', suggestedProductCode: 'BOARD_CLOCK', suggestedProductName: 'Đồng hồ LED' };
  }
  if (clean.includes('gia vang')) {
    return { hintKey: 'BOARD_GOLD_PRICE', suggestedProductCode: 'BOARD_GOLD_PRICE', suggestedProductName: 'Bảng LED giá vàng' };
  }
  if (clean.includes('an toan')) {
    return { hintKey: 'BOARD_SAFETY', suggestedProductCode: 'BOARD_SAFETY', suggestedProductName: 'Bảng An toàn lao động' };
  }
  if (clean.includes('ngoai troi') || clean.includes('outdoor') || clean.includes('p4') || clean.includes('p5') || clean.includes('p6')) {
    return { hintKey: 'LED_OUTDOOR', suggestedProductCode: 'LED_OUTDOOR', suggestedProductName: 'Màn hình LED Outdoor' };
  }
  if (clean.includes('trong nha') || clean.includes('indoor') || clean.includes('p2') || clean.includes('p1.') || clean.includes('p3')) {
    return { hintKey: 'LED_INDOOR', suggestedProductCode: 'LED_INDOOR', suggestedProductName: 'Màn hình LED Indoor' };
  }
  if (clean.includes('cob')) {
    return { hintKey: 'LED_COB', suggestedProductCode: 'LED_COB', suggestedProductName: 'Màn hình COB' };
  }
  if (clean.includes('gob')) {
    return { hintKey: 'LED_GOB', suggestedProductCode: 'LED_GOB', suggestedProductName: 'Màn hình GOB' };
  }
  if (clean.includes('bang led')) {
    return { hintKey: 'BOARD_GENERIC', suggestedProductCode: null, suggestedProductName: 'Nhóm Bảng điện tử LED (cần chọn mã cụ thể)' };
  }
  if (clean.includes('man hinh led') || clean.includes('den led') || clean.includes('led')) {
    return { hintKey: 'LED_OTHER', suggestedProductCode: 'LED_OTHER', suggestedProductName: 'Khác (Màn hình LED)' };
  }
  return {
    hintKey: 'MANUAL_REVIEW',
    suggestedProductCode: null,
    suggestedProductName: 'Nhu cầu khác / cần đối chiếu thủ công',
  };
}

export async function getM04ResultsReportSpec(
  user: SessionUserDto,
  params?: {
    websiteId?: string | null;
    preset?: string | null;
    from?: string | null;
    to?: string | null;
    granularity?: string | null;
    page?: number;
    pageSize?: number;
    detailPage?: number;
    detailPageSize?: number;
    bypassCache?: boolean;
  },
): Promise<M04ResultsReportDto> {
  const rawPresetUpper = String(params?.preset || '').trim().toUpperCase();
  const normalizedScopeParams = (() => {
    if (rawPresetUpper === 'THIS_YEAR' || rawPresetUpper === 'YEAR') {
      const todayParts = getVietnamDateParts(new Date());
      return {
        ...params,
        preset: 'CUSTOM',
        from: `${todayParts.year}-01-01`,
        to: todayParts.dateStr,
      };
    }
    if (rawPresetUpper === 'THIS_MONTH') {
      const todayParts = getVietnamDateParts(new Date());
      const mm = String(todayParts.month).padStart(2, '0');
      return {
        ...params,
        preset: 'CUSTOM',
        from: `${todayParts.year}-${mm}-01`,
        to: todayParts.dateStr,
      };
    }
    return params;
  })();

  const scope = await resolveDashboardScope(normalizedScopeParams);
  const effectiveGranularity = resolveEffectiveGranularity(
    params?.granularity,
    scope.totalCalendarDays,
  );
  const anonymized = shouldAnonymizeLeadForRole(user.roleCode) || user.roleCode === 'DESIGNER';

  const roleLeadFilter: Record<string, unknown> =
    user.roleCode === 'SALES'
      ? { assignedSalesId: user.id }
      : user.roleCode === 'DESIGNER'
        ? { designRequests: { some: {} } }
        : {};

  const cacheResult = await getOrComputeScopedCache<M04ResultsReportDto>({
    key: `m04-spec:${user.roleCode === 'SALES' ? user.id : user.roleCode}:${anonymized ? 'anon' : 'full'}:${scope.websiteId}:${scope.preset}:${effectiveGranularity}:${scope.startDateStr}:${scope.endDateStr}:${params?.page || 1}:${params?.pageSize || 20}:${params?.detailPage || 1}:${params?.detailPageSize || 25}`,
    domains: ['reports', 'leads', 'tracking', 'ads', 'seo_articles', 'seo_reports', 'design', 'websites', 'auth'],
    ttlMs: 30_000,
    bypassCache: params?.bypassCache,
    compute: async () => {
      const checkedAt = new Date().toISOString();
      const [
    rawLeads,
    prevRawLeads,
    rawAdsCampaignMetrics,
    rawPrevAdsCampaignMetrics,
    latestSync,
    googleConn,
    adsCfg,
    realAdsCatalog,
    gadsLiveSnap,
    prevGadsLiveSnap,
    finalUrlsMap,
    receivedInPeriodRows,
    firstQuoteInPeriodRows,
    closedWonInPeriodRows,
    periodActivityRows,
    seoReports,
    allActiveProducts,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: {
        createdAt: {
          gte: scope.startDateTime,
          lte: scope.endDateTime,
        },
        ...roleLeadFilter,
      },
      include: {
        assignedSales: {
          select: {
            id: true,
            fullName: true,
            isActive: true,
            role: { select: { roleCode: true, roleName: true } },
          },
        },
        tracking: true,
        leadProducts: {
          include: {
            product: {
              select: {
                id: true,
                productCode: true,
                productName: true,
                categoryGroup: true,
                unit: true,
              },
            },
          },
        },
        activities: {
          where: { actionType: { in: ['quote_sent', 'status_change'] } },
          select: { actionType: true, note: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.findMany({
      where: {
        createdAt: {
          gte: scope.prevStartDateTime,
          lte: scope.prevEndDateTime,
        },
        ...roleLeadFilter,
      },
      select: {
        id: true,
        isSpam: true,
        pipelineStatus: true,
        sourceWebsite: true,
        contactChannel: true,
        createdAt: true,
        tracking: {
          select: {
            marketingSource: true,
            utmSource: true,
            utmMedium: true,
            gclid: true,
          },
        },
      },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook_ads', 'facebook'] },
        grain: 'campaign',
        metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
        NOT: [
          { accountPropertyId: { startsWith: 'GA4-' } },
          { campaignExternalId: { startsWith: 'ga4_' } },
          { campaignExternalId: { startsWith: 'PERIOD_SNAPSHOT:' } },
        ],
      },
      select: {
        platform: true,
        campaignExternalId: true,
        spendMicros: true,
        impressions: true,
        clicks: true,
        conversionsMicros: true,
        metricDate: true,
        pageUrlRaw: true,
        campaign: {
          select: {
            utmCampaignSlug: true,
            campaignName: true,
            campaignCode: true,
          },
        },
      },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook_ads', 'facebook'] },
        grain: 'campaign',
        metricDate: { gte: scope.prevStartDateStr, lte: scope.prevEndDateStr },
        NOT: [
          { accountPropertyId: { startsWith: 'GA4-' } },
          { campaignExternalId: { startsWith: 'ga4_' } },
          { campaignExternalId: { startsWith: 'PERIOD_SNAPSHOT:' } },
        ],
      },
      select: {
        platform: true,
        campaignExternalId: true,
        metricDate: true,
        spendMicros: true,
        impressions: true,
        clicks: true,
        conversionsMicros: true,
        pageUrlRaw: true,
        campaign: {
          select: {
            utmCampaignSlug: true,
            campaignName: true,
            campaignCode: true,
          },
        },
      },
    }),
    prisma.platformSyncLog.findFirst({
      where: { status: 'success' },
      orderBy: { id: 'desc' },
    }),
    getGoogleConnection(),
    getGoogleAdsApiConfig(),
    prisma.campaign.findMany({
      where: {
        platform: 'google_ads',
        NOT: [{ accountExternalId: 'default' }, { accountExternalId: { startsWith: 'GA4-' } }],
      },
      select: {
        id: true,
        campaignCode: true,
        campaignName: true,
        platform: true,
        isActive: true,
        utmCampaignSlug: true,
      },
    }),
    getGoogleAdsLiveSnapshotNonBlocking(scope.startDateStr, scope.endDateStr, false),
    getGoogleAdsLiveSnapshotNonBlocking(scope.prevStartDateStr, scope.prevEndDateStr, false),
    getCampaignFinalUrlsMapNonBlocking(),
    prisma.lead.findMany({
      where: {
        receivedAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, sourceWebsite: true },
    }),
    prisma.lead.findMany({
      where: {
        firstQuoteSentAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, createdAt: true, sourceWebsite: true },
    }),
    prisma.lead.findMany({
      where: {
        pipelineStatus: 'won',
        closedAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, createdAt: true, sourceWebsite: true },
    }),
    prisma.leadActivity.findMany({
      where: {
        createdAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        actionType: { in: ['quote_sent', 'status_change'] },
        lead: { isSpam: false, ...roleLeadFilter },
      },
      select: {
        leadId: true,
        actionType: true,
        newStatus: true,
        lead: { select: { createdAt: true, sourceWebsite: true } },
      },
    }),
    listSeoAiReports().catch(() => []),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ categoryGroup: 'asc' }, { id: 'asc' }],
    }),
  ]);

  const realAdsCatalogCount = realAdsCatalog.length;
  const adsCampaignMetrics = mergeCanonicalAdsCampaignDailyMetrics({
    dbRows: rawAdsCampaignMetrics,
    gadsLiveSnap,
    realAdsCatalog,
    finalUrlsMap,
    startDateStr: scope.startDateStr,
    endDateStr: scope.endDateStr,
  });
  const prevAdsCampaignMetrics = mergeCanonicalAdsCampaignDailyMetrics({
    dbRows: rawPrevAdsCampaignMetrics,
    gadsLiveSnap: prevGadsLiveSnap,
    realAdsCatalog,
    finalUrlsMap,
    startDateStr: scope.prevStartDateStr,
    endDateStr: scope.prevEndDateStr,
  });

  const isGoogleOAuthError = Boolean(
    googleConn?.connected &&
      !googleConn.isSandboxDemo &&
      (googleConn.connectionStatus === 'EXPIRED' ||
        googleConn.connectionStatus === 'PERMISSION_ERROR' ||
        googleConn.connectionStatus === 'SYNC_ERROR'),
  );

  const hasAdsToken =
    !isGoogleOAuthError &&
    (Boolean(adsCfg?.developerToken) ||
      Boolean(
        googleConn?.connected &&
          !googleConn.isSandboxDemo &&
          googleConn.scopes?.some((s) => s.includes('adwords')),
      ) ||
      realAdsCatalogCount > 0);

  const isPaidAdLeadRecord = (l: {
    contactChannel?: string | null;
    tracking?: {
      marketingSource?: string | null;
      utmSource?: string | null;
      utmMedium?: string | null;
      gclid?: string | null;
    } | null;
  }) => {
    const med = (l.tracking?.utmMedium || '').toLowerCase();
    const src = (l.tracking?.marketingSource || '').toLowerCase();
    return Boolean(
      l.tracking?.gclid ||
        l.contactChannel === 'google_lead_form' ||
        med === 'cpc' ||
        med === 'ppc' ||
        med === 'paid' ||
        src.includes('google ads') ||
        src.includes('facebook ads'),
    );
  };

  const leads = rawLeads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const prevLeads = prevRawLeads.filter((l) =>
    matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite),
  );

  const receivedLeadCount = leads.length;
  const validLeads = leads.filter((l) => isL2Valid(l));
  const validLeadCount = validLeads.length;
  const effectiveLeadCount = leads.filter((l) => isL3Effective(l)).length;
  const spamCount = receivedLeadCount - validLeadCount;

  const prevReceivedCount = prevLeads.length;
  const prevValidLeadsList = prevLeads.filter((l) => isL2Valid(l));
  const prevValidCount = prevValidLeadsList.length;
  const prevWonCount = prevValidLeadsList.filter((l) => l.pipelineStatus === 'won').length;
  const prevValidAttributedAdLeadCount = prevValidLeadsList.filter(isPaidAdLeadRecord).length;
  const prevWinRatePct =
    prevValidCount > 0 ? Number(((prevWonCount / prevValidCount) * 100).toFixed(1)) : null;

  const hasQuoteEvidence = (l: (typeof leads)[number]) =>
    Boolean(l.firstQuoteSentAt) ||
    l.pipelineStatus === 'quote_sent' ||
    l.pipelineStatus === 'won' ||
    l.activities.some((a: { actionType: string }) => a.actionType === 'quote_sent');

  const pendingAcceptanceCount = validLeads.filter(
    (l) => l.pipelineStatus === 'new_lead' && !l.receivedAt,
  ).length;
  const newLeadStageCount = validLeads.filter((l) => l.pipelineStatus === 'new_lead').length;
  const draftingQuoteCount = validLeads.filter((l) => l.pipelineStatus === 'quoting').length;
  const waitingQuoteLeads = validLeads.filter((l) => l.pipelineStatus === 'quote_sent');
  const waitingQuoteCount = waitingQuoteLeads.length;
  const wonLeads = validLeads.filter((l) => l.pipelineStatus === 'won');
  const wonLeadCount = wonLeads.length;
  const lostLeadCount = validLeads.filter((l) => l.pipelineStatus === 'lost').length;
  const quotedLeads = validLeads.filter(hasQuoteEvidence);

  const nowMs = Date.now();
  const overdueQuotes = waitingQuoteLeads.filter((l) => {
    const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
    return (nowMs - refMs) / (1000 * 60 * 60 * 24) >= 7;
  });

  const winRateDenominator = validLeadCount;
  const winRateNumerator = wonLeadCount;
  const winRatePct =
    winRateDenominator > 0
      ? Number(((winRateNumerator / winRateDenominator) * 100).toFixed(1))
      : null;

  // Đối soát chi phí quảng cáo và Lead quảng cáo hợp lệ (C04 & C09 & MK02)
  const validAdLeads = validLeads.filter((l) => isPaidAdLeadRecord(l));

  // Phân nhóm từng campaign theo quy tắc: MULTI_WEBSITE_UNSPLIT tuyệt đối không gán 100% chi phí cho từng web
  const campAggMap = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      platform: string;
      websiteDomain: string | null;
      attributionStatus: 'SINGLE_WEBSITE' | 'MULTI_WEBSITE_UNSPLIT' | 'UNATTRIBUTED';
      spendMicros: bigint;
      clicks: number;
      impressions: number;
      conversionsMicros: bigint;
      finalUrls: Set<string>;
      existingSlug: string | null;
    }
  >();

  for (const r of adsCampaignMetrics) {
    const cid = (r.campaignExternalId || r.campaign?.campaignCode || r.campaign?.campaignName || 'unknown').trim();
    const cname = (r.campaign?.campaignName || r.campaignExternalId || cid).trim();
    const existing = campAggMap.get(cid) || {
      campaignId: cid,
      campaignName: cname,
      platform: r.platform,
      websiteDomain: null,
      attributionStatus: 'UNATTRIBUTED' as const,
      spendMicros: 0n,
      clicks: 0,
      impressions: 0,
      conversionsMicros: 0n,
      finalUrls: new Set<string>(),
      existingSlug: r.campaign?.utmCampaignSlug || null,
    };
    existing.spendMicros += r.spendMicros ?? 0n;
    existing.clicks += r.clicks || 0;
    existing.impressions += r.impressions || 0;
    existing.conversionsMicros += r.conversionsMicros ?? 0n;
    for (const u of r.finalUrls) existing.finalUrls.add(u);
    campAggMap.set(cid, existing);
  }

  let totalAllCampaignMicros = 0n;
  let singleSiteMatchedMicros = 0n;
  let singleSiteMatchedCount = 0;
  let multiWebsiteExcludedMicros = 0n;
  const multiWebsiteCampIds = new Set<string>();
  const scopedCampIds = new Set<string>();
  const adCostMicrosByWebsite = new Map<string, bigint>();

  for (const camp of campAggMap.values()) {
    const attr = classifyCampaignWebsiteAttribution(
      camp.campaignName,
      Array.from(camp.finalUrls),
      camp.existingSlug,
    );
    camp.attributionStatus = attr.status;
    camp.websiteDomain = attr.domain;
    totalAllCampaignMicros += camp.spendMicros;

    if (!scope.selectedWebsite) {
      scopedCampIds.add(camp.campaignId);
    }

    if (attr.status === 'SINGLE_WEBSITE' && attr.domain) {
      const prevDomMicros = adCostMicrosByWebsite.get(attr.domain) ?? 0n;
      adCostMicrosByWebsite.set(attr.domain, prevDomMicros + camp.spendMicros);
      if (scope.selectedWebsite && matchesWebsiteDomain(attr.domain, scope.selectedWebsite)) {
        singleSiteMatchedMicros += camp.spendMicros;
        singleSiteMatchedCount += 1;
        scopedCampIds.add(camp.campaignId);
      }
    } else if (attr.status === 'MULTI_WEBSITE_UNSPLIT') {
      multiWebsiteExcludedMicros += camp.spendMicros;
      multiWebsiteCampIds.add(camp.campaignId);
    }
  }

  let attributedAdCost: number | null = null;
  let adReconciliationNote = '';
  const multiWebsiteExcludedAdCost =
    multiWebsiteExcludedMicros > 0n
      ? Number((Number(multiWebsiteExcludedMicros) / 1_000_000).toFixed(0))
      : null;

  if (adsCampaignMetrics.length > 0) {
    if (!scope.selectedWebsite) {
      attributedAdCost = Number((Number(totalAllCampaignMicros) / 1_000_000).toFixed(0));
      adReconciliationNote =
        multiWebsiteCampIds.size > 0
          ? `Tổng hợp toàn bộ chiến dịch; ${multiWebsiteCampIds.size} chiến dịch đa website không tự chia về từng domain.`
          : 'Tổng chi phí quảng cáo thực tế đối soát với Lead từ quảng cáo.';
    } else if (singleSiteMatchedCount > 0) {
      attributedAdCost = Number((Number(singleSiteMatchedMicros) / 1_000_000).toFixed(0));
      adReconciliationNote =
        multiWebsiteCampIds.size > 0
          ? `Chi phí chiến dịch riêng của ${scope.selectedWebsite.domain} (đã tách riêng ${multiWebsiteCampIds.size} chiến dịch đa website trị giá ${Number((Number(multiWebsiteExcludedMicros) / 1_000_000).toFixed(0)).toLocaleString('vi-VN')} ₫).`
          : `Chi phí chiến dịch gắn riêng cho ${scope.selectedWebsite.domain}.`;
    } else {
      attributedAdCost = null;
      adReconciliationNote =
        multiWebsiteCampIds.size > 0
          ? `Chưa có chiến dịch riêng cho ${scope.selectedWebsite.domain}; có ${multiWebsiteCampIds.size} chiến dịch chạy chung nhiều web (${Number((Number(multiWebsiteExcludedMicros) / 1_000_000).toFixed(0)).toLocaleString('vi-VN')} ₫).`
          : `Chưa có chi phí chiến dịch gắn riêng cho ${scope.selectedWebsite.domain}.`;
    }
  } else if (isGoogleOAuthError) {
    attributedAdCost = null;
    adReconciliationNote =
      'Kết nối Google Ads đang lỗi hoặc hết hạn — vui lòng kết nối lại trong Cài đặt.';
  } else {
    attributedAdCost = hasAdsToken && !scope.selectedWebsite ? 0 : null;
    adReconciliationNote = hasAdsToken
      ? 'Chưa phát sinh chi phí quảng cáo trong kỳ đang chọn.'
      : 'Chưa kết nối tài khoản Google Ads.';
  }

  let prevAdCost: number | null = null;
  if (prevAdsCampaignMetrics.length > 0) {
    if (!scope.selectedWebsite) {
      const m = prevAdsCampaignMetrics.reduce((s, r) => s + (r.spendMicros ?? 0n), 0n);
      prevAdCost = Number((Number(m) / 1_000_000).toFixed(0));
    } else {
      let prevSingleMicros = 0n;
      let prevSingleHits = 0;
      for (const r of prevAdsCampaignMetrics) {
        const attr = classifyCampaignWebsiteAttribution(
          r.campaign?.campaignName || r.campaignExternalId || '',
          r.finalUrls,
          r.campaign?.utmCampaignSlug,
        );
        if (attr.status === 'SINGLE_WEBSITE' && attr.domain && matchesWebsiteDomain(attr.domain, scope.selectedWebsite)) {
          prevSingleMicros += r.spendMicros ?? 0n;
          prevSingleHits += 1;
        }
      }
      prevAdCost = prevSingleHits > 0 ? Number((Number(prevSingleMicros) / 1_000_000).toFixed(0)) : null;
    }
  }
  const prevCostPerValidAdLead = computeCostPerValidAdLead(prevAdCost, prevValidAttributedAdLeadCount);

  const costPerValidAdLead = computeCostPerValidAdLead(attributedAdCost, validAdLeads.length);

  // C09: Dùng phân bố trạng thái hiện tại đúng bản chất dữ liệu (không giả làm phễu tích lũy nhiều bước)
  const pctOf = (count: number) =>
    receivedLeadCount > 0 ? Number(((count / receivedLeadCount) * 100).toFixed(1)) : 0;

  const statusDistribution = [
    {
      statusKey: 'new_lead',
      label: PIPELINE_STATUS_LABELS.new_lead,
      count: newLeadStageCount,
      pctOfTotal: pctOf(newLeadStageCount),
    },
    {
      statusKey: 'quoting',
      label: PIPELINE_STATUS_LABELS.quoting,
      count: draftingQuoteCount,
      pctOfTotal: pctOf(draftingQuoteCount),
    },
    {
      statusKey: 'quote_sent',
      label: PIPELINE_STATUS_LABELS.quote_sent,
      count: waitingQuoteCount,
      pctOfTotal: pctOf(waitingQuoteCount),
    },
    {
      statusKey: 'won',
      label: PIPELINE_STATUS_LABELS.won,
      count: wonLeadCount,
      pctOfTotal: pctOf(wonLeadCount),
    },
    {
      statusKey: 'lost',
      label: PIPELINE_STATUS_LABELS.lost,
      count: lostLeadCount,
      pctOfTotal: pctOf(lostLeadCount),
    },
    ...(spamCount > 0
      ? [
          {
            statusKey: 'spam',
            label: 'Đã xác minh spam (loại trừ)',
            count: spamCount,
            pctOfTotal: pctOf(spamCount),
          },
        ]
      : []),
  ];

  // Giữ leadFunnel tương thích ngược với các bài test cũ trên cùng cohort
  const leadFunnel = [
    { stageKey: 'received', label: 'Lead tiếp nhận', distinctLeadCount: receivedLeadCount },
    { stageKey: 'valid', label: 'Lead hợp lệ', distinctLeadCount: validLeadCount },
    { stageKey: 'quoted', label: 'Có gửi báo giá', distinctLeadCount: quotedLeads.length },
    { stageKey: 'won', label: 'Chốt thành công', distinctLeadCount: wonLeadCount },
  ];

  // Phân tích nhu cầu đủ 25 mặt hàng Toàn Trung theo 3 nhóm ngành + tách bạch Lead chưa gắn mã SP (C09)
  let unclassifiedProductLeadCount = 0;
  let multiProductLeadCount = 0;
  type InternalProdAgg = {
    productId: number;
    productCode: string;
    productName: string;
    categoryGroup: M04ProductCategoryGroup;
    categoryLabel: string;
    unit: string;
    isUnclassifiedProduct: boolean;
    leadCount: number;
    validCount: number;
    newLeadCount: number;
    quotingCount: number;
    quotedCount: number;
    quoteSentCount: number;
    overdueCount: number;
    wonCount: number;
    lostCount: number;
    dimensions: Set<string>;
  };

  const prodMap = new Map<number, InternalProdAgg>();
  for (const catProd of allActiveProducts) {
    const cg = normalizeProductCategoryGroup(catProd.categoryGroup);
    prodMap.set(catProd.id, {
      productId: catProd.id,
      productCode: catProd.productCode,
      productName: catProd.productName,
      categoryGroup: cg,
      categoryLabel: CATEGORY_GROUP_LABELS[cg],
      unit: catProd.unit || 'bộ',
      isUnclassifiedProduct: false,
      leadCount: 0,
      validCount: 0,
      newLeadCount: 0,
      quotingCount: 0,
      quotedCount: 0,
      quoteSentCount: 0,
      overdueCount: 0,
      wonCount: 0,
      lostCount: 0,
      dimensions: new Set<string>(),
    });
  }

  const hintAggMap = new Map<
    string,
    {
      hintKey: string;
      suggestedProductCode: string | null;
      suggestedProductName: string;
      leadCount: number;
      samples: Set<string>;
    }
  >();

  const applyLeadMetricsToProductBucket = (
    bucket: InternalProdAgg,
    leadRow: (typeof leads)[number],
    requestedDimension?: string | null,
  ) => {
    bucket.leadCount += 1;
    if (requestedDimension && requestedDimension.trim()) {
      bucket.dimensions.add(requestedDimension.trim());
    }
    if (isL2Valid(leadRow)) {
      bucket.validCount += 1;
      if (leadRow.pipelineStatus === 'new_lead') bucket.newLeadCount += 1;
      if (leadRow.pipelineStatus === 'quoting') bucket.quotingCount += 1;
      if (hasQuoteEvidence(leadRow)) bucket.quotedCount += 1;
      if (leadRow.pipelineStatus === 'quote_sent') {
        bucket.quoteSentCount += 1;
        const refMs = (leadRow.firstQuoteSentAt || leadRow.updatedAt || leadRow.createdAt).getTime();
        if ((nowMs - refMs) / (1000 * 60 * 60 * 24) >= 7) {
          bucket.overdueCount += 1;
        }
      }
      if (leadRow.pipelineStatus === 'won') bucket.wonCount += 1;
      if (leadRow.pipelineStatus === 'lost') bucket.lostCount += 1;
    }
  };

  for (const l of leads) {
    const uniqueProds = Array.from(
      new Map(l.leadProducts.map((lp) => [lp.productId, lp])).values(),
    );
    if (uniqueProds.length === 0) {
      unclassifiedProductLeadCount += 1;
      const unclass = prodMap.get(0) || {
        productId: 0,
        productCode: 'CHUA_GAN_MA',
        productName: 'Chưa phân loại sản phẩm',
        categoryGroup: 'unclassified' as M04ProductCategoryGroup,
        categoryLabel: CATEGORY_GROUP_LABELS.unclassified,
        unit: 'hồ sơ',
        isUnclassifiedProduct: true,
        leadCount: 0,
        validCount: 0,
        newLeadCount: 0,
        quotingCount: 0,
        quotedCount: 0,
        quoteSentCount: 0,
        overdueCount: 0,
        wonCount: 0,
        lostCount: 0,
        dimensions: new Set<string>(),
      };
      applyLeadMetricsToProductBucket(unclass, l);
      prodMap.set(0, unclass);

      // Read-only hint strictly for data cleanup (never mixed into official product totals)
      const hint = inferUnclassifiedProductHint(l.projectName);
      const existingHint = hintAggMap.get(hint.hintKey) || {
        ...hint,
        leadCount: 0,
        samples: new Set<string>(),
      };
      existingHint.leadCount += 1;
      const cleanProj = sanitizeProjectOrSubjectText(l.projectName);
      if (cleanProj && existingHint.samples.size < 4 && !anonymized) {
        existingHint.samples.add(cleanProj.slice(0, 48));
      }
      hintAggMap.set(hint.hintKey, existingHint);
      continue;
    }

    if (uniqueProds.length > 1) {
      multiProductLeadCount += 1;
    }
    for (const lp of uniqueProds) {
      const cg = normalizeProductCategoryGroup(lp.product.categoryGroup);
      const cur = prodMap.get(lp.productId) || {
        productId: lp.productId,
        productCode: lp.product.productCode || `SP_${lp.productId}`,
        productName: lp.product.productName,
        categoryGroup: cg,
        categoryLabel: CATEGORY_GROUP_LABELS[cg],
        unit: lp.product.unit || 'bộ',
        isUnclassifiedProduct: false,
        leadCount: 0,
        validCount: 0,
        newLeadCount: 0,
        quotingCount: 0,
        quotedCount: 0,
        quoteSentCount: 0,
        overdueCount: 0,
        wonCount: 0,
        lostCount: 0,
        dimensions: new Set<string>(),
      };
      applyLeadMetricsToProductBucket(cur, l, lp.requestedDimension);
      prodMap.set(lp.productId, cur);
    }
  }

  const totalClassifiedLeadHits = Array.from(prodMap.values())
    .filter((p) => !p.isUnclassifiedProduct)
    .reduce((sum, p) => sum + p.leadCount, 0);

  const toCatalogRow = (p: InternalProdAgg): M04ProductCatalogRowDto => ({
    productId: p.productId,
    productCode: p.productCode,
    productName: p.productName,
    categoryGroup: p.categoryGroup,
    categoryLabel: p.categoryLabel,
    unit: p.unit,
    isUnclassifiedProduct: p.isUnclassifiedProduct,
    leadCount: p.leadCount,
    validCount: p.validCount,
    newLeadCount: p.newLeadCount,
    quotingCount: p.quotingCount,
    quotedCount: p.quotedCount,
    quoteSentCount: p.quoteSentCount,
    overdueCount: p.overdueCount,
    wonCount: p.wonCount,
    lostCount: p.lostCount,
    winRatePct: p.validCount > 0 ? Number(((p.wonCount / p.validCount) * 100).toFixed(1)) : null,
    shareOfClassifiedPct:
      !p.isUnclassifiedProduct && totalClassifiedLeadHits > 0
        ? Number(((p.leadCount / totalClassifiedLeadHits) * 100).toFixed(1))
        : null,
    requestedDimensions: Array.from(p.dimensions).slice(0, 5),
  });

  const allCatalogMappedRows = Array.from(prodMap.values())
    .filter((p) => !p.isUnclassifiedProduct)
    .map(toCatalogRow);

  const categorySortOrder: Record<M04ProductCategoryGroup, number> = {
    led_screen: 1,
    electronic_board: 2,
    other: 3,
    unclassified: 4,
  };

  allCatalogMappedRows.sort(
    (a, b) =>
      categorySortOrder[a.categoryGroup] - categorySortOrder[b.categoryGroup] ||
      b.leadCount - a.leadCount ||
      a.productId - b.productId,
  );

  const unclassifiedCatalogRow = prodMap.get(0) ? toCatalogRow(prodMap.get(0)!) : null;
  const byProductCatalog: M04ProductCatalogRowDto[] = [
    ...allCatalogMappedRows,
    ...(unclassifiedCatalogRow ? [unclassifiedCatalogRow] : []),
  ];

  const classifiedProductRows = allCatalogMappedRows
    .filter((p) => p.leadCount > 0)
    .sort((a, b) => b.leadCount - a.leadCount);

  const byProduct = [
    ...classifiedProductRows,
    ...(unclassifiedCatalogRow ? [unclassifiedCatalogRow] : []),
  ];

  const productCategorySummaries: M04ProductCategorySummaryDto[] = (
    ['led_screen', 'electronic_board', 'other'] as M04ProductCategoryGroup[]
  ).map((cg) => {
    const groupRows = allCatalogMappedRows.filter((r) => r.categoryGroup === cg);
    const gLeads = groupRows.reduce((s, r) => s + r.leadCount, 0);
    const gValid = groupRows.reduce((s, r) => s + r.validCount, 0);
    const gQuoted = groupRows.reduce((s, r) => s + r.quotedCount, 0);
    const gOverdue = groupRows.reduce((s, r) => s + r.overdueCount, 0);
    const gWon = groupRows.reduce((s, r) => s + r.wonCount, 0);
    return {
      categoryGroup: cg,
      categoryLabel: CATEGORY_GROUP_LABELS[cg],
      catalogProductCount: groupRows.length,
      activeProductCount: groupRows.filter((r) => r.leadCount > 0).length,
      leadCount: gLeads,
      validCount: gValid,
      quotedCount: gQuoted,
      overdueCount: gOverdue,
      wonCount: gWon,
      winRatePct: gValid > 0 ? Number(((gWon / gValid) * 100).toFixed(1)) : null,
    };
  });

  if (unclassifiedCatalogRow) {
    productCategorySummaries.push({
      categoryGroup: 'unclassified',
      categoryLabel: CATEGORY_GROUP_LABELS.unclassified,
      catalogProductCount: 0,
      activeProductCount: 1,
      leadCount: unclassifiedCatalogRow.leadCount,
      validCount: unclassifiedCatalogRow.validCount,
      quotedCount: unclassifiedCatalogRow.quotedCount,
      overdueCount: unclassifiedCatalogRow.overdueCount,
      wonCount: unclassifiedCatalogRow.wonCount,
      winRatePct: unclassifiedCatalogRow.winRatePct,
    });
  }

  const unclassifiedProductHints: M04UnclassifiedProductHintDto[] = Array.from(hintAggMap.values())
    .map((h) => ({
      hintKey: h.hintKey,
      suggestedProductCode: h.suggestedProductCode,
      suggestedProductName: h.suggestedProductName,
      leadCount: h.leadCount,
      sampleProjects: Array.from(h.samples),
    }))
    .sort((a, b) => b.leadCount - a.leadCount);

  // Đối soát đầy đủ theo nhân sự (C04 & C09: cộng khớp 100% với receivedLeadCount, làm rõ giao ngoài nhóm Sales / chưa giao / ngưng hoạt động)
  const salesMap = new Map<
    number,
    {
      salesId: number;
      salesName: string;
      roleLabel?: string;
      isReconciliationBucket?: boolean;
      leadCount: number;
      validCount: number;
      quotedCount: number;
      waitingCount: number;
      wonCount: number;
      overdueCount: number;
    }
  >();

  for (const l of leads) {
    const sid = l.assignedSalesId || 0;
    const roleCode = l.assignedSales?.role?.roleCode || null;
    const isStandardSales = roleCode === 'SALES' || roleCode === 'SALES_LEAD';
    const isInactive = l.assignedSales ? !l.assignedSales.isActive : false;
    const roleNote = !l.assignedSales
      ? 'Chưa giao nhân sự'
      : !isStandardSales
        ? `Ngoài danh sách Sales (${l.assignedSales.role?.roleName || roleCode})`
        : isInactive
          ? 'Nhân sự ngừng hoạt động'
          : l.assignedSales.role?.roleName || 'Kinh doanh';

    const sname = l.assignedSales
      ? !isStandardSales
        ? `${l.assignedSales.fullName} (${l.assignedSales.role?.roleName || roleCode})`
        : isInactive
          ? `${l.assignedSales.fullName} (Ngừng hoạt động)`
          : l.assignedSales.fullName
      : 'Chưa phân bổ';

    const cur = salesMap.get(sid) || {
      salesId: sid,
      salesName: sname,
      roleLabel: roleNote,
      isReconciliationBucket: !l.assignedSales || !isStandardSales,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      waitingCount: 0,
      wonCount: 0,
      overdueCount: 0,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) cur.validCount += 1;
    if (isL2Valid(l) && hasQuoteEvidence(l)) cur.quotedCount += 1;
    if (isL2Valid(l) && l.pipelineStatus === 'quote_sent') {
      cur.waitingCount += 1;
      const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
      if ((nowMs - refMs) / (1000 * 60 * 60 * 24) >= 7) cur.overdueCount += 1;
    }
    if (isL2Valid(l) && l.pipelineStatus === 'won') cur.wonCount += 1;
    salesMap.set(sid, cur);
  }

  const bySales = Array.from(salesMap.values()).sort((a, b) => {
    if (Boolean(a.isReconciliationBucket) !== Boolean(b.isReconciliationBucket)) {
      return a.isReconciliationBucket ? 1 : -1;
    }
    return b.leadCount - a.leadCount;
  });

  // Phân tích theo Website nguồn (không cộng lặp, làm rõ phần chưa xác định website)
  const webMap = new Map<
    string,
    {
      website: string;
      isUnclassifiedWebsite?: boolean;
      leadCount: number;
      validCount: number;
      quotedCount: number;
      wonCount: number;
      adLeadCount: number;
      cpl: number | null;
    }
  >();

  for (const l of leads) {
    const cleanWeb = sanitizeWebsiteSourceDisplay(l.sourceWebsite).cleanLabel;
    const isUnclassified = !cleanWeb;
    const wKey = cleanWeb || 'Chưa xác định';
    const cur = webMap.get(wKey) || {
      website: wKey,
      isUnclassifiedWebsite: isUnclassified,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      wonCount: 0,
      adLeadCount: 0,
      cpl: null,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) {
      cur.validCount += 1;
      if (hasQuoteEvidence(l)) cur.quotedCount += 1;
      const ch = normalizeMarketingChannelDisplay({
        marketingSource: l.tracking?.marketingSource,
        utmSource: l.tracking?.utmSource,
        utmMedium: l.tracking?.utmMedium,
        gclid: l.tracking?.gclid,
        contactChannel: l.contactChannel,
      });
      if (ch === 'Google Ads' || ch === 'Quảng cáo Facebook') {
        cur.adLeadCount += 1;
      }
      if (l.pipelineStatus === 'won') cur.wonCount += 1;
    }
    webMap.set(wKey, cur);
  }

  const byWebsite = Array.from(webMap.values())
    .map((w) => {
      const webMicros = !w.isUnclassifiedWebsite ? adCostMicrosByWebsite.get(w.website.toLowerCase()) ?? null : null;
      const webAdCost = webMicros !== null ? Number((Number(webMicros) / 1_000_000).toFixed(0)) : null;
      return {
        ...w,
        adCost: webAdCost,
        cpl: computeCostPerValidAdLead(webAdCost, w.adLeadCount),
        winRatePct: w.validCount > 0 ? Number(((w.wonCount / w.validCount) * 100).toFixed(1)) : null,
      };
    })
    .sort((a, b) => {
      if (Boolean(a.isUnclassifiedWebsite) !== Boolean(b.isUnclassifiedWebsite)) {
        return a.isUnclassifiedWebsite ? 1 : -1;
      }
      return b.leadCount - a.leadCount;
    });

  // Phân tích theo Kênh marketing chuẩn hóa (C04: tách khỏi hình thức liên hệ, không tự gán Organic/Direct)
  const chMap = new Map<
    string,
    { channel: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }
  >();
  for (const l of leads) {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    const cur = chMap.get(ch) || {
      channel: ch,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      wonCount: 0,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) {
      cur.validCount += 1;
      if (hasQuoteEvidence(l)) cur.quotedCount += 1;
      if (l.pipelineStatus === 'won') cur.wonCount += 1;
    }
    chMap.set(ch, cur);
  }

  const byChannel = Array.from(chMap.values())
    .map((c) => ({
      ...c,
      winRatePct: c.validCount > 0 ? Number(((c.wonCount / c.validCount) * 100).toFixed(1)) : null,
      shareOfValidPct: validLeadCount > 0 ? Number(((c.validCount / validLeadCount) * 100).toFixed(1)) : null,
    }))
    .sort((a, b) => {
      if ((a.channel === 'Chưa xác định') !== (b.channel === 'Chưa xác định')) {
        return a.channel === 'Chưa xác định' ? 1 : -1;
      }
      return b.validCount - a.validCount || b.leadCount - a.leadCount;
    });

  // Đối chiếu theo từng Chiến dịch (MK02)
  const crmCampaignStats = new Map<
    string,
    { received: number; valid: number; validAd: number; won: number }
  >();
  for (const l of leads) {
    const rawKey = (l.tracking?.utmCampaign || l.tracking?.campaignName || '').trim().toLowerCase();
    if (!rawKey) continue;
    const prev = crmCampaignStats.get(rawKey) || { received: 0, valid: 0, validAd: 0, won: 0 };
    prev.received += 1;
    if (isL2Valid(l)) {
      prev.valid += 1;
      if (isPaidAdLeadRecord(l)) prev.validAd += 1;
      if (l.pipelineStatus === 'won') prev.won += 1;
    }
    crmCampaignStats.set(rawKey, prev);
  }

  const byCampaign = Array.from(campAggMap.values())
    .filter((camp) => {
      if (!scope.selectedWebsite) return true;
      return camp.attributionStatus === 'SINGLE_WEBSITE' && camp.websiteDomain && matchesWebsiteDomain(camp.websiteDomain, scope.selectedWebsite);
    })
    .map((camp) => {
      const adCost = Number((Number(camp.spendMicros) / 1_000_000).toFixed(0));
      const conv = Number((Number(camp.conversionsMicros) / 1_000_000).toFixed(1));
      const strippedId = camp.campaignId.replace(/^GADS_/i, '').trim().toLowerCase();
      const matched =
        crmCampaignStats.get(camp.campaignName.trim().toLowerCase()) ||
        crmCampaignStats.get(camp.campaignId.trim().toLowerCase()) ||
        crmCampaignStats.get(strippedId) ||
        { received: 0, valid: 0, validAd: 0, won: 0 };
      return {
        campaignId: camp.campaignId,
        campaignName: camp.campaignName,
        platform: camp.platform,
        websiteDomain: camp.websiteDomain,
        attributionStatus: camp.attributionStatus,
        adCost,
        clicks: camp.clicks,
        impressions: camp.impressions,
        platformConversions: conv,
        receivedLeadCount: matched.received,
        validLeadCount: matched.valid,
        validAttributedAdLeadCount: matched.validAd,
        costPerValidAdLead: computeCostPerValidAdLead(adCost, matched.validAd),
        wonLeadCount: matched.won,
        winRatePct: matched.valid > 0 ? Number(((matched.won / matched.valid) * 100).toFixed(1)) : null,
      };
    })
    .sort((a, b) => (b.adCost ?? 0) - (a.adCost ?? 0) || b.clicks - a.clicks);

  // Chuỗi thời gian theo ngày (0 cho ngày xác nhận không có Lead, null ngoài ngưỡng tương lai)
  const dayFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayStr = dayFmt.format(new Date());
  const leadDayMap = new Map<string, { received: number; valid: number; won: number }>();
  for (const l of leads) {
    const dk = dayFmt.format(l.createdAt);
    const cur = leadDayMap.get(dk) || { received: 0, valid: 0, won: 0 };
    cur.received += 1;
    if (isL2Valid(l)) {
      cur.valid += 1;
      if (l.pipelineStatus === 'won') cur.won += 1;
    }
    leadDayMap.set(dk, cur);
  }
  const adCostDayMap = new Map<string, bigint>();
  if (attributedAdCost !== null) {
    for (const r of adsCampaignMetrics) {
      const cid = (r.campaignExternalId || r.campaign?.campaignCode || r.campaign?.campaignName || 'unknown').trim();
      if (!scopedCampIds.has(cid) || !r.metricDate) continue;
      adCostDayMap.set(r.metricDate, (adCostDayMap.get(r.metricDate) ?? 0n) + (r.spendMicros ?? 0n));
    }
  }

  const timeSeries: NonNullable<M04ResultsReportDto['timeSeries']> = [];
  {
    const cursor = new Date(`${scope.startDateStr}T00:00:00Z`);
    const endDt = new Date(`${scope.endDateStr}T00:00:00Z`);
    let safety = 0;
    while (cursor <= endDt && safety < 400) {
      safety += 1;
      const dStr = cursor.toISOString().slice(0, 10);
      const isFuture = dStr > todayStr;
      const dayCounts = leadDayMap.get(dStr) || { received: 0, valid: 0, won: 0 };
      const dayCost = attributedAdCost !== null
        ? Number((Number(adCostDayMap.get(dStr) ?? 0n) / 1_000_000).toFixed(0))
        : null;
      timeSeries.push({
        bucketStart: dStr,
        bucketEnd: dStr,
        label: `${dStr.slice(8, 10)}/${dStr.slice(5, 7)}`,
        receivedLeadCount: isFuture ? null : dayCounts.received,
        validLeadCount: isFuture ? null : dayCounts.valid,
        wonLeadCount: isFuture ? null : dayCounts.won,
        adCost: isFuture ? null : dayCost,
        isMissingDay: isFuture,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  const prevLeadDayMap = new Map<string, { received: number; valid: number; won: number }>();
  for (const l of prevLeads) {
    const dk = dayFmt.format(l.createdAt);
    const cur = prevLeadDayMap.get(dk) || { received: 0, valid: 0, won: 0 };
    cur.received += 1;
    if (isL2Valid(l)) {
      cur.valid += 1;
      if (l.pipelineStatus === 'won') cur.won += 1;
    }
    prevLeadDayMap.set(dk, cur);
  }
  const previousTimeSeries: NonNullable<M04ResultsReportDto['previousTimeSeries']> = [];
  {
    const cursor = new Date(`${scope.prevStartDateStr}T00:00:00Z`);
    const endDt = new Date(`${scope.prevEndDateStr}T00:00:00Z`);
    let safety = 0;
    while (cursor <= endDt && safety < 400) {
      safety += 1;
      const dStr = cursor.toISOString().slice(0, 10);
      const isFuture = dStr > todayStr;
      const dayCounts = prevLeadDayMap.get(dStr) || { received: 0, valid: 0, won: 0 };
      previousTimeSeries.push({
        bucketStart: dStr,
        label: `${dStr.slice(8, 10)}/${dStr.slice(5, 7)}`,
        receivedLeadCount: isFuture ? null : dayCounts.received,
        validLeadCount: isFuture ? null : dayCounts.valid,
        wonLeadCount: isFuture ? null : dayCounts.won,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  // Chuỗi chốt kỳ chính xác theo Ngày / Tuần / Tháng / Năm (cộng tổng khớp 100% metrics kỳ)
  const periodBucketDefs = enumeratePeriodBuckets(
    scope.startDateStr,
    scope.endDateStr,
    effectiveGranularity,
  );
  const periodAggMap = new Map<
    string,
    {
      bucketKey: string;
      bucketStart: string;
      bucketEnd: string;
      label: string;
      receivedLeadCount: number;
      validLeadCount: number;
      quotedLeadCount: number;
      wonLeadCount: number;
      lostLeadCount: number;
      adLeadCount: number;
      adCostMicros: bigint;
    }
  >();
  for (const def of periodBucketDefs) {
    periodAggMap.set(def.key, {
      bucketKey: def.key,
      bucketStart: def.start,
      bucketEnd: def.end,
      label: def.label,
      receivedLeadCount: 0,
      validLeadCount: 0,
      quotedLeadCount: 0,
      wonLeadCount: 0,
      lostLeadCount: 0,
      adLeadCount: 0,
      adCostMicros: 0n,
    });
  }

  for (const l of leads) {
    const dk = dayFmt.format(l.createdAt);
    const meta = getBucketMetaForYmd(dk, effectiveGranularity);
    let entry = periodAggMap.get(meta.key);
    if (!entry) {
      entry = {
        bucketKey: meta.key,
        bucketStart: meta.start < scope.startDateStr ? scope.startDateStr : meta.start,
        bucketEnd: meta.end > scope.endDateStr ? scope.endDateStr : meta.end,
        label: meta.label,
        receivedLeadCount: 0,
        validLeadCount: 0,
        quotedLeadCount: 0,
        wonLeadCount: 0,
        lostLeadCount: 0,
        adLeadCount: 0,
        adCostMicros: 0n,
      };
      periodAggMap.set(meta.key, entry);
    }
    entry.receivedLeadCount += 1;
    if (isL2Valid(l)) {
      entry.validLeadCount += 1;
      if (hasQuoteEvidence(l)) entry.quotedLeadCount += 1;
      if (l.pipelineStatus === 'won') entry.wonLeadCount += 1;
      if (l.pipelineStatus === 'lost') entry.lostLeadCount += 1;
      if (isPaidAdLeadRecord(l)) entry.adLeadCount += 1;
    }
  }

  if (attributedAdCost !== null) {
    for (const [metricDate, micros] of adCostDayMap.entries()) {
      const meta = getBucketMetaForYmd(metricDate, effectiveGranularity);
      const entry = periodAggMap.get(meta.key);
      if (entry) {
        entry.adCostMicros += micros;
      }
    }
  }

  const periodBuckets: M04PeriodBucketRowDto[] = Array.from(periodAggMap.values())
    .sort((a, b) => a.bucketStart.localeCompare(b.bucketStart))
    .map((b) => {
      const bucketAdCost =
        attributedAdCost !== null
          ? Number((Number(b.adCostMicros) / 1_000_000).toFixed(0))
          : null;
      return {
        bucketKey: b.bucketKey,
        bucketStart: b.bucketStart,
        bucketEnd: b.bucketEnd,
        label: b.label,
        receivedLeadCount: b.receivedLeadCount,
        validLeadCount: b.validLeadCount,
        quotedLeadCount: b.quotedLeadCount,
        wonLeadCount: b.wonLeadCount,
        lostLeadCount: b.lostLeadCount,
        adLeadCount: b.adLeadCount,
        adCost: bucketAdCost,
        cpl: computeCostPerValidAdLead(bucketAdCost, b.adLeadCount),
        winRatePct:
          b.validLeadCount > 0
            ? Number(((b.wonLeadCount / b.validLeadCount) * 100).toFixed(1))
            : null,
        isPreliminary: b.bucketStart <= todayStr && b.bucketEnd >= todayStr,
      };
    });

  const periodBreakdown: M04PeriodBreakdownDto = {
    granularity: effectiveGranularity,
    granularityLabel: GRANULARITY_LABELS[effectiveGranularity],
    timezone: scope.timezone,
    buckets: periodBuckets,
    totals: {
      receivedLeadCount,
      validLeadCount,
      quotedLeadCount: quotedLeads.length,
      wonLeadCount,
      lostLeadCount,
      adLeadCount: validAdLeads.length,
      adCost: attributedAdCost,
      cpl: costPerValidAdLead,
      winRatePct,
    },
  };

  const missingWebsiteCount = leads.filter(
    (l) => !sanitizeWebsiteSourceDisplay(l.sourceWebsite).cleanLabel,
  ).length;
  const unknownChannelCount = leads.filter((l) => {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    return ch === 'Chưa xác định';
  }).length;
  const attributionCoveragePct =
    receivedLeadCount > 0
      ? Number((((receivedLeadCount - missingWebsiteCount) / receivedLeadCount) * 100).toFixed(1))
      : null;

  const matchingSeoReport =
    seoReports.find((r) =>
      scope.selectedWebsite
        ? r.website.toLowerCase().includes(scope.selectedWebsite.domain.toLowerCase())
        : r.website.toLowerCase().includes('tất cả') || r.website === 'all',
    ) || seoReports[0] || null;

  const summaryFindings: NonNullable<M04ResultsReportDto['marketingInsights']>['summaryFindings'] = [];
  if (attributedAdCost !== null) {
    summaryFindings.push({
      id: 'ad_efficiency',
      severity: costPerValidAdLead !== null && validAdLeads.length > 0 ? 'info' : 'warning',
      title: 'Chi phí quảng cáo & CPL',
      evidenceText:
        validAdLeads.length > 0 && costPerValidAdLead !== null
          ? `Chi phí ${attributedAdCost.toLocaleString('vi-VN')} ₫ mang về ${validAdLeads.length} Lead quảng cáo hợp lệ (CPL: ${Math.round(costPerValidAdLead).toLocaleString('vi-VN')} ₫/Lead).`
          : `Ghi nhận ${attributedAdCost.toLocaleString('vi-VN')} ₫ chi tiêu trong kỳ nhưng chưa có Lead quảng cáo hợp lệ gắn GCLID/UTM trùng khớp để tính CPL.`,
      actionHref: `/tracking?section=ads_campaigns&websiteId=${encodeURIComponent(scope.websiteId)}`,
      actionLabel: 'Kiểm tra chiến dịch',
    });
  }
  if (multiWebsiteCampIds.size > 0 && scope.selectedWebsite && multiWebsiteExcludedAdCost !== null) {
    summaryFindings.push({
      id: 'multi_site_excluded',
      severity: 'info',
      title: `Có ${multiWebsiteCampIds.size} chiến dịch chạy chung nhiều website`,
      evidenceText: `Tổng ${multiWebsiteExcludedAdCost.toLocaleString('vi-VN')} ₫ chi tiêu chạy chung nhiều tên miền được tách khỏi bộ lọc ${scope.selectedWebsite.domain} để tránh cộng nhầm.`,
    });
  }
  if (validLeadCount > 0) {
    summaryFindings.push({
      id: 'lead_conversion_cohort',
      severity: wonLeadCount > 0 ? 'info' : 'warning',
      title: 'Hiệu quả chuyển đổi trong kỳ',
      evidenceText: `Trong ${receivedLeadCount} Lead tiếp nhận có ${validLeadCount} Lead hợp lệ, tỷ lệ chốt đạt ${winRatePct !== null ? `${winRatePct}%` : '—'} (${wonLeadCount} chốt${overdueQuotes.length > 0 ? `, ${overdueQuotes.length} báo giá quá hạn >7 ngày` : ''}).`,
      actionHref: `/leads?from=${encodeURIComponent(scope.startDateStr)}&to=${encodeURIComponent(scope.endDateStr)}${scope.websiteId !== 'all' ? `&websiteId=${encodeURIComponent(scope.websiteId)}` : ''}`,
      actionLabel: 'Mở danh sách Lead',
    });
  }
  if (unclassifiedProductLeadCount > 0) {
    summaryFindings.push({
      id: 'missing_product_classification',
      severity: 'action',
      title: `${unclassifiedProductLeadCount} Lead chưa gắn sản phẩm quan tâm`,
      evidenceText: `Cần rà soát và gắn dòng sản phẩm cho ${unclassifiedProductLeadCount} hồ sơ để báo cáo theo sản phẩm phản ánh đúng nhu cầu thực tế.`,
      actionHref: `/leads?from=${encodeURIComponent(scope.startDateStr)}&to=${encodeURIComponent(scope.endDateStr)}${scope.websiteId !== 'all' ? `&websiteId=${encodeURIComponent(scope.websiteId)}` : ''}`,
      actionLabel: 'Gắn sản phẩm Lead',
    });
  }

  const recommendedActions: NonNullable<M04ResultsReportDto['marketingInsights']>['recommendedActions'] = [
    {
      id: 'propose_seo_content',
      title: 'Đề xuất bài nội dung SEO',
      reason: matchingSeoReport
        ? `Dựa trên snapshot SEO gần nhất (${matchingSeoReport.snapshot.current.totalClicks} clicks / ${matchingSeoReport.snapshot.current.totalImpressions} impressions).`
        : 'Tạo đề xuất bài viết mới trên module Từ khóa & SEO theo phạm vi website đang chọn.',
      targetType: 'seo_content',
      href: `/ads?tab=content&website=${encodeURIComponent(scope.domain || 'toantrung.com.vn')}`,
    },
    {
      id: 'create_design_brief',
      title: 'Tạo brief thiết kế cho chiến dịch',
      reason: `Giữ nguyên bối cảnh phạm vi ${scope.websiteLabel} (${scope.startDateStr} → ${scope.endDateStr}) để team Thiết kế xử lý banner/ấn phẩm mới.`,
      targetType: 'design_brief',
      href: `/design?fromBrief=1&taskCode=banner_generate&sourceModule=reports&websiteId=${encodeURIComponent(scope.websiteId)}&dateFrom=${encodeURIComponent(scope.startDateStr)}&dateTo=${encodeURIComponent(scope.endDateStr)}`,
      prefillParams: {
        websiteId: scope.websiteId,
        websiteDomain: scope.domain || '',
        dateFrom: scope.startDateStr,
        dateTo: scope.endDateStr,
        sourceModule: 'reports',
      },
    },
  ];

  const pendingActionRows = waitingQuoteLeads
    .map((l) => {
      const refDate = l.firstQuoteSentAt || l.updatedAt || l.createdAt;
      const waitingDays = Math.max(
        0,
        Math.floor((nowMs - refDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      return {
        leadId: l.id,
        leadCode: l.leadCode,
        customerLabel: anonymized
          ? 'Khách hàng ẩn danh'
          : l.companyName || l.contactName || l.phone || l.leadCode,
        assignedSalesName: l.assignedSales?.fullName || 'Chưa phân bổ',
        website: sanitizeWebsiteSourceDisplay(l.sourceWebsite).cleanLabel || 'Chưa xác định',
        quoteSentAt: refDate.toISOString(),
        waitingDays,
      };
    })
    .sort((a, b) => b.waitingDays - a.waitingDays);

  // Hoạt động xử lý phát sinh trong kỳ [startDateTime..endDateTime], bao gồm cả Lead tạo từ kỳ trước
  const receivedInPeriodCount = receivedInPeriodRows.filter((l) =>
    matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite),
  ).length;
  const quotedInPeriodLeadMap = new Map<number, Date>();
  for (const r of firstQuoteInPeriodRows) {
    if (matchesWebsiteDomain(r.sourceWebsite, scope.selectedWebsite)) {
      quotedInPeriodLeadMap.set(r.id, r.createdAt);
    }
  }
  const wonInPeriodLeadMap = new Map<number, Date>();
  for (const r of closedWonInPeriodRows) {
    if (matchesWebsiteDomain(r.sourceWebsite, scope.selectedWebsite)) {
      wonInPeriodLeadMap.set(r.id, r.createdAt);
    }
  }
  const lostInPeriodLeadMap = new Map<number, Date>();
  for (const act of periodActivityRows) {
    if (!matchesWebsiteDomain(act.lead.sourceWebsite, scope.selectedWebsite)) continue;
    if (
      act.actionType === 'quote_sent' ||
      (act.actionType === 'status_change' && act.newStatus === 'quote_sent')
    ) {
      quotedInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
    if (act.actionType === 'status_change' && act.newStatus === 'won') {
      wonInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
    if (act.actionType === 'status_change' && act.newStatus === 'lost') {
      lostInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
  }
  const priorCohortLeadIds = new Set<number>();
  for (const [lid, createdAt] of [
    ...quotedInPeriodLeadMap.entries(),
    ...wonInPeriodLeadMap.entries(),
    ...lostInPeriodLeadMap.entries(),
  ]) {
    if (createdAt < scope.startDateTime) {
      priorCohortLeadIds.add(lid);
    }
  }

  const detailedLeadRows = leads.map((lead, idx) => {
    const cleanCompany = lead.companyName
      ? lead.companyName.replace(/\s*\(Dữ liệu tổng hợp\)/gi, '')
      : null;
    const rawCompanyOrContact =
      [cleanCompany, lead.contactName].filter(Boolean).join(' — ') ||
      `Khách hàng #${lead.leadCode}`;
    const cleanProject = sanitizeProjectOrSubjectText(lead.projectName);
    const cleanWeb = sanitizeWebsiteSourceDisplay(lead.sourceWebsite).cleanLabel || 'Chưa xác định';
    const cleanMkt = normalizeMarketingChannelDisplay({
      marketingSource: lead.tracking?.marketingSource,
      utmSource: lead.tracking?.utmSource,
      utmMedium: lead.tracking?.utmMedium,
      gclid: lead.tracking?.gclid,
      contactChannel: lead.contactChannel,
    });
    return {
      stt: idx + 1,
      leadId: lead.id,
      leadCode: lead.leadCode,
      receivedAt: lead.createdAt.toISOString(),
      assignedSalesName: lead.assignedSales?.fullName || 'Chưa phân bổ',
      companyOrCustomer: anonymized ? 'Khách hàng ẩn danh' : rawCompanyOrContact,
      phone: anonymized ? maskPhoneForReportSpec(lead.phone) : lead.phone || 'Chưa xác định',
      sourceWebsite: cleanWeb,
      contactChannel: formatContactChannelClean(lead.contactChannel as ContactChannel),
      marketingSource: cleanMkt,
      productsText:
        lead.leadProducts.map((lp) => lp.product.productName).join(', ') || 'Chưa phân loại',
      pipelineStatus: lead.isSpam ? 'spam' : lead.pipelineStatus,
      pipelineStatusLabel: lead.isSpam
        ? 'Spam (đã loại trừ)'
        : PIPELINE_STATUS_LABELS[lead.pipelineStatus as PipelineStatus] ?? lead.pipelineStatus,
      noteOrReason: anonymized
        ? lead.lostReason || (lead.isSpam ? 'Đã loại trừ spam' : '—')
        : lead.lostReason || lead.spamReason || cleanProject || '—',
      isAnonymized: anonymized,
    };
  });

  const latestLeadDate = leads.length > 0 ? getVietnamDateParts(leads[0].createdAt).dateStr : null;
  let latestAdsMetricDate: string | null = null;
  for (const m of adsCampaignMetrics) {
    if (m.metricDate && (!latestAdsMetricDate || m.metricDate > latestAdsMetricDate)) {
      latestAdsMetricDate = m.metricDate;
    }
  }
  const actualDataThrough =
    latestLeadDate && latestAdsMetricDate
      ? (latestLeadDate > latestAdsMetricDate ? latestLeadDate : latestAdsMetricDate)
      : latestLeadDate || latestAdsMetricDate;
  const hasAnyData = leads.length > 0 || adsCampaignMetrics.length > 0 || receivedInPeriodCount > 0;
  const realLastSuccessAt = latestSync?.completedAt ? latestSync.completedAt.toISOString() : null;

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition:
        'Tính trên nhóm Lead tạo trong khoảng ngày và phạm vi website đang chọn.',
      previousStartDate: scope.prevStartDateStr,
      previousEndDate: scope.prevEndDateStr,
    },
    freshness: {
      lastCheckedAt: checkedAt,
      checkedAt,
      lastSuccessAt: realLastSuccessAt,
      lastSyncedAt: realLastSuccessAt,
      dataThrough: actualDataThrough,
      latestSourceDataAt: actualDataThrough,
      fromCache: false,
      state: !hasAnyData
        ? 'NO_DATA'
        : scope.isTodayIncluded
          ? 'PRELIMINARY'
          : 'FINALIZED',
      statusMessage: !hasAnyData
        ? 'Chưa có phát sinh Lead hoặc dữ liệu đối soát Ads trong kỳ đang chọn.'
        : scope.isTodayIncluded
          ? 'Số liệu trong ngày đang tạm tính.'
          : actualDataThrough
            ? `Dữ liệu đến ${actualDataThrough}`
            : `Phạm vi ${scope.startDateStr} → ${scope.endDateStr}`,
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: [],
      note:
        !scope.selectedWebsite && webMap.has('Chưa xác định')
          ? `Bao gồm ${webMap.get('Chưa xác định')!.leadCount} Lead chưa xác định website nguồn (từ Hotline, Zalo hoặc nhập tay). Khi lọc 1 website cụ thể, nhóm chưa xác định website được tách riêng.`
          : null,
    },
    version: `m04-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${receivedLeadCount}-${wonLeadCount}`,
    scopeRole: user.roleCode,
    scopeDescription:
      user.roleCode === 'SALES'
        ? `Phạm vi cá nhân (${user.fullName})`
        : anonymized
          ? 'Phạm vi Marketing / Thiết kế (đã che thông tin liên hệ khách hàng)'
          : 'Phạm vi toàn công ty',
    metrics: {
      totalLeadCount: receivedLeadCount,
      receivedLeadCount,
      validLeadCount,
      effectiveLeadCount,
      l2Count: validLeadCount,
      l3Count: effectiveLeadCount,
      pendingAcceptanceCount,
      draftingQuoteCount,
      waitingQuoteCount,
      wonLeadCount,
      lostLeadCount,
      winRatePct,
      winRateNumerator,
      winRateDenominator,
      winRateDefinition:
        'Tỷ lệ chốt = Chốt thành công / Lead hợp lệ trong cùng kỳ và phạm vi website.',
      attributedAdCost,
      adCost: attributedAdCost,
      validAdLeadCount: validAdLeads.length,
      validAttributedAdLeadCount: validAdLeads.length,
      adReconciliationNote,
      costPerValidAdLead,
      currencyCode: 'VND',
      overdueQuoteCount: overdueQuotes.length,
      unclassifiedProductLeadCount,
      multiWebsiteExcludedAdCost,
      multiWebsiteCampaignCount: multiWebsiteCampIds.size,
      previousReceivedLeadCount: prevReceivedCount,
      previousValidLeadCount: prevValidCount,
      previousWonLeadCount: prevWonCount,
      previousAdCost: prevAdCost,
      previousCostPerValidAdLead: prevCostPerValidAdLead,
      previousWinRatePct: prevWinRatePct,
    },
    previousPeriod: {
      startDate: scope.prevStartDateStr,
      endDate: scope.prevEndDateStr,
      adCost: prevAdCost,
      receivedLeadCount: prevReceivedCount,
      validLeadCount: prevValidCount,
      validAttributedAdLeadCount: prevValidAttributedAdLeadCount,
      costPerValidAdLead: prevCostPerValidAdLead,
      wonLeadCount: prevWonCount,
      winRatePct: prevWinRatePct,
    },
    timeSeries,
    periodBreakdown,
    previousTimeSeries,
    dataQuality: {
      missingWebsiteCount,
      missingProductCount: unclassifiedProductLeadCount,
      unknownChannelCount,
      attributionCoveragePct,
    },
    marketingInsights: {
      summaryFindings,
      recommendedActions,
      latestSeoAiReport: matchingSeoReport
        ? {
            id: matchingSeoReport.id,
            website: matchingSeoReport.website,
            generatedAt: matchingSeoReport.snapshot.generatedAt,
            generationMode: matchingSeoReport.generationMode,
            modelUsed: matchingSeoReport.modelUsed,
            excerpt: matchingSeoReport.editedContent.replace(/[#*`>\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
          }
        : null,
    },
    periodActivity: {
      receivedInPeriodCount,
      quotedInPeriodCount: quotedInPeriodLeadMap.size,
      wonInPeriodCount: wonInPeriodLeadMap.size,
      lostInPeriodCount: lostInPeriodLeadMap.size,
      fromPriorCohortCount: priorCohortLeadIds.size,
      definitionNote:
        'Tính theo thời điểm phát sinh xử lý trong kỳ, bao gồm cả Lead tạo từ kỳ trước.',
    },
    charts: {
      leadFunnel,
      progressChartMode: 'CURRENT_STATUS_DISTRIBUTION',
      progressChartTitle: 'Phân bố trạng thái xử lý hiện tại',
      progressChartSubtitle: `Tổng cộng ${receivedLeadCount} hồ sơ tạo trong kỳ (mỗi hồ sơ thuộc đúng một trạng thái hiện tại)`,
      statusDistribution,
      productLeadRows: classifiedProductRows.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        distinctLeadCount: p.leadCount,
      })),
      multiProductNote:
        multiProductLeadCount > 0
          ? `Có ${multiProductLeadCount} Lead quan tâm từ 2 dòng sản phẩm trở lên; bảng Sản phẩm đếm theo lượt quan tâm từng sản phẩm, không cộng gộp thành tổng Lead.`
          : null,
    },
    tables: {
      bySales,
      byWebsite,
      byChannel,
      byCampaign,
      byProduct,
      byProductCatalog,
      productCategorySummaries,
      unclassifiedProductHints,
      pendingActionLeads: paginateArray(
        pendingActionRows,
        params?.page || 1,
        params?.pageSize || 20,
      ),
      detailedLeads: paginateArray(
        detailedLeadRows,
        params?.detailPage || 1,
        params?.detailPageSize || 25,
      ),
    },
  };
    },
  });

  if (cacheResult.fromCache) {
    return {
      ...cacheResult.data,
      freshness: {
        ...cacheResult.data.freshness,
        lastCheckedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
        fromCache: true,
      },
    };
  }
  return cacheResult.data;
}
