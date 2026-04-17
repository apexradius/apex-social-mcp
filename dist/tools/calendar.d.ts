/**
 * Google Calendar tools — 9 tools for calendar management via Gmail OAuth.
 *
 * Events (5): calendar_list_events, calendar_create_event, calendar_update_event, calendar_delete_event, calendar_get_event
 * Scheduling (2): calendar_free_busy, calendar_quick_add
 * Management (2): calendar_list_calendars, calendar_list_recurring
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerCalendarTools(server: McpServer): void;
