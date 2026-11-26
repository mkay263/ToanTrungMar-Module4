'use client';

import React, { useId } from 'react';
import type { M04PeriodBreakdownDto } from '@toantrung/contracts';
import { MktSpreadsheetCalcBar, useMktExcelSelection } from '@/components/common/MktSpreadsheetCalcBar';

interface PeriodBreakdownTableProps {
  periodBreakdown: M04PeriodBreakdownDto;
}

function formatVndCell(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
}

export function PeriodBreakdownTable({ periodBreakdown }: PeriodBreakdownTableProps) {
  const captionId = useId();
  const calc = useMktExcelSelection();
  const { buckets, totals, granularityLabel, timezone } = periodBreakdown;

  const totalWinRateText =
    totals.winRatePct !== null && totals.winRatePct !== undefined
      ? `${totals.winRatePct}%`
      : '—';

  return (
    <section className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-[#0F172A]">
            Bảng chốt số liệu chính xác — {granularityLabel} ({buckets.length} mốc)
          </h2>
          <p className="text-xs text-slate-500">
            Cộng tổng các mốc thời gian khớp 100% số liệu kỳ đang lọc · Múi giờ {timezone}
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          Khớp tổng tuyệt đối (Độ lệch = 0)
        </span>
      </div>

      <MktSpreadsheetCalcBar
        title={`Chuỗi số liệu ${granularityLabel.toLowerCase()}`}
        excelMode={calc.excelMode}
        onToggleExcelMode={calc.toggleExcelMode}
        stats={calc.stats}
        onClear={calc.clearSelection}
      />

      <div
        tabIndex={0}
        role="region"
        aria-labelledby={captionId}
        className="overflow-auto max-w-full max-h-[480px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <table className="w-full text-xs text-left tabular-nums border-separate border-spacing-0 [&_td]:border-r [&_td]:border-b [&_td]:border-slate-200/80 [&_th]:border-r [&_th]:border-b [&_th]:border-slate-200">
          <caption id={captionId} className="sr-only">
            Bảng chốt số liệu báo cáo theo {granularityLabel}
          </caption>
          <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase">
            <tr>
              <th scope="col" className="sticky left-0 z-20 bg-slate-100 px-4 py-2.5 min-w-[190px]">
                Mốc thời gian
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Tiếp nhận
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Hợp lệ
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Đã báo giá
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Chốt
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Tỷ lệ chốt
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Chi phí Ads
              </th>
              <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                Lead Ads
              </th>
              <th scope="col" className="px-4 py-2.5 text-right whitespace-nowrap">
                CPL Ads
              </th>
            </tr>
          </thead>
          <tbody>
            {buckets.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-500">
                  Không có mốc thời gian nào trong phạm vi đang chọn.
                </td>
              </tr>
            ) : (
              buckets.map((b) => (
                <tr
                  key={b.bucketKey}
                  className="odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/35"
                >
                  <th
                    scope="row"
                    className="sticky left-0 z-[5] bg-white px-4 py-2 font-semibold text-slate-900 whitespace-nowrap"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{b.label}</span>
                      {b.isPreliminary && (
                        <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">
                          Chưa chốt
                        </span>
                      )}
                    </div>
                  </th>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:rec`, 'Tiếp nhận', b.receivedLeadCount)}
                    className={`px-3 py-2 text-right font-semibold ${calc.cellClass(`pb:${b.bucketKey}:rec`)}`}
                  >
                    {b.receivedLeadCount}
                  </td>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:val`, 'Hợp lệ', b.validLeadCount)}
                    className={`px-3 py-2 text-right font-semibold text-indigo-700 ${calc.cellClass(`pb:${b.bucketKey}:val`)}`}
                  >
                    {b.validLeadCount}
                  </td>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:quo`, 'Đã báo giá', b.quotedLeadCount)}
                    className={`px-3 py-2 text-right ${calc.cellClass(`pb:${b.bucketKey}:quo`)}`}
                  >
                    {b.quotedLeadCount}
                  </td>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:won`, 'Chốt', b.wonLeadCount)}
                    className={`px-3 py-2 text-right font-semibold text-emerald-700 ${calc.cellClass(`pb:${b.bucketKey}:won`)}`}
                  >
                    {b.wonLeadCount}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {b.winRatePct !== null ? `${b.winRatePct}%` : '—'}
                  </td>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:cost`, 'Chi phí Ads', b.adCost)}
                    className={`px-3 py-2 text-right ${calc.cellClass(`pb:${b.bucketKey}:cost`)}`}
                  >
                    {formatVndCell(b.adCost)}
                  </td>
                  <td
                    onClick={() => calc.toggleCell(`pb:${b.bucketKey}:adl`, 'Lead Ads', b.adLeadCount)}
                    className={`px-3 py-2 text-right ${calc.cellClass(`pb:${b.bucketKey}:adl`)}`}
                  >
                    {b.adLeadCount}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">
                    {formatVndCell(b.cpl)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot className="bg-slate-100/95 font-bold text-slate-900">
            <tr>
              <th scope="row" className="sticky left-0 z-[5] bg-slate-100 px-4 py-2.5 text-left">
                TỔNG CỘNG KHỚP KỲ
              </th>
              <td className="px-3 py-2.5 text-right">{totals.receivedLeadCount}</td>
              <td className="px-3 py-2.5 text-right text-indigo-800">{totals.validLeadCount}</td>
              <td className="px-3 py-2.5 text-right">{totals.quotedLeadCount}</td>
              <td className="px-3 py-2.5 text-right text-emerald-800">{totals.wonLeadCount}</td>
              <td className="px-3 py-2.5 text-right">{totalWinRateText}</td>
              <td className="px-3 py-2.5 text-right">{formatVndCell(totals.adCost)}</td>
              <td className="px-3 py-2.5 text-right">{totals.adLeadCount}</td>
              <td className="px-4 py-2.5 text-right">{formatVndCell(totals.cpl)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
