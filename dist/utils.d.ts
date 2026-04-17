export interface ToolTextResult {
    [key: string]: unknown;
    content: Array<{
        type: "text";
        text: string;
    }>;
    isError?: boolean;
}
export interface ToolImageResult {
    [key: string]: unknown;
    content: Array<{
        type: "text";
        text: string;
    } | {
        type: "image";
        data: string;
        mimeType: "image/png" | "image/jpeg";
    }>;
}
export declare function formatError(e: unknown): string;
export declare function toolResult(text: string): ToolTextResult;
export declare function toolError(e: unknown): ToolTextResult;
export declare function imageResult(caption: string, pngBase64: string): ToolImageResult;
export declare function expandHome(p: string): string;
