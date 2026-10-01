import assert from "node:assert/strict";
import test from "node:test";

import type { CheckoutResult } from "../src/providers/stripe.js";
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

test("paid MCP tiers can map to a parent product's real Stripe price", async () => {
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
    automatic_api_key_provisioning: false,
    requirements:
      "Payment records the purchase, but this service does not automatically issue or deliver MCP API keys. Complete the product's documented activation or support process after payment.",
  });
  assert.match(body.next_step, /complete checkout/i);
  assert.doesNotMatch(body.next_step, /API key.*automatically|automatically.*API key/i);
});

test("standalone paid MCP tiers use their advertised price with a mocked provider", async () => {
  const calls: Array<{ productSlug: string; tierName: string; monthly?: number }> = [];
  const result = await createCheckoutTool(
    {
      product_slug: "bizintel_mcp",
      tier: "Pro",
      email: "buyer@example.com",
    },
    {
      stripe: async ({ product, tier }) => {
        calls.push({ productSlug: product.slug, tierName: tier.name, monthly: tier.price_monthly });
        return mockResult;
      },
    },
  );

  assert.deepEqual(calls, [{ productSlug: "bizintel_mcp", tierName: "Pro", monthly: 19 }]);
  assert.equal(payload(result).ok, true);
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
  assert.equal(payload(result).error, "This tier does not support direct checkout.");
  assert.match(payload(result).next_step, /usage-based billing/i);
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
