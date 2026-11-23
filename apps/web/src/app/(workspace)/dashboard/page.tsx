'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  UI_VOCABULARY,
  formatSafePeriodComparison,
  hasBaPermission,
  type ReportsDashboardDto,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  BarChart3,
  BellRing,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FolderOpen,
  Globe,
  Megaphone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserCheck,
  Users,
} from 'lucide-react';
import { useSession } from '@/core/session/SessionContext';
import { apiRequest, peekApiCacheEntry } from '@/core/http/client';
import { publishDataSync, subscribeDataSync } from '@/core/http/data-sync-bus';
import { loadRouteState, saveRouteState } from '@/core/http/route-state';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { formatWaitingDuration, getInitials } from '@/core/layout/WorkspaceShell';
import { formatCompactLeadCode } from '@/modules/01-leads/leads-helpers';

interface PersonalHandoverItem {
  leadId: number;
  leadCode: string;
  version: number;
  customerLabel: string;
  projectName: string | null;
  phone: string;
  pipelineStatus: string;
  fromSalesName: string | null;
  toSalesName: string | null;
  transferReason: string | null;
  transferredAt: string;
  waitingMinutes: number;
  slaLevel: 'normal' | 'warning' | 'overdue';
  nudgedRecently: boolean;
}

interface PersonalPriorityLead {
  leadId: number;
  leadCode: string;
  customerLabel: string;
  projectName: string | null;
  scheduledDate: string | null;
  waitingDays: number;
  pipelineStatus: string;
}

interface PersonalDesignItem {
  id: number;
  projectName: string;
  designStatus: string;
  requestType: string;
  leadCode: string | null;
  updatedAt: string;
}

interface RecentTeamActivity {
  id: number;
  leadId: number;
  leadCode: string;
  customerLabel: string;
  actionType: string;
  actorName: string;
  summary: string;
  createdAt: string;
}

interface PersonalDashboardPayload {
  generatedAt: string;
  vnDateToday: string;
  roleCode: string;
  isAnonymized: boolean;
  canManageLeads: boolean;
  canViewAllLeads: boolean;
  incomingHandovers: PersonalHandoverItem[];
  outgoingHandovers: PersonalHandoverItem[];
  overdueTeamHandovers: PersonalHandoverItem[];
  todayCallbacks: PersonalPriorityLead[];
  overdueQuotes7d: PersonalPriorityLead[];
  overdueQuotesTotal: number;
  myDesignItems: PersonalDesignItem[];
  designCompletedRecentCount: number;
  designPendingCount: number;
  todayStats: {
    newLeadsToday: number;
    pendingIncomingCount: number;
    pendingOutgoingCount: number;
    overdueQuotesCount: number;
    designPendingCount: number;
  };
  recentActivities: RecentTeamActivity[];
}

function buildDashboardApiPath(scope: {
  preset: string;
  from: string;
  to: string;
}): string {
  const qs = new URLSearchParams({
    websiteId: 'all',
    preset: scope.preset || '7D',
    compact: '1',
  });
  if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
    qs.set('from', scope.from);
    qs.set('to', scope.to);
  }
  return `/api/v1/reports?${qs.toString()}`;
}

function getSlaBadgeStyle(level: 'normal' | 'warning' | 'overdue') {
  if (level === 'overdue') return 'bg-rose-100 text-rose-800 border-rose-200';
  if (level === 'warning') return 'bg-amber-100 text-amber-900 border-amber-300';
  return 'bg-blue-50 text-[#1E3A8A] border-blue-200';
}

