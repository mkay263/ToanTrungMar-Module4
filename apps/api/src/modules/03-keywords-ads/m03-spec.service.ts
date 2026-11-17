import { prisma } from '@toantrung/database';
import {
  isL2Valid,
  type M03AdsSeoDashboardDto,
  type M03SeoComparisonRowDto,
  type M03SeoDailyPointDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
  safeDiv,
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

export function computeCostPerValidAdLead(
  adCost: number | null,
  validAdLeadCount: number,
): number | null {
  if (adCost === null || !Number.isFinite(adCost) || validAdLeadCount <= 0) {
    return null;
  }
  return Number((adCost / validAdLeadCount).toFixed(2));
}

export async function getM03AdsSeoDashboardSpec(params?: {
  websiteId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<M03AdsSeoDashboardDto> {
  const scope = await resolveDashboardScope(params);
  const hasAdsToken = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim());

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
    getGa4LiveSnapshotsForProperties(scope.ga4PropertyIds, scope.startDateStr, scope.endDateStr),
    getCachedGscSiteStatus(gscSites),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: 'google_trends',
        metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
      },
      orderBy: { metricDate: 'asc' },
      take: 200,
    }),
  ]);

  const organicSessionsFromGa4 =
    ga4LiveSnaps.length > 0
      ? ga4LiveSnaps.reduce((sum, snap) => {
          const org = snap.channels.find((c) => c.channelGroup.toLowerCase().includes('organic search'));
          return sum + (org?.sessions || 0);
        }, 0)
      : null;

  const scopedLeads = leads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const validLeads = scopedLeads.filter((l) => isL2Valid(l));
  const validAdLeads = validLeads.filter(
    (l) =>
      Boolean(l.tracking?.gclid) ||
      (l.tracking?.marketingSource || '').toLowerCase().includes('google ads'),
  );
  const organicValidLeads = validLeads.filter((l) => {
    const ms = (l.tracking?.marketingSource || '').toLowerCase();
    return ms.includes('organic') || ms.includes('seo') || ms.includes('tìm kiếm tự nhiên');
  });

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

  // Daily SEO series across every calendar day
  const gscDayMap = new Map<
    string,
    { clicks: number; impressions: number; posWeighted: number; posImpr: number; completeness: M03SeoDailyPointDto['completenessState'] }
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
    if (state === 'FINALIZED' || state === 'PRELIMINARY' || state === 'UNKNOWN' || state === 'QUERY_ERROR') {
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
      ctrPct: hit && hit.impressions > 0 ? Number(((hit.clicks / hit.impressions) * 100).toFixed(2)) : null,
      averagePosition: hit && hit.posImpr > 0 ? Number((hit.posWeighted / hit.posImpr).toFixed(2)) : null,
      completenessState: hit ? hit.completeness : 'NO_DATA',
    });
  }

  const aggregateBreakdown = (
    curRows: typeof gscQueryCur,
    prevRows: typeof gscQueryPrev,
    sanitizeUrl: boolean,
  ): M03SeoComparisonRowDto[] => {
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

    return Array.from(curMap.entries())
      .map(([key, c]) => {
        const p = prevMap.get(key);
        const avgPos = c.posI > 0 ? Number((c.posW / c.posI).toFixed(2)) : null;
        const prevPos = p && p.posI > 0 ? Number((p.posW / p.posI).toFixed(2)) : null;
        const prevClicks = p ? p.clicks : null;
        const clickChange = prevClicks !== null ? c.clicks - prevClicks : null;
        const clickChangePct =
          clickChange !== null && prevClicks !== null && prevClicks > 0
            ? Number(((clickChange / prevClicks) * 100).toFixed(2))
            : null;
        const positionImprovement =
          avgPos !== null && prevPos !== null ? Number((prevPos - avgPos).toFixed(2)) : null;

        return {
          key,
          clicks: c.clicks,
          impressions: c.impr,
          ctrPct: c.impr > 0 ? Number(((c.clicks / c.impr) * 100).toFixed(2)) : null,
          averagePosition: avgPos,
          previousClicks: prevClicks,
          clickChange,
          clickChangePct,
          previousPosition: prevPos,
          positionImprovement,
        };
      })
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
  };

  const allQueryRows = aggregateBreakdown(gscQueryCur, gscQueryPrev, false);
  const allPageRows = aggregateBreakdown(gscPageCur, gscPagePrev, true);

  const opportunityThresholdMinImpr = 10;
  const ctrCeiling = overallCtrPct ?? 3;
  const opportunityQueries = allQueryRows
    .filter(
      (q) =>
        q.impressions >= opportunityThresholdMinImpr &&
        (q.ctrPct === null || q.ctrPct < ctrCeiling),
    )
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10)
    .map((q) => ({
      query: q.key,
      impressions: q.impressions,
      ctrPct: q.ctrPct,
      averagePosition: q.averagePosition,
    }));

  const gscLogs = syncLogs.filter((s) => s.platform === 'search_console');
  const lastGscLog = gscLogs[0] || null;
  const lastGscSuccess = gscLogs.find((s) => s.status === 'success') || null;
  const isError = lastGscLog?.status === 'failed';

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition: 'Dữ liệu tìm kiếm, quảng cáo & Lead quy nguồn trong kỳ đang chọn',
    },
    freshness: {
      lastCheckedAt: lastGscLog?.startedAt?.toISOString() || new Date().toISOString(),
      lastSuccessAt: lastGscSuccess?.completedAt?.toISOString() || null,
      dataThrough: gscAccountCur[gscAccountCur.length - 1]?.metricDate || null,
      state: isError
        ? 'ERROR'
        : !hasGscData
          ? 'NO_DATA'
          : scope.isTodayIncluded
            ? 'PRELIMINARY'
            : 'FINALIZED',
      statusMessage: isError
        ? 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.'
        : scope.isTodayIncluded
          ? 'Số liệu trong ngày còn sơ bộ.'
          : lastGscSuccess?.completedAt
            ? `Cập nhật lúc ${new Date(lastGscSuccess.completedAt).toLocaleString('vi-VN')}`
            : 'Đang hiển thị dữ liệu cập nhật gần nhất.',
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: [],
      note: null,
    },
    version: `m03-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${totalClicks ?? 'null'}`,
    ads: {
      status: hasAdsToken ? 'CONNECTED' : 'UNCONFIGURED',
      statusMessage: hasAdsToken
        ? 'Đã kết nối dữ liệu quảng cáo.'
        : 'Chưa đủ dữ liệu: tài khoản chưa cấu hình khóa truy cập quảng cáo.',
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
          : 'Chưa có dữ liệu từ khóa quảng cáo do chưa kết nối tài khoản quảng cáo.',
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
        organicValidLeadCount: organicValidLeads.length,
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
        opportunityThresholdNote: `Hiển thị ≥ ${opportunityThresholdMinImpr} và CTR < ${ctrCeiling}% (CTR chung của kỳ)`,
      },
      tables: {
        queries: paginateArray(allQueryRows, params?.page || 1, params?.pageSize || 20),
        pages: paginateArray(allPageRows, params?.page || 1, params?.pageSize || 20),
      },
    },
    siteStatus: {
      status: siteStatusRows.length > 0 ? 'CONNECTED' : 'UNCONFIGURED',
      statusMessage:
        siteStatusRows.length > 0
          ? 'Đã kiểm tra trạng thái lập chỉ mục URL theo kỳ cập nhật gần nhất.'
          : 'Chưa có dữ liệu kiểm tra lập chỉ mục URL cho website đang chọn.',
      rows: siteStatusRows,
    },
    trends: {
      status: trendMetricRows.length > 0 ? 'CONNECTED' : 'UNCONFIGURED',
      statusMessage:
        trendMetricRows.length > 0
          ? 'Dữ liệu xu hướng tìm kiếm theo ngày.'
          : 'Chưa kết nối nguồn dữ liệu xu hướng tìm kiếm.',
      rows: trendMetricRows.map((t) => ({
        term: t.keywordRaw || t.keywordTextNorm || t.campaignExternalId || 'Từ khóa LED',
        geoCode: 'VN',
        geoName: 'Việt Nam',
        date: t.metricDate,
        interestValue: t.trendInterestScore ?? 0,
        scaleType: 'RELATIVE_0_100',
        comparisonGroupId: t.accountPropertyId || 'default',
      })),
    },
  };
}
