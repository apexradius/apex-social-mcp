/**
 * Google Search Console tools — 18 tools (rewritten from Python mcp-gsc).
 *
 * Properties (3): gsc_list_properties, gsc_add_site, gsc_delete_site
 * Search Analytics (4): gsc_search_analytics, gsc_advanced_search_analytics, gsc_compare_periods, gsc_search_by_page
 * URL Inspection (3): gsc_inspect_url, gsc_batch_inspect, gsc_check_indexing
 * Performance (2): gsc_performance_overview, gsc_site_details
 * Sitemaps (6): gsc_list_sitemaps, gsc_list_sitemaps_enhanced, gsc_sitemap_details, gsc_submit_sitemap, gsc_delete_sitemap, gsc_manage_sitemaps
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerGscTools(server: McpServer): void;
