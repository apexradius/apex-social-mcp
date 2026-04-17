import { z } from "zod";
import { imageResult, toolError, toolResult } from "../utils.js";
export function registerBrowseTools(server, browser) {
    server.tool("social_screenshot", "Take a screenshot of any social media page or website. Supports scrolling to reveal content and animations.", {
        url: z.string().min(1).describe("URL to screenshot (Instagram, TikTok, YouTube, or any website)"),
        scroll_to: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe("Scroll to this Y position in pixels before screenshotting (default 0 = top)"),
        wait_ms: z
            .number()
            .int()
            .min(0)
            .max(10000)
            .optional()
            .describe("Milliseconds to wait after page load for animations to render (default 2000)"),
        full_page: z
            .boolean()
            .optional()
            .describe("Capture full scrollable page height (default false — viewport only)"),
    }, async ({ url, scroll_to = 0, wait_ms = 2000, full_page = false }) => {
        try {
            const { png, title } = await browser.screenshot(url, scroll_to, wait_ms, full_page);
            const caption = `Screenshot: ${title}\nURL: ${url}\nScroll: ${scroll_to}px | Wait: ${wait_ms}ms | Full page: ${full_page}`;
            return imageResult(caption, png.toString("base64"));
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool("social_scroll_capture", "Scroll through a page and capture a sequence of screenshots to study scroll animations, parallax effects, and motion design.", {
        url: z
            .string()
            .min(1)
            .describe("URL to capture (any website with scroll animations)"),
        frames: z
            .number()
            .int()
            .min(2)
            .max(20)
            .optional()
            .describe("Number of frames to capture (default 6)"),
        scroll_step: z
            .number()
            .int()
            .min(100)
            .optional()
            .describe("Pixels to scroll between each frame (default 600)"),
        wait_between_ms: z
            .number()
            .int()
            .min(100)
            .max(5000)
            .optional()
            .describe("Milliseconds to wait between frames for animations to settle (default 600)"),
    }, async ({ url, frames = 6, scroll_step = 600, wait_between_ms = 600 }) => {
        try {
            // Find the download dir from the browser config indirectly by using a standard location
            const outputDir = `${process.env["HOME"] ?? ""}/Downloads/apex-social/captures/${Date.now()}`;
            const paths = await browser.scrollCapture(url, frames, scroll_step, wait_between_ms, outputDir);
            const text = [
                `Scroll capture complete: ${paths.length} frames saved`,
                `URL: ${url}`,
                `Scroll step: ${scroll_step}px | Wait between frames: ${wait_between_ms}ms`,
                ``,
                `Saved frames:`,
                ...paths.map((p, i) => `  ${i + 1}. ${p}`),
                ``,
                `Use the Read tool on any frame path to view the image.`,
            ].join("\n");
            return toolResult(text);
        }
        catch (e) {
            return toolError(e);
        }
    });
    server.tool("social_get_source", "Fetch the full page source of any social page or website, including animation and transition CSS extracted from stylesheets. Use this to study how scroll animations and video effects are built.", {
        url: z.string().min(1).describe("URL to fetch source from"),
        wait_ms: z
            .number()
            .int()
            .min(0)
            .max(10000)
            .optional()
            .describe("Milliseconds to wait for JS to execute before capturing source (default 3000)"),
        include_styles: z
            .boolean()
            .optional()
            .describe("Extract and append animation/transition CSS rules (default true)"),
    }, async ({ url, wait_ms = 3000, include_styles = true }) => {
        try {
            const source = await browser.getSource(url, wait_ms, include_styles);
            const truncated = source.length > 50_000
                ? source.slice(0, 50_000) + "\n\n... (truncated at 50KB — use a specific selector to get less)"
                : source;
            return toolResult(`Source for ${url} (${source.length.toLocaleString()} chars):\n\n${truncated}`);
        }
        catch (e) {
            return toolError(e);
        }
    });
}
