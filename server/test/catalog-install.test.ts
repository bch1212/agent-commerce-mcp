import assert from "node:assert/strict";
import test from "node:test";

import { catalog } from "../src/catalog.js";

const expectedMcps = [
  {
    slug: "agentfetch_mcp",
    name: "AgentFetch MCP",
    endpoint: undefined,
    npm: undefined,
    install_command: "uvx --from agentfetch-mcp==1.0.1 agentfetch-mcp",
    registry_id: "io.github.bch1212/agentfetch",
    repository: "https://github.com/bch1212/agentfetch-mcp",
  },
  {
    slug: "grantiq_mcp",
    name: "GrantIQ MCP",
    endpoint: "https://mcp.grantiq.us/mcp/",
    npm: undefined,
    install_command: undefined,
    registry_id: "io.github.bch1212/mcp-grantiq",
    repository: "https://github.com/bch1212/mcp-grantiq",
  },
  {
    slug: "outdooriq_mcp",
    name: "OutdoorIQ MCP",
    endpoint: "https://mcp.castiq.net/mcp",
    npm: undefined,
    install_command: undefined,
    registry_id: "io.github.bch1212/outdooriq-mcp",
    repository: "https://github.com/bch1212/outdooriq-mcp",
  },
  {
    slug: "bizintel_mcp",
    name: "BizIntel MCP",
    endpoint: "https://mcp-bizintel-production.up.railway.app/mcp",
    npm: undefined,
    install_command: undefined,
    registry_id: "io.github.bch1212/bizintel",
    repository: "https://github.com/bch1212/mcp-bizintel",
  },
  {
    slug: "agenttrust_mcp",
    name: "AgentTrust MCP",
    endpoint: "https://agenttrust-mcp-production.up.railway.app/mcp",
    npm: undefined,
    install_command: undefined,
    registry_id: "io.github.bch1212/agenttrust",
    repository: "https://github.com/bch1212/agenttrust-mcp",
  },
  {
    slug: "pubrecords_mcp",
    name: "PubRecords MCP",
    endpoint: "https://mcp-pubrecords-production.up.railway.app/mcp/",
    npm: undefined,
    install_command: undefined,
    registry_id: "io.github.bch1212/pubrecords",
    repository: "https://github.com/bch1212/mcp-pubrecords",
  },
  {
    slug: "queryshield_mcp",
    name: "QueryShield MCP",
    endpoint: "https://queryshield-api-production.up.railway.app/mcp/",
    npm: undefined,
    install_command: "uvx --from queryshield-mcp==1.0.1 queryshield-mcp",
    registry_id: "io.github.bch1212/queryshield",
    repository: "https://github.com/bch1212/queryshield",
  },
  {
    slug: "injectshield_mcp",
    name: "InjectShield MCP",
    endpoint: undefined,
    npm: "@injectshield/mcp",
    install_command: "npx -y @injectshield/mcp",
    registry_id: "io.github.bch1212/injectshield",
    repository: "https://github.com/bch1212/injectshield",
  },
  {
    slug: "modelwatch_mcp",
    name: "ModelWatch MCP",
    endpoint: undefined,
    npm: "modelwatch-mcp",
    install_command: "npx -y modelwatch-mcp",
    registry_id: "io.github.bch1212/modelwatch",
    repository: "https://github.com/bch1212/modelwatch",
  },
  {
    slug: "agent_commerce_mcp",
    name: "Agent Commerce MCP",
    endpoint: "https://commerce.halversonco.com/mcp",
    npm: "agent-commerce-mcp",
    install_command: "npx -y agent-commerce-mcp",
    registry_id: "io.github.bch1212/agent-commerce-mcp",
    repository: "https://github.com/bch1212/agent-commerce-mcp",
  },
  {
    slug: "agentvault_mcp",
    name: "AgentVault MCP",
    endpoint: undefined,
    npm: "agentvault-mcp",
    install_command: "npx -y agentvault-mcp",
    registry_id: "io.github.bch1212/agentvault",
    repository: "https://github.com/bch1212/agentvault",
  },
] as const;

test("catalog exposes the complete canonical 11-MCP portfolio", () => {
  assert.equal(catalog.mcp_servers.length, expectedMcps.length);
  assert.deepEqual(
    catalog.mcp_servers.map((mcp) => mcp.slug),
    expectedMcps.map((mcp) => mcp.slug),
  );

  for (const expected of expectedMcps) {
    const actual = catalog.mcp_servers.find((mcp) => mcp.slug === expected.slug);
    assert.ok(actual, `${expected.name} must be in the MCP catalog`);
    assert.equal(actual.name, expected.name);
    assert.equal(actual.endpoint, expected.endpoint);
    assert.equal(actual.npm, expected.npm);
    assert.equal(actual.install_command, expected.install_command);
    assert.equal(actual.registry_id, expected.registry_id);
    assert.equal(actual.repository, expected.repository);
    assert.equal(actual.docs, `${expected.repository}#readme`);
    assert.ok(actual.description.length > 20, `${expected.name} needs buyer-facing copy`);
    assert.ok(actual.tiers.length > 0, `${expected.name} needs at least one advertised tier`);
  }
});

test("AgentFetch product install commands still use the published PyPI package", () => {
  const agentFetch = catalog.products.find((product) => product.slug === "agentfetch");
  const command = "uvx --from agentfetch-mcp==1.0.1 agentfetch-mcp";

  assert.ok(agentFetch, "AgentFetch must remain in the product catalog");
  assert.equal(agentFetch.free_tier_command, command);
  assert.deepEqual(JSON.parse(agentFetch.mcp_install?.claude_desktop ?? "null"), {
    mcpServers: {
      agentfetch: {
        command: "uvx",
        args: ["--from", "agentfetch-mcp==1.0.1", "agentfetch-mcp"],
      },
    },
  });
});

test("MCP-enabled product rows use the corrected live packages and endpoints", () => {
  const queryShield = catalog.products.find((product) => product.slug === "queryshield");
  const modelWatch = catalog.products.find((product) => product.slug === "modelwatch");

  assert.equal(queryShield?.mcp_endpoint, "https://queryshield-api-production.up.railway.app/mcp/");
  assert.equal(modelWatch?.mcp_install_npm, "modelwatch-mcp");
  assert.equal(modelWatch?.free_tier_command, "npx -y modelwatch-mcp");
  assert.deepEqual(JSON.parse(modelWatch?.mcp_install?.claude_desktop ?? "null"), {
    mcpServers: {
      modelwatch: {
        command: "npx",
        args: ["-y", "modelwatch-mcp"],
      },
    },
  });
});

test("MCP rows with existing paid products use explicit purchase mappings", () => {
  for (const [mcpSlug, productSlug] of [
    ["agentfetch_mcp", "agentfetch"],
    ["queryshield_mcp", "queryshield"],
    ["injectshield_mcp", "injectshield"],
    ["modelwatch_mcp", "modelwatch"],
  ]) {
    const mcp = catalog.mcp_servers.find((entry) => entry.slug === mcpSlug);
    assert.equal(mcp?.purchase?.product_slug, productSlug);
  }
});

test("AgentVault advertises only its working stdio package", () => {
  const vault = catalog.mcp_servers.find((entry) => entry.slug === "agentvault_mcp");
  assert.ok(vault);
  assert.equal(vault.npm, "agentvault-mcp");
  assert.equal(vault.install_command, "npx -y agentvault-mcp");
  assert.equal(vault.endpoint, undefined);
  assert.equal(vault.alt_endpoint, undefined);
});
