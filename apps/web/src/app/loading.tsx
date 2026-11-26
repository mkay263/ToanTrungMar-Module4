import React from 'react';

export default function RootLoading() {
  return (
    <main className="min-h-screen bg-[#F5F7FC] flex flex-col items-center justify-center p-6 gap-4">
      <progress aria-label="Đang tải hệ thống Toàn Trung CRM" className="loading-spinner" />
      <p className="text-sm font-medium text-slate-600">Đang tải không gian làm việc Toàn Trung…</p>
    </main>
  );
}
