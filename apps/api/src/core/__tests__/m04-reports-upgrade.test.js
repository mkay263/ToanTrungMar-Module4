'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const Module = require('node:module');
const ts = require('typescript');

if (!require.extensions['.ts']) {
  require.extensions['.ts'] = function compileTs(module, filename) {
    const source = fs.readFileSync(filename, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
        resolveJsonModule: true,
      },
      fileName: filename,
    });
    module._compile(transpiled.outputText, filename);
  };
}

const V2_ROOT = path.resolve(__dirname, '../../../../..');
const INDEP_DB_PATH = path.join(V2_ROOT, 'packages/database/prisma/independent_v2.db');
process.env.DATABASE_URL = `file:${INDEP_DB_PATH.replace(/\\/g, '/')}`;

const origResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspaceAliases(request, parent, isMain, options) {
  if (request === '@toantrung/contracts') {
    return path.join(V2_ROOT, 'packages/contracts/src/common/index.ts');
  }
  if (request.startsWith('@toantrung/contracts/')) {
    const sub = request.slice('@toantrung/contracts/'.length);
    return path.join(V2_ROOT, 'packages/contracts/src', sub, 'index.ts');
  }
  if (request === '@toantrung/database') {
    return path.join(V2_ROOT, 'packages/database/src/index.ts');
  }
  try {
    return origResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (request.startsWith('.') && parent && parent.filename) {
      const candidateTs = path.resolve(path.dirname(parent.filename), `${request}.ts`);
      if (fs.existsSync(candidateTs)) return candidateTs;
      const candidateIndexTs = path.resolve(path.dirname(parent.filename), request, 'index.ts');
      if (fs.existsSync(candidateIndexTs)) return candidateIndexTs;
    }
    throw err;
  }
};

function readZipTextEntries(zipBuf) {
  const entries = new Map();
  let pos = 0;
  while (pos + 30 <= zipBuf.length) {
    const sig = zipBuf.readUInt32LE(pos);
    if (sig !== 0x04034b50) break;
    const method = zipBuf.readUInt16LE(pos + 8);
    const compressedSize = zipBuf.readUInt32LE(pos + 18);
    const nameLen = zipBuf.readUInt16LE(pos + 26);
    const extraLen = zipBuf.readUInt16LE(pos + 28);
    const name = zipBuf.subarray(pos + 30, pos + 30 + nameLen).toString('utf8');
    const dataStart = pos + 30 + nameLen + extraLen;
    const rawSlice = zipBuf.subarray(dataStart, dataStart + compressedSize);
    const contentBuf = method === 8 ? zlib.inflateRawSync(rawSlice) : rawSlice;
    entries.set(name, contentBuf.toString('utf8'));
    pos = dataStart + compressedSize;
  }
  return entries;
}

const { prisma } = require('@toantrung/database');
const { getM04ResultsReportSpec } = require('../../modules/04-reports/m04-spec.service.ts');
const { generateScopedReportExportBuffer } = require('../../modules/04-reports/service.ts');
const { generateScopedReportDocxBuffer } = require('../../modules/04-reports/docx-builder.ts');

test.after(async () => {
  await prisma.$disconnect();
});

test('M04 Spec returns previousTimeSeries, wonLeadCount, detailedLeads & clean links', async () => {
  const adminUser = {
    id: 1,
    email: 'admin@toantrung.vn',
    fullName: 'Quản trị viên',
    roleCode: 'ADMIN',
    roleName: 'Quản trị viên',
  };
  const m04 = await getM04ResultsReportSpec(adminUser, {
    websiteId: 'all',
    preset: '30D',
    detailPage: 1,
    detailPageSize: 10,
    bypassCache: true,
  });

  assert.ok(Array.isArray(m04.timeSeries) && m04.timeSeries.length >= 25);
  assert.ok(Array.isArray(m04.previousTimeSeries) && m04.previousTimeSeries.length >= 25);
  assert.equal(m04.timeSeries.length, m04.previousTimeSeries.length);
  assert.ok('wonLeadCount' in m04.timeSeries[0]);
  assert.ok(m04.tables.detailedLeads, 'detailedLeads table must be included in M04 spec');
  assert.ok(Array.isArray(m04.tables.detailedLeads.rows));

  const findings = m04.marketingInsights?.summaryFindings || [];
  for (const f of findings) {
    assert.equal(f.title.includes('Cohort'), false);
    assert.equal(f.evidenceText.includes('(L2)'), false);
    if (f.actionHref && f.actionHref.startsWith('/tracking')) {
      assert.ok(f.actionHref.includes('section=ads_campaigns'));
    }
  }
});

