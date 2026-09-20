import type { MissionTransportEvent } from "@monstro/contracts";
import type { MissionDetail } from "./mission-detail";
import { formatMissionResumeAction } from "./mission-detail";
import type { MissionHistoryItem } from "./mission-history";

export const missionPipeline = ["understand", "inspect", "plan", "build", "run", "observe", "evaluate", "repair", "deliver"] as const;

export type MissionConsoleView = {
  activeIndex: number;
  previewUrl?: string;
  progress?: NonNullable<MissionTransportEvent["data"]>["progress"];
  selectedMission?: MissionHistoryItem;
  resumeLabel: string;
  resumeReason?: string;
  canResume: boolean;
};

export function deriveMissionConsoleView(input: {
  events: MissionTransportEvent[];
  history: MissionHistoryItem[];
  restoreId: string;
  missionDetail: MissionDetail | null;
}): MissionConsoleView {
  const latest = input.events.at(-1);
  const activeIndex = latest ? missionPipeline.indexOf(latest.phase as (typeof missionPipeline)[number]) : -1;
  const previewUrl = [...input.events].reverse().find((event) => event.data?.previewUrl)?.data?.previewUrl;
  const progress = [...input.events].reverse().find((event) => event.type === "trace.updated" && event.data?.progress)?.data?.progress;
  const selectedMission = input.history.find((mission) => mission.taskId === input.restoreId);
  const selectedResume = input.missionDetail?.taskId === input.restoreId ? input.missionDetail.effectiveResume : undefined;
  const resumeLabel = selectedResume ? formatMissionResumeAction(selectedResume) : selectedMission ? formatMissionResumeAction(selectedMission) : "READ ONLY";

  return {
    activeIndex,
    previewUrl,
    progress,
    selectedMission,
    resumeLabel,
    resumeReason: selectedResume?.reason ?? selectedMission?.resumeReason,
    canResume: selectedResume?.resumable ?? selectedMission?.resumable ?? false,
  };
}
