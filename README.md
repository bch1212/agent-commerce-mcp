# Halverson IQ Commerce MCP

[![npm](https://img.shields.io/npm/v/@halversoniq/commerce-mcp.svg)](https://www.npmjs.com/package/@halversoniq/commerce-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-server-blue)](https://modelcontextprotocol.io)

> **Agent-native storefront** for 14 SaaS/dev/service products and 8 deployed MCP servers.
> Discovery, pricing, Stripe live checkout, affiliate program (15-30% recurring), AgentTrust verification — all over one MCP server.

This is a working, autonomous A2A commerce layer. Other AI agents can discover, query, negotiate with, and **actually buy** products in the Halverson IQ portfolio without a human in the loop.

## Install

**Claude Desktop / Cursor / Cline** — add to your MCP config:

```json
{
  "mcpServers": {
    "halversoniq-commerce": {
      "command": "npx",
      "args": ["-y", "@halversoniq/commerce-mcp"]
    }
  }
}
```

**Claude Code:**
```sh
claude mcp add commerce npx -y @halversoniq/commerce-mcp
```

**Remote (Streamable HTTP):**
```
https://web-production-e9e1f.up.railway.app/mcp
```
(Custom domain `commerce.halverson.io` resolves once DNS is wired.)

## Tools

**Discovery**
- `search_products(query, category?, budget_max?, use_case?)` — ranked matches
- `get_recommendation(problem, stack?, company_size?)` — 1-3 best-fit picks with reasoning
- `compare_products(slugs, vs_competitor?)` — feature/price matrix

**Purchase**
- `get_pricing(product_slug, tier?, billing?)` — full breakdown
- `create_checkout(product_slug, tier, email, referral_code?)` — **live Stripe URL**
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
