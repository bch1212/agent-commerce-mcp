#!/usr/bin/env node
// Agent Commerce MCP — entry point.
// Supports stdio (default for Claude Desktop / npx) and Streamable HTTP (Railway).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import express, { type Request, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";

import { config } from "./config.js";
import { serviceDescriptor } from "./service-descriptor.js";
import { listResources, readResource } from "./resources/catalog.js";
import {
  guardedWriteTool,
  hasWriteCredential,
  rateLimitMiddleware,
  rejectUnauthorizedStatefulToolCalls,
  requestHasWriteAuth,
  runWithWriteAuth
} from "./security.js";

import {
  searchProductsInput,
  searchProductsTool,
  getRecommendationInput,
  getRecommendationTool,
  compareProductsInput,
  compareProductsTool
} from "./tools/discovery.js";
import {
  getPricingInput,
  getPricingTool,
  createCheckoutInput,
  createCheckoutTool,
  getFreeTierInput,
  getFreeTierTool,
  getMcpInstallInput,
  getMcpInstallTool
} from "./tools/purchase.js";
import {
  getAffiliateInfoInput,
  getAffiliateInfoTool,
  registerAffiliateInput,
  registerAffiliateTool,
  requestPartnershipInput,
  requestPartnershipTool
} from "./tools/affiliate.js";
import { getCrossSellsInput, getCrossSellsTool } from "./tools/cross-sell.js";
import { getTrustScoreInput, getTrustScoreTool, verifyVendorInput, verifyVendorTool } from "./tools/trust.js";
import {
  requestProductConsultationDescription,
  requestProductConsultationInput,
  requestProductConsultationTitle,
  requestProductConsultationTool
} from "./tools/consultation.js";

import { elevatorPitchInput, elevatorPitch, fullPitchInput, fullPitch, bundlePitchInput, bundlePitch } from "./prompts/pitch.js";
import { objectionHandlerInput, objectionHandler } from "./prompts/objection.js";

