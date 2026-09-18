import type { BuildPlan, DeliveryTrace, Evaluation, EvaluationIterationTrace, FilePatch } from "@monstro/contracts";

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

export interface MissionTraceSnapshot {
  buildPatches: FilePatch[];
  repairPatches: FilePatch[];
  evaluations: EvaluationIterationTrace[];
}

export class MissionTraceCollector {
  private readonly buildPatches: FilePatch[] = [];
  private readonly repairPatches: FilePatch[] = [];
  private readonly evaluations: EvaluationIterationTrace[] = [];

  recordBuild(patches: FilePatch[]): void {
    this.buildPatches.push(...patches.map(clonePatch));
  }

  recordRepair(patches: FilePatch[]): void {
    this.repairPatches.push(...patches.map(clonePatch));
  }

  recordEvaluation(iteration: number, evaluation: Evaluation): void {
    this.evaluations.push({
      iteration,
      accepted: evaluation.accepted,
      score: evaluation.score,
      evidenceTrace: (evaluation.evidenceTrace ?? []).map((trace) => ({ requirementId: trace.requirementId, evidenceSources: [...trace.evidenceSources] })),
      findings: evaluation.findings.map((finding) => ({ ...finding, requirementIds: finding.requirementIds ? [...finding.requirementIds] : undefined })),
      repairActionIds: evaluation.nextActions.map((action) => action.id),
    });
  }

  snapshot(): MissionTraceSnapshot {
    return {
      buildPatches: this.buildPatches.map(clonePatch),
      repairPatches: this.repairPatches.map(clonePatch),
      evaluations: this.evaluations.map(cloneEvaluation),
    };
  }

  build(plan: BuildPlan, finalEvaluation: Evaluation): DeliveryTrace {
    const requirementIds = new Set([
      ...plan.requirements.map((requirement) => requirement.id),
      ...this.buildPatches.flatMap((patch) => patch.requirementIds ?? []),
      ...this.repairPatches.flatMap((patch) => patch.requirementIds ?? []),
      ...this.evaluations.flatMap((item) => item.evidenceTrace.map((trace) => trace.requirementId)),
    ]);

    return {
      requirements: [...requirementIds].map((requirementId) => {
        const historicalFindings = this.evaluations.flatMap((item) => item.findings).filter((finding) => finding.requirementIds?.includes(requirementId));
        const historicalSources = this.evaluations.flatMap((item) => item.evidenceTrace.filter((trace) => trace.requirementId === requirementId).flatMap((trace) => trace.evidenceSources));
        const finalFindings = finalEvaluation.findings.filter((finding) => finding.requirementIds?.includes(requirementId));
        return {
          requirementId,
          buildPaths: [...new Set(this.buildPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))],
          repairPaths: [...new Set(this.repairPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))],
          evidenceSources: [...new Set([...historicalSources, ...historicalFindings.flatMap((finding) => finding.evidenceSource ? [finding.evidenceSource] : [])])],
          findingCodes: [...new Set(historicalFindings.map((finding) => finding.code))],
          status: finalFindings.some((finding) => finding.severity === "error") ? "unresolved" as const : "satisfied" as const,
        };
      }),
      evaluations: this.evaluations.map(cloneEvaluation),
    };
  }
}
