import { prisma } from '@toantrung/database';
import { getValidAccessToken } from './google-oauth.service';
import { resolveDashboardScope } from '../../core/website-catalog';
import type {
  DashboardDatePreset,
  M03SiteStatusRowDto,
  WebsiteConfigItemDto,
} from '@toantrung/contracts';

export interface Ga4PropertyPeriodSnapshot {
  propertyId: string;
  startDate: string;
  endDate: string;
  fetchedAt: string;
  totals: {
    totalUsers: number;
    newUsers: number;
    activeUsers: number;
    sessions: number;
    screenPageViews: number;
    engagedSessions: number;
    engagementRatePct: number | null;
    userEngagementDurationSec: number;
  };
  daily: Array<{
    date: string; // YYYY-MM-DD
    sessions: number;
    pageViews: number;
    users: number;
  }>;
  channels: Array<{
    channelGroup: string;
    sessions: number;
    engagedSessions: number;
    engagementRatePct: number | null;
  }>;
  events: Array<{
    eventName: string;
    eventCount: number;
    totalUsers: number;
  }>;
  devices: Array<{
    deviceCategory: string;
    sessions: number;
  }>;
  locations: Array<{
    country: string;
    region: string;
    city: string;
    sessions: number;
  }>;
  landingPages: Array<{
    landingPage: string;
    sessions: number;
    engagedSessions: number;
    engagementRatePct: number | null;
    conversions: number;
  }>;
}

const MEM_CACHE = new Map<string, { expiresAt: number; data: Ga4PropertyPeriodSnapshot }>();
const IN_FLIGHT = new Map<string, Promise<Ga4PropertyPeriodSnapshot | null>>();
const CACHE_TTL_MS = 5 * 60 * 1000;
const DB_CACHE_KEY = 'ga4_live_snapshot_cache_v2';
const GSC_INSPECT_CACHE_KEY = 'gsc_url_inspection_cache_v1';

let dbCacheHydrated = false;
let warmerStarted = false;
let warmerRunning = false;

function formatGa4Date(raw: string): string {
  // YYYYMMDD -> YYYY-MM-DD
  if (/^\d{8}$/.test(raw)) {
    return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
  }
  return raw;
}

async function hydrateFromDbIfNeeded(): Promise<void> {
  if (dbCacheHydrated) return;
  dbCacheHydrated = true;
  try {
    const row = await prisma.systemSetting.findUnique({ where: { key: DB_CACHE_KEY } });
    if (!row?.value) return;
    const parsed = JSON.parse(row.value) as Record<string, Ga4PropertyPeriodSnapshot>;
    const now = Date.now();
    for (const [k, snap] of Object.entries(parsed)) {
      if (snap && snap.fetchedAt) {
        const age = now - new Date(snap.fetchedAt).getTime();
        if (age < 30 * 60 * 1000) {
          MEM_CACHE.set(k, {
            expiresAt: Math.max(now + 60_000, new Date(snap.fetchedAt).getTime() + CACHE_TTL_MS),
            data: snap,
          });
        }
      }
    }
  } catch {
    // ignore corrupt cache
  }
}

async function persistMemCacheToDb(): Promise<void> {
  try {
    const out: Record<string, Ga4PropertyPeriodSnapshot> = {};
    for (const [k, entry] of MEM_CACHE.entries()) {
      out[k] = entry.data;
    }
    await prisma.systemSetting.upsert({
      where: { key: DB_CACHE_KEY },
      update: { value: JSON.stringify(out) },
      create: { key: DB_CACHE_KEY, value: JSON.stringify(out) },
    });
  } catch {
    // ignore
  }
}

