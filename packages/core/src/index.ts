import type {
  BuildPlan,
  Capability,
  Delivery,
  Evaluation,
  Evidence,
  FilePatch,
  MonstroTask,
  RuntimeResult,
} from "@monstro/contracts";

export interface Inspector { inspect(task: MonstroTask): Promise<Evidence[]>; }
export interface Architect { plan(task: MonstroTask, evidence: Evidence[]): Promise<BuildPlan>; }
export interface Builder {
  build(task: MonstroTask, plan: BuildPlan): Promise<FilePatch[]>;
  apply(task: MonstroTask, patches: FilePatch[]): Promise<void>;
}
export interface Runtime { run(task: MonstroTask): Promise<RuntimeResult>; }
export interface Evaluator { evaluate(task: MonstroTask, runtime: RuntimeResult): Promise<Evaluation>; }
export interface Repairer { repair(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]>; }
export interface Exporter { deliver(task: MonstroTask, runtime: RuntimeResult, evaluation: Evaluation): Promise<Delivery>; }

export interface CapabilityAuthorization {
  allowed: Capability[];
  denied: Capability[];
  reasons: string[];
}

export interface Authorizer {
  authorize(task: MonstroTask): Promise<CapabilityAuthorization> | CapabilityAuthorization;
}

export interface MonstroServices {
  authorizer: Authorizer;
  inspector: Inspector;
  architect: Architect;
  builder: Builder;
  runtime: Runtime;
  evaluator: Evaluator;
  repairer: Repairer;
  exporter: Exporter;
}

export class CapabilityDeniedError extends Error {
  constructor(readonly taskId: string, readonly denied: Capability[], readonly reasons: string[]) {
    super(`MONSTRO denied capabilities for task ${taskId}: ${denied.join(", ")}`);
    this.name = "CapabilityDeniedError";
  }
}

export class MonstroOrchestrator {
  constructor(private readonly services: MonstroServices) {}

  async execute(task: MonstroTask): Promise<Delivery> {
    task.phase = "understand";
    const authorization = await this.services.authorizer.authorize(task);
    if (authorization.denied.length > 0) {
      task.phase = "failed";
      throw new CapabilityDeniedError(task.id, authorization.denied, authorization.reasons);
    }

    task.phase = "inspect";
    const evidence = await this.services.inspector.inspect(task);
    task.phase = "plan";
    const plan = await this.services.architect.plan(task, evidence);
    task.phase = "build";
    await this.services.builder.apply(task, await this.services.builder.build(task, plan));

    while (task.iteration < task.maxIterations) {
      task.iteration += 1;
      task.phase = "run";
      const runtime = await this.services.runtime.run(task);
      task.phase = "evaluate";
      const evaluation = await this.services.evaluator.evaluate(task, runtime);

      if (runtime.ok && evaluation.accepted) {
        task.phase = "deliver";
        return this.services.exporter.deliver(task, runtime, evaluation);
      }

      task.phase = "repair";
      const patches = await this.services.repairer.repair(task, evaluation);
      if (patches.length === 0) break;
      await this.services.builder.apply(task, patches);
    }

    task.phase = "failed";
    throw new Error(`MONSTRO could not satisfy task ${task.id} after ${task.iteration} iterations`);
  }
}

export { PolicyAuthorizer } from "./policy-authorizer.js";
export { WorkspaceBuilder, WorkspaceRuntime, createLocalExecutionAdapters } from "./local-adapters.js";
export type { LocalBuilderOptions, LocalExecutionAdapters, ProcessSpecFactory } from "./local-adapters.js";
