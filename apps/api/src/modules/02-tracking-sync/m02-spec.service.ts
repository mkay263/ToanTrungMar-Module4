import { prisma } from '@toantrung/database';
import {
  isL2Valid,
  type M02ChannelRowDto,
  type M02LandingPageRowDto,
  type M02TrafficInteractionDto,
  type M02TrafficSeriesPointDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
  safeDiv,
  sanitizeLandingPageUrl,
} from '../../core/website-catalog';
import { getGoogleConnection, getValidAccessToken } from './google-oauth.service';
import { getGa4LiveSnapshotsForProperties } from './ga4-live-cache.service';
import { getStoredTouchpoints } from './service';

const REALTIME_CACHE_TTL_MS = 60_000;
const globalM02Cache = globalThis as typeof globalThis & {
  __m02RealtimeCache?: Map<string, { fetchedAt: number; activeUsers30m: number | null; minutesSeries: Array<{ minutesAgo: number; activeUsers: number }> }>;
};

function mapChannelLabel(rawSourceMedium: string): { key: string; label: string } {
  const s = (rawSourceMedium || '').toLowerCase();
  if (!s || s === '(not set)' || s === 'chưa xác định') {
    return { key: 'unknown', label: 'Chưa xác định' };
  }
  if (s.includes('organic') || s.includes('seo') || s.includes('tìm kiếm tự nhiên')) {
    return { key: 'organic', label: 'Tìm kiếm tự nhiên (Google)' };
  }
  if (s.includes('cpc') || s.includes('ppc') || s.includes('ads') || s.includes('quảng cáo')) {
    return { key: 'paid_ads', label: 'Quảng cáo (Google Ads)' };
  }
  if (s.includes('facebook') || s.includes('fb') || s.includes('zalo') || s.includes('social') || s.includes('tiktok')) {
    return { key: 'social', label: s.includes('facebook') || s.includes('fb') ? 'Mạng xã hội (Facebook)' : 'Mạng xã hội' };
  }
  if (s.includes('direct') || s.includes('(none)') || s.includes('trực tiếp')) {
    return { key: 'direct', label: 'Truy cập trực tiếp' };
  }
  if (s.includes('referral') || s.includes('giới thiệu')) {
    return { key: 'referral', label: 'Website giới thiệu' };
  }
  return { key: 'other', label: 'Khác' };
}

