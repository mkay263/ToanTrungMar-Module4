'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Save,
  Sliders,
} from 'lucide-react';
import {
  DESIGN_TASK_CODES,
  DESIGN_TASK_LABELS,
  TARGET_WEBSITES,
  type AiModelRegistrySnapshotDto,
  type AiProviderId,
  type DesignBriefDto,
  type DesignTaskCode,
} from '@toantrung/contracts';

interface MarketingBriefPanelProps {
  activeTaskCode: DesignTaskCode;
  onChangeTaskCode: (task: DesignTaskCode) => void;
  brief: DesignBriefDto;
  onChangeBrief: (next: DesignBriefDto) => void;
  onSaveBrief?: () => Promise<void> | void;
  savingBrief?: boolean;
  applyLayoutOverlay: boolean;
  onChangeApplyLayoutOverlay: (next: boolean) => void;
  modelRegistry?: AiModelRegistrySnapshotDto;
  selectedProviderId: AiProviderId;
  selectedModelId: string;
  onSelectProviderAndModel: (providerId: AiProviderId, modelId: string) => void;
  onOpenRegistryModal: () => void;
  onComposePromptFromBrief?: (promptText: string) => void;
}

const SIZE_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: 'Vuông 1:1 (1024×1024)', w: 1024, h: 1024 },
  { label: 'Landscape 16:9 (1536×1024)', w: 1536, h: 1024 },
  { label: 'Poster 9:16 (1024×1536)', w: 1024, h: 1536 },
  { label: 'Full HD 16:9 (1920×1080)', w: 1920, h: 1080 },
];

