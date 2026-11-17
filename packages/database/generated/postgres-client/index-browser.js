
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.ProductScalarFieldEnum = {
  id: 'id',
  categoryGroup: 'categoryGroup',
  productCode: 'productCode',
  productName: 'productName',
  unit: 'unit',
  isActive: 'isActive',
  createdAt: 'createdAt'
};

exports.Prisma.LeadScalarFieldEnum = {
  id: 'id',
  leadCode: 'leadCode',
  version: 'version',
  companyName: 'companyName',
  projectName: 'projectName',
  normalizedLookupKey: 'normalizedLookupKey',
  contactName: 'contactName',
  phone: 'phone',
  isPhoneUnstandardized: 'isPhoneUnstandardized',
  email: 'email',
  contactChannel: 'contactChannel',
  sourceWebsite: 'sourceWebsite',
  selfReportedSource: 'selfReportedSource',
  areaType: 'areaType',
  province: 'province',
  district: 'district',
  installationAddress: 'installationAddress',
  pipelineStatus: 'pipelineStatus',
  lostReason: 'lostReason',
  currencyCode: 'currencyCode',
  quoteValueVnd: 'quoteValueVnd',
  dealValueVnd: 'dealValueVnd',
  assignedSalesId: 'assignedSalesId',
  createdByUserId: 'createdByUserId',
  createdByActorType: 'createdByActorType',
  createdByActorRef: 'createdByActorRef',
  receivedByUserId: 'receivedByUserId',
  isDuplicateAlert: 'isDuplicateAlert',
  duplicateStatus: 'duplicateStatus',
  matchedOldLeadId: 'matchedOldLeadId',
  isSuspectedPriceCheck: 'isSuspectedPriceCheck',
  isSpam: 'isSpam',
  spamReason: 'spamReason',
  spamAdsExclusionStatus: 'spamAdsExclusionStatus',
  autoReassignCount: 'autoReassignCount',
  needsManagerAttention: 'needsManagerAttention',
  reopenCount: 'reopenCount',
  contactedAt: 'contactedAt',
  receivedAt: 'receivedAt',
  firstQuoteSentAt: 'firstQuoteSentAt',
  quoteRespondedAt: 'quoteRespondedAt',
  lastQuoteReminderAt: 'lastQuoteReminderAt',
  statusChangedAt: 'statusChangedAt',
  closedAt: 'closedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.LeadProductScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  productId: 'productId',
  customProductName: 'customProductName',
  requestedDimension: 'requestedDimension',
  noteSpecification: 'noteSpecification',
  createdAt: 'createdAt'
};

exports.Prisma.LeadAttachmentScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  attachmentType: 'attachmentType',
  folderPath: 'folderPath',
  fileName: 'fileName',
  fileUrl: 'fileUrl',
  fileSizeKb: 'fileSizeKb',
  uploadedById: 'uploadedById',
  uploadedAt: 'uploadedAt'
};

exports.Prisma.LeadActivityScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  actionType: 'actionType',
  fromSalesId: 'fromSalesId',
  toSalesId: 'toSalesId',
  transferReason: 'transferReason',
  oldStatus: 'oldStatus',
  newStatus: 'newStatus',
  oldValueJson: 'oldValueJson',
  newValueJson: 'newValueJson',
  note: 'note',
  actionById: 'actionById',
  actorType: 'actorType',
  actorRef: 'actorRef',
  createdAt: 'createdAt'
};

