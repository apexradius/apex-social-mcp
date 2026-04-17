import type { EmailMessage, EmailThread, GmailProfile, GmailLabel } from "./types.js";
export declare function getProfile(email: string): Promise<GmailProfile>;
export declare function searchMessages(email: string, query: string, maxResults?: number): Promise<EmailMessage[]>;
export declare function readMessage(email: string, messageId: string): Promise<EmailMessage>;
export declare function readThread(email: string, threadId: string): Promise<EmailThread>;
export declare function listLabels(email: string): Promise<GmailLabel[]>;
export declare function sendEmail(email: string, to: string, subject: string, body: string, cc?: string, bcc?: string): Promise<{
    id: string;
    threadId: string;
}>;
export declare function createDraft(email: string, to: string, subject: string, body: string, cc?: string, bcc?: string): Promise<{
    draftId: string;
    messageId: string;
    threadId: string;
}>;
export declare function replyToMessage(email: string, messageId: string, body: string): Promise<{
    id: string;
    threadId: string;
}>;
