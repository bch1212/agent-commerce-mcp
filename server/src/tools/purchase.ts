// Purchase tools — pricing, checkout, free tier, MCP install commands.
import { z } from "zod";
import {
  getProduct,
  type McpCredentialRequirement,
  type McpServerEntry,
  type Product,
  type ProductTier
} from "../catalog.js";
import { createStripeCheckout } from "../providers/stripe.js";
import { createGumroadCheckout } from "../providers/gumroad.js";
import { createLemonCheckout } from "../providers/lemon.js";
import { track } from "../analytics/tracker.js";

type CheckoutProviders = {
  stripe: typeof createStripeCheckout;
  gumroad: typeof createGumroadCheckout;
  lemon: typeof createLemonCheckout;
};

const defaultCheckoutProviders: CheckoutProviders = {
  stripe: createStripeCheckout,
  gumroad: createGumroadCheckout,
  lemon: createLemonCheckout
};

function isProduct(entry: Product | McpServerEntry): entry is Product {
  return "category" in entry;
}

function isFreeTier(tier: ProductTier): boolean {
  const prices = [tier.price_monthly, tier.price_yearly, tier.price_one_time, tier.price_per_call].filter(
    (price): price is number => price != null
  );
  return prices.length > 0 && prices.every((price) => price === 0);
}

function hasDirectCheckoutPrice(tier: ProductTier): boolean {
  return Boolean(
    tier.stripe_price_id ||
      (tier.price_monthly != null && tier.price_monthly > 0) ||
      (tier.price_yearly != null && tier.price_yearly > 0) ||
      (tier.price_one_time != null && tier.price_one_time > 0)
  );
}

function credentialRequirements(entry: Product | McpServerEntry): McpCredentialRequirement[] {
  return isProduct(entry) ? entry.mcp_credentials ?? [] : entry.credentials ?? [];
}

function supportAction(entry: McpServerEntry) {
  return {
    type: "contact_support",
    url: `${entry.repository}/issues/new`,
    instructions: "Contact support to arrange activation before making any payment."
  };
}

function unavailableMcpPurchase(
  entry: McpServerEntry,
  tier: ProductTier,
  status: "activation_required" | "purchase_unavailable",
  error: string
) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: false,
          status,
          product: { slug: entry.slug, name: entry.name },
          tier: tier.name,
          checkout_required: false,
          purchase_available: false,
          error,
          action: supportAction(entry)
        })
      }
    ]
  };
}

