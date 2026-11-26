'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Bell,
  Bold,
  Download,
  Eye,
  FileText,
  Heading1,
  Heading2,
  History,
  Italic,
  List,
  Printer,
  RefreshCw,
  Send,
  Sparkles,
  Table,
  Underline,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  M04ResultsReportDto,
  NotificationDto,
  ReportsDashboardDto,
  SessionUserDto,
} from '@toantrung/contracts';
import { apiRequest } from '../../core/http/client';
import { useSession } from '../../core/session/SessionContext';
import { SafeHtmlRenderer, cleanUntrustedHtmlClient } from '../../components/common/SafeHtmlRenderer';

interface DispatchedReportItem {
  id: number;
  reportCode: string;
  status?: 'DRAFT' | 'ISSUED';
  title: string;
  summary: string;
  contentHtml: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
}

interface ReportDocComposerProps {
  user: SessionUserDto | null;
  data: ReportsDashboardDto & { dispatchedReports?: DispatchedReportItem[] };
  scope: {
    websiteId: string;
    preset: string;
    from?: string;
    to?: string;
  };
  m04Data?: M04ResultsReportDto | null;
}

const DEPARTMENTS = [
  { id: 'KINH_DOANH', label: 'Phòng Kinh doanh' },
  { id: 'MARKETING_SEO', label: 'Marketing & SEO' },
  { id: 'ADS', label: 'Quảng cáo (Ads)' },
  { id: 'KY_THUAT_THIET_KE', label: 'Kỹ thuật & Thiết kế' },
] as const;

function getRoleDefaultDepartment(roleCode?: string): string {
  if (!roleCode) return 'KINH_DOANH';
  if (roleCode.includes('SALES')) return 'KINH_DOANH';
  if (roleCode.includes('MKT')) return 'MARKETING_SEO';
  if (roleCode === 'ADS') return 'ADS';
  if (roleCode === 'DESIGNER') return 'KY_THUAT_THIET_KE';
  return 'KINH_DOANH';
}

function getVnYmdDate(d = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    return new Date(d.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }
}

function sanitizeReportHtml(rawHtml: string): string {
  return cleanUntrustedHtmlClient(rawHtml || '');
}

