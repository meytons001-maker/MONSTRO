import type { BuildPlan, MissionTransportEvent } from "@monstro/contracts";
import { missionPipeline, type MissionPipelinePhase } from "./mission-pipeline";

export type MissionPhaseEvidence = {
  phase: MissionPipelinePhase;
  status: "waiting" | "active" | "produced";
  summary: string;
  metrics: string[];
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | undefined {
  return value && typeof value === "object" ? value as UnknownRecord : undefined;
}

function buildPlan(events: readonly MissionTransportEvent[]): BuildPlan | undefined {
  const event = [...events].reverse().find((candidate) => candidate.type === "build.applied");
  const plan = record(event?.data)?.plan;
  const candidate = record(plan);
  if (!candidate || typeof candidate.taskId !== "string" || !Array.isArray(candidate.steps) || !Array.isArray(candidate.requirements)) return undefined;
  return plan as BuildPlan;
}

function latestTrace(events: readonly MissionTransportEvent[]) {
  return [...events].reverse().find((event) => event.type === "trace.updated" && event.data?.progress)?.data?.progress;
}

function latest(events: readonly MissionTransportEvent[], type: MissionTransportEvent["type"]) {
  return [...events].reverse().find((event) => event.type === type);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function deriveMissionPhaseEvidence(events: readonly MissionTransportEvent[]): MissionPhaseEvidence[] {
  const current = events.at(-1);
  const activeIndex = current ? missionPipeline.indexOf(current.phase as MissionPipelinePhase) : -1;
  const plan = buildPlan(events);
  const progress = latestTrace(events);
  const understanding = latest(events, "understanding.completed");
  const inspection = latest(events, "inspection.completed");
  const runtime = latest(events, "runtime.completed");
  const observation = latest(events, "observation.completed");
  const completed = latest(events, "mission.completed");
  const failure = latest(events, "mission.failed");
  const evaluation = progress?.evaluations.at(-1);

  return missionPipeline.map((phase, index) => {
    const reached = events.some((event) => event.phase === phase);
    const status: MissionPhaseEvidence["status"] = index === activeIndex ? "active" : reached ? "produced" : "waiting";
    if (phase === "understand") {
      const data = understanding?.data;
      return {
        phase,
        status,
        summary: understanding?.detail ?? (reached ? "Mission intent accepted and normalized." : "Waiting for mission intent."),
        metrics: data ? [String(data.profile), String(data.interactivity), `${String(data.acceptanceCount ?? 0)} acceptance`, `fidelity ${String(data.experienceFidelity)}`] : [],
      };
    }
    if (phase === "inspect") {
      const sources = stringArray(inspection?.data?.evidenceSources);
      const kinds = stringArray(inspection?.data?.evidenceKinds);
      return { phase, status, summary: inspection?.detail ?? (reached ? "Project evidence inspected." : "Waiting for inspection."), metrics: inspection?.data ? [`${String(inspection.data.evidenceCount ?? 0)} evidence`, `${sources.length} source(s)`, `${kinds.length} kind(s)`] : [] };
    }
    if (phase === "plan") return { phase, status, summary: plan?.rationale ?? (reached ? "Build plan produced." : "Waiting for plan."), metrics: plan ? [`${plan.steps.length} step(s)`, `${plan.requirements.length} requirement(s)`] : [] };
    if (phase === "build") return { phase, status, summary: progress?.build.length ? "Build patches applied and traced." : reached ? "Build phase reached." : "Waiting for build.", metrics: progress ? [`${progress.build.length} patch(es)`] : [] };
    if (phase === "run") return { phase, status, summary: runtime?.detail ?? (reached ? "Runtime execution started." : "Waiting for runtime."), metrics: runtime?.data ? [`${runtime.data.ok === true ? "ok" : "failed"}`, `${String(runtime.data.durationMs ?? 0)}ms`, ...(runtime.data.previewUrl ? ["preview ready"] : [])] : [] };
    if (phase === "observe") return { phase, status, summary: observation?.detail ?? (reached ? "Runtime observation completed." : "Waiting for observation."), metrics: observation?.data ? [`${String(observation.data.evidenceCount ?? 0)} evidence`, `${String(observation.data.durationMs ?? 0)}ms`] : [] };
    if (phase === "evaluate") return { phase, status, summary: evaluation ? (evaluation.accepted ? "Evaluation accepted the current artifact." : "Evaluation requested repair.") : reached ? "Evaluation in progress." : "Waiting for evaluation.", metrics: evaluation ? [`score ${evaluation.score}`, `${evaluation.findingCodes.length} finding(s)`, `iteration ${evaluation.iteration}`] : [] };
    if (phase === "repair") return { phase, status, summary: progress?.repairs.length ? "Repair patches applied and traced." : reached ? "Repair phase reached." : "Waiting for repair.", metrics: progress ? [`${progress.repairs.length} patch(es)`] : [] };
    return { phase, status, summary: completed?.detail ?? failure?.detail ?? (reached ? "Delivery in progress." : "Waiting for delivery."), metrics: completed?.data?.artifacts ? [`${completed.data.artifacts.length} artifact(s)`] : [] };
  });
}
