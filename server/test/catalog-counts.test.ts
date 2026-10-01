import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { listResources } from "../src/resources/catalog.js";

test("public catalog descriptions consistently advertise 11 MCP servers", () => {
  const paths = [
    "../README.md",
    "README.md",
    "../outreach/templates/listing.md",
    "../outreach/engine.py",
    "../salesbot-integration/agent_outreach.py",
    "../salesbot-integration/product_config.py",
    "src/index.ts",
  ];

  for (const path of paths) {
    const content = readFileSync(path, "utf8");
    const counts = [...content.matchAll(/(\d+) MCP servers/g)].map((match) => Number(match[1]));
    assert.ok(counts.length > 0, `${path} must state the public MCP count`);
    assert.deepEqual(new Set(counts), new Set([11]), `${path} has an inconsistent MCP count`);
  }

  const resource = listResources().find((entry) => entry.uri === "commerce://catalog/mcp-servers");
  assert.ok(resource);
  assert.match(resource.description, /11 deployed MCP servers/);
  for (const name of [
    "AgentFetch",
    "GrantIQ",
    "OutdoorIQ",
    "BizIntel",
    "AgentTrust",
    "PubRecords",
    "QueryShield",
    "InjectShield",
    "ModelWatch",
    "Agent Commerce",
    "AgentVault",
  ]) {
    assert.match(resource.description, new RegExp(name));
  }
});