'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  METRIC_DICTIONARY,
  UI_VOCABULARY,
  formatSafePeriodComparison,
  hasBaPermission,
  type M04ResultsReportDto,
  type ReportsDashboardDto,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  Calculator,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  Globe,
  LayoutDashboard,
  Package,
  PenLine,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import { apiRequest, peekApiCacheEntry } from '@/core/http/client';
import { subscribeDataSync } from '@/core/http/data-sync-bus';
import { loadRouteState, saveRouteState } from '@/core/http/route-state';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { MktSpreadsheetCalcBar, useMktExcelSelection } from '@/components/common/MktSpreadsheetCalcBar';
import {
  VerticalSectionNav,
  type VerticalNavGroup,
  type VerticalNavItem,
} from '@/components/common/VerticalSectionNav';
import { ReportsPerformanceChart } from './ReportsPerformanceChart';

const ReportDocComposer = dynamic(
  () => import('./ReportDocComposer').then((m) => m.ReportDocComposer),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[14px] border border-slate-200 bg-white p-6 text-xs text-slate-500">
        Đang tải trình soạn thảo...
      </div>
    ),
  },
);

const SharedTeamFilesPanel = dynamic(
  () => import('./SharedTeamFilesPanel').then((m) => m.SharedTeamFilesPanel),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-[14px] border border-slate-200 bg-white p-6 text-xs text-slate-500">
        Đang tải kho dữ liệu dùng chung...
      </div>
    ),
  },
);

type ReportsSectionKey =
  | 'overview'
  | 'reconcile'
  | 'sales_pipeline'
  | 'products'
  | 'shared_files'
  | 'composer';
type ReconcileTabKey = 'website' | 'channel' | 'campaign';
type SortDirection = 'asc' | 'desc';
type MetricKind = 'vnd' | 'count';

interface RatioMetricOption {
  key: string;
  label: string;
  kind: MetricKind;
}

const RECONCILE_TABS: Array<{ key: ReconcileTabKey; label: string }> = [
  { key: 'website', label: 'Website' },
  { key: 'channel', label: 'Kênh' },
  { key: 'campaign', label: 'Chiến dịch' },
];

const RATIO_METRICS_BY_TAB: Record<ReconcileTabKey, RatioMetricOption[]> = {
  website: [
    { key: 'adCost', label: 'Chi phí Ads', kind: 'vnd' },
    { key: 'leadCount', label: 'Tiếp nhận', kind: 'count' },
    { key: 'validCount', label: 'Hợp lệ', kind: 'count' },
    { key: 'adLeadCount', label: 'Lead từ Ads', kind: 'count' },
    { key: 'wonCount', label: 'Chốt', kind: 'count' },
  ],
  channel: [
    { key: 'leadCount', label: 'Tiếp nhận', kind: 'count' },
    { key: 'validCount', label: 'Hợp lệ', kind: 'count' },
    { key: 'quotedCount', label: 'Đã báo giá', kind: 'count' },
    { key: 'wonCount', label: 'Chốt', kind: 'count' },
  ],
  campaign: [
    { key: 'adCost', label: 'Chi phí', kind: 'vnd' },
    { key: 'clicks', label: 'Clicks', kind: 'count' },
    { key: 'impressions', label: 'Hiển thị', kind: 'count' },
    { key: 'receivedLeadCount', label: 'Lead tiếp nhận', kind: 'count' },
    { key: 'validAttributedAdLeadCount', label: 'Lead từ Ads', kind: 'count' },
    { key: 'wonLeadCount', label: 'Chốt', kind: 'count' },
  ],
};

const DEFAULT_RATIO_PAIR: Record<ReconcileTabKey, { num: string; den: string; asPercent: boolean }> = {
  website: { num: 'adCost', den: 'validCount', asPercent: false },
  channel: { num: 'wonCount', den: 'validCount', asPercent: true },
  campaign: { num: 'adCost', den: 'clicks', asPercent: false },
};

const VALID_SECTIONS: ReportsSectionKey[] = [
  'overview',
  'reconcile',
  'sales_pipeline',
  'products',
  'shared_files',
  'composer',
];

