export interface WebsiteConfigItemDto {
  websiteId: string;
  shortName: string;
  domain: string;
  ga4PropertyId: string | null;
  gscSiteUrl: string | null;
  adsCustomerId: string | null;
}

export type DashboardDatePreset = 'TODAY' | 'YESTERDAY' | '7D' | '30D' | 'CUSTOM';

export type DataFreshnessState =
  | 'FINALIZED'
  | 'PRELIMINARY'
  | 'CACHED'
  | 'NO_DATA'
  | 'ERROR';

export interface DashboardScopeDto {
  websiteId: string;
  websiteLabel: string;
  domain: string | null;
  startDate: string;
  endDate: string;
  timezone: string;
  isTodayIncluded: boolean;
  cohortDefinition: string;
}

export interface DashboardFreshnessDto {
  lastCheckedAt: string;
  lastSuccessAt: string | null;
  dataThrough: string | null;
  state: DataFreshnessState;
  statusMessage: string;
}

export interface DashboardCoverageDto {
  availableWebsites: WebsiteConfigItemDto[];
  includedWebsites: string[];
  missingWebsites: string[];
  note: string | null;
}

export interface PaginatedTableDto<T> {
  rows: T[];
  totalRows: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// M02 — TRUY CẬP & TƯƠNG TÁC
// ============================================================================

export interface M02TrafficSeriesPointDto {
  date: string;
  sessions: number | null;
  pageViews: number | null;
  users: number | null;
  isMissingData: boolean;
}

export interface M02ChannelRowDto {
  channelKey: string;
  channelLabel: string;
  sessions: number;
  engagedSessions: number | null;
  engagementRatePct: number | null;
  validLeadCount: number;
}

export interface M02LandingPageRowDto {
  landingPage: string;
  sessions: number;
  engagedSessions: number | null;
  engagementRatePct: number | null;
  successfulFormCount: number | null;
  validLeadCount: number;
}

export interface M02InteractionRowDto {
  actionKey: string;
  actionLabel: string;
  count: number | null;
  users: number | null;
  meaning: string;
  mappedEventName: string | null;
}

export interface M02ProductInterestRowDto {
  productId: number;
  productName: string;
  productUrl: string | null;
  pageViews: number | null;
  users: number | null;
  phoneClicks: number | null;
  zaloClicks: number | null;
  validLeadCount: number;
}

export interface M02JourneyStepDto {
  stepKey: string;
  label: string;
  sessionCount: number | null;
}

export interface M02TrafficInteractionDto {
  scope: DashboardScopeDto;
  freshness: DashboardFreshnessDto;
  coverage: DashboardCoverageDto;
  version: string;
  metrics: {
    users: number | null;
    newUsers: number | null;
    sessions: number | null;
    pageViews: number | null;
    engagementRatePct: number | null;
    engagedSessions: number | null;
    averageEngagementSeconds: number | null;
    validFormLeadCount: number;
    activeUsers30m: number | null;
  };
  realtimeMinutesSeries: Array<{ minutesAgo: number; activeUsers: number }>;
  charts: {
    trafficSeries: M02TrafficSeriesPointDto[];
    channelRows: M02ChannelRowDto[];
    deviceRows: Array<{ deviceCategory: string; sessions: number }>;
    geoRows: Array<{ locationLabel: string; sessions: number }>;
  };
  tables: {
    landingPageRows: PaginatedTableDto<M02LandingPageRowDto>;
    interactionRows: M02InteractionRowDto[];
    formSessionRatePct: number | null;
    productInterestRows: M02ProductInterestRowDto[];
    journeySteps: M02JourneyStepDto[];
    journeyAvailable: boolean;
    journeyNote: string | null;
  };
}

// ============================================================================
// M03 — QUẢNG CÁO, TỪ KHÓA & SEO, TÌNH TRẠNG TRANG, XU HƯỚNG
// ============================================================================

export interface M03AdDailyPointDto {
  date: string;
  cost: number | null;
  clicks: number | null;
  conversions: number | null;
}

export interface M03AdCampaignRowDto {
  campaignId: string;
  campaignName: string;
  status: string;
  channelType: string | null;
  cost: number;
  impressions: number;
  clicks: number;
  ctrPct: number | null;
  cpc: number | null;
  conversions: number;
  validLeadCount: number;
  cpl: number | null;
}

export interface M03SeoDailyPointDto {
  date: string;
  clicks: number | null;
  impressions: number | null;
  ctrPct: number | null;
  averagePosition: number | null;
  completenessState: 'FINALIZED' | 'PRELIMINARY' | 'UNKNOWN' | 'QUERY_ERROR' | 'NO_DATA';
}

export interface M03SeoComparisonRowDto {
  key: string;
  clicks: number;
  impressions: number;
  ctrPct: number | null;
  averagePosition: number | null;
  previousClicks: number | null;
  clickChange: number | null;
  clickChangePct: number | null;
  previousPosition: number | null;
  positionImprovement: number | null;
}

export interface M03SiteStatusRowDto {
  url: string;
  verdict: string;
  coverageState: string;
  issuesToReview: string | null;
  lastCrawlTime: string | null;
  lastCheckedAt: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
}

export interface M03TrendRowDto {
  term: string;
  geoCode: string;
  geoName: string;
  date: string;
  interestValue: number;
  scaleType: string;
  comparisonGroupId: string;
}

export interface M03AdsSeoDashboardDto {
  scope: DashboardScopeDto;
  freshness: DashboardFreshnessDto;
  coverage: DashboardCoverageDto;
  version: string;
  ads: {
    status: 'CONNECTED' | 'UNCONFIGURED' | 'ERROR';
    statusMessage: string;
    currencyCode: string;
    metrics: {
      adCost: number | null;
      adImpressions: number | null;
      adClicks: number | null;
      adCtrPct: number | null;
      averageCpc: number | null;
      averageCpm: number | null;
      adConversions: number | null;
      costPerConversion: number | null;
      validAdLeadCount: number;
      costPerValidAdLead: number | null;
    };
    charts: {
      adDailySeries: M03AdDailyPointDto[];
      topCampaigns: Array<{ campaignName: string; cost: number }>;
    };
    tables: {
      campaigns: PaginatedTableDto<M03AdCampaignRowDto>;
      adGroups: Array<{ adGroupName: string; campaignName: string; cost: number; impressions: number; clicks: number; conversions: number; cpa: number | null }>;
      keywords: Array<{ keyword: string; matchType: string; adGroupName: string; campaignName: string; impressions: number; clicks: number; ctrPct: number | null; cost: number; conversions: number; cpa: number | null }>;
      keywordAvailabilityNote: string | null;
      deviceBreakdown: Array<{ device: string; cost: number; clicks: number; impressions: number }>;
      geoBreakdown: Array<{ location: string; cost: number; clicks: number; impressions: number }>;
    };
  };
  seo: {
    metrics: {
      organicSearchClicks: number | null;
      organicSearchImpressions: number | null;
      organicSearchCtrPct: number | null;
      averageSearchPosition: number | null;
      organicSessions: number | null;
      organicValidLeadCount: number;
    };
    comparison: {
      previousStartDate: string;
      previousEndDate: string;
      previousClicks: number | null;
      previousImpressions: number | null;
      clickChangePct: number | null;
    };
    charts: {
      seoDailySeries: M03SeoDailyPointDto[];
      opportunityQueries: Array<{ query: string; impressions: number; ctrPct: number | null; averagePosition: number | null }>;
      opportunityThresholdNote: string;
    };
    tables: {
      queries: PaginatedTableDto<M03SeoComparisonRowDto>;
      pages: PaginatedTableDto<M03SeoComparisonRowDto>;
    };
  };
  siteStatus: {
    status: 'CONNECTED' | 'UNCONFIGURED' | 'ERROR';
    statusMessage: string;
    rows: M03SiteStatusRowDto[];
  };
  trends: {
    status: 'CONNECTED' | 'UNCONFIGURED' | 'ERROR';
    statusMessage: string;
    rows: M03TrendRowDto[];
  };
}

// ============================================================================
// M04 — BÁO CÁO KẾT QUẢ
// ============================================================================

export interface M04ResultsReportDto {
  scope: DashboardScopeDto;
  freshness: DashboardFreshnessDto;
  coverage: DashboardCoverageDto;
  version: string;
  scopeRole: string;
  scopeDescription: string;
  metrics: {
    totalLeadCount: number;
    validLeadCount: number;
    l2Count: number;
    l3Count: number;
    waitingQuoteCount: number;
    wonLeadCount: number;
    winRatePct: number | null;
    winRateNumerator: number;
    winRateDenominator: number;
    winRateDefinition: string;
    costPerValidAdLead: number | null;
    currencyCode: string;
    overdueQuoteCount: number;
  };
  charts: {
    leadFunnel: Array<{ stageKey: string; label: string; distinctLeadCount: number }>;
    productLeadRows: Array<{ productId: number; productName: string; distinctLeadCount: number }>;
  };
  tables: {
    bySales: Array<{ salesId: number; salesName: string; leadCount: number; validCount: number; quotedCount: number; waitingCount: number; wonCount: number; overdueCount: number }>;
    byWebsite: Array<{ website: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number; adLeadCount: number; cpl: number | null }>;
    byChannel: Array<{ channel: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }>;
    byProduct: Array<{ productId: number; productName: string; leadCount: number; validCount: number; quotedCount: number; wonCount: number }>;
    pendingActionLeads: PaginatedTableDto<{
      leadId: number;
      leadCode: string;
      customerLabel: string;
      assignedSalesName: string;
      website: string;
      quoteSentAt: string | null;
      waitingDays: number;
    }>;
  };
}

