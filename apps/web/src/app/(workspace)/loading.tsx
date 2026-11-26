import React from 'react';

export default function WorkspaceLoading() {
  return (
    <div className="min-h-[60vh] w-full flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <progress aria-label="Đang tải dữ liệu phân hệ" className="loading-spinner loading-spinner-sm" />
        <span className="text-sm font-semibold text-slate-600">Đang tải dữ liệu phân hệ…</span>
      </div>

      <div aria-hidden="true" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div
            key={idx}
            className="h-28 rounded-2xl bg-white border border-slate-200/80 p-4 flex flex-col justify-between"
          >
            <div className="h-3.5 w-24 rounded bg-slate-200/80 animate-pulse" />
            <div className="h-7 w-32 rounded bg-slate-200/70 animate-pulse" />
            <div className="h-3 w-20 rounded bg-slate-100 animate-pulse" />
          </div>
        ))}
      </div>

      <div
        aria-hidden="true"
        className="flex-1 min-h-[260px] rounded-2xl bg-white border border-slate-200/80 p-5 space-y-3"
      >
        <div className="h-4 w-48 rounded bg-slate-200/80 animate-pulse" />
        <div className="h-10 w-full rounded-xl bg-slate-100 animate-pulse" />
        <div className="h-10 w-full rounded-xl bg-slate-100/80 animate-pulse" />
        <div className="h-10 w-full rounded-xl bg-slate-100/60 animate-pulse" />
      </div>
    </div>
  );
}
