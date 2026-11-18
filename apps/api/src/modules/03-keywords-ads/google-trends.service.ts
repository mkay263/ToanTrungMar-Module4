import { prisma } from '@toantrung/database';
import type { M03TrendRowDto } from '@toantrung/contracts';

const SETTING_TRENDS_LIVE_CACHE = 'google_trends_vn_live_cache_v1';
const SETTING_TRENDS_SERPAPI_KEY = 'google_trends_serpapi_api_key_v1';
const TRENDS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 phút

const DEFAULT_LED_SEED_TERMS = [
  'màn hình led',
  'bảng điện tử led',
  'màn hình led hội trường',
  'màn hình led ngoài trời',
];

export interface GoogleTrendsLiveCachePayload {
  fetchedAt: string;
  dailyRssTrends: M03TrendRowDto[];
  industrySuggestions: Array<{
    seedTerm: string;
    suggestions: string[];
    checkedAt: string;
  }>;
  errorMessage?: string | null;
}

let memoryTrendsCache: {
  expiresAt: number;
  payload: GoogleTrendsLiveCachePayload;
} | null = null;

let inflightTrendsRefresh: Promise<GoogleTrendsLiveCachePayload> | null = null;

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .trim();
}

function extractXmlTag(block: string, tagName: string): string | null {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'i');
  const m = block.match(re);
  return m ? decodeXmlEntities(m[1]) : null;
}

/**
 * Đọc RSS chính thức của Google Trends Việt Nam (https://trends.google.com/trending/rss?geo=VN)
 */
export async function fetchGoogleTrendsVietnamRss(): Promise<M03TrendRowDto[]> {
  const res = await fetch('https://trends.google.com/trending/rss?geo=VN', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; ToanTrungAnalytics/2.0)',
      Accept: 'application/rss+xml, application/xml, text/xml',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new Error(`Google Trends RSS trả mã lỗi HTTP ${res.status}`);
  }
  const xml = await res.text();
  const itemMatches = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
  const rows: M03TrendRowDto[] = [];

  for (const itemXml of itemMatches.slice(0, 20)) {
    const title = extractXmlTag(itemXml, 'title');
    if (!title) continue;
    const approxTraffic = extractXmlTag(itemXml, 'ht:approx_traffic');
    const pubDateRaw = extractXmlTag(itemXml, 'pubDate');
    const newsHeadline = extractXmlTag(itemXml, 'ht:news_item_title');
    const newsSource = extractXmlTag(itemXml, 'ht:news_item_source');

    let dateYmd = new Date().toISOString().slice(0, 10);
    if (pubDateRaw) {
      const parsed = new Date(pubDateRaw);
      if (!Number.isNaN(parsed.getTime())) {
        dateYmd = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Ho_Chi_Minh',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(parsed);
      }
    }

    rows.push({
      term: title,
      geoCode: 'VN',
      geoName: 'Việt Nam',
      date: dateYmd,
      interestValue: null,
      scaleType: 'DAILY_TRENDING_RSS',
      comparisonGroupId: 'vn_daily_rss',
      sourceType: 'GOOGLE_TRENDS_RSS',
      approxTrafficLabel: approxTraffic || null,
      newsHeadline: newsHeadline || null,
      newsSource: newsSource || null,
    });
  }

  return rows;
}

/**
 * Tra cứu gợi ý tìm kiếm thực tế tại Việt Nam từ Google Autocomplete Suggest
 */
export async function fetchGoogleVietnamSuggestions(seedQuery: string): Promise<string[]> {
  const q = seedQuery.trim();
  if (!q) return [];
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=vi&gl=vn&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ToanTrungAnalytics/2.0)' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json) || !Array.isArray(json[1])) return [];
  return (json[1] as unknown[])
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map((s) => s.trim());
}

async function refreshGoogleTrendsCacheInternal(): Promise<GoogleTrendsLiveCachePayload> {
  const checkedAt = new Date().toISOString();
  const [rssRes, suggestResults] = await Promise.all([
    fetchGoogleTrendsVietnamRss().catch((err) => {
      return { __err: err instanceof Error ? err.message : 'Lỗi tải Google Trends RSS' };
    }),
    Promise.all(
      DEFAULT_LED_SEED_TERMS.map(async (seedTerm) => {
        const suggestions = await fetchGoogleVietnamSuggestions(seedTerm).catch(() => []);
        return {
          seedTerm,
          suggestions: suggestions.filter((s) => s.toLowerCase() !== seedTerm.toLowerCase()).slice(0, 8),
          checkedAt,
        };
      }),
    ),
  ]);

  const dailyRssTrends = Array.isArray(rssRes) ? rssRes : [];
  const errorMessage = !Array.isArray(rssRes) ? rssRes.__err : null;

  const payload: GoogleTrendsLiveCachePayload = {
    fetchedAt: checkedAt,
    dailyRssTrends,
    industrySuggestions: suggestResults.filter((g) => g.suggestions.length > 0),
    errorMessage,
  };

  memoryTrendsCache = {
    expiresAt: Date.now() + TRENDS_CACHE_TTL_MS,
    payload,
  };

  await prisma.systemSetting
    .upsert({
      where: { key: SETTING_TRENDS_LIVE_CACHE },
      update: { value: JSON.stringify(payload) },
      create: {
        key: SETTING_TRENDS_LIVE_CACHE,
        value: JSON.stringify(payload),
      },
    })
    .catch(() => {});

  return payload;
}

