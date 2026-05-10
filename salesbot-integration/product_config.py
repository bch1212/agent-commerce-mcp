"""
Drop-in entry for the Halverson IQ salesbot's products.py registry.

Append AGENT_COMMERCE_PRODUCT to the salesbot's PRODUCTS dict so the
Distributor and Content Writer agents know about the new commerce MCP and
include it in their content cycles.
"""
from __future__ import annotations

AGENT_COMMERCE_PRODUCT = {
    "slug": "agent_commerce",
    "name": "Agent Commerce MCP",
    "tagline": "Agent-native storefront for the entire Halverson IQ portfolio.",
    "description": (
        "An MCP server that exposes 14 products and 9 deployed MCP servers to other AI agents — "
        "discovery, pricing, Stripe checkout, affiliate program, AgentTrust verification. "
        "When an LLM somewhere needs prompt-injection defense, lead lists, fishing reports, or "
        "any of the rest, our catalog is one MCP call away."
    ),
    "url": "https://commerce.halverson.io",
    "mcp_npm": "agent-commerce-mcp",
    "mcp_endpoint": "https://commerce.halverson.io/mcp",
    "icp": "AI agent developers, MCP client maintainers, agent marketplaces",
    "channels": ["mcp_registries", "developer_twitter", "show_hn", "discord_communities", "reddit_r_mcp"],
    "tiers": [
        {"name": "Free", "price_monthly": 0, "features": ["All discovery + checkout tools", "MCP install commands"]},
    ],
    "content_priorities": [
        "How AI agents can buy software autonomously over MCP",
        "What an A2A storefront should expose",
        "Affiliate program for AI agents (15-30% recurring)",
        "Bundles: AI Security Stack, Agency Growth Kit, AI Builder Essentials",
    ],
    "cross_sells": [
        "agentfetch", "queryshield", "injectshield", "modelwatch",
        "branded_audits", "leadvault", "regimpact", "compliancebeacon",
    ],
}


def register(products_dict: dict) -> dict:
    """Mutates and returns the salesbot's PRODUCTS dict."""
    products_dict[AGENT_COMMERCE_PRODUCT["slug"]] = AGENT_COMMERCE_PRODUCT
    return products_dict
