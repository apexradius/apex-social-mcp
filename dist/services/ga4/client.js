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
import { analyticsdata } from '@googleapis/analyticsdata';
import { analyticsadmin } from '@googleapis/analyticsadmin';
import { GoogleAuth } from 'google-auth-library';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
const SCOPES = [
    'https://www.googleapis.com/auth/analytics.readonly',
];
const CONFIG_DIR = path.join(os.homedir(), '.ga4-mcp');
const CONFIG_FILE = path.join(CONFIG_DIR, 'accounts.json');
// Cache per account name
const dataServiceCache = new Map();
const adminServiceCache = new Map();
function loadConfig() {
    if (!fs.existsSync(CONFIG_FILE))
        return null;
    try {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    }
    catch {
        return null;
    }
}
function resolveAccount(accountName) {
    const config = loadConfig();
    if (config && config.accounts.length > 0) {
        // Multi-account mode
        const target = accountName
            ? config.accounts.find(a => a.name === accountName)
            : config.accounts.find(a => a.name === config.defaultAccount) ?? config.accounts[0];
        if (!target) {
            const available = config.accounts.map(a => a.name).join(', ');
            throw new Error(`GA4 account "${accountName}" not found. Available: ${available}`);
        }
        if (!fs.existsSync(target.credentialsPath)) {
            throw new Error(`Credentials file not found for account "${target.name}": ${target.credentialsPath}`);
        }
        return target;
    }
    // Fallback: single-account via env vars
    const credPath = process.env['GSC_CREDENTIALS_PATH'];
    if (!credPath)
        throw new Error('No GA4 accounts configured. Set up ~/.ga4-mcp/accounts.json or GSC_CREDENTIALS_PATH env var.');
    if (!fs.existsSync(credPath))
        throw new Error(`Service account credentials not found at ${credPath}`);
    return { name: '_default', credentialsPath: credPath, defaultPropertyId: process.env['GA4_PROPERTY_ID'] };
}
function getAuth(credentialsPath) {
    const keyFile = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
    return new GoogleAuth({
        credentials: keyFile,
        scopes: SCOPES,
    });
}
export function getGa4DataService(accountName) {
    const account = resolveAccount(accountName);
    const cached = dataServiceCache.get(account.name);
    if (cached)
        return cached;
    const auth = getAuth(account.credentialsPath);
    const svc = analyticsdata({ version: 'v1beta', auth: auth });
    dataServiceCache.set(account.name, svc);
    return svc;
}
export function getGa4AdminService(accountName) {
    const account = resolveAccount(accountName);
    const cached = adminServiceCache.get(account.name);
    if (cached)
        return cached;
    const auth = getAuth(account.credentialsPath);
    const svc = analyticsadmin({ version: 'v1beta', auth: auth });
    adminServiceCache.set(account.name, svc);
    return svc;
}
export function getDefaultPropertyId(accountName) {
    const account = resolveAccount(accountName);
    const id = account.defaultPropertyId ?? process.env['GA4_PROPERTY_ID'];
    if (!id)
        throw new Error(`No default property ID for account "${account.name}". Pass propertyId explicitly.`);
    return id;
}
export function resolvePropertyId(propertyId, accountName) {
    return propertyId ?? getDefaultPropertyId(accountName);
}
/** Formats property ID for the API — ensures "properties/XXXXX" format */
export function formatPropertyName(propertyId) {
    if (propertyId.startsWith('properties/'))
        return propertyId;
    return `properties/${propertyId}`;
}
export function isGa4Configured() {
    // Multi-account config exists and has at least one account
    const config = loadConfig();
    if (config && config.accounts.length > 0)
        return true;
    // Fallback: env vars
    const credPath = process.env['GSC_CREDENTIALS_PATH'];
    const propId = process.env['GA4_PROPERTY_ID'];
    return !!credPath && fs.existsSync(credPath) && !!propId;
}
/** List configured GA4 accounts (for ga4_list_accounts tool) */
export function listGa4Accounts() {
    const config = loadConfig();
    if (!config || !config.accounts.length) {
        // Single env-var account
        const credPath = process.env['GSC_CREDENTIALS_PATH'];
        if (!credPath)
            return [];
        return [{ name: '_default (env)', defaultPropertyId: process.env['GA4_PROPERTY_ID'], isDefault: true }];
    }
    return config.accounts.map(a => ({
        name: a.name,
        defaultPropertyId: a.defaultPropertyId,
        isDefault: a.name === (config.defaultAccount ?? config.accounts[0]?.name),
    }));
}
