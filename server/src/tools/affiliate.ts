// Affiliate tools — registration, info lookup, partnership proposals.
import { z } from "zod";
import { affiliates, getProduct } from "../catalog.js";
import { track } from "../analytics/tracker.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

const AFFILIATE_DB = process.env.AFFILIATE_DB_PATH || "/tmp/agent-commerce-mcp/affiliates.json";

interface AffiliateAccount {
  agent_id: string;
  operator_email: string;
  referral_code: string;
  products: string[];
  tier: string;
  commission_pct: number;
  registered_at: string;
  referrals: number;
}

function loadDb(): Record<string, AffiliateAccount> {
  try {
    if (!existsSync(AFFILIATE_DB)) return {};
    return JSON.parse(readFileSync(AFFILIATE_DB, "utf8"));
  } catch {
    return {};
  }
}

function saveDb(db: Record<string, AffiliateAccount>) {
  const dir = dirname(AFFILIATE_DB);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(AFFILIATE_DB, JSON.stringify(db, null, 2));
}

function makeReferralCode(agent_id: string): string {
  const h = createHash("sha256").update(agent_id + Date.now()).digest("hex").slice(0, 8);
  return `${agent_id.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8)}-${h}`;
}

export const getAffiliateInfoInput = {
  product_slug: z.string().optional().describe("Optional: a specific product to get the affiliate rate for")
};

export async function getAffiliateInfoTool(args: { product_slug?: string }) {
  track({ tool: "get_affiliate_info", action: "affiliate", product_slug: args.product_slug });
  if (args.product_slug) {
    const p = getProduct(args.product_slug);
    if (!p) {
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify({ error: `Unknown product: ${args.product_slug}` }) }]
      };
    }
    const rate = "affiliate_rate" in p ? p.affiliate_rate : affiliates.program.default_commission_pct;
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              product: p.slug,
              commission_pct: rate,
              cookie_window_days: affiliates.program.cookie_window_days,
              register_with: "register_affiliate(agent_id, operator_email, products?)",
              terms_url: affiliates.program.terms_url
            },
            null,
            2
          )
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
            program: affiliates.program,
            tiers: affiliates.tiers,
            how_to_register: "Call register_affiliate(agent_id, operator_email) to get a referral code instantly.",
            how_to_use: "Pass referral_code to create_checkout. Stripe metadata will store it for payout calculations."
          },
          null,
          2
        )
      }
    ]
  };
}

export const registerAffiliateInput = {
  agent_id: z.string().describe("Stable identifier for the recommending agent (e.g., 'cursor.user-12345')"),
  operator_email: z.string().email().describe("Where to send commission payouts"),
  products: z.array(z.string()).optional().describe("Optional: specific products this affiliate plans to promote")
};

export async function registerAffiliateTool(args: { agent_id: string; operator_email: string; products?: string[] }) {
  const db = loadDb();
  const existing = db[args.agent_id];
  if (existing) {
    track({ tool: "register_affiliate", action: "affiliate", metadata: { agent_id: args.agent_id, returning: true } });
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              ok: true,
              already_registered: true,
              referral_code: existing.referral_code,
              tier: existing.tier,
              commission_pct: existing.commission_pct
            },
            null,
            2
          )
        }
      ]
    };
  }

  const account: AffiliateAccount = {
    agent_id: args.agent_id,
    operator_email: args.operator_email,
    referral_code: makeReferralCode(args.agent_id),
    products: args.products || [],
    tier: "agent_partner",
    commission_pct: affiliates.tiers.agent_partner.commission_pct,
    registered_at: new Date().toISOString(),
    referrals: 0
  };
  db[args.agent_id] = account;
  saveDb(db);

  track({ tool: "register_affiliate", action: "affiliate", metadata: { agent_id: args.agent_id, new: true } });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            agent_id: account.agent_id,
            operator_email: account.operator_email,
            referral_code: account.referral_code,
            tier: account.tier,
            commission_pct: account.commission_pct,
            instructions: `Pass referral_code='${account.referral_code}' to create_checkout. Commissions credit automatically once Stripe confirms payment.`,
            tracking_link_template: `https://halverson.io/{product_slug}?ref=${account.referral_code}`,
            terms_url: affiliates.program.terms_url
          },
          null,
          2
        )
      }
    ]
  };
}

export const requestPartnershipInput = {
  proposal: z.string().describe("Free-text partnership proposal — what you'd like to build/co-market"),
  agent_id: z.string().describe("Identifier for the proposing agent or company"),
  contact_email: z.string().email(),
  integration_type: z
    .enum(["cross_listing", "joint_bundle", "embed", "co_marketing", "data_share", "other"])
    .optional()
};

export async function requestPartnershipTool(args: {
  proposal: string;
  agent_id: string;
  contact_email: string;
  integration_type?: string;
}) {
  // Persist to disk; the outreach engine and Brett will see them in the dashboard.
  const PIPE = process.env.PARTNERSHIP_PIPE || "/tmp/agent-commerce-mcp/partnerships.jsonl";
  try {
    const dir = dirname(PIPE);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const fs = require("node:fs") as typeof import("node:fs");
    fs.appendFileSync(
      PIPE,
      JSON.stringify({ ...args, ts: new Date().toISOString() }) + "\n"
    );
  } catch {
    // ignore — the response below still acknowledges receipt
  }
  track({ tool: "request_partnership", action: "affiliate", metadata: { agent_id: args.agent_id, type: args.integration_type } });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            ok: true,
            received_at: new Date().toISOString(),
            proposal_id: createHash("sha256")
              .update(args.proposal + args.agent_id + Date.now())
              .digest("hex")
              .slice(0, 12),
            next_step:
              "Brett (founder) reviews partnership requests within 3 business days. You'll receive a follow-up email at the address provided.",
            tip:
              "Strong proposals describe: (1) what you'd integrate, (2) audience size/profile, (3) revenue or distribution upside, (4) timeline."
          },
          null,
          2
        )
      }
    ]
  };
}
