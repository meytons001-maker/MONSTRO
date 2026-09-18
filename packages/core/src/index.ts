import type { BuildPlan, Delivery, DeliveryTrace, Evaluation, Evidence, FilePatch, MonstroTask, ObservationResult, RuntimeResult, TaskPhase } from "@monstro/contracts";
import { MissionJournal } from "./mission.ts";
export * from "./mission.ts";

export interface Inspector { inspect(task: MonstroTask): Promise<Evidence[]>; }
export interface Architect { plan(task: MonstroTask, evidence: Evidence[]): Promise<BuildPlan>; }
export interface Builder { build(task: MonstroTask, plan: BuildPlan): Promise<FilePatch[]>; apply(task: MonstroTask, patches: FilePatch[]): Promise<void>; }
export interface Runtime { run(task: MonstroTask): Promise<RuntimeResult>; }
export interface Observer { observe(task: MonstroTask, runtime: RuntimeResult): Promise<ObservationResult>; }
export interface Evaluator { evaluate(task: MonstroTask, runtime: RuntimeResult, evidence: Evidence[]): Promise<Evaluation>; }
export interface Repairer { repair(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]>; }
export interface Exporter { deliver(task: MonstroTask, runtime: RuntimeResult, evaluation: Evaluation): Promise<Delivery>; }
export interface MonstroServices { inspector: Inspector; architect: Architect; builder: Builder; runtime: Runtime; observer: Observer; evaluator: Evaluator; repairer: Repairer; exporter: Exporter; }

export class MonstroOrchestrator {
  readonly journal: MissionJournal;
  constructor(private readonly services: MonstroServices, journal = new MissionJournal()) { this.journal = journal; }
  private async phase(task: MonstroTask, phase: TaskPhase, detail?: string): Promise<void> { task.phase = phase; await this.journal.record(task, "phase.changed", detail); }

  async execute(task: MonstroTask): Promise<Delivery> {
    const appliedBuildPatches: FilePatch[] = [];
    const appliedRepairPatches: FilePatch[] = [];
    try {
      await this.phase(task, "inspect");
      const initialEvidence = await this.services.inspector.inspect(task);
      await this.phase(task, "plan", `${initialEvidence.length} evidence item(s)`);
      const plan = await this.services.architect.plan(task, initialEvidence);
      await this.phase(task, "build", `${plan.steps.length} plan step(s)`);
      const buildPatches = await this.services.builder.build(task, plan);
      await this.services.builder.apply(task, buildPatches);
      appliedBuildPatches.push(...buildPatches);
      await this.journal.record(task, "build.applied", `${buildPatches.length} patch(es)`, { paths: buildPatches.map((patch) => patch.path), requirementIds: [...new Set(buildPatches.flatMap((patch) => patch.requirementIds ?? []))], patches: buildPatches.map((patch) => ({ path: patch.path, operation: patch.operation, requirementIds: patch.requirementIds ?? [] })) });

      while (task.iteration < task.maxIterations) {
        task.iteration += 1;
        await this.journal.record(task, "iteration.started", `iteration ${task.iteration}`);
        await this.phase(task, "run");
        const runtime = await this.services.runtime.run(task);
        await this.phase(task, "observe", runtime.previewUrl ? "inspecting preview" : "inspecting runtime result");
        const observation = await this.services.observer.observe(task, runtime);
        await this.journal.record(task, "observation.completed", `${observation.evidence.length} evidence item(s)`, { ok: observation.ok, durationMs: observation.durationMs });
        await this.phase(task, "evaluate", observation.ok ? "observation ok" : "observation failed");
        const evaluationEvidence = [...initialEvidence, ...observation.evidence];
        const evaluation = await this.services.evaluator.evaluate(task, runtime, evaluationEvidence);

        if (runtime.ok && observation.ok && evaluation.accepted) {
          await this.phase(task, "deliver", `score ${evaluation.score}`);
          const delivery = await this.services.exporter.deliver(task, runtime, evaluation);
          const requirementIds = new Set([...plan.requirements.map((requirement) => requirement.id), ...appliedBuildPatches.flatMap((patch) => patch.requirementIds ?? []), ...appliedRepairPatches.flatMap((patch) => patch.requirementIds ?? []), ...(evaluation.evidenceTrace ?? []).map((trace) => trace.requirementId)]);
          const trace: DeliveryTrace = { requirements: [...requirementIds].map((requirementId) => { const findings = evaluation.findings.filter((finding) => finding.requirementIds?.includes(requirementId)); const evaluatedSources = evaluation.evidenceTrace?.find((item) => item.requirementId === requirementId)?.evidenceSources ?? []; return { requirementId, buildPaths: [...new Set(appliedBuildPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))], repairPaths: [...new Set(appliedRepairPatches.filter((patch) => patch.requirementIds?.includes(requirementId)).map((patch) => patch.path))], evidenceSources: [...new Set([...evaluatedSources, ...findings.flatMap((finding) => finding.evidenceSource ? [finding.evidenceSource] : [])])], findingCodes: [...new Set(findings.map((finding) => finding.code))], status: findings.some((finding) => finding.severity === "error") ? "unresolved" as const : "satisfied" as const }; }) };
          delivery.trace = trace;
          await this.journal.record(task, "mission.completed", delivery.summary, { previewUrl: delivery.previewUrl, artifacts: delivery.artifacts, completedAt: delivery.completedAt });
          return delivery;
        }

        const repairDetail = evaluation.findings.map((finding) => `${finding.code}: ${finding.message}`).join("; ");
        await this.phase(task, "repair", repairDetail);
        const patches = await this.services.repairer.repair(task, evaluation);
        await this.journal.record(task, "repair.completed", `${patches.length} patch(es)`, { actions: evaluation.nextActions.map((action) => action.id), paths: patches.map((patch) => patch.path), requirementIds: [...new Set(patches.flatMap((patch) => patch.requirementIds ?? []))], patches: patches.map((patch) => ({ path: patch.path, operation: patch.operation, requirementIds: patch.requirementIds ?? [] })) });
        if (patches.length === 0) break;
        await this.services.builder.apply(task, patches);
        appliedRepairPatches.push(...patches);
      }
      throw new Error(`MONSTRO could not satisfy task ${task.id} after ${task.iteration} iterations`);
    } catch (error) {
      task.phase = "failed";
      const message = error instanceof Error ? error.message : String(error);
      await this.journal.record(task, "mission.failed", message);
      throw error;
    }
  }
}
