import puppeteer from "puppeteer-core";
import * as fs from "fs";
const CHROME_PATHS = {
    darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ],
    linux: [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ],
    win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    ],
};
export function detectChromePath() {
    const candidates = CHROME_PATHS[process.platform] ?? [];
    for (const p of candidates) {
        if (fs.existsSync(p))
            return p;
    }
    throw new Error(`Chrome not found on ${process.platform}. Use --chrome-path to specify the executable.`);
}
export class BrowserManager {
    browser = null;
    config;
    constructor(config) {
        this.config = config;
    }
    async getBrowser() {
        if (!this.browser || !this.browser.connected) {
            this.browser = await puppeteer.launch({
                executablePath: this.config.chromePath,
                headless: this.config.headless,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-blink-features=AutomationControlled",
                    "--window-size=1440,900",
                ],
                defaultViewport: { width: 1440, height: 900 },
            });
        }
        return this.browser;
    }
    async newPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        // Mask automation
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, "webdriver", { get: () => undefined });
        });
        await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36");
        return page;
    }
    async screenshot(url, scrollY, waitMs, fullPage) {
        const page = await this.newPage();
        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
            if (waitMs > 0)
                await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
            await new Promise((r) => setTimeout(r, waitMs));
            if (scrollY > 0) {
                await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), scrollY);
                await new Promise((r) => setTimeout(r, 800));
            }
            const title = await page.title();
            const png = await page.screenshot({ type: "png", fullPage });
            return { png, title };
        }
        finally {
            await page.close();
        }
    }
    async scrollCapture(url, frames, scrollStep, waitBetweenMs, outputDir) {
        if (!fs.existsSync(outputDir))
            fs.mkdirSync(outputDir, { recursive: true });
        const page = await this.newPage();
        const savedPaths = [];
        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
            await new Promise((r) => setTimeout(r, 1500));
            for (let i = 0; i < frames; i++) {
                const scrollY = i * scrollStep;
                await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), scrollY);
                await new Promise((r) => setTimeout(r, waitBetweenMs));
                const timestamp = Date.now();
                const filePath = `${outputDir}/frame-${String(i + 1).padStart(3, "0")}-scroll${scrollY}-${timestamp}.png`;
                await page.screenshot({ type: "png", path: filePath });
                savedPaths.push(filePath);
            }
        }
        finally {
            await page.close();
        }
        return savedPaths;
    }
    async getSource(url, waitMs, includeStyles) {
        const page = await this.newPage();
        try {
            await page.goto(url, { waitUntil: "networkidle2", timeout: 30_000 });
            await new Promise((r) => setTimeout(r, waitMs));
            const html = await page.content();
            if (!includeStyles)
                return html;
            // Extract animation-related CSS from computed styles of key elements
            const animationCss = await page.evaluate(() => {
                const rules = [];
                for (const sheet of Array.from(document.styleSheets)) {
                    try {
                        for (const rule of Array.from(sheet.cssRules)) {
                            const text = rule.cssText;
                            if (text.includes("animation") ||
                                text.includes("transition") ||
                                text.includes("transform") ||
                                text.includes("@keyframes") ||
                                text.includes("scroll")) {
                                rules.push(text);
                            }
                        }
                    }
                    catch {
                        // Cross-origin stylesheet — skip
                    }
                }
                return rules.join("\n\n");
            });
            return `<!-- PAGE SOURCE -->\n${html}\n\n<!-- ANIMATION/TRANSITION CSS -->\n<style>\n${animationCss}\n</style>`;
        }
        finally {
            await page.close();
        }
    }
    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
