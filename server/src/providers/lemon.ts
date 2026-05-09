// Lemon Squeezy provider — alternative checkout for international buyers.
import type { Product, ProductTier } from "../catalog.js";
import type { CheckoutResult } from "./stripe.js";

export async function createLemonCheckout(opts: {
  product: Product;
  tier: ProductTier;
  email: string;
  referral_code?: string;
}): Promise<CheckoutResult> {
  const { product, tier, email, referral_code } = opts;
  const params = new URLSearchParams({
    email,
    ...(referral_code ? { aff_ref: referral_code } : {})
  });
  return {
    checkout_url: `${product.url}/checkout?${params.toString()}`,
    provider: "stripe_link",
    test_mode: false,
    metadata: {
      product_slug: product.slug,
      tier: tier.name,
      provider: "lemon",
      ...(referral_code ? { referral_code } : {})
    }
  };
}
