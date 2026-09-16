import { randomUUID } from "node:crypto";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "@monstro/core";

export function createTask(intent: string): MonstroTask {
  return {
    id: randomUUID(),
    intent,
    phase: "understand",
    context: { projectId: "cockpit", rootDir: ".", summary: "MONSTRO V0 mission", decisions: [] },
    requestedCapabilities: [],
    acceptance: [{ id: "runtime-ok", description: "Mission runtime must complete successfully", required: true }],
    iteration: 0,
    maxIterations: 2,
  };
}

export function createV0Services(): MonstroServices {
  return {
    inspector: { async inspect(task) { return [{ source: "intent", kind: "user", summary: task.intent }]; } },
    architect: { async plan(task, evidence) { return { taskId: task.id, rationale: `Plan derived from ${evidence.length} evidence item(s)`, steps: [{ id: "v0-build", title: "Build mission artifact", description: task.intent, status: "pending" }] }; } },
    builder: {
      async build() { return [{ path: "artifacts/mission.txt", operation: "create", content: "MONSTRO V0 mission artifact" }]; },
      async apply(task, patches) { task.context.decisions.push(`Applied ${patches.length} patch(es)`); },
    },
    runtime: { async run() { return { ok: true, previewUrl: "/", stdout: "V0 runtime executed", stderr: "", durationMs: 1 }; } },
    evaluator: { async evaluate(_task, runtime) { return { accepted: runtime.ok, score: runtime.ok ? 1 : 0, findings: runtime.ok ? [] : [runtime.stderr], nextActions: [] }; } },
    repairer: { async repair() { return []; } },
    exporter: { async deliver(task, runtime) { return { taskId: task.id, completedAt: new Date().toISOString(), summary: "V0 orchestrator mission completed", previewUrl: runtime.previewUrl, artifacts: ["artifacts/mission.txt"] }; } },
  };
}

export function createMission(intent: string) {
  const task = createTask(intent);
  const journal = new MissionJournal();
  const orchestrator = new MonstroOrchestrator(createV0Services(), journal);
  return { task, journal, orchestrator };
}
