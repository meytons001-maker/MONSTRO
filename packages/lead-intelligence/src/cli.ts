import { resolve } from "node:path";
import { importSalvador } from "./ingestion.js";
import { auditDatabase } from "./audit.js";
import { runControlledEnrichmentSample } from "./enrichment.js";

const [, , command, ...args] = process.argv;
const value = (name: string) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const databasePath = resolve(value("--db") ?? "data/lead-intelligence.duckdb");
if (command === "audit") {
  console.log(JSON.stringify(await auditDatabase(databasePath), null, 2));
  process.exit(0);
}
if (command === "enrich-sample") {
  const limit = Number(value("--limit") ?? 20);
  console.log(JSON.stringify(await runControlledEnrichmentSample(databasePath, limit), null, 2));
  process.exit(0);
}
if (command !== "import-salvador") throw new Error("Usage: import-salvador|audit [--db path] [--limit number|full] [--all-statuses] [--source-dir path]");
const limitValue = value("--limit") ?? "1000";
const result = await importSalvador({
  databasePath,
  limit: limitValue === "full" ? null : Number(limitValue),
  activeOnly: !args.includes("--all-statuses"),
  includeRelations: !args.includes("--no-relations"),
  sourceDirectory: value("--source-dir") ? resolve(value("--source-dir")!) : undefined,
});
console.log(JSON.stringify(result, null, 2));

