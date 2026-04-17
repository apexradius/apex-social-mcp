/**
 * Google Search Console client — rewritten from Python mcp-gsc (1,710 lines) to TypeScript.
 *
 * Uses googleapis package (same as Gmail) with service account auth.
 * The Python version supported both OAuth and service account; this TS version
 * uses service account only (controlled by GSC_CREDENTIALS_PATH env var),
 * matching the current .mcp.json config (GSC_SKIP_OAUTH=true).
 */
import { searchconsole_v1 } from '@googleapis/searchconsole';
export type SearchConsoleService = searchconsole_v1.Searchconsole;
export declare function getGscService(): SearchConsoleService;
export declare function isGscConfigured(): boolean;
/** Data state: 'all' (includes fresh data, matches GSC dashboard) or 'final' (confirmed only, 2-3 day lag) */
export declare function getDataState(): string;
export declare const ALLOW_DESTRUCTIVE: boolean;
/** Helpful error message when a property returns 404 */
export declare function siteNotFoundError(siteUrl: string): string;
/** Format a date N days ago as YYYY-MM-DD */
export declare function daysAgo(days: number): string;
/** Today as YYYY-MM-DD */
export declare function today(): string;
