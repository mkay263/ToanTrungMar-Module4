'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  METRIC_DICTIONARY,
  UI_VOCABULARY,
  formatSafePeriodComparison,
  hasBaPermission,
  type M04ResultsReportDto,
  type ReportsDashboardDto,
} from '@toantrung/contracts';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers,
  PenLine,
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
  { key: 'channel', label: 'Kênh' },
  { key: 'product', label: 'Sản phẩm' },
];

const BREAKDOWN_PAGE_SIZE = 20;

export function ReportsWorkspace() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();

  const [pendingPage, setPendingPage] = useState(1);
  const [breakdownPage, setBreakdownPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<BreakdownTabKey>('sales');
  const [reportViewMode, setReportViewMode] = useState<'dashboard' | 'doc_composer'>('dashboard');

  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({
      view: 'spec',
      websiteId: scope.websiteId || 'all',
      preset: scope.preset || '7D',
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
    peekApiCache<M04ResultsReportDto>(queryUrl),
  );
  const [legacyData, setLegacyData] = useState<ReportsDashboardDto | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !peekApiCache<M04ResultsReportDto>(queryUrl));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canExport = Boolean(user && hasBaPermission(user.roleCode, 'EXPORT_DATA'));

  const loadReports = useCallback(
    async (forceFresh = false, signal?: AbortSignal) => {
      if (!hydrated) return;
      const cached = !forceFresh ? peekApiCache<M04ResultsReportDto>(queryUrl) : null;
      if (cached) {
        setData(cached);
        setLoading(false);
      } else if (!forceFresh) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        const res = await apiRequest<M04ResultsReportDto>(queryUrl, {
          skipCache: forceFresh,
          signal,
        });
        if (signal?.aborted) return;
        setData(res);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError);
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [hydrated, queryUrl],
  );

  useEffect(() => {
    if (!hydrated) return;
    const controller = new AbortController();
    void loadReports(false, controller.signal);
    return () => controller.abort();
  }, [hydrated, loadReports]);

  useEffect(() => {
    setPendingPage(1);
    setBreakdownPage(1);
    setLegacyData(null);
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  useEffect(() => {
    setBreakdownPage(1);
  }, [activeBreakdownTab]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', onSearch as EventListener);
    return () => window.removeEventListener('tt-global-search', onSearch as EventListener);
  }, []);

  // Chỉ tải dữ liệu trình soạn thảo khi người dùng mở chế độ Soạn báo cáo
  useEffect(() => {
    if (reportViewMode !== 'doc_composer' || legacyData) return;
    const params = new URLSearchParams({
      websiteId: scope.websiteId || 'all',
      preset: 'custom',
      fromDate: data?.scope.startDate || scope.from || '',
      toDate: data?.scope.endDate || scope.to || '',
    });
    const controller = new AbortController();
    apiRequest<ReportsDashboardDto>(`/api/v1/reports?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!controller.signal.aborted) setLegacyData(res);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [
    reportViewMode,
    legacyData,
    scope.websiteId,
    data?.scope.startDate,
    data?.scope.endDate,
    scope.from,
    scope.to,
  ]);

  const buildScopedExportParams = () => {
    const params = new URLSearchParams({
      websiteId: scope.websiteId || 'all',
      preset: 'custom',
      fromDate: data?.scope.startDate || scope.from || '',
      toDate: data?.scope.endDate || scope.to || '',
    });
    return params;
  };

  const handleExportExcel = () => {
    const params = buildScopedExportParams();
    params.set('format', 'xlsx');
    window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
  };

  const handleExportWord = () => {
    const params = buildScopedExportParams();
    window.open(`/api/v1/reports/docx?${params.toString()}`, '_blank');
  };

  const statusRows = useMemo(() => {
    if (data?.charts.statusDistribution && data.charts.statusDistribution.length > 0) {
      return data.charts.statusDistribution;
    }
    const total = Math.max(1, data?.metrics.totalLeadCount || 0);
    return (data?.charts.leadFunnel || []).map((f) => ({
      statusKey: f.stageKey,
      label: f.label,
      count: f.distinctLeadCount,
      pctOfTotal: data?.metrics.totalLeadCount
        ? Number(((f.distinctLeadCount / total) * 100).toFixed(1))
        : 0,
    }));
  }, [data?.charts.statusDistribution, data?.charts.leadFunnel, data?.metrics.totalLeadCount]);

  const maxStatusCount = useMemo(
    () => Math.max(1, ...statusRows.map((r) => r.count)),
    [statusRows],
  );

  const productChartRows = data?.charts.productLeadRows || [];
  const hasProductChartData = productChartRows.some((r) => r.distinctLeadCount > 0);
  const maxProductCount = useMemo(
    () => Math.max(1, ...productChartRows.map((r) => r.distinctLeadCount)),
    [productChartRows],
  );

  const unclassifiedProductCount = useMemo(() => {
    if (typeof data?.metrics.unclassifiedProductLeadCount === 'number') {
      return data.metrics.unclassifiedProductLeadCount;
    }
    const bucket = (data?.tables.byProduct || []).find((p) => p.isUnclassifiedProduct);
    return bucket?.leadCount || 0;
  }, [data?.metrics.unclassifiedProductLeadCount, data?.tables.byProduct]);

  const formatVnd = useCallback((val: number) => {
    return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
  }, []);

  const receivedComparison = formatSafePeriodComparison(
    data?.metrics.totalLeadCount ?? null,
    data?.metrics.previousReceivedLeadCount ?? null,
  );

  const totalPendingPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      Math.ceil(data.tables.pendingActionLeads.totalRows / data.tables.pendingActionLeads.pageSize),
    );
  }, [data]);

  // Tính tổng đối soát cho các bảng phân rã (Sales / Website / Kênh / Sản phẩm)
  const salesTotals = useMemo(() => {
    const rows = data?.tables.bySales || [];
    return rows.reduce(
      (acc, r) => ({
        leadCount: acc.leadCount + r.leadCount,
        validCount: acc.validCount + r.validCount,
        quotedCount: acc.quotedCount + r.quotedCount,
        waitingCount: acc.waitingCount + r.waitingCount,
        wonCount: acc.wonCount + r.wonCount,
        overdueCount: acc.overdueCount + r.overdueCount,
      }),
      { leadCount: 0, validCount: 0, quotedCount: 0, waitingCount: 0, wonCount: 0, overdueCount: 0 },
    );
  }, [data?.tables.bySales]);

  const websiteTotals = useMemo(() => {
    const rows = data?.tables.byWebsite || [];
    return rows.reduce(
      (acc, r) => ({
        leadCount: acc.leadCount + r.leadCount,
        validCount: acc.validCount + r.validCount,
        quotedCount: acc.quotedCount + r.quotedCount,
        wonCount: acc.wonCount + r.wonCount,
      }),
      { leadCount: 0, validCount: 0, quotedCount: 0, wonCount: 0 },
    );
  }, [data?.tables.byWebsite]);

  const channelTotals = useMemo(() => {
    const rows = data?.tables.byChannel || [];
    return rows.reduce(
      (acc, r) => ({
        leadCount: acc.leadCount + r.leadCount,
        validCount: acc.validCount + r.validCount,
        quotedCount: acc.quotedCount + r.quotedCount,
        wonCount: acc.wonCount + r.wonCount,
      }),
      { leadCount: 0, validCount: 0, quotedCount: 0, wonCount: 0 },
    );
  }, [data?.tables.byChannel]);

  const activeBreakdownTotalRows =
    activeBreakdownTab === 'sales'
      ? (data?.tables.bySales || []).length
      : activeBreakdownTab === 'website'
        ? (data?.tables.byWebsite || []).length
        : activeBreakdownTab === 'channel'
          ? (data?.tables.byChannel || []).length
          : (data?.tables.byProduct || []).length;
  const totalBreakdownPages = Math.max(1, Math.ceil(activeBreakdownTotalRows / BREAKDOWN_PAGE_SIZE));
  const sliceStart = (breakdownPage - 1) * BREAKDOWN_PAGE_SIZE;
  const sliceEnd = sliceStart + BREAKDOWN_PAGE_SIZE;

  return (
    <div className="space-y-4 pb-8">
      <WebsiteDashboardHeader
        title="Báo cáo"
        subtitle="Đối soát kết quả tiếp nhận, xử lý báo giá và chuyển đổi theo cùng một phạm vi chuẩn"
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || []}
        freshnessMessage={data?.freshness.statusMessage}
        freshnessTone={refreshing || loading ? 'updating' : data?.freshness.state === 'ERROR' ? 'error' : 'ok'}
        onChangeScope={updateScope}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadReports(true)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{UI_VOCABULARY.actions.refresh}</span>
            </button>
            {canExport && (
              <>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{UI_VOCABULARY.actions.exportExcel}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-blue-700" />
                  <span>{UI_VOCABULARY.actions.exportWord}</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setReportViewMode((prev) => (prev === 'dashboard' ? 'doc_composer' : 'dashboard'))
                  }
                  className={`h-9 px-3.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                    reportViewMode === 'doc_composer'
                      ? 'bg-slate-800 text-white'
                      : 'bg-[#0B1D48] text-white hover:bg-[#172D6E]'
                  }`}
                >
                  <PenLine className="h-3.5 w-3.5" />
                  <span>{reportViewMode === 'doc_composer' ? 'Về bảng số liệu' : 'Soạn văn bản báo cáo'}</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Quy ước phạm vi cohort duy nhất ở đầu trang + Từ điển công thức mở rộng */}
      <div className="rounded-[12px] border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
        <div>
          <span className="font-semibold text-slate-800">Quy ước tính số liệu: </span>
          <span>
            {data?.scope.cohortDefinition ||
              'Tập Lead tạo trong kỳ đang chọn (GMT+7), đối chiếu trạng thái xử lý hiện tại trên cùng phạm vi quyền và website.'}
          </span>
        </div>
        <details className="group relative">
          <summary className="cursor-pointer list-none font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            Công thức L1 / L2 / L3 &amp; Tỷ lệ chốt
          </summary>
          <div className="mt-2 md:absolute md:right-0 md:z-20 md:w-[440px] rounded-xl border border-slate-200 bg-white p-3.5 shadow-lg space-y-2 text-[11px] text-slate-700">
            <div>
              <strong className="text-slate-900">{METRIC_DICTIONARY.receivedLeadCount.label}:</strong>{' '}
              {METRIC_DICTIONARY.receivedLeadCount.formula}
            </div>
            <div>
              <strong className="text-slate-900">{METRIC_DICTIONARY.validLeadCount.label}:</strong>{' '}
              {METRIC_DICTIONARY.validLeadCount.formula}
            </div>
            <div>
              <strong className="text-slate-900">{METRIC_DICTIONARY.effectiveLeadCount.label}:</strong>{' '}
              {METRIC_DICTIONARY.effectiveLeadCount.formula}
            </div>
            <div>
              <strong className="text-slate-900">{METRIC_DICTIONARY.winRatePct.label}:</strong>{' '}
              {METRIC_DICTIONARY.winRatePct.formula}
            </div>
            <div>
              <strong className="text-slate-900">{METRIC_DICTIONARY.costPerValidAdLead.label}:</strong>{' '}
              {METRIC_DICTIONARY.costPerValidAdLead.formula}
            </div>
          </div>
        </details>
      </div>

      {data?.coverage.note && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 text-xs text-amber-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>{data.coverage.note}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      {reportViewMode === 'doc_composer' ? (
        <div className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xs">
          {legacyData ? (
            <ReportDocComposer user={user} data={legacyData} />
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">
              Đang tải dữ liệu soạn văn bản báo cáo...
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 6 KPI Kết quả (C09 — cao ~108px, bấm mở danh sách Lead đúng bộ lọc) */}
          <section
            aria-label="Chỉ số kết quả chính"
            className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3"
          >
            <Link
              href="/leads"
              className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div className="text-xs font-medium text-slate-600">Lead tiếp nhận</div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading && !data ? (
                  <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.totalLeadCount ?? null} />
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate" title={receivedComparison.label}>
                So kỳ trước: <span className="font-medium text-slate-700">{receivedComparison.label}</span>
              </div>
            </Link>

            <Link
              href="/leads"
              className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div className="text-xs font-medium text-slate-600">Lead hợp lệ</div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading && !data ? (
                  <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.validLeadCount ?? null} />
                )}
              </div>
              <div className="text-[11px] text-slate-600 truncate">
                Hợp lệ (L2): <strong>{data?.metrics.l2Count ?? 0}</strong> · Hiệu quả (L3):{' '}
                <strong>{data?.metrics.l3Count ?? 0}</strong>
              </div>
            </Link>

            <Link
              href="/leads?status=QUOTE_SENT"
              className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div className="text-xs font-medium text-slate-600">Báo giá chờ phản hồi</div>
              <div className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading && !data ? (
                  <span className="inline-block h-7 w-16 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.waitingQuoteCount ?? null} />
                )}
              </div>
              <div className="text-[11px] text-slate-500">Trạng thái Đã gửi báo giá</div>
            </Link>

            <Link
              href="/leads?status=WON"
              className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div className="text-xs font-medium text-slate-600">Chốt thành công</div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold tracking-tight text-emerald-700 tabular-nums">
                  {loading && !data ? (
                    <span className="inline-block h-7 w-14 animate-pulse rounded bg-slate-200" />
                  ) : (
                    <AnimatedMetricNumber value={data?.metrics.wonLeadCount ?? null} />
                  )}
                </span>
                {data && data.metrics.winRatePct !== null && (
                  <span className="rounded-full bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-700 tabular-nums">
                    {data.metrics.winRatePct.toFixed(1)}%
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 truncate">
                {data && data.metrics.winRateDenominator > 0
                  ? `${data.metrics.winRateNumerator}/${data.metrics.winRateDenominator} Lead hợp lệ`
                  : 'Chưa phát sinh mẫu số hợp lệ'}
              </div>
            </Link>

            <div className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs flex flex-col justify-between">
              <div className="text-xs font-medium text-slate-600">CPL Lead quảng cáo hợp lệ</div>
              <div className="text-xl font-bold tracking-tight text-slate-900 tabular-nums">
                {loading && !data ? (
                  <span className="inline-block h-7 w-24 animate-pulse rounded bg-slate-200" />
                ) : data?.metrics.costPerValidAdLead !== null &&
                  data?.metrics.costPerValidAdLead !== undefined ? (
                  <AnimatedMetricNumber value={data.metrics.costPerValidAdLead} format={formatVnd} />
                ) : (
                  <span className="text-sm font-semibold text-slate-500">
                    {UI_VOCABULARY.fallbacks.unconnected}
                  </span>
                )}
              </div>
              <div
                className="text-[11px] text-slate-500 truncate"
                title={data?.metrics.adReconciliationNote || 'Chi phí quảng cáo / Lead quảng cáo hợp lệ'}
              >
                {data?.metrics.adReconciliationNote || 'Chi phí quảng cáo / Lead quảng cáo hợp lệ'}
              </div>
            </div>

            <Link
              href="/leads?overdue=1"
              className="min-h-[108px] rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-amber-300 transition flex flex-col justify-between"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-medium text-slate-600">Báo giá quá hạn</span>
                <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              </div>
              <div className="text-2xl font-bold tracking-tight text-amber-700 tabular-nums">
                {loading && !data ? (
                  <span className="inline-block h-7 w-14 animate-pulse rounded bg-slate-200" />
                ) : (
                  <AnimatedMetricNumber value={data?.metrics.overdueQuoteCount ?? null} />
                )}
              </div>
              <div className="text-[11px] text-slate-500">Quá 7 ngày chưa cập nhật</div>
            </Link>
          </section>

          {/* Hàng biểu đồ: Phân bố trạng thái hiện tại (thanh 0 = width 0%) + Nhu cầu sản phẩm (không dựng card rỗng cao) */}
          <section className="grid grid-cols-1 gap-4 lg:grid-cols-12 items-start">
            <div
              className={`rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xs ${
                hasProductChartData ? 'lg:col-span-7' : 'lg:col-span-12'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#1E3A8A]" />
                  <h2 className="text-sm font-bold text-slate-900">
                    {data?.charts.progressChartTitle || 'Phân bố trạng thái xử lý hiện tại'}
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  {data?.charts.progressChartSubtitle ||
                    'Đếm từng Lead duy nhất theo trạng thái hiện tại (giá trị 0 không vẽ đoạn màu)'}
                </span>
              </div>

              <div className="space-y-3 py-1">
                {statusRows.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400">
                    Không có Lead trong phạm vi thời gian và website đang chọn.
                  </div>
                ) : (
                  statusRows.map((row) => {
                    // C01 #6 & C09: Khi count === 0 thì độ rộng thanh bắt buộc bằng 0% (0px)
                    const widthPct =
                      row.count > 0 ? Math.max(4, Math.round((row.count / maxStatusCount) * 100)) : 0;
                    const barColor =
                      row.statusKey === 'WON' || row.statusKey === 'won'
                        ? 'bg-emerald-600'
                        : row.statusKey === 'LOST'
                          ? 'bg-slate-400'
                          : row.statusKey === 'QUOTE_SENT' || row.statusKey === 'quoted'
                            ? 'bg-amber-500'
                            : row.statusKey === 'QUOTING'
                              ? 'bg-blue-600'
                              : 'bg-[#0B1D48]';
                    return (
                      <div key={row.statusKey} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-slate-700">{row.label}</span>
                          <span className="font-semibold text-slate-900 tabular-nums">
                            {row.count.toLocaleString('vi-VN')} Lead ({row.pctOfTotal}%)
                          </span>
                        </div>
                        <div className="h-5 w-full overflow-hidden rounded-md bg-slate-100">
                          <div
                            data-testid={`report-status-bar-${row.statusKey}`}
                            data-count={row.count}
                            className={`h-full transition-all duration-200 ${
                              row.count > 0 ? `${barColor} rounded-md` : 'bg-transparent'
                            }`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {!hasProductChartData && unclassifiedProductCount > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="text-slate-600">
                    Hiện có <strong className="text-slate-900">{unclassifiedProductCount} Lead</strong> chưa phân loại nhóm sản phẩm nên chưa hiển thị biểu đồ nhu cầu sản phẩm.
                  </span>
                  <Link
                    href="/leads?missingProduct=1"
                    className="font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
                  >
                    Phân loại trong Lead
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              )}
            </div>

            {hasProductChartData && (
              <div className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-2xs lg:col-span-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-[#1E3A8A]" />
                    <h2 className="text-sm font-bold text-slate-900">Nhu cầu theo nhóm sản phẩm</h2>
                  </div>
                  <span className="text-[11px] text-slate-500">Lead hợp lệ có gắn sản phẩm</span>
                </div>

                <div className="max-h-[260px] space-y-2.5 overflow-y-auto pr-1">
                  {productChartRows.slice(0, 8).map((item) => {
                    const widthPct =
                      item.distinctLeadCount > 0
                        ? Math.max(5, Math.round((item.distinctLeadCount / maxProductCount) * 100))
                        : 0;
                    return (
                      <div key={item.productId || item.productName} className="space-y-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate font-medium text-slate-700" title={item.productName}>
                            {item.productName}
                          </span>
                          <span className="shrink-0 font-semibold text-slate-900 tabular-nums">
                            {item.distinctLeadCount.toLocaleString('vi-VN')} Lead
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full transition-all duration-200 ${
                              item.distinctLeadCount > 0 ? 'rounded-full bg-[#1E3A8A]' : 'bg-transparent'
                            }`}
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {(data?.charts.multiProductNote || unclassifiedProductCount > 0) && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
                    <span>
                      {unclassifiedProductCount > 0
                        ? `Còn ${unclassifiedProductCount} Lead chưa gắn sản phẩm.`
                        : data?.charts.multiProductNote}
                    </span>
                    {unclassifiedProductCount > 0 && (
                      <Link
                        href="/leads?missingProduct=1"
                        className="font-semibold text-[#1E3A8A] hover:underline"
                      >
                        Mở danh sách chưa phân loại
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Bảng phân rã đối soát (Sales · Website · Kênh · Sản phẩm) — Tổng cộng khớp 100% KPI */}
          <section className="rounded-[12px] border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="border-b border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-2">
              <div
                role="tablist"
                aria-label="Phân tích chi tiết kết quả"
                className="flex flex-wrap items-center gap-1.5"
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
                      className={`h-8 px-3.5 rounded-lg text-xs font-semibold transition ${
                        selected
                          ? 'bg-[#0B1D48] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <span className="text-[11px] text-slate-500">
                Tổng dòng phân rã đối soát khớp trực tiếp với KPI Lead tiếp nhận ({data?.metrics.totalLeadCount ?? 0} Lead)
              </span>
            </div>

            <div role="tabpanel" className="overflow-x-auto">
              {activeBreakdownTab === 'sales' && (
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Nhân sự phụ trách</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead tiếp nhận</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead hợp lệ</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Đã gửi / chốt báo giá</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Chờ phản hồi</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Chốt thành công</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Quá hạn &gt;7 ngày</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.tables.bySales || []).slice(sliceStart, sliceEnd).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                          Không có dữ liệu phân bổ nhân sự trong phạm vi đang chọn.
                        </td>
                      </tr>
                    ) : (
                      (data?.tables.bySales || []).slice(sliceStart, sliceEnd).map((row) => (
                        <tr key={row.salesId} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{row.salesName}</span>
                              {row.isReconciliationBucket && (
                                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-600">
                                  {row.roleLabel || 'Đối soát ngoài nhóm Sales'}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.leadCount.toLocaleString('vi-VN')}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.validCount.toLocaleString('vi-VN')}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.quotedCount.toLocaleString('vi-VN')}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{row.waitingCount.toLocaleString('vi-VN')}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                            {row.wonCount.toLocaleString('vi-VN')}
                          </td>
                          <td className="px-4 py-2.5 text-right text-amber-700 tabular-nums">
                            {row.overdueCount.toLocaleString('vi-VN')}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {(data?.tables.bySales || []).length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900">
                        <td className="px-4 py-2.5">Tổng cộng đối soát</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{salesTotals.leadCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{salesTotals.validCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{salesTotals.quotedCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{salesTotals.waitingCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{salesTotals.wonCount.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2.5 text-right text-amber-700 tabular-nums">{salesTotals.overdueCount.toLocaleString('vi-VN')}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {activeBreakdownTab === 'website' && (
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Website nguồn</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead tiếp nhận</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead hợp lệ</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Đã gửi / chốt báo giá</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Chốt thành công</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Tỷ lệ chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.tables.byWebsite || []).slice(sliceStart, sliceEnd).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Không có dữ liệu website trong phạm vi đang chọn.
                        </td>
                      </tr>
                    ) : (
                      (data?.tables.byWebsite || []).slice(sliceStart, sliceEnd).map((row) => {
                        const winPct =
                          row.validCount > 0 ? ((row.wonCount / row.validCount) * 100).toFixed(1) : null;
                        return (
                          <tr key={row.website} className="hover:bg-slate-50/80">
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>{row.website}</span>
                                {row.isUnclassifiedWebsite && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-[10px] font-medium text-slate-600">
                                    Kênh trực tiếp / chưa gắn domain
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.leadCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.validCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.quotedCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                              {row.wonCount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {winPct !== null ? `${winPct}%` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {(data?.tables.byWebsite || []).length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900">
                        <td className="px-4 py-2.5">Tổng cộng đối soát</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{websiteTotals.leadCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{websiteTotals.validCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{websiteTotals.quotedCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{websiteTotals.wonCount.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {websiteTotals.validCount > 0
                            ? `${((websiteTotals.wonCount / websiteTotals.validCount) * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {activeBreakdownTab === 'channel' && (
                <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th scope="col" className="px-4 py-2.5 font-semibold">Kênh marketing / tiếp nhận</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead tiếp nhận</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead hợp lệ</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Đã gửi / chốt báo giá</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-semibold">Chốt thành công</th>
                      <th scope="col" className="px-4 py-2.5 text-right font-semibold">Tỷ lệ chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(data?.tables.byChannel || []).slice(sliceStart, sliceEnd).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                          Không có dữ liệu kênh trong phạm vi đang chọn.
                        </td>
                      </tr>
                    ) : (
                      (data?.tables.byChannel || []).slice(sliceStart, sliceEnd).map((row) => {
                        const winPct =
                          row.validCount > 0 ? ((row.wonCount / row.validCount) * 100).toFixed(1) : null;
                        return (
                          <tr key={row.channel} className="hover:bg-slate-50/80">
                            <td className="px-4 py-2.5 font-medium text-slate-900">{row.channel}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.leadCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.validCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.quotedCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                              {row.wonCount.toLocaleString('vi-VN')}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums">
                              {winPct !== null ? `${winPct}%` : '—'}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {(data?.tables.byChannel || []).length > 0 && (
                    <tfoot>
                      <tr className="border-t-2 border-slate-200 bg-slate-50/90 font-bold text-slate-900">
                        <td className="px-4 py-2.5">Tổng cộng đối soát</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{channelTotals.leadCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{channelTotals.validCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{channelTotals.quotedCount.toLocaleString('vi-VN')}</td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 tabular-nums">{channelTotals.wonCount.toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {channelTotals.validCount > 0
                            ? `${((channelTotals.wonCount / channelTotals.validCount) * 100).toFixed(1)}%`
                            : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              )}

              {activeBreakdownTab === 'product' && (
                <div>
                  <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                        <th scope="col" className="px-4 py-2.5 font-semibold">Nhóm sản phẩm quan tâm</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead tiếp nhận</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Lead hợp lệ</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Đã gửi / chốt báo giá</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Chốt thành công</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(data?.tables.byProduct || []).slice(sliceStart, sliceEnd).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                            Không có dữ liệu sản phẩm trong phạm vi đang chọn.
                          </td>
                        </tr>
                      ) : (
                        (data?.tables.byProduct || []).slice(sliceStart, sliceEnd).map((row) => (
                          <tr key={row.productId || row.productName} className="hover:bg-slate-50/80">
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span>{row.productName}</span>
                                {row.isUnclassifiedProduct && (
                                  <Link
                                    href="/leads?missingProduct=1"
                                    className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                                  >
                                    (Cập nhật phân loại)
                                  </Link>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.leadCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.validCount.toLocaleString('vi-VN')}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{row.quotedCount.toLocaleString('vi-VN')}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-emerald-700 tabular-nums">
                              {row.wonCount.toLocaleString('vi-VN')}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  {data?.charts.multiProductNote && (
                    <div className="px-4 py-2 bg-slate-50/70 border-t border-slate-100 text-[11px] text-slate-500">
                      {data.charts.multiProductNote}
                    </div>
                  )}
                </div>
              )}
            </div>

            {totalBreakdownPages > 1 && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Trang {breakdownPage} / {totalBreakdownPages}
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={breakdownPage <= 1}
                    onClick={() => setBreakdownPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={breakdownPage >= totalBreakdownPages}
                    onClick={() => setBreakdownPage((p) => Math.min(totalBreakdownPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Bảng cần xử lý cuối trang */}
          <section className="rounded-[12px] border border-slate-200 bg-white shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Lead chờ phản hồi báo giá</h2>
                <p className="text-xs text-slate-500">
                  Danh sách Lead đang ở trạng thái Đã gửi báo giá cần theo dõi tiến độ
                </p>
              </div>
              <div className="text-xs text-slate-500">
                Tổng cộng:{' '}
                <span className="font-semibold text-slate-800 tabular-nums">
                  {data?.tables.pendingActionLeads.totalRows ?? 0}
                </span>{' '}
                Lead
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th scope="col" className="px-4 py-2.5 font-semibold">Mã Lead</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Khách hàng</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Website nguồn</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Nhân sự phụ trách</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Ngày gửi báo giá</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-semibold">Thời gian chờ</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-semibold">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.tables.pendingActionLeads.rows || []).filter(
                    (item) =>
                      !searchTerm ||
                      `${item.leadCode} ${item.customerLabel} ${item.website} ${item.assignedSalesName}`
                        .toLowerCase()
                        .includes(searchTerm),
                  ).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                        {searchTerm
                          ? `Không tìm thấy Lead chờ phản hồi khớp "${searchTerm}".`
                          : 'Không có Lead báo giá chờ phản hồi trong phạm vi đang chọn.'}
                      </td>
                    </tr>
                  ) : (
                    data!.tables.pendingActionLeads.rows
                      .filter(
                        (item) =>
                          !searchTerm ||
                          `${item.leadCode} ${item.customerLabel} ${item.website} ${item.assignedSalesName}`
                            .toLowerCase()
                            .includes(searchTerm),
                      )
                      .map((item) => (
                        <tr key={item.leadId} className="hover:bg-slate-50/80">
                          <td className="px-4 py-2.5 font-mono font-semibold text-slate-700">
                            {item.leadCode}
                          </td>
                          <td className="px-3 py-2.5 font-medium text-slate-900">{item.customerLabel}</td>
                          <td className="px-3 py-2.5 text-slate-600">{item.website}</td>
                          <td className="px-3 py-2.5 text-slate-700">{item.assignedSalesName}</td>
                          <td className="px-3 py-2.5 text-slate-600 tabular-nums">
                            {item.quoteSentAt
                              ? new Date(item.quoteSentAt).toLocaleDateString('vi-VN')
                              : 'Chưa ghi nhận'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                item.waitingDays > 7
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {item.waitingDays} ngày
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            <Link
                              href={`/leads?leadId=${encodeURIComponent(String(item.leadId))}`}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-[#1E3A8A] hover:bg-slate-50"
                            >
                              <span>{UI_VOCABULARY.actions.viewDetails}</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {data && totalPendingPages > 1 && (
              <div className="px-4 py-2.5 flex items-center justify-between border-t border-slate-100 text-xs text-slate-600">
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
                    onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
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
