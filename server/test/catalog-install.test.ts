import assert from "node:assert/strict";
import test from "node:test";

import { catalog } from "../src/catalog.js";

const agentFetch = catalog.products.find((product) => product.slug === "agentfetch");

const UVX_COMMAND = "uvx --from agentfetch-mcp==1.0.1 agentfetch-mcp";

test("AgentFetch catalog exposes install commands for the published PyPI package", () => {
  assert.ok(agentFetch, "AgentFetch must remain in the commerce catalog");
  assert.equal(agentFetch.free_tier_command, UVX_COMMAND);
  assert.deepEqual(JSON.parse(agentFetch.mcp_install?.claude_desktop ?? "null"), {
    mcpServers: {
      agentfetch: {
        command: "uvx",
        args: ["--from", "agentfetch-mcp==1.0.1", "agentfetch-mcp"],
      },
    },
  });
  assert.equal(agentFetch.mcp_install?.cursor, UVX_COMMAND);
  assert.equal(agentFetch.mcp_install?.cline, UVX_COMMAND);
  assert.equal(agentFetch.mcp_install?.windsurf, UVX_COMMAND);
  assert.equal(
    agentFetch.mcp_install?.claude_code,
    "claude mcp add agentfetch -- uvx --from agentfetch-mcp==1.0.1 agentfetch-mcp",
  );
});
