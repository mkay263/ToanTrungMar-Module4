'use client';

import {
  containsCustomerPiiInPrompt,
  type LedScreenInstanceDto,
  type MarketingExportFormatType,
} from '@toantrung/contracts';

export interface BrandKitOverlayOptions {
  enabled: boolean;
  websiteDomain?: string | null;
  headlineText?: string | null;
  ctaText?: string | null;
  primaryColor?: string | null;
}

export function computeScreensUnionFocalBox(screens: LedScreenInstanceDto[]): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  centerX: number;
  centerY: number;
} {
  if (!screens || screens.length === 0) {
    return { minX: 25, minY: 20, maxX: 75, maxY: 72, centerX: 50, centerY: 46 };
  }
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of screens) {
    const pts = [
      s.quad.topLeft,
      s.quad.topRight,
      s.quad.bottomRight,
      s.quad.bottomLeft,
      ...(s.secondaryQuad
        ? [
            s.secondaryQuad.topLeft,
            s.secondaryQuad.topRight,
            s.secondaryQuad.bottomRight,
            s.secondaryQuad.bottomLeft,
          ]
        : []),
      ...(s.polygonPoints || []),
    ];
    for (const p of pts) {
      xs.push(p.x);
      ys.push(p.y);
    }
  }
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    minY,
    maxX,
    maxY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function getTargetExportSize(
  format: MarketingExportFormatType,
  srcW: number,
  srcH: number
): { width: number; height: number } {
  if (format === '1:1') return { width: 1080, height: 1080 };
  if (format === '4:5') return { width: 1080, height: 1350 };
  if (format === '16:9') return { width: 1920, height: 1080 };
  if (format === '9:16') return { width: 1080, height: 1920 };
  return { width: srcW, height: srcH };
}