export function MarketingBriefPanel({
  activeTaskCode,
  onChangeTaskCode,
  brief,
  onChangeBrief,
  onSaveBrief,
  savingBrief,
  applyLayoutOverlay,
  onChangeApplyLayoutOverlay,
  modelRegistry,
  selectedProviderId,
  selectedModelId,
  onSelectProviderAndModel,
  onOpenRegistryModal,
  onComposePromptFromBrief,
}: MarketingBriefPanelProps) {
  const [expandedBrief, setExpandedBrief] = useState<boolean>(false);
  const fieldPrefixId = useId();

  const recommendedForTask = modelRegistry?.defaultModelByTask?.[activeTaskCode];

  const candidateModelsForTask = useMemo(() => {
    const models = modelRegistry?.models || [];
    return models.filter((m) => {
      const st = m.taskStatuses?.[activeTaskCode] || 'listed_unverified';
      return st !== 'unsupported' || m.modelId === selectedModelId;
    });
  }, [modelRegistry, activeTaskCode, selectedModelId]);

  const outW = brief.outputWidthPx ?? 1536;
  const outH = brief.outputHeightPx ?? 1024;
  const aspectMismatchWarning = useMemo(() => {
    const targetRatio = outW / Math.max(1, outH);
    const nativeSqDiff = Math.abs(targetRatio - 1);
    if (activeTaskCode !== 'brief_analyze' && nativeSqDiff > 0.25 && outW !== 1536) {
      return `Tỷ lệ ${outW}×${outH}px sẽ được center-crop tự động nếu model gốc trả 1:1 (${Math.round(targetRatio * 100) / 100}:1).`;
    }
    return null;
  }, [outW, outH, activeTaskCode]);

  const handleBuildPromptFromBrief = () => {
    const parts = [
      `[${DESIGN_TASK_LABELS[activeTaskCode].title}]`,
      brief.objective ? `Mục tiêu: ${brief.objective}.` : '',
      brief.websiteDomain ? `Thương hiệu/Website: ${brief.websiteDomain}.` : '',
      brief.campaignName ? `Chiến dịch: ${brief.campaignName}.` : '',
      brief.targetChannel ? `Kênh: ${brief.targetChannel}.` : '',
      `Kích thước ${outW}×${outH}px.`,
      brief.headlineText ? `Tiêu đề chính gợi ý: "${brief.headlineText}".` : '',
      brief.ctaText ? `CTA: "${brief.ctaText}".` : '',
      brief.keepElementsNote ? `Cần giữ nguyên: ${brief.keepElementsNote}.` : '',
      brief.changeElementsNote ? `Cần thay đổi/nhấn mạnh: ${brief.changeElementsNote}.` : '',
    ].filter(Boolean);
    onComposePromptFromBrief?.(parts.join(' '));
  };

  return (
    <div className="rounded-2xl border border-[#D8E2F0] bg-white p-3 shadow-2xs space-y-2.5 text-xs">
      {/* Header + Model Registry Trigger */}
      <div className="flex items-center justify-between gap-2">
        <div className="font-extrabold uppercase tracking-wide text-[#17253F] flex items-center gap-1.5">
          <Sliders className="w-3.5 h-3.5 text-[#1E3A8A]" />
          <span>Tác vụ &amp; Brief Thiết kế</span>
        </div>
        <button
          type="button"
          onClick={onOpenRegistryModal}
          className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-semibold text-[#1E3A8A] inline-flex items-center gap-1"
          title="Xem Provider / Model & kiểm chứng năng lực thực tế"
        >
          <Cpu className="w-3 h-3" />
          <span>Model Registry</span>
        </button>
      </div>

      {/* 4 Explicit Tasks (MK04) */}
      <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Chọn 1 trong 4 tác vụ Studio">
        {DESIGN_TASK_CODES.map((code) => {
          const meta = DESIGN_TASK_LABELS[code];
          const active = activeTaskCode === code;
          return (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChangeTaskCode(code)}
              className={`text-left rounded-xl border px-2.5 py-2 transition ${
                active
                  ? 'border-[#1E3A8A] bg-blue-50/90 text-[#0F172A] shadow-2xs ring-1 ring-[#1E3A8A]/20'
                  : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
              }`}
              title={meta.subtitle}
            >
              <div className="text-[11px] font-bold leading-tight">{meta.title}</div>
            </button>
          );
        })}
      </div>
      <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-2.5 py-1.5 text-[11px] text-slate-700">
        {DESIGN_TASK_LABELS[activeTaskCode]?.subtitle}
      </div>

      {/* Active Task Model Override (Filtered & Verified Status) */}
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <label htmlFor={`${fieldPrefixId}-model-select`} className="font-semibold text-slate-600">
            Model cho tác vụ này:
          </label>
          {recommendedForTask && (
            <button
              type="button"
              onClick={() =>
                onSelectProviderAndModel(recommendedForTask.providerId, recommendedForTask.modelId)
              }
              className="text-[#1E3A8A] font-semibold hover:underline"
            >
              Mặc định: {recommendedForTask.modelId}
            </button>
          )}
        </div>
        <select
          id={`${fieldPrefixId}-model-select`}
          value={`${selectedProviderId}::${selectedModelId}`}
          onChange={(e) => {
            const [pid, mid] = e.target.value.split('::');
            if (pid && mid) onSelectProviderAndModel(pid as AiProviderId, mid);
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[11px] font-medium text-slate-800"
        >
          {candidateModelsForTask.length === 0 ? (
            <option value={`${selectedProviderId}::${selectedModelId}`}>
              {selectedProviderId} · {selectedModelId}
            </option>
          ) : (
            candidateModelsForTask.map((m) => {
              const st = m.taskStatuses?.[activeTaskCode] || 'listed_unverified';
              const blocked =
                st === 'unsupported' ||
                st === 'deprecated' ||
                st === 'blocked_permission' ||
                st === 'blocked_quota_billing';
              const tag =
                st === 'verified'
                  ? '✓ Đã xác minh'
                  : st === 'listed_unverified'
                    ? 'Chưa probe'
                    : st === 'blocked_quota_billing'
                      ? 'Hết quota'
                      : st === 'deprecated'
                        ? 'Ngừng hỗ trợ'
                        : st === 'unsupported'
                          ? 'Không hỗ trợ'
                          : st;
              return (
                <option
                  key={`${m.providerId}::${m.modelId}`}
                  value={`${m.providerId}::${m.modelId}`}
                  disabled={blocked}
                >
                  {m.modelId} ({m.providerId} · {tag})
                </option>
              );
            })
          )}
        </select>

        {(activeTaskCode === 'banner_generate' || activeTaskCode === 'design_edit') && (
          <label className="flex items-center gap-2 text-[11px] font-medium text-slate-700 cursor-pointer pt-0.5">
            <input
              type="checkbox"
              checked={applyLayoutOverlay}
              onChange={(e) => onChangeApplyLayoutOverlay(e.target.checked)}
              className="rounded border-slate-300 text-[#1E3A8A]"
            />
            <span>Phủ khung thương hiệu (AI + Layout · {brief.websiteDomain || 'toantrung.com.vn'})</span>
          </label>
        )}
      </div>

      {/* Collapsible Structured Brief Details */}
      <div>
        <button
          type="button"
          onClick={() => setExpandedBrief((p) => !p)}
          className="w-full flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-800 border border-slate-200"
        >
          <span className="inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-[#1E3A8A]" />
            <span>
              Brief chiến dịch &amp; thông số ({outW}×{outH}px)
            </span>
          </span>
          {expandedBrief ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {expandedBrief && (
          <div className="mt-2 space-y-2 pt-1">
            <div>
              <label htmlFor={`${fieldPrefixId}-objective`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Mục tiêu
              </label>
              <textarea
                id={`${fieldPrefixId}-objective`}
                rows={2}
                value={brief.objective || ''}
                onChange={(e) => onChangeBrief({ ...brief, objective: e.target.value })}
                placeholder="VD: Banner tăng tỷ lệ gửi form P2.5 indoor trên bangled.vn"
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label htmlFor={`${fieldPrefixId}-website`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Website
                </label>
                <select
                  id={`${fieldPrefixId}-website`}
                  value={brief.websiteDomain || ''}
                  onChange={(e) => {
                    const dom = e.target.value;
                    onChangeBrief({
                      ...brief,
                      websiteDomain: dom || null,
                      websiteId: dom || null,
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px] bg-white"
                >
                  <option value="">-- Chung --</option>
                  {TARGET_WEBSITES.map((domain) => (
                    <option key={domain} value={domain}>
                      {domain}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`${fieldPrefixId}-channel`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Kênh
                </label>
                <input
                  id={`${fieldPrefixId}-channel`}
                  type="text"
                  value={brief.targetChannel || ''}
                  onChange={(e) => onChangeBrief({ ...brief, targetChannel: e.target.value })}
                  placeholder="Google Ads / Facebook"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                />
              </div>
            </div>

            <div>
              <label htmlFor={`${fieldPrefixId}-size`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                Kích thước mục tiêu
              </label>
              <select
                id={`${fieldPrefixId}-size`}
                value={`${outW}x${outH}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  if (w && h) {
                    onChangeBrief({ ...brief, outputWidthPx: w, outputHeightPx: h });
                  }
                }}
                className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px] bg-white"
              >
                {SIZE_PRESETS.map((p) => (
                  <option key={p.label} value={`${p.w}x${p.h}`}>
                    {p.label}
                  </option>
                ))}
              </select>
              {aspectMismatchWarning && (
                <div className="mt-1 rounded bg-amber-50 border border-amber-200 px-2 py-1 text-[10px] text-amber-800 flex items-start gap-1">
                  <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                  <span>{aspectMismatchWarning}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label htmlFor={`${fieldPrefixId}-headline`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Headline
                </label>
                <input
                  id={`${fieldPrefixId}-headline`}
                  type="text"
                  value={brief.headlineText || ''}
                  onChange={(e) => onChangeBrief({ ...brief, headlineText: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                />
              </div>
              <div>
                <label htmlFor={`${fieldPrefixId}-cta`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  CTA
                </label>
                <input
                  id={`${fieldPrefixId}-cta`}
                  type="text"
                  value={brief.ctaText || ''}
                  onChange={(e) => onChangeBrief({ ...brief, ctaText: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                />
              </div>
            </div>

            {activeTaskCode === 'design_edit' && (
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label htmlFor={`${fieldPrefixId}-keep`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Phần giữ nguyên
                  </label>
                  <input
                    id={`${fieldPrefixId}-keep`}
                    type="text"
                    value={brief.keepElementsNote || ''}
                    onChange={(e) => onChangeBrief({ ...brief, keepElementsNote: e.target.value })}
                    placeholder="Giữ nguyên bố cục, sản phẩm"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                  />
                </div>
                <div>
                  <label htmlFor={`${fieldPrefixId}-change`} className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                    Phần cần sửa
                  </label>
                  <input
                    id={`${fieldPrefixId}-change`}
                    type="text"
                    value={brief.changeElementsNote || ''}
                    onChange={(e) => onChangeBrief({ ...brief, changeElementsNote: e.target.value })}
                    placeholder="Đổi ánh sáng / thêm viền"
                    className="w-full rounded-lg border border-slate-300 px-2 py-1 text-[11px]"
                  />
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {onSaveBrief && (
                <button
                  type="button"
                  disabled={savingBrief}
                  onClick={() => void onSaveBrief()}
                  className="h-7 px-2.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-semibold text-slate-800 inline-flex items-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  <span>{savingBrief ? 'Đang lưu...' : 'Lưu Brief'}</span>
                </button>
              )}
              {onComposePromptFromBrief && (
                <button
                  type="button"
                  onClick={handleBuildPromptFromBrief}
                  className="h-7 px-2.5 rounded-lg bg-[#1E3A8A] hover:bg-[#0B1D48] text-[11px] font-semibold text-white"
                >
                  Đưa vào lệnh AI
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Baseline Snapshot Reference (MK05) */}
      {brief.baselineSnapshot && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-2 text-[11px] text-indigo-950 space-y-1">
          <div className="font-bold">Baseline lúc gửi brief ({brief.baselineSnapshot.sourceModule}):</div>
          <div className="text-indigo-800">{brief.baselineSnapshot.scopeLabel}</div>
          <Link
            href={`/reports?websiteId=${encodeURIComponent(brief.baselineSnapshot.websiteId || 'all')}${brief.baselineSnapshot.dateFrom && brief.baselineSnapshot.dateTo ? `&preset=CUSTOM&from=${encodeURIComponent(brief.baselineSnapshot.dateFrom)}&to=${encodeURIComponent(brief.baselineSnapshot.dateTo)}` : ''}`}
            className="inline-flex items-center gap-1 font-semibold text-[#1E3A8A] hover:underline"
          >
            <span>So sánh cùng phạm vi trên Báo cáo (trước/sau)</span>
            <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