export async function getSerpApiTrendsKey(): Promise<string | null> {
  if (process.env.SERPAPI_API_KEY && process.env.SERPAPI_API_KEY.trim()) {
    return process.env.SERPAPI_API_KEY.trim();
  }
  const row = await prisma.systemSetting
    .findUnique({ where: { key: SETTING_TRENDS_SERPAPI_KEY } })
    .catch(() => null);
  return row?.value?.trim() || null;
}

export async function saveSerpApiTrendsKey(apiKey: string): Promise<void> {
  await prisma.systemSetting.upsert({
    where: { key: SETTING_TRENDS_SERPAPI_KEY },
    update: { value: apiKey.trim() },
    create: {
      key: SETTING_TRENDS_SERPAPI_KEY,
      value: apiKey.trim(),
    },
  });
}

/**
 * Đọc snapshot Google Trends nhanh (non-blocking khi đã có cache DB/RAM; tự làm mới lần đầu nếu chưa có cache).
 */
export async function getGoogleTrendsLiveSnapshot(
  forceRefresh = false,
): Promise<GoogleTrendsLiveCachePayload> {
  const now = Date.now();
  if (!forceRefresh && memoryTrendsCache && memoryTrendsCache.expiresAt > now) {
    return memoryTrendsCache.payload;
  }

  if (!forceRefresh) {
    const dbRow = await prisma.systemSetting
      .findUnique({ where: { key: SETTING_TRENDS_LIVE_CACHE } })
      .catch(() => null);
    if (dbRow?.value) {
      try {
        const parsed = JSON.parse(dbRow.value) as GoogleTrendsLiveCachePayload;
        const ageMs = now - new Date(parsed.fetchedAt).getTime();
        memoryTrendsCache = {
          expiresAt: now + Math.max(30_000, TRENDS_CACHE_TTL_MS - ageMs),
          payload: parsed,
        };
        if (ageMs > TRENDS_CACHE_TTL_MS && !inflightTrendsRefresh) {
          inflightTrendsRefresh = refreshGoogleTrendsCacheInternal().finally(() => {
            inflightTrendsRefresh = null;
          });
        }
        return parsed;
      } catch {
        // tiếp tục làm mới bên dưới
      }
    }
  }

  if (!inflightTrendsRefresh) {
    inflightTrendsRefresh = refreshGoogleTrendsCacheInternal().finally(() => {
      inflightTrendsRefresh = null;
    });
  }
  return inflightTrendsRefresh;
}

/**
 * Đồng bộ chuỗi chỉ số quan tâm theo thời gian (0–100) của một từ khóa qua SerpApi Google Trends (khi có khóa SERPAPI_API_KEY)
 */
