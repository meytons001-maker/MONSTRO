import type { Evaluation, FilePatch, MonstroTask } from "@monstro/contracts";
import type { Repairer } from "./index.js";

export interface EvaluationRepairRule {
  id: string;
  matches(task: MonstroTask, evaluation: Evaluation): boolean;
  patches(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]> | FilePatch[];
}

export class RuleBasedRepairer implements Repairer {
  constructor(private readonly rules: readonly EvaluationRepairRule[]) {}

  async repair(task: MonstroTask, evaluation: Evaluation): Promise<FilePatch[]> {
    for (const rule of this.rules) {
      if (rule.matches(task, evaluation)) return rule.patches(task, evaluation);
    }
    return [];
  }
}
