import type { MissionExecutionState, MissionPipelinePhase } from "./mission-pipeline";

export type MissionOperationalView = {
  state: MissionExecutionState;
  phase?: MissionPipelinePhase;
  label: string;
};

export function deriveMissionOperationalView(
  phase: MissionPipelinePhase | undefined,
  state: MissionExecutionState,
): MissionOperationalView {
  return {
    state,
    phase,
    label: [state.toUpperCase(), phase?.toUpperCase()].filter(Boolean).join(" · "),
  };
}
