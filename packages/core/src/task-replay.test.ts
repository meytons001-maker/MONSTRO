import assert from "node:assert/strict";
import test from "node:test";
import type { MonstroTask } from "@monstro/contracts";
import { MissionJournal } from "./mission.js";
import { replayMissionTask } from "./task-replay.js";

function task(): MonstroTask {
  return { id: "resume-1", intent: "resume me", phase: "understand", context: { projectId: "resume-1", rootDir: ".", summary: "fixture", decisions: [] }, requestedCapabilities: [], acceptance: [], iteration: 0, maxIterations: 2 };
}

test("replays the latest task checkpoint without exposing journal state to mutation", async () => {
  const current = task();
  const journal = new MissionJournal();
  current.phase = "build";
  await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });
  current.iteration = 1;
  current.phase = "run";
  await journal.record(current, "phase.changed", undefined, { task: structuredClone(current) });

  const restored = replayMissionTask(journal.snapshot());
  assert.equal(restored?.phase, "run");
  assert.equal(restored?.iteration, 1);
  restored!.context.summary = "mutated";
  assert.equal(replayMissionTask(journal.snapshot())?.context.summary, "fixture");
});

test("returns undefined for journals created before task checkpoints", () => {
  assert.equal(replayMissionTask([]), undefined);
});

test("rejects malformed or cross-mission checkpoints", () => {
  const base = { id: "resume-1:1", taskId: "resume-1", phase: "run" as const, type: "phase.changed" as const, timestamp: new Date().toISOString() };
  assert.throws(() => replayMissionTask([{ ...base, data: { task: { nope: true } } }]), /Invalid task checkpoint/);
  assert.throws(() => replayMissionTask([{ ...base, data: { task: { ...task(), id: "other" } } }]), /different mission/);
});
