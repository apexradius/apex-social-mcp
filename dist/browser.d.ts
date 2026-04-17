import type { Browser, Page } from "puppeteer-core";
export interface BrowserConfig {
    chromePath: string;
    headless: boolean;
    downloadDir: string;
}
export declare function detectChromePath(): string;
export declare class BrowserManager {
    private browser;
    private config;
    constructor(config: BrowserConfig);
    getBrowser(): Promise<Browser>;
    newPage(): Promise<Page>;
    screenshot(url: string, scrollY: number, waitMs: number, fullPage: boolean): Promise<{
        png: Buffer;
        title: string;
    }>;
    scrollCapture(url: string, frames: number, scrollStep: number, waitBetweenMs: number, outputDir: string): Promise<string[]>;
    getSource(url: string, waitMs: number, includeStyles: boolean): Promise<string>;
    close(): Promise<void>;
}
