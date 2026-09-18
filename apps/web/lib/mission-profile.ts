import type { AcceptanceCriterion, ExperienceFidelity } from "@monstro/contracts";

export type MissionProfileId = "web" | "interactive-web";

export interface MissionProfile {
  id: MissionProfileId;
  rationale: string;
  experienceFidelity: ExperienceFidelity;
  acceptance: AcceptanceCriterion[];
}

const BASE_PREVIEW_CHECKS: AcceptanceCriterion = {
  id: "preview-ok",
  description: "Generated web preview must become reachable and structurally valid",
  required: true,
  repairTargetPath: "preview.mjs",
  checks: [
    { kind: "runtime.ok" },
    { kind: "evidence.exists", source: "preview:document" },
    { kind: "evidence.field.equals", source: "preview:document", field: "title", expected: "MONSTRO Preview" },
    { kind: "evidence.field.includes", source: "preview:document", field: "h1", expected: "MONSTRO LIVE PREVIEW" },
    { kind: "evidence.field.min", source: "preview:dom", field: "main", expected: 1 },
    { kind: "evidence.field.min", source: "preview:dom", field: "headings", expected: 1 },
  ],
};

function cloneCriterion(criterion: AcceptanceCriterion): AcceptanceCriterion {
  return { ...criterion, checks: criterion.checks?.map((check) => ({ ...check })) };
}

export function classifyMission(intent: string, hasReference: boolean): MissionProfile {
  const normalized = intent.toLowerCase();
  const asksForInteractiveExperience = /\b(3d|webgl|three(?:\.js)?|interactive|interativo|interativa|immersive|imersiv[oa]|canvas|shader)\b/i.test(normalized);
  const interactive = hasReference || asksForInteractiveExperience;

  return {
    id: interactive ? "interactive-web" : "web",
    rationale: interactive
      ? hasReference ? "Public reference requires observable experience fidelity" : "Intent explicitly requests an interactive/rendered web experience"
      : "Intent requires a reachable, structurally valid web preview",
    experienceFidelity: hasReference ? "required" : "advisory",
    acceptance: [cloneCriterion(BASE_PREVIEW_CHECKS)],
  };
}
