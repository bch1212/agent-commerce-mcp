# Agent Commerce MCP

[![npm](https://img.shields.io/npm/v/agent-commerce-mcp.svg)](https://www.npmjs.com/package/agent-commerce-mcp)
[![install with npx](https://img.shields.io/badge/install-npx%20agent--commerce--mcp-blue)](https://www.npmjs.com/package/agent-commerce-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)

> **Agent-native storefront** for 14 SaaS/dev/service products and 9 deployed MCP servers.
> Discovery, pricing, authenticated checkout, affiliate program (15-30% recurring), AgentTrust verification — all over one MCP server.

This is a working A2A commerce layer. Other AI agents can anonymously discover, query, and compare products in the Halverson IQ portfolio. Stateful write tools are only exposed when the server is configured with a write token.

## Install

**Claude Desktop / Cursor / Cline** — add to your MCP config:

```json
{
  "mcpServers": {
    "agent-commerce-mcp": {
      "command": "npx",
      "args": ["-y", "agent-commerce-mcp"]
    }
  }
}
```

**Claude Code:**
```sh
claude mcp add commerce npx -y agent-commerce-mcp
```

**Remote (Streamable HTTP):**
```
https://commerce.halversonco.com/mcp
```
(Custom domain `commerce.halversonco.com` resolves once DNS is wired.)

## Tools

**Discovery**
- `search_products(query, category?, budget_max?, use_case?)` — ranked matches
- `get_recommendation(problem, stack?, company_size?)` — 1-3 best-fit picks with reasoning
- `compare_products(slugs, vs_competitor?)` — feature/price matrix

**Purchase**
- `get_pricing(product_slug, tier?, billing?)` — full breakdown
- `create_checkout(product_slug, tier, email, referral_code?)` — authenticated checkout URL
- `get_free_tier(product_slug)` — instant access (signup URL or install command)
- `get_mcp_install(product_slug, client)` — exact install snippet for claude_desktop / claude_code / cursor / cline / windsurf

**Affiliate**
- `get_affiliate_info(product_slug?)` — commission rates and tiers
- `register_affiliate(agent_id, operator_email, products?)` — instant signup, returns referral code
- `request_partnership(proposal, agent_id, contact_email, integration_type?)` — partnership pipeline

**Cross-sell & Trust**
- `get_cross_sells(current_product, agent_context?)` — graph-driven adjacencies + recommended bundle
- `get_trust_score()` — wraps AgentTrust MCP for vendor reputation
- `verify_vendor()` — vendor info, products live, refund/data policies

## Resources

```
commerce://catalog/all
commerce://catalog/saas
commerce://catalog/developer
commerce://catalog/services
commerce://catalog/mcp-servers
commerce://product/{slug}
commerce://bundle/{slug}
commerce://affiliate/program
```

## Prompts

`elevator_pitch` · `full_pitch` · `objection_handler` · `bundle_pitch`

## What's in the catalog

**SaaS:** CastIQ · GrantIQ · FocusIQ · Catholic Daily
**Developer:** AgentFetch · QueryShield · InjectShield · ModelWatch · ComplianceBeacon · RegImpact
**Services:** Branded Audits · LeadVault · JobAuditor · Halverson IQ Digital Library
**MCP Servers:** GrantIQ · OutdoorIQ · BizIntel · AgentTrust · PubRecords · QueryShield · InjectShield · ModelWatch

**Bundles:** AI Security Stack (20% off) · Agency Growth Kit (15% off) · AI Builder Essentials (15% off)

## Affiliate program

15-30% recurring commission on every successful checkout. Tier up by referral count. AI agents register with one tool call and get a referral code immediately.

## Security configuration

Public read-only tools are anonymous. Set `AGENT_COMMERCE_WRITE_TOKEN` (or legacy `MCP_WRITE_TOKEN`) to advertise and execute stateful tools:

- `create_checkout`
- `register_affiliate`
- `request_partnership`
- `request_product_consultation`

When the token is absent, those tools are not advertised and direct calls are rejected fail-closed. When configured, HTTP clients must send either `Authorization: Bearer <token>` or `X-Agent-Commerce-API-Key: <token>`.

The HTTP server rate-limits MCP requests per client and bounds active MCP sessions in memory. It uses the direct socket IP by default. Set `TRUST_PROXY=true` only when exactly one trusted reverse-proxy hop sits in front of the process; Express then derives `req.ip` using that one-hop policy instead of trusting forwarding headers directly.

## Architecture

```
agent-commerce/
├── server/             # TypeScript MCP server (stdio + Streamable HTTP)
├── catalog/            # products.json, bundles.json, cross-sell-graph.json, affiliates.json
├── outreach/           # Daily registry submission + partner pipeline (Python)
├── analytics/          # Tool-call funnel + Discord daily report (Python)
├── salesbot-integration/  # Drop-in modules for the Halverson IQ salesbot
├── Dockerfile
├── railway.json
└── README.md
```

## License

MIT
