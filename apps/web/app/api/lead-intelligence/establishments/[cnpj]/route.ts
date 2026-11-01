import { NextResponse } from "next/server";
import { databasePath, leadModule, publicError } from "../../server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ cnpj: string }> }) {
  try {
    const { cnpj } = await context.params;
    const { getEstablishmentDossier, scoreCommercialRecord } = await leadModule();
    const dossier = await getEstablishmentDossier(databasePath(), cnpj.replace(/\D/g, ""));
    if (!dossier) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    return NextResponse.json({ ...dossier, scores: scoreCommercialRecord(dossier.establishment), questions: ["Como a empresa organiza atendimento e operação hoje?", "Quais tarefas mais consomem tempo da equipe?", "Existe plano confirmado de expansão?"], approachDraft: `Olá! Encontrei os dados cadastrais públicos de ${dossier.establishment.trade_name ?? dossier.establishment.legal_name ?? dossier.establishment.cnpj}. Gostaria de entender como vocês organizam a operação hoje. Posso fazer algumas perguntas?` });
  } catch (error) { return NextResponse.json({ error: publicError(error) }, { status: 500 }); }
}

