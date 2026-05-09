// MCP resources — agent-readable URIs for the catalog.
import { catalog, bundles, affiliates, getProduct, getBundle } from "../catalog.js";

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function listResources(): ResourceDescriptor[] {
  const resources: ResourceDescriptor[] = [
    {
      uri: "commerce://catalog/all",
      name: "All Products",
      description: "Every product, MCP server, and bundle in the catalog",
      mimeType: "application/json"
    },
    {
      uri: "commerce://catalog/saas",
      name: "SaaS Products",
      description: "Subscription SaaS products (CastIQ, GrantIQ, FocusIQ, Catholic Daily)",
      mimeType: "application/json"
    },
    {
      uri: "commerce://catalog/developer",
      name: "Developer Tools",
      description: "AI/dev tools (AgentFetch, QueryShield, InjectShield, ModelWatch, ComplianceBeacon, RegImpact)",
      mimeType: "application/json"
    },
    {
      uri: "commerce://catalog/services",
      name: "Services & Digital Products",
      description: "Branded Audits, LeadVault, JobAuditor, Gumroad library",
      mimeType: "application/json"
    },
    {
      uri: "commerce://catalog/mcp-servers",
      name: "MCP Servers",
      description: "Deployed MCP servers (GrantIQ, OutdoorIQ, BizIntel, AgentTrust, PubRecords, QueryShield, InjectShield, ModelWatch)",
      mimeType: "application/json"
    },
    {
      uri: "commerce://affiliate/program",
      name: "Affiliate Program",
      description: "Program details, commission tiers, terms",
      mimeType: "application/json"
    }
  ];

  for (const p of catalog.products) {
    resources.push({
      uri: `commerce://product/${p.slug}`,
      name: p.name,
      description: p.tagline,
      mimeType: "application/json"
    });
  }
  for (const m of catalog.mcp_servers) {
    resources.push({
      uri: `commerce://product/${m.slug}`,
      name: m.name,
      description: `MCP server: ${m.tags.join(", ")}`,
      mimeType: "application/json"
    });
  }
  for (const b of bundles) {
    resources.push({
      uri: `commerce://bundle/${b.slug}`,
      name: b.name,
      description: b.tagline,
      mimeType: "application/json"
    });
  }
  return resources;
}

export function readResource(uri: string): { uri: string; mimeType: string; text: string } {
  const json = (data: unknown) => JSON.stringify(data, null, 2);

  if (uri === "commerce://catalog/all") {
    return { uri, mimeType: "application/json", text: json(catalog) };
  }
  if (uri === "commerce://catalog/saas") {
    return {
      uri,
      mimeType: "application/json",
      text: json(catalog.products.filter((p) => p.category === "saas"))
    };
  }
  if (uri === "commerce://catalog/developer") {
    return {
      uri,
      mimeType: "application/json",
      text: json(catalog.products.filter((p) => p.category === "developer"))
    };
  }
  if (uri === "commerce://catalog/services") {
    return {
      uri,
      mimeType: "application/json",
      text: json(catalog.products.filter((p) => p.category === "service"))
    };
  }
  if (uri === "commerce://catalog/mcp-servers") {
    return { uri, mimeType: "application/json", text: json(catalog.mcp_servers) };
  }
  if (uri === "commerce://affiliate/program") {
    return { uri, mimeType: "application/json", text: json(affiliates) };
  }

  const productMatch = uri.match(/^commerce:\/\/product\/(.+)$/);
  if (productMatch) {
    const p = getProduct(productMatch[1]);
    if (p) return { uri, mimeType: "application/json", text: json(p) };
  }

  const bundleMatch = uri.match(/^commerce:\/\/bundle\/(.+)$/);
  if (bundleMatch) {
    const b = getBundle(bundleMatch[1]);
    if (b) return { uri, mimeType: "application/json", text: json(b) };
  }

  throw new Error(`Resource not found: ${uri}`);
}
