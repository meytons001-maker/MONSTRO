import assert from "node:assert/strict";
import test from "node:test";
import type { BuildPlan, MonstroTask, TaskPhase } from "@monstro/contracts";
import { MissionJournal, type MissionEvent } from "./mission.js";
import { planMissionResume, replayMissionBuildPlan, replayMissionTask } from "./task-replay.js";

function task(): MonstroTask {
  return { id: "resume-1", intent: "resume me", phase: "understand", context: { projectId: "resume-1", rootDir: ".", summary: "fixture", decisions: [] }, requestedCapabilities: [], acceptance: [], iteration: 0, maxIterations: 2 };
}

function checkpoint(phase: TaskPhase, id = 1): MissionEvent {
  const current = task();
  current.phase = phase;
  return { id: `resume-1:${id}`, taskId: current.id, phase, type: "phase.changed", timestamp: new Date().toISOString(), data: { task: current } };
}

function event(type: MissionEvent["type"], phase: TaskPhase, id: number): MissionEvent {
  return { id: `resume-1:${id}`, taskId: "resume-1", phase, type, timestamp: new Date().toISOString() };
}

function plan(): BuildPlan {
  return { taskId: "resume-1", rationale: "durable resume fixture", requirements: [{ id: "req", description: "required output", source: "acceptance", required: true }], steps: [{ id: "build", title: "Build", description: "apply output", status: "pending" }] };
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

test("replays the durable build plan needed by a resumed delivery", () => {
  const durablePlan = plan();
  const events: MissionEvent[] = [{ ...event("build.applied", "build", 2), data: { plan: durablePlan } }];
  const restored = replayMissionBuildPlan(events);
  assert.deepEqual(restored, durablePlan);
  restored!.steps[0]!.title = "mutated";
  assert.equal(replayMissionBuildPlan(events)?.steps[0]?.title, "Build");
});

test("build-plan replay rejects malformed and cross-mission payloads", () => {
  assert.throws(() => replayMissionBuildPlan([{ ...event("build.applied", "build", 2), data: { plan: { nope: true } } }]), /Invalid build plan/);
  assert.throws(() => replayMissionBuildPlan([{ ...event("build.applied", "build", 2), data: { plan: { ...plan(), taskId: "other" } } }]), /different mission/);
});

test("returns undefined for journals created before task checkpoints", () => {
  assert.equal(replayMissionTask([]), undefined);
  assert.equal(replayMissionBuildPlan([]), undefined);
});

test("rejects malformed or cross-mission checkpoints", () => {
  const base = { id: "resume-1:1", taskId: "resume-1", phase: "run" as const, type: "phase.changed" as const, timestamp: new Date().toISOString() };
  assert.throws(() => replayMissionTask([{ ...base, data: { task: { nope: true } } }]), /Invalid task checkpoint/);
  assert.throws(() => replayMissionTask([{ ...base, data: { task: { ...task(), id: "other" } }]), /different mission/);
});

test("resume policy refuses completed or legacy missions", () => {
  assert.equal(planMissionResume([]).resumable, false);
  assert.equal(planMissionResume([checkpoint("deliver"), event("mission.completed", "deliver", 2)]).resumable, false);
});

test("resume policy continues from run only after build side effects are durably confirmed", () => {
  const confirmed = planMissionResume([checkpoint("build"), event("build.applied", "build", 2)]);
  assert.equal(confirmed.restartPhase, "run");
  assert.equal(confirmed.task?.id, "resume-1");

  const ambiguous = planMissionResume([checkpoint("build")]);
  assert.equal(ambiguous.restartPhase, "inspect");
  assert.match(ambiguous.reason, /ambiguous/);
});

test("resume policy does not repeat an ambiguous repair", () => {
  assert.equal(planMissionResume([checkpoint("repair")]).restartPhase, "inspect");
  assert.equal(planMissionResume([checkpoint("repair"), event("repair.completed", "repair", 2)]).restartPhase, "run");
});

test("resume policy regenerates transient runtime phases and reinspects planning phases", () => {
  for (const phase of ["run", "observe", "evaluate", "deliver"] as const) assert.equal(planMissionResume([checkpoint(phase)]).restartPhase, "run");
  for (const phase of ["understand", "inspect", "plan"] as const) assert.equal(planMissionResume([checkpoint(phase)]).restartPhase, "inspect");
});