exports.Prisma.PriceCheckAlertScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  phone: 'phone',
  companyName: 'companyName',
  normalizedLookupKey: 'normalizedLookupKey',
  reason: 'reason',
  chatScreenshotUrl: 'chatScreenshotUrl',
  status: 'status',
  previousAlertId: 'previousAlertId',
  createdByUserId: 'createdByUserId',
  removedByUserId: 'removedByUserId',
  removedAt: 'removedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.CampaignScalarFieldEnum = {
  id: 'id',
  platform: 'platform',
  accountExternalId: 'accountExternalId',
  campaignCode: 'campaignCode',
  campaignName: 'campaignName',
  utmCampaignSlug: 'utmCampaignSlug',
  currencyCode: 'currencyCode',
  dailyBudgetMicros: 'dailyBudgetMicros',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.MarketingTrackingScalarFieldEnum = {
  id: 'id',
  leadId: 'leadId',
  campaignId: 'campaignId',
  intakeChannel: 'intakeChannel',
  intakeSourceProvider: 'intakeSourceProvider',
  intakeSourceAccountKey: 'intakeSourceAccountKey',
  externalSubmissionId: 'externalSubmissionId',
  marketingSource: 'marketingSource',
  sourceResolutionMethod: 'sourceResolutionMethod',
  utmSource: 'utmSource',
  utmMedium: 'utmMedium',
  utmCampaign: 'utmCampaign',
  campaignName: 'campaignName',
  gclid: 'gclid',
  referrerUrl: 'referrerUrl',
  landingPageUrl: 'landingPageUrl',
  deviceType: 'deviceType',
  ipAddress: 'ipAddress',
  geoLocation: 'geoLocation',
  isUnknownSource: 'isUnknownSource',
  isUnknownCampaign: 'isUnknownCampaign',
  isUtmGclidMismatch: 'isUtmGclidMismatch',
  isUnmatchedUtm: 'isUnmatchedUtm',
  isRepeatLead: 'isRepeatLead',
  gclidRetryCount: 'gclidRetryCount',
  gclidLastTriedAt: 'gclidLastTriedAt',
  syncGa4Status: 'syncGa4Status',
  trackedAt: 'trackedAt'
};

exports.Prisma.PlatformDailyMetricScalarFieldEnum = {
  id: 'id',
  platform: 'platform',
  accountPropertyId: 'accountPropertyId',
  metricDate: 'metricDate',
  grain: 'grain',
  campaignExternalId: 'campaignExternalId',
  keywordMatchType: 'keywordMatchType',
  keywordTextNorm: 'keywordTextNorm',
  pagePathNorm: 'pagePathNorm',
  dimensionFingerprint: 'dimensionFingerprint',
  campaignId: 'campaignId',
  campaignName: 'campaignName',
  keywordRaw: 'keywordRaw',
  pageUrlRaw: 'pageUrlRaw',
  currencyCode: 'currencyCode',
  spendMicros: 'spendMicros',
  dailyBudgetMicros: 'dailyBudgetMicros',
  cpcMicros: 'cpcMicros',
  impressions: 'impressions',
  clicks: 'clicks',
  conversionsMicros: 'conversionsMicros',
  googleLeadFormCount: 'googleLeadFormCount',
  pageViews: 'pageViews',
  avgTimeOnPageSec: 'avgTimeOnPageSec',
  avgPosition: 'avgPosition',
  fanpageEngagements: 'fanpageEngagements',
  trendInterestScore: 'trendInterestScore',
  isFinalized: 'isFinalized',
  syncedAt: 'syncedAt'
};

exports.Prisma.PlatformSyncLogScalarFieldEnum = {
  id: 'id',
  platform: 'platform',
  accountPropertyId: 'accountPropertyId',
  runType: 'runType',
  windowStartDate: 'windowStartDate',
  windowEndDate: 'windowEndDate',
  recordsSynced: 'recordsSynced',
  status: 'status',
  errorMessage: 'errorMessage',
  consecutiveFailures: 'consecutiveFailures',
  startedAt: 'startedAt',
  completedAt: 'completedAt'
};

exports.Prisma.LeadReconciliationScalarFieldEnum = {
  id: 'id',
  reconcileDate: 'reconcileDate',
  platform: 'platform',
  accountPropertyId: 'accountPropertyId',
  crmLeadCount: 'crmLeadCount',
  crmErrorLogCount: 'crmErrorLogCount',
  platformReportedCount: 'platformReportedCount',
  discrepancy: 'discrepancy',
  status: 'status',
  resolvedByUserId: 'resolvedByUserId',
  resolutionNote: 'resolutionNote',
  resolvedAt: 'resolvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.WebhookIntakeErrorLogScalarFieldEnum = {
  id: 'id',
  sourcePlatform: 'sourcePlatform',
  intakeSourceAccountKey: 'intakeSourceAccountKey',
  externalSubmissionId: 'externalSubmissionId',
  rawPayloadJson: 'rawPayloadJson',
  errorCode: 'errorCode',
  errorMessage: 'errorMessage',
  retryCount: 'retryCount',
  lastRetriedAt: 'lastRetriedAt',
  isResolved: 'isResolved',
  resolvedLeadId: 'resolvedLeadId',
  createdAt: 'createdAt'
};

