import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { MonstroTask } from "@monstro/contracts";
import {
  MonstroOrchestrator,
  PolicyAuthorizer,
  RuleBasedRepairer,
  RuntimeEvidenceEvaluator,
  createLocalExecutionAdapters,
} from "@monstro/core";

export interface AlphaMissionResult {
  taskId: string;
  phase: MonstroTask["phase"];
  iteration: number;
  summary: string;
  artifact: string;
}

export async function executeAlphaMission(intent: string): Promise<AlphaMissionResult> {
  const normalizedIntent = intent.trim();
  if (!normalizedIntent) throw new Error("Mission intent is required.");
  if (normalizedIntent.length > 2_000) throw new Error("Mission intent exceeds 2000 characters.");

  const baseDir = await mkdtemp(join(tmpdir(), "monstro-alpha-"));
  const projectId = "alpha";
  try {
    const safeIntent = JSON.stringify(normalizedIntent);
    const adapters = createLocalExecutionAdapters({
      baseDir,
      projectId,
      process: { command: "node", args: ["mission.mjs"], timeoutMs: 2_000 },
      policy: { allowedCommands: ["node"], maxTimeoutMs: 2_000, maxOutputBytes: 32 * 1024 },
      build: () => [{
        path: "mission.mjs",
        operation: "create",
        content: `const intent = ${safeIntent};\nconsole.log("MONSTRO_ALPHA:" + intent);\n`,
      }],
    });

    const task: MonstroTask = {
      id: `alpha-${Date.now()}`,
      intent: normalizedIntent,
      phase: "understand",
      context: { projectId, rootDir: ".", summary: "Browser Alpha mission", decisions: [] },
      requestedCapabilities: ["filesystem.write", "process.execute"],
      acceptance: [{ id: "runs", description: "Generated Alpha artifact executes successfully", required: true }],
      iteration: 0,
      maxIterations: 1,
    };

    const orchestrator = new MonstroOrchestrator({
      authorizer: new PolicyAuthorizer(),
      inspector: { inspect: async () => [] },
      architect: { plan: async (mission) => ({ taskId: mission.id, rationale: "Alpha bounded execution", steps: [] }) },
      builder: adapters.builder,
      runtime: adapters.runtime,
      evaluator: new RuntimeEvidenceEvaluator({ maxDurationMs: 2_000, rejectStderr: true }),
      repairer: new RuleBasedRepairer([]),
      exporter: {
        deliver: async (mission, runtime) => ({
          taskId: mission.id,
          completedAt: new Date().toISOString(),
          summary: runtime.stdout.trim(),
          artifacts: ["mission.mjs"],
        }),
      },
    });

    const delivery = await orchestrator.execute(task);
    return {
      taskId: delivery.taskId,
      phase: task.phase,
      iteration: task.iteration,
      summary: delivery.summary,
      artifact: await adapters.workspace.read("mission.mjs"),
    };
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
}
