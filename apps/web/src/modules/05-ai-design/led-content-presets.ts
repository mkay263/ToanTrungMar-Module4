'use client';

import type { DesignBriefDto, LedScreenShapeType } from '@toantrung/contracts';

export interface LedContentPresetItem {
  id: string;
  label: string;
  category: string;
  defaultHeadline: string;
  defaultSubheadline: string;
  defaultCta: string;
  palette: [string, string, string];
  accentColor: string;
  transparentMode?: boolean;
  recommendedShapes?: LedScreenShapeType[];
  pattern: 'rays' | 'grid' | 'waves' | 'emblem' | 'grid_kpi' | 'neon_3d' | 'flag' | 'cosmos';
}

export const LED_CONTENT_PRESETS: LedContentPresetItem[] = [
  {
    id: 'opening_red_gold',
    label: 'Lễ Khai Trương Hồng Phát',
    category: 'Sự kiện',
    defaultHeadline: 'CHÚC MỪNG KHAI TRƯƠNG',
    defaultSubheadline: 'KHỞI ĐẦU THÀNH CÔNG — VỮNG BƯỚC VƯƠN XA',
    defaultCta: 'ƯU ĐÃI ĐẶC BIỆT HÔM NAY',
    palette: ['#5B0812', '#B91C1C', '#7F1D1D'],
    accentColor: '#FDE047',
    pattern: 'rays',
  },
  {
    id: 'conference_gov',
    label: 'Hội Nghị / Đại Hội Cơ Quan',
    category: 'Hội trường',
    defaultHeadline: 'HỘI NGHỊ TỔNG KẾT CÔNG TÁC',
    defaultSubheadline: 'ĐOÀN KẾT — KỶ CƯƠNG — ĐỔI MỚI — PHÁT TRIỂN',
    defaultCta: 'NĂM CÔNG TÁC 2026',
    palette: ['#7F1D1D', '#DC2626', '#991B1B'],
    accentColor: '#FEF08A',
    pattern: 'emblem',
  },
  {
    id: 'corp_meeting',
    label: 'Phòng Họp & Điều Hành Số',
    category: 'Doanh nghiệp',
    defaultHeadline: 'HỌP GIAO BAN CHIẾN LƯỢC',
    defaultSubheadline: 'BÁO CÁO HIỆU SUẤT KINH DOANH & MỤC TIÊU QUÝ',
    defaultCta: 'TOÀN TRUNG DIGITAL DISPLAY',
    palette: ['#09152B', '#1E3A8A', '#0284C7'],
    accentColor: '#38BDF8',
    pattern: 'grid',
  },
  {
    id: 'showroom_auto',
    label: 'Showroom Ô Tô & Công Nghệ',
    category: 'Showroom',
    defaultHeadline: 'TRẢI NGHIỆM CÔNG NGHỆ TƯƠNG LAI',
    defaultSubheadline: 'HIỂN THỊ ULTRA HD 4K — SẮC NÉT TỪNG CHI TIẾT',
    defaultCta: 'ĐĂNG KÝ LÁI THỬ NGAY',
    palette: ['#030712', '#111827', '#0F172A'],
    accentColor: '#22D3EE',
    pattern: 'waves',
  },
  {
    id: 'showroom_luxury',
    label: 'Showroom Nội Thất & BĐS',
    category: 'Showroom',
    defaultHeadline: 'KIẾN TẠO KHÔNG GIAN THƯỢNG LƯU',
    defaultSubheadline: 'TINH HOA THIẾT KẾ HIỆN ĐẠI & ĐẲNG CẤP',
    defaultCta: 'TƯ VẤN KIẾN TRÚC',
    palette: ['#1C1917', '#44403C', '#292524'],
    accentColor: '#FBBF24',
    pattern: 'rays',
  },
  {
    id: 'stage_gala',
    label: 'Sân Khấu Gala & Ca Nhạc',
    category: 'Sân khấu',
    defaultHeadline: 'GALA DINNER — SHINING NIGHT',
    defaultSubheadline: 'BÙNG NỔ CẢM XÚC — KẾT NỐI ĐAM MÊ',
    defaultCta: 'WELCOME ALL GUESTS',
    palette: ['#1E1B4B', '#581C87', '#0F172A'],
    accentColor: '#F472B6',
    pattern: 'waves',
  },
  {
    id: 'wedding_gold',
    label: 'Trung Tâm Tiệc Cưới Sang Trọng',
    category: 'Tiệc cưới',
    defaultHeadline: 'HAPPY WEDDING DAY',
    defaultSubheadline: 'TRĂM NĂM HẠNH PHÚC — VIÊN MÃN TRỌN ĐỜI',
    defaultCta: 'LUXURY BALLROOM',
    palette: ['#2E1065', '#4C1D95', '#831843'],
    accentColor: '#FDE68A',
    pattern: 'rays',
  },
  {
    id: 'naked_eye_3d',
    label: 'LED 3D Naked-Eye Góc Tòa Nhà',
    category: 'Ngoài trời 3D',
    defaultHeadline: 'NEXT-GEN 3D BILLBOARD',
    defaultSubheadline: 'HIỆU ỨNG NỔI KHỐI KHÔNG CẦN KÍNH',
    defaultCta: 'OUTDOOR UHD P4',
    recommendedShapes: ['corner_90_smooth', 'curved_arc'],
    palette: ['#042F2E', '#0F766E', '#0E7490'],
    accentColor: '#67E8F9',
    pattern: 'neon_3d',
  },
  {
    id: 'transparent_neon_3d',
    label: 'LED Trong Suốt Vách Kính (Nền Đen)',
    category: 'Trong suốt',
    defaultHeadline: 'NEW COLLECTION 2026',
    defaultSubheadline: 'TRANSPARENT GLASS LED 75%',
    defaultCta: 'DISCOVER NOW',
    transparentMode: true,
    recommendedShapes: ['transparent_glass'],
    palette: ['#000000', '#000000', '#020617'],
    accentColor: '#38BDF8',
    pattern: 'neon_3d',
  },
  {
    id: 'transparent_luxury',
    label: 'LED Kính Showroom Vàng Kim (Nền Đen)',
    category: 'Trong suốt',
    defaultHeadline: 'LUXURY BOUTIQUE DISPLAY',
    defaultSubheadline: 'XUYÊN SÁNG SANG TRỌNG SAU VÁCH KÍNH',
    defaultCta: 'EXCLUSIVE SHOWROOM',
    transparentMode: true,
    recommendedShapes: ['transparent_glass'],
    palette: ['#000000', '#000000', '#000000'],
    accentColor: '#FDE047',
    pattern: 'rays',
  },
  {
    id: 'circle_brand_emblem',
    label: 'Màn Tròn / Oval Tâm Logo',
    category: 'Sáng tạo',
    defaultHeadline: 'TOÀN TRUNG LED',
    defaultSubheadline: 'GIẢI PHÁP HIỂN THỊ CHUYÊN NGHIỆP',
    defaultCta: '360° VISUAL',
    recommendedShapes: ['circle_oval', 'cylindrical_column'],
    palette: ['#09152B', '#1D4ED8', '#0284C7'],
    accentColor: '#FDE047',
    pattern: 'emblem',
  },
  {
    id: 'standee_welcome',
    label: 'Standee LED Đón Khách Sảnh',
    category: 'Standee GOB',
    defaultHeadline: 'CHÀO MỪNG QUÝ KHÁCH',
    defaultSubheadline: 'SẢNH ĐÓN TIẾP & THÔNG TIN SỰ KIỆN',
    defaultCta: 'MỜI VÀO THAM QUAN',
    recommendedShapes: ['led_standee', 'cylindrical_column'],
    palette: ['#0F172A', '#1E40AF', '#0369A1'],
    accentColor: '#60A5FA',
    pattern: 'waves',
  },
  {
    id: 'floor_galaxy',
    label: 'Sân Khấu LED Sàn Ngân Hà',
    category: 'Sàn / Trần',
    defaultHeadline: 'INTERACTIVE LED FLOOR',
    defaultSubheadline: 'BƯỚC CHÂN ÁNH SÁNG ĐA CHIỀU',
    defaultCta: '4K STAGE TECH',
    recommendedShapes: ['led_floor'],
    palette: ['#020617', '#1E1B4B', '#312E81'],
    accentColor: '#38BDF8',
    pattern: 'cosmos',
  },
  {
    id: 'ceiling_sky',
    label: 'LED Trần Vòm Bầu Trời',
    category: 'Sàn / Trần',
    defaultHeadline: 'DIGITAL SKY CEILING',
    defaultSubheadline: 'KHÔNG GIAN ÁNH SÁNG VÔ CỰC',
    defaultCta: 'ARCHITECTURAL LED',
    recommendedShapes: ['led_ceiling'],
    palette: ['#020617', '#0C4A6E', '#164E63'],
    accentColor: '#7DD3FC',
    pattern: 'cosmos',
  },
  {
    id: 'factory_andon',
    label: 'Bảng Điện Tử Nhà Máy KPI',
    category: 'Công nghiệp',
    defaultHeadline: 'BẢNG THEO DÕI SẢN XUẤT LIVE',
    defaultSubheadline: 'KẾ HOẠCH: 1,250 · THỰC ĐẠT: 1,180 · CHẤT LƯỢNG: 99.4%',
    defaultCta: 'ANDON FACTORY SYSTEM',
    palette: ['#022C22', '#065F46', '#064E3B'],
    accentColor: '#34D399',
    pattern: 'grid_kpi',
  },
  {
    id: 'vietnam_celebration',
    label: 'Quốc Kỳ & Lễ Kỷ Niệm Lớn',
    category: 'Lễ kỷ niệm',
    defaultHeadline: 'CHÀO MỪNG NGÀY LỄ TRỌNG ĐẠI',
    defaultSubheadline: 'TỰ HÀO VIỆT NAM — VƯƠN TẦM THỜI ĐẠI',
    defaultCta: 'TOÀN TRUNG LIGHTING',
    palette: ['#991B1B', '#DA251D', '#B91C1C'],
    accentColor: '#FFFF00',
    pattern: 'flag',
  },
];

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

