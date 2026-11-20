'use client';

import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';

export interface ReportsDailyPoint {
  bucketStart: string;
  bucketEnd: string;
  label: string;
  receivedLeadCount: number | null;
  validLeadCount: number | null;
  wonLeadCount?: number | null;
  adCost?: number | null;
  isMissingDay?: boolean;
}

export interface ReportsPrevDailyPoint {
  bucketStart: string;
  label: string;
  receivedLeadCount: number | null;
  validLeadCount: number | null;
  wonLeadCount?: number | null;
}

type SeriesKey = 'received' | 'valid' | 'won';

interface SeriesMeta {
  key: SeriesKey;
  label: string;
  color: string;
  getValue: (pt: ReportsDailyPoint | ReportsPrevDailyPoint | undefined) => number | null;
}

const SERIES_META: SeriesMeta[] = [
  {
    key: 'received',
    label: 'Lead tiếp nhận',
    color: '#64748B',
    getValue: (pt) => pt?.receivedLeadCount ?? null,
  },
  {
    key: 'valid',
    label: 'Lead hợp lệ',
    color: '#1E3A8A',
    getValue: (pt) => pt?.validLeadCount ?? null,
  },
  {
    key: 'won',
    label: 'Chốt thành công',
    color: '#059669',
    getValue: (pt) => pt?.wonLeadCount ?? null,
  },
];

function buildSegmentedPath(
  pts: Array<{ x: number; y: number | null }>,
): string {
  let d = '';
  let penDown = false;
  for (const pt of pts) {
    if (pt.y === null || !Number.isFinite(pt.y)) {
      penDown = false;
      continue;
    }
    d += `${penDown ? 'L' : 'M'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)} `;
    penDown = true;
  }
  return d.trim();
}

