// Catalog loader — single source of truth for products, bundles, cross-sells, affiliates.
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function locateCatalog(): string {
  // Try several candidate locations so the server works whether run from
  // dist/, src/, an installed npm package, or with a custom CATALOG_PATH.
  const candidates = [
    config.catalogPath,
    join(process.cwd(), config.catalogPath),
    join(process.cwd(), "catalog"),
    join(__dirname, "..", "..", "catalog"),
    join(__dirname, "..", "..", "..", "catalog"),
    join(__dirname, "..", "catalog")
  ];
  for (const c of candidates) {
    const p = resolve(c, "products.json");
    if (existsSync(p)) return resolve(c);
  }
  // Fall back to first candidate so we get a clear error
  return resolve(candidates[0]);
}

const catalogDir = locateCatalog();

function loadJson<T>(name: string): T {
  const path = join(catalogDir, name);
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

export interface ProductTier {
  name: string;
  price_monthly?: number;
  price_yearly?: number;
  price_one_time?: number;
  price_per_call?: number;
  stripe_price_id?: string | null;
  checkout_url?: string;
  features: string[];
}

export interface Product {
  slug: string;
  name: string;
  category: "saas" | "developer" | "service";
  tagline: string;
  description: string;
  domain: string;
  url: string;
  icp: string;
  tiers: ProductTier[];
  free_tier_command?: string | null;
  mcp_install?: Record<string, string>;
  mcp_install_npm?: string;
  mcp_endpoint?: string;
  checkout_provider: "stripe" | "gumroad" | "lemon";
  affiliate_rate: number;
  tags: string[];
}

export interface McpServerEntry {
  slug: string;
  name: string;
  endpoint?: string;
  alt_endpoint?: string;
  npm?: string;
  registry_id: string;
  tiers: ProductTier[];
  tags: string[];
}

export interface Bundle {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  products: string[];
  discount_pct: number;
  stripe_price_id: string;
  estimated_value_monthly: number;
  bundle_price_monthly: number;
  savings_monthly: number;
  icp: string;
}

export interface Catalog {
  version: string;
  vendor: {
    name: string;
    operator: string;
    website: string;
    trust_mcp: string;
    agenttrust_id: string;
  };
  products: Product[];
  mcp_servers: McpServerEntry[];
}

export interface AffiliateProgram {
  program: {
    name: string;
    description: string;
    default_commission_pct: number;
    cookie_window_days: number;
    payout_method: string;
    minimum_payout_usd: number;
    tracking: string;
    terms_url: string;
  };
  tiers: Record<string, { min_referrals: number; commission_pct: number; perks: string[] }>;
}

export interface CrossSellGraph {
  graph: Record<string, string[]>;
  bundle_prefer: Record<string, string>;
}

const _catalog = loadJson<Catalog>("products.json");
const _bundles = loadJson<{ bundles: Bundle[] }>("bundles.json").bundles;
const _crossSell = loadJson<CrossSellGraph>("cross-sell-graph.json");
const _affiliates = loadJson<AffiliateProgram>("affiliates.json");

export const catalog = _catalog;
export const bundles = _bundles;
export const crossSell = _crossSell;
export const affiliates = _affiliates;

export function getProduct(slug: string): Product | McpServerEntry | undefined {
  return (
    catalog.products.find((p) => p.slug === slug) ||
    catalog.mcp_servers.find((m) => m.slug === slug)
  );
}

export function getBundle(slug: string): Bundle | undefined {
  return bundles.find((b) => b.slug === slug);
}

export function getAllProductsAndMcps(): Array<Product | McpServerEntry> {
  return [...catalog.products, ...catalog.mcp_servers];
}

export function searchProducts(opts: {
  query?: string;
  category?: string;
  budget_max?: number;
  use_case?: string;
}): Array<{ product: Product | McpServerEntry; score: number; reason: string }> {
  const q = (opts.query || "").toLowerCase();
  const useCase = (opts.use_case || "").toLowerCase();
  const all = getAllProductsAndMcps();

  return all
    .map((p) => {
      let score = 0;
      const reasons: string[] = [];
      const blob =
        `${p.name} ${"description" in p ? p.description : ""} ${("tagline" in p ? p.tagline : "")} ${("icp" in p ? p.icp : "")} ${p.tags.join(" ")}`.toLowerCase();

      if (q && blob.includes(q)) {
        score += 5;
        reasons.push(`name/desc/tags match "${opts.query}"`);
      }
      if (useCase && blob.includes(useCase)) {
        score += 3;
        reasons.push(`use case match "${opts.use_case}"`);
      }
      if (opts.category && "category" in p && p.category === opts.category) {
        score += 4;
        reasons.push(`category match "${opts.category}"`);
      }

      // Tag overlap with query/use_case
      const userTerms = `${q} ${useCase}`.split(/\s+/).filter(Boolean);
      for (const term of userTerms) {
        for (const tag of p.tags) {
          if (tag.toLowerCase().includes(term) || term.includes(tag.toLowerCase())) {
            score += 1;
          }
        }
      }

      // Budget filter — keep products with at least one tier under budget
      if (opts.budget_max != null) {
        const fits = p.tiers.some((t) => {
          const m = t.price_monthly ?? t.price_yearly ?? t.price_one_time ?? 0;
          return m <= opts.budget_max!;
        });
        if (!fits) score = -1;
        else reasons.push(`fits budget ≤$${opts.budget_max}`);
      }

      return { product: p, score, reason: reasons.join("; ") || "general match" };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
}