async function fetchGa4RealtimeCached(propertyIds: string[]): Promise<{
  activeUsers30m: number | null;
  minutesSeries: Array<{ minutesAgo: number; activeUsers: number }>;
}> {
  if (propertyIds.length === 0) {
    return { activeUsers30m: null, minutesSeries: [] };
  }
  const cacheKey = propertyIds.slice().sort().join(',');
  if (!globalM02Cache.__m02RealtimeCache) {
    globalM02Cache.__m02RealtimeCache = new Map();
  }
  const cached = globalM02Cache.__m02RealtimeCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < REALTIME_CACHE_TTL_MS) {
    return { activeUsers30m: cached.activeUsers30m, minutesSeries: cached.minutesSeries };
  }

  const conn = await getGoogleConnection();
  if (!conn?.connected || conn.isSandboxDemo) {
    return { activeUsers30m: null, minutesSeries: [] };
  }
  const token = await getValidAccessToken();
  if (!token) {
    return {
      activeUsers30m: cached?.activeUsers30m ?? null,
      minutesSeries: cached?.minutesSeries ?? [],
    };
  }

  let total30m = 0;
  let anySucceeded = false;
  const minuteMap = new Map<number, number>();

  await Promise.all(
    propertyIds.slice(0, 4).map(async (propId) => {
      const perPropKey = `prop:${propId}`;
      const perPropCached = globalM02Cache.__m02RealtimeCache?.get(perPropKey);
      if (perPropCached && Date.now() - perPropCached.fetchedAt < REALTIME_CACHE_TTL_MS * 2) {
        if (perPropCached.activeUsers30m !== null) {
          anySucceeded = true;
          total30m += perPropCached.activeUsers30m;
        }
        for (const m of perPropCached.minutesSeries) {
          minuteMap.set(m.minutesAgo, (minuteMap.get(m.minutesAgo) || 0) + m.activeUsers);
        }
        return;
      }

      let propUsers: number | null = null;
      const propMins: Array<{ minutesAgo: number; activeUsers: number }> = [];
      try {
        const [respTotal, respMin] = await Promise.all([
          fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runRealtimeReport`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ metrics: [{ name: 'activeUsers' }] }),
            },
          ),
          fetch(
            `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runRealtimeReport`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                dimensions: [{ name: 'minutesAgo' }],
                metrics: [{ name: 'activeUsers' }],
              }),
            },
          ),
        ]);

        if (respTotal.ok) {
          const j = (await respTotal.json()) as {
            rows?: Array<{ metricValues?: Array<{ value?: string }> }>;
          };
          const val = Number(j.rows?.[0]?.metricValues?.[0]?.value || 0);
          if (Number.isFinite(val)) {
            propUsers = val;
            total30m += val;
            anySucceeded = true;
          }
        }
        if (respMin.ok) {
          const jm = (await respMin.json()) as {
            rows?: Array<{
              dimensionValues?: Array<{ value?: string }>;
              metricValues?: Array<{ value?: string }>;
            }>;
          };
          for (const r of jm.rows || []) {
            const minAgo = Number(r.dimensionValues?.[0]?.value);
            const cnt = Number(r.metricValues?.[0]?.value || 0);
            if (Number.isFinite(minAgo) && minAgo >= 0 && minAgo <= 29) {
              propMins.push({ minutesAgo: minAgo, activeUsers: cnt });
              minuteMap.set(minAgo, (minuteMap.get(minAgo) || 0) + cnt);
            }
          }
        }
        globalM02Cache.__m02RealtimeCache?.set(perPropKey, {
          fetchedAt: Date.now(),
          activeUsers30m: propUsers,
          minutesSeries: propMins,
        });
      } catch {
        // keep partial
      }
    }),
  );

  const activeUsers30m = anySucceeded ? total30m : cached?.activeUsers30m ?? null;
  const minutesSeries = anySucceeded
    ? Array.from({ length: 30 }, (_, idx) => {
        const minutesAgo = 29 - idx;
        return { minutesAgo, activeUsers: minuteMap.get(minutesAgo) || 0 };
      })
    : cached?.minutesSeries ?? [];

  globalM02Cache.__m02RealtimeCache.set(cacheKey, {
    fetchedAt: Date.now(),
    activeUsers30m,
    minutesSeries,
  });

  return { activeUsers30m, minutesSeries };
}

export async function getM02TrafficInteractionSpec(params?: {
  websiteId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
}): Promise<M02TrafficInteractionDto> {
  const scope = await resolveDashboardScope(params);
  const propIds = scope.ga4PropertyIds;

  const [accountRows, pageRows, leads, products, touchpoints, syncLogs, realtime, ga4LiveSnaps] =
    await Promise.all([
      propIds.length > 0
        ? prisma.platformDailyMetric.findMany({
            where: {
              platform: 'ga4',
              grain: 'account',
              accountPropertyId: { in: propIds },
              metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
            },
            orderBy: { metricDate: 'asc' },
          })
        : Promise.resolve([]),
      propIds.length > 0
        ? prisma.platformDailyMetric.findMany({
            where: {
              platform: 'ga4',
              grain: 'page',
              accountPropertyId: { in: propIds },
              metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
            },
          })
        : Promise.resolve([]),
      prisma.lead.findMany({
        where: {
          createdAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        },
        include: {
          tracking: true,
          leadProducts: { select: { productId: true } },
        },
      }),
      prisma.product.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
      }),
      getStoredTouchpoints(),
      prisma.platformSyncLog.findMany({
        where: { platform: 'ga4' },
        orderBy: { id: 'desc' },
        take: 10,
      }),
      fetchGa4RealtimeCached(propIds),
      getGa4LiveSnapshotsForProperties(propIds, scope.startDateStr, scope.endDateStr),
    ]);

  const scopedLeads = leads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const validLeads = scopedLeads.filter((l) => isL2Valid(l));
  const validFormLeads = validLeads.filter((l) => l.contactChannel === 'form_web');

  // Build daily trafficSeries across every calendar day in range (prefer GA4 live daily if available, else DB accountRows)
  const dailyMap = new Map<string, { sessions: number; pageViews: number; users: number | null; hasRow: boolean }>();
  if (ga4LiveSnaps.length > 0) {
    for (const snap of ga4LiveSnaps) {
      for (const d of snap.daily) {
        const cur = dailyMap.get(d.date) || { sessions: 0, pageViews: 0, users: 0, hasRow: false };
        cur.sessions += d.sessions;
        cur.pageViews += d.pageViews;
        cur.users = (cur.users ?? 0) + d.users;
        cur.hasRow = true;
        dailyMap.set(d.date, cur);
      }
    }
  } else {
    for (const r of accountRows) {
      const cur = dailyMap.get(r.metricDate) || { sessions: 0, pageViews: 0, users: null, hasRow: false };
      cur.sessions += r.clicks || r.pageViews;
      cur.pageViews += r.pageViews;
      cur.hasRow = true;
      dailyMap.set(r.metricDate, cur);
    }
  }

  const trafficSeries: M02TrafficSeriesPointDto[] = [];
  const startNoon = new Date(`${scope.startDateStr}T12:00:00+07:00`);
  for (let i = 0; i < scope.totalCalendarDays; i += 1) {
    const d = new Date(startNoon.getTime() + i * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
    const hit = dailyMap.get(dateStr);
    trafficSeries.push({
      date: dateStr,
      sessions: hit ? hit.sessions : null,
      pageViews: hit ? hit.pageViews : null,
      users: hit ? hit.users : null,
      isMissingData: !hit,
    });
  }

  const hasLiveGa4 = ga4LiveSnaps.length > 0;
  const hasTrafficData = hasLiveGa4 || accountRows.length > 0;
  const liveSessionsSum = hasLiveGa4
    ? ga4LiveSnaps.reduce((acc, s) => acc + s.totals.sessions, 0)
    : null;
  const livePageViewsSum = hasLiveGa4
    ? ga4LiveSnaps.reduce((acc, s) => acc + s.totals.screenPageViews, 0)
    : null;

  const totalSessions =
    liveSessionsSum !== null
      ? liveSessionsSum
      : accountRows.length > 0
        ? accountRows.reduce((acc, r) => acc + (r.clicks || r.pageViews), 0)
        : null;
  const totalPageViews =
    livePageViewsSum !== null
      ? livePageViewsSum
      : accountRows.length > 0
        ? accountRows.reduce((acc, r) => acc + r.pageViews, 0)
        : null;

  let periodUsers: number | null = null;
  let periodNewUsers: number | null = null;
  let periodEngagedSessions: number | null = null;
  let periodEngagementRatePct: number | null = null;
  let periodAvgEngagementSec: number | null = null;

  if (hasLiveGa4) {
    const u = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.totalUsers, 0);
    const nu = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.newUsers, 0);
    const au = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.activeUsers, 0);
    const es = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.engagedSessions, 0);
    const dur = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.userEngagementDurationSec, 0);
    periodUsers = u;
    periodNewUsers = nu;
    periodEngagedSessions = es;
    periodEngagementRatePct =
      totalSessions && totalSessions > 0 ? Number(((es / totalSessions) * 100).toFixed(2)) : null;
    periodAvgEngagementSec = au > 0 ? Number((dur / au).toFixed(1)) : null;
  }

  const resolvedUsers = periodUsers;

  // Channel breakdown: merge GA4 sessionDefaultChannelGroup + CRM validLeadCount (no traffic-ratio allocation)
  const channelMap = new Map<
    string,
    {
      channelKey: string;
      channelLabel: string;
      sessions: number;
      engagedSessions: number;
      hasGa4: boolean;
      validLeadCount: number;
    }
  >();

  for (const snap of ga4LiveSnaps) {
    for (const ch of snap.channels) {
      const mapped = mapChannelLabel(ch.channelGroup);
      const cur = channelMap.get(mapped.key) || {
        channelKey: mapped.key,
        channelLabel: mapped.label,
        sessions: 0,
        engagedSessions: 0,
        hasGa4: false,
        validLeadCount: 0,
      };
      cur.sessions += ch.sessions;
      cur.engagedSessions += ch.engagedSessions;
      cur.hasGa4 = true;
      channelMap.set(mapped.key, cur);
    }
  }

  for (const l of validLeads) {
    const mapped = mapChannelLabel(l.tracking?.marketingSource || '');
    const cur = channelMap.get(mapped.key) || {
      channelKey: mapped.key,
      channelLabel: mapped.label,
      sessions: 0,
      engagedSessions: 0,
      hasGa4: false,
      validLeadCount: 0,
    };
    cur.validLeadCount += 1;
    channelMap.set(mapped.key, cur);
  }
  const channelRows: M02ChannelRowDto[] = Array.from(channelMap.values())
    .sort((a, b) => b.sessions - a.sessions || b.validLeadCount - a.validLeadCount)
    .slice(0, 8)
    .map((c) => ({
      channelKey: c.channelKey,
      channelLabel: c.channelLabel,
      sessions: c.sessions,
      engagedSessions: c.hasGa4 ? c.engagedSessions : null,
      engagementRatePct:
        c.hasGa4 && c.sessions > 0
          ? Number(((c.engagedSessions / c.sessions) * 100).toFixed(2))
          : null,
      validLeadCount: c.validLeadCount,
    }));

  // Device & Geo breakdowns from GA4 live snapshots
  const deviceMap = new Map<string, number>();
  const geoMap = new Map<string, { country: string; region: string; city: string; sessions: number }>();
  const ga4EventMap = new Map<string, { count: number; users: number }>();

  for (const snap of ga4LiveSnaps) {
    for (const dev of snap.devices) {
      deviceMap.set(dev.deviceCategory, (deviceMap.get(dev.deviceCategory) || 0) + dev.sessions);
    }
    for (const loc of snap.locations) {
      const k = `${loc.country}|${loc.region}|${loc.city}`;
      const cur = geoMap.get(k) || {
        country: loc.country,
        region: loc.region,
        city: loc.city,
        sessions: 0,
      };
      cur.sessions += loc.sessions;
      geoMap.set(k, cur);
    }
    for (const ev of snap.events) {
      const cur = ga4EventMap.get(ev.eventName) || { count: 0, users: 0 };
      cur.count += ev.eventCount;
      cur.users += ev.totalUsers;
      ga4EventMap.set(ev.eventName, cur);
    }
  }

  const deviceRows = Array.from(deviceMap.entries())
    .map(([deviceCategory, sessions]) => ({ deviceCategory, sessions }))
    .sort((a, b) => b.sessions - a.sessions);

  const geoRows = Array.from(geoMap.values())
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 15)
    .map((g) => ({
      locationLabel:
        [g.city, g.region, g.country].filter((x) => x && x !== '(not set)').join(', ') ||
        'Không xác định',
      sessions: g.sessions,
    }));

  // Landing pages table (prefer GA4 live landingPagePlusQueryString + CRM landingPageUrl links)
  const lpMap = new Map<
    string,
    {
      landingPage: string;
      sessions: number;
      engagedSessions: number | null;
      conversions: number | null;
      validLeadCount: number;
    }
  >();

  const hasLiveLandingPages = ga4LiveSnaps.some((s) => (s.landingPages?.length || 0) > 0);
  if (hasLiveLandingPages) {
    for (const snap of ga4LiveSnaps) {
      for (const lp of snap.landingPages || []) {
        const cleanUrl = sanitizeLandingPageUrl(lp.landingPage);
        const cur = lpMap.get(cleanUrl) || {
          landingPage: cleanUrl,
          sessions: 0,
          engagedSessions: 0,
          conversions: 0,
          validLeadCount: 0,
        };
        cur.sessions += lp.sessions;
        cur.engagedSessions = (cur.engagedSessions ?? 0) + lp.engagedSessions;
        cur.conversions = (cur.conversions ?? 0) + lp.conversions;
        lpMap.set(cleanUrl, cur);
      }
    }
  } else {
    for (const p of pageRows) {
      const cleanUrl = sanitizeLandingPageUrl(p.pageUrlRaw || p.pagePathNorm || p.campaignExternalId);
      const cur = lpMap.get(cleanUrl) || {
        landingPage: cleanUrl,
        sessions: 0,
        engagedSessions: null,
        conversions: null,
        validLeadCount: 0,
      };
      cur.sessions += p.clicks || p.pageViews;
      lpMap.set(cleanUrl, cur);
    }
  }
  for (const l of validLeads) {
    if (l.tracking?.landingPageUrl) {
      const cleanUrl = sanitizeLandingPageUrl(l.tracking.landingPageUrl);
      const cur = lpMap.get(cleanUrl) || {
        landingPage: cleanUrl,
        sessions: 0,
        engagedSessions: hasLiveLandingPages ? 0 : null,
        conversions: hasLiveLandingPages ? 0 : null,
        validLeadCount: 0,
      };
      cur.validLeadCount += 1;
      lpMap.set(cleanUrl, cur);
    }
  }
  const allLandingRows: M02LandingPageRowDto[] = Array.from(lpMap.values())
    .sort((a, b) => b.sessions - a.sessions || b.validLeadCount - a.validLeadCount)
    .map((r) => ({
      landingPage: r.landingPage,
      sessions: r.sessions,
      engagedSessions: r.engagedSessions,
      engagementRatePct:
        r.engagedSessions !== null && r.sessions > 0
          ? Number(((r.engagedSessions / r.sessions) * 100).toFixed(2))
          : null,
      successfulFormCount: r.conversions,
      validLeadCount: r.validLeadCount,
    }));

  // Touchpoint interactions (actual collected events only)
  const scopedTouchpoints = touchpoints.filter((t) => {
    const ms = new Date(t.occurredAt).getTime();
    if (ms < scope.startDateTime.getTime() || ms > scope.endDateTime.getTime()) return false;
    return matchesWebsiteDomain(t.sourceWebsite, scope.selectedWebsite);
  });
  const phoneClicks = scopedTouchpoints.filter((t) => t.eventType === 'contact_click').length;
  const formSubmitEvents = scopedTouchpoints.filter((t) => t.eventType === 'form_submit_success').length;

  const interactionRows = [
    {
      actionKey: 'phoneClickEvent',
      actionLabel: 'Bấm số điện thoại',
      count: phoneClicks > 0 ? phoneClicks : null,
      users: null,
      meaning: 'Lượt bấm nút gọi trên website (khác với cuộc gọi thực tế)',
      mappedEventName: phoneClicks > 0 ? 'contact_click' : null,
    },
    {
      actionKey: 'zaloClickEvent',
      actionLabel: 'Bấm Zalo',
      count: null,
      users: null,
      meaning: 'Lượt bấm mở Zalo trên website (khác với tin nhắn thực tế)',
      mappedEventName: null,
    },
    {
      actionKey: 'successfulFormEvent',
      actionLabel: 'Form gửi thành công',
      count: formSubmitEvents > 0 ? formSubmitEvents : null,
      users: null,
      meaning: 'Sự kiện gửi form thành công ghi nhận từ website',
      mappedEventName: formSubmitEvents > 0 ? 'form_submit_success' : null,
    },
    {
      actionKey: 'validFormLead',
      actionLabel: 'Lead hợp lệ từ form',
      count: validFormLeads.length,
      users: null,
      meaning: 'Số Lead duy nhất hợp lệ đã tiếp nhận & sàng lọc trong CRM',
      mappedEventName: 'crm_valid_form_lead',
    },
  ];

  // Product interest rows
  const productInterestRows = products
    .map((prod) => {
      const leadCnt = validLeads.filter((l) =>
        l.leadProducts.some((lp: { productId: number }) => lp.productId === prod.id),
      ).length;
      return {
        productId: prod.id,
        productName: prod.productName,
        productUrl: null,
        pageViews: null,
        users: null,
        phoneClicks: null,
        zaloClicks: null,
        validLeadCount: leadCnt,
      };
    })
    .filter((p) => p.validLeadCount > 0)
    .sort((a, b) => b.validLeadCount - a.validLeadCount);

  const lastLog = syncLogs[0] || null;
  // Journey steps derived from pageRows + GA4 events + CRM valid form leads
  const productViewSessions = pageRows.reduce((sum, p) => {
    const url = (p.pageUrlRaw || p.pagePathNorm || '').toLowerCase();
    if (
      url.includes('/san-pham') ||
      url.includes('man-hinh-led') ||
      url.includes('bang-led') ||
      url.includes('bang-dien-tu') ||
      url.includes('module-led') ||
      url.includes('/led-')
    ) {
      return sum + (p.clicks || p.pageViews);
    }
    return sum;
  }, 0);

  const contactPageSessions = pageRows.reduce((sum, p) => {
    const url = (p.pageUrlRaw || p.pagePathNorm || '').toLowerCase();
    if (
      url.includes('/lien-he') ||
      url.includes('/bao-gia') ||
      url.includes('/tu-van') ||
      url.includes('/contact')
    ) {
      return sum + (p.clicks || p.pageViews);
    }
    return sum;
  }, 0);

  const ga4FormCount = Array.from(ga4EventMap.entries())
    .filter(([k]) => {
      const l = k.toLowerCase();
      return l.includes('form_submit') || l.includes('generate_lead') || l.includes('contact_form');
    })
    .reduce((s, [, v]) => s + v.count, 0);

  const resolvedFormStepCount =
    ga4FormCount > 0 ? ga4FormCount : formSubmitEvents > 0 ? formSubmitEvents : validFormLeads.length;

  const lastSuccessLog = syncLogs.find((s) => s.status === 'success') || null;
  const isError = lastLog?.status === 'failed';

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition: 'Truy cập & Lead phát sinh trong khoảng ngày và website đang chọn',
    },
    freshness: {
      lastCheckedAt: lastLog?.startedAt?.toISOString() || new Date().toISOString(),
      lastSuccessAt: lastSuccessLog?.completedAt?.toISOString() || null,
      dataThrough: accountRows[accountRows.length - 1]?.metricDate || null,
      state: isError
        ? 'ERROR'
        : !hasTrafficData
          ? 'NO_DATA'
          : scope.isTodayIncluded
            ? 'PRELIMINARY'
            : 'FINALIZED',
      statusMessage: isError
        ? 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.'
        : scope.isTodayIncluded
          ? 'Số liệu trong ngày còn sơ bộ.'
          : lastSuccessLog?.completedAt
            ? `Cập nhật lúc ${new Date(lastSuccessLog.completedAt).toLocaleString('vi-VN')}`
            : 'Đang hiển thị dữ liệu cập nhật gần nhất.',
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: [],
      note:
        !scope.selectedWebsite && scope.availableWebsites.length > 1
          ? 'Khi xem tất cả website, số người dùng tổng hợp có thể trùng lặp giữa các website.'
          : null,
    },
    version: `m02-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${validFormLeads.length}-${totalSessions ?? 'null'}`,
    metrics: {
      users: resolvedUsers,
      newUsers: periodNewUsers,
      sessions: totalSessions,
      pageViews: totalPageViews,
      engagementRatePct: periodEngagementRatePct,
      engagedSessions: periodEngagedSessions,
      averageEngagementSeconds: periodAvgEngagementSec,
      validFormLeadCount: validFormLeads.length,
      activeUsers30m: realtime.activeUsers30m,
    },
    realtimeMinutesSeries: realtime.minutesSeries,
    charts: {
      trafficSeries,
      channelRows,
      deviceRows,
      geoRows,
    },
    tables: {
      landingPageRows: paginateArray(allLandingRows, params?.page || 1, params?.pageSize || 20),
      interactionRows,
      formSessionRatePct: null,
      productInterestRows,
      journeySteps: [
        { stepKey: 'landing', label: 'Trang vào', sessionCount: totalSessions },
        { stepKey: 'product_view', label: 'Xem sản phẩm', sessionCount: productViewSessions > 0 ? productViewSessions : null },
        { stepKey: 'contact_click', label: 'Trang liên hệ', sessionCount: contactPageSessions > 0 ? contactPageSessions : null },
        { stepKey: 'form_submit', label: 'Gửi form thành công', sessionCount: resolvedFormStepCount },
      ],
      journeyAvailable: false,
      journeyNote:
        'Chưa có dữ liệu chuỗi bước theo cùng nhóm phiên; chỉ hiển thị các chỉ số độc lập đang thu thập được.',
    },
  };
}
