import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask, MissionTraceProgress } from "@monstro/contracts";
import { InMemoryMissionJournalStore, MissionJournal, replayMissionTraceProgress } from "./index.js";

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
