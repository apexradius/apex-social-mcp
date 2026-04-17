/**
 * Google Calendar tools — 9 tools for calendar management via Gmail OAuth.
 *
 * Events (5): calendar_list_events, calendar_create_event, calendar_update_event, calendar_delete_event, calendar_get_event
 * Scheduling (2): calendar_free_busy, calendar_quick_add
 * Management (2): calendar_list_calendars, calendar_list_recurring
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult, toolError, log } from '@apexradius/apex-mcp-shared';
import { getCalendarService, getDefaultCalendarEmail } from '../services/calendar/client.js';

const MCP = 'apex-social-mcp';

/** Resolve account email — Calendar tools use the first Gmail account by default. */
async function resolveEmail(): Promise<string> {
  return getDefaultCalendarEmail();
}

function formatEvent(event: Record<string, unknown>): string {
  const start = event.start as Record<string, string> | undefined;
  const end = event.end as Record<string, string> | undefined;
  const attendees = event.attendees as Array<Record<string, string>> | undefined;
  const lines: string[] = [
    `ID: ${event.id ?? 'N/A'}`,
    `Summary: ${event.summary ?? '(no title)'}`,
    `Status: ${event.status ?? 'confirmed'}`,
    `Start: ${start?.dateTime ?? start?.date ?? 'N/A'}`,
    `End: ${end?.dateTime ?? end?.date ?? 'N/A'}`,
  ];
  if (event.location) lines.push(`Location: ${event.location}`);
  if (event.description) lines.push(`Description: ${String(event.description).slice(0, 500)}`);
  if (event.htmlLink) lines.push(`Link: ${event.htmlLink}`);
  if (event.recurringEventId) lines.push(`Recurring Event ID: ${event.recurringEventId}`);
  if (event.recurrence) lines.push(`Recurrence: ${(event.recurrence as string[]).join(', ')}`);
  if (attendees?.length) {
    lines.push(`Attendees: ${attendees.map(a => `${a.email} (${a.responseStatus ?? '?'})`).join(', ')}`);
  }
  if (event.reminders) {
    const rem = event.reminders as Record<string, unknown>;
    if (rem.useDefault) {
      lines.push('Reminders: default');
    } else if (rem.overrides) {
      const overrides = rem.overrides as Array<Record<string, unknown>>;
      lines.push(`Reminders: ${overrides.map(o => `${o.method} ${o.minutes}min before`).join(', ')}`);
    }
  }
  return lines.join('\n');
}

const dateTimeSchema = z.object({
  dateTime: z.string().describe('RFC3339 datetime (e.g. "2026-04-20T10:00:00-06:00")'),
  timeZone: z.string().optional().describe('IANA timezone (e.g. "America/Edmonton")'),
});

const dateOnlySchema = z.object({
  date: z.string().describe('Date for all-day event (YYYY-MM-DD)'),
});

const eventTimeSchema = z.union([dateTimeSchema, dateOnlySchema]);

