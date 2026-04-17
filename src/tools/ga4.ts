/**
 * Google Analytics 4 tools — 9 tools for GA4 reporting via service account.
 *
 * Discovery (1): ga4_list_properties
 * Reports (4): ga4_report, ga4_realtime, ga4_top_pages, ga4_traffic_sources
 * Insights (4): ga4_user_demographics, ga4_conversions, ga4_engagement, ga4_compare_periods
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult, toolError, log } from '@apexradius/apex-mcp-shared';
import {
  getGa4DataService,
  getGa4AdminService,
  resolvePropertyId,
  formatPropertyName,
  listGa4Accounts,
} from '../services/ga4/client.js';

const MCP = 'apex-social-mcp';

const dateRangeSchema = z.object({
  startDate: z.string().describe('Start date (YYYY-MM-DD or "7daysAgo", "30daysAgo", "yesterday", "today")'),
  endDate: z.string().describe('End date (YYYY-MM-DD or "today", "yesterday")'),
});

interface ReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
}

function parseReportResponse(
  data: Record<string, unknown>,
  dimensionNames: string[],
  metricNames: string[],
): { rows: ReportRow[]; rowCount: number } {
  const rawRows = (data.rows ?? []) as Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;

  const rows: ReportRow[] = rawRows.map(r => {
    const dimensions: Record<string, string> = {};
    const metrics: Record<string, string> = {};
    (r.dimensionValues ?? []).forEach((v, i) => {
      dimensions[dimensionNames[i] ?? `dim${i}`] = v.value ?? '';
    });
    (r.metricValues ?? []).forEach((v, i) => {
      metrics[metricNames[i] ?? `met${i}`] = v.value ?? '';
    });
    return { dimensions, metrics };
  });

  return { rows, rowCount: (data.rowCount as number) ?? rows.length };
}

function formatRows(rows: ReportRow[], dimNames: string[], metNames: string[]): string {
  if (!rows.length) return 'No data returned.';

  const header = [...dimNames, ...metNames].join(' | ');
  const sep = '-'.repeat(Math.min(header.length, 100));
  const lines = [header, sep];

  for (const row of rows) {
    const parts = [
      ...dimNames.map(d => (row.dimensions[d] ?? '').slice(0, 60)),
      ...metNames.map(m => row.metrics[m] ?? '0'),
    ];
    lines.push(parts.join(' | '));
  }
  return lines.join('\n');
}

export function registerGa4Tools(server: McpServer): void {

  server.tool('ga4_list_accounts', 'List configured GA4 accounts (multi-account support)', {},
    async () => {
      try {
        const accounts = listGa4Accounts();
        if (!accounts.length) return toolResult('No GA4 accounts configured.\nSet up ~/.ga4-mcp/accounts.json or GSC_CREDENTIALS_PATH + GA4_PROPERTY_ID env vars.');
        const lines = ['Configured GA4 Accounts:', ''];
        for (const a of accounts) {
          const marker = a.isDefault ? ' (default)' : '';
          lines.push(`  ${a.name}${marker} — property: ${a.defaultPropertyId ?? 'not set'}`);
        }
        return toolResult(lines.join('\n'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool('ga4_list_properties', 'List GA4 properties accessible by the service account', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json (default: first/default account)'),
  },
    async ({ account }) => {
      try {
        const admin = getGa4AdminService(account);
        const res = await admin.accountSummaries.list();
        const summaries = (res as any).data?.accountSummaries ?? [];
        if (!summaries.length) return toolResult('No GA4 accounts/properties found for this service account.');

        const lines: string[] = ['GA4 Properties:'];
        for (const acct of summaries) {
          lines.push(`\nAccount: ${acct.displayName ?? 'unnamed'} (${acct.account ?? '?'})`);
          const props = acct.propertySummaries ?? [];
          for (const p of props) {
            const propId = (p.property as string)?.replace('properties/', '') ?? '?';
            lines.push(`  - ${p.displayName ?? 'unnamed'} (ID: ${propId})`);
          }
        }
        return toolResult(lines.join('\n'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool('ga4_report', 'Run a custom GA4 report with arbitrary dimensions and metrics', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID (falls back to account default or GA4_PROPERTY_ID env)'),
    dimensions: z.array(z.string()).describe('Dimension names (e.g. ["pagePath", "sessionSource"])'),
    metrics: z.array(z.string()).describe('Metric names (e.g. ["sessions", "screenPageViews"])'),
    dateRange: dateRangeSchema.describe('Date range for the report'),
    limit: z.number().optional().describe('Max rows (default: 100)'),
    offset: z.number().optional().describe('Row offset for pagination (default: 0)'),
  }, async ({ account, propertyId, dimensions, metrics, dateRange, limit = 100, offset = 0 }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const res = await svc.properties.runReport({
        property: prop,
        requestBody: {
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dateRanges: [dateRange],
          limit: String(limit),
          offset: String(offset),
        },
      });
      const parsed = parseReportResponse(res.data as unknown as Record<string, unknown>, dimensions, metrics);
      const lines = [
        `GA4 Report (${dateRange.startDate} → ${dateRange.endDate})`,
        `Rows: ${parsed.rows.length} of ${parsed.rowCount}`,
        '-'.repeat(80),
        formatRows(parsed.rows, dimensions, metrics),
      ];
      if (parsed.rows.length < parsed.rowCount) {
        lines.push(`\nMore rows available. Use offset: ${offset + limit}`);
      }
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_realtime', 'Get real-time GA4 data (active users right now)', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    metrics: z.array(z.string()).describe('Metric names (e.g. ["activeUsers", "screenPageViews"])'),
    dimensions: z.array(z.string()).optional().describe('Dimension names (e.g. ["pagePath", "unifiedScreenName"])'),
  }, async ({ account, propertyId, metrics, dimensions }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const body: Record<string, unknown> = {
        metrics: metrics.map(m => ({ name: m })),
      };
      if (dimensions?.length) body.dimensions = dimensions.map(d => ({ name: d }));

      const res = await svc.properties.runRealtimeReport({
        property: prop,
        requestBody: body as any,
      });
      const dimNames = dimensions ?? [];
      const parsed = parseReportResponse(res.data as unknown as Record<string, unknown>, dimNames, metrics);
      const lines = [
        'GA4 Real-Time Report',
        '-'.repeat(80),
        formatRows(parsed.rows, dimNames, metrics),
      ];
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_top_pages', 'Get top pages by sessions', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    dateRange: dateRangeSchema.describe('Date range'),
    limit: z.number().optional().describe('Max pages (default: 20)'),
  }, async ({ account, propertyId, dateRange, limit = 20 }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const dimensions = ['pagePath', 'pageTitle'];
      const metrics = ['sessions', 'screenPageViews', 'averageSessionDuration', 'bounceRate'];
      const res = await svc.properties.runReport({
        property: prop,
        requestBody: {
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dateRanges: [dateRange],
          limit: String(limit),
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        },
      });
      const parsed = parseReportResponse(res.data as unknown as Record<string, unknown>, dimensions, metrics);
      const lines = [
        `Top Pages (${dateRange.startDate} → ${dateRange.endDate})`,
        '-'.repeat(80),
        formatRows(parsed.rows, dimensions, metrics),
      ];
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_traffic_sources', 'Get traffic acquisition sources/channels', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    dateRange: dateRangeSchema.describe('Date range'),
  }, async ({ account, propertyId, dateRange }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const dimensions = ['sessionSource', 'sessionMedium', 'sessionDefaultChannelGroup'];
      const metrics = ['sessions', 'totalUsers', 'newUsers', 'bounceRate', 'averageSessionDuration'];
      const res = await svc.properties.runReport({
        property: prop,
        requestBody: {
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dateRanges: [dateRange],
          limit: '50',
          orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
        },
      });
      const parsed = parseReportResponse(res.data as unknown as Record<string, unknown>, dimensions, metrics);
      const lines = [
        `Traffic Sources (${dateRange.startDate} → ${dateRange.endDate})`,
        '-'.repeat(80),
        formatRows(parsed.rows, dimensions, metrics),
      ];
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_user_demographics', 'Get user demographics (age, gender, geo, device)', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    dateRange: dateRangeSchema.describe('Date range'),
  }, async ({ account, propertyId, dateRange }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const metrics = ['totalUsers', 'sessions'];

      // Run 4 dimension reports in parallel
      const [geoRes, deviceRes, ageRes, genderRes] = await Promise.all([
        svc.properties.runReport({
          property: prop,
          requestBody: {
            dimensions: [{ name: 'country' }, { name: 'city' }],
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [dateRange],
            limit: '20',
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          },
        }),
        svc.properties.runReport({
          property: prop,
          requestBody: {
            dimensions: [{ name: 'deviceCategory' }, { name: 'operatingSystem' }],
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [dateRange],
            limit: '20',
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          },
        }),
        svc.properties.runReport({
          property: prop,
          requestBody: {
            dimensions: [{ name: 'userAgeBracket' }],
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [dateRange],
            limit: '10',
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          },
        }),
        svc.properties.runReport({
          property: prop,
          requestBody: {
            dimensions: [{ name: 'userGender' }],
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [dateRange],
            limit: '10',
            orderBys: [{ metric: { metricName: 'totalUsers' }, desc: true }],
          },
        }),
      ]);

      const geo = parseReportResponse(geoRes.data as unknown as Record<string, unknown>, ['country', 'city'], metrics);
      const device = parseReportResponse(deviceRes.data as unknown as Record<string, unknown>, ['deviceCategory', 'operatingSystem'], metrics);
      const age = parseReportResponse(ageRes.data as unknown as Record<string, unknown>, ['userAgeBracket'], metrics);
      const gender = parseReportResponse(genderRes.data as unknown as Record<string, unknown>, ['userGender'], metrics);

      const lines = [
        `User Demographics (${dateRange.startDate} → ${dateRange.endDate})`,
        '\n=== Geography (Top 20) ===',
        formatRows(geo.rows, ['country', 'city'], metrics),
        '\n=== Devices ===',
        formatRows(device.rows, ['deviceCategory', 'operatingSystem'], metrics),
        '\n=== Age ===',
        formatRows(age.rows, ['userAgeBracket'], metrics),
        '\n=== Gender ===',
        formatRows(gender.rows, ['userGender'], metrics),
      ];
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_conversions', 'Get conversion/goal completion data', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    dateRange: dateRangeSchema.describe('Date range'),
  }, async ({ account, propertyId, dateRange }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));
      const dimensions = ['eventName'];
      const metrics = ['eventCount', 'totalUsers', 'eventCountPerUser'];
      const res = await svc.properties.runReport({
        property: prop,
        requestBody: {
          dimensions: dimensions.map(d => ({ name: d })),
          metrics: metrics.map(m => ({ name: m })),
          dateRanges: [dateRange],
          dimensionFilter: {
            filter: {
              fieldName: 'eventName',
              inListFilter: {
                values: [
                  'purchase', 'sign_up', 'generate_lead', 'add_to_cart',
                  'begin_checkout', 'add_payment_info', 'first_open',
                  'conversion', 'submit_lead_form', 'contact',
                ],
              },
            },
          },
          limit: '50',
          orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
        },
      });
      const parsed = parseReportResponse(res.data as unknown as Record<string, unknown>, dimensions, metrics);
      if (!parsed.rows.length) {
        return toolResult(`No conversion events found for ${dateRange.startDate} → ${dateRange.endDate}.\nTip: Check that your GA4 property has conversion events configured.`);
      }
      const lines = [
        `Conversions (${dateRange.startDate} → ${dateRange.endDate})`,
        '-'.repeat(80),
        formatRows(parsed.rows, dimensions, metrics),
      ];
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_engagement', 'Get engagement metrics (bounce rate, session duration, pages/session)', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    dateRange: dateRangeSchema.describe('Date range'),
  }, async ({ account, propertyId, dateRange }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));

      // Overall metrics + daily trend
      const [overallRes, dailyRes] = await Promise.all([
        svc.properties.runReport({
          property: prop,
          requestBody: {
            metrics: [
              { name: 'sessions' },
              { name: 'totalUsers' },
              { name: 'screenPageViews' },
              { name: 'screenPageViewsPerSession' },
              { name: 'averageSessionDuration' },
              { name: 'bounceRate' },
              { name: 'engagedSessions' },
              { name: 'engagementRate' },
            ],
            dateRanges: [dateRange],
          },
        }),
        svc.properties.runReport({
          property: prop,
          requestBody: {
            dimensions: [{ name: 'date' }],
            metrics: [
              { name: 'sessions' },
              { name: 'bounceRate' },
              { name: 'averageSessionDuration' },
              { name: 'screenPageViewsPerSession' },
            ],
            dateRanges: [dateRange],
            orderBys: [{ dimension: { dimensionName: 'date', orderType: 'ALPHANUMERIC' }, desc: false }],
            limit: '90',
          },
        }),
      ]);

      const overallMetrics = ['sessions', 'totalUsers', 'screenPageViews', 'screenPageViewsPerSession', 'averageSessionDuration', 'bounceRate', 'engagedSessions', 'engagementRate'];
      const overall = parseReportResponse(overallRes.data as unknown as Record<string, unknown>, [], overallMetrics);

      const lines = [
        `Engagement (${dateRange.startDate} → ${dateRange.endDate})`,
        '-'.repeat(80),
      ];

      if (overall.rows.length) {
        const m = overall.rows[0]!.metrics;
        lines.push(`Sessions: ${m.sessions ?? '0'}`);
        lines.push(`Users: ${m.totalUsers ?? '0'}`);
        lines.push(`Page Views: ${m.screenPageViews ?? '0'}`);
        lines.push(`Pages/Session: ${Number(m.screenPageViewsPerSession ?? 0).toFixed(2)}`);
        lines.push(`Avg Session Duration: ${Number(m.averageSessionDuration ?? 0).toFixed(1)}s`);
        lines.push(`Bounce Rate: ${(Number(m.bounceRate ?? 0) * 100).toFixed(1)}%`);
        lines.push(`Engaged Sessions: ${m.engagedSessions ?? '0'}`);
        lines.push(`Engagement Rate: ${(Number(m.engagementRate ?? 0) * 100).toFixed(1)}%`);
      }

      const dailyDims = ['date'];
      const dailyMets = ['sessions', 'bounceRate', 'averageSessionDuration', 'screenPageViewsPerSession'];
      const daily = parseReportResponse(dailyRes.data as unknown as Record<string, unknown>, dailyDims, dailyMets);
      if (daily.rows.length) {
        lines.push('\nDaily Trend:');
        lines.push(formatRows(daily.rows, dailyDims, dailyMets));
      }

      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('ga4_compare_periods', 'Compare metrics between two date periods side by side', {
    account: z.string().optional().describe('Account name from ~/.ga4-mcp/accounts.json'),
    propertyId: z.string().optional().describe('GA4 property ID'),
    period1: dateRangeSchema.describe('First period'),
    period2: dateRangeSchema.describe('Second period'),
    metrics: z.array(z.string()).describe('Metrics to compare (e.g. ["sessions", "totalUsers", "bounceRate"])'),
  }, async ({ account, propertyId, period1, period2, metrics }) => {
    try {
      const svc = getGa4DataService(account);
      const prop = formatPropertyName(resolvePropertyId(propertyId, account));

      const [res1, res2] = await Promise.all([
        svc.properties.runReport({
          property: prop,
          requestBody: {
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [period1],
          },
        }),
        svc.properties.runReport({
          property: prop,
          requestBody: {
            metrics: metrics.map(m => ({ name: m })),
            dateRanges: [period2],
          },
        }),
      ]);

      const p1 = parseReportResponse(res1.data as unknown as Record<string, unknown>, [], metrics);
      const p2 = parseReportResponse(res2.data as unknown as Record<string, unknown>, [], metrics);

      const p1Metrics = p1.rows[0]?.metrics ?? {};
      const p2Metrics = p2.rows[0]?.metrics ?? {};

      const lines = [
        `Period Comparison`,
        `P1: ${period1.startDate} → ${period1.endDate}`,
        `P2: ${period2.startDate} → ${period2.endDate}`,
        '-'.repeat(80),
        'Metric | P1 | P2 | Change | Change %',
        '-'.repeat(80),
      ];

      for (const m of metrics) {
        const v1 = Number(p1Metrics[m] ?? 0);
        const v2 = Number(p2Metrics[m] ?? 0);
        const delta = v1 - v2;
        const pct = v2 !== 0 ? ((delta / v2) * 100).toFixed(1) : 'N/A';
        const sign = delta > 0 ? '+' : '';
        lines.push(`${m} | ${v1.toLocaleString()} | ${v2.toLocaleString()} | ${sign}${delta.toLocaleString()} | ${typeof pct === 'string' && pct !== 'N/A' ? sign + pct + '%' : pct}`);
      }

      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  log.info(MCP, 'ga4', 'register', 'Registered 10 GA4 tools (multi-account)');
}
