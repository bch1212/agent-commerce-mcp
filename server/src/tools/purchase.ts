// Purchase tools — pricing, checkout, free tier, MCP install commands.
import { z } from "zod";
import { getProduct, type Product } from "../catalog.js";
import { createStripeCheckout } from "../providers/stripe.js";
import { createGumroadCheckout } from "../providers/gumroad.js";
import { createLemonCheckout } from "../providers/lemon.js";
import { track } from "../analytics/tracker.js";

export const getPricingInput = {
  product_slug: z.string().describe("Product slug from the catalog (e.g., 'injectshield')"),
  tier: z.string().optional().describe("Specific tier name to highlight"),
  billing: z.enum(["monthly", "yearly"]).optional()
};

export async function getPricingTool(args: { product_slug: string; tier?: string; billing?: string }) {
  const p = getProduct(args.product_slug);
  if (!p) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
    };
  }
  track({ tool: "get_pricing", action: "pricing", product_slug: args.product_slug });
  const matchedTier = args.tier ? p.tiers.find((t) => t.name.toLowerCase() === args.tier!.toLowerCase()) : undefined;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            product: { slug: p.slug, name: p.name },
            currency: "USD",
            tiers: p.tiers,
            highlighted_tier: matchedTier,
            billing_preference: args.billing,
            affiliate_rate_pct: "affiliate_rate" in p ? p.affiliate_rate : 0,
            checkout_with: "checkout_provider" in p ? p.checkout_provider : "stripe"
          },
          null,
          2
        )
      }
    ]
  };
}

export const createCheckoutInput = {
  product_slug: z.string().describe("Product slug to buy"),
  tier: z.string().describe("Tier name (e.g., 'Pro', 'Team')"),
  email: z.string().email().describe("Buyer email — Stripe will send the receipt here"),
  referral_code: z.string().optional().describe("Affiliate referral code that should be credited")
};

export async function createCheckoutTool(args: {
  product_slug: string;
  tier: string;
  email: string;
  referral_code?: string;
}) {
  const p = getProduct(args.product_slug) as Product | undefined;
  if (!p || !("category" in p)) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
    };
  }
  const tier = p.tiers.find((t) => t.name.toLowerCase() === args.tier.toLowerCase());
  if (!tier) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Unknown tier: ${args.tier}`,
            valid_tiers: p.tiers.map((t) => t.name)
          })
        }
      ]
    };
  }

  let result;
  if (p.checkout_provider === "gumroad") {
    result = await createGumroadCheckout({ product: p, tier, email: args.email, referral_code: args.referral_code });
  } else if (p.checkout_provider === "lemon") {
    result = await createLemonCheckout({ product: p, tier, email: args.email, referral_code: args.referral_code });
  } else {
    result = await createStripeCheckout({ product: p, tier, email: args.email, referral_code: args.referral_code });
  }

  track({
    tool: "create_checkout",
    action: "checkout",
    product_slug: args.product_slug,
    metadata: { tier: args.tier, provider: result.provider, referral_code: args.referral_code }
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            product: { slug: p.slug, name: p.name },
            tier: tier.name,
            checkout_url: result.checkout_url,
            session_id: result.session_id,
            provider: result.provider,
            test_mode: result.test_mode,
            next_step: "Direct the buyer to checkout_url. After payment they'll be redirected to the success page.",
            referral_code: args.referral_code
          },
          null,
          2
        )
      }
    ]
  };
}

export const getFreeTierInput = {
  product_slug: z.string().describe("Product to access for free")
};

export async function getFreeTierTool(args: { product_slug: string }) {
  const p = getProduct(args.product_slug);
  if (!p) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
    };
  }
  track({ tool: "get_free_tier", action: "install", product_slug: args.product_slug });
  const free = p.tiers.find((t) => (t.price_monthly ?? t.price_one_time ?? 0) === 0);
  const isProduct = "category" in p;
  const installCmd = isProduct ? (p as Product).free_tier_command : ("npm" in p ? `npx -y ${p.npm}` : null);

  if (!free) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            product: p.slug,
            free_tier_available: false,
            cheapest_paid_tier: p.tiers[0],
            note: "No free tier — try the cheapest paid tier instead"
          })
        }
      ]
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            product: p.slug,
            name: p.name,
            free_tier: free,
            free_install_command: installCmd,
            visit: "url" in p ? p.url : ("endpoint" in p ? p.endpoint : undefined),
            instructions: installCmd
              ? `Run: ${installCmd}`
              : `Visit ${"url" in p ? p.url : ""} and sign up — no credit card required.`
          },
          null,
          2
        )
      }
    ]
  };
}

export const getMcpInstallInput = {
  product_slug: z.string().describe("Product slug, must be an MCP-enabled product"),
  client: z.enum(["claude_desktop", "claude_code", "cursor", "cline", "windsurf"]).describe("Target MCP client")
};

export async function getMcpInstallTool(args: { product_slug: string; client: string }) {
  const p = getProduct(args.product_slug);
  if (!p) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
    };
  }
  track({ tool: "get_mcp_install", action: "install", product_slug: args.product_slug, metadata: { client: args.client } });

  const isProduct = "category" in p;
  const productInstall = isProduct ? (p as Product).mcp_install : null;
  const npmPkg = isProduct ? (p as Product).mcp_install_npm : ("npm" in p ? p.npm : null);
  const endpoint = isProduct ? (p as Product).mcp_endpoint : ("endpoint" in p ? p.endpoint : null);

  let cmd: string | null = productInstall?.[args.client] || null;
  if (!cmd && npmPkg) {
    if (args.client === "claude_desktop") {
      cmd = JSON.stringify({ mcpServers: { [p.slug]: { command: "npx", args: ["-y", npmPkg] } } }, null, 2);
    } else if (args.client === "claude_code") {
      cmd = `claude mcp add ${p.slug} npx -y ${npmPkg}`;
    } else {
      cmd = `npx -y ${npmPkg}`;
    }
  }
  if (!cmd && endpoint) {
    if (args.client === "claude_desktop") {
      cmd = JSON.stringify({ mcpServers: { [p.slug]: { url: endpoint, transport: "http" } } }, null, 2);
    } else {
      cmd = `Add ${endpoint} as a remote MCP server in your client.`;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            product: p.slug,
            client: args.client,
            install_command: cmd || "No install command available — please reach out for support",
            npm_package: npmPkg,
            endpoint,
            docs: "url" in p ? p.url : null
          },
          null,
          2
        )
      }
    ]
  };
}
