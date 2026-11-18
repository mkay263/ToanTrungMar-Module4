import type { ApiErrorPayload, ApiSuccess } from '@toantrung/contracts';

export class ApiClientError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public requestId?: string,
  ) {
    super(message);
  }
}

interface CacheEntry {
  data: unknown;
  timestamp: number;
}

const GET_CACHE_FRESH_TTL_MS = 30_000;
const GET_CACHE_STALE_TTL_MS = 120_000;

const apiGetCache = new Map<string, CacheEntry>();
const inflightGetRequests = new Map<string, Promise<unknown>>();
let currentCacheUserScope = 'anon';

function buildScopedCacheKey(path: string): string {
  return `${currentCacheUserScope}::${path}`;
}

/**
 * C02 & C13 — Gắn phạm vi cache theo phiên người dùng + vai trò hiện tại.
 * Khi đăng xuất, đổi tài khoản hoặc đổi quyền, toàn bộ cache nhạy cảm bị xóa tức thì.
 */
export function setApiCacheUserScope(userScopeKey: string | null): void {
  const normalized = userScopeKey?.trim() || 'anon';
  if (normalized !== currentCacheUserScope) {
    apiGetCache.clear();
    inflightGetRequests.clear();
    currentCacheUserScope = normalized;
  }
}

export function clearAllApiCache(): void {
  apiGetCache.clear();
  inflightGetRequests.clear();
}

export function peekApiCache<T>(path: string): T | null {
  const scopedKey = buildScopedCacheKey(path);
  const entry = apiGetCache.get(scopedKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > GET_CACHE_STALE_TTL_MS) {
    apiGetCache.delete(scopedKey);
    return null;
  }
  return entry.data as T;
}

export function invalidateApiCache(pathPrefix?: string): void {
  if (!pathPrefix) {
    apiGetCache.clear();
    inflightGetRequests.clear();
    return;
  }
  const scopedPrefix = buildScopedCacheKey(pathPrefix);
  for (const key of Array.from(apiGetCache.keys())) {
    if (key.startsWith(scopedPrefix)) {
      apiGetCache.delete(key);
    }
  }
}

async function performNetworkFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    csrfToken?: string;
    isFormData?: boolean;
    signal?: AbortSignal;
  },
): Promise<T> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {};

  if (!options.isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (options.csrfToken && method !== 'GET') {
    headers['x-csrf-token'] = options.csrfToken;
  }

  headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
  headers['Pragma'] = 'no-cache';

  const res = await fetch(path, {
    method,
    headers,
    cache: 'no-store',
    credentials: 'include',
    signal: options.signal,
    body: options.isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body)
        : undefined,
  });

  const payload = (await res.json().catch(() => null)) as
    | ApiSuccess<T>
    | ApiErrorPayload
    | null;

  if (!res.ok || !payload || 'error' in payload) {
    const errObj = payload && 'error' in payload ? payload.error : null;
    throw new ApiClientError(
      errObj?.code || 'HTTP_ERROR',
      errObj?.message || `Yêu cầu thất bại (Mã ${res.status}).`,
      res.status,
      errObj?.requestId,
    );
  }

  return payload.data;
}

export async function apiRequest<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: unknown;
    csrfToken?: string;
    isFormData?: boolean;
    signal?: AbortSignal;
    skipCache?: boolean;
  } = {},
): Promise<T> {
  const method = options.method || 'GET';

  if (method !== 'GET') {
    invalidateApiCache();
    const result = await performNetworkFetch<T>(path, options);
    invalidateApiCache();
    return result;
  }

  const scopedKey = buildScopedCacheKey(path);
  const scopeSnapshot = currentCacheUserScope;
  const now = Date.now();

  if (!options.skipCache) {
    const cached = apiGetCache.get(scopedKey);
    if (cached) {
      const age = now - cached.timestamp;
      if (age <= GET_CACHE_FRESH_TTL_MS) {
        return cached.data as T;
      }
      if (age <= GET_CACHE_STALE_TTL_MS) {
        if (!inflightGetRequests.has(scopedKey)) {
          const bgPromise = performNetworkFetch<T>(path, { method: 'GET' })
            .then((freshData) => {
              if (currentCacheUserScope === scopeSnapshot) {
                apiGetCache.set(scopedKey, { data: freshData, timestamp: Date.now() });
              }
              return freshData;
            })
            .catch(() => cached.data as T)
            .finally(() => {
              inflightGetRequests.delete(scopedKey);
            });
          inflightGetRequests.set(scopedKey, bgPromise);
        }
        return cached.data as T;
      }
    }
  }

  const existingInflight = inflightGetRequests.get(scopedKey);
  if (existingInflight && !options.signal && !options.skipCache) {
    return existingInflight as Promise<T>;
  }

  const requestPromise = performNetworkFetch<T>(path, options)
    .then((data) => {
      if (currentCacheUserScope === scopeSnapshot && path !== '/api/v1/auth/me') {
        apiGetCache.set(scopedKey, { data, timestamp: Date.now() });
      }
      return data;
    })
    .finally(() => {
      if (!options.signal) {
        inflightGetRequests.delete(scopedKey);
      }
    });

  if (!options.signal) {
    inflightGetRequests.set(scopedKey, requestPromise);
  }

  return requestPromise;
}
