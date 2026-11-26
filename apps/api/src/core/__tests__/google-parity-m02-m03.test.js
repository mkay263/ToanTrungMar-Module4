'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };
}

const V2_ROOT = path.resolve(__dirname, '../../../../..');
const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAliases(request, parent, isMain, options) {
  if (request === '@toantrung/contracts') {
    return path.join(V2_ROOT, 'packages/contracts/src/common/index.ts');
  }
  if (request === '@toantrung/database') {
    return path.join(V2_ROOT, 'packages/database/src/index.ts');
  }
  try {
    return origResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (request.startsWith('.') && parent && parent.filename) {
      const candidateTs = path.resolve(path.dirname(parent.filename), `${request}.ts`);
      if (fs.existsSync(candidateTs)) return candidateTs;
      const candidateIndexTs = path.resolve(path.dirname(parent.filename), request, 'index.ts');
      if (fs.existsSync(candidateIndexTs)) return candidateIndexTs;
    }
    throw err;
  }
};

const {
  parseGadsSearchTermRows,
  parseGadsLandingPageRows,
  parseGadsDeviceRows,
  parseGadsTimeScheduleRows,
  mergeGoogleAdsSnapshotPreservingOnPartialFailure,
} = require('../../modules/02-tracking-sync/gads-live-cache.service.ts');

const {
  aggregateGscQueryPageLinks,
} = require('../../modules/03-keywords-ads/gsc-live-cache.service.ts');

const {
  parseGoogleTrendsCsvAuto,
} = require('../../modules/03-keywords-ads/google-trends.service.ts');

const {
  getM02TrafficInteractionSpec,
} = require('../../modules/02-tracking-sync/m02-spec.service.ts');
const {
  getM04ResultsReportSpec,
} = require('../../modules/04-reports/m04-spec.service.ts');
const {
  refreshKeywordDerivedCacheFromCanonicalMetrics,
} = require('../../modules/03-keywords-ads/service.ts');
const { prisma } = require('@toantrung/database');

test('Google Ads GAQL parsers chuẩn hóa search_term_view, landing_page_view, device và khung giờ', () => {
  const terms = parseGadsSearchTermRows([
    {
      searchTermView: { searchTerm: 'báo giá màn hình led p2.5', status: 'ADDED' },
      campaign: { name: 'LED_Indoor_TT' },
      adGroup: { name: 'P2.5 Indoor' },
      metrics: { impressions: '120', clicks: '15', costMicros: '45000000000', conversions: 2 },
    },
    {
      searchTermView: { searchTerm: 'Báo Giá Màn Hình LED P2.5', status: 'ADDED' },
      campaign: { name: 'LED_Indoor_TT' },
      adGroup: { name: 'P2.5 Indoor' },
      metrics: { impressions: '80', clicks: '5', costMicros: '15000000000', conversions: 1 },
    },
  ]);
  assert.equal(terms.length, 1);
  assert.equal(terms[0].clicks, 20);
  assert.equal(terms[0].impressions, 200);
  assert.equal(terms[0].ctrPct, 10);
  assert.equal(terms[0].cost, 60000);
  assert.equal(terms[0].conversions, 3);

  const lps = parseGadsLandingPageRows([
    {
      landingPageView: { unexpandedFinalUrl: 'https://toantrung.com.vn/man-hinh-led-indoor/' },
      campaign: { name: 'LED_Indoor_TT' },
      metrics: { impressions: '500', clicks: '50', costMicros: '250000000000', conversions: 4 },
    },
  ]);
  assert.equal(lps.length, 1);
  assert.equal(lps[0].ctrPct, 10);
  assert.equal(lps[0].avgCpc, 5000);
  assert.equal(lps[0].cost, 250000);

  const devs = parseGadsDeviceRows([
    { segments: { device: 'MOBILE' }, metrics: { impressions: '300', clicks: '30', costMicros: '90000000000' } },
    { segments: { device: 'DESKTOP' }, metrics: { impressions: '200', clicks: '10', costMicros: '50000000000' } },
  ]);
  assert.equal(devs[0].device, 'Điện thoại di động');
  assert.equal(devs[0].cost, 90000);

  const sched = parseGadsTimeScheduleRows([
    { segments: { dayOfWeek: 'MONDAY', hour: 9 }, metrics: { impressions: '100', clicks: '10', costMicros: '20000000000', conversions: 1 } },
  ]);
  assert.equal(sched[0].dayOfWeek, 'Thứ 2');
  assert.equal(sched[0].hour, 9);
});

