'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRightLeft,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Crosshair,
  FileSpreadsheet,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Search,
  Settings,
  Sparkles,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import {
  UI_VOCABULARY,
  hasBaPermission,
  type BaPermissionKey,
  type NotificationDto,
} from '@toantrung/contracts';
import { apiRequest } from '../http/client';
import { publishDataSync, subscribeDataSync } from '../http/data-sync-bus';
import { useSession } from '../session/SessionContext';
import { formatCompactLeadCode } from '@/modules/01-leads/leads-helpers';

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  badge?: number;
  adminOnly?: boolean;
  requiredPermission?: BaPermissionKey;
}

interface IncomingHandoverLite {
  leadId: number;
  leadCode: string;
  version: number;
  customerLabel: string;
  projectName: string | null;
  fromSalesName: string | null;
  transferReason: string | null;
  waitingMinutes: number;
  slaLevel: 'normal' | 'warning' | 'overdue';
}

const ROUTE_REQUIRED_PERMISSION: Record<string, BaPermissionKey> = {
  '/dashboard': 'DASHBOARD_VIEW',
  '/leads': 'LEAD_VIEW_OWN',
  '/tracking': 'TRACKING_ADS_OPTIMIZE',
  '/ads': 'AI_MARKETING_SEO',
  '/reports': 'DASHBOARD_VIEW',
  '/design': 'AI_DESIGN',
  '/admin/users': 'SYSTEM_USER_ADMIN',
  '/settings': 'SYSTEM_USER_ADMIN',
};

