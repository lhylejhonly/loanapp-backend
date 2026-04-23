import axios, { AxiosError, AxiosHeaders, AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import {
  API_BASE_URL,
  getApiBaseUrlCandidates,
  getApiConnectionHelp,
  hasConfiguredApiBaseUrl,
} from './config';
import * as SessionStore from '../utils/sessionStore';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const SESSION_ACCESS_TOKEN_KEY = 'session_access_token';
const SESSION_REFRESH_TOKEN_KEY = 'session_refresh_token';
const SESSION_USER_ID_KEY = 'session_user_id';
const HEALTH_ENDPOINT = '/health/';
const DEFAULT_REQUEST_TIMEOUT_MS = 15000;
const AUTO_DETECTION_TIMEOUT_MS = 5000;

type ApiRequestOptions = Omit<AxiosRequestConfig, 'baseURL' | 'url' | 'data'> & {
  headers?: Record<string, string>;
  body?: unknown;
  data?: unknown;
  requireAuth?: boolean;
};

const api = axios.create({
  timeout: DEFAULT_REQUEST_TIMEOUT_MS,
  headers: {
    Accept: 'application/json',
  },
});

let preferredApiBaseUrl = API_BASE_URL;
let resolvedApiBaseUrl: string | null = hasConfiguredApiBaseUrl() ? API_BASE_URL : null;
let resolvingApiBaseUrl: Promise<string> | null = null;
let refreshingSessionPromise: Promise<string | null> | null = null;
let apiReachable = true;

type ConnectivityListener = (isOnline: boolean) => void;
type SessionExpiredListener = () => void;

const connectivityListeners = new Set<ConnectivityListener>();
const sessionExpiredListeners = new Set<SessionExpiredListener>();

const extractErrorMessage = (payload: unknown): string => {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return 'Request failed';
  }

  if ('detail' in payload && typeof payload.detail === 'string') {
    return payload.detail;
  }

  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && value.trim()) {
      return value;
    }

    if (Array.isArray(value)) {
      const firstString = value.find((entry) => typeof entry === 'string');
      if (typeof firstString === 'string' && firstString.trim()) {
        return firstString;
      }
    }
  }

  return 'Request failed';
};

const extractErrorCode = (payload: unknown): string | undefined => {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  if ('code' in payload && typeof payload.code === 'string' && payload.code.trim()) {
    return payload.code;
  }

  return undefined;
};

const isFormData = (value: unknown): value is FormData =>
  typeof FormData !== 'undefined' && value instanceof FormData;

const isNativeFormDataRequest = (payload: unknown) => Platform.OS !== 'web' && isFormData(payload);

const buildHeaders = async (
  options: ApiRequestOptions,
  payload: unknown
) => {
  const headers = AxiosHeaders.from(options.headers ?? {});
  const method = (options.method ?? 'GET').toUpperCase();

  if (options.requireAuth) {
    const token = await SessionStore.getItemAsync(SESSION_ACCESS_TOKEN_KEY);
    if (!token) {
      throw new ApiError('Not authenticated', 401);
    }

    headers.set('Authorization', `Bearer ${token}`);
  }

  if (payload !== undefined && payload !== null && !isFormData(payload) && method !== 'GET') {
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
  } else if (isFormData(payload)) {
    headers.delete('Content-Type');
  }

  return headers;
};

const headersToObject = (headers: AxiosHeaders) => {
  const normalizedHeaders = headers.toJSON();
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(normalizedHeaders)) {
    if (typeof value === 'string') {
      output[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      output[key] = value.join(', ');
    }
  }

  return output;
};

const dedupeBaseUrls = (baseUrls: string[]) => {
  const uniqueBaseUrls: string[] = [];

  for (const baseUrl of baseUrls) {
    if (!baseUrl || uniqueBaseUrls.includes(baseUrl)) {
      continue;
    }

    uniqueBaseUrls.push(baseUrl);
  }

  return uniqueBaseUrls;
};

