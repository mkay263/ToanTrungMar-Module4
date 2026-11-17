'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  hasBaPermission,
  type M04ResultsReportDto,
  type ReportsDashboardDto,
} from '@toantrung/contracts';
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers,
  RefreshCw,
} from 'lucide-react';
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { ReportDocComposer } from './ReportDocComposer';

type BreakdownTabKey = 'sales' | 'website' | 'channel' | 'product';

const BREAKDOWN_TABS: Array<{ key: BreakdownTabKey; label: string }> = [
  { key: 'sales', label: 'Sales' },
  { key: 'website', label: 'Website' },
  { key: 'channel', label: 'Kênh marketing' },
  { key: 'product', label: 'Sản phẩm' },
];

export function ReportsWorkspace() {
  const { user } = useSession();
  const { scope, updateScope } = useDashboardScope();

  const [pendingPage, setPendingPage] = useState(1);
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<BreakdownTabKey>('sales');
  const [reportViewMode, setReportViewMode] = useState<'dashboard' | 'doc_composer'>('dashboard');

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      view: 'spec',
      websiteId: scope.websiteId,
      preset: scope.preset,
      pendingPage: String(pendingPage),
      pageSize: '20',
    });
    if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
      params.set('from', scope.from);
      params.set('to', scope.to);
    }
    return `/api/v1/reports?${params.toString()}`;
  }, [scope, pendingPage]);

  const [data, setData] = useState<M04ResultsReportDto | null>(() =>
    peekApiCache<M04ResultsReportDto>(queryUrl)
  );
  const [legacyData, setLegacyData] = useState<ReportsDashboardDto | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !peekApiCache<M04ResultsReportDto>(queryUrl));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExport = Boolean(user && hasBaPermission(user.roleCode, 'EXPORT_DATA'));

  const loadReports = useCallback(
    async (silent = false) => {
      if (!silent) {
        const cached = peekApiCache<M04ResultsReportDto>(queryUrl);
        if (cached) {
          setData(cached);
          setLoading(false);
        } else {
          setLoading(true);
        }
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const res = await apiRequest<M04ResultsReportDto>(queryUrl, { skipCache: silent });
        setData(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Không thể tải báo cáo kết quả.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [queryUrl]
  );

  useEffect(() => {
    void loadReports(false);
  }, [loadReports]);

  // Silent background polling every 25s
  useEffect(() => {
    const timer = setInterval(() => {
      void loadReports(true);
    }, 25000);
    return () => clearInterval(timer);
  }, [loadReports]);

  // Reset pending page when scope changes
  useEffect(() => {
    setPendingPage(1);
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  // Prefetch nhẹ sau khi trang chính đã tải xong để không nghẽn băng thông chuyển trang
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      const presets: Array<'TODAY' | 'YESTERDAY' | '7D' | '30D'> = ['TODAY', 'YESTERDAY', '7D', '30D'];
      const queue: string[] = [];
      for (const p of presets) {
        if (p !== scope.preset) {
          queue.push(`/api/v1/reports?view=spec&websiteId=${encodeURIComponent(scope.websiteId)}&preset=${p}&pendingPage=1&pageSize=20`);
        }
      }
      const siteIds = ['all', ...(data.coverage.availableWebsites || []).map((w) => w.websiteId)];
      for (const wid of siteIds) {
        if (wid !== scope.websiteId) {
          queue.push(`/api/v1/reports?view=spec&websiteId=${encodeURIComponent(wid)}&preset=${scope.preset}&pendingPage=1&pageSize=20`);
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

  // Load legacy shape only when user opens Word composer
  useEffect(() => {
    if (reportViewMode !== 'doc_composer' || legacyData) return;
    const params = new URLSearchParams({
      preset: 'custom',
      fromDate: data?.scope.startDate || scope.from || '',
      toDate: data?.scope.endDate || scope.to || '',
    });
    apiRequest<ReportsDashboardDto>(`/api/v1/reports?${params.toString()}`)
      .then((res) => setLegacyData(res))
      .catch(() => {});
  }, [reportViewMode, legacyData, data?.scope.startDate, data?.scope.endDate, scope.from, scope.to]);

  const handleExportExcel = () => {
    const params = new URLSearchParams({
      preset: 'custom',
      format: 'xlsx',
      fromDate: data?.scope.startDate || scope.from || '',
      toDate: data?.scope.endDate || scope.to || '',
    });
    window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
  };

  const maxFunnelCount = useMemo(() => {
    const rows = data?.charts.leadFunnel || [];
    return Math.max(1, ...rows.map((r) => r.distinctLeadCount));
  }, [data?.charts.leadFunnel]);

  const maxProductCount = useMemo(() => {
    const rows = data?.charts.productLeadRows || [];
    return Math.max(1, ...rows.map((r) => r.distinctLeadCount));
  }, [data?.charts.productLeadRows]);

  const formatVnd = useCallback((val: number) => {
    return `${Math.round(val).toLocaleString('vi-VN')} đ`;
  }, []);

  const totalPendingPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      Math.ceil(data.tables.pendingActionLeads.totalRows / data.tables.pendingActionLeads.pageSize)
    );
  }, [data]);

  return (
    <div className="space-y-5 pb-10">
      <WebsiteDashboardHeader
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || []}
        selectedWebsiteLabel={data?.scope.websiteLabel || 'Tất cả website'}
        freshnessMessage={data?.freshness.statusMessage}
        onChangeScope={updateScope}
      />

      {/* Page Title & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Báo cáo kết quả</h2>
          <p className="text-xs text-slate-500">
            {data?.scope.cohortDefinition ||
              'Lead được tạo trong kỳ đã chọn, với kết quả xử lý hiện tại.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadReports(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {canExport && (
            <>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100"
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                <span>Xuất Excel</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setReportViewMode((prev) => (prev === 'dashboard' ? 'doc_composer' : 'dashboard'))
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  reportViewMode === 'doc_composer'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileText className="h-3.5 w-3.5" />
                <span>{reportViewMode === 'doc_composer' ? 'Về bảng số liệu' : 'Soạn báo cáo Word'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {data?.coverage.note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>{data.coverage.note}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {reportViewMode === 'doc_composer' ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {legacyData ? (
            <ReportDocComposer user={user} data={legacyData} />
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Đang tải dữ liệu soạn báo cáo...
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 6 KPI Cards: 3 cols x 2 rows on desktop */}
          <section aria-label="Chỉ số kết quả chính" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Row 1, Col 1: Lead tiếp nhận */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Lead tiếp nhận</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {loading && !data ? (
                  <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.totalLeadCount ?? null} />
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                {data?.scope.cohortDefinition || 'Lead được tạo trong kỳ đã chọn'}
              </div>
            </div>

            {/* Row 1, Col 2: Lead hợp lệ */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Lead hợp lệ</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {loading && !data ? (
                  <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.validLeadCount ?? null} />
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-600">
                L2: <span className="font-semibold">{data?.metrics.l2Count ?? 0}</span> · L3:{' '}
                <span className="font-semibold">{data?.metrics.l3Count ?? 0}</span>
              </div>
            </div>

            {/* Row 1, Col 3: Báo giá chờ phản hồi */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Báo giá chờ phản hồi</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {loading && !data ? (
                  <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.waitingQuoteCount ?? null} />
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                Đang theo dõi sau khi gửi báo giá
              </div>
            </div>

            {/* Row 2, Col 1: Lead đã chốt */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500">Lead đã chốt</div>
              <div className="mt-2 flex items-baseline gap-2.5">
                <span className="text-2xl font-bold tracking-tight text-emerald-700">
                  {loading && !data ? (
                    <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <AnimatedMetricNumber value={data?.metrics.wonLeadCount ?? null} />
                  )}
                </span>
                {data && data.metrics.winRatePct !== null && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                    {data.metrics.winRatePct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500" title={data?.metrics.winRateDefinition}>
                {data?.metrics.winRatePct !== null && data
                  ? `${data.metrics.winRateNumerator}/${data.metrics.winRateDenominator} · ${data.metrics.winRateDefinition}`
                  : data?.metrics.winRateDefinition || 'Số Lead chốt / tổng Lead hợp lệ trong kỳ'}
              </div>
            </div>

            {/* Row 2, Col 2: CPL · Lead quảng cáo hợp lệ */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-medium text-slate-500">CPL · Lead quảng cáo hợp lệ</div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {loading && !data ? (
                  <span className="inline-block h-7 w-28 animate-pulse rounded bg-slate-200" />
                ) : data?.metrics.costPerValidAdLead !== null && data?.metrics.costPerValidAdLead !== undefined ? (
                  <AnimatedMetricNumber
                    value={data.metrics.costPerValidAdLead}
                    format={formatVnd}
                  />
                ) : (
                  <span className="text-base font-semibold text-slate-500">Chưa đủ dữ liệu</span>
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                Chi phí quảng cáo / Lead quảng cáo hợp lệ
              </div>
            </div>

            {/* Row 2, Col 3: Báo giá quá hạn trên 7 ngày */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">Báo giá quá hạn trên 7 ngày</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 text-2xl font-bold tracking-tight text-amber-700">
                {loading && !data ? (
                  <span className="inline-block h-7 w-20 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.overdueQuoteCount ?? null} />
                )}
              </div>
              <div className="mt-1.5 text-xs text-slate-500">
                Cần sales kiểm tra và phản hồi lại
              </div>
            </div>
          </section>

          {/* 8/4 Charts Row (280–320px height) */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left 8 cols: Tiến trình xử lý Lead */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-8">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-600" />
                  <h2 className="text-sm font-semibold text-slate-900">Tiến trình xử lý Lead</h2>
                </div>
                <span className="text-xs text-slate-500">Đếm Lead duy nhất theo trạng thái hiện tại</span>
              </div>

              <div className="flex h-[280px] flex-col justify-center gap-3.5 overflow-y-auto pr-1">
                {(data?.charts.leadFunnel || []).length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Chưa có dữ liệu phễu Lead trong kỳ lọc.
                  </div>
                ) : (
                  data!.charts.leadFunnel.map((stage) => {
                    const widthPct = Math.max(4, Math.round((stage.distinctLeadCount / maxFunnelCount) * 100));
                    const funnelColor =
                      stage.stageKey === 'won'
                        ? 'from-emerald-600 to-teal-400'
                        : stage.stageKey === 'quoted'
                          ? 'from-amber-500 to-orange-400'
                          : stage.stageKey === 'valid'
                            ? 'from-indigo-600 to-violet-500'
                            : 'from-blue-600 to-sky-400';
                    return (
                      <div key={stage.stageKey} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{stage.label}</span>
                          <span className="font-semibold text-slate-900">
                            {stage.distinctLeadCount.toLocaleString('vi-VN')} Lead
                          </span>
                        </div>
                        <div className="h-6 w-full overflow-hidden rounded-lg bg-slate-100">
                          <div
                            className={`h-full rounded-lg bg-gradient-to-r ${funnelColor} transition-all duration-300`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right 4 cols: Nhu cầu theo nhóm sản phẩm */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-4">
              <div className="mb-4 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-indigo-600" />
                  <h2 className="text-sm font-semibold text-slate-900">Nhu cầu theo nhóm sản phẩm</h2>
                </div>
              </div>

              <div className="flex h-[280px] flex-col gap-3 overflow-y-auto pr-1">
                {(data?.charts.productLeadRows || []).length === 0 ? (
                  <div className="flex h-full items-center justify-center text-sm text-slate-400">
                    Chưa có Lead gắn sản phẩm.
                  </div>
                ) : (
                  data!.charts.productLeadRows.slice(0, 8).map((item) => {
                    const widthPct = Math.max(6, Math.round((item.distinctLeadCount / maxProductCount) * 100));
                    return (
                      <div key={item.productId || item.productName} className="space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-slate-700" title={item.productName}>
                            {item.productName}
                          </span>
                          <span className="shrink-0 font-semibold text-slate-900">
                            {item.distinctLeadCount.toLocaleString('vi-VN')}
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>

          {/* Breakdown Tabs: Sales / Website / Kênh marketing / Sản phẩm */}
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 pt-4">
              <div
                role="tablist"
                aria-label="Phân tích chi tiết kết quả"
                className="flex flex-nowrap gap-1 overflow-x-auto"
              >
                {BREAKDOWN_TABS.map((tab) => {
                  const selected = activeBreakdownTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveBreakdownTab(tab.key)}
                      className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-medium transition ${
                        selected
                          ? 'border-blue-600 text-blue-700'
                          : 'border-transparent text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div role="tabpanel" className="p-4">
              <div className="overflow-x-auto">
                {activeBreakdownTab === 'sales' && (
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2.5">Nhân viên Sales</th>
                        <th className="px-3 py-2.5 text-right">Lead tiếp nhận</th>
                        <th className="px-3 py-2.5 text-right">Lead hợp lệ</th>
                        <th className="px-3 py-2.5 text-right">Đã báo giá</th>
                        <th className="px-3 py-2.5 text-right">Chờ phản hồi</th>
                        <th className="px-3 py-2.5 text-right">Đã chốt</th>
                        <th className="px-3 py-2.5 text-right">Quá hạn &gt;7 ngày</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.tables.bySales || []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                            Chưa có dữ liệu theo nhân viên Sales.
                          </td>
                        </tr>
                      ) : (
                        data!.tables.bySales.map((row) => (
                          <tr key={row.salesId} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2.5 font-medium text-slate-900">{row.salesName}</td>
                            <td className="px-3 py-2.5 text-right">{row.leadCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right">{row.validCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right">{row.quotedCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right">{row.waitingCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                              {row.wonCount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-3 py-2.5 text-right text-amber-700">
                              {row.overdueCount.toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}

                {activeBreakdownTab === 'website' && (
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2.5">Website</th>
                        <th className="px-3 py-2.5 text-right">Lead tiếp nhận</th>
                        <th className="px-3 py-2.5 text-right">Lead hợp lệ</th>
                        <th className="px-3 py-2.5 text-right">Đã báo giá</th>
                        <th className="px-3 py-2.5 text-right">Đã chốt</th>
                        <th className="px-3 py-2.5 text-right">Tỷ lệ chốt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.tables.byWebsite || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                            Chưa có dữ liệu theo website.
                          </td>
                        </tr>
                      ) : (
                        data!.tables.byWebsite.map((row) => {
                          const winPct =
                            row.validCount > 0 ? ((row.wonCount / row.validCount) * 100).toFixed(1) : null;
                          return (
                            <tr key={row.website} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2.5 font-medium text-slate-900">{row.website}</td>
                              <td className="px-3 py-2.5 text-right">{row.leadCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right">{row.validCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right">{row.quotedCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                {row.wonCount.toLocaleString('vi-VN')}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {winPct !== null ? `${winPct}%` : 'Chưa đủ dữ liệu'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {activeBreakdownTab === 'channel' && (
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2.5">Kênh marketing</th>
                        <th className="px-3 py-2.5 text-right">Lead tiếp nhận</th>
                        <th className="px-3 py-2.5 text-right">Lead hợp lệ</th>
                        <th className="px-3 py-2.5 text-right">Đã báo giá</th>
                        <th className="px-3 py-2.5 text-right">Đã chốt</th>
                        <th className="px-3 py-2.5 text-right">Tỷ lệ chốt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.tables.byChannel || []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                            Chưa có dữ liệu theo kênh marketing.
                          </td>
                        </tr>
                      ) : (
                        data!.tables.byChannel.map((row) => {
                          const winPct =
                            row.validCount > 0 ? ((row.wonCount / row.validCount) * 100).toFixed(1) : null;
                          return (
                            <tr key={row.channel} className="hover:bg-slate-50/80">
                              <td className="px-3 py-2.5 font-medium text-slate-900">{row.channel}</td>
                              <td className="px-3 py-2.5 text-right">{row.leadCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right">{row.validCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right">{row.quotedCount.toLocaleString('vi-VN')}</td>
                              <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                {row.wonCount.toLocaleString('vi-VN')}
                              </td>
                              <td className="px-3 py-2.5 text-right">
                                {winPct !== null ? `${winPct}%` : 'Chưa đủ dữ liệu'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}

                {activeBreakdownTab === 'product' && (
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        <th className="px-3 py-2.5">Sản phẩm</th>
                        <th className="px-3 py-2.5 text-right">Lead tiếp nhận</th>
                        <th className="px-3 py-2.5 text-right">Lead hợp lệ</th>
                        <th className="px-3 py-2.5 text-right">Đã báo giá</th>
                        <th className="px-3 py-2.5 text-right">Đã chốt</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.tables.byProduct || []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                            Chưa có dữ liệu theo sản phẩm.
                          </td>
                        </tr>
                      ) : (
                        data!.tables.byProduct.map((row) => (
                          <tr key={row.productId || row.productName} className="hover:bg-slate-50/80">
                            <td className="px-3 py-2.5 font-medium text-slate-900">{row.productName}</td>
                            <td className="px-3 py-2.5 text-right">{row.leadCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right">{row.validCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right">{row.quotedCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                              {row.wonCount.toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>

          {/* Bottom Full-Width Table: Bảng cần xử lý */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Bảng cần xử lý</h2>
                <p className="text-xs text-slate-500">
                  Danh sách Lead đang chờ phản hồi báo giá hoặc quá hạn theo dõi
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Tổng cộng:{' '}
                <span className="font-semibold text-slate-800">
                  {data?.tables.pendingActionLeads.totalRows ?? 0}
                </span>{' '}
                Lead
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                    <th className="px-3 py-2.5">Mã Lead</th>
                    <th className="px-3 py-2.5">Khách hàng</th>
                    <th className="px-3 py-2.5">Website</th>
                    <th className="px-3 py-2.5">Sales phụ trách</th>
                    <th className="px-3 py-2.5">Ngày gửi báo giá</th>
                    <th className="px-3 py-2.5 text-right">Số ngày chờ</th>
                    <th className="px-3 py-2.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.tables.pendingActionLeads.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                        Không có Lead báo giá chờ xử lý trong kỳ lọc.
                      </td>
                    </tr>
                  ) : (
                    data!.tables.pendingActionLeads.rows.map((item) => (
                      <tr key={item.leadId} className="hover:bg-slate-50/80">
                        <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-700">
                          {item.leadCode}
                        </td>
                        <td className="px-3 py-2.5 font-medium text-slate-900">{item.customerLabel}</td>
                        <td className="px-3 py-2.5 text-slate-600">{item.website}</td>
                        <td className="px-3 py-2.5 text-slate-700">{item.assignedSalesName}</td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {item.quoteSentAt
                            ? new Date(item.quoteSentAt).toLocaleDateString('vi-VN')
                            : 'Chưa ghi nhận'}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                              item.waitingDays > 7
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.waitingDays} ngày
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            href={`/leads?leadId=${encodeURIComponent(String(item.leadId))}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
                          >
                            <span>Mở chi tiết</span>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination (20 rows/page) */}
            {data && totalPendingPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
                <span>
                  Trang {data.tables.pendingActionLeads.page} / {totalPendingPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={pendingPage <= 1}
                    onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Trước</span>
                  </button>
                  <button
                    type="button"
                    disabled={pendingPage >= totalPendingPages}
                    onClick={() =>
                      setPendingPage((p) => Math.min(totalPendingPages, p + 1))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span>Sau</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
