/**
 * Google Calendar client — uses Gmail OAuth2 (same credentials + token store).
 *
 * Calendar API requires the `calendar.events` scope on top of the existing
 * Gmail scopes. When a user re-auths, the new scope is picked up automatically.
 * For existing tokens that lack the scope, Calendar calls will return 403
 * (Insufficient Permission) — handled gracefully at the tool layer.
 */

import { calendar, calendar_v3 } from '@googleapis/calendar';
import { getAuthenticatedClient } from '../gmail/auth.js';
import { listAccounts } from '../gmail/token-store.js';

export type CalendarService = calendar_v3.Calendar;

/**
 * Returns an authenticated Google Calendar client for the given email.
 * Reuses the Gmail OAuth2 client (same refresh token).
 */
export async function getCalendarService(email: string): Promise<CalendarService> {
  const auth = await getAuthenticatedClient(email);
  return calendar({ version: 'v3', auth });
}

/**
 * Returns the first available Gmail account email for Calendar operations.
 * Calendar tools that don't specify an account use this as default.
 */
export async function getDefaultCalendarEmail(): Promise<string> {
  const accounts = await listAccounts();
  if (!accounts.length) throw new Error('No Gmail accounts connected. Calendar requires Gmail OAuth.');
  return accounts[0]!.email;
}

/**
 * Checks if Calendar is available (Gmail OAuth is configured + accounts exist).
 */
export async function isCalendarAvailable(): Promise<boolean> {
  const clientId = process.env['GMAIL_CLIENT_ID'];
  const clientSecret = process.env['GMAIL_CLIENT_SECRET'];
  if (!clientId || !clientSecret) return false;
  try {
    const accounts = await listAccounts();
    return accounts.length > 0;
  } catch {
    return false;
  }
}
