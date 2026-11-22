import type {
  AiModelRegistrySnapshotDto,
  AiProviderCatalogItemDto,
  AiProviderId,
  DesignType,
} from '@toantrung/contracts';

export const STUDIO_BANNER_CMD_REGEX =
  /^\s*@(?:banner|baneer|taobanner|tạobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster|poster)\s*:?\s*/i;
export const STUDIO_ANY_CMD_REGEX =
  /^\s*@(?:banner|baneer|taobanner|tạobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster|poster|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\s*:?\s*/i;
export const STUDIO_BANNER_CMD_BTN_REGEX =
  /^\s*@(?:banner|baneer|taobanner|tạobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster|poster)\b/i;
export const STUDIO_ANY_CMD_BTN_REGEX =
  /^\s*@(?:banner|baneer|taobanner|tạobanner|tao_banner|tao-banner|taoanhbanner|taoanhposter|taoposter|tao_anh_poster|poster|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\b/i;

export interface LeadOpt {
  id: number;
  leadCode: string;
  label: string;
}

export interface ProductOpt {
  id: number;
  code: string;
  name: string;
  categoryGroup: string;
}

export interface ProviderStatusInfo {
  provider: AiProviderId;
  providerName: string;
  isConfigured: boolean;
  statusLabel: string;
  activeModel: string;
  costPerImageUsd: number;
  supportsInpainting: boolean;
  notes: string;
  defaultProviderId?: AiProviderId;
  defaultModelId?: string;
  autoFallbackToLocal?: boolean;
  availableProviders?: AiProviderCatalogItemDto[];
  modelRegistry?: AiModelRegistrySnapshotDto;
}

export type UniversalUseCaseCategory =
  | 'general_photo'
  | 'marketing_poster'
  | 'space_architecture'
  | 'led_screen'
  | 'custom_other';

export interface ProjectParameterFormState {
  projectName: string;
  designType: DesignType;
  useCaseCategory: UniversalUseCaseCategory;
  customSubjectName: string;
  editActionMode: 'inpaint_keep_bg' | 'enhance_retouch' | 'region_composite' | 'creative_redesign';
  visualStylePreset: 'photorealistic' | 'modern_clean' | 'vivid_marketing' | 'luxury_arch' | 'custom';
  dimensionUnit: 'auto_photo' | 'm' | 'cm' | 'mm' | 'px';
  targetScopeMode: 'full_image' | 'touch_points';
  leadId: string;
  contactName: string;
  installationInfo: string;
  notes: string;
  productId: number;
  pixelPitch: string;
  screenStyle: 'flat' | 'curved' | 'corner_90';
  screenWidthM: number;
  screenHeightM: number;
  aspectRatio: string;
  aspectLocked: boolean;
  bannerWidthPx: number;
  bannerHeightPx: number;
}

export const STORAGE_SELECTED_PROJECT_KEY = 'tt_studio_selected_project_id';
export const STORAGE_UNIVERSAL_PARAMS_KEY = 'tt_studio_universal_params_v1';

export function parseAspectRatioValue(ratioStr: string): number | null {
  const m = ratioStr.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h || h <= 0) return null;
  return w / h;
}

export function resolveAssetUrl(urlOrKey: string | null | undefined): string {
  if (!urlOrKey) return '/brand/showroom-toan-trung.webp';
  if (urlOrKey.startsWith('/') || urlOrKey.startsWith('http://') || urlOrKey.startsWith('https://')) {
    return urlOrKey;
  }
  return `/api/v1/design/asset-file?key=${encodeURIComponent(urlOrKey)}`;
}
