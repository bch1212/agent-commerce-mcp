# Agent Commerce buyer-consultation lead capture plan

Date: 2026-07-26

## Revenue objective

Turn existing Agent Commerce usage and package-download interest into attributable, opt-in buyer conversations without increasing cold-outbound volume.

## Scope

1. Add a `request_product_consultation` MCP tool with a buyer-clear title: **Request a product consultation**.
2. Inputs: consultation-enabled `product_slug` (`agentfetch`, `queryshield`, or `agent_commerce`), valid buyer `email`, and optional `name`. The tool description must say it may only be called after the buyer explicitly asks to be contacted.
3. Submit the opt-in lead to the existing Salesbot `POST /leads/capture` endpoint using source `agent-commerce-mcp:consultation`.
4. Configure the endpoint through `SALESBOT_LEAD_CAPTURE_URL`; when absent, fail closed with a useful configuration response rather than claiming capture.
5. Track only non-PII consultation metadata in the existing analytics stream. Never place the email address or name in analytics metadata.
6. Return the durable Salesbot `lead_id` when capture succeeds and a clear non-success response when Salesbot rejects or cannot accept the product.
7. Add the tool to Agent Commerce MCP instructions and README tool catalog.
8. Add tests for success, configuration absence, upstream rejection, network failure, explicit-consent schema wording, and non-PII analytics.

## Gates

- **Pre-flight gate:** clean branch based on `origin/main`; no new dependency; existing `/health` and MCP tools remain unchanged.
- **Revision gate:** tests, typecheck, and build must pass. Any PII in analytics or false-success response is a blocker.
- **Review gate:** separate spec-compliance review, then separate code-quality/security review. Neither implementer nor controller self-approves.
- **Deploy gate:** push/PR only after both reviews pass. Merge/deploy only if repository and Railway credentials work without paid spend or public-post commitments.
- **Verification gate:** after deployment, require HTTP 200 health, MCP initialize success, tool visibility, and a non-mutating/fail-closed call that does not enroll a real address. Do not manufacture a live lead.

## No-go actions

- No cold email send in this change.
- No public social/community launch post.
- No pricing changes.
- No fake/live buyer submission for testing.
- No secret values in code, tests, logs, or PR text.
