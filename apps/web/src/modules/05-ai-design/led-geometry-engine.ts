'use client';

import type {
  LedScreenInstanceDto,
  LedScreenShapeType,
  QuadCoordinatesDto,
} from '@toantrung/contracts';

export interface ClientPoint2D {
  x: number;
  y: number;
}

/**
 * Normalizes any 4 points into clockwise order starting at topLeft:
 * topLeft -> topRight -> bottomRight -> bottomLeft (0..100% coordinate space).
 */
export function canonicalizeQuadClient(pts: ClientPoint2D[]): QuadCoordinatesDto {
  if (!pts || pts.length < 4) {
    return {
      topLeft: { x: 25, y: 20 },
      topRight: { x: 75, y: 20 },
      bottomRight: { x: 75, y: 72 },
      bottomLeft: { x: 25, y: 72 },
    };
  }
  const four = pts.slice(0, 4).map((p) => ({
    x: Number(Math.max(0.5, Math.min(99.5, p.x)).toFixed(2)),
    y: Number(Math.max(0.5, Math.min(99.5, p.y)).toFixed(2)),
  }));
  const cx = four.reduce((s, p) => s + p.x, 0) / 4;
  const cy = four.reduce((s, p) => s + p.y, 0) / 4;
  const sorted = [...four].sort(
    (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
  );
  let tlIdx = 0;
  let bestSum = Infinity;
  for (let i = 0; i < 4; i++) {
    const score = sorted[i].x + sorted[i].y;
    if (score < bestSum) {
      bestSum = score;
      tlIdx = i;
    }
  }
  return {
    topLeft: sorted[tlIdx],
    topRight: sorted[(tlIdx + 1) % 4],
    bottomRight: sorted[(tlIdx + 2) % 4],
    bottomLeft: sorted[(tlIdx + 3) % 4],
  };
}

export function computeHomography3x3Client(
  src: [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D],
  dst: [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D]
): number[] | null {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = src[i];
    const { x: u, y: v } = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }
  const n = 8;
  const M = A.map((r, idx) => [...r, b[idx]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const val = Math.abs(M[r][col]);
      if (val > maxVal) {
        maxVal = val;
        pivotRow = r;
      }
    }
    if (maxVal < 1e-9) return null;
    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }
    const pivot = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / pivot;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const h = new Array<number>(9).fill(0);
  h[8] = 1;
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * h[j];
    h[i] = sum / M[i][i];
  }
  return h.some((v) => !Number.isFinite(v)) ? null : h;
}

export function applyHomographyClient(H: number[], x: number, y: number): ClientPoint2D {
  const denom = H[6] * x + H[7] * y + H[8];
  if (Math.abs(denom) < 1e-8) return { x: 0, y: 0 };
  return {
    x: (H[0] * x + H[1] * y + H[2]) / denom,
    y: (H[3] * x + H[4] * y + H[5]) / denom,
  };
}

