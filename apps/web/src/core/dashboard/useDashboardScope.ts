'use client';

import { useCallback, useEffect, useState } from 'react';
import type { DashboardDatePreset } from '@toantrung/contracts';

const STORAGE_KEY = 'tt_dashboard_scope_v1';

export interface DashboardScopeState {
  websiteId: string;
  preset: DashboardDatePreset;
  from: string;
  to: string;
}

const DEFAULT_SCOPE: DashboardScopeState = {
  websiteId: 'all',
  preset: '7D',
  from: '',
  to: '',
};

function readInitialScope(): DashboardScopeState {
  if (typeof window === 'undefined') return DEFAULT_SCOPE;
  const params = new URLSearchParams(window.location.search);
  const urlWeb = params.get('websiteId');
  const urlPreset = params.get('preset')?.toUpperCase() as DashboardDatePreset | undefined;
  const urlFrom = params.get('from');
  const urlTo = params.get('to');

  let saved: Partial<DashboardScopeState> = {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) saved = JSON.parse(raw) as Partial<DashboardScopeState>;
  } catch {
    // ignore
  }

  return {
    websiteId: urlWeb || saved.websiteId || DEFAULT_SCOPE.websiteId,
    preset:
      urlPreset && ['TODAY', 'YESTERDAY', '7D', '30D', 'CUSTOM'].includes(urlPreset)
        ? urlPreset
        : saved.preset && ['TODAY', 'YESTERDAY', '7D', '30D', 'CUSTOM'].includes(saved.preset)
          ? saved.preset
          : '7D',
    from: urlFrom || saved.from || '',
    to: urlTo || saved.to || '',
  };
}

export function useDashboardScope() {
  const [scope, setScope] = useState<DashboardScopeState>(DEFAULT_SCOPE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setScope(readInitialScope());
    setHydrated(true);
  }, []);

  const updateScope = useCallback((patch: Partial<DashboardScopeState>) => {
    setScope((prev) => {
      const next: DashboardScopeState = { ...prev, ...patch };
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        const url = new URL(window.location.href);
        url.searchParams.set('websiteId', next.websiteId);
        url.searchParams.set('preset', next.preset);
        if (next.preset === 'CUSTOM' && next.from && next.to) {
          url.searchParams.set('from', next.from);
          url.searchParams.set('to', next.to);
        } else {
          url.searchParams.delete('from');
          url.searchParams.delete('to');
        }
        window.history.replaceState({}, '', url.toString());
      }
      return next;
    });
  }, []);

  return { scope, hydrated, updateScope };
}

