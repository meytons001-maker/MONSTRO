import type { BuildPlan, DeliveryTrace, Evaluation, EvaluationIterationTrace, FilePatch, MissionTraceProgress } from "@monstro/contracts";
import type { MissionEvent } from "./mission.js";

function clonePatch(patch: FilePatch): FilePatch {
  return { ...patch, requirementIds: patch.requirementIds ? [...patch.requirementIds] : undefined };
}

function cloneEvaluation(evaluation: EvaluationIterationTrace): EvaluationIterationTrace {
  return {
    ...evaluation,
    evidenceTrace: evaluation.evidenceTrace.map((trace) => ({ ...trace, evidenceSources: [...trace.evidenceSources] })),
    findings: evaluation.findings.map((finding) => ({ ...finding, requirementIds: finding.requirementIds ? [...finding.requirementIds] : undefined })),
    repairActionIds: [...evaluation.repairActionIds],
  };
}

function emptyProgress(): MissionTraceProgress {
  return { build: [], repairs: [], evaluations: [] };
}

function cloneProgress(progress: MissionTraceProgress): MissionTraceProgress {
  return {
    build: progress.build.map((patch) => ({ ...patch, requirementIds: [...patch.requirementIds] })),
    repairs: progress.repairs.map((patch) => ({ ...patch, requirementIds: [...patch.requirementIds] })),
    evaluations: progress.evaluations.map((evaluation) => ({
      ...evaluation,
      requirementIds: [...evaluation.requirementIds],
      findingCodes: [...evaluation.findingCodes],
      repairActionIds: [...evaluation.repairActionIds],
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isProgress(value: unknown): value is MissionTraceProgress {
  if (!isRecord(value) || !Array.isArray(value.build) || !Array.isArray(value.repairs) || !Array.isArray(value.evaluations)) return false;
  const patch = (item: unknown) => isRecord(item)
    && typeof item.path === "string"
    && (item.operation === "create" || item.operation === "update" || item.operation === "delete")
    && isStrings(item.requirementIds);
  const evaluation = (item: unknown) => isRecord(item)
    && Number.isInteger(item.iteration)
    && typeof item.accepted === "boolean"
    && typeof item.score === "number"
    && isStrings(item.requirementIds)
    && isStrings(item.findingCodes)
    && isStrings(item.repairActionIds);
  return value.build.every(patch) && value.repairs.every(patch) && value.evaluations.every(evaluation);
}

export function replayMissionTraceProgress(events: readonly MissionEvent[]): MissionTraceProgress {
  let latest = emptyProgress();
  for (const event of events) {
    if (event.type !== "trace.updated") continue;
    const progress = event.data?.progress;
    if (!isProgress(progress)) throw new Error(`Invalid trace progress in mission event ${event.id}`);
    latest = cloneProgress(progress);
  }
  return latest;
}

export interface MissionTraceSnapshot {
  buildPatches: FilePatch[];
  repairPatches: FilePatch[];
  evaluations: EvaluationIterationTrace[];
}

function cloneSnapshot(snapshot: MissionTraceSnapshot): MissionTraceSnapshot {
  return {
    buildPatches: snapshot.buildPatches.map(clonePatch),
    repairPatches: snapshot.repairPatches.map(clonePatch),
    evaluations: snapshot.evaluations.map(cloneEvaluation),
  };
}

function isPatch(value: unknown): value is FilePatch {
  return isRecord(value)
    && typeof value.path === "string"
    && (value.operation === "create" || value.operation === "update" || value.operation === "delete")
    && (value.content === undefined || typeof value.content === "string")
    && (value.requirementIds === undefined || isStrings(value.requirementIds));
}

function isEvaluationTrace(value: unknown): value is EvaluationIterationTrace {
  if (!isRecord(value) || !Number.isInteger(value.iteration) || typeof value.accepted !== "boolean" || typeof value.score !== "number" || !Array.isArray(value.evidenceTrace) || !Array.isArray(value.findings) || !isStrings(value.repairActionIds)) return false;
  const evidence = value.evidenceTrace.every((item) => isRecord(item) && typeof item.requirementId === "string" && isStrings(item.evidenceSources));
  const findings = value.findings.every((item) => isRecord(item)
    && typeof item.code === "string"
    && typeof item.message === "string"
    && (item.severity === "error" || item.severity === "warning")
    && (item.evidenceSource === undefined || typeof item.evidenceSource === "string")
    && (item.requirementIds === undefined || isStrings(item.requirementIds)));
  return evidence && findings;
}

function isSnapshot(value: unknown): value is MissionTraceSnapshot {
  return isRecord(value)
    && Array.isArray(value.buildPatches) && value.buildPatches.every(isPatch)
    && Array.isArray(value.repairPatches) && value.repairPatches.every(isPatch)
    && Array.isArray(value.evaluations) && value.evaluations.every(isEvaluationTrace);
}

export function replayMissionTraceSnapshot(events: readonly MissionEvent[]): MissionTraceSnapshot | undefined {
  let latest: MissionTraceSnapshot | undefined;
  for (const event of events) {
    if (event.type !== "trace.updated" || event.data?.snapshot === undefined) continue;
    if (!isSnapshot(event.data.snapshot)) throw new Error(`Invalid trace snapshot in mission event ${event.id}`);
    latest = cloneSnapshot(event.data.snapshot);
  }
  return latest;
}

export class MissionTraceCollector {
  private readonly buildPatches: FilePatch[] = [];
  private readonly repairPatches: FilePatch[] = [];
  private readonly evaluations: EvaluationIterationTrace[] = [];

  static hydrate(snapshot?: MissionTraceSnapshot): MissionTraceCollector {
    const collector = new MissionTraceCollector();
    if (!snapshot) return collector;
    collector.buildPatches.push(...snapshot.buildPatches.map(clonePatch));
    collector.repairPatches.push(...snapshot.repairPatches.map(clonePatch));
    collector.evaluations.push(...snapshot.evaluations.map(cloneEvaluation));
    return collector;
  }

  recordBuild(patches: FilePatch[]): void { this.buildPatches.push(...patches.map(clonePatch)); }
  recordRepair(patches: FilePatch[]): void { this.repairPatches.push(...patches.map(clonePatch)); }
  recordEvaluation(iteration: number, evaluation: Evaluation): void {
    this.evaluations.push({ iteration, accepted: evaluation.accepted, score: evaluation.score, evidenceTrace: (evaluation.evidenceTrace ?? []).map((trace) => ({ requirementId: trace.requirementId, evidenceSources: [...trace.evidenceSources] })), findings: evaluation.findings.map((finding) => ({ ...finding, requirementIds: finding.requirementIds ? [...finding.requirementIds] : undefined })), repairActionIds: evaluation.nextActions.map((action) => action.id) });
  }
  snapshot(): MissionTraceSnapshot { return { buildPatches: this.buildPatches.map(clonePatch), repairPatches: this.repairPatches.map(clonePatch), evaluations: this.evaluations.map(cloneEvaluation) }; }
  progress(): MissionTraceProgress {
    const patchSummary = (patch: FilePatch) => ({ path: patch.path, operation: patch.operation, requirementIds: [...(patch.requirementIds ?? [])] });
    return { build: this.buildPatches.map(patchSummary), repairs: this.repairPatches.map(patchSummary), evaluations: this.evaluations.map((evaluation) => ({ iteration: evaluation.iteration, accepted: evaluation.accepted, score: evaluation.score, requirementIds: [...new Set([...evaluation.evidenceTrace.map((trace) => trace.requirementId), ...evaluation.findings.flatMap((finding) => finding.requirementIds ?? [])])], findingCodes: [...new Set(evaluation.findings.map((finding) => finding.code))], repairActionIds: [...evaluation.repairActionIds] })) };
  }
  build(plan: BuildPlan, finalEvaluation: Evaluation): DeliveryTrace {
    const requirementIds = new Set([...plan.requirements.map((requirement) => requirement.id), ...this.buildPatches.flatMap((patch) => patch.requirementIds ?? []), ...this.repairPatches.flatMap((patch) => patch.requirementIds ?? []), ...this.evaluations.flatMap((item) => item.evidenceTrace.map((trace) => trace.requirementId))]);
    return { requirements: [...requirementIds].map((requirementId) => { const historicalFindings = this.evaluations.flatMap((item) => item.findings).filter((finding) => finding.requirementIds?.includes(requirementId)); const historicalSources = this.evaluations.flatMap((item) => item.evidenceTrace.filter((trace) => trace.requirementId === requirementId).flatMap((trace) => trace.evidenceSources)); const finalFindings = finalEvaluation.findings.filter((finding) => finding.requirementIds?.includes(requirementId)); return { requirementId, buildPaths: [...new Set(this.buildPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))], repairPaths: [...new Set(this.repairPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))], evidenceSources: [...new Set([...historicalSources, ...historicalFindings.flatMap((finding) => finding.evidenceSource ? [finding.evidenceSource] : [])])], findingCodes: [...new Set(historicalFindings.map((finding) => finding.code))], status: finalFindings.some((finding) => finding.severity === "error") ? "unresolved" as const : "satisfied" as const }; }), evaluations: this.evaluations.map(cloneEvaluation) };
  }
}