export function createDefaultScreenInstance(
  shapeType: LedScreenShapeType = 'flat_rect',
  center: ClientPoint2D = { x: 50, y: 44 },
  index = 1,
  presetId = 'opening_red_gold'
): LedScreenInstanceDto {
  const cx = Math.max(18, Math.min(82, center.x));
  const cy = Math.max(18, Math.min(80, center.y));
  const id = `led-${Date.now()}-${index}`;

  if (shapeType === 'corner_90_smooth') {
    const leftW = 16;
    const rightW = 16;
    const h = 19;
    return {
      id,
      name: `Màn Góc 3D #${index}`,
      shapeType,
      quad: {
        topLeft: { x: Math.max(6, cx - leftW), y: Math.max(8, cy - h + 4) },
        topRight: { x: cx, y: Math.max(6, cy - h) },
        bottomRight: { x: cx, y: Math.min(92, cy + h) },
        bottomLeft: { x: Math.max(6, cx - leftW), y: Math.min(90, cy + h - 4) },
      },
      secondaryQuad: {
        topLeft: { x: cx, y: Math.max(6, cy - h) },
        topRight: { x: Math.min(94, cx + rightW), y: Math.max(8, cy - h + 4) },
        bottomRight: { x: Math.min(94, cx + rightW), y: Math.min(90, cy + h - 4) },
        bottomLeft: { x: cx, y: Math.min(92, cy + h) },
      },
      cornerRoundnessPct: 18,
      cornerRadiiPct: { tl: 0, tr: 0, br: 0, bl: 0 },
      material: {
        transparencyPct: 0,
        lumaKeyThreshold: 16,
        hasGlassReflection: false,
        floorGlassSpecular: 0,
        cabinetGridStrength: 16,
        bezelThicknessPx: 6,
        brightnessPct: 105,
        ambientSpillPct: 35,
        floorReflectionPct: 0,
        hasStandeeBase: false,
      },
      contentPresetId: 'naked_eye_3d',
      syncSharedContent: true,
    };
  }

  if (shapeType === 'free_polygon') {
    return {
      id,
      name: `Màn Đa giác #${index}`,
      shapeType,
      quad: {
        topLeft: { x: cx - 22, y: cy - 15 },
        topRight: { x: cx + 22, y: cy - 15 },
        bottomRight: { x: cx + 22, y: cy + 15 },
        bottomLeft: { x: cx - 22, y: cy + 15 },
      },
      polygonPoints: [
        { x: cx - 22, y: cy - 15, cornerRadiusPct: 10 },
        { x: cx + 22, y: cy - 15, cornerRadiusPct: 10 },
        { x: cx + 22, y: cy + 4, cornerRadiusPct: 10 },
        { x: cx + 5, y: cy + 4, cornerRadiusPct: 10 },
        { x: cx + 5, y: cy + 15, cornerRadiusPct: 10 },
        { x: cx - 22, y: cy + 15, cornerRadiusPct: 10 },
      ],
      cornerRoundnessPct: 10,
      cornerRadiiPct: { tl: 10, tr: 10, br: 10, bl: 10 },
      material: {
        transparencyPct: 0,
        lumaKeyThreshold: 16,
        hasGlassReflection: false,
        floorGlassSpecular: 0,
        cabinetGridStrength: 16,
        bezelThicknessPx: 6,
        brightnessPct: 102,
        ambientSpillPct: 35,
        floorReflectionPct: 0,
        hasStandeeBase: false,
      },
      contentPresetId: presetId,
    };
  }

  let hw = 21;
  let hh = 14;
  if (shapeType === 'led_standee') {
    hw = 6.5;
    hh = 24;
  } else if (shapeType === 'cylindrical_column') {
    hw = 8.5;
    hh = 26;
  } else if (shapeType === 'circle_oval') {
    hw = 14;
    hh = 19;
  } else if (shapeType === 'multi_segment_wave') {
    hw = 28;
    hh = 11;
  } else if (shapeType === 'led_floor') {
    hw = 25;
    hh = 12;
  }

  const quad = canonicalizeQuadClient([
    { x: Math.max(4, cx - hw), y: Math.max(5, cy - hh) },
    { x: Math.min(96, cx + hw), y: Math.max(5, cy - hh) },
    { x: Math.min(96, cx + hw), y: Math.min(92, cy + hh) },
    { x: Math.max(4, cx - hw), y: Math.min(92, cy + hh) },
  ]);

  if (shapeType === 'led_floor') {
    quad.topLeft.x = Math.min(92, quad.topLeft.x + 8);
    quad.topRight.x = Math.max(8, quad.topRight.x - 8);
  }

  return {
    id,
    name: `Màn hình #${index}`,
    shapeType,
    quad,
    cornerRoundnessPct: shapeType === 'rounded_rect' ? 14 : 0,
    curveSagTopPct: shapeType === 'curved_arc' ? -6 : shapeType === 'cylindrical_column' ? -8 : 0,
    curveSagBottomPct: shapeType === 'curved_arc' ? 6 : shapeType === 'cylindrical_column' ? 8 : 0,
    cylinderPerspectivePct: shapeType === 'cylindrical_column' ? 12 : 0,
    cornerRadiiPct:
      shapeType === 'rounded_rect'
        ? { tl: 14, tr: 14, br: 14, bl: 14 }
        : { tl: 0, tr: 0, br: 0, bl: 0 },
    material: {
      transparencyPct: shapeType === 'transparent_glass' ? 68 : 0,
      lumaKeyThreshold: 18,
      hasGlassReflection: shapeType === 'transparent_glass',
      floorGlassSpecular: shapeType === 'led_floor' ? 40 : 0,
      cabinetGridStrength: shapeType === 'transparent_glass' ? 35 : 16,
      bezelThicknessPx: shapeType === 'transparent_glass' ? 3 : 6,
      brightnessPct: 102,
      ambientSpillPct: shapeType === 'led_ceiling' ? 20 : 38,
      floorReflectionPct: shapeType === 'flat_rect' || shapeType === 'curved_arc' ? 15 : 0,
      hasStandeeBase: shapeType === 'led_standee',
    },
    contentPresetId:
      shapeType === 'transparent_glass'
        ? 'transparent_neon_3d'
        : shapeType === 'circle_oval'
          ? 'circle_brand_emblem'
          : shapeType === 'led_standee'
            ? 'standee_welcome'
            : shapeType === 'led_floor'
              ? 'floor_galaxy'
              : shapeType === 'led_ceiling'
                ? 'ceiling_sky'
                : presetId,
  };
}