/**
 * Renders any built-in LED preset to a crisp Canvas with optional Marketing Brief overrides.
 */
export function renderPresetToCanvas(
  presetId: string,
  width = 1280,
  height = 720,
  brief?: DesignBriefDto | null,
  targetCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const preset =
    LED_CONTENT_PRESETS.find((p) => p.id === presetId) || LED_CONTENT_PRESETS[0];
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const isPortrait = height > width * 1.1;
  const headline = (brief?.headlineText?.trim() || preset.defaultHeadline).toUpperCase();
  const subheadline =
    brief?.subheadlineText?.trim() ||
    (brief?.campaignName ? `${brief.campaignName} · ${preset.defaultSubheadline}` : preset.defaultSubheadline);
  const cta = (brief?.ctaText?.trim() || preset.defaultCta).toUpperCase();
  const website = brief?.websiteDomain?.trim() || 'TOANTRUNG.COM.VN';

  // Background gradient
  if (preset.transparentMode) {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);
  } else {
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, preset.palette[0]);
    grad.addColorStop(0.52, preset.palette[1]);
    grad.addColorStop(1, preset.palette[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  }

  // Pattern graphics
  ctx.save();
  if (preset.pattern === 'rays') {
    const glow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      Math.min(width, height) * 0.05,
      width * 0.5,
      height * 0.45,
      Math.max(width, height) * 0.68
    );
    glow.addColorStop(0, preset.transparentMode ? 'rgba(253,224,71,0.34)' : 'rgba(255,255,255,0.22)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
  } else if (preset.pattern === 'waves' || preset.pattern === 'neon_3d') {
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      const baseY = height * (0.25 + i * 0.17);
      ctx.moveTo(0, baseY);
      ctx.bezierCurveTo(
        width * 0.3,
        baseY - height * 0.14,
        width * 0.7,
        baseY + height * 0.14,
        width,
        baseY - height * 0.04
      );
      ctx.strokeStyle = i % 2 === 0 ? `${preset.accentColor}88` : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.012));
      ctx.stroke();
    }
  } else if (preset.pattern === 'grid' || preset.pattern === 'grid_kpi') {
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = Math.round(Math.min(width, height) / 10);
    for (let x = 0; x < width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (preset.pattern === 'cosmos') {
    const neb = ctx.createRadialGradient(width * 0.5, height * 0.5, 10, width * 0.5, height * 0.5, width * 0.55);
    neb.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
    neb.addColorStop(0.5, 'rgba(139, 92, 246, 0.25)');
    neb.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (let i = 0; i < 65; i++) {
      const sx = ((i * 197) % 97) * 0.01 * width;
      const sy = ((i * 313) % 89) * 0.01 * height;
      const r = (i % 3) + 1;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (preset.pattern === 'flag') {
    const cx = width * 0.5;
    const cy = height * 0.45;
    const outerR = Math.min(width, height) * 0.24;
    const innerR = outerR * 0.382;
    ctx.shadowColor = 'rgba(255, 255, 0, 0.5)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#FFFF00';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    return canvas;
  } else if (preset.pattern === 'emblem') {
    const r = Math.min(width, height) * 0.38;
    ctx.strokeStyle = preset.accentColor;
    ctx.lineWidth = Math.max(3, Math.round(r * 0.03));
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.5, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Inner luminous border
  if (!preset.transparentMode) {
    ctx.save();
    ctx.strokeStyle = `${preset.accentColor}55`;
    ctx.lineWidth = Math.max(3, Math.round(Math.min(width, height) * 0.01));
    ctx.strokeRect(18, 18, width - 36, height - 36);
    ctx.restore();
  }

  // Typography centered cleanly
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const brandSize = Math.max(14, Math.round(Math.min(width, height) * (isPortrait ? 0.032 : 0.028)));
  ctx.fillStyle = preset.accentColor;
  ctx.font = `800 ${brandSize}px sans-serif`;
  ctx.fillText(website.toUpperCase(), width * 0.5, height * (isPortrait ? 0.24 : 0.23));

  const titleSize = Math.max(24, Math.round(Math.min(width, height) * (isPortrait ? 0.072 : 0.088)));
  ctx.font = `900 ${titleSize}px sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.shadowColor = preset.transparentMode ? preset.accentColor : 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = preset.transparentMode ? 18 : 10;
  const titleLines = wrapCanvasLines(ctx, headline, width * 0.82);
  const titleLineH = titleSize * 1.18;
  const titleStartY = height * 0.45 - ((titleLines.length - 1) * titleLineH) / 2;
  titleLines.forEach((line, i) => {
    ctx.fillText(line, width * 0.5, titleStartY + i * titleLineH);
  });

  ctx.shadowBlur = 0;
  const subSize = Math.max(15, Math.round(Math.min(width, height) * (isPortrait ? 0.034 : 0.036)));
  ctx.font = `600 ${subSize}px sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText(subheadline.slice(0, 56), width * 0.5, height * (isPortrait ? 0.65 : 0.68));

  // CTA Pill
  const ctaSize = Math.max(13, Math.round(Math.min(width, height) * 0.026));
  ctx.font = `800 ${ctaSize}px sans-serif`;
  const pillW = Math.min(width * 0.72, Math.max(180, ctx.measureText(cta).width + 48));
  const pillH = Math.round(ctaSize * 2.1);
  const pillX = width * 0.5 - pillW * 0.5;
  const pillY = height * (isPortrait ? 0.76 : 0.79);
  ctx.fillStyle = preset.accentColor;
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.fillStyle = '#0F172A';
  ctx.fillText(cta.slice(0, 32), width * 0.5, pillY + pillH / 2 + 1);
  ctx.restore();

  return canvas;
}

const presetThumbCache = new Map<string, string>();

export function getPresetPreviewDataUrl(presetId: string, brief?: DesignBriefDto | null): string {
  const key = `${presetId}:${brief?.headlineText || ''}:${brief?.brandPrimaryColor || ''}:${brief?.websiteDomain || ''}`;
  const cached = presetThumbCache.get(key);
  if (cached) return cached;
  if (typeof document === 'undefined') return '';
  const c = renderPresetToCanvas(presetId, 320, 180, brief);
  const url = c.toDataURL('image/jpeg', 0.84);
  if (presetThumbCache.size > 80) presetThumbCache.clear();
  presetThumbCache.set(key, url);
  return url;
}
