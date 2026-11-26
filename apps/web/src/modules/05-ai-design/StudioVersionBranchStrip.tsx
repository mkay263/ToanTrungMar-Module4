'use client';

import React from 'react';
import { GitBranch, Image as ImageIcon } from 'lucide-react';
import type { DesignAssetVersionItemDto } from '@toantrung/contracts';

export interface StudioVersionBranchStripProps {
  versions: DesignAssetVersionItemDto[];
  selectedVersionId: number | null;
  currentVersionId: number | null;
  viewMode: 'original' | 'result' | 'live_3d' | 'compare' | 'bom';
  showHandles: boolean;
  sitePhotoUrl: string | null;
  sitePhotoName: string | null;
  projectDesignType?: string | null;
  pixelPitch: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onSelectOriginalPhoto: () => void;
  onSelectVersion: (ver: DesignAssetVersionItemDto) => void;
  onRenameVersion: (ver: DesignAssetVersionItemDto, currentTitle: string | null) => void;
  onDeleteVersion: (ver: DesignAssetVersionItemDto) => void;
}

export const StudioVersionBranchStrip = React.memo(function StudioVersionBranchStrip({
  versions,
  selectedVersionId,
  currentVersionId,
  viewMode,
  showHandles,
  sitePhotoUrl,
  sitePhotoName,
  projectDesignType,
  pixelPitch,
  collapsed,
  onToggleCollapse,
  onSelectOriginalPhoto,
  onSelectVersion,
  onRenameVersion,
  onDeleteVersion,
}: StudioVersionBranchStripProps) {
  const activeVersion =
    (!showHandles && viewMode !== 'original'
      ? versions.find((v) => v.id === (selectedVersionId ?? currentVersionId))
      : null) || null;

  const skippedVersions = activeVersion
    ? versions.filter((v) => v.versionNumber > activeVersion.versionNumber)
    : [];

  const latestVerNum =
    versions.length > 0 ? versions[versions.length - 1].versionNumber : 0;

  return (
    <div className="mt-2 shrink-0 border-t border-slate-100 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-slate-600">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-slate-800">
            <GitBranch className="h-3.5 w-3.5 text-indigo-600" />
            <span>
              {versions.length > 0
                ? `Dòng phiên bản R1 → R${latestVerNum} (${versions.length} bản)`
                : 'Dòng phiên bản thiết kế (Chưa có bản AI)'}
            </span>
          </span>
          <button
            type="button"
            onClick={onToggleCollapse}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-extrabold text-slate-600 hover:bg-slate-100 transition"
            title={
              collapsed
                ? 'Mở rộng dải phiên bản rẽ nhánh'
                : 'Thu gọn dải phiên bản để tăng diện tích ảnh chính'
            }
          >
            {collapsed ? 'Mở rộng ▴' : 'Thu gọn ▾'}
          </button>
        </div>

        {activeVersion ? (
          skippedVersions.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-800">
              <span>
                🌿 Đang chọn R{activeVersion.versionNumber} làm gốc · Bỏ qua{' '}
                {skippedVersions.map((v) => `R${v.versionNumber}`).join(', ')} khi tạo bản mới
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-0.5 text-[10.5px] font-bold text-indigo-800">
              <span>🌿 Đang chọn R{activeVersion.versionNumber} làm gốc sửa tiếp</span>
            </span>
          )
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[10.5px] font-semibold text-slate-600">
            <ImageIcon className="h-3 w-3 text-slate-500" />
            <span>📷 Đang dùng Ảnh hiện trạng gốc</span>
          </span>
        )}
      </div>

      {!collapsed && (
        <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1.5">
          {sitePhotoUrl && (
            <button
              type="button"
              onClick={onSelectOriginalPhoto}
              className="group relative flex w-32 shrink-0 flex-col text-left focus:outline-none"
              title="Quay lại chọn Ảnh hiện trạng gốc để tạo phương án mới từ đầu"
            >
              <div
                className={`relative h-20 w-full overflow-hidden rounded-xl border-2 bg-slate-900 transition ${
                  viewMode === 'original' || showHandles
                    ? 'border-[#1553A2] ring-2 ring-blue-500/25'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <img
                  src={sitePhotoUrl}
                  alt={sitePhotoName || 'Ảnh hiện trạng gốc'}
                  className="h-full w-full object-cover"
                />
                <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/85 px-1.5 py-0.5 text-[9px] font-extrabold text-white">
                  Ảnh gốc
                </span>
              </div>
              <span
                className={`mt-1 truncate rounded-md px-1.5 py-0.5 text-center text-[11px] font-bold ${
                  viewMode === 'original' || showHandles
                    ? 'bg-blue-50 text-[#1553A2]'
                    : 'text-slate-600 group-hover:text-[#1553A2]'
                }`}
              >
                {sitePhotoName ? sitePhotoName.slice(0, 14) : 'Hiện trường'}
              </span>
            </button>
          )}

          {versions.map((ver) => {
            const isSelectedVer =
              !showHandles &&
              viewMode !== 'bom' &&
              viewMode !== 'original' &&
              (selectedVersionId === ver.id || currentVersionId === ver.id);
            const parentId = ver.sourceVersionId ?? ver.parentVersionId ?? null;
            const parentVer = parentId ? versions.find((v) => v.id === parentId) : null;
            const isPosterVer =
              /poster|banner/i.test(ver.promptUsed || '') ||
              projectDesignType === 'banner';
            const isCadBlueprintVer = /Sơ đồ ghép Cabin|BOM/i.test(ver.promptUsed || '');
            const customTitle =
              ver.promptUsed &&
              !isCadBlueprintVer &&
              !/^\s*@(?:taoanh|taoanhposter)/i.test(ver.promptUsed.trim()) &&
              ver.promptUsed.trim().length <= 42
                ? ver.promptUsed.trim()
                : null;
            const shortTitle = customTitle
              ? customTitle
              : isCadBlueprintVer
                ? 'Bản vẽ Cabin & BOM'
                : isPosterVer
                  ? '@TaoAnhPoster'
                  : `@TaoAnh ${pixelPitch}`;

            return (
              <div
                key={ver.id}
                data-testid={`version-card-v${ver.versionNumber}`}
                onClick={() => onSelectVersion(ver)}
                className="group relative flex w-44 shrink-0 cursor-pointer flex-col text-left focus:outline-none"
              >
                <div
                  className={`relative h-20 w-full overflow-hidden rounded-xl border-2 bg-slate-900 transition ${
                    isSelectedVer
                      ? 'border-[#7846FF] ring-2 ring-purple-500/25'
                      : 'border-slate-200 hover:border-purple-300'
                  }`}
                >
                  {ver.fileAvailable === false ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-800 px-2 text-center text-[10px] font-medium text-slate-300">
                      Chưa có tệp đầu ra
                    </div>
                  ) : (
                    <img
                      src={`/api/v1/design/asset/${ver.id}`}
                      alt={`Phiên bản R${ver.versionNumber}`}
                      className="h-full w-full object-cover"
                    />
                  )}

                  {/* Top-left: R{n} pill + Parent lineage badge */}
                  <div className="absolute left-1.5 top-1.5 flex items-center gap-1">
                    <span className="rounded bg-slate-900/85 px-1.5 py-0.5 text-[9.5px] font-extrabold text-white shadow">
                      R{ver.versionNumber}
                    </span>
                    {parentVer && (
                      <span
                        className="rounded bg-indigo-600/90 px-1.5 py-0.5 text-[9px] font-bold text-white shadow"
                        title={`Rẽ nhánh từ phiên bản R${parentVer.versionNumber}`}
                      >
                        ↳ từ R{parentVer.versionNumber}
                      </span>
                    )}
                  </div>

                  {/* Top-right: Approved Final badge + Hover Rename/Delete */}
                  <div
                    className="absolute right-1.5 top-1.5 flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {ver.isApprovedFinal && (
                      <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow">
                        ✓ Đã chốt
                      </span>
                    )}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => onRenameVersion(ver, customTitle)}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/85 text-[10px] font-bold text-white hover:bg-[#1553A2]"
                        title="Đổi tên phiên bản này"
                      >
                        ✎
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteVersion(ver)}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/85 text-xs font-bold text-white hover:bg-red-600"
                        title="Xoá phiên bản này"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>

                {/* Clean 2-line Card Footer */}
                <div className="mt-1 px-0.5">
                  <div
                    className={`truncate text-[11px] font-bold ${
                      isSelectedVer
                        ? 'text-[#6D28D9]'
                        : 'text-slate-700 group-hover:text-[#6D28D9]'
                    }`}
                    title={customTitle || ver.promptUsed || ''}
                  >
                    {shortTitle}
                  </div>
                  <div className="mt-0.5 flex items-center justify-between text-[10px]">
                    {isSelectedVer ? (
                      <span className="rounded bg-purple-100 px-1.5 py-0.2 font-extrabold text-[#6D28D9]">
                        ● Gốc đang sửa
                      </span>
                    ) : (
                      <span className="text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity font-semibold">
                        Chọn làm gốc
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});