const BREADCRUMB_LABELS: Record<string, string> = {
  '/dashboard': UI_VOCABULARY.menu.dashboard,
  '/leads': UI_VOCABULARY.menu.leads,
  '/tracking': UI_VOCABULARY.menu.campaigns,
  '/ads': UI_VOCABULARY.menu.seo,
  '/reports': UI_VOCABULARY.menu.reports,
  '/design': UI_VOCABULARY.menu.design,
  '/notifications': UI_VOCABULARY.menu.notifications,
  '/profile': UI_VOCABULARY.menu.profile,
  '/admin/users': UI_VOCABULARY.menu.users,
  '/settings': UI_VOCABULARY.menu.settings,
};

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return 'TT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function formatWaitingDuration(minutes: number): string {
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const {
    user,
    loading,
    unreadCount,
    setUnreadCountState,
    latestAlertNotification,
    dismissLatestAlert,
    desktopNotifPermission,
    requestDesktopNotifPermission,
    logout,
  } = useSession();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState('');
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

  const [bellOpen, setBellOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationDto[]>([]);
  const [loadingBell, setLoadingBell] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);

  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const adminMenuRef = useRef<HTMLDivElement | null>(null);

  const [incomingHandovers, setIncomingHandovers] = useState<IncomingHandoverLite[]>([]);
  const [handoverPopoverOpen, setHandoverPopoverOpen] = useState(false);
  const [confirmingLeadId, setConfirmingLeadId] = useState<number | null>(null);

  const currentBreadcrumb = BREADCRUMB_LABELS[pathname] || UI_VOCABULARY.menu.dashboard;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get('search');
    if (q !== null) {
      setGlobalSearchText(q);
    } else {
      setGlobalSearchText('');
      window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
    }
  }, [pathname]);

  useEffect(() => {
    if (
      user?.email &&
      globalSearchText.trim().toLowerCase() === user.email.trim().toLowerCase() &&
      document.activeElement !== globalSearchInputRef.current
    ) {
      setGlobalSearchText('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
      }
    }
  }, [user?.email, globalSearchText]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (!isInputFocused && e.key === '/') {
        e.preventDefault();
        globalSearchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Tải danh sách Lead chuyển giao chờ xác nhận (nhẹ, không polling riêng, tự cập nhật khi có sync)
  const fetchIncomingHandovers = useCallback(async () => {
    if (!user || !hasBaPermission(user.roleCode, 'LEAD_VIEW_OWN')) {
      setIncomingHandovers([]);
      return;
    }
    try {
      const res = await apiRequest<{ incomingHandovers?: IncomingHandoverLite[] }>(
        '/api/v1/dashboard/personal',
        { skipCache: true },
      );
      setIncomingHandovers(res.incomingHandovers || []);
    } catch {
      // silent
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIncomingHandovers([]);
      return;
    }
    void fetchIncomingHandovers();
    const unsub = subscribeDataSync(['leads', 'notifications'], () => {
      void fetchIncomingHandovers();
    });
    return () => unsub();
  }, [user, fetchIncomingHandovers]);

  // Cập nhật số lượng trên tiêu đề tab trình duyệt im lặng (không tiếng ting ting)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const pendingCount = incomingHandovers.length;
    if (pendingCount > 0) {
      document.title = `(${pendingCount} chờ nhận) Toàn Trung CRM`;
    } else if (unreadCount > 0) {
      document.title = `(${unreadCount}) Toàn Trung CRM`;
    } else {
      document.title = 'Toàn Trung CRM';
    }
  }, [incomingHandovers.length, unreadCount]);

  const handleQuickConfirmHandover = async (item: IncomingHandoverLite) => {
    if (!user || confirmingLeadId !== null) return;
    setConfirmingLeadId(item.leadId);
    try {
      await apiRequest(`/api/v1/leads/${item.leadId}`, {
        method: 'PATCH',
        csrfToken: user.csrfToken,
        body: {
          action: 'confirm_receive',
          expectedVersion: item.version,
        },
      });
      setIncomingHandovers((prev) => prev.filter((x) => x.leadId !== item.leadId));
      publishDataSync(['leads', 'reports', 'notifications'], 'mutation:confirm_receive');
    } catch {
      void fetchIncomingHandovers();
    } finally {
      setConfirmingLeadId(null);
    }
  };

  const fetchBellNotifications = useCallback(async () => {
    setLoadingBell(true);
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
        { skipCache: true },
      );
      setRecentNotifications((res.items || []).slice(0, 6));
      setUnreadCountState(res.unreadCount ?? 0);
    } catch {
      // ignore
    } finally {
      setLoadingBell(false);
    }
  }, [setUnreadCountState]);

  useEffect(() => {
    if (bellOpen) {
      void fetchBellNotifications();
    }
  }, [bellOpen, fetchBellNotifications]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target as Node)) {
        setAdminMenuOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setBellOpen(false);
        setAdminMenuOpen(false);
        setHandoverPopoverOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, []);

  const handleMarkAllReadQuick = async () => {
    if (!user || unreadCount === 0) return;
    try {
      const res = await apiRequest<{ items: NotificationDto[]; unreadCount: number }>(
        '/api/v1/notifications',
        {
          method: 'PATCH',
          csrfToken: user.csrfToken,
          body: { markAll: true },
        },
      );
      setRecentNotifications((res.items || []).slice(0, 6));
      setUnreadCountState(res.unreadCount ?? 0);
    } catch {
      // ignore
    }
  };

  const isFullBleed = pathname === '/design';
  const requiredPermForCurrentRoute = ROUTE_REQUIRED_PERMISSION[pathname];
  const isRouteUnauthorized = Boolean(
    user &&
      requiredPermForCurrentRoute &&
      !hasBaPermission(user.roleCode, requiredPermForCurrentRoute),
  );

  useEffect(() => {
    if (!loading && isRouteUnauthorized) {
      router.replace('/dashboard');
    }
  }, [loading, isRouteUnauthorized, router]);

  const workNav: NavItem[] = [
    {
      href: '/dashboard',
      label: UI_VOCABULARY.menu.dashboard,
      shortLabel: 'Tổng quan',
      icon: LayoutGrid,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/leads',
      label: UI_VOCABULARY.menu.leads,
      shortLabel: 'Lead',
      icon: FileSpreadsheet,
      badge: incomingHandovers.length > 0 ? incomingHandovers.length : undefined,
      requiredPermission: 'LEAD_VIEW_OWN',
    },
    {
      href: '/tracking',
      label: UI_VOCABULARY.menu.campaigns,
      shortLabel: 'Chiến dịch',
      icon: Crosshair,
      requiredPermission: 'TRACKING_ADS_OPTIMIZE',
    },
    {
      href: '/ads',
      label: UI_VOCABULARY.menu.seo,
      shortLabel: 'SEO',
      icon: Megaphone,
      requiredPermission: 'AI_MARKETING_SEO',
    },
    {
      href: '/reports',
      label: UI_VOCABULARY.menu.reports,
      shortLabel: 'Báo cáo',
      icon: BarChart3,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/design',
      label: UI_VOCABULARY.menu.design,
      shortLabel: 'Thiết kế AI',
      icon: Sparkles,
      requiredPermission: 'AI_DESIGN',
    },
  ];

  const systemNav: NavItem[] = [
    {
      href: '/admin/users',
      label: UI_VOCABULARY.menu.users,
      shortLabel: 'Nhân sự',
      icon: Users,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
    {
      href: '/settings',
      label: UI_VOCABULARY.menu.settings,
      shortLabel: 'Cài đặt',
      icon: Settings,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
  ];

  const showTopbarSearch =
    pathname === '/dashboard' ||
    pathname === '/leads' ||
    pathname.startsWith('/leads/') ||
    pathname === '/tracking' ||
    pathname === '/reports' ||
    pathname === '/design';

  const topbarSearchPlaceholder =
    pathname === '/leads' || pathname.startsWith('/leads/')
      ? 'Tìm SĐT, khách, mã Lead...'
      : `Tìm trong ${currentBreadcrumb}...`;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col w-full">
        <div className="h-[56px] bg-white border-b border-slate-200 px-4 flex items-center gap-4">
          <div className="h-8 w-36 rounded-lg bg-slate-200 animate-pulse" />
          <div className="hidden lg:flex items-center gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-8 w-20 rounded-lg bg-slate-100 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="p-4 space-y-3">
          <div className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[108px] rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!user || isRouteUnauthorized) {
    return null;
  }

  const visibleWorkNav = workNav.filter(
    (item) =>
      (!item.adminOnly || user.roleCode === 'ADMIN') &&
      (!item.requiredPermission || hasBaPermission(user.roleCode, item.requiredPermission)),
  );

  const visibleSystemNav = systemNav.filter(
    (item) =>
      (!item.adminOnly || user.roleCode === 'ADMIN') &&
      (!item.requiredPermission || hasBaPermission(user.roleCode, item.requiredPermission)),
  );

  const isSystemRouteActive = visibleSystemNav.some(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  );

  // Chỉ hiện dải nhắc bàn giao nổi trên các trang không có sẵn bảng bàn giao (Tổng quan & Lead đã hiển thị trực diện)
  const showGlobalHandoverStrip =
    incomingHandovers.length > 0 &&
    pathname !== '/dashboard' &&
    pathname !== '/leads';

  const firstHandover = incomingHandovers[0] || null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex flex-col w-full h-screen overflow-hidden">
      <a
        href="#main-workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[10px] focus:bg-[#0B1D48] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Chuyển đến nội dung chính
      </a>

      {/* Drawer điều hướng chỉ dành cho tablet / mobile (< lg) */}
      {mobileOpen && (
        <>
          <button
            type="button"
            aria-label="Đóng thanh điều hướng"
            onClick={() => setMobileOpen(false)}
            className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-xs lg:hidden"
          />
          <aside
            aria-label="Menu điều hướng di động"
            className="fixed inset-y-0 left-0 z-50 w-[264px] bg-gradient-to-b from-[#071128] via-[#0B1938] to-[#0E224A] text-white shadow-2xl flex flex-col lg:hidden"
          >
            <div className="h-[56px] px-4 flex items-center justify-between border-b border-white/10">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5"
              >
                <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white font-extrabold text-xs grid place-items-center">
                  TT
                </span>
                <span className="font-display font-bold text-base text-white">Toàn Trung CRM</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Đóng menu"
                className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
              <ul role="list" className="space-y-1">
                {visibleWorkNav.map((item) => {
                  const Icon = item.icon;
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileOpen(false)}
                        className={`flex items-center gap-3 min-h-10 px-3 rounded-xl text-sm font-medium transition ${
                          active
                            ? 'bg-blue-600/35 text-white font-semibold border border-sky-400/30'
                            : 'text-slate-300 hover:bg-white/10 hover:text-white'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && item.badge > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-bold">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>

              {visibleSystemNav.length > 0 && (
                <div className="pt-3 border-t border-white/10">
                  <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quản trị hệ thống
                  </div>
                  <ul role="list" className="space-y-1">
                    {visibleSystemNav.map((item) => {
                      const Icon = item.icon;
                      const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={`flex items-center gap-3 min-h-10 px-3 rounded-xl text-sm font-medium transition ${
                              active
                                ? 'bg-blue-600/35 text-white font-semibold'
                                : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            }`}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </nav>

            <div className="p-3 border-t border-white/10">
              <Link
                href="/profile"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 p-2 rounded-xl bg-white/5 hover:bg-white/10"
              >
                <span className="w-8 h-8 rounded-full bg-[#2563EB] text-white font-bold text-xs grid place-items-center shrink-0">
                  {getInitials(user.fullName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-white truncate">{user.fullName}</p>
                  <p className="text-[11px] text-sky-200/80 truncate">{user.roleName}</p>
                </div>
              </Link>
            </div>
          </aside>
        </>
      )}

      {/* ===================================================================== */}
      {/* PHƯƠNG ÁN 1: THANH ĐIỀU HƯỚNG NGANG TRÊN CÙNG (56px)                  */}
      {/* Giải phóng 100% cạnh trái — hết cảnh 2 thanh dọc kẹp nhau ở M02/M03   */}
      {/* ===================================================================== */}
      <header className="sticky top-0 z-30 h-[56px] shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-2.5 sm:px-4 flex items-center justify-between gap-2.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
        {/* Trái: Nút menu mobile + Thương hiệu + 6 phân hệ chính nằm ngang */}
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Mở menu điều hướng"
            className="lg:hidden min-w-9 min-h-9 rounded-xl text-slate-600 hover:text-[#1E3A8A] hover:bg-slate-100 grid place-items-center shrink-0"
          >
            <Menu aria-hidden="true" className="w-5 h-5" />
          </button>

          <Link
            href="/dashboard"
            className="flex items-center gap-2 shrink-0 pr-1 lg:pr-2.5 lg:border-r lg:border-slate-200/90 focus-visible:outline-2 focus-visible:outline-[#1E3A8A] rounded-lg"
          >
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#0F275C] to-[#2563EB] text-white font-extrabold text-xs grid place-items-center shadow-xs shrink-0">
              TT
            </span>
            <div className="hidden sm:block leading-tight">
              <span className="block font-display font-extrabold tracking-tight text-sm text-[#0F275C]">
                Toàn Trung
              </span>
              <span className="hidden 2xl:block text-[10px] font-medium text-slate-400">
                CRM V2
              </span>
            </div>
          </Link>

          <span className="lg:hidden text-slate-900 font-bold text-sm truncate">
            {currentBreadcrumb}
          </span>

          {/* Thanh điều hướng 6 phân hệ chính trên Desktop */}
          <nav
            aria-label="Điều hướng chính"
            className="hidden lg:flex items-center gap-0.5 xl:gap-1 min-w-0"
          >
            {visibleWorkNav.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? 'page' : undefined}
                  className={`relative inline-flex items-center gap-1.5 h-9 px-2.5 xl:px-3 rounded-xl text-xs xl:text-[13px] whitespace-nowrap transition-all focus-visible:outline-2 focus-visible:outline-[#1E3A8A] ${
                    active
                      ? 'bg-[#0F275C] text-white font-semibold shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                  }`}
                >
                  <Icon
                    aria-hidden="true"
                    className={`w-4 h-4 shrink-0 ${active ? 'text-sky-300' : 'text-slate-400'}`}
                  />
                  <span className="hidden 2xl:inline">{item.label}</span>
                  <span className="2xl:hidden">{item.shortLabel || item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      title={`${item.badge} Lead chờ xác nhận tiếp nhận`}
                      className={`ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold tabular-nums ${
                        active
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-amber-500 text-white'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Phải: Tìm nhanh · Thông báo · Quản trị · Hồ sơ · Đăng xuất */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {showTopbarSearch && (
            <div className="hidden md:flex w-44 xl:w-60 2xl:w-72 items-center gap-1.5 h-9 px-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 focus-within:bg-white border border-slate-200 focus-within:border-[#1E3A8A] focus-within:ring-2 focus-within:ring-blue-500/15 text-xs text-slate-800 transition-all">
              <Search aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <label htmlFor="tt-global-search-input" className="sr-only">
                {topbarSearchPlaceholder}
              </label>
              <input
                id="tt-global-search-input"
                ref={globalSearchInputRef}
                type="search"
                name="tt-crm-scoped-search"
                autoComplete="off"
                spellCheck={false}
                value={globalSearchText}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalSearchText(val);
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('tt-global-search', { detail: val }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && globalSearchText) {
                    setGlobalSearchText('');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
                    }
                  }
                }}
                placeholder={topbarSearchPlaceholder}
                className="flex-1 bg-transparent outline-none text-xs text-slate-900 placeholder:text-slate-400 min-w-0"
              />
              {globalSearchText ? (
                <button
                  type="button"
                  aria-label="Xóa từ khóa tìm kiếm"
                  onClick={() => {
                    setGlobalSearchText('');
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(new CustomEvent('tt-global-search', { detail: '' }));
                    }
                  }}
                  className="w-5 h-5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-900 text-xs font-bold grid place-items-center shrink-0"
                >
                  ×
                </button>
              ) : (
                <kbd className="text-[10px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 shrink-0">
                  /
                </kbd>
              )}
            </div>
          )}

          {showTopbarSearch && (
            <button
              type="button"
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              aria-label="Mở ô tìm kiếm"
              aria-expanded={mobileSearchOpen}
              className="md:hidden w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-600 grid place-items-center"
            >
              <Search aria-hidden="true" className="w-4 h-4" />
            </button>
          )}

          {/* Chuông Thông báo */}
          <div ref={bellRef} className="relative">
            <button
              type="button"
              onClick={() => setBellOpen((prev) => !prev)}
              aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : 'Thông báo'}
              aria-expanded={bellOpen}
              aria-haspopup="dialog"
              className="relative w-9 h-9 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-[#1E3A8A] grid place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            >
              <Bell aria-hidden="true" className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] min-h-[18px] px-1 rounded-full bg-[#2563EB] text-white text-[10px] font-bold grid place-items-center">
                  {unreadCount}
                </span>
              )}
            </button>

            {bellOpen && (
              <div
                role="dialog"
                aria-label="Thông báo gần đây"
                className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white border border-slate-200 shadow-xl z-50 overflow-hidden"
              >
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">Thông báo cần xử lý</span>
                    {unreadCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#1E3A8A] text-[11px] font-semibold">
                        {unreadCount} chưa đọc
                      </span>
                    )}
                  </div>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={() => void handleMarkAllReadQuick()}
                      className="text-xs font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-1"
                    >
                      <CheckCheck aria-hidden="true" className="w-3.5 h-3.5" />
                      <span>Đánh dấu đã đọc</span>
                    </button>
                  )}
                </div>

                {desktopNotifPermission !== 'unsupported' && (
                  <div className="px-4 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between gap-2">
                    {desktopNotifPermission === 'granted' ? (
                      <span className="text-[11px] font-semibold text-emerald-700">
                        ✓ Đã bật thông báo trình duyệt (im lặng, không tiếng kêu)
                      </span>
                    ) : desktopNotifPermission === 'denied' ? (
                      <span className="text-[11px] text-slate-500">
                        Thông báo trình duyệt đang tắt (bật lại ở biểu tượng ổ khóa thanh địa chỉ).
                      </span>
                    ) : (
                      <>
                        <span className="text-[11px] text-slate-700 font-medium">
                          Nhận báo Lead im lặng khi mở tab khác:
                        </span>
                        <button
                          type="button"
                          onClick={() => void requestDesktopNotifPermission()}
                          className="shrink-0 px-2.5 py-1 rounded-lg bg-[#1E3A8A] text-white text-[11px] font-bold hover:bg-[#1553A2] transition"
                        >
                          Bật thông báo
                        </button>
                      </>
                    )}
                  </div>
                )}

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {loadingBell ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Đang tải thông báo...
                    </div>
                  ) : recentNotifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500">
                      Chưa có thông báo cần xử lý.
                    </div>
                  ) : (
                    recentNotifications.map((item) => {
                      const isWarn =
                        item.category.toLowerCase().includes('cảnh báo') ||
                        item.category.toLowerCase().includes('quá hạn') ||
                        item.category.toLowerCase().includes('nhắc');
                      return (
                        <Link
                          key={item.id}
                          href={item.actionUrl || '/notifications'}
                          onClick={() => setBellOpen(false)}
                          className={`block px-4 py-3 hover:bg-slate-50 transition ${
                            !item.isRead ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2.5">
                            <div
                              className={`mt-0.5 w-7 h-7 rounded-lg grid place-items-center shrink-0 ${
                                isWarn
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-blue-100 text-[#1E3A8A]'
                              }`}
                            >
                              {isWarn ? (
                                <AlertTriangle aria-hidden="true" className="w-3.5 h-3.5" />
                              ) : (
                                <Bell aria-hidden="true" className="w-3.5 h-3.5" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-semibold text-slate-900 truncate">
                                  {item.title}
                                </p>
                                {!item.isRead && (
                                  <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
                                )}
                              </div>
                              <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">
                                {item.summary}
                              </p>
                              <span className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
                                <Clock aria-hidden="true" className="w-3 h-3" />
                                {new Date(item.createdAt).toLocaleString('vi-VN')}
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })
                  )}
                </div>

                <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-center">
                  <Link
                    href="/notifications"
                    onClick={() => setBellOpen(false)}
                    className="w-full min-h-8 py-1.5 rounded-xl bg-[#1E3A8A] hover:bg-[#153075] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                  >
                    <span>Xem tất cả thông báo</span>
                    <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Menu Quản trị hệ thống (Nhân sự / Cài đặt) gom gọn vào icon bánh răng */}
          {visibleSystemNav.length > 0 && (
            <div ref={adminMenuRef} className="relative hidden lg:block">
              <button
                type="button"
                onClick={() => setAdminMenuOpen((prev) => !prev)}
                aria-label="Quản trị hệ thống"
                aria-expanded={adminMenuOpen}
                className={`w-9 h-9 rounded-xl border grid place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A] ${
                  isSystemRouteActive
                    ? 'bg-[#0F275C] border-[#0F275C] text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-[#1E3A8A]'
                }`}
              >
                <Settings aria-hidden="true" className="w-4 h-4" />
              </button>

              {adminMenuOpen && (
                <div className="absolute right-0 mt-2 w-52 rounded-xl bg-white border border-slate-200 shadow-xl py-1.5 z-50">
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Quản trị hệ thống
                  </div>
                  {visibleSystemNav.map((item) => {
                    const Icon = item.icon;
                    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setAdminMenuOpen(false)}
                        className={`flex items-center gap-2.5 px-3 py-2 text-xs font-semibold transition ${
                          active
                            ? 'bg-blue-50 text-[#0F275C]'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4 text-slate-500 shrink-0" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Hồ sơ cá nhân */}
          <Link
            href="/profile"
            aria-current={pathname === '/profile' ? 'page' : undefined}
            title={`${user.fullName} · ${user.roleName}`}
            className={`inline-flex items-center gap-2 h-9 px-1.5 xl:px-2.5 rounded-xl border transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A] ${
              pathname === '/profile'
                ? 'border-[#1E3A8A] bg-blue-50/70 text-[#0F275C]'
                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
            }`}
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt=""
                className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
              />
            ) : (
              <span className="w-6 h-6 rounded-full bg-[#1E3A8A] text-white font-bold text-[10px] grid place-items-center shrink-0">
                {getInitials(user.fullName)}
              </span>
            )}
            <span className="hidden xl:inline text-xs font-semibold max-w-[116px] truncate">
              {user.fullName}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Đăng xuất"
            title="Đăng xuất"
            className="h-9 px-2.5 rounded-xl border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
          >
            <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
            <span className="hidden 2xl:inline">Đăng xuất</span>
          </button>
        </div>
      </header>

      {/* Dải nhắc Chuyển giao Lead im lặng trên toàn hệ thống (chỉ hiện khi có Lead chờ bạn tiếp nhận & không đứng ở Tổng quan/Lead) */}
      {showGlobalHandoverStrip && firstHandover && (
        <div
          role="region"
          aria-label="Lead chuyển giao chờ tiếp nhận"
          className="relative z-20 bg-amber-50/95 border-b border-amber-200/90 px-3 sm:px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs"
        >
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500 text-white text-[11px] font-bold shrink-0">
              <ArrowRightLeft className="w-3 h-3" />
              <span>Chờ tiếp nhận ({incomingHandovers.length})</span>
            </span>
            <span className="text-amber-950 font-medium truncate">
              <strong className="font-mono text-[#0F275C]" title={firstHandover.leadCode}>
                {formatCompactLeadCode(firstHandover.leadCode)}
              </strong>{' '}
              · <strong>{firstHandover.customerLabel}</strong>
              {firstHandover.fromSalesName ? ` (từ ${firstHandover.fromSalesName})` : ''}
              <span className="ml-1.5 text-amber-800">
                · {formatWaitingDuration(firstHandover.waitingMinutes)}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              disabled={confirmingLeadId === firstHandover.leadId}
              onClick={() => void handleQuickConfirmHandover(firstHandover)}
              className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 transition disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{confirmingLeadId === firstHandover.leadId ? 'Đang xác nhận...' : 'Xác nhận nhận'}</span>
            </button>
            {incomingHandovers.length > 1 && (
              <button
                type="button"
                onClick={() => setHandoverPopoverOpen((p) => !p)}
                className="h-7 px-2.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/70 text-amber-950 font-semibold inline-flex items-center gap-1 transition"
              >
                <span>Xem tất cả ({incomingHandovers.length})</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            )}
            <Link
              href={`/leads?highlight=${firstHandover.leadId}`}
              className="h-7 px-2.5 rounded-lg border border-amber-300 bg-white hover:bg-amber-100/70 text-[#1E3A8A] font-semibold inline-flex items-center"
            >
              Mở hồ sơ
            </Link>
          </div>

          {handoverPopoverOpen && incomingHandovers.length > 1 && (
            <div className="absolute right-4 top-full mt-1 w-[min(460px,calc(100vw-2rem))] rounded-2xl bg-white border border-amber-200 shadow-2xl p-3 space-y-2 z-50">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                <span className="font-bold text-slate-900">
                  {incomingHandovers.length} Lead được chuyển giao chờ bạn xác nhận
                </span>
                <button
                  type="button"
                  onClick={() => setHandoverPopoverOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {incomingHandovers.map((item) => (
                  <div
                    key={item.leadId}
                    className="p-2.5 rounded-xl border border-slate-200/90 bg-slate-50/50 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-[#1E3A8A]" title={item.leadCode}>
                          {formatCompactLeadCode(item.leadCode)}
                        </span>
                        <span className="font-semibold text-slate-900 truncate">
                          {item.customerLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.fromSalesName ? `Từ: ${item.fromSalesName} · ` : ''}
                        <span
                          className={
                            item.slaLevel === 'overdue'
                              ? 'text-rose-700 font-semibold'
                              : item.slaLevel === 'warning'
                                ? 'text-amber-700 font-semibold'
                                : ''
                          }
                        >
                          {formatWaitingDuration(item.waitingMinutes)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={confirmingLeadId === item.leadId}
                      onClick={() => void handleQuickConfirmHandover(item)}
                      className="shrink-0 h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Xác nhận</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mobileSearchOpen && (
        <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2 shrink-0">
          <Search aria-hidden="true" className="w-4 h-4 text-slate-400 shrink-0" />
          <label htmlFor="tt-mobile-search-input" className="sr-only">
            Tìm kiếm trong {currentBreadcrumb}
          </label>
          <input
            id="tt-mobile-search-input"
            type="search"
            autoComplete="off"
            value={globalSearchText}
            onChange={(e) => {
              const val = e.target.value;
              setGlobalSearchText(val);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('tt-global-search', { detail: val }));
              }
            }}
            placeholder={`Tìm kiếm trong ${currentBreadcrumb}...`}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                setMobileSearchOpen(false);
              }
            }}
            className="flex-1 text-xs bg-transparent outline-none text-slate-800"
          />
          <button
            type="button"
            onClick={() => setMobileSearchOpen(false)}
            className="text-xs text-slate-500 px-2 py-1"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Vùng nội dung chính rộng 100% */}
      <main
        id="main-workspace-content"
        tabIndex={-1}
        className={
          isFullBleed
            ? 'flex-1 w-full overflow-y-auto flex flex-col p-0 pb-16 md:pb-0 bg-[#F8FAFC] focus:outline-none'
            : 'flex-1 w-full px-2.5 sm:px-3.5 lg:px-4 py-3 pb-20 md:pb-5 overflow-y-auto bg-[#F8FAFC] focus:outline-none'
        }
      >
        {children}
      </main>

      {/* Thanh điều hướng di động (< 768px) */}
      <nav
        aria-label="Điều hướng di động"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 min-h-14 backdrop-blur-md bg-white/95 border-t border-slate-200 px-2 flex items-center justify-around shadow-md"
      >
        {[
          { href: '/dashboard', label: UI_VOCABULARY.menu.dashboard, icon: LayoutGrid },
          {
            href: '/leads',
            label: UI_VOCABULARY.menu.leads,
            icon: FileSpreadsheet,
            badge: incomingHandovers.length > 0 ? incomingHandovers.length : undefined,
          },
          { href: '/reports', label: UI_VOCABULARY.menu.reports, icon: BarChart3 },
          { href: '/notifications', label: UI_VOCABULARY.menu.notifications, icon: Bell, badge: unreadCount },
        ].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`relative min-w-[60px] min-h-[44px] px-2 py-1 rounded-[10px] flex flex-col items-center justify-center gap-0.5 text-[11px] transition-colors ${
                active ? 'text-[#1E3A8A] font-bold bg-blue-50/80' : 'text-slate-600 font-medium'
              }`}
            >
              <Icon aria-hidden="true" className="w-4 h-4" />
              <span>{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="absolute top-0.5 right-2 min-w-[16px] min-h-4 px-1 rounded-full bg-[#2563EB] text-white text-[9px] font-bold grid place-items-center">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="min-w-[60px] min-h-[44px] px-2 py-1 rounded-[10px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-slate-600"
        >
          <Menu aria-hidden="true" className="w-4 h-4" />
          <span>Menu</span>
        </button>
      </nav>

      {/* Thông báo nổi im lặng (không tiếng kêu) */}
      {latestAlertNotification && (
        <div
          role="alert"
          data-testid="global-incoming-alert-toast"
          className="fixed bottom-16 md:bottom-5 right-4 z-50 w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-[#2563EB]/40 bg-white p-4 shadow-2xl ring-4 ring-blue-500/10"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F275C] text-white grid place-items-center shrink-0 shadow-xs">
              <Bell aria-hidden="true" className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#1E3A8A] text-[10px] font-bold uppercase">
                  {latestAlertNotification.category || 'Thông báo mới'}
                </span>
                <button
                  type="button"
                  onClick={dismissLatestAlert}
                  aria-label="Đóng thông báo nổi"
                  className="text-slate-400 hover:text-slate-700 p-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs font-bold text-slate-900 leading-snug">
                {latestAlertNotification.title}
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                {latestAlertNotification.summary}
              </p>
              <div className="pt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const targetUrl = latestAlertNotification.actionUrl || '/leads';
                    const nid = latestAlertNotification.id;
                    dismissLatestAlert();
                    if (user) {
                      void apiRequest('/api/v1/notifications', {
                        method: 'PATCH',
                        csrfToken: user.csrfToken,
                        body: { notificationId: nid },
                      })
                        .then(() => setUnreadCountState(Math.max(0, unreadCount - 1)))
                        .catch(() => {});
                    }
                    router.push(targetUrl);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-[#1E3A8A] hover:bg-[#1553A2] text-white text-xs font-bold inline-flex items-center gap-1 transition shadow-2xs"
                >
                  <span>{latestAlertNotification.actionLabel || 'Mở hồ sơ ngay'}</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={dismissLatestAlert}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Để sau
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
