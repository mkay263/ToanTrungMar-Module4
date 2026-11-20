import { prisma } from '@toantrung/database';
import {
  isL2Valid,
  normalizeMarketingChannelDisplay,
  type M02AdsSectionDto,
  type M02CampaignRowDto,
  type M02ChannelRowDto,
  type M02InteractionRowDto,
  type M02LandingPageRowDto,
  type M02TrafficInteractionDto,
  type M02TrafficSeriesPointDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
  sanitizeLandingPageUrl,
} from '../../core/website-catalog';
import { getOrComputeScopedCache } from '../../core/cache/server-data-cache';
import {
  getGa4LiveSnapshotsForProperties,
  getGa4RealtimeSnapshotNonBlocking,
} from './ga4-live-cache.service';
import { getGoogleAdsApiConfig, getGoogleConnection } from './google-oauth.service';
import { getStoredTouchpoints } from './service';

function mapGa4ChannelGroup(rawChannelGroup: string): {
  key: string;
  label: string;
  source: string;
  medium: string;
} {
  const s = (rawChannelGroup || '').trim().toLowerCase();
  if (!s || s === '(not set)' || s === 'unassigned' || s === 'chưa xác định') {
    return { key: 'unknown', label: 'Chưa xác định', source: 'Chưa xác định', medium: 'Chưa phân loại' };
  }
  if (s.includes('organic search') || s.includes('tìm kiếm tự nhiên')) {
    return { key: 'organic', label: 'Tìm kiếm tự nhiên', source: 'Google / Search', medium: 'organic' };
  }
  if (s.includes('paid search') || s.includes('cpc') || s.includes('ppc') || s.includes('cross-network') || s.includes('display')) {
    return { key: 'paid_ads', label: 'Google Ads', source: 'google', medium: 'cpc' };
  }
  if (s.includes('paid social')) {
    return { key: 'paid_social', label: 'Quảng cáo mạng xã hội', source: 'social', medium: 'paid_social' };
  }
  if (s.includes('social') || s.includes('facebook') || s.includes('zalo') || s.includes('tiktok')) {
    return { key: 'social', label: 'Mạng xã hội', source: 'social', medium: 'social' };
  }
  if (s.includes('direct') || s === '(none)') {
    return { key: 'direct', label: 'Truy cập trực tiếp', source: '(direct)', medium: '(none)' };
  }
  if (s.includes('referral')) {
    return { key: 'referral', label: 'Website giới thiệu', source: 'referral', medium: 'referral' };
  }
  return { key: 'other', label: rawChannelGroup.trim() || 'Khác', source: rawChannelGroup.trim(), medium: 'other' };
}

function mapCrmChannelKey(channelLabel: string): string {
  const l = channelLabel.toLowerCase();
  if (l === 'google ads') return 'paid_ads';
  if (l === 'quảng cáo facebook') return 'paid_social';
  if (l === 'tìm kiếm tự nhiên') return 'organic';
  if (l === 'mạng xã hội') return 'social';
  if (l === 'website giới thiệu') return 'referral';
  if (l === 'truy cập trực tiếp') return 'direct';
  return 'unknown';
}

function microsToUnitNumber(micros: bigint | null | undefined): number {
  if (!micros) return 0;
  return Number((Number(micros) / 1_000_000).toFixed(2));
}

function conversionsMicrosToNumber(micros: bigint | null | undefined): number {
  if (!micros) return 0;
  // Giữ phần thập phân từ phân bổ Data-Driven / Fractional Conversions (không ép thành số nguyên)
  return Number((Number(micros) / 1_000_000).toFixed(2));
}

