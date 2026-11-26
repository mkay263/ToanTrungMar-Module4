import crypto from 'node:crypto';
import { prisma } from '@toantrung/database';
import type {
  M04ExcelImportBatchDto,
  M04ExcelImportPreviewDto,
  M04ExcelImportRowDto,
  M04ProductCategoryGroup,
  M04ReportGranularity,
  SessionUserDto,
} from '@toantrung/contracts';
import { bumpDomainRevisions } from '../../core/cache/server-data-cache';
import {
  parseCsvBufferToGrid,
  parseNumericCell,
  parseXlsxSheetsToGrids,
} from '../../app/api/v1/ads/export/spreadsheet-parser';
import { getM04ResultsReportSpec } from './m04-spec.service';

export const M04_EXCEL_IMPORT_SETTING_KEY = 'm04_excel_import_batches_v1';
export const M04_MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const MAX_SAVED_BATCHES = 25;

const CATEGORY_LABELS: Record<M04ProductCategoryGroup, string> = {
  led_screen: 'Màn hình LED',
  electronic_board: 'Bảng điện tử',
  other: 'Nhu cầu khác',
  unclassified: 'Chưa gắn mã sản phẩm',
};

function normalizeHeaderText(raw: string | undefined): string {
  return (raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeProductLookup(raw: string | undefined): string {
  return normalizeHeaderText(raw).replace(/\s+/g, ' ');
}

function normalizeGranularity(raw?: string | null): M04ReportGranularity {
  const c = String(raw || '').trim().toLowerCase();
  if (c === 'day' || c === 'week' || c === 'month' || c === 'year') return c;
  return 'month';
}

interface DetectedColumnMap {
  headerRowIdx: number;
  productCodeCol: number;
  productNameCol: number;
  periodCol: number;
  leadCol: number;
  validCol: number;
  quotedCol: number;
  wonCol: number;
  adCostCol: number;
  noteCol: number;
  prohibitedRevenueCols: string[];
  strippedPiiCols: string[];
}

function detectHeaderMapping(grid: string[][]): DetectedColumnMap | null {
  const maxScan = Math.min(grid.length, 25);
  for (let r = 0; r < maxScan; r++) {
    const row = grid[r] || [];
    let productCodeCol = -1;
    let productNameCol = -1;
    let periodCol = -1;
    let leadCol = -1;
    let validCol = -1;
    let quotedCol = -1;
    let wonCol = -1;
    let adCostCol = -1;
    let noteCol = -1;
    const prohibitedRevenueCols: string[] = [];
    const strippedPiiCols: string[] = [];

    for (let c = 0; c < row.length; c++) {
      const rawCell = (row[c] || '').trim();
      const norm = normalizeHeaderText(rawCell);
      if (!norm) continue;

      if (
        norm.includes('doanh thu') ||
        norm.includes('gia ban') ||
        norm.includes('loi nhuan') ||
        norm === 'roas' ||
        norm.includes('revenue') ||
        norm.includes('profit')
      ) {
        prohibitedRevenueCols.push(rawCell);
        continue;
      }
      if (
        norm === 'sdt' ||
        norm.includes('so dien thoai') ||
        norm.includes('phone') ||
        norm === 'email'
      ) {
        strippedPiiCols.push(rawCell);
        continue;
      }

      if (
        productCodeCol === -1 &&
        (norm === 'ma sp' ||
          norm === 'ma san pham' ||
          norm === 'ma mat hang' ||
          norm === 'product code' ||
          norm === 'code')
      ) {
        productCodeCol = c;
      } else if (
        productNameCol === -1 &&
        (norm === 'ten san pham' ||
          norm === 'ten mat hang' ||
          norm === 'san pham' ||
          norm === 'mat hang' ||
          norm === 'product name' ||
          norm === 'product')
      ) {
        productNameCol = c;
      } else if (
        periodCol === -1 &&
        (norm === 'ky bao cao' ||
          norm === 'ky' ||
          norm === 'moc thoi gian' ||
          norm === 'ngay' ||
          norm === 'thang' ||
          norm === 'nam' ||
          norm === 'period')
      ) {
        periodCol = c;
      } else if (
        leadCol === -1 &&
        (norm === 'tong lead' ||
          norm === 'lead quan tam' ||
          norm === 'tiep nhan' ||
          norm === 'lead tiep nhan' ||
          norm === 'so lead' ||
          norm === 'leads')
      ) {
        leadCol = c;
      } else if (
        validCol === -1 &&
        (norm === 'lead hop le' || norm === 'hop le' || norm === 'valid leads')
      ) {
        validCol = c;
      } else if (
        quotedCol === -1 &&
        (norm === 'da bao gia' ||
          norm === 'da gui bao gia' ||
          norm === 'da gui bg' ||
          norm === 'bao gia' ||
          norm === 'quoted')
      ) {
        quotedCol = c;
      } else if (
        wonCol === -1 &&
        (norm === 'chot thanh cong' ||
          norm === 'chot don' ||
          norm === 'chot' ||
          norm === 'won')
      ) {
        wonCol = c;
      } else if (
        adCostCol === -1 &&
        (norm.includes('chi phi ads') ||
          norm.includes('chi phi quang cao') ||
          norm === 'ad cost' ||
          norm === 'spend')
      ) {
        adCostCol = c;
      } else if (
        noteCol === -1 &&
        (norm === 'ghi chu' || norm === 'note' || norm === 'nguyen nhan')
      ) {
        noteCol = c;
      }
    }

    const hasProductKey = productCodeCol !== -1 || productNameCol !== -1;
    const hasAnyMetric = leadCol !== -1 || validCol !== -1 || quotedCol !== -1 || wonCol !== -1;
    if (hasProductKey && hasAnyMetric) {
      return {
        headerRowIdx: r,
        productCodeCol,
        productNameCol,
        periodCol,
        leadCol,
        validCol,
        quotedCol,
        wonCol,
        adCostCol,
        noteCol,
        prohibitedRevenueCols,
        strippedPiiCols,
      };
    }
  }
  return null;
}

function isSummaryRow(code: string, name: string): boolean {
  const combined = normalizeHeaderText(`${code} ${name}`);
  return (
    combined.startsWith('tong cong') ||
    combined === 'tong' ||
    combined.startsWith('cong toan') ||
    combined.startsWith('total')
  );
}

function isFooterDisclaimerRow(code: string, name: string, cols: string[], mapping: DetectedColumnMap): boolean {
  const normCode = normalizeHeaderText(code);
  const allMetricCellsEmpty = [
    mapping.leadCol,
    mapping.validCol,
    mapping.quotedCol,
    mapping.wonCol,
  ]
    .filter((idx) => idx !== -1)
    .every((idx) => !(cols[idx] || '').trim());

  if (allMetricCellsEmpty && !name && code.length > 48) {
    return true;
  }
  return (
    allMetricCellsEmpty &&
    (normCode.startsWith('ghi chu') ||
      normCode.startsWith('luu y') ||
      normCode.startsWith('chinh sua so lieu') ||
      normCode.startsWith('cong thuc excel') ||
      normCode.startsWith('dong chua gan ma'))
  );
}

function parseUploadedWorkbook(
  buffer: Buffer,
  fileName: string,
): { grid: string[][]; mapping: DetectedColumnMap; sheetName: string } {
  const lower = fileName.toLowerCase();
  const isZipXlsx =
    lower.endsWith('.xlsx') ||
    (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b);

  if (isZipXlsx) {
    const sheets = parseXlsxSheetsToGrids(buffer);
    if (sheets.length === 0) {
      throw new Error('Không đọc được trang tính nào trong tệp .xlsx. Vui lòng kiểm tra lại định dạng file Excel.');
    }
    // Prefer a sheet whose header matches our import template (`ma_san_pham` / `Mã SP` / `Tên mặt hàng`)
    let best: { grid: string[][]; mapping: DetectedColumnMap; sheetIdx: number; score: number } | null = null;
    for (let i = 0; i < sheets.length; i++) {
      const m = detectHeaderMapping(sheets[i]);
      if (!m) continue;
      const score =
        (m.productCodeCol !== -1 ? 4 : 0) +
        (m.periodCol !== -1 ? 3 : 0) +
        (m.leadCol !== -1 ? 2 : 0) +
        (m.wonCol !== -1 ? 1 : 0);
      if (!best || score > best.score) {
        best = { grid: sheets[i], mapping: m, sheetIdx: i, score };
      }
    }
    if (!best) {
      throw new Error(
        'Không tìm thấy dòng tiêu đề hợp lệ trong tệp Excel (cần ít nhất cột "Mã SP" hoặc "Tên sản phẩm" và cột "Tổng Lead" / "Chốt thành công"). Hãy tải File Mẫu Import để đúng chuẩn.',
      );
    }
    return {
      grid: best.grid,
      mapping: best.mapping,
      sheetName: `Sheet${best.sheetIdx + 1}`,
    };
  }

  const csvGrid = parseCsvBufferToGrid(buffer);
  const mapping = detectHeaderMapping(csvGrid);
  if (!mapping) {
    throw new Error(
      'Không tìm thấy dòng tiêu đề hợp lệ trong tệp CSV (cần cột ma_san_pham/ten_san_pham và tong_lead/chot_thanh_cong).',
    );
  }
  return {
    grid: csvGrid,
    mapping,
    sheetName: 'CSV',
  };
}

export async function previewReportExcelImport(
  user: SessionUserDto,
  input: {
    buffer: Buffer;
    fileName: string;
    granularity?: string | null;
    websiteId?: string | null;
    preset?: string | null;
    from?: string | null;
    to?: string | null;
  },
): Promise<M04ExcelImportPreviewDto> {
  if (!input.buffer || input.buffer.length === 0) {
    throw new Error('Tệp tải lên đang trống.');
  }
  if (input.buffer.length > M04_MAX_IMPORT_FILE_BYTES) {
    throw new Error('Tệp Excel/CSV vượt quá giới hạn tối đa 10 MB.');
  }

  const granularity = normalizeGranularity(input.granularity);
  const { grid, mapping, sheetName } = parseUploadedWorkbook(input.buffer, input.fileName);

  const [activeProducts, liveSpec] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ categoryGroup: 'asc' }, { id: 'asc' }],
    }),
    getM04ResultsReportSpec(user, {
      websiteId: input.websiteId || 'all',
      preset: input.preset || '30D',
      from: input.from || undefined,
      to: input.to || undefined,
      granularity,
      bypassCache: true,
    }),
  ]);

  const byCode = new Map(activeProducts.map((p) => [p.productCode.trim().toUpperCase(), p]));
  const byNormName = new Map(activeProducts.map((p) => [normalizeProductLookup(p.productName), p]));
  const liveCatalogByCode = new Map(
    (liveSpec.tables.byProductCatalog || []).map((row) => [row.productCode.toUpperCase(), row]),
  );

  const warnings: string[] = [];
  if (mapping.prohibitedRevenueCols.length > 0) {
    warnings.push(
      `Đã tự động bỏ qua cột tài chính không thuộc phạm vi BA (Q08): ${mapping.prohibitedRevenueCols.join(', ')}.`,
    );
  }
  if (mapping.strippedPiiCols.length > 0) {
    warnings.push(
      `Đã tự động bỏ qua cột thông tin liên hệ cá nhân (PII): ${mapping.strippedPiiCols.join(', ')}.`,
    );
  }

  const rows: M04ExcelImportRowDto[] = [];
  const dataRows = grid.slice(mapping.headerRowIdx + 1);
  if (dataRows.length > MAX_IMPORT_ROWS) {
    warnings.push(`Tệp có ${dataRows.length} dòng; hệ thống giới hạn đọc ${MAX_IMPORT_ROWS} dòng đầu tiên.`);
  }

  const limit = Math.min(dataRows.length, MAX_IMPORT_ROWS);
  const defaultPeriodLabel = `${liveSpec.scope.startDate} → ${liveSpec.scope.endDate}`;

  for (let i = 0; i < limit; i++) {
    const cols = dataRows[i] || [];
    const rawProductCode =
      mapping.productCodeCol !== -1 ? (cols[mapping.productCodeCol] || '').trim() : '';
    const rawProductName =
      mapping.productNameCol !== -1 ? (cols[mapping.productNameCol] || '').trim() : '';

    if (!rawProductCode && !rawProductName) continue;
    if (isSummaryRow(rawProductCode, rawProductName)) break;
    if (isFooterDisclaimerRow(rawProductCode, rawProductName, cols, mapping)) continue;

    const periodLabel =
      (mapping.periodCol !== -1 ? (cols[mapping.periodCol] || '').trim() : '') || defaultPeriodLabel;
    const importedLeadCount = Math.round(
      mapping.leadCol !== -1 ? parseNumericCell(cols[mapping.leadCol]) : 0,
    );
    const importedValidCountRaw =
      mapping.validCol !== -1 && (cols[mapping.validCol] || '').trim() !== ''
        ? Math.round(parseNumericCell(cols[mapping.validCol]))
        : importedLeadCount;
    const importedValidCount = Math.min(importedLeadCount, importedValidCountRaw);
    const importedQuotedCount = Math.round(
      mapping.quotedCol !== -1 ? parseNumericCell(cols[mapping.quotedCol]) : 0,
    );
    const importedWonCount = Math.round(
      mapping.wonCol !== -1 ? parseNumericCell(cols[mapping.wonCol]) : 0,
    );
    const importedAdCost =
      mapping.adCostCol !== -1 && (cols[mapping.adCostCol] || '').trim() !== ''
        ? Math.round(parseNumericCell(cols[mapping.adCostCol]))
        : null;
    const note = mapping.noteCol !== -1 ? (cols[mapping.noteCol] || '').trim().slice(0, 240) : '';

    const upperCode = rawProductCode.toUpperCase();
    const normName = normalizeProductLookup(rawProductName);
    const isUnclassifiedAlias =
      upperCode === 'CHUA_GAN_MA' ||
      normName.includes('chua phan loai') ||
      normName.includes('chua gan ma');

    let matchedProductId: number | null = null;
    let matchedProductCode: string | null = null;
    let matchedProductName: string | null = null;
    let categoryGroup: M04ProductCategoryGroup | null = null;
    let categoryLabel: string | null = null;

    if (isUnclassifiedAlias) {
      matchedProductId = 0;
      matchedProductCode = 'CHUA_GAN_MA';
      matchedProductName = 'Chưa phân loại sản phẩm';
      categoryGroup = 'unclassified';
      categoryLabel = CATEGORY_LABELS.unclassified;
    } else {
      const hit =
        (upperCode ? byCode.get(upperCode) : undefined) ||
        (normName ? byNormName.get(normName) : undefined) ||
        null;
      if (hit) {
        const cg: M04ProductCategoryGroup =
          hit.categoryGroup === 'led_screen' ||
          hit.categoryGroup === 'electronic_board' ||
          hit.categoryGroup === 'other'
            ? hit.categoryGroup
            : 'other';
        matchedProductId = hit.id;
        matchedProductCode = hit.productCode;
        matchedProductName = hit.productName;
        categoryGroup = cg;
        categoryLabel = CATEGORY_LABELS[cg];
      }
    }

    const crmHit = matchedProductCode ? liveCatalogByCode.get(matchedProductCode) : undefined;
    const crmLeadCount = crmHit?.leadCount ?? 0;
    const crmValidCount = crmHit?.validCount ?? 0;
    const crmQuotedCount = crmHit?.quotedCount ?? 0;
    const crmWonCount = crmHit?.wonCount ?? 0;

    const deltaLead = importedLeadCount - crmLeadCount;
    const deltaValid = importedValidCount - crmValidCount;
    const deltaQuoted = importedQuotedCount - crmQuotedCount;
    const deltaWon = importedWonCount - crmWonCount;

    let status: 'valid' | 'warning' | 'error' = 'valid';
    let message = 'Khớp chuẩn 25 mặt hàng Toàn Trung';

    if (matchedProductCode === null) {
      status = 'error';
      message = `Không khớp mã/tên trong 25 mặt hàng Toàn Trung ("${rawProductCode || rawProductName}")`;
    } else if (importedWonCount > importedLeadCount) {
      status = 'error';
      message = `Số chốt thành công (${importedWonCount}) lớn hơn Tổng Lead (${importedLeadCount})`;
    } else if (deltaLead !== 0 || deltaWon !== 0) {
      status = 'warning';
      message = `Hợp lệ · Chênh lệch với CRM (${deltaLead >= 0 ? '+' : ''}${deltaLead} Lead, ${deltaWon >= 0 ? '+' : ''}${deltaWon} Chốt)`;
    } else if (mapping.prohibitedRevenueCols.length > 0) {
      status = 'warning';
      message = 'Khớp 100% CRM · Đã loại cột doanh thu (Q08)';
    } else {
      message = 'Khớp 100% số liệu CRM DB';
    }

    rows.push({
      rowNumber: mapping.headerRowIdx + 2 + i,
      rawProductCode,
      rawProductName,
      matchedProductId,
      matchedProductCode,
      matchedProductName,
      categoryGroup,
      categoryLabel,
      periodLabel,
      importedLeadCount,
      importedValidCount,
      importedQuotedCount,
      importedWonCount,
      importedAdCost,
      note,
      crmLeadCount,
      crmValidCount,
      crmQuotedCount,
      crmWonCount,
      deltaLead,
      deltaValid,
      deltaQuoted,
      deltaWon,
      status,
      message,
    });
  }

  const validRows = rows.filter((r) => r.status === 'valid').length;
  const warningRows = rows.filter((r) => r.status === 'warning').length;
  const errorRows = rows.filter((r) => r.status === 'error').length;
  const acceptedRows = rows.filter((r) => r.status !== 'error');

  return {
    fileName: input.fileName,
    sheetName,
    granularity,
    scopePeriod: {
      startDate: liveSpec.scope.startDate,
      endDate: liveSpec.scope.endDate,
      websiteId: liveSpec.scope.websiteId,
      websiteLabel: liveSpec.scope.websiteLabel,
    },
    warnings,
    summary: {
      totalRows: rows.length,
      validRows,
      warningRows,
      errorRows,
      importedTotalLeads: acceptedRows.reduce((s, r) => s + r.importedLeadCount, 0),
      importedTotalWon: acceptedRows.reduce((s, r) => s + r.importedWonCount, 0),
      crmTotalLeads: acceptedRows.reduce((s, r) => s + r.crmLeadCount, 0),
      crmTotalWon: acceptedRows.reduce((s, r) => s + r.crmWonCount, 0),
    },
    rows,
  };
}