test('GSC aggregateGscQueryPageLinks gom chính xác cặp query-page và tính CTR/vị trí bình quân gia quyền', () => {
  const links = aggregateGscQueryPageLinks([
    { keys: ['màn hình led hội trường', 'https://toantrung.com.vn/hoi-truong?token=secret'], clicks: 10, impressions: 100, position: 4 },
    { keys: ['màn hình led hội trường', 'https://toantrung.com.vn/hoi-truong'], clicks: 10, impressions: 100, position: 2 },
  ]);
  assert.equal(links.length, 1);
  assert.equal(links[0].clicks, 20);
  assert.equal(links[0].impressions, 200);
  assert.equal(links[0].ctrPct, 10);
  assert.equal(links[0].averagePosition, 3);
});

test('Google Trends parseGoogleTrendsCsvAuto đọc đúng multiTimeline.csv đa từ khóa và geoMap.csv Tỉnh/Thành', () => {
  const timelineCsv = [
    'Danh mục: Tất cả các danh mục',
    '',
    'Tuần,"màn hình led: (Việt Nam)","bảng điện tử led: (Việt Nam)","led ngoài trời: (Việt Nam)"',
    '2026-10-04,78,24,<1',
    '2026-10-11,85,30,12',
  ].join('\n');

  const parsedTl = parseGoogleTrendsCsvAuto(timelineCsv);
  assert.equal(parsedTl.detectedType, 'timeline');
  assert.deepEqual(parsedTl.terms, ['màn hình led', 'bảng điện tử led', 'led ngoài trời']);
  assert.equal(parsedTl.timelinePoints.length, 6);
  const underOne = parsedTl.timelinePoints.find((p) => p.term === 'led ngoài trời' && p.date === '2026-10-04');
  assert.equal(underOne.value, 1);

  const geoCsv = [
    'Khu vực: Việt Nam',
    '',
    'Tỉnh/Thành phố,"màn hình led: (Việt Nam)"',
    'TP. Hồ Chí Minh,100',
    'Hà Nội,82',
    'Bình Dương,67',
  ].join('\n');

  const parsedGeo = parseGoogleTrendsCsvAuto(geoCsv);
  assert.equal(parsedGeo.detectedType, 'geomap');
  assert.deepEqual(parsedGeo.terms, ['màn hình led']);
  assert.equal(parsedGeo.regionRows.length, 3);
  assert.equal(parsedGeo.regionRows[0].regionName, 'TP. Hồ Chí Minh');
  assert.equal(parsedGeo.regionRows[0].interestValue, 100);
});

