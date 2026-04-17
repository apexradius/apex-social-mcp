import { OAuth2Client } from "google-auth-library";
export declare function addAccount(label: string): Promise<string>;
export declare function reAuthAccount(email: string, fallbackLabel?: string): Promise<string>;
/**
 * Determines if an error indicates the token is expired, revoked, or has insufficient scopes.
 * Used by tool handlers to detect when re-auth is needed.
 */
export declare function isAuthError(err: unknown): boolean;
/**
 * Formats a user-facing auth error message with remediation steps.
 */
export declare function formatAuthError(email: string, err: unknown): string;
export declare function getAuthenticatedClient(email: string): Promise<OAuth2Client>;
