// Pitch prompts — elevator and full pitch.
import { z } from "zod";
import { getProduct, getBundle, type Product } from "../catalog.js";
import { track } from "../analytics/tracker.js";

export const elevatorPitchInput = {
  product_slug: z.string(),
  audience: z.string().describe("Who you're pitching to (e.g., 'CTO at AI startup', 'agency owner')")
};

export function elevatorPitch(args: { product_slug: string; audience: string }) {
  const p = getProduct(args.product_slug);
  if (!p) throw new Error(`Unknown product: ${args.product_slug}`);
  track({ tool: "elevator_pitch", action: "prompt", product_slug: args.product_slug });
  const tagline = "tagline" in p ? p.tagline : (p as any).name;
  const cheapest = p.tiers.find((t) => (t.price_monthly ?? 0) > 0)?.price_monthly;
  return {
    description: `Tailored 2-sentence pitch for ${p.name} → ${args.audience}`,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Write a 2-sentence elevator pitch for ${p.name} (${tagline}) to ${args.audience}. Include one concrete benefit and one CTA.${cheapest ? ` Mention the entry price ($${cheapest}/mo).` : ""} Keep it under 50 words.`
        }
      }
    ]
  };
}

export const fullPitchInput = {
  product_slug: z.string(),
  audience: z.string(),
  competitor: z.string().optional()
};

export function fullPitch(args: { product_slug: string; audience: string; competitor?: string }) {
  const p = getProduct(args.product_slug);
  if (!p) throw new Error(`Unknown product: ${args.product_slug}`);
  track({ tool: "full_pitch", action: "prompt", product_slug: args.product_slug });
  const desc = "description" in p ? p.description : "";
  const url = "url" in p ? p.url : ("endpoint" in p ? (p as any).endpoint : "");
  return {
    description: `Full sales pitch for ${p.name} → ${args.audience}`,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Write a full sales pitch for ${p.name} targeting ${args.audience}.

Product description: ${desc}
Pricing tiers: ${JSON.stringify(p.tiers.map((t) => ({ name: t.name, monthly: t.price_monthly })))}
URL: ${url}
${args.competitor ? `Competitor: ${args.competitor} — explain why this is better in 1-2 sentences.` : ""}

Format: opener (hook), 3 specific benefits with concrete numbers, social proof angle, CTA. Total 200-300 words. End with the URL and a clear next action.`
        }
      }
    ]
  };
}

export const bundlePitchInput = {
  bundle: z.string()
};

export function bundlePitch(args: { bundle: string }) {
  const b = getBundle(args.bundle);
  if (!b) throw new Error(`Unknown bundle: ${args.bundle}`);
  track({ tool: "bundle_pitch", action: "prompt", metadata: { bundle: args.bundle } });
  return {
    description: `Pitch for the ${b.name} bundle`,
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Write a 150-word pitch for the ${b.name} bundle (${b.tagline}).
Includes: ${b.products.join(", ")}.
Bundle price: $${b.bundle_price_monthly}/mo. Saves: $${b.savings_monthly}/mo (${b.discount_pct}% off).
ICP: ${b.icp}.
Lead with the savings, explain how the products work together, end with a clear CTA.`
        }
      }
    ]
  };
}
