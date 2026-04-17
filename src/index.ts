#!/usr/bin/env node

/**
 * apex-social-mcp — Social & communications MCP
 *
 * Consolidates:
 *   - Social scraping (5 media + 3 browse tools, existing)
 *   - Gmail (10 tools, migrated from gmail-mcp)
 *   - Meta/Facebook/Instagram (17 tools, rewritten from mcp-meta-social)
 *   - GSC (20 tools, Python→TS rewrite — Phase 9, deferred)
 *
 * Total: ~35 tools now + 20 GSC later = ~55
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  UnifiedErrorHandler,
  classifyMeta,
  classifyGoogle,
  registerHealthTool,
  log,
  EXIT_CODES,
} from "@apexradius/apex-mcp-shared";
import { BrowserManager, detectChromePath } from "./browser.js";
import { YtdlpClient } from "@apexradius/apex-mcp-shared";
import { expandHome } from "./utils.js";
import { registerMediaTools } from "./tools/media.js";
import { registerBrowseTools } from "./tools/browse.js";
import { registerGmailTools, isGmailAvailable } from "./tools/gmail.js";
import { registerMetaTools } from "./tools/meta.js";
import { createMetaClient } from "./services/meta/client.js";
import { registerGscTools } from "./tools/gsc.js";
import { isGscConfigured } from "./services/gsc/client.js";
import { registerCalendarTools } from "./tools/calendar.js";
import { isCalendarAvailable } from "./services/calendar/client.js";
import { registerGa4Tools } from "./tools/ga4.js";
import { isGa4Configured } from "./services/ga4/client.js";

const MCP_NAME = "apex-social-mcp";
const MCP_VERSION = "2.2.0";

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
    try { config.chromePath = detectChromePath(); } catch { config.chromePath = ""; }
  }

  return config;
}

async function main(): Promise<void> {
  const config = parseArgs(process.argv.slice(2));

  const errorHandler = new UnifiedErrorHandler({
    mcpName: MCP_NAME,
    retryOverrides: {
      meta: { maxRetries: 3, initialDelayMs: 2000 },
      gmail: { maxRetries: 2, initialDelayMs: 500 },
    },
  });
  errorHandler.registerClassifier(classifyMeta);
  errorHandler.registerClassifier(classifyGoogle);

  const serviceStatus: Record<string, boolean> = {
    scraping: true,
    gmail: false,
    meta: false,
    gsc: false,
    calendar: false,
    ga4: false,
  };

  const server = new McpServer({ name: MCP_NAME, version: MCP_VERSION });
  let totalTools = 0;

  // 1. Social scraping tools (existing 8)
  const ytdlp = new YtdlpClient({ binaryPath: config.ytdlpPath, downloadDir: config.downloadDir });
  const browserManager = new BrowserManager({ chromePath: config.chromePath, headless: config.headless, downloadDir: config.downloadDir });
  registerMediaTools(server, ytdlp);
  registerBrowseTools(server, browserManager);
  totalTools += 8;

  // 2. Gmail tools (10)
  try {
    serviceStatus.gmail = await isGmailAvailable();
    if (serviceStatus.gmail) {
      registerGmailTools(server);
      totalTools += 10;
    } else {
      log.warn(MCP_NAME, "gmail", "startup", "Gmail not available (missing credentials or no accounts)");
    }
  } catch (e) {
    log.warn(MCP_NAME, "gmail", "startup", `Gmail init failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 3. Meta tools (17)
  try {
    const metaClient = createMetaClient();
    if (metaClient) {
      registerMetaTools(server, metaClient);
      serviceStatus.meta = true;
      totalTools += 17;
    } else {
      log.warn(MCP_NAME, "meta", "startup", "Meta not available (missing META_APP_ID/SECRET/TOKEN/PAGE_ID)");
    }
  } catch (e) {
    log.warn(MCP_NAME, "meta", "startup", `Meta init failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 4. GSC tools (18)
  try {
    if (isGscConfigured()) {
      registerGscTools(server);
      serviceStatus.gsc = true;
      totalTools += 18;
    } else {
      log.warn(MCP_NAME, "gsc", "startup", "GSC not available (missing GSC_CREDENTIALS_PATH)");
    }
  } catch (e) {
    log.warn(MCP_NAME, "gsc", "startup", `GSC init failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 5. Calendar tools (9) — uses Gmail OAuth
  try {
    const calAvail = await isCalendarAvailable();
    if (calAvail) {
      registerCalendarTools(server);
      serviceStatus.calendar = true;
      totalTools += 9;
    } else {
      log.warn(MCP_NAME, "calendar", "startup", "Calendar not available (requires Gmail OAuth credentials)");
    }
  } catch (e) {
    log.warn(MCP_NAME, "calendar", "startup", `Calendar init failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 6. GA4 Analytics tools (9) — uses service account
  try {
    if (isGa4Configured()) {
      registerGa4Tools(server);
      serviceStatus.ga4 = true;
      totalTools += 9;
    } else {
      log.warn(MCP_NAME, "ga4", "startup", "GA4 not available (missing GSC_CREDENTIALS_PATH or GA4_PROPERTY_ID)");
    }
  } catch (e) {
    log.warn(MCP_NAME, "ga4", "startup", `GA4 init failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Health check
  registerHealthTool(server, {
    mcpName: MCP_NAME,
    version: MCP_VERSION,
    errorHandler,
    checks: {
      scraping: async () => null,
      gmail: async () => {
        try { return (await isGmailAvailable()) ? null : "No accounts or credentials"; }
        catch (e) { return e instanceof Error ? e.message : String(e); }
      },
      meta: async () => serviceStatus.meta ? null : "Not configured",
      gsc: async () => serviceStatus.gsc ? null : "Not configured (missing GSC_CREDENTIALS_PATH)",
      calendar: async () => {
        try { return (await isCalendarAvailable()) ? null : "No accounts or credentials"; }
        catch (e) { return e instanceof Error ? e.message : String(e); }
      },
      ga4: async () => serviceStatus.ga4 ? null : "Not configured (missing GSC_CREDENTIALS_PATH or GA4_PROPERTY_ID)",
    },
  });
  totalTools += 1;

  log.startup(MCP_NAME, MCP_VERSION, serviceStatus);

  const cleanup = async () => {
    log.info(MCP_NAME, "system", "shutdown", "Shutting down");
    await browserManager.close();
  };

  process.on("SIGINT", () => { cleanup().finally(() => process.exit(EXIT_CODES.SUCCESS)); });
  process.on("SIGTERM", () => { cleanup().finally(() => process.exit(EXIT_CODES.SUCCESS)); });
  process.on("uncaughtException", (err) => {
    log.error(MCP_NAME, "system", "uncaught_exception", err.message);
  });
  process.on("unhandledRejection", (reason) => {
    log.error(MCP_NAME, "system", "unhandled_rejection", reason instanceof Error ? reason.message : String(reason));
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.ready(MCP_NAME, totalTools, serviceStatus);
}

main().catch((err) => {
  log.error(MCP_NAME, "system", "fatal", err instanceof Error ? err.message : String(err));
  process.exit(EXIT_CODES.FATAL_CONFIG_ERROR);
});
