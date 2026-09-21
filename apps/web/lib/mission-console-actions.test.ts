import assert from "node:assert/strict";
import test from "node:test";
import { deriveMissionConsoleActions } from "./mission-console-actions.ts";
import type { MissionConsoleStatus } from "./mission-console-status.ts";
import type { MissionConsoleView } from "./mission-console-view.ts";

const status = (operation: MissionConsoleStatus["operation"] = "idle"): MissionConsoleStatus => ({
  label: operation === "idle" ? "IDLE" : operation.toUpperCase(),
  operation,
  executionState: "idle",
  phase: undefined,
  failure: null,
});

const view = (overrides: Partial<MissionConsoleView> = {}): MissionConsoleView => ({
  activeIndex: -1,
  executionState: "idle",
  evidence: [],
  resumeLabel: "READ ONLY",
  canResume: false,
  ...overrides,
});

test("idle cockpit enables actions only when their prerequisites exist", () => {
  const actions = deriveMissionConsoleActions({ intent: " build ", restoreId: "mission-1", status: status(), view: view({ canResume: true, previewUrl: "/preview" }) });
  assert.deepEqual(actions, { canExecute: true, canRefreshHistory: true, canRestore: true, canResume: true, canRefreshPreview: true });
});

test("active transport operation locks conflicting cockpit actions", () => {
  const actions = deriveMissionConsoleActions({ intent: "build", restoreId: "mission-1", status: status("resuming"), view: view({ canResume: true, previewUrl: "/preview" }) });
  assert.deepEqual(actions, { canExecute: false, canRefreshHistory: false, canRestore: false, canResume: false, canRefreshPreview: false });
});

test("missing intent or mission selection disables dependent actions", () => {
  const actions = deriveMissionConsoleActions({ intent: "   ", restoreId: "", status: status(), view: view({ canResume: true }) });
  assert.equal(actions.canExecute, false);
  assert.equal(actions.canRestore, false);
  assert.equal(actions.canResume, false);
  assert.equal(actions.canRefreshHistory, true);
});
