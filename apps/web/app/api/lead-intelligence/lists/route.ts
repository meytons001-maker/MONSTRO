import { NextResponse } from "next/server";
import type { ProductSegment } from "@monstro/lead-intelligence";
import { databasePath, leadModule, publicError } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { getProspectList, listProspectLists } = await leadModule();
    const id = new URL(request.url).searchParams.get("id");
    if (id) {
      const list = await getProspectList(databasePath(), id);
      return list ? NextResponse.json(list) : NextResponse.json({ error: "Lista não encontrada." }, { status: 404 });
    }
    return NextResponse.json({ items: await listProspectLists(databasePath()) });
  } catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { name?: string; product?: ProductSegment; cnpjs?: string[] };
    const { createProspectList } = await leadModule();
    const result = await createProspectList(databasePath(), { name: body.name ?? "", product: body.product, cnpjs: body.cnpjs ?? [] });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

