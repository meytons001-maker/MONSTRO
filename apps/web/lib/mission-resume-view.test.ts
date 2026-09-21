import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionResumeView } from "./mission-resume-view.ts";

test("projects a resumable checkpoint", () => {
  assert.deepEqual(
    deriveMissionResumeView({ resumable: true, restartPhase: "run", reason: "confirmed build checkpoint" }),
    { available: true, label: "RESUME RUN", reason: "confirmed build checkpoint" },
  );
});

test("projects degraded checkpoints as rebuild actions", () => {
  assert.deepEqual(
    deriveMissionResumeView({ resumable: true, restartPhase: "inspect", degraded: true, reason: "workspace missing" }),
    { available: true, label: "REBUILD FROM INSPECT", reason: "workspace missing" },
  );
});

test("projects missing and non-resumable checkpoints as read only", () => {
  assert.deepEqual(deriveMissionResumeView(undefined), { available: false, label: "READ ONLY" });
  assert.deepEqual(
    deriveMissionResumeView({ resumable: false, restartPhase: null, reason: "mission completed" }),
    { available: false, label: "READ ONLY", reason: "mission completed" },
  );
});
