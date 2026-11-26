import type { GoogleAdsLivePeriodSnapshot } from '../modules/02-tracking-sync/gads-live-cache.service';

export interface CanonicalDbAdsCampaignRow {
  platform: string;
  campaignExternalId?: string | null;
  campaignId?: number | null;
  metricDate: string;
  spendMicros?: bigint | null;
  impressions?: number | null;
  clicks?: number | null;
  conversionsMicros?: bigint | null;
  pageUrlRaw?: string | null;
  campaign?: {
    campaignName?: string | null;
    campaignCode?: string | null;
    utmCampaignSlug?: string | null;
    isActive?: boolean | null;
  } | null;
}

export interface CanonicalAdsCatalogCampaign {
  id: number;
  campaignCode: string;
  campaignName: string;
  platform: string;
  isActive: boolean;
  utmCampaignSlug: string | null;
}

export interface UnifiedAdsCampaignDailyFact {
  platform: string;
  campaignExternalId: string;
  metricDate: string;
  spendMicros: bigint;
  impressions: number;
  clicks: number;
  conversionsMicros: bigint;
  pageUrlRaw: string | null;
  finalUrls: string[];
  status: string;
  campaign: {
    campaignName: string;
    campaignCode: string;
    utmCampaignSlug: string | null;
  };
}

/**
 * Nguồn sự thật duy nhất (Single Source of Truth) cho dữ liệu chiến dịch Quảng cáo theo ngày
 * dùng chung cho Tổng quan (Overview), M02 (Tracking & Ads), M03 (Từ khóa & SEO) và M04 (Báo cáo).
 *
 * Quy tắc hợp nhất 1-1 theo khóa (platform, campaignExternalId, metricDate):
 * 1. Nạp toàn bộ bản ghi `grain = 'campaign'` sạch từ DB (`platform_daily_metrics`).
 * 2. Phủ (overlay) dữ liệu live `gadsLiveSnap.campaignDaily` cùng khoảng ngày để:
 *    - Khớp 100% số liệu trong ngày (intraday) giữa M02, M03, M04 và Tổng quan.
 *    - Khớp 100% các kỳ dài (> 30 ngày như Năm nay / 90 ngày) giữa M02, M03, M04 và Tổng quan.
 *    - Tuyệt đối không cộng trùng (mỗi cặp chiến dịch + ngày chỉ tồn tại đúng 1 dòng).
 */
