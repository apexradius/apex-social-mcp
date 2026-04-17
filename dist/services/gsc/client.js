/**
 * Google Search Console client — rewritten from Python mcp-gsc (1,710 lines) to TypeScript.
 *
 * Uses googleapis package (same as Gmail) with service account auth.
 * The Python version supported both OAuth and service account; this TS version
 * uses service account only (controlled by GSC_CREDENTIALS_PATH env var),
 * matching the current .mcp.json config (GSC_SKIP_OAUTH=true).
 */
import { searchconsole } from '@googleapis/searchconsole';
import { GoogleAuth } from 'google-auth-library';
import * as fs from 'node:fs';
const SCOPES = ['https://www.googleapis.com/auth/webmasters'];
let cachedService = null;
export function getGscService() {
    if (cachedService)
        return cachedService;
    const credPath = process.env['GSC_CREDENTIALS_PATH'];
    if (!credPath) {
        throw new Error('GSC_CREDENTIALS_PATH environment variable is required');
    }
    if (!fs.existsSync(credPath)) {
        throw new Error(`GSC credentials file not found at ${credPath}`);
    }
    const keyFile = JSON.parse(fs.readFileSync(credPath, 'utf-8'));
    const auth = new GoogleAuth({
        credentials: keyFile,
        scopes: SCOPES,
    });
    cachedService = searchconsole({ version: 'v1', auth: auth });
    return cachedService;
}
export function isGscConfigured() {
    const credPath = process.env['GSC_CREDENTIALS_PATH'];
    return !!credPath && fs.existsSync(credPath);
}
/** Data state: 'all' (includes fresh data, matches GSC dashboard) or 'final' (confirmed only, 2-3 day lag) */
export function getDataState() {
    const raw = (process.env['GSC_DATA_STATE'] ?? 'all').toLowerCase().trim();
    if (raw !== 'all' && raw !== 'final')
        return 'all';
    return raw;
}
export const ALLOW_DESTRUCTIVE = (process.env['GSC_ALLOW_DESTRUCTIVE'] ?? 'false').toLowerCase() === 'true';
/** Helpful error message when a property returns 404 */
export function siteNotFoundError(siteUrl) {
    const lines = [`Property '${siteUrl}' not found (404). Possible causes:\n`];
    lines.push("1. The site_url doesn't exactly match GSC. Run gsc_list_properties to get the exact string.");
    if (siteUrl.startsWith('sc-domain:')) {
        lines.push("2. Domain properties require the service account to be added under GSC Settings > Users and permissions.");
    }
    else {
        lines.push("2. For domain properties, use 'sc-domain:example.com' format, not a full URL.");
    }
    lines.push("3. The service account may not have access to this property.");
    return lines.join('\n');
}
/** Format a date N days ago as YYYY-MM-DD */
export function daysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().split('T')[0];
}
/** Today as YYYY-MM-DD */
export function today() {
    return new Date().toISOString().split('T')[0];
}
