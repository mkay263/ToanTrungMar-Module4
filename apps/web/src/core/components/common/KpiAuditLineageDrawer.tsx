'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileSearch,
  ShieldCheck,
  X,
} from 'lucide-react';
import { apiRequest, peekApiCacheEntry } from '@/core/http/client';
import { subscribeDataSync } from '@/core/http/data-sync-bus';

export type LineageMetricType =
  | 'received_leads'
  | 'valid_leads'
  | 'ad_attributed_leads'
  | 'quoted_leads'
  | 'won_leads'
  | 'spam_leads';

interface AuditLineageRecord {
  leadId: number;
  leadCode: string;
  customerDisplay: string;
  contactDisplay: string;
  isAnonymized: boolean;
  sourceWebsite: string;
  marketingSource: string;
  campaignName: string | null;
  attributionProof: string;
  pipelineStatusLabel: string;
  assignedSalesName: string;
  contactedAt: string;
}

interface FunnelAnomalyItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  evidenceText: string;
  recommendedAction: string;
  actionHref: string;
}

const ANOMALIES_ENDPOINT = '/api/v1/reports/audit-lineage?mode=anomalies';
const ANOMALY_DISMISS_STORAGE_KEY = 'tt_v2_dismissed_anomalies_sig';

export function FunnelAnomalyGuardStrip() {
  const [anomalies, setAnomalies] = useState<FunnelAnomalyItem[]>(() => {
    const cached = peekApiCacheEntry<{ anomalies: FunnelAnomalyItem[] }>(ANOMALIES_ENDPOINT);
    return cached?.data?.anomalies || [];
  });
  const [expanded, setExpanded] = useState(false);
  const [dismissedSig, setDismissedSig] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(ANOMALY_DISMISS_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  useEffect(() => {
    let cancelled = false;
    let debounceTimer: number | null = null;
    const load = async (skipCache = false) => {
      try {
        const res = await apiRequest<{ anomalies: FunnelAnomalyItem[] }>(
          ANOMALIES_ENDPOINT,
          { skipCache },
        );
        if (!cancelled) setAnomalies(res.anomalies || []);
      } catch {
        // silent
      }
    };
    const cached = peekApiCacheEntry<{ anomalies: FunnelAnomalyItem[] }>(ANOMALIES_ENDPOINT);
    if (!cached || !cached.isFresh) {
      void load(false);
    }
    const unsub = subscribeDataSync(['leads', 'tracking', 'ads'], () => {
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void load(true);
      }, 1500);
    });
    return () => {
      cancelled = true;
      if (debounceTimer !== null) window.clearTimeout(debounceTimer);
      unsub();
    };
  }, []);

  const currentSig = anomalies.map((a) => `${a.id}:${a.title}`).join('|');
  if (anomalies.length === 0 || (dismissedSig && dismissedSig === currentSig)) return null;

  const primary = anomalies[0];
  const hasCritical = anomalies.some((a) => a.severity === 'critical');

  const handleDismiss = () => {
    setDismissedSig(currentSig);
    try {
      window.sessionStorage.setItem(ANOMALY_DISMISS_STORAGE_KEY, currentSig);
    } catch {
      // ignore storage error
    }
  };

  return (
    <section
      aria-label="Cảnh báo sớm phễu thu thập"
      className={`rounded-xl border px-3.5 py-2 text-xs transition-colors ${
        hasCritical
          ? 'border-rose-200/85 bg-rose-50/60 text-rose-950'
          : 'border-amber-200/80 bg-amber-50/55 text-slate-800'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <AlertTriangle
            className={`w-3.5 h-3.5 shrink-0 ${hasCritical ? 'text-rose-600' : 'text-amber-600'}`}
          />
          <span className="font-semibold text-slate-900 truncate">{primary.title}</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {anomalies.length > 1 && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="px-2 py-0.5 rounded-md bg-white/80 hover:bg-white border border-slate-200/80 text-[11px] font-semibold text-slate-700 transition"
            >
              {expanded ? 'Thu gọn' : `+${anomalies.length - 1} cảnh báo`}
            </button>
          )}
          <Link
            href={primary.actionHref}
            className="px-2.5 py-1 rounded-lg bg-white hover:bg-blue-50/80 border border-slate-200/90 font-semibold text-[#1E3A8A] inline-flex items-center gap-1 text-[11px] transition"
          >
            <span>Kiểm tra</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Ẩn cảnh báo này trong phiên làm việc"
            title="Ẩn tạm trong phiên này"
            className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-white/70 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {expanded && anomalies.length > 1 && (
        <div className="mt-2 pt-2 border-t border-amber-200/60 space-y-1.5">
          {anomalies.slice(1).map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white/85 border border-slate-200/70"
            >
              <div className="min-w-0 flex-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-semibold text-slate-900">{a.title}</span>
                <span className="text-slate-500 text-[11px]">{a.evidenceText}</span>
              </div>
              <Link
                href={a.actionHref}
                className="shrink-0 font-semibold text-[#1E3A8A] hover:underline inline-flex items-center gap-0.5 text-[11px]"
              >
                <span>Kiểm tra</span>
                <ArrowUpRight className="w-3 h-3" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function KpiAuditLineageDrawer({
  open,
  onClose,
  metric,
  websiteId = 'all',
  campaignName,
  fromDate,
  toDate,
}: {
  open: boolean;
  onClose: () => void;
  metric: LineageMetricType | null;
  websiteId?: string;
  campaignName?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [metricTitle, setMetricTitle] = useState('');
  const [totalMatched, setTotalMatched] = useState(0);
  const [isAnonymized, setIsAnonymized] = useState(false);
  const [roleName, setRoleName] = useState('');
  const [records, setRecords] = useState<AuditLineageRecord[]>([]);

  useEffect(() => {
    if (!open || !metric) return;
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({
      mode: 'lineage',
      metric,
      websiteId: websiteId || 'all',
    });
    if (campaignName) qs.set('campaignName', campaignName);
    if (fromDate) qs.set('from', fromDate);
    if (toDate) qs.set('to', toDate);

    void apiRequest<{
      metricTitle: string;
      totalMatched: number;
      isRoleAnonymized: boolean;
      roleName: string;
      records: AuditLineageRecord[];
    }>(`/api/v1/reports/audit-lineage?${qs.toString()}`, { skipCache: true })
      .then((res) => {
        if (cancelled) return;
        setMetricTitle(res.metricTitle);
        setTotalMatched(res.totalMatched);
        setIsAnonymized(res.isRoleAnonymized);
        setRoleName(res.roleName);
        setRecords(res.records || []);
      })
      .catch(() => {
        if (!cancelled) setRecords([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, metric, websiteId, campaignName, fromDate, toDate]);

  if (!open || !metric) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ngăn kéo đối chứng số liệu gốc"
      className="fixed inset-0 z-[75] bg-slate-950/45 backdrop-blur-xs flex justify-end"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden text-xs"
      >
        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-start justify-between gap-3 shrink-0">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#0F275C] text-white grid place-items-center shrink-0">
              <FileSearch className="w-4 h-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display font-bold text-slate-900 text-sm sm:text-base">
                  Đối chứng Gốc: {metricTitle || 'Chỉ số KPI'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-[#0F275C] font-bold">
                  {totalMatched} hồ sơ khớp
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Truy vết minh bạch 100% đến từng mã hồ sơ TT-... tạo nên con số báo cáo
                {campaignName ? ` · Chiến dịch: ${campaignName}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isAnonymized && (
          <div className="px-5 py-2 bg-blue-50/70 border-b border-blue-100 text-[11px] text-[#0F275C] flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>
              Đang hiển thị chế độ <strong>Ẩn danh PII chuẩn BA (UC01)</strong> cho vai trò {roleName} — đầy đủ mã hồ sơ &amp; nguồn đối chứng, tự động che SĐT/Email.
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="py-12 text-center text-slate-500">
              Đang truy vết danh sách hồ sơ đối chứng gốc...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              Không có bản ghi nào trong phạm vi bộ lọc và phân quyền hiện tại.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 text-slate-700 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">Mã Hồ sơ</th>
                    <th className="py-2.5 px-3 font-bold">Đơn vị / Liên hệ</th>
                    <th className="py-2.5 px-3 font-bold">Website &amp; Bằng chứng Nguồn</th>
                    <th className="py-2.5 px-3 font-bold">Trạng thái &amp; Sales</th>
                    <th className="py-2.5 px-3 font-bold text-right">Mở</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.map((rec) => (
                    <tr key={rec.leadId} className="hover:bg-blue-50/35">
                      <td className="py-2.5 px-3 font-mono font-bold text-[#1E3A8A] whitespace-nowrap">
                        <div>{rec.leadCode}</div>
                        <div className="text-[10px] font-normal text-slate-500">
                          {new Date(rec.contactedAt).toLocaleString('vi-VN')}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-900 truncate max-w-[180px]">
                          {rec.customerDisplay}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {rec.contactDisplay}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{rec.sourceWebsite}</div>
                        <div className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>{rec.attributionProof}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{rec.pipelineStatusLabel}</div>
                        <div className="text-[11px] text-slate-500">Sales: {rec.assignedSalesName}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Link
                          href={`/leads?leadId=${rec.leadId}`}
                          onClick={onClose}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#0F275C] hover:text-white font-bold text-slate-700 transition"
                        >
                          <span>Xem</span>
                          <ArrowUpRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default KpiAuditLineageDrawer;
