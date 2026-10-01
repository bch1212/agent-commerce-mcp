// Env-driven configuration. All values optional; server gracefully degrades.

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  serverName: process.env.MCP_SERVER_NAME || "agent-commerce-mcp",
  serverVersion: "0.1.3",
  port: positiveInt(process.env.PORT || process.env.MCP_SERVER_PORT, 3100),
  transport: (process.env.MCP_TRANSPORT || "auto") as "stdio" | "http" | "auto",
  security: {
    writeToken: process.env.AGENT_COMMERCE_WRITE_TOKEN || process.env.MCP_WRITE_TOKEN || "",
    apiKeyHeader: "x-agent-commerce-api-key",
    trustProxy: /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || process.env.MCP_TRUST_PROXY || ""),
    rateLimitWindowMs: positiveInt(process.env.MCP_RATE_LIMIT_WINDOW_MS, 60000),
    rateLimitMaxRequests: positiveInt(process.env.MCP_RATE_LIMIT_MAX_REQUESTS, 120),
    rateLimitMaxClients: positiveInt(process.env.MCP_RATE_LIMIT_MAX_CLIENTS, 10000),
    sessionMax: positiveInt(process.env.MCP_SESSION_MAX, 1000),
    sessionTtlMs: positiveInt(process.env.MCP_SESSION_TTL_MS, 1800000)
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    isTest: !process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_TEST_SECRET_KEY,
    successUrl: process.env.STRIPE_SUCCESS_URL || "https://halversonco.com/success?session={CHECKOUT_SESSION_ID}",
    cancelUrl: process.env.STRIPE_CANCEL_URL || "https://halversonco.com/cancel"
  },
  gumroad: {
    accessToken: process.env.GUMROAD_ACCESS_TOKEN || ""
  },
  agentTrust: {
    endpoint: process.env.AGENTTRUST_MCP_ENDPOINT || "https://agenttrust-mcp-production.up.railway.app/mcp",
    vendorId: process.env.AGENTTRUST_VENDOR_ID || "halversoniq"
  },
  salesbot: {
    webhookUrl: process.env.SALESBOT_WEBHOOK_URL || "",
    adminToken: process.env.SALESBOT_ADMIN_TOKEN || "",
    leadCaptureUrl: process.env.SALESBOT_LEAD_CAPTURE_URL || ""
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || ""
  },
  catalogPath: process.env.CATALOG_PATH || "catalog",
  baseUrl: process.env.BASE_URL || "https://commerce.halversonco.com"
};
