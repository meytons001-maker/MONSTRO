export type MissionConsoleOperation = "idle" | "executing" | "restoring" | "resuming";

export type MissionConsoleLifecycle = {
  operation: MissionConsoleOperation;
  failure: string | null;
};

export const initialMissionConsoleLifecycle: MissionConsoleLifecycle = {
  operation: "idle",
  failure: null,
};

export function beginMissionConsoleOperation(operation: Exclude<MissionConsoleOperation, "idle">): MissionConsoleLifecycle {
  return { operation, failure: null };
}

export function completeMissionConsoleOperation(): MissionConsoleLifecycle {
  return initialMissionConsoleLifecycle;
}

export function failMissionConsoleOperation(detail: string): MissionConsoleLifecycle {
  return { operation: "idle", failure: detail };
}

export function isMissionConsoleBusy(lifecycle: MissionConsoleLifecycle): boolean {
  return lifecycle.operation !== "idle";
}

export function missionConsoleOperationLabel(lifecycle: MissionConsoleLifecycle): string {
  switch (lifecycle.operation) {
    case "executing": return "EXECUTING";
    case "restoring": return "RESTORING";
    case "resuming": return "RESUMING";
    default: return "IDLE";
  }
}
