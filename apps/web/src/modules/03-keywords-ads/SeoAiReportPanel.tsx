'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest } from '@/core/http/client';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  FileSpreadsheet,
  FileText,
  Heading2,
  History,
  Italic,
  List,
  ListOrdered,
  Printer,
  Redo2,
  RotateCcw,
  Save,
  Sparkles,
  Underline,
  Undo2,
} from 'lucide-react';

interface SeoAiReportRecord {
  id: string;
  website: string;
  periodDays: number;
  snapshot: {
    website: string;
    sourcePlatform: string;
    generatedAt: string;
    current: {
      startDate: string;
      endDate: string;
      daysWithData: number;
      totalClicks: number;
      totalImpressions: number;
      overallCtrPct: number;
    };
    previous: {
      startDate: string;
      endDate: string;
      daysWithData: number;
      totalClicks: number;
      totalImpressions: number;
      overallCtrPct: number;
    };
    comparison: {
      clicksDeltaLabel: string;
      impressionsDeltaLabel: string;
      ctrDeltaPctPoints: number;
    };
    dataCompleteness: {
      expectedDays: number;
      currentDaysWithData: number;
      previousDaysWithData: number;
      warnings: string[];
    };
    leadsFromWebsiteCount: number;
  };
  aiOriginalContent: string;
  editedContent: string;
  modelUsed: string;
  generationMode?: 'LIVE_AI' | 'DETERMINISTIC_FALLBACK';
  fallbackReason?: string | null;
  validationResult?: {
    valid: boolean;
    violations: string[];
  };
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export function SeoAiReportPanel({
  csrfToken,
  initialWebsite,
  initialPeriodDays,
}: {
  csrfToken?: string;
  initialWebsite?: string;
  initialPeriodDays?: number;
}) {
  const [website, setWebsite] = useState(initialWebsite || 'all');
  const [periodDays, setPeriodDays] = useState(initialPeriodDays || 30);

  useEffect(() => {
    if (initialWebsite) setWebsite(initialWebsite);
  }, [initialWebsite]);

  useEffect(() => {
    if (initialPeriodDays) setPeriodDays(initialPeriodDays);
  }, [initialPeriodDays]);
  const [reports, setReports] = useState<SeoAiReportRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [editorFont, setEditorFont] = useState<'Segoe UI' | 'Times New Roman' | 'Arial'>('Segoe UI');
  const [editorFontSize, setEditorFontSize] = useState<'13px' | '14px' | '15px'>('14px');
  const [editorSyncKey, setEditorSyncKey] = useState(0);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const textToWordHtml = useCallback((text: string, snap?: SeoAiReportRecord['snapshot']) => {
    const lines = (text || '').split('\n');
    const bodyHtml = lines
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '<div style="height:6px;"></div>';
        const escaped = trimmed
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        if (trimmed.startsWith('BÁO CÁO ')) {
          return `<div style="border-bottom:2px solid #0B1D48;padding-bottom:10px;margin-bottom:12px;text-align:center;">
            <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;color:#475569;text-transform:uppercase;margin-bottom:4px;">CÔNG TY CỔ PHẦN ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG</div>
            <h1 style="font-size:17px;font-weight:800;color:#0B1D48;margin:0;">${escaped}</h1>
          </div>`;
        }
        if (trimmed.startsWith('Kỳ báo cáo:')) {
          return `<p style="text-align:center;font-size:12px;color:#475569;font-style:italic;margin:0 0 14px 0;">${escaped}</p>`;
        }
        if (/^(I|II|III|IV|V)\.\s/.test(trimmed) || /^#+\s/.test(trimmed)) {
          return `<h2 style="font-size:14px;font-weight:800;color:#0B1D48;border-bottom:1px solid #E2E8F0;padding-bottom:3px;margin:16px 0 8px 0;">${escaped.replace(/^#+\s*/, '')}</h2>`;
        }
        if (/^[0-9]+\.\s/.test(trimmed)) {
          return `<p style="font-weight:600;color:#0F172A;margin:6px 0 3px 0;line-height:1.65;">${escaped}</p>`;
        }
        if (trimmed.startsWith('Kính gửi:') || trimmed.startsWith('Trân trọng')) {
          return `<p style="font-weight:700;color:#0F172A;margin:10px 0 6px 0;">${escaped}</p>`;
        }
        return `<p style="margin:4px 0;line-height:1.7;color:#1E293B;">${escaped}</p>`;
      })
      .join('');

    const summaryTable = snap
      ? `<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:12.5px;">
          <thead>
            <tr style="background:#F1F5F9;color:#0B1D48;">
              <th style="border:1px solid #CBD5E1;padding:7px 10px;text-align:left;">Chỉ số đo lường</th>
              <th style="border:1px solid #CBD5E1;padding:7px 10px;text-align:right;">Kỳ hiện tại</th>
              <th style="border:1px solid #CBD5E1;padding:7px 10px;text-align:right;">Kỳ trước</th>
              <th style="border:1px solid #CBD5E1;padding:7px 10px;text-align:right;">Biến động</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;font-weight:600;">Lượt nhấp tìm kiếm (Clicks)</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:700;">${snap.current.totalClicks.toLocaleString('vi-VN')}</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;">${snap.previous.totalClicks.toLocaleString('vi-VN')}</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:600;">${snap.comparison.clicksDeltaLabel}</td>
            </tr>
            <tr>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;font-weight:600;">Lượt hiển thị (Impressions)</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:700;">${snap.current.totalImpressions.toLocaleString('vi-VN')}</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;">${snap.previous.totalImpressions.toLocaleString('vi-VN')}</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:600;">${snap.comparison.impressionsDeltaLabel}</td>
            </tr>
            <tr>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;font-weight:600;">Tỷ lệ nhấp trung bình (CTR)</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:700;">${snap.current.overallCtrPct}%</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;">${snap.previous.overallCtrPct}%</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:600;">${snap.comparison.ctrDeltaPctPoints >= 0 ? '+' : ''}${snap.comparison.ctrDeltaPctPoints} điểm %</td>
            </tr>
            <tr>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;font-weight:600;">Lead hợp lệ từ website</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;font-weight:700;color:#059669;">${snap.leadsFromWebsiteCount} Lead</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;">—</td>
              <td style="border:1px solid #CBD5E1;padding:6px 10px;text-align:right;">Trong kỳ</td>
            </tr>
          </tbody>
        </table>`
      : '';

    return bodyHtml.replace(
      'I. TỔNG QUAN KẾT QUẢ ĐẠT ĐƯỢC</h2>',
      `I. TỔNG QUAN KẾT QUẢ ĐẠT ĐƯỢC</h2>${summaryTable}`,
    );
  }, []);

  useEffect(() => {
    const rec = reports.find((r) => r.id === selectedId);
    if (editorRef.current) {
      editorRef.current.innerHTML = textToWordHtml(draftContent, rec?.snapshot);
    }
  }, [selectedId, editorSyncKey, textToWordHtml]);

  const execWordCmd = (cmd: string, value?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(cmd, false, value);
    setDraftContent(editorRef.current.innerText || '');
  };

  const cleanContent = (r: SeoAiReportRecord) => {
    const raw = (r.editedContent || '').trim();
    if (!raw || raw.startsWith('undefined')) {
      return r.aiOriginalContent || '';
    }
    return r.editedContent;
  };

  const loadReports = useCallback(async () => {
    try {
      const res = await apiRequest<{ reports: SeoAiReportRecord[] }>('/api/v1/ads/seo-reports', {
        skipCache: true,
      });
      const list = (res.reports || []).filter(
        (r) => !(r.editedContent || '').includes('Ghi chú nghiệm thu R02'),
      );
      setReports(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
        setDraftContent(cleanContent(list[0]));
      }
    } catch {
      // Ignore silent load errors
    }
  }, [selectedId]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const activeReport = reports.find((r) => r.id === selectedId) || null;

  const handleGenerate = async () => {
    if (generating) return;
    setGenerating(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ report: SeoAiReportRecord }>('/api/v1/ads/seo-reports', {
        method: 'POST',
        csrfToken,
        body: { website, periodDays },
      });
      setReports((prev) => [res.report, ...prev]);
      setSelectedId(res.report.id);
      setDraftContent(cleanContent(res.report));
      setStatusMsg(`Đã tạo báo cáo SEO AI (${res.report.website === 'all' ? 'Tất cả website' : res.report.website}, ${res.report.periodDays} ngày).`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tạo báo cáo SEO AI.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!activeReport || saving) return;
    setSaving(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiRequest<{ report: SeoAiReportRecord }>('/api/v1/ads/seo-reports', {
        method: 'PATCH',
        csrfToken,
        body: { reportId: activeReport.id, editedContent: draftContent },
      });
      setReports((prev) => prev.map((r) => (r.id === res.report.id ? res.report : r)));
      setStatusMsg('Đã lưu phiên bản chỉnh sửa (bản AI gốc và Snapshot vẫn được giữ nguyên).');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu chỉnh sửa.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-bold text-ink flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#1E3A8A]" />
            Viết Báo cáo Phân tích SEO bằng AI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hệ thống tổng hợp toàn bộ chỉ số tìm kiếm &amp; so sánh 2 kỳ trước khi tạo báo cáo chi tiết.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="all">Tất cả website</option>
            <option value="toantrung.com.vn">toantrung.com.vn</option>
            <option value="bangled.vn">bangled.vn</option>
            <option value="manhinhled.net.vn">manhinhled.net.vn</option>
          </select>

          <select
            value={periodDays}
            onChange={(e) => setPeriodDays(Number(e.target.value))}
            className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value={7}>7 ngày vs 7 ngày trước</option>
            <option value={14}>14 ngày vs 14 ngày trước</option>
            <option value={30}>30 ngày vs 30 ngày trước</option>
            <option value={60}>60 ngày vs 60 ngày trước</option>
          </select>

          <button
            type="button"
            disabled={generating}
            onClick={() => void handleGenerate()}
            className="h-9 px-4 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold hover:bg-[#172D6E] disabled:opacity-50 transition inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generating ? 'Đang tính Snapshot & Phân tích...' : 'Tạo Báo cáo SEO AI'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/70 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <History className="w-3.5 h-3.5" />
            Lịch sử Báo cáo ({reports.length})
          </div>
          {reports.length === 0 ? (
            <p className="text-xs text-slate-500">Chưa có báo cáo SEO AI nào được lưu.</p>
          ) : (
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto">
              {reports.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(r.id);
                    setDraftContent(r.editedContent);
                    setStatusMsg(null);
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition ${
                    r.id === selectedId
                      ? 'bg-white border-[#1E3A8A] shadow-2xs'
                      : 'bg-white/70 border-slate-200 hover:bg-white'
                  }`}
                >
                  <div className="font-bold text-slate-900 truncate">{r.website}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.periodDays} ngày · {new Date(r.createdAt).toLocaleString('vi-VN')}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-3">
          {activeReport ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Clicks (Kỳ này / Trước)</span>
                  <strong className="text-slate-900 text-sm">
                    {activeReport.snapshot.current.totalClicks} / {activeReport.snapshot.previous.totalClicks}
                  </strong>
                  <span className="block text-[11px] text-[#1E3A8A] font-semibold">
                    {activeReport.snapshot.comparison.clicksDeltaLabel}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Impressions</span>
                  <strong className="text-slate-900 text-sm">
                    {activeReport.snapshot.current.totalImpressions}
                  </strong>
                  <span className="block text-[11px] text-slate-600">
                    {activeReport.snapshot.comparison.impressionsDeltaLabel}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">CTR tổng hợp</span>
                  <strong className="text-slate-900 text-sm">
                    {activeReport.snapshot.current.overallCtrPct}%
                  </strong>
                  <span className="block text-[11px] text-slate-600">
                    Kỳ trước: {activeReport.snapshot.previous.overallCtrPct}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                  <span className="text-slate-500 block">Lead từ Website</span>
                  <strong className="text-emerald-700 text-sm">
                    {activeReport.snapshot.leadsFromWebsiteCount} Lead
                  </strong>
                  <span className="block text-[11px] text-slate-500">
                    {activeReport.generationMode === 'LIVE_AI'
                      ? `AI Thật (${activeReport.modelUsed})`
                      : 'Tổng hợp tự động từ số liệu thực tế'}
                  </span>
                </div>
              </div>

              {activeReport.validationResult && !activeReport.validationResult.valid && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-0.5">
                  <div className="font-bold">Cảnh báo đối chứng số liệu với Snapshot:</div>
                  {activeReport.validationResult.violations.map((v, i) => (
                    <div key={i}>• {v}</div>
                  ))}
                </div>
              )}

              {activeReport.snapshot.dataCompleteness.warnings.length > 0 && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-0.5">
                  {activeReport.snapshot.dataCompleteness.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Giao diện soạn thảo giống Microsoft Word */}
              <div className="rounded-2xl border border-slate-200 bg-slate-100/80 overflow-hidden">
                <div className="flex flex-wrap items-center gap-1 bg-white border-b border-slate-200 px-2.5 py-1.5 text-slate-700">
                  <select
                    value={editorFont}
                    onChange={(e) => setEditorFont(e.target.value as typeof editorFont)}
                    className="h-7 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-700"
                    title="Phông chữ"
                  >
                    <option value="Segoe UI">Segoe UI</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Arial">Arial</option>
                  </select>
                  <select
                    value={editorFontSize}
                    onChange={(e) => setEditorFontSize(e.target.value as typeof editorFontSize)}
                    className="h-7 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-700"
                    title="Cỡ chữ"
                  >
                    <option value="13px">13</option>
                    <option value="14px">14</option>
                    <option value="15px">15</option>
                  </select>
                  <span className="h-4 w-px bg-slate-200 mx-1" />
                  <button type="button" onClick={() => execWordCmd('undo')} title="Hoàn tác" className="p-1.5 rounded hover:bg-slate-100">
                    <Undo2 className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('redo')} title="Làm lại" className="p-1.5 rounded hover:bg-slate-100">
                    <Redo2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="h-4 w-px bg-slate-200 mx-1" />
                  <button type="button" onClick={() => execWordCmd('bold')} title="In đậm (Ctrl+B)" className="p-1.5 rounded hover:bg-slate-100">
                    <Bold className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('italic')} title="In nghiêng (Ctrl+I)" className="p-1.5 rounded hover:bg-slate-100">
                    <Italic className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('underline')} title="Gạch chân (Ctrl+U)" className="p-1.5 rounded hover:bg-slate-100">
                    <Underline className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('formatBlock', 'H2')} title="Tiêu đề mục" className="p-1.5 rounded hover:bg-slate-100">
                    <Heading2 className="w-3.5 h-3.5" />
                  </button>
                  <span className="h-4 w-px bg-slate-200 mx-1" />
                  <button type="button" onClick={() => execWordCmd('insertUnorderedList')} title="Danh sách chấm" className="p-1.5 rounded hover:bg-slate-100">
                    <List className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('insertOrderedList')} title="Danh sách số" className="p-1.5 rounded hover:bg-slate-100">
                    <ListOrdered className="w-3.5 h-3.5" />
                  </button>
                  <span className="h-4 w-px bg-slate-200 mx-1" />
                  <button type="button" onClick={() => execWordCmd('justifyLeft')} title="Căn trái" className="p-1.5 rounded hover:bg-slate-100">
                    <AlignLeft className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('justifyCenter')} title="Căn giữa" className="p-1.5 rounded hover:bg-slate-100">
                    <AlignCenter className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => execWordCmd('justifyRight')} title="Căn phải" className="p-1.5 rounded hover:bg-slate-100">
                    <AlignRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="h-4 w-px bg-slate-200 mx-1" />
                  <button type="button" onClick={() => window.print()} title="In / Xuất PDF" className="p-1.5 rounded hover:bg-slate-100 inline-flex items-center gap-1 text-[11px] font-semibold">
                    <Printer className="w-3.5 h-3.5" />
                    <span>In</span>
                  </button>
                </div>

                <div className="p-5 max-h-[520px] overflow-y-auto bg-slate-200/60">
                  <div
                    ref={editorRef}
                    contentEditable
                    suppressContentEditableWarning
                    style={{ fontFamily: editorFont, fontSize: editorFontSize }}
                    onInput={(e) => setDraftContent(e.currentTarget.innerText || '')}
                    className="mx-auto max-w-[800px] min-h-[340px] bg-white px-10 py-8 rounded shadow-md border border-slate-300/80 text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSaveEdit()}
                    className="h-9 px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Đang lưu...' : 'Lưu chỉnh sửa'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftContent(activeReport.aiOriginalContent)}
                    className="h-9 px-3 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Khôi phục bản AI gốc
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/v1/ads/seo-reports/${encodeURIComponent(activeReport.id)}/export?format=docx`}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <FileText className="w-3.5 h-3.5 text-blue-700" />
                    Xuất Word (.docx)
                  </a>
                  <a
                    href={`/api/v1/ads/seo-reports/${encodeURIComponent(activeReport.id)}/export?format=xlsx`}
                    className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                    Xuất Excel (.xlsx)
                  </a>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6 rounded-xl border border-dashed border-slate-200 text-center text-xs text-slate-500">
              Chọn Website và Kỳ so sánh rồi bấm <strong>Tạo Báo cáo SEO AI</strong> để tạo snapshot và phân tích có dẫn chứng.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