async function fetchPropertyPeriodFromGa4(
  propertyId: string,
  startDate: string,
  endDate: string,
  accessToken: string,
): Promise<Ga4PropertyPeriodSnapshot | null> {
  try {
    // batchRunReports supports up to 5 reports per call
    const batchRes = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:batchRunReports`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            // 0: Period Totals (no date dimension -> exact unique totalUsers & activeUsers)
            {
              dateRanges: [{ startDate, endDate }],
              metrics: [
                { name: 'totalUsers' },
                { name: 'newUsers' },
                { name: 'activeUsers' },
                { name: 'sessions' },
                { name: 'screenPageViews' },
                { name: 'engagedSessions' },
                { name: 'engagementRate' },
                { name: 'userEngagementDuration' },
              ],
            },
            // 1: Channel group breakdown
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'sessionDefaultChannelGroup' }],
              metrics: [
                { name: 'sessions' },
                { name: 'engagedSessions' },
                { name: 'engagementRate' },
              ],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: 20,
            },
            // 2: Events
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'eventName' }],
              metrics: [{ name: 'eventCount' }, { name: 'totalUsers' }],
              orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
              limit: 50,
            },
            // 3: Device category
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'deviceCategory' }],
              metrics: [{ name: 'sessions' }],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: 10,
            },
            // 4: Daily series
            {
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'date' }],
              metrics: [
                { name: 'sessions' },
                { name: 'screenPageViews' },
                { name: 'totalUsers' },
              ],
              orderBys: [{ dimension: { dimensionName: 'date' }, desc: false }],
              limit: 100,
            },
          ],
        }),
      },
    );

    if (!batchRes.ok) {
      return null;
    }

    const batchJson = (await batchRes.json()) as {
      reports?: Array<{
        rows?: Array<{
          dimensionValues?: Array<{ value?: string }>;
          metricValues?: Array<{ value?: string }>;
        }>;
      }>;
    };

    const reports = batchJson.reports || [];
    const totRow = reports[0]?.rows?.[0]?.metricValues || [];
    const totalUsers = Number(totRow[0]?.value || 0);
    const newUsers = Number(totRow[1]?.value || 0);
    const activeUsers = Number(totRow[2]?.value || 0);
    const sessions = Number(totRow[3]?.value || 0);
    const screenPageViews = Number(totRow[4]?.value || 0);
    const engagedSessions = Number(totRow[5]?.value || 0);
    const rawRate = Number(totRow[6]?.value || 0);
    const userEngagementDurationSec = Number(totRow[7]?.value || 0);

    const channels = (reports[1]?.rows || []).map((r) => {
      const chSessions = Number(r.metricValues?.[0]?.value || 0);
      const chEngaged = Number(r.metricValues?.[1]?.value || 0);
      const chRate = Number(r.metricValues?.[2]?.value || 0);
      return {
        channelGroup: r.dimensionValues?.[0]?.value || 'Unassigned',
        sessions: chSessions,
        engagedSessions: chEngaged,
        engagementRatePct: chSessions > 0 ? Number((chRate * 100).toFixed(2)) : null,
      };
    });

    const events = (reports[2]?.rows || []).map((r) => ({
      eventName: r.dimensionValues?.[0]?.value || '',
      eventCount: Number(r.metricValues?.[0]?.value || 0),
      totalUsers: Number(r.metricValues?.[1]?.value || 0),
    }));

    const devices = (reports[3]?.rows || []).map((r) => ({
      deviceCategory: r.dimensionValues?.[0]?.value || 'unknown',
      sessions: Number(r.metricValues?.[0]?.value || 0),
    }));

    const daily = (reports[4]?.rows || []).map((r) => ({
      date: formatGa4Date(r.dimensionValues?.[0]?.value || ''),
      sessions: Number(r.metricValues?.[0]?.value || 0),
      pageViews: Number(r.metricValues?.[1]?.value || 0),
      users: Number(r.metricValues?.[2]?.value || 0),
    }));

    // Fetch location report + landingPagePlusQueryString report in parallel
    let locations: Ga4PropertyPeriodSnapshot['locations'] = [];
    let landingPages: Ga4PropertyPeriodSnapshot['landingPages'] = [];
    try {
      const [locRes, lpRes] = await Promise.all([
        fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'country' }, { name: 'region' }, { name: 'city' }],
              metrics: [{ name: 'sessions' }],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: 15,
            }),
          },
        ),
        fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              dateRanges: [{ startDate, endDate }],
              dimensions: [{ name: 'landingPagePlusQueryString' }],
              metrics: [
                { name: 'sessions' },
                { name: 'engagedSessions' },
                { name: 'engagementRate' },
                { name: 'conversions' },
              ],
              orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
              limit: 60,
            }),
          },
        ),
      ]);

      if (locRes.ok) {
        const locJson = (await locRes.json()) as {
          rows?: Array<{
            dimensionValues?: Array<{ value?: string }>;
            metricValues?: Array<{ value?: string }>;
          }>;
        };
        locations = (locJson.rows || []).map((r) => ({
          country: r.dimensionValues?.[0]?.value || '',
          region: r.dimensionValues?.[1]?.value || '',
          city: r.dimensionValues?.[2]?.value || '',
          sessions: Number(r.metricValues?.[0]?.value || 0),
        }));
      }

      if (lpRes.ok) {
        const lpJson = (await lpRes.json()) as {
          rows?: Array<{
            dimensionValues?: Array<{ value?: string }>;
            metricValues?: Array<{ value?: string }>;
          }>;
        };
        landingPages = (lpJson.rows || []).map((r) => {
          const s = Number(r.metricValues?.[0]?.value || 0);
          const es = Number(r.metricValues?.[1]?.value || 0);
          const er = Number(r.metricValues?.[2]?.value || 0);
          const conv = Math.round(Number(r.metricValues?.[3]?.value || 0));
          return {
            landingPage: r.dimensionValues?.[0]?.value || '/',
            sessions: s,
            engagedSessions: es,
            engagementRatePct: s > 0 ? Number((er * 100).toFixed(2)) : null,
            conversions: conv,
          };
        });
      }
    } catch {
      // non-fatal
    }

    return {
      propertyId,
      startDate,
      endDate,
      fetchedAt: new Date().toISOString(),
      totals: {
        totalUsers,
        newUsers,
        activeUsers,
        sessions,
        screenPageViews,
        engagedSessions,
        engagementRatePct: sessions > 0 ? Number((rawRate * 100).toFixed(2)) : null,
        userEngagementDurationSec,
      },
      daily,
      channels,
      events,
      devices,
      locations,
      landingPages,
    };
  } catch {
    return null;
  }
}

export async function getGa4LivePropertySnapshot(
  propertyId: string,
  startDate: string,
  endDate: string,
  forceRefresh = false,
): Promise<Ga4PropertyPeriodSnapshot | null> {
  await hydrateFromDbIfNeeded();
  const key = `${propertyId}:${startDate}:${endDate}`;
  const now = Date.now();
  const cached = MEM_CACHE.get(key);
  if (!forceRefresh && cached && cached.expiresAt > now) {
    return cached.data;
  }

  const existingFlight = IN_FLIGHT.get(key);
  if (existingFlight) {
    return existingFlight;
  }

  const promise = (async () => {
    try {
      const token = await getValidAccessToken();
      if (!token) return cached?.data || null;
      const fresh = await fetchPropertyPeriodFromGa4(propertyId, startDate, endDate, token);
      if (fresh) {
        MEM_CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: fresh });
        return fresh;
      }
      return cached?.data || null;
    } finally {
      IN_FLIGHT.delete(key);
    }
  })();

  IN_FLIGHT.set(key, promise);
  return promise;
}

export async function getGa4LiveSnapshotsForProperties(
  propertyIds: string[],
  startDate: string,
  endDate: string,
): Promise<Ga4PropertyPeriodSnapshot[]> {
  if (propertyIds.length === 0) return [];
  const results = await Promise.all(
    propertyIds.map((pid) => getGa4LivePropertySnapshot(pid, startDate, endDate)),
  );
  return results.filter((r): r is Ga4PropertyPeriodSnapshot => r !== null);
}

// ============================================================================
// GSC URL Inspection Background Cache (for M03 Tình trạng trang)
// ============================================================================

const GSC_INSPECT_MEM = new Map<string, { expiresAt: number; rows: M03SiteStatusRowDto[] }>();

async function inspectUrlWithGsc(
  siteUrl: string,
  inspectionUrl: string,
  accessToken: string,
): Promise<M03SiteStatusRowDto | null> {
  try {
    const res = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inspectionUrl,
        siteUrl,
        languageCode: 'vi',
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict?: string;
          coverageState?: string;
          lastCrawlTime?: string;
          googleCanonical?: string;
          userCanonical?: string;
        };
      };
    };
    const idx = json.inspectionResult?.indexStatusResult;
    if (!idx) return null;
    const verdict = idx.verdict || 'VERDICT_UNSPECIFIED';
    return {
      url: inspectionUrl,
      verdict: verdict === 'PASS' ? 'Hợp lệ (Đã lập chỉ mục)' : verdict === 'FAIL' ? 'Lỗi lập chỉ mục' : verdict,
      coverageState: idx.coverageState || 'Chưa xác định',
      issuesToReview: verdict === 'PASS' ? null : idx.coverageState || 'Cần kiểm tra lại trạng thái lập chỉ mục',
      lastCrawlTime: idx.lastCrawlTime || null,
      lastCheckedAt: new Date().toISOString(),
      googleCanonical: idx.googleCanonical || null,
      userCanonical: idx.userCanonical || null,
    };
  } catch {
    return null;
  }
}

export async function getCachedGscSiteStatus(
  gscSiteUrls: string[],
): Promise<M03SiteStatusRowDto[]> {
  if (gscSiteUrls.length === 0) return [];
  if (GSC_INSPECT_MEM.size === 0) {
    try {
      const row = await prisma.systemSetting.findUnique({ where: { key: GSC_INSPECT_CACHE_KEY } });
      if (row?.value) {
        const parsed = JSON.parse(row.value) as Record<string, M03SiteStatusRowDto[]>;
        for (const [site, rows] of Object.entries(parsed)) {
          GSC_INSPECT_MEM.set(site, { expiresAt: Date.now() + 6 * 60 * 60 * 1000, rows });
        }
      }
    } catch {
      // ignore
    }
  }

  const out: M03SiteStatusRowDto[] = [];
  for (const site of gscSiteUrls) {
    const hit = GSC_INSPECT_MEM.get(site);
    if (hit) out.push(...hit.rows);
  }
  return out;
}

async function warmGscInspectionInBackground(websites: WebsiteConfigItemDto[], accessToken: string): Promise<void> {
  const gscSites = Array.from(
    new Set(websites.map((w) => w.gscSiteUrl).filter((s): s is string => Boolean(s))),
  );
  if (gscSites.length === 0) return;

  const now = Date.now();
  let updated = false;
  for (const siteUrl of gscSites) {
    const existing = GSC_INSPECT_MEM.get(siteUrl);
    if (existing && existing.expiresAt > now && existing.rows.length > 0) {
      continue;
    }

    // Pick top 3 pages for this site from PlatformDailyMetric, fallback to homepage
    const topPages = await prisma.platformDailyMetric.findMany({
      where: {
        platform: 'search_console',
        accountPropertyId: siteUrl,
        grain: 'page',
      },
      orderBy: { clicks: 'desc' },
      take: 10,
      select: { pageUrlRaw: true },
    });

    const candidateUrls = Array.from(
      new Set([
        siteUrl,
        ...topPages.map((p) => p.pageUrlRaw).filter((u): u is string => Boolean(u && u.startsWith('http'))),
      ]),
    ).slice(0, 3);

    const inspected: M03SiteStatusRowDto[] = [];
    for (const u of candidateUrls) {
      const row = await inspectUrlWithGsc(siteUrl, u, accessToken);
      if (row) inspected.push(row);
    }
    if (inspected.length > 0) {
      GSC_INSPECT_MEM.set(siteUrl, {
        expiresAt: Date.now() + 6 * 60 * 60 * 1000,
        rows: inspected,
      });
      updated = true;
    }
  }

  if (updated) {
    try {
      const payload: Record<string, M03SiteStatusRowDto[]> = {};
      for (const [k, v] of GSC_INSPECT_MEM.entries()) payload[k] = v.rows;
      await prisma.systemSetting.upsert({
        where: { key: GSC_INSPECT_CACHE_KEY },
        update: { value: JSON.stringify(payload) },
        create: { key: GSC_INSPECT_CACHE_KEY, value: JSON.stringify(payload) },
      });
    } catch {
      // ignore
    }
  }
}

// ============================================================================
// Background Pre-Warmer (runs at startup + every 4 minutes)
// ============================================================================

export async function warmAllDashboardDataInBackground(): Promise<void> {
  if (warmerRunning) return;
  warmerRunning = true;
  try {
    const token = await getValidAccessToken();
    if (!token) return;

    const baseScope = await resolveDashboardScope({ websiteId: 'all', preset: '7D' });
    const propIds = Array.from(
      new Set(
        baseScope.availableWebsites
          .map((w) => w.ga4PropertyId)
          .filter((id): id is string => Boolean(id)),
      ),
    );

    const presets: DashboardDatePreset[] = ['TODAY', 'YESTERDAY', '7D', '30D'];
    const presetScopes = await Promise.all(
      presets.map((preset) => resolveDashboardScope({ websiteId: 'all', preset })),
    );

    const tasks: Array<Promise<void>> = [];
    for (const sc of presetScopes) {
      for (const pid of propIds) {
        const key = `${pid}:${sc.startDateStr}:${sc.endDateStr}`;
        const cached = MEM_CACHE.get(key);
        if (!cached || cached.expiresAt <= Date.now()) {
          tasks.push(
            fetchPropertyPeriodFromGa4(pid, sc.startDateStr, sc.endDateStr, token).then((fresh) => {
              if (fresh) {
                MEM_CACHE.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, data: fresh });
              }
            }),
          );
        }
      }
    }
    await Promise.all(tasks);

    await persistMemCacheToDb();
    await warmGscInspectionInBackground(baseScope.availableWebsites, token);
  } catch {
    // non-fatal background warm
  } finally {
    warmerRunning = false;
  }
}

export function ensureM02M04BackgroundWarmerStarted(): void {
  if (warmerStarted) return;
  warmerStarted = true;

  // Warm immediately after server boot (500ms delay)
  const initialTimer = setTimeout(() => {
    void warmAllDashboardDataInBackground();
  }, 500);
  initialTimer.unref?.();

  // Refresh silently every 4 minutes so all websites x presets stay hot
  const interval = setInterval(() => {
    void warmAllDashboardDataInBackground();
  }, 4 * 60 * 1000);
  interval.unref?.();
}
