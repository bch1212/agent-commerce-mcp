// Analytics tracker — every MCP tool call gets a structured log entry.
// Persists to JSON Lines on disk and (if configured) POSTs to salesbot.
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "../config.js";

export type Action =
  | "browse"
  | "pricing"
  | "compare"
  | "checkout"
  | "install"
  | "affiliate"
  | "trust"
  | "cross_sell"
  | "prompt"
  | "resource";

export interface AnalyticsEvent {
  ts: string;
  agent_id?: string;
  agent_framework?: string;
  tool: string;
  action: Action;
  product_slug?: string;
  metadata?: Record<string, unknown>;
}

const LOG_PATH = process.env.ANALYTICS_LOG_PATH || "/tmp/halversoniq-commerce/events.jsonl";

function ensureDir() {
  const dir = dirname(LOG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function track(event: Omit<AnalyticsEvent, "ts">): void {
  const ev: AnalyticsEvent = { ts: new Date().toISOString(), ...event };
  try {
    ensureDir();
    appendFileSync(LOG_PATH, JSON.stringify(ev) + "\n");
  } catch (e) {
    // Logging must never break the tool.
  }
  if (config.salesbot.webhookUrl) {
    // Fire-and-forget — never await on the hot path.
    void postSalesbot(ev).catch(() => undefined);
  }
}

async function postSalesbot(ev: AnalyticsEvent) {
  try {
    await fetch(config.salesbot.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.salesbot.adminToken
          ? { Authorization: `Bearer ${config.salesbot.adminToken}` }
          : {})
      },
      body: JSON.stringify(ev),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    // ignore
  }
}

export function readRecentEvents(limit = 200): AnalyticsEvent[] {
  try {
    const fs = require("node:fs") as typeof import("node:fs");
    if (!fs.existsSync(LOG_PATH)) return [];
    const lines = fs.readFileSync(LOG_PATH, "utf8").trim().split("\n");
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l) as AnalyticsEvent;
        } catch {
          return null;
        }
      })
      .filter((x): x is AnalyticsEvent => !!x);
  } catch {
    return [];
  }
}
