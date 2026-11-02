import { NextResponse } from "next/server";
import { access, stat } from "node:fs/promises";
import { databasePath } from "../lead-intelligence/server";

export const runtime = "nodejs";
export async function GET() {
  try {
    await access(databasePath());
    const database = await stat(databasePath());
    return NextResponse.json({ status: "ok", duckdb: "available", sizeBytes: database.size, checkedAt: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "degraded", duckdb: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
