'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { apiRequest } from '@/core/http/client';
import { subscribeDataSync } from '@/core/http/data-sync-bus';
import { useSession } from '@/core/session/SessionContext';

interface SharedFileItem {
  fileName: string;
  sizeBytes: number;
  updatedAt: string;
  uploadedByName: string;
  uploadedByRole: string;
  note: string;
  ext: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function SharedTeamFilesPanel() {
  const { user } = useSession();
  const [files, setFiles] = useState<SharedFileItem[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<{ files: SharedFileItem[]; canManage: boolean }>(
        '/api/v1/reports/shared-files',
        { skipCache: true },
      );
      setFiles(res.files || []);
      setCanManage(Boolean(res.canManage));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải danh sách tệp dùng chung.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFiles();
    const unsub = subscribeDataSync(['reports'], () => {
      void loadFiles();
    });
    return () => unsub();
  }, [loadFiles]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setStatusMsg(null);
    setErrorMsg(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (noteInput.trim()) formData.append('note', noteInput.trim());

      const res = await fetch('/api/v1/reports/shared-files', {
        method: 'POST',
        credentials: 'include',
        headers: user?.csrfToken ? { 'x-csrf-token': user.csrfToken } : undefined,
        body: formData,
      });
      const json = (await res.json()) as {
        ok?: boolean;
        data?: { message?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.ok) {
        throw new Error(json.error?.message || 'Tải tệp lên thất bại.');
      }
      setStatusMsg(json.data?.message || `Đã cập nhật tệp "${file.name}" cho toàn đội ngũ.`);
      setNoteInput('');
      await loadFiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải tệp lên.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (fileName: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      await apiRequest(`/api/v1/reports/shared-files?file=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
        csrfToken: user?.csrfToken,
      });
      setStatusMsg(`Đã xóa tệp "${fileName}" khỏi kho chia sẻ.`);
      await loadFiles();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa tệp.');
    }
  };

  const visibleFiles = files.filter((f) => {
    if (!searchText.trim()) return true;
    const q = searchText.trim().toLowerCase();
    return (
      f.fileName.toLowerCase().includes(q) ||
      (f.note || '').toLowerCase().includes(q) ||
      f.uploadedByName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      {/* Thông báo đồng bộ dùng chung — không yêu cầu từng thành viên đăng nhập Gmail */}
      <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/90 to-indigo-50/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0B1D48] text-white grid place-items-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#0B1D48]">
              Kho Dữ Liệu &amp; Báo Cáo Dùng Chung Toàn Đội Ngũ
            </h3>
            <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
              Mọi tệp báo cáo (Word, Excel, PDF) và dữ liệu GA4 / Google Ads / Gmail Lead đã được đồng bộ 1 lần tại máy chủ chung.{' '}
              <strong>Toàn bộ thành viên chỉ cần đăng nhập CRM là xem &amp; kiểm tra ngay số liệu mới nhất, không cần đăng nhập Gmail cá nhân.</strong>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadFiles()}
          className="h-8 px-3 rounded-lg border border-blue-200 bg-white hover:bg-blue-50 text-[#0B1D48] text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Làm mới</span>
        </button>
      </div>

      {/* Khu vực tải lên cho Admin / BOD / Trưởng phòng */}
      {canManage && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-2.5">
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Ghi chú phiên bản / mô tả tệp (VD: Báo cáo số liệu Ads tháng 11 bản chốt)..."
              className="flex-1 h-9 px-3 rounded-xl border border-slate-300 text-xs text-slate-800 focus:border-[#1E3A8A] focus:outline-none"
            />
            <label className="h-9 px-4 rounded-xl bg-[#0B1D48] hover:bg-[#1E3A8A] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition">
              <Upload className="w-3.5 h-3.5" />
              <span>{uploading ? 'Đang tải lên...' : 'Tải lên / Cập nhật tệp cho cả nhóm'}</span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp"
                disabled={uploading}
                onChange={(e) => void handleUpload(e)}
                className="sr-only"
              />
            </label>
          </div>
          <p className="text-[11px] text-slate-500">
            Hỗ trợ: <code>.xlsx</code>, <code>.csv</code>, <code>.docx</code>, <code>.pdf</code>, ảnh đối chiếu (tối đa 25 MB). Tệp trùng tên sẽ tự động cập nhật bản mới nhất cho mọi thành viên.
          </p>
        </div>
      )}

      {statusMsg && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800 font-semibold">
          {errorMsg}
        </div>
      )}

      {/* Bảng danh sách tệp dùng chung */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-[#1E3A8A]" />
            <h4 className="text-xs font-bold text-slate-900">
              Danh sách tệp dữ liệu &amp; báo cáo đang chia sẻ ({visibleFiles.length})
            </h4>
          </div>
          <input
            type="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm theo tên tệp hoặc ghi chú..."
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-xs w-60 focus:border-[#1E3A8A] focus:outline-none"
          />
        </div>

        <div tabIndex={0} role="region" aria-label="Kho tài liệu dùng chung" className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-slate-100/80 text-slate-600 border-b border-slate-200">
              <tr>
                <th scope="col" className="py-2.5 px-4 font-semibold">Tên tệp tài liệu / dữ liệu</th>
                <th scope="col" className="py-2.5 px-3 font-semibold">Ghi chú cập nhật</th>
                <th scope="col" className="py-2.5 px-3 font-semibold">Người đăng</th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-right">Dung lượng</th>
                <th scope="col" className="py-2.5 px-3 font-semibold text-right">Cập nhật lúc</th>
                <th scope="col" className="py-2.5 px-4 font-semibold text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Đang tải danh sách tệp dùng chung...
                  </td>
                </tr>
              ) : visibleFiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-500">
                    Chưa có tệp báo cáo nào trong kho dùng chung.
                  </td>
                </tr>
              ) : (
                visibleFiles.map((f) => {
                  const isExcel = f.ext === 'xlsx' || f.ext === 'xls' || f.ext === 'csv';
                  return (
                    <tr key={f.fileName} className="hover:bg-blue-50/30">
                      <td className="py-2.5 px-4 font-semibold text-slate-900">
                        <div className="flex items-center gap-2">
                          {isExcel ? (
                            <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <FileText className="w-4 h-4 text-[#1E3A8A] shrink-0" />
                          )}
                          <span className="break-all">{f.fileName}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[260px]">
                        {f.note || <span className="text-slate-400">Tài liệu chia sẻ nội bộ</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap">
                        {f.uploadedByName}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600 tabular-nums whitespace-nowrap">
                        {formatFileSize(f.sizeBytes)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500 tabular-nums whitespace-nowrap">
                        {new Date(f.updatedAt).toLocaleString('vi-VN')}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <a
                            href={`/api/v1/reports/shared-files?file=${encodeURIComponent(f.fileName)}`}
                            className="h-7 px-2.5 rounded-lg bg-[#0B1D48] hover:bg-[#1E3A8A] text-white font-semibold inline-flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Tải về</span>
                          </a>
                          {canManage && (
                            <button
                              type="button"
                              onClick={() => void handleDelete(f.fileName)}
                              title="Xóa tệp khỏi kho dùng chung"
                              className="h-7 w-7 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 grid place-items-center"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
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
  );
}
