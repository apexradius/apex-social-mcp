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
export declare class MetaApiError extends Error {
    readonly status: number;
    readonly type: string;
    readonly code: number;
    readonly subcode?: number;
    readonly fbtraceId?: string;
    constructor(status: number, detail: MetaErrorDetail);
    get isRateLimited(): boolean;
    get isTokenExpired(): boolean;
    get isPermissionError(): boolean;
}
export declare class MetaClient {
    private config;
    constructor(config: MetaConfig);
    get pageId(): string;
    get igAccountId(): string;
    get adAccountId(): string;
    private get baseUrl();
    get pageToken(): string;
    private get headers();
    private pageHeaders;
    request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>, usePageToken?: boolean): Promise<T>;
    get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    pageGet<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T>;
    post<T>(path: string, body?: Record<string, unknown>): Promise<T>;
    pagePost<T>(path: string, body?: Record<string, unknown>): Promise<T>;
    del<T>(path: string): Promise<T>;
    pageDel<T>(path: string): Promise<T>;
    postForm<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T>;
    private qs;
}
export declare function createMetaClient(): MetaClient | null;
export {};
