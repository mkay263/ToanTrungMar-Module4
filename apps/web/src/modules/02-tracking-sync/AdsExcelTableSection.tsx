'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Calculator,
  Check,
  ChevronDown,
  Columns3,
  Copy,
  ExternalLink,
  Globe,
  Plus,
  RotateCcw,
  Table2,
  Trash2,
} from 'lucide-react';
import { UI_VOCABULARY, type M02CampaignRowDto } from '@toantrung/contracts';

type AdsStatusFilter = 'ENABLED' | 'HAS_COST' | 'ALL';
type AdsViewMode = 'summary' | 'daily';
type FormulaOp = '/' | 'pct' | '*' | '+' | '-';
type FormulaFormat = 'number' | 'vnd' | 'percent';

type MetricColKey =
  | 'cost'
  | 'impressions'
  | 'clicks'
  | 'ctrPct'
  | 'avgCpc'
  | 'conversions'
  | 'costPerConversion'
  | 'validAttributedLeadCount'
  | 'costPerValidLead';

interface MetricFieldDef {
  key: MetricColKey;
  label: string;
  shortLabel: string;
  format: FormulaFormat;
}

const METRIC_FIELDS: MetricFieldDef[] = [
  { key: 'cost', label: 'Chi phí (Cost)', shortLabel: 'Cost', format: 'vnd' },
  { key: 'impressions', label: 'Hiển thị', shortLabel: 'Hiển thị', format: 'number' },
  { key: 'clicks', label: 'Click', shortLabel: 'Click', format: 'number' },
  { key: 'ctrPct', label: 'CTR (%)', shortLabel: 'CTR', format: 'percent' },
  { key: 'avgCpc', label: 'CPC trung bình', shortLabel: 'CPC', format: 'vnd' },
  { key: 'conversions', label: 'Chuyển đổi QC', shortLabel: 'CĐ QC', format: 'number' },
  { key: 'costPerConversion', label: 'Chi phí / CĐ', shortLabel: 'CP/CĐ', format: 'vnd' },
  { key: 'validAttributedLeadCount', label: 'Lead CRM hợp lệ', shortLabel: 'Lead CRM', format: 'number' },
  { key: 'costPerValidLead', label: 'CPL thực tế', shortLabel: 'CPL', format: 'vnd' },
];

type StandardColKey = 'link' | 'website' | 'status' | MetricColKey | 'actions';

const STANDARD_COLUMN_META: Array<{ key: StandardColKey; label: string }> = [
  { key: 'link', label: 'Link đích' },
  { key: 'website', label: 'Website nguồn' },
  { key: 'status', label: 'Trạng thái' },
  { key: 'cost', label: 'Chi phí (Cost)' },
  { key: 'impressions', label: 'Hiển thị' },
  { key: 'clicks', label: 'Click' },
  { key: 'ctrPct', label: 'CTR' },
  { key: 'avgCpc', label: 'CPC' },
  { key: 'conversions', label: 'Chuyển đổi QC' },
  { key: 'costPerConversion', label: 'Chi phí / CĐ' },
  { key: 'validAttributedLeadCount', label: 'Lead CRM hợp lệ' },
  { key: 'costPerValidLead', label: 'CPL thực tế' },
  { key: 'actions', label: 'Thao tác' },
];

const DEFAULT_VISIBLE_COLS: StandardColKey[] = [
  'link',
  'status',
  'cost',
  'impressions',
  'clicks',
  'ctrPct',
  'avgCpc',
  'conversions',
  'validAttributedLeadCount',
  'costPerValidLead',
  'actions',
];

interface CustomFormulaColumn {
  id: string;
  name: string;
  colA: MetricColKey;
  op: FormulaOp;
  bMode: 'column' | 'const';
  colB: MetricColKey;
  constB: number;
  format: FormulaFormat;
}

interface PickedCell {
  rowId: string;
  rowLabel: string;
  colKey: MetricColKey | 'custom';
  colLabel: string;
  value: number;
}

const COLS_STORAGE_KEY = 'tt_ads_visible_cols_v1';
const FORMULAS_STORAGE_KEY = 'tt_ads_custom_formulas_v1';

function formatCompactUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, '');
    const p = u.pathname === '/' ? '' : u.pathname;
    const full = `${host}${p}`;
    return full.length > 42 ? `${full.slice(0, 39)}...` : full;
  } catch {
    return rawUrl.length > 42 ? `${rawUrl.slice(0, 39)}...` : rawUrl;
  }
}

function evalBinaryOp(a: number | null, op: FormulaOp, b: number | null): number | null {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (op === '/') return b === 0 ? null : a / b;
  if (op === 'pct') return b === 0 ? null : (a / b) * 100;
  if (op === '*') return a * b;
  if (op === '+') return a + b;
  return a - b;
}

function formatComputedValue(val: number | null, fmt: FormulaFormat): string {
  if (val === null || !Number.isFinite(val)) return '—';
  if (fmt === 'vnd') return `${Math.round(val).toLocaleString('vi-VN')} ₫`;
  if (fmt === 'percent') return `${val.toFixed(2)}%`;
  return Number.isInteger(val)
    ? val.toLocaleString('vi-VN')
    : val.toLocaleString('vi-VN', { maximumFractionDigits: 2 });
}

interface TableDisplayRow {
  rowId: string;
  date?: string;
  campaign: M02CampaignRowDto;
  cost: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  avgCpc: number | null;
  conversions: number;
  costPerConversion: number | null;
  validAttributedLeadCount: number | null;
  costPerValidLead: number | null;
}

export interface AdsExcelTableSectionProps {
  campaigns: M02CampaignRowDto[];
  adsConnected: boolean;
  scopeWebsiteId: string;
  scopeDateLabel: string;
  adsScopeMode: 'all' | 'website';
  onChangeAdsScopeMode: (mode: 'all' | 'website') => void;
  searchTerm: string;
  canDirectDesign: boolean;
  briefSubmittingId: string | null;
  onCreateBrief: (c: M02CampaignRowDto) => void;
  onOpenDrawer: (c: M02CampaignRowDto) => void;
  dateFrom?: string;
  dateTo?: string;
  controlledViewMode?: AdsViewMode;
  onChangeViewMode?: (mode: AdsViewMode) => void;
}

