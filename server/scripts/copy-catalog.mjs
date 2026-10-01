import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(packageRoot, "..", "catalog");
const destination = join(packageRoot, "catalog");

if (!existsSync(join(source, "products.json"))) {
  throw new Error(`Catalog source not found at ${source}`);
}

rmSync(destination, { recursive: true, force: true });
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true });
console.log(`Copied runtime catalog to ${destination}`);
