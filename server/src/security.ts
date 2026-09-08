import { timingSafeEqual } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, RequestHandler, Response } from "express";

import { config } from "./config.js";

export const STATEFUL_TOOLS = new Set([
  "create_checkout",
  "register_affiliate",
  "request_partnership",
  "request_product_consultation",
]);

interface AuthContext {
  headers?: Record<string, string | string[] | undefined>;
  http?: {
    authInfo?: unknown;
    req?: Request;
  };
  authInfo?: unknown;
  requestInfo?: Request;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
  lastSeen: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  maxRequests: number;
  maxClients: number;
  now?: () => number;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds?: number;
}

const writeAuthStorage = new AsyncLocalStorage<boolean>();

export function hasWriteCredential(writeToken = config.security.writeToken): boolean {
  return writeToken.trim().length > 0;
}

export function publicToolNames(writeCredential = config.security.writeToken): string[] {
  const names = [
    "search_products",
    "get_recommendation",
    "compare_products",
    "get_pricing",
    "get_free_tier",
    "get_mcp_install",
    "get_affiliate_info",
    "get_cross_sells",
    "get_trust_score",
    "verify_vendor",
  ];

  if (hasWriteCredential(writeCredential)) {
    names.splice(4, 0, "create_checkout");
    names.splice(8, 0, "request_product_consultation");
    names.splice(10, 0, "register_affiliate", "request_partnership");
  }

  return names;
}


export function extractPresentedWriteCredential(
  headers: Record<string, string | string[] | undefined>,
  apiKeyHeader = config.security.apiKeyHeader,
): string | null {
  const authorization = firstHeader(findHeader(headers, "authorization"));
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
  }

  const apiKey = firstHeader(findHeader(headers, apiKeyHeader));
  return apiKey?.trim() || null;
}

export function secureCompareCredential(presented: string | null | undefined, expected: string): boolean {
  if (!presented || !expected) return false;
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (presentedBytes.length !== expectedBytes.length) {
    timingSafeEqual(expectedBytes, expectedBytes);
    return false;
  }
  return timingSafeEqual(presentedBytes, expectedBytes);
}

export function requestHasWriteAuth(
  headers: Record<string, string | string[] | undefined>,
  writeToken = config.security.writeToken,
): boolean {
  return secureCompareCredential(extractPresentedWriteCredential(headers), writeToken);
}

export function contextHasWriteAuth(ctx: AuthContext | undefined, writeToken = config.security.writeToken): boolean {
  if (!hasWriteCredential(writeToken)) return false;
  if (writeAuthStorage.getStore() === true) return true;
  const req = ctx?.requestInfo ?? ctx?.http?.req;
  if (req?.headers) return requestHasWriteAuth(req.headers as Record<string, string | string[] | undefined>, writeToken);
  if (ctx?.headers) return requestHasWriteAuth(ctx.headers, writeToken);
  return false;
}

export function runWithWriteAuth<T>(authorized: boolean, callback: () => T): T {
  return writeAuthStorage.run(authorized, callback);
}

export function failClosedWriteResult() {
  return {
    isError: true as const,
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          ok: false,
          error: "This stateful commerce tool is not available without a configured and valid write credential.",
        }),
      },
    ],
  };
}

export function guardedWriteTool<TArgs>(
  handler: (args: TArgs) => Promise<unknown>,
  writeToken = config.security.writeToken,
  localWriteAuthorized = false,
) {
  return async (args: TArgs, ctx?: AuthContext) => {
    if (!hasWriteCredential(writeToken) || (!localWriteAuthorized && !contextHasWriteAuth(ctx, writeToken))) {
      return failClosedWriteResult();
    }
    return handler(args);
  };
}

export function jsonRpcBodyContainsStatefulTool(body: unknown): boolean {
  const messages = Array.isArray(body) ? body : [body];
  return messages.some((message) => {
    if (!message || typeof message !== "object") return false;
    const rpc = message as { method?: unknown; params?: { name?: unknown } };
    return rpc.method === "tools/call" && typeof rpc.params?.name === "string" && STATEFUL_TOOLS.has(rpc.params.name);
  });
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();
  private readonly now: () => number;

  constructor(private readonly options: RateLimiterOptions) {
    this.now = options.now ?? Date.now;
  }

  check(clientId: string): RateLimitDecision {
    const now = this.now();
    this.prune(now);

    const existing = this.entries.get(clientId);
    const entry =
      existing && existing.resetAt > now
        ? existing
        : { count: 0, resetAt: now + this.options.windowMs, lastSeen: now };

    entry.count += 1;
    entry.lastSeen = now;
    this.entries.set(clientId, entry);
    this.enforceMaxClients();

    const remaining = Math.max(0, this.options.maxRequests - entry.count);
    if (entry.count > this.options.maxRequests) {
      return {
        allowed: false,
        limit: this.options.maxRequests,
        remaining,
        resetAt: entry.resetAt,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }

    return { allowed: true, limit: this.options.maxRequests, remaining, resetAt: entry.resetAt };
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(now: number) {
    for (const [clientId, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(clientId);
    }
  }

  private enforceMaxClients() {
    while (this.entries.size > this.options.maxClients) {
      let oldestClient: string | null = null;
      let oldestSeen = Number.POSITIVE_INFINITY;
      for (const [clientId, entry] of this.entries) {
        if (entry.lastSeen < oldestSeen) {
          oldestClient = clientId;
          oldestSeen = entry.lastSeen;
        }
      }
      if (!oldestClient) return;
      this.entries.delete(oldestClient);
    }
  }
}

export function clientIdentifier(req: Pick<Request, "headers" | "ip" | "socket">, trustProxy = config.security.trustProxy): string {
  // When enabled, Express computes req.ip using the one-hop trust policy set
  // by runHttp(). Never parse a caller-controlled forwarding header here.
  if (trustProxy && req.ip) return req.ip;
  return req.socket.remoteAddress || req.ip || "unknown";
}

export function rateLimitMiddleware(
  limiter = new FixedWindowRateLimiter({
    windowMs: config.security.rateLimitWindowMs,
    maxRequests: config.security.rateLimitMaxRequests,
    maxClients: config.security.rateLimitMaxClients,
  }),
): RequestHandler {
  return (req, res, next) => {
    const decision = limiter.check(clientIdentifier(req));
    res.setHeader("RateLimit-Limit", String(decision.limit));
    res.setHeader("RateLimit-Remaining", String(decision.remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil(decision.resetAt / 1000)));
    if (!decision.allowed) {
      res.setHeader("Retry-After", String(decision.retryAfterSeconds));
      res.status(429).json({ ok: false, error: "rate_limited" });
      return;
    }
    next();
  };
}

export function rejectUnauthorizedStatefulToolCalls(req: Request, res: Response): boolean {
  if (!jsonRpcBodyContainsStatefulTool(req.body)) return false;
  if (!hasWriteCredential()) {
    res.status(404).json({ ok: false, error: "tool_not_available" });
    return true;
  }
  if (!requestHasWriteAuth(req.headers as Record<string, string | string[] | undefined>)) {
    res
      .status(401)
      .setHeader("WWW-Authenticate", "Bearer")
      .json({ ok: false, error: "unauthorized" });
    return true;
  }
  return false;
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function findHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | string[] | undefined {
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) return value;
  }
  return undefined;
}
