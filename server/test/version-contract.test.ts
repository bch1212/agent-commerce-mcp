import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { config } from "../src/config.js";

const packageUrl = new URL("../package.json", import.meta.url);
const manifestUrl = new URL("../server.json", import.meta.url);

test("runtime, npm package, and MCP Registry manifest share release version", async () => {
  const packageJson = JSON.parse(await readFile(packageUrl, "utf8")) as { version: string };
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as {
    version: string;
    packages: Array<{ version: string }>;
  };

  assert.equal(packageJson.version, "0.1.4");
  assert.equal(config.serverVersion, packageJson.version);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.packages[0]?.version, packageJson.version);
});
