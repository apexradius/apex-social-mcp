/**
 * Google Calendar client — uses Gmail OAuth2 (same credentials + token store).
 *
 * Calendar API requires the `calendar.events` scope on top of the existing
 * Gmail scopes. When a user re-auths, the new scope is picked up automatically.
 * For existing tokens that lack the scope, Calendar calls will return 403
 * (Insufficient Permission) — handled gracefully at the tool layer.
 */
import { calendar_v3 } from '@googleapis/calendar';
export type CalendarService = calendar_v3.Calendar;
/**
 * Returns an authenticated Google Calendar client for the given email.
 * Reuses the Gmail OAuth2 client (same refresh token).
 */
export declare function getCalendarService(email: string): Promise<CalendarService>;
/**
 * Returns the first available Gmail account email for Calendar operations.
 * Calendar tools that don't specify an account use this as default.
 */
export declare function getDefaultCalendarEmail(): Promise<string>;
/**
 * Checks if Calendar is available (Gmail OAuth is configured + accounts exist).
 */
export declare function isCalendarAvailable(): Promise<boolean>;