export function createMultiScreenPreset(
  preset: 'stage_3' | 'stage_5' | 'standee_row_3',
  contentPresetId = 'stage_gala'
): LedScreenInstanceDto[] {
  if (preset === 'standee_row_3') {
    return [
      { ...createDefaultScreenInstance('led_standee', { x: 24, y: 58 }, 1, 'standee_welcome'), name: 'Standee Trái' },
      { ...createDefaultScreenInstance('led_standee', { x: 50, y: 56 }, 2, 'standee_welcome'), name: 'Standee Giữa' },
      { ...createDefaultScreenInstance('led_standee', { x: 76, y: 58 }, 3, 'standee_welcome'), name: 'Standee Phải' },
    ];
  }

  const centerMain: LedScreenInstanceDto = {
    ...createDefaultScreenInstance('rounded_rect', { x: 50, y: 42 }, 1, contentPresetId),
    name: 'Màn Chính Sân Khấu',
    quad: {
      topLeft: { x: 31, y: 20 },
      topRight: { x: 69, y: 20 },
      bottomRight: { x: 69, y: 58 },
      bottomLeft: { x: 31, y: 58 },
    },
    cornerRoundnessPct: 6,
    cornerRadiiPct: { tl: 6, tr: 6, br: 6, bl: 6 },
  };

  const leftWing: LedScreenInstanceDto = {
    ...createDefaultScreenInstance('flat_rect', { x: 18, y: 42 }, 2, contentPresetId),
    name: 'Cánh Gà Trái',
    quad: {
      topLeft: { x: 10, y: 22 },
      topRight: { x: 27, y: 20 },
      bottomRight: { x: 27, y: 58 },
      bottomLeft: { x: 10, y: 56 },
    },
    syncSharedContent: true,
  };

  const rightWing: LedScreenInstanceDto = {
    ...createDefaultScreenInstance('flat_rect', { x: 82, y: 42 }, 3, contentPresetId),
    name: 'Cánh Gà Phải',
    quad: {
      topLeft: { x: 73, y: 20 },
      topRight: { x: 90, y: 22 },
      bottomRight: { x: 90, y: 56 },
      bottomLeft: { x: 73, y: 58 },
    },
    syncSharedContent: true,
  };

  if (preset === 'stage_3') {
    return [centerMain, leftWing, rightWing];
  }

  const headerScreen: LedScreenInstanceDto = {
    ...createDefaultScreenInstance('flat_rect', { x: 50, y: 12 }, 4, contentPresetId),
    name: 'Màn Header Trên',
    quad: {
      topLeft: { x: 24, y: 6 },
      topRight: { x: 76, y: 6 },
      bottomRight: { x: 76, y: 15 },
      bottomLeft: { x: 24, y: 15 },
    },
  };

  const floorScreen: LedScreenInstanceDto = {
    ...createDefaultScreenInstance('led_floor', { x: 50, y: 74 }, 5, 'floor_galaxy'),
    name: 'LED Sàn Sân Khấu',
    quad: {
      topLeft: { x: 32, y: 64 },
      topRight: { x: 68, y: 64 },
      bottomRight: { x: 82, y: 86 },
      bottomLeft: { x: 18, y: 86 },
    },
  };

  return [centerMain, leftWing, rightWing, headerScreen, floorScreen];
}

function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement | HTMLImageElement,
  sx0: number,
  sy0: number,
  sx1: number,
  sy1: number,
  sx2: number,
  sy2: number,
  dx0: number,
  dy0: number,
  dx1: number,
  dy1: number,
  dx2: number,
  dy2: number
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();

  const denom = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (Math.abs(denom) < 1e-6) {
    ctx.restore();
    return;
  }

  const a = (dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1)) / denom;
  const b = (dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1)) / denom;
  const c = (dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0)) / denom;
  const d = (dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0)) / denom;
  const e =
    (dx0 * (sx1 * sy2 - sx2 * sy1) +
      dx1 * (sx2 * sy0 - sx0 * sy2) +
      dx2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;
  const f =
    (dy0 * (sx1 * sy2 - sx2 * sy1) +
      dy1 * (sx2 * sy0 - sx0 * sy2) +
      dy2 * (sx0 * sy1 - sx1 * sy0)) /
    denom;

  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(src, 0, 0);
  ctx.restore();
}