export function AdsExcelTableSection({
  campaigns,
  adsConnected,
  scopeWebsiteId,
  scopeDateLabel,
  adsScopeMode,
  onChangeAdsScopeMode,
  searchTerm,
  canDirectDesign,
  briefSubmittingId,
  onCreateBrief,
  onOpenDrawer,
  dateFrom,
  dateTo,
  controlledViewMode,
  onChangeViewMode,
}: AdsExcelTableSectionProps) {
  const [statusFilter, setStatusFilter] = useState<AdsStatusFilter>('ENABLED');
  const [internalViewMode, setInternalViewMode] = useState<AdsViewMode>('summary');
  const viewMode: AdsViewMode = controlledViewMode ?? internalViewMode;
  const setViewMode = (next: AdsViewMode) => {
    setInternalViewMode(next);
    onChangeViewMode?.(next);
  };

  const [visibleCols, setVisibleCols] = useState<StandardColKey[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_COLS;
    try {
      const saved = window.localStorage.getItem(COLS_STORAGE_KEY);
      if (saved) {
        const arr = JSON.parse(saved) as StandardColKey[];
        if (Array.isArray(arr) && arr.length > 0) return arr;
      }
    } catch {
      // ignore
    }
    return DEFAULT_VISIBLE_COLS;
  });

  const [customFormulas, setCustomFormulas] = useState<CustomFormulaColumn[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = window.localStorage.getItem(FORMULAS_STORAGE_KEY);
      if (saved) {
        const arr = JSON.parse(saved) as CustomFormulaColumn[];
        if (Array.isArray(arr)) return arr;
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(COLS_STORAGE_KEY, JSON.stringify(visibleCols));
    } catch {
      // ignore
    }
  }, [visibleCols]);

  useEffect(() => {
    try {
      window.localStorage.setItem(FORMULAS_STORAGE_KEY, JSON.stringify(customFormulas));
    } catch {
      // ignore
    }
  }, [customFormulas]);

  const [showColMenu, setShowColMenu] = useState(false);
  const [showFormulaCreator, setShowFormulaCreator] = useState(false);
  const [openUrlsCampId, setOpenUrlsCampId] = useState<string | null>(null);

  // Formula Creator state
  const [fName, setFName] = useState('Chi phí / Click');
  const [fColA, setFColA] = useState<MetricColKey>('cost');
  const [fOp, setFOp] = useState<FormulaOp>('/');
  const [fBMode, setFBMode] = useState<'column' | 'const'>('column');
  const [fColB, setFColB] = useState<MetricColKey>('clicks');
  const [fConstB, setFConstB] = useState('1');
  const [fFormat, setFFormat] = useState<FormulaFormat>('vnd');

  // Excel interactive cell-pick calculator + multi-cell SUM/AVG + sorting + grid coordinates
  const [calcActive, setCalcActive] = useState(false);
  const [excelGridCoords, setExcelGridCoords] = useState(true);
  const [pickedList, setPickedList] = useState<PickedCell[]>([]);
  const [cellA, setCellA] = useState<PickedCell | null>(null);
  const [cellB, setCellB] = useState<PickedCell | null>(null);
  const [pickOp, setPickOp] = useState<FormulaOp>('/');
  const [copiedTableOk, setCopiedTableOk] = useState(false);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'ascending' | 'descending'>('descending');
  const [sortAnnouncement, setSortAnnouncement] = useState('');

  const textCollator = useMemo(
    () => new Intl.Collator('vi', { numeric: true, sensitivity: 'base' }),
    [],
  );

  const toggleSort = (colKey: string, colLabel: string) => {
    const nextDir: 'ascending' | 'descending' =
      sortCol === colKey && sortDir === 'descending' ? 'ascending' : 'descending';
    setSortCol(colKey);
    setSortDir(nextDir);
    setSortAnnouncement(
      `Đã sắp xếp theo ${colLabel}, ${nextDir === 'ascending' ? 'tăng dần' : 'giảm dần'}`,
    );
  };

  const enabledCount = useMemo(
    () => campaigns.filter((c) => c.status === 'ENABLED').length,
    [campaigns],
  );
  const withCostCount = useMemo(
    () => campaigns.filter((c) => c.cost > 0 || c.clicks > 0).length,
    [campaigns],
  );

  // Fallback gracefully if 'ENABLED' is empty while there ARE campaigns with cost
  const effectiveStatusFilter: AdsStatusFilter =
    statusFilter === 'ENABLED' && enabledCount === 0 && campaigns.length > 0
      ? 'HAS_COST'
      : statusFilter;

  const filteredCampaigns = useMemo(() => {
    return campaigns.filter((c) => {
      if (effectiveStatusFilter === 'ENABLED' && c.status !== 'ENABLED') return false;
      if (effectiveStatusFilter === 'HAS_COST' && c.cost <= 0 && c.clicks <= 0) return false;
      if (searchTerm) {
        const hay = [
          c.campaignName,
          c.targetWebsiteDomain || '',
          ...(c.finalUrls || []),
          c.primaryDestinationUrl || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(searchTerm)) return false;
      }
      return true;
    });
  }, [campaigns, effectiveStatusFilter, searchTerm]);

  const displayRows = useMemo<TableDisplayRow[]>(() => {
    if (viewMode === 'daily') {
      const flat: TableDisplayRow[] = [];
      for (const c of filteredCampaigns) {
        if (c.dailyRows && c.dailyRows.length > 0) {
          for (const d of c.dailyRows) {
            flat.push({
              rowId: `${c.campaignId}::${d.date}`,
              date: d.date,
              campaign: c,
              cost: d.cost,
              impressions: d.impressions,
              clicks: d.clicks,
              ctrPct: d.ctrPct,
              avgCpc: d.avgCpc,
              conversions: d.conversions,
              costPerConversion: d.conversions > 0 ? Number((d.cost / d.conversions).toFixed(0)) : null,
              validAttributedLeadCount: null,
              costPerValidLead: null,
            });
          }
        } else {
          flat.push({
            rowId: `${c.campaignId}::summary`,
            date: 'Kỳ lọc',
            campaign: c,
            cost: c.cost,
            impressions: c.impressions,
            clicks: c.clicks,
            ctrPct: c.ctrPct,
            avgCpc: c.avgCpc,
            conversions: c.conversions,
            costPerConversion: c.costPerConversion,
            validAttributedLeadCount: c.validAttributedLeadCount,
            costPerValidLead: c.costPerValidLead,
          });
        }
      }
      flat.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.cost - a.cost);
      return flat;
    }

    const sortDisplayRows = (list: TableDisplayRow[]): TableDisplayRow[] => {
      if (!sortCol) return list;
      const factor = sortDir === 'ascending' ? 1 : -1;
      return [...list].sort((a, b) => {
        if (sortCol === 'campaignName') {
          return factor * textCollator.compare(a.campaign.campaignName, b.campaign.campaignName);
        }
        if (sortCol === 'date') {
          return factor * textCollator.compare(a.date || '', b.date || '');
        }
        const va = a[sortCol as MetricColKey];
        const vb = b[sortCol as MetricColKey];
        const na = va === null || va === undefined ? -Infinity : Number(va);
        const nb = vb === null || vb === undefined ? -Infinity : Number(vb);
        return factor * (na - nb);
      });
    };

    const rows: TableDisplayRow[] = filteredCampaigns.map((c) => ({
      rowId: c.campaignId,
      campaign: c,
      cost: c.cost,
      impressions: c.impressions,
      clicks: c.clicks,
      ctrPct: c.ctrPct,
      avgCpc: c.avgCpc,
      conversions: c.conversions,
      costPerConversion: c.costPerConversion,
      validAttributedLeadCount: c.validAttributedLeadCount,
      costPerValidLead: c.costPerValidLead,
    }));

    return sortDisplayRows(rows);
  }, [filteredCampaigns, viewMode, sortCol, sortDir, textCollator]);

  const summaryTotals = useMemo(() => {
    const totalCost = filteredCampaigns.reduce((s, c) => s + c.cost, 0);
    const totalImpr = filteredCampaigns.reduce((s, c) => s + c.impressions, 0);
    const totalClicks = filteredCampaigns.reduce((s, c) => s + c.clicks, 0);
    const totalConv = Number(filteredCampaigns.reduce((s, c) => s + c.conversions, 0).toFixed(2));
    const totalValidLeads = filteredCampaigns.reduce((s, c) => s + c.validAttributedLeadCount, 0);
    return {
      cost: totalCost,
      impressions: totalImpr,
      clicks: totalClicks,
      ctrPct: totalImpr > 0 ? Number(((totalClicks / totalImpr) * 100).toFixed(2)) : null,
      avgCpc: totalClicks > 0 ? Number((totalCost / totalClicks).toFixed(0)) : null,
      conversions: totalConv,
      costPerConversion: totalConv > 0 ? Number((totalCost / totalConv).toFixed(0)) : null,
      validAttributedLeadCount: totalValidLeads,
      costPerValidLead:
        totalValidLeads > 0 && totalCost > 0 ? Number((totalCost / totalValidLeads).toFixed(0)) : null,
    };
  }, [filteredCampaigns]);

  const getRowMetric = (row: TableDisplayRow, col: MetricColKey): number | null => {
    return row[col];
  };

  const handleCellPick = (
    rowId: string,
    rowLabel: string,
    colKey: MetricColKey | 'custom',
    colLabel: string,
    val: number | null,
  ) => {
    if (!calcActive || val === null || !Number.isFinite(val)) return;
    const picked: PickedCell = { rowId, rowLabel, colKey, colLabel, value: val };
    setPickedList((prev) => {
      const exists = prev.some((p) => p.rowId === rowId && p.colKey === colKey && p.colLabel === colLabel);
      if (exists) {
        return prev.filter((p) => !(p.rowId === rowId && p.colKey === colKey && p.colLabel === colLabel));
      }
      return [...prev, picked];
    });
    if (!cellA) {
      setCellA(picked);
      setCellB(null);
      return;
    }
    if (!cellB) {
      setCellB(picked);
      return;
    }
    setCellA(picked);
    setCellB(null);
  };

  const multiPickStats = useMemo(() => {
    if (pickedList.length === 0) return null;
    const vals = pickedList.map((p) => p.value);
    const sum = vals.reduce((s, v) => s + v, 0);
    return {
      count: vals.length,
      sum,
      avg: sum / vals.length,
      min: Math.min(...vals),
      max: Math.max(...vals),
    };
  }, [pickedList]);

  const handleCopyAdsTableToExcel = async () => {
    try {
      const activeMetrics = METRIC_FIELDS.filter((mf) => isVisible(mf.key));
      const headers = [
        ...(viewMode === 'daily' ? ['Ngày'] : []),
        'Tên chiến dịch',
        ...(isVisible('website') ? ['Website'] : []),
        ...(isVisible('status') ? ['Trạng thái'] : []),
        ...activeMetrics.map((m) => m.label),
        ...customFormulas.map((cf) => cf.name),
      ];
      const rows = displayRows.map((row) => [
        ...(viewMode === 'daily' ? [row.date || ''] : []),
        row.campaign.campaignName,
        ...(isVisible('website') ? [row.campaign.targetWebsiteDomain || ''] : []),
        ...(isVisible('status') ? [row.campaign.status === 'ENABLED' ? 'Đang chạy' : 'Tạm dừng'] : []),
        ...activeMetrics.map((m) => {
          const v = getRowMetric(row, m.key);
          return v === null ? '' : v;
        }),
        ...customFormulas.map((cf) => {
          const a = getRowMetric(row, cf.colA);
          const b = cf.bMode === 'const' ? cf.constB : getRowMetric(row, cf.colB);
          const r = evalBinaryOp(a, cf.op, b);
          return r === null ? '' : Number(r.toFixed(2));
        }),
      ]);
      const tsv = [headers.join('\t'), ...rows.map((r) => r.join('\t'))].join('\n');
      await navigator.clipboard.writeText(tsv);
      setCopiedTableOk(true);
      window.setTimeout(() => setCopiedTableOk(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const addPresetFormula = (preset: {
    name: string;
    colA: MetricColKey;
    op: FormulaOp;
    bMode: 'column' | 'const';
    colB: MetricColKey;
    constB: number;
    format: FormulaFormat;
  }) => {
    setCustomFormulas((prev) => {
      if (prev.some((f) => f.name === preset.name)) return prev;
      return [...prev, { id: `cf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, ...preset }];
    });
  };

  const pickedResult = useMemo(() => {
    if (!cellA || !cellB) return null;
    return evalBinaryOp(cellA.value, pickOp, cellB.value);
  }, [cellA, cellB, pickOp]);

  const isVisible = (k: StandardColKey) => visibleCols.includes(k);

  const toggleVisibleCol = (k: StandardColKey) => {
    setVisibleCols((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  const handleCreateCustomFormula = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fName.trim()) return;
    const newCol: CustomFormulaColumn = {
      id: `cf-${Date.now()}`,
      name: fName.trim(),
      colA: fColA,
      op: fOp,
      bMode: fBMode,
      colB: fColB,
      constB: Number(fConstB) || 1,
      format: fFormat,
    };
    setCustomFormulas((prev) => [...prev, newCol]);
    setShowFormulaCreator(false);
  };

  const handleSavePickedAsColumn = () => {
    if (!cellA || !cellB || cellA.colKey === 'custom' || cellB.colKey === 'custom') return;
    const opLabel =
      pickOp === '/' ? '÷' : pickOp === 'pct' ? '%' : pickOp === '*' ? '×' : pickOp;
    const newCol: CustomFormulaColumn = {
      id: `cf-${Date.now()}`,
      name: `${cellA.colLabel} ${opLabel} ${cellB.colLabel}`,
      colA: cellA.colKey,
      op: pickOp,
      bMode: 'column',
      colB: cellB.colKey,
      constB: 1,
      format:
        pickOp === 'pct'
          ? 'percent'
          : cellA.colKey === 'cost' && pickOp === '/'
            ? 'vnd'
            : 'number',
    };
    setCustomFormulas((prev) => [...prev, newCol]);
  };

  const cellHighlightClass = (rowId: string, colKey: string) => {
    if (!calcActive) return '';
    const isA = cellA && cellA.rowId === rowId && cellA.colKey === colKey;
    const isB = cellB && cellB.rowId === rowId && cellB.colKey === colKey;
    const inMulti = pickedList.some((p) => p.rowId === rowId && p.colKey === colKey);
    if (isA && isB) return 'ring-2 ring-inset ring-amber-500 bg-amber-50/90 cursor-cell';
    if (isA) return 'ring-2 ring-inset ring-emerald-500 bg-emerald-50/90 cursor-cell';
    if (isB) return 'ring-2 ring-inset ring-violet-500 bg-violet-50/90 cursor-cell';
    if (inMulti) return 'ring-2 ring-inset ring-blue-500 bg-blue-50/90 cursor-cell';
    return 'cursor-cell hover:bg-blue-50/60';
  };

  const colSpanCount =
    1 +
    (viewMode === 'daily' ? 1 : 0) +
    STANDARD_COLUMN_META.filter((m) => isVisible(m.key)).length +
    customFormulas.length;

  return (
    <section
      className="bg-white border border-slate-200/90 rounded-[12px] shadow-2xs overflow-hidden"
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 420px' }}
    >
      {/* Thanh công cụ tổng hợp Ads đa website + Tuỳ chỉnh cột + Excel Formula */}
      <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            Chiến dịch Quảng cáo &amp; Link đích
          </h2>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[11px] font-semibold tabular-nums">
            {filteredCampaigns.length} chiến dịch · {scopeDateLabel}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Chọn gom tất cả website đang chạy hoặc chỉ web đang chọn */}
          <div
            role="group"
            aria-label="Phạm vi website phần Quảng cáo"
            className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 text-[11px]"
          >
            <button
              type="button"
              onClick={() => onChangeAdsScopeMode('all')}
              className={`px-2.5 py-1 rounded-md font-semibold transition inline-flex items-center gap-1 ${
                adsScopeMode === 'all' || scopeWebsiteId === 'all'
                  ? 'bg-[#0F275C] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Globe className="w-3 h-3" />
              <span>Tất cả web (Gộp chi phí)</span>
            </button>
            <button
              type="button"
              disabled={scopeWebsiteId === 'all'}
              onClick={() => onChangeAdsScopeMode('website')}
              title={
                scopeWebsiteId === 'all'
                  ? 'Chọn 1 website cụ thể ở thanh trên để lọc riêng từng web'
                  : `Chỉ xem chiến dịch của ${scopeWebsiteId}`
              }
              className={`px-2.5 py-1 rounded-md font-semibold transition disabled:opacity-45 ${
                adsScopeMode === 'website' && scopeWebsiteId !== 'all'
                  ? 'bg-[#0F275C] text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Chỉ web đang chọn
            </button>
          </div>

          {/* Lọc nhanh Đang chạy / Có chi phí / Tất cả */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 text-[11px]">
            {(
              [
                { id: 'ENABLED', label: `Đang chạy (${enabledCount})` },
                { id: 'HAS_COST', label: `Có phát sinh (${withCostCount})` },
                { id: 'ALL', label: `Tất cả (${campaigns.length})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setStatusFilter(opt.id)}
                className={`px-2.5 py-1 rounded-md font-semibold transition ${
                  statusFilter === opt.id
                    ? 'bg-white text-[#0F275C] shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Tổng hợp vs Theo từng ngày (Ngày | Tên chiến dịch | Cost | CTR | CPC...) */}
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200/80 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode('summary')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                viewMode === 'summary' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Tổng hợp kỳ
            </button>
            <button
              type="button"
              onClick={() => setViewMode('daily')}
              className={`px-2.5 py-1 rounded-md font-semibold transition ${
                viewMode === 'daily' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600'
              }`}
            >
              Theo từng ngày
            </button>
          </div>

          {/* Nút Chọn ô tính SUM/AVG/A÷B kiểu Excel */}
          <button
            type="button"
            aria-pressed={calcActive}
            onClick={() => {
              setCalcActive((prev) => !prev);
              if (calcActive) {
                setCellA(null);
                setCellB(null);
                setPickedList([]);
              }
            }}
            className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition ${
              calcActive
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Tính ô Excel (SUM / A÷B)</span>
          </button>

          {/* Copy thẳng bảng sang Excel / Google Sheets */}
          <button
            type="button"
            onClick={() => void handleCopyAdsTableToExcel()}
            className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 transition"
          >
            {copiedTableOk ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-emerald-700">Đã copy (Ctrl+V vào Excel)</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy bảng Excel</span>
              </>
            )}
          </button>

          {/* Bật/Tắt toạ độ cột A, B, C kiểu Excel */}
          <button
            type="button"
            aria-pressed={excelGridCoords}
            onClick={() => setExcelGridCoords((p) => !p)}
            title="Hiển thị ký hiệu cột A, B, C và số dòng như trang tính Excel"
            className={`h-8 px-2 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1 transition ${
              excelGridCoords
                ? 'bg-slate-900 border-slate-900 text-white'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Lưới A-Z</span>
          </button>

          {/* Nút thêm Cột công thức */}
          <button
            type="button"
            onClick={() => {
              setShowFormulaCreator((p) => !p);
              setShowColMenu(false);
            }}
            className="h-8 px-2.5 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#1E3A8A] text-[11px] font-semibold inline-flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Cột công thức</span>
          </button>

          {/* Menu Cột hiển thị tuỳ chỉnh */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setShowColMenu((p) => !p);
                setShowFormulaCreator(false);
              }}
              className="h-8 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1"
            >
              <Columns3 className="w-3.5 h-3.5" />
              <span>Cột</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showColMenu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowColMenu(false)} />
                <div className="absolute right-0 mt-1.5 z-40 w-56 rounded-xl border border-slate-200 bg-white shadow-xl p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <span className="font-bold text-slate-800">Tuỳ chỉnh cột hiển thị</span>
                    <button
                      type="button"
                      onClick={() => setVisibleCols(DEFAULT_VISIBLE_COLS)}
                      className="text-[11px] text-[#1E3A8A] hover:underline inline-flex items-center gap-0.5"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Mặc định
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-1">
                    {STANDARD_COLUMN_META.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-slate-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isVisible(col.key)}
                          onChange={() => toggleVisibleCol(col.key)}
                          className="rounded border-slate-300 text-[#1E3A8A]"
                        />
                        <span className="text-slate-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Form thêm Cột Công Thức (kiểu Excel = Cột A [phép tính] Cột B) + Công thức MKT cài sẵn */}
      {showFormulaCreator && (
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 space-y-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-bold text-slate-600">Công thức MKT 1 chạm:</span>
            {[
              {
                name: 'Tỷ lệ Lead/Click (%)',
                colA: 'validAttributedLeadCount' as const,
                op: 'pct' as const,
                bMode: 'column' as const,
                colB: 'clicks' as const,
                constB: 1,
                format: 'percent' as const,
              },
              {
                name: 'Tỷ lệ CĐ/Click (%)',
                colA: 'conversions' as const,
                op: 'pct' as const,
                bMode: 'column' as const,
                colB: 'clicks' as const,
                constB: 1,
                format: 'percent' as const,
              },
              {
                name: 'Dự toán tháng (×30)',
                colA: 'cost' as const,
                op: '*' as const,
                bMode: 'const' as const,
                colB: 'cost' as const,
                constB: 30,
                format: 'vnd' as const,
              },
              {
                name: 'Chi phí / 1 Hiển thị',
                colA: 'cost' as const,
                op: '/' as const,
                bMode: 'column' as const,
                colB: 'impressions' as const,
                constB: 1,
                format: 'vnd' as const,
              },
            ].map((p) => (
              <button
                key={p.name}
                type="button"
                onClick={() => addPresetFormula(p)}
                className="px-2 py-1 rounded-md bg-white border border-blue-200 hover:bg-blue-50 text-[#0F275C] text-[11px] font-semibold transition"
              >
                + {p.name}
              </button>
            ))}
          </div>
          <form onSubmit={handleCreateCustomFormula} className="flex flex-wrap items-end gap-2.5">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Tên cột mới</label>
            <input
              type="text"
              required
              value={fName}
              onChange={(e) => setFName(e.target.value)}
              placeholder="VD: Chi phí / Click"
              className="h-8 px-2.5 rounded-lg border border-slate-300 bg-white w-40 font-medium"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Ô / Cột A</label>
            <select
              value={fColA}
              onChange={(e) => setFColA(e.target.value as MetricColKey)}
              className="h-8 px-2 rounded-lg border border-slate-300 bg-white font-medium"
            >
              {METRIC_FIELDS.map((mf) => (
                <option key={mf.key} value={mf.key}>
                  {mf.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Phép tính</label>
            <select
              value={fOp}
              onChange={(e) => setFOp(e.target.value as FormulaOp)}
              className="h-8 px-2 rounded-lg border border-slate-300 bg-white font-bold"
            >
              <option value="/">÷ Chia (A / B)</option>
              <option value="pct">% Tỷ lệ (A / B × 100%)</option>
              <option value="*">× Nhân (A × B)</option>
              <option value="+">+ Cộng (A + B)</option>
              <option value="-">− Trừ (A − B)</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Chia cho / Cột B</label>
            <div className="flex items-center gap-1">
              <select
                value={fBMode}
                onChange={(e) => setFBMode(e.target.value as 'column' | 'const')}
                className="h-8 px-2 rounded-lg border border-slate-300 bg-white"
              >
                <option value="column">Theo Cột</option>
                <option value="const">Hằng số</option>
              </select>
              {fBMode === 'column' ? (
                <select
                  value={fColB}
                  onChange={(e) => setFColB(e.target.value as MetricColKey)}
                  className="h-8 px-2 rounded-lg border border-slate-300 bg-white font-medium"
                >
                  {METRIC_FIELDS.map((mf) => (
                    <option key={mf.key} value={mf.key}>
                      {mf.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="any"
                  value={fConstB}
                  onChange={(e) => setFConstB(e.target.value)}
                  className="h-8 px-2 rounded-lg border border-slate-300 bg-white w-24"
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">Định dạng</label>
            <select
              value={fFormat}
              onChange={(e) => setFFormat(e.target.value as FormulaFormat)}
              className="h-8 px-2 rounded-lg border border-slate-300 bg-white"
            >
              <option value="vnd">Tiền (₫)</option>
              <option value="percent">Phần trăm (%)</option>
              <option value="number">Số thập phân</option>
            </select>
          </div>
          <button
            type="submit"
            className="h-8 px-3.5 rounded-lg bg-[#0F275C] hover:bg-[#1E3A8A] text-white font-semibold"
          >
            Thêm cột
          </button>
          <button
            type="button"
            onClick={() => setShowFormulaCreator(false)}
            className="h-8 px-2.5 rounded-lg text-slate-500 hover:bg-slate-200"
          >
            Đóng
          </button>
        </form>
        </div>
      )}

      {/* Thanh công thức Excel (Chọn nhiều ô tính SUM/AVG/Min/Max + Chọn ô A ÷ ô B) */}
      {calcActive && (
        <div className="px-4 py-2.5 bg-blue-50/90 border-b border-blue-200 space-y-2 text-xs">
          {multiPickStats && (
            <div className="flex flex-wrap items-center gap-2 pb-1.5 border-b border-blue-200/70 text-[11px]">
              <span className="px-2 py-0.5 rounded-md bg-[#0F275C] text-white font-bold tabular-nums">
                Đã chọn {multiPickStats.count} ô
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-slate-800 tabular-nums">
                SUM: <strong>{multiPickStats.sum.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-slate-800 tabular-nums">
                AVG: <strong>{multiPickStats.avg.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}</strong>
              </span>
              <span className="px-2 py-0.5 rounded-md bg-white border border-blue-200 text-slate-600 tabular-nums">
                Min: {multiPickStats.min.toLocaleString('vi-VN', { maximumFractionDigits: 2 })} · Max:{' '}
                {multiPickStats.max.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[#0F275C] inline-flex items-center gap-1">
              <Calculator className="w-3.5 h-3.5" />
              <span>Máy tính ô Excel:</span>
            </span>

            {cellA ? (
              <span className="px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-950 font-semibold">
                Ô A: {cellA.rowLabel} · {cellA.colLabel} ={' '}
                <strong className="tabular-nums">{cellA.value.toLocaleString('vi-VN')}</strong>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white border border-dashed border-emerald-400 text-emerald-800">
                1. Bấm chọn Ô A bất kỳ trên bảng
              </span>
            )}

            <div className="inline-flex rounded-lg bg-white border border-slate-200 p-0.5">
              {(
                [
                  { id: '/', label: '÷' },
                  { id: 'pct', label: '%' },
                  { id: '*', label: '×' },
                  { id: '+', label: '+' },
                  { id: '-', label: '−' },
                ] as const
              ).map((op) => (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setPickOp(op.id)}
                  className={`w-6 h-6 rounded font-bold transition ${
                    pickOp === op.id
                      ? 'bg-[#0F275C] text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {op.label}
                </button>
              ))}
            </div>

            {cellB ? (
              <span className="px-2 py-1 rounded-lg bg-violet-100 border border-violet-300 text-violet-950 font-semibold">
                Ô B: {cellB.rowLabel} · {cellB.colLabel} ={' '}
                <strong className="tabular-nums">{cellB.value.toLocaleString('vi-VN')}</strong>
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-lg bg-white border border-dashed border-violet-400 text-violet-800">
                2. Bấm chọn Ô B bất kỳ trên bảng
              </span>
            )}

            {cellA && cellB && (
              <span className="px-3 py-1 rounded-lg bg-[#0F275C] text-white font-bold tabular-nums shadow-xs">
                ={' '}
                {pickedResult === null
                  ? 'Không chia được cho 0'
                  : pickOp === 'pct'
                    ? `${pickedResult.toFixed(2)}%`
                    : pickedResult.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {cellA && cellB && (
              <button
                type="button"
                onClick={() => {
                  setCellA(cellB);
                  setCellB(cellA);
                }}
                className="h-7 px-2 rounded-md bg-white border border-slate-300 hover:bg-slate-50 font-semibold text-slate-700"
              >
                Đảo A↔B
              </button>
            )}
            {cellA && cellB && cellA.colKey !== 'custom' && cellB.colKey !== 'custom' && (
              <button
                type="button"
                onClick={handleSavePickedAsColumn}
                className="h-7 px-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
              >
                + Lưu thành cột cho cả bảng
              </button>
            )}
            {(cellA || cellB || pickedList.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setCellA(null);
                  setCellB(null);
                  setPickedList([]);
                }}
                className="h-7 px-2 rounded-md bg-white border border-slate-200 hover:bg-slate-50 text-slate-600"
              >
                Chọn lại
              </button>
            )}
          </div>
          </div>
        </div>
      )}

      {/* Thông báo trạng thái sắp xếp cho trình đọc màn hình */}
      <div role="status" className="sr-only">
        {sortAnnouncement}
      </div>

      {/* Bảng dữ liệu chính (Hỗ trợ lưới Excel A-Z, cố định tiêu đề & cột chiến dịch, sắp xếp cột) */}
      <div
        tabIndex={0}
        role="region"
        aria-label="Bảng chiến dịch quảng cáo và link đích kiểu Excel"
        className="overflow-x-auto max-h-[72vh]"
      >
        <table
          className={`w-full min-w-[1060px] text-left border-separate border-spacing-0 text-xs ${
            excelGridCoords ? '[&_td]:border-r [&_td]:border-b [&_td]:border-slate-200/80 [&_th]:border-r [&_th]:border-b [&_th]:border-slate-200' : ''
          }`}
        >
          <thead className="bg-slate-100 text-slate-700 sticky top-0 z-20 shadow-[0_1px_0_#CBD5E1]">
            {excelGridCoords && (() => {
              const totalCols =
                (viewMode === 'daily' ? 1 : 0) +
                1 +
                (isVisible('link') ? 1 : 0) +
                (isVisible('website') ? 1 : 0) +
                (isVisible('status') ? 1 : 0) +
                METRIC_FIELDS.filter((mf) => isVisible(mf.key)).length +
                customFormulas.length +
                (isVisible('actions') ? 1 : 0);
              return (
                <tr className="bg-slate-200/80 text-[10px] font-mono text-slate-500 select-none">
                  <th className="py-1 px-2 text-center w-9 bg-slate-200 sticky left-0 z-30">#</th>
                  {Array.from({ length: totalCols }, (_, i) => {
                    let temp = i;
                    let letter = '';
                    while (temp >= 0) {
                      letter = String.fromCharCode((temp % 26) + 65) + letter;
                      temp = Math.floor(temp / 26) - 1;
                    }
                    return (
                      <th key={`xl-${letter}`} className="py-1 px-2 text-center font-bold">
                        {letter}
                      </th>
                    );
                  })}
                </tr>
              );
            })()}
            <tr>
              {excelGridCoords && (
                <th scope="col" className="py-2.5 px-2 text-center font-mono text-[11px] text-slate-500 bg-slate-100 sticky left-0 z-30 w-9">
                  STT
                </th>
              )}
              {viewMode === 'daily' && (
                <th
                  scope="col"
                  aria-sort={sortCol === 'date' ? sortDir : undefined}
                  className="p-0 font-semibold whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort('date', 'Ngày')}
                    className="w-full min-h-9 py-2 px-3 inline-flex items-center gap-1 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
                  >
                    <span>Ngày</span>
                    {sortCol === 'date' ? (
                      sortDir === 'ascending' ? <ArrowUp aria-hidden="true" className="w-3 h-3" /> : <ArrowDown aria-hidden="true" className="w-3 h-3" />
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
              )}
              <th
                scope="col"
                aria-sort={sortCol === 'campaignName' ? sortDir : undefined}
                className="p-0 font-semibold"
              >
                <button
                  type="button"
                  onClick={() => toggleSort('campaignName', 'Tên chiến dịch')}
                  className="w-full min-h-9 py-2 px-4 inline-flex items-center gap-1 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
                >
                  <span>Tên chiến dịch</span>
                  {sortCol === 'campaignName' ? (
                    sortDir === 'ascending' ? <ArrowUp aria-hidden="true" className="w-3 h-3" /> : <ArrowDown aria-hidden="true" className="w-3 h-3" />
                  ) : (
                    <ArrowUpDown aria-hidden="true" className="w-3 h-3 opacity-40" />
                  )}
                </button>
              </th>
              {isVisible('link') && (
                <th scope="col" className="py-2.5 px-3 font-semibold">
                  Link đích chiến dịch
                </th>
              )}
              {isVisible('website') && (
                <th scope="col" className="py-2.5 px-3 font-semibold">
                  Website nguồn
                </th>
              )}
              {isVisible('status') && (
                <th scope="col" className="py-2.5 px-3 font-semibold">
                  Trạng thái
                </th>
              )}
              {METRIC_FIELDS.filter((mf) => isVisible(mf.key)).map((mf) => (
                <th
                  key={mf.key}
                  scope="col"
                  aria-sort={sortCol === mf.key ? sortDir : undefined}
                  className="p-0 font-semibold text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(mf.key, mf.shortLabel)}
                    className="w-full min-h-9 py-2 px-3 inline-flex items-center justify-end gap-1 hover:bg-slate-200/70 focus-visible:outline-2 focus-visible:outline-[#1E3A8A]"
                  >
                    <span>{mf.shortLabel}</span>
                    {sortCol === mf.key ? (
                      sortDir === 'ascending' ? <ArrowUp aria-hidden="true" className="w-3 h-3 text-[#1E3A8A]" /> : <ArrowDown aria-hidden="true" className="w-3 h-3 text-[#1E3A8A]" />
                    ) : (
                      <ArrowUpDown aria-hidden="true" className="w-3 h-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
              {customFormulas.map((cf) => (
                <th
                  key={cf.id}
                  scope="col"
                  className="py-2.5 px-3 font-semibold text-right whitespace-nowrap bg-blue-50/50 text-[#0F275C]"
                >
                  <div className="inline-flex items-center justify-end gap-1">
                    <span>{cf.name}</span>
                    <button
                      type="button"
                      title="Xóa cột công thức"
                      onClick={() => setCustomFormulas((prev) => prev.filter((x) => x.id !== cf.id))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
              {isVisible('actions') && (
                <th scope="col" className="py-2.5 px-4 font-semibold text-right">
                  Thao tác
                </th>
              )}
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={colSpanCount + (excelGridCoords ? 1 : 0)} className="py-10 px-4 text-center text-slate-500">
                  {adsConnected
                    ? effectiveStatusFilter === 'ENABLED'
                      ? 'Không có chiến dịch đang chạy phát sinh số liệu trong phạm vi chọn.'
                      : 'Chưa có chiến dịch phát sinh số liệu trong phạm vi đang chọn.'
                    : 'Chưa kết nối tài khoản Google Ads API — hệ thống không tạo chiến dịch hoặc chi phí mẫu.'}
                </td>
              </tr>
            ) : (
              displayRows.map((row, rowIndex) => {
                const c = row.campaign;
                const rowLabel = viewMode === 'daily' ? `${c.campaignName} (${row.date})` : c.campaignName;
                const realUrls = c.finalUrls || [];
                const displayUrl = realUrls[0] || c.primaryDestinationUrl || null;
                const isDomainFallback = realUrls.length === 0 && Boolean(c.targetWebsiteDomain);

                return (
                  <tr key={row.rowId} className="odd:bg-white even:bg-slate-50/40 hover:bg-blue-50/30">
                    {excelGridCoords && (
                      <td className="py-2 px-2 text-center font-mono text-[11px] text-slate-400 bg-slate-50 sticky left-0 z-10 tabular-nums">
                        {rowIndex + 1}
                      </td>
                    )}
                    {viewMode === 'daily' && (
                      <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap tabular-nums">
                        {row.date}
                      </td>
                    )}
                    <th scope="row" className="py-2.5 px-4 font-semibold text-slate-900 min-w-[190px]">
                      <div className="flex items-center gap-1.5">
                        <span>{c.campaignName}</span>
                      </div>
                      <div className="text-[11px] font-normal text-slate-500 mt-0.5">
                        {c.attributionNote}
                      </div>
                    </th>

                    {isVisible('link') && (
                      <td className="py-2.5 px-3 max-w-[260px]">
                        {displayUrl ? (
                          <div className="flex flex-wrap items-center gap-1.5 relative">
                            <a
                              href={displayUrl}
                              target="_blank"
                              rel="noreferrer"
                              title={
                                isDomainFallback
                                  ? `${displayUrl} (Website nhận diện từ chiến dịch)`
                                  : displayUrl
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-mono max-w-[215px] truncate ${
                                isDomainFallback
                                  ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                  : 'bg-blue-50/80 border-blue-200 text-[#1E3A8A] hover:bg-blue-100'
                              }`}
                            >
                              <span className="truncate">{formatCompactUrl(displayUrl)}</span>
                              <ExternalLink className="w-3 h-3 shrink-0" />
                            </a>
                            {realUrls.length > 1 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenUrlsCampId((p) => (p === row.rowId ? null : row.rowId))
                                }
                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700"
                              >
                                +{realUrls.length - 1}
                              </button>
                            )}
                            {openUrlsCampId === row.rowId && realUrls.length > 1 && (
                              <div className="absolute left-0 top-full mt-1 z-30 w-80 rounded-xl border border-slate-200 bg-white shadow-xl p-2.5 space-y-1">
                                <div className="text-[10px] font-bold text-slate-500 uppercase">
                                  Tất cả link đích ({realUrls.length})
                                </div>
                                {realUrls.map((u) => (
                                  <a
                                    key={u}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block text-[11px] font-mono text-[#1E3A8A] hover:underline truncate"
                                    title={u}
                                  >
                                    {u}
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Chưa gắn link đích</span>
                        )}
                      </td>
                    )}

                    {isVisible('website') && (
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap">
                        {c.targetWebsiteDomain || 'Đa website'}
                      </td>
                    )}

                    {isVisible('status') && (
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            c.status === 'ENABLED'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {c.status === 'ENABLED' ? 'Đang chạy' : 'Tạm dừng'}
                        </span>
                      </td>
                    )}

                    {METRIC_FIELDS.filter((mf) => isVisible(mf.key)).map((mf) => {
                      const val = getRowMetric(row, mf.key);
                      return (
                        <td
                          key={mf.key}
                          onClick={() => handleCellPick(row.rowId, rowLabel, mf.key, mf.shortLabel, val)}
                          className={`py-2.5 px-3 text-right tabular-nums whitespace-nowrap ${
                            mf.key === 'cost' ? 'font-semibold text-slate-900' : ''
                          } ${mf.key === 'validAttributedLeadCount' ? 'font-bold text-[#0F275C]' : ''} ${cellHighlightClass(
                            row.rowId,
                            mf.key,
                          )}`}
                        >
                          {val === null
                            ? '—'
                            : mf.format === 'vnd'
                              ? `${Math.round(val).toLocaleString('vi-VN')} ₫`
                              : mf.format === 'percent'
                                ? `${val}%`
                                : Number.isInteger(val)
                                  ? val.toLocaleString('vi-VN')
                                  : val.toFixed(2)}
                        </td>
                      );
                    })}

                    {customFormulas.map((cf) => {
                      const a = getRowMetric(row, cf.colA);
                      const b = cf.bMode === 'const' ? cf.constB : getRowMetric(row, cf.colB);
                      const res = evalBinaryOp(a, cf.op, b);
                      return (
                        <td
                          key={cf.id}
                          onClick={() => handleCellPick(row.rowId, rowLabel, 'custom', cf.name, res)}
                          className={`py-2.5 px-3 text-right tabular-nums whitespace-nowrap bg-blue-50/25 font-semibold text-[#0F275C] ${cellHighlightClass(
                            row.rowId,
                            'custom',
                          )}`}
                        >
                          {formatComputedValue(res, cf.format)}
                        </td>
                      );
                    })}

                    {isVisible('actions') && (
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          {canDirectDesign ? (
                            <Link
                              href={`/design?fromBrief=1&taskCode=banner_generate&sourceModule=tracking&websiteId=${encodeURIComponent(c.targetWebsiteDomain || scopeWebsiteId || 'all')}&campaignId=${encodeURIComponent(c.campaignId)}&campaignName=${encodeURIComponent(c.campaignName)}${dateFrom && dateTo ? `&dateFrom=${encodeURIComponent(dateFrom)}&dateTo=${encodeURIComponent(dateTo)}` : ''}`}
                              className="min-h-7 px-2 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#1E3A8A] font-semibold inline-flex items-center"
                              title="Mở Brief thiết kế gắn chiến dịch & phạm vi ngày đang xem"
                            >
                              Tạo brief
                            </Link>
                          ) : (
                            <button
                              type="button"
                              disabled={briefSubmittingId === c.campaignId}
                              onClick={() => onCreateBrief(c)}
                              className="min-h-7 px-2 rounded-lg border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-[#1E3A8A] font-semibold inline-flex items-center disabled:opacity-50"
                            >
                              {briefSubmittingId === c.campaignId ? 'Đang gửi...' : 'Tạo brief'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onOpenDrawer(c)}
                            className="min-h-7 px-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-[#1E3A8A] font-semibold"
                          >
                            {UI_VOCABULARY.actions.viewDetails}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>

          {filteredCampaigns.length > 0 && (
            <tfoot className="bg-blue-50/90 border-t-2 border-[#1E3A8A]/40 font-bold text-[#0F275C] sticky bottom-0 z-10">
              <tr>
                {excelGridCoords && (
                  <td className="py-2.5 px-2 text-center font-mono text-[11px] bg-blue-100/80 sticky left-0 z-20">
                    Σ
                  </td>
                )}
                {viewMode === 'daily' && <td className="py-2.5 px-3">Tổng</td>}
                <td className="py-2.5 px-4">
                  Tổng ({filteredCampaigns.length} chiến dịch)
                </td>
                {isVisible('link') && <td className="py-2.5 px-3 text-slate-400 font-normal">—</td>}
                {isVisible('website') && <td className="py-2.5 px-3 text-slate-400 font-normal">—</td>}
                {isVisible('status') && <td className="py-2.5 px-3 text-slate-400 font-normal">—</td>}
                {METRIC_FIELDS.filter((mf) => isVisible(mf.key)).map((mf) => {
                  const val = summaryTotals[mf.key];
                  return (
                    <td
                      key={`tot-${mf.key}`}
                      onClick={() => handleCellPick('__TOTAL__', 'Dòng Tổng', mf.key, mf.shortLabel, val)}
                      className={`py-2.5 px-3 text-right tabular-nums whitespace-nowrap ${cellHighlightClass(
                        '__TOTAL__',
                        mf.key,
                      )}`}
                    >
                      {val === null
                        ? '—'
                        : mf.format === 'vnd'
                          ? `${Math.round(val).toLocaleString('vi-VN')} ₫`
                          : mf.format === 'percent'
                            ? `${val}%`
                            : Number.isInteger(val)
                              ? val.toLocaleString('vi-VN')
                              : val.toFixed(2)}
                    </td>
                  );
                })}
                {customFormulas.map((cf) => {
                  const a = summaryTotals[cf.colA];
                  const b = cf.bMode === 'const' ? cf.constB : summaryTotals[cf.colB];
                  const res = evalBinaryOp(a, cf.op, b);
                  return (
                    <td
                      key={`tot-${cf.id}`}
                      onClick={() => handleCellPick('__TOTAL__', 'Dòng Tổng', 'custom', cf.name, res)}
                      className={`py-2.5 px-3 text-right tabular-nums whitespace-nowrap bg-blue-50/60 text-[#0F275C] ${cellHighlightClass(
                        '__TOTAL__',
                        'custom',
                      )}`}
                    >
                      {formatComputedValue(res, cf.format)}
                    </td>
                  );
                })}
                {isVisible('actions') && <td className="py-2.5 px-4" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
