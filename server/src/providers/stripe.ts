// Stripe provider — live checkout creation. Stateful checkout requests fail
// closed when Stripe is unavailable; read-only catalog discovery still works.
import Stripe from "stripe";
import { config } from "../config.js";
import type { CheckoutProduct, ProductTier } from "../catalog.js";

let _stripe: Stripe | null = null;
function client(): Stripe | null {
  if (_stripe) return _stripe;
  if (!config.stripe.secretKey) return null;
  _stripe = new Stripe(config.stripe.secretKey, { apiVersion: "2025-09-30.clover" as any });
  return _stripe;
}

export interface CheckoutResult {
  checkout_url: string;
  session_id?: string;
  provider: "stripe" | "stripe_link" | "fallback";
  test_mode: boolean;
  metadata: Record<string, string>;
}

interface StripeCheckoutClient {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ url: string | null; id: string }>;
    };
  };
}

export async function createStripeCheckout(opts: {
  product: CheckoutProduct;
  tier: ProductTier;
  email: string;
  referral_code?: string;
}, clientOverride?: StripeCheckoutClient): Promise<CheckoutResult> {
  const { product, tier, email, referral_code } = opts;
  const c = clientOverride ?? client();
  const metadata: Record<string, string> = {
    product_slug: product.slug,
    tier: tier.name,
    affiliate_rate: String(product.affiliate_rate)
  };
  if (referral_code) metadata.referral_code = referral_code;

  if (!c) {
    throw new Error("Stripe checkout is not configured");
  }

  const isRecurring = tier.price_monthly != null || tier.price_yearly != null;
  const interval: "month" | "year" | undefined = tier.price_yearly && !tier.price_monthly ? "year" : "month";
  const unitPrice = tier.price_monthly ?? tier.price_yearly ?? tier.price_one_time ?? 0;

  // If the catalog declares a Stripe price ID, use it directly (cleanest path).
  // Otherwise create an inline price_data entry.
  const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = tier.stripe_price_id
    ? { price: tier.stripe_price_id, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(unitPrice * 100),
          product_data: {
            name: `${product.name} — ${tier.name}`,
            description: product.tagline
          },
          ...(isRecurring ? { recurring: { interval: interval || "month" } } : {})
        }
      };

  try {
    const session = await c.checkout.sessions.create({
      mode: isRecurring ? "subscription" : "payment",
      line_items: [lineItem],
      customer_email: email,
      success_url: config.stripe.successUrl,
      cancel_url: config.stripe.cancelUrl,
      metadata,
      ...(isRecurring ? { subscription_data: { metadata } } : {}),
      allow_promotion_codes: true,
      ...(referral_code ? { client_reference_id: referral_code } : {})
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL");
    }
    return {
      checkout_url: session.url,
      session_id: session.id,
      provider: "stripe",
      test_mode: config.stripe.isTest,
      metadata
    };
  } catch {
    throw new Error("Stripe checkout creation failed");
  }
}