function drawProjectiveMeshQuad(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  dstQuadPx: [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D],
  cols = 10,
  rows = 6,
  curveTopPx = 0,
  curveBotPx = 0,
  cylinderMode = false,
  waveMode = false
) {
  const H = computeHomography3x3Client(
    [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
    dstQuadPx
  );
  if (!H) return;

  const gridPts: ClientPoint2D[][] = [];
  for (let r = 0; r <= rows; r++) {
    const v = r / rows;
    const rowArr: ClientPoint2D[] = [];
    for (let c = 0; c <= cols; c++) {
      const u = c / cols;
      // Optional cylindrical horizontal foreshortening for subtle 3D pillar curve
      const effectiveU = cylinderMode
        ? 0.5 + 0.5 * Math.sin((u - 0.5) * Math.PI * 0.94)
        : u;
      const p = applyHomographyClient(H, effectiveU, v);

      // Vertical curve sag (Bezier arc or S/U wave)
      let sag = 0;
      if (waveMode) {
        sag = Math.sin(u * Math.PI * 2) * (Math.abs(curveTopPx) > 2 ? curveTopPx : 14);
      } else if (curveTopPx !== 0 || curveBotPx !== 0 || cylinderMode) {
        const arc = 4 * u * (1 - u);
        const topBias = cylinderMode && Math.abs(curveTopPx) < 1 ? -14 : curveTopPx;
        const botBias = cylinderMode && Math.abs(curveBotPx) < 1 ? 14 : curveBotPx;
        sag = arc * ((1 - v) * topBias + v * botBias);
      }

      rowArr.push({ x: p.x, y: p.y + sag });
    }
    gridPts.push(rowArr);
  }

  const sw = src.width;
  const sh = src.height;
  for (let r = 0; r < rows; r++) {
    const v0 = (r / rows) * sh;
    const v1 = ((r + 1) / rows) * sh;
    for (let c = 0; c < cols; c++) {
      const u0 = (c / cols) * sw;
      const u1 = ((c + 1) / cols) * sw;
      const p00 = gridPts[r][c];
      const p10 = gridPts[r][c + 1];
      const p11 = gridPts[r + 1][c + 1];
      const p01 = gridPts[r + 1][c];

      drawTexturedTriangle(ctx, src, u0, v0, u1, v0, u1, v1, p00.x, p00.y, p10.x, p10.y, p11.x, p11.y);
      drawTexturedTriangle(ctx, src, u0, v0, u1, v1, u0, v1, p00.x, p00.y, p11.x, p11.y, p01.x, p01.y);
    }
  }
}

function buildRoundedContourPath(
  ctx: CanvasRenderingContext2D,
  screen: LedScreenInstanceDto,
  W: number,
  H: number
) {
  const quadToPx = (q: QuadCoordinatesDto): [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D] => [
    { x: (q.topLeft.x / 100) * W, y: (q.topLeft.y / 100) * H },
    { x: (q.topRight.x / 100) * W, y: (q.topRight.y / 100) * H },
    { x: (q.bottomRight.x / 100) * W, y: (q.bottomRight.y / 100) * H },
    { x: (q.bottomLeft.x / 100) * W, y: (q.bottomLeft.y / 100) * H },
  ];

  ctx.beginPath();

  if (screen.shapeType === 'circle_oval') {
    const Hmat = computeHomography3x3Client(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      quadToPx(screen.quad)
    );
    if (Hmat) {
      const steps = 48;
      for (let i = 0; i <= steps; i++) {
        const theta = (i / steps) * Math.PI * 2;
        const u = 0.5 + 0.5 * Math.cos(theta);
        const v = 0.5 + 0.5 * Math.sin(theta);
        const pt = applyHomographyClient(Hmat, u, v);
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      return;
    }
  }

  if (screen.shapeType === 'free_polygon' && screen.polygonPoints && screen.polygonPoints.length >= 3) {
    const pts = screen.polygonPoints.map((p) => ({
      x: (p.x / 100) * W,
      y: (p.y / 100) * H,
      r: (p.cornerRadiusPct ?? screen.cornerRoundnessPct ?? 0) / 100,
    }));
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
      const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
      const rad = Math.min(d1, d2) * Math.min(0.45, Math.max(0, curr.r));
      const p1 =
        rad > 0.5
          ? {
              x: curr.x - ((curr.x - prev.x) / Math.max(1, d1)) * rad,
              y: curr.y - ((curr.y - prev.y) / Math.max(1, d1)) * rad,
            }
          : curr;
      const p2 =
        rad > 0.5
          ? {
              x: curr.x + ((next.x - curr.x) / Math.max(1, d2)) * rad,
              y: curr.y + ((next.y - curr.y) / Math.max(1, d2)) * rad,
            }
          : curr;

      if (i === 0) ctx.moveTo(p1.x, p1.y);
      else ctx.lineTo(p1.x, p1.y);

      if (rad > 0.5) {
        ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
      }
    }
    ctx.closePath();
    return;
  }

  if (screen.shapeType === 'corner_90_smooth' && screen.secondaryQuad) {
    const q1 = quadToPx(screen.quad);
    const q2 = quadToPx(screen.secondaryQuad);
    ctx.moveTo(q1[0].x, q1[0].y);
    ctx.lineTo(q1[1].x, q1[1].y);
    ctx.lineTo(q2[1].x, q2[1].y);
    ctx.lineTo(q2[2].x, q2[2].y);
    ctx.lineTo(q2[3].x, q2[3].y);
    ctx.lineTo(q1[3].x, q1[3].y);
    ctx.closePath();
    return;
  }

  const pts = quadToPx(screen.quad);
  const radii = screen.cornerRadiiPct || {
    tl: screen.cornerRoundnessPct ?? 0,
    tr: screen.cornerRoundnessPct ?? 0,
    br: screen.cornerRoundnessPct ?? 0,
    bl: screen.cornerRoundnessPct ?? 0,
  };
  const rVals = [radii.tl, radii.tr, radii.br, radii.bl];
  const anyCurve =
    screen.shapeType === 'curved_arc' ||
    screen.shapeType === 'cylindrical_column' ||
    screen.shapeType === 'multi_segment_wave';

  if (anyCurve) {
    const Hmat = computeHomography3x3Client(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      pts
    );
    if (Hmat) {
      const segs = 20;
      const topSag = ((screen.curveSagTopPct ?? -6) / 100) * H;
      const botSag = ((screen.curveSagBottomPct ?? 6) / 100) * H;
      const isWave = screen.shapeType === 'multi_segment_wave';
      const isCol = screen.shapeType === 'cylindrical_column';
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const p = applyHomographyClient(Hmat, u, 0);
        const sag = isWave
          ? Math.sin(u * Math.PI * 2) * (Math.abs(topSag) > 2 ? topSag : H * 0.03)
          : 4 * u * (1 - u) * (isCol && Math.abs(topSag) < 1 ? -H * 0.025 : topSag);
        if (i === 0) ctx.moveTo(p.x, p.y + sag);
        else ctx.lineTo(p.x, p.y + sag);
      }
      for (let i = segs; i >= 0; i--) {
        const u = i / segs;
        const p = applyHomographyClient(Hmat, u, 1);
        const sag = isWave
          ? Math.sin(u * Math.PI * 2) * (Math.abs(topSag) > 2 ? topSag : H * 0.03)
          : 4 * u * (1 - u) * (isCol && Math.abs(botSag) < 1 ? H * 0.025 : botSag);
        ctx.lineTo(p.x, p.y + sag);
      }
      ctx.closePath();
      return;
    }
  }

  for (let i = 0; i < 4; i++) {
    const prev = pts[(i + 3) % 4];
    const curr = pts[i];
    const next = pts[(i + 1) % 4];
    const d1 = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const d2 = Math.hypot(next.x - curr.x, next.y - curr.y);
    const radRatio = Math.min(0.45, Math.max(0, (rVals[i] ?? 0) / 100));
    const rad = Math.min(d1, d2) * radRatio;
    const p1 =
      rad > 0.5
        ? {
            x: curr.x - ((curr.x - prev.x) / Math.max(1, d1)) * rad,
            y: curr.y - ((curr.y - prev.y) / Math.max(1, d1)) * rad,
          }
        : curr;
    const p2 =
      rad > 0.5
        ? {
            x: curr.x + ((next.x - curr.x) / Math.max(1, d2)) * rad,
            y: curr.y + ((next.y - curr.y) / Math.max(1, d2)) * rad,
          }
        : curr;
    if (i === 0) ctx.moveTo(p1.x, p1.y);
    else ctx.lineTo(p1.x, p1.y);
    if (rad > 0.5) ctx.quadraticCurveTo(curr.x, curr.y, p2.x, p2.y);
  }
  ctx.closePath();
}

