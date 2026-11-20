'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  ExternalLink,
  FilePlus2,
  Globe,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import {
  SEO_ARTICLE_STATUS_LABELS,
  UI_VOCABULARY,
  formatSafePeriodComparison,
  type M03AdsSeoDashboardDto,
  type SeoArticleStatus,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import { apiRequest, invalidateApiCacheByDomains, peekApiCacheEntry } from '@/core/http/client';
import { subscribeDataSync } from '@/core/http/data-sync-bus';
import { loadRouteState, saveRouteState } from '@/core/http/route-state';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';

const StockAreaChart = dynamic(
  () => import('@/components/common/StockAreaChart').then((m) => m.StockAreaChart),
  {
    ssr: false,
    loading: () => <div className="h-[265px] rounded-xl bg-slate-50 animate-pulse" />,
  },
);

const SeoAiReportPanel = dynamic(
  () => import('./SeoAiReportPanel').then((m) => m.SeoAiReportPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-2xl bg-white p-8 border border-slate-200 shadow-lg text-xs text-slate-500">
        Đang mở trình phân tích SEO AI...
      </div>
    ),
  },
);

type SeoWorkspaceTab = 'queries' | 'pages' | 'content' | 'trends';
type SeoChartMetric = 'clicks' | 'impressions';

function buildM03ApiPath(
  scope: { websiteId: string; preset: string; from: string; to: string },
  page: number,
  contentPage: number,
  minImpr: number,
  maxCtr: number,
): string {
  const qs = new URLSearchParams({
    view: 'spec',
    websiteId: scope.websiteId || 'all',
    preset: scope.preset || '7D',
    page: String(page),
    pageSize: '20',
    contentPage: String(contentPage),
    minImpr: String(minImpr),
    maxCtr: String(maxCtr),
  });
  if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
    qs.set('from', scope.from);
    qs.set('to', scope.to);
  }
  return `/api/v1/ads?${qs.toString()}`;
}

function formatWorkflowStatus(raw: string): string {
  const upper = raw.toUpperCase() as SeoArticleStatus;
  if (upper in SEO_ARTICLE_STATUS_LABELS) {
    return SEO_ARTICLE_STATUS_LABELS[upper];
  }
  if (raw === 'published') return 'Đã đăng';
  if (raw === 'approved_scheduled') return 'Đã duyệt - chờ đăng';
  return 'Bản nháp';
}

