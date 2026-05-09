// Env-driven configuration. All values optional; server gracefully degrades.

export const config = {
  serverName: process.env.MCP_SERVER_NAME || "halversoniq-commerce",
  serverVersion: "0.1.0",
  port: parseInt(process.env.PORT || process.env.MCP_SERVER_PORT || "3100", 10),
  transport: (process.env.MCP_TRANSPORT || "auto") as "stdio" | "http" | "auto",
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || process.env.STRIPE_TEST_SECRET_KEY || "",
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
    isTest: !process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_TEST_SECRET_KEY,
    successUrl: process.env.STRIPE_SUCCESS_URL || "https://halverson.io/success?session={CHECKOUT_SESSION_ID}",
    cancelUrl: process.env.STRIPE_CANCEL_URL || "https://halverson.io/cancel"
  },
  gumroad: {
    accessToken: process.env.GUMROAD_ACCESS_TOKEN || ""
  },
  agentTrust: {
    endpoint: process.env.AGENTTRUST_MCP_ENDPOINT || "https://mcp-agenttrust-production.up.railway.app/mcp",
    vendorId: process.env.AGENTTRUST_VENDOR_ID || "halversoniq"
  },
  salesbot: {
    webhookUrl: process.env.SALESBOT_WEBHOOK_URL || "",
    adminToken: process.env.SALESBOT_ADMIN_TOKEN || ""
  },
  discord: {
    webhookUrl: process.env.DISCORD_WEBHOOK_URL || ""
  },
  catalogPath: process.env.CATALOG_PATH || "catalog",
  baseUrl: process.env.BASE_URL || "https://commerce.halverson.io"
};
