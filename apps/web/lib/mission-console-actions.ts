import type { MissionConsoleStatus } from "./mission-console-status";
import type { MissionConsoleView } from "./mission-console-view";

export type MissionConsoleActions = {
  canExecute: boolean;
  canRefreshHistory: boolean;
  canRestore: boolean;
  canResume: boolean;
  canRefreshPreview: boolean;
};

export type MissionConsoleActionContext = {
  intent: string;
  restoreId: string;
  status: MissionConsoleStatus;
  view: MissionConsoleView;
};

export function deriveMissionConsoleActions({ intent, restoreId, status, view }: MissionConsoleActionContext): MissionConsoleActions {
  const busy = status.operation !== "idle";
  return {
    canExecute: !busy && intent.trim().length > 0,
    canRefreshHistory: !busy,
    canRestore: !busy && restoreId.trim().length > 0,
    canResume: !busy && restoreId.trim().length > 0 && view.resume.available,
    canRefreshPreview: !busy && view.preview.available,
  };
}