export function mergeCanonicalAdsCampaignDailyMetrics(params: {
  dbRows: CanonicalDbAdsCampaignRow[];
  gadsLiveSnap?: GoogleAdsLivePeriodSnapshot | null;
  realAdsCatalog?: CanonicalAdsCatalogCampaign[];
  finalUrlsMap?: Record<string, string[]>;
  startDateStr: string;
  endDateStr: string;
}): UnifiedAdsCampaignDailyFact[] {
  const {
    dbRows,
    gadsLiveSnap,
    realAdsCatalog = [],
    finalUrlsMap = {},
    startDateStr,
    endDateStr,
  } = params;

  const catalogByExtId = new Map<string, CanonicalAdsCatalogCampaign>();
  for (const camp of realAdsCatalog) {
    const extId = camp.campaignCode.replace(/^GADS_/, '').trim() || String(camp.id);
    catalogByExtId.set(extId, camp);
  }

  const factMap = new Map<string, UnifiedAdsCampaignDailyFact>();

  for (const r of dbRows) {
    if (!r.metricDate || r.metricDate < startDateStr || r.metricDate > endDateStr) continue;
    const rawExt = (
      r.campaignExternalId ||
      r.campaign?.campaignCode?.replace(/^GADS_/, '') ||
      (r.campaignId ? String(r.campaignId) : 'unknown')
    ).trim();
    const cat = catalogByExtId.get(rawExt);
    const campName = (
      r.campaign?.campaignName ||
      cat?.campaignName ||
      r.campaignExternalId ||
      'Chiến dịch chưa đặt tên'
    ).trim();
    const campCode = (
      r.campaign?.campaignCode ||
      cat?.campaignCode ||
      (r.platform === 'google_ads' ? `GADS_${rawExt}` : rawExt)
    ).trim();
    const slug = r.campaign?.utmCampaignSlug || cat?.utmCampaignSlug || null;
    const mergedUrls = Array.from(
      new Set<string>([
        ...(finalUrlsMap[rawExt] || []),
        ...(r.pageUrlRaw ? [r.pageUrlRaw] : []),
      ].filter(Boolean)),
    );
    const urlFallback = r.pageUrlRaw || mergedUrls[0] || null;
    const status =
      r.campaign?.isActive === false || cat?.isActive === false ? 'PAUSED' : 'ENABLED';

    const key = `${r.platform}|${rawExt}|${r.metricDate}`;
    const existing = factMap.get(key);
    if (existing) {
      existing.spendMicros += r.spendMicros ?? 0n;
      existing.impressions += r.impressions || 0;
      existing.clicks += r.clicks || 0;
      existing.conversionsMicros += r.conversionsMicros ?? 0n;
      if (!existing.pageUrlRaw && urlFallback) existing.pageUrlRaw = urlFallback;
      for (const u of mergedUrls) {
        if (!existing.finalUrls.includes(u)) existing.finalUrls.push(u);
      }
    } else {
      factMap.set(key, {
        platform: r.platform,
        campaignExternalId: rawExt,
        metricDate: r.metricDate,
        spendMicros: r.spendMicros ?? 0n,
        impressions: r.impressions || 0,
        clicks: r.clicks || 0,
        conversionsMicros: r.conversionsMicros ?? 0n,
        pageUrlRaw: urlFallback,
        finalUrls: mergedUrls,
        status,
        campaign: {
          campaignName: campName,
          campaignCode: campCode,
          utmCampaignSlug: slug,
        },
      });
    }
  }

  if (gadsLiveSnap && Array.isArray(gadsLiveSnap.campaignDaily) && gadsLiveSnap.campaignDaily.length > 0) {
    for (const d of gadsLiveSnap.campaignDaily) {
      if (!d.campaignId || !d.date || d.date < startDateStr || d.date > endDateStr) continue;
      const extId = String(d.campaignId).trim();
      const cat = catalogByExtId.get(extId);
      const key = `google_ads|${extId}|${d.date}`;
      const existing = factMap.get(key);
      const campName = (d.campaignName || existing?.campaign.campaignName || cat?.campaignName || `Chiến dịch #${extId}`).trim();
      const campCode = existing?.campaign.campaignCode || cat?.campaignCode || `GADS_${extId}`;
      const slug = existing?.campaign.utmCampaignSlug || cat?.utmCampaignSlug || null;
      const mergedUrls = Array.from(
        new Set<string>([
          ...(existing?.finalUrls || []),
          ...(finalUrlsMap[extId] || []),
          ...(existing?.pageUrlRaw ? [existing.pageUrlRaw] : []),
        ].filter(Boolean)),
      );
      const urlFallback = existing?.pageUrlRaw || mergedUrls[0] || null;

      factMap.set(key, {
        platform: 'google_ads',
        campaignExternalId: extId,
        metricDate: d.date,
        spendMicros: BigInt(Math.round(d.cost * 1_000_000)),
        impressions: Math.round(d.impressions || 0),
        clicks: Math.round(d.clicks || 0),
        conversionsMicros: BigInt(Math.round((d.conversions || 0) * 1_000_000)),
        pageUrlRaw: urlFallback,
        finalUrls: mergedUrls,
        status: d.status || existing?.status || (cat?.isActive === false ? 'PAUSED' : 'ENABLED'),
        campaign: {
          campaignName: campName,
          campaignCode: campCode,
          utmCampaignSlug: slug,
        },
      });
    }
  }

  return Array.from(factMap.values()).sort(
    (a, b) => a.metricDate.localeCompare(b.metricDate) || a.campaignExternalId.localeCompare(b.campaignExternalId),
  );
}