async function readStoredImportBatches(): Promise<M04ExcelImportBatchDto[]> {
  const row = await prisma.systemSetting.findUnique({
    where: { key: M04_EXCEL_IMPORT_SETTING_KEY },
  });
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as M04ExcelImportBatchDto[]) : [];
  } catch {
    return [];
  }
}

async function writeStoredImportBatches(batches: M04ExcelImportBatchDto[]): Promise<void> {
  const trimmed = batches.slice(0, MAX_SAVED_BATCHES);
  await prisma.systemSetting.upsert({
    where: { key: M04_EXCEL_IMPORT_SETTING_KEY },
    create: {
      key: M04_EXCEL_IMPORT_SETTING_KEY,
      value: JSON.stringify(trimmed),
    },
    update: {
      value: JSON.stringify(trimmed),
    },
  });
}

export async function commitReportExcelImport(
  user: SessionUserDto,
  input: {
    buffer: Buffer;
    fileName: string;
    granularity?: string | null;
    websiteId?: string | null;
    preset?: string | null;
    from?: string | null;
    to?: string | null;
  },
): Promise<M04ExcelImportBatchDto> {
  const preview = await previewReportExcelImport(user, input);
  const acceptedRows = preview.rows.filter((r) => r.status !== 'error');
  if (acceptedRows.length === 0) {
    throw new Error(
      'Không có dòng dữ liệu hợp lệ nào khớp 25 mặt hàng Toàn Trung để lưu bản đối soát.',
    );
  }

  const batch: M04ExcelImportBatchDto = {
    id: `imp_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    fileName: preview.fileName,
    sheetName: preview.sheetName,
    granularity: preview.granularity,
    periodLabel: `${preview.scopePeriod.startDate} → ${preview.scopePeriod.endDate}`,
    scopeStartDate: preview.scopePeriod.startDate,
    scopeEndDate: preview.scopePeriod.endDate,
    websiteId: preview.scopePeriod.websiteId,
    createdAt: new Date().toISOString(),
    createdByUserId: user.id,
    createdByName: user.fullName,
    createdByRole: user.roleCode,
    warnings: preview.warnings,
    summary: preview.summary,
    rows: acceptedRows,
  };

  const existing = await readStoredImportBatches();
  await writeStoredImportBatches([batch, ...existing]);

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'REPORT_EXCEL_IMPORTED',
      targetType: 'ReportExcelImport',
      targetId: batch.id,
      detailsJson: JSON.stringify({
        fileName: batch.fileName,
        granularity: batch.granularity,
        periodLabel: batch.periodLabel,
        acceptedRows: acceptedRows.length,
        errorRows: preview.summary.errorRows,
      }),
    },
  });

  bumpDomainRevisions(['reports'], 'report_excel_import');
  return batch;
}

export async function listReportExcelImportBatches(
  user: SessionUserDto,
): Promise<M04ExcelImportBatchDto[]> {
  const all = await readStoredImportBatches();
  if (user.roleCode === 'SALES') {
    return all.filter((b) => b.createdByUserId === user.id);
  }
  return all;
}

export async function deleteReportExcelImportBatch(
  user: SessionUserDto,
  batchId: string,
): Promise<{ deleted: boolean; id: string }> {
  const cleanId = String(batchId || '').trim();
  if (!cleanId) {
    throw new Error('Thiếu mã bản đối soát cần xóa.');
  }
  const existing = await readStoredImportBatches();
  const target = existing.find((b) => b.id === cleanId);
  if (!target) {
    throw new Error('Không tìm thấy bản đối soát Excel cần xóa.');
  }
  const canDelete =
    user.roleCode === 'ADMIN' ||
    user.roleCode === 'BOD' ||
    target.createdByUserId === user.id;
  if (!canDelete) {
    throw new Error('Bạn chỉ có quyền xóa bản đối soát Excel do chính mình tải lên.');
  }

  const next = existing.filter((b) => b.id !== cleanId);
  await writeStoredImportBatches(next);

  await prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'REPORT_EXCEL_IMPORT_DELETED',
      targetType: 'ReportExcelImport',
      targetId: cleanId,
      detailsJson: JSON.stringify({
        fileName: target.fileName,
      }),
    },
  });

  bumpDomainRevisions(['reports'], 'report_excel_import_delete');
  return { deleted: true, id: cleanId };
}
