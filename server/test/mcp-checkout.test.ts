import assert from "node:assert/strict";
import test from "node:test";

import { createStripeCheckout, type CheckoutResult } from "../src/providers/stripe.js";
import { createCheckoutTool, getFreeTierTool } from "../src/tools/purchase.js";

function payload(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

const mockResult: CheckoutResult = {
  checkout_url: "https://checkout.example/session",
  session_id: "cs_test_mocked",
  provider: "stripe",
  test_mode: true,
  metadata: {},
};

test("free MCP tiers return install access without creating a checkout session", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "agentvault_mcp",
      tier: "Free",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  assert.equal(result.isError, undefined);
  assert.deepEqual(payload(result), {
    ok: true,
    product: { slug: "agentvault_mcp", name: "AgentVault MCP" },
    tier: "Free",
    checkout_required: false,
    access: {
      install_command: "npx -y agentvault-mcp",
      endpoint: null,
      docs: "https://github.com/bch1212/agentvault#readme",
    },
    next_step: "Install the free MCP package with the provided command; no payment session is required.",
  });
});

test("free product tiers also bypass checkout providers", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "injectshield",
      tier: "Free",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  const body = payload(result);
  assert.equal(body.ok, true);
  assert.equal(body.checkout_required, false);
  assert.equal(body.access.install_command, "npx -y @injectshield/mcp");
});

test("remote free tiers return a usable endpoint instead of an empty signup instruction", async () => {
  const result = await getFreeTierTool({ product_slug: "grantiq_mcp" });
  const body = payload(result);

  assert.equal(body.visit, "https://mcp.grantiq.us/mcp/");
  assert.equal(body.free_install_command, null);
  assert.match(body.instructions, /https:\/\/mcp\.grantiq\.us\/mcp\//);
  assert.match(body.instructions, /no payment session is required/i);
});

test("paid MCP tiers can map to a parent product's real Stripe price and entitlement flow", async () => {
  const calls: Array<{ productSlug: string; tierName: string; priceId?: string | null }> = [];
  const result = await createCheckoutTool(
    {
      product_slug: "queryshield_mcp",
      tier: "Starter",
      email: "buyer@example.com",
      referral_code: "partner-123",
    },
    {
      stripe: async ({ product, tier }) => {
        calls.push({ productSlug: product.slug, tierName: tier.name, priceId: tier.stripe_price_id });
        return mockResult;
      },
    },
  );

  assert.deepEqual(calls, [
    {
      productSlug: "queryshield",
      tierName: "Starter",
      priceId: "price_1TTOGx54riYeMScuGHg86LpL",
    },
  ]);
  const body = payload(result);
  assert.equal(body.ok, true);
  assert.deepEqual(body.product, { slug: "queryshield_mcp", name: "QueryShield MCP" });
  assert.deepEqual(body.purchase_product, { slug: "queryshield", name: "QueryShield" });
  assert.equal(body.tier, "Starter");
  assert.equal(body.checkout_url, mockResult.checkout_url);
  assert.equal(body.session_id, mockResult.session_id);
  assert.deepEqual(body.fulfillment, {
    automatic_entitlement_provisioning: true,
    via_product_slug: "queryshield",
    requirements:
      "Access is provisioned through QueryShield's existing product checkout and entitlement flow.",
  });
  assert.match(body.next_step, /complete checkout/i);
  assert.match(body.next_step, /existing product entitlement flow/i);
});

test("standalone paid MCP tiers without automatic entitlement never create a payable session", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "bizintel_mcp",
      tier: "Pro",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  assert.equal(result.isError, true);
  assert.deepEqual(payload(result), {
    ok: false,
    status: "activation_required",
    product: { slug: "bizintel_mcp", name: "BizIntel MCP" },
    tier: "Pro",
    checkout_required: false,
    purchase_available: false,
    error: "Paid checkout is unavailable because automatic entitlement provisioning is not configured for this MCP server.",
    action: {
      type: "contact_support",
      url: "https://github.com/bch1212/mcp-bizintel/issues/new",
      instructions: "Contact support to arrange activation before making any payment.",
    },
  });
});

test("mapped MCP tiers fail closed when the parent product has no configured Stripe price", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "agentfetch_mcp",
      tier: "Scale",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  assert.equal(result.isError, true);
  const body = payload(result);
  assert.equal(body.status, "purchase_unavailable");
  assert.equal(body.checkout_required, false);
  assert.equal(body.purchase_available, false);
  assert.match(body.error, /configured Stripe price/i);
  assert.equal(body.action.url, "https://github.com/bch1212/agentfetch-mcp/issues/new");
});

test("usage-priced MCP tiers never fall through to a zero-dollar Stripe session", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "agentfetch_mcp",
      tier: "Usage",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  assert.equal(result.isError, true);
  assert.equal(payload(result).status, "purchase_unavailable");
  assert.match(payload(result).error, /configured Stripe price/i);
  assert.equal(payload(result).checkout_required, false);
});

test("unknown MCP tiers fail before calling a checkout provider", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "queryshield_mcp",
      tier: "Not a tier",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        return mockResult;
      },
    },
  );

  assert.equal(stripeCalls, 0);
  assert.equal(result.isError, true);
  assert.equal(payload(result).error, "Unknown tier: Not a tier");
  assert.deepEqual(payload(result).valid_tiers, ["Starter", "Growth", "Enterprise"]);
});

test("Stripe never retries a stale catalog price as an inline ad-hoc price", async () => {
  const createCalls: unknown[] = [];
  const fakeClient = {
    checkout: {
      sessions: {
        create: async (params: unknown) => {
          createCalls.push(params);
          throw Object.assign(new Error("No such price"), { code: "resource_missing" });
        },
      },
    },
  };

  await assert.rejects(
    createStripeCheckout(
      {
        product: {
          slug: "queryshield",
          name: "QueryShield",
          tagline: "Query firewall",
          checkout_provider: "stripe",
          affiliate_rate: 25,
        },
        tier: {
          name: "Starter",
          price_monthly: 500,
          stripe_price_id: "price_stale",
          features: [],
        },
        email: "buyer@example.com",
      },
      fakeClient as never,
    ),
    /Stripe checkout creation failed/,
  );

  assert.equal(createCalls.length, 1);
  assert.deepEqual((createCalls[0] as any).line_items, [{ price: "price_stale", quantity: 1 }]);
});

test("mapped MCP checkout provider failures return purchase_unavailable with support and no session", async () => {
  let stripeCalls = 0;
  const result = await createCheckoutTool(
    {
      product_slug: "queryshield_mcp",
      tier: "Starter",
      email: "buyer@example.com",
    },
    {
      stripe: async () => {
        stripeCalls += 1;
        throw Object.assign(new Error("No such price"), { code: "resource_missing" });
      },
    },
  );

  assert.equal(stripeCalls, 1);
  assert.equal(result.isError, true);
  assert.deepEqual(payload(result), {
    ok: false,
    status: "purchase_unavailable",
    product: { slug: "queryshield_mcp", name: "QueryShield MCP" },
    tier: "Starter",
    checkout_required: false,
    purchase_available: false,
    error: "Checkout is currently unavailable. No checkout session was created.",
    action: {
      type: "contact_support",
      url: "https://github.com/bch1212/queryshield/issues/new",
      instructions: "Contact support to arrange activation before making any payment.",
    },
  });
});
