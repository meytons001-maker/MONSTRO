import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import {
  MonstroOrchestrator,
  PolicyAuthorizer,
  RuleBasedRepairer,
  RuntimeEvidenceEvaluator,
  createLocalExecutionAdapters,
} from "../src/index.js";

test("repairs a failing real artifact and succeeds on re-execution", async () => {
  const baseDir = await mkdtemp(join(tmpdir(), "monstro-repair-"));
  try {
    const adapters = createLocalExecutionAdapters({
      baseDir,
      projectId: "project",
      process: { command: "node", args: ["artifact.mjs"] },
      policy: { allowedCommands: ["node"] },
      build: () => [{
        path: "artifact.mjs",
        operation: "create",
        content: "throw new Error('BROKEN_ARTIFACT');",
      }],
    });

    const repairer = new RuleBasedRepairer([{
      id: "repair-broken-artifact",
      matches: (_task, evaluation) => evaluation.findings.some((finding) => finding.includes("BROKEN_ARTIFACT")),
      patches: () => [{
        path: "artifact.mjs",
        operation: "update",
        content: "console.log('MONSTRO_REPAIRED');",
      }],
    }]);

    const mission: MonstroTask = {
      id: "repair-loop-1",
      intent: "build and repair a runnable artifact",
      phase: "understand",
      context: { projectId: "project", rootDir: ".", summary: "repair integration", decisions: [] },
      requestedCapabilities: ["filesystem.read", "filesystem.write", "process.execute"],
      acceptance: [{ id: "runs", description: "artifact executes successfully", required: true }],
      iteration: 0,
      maxIterations: 2,
    };

    const orchestrator = new MonstroOrchestrator({
      authorizer: new PolicyAuthorizer(),
      inspector: { inspect: async () => [] },
      architect: { plan: async (task) => ({ taskId: task.id, rationale: "integration", steps: [] }) },
      builder: adapters.builder,
      runtime: adapters.runtime,
      evaluator: new RuntimeEvidenceEvaluator(),
      repairer,
      exporter: {
        deliver: async (task, runtime) => ({
          taskId: task.id,
          completedAt: "2026-09-27T00:00:00Z",
          summary: runtime.stdout.trim(),
          artifacts: ["artifact.mjs"],
        }),
      },
    });

    const delivery = await orchestrator.execute(mission);
    assert.equal(delivery.summary, "MONSTRO_REPAIRED");
    assert.equal(mission.phase, "deliver");
    assert.equal(mission.iteration, 2);
    assert.match(await adapters.workspace.read("artifact.mjs"), /MONSTRO_REPAIRED/);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});

test("does not invent a repair when no authorized rule matches", async () => {
  const repairer = new RuleBasedRepairer([]);
  const patches = await repairer.repair({
    id: "no-rule",
    intent: "do not guess",
    phase: "repair",
    context: { projectId: "project", rootDir: ".", summary: "", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 1,
    maxIterations: 1,
  }, {
    accepted: false,
    score: 0,
    findings: ["Unknown failure"],
    nextActions: ["Inspect failure"],
  });
  assert.deepEqual(patches, []);
});
