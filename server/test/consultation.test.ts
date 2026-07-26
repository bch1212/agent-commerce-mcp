import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";

import {
  createRequestProductConsultationTool,
  requestProductConsultationDescription,
  requestProductConsultationInput,
  requestProductConsultationTitle,
} from "../src/tools/consultation.js";

const args = {
  product_slug: "agentfetch" as const,
  email: "buyer@example.com",
  name: "Buyer Name",
};

function parseResult(result: Awaited<ReturnType<ReturnType<typeof createRequestProductConsultationTool>>>) {
  assert.equal(result.content.length, 1);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

test("captures an explicitly requested consultation and returns the durable lead id", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const tracked: unknown[] = [];
  const tool = createRequestProductConsultationTool({
    leadCaptureUrl: "https://salesbot.invalid/leads/capture",
    fetchImpl: async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true, lead_id: 742 }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    },
    trackImpl: (event) => tracked.push(event),
  });

  const result = await tool(args);
  assert.equal(result.isError, undefined);
  assert.deepEqual(parseResult(result), {
    ok: true,
    lead_id: 742,
    product_slug: "agentfetch",
    next_step: "A product specialist will contact the buyer at the email address they provided.",
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://salesbot.invalid/leads/capture");
  assert.equal(requests[0].init?.method, "POST");
  assert.deepEqual(requests[0].init?.headers, { "Content-Type": "application/json" });
  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    email: "buyer@example.com",
    product: "agentfetch",
    name: "Buyer Name",
    source: "agent-commerce-mcp:consultation",
  });
  assert.deepEqual(tracked, [
    {
      tool: "request_product_consultation",
      action: "consultation",
      product_slug: "agentfetch",
      metadata: { outcome: "captured" },
    },
  ]);
});

test("fails closed when lead capture is not configured", async () => {
  let fetchCalled = false;
  let trackCalled = false;
  const tool = createRequestProductConsultationTool({
    leadCaptureUrl: "",
    fetchImpl: async () => {
      fetchCalled = true;
      throw new Error("must not fetch");
    },
    trackImpl: () => {
      trackCalled = true;
    },
  });

  const result = await tool(args);
  assert.equal(result.isError, true);
  assert.deepEqual(parseResult(result), {
    ok: false,
    error: "Product consultation capture is not configured. No consultation request was submitted.",
  });
  assert.equal(fetchCalled, false);
  assert.equal(trackCalled, false);
});

test("fails closed when Salesbot rejects the lead", async () => {
  const tool = createRequestProductConsultationTool({
    leadCaptureUrl: "https://salesbot.invalid/leads/capture",
    fetchImpl: async () => new Response(JSON.stringify({ detail: "unknown product" }), { status: 400 }),
    trackImpl: () => assert.fail("rejected captures must not be tracked"),
  });

  const result = await tool(args);
  assert.equal(result.isError, true);
  assert.deepEqual(parseResult(result), {
    ok: false,
    error: "Salesbot did not accept the consultation request. No consultation was captured.",
  });
});

test("fails closed on malformed Salesbot success responses", async (t) => {
  const responses = [
    new Response("not json", { status: 201 }),
    new Response(JSON.stringify({ ok: false, lead_id: 742 }), { status: 201 }),
    new Response(JSON.stringify({ ok: true }), { status: 201 }),
    new Response(JSON.stringify({ ok: true, lead_id: "742" }), { status: 201 }),
  ];

  for (const [index, response] of responses.entries()) {
    await t.test(`malformed response ${index + 1}`, async () => {
      const tool = createRequestProductConsultationTool({
        leadCaptureUrl: "https://salesbot.invalid/leads/capture",
        fetchImpl: async () => response,
        trackImpl: () => assert.fail("malformed captures must not be tracked"),
      });

      const result = await tool(args);
      assert.equal(result.isError, true);
      assert.deepEqual(parseResult(result), {
        ok: false,
        error: "Salesbot returned an invalid confirmation. No consultation was captured.",
      });
    });
  }
});

test("fails closed on a network failure", async () => {
  const tool = createRequestProductConsultationTool({
    leadCaptureUrl: "https://salesbot.invalid/leads/capture",
    fetchImpl: async () => {
      throw new Error("connection refused");
    },
    trackImpl: () => assert.fail("network failures must not be tracked"),
  });

  const result = await tool(args);
  assert.equal(result.isError, true);
  assert.deepEqual(parseResult(result), {
    ok: false,
    error: "Salesbot could not be reached. No consultation was captured.",
  });
});

test("tool metadata requires explicit buyer consent and exposes only supported products", () => {
  assert.equal(requestProductConsultationTitle, "Request a product consultation");
  assert.match(
    requestProductConsultationDescription,
    /may only be called after the buyer explicitly asks to be contacted/i,
  );

  const schema = z.object(requestProductConsultationInput);
  assert.equal(schema.safeParse(args).success, true);
  assert.equal(
    schema.safeParse({ product_slug: "injectshield", email: "buyer@example.com" }).success,
    false,
  );
  assert.equal(schema.safeParse({ product_slug: "agentfetch", email: "invalid" }).success, false);
});

test("confirmed-capture analytics never contain buyer PII", async () => {
  const tracked: unknown[] = [];
  const tool = createRequestProductConsultationTool({
    leadCaptureUrl: "https://salesbot.invalid/leads/capture",
    fetchImpl: async () =>
      new Response(JSON.stringify({ ok: true, lead_id: 743 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    trackImpl: (event) => tracked.push(event),
  });

  await tool(args);
  const serialized = JSON.stringify(tracked);
  assert.doesNotMatch(serialized, /buyer@example\.com/i);
  assert.doesNotMatch(serialized, /Buyer Name/i);
  assert.doesNotMatch(serialized, /email|name/i);
  assert.deepEqual(tracked, [
    {
      tool: "request_product_consultation",
      action: "consultation",
      product_slug: "agentfetch",
      metadata: { outcome: "captured" },
    },
  ]);
});
