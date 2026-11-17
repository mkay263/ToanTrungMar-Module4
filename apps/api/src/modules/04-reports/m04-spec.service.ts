import { prisma } from '@toantrung/database';
import {
  CONTACT_CHANNEL_LABELS,
  isL2Valid,
  isL3Effective,
  type ContactChannel,
  type M04ResultsReportDto,
  type SessionUserDto,
} from '@toantrung/contracts';
import {
  matchesWebsiteDomain,
  paginateArray,
  resolveDashboardScope,
} from '../../core/website-catalog';
import { shouldAnonymizeLeadForRole } from '../01-leads/service';
import { computeCostPerValidAdLead, getM03AdsSeoDashboardSpec } from '../03-keywords-ads/m03-spec.service';

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

  const leadWhere: Record<string, unknown> = {
    createdAt: {
      gte: scope.startDateTime,
      lte: scope.endDateTime,
    },
  };
  if (user.roleCode === 'SALES') {
    leadWhere.assignedSalesId = user.id;
  }

  const [rawLeads, m03Spec, latestSync] = await Promise.all([
    prisma.lead.findMany({
      where: leadWhere,
      include: {
        assignedSales: { select: { id: true, fullName: true } },
        tracking: true,
        leadProducts: { include: { product: { select: { id: true, productName: true } } } },
        activities: {
          where: { actionType: { in: ['quote_sent', 'status_change'] } },
          select: { actionType: true, note: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    getM03AdsSeoDashboardSpec({
      websiteId: scope.websiteId,
      preset: scope.preset,
      from: scope.startDateStr,
      to: scope.endDateStr,
    }),
    prisma.platformSyncLog.findFirst({ orderBy: { id: 'desc' } }),
  ]);

  const leads = rawLeads.filter((l) => matchesWebsiteDomain(l.sourceWebsite, scope.selectedWebsite));
  const totalLeadCount = leads.length;
  const validLeads = leads.filter((l) => isL2Valid(l));
  const l2Count = validLeads.length;
  const l3Count = leads.filter((l) => isL3Effective(l)).length;

  const hasQuoteEvidence = (l: (typeof leads)[number]) =>
    Boolean(l.firstQuoteSentAt) ||
    l.pipelineStatus === 'quote_sent' ||
    l.pipelineStatus === 'won' ||
    l.activities.some((a: { actionType: string }) => a.actionType === 'quote_sent');

  const quotedLeads = validLeads.filter(hasQuoteEvidence);
  const waitingQuoteLeads = leads.filter((l) => l.pipelineStatus === 'quote_sent');
  const wonLeads = leads.filter((l) => l.pipelineStatus === 'won');

  const nowMs = Date.now();
  const overdueQuotes = waitingQuoteLeads.filter((l) => {
    const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
    return (nowMs - refMs) / (1000 * 60 * 60 * 24) > 7;
  });

  const winRateDenominator = l2Count;
  const winRateNumerator = wonLeads.length;
  const winRatePct =
    winRateDenominator > 0
      ? Number(((winRateNumerator / winRateDenominator) * 100).toFixed(1))
      : null;

  const adLeads = validLeads.filter(
    (l) =>
      Boolean(l.tracking?.gclid) ||
      (l.tracking?.marketingSource || '').toLowerCase().includes('google ads'),
  );
  const costPerValidAdLead = computeCostPerValidAdLead(m03Spec.ads.metrics.adCost, adLeads.length);

  // Funnel strictly on the same Lead cohort
  const leadFunnel = [
    { stageKey: 'received', label: 'Tiếp nhận', distinctLeadCount: totalLeadCount },
    { stageKey: 'valid', label: 'Hợp lệ', distinctLeadCount: l2Count },
    { stageKey: 'quoted', label: 'Đã báo giá', distinctLeadCount: quotedLeads.length },
    { stageKey: 'won', label: 'Đã chốt', distinctLeadCount: wonLeads.length },
  ];

  // Product breakdown (a Lead interested in multiple products can appear in multiple rows)
  const prodMap = new Map<
    number,
    { productId: number; productName: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }
  >();
  for (const l of leads) {
    const seenProdIds = new Set<number>();
    for (const lp of l.leadProducts) {
      if (seenProdIds.has(lp.productId)) continue;
      seenProdIds.add(lp.productId);
      const cur = prodMap.get(lp.productId) || {
        productId: lp.productId,
        productName: lp.product.productName,
        leadCount: 0,
        validCount: 0,
        quotedCount: 0,
        wonCount: 0,
      };
      cur.leadCount += 1;
      if (isL2Valid(l)) cur.validCount += 1;
      if (isL2Valid(l) && hasQuoteEvidence(l)) cur.quotedCount += 1;
      if (l.pipelineStatus === 'won') cur.wonCount += 1;
      prodMap.set(lp.productId, cur);
    }
  }
  const byProduct = Array.from(prodMap.values()).sort((a, b) => b.leadCount - a.leadCount);

  // Sales breakdown
  const salesMap = new Map<
    number,
    { salesId: number; salesName: string; leadCount: number; validCount: number; quotedCount: number; waitingCount: number; wonCount: number; overdueCount: number }
  >();
  for (const l of leads) {
    const sid = l.assignedSalesId || 0;
    const sname = l.assignedSales?.fullName || 'Chưa phân bổ';
    const cur = salesMap.get(sid) || {
      salesId: sid,
      salesName: sname,
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
    if (l.pipelineStatus === 'quote_sent') {
      cur.waitingCount += 1;
      const refMs = (l.firstQuoteSentAt || l.updatedAt || l.createdAt).getTime();
      if ((nowMs - refMs) / (1000 * 60 * 60 * 24) > 7) cur.overdueCount += 1;
    }
    if (l.pipelineStatus === 'won') cur.wonCount += 1;
    salesMap.set(sid, cur);
  }

  // Website breakdown
  const webMap = new Map<
    string,
    { website: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number; adLeadCount: number; cpl: number | null }
  >();
  for (const l of leads) {
    const w = l.sourceWebsite || 'Chưa xác định website';
    const cur = webMap.get(w) || {
      website: w,
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
      if (
        Boolean(l.tracking?.gclid) ||
        (l.tracking?.marketingSource || '').toLowerCase().includes('google ads')
      ) {
        cur.adLeadCount += 1;
      }
    }
    if (l.pipelineStatus === 'won') cur.wonCount += 1;
    webMap.set(w, cur);
  }

  // Marketing channel breakdown
  const chMap = new Map<
    string,
    { channel: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }
  >();
  for (const l of leads) {
    const ch =
      l.tracking?.marketingSource ||
      CONTACT_CHANNEL_LABELS[l.contactChannel as ContactChannel] ||
      l.contactChannel ||
      'Chưa xác định';
    const cur = chMap.get(ch) || {
      channel: ch,
      leadCount: 0,
      validCount: 0,
      quotedCount: 0,
      wonCount: 0,
    };
    cur.leadCount += 1;
    if (isL2Valid(l)) cur.validCount += 1;
    if (isL2Valid(l) && hasQuoteEvidence(l)) cur.quotedCount += 1;
    if (l.pipelineStatus === 'won') cur.wonCount += 1;
    chMap.set(ch, cur);
  }

  const pendingActionRows = waitingQuoteLeads
    .map((l) => {
      const refDate = l.firstQuoteSentAt || l.updatedAt || l.createdAt;
      const waitingDays = Math.max(0, Math.floor((nowMs - refDate.getTime()) / (1000 * 60 * 60 * 24)));
      return {
        leadId: l.id,
        leadCode: l.leadCode,
        customerLabel: anonymized
          ? 'Khách hàng ẩn danh'
          : l.companyName || l.contactName || l.phone,
        assignedSalesName: l.assignedSales?.fullName || 'Chưa phân bổ',
        website: l.sourceWebsite || 'Chưa xác định website',
        quoteSentAt: refDate.toISOString(),
        waitingDays,
      };
    })
    .sort((a, b) => b.waitingDays - a.waitingDays);

  return {
    scope: {
      websiteId: scope.websiteId,
      websiteLabel: scope.websiteLabel,
      domain: scope.domain,
      startDate: scope.startDateStr,
      endDate: scope.endDateStr,
      timezone: scope.timezone,
      isTodayIncluded: scope.isTodayIncluded,
      cohortDefinition: 'Lead được tạo trong kỳ đã chọn, với kết quả xử lý hiện tại.',
    },
    freshness: {
      lastCheckedAt: new Date().toISOString(),
      lastSuccessAt: latestSync?.completedAt?.toISOString() || new Date().toISOString(),
      dataThrough: scope.endDateStr,
      state: scope.isTodayIncluded ? 'PRELIMINARY' : 'FINALIZED',
      statusMessage: scope.isTodayIncluded
        ? 'Số liệu trong ngày còn sơ bộ.'
        : `Cập nhật lúc ${new Date().toLocaleString('vi-VN')}`,
    },
    coverage: {
      availableWebsites: scope.availableWebsites,
      includedWebsites: scope.selectedWebsite
        ? [scope.selectedWebsite.domain]
        : scope.availableWebsites.map((w) => w.domain),
      missingWebsites: [],
      note: null,
    },
    version: `m04-${scope.websiteId}-${scope.startDateStr}-${scope.endDateStr}-${totalLeadCount}-${wonLeads.length}`,
    scopeRole: user.roleCode,
    scopeDescription:
      user.roleCode === 'SALES'
        ? `Phạm vi cá nhân (${user.fullName})`
        : anonymized
          ? 'Phạm vi Marketing / Thiết kế (ẩn danh PII khách hàng)'
          : 'Phạm vi Toàn công ty',
    metrics: {
      totalLeadCount,
      validLeadCount: l2Count,
      l2Count,
      l3Count,
      waitingQuoteCount: waitingQuoteLeads.length,
      wonLeadCount: winRateNumerator,
      winRatePct,
      winRateNumerator,
      winRateDenominator,
      winRateDefinition: 'Tỷ lệ chốt = Số Lead đã chốt / Tổng Lead hợp lệ (L2) trong cùng kỳ & website',
      costPerValidAdLead,
      currencyCode: m03Spec.ads.currencyCode,
      overdueQuoteCount: overdueQuotes.length,
    },
    charts: {
      leadFunnel,
      productLeadRows: byProduct.map((p) => ({
        productId: p.productId,
        productName: p.productName,
        distinctLeadCount: p.leadCount,
      })),
    },
    tables: {
      bySales: Array.from(salesMap.values()).sort((a, b) => b.leadCount - a.leadCount),
      byWebsite: Array.from(webMap.values()).sort((a, b) => b.leadCount - a.leadCount),
      byChannel: Array.from(chMap.values()).sort((a, b) => b.leadCount - a.leadCount),
      byProduct,
      pendingActionLeads: paginateArray(pendingActionRows, params?.page || 1, params?.pageSize || 20),
    },
  };
}
