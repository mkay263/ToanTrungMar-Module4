'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Sparkles } from 'lucide-react';
import type { M03AdsSeoDashboardDto } from '@toantrung/contracts';
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { StockAreaChart } from '@/components/common/StockAreaChart';
import { SeoAiReportPanel } from './SeoAiReportPanel';

type M03MainTab = 'ads' | 'seo' | 'site_status' | 'trends';
type AdsTableTab = 'campaigns' | 'ad_groups' | 'keywords';
type SeoTableTab = 'queries' | 'pages';
type SeoChartMetric = 'clicks' | 'impressions';

export function SeoKeywordsWorkspace() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();
  const [mainTab, setMainTab] = useState<M03MainTab>('seo');
  const [adsTableTab, setAdsTableTab] = useState<AdsTableTab>('campaigns');
  const [seoTableTab, setSeoTableTab] = useState<SeoTableTab>('queries');
  const [seoChartMetric, setSeoChartMetric] = useState<SeoChartMetric>('clicks');
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<M03AdsSeoDashboardDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const loadData = useCallback(
    async (silent = false) => {
      if (!hydrated) return;
      const myId = ++reqIdRef.current;
      if (!silent && !data) setLoading(true);
      setErrorMsg(null);
      try {
        const qs = new URLSearchParams({
          view: 'spec',
          websiteId: scope.websiteId,
          preset: scope.preset,
          page: String(page),
          pageSize: '20',
        });
        if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
          qs.set('from', scope.from);
          qs.set('to', scope.to);
        }
        const res = await apiRequest<M03AdsSeoDashboardDto>(`/api/v1/ads?${qs.toString()}`, {
          skipCache: true,
        });
        if (myId === reqIdRef.current) {
          setData(res);
        }
      } catch (err) {
        if (myId === reqIdRef.current) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.',
          );
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    },
    [hydrated, scope.websiteId, scope.preset, scope.from, scope.to, page],
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [scope.websiteId, scope.preset, scope.from, scope.to, seoTableTab, adsTableTab]);

  // Prefetch nhẹ sau khi trang chính đã tải xong để không nghẽn băng thông chuyển trang
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      const presets: Array<'TODAY' | 'YESTERDAY' | '7D' | '30D'> = ['TODAY', 'YESTERDAY', '7D', '30D'];
      const queue: string[] = [];
      for (const p of presets) {
        if (p !== scope.preset) {
          queue.push(`/api/v1/ads?view=spec&websiteId=${encodeURIComponent(scope.websiteId)}&preset=${p}&page=1&pageSize=20`);
        }
      }
      const siteIds = ['all', ...(data.coverage.availableWebsites || []).map((w) => w.websiteId)];
      for (const wid of siteIds) {
        if (wid !== scope.websiteId) {
          queue.push(`/api/v1/ads?view=spec&websiteId=${encodeURIComponent(wid)}&preset=${scope.preset}&page=1&pageSize=20`);
        }
      }
      void (async () => {
        for (const u of queue) {
          if (!peekApiCache(u)) {
            await apiRequest(u).catch(() => {});
          }
        }
      })();
    }, 350);
    return () => clearTimeout(timer);
  }, [data, scope.websiteId, scope.preset]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadData(true);
      }
    }, 25_000);
    return () => clearInterval(timer);
  }, [loadData]);

  const ads = data?.ads;
  const seo = data?.seo;
  const seoDaily = seo?.charts.seoDailySeries || [];
  const maxSeoVal = Math.max(1, ...seoDaily.map((p) => Number(p[seoChartMetric] ?? 0)));

  const activeSeoTable = seoTableTab === 'queries' ? seo?.tables.queries : seo?.tables.pages;
  const totalSeoPages = activeSeoTable
    ? Math.max(1, Math.ceil(activeSeoTable.totalRows / activeSeoTable.pageSize))
    : 1;

  return (
    <div className="space-y-4 text-sm max-w-full overflow-x-hidden">
      <WebsiteDashboardHeader
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || []}
        selectedWebsiteLabel={data?.scope.websiteLabel || 'Tất cả website'}
        freshnessMessage={errorMsg ? 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.' : data?.freshness.statusMessage}
        onChangeScope={updateScope}
      />

      {/* Business Tabs (No API Provider Names) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          role="tablist"
          aria-label="Phân mục Quảng cáo và SEO"
          className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 overflow-x-auto max-w-full"
        >
          {[
            { id: 'ads' as const, label: 'Quảng cáo' },
            { id: 'seo' as const, label: 'Từ khóa & SEO' },
            { id: 'site_status' as const, label: 'Tình trạng trang' },
            { id: 'trends' as const, label: 'Xu hướng' },
          ].map((tab) => {
            const selected = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setMainTab(tab.id)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                  selected
                    ? 'bg-white text-[#0B1D48] shadow-2xs border-b-2 border-[#0B1D48]'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (mainTab !== 'seo') setMainTab('seo');
              setShowAiPanel((v) => (mainTab !== 'seo' ? true : !v));
            }}
            className="h-9 px-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{showAiPanel && mainTab === 'seo' ? 'Ẩn viết báo cáo AI' : 'Viết báo cáo SEO bằng AI'}</span>
          </button>
          <a
            href={`/api/v1/ads/export?websiteId=${encodeURIComponent(scope.websiteId)}&preset=${encodeURIComponent(scope.preset)}`}
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel</span>
          </a>
        </div>
      </div>

      {/* TAB 1: QUẢNG CÁO */}
      {mainTab === 'ads' && (
        <div role="tabpanel" className="space-y-4">
          {ads?.status === 'UNCONFIGURED' && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-700">
              {ads.statusMessage}
            </div>
          )}

          {/* 6 KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Chi phí quảng cáo</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.adCost} format={(v) => `${v.toLocaleString('vi-VN')} ${ads?.currencyCode || 'VND'}`} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Tiền tệ: {ads?.currencyCode || 'VND'}</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Lượt hiển thị</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.adImpressions} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                CPM: <strong>{ads?.metrics.averageCpm ?? 'Chưa đủ dữ liệu'}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Lượt nhấp</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.adClicks} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                CPC: <strong>{ads?.metrics.averageCpc ?? 'Chưa đủ dữ liệu'}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">CTR quảng cáo</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.adCtrPct} format={(v) => `${v.toFixed(2)}%`} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Lượt nhấp / lượt hiển thị</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Chuyển đổi quảng cáo</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.adConversions} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Lead hợp lệ: <strong>{ads?.metrics.validAdLeadCount ?? 0}</strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Chi phí / chuyển đổi</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={ads?.metrics.costPerConversion} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Chi phí / Lead hợp lệ: <strong>{ads?.metrics.costPerValidAdLead ?? 'Chưa đủ dữ liệu'}</strong>
              </div>
            </div>
          </div>

          {/* 8/4 Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-3">Chi phí theo ngày</h3>
              <div className="h-[280px] flex items-center justify-center text-xs text-slate-400">
                {(ads?.charts.adDailySeries.length || 0) === 0
                  ? 'Chưa đủ dữ liệu chi phí quảng cáo trong kỳ đang chọn.'
                  : `${ads!.charts.adDailySeries.length} ngày`}
              </div>
            </div>
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-3">Chi phí theo chiến dịch</h3>
              <div className="h-[280px] flex items-center justify-center text-xs text-slate-400">
                {(ads?.charts.topCampaigns.length || 0) === 0
                  ? 'Chưa đủ dữ liệu chiến dịch.'
                  : `${ads!.charts.topCampaigns.length} chiến dịch`}
              </div>
            </div>
          </div>

          {/* 3 Table Tabs */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-2">
              {[
                { id: 'campaigns' as const, label: 'Chiến dịch' },
                { id: 'ad_groups' as const, label: 'Nhóm quảng cáo' },
                { id: 'keywords' as const, label: 'Từ khóa' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAdsTableTab(t.id)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    adsTableTab === t.id ? 'bg-[#0B1D48] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="p-6 text-center text-xs text-slate-400">
              {ads?.tables.keywordAvailabilityNote || 'Chưa đủ dữ liệu quảng cáo.'}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TỪ KHÓA & SEO */}
      {mainTab === 'seo' && (
        <div role="tabpanel" className="space-y-4">
          {showAiPanel && (
            <SeoAiReportPanel
              csrfToken={user?.csrfToken}
              initialWebsite={data?.scope.domain || 'all'}
              initialPeriodDays={scope.preset === '7D' ? 7 : 30}
            />
          )}

          {/* 6 Main KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Lượt nhấp tìm kiếm</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={seo?.metrics.organicSearchClicks} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Kỳ trước ({seo?.comparison.previousStartDate} → {seo?.comparison.previousEndDate}):{' '}
                <strong>
                  {seo?.comparison.previousClicks !== null && seo?.comparison.previousClicks !== undefined
                    ? seo.comparison.previousClicks.toLocaleString('vi-VN')
                    : 'Chưa đủ dữ liệu'}
                </strong>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Lượt hiển thị tìm kiếm</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={seo?.metrics.organicSearchImpressions} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Tổng hiển thị tìm kiếm tự nhiên</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">CTR tự nhiên</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={seo?.metrics.organicSearchCtrPct} format={(v) => `${v.toFixed(2)}%`} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Tổng nhấp / tổng hiển thị</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Vị trí trung bình</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={seo?.metrics.averageSearchPosition} format={(v) => v.toFixed(1)} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Tổng hợp có trọng số hiển thị</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Phiên tìm kiếm tự nhiên</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
                <AnimatedMetricNumber value={seo?.metrics.organicSessions} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Phiên từ tìm kiếm tự nhiên</div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="text-xs font-bold text-slate-500">Lead từ tìm kiếm tự nhiên</div>
              <div className="mt-1.5 font-display text-2xl font-extrabold text-[#0B1D48]">
                <AnimatedMetricNumber value={seo?.metrics.organicValidLeadCount} />
              </div>
              <div className="mt-1 text-xs text-slate-500">Lead hợp lệ có liên kết tracking</div>
            </div>
          </div>

          {/* 8/4 Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 8 cols */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900">Lượt nhấp tìm kiếm theo ngày</h3>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={() => setSeoChartMetric('clicks')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      seoChartMetric === 'clicks' ? 'bg-white text-[#0B1D48] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Lượt nhấp
                  </button>
                  <button
                    type="button"
                    onClick={() => setSeoChartMetric('impressions')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      seoChartMetric === 'impressions' ? 'bg-white text-[#0B1D48] shadow-2xs' : 'text-slate-600'
                    }`}
                  >
                    Lượt hiển thị
                  </button>
                </div>
              </div>

              <StockAreaChart
                points={seoDaily.map((pt) => ({
                  date: pt.date,
                  value: pt[seoChartMetric],
                  isMissingData: pt.completenessState === 'NO_DATA',
                  isPreliminary:
                    pt.completenessState === 'PRELIMINARY' ||
                    pt.completenessState === 'UNKNOWN',
                }))}
                metricLabel={seoChartMetric === 'clicks' ? 'lượt nhấp' : 'lượt hiển thị'}
                accentColor="emerald"
                loading={loading}
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Cột vàng: số liệu còn sơ bộ / chưa xác định chốt</span>
                <span>Cột xám: chưa có dữ liệu</span>
              </div>
            </div>

            {/* Right 4 cols: Cơ hội tăng lượt nhấp */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
              <h3 className="font-bold text-slate-900">Cơ hội tăng lượt nhấp</h3>
              <p className="text-[11px] text-slate-500 mb-3">{seo?.charts.opportunityThresholdNote}</p>
              <div className="h-[260px] overflow-y-auto space-y-2 pr-1">
                {(seo?.charts.opportunityQueries.length || 0) === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Chưa đủ dữ liệu truy vấn
                  </div>
                ) : (
                  seo!.charts.opportunityQueries.map((q) => (
                    <div key={q.query} className="p-2 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                      <div className="font-semibold text-slate-800 truncate" title={q.query}>{q.query}</div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{q.impressions.toLocaleString('vi-VN')} hiển thị</span>
                        <span>CTR {q.ctrPct ?? 0}% · VT {q.averagePosition ?? '—'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Detail Table: Truy vấn / Trang (20 rows/page) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setSeoTableTab('queries')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    seoTableTab === 'queries' ? 'bg-[#0B1D48] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Truy vấn ({seo?.tables.queries.totalRows || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setSeoTableTab('pages')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    seoTableTab === 'pages' ? 'bg-[#0B1D48] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Trang ({seo?.tables.pages.totalRows || 0})
                </button>
              </div>
              <span className="text-xs text-slate-500">
                So sánh kỳ trước: {seo?.comparison.previousStartDate} → {seo?.comparison.previousEndDate}
              </span>
            </div>

            <div tabIndex={0} role="region" aria-label="Bảng từ khóa và trang SEO" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">
                      {seoTableTab === 'queries' ? 'Từ khóa tìm kiếm' : 'URL'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Nhấp</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Hiển thị</th>
                    <th className="py-2.5 px-3 font-semibold text-right">CTR</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Vị trí TB</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Thay đổi nhấp</th>
                    {seoTableTab === 'queries' && (
                      <th className="py-2.5 px-3 font-semibold text-right">Thay đổi vị trí</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(activeSeoTable?.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={seoTableTab === 'queries' ? 7 : 6} className="py-8 text-center text-slate-400">
                        Chưa đủ dữ liệu trong kỳ đang chọn.
                      </td>
                    </tr>
                  ) : (
                    activeSeoTable!.rows.map((r) => (
                      <tr key={r.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-medium text-slate-800 max-w-[340px] truncate" title={r.key}>
                          {r.key}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold">{r.clicks.toLocaleString('vi-VN')}</td>
                        <td className="py-2.5 px-3 text-right">{r.impressions.toLocaleString('vi-VN')}</td>
                        <td className="py-2.5 px-3 text-right">{r.ctrPct !== null ? `${r.ctrPct}%` : '—'}</td>
                        <td className="py-2.5 px-3 text-right">{r.averagePosition ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right">
                          {r.clickChange === null
                            ? 'Chưa có kỳ trước'
                            : `${r.clickChange > 0 ? '+' : ''}${r.clickChange}${r.clickChangePct !== null ? ` (${r.clickChangePct > 0 ? '+' : ''}${r.clickChangePct}%)` : ''}`}
                        </td>
                        {seoTableTab === 'queries' && (
                          <td className="py-2.5 px-3 text-right">
                            {r.positionImprovement === null
                              ? '—'
                              : `${r.positionImprovement > 0 ? '+' : ''}${r.positionImprovement}`}
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {totalSeoPages > 1 && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span>Trang {page} / {totalSeoPages}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalSeoPages}
                    onClick={() => setPage((p) => Math.min(totalSeoPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: TÌNH TRẠNG TRANG */}
      {mainTab === 'site_status' && (
        <div role="tabpanel" className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h3 className="font-bold text-slate-900">Tình trạng lập chỉ mục URL</h3>
            <p className="text-xs text-slate-500 mt-0.5">{data?.siteStatus.statusMessage}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">URL</th>
                  <th className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th className="py-2.5 px-3 font-semibold">Vấn đề cần xem</th>
                  <th className="py-2.5 px-3 font-semibold">Lần thu thập gần nhất</th>
                  <th className="py-2.5 px-3 font-semibold">Lần kiểm tra</th>
                </tr>
              </thead>
              <tbody>
                {(data?.siteStatus.rows.length || 0) === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Chưa đủ dữ liệu kiểm tra trang.
                    </td>
                  </tr>
                ) : (
                  data!.siteStatus.rows.map((r) => (
                    <tr key={r.url} className="border-t border-slate-100">
                      <td className="py-2.5 px-3 font-mono">{r.url}</td>
                      <td className="py-2.5 px-3">{r.verdict}</td>
                      <td className="py-2.5 px-3">{r.issuesToReview || '—'}</td>
                      <td className="py-2.5 px-3">{r.lastCrawlTime || '—'}</td>
                      <td className="py-2.5 px-3">{r.lastCheckedAt || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: XU HƯỚNG */}
      {mainTab === 'trends' && (
        <div role="tabpanel" className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs text-center space-y-2">
          <h3 className="font-bold text-slate-900">Xu hướng tìm kiếm</h3>
          <p className="text-xs text-slate-500">{data?.trends.statusMessage}</p>
        </div>
      )}
    </div>
  );
}
