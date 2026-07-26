// Opt-in buyer consultation capture through the existing Salesbot lead endpoint.
import { z } from "zod";

import { track, type AnalyticsEvent } from "../analytics/tracker.js";
import { config } from "../config.js";

const CONSULTATION_SOURCE = "agent-commerce-mcp:consultation";

export const requestProductConsultationTitle = "Request a product consultation";
export const requestProductConsultationDescription =
  "Submit a buyer's opt-in request for a product consultation. This tool may only be called after the buyer explicitly asks to be contacted.";

export const requestProductConsultationInput = {
  product_slug: z
    .enum(["agentfetch", "queryshield", "agent_commerce"])
    .describe("Product the buyer explicitly requested a consultation about"),
  email: z.string().email().describe("Email address where the buyer explicitly asked to be contacted"),
  name: z.string().optional().describe("Optional buyer name"),
};

type ProductSlug = "agentfetch" | "queryshield" | "agent_commerce";

type TrackEvent = Omit<AnalyticsEvent, "ts">;

interface ConsultationDependencies {
  leadCaptureUrl?: string;
  fetchImpl?: typeof fetch;
  trackImpl?: (event: TrackEvent) => void;
}

interface ConsultationArgs {
  product_slug: ProductSlug;
  email: string;
  name?: string;
}

function errorResult(error: string) {
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error }) }],
  };
}

export function createRequestProductConsultationTool({
  leadCaptureUrl = config.salesbot.leadCaptureUrl,
  fetchImpl = fetch,
  trackImpl = track,
}: ConsultationDependencies = {}) {
  return async function requestProductConsultationTool(args: ConsultationArgs) {
    if (!leadCaptureUrl.trim()) {
      return errorResult(
        "Product consultation capture is not configured. No consultation request was submitted.",
      );
    }

    let response: Response;
    try {
      response = await fetchImpl(leadCaptureUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: args.email,
          product: args.product_slug,
          ...(args.name === undefined ? {} : { name: args.name }),
          source: CONSULTATION_SOURCE,
        }),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return errorResult("Salesbot could not be reached. No consultation was captured.");
    }

    if (!response.ok) {
      return errorResult(
        "Salesbot did not accept the consultation request. No consultation was captured.",
      );
    }

    let confirmation: unknown;
    try {
      confirmation = await response.json();
    } catch {
      return errorResult("Salesbot returned an invalid confirmation. No consultation was captured.");
    }

    if (
      typeof confirmation !== "object" ||
      confirmation === null ||
      !("ok" in confirmation) ||
      confirmation.ok !== true ||
      !("lead_id" in confirmation) ||
      typeof confirmation.lead_id !== "number" ||
      !Number.isFinite(confirmation.lead_id)
    ) {
      return errorResult("Salesbot returned an invalid confirmation. No consultation was captured.");
    }

    const leadId = confirmation.lead_id;
    trackImpl({
      tool: "request_product_consultation",
      action: "consultation",
      product_slug: args.product_slug,
      metadata: { outcome: "captured" },
    });

    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            ok: true,
            lead_id: leadId,
            product_slug: args.product_slug,
            next_step:
              "A product specialist will contact the buyer at the email address they provided.",
          }),
        },
      ],
    };
  };
}

export const requestProductConsultationTool = createRequestProductConsultationTool();
