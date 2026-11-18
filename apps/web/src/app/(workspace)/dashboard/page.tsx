'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  UI_VOCABULARY,
  formatSafePeriodComparison,
  hasBaPermission,
  type ReportsDashboardDto,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Globe,
  Megaphone,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { getInitials } from '@/core/layout/WorkspaceShell';
import { resolveCoverBackgroundStyle } from '@/core/components/UserCoverStyle';

function buildDashboardApiPath(scope: {
  preset: string;
  from: string;
  to: string;
}): string {
  // Trang Tổng quan LUÔN bao quát toàn bộ hệ thống (không chia lẻ tab từng website)
  const qs = new URLSearchParams({
    websiteId: 'all',
    preset: scope.preset || '7D',
  });
  if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
    qs.set('from', scope.from);
    qs.set('to', scope.to);
  }
  return `/api/v1/reports?${qs.toString()}`;
}

export default function DashboardPage() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();
  const apiPath = useMemo(() => buildDashboardApiPath(scope), [scope]);

  const [report, setReport] = useState<ReportsDashboardDto | null>(() =>
    peekApiCache<ReportsDashboardDto>(apiPath),
  );
  const [knownWebsites, setKnownWebsites] = useState<WebsiteConfigItemDto[]>(
    () => peekApiCache<ReportsDashboardDto>(apiPath)?.availableWebsites || [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !peekApiCache<ReportsDashboardDto>(apiPath),
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const cached = peekApiCache<ReportsDashboardDto>(apiPath);
    if (cached) {
      setReport(cached);
      if (cached.availableWebsites?.length) {
        setKnownWebsites(cached.availableWebsites);
      }
      setIsLoading(false);
    } else {
      setReport(null);
      setIsLoading(true);
    }
  }, [apiPath]);

  const fetchDashboard = useCallback(
    async (opts?: { manual?: boolean; signal?: AbortSignal }) => {
      if (opts?.manual) setIsRefreshing(true);
      setFetchError(null);
      try {
        const res = await apiRequest<ReportsDashboardDto>(apiPath, {
          signal: opts?.signal,
          skipCache: Boolean(opts?.manual),
        });
        if (opts?.signal?.aborted) return;
        setReport(res);
        if (res.availableWebsites?.length) {
          setKnownWebsites(res.availableWebsites);
        }
      } catch (err) {
        if (opts?.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setFetchError(
          err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError,
        );
      } finally {
        if (!opts?.signal?.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [apiPath],
  );

  useEffect(() => {
    if (!hydrated || !user) return;
    if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

    const controller = new AbortController();
    void fetchDashboard({ signal: controller.signal });

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchDashboard();
      }
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [hydrated, user, scope.preset, scope.from, scope.to, fetchDashboard]);

  useEffect(() => {
    const handleGlobalSearch = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', handleGlobalSearch as EventListener);
    return () =>
      window.removeEventListener('tt-global-search', handleGlobalSearch as EventListener);
  }, []);

  const scopeQueryForLinks = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('preset', scope.preset);
    if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
      qs.set('from', scope.from);
      qs.set('to', scope.to);
    }
    return qs.toString();
  }, [scope.preset, scope.from, scope.to]);

  const periodComp = useMemo(() => {
    if (!report || !report.previousOverview) return null;
    return formatSafePeriodComparison(
      report.overview.totalLeadsL1,
      report.previousOverview.totalLeadsL1,
    );
  }, [report]);

  const freshnessText = useMemo(() => {
    if (isRefreshing) return UI_VOCABULARY.freshness.updating;
    if (fetchError && !report) return UI_VOCABULARY.fallbacks.loadError;
    if (!report) return UI_VOCABULARY.freshness.updating;
    const base = report.lastSyncedAt
      ? `${UI_VOCABULARY.freshness.updatedAtPrefix} ${new Date(report.lastSyncedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
      : `${UI_VOCABULARY.freshness.dataThroughPrefix} ${report.toDate}`;
    return report.todayPreliminaryNotice ? `${base} · ${report.todayPreliminaryNotice}` : base;
  }, [fetchError, isRefreshing, report]);

  const actionableTasks = useMemo(() => {
    const list = report?.actionableTasks || [];
    if (!searchTerm) return list;
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(searchTerm) ||
        t.moduleLabel.toLowerCase().includes(searchTerm) ||
        t.description.toLowerCase().includes(searchTerm),
    );
  }, [report?.actionableTasks, searchTerm]);

  const websiteRows = useMemo(() => {
    const list = report?.websiteSummaries || [];
    if (!searchTerm) return list;
    return list.filter(
      (w) =>
        w.shortName.toLowerCase().includes(searchTerm) ||
        w.domain.toLowerCase().includes(searchTerm),
    );
  }, [report?.websiteSummaries, searchTerm]);

  const salesRows = useMemo(() => {
    const list = report?.salesPerformance || [];
    if (!searchTerm) return list;
    return list.filter((s) => s.salesFullName.toLowerCase().includes(searchTerm));
  }, [report?.salesPerformance, searchTerm]);

  const totalSystemPageViews = useMemo(() => {
    const rows = report?.websiteSummaries || [];
    let hasAny = false;
    let sum = 0;
    for (const r of rows) {
      if (r.pageViews !== null) {
        hasAny = true;
        sum += r.pageViews;
      }
    }
    return hasAny ? sum : null;
  }, [report?.websiteSummaries]);

  const totalSystemGscClicks = useMemo(() => {
    const rows = report?.websiteSummaries || [];
    let hasAny = false;
    let sum = 0;
    for (const r of rows) {
      if (r.gscClicks !== null) {
        hasAny = true;
        sum += r.gscClicks;
      }
    }
    return hasAny ? sum : null;
  }, [report?.websiteSummaries]);

  const chartPoints = report?.leadTrend || [];
  const sparklineGeometry = useMemo(() => {
    if (chartPoints.length === 0) return null;
    const W = 520;
    const H = 128;
    const padX = 16;
    const padY = 18;
    const innerW = W - padX * 2;
    const innerH = H - padY * 2;
    const maxV = Math.max(4, ...chartPoints.map((p) => p.totalL1));

    const pts = chartPoints.map((p, i) => {
      const x =
        chartPoints.length === 1
          ? W / 2
          : padX + (i / (chartPoints.length - 1)) * innerW;
      const y = padY + innerH - (p.totalL1 / maxV) * innerH;
      return { ...p, x, y };
    });

    const linePath = pts
      .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(' ');
    const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`;

    return { W, H, maxV, pts, linePath, areaPath, baselineY: padY + innerH };
  }, [chartPoints]);

  const dq = report?.dataQualitySummary;
  const canViewLeads = user ? hasBaPermission(user.roleCode, 'LEAD_VIEW_OWN') : false;

  return (
    <div className="space-y-4">
      {/* 1. Thanh điều hành bao quát toàn hệ thống (không bắt bấm chọn từng tab website) */}
      <WebsiteDashboardHeader
        title="Tổng quan điều hành"
        subtitle={
          report
            ? `Bức tranh bao quát toàn hệ thống (${report.fromDate} → ${report.toDate})`
            : 'Bức tranh bao quát toàn hệ thống'
        }
        scope={{ ...scope, websiteId: 'all' }}
        availableWebsites={report?.availableWebsites || knownWebsites}
        hideWebsiteTabs={true}
        comparisonLabel={periodComp ? periodComp.label : null}
        freshnessMessage={freshnessText}
        freshnessTone={
          fetchError
            ? 'error'
            : isRefreshing
              ? 'updating'
              : report?.todayPreliminaryNotice
                ? 'warning'
                : 'ok'
        }
        onChangeScope={updateScope}
        actions={
          <button
            type="button"
            onClick={() => void fetchDashboard({ manual: true })}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 min-h-9 px-3.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A] disabled:opacity-60"
          >
            <RefreshCw
              aria-hidden="true"
              className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E3A8A]' : ''}`}
            />
            <span>{UI_VOCABULARY.actions.refresh}</span>
          </button>
        }
      />

      {fetchError && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-center justify-between gap-3"
        >
          <span>{fetchError}</span>
          <button
            type="button"
            onClick={() => void fetchDashboard({ manual: true })}
            className="font-semibold underline shrink-0"
          >
            Thử tải lại
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* KHỐI 1 (ĐƯA LÊN ĐẦU TIÊN): BẢNG CÔNG VIỆC ƯU TIÊN CẦN LÀM TRƯỚC        */}
      {/* ===================================================================== */}
      <section
        aria-labelledby="dashboard-priority-tasks-heading"
        className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-700 grid place-items-center shrink-0">
              <ClipboardCheck aria-hidden="true" className="w-4 h-4" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="dashboard-priority-tasks-heading" className="text-sm sm:text-base font-bold text-slate-900">
                  Công việc ưu tiên cần xử lý trước
                </h2>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    actionableTasks.length > 0
                      ? 'bg-amber-100 text-amber-900 border border-amber-300/80'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }`}
                >
                  {actionableTasks.length > 0
                    ? `${actionableTasks.length} hạng mục tồn đọng`
                    : 'Không có tồn đọng'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Tổng hợp đầu việc phát sinh thật từ Kinh doanh, SEO, Thiết kế AI và Kết nối dữ liệu để xử lý ngay trong ca
              </p>
            </div>
          </div>

          {/* Chip kiểm soát chất lượng dữ liệu đặt gọn ngay trên thanh tiêu đề */}
          {dq && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-400 font-medium inline-flex items-center gap-1 mr-0.5">
                <ShieldAlert aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
                Rà soát nhanh:
              </span>
              <Link
                href={canViewLeads ? `/leads?missingProduct=1&${scopeQueryForLinks}` : '/reports'}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition"
              >
                Chưa gắn sản phẩm: <strong className="tabular-nums">{dq.missingProductCount}</strong>
              </Link>
              <Link
                href={canViewLeads ? `/leads?missingWebsite=1&${scopeQueryForLinks}` : '/reports'}
                className="px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition"
              >
                Chưa rõ website: <strong className="tabular-nums">{dq.missingWebsiteCount}</strong>
              </Link>
              <Link
                href="/settings?tab=sync"
                className={`px-2.5 py-1 rounded-lg border font-semibold transition ${
                  dq.failingConnectionsCount > 0
                    ? 'bg-rose-50 border-rose-200 text-rose-700'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                {dq.failingConnectionsCount > 0
                  ? `${dq.failingConnectionsCount} kết nối lỗi`
                  : 'Đồng bộ ổn định'}
              </Link>
            </div>
          )}
        </div>

        {isLoading && !report ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-28 rounded-xl bg-slate-50 border border-slate-100 animate-pulse" />
            ))}
          </div>
        ) : actionableTasks.length === 0 ? (
          <div className="rounded-xl bg-emerald-50/60 border border-emerald-200/80 px-4 py-3.5 flex items-center gap-2.5 text-xs text-emerald-900 font-medium">
            <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Toàn bộ đầu việc ưu tiên trong kỳ đang chọn đều đã được xử lý gọn gàng.</span>
          </div>
        ) : (
          <div
            className={`grid grid-cols-1 md:grid-cols-2 ${
              actionableTasks.length >= 4
                ? 'xl:grid-cols-4'
                : actionableTasks.length === 3
                  ? 'xl:grid-cols-3'
                  : 'xl:grid-cols-2'
            } gap-3`}
          >
            {actionableTasks.map((task) => {
              const isCrit = task.severity === 'critical';
              return (
                <Link
                  key={task.id}
                  href={task.href}
                  className={`group rounded-xl border p-3.5 flex flex-col justify-between gap-2.5 transition-all hover:shadow-sm focus-visible:outline-2 focus-visible:outline-[#1E3A8A] ${
                    isCrit
                      ? 'bg-gradient-to-br from-rose-50/70 via-white to-white border-rose-200/90 hover:border-rose-400'
                      : 'bg-gradient-to-br from-amber-50/55 via-white to-white border-amber-200/90 hover:border-[#1E3A8A]/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${
                          isCrit
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        <AlertTriangle aria-hidden="true" className="w-3 h-3 shrink-0" />
                        <span>{isCrit ? 'Ưu tiên xử lý ngay' : 'Cần kiểm tra'}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold">
                        {task.moduleLabel}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-baseline justify-between gap-2">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900 group-hover:text-[#0F275C]">
                        {task.title}
                      </h3>
                      <span
                        className={`text-xl font-extrabold tabular-nums shrink-0 ${
                          isCrit ? 'text-rose-700' : 'text-[#0F275C]'
                        }`}
                      >
                        {task.count}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 mt-1 line-clamp-2">{task.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#1E3A8A]">
                    <span>Đi tới xử lý ngay</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                    />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* KHỐI 2: BỨC TRANH BAO QUÁT 4 MẢNG NGHIỆP VỤ TOÀN CÔNG TY              */}
      {/* ===================================================================== */}
      <section aria-label="Bức tranh bao quát 4 mảng nghiệp vụ" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
        {/* Mảng 1: Kinh doanh & Phễu chốt đơn */}
        <Link
          href={canViewLeads ? `/leads?${scopeQueryForLinks}` : `/reports?${scopeQueryForLinks}`}
          className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <BarChart3 aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
              Phễu Kinh doanh
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
              Chốt: {report?.overview.winRateText || '—'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              <AnimatedMetricNumber value={report?.overview.totalLeadsL1 ?? null} />
            </span>
            <span className="text-xs text-slate-500">
              cơ hội (Hợp lệ: <strong className="text-slate-800">{report?.overview.validLeadsL2 ?? 0}</strong>)
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Đang báo giá: <strong className="text-slate-900">{(report?.overview.quotingCount ?? 0) + (report?.overview.quoteSentCount ?? 0)}</strong> · Thành công:{' '}
              <strong className="text-emerald-700">{report?.overview.wonCount ?? 0}</strong>
            </span>
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Mảng 2: Lưu lượng & Tìm kiếm tự nhiên toàn hệ thống */}
        <Link
          href={`/ads?${scopeQueryForLinks}`}
          className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Globe aria-hidden="true" className="w-4 h-4 text-emerald-600" />
              Lưu lượng &amp; SEO Toàn hệ thống
            </span>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1E3A8A] text-[11px] font-semibold">
              {report?.availableWebsites?.length || 4} website
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              <AnimatedMetricNumber value={totalSystemPageViews} />
            </span>
            <span className="text-xs text-slate-500">
              lượt xem trang · <strong className="text-emerald-700 tabular-nums">{totalSystemGscClicks?.toLocaleString('vi-VN') ?? '—'}</strong> click Google
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Bài SEO đã đăng: <strong className="text-slate-900">{report?.marketingSummary.publishedSeoArticles ?? 0}</strong> · Bản nháp:{' '}
              <strong className="text-amber-700">{report?.marketingSummary.draftSeoArticles ?? 0}</strong>
            </span>
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>

        {/* Mảng 3: Chiến dịch & Hiệu suất Kênh thu hút */}
        <Link
          href={`/tracking?${scopeQueryForLinks}`}
          className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Megaphone aria-hidden="true" className="w-4 h-4 text-indigo-600" />
              Chiến dịch &amp; Kênh thu hút
            </span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
              {report?.byChannel?.filter((c) => c.count > 0).length || 0} kênh phát sinh
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
            <span className="text-xl 2xl:text-2xl font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
              {report?.marketingSummary.totalAdsSpend
                ? `${Math.round(Number(report.marketingSummary.totalAdsSpend.formattedDecimal || 0)).toLocaleString('vi-VN')}\u00A0₫`
                : `${report?.marketingSummary.effectiveLeadsFromAds ?? 0} Lead Ads`}
            </span>
            <span className="text-xs text-slate-500">
              {report?.marketingSummary.totalAdsSpend ? 'chi tiêu Ads' : 'ghi nhận từ GCLID / UTM'}
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span className="truncate">
              {(report?.byChannel || [])
                .filter((c) => c.count > 0)
                .slice(0, 2)
                .map((c) => `${c.label}: ${c.count}`)
                .join(' · ') || 'Xem phân tích đa kênh'}
            </span>
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </div>
        </Link>

        {/* Mảng 4: Thiết kế AI & Phối cảnh 3D */}
        <Link
          href="/design"
          className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Sparkles aria-hidden="true" className="w-4 h-4 text-violet-600" />
              Thiết kế AI &amp; Phối cảnh
            </span>
            <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-semibold">
              {report?.designSummary.avgProcessingSecText &&
              report.designSummary.avgProcessingSecText !== 'Chưa phát sinh'
                ? `TB: ${report.designSummary.avgProcessingSecText}`
                : report?.designSummary.avgProcessingSecText || 'Chưa phát sinh'}
            </span>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="text-2xl font-extrabold text-slate-900 tabular-nums">
              <AnimatedMetricNumber value={report?.designSummary.totalRequests ?? 0} />
            </span>
            <span className="text-xs text-slate-500">
              yêu cầu (Đang chờ: <strong className="text-amber-700">{report?.designSummary.pendingCount ?? 0}</strong>)
            </span>
          </div>
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Hoàn tất: <strong className="text-slate-900">{(report?.designSummary.completed3dCount ?? 0) + (report?.designSummary.completedBannerCount ?? 0)}</strong> bản vẽ 3D / Banner
            </span>
            <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </Link>
      </section>

      {/* ===================================================================== */}
      {/* KHỐI 3: SO SÁNH ĐỒNG THỜI TOÀN BỘ WEBSITE (7/12) + NHỊP ĐỘ & SALES (5/12) */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        {/* 7/12: Bức tranh song song tất cả Website (nhìn 1 lần thấy toàn bộ, không phải bấm từng tab) */}
        <section
          aria-labelledby="dashboard-websites-matrix-heading"
          className="xl:col-span-7 rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between"
        >
          <div>
            <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Globe aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                <h2 id="dashboard-websites-matrix-heading" className="text-sm font-bold text-slate-900">
                  Hiệu suất đồng thời toàn bộ hệ thống Website
                </h2>
              </div>
              <Link
                href={`/reports?${scopeQueryForLinks}`}
                className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
              >
                <span>Báo cáo đối soát chi tiết</span>
                <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {websiteRows.map((ws) => {
                const showDomain =
                  ws.domain &&
                  ws.shortName.toLowerCase().trim() !== ws.domain.toLowerCase().trim();
                return (
                  <div
                    key={ws.websiteId}
                    className="px-4 py-3 hover:bg-slate-50/70 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs sm:text-sm">
                          {ws.shortName}
                        </span>
                        {showDomain && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[11px]">
                            {ws.domain}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="w-36 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          {ws.sharePct > 0 && (
                            <div
                              style={{ width: `${Math.min(100, ws.sharePct)}%` }}
                              className="h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-sky-500"
                            />
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500 tabular-nums">
                          Tỷ trọng nhu cầu: <strong className="text-slate-700">{ws.sharePct}%</strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs shrink-0">
                      <div className="text-right min-w-[68px]">
                        <div className="text-[11px] text-slate-400">Xem trang</div>
                        <div className="font-bold text-slate-800 tabular-nums">
                          {ws.pageViews !== null ? ws.pageViews.toLocaleString('vi-VN') : '—'}
                        </div>
                      </div>
                      <div className="text-right min-w-[64px]">
                        <div className="text-[11px] text-slate-400">Click SEO</div>
                        <div className="font-bold text-emerald-700 tabular-nums">
                          {ws.gscClicks !== null ? ws.gscClicks.toLocaleString('vi-VN') : '—'}
                        </div>
                      </div>
                      <div className="text-right min-w-[60px]">
                        <div className="text-[11px] text-slate-400">Cơ hội</div>
                        <div className="font-extrabold text-[#0F275C] tabular-nums">
                          {ws.totalLeadsL1}
                        </div>
                      </div>

                      {!ws.isDirectOrUnmapped ? (
                        <div className="inline-flex items-center gap-1 pl-2 border-l border-slate-200">
                          <Link
                            href={`/tracking?websiteId=${encodeURIComponent(ws.websiteId)}&${scopeQueryForLinks}`}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-[#1E3A8A] text-[11px] font-semibold transition"
                          >
                            Lưu lượng
                          </Link>
                          <Link
                            href={`/ads?websiteId=${encodeURIComponent(ws.websiteId)}&${scopeQueryForLinks}`}
                            className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 text-[11px] font-semibold transition"
                          >
                            SEO
                          </Link>
                        </div>
                      ) : (
                        <div className="inline-flex items-center pl-2 border-l border-slate-200">
                          <Link
                            href={canViewLeads ? `/leads?missingWebsite=1&${scopeQueryForLinks}` : '/reports'}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition"
                          >
                            Phân bổ web
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Chân thẻ tổng cộng */}
          <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              Tổng lượt xem toàn hệ thống:{' '}
              <strong className="text-slate-900 tabular-nums">
                {totalSystemPageViews !== null ? totalSystemPageViews.toLocaleString('vi-VN') : '—'}
              </strong>
            </span>
            <span>
              Tổng Click tự nhiên Google:{' '}
              <strong className="text-emerald-700 tabular-nums">
                {totalSystemGscClicks !== null ? totalSystemGscClicks.toLocaleString('vi-VN') : '—'}
              </strong>
            </span>
          </div>
        </section>

        {/* 5/12: Nhịp độ xu hướng trong kỳ + Đội ngũ phụ trách */}
        <div className="xl:col-span-5 flex flex-col gap-4 justify-between">
          {/* Biểu đồ xu hướng mượt gọn */}
          <section
            aria-labelledby="dashboard-pulse-heading"
            className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                <h2 id="dashboard-pulse-heading" className="text-sm font-bold text-slate-900">
                  Nhịp độ nhu cầu khách hàng theo ngày
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">
                Đỉnh kỳ: <strong className="text-slate-800 tabular-nums">{Math.max(0, ...chartPoints.map((p) => p.totalL1))}</strong>/ngày
              </span>
            </div>

            {sparklineGeometry ? (
              <div>
                <svg
                  viewBox={`0 0 ${sparklineGeometry.W} ${sparklineGeometry.H}`}
                  className="w-full h-[126px] overflow-visible"
                  role="img"
                  aria-label="Biểu đồ nhịp độ nhu cầu theo ngày"
                >
                  <defs>
                    <linearGradient id="dashPulseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#2563EB" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#2563EB" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>
                  <line
                    x1="16"
                    y1={sparklineGeometry.baselineY}
                    x2={sparklineGeometry.W - 16}
                    y2={sparklineGeometry.baselineY}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  <path d={sparklineGeometry.areaPath} fill="url(#dashPulseGrad)" />
                  <path
                    d={sparklineGeometry.linePath}
                    fill="none"
                    stroke="#1E3A8A"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {sparklineGeometry.pts.map((pt) =>
                    pt.totalL1 > 0 ? (
                      <g key={pt.date}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4"
                          fill="#FFFFFF"
                          stroke="#1E3A8A"
                          strokeWidth="2.2"
                        />
                        <text
                          x={pt.x}
                          y={pt.y - 8}
                          textAnchor="middle"
                          className="fill-slate-700 text-[10px] font-bold"
                        >
                          {pt.totalL1}
                        </text>
                      </g>
                    ) : null,
                  )}
                </svg>
                <div className="flex items-center justify-between text-[11px] text-slate-400 px-2 tabular-nums">
                  <span>{chartPoints[0]?.label}</span>
                  <span>{chartPoints[Math.floor(chartPoints.length / 2)]?.label}</span>
                  <span>{chartPoints[chartPoints.length - 1]?.label}</span>
                </div>
              </div>
            ) : (
              <div className="h-[120px] grid place-items-center text-xs text-slate-400">
                Chưa có dữ liệu trong khoảng ngày đang chọn.
              </div>
            )}
          </section>

          {/* Tiến độ đội ngũ Kinh doanh (đồng bộ ảnh đại diện & hình nền thành viên) */}
          <section
            aria-labelledby="dashboard-team-heading"
            className="flex-1 rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Users aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                  <h2 id="dashboard-team-heading" className="text-sm font-bold text-slate-900">
                    Phân bổ khối lượng đội ngũ phụ trách
                  </h2>
                </div>
                <Link href="/profile" className="text-xs font-semibold text-[#1E3A8A] hover:underline">
                  Đồng nghiệp →
                </Link>
              </div>

              <div className="space-y-2 max-h-[220px] overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pr-1">
                {salesRows.slice(0, 6).map((sp) => (
                  <div
                    key={sp.salesUserId}
                    className="rounded-xl border border-slate-200/80 p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        style={sp.coverUrl ? resolveCoverBackgroundStyle(sp.coverUrl) : undefined}
                        className={`w-9 h-9 rounded-xl p-0.5 grid place-items-center shrink-0 ${
                          sp.coverUrl ? '' : 'bg-blue-50'
                        }`}
                      >
                        {sp.avatarUrl ? (
                          <img
                            src={sp.avatarUrl}
                            alt={sp.salesFullName}
                            className="w-7 h-7 rounded-full object-cover ring-1 ring-white"
                          />
                        ) : (
                          <span className="w-7 h-7 rounded-full bg-white text-[#0F275C] font-bold text-[11px] grid place-items-center shadow-2xs">
                            {getInitials(sp.salesFullName)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">
                          {sp.salesFullName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Đang báo giá: <strong className="text-slate-700">{sp.quotingLeads + sp.quoteSentLeads}</strong> · Chốt:{' '}
                          <strong className="text-emerald-700">{sp.wonLeads}</strong>
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-900 text-xs font-extrabold tabular-nums">
                        {sp.totalLeads} hồ sơ
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
