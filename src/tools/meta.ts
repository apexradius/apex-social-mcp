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

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult, toolError, log } from '@apexradius/apex-mcp-shared';
import type { MetaClient } from '../services/meta/client.js';

const MCP = 'apex-social-mcp';

export function registerMetaTools(server: McpServer, client: MetaClient): void {

  // === Posts ===
  server.tool('meta_create_post', 'Publish a text, image, or video post to Facebook Page or Instagram', {
    message: z.string().optional().describe('Post text/caption'),
    image_url: z.string().optional().describe('Image URL to post'),
    video_url: z.string().optional().describe('Video URL to post'),
    platform: z.enum(['facebook', 'instagram']).optional().describe('Target platform (default: facebook)'),
    link: z.string().optional().describe('Link to include in post'),
  }, async ({ message, image_url, video_url, platform = 'facebook', link }) => {
    try {
      if (platform === 'instagram') {
        const body: Record<string, unknown> = { caption: message };
        if (image_url) body.image_url = image_url;
        if (video_url) { body.video_url = video_url; body.media_type = 'VIDEO'; }
        const container = await client.post<{ id: string }>(`/${client.igAccountId}/media`, body);
        const published = await client.post<{ id: string }>(`/${client.igAccountId}/media_publish`, { creation_id: container.id });
        return toolResult(`Instagram post published. ID: ${published.id}`);
      }
      const body: Record<string, unknown> = {};
      if (message) body.message = message;
      if (image_url) body.url = image_url;
      if (link) body.link = link;
      const endpoint = image_url ? `/${client.pageId}/photos` : `/${client.pageId}/feed`;
      const result = await client.pagePost<{ id: string }>(endpoint, body);
      return toolResult(`Facebook post published. ID: ${result.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_list_posts', 'List recent posts from Facebook Page or Instagram with metrics', {
    platform: z.enum(['facebook', 'instagram']).optional(),
    limit: z.number().optional().describe('Number of posts (default: 10)'),
  }, async ({ platform = 'facebook', limit = 10 }) => {
    try {
      if (platform === 'instagram') {
        const r = await client.get<{ data: Array<{ id: string; caption?: string; timestamp: string; like_count?: number; comments_count?: number }> }>(
          `/${client.igAccountId}/media`, { fields: 'id,caption,timestamp,like_count,comments_count,media_type', limit },
        );
        const lines = r.data.map(p => `[${p.id}] ${p.timestamp} | Likes: ${p.like_count ?? 0} | ${p.caption?.slice(0, 60) ?? '(no caption)'}`);
        return toolResult(`Instagram posts (${r.data.length}):\n${lines.join('\n')}`);
      }
      const r = await client.pageGet<{ data: Array<{ id: string; message?: string; created_time: string }> }>(
        `/${client.pageId}/posts`, { fields: 'id,message,created_time,likes.summary(true),comments.summary(true)', limit },
      );
      const lines = r.data.map(p => `[${p.id}] ${p.created_time} | ${p.message?.slice(0, 60) ?? '(no message)'}`);
      return toolResult(`Facebook posts (${r.data.length}):\n${lines.join('\n')}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_delete_post', 'Delete a post by ID from Facebook or Instagram', {
    post_id: z.string().min(1).describe('Post ID to delete'),
  }, async ({ post_id }) => {
    try {
      await client.pageDel(`/${post_id}`);
      return toolResult(`Post deleted: ${post_id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_schedule_post', 'Schedule a post for future publication', {
    message: z.string().describe('Post text'),
    scheduled_publish_time: z.number().describe('Unix timestamp for publication'),
    image_url: z.string().optional(),
    platform: z.enum(['facebook']).optional().describe('Only Facebook supports scheduling via API'),
  }, async ({ message, scheduled_publish_time, image_url }) => {
    try {
      const body: Record<string, unknown> = { message, published: false, scheduled_publish_time };
      if (image_url) body.url = image_url;
      const endpoint = image_url ? `/${client.pageId}/photos` : `/${client.pageId}/feed`;
      const result = await client.pagePost<{ id: string }>(endpoint, body);
      return toolResult(`Post scheduled. ID: ${result.id}`);
    } catch (e) { return toolError(e); }
  });

  // === Media ===
  server.tool('meta_upload_media', 'Upload an image or video for use in posts or ads', {
    url: z.string().describe('Public URL of the media'),
    type: z.enum(['image', 'video']).optional().describe('Media type (default: image)'),
  }, async ({ url, type = 'image' }) => {
    try {
      if (type === 'image') {
        const r = await client.postForm<{ images: Record<string, { hash: string }> }>(`/${client.adAccountId}/adimages`, { filename: url });
        const hash = Object.values(r.images ?? {})[0]?.hash;
        return toolResult(hash ? `Image uploaded. Hash: ${hash}` : `Image uploaded. Response: ${JSON.stringify(r)}`);
      }
      const r = await client.post<{ id: string }>(`/${client.adAccountId}/advideos`, { file_url: url });
      return toolResult(`Video uploaded. ID: ${r.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_create_carousel', 'Create a multi-image carousel post on Instagram or Facebook', {
    images: z.array(z.string()).min(2).describe('Array of image URLs (2-10)'),
    caption: z.string().optional().describe('Carousel caption'),
    platform: z.enum(['facebook', 'instagram']).optional(),
  }, async ({ images, caption, platform = 'instagram' }) => {
    try {
      if (platform === 'instagram') {
        const containerIds: string[] = [];
        for (const img of images) {
          const c = await client.post<{ id: string }>(`/${client.igAccountId}/media`, { image_url: img, is_carousel_item: true });
          containerIds.push(c.id);
        }
        const carousel = await client.post<{ id: string }>(`/${client.igAccountId}/media`, { media_type: 'CAROUSEL', children: containerIds.join(','), caption });
        const pub = await client.post<{ id: string }>(`/${client.igAccountId}/media_publish`, { creation_id: carousel.id });
        return toolResult(`Instagram carousel published. ID: ${pub.id}`);
      }
      return toolError('Facebook carousel publishing requires the Marketing API');
    } catch (e) { return toolError(e); }
  });

  // === Comments ===
  server.tool('meta_list_comments', 'List comments on a Facebook or Instagram post', {
    post_id: z.string().min(1).describe('Post ID'),
    limit: z.number().optional(),
  }, async ({ post_id, limit = 25 }) => {
    try {
      const r = await client.pageGet<{ data: Array<{ id: string; message: string; from?: { name: string }; created_time: string }> }>(
        `/${post_id}/comments`, { fields: 'id,message,from,created_time', limit },
      );
      const lines = r.data.map(c => `[${c.id}] ${c.from?.name ?? 'Unknown'} (${c.created_time}): ${c.message}`);
      return toolResult(lines.length ? lines.join('\n') : 'No comments.');
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_reply_comment', 'Reply to a comment on a Facebook or Instagram post', {
    comment_id: z.string().min(1).describe('Comment ID to reply to'),
    message: z.string().min(1).describe('Reply text'),
  }, async ({ comment_id, message }) => {
    try {
      const r = await client.pagePost<{ id: string }>(`/${comment_id}/comments`, { message });
      return toolResult(`Reply posted. ID: ${r.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_list_messages', 'List conversations from the Facebook Page inbox (DMs)', {
    limit: z.number().optional(),
  }, async ({ limit = 10 }) => {
    try {
      const r = await client.pageGet<{ data: Array<{ id: string; updated_time: string; snippet?: string }> }>(
        `/${client.pageId}/conversations`, { fields: 'id,updated_time,snippet,participants', limit },
      );
      const lines = r.data.map(c => `[${c.id}] ${c.updated_time}: ${c.snippet ?? '(no preview)'}`);
      return toolResult(lines.length ? lines.join('\n') : 'No conversations.');
    } catch (e) { return toolError(e); }
  });

  // === Analytics ===
  server.tool('meta_page_insights', 'Get Facebook Page insights — followers, reach, impressions', {
    period: z.enum(['day', 'week', 'days_28']).optional().describe('Time period (default: day)'),
    metrics: z.string().optional().describe('Comma-separated metrics (default: page_impressions,page_engaged_users,page_fans)'),
  }, async ({ period = 'day', metrics = 'page_impressions,page_engaged_users,page_fans' }) => {
    try {
      const r = await client.pageGet<{ data: Array<{ name: string; values: Array<{ value: unknown }> }> }>(
        `/${client.pageId}/insights`, { metric: metrics, period },
      );
      const lines = r.data.map(m => `${m.name}: ${JSON.stringify(m.values?.[0]?.value)}`);
      return toolResult(lines.join('\n') || 'No insights data.');
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_post_performance', 'Get performance metrics for a specific post', {
    post_id: z.string().min(1).describe('Post ID'),
  }, async ({ post_id }) => {
    try {
      const r = await client.pageGet<{ data: Array<{ name: string; values: Array<{ value: unknown }> }> }>(
        `/${post_id}/insights`, { metric: 'post_impressions,post_engaged_users,post_reactions_by_type_total' },
      );
      const lines = r.data.map(m => `${m.name}: ${JSON.stringify(m.values?.[0]?.value)}`);
      return toolResult(lines.join('\n') || 'No metrics available.');
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_audience_demographics', 'Get audience demographics for Page or ad account', {
    source: z.enum(['page', 'ad_account']).optional(),
  }, async ({ source = 'page' }) => {
    try {
      if (source === 'page') {
        const r = await client.pageGet<{ data: Array<{ name: string; values: Array<{ value: unknown }> }> }>(
          `/${client.pageId}/insights`, { metric: 'page_fans_gender_age,page_fans_country,page_fans_city', period: 'lifetime' },
        );
        const lines = r.data.map(m => `${m.name}: ${JSON.stringify(m.values?.[0]?.value)}`);
        return toolResult(lines.join('\n') || 'No demographic data.');
      }
      const r = await client.get<{ data: Array<{ reach_estimate: { users: number } }> }>(
        `/${client.adAccountId}/reachestimate`, { targeting_spec: '{}' },
      );
      return toolResult(JSON.stringify(r, null, 2));
    } catch (e) { return toolError(e); }
  });

  // === Ads ===
  server.tool('meta_create_campaign', 'Create a new ad campaign in Meta Ads Manager', {
    name: z.string().min(1).describe('Campaign name'),
    objective: z.string().describe("Campaign objective (e.g. 'OUTCOME_AWARENESS', 'OUTCOME_TRAFFIC')"),
    daily_budget: z.number().optional().describe('Daily budget in cents'),
    status: z.enum(['ACTIVE', 'PAUSED']).optional().describe('Initial status (default: PAUSED)'),
  }, async ({ name, objective, daily_budget, status = 'PAUSED' }) => {
    try {
      const body: Record<string, unknown> = { name, objective, status, special_ad_categories: [] };
      if (daily_budget) body.daily_budget = daily_budget;
      const r = await client.post<{ id: string }>(`/${client.adAccountId}/campaigns`, body);
      return toolResult(`Campaign created. ID: ${r.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_create_adset', 'Create an ad set with targeting and budget', {
    campaign_id: z.string().min(1),
    name: z.string().min(1),
    daily_budget: z.number().describe('Daily budget in cents'),
    targeting: z.string().describe('Targeting spec JSON'),
    start_time: z.string().optional().describe('ISO datetime'),
    end_time: z.string().optional(),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  }, async ({ campaign_id, name, daily_budget, targeting, start_time, end_time, status = 'PAUSED' }) => {
    try {
      const body: Record<string, unknown> = { campaign_id, name, daily_budget, billing_event: 'IMPRESSIONS', optimization_goal: 'REACH', targeting: JSON.parse(targeting), status };
      if (start_time) body.start_time = start_time;
      if (end_time) body.end_time = end_time;
      const r = await client.post<{ id: string }>(`/${client.adAccountId}/adsets`, body);
      return toolResult(`Ad set created. ID: ${r.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_create_ad', 'Create an ad with creative within an ad set', {
    adset_id: z.string().min(1),
    name: z.string().min(1),
    creative: z.string().describe('Creative spec JSON'),
    status: z.enum(['ACTIVE', 'PAUSED']).optional(),
  }, async ({ adset_id, name, creative, status = 'PAUSED' }) => {
    try {
      const r = await client.post<{ id: string }>(`/${client.adAccountId}/ads`, { adset_id, name, creative: JSON.parse(creative), status });
      return toolResult(`Ad created. ID: ${r.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_pause_campaign', 'Pause or resume an ad campaign', {
    campaign_id: z.string().min(1),
    action: z.enum(['pause', 'activate']).describe("'pause' or 'activate'"),
  }, async ({ campaign_id, action }) => {
    try {
      const status = action === 'pause' ? 'PAUSED' : 'ACTIVE';
      await client.post(`/${campaign_id}`, { status });
      return toolResult(`Campaign ${campaign_id} ${action}d.`);
    } catch (e) { return toolError(e); }
  });

  server.tool('meta_campaign_analytics', 'Get performance analytics for ad campaigns', {
    campaign_id: z.string().optional().describe('Specific campaign ID (or all if omitted)'),
    date_preset: z.string().optional().describe("Date range (e.g. 'last_7d', 'last_30d', 'today')"),
  }, async ({ campaign_id, date_preset = 'last_7d' }) => {
    try {
      const path = campaign_id ? `/${campaign_id}/insights` : `/${client.adAccountId}/insights`;
      const r = await client.get<{ data: Array<Record<string, unknown>> }>(path, {
        fields: 'campaign_name,impressions,clicks,spend,cpc,ctr,reach,actions',
        date_preset, level: campaign_id ? undefined : 'campaign',
      });
      return toolResult(JSON.stringify(r.data, null, 2));
    } catch (e) { return toolError(e); }
  });

  log.info(MCP, 'meta', 'register', 'Registered 17 Meta tools');
}
