export interface AccountConfig {
    email: string;
    label: string;
    addedAt: string;
}
export interface TokenData {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
    token_type: string;
    scope: string;
}
export interface StoredAccount {
    config: AccountConfig;
    tokens: TokenData;
}
export interface EmailMessage {
    id: string;
    threadId: string;
    account: string;
    from: string;
    to: string;
    subject: string;
    date: string;
    snippet: string;
    body?: string;
    labelIds: string[];
    isUnread: boolean;
    hasAttachment: boolean;
}
export interface SearchResult {
    account: string;
    messages: EmailMessage[];
    total: number;
}
export interface AggregatedSearchResult {
    accounts_searched: string[];
    accounts_failed: FailedAccount[];
    total_messages: number;
    messages: EmailMessage[];
}
export interface FailedAccount {
    email: string;
    error: string;
}
export interface ThreadMessage {
    id: string;
    from: string;
    to: string;
    date: string;
    body: string;
    snippet: string;
}
export interface EmailThread {
    id: string;
    account: string;
    subject: string;
    messages: ThreadMessage[];
}
export interface GmailProfile {
    email: string;
    messagesTotal: number;
    threadsTotal: number;
    historyId: string;
}
export interface GmailLabel {
    id: string;
    name: string;
    type: string;
    messagesTotal: number;
    messagesUnread: number;
    threadsTotal: number;
    threadsUnread: number;
}
