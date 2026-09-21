import type { MissionConsoleLifecycle } from "./mission-console-lifecycle";
import { missionConsoleOperationLabel } from "./mission-console-lifecycle";
import type { MissionConsoleView } from "./mission-console-view";

export type MissionConsoleStatus = {
  label: string;
  operation: MissionConsoleLifecycle["operation"];
  executionState: MissionConsoleView["operational"]["state"];
  phase: MissionConsoleView["operational"]["phase"];
  failure: string | null;
};

export function deriveMissionConsoleStatus(
  lifecycle: MissionConsoleLifecycle,
  view: MissionConsoleView,
): MissionConsoleStatus {
  const operationLabel = missionConsoleOperationLabel(lifecycle);
  const missionLabel = view.operational.label;
  const label = lifecycle.operation === "idle" ? missionLabel : `${operationLabel} · ${missionLabel || "WAITING"}`;

  return {
    label,
    operation: lifecycle.operation,
    executionState: view.operational.state,
    phase: view.operational.phase,
    failure: lifecycle.failure,
  };
}
