'use client';

import React, { useState } from 'react';
import { Calendar, Check, Clock, Globe } from 'lucide-react';
import {
  UI_VOCABULARY,
  resolveWebsiteScopeDisplay,
  type DashboardDatePreset,
  type WebsiteConfigItemDto,
} from '@toantrung/contracts';
import type { DashboardScopeState } from '@/core/dashboard/useDashboardScope';

interface WebsiteDashboardHeaderProps {
  title?: string;
  subtitle?: string;
  scope: DashboardScopeState;
  availableWebsites: WebsiteConfigItemDto[];
  selectedWebsiteLabel?: string;
  comparisonLabel?: string | null;
  freshnessMessage?: string;
  freshnessTone?: 'ok' | 'warning' | 'error' | 'updating';
  hideWebsiteTabs?: boolean;
  actions?: React.ReactNode;
  onChangeScope: (patch: Partial<DashboardScopeState>) => void;
}

const PRESET_OPTIONS: Array<{ id: DashboardDatePreset; label: string }> = [
  { id: 'TODAY', label: UI_VOCABULARY.timePresets.TODAY },
  { id: 'YESTERDAY', label: UI_VOCABULARY.timePresets.YESTERDAY },
  { id: '7D', label: UI_VOCABULARY.timePresets['7D'] },
  { id: '30D', label: UI_VOCABULARY.timePresets['30D'] },
  { id: 'CUSTOM', label: UI_VOCABULARY.timePresets.CUSTOM },
];

