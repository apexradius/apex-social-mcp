import { oauth2 as oauth2Api } from "@googleapis/oauth2";
import { OAuth2Client } from "google-auth-library";
import http from "http";
import { URL } from "url";
import { GMAIL_SCOPES, OAUTH_REDIRECT_URI, OAUTH_PORT } from "./constants.js";
import { saveTokens, saveAccountConfig, getTokens, listAccounts } from "./token-store.js";
// ============================================================
// Auth Service — OAuth2 flow + automatic token refresh
// ============================================================
function createOAuthClient() {
    const clientId = process.env.GMAIL_CLIENT_ID;
    const clientSecret = process.env.GMAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error("Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET environment variables.\n" +
            "Create a Google Cloud project, enable Gmail API, create OAuth2 credentials,\n" +
            "then set these env vars before running the server.");
    }
    return new OAuth2Client(clientId, clientSecret, OAUTH_REDIRECT_URI);
}
// Starts a local HTTP server to catch the OAuth redirect, returns the auth code
function waitForOAuthCode() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            if (!req.url) {
                reject(new Error("No URL in request"));
                return;
            }
            const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
            const code = url.searchParams.get("code");
            const error = url.searchParams.get("error");
            if (error) {
                res.writeHead(400);
                res.end(`<h2>Auth failed: ${error}</h2><p>You can close this tab.</p>`);
                server.close();
                reject(new Error(`OAuth error: ${error}`));
                return;
            }
            if (code) {
                res.writeHead(200);
                res.end("<h2>Account connected!</h2><p>You can close this tab and return to the terminal.</p>");
                server.close();
                resolve(code);
            }
        });
        server.listen(OAUTH_PORT, () => {
            console.error(`[auth] Waiting for OAuth callback on port ${OAUTH_PORT}...`);
        });
        // Timeout after 5 minutes
        setTimeout(() => {
            server.close();
            reject(new Error("OAuth timeout — no response within 5 minutes"));
        }, 5 * 60 * 1000);
    });
}
// Full OAuth2 add-account flow. Opens browser, waits for callback, stores tokens.
export async function addAccount(label) {
    const oauth2Client = createOAuthClient();
    const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: GMAIL_SCOPES,
        prompt: "consent" // force consent so we always get a refresh_token
    });
    console.error(`\n[auth] Opening browser for Google sign-in...\n`);
    console.error(`If browser doesn't open, visit:\n${authUrl}\n`);
    // Try to open browser
    try {
        const { default: open } = await import("open");
        await open(authUrl);
    }
    catch {
        console.error("[auth] Could not auto-open browser. Please visit the URL above manually.");
    }
    const code = await waitForOAuthCode();
    const { tokens } = await oauth2Client.getToken(code);
    if (!tokens.refresh_token) {
        throw new Error("No refresh_token received. This usually means the account was already authorized.\n" +
            "Go to https://myaccount.google.com/permissions, revoke this app, and try again.");
    }
    // Get the email address from the token
    oauth2Client.setCredentials(tokens);
    const oauth2 = oauth2Api({ version: "v2", auth: oauth2Client });
    const { data: userInfo } = await oauth2.userinfo.get();
    const email = userInfo.email;
    if (!email)
        throw new Error("Could not retrieve email from Google account");
    const tokenData = {
        access_token: tokens.access_token ?? "",
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date ?? 0,
        token_type: tokens.token_type ?? "Bearer",
        scope: tokens.scope ?? GMAIL_SCOPES.join(" ")
    };
    await saveTokens(email, tokenData);
    await saveAccountConfig({
        email,
        label,
        addedAt: new Date().toISOString()
    });
    console.error(`\n[auth] Account added: ${email} (${label})`);
    return email;
}
// Re-authorizes an existing account by running a fresh OAuth flow that overwrites stale tokens.
// Preserves the original label. Use when an account shows "Insufficient Permission" errors.
// Safe: does NOT remove the account first — new tokens are written on successful auth only.
export async function reAuthAccount(email, fallbackLabel) {
    const accounts = await listAccounts();
    const existing = accounts.find(a => a.email === email);
    const label = existing?.label ?? fallbackLabel ?? "personal";
    console.error(`\n[auth] Re-authorizing ${email} with label "${label}"...`);
    console.error(`[auth] If prompted, sign in as ${email} and grant Gmail access.\n`);
    return addAccount(label);
}
/**
 * Determines if an error indicates the token is expired, revoked, or has insufficient scopes.
 * Used by tool handlers to detect when re-auth is needed.
 */
export function isAuthError(err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (msg.includes("invalid_grant") ||
        msg.includes("Token has been expired or revoked") ||
        msg.includes("Insufficient Permission") ||
        msg.includes("insufficient_scope") ||
        msg.includes("UNAUTHENTICATED") ||
        msg.includes("Request had invalid authentication credentials") ||
        msg.includes("401") ||
        msg.includes("403"));
}
/**
 * Formats a user-facing auth error message with remediation steps.
 */
export function formatAuthError(email, err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (`Authentication failed for ${email}: ${msg}\n\n` +
        `This token may be expired or revoked. To fix:\n` +
        `  1. Run: npm run setup reauth ${email}\n` +
        `  2. Or remove and re-add: npm run setup remove ${email} && npm run setup add <label>\n` +
        `  3. If persistent, revoke at https://myaccount.google.com/permissions and re-add.`);
}
// Returns an authenticated Gmail-ready OAuth2 client for the given email.
// Automatically refreshes expired access tokens.
export async function getAuthenticatedClient(email) {
    const tokens = await getTokens(email);
    if (!tokens) {
        throw new Error(`No tokens found for ${email}. Run: npm run setup add <label>`);
    }
    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type
    });
    // Auto-refresh: if token expires within 5 minutes, refresh now
    const fiveMinutes = 5 * 60 * 1000;
    const isExpired = tokens.expiry_date && Date.now() > tokens.expiry_date - fiveMinutes;
    if (isExpired) {
        try {
            const { credentials } = await oauth2Client.refreshAccessToken();
            const refreshed = {
                access_token: credentials.access_token ?? "",
                refresh_token: credentials.refresh_token ?? tokens.refresh_token,
                expiry_date: credentials.expiry_date ?? 0,
                token_type: credentials.token_type ?? "Bearer",
                scope: credentials.scope ?? tokens.scope
            };
            await saveTokens(email, refreshed);
            oauth2Client.setCredentials(refreshed);
        }
        catch (err) {
            if (isAuthError(err)) {
                throw new Error(`Token refresh failed for ${email}. The refresh token may have been revoked.\n` +
                    `Run: npm run setup reauth ${email}`);
            }
            throw err;
        }
    }
    return oauth2Client;
}
