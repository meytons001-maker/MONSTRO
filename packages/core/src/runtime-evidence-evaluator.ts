import type { Evaluation, MonstroTask, RuntimeResult } from "@monstro/contracts";
import type { Evaluator } from "./index.js";

export interface RuntimeEvidenceEvaluatorOptions {
  maxDurationMs?: number;
  rejectStderr?: boolean;
}

export class RuntimeEvidenceEvaluator implements Evaluator {
  constructor(private readonly options: RuntimeEvidenceEvaluatorOptions = {}) {}

  async evaluate(_task: MonstroTask, runtime: RuntimeResult): Promise<Evaluation> {
    const findings: string[] = [];
    const nextActions: string[] = [];

    if (!runtime.ok) {
      findings.push("Runtime execution failed.");
      nextActions.push("Inspect runtime failure and repair the generated artifact.");
    }

    const stderr = runtime.stderr.trim();
    if (stderr.length > 0) {
      findings.push(`Runtime produced stderr: ${stderr}`);
      if (this.options.rejectStderr) {
        nextActions.push("Resolve stderr output before delivery.");
      }
    }

    if (this.options.maxDurationMs !== undefined && runtime.durationMs > this.options.maxDurationMs) {
      findings.push(`Runtime exceeded duration budget: ${runtime.durationMs}ms > ${this.options.maxDurationMs}ms.`);
      nextActions.push("Reduce runtime duration to satisfy the execution budget.");
    }

    const durationAccepted = this.options.maxDurationMs === undefined || runtime.durationMs <= this.options.maxDurationMs;
    const stderrAccepted = !this.options.rejectStderr || stderr.length === 0;
    const accepted = runtime.ok && durationAccepted && stderrAccepted;

    const failedChecks = Number(!runtime.ok) + Number(!durationAccepted) + Number(!stderrAccepted);
    const totalChecks = 1 + Number(this.options.maxDurationMs !== undefined) + Number(Boolean(this.options.rejectStderr));
    const score = Math.max(0, (totalChecks - failedChecks) / totalChecks);

    return {
      accepted,
      score,
      findings,
      nextActions,
    };
  }
}
