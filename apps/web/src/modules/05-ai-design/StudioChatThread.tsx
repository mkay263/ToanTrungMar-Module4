'use client';

import React, { useMemo, useState } from 'react';
import {
  Check,
  Cpu,
  Eye,
  GitBranch,
  Image as ImageIcon,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from 'lucide-react';
import type {
  DesignAssetVersionItemDto,
  DesignChatMessageDto,
  DesignPromptPreviewDto,
} from '@toantrung/contracts';

export interface StudioChatThreadProps {
  chatThreadRef: React.RefObject<HTMLDivElement>;
  chatMessages: DesignChatMessageDto[];
  versions: DesignAssetVersionItemDto[];
  currentVersion: DesignAssetVersionItemDto | null;
  versionImageUrl: string | null;
  sitePhotoUrl: string | null;
  selectedPhotoName: string | null;
  viewMode: 'original' | 'result' | 'live_3d' | 'compare' | 'bom';
  statelessBranchingEnabled: boolean;
  skippedVersionNumbers: number[];
  aspectRatio: string;
  bannerWidthPx: number;
  bannerHeightPx: number;
  consultantModelName: string;
  submitting: boolean;
  preparingPreview: boolean;
  pendingUserPrompt: string | null;
  pendingPromptPreview: DesignPromptPreviewDto | null;
  editableRefinedPrompt: string;
  onChangeEditableRefinedPrompt: (val: string) => void;
  previewQuality: 'draft' | 'high_quality';
  onChangePreviewQuality: (q: 'draft' | 'high_quality') => void;
  onCancelPromptPreview: () => void;
  onApproveAndRender: () => void;
  onPromptChange: (val: string) => void;
  onExecuteChatSubmit: (rawText: string, forceImageMode?: boolean) => void;
  onSelectVersion: (ver: DesignAssetVersionItemDto) => void;
  onSaveFinishedVersion: (ver: DesignAssetVersionItemDto) => void;
}

const POSTER_CMD_RE =
  /^\s*@(?:banner|baneer|tạobanner|poster|taoanhposter|taoposter|tao_anh_poster|taobanner|taoanhbanner)\s*:?\s*/i;
const TAO_ANH_CMD_RE = /^\s*@(?:taoanh|tạoảnh|tao_anh|tao-anh|taojanh|draw|render)\s*:?\s*/i;

function stripRawCommandPrefix(text: string): {
  tag: 'banner' | 'perspective' | null;
  cleanText: string;
} {
  if (POSTER_CMD_RE.test(text)) {
    return { tag: 'banner', cleanText: text.replace(POSTER_CMD_RE, '').trim() };
  }
  if (TAO_ANH_CMD_RE.test(text)) {
    return { tag: 'perspective', cleanText: text.replace(TAO_ANH_CMD_RE, '').trim() };
  }
  return { tag: null, cleanText: text.trim() };
}

/**
 * Walks parentVersionId / sourceVersionId from activeVer back to root so we know
 * the exact version lineage belonging to the currently selected branch (e.g., R4 ← R2 ← R1, skipping R3).
 */
function computeActiveLineageVersionNumbers(
  versions: DesignAssetVersionItemDto[],
  activeVer: DesignAssetVersionItemDto | null
): Set<number> {
  const result = new Set<number>();
  if (!activeVer) return result;
  const byId = new Map<number, DesignAssetVersionItemDto>();
  for (const v of versions) byId.set(v.id, v);

  let cursor: DesignAssetVersionItemDto | undefined = activeVer;
  const visited = new Set<number>();
  while (cursor && !visited.has(cursor.id)) {
    visited.add(cursor.id);
    result.add(cursor.versionNumber);
    const parentId: number | null = cursor.sourceVersionId ?? cursor.parentVersionId ?? null;
    cursor = parentId ? byId.get(parentId) : undefined;
  }
  return result;
}

export const StudioChatThread = React.memo(function StudioChatThread({
  chatThreadRef,
  chatMessages,
  versions,
  currentVersion,
  versionImageUrl,
  sitePhotoUrl,
  selectedPhotoName,
  viewMode,
  statelessBranchingEnabled,
  skippedVersionNumbers,
  aspectRatio,
  bannerWidthPx,
  bannerHeightPx,
  consultantModelName,
  submitting,
  preparingPreview,
  pendingUserPrompt,
  pendingPromptPreview,
  editableRefinedPrompt,
  onChangeEditableRefinedPrompt,
  previewQuality,
  onChangePreviewQuality,
  onCancelPromptPreview,
  onApproveAndRender,
  onPromptChange,
  onExecuteChatSubmit,
  onSelectVersion,
  onSaveFinishedVersion,
}: StudioChatThreadProps) {
  const [historyFilterMode, setHistoryFilterMode] = useState<'active_branch' | 'all'>(
    'active_branch'
  );

  const visibleRawMessages = useMemo(
    () =>
      chatMessages.filter(
        (msg) =>
          !msg.text?.includes('Giữ nguyên ảnh gốc của bạn') &&
          !msg.text?.includes('API Key Gmail')
      ),
    [chatMessages]
  );

  const activeLineageSet = useMemo(
    () =>
      viewMode === 'result' && currentVersion
        ? computeActiveLineageVersionNumbers(versions, currentVersion)
        : null,
    [versions, currentVersion, viewMode]
  );

  // Pair abandoned sibling-branch messages (e.g. R3 + its user prompt) so active_branch hides them cleanly
  const { displayedMessages, hiddenBranchCount, hiddenVersionNumbers } = useMemo(() => {
    if (
      historyFilterMode === 'all' ||
      !activeLineageSet ||
      activeLineageSet.size === 0 ||
      versions.length <= 1
    ) {
      return {
        displayedMessages: visibleRawMessages,
        hiddenBranchCount: 0,
        hiddenVersionNumbers: [] as number[],
      };
    }

    const hiddenIndices = new Set<number>();
    const hiddenVers = new Set<number>();

    for (let i = 0; i < visibleRawMessages.length; i++) {
      const m = visibleRawMessages[i];
      const isAssistantImg =
        m.role === 'assistant' &&
        (m.chatMode === 'image_generator' || Boolean(m.versionNumber));
      if (!isAssistantImg) continue;

      const matched = versions.find(
        (v) => v.id === m.versionId || v.versionNumber === m.versionNumber
      );
      const verNum = matched?.versionNumber ?? m.versionNumber ?? null;
      if (verNum !== null && !activeLineageSet.has(verNum)) {
        hiddenIndices.add(i);
        hiddenVers.add(verNum);
        if (i > 0 && visibleRawMessages[i - 1].role === 'user') {
          hiddenIndices.add(i - 1);
        }
      }
    }

    return {
      displayedMessages: visibleRawMessages.filter((_, idx) => !hiddenIndices.has(idx)),
      hiddenBranchCount: hiddenIndices.size,
      hiddenVersionNumbers: [...hiddenVers].sort((a, b) => a - b),
    };
  }, [visibleRawMessages, historyFilterMode, activeLineageSet, versions]);

  const previewThumbUrl =
    pendingPromptPreview?.sourceVersionId
      ? `/api/v1/design/asset/${pendingPromptPreview.sourceVersionId}`
      : sitePhotoUrl;

  const isEmptyThread =
    displayedMessages.length === 0 &&
    !pendingUserPrompt &&
    !pendingPromptPreview &&
    !preparingPreview;

  return (
    <div
      ref={chatThreadRef}
      className="flex-1 min-h-0 space-y-3 overflow-y-auto px-3.5 py-3 text-[13px] bg-slate-50/50"
    >
      {/* Branch Scope Filter Pill Bar (Phương án 2 visible inside thread) */}
      {versions.length > 0 && (visibleRawMessages.length > 0 || skippedVersionNumbers.length > 0) && (
        <div className="sticky top-0 z-10 -mx-1 flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white/95 px-2.5 py-1.5 text-[11px] shadow-2xs backdrop-blur-sm">
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 font-bold">
            <button
              type="button"
              onClick={() => setHistoryFilterMode('active_branch')}
              className={`rounded-md px-2 py-0.5 transition ${
                historyFilterMode === 'active_branch'
                  ? 'bg-white text-indigo-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🌿 {currentVersion && viewMode === 'result' ? `Nhánh R${currentVersion.versionNumber}` : 'Nhánh hiện tại'}
            </button>
            <button
              type="button"
              onClick={() => setHistoryFilterMode('all')}
              className={`rounded-md px-2 py-0.5 transition ${
                historyFilterMode === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Toàn bộ ({visibleRawMessages.length})
            </button>
          </div>

          {hiddenBranchCount > 0 && (
            <button
              type="button"
              onClick={() => setHistoryFilterMode('all')}
              className="truncate text-[10.5px] font-semibold text-emerald-700 hover:underline"
              title="Bấm để xem cả các tin thuộc nhánh đã bỏ qua"
            >
              Đã ẩn {hiddenVersionNumbers.map((n) => `R${n}`).join(', ')}
            </button>
          )}
        </div>
      )}

      {/* Quick Starters when empty */}
      {isEmptyThread && (
        <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs">
          <div className="text-xs font-extrabold text-slate-900">
            Bắt đầu nhanh · Luồng 2 bước tiết kiệm token
          </div>
          <p className="mt-1 text-[11.5px] text-slate-600 leading-relaxed">
            Nhập ý tưởng tự nhiên — AI sẽ chuẩn hóa câu lệnh ở Bước 1 ($0) để bạn duyệt trước khi gọi API tạo ảnh:
          </p>
          <div className="mt-2.5 grid grid-cols-1 gap-1.5">
            {[
              {
                title: 'Ghép LED / sản phẩm vào ảnh hiện trường',
                desc: 'Giữ nguyên kiến trúc phòng, cân đối ánh sáng tự nhiên',
                prompt:
                  'Ghép màn hình LED Toàn Trung vào đúng vị trí đã chấm điểm trên ảnh hiện trường, giữ nguyên toàn bộ kiến trúc xung quanh và cân đối ánh sáng chân thực',
              },
              {
                title: 'Thiết kế Banner quảng cáo nổi bật',
                desc: `Tỷ lệ ${aspectRatio} · Chuẩn ${bannerWidthPx}×${bannerHeightPx}px`,
                prompt: `Tạo banner quảng cáo chuyên nghiệp tỷ lệ ${aspectRatio} cho dòng sản phẩm màn hình LED Toàn Trung, bố cục mạnh mẽ hiện đại`,
              },
              {
                title: 'Phân tích ảnh & Tư vấn kỹ thuật ($0)',
                desc: 'Gợi ý kích thước, góc nhìn & chủng loại module phù hợp',
                prompt:
                  'Phân tích ảnh hiện trường hiện tại và gợi ý phương án lắp đặt màn hình LED tối ưu nhất giúp mình',
              },
            ].map((card) => (
              <button
                key={card.title}
                type="button"
                onClick={() => onPromptChange(card.prompt)}
                className="group text-left rounded-xl border border-slate-200/90 bg-slate-50/70 hover:bg-indigo-50/60 hover:border-indigo-300 px-3 py-2 transition"
              >
                <div className="text-[11.5px] font-bold text-slate-800 group-hover:text-[#0B1D48]">
                  {card.title}
                </div>
                <div className="text-[10.5px] text-slate-500 mt-0.5">{card.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Clean Message Bubbles */}
      {displayedMessages.map((msg) => {
        const isUser = msg.role === 'user';
        const isImageReply =
          !isUser && (msg.chatMode === 'image_generator' || Boolean(msg.versionNumber));

        if (isUser) {
          const { tag, cleanText } = stripRawCommandPrefix(msg.text);
          return (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[90%] rounded-2xl rounded-tr-xs border border-indigo-200/80 bg-[#EEF2FF] px-3.5 py-2 text-[12.5px] leading-relaxed text-[#17253F] shadow-2xs">
                {tag && (
                  <div className="mb-1">
                    <span
                      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide ${
                        tag === 'banner'
                          ? 'bg-pink-100 text-pink-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {tag === 'banner' ? 'Banner / Poster' : 'Phối cảnh LED'}
                    </span>
                  </div>
                )}
                <span>{cleanText || msg.text}</span>
              </div>
            </div>
          );
        }

        if (isImageReply) {
          const matchedVer =
            versions.find(
              (v) => v.id === msg.versionId || v.versionNumber === msg.versionNumber
            ) || currentVersion;
          const thumbUrl = matchedVer
            ? `/api/v1/design/asset/${matchedVer.id}`
            : versionImageUrl || '';
          const parentId = matchedVer?.sourceVersionId ?? matchedVer?.parentVersionId ?? null;
          const parentVer = parentId ? versions.find((v) => v.id === parentId) : null;
          const isCurrent = Boolean(matchedVer && currentVersion?.id === matchedVer.id && viewMode === 'result');

          return (
            <div
              key={msg.id}
              className={`rounded-2xl border bg-white p-2.5 shadow-2xs transition ${
                isCurrent ? 'border-indigo-300 ring-1 ring-indigo-500/15' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className="relative h-[60px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-slate-900 border border-slate-200">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`Kết quả R${matchedVer?.versionNumber || msg.versionNumber || 1}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-slate-400">
                      <ImageIcon className="h-4 w-4" />
                    </div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-slate-900/85 px-1.5 py-0.5 text-[9.5px] font-extrabold text-white">
                    R{matchedVer?.versionNumber || msg.versionNumber || 1}
                  </span>
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs font-extrabold text-slate-900">
                      Đã xuất ảnh R{matchedVer?.versionNumber || msg.versionNumber || 1}
                    </span>
                    {parentVer && (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200/80">
                        ↳ từ R{parentVer.versionNumber}
                      </span>
                    )}
                    {matchedVer?.isApprovedFinal && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                        ✓ Đã chốt
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {matchedVer && (
                      <button
                        type="button"
                        onClick={() => onSelectVersion(matchedVer)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold transition ${
                          isCurrent
                            ? 'bg-indigo-600 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700'
                        }`}
                      >
                        <Eye className="h-3 w-3" />
                        <span>{isCurrent ? 'Đang làm gốc' : `Sửa từ R${matchedVer.versionNumber}`}</span>
                      </button>
                    )}
                    {matchedVer && !matchedVer.isApprovedFinal && (
                      <button
                        type="button"
                        onClick={() => onSaveFinishedVersion(matchedVer)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10.5px] font-bold text-emerald-700 hover:bg-emerald-100 transition"
                      >
                        <Check className="h-3 w-3" />
                        <span>Chốt bản này</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Conversational AI Reply ($0)
        const suggestedCmd = msg.suggestedTaoAnhPrompt?.trim() || '';
        const { cleanText: cleanSuggested, tag: suggestedTag } = stripRawCommandPrefix(suggestedCmd);

        return (
          <div key={msg.id} className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#0BAF7C] text-white">
                <Cpu className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-bold text-slate-600">
                {msg.modelUsed || 'Google Gemini 2.5 Flash'} · Tư vấn ($0)
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3 text-[12.5px] leading-relaxed text-[#17253F] space-y-2 shadow-2xs">
              <div className="space-y-1.5 whitespace-pre-line">{msg.text}</div>

              {suggestedCmd && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-2.5 space-y-2">
                  <div className="text-[11px] font-bold text-indigo-900">
                    Gợi ý Prompt {suggestedTag === 'banner' ? 'Banner' : 'Phối cảnh'}:
                  </div>
                  <div className="text-xs text-slate-800">{cleanSuggested}</div>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => onExecuteChatSubmit(suggestedCmd, true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#6D28D9] px-3 py-1.5 text-xs font-extrabold text-white shadow-xs transition hover:bg-[#5B21B6] disabled:opacity-50"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Đưa vào Bước 2 Duyệt Prompt ($0)</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Visual Stateless Branch Divider (Phương án 2) */}
      {viewMode === 'result' && currentVersion && statelessBranchingEnabled && (
        <div className="flex items-center gap-2 py-1 text-[10.5px] font-bold text-emerald-700">
          <div className="h-px flex-1 bg-emerald-200" />
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5">
            <GitBranch className="h-3 w-3 shrink-0" />
            <span>
              {skippedVersionNumbers.length > 0
                ? `Rẽ nhánh sạch từ R${currentVersion.versionNumber} (Bỏ qua ${skippedVersionNumbers.map((n) => `R${n}`).join(', ')})`
                : `Lệnh mới chỉ gửi Ảnh R${currentVersion.versionNumber} + Lệnh mới`}
            </span>
          </span>
          <div className="h-px flex-1 bg-emerald-200" />
        </div>
      )}

      {/* Preparing Step-1 Language Preview Indicator */}
      {preparingPreview && (
        <div className="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs font-bold text-indigo-900">
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-600" />
          <span>AI đang chuẩn hóa câu lệnh ngôn ngữ ($0 phí tạo ảnh)...</span>
        </div>
      )}

      {/* Interactive Step-2 Prompt Proposal Card INSIDE Thread (Phương án 1) */}
      {pendingPromptPreview && (
        <div className="space-y-2">
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-2xl rounded-tr-xs border border-indigo-200 bg-[#EEF2FF] px-3.5 py-2 text-[12.5px] leading-relaxed text-[#17253F]">
              {stripRawCommandPrefix(pendingPromptPreview.rawInstruction).cleanText}
            </div>
          </div>

          <div
            data-testid="prompt-approval-card"
            className="rounded-2xl border-2 border-indigo-300 bg-white p-3.5 shadow-md space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-indigo-950">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Đề xuất Prompt · Bước 2</span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                  pendingPromptPreview.cloudRendersUsedInProject >=
                  pendingPromptPreview.projectSoftQuotaLimit
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                Cloud: {pendingPromptPreview.cloudRendersUsedInProject}/
                {pendingPromptPreview.projectSoftQuotaLimit} lượt
              </span>
            </div>

            {/* Source Thumbnail + Savings Summary */}
            <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/90 bg-slate-50/80 p-2">
              <div className="h-[34px] w-[46px] shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-900 flex items-center justify-center">
                {previewThumbUrl ? (
                  <img
                    src={previewThumbUrl}
                    alt={pendingPromptPreview.sourceLabel}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon className="h-3.5 w-3.5 text-slate-400" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex flex-wrap items-center gap-1 text-[10.5px]">
                  <span className="font-bold text-indigo-900">
                    Nguồn: {pendingPromptPreview.sourceLabel}
                  </span>
                  <span className="rounded bg-white px-1.5 py-0.2 font-semibold text-slate-600 border border-slate-200">
                    {pendingPromptPreview.refinerSource === 'gemini_text'
                      ? `Ngôn ngữ ~${pendingPromptPreview.estimatedTextTokens} tok`
                      : 'Local $0'}
                  </span>
                </div>
                <div className="truncate text-[10.5px] text-slate-600" title={pendingPromptPreview.designSpecsSummary}>
                  {pendingPromptPreview.designSpecsSummary}
                </div>
                {pendingPromptPreview.statelessBranching &&
                  (pendingPromptPreview.omittedHistoryMessagesCount > 0 ||
                    pendingPromptPreview.omittedSiblingVersionsCount > 0) && (
                    <div className="text-[10.5px] font-bold text-emerald-700">
                      🌿 Cắt {pendingPromptPreview.omittedHistoryMessagesCount} chat cũ
                      {pendingPromptPreview.omittedSiblingVersionsCount > 0
                        ? ` & bỏ qua ${pendingPromptPreview.omittedSiblingVersionsCount} nhánh sau`
                        : ''}{' '}
                      (tiết kiệm ~65% token)
                    </div>
                  )}
              </div>
            </div>

            {pendingPromptPreview.quotaWarning && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                ⚠️ {pendingPromptPreview.quotaWarning}
              </div>
            )}

            <div>
              <label
                htmlFor="prompt-approval-textarea"
                className="mb-1 block text-[11px] font-bold text-slate-700"
              >
                Prompt đã chuẩn hóa (sửa trực tiếp hoặc gõ thêm ở ô dưới để tinh chỉnh $0):
              </label>
              <textarea
                id="prompt-approval-textarea"
                rows={4}
                data-testid="prompt-approval-textarea"
                value={editableRefinedPrompt}
                onChange={(e) => onChangeEditableRefinedPrompt(e.target.value)}
                className="w-full resize-y rounded-xl border border-indigo-200 bg-slate-50/40 p-2.5 text-[12px] leading-relaxed text-slate-900 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => onChangePreviewQuality('draft')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
                    previewQuality === 'draft'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Zap className="h-3 w-3" />
                  <span>Nháp 1K (~$0.02)</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangePreviewQuality('high_quality')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 transition ${
                    previewQuality === 'high_quality'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:bg-white'
                  }`}
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Final (~$0.10)</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onCancelPromptPreview}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-100 transition"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  data-testid="approve-and-render-btn"
                  disabled={!editableRefinedPrompt.trim() || submitting}
                  onClick={onApproveAndRender}
                  className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1.5 text-[11px] font-extrabold text-white shadow-sm hover:from-emerald-700 hover:to-teal-700 transition disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Duyệt &amp; Gọi API tạo ảnh</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Optimistic Rendering Indicator */}
      {pendingUserPrompt && (
        <>
          <div className="flex justify-end">
            <div className="max-w-[90%] rounded-2xl rounded-tr-xs border border-indigo-200 bg-[#EEF2FF] px-3.5 py-2 text-[12.5px] leading-relaxed text-[#17253F]">
              <span>{stripRawCommandPrefix(pendingUserPrompt).cleanText}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-xs font-bold text-emerald-900">
            <RefreshCw className="h-3.5 w-3.5 animate-spin text-[#0BAF7C]" />
            <span>AI ({consultantModelName}) đang kết xuất ảnh từ API (~35–45s)...</span>
          </div>
        </>
      )}
    </div>
  );
});