test('Google Ads partial GAQL timeout không được xóa trắng landingPages/searchTerms/keywords/adGroups đã có trong cache', () => {
  const prevSnap = {
    customerId: '1049711191',
    startDate: '2026-10-28',
    endDate: '2026-11-26',
    fetchedAt: '2026-11-26T01:35:00.000Z',
    campaignDaily: [{ campaignId: '1', campaignName: 'LED_CPC_TT', status: 'ENABLED', date: '2026-11-25', cost: 100000, impressions: 100, clicks: 10, conversions: 1 }],
    adGroups: [{ adGroupId: 'ag1', adGroupName: 'LED Indoor', campaignName: 'LED_CPC_TT', cost: 100000, impressions: 100, clicks: 10, conversions: 1, cpa: 100000 }],
    keywords: [{ keywordText: 'man hinh led', matchType: 'BROAD', adGroupName: 'LED Indoor', campaignName: 'LED_CPC_TT', impressions: 100, clicks: 10, ctrPct: 10, cost: 100000, conversions: 1 }],
    searchTerms: [{ searchTerm: 'báo giá màn hình led', campaignName: 'LED_CPC_TT', adGroupName: 'LED Indoor', status: 'ADDED', impressions: 50, clicks: 5, ctrPct: 10, cost: 50000, conversions: 1 }],
    landingPages: [{ url: 'https://toantrung.com.vn/du-an/', campaignName: 'LED_CPC_TT', clicks: 10, impressions: 100, ctrPct: 10, avgCpc: 10000, cost: 100000, conversions: 1 }],
    devices: [{ device: 'Điện thoại di động', cost: 100000, clicks: 10, impressions: 100 }],
    timeSchedule: [{ dayOfWeek: 'Thứ 3', hour: 9, clicks: 10, impressions: 100, cost: 100000, conversions: 1 }],
  };

  // Giả lập sự cố thực tế 01:55:55Z: chỉ daily + devices trả về, còn 5 truy vấn kia bị timeout (null)
  const merged = mergeGoogleAdsSnapshotPreservingOnPartialFailure({
    customerId: '1049711191',
    startDate: '2026-10-28',
    endDate: '2026-11-26',
    fetchedAt: '2026-11-26T01:55:55.000Z',
    raw: {
      daily: [{ campaign: { id: '1', name: 'LED_CPC_TT', status: 'ENABLED' }, segments: { date: '2026-11-25' }, metrics: { impressions: '120', clicks: '12', costMicros: '120000000000', conversions: 2 } }],
      adGroups: null,
      keywords: null,
      searchTerms: null,
      landingPages: null,
      devices: [{ segments: { device: 'MOBILE' }, metrics: { impressions: '120', clicks: '12', costMicros: '120000000000' } }],
      timeSchedule: null,
    },
    prevSnap,
  });

  assert.ok(merged);
  assert.equal(merged.isPartial, true);
  assert.equal(merged.snapshot.campaignDaily[0].clicks, 12, 'Fresh daily data must be applied');
  assert.equal(merged.snapshot.landingPages.length, 1, 'Previous landingPages must be preserved on null timeout');
  assert.equal(merged.snapshot.searchTerms.length, 1, 'Previous searchTerms must be preserved on null timeout');
  assert.equal(merged.snapshot.keywords.length, 1, 'Previous keywords must be preserved on null timeout');
  assert.equal(merged.snapshot.adGroups.length, 1, 'Previous adGroups must be preserved on null timeout');
  assert.equal(merged.snapshot.timeSchedule.length, 1, 'Previous timeSchedule must be preserved on null timeout');
});

test('M02 Ads Breakdowns phân biệt rõ READY / SYNCING / NO_ACTIVITY và tách riêng thông báo từng tab (không đổ lỗi oan OAuth)', async () => {
  // 1. Kỳ đã có cache thực đầy đủ (2025-11-27..2026-11-26 hoặc 2026-11-25..2026-11-25)
  const warmed = await getM02TrafficInteractionSpec({
    websiteId: 'all',
    preset: 'CUSTOM',
    from: '2026-11-25',
    to: '2026-11-25',
    adsScope: 'all',
    bypassCache: true,
  });
  assert.equal(warmed.ads.status, 'CONNECTED');
  assert.equal(warmed.ads.breakdowns.dataState, 'READY');
  assert.ok(warmed.ads.breakdowns.landingPages.length > 0, 'Warmed period must expose landing pages');
  assert.ok(warmed.ads.breakdowns.searchTerms.length > 0, 'Warmed period must expose search terms');
  assert.equal(warmed.ads.breakdowns.landingPageAvailabilityNote, null);
  assert.equal(warmed.ads.breakdowns.searchTermAvailabilityNote, null);

  // 2. Lọc theo website cụ thể với adsScope=website phải lọc landingPages đúng domain/chiến dịch
  const scoped = await getM02TrafficInteractionSpec({
    websiteId: 'toantrung.com.vn',
    preset: 'CUSTOM',
    from: '2026-11-25',
    to: '2026-11-25',
    adsScope: 'website',
    bypassCache: true,
  });
  assert.ok(scoped.ads.breakdowns.landingPages.length > 0);
  assert.ok(scoped.ads.breakdowns.landingPages.length <= warmed.ads.breakdowns.landingPages.length);

  // 3. Kỳ chưa có trong cache (cold miss trong môi trường test) -> báo SYNCING rõ ràng theo đúng từng tab, không báo sai OAuth / từ khóa
  const cold = await getM02TrafficInteractionSpec({
    websiteId: 'all',
    preset: 'CUSTOM',
    from: '2025-01-01',
    to: '2025-01-02',
    adsScope: 'all',
    bypassCache: true,
  });
  assert.equal(cold.ads.status, 'CONNECTED');
  assert.equal(cold.ads.breakdowns.dataState, 'SYNCING');
  assert.match(cold.ads.breakdowns.landingPageAvailabilityNote || '', /trang đích Google Ads/i);
  assert.doesNotMatch(cold.ads.breakdowns.landingPageAvailabilityNote || '', /từ khóa quảng cáo/i);
  assert.doesNotMatch(cold.ads.breakdowns.landingPageAvailabilityNote || '', /OAuth Google cần Kết nối lại/i);
  assert.match(cold.ads.breakdowns.searchTermAvailabilityNote || '', /cụm từ tìm kiếm/i);
});

