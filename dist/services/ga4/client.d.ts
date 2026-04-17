/**
 * Google Analytics 4 (GA4) client — multi-account service account auth.
 *
 * Supports multiple GA4 accounts via a JSON config at ~/.ga4-mcp/accounts.json.
 * Each account maps a name to a credentials path + default property ID.
 * Falls back to env vars (GSC_CREDENTIALS_PATH + GA4_PROPERTY_ID) for single-account use.
 *
 * Config format (~/.ga4-mcp/accounts.json):
 * {
 *   "accounts": [
 *     { "name": "apex", "credentialsPath": "/path/to/sa.json", "defaultPropertyId": "123456" },
 *     { "name": "oaf",  "credentialsPath": "/path/to/oaf-sa.json", "defaultPropertyId": "789012" }
 *   ],
 *   "defaultAccount": "apex"
 * }
 */
import { analyticsdata_v1beta } from '@googleapis/analyticsdata';
import { analyticsadmin_v1beta } from '@googleapis/analyticsadmin';
export type AnalyticsDataService = analyticsdata_v1beta.Analyticsdata;
export type AnalyticsAdminService = analyticsadmin_v1beta.Analyticsadmin;
export declare function getGa4DataService(accountName?: string): AnalyticsDataService;
export declare function getGa4AdminService(accountName?: string): AnalyticsAdminService;
export declare function getDefaultPropertyId(accountName?: string): string;
export declare function resolvePropertyId(propertyId?: string, accountName?: string): string;
/** Formats property ID for the API — ensures "properties/XXXXX" format */
export declare function formatPropertyName(propertyId: string): string;
export declare function isGa4Configured(): boolean;
/** List configured GA4 accounts (for ga4_list_accounts tool) */
export declare function listGa4Accounts(): {
    name: string;
    defaultPropertyId?: string;
    isDefault: boolean;
}[];