exports.Prisma.SeoKeywordScalarFieldEnum = {
  id: 'id',
  keyword: 'keyword',
  keywordNorm: 'keywordNorm',
  cachedSearchVolume: 'cachedSearchVolume',
  cachedAdsClicks: 'cachedAdsClicks',
  cachedOrganicClicks: 'cachedOrganicClicks',
  cachedAvgPosition: 'cachedAvgPosition',
  cacheSourceAccountKey: 'cacheSourceAccountKey',
  cacheWindowStartDate: 'cacheWindowStartDate',
  cacheWindowEndDate: 'cacheWindowEndDate',
  cacheRefreshedAt: 'cacheRefreshedAt',
  trendDirection: 'trendDirection',
  recommendedPublishWindow: 'recommendedPublishWindow',
  updatedAt: 'updatedAt'
};

exports.Prisma.SeoArticleScalarFieldEnum = {
  id: 'id',
  version: 'version',
  keywordId: 'keywordId',
  topic: 'topic',
  title: 'title',
  slug: 'slug',
  metaDescription: 'metaDescription',
  aiSuggestedOutline: 'aiSuggestedOutline',
  contentHtml: 'contentHtml',
  targetWebsite: 'targetWebsite',
  status: 'status',
  currentRevisionId: 'currentRevisionId',
  approvedRevisionId: 'approvedRevisionId',
  scheduledPublishAt: 'scheduledPublishAt',
  publishedAt: 'publishedAt',
  publishedUrl: 'publishedUrl',
  publishAttemptCount: 'publishAttemptCount',
  lastPublishError: 'lastPublishError',
  cachedOrganicClicks: 'cachedOrganicClicks',
  cachedAvgPosition: 'cachedAvgPosition',
  cachedAvgTimeOnPageSec: 'cachedAvgTimeOnPageSec',
  metricsRefreshedAt: 'metricsRefreshedAt',
  needsOptimization: 'needsOptimization',
  createdByUserId: 'createdByUserId',
  approvedByUserId: 'approvedByUserId',
  approvedAt: 'approvedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SeoArticleRevisionScalarFieldEnum = {
  id: 'id',
  articleId: 'articleId',
  revisionNumber: 'revisionNumber',
  originType: 'originType',
  title: 'title',
  metaDescription: 'metaDescription',
  contentHtml: 'contentHtml',
  changeNote: 'changeNote',
  editedByUserId: 'editedByUserId',
  createdAt: 'createdAt'
};

exports.Prisma.DesignRequestScalarFieldEnum = {
  id: 'id',
  version: 'version',
  leadId: 'leadId',
  requestedBySalesId: 'requestedBySalesId',
  assignedDesignerId: 'assignedDesignerId',
  requestType: 'requestType',
  ledCategory: 'ledCategory',
  screenDimensions: 'screenDimensions',
  aspectRatio: 'aspectRatio',
  installPositionJson: 'installPositionJson',
  sitePhotoUrl: 'sitePhotoUrl',
  prompt: 'prompt',
  designStatus: 'designStatus',
  aiDraftImageUrl: 'aiDraftImageUrl',
  finalRenderUrl: 'finalRenderUrl',
  approvedVersionId: 'approvedVersionId',
  processingTimeMs: 'processingTimeMs',
  tokenCost: 'tokenCost',
  totalCostMicros: 'totalCostMicros',
  costCurrency: 'costCurrency',
  notes: 'notes',
  createdAt: 'createdAt',
  completedAt: 'completedAt'
};

exports.Prisma.DesignAssetVersionScalarFieldEnum = {
  id: 'id',
  designRequestId: 'designRequestId',
  versionNumber: 'versionNumber',
  versionType: 'versionType',
  storageObjectKey: 'storageObjectKey',
  mimeType: 'mimeType',
  fileSizeBytes: 'fileSizeBytes',
  promptUsed: 'promptUsed',
  parametersJson: 'parametersJson',
  aiUsageLogId: 'aiUsageLogId',
  uploadedByUserId: 'uploadedByUserId',
  isApprovedFinal: 'isApprovedFinal',
  createdAt: 'createdAt'
};

