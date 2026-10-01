import assert from "node:assert/strict";
import test from "node:test";

import {
  FixedWindowRateLimiter,
  clientIdentifier,
  contextHasWriteAuth,
  extractPresentedWriteCredential,
  guardedWriteTool,
  jsonRpcBodyContainsStatefulTool,
  publicToolNames,
  rateLimitMiddleware,
  rejectUnauthorizedStatefulToolCalls,
  requestHasWriteAuth,
  secureCompareCredential,
} from "../src/security.js";

const WRITE_TOKEN = "test-write-token";

test("anonymous configuration advertises public read-only tools but hides stateful tools", () => {
  const tools = publicToolNames("");
  assert.ok(tools.includes("search_products"));
  assert.ok(tools.includes("get_pricing"));
  assert.ok(tools.includes("get_affiliate_info"));
  assert.ok(!tools.includes("create_checkout"));
  assert.ok(!tools.includes("register_affiliate"));
  assert.ok(!tools.includes("request_partnership"));
  assert.ok(!tools.includes("request_product_consultation"));
});

test("write credential configuration advertises stateful tools", () => {
  const tools = publicToolNames(WRITE_TOKEN);
  assert.ok(tools.includes("create_checkout"));
  assert.ok(tools.includes("register_affiliate"));
  assert.ok(tools.includes("request_partnership"));
  assert.ok(tools.includes("request_product_consultation"));
});

test("write auth accepts Bearer token and documented API-key header", () => {
  assert.equal(requestHasWriteAuth({ authorization: `Bearer ${WRITE_TOKEN}` }, WRITE_TOKEN), true);
  assert.equal(requestHasWriteAuth({ "x-agent-commerce-api-key": WRITE_TOKEN }, WRITE_TOKEN), true);
  assert.equal(requestHasWriteAuth({ "X-Agent-Commerce-API-Key": WRITE_TOKEN }, WRITE_TOKEN), true);
  assert.equal(extractPresentedWriteCredential({ authorization: `Bearer ${WRITE_TOKEN}` }), WRITE_TOKEN);
  assert.equal(extractPresentedWriteCredential({ "x-agent-commerce-api-key": WRITE_TOKEN }), WRITE_TOKEN);
});

test("write auth rejects absent, malformed, and wrong credentials", () => {
  assert.equal(requestHasWriteAuth({}, WRITE_TOKEN), false);
  assert.equal(requestHasWriteAuth({ authorization: WRITE_TOKEN }, WRITE_TOKEN), false);
  assert.equal(requestHasWriteAuth({ authorization: "Bearer wrong" }, WRITE_TOKEN), false);
  assert.equal(requestHasWriteAuth({ "x-agent-commerce-api-key": "wrong" }, WRITE_TOKEN), false);
  assert.equal(secureCompareCredential(WRITE_TOKEN.slice(0, -1), WRITE_TOKEN), false);
});

test("stateful tool guard fails closed without valid auth and executes with valid auth", async () => {
  let called = 0;
  const guarded = guardedWriteTool(async (args: { ok: boolean }) => {
    called += 1;
    return { content: [{ type: "text" as const, text: JSON.stringify(args) }] };
  }, WRITE_TOKEN);

  const rejected = await guarded({ ok: true }, { headers: {} });
  assert.equal(rejected.isError, true);
  assert.equal(called, 0);

  const accepted = await guarded({ ok: true }, { headers: { authorization: `Bearer ${WRITE_TOKEN}` } });
  assert.equal("isError" in Object(accepted), false);
  assert.equal(called, 1);
});

test("stdio may execute a stateful tool only when its process owns a configured write credential", async () => {
  let called = 0;
  const handler = async () => {
    called += 1;
    return { content: [{ type: "text" as const, text: "ok" }] };
  };

  const configured = guardedWriteTool(handler, WRITE_TOKEN, true);
  await configured({}, undefined);
  assert.equal(called, 1);

  const unconfigured = guardedWriteTool(handler, "", true);
  const rejected = await unconfigured({}, undefined);
  assert.equal(rejected.isError, true);
  assert.equal(called, 1);
});

test("context auth is always denied when no write credential is configured", () => {
  assert.equal(contextHasWriteAuth({ headers: { authorization: "Bearer anything" } }, ""), false);
});

test("JSON-RPC write detection catches single and batched stateful tool calls", () => {
  assert.equal(jsonRpcBodyContainsStatefulTool({ method: "tools/call", params: { name: "get_pricing" } }), false);
  assert.equal(jsonRpcBodyContainsStatefulTool({ method: "tools/list" }), false);
  assert.equal(jsonRpcBodyContainsStatefulTool({ method: "tools/call", params: { name: "create_checkout" } }), true);
  assert.equal(
    jsonRpcBodyContainsStatefulTool([
      { method: "tools/call", params: { name: "search_products" } },
      { method: "tools/call", params: { name: "request_partnership" } },
    ]),
    true,
  );
});

test("HTTP stateful call middleware rejects anonymous writes", () => {
  const req = {
    body: { method: "tools/call", params: { name: "create_checkout" } },
    headers: {},
  } as any;
  const response = mockResponse();

  assert.equal(rejectUnauthorizedStatefulToolCalls(req, response as any), true);
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { ok: false, error: "tool_not_available" });
});

test("client identity only trusts proxy headers when configured", () => {
  const req = {
    headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.1", "x-real-ip": "203.0.113.11" },
    ip: "203.0.113.10",
    socket: { remoteAddress: "10.0.0.3" },
  } as any;

  assert.equal(clientIdentifier(req, false), "10.0.0.3");
  assert.equal(clientIdentifier(req, true), "203.0.113.10");
});

test("fixed-window rate limiter allows reads up to limit, rejects over limit, resets, and bounds memory", () => {
  let now = 1_000;
  const limiter = new FixedWindowRateLimiter({
    windowMs: 1_000,
    maxRequests: 2,
    maxClients: 2,
    now: () => now,
  });

  assert.equal(limiter.check("a").allowed, true);
  assert.equal(limiter.check("a").allowed, true);
  const rejected = limiter.check("a");
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.retryAfterSeconds, 1);

  now = 2_001;
  assert.equal(limiter.check("a").allowed, true);

  limiter.check("b");
  limiter.check("c");
  assert.equal(limiter.size, 2);
});

test("rate-limit middleware returns 429 with standard limit headers", () => {
  const limiter = new FixedWindowRateLimiter({
    windowMs: 1_000,
    maxRequests: 1,
    maxClients: 10,
    now: () => 10_000,
  });
  const middleware = rateLimitMiddleware(limiter);
  const req = { headers: {}, ip: "127.0.0.1", socket: { remoteAddress: "127.0.0.1" } } as any;
  const res = mockResponse();

  let nextCalls = 0;
  middleware(req, res, () => {
    nextCalls += 1;
  });
  middleware(req, res, () => {
    nextCalls += 1;
  });

  assert.equal(nextCalls, 1);
  assert.equal(res.statusCode, 429);
  assert.equal(res.headers["RateLimit-Limit"], "1");
  assert.equal(res.headers["RateLimit-Remaining"], "0");
  assert.equal(res.headers["Retry-After"], "1");
  assert.deepEqual(res.body, { ok: false, error: "rate_limited" });
});

function mockResponse() {
  const res = {
    headers: {} as Record<string, string>,
    statusCode: 200,
    body: undefined as unknown,
    setHeader: (key: string, value: string) => {
      res.headers[key] = value;
      return res;
    },
    status: (code: number) => {
      res.statusCode = code;
      return res;
    },
    json: (body: unknown) => {
      res.body = body;
      return res;
    },
  };
  return res;
}
