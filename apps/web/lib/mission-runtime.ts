import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal, MonstroOrchestrator, type MonstroServices } from "@monstro/core";
import { LocalSandboxRuntime, ProjectWorkspace } from "@monstro/runtime";

export function createTask(intent: string): MonstroTask {
  const id = randomUUID();
  return {
    id,
    intent,
    phase: "understand",
    context: { projectId: id, rootDir: join(tmpdir(), "monstro-workspaces"), summary: "MONSTRO V0 mission", decisions: [] },
    requestedCapabilities: ["filesystem.read", "filesystem.write", "process.execute"],
    acceptance: [{ id: "runtime-ok", description: "Mission runtime must complete successfully", required: true }],
    iteration: 0,
    maxIterations: 2,
  };
}

export function createV0Services(task: MonstroTask): MonstroServices {
  const workspace = new ProjectWorkspace(task.context.rootDir, task.context.projectId);
  const sandbox = new LocalSandboxRuntime(workspace);
  return {
    inspector: { async inspect(current) { return [{ source: "intent", kind: "user", summary: current.intent }]; } },
    architect: { async plan(current, evidence) { return { taskId: current.id, rationale: `Plan derived from ${evidence.length} evidence item(s)`, steps: [{ id: "v0-build", title: "Build executable mission artifact", description: current.intent, status: "pending" }] }; } },
    builder: {
      async build(current) {
        const payload = JSON.stringify({ taskId: current.id, intent: current.intent });
        return [{ path: "mission.mjs", operation: "create", content: `const mission = ${payload};\nconsole.log(JSON.stringify({ ok: true, engine: 'MONSTRO', mission }));\n` }];
      },
      async apply(current, patches) { await workspace.apply(patches); current.context.decisions.push(`Applied ${patches.length} patch(es) to isolated workspace`); },
    },
    runtime: { async run() { return sandbox.run({ command: "node", args: ["mission.mjs"], timeoutMs: 5_000 }); } },
    evaluator: { async evaluate(_current, runtime) { const accepted = runtime.ok && runtime.stdout.includes('"engine":"MONSTRO"'); return { accepted, score: accepted ? 1 : 0, findings: accepted ? [] : [runtime.stderr || "Runtime output did not satisfy MONSTRO marker"], nextActions: accepted ? [] : ["Repair executable artifact"] }; } },
    repairer: { async repair() { return []; } },
    exporter: { async deliver(current, runtime) { return { taskId: current.id, completedAt: new Date().toISOString(), summary: "Executable MONSTRO mission completed in isolated workspace", previewUrl: runtime.previewUrl, artifacts: ["mission.mjs"] }; } },
  };
}

export function createMission(intent: string) {
  const task = createTask(intent);
  const journal = new MissionJournal();
  const orchestrator = new MonstroOrchestrator(createV0Services(task), journal);
  return { task, journal, orchestrator };
}
