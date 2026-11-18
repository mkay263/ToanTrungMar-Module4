import { prisma } from '@toantrung/database';
import {
  isL2Valid,
  normalizeMarketingChannelDisplay,
  type M03AdsSeoDashboardDto,
  type M03SeoComparisonRowDto,
  type M03SeoContentRowDto,
  type M03SeoDailyPointDto,
  type M03SeoDeviceCountryRowDto,
  type RoleCode,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
  sanitizeLandingPageUrl,
} from '../../core/website-catalog';
import {
  classifyGscDateBySourceMetadata,
  getGscDataStateMetadataMap,
} from '../02-tracking-sync/google-oauth.service';
import {
  getCachedGscSiteStatus,
  getGa4LiveSnapshotsForProperties,
} from '../02-tracking-sync/ga4-live-cache.service';
import {
  getGoogleTrendsLiveSnapshot,
  getSerpApiTrendsKey,
} from './google-trends.service';

export function computeCostPerValidAdLead(
  adCost: number | null,
  validAdLeadCount: number,
): number | null {
  if (adCost === null || !Number.isFinite(adCost) || validAdLeadCount <= 0) {
    return null;
  }
  return Number((adCost / validAdLeadCount).toFixed(2));
}

function mapSeoWorkflowLabel(status: string, hasError: boolean): string {
  if (status === 'published') return 'Đã xuất bản';
  if (status === 'approved_scheduled') {
    return hasError ? 'Lỗi xuất bản' : 'Đã duyệt lịch đăng';
  }
  return 'Bản nháp';
}