export async function getM02TrafficInteractionSpec(params?: {
  websiteId?: string | null;
  preset?: string | null;
  from?: string | null;
  to?: string | null;
  page?: number;
  pageSize?: number;
  adsPage?: number;
  adsPageSize?: number;
  bypassCache?: boolean;
}): Promise<M02TrafficInteractionDto> {
  const scope = await resolveDashboardScope(params);
  const propIds = scope.ga4PropertyIds;
  const cacheKey = `m02-spec:${scope.websiteId}:${scope.preset}:${scope.startDateStr}:${scope.endDateStr}:${params?.page || 1}:${params?.pageSize || 20}:${params?.adsPage || 1}:${params?.adsPageSize || 20}`;

  const cached = await getOrComputeScopedCache<M02TrafficInteractionDto>({
    key: cacheKey,
    domains: ['tracking', 'leads', 'websites'],
    ttlMs: 30_000,
    bypassCache: params?.bypassCache,
    compute: async () => {
      const checkedAt = new Date().toISOString();
      const adsCfg = await getGoogleAdsApiConfig();

  const [
    accountRows,
    prevAccountRows,
    pageRows,
    adsMetricRows,
    realAdsCatalog,
    googleOAuthConn,
    leads,
    prevLeads,
    products,
    touchpoints,
    syncLogs,
    realtime,
    ga4LiveSnaps,
  ] = await Promise.all([
    propIds.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'ga4',
            grain: 'account',
            accountPropertyId: { in: propIds },
            metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
            NOT: { campaignExternalId: { startsWith: 'PERIOD_SNAPSHOT:' } },
          },
          orderBy: { metricDate: 'asc' },
        })
      : Promise.resolve([]),
    propIds.length > 0
      ? prisma.platformDailyMetric.findMany({
          where: {
            platform: 'ga4',
            grain: 'account',
            accountPropertyId: { in: propIds },
            metricDate: { gte: scope.prevStartDateStr, lte: scope.prevEndDateStr },
            NOT: { campaignExternalId: { startsWith: 'PERIOD_SNAPSHOT:' } },
          },
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
    prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook_ads', 'facebook'] },
        grain: { in: ['campaign', 'ad_group', 'keyword'] },
        metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
        NOT: [
          { accountPropertyId: { startsWith: 'GA4-' } },
          { campaignExternalId: { startsWith: 'ga4_' } },
        ],
      },
      include: {
        campaign: {
          select: {
            id: true,
            campaignCode: true,
            campaignName: true,
            utmCampaignSlug: true,
            isActive: true,
            platform: true,
          },
        },
      },
      orderBy: { metricDate: 'asc' },
    }),
    prisma.campaign.findMany({
      where: {
        platform: 'google_ads',
        NOT: [{ accountExternalId: 'default' }, { accountExternalId: { startsWith: 'GA4-' } }],
      },
      orderBy: { id: 'asc' },
    }),
    getGoogleConnection(),
    prisma.lead.findMany({
      where: {
        createdAt: { gte: scope.startDateTime, lte: scope.endDateTime },
      },
      include: {
        tracking: true,
        leadProducts: { select: { productId: true } },
      },
    }),
    prisma.lead.findMany({
      where: {
        createdAt: { gte: scope.prevStartDateTime, lte: scope.prevEndDateTime },
      },
      select: {
        id: true,
        isSpam: true,
        sourceWebsite: true,
        contactChannel: true,
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' },
    }),
    getStoredTouchpoints(),
    prisma.platformSyncLog.findMany({
      where: { platform: { in: ['ga4', 'google_ads'] } },
      orderBy: { id: 'desc' },
      take: 15,
    }),
    getGa4RealtimeSnapshotNonBlocking(propIds),
    getGa4LiveSnapshotsForProperties(propIds, scope.startDateStr, scope.endDateStr, false),
  ]);

  const scopedLeads = leads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const validLeads = scopedLeads.filter((l) => isL2Valid(l));
  const validFormLeads = validLeads.filter((l) => l.contactChannel === 'form_web');

  const prevScopedLeads = prevLeads.filter(
    (l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite) && isL2Valid(l),
  );
  const prevValidFormLeadsCount = prevScopedLeads.filter((l) => l.contactChannel === 'form_web').length;
  const prevSessionsTotal =
    prevAccountRows.length > 0
      ? prevAccountRows.reduce((s, r) => s + (r.clicks || r.pageViews), 0)
      : null;
  const prevPageViewsTotal =
    prevAccountRows.length > 0 ? prevAccountRows.reduce((s, r) => s + r.pageViews, 0) : null;

  // Chuỗi ngày liên tục (C07): ưu tiên dữ liệu chi tiết GA4 đã cache, fallback sang accountRows trong DB
  const dailyMap = new Map<
    string,
    { sessions: number; pageViews: number; users: number | null; hasRow: boolean }
  >();
  if (ga4LiveSnaps.length > 0) {
    const canShowDailyUsers = propIds.length === 1 && ga4LiveSnaps.length === 1;
    for (const snap of ga4LiveSnaps) {
      for (const d of snap.daily) {
        const cur = dailyMap.get(d.date) || {
          sessions: 0,
          pageViews: 0,
          users: canShowDailyUsers ? 0 : null,
          hasRow: false,
        };
        cur.sessions += d.sessions;
        cur.pageViews += d.pageViews;
        if (canShowDailyUsers) {
          cur.users = (cur.users ?? 0) + d.users;
        }
        cur.hasRow = true;
        dailyMap.set(d.date, cur);
      }
    }
  } else {
    for (const r of accountRows) {
      const cur = dailyMap.get(r.metricDate) || {
        sessions: 0,
        pageViews: 0,
        users: null,
        hasRow: false,
      };
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
    periodUsers = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.totalUsers, 0);
    periodNewUsers = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.newUsers, 0);
    const totalActiveUsers = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.activeUsers, 0);
    const totalDur = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.userEngagementDurationSec, 0);
    periodAvgEngagementSec =
      totalActiveUsers > 0 ? Number((totalDur / totalActiveUsers).toFixed(1)) : null;

    const es = ga4LiveSnaps.reduce((acc, s) => acc + s.totals.engagedSessions, 0);
    periodEngagedSessions = es;
    periodEngagementRatePct =
      totalSessions && totalSessions > 0 ? Number(((es / totalSessions) * 100).toFixed(2)) : null;
  }

  // Device, Geo & GA4 Event aggregations
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

  // Touchpoint interactions (chỉ lấy sự kiện tracking thực sự thu thập được — C07 & C10)
  const scopedTouchpoints = touchpoints.filter((t) => {
    const ms = new Date(t.occurredAt).getTime();
    if (ms < scope.startDateTime.getTime() || ms > scope.endDateTime.getTime()) return false;
    return matchesWebsiteDomain(t.sourceWebsite, scope.selectedWebsite);
  });
  const phoneClicksTp = scopedTouchpoints.filter((t) => t.eventType === 'contact_click').length;
  const formSubmitTp = scopedTouchpoints.filter((t) => t.eventType === 'form_submit_success').length;

  const ga4FormEventEntry = Array.from(ga4EventMap.entries()).filter(([k]) => {
    const l = k.toLowerCase();
    return l === 'form_submit' || l === 'generate_lead' || l === 'contact_form_submit';
  });
  const ga4PhoneEventEntry = Array.from(ga4EventMap.entries()).filter(([k]) => {
    const l = k.toLowerCase();
    return l.includes('click_call') || l.includes('phone_click') || l === 'tel_click';
  });
  const ga4ZaloEventEntry = Array.from(ga4EventMap.entries()).filter(([k]) => {
    const l = k.toLowerCase();
    return l.includes('zalo_click') || l.includes('click_zalo');
  });

  const hasFormTracking = ga4FormEventEntry.length > 0 || formSubmitTp > 0;
  const formEventTotal = hasFormTracking
    ? ga4FormEventEntry.reduce((s, [, v]) => s + v.count, 0) + formSubmitTp
    : null;

  const hasPhoneTracking = ga4PhoneEventEntry.length > 0 || phoneClicksTp > 0;
  const phoneEventTotal = hasPhoneTracking
    ? ga4PhoneEventEntry.reduce((s, [, v]) => s + v.count, 0) + phoneClicksTp
    : null;

  const hasZaloTracking = ga4ZaloEventEntry.length > 0;
  const zaloEventTotal = hasZaloTracking
    ? ga4ZaloEventEntry.reduce((s, [, v]) => s + v.count, 0)
    : null;

  // Channel breakdown (C04 & C07: không gán thiếu UTM / Zalo / Email thành Organic/Direct)
  const channelMap = new Map<
    string,
    {
      channelKey: string;
      channelLabel: string;
      source: string;
      medium: string;
      sessions: number;
      engagedSessions: number;
      hasGa4: boolean;
      formEvents: number | null;
      validLeadCount: number;
    }
  >();

  for (const snap of ga4LiveSnaps) {
    for (const ch of snap.channels) {
      const mapped = mapGa4ChannelGroup(ch.channelGroup);
      const cur = channelMap.get(mapped.key) || {
        channelKey: mapped.key,
        channelLabel: mapped.label,
        source: mapped.source,
        medium: mapped.medium,
        sessions: 0,
        engagedSessions: 0,
        hasGa4: false,
        formEvents: null,
        validLeadCount: 0,
      };
      cur.sessions += ch.sessions;
      cur.engagedSessions += ch.engagedSessions;
      cur.hasGa4 = true;
      channelMap.set(mapped.key, cur);
    }
  }

  for (const l of validLeads) {
    const normalizedLabel = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    const key = mapCrmChannelKey(normalizedLabel);
    const cur = channelMap.get(key) || {
      channelKey: key,
      channelLabel: normalizedLabel,
      source: l.tracking?.utmSource || 'Chưa xác định',
      medium: l.tracking?.utmMedium || 'Chưa phân loại',
      sessions: 0,
      engagedSessions: 0,
      hasGa4: false,
      formEvents: null,
      validLeadCount: 0,
    };
    cur.validLeadCount += 1;
    channelMap.set(key, cur);
  }

  const channelRows: M02ChannelRowDto[] = Array.from(channelMap.values())
    .sort((a, b) => b.sessions - a.sessions || b.validLeadCount - a.validLeadCount)
    .slice(0, 10)
    .map((c) => ({
      channelKey: c.channelKey,
      channelLabel: c.channelLabel,
      source: c.source,
      medium: c.medium,
      sessions: c.sessions,
      engagedSessions: c.hasGa4 ? c.engagedSessions : null,
      engagementRatePct:
        c.hasGa4 && c.sessions > 0
          ? Number(((c.engagedSessions / c.sessions) * 100).toFixed(2))
          : null,
      formEvents: c.formEvents,
      validLeadCount: c.validLeadCount,
    }));

  const deviceRows = Array.from(deviceMap.entries())
    .map(([deviceCategory, sessions]) => ({ deviceCategory, sessions }))
    .sort((a, b) => b.sessions - a.sessions);

  const geoRows = Array.from(geoMap.values())
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 15)
    .map((g) => ({
      locationLabel:
        [g.city, g.region, g.country].filter((x) => x && x !== '(not set)').join(', ') ||
        'Chưa xác định',
      sessions: g.sessions,
    }));

  // Landing pages table
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
          conversions: hasFormTracking ? 0 : null,
          validLeadCount: 0,
        };
        cur.sessions += lp.sessions;
        cur.engagedSessions = (cur.engagedSessions ?? 0) + lp.engagedSessions;
        if (cur.conversions !== null) {
          cur.conversions += lp.conversions;
        }
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
        conversions: null,
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

  const interactionRows: M02InteractionRowDto[] = [
    {
      actionKey: 'successfulFormEvent',
      actionLabel: 'Sự kiện gửi biểu mẫu (Tracking)',
      count: formEventTotal,
      users: ga4FormEventEntry.length > 0 ? ga4FormEventEntry.reduce((s, [, v]) => s + v.users, 0) : null,
      meaning: hasFormTracking
        ? 'Lượt gửi biểu mẫu được mã theo dõi website/GA4 ghi nhận (tách biệt với hồ sơ Lead CRM)'
        : 'Chưa cài sự kiện tracking form_submit / generate_lead trên website',
      mappedEventName: ga4FormEventEntry[0]?.[0] || (formSubmitTp > 0 ? 'form_submit_success' : null),
      trackingConfigured: hasFormTracking,
    },
    {
      actionKey: 'phoneClickEvent',
      actionLabel: 'Bấm nút Gọi điện',
      count: phoneEventTotal,
      users: ga4PhoneEventEntry.length > 0 ? ga4PhoneEventEntry.reduce((s, [, v]) => s + v.users, 0) : null,
      meaning: hasPhoneTracking
        ? 'Lượt bấm số điện thoại trên website (không đồng nhất với cuộc gọi thành công hay Lead)'
        : 'Chưa cài sự kiện tracking bấm nút gọi (tel_click / contact_click)',
      mappedEventName: ga4PhoneEventEntry[0]?.[0] || (phoneClicksTp > 0 ? 'contact_click' : null),
      trackingConfigured: hasPhoneTracking,
    },
    {
      actionKey: 'zaloClickEvent',
      actionLabel: 'Bấm nút mở Zalo',
      count: zaloEventTotal,
      users: ga4ZaloEventEntry.length > 0 ? ga4ZaloEventEntry.reduce((s, [, v]) => s + v.users, 0) : null,
      meaning: hasZaloTracking
        ? 'Lượt bấm mở liên kết Zalo trên website (không đồng nhất với tin nhắn Lead)'
        : 'Chưa cài sự kiện tracking bấm Zalo (zalo_click)',
      mappedEventName: ga4ZaloEventEntry[0]?.[0] || null,
      trackingConfigured: hasZaloTracking,
    },
    {
      actionKey: 'validFormLead',
      actionLabel: 'Lead biểu mẫu hợp lệ (CRM đối soát)',
      count: validFormLeads.length,
      users: null,
      meaning: 'Hồ sơ Lead biểu mẫu thực tế đã tiếp nhận và sàng lọc không spam trong CRM',
      mappedEventName: 'leads.contactChannel=form_web',
      trackingConfigured: true,
    },
  ];

  // ==========================================================================
  // C07 — KHỐI QUẢNG CÁO (ADS CAMPAIGNS & CRM ATTRIBUTION)
  // ==========================================================================
  const campaignRowsFromDb = adsMetricRows.filter((m) => m.grain === 'campaign');
  const adGroupRowsFromDb = adsMetricRows.filter((m) => m.grain === 'ad_group');
  const keywordRowsFromDb = adsMetricRows.filter((m) => m.grain === 'keyword');

  // CRM Leads có bằng chứng quảng cáo (gclid, google_lead_form, hoặc utm_medium=cpc/paid)
  const isPaidAdLead = (l: (typeof leads)[number]) => {
    const med = (l.tracking?.utmMedium || '').toLowerCase();
    const src = (l.tracking?.marketingSource || '').toLowerCase();
    return (
      Boolean(l.tracking?.gclid) ||
      l.contactChannel === 'google_lead_form' ||
      med === 'cpc' ||
      med === 'ppc' ||
      med === 'paid' ||
      src.includes('google ads') ||
      src.includes('facebook ads')
    );
  };

  const allScopedAdLeads = scopedLeads.filter(isPaidAdLead);
  const validScopedAdLeads = allScopedAdLeads.filter((l) => isL2Valid(l));
  const wonScopedAdLeads = validScopedAdLeads.filter((l) => l.pipelineStatus === 'won');

  // Tổng hợp chiến dịch quảng cáo (không chia đều chi phí campaign cho nhiều website nếu thiếu dữ liệu phân bổ!)
  const resolveCampaignDomain = (
    campaignName: string,
    utmSlug?: string | null,
    pageUrlRaw?: string | null,
  ): string | null => {
    if (utmSlug === 'multi_website_unsplit') {
      return null;
    }
    if (utmSlug && utmSlug.startsWith('domain:')) {
      return utmSlug.slice('domain:'.length).toLowerCase();
    }
    if (pageUrlRaw) {
      const matchedInUrl = scope.availableWebsites.filter((w) =>
        pageUrlRaw.toLowerCase().includes(w.domain.toLowerCase()),
      );
      if (matchedInUrl.length > 1) return null;
      if (matchedInUrl.length === 1) return matchedInUrl[0].domain;
    }
    const lower = (campaignName || '').toLowerCase();
    const matchedNames: string[] = [];
    if (lower.includes('bangdientu')) matchedNames.push('bangdientu.com.vn');
    if (lower.includes('bangled')) matchedNames.push('bangled.vn');
    if (lower.includes('manhinhled')) matchedNames.push('manhinhled.net.vn');
    if (lower.includes('toantrung') || lower.includes('tđtt') || lower.includes('tdtt')) {
      matchedNames.push('toantrung.com.vn');
    }
    return matchedNames.length === 1 ? matchedNames[0] : null;
  };

  const campAggMap = new Map<
    string,
    {
      campaignId: string;
      campaignName: string;
      status: string;
      channelType: string | null;
      costMicros: bigint;
      impressions: number;
      clicks: number;
      conversionsMicros: bigint;
      mappedWebsite: string | null;
    }
  >();

  for (const m of campaignRowsFromDb) {
    const cid = m.campaignExternalId || String(m.campaignId || 'unmapped');
    const cname = m.campaign?.campaignName || m.campaignExternalId || 'Chiến dịch chưa đặt tên';
    const cur = campAggMap.get(cid) || {
      campaignId: cid,
      campaignName: cname,
      status: m.campaign ? (m.campaign.isActive ? 'ENABLED' : 'PAUSED') : 'ENABLED',
      channelType: m.platform,
      costMicros: 0n,
      impressions: 0,
      clicks: 0,
      conversionsMicros: 0n,
      mappedWebsite: resolveCampaignDomain(
        cname,
        m.campaign?.utmCampaignSlug,
        m.pageUrlRaw,
      ),
    };
    cur.costMicros += m.spendMicros ?? 0n;
    cur.impressions += m.impressions || 0;
    cur.clicks += m.clicks || 0;
    cur.conversionsMicros += m.conversionsMicros ?? 0n;
    if (!cur.mappedWebsite) {
      cur.mappedWebsite = resolveCampaignDomain(
        cname,
        m.campaign?.utmCampaignSlug,
        m.pageUrlRaw,
      );
    }
    campAggMap.set(cid, cur);
  }

  for (const camp of realAdsCatalog) {
    const cid = camp.campaignCode.replace(/^GADS_/, '') || String(camp.id);
    if (!campAggMap.has(cid)) {
      campAggMap.set(cid, {
        campaignId: cid,
        campaignName: camp.campaignName,
        status: camp.isActive ? 'ENABLED' : 'PAUSED',
        channelType: camp.platform,
        costMicros: 0n,
        impressions: 0,
        clicks: 0,
        conversionsMicros: 0n,
        mappedWebsite: resolveCampaignDomain(camp.campaignName, camp.utmCampaignSlug, null),
      });
    }
  }

  // Đối soát Lead CRM theo tên chiến dịch / utmCampaign / campaignId
  const crmByCampKey = new Map<
    string,
    { total: number; valid: number; won: number; websites: Set<string> }
  >();
  for (const l of allScopedAdLeads) {
    const campKey = (
      l.tracking?.utmCampaign ||
      l.tracking?.campaignName ||
      '__UNMAPPED_AD_CAMPAIGN__'
    )
      .trim()
      .toLowerCase();
    const entry = crmByCampKey.get(campKey) || {
      total: 0,
      valid: 0,
      won: 0,
      websites: new Set<string>(),
    };
    entry.total += 1;
    if (isL2Valid(l)) {
      entry.valid += 1;
      if (l.pipelineStatus === 'won') entry.won += 1;
    }
    if (l.sourceWebsite) entry.websites.add(l.sourceWebsite.toLowerCase());
    crmByCampKey.set(campKey, entry);
  }

  let unattributedAccountCampaignCount = 0;
  const campaignList: M02CampaignRowDto[] = [];

  for (const c of campAggMap.values()) {
    const matchCrm =
      crmByCampKey.get(c.campaignName.trim().toLowerCase()) ||
      crmByCampKey.get(c.campaignId.trim().toLowerCase()) ||
      null;
    const resolvedWebsite =
      c.mappedWebsite ||
      (matchCrm && matchCrm.websites.size === 1 ? Array.from(matchCrm.websites)[0] : null);

    // Nếu đang lọc 1 website cụ thể mà campaign cấp tài khoản chưa xác định thuộc website nào -> không tự chia tỷ lệ chi phí!
    if (scope.selectedWebsite && (!resolvedWebsite || !matchesWebsiteDomain(resolvedWebsite, scope.selectedWebsite))) {
      if (!resolvedWebsite) unattributedAccountCampaignCount += 1;
      continue;
    }

    const cost = microsToUnitNumber(c.costMicros);
    const conversions = conversionsMicrosToNumber(c.conversionsMicros);
    const attrTotal = matchCrm?.total || 0;
    const attrValid = matchCrm?.valid || 0;
    const attrWon = matchCrm?.won || 0;

    campaignList.push({
      campaignId: c.campaignId,
      campaignName: c.campaignName,
      status: c.status,
      channelType: c.channelType,
      currency: 'VND',
      cost,
      impressions: c.impressions,
      clicks: c.clicks,
      ctrPct: c.impressions > 0 ? Number(((c.clicks / c.impressions) * 100).toFixed(2)) : null,
      avgCpc: c.clicks > 0 ? Number((cost / c.clicks).toFixed(0)) : null,
      conversions,
      costPerConversion: conversions > 0 ? Number((cost / conversions).toFixed(0)) : null,
      attributedLeadCount: attrTotal,
      validAttributedLeadCount: attrValid,
      wonAttributedLeadCount: attrWon,
      costPerValidLead: attrValid > 0 && cost > 0 ? Number((cost / attrValid).toFixed(0)) : null,
      attributionStatus: !resolvedWebsite
        ? 'UNATTRIBUTED_WEBSITE'
        : attrValid > 0
          ? 'RECONCILED'
          : 'NO_CRM_MATCH',
      attributionNote: !resolvedWebsite
        ? 'Chiến dịch cấp tài khoản chưa gắn website đích cụ thể'
        : attrValid > 0
          ? 'Đã đối soát bằng UTM / GCLID với CRM'
          : 'Chưa phát sinh Lead CRM khớp khóa chiến dịch trong kỳ',
    });
  }

  campaignList.sort((a, b) => b.cost - a.cost || b.validAttributedLeadCount - a.validAttributedLeadCount);

  const includedCampaignIds = new Set(campaignList.map((c) => c.campaignId));
  const hasOAuthAdsConnected = Boolean(
    googleOAuthConn?.connected &&
      !googleOAuthConn.isSandboxDemo &&
      googleOAuthConn.scopes?.some((s) => s.includes('adwords')),
  );
  const hasConnectedAdsData =
    Boolean(adsCfg?.developerToken) ||
    hasOAuthAdsConnected ||
    realAdsCatalog.length > 0 ||
    campaignRowsFromDb.length > 0;
  const adsTotalCost = hasConnectedAdsData
    ? Number(campaignList.reduce((s, c) => s + c.cost, 0).toFixed(0))
    : null;
  const adsTotalImpr = hasConnectedAdsData
    ? campaignList.reduce((s, c) => s + c.impressions, 0)
    : null;
  const adsTotalClicks = hasConnectedAdsData
    ? campaignList.reduce((s, c) => s + c.clicks, 0)
    : null;
  const adsTotalConv = hasConnectedAdsData
    ? Number(campaignList.reduce((s, c) => s + c.conversions, 0).toFixed(2))
    : null;
  const adsCtrPct =
    adsTotalClicks !== null && adsTotalImpr !== null && adsTotalImpr > 0
      ? Number(((adsTotalClicks / adsTotalImpr) * 100).toFixed(2))
      : null;
  const adsAvgCpc =
    adsTotalCost !== null && adsTotalClicks !== null && adsTotalClicks > 0
      ? Number((adsTotalCost / adsTotalClicks).toFixed(0))
      : null;
  const adsCostPerConv =
    adsTotalCost !== null && adsTotalConv !== null && adsTotalConv > 0
      ? Number((adsTotalCost / adsTotalConv).toFixed(0))
      : null;
  const crmCpl =
    adsTotalCost !== null && adsTotalCost > 0 && validScopedAdLeads.length > 0
      ? Number((adsTotalCost / validScopedAdLeads.length).toFixed(0))
      : null;

  // Chuỗi ngày cho Quảng cáo (lọc theo đúng các chiến dịch thuộc phạm vi website đang chọn)
  const adsDayMap = new Map<string, { cost: number; conversions: number; clicks: number }>();
  if (hasConnectedAdsData) {
    for (const m of campaignRowsFromDb) {
      const cid = m.campaignExternalId || String(m.campaignId || 'unmapped');
      if (scope.selectedWebsite && !includedCampaignIds.has(cid)) continue;
      const cur = adsDayMap.get(m.metricDate) || { cost: 0, conversions: 0, clicks: 0 };
      cur.cost += microsToUnitNumber(m.spendMicros);
      cur.conversions += conversionsMicrosToNumber(m.conversionsMicros);
      cur.clicks += m.clicks || 0;
      adsDayMap.set(m.metricDate, cur);
    }
  }

  const canBuildZeroSeries = hasConnectedAdsData && (!scope.selectedWebsite || campaignList.length > 0);
  const adsSeries = trafficSeries.map((pt) => {
    const hit = adsDayMap.get(pt.date);
    return {
      date: pt.date,
      cost: hit ? Number(hit.cost.toFixed(0)) : canBuildZeroSeries ? 0 : null,
      conversions: hit ? Number(hit.conversions.toFixed(2)) : canBuildZeroSeries ? 0 : null,
      clicks: hit ? hit.clicks : canBuildZeroSeries ? 0 : null,
    };
  });

  const adsSection: M02AdsSectionDto = {
    status: hasConnectedAdsData ? 'CONNECTED' : 'UNCONFIGURED',
    statusMessage: hasConnectedAdsData
      ? unattributedAccountCampaignCount > 0 && scope.selectedWebsite
        ? `Có ${unattributedAccountCampaignCount} chiến dịch cấp tài khoản chưa gắn riêng cho ${scope.selectedWebsite.domain}; chọn "Tất cả website" để xem tổng chi phí cấp tài khoản.`
        : adsTotalCost === 0
          ? `Đã kết nối tài khoản Google Ads v26 (${campaignList.length} chiến dịch trong phạm vi; hiện đang tạm dừng hoặc phát sinh 0 ₫ chi tiêu trong kỳ chọn).`
          : 'Đã đồng bộ chỉ số chiến dịch Google Ads v26 và đối soát Lead CRM.'
      : 'Chưa kết nối tài khoản Google OAuth có quyền Google Ads. Vào Cài đặt → Tích hợp Google để kết nối trực tiếp qua OAuth.',
    currencyCode: 'VND',
    metrics: {
      cost: adsTotalCost,
      impressions: adsTotalImpr,
      clicks: adsTotalClicks,
      ctrPct: adsCtrPct,
      avgCpc: adsAvgCpc,
      conversions: adsTotalConv,
      costPerConversion: adsCostPerConv,
      attributedLeadCount: allScopedAdLeads.length,
      validAttributedLeadCount: validScopedAdLeads.length,
      wonAttributedLeadCount: wonScopedAdLeads.length,
      costPerValidLead: crmCpl,
      reconciliationNote: !hasConnectedAdsData
        ? `Ghi nhận ${validScopedAdLeads.length} Lead hợp lệ có bằng chứng quảng cáo (GCLID/UTM) trong CRM; cần kết nối Google Ads API để tính CPL thực tế.`
        : unattributedAccountCampaignCount > 0 && scope.selectedWebsite
          ? `Không chia đều chi phí của ${unattributedAccountCampaignCount} chiến dịch chưa phân bổ website.`
          : 'CPL tính trên chi phí quảng cáo thực tế đối soát cùng phạm vi với Lead hợp lệ từ quảng cáo.',
    },
    series: adsSeries,
    campaigns: paginateArray(campaignList, params?.adsPage || 1, params?.adsPageSize || 20),
    breakdowns: {
      adGroups: adGroupRowsFromDb.slice(0, 30).map((r, idx) => {
        const cost = microsToUnitNumber(r.spendMicros);
        const conv = conversionsMicrosToNumber(r.conversionsMicros);
        return {
          adGroupId: `ag-${r.id}-${idx + 1}`,
          adGroupName: r.keywordRaw || r.campaignExternalId || 'Nhóm quảng cáo',
          campaignName: r.campaign?.campaignName || r.campaignExternalId || 'Chiến dịch',
          cost,
          impressions: r.impressions || 0,
          clicks: r.clicks || 0,
          conversions: conv,
          cpa: conv > 0 ? Number((cost / conv).toFixed(0)) : null,
        };
      }),
      keywords: keywordRowsFromDb.slice(0, 50).map((r) => {
        const cost = microsToUnitNumber(r.spendMicros);
        const impr = r.impressions || 0;
        const clk = r.clicks || 0;
        return {
          keywordText: r.keywordRaw || r.keywordTextNorm || 'Từ khóa quảng cáo',
          matchType: r.keywordMatchType || 'BROAD',
          adGroupName: r.campaignExternalId || 'Nhóm quảng cáo',
          campaignName: r.campaign?.campaignName || 'Chiến dịch',
          impressions: impr,
          clicks: clk,
          ctrPct: impr > 0 ? Number(((clk / impr) * 100).toFixed(2)) : null,
          cost,
          conversions: conversionsMicrosToNumber(r.conversionsMicros),
        };
      }),
      keywordAvailabilityNote: hasConnectedAdsData
        ? keywordRowsFromDb.length === 0
          ? 'Chưa có dữ liệu cấp từ khóa quảng cáo trong kỳ đang chọn.'
          : null
        : 'Chưa kết nối tài khoản Google Ads nên chưa tải được nhóm quảng cáo, từ khóa, thiết bị và khu vực quảng cáo.',
      devices: [],
      regions: [],
    },
  };

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

  const ga4Logs = syncLogs.filter((s) => s.platform === 'ga4');
  const lastLog = ga4Logs[0] || null;
  const lastSuccessLog = ga4Logs.find((s) => s.status === 'success' || s.status === 'partial') || null;
  const isError = lastLog?.status === 'failed' && !hasTrafficData;

  // Determine truthful latest source data date from actual daily rows (never blind endDateStr)
  let latestGa4LiveDailyDate: string | null = null;
  let latestGa4FetchedAt: string | null = null;
  for (const snap of ga4LiveSnaps) {
    if (snap.fetchedAt && (!latestGa4FetchedAt || snap.fetchedAt > latestGa4FetchedAt)) {
      latestGa4FetchedAt = snap.fetchedAt;
    }
    for (const d of snap.daily) {
      if ((d.sessions > 0 || d.pageViews > 0 || d.users > 0) && (!latestGa4LiveDailyDate || d.date > latestGa4LiveDailyDate)) {
        latestGa4LiveDailyDate = d.date;
      }
    }
  }
  const latestDbDate = accountRows[accountRows.length - 1]?.metricDate || null;
  const latestDataThrough =
    latestGa4LiveDailyDate && latestDbDate
      ? (latestGa4LiveDailyDate > latestDbDate ? latestGa4LiveDailyDate : latestDbDate)
      : latestGa4LiveDailyDate || latestDbDate;
  const realLastSuccessAt = latestGa4FetchedAt || lastSuccessLog?.completedAt?.toISOString() || null;

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition: 'Truy cập website, chiến dịch quảng cáo và Lead CRM phát sinh trong kỳ đang chọn',
      previousStartDate: scope.prevStartDateStr,
      previousEndDate: scope.prevEndDateStr,
    },
    freshness: {
      lastCheckedAt: checkedAt,
      checkedAt,
      lastSuccessAt: realLastSuccessAt,
      lastSyncedAt: realLastSuccessAt,
      dataThrough: latestDataThrough,
      latestSourceDataAt: latestDataThrough,
      fromCache: false,
      state: isError
        ? 'ERROR'
        : !hasTrafficData
          ? 'NO_DATA'
          : scope.isTodayIncluded
            ? 'PRELIMINARY'
            : 'FINALIZED',
      statusMessage: isError
        ? 'Không tải được dữ liệu mới từ GA4; vui lòng kiểm tra kết nối.'
        : !hasTrafficData
          ? 'Đang đồng bộ dữ liệu GA4 nền cho khoảng thời gian này.'
          : scope.isTodayIncluded
            ? 'Số liệu trong ngày đang tạm tính (GA4 cập nhật đầy đủ sau 24–48 giờ).'
            : latestDataThrough
              ? `Dữ liệu đến ${latestDataThrough}`
              : 'Đã đồng bộ dữ liệu.',
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: scope.availableWebsites
        .filter((w) => !w.ga4PropertyId)
        .map((w) => w.domain),
      note:
        !scope.selectedWebsite && propIds.length > 1
          ? 'Khi chọn "Tất cả website", chỉ số "Người dùng" và "Thời gian tương tác/người dùng hoạt động" cần xem theo từng website để không cộng trùng người dùng giữa các GA4 property.'
          : null,
    },
    version: `m02-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${validFormLeads.length}-${totalSessions ?? 'null'}`,
    metrics: {
      users: periodUsers,
      newUsers: periodNewUsers,
      sessions: totalSessions,
      pageViews: totalPageViews,
      engagementRatePct: periodEngagementRatePct,
      engagedSessions: periodEngagedSessions,
      averageEngagementSeconds: periodAvgEngagementSec,
      validFormLeadCount: validFormLeads.length,
      formEventCount: formEventTotal,
      activeUsers30m: realtime.activeUsers30m,
      activeWindowCheckedAt: realtime.checkedAt,
      previousSessions: prevSessionsTotal,
      previousUsers: null,
      previousPageViews: prevPageViewsTotal,
      previousFormLeadCount: prevValidFormLeadsCount,
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
      formSessionRatePct:
        totalSessions && totalSessions > 0 && formEventTotal !== null
          ? Number(((formEventTotal / totalSessions) * 100).toFixed(2))
          : null,
      productInterestRows,
      journeySteps: [],
      journeyAvailable: false,
      journeyNote:
        'Các chỉ số Phiên truy cập, Sự kiện biểu mẫu và Lead CRM có đơn vị thống kê khác nhau nên không ghép chung một phễu phiên.',
    },
    ads: adsSection,
  };
    },
  });

  if (cached.fromCache) {
    return {
      ...cached.data,
      freshness: {
        ...cached.data.freshness,
        lastCheckedAt: new Date().toISOString(),
        checkedAt: new Date().toISOString(),
        fromCache: true,
      },
    };
  }
  return cached.data;
}
