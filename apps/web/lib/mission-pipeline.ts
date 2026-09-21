export const missionPipeline = ["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver"] as const;

export type MissionPipelinePhase = (typeof missionPipeline)[number];
export type MissionExecutionState = "idle" | "running" | "completed" | "failed";
