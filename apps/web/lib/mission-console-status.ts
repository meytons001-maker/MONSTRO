import type { MissionConsoleLifecycle } from "./mission-console-lifecycle";
import { missionConsoleOperationLabel } from "./mission-console-lifecycle";
import type { MissionConsoleView } from "./mission-console-view";

export type MissionConsoleStatus = {
  label: string;
  operation: MissionConsoleLifecycle["operation"];
  executionState: MissionConsoleView["executionState"];
  phase: MissionConsoleView["activePhase"];
  failure: string | null;
};

export function deriveMissionConsoleStatus(
  lifecycle: MissionConsoleLifecycle,
  view: MissionConsoleView,
): MissionConsoleStatus {
  const operationLabel = missionConsoleOperationLabel(lifecycle);
  const missionLabel = [view.executionState.toUpperCase(), view.activePhase?.toUpperCase()].filter(Boolean).join(" · ");
  const label = lifecycle.operation === "idle" ? missionLabel : `${operationLabel} · ${missionLabel || "WAITING"}`;

  return {
    label,
    operation: lifecycle.operation,
    executionState: view.executionState,
    phase: view.activePhase,
    failure: lifecycle.failure,
  };
}
