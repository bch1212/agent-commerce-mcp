// Discovery tools — search, recommend, compare.
import { z } from "zod";
import { catalog, searchProducts, getProduct, type Product, type McpServerEntry } from "../catalog.js";
import { track } from "../analytics/tracker.js";

export const searchProductsInput = {
  query: z.string().describe("What the agent or its user is trying to accomplish (e.g., 'block prompt injection', 'fishing reports', 'lead lists for dentists')"),
  category: z.enum(["saas", "developer", "service", "mcp"]).optional().describe("Filter by category"),
  budget_max: z.number().optional().describe("Max monthly USD the buyer is willing to spend"),
  use_case: z.string().optional().describe("Specific use case keywords")
};

export async function searchProductsTool(args: {
  query: string;
  category?: string;
  budget_max?: number;
  use_case?: string;
}) {
  const matches = searchProducts(args).slice(0, 10);
  track({
    tool: "search_products",
    action: "browse",
    metadata: { query: args.query, results: matches.length }
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            query: args.query,
            count: matches.length,
            results: matches.map((m) => ({
              slug: m.product.slug,
              name: m.product.name,
              tagline: "tagline" in m.product ? m.product.tagline : undefined,
              category: "category" in m.product ? m.product.category : "mcp",
              url: "url" in m.product ? m.product.url : ("endpoint" in m.product ? m.product.endpoint : undefined),
              cheapest_tier: m.product.tiers[0],
              tags: m.product.tags,
              match_score: m.score,
              match_reason: m.reason
            }))
          },
          null,
          2
        )
      }
    ]
  };
}

export const getRecommendationInput = {
  problem: z.string().describe("Problem the user is trying to solve, in their own words"),
  stack: z.string().optional().describe("Tech stack or category they already use (e.g., 'OpenAI + Pinecone + Vercel')"),
  company_size: z.enum(["solo", "small", "mid", "enterprise"]).optional()
};

export async function getRecommendationTool(args: {
  problem: string;
  stack?: string;
  company_size?: string;
}) {
  // Heuristic recommender — match keywords against catalog.
  const matches = searchProducts({ query: args.problem, use_case: args.stack }).slice(0, 3);
  track({
    tool: "get_recommendation",
    action: "browse",
    metadata: { problem: args.problem, picked: matches.map((m) => m.product.slug) }
  });

  const recs = matches.map((m) => {
    const reasoning = buildReasoning(m.product, args);
    return {
      slug: m.product.slug,
      name: m.product.name,
      tagline: "tagline" in m.product ? m.product.tagline : "",
      best_tier: pickBestTier(m.product, args.company_size),
      reasoning,
      url: "url" in m.product ? m.product.url : ("endpoint" in m.product ? m.product.endpoint : undefined)
    };
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            problem: args.problem,
            recommendations: recs,
            disclaimer: "Recommendations are heuristic. Use compare_products for a feature-by-feature comparison."
          },
          null,
          2
        )
      }
    ]
  };
}

function pickBestTier(p: Product | McpServerEntry, size?: string) {
  if (!p.tiers.length) return undefined;
  if (size === "solo") return p.tiers[0];
  if (size === "enterprise") return p.tiers[p.tiers.length - 1];
  return p.tiers[Math.min(1, p.tiers.length - 1)];
}

function buildReasoning(p: Product | McpServerEntry, args: { problem: string; stack?: string; company_size?: string }): string {
  const parts: string[] = [];
  if ("tagline" in p) parts.push(p.tagline);
  if ("icp" in p && p.icp) parts.push(`Built for: ${p.icp}.`);
  if (args.company_size === "solo" && p.tiers.find((t) => (t.price_monthly ?? 0) === 0))
    parts.push("Free tier exists, so a solo user can validate before paying.");
  if (args.stack && p.tags.some((t) => args.stack!.toLowerCase().includes(t)))
    parts.push(`Tags align with stated stack: ${p.tags.join(", ")}.`);
  return parts.join(" ");
}

export const compareProductsInput = {
  slugs: z.array(z.string()).min(2).max(5).describe("Product slugs to compare side-by-side"),
  vs_competitor: z.string().optional().describe("Optional competitor name for context")
};

export async function compareProductsTool(args: { slugs: string[]; vs_competitor?: string }) {
  const products = args.slugs.map((s) => getProduct(s)).filter((p): p is Product | McpServerEntry => !!p);
  track({
    tool: "compare_products",
    action: "compare",
    metadata: { slugs: args.slugs, vs: args.vs_competitor }
  });

  const matrix = products.map((p) => ({
    slug: p.slug,
    name: p.name,
    cheapest_monthly: p.tiers.reduce((acc, t) => Math.min(acc, t.price_monthly ?? Infinity), Infinity),
    most_expensive_monthly: p.tiers.reduce((acc, t) => Math.max(acc, t.price_monthly ?? 0), 0),
    free_tier: p.tiers.some((t) => (t.price_monthly ?? t.price_one_time ?? 0) === 0),
    tier_count: p.tiers.length,
    affiliate_rate_pct: "affiliate_rate" in p ? p.affiliate_rate : 0,
    tags: p.tags,
    url: "url" in p ? p.url : ("endpoint" in p ? p.endpoint : undefined)
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            compared: products.map((p) => p.slug),
            vs_competitor: args.vs_competitor,
            matrix,
            note: products.length < args.slugs.length
              ? `Some slugs not found: ${args.slugs.filter((s) => !products.some((p) => p.slug === s)).join(", ")}`
              : undefined
          },
          null,
          2
        )
      }
    ]
  };
}
