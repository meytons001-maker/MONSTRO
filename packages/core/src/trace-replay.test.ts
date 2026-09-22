import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask, MissionTraceProgress } from "@monstro/contracts";
import { InMemoryMissionJournalStore, MissionJournal, MissionTraceCollector, replayMissionTraceProgress, replayMissionTraceSnapshot } from "./index.js";

function task(): MonstroTask {
  return {
    id: "trace-replay",
    intent: "resume mission trace",
    phase: "build",
    context: { projectId: "trace-replay", rootDir: ".", summary: "trace replay fixture", decisions: [] },
    requestedCapabilities: [],
    acceptance: [],
    iteration: 0,
    maxIterations: 2,
  };
}

const first: MissionTraceProgress = {
  build: [{ path: "index.html", operation: "create", requirementIds: ["r1"] }],
  repairs: [],
  evaluations: [],
};

const second: MissionTraceProgress = {
  build: [{ path: "index.html", operation: "create", requirementIds: ["r1"] }],
  repairs: [{ path: "index.html", operation: "update", requirementIds: ["r1"] }],
  evaluations: [{ iteration: 1, accepted: false, score: 0.5, requirementIds: ["r1"], findingCodes: ["title"], repairActionIds: ["fix-title"] }],
};

test("trace progress is reconstructed from a persisted journal after restart", async () => {
  const store = new InMemoryMissionJournalStore();
  const journal = new MissionJournal(store);
  const mission = task();
  await journal.record(mission, "trace.updated", "initial build traced", { progress: first });
  mission.phase = "repair";
  await journal.record(mission, "trace.updated", "repair traced", { progress: second });

  const replayed = await MissionJournal.replay(mission.id, store);
  const progress = replayMissionTraceProgress(replayed.snapshot());
  assert.deepEqual(progress, second);

  progress.build[0]?.requirementIds.push("mutated");
  assert.deepEqual(replayMissionTraceProgress(replayed.snapshot()), second);
});

test("full trace snapshot can hydrate a collector after restart", async () => {
  const store = new InMemoryMissionJournalStore();
  const journal = new MissionJournal(store);
  const mission = task();
  const trace = new MissionTraceCollector();
  trace.recordBuild([{ path: "index.html", operation: "create", content: "<h1>MONSTRO</h1>", requirementIds: ["r1"] }]);
  trace.recordEvaluation(1, {
    accepted: false,
    score: 0.5,
    findings: [{ code: "document.title", message: "title missing", severity: "error", evidenceSource: "dom", requirementIds: ["r1"] }],
    nextActions: [{ id: "fix-title", findingCode: "document.title", description: "add title", requirementIds: ["r1"] }],
    evidenceTrace: [{ requirementId: "r1", evidenceSources: ["dom"] }],
  });
  await journal.record(mission, "trace.updated", "evaluation traced", { progress: trace.progress(), snapshot: trace.snapshot() });

  const replayed = await MissionJournal.replay(mission.id, store);
  const snapshot = replayMissionTraceSnapshot(replayed.snapshot());
  assert.ok(snapshot);
  const hydrated = MissionTraceCollector.hydrate(snapshot);
  assert.deepEqual(hydrated.snapshot(), trace.snapshot());

  snapshot.buildPatches[0]?.requirementIds?.push("mutated");
  assert.deepEqual(hydrated.snapshot(), trace.snapshot());
});

test("trace snapshot replay stays compatible with journals that only contain progress", () => {
  assert.equal(replayMissionTraceSnapshot([{
    id: "trace-replay:1", taskId: "trace-replay", phase: "build", type: "trace.updated", timestamp: "2026-09-19T12:00:00.000Z", data: { progress: first },
  }]), undefined);
});

test("trace snapshot replay rejects malformed persisted snapshots", () => {
  assert.throws(() => replayMissionTraceSnapshot([{
    id: "trace-replay:1", taskId: "trace-replay", phase: "evaluate", type: "trace.updated", timestamp: "2026-09-19T12:00:00.000Z", data: { progress: first, snapshot: { buildPatches: "invalid", repairPatches: [], evaluations: [] } },
  }]), /Invalid trace snapshot/);
});

test("trace replay returns empty progress before the first trace event", () => {
  assert.deepEqual(replayMissionTraceProgress([]), { build: [], repairs: [], evaluations: [] });
});

test("trace replay rejects malformed persisted progress", () => {
  assert.throws(() => replayMissionTraceProgress([{
    id: "trace-replay:1",
    taskId: "trace-replay",
    phase: "evaluate",
    type: "trace.updated",
    timestamp: "2026-09-19T12:00:00.000Z",
    data: { progress: { build: "invalid", repairs: [], evaluations: [] } },
  }]), /Invalid trace progress/);
});
