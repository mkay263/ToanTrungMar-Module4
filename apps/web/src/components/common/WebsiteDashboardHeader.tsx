'use client';

import React, { useState } from 'react';
import { Calendar, Check, Globe } from 'lucide-react';
import type { DashboardDatePreset, WebsiteConfigItemDto } from '@toantrung/contracts';
import type { DashboardScopeState } from '@/core/dashboard/useDashboardScope';

interface WebsiteDashboardHeaderProps {
  scope: DashboardScopeState;
  availableWebsites: WebsiteConfigItemDto[];
  selectedWebsiteLabel: string;
  freshnessMessage?: string;
  onChangeScope: (patch: Partial<DashboardScopeState>) => void;
}

const PRESET_OPTIONS: Array<{ id: DashboardDatePreset; label: string }> = [
  { id: 'TODAY', label: 'Hôm nay' },
  { id: 'YESTERDAY', label: 'Hôm qua' },
  { id: '7D', label: '7 ngày gần nhất' },
  { id: '30D', label: '30 ngày gần nhất' },
  { id: 'CUSTOM', label: 'Tùy chọn' },
];

export function WebsiteDashboardHeader({
  scope,
  availableWebsites,
  selectedWebsiteLabel,
  freshnessMessage,
  onChangeScope,
}: WebsiteDashboardHeaderProps) {
  const [customOpen, setCustomOpen] = useState(scope.preset === 'CUSTOM');
  const [localFrom, setLocalFrom] = useState(scope.from || '');
  const [localTo, setLocalTo] = useState(scope.to || '');

  const handlePresetChange = (nextPreset: DashboardDatePreset) => {
    if (nextPreset === 'CUSTOM') {
      setCustomOpen(true);
      onChangeScope({ preset: 'CUSTOM' });
      return;
    }
    setCustomOpen(false);
    onChangeScope({ preset: nextPreset, from: '', to: '' });
  };

  const applyCustomDates = () => {
    if (!localFrom || !localTo) return;
    onChangeScope({ preset: 'CUSTOM', from: localFrom, to: localTo });
  };

  return (
    <section
      aria-label="Bộ lọc website và thời gian"
      className="w-full rounded-2xl bg-gradient-to-r from-[#09183D] via-[#0F275C] to-[#0B132B] text-white px-4 py-3 shadow-lg ring-1 ring-white/10 space-y-2.5"
    >
      {/* Top Row: Title + Selected Website (Left) | Segmented Date Selector (Right) */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-white">
              Bảng điều khiển website
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-200 ring-1 ring-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              {selectedWebsiteLabel}
            </span>
          </div>
          {freshnessMessage && (
            <div aria-live="off" className="mt-0.5 text-[11px] text-slate-300/90">
              Đang xem: <strong className="text-white">{selectedWebsiteLabel}</strong> · {freshnessMessage}
            </div>
          )}
        </div>

        {/* Right: Segmented Date Range Selector */}
        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-white/10 p-1 border border-white/10 self-start lg:self-auto">
          <Calendar className="w-3.5 h-3.5 text-slate-300 ml-1.5 mr-1 shrink-0" />
          {PRESET_OPTIONS.map((opt) => {
            const active = scope.preset === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onClick={() => handlePresetChange(opt.id)}
                className={`h-7 px-2.5 rounded-lg text-xs font-semibold transition-all ${
                  active
                    ? 'bg-white text-[#0B1D48] font-bold shadow-xs'
                    : 'text-slate-200 hover:bg-white/15'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Date Inputs if CUSTOM selected */}
      {(customOpen || scope.preset === 'CUSTOM') && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1 text-xs">
          <label className="text-slate-300">
            Từ ngày:{' '}
            <input
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="ml-1 h-7 px-2 rounded-lg bg-slate-900/80 border border-slate-600 text-white text-xs"
            />
          </label>
          <label className="text-slate-300">
            Đến ngày:{' '}
            <input
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="ml-1 h-7 px-2 rounded-lg bg-slate-900/80 border border-slate-600 text-white text-xs"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomDates}
            className="h-7 px-3 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-bold"
          >
            Áp dụng
          </button>
        </div>
      )}

      {/* Bottom Row: Compact Website Selector Pills (deduplicated shortName/domain) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
        <button
          type="button"
          aria-pressed={scope.websiteId === 'all'}
          onClick={() => onChangeScope({ websiteId: 'all' })}
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all ${
            scope.websiteId === 'all'
              ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white font-bold shadow-md shadow-blue-500/25 ring-1 ring-white/30'
              : 'bg-white/10 text-slate-200 hover:bg-white/20 font-medium'
          }`}
        >
          {scope.websiteId === 'all' ? <Check className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
          <span>Tất cả website</span>
        </button>

        {availableWebsites.map((site) => {
          const active = scope.websiteId === site.websiteId;
          const showDomainSuffix =
            site.domain &&
            site.shortName.toLowerCase().trim() !== site.domain.toLowerCase().trim();
          return (
            <button
              key={site.websiteId}
              type="button"
              aria-pressed={active}
              onClick={() => onChangeScope({ websiteId: site.websiteId })}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all ${
                active
                  ? 'bg-gradient-to-r from-blue-500 to-sky-500 text-white font-bold shadow-md shadow-blue-500/25 ring-1 ring-white/30'
                  : 'bg-white/10 text-slate-200 hover:bg-white/20 font-medium'
              }`}
            >
              {active && <Check className="w-3.5 h-3.5 shrink-0" />}
              <span className="font-semibold">{site.shortName}</span>
              {showDomainSuffix && (
                <span className={active ? 'text-blue-100' : 'text-slate-400'}>({site.domain})</span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}

