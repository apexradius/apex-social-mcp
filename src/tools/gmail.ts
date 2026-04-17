/**
 * Gmail tools — 10 tools for multi-account Gmail management.
 * Migrated from gmail-mcp v2.0.0.
 *
 * Account management (2): gmail_list_accounts, gmail_remove_account
 * Search/read (4): gmail_search, gmail_search_all, gmail_read_message, gmail_read_thread
 * Write (4): gmail_send, gmail_reply, gmail_create_draft, gmail_list_labels
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { toolResult, toolError, log } from '@apexradius/apex-mcp-shared';
import { listAccounts, removeAccount } from '../services/gmail/token-store.js';
import { getProfile, searchMessages, readMessage, readThread, sendEmail, replyToMessage, createDraft, listLabels } from '../services/gmail/gmail-client.js';
import { isAuthError } from '../services/gmail/auth.js';

const MCP = 'apex-social-mcp';

export function registerGmailTools(server: McpServer): void {

  server.tool('gmail_list_accounts', 'List all connected Gmail accounts with status', {},
    async () => {
      try {
        const accounts = await listAccounts();
        if (accounts.length === 0) return toolResult('No Gmail accounts connected. Run setup to add accounts.');

        const enriched = await Promise.allSettled(
          accounts.map(async (a) => {
            try {
              const profile = await getProfile(a.email);
              return `${a.email} (${a.label}) — ${profile.messagesTotal?.toLocaleString() ?? '?'} messages`;
            } catch (err) {
              return `${a.email} (${a.label}) — ${isAuthError(err) ? 'AUTH ERROR (re-auth needed)' : String(err)}`;
            }
          }),
        );

        return toolResult(enriched.map(r => r.status === 'fulfilled' ? r.value : 'unknown error').join('\n'));
      } catch (e) { return toolError(e); }
    },
  );

  server.tool('gmail_remove_account', 'Disconnect a Gmail account and delete stored tokens', {
    email: z.string().email().describe('Gmail address to disconnect'),
  }, async ({ email }) => {
    try {
      const removed = await removeAccount(email);
      return removed
        ? toolResult(`Account removed: ${email}`)
        : toolError(`Account not found: ${email}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_search', 'Search for emails in a specific Gmail account', {
    account_email: z.string().email().describe('Gmail address to search in'),
    query: z.string().min(1).describe('Gmail search query (same syntax as Gmail search box)'),
    max_results: z.number().optional().describe('Max results (default: 10)'),
  }, async ({ account_email, query, max_results = 10 }) => {
    try {
      const messages = await searchMessages(account_email, query, max_results);
      if (messages.length === 0) return toolResult(`No results for "${query}" in ${account_email}`);
      const lines = messages.map(m =>
        `[${m.id}] ${m.date} | From: ${m.from} | Subject: ${m.subject}`,
      );
      return toolResult(`Found ${messages.length} messages:\n${lines.join('\n')}`);
    } catch (e) {
      if (isAuthError(e)) return toolError(`Auth error for ${account_email}. Re-auth needed.`);
      return toolError(e);
    }
  });

  server.tool('gmail_search_all', 'Search for emails across ALL connected Gmail accounts', {
    query: z.string().min(1).describe('Gmail search query'),
    max_results: z.number().optional().describe('Max results per account (default: 5)'),
  }, async ({ query, max_results = 5 }) => {
    try {
      const accounts = await listAccounts();
      if (accounts.length === 0) return toolResult('No accounts connected.');

      const results = await Promise.allSettled(
        accounts.map(async (a) => {
          const messages = await searchMessages(a.email, query, max_results);
          return { email: a.email, messages };
        }),
      );

      const lines: string[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') {
          const { email, messages } = r.value;
          lines.push(`\n--- ${email} (${messages.length} results) ---`);
          for (const m of messages) {
            lines.push(`[${m.id}] ${m.date} | From: ${m.from} | ${m.subject}`);
          }
        }
      }
      return toolResult(lines.join('\n') || 'No results found.');
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_read_message', 'Read a specific email message by ID', {
    account_email: z.string().email().describe('Gmail account'),
    message_id: z.string().min(1).describe('Message ID'),
  }, async ({ account_email, message_id }) => {
    try {
      const msg = await readMessage(account_email, message_id);
      return toolResult([
        `From: ${msg.from}`, `To: ${msg.to}`, `Subject: ${msg.subject}`,
        `Date: ${msg.date}`, `Labels: ${msg.labelIds?.join(', ') ?? 'none'}`,
        '', msg.body,
      ].join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_read_thread', 'Read an entire email thread by thread ID', {
    account_email: z.string().email().describe('Gmail account'),
    thread_id: z.string().min(1).describe('Thread ID'),
  }, async ({ account_email, thread_id }) => {
    try {
      const thread = await readThread(account_email, thread_id);
      const lines: string[] = [`Thread: ${thread.subject} (${thread.messages.length} messages)\n`];
      for (const m of thread.messages) {
        lines.push(`--- ${m.from} | ${m.date} ---`);
        lines.push(m.body);
        lines.push('');
      }
      return toolResult(lines.join('\n'));
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_send', 'Send a new email', {
    account_email: z.string().email().describe('Gmail account to send from'),
    to: z.string().min(1).describe('Recipient email(s), comma separated'),
    subject: z.string().min(1).describe('Email subject'),
    body: z.string().min(1).describe('Email body (plain text or HTML)'),
    cc: z.string().optional().describe('CC recipients'),
    bcc: z.string().optional().describe('BCC recipients'),
  }, async ({ account_email, to, subject, body, cc, bcc }) => {
    try {
      const result = await sendEmail(account_email, to, subject, body, cc, bcc);
      return toolResult(`Email sent from ${account_email}. Message ID: ${result.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_reply', 'Reply to an existing email message', {
    account_email: z.string().email().describe('Gmail account'),
    message_id: z.string().min(1).describe('Message ID to reply to'),
    body: z.string().min(1).describe('Reply body'),
    reply_all: z.boolean().optional().describe('Reply to all recipients (default: false)'),
  }, async ({ account_email, message_id, body, reply_all }) => {
    try {
      const result = await replyToMessage(account_email, message_id, body);
      return toolResult(`Reply sent. Message ID: ${result.id}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_create_draft', 'Create a draft email (does not send)', {
    account_email: z.string().email().describe('Gmail account'),
    to: z.string().min(1).describe('Recipient'),
    subject: z.string().min(1).describe('Subject'),
    body: z.string().min(1).describe('Body'),
  }, async ({ account_email, to, subject, body }) => {
    try {
      const result = await createDraft(account_email, to, subject, body);
      return toolResult(`Draft created. Draft ID: ${result.draftId}`);
    } catch (e) { return toolError(e); }
  });

  server.tool('gmail_list_labels', 'List all labels/folders for a Gmail account', {
    account_email: z.string().email().describe('Gmail account'),
  }, async ({ account_email }) => {
    try {
      const labels = await listLabels(account_email);
      return toolResult(labels.map(l => `${l.name} (${l.type})`).join('\n'));
    } catch (e) { return toolError(e); }
  });

  log.info(MCP, 'gmail', 'register', 'Registered 10 Gmail tools');
}

export async function isGmailAvailable(): Promise<boolean> {
  try {
    const clientId = process.env['GMAIL_CLIENT_ID'];
    const clientSecret = process.env['GMAIL_CLIENT_SECRET'];
    if (!clientId || !clientSecret) return false;
    const accounts = await listAccounts();
    return accounts.length > 0;
  } catch {
    return false;
  }
}
