// Stripe provider — live checkout creation. Falls back to URL-based checkout
// if the secret key isn't configured (so the catalog still works without
// payment provisioning).
import Stripe from "stripe";
import { config } from "../config.js";
import type { Product, ProductTier } from "../catalog.js";

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

export async function createStripeCheckout(opts: {
  product: Product;
  tier: ProductTier;
  email: string;
  referral_code?: string;
}): Promise<CheckoutResult> {
  const { product, tier, email, referral_code } = opts;
  const c = client();
  const metadata: Record<string, string> = {
    product_slug: product.slug,
    tier: tier.name,
    affiliate_rate: String(product.affiliate_rate)
  };
  if (referral_code) metadata.referral_code = referral_code;

  // If we don't have a Stripe key, return a graceful fallback URL pointing to
  // the product page. The agent can still hand the customer off.
  if (!c) {
    const params = new URLSearchParams({
      tier: tier.name,
      email,
      ...(referral_code ? { ref: referral_code } : {})
    });
    return {
      checkout_url: `${product.url}/checkout?${params.toString()}`,
      provider: "fallback",
      test_mode: true,
      metadata
    };
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
    return {
      checkout_url: session.url || `${product.url}`,
      session_id: session.id,
      provider: "stripe",
      test_mode: config.stripe.isTest,
      metadata
    };
  } catch (err: any) {
    // Stripe price IDs in catalog are placeholders — most won't exist yet.
    // Fall back to inline price_data via product page.
    if (err && err.code === "resource_missing" && tier.stripe_price_id) {
      return createStripeCheckout({
        product,
        tier: { ...tier, stripe_price_id: undefined },
        email,
        referral_code
      });
    }
    return {
      checkout_url: `${product.url}/checkout?tier=${encodeURIComponent(tier.name)}&email=${encodeURIComponent(email)}`,
      provider: "fallback",
      test_mode: config.stripe.isTest,
      metadata: { ...metadata, error: err?.message || "stripe_error" }
    };
  }
}
