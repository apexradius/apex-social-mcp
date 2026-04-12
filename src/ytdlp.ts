import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const execFileAsync = promisify(execFile);

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

function parseInfo(raw: Record<string, unknown>): VideoInfo {
  return {
    id: String(raw["id"] ?? ""),
    title: String(raw["title"] ?? ""),
    uploader: String(raw["uploader"] ?? raw["channel"] ?? raw["uploader_id"] ?? "unknown"),
    duration: Number(raw["duration"] ?? 0),
    viewCount: raw["view_count"] != null ? Number(raw["view_count"]) : undefined,
    likeCount: raw["like_count"] != null ? Number(raw["like_count"]) : undefined,
    description: String(raw["description"] ?? "").slice(0, 500),
    uploadDate: String(raw["upload_date"] ?? ""),
    thumbnail: String(raw["thumbnail"] ?? ""),
    url: String(raw["webpage_url"] ?? raw["url"] ?? ""),
    platform: String(raw["extractor_key"] ?? raw["extractor"] ?? ""),
    formats: Array.isArray(raw["formats"]) ? (raw["formats"] as unknown[]).length : 0,
  };
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

function formatViews(n: number | undefined): string {
  if (n == null) return "unknown";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function parseVtt(vtt: string): string {
  const lines = vtt.split("\n");
  const result: string[] = [];
  let prev = "";
  for (const line of lines) {
    const t = line.trim();
    if (!t || t === "WEBVTT" || t.includes("-->") || /^\d+$/.test(t) || t.startsWith("NOTE")) continue;
    const cleaned = t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
    if (cleaned && cleaned !== prev) {
      result.push(cleaned);
      prev = cleaned;
    }
  }
  return result.join(" ");
}

export class YtdlpClient {
  private bin: string;
  private downloadDir: string;

  constructor(config: YtdlpConfig) {
    this.bin = config.binaryPath;
    this.downloadDir = config.downloadDir;
    if (!fs.existsSync(this.downloadDir)) {
      fs.mkdirSync(this.downloadDir, { recursive: true });
    }
  }

  private async run(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(this.bin, args, { maxBuffer: 50 * 1024 * 1024 });
    return stdout;
  }

  async getInfo(url: string): Promise<string> {
    const stdout = await this.run(["--dump-json", "--no-playlist", url]);
    const raw = JSON.parse(stdout) as Record<string, unknown>;
    const info = parseInfo(raw);
    const date = info.uploadDate
      ? `${info.uploadDate.slice(0, 4)}-${info.uploadDate.slice(4, 6)}-${info.uploadDate.slice(6, 8)}`
      : "unknown";

    return [
      `Title: ${info.title}`,
      `Platform: ${info.platform}`,
      `Uploader: ${info.uploader}`,
      `Duration: ${formatDuration(info.duration)}`,
      `Views: ${formatViews(info.viewCount)}`,
      `Likes: ${formatViews(info.likeCount)}`,
      `Uploaded: ${date}`,
      `URL: ${info.url}`,
      `Thumbnail: ${info.thumbnail}`,
      `Formats available: ${info.formats}`,
      ``,
      `Description:`,
      info.description || "(none)",
    ].join("\n");
  }

  async listFormats(url: string): Promise<string> {
    const stdout = await this.run(["-F", "--no-playlist", url]);
    return stdout.trim();
  }

  async download(
    url: string,
    format = "bestvideo+bestaudio/best",
    audioOnly = false
  ): Promise<string> {
    const outputTemplate = path.join(this.downloadDir, "%(uploader)s - %(title)s.%(ext)s");
    const args = audioOnly
      ? ["-x", "--audio-format", "mp3", "-o", outputTemplate, "--no-playlist", url]
      : ["-f", format, "--merge-output-format", "mp4", "-o", outputTemplate, "--no-playlist", url];

    // Get title first for the result
    const infoOut = await this.run(["--dump-json", "--no-playlist", url]);
    const info = parseInfo(JSON.parse(infoOut) as Record<string, unknown>);

    await this.run(args);

    // Find the downloaded file (most recently modified in download dir)
    const files = fs.readdirSync(this.downloadDir)
      .map((f) => ({ f, t: fs.statSync(path.join(this.downloadDir, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);

    const latest = files[0];
    const filePath = latest ? path.join(this.downloadDir, latest.f) : this.downloadDir;
    const stat = latest ? fs.statSync(filePath) : null;
    const fileSize = stat ? `${(stat.size / 1024 / 1024).toFixed(1)} MB` : "unknown";

    return [
      `Downloaded: ${info.title}`,
      `Platform: ${info.platform}`,
      `Duration: ${formatDuration(info.duration)}`,
      `File size: ${fileSize}`,
      `Saved to: ${filePath}`,
    ].join("\n");
  }

  async search(
    query: string,
    platform: "youtube" | "tiktok" = "youtube",
    limit = 5
  ): Promise<string> {
    const prefix = platform === "tiktok" ? `ttsearch${limit}:` : `ytsearch${limit}:`;
    const stdout = await this.run(["--dump-json", "--flat-playlist", `${prefix}${query}`]);

    const results: SearchResult[] = stdout
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const raw = JSON.parse(line) as Record<string, unknown>;
        return {
          id: String(raw["id"] ?? ""),
          title: String(raw["title"] ?? ""),
          url: String(raw["url"] ?? raw["webpage_url"] ?? ""),
          uploader: String(raw["uploader"] ?? raw["channel"] ?? ""),
          duration: Number(raw["duration"] ?? 0),
          viewCount: raw["view_count"] != null ? Number(raw["view_count"]) : undefined,
          thumbnail: String(raw["thumbnail"] ?? ""),
        };
      });

    if (results.length === 0) return `No results found for "${query}" on ${platform}.`;

    const lines = results.map((r, i) =>
      [
        `${i + 1}. ${r.title}`,
        `   Uploader: ${r.uploader}  Duration: ${formatDuration(r.duration)}  Views: ${formatViews(r.viewCount)}`,
        `   URL: ${r.url}`,
      ].join("\n")
    );

    return [`Search: "${query}" on ${platform} (${results.length} results)`, "", ...lines].join("\n");
  }

  async getTranscript(url: string, lang = "en"): Promise<string> {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-social-"));
    const outputTemplate = path.join(tmpDir, "%(id)s");

    try {
      await this.run([
        "--write-auto-subs",
        "--sub-lang", lang,
        "--sub-format", "vtt",
        "--skip-download",
        "-o", outputTemplate,
        "--no-playlist",
        url,
      ]);

      const vttFiles = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".vtt"));
      if (vttFiles.length === 0) {
        return `No ${lang} subtitles/transcript available for this video.`;
      }

      const vtt = fs.readFileSync(path.join(tmpDir, vttFiles[0]!), "utf-8");
      const transcript = parseVtt(vtt);
      return transcript || "Transcript found but appears to be empty.";
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }
}
