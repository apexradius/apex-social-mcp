/**
 * Google Analytics 4 tools — 9 tools for GA4 reporting via service account.
 *
 * Discovery (1): ga4_list_properties
 * Reports (4): ga4_report, ga4_realtime, ga4_top_pages, ga4_traffic_sources
 * Insights (4): ga4_user_demographics, ga4_conversions, ga4_engagement, ga4_compare_periods
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerGa4Tools(server: McpServer): void;
