import { prisma } from '@toantrung/database';
import {
  PIPELINE_STATUS_LABELS,
  isL2Valid,
  isL3Effective,
  normalizeMarketingChannelDisplay,
  sanitizeWebsiteSourceDisplay,
  type M04ResultsReportDto,
  type SessionUserDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
} from '../../core/website-catalog';
import { shouldAnonymizeLeadForRole } from '../01-leads/service';
import { computeCostPerValidAdLead } from '../03-keywords-ads/m03-spec.service';
import { getGoogleAdsApiConfig, getGoogleConnection } from '../02-tracking-sync/google-oauth.service';

export async function getM04ResultsReportSpec(
  user: SessionUserDto,
  params?: {
    websiteId?: string | null;
    preset?: string | null;
    from?: string | null;
    to?: string | null;
    page?: number;
    pageSize?: number;
  },
): Promise<M04ResultsReportDto> {
  const scope = await resolveDashboardScope(params);
  const anonymized = shouldAnonymizeLeadForRole(user.roleCode) || user.roleCode === 'DESIGNER';

  const roleLeadFilter =
    user.roleCode === 'SALES' ? { assignedSalesId: user.id } : {};

  const [
    rawLeads,
    prevRawLeads,
    adsCampaignMetrics,
    latestSync,
    googleConn,
    adsCfg,
    realAdsCatalogCount,
    receivedInPeriodRows,
    firstQuoteInPeriodRows,
    closedWonInPeriodRows,
    periodActivityRows,
  ] = await Promise.all([
    prisma.lead.findMany({
      where: {
        createdAt: {
          gte: scope.startDateTime,
          lte: scope.endDateTime,
        },
        ...roleLeadFilter,
      },
      include: {
        assignedSales: {
          select: {
            id: true,
            fullName: true,
            isActive: true,
            role: { select: { roleCode: true, roleName: true } },
          },
        },
        tracking: true,
        leadProducts: { include: { product: { select: { id: true, productName: true } } } },
        activities: {
          where: { actionType: { in: ['quote_sent', 'status_change'] } },
          select: { actionType: true, note: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.lead.findMany({
      where: {
        createdAt: {
          gte: scope.prevStartDateTime,
          lte: scope.prevEndDateTime,
        },
        ...roleLeadFilter,
      },
      select: {
        id: true,
        isSpam: true,
        pipelineStatus: true,
        sourceWebsite: true,
      },
    }),
    prisma.platformDailyMetric.findMany({
      where: {
        platform: { in: ['google_ads', 'facebook_ads', 'facebook'] },
        grain: 'campaign',
        metricDate: { gte: scope.startDateStr, lte: scope.endDateStr },
        NOT: [
          { accountPropertyId: { startsWith: 'GA4-' } },
          { campaignExternalId: { startsWith: 'ga4_' } },
        ],
      },
      select: {
        spendMicros: true,
        pageUrlRaw: true,
        campaign: {
          select: {
            utmCampaignSlug: true,
            campaignName: true,
          },
        },
      },
    }),
    prisma.platformSyncLog.findFirst({
      where: { status: 'success' },
      orderBy: { id: 'desc' },
    }),
    getGoogleConnection(),
    getGoogleAdsApiConfig(),
    prisma.campaign.count({
      where: {
        platform: 'google_ads',
        NOT: [{ accountExternalId: 'default' }, { accountExternalId: { startsWith: 'GA4-' } }],
      },
    }),
    prisma.lead.findMany({
      where: {
        receivedAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, sourceWebsite: true },
    }),
    prisma.lead.findMany({
      where: {
        firstQuoteSentAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, createdAt: true, sourceWebsite: true },
    }),
    prisma.lead.findMany({
      where: {
        pipelineStatus: 'won',
        closedAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        isSpam: false,
        ...roleLeadFilter,
      },
      select: { id: true, createdAt: true, sourceWebsite: true },
    }),
    prisma.leadActivity.findMany({
      where: {
        createdAt: { gte: scope.startDateTime, lte: scope.endDateTime },
        actionType: { in: ['quote_sent', 'status_change'] },
        lead: { isSpam: false, ...roleLeadFilter },
      },
      select: {
        leadId: true,
        actionType: true,
        newStatus: true,
        lead: { select: { createdAt: true, sourceWebsite: true } },
      },
    }),
  ]);

  const hasAdsToken =
    Boolean(adsCfg?.developerToken) ||
    Boolean(
      googleConn?.connected &&
        !googleConn.isSandboxDemo &&
        googleConn.scopes?.some((s) => s.includes('adwords')),
    ) ||
    realAdsCatalogCount > 0;

  const leads = rawLeads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const prevLeads = prevRawLeads.filter((l) =>
    matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite),
  );

  const receivedLeadCount = leads.length;
  const validLeads = leads.filter((l) => isL2Valid(l));
  const validLeadCount = validLeads.length;
  const effectiveLeadCount = leads.filter((l) => isL3Effective(l)).length;
  const spamCount = receivedLeadCount - validLeadCount;

  const prevReceivedCount = prevLeads.length;
  const prevValidCount = prevLeads.filter((l) => isL2Valid(l)).length;
  const prevWonCount = prevLeads.filter((l) => isL2Valid(l) && l.pipelineStatus === 'won').length;

  const hasQuoteEvidence = (l: (typeof leads)[number]) =>
    Boolean(l.firstQuoteSentAt) ||
    l.pipelineStatus === 'quote_sent' ||
    l.pipelineStatus === 'won' ||
    l.activities.some((a: { actionType: string }) => a.actionType === 'quote_sent');

  const pendingAcceptanceCount = validLeads.filter(
    (l) => l.pipelineStatus === 'new_lead' && !l.receivedAt,
  ).length;
  const newLeadStageCount = validLeads.filter((l) => l.pipelineStatus === 'new_lead').length;
  const draftingQuoteCount = validLeads.filter((l) => l.pipelineStatus === 'quoting').length;
  const waitingQuoteLeads = validLeads.filter((l) => l.pipelineStatus === 'quote_sent');
  const waitingQuoteCount = waitingQuoteLeads.length;
  const wonLeads = validLeads.filter((l) => l.pipelineStatus === 'won');
  const wonLeadCount = wonLeads.length;
  const lostLeadCount = validLeads.filter((l) => l.pipelineStatus === 'lost').length;
  const quotedLeads = validLeads.filter(hasQuoteEvidence);

  const nowMs = Date.now();
  const overdueQuotes = waitingQuoteLeads.filter((l) => {
    const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
    return (nowMs - refMs) / (1000 * 60 * 60 * 24) >= 7;
  });

  const winRateDenominator = validLeadCount;
  const winRateNumerator = wonLeadCount;
  const winRatePct =
    winRateDenominator > 0
      ? Number(((winRateNumerator / winRateDenominator) * 100).toFixed(1))
      : null;

  // Đối soát chi phí quảng cáo và Lead quảng cáo hợp lệ (C04 & C09)
  const validAdLeads = validLeads.filter((l) => {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    return ch === 'Google Ads' || ch === 'Quảng cáo Facebook';
  });

  let attributedAdCost: number | null = null;
  let adReconciliationNote = '';
  if (adsCampaignMetrics.length > 0) {
    if (!scope.selectedWebsite) {
      const totalMicros = adsCampaignMetrics.reduce((s, r) => s + (r.spendMicros ?? 0n), 0n);
      attributedAdCost = Number((Number(totalMicros) / 1_000_000).toFixed(0));
      adReconciliationNote = 'Đã đối soát tổng chi phí quảng cáo cấp tài khoản với Lead quảng cáo hợp lệ.';
    } else {
      const siteMatched = adsCampaignMetrics.filter((r) => {
        const slug = r.campaign?.utmCampaignSlug || '';
        const domainHint = (slug.startsWith('domain:') ? slug.slice(7) : r.pageUrlRaw || '').toLowerCase();
        return Boolean(domainHint && domainHint.includes(scope.selectedWebsite!.domain.toLowerCase()));
      });
      if (siteMatched.length > 0) {
        const siteMicros = siteMatched.reduce((s, r) => s + (r.spendMicros ?? 0n), 0n);
        attributedAdCost = Number((Number(siteMicros) / 1_000_000).toFixed(0));
        adReconciliationNote = `Chi phí chiến dịch gắn riêng cho ${scope.selectedWebsite.domain}.`;
      } else {
        attributedAdCost = null;
        adReconciliationNote = `Chưa có dữ liệu phân bổ chi phí chiến dịch riêng cho ${scope.selectedWebsite.domain} (không tự chia đều chi phí tài khoản).`;
      }
    }
  } else {
    attributedAdCost = hasAdsToken && !scope.selectedWebsite ? 0 : null;
    adReconciliationNote = hasAdsToken
      ? 'Đã kết nối Google Ads v26; các chiến dịch hiện tạm dừng hoặc phát sinh 0 ₫ chi tiêu trong kỳ chọn.'
      : `Chưa kết nối tài khoản Google Ads OAuth (ghi nhận ${validAdLeads.length} Lead quảng cáo hợp lệ trong CRM).`;
  }

  const costPerValidAdLead = computeCostPerValidAdLead(attributedAdCost, validAdLeads.length);

  // C09: Dùng phân bố trạng thái hiện tại đúng bản chất dữ liệu (không giả làm phễu tích lũy nhiều bước)
  const pctOf = (count: number) =>
    receivedLeadCount > 0 ? Number(((count / receivedLeadCount) * 100).toFixed(1)) : 0;

  const statusDistribution = [
    {
      statusKey: 'new_lead',
      label: PIPELINE_STATUS_LABELS.new_lead,
      count: newLeadStageCount,
      pctOfTotal: pctOf(newLeadStageCount),
    },
    {
      statusKey: 'quoting',
      label: PIPELINE_STATUS_LABELS.quoting,
      count: draftingQuoteCount,
      pctOfTotal: pctOf(draftingQuoteCount),
    },
    {
      statusKey: 'quote_sent',
      label: PIPELINE_STATUS_LABELS.quote_sent,
      count: waitingQuoteCount,
      pctOfTotal: pctOf(waitingQuoteCount),
    },
    {
      statusKey: 'won',
      label: PIPELINE_STATUS_LABELS.won,
      count: wonLeadCount,
      pctOfTotal: pctOf(wonLeadCount),
    },
    {
      statusKey: 'lost',
      label: PIPELINE_STATUS_LABELS.lost,
      count: lostLeadCount,
      pctOfTotal: pctOf(lostLeadCount),
    },
    ...(spamCount > 0
      ? [
          {
            statusKey: 'spam',
            label: 'Đã xác minh spam (loại trừ)',
            count: spamCount,
            pctOfTotal: pctOf(spamCount),
          },
        ]
      : []),
  ];

  // Giữ leadFunnel tương thích ngược với các bài test cũ trên cùng cohort
  const leadFunnel = [
    { stageKey: 'received', label: 'Lead tiếp nhận', distinctLeadCount: receivedLeadCount },
    { stageKey: 'valid', label: 'Lead hợp lệ', distinctLeadCount: validLeadCount },
    { stageKey: 'quoted', label: 'Có gửi báo giá', distinctLeadCount: quotedLeads.length },
    { stageKey: 'won', label: 'Chốt thành công', distinctLeadCount: wonLeadCount },
  ];

  // Phân tích nhu cầu sản phẩm + phần chưa phân loại sản phẩm (C09)
  let unclassifiedProductLeadCount = 0;
  let multiProductLeadCount = 0;
  const prodMap = new Map<
    number,
    {
      productId: number;
      productName: string;
      isUnclassifiedProduct?: boolean;
      leadCount: number;
      validCount: number;
      quotedCount: number;
      wonCount: number;
    }
  >();

  for (const l of leads) {
    const uniqueProds = Array.from(
      new Map(l.leadProducts.map((lp) => [lp.productId, lp])).values(),
    );
    if (uniqueProds.length === 0) {
      unclassifiedProductLeadCount += 1;
      const unclass = prodMap.get(0) || {
        productId: 0,
        productName: 'Chưa phân loại sản phẩm',
        isUnclassifiedProduct: true,
        leadCount: 0,
        validCount: 0,
        quotedCount: 0,
        wonCount: 0,
      };
      unclass.leadCount += 1;
      if (isL2Valid(l)) unclass.validCount += 1;
      if (isL2Valid(l) && hasQuoteEvidence(l)) unclass.quotedCount += 1;
      if (isL2Valid(l) && l.pipelineStatus === 'won') unclass.wonCount += 1;
      prodMap.set(0, unclass);
      continue;
    }

    if (uniqueProds.length > 1) {
      multiProductLeadCount += 1;
    }
    for (const lp of uniqueProds) {
      const cur = prodMap.get(lp.productId) || {
        productId: lp.productId,
        productName: lp.product.productName,
        isUnclassifiedProduct: false,
        leadCount: 0,
        validCount: 0,
        quotedCount: 0,
        wonCount: 0,
      };
      cur.leadCount += 1;
      if (isL2Valid(l)) cur.validCount += 1;
      if (isL2Valid(l) && hasQuoteEvidence(l)) cur.quotedCount += 1;
      if (isL2Valid(l) && l.pipelineStatus === 'won') cur.wonCount += 1;
      prodMap.set(lp.productId, cur);
    }
  }

  const classifiedProductRows = Array.from(prodMap.values())
    .filter((p) => !p.isUnclassifiedProduct)
    .sort((a, b) => b.leadCount - a.leadCount);
  const unclassifiedProductRow = prodMap.get(0);
  const byProduct = [
    ...classifiedProductRows,
    ...(unclassifiedProductRow ? [unclassifiedProductRow] : []),
  ];

  // Đối soát đầy đủ theo nhân sự (C04 & C09: cộng khớp 100% với receivedLeadCount, làm rõ giao ngoài nhóm Sales / chưa giao / ngưng hoạt động)
  const salesMap = new Map<
    number,
    {
      salesId: number;
      salesName: string;
      roleLabel?: string;
      isReconciliationBucket?: boolean;
      leadCount: number;
      validCount: number;
      quotedCount: number;
      waitingCount: number;
      wonCount: number;
      overdueCount: number;
    }
  >();

  for (const l of leads) {
    const sid = l.assignedSalesId || 0;
    const roleCode = l.assignedSales?.role?.roleCode || null;
    const isStandardSales = roleCode === 'SALES' || roleCode === 'SALES_LEAD';
    const isInactive = l.assignedSales ? !l.assignedSales.isActive : false;
    const roleNote = !l.assignedSales
      ? 'Chưa giao nhân sự'
      : !isStandardSales
        ? `Ngoài danh sách Sales (${l.assignedSales.role?.roleName || roleCode})`
        : isInactive
          ? 'Nhân sự ngừng hoạt động'
          : l.assignedSales.role?.roleName || 'Kinh doanh';

    const sname = l.assignedSales
      ? !isStandardSales
        ? `${l.assignedSales.fullName} (${l.assignedSales.role?.roleName || roleCode})`
        : isInactive
          ? `${l.assignedSales.fullName} (Ngừng hoạt động)`
          : l.assignedSales.fullName
      : 'Chưa phân bổ';

    const cur = salesMap.get(sid) || {
      salesId: sid,
      salesName: sname,
      roleLabel: roleNote,
      isReconciliationBucket: !l.assignedSales || !isStandardSales,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      waitingCount: 0,
      wonCount: 0,
      overdueCount: 0,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) cur.validCount += 1;
    if (isL2Valid(l) && hasQuoteEvidence(l)) cur.quotedCount += 1;
    if (isL2Valid(l) && l.pipelineStatus === 'quote_sent') {
      cur.waitingCount += 1;
      const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
      if ((nowMs - refMs) / (1000 * 60 * 60 * 24) >= 7) cur.overdueCount += 1;
    }
    if (isL2Valid(l) && l.pipelineStatus === 'won') cur.wonCount += 1;
    salesMap.set(sid, cur);
  }

  const bySales = Array.from(salesMap.values()).sort((a, b) => {
    if (Boolean(a.isReconciliationBucket) !== Boolean(b.isReconciliationBucket)) {
      return a.isReconciliationBucket ? 1 : -1;
    }
    return b.leadCount - a.leadCount;
  });

  // Phân tích theo Website nguồn (không cộng lặp, làm rõ phần chưa xác định website)
  const webMap = new Map<
    string,
    {
      website: string;
      isUnclassifiedWebsite?: boolean;
      leadCount: number;
      validCount: number;
      quotedCount: number;
      wonCount: number;
      adLeadCount: number;
      cpl: number | null;
    }
  >();

  for (const l of leads) {
    const cleanWeb = sanitizeWebsiteSourceDisplay(l.sourceWebsite).cleanLabel;
    const isUnclassified = !cleanWeb;
    const wKey = cleanWeb || 'Chưa xác định';
    const cur = webMap.get(wKey) || {
      website: wKey,
      isUnclassifiedWebsite: isUnclassified,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      wonCount: 0,
      adLeadCount: 0,
      cpl: null,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) {
      cur.validCount += 1;
      if (hasQuoteEvidence(l)) cur.quotedCount += 1;
      const ch = normalizeMarketingChannelDisplay({
        marketingSource: l.tracking?.marketingSource,
        utmSource: l.tracking?.utmSource,
        utmMedium: l.tracking?.utmMedium,
        gclid: l.tracking?.gclid,
        contactChannel: l.contactChannel,
      });
      if (ch === 'Google Ads' || ch === 'Quảng cáo Facebook') {
        cur.adLeadCount += 1;
      }
      if (l.pipelineStatus === 'won') cur.wonCount += 1;
    }
    webMap.set(wKey, cur);
  }

  const byWebsite = Array.from(webMap.values()).sort((a, b) => {
    if (Boolean(a.isUnclassifiedWebsite) !== Boolean(b.isUnclassifiedWebsite)) {
      return a.isUnclassifiedWebsite ? 1 : -1;
    }
    return b.leadCount - a.leadCount;
  });

  // Phân tích theo Kênh marketing chuẩn hóa (C04: tách khỏi hình thức liên hệ, không tự gán Organic/Direct)
  const chMap = new Map<
    string,
    { channel: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }
  >();
  for (const l of leads) {
    const ch = normalizeMarketingChannelDisplay({
      marketingSource: l.tracking?.marketingSource,
      utmSource: l.tracking?.utmSource,
      utmMedium: l.tracking?.utmMedium,
      gclid: l.tracking?.gclid,
      contactChannel: l.contactChannel,
    });
    const cur = chMap.get(ch) || {
      channel: ch,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      wonCount: 0,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) {
      cur.validCount += 1;
      if (hasQuoteEvidence(l)) cur.quotedCount += 1;
      if (l.pipelineStatus === 'won') cur.wonCount += 1;
    }
    chMap.set(ch, cur);
  }

  const byChannel = Array.from(chMap.values()).sort((a, b) => {
    if ((a.channel === 'Chưa xác định') !== (b.channel === 'Chưa xác định')) {
      return a.channel === 'Chưa xác định' ? 1 : -1;
    }
    return b.leadCount - a.leadCount;
  });

  const pendingActionRows = waitingQuoteLeads
    .map((l) => {
      const refDate = l.firstQuoteSentAt || l.updatedAt || l.createdAt;
      const waitingDays = Math.max(
        0,
        Math.floor((nowMs - refDate.getTime()) / (1000 * 60 * 60 * 24)),
      );
      return {
        leadId: l.id,
        leadCode: l.leadCode,
        customerLabel: anonymized
          ? 'Khách hàng ẩn danh'
          : l.companyName || l.contactName || l.phone || l.leadCode,
        assignedSalesName: l.assignedSales?.fullName || 'Chưa phân bổ',
        website: sanitizeWebsiteSourceDisplay(l.sourceWebsite).cleanLabel || 'Chưa xác định',
        quoteSentAt: refDate.toISOString(),
        waitingDays,
      };
    })
    .sort((a, b) => b.waitingDays - a.waitingDays);

  // Hoạt động xử lý phát sinh trong kỳ [startDateTime..endDateTime], bao gồm cả Lead tạo từ kỳ trước
  const receivedInPeriodCount = receivedInPeriodRows.filter((l) =>
    matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite),
  ).length;
  const quotedInPeriodLeadMap = new Map<number, Date>();
  for (const r of firstQuoteInPeriodRows) {
    if (matchesWebsiteDomain(r.sourceWebsite, scope.selectedWebsite)) {
      quotedInPeriodLeadMap.set(r.id, r.createdAt);
    }
  }
  const wonInPeriodLeadMap = new Map<number, Date>();
  for (const r of closedWonInPeriodRows) {
    if (matchesWebsiteDomain(r.sourceWebsite, scope.selectedWebsite)) {
      wonInPeriodLeadMap.set(r.id, r.createdAt);
    }
  }
  const lostInPeriodLeadMap = new Map<number, Date>();
  for (const act of periodActivityRows) {
    if (!matchesWebsiteDomain(act.lead.sourceWebsite, scope.selectedWebsite)) continue;
    if (
      act.actionType === 'quote_sent' ||
      (act.actionType === 'status_change' && act.newStatus === 'quote_sent')
    ) {
      quotedInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
    if (act.actionType === 'status_change' && act.newStatus === 'won') {
      wonInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
    if (act.actionType === 'status_change' && act.newStatus === 'lost') {
      lostInPeriodLeadMap.set(act.leadId, act.lead.createdAt);
    }
  }
  const priorCohortLeadIds = new Set<number>();
  for (const [lid, createdAt] of [
    ...quotedInPeriodLeadMap.entries(),
    ...wonInPeriodLeadMap.entries(),
    ...lostInPeriodLeadMap.entries(),
  ]) {
    if (createdAt < scope.startDateTime) {
      priorCohortLeadIds.add(lid);
    }
  }

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition:
        'Cơ sở thống kê: Tập Lead được tạo trong kỳ và phạm vi website đang chọn, phản ánh trạng thái xử lý hiện tại.',
      previousStartDate: scope.prevStartDateStr,
      previousEndDate: scope.prevEndDateStr,
    },
    freshness: {
      lastCheckedAt: new Date().toISOString(),
      lastSuccessAt: latestSync?.completedAt?.toISOString() || new Date().toISOString(),
      dataThrough: scope.endDateStr,
      state: scope.isTodayIncluded ? 'PRELIMINARY' : 'FINALIZED',
      statusMessage: scope.isTodayIncluded
        ? 'Số liệu trong ngày đang tạm tính.'
        : `Dữ liệu đến ${scope.endDateStr}`,
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: [],
      note:
        !scope.selectedWebsite && webMap.has('Chưa xác định')
          ? `Bao gồm ${webMap.get('Chưa xác định')!.leadCount} Lead chưa xác định website nguồn (từ Hotline, Zalo hoặc nhập tay). Khi lọc 1 website cụ thể, nhóm chưa xác định website được tách riêng.`
          : null,
    },
    version: `m04-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${receivedLeadCount}-${wonLeadCount}`,
    scopeRole: user.roleCode,
    scopeDescription:
      user.roleCode === 'SALES'
        ? `Phạm vi cá nhân (${user.fullName})`
        : anonymized
          ? 'Phạm vi Marketing / Thiết kế (đã che thông tin liên hệ khách hàng)'
          : 'Phạm vi toàn công ty',
    metrics: {
      totalLeadCount: receivedLeadCount,
      receivedLeadCount,
      validLeadCount,
      effectiveLeadCount,
      l2Count: validLeadCount,
      l3Count: effectiveLeadCount,
      pendingAcceptanceCount,
      draftingQuoteCount,
      waitingQuoteCount,
      wonLeadCount,
      lostLeadCount,
      winRatePct,
      winRateNumerator,
      winRateDenominator,
      winRateDefinition:
        'Tỷ lệ chốt = Chốt thành công / Lead hợp lệ (L2) trong cùng tập Lead tạo trong kỳ và phạm vi website đang chọn.',
      attributedAdCost,
      validAdLeadCount: validAdLeads.length,
      adReconciliationNote,
      costPerValidAdLead,
      currencyCode: 'VND',
      overdueQuoteCount: overdueQuotes.length,
      unclassifiedProductLeadCount,
      previousReceivedLeadCount: prevReceivedCount,
      previousValidLeadCount: prevValidCount,
      previousWonLeadCount: prevWonCount,
    },
    periodActivity: {
      receivedInPeriodCount,
      quotedInPeriodCount: quotedInPeriodLeadMap.size,
      wonInPeriodCount: wonInPeriodLeadMap.size,
      lostInPeriodCount: lostInPeriodLeadMap.size,
      fromPriorCohortCount: priorCohortLeadIds.size,
      definitionNote:
        'Hoạt động xử lý phát sinh thực tế trong khoảng ngày chọn (bao gồm cả hồ sơ Lead được tạo từ các kỳ trước nhưng mới báo giá hoặc chốt trong kỳ này).',
    },
    charts: {
      leadFunnel,
      progressChartMode: 'CURRENT_STATUS_DISTRIBUTION',
      progressChartTitle: 'Phân bố trạng thái xử lý hiện tại',
      progressChartSubtitle: `Tổng cộng ${receivedLeadCount} hồ sơ tạo trong kỳ (mỗi hồ sơ thuộc đúng một trạng thái hiện tại)`,
      statusDistribution,
      productLeadRows: classifiedProductRows.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        distinctLeadCount: p.leadCount,
      })),
      multiProductNote:
        multiProductLeadCount > 0
          ? `Có ${multiProductLeadCount} Lead quan tâm từ 2 dòng sản phẩm trở lên; bảng Sản phẩm đếm theo lượt quan tâm từng sản phẩm, không cộng gộp thành tổng Lead.`
          : null,
    },
    tables: {
      bySales,
      byWebsite,
      byChannel,
      byProduct,
      pendingActionLeads: paginateArray(
        pendingActionRows,
        params?.page || 1,
        params?.pageSize || 20,
      ),
    },
  };
}
