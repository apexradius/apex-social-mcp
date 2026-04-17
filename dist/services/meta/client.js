/**
 * Meta Graph API client — rewritten from mcp-meta-social dist/ to TypeScript.
 */
export class MetaApiError extends Error {
    status;
    type;
    code;
    subcode;
    fbtraceId;
    constructor(status, detail) {
        super(`Meta API error ${status} [${detail.type}] (code ${detail.code}): ${detail.message}`);
        this.name = 'MetaApiError';
        this.status = status;
        this.type = detail.type;
        this.code = detail.code;
        this.subcode = detail.error_subcode;
        this.fbtraceId = detail.fbtrace_id;
    }
    get isRateLimited() {
        return this.status === 429 || this.code === 4 || this.code === 32 || this.code === 17;
    }
    get isTokenExpired() {
        return this.code === 190;
    }
    get isPermissionError() {
        return this.code === 10 || this.code === 200 || this.code === 299;
    }
}
export class MetaClient {
    config;
    constructor(config) {
        this.config = config;
    }
    get pageId() { return this.config.pageId; }
    get igAccountId() {
        if (!this.config.igAccountId)
            throw new Error('META_IG_ACCOUNT_ID not configured');
        return this.config.igAccountId;
    }
    get adAccountId() {
        if (!this.config.adAccountId)
            throw new Error('META_AD_ACCOUNT_ID not configured');
        return this.config.adAccountId;
    }
    get baseUrl() {
        return `https://graph.facebook.com/${this.config.apiVersion}`;
    }
    get pageToken() {
        return this.config.pageAccessToken ?? this.config.accessToken;
    }
    get headers() {
        return { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' };
    }
    pageHeaders() {
        return { Authorization: `Bearer ${this.pageToken}`, 'Content-Type': 'application/json' };
    }
    async request(method, path, body, usePageToken = false) {
        const url = `${this.baseUrl}${path}`;
        const opts = { method, headers: usePageToken ? this.pageHeaders() : this.headers, signal: AbortSignal.timeout(30_000) };
        if (body && method !== 'GET')
            opts.body = JSON.stringify(body);
        const response = await fetch(url, opts);
        if (!response.ok) {
            const text = await response.text();
            try {
                const parsed = JSON.parse(text);
                if (parsed.error)
                    throw new MetaApiError(response.status, parsed.error);
            }
            catch (e) {
                if (e instanceof MetaApiError)
                    throw e;
            }
            throw new Error(`Meta API ${response.status}: ${text}`);
        }
        if (response.status === 204)
            return {};
        return response.json();
    }
    async get(path, params) {
        return this.request('GET', `${path}${this.qs(params ?? {})}`);
    }
    async pageGet(path, params) {
        return this.request('GET', `${path}${this.qs(params ?? {})}`, undefined, true);
    }
    async post(path, body) { return this.request('POST', path, body); }
    async pagePost(path, body) { return this.request('POST', path, body, true); }
    async del(path) { return this.request('DELETE', path); }
    async pageDel(path) { return this.request('DELETE', path, undefined, true); }
    async postForm(path, params) {
        const allParams = { ...params, access_token: this.config.accessToken };
        const url = `${this.baseUrl}${path}${this.qs(allParams)}`;
        const response = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(30_000) });
        if (!response.ok) {
            const text = await response.text();
            try {
                const parsed = JSON.parse(text);
                if (parsed.error)
                    throw new MetaApiError(response.status, parsed.error);
            }
            catch (e) {
                if (e instanceof MetaApiError)
                    throw e;
            }
            throw new Error(`Meta API ${response.status}: ${text}`);
        }
        return response.json();
    }
    qs(params) {
        const parts = [];
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined && v !== null && v !== '')
                parts.push(`${k}=${encodeURIComponent(String(v))}`);
        }
        return parts.length ? `?${parts.join('&')}` : '';
    }
}
export function createMetaClient() {
    const appId = process.env['META_APP_ID'];
    const appSecret = process.env['META_APP_SECRET'];
    const accessToken = process.env['META_ACCESS_TOKEN'];
    const pageId = process.env['META_PAGE_ID'];
    if (!appId || !appSecret || !accessToken || !pageId)
        return null;
    return new MetaClient({
        appId, appSecret, accessToken,
        pageAccessToken: process.env['META_PAGE_ACCESS_TOKEN'],
        pageId,
        igAccountId: process.env['META_IG_ACCOUNT_ID'],
        adAccountId: process.env['META_AD_ACCOUNT_ID'],
        apiVersion: process.env['META_API_VERSION'] ?? 'v21.0',
    });
}