export default function DashboardPage() {
  const { user } = useSession();
  const { scope, hydrated, updateScope } = useDashboardScope({ includeWebsiteInUrl: false });
  const apiPath = useMemo(() => buildDashboardApiPath(scope), [scope]);

  const [reportState, setReportState] = useState<{
    path: string;
    data: ReportsDashboardDto;
  } | null>(() => {
    const cached = peekApiCacheEntry<ReportsDashboardDto>(apiPath);
    return cached ? { path: apiPath, data: cached.data } : null;
  });
  const report = reportState && reportState.path === apiPath ? reportState.data : null;

  const [personal, setPersonal] = useState<PersonalDashboardPayload | null>(() => {
    const cached = peekApiCacheEntry<PersonalDashboardPayload>('/api/v1/dashboard/personal');
    return cached ? cached.data : null;
  });
  const [personalLoading, setPersonalLoading] = useState<boolean>(
    () => !peekApiCacheEntry<PersonalDashboardPayload>('/api/v1/dashboard/personal'),
  );
  const [handoverFeedback, setHandoverFeedback] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [nudgingId, setNudgingId] = useState<number | null>(null);
  const [rightCardTab, setRightCardTab] = useState<'activity' | 'team'>('activity');

  const [knownWebsites, setKnownWebsites] = useState<WebsiteConfigItemDto[]>(
    () => peekApiCacheEntry<ReportsDashboardDto>(apiPath)?.data.availableWebsites || [],
  );
  const [isLoading, setIsLoading] = useState<boolean>(
    () => !peekApiCacheEntry<ReportsDashboardDto>(apiPath),
  );
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [checkedAtIso, setCheckedAtIso] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const reqSeqRef = useRef<number>(0);
  const activePathRef = useRef<string>(apiPath);
  activePathRef.current = apiPath;

  useEffect(() => {
    const entry = peekApiCacheEntry<ReportsDashboardDto>(apiPath);
    if (entry) {
      setReportState({ path: apiPath, data: entry.data });
      if (entry.data.availableWebsites?.length) {
        setKnownWebsites(entry.data.availableWebsites);
      }
      setCheckedAtIso(new Date(entry.timestamp).toISOString());
      setIsLoading(false);
    } else {
      setReportState(null);
      setIsLoading(true);
    }
  }, [apiPath]);

  const fetchPersonal = useCallback(async (opts?: { skipCache?: boolean }) => {
    try {
      const res = await apiRequest<PersonalDashboardPayload>('/api/v1/dashboard/personal', {
        skipCache: Boolean(opts?.skipCache),
      });
      setPersonal(res);
    } catch {
      // keep existing personal view
    } finally {
      setPersonalLoading(false);
    }
  }, []);

  const fetchDashboard = useCallback(
    async (opts?: { manual?: boolean; silent?: boolean; signal?: AbortSignal }) => {
      const requestPath = apiPath;
      const seq = ++reqSeqRef.current;
      if (opts?.manual) setIsRefreshing(true);
      if (!opts?.silent) setFetchError(null);
      try {
        const res = await apiRequest<ReportsDashboardDto>(requestPath, {
          signal: opts?.signal,
          skipCache: Boolean(opts?.manual || opts?.silent),
          onRevalidated: (fresh) => {
            if (activePathRef.current !== requestPath) return;
            setReportState({ path: requestPath, data: fresh });
            if (fresh.availableWebsites?.length) {
              setKnownWebsites(fresh.availableWebsites);
            }
            setCheckedAtIso(new Date().toISOString());
          },
        });
        if (opts?.signal?.aborted || seq !== reqSeqRef.current || activePathRef.current !== requestPath) {
          return;
        }
        setReportState({ path: requestPath, data: res });
        if (res.availableWebsites?.length) {
          setKnownWebsites(res.availableWebsites);
        }
        setCheckedAtIso(new Date().toISOString());
      } catch (err) {
        if (opts?.signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) {
          return;
        }
        if (seq === reqSeqRef.current && !opts?.silent) {
          setFetchError(
            err instanceof Error ? err.message : UI_VOCABULARY.fallbacks.loadError,
          );
        }
      } finally {
        if (!opts?.signal?.aborted && seq === reqSeqRef.current) {
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
    const cached = peekApiCacheEntry<ReportsDashboardDto>(apiPath);
    if (!cached || !cached.isFresh) {
      void fetchDashboard({ silent: Boolean(cached), signal: controller.signal });
    }
    void fetchPersonal({ skipCache: true });

    const unsubscribe = subscribeDataSync(
      ['reports', 'leads', 'tracking', 'ads', 'design', 'websites', 'notifications'],
      () => {
        void fetchDashboard({ silent: true });
        void fetchPersonal({ skipCache: true });
      },
    );

    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [hydrated, user, apiPath, scope.preset, scope.from, scope.to, fetchDashboard, fetchPersonal]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const scroller = document.getElementById('main-workspace-content');
    if (!scroller) return;
    const saved = loadRouteState<{ scrollTop?: number }>('dashboard');
    if (saved?.scrollTop && saved.scrollTop > 0) {
      requestAnimationFrame(() => {
        scroller.scrollTop = saved.scrollTop ?? 0;
      });
    }
    return () => {
      saveRouteState('dashboard', { scrollTop: scroller.scrollTop });
    };
  }, []);

  useEffect(() => {
    const handleGlobalSearch = (ev: Event) => {
      const detail = (ev as CustomEvent<string>).detail;
      setSearchTerm(typeof detail === 'string' ? detail.trim().toLowerCase() : '');
    };
    window.addEventListener('tt-global-search', handleGlobalSearch as EventListener);
    return () =>
      window.removeEventListener('tt-global-search', handleGlobalSearch as EventListener);
  }, []);

  const handleConfirmReceive = async (item: PersonalHandoverItem) => {
    if (!user || confirmingId !== null) return;
    setConfirmingId(item.leadId);
    setHandoverFeedback(null);
    try {
      await apiRequest(`/api/v1/leads/${item.leadId}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'confirm_receive',
          expectedVersion: item.version,
        },
      });
      setHandoverFeedback(
        `Đã xác nhận tiếp nhận hồ sơ ${formatCompactLeadCode(item.leadCode)} (${item.customerLabel}).`,
      );
      setPersonal((prev) =>
        prev
          ? {
              ...prev,
              incomingHandovers: prev.incomingHandovers.filter((x) => x.leadId !== item.leadId),
              todayStats: {
                ...prev.todayStats,
                pendingIncomingCount: Math.max(0, prev.todayStats.pendingIncomingCount - 1),
              },
            }
          : prev,
      );
      publishDataSync(['leads', 'reports', 'notifications'], 'mutation:confirm_receive');
    } catch (err) {
      setHandoverFeedback(
        err instanceof Error ? err.message : 'Không thể xác nhận tiếp nhận hồ sơ lúc này.',
      );
    } finally {
      setConfirmingId(null);
    }
  };

  const handleNudgeOutgoing = async (item: PersonalHandoverItem) => {
    if (!user || nudgingId !== null) return;
    setNudgingId(item.leadId);
    setHandoverFeedback(null);
    try {
      await apiRequest(`/api/v1/leads/${item.leadId}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'send_reminder_nudge',
          reminderLabel: 'Nhắc tiếp nhận Lead chuyển giao',
          message: `Nhờ ${item.toSalesName || 'bạn'} xác nhận tiếp nhận sớm hồ sơ ${formatCompactLeadCode(item.leadCode)} (${item.customerLabel}).`,
        },
      });
      setHandoverFeedback(
        `Đã gửi nhắc nhẹ tới ${item.toSalesName || 'NVKD nhận'} cho hồ sơ ${formatCompactLeadCode(item.leadCode)}.`,
      );
      setPersonal((prev) =>
        prev
          ? {
              ...prev,
              outgoingHandovers: prev.outgoingHandovers.map((x) =>
                x.leadId === item.leadId ? { ...x, nudgedRecently: true } : x,
              ),
            }
          : prev,
      );
      publishDataSync(['notifications'], 'mutation:send_reminder_nudge');
    } catch (err) {
      setHandoverFeedback(
        err instanceof Error ? err.message : 'Không thể gửi nhắc nhẹ lúc này.',
      );
    } finally {
      setNudgingId(null);
    }
  };

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
    const H = 122;
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
  const pulseGradId = useId();
  const canViewLeads = user ? hasBaPermission(user.roleCode, 'LEAD_VIEW_OWN') : false;
  const canCreateLead = user ? hasBaPermission(user.roleCode, 'LEAD_CREATE') : false;
  const canViewSeo = user
    ? hasBaPermission(user.roleCode, 'AI_MARKETING_SEO') ||
      hasBaPermission(user.roleCode, 'TRACKING_ADS_OPTIMIZE')
    : false;
  const canViewTracking = user
    ? hasBaPermission(user.roleCode, 'TRACKING_ADS_OPTIMIZE') || user.roleCode === 'BOD'
    : false;
  const canViewDesign = user ? hasBaPermission(user.roleCode, 'AI_DESIGN') : false;
  const canViewSettings = user ? hasBaPermission(user.roleCode, 'SYSTEM_USER_ADMIN') : false;

  const todayFormattedVi = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date());
    } catch {
      return personal?.vnDateToday || '';
    }
  }, [personal?.vnDateToday]);

  const funnelStages = useMemo(() => {
    const ov = report?.overview;
    if (!ov) return [];
    const total = Math.max(1, ov.totalLeadsL1);
    const newCount = Math.max(
      0,
      ov.validLeadsL2 - ov.quotingCount - ov.quoteSentCount - ov.wonCount - ov.lostCount,
    );
    return [
      {
        key: 'new_lead',
        label: 'Vừa nhận',
        count: newCount,
        pct: Math.round((newCount / total) * 100),
        bar: 'bg-violet-500',
        pill: 'bg-violet-50 text-violet-700 border-violet-200',
      },
      {
        key: 'quoting',
        label: 'Đang báo giá',
        count: ov.quotingCount,
        pct: Math.round((ov.quotingCount / total) * 100),
        bar: 'bg-blue-500',
        pill: 'bg-blue-50 text-blue-700 border-blue-200',
      },
      {
        key: 'quote_sent',
        label: 'Đã gửi BG',
        count: ov.quoteSentCount,
        pct: Math.round((ov.quoteSentCount / total) * 100),
        bar: 'bg-amber-500',
        pill: 'bg-amber-50 text-amber-800 border-amber-200',
      },
      {
        key: 'won',
        label: 'Chốt đơn',
        count: ov.wonCount,
        pct: Math.round((ov.wonCount / total) * 100),
        bar: 'bg-emerald-500',
        pill: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      },
      {
        key: 'lost',
        label: 'Thất bại',
        count: ov.lostCount,
        pct: Math.round((ov.lostCount / total) * 100),
        bar: 'bg-slate-400',
        pill: 'bg-slate-100 text-slate-600 border-slate-200',
      },
    ];
  }, [report?.overview]);

  const incomingHandovers = personal?.incomingHandovers || [];
  const outgoingHandovers = personal?.outgoingHandovers || [];
  const overdueTeamHandovers = personal?.overdueTeamHandovers || [];

  return (
    <div className="space-y-4">
      {/* ===================================================================== */}
      {/* 1. THANH CHÀO CÁ NHÂN + THAO TÁC NHANH + CHỌN KỲ SỐ LIỆU              */}
      {/* ===================================================================== */}
      <WebsiteDashboardHeader
        title={`Xin chào, ${user?.fullName || 'Thành viên'}`}
        subtitle={`Hôm nay · ${todayFormattedVi} · ${user?.roleName || ''}`}
        scope={{ ...scope, websiteId: 'all' }}
        availableWebsites={report?.availableWebsites || knownWebsites}
        hideWebsiteTabs={true}
        comparisonLabel={periodComp ? periodComp.label : null}
        freshnessMessage={freshnessText}
        freshnessDetail={{
          checkedAt: checkedAtIso,
          lastSyncedAt: report?.lastSyncedAt || null,
          latestSourceDataAt: report?.toDate || null,
        }}
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
          <div className="flex flex-wrap items-center gap-1.5">
            {canCreateLead && (
              <Link
                href="/leads?create=1"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#0F275C] hover:bg-[#1E3A8A] text-white text-xs font-bold shadow-xs transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tạo Lead</span>
              </Link>
            )}
            {canViewDesign && (
              <Link
                href="/design"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-violet-50 hover:border-violet-200 text-slate-700 hover:text-violet-800 text-xs font-semibold transition"
              >
                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                <span>Brief AI 3D</span>
              </Link>
            )}
            <Link
              href={`/reports?tab=shared_files&${scopeQueryForLinks}`}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-slate-700 hover:text-[#1E3A8A] text-xs font-semibold transition"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span className="hidden sm:inline">Kho dữ liệu chung</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                void fetchDashboard({ manual: true });
                void fetchPersonal({ skipCache: true });
              }}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition disabled:opacity-60"
            >
              <RefreshCw
                aria-hidden="true"
                className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1E3A8A]' : ''}`}
              />
              <span className="hidden sm:inline">{UI_VOCABULARY.actions.refresh}</span>
            </button>
          </div>
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

      {handoverFeedback && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-2.5 text-xs font-semibold text-emerald-900 flex items-center justify-between gap-2"
        >
          <span className="inline-flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{handoverFeedback}</span>
          </span>
          <button
            type="button"
            onClick={() => setHandoverFeedback(null)}
            className="text-emerald-700 hover:text-emerald-950 font-bold px-1.5"
          >
            ×
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* PHẦN 1: VIỆC CỦA BẠN HÔM NAY (CHẠY RIÊNG THEO TỪNG CÁ NHÂN)           */}
      {/* ===================================================================== */}
      <section
        aria-labelledby="personal-workspace-heading"
        className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-blue-50 border border-blue-200/80 text-[#0F275C] grid place-items-center shrink-0">
              <ClipboardCheck aria-hidden="true" className="w-4 h-4" />
            </span>
            <div>
              <h2 id="personal-workspace-heading" className="text-sm sm:text-base font-bold text-slate-900">
                Việc của bạn hôm nay
              </h2>
              <p className="text-[11px] text-slate-500">
                Nhắc việc riêng cho tài khoản <strong>{user?.fullName}</strong> — cập nhật im lặng theo thời gian thực
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 font-medium tabular-nums">
              Lead mới hôm nay: <strong className="text-[#0F275C]">{personal?.todayStats.newLeadsToday ?? 0}</strong>
            </span>
            {personal?.canManageLeads && (
              <span
                className={`px-2.5 py-1 rounded-lg border font-semibold tabular-nums ${
                  incomingHandovers.length > 0
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                {incomingHandovers.length > 0
                  ? `${incomingHandovers.length} Lead chờ nhận`
                  : 'Đã tiếp nhận đủ Lead'}
              </span>
            )}
          </div>
        </div>

        {/* KHỐI CHUYỂN GIAO LEAD 2 CHIỀU (Người nhận & Người chuyển) */}
        {personal?.canManageLeads && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Cột trái: Chờ bạn tiếp nhận */}
            <div
              className={`rounded-xl border p-3.5 space-y-2.5 ${
                incomingHandovers.length > 0
                  ? 'bg-amber-50/45 border-amber-200/90'
                  : 'bg-slate-50/50 border-slate-200/80'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold uppercase tracking-wide ${
                      incomingHandovers.length > 0
                        ? 'bg-amber-500 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    Chờ bạn tiếp nhận ({incomingHandovers.length})
                  </span>
                </div>
                <Link
                  href="/leads"
                  className="text-[11px] font-semibold text-[#1E3A8A] hover:underline"
                >
                  Mở danh sách Lead →
                </Link>
              </div>

              {personalLoading ? (
                <div className="h-16 rounded-lg bg-white/80 animate-pulse" />
              ) : incomingHandovers.length === 0 ? (
                <div className="rounded-lg bg-white border border-slate-200/70 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Không có hồ sơ chuyển giao nào đang chờ bạn xác nhận.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-0.5">
                  {incomingHandovers.slice(0, 5).map((item) => (
                    <div
                      key={item.leadId}
                      className="rounded-xl bg-white border border-amber-200/90 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs shadow-2xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/leads?highlight=${item.leadId}`}
                            className="font-bold text-slate-900 hover:text-[#1E3A8A] hover:underline truncate"
                          >
                            {item.customerLabel}
                          </Link>
                          <span
                            className="font-mono text-[11px] font-bold text-[#1E3A8A] bg-blue-50 px-1.5 py-0.5 rounded"
                            title={item.leadCode}
                          >
                            {formatCompactLeadCode(item.leadCode)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${getSlaBadgeStyle(
                              item.slaLevel,
                            )}`}
                          >
                            {formatWaitingDuration(item.waitingMinutes)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          {item.fromSalesName ? `Từ: ${item.fromSalesName}` : 'Điều phối mới'}
                          {item.transferReason ? ` · ${item.transferReason}` : ''}
                          {item.projectName ? ` · ${item.projectName}` : ''}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={confirmingId === item.leadId}
                          onClick={() => void handleConfirmReceive(item)}
                          className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1 shadow-2xs transition disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{confirmingId === item.leadId ? 'Đang lưu...' : 'Xác nhận'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Cột phải: Bạn đã chuyển — Đang chờ đồng nghiệp nhận */}
            <div className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-slate-200/80 text-slate-800 text-[11px] font-extrabold uppercase tracking-wide inline-flex items-center gap-1">
                    <ArrowRightLeft className="w-3 h-3" />
                    <span>Bạn đã chuyển — Chờ nhận ({outgoingHandovers.length})</span>
                  </span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Theo dõi 2 chiều để không sót khách
                </span>
              </div>

              {personalLoading ? (
                <div className="h-16 rounded-lg bg-white/80 animate-pulse" />
              ) : outgoingHandovers.length === 0 ? (
                <div className="rounded-lg bg-white border border-slate-200/70 px-3 py-2.5 text-xs text-slate-600 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Các Lead bạn chuyển giao đều đã được đồng nghiệp xác nhận tiếp nhận.</span>
                </div>
              ) : (
                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-0.5">
                  {outgoingHandovers.slice(0, 5).map((item) => (
                    <div
                      key={item.leadId}
                      className="rounded-xl bg-white border border-slate-200/90 p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link
                            href={`/leads?highlight=${item.leadId}`}
                            className="font-bold text-slate-900 hover:text-[#1E3A8A] hover:underline truncate"
                          >
                            {item.customerLabel}
                          </Link>
                          <span
                            className="font-mono text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded"
                            title={item.leadCode}
                          >
                            {formatCompactLeadCode(item.leadCode)}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${getSlaBadgeStyle(
                              item.slaLevel,
                            )}`}
                          >
                            Chờ {formatWaitingDuration(item.waitingMinutes)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                          Đang chờ: <strong className="text-slate-700">{item.toSalesName}</strong>
                          {item.transferReason ? ` · ${item.transferReason}` : ''}
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={item.nudgedRecently || nudgingId === item.leadId}
                        onClick={() => void handleNudgeOutgoing(item)}
                        className={`h-8 px-2.5 rounded-lg border text-xs font-semibold inline-flex items-center gap-1 shrink-0 transition ${
                          item.nudgedRecently
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-700 cursor-default'
                            : 'border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-300 text-[#1E3A8A]'
                        }`}
                      >
                        {item.nudgedRecently ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Đã nhắc</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3 h-3" />
                            <span>{nudgingId === item.leadId ? 'Đang gửi...' : 'Nhắc nhẹ'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cảnh báo SLA Quản lý (> 4 giờ chưa tiếp nhận toàn đội) */}
        {overdueTeamHandovers.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span className="font-bold">
                Quá hạn bàn giao &gt; 4 giờ toàn phòng ({overdueTeamHandovers.length} hồ sơ):
              </span>
              <span className="text-rose-800">
                {overdueTeamHandovers
                  .slice(0, 2)
                  .map((h) => `${formatCompactLeadCode(h.leadCode)} (${h.toSalesName})`)
                  .join(' · ')}
              </span>
            </div>
            <Link
              href="/leads"
              className="px-2.5 py-1 rounded-lg bg-white border border-rose-200 text-rose-800 hover:bg-rose-100 font-bold shrink-0"
            >
              Điều phối ngay →
            </Link>
          </div>
        )}

        {/* 3 THẺ VIỆC ƯU TIÊN CÁ NHÂN (chạy riêng cho tài khoản đang đăng nhập) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Thẻ 1: Lịch hẹn liên hệ hôm nay */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 flex flex-col justify-between gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 grid place-items-center shrink-0">
                  <CalendarClock className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Lịch hẹn gọi lại của bạn</h3>
                  <p className="text-[11px] text-slate-500">Đến hạn hôm nay / quá hẹn</p>
                </div>
              </div>
              <span className="text-xl font-extrabold text-amber-700 tabular-nums">
                {personal?.todayCallbacks.length ?? 0}
              </span>
            </div>

            {personal && personal.todayCallbacks.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {personal.todayCallbacks.slice(0, 2).map((cb) => (
                  <li key={cb.leadId}>
                    <Link
                      href={`/leads?highlight=${cb.leadId}`}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-slate-200/80 hover:border-amber-300 transition"
                    >
                      <span className="truncate font-medium text-slate-800">{cb.customerLabel}</span>
                      <span className="text-[10px] font-mono text-amber-800 shrink-0">{cb.scheduledDate}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Chưa có lịch hẹn quá hạn hôm nay.</p>
            )}

            <Link
              href="/leads"
              className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Xem lịch chăm sóc</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Thẻ 2: Báo giá quá 7 ngày chưa phản hồi */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 flex flex-col justify-between gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 grid place-items-center shrink-0">
                  <BellRing className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Báo giá quá 7 ngày</h3>
                  <p className="text-[11px] text-slate-500">Hồ sơ của bạn chưa phản hồi</p>
                </div>
              </div>
              <span className="text-xl font-extrabold text-rose-700 tabular-nums">
                {personal?.overdueQuotesTotal ?? 0}
              </span>
            </div>

            {personal && personal.overdueQuotes7d.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {personal.overdueQuotes7d.slice(0, 2).map((q) => (
                  <li key={q.leadId}>
                    <Link
                      href={`/leads?highlight=${q.leadId}`}
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-slate-200/80 hover:border-rose-300 transition"
                    >
                      <span className="truncate font-medium text-slate-800">{q.customerLabel}</span>
                      <span className="text-[10px] font-bold text-rose-700 shrink-0">{q.waitingDays} ngày</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Không có báo giá nào bị trễ phản hồi quá 7 ngày.</p>
            )}

            <Link
              href={canViewLeads ? `/leads?overdue7d=1&${scopeQueryForLinks}` : '/reports'}
              className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Rà soát báo giá</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Thẻ 3: Yêu cầu Thiết kế AI của cá nhân */}
          <div className="rounded-xl border border-slate-200/90 bg-slate-50/40 p-3.5 flex flex-col justify-between gap-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 text-violet-700 grid place-items-center shrink-0">
                  <Sparkles className="w-4 h-4" />
                </span>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">Thiết kế AI của bạn</h3>
                  <p className="text-[11px] text-slate-500">
                    Hoàn tất 7 ngày: <strong>{personal?.designCompletedRecentCount ?? 0}</strong> · Đang chờ:{' '}
                    <strong>{personal?.designPendingCount ?? 0}</strong>
                  </p>
                </div>
              </div>
              <span className="text-xl font-extrabold text-violet-700 tabular-nums">
                {personal?.myDesignItems.length ?? 0}
              </span>
            </div>

            {personal && personal.myDesignItems.length > 0 ? (
              <ul className="space-y-1 text-xs">
                {personal.myDesignItems.slice(0, 2).map((d) => (
                  <li key={d.id}>
                    <Link
                      href="/design"
                      className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-white border border-slate-200/80 hover:border-violet-300 transition"
                    >
                      <span className="truncate font-medium text-slate-800">{d.projectName}</span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          d.designStatus === 'completed'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-violet-50 text-violet-700'
                        }`}
                      >
                        {d.designStatus === 'completed' ? 'Đã xong' : 'Đang xử lý'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500">Chưa có yêu cầu phối cảnh 3D / Banner gần đây.</p>
            )}

            <Link
              href={canViewDesign ? '/design' : '/reports'}
              className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
            >
              <span>Mở không gian Thiết kế AI</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* PHẦN 2: TỔNG QUAN CHUNG TOÀN CÔNG TY                                  */}
      {/* ===================================================================== */}
      <div className="space-y-4">
        {/* Thanh Phễu chuyển đổi 5 bước + Kiểm tra chất lượng dữ liệu chung */}
        <section
          aria-labelledby="company-funnel-heading"
          className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-[#0F275C]" />
              <h2 id="company-funnel-heading" className="text-sm font-bold text-slate-900">
                Tổng quan chung toàn công ty · Phễu Lead
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold">
                Tỷ lệ chốt: {report?.overview.winRateText || '—'}
              </span>
            </div>

            {dq && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-slate-400 font-medium inline-flex items-center gap-1">
                  <ShieldAlert aria-hidden="true" className="w-3.5 h-3.5" />
                  Kiểm tra nhanh:
                </span>
                <Link
                  href={canViewLeads ? `/leads?missingProduct=1&${scopeQueryForLinks}` : '/reports'}
                  className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition"
                >
                  Thiếu SP: <strong className="tabular-nums">{dq.missingProductCount}</strong>
                </Link>
                <Link
                  href={canViewLeads ? `/leads?missingWebsite=1&${scopeQueryForLinks}` : '/reports'}
                  className="px-2 py-0.5 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-medium transition"
                >
                  Thiếu web: <strong className="tabular-nums">{dq.missingWebsiteCount}</strong>
                </Link>
                <Link
                  href={canViewSettings ? '/settings?tab=sync' : `/reports?${scopeQueryForLinks}`}
                  className={`px-2 py-0.5 rounded-lg border font-semibold transition ${
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

          {funnelStages.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {funnelStages.map((st) => (
                <Link
                  key={st.key}
                  href={canViewLeads ? `/leads?status=${st.key}&${scopeQueryForLinks}` : '/reports'}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/40 hover:bg-white hover:border-[#1E3A8A]/40 p-2.5 transition"
                >
                  <div className="flex items-center justify-between gap-1 text-[11px]">
                    <span className={`px-1.5 py-0.5 rounded border font-semibold ${st.pill}`}>
                      {st.label}
                    </span>
                    <span className="text-slate-500 font-semibold tabular-nums">{st.pct}%</span>
                  </div>
                  <div className="mt-1.5 text-lg font-extrabold text-slate-900 tabular-nums">
                    {st.count}
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                    <div
                      style={{ width: `${Math.min(100, Math.max(st.count > 0 ? 6 : 0, st.pct))}%` }}
                      className={`h-full rounded-full ${st.bar}`}
                    />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 4 Mảng nghiệp vụ tổng hợp */}
        <section aria-label="Tổng hợp 4 mảng nghiệp vụ" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3.5">
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
                Lead (Hợp lệ: <strong className="text-slate-800">{report?.overview.validLeadsL2 ?? 0}</strong>)
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Đang báo giá:{' '}
                <strong className="text-slate-900">
                  {(report?.overview.quotingCount ?? 0) + (report?.overview.quoteSentCount ?? 0)}
                </strong>{' '}
                · Chốt: <strong className="text-emerald-700">{report?.overview.wonCount ?? 0}</strong>
              </span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>

          <Link
            href={canViewSeo ? `/ads?${scopeQueryForLinks}` : `/reports?${scopeQueryForLinks}`}
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Globe aria-hidden="true" className="w-4 h-4 text-emerald-600" />
                Lưu lượng &amp; SEO
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
                lượt xem ·{' '}
                <strong className="text-emerald-700 tabular-nums">
                  {totalSystemGscClicks?.toLocaleString('vi-VN') ?? '—'}
                </strong>{' '}
                click SEO
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Bài đã đăng: <strong className="text-slate-900">{report?.marketingSummary.publishedSeoArticles ?? 0}</strong> · Nháp:{' '}
                <strong className="text-amber-700">{report?.marketingSummary.draftSeoArticles ?? 0}</strong>
              </span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>

          <Link
            href={canViewTracking ? `/tracking?${scopeQueryForLinks}` : `/reports?${scopeQueryForLinks}`}
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Megaphone aria-hidden="true" className="w-4 h-4 text-indigo-600" />
                Chiến dịch &amp; Kênh
              </span>
              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold">
                {report?.byChannel?.filter((c) => c.count > 0).length || 0} kênh
              </span>
            </div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mt-0.5">
              <span className="text-xl 2xl:text-2xl font-extrabold text-slate-900 tabular-nums whitespace-nowrap">
                {report?.marketingSummary.totalAdsSpend
                  ? `${Math.round(Number(report.marketingSummary.totalAdsSpend.formattedDecimal || 0)).toLocaleString('vi-VN')}\u00A0₫`
                  : `${report?.marketingSummary.effectiveLeadsFromAds ?? 0} Lead Ads`}
              </span>
              <span className="text-xs text-slate-500">
                {report?.marketingSummary.totalAdsSpend ? 'chi phí Ads' : 'từ quảng cáo'}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span className="truncate">
                {(report?.byChannel || [])
                  .filter((c) => c.count > 0)
                  .slice(0, 2)
                  .map((c) => `${c.label}: ${c.count}`)
                  .join(' · ') || 'Xem phân tích kênh'}
              </span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          </Link>

          <Link
            href={canViewDesign ? '/design' : `/reports?${scopeQueryForLinks}`}
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-[#1E3A8A]/50 p-4 shadow-2xs flex flex-col justify-between gap-2 transition-all"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <Sparkles aria-hidden="true" className="w-4 h-4 text-violet-600" />
                Thiết kế AI
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
                yêu cầu (Chờ: <strong className="text-amber-700">{report?.designSummary.pendingCount ?? 0}</strong>)
              </span>
            </div>
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <span>
                Hoàn tất:{' '}
                <strong className="text-slate-900">
                  {(report?.designSummary.completed3dCount ?? 0) + (report?.designSummary.completedBannerCount ?? 0)}
                </strong>{' '}
                bản vẽ
              </span>
              <ArrowRight aria-hidden="true" className="w-3.5 h-3.5 text-[#1E3A8A] opacity-70 group-hover:translate-x-0.5 transition-transform" />
            </div>
          </Link>
        </section>

        {/* Hiệu suất 4 Website (7/12) + Lead theo ngày & Hoạt động/Đội ngũ (5/12) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          <section
            aria-labelledby="dashboard-websites-matrix-heading"
            className="xl:col-span-7 rounded-2xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col justify-between"
          >
            <div>
              <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <Globe aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                  <h2 id="dashboard-websites-matrix-heading" className="text-sm font-bold text-slate-900">
                    Hiệu suất theo Website &amp; Mạch Ads ↔ Lead
                  </h2>
                </div>
                <Link
                  href={`/reports?${scopeQueryForLinks}`}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
                >
                  <span>Báo cáo chi tiết</span>
                  <ArrowRight aria-hidden="true" className="w-3.5 h-3.5" />
                </Link>
              </div>

              {isLoading && !report ? (
                <div className="p-4 space-y-2.5">
                  {[1, 2, 3, 4].map((k) => (
                    <div key={k} className="h-14 rounded-xl bg-slate-50 animate-pulse" />
                  ))}
                </div>
              ) : (
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
                              Tỷ trọng: <strong className="text-slate-700">{ws.sharePct}%</strong>
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs shrink-0">
                          <div className="text-right min-w-[66px]">
                            <div className="text-[11px] text-slate-400">Xem trang</div>
                            <div className="font-bold text-slate-800 tabular-nums">
                              {ws.pageViews !== null ? ws.pageViews.toLocaleString('vi-VN') : '—'}
                            </div>
                          </div>
                          <div className="text-right min-w-[62px]">
                            <div className="text-[11px] text-slate-400">Click SEO</div>
                            <div className="font-bold text-emerald-700 tabular-nums">
                              {ws.gscClicks !== null ? ws.gscClicks.toLocaleString('vi-VN') : '—'}
                            </div>
                          </div>
                          <div className="text-right min-w-[54px]">
                            <div className="text-[11px] text-slate-400">Lead</div>
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
                                Gắn web
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-4 py-2.5 bg-slate-50/80 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span>
                Tổng lượt xem:{' '}
                <strong className="text-slate-900 tabular-nums">
                  {totalSystemPageViews !== null ? totalSystemPageViews.toLocaleString('vi-VN') : '—'}
                </strong>
              </span>
              <span>
                Tổng Click SEO:{' '}
                <strong className="text-emerald-700 tabular-nums">
                  {totalSystemGscClicks !== null ? totalSystemGscClicks.toLocaleString('vi-VN') : '—'}
                </strong>
              </span>
            </div>
          </section>

          <div className="xl:col-span-5 flex flex-col gap-4 justify-between">
            <section
              aria-labelledby="dashboard-pulse-heading"
              className="rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp aria-hidden="true" className="w-4 h-4 text-[#1E3A8A]" />
                  <h2 id="dashboard-pulse-heading" className="text-sm font-bold text-slate-900">
                    Lead mới theo ngày
                  </h2>
                </div>
                <span className="text-[11px] text-slate-500">
                  Đỉnh kỳ:{' '}
                  <strong className="text-slate-800 tabular-nums">
                    {Math.max(0, ...chartPoints.map((p) => p.totalL1))}
                  </strong>
                  /ngày
                </span>
              </div>

              {sparklineGeometry ? (
                <div>
                  <svg
                    viewBox={`0 0 ${sparklineGeometry.W} ${sparklineGeometry.H}`}
                    className="w-full h-[118px] overflow-visible"
                    role="img"
                    aria-label="Biểu đồ Lead mới theo ngày"
                  >
                    <defs>
                      <linearGradient id={pulseGradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity="0.26" />
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
                    <path d={sparklineGeometry.areaPath} fill={`url(#${pulseGradId})`} />
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
                <div className="h-[115px] grid place-items-center text-xs text-slate-400">
                  Chưa có dữ liệu trong khoảng ngày đang chọn.
                </div>
              )}
            </section>

            {/* Thẻ chuyển đổi: Hoạt động mới nhất toàn phòng / Đội ngũ Kinh doanh */}
            <section
              aria-labelledby="dashboard-team-activity-heading"
              className="flex-1 rounded-2xl bg-white border border-slate-200/90 p-4 shadow-2xs flex flex-col"
            >
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setRightCardTab('activity')}
                    className={`px-2.5 py-1 rounded-md font-bold inline-flex items-center gap-1 transition ${
                      rightCardTab === 'activity'
                        ? 'bg-white text-[#0F275C] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Hoạt động mới</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightCardTab('team')}
                    className={`px-2.5 py-1 rounded-md font-bold inline-flex items-center gap-1 transition ${
                      rightCardTab === 'team'
                        ? 'bg-white text-[#0F275C] shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Đội ngũ Sales</span>
                  </button>
                </div>
                <h2 id="dashboard-team-activity-heading" className="sr-only">
                  Hoạt động mới và Đội ngũ Kinh doanh
                </h2>
                <Link
                  href={rightCardTab === 'activity' ? '/leads' : '/profile'}
                  className="text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  {rightCardTab === 'activity' ? 'Xem Lead →' : 'Thành viên →'}
                </Link>
              </div>

              {rightCardTab === 'activity' ? (
                <div className="space-y-2 max-h-[225px] overflow-y-auto [scrollbar-gutter:stable] pr-1">
                  {(personal?.recentActivities || []).length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      Chưa có hoạt động gần đây.
                    </p>
                  ) : (
                    (personal?.recentActivities || []).slice(0, 6).map((act) => (
                      <Link
                        key={act.id}
                        href={canViewLeads ? `/leads?highlight=${act.leadId}` : '/reports'}
                        className="rounded-xl border border-slate-200/80 p-2.5 flex items-start justify-between gap-2.5 hover:bg-slate-50/80 transition"
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-full bg-blue-50 text-[#0F275C] font-bold text-[10px] grid place-items-center shrink-0 mt-0.5">
                            {getInitials(act.actorName)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-900 leading-snug">
                              <strong className="font-semibold">{act.actorName}</strong>{' '}
                              <span className="text-slate-600">· {act.summary}</span>
                            </p>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              <span className="font-mono text-[#1E3A8A] font-semibold">
                                {formatCompactLeadCode(act.leadCode)}
                              </span>{' '}
                              · {act.customerLabel}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap inline-flex items-center gap-0.5 shrink-0">
                          <Clock className="w-3 h-3" />
                          {new Date(act.createdAt).toLocaleTimeString('vi-VN', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              ) : (
                <div className="space-y-2 max-h-[225px] overflow-y-auto [scrollbar-gutter:stable] pr-1">
                  {salesRows.slice(0, 6).map((sp) => (
                    <div
                      key={sp.salesUserId}
                      className="rounded-xl border border-slate-200/80 p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50/70 transition"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {sp.avatarUrl ? (
                          <img
                            src={sp.avatarUrl}
                            alt={sp.salesFullName}
                            className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                          />
                        ) : (
                          <span className="w-8 h-8 rounded-full bg-blue-50 text-[#0F275C] font-bold text-[11px] grid place-items-center shrink-0">
                            {getInitials(sp.salesFullName)}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {sp.salesFullName}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Đang báo giá:{' '}
                            <strong className="text-slate-700">
                              {sp.quotingLeads + sp.quoteSentLeads}
                            </strong>{' '}
                            · Chốt: <strong className="text-emerald-700">{sp.wonLeads}</strong>
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
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