export async function syncKeywordInterestViaSerpApi(params: {
  keyword: string;
  geo?: string;
  dateRange?: string;
}): Promise<{ syncedPoints: number; relatedRising: string[] }> {
  const apiKey = await getSerpApiTrendsKey();
  if (!apiKey) {
    throw new Error(
      'Chưa cấu hình khóa SERPAPI_API_KEY để lấy chuỗi chỉ số 0–100 tự động. Bạn có thể nhập khóa SerpApi hoặc tải trực tiếp file multiTimeline.csv xuất từ Google Trends.',
    );
  }
  const keyword = params.keyword.trim();
  if (keyword.length < 2) {
    throw new Error('Từ khóa cần tối thiểu 2 ký tự.');
  }
  const geo = params.geo || 'VN';
  const dateRange = params.dateRange || 'today 1-m';

  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google_trends');
  url.searchParams.set('q', keyword);
  url.searchParams.set('geo', geo);
  url.searchParams.set('date', dateRange);
  url.searchParams.set('data_type', 'TIMESERIES');
  url.searchParams.set('hl', 'vi');
  url.searchParams.set('api_key', apiKey);

  const startedAt = new Date();
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`SerpApi Google Trends trả lỗi HTTP ${res.status}: ${errText.slice(0, 180)}`);
  }

  const json = (await res.json()) as {
    error?: string;
    interest_over_time?: {
      timeline_data?: Array<{
        timestamp?: string;
        date?: string;
        values?: Array<{ query?: string; extracted_value?: number }>;
      }>;
    };
  };
  if (json.error) {
    throw new Error(`SerpApi báo lỗi: ${json.error}`);
  }

  const timeline = json.interest_over_time?.timeline_data || [];
  const normKw = keyword.toLowerCase();
  let syncedPoints = 0;

  for (const pt of timeline) {
    const tsSec = Number(pt.timestamp);
    if (!Number.isFinite(tsSec) || tsSec <= 0) continue;
    const metricDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(tsSec * 1000));
    const val = pt.values?.[0]?.extracted_value;
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    const clampedScore = Math.max(0, Math.min(100, Math.round(val)));
    const fingerprint = `google_trends|${geo}|${metricDate}|topic|${normKw}`;

    await prisma.platformDailyMetric.upsert({
      where: {
        uq_platform_metric_scope: {
          platform: 'google_trends',
          accountPropertyId: geo,
          metricDate,
          grain: 'topic',
          campaignExternalId: 'serpapi_timeseries',
          keywordMatchType: '',
          keywordTextNorm: normKw,
          pagePathNorm: '',
        },
      },
      update: {
        keywordRaw: keyword,
        trendInterestScore: clampedScore,
        impressions: clampedScore,
        dimensionFingerprint: fingerprint,
        syncedAt: new Date(),
      },
      create: {
        platform: 'google_trends',
        accountPropertyId: geo,
        metricDate,
        grain: 'topic',
        campaignExternalId: 'serpapi_timeseries',
        keywordMatchType: '',
        keywordTextNorm: normKw,
        pagePathNorm: '',
        dimensionFingerprint: fingerprint,
        keywordRaw: keyword,
        trendInterestScore: clampedScore,
        impressions: clampedScore,
      },
    });
    syncedPoints += 1;
  }

  await prisma.platformSyncLog.create({
    data: {
      platform: 'google_trends',
      accountPropertyId: geo,
      status: 'success',
      recordsSynced: syncedPoints,
      startedAt,
      completedAt: new Date(),
    },
  });

  const relatedRising = await fetchGoogleVietnamSuggestions(keyword).catch(() => []);
  return { syncedPoints, relatedRising };
}

/**
 * Nhập trực tiếp file multiTimeline.csv tải về từ trang Google Trends Explore (https://trends.google.com/trends/explore?geo=VN)
 */
export async function importGoogleTrendsTimelineCsv(csvContent: string): Promise<{
  importedRows: number;
  terms: string[];
}> {
  const lines = csvContent
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Tìm dòng tiêu đề dạng: "Ngày,màn hình led: (Việt Nam)" hoặc "Tuần,..." hoặc "Day,..." / "Week,..."
  const headerIdx = lines.findIndex((l) =>
    /^(?:ngày|tuần|tháng|day|week|month)\s*,/i.test(l),
  );
  if (headerIdx === -1 || headerIdx + 1 >= lines.length) {
    throw new Error(
      'Không tìm thấy dòng tiêu đề hợp lệ (Ngày/Tuần, <từ khóa>) trong file CSV xuất từ Google Trends.',
    );
  }

  const headerCols = lines[headerIdx].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
  const terms = headerCols
    .slice(1)
    .map((col) => col.replace(/:\s*\([^)]*\)\s*$/, '').trim())
    .filter(Boolean);

  if (terms.length === 0) {
    throw new Error('File CSV không có cột từ khóa nào.');
  }

  let importedRows = 0;
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
    const dateStr = cols[0];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    for (let tIdx = 0; tIdx < terms.length; tIdx++) {
      const term = terms[tIdx];
      const rawVal = cols[tIdx + 1];
      if (rawVal === undefined || rawVal === '') continue;
      const numericVal = rawVal.includes('<') ? 1 : Number(rawVal);
      if (!Number.isFinite(numericVal)) continue;
      const clampedScore = Math.max(0, Math.min(100, Math.round(numericVal)));
      const normKw = term.toLowerCase();
      const fingerprint = `google_trends|VN|${dateStr}|topic|${normKw}`;

      await prisma.platformDailyMetric.upsert({
        where: {
          uq_platform_metric_scope: {
            platform: 'google_trends',
            accountPropertyId: 'VN',
            metricDate: dateStr,
            grain: 'topic',
            campaignExternalId: 'csv_import',
            keywordMatchType: '',
            keywordTextNorm: normKw,
            pagePathNorm: '',
          },
        },
        update: {
          keywordRaw: term,
          trendInterestScore: clampedScore,
          impressions: clampedScore,
          dimensionFingerprint: fingerprint,
          syncedAt: new Date(),
        },
        create: {
          platform: 'google_trends',
          accountPropertyId: 'VN',
          metricDate: dateStr,
          grain: 'topic',
          campaignExternalId: 'csv_import',
          keywordMatchType: '',
          keywordTextNorm: normKw,
          pagePathNorm: '',
          dimensionFingerprint: fingerprint,
          keywordRaw: term,
          trendInterestScore: clampedScore,
          impressions: clampedScore,
        },
      });
      importedRows += 1;
    }
  }

  if (importedRows === 0) {
    throw new Error('Không đọc được điểm dữ liệu ngày YYYY-MM-DD nào từ file CSV.');
  }

  return { importedRows, terms };
}