export function ReportDocComposer({ user, data, scope, m04Data }: ReportDocComposerProps) {
  const { unreadCount, setUnreadCountState } = useSession();
  const isDirectorOrAdmin = user?.roleCode === 'BOD' || user?.roleCode === 'ADMIN';
  const lockedDeptId = getRoleDefaultDepartment(user?.roleCode);

  const [dispatchScope, setDispatchScope] = useState<'BROADCAST_ALL' | 'CUSTOM_DEPARTMENTS'>(
    isDirectorOrAdmin ? 'BROADCAST_ALL' : 'CUSTOM_DEPARTMENTS',
  );
  const [selectedDepts, setSelectedDepts] = useState<string[]>(
    isDirectorOrAdmin ? ['KINH_DOANH', 'MARKETING_SEO'] : [lockedDeptId],
  );
  const [docTitle, setDocTitle] = useState(
    'BÁO CÁO HIỆU QUẢ KINH DOANH & MARKETING TOÀN TRUNG',
  );
  const [fontScale, setFontScale] = useState<number>(100);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dispatchToast, setDispatchToast] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatching, setDispatching] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<number | null>(null);
  const isDirtyDraftRef = useRef<boolean>(false);

  const periodStart = m04Data?.scope.startDate || data.fromDate;
  const periodEnd = m04Data?.scope.endDate || data.toDate;
  const scopeSiteLabel = m04Data?.scope.websiteLabel || data.websiteLabel || 'Tất cả website';

  const buildScopedHtml = useCallback(() => {
    const f = data.overview;
    const receivedCount =
      m04Data?.metrics.receivedLeadCount ?? m04Data?.metrics.totalLeadCount ?? f.totalLeadsL1;
    const validCount = m04Data?.metrics.validLeadCount ?? f.validLeadsL2;
    const wonCount = m04Data?.metrics.wonLeadCount ?? f.wonCount;
    const winRateText =
      m04Data?.metrics.winRatePct !== null && m04Data?.metrics.winRatePct !== undefined
        ? `${m04Data.metrics.winRatePct}%`
        : f.winRateText;
    const overdueCount = m04Data?.metrics.overdueQuoteCount ?? f.overdue7DaysQuoteCount;
    const adCost = m04Data?.metrics.adCost ?? m04Data?.metrics.attributedAdCost ?? null;
    const cpl = m04Data?.metrics.costPerValidAdLead ?? null;
    const topProducts =
      (m04Data?.tables.byProduct || [])
        .filter((p) => !p.isUnclassifiedProduct)
        .slice(0, 3)
        .map((p) => p.productName)
        .join(', ') ||
      (data.productInsights || [])
        .slice(0, 3)
        .map((p) => p.productName)
        .join(', ') ||
      'các dòng sản phẩm chủ lực';

    const adCostLine =
      adCost !== null
        ? `<li><strong>Chi phí quảng cáo:</strong> ${Math.round(adCost).toLocaleString('vi-VN')} ₫${cpl !== null ? ` (CPL: ${Math.round(cpl).toLocaleString('vi-VN')} ₫)` : ''}</li>`
        : '';

    return `
      <h2>1. Tóm tắt chỉ số chính</h2>
      <p>Tổng hợp số liệu kỳ <strong>${periodStart} → ${periodEnd}</strong> · Phạm vi: <strong>${scopeSiteLabel}</strong>.</p>
      <ul>
        ${adCostLine}
        <li><strong>Lead tiếp nhận:</strong> ${receivedCount} hồ sơ</li>
        <li><strong>Lead hợp lệ:</strong> ${validCount} hồ sơ</li>
        <li><strong>Chốt thành công:</strong> ${wonCount} dự án (Tỷ lệ chốt: ${winRateText})</li>
        <li><strong>Báo giá chờ phản hồi quá 7 ngày:</strong> ${overdueCount} hồ sơ</li>
      </ul>
      <h2>2. Tình hình xử lý &amp; Sản phẩm quan tâm</h2>
      <p>Hiện có <strong>${f.newLeadCount}</strong> Lead mới, <strong>${f.quotingCount}</strong> hồ sơ đang soạn báo giá và <strong>${f.quoteSentCount}</strong> hồ sơ đã gửi báo giá. Nhóm sản phẩm được hỏi nhiều gồm: <strong>${topProducts}</strong>.</p>
      <h2>3. Đề xuất hành động trọng tâm</h2>
      <p>- Đội ngũ Kinh doanh ưu tiên bám sát các hồ sơ đã gửi báo giá quá 7 ngày chưa phản hồi.</p>
      <p>- Bộ phận Marketing &amp; Ads rà soát phân bổ ngân sách theo website và chiến dịch mang lại Lead hợp lệ tốt nhất.</p>
    `.trim();
  }, [data, m04Data, periodStart, periodEnd, scopeSiteLabel]);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const editorBootstrappedRef = useRef<boolean>(false);
  const [docHtml, setDocHtml] = useState<string>(() => buildScopedHtml());
  const [archivedReports, setArchivedReports] = useState<DispatchedReportItem[]>(
    data.dispatchedReports || [],
  );
  const [activeArchivedId, setActiveArchivedId] = useState<number | null>(null);

  useEffect(() => {
    if (editorRef.current && !editorBootstrappedRef.current) {
      editorBootstrappedRef.current = true;
      editorRef.current.innerHTML = sanitizeReportHtml(docHtml);
    }
  }, [docHtml]);

  useEffect(() => {
    if (data.dispatchedReports) {
      setArchivedReports(data.dispatchedReports);
      const latestDraft = data.dispatchedReports.find((r) => r.status === 'DRAFT');
      if (latestDraft && !activeArchivedId && !isDirtyDraftRef.current) {
        const cleanHtml = sanitizeReportHtml(latestDraft.contentHtml);
        setActiveDraftId(latestDraft.id);
        setDocTitle(latestDraft.title);
        setDocHtml(cleanHtml);
        if (editorRef.current) {
          editorRef.current.innerHTML = cleanHtml;
        }
      }
    }
  }, [data.dispatchedReports, activeArchivedId]);

  useEffect(() => {
    if (typeof window === 'undefined' || archivedReports.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const viewId = Number(params.get('viewReportId'));
    if (Number.isInteger(viewId) && viewId > 0) {
      const found = archivedReports.find((r) => r.id === viewId);
      if (found) {
        const cleanHtml = sanitizeReportHtml(found.contentHtml);
        setActiveArchivedId(found.id);
        setDocTitle(found.title);
        setDocHtml(cleanHtml);
        isDirtyDraftRef.current = false;
        if (editorRef.current) {
          editorRef.current.innerHTML = cleanHtml;
        }
      }
    }
  }, [archivedReports]);

  const handleLoadArchivedReport = (item: DispatchedReportItem) => {
    const cleanHtml = sanitizeReportHtml(item.contentHtml);
    setActiveArchivedId(item.id);
    setDocTitle(item.title);
    setDocHtml(cleanHtml);
    isDirtyDraftRef.current = false;
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanHtml;
    }
  };

  const handleReloadScopedMetrics = () => {
    const nextHtml = sanitizeReportHtml(buildScopedHtml());
    setActiveArchivedId(null);
    isDirtyDraftRef.current = true;
    setDocHtml(nextHtml);
    if (editorRef.current) {
      editorRef.current.innerHTML = nextHtml;
    }
    setDispatchToast(`Đã nạp số liệu kỳ ${periodStart} → ${periodEnd} (${scopeSiteLabel}).`);
  };

  const handleSaveDraft = async () => {
    if (savingDraft) return;
    setSavingDraft(true);
    setDispatchError(null);
    try {
      const currentContent = sanitizeReportHtml(
        editorRef.current ? editorRef.current.innerHTML : docHtml,
      );
      const targetDeptList =
        isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
          ? ['ALL']
          : isDirectorOrAdmin
            ? selectedDepts
            : [lockedDeptId];

      const res = await apiRequest<{
        id: number;
        reportCode: string;
        status: 'DRAFT';
        updatedAt: string;
      }>('/api/v1/reports', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'save_draft',
          draftId: activeDraftId,
          title: docTitle,
          summary: `Bản nháp lưu lúc ${new Date().toLocaleTimeString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
          contentHtml: currentContent,
          targetDepartments: targetDeptList,
          reportingPeriod: `${periodStart} → ${periodEnd}`,
        },
      });
      isDirtyDraftRef.current = false;
      setActiveDraftId(res.id);
      const draftEntry: DispatchedReportItem = {
        id: res.id,
        reportCode: res.reportCode,
        status: 'DRAFT',
        title: docTitle,
        summary: 'Bản nháp đang chỉnh sửa',
        contentHtml: currentContent,
        authorName: user?.fullName || 'Điều hành',
        authorRole: user?.roleName || '',
        createdAt: res.updatedAt,
      };
      setArchivedReports((prev) => [
        draftEntry,
        ...prev.filter((r) => r.id !== res.id),
      ]);
      setDispatchToast(`Đã lưu bản nháp "${docTitle}" (${res.reportCode}).`);
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Không thể lưu bản nháp báo cáo.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleExportWordDoc = async () => {
    if (exportingDocx) return;
    setExportingDocx(true);
    setDispatchError(null);
    const currentContent = sanitizeReportHtml(
      editorRef.current ? editorRef.current.innerHTML : docHtml,
    );
    const dateStamp = getVnYmdDate();
    try {
      const res = await fetch('/api/v1/reports/docx', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : {}),
        },
        body: JSON.stringify({
          title: docTitle,
          reportingPeriod: `${periodStart} → ${periodEnd}`,
          contentHtml: currentContent,
          websiteId: scope.websiteId || 'all',
          preset: scope.preset || 'CUSTOM',
          from: periodStart || scope.from || '',
          to: periodEnd || scope.to || '',
        }),
      });
      if (!res.ok) {
        throw new Error('Không thể tạo tệp Word (.docx).');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BaoCao_ToanTrung_${scope.websiteId || 'all'}_${dateStamp}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Không thể xuất tệp Word (.docx).',
      );
    } finally {
      setExportingDocx(false);
    }
  };

  const applyCommand = (command: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, value);
    isDirtyDraftRef.current = true;
    setDocHtml(editorRef.current.innerHTML);
  };

  const insertKpiTableBlock = () => {
    const f = data.overview;
    const receivedCount =
      m04Data?.metrics.receivedLeadCount ?? m04Data?.metrics.totalLeadCount ?? f.totalLeadsL1;
    const validCount = m04Data?.metrics.validLeadCount ?? f.validLeadsL2;
    const wonCount = m04Data?.metrics.wonLeadCount ?? f.wonCount;
    const winRateText =
      m04Data?.metrics.winRatePct !== null && m04Data?.metrics.winRatePct !== undefined
        ? `${m04Data.metrics.winRatePct}%`
        : f.winRateText;
    const adCost = m04Data?.metrics.adCost ?? m04Data?.metrics.attributedAdCost ?? null;
    const cpl = m04Data?.metrics.costPerValidAdLead ?? null;

    const adRows =
      adCost !== null
        ? `
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px;">Chi phí quảng cáo</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${Math.round(adCost).toLocaleString('vi-VN')} ₫</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Chi phí thực tế trong phạm vi chọn</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border:1px solid #cbd5e1; padding:8px;">CPL quảng cáo hợp lệ</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${cpl !== null ? `${Math.round(cpl).toLocaleString('vi-VN')} ₫` : 'Chưa đủ dữ liệu'}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Chi phí trên mỗi Lead hợp lệ từ quảng cáo</td>
          </tr>`
        : '';

    const tableHtml = `
      <table style="width:100%; border-collapse:collapse; margin: 14px 0; font-size: 13px;">
        <thead>
          <tr style="background:#1E3A8A; color:#ffffff;">
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Chỉ tiêu</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:right;">Giá trị</th>
            <th style="border:1px solid #cbd5e1; padding:8px; text-align:left;">Diễn giải</th>
          </tr>
        </thead>
        <tbody>
          ${adRows}
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px;">Lead tiếp nhận</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${receivedCount}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Tổng hồ sơ tạo trong kỳ</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border:1px solid #cbd5e1; padding:8px;">Lead hợp lệ</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${validCount}</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Đã loại trừ thư rác</td>
          </tr>
          <tr>
            <td style="border:1px solid #cbd5e1; padding:8px;">Chốt thành công</td>
            <td style="border:1px solid #cbd5e1; padding:8px; text-align:right; font-weight:bold;">${wonCount} (${winRateText})</td>
            <td style="border:1px solid #cbd5e1; padding:8px;">Số hồ sơ chốt / Tỷ lệ chốt trên Lead hợp lệ</td>
          </tr>
        </tbody>
      </table>
    `;
    if (editorRef.current) {
      editorRef.current.innerHTML += tableHtml;
      isDirtyDraftRef.current = true;
      setDocHtml(editorRef.current.innerHTML);
    }
  };

  const insertSignatureBlock = () => {
    const sigHtml = `
      <div style="margin-top:28px; display:flex; justify-content:space-between; font-size:12px;">
        <div>
          <strong>NGƯỜI LẬP BÁO CÁO</strong>
          <p style="margin-top:36px;">${user?.fullName || 'Nhân sự Toàn Trung'} (${user?.roleName || ''})</p>
        </div>
        <div style="text-align:right;">
          <strong>PHÊ DUYỆT</strong>
          <p style="margin-top:36px;">Ban Giám đốc Công ty Toàn Trung</p>
        </div>
      </div>
    `;
    if (editorRef.current) {
      editorRef.current.innerHTML += sigHtml;
      isDirtyDraftRef.current = true;
      setDocHtml(editorRef.current.innerHTML);
    }
  };

  const handleToggleDepartment = (deptId: string) => {
    if (!isDirectorOrAdmin) return;
    setSelectedDepts((prev) =>
      prev.includes(deptId) ? prev.filter((d) => d !== deptId) : [...prev, deptId],
    );
  };

  const handleDispatchReport = async () => {
    if (dispatching) return;
    setDispatching(true);
    setDispatchError(null);
    const targetNames =
      isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
        ? 'Toàn công ty'
        : DEPARTMENTS.filter((d) =>
            (isDirectorOrAdmin ? selectedDepts : [lockedDeptId]).includes(d.id),
          )
            .map((d) => d.label)
            .join(', ') || 'Phòng ban';

    const toastMessage = `Đã gửi báo cáo tới ${targetNames}`;

    try {
      const currentHtml = editorRef.current ? editorRef.current.innerHTML : docHtml;
      const targetDeptList =
        isDirectorOrAdmin && dispatchScope === 'BROADCAST_ALL'
          ? ['ALL']
          : isDirectorOrAdmin
            ? selectedDepts
            : [lockedDeptId];

      const res = await apiRequest<{
        items: NotificationDto[];
        unreadCount: number;
        savedReportId?: number | null;
      }>('/api/v1/notifications', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          title: `Báo cáo mới: ${docTitle}`,
          summary: `${toastMessage} · Người lập: ${user?.fullName || 'Điều hành'}.`,
          category: 'Báo cáo & Điều hành',
          actionLabel: 'Mở đọc báo cáo',
          actionUrl: '/reports?section=composer',
          contentHtml: currentHtml,
          targetDepartments: targetDeptList,
        },
      });
      if (typeof res.unreadCount === 'number') {
        setUnreadCountState(res.unreadCount);
      } else {
        setUnreadCountState(unreadCount + 1);
      }
      const newEntry: DispatchedReportItem = {
        id: res.savedReportId || Date.now(),
        reportCode: `TT-RPT-${res.savedReportId || Date.now()}`,
        status: 'ISSUED',
        title: docTitle,
        summary: toastMessage,
        contentHtml: currentHtml,
        authorName: user?.fullName || 'Điều hành',
        authorRole: user?.roleName || '',
        createdAt: new Date().toISOString(),
      };
      setArchivedReports((prev) => [newEntry, ...prev]);
      setDispatchToast(toastMessage);
      setPreviewOpen(false);
    } catch (err) {
      setDispatchError(
        err instanceof Error ? err.message : 'Không thể phát hành báo cáo. Vui lòng thử lại.',
      );
    } finally {
      setDispatching(false);
    }
  };

  return (
    <div className="space-y-4 text-sm">
      {dispatchError && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center justify-between">
          <span>{dispatchError}</span>
          <button
            type="button"
            onClick={() => setDispatchError(null)}
            className="font-bold hover:underline"
          >
            Đóng
          </button>
        </div>
      )}

      {dispatchToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md p-4 rounded-2xl bg-slate-900 text-white border border-slate-700 shadow-2xl flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 grid place-items-center shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">{dispatchToast}</p>
              <div className="mt-1.5 flex items-center gap-3">
                <Link
                  href="/notifications"
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                >
                  <span>Xem trong Thông báo</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDispatchToast(null)}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Khối phát hành & xuất văn bản */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Phát hành báo cáo nội bộ</h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {scopeSiteLabel} · {periodStart} → {periodEnd}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={savingDraft}
              onClick={() => void handleSaveDraft()}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition"
            >
              <FileText className="w-3.5 h-3.5 text-[#1E3A8A]" />
              <span>{savingDraft ? 'Đang lưu...' : 'Lưu nháp'}</span>
            </button>
            <button
              type="button"
              disabled={exportingDocx}
              onClick={() => void handleExportWordDoc()}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" />
              <span>{exportingDocx ? 'Đang xuất Word...' : 'Tải Word (.docx)'}</span>
            </button>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5 text-blue-700" />
              <span>Xem bản in</span>
            </button>
            <button
              type="button"
              disabled={dispatching}
              onClick={handleDispatchReport}
              className="h-9 px-3.5 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{dispatching ? 'Đang gửi...' : 'Phát hành'}</span>
            </button>
          </div>
        </div>

        {isDirectorOrAdmin && (
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-5 font-semibold text-slate-800">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dispatchScope === 'BROADCAST_ALL'}
                  onChange={() => setDispatchScope('BROADCAST_ALL')}
                />
                <span>Toàn công ty</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={dispatchScope === 'CUSTOM_DEPARTMENTS'}
                  onChange={() => setDispatchScope('CUSTOM_DEPARTMENTS')}
                />
                <span>Chọn phòng ban nhận</span>
              </label>
            </div>

            {dispatchScope === 'CUSTOM_DEPARTMENTS' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {DEPARTMENTS.map((dept) => {
                  const checked = selectedDepts.includes(dept.id);
                  return (
                    <label
                      key={dept.id}
                      className={`p-2 rounded-lg border cursor-pointer flex items-center gap-2 font-medium transition ${
                        checked
                          ? 'bg-blue-50 border-blue-400 text-[#1E3A8A]'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleDepartment(dept.id)}
                      />
                      <span>{dept.label}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Báo cáo đã lưu & phát hành */}
      {archivedReports.length > 0 && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <History className="w-4 h-4 text-[#1E3A8A]" />
              <span>Báo cáo đã lưu &amp; phát hành ({archivedReports.length})</span>
            </div>
            <span className="text-slate-500">Chọn để mở lại nội dung</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {archivedReports.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => handleLoadArchivedReport(item)}
                className={`shrink-0 text-left p-2.5 rounded-xl border transition max-w-xs ${
                  activeArchivedId === item.id
                    ? 'bg-blue-50 border-blue-400 text-[#1E3A8A]'
                    : 'bg-slate-50/80 border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold text-blue-700">
                    {item.reportCode}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums">
                    {new Date(item.createdAt).toLocaleString('vi-VN')}
                  </span>
                </div>
                <p className="font-semibold text-xs text-slate-900 truncate mt-0.5">{item.title}</p>
                <p className="text-[11px] text-slate-500 truncate">Người lập: {item.authorName}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thanh công cụ soạn thảo */}
      <div className="sticky top-2 z-20 max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => applyCommand('formatBlock', 'H2')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Tiêu đề mục lớn"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('formatBlock', 'H3')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Tiêu đề mục con"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <span className="h-4 w-px bg-slate-200 mx-0.5" />
          <button
            type="button"
            onClick={() => applyCommand('bold')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="In đậm"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('italic')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="In nghiêng"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('underline')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Gạch chân"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => applyCommand('insertUnorderedList')}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-700"
            title="Danh sách"
          >
            <List className="w-4 h-4" />
          </button>
          <span className="h-4 w-px bg-slate-200 mx-0.5" />
          <button
            type="button"
            onClick={handleReloadScopedMetrics}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold inline-flex items-center gap-1"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Nạp số liệu kỳ này</span>
          </button>
          <button
            type="button"
            onClick={insertKpiTableBlock}
            className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-[#1E3A8A] font-semibold inline-flex items-center gap-1"
          >
            <Table className="w-3.5 h-3.5" />
            <span>Chèn bảng chỉ số</span>
          </button>
          <button
            type="button"
            onClick={insertSignatureBlock}
            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold inline-flex items-center gap-1"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Chèn chữ ký</span>
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.max(85, s - 10))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="Thu nhỏ cỡ chữ"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-[11px] font-bold text-slate-600 w-10 text-center tabular-nums">
            {fontScale}%
          </span>
          <button
            type="button"
            onClick={() => setFontScale((s) => Math.min(135, s + 10))}
            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="Phóng to cỡ chữ"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="ml-1 p-1.5 rounded-lg hover:bg-slate-100 text-slate-600"
            title="In A4"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Trang A4 */}
      <div className="bg-slate-200/70 py-6 px-2 sm:px-6 rounded-2xl overflow-x-auto">
        <div
          style={{ fontSize: `${fontScale}%` }}
          className="max-w-4xl mx-auto bg-white shadow-lg min-h-[842px] p-6 sm:p-10 md:p-12 border border-slate-200 rounded-sm text-slate-800"
        >
          <div className="pb-4 mb-5 border-b-2 border-[#1E3A8A] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#1E3A8A] text-white font-black text-xs grid place-items-center">
                TT
              </div>
              <div>
                <p className="font-bold text-xs uppercase tracking-wider text-[#1E3A8A]">
                  CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG
                </p>
                <p className="text-[11px] text-slate-500">
                  Mã văn bản: TT-RPT-{getVnYmdDate()} · {scopeSiteLabel}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right text-[11px] text-slate-500">
              <p>
                TP. Hồ Chí Minh, ngày{' '}
                {new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
                  new Date(),
                )}
              </p>
              <p className="font-semibold text-slate-700">Người lập: {user?.fullName}</p>
            </div>
          </div>

          <input
            type="text"
            value={docTitle}
            onChange={(e) => {
              isDirtyDraftRef.current = true;
              setDocTitle(e.target.value);
            }}
            aria-label="Tiêu đề báo cáo"
            className="w-full font-display font-extrabold text-lg sm:text-xl text-center text-[#1E3A8A] mb-5 pb-2 border-b border-dashed border-slate-200 focus:border-[#2563EB] outline-none"
          />

          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => {
              isDirtyDraftRef.current = true;
              setDocHtml((e.currentTarget as HTMLDivElement).innerHTML);
            }}
            className="prose prose-slate max-w-none min-h-[540px] focus:outline-none leading-relaxed text-sm space-y-3"
          />
        </div>
      </div>

      {/* Xem trước bản in A4 (Native <dialog> modal) */}
      {previewOpen && (
        <dialog
          open
          ref={(el) => {
            if (el && typeof el.showModal === 'function' && !el.open) {
              try {
                el.showModal();
              } catch {
                // fallback if already open
              }
            }
          }}
          onCancel={(e) => {
            e.preventDefault();
            setPreviewOpen(false);
          }}
          aria-label="Xem trước bản in báo cáo"
          className="fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <FileText className="w-4 h-4 text-[#2563EB]" />
                <span>Xem trước bản in A4</span>
              </div>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                aria-label="Đóng xem trước"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-slate-100">
              <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 shadow-lg border border-slate-200">
                <h1 className="font-display font-extrabold text-lg text-center text-[#1E3A8A] mb-6">
                  {docTitle}
                </h1>
                <SafeHtmlRenderer
                  className="prose prose-slate max-w-none text-sm leading-relaxed space-y-3"
                  html={sanitizeReportHtml(docHtml)}
                />
              </div>
            </div>

            <div className="px-5 py-3 bg-white border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="h-9 px-3.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={dispatching}
                onClick={handleDispatchReport}
                className="h-9 px-4 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{dispatching ? 'Đang gửi...' : 'Xác nhận & Phát hành'}</span>
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  );
}