export function WebsiteDashboardHeader({
  title,
  subtitle,
  scope,
  availableWebsites,
  comparisonLabel,
  freshnessMessage,
  freshnessTone = 'ok',
  hideWebsiteTabs = false,
  actions,
  onChangeScope,
}: WebsiteDashboardHeaderProps) {
  const [customOpen, setCustomOpen] = useState(scope.preset === 'CUSTOM');
  const [localFrom, setLocalFrom] = useState(scope.from || '');
  const [localTo, setLocalTo] = useState(scope.to || '');

  // C01 #5 & C04: Nhãn "Đang xem" tính đồng bộ từ scope.websiteId hiện tại, không bao giờ hiển thị nhãn cũ khi đang tải
  const activeWebsiteDisplay = hideWebsiteTabs
    ? 'Toàn hệ thống (Tất cả website)'
    : resolveWebsiteScopeDisplay(scope.websiteId, availableWebsites);

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

  const statusDotClass =
    freshnessTone === 'error'
      ? 'bg-red-500'
      : freshnessTone === 'warning'
        ? 'bg-amber-500'
        : freshnessTone === 'updating'
          ? 'bg-blue-500 animate-pulse'
          : 'bg-emerald-500';

  const timeSelectorEl = (
    <div
      role="group"
      aria-label="Chọn khoảng thời gian"
      className="inline-flex items-center gap-0.5 rounded-xl bg-slate-100/90 p-1 border border-slate-200/80 overflow-x-auto max-w-full shrink-0"
    >
      <Calendar aria-hidden="true" className="w-3.5 h-3.5 text-slate-500 ml-1.5 mr-1 shrink-0" />
      {PRESET_OPTIONS.map((opt) => {
        const active = scope.preset === opt.id;
        return (
          <button
            key={opt.id}
            type="button"
            aria-pressed={active}
            onClick={() => handlePresetChange(opt.id)}
            className={`flex-none min-h-7 py-1 px-2.5 rounded-lg text-xs transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] ${
              active
                ? 'bg-[#0F275C] text-white font-semibold shadow-2xs'
                : 'text-slate-700 hover:bg-white/80 font-medium'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  const compactSiteLabel = (site: WebsiteConfigItemDto) => {
    const s = site.shortName
      .replace(/^Chuyên trang\s+/i, '')
      .replace(/^Website\s+/i, '')
      .replace(/^Toàn Trung\s*-\s*/i, '')
      .trim();
    return s || site.shortName;
  };

  return (
    <section
      aria-label="Thanh ngữ cảnh website và thời gian"
      className="w-full rounded-2xl bg-white border border-slate-200/90 px-4 py-3 shadow-2xs space-y-2.5"
    >
      {/* Hàng 1: Tiêu đề trang + Đang xem + Trạng thái dữ liệu + Thao tác */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1
              tabIndex={-1}
              className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight focus:outline-none"
            >
              {title || 'Phân tích website'}
            </h1>
            <span className="inline-flex items-center gap-1.5 min-h-6 rounded-full bg-gradient-to-r from-blue-50 to-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-[#0F275C] border border-blue-200/80">
              <Globe aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-[#1E3A8A]" />
              <span>{hideWebsiteTabs ? activeWebsiteDisplay : `Đang xem: ${activeWebsiteDisplay}`}</span>
            </span>
            {comparisonLabel && (
              <span className="inline-flex items-center min-h-6 rounded-full bg-emerald-50/80 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 border border-emerald-200/70">
                {comparisonLabel}
              </span>
            )}
          </div>
          {(subtitle || freshnessMessage) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
              {subtitle && <span>{subtitle}</span>}
              {freshnessMessage && (
                <span aria-live="off" className="inline-flex items-center gap-1.5 text-slate-600">
                  <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} />
                  <Clock aria-hidden="true" className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>{freshnessMessage}</span>
                </span>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {hideWebsiteTabs && timeSelectorEl}
          {actions}
        </div>
      </div>

      {/* Hàng 2: Thanh điều hướng Website dạng Segmented Dock 1 dòng mượt & bắt mắt + Thời gian */}
      {!hideWebsiteTabs && (
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5 pt-2.5 border-t border-slate-100">
          <div
            role="group"
            aria-label="Chọn website nguồn"
            className="flex items-center gap-1 overflow-x-auto max-w-full rounded-xl bg-slate-100/85 p-1 border border-slate-200/80 [scrollbar-width:none]"
          >
            <button
              type="button"
              aria-pressed={scope.websiteId === 'all'}
              onClick={() => onChangeScope({ websiteId: 'all' })}
              className={`flex-none inline-flex items-center gap-1.5 min-h-8 px-3 py-1 rounded-lg text-xs transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] ${
                scope.websiteId === 'all'
                  ? 'bg-gradient-to-r from-[#0F275C] to-[#1E3A8A] text-white font-semibold shadow-xs'
                  : 'text-slate-700 hover:bg-white/90 font-medium'
              }`}
            >
              {scope.websiteId === 'all' ? (
                <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-sky-300" />
              ) : (
                <Globe aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-500" />
              )}
              <span>Tất cả website</span>
            </button>

            {availableWebsites.map((site) => {
              const active = scope.websiteId === site.websiteId;
              const shortLabel = compactSiteLabel(site);
              const showDomainSuffix =
                site.domain &&
                !site.domain.startsWith('ga4-') &&
                shortLabel.toLowerCase() !== site.domain.toLowerCase();
              return (
                <button
                  key={site.websiteId}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeScope({ websiteId: site.websiteId })}
                  title={`${site.shortName} (${site.domain})`}
                  className={`flex-none inline-flex items-center gap-1.5 min-h-8 px-3 py-1 rounded-lg text-xs transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A8A] ${
                    active
                      ? 'bg-gradient-to-r from-[#0F275C] to-[#1E3A8A] text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:bg-white/90 font-medium'
                  }`}
                >
                  {active && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-sky-300" />}
                  <span>{shortLabel}</span>
                  {showDomainSuffix && (
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                        active ? 'bg-white/15 text-sky-100' : 'bg-white/80 text-slate-500 border border-slate-200/70'
                      }`}
                    >
                      {site.domain}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {timeSelectorEl}
        </div>
      )}

      {/* Khoảng ngày tùy chọn */}
      {(customOpen || scope.preset === 'CUSTOM') && (
        <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <label htmlFor="scope-date-from" className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
            <span>Từ ngày</span>
            <input
              id="scope-date-from"
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="min-h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            />
          </label>
          <label htmlFor="scope-date-to" className="inline-flex items-center gap-1.5 text-slate-700 font-medium">
            <span>Đến ngày</span>
            <input
              id="scope-date-to"
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="min-h-8 px-2.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomDates}
            className="min-h-8 px-3.5 rounded-lg bg-[#1E3A8A] hover:bg-[#153075] text-white font-semibold transition-colors"
          >
            Áp dụng
          </button>
        </div>
      )}
    </section>
  );
}
