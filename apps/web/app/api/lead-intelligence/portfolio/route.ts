import { NextResponse } from "next/server";
import type { CommercialStage } from "@monstro/lead-intelligence";
import { databasePath, leadModule, publicError } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const cnpj = url.searchParams.get("cnpj"); const { getCommercialAccount, listCommercialAccounts } = await leadModule();
    return NextResponse.json(cnpj ? await getCommercialAccount(databasePath(), cnpj, url.searchParams.get("product") ?? undefined) : { items: await listCommercialAccounts(databasePath()) });
  } catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, string | undefined>; const module = await leadModule();
    if (body.action === "interaction") return NextResponse.json(await module.registerCommercialInteraction(databasePath(), { cnpj: body.cnpj ?? "", product: body.product ?? "", interactionType: body.interactionType ?? "", summary: body.summary ?? "", owner: body.owner, occurredAt: body.occurredAt, nextActivityAt: body.nextActivityAt }), { status: 201 });
    return NextResponse.json(await module.upsertCommercialAccount(databasePath(), { cnpj: body.cnpj ?? "", product: body.product ?? "", owner: body.owner, stage: (body.stage ?? "new") as CommercialStage, nextActivityAt: body.nextActivityAt, notes: body.notes, leadOrigin: body.leadOrigin ?? "lead-intelligence" }), { status: 201 });
  } catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

