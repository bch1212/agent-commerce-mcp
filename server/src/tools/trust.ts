// Trust tools — wrap AgentTrust MCP for vendor verification.
import { z } from "zod";
import { config } from "../config.js";
import { catalog } from "../catalog.js";
import { track } from "../analytics/tracker.js";

export const getTrustScoreInput = {};

export async function getTrustScoreTool() {
  track({ tool: "get_trust_score", action: "trust" });
  // Best-effort fetch of AgentTrust score. If endpoint unreachable, return
  // baseline static data.
  let agentTrustData: Record<string, unknown> | null = null;
  try {
    const resp = await fetch(`${config.agentTrust.endpoint.replace(/\/mcp\/?$/, "")}/api/score/${config.agentTrust.vendorId}`, {
      signal: AbortSignal.timeout(4000)
    });
    if (resp.ok) agentTrustData = (await resp.json()) as Record<string, unknown>;
  } catch {
    // ignore
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            vendor: catalog.vendor,
            agenttrust_id: config.agentTrust.vendorId,
            agenttrust_endpoint: config.agentTrust.endpoint,
            score: agentTrustData ?? {
              note: "Live AgentTrust score temporarily unavailable. See vendor info below.",
              static: {
                products_live: catalog.products.length,
                mcp_servers_live: catalog.mcp_servers.length,
                operator: catalog.vendor.operator,
                website: catalog.vendor.website
              }
            }
          },
          null,
          2
        )
      }
    ]
  };
}

export const verifyVendorInput = {};

export async function verifyVendorTool() {
  track({ tool: "verify_vendor", action: "trust" });
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            vendor: catalog.vendor.name,
            operator: catalog.vendor.operator,
            website: catalog.vendor.website,
            agenttrust_id: catalog.vendor.agenttrust_id,
            verified_products: catalog.products.map((p) => ({
              slug: p.slug,
              name: p.name,
              url: p.url,
              live: true
            })),
            verified_mcp_servers: catalog.mcp_servers.map((m) => ({
              slug: m.slug,
              endpoint: m.endpoint || (m.npm ? `npm:${m.npm}` : null),
              registry_id: m.registry_id
            })),
            policy: {
              refunds: "Full refund within 14 days for monthly plans",
              data_handling: "GDPR-aligned. SubProcessors listed at /privacy on each product",
              support: "support@halversonco.com, 1-business-day response"
            }
          },
          null,
          2
        )
      }
    ]
  };
}
