import { catalog } from "./catalog.js";
import { config } from "./config.js";

export function serviceDescriptor() {
  return {
    name: config.serverName,
    version: config.serverVersion,
    mcp_endpoint: "/mcp",
    docs: "https://github.com/bch1212/agent-commerce-mcp",
    products: catalog.products.length,
    mcp_servers: catalog.mcp_servers.length,
  };
}
