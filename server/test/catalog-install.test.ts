import assert from "node:assert/strict";
import test from "node:test";

import { bundles, catalog, crossSell } from "../src/catalog.js";
import { searchProductsTool } from "../src/tools/discovery.js";
import { getCrossSellsTool } from "../src/tools/cross-sell.js";
import { getFreeTierTool, getMcpInstallTool } from "../src/tools/purchase.js";

function payload(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

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

test("catalog exposes the complete canonical 9-MCP portfolio", () => {
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
  assert.match(vault.description, /folds into the QueryShield agent security suite/);
});

test("catalog models every known required MCP credential", () => {
  const expected = new Map([
    ["grantiq_mcp", ["header", "X-API-Key", "<YOUR_X_API_KEY>"]],
    ["outdooriq_mcp", ["header", "X-API-Key", "<YOUR_X_API_KEY>"]],
    ["pubrecords_mcp", ["header", "X-API-Key", "<YOUR_X_API_KEY>"]],
    ["injectshield_mcp", ["env", "INJECTSHIELD_API_KEY", "<YOUR_INJECTSHIELD_API_KEY>"]],
    ["modelwatch_mcp", ["env", "MODELWATCH_API_KEY", "<YOUR_MODELWATCH_API_KEY>"]],
  ] as const);

  for (const [slug, [location, name, placeholder]] of expected) {
    const mcp = catalog.mcp_servers.find((entry) => entry.slug === slug);
    assert.ok(mcp, `${slug} must exist`);
    assert.deepEqual(mcp.credentials, [
      {
        location,
        name,
        required: true,
        placeholder,
      },
    ]);
  }
});

test("free-tier and install outputs include usable remote header placeholders", async () => {
  const free = payload(await getFreeTierTool({ product_slug: "grantiq_mcp" }));
  assert.deepEqual(free.credential_requirements, [
    {
      location: "header",
      name: "X-API-Key",
      required: true,
      placeholder: "<YOUR_X_API_KEY>",
    },
  ]);

  const desktop = payload(await getMcpInstallTool({ product_slug: "grantiq_mcp", client: "claude_desktop" }));
  assert.deepEqual(JSON.parse(desktop.install_command), {
    mcpServers: {
      grantiq_mcp: {
        url: "https://mcp.grantiq.us/mcp/",
        transport: "http",
        headers: { "X-API-Key": "<YOUR_X_API_KEY>" },
      },
    },
  });
  assert.deepEqual(desktop.credential_requirements, free.credential_requirements);

  const code = payload(await getMcpInstallTool({ product_slug: "grantiq_mcp", client: "claude_code" }));
  assert.equal(
    code.install_command,
    'claude mcp add --transport http grantiq_mcp https://mcp.grantiq.us/mcp/ --header "X-API-Key: <YOUR_X_API_KEY>"',
  );
});

test("stdio install outputs include required API-key environment placeholders", async () => {
  const injectDesktop = payload(
    await getMcpInstallTool({ product_slug: "injectshield_mcp", client: "claude_desktop" }),
  );
  assert.equal(
    JSON.parse(injectDesktop.install_command).mcpServers.injectshield_mcp.env.INJECTSHIELD_API_KEY,
    "<YOUR_INJECTSHIELD_API_KEY>",
  );

  const modelWatchCode = payload(
    await getMcpInstallTool({ product_slug: "modelwatch_mcp", client: "claude_code" }),
  );
  assert.equal(
    modelWatchCode.install_command,
    "claude mcp add modelwatch_mcp --env MODELWATCH_API_KEY=<YOUR_MODELWATCH_API_KEY> -- npx -y modelwatch-mcp",
  );
  assert.deepEqual(modelWatchCode.credential_requirements, [
    {
      location: "env",
      name: "MODELWATCH_API_KEY",
      required: true,
      placeholder: "<YOUR_MODELWATCH_API_KEY>",
    },
  ]);
});

test("category=mcp discovery returns the complete 9-server portfolio", async () => {
  const body = payload(await searchProductsTool({ query: "mcp", category: "mcp" }));
  assert.equal(body.count, 9);
  assert.deepEqual(
    new Set(body.results.map((result: { slug: string }) => result.slug)),
    new Set(catalog.mcp_servers.map((entry) => entry.slug)),
  );
  assert.ok(body.results.every((result: { category: string }) => result.category === "mcp"));
});

const retiredSlugs = [
  "agenttrust",
  "agenttrust_mcp",
  "agentfetch-reddit-listener",
  "bizintel",
  "bizintel_mcp",
  "mcp-bizintel",
  "airbnb-guidebook-concierge-kit",
  "bad-review-save-kit",
  "cleaning-sop-qa-pack",
  "escape-room-empty-slot-recovery",
  "gbp-quick-win-audit",
  "missed-call-rescue-kit",
  "no-show-leak-fix-groomers",
  "saas-homepage-teardown-sprint",
  "testimonial-proof-pack",
  "venue-inquiry-leak-audit",
  "venue-inquiry-response-audit",
];

test("retired offers are absent from the catalog and search results", async () => {
  const listed = new Set([...catalog.products, ...catalog.mcp_servers].map((entry) => entry.slug));
  for (const slug of retiredSlugs) {
    assert.equal(listed.has(slug), false, `${slug} must not be offered`);
  }

  for (const query of ["agenttrust", "bizintel", "mcp-bizintel", "airbnb guidebook concierge kit", "venue inquiry leak"]) {
    const body = payload(await searchProductsTool({ query }));
    for (const result of body.results as Array<{ slug: string }>) {
      assert.equal(retiredSlugs.includes(result.slug), false, `${query} recommended ${result.slug}`);
    }
  }
});

test("consolidated entries keep their existing endpoints and describe the new portfolio", () => {
  const grantIq = catalog.products.find((product) => product.slug === "grantiq");
  const grantMcp = catalog.mcp_servers.find((entry) => entry.slug === "grantiq_mcp");
  const pubRecords = catalog.mcp_servers.find((entry) => entry.slug === "pubrecords_mcp");
  const outdoor = catalog.mcp_servers.find((entry) => entry.slug === "outdooriq_mcp");
  const modelWatch = catalog.products.find((product) => product.slug === "modelwatch");
  const modelWatchMcp = catalog.mcp_servers.find((entry) => entry.slug === "modelwatch_mcp");
  const queryShield = catalog.products.find((product) => product.slug === "queryshield");
  const daily = catalog.products.find((product) => product.slug === "catholic_daily");
  const securityStack = bundles.find((bundle) => bundle.slug === "ai_security_stack");

  assert.ok(grantIq && grantMcp && pubRecords && outdoor && modelWatch && modelWatchMcp && queryShield && daily && securityStack);

  assert.equal(grantIq.url, "https://grantiq.us");
  assert.equal(grantMcp.endpoint, "https://mcp.grantiq.us/mcp/");
  assert.equal(pubRecords.endpoint, "https://mcp-pubrecords-production.up.railway.app/mcp/");
  assert.equal(outdoor.endpoint, "https://mcp.castiq.net/mcp");
  assert.match(grantIq.description, /Halverson IQ Data/);
  assert.match(grantMcp.description, /Halverson IQ Data/);
  assert.match(pubRecords.description, /Halverson IQ Data/);
  assert.match(outdoor.description, /CastIQ API tier/);
  assert.match(modelWatch.description, /ToolPulse is now part of ModelWatch for tool monitoring/);
  assert.match(modelWatchMcp.description, /ToolPulse is now part of ModelWatch for tool monitoring/);
  assert.match(queryShield.description, /QueryShield agent security suite/);
  assert.deepEqual(securityStack.products, ["injectshield", "queryshield", "modelwatch"]);
  assert.equal(securityStack.products.includes("agentvault"), false);

  assert.equal(daily.name, "Catholic Daily");
  assert.equal(daily.url, "https://catholicdaily.app");
  assert.equal(daily.tagline, "Daily Mass readings, saints, and prayer for Catholic faithful");
  assert.equal(
    daily.description,
    "AI-curated daily readings, saint stories, and contemplative prayer prompts. Designed for daily use by Catholic faithful.",
  );

  assert.equal(crossSell.graph.branded_audits.includes("bizintel_mcp"), false);
  assert.equal(crossSell.graph.leadvault.includes("bizintel_mcp"), false);

  const changeOrder = [...catalog.products, ...catalog.mcp_servers].find(
    (entry) => entry.slug === "changeorderfast",
  );
  if (changeOrder) {
    assert.equal(retiredSlugs.includes(changeOrder.slug), false);
  }
});

test("Halverson IQ Data searches keep the existing GrantIQ and PubRecords entries", async () => {
  const body = payload(await searchProductsTool({ query: "Halverson IQ Data" }));
  const slugs = body.results.map((result: { slug: string }) => result.slug);
  assert.ok(slugs.includes("grantiq"));
  assert.ok(slugs.includes("grantiq_mcp"));
  assert.ok(slugs.includes("pubrecords_mcp"));
  assert.equal(body.results.every((result: { url?: string }) => !String(result.url).includes("halverson-iq-data")), true);
});

test("ToolPulse searches resolve to ModelWatch", async () => {
  const body = payload(await searchProductsTool({ query: "toolpulse" }));
  const slugs = body.results.map((result: { slug: string }) => result.slug);
  assert.ok(slugs.includes("modelwatch"));
  assert.ok(slugs.includes("modelwatch_mcp"));
  assert.equal(slugs.includes("toolpulse"), false);
});

test("cross-sells do not route buyers to retired BizIntel", async () => {
  for (const slug of ["branded_audits", "leadvault"]) {
    const body = payload(await getCrossSellsTool({ current_product: slug }));
    assert.ok(
      body.related_products.every((product: { slug: string }) => product.slug !== "bizintel_mcp"),
      `${slug} still cross-sells BizIntel`,
    );
  }
});
