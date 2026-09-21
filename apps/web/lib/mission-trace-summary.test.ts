import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionTraceSummary, type MissionProgress } from "./mission-trace-summary.ts";

const progress: MissionProgress = {
  build: [
    { path: "src/app.ts", requirementIds: ["req-1", "req-2"] },
    { path: "src/view.ts", requirementIds: ["req-2"] },
  ],
  repairs: [{ path: "src/view.ts" }],
  evaluations: [{ score: 0.82, accepted: false, requirementIds: ["req-2", "req-3"], findingCodes: ["contrast", "layout"] }],
};

test("projects build, evaluation, repair and requirement trace metrics", () => {
  const summary = deriveMissionTraceSummary(progress);
  assert.deepEqual(summary?.metrics, [
    { key: "build", label: "BUILD", value: "2", detail: "src/view.ts" },
    { key: "evaluate", label: "EVALUATE", value: "0.82", detail: "REVIEW" },
    { key: "repair", label: "REPAIR", value: "1", detail: "src/view.ts" },
    { key: "requirements", label: "REQUIREMENTS", value: "3", detail: "contrast, layout" },
  ]);
});

test("projects stable waiting defaults for empty progress", () => {
  const summary = deriveMissionTraceSummary({ build: [], repairs: [], evaluations: [] });
  assert.deepEqual(summary?.metrics, [
    { key: "build", label: "BUILD", value: "0", detail: "—" },
    { key: "evaluate", label: "EVALUATE", value: "—", detail: "WAITING" },
    { key: "repair", label: "REPAIR", value: "0", detail: "—" },
    { key: "requirements", label: "REQUIREMENTS", value: "0", detail: "TRACKED" },
  ]);
  assert.equal(deriveMissionTraceSummary(undefined), undefined);
});