export function ReportsPerformanceChart({
  series,
  previousSeries = [],
  compareEnabled,
  startDate,
  endDate,
  loading,
}: {
  series: ReportsDailyPoint[];
  previousSeries?: ReportsPrevDailyPoint[];
  compareEnabled: boolean;
  startDate: string;
  endDate: string;
  loading?: boolean;
}) {
  const [activeKeys, setActiveKeys] = useState<SeriesKey[]>(['received', 'valid']);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const toggleKey = (key: SeriesKey) => {
    setActiveKeys((prev) => {
      if (prev.includes(key)) {
        return prev.length <= 1 ? prev : prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  const width = 760;
  const height = 228;
  const padLeft = 38;
  const padRight = 18;
  const padTop = 16;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;
  const baselineY = padTop + plotH;

  const primaryKey: SeriesKey = activeKeys[0] || 'received';
  const hasPrevSeries = compareEnabled && previousSeries.length > 0;

  const computed = useMemo(() => {
    const n = series.length;
    const vals: number[] = [];
    for (let i = 0; i < n; i += 1) {
      const pt = series[i];
      for (const k of activeKeys) {
        const meta = SERIES_META.find((m) => m.key === k);
        const v = meta?.getValue(pt);
        if (typeof v === 'number' && Number.isFinite(v)) vals.push(v);
      }
      if (hasPrevSeries) {
        const pMeta = SERIES_META.find((m) => m.key === primaryKey);
        const pv = pMeta?.getValue(previousSeries[i]);
        if (typeof pv === 'number' && Number.isFinite(pv)) vals.push(pv);
      }
    }

    const rawMax = Math.max(0, ...vals);
    const niceMax = rawMax <= 4 ? 4 : Math.ceil(rawMax * 1.15);
    const toY = (val: number | null | undefined) => {
      if (val === null || val === undefined || !Number.isFinite(val)) return null;
      const clamped = Math.max(0, Math.min(niceMax, val));
      return baselineY - (clamped / niceMax) * plotH;
    };

    const xs = series.map((_, i) =>
      n <= 1 ? padLeft + plotW / 2 : padLeft + (i / (n - 1)) * plotW,
    );

    const lines = activeKeys.map((k) => {
      const meta = SERIES_META.find((m) => m.key === k)!;
      const points = series.map((pt, i) => ({
        x: xs[i],
        y: pt.isMissingDay ? null : toY(meta.getValue(pt)),
      }));
      return {
        meta,
        points,
        path: buildSegmentedPath(points),
      };
    });

    const prevMeta = SERIES_META.find((m) => m.key === primaryKey)!;
    const prevPoints = hasPrevSeries
      ? series.map((_, i) => ({
          x: xs[i],
          y: toY(prevMeta.getValue(previousSeries[i])),
        }))
      : [];
    const prevPath = buildSegmentedPath(prevPoints);

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      y: baselineY - ratio * plotH,
      label: String(Math.round(niceMax * ratio)),
    }));

    return { xs, lines, prevPath, prevMeta, yTicks, niceMax };
  }, [series, previousSeries, activeKeys, primaryKey, hasPrevSeries, baselineY, plotH, plotW]);

  const activeIdx = hoverIdx !== null && series[hoverIdx] ? hoverIdx : null;
  const activePt = activeIdx !== null ? series[activeIdx] : null;
  const activePrevPt = activeIdx !== null ? previousSeries[activeIdx] : null;
  const activeX = activeIdx !== null ? computed.xs[activeIdx] : 0;
  const hitW = Math.max(14, plotW / Math.max(1, series.length));

  return (
    <section className="rounded-[16px] border border-slate-200 bg-white p-4 shadow-xs flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 className="text-sm font-bold text-[#0F172A]">
          Xu hướng Lead theo ngày
        </h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {SERIES_META.map((item) => {
            const on = activeKeys.includes(item.key);
            return (
              <button
                key={item.key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleKey(item.key)}
                className={`h-7 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition ${
                  on
                    ? 'bg-white border-slate-300 text-slate-900 shadow-2xs'
                    : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-xs grid place-items-center border"
                  style={{
                    backgroundColor: on ? item.color : '#FFFFFF',
                    borderColor: on ? item.color : '#CBD5E1',
                  }}
                >
                  {on && <Check className="w-2.5 h-2.5 text-white stroke-[3]" />}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative flex-1 min-h-[244px] flex flex-col justify-end">
        {loading && series.length === 0 ? (
          <div className="h-[228px] rounded-xl bg-slate-50 animate-pulse" />
        ) : series.length === 0 ? (
          <div className="h-[228px] rounded-xl bg-slate-50 border border-dashed border-slate-200 grid place-items-center text-xs text-slate-500">
            Chưa có dữ liệu trong khoảng ngày đang chọn.
          </div>
        ) : (
          <div className="relative select-none">
            {activePt && (
              <div
                className="pointer-events-none absolute top-1 z-20 rounded-xl bg-slate-900/95 text-white px-3 py-2 text-xs shadow-xl border border-slate-700 space-y-1 min-w-[205px]"
                style={{
                  left:
                    activeX > width * 0.62
                      ? 'auto'
                      : `${Math.max(6, (activeX / width) * 100)}%`,
                  right:
                    activeX > width * 0.62
                      ? `${Math.max(4, ((width - activeX) / width) * 100)}%`
                      : 'auto',
                }}
              >
                <div className="font-bold text-sky-300 border-b border-white/10 pb-1 flex items-center justify-between gap-2">
                  <span>{activePt.bucketStart}</span>
                  {activePt.isMissingDay && (
                    <span className="text-[10px] text-slate-300">Chưa đến</span>
                  )}
                </div>
                {activeKeys.map((k) => {
                  const meta = SERIES_META.find((m) => m.key === k)!;
                  const val = activePt.isMissingDay ? null : meta.getValue(activePt);
                  const prevVal = hasPrevSeries ? meta.getValue(activePrevPt ?? undefined) : null;
                  return (
                    <div key={k} className="space-y-0.5">
                      <div className="flex items-center justify-between gap-4">
                        <span className="inline-flex items-center gap-1.5 text-slate-200">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: meta.color }}
                          />
                          {meta.label}:
                        </span>
                        <strong className="tabular-nums font-bold">
                          {val === null ? '—' : val.toLocaleString('vi-VN')}
                        </strong>
                      </div>
                      {hasPrevSeries && prevVal !== null && k === primaryKey && (
                        <div className="flex items-center justify-between gap-4 text-[10px] text-slate-400 pl-3.5">
                          <span>Kỳ trước ({activePrevPt?.label}):</span>
                          <span className="tabular-nums">
                            {prevVal.toLocaleString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-[228px] overflow-visible"
              onMouseLeave={() => setHoverIdx(null)}
              role="img"
              aria-label="Biểu đồ xu hướng Lead theo ngày"
            >
              {computed.yTicks.map((t) => (
                <g key={t.y}>
                  <line
                    x1={padLeft}
                    y1={t.y}
                    x2={width - padRight}
                    y2={t.y}
                    stroke="#E2E8F0"
                    strokeDasharray={t.y === baselineY ? undefined : '3 3'}
                  />
                  <text
                    x={padLeft - 6}
                    y={t.y + 3.5}
                    textAnchor="end"
                    fontSize="10"
                    fill="#64748B"
                    className="tabular-nums"
                  >
                    {t.label}
                  </text>
                </g>
              ))}

              {hasPrevSeries && computed.prevPath && (
                <path
                  d={computed.prevPath}
                  fill="none"
                  stroke={computed.prevMeta.color}
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  strokeOpacity={0.55}
                />
              )}

              {computed.lines.map((line) => (
                <g key={line.meta.key}>
                  {line.path && (
                    <path
                      d={line.path}
                      fill="none"
                      stroke={line.meta.color}
                      strokeWidth={2.25}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  )}
                </g>
              ))}

              {activeIdx !== null && (
                <line
                  x1={activeX}
                  y1={padTop}
                  x2={activeX}
                  y2={baselineY}
                  stroke="#94A3B8"
                  strokeDasharray="3 3"
                />
              )}

              {series.map((pt, idx) => {
                const x = computed.xs[idx];
                const hovered = activeIdx === idx;
                const step = Math.max(1, Math.ceil(series.length / 7));
                const showLabel = idx === 0 || idx === series.length - 1 || idx % step === 0;
                return (
                  <g key={pt.bucketStart}>
                    {computed.lines.map((line) => {
                      const mp = line.points[idx];
                      if (!mp || mp.y === null) return null;
                      return (
                        <circle
                          key={`${line.meta.key}-${idx}`}
                          cx={x}
                          cy={mp.y}
                          r={hovered ? 4.5 : series.length <= 10 ? 3 : 2}
                          fill={hovered ? line.meta.color : '#FFFFFF'}
                          stroke={line.meta.color}
                          strokeWidth={hovered ? 2.2 : 1.5}
                        />
                      );
                    })}
                    {showLabel && (
                      <text
                        x={x}
                        y={baselineY + 17}
                        textAnchor="middle"
                        fontSize="10"
                        fill={hovered ? '#0F172A' : '#64748B'}
                        fontWeight={hovered ? 700 : 400}
                        className="tabular-nums"
                      >
                        {pt.label}
                      </text>
                    )}
                    <rect
                      x={x - hitW / 2}
                      y={padTop}
                      width={hitW}
                      height={plotH + 20}
                      fill="transparent"
                      className="cursor-crosshair"
                      onMouseEnter={() => setHoverIdx(idx)}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 mt-1 border-t border-slate-100 text-[11px] text-slate-500">
        <span>Chọn chỉ số để bật/tắt đường biểu đồ · Nét đứt: kỳ trước</span>
        <span className="tabular-nums">
          {startDate} → {endDate}
        </span>
      </div>
    </section>
  );
}
