'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  GitBranch,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { ProjectPhotoItemDto } from '@toantrung/contracts';

export interface StudioPromptComposerProps {
  selectedPhoto: ProjectPhotoItemDto | null;
  sitePhotoUrl: string | null;
  activeProductPhotos: ProjectPhotoItemDto[];
  onToggleProductPhotoRole: (photo: ProjectPhotoItemDto) => void;
  onClickAddProductPhoto: () => void;
  touchPoints: Array<{ label: string }>;
  bannerWidthPx: number;
  bannerHeightPx: number;
  aspectRatio: string;
  chatPrompt: string;
  onPromptChange: (val: string) => void;
  onExecuteChatSubmit: (rawText: string, forceImageMode?: boolean) => void;
  onSendFormSubmit: (e: React.FormEvent) => void;
  submitting: boolean;
  preparingPreview: boolean;
  piiAlert: string | null;
  promptLibraryCount: number;
  onOpenPromptLibrary: () => void;
  promptApprovalEnabled: boolean;
  onTogglePromptApprovalMode: () => void;
  viewMode: 'original' | 'result' | 'live_3d' | 'compare' | 'bom';
  currentVersionId: number | null;
  currentVersionNumber: number | null;
  statelessBranchingEnabled: boolean;
  onToggleStatelessBranching: () => void;
  hasPendingPreview: boolean;
}

