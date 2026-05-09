// Objection handler prompt.
import { z } from "zod";
import { getProduct } from "../catalog.js";
import { track } from "../analytics/tracker.js";

export const objectionHandlerInput = {
  objection: z.string().describe("The buyer's objection in their own words"),
  product_slug: z.string()
};

export function objectionHandler(args: { objection: string; product_slug: string }) {
  const p = getProduct(args.product_slug);
  if (!p) throw new Error(`Unknown product: ${args.product_slug}`);
  track({ tool: "objection_handler", action: "prompt", product_slug: args.product_slug });
  const tagline = "tagline" in p ? p.tagline : "";
  const cheapestFree = p.tiers.find((t) => (t.price_monthly ?? t.price_one_time ?? 0) === 0);
  return {
    description: `Handle objection for ${p.name}`,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Buyer says: "${args.objection}"

Product: ${p.name} — ${tagline}
${cheapestFree ? `Free tier: ${JSON.stringify(cheapestFree.features)}` : "No free tier."}
Tiers: ${JSON.stringify(p.tiers.map((t) => ({ name: t.name, monthly: t.price_monthly })))}

Respond in 2-3 sentences:
1. Acknowledge the concern (not defensive).
2. Reframe with concrete fact.
3. Offer the lowest-friction next step (free tier > 14-day trial > smaller plan > demo call).
Be honest. If their objection is valid, recommend a different product or no purchase.`
        }
      }
    ]
  };
}
