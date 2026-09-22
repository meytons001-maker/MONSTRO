import { missionPipeline, type MissionExecutionState, type MissionPipelinePhase } from "./mission-pipeline";

export type MissionPipelineItemStatus = "done" | "running" | "pending";

export type MissionPipelineItem = {
  phase: MissionPipelinePhase;
  ordinal: number;
  status: MissionPipelineItemStatus;
};

export function deriveMissionPipelineView(
  activePhase: MissionPipelinePhase | undefined,
  executionState: MissionExecutionState,
): MissionPipelineItem[] {
  const activeIndex = activePhase ? missionPipeline.indexOf(activePhase) : -1;

  return missionPipeline.map((phase, index) => ({
    phase,
    ordinal: index + 1,
    status: executionState === "completed"
      ? "done"
      : index < activeIndex
        ? "done"
        : index === activeIndex
          ? "running"
          : "pending",
  }));
}
