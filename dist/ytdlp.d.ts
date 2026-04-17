export interface YtdlpConfig {
    binaryPath: string;
    downloadDir: string;
}
export interface VideoInfo {
    id: string;
    title: string;
    uploader: string;
    duration: number;
    viewCount?: number;
    likeCount?: number;
    description: string;
    uploadDate: string;
    thumbnail: string;
    url: string;
    platform: string;
    formats: number;
}
export interface SearchResult {
    id: string;
    title: string;
    url: string;
    uploader: string;
    duration: number;
    viewCount?: number;
    thumbnail: string;
}
export interface DownloadResult {
    filePath: string;
    title: string;
    platform: string;
    duration: number;
    fileSize: string;
}
export declare class YtdlpClient {
    private bin;
    private downloadDir;
    constructor(config: YtdlpConfig);
    private run;
    getInfo(url: string): Promise<string>;
    listFormats(url: string): Promise<string>;
    download(url: string, format?: string, audioOnly?: boolean): Promise<string>;
    search(query: string, platform?: "youtube" | "tiktok", limit?: number): Promise<string>;
    getTranscript(url: string, lang?: string): Promise<string>;
}
