'use client';

import React, { useMemo } from 'react';
import { Calendar, Clock, Layers } from 'lucide-react';
import type { M04ReportGranularity } from '@toantrung/contracts';
import type { DashboardScopeState } from '@/core/dashboard/useDashboardScope';

interface PeriodBreakdownBarProps {
  granularity: M04ReportGranularity;
  scope: DashboardScopeState;
  resolvedStartDate?: string;
  resolvedEndDate?: string;
  onChangeGranularity: (next: M04ReportGranularity) => void;
  onApplyRange: (patch: Partial<DashboardScopeState>, nextGranularity: M04ReportGranularity) => void;
}

function getTodayVnYmd(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDaysVn(ymd: string, delta: number): string {
  const dt = new Date(`${ymd}T12:00:00+07:00`);
  dt.setDate(dt.getDate() + delta);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function getMondayOfWeekVn(ymd: string): string {
  const dt = new Date(`${ymd}T12:00:00+07:00`);
  const dow = dt.getDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  dt.setDate(dt.getDate() + diff);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(dt);
}

function getMonthBounds(ym: string): { from: string; to: string } {
  const [yStr, mStr] = ym.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${yStr}-${mStr}-01`,
    to: `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

export function PeriodBreakdownBar({
  granularity,
  scope,
  resolvedStartDate,
  resolvedEndDate,
  onChangeGranularity,
  onApplyRange,
}: PeriodBreakdownBarProps) {
  const todayYmd = useMemo(() => getTodayVnYmd(), []);
  const currentYear = Number(todayYmd.slice(0, 4));
  const currentYm = todayYmd.slice(0, 7);

  const weekOptions = useMemo(() => {
    const monday0 = getMondayOfWeekVn(todayYmd);
    return Array.from({ length: 8 }).map((_, idx) => {
      const start = addDaysVn(monday0, -idx * 7);
      const end = addDaysVn(start, 6);
      const label =
        idx === 0
          ? `Tuần này (${start.slice(8, 10)}/${start.slice(5, 7)} – ${end.slice(8, 10)}/${end.slice(5, 7)})`
          : idx === 1
            ? `Tuần trước (${start.slice(8, 10)}/${start.slice(5, 7)} – ${end.slice(8, 10)}/${end.slice(5, 7)})`
            : `${start.slice(8, 10)}/${start.slice(5, 7)}/${start.slice(0, 4)} – ${end.slice(8, 10)}/${end.slice(5, 7)}`;
      return { value: `${start}|${end}`, from: start, to: end, label };
    });
  }, [todayYmd]);

  const monthOptions = useMemo(() => {
    const list: Array<{ value: string; label: string; from: string; to: string }> = [];
    const baseY = Number(currentYm.slice(0, 4));
    const baseM = Number(currentYm.slice(5, 7));
    for (let i = 0; i < 12; i++) {
      let m = baseM - i;
      let y = baseY;
      while (m <= 0) {
        m += 12;
        y -= 1;
      }
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      const bounds = getMonthBounds(ym);
      const clampedTo = ym === currentYm ? todayYmd : bounds.to;
      list.push({
        value: ym,
        from: bounds.from,
        to: clampedTo,
        label: `Tháng ${String(m).padStart(2, '0')}/${y}`,
      });
    }
    return list;
  }, [currentYm, todayYmd]);

  const yearOptions = useMemo(() => {
    return [currentYear, currentYear - 1].map((y) => ({
      value: String(y),
      from: `${y}-01-01`,
      to: y === currentYear ? todayYmd : `${y}-12-31`,
      label: y === currentYear ? `Năm ${y} (từ 01/01 đến hôm nay)` : `Cả năm ${y}`,
    }));
  }, [currentYear, todayYmd]);

  const activeStart = resolvedStartDate || scope.from || todayYmd;
  const activeEnd = resolvedEndDate || scope.to || todayYmd;

  const handleSelectGranularity = (next: M04ReportGranularity) => {
    onChangeGranularity(next);
    if (next === 'day') {
      onApplyRange({ preset: 'CUSTOM', from: todayYmd, to: todayYmd }, 'day');
    } else if (next === 'week') {
      const w = weekOptions[0];
      onApplyRange({ preset: 'CUSTOM', from: w.from, to: w.to }, 'week');
    } else if (next === 'month') {
      const m = monthOptions[0];
      onApplyRange({ preset: 'CUSTOM', from: m.from, to: m.to }, 'month');
    } else if (next === 'year') {
      const y = yearOptions[0];
      onApplyRange({ preset: 'CUSTOM', from: y.from, to: y.to }, 'year');
    }
  };

  const granButtons: Array<{ key: M04ReportGranularity; label: string }> = [
    { key: 'day', label: 'Theo Ngày' },
    { key: 'week', label: 'Theo Tuần' },
    { key: 'month', label: 'Theo Tháng' },
    { key: 'year', label: 'Theo Năm' },
  ];

  const selectedWeekVal =
    weekOptions.find((w) => w.from === activeStart && w.to === activeEnd)?.value ||
    weekOptions[0].value;
  const selectedMonthVal =
    monthOptions.find((m) => m.value === activeStart.slice(0, 7))?.value || monthOptions[0].value;
  const selectedYearVal =
    yearOptions.find((y) => y.value === activeStart.slice(0, 4))?.value || yearOptions[0].value;

  return (
    <section
      aria-label="Chọn cấp tổng hợp Ngày, Tuần, Tháng, Năm"
      className="rounded-2xl border border-slate-200/90 bg-white px-4 py-2.5 shadow-2xs flex flex-col xl:flex-row xl:items-center xl:justify-between gap-2.5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 mr-1">
          <Layers className="w-3.5 h-3.5 text-[#1553A2]" aria-hidden="true" />
          <span>Chốt kỳ báo cáo:</span>
        </span>

        <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-slate-100/90 p-1">
          {granButtons.map((btn) => {
            const active = granularity === btn.key;
            return (
              <button
                key={btn.key}
                type="button"
                aria-pressed={active}
                onClick={() => handleSelectGranularity(btn.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  active
                    ? 'bg-[#0B1D48] text-white shadow-xs'
                    : 'text-slate-700 hover:bg-white/80 hover:text-slate-900'
                }`}
              >
                {btn.label}
              </button>
            );
          })}
        </div>

        {/* Bộ chọn mốc thời gian cụ thể theo cấp đang chọn */}
        <div className="inline-flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          {granularity === 'day' && (
            <input
              type="date"
              aria-label="Chọn ngày chốt báo cáo"
              value={activeStart}
              max={todayYmd}
              onChange={(e) => {
                const v = e.target.value;
                if (v) onApplyRange({ preset: 'CUSTOM', from: v, to: v }, 'day');
              }}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          )}
          {granularity === 'week' && (
            <select
              aria-label="Chọn tuần chốt báo cáo"
              value={selectedWeekVal}
              onChange={(e) => {
                const [f, t] = e.target.value.split('|');
                if (f && t) onApplyRange({ preset: 'CUSTOM', from: f, to: t }, 'week');
              }}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {weekOptions.map((w) => (
                <option key={w.value} value={w.value}>
                  {w.label}
                </option>
              ))}
            </select>
          )}
          {granularity === 'month' && (
            <select
              aria-label="Chọn tháng chốt báo cáo"
              value={selectedMonthVal}
              onChange={(e) => {
                const hit = monthOptions.find((m) => m.value === e.target.value);
                if (hit) onApplyRange({ preset: 'CUSTOM', from: hit.from, to: hit.to }, 'month');
              }}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
          {granularity === 'year' && (
            <select
              aria-label="Chọn năm chốt báo cáo"
              value={selectedYearVal}
              onChange={(e) => {
                const hit = yearOptions.find((y) => y.value === e.target.value);
                if (hit) onApplyRange({ preset: 'CUSTOM', from: hit.from, to: hit.to }, 'year');
              }}
              className="h-8 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {yearOptions.map((y) => (
                <option key={y.value} value={y.value}>
                  {y.label}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono tabular-nums">
          <Clock className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
          <span>
            {activeStart} → {activeEnd} (UTC+7)
          </span>
        </span>
      </div>
    </section>
  );
}