export const StudioPromptComposer = React.memo(function StudioPromptComposer({
  selectedPhoto,
  sitePhotoUrl,
  activeProductPhotos,
  onToggleProductPhotoRole,
  onClickAddProductPhoto,
  touchPoints,
  bannerWidthPx,
  bannerHeightPx,
  aspectRatio,
  chatPrompt,
  onPromptChange,
  onExecuteChatSubmit,
  onSendFormSubmit,
  submitting,
  preparingPreview,
  piiAlert,
  promptLibraryCount,
  onOpenPromptLibrary,
  promptApprovalEnabled,
  onTogglePromptApprovalMode,
  viewMode,
  currentVersionId,
  currentVersionNumber,
  statelessBranchingEnabled,
  onToggleStatelessBranching,
  hasPendingPreview,
}: StudioPromptComposerProps) {
  const [showPromptMenu, setShowPromptMenu] = useState(false);

  const isEditingVersion =
    viewMode === 'result' && currentVersionId !== null && currentVersionNumber !== null;
  const anchorThumbUrl = isEditingVersion
    ? `/api/v1/design/asset/${currentVersionId}`
    : sitePhotoUrl;

  const trimmedChat = chatPrompt.trim();
  const isPureConsult =
    !/^\s*@(?:banner|baneer|tạobanner|poster|taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\b/i.test(
      trimmedChat
    ) && /^(?:phân\s*tích|tư\s*vấn|cho\s*(?:tôi|mình)\s*hỏi|hỏi\s*thêm|giải\s*thích)/i.test(trimmedChat);
  const looksLikeImageIntent =
    Boolean(trimmedChat) &&
    !isPureConsult &&
    (hasPendingPreview ||
      /^\s*@(?:banner|baneer|tạobanner|poster|taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner|taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\b/i.test(
        trimmedChat
      ) ||
      /(?:tạo|thiết\s*kế|làm|vẽ|xuất|ghép|chèn|đưa|đặt|lắp|thêm|phối\s*cảnh|sửa\s*ảnh|chỉnh\s*ảnh|render)/i.test(
        trimmedChat
      ));

  return (
    <div className="shrink-0 border-t border-slate-200/90 bg-white px-3 py-2.5 space-y-2">
      {/* 1 Ultra-Slim Context & Mode Bar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          <div className="h-[20px] w-[28px] shrink-0 overflow-hidden rounded border border-slate-200 bg-slate-900 flex items-center justify-center">
            {anchorThumbUrl ? (
              <img
                src={anchorThumbUrl}
                alt={isEditingVersion ? `R${currentVersionNumber}` : 'Ảnh gốc'}
                className="h-full w-full object-cover"
              />
            ) : (
              <ImageIcon className="h-3 w-3 text-slate-400" />
            )}
          </div>
          <span className="truncate font-bold text-slate-800 max-w-[125px]">
            {isEditingVersion ? `Gốc: Ảnh R${currentVersionNumber}` : selectedPhoto?.name || 'Ảnh gốc'}
          </span>

          {isEditingVersion && (
            <button
              type="button"
              data-testid="toggle-stateless-branching-btn"
              onClick={onToggleStatelessBranching}
              title="Phương án 2: Chỉ gửi đúng Ảnh phiên bản đang chọn + Lệnh mới, không cộng dồn lịch sử chat cũ"
              className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition ${
                statelessBranchingEnabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <GitBranch className="h-2.5 w-2.5" />
              <span>{statelessBranchingEnabled ? 'Rẽ nhánh sạch' : 'Kèm lịch sử'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClickAddProductPhoto}
            className="inline-flex items-center gap-0.5 rounded-md border border-purple-200 bg-purple-50/60 px-1.5 py-0.5 text-[10px] font-bold text-[#6D28D9] hover:bg-purple-100 transition"
            title="Đính kèm ảnh sản phẩm Công ty"
          >
            <Plus className="h-2.5 w-2.5" />
            <span>SP</span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            data-testid="toggle-prompt-approval-btn"
            onClick={onTogglePromptApprovalMode}
            title="Phương án 1: AI chuẩn hóa câu lệnh ở Bước 1 ($0) để duyệt trước khi gọi API tạo ảnh"
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-bold transition ${
              promptApprovalEnabled
                ? 'border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                : 'border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <ShieldCheck className="h-3 w-3" />
            <span>{promptApprovalEnabled ? 'Duyệt trước: BẬT' : 'Duyệt trước: TẮT'}</span>
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPromptMenu((prev) => !prev)}
              className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-slate-50 hover:bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 transition"
              title="Mẫu câu lệnh & Thư viện"
            >
              <span>Mẫu</span>
              <ChevronDown
                className={`h-2.5 w-2.5 text-slate-500 transition-transform ${showPromptMenu ? 'rotate-180' : ''}`}
              />
            </button>

            {showPromptMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowPromptMenu(false)} />
                <div className="absolute right-0 bottom-full mb-1.5 z-50 w-64 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl text-xs">
                  <div className="px-2 py-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Gợi ý nhanh
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const clean = chatPrompt
                        .replace(/^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i, '')
                        .trim();
                      const defaultCompositePrompt =
                        activeProductPhotos.length > 0
                          ? `Ghép sản phẩm "${activeProductPhotos[0]?.name.replace(/^\[Sản phẩm\]\s*/i, '')}" vào vùng chấm điểm trên ảnh hiện trường chân thực và cân đối ánh sáng`
                          : `Phối cảnh & chỉnh sửa trực tiếp trên ảnh hiện trường theo yêu cầu, giữ nguyên góc chụp tự nhiên (${bannerWidthPx}×${bannerHeightPx}px)`;
                      onPromptChange(clean || defaultCompositePrompt);
                      setShowPromptMenu(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 transition"
                  >
                    <div>
                      <div className="font-bold text-slate-800">Phối cảnh ghép SP</div>
                      <div className="text-[10px] text-slate-500">Ghép sản phẩm vào điểm chạm hiện trường</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const clean = chatPrompt
                        .replace(/^\s*@(?:taoanhposter|taoposter|tao[j]?anh)\s*:?\s*/i, '')
                        .trim();
                      const defaultBannerPrompt =
                        activeProductPhotos.length > 0
                          ? `Tạo banner quảng cáo nổi bật có chèn ảnh sản phẩm "${activeProductPhotos[0]?.name.replace(/^\[Sản phẩm\]\s*/i, '')}" tỷ lệ ${aspectRatio} (${bannerWidthPx}×${bannerHeightPx}px)`
                          : `Tạo banner quảng cáo chuyên nghiệp tỷ lệ ${aspectRatio} (${bannerWidthPx}×${bannerHeightPx}px) với nội dung: `;
                      onPromptChange(clean || defaultBannerPrompt);
                      setShowPromptMenu(false);
                    }}
                    className="flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left hover:bg-slate-50 transition"
                  >
                    <div>
                      <div className="font-bold text-slate-800">Tạo Banner có SP</div>
                      <div className="text-[10px] text-slate-500">Tạo banner quảng cáo theo tỷ lệ thiết kế</div>
                    </div>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    type="button"
                    data-testid="open-prompt-library-btn"
                    onClick={() => {
                      onOpenPromptLibrary();
                      setShowPromptMenu(false);
                    }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left hover:bg-indigo-50/70 transition"
                  >
                    <span className="font-bold text-indigo-700">Thư viện mẫu lệnh</span>
                    <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
                      {promptLibraryCount}
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Attached Product Chips (only rendered when user attached SP photos) */}
      {activeProductPhotos.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[10px]">
          {activeProductPhotos.map((prod) => (
            <span
              key={prod.id}
              className="inline-flex items-center gap-1 rounded-md border border-purple-200 bg-purple-50 px-1.5 py-0.5 font-bold text-[#6D28D9] max-w-[160px] truncate"
            >
              <span className="truncate">SP: {prod.name.replace(/^\[Sản phẩm\]\s*/i, '')}</span>
              <button
                type="button"
                onClick={() => onToggleProductPhotoRole(prod)}
                className="font-bold text-purple-700 hover:text-red-600"
                title="Bỏ đính kèm sản phẩm này"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* 1 Clean Unified Composer Box (Claude / ChatGPT style) */}
      <form
        onSubmit={onSendFormSubmit}
        className="rounded-2xl border border-slate-300/90 bg-slate-50/70 focus-within:border-[#7846FF] focus-within:bg-white focus-within:ring-2 focus-within:ring-purple-500/15 transition"
      >
        <label htmlFor="ai-chat-prompt-input" className="sr-only">
          Nhập lệnh hoặc câu hỏi cho trợ lý thiết kế AI
        </label>
        <textarea
          id="ai-chat-prompt-input"
          rows={2}
          data-testid="ai-chat-prompt-input"
          value={chatPrompt}
          onChange={(e) => onPromptChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              void onExecuteChatSubmit(chatPrompt);
            }
          }}
          placeholder={
            hasPendingPreview
              ? 'Gõ thêm yêu cầu để chỉnh Prompt phía trên ($0), hoặc bấm Duyệt...'
              : 'Mô tả ý tưởng thiết kế tự nhiên... (Enter để chuẩn hóa Prompt $0)'
          }
          className="w-full resize-none bg-transparent px-3 pt-2.5 pb-1 text-[13px] text-slate-900 placeholder-slate-500 focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-2.5 pb-2">
          <button
            type="button"
            disabled={submitting || preparingPreview}
            onClick={() => {
              const pointsNote =
                touchPoints.length > 0
                  ? ` tại ${touchPoints.length} điểm chạm (${touchPoints.map((p) => p.label).join(' → ')}) đã chấm trên ảnh`
                  : '';
              const prodNote =
                activeProductPhotos.length > 0
                  ? ` kết hợp với ảnh sản phẩm "${activeProductPhotos[0]?.name}"`
                  : '';
              onExecuteChatSubmit(
                `Phân tích bức ảnh hiện tại${pointsNote}${prodNote} và gợi ý phương án phối cảnh / thiết kế đẹp nhất giúp mình`
              );
            }}
            className="rounded-lg px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-45 transition"
            title="Hỏi AI phân tích kỹ thuật miễn phí ($0)"
          >
            Tư vấn ($0)
          </button>

          <button
            type="submit"
            data-testid="ai-chat-submit-btn"
            disabled={!chatPrompt.trim() || submitting || preparingPreview || Boolean(piiAlert)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-extrabold text-white shadow-xs transition disabled:opacity-45 ${
              promptApprovalEnabled && looksLikeImageIntent
                ? 'bg-gradient-to-r from-[#6D28D9] to-[#7846FF] hover:from-[#5B21B6] hover:to-[#6D28D9]'
                : 'bg-gradient-to-r from-[#0B1D48] to-[#1E3A8A] hover:from-[#1553A2] hover:to-[#2563EB]'
            }`}
          >
            {submitting || preparingPreview ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : promptApprovalEnabled && looksLikeImageIntent ? (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                <span>{hasPendingPreview ? 'Cập nhật Prompt ($0)' : 'Chuẩn hóa Prompt ($0)'}</span>
              </>
            ) : (
              <>
                <span>Gửi</span>
                <Send className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
});
