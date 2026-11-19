'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  FileText,
  Layers,
  PenLine,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from 'lucide-react';
import { apiRequest, peekApiCache, prefetchApiCache } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { ReportDocComposer } from './ReportDocComposer';

type ReconcileTabKey = 'website' | 'channel' | 'campaign';
type SortDirection = 'asc' | 'desc';

const RECONCILE_TABS: Array<{ key: ReconcileTabKey; label: string }> = [
  { key: 'website', label: 'Website' },
  { key: 'channel', label: 'Kênh' },
  { key: 'campaign', label: 'Chiến dịch' },
];

export function ReportsWorkspace() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope();
  const tabListId = useId();

  const [pendingPage, setPendingPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<ReconcileTabKey>('website');
  const [sortCol, setSortCol] = useState<string>('valid');
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [showPrevPeriod, setShowPrevPeriod] = useState<boolean>(true);
  const [reportViewMode, setReportViewMode] = useState<'dashboard' | 'doc_composer'>('dashboard');

  // Inline Marketing Brief Modal (for users creating a Design Brief from /reports)
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
    const dialog = briefDialogRef.current;
    if (!dialog) return;
    if (briefModalOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
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
      const isDialogContent =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (isDialogContent) return;
      dialog.close();
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

  const [data, setData] = useState<M04ResultsReportDto | null>(() =>
    peekApiCache<M04ResultsReportDto>(queryUrl),
  );
  const [legacyData, setLegacyData] = useState<ReportsDashboardDto | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !peekApiCache<M04ResultsReportDto>(queryUrl));
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredSeriesIdx, setHoveredSeriesIdx] = useState<number | null>(null);

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

  const loadReports = useCallback(
    async (forceFresh = false, signal?: AbortSignal) => {
      if (!hydrated) return;
      const cached = !forceFresh ? peekApiCache<M04ResultsReportDto>(queryUrl) : null;
      if (cached) {
        setData(cached);
        setLoading(false);
        setRefreshing(false);
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

  // Nạp trước ngầm các mốc ngày còn lại để bấm Hôm nay / Hôm qua / 7 ngày / 30 ngày lên số tức thì
  useEffect(() => {
    if (!hydrated || !data) return;
    const timer = window.setTimeout(() => {
      const presets: Array<'TODAY' | 'YESTERDAY' | '7D' | '30D'> = ['TODAY', 'YESTERDAY', '7D', '30D'];
      for (const preset of presets) {
        if (preset === scope.preset) continue;
        const qs = new URLSearchParams({
          view: 'spec',
          websiteId: scope.websiteId || 'all',
          preset,
          pendingPage: '1',
          pageSize: '20',
        });
        prefetchApiCache(`/api/v1/reports?${qs.toString()}`);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [hydrated, Boolean(data), scope.websiteId, scope.preset]);

  useEffect(() => {
    setPendingPage(1);
    setLegacyData(null);
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  useEffect(() => {
    const onSearch = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', onSearch as EventListener);
    return () => window.removeEventListener('tt-global-search', onSearch as EventListener);
  }, []);

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
    return new URLSearchParams({
      websiteId: scope.websiteId || 'all',
      preset: 'custom',
      fromDate: data?.scope.startDate || scope.from || '',
      toDate: data?.scope.endDate || scope.to || '',
    });
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

  // Safe comparisons against equal-length previous period (handles 0 & null safely)
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
    if (cur === null || cur === undefined || prev === null || prev === undefined) return 'Chưa đủ dữ liệu kỳ trước';
    const diff = Number((cur - prev).toFixed(1));
    return `${diff >= 0 ? '+' : ''}${diff} điểm % vs kỳ trước`;
  }, [data]);

  const handleSortClick = (col: string) => {
    if (sortCol === col) {
      setSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  };

  const renderSortIcon = (col: string) => {
    if (sortCol !== col) return <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />;
    return sortDir === 'desc' ? (
      <ArrowDown className="w-3.5 h-3.5 text-[#1E3A8A]" />
    ) : (
      <ArrowUp className="w-3.5 h-3.5 text-[#1E3A8A]" />
    );
  };

  const getAriaSort = (col: string): 'ascending' | 'descending' | 'none' => {
    if (sortCol !== col) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  };

  const handleTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIdx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (currentIdx + 1) % RECONCILE_TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (currentIdx - 1 + RECONCILE_TABS.length) % RECONCILE_TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = RECONCILE_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const target = RECONCILE_TABS[nextIdx];
      setActiveTab(target.key);
      tabRefs.current[target.key]?.focus();
    }
  };

  const sortedWebsites = useMemo(() => {
    const list = (data?.tables.byWebsite || []).filter(
      (r) => !searchTerm || r.website.toLowerCase().includes(searchTerm),
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
  }, [data?.tables.byWebsite, searchTerm, sortCol, sortDir]);

  const sortedChannels = useMemo(() => {
    const list = (data?.tables.byChannel || []).filter(
      (r) => !searchTerm || r.channel.toLowerCase().includes(searchTerm),
    );
    const mult = sortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (sortCol === 'lead') return mult * (a.leadCount - b.leadCount);
      if (sortCol === 'quoted') return mult * (a.quotedCount - b.quotedCount);
      if (sortCol === 'won') return mult * (a.wonCount - b.wonCount);
      return mult * (a.validCount - b.validCount);
    });
  }, [data?.tables.byChannel, searchTerm, sortCol, sortDir]);

  const sortedCampaigns = useMemo(() => {
    const list = (data?.tables.byCampaign || []).filter(
      (r) =>
        !searchTerm ||
        r.campaignName.toLowerCase().includes(searchTerm) ||
        (r.websiteDomain || '').toLowerCase().includes(searchTerm),
    );
    const mult = sortDir === 'asc' ? 1 : -1;
    return list.toSorted((a, b) => {
      if (sortCol === 'lead') return mult * (a.receivedLeadCount - b.receivedLeadCount);
      if (sortCol === 'adCost') return mult * ((a.adCost ?? -1) - (b.adCost ?? -1));
      if (sortCol === 'cpl') return mult * ((a.costPerValidAdLead ?? 9e12) - (b.costPerValidAdLead ?? 9e12));
      if (sortCol === 'won') return mult * (a.wonLeadCount - b.wonLeadCount);
      if (sortCol === 'clicks') return mult * (a.clicks - b.clicks);
      return mult * (a.validAttributedAdLeadCount - b.validAttributedAdLeadCount);
    });
  }, [data?.tables.byCampaign, searchTerm, sortCol, sortDir]);

  const channelChartRows = useMemo(() => {
    return (data?.tables.byChannel || []).toSorted((a, b) => b.validCount - a.validCount).slice(0, 6);
  }, [data?.tables.byChannel]);

  const maxChannelValid = useMemo(() => {
    return Math.max(1, ...channelChartRows.map((c) => c.validCount));
  }, [channelChartRows]);

  const timeSeriesPoints = useMemo(() => data?.timeSeries || [], [data?.timeSeries]);
  const maxSeriesVal = useMemo(() => {
    const vals = timeSeriesPoints.map((p) => Math.max(p.receivedLeadCount ?? 0, p.validLeadCount ?? 0));
    return Math.max(1, ...vals);
  }, [timeSeriesPoints]);

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
      `Banner chiến dịch ${data?.scope.websiteLabel || 'Toàn Trung'} (${data?.scope.startDate || ''} → ${data?.scope.endDate || ''})`,
    );
    setBriefObjective(
      data?.marketingInsights?.summaryFindings[0]?.evidenceText ||
        `Tối ưu sáng tạo truyền thông cho phạm vi ${data?.scope.websiteLabel || 'hệ thống'}.`,
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
      const res = await apiRequest<{ ok: boolean; projectId: number; message: string }>('/api/v1/design', {
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
            websiteId: scope.websiteId !== 'all' ? scope.websiteId : matchedWebsite?.websiteId || null,
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
                    receivedLeadCount: data.metrics.receivedLeadCount ?? data.metrics.totalLeadCount,
                    validLeadCount: data.metrics.validLeadCount,
                    costPerValidAdLead: data.metrics.costPerValidAdLead,
                    wonLeadCount: data.metrics.wonLeadCount,
                    winRatePct: data.metrics.winRatePct,
                  },
                }
              : null,
          },
        },
      });
      setBriefResultMsg(
        res.message || `Đã tạo yêu cầu thiết kế #${res.projectId} kèm baseline số liệu Marketing.`,
      );
    } catch (err) {
      setBriefErrorMsg(err instanceof Error ? err.message : 'Không thể gửi brief thiết kế.');
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
  const activeReceivedCount = data?.metrics.receivedLeadCount ?? data?.metrics.totalLeadCount ?? 0;
  const activeValidAdLeadCount = data?.metrics.validAttributedAdLeadCount ?? data?.metrics.validAdLeadCount ?? 0;

  return (
    <div className="space-y-4 pb-8">
      {/* 1. HEADER: Tiêu đề "Hiệu quả Marketing", website, khoảng ngày, so sánh kỳ trước và 1 trạng thái dữ liệu */}
      <WebsiteDashboardHeader
        title="Hiệu quả Marketing"
        subtitle="Hoạt động Marketing đem lại kết quả gì? · Đối chiếu chi phí → Lead → chất lượng → kết quả xử lý"
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || []}
        freshnessMessage={data?.freshness.statusMessage}
        freshnessTone={refreshing || loading ? 'updating' : data?.freshness.state === 'ERROR' ? 'error' : 'ok'}
        onChangeScope={updateScope}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="h-9 px-2.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPrevPeriod}
                onChange={(e) => setShowPrevPeriod(e.target.checked)}
                className="rounded border-slate-300 text-[#1E3A8A]"
              />
              <span>So sánh kỳ trước</span>
            </label>
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
                  <span>{reportViewMode === 'doc_composer' ? 'Về bảng số liệu' : 'Soạn văn bản'}</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {error && (
        <div className="rounded-[12px] border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {reportViewMode === 'doc_composer' ? (
        legacyData ? (
          <ReportDocComposer user={user} data={legacyData} />
        ) : (
          <div className="rounded-[14px] border border-slate-200 bg-white p-6 text-xs text-slate-500">
            Đang tải dữ liệu trình soạn thảo báo cáo...
          </div>
        )
      ) : loading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-[14px] border border-slate-200 bg-white animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* 2. SÁU KPI GỌN, BỐ TRÍ 3 × 2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {/* KPI 1: Chi phí quảng cáo */}
            <Link
              href={`/tracking?tab=ads&websiteId=${encodeURIComponent(scope.websiteId || 'all')}`}
              className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Chi phí quảng cáo</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
              </div>
              <div className="mt-1.5 text-2xl font-bold text-[#0F172A] tabular-nums">
                {activeAdCost !== null ? formatVnd(activeAdCost) : 'Chưa tách riêng'}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {showPrevPeriod ? adCostComp.label : 'Chi tiêu Ads thực tế cùng phạm vi'}
              </div>
            </Link>

            {/* KPI 2: Lead tiếp nhận */}
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
              <div className="mt-1 text-xs text-slate-500">
                {showPrevPeriod
                  ? receivedComp.label
                  : `Tập tạo trong kỳ (${data.scope.startDate} → ${data.scope.endDate})`}
              </div>
            </Link>

            {/* KPI 3: Lead hợp lệ */}
            <Link
              href={buildLeadsDrilldownHref({ quality: 'L2' })}
              className="group rounded-[14px] border border-slate-200 bg-white p-4 shadow-xs hover:border-blue-300 transition block"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>Lead hợp lệ (L2)</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-700" />
              </div>
              <div className="mt-1.5 text-2xl font-bold text-indigo-700 tabular-nums">
                <AnimatedMetricNumber value={data.metrics.validLeadCount} />
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {showPrevPeriod
                  ? validComp.label
                  : `${data.metrics.l3Count} Lead hiệu quả (L3)`}
              </div>
            </Link>

            {/* KPI 4: CPL quảng cáo hợp lệ */}
            <Link
              href={`/tracking?tab=ads&websiteId=${encodeURIComponent(scope.websiteId || 'all')}`}
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
                  ? `${cplComp.label} · Mẫu số ${activeValidAdLeadCount} Lead Ads`
                  : `Mẫu số: ${activeValidAdLeadCount} Lead Ads L2 đối soát`}
              </div>
            </Link>

            {/* KPI 5: Chốt thành công */}
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

            {/* KPI 6: Tỷ lệ chốt */}
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
              <div className="mt-1 text-xs text-slate-500">
                {showPrevPeriod
                  ? winRateDeltaPt
                  : `${data.metrics.winRateNumerator}/${data.metrics.winRateDenominator} Lead hợp lệ (L2)`}
              </div>
            </Link>
          </div>

          {/* 3. HÀNG BIỂU ĐỒ (240–280px plot height): 8/12 chuỗi thời gian Lead & 4/12 kênh đem về Lead hợp lệ */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-sm font-bold text-[#0F172A]">
                    Lead tiếp nhận / hợp lệ theo thời gian
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ngày 0 Lead được vẽ sát đáy (0); ngày chưa đến/thiếu dữ liệu để ngắt nét
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs font-medium text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-300 inline-block" />
                    Lead tiếp nhận
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-xs bg-[#1E3A8A] inline-block" />
                    Lead hợp lệ (L2)
                  </span>
                </div>
              </div>

              <div className="relative h-[256px] w-full flex flex-col justify-end">
                {timeSeriesPoints.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Chưa có chuỗi ngày trong kỳ chọn.
                  </div>
                ) : (
                  <>
                    <svg
                      viewBox="0 0 760 220"
                      className="w-full h-[220px] overflow-visible"
                      role="img"
                      aria-label="Biểu đồ Lead tiếp nhận và hợp lệ theo ngày"
                    >
                      {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                        const y = 190 - ratio * 165;
                        const labelVal = Math.round(maxSeriesVal * ratio);
                        return (
                          <g key={ratio}>
                            <line
                              x1="34"
                              y1={y}
                              x2="752"
                              y2={y}
                              stroke="#E2E8F0"
                              strokeDasharray={ratio === 0 ? undefined : '3 3'}
                            />
                            <text x="0" y={y + 4} fontSize="10" fill="#64748B">
                              {labelVal}
                            </text>
                          </g>
                        );
                      })}
                      {timeSeriesPoints.map((pt, idx) => {
                        const slotW = (752 - 38) / Math.max(1, timeSeriesPoints.length);
                        const barW = Math.max(4, Math.min(20, slotW * 0.62));
                        const xCenter = 38 + slotW * idx + slotW / 2;
                        const isHovered = hoveredSeriesIdx === idx;
                        if (pt.isMissingDay || pt.receivedLeadCount === null) {
                          return (
                            <g key={pt.bucketStart}>
                              <line
                                x1={xCenter - barW / 2}
                                y1="190"
                                x2={xCenter + barW / 2}
                                y2="190"
                                stroke="#CBD5E1"
                                strokeWidth="2"
                                strokeDasharray="2 2"
                              />
                            </g>
                          );
                        }
                        const recH = Math.round(((pt.receivedLeadCount ?? 0) / maxSeriesVal) * 165);
                        const valH = Math.round(((pt.validLeadCount ?? 0) / maxSeriesVal) * 165);
                        return (
                          <g
                            key={pt.bucketStart}
                            onMouseEnter={() => setHoveredSeriesIdx(idx)}
                            onMouseLeave={() => setHoveredSeriesIdx(null)}
                            className="cursor-pointer"
                          >
                            <rect
                              x={xCenter - barW / 2}
                              y={190 - recH}
                              width={barW}
                              height={Math.max(pt.receivedLeadCount === 0 ? 1.5 : 3, recH)}
                              rx="2"
                              fill={isHovered ? '#94A3B8' : '#CBD5E1'}
                            />
                            <rect
                              x={xCenter - barW / 2}
                              y={190 - valH}
                              width={barW}
                              height={Math.max((pt.validLeadCount ?? 0) === 0 ? 0 : 2, valH)}
                              rx="2"
                              fill={isHovered ? '#1D4ED8' : '#1E3A8A'}
                            />
                            {(idx === 0 ||
                              idx === timeSeriesPoints.length - 1 ||
                              idx % Math.max(1, Math.ceil(timeSeriesPoints.length / 7)) === 0) && (
                              <text
                                x={xCenter}
                                y="210"
                                textAnchor="middle"
                                fontSize="10"
                                fill="#64748B"
                              >
                                {pt.label}
                              </text>
                            )}
                          </g>
                        );
                      })}
                    </svg>
                    <div className="h-[28px] flex items-center justify-between text-xs text-slate-600 px-1 border-t border-slate-100">
                      {hoveredSeriesIdx !== null && timeSeriesPoints[hoveredSeriesIdx] ? (
                        <span className="font-medium text-slate-800 tabular-nums">
                          Ngày {timeSeriesPoints[hoveredSeriesIdx].bucketStart}:{' '}
                          {timeSeriesPoints[hoveredSeriesIdx].receivedLeadCount ?? 'Chưa có'} tiếp nhận ·{' '}
                          {timeSeriesPoints[hoveredSeriesIdx].validLeadCount ?? 'Chưa có'} hợp lệ (L2)
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          Di chuột vào từng ngày để xem số tiếp nhận và hợp lệ chi tiết
                        </span>
                      )}
                      <span className="text-slate-500 tabular-nums">
                        {data.scope.startDate} → {data.scope.endDate}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right 4/12: Kênh đem về Lead hợp lệ */}
            <div className="lg:col-span-4 rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs flex flex-col">
              <div className="mb-2">
                <h2 className="text-sm font-bold text-[#0F172A]">Kênh đem về Lead hợp lệ</h2>
                <p className="text-xs text-slate-500">
                  Phân bổ trên {data.metrics.validLeadCount} Lead hợp lệ (L2)
                </p>
              </div>
              <div className="h-[256px] flex flex-col justify-between overflow-y-auto pr-1">
                {channelChartRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-500">
                    Chưa phát sinh Lead hợp lệ trong phạm vi này.
                  </div>
                ) : (
                  <div className="space-y-3 my-auto">
                    {channelChartRows.map((ch) => {
                      const pctWidth = Math.max(4, Math.round((ch.validCount / maxChannelValid) * 100));
                      return (
                        <div key={ch.channel} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-slate-800 truncate pr-2" title={ch.channel}>
                              {ch.channel}
                            </span>
                            <span className="font-semibold text-slate-900 tabular-nums shrink-0">
                              {ch.validCount}
                              <span className="text-slate-400 font-normal">
                                {ch.shareOfValidPct !== null && ch.shareOfValidPct !== undefined
                                  ? ` (${ch.shareOfValidPct}%)`
                                  : ''}
                              </span>
                            </span>
                          </div>
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#1E3A8A] transition-all"
                              style={{ width: `${pctWidth}%` }}
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

          {/* 4. BẢNG "ĐỐI CHIẾU HIỆU QUẢ" (Tabs: Website / Kênh / Chiến dịch) */}
          <div className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">Đối chiếu hiệu quả</h2>
                {data.metrics.adReconciliationNote && (
                  <p className="text-xs text-slate-500 mt-0.5">{data.metrics.adReconciliationNote}</p>
                )}
              </div>
              <div
                role="tablist"
                aria-labelledby={tabListId}
                className="flex flex-wrap gap-1.5"
              >
                <span id={tabListId} className="sr-only">
                  Phân rã hiệu quả theo Website, Kênh hoặc Chiến dịch
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
                      onClick={() => setActiveTab(t.key)}
                      onKeyDown={(e) => handleTabKeyDown(e, idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
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
                          <span>Hợp lệ (L2)</span>
                          {renderSortIcon('valid')}
                        </button>
                      </th>
                      <th className="px-3 py-2.5 text-right">Lead Ads L2</th>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {sortedWebsites.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-500">
                          Không có dữ liệu website khớp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      sortedWebsites.map((w) => (
                        <tr key={w.website} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{w.website}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700">
                            {w.adCost !== null && w.adCost !== undefined ? formatVnd(w.adCost) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">{w.leadCount}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                            {w.validCount}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">{w.adLeadCount}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-blue-700">
                            {w.cpl !== null ? formatVnd(w.cpl) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {w.wonCount}
                            <span className="text-xs font-normal text-slate-500 ml-1">
                              ({w.winRatePct !== null && w.winRatePct !== undefined ? `${w.winRatePct}%` : '—'})
                            </span>
                          </td>
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
                          <span>Hợp lệ (L2)</span>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {sortedChannels.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-xs text-slate-500">
                          Không có dữ liệu kênh Marketing khớp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      sortedChannels.map((c) => (
                        <tr key={c.channel} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{c.channel}</td>
                          <td className="px-3 py-2.5 text-right text-slate-700">{c.leadCount}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-indigo-700">
                            {c.validCount}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {c.shareOfValidPct !== null && c.shareOfValidPct !== undefined
                              ? `${c.shareOfValidPct}%`
                              : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right text-slate-700">{c.quotedCount}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {c.wonCount}
                            <span className="text-xs font-normal text-slate-500 ml-1">
                              ({c.winRatePct !== null && c.winRatePct !== undefined ? `${c.winRatePct}%` : '—'})
                            </span>
                          </td>
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
                          <span>Lead Ads L2</span>
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
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 tabular-nums">
                    {sortedCampaigns.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-xs text-slate-500">
                          Không có chiến dịch Ads phát sinh trong kỳ hoặc tất cả chiến dịch chạy chung đa website chưa tách riêng.
                        </td>
                      </tr>
                    ) : (
                      sortedCampaigns.map((camp) => (
                        <tr key={camp.campaignId} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <div className="font-medium text-slate-800">{camp.campaignName}</div>
                            <div className="text-[11px] text-slate-500">
                              {camp.attributionStatus === 'MULTI_WEBSITE_UNSPLIT'
                                ? 'Đa website (không tách riêng từng web)'
                                : camp.attributionStatus === 'UNATTRIBUTED'
                                  ? 'Chưa xác định landing domain'
                                  : camp.platform}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-600">
                            {camp.websiteDomain || 'Chung tài khoản'}
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
                            {camp.costPerValidAdLead !== null ? formatVnd(camp.costPerValidAdLead) : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {camp.wonLeadCount}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 5. KHỐI NHẬN XÉT & CÔNG VIỆC ĐỀ XUẤT */}
          <div className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">Nhận xét &amp; Công việc đề xuất</h2>
                <p className="text-xs text-slate-500">
                  Dẫn chứng theo số liệu thực tế cùng phạm vi đang chọn
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canCreateSeoContent && (
                  <Link
                    href={`/ads?tab=content&website=${encodeURIComponent(data.scope.domain || 'toantrung.com.vn')}`}
                    className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
                  >
                    <PenLine className="w-3.5 h-3.5 text-blue-700" />
                    <span>Đề xuất bài nội dung SEO</span>
                  </Link>
                )}
                {canRequestDesignBrief && (
                  canCreateDesignDirect ? (
                    <Link
                      href={designHrefFromScope}
                      className="h-9 px-3.5 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tạo brief thiết kế</span>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={openBriefModal}
                      className="h-9 px-3.5 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Tạo brief thiết kế</span>
                    </button>
                  )
                )}
              </div>
            </div>

            {data.marketingInsights && data.marketingInsights.summaryFindings.length > 0 && (
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
            )}

            {data.marketingInsights?.latestSeoAiReport && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold text-indigo-950">Snapshot SEO AI gần nhất: </span>
                  <span className="text-indigo-900">
                    {data.marketingInsights.latestSeoAiReport.excerpt}...
                  </span>
                  <span className="ml-2 text-indigo-700">
                    ({data.marketingInsights.latestSeoAiReport.website} · Model:{' '}
                    {data.marketingInsights.latestSeoAiReport.modelUsed ||
                      data.marketingInsights.latestSeoAiReport.generationMode}
                    )
                  </span>
                </div>
                <Link
                  href="/ads"
                  className="font-semibold text-indigo-800 hover:underline shrink-0"
                >
                  Xem báo cáo SEO →
                </Link>
              </div>
            )}

            {(data.dataQuality?.missingProductCount ?? 0) > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Chất lượng dữ liệu: Có <strong>{data.dataQuality?.missingProductCount}</strong> Lead chưa gắn sản phẩm và{' '}
                  <strong>{data.dataQuality?.missingWebsiteCount ?? 0}</strong> Lead chưa rõ website nguồn (độ phủ{' '}
                  {data.dataQuality?.attributionCoveragePct ?? 0}%).
                </span>
                <Link
                  href={buildLeadsDrilldownHref({})}
                  className="font-semibold text-amber-900 underline"
                >
                  Rà soát phân loại trên trang Lead →
                </Link>
              </div>
            )}
          </div>

          {/* 6. CÁC PHẦN CHI TIẾT BỔ TRỢ ĐÓNG MẶC ĐỊNH (Không chiếm hết màn hình mặc định) */}
          <div className="space-y-2">
            {/* Disclosure A: Hoạt động xử lý trong kỳ (tách khỏi Cohort) & Báo giá quá hạn */}
            <details className="rounded-[14px] border border-slate-200 bg-white overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between hover:bg-slate-50">
                <span className="inline-flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Hoạt động xử lý phát sinh trong kỳ &amp; Danh sách chờ báo giá ({data.tables.pendingActionLeads.totalRows} hồ sơ)
                </span>
                <span className="text-[11px] font-normal text-slate-500">Mở rộng chi tiết</span>
              </summary>
              <div className="p-4 border-t border-slate-100 space-y-3">
                {data.periodActivity && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <div className="text-[11px] text-slate-500">Tiếp nhận trong kỳ</div>
                      <div className="text-base font-bold text-slate-900 tabular-nums">
                        {data.periodActivity.receivedInPeriodCount}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <div className="text-[11px] text-slate-500">Gửi báo giá</div>
                      <div className="text-base font-bold text-indigo-700 tabular-nums">
                        {data.periodActivity.quotedInPeriodCount}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <div className="text-[11px] text-slate-500">Chốt trong kỳ</div>
                      <div className="text-base font-bold text-emerald-700 tabular-nums">
                        {data.periodActivity.wonInPeriodCount}
                      </div>
                    </div>
                    <div className="rounded-lg bg-slate-50 border border-slate-200 p-2">
                      <div className="text-[11px] text-slate-500">Đóng / Trượt</div>
                      <div className="text-base font-bold text-slate-700 tabular-nums">
                        {data.periodActivity.lostInPeriodCount}
                      </div>
                    </div>
                    <div className="rounded-lg bg-amber-50 border border-amber-200 p-2">
                      <div className="text-[11px] text-amber-800">Từ kỳ trước xử lý tiếp</div>
                      <div className="text-base font-bold text-amber-900 tabular-nums">
                        {data.periodActivity.fromPriorCohortCount}
                      </div>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2">Mã Lead</th>
                        <th className="px-3 py-2">Khách hàng / Dự án</th>
                        <th className="px-3 py-2">Sales</th>
                        <th className="px-3 py-2">Website</th>
                        <th className="px-3 py-2 text-right">Đã chờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {data.tables.pendingActionLeads.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                            Không có hồ sơ báo giá chờ phản hồi trong phạm vi đang chọn.
                          </td>
                        </tr>
                      ) : (
                        data.tables.pendingActionLeads.rows.map((p) => (
                          <tr key={p.leadId} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-semibold text-[#1E3A8A]">
                              <Link href={buildLeadsDrilldownHref({ highlightLeadId: String(p.leadId) })} className="hover:underline">
                                {p.leadCode}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-slate-800">{p.customerLabel}</td>
                            <td className="px-3 py-2 text-slate-600">{p.assignedSalesName}</td>
                            <td className="px-3 py-2 text-slate-600">{p.website}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-700">
                              {p.waitingDays} ngày
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {totalPendingPages > 1 && (
                  <div className="flex items-center justify-end gap-2 text-xs">
                    <button
                      type="button"
                      disabled={pendingPage <= 1}
                      onClick={() => setPendingPage((p) => Math.max(1, p - 1))}
                      className="p-1.5 rounded border border-slate-200 disabled:opacity-40"
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
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </details>

            {/* Disclosure B: Chi tiết xử lý theo Sales */}
            <details className="rounded-[14px] border border-slate-200 bg-white overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between hover:bg-slate-50">
                <span className="inline-flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-700" />
                  Chi tiết xử lý theo Sales ({data.tables.bySales.length} nhân sự)
                </span>
                <span className="text-[11px] font-normal text-slate-500">Mở rộng bảng Sales</span>
              </summary>
              <div className="p-4 border-t border-slate-100 overflow-x-auto">
                <table className="w-full text-xs text-left tabular-nums">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Sales phụ trách</th>
                      <th className="px-3 py-2 text-right">Tiếp nhận</th>
                      <th className="px-3 py-2 text-right">Hợp lệ</th>
                      <th className="px-3 py-2 text-right">Báo giá</th>
                      <th className="px-3 py-2 text-right">Chờ phản hồi</th>
                      <th className="px-3 py-2 text-right">Quá hạn &gt;7n</th>
                      <th className="px-3 py-2 text-right">Chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.bySales.map((s) => (
                      <tr key={s.salesId} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">
                          {s.salesName}
                          {s.roleLabel ? <span className="text-slate-400 ml-1">({s.roleLabel})</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right">{s.leadCount}</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">{s.validCount}</td>
                        <td className="px-3 py-2 text-right">{s.quotedCount}</td>
                        <td className="px-3 py-2 text-right">{s.waitingCount}</td>
                        <td className="px-3 py-2 text-right text-amber-700 font-semibold">{s.overdueCount}</td>
                        <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{s.wonCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Disclosure C: Phân loại Sản phẩm */}
            <details className="rounded-[14px] border border-slate-200 bg-white overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between hover:bg-slate-50">
                <span className="inline-flex items-center gap-2">
                  <Layers className="w-4 h-4 text-emerald-700" />
                  Nhu cầu theo Sản phẩm ({data.tables.byProduct.length} nhóm)
                </span>
                <span className="text-[11px] font-normal text-slate-500">Mở rộng bảng Sản phẩm</span>
              </summary>
              <div className="p-4 border-t border-slate-100 overflow-x-auto space-y-2">
                {data.charts.multiProductNote && (
                  <p className="text-xs text-slate-500">{data.charts.multiProductNote}</p>
                )}
                <table className="w-full text-xs text-left tabular-nums">
                  <thead className="bg-slate-50 text-slate-600 uppercase border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2">Sản phẩm</th>
                      <th className="px-3 py-2 text-right">Lead quan tâm</th>
                      <th className="px-3 py-2 text-right">Hợp lệ</th>
                      <th className="px-3 py-2 text-right">Đã báo giá</th>
                      <th className="px-3 py-2 text-right">Chốt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.tables.byProduct.map((p) => (
                      <tr key={`${p.productId}-${p.productName}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 font-medium text-slate-800">{p.productName}</td>
                        <td className="px-3 py-2 text-right">{p.leadCount}</td>
                        <td className="px-3 py-2 text-right font-semibold text-indigo-700">{p.validCount}</td>
                        <td className="px-3 py-2 text-right">{p.quotedCount}</td>
                        <td className="px-3 py-2 text-right font-semibold text-emerald-700">{p.wonCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>

            {/* Disclosure D: Định nghĩa chỉ số & Quy tắc đối soát */}
            <details className="rounded-[14px] border border-slate-200 bg-white overflow-hidden">
              <summary className="px-4 py-3 text-xs font-bold text-slate-800 cursor-pointer flex items-center justify-between hover:bg-slate-50">
                <span className="inline-flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#1E3A8A]" />
                  Định nghĩa chỉ số BA &amp; Chất lượng dữ liệu
                </span>
                <span className="text-[11px] font-normal text-slate-500">Mở rộng quy tắc</span>
              </summary>
              <div className="p-4 border-t border-slate-100 text-xs text-slate-600 space-y-2">
                <div>
                  <strong>Cơ sở Cohort:</strong> {data.scope.cohortDefinition}
                </div>
                <div>
                  <strong>Tỷ lệ chốt:</strong> {data.metrics.winRateDefinition}
                </div>
                <div>
                  <strong>CPL quảng cáo hợp lệ:</strong> Chia chi phí quảng cáo thực tế cho riêng tập Lead quảng cáo hợp lệ (L2, có GCLID / UTM paid / Google Lead Form), không lấy toàn bộ Lead hợp lệ làm mẫu số và không chia đều chi phí chiến dịch đa website.
                </div>
                <div>
                  <strong>Chú giải L1 / L2 / L3:</strong> {METRIC_DICTIONARY.validLeadCount?.formula || 'L2: is_spam = false'} · {METRIC_DICTIONARY.effectiveLeadCount?.formula || 'L3: L2 loại trừ Ads & Lead lặp'}
                </div>
                <div>
                  <strong>Bảo mật doanh thu (Q08):</strong> Báo cáo Hiệu quả Marketing giữ nguyên chính sách không hiển thị cột doanh thu/giá trị hợp đồng theo phân quyền BA.
                </div>
              </div>
            </details>
          </div>
        </>
      ) : null}

      {/* Modal gửi Brief Thiết kế từ /reports dành cho Marketing / Ads (Native <dialog> với light-dismiss & overscroll containment) */}
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
              Tạo Brief Thiết kế gửi Studio
            </h2>
            <p className="text-xs text-slate-500">
              Kèm snapshot chỉ số hiện tại ({data?.scope.websiteLabel} · {data?.scope.startDate} → {data?.scope.endDate})
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
              Tiêu đề dự án / ấn phẩm *
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
            <label htmlFor="reports-brief-objective" className="block font-semibold text-slate-700 mb-1">
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
              <label htmlFor="reports-brief-channel" className="block font-semibold text-slate-700 mb-1">
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
              <label htmlFor="reports-brief-format" className="block font-semibold text-slate-700 mb-1">
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
              <label htmlFor="reports-brief-headline" className="block font-semibold text-slate-700 mb-1">
                Headline chính
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
                CTA
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
              <span>{briefSubmitting ? 'Đang gửi brief...' : 'Gửi brief sang Thiết kế AI'}</span>
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
