import { NextResponse } from "next/server";
import { databasePath, leadModule, publicError } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const cnpj = new URL(request.url).searchParams.get("cnpj") ?? ""; const { getDigitalDiscoveries } = await leadModule(); return NextResponse.json({ items: await getDigitalDiscoveries(databasePath(), cnpj) }); }
  catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try { const body = await request.json() as { cnpj?: string; candidateUrl?: string }; const { enrichFromPublicWebsite } = await leadModule(); return NextResponse.json(await enrichFromPublicWebsite(databasePath(), body.cnpj ?? "", body.candidateUrl ?? ""), { status: 201 }); }
  catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

