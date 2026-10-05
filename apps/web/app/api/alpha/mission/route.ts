import { NextResponse } from "next/server";
import { executeAlphaMission } from "../../../lib/alpha-mission";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { intent?: unknown };
    if (typeof body.intent !== "string") {
      return NextResponse.json({ error: "A string intent is required." }, { status: 400 });
    }
    return NextResponse.json(await executeAlphaMission(body.intent));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Mission execution failed.";
    const status = /required|2000 characters/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
