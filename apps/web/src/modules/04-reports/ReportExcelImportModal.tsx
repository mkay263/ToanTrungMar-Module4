'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type {
  M04ExcelImportBatchDto,
  M04ExcelImportPreviewDto,
  M04ReportGranularity,
} from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';

interface ReportExcelImportModalProps {
  open: boolean;
  onClose: () => void;
  csrfToken?: string;
  websiteId: string;
  preset: string;
  fromDate?: string;
  toDate?: string;
  granularity: M04ReportGranularity;
  onBatchesChanged?: (count: number) => void;
}

export function ReportExcelImportModal({
  open,
  onClose,
  csrfToken,
  websiteId,
  preset,
  fromDate,
  toDate,
  granularity,
  onBatchesChanged,
}: ReportExcelImportModalProps) {
  const titleId = useId();
  const previewTableCaptionId = useId();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<M04ExcelImportPreviewDto | null>(null);
  const [batches, setBatches] = useState<M04ExcelImportBatchDto[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<M04ExcelImportBatchDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await apiRequest<{ batches: M04ExcelImportBatchDto[] }>('/api/v1/reports/import', {
        skipCache: true,
      });
      const list = res.batches || [];
      setBatches(list);
      onBatchesChanged?.(list.length);
    } catch {
      // Ignore silent load errors when modal is closed
    }
  }, [onBatchesChanged]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      void loadBatches();
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open, loadBatches]);

  // Safari fallback for closedby="any" (requires both pointerdown and pointerup outside dialog rect)
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || typeof HTMLDialogElement === 'undefined') return;
    if ('closedBy' in HTMLDialogElement.prototype) return;

    const isOutside = (e: PointerEvent) => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let pressedOutside = false;
    const onDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) dialog.close();
      pressedOutside = false;
    };
    dialog.addEventListener('pointerdown', onDown);
    dialog.addEventListener('pointerup', onUp);
    return () => {
      dialog.removeEventListener('pointerdown', onDown);
      dialog.removeEventListener('pointerup', onUp);
    };
  }, []);

  const handleDownloadTemplate = () => {
    const params = new URLSearchParams({
      mode: 'template',
      websiteId: websiteId || 'all',
      preset: fromDate && toDate ? 'custom' : preset || '30d',
      granularity,
    });
    if (fromDate) params.set('fromDate', fromDate);
    if (toDate) params.set('toDate', toDate);
    window.open(`/api/v1/reports/export?${params.toString()}`, '_blank');
  };

  const runUpload = async (file: File, mode: 'preview' | 'commit') => {
    setBusy(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('mode', mode);
      fd.append('granularity', granularity);
      fd.append('websiteId', websiteId || 'all');
      fd.append('preset', fromDate && toDate ? 'CUSTOM' : preset || '30D');
      if (fromDate) fd.append('from', fromDate);
      if (toDate) fd.append('to', toDate);

      const headers: Record<string, string> = {};
      if (csrfToken) headers['x-csrf-token'] = csrfToken;

      const resp = await fetch('/api/v1/reports/import', {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: fd,
      });
      const json = (await resp.json()) as {
        ok?: boolean;
        data?: { preview?: M04ExcelImportPreviewDto; batch?: M04ExcelImportBatchDto };
        error?: { message?: string };
      };
      if (!resp.ok || !json.ok || !json.data) {
        throw new Error(json.error?.message || 'Không thể xử lý tệp Excel.');
      }

      if (mode === 'preview' && json.data.preview) {
        setPreview(json.data.preview);
        setSelectedBatch(null);
      } else if (mode === 'commit' && json.data.batch) {
        setSuccessMsg(
          `Đã lưu bản đối soát "${json.data.batch.fileName}" (${json.data.batch.rows.length} dòng hợp lệ) vào hệ thống & ghi AuditLog.`,
        );
        setSelectedBatch(json.data.batch);
        setPreview(null);
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
        await loadBatches();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi đọc/nhập tệp Excel.');
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    setSelectedFile(f);
    setSuccessMsg(null);
    setErrorMsg(null);
    if (f) {
      void runUpload(f, 'preview');
    }
  };

  const handleDeleteBatch = async (id: string) => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await apiRequest(`/api/v1/reports/import?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        csrfToken,
      });
      if (selectedBatch?.id === id) setSelectedBatch(null);
      setSuccessMsg('Đã xóa bản đối soát Excel đã lưu.');
      await loadBatches();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa bản đối soát.');
    } finally {
      setBusy(false);
    }
  };

  const rowsToDisplay = preview?.rows || selectedBatch?.rows || null;
  const warningsToDisplay = preview?.warnings || selectedBatch?.warnings || [];
  const summaryToDisplay = preview?.summary || selectedBatch?.summary || null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClose={onClose}
      {...({ closedby: 'any' } as Record<string, unknown>)}
      className="w-full max-w-5xl rounded-2xl bg-white border border-slate-200 shadow-2xl p-0 backdrop:bg-slate-900/50 backdrop:backdrop-blur-xs"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <FileSpreadsheet className="w-5 h-5" aria-hidden="true" />
          </div>
          <div>
            <h1 id={titleId} className="text-sm font-bold text-[#0F172A]">
              Import &amp; Đối chiếu Báo cáo Excel (.xlsx / .csv)
            </h1>
            <p className="text-xs text-slate-500">
              Kiểm tra hợp lệ theo đủ 25 mã sản phẩm Toàn Trung · So sánh trực tiếp với số liệu CRM DB (không ghi đè Lead gốc)
            </p>
          </div>
        </div>
        <button
          type="button"
          autoFocus
          onClick={() => dialogRef.current?.close()}
          className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 inline-flex items-center gap-1"
          aria-label="Đóng hộp thoại Import Excel"
        >
          <X className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Đóng</span>
        </button>
      </div>

      <div className="p-5 space-y-4 max-h-[78vh] overflow-y-auto text-xs">
        {/* Khu vực tải mẫu & chọn file */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/75 p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="space-y-1">
            <div className="font-bold text-slate-900">
              Bước 1: Tải file mẫu 25 sản phẩm hoặc chọn tệp <code className="font-mono">.xlsx</code> / <code className="font-mono">.csv</code> có sẵn
            </div>
            <p className="text-slate-600">
              Hệ thống tự nhận diện sheet chứa cột <code className="font-mono">ma_san_pham</code> / <code className="font-mono">Mã SP</code>, tự loại cột Doanh thu (Q08) &amp; PII, đối chiếu chênh lệch từng mặt hàng với CRM.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-800 inline-flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
              <span>Tải File Mẫu (.xlsx)</span>
            </button>

            <label className="h-9 px-4 rounded-lg bg-[#0B1D48] hover:bg-[#172D6E] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{busy ? 'Đang kiểm tra...' : 'Chọn tệp Excel / CSV'}</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.csv,.txt"
                disabled={busy}
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-red-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-emerald-900 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}

        {warningsToDisplay.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-amber-900 space-y-1">
            {warningsToDisplay.map((w, i) => (
              <div key={i} className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        {/* Xem trước / Kết quả đối chiếu */}
        {rowsToDisplay && summaryToDisplay && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-slate-500">Tổng dòng đọc</div>
                <div className="text-lg font-bold text-slate-900 tabular-nums">
                  {summaryToDisplay.totalRows}
                </div>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                <div className="text-emerald-800">Khớp 100% CRM</div>
                <div className="text-lg font-bold text-emerald-900 tabular-nums">
                  {summaryToDisplay.validRows}
                </div>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                <div className="text-amber-800">Hợp lệ · Có chênh lệch</div>
                <div className="text-lg font-bold text-amber-900 tabular-nums">
                  {summaryToDisplay.warningRows}
                </div>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
                <div className="text-rose-800">Lỗi sai mã / logic</div>
                <div className="text-lg font-bold text-rose-900 tabular-nums">
                  {summaryToDisplay.errorRows}
                </div>
              </div>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-labelledby={previewTableCaptionId}
              className="overflow-auto max-w-full max-h-[320px] rounded-xl border border-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <table className="w-full text-xs text-left tabular-nums border-separate border-spacing-0 [&_td]:border-r [&_td]:border-b [&_td]:border-slate-200/80 [&_th]:border-r [&_th]:border-b [&_th]:border-slate-200">
                <caption id={previewTableCaptionId} className="sr-only">
                  Bảng kiểm tra và đối chiếu chênh lệch từng mặt hàng giữa tệp Excel và CRM
                </caption>
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase">
                  <tr>
                    <th scope="col" className="sticky left-0 z-20 bg-slate-100 px-3 py-2">
                      Mã SP
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Mặt hàng khớp DB
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right">
                      Import Lead
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right">
                      CRM Lead
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right">
                      Chênh Lead
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right">
                      Import Chốt
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right">
                      CRM Chốt
                    </th>
                    <th scope="col" className="px-3 py-2">
                      Kết quả kiểm tra
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rowsToDisplay.map((r) => (
                    <tr key={`${r.rowNumber}-${r.rawProductCode}`} className="odd:bg-white even:bg-slate-50/40">
                      <th
                        scope="row"
                        className="sticky left-0 z-[5] bg-white px-3 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap"
                      >
                        {r.matchedProductCode || r.rawProductCode || '—'}
                      </th>
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {r.matchedProductName || r.rawProductName || '—'}
                      </td>
                      <td className="px-2.5 py-2 text-right font-bold">{r.importedLeadCount}</td>
                      <td className="px-2.5 py-2 text-right text-slate-600">{r.crmLeadCount}</td>
                      <td
                        className={`px-2.5 py-2 text-right font-bold ${
                          r.deltaLead === 0
                            ? 'text-emerald-700'
                            : r.deltaLead > 0
                              ? 'text-blue-700'
                              : 'text-amber-700'
                        }`}
                      >
                        {r.deltaLead > 0 ? `+${r.deltaLead}` : r.deltaLead}
                      </td>
                      <td className="px-2.5 py-2 text-right font-semibold">{r.importedWonCount}</td>
                      <td className="px-2.5 py-2 text-right text-slate-600">{r.crmWonCount}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                            r.status === 'valid'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : r.status === 'warning'
                                ? 'bg-amber-50 text-amber-900 border-amber-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                          }`}
                        >
                          {r.message}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {preview && selectedFile && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="text-slate-600">
                  Sẵn sàng lưu{' '}
                  <strong>{preview.summary.validRows + preview.summary.warningRows}</strong> dòng hợp lệ từ{' '}
                  <code className="font-mono">{preview.fileName}</code> (bỏ qua{' '}
                  {preview.summary.errorRows} dòng lỗi).
                </span>
                <button
                  type="button"
                  disabled={busy || preview.summary.validRows + preview.summary.warningRows === 0}
                  onClick={() => void runUpload(selectedFile, 'commit')}
                  className="h-9 px-4 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold disabled:opacity-50"
                >
                  {busy ? 'Đang lưu...' : 'Xác nhận lưu bản Đối soát Import'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Lịch sử bản đối soát đã lưu */}
        <div className="pt-3 border-t border-slate-200 space-y-2">
          <div className="font-bold text-slate-900">
            Lịch sử bản đối soát Excel đã lưu ({batches.length})
          </div>
          {batches.length === 0 ? (
            <p className="text-slate-500">Chưa có tệp Excel đối soát nào được lưu.</p>
          ) : (
            <div className="space-y-2">
              {batches.map((b) => (
                <div
                  key={b.id}
                  className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-2 ${
                    selectedBatch?.id === b.id
                      ? 'border-blue-300 bg-blue-50/50'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900">{b.fileName}</div>
                    <div className="text-slate-500">
                      Kỳ: <strong>{b.periodLabel}</strong> · {b.rows.length} dòng hợp lệ (Import{' '}
                      {b.summary.importedTotalLeads} Lead vs CRM {b.summary.crmTotalLeads} Lead) · Người tải:{' '}
                      {b.createdByName}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPreview(null);
                        setSelectedBatch(b);
                      }}
                      className="h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
                    >
                      Xem đối chiếu
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleDeleteBatch(b.id)}
                      className="h-8 px-2.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold inline-flex items-center gap-1"
                      aria-label={`Xóa bản đối soát ${b.fileName}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
