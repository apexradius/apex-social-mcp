export interface ToolTextResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export interface ToolImageResult {
  [key: string]: unknown;
  content: Array<
    | { type: "text"; text: string }
    | { type: "image"; data: string; mimeType: "image/png" | "image/jpeg" }
  >;
}

export function formatError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try { return JSON.stringify(e, null, 2); } catch { return String(e); }
}

export function toolResult(text: string): ToolTextResult {
  return { content: [{ type: "text", text: text.trim() || "Done." }] };
}

export function toolError(e: unknown): ToolTextResult {
  return { content: [{ type: "text", text: formatError(e) }], isError: true };
}

export function imageResult(caption: string, pngBase64: string): ToolImageResult {
  return {
    content: [
      { type: "text", text: caption },
      { type: "image", data: pngBase64, mimeType: "image/png" },
    ],
  };
}

export function expandHome(p: string): string {
  if (p.startsWith("~/")) {
    return `${process.env["HOME"] ?? ""}/${p.slice(2)}`;
  }
  return p;
}
