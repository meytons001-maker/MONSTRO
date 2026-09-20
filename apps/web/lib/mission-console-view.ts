import type { MissionTransportEvent } from "@monstro/contracts";
import type { MissionDetail } from "./mission-detail";
import { formatMissionResumeAction } from "./mission-detail";
import type { MissionHistoryItem } from "./mission-history";

export const missionPipeline = ["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver"] as const;
export type MissionPipelinePhase = (typeof missionPipeline)[number];
export type MissionExecutionState = "idle" | "running" | "completed" | "failed";

export type MissionConsoleView = {
  activeIndex: number;
  activePhase?: MissionPipelinePhase;
  executionState: MissionExecutionState;
  previewUrl?: string;
  progress?: NonNullable<MissionTransportEvent["data"]>["progress"];
  selectedMission?: MissionHistoryItem;
  resumeLabel: string;
  resumeReason?: string;
  canResume: boolean;
};

function deriveExecutionState(latest: MissionTransportEvent | undefined): MissionExecutionState {
  if (!latest) return "idle";
  if (latest.type === "mission.completed") return "completed";
  if (latest.type === "mission.failed" || latest.phase === "failed") return "failed";
  return "running";
}

export function deriveMissionConsoleView(input: {
  events: MissionTransportEvent[];
  history: MissionHistoryItem[];
  restoreId: string;
  missionDetail: MissionDetail | null;
}): MissionConsoleView {
  const latest = input.events.at(-1);
  const pipelineIndex = latest ? missionPipeline.indexOf(latest.phase as MissionPipelinePhase) : -1;
  const activeIndex = pipelineIndex >= 0 ? pipelineIndex : -1;
  const activePhase = activeIndex >= 0 ? missionPipeline[activeIndex] : undefined;
  const previewUrl = [...input.events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;
  const progress = [...input.events].reverse().find((event) => event.type === "trace.updated" && event.data?.progress)?.data?.progress;
  const selectedMission = input.history.find((mission) => mission.taskId === input.restoreId);
  const selectedResume = input.missionDetail?.taskId === input.restoreId ? input.missionDetail.effectiveResume : undefined;
  const resumeLabel = selectedResume ? formatMissionResumeAction(selectedResume) : selectedMission ? formatMissionResumeAction(selectedMission) : "READ ONLY";

  return {
    activeIndex,
    activePhase,
    executionState: deriveExecutionState(latest),
    previewUrl,
    progress,
    selectedMission,
    resumeLabel,
    resumeReason: selectedResume?.reason ?? selectedMission?.resumeReason,
    canResume: selectedResume?.resumable ?? selectedMission?.resumable ?? false,
  };
}
