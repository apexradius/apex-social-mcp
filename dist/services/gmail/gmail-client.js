import { gmail as gmailApi } from "@googleapis/gmail";
import { getAuthenticatedClient } from "./auth.js";
// ============================================================
// Gmail Client — wraps Gmail API calls per account
// ============================================================
function extractHeader(headers, name) {
    return headers.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}
function decodeBody(part) {
    if (part.body?.data) {
        return Buffer.from(part.body.data, "base64").toString("utf-8");
    }
    if (part.parts && Array.isArray(part.parts)) {
        for (const p of part.parts) {
            const text = decodeBody(p);
            if (text)
                return text;
        }
    }
    return "";
}
/**
 * Encodes a raw RFC 2822 email string for the Gmail API.
 * Returns a URL-safe base64-encoded string.
 */
function encodeRawEmail(raw) {
    return Buffer.from(raw, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}
/**
 * Builds an RFC 2822 formatted email string.
 */
function buildRawEmail(opts) {
    const lines = [];
    lines.push(`From: ${opts.from}`);
    lines.push(`To: ${opts.to}`);
    if (opts.cc)
        lines.push(`Cc: ${opts.cc}`);
    if (opts.bcc)
        lines.push(`Bcc: ${opts.bcc}`);
    lines.push(`Subject: ${opts.subject}`);
    if (opts.inReplyTo)
        lines.push(`In-Reply-To: ${opts.inReplyTo}`);
    if (opts.references)
        lines.push(`References: ${opts.references}`);
    lines.push("MIME-Version: 1.0");
    lines.push("Content-Type: text/plain; charset=UTF-8");
    lines.push("");
    lines.push(opts.body);
    return lines.join("\r\n");
}
export async function getProfile(email) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const { data } = await gmail.users.getProfile({ userId: "me" });
    return {
        email: data.emailAddress ?? email,
        messagesTotal: data.messagesTotal ?? 0,
        threadsTotal: data.threadsTotal ?? 0,
        historyId: data.historyId ?? ""
    };
}
export async function searchMessages(email, query, maxResults = 20) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const listRes = await gmail.users.messages.list({
        userId: "me",
        q: query,
        maxResults
    });
    const messageRefs = listRes.data.messages ?? [];
    if (messageRefs.length === 0)
        return [];
    // Fetch full message details in parallel (batched to avoid rate limits)
    const BATCH = 10;
    const messages = [];
    for (let i = 0; i < messageRefs.length; i += BATCH) {
        const batch = messageRefs.slice(i, i + BATCH);
        const fetched = await Promise.all(batch.map(ref => gmail.users.messages.get({
            userId: "me",
            id: ref.id,
            format: "full"
        })));
        for (const res of fetched) {
            const msg = res.data;
            const headers = msg.payload?.headers ?? [];
            const hasAttachment = (msg.payload?.parts ?? []).some(p => p.filename && p.filename.length > 0);
            messages.push({
                id: msg.id ?? "",
                threadId: msg.threadId ?? "",
                account: email,
                from: extractHeader(headers, "from"),
                to: extractHeader(headers, "to"),
                subject: extractHeader(headers, "subject"),
                date: extractHeader(headers, "date"),
                snippet: msg.snippet ?? "",
                body: decodeBody(msg.payload),
                labelIds: msg.labelIds ?? [],
                isUnread: (msg.labelIds ?? []).includes("UNREAD"),
                hasAttachment
            });
        }
    }
    return messages;
}
export async function readMessage(email, messageId) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const { data: msg } = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full"
    });
    const headers = msg.payload?.headers ?? [];
    const hasAttachment = (msg.payload?.parts ?? []).some(p => p.filename && p.filename.length > 0);
    return {
        id: msg.id ?? "",
        threadId: msg.threadId ?? "",
        account: email,
        from: extractHeader(headers, "from"),
        to: extractHeader(headers, "to"),
        subject: extractHeader(headers, "subject"),
        date: extractHeader(headers, "date"),
        snippet: msg.snippet ?? "",
        body: decodeBody(msg.payload),
        labelIds: msg.labelIds ?? [],
        isUnread: (msg.labelIds ?? []).includes("UNREAD"),
        hasAttachment
    };
}
export async function readThread(email, threadId) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const { data: thread } = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full"
    });
    const msgs = (thread.messages ?? []).map(msg => {
        const headers = msg.payload?.headers ?? [];
        return {
            id: msg.id ?? "",
            from: extractHeader(headers, "from"),
            to: extractHeader(headers, "to"),
            date: extractHeader(headers, "date"),
            snippet: msg.snippet ?? "",
            body: decodeBody(msg.payload)
        };
    });
    const firstHeaders = thread.messages?.[0]?.payload?.headers ?? [];
    const subject = extractHeader(firstHeaders, "subject");
    return {
        id: thread.id ?? "",
        account: email,
        subject,
        messages: msgs
    };
}
export async function listLabels(email) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const { data } = await gmail.users.labels.list({ userId: "me" });
    const labels = data.labels ?? [];
    return labels.map(l => ({
        id: l.id ?? "",
        name: l.name ?? "",
        type: l.type ?? "user",
        messagesTotal: l.messagesTotal ?? 0,
        messagesUnread: l.messagesUnread ?? 0,
        threadsTotal: l.threadsTotal ?? 0,
        threadsUnread: l.threadsUnread ?? 0
    }));
}
export async function sendEmail(email, to, subject, body, cc, bcc) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const raw = buildRawEmail({ from: email, to, subject, body, cc, bcc });
    const encoded = encodeRawEmail(raw);
    const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw: encoded }
    });
    return {
        id: data.id ?? "",
        threadId: data.threadId ?? ""
    };
}
export async function createDraft(email, to, subject, body, cc, bcc) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    const raw = buildRawEmail({ from: email, to, subject, body, cc, bcc });
    const encoded = encodeRawEmail(raw);
    const { data } = await gmail.users.drafts.create({
        userId: "me",
        requestBody: {
            message: { raw: encoded }
        }
    });
    return {
        draftId: data.id ?? "",
        messageId: data.message?.id ?? "",
        threadId: data.message?.threadId ?? ""
    };
}
export async function replyToMessage(email, messageId, body) {
    const auth = await getAuthenticatedClient(email);
    const gmail = gmailApi({ version: "v1", auth });
    // Fetch original message to get reply headers
    const { data: original } = await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "metadata",
        metadataHeaders: ["From", "To", "Subject", "Message-ID", "References"]
    });
    const headers = original.payload?.headers ?? [];
    const originalFrom = extractHeader(headers, "from");
    const originalSubject = extractHeader(headers, "subject");
    const originalMessageId = extractHeader(headers, "message-id");
    const originalReferences = extractHeader(headers, "references");
    const threadId = original.threadId ?? "";
    // Reply goes to the original sender
    const replyTo = originalFrom;
    const replySubject = originalSubject.startsWith("Re:") ? originalSubject : `Re: ${originalSubject}`;
    const references = originalReferences
        ? `${originalReferences} ${originalMessageId}`
        : originalMessageId;
    const raw = buildRawEmail({
        from: email,
        to: replyTo,
        subject: replySubject,
        body,
        inReplyTo: originalMessageId,
        references
    });
    const encoded = encodeRawEmail(raw);
    const { data } = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: encoded,
            threadId
        }
    });
    return {
        id: data.id ?? "",
        threadId: data.threadId ?? ""
    };
}