function getPolygonBoundingQuadPx(screen: LedScreenInstanceDto, W: number, H: number): [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D] {
  if (screen.shapeType === 'free_polygon' && screen.polygonPoints && screen.polygonPoints.length >= 3) {
    const xs = screen.polygonPoints.map((p) => (p.x / 100) * W);
    const ys = screen.polygonPoints.map((p) => (p.y / 100) * H);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ];
  }
  return [
    { x: (screen.quad.topLeft.x / 100) * W, y: (screen.quad.topLeft.y / 100) * H },
    { x: (screen.quad.topRight.x / 100) * W, y: (screen.quad.topRight.y / 100) * H },
    { x: (screen.quad.bottomRight.x / 100) * W, y: (screen.quad.bottomRight.y / 100) * H },
    { x: (screen.quad.bottomLeft.x / 100) * W, y: (screen.quad.bottomLeft.y / 100) * H },
  ];
}

/**
 * Renders the full multi-screen composite (12 morphologies, lighting, bezel, floor reflection, standee base, occlusion brush)
 */
export function renderMultiScreenLedScene(
  ctx: CanvasRenderingContext2D,
  baseImg: HTMLImageElement | HTMLCanvasElement,
  screens: LedScreenInstanceDto[],
  contentCanvasMap: Record<string, HTMLCanvasElement>,
  occlusionCanvas?: HTMLCanvasElement | null,
  options?: { highQuality?: boolean }
) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(baseImg, 0, 0, W, H);

  const highQuality = Boolean(options?.highQuality);
  const cols = highQuality ? 18 : 8;
  const rows = highQuality ? 12 : 5;

  for (const screen of screens) {
    const srcContent = contentCanvasMap[screen.id] || Object.values(contentCanvasMap)[0];
    if (!srcContent) continue;

    const mat = screen.material || {
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
    };

    const isTransparent =
      screen.shapeType === 'transparent_glass' || (mat.transparencyPct ?? 0) > 5;

    // 1. Standee ground base plate & contact shadow (before screen face)
    if (screen.shapeType === 'led_standee' || mat.hasStandeeBase) {
      const bl = { x: (screen.quad.bottomLeft.x / 100) * W, y: (screen.quad.bottomLeft.y / 100) * H };
      const br = { x: (screen.quad.bottomRight.x / 100) * W, y: (screen.quad.bottomRight.y / 100) * H };
      const standeeW = Math.hypot(br.x - bl.x, br.y - bl.y);
      const baseCx = (bl.x + br.x) / 2;
      const baseCy = (bl.y + br.y) / 2;
      ctx.save();
      // Floor contact shadow
      const shadowGrad = ctx.createRadialGradient(baseCx, baseCy + standeeW * 0.08, 4, baseCx, baseCy + standeeW * 0.08, standeeW * 0.85);
      shadowGrad.addColorStop(0, 'rgba(0,0,0,0.52)');
      shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = shadowGrad;
      ctx.beginPath();
      ctx.ellipse(baseCx, baseCy + standeeW * 0.08, standeeW * 0.78, Math.max(8, standeeW * 0.14), 0, 0, Math.PI * 2);
      ctx.fill();
      // Sleek matte metal Standee pedestal base
      ctx.fillStyle = '#0F172A';
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(baseCx, baseCy + 4, standeeW * 0.6, Math.max(6, standeeW * 0.1), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // 2. Ambient Wall Spill / Drop Shadow behind frame
    ctx.save();
    const spillRatio = (mat.ambientSpillPct ?? 35) / 100;
    buildRoundedContourPath(ctx, screen, W, H);
    ctx.shadowColor = isTransparent
      ? `rgba(56, 189, 248, ${(spillRatio * 0.45).toFixed(2)})`
      : `rgba(37, 99, 235, ${(spillRatio * 0.55).toFixed(2)})`;
    ctx.shadowBlur = Math.round(28 * spillRatio + 4);
    ctx.fillStyle = isTransparent ? 'rgba(0,0,0,0.01)' : '#0B1120';
    ctx.fill();
    ctx.restore();

    // 3. Clipped LED screen content warp
    ctx.save();
    buildRoundedContourPath(ctx, screen, W, H);
    ctx.clip();

    if (isTransparent) {
      // Dark interior frame backing slightly tinted glass, then screen blend light
      const opac = Math.max(0.15, Math.min(0.95, 1 - (mat.transparencyPct ?? 65) / 100));
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = Math.min(1, opac + 0.35);
    } else {
      ctx.globalAlpha = 1;
    }

    const bPct = mat.brightnessPct ?? 102;
    if (Math.abs(bPct - 100) > 4) {
      ctx.filter = `brightness(${(bPct / 100).toFixed(2)}) contrast(${bPct > 105 ? 1.05 : 1})`;
    }

    if (screen.shapeType === 'corner_90_smooth' && screen.secondaryQuad) {
      // Split source canvas horizontally or cover each wall cleanly
      const leftPts: [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D] = [
        { x: (screen.quad.topLeft.x / 100) * W, y: (screen.quad.topLeft.y / 100) * H },
        { x: (screen.quad.topRight.x / 100) * W, y: (screen.quad.topRight.y / 100) * H },
        { x: (screen.quad.bottomRight.x / 100) * W, y: (screen.quad.bottomRight.y / 100) * H },
        { x: (screen.quad.bottomLeft.x / 100) * W, y: (screen.quad.bottomLeft.y / 100) * H },
      ];
      const rightPts: [ClientPoint2D, ClientPoint2D, ClientPoint2D, ClientPoint2D] = [
        { x: (screen.secondaryQuad.topLeft.x / 100) * W, y: (screen.secondaryQuad.topLeft.y / 100) * H },
        { x: (screen.secondaryQuad.topRight.x / 100) * W, y: (screen.secondaryQuad.topRight.y / 100) * H },
        { x: (screen.secondaryQuad.bottomRight.x / 100) * W, y: (screen.secondaryQuad.bottomRight.y / 100) * H },
        { x: (screen.secondaryQuad.bottomLeft.x / 100) * W, y: (screen.secondaryQuad.bottomLeft.y / 100) * H },
      ];

      // Split source across left half & right half so graphic continues seamlessly around the corner!
      const halfW = Math.floor(srcContent.width / 2);
      const leftHalf = document.createElement('canvas');
      leftHalf.width = halfW;
      leftHalf.height = srcContent.height;
      leftHalf.getContext('2d')?.drawImage(srcContent, 0, 0, halfW, srcContent.height, 0, 0, halfW, srcContent.height);

      const rightHalf = document.createElement('canvas');
      rightHalf.width = srcContent.width - halfW;
      rightHalf.height = srcContent.height;
      rightHalf
        .getContext('2d')
        ?.drawImage(srcContent, halfW, 0, srcContent.width - halfW, srcContent.height, 0, 0, rightHalf.width, srcContent.height);

      drawProjectiveMeshQuad(ctx, leftHalf, leftPts, Math.max(4, Math.floor(cols / 2)), rows);
      drawProjectiveMeshQuad(ctx, rightHalf, rightPts, Math.max(4, Math.floor(cols / 2)), rows);

      // Subtle architectural hinge highlight / fold shading at corner
      const hxTop = (screen.quad.topRight.x / 100) * W;
      const hyTop = (screen.quad.topRight.y / 100) * H;
      const hxBot = (screen.quad.bottomRight.x / 100) * W;
      const hyBot = (screen.quad.bottomRight.y / 100) * H;
      const cornerGrad = ctx.createLinearGradient(hxTop - 16, hyTop, hxTop + 16, hyTop);
      cornerGrad.addColorStop(0, 'rgba(0,0,0,0)');
      cornerGrad.addColorStop(0.5, `rgba(255,255,255,${(screen.cornerRoundnessPct ?? 18) > 10 ? 0.16 : 0.25})`);
      cornerGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
      ctx.strokeStyle = cornerGrad;
      ctx.lineWidth = Math.max(4, Math.round(((screen.cornerRoundnessPct ?? 18) / 100) * 28));
      ctx.beginPath();
      ctx.moveTo(hxTop, hyTop);
      ctx.lineTo(hxBot, hyBot);
      ctx.stroke();
    } else {
      const dstQuad = getPolygonBoundingQuadPx(screen, W, H);
      const isCurved = screen.shapeType === 'curved_arc';
      const isCylinder = screen.shapeType === 'cylindrical_column';
      const isWave = screen.shapeType === 'multi_segment_wave';
      const topSagPx = isCurved || isWave ? ((screen.curveSagTopPct ?? -6) / 100) * H : 0;
      const botSagPx = isCurved ? ((screen.curveSagBottomPct ?? 6) / 100) * H : 0;

      drawProjectiveMeshQuad(
        ctx,
        srcContent,
        dstQuad,
        isCurved || isCylinder || isWave ? Math.max(12, cols) : cols,
        rows,
        topSagPx,
        botSagPx,
        isCylinder,
        isWave
      );

      // 3b. Cylindrical 3D cosine side shading
      if (isCylinder) {
        const cLeftX = Math.min(dstQuad[0].x, dstQuad[3].x);
        const cRightX = Math.max(dstQuad[1].x, dstQuad[2].x);
        const cylGrad = ctx.createLinearGradient(cLeftX, 0, cRightX, 0);
        cylGrad.addColorStop(0, 'rgba(0,0,0,0.44)');
        cylGrad.addColorStop(0.18, 'rgba(0,0,0,0.12)');
        cylGrad.addColorStop(0.46, 'rgba(255,255,255,0.08)');
        cylGrad.addColorStop(0.82, 'rgba(0,0,0,0.12)');
        cylGrad.addColorStop(1, 'rgba(0,0,0,0.44)');
        ctx.fillStyle = cylGrad;
        ctx.fillRect(0, 0, W, H);
      }
    }

    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 3c. Optional Transparent LED horizontal glass slats & sheen OR Subtle LED Diode grid
    if (isTransparent) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (let y = 0; y < H; y += 6) {
        ctx.fillRect(0, y, W, 1);
      }
      const glassSheen = ctx.createLinearGradient(0, 0, W, H);
      glassSheen.addColorStop(0, 'rgba(255,255,255,0.14)');
      glassSheen.addColorStop(0.45, 'rgba(255,255,255,0)');
      glassSheen.addColorStop(1, 'rgba(255,255,255,0.08)');
      ctx.fillStyle = glassSheen;
      ctx.fillRect(0, 0, W, H);
    } else if ((mat.cabinetGridStrength ?? 16) > 4) {
      const gridAlpha = Math.min(0.22, ((mat.cabinetGridStrength ?? 16) / 100) * 0.25);
      ctx.strokeStyle = `rgba(0, 0, 0, ${gridAlpha.toFixed(2)})`;
      ctx.lineWidth = 1;
      const step = highQuality ? 48 : 64;
      for (let gx = 0; gx < W; gx += step) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, H);
        ctx.stroke();
      }
      for (let gy = 0; gy < H; gy += step) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(W, gy);
        ctx.stroke();
      }
    }

    // Tempered glass specular overlay on LED floor
    if (screen.shapeType === 'led_floor' && (mat.floorGlassSpecular ?? 40) > 0) {
      const fGrad = ctx.createLinearGradient(0, H * 0.4, W, H * 0.9);
      fGrad.addColorStop(0, 'rgba(255,255,255,0.18)');
      fGrad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
      fGrad.addColorStop(1, 'rgba(255,255,255,0.14)');
      ctx.fillStyle = fGrad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();

    // 4. Physical 3D anodized aluminum/steel cabinet bezel around exact contour
    if ((mat.bezelThicknessPx ?? 6) > 0) {
      ctx.save();
      buildRoundedContourPath(ctx, screen, W, H);
      ctx.lineWidth = Math.max(1.5, ((mat.bezelThicknessPx ?? 6) / 6) * (W / 320));
      ctx.strokeStyle = isTransparent ? 'rgba(203, 213, 225, 0.55)' : '#0F172A';
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = isTransparent ? 'rgba(255,255,255,0.35)' : 'rgba(148, 163, 184, 0.35)';
      ctx.stroke();
      ctx.restore();
    }

    // 5. Optional subtle floor glow reflection beneath vertical wall screens
    if ((mat.floorReflectionPct ?? 0) > 5 && screen.shapeType !== 'led_floor' && screen.shapeType !== 'led_ceiling') {
      const bl = { x: (screen.quad.bottomLeft.x / 100) * W, y: (screen.quad.bottomLeft.y / 100) * H };
      const br = { x: (screen.quad.bottomRight.x / 100) * W, y: (screen.quad.bottomRight.y / 100) * H };
      const rCx = (bl.x + br.x) / 2;
      const rCy = Math.max(bl.y, br.y) + H * 0.06;
      const rW = Math.hypot(br.x - bl.x, br.y - bl.y) * 0.65;
      const alpha = ((mat.floorReflectionPct ?? 15) / 100) * 0.25;
      ctx.save();
      const rg = ctx.createRadialGradient(rCx, rCy, 4, rCx, rCy, Math.max(30, rW));
      rg.addColorStop(0, `rgba(56, 189, 248, ${alpha.toFixed(2)})`);
      rg.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, Math.min(bl.y, br.y), W, H - Math.min(bl.y, br.y));
      ctx.restore();
    }
  }

  // 6. Foreground Occlusion Brush: Restore original photo pixels (podiums, chairs, plants, pillars) IN FRONT of LED!
  if (occlusionCanvas) {
    const tempOrig = document.createElement('canvas');
    tempOrig.width = W;
    tempOrig.height = H;
    const tCtx = tempOrig.getContext('2d');
    if (tCtx) {
      tCtx.drawImage(baseImg, 0, 0, W, H);
      tCtx.globalCompositeOperation = 'destination-in';
      tCtx.drawImage(occlusionCanvas, 0, 0, W, H);
      ctx.drawImage(tempOrig, 0, 0, W, H);
    }
  }
}

