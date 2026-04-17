export function formatError(e) {
    if (e instanceof Error)
        return e.message;
    if (typeof e === "string")
        return e;
    try {
        return JSON.stringify(e, null, 2);
    }
    catch {
        return String(e);
    }
}
export function toolResult(text) {
    return { content: [{ type: "text", text: text.trim() || "Done." }] };
}
export function toolError(e) {
    return { content: [{ type: "text", text: formatError(e) }], isError: true };
}
export function imageResult(caption, pngBase64) {
    return {
        content: [
            { type: "text", text: caption },
            { type: "image", data: pngBase64, mimeType: "image/png" },
        ],
    };
}
export function expandHome(p) {
    if (p.startsWith("~/")) {
        return `${process.env["HOME"] ?? ""}/${p.slice(2)}`;
    }
    return p;
}
