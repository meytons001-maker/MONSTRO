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
    segmentPrecision: segment && ["pizzaria", "pizzarias", "lanchonete", "lanchonetes", "cafeteria", "cafeterias", "hamburgueria", "hamburguerias"].includes(segment)
      ? "CNAE 5611203 agrupa lanchonetes, casas de chá, sucos e similares; o subtipo exige fonte adicional"
      : "CNAE cadastral principal",
  };
}

export function scoreCommercialRecord(record: Record<string, unknown>, targetCnaes: string[] = []) {
  const completenessReasons: string[] = []; let completeness = 0;
  if (record.phone_1 || record.phone_2) { completeness += 25; completenessReasons.push("telefone publicado (+25)"); }
  if (record.email) { completeness += 25; completenessReasons.push("e-mail publicado (+25)"); }
  if (record.trade_name) { completeness += 15; completenessReasons.push("nome fantasia (+15)"); }
  if (record.neighborhood && record.street) { completeness += 20; completenessReasons.push("endereço e bairro (+20)"); }
  if (record.primary_cnae) { completeness += 15; completenessReasons.push("CNAE principal (+15)"); }
  const fitReasons: string[] = []; let productFit = 0;
  if (record.registration_status === "02") { productFit += 20; fitReasons.push("cadastro ativo (+20)"); }
  if (!targetCnaes.length || targetCnaes.includes(String(record.primary_cnae))) { productFit += 60; fitReasons.push("CNAE no filtro solicitado (+60)"); }
  if (record.xmenu || record.cotare) { productFit += 20; fitReasons.push("segmentação de produto configurada (+20)"); }
  return {
    completeness: { score: completeness, reasons: completenessReasons },
    productFit: { score: productFit, reasons: fitReasons },
    engagement: { score: 0, reasons: ["nenhuma interação comercial registrada"] },
    priority: Math.round(completeness * 0.35 + productFit * 0.45),
    meaning: "prioridade de investigação; engajamento só aumenta após interações registradas",
  };
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
    scores: scoreCommercialRecord(record, criteria.cnaes),
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
