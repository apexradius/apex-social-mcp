/**
 * Google Search Console tools — 18 tools (rewritten from Python mcp-gsc).
 *
 * Properties (3): gsc_list_properties, gsc_add_site, gsc_delete_site
 * Search Analytics (4): gsc_search_analytics, gsc_advanced_search_analytics, gsc_compare_periods, gsc_search_by_page
 * URL Inspection (3): gsc_inspect_url, gsc_batch_inspect, gsc_check_indexing
 * Performance (2): gsc_performance_overview, gsc_site_details
 * Sitemaps (6): gsc_list_sitemaps, gsc_list_sitemaps_enhanced, gsc_sitemap_details, gsc_submit_sitemap, gsc_delete_sitemap, gsc_manage_sitemaps
 */
import { z } from 'zod';
import { toolResult, toolError, log } from '@apexradius/apex-mcp-shared';
import { getGscService, getDataState, ALLOW_DESTRUCTIVE, siteNotFoundError, daysAgo, today } from '../services/gsc/client.js';
const MCP = 'apex-social-mcp';
const siteUrlZ = z.string().min(1).describe('Exact GSC property URL from gsc_list_properties (e.g. "https://example.com/" or "sc-domain:example.com")');
export function registerGscTools(server) {
    // === Properties ===
    server.tool('gsc_list_properties', 'List all Search Console properties accessible by the service account', {}, async () => {
        try {
            const svc = getGscService();
            const res = await svc.sites.list();
            const sites = res.data.siteEntry ?? [];
            if (!sites.length)
                return toolResult('No Search Console properties found.');
            const lines = sites.map(s => `- ${s.siteUrl} (${s.permissionLevel})`);
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_add_site', 'Add a site to Search Console properties (requires GSC_ALLOW_DESTRUCTIVE=true)', {
        site_url: siteUrlZ,
    }, async ({ site_url }) => {
        if (!ALLOW_DESTRUCTIVE)
            return toolError('Safety: set GSC_ALLOW_DESTRUCTIVE=true to enable this tool.');
        try {
            const svc = getGscService();
            await svc.sites.add({ siteUrl: site_url });
            return toolResult(`Site ${site_url} added to Search Console.`);
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_delete_site', 'Remove a site from Search Console properties (requires GSC_ALLOW_DESTRUCTIVE=true)', {
        site_url: siteUrlZ,
    }, async ({ site_url }) => {
        if (!ALLOW_DESTRUCTIVE)
            return toolError('Safety: set GSC_ALLOW_DESTRUCTIVE=true to enable this tool.');
        try {
            const svc = getGscService();
            await svc.sites.delete({ siteUrl: site_url });
            return toolResult(`Site ${site_url} removed from Search Console.`);
        }
        catch (e) {
            return toolError(e);
        }
    });
    // === Search Analytics ===
    server.tool('gsc_search_analytics', 'Get search analytics data (clicks, impressions, CTR, position) for a property', {
        site_url: siteUrlZ,
        days: z.number().optional().describe('Days to look back (default: 28)'),
        dimensions: z.string().optional().describe('Comma-separated: query, page, device, country, date (default: query)'),
        row_limit: z.number().optional().describe('Rows to return (default: 20, max: 500)'),
    }, async ({ site_url, days = 28, dimensions = 'query', row_limit = 20 }) => {
        try {
            const svc = getGscService();
            const dimList = dimensions.split(',').map(d => d.trim());
            const res = await svc.searchanalytics.query({
                siteUrl: site_url,
                requestBody: {
                    startDate: daysAgo(days), endDate: today(),
                    dimensions: dimList, rowLimit: Math.min(Math.max(1, row_limit), 500),
                    dataState: getDataState(),
                },
            });
            const rows = res.data.rows ?? [];
            if (!rows.length)
                return toolResult(`No data for ${site_url} in last ${days} days.`);
            const header = [...dimList.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Clicks', 'Impressions', 'CTR', 'Position'];
            const lines = [
                `Search analytics for ${site_url} (last ${days} days):`, '-'.repeat(80),
                header.join(' | '), '-'.repeat(80),
                ...rows.map(r => [
                    ...(r.keys ?? []).map(k => (k ?? '').slice(0, 100)),
                    String(r.clicks ?? 0), String(r.impressions ?? 0),
                    `${((r.ctr ?? 0) * 100).toFixed(2)}%`, (r.position ?? 0).toFixed(1),
                ].join(' | ')),
            ];
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_advanced_search_analytics', 'Advanced search analytics with sorting, filtering, pagination', {
        site_url: siteUrlZ,
        start_date: z.string().optional().describe('YYYY-MM-DD (default: 28 days ago)'),
        end_date: z.string().optional().describe('YYYY-MM-DD (default: today)'),
        dimensions: z.string().optional().describe('Comma-separated dimensions (default: query)'),
        search_type: z.string().optional().describe('WEB, IMAGE, VIDEO, NEWS, DISCOVER (default: WEB)'),
        row_limit: z.number().optional().describe('Max rows (default: 1000, max: 25000)'),
        start_row: z.number().optional().describe('Starting row for pagination (default: 0)'),
        sort_by: z.string().optional().describe('clicks, impressions, ctr, position (default: clicks)'),
        sort_direction: z.string().optional().describe('ascending or descending (default: descending)'),
        filter_dimension: z.string().optional().describe('Filter dimension: query, page, country, device'),
        filter_operator: z.string().optional().describe('contains, equals, notContains, notEquals'),
        filter_expression: z.string().optional().describe('Filter value'),
        filters: z.string().optional().describe('JSON array of filter objects for multi-filter (overrides single filter)'),
        data_state: z.string().optional().describe("'all' (default) or 'final'"),
    }, async ({ site_url, start_date, end_date, dimensions = 'query', search_type = 'WEB', row_limit = 1000, start_row = 0, sort_by = 'clicks', sort_direction = 'descending', filter_dimension, filter_operator = 'contains', filter_expression, filters, data_state }) => {
        try {
            const svc = getGscService();
            const sd = start_date ?? daysAgo(28);
            const ed = end_date ?? today();
            const dimList = dimensions.split(',').map(d => d.trim());
            const resolvedDs = (data_state ?? getDataState()).toLowerCase();
            const body = {
                startDate: sd, endDate: ed, dimensions: dimList,
                rowLimit: Math.min(row_limit, 25000), startRow: start_row,
                searchType: search_type.toUpperCase(), dataState: resolvedDs,
            };
            const metricMap = { clicks: 'CLICK_COUNT', impressions: 'IMPRESSION_COUNT', ctr: 'CTR', position: 'POSITION' };
            if (sort_by && metricMap[sort_by]) {
                body.orderBy = [{ metric: metricMap[sort_by], direction: sort_direction.toLowerCase() }];
            }
            if (filters) {
                try {
                    const fl = JSON.parse(filters);
                    if (!Array.isArray(fl) || !fl.length)
                        return toolError('filters must be a non-empty JSON array');
                    body.dimensionFilterGroups = [{ filters: fl }];
                }
                catch {
                    return toolError('Invalid filters JSON');
                }
            }
            else if (filter_dimension && filter_expression) {
                body.dimensionFilterGroups = [{ filters: [{ dimension: filter_dimension, operator: filter_operator, expression: filter_expression }] }];
            }
            const res = await svc.searchanalytics.query({ siteUrl: site_url, requestBody: body });
            const rows = res.data.rows ?? [];
            if (!rows.length)
                return toolResult(`No data for ${site_url} with specified parameters.`);
            const header = [...dimList.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Clicks', 'Impressions', 'CTR', 'Position'];
            const lines = [
                `Search analytics for ${site_url} (${sd} to ${ed}):`,
                `Rows ${start_row + 1}-${start_row + rows.length} (sorted by ${sort_by} ${sort_direction})`,
                '-'.repeat(80), header.join(' | '), '-'.repeat(80),
                ...rows.map(r => [
                    ...(r.keys ?? []).map(k => (k ?? '').slice(0, 100)),
                    String(r.clicks ?? 0), String(r.impressions ?? 0),
                    `${((r.ctr ?? 0) * 100).toFixed(2)}%`, (r.position ?? 0).toFixed(1),
                ].join(' | ')),
            ];
            if (rows.length === row_limit)
                lines.push(`\nMore results may be available. Use start_row: ${start_row + row_limit}`);
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_compare_periods', 'Compare search analytics between two time periods', {
        site_url: siteUrlZ,
        period1_start: z.string().describe('Period 1 start (YYYY-MM-DD)'),
        period1_end: z.string().describe('Period 1 end'),
        period2_start: z.string().describe('Period 2 start'),
        period2_end: z.string().describe('Period 2 end'),
        dimensions: z.string().optional().describe('Comma-separated (default: query)'),
        limit: z.number().optional().describe('Rows per period (default: 10)'),
    }, async ({ site_url, period1_start, period1_end, period2_start, period2_end, dimensions = 'query', limit = 10 }) => {
        try {
            const svc = getGscService();
            const dimList = dimensions.split(',').map(d => d.trim());
            const makeReq = (sd, ed) => svc.searchanalytics.query({
                siteUrl: site_url,
                requestBody: { startDate: sd, endDate: ed, dimensions: dimList, rowLimit: limit, dataState: getDataState() },
            });
            const [r1, r2] = await Promise.all([makeReq(period1_start, period1_end), makeReq(period2_start, period2_end)]);
            const rows1 = r1.data.rows ?? [];
            const rows2 = r2.data.rows ?? [];
            // Build lookup for period 2
            const p2Map = new Map();
            for (const r of rows2)
                p2Map.set((r.keys ?? []).join('|'), r);
            const lines = [
                `Comparison: ${period1_start}–${period1_end} vs ${period2_start}–${period2_end}`,
                '-'.repeat(80),
                `${dimensions} | P1 Clicks | P2 Clicks | Δ | P1 Pos | P2 Pos`,
                '-'.repeat(80),
            ];
            for (const r of rows1) {
                const key = (r.keys ?? []).join('|');
                const p2 = p2Map.get(key);
                const c1 = r.clicks ?? 0, c2 = p2?.clicks ?? 0;
                const pos1 = (r.position ?? 0).toFixed(1), pos2 = (p2?.position ?? 0).toFixed(1);
                const delta = c1 - c2;
                const sign = delta > 0 ? '+' : '';
                lines.push(`${key.slice(0, 60)} | ${c1} | ${c2} | ${sign}${delta} | ${pos1} | ${pos2}`);
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_search_by_page', 'Get search queries for a specific page URL', {
        site_url: siteUrlZ,
        page_url: z.string().min(1).describe('The specific page URL to analyze'),
        days: z.number().optional().describe('Days to look back (default: 28)'),
        row_limit: z.number().optional().describe('Rows (default: 20, max: 500)'),
    }, async ({ site_url, page_url, days = 28, row_limit = 20 }) => {
        try {
            const svc = getGscService();
            const res = await svc.searchanalytics.query({
                siteUrl: site_url,
                requestBody: {
                    startDate: daysAgo(days), endDate: today(), dimensions: ['query'],
                    dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'equals', expression: page_url }] }],
                    rowLimit: Math.min(Math.max(1, row_limit), 500),
                    dataState: getDataState(),
                },
            });
            const rows = res.data.rows ?? [];
            if (!rows.length)
                return toolResult(`No search data for ${page_url} in last ${days} days.`);
            const lines = [
                `Queries for ${page_url} (last ${days} days):`, '-'.repeat(80),
                'Query | Clicks | Impressions | CTR | Position', '-'.repeat(80),
                ...rows.map(r => `${(r.keys?.[0] ?? '').slice(0, 100)} | ${r.clicks ?? 0} | ${r.impressions ?? 0} | ${((r.ctr ?? 0) * 100).toFixed(2)}% | ${(r.position ?? 0).toFixed(1)}`),
            ];
            const totalClicks = rows.reduce((s, r) => s + (r.clicks ?? 0), 0);
            const totalImpr = rows.reduce((s, r) => s + (r.impressions ?? 0), 0);
            lines.push('-'.repeat(80), `TOTAL | ${totalClicks} | ${totalImpr} | ${totalImpr ? ((totalClicks / totalImpr) * 100).toFixed(2) : '0.00'}% | -`);
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    // === URL Inspection ===
    server.tool('gsc_inspect_url', 'Inspect a URL for indexing status, crawl info, and rich results', {
        site_url: siteUrlZ,
        page_url: z.string().min(1).describe('URL to inspect'),
    }, async ({ site_url, page_url }) => {
        try {
            const svc = getGscService();
            const res = await svc.urlInspection.index.inspect({ requestBody: { inspectionUrl: page_url, siteUrl: site_url } });
            const insp = res.data.inspectionResult;
            if (!insp)
                return toolResult(`No inspection data for ${page_url}.`);
            const idx = insp.indexStatusResult ?? {};
            const lines = [
                `URL Inspection for ${page_url}:`, '-'.repeat(80),
                `Indexing: ${idx.verdict ?? 'UNKNOWN'}`,
                idx.coverageState ? `Coverage: ${idx.coverageState}` : '',
                idx.lastCrawlTime ? `Last Crawled: ${idx.lastCrawlTime}` : '',
                idx.pageFetchState ? `Page Fetch: ${idx.pageFetchState}` : '',
                idx.robotsTxtState ? `Robots.txt: ${idx.robotsTxtState}` : '',
                idx.indexingState ? `Indexing State: ${idx.indexingState}` : '',
                idx.googleCanonical ? `Google Canonical: ${idx.googleCanonical}` : '',
                idx.crawledAs ? `Crawled As: ${idx.crawledAs}` : '',
            ].filter(Boolean);
            const rich = insp.richResultsResult;
            if (rich) {
                lines.push(`\nRich Results: ${rich.verdict ?? 'UNKNOWN'}`);
                for (const item of rich.detectedItems ?? []) {
                    lines.push(`- ${item.richResultType}`);
                }
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_batch_inspect', 'Inspect multiple URLs in batch (max 10)', {
        site_url: siteUrlZ,
        urls: z.string().describe('URLs to inspect, one per line'),
    }, async ({ site_url, urls }) => {
        try {
            const svc = getGscService();
            const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean);
            if (!urlList.length)
                return toolError('No URLs provided.');
            if (urlList.length > 10)
                return toolError('Max 10 URLs per batch.');
            const results = [];
            for (const url of urlList) {
                try {
                    const res = await svc.urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl: site_url } });
                    const idx = res.data.inspectionResult?.indexStatusResult ?? {};
                    results.push(`${url}:\n  Status: ${idx.verdict ?? 'UNKNOWN'} - ${idx.coverageState ?? '?'}\n  Last Crawl: ${idx.lastCrawlTime ?? 'Never'}\n`);
                }
                catch (e) {
                    results.push(`${url}: Error - ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            return toolResult(`Batch Inspection for ${site_url}:\n\n${results.join('\n')}`);
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_check_indexing', 'Check indexing issues across multiple URLs', {
        site_url: siteUrlZ,
        urls: z.string().describe('URLs to check, one per line'),
    }, async ({ site_url, urls }) => {
        try {
            const svc = getGscService();
            const urlList = urls.split('\n').map(u => u.trim()).filter(Boolean);
            if (!urlList.length)
                return toolError('No URLs provided.');
            if (urlList.length > 10)
                return toolError('Max 10 URLs per batch.');
            const issues = [];
            let okCount = 0;
            for (const url of urlList) {
                try {
                    const res = await svc.urlInspection.index.inspect({ requestBody: { inspectionUrl: url, siteUrl: site_url } });
                    const idx = res.data.inspectionResult?.indexStatusResult ?? {};
                    const verdict = idx.verdict ?? 'UNKNOWN';
                    if (verdict === 'PASS') {
                        okCount++;
                        continue;
                    }
                    issues.push(`${url}: ${verdict} — ${idx.coverageState ?? 'unknown reason'}`);
                }
                catch (e) {
                    issues.push(`${url}: Error — ${e instanceof Error ? e.message : String(e)}`);
                }
            }
            const lines = [`Indexing check for ${site_url}: ${okCount}/${urlList.length} OK`];
            if (issues.length)
                lines.push('\nIssues found:', ...issues);
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    // === Performance ===
    server.tool('gsc_performance_overview', 'Get a performance overview with daily trend data', {
        site_url: siteUrlZ,
        days: z.number().optional().describe('Days to look back (default: 28)'),
    }, async ({ site_url, days = 28 }) => {
        try {
            const svc = getGscService();
            const sd = daysAgo(days), ed = today();
            const [totals, daily] = await Promise.all([
                svc.searchanalytics.query({ siteUrl: site_url, requestBody: { startDate: sd, endDate: ed, dimensions: [], rowLimit: 1, dataState: getDataState() } }),
                svc.searchanalytics.query({ siteUrl: site_url, requestBody: { startDate: sd, endDate: ed, dimensions: ['date'], rowLimit: days, dataState: getDataState() } }),
            ]);
            const t = totals.data.rows?.[0];
            const lines = [`Performance for ${site_url} (last ${days} days):`, '-'.repeat(80)];
            if (t) {
                lines.push(`Total Clicks: ${(t.clicks ?? 0).toLocaleString()}`, `Total Impressions: ${(t.impressions ?? 0).toLocaleString()}`, `Avg CTR: ${((t.ctr ?? 0) * 100).toFixed(2)}%`, `Avg Position: ${(t.position ?? 0).toFixed(1)}`);
            }
            const dRows = (daily.data.rows ?? []).sort((a, b) => (a.keys?.[0] ?? '').localeCompare(b.keys?.[0] ?? ''));
            if (dRows.length) {
                lines.push('\nDaily Trend:', 'Date | Clicks | Impressions | CTR | Position', '-'.repeat(80));
                for (const r of dRows) {
                    const d = r.keys?.[0] ?? '';
                    lines.push(`${d.slice(5)} | ${r.clicks ?? 0} | ${r.impressions ?? 0} | ${((r.ctr ?? 0) * 100).toFixed(2)}% | ${(r.position ?? 0).toFixed(1)}`);
                }
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_site_details', 'Get detailed information about a Search Console property', {
        site_url: siteUrlZ,
    }, async ({ site_url }) => {
        try {
            const svc = getGscService();
            const res = await svc.sites.get({ siteUrl: site_url });
            const info = res.data;
            return toolResult([
                `Site details for ${site_url}:`, '-'.repeat(50),
                `Permission: ${info.permissionLevel ?? 'Unknown'}`,
            ].join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    // === Sitemaps ===
    server.tool('gsc_list_sitemaps', 'List sitemaps for a property', {
        site_url: siteUrlZ,
    }, async ({ site_url }) => {
        try {
            const svc = getGscService();
            const res = await svc.sitemaps.list({ siteUrl: site_url });
            const maps = res.data.sitemap ?? [];
            if (!maps.length)
                return toolResult(`No sitemaps for ${site_url}.`);
            const lines = [`Sitemaps for ${site_url}:`, '-'.repeat(80), 'Path | Last Downloaded | Errors'];
            for (const s of maps) {
                lines.push(`${s.path} | ${s.lastDownloaded ?? 'Never'} | ${s.errors ?? 0}`);
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            if (String(e).includes('404'))
                return toolError(siteNotFoundError(site_url));
            return toolError(e);
        }
    });
    server.tool('gsc_list_sitemaps_enhanced', 'List sitemaps with detailed info (type, URLs, warnings)', {
        site_url: siteUrlZ,
        sitemap_index: z.string().optional().describe('Sitemap index URL to list child sitemaps'),
    }, async ({ site_url, sitemap_index }) => {
        try {
            const svc = getGscService();
            const params = { siteUrl: site_url };
            if (sitemap_index)
                params.sitemapIndex = sitemap_index;
            const res = await svc.sitemaps.list(params);
            const maps = res.data.sitemap ?? [];
            if (!maps.length)
                return toolResult(`No sitemaps found.`);
            const lines = [`Sitemaps for ${site_url}:`, '-'.repeat(100), 'Path | Last Downloaded | Type | URLs | Errors | Warnings', '-'.repeat(100)];
            for (const s of maps) {
                const type = s.isSitemapsIndex ? 'Index' : 'Sitemap';
                const urls = s.contents?.find(c => c.type === 'web')?.submitted ?? 'N/A';
                lines.push(`${s.path} | ${s.lastDownloaded ?? 'Never'} | ${type} | ${urls} | ${s.errors ?? 0} | ${s.warnings ?? 0}`);
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_sitemap_details', 'Get detailed info about a specific sitemap', {
        site_url: siteUrlZ,
        sitemap_url: z.string().min(1).describe('Full URL of the sitemap'),
    }, async ({ site_url, sitemap_url }) => {
        try {
            const svc = getGscService();
            const res = await svc.sitemaps.get({ siteUrl: site_url, feedpath: sitemap_url });
            const d = res.data;
            const lines = [`Sitemap: ${sitemap_url}`, '-'.repeat(80),
                `Type: ${d.isSitemapsIndex ? 'Index' : 'Sitemap'}`,
                `Status: ${d.isPending ? 'Pending' : 'Processed'}`,
                `Errors: ${d.errors ?? 0}`, `Warnings: ${d.warnings ?? 0}`];
            if (d.contents?.length) {
                lines.push('\nContent:');
                for (const c of d.contents)
                    lines.push(`- ${(c.type ?? '?').toUpperCase()}: ${c.submitted ?? 0} submitted, ${c.indexed ?? 'N/A'} indexed`);
            }
            return toolResult(lines.join('\n'));
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_submit_sitemap', 'Submit or resubmit a sitemap to Google', {
        site_url: siteUrlZ,
        sitemap_url: z.string().min(1).describe('Full URL of the sitemap'),
    }, async ({ site_url, sitemap_url }) => {
        try {
            const svc = getGscService();
            await svc.sitemaps.submit({ siteUrl: site_url, feedpath: sitemap_url });
            return toolResult(`Sitemap submitted: ${sitemap_url}\nGoogle will queue it for processing.`);
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_delete_sitemap', 'Delete a sitemap from Search Console (requires GSC_ALLOW_DESTRUCTIVE=true)', {
        site_url: siteUrlZ,
        sitemap_url: z.string().min(1).describe('Full URL of the sitemap'),
    }, async ({ site_url, sitemap_url }) => {
        if (!ALLOW_DESTRUCTIVE)
            return toolError('Safety: set GSC_ALLOW_DESTRUCTIVE=true to enable this tool.');
        try {
            const svc = getGscService();
            await svc.sitemaps.delete({ siteUrl: site_url, feedpath: sitemap_url });
            return toolResult(`Sitemap deleted: ${sitemap_url}`);
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool('gsc_manage_sitemaps', 'All-in-one sitemap management (list, details, submit, delete)', {
        site_url: siteUrlZ,
        action: z.enum(['list', 'details', 'submit', 'delete']).describe('Action to perform'),
        sitemap_url: z.string().optional().describe('Sitemap URL (required for details/submit/delete)'),
        sitemap_index: z.string().optional().describe('Sitemap index URL (only for list)'),
    }, async ({ site_url, action, sitemap_url, sitemap_index }) => {
        if (['details', 'submit', 'delete'].includes(action) && !sitemap_url) {
            return toolError(`${action} requires sitemap_url parameter.`);
        }
        // Delegate to individual tools - they handle their own errors
        try {
            const svc = getGscService();
            if (action === 'list') {
                const params = { siteUrl: site_url };
                if (sitemap_index)
                    params.sitemapIndex = sitemap_index;
                const res = await svc.sitemaps.list(params);
                const maps = res.data.sitemap ?? [];
                if (!maps.length)
                    return toolResult('No sitemaps found.');
                return toolResult(maps.map(s => `${s.path} | ${s.lastDownloaded ?? 'Never'} | errors: ${s.errors ?? 0}`).join('\n'));
            }
            if (action === 'details') {
                const res = await svc.sitemaps.get({ siteUrl: site_url, feedpath: sitemap_url });
                return toolResult(JSON.stringify(res.data, null, 2));
            }
            if (action === 'submit') {
                await svc.sitemaps.submit({ siteUrl: site_url, feedpath: sitemap_url });
                return toolResult(`Submitted: ${sitemap_url}`);
            }
            if (action === 'delete') {
                if (!ALLOW_DESTRUCTIVE)
                    return toolError('Safety: set GSC_ALLOW_DESTRUCTIVE=true');
                await svc.sitemaps.delete({ siteUrl: site_url, feedpath: sitemap_url });
                return toolResult(`Deleted: ${sitemap_url}`);
            }
            return toolError('Invalid action');
        }
        catch (e) {
            return toolError(e);
        }
    });
    log.info(MCP, 'gsc', 'register', 'Registered 18 GSC tools');
}