export function ReportsWorkspace() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();
  const tabListId = useId();

  const canExport = Boolean(user && hasBaPermission(user.roleCode, 'EXPORT_DATA'));
  const canCreateDesignDirect = Boolean(user && hasBaPermission(user.roleCode, 'AI_DESIGN'));
  const canRequestDesignBrief = Boolean(
    user &&
      (hasBaPermission(user.roleCode, 'AI_DESIGN') ||
        hasBaPermission(user.roleCode, 'TRACKING_ADS_OPTIMIZE') ||
        hasBaPermission(user.roleCode, 'AI_MARKETING_SEO')),
  );
  const canCreateSeoContent = Boolean(
    user &&
      (hasBaPermission(user.roleCode, 'AI_MARKETING_SEO') ||
        hasBaPermission(user.roleCode, 'AI_DESIGN')),
  );

  const [activeSection, setActiveSection] = useState<ReportsSectionKey>(() => {
    if (typeof window !== 'undefined') {
      const qs = new URLSearchParams(window.location.search);
      const s = qs.get('section') as ReportsSectionKey | null;
      if (s && VALID_SECTIONS.includes(s)) return s;
      if (qs.get('view') === 'doc_composer') return 'composer';
      const t = qs.get('tab');
      if (t === 'website' || t === 'channel' || t === 'campaign') return 'reconcile';
      const saved = loadRouteState<{ activeSection?: ReportsSectionKey }>('reports');
      if (saved?.activeSection && VALID_SECTIONS.includes(saved.activeSection)) {
        return saved.activeSection;
      }
    }
    return 'overview';
  });

  const [pendingPage, setPendingPage] = useState(
    () => loadRouteState<{ pendingPage?: number }>('reports')?.pendingPage || 1,
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [reconcileSearch, setReconcileSearch] = useState('');
  const quickCalc = useMktExcelSelection();

  const [activeTab, setActiveTab] = useState<ReconcileTabKey>(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t === 'website' || t === 'channel' || t === 'campaign') return t;
      const saved = loadRouteState<{ activeTab?: ReconcileTabKey }>('reports');
      if (saved?.activeTab) return saved.activeTab;
    }
    return 'website';
  });
  const [sortCol, setSortCol] = useState<string>(
    () => loadRouteState<{ sortCol?: string }>('reports')?.sortCol || 'valid',
  );
  const [sortDir, setSortDir] = useState<SortDirection>(
    () => loadRouteState<{ sortDir?: SortDirection }>('reports')?.sortDir || 'desc',
  );
  const [salesSortCol, setSalesSortCol] = useState<string>('leadCount');
  const [salesSortDir, setSalesSortDir] = useState<SortDirection>('desc');

  const [showPrevPeriod, setShowPrevPeriod] = useState<boolean>(
    () => loadRouteState<{ showPrevPeriod?: boolean }>('reports')?.showPrevPeriod ?? true,
  );
  const [rightCardMode, setRightCardMode] = useState<'channel' | 'pipeline'>('channel');

  // Công cụ chia nhanh chỉ số A ÷ B kiểu Excel trong Đối chiếu nguồn
  const [ratioCalcOpen, setRatioCalcOpen] = useState(false);
  const [ratioNumKey, setRatioNumKey] = useState<string>(() => DEFAULT_RATIO_PAIR.website.num);
  const [ratioDenKey, setRatioDenKey] = useState<string>(() => DEFAULT_RATIO_PAIR.website.den);
  const [ratioAsPercent, setRatioAsPercent] = useState<boolean>(() => DEFAULT_RATIO_PAIR.website.asPercent);

  // Modal tạo Brief thiết kế
  const [briefModalOpen, setBriefModalOpen] = useState(false);
  const [briefTitle, setBriefTitle] = useState('');
  const [briefObjective, setBriefObjective] = useState('');
  const [briefChannel, setBriefChannel] = useState('Google Ads Display / Facebook Banner');
  const [briefFormat, setBriefFormat] = useState('Banner 16:9 (1536×1024 px)');
  const [briefHeadline, setBriefHeadline] = useState('');
  const [briefCta, setBriefCta] = useState('Nhận báo giá ngay');
  const [briefSubmitting, setBriefSubmitting] = useState(false);
  const [briefResultMsg, setBriefResultMsg] = useState<string | null>(null);
  const [briefErrorMsg, setBriefErrorMsg] = useState<string | null>(null);

  const tabRefs = useRef<Record<ReconcileTabKey, HTMLButtonElement | null>>({
    website: null,
    channel: null,
    campaign: null,
  });
  const briefDialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    if (!canExport && activeSection === 'composer') {
      setActiveSection('overview');
    }
  }, [canExport, activeSection]);

  useEffect(() => {
    const dialog = briefDialogRef.current;
    if (!dialog) return;
    if (briefModalOpen) {
      if (!dialog.open) dialog.showModal();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [briefModalOpen]);

  useEffect(() => {
    const dialog = briefDialogRef.current;
    if (!dialog || typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) dialog.close();
    };
    dialog.addEventListener('click', handleBackdropClick);
    return () => dialog.removeEventListener('click', handleBackdropClick);
  }, []);

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

  const activeQueryUrlRef = useRef<string>(queryUrl);
  activeQueryUrlRef.current = queryUrl;
  const reqSeqRef = useRef<number>(0);
  const prevScopeSigRef = useRef<string>(
    `${scope.websiteId}|${scope.preset}|${scope.from}|${scope.to}`,
  );
  const scrollRestoredRef = useRef<boolean>(false);

  const [dataState, setDataState] = useState<{
    path: string;
    data: M04ResultsReportDto;
  } | null>(() => {
    const cached = peekApiCacheEntry<M04ResultsReportDto>(queryUrl);
    return cached ? { path: queryUrl, data: cached.data } : null;
  });
  const data = dataState && dataState.path === queryUrl ? dataState.data : null;

  const [knownWebsites, setKnownWebsites] = useState<WebsiteConfigItemDto[]>(
    () => peekApiCacheEntry<M04ResultsReportDto>(queryUrl)?.data.coverage.availableWebsites || [],
  );

  const legacyQueryUrl = useMemo(() => {
    const params = new URLSearchParams({
      websiteId: scope.websiteId || 'all',
      preset: scope.preset || '7D',
    });
    if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
      params.set('from', scope.from);
      params.set('to', scope.to);
    }
    return `/api/v1/reports?${params.toString()}`;
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  const [legacyDataState, setLegacyDataState] = useState<{
    path: string;
    data: ReportsDashboardDto;
  } | null>(null);
  const legacyData =
    legacyDataState && legacyDataState.path === legacyQueryUrl ? legacyDataState.data : null;

  const [loading, setLoading] = useState<boolean>(
    () => !peekApiCacheEntry<M04ResultsReportDto>(queryUrl),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [checkedAtIso, setCheckedAtIso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildLeadsDrilldownHref = useCallback(
    (extra: Record<string, string | null | undefined>) => {
      const qs = new URLSearchParams();
      if (
        !Object.prototype.hasOwnProperty.call(extra, 'websiteId') &&
        scope.websiteId &&
        scope.websiteId !== 'all'
      ) {
        qs.set('websiteId', scope.websiteId);
      }
      if (scope.preset) qs.set('preset', scope.preset);
      if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
        qs.set('from', scope.from);
        qs.set('to', scope.to);
      }
      for (const [k, v] of Object.entries(extra)) {
        if (v !== undefined && v !== null && v !== '') {
          qs.set(k, v);
        }
      }
      const s = qs.toString();
      return s ? `/leads?${s}` : '/leads';
    },
    [scope.websiteId, scope.preset, scope.from, scope.to],
  );

  useEffect(() => {
    const entry = peekApiCacheEntry<M04ResultsReportDto>(queryUrl);
    if (entry) {
      setDataState({ path: queryUrl, data: entry.data });
      if (entry.data.coverage.availableWebsites?.length) {
        setKnownWebsites(entry.data.coverage.availableWebsites);
      }
      setCheckedAtIso(new Date(entry.timestamp).toISOString());
      setLoading(false);
      setRefreshing(false);
    } else {
      setDataState(null);
      setLoading(true);
    }
  }, [queryUrl]);

  const loadReports = useCallback(
    async (opts?: { forceFresh?: boolean; silent?: boolean; signal?: AbortSignal } | boolean) => {
      const normalized =
        typeof opts === 'boolean' ? { forceFresh: opts } : opts || {};
      if (!hydrated) return;
      if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

      const requestPath = queryUrl;
      const seq = ++reqSeqRef.current;
      if (normalized.forceFresh && !normalized.silent) {
        setRefreshing(true);
      }
      if (!normalized.silent) setError(null);
      try {
        const res = await apiRequest<M04ResultsReportDto>(requestPath, {
          skipCache: Boolean(normalized.forceFresh || normalized.silent),
          signal: normalized.signal,
          onRevalidated: (fresh) => {
            if (activeQueryUrlRef.current !== requestPath) return;
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
          activeQueryUrlRef.current !== requestPath
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
          setError(err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError);
        }
      } finally {
        if (!normalized.signal?.aborted && seq === reqSeqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [hydrated, queryUrl, scope.preset, scope.from, scope.to],
  );

  useEffect(() => {
    if (!hydrated) return;
    if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;

    const controller = new AbortController();
    const cached = peekApiCacheEntry<M04ResultsReportDto>(queryUrl);
    if (!cached || !cached.isFresh) {
      void loadReports({ forceFresh: false, silent: Boolean(cached), signal: controller.signal });
    }

    const unsubscribe = subscribeDataSync(
      ['reports', 'leads', 'tracking', 'ads', 'design', 'websites'],
      () => {
        void loadReports({ forceFresh: true, silent: true });
      },
    );

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [hydrated, queryUrl, scope.preset, scope.from, scope.to, loadReports]);

  useEffect(() => {
    const nextSig = `${scope.websiteId}|${scope.preset}|${scope.from}|${scope.to}`;
    if (prevScopeSigRef.current !== nextSig) {
      prevScopeSigRef.current = nextSig;
      setPendingPage(1);
    }
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  useEffect(() => {
    saveRouteState('reports', {
      activeSection,
      activeTab,
      pendingPage,
      showPrevPeriod,
      sortCol,
      sortDir,
    });
  }, [activeSection, activeTab, pendingPage, showPrevPeriod, sortCol, sortDir]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scroller = document.getElementById('main-workspace-content');
    if (!scroller) return;
    if (!scrollRestoredRef.current && data) {
      scrollRestoredRef.current = true;
      const saved = loadRouteState<{ scrollTop?: number }>('reports_scroll');
      if (saved?.scrollTop && saved.scrollTop > 0) {
        requestAnimationFrame(() => {
          scroller.scrollTop = saved.scrollTop ?? 0;
        });
      }
    }
    return () => {
      saveRouteState('reports_scroll', { scrollTop: scroller.scrollTop });
    };
  }, [data]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', onSearch as EventListener);
    return () => window.removeEventListener('tt-global-search', onSearch as EventListener);
  }, []);

  useEffect(() => {
    if (activeSection !== 'composer') return;
    if (scope.preset === 'CUSTOM' && (!scope.from || !scope.to)) return;
    const reqUrl = legacyQueryUrl;
    const cached = peekApiCacheEntry<ReportsDashboardDto>(reqUrl);
    if (cached) {
      setLegacyDataState({ path: reqUrl, data: cached.data });
      if (cached.isFresh) return;
    } else {
      setLegacyDataState(null);
    }
    const controller = new AbortController();
    apiRequest<ReportsDashboardDto>(reqUrl, { signal: controller.signal })
      .then((res) => {
        if (!controller.signal.aborted) {
          setLegacyDataState({ path: reqUrl, data: res });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [activeSection, legacyQueryUrl, scope.preset, scope.from, scope.to]);

  const handleSelectSection = (id: string) => {
    const next = VALID_SECTIONS.includes(id as ReportsSectionKey)
      ? (id as ReportsSectionKey)
      : 'overview';
    setActiveSection(next);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      u.searchParams.set('section', next);
      if (next !== 'composer') u.searchParams.delete('view');
      if (next !== 'reconcile') u.searchParams.delete('tab');
      window.history.replaceState(window.history.state, '', u.toString());
    }
  };

  const handleSelectReconcileTab = (tab: ReconcileTabKey) => {
    setActiveTab(tab);
    setSortCol('valid');
    setSortDir('desc');
    const defPair = DEFAULT_RATIO_PAIR[tab];
    setRatioNumKey(defPair.num);
    setRatioDenKey(defPair.den);
    setRatioAsPercent(defPair.asPercent);
  };

  const buildScopedExportParams = () => {
    const start = data?.scope.startDate || scope.from || '';
    const end = data?.scope.endDate || scope.to || '';
    const params = new URLSearchParams({
      websiteId: scope.websiteId || 'all',
      preset: start && end ? 'custom' : scope.preset || '30d',
    });
    if (start) params.set('fromDate', start);
    if (end) params.set('toDate', end);
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

  const formatVnd = useCallback((val: number) => {
    return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
  }, []);

  const adCostComp = useMemo(
    () =>
      formatSafePeriodComparison(
        data?.metrics.adCost ?? data?.metrics.attributedAdCost ?? null,
        data?.previousPeriod?.adCost ?? data?.metrics.previousAdCost ?? null,
      ),
    [data],
  );
  const receivedComp = useMemo(
    () =>
      formatSafePeriodComparison(
        data?.metrics.receivedLeadCount ?? data?.metrics.totalLeadCount ?? null,
        data?.previousPeriod?.receivedLeadCount ?? data?.metrics.previousReceivedLeadCount ?? null,
      ),
    [data],
  );
  const validComp = useMemo(
    () =>
      formatSafePeriodComparison(
        data?.metrics.validLeadCount ?? null,
        data?.previousPeriod?.validLeadCount ?? data?.metrics.previousValidLeadCount ?? null,
      ),
    [data],
  );
  const wonComp = useMemo(
    () =>
      formatSafePeriodComparison(
        data?.metrics.wonLeadCount ?? null,
        data?.previousPeriod?.wonLeadCount ?? data?.metrics.previousWonLeadCount ?? null,
      ),
    [data],
  );
  const cplComp = useMemo(
    () =>
      formatSafePeriodComparison(
        data?.metrics.costPerValidAdLead ?? null,
        data?.previousPeriod?.costPerValidAdLead ?? data?.metrics.previousCostPerValidAdLead ?? null,
      ),
    [data],
  );
  const winRateDeltaPt = useMemo(() => {
    const cur = data?.metrics.winRatePct;
    const prev = data?.previousPeriod?.winRatePct ?? data?.metrics.previousWinRatePct;
    if (cur === null || cur === undefined || prev === null || prev === undefined) {
      return 'Chưa đủ dữ liệu kỳ trước';
    }
    const diff = Number((cur - prev).toFixed(1));
    return `${diff >= 0 ? '+' : ''}${diff} điểm % so kỳ trước`;
  }, [data]);

  const handleSortClick = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const handleSalesSortClick = (col: string) => {
    if (salesSortCol === col) {
      setSalesSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSalesSortCol(col);
      setSalesSortDir('desc');
    }
  };

  const renderSortIcon = (col: string, currentCol = sortCol, currentDir = sortDir) => {
    if (currentCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    return currentDir === 'desc' ? (
      <ArrowDown className="w-3.5 h-3.5 text-[#1E3A8A]" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-[#1E3A8A]" />
    );
  };

  const getAriaSort = (
    col: string,
    currentCol = sortCol,
    currentDir = sortDir,
  ): 'ascending' | 'descending' | 'none' => {
    if (currentCol !== col) return 'none';
    return currentDir === 'asc' ? 'ascending' : 'descending';
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % RECONCILE_TABS.length;
    else if (e.key === 'ArrowLeft')
      nextIdx = (currentIdx - 1 + RECONCILE_TABS.length) % RECONCILE_TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = RECONCILE_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const target = RECONCILE_TABS[nextIdx];
      handleSelectReconcileTab(target.key);
      tabRefs.current[target.key]?.focus();
    }
  };

  const activeReconcileQuery = reconcileSearch.trim().toLowerCase() || searchTerm;

  const sortedWebsites = useMemo(() => {
    const list = (data?.tables.byWebsite || []).filter(
      (r) => !activeReconcileQuery || r.website.toLowerCase().includes(activeReconcileQuery),
    );
    const mult = sortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (Boolean(a.isUnclassifiedWebsite) !== Boolean(b.isUnclassifiedWebsite)) {
        return a.isUnclassifiedWebsite ? 1 : -1;
      }
      if (sortCol === 'lead') return mult * (a.leadCount - b.leadCount);
      if (sortCol === 'adCost') return mult * ((a.adCost ?? -1) - (b.adCost ?? -1));
      if (sortCol === 'cpl') return mult * ((a.cpl ?? 9e12) - (b.cpl ?? 9e12));
      if (sortCol === 'won') return mult * (a.wonCount - b.wonCount);
      return mult * (a.validCount - b.validCount);
    });
  }, [data?.tables.byWebsite, activeReconcileQuery, sortCol, sortDir]);

  const sortedChannels = useMemo(() => {
    const list = (data?.tables.byChannel || []).filter(
      (r) => !activeReconcileQuery || r.channel.toLowerCase().includes(activeReconcileQuery),
    );
    const mult = sortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (sortCol === 'lead') return mult * (a.leadCount - b.leadCount);
      if (sortCol === 'quoted') return mult * (a.quotedCount - b.quotedCount);
      if (sortCol === 'won') return mult * (a.wonCount - b.wonCount);
      return mult * (a.validCount - b.validCount);
    });
  }, [data?.tables.byChannel, activeReconcileQuery, sortCol, sortDir]);

  const sortedCampaigns = useMemo(() => {
    const list = (data?.tables.byCampaign || []).filter(
      (r) =>
        !activeReconcileQuery ||
        r.campaignName.toLowerCase().includes(activeReconcileQuery) ||
        (r.websiteDomain || '').toLowerCase().includes(activeReconcileQuery),
    );
    const mult = sortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (sortCol === 'lead') return mult * (a.receivedLeadCount - b.receivedLeadCount);
      if (sortCol === 'adCost') return mult * ((a.adCost ?? -1) - (b.adCost ?? -1));
      if (sortCol === 'cpl')
        return mult * ((a.costPerValidAdLead ?? 9e12) - (b.costPerValidAdLead ?? 9e12));
      if (sortCol === 'won') return mult * (a.wonLeadCount - b.wonLeadCount);
      if (sortCol === 'clicks') return mult * (a.clicks - b.clicks);
      return mult * (a.validAttributedAdLeadCount - b.validAttributedAdLeadCount);
    });
  }, [data?.tables.byCampaign, activeReconcileQuery, sortCol, sortDir]);

  const sortedSales = useMemo(() => {
    const list = [...(data?.tables.bySales || [])];
    const mult = salesSortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (Boolean(a.isReconciliationBucket) !== Boolean(b.isReconciliationBucket)) {
        return a.isReconciliationBucket ? 1 : -1;
      }
      if (salesSortCol === 'validCount') return mult * (a.validCount - b.validCount);
      if (salesSortCol === 'quotedCount') return mult * (a.quotedCount - b.quotedCount);
      if (salesSortCol === 'waitingCount') return mult * (a.waitingCount - b.waitingCount);
      if (salesSortCol === 'overdueCount') return mult * (a.overdueCount - b.overdueCount);
      if (salesSortCol === 'wonCount') return mult * (a.wonCount - b.wonCount);
      return mult * (a.leadCount - b.leadCount);
    });
  }, [data?.tables.bySales, salesSortCol, salesSortDir]);

  const channelChartRows = useMemo(() => {
    return (data?.tables.byChannel || []).toSorted((a, b) => b.validCount - a.validCount).slice(0, 6);
  }, [data?.tables.byChannel]);

  const maxChannelValid = useMemo(() => {
    return Math.max(1, ...channelChartRows.map((c) => c.validCount));
  }, [channelChartRows]);

  const classifiedProductRows = useMemo(() => {
    return (data?.tables.byProduct || []).filter((p) => !p.isUnclassifiedProduct);
  }, [data?.tables.byProduct]);

  const maxProductLead = useMemo(() => {
    return Math.max(1, ...classifiedProductRows.map((p) => p.leadCount));
  }, [classifiedProductRows]);

  // Helper tính cột A ÷ B
  const ratioOptions = RATIO_METRICS_BY_TAB[activeTab];
  const selectedNumOpt = ratioOptions.find((o) => o.key === ratioNumKey) || ratioOptions[0];
  const selectedDenOpt = ratioOptions.find((o) => o.key === ratioDenKey) || ratioOptions[1] || ratioOptions[0];

  const computeRowRatioLabel = useCallback(
    (rowRecord: Record<string, unknown>) => {
      const numRaw = rowRecord[selectedNumOpt.key];
      const denRaw = rowRecord[selectedDenOpt.key];
      if (numRaw === null || numRaw === undefined || denRaw === null || denRaw === undefined) {
        return '—';
      }
      const num = Number(numRaw);
      const den = Number(denRaw);
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return '—';
      const val = num / den;
      if (ratioAsPercent) {
        return `${(val * 100).toFixed(1)}%`;
      }
      if (selectedNumOpt.kind === 'vnd' && selectedDenOpt.kind === 'count') {
        return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
      }
      return Math.abs(val) >= 100
        ? Math.round(val).toLocaleString('vi-VN')
        : val.toFixed(2);
    },
    [selectedNumOpt, selectedDenOpt, ratioAsPercent],
  );

  const designHrefFromScope = useMemo(() => {
    const qs = new URLSearchParams({
      fromBrief: '1',
      taskCode: 'banner_generate',
      sourceModule: 'reports',
      websiteId: scope.websiteId || 'all',
    });
    if (data?.scope.domain) qs.set('websiteDomain', data.scope.domain);
    if (data?.scope.startDate) qs.set('dateFrom', data.scope.startDate);
    if (data?.scope.endDate) qs.set('dateTo', data.scope.endDate);
    return `/design?${qs.toString()}`;
  }, [scope.websiteId, data?.scope.domain, data?.scope.startDate, data?.scope.endDate]);

  const openBriefModal = () => {
    setBriefTitle(
      `Banner ${data?.scope.websiteLabel || 'Toàn Trung'} (${data?.scope.startDate || ''} → ${data?.scope.endDate || ''})`,
    );
    setBriefObjective(
      data?.marketingInsights?.summaryFindings[0]?.evidenceText ||
        `Tối ưu truyền thông cho phạm vi ${data?.scope.websiteLabel || 'hệ thống'}.`,
    );
    setBriefHeadline('Màn hình LED Toàn Trung · Bảo hành 36 tháng');
    setBriefResultMsg(null);
    setBriefErrorMsg(null);
    setBriefModalOpen(true);
  };

  const handleSubmitMarketingBrief = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!briefTitle.trim()) return;
    setBriefSubmitting(true);
    setBriefErrorMsg(null);
    setBriefResultMsg(null);
    try {
      const matchedWebsite = (data?.coverage.availableWebsites || []).find(
        (w) => w.websiteId === scope.websiteId || w.domain === data?.scope.domain,
      );
      const res = await apiRequest<{ ok: boolean; projectId: number; message: string }>(
        '/api/v1/design',
        {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: {
            action: 'submit_marketing_brief',
            projectName: briefTitle.trim(),
            taskCode: 'banner_generate',
            designType: 'banner',
            sourceModule: 'reports',
            designBrief: {
              objective: briefObjective.trim() || undefined,
              websiteId:
                scope.websiteId !== 'all' ? scope.websiteId : matchedWebsite?.websiteId || null,
              websiteDomain: data?.scope.domain || matchedWebsite?.domain || null,
              targetChannel: briefChannel.trim() || undefined,
              outputFormat: briefFormat.trim() || undefined,
              outputWidthPx: 1536,
              outputHeightPx: 1024,
              headlineText: briefHeadline.trim() || undefined,
              ctaText: briefCta.trim() || undefined,
              baselineSnapshot: data
                ? {
                    capturedAt: new Date().toISOString(),
                    sourceModule: 'reports',
                    scopeLabel: `${data.scope.websiteLabel} (${data.scope.startDate} → ${data.scope.endDate})`,
                    dateFrom: data.scope.startDate,
                    dateTo: data.scope.endDate,
                    websiteId: data.scope.websiteId,
                    websiteDomain: data.scope.domain,
                    metrics: {
                      adCost: data.metrics.adCost ?? data.metrics.attributedAdCost ?? null,
                      receivedLeadCount:
                        data.metrics.receivedLeadCount ?? data.metrics.totalLeadCount,
                      validLeadCount: data.metrics.validLeadCount,
                      costPerValidAdLead: data.metrics.costPerValidAdLead,
                      wonLeadCount: data.metrics.wonLeadCount,
                      winRatePct: data.metrics.winRatePct,
                    },
                  }
                : null,
            },
          },
        },
      );
      setBriefResultMsg(res.message || `Đã tạo yêu cầu thiết kế #${res.projectId}.`);
    } catch (err) {
      setBriefErrorMsg(err instanceof Error ? err.message : 'Không thể gửi yêu cầu thiết kế.');
    } finally {
      setBriefSubmitting(false);
    }
  };

  const totalPendingPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(
      1,
      Math.ceil(data.tables.pendingActionLeads.totalRows / data.tables.pendingActionLeads.pageSize),
    );
  }, [data]);

  const activeAdCost = data?.metrics.adCost ?? data?.metrics.attributedAdCost ?? null;
  const activeReceivedCount =
    data?.metrics.receivedLeadCount ?? data?.metrics.totalLeadCount ?? 0;
  const activeValidAdLeadCount =
    data?.metrics.validAttributedAdLeadCount ?? data?.metrics.validAdLeadCount ?? 0;
  const trackingAdsHref = `/tracking?section=ads_campaigns&websiteId=${encodeURIComponent(scope.websiteId || 'all')}`;

  const navTopItems: VerticalNavItem[] = useMemo(() => [], []);

  const navGroups: VerticalNavGroup[] = useMemo(() => {
    const analyticsGroup: VerticalNavGroup = {
      id: 'analytics',
      label: 'Phân tích hiệu quả',
      defaultOpen: true,
      items: [
        {
          id: 'overview',
          label: 'Chỉ số & Xu hướng',
          icon: LayoutDashboard,
        },
        {
          id: 'reconcile',
          label: 'Đối chiếu nguồn',
          icon: Globe,
        },
        {
          id: 'sales_pipeline',
          label: 'Kinh doanh & Báo giá',
          icon: Users,
          badge: data && data.metrics.overdueQuoteCount > 0 ? data.metrics.overdueQuoteCount : null,
          badgeTone: 'warning',
        },
        {
          id: 'products',
          label: 'Nhu cầu sản phẩm',
          icon: Package,
          badge: classifiedProductRows.length > 0 ? classifiedProductRows.length : null,
        },
      ],
    };

    const docItems: VerticalNavItem[] = [
      {
        id: 'shared_files',
        label: 'Kho dữ liệu chung',
        icon: FolderOpen,
      },
      ...(canExport
        ? [
            {
              id: 'composer',
              label: 'Soạn & Phát hành',
              icon: PenLine,
            },
          ]
        : []),
    ];

    return [
      analyticsGroup,
      {
        id: 'documents',
        label: 'Văn bản & Kho chung',
        defaultOpen: true,
        items: docItems,
      },
    ];
  }, [data, classifiedProductRows.length, canExport]);

  const handleQuickFilterWebsite = (siteDomain: string) => {
    const match = (data?.coverage.availableWebsites || knownWebsites).find(
      (w) => w.domain.toLowerCase() === siteDomain.toLowerCase(),
    );
    if (match) {
      updateScope({ websiteId: match.websiteId });
    }
  };

  return (
    <div className="space-y-4 pb-8">
      <WebsiteDashboardHeader
        title="Báo cáo"
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || knownWebsites}
        websiteSelectorStyle="dropdown"
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
          error || data?.freshness.state === 'ERROR'
            ? 'error'
            : refreshing || loading
              ? 'updating'
              : 'ok'
        }
        onChangeScope={updateScope}
        showCompareToggle={activeSection !== 'composer'}
        compareEnabled={showPrevPeriod}
        onToggleCompare={setShowPrevPeriod}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadReports(true)}
              className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{UI_VOCABULARY.actions.refresh}</span>
            </button>
            {canExport && (
              <>
                <button
                  type="button"
                  onClick={handleExportExcel}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  <span>{UI_VOCABULARY.actions.exportExcel}</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportWord}
                  className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                >
                  <FileText className="h-3.5 w-3.5 text-blue-700" />
                  <span>{UI_VOCABULARY.actions.exportWord}</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <VerticalSectionNav
          ariaLabel="Phân mục báo cáo"
          activeId={activeSection}
          onSelect={handleSelectSection}
          topItems={navTopItems}
          groups={navGroups}
        />

        <div className="flex-1 min-w-0 w-full space-y-4">
          {activeSection === 'shared_files' ? (
            <SharedTeamFilesPanel />
          ) : activeSection === 'composer' && canExport ? (
            legacyData ? (
              <ReportDocComposer
                user={user}
                data={legacyData}
                scope={{
                  websiteId: scope.websiteId || 'all',
                  preset: scope.preset || '7D',
                  from: scope.from,
                  to: scope.to,
                }}
                m04Data={data}
              />
            ) : (
              <div className="rounded-[14px] border border-slate-200 bg-white p-6 text-xs text-slate-500">
                Đang tải trình soạn thảo...
              </div>
            )
          ) : loading && !data ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-[14px] border border-slate-200 bg-white animate-pulse"
                />
              ))}
            </div>
          ) : data ? (
            <>
              {/* ======================= PHÂN MỤC 1: TỔNG QUAN ======================= */}
              {activeSection === 'overview' && (
                <>
                  {((activeReceivedCount > 0 && activeReceivedCount < 30) ||
                    (data.dataQuality?.missingWebsiteCount ?? 0) > 0 ||
                    (data.dataQuality?.missingProductCount ?? 0) > 0) && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/75 px-3.5 py-2.5 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        {activeReceivedCount > 0 && activeReceivedCount < 30 && (
                          <span>
                            Mẫu dữ liệu nhỏ ({activeReceivedCount} Lead), tỷ lệ mang tính tham khảo.
                          </span>
                        )}
                        {((data.dataQuality?.missingProductCount ?? 0) > 0 ||
                          (data.dataQuality?.missingWebsiteCount ?? 0) > 0) && (
                          <span>
                            Dữ liệu cần bổ sung:{' '}
                            <strong>{data.dataQuality?.missingProductCount ?? 0}</strong> chưa gắn sản
                            phẩm · <strong>{data.dataQuality?.missingWebsiteCount ?? 0}</strong> chưa
                            rõ website.
                          </span>
                        )}
                      </div>
                      {((data.dataQuality?.missingProductCount ?? 0) > 0 ||
                        (data.dataQuality?.missingWebsiteCount ?? 0) > 0) && (
                        <Link
                          href={buildLeadsDrilldownHref({})}
                          className="font-semibold text-amber-900 hover:underline shrink-0"
                        >
                          Rà soát trên Lead →
                        </Link>
                      )}
                    </div>
                  )}

                  {/* 6 KPI (3 × 2) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    <Link
                      href={trackingAdsHref}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Chi phí quảng cáo</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-[#0F172A] tabular-nums">
                        {activeAdCost !== null ? formatVnd(activeAdCost) : 'Chưa tách riêng'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 truncate">
                        {showPrevPeriod
                          ? adCostComp.label
                          : data.metrics.adReconciliationNote || 'Chi phí Ads cùng phạm vi'}
                      </div>
                    </Link>

                    <Link
                      href={buildLeadsDrilldownHref({})}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Lead tiếp nhận</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-[#0F172A] tabular-nums">
                        <AnimatedMetricNumber value={activeReceivedCount} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {showPrevPeriod
                          ? receivedComp.label
                          : `${data.scope.startDate} → ${data.scope.endDate}`}
                      </div>
                    </Link>

                    <Link
                      href={buildLeadsDrilldownHref({ quality: 'L2' })}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Lead hợp lệ</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-indigo-700 tabular-nums">
                        <AnimatedMetricNumber value={data.metrics.validLeadCount} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {showPrevPeriod
                          ? validComp.label
                          : `${data.metrics.l3Count} Lead chất lượng`}
                      </div>
                    </Link>

                    <Link
                      href={trackingAdsHref}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>CPL quảng cáo hợp lệ</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-blue-700 tabular-nums">
                        {data.metrics.costPerValidAdLead !== null
                          ? formatVnd(data.metrics.costPerValidAdLead)
                          : 'Chưa đủ dữ liệu'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {showPrevPeriod && data.metrics.costPerValidAdLead !== null
                          ? `${cplComp.label} · ${activeValidAdLeadCount} Lead Ads`
                          : `Trên ${activeValidAdLeadCount} Lead từ quảng cáo`}
                      </div>
                    </Link>

                    <Link
                      href={buildLeadsDrilldownHref({ status: 'won' })}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-emerald-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Chốt thành công</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-emerald-700 tabular-nums">
                        <AnimatedMetricNumber value={data.metrics.wonLeadCount} />
                      </div>
                      <div className="mt-1 text-xs text-slate-500">
                        {showPrevPeriod
                          ? wonComp.label
                          : `${data.metrics.waitingQuoteCount} đang chờ phản hồi báo giá`}
                      </div>
                    </Link>

                    <Link
                      href={buildLeadsDrilldownHref({ status: 'won' })}
                      className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-emerald-300 transition block"
                    >
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                        <span>Tỷ lệ chốt</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-700" />
                      </div>
                      <div className="mt-1.5 text-2xl font-bold text-[#0F172A] tabular-nums">
                        {data.metrics.winRatePct !== null ? `${data.metrics.winRatePct}%` : '—'}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 tabular-nums">
                        {showPrevPeriod
                          ? winRateDeltaPt
                          : `${data.metrics.winRateNumerator}/${data.metrics.winRateDenominator} Lead hợp lệ`}
                      </div>
                    </Link>
                  </div>

                  {/* Hàng biểu đồ: 8/12 SVG xu hướng + 4/12 Kênh / Pipeline */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-8">
                      <ReportsPerformanceChart
                        series={data.timeSeries || []}
                        previousSeries={data.previousTimeSeries || []}
                        compareEnabled={showPrevPeriod}
                        startDate={data.scope.startDate}
                        endDate={data.scope.endDate}
                        loading={loading}
                      />
                    </div>

                    <div className="lg:col-span-4 rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs flex flex-col">
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <h2 className="text-sm font-bold text-[#0F172A]">
                          {rightCardMode === 'channel' ? 'Kênh nguồn' : 'Trạng thái xử lý'}
                        </h2>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
                          <button
                            type="button"
                            onClick={() => setRightCardMode('channel')}
                            className={`px-2 py-1 rounded-md transition ${
                              rightCardMode === 'channel'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Kênh
                          </button>
                          <button
                            type="button"
                            onClick={() => setRightCardMode('pipeline')}
                            className={`px-2 py-1 rounded-md transition ${
                              rightCardMode === 'pipeline'
                                ? 'bg-white text-slate-900 shadow-2xs'
                                : 'text-slate-500 hover:text-slate-800'
                            }`}
                          >
                            Pipeline
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 min-h-[244px] overflow-y-auto pr-1 flex flex-col justify-center">
                        {rightCardMode === 'channel' ? (
                          channelChartRows.length === 0 ? (
                            <div className="text-center text-xs text-slate-500 py-8">
                              Chưa phát sinh Lead hợp lệ trong phạm vi này.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {channelChartRows.map((ch) => {
                                const pctWidth = Math.max(
                                  4,
                                  Math.round((ch.validCount / maxChannelValid) * 100),
                                );
                                return (
                                  <div key={ch.channel} className="space-y-1">
                                    <div className="flex items-center justify-between text-xs">
                                      <span
                                        className="font-medium text-slate-800 truncate pr-2"
                                        title={ch.channel}
                                      >
                                        {ch.channel}
                                      </span>
                                      <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                                        {ch.validCount}
                                        {ch.shareOfValidPct !== null &&
                                        ch.shareOfValidPct !== undefined ? (
                                          <span className="text-slate-400 font-normal">
                                            {' '}
                                            ({ch.shareOfValidPct}%)
                                          </span>
                                        ) : null}
                                      </span>
                                    </div>
                                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-[#1E3A8A] transition-all"
                                        style={{ width: `${pctWidth}%` }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )
                        ) : (data.charts.statusDistribution || []).length === 0 ? (
                          <div className="text-center text-xs text-slate-500 py-8">
                            Chưa có hồ sơ trong phạm vi này.
                          </div>
                        ) : (
                          <div className="space-y-2.5">
                            {(data.charts.statusDistribution || []).map((st) => {
                              const barColor =
                                st.statusKey === 'won'
                                  ? 'bg-emerald-600'
                                  : st.statusKey === 'lost' || st.statusKey === 'spam'
                                    ? 'bg-slate-400'
                                    : st.statusKey === 'quote_sent'
                                      ? 'bg-blue-600'
                                      : 'bg-[#1E3A8A]';
                              return (
                                <div key={st.statusKey} className="space-y-1">
                                  <div className="flex items-center justify-between text-xs">
                                    <span className="font-medium text-slate-800 truncate pr-2">
                                      {st.label}
                                    </span>
                                    <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                                      {st.count}{' '}
                                      <span className="text-slate-400 font-normal">
                                        ({st.pctOfTotal}%)
                                      </span>
                                    </span>
                                  </div>
                                  <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${barColor} transition-all`}
                                      style={{
                                        width: `${Math.max(st.count > 0 ? 4 : 0, Math.round(st.pctOfTotal))}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Điểm cần chú ý & Hành động */}
                  <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-[#0F172A]">Điểm cần chú ý</h2>
                      <div className="flex flex-wrap items-center gap-2">
                        {canCreateSeoContent && (
                          <Link
                            href={`/ads?tab=content&website=${encodeURIComponent(data.scope.domain || 'toantrung.com.vn')}`}
                            className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                          >
                            <PenLine className="w-3.5 h-3.5 text-blue-700" />
                            <span>Đề xuất bài SEO</span>
                          </Link>
                        )}
                        {canRequestDesignBrief &&
                          (canCreateDesignDirect ? (
                            <Link
                              href={designHrefFromScope}
                              className="h-8 px-3 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Tạo brief thiết kế</span>
                            </Link>
                          ) : (
                            <button
                              type="button"
                              onClick={openBriefModal}
                              className="h-8 px-3 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Tạo brief thiết kế</span>
                            </button>
                          ))}
                      </div>
                    </div>

                    {data.marketingInsights && data.marketingInsights.summaryFindings.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {data.marketingInsights.summaryFindings.map((f) => (
                          <div
                            key={f.id}
                            className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 flex flex-col justify-between gap-2"
                          >
                            <div>
                              <div className="text-xs font-bold text-slate-900">{f.title}</div>
                              <p className="text-xs text-slate-600 mt-1">{f.evidenceText}</p>
                            </div>
                            {f.actionHref && f.actionLabel && (
                              <Link
                                href={f.actionHref}
                                className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1 self-start"
                              >
                                <span>{f.actionLabel}</span>
                                <ArrowUpRight className="w-3.5 h-3.5" />
                              </Link>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        Chưa ghi nhận điểm bất thường trong phạm vi đang chọn.
                      </p>
                    )}
                  </div>

                  {/* 1 mục đóng/mở gọn: Cách tính chỉ số */}
                  <details className="rounded-[14px] border border-slate-200 bg-white overflow-hidden">
                    <summary className="px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between hover:bg-slate-50">
                      <span className="inline-flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-[#1E3A8A]" />
                        Cách tính chỉ số
                      </span>
                      <span className="text-[11px] font-normal text-slate-500">Mở rộng</span>
                    </summary>
                    <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-2">
                      <div>
                        <strong>Phạm vi kỳ:</strong> {data.scope.cohortDefinition}
                      </div>
                      <div>
                        <strong>Tỷ lệ chốt:</strong> {data.metrics.winRateDefinition}
                      </div>
                      <div>
                        <strong>CPL quảng cáo hợp lệ:</strong> Chia chi phí quảng cáo thực tế cho số
                        Lead hợp lệ phát sinh từ quảng cáo, không chia bình quân cho toàn bộ Lead.
                      </div>
                      <div>
                        <strong>Lọc chất lượng:</strong>{' '}
                        {METRIC_DICTIONARY.validLeadCount?.formula || 'Loại trừ thư rác'} ·{' '}
                        {METRIC_DICTIONARY.effectiveLeadCount?.formula || 'Loại trừ trùng lặp'}
                      </div>
                      <div>
                        <strong>Phạm vi số liệu:</strong> Báo cáo chỉ hiển thị chi phí quảng cáo, CPL
                        và tỷ lệ chuyển đổi.
                      </div>
                    </div>
                  </details>
                </>
              )}

              {/* ======================= PHÂN MỤC 2: ĐỐI CHIẾU NGUỒN ======================= */}
              {activeSection === 'reconcile' && (
                <div className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/70">
                    <div>
                      <h2 className="text-sm font-bold text-[#0F172A]">Đối chiếu nguồn &amp; hiệu quả</h2>
                      {data.metrics.adReconciliationNote && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {data.metrics.adReconciliationNote}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={reconcileSearch}
                          onChange={(e) => setReconcileSearch(e.target.value)}
                          placeholder="Tìm website, kênh, chiến dịch..."
                          className="h-8 pl-8 pr-2.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-400 w-48 sm:w-56"
                        />
                      </div>

                      <button
                        type="button"
                        aria-pressed={ratioCalcOpen}
                        onClick={() => setRatioCalcOpen((v) => !v)}
                        className={`h-8 px-3 rounded-lg border text-xs font-semibold inline-flex items-center gap-1.5 transition ${
                          ratioCalcOpen
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <Calculator className="w-3.5 h-3.5" />
                        <span>{ratioCalcOpen ? 'Đang bật Tính Nhanh' : 'Tính Nhanh'}</span>
                      </button>

                      <div
                        role="tablist"
                        aria-labelledby={tabListId}
                        className="flex flex-wrap gap-1"
                      >
                        <span id={tabListId} className="sr-only">
                          Chọn nhóm đối chiếu
                        </span>
                        {RECONCILE_TABS.map((t, idx) => {
                          const selected = activeTab === t.key;
                          return (
                            <button
                              key={t.key}
                              ref={(el) => {
                                tabRefs.current[t.key] = el;
                              }}
                              type="button"
                              role="tab"
                              id={`reconcile-tab-${t.key}`}
                              aria-selected={selected}
                              aria-controls={`reconcile-panel-${t.key}`}
                              tabIndex={selected ? 0 : -1}
                              onClick={() => handleSelectReconcileTab(t.key)}
                              onKeyDown={(e) => handleTabKeyDown(e, idx)}
                              className={`h-8 px-3 rounded-lg text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                selected
                                  ? 'bg-[#0B1D48] text-white'
                                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {t.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Thanh tính tỷ lệ A ÷ B */}
                  {ratioCalcOpen && (
                    <div className="px-4 py-2.5 bg-blue-50/60 border-b border-blue-100 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-[#1E3A8A]">Cột tính thêm:</span>
                      <select
                        value={selectedNumOpt.key}
                        onChange={(e) => setRatioNumKey(e.target.value)}
                        aria-label="Tử số A"
                        className="h-8 px-2 rounded-lg border border-blue-200 bg-white text-slate-800 font-medium"
                      >
                        {ratioOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <span className="font-bold text-slate-500">÷</span>
                      <select
                        value={selectedDenOpt.key}
                        onChange={(e) => setRatioDenKey(e.target.value)}
                        aria-label="Mẫu số B"
                        className="h-8 px-2 rounded-lg border border-blue-200 bg-white text-slate-800 font-medium"
                      >
                        {ratioOptions.map((opt) => (
                          <option key={opt.key} value={opt.key}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <label className="inline-flex items-center gap-1.5 ml-1 px-2 py-1 rounded-lg bg-white border border-blue-200 cursor-pointer font-medium text-slate-700">
                        <input
                          type="checkbox"
                          checked={ratioAsPercent}
                          onChange={(e) => setRatioAsPercent(e.target.checked)}
                        />
                        <span>Hiển thị %</span>
                      </label>
                    </div>
                  )}

                  <div
                    role="tabpanel"
                    id={`reconcile-panel-${activeTab}`}
                    aria-labelledby={`reconcile-tab-${activeTab}`}
                    tabIndex={0}
                    className="overflow-x-auto focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-300"
                  >
                    {activeTab === 'website' && (
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Website nguồn</th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('adCost')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('adCost')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chi phí Ads</span>
                                {renderSortIcon('adCost')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('lead')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('lead')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Tiếp nhận</span>
                                {renderSortIcon('lead')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('valid')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('valid')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Hợp lệ</span>
                                {renderSortIcon('valid')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right">Lead từ Ads</th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('cpl')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('cpl')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>CPL Ads</span>
                                {renderSortIcon('cpl')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('won')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('won')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chốt / Tỷ lệ</span>
                                {renderSortIcon('won')}
                              </button>
                            </th>
                            {ratioCalcOpen && (
                              <th className="px-3 py-2.5 text-right text-[#1E3A8A]">
                                {selectedNumOpt.label} ÷ {selectedDenOpt.label}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          {sortedWebsites.length === 0 ? (
                            <tr>
                              <td
                                colSpan={ratioCalcOpen ? 8 : 7}
                                className="px-4 py-8 text-center text-xs text-slate-500"
                              >
                                Không có dữ liệu website khớp bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            sortedWebsites.map((w) => (
                              <tr key={w.website} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 font-medium text-slate-800">
                                  {!w.isUnclassifiedWebsite ? (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickFilterWebsite(w.website)}
                                      className="hover:text-blue-700 hover:underline text-left"
                                      title="Lọc nhanh báo cáo theo website này"
                                    >
                                      {w.website}
                                    </button>
                                  ) : (
                                    <span>{w.website}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {w.adCost !== null && w.adCost !== undefined
                                    ? formatVnd(w.adCost)
                                    : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {w.leadCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {w.validCount}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {w.adLeadCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                                  {w.cpl !== null ? formatVnd(w.cpl) : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                  {w.wonCount}
                                  <span className="text-xs font-normal text-slate-500 ml-1">
                                    (
                                    {w.winRatePct !== null && w.winRatePct !== undefined
                                      ? `${w.winRatePct}%`
                                      : '—'}
                                    )
                                  </span>
                                </td>
                                {ratioCalcOpen && (
                                  <td className="px-3 py-2.5 text-right font-bold text-[#1E3A8A] bg-blue-50/40">
                                    {computeRowRatioLabel(w as unknown as Record<string, unknown>)}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {activeTab === 'channel' && (
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Kênh Marketing</th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('lead')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('lead')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Tiếp nhận</span>
                                {renderSortIcon('lead')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('valid')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('valid')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Hợp lệ</span>
                                {renderSortIcon('valid')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right">Tỷ trọng hợp lệ</th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('quoted')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('quoted')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Đã báo giá</span>
                                {renderSortIcon('quoted')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('won')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('won')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chốt / Tỷ lệ</span>
                                {renderSortIcon('won')}
                              </button>
                            </th>
                            {ratioCalcOpen && (
                              <th className="px-3 py-2.5 text-right text-[#1E3A8A]">
                                {selectedNumOpt.label} ÷ {selectedDenOpt.label}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          {sortedChannels.length === 0 ? (
                            <tr>
                              <td
                                colSpan={ratioCalcOpen ? 7 : 6}
                                className="px-4 py-8 text-center text-xs text-slate-500"
                              >
                                Không có dữ liệu kênh Marketing khớp bộ lọc.
                              </td>
                            </tr>
                          ) : (
                            sortedChannels.map((c) => (
                              <tr key={c.channel} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 font-medium text-slate-800">
                                  {c.channel}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {c.leadCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {c.validCount}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-600">
                                  {c.shareOfValidPct !== null && c.shareOfValidPct !== undefined
                                    ? `${c.shareOfValidPct}%`
                                    : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {c.quotedCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                  {c.wonCount}
                                  <span className="text-xs font-normal text-slate-500 ml-1">
                                    (
                                    {c.winRatePct !== null && c.winRatePct !== undefined
                                      ? `${c.winRatePct}%`
                                      : '—'}
                                    )
                                  </span>
                                </td>
                                {ratioCalcOpen && (
                                  <td className="px-3 py-2.5 text-right font-bold text-[#1E3A8A] bg-blue-50/40">
                                    {computeRowRatioLabel(c as unknown as Record<string, unknown>)}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}

                    {activeTab === 'campaign' && (
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-xs uppercase text-slate-600 border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Chiến dịch</th>
                            <th className="px-3 py-2.5">Website gắn</th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('adCost')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('adCost')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chi phí</span>
                                {renderSortIcon('adCost')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('clicks')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('clicks')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Clicks</span>
                                {renderSortIcon('clicks')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('valid')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('valid')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Lead từ Ads</span>
                                {renderSortIcon('valid')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('cpl')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('cpl')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>CPL Ads</span>
                                {renderSortIcon('cpl')}
                              </button>
                            </th>
                            <th className="px-3 py-2.5 text-right" aria-sort={getAriaSort('won')}>
                              <button
                                type="button"
                                onClick={() => handleSortClick('won')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chốt</span>
                                {renderSortIcon('won')}
                              </button>
                            </th>
                            {ratioCalcOpen && (
                              <th className="px-3 py-2.5 text-right text-[#1E3A8A]">
                                {selectedNumOpt.label} ÷ {selectedDenOpt.label}
                              </th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 tabular-nums">
                          {sortedCampaigns.length === 0 ? (
                            <tr>
                              <td
                                colSpan={ratioCalcOpen ? 8 : 7}
                                className="px-4 py-8 text-center text-xs text-slate-500"
                              >
                                Không có chiến dịch phù hợp trong phạm vi đang chọn.
                              </td>
                            </tr>
                          ) : (
                            sortedCampaigns.map((camp) => (
                              <tr key={camp.campaignId} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5">
                                  <div className="font-medium text-slate-800">
                                    {camp.campaignName}
                                  </div>
                                  <div className="text-[11px] text-slate-500">
                                    {camp.attributionStatus === 'MULTI_WEBSITE_UNSPLIT'
                                      ? 'Chạy chung nhiều website'
                                      : camp.attributionStatus === 'UNATTRIBUTED'
                                        ? 'Chưa rõ tên miền đích'
                                        : camp.platform === 'google_ads'
                                          ? 'Google Ads'
                                          : camp.platform}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-xs text-slate-600">
                                  {camp.websiteDomain || 'Dùng chung'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-slate-900">
                                  {camp.adCost !== null ? formatVnd(camp.adCost) : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right text-slate-700">
                                  {camp.clicks.toLocaleString('vi-VN')}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                  {camp.validAttributedAdLeadCount}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                                  {camp.costPerValidAdLead !== null
                                    ? formatVnd(camp.costPerValidAdLead)
                                    : '—'}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                                  {camp.wonLeadCount}
                                </td>
                                {ratioCalcOpen && (
                                  <td className="px-3 py-2.5 text-right font-bold text-[#1E3A8A] bg-blue-50/40">
                                    {computeRowRatioLabel(
                                      camp as unknown as Record<string, unknown>,
                                    )}
                                  </td>
                                )}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}

              {/* ======================= PHÂN MỤC 3: KINH DOANH & BÁO GIÁ ======================= */}
              {activeSection === 'sales_pipeline' && (
                <div className="space-y-4">
                  {data.periodActivity && (
                    <section className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-sm font-bold text-[#0F172A]">
                          Hoạt động xử lý trong kỳ
                        </h2>
                        <span className="text-xs text-slate-500">
                          {data.periodActivity.definitionNote}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-medium text-slate-500">Tiếp nhận</div>
                          <div className="mt-1 text-lg font-bold text-slate-900 tabular-nums">
                            {data.periodActivity.receivedInPeriodCount}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-medium text-slate-500">Gửi báo giá</div>
                          <div className="mt-1 text-lg font-bold text-indigo-700 tabular-nums">
                            {data.periodActivity.quotedInPeriodCount}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-medium text-slate-500">Chốt đơn</div>
                          <div className="mt-1 text-lg font-bold text-emerald-700 tabular-nums">
                            {data.periodActivity.wonInPeriodCount}
                          </div>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                          <div className="text-[11px] font-medium text-slate-500">Đóng / Trượt</div>
                          <div className="mt-1 text-lg font-bold text-slate-700 tabular-nums">
                            {data.periodActivity.lostInPeriodCount}
                          </div>
                        </div>
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                          <div className="text-[11px] font-medium text-amber-800">
                            Từ kỳ trước chuyển sang
                          </div>
                          <div className="mt-1 text-lg font-bold text-amber-900 tabular-nums">
                            {data.periodActivity.fromPriorCohortCount}
                          </div>
                        </div>
                      </div>
                    </section>
                  )}

                  {/* Bảng hiệu suất Sales */}
                  <section className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/70">
                      <h2 className="text-sm font-bold text-[#0F172A]">
                        Hiệu suất theo nhân sự Kinh doanh
                      </h2>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {sortedSales.length} nhân sự / nhóm
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left tabular-nums">
                        <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Sales phụ trách</th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('leadCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('leadCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Tiếp nhận</span>
                                {renderSortIcon('leadCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('validCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('validCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Hợp lệ</span>
                                {renderSortIcon('validCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('quotedCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('quotedCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Đã báo giá</span>
                                {renderSortIcon('quotedCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('waitingCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('waitingCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chờ phản hồi</span>
                                {renderSortIcon('waitingCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('overdueCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('overdueCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Quá hạn &gt;7n</span>
                                {renderSortIcon('overdueCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                            <th
                              className="px-3 py-2.5 text-right"
                              aria-sort={getAriaSort('wonCount', salesSortCol, salesSortDir)}
                            >
                              <button
                                type="button"
                                onClick={() => handleSalesSortClick('wonCount')}
                                className="inline-flex items-center gap-1 hover:text-slate-900"
                              >
                                <span>Chốt / Tỷ lệ</span>
                                {renderSortIcon('wonCount', salesSortCol, salesSortDir)}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {sortedSales.length === 0 ? (
                            <tr>
                              <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                                Chưa có dữ liệu nhân sự trong kỳ chọn.
                              </td>
                            </tr>
                          ) : (
                            sortedSales.map((s) => {
                              const rate =
                                s.validCount > 0
                                  ? `${((s.wonCount / s.validCount) * 100).toFixed(1)}%`
                                  : '—';
                              return (
                                <tr key={s.salesId} className="hover:bg-slate-50">
                                  <td className="px-4 py-2.5 font-medium text-slate-800">
                                    {s.salesName}
                                    {s.roleLabel ? (
                                      <span className="text-slate-400 ml-1">({s.roleLabel})</span>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">{s.leadCount}</td>
                                  <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                                    {s.validCount}
                                  </td>
                                  <td className="px-3 py-2.5 text-right">{s.quotedCount}</td>
                                  <td className="px-3 py-2.5 text-right">{s.waitingCount}</td>
                                  <td className="px-3 py-2.5 text-right text-amber-700 font-semibold">
                                    {s.overdueCount}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-emerald-700 font-semibold">
                                    {s.wonCount}{' '}
                                    <span className="text-slate-500 font-normal">({rate})</span>
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Bảng hồ sơ báo giá chờ phản hồi */}
                  <section className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/70">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-600" />
                        <h2 className="text-sm font-bold text-[#0F172A]">
                          Hồ sơ đã gửi báo giá chờ phản hồi (
                          {data.tables.pendingActionLeads.totalRows})
                        </h2>
                      </div>
                      <Link
                        href={buildLeadsDrilldownHref({ status: 'quote_sent' })}
                        className="text-xs font-semibold text-blue-700 hover:underline"
                      >
                        Xem trên trang Lead →
                      </Link>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs text-left tabular-nums">
                        <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Mã Lead</th>
                            <th className="px-3 py-2.5">Khách hàng / Dự án</th>
                            <th className="px-3 py-2.5">Sales</th>
                            <th className="px-3 py-2.5">Website</th>
                            <th className="px-4 py-2.5 text-right">Đã chờ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.tables.pendingActionLeads.rows.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                                Không có hồ sơ báo giá chờ phản hồi trong phạm vi đang chọn.
                              </td>
                            </tr>
                          ) : (
                            data.tables.pendingActionLeads.rows.map((p) => (
                              <tr key={p.leadId} className="hover:bg-slate-50">
                                <td className="px-4 py-2.5 font-semibold text-[#1E3A8A]">
                                  <Link
                                    href={buildLeadsDrilldownHref({
                                      highlightLeadId: String(p.leadId),
                                    })}
                                    className="hover:underline"
                                  >
                                    {p.leadCode}
                                  </Link>
                                </td>
                                <td className="px-3 py-2.5 text-slate-800">{p.customerLabel}</td>
                                <td className="px-3 py-2.5 text-slate-600">{p.assignedSalesName}</td>
                                <td className="px-3 py-2.5 text-slate-600">{p.website}</td>
                                <td className="px-4 py-2.5 text-right font-semibold">
                                  <span
                                    className={`inline-flex px-2 py-0.5 rounded-full text-[11px] ${
                                      p.waitingDays >= 7
                                        ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                        : 'bg-amber-50 text-amber-700'
                                    }`}
                                  >
                                    {p.waitingDays} ngày
                                  </span>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                    {totalPendingPages > 1 && (
                      <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
                        <button
                          type="button"
                          disabled={pendingPage <= 1}
                          onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                          className="p-1.5 rounded border border-slate-200 disabled:opacity-40"
                          aria-label="Trang trước"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="tabular-nums">
                          Trang {pendingPage}/{totalPendingPages}
                        </span>
                        <button
                          type="button"
                          disabled={pendingPage >= totalPendingPages}
                          onClick={() => setPendingPage((p) => Math.min(totalPendingPages, p + 1))}
                          className="p-1.5 rounded border border-slate-200 disabled:opacity-40"
                          aria-label="Trang sau"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ======================= PHÂN MỤC 4: NHU CẦU SẢN PHẨM ======================= */}
              {activeSection === 'products' && (
                <div className="space-y-4">
                  <section className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-sm font-bold text-[#0F172A]">
                        Phân bố nhu cầu theo dòng sản phẩm
                      </h2>
                      {data.charts.multiProductNote && (
                        <span className="text-xs text-slate-500">
                          {data.charts.multiProductNote}
                        </span>
                      )}
                    </div>
                    {classifiedProductRows.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        Chưa có Lead gắn dòng sản phẩm trong kỳ đang chọn.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                        {classifiedProductRows.slice(0, 10).map((p) => {
                          const wPct = Math.max(4, Math.round((p.leadCount / maxProductLead) * 100));
                          return (
                            <div key={p.productId} className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-medium text-slate-800 truncate pr-2">
                                  {p.productName}
                                </span>
                                <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                                  {p.leadCount} lượt hỏi ·{' '}
                                  <span className="text-emerald-700">{p.wonCount} chốt</span>
                                </span>
                              </div>
                              <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-[#1E3A8A]"
                                  style={{ width: `${wPct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  <section className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
                    <MktSpreadsheetCalcBar
                      title={`Chi tiết theo dòng sản phẩm (${data.tables.byProduct.length})`}
                      excelMode={quickCalc.excelMode}
                      onToggleExcelMode={quickCalc.toggleExcelMode}
                      stats={quickCalc.stats}
                      onClear={quickCalc.clearSelection}
                    />
                    <div tabIndex={0} role="region" aria-label="Bảng nhu cầu sản phẩm" className="overflow-x-auto">
                      <table className={`w-full text-xs text-left tabular-nums border-separate border-spacing-0 ${quickCalc.excelMode ? '[&_td]:border-r [&_td]:border-b [&_td]:border-slate-200/80 [&_th]:border-r [&_th]:border-b [&_th]:border-slate-200' : ''}`}>
                        <thead className="bg-slate-100 text-slate-600 uppercase border-b border-slate-200">
                          <tr>
                            <th className="px-4 py-2.5">Sản phẩm</th>
                            <th className="px-3 py-2.5 text-right">Lead quan tâm</th>
                            <th className="px-3 py-2.5 text-right">Hợp lệ</th>
                            <th className="px-3 py-2.5 text-right">Đã báo giá</th>
                            <th className="px-3 py-2.5 text-right">Chốt</th>
                            <th className="px-4 py-2.5 text-right">Tỷ lệ chốt</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data.tables.byProduct.length === 0 ? (
                            <tr>
                              <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                                Chưa có dữ liệu sản phẩm trong phạm vi đang chọn.
                              </td>
                            </tr>
                          ) : (
                            data.tables.byProduct.map((p) => {
                              const winPctNum =
                                p.validCount > 0 ? Number(((p.wonCount / p.validCount) * 100).toFixed(1)) : null;
                              const winPct = winPctNum !== null ? `${winPctNum}%` : '—';
                              return (
                                <tr
                                  key={`${p.productId}-${p.productName}`}
                                  className="odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/30"
                                >
                                  <td className="px-4 py-2.5 font-medium text-slate-800">
                                    {p.productName}
                                  </td>
                                  <td
                                    onClick={() => quickCalc.toggleCell(`prod:${p.productId}:lead`, 'Lead quan tâm', p.leadCount)}
                                    className={`px-3 py-2.5 text-right ${quickCalc.cellClass(`prod:${p.productId}:lead`)}`}
                                  >
                                    {p.leadCount}
                                  </td>
                                  <td
                                    onClick={() => quickCalc.toggleCell(`prod:${p.productId}:valid`, 'Hợp lệ', p.validCount)}
                                    className={`px-3 py-2.5 text-right font-semibold text-indigo-700 ${quickCalc.cellClass(`prod:${p.productId}:valid`)}`}
                                  >
                                    {p.validCount}
                                  </td>
                                  <td
                                    onClick={() => quickCalc.toggleCell(`prod:${p.productId}:quoted`, 'Đã báo giá', p.quotedCount)}
                                    className={`px-3 py-2.5 text-right ${quickCalc.cellClass(`prod:${p.productId}:quoted`)}`}
                                  >
                                    {p.quotedCount}
                                  </td>
                                  <td
                                    onClick={() => quickCalc.toggleCell(`prod:${p.productId}:won`, 'Chốt', p.wonCount)}
                                    className={`px-3 py-2.5 text-right font-semibold text-emerald-700 ${quickCalc.cellClass(`prod:${p.productId}:won`)}`}
                                  >
                                    {p.wonCount}
                                  </td>
                                  <td
                                    onClick={() => quickCalc.toggleCell(`prod:${p.productId}:win`, 'Tỷ lệ chốt', winPctNum)}
                                    className={`px-4 py-2.5 text-right text-slate-600 ${quickCalc.cellClass(`prod:${p.productId}:win`)}`}
                                  >
                                    {winPct}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Modal gửi Brief thiết kế */}
      <dialog
        ref={briefDialogRef}
        aria-labelledby="reports-brief-dialog-title"
        onClose={() => setBriefModalOpen(false)}
        {...({ closedby: 'any' } as Record<string, unknown>)}
        className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-0 backdrop:bg-slate-900/45 backdrop:backdrop-blur-xs overscroll-contain"
      >
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h2 id="reports-brief-dialog-title" className="text-sm font-bold text-[#0F172A]">
              Tạo Brief thiết kế
            </h2>
            <p className="text-xs text-slate-500">
              Kèm số liệu kỳ đang chọn ({data?.scope.websiteLabel} · {data?.scope.startDate} →{' '}
              {data?.scope.endDate})
            </p>
          </div>
          <button
            type="button"
            onClick={() => briefDialogRef.current?.close()}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200/70"
            aria-label="Đóng"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmitMarketingBrief} className="p-5 space-y-3 text-xs">
          <div>
            <label htmlFor="reports-brief-title" className="block font-semibold text-slate-700 mb-1">
              Tên yêu cầu / ấn phẩm *
            </label>
            <input
              id="reports-brief-title"
              type="text"
              required
              autoFocus
              value={briefTitle}
              onChange={(e) => setBriefTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label
              htmlFor="reports-brief-objective"
              className="block font-semibold text-slate-700 mb-1"
            >
              Mục tiêu chiến dịch
            </label>
            <textarea
              id="reports-brief-objective"
              rows={2}
              value={briefObjective}
              onChange={(e) => setBriefObjective(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reports-brief-channel"
                className="block font-semibold text-slate-700 mb-1"
              >
                Kênh sử dụng
              </label>
              <input
                id="reports-brief-channel"
                type="text"
                value={briefChannel}
                onChange={(e) => setBriefChannel(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label
                htmlFor="reports-brief-format"
                className="block font-semibold text-slate-700 mb-1"
              >
                Định dạng &amp; kích thước
              </label>
              <input
                id="reports-brief-format"
                type="text"
                value={briefFormat}
                onChange={(e) => setBriefFormat(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reports-brief-headline"
                className="block font-semibold text-slate-700 mb-1"
              >
                Tiêu đề chính
              </label>
              <input
                id="reports-brief-headline"
                type="text"
                value={briefHeadline}
                onChange={(e) => setBriefHeadline(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="reports-brief-cta" className="block font-semibold text-slate-700 mb-1">
                Nút kêu gọi hành động
              </label>
              <input
                id="reports-brief-cta"
                type="text"
                value={briefCta}
                onChange={(e) => setBriefCta(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
              />
            </div>
          </div>

          {briefErrorMsg && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-red-700">
              {briefErrorMsg}
            </div>
          )}
          {briefResultMsg && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{briefResultMsg}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => briefDialogRef.current?.close()}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold"
            >
              Đóng
            </button>
            <button
              type="submit"
              disabled={briefSubmitting}
              className="h-9 px-4 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{briefSubmitting ? 'Đang gửi...' : 'Gửi yêu cầu thiết kế'}</span>
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
