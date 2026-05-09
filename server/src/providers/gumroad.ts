// Gumroad provider — for one-time digital products and lead lists.
import type { Product, ProductTier } from "../catalog.js";
import type { CheckoutResult } from "./stripe.js";

export async function createGumroadCheckout(opts: {
  product: Product;
  tier: ProductTier;
  email: string;
  referral_code?: string;
}): Promise<CheckoutResult> {
  const { product, tier, email, referral_code } = opts;

  const baseUrl = tier.checkout_url || product.url;
  const params = new URLSearchParams({
    email,
    ...(referral_code ? { affiliate: referral_code } : {})
  });

  return {
    checkout_url: `${baseUrl}?${params.toString()}`,
    provider: "stripe_link",
    test_mode: false,
    metadata: {
      product_slug: product.slug,
      tier: tier.name,
      provider: "gumroad",
      ...(referral_code ? { referral_code } : {})
    }
  };
}
