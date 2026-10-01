import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../src/config.js";
import { requestPartnershipTool } from "../src/tools/affiliate.js";
import { createCheckoutTool } from "../src/tools/purchase.js";

function firstPayload(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

test("partnership write failure is reported instead of acknowledged", async () => {
  const previous = process.env.PARTNERSHIP_PIPE;
  process.env.PARTNERSHIP_PIPE = "/dev/null/partnerships.jsonl";
  try {
    const result = await requestPartnershipTool({
      proposal: "Test proposal",
      agent_id: "test-agent",
      contact_email: "agent@example.com"
    });
    assert.equal(result.isError, true);
    assert.equal(firstPayload(result).ok, false);
  } finally {
    if (previous === undefined) delete process.env.PARTNERSHIP_PIPE;
    else process.env.PARTNERSHIP_PIPE = previous;
  }
});

test("Stripe checkout fails closed when Stripe is not configured", async () => {
  const previous = config.stripe.secretKey;
  config.stripe.secretKey = "";
  try {
    const result = await createCheckoutTool({
      product_slug: "castiq",
      tier: "Pro",
      email: "buyer@example.com"
    });
    assert.equal(result.isError, true);
    assert.equal(firstPayload(result).ok, false);
    assert.match(firstPayload(result).error, /No checkout session was created/);
  } finally {
    config.stripe.secretKey = previous;
  }
});
