import assert from "node:assert/strict";
import test from "node:test";
import {
  beginMissionConsoleOperation,
  completeMissionConsoleOperation,
  failMissionConsoleOperation,
  initialMissionConsoleLifecycle,
  isMissionConsoleBusy,
  missionConsoleOperationLabel,
} from "./mission-console-lifecycle.ts";

test("models explicit cockpit transport operations", () => {
  for (const operation of ["executing", "restoring", "resuming"] as const) {
    const lifecycle = beginMissionConsoleOperation(operation);
    assert.equal(lifecycle.operation, operation);
    assert.equal(lifecycle.failure, null);
    assert.equal(isMissionConsoleBusy(lifecycle), true);
    assert.equal(missionConsoleOperationLabel(lifecycle), operation.toUpperCase());
  }
});

test("completion returns cockpit to idle", () => {
  assert.deepEqual(completeMissionConsoleOperation(), initialMissionConsoleLifecycle);
  assert.equal(isMissionConsoleBusy(initialMissionConsoleLifecycle), false);
  assert.equal(missionConsoleOperationLabel(initialMissionConsoleLifecycle), "IDLE");
});

test("failure is preserved while releasing the busy state", () => {
  const lifecycle = failMissionConsoleOperation("transport unavailable");
  assert.equal(lifecycle.operation, "idle");
  assert.equal(lifecycle.failure, "transport unavailable");
  assert.equal(isMissionConsoleBusy(lifecycle), false);
});
