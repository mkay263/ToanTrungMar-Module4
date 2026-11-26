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
  if (request.startsWith('@toantrung/contracts/')) {
    return path.join(
      V2_ROOT,
      'packages/contracts/src',
      request.slice('@toantrung/contracts/'.length),
      'index.ts',
    );
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

const { prisma } = require('@toantrung/database');
const { mergeCanonicalAdsCampaignDailyMetrics } = require('../unified-ads-metrics.ts');
const {
  bumpDomainRevisions,
  getDomainRevisionsSnapshot,
  subscribeDomainRevisionStream,
} = require('../cache/server-data-cache.ts');
const { listLeadsForUser } = require('../../modules/01-leads/service.ts');
const { getM02TrafficInteractionSpec } = require('../../modules/02-tracking-sync/m02-spec.service.ts');
const { getM03AdsSeoDashboardSpec } = require('../../modules/03-keywords-ads/m03-spec.service.ts');
const { getM04ResultsReportSpec } = require('../../modules/04-reports/m04-spec.service.ts');
const { getScopedReportsDashboard } = require('../../modules/04-reports/service.ts');
const {
  inferDomainsFromApiPath,
  inferReadDependenciesForApiPath,
} = require(path.join(V2_ROOT, 'apps/web/src/core/http/data-sync-bus.ts'));

const ADMIN_USER = {
  id: 1,
  email: 'admin@toantrung.vn',
  fullName: 'Quản trị viên',
  roleCode: 'ADMIN',
  roleName: 'Quản trị viên',
};

function monetaryDtoToVnd(dto) {
  if (!dto || dto.rawAmountString === undefined) return null;
  if (dto.scale === 'micros') {
    return Number((Number(BigInt(dto.rawAmountString)) / 1_000_000).toFixed(0));
  }
  return Number(BigInt(dto.rawAmountString));
}

test('mergeCanonicalAdsCampaignDailyMetrics: hợp nhất 1-1 không cộng trùng DB + Live và giữ đủ finalUrls', () => {
  const merged = mergeCanonicalAdsCampaignDailyMetrics({
    dbRows: [
      {
        platform: 'google_ads',
        campaignExternalId: '1001',
        metricDate: '2026-11-25',
        spendMicros: 500_000_000_000n,
        impressions: 100,
        clicks: 10,
        conversionsMicros: 1_000_000n,
        pageUrlRaw: 'https://toantrung.com.vn/p2',
        campaign: { campaignName: 'Camp LED', campaignCode: 'GADS_1001', utmCampaignSlug: null, isActive: true },
      },
    ],
    gadsLiveSnap: {
      customerId: '123',
      startDate: '2026-11-25',
      endDate: '2026-11-26',
      fetchedAt: new Date().toISOString(),
      campaignDaily: [
        {
          campaignId: '1001',
          campaignName: 'Camp LED',
          status: 'ENABLED',
          date: '2026-11-25',
          cost: 550000,
          impressions: 110,
          clicks: 12,
          conversions: 2,
        },
        {
          campaignId: '1001',
          campaignName: 'Camp LED',
          status: 'ENABLED',
          date: '2026-11-26',
          cost: 200000,
          impressions: 40,
          clicks: 5,
          conversions: 0,
        },
      ],
      adGroups: [],
      keywords: [],
      searchTerms: [],
      landingPages: [],
      devices: [],
      timeSchedule: [],
    },
    finalUrlsMap: {
      '1001': ['https://toantrung.com.vn/p2', 'https://bangled.vn/p3'],
    },
    startDateStr: '2026-11-25',
    endDateStr: '2026-11-26',
  });

  assert.equal(merged.length, 2, 'Không được cộng trùng ngày 2026-11-25');
  assert.equal(merged[0].spendMicros, 550_000_000_000n, 'Live intraday ghi đè chính xác bản ghi DB cùng ngày');
  assert.equal(merged[1].spendMicros, 200_000_000_000n, 'Live bổ sung ngày mới chưa kịp lưu DB');
  assert.deepEqual(
    merged[0].finalUrls.sort(),
    ['https://bangled.vn/p3', 'https://toantrung.com.vn/p2'],
    'Phải giữ đủ toàn bộ finalUrls của chiến dịch để phân loại đa website nhất quán',
  );
});

test('Khớp 100% số liệu 0 đồng giữa Tổng quan, M01, M02, M03 và M04 trên 7D, 30D, Năm nay và từng Website', async () => {
  const scopes = [
    { label: '7D ALL', preset: '7D', from: '2026-11-20', to: '2026-11-26', websiteId: 'all' },
    { label: '30D ALL', preset: '30D', from: '2026-10-28', to: '2026-11-26', websiteId: 'all' },
    { label: 'THIS_YEAR ALL', preset: 'CUSTOM', from: '2026-01-01', to: '2026-11-26', websiteId: 'all' },
    { label: '30D toantrung.com.vn', preset: '30D', from: '2026-10-28', to: '2026-11-26', websiteId: 'toantrung.com.vn' },
    { label: '30D bangdientu.com.vn', preset: '30D', from: '2026-10-28', to: '2026-11-26', websiteId: 'bangdientu.com.vn' },
  ];

  for (const sc of scopes) {
    const [ov, m01, m02, m03, m04] = await Promise.all([
      getScopedReportsDashboard(ADMIN_USER, {
        preset: sc.preset,
        from: sc.from,
        to: sc.to,
        websiteId: sc.websiteId,
      }),
      listLeadsForUser(ADMIN_USER, {
        fromDateStr: sc.from,
        toDateStr: sc.to,
        sourceWebsite: sc.websiteId === 'all' ? undefined : sc.websiteId,
        includeSpam: true,
        pageSize: 200,
      }),
      getM02TrafficInteractionSpec({
        preset: sc.preset,
        from: sc.from,
        to: sc.to,
        websiteId: sc.websiteId,
        adsScope: sc.websiteId === 'all' ? 'all' : 'website',
        bypassCache: true,
      }),
      getM03AdsSeoDashboardSpec({
        preset: sc.preset,
        from: sc.from,
        to: sc.to,
        websiteId: sc.websiteId,
        roleCode: 'ADMIN',
        bypassCache: true,
      }),
      getM04ResultsReportSpec(ADMIN_USER, {
        preset: sc.preset,
        from: sc.from,
        to: sc.to,
        websiteId: sc.websiteId,
        granularity: 'month',
        bypassCache: true,
      }),
    ]);

    const ovSpend = monetaryDtoToVnd(ov.marketingSummary?.totalAdsSpend) ?? 0;
    const m02Spend = m02.ads?.metrics.cost ?? 0;
    const m03Spend = m03.ads?.metrics.adCost ?? 0;
    const m04Spend = m04.metrics.adCost ?? 0;
    const m04PeriodSum =
      m04.metrics.adCost !== null
        ? (m04.periodBreakdown?.buckets || []).reduce((s, b) => s + (b.adCost || 0), 0)
        : 0;

    assert.equal(ovSpend, m02Spend, `[${sc.label}] Overview Ads spend phải khớp 100% M02`);
    assert.equal(m02Spend, m03Spend, `[${sc.label}] M02 Ads spend phải khớp 100% M03`);
    assert.equal(m03Spend, m04Spend, `[${sc.label}] M03 Ads spend phải khớp 100% M04`);
    assert.equal(m04Spend, m04PeriodSum, `[${sc.label}] Tổng kỳ Ngày/Tuần/Tháng/Năm M04 phải khớp 100% M04 KPI`);

    assert.equal(
      m02.ads?.metrics.clicks ?? 0,
      m03.ads?.metrics.adClicks ?? 0,
      `[${sc.label}] Ads clicks M02 phải khớp 100% M03`,
    );
    assert.equal(
      m02.ads?.metrics.conversions ?? 0,
      m03.ads?.metrics.adConversions ?? 0,
      `[${sc.label}] Ads conversions M02 phải khớp 100% M03`,
    );
    assert.equal(
      m02.ads?.metrics.costPerValidLead ?? null,
      m04.metrics.costPerValidAdLead ?? null,
      `[${sc.label}] CPL M02 phải khớp 100% M04`,
    );
    assert.equal(
      m03.ads?.metrics.costPerValidAdLead ?? null,
      m04.metrics.costPerValidAdLead ?? null,
      `[${sc.label}] CPL M03 phải khớp 100% M04`,
    );

    assert.equal(m01.leads.length, ov.overview.totalLeadsL1, `[${sc.label}] M01 Leads phải khớp Overview`);
    assert.equal(ov.overview.totalLeadsL1, m04.metrics.receivedLeadCount, `[${sc.label}] Overview Leads phải khớp M04`);
    assert.equal(ov.overview.validLeadsL2, m04.metrics.validLeadCount, `[${sc.label}] Overview Valid Leads phải khớp M04`);
    assert.equal(
      m01.products.length,
      m04.tables.byProductCatalog.filter((x) => !x.isUnclassifiedProduct).length,
      `[${sc.label}] Danh mục sản phẩm M01 phải khớp 100% M04`,
    );

    const ovGsc =
      sc.websiteId === 'all'
        ? (ov.websiteSummaries || []).reduce((s, w) => s + (w.gscClicks || 0), 0)
        : (ov.websiteSummaries || []).find((w) => w.domain === sc.websiteId)?.gscClicks ?? null;
    assert.equal(
      ovGsc,
      m03.seo.metrics.organicSearchClicks,
      `[${sc.label}] GSC Clicks Overview phải khớp 100% M03`,
    );
  }
});

test('Ma trận đồng bộ 2 chiều / 3 chiều (Server Revisions + SSE + Client data-sync-bus) phủ đủ M01↔M02↔M03↔M04↔Overview', () => {
  const before = getDomainRevisionsSnapshot().revisions;
  const receivedEvents = [];
  const unsub = subscribeDomainRevisionStream((ev) => receivedEvents.push(ev));
  try {
    bumpDomainRevisions(['leads', 'reports', 'tracking', 'design'], 'product_catalog_created');
  } finally {
    unsub();
  }
  const after = getDomainRevisionsSnapshot().revisions;
  assert.ok(after.leads > before.leads);
  assert.ok(after.reports > before.reports);
  assert.ok(after.tracking > before.tracking);
  assert.ok(after.design > before.design);
  assert.equal(receivedEvents.length, 1, 'SSE stream phải phát sự kiện realtime cho mọi tab đang mở');
  assert.deepEqual(
    [...receivedEvents[0].domains].sort(),
    ['design', 'leads', 'reports', 'tracking'],
  );

  const intersects = (writePath, readPath) => {
    const w = new Set(inferDomainsFromApiPath(writePath));
    return inferReadDependenciesForApiPath(readPath).some((d) => w.has(d));
  };

  // M01 (Leads / Products) -> cập nhật ngay M01, M02, M03, M04, Design
  assert.equal(intersects('/api/v1/leads', '/api/v1/tracking'), true);
  assert.equal(intersects('/api/v1/leads', '/api/v1/ads'), true);
  assert.equal(intersects('/api/v1/leads', '/api/v1/reports'), true);
  assert.equal(intersects('/api/v1/leads/products', '/api/v1/reports'), true);
  assert.equal(intersects('/api/v1/leads/products', '/api/v1/tracking'), true);

  // M02 (Tracking / Sync) -> cập nhật ngay M01, M02, M03, M04
  assert.equal(intersects('/api/v1/tracking', '/api/v1/leads'), true);
  assert.equal(intersects('/api/v1/tracking', '/api/v1/ads'), true);
  assert.equal(intersects('/api/v1/tracking', '/api/v1/reports'), true);

  // M03 (Ads / SEO / SEO Reports) -> cập nhật ngay M02, M03, M04
  assert.equal(intersects('/api/v1/ads', '/api/v1/tracking'), true);
  assert.equal(intersects('/api/v1/ads', '/api/v1/reports'), true);
  assert.equal(intersects('/api/v1/ads/seo-reports', '/api/v1/reports'), true);

  // M04 (Reports) -> cập nhật M04 & Notifications
  assert.equal(intersects('/api/v1/reports', '/api/v1/reports'), true);
  assert.equal(intersects('/api/v1/reports', '/api/v1/notifications'), true);

  // Users / Profile -> cập nhật M01 (Sales dropdown), M04 (bySales), Design
  assert.equal(intersects('/api/v1/users', '/api/v1/leads'), true);
  assert.equal(intersects('/api/v1/users', '/api/v1/reports'), true);
  assert.equal(intersects('/api/v1/profile', '/api/v1/leads'), true);
  assert.equal(intersects('/api/v1/profile', '/api/v1/reports'), true);
});

test.after(async () => {
  await prisma.$disconnect();
});
