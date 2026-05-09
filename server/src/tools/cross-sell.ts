// Cross-sell — product graph navigation.
import { z } from "zod";
import { crossSell, getProduct, getBundle, bundles, type Product } from "../catalog.js";
import { track } from "../analytics/tracker.js";

export const getCrossSellsInput = {
  current_product: z.string().describe("Product the buyer is currently considering or already owns"),
  agent_context: z.string().optional().describe("Optional: extra context about the buyer's stack or goals")
};

export async function getCrossSellsTool(args: { current_product: string; agent_context?: string }) {
  const related = crossSell.graph[args.current_product] || [];
  const bundlePref = crossSell.bundle_prefer[args.current_product];
  track({ tool: "get_cross_sells", action: "cross_sell", product_slug: args.current_product });

  const relatedDetails = related
    .map((s) => getProduct(s))
    .filter((p): p is Product => !!p)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      tagline: "tagline" in p ? p.tagline : "",
      cheapest_tier_monthly: p.tiers.reduce((acc, t) => Math.min(acc, t.price_monthly ?? Infinity), Infinity),
      url: "url" in p ? p.url : ("endpoint" in p ? (p as any).endpoint : null),
      why: explainCrossSell(args.current_product, p.slug)
    }));

  const bundle = bundlePref ? getBundle(bundlePref) : undefined;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            current_product: args.current_product,
            related_products: relatedDetails,
            recommended_bundle: bundle
              ? {
                  slug: bundle.slug,
                  name: bundle.name,
                  tagline: bundle.tagline,
                  monthly_price: bundle.bundle_price_monthly,
                  monthly_savings: bundle.savings_monthly,
                  discount_pct: bundle.discount_pct
                }
              : null,
            all_bundles: bundles.map((b) => ({ slug: b.slug, name: b.name, products: b.products }))
          },
          null,
          2
        )
      }
    ]
  };
}

function explainCrossSell(from: string, to: string): string {
  const reasons: Record<string, string> = {
    "agentfetch->injectshield": "Web fetches return untrusted text — InjectShield blocks prompt-injection in the same pipeline.",
    "agentfetch->queryshield": "Once you ingest fetched content into a DB, QueryShield catches dangerous downstream queries.",
    "agentfetch->modelwatch": "Bills will spike as you scale fetching+LLM calls — ModelWatch caps and tracks.",
    "queryshield->injectshield": "Layered security — QueryShield at data, InjectShield at prompt boundary.",
    "queryshield->modelwatch": "Both are observability/control layers; share dashboards.",
    "queryshield->regimpact": "Once you pass SOC2-lite via QueryShield logs, RegImpact maps you to EU AI Act / GDPR.",
    "injectshield->queryshield": "Prompt firewall + query firewall = full perimeter.",
    "injectshield->modelwatch": "Track which prompts triggered which model — debugging injections needs per-call telemetry.",
    "injectshield->agentfetch": "Most injection attempts arrive via web content — pair the fetcher with the firewall.",
    "modelwatch->injectshield": "Anomalies in token usage often correlate with injection attempts.",
    "modelwatch->queryshield": "Cost spikes from agents running expensive queries — guardrail at the query layer.",
    "modelwatch->agentfetch": "Cheaper retrieval = lower LLM costs per task.",
    "regimpact->compliancebeacon": "RegImpact maps you to regulations; ComplianceBeacon proves you stay compliant over time.",
    "regimpact->injectshield": "Most AI regulations explicitly require prompt-injection mitigation.",
    "regimpact->modelwatch": "Audit logs from ModelWatch satisfy 'system-of-record' requirements in the EU AI Act.",
    "compliancebeacon->regimpact": "Sister product — ComplianceBeacon for ongoing scanning, RegImpact for one-time gap analysis.",
    "compliancebeacon->branded_audits": "Add a compliance section to every Branded Audit to upsell agency clients.",
    "compliancebeacon->injectshield": "Most compliance frameworks expect injection defense.",
    "branded_audits->leadvault": "Use audits as lead magnets fed by LeadVault prospects.",
    "branded_audits->compliancebeacon": "Bundle compliance scoring into audit reports for higher AOV.",
    "branded_audits->bizintel_mcp": "BizIntel MCP enriches every audit with firmographic data.",
    "leadvault->branded_audits": "LeadVault gives you prospects, Branded Audits gives you a deliverable.",
    "leadvault->jobauditor": "Pair lead lists with JobAuditor for HR/recruiting clients.",
    "leadvault->bizintel_mcp": "Real-time enrichment for the static lead list.",
    "jobauditor->leadvault": "Recruiters love LeadVault for sourcing companies hiring.",
    "jobauditor->branded_audits": "Pitch agencies that serve HR clients.",
    "jobauditor->compliancebeacon": "EEOC compliance is core to JobAuditor.",
    "castiq->outdooriq_mcp": "OutdoorIQ MCP powers CastIQ — agents can use the data layer directly.",
    "castiq->gumroad": "Templates and gear lists from the digital library.",
    "grantiq->compliancebeacon": "Nonprofits need lightweight compliance, not enterprise SOC2.",
    "grantiq->regimpact": "Compliance grants and policy alignment.",
    "focusiq->modelwatch": "Track which AI flows actually save you focus time.",
    "focusiq->gumroad": "Productivity templates extend the FocusIQ workflow."
  };
  return reasons[`${from}->${to}`] || "Complementary product in the Halverson IQ portfolio.";
}
