'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LED_SCREEN_SHAPES,
  LED_SCREEN_SHAPE_META,
  type AiProviderId,
  type DesignBriefDto,
  type DesignRequestItemDto,
  type LedPlacementRecipeDto,
  type LedScreenInstanceDto,
  type LedScreenShapeType,
  type MarketingExportFormatType,
} from '@toantrung/contracts';
import {
  Brush,
  Copy,
  Download,
  Eraser,
  Eye,
  Layers,
  Loader2,
  MousePointerClick,
  Plus,
  Save,
  Sliders,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  Zap,
} from 'lucide-react';
import { apiRequest } from '@/core/http/client';
import {
  getPresetPreviewDataUrl,
  LED_CONTENT_PRESETS,
  renderPresetToCanvas,
} from './led-content-presets';
import {
  buildVisionAnnotatedBase64,
  canonicalizeQuadClient,
  createDefaultScreenInstance,
  createMultiScreenPreset,
  exportGuidedAndMaskPngs,
  renderMultiScreenLedScene,
  type ClientPoint2D,
} from './led-geometry-engine';
import {
  renderBeforeAfterShowcaseDataUrl,
  renderSmartFocalChannelDataUrl,
  triggerBrowserImageDownload,
  type BrandKitOverlayOptions,
} from './marketing-export-kit';

const STORAGE_RECIPES_KEY = 'toantrung:led_quick_recipes_v1';

export interface LedQuickInstallWizardProps {
  project: DesignRequestItemDto | null;
  selectedPhoto: DesignRequestItemDto['photos'][number] | null;
  resolvedSitePhotoUrl: string;
  companyProductPhotos: DesignRequestItemDto['photos'];
  activeBrief: DesignBriefDto;
  canUseAiDesign: boolean;
  csrfToken?: string;
  selectedProviderId?: AiProviderId;
  selectedModelId?: string;
  onUploadSitePhotosClick: () => void;
  onCreateProjectClick: () => void;
  onRefreshProject: (projectId: number) => Promise<void>;
  onToast: (msg: string) => void;
  onError: (msg: string) => void;
}

