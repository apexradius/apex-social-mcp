#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserManager, detectChromePath } from "./browser.js";
import { YtdlpClient } from "./ytdlp.js";
import { expandHome } from "./utils.js";
import { registerMediaTools } from "./tools/media.js";
import { registerBrowseTools } from "./tools/browse.js";

interface CliConfig {
  ytdlpPath: string;
  downloadDir: string;
  chromePath: string;
  headless: boolean;
}

function parseArgs(argv: string[]): CliConfig {
  const config: CliConfig = {
    ytdlpPath: process.env["APEX_YTDLP_PATH"] ?? "yt-dlp",
    downloadDir: expandHome(process.env["APEX_SOCIAL_DOWNLOAD_DIR"] ?? "~/Downloads/apex-social"),
    chromePath: process.env["APEX_CHROME_PATH"] ?? "",
    headless: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const next = argv[i + 1];
    const take = (name: string): string => {
      if (!next) throw new Error(`Missing value for ${name}`);
      i++;
      return next;
    };

    if (arg === "--ytdlp-path") { config.ytdlpPath = take("--ytdlp-path"); continue; }
    if (arg === "--download-dir") { config.downloadDir = expandHome(take("--download-dir")); continue; }
    if (arg === "--chrome-path") { config.chromePath = take("--chrome-path"); continue; }
    if (arg === "--no-headless") { config.headless = false; continue; }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!config.chromePath) {
    try {
      config.chromePath = detectChromePath();
    } catch {
      // Browser tools will fail gracefully if Chrome isn't found
      config.chromePath = "";
    }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));

  const ytdlp = new YtdlpClient({
    binaryPath: config.ytdlpPath,
    downloadDir: config.downloadDir,
  });

  const browserManager = new BrowserManager({
    chromePath: config.chromePath,
    headless: config.headless,
    downloadDir: config.downloadDir,
  });

  const server = new McpServer({
    name: "apex-social-mcp",
    version: "1.0.0",
  });

  registerMediaTools(server, ytdlp);
  registerBrowseTools(server, browserManager);

  const cleanup = async () => {
    await browserManager.close();
  };

  process.on("SIGINT", () => { cleanup().finally(() => process.exit(0)); });
  process.on("SIGTERM", () => { cleanup().finally(() => process.exit(0)); });
  process.on("uncaughtException", (err) => { console.error("Uncaught:", err); });
  process.on("unhandledRejection", (reason) => { console.error("Unhandled:", reason); });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
