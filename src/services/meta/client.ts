/**
 * Meta Graph API client — rewritten from mcp-meta-social dist/ to TypeScript.
 */

export interface MetaConfig {
  appId: string;
  appSecret: string;
  accessToken: string;
  pageAccessToken?: string;
  pageId: string;
  igAccountId?: string;
  adAccountId?: string;
  apiVersion: string;
}

interface MetaErrorDetail {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiError extends Error {
  readonly status: number;
  readonly type: string;
  readonly code: number;
  readonly subcode?: number;
  readonly fbtraceId?: string;

  constructor(status: number, detail: MetaErrorDetail) {
    super(`Meta API error ${status} [${detail.type}] (code ${detail.code}): ${detail.message}`);
    this.name = 'MetaApiError';
    this.status = status;
    this.type = detail.type;
    this.code = detail.code;
    this.subcode = detail.error_subcode;
    this.fbtraceId = detail.fbtrace_id;
  }

  get isRateLimited(): boolean {
    return this.status === 429 || this.code === 4 || this.code === 32 || this.code === 17;
  }

  get isTokenExpired(): boolean {
    return this.code === 190;
  }

  get isPermissionError(): boolean {
    return this.code === 10 || this.code === 200 || this.code === 299;
  }
}

export class MetaClient {
  constructor(private config: MetaConfig) {}

  get pageId(): string { return this.config.pageId; }
  get igAccountId(): string {
    if (!this.config.igAccountId) throw new Error('META_IG_ACCOUNT_ID not configured');
    return this.config.igAccountId;
  }
  get adAccountId(): string {
    if (!this.config.adAccountId) throw new Error('META_AD_ACCOUNT_ID not configured');
    return this.config.adAccountId;
  }
  private get baseUrl(): string {
    return `https://graph.facebook.com/${this.config.apiVersion}`;
  }
  get pageToken(): string {
    return this.config.pageAccessToken ?? this.config.accessToken;
  }
  private get headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' };
  }
  private pageHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.pageToken}`, 'Content-Type': 'application/json' };
  }

  async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>, usePageToken = false): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const opts: RequestInit = { method, headers: usePageToken ? this.pageHeaders() : this.headers, signal: AbortSignal.timeout(30_000) };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);
    const response = await fetch(url, opts);
    if (!response.ok) {
      const text = await response.text();
      try { const parsed = JSON.parse(text); if (parsed.error) throw new MetaApiError(response.status, parsed.error); }
      catch (e) { if (e instanceof MetaApiError) throw e; }
      throw new Error(`Meta API ${response.status}: ${text}`);
    }
    if (response.status === 204) return {} as T;
    return response.json() as T;
  }

  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', `${path}${this.qs(params ?? {})}`);
  }
  async pageGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return this.request<T>('GET', `${path}${this.qs(params ?? {})}`, undefined, true);
  }
  async post<T>(path: string, body?: Record<string, unknown>): Promise<T> { return this.request<T>('POST', path, body); }
  async pagePost<T>(path: string, body?: Record<string, unknown>): Promise<T> { return this.request<T>('POST', path, body, true); }
  async del<T>(path: string): Promise<T> { return this.request<T>('DELETE', path); }
  async pageDel<T>(path: string): Promise<T> { return this.request<T>('DELETE', path, undefined, true); }

  async postForm<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
    const allParams = { ...params, access_token: this.config.accessToken };
    const url = `${this.baseUrl}${path}${this.qs(allParams)}`;
    const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      const text = await response.text();
      try { const parsed = JSON.parse(text); if (parsed.error) throw new MetaApiError(response.status, parsed.error); }
      catch (e) { if (e instanceof MetaApiError) throw e; }
      throw new Error(`Meta API ${response.status}: ${text}`);
    }
    return response.json() as T;
  }

  private qs(params: Record<string, string | number | boolean | undefined>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') parts.push(`${k}=${encodeURIComponent(String(v))}`);
    }
    return parts.length ? `?${parts.join('&')}` : '';
  }
}

export function createMetaClient(): MetaClient | null {
  const appId = process.env['META_APP_ID'];
  const appSecret = process.env['META_APP_SECRET'];
  const accessToken = process.env['META_ACCESS_TOKEN'];
  const pageId = process.env['META_PAGE_ID'];
  if (!appId || !appSecret || !accessToken || !pageId) return null;

  return new MetaClient({
    appId, appSecret, accessToken,
    pageAccessToken: process.env['META_PAGE_ACCESS_TOKEN'],
    pageId,
    igAccountId: process.env['META_IG_ACCOUNT_ID'],
    adAccountId: process.env['META_AD_ACCOUNT_ID'],
    apiVersion: process.env['META_API_VERSION'] ?? 'v21.0',
  });
}
