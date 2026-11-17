'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import type { M02TrafficInteractionDto } from '@toantrung/contracts';
import { apiRequest, peekApiCache } from '@/core/http/client';
import { useDashboardScope } from '@/core/dashboard/useDashboardScope';
import { WebsiteDashboardHeader } from '@/components/common/WebsiteDashboardHeader';
import { AnimatedMetricNumber } from '@/components/common/AnimatedMetricNumber';
import { StockAreaChart } from '@/components/common/StockAreaChart';

type M02Tab = 'overview' | 'interactions' | 'journey';
type TrafficMetricKey = 'sessions' | 'pageViews' | 'users';

export function TrackingWorkspace() {
  const { scope, hydrated, updateScope } = useDashboardScope();
  const [activeTab, setActiveTab] = useState<M02Tab>('overview');
  const [trafficMetric, setTrafficMetric] = useState<TrafficMetricKey>('sessions');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<M02TrafficInteractionDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  const loadData = useCallback(
    async (silent = false) => {
      if (!hydrated) return;
      const myId = ++reqIdRef.current;
      if (!silent && !data) setLoading(true);
      setErrorMsg(null);
      try {
        const qs = new URLSearchParams({
          view: 'spec',
          websiteId: scope.websiteId,
          preset: scope.preset,
          page: String(page),
          pageSize: '20',
        });
        if (scope.preset === 'CUSTOM' && scope.from && scope.to) {
          qs.set('from', scope.from);
          qs.set('to', scope.to);
        }
        const res = await apiRequest<M02TrafficInteractionDto>(`/api/v1/tracking?${qs.toString()}`, {
          skipCache: true,
        });
        if (myId === reqIdRef.current) {
          setData(res);
        }
      } catch (err) {
        if (myId === reqIdRef.current) {
          setErrorMsg(
            err instanceof Error
              ? err.message
              : 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.',
          );
        }
      } finally {
        if (myId === reqIdRef.current) setLoading(false);
      }
    },
    [hydrated, scope.websiteId, scope.preset, scope.from, scope.to, page],
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [scope.websiteId, scope.preset, scope.from, scope.to]);

  // Prefetch nhẹ sau khi trang chính đã tải xong để không nghẽn băng thông chuyển trang
  useEffect(() => {
    if (!data) return;
    const timer = setTimeout(() => {
      const presets: Array<'TODAY' | 'YESTERDAY' | '7D' | '30D'> = ['TODAY', 'YESTERDAY', '7D', '30D'];
      const queue: string[] = [];
      for (const p of presets) {
        if (p !== scope.preset) {
          queue.push(`/api/v1/tracking?view=spec&websiteId=${encodeURIComponent(scope.websiteId)}&preset=${p}&page=1&pageSize=20`);
        }
      }
      const siteIds = ['all', ...(data.coverage.availableWebsites || []).map((w) => w.websiteId)];
      for (const wid of siteIds) {
        if (wid !== scope.websiteId) {
          queue.push(`/api/v1/tracking?view=spec&websiteId=${encodeURIComponent(wid)}&preset=${scope.preset}&page=1&pageSize=20`);
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

  useEffect(() => {
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadData(true);
      }
    }, 25_000);
    return () => clearInterval(timer);
  }, [loadData]);

  const m = data?.metrics;
  const trafficPoints = data?.charts.trafficSeries || [];
  const maxTrafficVal = Math.max(
    1,
    ...trafficPoints.map((p) => Number(p[trafficMetric] ?? 0)),
  );
  const channelRows = data?.charts.channelRows || [];
  const maxChannelVal = Math.max(
    1,
    ...channelRows.map((c) => Math.max(c.sessions, c.validLeadCount)),
  );
  const lpTable = data?.tables.landingPageRows;
  const totalPages = lpTable ? Math.max(1, Math.ceil(lpTable.totalRows / lpTable.pageSize)) : 1;

  return (
    <div className="space-y-4 text-sm max-w-full overflow-x-hidden">
      <WebsiteDashboardHeader
        scope={scope}
        availableWebsites={data?.coverage.availableWebsites || []}
        selectedWebsiteLabel={data?.scope.websiteLabel || 'Tất cả website'}
        freshnessMessage={errorMsg ? 'Chưa cập nhật được; đang hiển thị số liệu gần nhất.' : data?.freshness.statusMessage}
        onChangeScope={updateScope}
      />

      {/* Page Title + Tabs + Export */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-bold text-slate-900">Truy cập &amp; tương tác</h2>
          {data?.coverage.note && (
            <p className="text-xs text-slate-500 mt-0.5">{data.coverage.note}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            role="tablist"
            aria-label="Phân mục Truy cập và tương tác"
            className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200 overflow-x-auto max-w-full"
          >
            {[
              { id: 'overview' as const, label: 'Tổng quan' },
              { id: 'interactions' as const, label: 'Tương tác & sản phẩm' },
              { id: 'journey' as const, label: 'Hành trình' },
            ].map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    selected
                      ? 'bg-white text-[#0B1D48] shadow-2xs border-b-2 border-[#0B1D48]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <a
            href={`/api/v1/tracking/export?websiteId=${encodeURIComponent(scope.websiteId)}&preset=${encodeURIComponent(scope.preset)}`}
            className="h-9 px-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Excel</span>
          </a>
        </div>
      </div>

      {/* Realtime 30m Bar above 6 KPI Cards */}
      <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        <div className="flex items-baseline gap-3">
          <span className="text-xs font-semibold text-slate-600">
            Người dùng hoạt động / 30 phút gần nhất:
          </span>
          <strong className="font-display text-2xl font-extrabold text-[#0B1D48]">
            <AnimatedMetricNumber value={m?.activeUsers30m} emptyText="Chưa đủ dữ liệu" />
          </strong>
          <span className="text-[11px] text-slate-500">Hiện tại · 30 phút gần nhất</span>
        </div>

        {(data?.realtimeMinutesSeries?.length || 0) > 0 && (
          <div
            className="flex items-end gap-0.5 h-8"
            aria-label="Biểu đồ người dùng hoạt động 30 phút gần nhất"
          >
            {data!.realtimeMinutesSeries.map((pt) => {
              const maxMin = Math.max(1, ...data!.realtimeMinutesSeries.map((x) => x.activeUsers));
              const h = Math.max(3, Math.round((pt.activeUsers / maxMin) * 28));
              return (
                <div
                  key={pt.minutesAgo}
                  title={`${pt.minutesAgo} phút trước: ${pt.activeUsers}`}
                  style={{ height: `${h}px` }}
                  className="w-1.5 rounded-t bg-blue-600/80"
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 6 Main KPI Cards (3 cols x 2 rows on desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Người dùng</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
            <AnimatedMetricNumber value={m?.users} />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Người dùng mới:{' '}
            <strong>{m?.newUsers !== null && m?.newUsers !== undefined ? m.newUsers.toLocaleString('vi-VN') : 'Chưa đủ dữ liệu'}</strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Phiên truy cập</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
            <AnimatedMetricNumber value={m?.sessions} />
          </div>
          <div className="mt-1 text-xs text-slate-500">Tổng phiên trong kỳ chọn</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Lượt xem trang</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
            <AnimatedMetricNumber value={m?.pageViews} />
          </div>
          <div className="mt-1 text-xs text-slate-500">Tổng lượt xem trong kỳ chọn</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Tỷ lệ tương tác</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
            <AnimatedMetricNumber value={m?.engagementRatePct} format={(v) => `${v.toFixed(1)}%`} />
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Phiên có tương tác:{' '}
            <strong>
              {m?.engagedSessions !== null && m?.engagedSessions !== undefined
                ? m.engagedSessions.toLocaleString('vi-VN')
                : 'Chưa đủ dữ liệu'}
            </strong>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Tương tác TB / người hoạt động</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-slate-900">
            <AnimatedMetricNumber value={m?.averageEngagementSeconds} format={(v) => `${v.toFixed(0)} giây`} />
          </div>
          <div className="mt-1 text-xs text-slate-500">Tính theo kỳ báo cáo</div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
          <div className="text-xs font-bold text-slate-500">Lead hợp lệ từ form</div>
          <div className="mt-1.5 font-display text-2xl font-extrabold text-[#0B1D48]">
            <AnimatedMetricNumber value={m?.validFormLeadCount} />
          </div>
          <div className="mt-1 text-xs text-slate-500">Đã tiếp nhận và sàng lọc</div>
        </div>
      </div>

      {/* Tab 1: Tổng quan */}
      {activeTab === 'overview' && (
        <div role="tabpanel" className="space-y-4">
          {/* Two charts in 8/4 ratio */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left 8 cols: Lưu lượng truy cập */}
            <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="font-bold text-slate-900">Lưu lượng truy cập</h3>
                <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200 text-xs">
                  {[
                    { id: 'sessions' as const, label: 'Phiên' },
                    { id: 'pageViews' as const, label: 'Lượt xem' },
                    { id: 'users' as const, label: 'Người dùng' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTrafficMetric(opt.id)}
                      className={`px-2.5 py-1 rounded-md font-semibold ${
                        trafficMetric === opt.id
                          ? 'bg-white text-[#0B1D48] shadow-2xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <StockAreaChart
                points={trafficPoints.map((pt) => ({
                  date: pt.date,
                  value: pt[trafficMetric],
                  isMissingData: pt.isMissingData,
                }))}
                metricLabel={
                  trafficMetric === 'sessions'
                    ? 'phiên'
                    : trafficMetric === 'pageViews'
                      ? 'lượt xem'
                      : 'người dùng'
                }
                accentColor="blue"
                loading={loading}
              />
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                <span>Kỳ: {data?.scope.startDate} → {data?.scope.endDate}</span>
                <span>Cột xám đứt nét: ngày thiếu dữ liệu (khác với ngày xác nhận bằng 0)</span>
              </div>
            </div>

            {/* Right 4 cols: Khách đến từ đâu? */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col">
              <h3 className="font-bold text-slate-900 mb-3">Khách đến từ đâu?</h3>
              <div className="h-[280px] overflow-y-auto space-y-2.5 pr-1">
                {channelRows.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-slate-400">
                    Chưa đủ dữ liệu
                  </div>
                ) : (
                  channelRows.map((ch, idx) => {
                    const metricVal = ch.sessions > 0 ? ch.sessions : ch.validLeadCount;
                    const wPct = Math.max(8, Math.round((metricVal / maxChannelVal) * 100));
                    const barColor = ch.channelLabel.includes('Tìm kiếm')
                      ? 'bg-emerald-500'
                      : ch.channelLabel.includes('Quảng cáo')
                        ? 'bg-blue-500'
                        : ch.channelLabel.includes('Mạng xã hội')
                          ? 'bg-violet-500'
                          : ch.channelLabel.includes('trực tiếp')
                            ? 'bg-indigo-500'
                            : ch.channelLabel.includes('giới thiệu')
                              ? 'bg-amber-500'
                              : idx % 2 === 0
                                ? 'bg-sky-500'
                                : 'bg-slate-400';
                    return (
                      <div key={ch.channelKey} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800 truncate">{ch.channelLabel}</span>
                          <span className="text-slate-600 shrink-0">
                            {ch.sessions > 0 ? `${ch.sessions.toLocaleString('vi-VN')} phiên · ` : ''}
                            {ch.validLeadCount} Lead
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                          <div style={{ width: `${wPct}%` }} className={`h-full ${barColor} rounded-full transition-all duration-300`} />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Full-width Landing Page Table (20 rows/page) */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Trang đích khách vào đầu tiên</h3>
              <span className="text-xs text-slate-500">Tổng {lpTable?.totalRows || 0} trang</span>
            </div>
            <div tabIndex={0} role="region" aria-label="Bảng trang đích" className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Trang khách vào đầu tiên</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Phiên truy cập</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Phiên có tương tác</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Tỷ lệ tương tác</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Form thành công</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Lead hợp lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(lpTable?.rows || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400">
                        Chưa đủ dữ liệu trang đích trong kỳ đang chọn.
                      </td>
                    </tr>
                  ) : (
                    lpTable!.rows.map((row) => (
                      <tr key={row.landingPage} className="hover:bg-slate-50/70">
                        <td className="py-2.5 px-3 font-mono text-slate-800 max-w-[360px] truncate" title={row.landingPage}>
                          {row.landingPage}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold">{row.sessions.toLocaleString('vi-VN')}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {row.engagedSessions !== null ? row.engagedSessions.toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {row.engagementRatePct !== null ? `${row.engagementRatePct}%` : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {row.successfulFormCount !== null ? row.successfulFormCount.toLocaleString('vi-VN') : '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#0B1D48]">{row.validLeadCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span>Trang {page} / {totalPages}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Trước
                  </button>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 rounded border border-slate-200 disabled:opacity-40"
                  >
                    Sau
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Tương tác & sản phẩm */}
      {activeTab === 'interactions' && (
        <div role="tabpanel" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Bảng tương tác chuyển đổi</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Hành động</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Số lượt</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Số người</th>
                    <th className="py-2.5 px-3 font-semibold">Ý nghĩa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.tables.interactionRows || []).map((row) => (
                    <tr key={row.actionKey}>
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{row.actionLabel}</td>
                      <td className="py-2.5 px-3 text-right font-bold">
                        {row.count !== null ? row.count.toLocaleString('vi-VN') : 'Chưa đủ dữ liệu'}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-600">
                        {row.users !== null ? row.users.toLocaleString('vi-VN') : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">{row.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-2xs overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900">Sản phẩm được quan tâm</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Sản phẩm</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Lượt xem</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Người xem</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Bấm gọi</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Bấm Zalo</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Lead hợp lệ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.tables.productInterestRows || []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-slate-400">
                        Chưa có Lead gắn sản phẩm trong kỳ đang chọn.
                      </td>
                    </tr>
                  ) : (
                    data!.tables.productInterestRows.map((p) => (
                      <tr key={p.productId}>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">{p.productName}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{p.pageViews ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{p.users ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{p.phoneClicks ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right text-slate-600">{p.zaloClicks ?? '—'}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-[#0B1D48]">{p.validLeadCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Thiết bị và khu vực (2 separate charts, never summed) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-2">Phiên theo thiết bị</h3>
              <p className="text-xs text-slate-500">
                {(data?.charts.deviceRows.length || 0) === 0
                  ? 'Chưa đủ dữ liệu phân rã theo thiết bị cho kỳ này.'
                  : `${data!.charts.deviceRows.length} nhóm thiết bị`}
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs">
              <h3 className="font-bold text-slate-900 mb-2">Phiên theo khu vực</h3>
              <p className="text-xs text-slate-500">
                {(data?.charts.geoRows.length || 0) === 0
                  ? 'Chưa đủ dữ liệu phân rã theo khu vực cho kỳ này.'
                  : `${data!.charts.geoRows.length} khu vực`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Hành trình */}
      {activeTab === 'journey' && (
        <div role="tabpanel" className="bg-white border border-slate-200 rounded-2xl p-5 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-slate-900">Hành trình phiên truy cập</h3>
            {data?.tables.journeyNote && (
              <p className="text-xs text-slate-600 mt-1">{data.tables.journeyNote}</p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(data?.tables.journeySteps || []).map((step, idx) => (
              <div key={step.stepKey} className="rounded-xl border border-slate-200 p-3.5 bg-slate-50/60">
                <div className="text-[11px] font-bold text-slate-500">Bước {idx + 1}</div>
                <div className="font-bold text-slate-900 mt-0.5">{step.label}</div>
                <div className="mt-2 text-lg font-extrabold text-[#0B1D48]">
                  {step.sessionCount !== null ? `${step.sessionCount.toLocaleString('vi-VN')} phiên` : 'Chưa đủ dữ liệu'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
