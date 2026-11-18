'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Globe,
  Mail,
  RefreshCw,
  Save,
  Search,
} from 'lucide-react';
import type { GoogleOAuthStatusDto } from '@toantrung/contracts';
import { apiRequest } from '@/core/http/client';
import { useSession } from '@/core/session/SessionContext';
import { RealtimeLiveMotionIndicator } from '@/components/common/RealtimeLiveMotionIndicator';

interface GmailSyncStatusResponse {
  enabled: boolean;
  query: string;
  maxMessages: number;
  pollIntervalSec: number;
  onlyLeadKeywords: boolean;
  connectedEmail?: string | null;
  lastRunAt?: string | null;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  lastCreatedCount?: number;
  lastMatchedCount?: number;
}

export function AdminSyncCenterPanel() {
  const { user } = useSession();
  const [gmailStatus, setGmailStatus] = useState<GmailSyncStatusResponse | null>(null);
  const [googleStatus, setGoogleStatus] = useState<GoogleOAuthStatusDto | null>(null);

  const [enabled, setEnabled] = useState(true);
  const [pollIntervalSec, setPollIntervalSec] = useState(30);
  const [onlyLeadKeywords, setOnlyLeadKeywords] = useState(true);
  const [query, setQuery] = useState('');

  const [busyMail, setBusyMail] = useState(false);
  const [busySaveMail, setBusySaveMail] = useState(false);
  const [busyGoogle, setBusyGoogle] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [mailRes, googleRes] = await Promise.all([
        apiRequest<GmailSyncStatusResponse>('/api/v1/leads/gmail-sync', { skipCache: true }),
        apiRequest<{ status: GoogleOAuthStatusDto }>('/api/v1/auth/google/status', {
          skipCache: true,
        }),
      ]);
      setGmailStatus(mailRes);
      setEnabled(Boolean(mailRes.enabled));
      setPollIntervalSec(Number(mailRes.pollIntervalSec || 30));
      setOnlyLeadKeywords(Boolean(mailRes.onlyLeadKeywords));
      setQuery(mailRes.query || '');
      setGoogleStatus(googleRes.status);
      setLastSyncedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải trạng thái đồng bộ.');
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleSaveMailConfig = async () => {
    setBusySaveMail(true);
    setNotice(null);
    setError(null);
    try {
      await apiRequest('/api/v1/leads/gmail-sync', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: {
          action: 'save_config',
          enabled,
          pollIntervalSec,
          onlyLeadKeywords,
          query,
        },
      });
      setNotice('Đã lưu cấu hình tự động đồng bộ Gmail Lead.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi lưu cấu hình Gmail.');
    } finally {
      setBusySaveMail(false);
    }
  };

  const handleSyncMailNow = async () => {
    setBusyMail(true);
    setNotice(null);
    setError(null);
    try {
      const res = await apiRequest<{ createdCount?: number; scannedCount?: number }>(
        '/api/v1/leads/gmail-sync',
        {
          method: 'POST',
          csrfToken: user?.csrfToken,
          body: { action: 'sync_now' },
        },
      );
      setNotice(
        `Đã quét ${res.scannedCount ?? 0} thư mới, tạo ${res.createdCount ?? 0} Lead từ Gmail.`,
      );
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đồng bộ Gmail.');
    } finally {
      setBusyMail(false);
    }
  };

  const handleSyncGoogleNow = async () => {
    setBusyGoogle(true);
    setNotice(null);
    setError(null);
    try {
      await apiRequest('/api/v1/auth/google/sync', {
        method: 'POST',
        csrfToken: user?.csrfToken,
        body: { slot: 'MANUAL_RETRY' },
      });
      setNotice('Đã đồng bộ dữ liệu GA4, Search Console và các chỉ số website mới nhất.');
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi đồng bộ dữ liệu Google.');
    } finally {
      setBusyGoogle(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs">
        <div className="text-xs text-slate-600">
          <strong className="text-slate-900">Trạng thái đồng bộ nền toàn hệ thống</strong> · Tự động quét Gmail &amp; làm mới GA4/SEO
        </div>
        <RealtimeLiveMotionIndicator
          isPolling={busyMail || busyGoogle}
          lastUpdated={lastSyncedAt}
          intervalSec={pollIntervalSec}
          onRefresh={() => void loadAll()}
          label="Realtime Live"
          subLabel={`Chu kỳ ${pollIntervalSec}s`}
          size="sm"
        />
      </div>
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs font-medium text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Card 1: Đồng bộ Mail tự động (Gmail -> Lead) */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 grid place-items-center shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Đồng bộ Mail Lead (Gmail)</h3>
                <p className="text-xs text-slate-500">
                  Tự động đọc form website gửi về Gmail và phân biệt website nguồn
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {enabled ? 'Đang chạy ngầm' : 'Đã tạm dừng'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
              <span className="font-medium text-slate-700">Bật tự động đồng bộ</span>
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </label>

            <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 cursor-pointer">
              <span className="font-medium text-slate-700">Chỉ lọc thư có từ khóa Lead</span>
              <input
                type="checkbox"
                checked={onlyLeadKeywords}
                onChange={(e) => setOnlyLeadKeywords(e.target.checked)}
                className="h-4 w-4 accent-blue-600"
              />
            </label>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Chu kỳ kiểm tra (giây)
              </label>
              <select
                value={pollIntervalSec}
                onChange={(e) => setPollIntervalSec(Number(e.target.value))}
                className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs bg-white"
              >
                <option value={15}>15 giây</option>
                <option value={30}>30 giây</option>
                <option value={60}>60 giây</option>
                <option value={120}>2 phút</option>
                <option value={300}>5 phút</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Bộ lọc tìm kiếm Gmail
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="VD: toantrungco+truongvanlong"
                className="w-full h-9 rounded-xl border border-slate-200 px-3 text-xs"
              />
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-600 space-y-1">
            <div>
              Tài khoản đang quét:{' '}
              <strong className="text-slate-900">
                {gmailStatus?.connectedEmail || googleStatus?.connectedEmail || 'Chưa kết nối'}
              </strong>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Kiểm tra gần nhất:{' '}
                {gmailStatus?.lastRunAt
                  ? new Date(gmailStatus.lastRunAt).toLocaleString('vi-VN')
                  : 'Chưa chạy'}
              </span>
              {gmailStatus?.lastError && (
                <span className="text-rose-600 font-medium">Lỗi: {gmailStatus.lastError}</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSaveMailConfig()}
              disabled={busySaveMail}
              className="h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{busySaveMail ? 'Đang lưu...' : 'Lưu cấu hình Mail'}</span>
            </button>
            <button
              type="button"
              onClick={() => void handleSyncMailNow()}
              disabled={busyMail}
              className="h-9 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyMail ? 'animate-spin' : ''}`} />
              <span>{busyMail ? 'Đang đồng bộ...' : 'Đồng bộ Mail ngay'}</span>
            </button>
          </div>
        </section>

        {/* Card 2: Đồng bộ GA4 · Search Console · Google Ads · Xu hướng */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-700 grid place-items-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Đồng bộ GA4 · Search Console · Google Ads
                </h3>
                <p className="text-xs text-slate-500">
                  Quản lý đồng bộ dữ liệu truy cập, từ khóa SEO, tình trạng trang và quảng cáo
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                googleStatus?.connected
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-amber-50 text-amber-700'
              }`}
            >
              {googleStatus?.connected ? 'Đã kết nối Google' : 'Chưa kết nối'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <BarChart3 className="w-3.5 h-3.5 text-blue-600" />
                <span>GA4 Properties</span>
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {(googleStatus?.accessibleResources || []).filter((r) => r.type === 'GA4_PROPERTY').length} website
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <Search className="w-3.5 h-3.5 text-emerald-600" />
                <span>Search Console</span>
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {(googleStatus?.accessibleResources || []).filter((r) => r.type === 'SEARCH_CONSOLE_SITE').length} tên miền
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <Globe className="w-3.5 h-3.5 text-amber-600" />
                <span>Google Ads</span>
              </div>
              <div className="mt-1 font-bold text-slate-900">
                {(googleStatus?.accessibleResources || []).filter((r) => r.type === 'GOOGLE_ADS_CUSTOMER').length} tài khoản
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-[11px] text-slate-600 space-y-1">
            <div>
              Tài khoản Google kết nối:{' '}
              <strong className="text-slate-900">
                {googleStatus?.connectedEmail || 'Chưa kết nối'}
              </strong>
            </div>
            <div>
              Tự động làm mới nền: <strong>Mỗi 4 phút</strong> cho toàn bộ website &amp; mốc ngày (Hôm nay, Hôm qua, 7 ngày, 30 ngày).
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSyncGoogleNow()}
              disabled={busyGoogle || !googleStatus?.connected}
              className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busyGoogle ? 'animate-spin' : ''}`} />
              <span>{busyGoogle ? 'Đang đồng bộ...' : 'Đồng bộ GA4 · SEO · Ads ngay'}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