function drawBrandKitBannerBar(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  brandKit: BrandKitOverlayOptions,
  focalCenterYNorm: number
) {
  if (!brandKit.enabled) return;

  const rawSite = (brandKit.websiteDomain || 'toantrung.com.vn').trim();
  const rawHead = (brandKit.headlineText || 'GIẢI PHÁP MÀN HÌNH LED CHUYÊN NGHIỆP').trim();
  const rawCta = (brandKit.ctaText || 'KHẢO SÁT & TƯ VẤN').trim();

  // Zero-PII safety check before stamping text onto any public marketing output
  const safeSite = containsCustomerPiiInPrompt(rawSite).hasPii ? 'toantrung.com.vn' : rawSite;
  const safeHead = containsCustomerPiiInPrompt(rawHead).hasPii
    ? 'GIẢI PHÁP MÀN HÌNH LED CHUYÊN NGHIỆP'
    : rawHead;
  const safeCta = containsCustomerPiiInPrompt(rawCta).hasPii ? 'TƯ VẤN NGAY' : rawCta;

  const primaryColor = /^#[0-9a-f]{6}$/i.test(brandKit.primaryColor || '')
    ? (brandKit.primaryColor as string)
    : '#1E3A8A';

  // Place bar at bottom unless focal LED sits near bottom, in which case place neatly at top
  const putTop = focalCenterYNorm > 0.68;
  const barH = Math.max(76, Math.round(H * 0.11));
  const barY = putTop ? 0 : H - barH;

  ctx.save();
  const grad = ctx.createLinearGradient(0, barY, W, barY + barH);
  grad.addColorStop(0, primaryColor);
  grad.addColorStop(1, '#0F172A');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.94;
  ctx.fillRect(0, barY, W, barH);
  ctx.globalAlpha = 1;

  // Accent top/bottom line
  ctx.fillStyle = '#FDE047';
  ctx.fillRect(0, putTop ? barH - 3 : barY, W, 3);

  const padX = Math.round(W * 0.032);
  const titleFont = Math.max(15, Math.round(barH * 0.28));
  const siteFont = Math.max(12, Math.round(barH * 0.2));

  // Left: ToanTrung Brand Badge + Headline
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${titleFont}px sans-serif`;
  ctx.fillText(safeHead.slice(0, 44).toUpperCase(), padX, barY + barH * 0.38);

  ctx.fillStyle = '#93C5FD';
  ctx.font = `700 ${siteFont}px sans-serif`;
  ctx.fillText(`TOÀN TRUNG LED  ·  ${safeSite.toLowerCase()}`, padX, barY + barH * 0.72);

  // Right: CTA Pill
  ctx.font = `800 ${siteFont}px sans-serif`;
  const ctaText = safeCta.slice(0, 24).toUpperCase();
  const pillW = Math.min(W * 0.34, Math.max(130, ctx.measureText(ctaText).width + 34));
  const pillH = Math.round(barH * 0.54);
  const pillX = W - padX - pillW;
  const pillY = barY + (barH - pillH) / 2;
  ctx.fillStyle = '#FDE047';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.fillText(ctaText, pillX + pillW / 2, pillY + pillH / 2 + 1);
  ctx.restore();
}

/**
 * Smart Focal Multi-Channel Export:
 * Crops around the union centroid of all placed LED screens so the LED screen is NEVER cut off.
 */
export function renderSmartFocalChannelDataUrl(params: {
  compositeCanvas: HTMLCanvasElement;
  screens: LedScreenInstanceDto[];
  format: MarketingExportFormatType;
  brandKit?: BrandKitOverlayOptions;
}): string {
  const { compositeCanvas, screens, format, brandKit } = params;
  const srcW = compositeCanvas.width || 1280;
  const srcH = compositeCanvas.height || 720;
  const { width: dstW, height: dstH } = getTargetExportSize(format, srcW, srcH);

  const out = document.createElement('canvas');
  out.width = dstW;
  out.height = dstH;
  const ctx = out.getContext('2d');
  if (!ctx) return '';

  const focal = computeScreensUnionFocalBox(screens);

  if (format === 'original') {
    ctx.drawImage(compositeCanvas, 0, 0, dstW, dstH);
    if (brandKit?.enabled) {
      drawBrandKitBannerBar(ctx, dstW, dstH, brandKit, focal.centerY / 100);
    }
    return out.toDataURL('image/png');
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  let cropX = 0;
  let cropY = 0;
  let cropW = srcW;
  let cropH = srcH;

  if (Math.abs(srcAspect - dstAspect) > 0.02) {
    if (srcAspect > dstAspect) {
      // Wide source -> narrower target (1:1, 4:5, 9:16): center around focal.centerX
      cropW = Math.round(srcH * dstAspect);
      const desiredCenterPx = (focal.centerX / 100) * srcW;
      cropX = Math.max(0, Math.min(srcW - cropW, Math.round(desiredCenterPx - cropW / 2)));
    } else {
      // Tall source -> wider target (16:9): center around focal.centerY
      cropH = Math.round(srcW / dstAspect);
      const desiredCenterPy = (focal.centerY / 100) * srcH;
      cropY = Math.max(0, Math.min(srcH - cropH, Math.round(desiredCenterPy - cropH / 2)));
    }
  }

  ctx.drawImage(compositeCanvas, cropX, cropY, cropW, cropH, 0, 0, dstW, dstH);

  if (brandKit?.enabled) {
    const newFocalYNorm = ((focal.centerY / 100) * srcH - cropY) / Math.max(1, cropH);
    drawBrandKitBannerBar(ctx, dstW, dstH, brandKit, newFocalYNorm);
  }

  return out.toDataURL('image/png');
}

/**
 * 1-Click Before-After Showcase Generator (3 Social-ready layouts).
 */
export function renderBeforeAfterShowcaseDataUrl(params: {
  originalImg: HTMLImageElement;
  compositeCanvas: HTMLCanvasElement;
  layout: 'split_vertical' | 'split_horizontal' | 'diagonal';
  brandKit?: BrandKitOverlayOptions;
}): string {
  const { originalImg, compositeCanvas, layout, brandKit } = params;
  const srcW = compositeCanvas.width || 1280;
  const srcH = compositeCanvas.height || 720;

  const W = 1440;
  const H = Math.round(W * (srcH / Math.max(1, srcW)));
  const out = document.createElement('canvas');
  out.width = W;
  out.height = H;
  const ctx = out.getContext('2d');
  if (!ctx) return '';

  // Base right / bottom: After LED composite
  ctx.drawImage(compositeCanvas, 0, 0, W, H);

  // Overlay left / top / diagonal: Before original site photo
  ctx.save();
  ctx.beginPath();
  if (layout === 'split_vertical') {
    ctx.rect(0, 0, W * 0.5, H);
  } else if (layout === 'split_horizontal') {
    ctx.rect(0, 0, W, H * 0.5);
  } else {
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.56, 0);
    ctx.lineTo(W * 0.44, H);
    ctx.lineTo(0, H);
    ctx.closePath();
  }
  ctx.clip();
  ctx.drawImage(originalImg, 0, 0, W, H);
  ctx.restore();

  // Crisp glowing divider line
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 5;
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  if (layout === 'split_vertical') {
    ctx.moveTo(W * 0.5, 0);
    ctx.lineTo(W * 0.5, H);
  } else if (layout === 'split_horizontal') {
    ctx.moveTo(0, H * 0.5);
    ctx.lineTo(W, H * 0.5);
  } else {
    ctx.moveTo(W * 0.56, 0);
    ctx.lineTo(W * 0.44, H);
  }
  ctx.stroke();
  ctx.restore();

  // Labels ("TRƯỚC KHI LẮP" & "SAU KHI LẮP MÀN HÌNH LED")
  const drawPill = (label: string, x: number, y: number, bg: string, alignRight = false) => {
    ctx.save();
    ctx.font = '800 18px sans-serif';
    const textW = ctx.measureText(label).width;
    const pw = textW + 32;
    const ph = 38;
    const px = alignRight ? x - pw : x;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(px, y, pw, ph, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px + pw / 2, y + ph / 2 + 1);
    ctx.restore();
  };

  drawPill('📷 TRƯỚC KHI LẮP', 24, 24, 'rgba(15, 23, 42, 0.88)');
  drawPill(
    '✨ SAU KHI LẮP MÀN HÌNH LED',
    W - 24,
    layout === 'split_horizontal' ? H * 0.5 + 20 : 24,
    'rgba(21, 83, 162, 0.94)',
    true
  );

  if (brandKit?.enabled) {
    drawBrandKitBannerBar(ctx, W, H, brandKit, 0.45);
  }

  return out.toDataURL('image/png');
}

export function triggerBrowserImageDownload(dataUrl: string, fileName: string) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
