'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ChevronDown, ChevronUp, Package, Search } from 'lucide-react';
import type {
  M04ProductCatalogRowDto,
  M04ProductCategoryGroup,
  M04ProductCategorySummaryDto,
  M04UnclassifiedProductHintDto,
} from '@toantrung/contracts';
import { MktSpreadsheetCalcBar, useMktExcelSelection } from '@/components/common/MktSpreadsheetCalcBar';

interface ProductCatalogBreakdownPanelProps {
  catalogRows: M04ProductCatalogRowDto[];
  categorySummaries: M04ProductCategorySummaryDto[];
  unclassifiedHints: M04UnclassifiedProductHintDto[];
  multiProductNote?: string | null;
  leadsDrilldownHref: string;
}

type CategoryTabKey = 'all' | 'led_screen' | 'electronic_board' | 'other';

const CATEGORY_TABS: Array<{ key: CategoryTabKey; label: string }> = [
  { key: 'all', label: 'Tất cả (25 SP)' },
  { key: 'led_screen', label: 'Màn hình LED (8)' },
  { key: 'electronic_board', label: 'Bảng điện tử (12)' },
  { key: 'other', label: 'Nhu cầu khác (5)' },
];

export function ProductCatalogBreakdownPanel({
  catalogRows,
  categorySummaries,
  unclassifiedHints,
  multiProductNote,
  leadsDrilldownHref,
}: ProductCatalogBreakdownPanelProps) {
  const captionId = useId();
  const [activeCat, setActiveCat] = useState<CategoryTabKey>('all');
  const [showZeroItems, setShowZeroItems] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hintsExpanded, setHintsExpanded] = useState<boolean>(true);
  const calc = useMktExcelSelection();

  const tabRefs = useRef<Record<CategoryTabKey, HTMLButtonElement | null>>({
    all: null,
    led_screen: null,
    electronic_board: null,
    other: null,
  });

  const classifiedRows = useMemo(
    () => catalogRows.filter((r) => !r.isUnclassifiedProduct),
    [catalogRows],
  );
  const unclassifiedRow = useMemo(
    () => catalogRows.find((r) => r.isUnclassifiedProduct) || null,
    [catalogRows],
  );

  const visibleCatalogRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return classifiedRows.filter((r) => {
      if (activeCat !== 'all' && r.categoryGroup !== activeCat) return false;
      if (!showZeroItems && r.leadCount === 0) return false;
      if (
        q &&
        !r.productCode.toLowerCase().includes(q) &&
        !r.productName.toLowerCase().includes(q) &&
        !r.categoryLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [classifiedRows, activeCat, showZeroItems, searchQuery]);

  const footerTotals = useMemo(() => {
    const base = [...visibleCatalogRows];
    if (activeCat === 'all' && unclassifiedRow && !searchQuery.trim()) {
      base.push(unclassifiedRow);
    }
    const leadCount = base.reduce((s, r) => s + r.leadCount, 0);
    const validCount = base.reduce((s, r) => s + r.validCount, 0);
    const newLeadCount = base.reduce((s, r) => s + r.newLeadCount, 0);
    const quotingCount = base.reduce((s, r) => s + r.quotingCount, 0);
    const quotedCount = base.reduce((s, r) => s + r.quotedCount, 0);
    const quoteSentCount = base.reduce((s, r) => s + r.quoteSentCount, 0);
    const overdueCount = base.reduce((s, r) => s + r.overdueCount, 0);
    const wonCount = base.reduce((s, r) => s + r.wonCount, 0);
    const lostCount = base.reduce((s, r) => s + r.lostCount, 0);
    return {
      leadCount,
      validCount,
      newLeadCount,
      quotingCount,
      quotedCount,
      quoteSentCount,
      overdueCount,
      wonCount,
      lostCount,
      winRateText: validCount > 0 ? `${((wonCount / validCount) * 100).toFixed(1)}%` : '—',
    };
  }, [visibleCatalogRows, activeCat, unclassifiedRow, searchQuery]);

  const handleCatTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null;
    if (e.key === 'ArrowRight') nextIdx = (idx + 1) % CATEGORY_TABS.length;
    else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + CATEGORY_TABS.length) % CATEGORY_TABS.length;
    else if (e.key === 'Home') nextIdx = 0;
    else if (e.key === 'End') nextIdx = CATEGORY_TABS.length - 1;
    if (nextIdx !== null) {
      e.preventDefault();
      const target = CATEGORY_TABS[nextIdx];
      setActiveCat(target.key);
      tabRefs.current[target.key]?.focus();
    }
  };

  const badgeToneForCategory = (cg: M04ProductCategoryGroup) => {
    if (cg === 'led_screen') return 'bg-blue-50 text-[#1553A2] border-blue-200';
    if (cg === 'electronic_board') return 'bg-violet-50 text-violet-800 border-violet-200';
    if (cg === 'other') return 'bg-slate-100 text-slate-700 border-slate-200';
    return 'bg-amber-50 text-amber-900 border-amber-200';
  };

  return (
    <div className="space-y-4">
      {/* 4 Thẻ tổng hợp theo 3 Nhóm ngành chuẩn + Nhóm chưa gắn mã SP */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {categorySummaries.map((cat) => {
          const isUnclass = cat.categoryGroup === 'unclassified';
          return (
            <div
              key={cat.categoryGroup}
              className={`rounded-[14px] border p-4 shadow-xs ${
                isUnclass
                  ? 'border-amber-200 bg-amber-50/70'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                <span className={isUnclass ? 'text-amber-900' : 'text-slate-700'}>
                  {cat.categoryLabel}
                </span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${badgeToneForCategory(
                    cat.categoryGroup,
                  )}`}
                >
                  {isUnclass
                    ? 'Cần chuẩn hóa'
                    : `${cat.activeProductCount}/${cat.catalogProductCount} SP có hỏi`}
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {cat.leadCount}
                </span>
                <span className="text-xs text-slate-500">lượt Lead hỏi</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 tabular-nums">
                <span>Hợp lệ: {cat.validCount}</span>
                <span>Báo giá: {cat.quotedCount}</span>
                <span className="font-semibold text-emerald-700">
                  Chốt: {cat.wonCount} ({cat.winRatePct !== null ? `${cat.winRatePct}%` : '—'})
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Khu vực gợi ý rà soát cho Lead chưa gắn mã sản phẩm (read-only, không trộn vào số chính thức) */}
      {unclassifiedRow && unclassifiedRow.leadCount > 0 && (
        <section className="rounded-[14px] border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-950 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
              <span>
                Có <strong>{unclassifiedRow.leadCount}</strong> Lead chưa gắn mã sản phẩm trên{' '}
                <code className="font-mono">lead_products</code> — được tách riêng để số liệu 25 mặt hàng chính xác tuyệt đối.
              </span>
            </div>
            <div className="flex items-center gap-3">
              {unclassifiedHints.length > 0 && (
                <button
                  type="button"
                  onClick={() => setHintsExpanded((v) => !v)}
                  className="inline-flex items-center gap-1 font-semibold text-amber-900 hover:underline"
                >
                  <span>{hintsExpanded ? 'Ẩn gợi ý đối chiếu' : 'Xem gợi ý từ Tên dự án'}</span>
                  {hintsExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
              <Link
                href={leadsDrilldownHref}
                className="font-bold text-[#1553A2] hover:underline shrink-0"
              >
                Gắn mã SP tại Module 01 →
              </Link>
            </div>
          </div>

          {hintsExpanded && unclassifiedHints.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 pt-1">
              {unclassifiedHints.map((h) => (
                <div
                  key={h.hintKey}
                  className="rounded-lg border border-amber-200/90 bg-white/90 px-3 py-2 flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">
                      {h.suggestedProductCode ? (
                        <code className="font-mono text-[#1553A2] mr-1">{h.suggestedProductCode}</code>
                      ) : null}
                      {h.suggestedProductName}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-900 tabular-nums shrink-0">
                      {h.leadCount} Lead
                    </span>
                  </div>
                  {h.sampleProjects.length > 0 && (
                    <div className="text-[11px] text-slate-600 truncate">
                      Mẫu tên dự án: {h.sampleProjects.join(' · ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Bảng chi tiết 25 mặt hàng Toàn Trung */}
      <section className="rounded-[16px] border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-[#1553A2]" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-bold text-[#0F172A]">
                  Chi tiết đủ 25 Mặt hàng Toàn Trung ({visibleCatalogRows.length} mã đang hiển thị)
                </h2>
                {multiProductNote && (
                  <p className="text-xs text-slate-500">{multiProductNote}</p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  type="search"
                  aria-label="Tìm theo mã hoặc tên mặt hàng"
                  placeholder="Tìm mã SP (LED_INDOOR, BOARD_...)..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-64 max-w-full rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showZeroItems}
                  onChange={(e) => setShowZeroItems(e.target.checked)}
                  className="accent-[#1553A2]"
                />
                <span>Hiện cả mặt hàng 0 Lead</span>
              </label>
            </div>
          </div>

          {/* Thanh tab lọc nhóm ngành — tuân thủ modern-web-guidance `tabs` (1 hàng ngang, không chỉ dùng màu) */}
          <div
            role="tablist"
            aria-label="Lọc theo nhóm mặt hàng Toàn Trung"
            className="flex flex-nowrap overflow-x-auto gap-1 border-b border-slate-200 -mb-3"
          >
            {CATEGORY_TABS.map((tab, idx) => {
              const selected = activeCat === tab.key;
              return (
                <button
                  key={tab.key}
                  ref={(el) => {
                    tabRefs.current[tab.key] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onKeyDown={(e) => handleCatTabKeyDown(e, idx)}
                  onClick={() => setActiveCat(tab.key)}
                  className={`relative shrink-0 whitespace-nowrap px-3.5 py-2 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    selected
                      ? 'text-[#0B1D48] after:content-[""] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[#1553A2]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        <MktSpreadsheetCalcBar
          title={`Kiểm toán 25 mặt hàng Toàn Trung`}
          excelMode={calc.excelMode}
          onToggleExcelMode={calc.toggleExcelMode}
          stats={calc.stats}
          onClear={calc.clearSelection}
        />

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={captionId}
          className="overflow-auto max-w-full max-h-[540px] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          <table className="w-full text-xs text-left tabular-nums border-separate border-spacing-0 [&_td]:border-r [&_td]:border-b [&_td]:border-slate-200/80 [&_th]:border-r [&_th]:border-b [&_th]:border-slate-200">
            <caption id={captionId} className="sr-only">
              Bảng phân tích chi tiết 25 mặt hàng Toàn Trung theo trạng thái báo giá và tỷ lệ chốt
            </caption>
            <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700 uppercase">
              <tr>
                <th scope="col" className="sticky left-0 z-20 bg-slate-100 px-3.5 py-2.5 min-w-[165px]">
                  Mã SP
                </th>
                <th scope="col" className="px-3 py-2.5 whitespace-nowrap">
                  Nhóm ngành
                </th>
                <th scope="col" className="px-3 py-2.5 min-w-[210px]">
                  Tên mặt hàng
                </th>
                <th scope="col" className="px-2.5 py-2.5 whitespace-nowrap">
                  ĐVT
                </th>
                <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                  Tiếp nhận
                </th>
                <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                  Hợp lệ
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Mới
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Đang BG
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Đã gửi BG
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Quá hạn &gt;7n
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Chốt
                </th>
                <th scope="col" className="px-2.5 py-2.5 text-right whitespace-nowrap">
                  Thất bại
                </th>
                <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                  Tỷ lệ chốt
                </th>
                <th scope="col" className="px-3 py-2.5 text-right whitespace-nowrap">
                  Tỷ trọng
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleCatalogRows.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-slate-500">
                    Không có mặt hàng nào khớp bộ lọc đang chọn.
                  </td>
                </tr>
              ) : (
                visibleCatalogRows.map((p) => (
                  <tr
                    key={p.productCode}
                    className="odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/35"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-[5] bg-white px-3.5 py-2 font-mono font-semibold text-slate-900 whitespace-nowrap"
                    >
                      {p.productCode}
                    </th>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${badgeToneForCategory(
                          p.categoryGroup,
                        )}`}
                      >
                        {p.categoryLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      <div>{p.productName}</div>
                      {p.requestedDimensions.length > 0 && (
                        <div className="text-[11px] text-slate-500">
                          Quy cách: {p.requestedDimensions.join(', ')}
                        </div>
                      )}
                    </td>
                    <td className="px-2.5 py-2 text-slate-600">{p.unit}</td>
                    <td
                      onClick={() => calc.toggleCell(`cat:${p.productCode}:l`, 'Tiếp nhận', p.leadCount)}
                      className={`px-3 py-2 text-right font-bold ${calc.cellClass(`cat:${p.productCode}:l`)}`}
                    >
                      {p.leadCount}
                    </td>
                    <td
                      onClick={() => calc.toggleCell(`cat:${p.productCode}:v`, 'Hợp lệ', p.validCount)}
                      className={`px-3 py-2 text-right font-semibold text-indigo-700 ${calc.cellClass(`cat:${p.productCode}:v`)}`}
                    >
                      {p.validCount}
                    </td>
                    <td className="px-2.5 py-2 text-right">{p.newLeadCount}</td>
                    <td className="px-2.5 py-2 text-right">{p.quotingCount}</td>
                    <td className="px-2.5 py-2 text-right">{p.quoteSentCount}</td>
                    <td className="px-2.5 py-2 text-right">
                      {p.overdueCount > 0 ? (
                        <span className="inline-flex rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 font-bold text-rose-700">
                          {p.overdueCount}
                        </span>
                      ) : (
                        '0'
                      )}
                    </td>
                    <td
                      onClick={() => calc.toggleCell(`cat:${p.productCode}:w`, 'Chốt', p.wonCount)}
                      className={`px-2.5 py-2 text-right font-semibold text-emerald-700 ${calc.cellClass(`cat:${p.productCode}:w`)}`}
                    >
                      {p.wonCount}
                    </td>
                    <td className="px-2.5 py-2 text-right text-slate-600">{p.lostCount}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800">
                      {p.winRatePct !== null ? `${p.winRatePct}%` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {p.shareOfClassifiedPct !== null ? `${p.shareOfClassifiedPct}%` : '—'}
                    </td>
                  </tr>
                ))
              )}

              {/* Dòng kiểm toán tách riêng Lead chưa gắn mã sản phẩm */}
              {activeCat === 'all' && unclassifiedRow && !searchQuery.trim() && (
                <tr className="bg-amber-50/75 font-medium text-amber-950">
                  <th
                    scope="row"
                    className="sticky left-0 z-[5] bg-amber-50 px-3.5 py-2.5 font-mono font-bold text-amber-900 whitespace-nowrap"
                  >
                    CHUA_GAN_MA
                  </th>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <span className="inline-flex rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                      Chưa chuẩn hóa
                    </span>
                  </td>
                  <td className="px-3 py-2.5 font-semibold" colSpan={2}>
                    Lead chưa chọn mã sản phẩm trên <code className="font-mono">lead_products</code>
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold">{unclassifiedRow.leadCount}</td>
                  <td className="px-3 py-2.5 text-right font-bold">{unclassifiedRow.validCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.newLeadCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.quotingCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.quoteSentCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.overdueCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.wonCount}</td>
                  <td className="px-2.5 py-2.5 text-right">{unclassifiedRow.lostCount}</td>
                  <td className="px-3 py-2.5 text-right">
                    {unclassifiedRow.winRatePct !== null ? `${unclassifiedRow.winRatePct}%` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right">—</td>
                </tr>
              )}
            </tbody>
            <tfoot className="bg-slate-100 font-bold text-slate-900">
              <tr>
                <th scope="row" className="sticky left-0 z-[5] bg-slate-100 px-3.5 py-2.5 text-left">
                  TỔNG CỘNG
                </th>
                <td colSpan={3} className="px-3 py-2.5 text-slate-600 font-normal">
                  {activeCat === 'all' ? 'Tổng toàn bộ 25 mã chuẩn + chưa gắn mã' : 'Tổng nhóm đang lọc'}
                </td>
                <td className="px-3 py-2.5 text-right">{footerTotals.leadCount}</td>
                <td className="px-3 py-2.5 text-right text-indigo-800">{footerTotals.validCount}</td>
                <td className="px-2.5 py-2.5 text-right">{footerTotals.newLeadCount}</td>
                <td className="px-2.5 py-2.5 text-right">{footerTotals.quotingCount}</td>
                <td className="px-2.5 py-2.5 text-right">{footerTotals.quoteSentCount}</td>
                <td className="px-2.5 py-2.5 text-right text-rose-700">{footerTotals.overdueCount}</td>
                <td className="px-2.5 py-2.5 text-right text-emerald-800">{footerTotals.wonCount}</td>
                <td className="px-2.5 py-2.5 text-right">{footerTotals.lostCount}</td>
                <td className="px-3 py-2.5 text-right">{footerTotals.winRateText}</td>
                <td className="px-3 py-2.5 text-right">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  );
}
