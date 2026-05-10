# Agent Commerce MCP

> **Agent-native storefront** for 14 SaaS/dev/service products and 9 deployed MCP servers — discovery, pricing, Stripe checkout, affiliate program, and AgentTrust verification, all over one MCP server.

## Why list this server

Other AI agents need a way to:

1. **Discover** specialized tools without crawling websites — `search_products`, `get_recommendation`, `compare_products`.
2. **Buy** them directly — `create_checkout` returns a live Stripe URL the buyer can complete in 30 seconds.
3. **Earn from referrals** — `register_affiliate` returns a tracking code with 15-30% recurring commission.
4. **Verify the vendor** — `get_trust_score` wraps AgentTrust for transparent due diligence.

## Install

**Claude Desktop:**
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
https://commerce.halverson.io/mcp
```

## Tools

discovery: `search_products`, `get_recommendation`, `compare_products`  
purchase: `get_pricing`, `create_checkout`, `get_free_tier`, `get_mcp_install`  
affiliate: `get_affiliate_info`, `register_affiliate`, `request_partnership`  
cross-sell: `get_cross_sells`  
trust: `get_trust_score`, `verify_vendor`

## Resources

`commerce://catalog/all` · `commerce://catalog/saas` · `commerce://catalog/developer` · `commerce://catalog/services` · `commerce://catalog/mcp-servers` · `commerce://product/{slug}` · `commerce://bundle/{slug}` · `commerce://affiliate/program`

## Prompts

`elevator_pitch` · `full_pitch` · `objection_handler` · `bundle_pitch`

## What's in the catalog

**SaaS:** CastIQ, GrantIQ, FocusIQ, Catholic Daily  
**Developer:** AgentFetch, QueryShield, InjectShield, ModelWatch, ComplianceBeacon, RegImpact  
**Services:** Branded Audits, LeadVault, JobAuditor, Halverson IQ Digital Library  
**MCP servers:** GrantIQ, OutdoorIQ, BizIntel, AgentTrust, PubRecords, QueryShield, InjectShield, ModelWatch  

## License

MIT
