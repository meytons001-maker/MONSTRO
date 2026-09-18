import type { BuildRequirement, MissionUnderstanding } from "@monstro/contracts";
import type { AiResponse } from "./index.ts";
import { ModelRouter } from "./index.ts";

export interface AiPlanStep { title: string; description: string; }
export interface AiPlan { rationale: string; steps: AiPlanStep[]; provider: string; model: string; }

interface PlanPayload { rationale?: unknown; steps?: unknown; }

function parsePayload(output: string): PlanPayload {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? output).trim()) as PlanPayload;
}

export function requirementsFromUnderstanding(understanding?: MissionUnderstanding): BuildRequirement[] {
  if (!understanding) return [];
  return [
    { id: "artifact", description: `Produce artifact ${understanding.artifact}`, source: "understanding", required: true },
    { id: "interactivity", description: `Satisfy ${understanding.interactivity} interaction level`, source: "understanding", required: true },
    { id: "experience-fidelity", description: `Experience fidelity is ${understanding.experienceFidelity}`, source: "understanding", required: understanding.experienceFidelity === "required" },
    ...understanding.acceptance.map((criterion) => ({ id: `acceptance:${criterion.id}`, description: criterion.description, source: "acceptance" as const, required: criterion.required })),
  ];
}

export async function generateAiPlan(router: ModelRouter, intent: string, evidence: readonly string[], understanding?: MissionUnderstanding): Promise<AiPlan | undefined> {
  if (router.list("reasoning").length === 0) return undefined;

  const requirements = requirementsFromUnderstanding(understanding);
  const response: AiResponse = await router.generate({
    capability: "reasoning",
    system: "You are MONSTRO Architect. Return only JSON with rationale:string and steps:[{title:string,description:string}]. Create a concise executable software plan that explicitly satisfies the supplied mission understanding and requirements. Never propose credential theft, authentication/DRM bypass, intrusion, or unauthorized access.",
    prompt: JSON.stringify({ intent, understanding, requirements, evidence }),
    metadata: { stage: "plan", profile: understanding?.profile },
  });

  let payload: PlanPayload;
  try { payload = parsePayload(response.output); }
  catch { throw new Error(`AI planner returned invalid JSON from ${response.provider}`); }

  const rationale = typeof payload.rationale === "string" ? payload.rationale.trim() : "";
  const rawSteps = Array.isArray(payload.steps) ? payload.steps : [];
  const steps = rawSteps.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const record = value as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title.trim() : "";
    const description = typeof record.description === "string" ? record.description.trim() : "";
    return title && description ? [{ title, description }] : [];
  }).slice(0, 8);

  if (!rationale || steps.length === 0) throw new Error(`AI planner returned an incomplete plan from ${response.provider}`);
  return { rationale, steps, provider: response.provider, model: response.model };
}