function freeAccess(entry: Product | McpServerEntry) {
  const credentials = credentialRequirements(entry);
  if (isProduct(entry)) {
    return {
      install_command: entry.free_tier_command ?? null,
      endpoint: entry.mcp_endpoint ?? null,
      docs: entry.url,
      ...(credentials.length ? { credential_requirements: credentials } : {})
    };
  }
  return {
    install_command: entry.install_command ?? (entry.npm ? `npx -y ${entry.npm}` : null),
    endpoint: entry.endpoint ?? null,
    docs: entry.docs,
    ...(credentials.length ? { credential_requirements: credentials } : {})
  };
}

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
}, providerOverrides: Partial<CheckoutProviders> = {}) {
  const requestedProduct = getProduct(args.product_slug);
  if (!requestedProduct) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
    };
  }
  const tier = requestedProduct.tiers.find((t) => t.name.toLowerCase() === args.tier.toLowerCase());
  if (!tier) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Unknown tier: ${args.tier}`,
            valid_tiers: requestedProduct.tiers.map((t) => t.name)
          })
        }
      ]
    };
  }

  if (isFreeTier(tier)) {
    const access = freeAccess(requestedProduct);
    track({
      tool: "create_checkout",
      action: "install",
      product_slug: args.product_slug,
      metadata: { tier: tier.name, checkout_required: false }
    });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: true,
            product: { slug: requestedProduct.slug, name: requestedProduct.name },
            tier: tier.name,
            checkout_required: false,
            access,
            next_step: access.install_command
              ? "Install the free MCP package with the provided command; no payment session is required."
              : access.endpoint
                ? "Connect to the free remote MCP endpoint; no payment session is required."
                : "Follow the documented free-access instructions; no payment session is required."
          })
        }
      ]
    };
  }

  if (!isProduct(requestedProduct) && !requestedProduct.purchase) {
    return unavailableMcpPurchase(
      requestedProduct,
      tier,
      "activation_required",
      "Paid checkout is unavailable because automatic entitlement provisioning is not configured for this MCP server."
    );
  }

  let checkoutProduct: Product | McpServerEntry = requestedProduct;
  let checkoutTier = tier;
  if (!isProduct(requestedProduct) && requestedProduct.purchase) {
    const mappedProduct = getProduct(requestedProduct.purchase.product_slug);
    if (!mappedProduct || !isProduct(mappedProduct)) {
      return unavailableMcpPurchase(
        requestedProduct,
        tier,
        "purchase_unavailable",
        "Checkout is unavailable because the catalog purchase mapping is invalid."
      );
    }
    const mappedTierName = requestedProduct.purchase.tier_map?.[tier.name] ?? tier.name;
    const mappedTier = mappedProduct.tiers.find((candidate) => candidate.name.toLowerCase() === mappedTierName.toLowerCase());
    if (!mappedTier) {
      return unavailableMcpPurchase(
        requestedProduct,
        tier,
        "purchase_unavailable",
        "Checkout is unavailable because the catalog tier mapping is invalid."
      );
    }
    checkoutProduct = mappedProduct;
    checkoutTier = mappedTier;

    if (mappedProduct.checkout_provider === "stripe" && !mappedTier.stripe_price_id) {
      return unavailableMcpPurchase(
        requestedProduct,
        tier,
        "purchase_unavailable",
        "Paid checkout is unavailable because the mapped product tier does not have a configured Stripe price."
      );
    }
  }

  if (!hasDirectCheckoutPrice(checkoutTier)) {
    if (!isProduct(requestedProduct)) {
      return unavailableMcpPurchase(
        requestedProduct,
        tier,
        "purchase_unavailable",
        "This MCP tier does not have a supported direct checkout path."
      );
    }
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error: "This tier does not support direct checkout.",
            next_step: "Use the product documentation for usage-based billing or contact the vendor for activation.",
            docs: requestedProduct.url
          })
        }
      ]
    };
  }

  const providers = { ...defaultCheckoutProviders, ...providerOverrides };
  const checkoutProvider = checkoutProduct.checkout_provider;
  let result;
  try {
    if (checkoutProvider === "gumroad" && isProduct(checkoutProduct)) {
      result = await providers.gumroad({
        product: checkoutProduct,
        tier: checkoutTier,
        email: args.email,
        referral_code: args.referral_code
      });
    } else if (checkoutProvider === "lemon" && isProduct(checkoutProduct)) {
      result = await providers.lemon({
        product: checkoutProduct,
        tier: checkoutTier,
        email: args.email,
        referral_code: args.referral_code
      });
    } else {
      result = await providers.stripe({
        product: checkoutProduct,
        tier: checkoutTier,
        email: args.email,
        referral_code: args.referral_code
      });
    }
  } catch {
    track({
      tool: "create_checkout",
      action: "checkout",
      product_slug: args.product_slug,
      metadata: { tier: args.tier, provider: checkoutProvider, failed: true }
    });
    if (!isProduct(requestedProduct)) {
      return unavailableMcpPurchase(
        requestedProduct,
        tier,
        "purchase_unavailable",
        "Checkout is currently unavailable. No checkout session was created."
      );
    }
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: false,
            error: "Checkout creation failed. No checkout session was created; retry later."
          })
        }
      ]
    };
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
            product: { slug: requestedProduct.slug, name: requestedProduct.name },
            ...(checkoutProduct.slug !== requestedProduct.slug
              ? { purchase_product: { slug: checkoutProduct.slug, name: checkoutProduct.name } }
              : {}),
            tier: tier.name,
            checkout_required: true,
            checkout_url: result.checkout_url,
            session_id: result.session_id,
            provider: result.provider,
            test_mode: result.test_mode,
            fulfillment: isProduct(requestedProduct)
              ? {
                  automatic_entitlement_provisioning: false,
                  requirements:
                    "Payment records the purchase, but this service does not automatically provision product access. Complete the product's documented activation or support process after payment."
                }
              : {
                  automatic_entitlement_provisioning: true,
                  via_product_slug: checkoutProduct.slug,
                  requirements: `Access is provisioned through ${checkoutProduct.name}'s existing product checkout and entitlement flow.`
                },
            next_step:
              isProduct(requestedProduct)
                ? "Direct the buyer to checkout_url to complete checkout. After payment, follow the fulfillment requirements to activate access."
                : "Direct the buyer to checkout_url to complete checkout through the existing product entitlement flow.",
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
  const free = p.tiers.find(isFreeTier);
  const access = freeAccess(p);
  const credentials = credentialRequirements(p);

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
            free_install_command: access.install_command,
            visit: access.endpoint ?? access.docs,
            credential_requirements: credentials,
            instructions: access.install_command
              ? `Run: ${access.install_command}`
              : access.endpoint
                ? `Connect to ${access.endpoint} — no payment session is required.`
                : `Visit ${access.docs} and follow the free-access instructions.`
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

  const productEntry = isProduct(p);
  const productInstall = productEntry ? p.mcp_install : null;
  const directInstall = productEntry ? null : p.install_command ?? null;
  const npmPkg = productEntry ? p.mcp_install_npm : p.npm ?? null;
  const endpoint = productEntry ? p.mcp_endpoint : p.endpoint ?? null;
  const credentials = credentialRequirements(p);
  const env = Object.fromEntries(
    credentials
      .filter((credential) => credential.location === "env")
      .map((credential) => [credential.name, credential.placeholder])
  );
  const headers = Object.fromEntries(
    credentials
      .filter((credential) => credential.location === "header")
      .map((credential) => [credential.name, credential.placeholder])
  );
  const stdioCommand = directInstall ?? (npmPkg ? `npx -y ${npmPkg}` : null);

  let cmd: string | null = null;
  if (args.client === "claude_desktop" && endpoint) {
    cmd = JSON.stringify({
      mcpServers: {
        [p.slug]: {
          url: endpoint,
          transport: "http",
          ...(Object.keys(headers).length ? { headers } : {})
        }
      }
    }, null, 2);
  } else if (args.client === "claude_desktop" && stdioCommand) {
    const [command, ...commandArgs] = stdioCommand.split(/\s+/);
    cmd = JSON.stringify({
      mcpServers: {
        [p.slug]: {
          command,
          args: commandArgs,
          ...(Object.keys(env).length ? { env } : {})
        }
      }
    }, null, 2);
  } else if (args.client === "claude_code" && endpoint) {
    const headerArgs = Object.entries(headers)
      .map(([name, value]) => ` --header "${name}: ${value}"`)
      .join("");
    cmd = `claude mcp add --transport http ${p.slug} ${endpoint}${headerArgs}`;
  } else if (args.client === "claude_code" && stdioCommand) {
    const envArgs = Object.entries(env)
      .map(([name, value]) => ` --env ${name}=${value}`)
      .join("");
    cmd = `claude mcp add ${p.slug}${envArgs} -- ${stdioCommand}`;
  } else {
    cmd = productInstall?.[args.client] || directInstall || (npmPkg ? `npx -y ${npmPkg}` : null);
    if (!cmd && endpoint) cmd = `Add ${endpoint} as a remote MCP server in your client.`;
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
            credential_requirements: credentials,
            docs: productEntry ? p.url : p.docs
          },
          null,
          2
        )
      }
    ]
  };
}
