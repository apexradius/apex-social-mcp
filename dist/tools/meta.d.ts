/**
 * Meta (Facebook/Instagram) tools — 17 tools.
 * Rewritten from mcp-meta-social compiled dist/ to TypeScript.
 *
 * Posts (4): meta_create_post, meta_list_posts, meta_delete_post, meta_schedule_post
 * Media (2): meta_upload_media, meta_create_carousel
 * Comments (3): meta_list_comments, meta_reply_comment, meta_list_messages
 * Analytics (3): meta_page_insights, meta_post_performance, meta_audience_demographics
 * Ads (5): meta_create_campaign, meta_create_adset, meta_create_ad, meta_pause_campaign, meta_campaign_analytics
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MetaClient } from '../services/meta/client.js';
export declare function registerMetaTools(server: McpServer, client: MetaClient): void;