export function SeoKeywordsWorkspace() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();
  const canEditContent = user?.roleCode !== 'ADS';

  const [activeTab, setActiveTab] = useState<SeoWorkspaceTab>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'queries' || t === 'pages' || t === 'content' || t === 'trends') return t;
      const saved = loadRouteState<{ activeTab?: SeoWorkspaceTab }>('ads');
      if (saved?.activeTab) return saved.activeTab;
    }
    return 'queries';
  });
  const [chartMetric, setChartMetric] = useState<SeoChartMetric>(
    () => loadRouteState<{ chartMetric?: SeoChartMetric }>('ads')?.chartMetric || 'clicks',
  );
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showUrlInspect, setShowUrlInspect] = useState(false);
  const [showCreateContentForm, setShowCreateContentForm] = useState(false);

  const [queriesPage, setQueriesPage] = useState(
    () => loadRouteState<{ queriesPage?: number }>('ads')?.queriesPage || 1,
  );
  const [pagesPage, setPagesPage] = useState(
    () => loadRouteState<{ pagesPage?: number }>('ads')?.pagesPage || 1,
  );
  const [contentPage, setContentPage] = useState(
    () => loadRouteState<{ contentPage?: number }>('ads')?.contentPage || 1,
  );
  const [searchTerm, setSearchTerm] = useState('');

  // Ngưỡng gợi ý cơ hội cấu hình được (không hardcode cố định)
  const [draftMinImpr, setDraftMinImpr] = useState('30');
  const [draftMaxCtr, setDraftMaxCtr] = useState('3');
  const [appliedMinImpr, setAppliedMinImpr] = useState(30);
  const [appliedMaxCtr, setAppliedMaxCtr] = useState(3);

  // Form thêm bài vào kế hoạch nội dung
  const [newKeywordText, setNewKeywordText] = useState('');
  const [newTargetWebsite, setNewTargetWebsite] = useState<'toantrung.com.vn' | 'bangled.vn' | 'manhinhled.net.vn'>('toantrung.com.vn');
  const [newTopicFocus, setNewTopicFocus] = useState('');
  const [creatingContent, setCreatingContent] = useState(false);
  const [contentStatusMsg, setContentStatusMsg] = useState<string | null>(null);

  // Tương tác trực tiếp Google Trends & Google Suggest VN trong tab Xu hướng
  const [trendLookupInput, setTrendLookupInput] = useState('');
  const [trendLookupBusy, setTrendLookupBusy] = useState(false);
  const [trendLookupResults, setTrendLookupResults] = useState<string[] | null>(null);
  const [showSerpKeyForm, setShowSerpKeyForm] = useState(false);
  const [serpApiKeyInput, setSerpApiKeyInput] = useState('');
  const [savingSerpKey, setSavingSerpKey] = useState(false);

  const activeGscPage = activeTab === 'pages' ? pagesPage : queriesPage;
  const apiPath = useMemo(
    () => buildM03ApiPath(scope, activeGscPage, contentPage, appliedMinImpr, appliedMaxCtr),
    [scope, activeGscPage, contentPage, appliedMinImpr, appliedMaxCtr],
  );
  const activePathRef = useRef<string>(apiPath);
  activePathRef.current = apiPath;
  const reqSeqRef = useRef<number>(0);
  const prevScopeSigRef = useRef<string>(`${scope.websiteId}|${scope.preset}|${scope.from}|${scope.to}`);
  const scrollRestoredRef = useRef<boolean>(false);

  const [dataState, setDataState] = useState<{
    path: string;
    data: M03AdsSeoDashboardDto;
  } | null>(() => {
    const cached = peekApiCacheEntry<M03AdsSeoDashboardDto>(apiPath);
    return cached ? { path: apiPath, data: cached.data } : null;
  });
  const data = dataState && dataState.path === apiPath ? dataState.data : null;

  const [knownWebsites, setKnownWebsites] = useState<WebsiteConfigItemDto[]>(
    () => peekApiCacheEntry<M03AdsSeoDashboardDto>(apiPath)?.data.coverage.availableWebsites || [],
  );
  const [loading, setLoading] = useState<boolean>(
    () => !peekApiCacheEntry<M03AdsSeoDashboardDto>(apiPath),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAtIso, setCheckedAtIso] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const nextSig = `${scope.websiteId}|${scope.preset}|${scope.from}|${scope.to}`;
    if (prevScopeSigRef.current !== nextSig) {
      prevScopeSigRef.current = nextSig;
      setQueriesPage(1);
      setPagesPage(1);
      setContentPage(1);
    }
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  useEffect(() => {
    const entry = peekApiCacheEntry<M03AdsSeoDashboardDto>(apiPath);
    if (entry) {
      setDataState({ path: apiPath, data: entry.data });
      if (entry.data.coverage.availableWebsites?.length) {
        setKnownWebsites(entry.data.coverage.availableWebsites);
      }
      setCheckedAtIso(new Date(entry.timestamp).toISOString());
      setLoading(false);
      setRefreshing(false);
    } else {
      // Xóa trạng thái cũ ngay lập tức khi sang website/khoảng ngày chưa cache
      setDataState(null);
      setLoading(true);
    }
  }, [apiPath]);

  const fetchDashboard = useCallback(
    async (opts?: { forceFresh?: boolean; silent?: boolean; signal?: AbortSignal } | boolean) => {
      const normalized =
        typeof opts === 'boolean' ? { forceFresh: opts } : opts || {};
      if (!hydrated) return;
      if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

      const requestPath = apiPath;
      const seq = ++reqSeqRef.current;
      if (normalized.forceFresh && !normalized.silent) {
        setRefreshing(true);
      }
      if (!normalized.silent) setErrorMsg(null);
      try {
        const res = await apiRequest<M03AdsSeoDashboardDto>(requestPath, {
          skipCache: Boolean(normalized.forceFresh || normalized.silent),
          signal: normalized.signal,
          onRevalidated: (fresh) => {
            if (activePathRef.current !== requestPath) return;
            setDataState({ path: requestPath, data: fresh });
            if (fresh.coverage.availableWebsites?.length) {
              setKnownWebsites(fresh.coverage.availableWebsites);
            }
            setCheckedAtIso(new Date().toISOString());
          },
        });
        if (
          normalized.signal?.aborted ||
          seq !== reqSeqRef.current ||
          activePathRef.current !== requestPath
        ) {
          return;
        }
        setDataState({ path: requestPath, data: res });
        if (res.coverage.availableWebsites?.length) {
          setKnownWebsites(res.coverage.availableWebsites);
        }
        setCheckedAtIso(new Date().toISOString());
      } catch (err) {
        if (
          normalized.signal?.aborted ||
          (err instanceof DOMException && err.name === 'AbortError')
        ) {
          return;
        }
        if (seq === reqSeqRef.current && !normalized.silent) {
          setErrorMsg(err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError);
        }
      } finally {
        if (!normalized.signal?.aborted && seq === reqSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [apiPath, hydrated, scope.preset, scope.from, scope.to],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

    const controller = new AbortController();
    const cached = peekApiCacheEntry<M03AdsSeoDashboardDto>(apiPath);
    if (!cached || !cached.isFresh) {
      void fetchDashboard({ forceFresh: false, silent: Boolean(cached), signal: controller.signal });
    }

    const unsubscribe = subscribeDataSync(
      ['ads', 'seo_articles', 'seo_reports', 'tracking', 'websites'],
      () => {
        void fetchDashboard({ forceFresh: true, silent: true });
      },
    );

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [hydrated, apiPath, scope.preset, scope.from, scope.to, fetchDashboard]);

  useEffect(() => {
    saveRouteState('ads', { activeTab, chartMetric, queriesPage, pagesPage, contentPage });
  }, [activeTab, chartMetric, queriesPage, pagesPage, contentPage]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scroller = document.getElementById('main-workspace-content');
    if (!scroller) return;
    if (!scrollRestoredRef.current && data) {
      scrollRestoredRef.current = true;
      const saved = loadRouteState<{ scrollTop?: number }>('ads_scroll');
      if (saved?.scrollTop && saved.scrollTop > 0) {
        requestAnimationFrame(() => {
          scroller.scrollTop = saved.scrollTop ?? 0;
        });
      }
    }
    return () => {
      saveRouteState('ads_scroll', { scrollTop: scroller.scrollTop });
    };
  }, [data]);

  const seo = data?.seo;
  const clicksComparison = formatSafePeriodComparison(
    seo?.metrics.organicSearchClicks ?? null,
    seo?.comparison.previousClicks ?? null,
  );
  const imprComparison = formatSafePeriodComparison(
    seo?.metrics.organicSearchImpressions ?? null,
    seo?.comparison.previousImpressions ?? null,
  );

  const exportCsvCurrentTab = () => {
    if (!seo) return;
    const rows: string[][] = [];
    if (activeTab === 'queries') {
      rows.push(['Từ khóa', 'Click tìm kiếm', 'Hiển thị tìm kiếm', 'CTR (%)', 'Vị trí TB', 'Thay đổi Click', 'Cải thiện vị trí']);
      for (const r of seo.tables.queries.rows) {
        rows.push([
          r.key,
          String(r.clicks),
          String(r.impressions),
          r.ctrPct !== null ? `${r.ctrPct}%` : '',
          r.averagePosition !== null ? String(r.averagePosition) : '',
          r.clickChange !== null ? String(r.clickChange) : '',
          r.positionImprovement !== null ? String(r.positionImprovement) : '',
        ]);
      }
    } else if (activeTab === 'pages') {
      rows.push(['Trang đích', 'Click tìm kiếm', 'Hiển thị tìm kiếm', 'CTR (%)', 'Vị trí TB', 'Thay đổi Click']);
      for (const r of seo.tables.pages.rows) {
        rows.push([
          r.key,
          String(r.clicks),
          String(r.impressions),
          r.ctrPct !== null ? `${r.ctrPct}%` : '',
          r.averagePosition !== null ? String(r.averagePosition) : '',
          r.clickChange !== null ? String(r.clickChange) : '',
        ]);
      }
    } else {
      rows.push(['Tiêu đề bài viết', 'Từ khóa mục tiêu', 'Website đích', 'Người phụ trách', 'Trạng thái', 'Cập nhật lúc']);
      for (const r of seo.tables.content?.rows || []) {
        rows.push([
          r.title,
          r.targetQuery,
          r.targetWebsite || '',
          r.owner,
          formatWorkflowStatus(r.workflowStatus),
          r.updatedAt,
        ]);
      }
    }

    const csv =
      '\uFEFF' +
      rows
        .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tu-khoa-seo-${scope.websiteId}-${activeTab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickPlanKeyword = (queryText: string) => {
    const inferredDomain =
      scope.websiteId === 'bangled.vn' || scope.websiteId === 'manhinhled.net.vn'
        ? scope.websiteId
        : 'toantrung.com.vn';
    setNewKeywordText(queryText);
    setNewTargetWebsite(inferredDomain);
    setNewTopicFocus(`Tư vấn giải pháp và thông số kỹ thuật ${queryText} thực tế`);
    setActiveTab('content');
    setShowCreateContentForm(true);
  };

  const handleSubmitNewContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditContent || creatingContent) return;
    if (newKeywordText.trim().length < 2 || newTopicFocus.trim().length < 5) return;
    setCreatingContent(true);
    setContentStatusMsg(null);
    setErrorMsg(null);
    try {
      const kwRes = await apiRequest<{ id: number; keyword: string }>('/api/v1/ads', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'create_keyword',
          keywordText: newKeywordText.trim(),
          targetWebsite: newTargetWebsite,
        },
      });
      const artRes = await apiRequest<{ id: number; title: string }>('/api/v1/ads', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'generate_ai_draft',
          keywordId: kwRes.id,
          targetWebsite: newTargetWebsite,
          topicFocus: newTopicFocus.trim(),
        },
      });
      setContentStatusMsg(`Đã tạo bản nháp nội dung: "${artRes.title}"`);
      setNewKeywordText('');
      setNewTopicFocus('');
      setShowCreateContentForm(false);
      await fetchDashboard(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo bản nháp nội dung.');
    } finally {
      setCreatingContent(false);
    }
  };

  const queryRowsFiltered = useMemo(() => {
    const list = seo?.tables.queries.rows || [];
    if (!searchTerm.trim()) return list;
    const kw = searchTerm.trim().toLowerCase();
    return list.filter((r) => r.key.toLowerCase().includes(kw));
  }, [seo?.tables.queries.rows, searchTerm]);

  const pageRowsFiltered = useMemo(() => {
    const list = seo?.tables.pages.rows || [];
    if (!searchTerm.trim()) return list;
    const kw = searchTerm.trim().toLowerCase();
    return list.filter((r) => r.key.toLowerCase().includes(kw));
  }, [seo?.tables.pages.rows, searchTerm]);

  const contentRowsFiltered = useMemo(() => {
    const list = seo?.tables.content?.rows || [];
    if (!searchTerm.trim()) return list;
    const kw = searchTerm.trim().toLowerCase();
    return list.filter(
      (r) =>
        r.title.toLowerCase().includes(kw) ||
        r.targetQuery.toLowerCase().includes(kw) ||
        (r.targetWebsite || '').toLowerCase().includes(kw),
    );
  }, [seo?.tables.content?.rows, searchTerm]);

  const activeTotalRows =
    activeTab === 'queries'
      ? seo?.tables.queries.totalRows || 0
      : activeTab === 'pages'
        ? seo?.tables.pages.totalRows || 0
        : activeTab === 'content'
          ? seo?.tables.content?.totalRows || 0
          : 0;
  const currentPageNum =
    activeTab === 'content'
      ? contentPage
      : activeTab === 'pages'
        ? pagesPage
        : queriesPage;
  const totalPages = Math.max(1, Math.ceil(activeTotalRows / 20));

  return (
    <div className="space-y-4 pb-8">
      <WebsiteDashboardHeader
        title="Từ khóa & SEO"
        subtitle={
          data
            ? `Trang / từ khóa nào cần cải thiện? · ${data.scope.startDate} → ${data.scope.endDate}`
            : 'Trang / từ khóa nào cần cải thiện? · Tạo báo cáo AI có căn cứ và đề xuất công việc nội dung'
        }
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || knownWebsites}
        freshnessMessage={
          loading && !data
            ? UI_VOCABULARY.freshness.updating
            : refreshing
              ? UI_VOCABULARY.freshness.updating
              : data?.freshness.statusMessage
        }
        freshnessDetail={{
          checkedAt: checkedAtIso,
          lastSyncedAt: data?.freshness.lastSyncedAt || data?.freshness.lastSuccessAt || null,
          latestSourceDataAt:
            data?.freshness.latestSourceDataAt ||
            data?.freshness.dataThrough ||
            data?.scope.endDate ||
            null,
        }}
        freshnessTone={
          errorMsg || data?.freshness.state === 'ERROR'
            ? 'error'
            : refreshing || loading
              ? 'updating'
              : 'ok'
        }
        onChangeScope={updateScope}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void fetchDashboard(true)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {UI_VOCABULARY.actions.refresh}
            </button>
            <button
              type="button"
              onClick={exportCsvCurrentTab}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              {UI_VOCABULARY.actions.exportExcel}
            </button>
            <button
              type="button"
              onClick={() => setShowAiPanel((prev) => !prev)}
              className="h-9 px-3.5 rounded-lg bg-[#0B1D48] text-white hover:bg-[#172D6E] text-xs font-semibold inline-flex items-center gap-1.5 shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {showAiPanel ? 'Đóng báo cáo SEO' : 'Tạo báo cáo SEO'}
            </button>
          </div>
        }
      />

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-xs text-rose-800 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {contentStatusMsg && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-800 font-medium">
          {contentStatusMsg}
        </div>
      )}

      {showAiPanel && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Báo cáo Phân tích SEO bằng AI"
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={() => setShowAiPanel(false)}
        >
          <div
            className="w-full max-w-5xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <SeoAiReportPanel
              csrfToken={user?.csrfToken}
              initialWebsite={scope.websiteId}
              initialPeriodDays={scope.preset === '7D' ? 7 : 30}
              availableWebsites={data?.coverage.availableWebsites || knownWebsites}
              canEditContent={canEditContent}
              onClose={() => setShowAiPanel(false)}
              onSelectKeyword={(kw) => {
                setSearchTerm(kw);
                setActiveTab('queries');
                setShowAiPanel(false);
              }}
              onContentCreated={() => {
                void fetchDashboard(true);
              }}
            />
          </div>
        </div>
      )}

      {/* 6 KPI Tìm kiếm tự nhiên (C08) */}
      <section aria-label="Chỉ số tìm kiếm tự nhiên" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">Click tìm kiếm</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            <AnimatedMetricNumber value={seo?.metrics.organicSearchClicks ?? null} />
          </div>
          <div className="text-[11px] text-slate-500 truncate" title={clicksComparison.label}>
            So kỳ trước: <span className="font-medium text-slate-700">{clicksComparison.label}</span>
          </div>
        </div>

        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">Hiển thị tìm kiếm</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            <AnimatedMetricNumber value={seo?.metrics.organicSearchImpressions ?? null} />
          </div>
          <div className="text-[11px] text-slate-500 truncate" title={imprComparison.label}>
            So kỳ trước: <span className="font-medium text-slate-700">{imprComparison.label}</span>
          </div>
        </div>

        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">CTR tìm kiếm</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {seo?.metrics.organicSearchCtrPct !== null && seo?.metrics.organicSearchCtrPct !== undefined
              ? `${seo.metrics.organicSearchCtrPct}%`
              : '—'}
          </div>
          <div className="text-[11px] text-slate-500">Click / Hiển thị tự nhiên</div>
        </div>

        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">Vị trí trung bình</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            {seo?.metrics.averageSearchPosition !== null && seo?.metrics.averageSearchPosition !== undefined
              ? seo.metrics.averageSearchPosition
              : '—'}
          </div>
          <div className="text-[11px] text-slate-500">Bình quân gia quyền hiển thị</div>
        </div>

        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">Phiên từ tìm kiếm tự nhiên</div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums">
            <AnimatedMetricNumber value={seo?.metrics.organicSessions ?? null} />
          </div>
          <div className="text-[11px] text-slate-500">
            {seo?.metrics.organicEngagementRatePct !== null && seo?.metrics.organicEngagementRatePct !== undefined
              ? `Tương tác: ${seo.metrics.organicEngagementRatePct}%`
              : 'Kênh Organic Search'}
          </div>
        </div>

        <div className="min-h-[106px] rounded-[12px] bg-white border border-slate-200 p-3.5 shadow-2xs flex flex-col justify-between">
          <div className="text-xs font-medium text-slate-600">Lead từ tìm kiếm tự nhiên</div>
          <div className="text-2xl font-bold text-[#0B1D48] tabular-nums">
            <AnimatedMetricNumber value={seo?.metrics.organicValidLeadCount ?? 0} />
          </div>
          <div className="text-[11px] text-slate-500 truncate">
            {seo?.metrics.organicLeadVerificationState === 'VERIFIED'
              ? 'Xác minh từ dấu vết phiên'
              : 'Chỉ tính Lead đủ bằng chứng organic'}
          </div>
        </div>
      </section>

      {/* Biểu đồ chính (8 cột) + Trang tăng/giảm nổi bật (4 cột) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-[12px] p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Diễn biến tìm kiếm tự nhiên theo ngày</h2>
              <p className="text-xs text-slate-500">
                Đơn vị: {chartMetric === 'clicks' ? 'Lượt click tìm kiếm' : 'Lượt hiển thị tìm kiếm'} · Múi giờ chuẩn GMT+7
              </p>
            </div>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChartMetric('clicks')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  chartMetric === 'clicks' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Click tìm kiếm
              </button>
              <button
                type="button"
                onClick={() => setChartMetric('impressions')}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  chartMetric === 'impressions' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
                }`}
              >
                Hiển thị tìm kiếm
              </button>
            </div>
          </div>

          <StockAreaChart
            points={(seo?.charts.seoDailySeries || []).map((pt) => ({
              date: pt.date,
              value: chartMetric === 'clicks' ? pt.clicks : pt.impressions,
              isMissingData:
                pt.completenessState === 'NO_DATA' || pt.completenessState === 'QUERY_ERROR',
              isPreliminary:
                pt.completenessState === 'PRELIMINARY' || pt.completenessState === 'UNKNOWN',
            }))}
            metricLabel={chartMetric === 'clicks' ? 'click tìm kiếm' : 'hiển thị tìm kiếm'}
            accentColor="emerald"
            loading={loading}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>Điểm vàng: dữ liệu Search Console sơ bộ (độ trễ chốt 1–2 ngày)</span>
            <span>Điểm xám: chưa phát sinh dữ liệu ngày đó</span>
          </div>
        </div>

        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-[12px] p-4 shadow-2xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900">Biến động trang đích so kỳ trước</h2>
              <button
                type="button"
                onClick={() => setActiveTab('pages')}
                className="text-xs font-semibold text-[#1E3A8A] hover:underline"
              >
                Xem bảng Trang
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {seo?.charts.pagesDeltaSummary?.comparisonNote ||
                'Đối chiếu Click tìm kiếm của từng URL giữa kỳ này và kỳ liền trước.'}
            </p>

            <div className="mt-3 space-y-2.5 max-h-[230px] overflow-y-auto pr-1">
              {(seo?.charts.pagesDeltaSummary?.risingPages.length || 0) === 0 &&
              (seo?.charts.pagesDeltaSummary?.decliningPages.length || 0) === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  Chưa có biến động lớn giữa hai kỳ đối chiếu trong phạm vi đang chọn.
                </div>
              ) : (
                <>
                  {(seo?.charts.pagesDeltaSummary?.risingPages || []).slice(0, 3).map((row) => (
                    <div
                      key={`up-${row.key}`}
                      className="rounded-lg border border-emerald-100 bg-emerald-50/40 px-2.5 py-2 text-xs"
                    >
                      <div className="font-mono text-[11px] text-slate-800 truncate" title={row.key}>
                        {row.key}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{row.clicks} click kỳ này</span>
                        <span className="font-semibold text-emerald-700 inline-flex items-center gap-0.5">
                          <ArrowUpRight className="w-3 h-3" />+{row.clickChange ?? 0} click
                        </span>
                      </div>
                    </div>
                  ))}
                  {(seo?.charts.pagesDeltaSummary?.decliningPages || []).slice(0, 3).map((row) => (
                    <div
                      key={`down-${row.key}`}
                      className="rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-2 text-xs"
                    >
                      <div className="font-mono text-[11px] text-slate-800 truncate" title={row.key}>
                        {row.key}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">{row.clicks} click kỳ này</span>
                        <span className="font-semibold text-amber-800 inline-flex items-center gap-0.5">
                          <ArrowDownRight className="w-3 h-3" />
                          {row.clickChange ?? 0} click
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          <div className="pt-2.5 mt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>Cần xem quảng cáo trả phí?</span>
            <Link href="/tracking" className="font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1">
              Mở Chiến dịch · Quảng cáo
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* KHỐI CƠ HỘI TĂNG KHÁCH TRUY CẬP MIỄN PHÍ TỪ GOOGLE (rõ nghĩa, trực quan cho người dùng & Marketing) */}
      <section
        aria-labelledby="seo-quick-win-heading"
        className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3.5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="seo-quick-win-heading" className="text-sm sm:text-base font-bold text-slate-900">
                Từ khóa dễ tăng khách truy cập ngay
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold tabular-nums">
                {seo?.charts.opportunityQueries.length || 0} từ khóa tiềm năng
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Các từ khóa này đã có nhiều người nhìn thấy trên Google nhưng tỷ lệ bấm vào web còn thấp — chỉ cần viết bài chuyên sâu hoặc đặt lại tiêu đề thu hút hơn để tăng lượt khách vào miễn phí.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Gói gọn ngưỡng kỹ thuật vào thẻ mở rộng để không gây rối mắt */}
            <details className="relative">
              <summary className="cursor-pointer list-none h-8 px-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 select-none">
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#1E3A8A]" />
                <span>Lọc điều kiện (≥{appliedMinImpr} lượt thấy · ≤{appliedMaxCtr}%)</span>
              </summary>
              <div className="mt-2 lg:absolute lg:right-0 lg:z-20 lg:w-72 rounded-xl border border-slate-200 bg-white p-3.5 shadow-xl space-y-2.5 text-xs">
                <div className="font-bold text-slate-800">Tùy chỉnh điều kiện gợi ý</div>
                <label className="flex items-center justify-between gap-2 text-slate-600">
                  <span>Số lượt xuất hiện tối thiểu:</span>
                  <input
                    type="number"
                    min={1}
                    value={draftMinImpr}
                    onChange={(e) => setDraftMinImpr(e.target.value)}
                    className="w-20 h-7 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 text-slate-600">
                  <span>Tỷ lệ khách nhấp tối đa (%):</span>
                  <input
                    type="number"
                    min={0.1}
                    step={0.5}
                    value={draftMaxCtr}
                    onChange={(e) => setDraftMaxCtr(e.target.value)}
                    className="w-20 h-7 px-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-900"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAppliedMinImpr(Math.max(1, Number(draftMinImpr) || 30));
                    setAppliedMaxCtr(Math.max(0.1, Number(draftMaxCtr) || 3));
                  }}
                  className="w-full h-8 rounded-lg bg-[#0F275C] hover:bg-[#1E3A8A] text-white text-xs font-semibold"
                >
                  Áp dụng bộ lọc
                </button>
              </div>
            </details>

            <button
              type="button"
              onClick={() => setShowUrlInspect((prev) => !prev)}
              className="h-8 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showUrlInspect
                  ? 'Ẩn trạng thái lập chỉ mục'
                  : `Trạng thái trang trên Google (${data?.siteStatus.rows.length || 0})`}
              </span>
            </button>
          </div>
        </div>

        {(seo?.charts.opportunityQueries.length || 0) === 0 ? (
          <div className="rounded-xl bg-slate-50 border border-slate-200/70 px-4 py-3 text-xs text-slate-500">
            Chưa có từ khóa nào rơi vào vùng tỷ lệ nhấp thấp theo điều kiện lọc hiện tại.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {seo!.charts.opportunityQueries.slice(0, 6).map((q) => {
              const pos = q.averagePosition;
              const rankBadge =
                pos !== null && pos <= 3
                  ? { label: `Top ${pos} Google`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                  : pos !== null && pos <= 10
                    ? { label: `Trang 1 (Hạng #${pos})`, cls: 'bg-blue-50 text-[#1E3A8A] border-blue-200' }
                    : pos !== null
                      ? { label: `Hạng #${pos}`, cls: 'bg-slate-100 text-slate-700 border-slate-200' }
                      : { label: 'Đang đo hạng', cls: 'bg-slate-100 text-slate-600 border-slate-200' };

              return (
                <div
                  key={q.query}
                  className="rounded-xl border border-slate-200/90 bg-slate-50/40 hover:bg-white hover:border-[#1E3A8A]/40 p-3 flex flex-col justify-between gap-2.5 transition"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] text-slate-400 block">Từ khóa khách tìm kiếm</span>
                      <strong className="text-xs sm:text-sm font-bold text-slate-900 block truncate" title={q.query}>
                        {q.query}
                      </strong>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold shrink-0 tabular-nums ${rankBadge.cls}`}>
                      {rankBadge.label}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between gap-2 text-xs">
                    <div className="text-slate-600 tabular-nums">
                      <strong className="text-slate-900">{q.impressions.toLocaleString('vi-VN')}</strong> lượt thấy · Tỷ lệ nhấp:{' '}
                      <strong className="text-amber-700">{q.ctrPct ?? 0}%</strong>
                    </div>
                    {canEditContent && (
                      <button
                        type="button"
                        onClick={() => handleQuickPlanKeyword(q.query)}
                        className="h-7 px-2.5 rounded-lg bg-[#0F275C] hover:bg-[#1E3A8A] text-white text-[11px] font-semibold shrink-0 transition"
                      >
                        Viết bài tối ưu
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showUrlInspect && (
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-[11px] text-slate-500">
              Lưu ý kỹ thuật: {data?.siteStatus.statusMessage || 'Dữ liệu URL Inspection kiểm tra từng URL cụ thể, không đại diện toàn bộ lỗi thu thập toàn trang.'}
            </div>
            {(data?.siteStatus.rows.length || 0) === 0 ? (
              <div className="text-xs text-slate-500 py-2">Chưa có bản ghi kiểm tra URL đơn lẻ trong phạm vi này.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 text-left">
                      <th className="py-2 pr-3 font-semibold">URL kiểm tra</th>
                      <th className="py-2 px-3 font-semibold">Kết luận lập chỉ mục</th>
                      <th className="py-2 px-3 font-semibold">Trạng thái thu thập</th>
                      <th className="py-2 pl-3 font-semibold">Lần Google thu thập gần nhất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data!.siteStatus.rows.slice(0, 10).map((u) => (
                      <tr key={u.url}>
                        <td className="py-2 pr-3 font-mono text-[11px] text-slate-800 max-w-[360px] truncate" title={u.url}>
                          {u.url}
                        </td>
                        <td className="py-2 px-3 font-medium text-slate-700">{u.verdict}</td>
                        <td className="py-2 px-3 text-slate-600">{u.coverageState}</td>
                        <td className="py-2 pl-3 text-slate-500">
                          {u.lastCrawlTime ? new Date(u.lastCrawlTime).toLocaleString('vi-VN') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Bảng dữ liệu chính với 4 tab ngắn: Từ khóa · Trang · Nội dung · Xu hướng */}
      <section
        className="bg-white border border-slate-200 rounded-[12px] shadow-2xs overflow-hidden"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 380px' }}
      >
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Phân mục Từ khóa & SEO" className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'queries', label: 'Từ khóa', count: seo?.tables.queries.totalRows },
                { id: 'pages', label: 'Trang', count: seo?.tables.pages.totalRows },
                { id: 'content', label: 'Nội dung', count: seo?.tables.content?.totalRows },
                { id: 'trends', label: 'Xu hướng', count: data?.trends.rows.length },
              ] as const
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`h-8 px-3 rounded-lg text-xs font-semibold transition inline-flex items-center gap-1.5 ${
                    selected
                      ? 'bg-[#0B1D48] text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <span>{tab.label}</span>
                  {typeof tab.count === 'number' && (
                    <span
                      className={`px-1.5 py-0.2 rounded text-[11px] tabular-nums ${
                        selected ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTab !== 'trends' && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Tìm từ khóa, URL hoặc tiêu đề..."
                  className="h-8 pl-8 pr-3 rounded-lg border border-slate-200 text-xs text-slate-800 w-56 focus:outline-2 focus:outline-[#1E3A8A]"
                />
              </div>
            )}
            {activeTab === 'content' && canEditContent && (
              <button
                type="button"
                onClick={() => setShowCreateContentForm((prev) => !prev)}
                className="h-8 px-3 rounded-lg bg-[#0B1D48] text-white text-xs font-semibold hover:bg-[#172D6E] inline-flex items-center gap-1.5"
              >
                <FilePlus2 className="w-3.5 h-3.5" />
                Thêm kế hoạch bài viết
              </button>
            )}
          </div>
        </div>

        {activeTab === 'content' && showCreateContentForm && canEditContent && (
          <form
            onSubmit={(e) => void handleSubmitNewContent(e)}
            className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
          >
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Từ khóa mục tiêu
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={newKeywordText}
                onChange={(e) => setNewKeywordText(e.target.value)}
                placeholder="VD: màn hình led p2.5 hội trường"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Website đích
              </label>
              <select
                value={newTargetWebsite}
                onChange={(e) => setNewTargetWebsite(e.target.value as typeof newTargetWebsite)}
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs font-medium"
              >
                <option value="toantrung.com.vn">Website Toàn Trung (toantrung.com.vn)</option>
                <option value="bangled.vn">Chuyên trang Bảng LED (bangled.vn)</option>
                <option value="manhinhled.net.vn">Chuyên trang Màn hình LED (manhinhled.net.vn)</option>
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Chủ đề bài viết dự kiến
              </label>
              <input
                type="text"
                required
                minLength={5}
                value={newTopicFocus}
                onChange={(e) => setNewTopicFocus(e.target.value)}
                placeholder="VD: Báo giá kỹ thuật và tiêu chuẩn lắp đặt màn hình LED hội trường"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-white text-xs"
              />
            </div>
            <div className="md:col-span-2 flex items-center gap-2">
              <button
                type="submit"
                disabled={creatingContent}
                className="h-9 px-3.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50 w-full"
              >
                {creatingContent ? 'Đang tạo...' : 'Tạo bản nháp'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'queries' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th scope="col" className="py-2.5 px-4 text-left font-semibold">Từ khóa tìm kiếm</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Click tìm kiếm</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Hiển thị tìm kiếm</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">CTR</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Vị trí trung bình</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">So kỳ trước</th>
                  {canEditContent && (
                    <th scope="col" className="py-2.5 px-4 text-right font-semibold">Kế hoạch nội dung</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {queryRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={canEditContent ? 7 : 6} className="py-10 text-center text-slate-400">
                      Không có truy vấn tìm kiếm trong phạm vi đang chọn.
                    </td>
                  </tr>
                ) : (
                  queryRowsFiltered.map((r) => {
                    const cmp = formatSafePeriodComparison(r.clicks, r.previousClicks);
                    return (
                      <tr key={r.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-medium text-slate-900 max-w-[320px] truncate" title={r.key}>
                          {r.key}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                          {r.clicks.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.impressions.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.ctrPct !== null ? `${r.ctrPct}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.averagePosition !== null ? r.averagePosition : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-[11px] text-slate-600 tabular-nums">
                          {cmp.label}
                        </td>
                        {canEditContent && (
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleQuickPlanKeyword(r.key)}
                              className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                            >
                              Đưa vào nội dung
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'pages' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th scope="col" className="py-2.5 px-4 text-left font-semibold">URL trang đích</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Click tìm kiếm</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Hiển thị tìm kiếm</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">CTR</th>
                  <th scope="col" className="py-2.5 px-3 text-right font-semibold">Vị trí trung bình</th>
                  <th scope="col" className="py-2.5 px-4 text-right font-semibold">Thay đổi Click so kỳ trước</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Không có dữ liệu trang đích trong phạm vi đang chọn.
                    </td>
                  </tr>
                ) : (
                  pageRowsFiltered.map((r) => {
                    const cmp = formatSafePeriodComparison(r.clicks, r.previousClicks);
                    return (
                      <tr key={r.key} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-4 font-mono text-[11px] text-slate-800 max-w-[420px] truncate" title={r.key}>
                          {r.key}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-900 tabular-nums">
                          {r.clicks.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.impressions.toLocaleString('vi-VN')}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.ctrPct !== null ? `${r.ctrPct}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600 tabular-nums">
                          {r.averagePosition !== null ? r.averagePosition : '—'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-[11px] text-slate-600 tabular-nums">
                          {cmp.label}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th scope="col" className="py-2.5 px-4 text-left font-semibold">Tiêu đề bài viết</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-semibold">Từ khóa mục tiêu</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-semibold">Website nguồn</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-semibold">Người phụ trách</th>
                  <th scope="col" className="py-2.5 px-3 text-left font-semibold">Trạng thái bài viết</th>
                  <th scope="col" className="py-2.5 px-4 text-right font-semibold">Cập nhật gần nhất</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {contentRowsFiltered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-10 text-center text-slate-400">
                      Chưa có bài viết SEO nào trong danh sách cho phạm vi website đang chọn.
                    </td>
                  </tr>
                ) : (
                  contentRowsFiltered.map((art) => (
                    <tr key={art.contentId} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4 font-medium text-slate-900 max-w-[340px]">
                        <div className="truncate" title={art.title}>
                          {art.title}
                        </div>
                        {art.targetUrl && (
                          <div className="text-[11px] font-mono text-slate-400 truncate" title={art.targetUrl}>
                            {art.targetUrl}
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{art.targetQuery}</td>
                      <td className="py-2.5 px-3 text-slate-600">{art.targetWebsite || 'Chưa phân loại'}</td>
                      <td className="py-2.5 px-3 text-slate-600">{art.owner}</td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            art.workflowStatus === 'published'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : art.publishError
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {formatWorkflowStatus(art.workflowStatus)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-slate-500 tabular-nums">
                        {new Date(art.updatedAt).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'trends' && (
          <div className="p-5 space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Nguồn xu hướng thị trường (Google Trends Việt Nam):</span>
                  <span
                    className={`px-2 py-0.5 rounded-full font-semibold ${
                      data?.trends.status === 'CONNECTED'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {data?.trends.status === 'CONNECTED' ? 'Đã kết nối trực tiếp' : UI_VOCABULARY.fallbacks.unconnected}
                  </span>
                </div>
                <p className="text-slate-600">
                  {data?.trends.statusMessage ||
                    'Đang kết nối dữ liệu thực tế từ Google Trends RSS Việt Nam & Google Suggest VN.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer">
                  <span>Nhập CSV từ Google Trends</span>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = async () => {
                        try {
                          const csvText = String(reader.result || '');
                          const res = await apiRequest<{ importedRows: number; terms: string[] }>(
                            '/api/v1/ads/trends',
                            {
                              method: 'POST',
                              csrfToken: user?.csrfToken,
                              body: { action: 'import_csv', csvText },
                            },
                          );
                          setContentStatusMsg(
                            `Đã nhập ${res.importedRows} mốc chỉ số Google Trends (0–100) cho: ${res.terms.join(', ')}`,
                          );
                          invalidateApiCacheByDomains(['ads']);
                          await fetchDashboard(true);
                        } catch (err) {
                          setErrorMsg(
                            err instanceof Error ? err.message : 'Không thể đọc file CSV Google Trends.',
                          );
                        }
                      };
                      reader.readAsText(file);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setShowSerpKeyForm((prev) => !prev)}
                  className="min-h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700"
                >
                  {data?.trends.serpApiConfigured
                    ? 'Đổi khóa SerpApi (0–100)'
                    : 'Gắn khóa SerpApi (0–100)'}
                </button>
              </div>
            </div>

            {showSerpKeyForm && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!serpApiKeyInput.trim() || savingSerpKey) return;
                  setSavingSerpKey(true);
                  setErrorMsg(null);
                  try {
                    await apiRequest('/api/v1/ads/trends', {
                      method: 'POST',
                      csrfToken: user?.csrfToken,
                      body: { action: 'save_serpapi_key', apiKey: serpApiKeyInput.trim() },
                    });
                    setSerpApiKeyInput('');
                    setShowSerpKeyForm(false);
                    setContentStatusMsg('Đã lưu khóa SerpApi để đồng bộ chỉ số Google Trends 0–100 tự động.');
                    invalidateApiCacheByDomains(['ads']);
                    await fetchDashboard(true);
                  } catch (err) {
                    setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu khóa SerpApi.');
                  } finally {
                    setSavingSerpKey(false);
                  }
                }}
                className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex flex-wrap items-center gap-2.5 text-xs"
              >
                <input
                  type="password"
                  value={serpApiKeyInput}
                  onChange={(e) => setSerpApiKeyInput(e.target.value)}
                  placeholder="Dán SERPAPI_API_KEY để bật kéo chuỗi điểm 0–100 tự động..."
                  className="flex-1 min-w-[260px] h-9 px-3 rounded-lg border border-slate-200 bg-white"
                />
                <button
                  type="submit"
                  disabled={savingSerpKey}
                  className="h-9 px-3.5 rounded-lg bg-[#0B1D48] text-white font-semibold hover:bg-[#172D6E] disabled:opacity-50"
                >
                  {savingSerpKey ? 'Đang lưu...' : 'Lưu khóa'}
                </button>
              </form>
            )}

            {/* Thanh tra cứu trực tiếp từ khóa trên Google Việt Nam */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!trendLookupInput.trim() || trendLookupBusy) return;
                setTrendLookupBusy(true);
                setErrorMsg(null);
                try {
                  const res = await apiRequest<{ keyword: string; suggestions: string[] }>(
                    '/api/v1/ads/trends',
                    {
                      method: 'POST',
                      csrfToken: user?.csrfToken,
                      body: { action: 'lookup_keyword', keyword: trendLookupInput.trim() },
                    },
                  );
                  setTrendLookupResults(res.suggestions || []);
                } catch (err) {
                  setErrorMsg(err instanceof Error ? err.message : 'Không thể tra cứu xu hướng.');
                } finally {
                  setTrendLookupBusy(false);
                }
              }}
              className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={trendLookupInput}
                  onChange={(e) => setTrendLookupInput(e.target.value)}
                  placeholder="Nhập chủ đề cần tra cứu xu hướng Google VN (VD: màn hình led p2.5, bảng led ma trận...)"
                  className="flex-1 min-w-[260px] h-9 px-3 rounded-lg border border-slate-200 text-xs text-slate-800"
                />
                <button
                  type="submit"
                  disabled={trendLookupBusy}
                  className="h-9 px-4 rounded-lg bg-[#0B1D48] text-white text-xs font-semibold hover:bg-[#172D6E] disabled:opacity-50"
                >
                  {trendLookupBusy ? 'Đang tra cứu...' : 'Tra cứu Google VN'}
                </button>
                {data?.trends.serpApiConfigured && (
                  <button
                    type="button"
                    disabled={trendLookupBusy || !trendLookupInput.trim()}
                    onClick={async () => {
                      if (!trendLookupInput.trim()) return;
                      setTrendLookupBusy(true);
                      setErrorMsg(null);
                      try {
                        const res = await apiRequest<{ syncedPoints: number; relatedRising: string[] }>(
                          '/api/v1/ads/trends',
                          {
                            method: 'POST',
                            csrfToken: user?.csrfToken,
                            body: { action: 'sync_serpapi', keyword: trendLookupInput.trim() },
                          },
                        );
                        setTrendLookupResults(res.relatedRising || []);
                        setContentStatusMsg(
                          `Đã đồng bộ ${res.syncedPoints} ngày chỉ số Google Trends (0–100) cho "${trendLookupInput.trim()}".`,
                        );
                        invalidateApiCacheByDomains(['ads']);
                        await fetchDashboard(true);
                      } catch (err) {
                        setErrorMsg(err instanceof Error ? err.message : 'Đồng bộ SerpApi thất bại.');
                      } finally {
                        setTrendLookupBusy(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 disabled:opacity-50"
                  >
                    Lấy chuỗi điểm 0–100
                  </button>
                )}
              </div>

              {trendLookupResults && (
                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                  <div className="text-xs font-semibold text-slate-700">
                    Các cụm tìm kiếm thực tế đang phổ biến trên Google Việt Nam ({trendLookupResults.length}):
                  </div>
                  {trendLookupResults.length === 0 ? (
                    <div className="text-xs text-slate-500">Không có gợi ý mở rộng cho cụm từ này.</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {trendLookupResults.map((sug) => (
                        <div
                          key={sug}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 px-2.5 py-1 text-xs"
                        >
                          <span className="font-medium text-slate-900">{sug}</span>
                          {canEditContent && (
                            <button
                              type="button"
                              onClick={() => handleQuickPlanKeyword(sug)}
                              className="font-semibold text-[#1E3A8A] hover:underline"
                            >
                              + Lên bài
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </form>

            {/* Gợi ý tìm kiếm thực tế ngành Màn hình LED & Bảng điện tử tại Việt Nam */}
            {(data?.trends.industrySuggestions?.length || 0) > 0 && (
              <div className="space-y-2.5">
                <h3 className="text-xs font-bold text-slate-900">
                  Xu hướng cụm từ tìm kiếm ngành Màn hình LED &amp; Bảng điện tử trên Google Việt Nam
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {data!.trends.industrySuggestions!.map((group) => (
                    <div
                      key={group.seedTerm}
                      className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2"
                    >
                      <div className="text-xs font-bold text-[#0B1D48]">
                        Nhóm chủ đề gốc: {group.seedTerm}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {group.suggestions.map((kw) => (
                          <div
                            key={kw}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs"
                          >
                            <span className="text-slate-800">{kw}</span>
                            {canEditContent && (
                              <button
                                type="button"
                                onClick={() => handleQuickPlanKeyword(kw)}
                                className="text-[#1E3A8A] font-semibold hover:underline"
                                title="Đưa cụm từ này vào kế hoạch nội dung"
                              >
                                + Bài
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bảng dữ liệu chỉ số 0–100 hoặc Xu hướng nổi bật Google Trends RSS Việt Nam */}
            {(data?.trends.rows.length || 0) > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-900">
                  {data!.trends.rows[0]?.scaleType === 'INDEX_0_100'
                    ? 'Chuỗi chỉ số quan tâm Google Trends theo thời gian (Thang 0–100)'
                    : 'Xu hướng tìm kiếm nổi bật trong ngày tại Việt Nam (Google Trends RSS trực tiếp)'}
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Chủ đề / Từ khóa</th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Khu vực</th>
                        <th scope="col" className="py-2.5 px-3 text-right font-semibold">
                          {data!.trends.rows[0]?.scaleType === 'INDEX_0_100'
                            ? 'Chỉ số quan tâm (0–100)'
                            : 'Lưu lượng tìm kiếm xấp xỉ'}
                        </th>
                        <th scope="col" className="py-2.5 px-3 text-left font-semibold">Ngữ cảnh / Nguồn</th>
                        <th scope="col" className="py-2.5 px-3 text-right font-semibold">Ngày ghi nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data!.trends.rows.map((tr, idx) => (
                        <tr key={`${tr.term}-${idx}`} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3 font-semibold text-slate-900">{tr.term}</td>
                          <td className="py-2.5 px-3 text-slate-600">{tr.geoName}</td>
                          <td className="py-2.5 px-3 text-right font-bold text-[#0B1D48] tabular-nums">
                            {tr.interestValue !== null && tr.interestValue !== undefined
                              ? tr.interestValue
                              : tr.approxTrafficLabel || 'Đang tăng'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 max-w-[320px] truncate" title={tr.newsHeadline || ''}>
                            {tr.newsHeadline
                              ? `${tr.newsHeadline}${tr.newsSource ? ` (${tr.newsSource})` : ''}`
                              : tr.scaleType === 'INDEX_0_100'
                                ? 'Google Trends (0–100)'
                                : 'Google Trends RSS VN'}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums">{tr.date}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab !== 'trends' && totalPages > 1 && (
          <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
            <span>
              Trang {currentPageNum} / {totalPages} ({activeTotalRows.toLocaleString('vi-VN')} dòng)
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={currentPageNum <= 1}
                onClick={() =>
                  activeTab === 'content'
                    ? setContentPage((p) => Math.max(1, p - 1))
                    : activeTab === 'pages'
                      ? setPagesPage((p) => Math.max(1, p - 1))
                      : setQueriesPage((p) => Math.max(1, p - 1))
                }
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
              >
                Trước
              </button>
              <button
                type="button"
                disabled={currentPageNum >= totalPages}
                onClick={() =>
                  activeTab === 'content'
                    ? setContentPage((p) => Math.min(totalPages, p + 1))
                    : activeTab === 'pages'
                      ? setPagesPage((p) => Math.min(totalPages, p + 1))
                      : setQueriesPage((p) => Math.min(totalPages, p + 1))
                }
                className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 font-medium"
              >
                Sau
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