const getCandidateBaseUrls = () =>
  dedupeBaseUrls([preferredApiBaseUrl, ...getApiBaseUrlCandidates()]);

const formatBaseUrlAttempts = (baseUrls: string[]) => {
  const attemptedBaseUrls = dedupeBaseUrls(baseUrls);

  if (attemptedBaseUrls.length === 0) {
    return '';
  }

  if (attemptedBaseUrls.length === 1) {
    return ` ${attemptedBaseUrls[0]}.`;
  }

  return ` Tried: ${attemptedBaseUrls.join(', ')}.`;
};

const isConnectionError = (error: unknown) => axios.isAxiosError(error) && !error.response;

const isRetryableConnectionError = (error: unknown) =>
  (error instanceof ApiError && error.status === 0) || isConnectionError(error);

const pingBaseUrl = async (baseUrl: string) => {
  try {
    await api.request({
      baseURL: baseUrl,
      url: HEALTH_ENDPOINT,
      method: 'GET',
      timeout: AUTO_DETECTION_TIMEOUT_MS,
    });

    return true;
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return true;
    }

    return false;
  }
};

const combineRequestUrl = (baseUrl: string, endpoint: string) => {
  if (/^https?:\/\//i.test(endpoint)) {
    return endpoint;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${endpoint.replace(/^\/+/, '')}`;
};

const parseFetchResponseData = async (response: Response): Promise<unknown> => {
  if (response.status === 204) {
    return undefined;
  }

  const responseText = await response.text();
  if (!responseText) {
    return undefined;
  }

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(responseText);
    } catch {
      return responseText;
    }
  }

  return responseText;
};

const setApiReachable = (nextReachable: boolean) => {
  if (apiReachable === nextReachable) {
    return;
  }

  apiReachable = nextReachable;
  connectivityListeners.forEach((listener) => {
    try {
      listener(nextReachable);
    } catch {
      // Ignore listener errors so request handling stays intact.
    }
  });
};

const emitSessionExpired = () => {
  sessionExpiredListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener errors so request handling stays intact.
    }
  });
};

const clearStoredSession = async () => {
  await Promise.all([
    SessionStore.deleteItemAsync(SESSION_ACCESS_TOKEN_KEY),
    SessionStore.deleteItemAsync(SESSION_REFRESH_TOKEN_KEY),
    SessionStore.deleteItemAsync(SESSION_USER_ID_KEY),
  ]);
};

export const subscribeApiConnectivity = (listener: ConnectivityListener) => {
  connectivityListeners.add(listener);
  return () => {
    connectivityListeners.delete(listener);
  };
};

export const subscribeSessionExpired = (listener: SessionExpiredListener) => {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
};

export const getApiConnectivityState = () => apiReachable;

const requestWithNativeFetch = async <T>(
  baseUrl: string,
  endpoint: string,
  config: ApiRequestOptions,
  headers: AxiosHeaders,
  payload: FormData
): Promise<T> => {
  const controller = typeof AbortController === 'undefined' ? null : new AbortController();
  const timeoutMs = config.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const timeoutHandle =
    controller && timeoutMs > 0
      ? setTimeout(() => controller.abort(), timeoutMs)
      : null;

  try {
    const response = await fetch(combineRequestUrl(baseUrl, endpoint), {
      method: (config.method ?? 'GET').toUpperCase(),
      headers: headersToObject(headers),
      body: payload,
      signal: controller?.signal,
    });
    const responseData = await parseFetchResponseData(response);

    if (!response.ok) {
      throw new ApiError(
        extractErrorMessage(responseData) || `Request failed (HTTP ${response.status})`,
        response.status,
        extractErrorCode(responseData),
        responseData
      );
    }

    return responseData as T;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiError(
        `Request timed out while reaching the backend.${formatBaseUrlAttempts([baseUrl])} ${getApiConnectionHelp([baseUrl])}`,
        0,
        'ECONNABORTED',
        undefined
      );
    }

    throw new ApiError(
      `Network error: cannot reach the backend.${formatBaseUrlAttempts([baseUrl])} ${getApiConnectionHelp([baseUrl])}`,
      0,
      undefined,
      undefined
    );
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const detectWorkingApiBaseUrl = async () => {
  const candidateBaseUrls = getCandidateBaseUrls();

  if (candidateBaseUrls.length <= 1) {
    return candidateBaseUrls[0] ?? API_BASE_URL;
  }

  for (const baseUrl of candidateBaseUrls) {
    if (await pingBaseUrl(baseUrl)) {
      return baseUrl;
    }
  }

  return candidateBaseUrls[0];
};

const resolveWorkingApiBaseUrl = async (forceRefresh = false) => {
  if (hasConfiguredApiBaseUrl()) {
    resolvedApiBaseUrl = API_BASE_URL;
    preferredApiBaseUrl = API_BASE_URL;
    return API_BASE_URL;
  }

  if (!forceRefresh && resolvedApiBaseUrl) {
    return resolvedApiBaseUrl;
  }

  if (!forceRefresh && resolvingApiBaseUrl) {
    return resolvingApiBaseUrl;
  }

  resolvingApiBaseUrl = detectWorkingApiBaseUrl()
    .then((baseUrl) => {
      preferredApiBaseUrl = baseUrl;
      resolvedApiBaseUrl = baseUrl;
      return baseUrl;
    })
    .finally(() => {
      resolvingApiBaseUrl = null;
    });

  return resolvingApiBaseUrl;
};

const normalizeAxiosError = (error: unknown, baseUrls: string[]): ApiError => {
  if (error instanceof ApiError) {
    return error;
  }

  if (!axios.isAxiosError(error)) {
    if (error instanceof Error) {
      return new ApiError(error.message, 0, undefined, undefined);
    }

    return new ApiError('Request failed', 0, undefined, undefined);
  }

  const axiosError = error as AxiosError<unknown>;
  const attemptedBaseUrls = baseUrls.length > 0 ? baseUrls : [preferredApiBaseUrl];

  if (axiosError.code === 'ECONNABORTED') {
    return new ApiError(
      `Request timed out while reaching the backend.${formatBaseUrlAttempts(attemptedBaseUrls)} ${getApiConnectionHelp(attemptedBaseUrls)}`,
      0,
      axiosError.code,
      undefined
    );
  }

  if (axiosError.response) {
    const responseCode = extractErrorCode(axiosError.response.data) ?? axiosError.code;
    return new ApiError(
      extractErrorMessage(axiosError.response.data) ||
        `Request failed (HTTP ${axiosError.response.status})`,
      axiosError.response.status,
      responseCode,
      axiosError.response.data
    );
  }

  if (axiosError.request) {
    return new ApiError(
      `Network error: cannot reach the backend.${formatBaseUrlAttempts(attemptedBaseUrls)} ${getApiConnectionHelp(attemptedBaseUrls)}`,
      0,
      axiosError.code,
      undefined
    );
  }

  return new ApiError(axiosError.message || 'Request failed', 0, axiosError.code, undefined);
};

const runRequestAgainstBaseUrl = async <T>(
  baseUrl: string,
  endpoint: string,
  config: Omit<ApiRequestOptions, 'headers' | 'body' | 'data' | 'requireAuth'>,
  headers: AxiosHeaders,
  payload: unknown,
  nativeFormPayload: FormData | null
) => {
  const response = nativeFormPayload
    ? ({
        data: await requestWithNativeFetch<T>(
          baseUrl,
          endpoint,
          config,
          headers,
          nativeFormPayload
        ),
      } as { data: T })
    : await api.request<T>({
        ...config,
        baseURL: baseUrl,
        url: endpoint,
        data: payload,
        headers,
        timeout: config.timeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
      });

  preferredApiBaseUrl = baseUrl;
  setApiReachable(true);
  return response.data;
};

const refreshStoredSessionTokens = async (baseUrl: string): Promise<string | null> => {
  if (refreshingSessionPromise) {
    return refreshingSessionPromise;
  }

  refreshingSessionPromise = (async () => {
    const refreshToken = await SessionStore.getItemAsync(SESSION_REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      await clearStoredSession();
      emitSessionExpired();
      return null;
    }

    try {
      const response = await api.request<{ access: string; refresh?: string }>({
        baseURL: baseUrl,
        url: '/auth/refresh/',
        method: 'POST',
        data: { refresh: refreshToken },
        timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      await SessionStore.setItemAsync(SESSION_ACCESS_TOKEN_KEY, response.data.access);
      if (response.data.refresh?.trim()) {
        await SessionStore.setItemAsync(SESSION_REFRESH_TOKEN_KEY, response.data.refresh);
      }

      setApiReachable(true);
      return response.data.access;
    } catch (error) {
      const normalizedError = normalizeAxiosError(error, [baseUrl]);
      if (normalizedError.status === 0) {
        setApiReachable(false);
        throw normalizedError;
      }

      await clearStoredSession();
      emitSessionExpired();
      return null;
    } finally {
      refreshingSessionPromise = null;
    }
  })();

  return refreshingSessionPromise;
};

export const apiRequest = async <T = unknown>(
  endpoint: string,
  options?: ApiRequestOptions
): Promise<T> => {
  const { body, data, ...config } = options ?? {};
  const payload = data !== undefined ? data : body;
  const nativeFormPayload: FormData | null = isNativeFormDataRequest(payload)
    ? (payload as FormData)
    : null;

  const headers = await buildHeaders(options ?? {}, payload);
  const initialBaseUrl = await resolveWorkingApiBaseUrl();

  try {
    return await runRequestAgainstBaseUrl(
      initialBaseUrl,
      endpoint,
      config,
      headers,
      payload,
      nativeFormPayload
    );
  } catch (error) {
    let requestError: unknown = error;
    let effectiveHeaders = headers;
    const normalizedInitialError = normalizeAxiosError(error, [initialBaseUrl]);

    if ((options?.requireAuth ?? false) && normalizedInitialError.status === 401) {
      try {
        const refreshedAccessToken = await refreshStoredSessionTokens(initialBaseUrl);
        if (!refreshedAccessToken) {
          throw new ApiError('Session expired. Please sign in again.', 401, 'session_expired');
        }

        effectiveHeaders = AxiosHeaders.from(headers);
        effectiveHeaders.set('Authorization', `Bearer ${refreshedAccessToken}`);
        return await runRequestAgainstBaseUrl(
          initialBaseUrl,
          endpoint,
          config,
          effectiveHeaders,
          payload,
          nativeFormPayload
        );
      } catch (refreshError) {
        const normalizedRefreshError = normalizeAxiosError(refreshError, [initialBaseUrl]);
        if (normalizedRefreshError.status === 401) {
          await clearStoredSession();
          emitSessionExpired();
          requestError = new ApiError('Session expired. Please sign in again.', 401, 'session_expired');
        } else {
          requestError = refreshError;
        }
      }
    }

    if (!hasConfiguredApiBaseUrl() && isRetryableConnectionError(requestError)) {
      resolvedApiBaseUrl = null;

      const fallbackBaseUrl = await resolveWorkingApiBaseUrl(true);
      if (fallbackBaseUrl !== initialBaseUrl) {
        try {
          return await runRequestAgainstBaseUrl(
            fallbackBaseUrl,
            endpoint,
            config,
            effectiveHeaders,
            payload,
            nativeFormPayload
          );
        } catch (fallbackError) {
          requestError = fallbackError;
        }
      }
    }

    const normalizedFinalError = normalizeAxiosError(requestError, getCandidateBaseUrls());
    setApiReachable(normalizedFinalError.status !== 0);
    throw normalizedFinalError;
  }
};