function buildServer(localWriteAuthorized = false): McpServer {
  const writeToolsEnabled = hasWriteCredential();
  const server = new McpServer(
    {
      name: config.serverName,
      version: config.serverVersion
    },
    {
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      instructions:
        writeToolsEnabled
          ? "Agent Commerce MCP — agent-native storefront for 14 products and 11 MCP servers. Anonymous clients can discover products with `search_products` or `get_recommendation` and see pricing with `get_pricing`. Stateful tools (`create_checkout`, `register_affiliate`, `request_partnership`, `request_product_consultation`) require either `Authorization: Bearer <token>` or `X-Agent-Commerce-API-Key: <token>`. Only use `request_product_consultation` after the buyer explicitly asks to be contacted."
          : "Agent Commerce MCP — read-only agent-native storefront for 14 products and 11 MCP servers. Discover products with `search_products` or `get_recommendation`, see pricing with `get_pricing`, fetch free-tier access, and verify vendor trust. Stateful commerce tools are disabled because no write credential is configured."
    }
  );

  // ── Tools ───────────────────────────────────────────────────────────────
  server.registerTool(
    "search_products",
    {
      title: "Search products",
      description:
        "Search the catalog of SaaS, developer tools, services, and MCP servers. Returns ranked matches with score and reason.",
      inputSchema: searchProductsInput
    },
    searchProductsTool as any
  );

  server.registerTool(
    "get_recommendation",
    {
      title: "Recommend products for a problem",
      description: "Given a problem statement (and optionally a stack/company size), return 1-3 best-fit products with reasoning.",
      inputSchema: getRecommendationInput
    },
    getRecommendationTool as any
  );

  server.registerTool(
    "compare_products",
    {
      title: "Compare products",
      description: "Side-by-side feature/price matrix for 2-5 products.",
      inputSchema: compareProductsInput
    },
    compareProductsTool as any
  );

  server.registerTool(
    "get_pricing",
    {
      title: "Get pricing",
      description: "Full pricing breakdown for a product (tiers, monthly/yearly, affiliate rate).",
      inputSchema: getPricingInput
    },
    getPricingTool as any
  );

  if (writeToolsEnabled) {
    server.registerTool(
      "create_checkout",
      {
        title: "Create checkout session",
        description: "Create a live Stripe (or Gumroad) checkout URL for the buyer. Pass `referral_code` to credit an affiliate.",
        inputSchema: createCheckoutInput
      },
      guardedWriteTool(createCheckoutTool, config.security.writeToken, localWriteAuthorized) as any
    );
  }

  server.registerTool(
    "get_free_tier",
    {
      title: "Get free tier access",
      description: "Returns instant access details for a product's free tier (signup URL or install command).",
      inputSchema: getFreeTierInput
    },
    getFreeTierTool as any
  );

  server.registerTool(
    "get_mcp_install",
    {
      title: "Get MCP install command",
      description: "Exact install command/snippet for a product's MCP server in claude_desktop, claude_code, cursor, cline, or windsurf.",
      inputSchema: getMcpInstallInput
    },
    getMcpInstallTool as any
  );

  if (writeToolsEnabled) {
    server.registerTool(
      "request_product_consultation",
      {
        title: requestProductConsultationTitle,
        description: requestProductConsultationDescription,
        inputSchema: requestProductConsultationInput
      },
      guardedWriteTool(requestProductConsultationTool, config.security.writeToken, localWriteAuthorized) as any
    );
  }

  server.registerTool(
    "get_affiliate_info",
    {
      title: "Affiliate program info",
      description: "Commission rates (15-30%), tracking, and tier perks. Pass product_slug for that product's specific rate.",
      inputSchema: getAffiliateInfoInput
    },
    getAffiliateInfoTool as any
  );

  if (writeToolsEnabled) {
    server.registerTool(
      "register_affiliate",
      {
        title: "Register as an affiliate",
        description: "Instantly register an agent or operator as an affiliate. Returns a referral_code for use in create_checkout.",
        inputSchema: registerAffiliateInput
      },
      guardedWriteTool(registerAffiliateTool, config.security.writeToken, localWriteAuthorized) as any
    );

    server.registerTool(
      "request_partnership",
      {
        title: "Request a partnership",
        description: "Submit a partnership proposal (cross-listing, joint bundle, embed, co-marketing). Reviewed in 3 business days.",
        inputSchema: requestPartnershipInput
      },
      guardedWriteTool(requestPartnershipTool, config.security.writeToken, localWriteAuthorized) as any
    );
  }

  server.registerTool(
    "get_cross_sells",
    {
      title: "Get cross-sell recommendations",
      description: "Given the current product, return related products from the cross-sell graph and the recommended bundle.",
      inputSchema: getCrossSellsInput
    },
    getCrossSellsTool as any
  );

  server.registerTool(
    "get_trust_score",
    {
      title: "Get vendor trust score (AgentTrust)",
      description: "Returns Halverson IQ's AgentTrust reputation score plus operational summary.",
      inputSchema: getTrustScoreInput
    },
    getTrustScoreTool as any
  );

  server.registerTool(
    "verify_vendor",
    {
      title: "Verify vendor",
      description: "Returns full vendor info: company, products live, MCP endpoints, refund/data policies.",
      inputSchema: verifyVendorInput
    },
    verifyVendorTool as any
  );

  // ── Resources (handled via low-level handlers since McpServer's registerResource API
  // doesn't perfectly fit dynamic catalog URIs) ───────────────────────────
  server.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: listResources()
  }));
  server.server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
    const data = readResource(req.params.uri);
    return { contents: [data] };
  });

  // ── Prompts ─────────────────────────────────────────────────────────────
  server.registerPrompt(
    "elevator_pitch",
    {
      title: "Elevator pitch",
      description: "2-sentence tailored pitch for a product to a specific audience.",
      argsSchema: elevatorPitchInput
    },
    elevatorPitch as any
  );
  server.registerPrompt(
    "full_pitch",
    {
      title: "Full pitch",
      description: "Full 200-300 word sales pitch with hook, benefits, CTA.",
      argsSchema: fullPitchInput
    },
    fullPitch as any
  );
  server.registerPrompt(
    "objection_handler",
    {
      title: "Objection handler",
      description: "Acknowledge → reframe → next-step response to a buyer's objection.",
      argsSchema: objectionHandlerInput
    },
    objectionHandler as any
  );
  server.registerPrompt(
    "bundle_pitch",
    {
      title: "Bundle pitch",
      description: "Pitch for one of the curated bundles (AI Security Stack, Agency Growth Kit, AI Builder Essentials).",
      argsSchema: bundlePitchInput
    },
    bundlePitch as any
  );

  return server;
}

