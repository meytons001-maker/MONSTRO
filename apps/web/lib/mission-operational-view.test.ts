import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionOperationalView } from "./mission-operational-view.ts";

test("projects running phase into a presentation-safe operational state", () => {
  assert.deepEqual(deriveMissionOperationalView("evaluate", "running"), {
    state: "running",
    phase: "evaluate",
    label: "RUNNING · EVALUATE",
  });
});

test("projects terminal and idle states without inventing phases", () => {
  assert.deepEqual(deriveMissionOperationalView("deliver", "completed"), {
    state: "completed",
    phase: "deliver",
    label: "COMPLETED · DELIVER",
  });
  assert.deepEqual(deriveMissionOperationalView(undefined, "idle"), {
    state: "idle",
    phase: undefined,
    label: "IDLE",
  });
});