test('Task 3: Google Ads ad_group & keyword được lưu bền vững vào DB, cập nhật seo_keywords.cachedAdsClicks và không cộng trùng chi phí M04', async () => {
  const [adGroupCount, keywordCount] = await Promise.all([
    prisma.platformDailyMetric.count({ where: { platform: 'google_ads', grain: 'ad_group' } }),
    prisma.platformDailyMetric.count({ where: { platform: 'google_ads', grain: 'keyword' } }),
  ]);
  assert.ok(adGroupCount > 0, 'Must persist google_ads ad_group rows in platform_daily_metrics');
  assert.ok(keywordCount > 0, 'Must persist google_ads keyword rows in platform_daily_metrics');

  await refreshKeywordDerivedCacheFromCanonicalMetrics({ force: true });
  const adsTaggedKeywords = await prisma.seoKeyword.count({ where: { cachedAdsClicks: { gt: 0 } } });
  assert.ok(adsTaggedKeywords > 0, 'seo_keywords must contain real cachedAdsClicks > 0');

  // Kiểm tra M04 khớp 100% nguồn chuẩn thống nhất với M02 (campaign DB + live intraday) và tuyệt đối không cộng trùng ad_group / keyword
  const [m02, m04, adGroupRows] = await Promise.all([
    getM02TrafficInteractionSpec({
      websiteId: 'all',
      preset: 'CUSTOM',
      from: '2026-10-28',
      to: '2026-11-26',
      adsScope: 'all',
      bypassCache: true,
    }),
    getM04ResultsReportSpec(
      {
        id: 1,
        email: 'admin@toantrung.vn',
        fullName: 'Admin',
        roleCode: 'ADMIN',
        roleName: 'Quản trị viên',
      },
      {
        websiteId: 'all',
        preset: 'CUSTOM',
        from: '2026-10-28',
        to: '2026-11-26',
        granularity: 'month',
        bypassCache: true,
      },
    ),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: 'google_ads',
        grain: 'ad_group',
        metricDate: { gte: '2026-10-28', lte: '2026-11-26' },
      },
      select: { spendMicros: true },
    }),
  ]);
  const adGroupSpendVnd = Math.round(
    adGroupRows.reduce((s, r) => s + Number(r.spendMicros || 0n) / 1_000_000, 0),
  );
  assert.equal(
    Math.round(m04.metrics.adCost || 0),
    Math.round(m02.ads?.metrics.cost || 0),
    'M04 adCost must match M02 canonical merged campaign spend 100% (0 VND diff)',
  );
  assert.ok(
    adGroupSpendVnd > 0 && Math.round(m04.metrics.adCost || 0) < Math.round(m02.ads?.metrics.cost || 0) + adGroupSpendVnd,
    'M04 adCost must never double-count ad_group/keyword rows',
  );
});

test.after(async () => {
  await prisma.$disconnect();
});
