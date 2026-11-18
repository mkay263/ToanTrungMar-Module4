'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Download,
  ExternalLink,
  Layers,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  UI_VOCABULARY,
  formatSafePeriodComparison,
  hasBaPermission,
  type M02CampaignRowDto,
  type M02TrafficInteractionDto,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import {
  MarketingChannelMixCard,
  MarketingTrafficChart,
} from './MarketingTrafficChart';

type MainBusinessTab = 'traffic' | 'ads';
type TrafficTableSubTab = 'channels' | 'landing_pages' | 'actions';

function buildM02ApiPath(
  scope: { websiteId: string; preset: string; from: string; to: string },
  page: number,
  adsPage: number,
): string {
  const qs = new URLSearchParams({
    view: 'spec',
    websiteId: scope.websiteId || 'all',
    preset: scope.preset || '7D',
    page: String(page),
    pageSize: '20',
    adsPage: String(adsPage),
    adsPageSize: '20',
  });
  if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
    qs.set('from', scope.from);
    qs.set('to', scope.to);
  }
  return `/api/v1/tracking?${qs.toString()}`;
}

export function TrackingWorkspace() {
  const { user } = useSession();
  const canDirectDesign = Boolean(user && hasBaPermission(user.roleCode, 'AI_DESIGN'));
  const { scope, hydrated, updateScope } = useDashboardScope();
  const [businessTab, setBusinessTab] = useState<MainBusinessTab>('traffic');
  const [trafficSubTab, setTrafficSubTab] = useState<TrafficTableSubTab>('channels');
  const [page, setPage] = useState(1);
  const [adsPage, setAdsPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [drawerCampaign, setDrawerCampaign] = useState<M02CampaignRowDto | null>(null);
  const [briefSubmittingId, setBriefSubmittingId] = useState<string | null>(null);
  const [briefNotice, setBriefNotice] = useState<string | null>(null);

  const handleCreateCampaignBrief = async (c: M02CampaignRowDto) => {
    setBriefSubmittingId(c.campaignId);
    setBriefNotice(null);
    try {
      const domain =
        data?.scope.domain ||
        (scope.websiteId && scope.websiteId !== 'all' ? scope.websiteId : 'toantrung.com.vn');
      const res = await apiRequest<{ ok: boolean; projectId: number; message: string }>('/api/v1/design', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'submit_marketing_brief',
          projectName: `Banner chiến dịch ${c.campaignName}`,
          taskCode: 'banner_generate',
          designType: 'banner',
          sourceModule: 'tracking',
          designBrief: {
            objective: `Tối ưu hiệu quả quảng cáo & CPL cho chiến dịch ${c.campaignName}`,
            websiteId: scope.websiteId !== 'all' ? scope.websiteId : domain,
            websiteDomain: domain,
            campaignId: c.campaignId,
            campaignName: c.campaignName,
            targetChannel: 'Google Ads Display / Search Landing',
            outputFormat: 'Banner 16:9 (1536×1024 px)',
            outputWidthPx: 1536,
            outputHeightPx: 1024,
            headlineText: `${c.campaignName} · Giải pháp LED Toàn Trung`,
            ctaText: 'Nhận báo giá ngay',
            baselineSnapshot: data
              ? {
                capturedAt: new Date().toISOString(),
                sourceModule: 'tracking',
                scopeLabel: `${c.campaignName} (${data.scope.startDate} → ${data.scope.endDate})`,
                dateFrom: data.scope.startDate,
                dateTo: data.scope.endDate,
                websiteId: scope.websiteId || 'all',
                websiteDomain: domain,
                campaignId: c.campaignId,
                campaignName: c.campaignName,
                metrics: {
                  adCost: c.cost,
                  receivedLeadCount: c.attributedLeadCount,
                  validLeadCount: c.validAttributedLeadCount,
                  costPerValidAdLead: c.costPerValidLead,
                  wonLeadCount: c.wonAttributedLeadCount,
                },
              }
              : null,
          },
        },
      });
      setBriefNotice(
        res.message || `Đã gửi Brief thiết kế #${res.projectId} cho chiến dịch "${c.campaignName}" sang Studio.`,
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể gửi Brief thiết kế.');
    } finally {
      setBriefSubmittingId(null);
    }
  };

  const apiPath = useMemo(
    () => buildM02ApiPath(scope, page, adsPage),
    [scope, page, adsPage],
  );

  const [data, setData] = useState<M02TrafficInteractionDto | null>(() =>
    peekApiCache<M02TrafficInteractionDto>(apiPath),
  );
  const [knownWebsites, setKnownWebsites] = useState<WebsiteConfigItemDto[]>(
    () => peekApiCache<M02TrafficInteractionDto>(apiPath)?.coverage.availableWebsites || [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !peekApiCache<M02TrafficInteractionDto>(apiPath),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setAdsPage(1);
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  useEffect(() => {
    const cached = peekApiCache<M02TrafficInteractionDto>(apiPath);
    if (cached) {
      setData(cached);
      if (cached.coverage.availableWebsites?.length) {
        setKnownWebsites(cached.coverage.availableWebsites);
      }
      setLoading(false);
    } else {
      setData(null);
      setLoading(true);
    }
  }, [apiPath]);

  const loadData = useCallback(
    async (opts?: { manual?: boolean; signal?: AbortSignal }) => {
      if (opts?.manual) setRefreshing(true);
      setErrorMsg(null);
      try {
        const res = await apiRequest<M02TrafficInteractionDto>(apiPath, {
          signal: opts?.signal,
          skipCache: Boolean(opts?.manual),
        });
        if (opts?.signal?.aborted) return;
        setData(res);
        if (res.coverage.availableWebsites?.length) {
          setKnownWebsites(res.coverage.availableWebsites);
        }
        // Tự động làm mới lại sau 2s nếu request đầu tiên rơi vào lúc cache GA4 đang warm sau 00:00
        if (
          !opts?.manual &&
          (res.metrics.sessions ?? 0) > 0 &&
          res.metrics.users === null &&
          res.metrics.engagementRatePct === null
        ) {
          window.setTimeout(() => {
            if (!opts?.signal?.aborted) {
              void apiRequest<M02TrafficInteractionDto>(apiPath, {
                skipCache: true,
                signal: opts?.signal,
              })
                .then((freshRes) => {
                  if (!opts?.signal?.aborted) setData(freshRes);
                })
                .catch(() => {});
            }
          }, 2000);
        }
      } catch (err) {
        if (opts?.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        setErrorMsg(err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError);
      } finally {
        if (!opts?.signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [apiPath],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

    const controller = new AbortController();
    void loadData({ signal: controller.signal });

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadData();
      }
    }, 60_000);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [hydrated, scope.preset, scope.from, scope.to, loadData]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', onSearch as EventListener);
    return () => window.removeEventListener('tt-global-search', onSearch as EventListener);
  }, []);

  const m = data?.metrics;
  const ads = data?.ads;
  const adsConnected = ads?.status === 'CONNECTED';
  const adsFallbackText = adsConnected
    ? UI_VOCABULARY.fallbacks.insufficientData
    : UI_VOCABULARY.fallbacks.unconnected;

  const sessionComp = useMemo(() => {
    if (!m) return null;
    return formatSafePeriodComparison(m.sessions, m.previousSessions);
  }, [m]);

  const trafficPoints = data?.charts.trafficSeries || [];
  const maxTrafficPlotVal = useMemo(() => {
    let maxVal = 4;
    for (const pt of trafficPoints) {
      maxVal = Math.max(maxVal, pt.sessions ?? 0, pt.pageViews ?? 0);
    }
    return Math.ceil(maxVal / 2) * 2;
  }, [trafficPoints]);

  const channelRows = data?.charts.channelRows || [];
  const maxChannelSessions = useMemo(
    () => Math.max(1, ...channelRows.map((c) => c.sessions)),
    [channelRows],
  );

  const lpTable = data?.tables.landingPageRows;
  const lpTotalPages = lpTable ? Math.max(1, Math.ceil(lpTable.totalRows / lpTable.pageSize)) : 1;

  const adsSeries = ads?.series || [];
  const maxAdCost = useMemo(
    () => Math.max(1, ...adsSeries.map((s) => s.cost ?? 0)),
    [adsSeries],
  );
  const maxAdConv = useMemo(
    () => Math.max(1, ...adsSeries.map((s) => s.conversions ?? 0)),
    [adsSeries],
  );

  const campTable = ads?.campaigns;
  const campTotalPages = campTable
    ? Math.max(1, Math.ceil(campTable.totalRows / campTable.pageSize))
    : 1;

  return (
    <div className="space-y-4 text-sm">
      {/* Thanh ngữ cảnh dùng chung */}
      <WebsiteDashboardHeader
        title={UI_VOCABULARY.menu.campaigns}
        subtitle={
          data
            ? `Traffic và quảng cáo nào đang có hiệu quả? · ${data.scope.startDate} → ${data.scope.endDate}`
            : 'Traffic và quảng cáo nào đang có hiệu quả?'
        }
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || knownWebsites}
        comparisonLabel={sessionComp && sessionComp.pctChange !== null ? sessionComp.label : null}
        freshnessMessage={
          refreshing
            ? UI_VOCABULARY.freshness.updating
            : errorMsg
              ? UI_VOCABULARY.fallbacks.loadError
              : data?.freshness.statusMessage
        }
        freshnessTone={
          errorMsg
            ? 'error'
            : refreshing
              ? 'updating'
              : data?.freshness.state === 'PRELIMINARY'
                ? 'warning'
                : 'ok'
        }
        onChangeScope={updateScope}
        actions={
          <>
            <a
              href={`/api/v1/tracking/export?websiteId=${encodeURIComponent(scope.websiteId)}&preset=${encodeURIComponent(scope.preset)}${scope.preset === 'CUSTOM' && scope.from && scope.to
                ? `&from=${encodeURIComponent(scope.from)}&to=${encodeURIComponent(scope.to)}`
                : ''
                }`}
              className="min-h-9 px-3 rounded-[10px] bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Download aria-hidden="true" className="w-3.5 h-3.5" />
              <span>{UI_VOCABULARY.actions.exportExcel}</span>
            </a>
            <button
              type="button"
              onClick={() => void loadData({ manual: true })}
              disabled={refreshing}
              className="min-h-9 px-3.5 rounded-[10px] bg-[#0F275C] hover:bg-[#1E3A8A] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-60"
            >
              <RefreshCw aria-hidden="true" className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{UI_VOCABULARY.actions.refresh}</span>
            </button>
          </>
        }
      />

      {briefNotice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-800 flex items-center justify-between gap-2">
          <span>{briefNotice}</span>
          <button
            type="button"
            onClick={() => setBriefNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-semibold"
          >
            Đóng
          </button>
        </div>
      )}

      {errorMsg && (
        <div
          role="alert"
          className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-center justify-between"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => void loadData({ manual: true })}
            className="font-semibold underline"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* 2 Tab nghiệp vụ chính: "Truy cập" và "Quảng cáo" (không dùng tên API kỹ thuật) */}
      <div className="bg-white border border-slate-200/90 rounded-[12px] px-4 pt-1 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div
          role="tablist"
          aria-label="Phân mục Chiến dịch"
          className="flex items-center gap-1 overflow-x-auto"
        >
          <button
            type="button"
            role="tab"
            id="m02-tab-traffic"
            aria-selected={businessTab === 'traffic'}
            onClick={() => setBusinessTab('traffic')}
            className="relative flex-none inline-flex items-center gap-2 min-h-11 px-4 py-2.5 text-sm font-semibold text-slate-600 aria-selected:text-[#0F275C] aria-selected:after:content-[''] aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:border-b-[3px] aria-selected:after:border-[#0F275C] focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
          >
            <span>Truy cập</span>
          </button>
          <button
            type="button"
            role="tab"
            id="m02-tab-ads"
            aria-selected={businessTab === 'ads'}
            onClick={() => setBusinessTab('ads')}
            className="relative flex-none inline-flex items-center gap-2 min-h-11 px-4 py-2.5 text-sm font-semibold text-slate-600 aria-selected:text-[#0F275C] aria-selected:after:content-[''] aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:border-b-[3px] aria-selected:after:border-[#0F275C] focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
          >
            <span>Quảng cáo</span>
            {!adsConnected && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-medium">
                {UI_VOCABULARY.fallbacks.unconnected}
              </span>
            )}
          </button>
        </div>

        {/* Ô phụ bộ đếm 30 phút có nhãn cửa sổ rõ ràng, tách biệt khỏi bộ lọc lịch sử (C07 & C10) */}
        <div className="py-2 flex items-center gap-2 text-xs text-slate-600">
          <Activity aria-hidden="true" className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span>Đang hoạt động (cửa sổ 30 phút hiện tại):</span>
          <strong className="text-slate-900 font-bold tabular-nums">
            <AnimatedMetricNumber
              value={m?.activeUsers30m}
              emptyText={UI_VOCABULARY.fallbacks.insufficientData}
            />
          </strong>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            (Tách khỏi bộ lọc lịch sử)
          </span>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* TAB 1: TRUY CẬP                                                       */}
      {/* ===================================================================== */}
      <div
        role="tabpanel"
        aria-labelledby="m02-tab-traffic"
        hidden={businessTab !== 'traffic'}
        className="space-y-4"
      >
        {data?.coverage.note && (
          <div className="rounded-[10px] bg-blue-50/70 border border-blue-200/80 px-3.5 py-2 text-xs text-slate-700">
            {data.coverage.note}
          </div>
        )}

        {/* 6 KPI Truy cập (~108px) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Người dùng</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={m?.users}
                emptyText={
                  scope.websiteId === 'all'
                    ? 'Chọn 1 website'
                    : UI_VOCABULARY.fallbacks.insufficientData
                }
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              {scope.websiteId === 'all'
                ? 'Không cộng gộp người dùng duy nhất giữa nhiều GA4 property'
                : `Người dùng mới: ${m?.newUsers !== null && m?.newUsers !== undefined
                  ? m.newUsers.toLocaleString('vi-VN')
                  : UI_VOCABULARY.fallbacks.insufficientData
                }`}
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Phiên truy cập</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber value={m?.sessions} />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              Phiên có tương tác:{' '}
              <strong className="text-slate-700 tabular-nums">
                {m?.engagedSessions !== null && m?.engagedSessions !== undefined
                  ? m.engagedSessions.toLocaleString('vi-VN')
                  : UI_VOCABULARY.fallbacks.insufficientData}
              </strong>
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Lượt xem trang</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber value={m?.pageViews} />
            </div>
            <span className="text-xs text-slate-500 mt-1">Tổng lượt xem màn hình/trang trong kỳ</span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Tỷ lệ tương tác</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={m?.engagementRatePct}
                format={(v) => `${v.toFixed(1)}%`}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">Phiên có tương tác / tổng phiên</span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">
              Thời gian tương tác/người dùng hoạt động
            </span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={m?.averageEngagementSeconds}
                format={(v) => `${v.toFixed(0)} giây`}
                emptyText={
                  scope.websiteId === 'all'
                    ? 'Chọn 1 website'
                    : UI_VOCABULARY.fallbacks.insufficientData
                }
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              Tổng thời lượng tương tác / người dùng hoạt động
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Yêu cầu biểu mẫu ghi nhận</span>
            <div className="text-2xl font-bold text-[#0F275C] mt-1">
              <AnimatedMetricNumber
                value={
                  m?.formEventCount !== null && m?.formEventCount !== undefined
                    ? m.formEventCount
                    : m?.validFormLeadCount
                }
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              {m?.formEventCount !== null && m?.formEventCount !== undefined
                ? `Sự kiện form tracking · Đối soát CRM: ${m.validFormLeadCount} Lead hợp lệ`
                : `Chưa cài event form GA4 · CRM ghi nhận ${m?.validFormLeadCount ?? 0} Lead form hợp lệ`}
            </span>
          </div>
        </div>

        {/* Biểu đồ Marketing Spline 8/12 + Cơ cấu Kênh thu hút 4/12 */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* 8/12: Biểu đồ xu hướng Phiên truy cập, Lượt xem & Chiều sâu tương tác */}
          <section
            aria-labelledby="m02-traffic-chart-heading"
            className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col justify-between"
          >
            <div className="mb-3">
              <h2 id="m02-traffic-chart-heading" className="text-sm sm:text-base font-bold text-slate-900">
                Xu hướng thu hút Lưu lượng &amp; Tương tác chiến dịch theo ngày
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đối chiếu nhịp độ Phiên truy cập, Lượt xem trang và Chiều sâu đọc nội dung (Trang/Phiên) phục vụ tối ưu Marketing
              </p>
            </div>

            <MarketingTrafficChart points={trafficPoints} loading={loading && !data} />
          </section>

          {/* 4/12: Cơ cấu kênh Marketing & Tỷ lệ chuyển đổi Lead */}
          <section
            aria-labelledby="m02-top-channels-heading"
            className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs flex flex-col justify-between"
          >
            <div>
              <h2 id="m02-top-channels-heading" className="text-sm sm:text-base font-bold text-slate-900">
                Cơ cấu Kênh Marketing &amp; Thu hút Lead
              </h2>
              <p className="text-xs text-slate-500 mt-0.5 mb-3">
                Tỷ trọng đóng góp phiên, tỷ lệ tương tác và số Lead hợp lệ theo từng nguồn
              </p>
              <MarketingChannelMixCard channels={channelRows} />
            </div>
          </section>
        </div>

        {/* Bảng dưới: Tab Kênh / Trang vào / Hành động */}
        <section className="bg-white border border-slate-200/90 rounded-[12px] shadow-2xs overflow-hidden">
          <div className="px-4 pt-2 border-b border-slate-200 flex items-center justify-between gap-2">
            <div
              role="tablist"
              aria-label="Chi tiết truy cập theo chiều phân tích"
              className="flex items-center gap-1 overflow-x-auto"
            >
              {[
                { id: 'channels' as const, label: 'Kênh' },
                { id: 'landing_pages' as const, label: 'Trang vào' },
                { id: 'actions' as const, label: 'Hành động' },
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  role="tab"
                  id={`m02-subtab-${st.id}`}
                  aria-selected={trafficSubTab === st.id}
                  onClick={() => setTrafficSubTab(st.id)}
                  className="relative flex-none min-h-10 px-3.5 py-2 text-xs font-semibold text-slate-600 aria-selected:text-[#0F275C] aria-selected:after:content-[''] aria-selected:after:absolute aria-selected:after:inset-x-0 aria-selected:after:bottom-0 aria-selected:after:border-b-[3px] aria-selected:after:border-[#0F275C]"
                >
                  {st.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-panel 1: Kênh */}
          <div
            role="tabpanel"
            aria-labelledby="m02-subtab-channels"
            hidden={trafficSubTab !== 'channels'}
          >
            <div tabIndex={0} role="region" aria-label="Bảng theo kênh" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Kênh marketing</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold">Nguồn / phương thức</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Phiên truy cập</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Phiên có tương tác</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Tỷ lệ tương tác</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Sự kiện biểu mẫu</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Lead CRM hợp lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {channelRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-slate-500">
                        Chưa có dữ liệu kênh trong kỳ đang chọn.
                      </td>
                    </tr>
                  ) : (
                    channelRows
                      .filter(
                        (r) => !searchTerm || r.channelLabel.toLowerCase().includes(searchTerm),
                      )
                      .map((r) => (
                        <tr key={r.channelKey} className="hover:bg-slate-50/70">
                          <th scope="row" className="py-3 px-4 font-semibold text-slate-900">
                            {r.channelLabel}
                          </th>
                          <td className="py-3 px-3 text-slate-600">
                            {r.source || '—'} / {r.medium || '—'}
                          </td>
                          <td className="py-3 px-3 text-right font-semibold tabular-nums">
                            {r.sessions.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 tabular-nums">
                            {r.engagedSessions !== null
                              ? r.engagedSessions.toLocaleString('vi-VN')
                              : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 tabular-nums">
                            {r.engagementRatePct !== null ? `${r.engagementRatePct}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 tabular-nums">
                            {r.formEvents !== null && r.formEvents !== undefined
                              ? r.formEvents.toLocaleString('vi-VN')
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#0F275C] tabular-nums">
                            {r.validLeadCount}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sub-panel 2: Trang vào */}
          <div
            role="tabpanel"
            aria-labelledby="m02-subtab-landing_pages"
            hidden={trafficSubTab !== 'landing_pages'}
          >
            <div tabIndex={0} role="region" aria-label="Bảng trang vào" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Trang vào đầu tiên</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Phiên truy cập</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Tỷ lệ tương tác</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Sự kiện biểu mẫu</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold text-right">Lead CRM hợp lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(lpTable?.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-500">
                        Chưa có dữ liệu trang vào trong kỳ đang chọn.
                      </td>
                    </tr>
                  ) : (
                    (lpTable?.rows || [])
                      .filter(
                        (row) => !searchTerm || row.landingPage.toLowerCase().includes(searchTerm),
                      )
                      .map((row) => (
                        <tr key={row.landingPage} className="hover:bg-slate-50/70">
                          <th
                            scope="row"
                            className="py-3 px-4 font-mono font-medium text-slate-800 max-w-[420px] break-words"
                          >
                            {row.landingPage}
                          </th>
                          <td className="py-3 px-3 text-right font-semibold tabular-nums">
                            {row.sessions.toLocaleString('vi-VN')}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 tabular-nums">
                            {row.engagementRatePct !== null ? `${row.engagementRatePct}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-right text-slate-600 tabular-nums">
                            {row.successfulFormCount !== null
                              ? row.successfulFormCount.toLocaleString('vi-VN')
                              : '—'}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-[#0F275C] tabular-nums">
                            {row.validLeadCount}
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>

            {lpTotalPages > 1 && (
              <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <span>
                  Trang <strong className="tabular-nums">{page}</strong> /{' '}
                  <strong className="tabular-nums">{lpTotalPages}</strong> ({lpTable?.totalRows || 0}{' '}
                  trang)
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                  >
                    Trang trước
                  </button>
                  <button
                    type="button"
                    disabled={page >= lpTotalPages}
                    onClick={() => setPage((p) => Math.min(lpTotalPages, p + 1))}
                    className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                  >
                    Trang sau
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sub-panel 3: Hành động (ghi đúng ý nghĩa từng event, chưa cài thì ghi rõ thiếu tracking) */}
          <div
            role="tabpanel"
            aria-labelledby="m02-subtab-actions"
            hidden={trafficSubTab !== 'actions'}
          >
            <div tabIndex={0} role="region" aria-label="Bảng hành động tương tác" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Hành động</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold">Tên sự kiện kỹ thuật</th>
                    <th scope="col" className="py-2.5 px-3 font-semibold text-right">Số lượt ghi nhận</th>
                    <th scope="col" className="py-2.5 px-4 font-semibold">Ý nghĩa &amp; phạm vi đo lường</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.tables.interactionRows || []).map((row) => (
                    <tr key={row.actionKey} className="hover:bg-slate-50/70">
                      <th scope="row" className="py-3 px-4 font-semibold text-slate-900">
                        {row.actionLabel}
                      </th>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {row.mappedEventName || 'Chưa cài đặt event'}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums">
                        {row.count !== null ? (
                          row.count.toLocaleString('vi-VN')
                        ) : (
                          <span className="text-amber-700 font-medium">Thiếu tracking</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      {/* ===================================================================== */}
      {/* TAB 2: QUẢNG CÁO                                                      */}
      {/* ===================================================================== */}
      <div
        role="tabpanel"
        aria-labelledby="m02-tab-ads"
        hidden={businessTab !== 'ads'}
        className="space-y-4"
      >
        {ads && (
          <div
            className={`rounded-[12px] border px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2 ${ads.status === 'CONNECTED'
              ? 'bg-blue-50/70 border-blue-200 text-slate-800'
              : 'bg-amber-50/80 border-amber-200 text-amber-900'
              }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">{ads.statusMessage}</p>
                <p className="mt-0.5 text-slate-600">{ads.metrics.reconciliationNote}</p>
              </div>
            </div>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 font-semibold text-[#1E3A8A] hover:underline shrink-0"
            >
              <span>Kiểm tra kết nối</span>
              <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* 6 KPI Quảng cáo (~108px) + dải đối soát CPL CRM */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Chi phí quảng cáo</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={ads?.metrics.cost}
                format={(v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`}
                emptyText={adsFallbackText}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              Chi tiêu thực tế chuẩn hóa từ spend_micros ({ads?.currencyCode || 'VND'})
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Hiển thị</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={ads?.metrics.impressions}
                emptyText={adsFallbackText}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">Tổng lượt hiển thị chiến dịch</span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Click</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber value={ads?.metrics.clicks} emptyText={adsFallbackText} />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              CPC trung bình:{' '}
              <strong className="text-slate-700 tabular-nums">
                {ads?.metrics.avgCpc !== null && ads?.metrics.avgCpc !== undefined
                  ? `${ads.metrics.avgCpc.toLocaleString('vi-VN')} ₫`
                  : adsFallbackText}
              </strong>
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">CTR</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={ads?.metrics.ctrPct}
                format={(v) => `${v.toFixed(2)}%`}
                emptyText={adsFallbackText}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">Tổng click / tổng hiển thị</span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Chuyển đổi quảng cáo</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={ads?.metrics.conversions}
                format={(v) =>
                  Number.isInteger(v) ? v.toLocaleString('vi-VN') : v.toFixed(2)
                }
                emptyText={adsFallbackText}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              Theo nền tảng báo cáo (giữ phần thập phân nếu Data-Driven)
            </span>
          </div>

          <div className="min-h-[108px] bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
            <span className="text-xs font-medium text-slate-600">Chi phí / chuyển đổi</span>
            <div className="text-2xl font-bold text-slate-900 mt-1">
              <AnimatedMetricNumber
                value={ads?.metrics.costPerConversion}
                format={(v) => `${Math.round(v).toLocaleString('vi-VN')} ₫`}
                emptyText={adsFallbackText}
              />
            </div>
            <span className="text-xs text-slate-500 mt-1">
              CPL Lead CRM hợp lệ:{' '}
              <strong className="text-[#0F275C] tabular-nums">
                {ads?.metrics.costPerValidLead !== null &&
                  ads?.metrics.costPerValidLead !== undefined
                  ? `${ads.metrics.costPerValidLead.toLocaleString('vi-VN')} ₫`
                  : UI_VOCABULARY.fallbacks.insufficientData}
              </strong>
            </span>
          </div>
        </div>

        {/* Ô bổ sung đối soát CRM (C07: tách biệt chuyển đổi quảng cáo với Lead CRM thực tế) */}
        <div className="rounded-[12px] bg-white border border-slate-200/90 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Lead có bằng chứng quảng cáo (GCLID/UTM):{' '}
              <strong className="text-slate-900 tabular-nums">
                {ads?.metrics.attributedLeadCount ?? 0}
              </strong>
            </span>
            <span>
              Lead quảng cáo hợp lệ (L2):{' '}
              <strong className="text-[#0F275C] tabular-nums">
                {ads?.metrics.validAttributedLeadCount ?? 0}
              </strong>
            </span>
            <span>
              Chốt thành công từ quảng cáo:{' '}
              <strong className="text-emerald-700 tabular-nums">
                {ads?.metrics.wonAttributedLeadCount ?? 0}
              </strong>
            </span>
          </div>
          <Link
            href={`/leads?websiteId=${encodeURIComponent(scope.websiteId)}`}
            className="text-[#1E3A8A] font-semibold hover:underline"
          >
            Đối chiếu danh sách Lead →
          </Link>
        </div>

        {/* Biểu đồ tách 2 plot chung trục thời gian có đơn vị rõ ràng (C07): Chi phí (VNĐ) & Chuyển đổi quảng cáo */}
        <section
          aria-labelledby="m02-ads-chart-heading"
          className="bg-white border border-slate-200/90 rounded-[12px] p-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h2 id="m02-ads-chart-heading" className="text-sm font-bold text-slate-900">
                Diễn biến chi phí và chuyển đổi quảng cáo theo ngày
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hai biểu đồ tách riêng thang đo cùng trục ngày: Chi phí (đơn vị: VNĐ) và Chuyển đổi quảng cáo (đơn vị: Lượt)
              </p>
            </div>
          </div>

          {!adsConnected ? (
            <div className="h-[240px] rounded-[10px] bg-slate-50 border border-dashed border-slate-200 grid place-items-center text-xs text-slate-500 px-4 text-center">
              Chưa kết nối tài khoản Google Ads API nên không vẽ biểu đồ chi phí/chuyển đổi giả.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Plot 1: Chi phí (VNĐ) */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Chi phí thực tế (Đơn vị: VNĐ · Đỉnh kỳ: {maxAdCost.toLocaleString('vi-VN')} ₫)
                </div>
                <div className="h-[110px] border-l border-b border-slate-200 flex items-end justify-between gap-1 px-1.5">
                  {adsSeries.map((pt) => {
                    const c = pt.cost ?? 0;
                    const hPct = c > 0 ? Math.max(4, (c / maxAdCost) * 100) : 0;
                    return (
                      <div key={pt.date} className="flex-1 h-full flex items-end justify-center">
                        {hPct > 0 && (
                          <div
                            title={`${pt.date}: ${c.toLocaleString('vi-VN')} ₫`}
                            style={{ height: `${Math.min(100, hPct)}%` }}
                            className="w-full max-w-[22px] rounded-t-[3px] bg-[#1E3A8A]"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Plot 2: Chuyển đổi quảng cáo */}
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">
                  Chuyển đổi quảng cáo (Đơn vị: Lượt · Đỉnh kỳ: {maxAdConv})
                </div>
                <div className="h-[100px] border-l border-b border-slate-200 flex items-end justify-between gap-1 px-1.5">
                  {adsSeries.map((pt) => {
                    const cv = pt.conversions ?? 0;
                    const hPct = cv > 0 ? Math.max(4, (cv / maxAdConv) * 100) : 0;
                    return (
                      <div key={pt.date} className="flex-1 h-full flex items-end justify-center">
                        {hPct > 0 && (
                          <div
                            title={`${pt.date}: ${cv} chuyển đổi`}
                            style={{ height: `${Math.min(100, hPct)}%` }}
                            className="w-full max-w-[22px] rounded-t-[3px] bg-emerald-500"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="h-6 flex items-center justify-between gap-1 px-1.5 pt-1">
                  {adsSeries.map((pt, idx) => {
                    const [, mm, dd] = pt.date.split('-');
                    const show =
                      adsSeries.length <= 12 ||
                      idx === 0 ||
                      idx === adsSeries.length - 1 ||
                      idx % Math.ceil(adsSeries.length / 8) === 0;
                    return (
                      <div key={pt.date} className="flex-1 text-center min-w-0">
                        {show && (
                          <span className="text-[11px] text-slate-500 tabular-nums">
                            {dd}/{mm}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Bảng chiến dịch phân trang + mở Drawer chi tiết nhóm quảng cáo / từ khóa / thiết bị / khu vực */}
        <section className="bg-white border border-slate-200/90 rounded-[12px] shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900">Danh sách chiến dịch quảng cáo</h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {campTable?.totalRows || 0} chiến dịch
            </span>
          </div>

          <div tabIndex={0} role="region" aria-label="Bảng chiến dịch quảng cáo" className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left border-collapse text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th scope="col" className="py-2.5 px-4 font-semibold">Chiến dịch</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Trạng thái</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Chi phí</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Hiển thị</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Click</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">CTR</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">CPC</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Chuyển đổi QC</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">Lead CRM hợp lệ</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold text-right">CPL thực tế</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(campTable?.rows || []).length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-10 px-4 text-center text-slate-500">
                      {adsConnected
                        ? 'Chưa có chiến dịch phát sinh số liệu trong phạm vi đang chọn.'
                        : 'Chưa kết nối tài khoản Google Ads API — hệ thống không tạo chiến dịch hoặc chi phí mẫu.'}
                    </td>
                  </tr>
                ) : (
                  (campTable?.rows || []).map((c) => (
                    <tr key={c.campaignId} className="hover:bg-slate-50/70">
                      <th scope="row" className="py-3 px-4 font-semibold text-slate-900">
                        <div>{c.campaignName}</div>
                        <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                          {c.attributionNote}
                        </div>
                      </th>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                          {c.status === 'ENABLED' ? 'Đang chạy' : 'Tạm dừng'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums">
                        {c.cost.toLocaleString('vi-VN')} ₫
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {c.impressions.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {c.clicks.toLocaleString('vi-VN')}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {c.ctrPct !== null ? `${c.ctrPct}%` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {c.avgCpc !== null ? `${c.avgCpc.toLocaleString('vi-VN')} ₫` : '—'}
                      </td>
                      <td className="py-3 px-3 text-right tabular-nums">
                        {Number.isInteger(c.conversions)
                          ? c.conversions.toLocaleString('vi-VN')
                          : c.conversions.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-[#0F275C] tabular-nums">
                        {c.validAttributedLeadCount}
                      </td>
                      <td className="py-3 px-3 text-right font-semibold tabular-nums">
                        {c.costPerValidLead !== null
                          ? `${c.costPerValidLead.toLocaleString('vi-VN')} ₫`
                          : 'Chưa đủ đối soát'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canDirectDesign ? (
                            <Link
                              href={`/design?fromBrief=1&taskCode=banner_generate&sourceModule=tracking&websiteId=${encodeURIComponent(scope.websiteId || 'all')}&campaignId=${encodeURIComponent(c.campaignId)}&campaignName=${encodeURIComponent(c.campaignName)}${data ? `&dateFrom=${encodeURIComponent(data.scope.startDate)}&dateTo=${encodeURIComponent(data.scope.endDate)}` : ''}`}
                              className="min-h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#1E3A8A] font-semibold inline-flex items-center"
                              title="Mở Brief thiết kế gắn chiến dịch & phạm vi ngày đang xem"
                            >
                              Tạo brief
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled={briefSubmittingId === c.campaignId}
                              onClick={() => void handleCreateCampaignBrief(c)}
                              className="min-h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#1E3A8A] font-semibold inline-flex items-center disabled:opacity-50"
                              title="Gửi Brief thiết kế gắn chiến dịch sang Studio cho Designer xử lý"
                            >
                              {briefSubmittingId === c.campaignId ? 'Đang gửi...' : 'Tạo brief'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDrawerCampaign(c)}
                            className="min-h-8 px-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#1E3A8A] font-semibold"
                          >
                            {UI_VOCABULARY.actions.viewDetails}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {campTotalPages > 1 && (
            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                Trang <strong className="tabular-nums">{adsPage}</strong> /{' '}
                <strong className="tabular-nums">{campTotalPages}</strong>
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={adsPage <= 1}
                  onClick={() => setAdsPage((p) => Math.max(1, p - 1))}
                  className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                >
                  Trang trước
                </button>
                <button
                  type="button"
                  disabled={adsPage >= campTotalPages}
                  onClick={() => setAdsPage((p) => Math.min(campTotalPages, p + 1))}
                  className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white disabled:opacity-40 font-semibold"
                >
                  Trang sau
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Drawer chi tiết chiến dịch (Ad group / Keyword / Thiết bị / Khu vực) */}
      {drawerCampaign && (
        <div className="fixed inset-0 z-50 bg-slate-900/45 backdrop-blur-xs flex justify-end">
          <div
            role="dialog"
            aria-label={`Chi tiết chiến dịch ${drawerCampaign.campaignName}`}
            className="w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {drawerCampaign.campaignName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">{drawerCampaign.attributionNote}</p>
              </div>
              <button
                type="button"
                aria-label="Đóng ngăn chi tiết"
                onClick={() => setDrawerCampaign(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
              >
                <X aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
                  <div className="text-slate-500">Chi phí thực tế</div>
                  <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                    {drawerCampaign.cost.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
                  <div className="text-slate-500">Lead CRM hợp lệ</div>
                  <div className="text-base font-bold text-[#0F275C] mt-1 tabular-nums">
                    {drawerCampaign.validAttributedLeadCount}
                  </div>
                </div>
                <div className="rounded-[10px] bg-slate-50 border border-slate-200 p-3">
                  <div className="text-slate-500">CPL thực tế</div>
                  <div className="text-base font-bold text-slate-900 mt-1 tabular-nums">
                    {drawerCampaign.costPerValidLead !== null
                      ? `${drawerCampaign.costPerValidLead.toLocaleString('vi-VN')} ₫`
                      : 'Chưa đủ đối soát'}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="font-bold text-slate-900 mb-2 flex items-center gap-1.5">
                  <Layers aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                  Nhóm quảng cáo &amp; từ khóa
                </h3>
                {(ads?.breakdowns.adGroups || []).filter(
                  (ag) => ag.campaignName === drawerCampaign.campaignName,
                ).length === 0 ? (
                  <p className="text-slate-500 bg-slate-50 border border-slate-200 rounded-[10px] p-3">
                    {ads?.breakdowns.keywordAvailabilityNote ||
                      'Nguồn hiện chưa trả dữ liệu phân rã nhóm quảng cáo / từ khóa / thiết bị / khu vực cho chiến dịch này.'}
                  </p>
                ) : (
                  <ul role="list" className="space-y-2">
                    {(ads?.breakdowns.adGroups || [])
                      .filter((ag) => ag.campaignName === drawerCampaign.campaignName)
                      .map((ag) => (
                        <li
                          key={ag.adGroupId}
                          className="rounded-[10px] border border-slate-200 p-3 flex items-center justify-between"
                        >
                          <span className="font-semibold text-slate-800">{ag.adGroupName}</span>
                          <span className="tabular-nums text-slate-600">
                            {ag.clicks} click · {ag.cost.toLocaleString('vi-VN')} ₫
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
