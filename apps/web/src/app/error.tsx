'use client';

import React, { useEffect } from 'react';
import { SystemUpgradeSplash } from '@/components/common/SystemUpgradeSplash';

export default function GlobalErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = error?.message || '';
    if (
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('Failed to fetch dynamically imported module')
    ) {
      const timer = window.setTimeout(() => {
        window.location.reload();
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [error]);

  return (
    <SystemUpgradeSplash
      title="Hệ thống Toàn Trung CRM vừa cập nhật phiên bản mới"
      subtitle="Máy chủ vừa hoàn tất nâng cấp giao diện và đồng bộ cấu trúc dữ liệu. Hệ thống đang tự động làm mới phiên làm việc của bạn..."
      badgeText="CẬP NHẬT PHIÊN BẢN HỆ THỐNG"
      showReloadAction={true}
      onRetry={() => {
        reset();
        if (typeof window !== 'undefined') {
          window.location.reload();
        }
      }}
    />
  );
}