export async function getM03AdsSeoDashboardSpec(params?: {
  websiteId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
  contentPage?: number;
  minImpr?: number;
  maxCtr?: number;
  roleCode?: RoleCode;
}): Promise<M03AdsSeoDashboardDto> {
  const scope = await resolveDashboardScope(params);
  const hasAdsToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());
  const isAdsReadOnly = params?.roleCode === 'ADS';

  const gscSites = scope.gscSiteUrls;
  const [
    gscAccountCur,
    gscAccountPrev,
    gscQueryCur,
    gscQueryPrev,
    gscPageCur,
    gscPagePrev,
    leads,
    gscMetaMap,
    syncLogs,
    ga4LiveSnaps,
    siteStatusRows,
    trendMetricRows,
    seoArticles,
    liveTrendsSnap,
    serpApiKey,
  ] = await Promise.all([
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'account',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
          },
          orderBy: { metricDate: 'asc' },
        })
      : Promise.resolve([]),
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'account',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.prevStartDateStr, lte: scope.prevEndDateStr },
          },
        })
      : Promise.resolve([]),
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'keyword',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
          },
        })
      : Promise.resolve([]),
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'keyword',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.prevStartDateStr, lte: scope.prevEndDateStr },
          },
        })
      : Promise.resolve([]),
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'page',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
          },
        })
      : Promise.resolve([]),
    gscSites.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'search_console',
            grain: 'page',
            accountPropertyId: { in: gscSites },
            metricDate: { gte: scope.prevStartDateStr, lte: scope.prevEndDateStr },
          },
        })
      : Promise.resolve([]),
    prisma.lead.findMany({
      where: {
        createdAt: { gte: scope.startDateTime, lte: scope.endDateTime },
      },
      include: { tracking: true },
    }),
    getGscDataStateMetadataMap(),
    prisma.platformSyncLog.findMany({
      where: { platform: { in: ['search_console', 'google_ads'] } },
      orderBy: { id: 'desc' },
      take: 10,
    }),
    getGa4LiveSnapshotsForProperties(scope.ga4PropertyIds, scope.startDateStr, scope.endDateStr, false),
    getCachedGscSiteStatus(gscSites),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: 'google_trends',
        metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
      },
      orderBy: { metricDate: 'asc' },
      take: 200,
    }),
    isAdsReadOnly
      ? Promise.resolve([])
      : prisma.seoArticle.findMany({
          include: {
            keyword: { select: { keyword: true } },
            createdBy: { select: { fullName: true } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 200,
        }),
    getGoogleTrendsLiveSnapshot(false).catch(() => null),
    getSerpApiTrendsKey().catch(() => null),
  ]);

  let organicSessionsFromGa4: number | null = null;
  let organicEngagedSessionsFromGa4 = 0;
  if (ga4LiveSnaps.length > 0) {
    organicSessionsFromGa4 = 0;
    for (const snap of ga4LiveSnaps) {
      const org = snap.channels.find((c) =>
        c.channelGroup.toLowerCase().includes('organic search'),
      );
      if (org) {
        organicSessionsFromGa4 += org.sessions;
        organicEngagedSessionsFromGa4 += org.engagedSessions;
      }
    }
  }
  const organicEngagementRatePct =
    organicSessionsFromGa4 !== null && organicSessionsFromGa4 > 0
      ? Number(((organicEngagedSessionsFromGa4 / organicSessionsFromGa4) * 100).toFixed(2))
      : null;

  const scopedLeads = leads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const validLeads = scopedLeads.filter((l) => isL2Valid(l));

  const validAdLeads = validLeads.filter((l) => {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    return ch === 'Google Ads' || ch === 'Quảng cáo Facebook';
  });

  // C08 & C04: Chỉ tính Lead từ tìm kiếm tự nhiên khi có bằng chứng UTM/marketingSource rõ ràng; không tự suy từ thiếu UTM
  const organicValidLeads = validLeads.filter((l) => {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    return ch === 'Tìm kiếm tự nhiên';
  });

  const websiteFormLeadsWithoutUtm = validLeads.filter(
    (l) =>
      l.contactChannel === 'form_web' &&
      !l.tracking?.utmSource &&
      !l.tracking?.utmMedium &&
      !l.tracking?.gclid &&
      normalizeMarketingChannelDisplay({
        marketingSource: l.tracking?.marketingSource,
        contactChannel: l.contactChannel,
      }) === 'Chưa xác định',
  );

  const organicLeadVerificationState: 'VERIFIED' | 'INSUFFICIENT_EVIDENCE' =
    organicValidLeads.length === 0 && websiteFormLeadsWithoutUtm.length > 0
      ? 'INSUFFICIENT_EVIDENCE'
      : 'VERIFIED';

  // -------------------------------------------------------------------------
  // SEO CALCULATIONS (from account grain for totals, keyword/page for tables)
  // -------------------------------------------------------------------------
  const hasGscData = gscAccountCur.length > 0;
  const totalClicks = hasGscData ? gscAccountCur.reduce((s, r) => s + r.clicks, 0) : null;
  const totalImpr = hasGscData ? gscAccountCur.reduce((s, r) => s + r.impressions, 0) : null;
  const overallCtrPct =
    totalClicks !== null && totalImpr !== null && totalImpr > 0
      ? Number(((totalClicks / totalImpr) * 100).toFixed(2))
      : null;

  let weightedPosSum = 0;
  let weightedImprSum = 0;
  for (const r of gscAccountCur) {
    if (r.avgPosition !== null && r.impressions > 0) {
      weightedPosSum += r.avgPosition * r.impressions;
      weightedImprSum += r.impressions;
    }
  }
  const avgSearchPosition =
    weightedImprSum > 0 ? Number((weightedPosSum / weightedImprSum).toFixed(2)) : null;

  const hasPrevGsc = gscAccountPrev.length > 0;
  const prevTotalClicks = hasPrevGsc ? gscAccountPrev.reduce((s, r) => s + r.clicks, 0) : null;
  const prevTotalImpr = hasPrevGsc ? gscAccountPrev.reduce((s, r) => s + r.impressions, 0) : null;
  const periodClickChangePct =
    totalClicks !== null && prevTotalClicks !== null && prevTotalClicks > 0
      ? Number((((totalClicks - prevTotalClicks) / prevTotalClicks) * 100).toFixed(2))
      : null;

  const gscDayMap = new Map<
    string,
    {
      clicks: number;
      impressions: number;
      posWeighted: number;
      posImpr: number;
      completeness: M03SeoDailyPointDto['completenessState'];
    }
  >();
  for (const r of gscAccountCur) {
    const cur = gscDayMap.get(r.metricDate) || {
      clicks: 0,
      impressions: 0,
      posWeighted: 0,
      posImpr: 0,
      completeness: 'UNKNOWN' as M03SeoDailyPointDto['completenessState'],
    };
    cur.clicks += r.clicks;
    cur.impressions += r.impressions;
    if (r.avgPosition !== null && r.impressions > 0) {
      cur.posWeighted += r.avgPosition * r.impressions;
      cur.posImpr += r.impressions;
    }
    const siteMeta = gscMetaMap[r.accountPropertyId];
    const state = classifyGscDateBySourceMetadata(r.metricDate, siteMeta);
    if (
      state === 'FINALIZED' ||
      state === 'PRELIMINARY' ||
      state === 'UNKNOWN' ||
      state === 'QUERY_ERROR'
    ) {
      cur.completeness = state;
    }
    gscDayMap.set(r.metricDate, cur);
  }

  const seoDailySeries: M03SeoDailyPointDto[] = [];
  const startNoon = new Date(`${scope.startDateStr}T12:00:00+07:00`);
  for (let i = 0; i < scope.totalCalendarDays; i += 1) {
    const d = new Date(startNoon.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const hit = gscDayMap.get(dateStr);
    seoDailySeries.push({
      date: dateStr,
      clicks: hit ? hit.clicks : null,
      impressions: hit ? hit.impressions : null,
      ctrPct:
        hit && hit.impressions > 0
          ? Number(((hit.clicks / hit.impressions) * 100).toFixed(2))
          : null,
      averagePosition:
        hit && hit.posImpr > 0 ? Number((hit.posWeighted / hit.posImpr).toFixed(2)) : null,
      completenessState: hit ? hit.completeness : 'NO_DATA',
    });
  }

  const aggregateBreakdown = (
    curRows: typeof gscQueryCur,
    prevRows: typeof gscQueryPrev,
    sanitizeUrl: boolean,
  ): M03SeoComparisonRowDto[] => {
    const hasPrevAny = prevRows.length > 0;
    const curMap = new Map<string, { clicks: number; impr: number; posW: number; posI: number }>();
    for (const r of curRows) {
      const k = sanitizeUrl
        ? sanitizeLandingPageUrl(r.pageUrlRaw || r.pagePathNorm || r.campaignExternalId)
        : (r.keywordRaw || r.keywordTextNorm || r.campaignExternalId || '').trim();
      if (!k) continue;
      const cur = curMap.get(k) || { clicks: 0, impr: 0, posW: 0, posI: 0 };
      cur.clicks += r.clicks;
      cur.impr += r.impressions;
      if (r.avgPosition !== null && r.impressions > 0) {
        cur.posW += r.avgPosition * r.impressions;
        cur.posI += r.impressions;
      }
      curMap.set(k, cur);
    }

    const prevMap = new Map<string, { clicks: number; impr: number; posW: number; posI: number }>();
    for (const r of prevRows) {
      const k = sanitizeUrl
        ? sanitizeLandingPageUrl(r.pageUrlRaw || r.pagePathNorm || r.campaignExternalId)
        : (r.keywordRaw || r.keywordTextNorm || r.campaignExternalId || '').trim();
      if (!k) continue;
      const prev = prevMap.get(k) || { clicks: 0, impr: 0, posW: 0, posI: 0 };
      prev.clicks += r.clicks;
      prev.impr += r.impressions;
      if (r.avgPosition !== null && r.impressions > 0) {
        prev.posW += r.avgPosition * r.impressions;
        prev.posI += r.impressions;
      }
      prevMap.set(k, prev);
    }

    // Bao gồm cả những trang/từ khóa có ở kỳ trước nhưng giảm về 0 ở kỳ này để phát hiện suy giảm chính xác!
    const allKeys = new Set<string>([...curMap.keys(), ...prevMap.keys()]);

    return Array.from(allKeys)
      .map((key) => {
        const c = curMap.get(key) || { clicks: 0, impr: 0, posW: 0, posI: 0 };
        const p = prevMap.get(key);
        const curCtr = c.impr > 0 ? Number(((c.clicks / c.impr) * 100).toFixed(2)) : null;
        const avgPos = c.posI > 0 ? Number((c.posW / c.posI).toFixed(2)) : null;

        const prevClicks = hasPrevAny ? (p ? p.clicks : 0) : null;
        const prevImpr = hasPrevAny ? (p ? p.impr : 0) : null;
        const prevCtr =
          p && p.impr > 0 ? Number(((p.clicks / p.impr) * 100).toFixed(2)) : hasPrevAny ? 0 : null;
        const prevPos = p && p.posI > 0 ? Number((p.posW / p.posI).toFixed(2)) : null;

        const clickChange = prevClicks !== null ? c.clicks - prevClicks : null;
        const clickChangePct =
          clickChange !== null && prevClicks !== null && prevClicks > 0
            ? Number(((clickChange / prevClicks) * 100).toFixed(2))
            : null;
        const impressionChange = prevImpr !== null ? c.impr - prevImpr : null;
        const ctrChangePctPt =
          curCtr !== null && prevCtr !== null ? Number((curCtr - prevCtr).toFixed(2)) : null;
        const positionImprovement =
          avgPos !== null && prevPos !== null ? Number((prevPos - avgPos).toFixed(2)) : null;

        return {
          key,
          clicks: c.clicks,
          impressions: c.impr,
          ctrPct: curCtr,
          averagePosition: avgPos,
          previousClicks: prevClicks,
          clickChange,
          clickChangePct,
          previousImpressions: prevImpr,
          impressionChange,
          previousCtrPct: prevCtr,
          ctrChangePctPt,
          previousPosition: prevPos,
          positionImprovement,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  };

  const allQueryRows = aggregateBreakdown(gscQueryCur, gscQueryPrev, false);
  const allPageRows = aggregateBreakdown(gscPageCur, gscPagePrev, true);

  // Trang tăng / giảm cho cột 4/12 (C08)
  const risingPages = allPageRows
    .filter((p) => (p.clickChange ?? 0) > 0 || ((p.clickChange ?? 0) === 0 && (p.impressionChange ?? 0) > 10))
    .sort((a, b) => (b.clickChange ?? 0) - (a.clickChange ?? 0) || (b.impressionChange ?? 0) - (a.impressionChange ?? 0))
    .slice(0, 5);

  const decliningPages = allPageRows
    .filter((p) => (p.clickChange ?? 0) < 0 || ((p.clickChange ?? 0) === 0 && (p.impressionChange ?? 0) < -10))
    .sort((a, b) => (a.clickChange ?? 0) - (b.clickChange ?? 0) || (a.impressionChange ?? 0) - (b.impressionChange ?? 0))
    .slice(0, 5);

  // Điều kiện cơ hội có thể cấu hình (C08)
  const opportunityThresholdMinImpr =
    params?.minImpr && Number.isFinite(params.minImpr) && params.minImpr > 0
      ? Math.round(params.minImpr)
      : 15;
  const ctrCeiling =
    params?.maxCtr && Number.isFinite(params.maxCtr) && params.maxCtr > 0
      ? Number(params.maxCtr.toFixed(2))
      : Number((overallCtrPct ?? 3).toFixed(2));

  const opportunityQueries = allQueryRows
    .filter(
      (q) =>
        q.impressions >= opportunityThresholdMinImpr &&
        (q.ctrPct === null || q.ctrPct < ctrCeiling),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 12)
    .map((q) => ({
      query: q.key,
      impressions: q.impressions,
      ctrPct: q.ctrPct,
      averagePosition: q.averagePosition,
    }));

  // Tab Nội dung (C08: contentId, targetWebsite, targetUrl, targetQuery, owner, workflowStatus, updatedAt, publishedAt, publishError)
  const scopedArticles = seoArticles.filter((a) =>
    matchesWebsiteDomain(a.targetWebsite, scope.selectedWebsite),
  );
  const contentRows: M03SeoContentRowDto[] = scopedArticles.map((a) => ({
    contentId: a.id,
    title: a.title,
    targetWebsite: a.targetWebsite || null,
    targetUrl: a.publishedUrl || (a.slug ? `/${a.slug}` : null),
    targetQuery: a.keyword?.keyword || a.topic || 'Chưa gắn từ khóa',
    owner: a.createdBy?.fullName || 'Phòng Marketing',
    workflowStatus: mapSeoWorkflowLabel(a.status, Boolean(a.lastPublishError)),
    updatedAt: a.updatedAt.toISOString(),
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    publishError: a.lastPublishError || null,
  }));

  // Thiết bị & Quốc gia từ GA4/GSC khi có dữ liệu
  const deviceCountryRows: M03SeoDeviceCountryRowDto[] = [];
  for (const snap of ga4LiveSnaps) {
    for (const d of snap.devices) {
      const existing = deviceCountryRows.find(
        (x) => x.dimensionType === 'DEVICE' && x.dimensionKey === d.deviceCategory,
      );
      if (existing) {
        existing.clicks += d.sessions;
      } else {
        deviceCountryRows.push({
          dimensionType: 'DEVICE',
          dimensionKey: d.deviceCategory,
          clicks: d.sessions,
          impressions: 0,
          ctrPct: null,
          averagePosition: null,
        });
      }
    }
  }

  const gscLogs = syncLogs.filter((s) => s.platform === 'search_console');
  const lastGscLog = gscLogs[0] || null;
  const lastGscSuccess = gscLogs.find((s) => s.status === 'success') || null;
  const isError = lastGscLog?.status === 'failed' && !hasGscData;
  const latestDataThrough = gscAccountCur[gscAccountCur.length - 1]?.metricDate || null;

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
        'Dữ liệu tìm kiếm tự nhiên (Search Console cấp site), lưu lượng tìm kiếm tự nhiên (GA4) và bài viết SEO trong kỳ',
      previousStartDate: scope.prevStartDateStr,
      previousEndDate: scope.prevEndDateStr,
    },
    freshness: {
      lastCheckedAt: lastGscLog?.startedAt?.toISOString() || new Date().toISOString(),
      lastSuccessAt: lastGscSuccess?.completedAt?.toISOString() || null,
      dataThrough: latestDataThrough,
      state: isError
        ? 'ERROR'
        : !hasGscData
          ? 'NO_DATA'
          : scope.isTodayIncluded
            ? 'PRELIMINARY'
            : 'FINALIZED',
      statusMessage: isError
        ? 'Không tải được dữ liệu Search Console mới.'
        : !hasGscData
          ? 'Chưa có dữ liệu Search Console trong khoảng ngày đang chọn (Search Console có độ trễ chuẩn 24–48 giờ).'
          : latestDataThrough
            ? `Dữ liệu đến ${latestDataThrough} (Search Console trễ chuẩn 1–2 ngày)`
            : 'Đã đồng bộ dữ liệu Search Console.',
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.filter((w) => Boolean(w.gscSiteUrl)).map((w) => w.domain),
      missingWebsites: scope.availableWebsites
        .filter((w) => !w.gscSiteUrl)
        .map((w) => w.domain),
      note:
        organicLeadVerificationState === 'INSUFFICIENT_EVIDENCE'
          ? `Có ${websiteFormLeadsWithoutUtm.length} Lead biểu mẫu từ website chưa gắn tham số UTM/nguồn tìm kiếm nên không tự cộng vào "Lead từ tìm kiếm tự nhiên".`
          : null,
    },
    version: `m03-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${totalClicks ?? 'null'}`,
    ads: {
      status: hasAdsToken ? 'CONNECTED' : 'UNCONFIGURED',
      statusMessage: hasAdsToken
        ? 'Đã kết nối dữ liệu quảng cáo.'
        : 'Chưa kết nối Google Ads API (thiếu GOOGLE_ADS_DEVELOPER_TOKEN). Vui lòng xem chi tiết quảng cáo tại mục Chiến dịch.',
      currencyCode: 'VND',
      metrics: {
        adCost: null,
        adImpressions: null,
        adClicks: null,
        adCtrPct: null,
        averageCpc: null,
        averageCpm: null,
        adConversions: null,
        costPerConversion: null,
        validAdLeadCount: validAdLeads.length,
        costPerValidAdLead: computeCostPerValidAdLead(null, validAdLeads.length),
      },
      charts: {
        adDailySeries: [],
        topCampaigns: [],
      },
      tables: {
        campaigns: paginateArray([], params?.page || 1, params?.pageSize || 20),
        adGroups: [],
        keywords: [],
        keywordAvailabilityNote: hasAdsToken
          ? null
          : 'Chưa kết nối tài khoản quảng cáo.',
        deviceBreakdown: [],
        geoBreakdown: [],
      },
    },
    seo: {
      metrics: {
        organicSearchClicks: totalClicks,
        organicSearchImpressions: totalImpr,
        organicSearchCtrPct: overallCtrPct,
        averageSearchPosition: avgSearchPosition,
        organicSessions: organicSessionsFromGa4,
        organicEngagementRatePct,
        organicFormEvents: null,
        organicValidLeadCount: organicValidLeads.length,
        organicLeadVerificationState,
      },
      comparison: {
        previousStartDate: scope.prevStartDateStr,
        previousEndDate: scope.prevEndDateStr,
        previousClicks: prevTotalClicks,
        previousImpressions: prevTotalImpr,
        clickChangePct: periodClickChangePct,
      },
      charts: {
        seoDailySeries,
        opportunityQueries,
        opportunityThresholdNote: `Điều kiện lọc cơ hội: Hiển thị ≥ ${opportunityThresholdMinImpr} và CTR < ${ctrCeiling}% (gợi ý cần kiểm chứng, không khẳng định kết quả chắc chắn)`,
        pagesDeltaSummary: {
          risingPages,
          decliningPages,
          comparisonNote:
            gscPagePrev.length === 0
              ? `Kỳ trước (${scope.prevStartDateStr} → ${scope.prevEndDateStr}) chưa có dữ liệu trang chi tiết để đối chiếu tăng/giảm.`
              : `So sánh kỳ hiện tại với kỳ trước (${scope.prevStartDateStr} → ${scope.prevEndDateStr})`,
        },
      },
      tables: {
        queries: paginateArray(allQueryRows, params?.page || 1, params?.pageSize || 20),
        pages: paginateArray(allPageRows, params?.page || 1, params?.pageSize || 20),
        content: paginateArray(contentRows, params?.contentPage || 1, params?.pageSize || 20),
        deviceCountry: deviceCountryRows,
      },
      opportunityConfig: {
        minImpressionsForLowCtr: opportunityThresholdMinImpr,
        maxCtrPctForOpportunity: ctrCeiling,
        staleContentDays: 30,
      },
    },
    siteStatus: {
      status: siteStatusRows.length > 0 ? 'CONNECTED' : 'UNCONFIGURED',
      statusMessage:
        siteStatusRows.length > 0
          ? 'Kiểm tra lập chỉ mục từng URL tiêu biểu qua URL Inspection API (không phải báo cáo toàn bộ lỗi lập chỉ mục toàn site).'
          : 'Chưa có kết quả kiểm tra URL tiêu biểu cho website đang chọn.',
      rows: siteStatusRows,
    },
    trends: (() => {
      const dbTrendRows = trendMetricRows.map((t) => ({
        term: t.keywordRaw || t.keywordTextNorm || t.campaignExternalId || 'Từ khóa',
        geoCode: t.accountPropertyId || 'VN',
        geoName: 'Việt Nam',
        date: t.metricDate,
        interestValue: t.trendInterestScore ?? t.impressions ?? 0,
        scaleType: 'INDEX_0_100',
        comparisonGroupId: t.campaignExternalId || 'default',
        sourceType: 'GOOGLE_TRENDS_INDEX' as const,
      }));
      const rssRows = liveTrendsSnap?.dailyRssTrends || [];
      const industrySuggestions = liveTrendsSnap?.industrySuggestions || [];
      const hasAnyLiveTrends =
        dbTrendRows.length > 0 || rssRows.length > 0 || industrySuggestions.length > 0;

      return {
        status: hasAnyLiveTrends ? 'CONNECTED' : 'UNCONFIGURED',
        statusMessage: hasAnyLiveTrends
          ? `Đã kết nối Google Trends Việt Nam (RSS xu hướng ngày & Google Suggest VN${
              serpApiKey ? ' + SerpApi 0–100' : ''
            }). Cập nhật lúc ${
              liveTrendsSnap?.fetchedAt
                ? new Date(liveTrendsSnap.fetchedAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'hiện tại'
            }.`
          : liveTrendsSnap?.errorMessage ||
            'Chưa tải được dữ liệu Google Trends trực tuyến; không hiển thị điểm số ước lượng giả.',
        rows: dbTrendRows.length > 0 ? dbTrendRows : rssRows,
        dailyRssTrends: rssRows,
        industrySuggestions,
        serpApiConfigured: Boolean(serpApiKey),
        lastSyncedAt: liveTrendsSnap?.fetchedAt || null,
      };
    })(),
  };
}
