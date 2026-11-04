export const SALVADOR_RFB_CODE = "3849";
export const SALVADOR_IBGE_CODE = "2927408";
export const ACTIVE_STATUS = "02";
export const DEFAULT_COMPETENCE = "2026-10";
export const DEFAULT_DATASET = "cnpjaberto/cnpj-dados-receita-brasil-2026-10";

export const SEGMENTS = {
  xmenu: ["5611201", "5611203", "5611204", "5611205", "5620101", "5620102", "5620103", "4721102"],
  cotare: ["4711301", "4711302", "4712100", "4691500", "4692300", "4693100", "4699999", "5510801", "8610101", "8610102"],
} as const;

export type ProductSegment = keyof typeof SEGMENTS;
