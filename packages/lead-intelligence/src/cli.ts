import { resolve } from "node:path";
import { importSalvador } from "./ingestion.js";

const [, , command, ...args] = process.argv;
if (command !== "import-salvador") throw new Error("Usage: import-salvador [--db path] [--limit number|full] [--all-statuses]");
const value = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const limitValue = value("--limit") ?? "1000";
const result = await importSalvador({
  databasePath: resolve(value("--db") ?? "data/lead-intelligence.duckdb"),
  limit: limitValue === "full" ? null : Number(limitValue),
  activeOnly: !args.includes("--all-statuses"),
  includeRelations: !args.includes("--no-relations"),
});
console.log(JSON.stringify(result, null, 2));
