import { ZipArchive } from '../../core/export/xlsx-builder';
import type { SessionUserDto } from '@toantrung/contracts';
import { getScopedReportsDashboard } from './service';
import { getM04ResultsReportSpec } from './m04-spec.service';

function escXml(val: unknown): string {
  if (val == null) return '';
  return String(val)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function htmlToPlainLines(html: string): string[] {
  if (!html) return [];
  const withBreaks = html
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"');
  return withBreaks
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function makeDocxParagraph(
  text: string,
  opts?: {
    bold?: boolean;
    sizeHalfPt?: number;
    colorHex?: string;
    align?: 'left' | 'center' | 'right';
    spacingAfter?: number;
  },
): string {
  const alignXml = opts?.align ? `<w:jc w:val="${opts.align}"/>` : '';
  const spacingXml = `<w:spacing w:before="60" w:after="${opts?.spacingAfter ?? 120}"/>`;
  const boldXml = opts?.bold ? '<w:b/>' : '';
  const sizeXml = `<w:sz w:val="${opts?.sizeHalfPt ?? 22}"/><w:szCs w:val="${opts?.sizeHalfPt ?? 22}"/>`;
  const colorXml = `<w:color w:val="${opts?.colorHex ?? '1E293B'}"/>`;
  return `<w:p>
    <w:pPr>${alignXml}${spacingXml}</w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>${boldXml}${sizeXml}${colorXml}</w:rPr>
      <w:t xml:space="preserve">${escXml(text)}</w:t>
    </w:r>
  </w:p>`;
}

function makeDocxTable(headers: string[], rows: string[][]): string {
  const headerCells = headers
    .map(
      (h) => `<w:tc>
        <w:tcPr>
          <w:shd w:val="clear" w:color="auto" w:fill="1E3A8A"/>
          <w:tcMar><w:top w:w="100" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
        </w:tcPr>
        <w:p>
          <w:pPr><w:spacing w:before="40" w:after="40"/></w:pPr>
          <w:r>
            <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:b/><w:sz w:val="20"/><w:color w:val="FFFFFF"/></w:rPr>
            <w:t xml:space="preserve">${escXml(h)}</w:t>
          </w:r>
        </w:p>
      </w:tc>`,
    )
    .join('');

  const bodyRows = rows
    .map((row, idx) => {
      const fill = idx % 2 === 1 ? 'F8FAFC' : 'FFFFFF';
      const cells = row
        .map(
          (cell) => `<w:tc>
            <w:tcPr>
              <w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>
              <w:tcMar><w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:left w:w="140" w:type="dxa"/><w:right w:w="140" w:type="dxa"/></w:tcMar>
            </w:tcPr>
            <w:p>
              <w:pPr><w:spacing w:before="30" w:after="30"/></w:pPr>
              <w:r>
                <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="20"/><w:color w:val="1E293B"/></w:rPr>
                <w:t xml:space="preserve">${escXml(cell)}</w:t>
              </w:r>
            </w:p>
          </w:tc>`,
        )
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="5000" w:type="pct"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="E2E8F0"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tr>${headerCells}</w:tr>
    ${bodyRows}
  </w:tbl>`;
}

export function buildGenuineDocxArchive(params: {
  reportTitle: string;
  docCode: string;
  reportingPeriod: string;
  scopeLabel: string;
  authorName: string;
  authorRole: string;
  kpiRows: string[][];
  sourceRows: string[][];
  salesRows: string[][];
  narrativeLines: string[];
}): Buffer {
  const zip = new ZipArchive();

  zip.addFile(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-officedocument.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`,
  );

  zip.addFile(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  zip.addFile(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`,
  );

  zip.addFile(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI" w:cs="Segoe UI"/>
        <w:sz w:val="22"/>
        <w:color w:val="1E293B"/>
      </w:rPr>
    </w:rPrDefault>
  </w:docDefaults>
</w:styles>`,
  );

  zip.addFile(
    'word/footer1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:p>
    <w:pPr><w:jc w:val="right"/></w:pPr>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
      <w:t xml:space="preserve">CÔNG TY TNHH ĐT VT TOÀN TRUNG · Mã văn bản: ${escXml(params.docCode)} · Trang </w:t>
    </w:r>
    <w:fldSimple w:instr="PAGE"/>
    <w:r>
      <w:rPr><w:rFonts w:ascii="Segoe UI" w:hAnsi="Segoe UI"/><w:sz w:val="18"/><w:color w:val="64748B"/></w:rPr>
      <w:t xml:space="preserve"> / </w:t>
    </w:r>
    <w:fldSimple w:instr="NUMPAGES"/>
  </w:p>
</w:ftr>`,
  );

  const bodyParts: string[] = [
    makeDocxParagraph('CÔNG TY TNHH ĐIỆN TỬ VIỄN THÔNG TOÀN TRUNG', {
      bold: true,
      sizeHalfPt: 26,
      colorHex: '1E3A8A',
      align: 'center',
      spacingAfter: 60,
    }),
    makeDocxParagraph('HỆ THỐNG CRM & BÁO CÁO QUẢN TRỊ NỘI BỘ', {
      bold: false,
      sizeHalfPt: 18,
      colorHex: '475569',
      align: 'center',
      spacingAfter: 180,
    }),
    makeDocxParagraph(params.reportTitle.toUpperCase(), {
      bold: true,
      sizeHalfPt: 30,
      colorHex: '0F172A',
      align: 'center',
      spacingAfter: 120,
    }),
    makeDocxParagraph(
      `Mã văn bản: ${params.docCode}  |  Kỳ báo cáo: ${params.reportingPeriod}  |  Phạm vi: ${params.scopeLabel}`,
      { bold: true, sizeHalfPt: 20, colorHex: '334155', align: 'center', spacingAfter: 80 },
    ),
    makeDocxParagraph(
      `Người lập: ${params.authorName} (${params.authorRole})  |  Ngày xuất: ${new Date().toLocaleString('vi-VN')} (GMT+7)`,
      { bold: false, sizeHalfPt: 18, colorHex: '64748B', align: 'center', spacingAfter: 240 },
    ),
    makeDocxParagraph('I. TỔNG HỢP CHỈ SỐ CHÍNH', {
      bold: true,
      sizeHalfPt: 24,
      colorHex: '1E3A8A',
      spacingAfter: 120,
    }),
    makeDocxTable(['Chỉ tiêu', 'Giá trị ghi nhận', 'Ghi chú'], params.kpiRows),
  ];

  if (params.sourceRows.length > 0) {
    bodyParts.push(
      makeDocxParagraph('II. HIỆU QUẢ THEO KÊNH MARKETING', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      }),
      makeDocxTable(
        ['Kênh marketing', 'Tiếp nhận', 'Hợp lệ', 'Đã báo giá', 'Chốt thành công', 'Tỷ lệ chốt'],
        params.sourceRows,
      ),
    );
  }

  if (params.salesRows.length > 0) {
    bodyParts.push(
      makeDocxParagraph('III. ĐỐI SOÁT KẾT QUẢ THEO NHÂN SỰ PHỤ TRÁCH', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      }),
      makeDocxTable(
        [
          'Nhân sự phụ trách',
          'Lead hợp lệ',
          'Đang xử lý',
          'Đã gửi báo giá',
          'Quá hạn >7 ngày',
          'Chốt thành công',
        ],
        params.salesRows,
      ),
    );
  }

  if (params.narrativeLines.length > 0) {
    bodyParts.push(
      makeDocxParagraph('IV. NHẬN ĐỊNH & ĐỀ XUẤT HÀNH ĐỘNG TRỌNG TÂM', {
        bold: true,
        sizeHalfPt: 24,
        colorHex: '1E3A8A',
        spacingAfter: 120,
      }),
    );
    for (const line of params.narrativeLines) {
      bodyParts.push(makeDocxParagraph(line, { sizeHalfPt: 21, spacingAfter: 90 }));
    }
  }

  bodyParts.push(
    makeDocxParagraph(
      `TP. Hồ Chí Minh, ngày ${new Date().getDate()} tháng ${new Date().getMonth() + 1} năm ${new Date().getFullYear()}`,
      { align: 'right', sizeHalfPt: 20, colorHex: '475569', spacingAfter: 80 },
    ),
    makeDocxParagraph(`NGƯỜI LẬP BÁO CÁO: ${params.authorName}`, {
      bold: true,
      align: 'right',
      sizeHalfPt: 21,
      colorHex: '1E3A8A',
      spacingAfter: 120,
    }),
  );

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyParts.join('\n    ')}
    <w:sectPr>
      <w:footerReference w:type="default" r:id="rId2"/>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  zip.addFile('word/document.xml', documentXml);
  return zip.toBuffer();
}

export async function generateScopedReportDocxBuffer(
  user: SessionUserDto,
  params?: {
    title?: string;
    docCode?: string;
    reportingPeriod?: string;
    contentHtml?: string;
    preset?: string;
    websiteId?: string;
    fromDate?: string;
    toDate?: string;
  },
): Promise<{
  buffer: Buffer;
  docCode: string;
  reportTitle: string;
  preset: string;
  dateStamp: string;
}> {
  const websiteId = params?.websiteId || 'all';
  const preset = params?.preset || '30d';
  const fromDate = params?.fromDate || undefined;
  const toDate = params?.toDate || undefined;

  const [dash, m04Spec] = await Promise.all([
    getScopedReportsDashboard(user, { websiteId, preset, fromDate, toDate }),
    getM04ResultsReportSpec(user, {
      websiteId,
      preset: preset.toUpperCase(),
      from: fromDate,
      to: toDate,
    }),
  ]);

  const dateStamp = new Date().toISOString().slice(0, 10);
  const docCode = params?.docCode || `TT-BC-${dateStamp.replace(/-/g, '')}`;
  const reportTitle =
    params?.title ||
    `Báo cáo Hiệu quả Marketing Toàn Trung (${m04Spec.scope.startDate} đến ${m04Spec.scope.endDate})`;

  const kpiRows: string[][] = [
    [
      'Chi phí quảng cáo',
      m04Spec.metrics.attributedAdCost !== null && m04Spec.metrics.attributedAdCost !== undefined
        ? `${m04Spec.metrics.attributedAdCost.toLocaleString('vi-VN')} ₫`
        : 'Chưa kết nối / Chưa tách riêng website',
      m04Spec.metrics.adReconciliationNote || 'Chi phí thực tế trong phạm vi chọn',
    ],
    [
      'Lead tiếp nhận',
      String(m04Spec.metrics.receivedLeadCount ?? m04Spec.metrics.totalLeadCount),
      'Toàn bộ Lead phát sinh trong phạm vi kỳ và website đang chọn',
    ],
    [
      'Lead hợp lệ',
      String(m04Spec.metrics.validLeadCount),
      'Lead sau khi loại trừ hồ sơ xác minh spam',
    ],
    [
      'CPL quảng cáo hợp lệ',
      m04Spec.metrics.costPerValidAdLead !== null
        ? `${Math.round(m04Spec.metrics.costPerValidAdLead).toLocaleString('vi-VN')} ₫`
        : 'Chưa đủ dữ liệu',
      `Chia trên ${m04Spec.metrics.validAttributedAdLeadCount ?? 0} Lead hợp lệ từ quảng cáo`,
    ],
    [
      'Chốt thành công',
      String(m04Spec.metrics.wonLeadCount),
      `Quá hạn báo giá >7 ngày: ${m04Spec.metrics.overdueQuoteCount}`,
    ],
    [
      'Tỷ lệ chốt',
      m04Spec.metrics.winRatePct !== null ? `${m04Spec.metrics.winRatePct}%` : '—',
      m04Spec.metrics.winRateDefinition,
    ],
  ];

  const sourceRows: string[][] = m04Spec.tables.byChannel.map((ch) => [
    ch.channel,
    String(ch.leadCount),
    String(ch.validCount),
    String(ch.quotedCount),
    String(ch.wonCount),
    ch.winRatePct !== null && ch.winRatePct !== undefined ? `${ch.winRatePct}%` : '—',
  ]);

  const salesRows: string[][] = (dash.salesPerformance || []).map((sp) => [
    sp.salesFullName,
    String(sp.totalLeads),
    String(sp.newLeads + sp.quotingLeads),
    String(sp.quoteSentLeads),
    String(sp.unansweredOverdue7d),
    String(sp.wonLeads),
  ]);

  const narrativeLines = params?.contentHtml
    ? htmlToPlainLines(params.contentHtml)
    : m04Spec.marketingInsights?.summaryFindings?.length
      ? m04Spec.marketingInsights.summaryFindings.map(
          (f, i) => `${i + 1}. ${f.title}: ${f.evidenceText}`,
        )
      : [
          '1. Tập trung xử lý các hồ sơ Lead mới chưa xác nhận tiếp nhận và các báo giá đã gửi quá 7 ngày chưa có phản hồi.',
          '2. Đối chiếu chi phí quảng cáo với Lead hợp lệ từ từng chiến dịch để phân bổ ngân sách đúng website.',
          '3. Theo sát các yêu cầu thiết kế phối cảnh LED đang xử lý để hỗ trợ đội ngũ Kinh doanh chốt dự án.',
        ];

  const buffer = buildGenuineDocxArchive({
    reportTitle,
    docCode,
    reportingPeriod: params?.reportingPeriod || `${dash.fromDate} → ${dash.toDate}`,
    scopeLabel: dash.scopeDescription,
    authorName: user.fullName,
    authorRole: user.roleName,
    kpiRows,
    sourceRows,
    salesRows,
    narrativeLines,
  });

  return { buffer, docCode, reportTitle, preset, dateStamp };
}
