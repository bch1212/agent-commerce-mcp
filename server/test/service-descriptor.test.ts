import assert from "node:assert/strict";
import test from "node:test";

import { catalog } from "../src/catalog.js";
import { serviceDescriptor } from "../src/service-descriptor.js";

test("public service descriptor derives catalog counts from the runtime catalog", () => {
  const descriptor = serviceDescriptor();

  assert.equal(descriptor.products, catalog.products.length);
  assert.equal(descriptor.mcp_servers, catalog.mcp_servers.length);
  assert.equal(descriptor.products, 14);
  assert.equal(descriptor.mcp_servers, 11);
});
