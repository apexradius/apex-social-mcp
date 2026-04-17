/**
 * Gmail tools — 10 tools for multi-account Gmail management.
 * Migrated from gmail-mcp v2.0.0.
 *
 * Account management (2): gmail_list_accounts, gmail_remove_account
 * Search/read (4): gmail_search, gmail_search_all, gmail_read_message, gmail_read_thread
 * Write (4): gmail_send, gmail_reply, gmail_create_draft, gmail_list_labels
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
export declare function registerGmailTools(server: McpServer): void;
export declare function isGmailAvailable(): Promise<boolean>;
