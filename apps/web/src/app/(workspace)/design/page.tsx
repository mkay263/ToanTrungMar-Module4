'use client';

import React from 'react';
import dynamic from 'next/dynamic';

function DesignStudioSkeleton() {
  return (
    <div className="space-y-4 animate-pulse" aria-busy="true" aria-label="Đang tải không gian Thiết kế AI">
      <div className="h-14 rounded-[12px] bg-white border border-slate-200 px-4 flex items-center justify-between">
        <div className="h-5 w-48 rounded bg-slate-200" />
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-lg bg-slate-100" />
          <div className="h-8 w-24 rounded-lg bg-slate-100" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-3 h-[540px] rounded-[12px] bg-white border border-slate-200 p-4 space-y-3">
          <div className="h-4 w-32 rounded bg-slate-200" />
          <div className="h-20 rounded-lg bg-slate-100" />
          <div className="h-20 rounded-lg bg-slate-100" />
          <div className="h-32 rounded-lg bg-slate-100" />
        </div>
        <div className="lg:col-span-6 h-[540px] rounded-[12px] bg-white border border-slate-200 p-4 flex flex-col justify-between">
          <div className="h-8 w-full rounded-lg bg-slate-100" />
          <div className="flex-1 my-3 rounded-xl bg-slate-100" />
          <div className="h-20 w-full rounded-lg bg-slate-100" />
        </div>
        <div className="lg:col-span-3 h-[540px] rounded-[12px] bg-white border border-slate-200 p-4 space-y-3">
          <div className="h-4 w-36 rounded bg-slate-200" />
          <div className="h-64 rounded-lg bg-slate-100" />
          <div className="h-24 rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

// C02: Khai báo lazy component ở cấp module để không tải bundle Studio nặng trên các route khác
const LazyAiDesignWorkspace = dynamic(
  () => import('@/modules/05-ai-design/AiDesignWorkspace').then((m) => m.AiDesignWorkspace),
  {
    ssr: false,
    loading: () => <DesignStudioSkeleton />,
  },
);

export default function AiDesignModulePage() {
  return <LazyAiDesignWorkspace />;
}
