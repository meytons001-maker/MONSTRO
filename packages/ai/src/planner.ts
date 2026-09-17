import type { AiResponse } from "./index.ts";
import { ModelRouter } from "./index.ts";

export interface AiPlanStep { title: string; description: string; }
export interface AiPlan { rationale: string; steps: AiPlanStep[]; provider: string; model: string; }

interface PlanPayload { rationale?: unknown; steps?: unknown; }

function parsePayload(output: string): PlanPayload {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  return JSON.parse((fenced ?? output).trim()) as PlanPayload;
}

export async function generateAiPlan(router: ModelRouter, intent: string, evidence: readonly string[]): Promise<AiPlan | undefined> {
  if (router.list("reasoning").length === 0) return undefined;

  const response: AiResponse = await router.generate({
    capability: "reasoning",
    system: "You are MONSTRO Architect. Return only JSON with rationale:string and steps:[{title:string,description:string}]. Create a concise executable software plan. Never propose credential theft, authentication/DRM bypass, intrusion, or unauthorized access.",
    prompt: JSON.stringify({ intent, evidence }),
    metadata: { stage: "plan" },
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