exports.Prisma.RoleScalarFieldEnum = {
  id: 'id',
  roleCode: 'roleCode',
  roleName: 'roleName',
  description: 'description',
  createdAt: 'createdAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  roleId: 'roleId',
  fullName: 'fullName',
  email: 'email',
  phone: 'phone',
  passwordHash: 'passwordHash',
  department: 'department',
  specialtyGroup: 'specialtyGroup',
  isReceivingLeads: 'isReceivingLeads',
  isOnline: 'isOnline',
  avatarUrl: 'avatarUrl',
  isActive: 'isActive',
  deletedAt: 'deletedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.UserSessionScalarFieldEnum = {
  id: 'id',
  tokenHash: 'tokenHash',
  csrfToken: 'csrfToken',
  userId: 'userId',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  expiresAt: 'expiresAt',
  revokedAt: 'revokedAt',
  createdAt: 'createdAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  title: 'title',
  summary: 'summary',
  category: 'category',
  actionLabel: 'actionLabel',
  actionUrl: 'actionUrl',
  requiredPermission: 'requiredPermission',
  isRead: 'isRead',
  readAt: 'readAt',
  createdAt: 'createdAt'
};

exports.Prisma.BrandingAssetScalarFieldEnum = {
  id: 'id',
  slot: 'slot',
  objectKey: 'objectKey',
  mimeType: 'mimeType',
  fileSizeBytes: 'fileSizeBytes',
  width: 'width',
  height: 'height',
  sha256: 'sha256',
  altText: 'altText',
  coverPosition: 'coverPosition',
  cropJson: 'cropJson',
  isActive: 'isActive',
  uploadedById: 'uploadedById',
  createdAt: 'createdAt'
};

exports.Prisma.SystemSettingScalarFieldEnum = {
  key: 'key',
  value: 'value',
  updatedById: 'updatedById',
  updatedAt: 'updatedAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  actorUserId: 'actorUserId',
  action: 'action',
  targetType: 'targetType',
  targetId: 'targetId',
  detailsJson: 'detailsJson',
  ipAddress: 'ipAddress',
  createdAt: 'createdAt'
};

exports.Prisma.AiUsageLogScalarFieldEnum = {
  id: 'id',
  idempotencyKey: 'idempotencyKey',
  attemptNumber: 'attemptNumber',
  providerRequestId: 'providerRequestId',
  moduleCode: 'moduleCode',
  taskType: 'taskType',
  userId: 'userId',
  designRequestId: 'designRequestId',
  seoArticleId: 'seoArticleId',
  modelName: 'modelName',
  promptTokens: 'promptTokens',
  completionTokens: 'completionTokens',
  totalTokens: 'totalTokens',
  costMicros: 'costMicros',
  costCurrency: 'costCurrency',
  durationMs: 'durationMs',
  status: 'status',
  errorMessage: 'errorMessage',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};


exports.Prisma.ModelName = {
  Product: 'Product',
  Lead: 'Lead',
  LeadProduct: 'LeadProduct',
  LeadAttachment: 'LeadAttachment',
  LeadActivity: 'LeadActivity',
  PriceCheckAlert: 'PriceCheckAlert',
  Campaign: 'Campaign',
  MarketingTracking: 'MarketingTracking',
  PlatformDailyMetric: 'PlatformDailyMetric',
  PlatformSyncLog: 'PlatformSyncLog',
  LeadReconciliation: 'LeadReconciliation',
  WebhookIntakeErrorLog: 'WebhookIntakeErrorLog',
  SeoKeyword: 'SeoKeyword',
  SeoArticle: 'SeoArticle',
  SeoArticleRevision: 'SeoArticleRevision',
  DesignRequest: 'DesignRequest',
  DesignAssetVersion: 'DesignAssetVersion',
  Role: 'Role',
  User: 'User',
  UserSession: 'UserSession',
  Notification: 'Notification',
  BrandingAsset: 'BrandingAsset',
  SystemSetting: 'SystemSetting',
  AuditLog: 'AuditLog',
  AiUsageLog: 'AiUsageLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
