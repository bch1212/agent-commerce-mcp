import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dockerfileUrl = new URL("../../Dockerfile", import.meta.url);

test("Docker build includes scripts required by the package build", async () => {
  const dockerfile = await readFile(dockerfileUrl, "utf8");
  const copyScripts = dockerfile.indexOf("COPY server/scripts ./scripts");
  const copyCatalog = dockerfile.indexOf("COPY catalog /app/catalog");
  const runBuild = dockerfile.indexOf("RUN npm run build");

  assert.notEqual(copyScripts, -1, "Dockerfile must copy server/scripts into the build stage");
  assert.notEqual(copyCatalog, -1, "Dockerfile must copy the catalog used by copy-catalog.mjs");
  assert.notEqual(runBuild, -1, "Dockerfile must run the package build");
  assert.ok(copyScripts < runBuild, "server/scripts must be available before npm run build");
  assert.ok(copyCatalog < runBuild, "catalog must be available before npm run build");
});
