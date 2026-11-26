'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

function isChunkLoadError(err?: Error | null): boolean {
  if (!err) return false;
  return (
    err.name === 'ChunkLoadError' ||
    /Loading chunk [\w-]+ failed|ChunkLoadError|Failed to fetch dynamically imported module/i.test(
      err.message || '',
    )
  );
}

export default function WorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isChunkErr = isChunkLoadError(error);

  useEffect(() => {
    if (!isChunkErr || typeof window === 'undefined') return;
    try {
      const key = 'tt_v2_chunk_reload_at';
      const last = Number(window.sessionStorage.getItem(key) || '0');
      if (Date.now() - last > 15_000) {
        window.sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    } catch {
      window.location.reload();
    }
  }, [isChunkErr]);

  const handleRetry = () => {
    if (isChunkErr && typeof window !== 'undefined') {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center space-y-4">
        <div className="w-12 h-12 rounded-2xl bg-red-50 border border-red-200 text-red-600 grid place-items-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900">
            {isChunkErr ? 'Hệ thống vừa cập nhật phiên bản mới' : 'Phân hệ gặp sự cố tải dữ liệu'}
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {isChunkErr
              ? 'Đang tự động tải lại bản mới nhất của giao diện. Nếu trang chưa tự làm mới, bấm nút bên dưới.'
              : error?.message || 'Không thể hiển thị phân hệ lúc này. Vui lòng thử tải lại.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          className="h-9 px-4 rounded-xl bg-[#1E3A8A] hover:bg-[#2563EB] text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 shadow-xs transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>{isChunkErr ? 'Tải lại phiên bản mới' : 'Thử lại'}</span>
        </button>
      </div>
    </div>
  );
}