test('M04 Spec enforces BA role anonymization and SALES personal scope on detailedLeads', async () => {
  const mktUser = {
    id: 999,
    email: 'mkt@toantrung.vn',
    fullName: 'Marketing Staff',
    roleCode: 'MKT_STAFF',
    roleName: 'Nhân viên Marketing',
  };
  const m04Mkt = await getM04ResultsReportSpec(mktUser, {
    websiteId: 'all',
    preset: 'ALL',
    detailPage: 1,
    detailPageSize: 15,
    bypassCache: true,
  });
  for (const row of m04Mkt.tables.detailedLeads?.rows || []) {
    assert.equal(row.isAnonymized, true);
    assert.equal(row.companyOrCustomer, 'Khách hàng ẩn danh');
    assert.ok(row.phone.includes('***'), `Expected masked phone, got: ${row.phone}`);
  }

  const salesUserRecord = await prisma.user.findFirst({
    where: { isActive: true, role: { roleCode: 'SALES' } },
    include: { role: true },
  });
  if (salesUserRecord) {
    const salesUser = {
      id: salesUserRecord.id,
      email: salesUserRecord.email,
      fullName: salesUserRecord.fullName,
      roleCode: 'SALES',
      roleName: salesUserRecord.role.roleName,
    };
    const m04Sales = await getM04ResultsReportSpec(salesUser, {
      websiteId: 'all',
      preset: 'ALL',
      detailPage: 1,
      detailPageSize: 50,
      bypassCache: true,
    });
    for (const row of m04Sales.tables.detailedLeads?.rows || []) {
      assert.equal(row.isAnonymized, false);
      assert.equal(row.assignedSalesName, salesUserRecord.fullName);
    }
  }
});

test('M04 XLSX & DOCX exports include clean Vietnamese headers and scoped tables', async () => {
  const adminUser = {
    id: 1,
    email: 'admin@toantrung.vn',
    fullName: 'Quản trị viên',
    roleCode: 'ADMIN',
    roleName: 'Quản trị viên',
  };

  const xlsxExp = await generateScopedReportExportBuffer(
    adminUser,
    { websiteId: 'all', preset: '30d' },
    'xlsx',
  );
  const xlsxEntries = readZipTextEntries(xlsxExp.buffer);
  const workbookXml = xlsxEntries.get('xl/workbook.xml') || '';
  assert.ok(workbookXml.includes('NhuCauSanPham'), 'Workbook must include NhuCauSanPham sheet');
  const combinedSheets = Array.from(xlsxEntries.values()).join('\n');
  assert.equal(combinedSheets.includes('MULTI_WEBSITE_UNSPLIT'), false);
  assert.equal(combinedSheets.includes('Lead Ads L2'), false);

  const docxRes = await generateScopedReportDocxBuffer(adminUser, {
    websiteId: 'all',
    preset: '30d',
  });
  const docxEntries = readZipTextEntries(docxRes.buffer);
  const docXml = docxEntries.get('word/document.xml') || '';
  assert.ok(docXml.includes('Kênh marketing'));
  assert.ok(docXml.includes('Tiếp nhận'));
  assert.ok(docXml.includes('Đã báo giá'));
  assert.equal(docXml.includes('Ghi chú định nghĩa BA'), false);
  assert.equal(docXml.includes('Lead hiệu quả (L3)'), false);
});