type ToolMode = 'click_snap' | 'edit_handles' | 'occlusion_brush';
type ContentSourceTab = 'presets' | 'images' | 'ai_draw';
type DragTarget =
  | { type: 'quad_corner'; screenId: string; corner: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' }
  | { type: 'sec_corner'; screenId: string; corner: 'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft' }
  | { type: 'poly_vertex'; screenId: string; idx: number }
  | { type: 'curve_top'; screenId: string }
  | { type: 'curve_bottom'; screenId: string }
  | { type: 'move_screen'; screenId: string; startPt: ClientPoint2D };

const PRIMARY_6_SHAPES: LedScreenShapeType[] = [
  'flat_rect',
  'rounded_rect',
  'circle_oval',
  'free_polygon',
  'curved_arc',
  'transparent_glass',
];

const SHAPE_ICONS: Record<LedScreenShapeType, string> = {
  flat_rect: '▭',
  rounded_rect: '▢',
  circle_oval: '◯',
  free_polygon: '⬠',
  curved_arc: '◠',
  corner_90_smooth: '◷',
  cylindrical_column: '🛢️',
  multi_segment_wave: '∿',
  transparent_glass: '🪟',
  led_floor: '⬓',
  led_ceiling: '⬒',
  led_standee: '🧍',
};

export function LedQuickInstallWizard({
  project,
  selectedPhoto,
  resolvedSitePhotoUrl,
  companyProductPhotos,
  activeBrief,
  canUseAiDesign,
  csrfToken,
  selectedProviderId,
  selectedModelId,
  onUploadSitePhotosClick,
  onCreateProjectClick,
  onRefreshProject,
  onToast,
  onError,
}: LedQuickInstallWizardProps) {
  const effectiveBrief = useMemo<DesignBriefDto>(
    () => ({
      ...(project?.designBrief || {}),
      ...activeBrief,
    }),
    [project?.designBrief, activeBrief]
  );

  // Screens list (multi-screen & 12 shapes) + Undo Stack
  const [screens, setScreens] = useState<LedScreenInstanceDto[]>(() => [
    createDefaultScreenInstance('flat_rect', { x: 50, y: 44 }, 1, 'opening_red_gold'),
  ]);
  const [undoStack, setUndoStack] = useState<LedScreenInstanceDto[][]>([]);
  const [activeScreenId, setActiveScreenId] = useState<string>('');
  const [showAll12Shapes, setShowAll12Shapes] = useState(false);

  // Tooling states
  const [toolMode, setToolMode] = useState<ToolMode>('edit_handles');
  const [holdOriginal, setHoldOriginal] = useState(false);
  const [brushSizePx, setBrushSizePx] = useState(26);
  const [brushEraseMode, setBrushEraseMode] = useState(false);
  const [hasOcclusionStrokes, setHasOcclusionStrokes] = useState(false);

  // Content Source states (Step 3)
  const [contentTab, setContentTab] = useState<ContentSourceTab>('presets');
  const [customContentPrompt, setCustomContentPrompt] = useState('');
  const [generatingContent, setGeneratingContent] = useState(false);
  const [uploadedContentMap, setUploadedContentMap] = useState<Record<string, HTMLImageElement>>({});
  const [aiGeneratedContentUrls, setAiGeneratedContentUrls] = useState<Record<string, string>>({});

  // Processing states
  const [detectingSnap, setDetectingSnap] = useState(false);
  const [snapReason, setSnapReason] = useState<string | null>(null);
  const [submittingFast, setSubmittingFast] = useState(false);
  const [submittingAi, setSubmittingAi] = useState(false);
  const [generatingAbPack, setGeneratingAbPack] = useState(false);
  const [abResultSummary, setAbResultSummary] = useState<
    Array<{ versionNumber: number; label: string; downloadUrl: string }>
  >([]);

  // Marketing Turbo Kit states
  const [beforeAfterLayout, setBeforeAfterLayout] = useState<
    'split_vertical' | 'split_horizontal' | 'diagonal'
  >('split_vertical');
  const [beforeAfterPreviewUrl, setBeforeAfterPreviewUrl] = useState<string | null>(null);
  const [selectedMktFormat, setSelectedMktFormat] = useState<MarketingExportFormatType>('original');
  const [includeBrandKit, setIncludeBrandKit] = useState<boolean>(
    Boolean(effectiveBrief.websiteDomain || effectiveBrief.headlineText)
  );
  const [recipes, setRecipes] = useState<LedPlacementRecipeDto[]>([]);

  // Image & Canvas refs
  const [baseImg, setBaseImg] = useState<HTMLImageElement | null>(null);
  const [imgLoadError, setImgLoadError] = useState(false);
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const compositeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const occlusionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const occlusionVersionRef = useRef(0);
  const [occlusionTick, setOcclusionTick] = useState(0);

  // Dragging & cursor state for Loupe 2.5x
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const [cursorNorm, setCursorNorm] = useState<ClientPoint2D | null>(null);
  const isPaintingBrushRef = useRef(false);
  const lastBrushPtRef = useRef<ClientPoint2D | null>(null);
  const uploadContentInputRef = useRef<HTMLInputElement>(null);

  const activeScreen = useMemo(
    () => screens.find((s) => s.id === activeScreenId) || screens[0] || null,
    [screens, activeScreenId]
  );

  // Load saved recipes from localStorage
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_RECIPES_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) setRecipes(arr);
      }
    } catch {
      // ignore storage errors
    }
  }, []);

  // Sync initial screens when switching project
  const lastLoadedProjectIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!project) return;
    if (lastLoadedProjectIdRef.current === project.id) return;
    lastLoadedProjectIdRef.current = project.id;

    if (Array.isArray(project.ledScreens) && project.ledScreens.length > 0) {
      setScreens(project.ledScreens);
      setActiveScreenId(project.ledScreens[0].id);
    } else {
      const base = createDefaultScreenInstance('flat_rect', { x: 50, y: 44 }, 1, 'opening_red_gold');
      if (project.placementQuad) {
        base.quad = canonicalizeQuadClient([
          project.placementQuad.topLeft,
          project.placementQuad.topRight,
          project.placementQuad.bottomRight,
          project.placementQuad.bottomLeft,
        ]);
      }
      setScreens([base]);
      setActiveScreenId(base.id);
    }
    setUndoStack([]);
    setSnapReason(null);
    setAbResultSummary([]);
    setBeforeAfterPreviewUrl(null);
  }, [project]);

  // Multi-Photo Quick Queue: Load new base photo cleanly while preserving screens & Marketing config!
  const lastLoadedPhotoUrlRef = useRef<string>('');
  useEffect(() => {
    if (!resolvedSitePhotoUrl || !selectedPhoto) {
      setBaseImg(null);
      return;
    }
    setImgLoadError(false);
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setBaseImg(img);
      if (lastLoadedPhotoUrlRef.current !== resolvedSitePhotoUrl) {
        lastLoadedPhotoUrlRef.current = resolvedSitePhotoUrl;
        // Reset occlusion brush strokes for the newly switched site photo
        const occ = occlusionCanvasRef.current || document.createElement('canvas');
        occ.width = Math.min(1408, img.naturalWidth || 1280);
        occ.height = Math.round(occ.width * ((img.naturalHeight || 720) / Math.max(1, img.naturalWidth || 1280)));
        occ.getContext('2d')?.clearRect(0, 0, occ.width, occ.height);
        occlusionCanvasRef.current = occ;
        setHasOcclusionStrokes(false);
        setBeforeAfterPreviewUrl(null);
      }
    };
    img.onerror = () => {
      setImgLoadError(true);
      setBaseImg(null);
    };
    img.src = resolvedSitePhotoUrl;
  }, [resolvedSitePhotoUrl, selectedPhoto]);

  // Preload custom URL images for Company Product photos attached to screens
  useEffect(() => {
    for (const s of screens) {
      const url = s.contentImageUrl;
      if (!url || uploadedContentMap[url]) continue;
      const img = new window.Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        setUploadedContentMap((prev) => ({ ...prev, [url]: img }));
      };
      img.src = url;
    }
  }, [screens, uploadedContentMap]);

  const commitScreens = useCallback(
    (updater: (prev: LedScreenInstanceDto[]) => LedScreenInstanceDto[], pushUndo = true) => {
      setScreens((prev) => {
        if (pushUndo) {
          setUndoStack((u) => [...u.slice(-19), prev]);
        }
        return updater(prev);
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setScreens(last);
      return prev.slice(0, -1);
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleUndo]);

  const updateActiveScreen = useCallback(
    (patch: Partial<LedScreenInstanceDto>, pushUndo = false) => {
      if (!activeScreen) return;
      commitScreens(
        (prev) =>
          prev.map((s) => (s.id === activeScreen.id ? { ...s, ...patch } : s)),
        pushUndo
      );
    },
    [activeScreen, commitScreens]
  );

  // Build per-screen content canvas map
  const buildContentCanvasMap = useCallback((): Record<string, HTMLCanvasElement> => {
    const map: Record<string, HTMLCanvasElement> = {};
    for (const s of screens) {
      const customImg = s.contentImageUrl ? uploadedContentMap[s.contentImageUrl] : null;
      if (customImg && customImg.naturalWidth > 0) {
        const c = document.createElement('canvas');
        c.width = Math.min(1280, customImg.naturalWidth);
        c.height = Math.round(c.width * (customImg.naturalHeight / customImg.naturalWidth));
        c.getContext('2d')?.drawImage(customImg, 0, 0, c.width, c.height);
        map[s.id] = c;
      } else {
        const isPortrait =
          s.shapeType === 'led_standee' || s.shapeType === 'cylindrical_column';
        const cw = isPortrait ? 720 : 1280;
        const ch = isPortrait ? 1280 : 720;
        map[s.id] = renderPresetToCanvas(
          s.contentPresetId || 'opening_red_gold',
          cw,
          ch,
          effectiveBrief
        );
      }
    }
    return map;
  }, [screens, uploadedContentMap, effectiveBrief]);

  // Live 60fps Canvas Render Loop (composite + visual handles + 2.5x Magnifying Loupe)
  const redrawLiveCanvas = useCallback(() => {
    const display = displayCanvasRef.current;
    if (!display || !baseImg || !baseImg.naturalWidth) return;

    const natW = baseImg.naturalWidth;
    const natH = baseImg.naturalHeight;
    const scale = Math.min(1, 1280 / Math.max(natW, natH));
    const W = Math.max(320, Math.round(natW * scale));
    const H = Math.max(240, Math.round(natH * scale));

    if (display.width !== W || display.height !== H) {
      display.width = W;
      display.height = H;
    }

    const offscreen = compositeCanvasRef.current || document.createElement('canvas');
    offscreen.width = W;
    offscreen.height = H;
    compositeCanvasRef.current = offscreen;

    const offCtx = offscreen.getContext('2d');
    const dispCtx = display.getContext('2d');
    if (!offCtx || !dispCtx) return;

    const contentMap = buildContentCanvasMap();
    renderMultiScreenLedScene(
      offCtx,
      baseImg,
      screens,
      contentMap,
      hasOcclusionStrokes ? occlusionCanvasRef.current : null,
      { highQuality: !dragTarget }
    );

    dispCtx.clearRect(0, 0, W, H);
    if (holdOriginal) {
      dispCtx.drawImage(baseImg, 0, 0, W, H);
      dispCtx.save();
      dispCtx.fillStyle = 'rgba(15, 23, 42, 0.84)';
      dispCtx.fillRect(16, 16, 210, 32);
      dispCtx.fillStyle = '#FFFFFF';
      dispCtx.font = 'bold 13px sans-serif';
      dispCtx.fillText('📷 ĐANG XEM ẢNH GỐC', 28, 37);
      dispCtx.restore();
      return;
    }

    dispCtx.drawImage(offscreen, 0, 0, W, H);

    // Subtle visual highlight when user hovers/uses occlusion brush
    if (toolMode === 'occlusion_brush' && hasOcclusionStrokes && occlusionCanvasRef.current) {
      dispCtx.save();
      dispCtx.globalAlpha = 0.28;
      dispCtx.drawImage(occlusionCanvasRef.current, 0, 0, W, H);
      dispCtx.restore();
    }

    // Draw interactive control handles ONLY on display canvas (never baked into offscreen export!)
    if (toolMode === 'edit_handles' && activeScreen) {
      const drawDot = (pt: ClientPoint2D, label: string, color = '#06B6D4', radius = 9) => {
        const px = (pt.x / 100) * W;
        const py = (pt.y / 100) * H;
        dispCtx.save();
        dispCtx.beginPath();
        dispCtx.arc(px, py, radius, 0, Math.PI * 2);
        dispCtx.fillStyle = color;
        dispCtx.fill();
        dispCtx.lineWidth = 2.5;
        dispCtx.strokeStyle = '#FFFFFF';
        dispCtx.stroke();
        dispCtx.fillStyle = '#FFFFFF';
        dispCtx.font = '900 10px sans-serif';
        dispCtx.textAlign = 'center';
        dispCtx.textBaseline = 'middle';
        dispCtx.fillText(label, px, py + 0.5);
        dispCtx.restore();
      };

      dispCtx.save();
      dispCtx.setLineDash([6, 4]);
      dispCtx.strokeStyle = 'rgba(34, 211, 238, 0.9)';
      dispCtx.lineWidth = 2;

      if (activeScreen.shapeType === 'free_polygon' && activeScreen.polygonPoints) {
        const pts = activeScreen.polygonPoints;
        dispCtx.beginPath();
        pts.forEach((p, idx) => {
          const px = (p.x / 100) * W;
          const py = (p.y / 100) * H;
          if (idx === 0) dispCtx.moveTo(px, py);
          else dispCtx.lineTo(px, py);
        });
        dispCtx.closePath();
        dispCtx.stroke();
        dispCtx.restore();
        pts.forEach((p, idx) => drawDot(p, String(idx + 1), '#06B6D4', 9));
      } else {
        const q = activeScreen.quad;
        dispCtx.beginPath();
        dispCtx.moveTo((q.topLeft.x / 100) * W, (q.topLeft.y / 100) * H);
        dispCtx.lineTo((q.topRight.x / 100) * W, (q.topRight.y / 100) * H);
        dispCtx.lineTo((q.bottomRight.x / 100) * W, (q.bottomRight.y / 100) * H);
        dispCtx.lineTo((q.bottomLeft.x / 100) * W, (q.bottomLeft.y / 100) * H);
        dispCtx.closePath();
        dispCtx.stroke();

        if (activeScreen.shapeType === 'corner_90_smooth' && activeScreen.secondaryQuad) {
          const sq = activeScreen.secondaryQuad;
          dispCtx.beginPath();
          dispCtx.moveTo((sq.topLeft.x / 100) * W, (sq.topLeft.y / 100) * H);
          dispCtx.lineTo((sq.topRight.x / 100) * W, (sq.topRight.y / 100) * H);
          dispCtx.lineTo((sq.bottomRight.x / 100) * W, (sq.bottomRight.y / 100) * H);
          dispCtx.lineTo((sq.bottomLeft.x / 100) * W, (sq.bottomLeft.y / 100) * H);
          dispCtx.closePath();
          dispCtx.stroke();
          dispCtx.restore();
          drawDot(q.topLeft, '1', '#06B6D4');
          drawDot(q.topRight, 'G↑', '#F59E0B');
          drawDot(q.bottomRight, 'G↓', '#F59E0B');
          drawDot(q.bottomLeft, '4', '#06B6D4');
          drawDot(sq.topRight, 'R↑', '#8B5CF6');
          drawDot(sq.bottomRight, 'R↓', '#8B5CF6');
        } else {
          dispCtx.restore();
          drawDot(q.topLeft, 'A');
          drawDot(q.topRight, 'B');
          drawDot(q.bottomRight, 'C');
          drawDot(q.bottomLeft, 'D');

          // Curve sag control handles for curved_arc
          if (activeScreen.shapeType === 'curved_arc') {
            const topMid = {
              x: (q.topLeft.x + q.topRight.x) / 2,
              y: (q.topLeft.y + q.topRight.y) / 2 + (activeScreen.curveSagTopPct ?? -6),
            };
            const botMid = {
              x: (q.bottomLeft.x + q.bottomRight.x) / 2,
              y: (q.bottomLeft.y + q.bottomRight.y) / 2 + (activeScreen.curveSagBottomPct ?? 6),
            };
            drawDot(topMid, '⌒', '#F59E0B', 9);
            drawDot(botMid, '⌣', '#F59E0B', 9);
          }
        }
      }
    }

    // 2.5x Magnifier Loupe when dragging any handle corner
    if (dragTarget && dragTarget.type !== 'move_screen' && cursorNorm) {
      const cxPx = (cursorNorm.x / 100) * W;
      const cyPx = (cursorNorm.y / 100) * H;
      const loupeR = Math.min(72, Math.round(W * 0.08));
      const loupeX = cxPx > W * 0.5 ? Math.max(loupeR + 18, cxPx - loupeR * 2.1) : Math.min(W - loupeR - 18, cxPx + loupeR * 2.1);
      const loupeY = Math.max(loupeR + 18, Math.min(H - loupeR - 18, cyPx));
      const srcPatch = loupeR / 2.5;

      dispCtx.save();
      dispCtx.beginPath();
      dispCtx.arc(loupeX, loupeY, loupeR, 0, Math.PI * 2);
      dispCtx.clip();
      dispCtx.drawImage(
        offscreen,
        cxPx - srcPatch,
        cyPx - srcPatch,
        srcPatch * 2,
        srcPatch * 2,
        loupeX - loupeR,
        loupeY - loupeR,
        loupeR * 2,
        loupeR * 2
      );
      // Crosshair inside loupe
      dispCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
      dispCtx.lineWidth = 1.5;
      dispCtx.beginPath();
      dispCtx.moveTo(loupeX - loupeR, loupeY);
      dispCtx.lineTo(loupeX + loupeR, loupeY);
      dispCtx.moveTo(loupeX, loupeY - loupeR);
      dispCtx.lineTo(loupeX, loupeY + loupeR);
      dispCtx.stroke();
      dispCtx.restore();

      dispCtx.save();
      dispCtx.beginPath();
      dispCtx.arc(loupeX, loupeY, loupeR, 0, Math.PI * 2);
      dispCtx.lineWidth = 3;
      dispCtx.strokeStyle = '#FFFFFF';
      dispCtx.stroke();
      dispCtx.fillStyle = '#0F172A';
      dispCtx.fillRect(loupeX - 24, loupeY + loupeR - 18, 48, 16);
      dispCtx.fillStyle = '#38BDF8';
      dispCtx.font = 'bold 10px monospace';
      dispCtx.textAlign = 'center';
      dispCtx.fillText('2.5x', loupeX, loupeY + loupeR - 7);
      dispCtx.restore();
    }
  }, [
    baseImg,
    screens,
    activeScreen,
    buildContentCanvasMap,
    holdOriginal,
    toolMode,
    hasOcclusionStrokes,
    occlusionTick,
    dragTarget,
    cursorNorm,
  ]);

  useEffect(() => {
    const id = window.requestAnimationFrame(redrawLiveCanvas);
    return () => window.cancelAnimationFrame(id);
  }, [redrawLiveCanvas]);

  // 1-Click Vision Auto-Snap
  const triggerAutoSnap = useCallback(
    async (clickPt: ClientPoint2D | null, preferredShape?: LedScreenShapeType | null) => {
      if (!project || !baseImg || detectingSnap) return;
      setDetectingSnap(true);
      setSnapReason(null);
      try {
        const annotated = buildVisionAnnotatedBase64(baseImg, clickPt);
        const res = await apiRequest<{
          quad: LedScreenInstanceDto['quad'];
          recommendedShapeType: LedScreenShapeType;
          cornerRadiusPct: number;
          transparencyPct: number;
          recommendedPitch: string;
          reason: string;
          usedAiVision: boolean;
        }>(`/api/v1/design/${project.id}`, {
          method: 'POST',
          csrfToken,
          body: {
            action: 'auto_detect_led_placement',
            photoId: selectedPhoto?.id || null,
            clickPoint: clickPt,
            annotatedImageBase64: annotated,
            preferredShapeType: preferredShape || null,
          },
        });

        const targetShape = preferredShape || res.recommendedShapeType || 'flat_rect';
        commitScreens((prev) =>
          prev.map((s) =>
            s.id === activeScreen?.id
              ? {
                  ...s,
                  shapeType: targetShape,
                  quad: res.quad,
                  cornerRoundnessPct:
                    targetShape === 'rounded_rect'
                      ? Math.max(10, res.cornerRadiusPct || 12)
                      : res.cornerRadiusPct || 0,
                  cornerRadiiPct:
                    targetShape === 'rounded_rect'
                      ? {
                          tl: Math.max(10, res.cornerRadiusPct || 12),
                          tr: Math.max(10, res.cornerRadiusPct || 12),
                          br: Math.max(10, res.cornerRadiusPct || 12),
                          bl: Math.max(10, res.cornerRadiusPct || 12),
                        }
                      : s.cornerRadiiPct,
                  material: {
                    ...(s.material || {
                      transparencyPct: 0,
                      lumaKeyThreshold: 18,
                      hasGlassReflection: false,
                      floorGlassSpecular: 0,
                      cabinetGridStrength: 16,
                      bezelThicknessPx: 6,
                      brightnessPct: 102,
                      ambientSpillPct: 35,
                      floorReflectionPct: 0,
                      hasStandeeBase: false,
                    }),
                    transparencyPct:
                      targetShape === 'transparent_glass'
                        ? res.transparencyPct || 68
                        : 0,
                    hasStandeeBase: targetShape === 'led_standee',
                  },
                }
              : s
          )
        );
        setSnapReason(
          `${res.usedAiVision ? '✨ Vision AI' : '🎯 Khung thông minh'}: ${res.reason} (${LED_SCREEN_SHAPE_META[targetShape].shortLabel} · ${res.recommendedPitch})`
        );
        setToolMode('edit_handles');
        onToast('Đã tự động bắt khung đúng vị trí! Bạn có thể kéo nhẹ 4 đỉnh nếu muốn khít thêm.');
      } catch (err) {
        onError(err instanceof Error ? err.message : 'Không thể tự động dò vị trí lắp đặt.');
      } finally {
        setDetectingSnap(false);
      }
    },
    [project, baseImg, detectingSnap, csrfToken, selectedPhoto?.id, commitScreens, activeScreen?.id, onToast, onError]
  );

  // Canvas pointer handling
  const getCanvasNormPoint = (e: React.PointerEvent<HTMLCanvasElement>): ClientPoint2D => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return { x: 50, y: 50 };
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0.5, Math.min(99.5, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const y = Math.max(0.5, Math.min(99.5, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)) };
  };

  const paintOcclusionStroke = (ptNorm: ClientPoint2D, isStart: boolean) => {
    const occ = occlusionCanvasRef.current;
    if (!occ) return;
    const ctx = occ.getContext('2d');
    if (!ctx) return;

    const px = (ptNorm.x / 100) * occ.width;
    const py = (ptNorm.y / 100) * occ.height;
    ctx.save();
    ctx.globalCompositeOperation = brushEraseMode ? 'destination-out' : 'source-over';
    ctx.strokeStyle = 'rgba(15, 23, 42, 1)';
    ctx.fillStyle = 'rgba(15, 23, 42, 1)';
    ctx.lineWidth = brushSizePx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (isStart || !lastBrushPtRef.current) {
      ctx.beginPath();
      ctx.arc(px, py, brushSizePx / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo((lastBrushPtRef.current.x / 100) * occ.width, (lastBrushPtRef.current.y / 100) * occ.height);
      ctx.lineTo(px, py);
      ctx.stroke();
    }
    ctx.restore();
    lastBrushPtRef.current = ptNorm;
    setHasOcclusionStrokes(true);
    occlusionVersionRef.current += 1;
    setOcclusionTick((t) => t + 1);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!baseImg) return;
    const pt = getCanvasNormPoint(e);
    setCursorNorm(pt);

    if (toolMode === 'click_snap') {
      void triggerAutoSnap(pt, activeScreen?.shapeType || null);
      return;
    }

    if (toolMode === 'occlusion_brush') {
      e.currentTarget.setPointerCapture(e.pointerId);
      isPaintingBrushRef.current = true;
      paintOcclusionStroke(pt, true);
      return;
    }

    if (!activeScreen) return;
    e.currentTarget.setPointerCapture(e.pointerId);

    const hitDist = 4.2;
    if (activeScreen.shapeType === 'free_polygon' && activeScreen.polygonPoints) {
      const idx = activeScreen.polygonPoints.findIndex((p) => Math.hypot(p.x - pt.x, p.y - pt.y) < hitDist);
      if (idx >= 0) {
        setUndoStack((u) => [...u.slice(-19), screens]);
        setDragTarget({ type: 'poly_vertex', screenId: activeScreen.id, idx });
        return;
      }
    }

    if (activeScreen.shapeType === 'corner_90_smooth' && activeScreen.secondaryQuad) {
      const secCorners: Array<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'> = [
        'topRight',
        'bottomRight',
      ];
      for (const c of secCorners) {
        const cp = activeScreen.secondaryQuad[c];
        if (Math.hypot(cp.x - pt.x, cp.y - pt.y) < hitDist) {
          setUndoStack((u) => [...u.slice(-19), screens]);
          setDragTarget({ type: 'sec_corner', screenId: activeScreen.id, corner: c });
          return;
        }
      }
    }

    if (activeScreen.shapeType === 'curved_arc') {
      const q = activeScreen.quad;
      const topMid = {
        x: (q.topLeft.x + q.topRight.x) / 2,
        y: (q.topLeft.y + q.topRight.y) / 2 + (activeScreen.curveSagTopPct ?? -6),
      };
      const botMid = {
        x: (q.bottomLeft.x + q.bottomRight.x) / 2,
        y: (q.bottomLeft.y + q.bottomRight.y) / 2 + (activeScreen.curveSagBottomPct ?? 6),
      };
      if (Math.hypot(topMid.x - pt.x, topMid.y - pt.y) < hitDist) {
        setUndoStack((u) => [...u.slice(-19), screens]);
        setDragTarget({ type: 'curve_top', screenId: activeScreen.id });
        return;
      }
      if (Math.hypot(botMid.x - pt.x, botMid.y - pt.y) < hitDist) {
        setUndoStack((u) => [...u.slice(-19), screens]);
        setDragTarget({ type: 'curve_bottom', screenId: activeScreen.id });
        return;
      }
    }

    const corners: Array<'topLeft' | 'topRight' | 'bottomRight' | 'bottomLeft'> = [
      'topLeft',
      'topRight',
      'bottomRight',
      'bottomLeft',
    ];
    for (const c of corners) {
      const cp = activeScreen.quad[c];
      if (Math.hypot(cp.x - pt.x, cp.y - pt.y) < hitDist) {
        setUndoStack((u) => [...u.slice(-19), screens]);
        setDragTarget({ type: 'quad_corner', screenId: activeScreen.id, corner: c });
        return;
      }
    }

    // Check if user clicked inside another screen in multi-screen scene to select & move it
    for (let i = screens.length - 1; i >= 0; i--) {
      const sc = screens[i];
      const q = sc.quad;
      const minX = Math.min(q.topLeft.x, q.bottomLeft.x);
      const maxX = Math.max(q.topRight.x, q.bottomRight.x);
      const minY = Math.min(q.topLeft.y, q.topRight.y);
      const maxY = Math.max(q.bottomLeft.y, q.bottomRight.y);
      if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
        setActiveScreenId(sc.id);
        setUndoStack((u) => [...u.slice(-19), screens]);
        setDragTarget({ type: 'move_screen', screenId: sc.id, startPt: pt });
        return;
      }
    }
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!baseImg) return;
    const pt = getCanvasNormPoint(e);
    setCursorNorm(pt);

    if (toolMode === 'occlusion_brush' && isPaintingBrushRef.current) {
      paintOcclusionStroke(pt, false);
      return;
    }

    if (!dragTarget) return;

    setScreens((prev) =>
      prev.map((s) => {
        if (s.id !== dragTarget.screenId) return s;

        if (dragTarget.type === 'quad_corner') {
          const nextQuad = { ...s.quad, [dragTarget.corner]: pt };
          // Keep corner_90 hinge synchronized on secondaryQuad.topLeft / bottomLeft
          let nextSec = s.secondaryQuad;
          if (s.shapeType === 'corner_90_smooth' && s.secondaryQuad) {
            if (dragTarget.corner === 'topRight') nextSec = { ...s.secondaryQuad, topLeft: pt };
            if (dragTarget.corner === 'bottomRight') nextSec = { ...s.secondaryQuad, bottomLeft: pt };
          }
          return { ...s, quad: nextQuad, secondaryQuad: nextSec };
        }

        if (dragTarget.type === 'sec_corner' && s.secondaryQuad) {
          return {
            ...s,
            secondaryQuad: { ...s.secondaryQuad, [dragTarget.corner]: pt },
          };
        }

        if (dragTarget.type === 'poly_vertex' && s.polygonPoints) {
          const nextPoly = s.polygonPoints.map((v, idx) =>
            idx === dragTarget.idx ? { ...v, x: pt.x, y: pt.y } : v
          );
          return { ...s, polygonPoints: nextPoly };
        }

        if (dragTarget.type === 'curve_top') {
          const midY = (s.quad.topLeft.y + s.quad.topRight.y) / 2;
          return { ...s, curveSagTopPct: Math.max(-35, Math.min(35, Number((pt.y - midY).toFixed(1)))) };
        }

        if (dragTarget.type === 'curve_bottom') {
          const midY = (s.quad.bottomLeft.y + s.quad.bottomRight.y) / 2;
          return { ...s, curveSagBottomPct: Math.max(-35, Math.min(35, Number((pt.y - midY).toFixed(1)))) };
        }

        if (dragTarget.type === 'move_screen') {
          const dx = pt.x - dragTarget.startPt.x;
          const dy = pt.y - dragTarget.startPt.y;
          dragTarget.startPt = pt;
          const shiftPt = (p: ClientPoint2D) => ({
            x: Number(Math.max(1, Math.min(99, p.x + dx)).toFixed(2)),
            y: Number(Math.max(1, Math.min(99, p.y + dy)).toFixed(2)),
          });
          return {
            ...s,
            quad: {
              topLeft: shiftPt(s.quad.topLeft),
              topRight: shiftPt(s.quad.topRight),
              bottomRight: shiftPt(s.quad.bottomRight),
              bottomLeft: shiftPt(s.quad.bottomLeft),
            },
            ...(s.secondaryQuad
              ? {
                  secondaryQuad: {
                    topLeft: shiftPt(s.secondaryQuad.topLeft),
                    topRight: shiftPt(s.secondaryQuad.topRight),
                    bottomRight: shiftPt(s.secondaryQuad.bottomRight),
                    bottomLeft: shiftPt(s.secondaryQuad.bottomLeft),
                  },
                }
              : {}),
            ...(s.polygonPoints
              ? {
                  polygonPoints: s.polygonPoints.map((v) => ({ ...v, ...shiftPt(v) })),
                }
              : {}),
          };
        }

        return s;
      })
    );
  };

  const handleCanvasPointerUp = () => {
    isPaintingBrushRef.current = false;
    lastBrushPtRef.current = null;
    setDragTarget(null);
  };

  // Switch active screen shape among the 12 morphologies while preserving position
  const handleSelectShapeType = (shapeType: LedScreenShapeType) => {
    if (!activeScreen) return;
    const q = activeScreen.quad;
    const cx = (q.topLeft.x + q.topRight.x + q.bottomRight.x + q.bottomLeft.x) / 4;
    const cy = (q.topLeft.y + q.topRight.y + q.bottomRight.y + q.bottomLeft.y) / 4;
    const fresh = createDefaultScreenInstance(
      shapeType,
      { x: cx, y: cy },
      screens.length,
      activeScreen.contentPresetId || 'opening_red_gold'
    );

    const preserveQuadShapes: LedScreenShapeType[] = [
      'flat_rect',
      'rounded_rect',
      'circle_oval',
      'curved_arc',
      'multi_segment_wave',
      'transparent_glass',
      'led_floor',
      'led_ceiling',
    ];
    if (preserveQuadShapes.includes(shapeType) && preserveQuadShapes.includes(activeScreen.shapeType)) {
      fresh.quad = activeScreen.quad;
    }
    fresh.id = activeScreen.id;
    fresh.name = activeScreen.name;
    fresh.contentImageUrl = activeScreen.contentImageUrl;
    if (shapeType !== 'transparent_glass' && activeScreen.contentPresetId) {
      fresh.contentPresetId = activeScreen.contentPresetId;
    }

    commitScreens((prev) => prev.map((s) => (s.id === activeScreen.id ? fresh : s)));
  };

  // Handle Fast Composite ($0) or Realistic Cloud AI Blend (Mask-Inpaint + Pixel Guard)
  const handleExecuteInstall = async (mode: 'fast_composite' | 'realistic_ai_blend') => {
    if (!project || !baseImg || !canUseAiDesign) return;
    if (mode === 'fast_composite' && submittingFast) return;
    if (mode === 'realistic_ai_blend' && submittingAi) return;

    if (mode === 'fast_composite') setSubmittingFast(true);
    else setSubmittingAi(true);

    try {
      const contentMap = buildContentCanvasMap();
      const pkg = exportGuidedAndMaskPngs(
        baseImg,
        screens,
        contentMap,
        hasOcclusionStrokes ? occlusionCanvasRef.current : null,
        1408
      );

      const presetMeta = LED_CONTENT_PRESETS.find((p) => p.id === activeScreen?.contentPresetId);
      const res = await apiRequest<{
        versionNumber: number;
        downloadUrl: string;
        pixelGuardApplied?: boolean;
        protectedPixelsPct?: number;
        modelUsed?: string;
      }>(`/api/v1/design/${project.id}`, {
        method: 'POST',
        csrfToken,
        body: {
          action: 'quick_install_led',
          mode,
          photoId: selectedPhoto?.id || null,
          screens,
          guidedCompositeBase64: pkg.guidedCompositeBase64,
          originalPhotoBase64: mode === 'realistic_ai_blend' ? pkg.originalPhotoBase64 : undefined,
          alphaMaskBase64: mode === 'realistic_ai_blend' ? pkg.alphaMaskBase64 : undefined,
          occlusionMaskBase64: pkg.occlusionMaskBase64 || undefined,
          contentSummary: presetMeta?.label || activeScreen?.contentCustomPrompt || undefined,
          contextHint: project.installationInfo || undefined,
          providerId: selectedProviderId,
          modelId: selectedModelId,
          marketingFormat: selectedMktFormat,
        },
      });

      onToast(
        mode === 'fast_composite'
          ? `⚡ Đã xuất & lưu bản Gắn LED Nhanh (v${res.versionNumber}) — miễn phí $0!`
          : `✨ Đã hòa sáng Cloud AI siêu thực (v${res.versionNumber}${res.pixelGuardApplied ? ` · Pixel Guard khóa ${res.protectedPixelsPct}% nền gốc` : ''})!`
      );
      await onRefreshProject(project.id);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Không thể lưu bản gắn màn LED.');
    } finally {
      setSubmittingFast(false);
      setSubmittingAi(false);
    }
  };

  // Marketing Turbo Kit #1: 1-Click Generate 3 A/B Variants keeping locked wall coordinates
  const handleGenerate3AbVariants = async () => {
    if (!project || !baseImg || generatingAbPack || !canUseAiDesign) return;
    setGeneratingAbPack(true);
    setAbResultSummary([]);
    try {
      const currentPid = activeScreen?.contentPresetId || 'opening_red_gold';
      const candidateIds = Array.from(
        new Set([currentPid, 'opening_red_gold', 'corp_meeting', 'showroom_auto', 'stage_gala'])
      ).slice(0, 3);

      const savedList: Array<{ versionNumber: number; label: string; downloadUrl: string }> = [];
      for (let i = 0; i < candidateIds.length; i++) {
        const pid = candidateIds[i];
        const variantScreens = screens.map((s) => ({
          ...s,
          contentPresetId: pid,
          contentImageUrl: null,
        }));
        const contentMap: Record<string, HTMLCanvasElement> = {};
        for (const s of variantScreens) {
          const isPortrait = s.shapeType === 'led_standee' || s.shapeType === 'cylindrical_column';
          contentMap[s.id] = renderPresetToCanvas(pid, isPortrait ? 720 : 1280, isPortrait ? 1280 : 720, effectiveBrief);
        }
        const pkg = exportGuidedAndMaskPngs(
          baseImg,
          variantScreens,
          contentMap,
          hasOcclusionStrokes ? occlusionCanvasRef.current : null,
          1280
        );
        const label = LED_CONTENT_PRESETS.find((p) => p.id === pid)?.label || pid;
        const res = await apiRequest<{ versionNumber: number; downloadUrl: string }>(
          `/api/v1/design/${project.id}`,
          {
            method: 'POST',
            csrfToken,
            body: {
              action: 'quick_install_led',
              mode: 'fast_composite',
              photoId: selectedPhoto?.id || null,
              screens: variantScreens,
              guidedCompositeBase64: pkg.guidedCompositeBase64,
              variantLabel: `Biến thể A/B #${i + 1}: ${label}`,
              contentSummary: label,
            },
          }
        );
        savedList.push({ versionNumber: res.versionNumber, label, downloadUrl: res.downloadUrl });
      }
      setAbResultSummary(savedList);
      await onRefreshProject(project.id);
      onToast(`⚡ Đã sinh trọn bộ 3 biến thể A/B Test (v${savedList.map((s) => s.versionNumber).join(', v')}) trên cùng khung tường!`);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Lỗi sinh bộ 3 biến thể A/B.');
    } finally {
      setGeneratingAbPack(false);
    }
  };

  // Marketing Turbo Kit #2: AI draws clean content for INSIDE the LED screen from 1 short sentence
  const handleAiGenerateScreenContent = async () => {
    if (!project || !customContentPrompt.trim() || generatingContent || !canUseAiDesign) return;
    setGeneratingContent(true);
    try {
      const q = activeScreen?.quad;
      const aspect =
        activeScreen?.shapeType === 'led_standee' || activeScreen?.shapeType === 'cylindrical_column'
          ? '9:16'
          : activeScreen?.shapeType === 'circle_oval'
            ? '1:1'
            : q &&
                Math.hypot(q.topRight.x - q.topLeft.x, q.topRight.y - q.topLeft.y) <
                  Math.hypot(q.bottomLeft.x - q.topLeft.x, q.bottomLeft.y - q.topLeft.y)
              ? '9:16'
              : '16:9';

      const res = await apiRequest<{ ok: boolean; dataUrl: string; modelUsed: string }>(
        `/api/v1/design/${project.id}`,
        {
          method: 'POST',
          csrfToken,
          body: {
            action: 'generate_led_screen_content',
            prompt: customContentPrompt.trim(),
            aspectRatio: aspect,
            shapeType: activeScreen?.shapeType || 'flat_rect',
            transparentMode: activeScreen?.shapeType === 'transparent_glass',
            providerId: selectedProviderId,
            modelId: selectedModelId,
          },
        }
      );

      if (res?.dataUrl && activeScreen) {
        setAiGeneratedContentUrls((prev) => ({ ...prev, [activeScreen.id]: res.dataUrl }));
        updateActiveScreen({ contentImageUrl: res.dataUrl, contentCustomPrompt: customContentPrompt.trim() }, true);
        onToast(`🎨 AI (${res.modelUsed}) đã vẽ xong nội dung và tự động ép khít vào màn hình LED!`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Không thể vẽ nội dung màn LED bằng AI.');
    } finally {
      setGeneratingContent(false);
    }
  };

  const brandKitConfig: BrandKitOverlayOptions = useMemo(
    () => ({
      enabled: includeBrandKit,
      websiteDomain: effectiveBrief.websiteDomain || 'toantrung.com.vn',
      headlineText: effectiveBrief.headlineText || project?.projectName || 'GIẢI PHÁP MÀN HÌNH LED TOÀN TRUNG',
      ctaText: effectiveBrief.ctaText || 'KHẢO SÁT & TƯ VẤN',
      primaryColor: effectiveBrief.brandPrimaryColor || '#1E3A8A',
    }),
    [includeBrandKit, effectiveBrief, project?.projectName]
  );

  // Marketing Turbo Kit #3: 1-Click Before-After Showcase
  const handleGenerateBeforeAfter = () => {
    if (!baseImg || !compositeCanvasRef.current) return;
    const url = renderBeforeAfterShowcaseDataUrl({
      originalImg: baseImg,
      compositeCanvas: compositeCanvasRef.current,
      layout: beforeAfterLayout,
      brandKit: brandKitConfig,
    });
    if (url) setBeforeAfterPreviewUrl(url);
  };

  // Marketing Turbo Kit #4: Smart Focal Crop Multi-Channel Export
  const handleExportMktChannel = (format: MarketingExportFormatType) => {
    if (!compositeCanvasRef.current) return;
    setSelectedMktFormat(format);
    const url = renderSmartFocalChannelDataUrl({
      compositeCanvas: compositeCanvasRef.current,
      screens,
      format,
      brandKit: brandKitConfig,
    });
    if (url) {
      const slug = format === 'original' ? 'goc' : format.replace(':', 'x');
      triggerBrowserImageDownload(url, `ToanTrung-LED-${project?.id || 'draft'}-${slug}.png`);
      onToast(`📐 Đã xuất ảnh chuẩn kênh (${format === 'original' ? 'Ảnh gốc HD' : format}) lấy trọn trọng tâm màn LED!`);
    }
  };

  const handleSaveRecipe = () => {
    if (!activeScreen) return;
    const recipe: LedPlacementRecipeDto = {
      id: `rcp-${Date.now()}`,
      name: `${LED_SCREEN_SHAPE_META[activeScreen.shapeType].shortLabel} · ${selectedMktFormat}`,
      shapeType: activeScreen.shapeType,
      presetId: activeScreen.contentPresetId || 'opening_red_gold',
      marketingFormat: selectedMktFormat,
      includeBrandKit,
      includeBeforeAfter: Boolean(beforeAfterPreviewUrl),
      brightnessPct: activeScreen.material?.brightnessPct ?? 102,
      bezelThicknessPx: activeScreen.material?.bezelThicknessPx ?? 6,
      transparencyPct: activeScreen.material?.transparencyPct ?? 0,
      createdAt: new Date().toISOString(),
    };
    const next = [recipe, ...recipes].slice(0, 6);
    setRecipes(next);
    try {
      window.localStorage.setItem(STORAGE_RECIPES_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
    onToast(`Đã lưu công thức "${recipe.name}" để dùng lại 1 chạm cho lần sau.`);
  };

  const handleUploadCustomScreenImg = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeScreen) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      if (dataUrl) {
        updateActiveScreen({ contentImageUrl: dataUrl }, true);
        onToast(`Đã đưa ảnh "${file.name}" lên trình chiếu trên màn LED!`);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Empty states when no project or no survey photo selected
  if (!project) {
    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xs space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-[#1553A2]">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-base font-extrabold text-slate-900">Chưa có dự án công trình đang mở</h3>
          <p className="text-xs text-slate-500">
            Hãy tạo mới hoặc chọn 1 dự án ở cột bên trái để bắt đầu Gắn màn LED siêu dễ trong 3 bước.
          </p>
          <button
            type="button"
            onClick={onCreateProjectClick}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#1553A2] px-4 py-2 text-xs font-bold text-white hover:bg-[#1E3A8A]"
          >
            <Plus className="h-4 w-4" />
            <span>Tạo dự án mới</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-[#F5F7FC] overflow-hidden">
      <input
        ref={uploadContentInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={handleUploadCustomScreenImg}
      />

      {/* TOP 3-STEP PROGRESS BAR & SIMPLE MODE TOOLBAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D8E2F0] bg-white px-4 py-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[#1553A2]">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1553A2] text-[10px] text-white">1</span>
            Chọn ảnh
          </span>
          <span className="text-slate-300">→</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 border border-cyan-200 px-2.5 py-1 text-cyan-900">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-cyan-600 text-[10px] text-white">2</span>
            Chọn kiểu &amp; Chỉ chỗ lắp (12 loại LED)
          </span>
          <span className="text-slate-300">→</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-emerald-900">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-[10px] text-white">3</span>
            Chọn mẫu &amp; Xuất bộ MKT
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!canUseAiDesign && (
            <span
              className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-800"
              title="Theo ma trận BA hiện tại (Q16), chỉ Designer/Admin được lưu phiên bản thiết kế."
            >
              Chế độ xem thử (Lưu/Xuất cần quyền Designer/Admin)
            </span>
          )}
          <button
            type="button"
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            title="Hoàn tác thao tác vừa rồi (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
            <span>Hoàn tác</span>
          </button>
          <button
            type="button"
            onMouseDown={() => setHoldOriginal(true)}
            onMouseUp={() => setHoldOriginal(false)}
            onMouseLeave={() => setHoldOriginal(false)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition select-none ${
              holdOriginal
                ? 'border-amber-400 bg-amber-50 text-amber-900'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
            title="Nhấn giữ chuột để xem ảnh hiện trạng gốc ban đầu"
          >
            <Eye className="h-3.5 w-3.5" />
            <span>Giữ xem ảnh gốc</span>
          </button>
          <button
            type="button"
            onClick={handleSaveRecipe}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50"
            title="Lưu cấu hình màn LED & xuất MKT hiện tại thành công thức dùng lại 1 chạm"
          >
            <Save className="h-3.5 w-3.5 text-[#1553A2]" />
            <span>Lưu công thức</span>
          </button>
        </div>
      </div>

      {/* MAIN SPLIT: LIVE 60FPS CANVAS (LEFT/CENTER) + EASY CONTROLS & MKT KIT (RIGHT) */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row gap-3 p-3 overflow-hidden">
        {/* CENTER VIEWPORT */}
        <div className="flex flex-1 min-w-0 min-h-0 flex-col rounded-2xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          {/* Interactive Pointer Tools Bar */}
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="quick-led-tool-snap"
                onClick={() => setToolMode('click_snap')}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition ${
                  toolMode === 'click_snap'
                    ? 'bg-red-600 text-white shadow-xs ring-2 ring-red-200'
                    : 'border border-red-200 bg-red-50/70 text-red-800 hover:bg-red-100'
                }`}
              >
                <MousePointerClick className="h-3.5 w-3.5" />
                <span>👆 Chạm 1 điểm bắt vị trí</span>
              </button>

              <button
                type="button"
                onClick={() => void triggerAutoSnap(null, null)}
                disabled={!baseImg || detectingSnap}
                className="inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-extrabold text-[#1E3A8A] hover:bg-indigo-100 disabled:opacity-50"
              >
                {detectingSnap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                <span>{detectingSnap ? 'Đang dò tường...' : '✨ AI tự tìm chỗ lắp'}</span>
              </button>

              <button
                type="button"
                onClick={() => setToolMode('edit_handles')}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition ${
                  toolMode === 'edit_handles'
                    ? 'bg-[#1553A2] text-white shadow-xs'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <span>✥ Chỉnh góc &amp; Kính lúp 2.5x</span>
              </button>

              <button
                type="button"
                onClick={() => setToolMode('occlusion_brush')}
                className={`inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-extrabold transition ${
                  toolMode === 'occlusion_brush'
                    ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200'
                    : 'border border-emerald-200 bg-emerald-50/70 text-emerald-900 hover:bg-emerald-100'
                }`}
                title="Quét qua bục phát biểu, bàn họp, chậu cây hoặc cột nhà để đưa chúng nổi lên TRƯỚC màn hình LED"
              >
                <Brush className="h-3.5 w-3.5" />
                <span>🖌️ Đưa vật cản lên trước</span>
              </button>
            </div>

            {toolMode === 'occlusion_brush' && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-900">
                <span>Cỡ cọ:</span>
                <input
                  type="range"
                  min={10}
                  max={64}
                  value={brushSizePx}
                  onChange={(e) => setBrushSizePx(Number(e.target.value))}
                  className="w-20 accent-emerald-600"
                />
                <button
                  type="button"
                  onClick={() => setBrushEraseMode((p) => !p)}
                  className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 font-bold ${
                    brushEraseMode ? 'bg-amber-600 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  <Eraser className="h-3 w-3" />
                  <span>{brushEraseMode ? 'Đang tẩy cọ' : 'Tẩy nét'}</span>
                </button>
                {hasOcclusionStrokes && (
                  <button
                    type="button"
                    onClick={() => {
                      const occ = occlusionCanvasRef.current;
                      occ?.getContext('2d')?.clearRect(0, 0, occ.width, occ.height);
                      setHasOcclusionStrokes(false);
                    }}
                    className="rounded-lg bg-red-100 px-2 py-0.5 font-bold text-red-700 hover:bg-red-200"
                  >
                    Xóa hết
                  </button>
                )}
              </div>
            )}
          </div>

          {snapReason && (
            <div className="mb-2 rounded-xl border border-cyan-200 bg-cyan-50/80 px-3 py-1.5 text-xs font-semibold text-cyan-950">
              {snapReason}
            </div>
          )}

          {/* LIVE 60FPS VIEWPORT */}
          <div className="relative flex flex-1 min-h-0 items-center justify-center overflow-hidden rounded-xl bg-slate-950">
            {!selectedPhoto || imgLoadError ? (
              <div className="max-w-md p-6 text-center text-white space-y-3">
                <Upload className="mx-auto h-10 w-10 text-cyan-300" />
                <div className="text-sm font-bold">
                  {imgLoadError
                    ? 'Không thể tải ảnh khảo sát này'
                    : 'Hãy tải 1 ảnh công trình (JPG/PNG/WebP từ điện thoại)'}
                </div>
                <p className="text-xs text-slate-300">
                  Sau khi tải ảnh, bạn chỉ cần chạm 1 điểm lên vách tường, cột trụ hay vách kính để hệ thống tự lắp khít màn hình LED.
                </p>
                <button
                  type="button"
                  onClick={onUploadSitePhotosClick}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#1553A2] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#1E3A8A]"
                >
                  <Upload className="h-4 w-4" />
                  <span>Tải ảnh công trình lên ngay</span>
                </button>
              </div>
            ) : (
              <>
                <canvas
                  ref={displayCanvasRef}
                  data-testid="quick-led-live-canvas"
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  className={`max-h-full max-w-full object-contain touch-none select-none ${
                    toolMode === 'click_snap' || toolMode === 'occlusion_brush'
                      ? 'cursor-crosshair'
                      : dragTarget
                        ? 'cursor-grabbing'
                        : 'cursor-grab'
                  }`}
                />
                {toolMode === 'click_snap' && (
                  <div className="pointer-events-none absolute top-3 left-3 rounded-lg bg-red-600/90 px-3 py-1.5 text-xs font-extrabold text-white shadow-md">
                    👆 Bấm 1 lần lên tường / cột trụ / vách kính / sàn để tự bắt khung lắp LED!
                  </div>
                )}
              </>
            )}
          </div>

          {/* BOTTOM QUICK MATERIAL & PHYSICS SLIDERS */}
          {activeScreen && (
            <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
              <label className="flex flex-col gap-0.5 font-semibold text-slate-700">
                <span>Độ sáng ({activeScreen.material?.brightnessPct ?? 102}%)</span>
                <input
                  type="range"
                  min={60}
                  max={150}
                  value={activeScreen.material?.brightnessPct ?? 102}
                  onChange={(e) =>
                    updateActiveScreen({
                      material: {
                        ...(activeScreen.material as NonNullable<LedScreenInstanceDto['material']>),
                        brightnessPct: Number(e.target.value),
                      },
                    })
                  }
                  className="accent-[#1553A2]"
                />
              </label>

              <label className="flex flex-col gap-0.5 font-semibold text-slate-700">
                <span>Viền khung 3D ({activeScreen.material?.bezelThicknessPx ?? 6}px)</span>
                <input
                  type="range"
                  min={0}
                  max={18}
                  value={activeScreen.material?.bezelThicknessPx ?? 6}
                  onChange={(e) =>
                    updateActiveScreen({
                      material: {
                        ...(activeScreen.material as NonNullable<LedScreenInstanceDto['material']>),
                        bezelThicknessPx: Number(e.target.value),
                      },
                    })
                  }
                  className="accent-[#1553A2]"
                />
              </label>

              {activeScreen.shapeType === 'transparent_glass' ? (
                <label className="flex flex-col gap-0.5 font-semibold text-cyan-800">
                  <span>Độ xuyên kính ({activeScreen.material?.transparencyPct ?? 68}%)</span>
                  <input
                    type="range"
                    min={25}
                    max={88}
                    value={activeScreen.material?.transparencyPct ?? 68}
                    onChange={(e) =>
                      updateActiveScreen({
                        material: {
                          ...(activeScreen.material as NonNullable<LedScreenInstanceDto['material']>),
                          transparencyPct: Number(e.target.value),
                        },
                      })
                    }
                    className="accent-cyan-600"
                  />
                </label>
              ) : activeScreen.shapeType === 'curved_arc' ||
                activeScreen.shapeType === 'multi_segment_wave' ? (
                <label className="flex flex-col gap-0.5 font-semibold text-amber-800">
                  <span>Độ uốn cong ({activeScreen.curveSagTopPct ?? -6}%)</span>
                  <input
                    type="range"
                    min={-24}
                    max={24}
                    value={activeScreen.curveSagTopPct ?? -6}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      updateActiveScreen({ curveSagTopPct: val, curveSagBottomPct: -val });
                    }}
                    className="accent-amber-600"
                  />
                </label>
              ) : (
                <label className="flex flex-col gap-0.5 font-semibold text-indigo-800">
                  <span>Bo góc tròn ({activeScreen.cornerRoundnessPct ?? 0}%)</span>
                  <input
                    type="range"
                    min={0}
                    max={45}
                    value={activeScreen.cornerRoundnessPct ?? 0}
                    onChange={(e) => {
                      const r = Number(e.target.value);
                      updateActiveScreen({
                        cornerRoundnessPct: r,
                        cornerRadiiPct: { tl: r, tr: r, br: r, bl: r },
                      });
                    }}
                    className="accent-indigo-600"
                  />
                </label>
              )}

              <label className="flex flex-col gap-0.5 font-semibold text-slate-700">
                <span>Hắt sáng tường ({activeScreen.material?.ambientSpillPct ?? 35}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeScreen.material?.ambientSpillPct ?? 35}
                  onChange={(e) =>
                    updateActiveScreen({
                      material: {
                        ...(activeScreen.material as NonNullable<LedScreenInstanceDto['material']>),
                        ambientSpillPct: Number(e.target.value),
                      },
                    })
                  }
                  className="accent-[#1553A2]"
                />
              </label>

              <label className="flex flex-col gap-0.5 font-semibold text-slate-700">
                <span>Bóng sàn / Diode ({activeScreen.material?.floorReflectionPct ?? 0}%)</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={activeScreen.material?.floorReflectionPct ?? 0}
                  onChange={(e) =>
                    updateActiveScreen({
                      material: {
                        ...(activeScreen.material as NonNullable<LedScreenInstanceDto['material']>),
                        floorReflectionPct: Number(e.target.value),
                      },
                    })
                  }
                  className="accent-[#1553A2]"
                />
              </label>
            </div>
          )}
        </div>

        {/* RIGHT CONTROLS: 12 LED SHAPES + MULTI-SCREEN + CONTENT + MARKETING TURBO KIT */}
        <div className="w-full lg:w-[400px] xl:w-[430px] shrink-0 overflow-y-auto space-y-2.5 pr-0.5">
          {/* SECTION: 12 SHAPES & MULTI-SCREEN MANAGER */}
          <div className="rounded-2xl border border-[#D8E2F0] bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-[#17253F] flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-[#1553A2]" />
                <span>Bước 2: Chọn 12 Kiểu Màn LED</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAll12Shapes((p) => !p)}
                className="text-[11px] font-bold text-[#1553A2] hover:underline"
              >
                {showAll12Shapes ? 'Thu gọn 6 loại ▴' : 'Xem đủ 12 loại ▾'}
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {(showAll12Shapes ? LED_SCREEN_SHAPES : PRIMARY_6_SHAPES).map((shape) => {
                const meta = LED_SCREEN_SHAPE_META[shape];
                const isActive = activeScreen?.shapeType === shape;
                return (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => handleSelectShapeType(shape)}
                    title={meta.description}
                    className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition ${
                      isActive
                        ? 'border-[#1553A2] bg-blue-50 text-[#1553A2] ring-1 ring-[#1553A2]/30 font-extrabold'
                        : 'border-slate-200 bg-slate-50/70 text-slate-700 hover:bg-slate-100 font-semibold'
                    }`}
                  >
                    <span className="text-base leading-none">{SHAPE_ICONS[shape]}</span>
                    <span className="mt-1 text-[10.5px] leading-tight">{meta.shortLabel}</span>
                  </button>
                );
              })}
            </div>

            {activeScreen?.shapeType === 'rounded_rect' && (
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() =>
                    updateActiveScreen({
                      cornerRoundnessPct: 38,
                      cornerRadiiPct: { tl: 42, tr: 42, br: 4, bl: 4 },
                    })
                  }
                  className="rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 font-bold text-indigo-800 hover:bg-indigo-100"
                >
                  ⛩️ Dáng Mái Vòm (Bo 2 góc trên)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateActiveScreen({
                      cornerRoundnessPct: 16,
                      cornerRadiiPct: { tl: 16, tr: 16, br: 16, bl: 16 },
                    })
                  }
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700 hover:bg-slate-50"
                >
                  ▢ Bo đều 4 góc
                </button>
              </div>
            )}

            {activeScreen?.shapeType === 'free_polygon' && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-cyan-200 bg-cyan-50/70 p-2 text-[11px] text-cyan-950">
                <span className="font-bold">Đa giác ({activeScreen.polygonPoints?.length || 0} đỉnh):</span>
                <button
                  type="button"
                  onClick={() => {
                    const pts = activeScreen.polygonPoints || [];
                    if (pts.length >= 24) return;
                    const last = pts[pts.length - 1] || { x: 50, y: 50 };
                    const first = pts[0] || { x: 40, y: 40 };
                    updateActiveScreen({
                      polygonPoints: [
                        ...pts,
                        { x: Number(((last.x + first.x) / 2).toFixed(1)), y: Number(((last.y + first.y) / 2).toFixed(1)) },
                      ],
                    });
                  }}
                  className="rounded-lg bg-white border border-cyan-300 px-2 py-0.5 font-bold hover:bg-cyan-100"
                >
                  + Thêm đỉnh
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const pts = activeScreen.polygonPoints || [];
                    if (pts.length <= 3) return;
                    updateActiveScreen({ polygonPoints: pts.slice(0, -1) });
                  }}
                  className="rounded-lg bg-white border border-slate-200 px-2 py-0.5 font-bold hover:bg-slate-100"
                >
                  Bớt 1 đỉnh
                </button>
              </div>
            )}

            {/* Multi-Screen Manager in 1 Photo */}
            <div className="border-t border-slate-100 pt-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-700">Màn hình trong ảnh ({screens.length}):</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      const nextIdx = screens.length + 1;
                      const newSc = createDefaultScreenInstance(
                        activeScreen?.shapeType || 'flat_rect',
                        { x: 48 + (nextIdx % 3) * 8, y: 45 + (nextIdx % 2) * 8 },
                        nextIdx,
                        activeScreen?.contentPresetId || 'opening_red_gold'
                      );
                      commitScreens((prev) => [...prev, newSc]);
                      setActiveScreenId(newSc.id);
                    }}
                    className="inline-flex items-center gap-0.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 font-bold text-[#1553A2] hover:bg-blue-100"
                  >
                    <Plus className="h-3 w-3" />
                    <span>Thêm màn</span>
                  </button>
                  {activeScreen && (
                    <button
                      type="button"
                      onClick={() => {
                        const cloned: LedScreenInstanceDto = {
                          ...JSON.parse(JSON.stringify(activeScreen)),
                          id: `led-${Date.now()}`,
                          name: `${activeScreen.name} (Bản sao)`,
                        };
                        cloned.quad.topLeft.x = Math.min(95, cloned.quad.topLeft.x + 8);
                        cloned.quad.topRight.x = Math.min(98, cloned.quad.topRight.x + 8);
                        cloned.quad.bottomRight.x = Math.min(98, cloned.quad.bottomRight.x + 8);
                        cloned.quad.bottomLeft.x = Math.min(95, cloned.quad.bottomLeft.x + 8);
                        commitScreens((prev) => [...prev, cloned]);
                        setActiveScreenId(cloned.id);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-1.5 py-0.5 font-bold text-slate-600 hover:bg-slate-50"
                      title="Nhân bản màn đang chọn"
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {screens.map((sc, idx) => (
                  <div
                    key={sc.id}
                    className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-bold cursor-pointer ${
                      sc.id === activeScreen?.id
                        ? 'border-[#1553A2] bg-[#1553A2] text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                    onClick={() => setActiveScreenId(sc.id)}
                  >
                    <span>#{idx + 1} {sc.name.slice(0, 14)}</span>
                    {screens.length > 1 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const rem = screens.filter((x) => x.id !== sc.id);
                          commitScreens(() => rem);
                          if (sc.id === activeScreen?.id && rem[0]) {
                            setActiveScreenId(rem[0].id);
                          }
                        }}
                        className="opacity-80 hover:opacity-100"
                        title="Xóa màn này"
                      >
                        <Trash2 className="h-2.5 w-2.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1 pt-0.5 text-[10.5px]">
                <button
                  type="button"
                  onClick={() => {
                    const arr = createMultiScreenPreset('stage_3');
                    commitScreens(() => arr);
                    setActiveScreenId(arr[0].id);
                  }}
                  className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 font-bold text-purple-900 hover:bg-purple-100"
                >
                  🎭 Sân khấu 3 màn
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const arr = createMultiScreenPreset('stage_5');
                    commitScreens(() => arr);
                    setActiveScreenId(arr[0].id);
                  }}
                  className="rounded-lg border border-purple-200 bg-purple-50 px-2 py-0.5 font-bold text-purple-900 hover:bg-purple-100"
                >
                  🎪 Sân khấu 5 màn (+Sàn)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const arr = createMultiScreenPreset('standee_row_3');
                    commitScreens(() => arr);
                    setActiveScreenId(arr[0].id);
                  }}
                  className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 font-bold text-[#1553A2] hover:bg-blue-100"
                >
                  🧍 Dãy 3 Standee
                </button>
              </div>
            </div>
          </div>

          {/* SECTION: STEP 3 CONTENT GALLERY + ACTION BUTTONS */}
          <div className="rounded-2xl border border-[#D8E2F0] bg-white p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-extrabold uppercase tracking-wide text-[#17253F]">
                Bước 3: Nội dung chiếu trên LED
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-[10.5px] font-bold">
                <button
                  type="button"
                  onClick={() => setContentTab('presets')}
                  className={`rounded-md px-2 py-0.5 ${contentTab === 'presets' ? 'bg-white text-[#1553A2] shadow-2xs' : 'text-slate-600'}`}
                >
                  16 Mẫu sẵn
                </button>
                <button
                  type="button"
                  onClick={() => setContentTab('images')}
                  className={`rounded-md px-2 py-0.5 ${contentTab === 'images' ? 'bg-white text-[#1553A2] shadow-2xs' : 'text-slate-600'}`}
                >
                  Ảnh SP / Máy
                </button>
                <button
                  type="button"
                  onClick={() => setContentTab('ai_draw')}
                  className={`rounded-md px-2 py-0.5 ${contentTab === 'ai_draw' ? 'bg-white text-[#1553A2] shadow-2xs' : 'text-slate-600'}`}
                >
                  AI vẽ mới
                </button>
              </div>
            </div>

            {contentTab === 'presets' && (
              <div className="grid grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5">
                {LED_CONTENT_PRESETS.map((preset) => {
                  const isSelected =
                    !activeScreen?.contentImageUrl &&
                    (activeScreen?.contentPresetId || 'opening_red_gold') === preset.id;
                  const thumb = getPresetPreviewDataUrl(preset.id, effectiveBrief);
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() =>
                        updateActiveScreen({ contentPresetId: preset.id, contentImageUrl: null }, true)
                      }
                      className={`group overflow-hidden rounded-xl border text-left transition ${
                        isSelected
                          ? 'border-[#1553A2] ring-2 ring-[#1553A2]/25'
                          : 'border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      {thumb && (
                        <img
                          src={thumb}
                          alt={preset.label}
                          className="h-12 w-full object-cover bg-slate-900"
                        />
                      )}
                      <div className="px-2 py-1 bg-white">
                        <div className="truncate text-[10.5px] font-bold text-slate-900">
                          {preset.label}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {contentTab === 'images' && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => uploadContentInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 py-2 text-xs font-bold text-[#1553A2] hover:bg-blue-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Chọn ảnh / slide banner từ máy tính</span>
                </button>
                {companyProductPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5 max-h-32 overflow-y-auto">
                    {companyProductPhotos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => updateActiveScreen({ contentImageUrl: p.url }, true)}
                        className={`overflow-hidden rounded-lg border ${
                          activeScreen?.contentImageUrl === p.url
                            ? 'border-[#7846FF] ring-2 ring-purple-300'
                            : 'border-slate-200'
                        }`}
                      >
                        <img src={p.url} alt={p.name} className="h-12 w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {contentTab === 'ai_draw' && (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={customContentPrompt}
                  onChange={(e) => setCustomContentPrompt(e.target.value)}
                  placeholder="Gõ 1 câu ngắn, VD: Hội nghị tổng kết năm 2026 tông đỏ vàng sang trọng..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#1553A2] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!canUseAiDesign || generatingContent || !customContentPrompt.trim()}
                  onClick={() => void handleAiGenerateScreenContent()}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2 text-xs font-extrabold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingContent ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  <span>{generatingContent ? 'Đang vẽ nội dung...' : '✨ AI vẽ riêng ruột màn hình & ép vào khung'}</span>
                </button>
                {activeScreen && aiGeneratedContentUrls[activeScreen.id] && (
                  <div className="text-[11px] font-semibold text-emerald-700">
                    ✓ Đã áp ảnh nội dung AI vừa vẽ lên màn hình đang chọn!
                  </div>
                )}
              </div>
            )}

            {/* MAIN RENDER / SAVE BUTTONS */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                data-testid="quick-led-export-fast-btn"
                disabled={!baseImg || !canUseAiDesign || submittingFast || submittingAi}
                onClick={() => void handleExecuteInstall('fast_composite')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0BAF7C] px-3 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-50"
                title="Lưu ngay bản ghép chuẩn khung & vật lý toàn diện với chi phí $0"
              >
                {submittingFast ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
                <span>{submittingFast ? 'Đang xuất...' : 'Xuất Nhanh ($0)'}</span>
              </button>

              <button
                type="button"
                data-testid="quick-led-export-ai-btn"
                disabled={!baseImg || !canUseAiDesign || submittingFast || submittingAi}
                onClick={() => void handleExecuteInstall('realistic_ai_blend')}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#1553A2] to-[#7846FF] px-3 py-2.5 text-xs font-extrabold text-white shadow-xs hover:opacity-95 disabled:opacity-50"
                title="Gửi Alpha Mask + Guided Composite cho Cloud AI hòa sáng siêu thực & khóa ảnh gốc bằng Pixel Guard"
              >
                {submittingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                <span>{submittingAi ? 'AI đang hòa sáng...' : 'Hòa sáng AI'}</span>
              </button>
            </div>
          </div>

          {/* SECTION: MARKETING TURBO KIT */}
          <div className="rounded-2xl border border-amber-200/90 bg-gradient-to-br from-white to-amber-50/40 p-3.5 shadow-2xs space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wide text-amber-950 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-amber-600" />
                <span>Marketing Turbo Kit (Giảm 90% công)</span>
              </div>
              <label className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeBrandKit}
                  onChange={(e) => setIncludeBrandKit(e.target.checked)}
                  className="rounded border-slate-300 text-[#1553A2]"
                />
                <span>Logo &amp; CTA</span>
              </label>
            </div>

            {effectiveBrief.websiteDomain && (
              <div className="rounded-lg bg-blue-50/80 border border-blue-200 px-2.5 py-1 text-[10.5px] font-semibold text-[#1553A2]">
                📋 Tự động đồng bộ Brief: <strong>{effectiveBrief.websiteDomain}</strong>
                {effectiveBrief.headlineText ? ` · "${effectiveBrief.headlineText}"` : ''}
              </div>
            )}

            {/* Multi-Variant A/B Pack */}
            <button
              type="button"
              data-testid="quick-led-ab-pack-btn"
              disabled={!baseImg || !canUseAiDesign || generatingAbPack}
              onClick={() => void handleGenerate3AbVariants()}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-100/80 py-2 text-xs font-extrabold text-amber-950 hover:bg-amber-200 disabled:opacity-50"
            >
              {generatingAbPack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              <span>{generatingAbPack ? 'Đang sinh 3 biến thể A/B...' : '⚡ Sinh Bộ 3 Biến Thể A/B (Cùng 1 vị trí)'}</span>
            </button>

            {abResultSummary.length > 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2 text-[11px] space-y-1">
                <div className="font-bold text-emerald-900">✓ Đã lưu 3 phiên bản A/B Test:</div>
                {abResultSummary.map((item) => (
                  <div key={item.versionNumber} className="flex items-center justify-between gap-2">
                    <span className="truncate text-emerald-800">v{item.versionNumber}: {item.label}</span>
                    <a
                      href={item.downloadUrl}
                      download={`ToanTrung-AB-v${item.versionNumber}.png`}
                      className="font-bold text-[#1553A2] hover:underline shrink-0"
                    >
                      Tải PNG
                    </a>
                  </div>
                ))}
              </div>
            )}

            {/* Before-After Showcase Generator */}
            <div className="space-y-1.5 border-t border-amber-200/70 pt-2">
              <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] font-bold text-slate-700">Ảnh Trước / Sau:</span>
                <div className="flex gap-1 text-[10px] font-bold">
                  {[
                    { id: 'split_vertical' as const, label: 'Trái/Phải' },
                    { id: 'split_horizontal' as const, label: 'Trên/Dưới' },
                    { id: 'diagonal' as const, label: 'Chéo' },
                  ].map((lay) => (
                    <button
                      key={lay.id}
                      type="button"
                      onClick={() => setBeforeAfterLayout(lay.id)}
                      className={`rounded px-1.5 py-0.5 border ${
                        beforeAfterLayout === lay.id
                          ? 'border-[#1553A2] bg-[#1553A2] text-white'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      {lay.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                disabled={!baseImg}
                onClick={handleGenerateBeforeAfter}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-extrabold text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                <span>🔀 Tạo Ảnh So Sánh Trước / Sau (1 Giây)</span>
              </button>
              {beforeAfterPreviewUrl && (
                <div className="rounded-xl border border-slate-200 bg-white p-1.5 space-y-1">
                  <img
                    src={beforeAfterPreviewUrl}
                    alt="Trước và Sau lắp màn hình LED"
                    className="w-full rounded-lg object-contain max-h-36 bg-slate-900"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      triggerBrowserImageDownload(
                        beforeAfterPreviewUrl,
                        `ToanTrung-Truoc-Sau-${project.id}.png`
                      )
                    }
                    className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-[#1553A2] py-1 text-[11px] font-bold text-white hover:bg-[#1E3A8A]"
                  >
                    <Download className="h-3 w-3" />
                    <span>Tải ảnh Trước / Sau HD</span>
                  </button>
                </div>
              )}
            </div>

            {/* Smart Focal Multi-Channel Export */}
            <div className="space-y-1.5 border-t border-amber-200/70 pt-2">
              <div className="text-[11px] font-bold text-slate-700">
                Xuất 5 khổ đa kênh (Tự lấy trọng tâm cụm LED):
              </div>
              <div className="grid grid-cols-5 gap-1">
                {(['original', '1:1', '4:5', '16:9', '9:16'] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    disabled={!baseImg}
                    onClick={() => handleExportMktChannel(fmt)}
                    className={`rounded-lg border py-1.5 text-[10.5px] font-extrabold transition ${
                      selectedMktFormat === fmt
                        ? 'border-[#1553A2] bg-blue-50 text-[#1553A2]'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {fmt === 'original' ? 'Gốc' : fmt}
                  </button>
                ))}
              </div>
            </div>

            {/* Saved Team Recipes */}
            {recipes.length > 0 && (
              <div className="border-t border-amber-200/70 pt-2 space-y-1">
                <div className="text-[10.5px] font-bold text-slate-600">Công thức đã lưu:</div>
                <div className="flex flex-wrap gap-1">
                  {recipes.map((rcp) => (
                    <button
                      key={rcp.id}
                      type="button"
                      onClick={() => {
                        handleSelectShapeType(rcp.shapeType);
                        updateActiveScreen({
                          contentPresetId: rcp.presetId,
                          contentImageUrl: null,
                          material: {
                            ...(activeScreen?.material as NonNullable<LedScreenInstanceDto['material']>),
                            brightnessPct: rcp.brightnessPct,
                            bezelThicknessPx: rcp.bezelThicknessPx,
                            transparencyPct: rcp.transparencyPct,
                          },
                        });
                        setSelectedMktFormat(rcp.marketingFormat);
                        setIncludeBrandKit(rcp.includeBrandKit);
                        onToast(`Đã áp dụng công thức "${rcp.name}"!`);
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                    >
                      ⚡ {rcp.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
