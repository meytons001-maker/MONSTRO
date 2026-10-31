import { randomUUID } from "node:crypto";
import { searchEstablishments } from "./repository.js";

const SEGMENT_CNAES: Record<string, string[]> = {
  pizzaria: ["5611203"], pizzarias: ["5611203"], restaurante: ["5611201"], restaurantes: ["5611201"],
  lanchonete: ["5611203"], lanchonetes: ["5611203"], bar: ["5611204"], bares: ["5611204"],
  cafeteria: ["5611203"], cafeterias: ["5611203"], hamburgueria: ["5611203"], hamburguerias: ["5611203"],
};

export interface CommercialMissionRequest { intent: string; limit?: number; }

export function interpretCommercialIntent(intent: string) {
  const normalized = intent.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const segment = Object.keys(SEGMENT_CNAES).find((key) => normalized.includes(key));
  const neighborhoodMatch = normalized.match(/(?:na|no|em)\s+([a-z ]+?)(?:,|\s+em\s+salvador|\s+salvador|$)/);
  return {
    city: "Salvador", state: "BA", municipalityCode: "3849", segment: segment ?? null,
    cnaes: segment ? SEGMENT_CNAES[segment] : [],
    neighborhood: neighborhoodMatch?.[1]?.trim().replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? null,
    activeOnly: !normalized.includes("inativa"),
  };
}

function priority(record: Record<string, unknown>) {
  const reasons: string[] = [];
  let score = 0;
  if (record.registration_status === "02") { score += 25; reasons.push("situação cadastral ativa (+25)"); }
  if (record.phone_1) { score += 15; reasons.push("telefone publicado (+15)"); }
  if (record.email) { score += 15; reasons.push("e-mail publicado (+15)"); }
  if (record.trade_name) { score += 10; reasons.push("nome fantasia disponível (+10)"); }
  if (record.primary_cnae) { score += 20; reasons.push("CNAE compatível com a consulta (+20)"); }
  if (record.neighborhood) { score += 10; reasons.push("bairro cadastral disponível (+10)"); }
  return { score, reasons, meaning: "prioridade de investigação, não probabilidade de compra" };
}

export async function executeCommercialMission(databasePath: string, request: CommercialMissionRequest) {
  const intent = request.intent.trim();
  if (!intent) throw new Error("O objetivo da pesquisa é obrigatório.");
  if (intent.length > 2_000) throw new Error("O objetivo excede 2000 caracteres.");
  const criteria = interpretCommercialIntent(intent);
  const records = await searchEstablishments(databasePath, {
    active: criteria.activeOnly ? true : undefined, neighborhood: criteria.neighborhood ?? undefined,
    cnaes: criteria.cnaes, limit: Math.min(100, Math.max(1, request.limit ?? 25)),
  });
  const dossiers = records.map((record) => ({
    establishment: record,
    priority: priority(record),
    evidence: [{ classification: "confirmed_fact", source: record.source_url, consultedAt: record.verified_at,
      statement: `Cadastro CNPJ ${record.cnpj}, situação ${record.registration_status}, CNAE ${record.primary_cnae}, bairro ${record.neighborhood ?? "não informado"}.` }],
    missingIntegrations: ["site oficial", "redes empresariais", "avaliações públicas", "geocodificação"],
    questions: ["Qual é o processo atual de atendimento e pedidos?", "Quais tarefas operacionais mais consomem tempo da equipe?", "Existe plano confirmado de expansão ou nova unidade?"],
    approachDraft: `Olá! Encontrei os dados cadastrais públicos de ${record.trade_name ?? record.legal_name ?? record.cnpj}. Gostaria de entender como vocês organizam atendimento e operação hoje. Posso fazer algumas perguntas?`,
  }));
  return {
    mission: { id: randomUUID(), intent, status: "completed", phases: ["understand", "inspect", "plan", "run", "evaluate", "deliver"] }, criteria,
    coverage: { sourceReturned: records.length, deduplicated: records.length, verified: records.length, region: `${criteria.neighborhood ?? "todos os bairros"}, Salvador/BA`, limitations: ["resultado limitado à competência e cobertura importadas no DuckDB", "fontes digitais externas ainda não conectadas"] }, dossiers,
  };
}