// ─── Stdio transport ───────────────────────────────────────────────────────
async function runStdio() {
  // Possession of the configured token in this local process authorizes stdio
  // writes; unlike HTTP, stdio has no request headers to carry a credential.
  const server = buildServer(true);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stay alive — stdio transport keeps process running.
}

// ─── HTTP (Streamable HTTP) transport for Railway ─────────────────────────
async function runHttp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.disable("x-powered-by");
  if (config.security.trustProxy) app.set("trust proxy", 1);

  // Health for Railway healthcheck.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, server: config.serverName, version: config.serverVersion, ts: new Date().toISOString() });
  });

  app.get("/", (_req, res) => {
    res.json(serviceDescriptor());
  });

  // Only MCP traffic consumes the per-client request budget. Railway health
  // checks and the public service descriptor must remain reliably available.
  app.use(["/mcp", "/mcp/"], rateLimitMiddleware());

  interface SessionEntry {
    transport: StreamableHTTPServerTransport;
    lastSeen: number;
  }
  const transports = new Map<string, SessionEntry>();

  const discardSession = (id: string, entry: SessionEntry) => {
    transports.delete(id);
    void entry.transport.close().catch(() => undefined);
  };

  const pruneExpiredSessions = (now = Date.now()) => {
    for (const [id, entry] of transports) {
      if (now - entry.lastSeen >= config.security.sessionTtlMs) discardSession(id, entry);
    }
  };

  const makeRoomForNewSession = () => {
    while (transports.size >= config.security.sessionMax) {
      let oldest: [string, SessionEntry] | undefined;
      for (const candidate of transports) {
        if (!oldest || candidate[1].lastSeen < oldest[1].lastSeen) oldest = candidate;
      }
      if (!oldest) break;
      discardSession(oldest[0], oldest[1]);
    }
  };

  const handleMcp = async (req: Request, res: Response) => {
    if (rejectUnauthorizedStatefulToolCalls(req, res)) return;
    pruneExpiredSessions();

    const sessionId = (req.headers["mcp-session-id"] as string) || undefined;
    const entry = sessionId ? transports.get(sessionId) : undefined;
    if (sessionId && !entry) {
      res.status(404).json({ ok: false, error: "session_not_found" });
      return;
    }

    let transport = entry?.transport;
    if (entry) entry.lastSeen = Date.now();

    if (!transport) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          // Enforce capacity only when admitting a new session. Existing
          // sessions must remain usable when the registry is exactly full.
          pruneExpiredSessions();
          makeRoomForNewSession();
          transports.set(id, { transport: transport!, lastSeen: Date.now() });
        }
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = buildServer();
      await server.connect(transport);
    }

    await runWithWriteAuth(
      requestHasWriteAuth(req.headers as Record<string, string | string[] | undefined>),
      () => transport.handleRequest(req, res, req.body)
    );
  };

  // Streamable HTTP serves all MCP traffic over a single endpoint.
  // Both with and without trailing slash for client compatibility.
  app.post("/mcp", handleMcp);
  app.post("/mcp/", handleMcp);
  app.get("/mcp", handleMcp);
  app.get("/mcp/", handleMcp);
  app.delete("/mcp", handleMcp);
  app.delete("/mcp/", handleMcp);

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.error(`[${config.serverName}] HTTP transport listening on :${config.port}`);
  });
}

async function main() {
  // Auto-detect: if PORT is set or TRANSPORT=http, run HTTP. Otherwise stdio.
  const wantHttp = config.transport === "http" || (config.transport === "auto" && !!process.env.PORT);
  if (wantHttp) await runHttp();
  else await runStdio();
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
