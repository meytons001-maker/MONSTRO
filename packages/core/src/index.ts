import type { BuildPlan, Delivery, Evaluation, Evidence, FilePatch, MonstroTask, ObservationResult, RuntimeResult, TaskPhase } from "@monstro/contracts";
import { MissionJournal } from "./mission.ts";
import { MissionTraceCollector } from "./trace.ts";
export * from "./mission.ts";
export * from "./mission-store.ts";
export * from "./file-mission-store.ts";
export * from "./trace.ts";
export * from "./task-replay.ts";

export interface Inspector { inspect(task: MonstroTask): Promise<Evidence[]>; }
export interface Architect { plan(task: MonstroTask, evidence: Evidence[]): Promise<BuildPlan>; }
export interface Builder { build(task: MonstroTask, plan: BuildPlan): Promise<FilePatch[]>; apply(task: MonstroTask, patches: FilePatch[]): Promise<void>; }
export interface Runtime { run(task: MonstroTask): Promise<RuntimeResult>; }
export interface Observer { observe(task: MonstroTask, runtime: RuntimeResult): Promise<ObservationResult>; }
export interface Evaluator { evaluate(task: MonstroTask, runtime: RuntimeResult, evidence: Evidence[]): Promise<Evaluation>; }
export interface Repairer { repair(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]>; }
export interface Exporter { deliver(task: MonstroTask, runtime: RuntimeResult, evaluation: Evaluation): Promise<Delivery>; }
export interface MonstroServices { inspector: Inspector; architect: Architect; builder: Builder; runtime: Runtime; observer: Observer; evaluator: Evaluator; repairer: Repairer; exporter: Exporter; }

function requirementIds(patches: FilePatch[]): string[] {
  return [...new Set(patches.flatMap((patch) => patch.requirementIds ?? []))];
}

export class MonstroOrchestrator {
  readonly journal: MissionJournal;
  constructor(private readonly services: MonstroServices, journal = new MissionJournal()) { this.journal = journal; }
  private async phase(task: MonstroTask, phase: TaskPhase, detail?: string): Promise<void> {
    task.phase = phase;
    await this.journal.record(task, "phase.changed", detail, { task: structuredClone(task) });
  }
  private async publishTrace(task: MonstroTask, trace: MissionTraceCollector, detail: string): Promise<void> {
    await this.journal.record(task, "trace.updated", detail, { progress: trace.progress() });
  }

  async execute(task: MonstroTask): Promise<Delivery> {
    const trace = new MissionTraceCollector();
    try {
      await this.phase(task, "inspect");
      const initialEvidence = await this.services.inspector.inspect(task);
      await this.phase(task, "plan", `${initialEvidence.length} evidence item(s)`);
      const plan = await this.services.architect.plan(task, initialEvidence);
      await this.phase(task, "build", `${plan.steps.length} planned step(s)`);
      const patches = await this.services.builder.build(task, plan);
      await this.services.builder.apply(task, patches);
      trace.recordBuild(patches);
      await this.journal.record(task, "build.applied", `${patches.length} patch(es) applied`, { requirementIds: requirementIds(patches), plan: structuredClone(plan) });
      await this.publishTrace(task, trace, "initial build traced");

      let finalRuntime: RuntimeResult | undefined;
      let finalEvaluation: Evaluation | undefined;
      while (task.iteration < task.maxIterations) {
        task.iteration += 1;
        await this.journal.record(task, "iteration.started", `iteration ${task.iteration}`);
        await this.phase(task, "run");
        const runtime = await this.services.runtime.run(task);
        await this.phase(task, "observe");
        const observation = await this.services.observer.observe(task, runtime);
        const observationDetail = observation.ok
          ? `${observation.evidence.length} evidence item(s) observed in ${observation.durationMs}ms`
          : observation.evidence.find((item) => item.summary)?.summary ?? "Observation failed";
        await this.journal.record(task, "observation.completed", observationDetail, {
          ok: observation.ok,
          evidenceCount: observation.evidence.length,
          durationMs: observation.durationMs,
        });
        await this.phase(task, "evaluate");
        const inspectedEvidence = await this.services.inspector.inspect(task);
        const evidence = [...inspectedEvidence, ...observation.evidence];
        const evaluation = await this.services.evaluator.evaluate(task, runtime, evidence);
        trace.recordEvaluation(task.iteration, evaluation);
        await this.publishTrace(task, trace, `evaluation ${task.iteration} traced`);
        finalRuntime = runtime;
        finalEvaluation = evaluation;
        if (evaluation.accepted) break;
        if (task.iteration >= task.maxIterations) break;
        await this.phase(task, "repair", `${evaluation.findings.length} finding(s)`);
        const repairPatches = await this.services.repairer.repair(task, evaluation);
        await this.services.builder.apply(task, repairPatches);
        trace.recordRepair(repairPatches);
        await this.journal.record(task, "repair.completed", `${repairPatches.length} repair patch(es) applied`, { requirementIds: requirementIds(repairPatches) });
        await this.publishTrace(task, trace, `repair ${task.iteration} traced`);
      }

      if (!finalRuntime || !finalEvaluation) throw new Error("Mission produced no runtime evaluation");
      if (!finalEvaluation.accepted) throw new Error(`Mission failed acceptance after ${task.iteration} iteration(s)`);
      await this.phase(task, "deliver");
      const delivery = await this.services.exporter.deliver(task, finalRuntime, finalEvaluation);
      delivery.trace = trace.build(plan, finalEvaluation);
      await this.journal.record(task, "mission.completed", delivery.summary, { delivery, trace: delivery.trace });
      return delivery;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.journal.record(task, "mission.failed", detail);
      throw error;
    }
  }
}
