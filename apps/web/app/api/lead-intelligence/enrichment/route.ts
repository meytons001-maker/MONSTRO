import { NextResponse } from "next/server";
import { databasePath, leadModule, publicError } from "../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try { const cnpj = new URL(request.url).searchParams.get("cnpj") ?? ""; const { getDigitalDiscoveries } = await leadModule(); return NextResponse.json({ items: await getDigitalDiscoveries(databasePath(), cnpj) }); }
  catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: string; cnpj?: string; cnpjs?: string[]; candidateUrl?: string; force?: boolean; concurrency?: number };
    const module = await leadModule();
    if(body.action==="automatic")return NextResponse.json(await module.automaticallyEnrichCompany(databasePath(),body.cnpj??"",{force:body.force}),{status:201});
    if(body.action==="batch"){
      const cnpjs=[...new Set(body.cnpjs??[])].slice(0,20);if(!cnpjs.length)return NextResponse.json({error:"Selecione ao menos uma empresa."},{status:400});
      const concurrency=Math.min(3,Math.max(1,body.concurrency??2));const results:Array<unknown>=new Array(cnpjs.length);let cursor=0;
      await Promise.all(Array.from({length:Math.min(concurrency,cnpjs.length)},async()=>{while(cursor<cnpjs.length){const index=cursor++;results[index]=await module.automaticallyEnrichCompany(databasePath(),cnpjs[index],{force:body.force})}}));
      return NextResponse.json({total:cnpjs.length,completed:results.length,results},{status:201});
    }
    return NextResponse.json(await module.enrichFromPublicWebsite(databasePath(), body.cnpj ?? "", body.candidateUrl ?? ""), { status: 201 });
  }
  catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 400 }); }
}
