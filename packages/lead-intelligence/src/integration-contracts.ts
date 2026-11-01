export const COMMERCIAL_INTELLIGENCE_API_VERSION = "v1" as const;

export interface IntelligenceExportEnvelope {
  apiVersion: typeof COMMERCIAL_INTELLIGENCE_API_VERSION;
  exportId: string;
  generatedAt: string;
  sourceProject: "MONSTRO";
  consumerProject: string;
  authorizationReference: string;
  records: Array<{
    cnpj: string;
    competence: string;
    dossierReference?: string;
    productFit?: "xmenu" | "cotare";
    evidenceReferences: string[];
    suggestedNextAction?: string;
  }>;
}

export interface CommercialOutcomeEnvelope {
  apiVersion: typeof COMMERCIAL_INTELLIGENCE_API_VERSION;
  consumerProject: string;
  authorizationReference: string;
  cnpj: string;
  outcome: "contacted" | "replied" | "interest_confirmed" | "demo_requested" | "demo_scheduled" | "negotiating" | "won" | "lost";
  occurredAt: string;
  externalReference: string;
}

// Contracts only: no transport, credentials or automatic synchronization is enabled.
