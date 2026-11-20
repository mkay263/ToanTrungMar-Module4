'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
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
import { useSession } from '../session/SessionContext';

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  badge?: number;
  adminOnly?: boolean;
  requiredPermission?: BaPermissionKey;
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

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/dashboard';
  const router = useRouter();
  const { user, loading, unreadCount, setUnreadCountState, logout } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      pathname === '/design' ||
      pathname === '/ai-design' ||
      pathname === '/tracking' ||
      pathname === '/ads' ||
      pathname === '/reports',
  );

  useEffect(() => {
    setSidebarCollapsed(
      pathname === '/design' ||
        pathname === '/ai-design' ||
        pathname === '/tracking' ||
        pathname === '/ads' ||
        pathname === '/reports',
    );
  }, [pathname]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [globalSearchText, setGlobalSearchText] = useState('');
  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);

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

  // Guard against browser password manager autofilling user email into search input
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

  const [bellOpen, setBellOpen] = useState(false);
  const [recentNotifications, setRecentNotifications] = useState<NotificationDto[]>([]);
  const [loadingBell, setLoadingBell] = useState(false);
  const bellRef = useRef<HTMLDivElement | null>(null);

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
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBellOpen(false);
    };
    if (bellOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEsc);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [bellOpen]);

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

  // C03: Menu chuẩn thống nhất: Tổng quan · Lead · Chiến dịch · Từ khóa & SEO · Báo cáo · Thiết kế AI
  const workNav: NavItem[] = [
    {
      href: '/dashboard',
      label: UI_VOCABULARY.menu.dashboard,
      shortLabel: UI_VOCABULARY.menu.dashboard,
      icon: LayoutGrid,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/leads',
      label: UI_VOCABULARY.menu.leads,
      shortLabel: UI_VOCABULARY.menu.leads,
      icon: FileSpreadsheet,
      requiredPermission: 'LEAD_VIEW_OWN',
    },
    {
      href: '/tracking',
      label: UI_VOCABULARY.menu.campaigns,
      shortLabel: UI_VOCABULARY.menu.campaigns,
      icon: Crosshair,
      requiredPermission: 'TRACKING_ADS_OPTIMIZE',
    },
    {
      href: '/ads',
      label: UI_VOCABULARY.menu.seo,
      shortLabel: UI_VOCABULARY.menu.seo,
      icon: Megaphone,
      requiredPermission: 'AI_MARKETING_SEO',
    },
    {
      href: '/reports',
      label: UI_VOCABULARY.menu.reports,
      shortLabel: UI_VOCABULARY.menu.reports,
      icon: BarChart3,
      requiredPermission: 'DASHBOARD_VIEW',
    },
    {
      href: '/design',
      label: UI_VOCABULARY.menu.design,
      shortLabel: UI_VOCABULARY.menu.design,
      icon: Sparkles,
      requiredPermission: 'AI_DESIGN',
    },
  ];

  const personalNav: NavItem[] = [
    {
      href: '/notifications',
      label: UI_VOCABULARY.menu.notifications,
      shortLabel: UI_VOCABULARY.menu.notifications,
      icon: Bell,
      badge: unreadCount,
    },
  ];

  // Chỉ hiển thị ô tìm kiếm trên thanh Topbar ở các phân hệ dùng tìm kiếm toàn trang, tránh trùng với ô tìm kiếm nội bộ bảng
  const showTopbarSearch =
    pathname === '/dashboard' ||
    pathname === '/leads' ||
    pathname.startsWith('/leads/') ||
    pathname === '/tracking' ||
    pathname === '/reports' ||
    pathname === '/design';

  // Các trang đã có thẻ tiêu đề H1 lớn ngay đầu trang thì không lặp lại tên trang lần 2 ở Topbar desktop
  const pageHasOwnHeaderTitle =
    pathname === '/dashboard' ||
    pathname === '/tracking' ||
    pathname === '/ads' ||
    pathname === '/reports' ||
    pathname === '/notifications' ||
    pathname.startsWith('/admin/') ||
    pathname.startsWith('/settings');

  const topbarSearchPlaceholder =
    pathname === '/leads' || pathname.startsWith('/leads/')
      ? 'Tìm SĐT, tên khách, công ty, mã hồ sơ Lead...'
      : `Tìm kiếm nhanh trong ${currentBreadcrumb}...`;

  const systemNav: NavItem[] = [
    {
      href: '/admin/users',
      label: UI_VOCABULARY.menu.users,
      shortLabel: UI_VOCABULARY.menu.users,
      icon: Users,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
    {
      href: '/settings',
      label: UI_VOCABULARY.menu.settings,
      shortLabel: UI_VOCABULARY.menu.settings,
      icon: Settings,
      adminOnly: true,
      requiredPermission: 'SYSTEM_USER_ADMIN',
    },
  ];

  if (loading) {
    // Khung skeleton nhẹ tức thì thay vì màn hình splash chặn toàn trang (content-first-noise-reduction & C02)
    return (
      <div className="min-h-screen bg-slate-50 flex w-full">
        <div className="hidden lg:block w-[232px] bg-[#0B1426] shrink-0" />
        <div className="flex-1 flex flex-col">
          <div className="h-[58px] bg-white border-b border-slate-200 px-3 flex items-center">
            <div className="h-4 w-32 rounded bg-slate-200 animate-pulse" />
          </div>
          <div className="p-3 space-y-3">
            <div className="h-20 rounded-[12px] bg-white border border-slate-200 animate-pulse" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[108px] rounded-[12px] bg-white border border-slate-200 animate-pulse" />
              ))}
            </div>
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

  const renderNavGroup = (items: NavItem[], groupLabel?: string, withTopBorder = false) => {
    if (items.length === 0) return null;
    return (
      <div className={withTopBorder ? 'mt-3.5 pt-3 border-t border-white/[0.08]' : ''}>
        {groupLabel && !sidebarCollapsed && (
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400/80 select-none">
            {groupLabel}
          </div>
        )}
        <ul role="list" className="space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  prefetch={true}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileOpen(false)}
                  className={`group relative flex items-center gap-3 min-h-10 py-2 rounded-xl px-3 text-sm transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    sidebarCollapsed ? 'lg:justify-center lg:px-0' : 'lg:justify-start lg:px-3'
                  } ${
                    active
                      ? 'bg-gradient-to-r from-blue-600/35 via-indigo-600/20 to-white/[0.04] text-white font-semibold border border-sky-400/25 shadow-xs before:content-[""] before:absolute before:inset-y-1.5 before:start-0 before:border-s-[3.5px] before:border-sky-300 before:rounded-e'
                      : 'text-slate-300/90 font-medium hover:bg-white/[0.07] hover:text-white'
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg grid place-items-center shrink-0 transition-colors ${
                      active
                        ? 'bg-sky-400/20 text-sky-200'
                        : 'bg-transparent text-slate-400 group-hover:text-white group-hover:bg-white/[0.06]'
                    }`}
                  >
                    <Icon aria-hidden="true" className="w-[17px] h-[17px]" />
                  </span>
                  <span
                    className={`truncate flex-1 text-sm ${
                      sidebarCollapsed ? 'lg:hidden' : 'lg:inline'
                    }`}
                  >
                    {item.label}
                  </span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`inline-flex items-center justify-center min-w-[20px] min-h-5 px-1.5 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white text-[11px] font-bold shadow-2xs ${
                        sidebarCollapsed
                          ? 'lg:absolute lg:top-1 lg:right-1 lg:min-w-[16px] lg:min-h-4 lg:text-[9px] lg:px-1'
                          : 'lg:static'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none fixed left-16 z-50 ml-2 hidden rounded-lg bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100 ${
                      sidebarCollapsed ? 'lg:block' : 'lg:hidden'
                    }`}
                  >
                    {item.label}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-800 flex w-full overflow-hidden">
      <a
        href="#main-workspace-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-[10px] focus:bg-[#0B1D48] focus:px-4 focus:py-2 focus:text-xs focus:font-semibold focus:text-white focus:shadow-lg"
      >
        Chuyển đến nội dung chính
      </a>

      {/* Scrim khi mở menu trên tablet / mobile */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Đóng thanh điều hướng"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Desktop 236px hiện đại, dễ nhìn */}
      <aside
        aria-label="Thanh điều hướng hệ thống"
        className={`group/sidebar fixed inset-y-0 left-0 z-50 lg:sticky lg:top-0 lg:h-screen bg-gradient-to-b from-[#071128] via-[#0B1938] to-[#0E224A] text-white border-r border-slate-800/90 flex flex-col transition-[width,transform] duration-200 ${
          sidebarCollapsed ? 'lg:w-16' : 'lg:w-[236px]'
        } w-[240px] ${mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Header thương hiệu nổi bật */}
        <div
          className={`relative h-[60px] flex items-center justify-between border-b border-white/[0.08] ${
            sidebarCollapsed ? 'px-2 lg:justify-center' : 'px-4'
          }`}
        >
          {sidebarCollapsed ? (
            <div className="relative w-9 h-9 flex items-center justify-center">
              <Link
                href="/dashboard"
                aria-label="Trang Tổng quan Toàn Trung"
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 flex items-center justify-center text-white font-extrabold text-sm shadow-md shadow-blue-950/50 ring-1 ring-white/20 transition-opacity duration-150 group-hover/sidebar:opacity-0 group-hover/sidebar:pointer-events-none"
              >
                TT
              </Link>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Mở rộng thanh điều hướng"
                className="hidden lg:flex absolute inset-0 w-9 h-9 rounded-xl bg-[#2563EB] hover:bg-blue-500 text-white items-center justify-center shadow-md opacity-0 pointer-events-none group-hover/sidebar:opacity-100 group-hover/sidebar:pointer-events-auto transition-opacity duration-150"
              >
                <ChevronRight aria-hidden="true" className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <>
              <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0">
                <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-700 text-white font-extrabold text-xs grid place-items-center shrink-0 shadow-md shadow-blue-950/50 ring-1 ring-white/20">
                  TT
                </span>
                <div className="min-w-0">
                  <span className="block font-display font-bold tracking-tight text-base text-white truncate leading-tight">
                    Toàn Trung
                  </span>
                  <span className="block text-[10px] font-medium text-sky-300/80 truncate">
                    Điều hành Kinh doanh &amp; MKT
                  </span>
                </div>
              </Link>

              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Thu gọn thanh điều hướng"
                className="hidden lg:grid w-7 h-7 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 place-items-center shrink-0 transition"
              >
                <ChevronLeft aria-hidden="true" className="w-4 h-4" />
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Đóng menu"
            className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
          >
            <X aria-hidden="true" className="w-5 h-5" />
          </button>
        </div>

        <nav aria-label="Chính" className="flex-1 overflow-y-auto px-2.5 py-3">
          {renderNavGroup(visibleWorkNav, 'Điều hành nghiệp vụ', false)}
          {renderNavGroup(personalNav, 'Cá nhân', true)}
          {renderNavGroup(visibleSystemNav, 'Quản trị hệ thống', true)}
        </nav>

        {/* Tài khoản ở cuối sidebar — điểm truy cập Tài khoản cá nhân duy nhất trên desktop */}
        <div className="p-2.5 border-t border-white/[0.08]">
          <Link
            href="/profile"
            aria-current={pathname === '/profile' ? 'page' : undefined}
            className={`relative overflow-hidden flex items-center gap-2.5 rounded-xl p-2 border transition-all bg-white/[0.05] hover:bg-white/[0.09] ${
              pathname === '/profile'
                ? 'border-sky-300 ring-1 ring-sky-300/40'
                : 'border-white/15 hover:border-sky-400/50'
            } ${sidebarCollapsed ? 'lg:justify-center' : 'lg:justify-start'}`}
          >
            <div className="relative z-10 shrink-0">
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover ring-2 ring-white/40"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#2563EB] text-white font-bold text-xs grid place-items-center ring-2 ring-white/30">
                  {getInitials(user.fullName)}
                </div>
              )}
            </div>
            <div className={`relative z-10 min-w-0 flex-1 ${sidebarCollapsed ? 'lg:hidden' : 'lg:block'}`}>
              <p className="text-xs font-semibold text-white truncate drop-shadow-2xs">{user.fullName}</p>
              <p className="text-[11px] text-sky-200/90 truncate">{user.roleName} · Tài khoản</p>
            </div>
          </Link>
        </div>
      </aside>

      {/* Vùng nội dung chính bên phải (một vùng cuộn dọc chính duy nhất — C03) */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Topbar gọn sạch: không lặp lại danh sách phân hệ, tên thương hiệu hay hồ sơ đã có ở thanh bên trái */}
        <header className="sticky top-0 z-30 h-[52px] shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-2.5 sm:px-3 lg:px-3 flex items-center justify-between gap-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu điều hướng"
              className="lg:hidden min-w-9 min-h-9 -ml-1 rounded-xl text-slate-600 hover:text-[#1E3A8A] hover:bg-slate-100 grid place-items-center"
            >
              <Menu aria-hidden="true" className="w-5 h-5" />
            </button>

            <span
              className={`text-slate-900 font-bold text-sm sm:text-base truncate ${
                pageHasOwnHeaderTitle ? 'lg:hidden' : ''
              }`}
            >
              {currentBreadcrumb}
            </span>
          </div>

          {/* Ô tìm kiếm duy nhất cho các trang dữ liệu không có thanh tìm riêng */}
          {showTopbarSearch ? (
            <div className="hidden md:flex flex-1 max-w-lg items-center gap-2 min-h-9 px-3 rounded-[10px] bg-slate-50 hover:bg-slate-100/70 focus-within:bg-white border border-slate-200 focus-within:border-[#1E3A8A] focus-within:ring-2 focus-within:ring-blue-500/15 text-sm text-slate-800 transition-colors">
              <Search aria-hidden="true" className="w-4 h-4 text-slate-400 shrink-0" />
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
                className="flex-1 bg-transparent outline-none text-sm text-slate-900 placeholder:text-slate-400 min-w-0"
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
                  className="min-w-6 min-h-6 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-900 text-xs font-bold grid place-items-center shrink-0"
                >
                  ×
                </button>
              ) : (
                <kbd className="text-[11px] font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200 text-slate-400 shrink-0">
                  /
                </kbd>
              )}
            </div>
          ) : (
            <div className="flex-1" />
          )}

          <div className="flex items-center gap-2 shrink-0">
            {showTopbarSearch && (
              <button
                type="button"
                onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
                aria-label="Mở ô tìm kiếm"
                aria-expanded={mobileSearchOpen}
                className="md:hidden min-w-9 min-h-9 rounded-[10px] border border-slate-200 bg-white text-slate-600 grid place-items-center"
              >
                <Search aria-hidden="true" className="w-4 h-4" />
              </button>
            )}

            {/* Thông báo */}
            <div ref={bellRef} className="relative">
              <button
                type="button"
                onClick={() => setBellOpen((prev) => !prev)}
                aria-label={unreadCount > 0 ? `Thông báo (${unreadCount} chưa đọc)` : 'Thông báo'}
                aria-expanded={bellOpen}
                aria-haspopup="dialog"
                className="relative min-w-9 min-h-9 rounded-[10px] border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 hover:text-[#1E3A8A] grid place-items-center transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
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
                  className="absolute right-0 mt-2 w-80 sm:w-96 rounded-[12px] bg-white border border-slate-200 shadow-xl z-50 overflow-hidden"
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
                      className="w-full min-h-8 py-1.5 rounded-[10px] bg-[#1E3A8A] hover:bg-[#153075] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition"
                    >
                      <span>Xem tất cả thông báo</span>
                      <ArrowUpRight aria-hidden="true" className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Chỉ hiện avatar gọn trên mobile (vì desktop đã có thẻ Hồ sơ ở thanh bên trái) */}
            <Link
              href="/profile"
              aria-label="Tài khoản cá nhân"
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 bg-white hover:border-slate-300 transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                />
              ) : (
                <span className="w-6 h-6 rounded-full bg-blue-100 text-[#1E3A8A] font-bold text-[11px] grid place-items-center shrink-0">
                  {getInitials(user.fullName)}
                </span>
              )}
            </Link>

            <button
              type="button"
              onClick={() => void logout()}
              aria-label="Đăng xuất"
              className="min-h-9 px-2.5 rounded-[10px] border border-slate-200 bg-white hover:bg-red-50 hover:border-red-200 text-slate-600 hover:text-red-700 text-xs font-medium inline-flex items-center gap-1.5 transition-colors focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            >
              <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
              <span className="hidden xl:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {mobileSearchOpen && (
          <div className="md:hidden bg-white border-b border-slate-200 px-4 py-2.5 flex items-center gap-2">
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

        {/* Khoảng trắng 2 bên tối thiểu (px-2 sm:px-2.5 lg:px-3) để tối đa diện tích bảng & biểu đồ */}
        <main
          id="main-workspace-content"
          tabIndex={-1}
          className={
            isFullBleed
              ? 'flex-1 w-full h-[calc(100vh-56px)] overflow-y-auto flex flex-col p-0 pb-16 md:pb-0 bg-[#F8FAFC] focus:outline-none'
              : 'flex-1 w-full px-2 sm:px-2.5 lg:px-3 py-3 pb-20 md:pb-4 overflow-y-auto bg-[#F8FAFC] focus:outline-none'
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
            { href: '/leads', label: UI_VOCABULARY.menu.leads, icon: FileSpreadsheet },
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
      </div>
    </div>
  );
}