export function registerCalendarTools(server: McpServer): void {

  server.tool('calendar_list_events', 'List calendar events within a time range', {
    timeMin: z.string().describe('Start of range (ISO 8601, e.g. "2026-04-16T00:00:00Z")'),
    timeMax: z.string().describe('End of range (ISO 8601)'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
    maxResults: z.number().optional().describe('Max events to return (default: 25)'),
    pageToken: z.string().optional().describe('Pagination token from previous response'),
    orderBy: z.enum(['startTime', 'updated']).optional().describe('Sort order (default: startTime)'),
    singleEvents: z.boolean().optional().describe('Expand recurring events (default: true)'),
    q: z.string().optional().describe('Free-text search query'),
  }, async ({ timeMin, timeMax, calendarId = 'primary', maxResults = 25, pageToken, orderBy = 'startTime', singleEvents = true, q }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const res = await cal.events.list({
        calendarId,
        timeMin,
        timeMax,
        maxResults,
        pageToken,
        orderBy,
        singleEvents,
        q,
      });
      const events = res.data.items ?? [];
      if (!events.length) return toolResult('No events found in the specified range.');

      const lines: string[] = [`Found ${events.length} event(s):`];
      for (const ev of events) {
        const start = ev.start?.dateTime ?? ev.start?.date ?? '';
        const end = ev.end?.dateTime ?? ev.end?.date ?? '';
        lines.push(`\n[${ev.id}] ${ev.summary ?? '(no title)'}`);
        lines.push(`  ${start} → ${end}`);
        if (ev.location) lines.push(`  Location: ${ev.location}`);
      }
      if (res.data.nextPageToken) {
        lines.push(`\nMore results available. Use pageToken: "${res.data.nextPageToken}"`);
      }
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_create_event', 'Create a new calendar event', {
    summary: z.string().describe('Event title'),
    start: eventTimeSchema.describe('Start time (dateTime+timeZone for timed, date for all-day)'),
    end: eventTimeSchema.describe('End time (dateTime+timeZone for timed, date for all-day)'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
    attendees: z.array(z.object({ email: z.string().email() })).optional().describe('List of attendee emails'),
    location: z.string().optional().describe('Event location'),
    description: z.string().optional().describe('Event description'),
    reminders: z.object({
      useDefault: z.boolean().optional(),
      overrides: z.array(z.object({
        method: z.enum(['email', 'popup']),
        minutes: z.number(),
      })).optional(),
    }).optional().describe('Custom reminders'),
    recurrence: z.array(z.string()).optional().describe('RRULE strings (e.g. ["RRULE:FREQ=WEEKLY;COUNT=10"])'),
    sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().describe('Who to notify (default: "none")'),
  }, async ({ summary, start, end, calendarId = 'primary', attendees, location, description, reminders, recurrence, sendUpdates = 'none' }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const body: Record<string, unknown> = { summary, start, end };
      if (attendees) body.attendees = attendees;
      if (location) body.location = location;
      if (description) body.description = description;
      if (reminders) body.reminders = reminders;
      if (recurrence) body.recurrence = recurrence;

      const res = await cal.events.insert({
        calendarId,
        requestBody: body as any,
        sendUpdates,
      });
      return toolResult(`Event created:\n${formatEvent(res.data as Record<string, unknown>)}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_update_event', 'Update an existing calendar event', {
    eventId: z.string().describe('Event ID to update'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
    summary: z.string().optional().describe('New title'),
    start: eventTimeSchema.optional().describe('New start time'),
    end: eventTimeSchema.optional().describe('New end time'),
    attendees: z.array(z.object({ email: z.string().email() })).optional().describe('Updated attendee list'),
    location: z.string().optional().describe('New location'),
    description: z.string().optional().describe('New description'),
    sendUpdates: z.enum(['all', 'externalOnly', 'none']).optional().describe('Who to notify (default: "none")'),
  }, async ({ eventId, calendarId = 'primary', summary, start, end, attendees, location, description, sendUpdates = 'none' }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);

      // Fetch existing event first for patch
      const existing = await cal.events.get({ calendarId, eventId });
      const body: Record<string, unknown> = { ...existing.data as Record<string, unknown> };
      if (summary !== undefined) body.summary = summary;
      if (start !== undefined) body.start = start;
      if (end !== undefined) body.end = end;
      if (attendees !== undefined) body.attendees = attendees;
      if (location !== undefined) body.location = location;
      if (description !== undefined) body.description = description;

      const res = await cal.events.patch({
        calendarId,
        eventId,
        requestBody: body as any,
        sendUpdates,
      });
      return toolResult(`Event updated:\n${formatEvent(res.data as Record<string, unknown>)}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_delete_event', 'Delete a calendar event (requires confirm=true)', {
    eventId: z.string().describe('Event ID to delete'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
    confirm: z.boolean().describe('Must be true to execute deletion'),
  }, async ({ eventId, calendarId = 'primary', confirm }) => {
    if (!confirm) return toolError('Safety: set confirm=true to delete the event.');
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      await cal.events.delete({ calendarId, eventId });
      return toolResult(JSON.stringify({ id: eventId, object: 'event', deleted: true }));
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_get_event', 'Get full details of a specific calendar event', {
    eventId: z.string().describe('Event ID'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
  }, async ({ eventId, calendarId = 'primary' }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const res = await cal.events.get({ calendarId, eventId });
      return toolResult(formatEvent(res.data as Record<string, unknown>));
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_free_busy', 'Check free/busy status across calendars', {
    timeMin: z.string().describe('Start of range (ISO 8601)'),
    timeMax: z.string().describe('End of range (ISO 8601)'),
    calendarIds: z.array(z.string()).optional().describe('Calendar IDs to check (default: ["primary"])'),
  }, async ({ timeMin, timeMax, calendarIds }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const ids = calendarIds ?? ['primary'];
      const res = await cal.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: ids.map(id => ({ id })),
        },
      });
      const calendars = res.data.calendars ?? {};
      const lines: string[] = [`Free/Busy: ${timeMin} → ${timeMax}`];
      for (const [calId, info] of Object.entries(calendars)) {
        const busyPeriods = (info as Record<string, unknown>).busy as Array<{ start: string; end: string }> | undefined;
        if (!busyPeriods?.length) {
          lines.push(`\n${calId}: FREE (no busy periods)`);
        } else {
          lines.push(`\n${calId}: ${busyPeriods.length} busy period(s)`);
          for (const period of busyPeriods) {
            lines.push(`  BUSY: ${period.start} → ${period.end}`);
          }
        }
      }
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_list_calendars', 'List all calendars the user has access to', {},
    async () => {
      try {
        const email = await resolveEmail();
        const cal = await getCalendarService(email);
        const res = await cal.calendarList.list();
        const calendars = res.data.items ?? [];
        if (!calendars.length) return toolResult('No calendars found.');
        const lines: string[] = [`${calendars.length} calendar(s):`];
        for (const c of calendars) {
          const primary = c.primary ? ' [PRIMARY]' : '';
          lines.push(`\n- ${c.summary ?? '(unnamed)'}${primary}`);
          lines.push(`  ID: ${c.id}`);
          lines.push(`  Access: ${c.accessRole}`);
          if (c.description) lines.push(`  Description: ${c.description}`);
        }
        return toolResult(lines.join('\n'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool('calendar_quick_add', 'Create an event using natural language (e.g. "Lunch with Ayo tomorrow at noon")', {
    text: z.string().describe('Natural language event description'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
  }, async ({ text, calendarId = 'primary' }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const res = await cal.events.quickAdd({ calendarId, text });
      return toolResult(`Quick-add event created:\n${formatEvent(res.data as Record<string, unknown>)}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('calendar_list_recurring', 'List instances of a recurring event', {
    eventId: z.string().describe('Recurring event ID'),
    calendarId: z.string().optional().describe('Calendar ID (default: "primary")'),
    timeMin: z.string().optional().describe('Start of range (ISO 8601)'),
    timeMax: z.string().optional().describe('End of range (ISO 8601)'),
  }, async ({ eventId, calendarId = 'primary', timeMin, timeMax }) => {
    try {
      const email = await resolveEmail();
      const cal = await getCalendarService(email);
      const params: Record<string, unknown> = { calendarId, eventId };
      if (timeMin) params.timeMin = timeMin;
      if (timeMax) params.timeMax = timeMax;
      const res = await cal.events.instances(params as any);
      const instances = res.data.items ?? [];
      if (!instances.length) return toolResult('No instances found for this recurring event.');
      const lines: string[] = [`${instances.length} instance(s) of recurring event:`];
      for (const ev of instances) {
        const start = ev.start?.dateTime ?? ev.start?.date ?? '';
        const end = ev.end?.dateTime ?? ev.end?.date ?? '';
        lines.push(`\n[${ev.id}] ${ev.summary ?? '(no title)'}`);
        lines.push(`  ${start} → ${end}`);
        if (ev.status && ev.status !== 'confirmed') lines.push(`  Status: ${ev.status}`);
      }
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  log.info(MCP, 'calendar', 'register', 'Registered 9 Calendar tools');
}