/**
 * Generates normalized PNG buffers for Cloud AI Mask-Inpainting + Post-AI Pixel Guard.
 */
export function exportGuidedAndMaskPngs(
  baseImg: HTMLImageElement,
  screens: LedScreenInstanceDto[],
  contentCanvasMap: Record<string, HTMLCanvasElement>,
  occlusionCanvas?: HTMLCanvasElement | null,
  maxEdgePx = 1408
): {
  width: number;
  height: number;
  guidedCompositeBase64: string;
  originalPhotoBase64: string;
  alphaMaskBase64: string;
  occlusionMaskBase64: string | null;
} {
  const natW = baseImg.naturalWidth || 1280;
  const natH = baseImg.naturalHeight || 720;
  const scale = Math.min(1, maxEdgePx / Math.max(natW, natH));
  const W = Math.max(320, Math.round(natW * scale));
  const H = Math.max(240, Math.round(natH * scale));

  // 1. Original Photo PNG
  const origCanvas = document.createElement('canvas');
  origCanvas.width = W;
  origCanvas.height = H;
  const origCtx = origCanvas.getContext('2d');
  origCtx?.drawImage(baseImg, 0, 0, W, H);

  // 2. Guided Composite PNG
  const guidedCanvas = document.createElement('canvas');
  guidedCanvas.width = W;
  guidedCanvas.height = H;
  const gCtx = guidedCanvas.getContext('2d');
  if (gCtx) {
    renderMultiScreenLedScene(gCtx, baseImg, screens, contentCanvasMap, occlusionCanvas, {
      highQuality: true,
    });
  }

  // 3. Combined RGBA Inpaint Mask PNG (alpha = 0 inside all LED shapes + feather halo; alpha = 255 outside)
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = W;
  maskCanvas.height = H;
  const mCtx = maskCanvas.getContext('2d');
  if (mCtx) {
    mCtx.fillStyle = 'rgba(0,0,0,1)';
    mCtx.fillRect(0, 0, W, H);

    // Cut out all active LED screens with soft feathered edge for realistic light spill blending
    mCtx.save();
    mCtx.globalCompositeOperation = 'destination-out';
    mCtx.shadowColor = 'rgba(0,0,0,1)';
    mCtx.shadowBlur = 14;
    for (const s of screens) {
      buildRoundedContourPath(mCtx, s, W, H);
      mCtx.fillStyle = 'rgba(0,0,0,1)';
      mCtx.fill();
      mCtx.lineWidth = 10;
      mCtx.strokeStyle = 'rgba(0,0,0,0.8)';
      mCtx.stroke();
    }
    mCtx.restore();

    // If user painted foreground occlusion strokes, restore alpha=255 over those objects so Pixel Guard locks them!
    if (occlusionCanvas) {
      mCtx.save();
      mCtx.globalCompositeOperation = 'source-over';
      mCtx.drawImage(occlusionCanvas, 0, 0, W, H);
      mCtx.restore();
    }
  }

  let occlusionMaskBase64: string | null = null;
  if (occlusionCanvas) {
    const occScaled = document.createElement('canvas');
    occScaled.width = W;
    occScaled.height = H;
    const oCtx = occScaled.getContext('2d');
    oCtx?.drawImage(occlusionCanvas, 0, 0, W, H);
    occlusionMaskBase64 = occScaled.toDataURL('image/png').split(',')[1] || null;
  }

  return {
    width: W,
    height: H,
    guidedCompositeBase64: guidedCanvas.toDataURL('image/png').split(',')[1] || '',
    originalPhotoBase64: origCanvas.toDataURL('image/png').split(',')[1] || '',
    alphaMaskBase64: maskCanvas.toDataURL('image/png').split(',')[1] || '',
    occlusionMaskBase64,
  };
}

