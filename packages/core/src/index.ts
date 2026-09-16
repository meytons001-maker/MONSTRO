import type {
  BuildPlan,
  Delivery,
  Evaluation,
  Evidence,
  FilePatch,
  MonstroTask,
  RuntimeResult,
  TaskPhase,
} from "@monstro/contracts";
import { MissionJournal } from "./mission.js";
export * from "./mission.js";

export interface Inspector { inspect(task: MonstroTask): Promise<Evidence[]>; }
export interface Architect { plan(task: MonstroTask, evidence: Evidence[]): Promise<BuildPlan>; }
export interface Builder {
  build(task: MonstroTask, plan: BuildPlan): Promise<FilePatch[]>;
  apply(task: MonstroTask, patches: FilePatch[]): Promise<void>;
}
export interface Runtime { run(task: MonstroTask): Promise<RuntimeResult>; }
export interface Evaluator { evaluate(task: MonstroTask, runtime: RuntimeResult): Promise<Evaluation>; }
export interface Repairer { repair(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]>; }
export interface Exporter {
  deliver(task: MonstroTask, runtime: RuntimeResult, evaluation: Evaluation): Promise<Delivery>;
}

export interface MonstroServices {
  inspector: Inspector;
  architect: Architect;
  builder: Builder;
  runtime: Runtime;
  evaluator: Evaluator;
  repairer: Repairer;
  exporter: Exporter;
}

export class MonstroOrchestrator {
  readonly journal: MissionJournal;

  constructor(private readonly services: MonstroServices, journal = new MissionJournal()) {
    this.journal = journal;
  }

  private async phase(task: MonstroTask, phase: TaskPhase, detail?: string): Promise<void> {
    task.phase = phase;
    await this.journal.record(task, "phase.changed", detail);
  }

  async execute(task: MonstroTask): Promise<Delivery> {
    try {
      await this.phase(task, "inspect");
      const evidence = await this.services.inspector.inspect(task);

      await this.phase(task, "plan", `${evidence.length} evidence item(s)`);
      const plan = await this.services.architect.plan(task, evidence);

      await this.phase(task, "build", `${plan.steps.length} plan step(s)`);
      await this.services.builder.apply(task, await this.services.builder.build(task, plan));

      while (task.iteration < task.maxIterations) {
        task.iteration += 1;
        await this.journal.record(task, "iteration.started", `iteration ${task.iteration}`);

        await this.phase(task, "run");
        const runtime = await this.services.runtime.run(task);

        await this.phase(task, "evaluate", runtime.ok ? "runtime ok" : "runtime failed");
        const evaluation = await this.services.evaluator.evaluate(task, runtime);

        if (runtime.ok && evaluation.accepted) {
          await this.phase(task, "deliver", `score ${evaluation.score}`);
          const delivery = await this.services.exporter.deliver(task, runtime, evaluation);
          await this.journal.record(task, "mission.completed", delivery.summary);
          return delivery;
        }

        await this.phase(task, "repair", evaluation.findings.join("; "));
        const patches = await this.services.repairer.repair(task, evaluation);
        if (patches.length === 0) break;
        await this.services.builder.apply(task, patches);
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
