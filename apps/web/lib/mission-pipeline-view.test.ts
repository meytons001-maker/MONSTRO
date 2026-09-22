import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionPipelineView } from "./mission-pipeline-view.ts";

test("projects done, running and pending phases from the active phase", () => {
  const pipeline = deriveMissionPipelineView("build", "running");
  assert.deepEqual(pipeline.map(({ phase, status }) => [phase, status]), [
    ["understand", "done"],
    ["inspect", "done"],
    ["plan", "done"],
    ["build", "running"],
    ["run", "pending"],
    ["observe", "pending"],
    ["evaluate", "pending"],
    ["repair", "pending"],
    ["deliver", "pending"],
  ]);
  assert.equal(pipeline[3]?.ordinal, 4);
});

test("marks the full pipeline done after mission completion", () => {
  const pipeline = deriveMissionPipelineView("deliver", "completed");
  assert.ok(pipeline.every((item) => item.status === "done"));
});

test("keeps the pipeline pending before a mission has an active phase", () => {
  const pipeline = deriveMissionPipelineView(undefined, "idle");
  assert.ok(pipeline.every((item) => item.status === "pending"));
});