/**
 * Generates an annotated 0..100 coordinate grid preview with a bright red click marker
 * so Vision AI can snap precisely onto the target surface in 1 click.
 */
export function buildVisionAnnotatedBase64(
  baseImg: HTMLImageElement,
  clickPoint?: ClientPoint2D | null
): string {
  const natW = baseImg.naturalWidth || 1024;
  const natH = baseImg.naturalHeight || 768;
  const scale = Math.min(1, 960 / Math.max(natW, natH));
  const W = Math.round(natW * scale);
  const H = Math.round(natH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(baseImg, 0, 0, W, H);

  // Subtle 10% interval coordinate ruler grid
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.font = 'bold 11px monospace';
  for (let pct = 10; pct < 100; pct += 10) {
    const x = (pct / 100) * W;
    const y = (pct / 100) * H;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.fillRect(x - 10, 2, 20, 14);
    ctx.fillRect(2, y - 7, 22, 14);
    ctx.fillStyle = '#38BDF8';
    ctx.fillText(String(pct), x - 7, 13);
    ctx.fillText(String(pct), 4, y + 4);
  }

  if (clickPoint) {
    const cx = (clickPoint.x / 100) * W;
    const cy = (clickPoint.y / 100) * H;
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#EF4444';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();
  }
  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.85).split(',')[1] || '';
}
